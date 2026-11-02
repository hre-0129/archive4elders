'use client';
// 어르신 화면. 화면은 하나이고, 몽실이가 '장면(scene)'을 하나씩 바꿔 가며 말을 건다.
// 들어오면: 인사 → 오늘 할 일 하나씩 → 새 가족 답장 → 사진 이야기 → 쉬기(idle)
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, signedUrls, today, koreanDate } from '@/lib/supabase';
import { useMember } from '@/lib/useMember';
import Icon from '@/components/Icon';
import Mascot from '@/components/Mascot';
import { talkNode } from './talk';

const callName = (n = '') => (n.length === 3 ? n.slice(1) : n); // 김순자 → 순자

function speakOut(text, on) {
  if (!on) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR'; u.rate = 0.85; u.volume = 1;
    speechSynthesis.speak(u);
  } catch {}
}

function dateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return koreanDate(new Date(Date.UTC(y, m - 1, d, 3)));
}

async function loadAll(fid) {
  const [tasks, photos, notes, stories, replies, skipped] = await Promise.all([
    supabase.from('tasks').select('*').eq('family_id', fid).order('created_at'),
    supabase.from('photos').select('*').eq('family_id', fid).order('created_at', { ascending: false }),
    supabase.from('photo_notes').select('*').order('created_at'),
    supabase.from('stories').select('*').eq('family_id', fid).order('created_at', { ascending: false }),
    supabase.from('replies').select('*').order('created_at'),
    supabase.from('skipped_topics').select('*').eq('family_id', fid)
  ]);
  const d = {
    tasks: tasks.data || [], photos: photos.data || [], notes: notes.data || [],
    stories: stories.data || [], replies: replies.data || [], skipped: (skipped.data || []).map((s) => s.topic)
  };
  d.urls = await signedUrls([...d.photos.map((p) => p.storage_path), ...d.replies.map((r) => r.photo_path)]);
  return d;
}

// 다음에 이야기할 사진: AI 사용 허락, 아직 이야기책에 없음, 건너뛴 적 없음
function nextPhoto(d) {
  return d.photos.find((p) => p.ai_allowed && !d.stories.some((s) => s.photo_id === p.id) && !d.skipped.includes(p.title));
}

// 서버(/api/talk)에 몽실이의 다음 질문을 요청
async function fetchTurn(photoId, history) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/talk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ photoId, history })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body;
}

export default function ElderPage() {
  const router = useRouter();
  const ctx = useMember();
  const [d, setD] = useState(null);
  const [scene, setScene] = useState(null);
  const [queue, setQueue] = useState([]);
  const [prefix, setPrefix] = useState('');
  const [sound, setSound] = useState(true);
  const talk = useRef({ utter: [], photo: null });
  const aiReq = useRef(0);      // 늦게 도착한 AI 응답을 버리기 위한 번호
  const aiOff = useRef(false);  // AI가 안 되면 이번 접속 동안은 각본 대화만 쓴다
  const prefetch = useRef(null); // { photoId, promise } 첫 AI 질문을 미리 받아 두는 곳
  const touched = useRef(false);
  const lastSay = useRef('');
  const pendingSpeak = useRef('');
  const t0 = today();

  // 말풍선이 바뀌면 (화면이 그려진 뒤) 소리 내어 읽는다. 첫 버튼을 누르기 전에는 브라우저가 소리를 막는다.
  useEffect(() => {
    const text = pendingSpeak.current;
    if (!text) return;
    pendingSpeak.current = '';
    if (touched.current) speakOut(text, sound);
  });

  const member = ctx.member;
  const fid = member?.family_id;
  const name = callName(member?.display_name);
  const who = useCallback((id) => ctx.members.find((m) => m.id === id), [ctx.members]);

  // ---------- 처음 불러오기 ----------
  useEffect(() => {
    if (ctx.loading) return;
    if (!ctx.user) { router.replace('/login'); return; }
    if (!member) { router.replace('/setup'); return; }
    if (member.role !== 'elder') { router.replace('/family'); return; }
    loadAll(fid).then((data) => {
      setD(data);
      const todo = data.tasks.filter((t) => (!t.due_date || t.due_date === t0) && t.done_on !== t0);
      const unseen = data.replies.filter((r) => !r.seen_by_elder);
      setQueue([
        ...todo.map((t) => ({ type: 'task', id: t.id })),
        ...unseen.map((r) => ({ type: 'reply', id: r.id })),
        { type: 'photoStart' }
      ]);
      setScene({ type: 'hello', hasTasks: todo.length > 0 });
      // 할 일을 확인하는 동안 첫 사진 질문을 미리 받아 둔다 (내 컴퓨터 AI는 사진 읽기가 느려서)
      const p = nextPhoto(data);
      if (p) {
        const promise = fetchTurn(p.id, []);
        promise.catch(() => {});
        prefetch.current = { photoId: p.id, promise };
      }
    });
  }, [ctx.loading, ctx.user, member, fid, router, t0]);

  // 쉬는 동안 1분마다 새 답장이 있는지 확인
  useEffect(() => {
    if (scene?.type !== 'idle' || !fid) return;
    const timer = setInterval(async () => {
      const { data } = await supabase.from('replies').select('*').eq('seen_by_elder', false);
      const fresh = (data || []).filter((r) => !d.replies.some((x) => x.id === r.id));
      if (!fresh.length) return;
      const urls = await signedUrls(fresh.map((r) => r.photo_path));
      setD((prev) => ({ ...prev, replies: [...prev.replies, ...fresh], urls: { ...prev.urls, ...urls } }));
      setQueue(fresh.slice(1).map((r) => ({ type: 'reply', id: r.id })));
      setPrefix('');
      setScene({ type: 'reply', id: fresh[0].id });
    }, 60000);
    return () => clearInterval(timer);
  }, [scene, fid, d]);

  // ---------- 장면 이동 ----------
  // 장면 바꾸기. AI가 아닌 곳에서 바꾸면 기다리던 AI 응답은 버린다.
  function show(next, pre = '', fromAi = false) {
    if (!fromAi) aiReq.current++;
    setPrefix(pre); setScene(next);
  }

  function advance(pre = '') {
    const [next, ...rest] = queue;
    setQueue(rest);
    if (!next) return show({ type: 'idle' }, pre);
    if (next.type === 'photoStart') return startTalk(pre);
    show(next, pre);
  }

  function startTalk(pre = '') {
    const photo = nextPhoto(d);
    talk.current = { utter: [], photo };
    if (!photo) return goTalk('mood', pre + '지금은 새로 볼 사진이 없어요. ');
    goTalk('start', pre);
  }

  function nodeOf(key) {
    const p = talk.current.photo;
    const up = p && who(p.uploaded_by);
    return talkNode(key, p, up && up.role !== 'elder' ? up.display_name : '', member.display_name);
  }

  // AI에게 다음 질문을 받아 온다. 실패하면 각본 대화로 이어 간다.
  async function aiTurn(history, pre = '') {
    const id = ++aiReq.current;
    show({ type: 'ai', loading: true, history }, pre, true);
    try {
      const photoId = talk.current.photo.id;
      // 첫 질문은 화면을 열 때 미리 요청해 둔 것이 있으면 그걸 쓴다
      const early = !history.length && prefetch.current?.photoId === photoId ? prefetch.current.promise : null;
      prefetch.current = null;
      const body = await (early || fetchTurn(photoId, history));
      if (id === aiReq.current) show({ type: 'ai', loading: false, history, turn: body }, '', true);
    } catch (e) {
      console.warn('몽실이 AI 대신 각본 대화로 이어 가요:', e.message);
      if (id !== aiReq.current) return;
      if (!history.length) { aiOff.current = true; goTalk('look', pre); }
      else goTalk('wrap', '');
    }
  }

  function goTalk(key, pre = '') {
    if (key === 'look' && !aiOff.current) return aiTurn([], pre);
    let n = nodeOf(key);
    while (n.topic && d.skipped.includes(n.topic) && n.skipNext) { key = n.skipNext; n = nodeOf(key); }
    if (key === 'wrap' && !talk.current.utter.length) key = 'bye';
    if (key === 'bye') return show({ type: 'idle' }, pre || '이야기해 주셔서 고마워요. ');
    show({ type: 'talk', node: key }, pre);
  }

  // ---------- 저장 ----------
  async function markTask(id) {
    await supabase.from('tasks').update({ done_on: t0 }).eq('id', id);
    setD((prev) => ({ ...prev, tasks: prev.tasks.map((t) => (t.id === id ? { ...t, done_on: t0 } : t)) }));
  }
  async function seenReply(id) {
    await supabase.from('replies').update({ seen_by_elder: true }).eq('id', id);
    setD((prev) => ({ ...prev, replies: prev.replies.map((r) => (r.id === id ? { ...r, seen_by_elder: true } : r)) }));
  }
  async function addPlan(r) {
    const { data } = await supabase.from('tasks').insert({
      family_id: fid, title: r.plan_title, short: r.plan_title.slice(0, 12), time_label: r.plan_time || '',
      icon: 'calendar', due_date: r.plan_date, source: 'elder'
    }).select().single();
    if (data) setD((prev) => ({ ...prev, tasks: [...prev.tasks, data] }));
  }
  async function skipTopic(topic) {
    await supabase.from('skipped_topics').upsert({ family_id: fid, topic });
    setD((prev) => ({ ...prev, skipped: [...prev.skipped, topic] }));
  }
  async function saveStory(lines) {
    const p = talk.current.photo;
    const { data, error } = await supabase.from('stories').insert({
      family_id: fid, title: p ? p.title : '오늘의 이야기', category: '추억', photo_id: p?.id ?? null,
      lines: lines.map(({ text, quote }) => ({ text, quote })), visibility: 'me'
    }).select().single();
    if (error) return show({ type: 'done', say: '저장하지 못했어요. 잠시 뒤에 다시 해 주세요.' });
    setD((prev) => ({ ...prev, stories: [data, ...prev.stories] }));
    show({ type: 'share', id: data.id });
  }
  async function setVisibility(id, visibility) {
    await supabase.from('stories').update({ visibility }).eq('id', id);
    setD((prev) => ({ ...prev, stories: prev.stories.map((s) => (s.id === id ? { ...s, visibility } : s)) }));
  }
  async function deleteStory(id) {
    await supabase.from('stories').delete().eq('id', id);
    setD((prev) => ({ ...prev, stories: prev.stories.filter((s) => s.id !== id) }));
  }

  if (!d || !scene) return <main className="center"><p className="muted" style={{ fontSize: 24 }}>몽실이를 부르는 중…</p></main>;

  // ---------- 버튼 만들기 ----------
  const B = (kind, icon, label, onClick, disabled = false) => ({ kind, icon, label, onClick, disabled });
  const again = () => speakOut(view.speakText || view.say, sound);
  const toIdle = (pre) => show({ type: 'idle' }, pre);
  const bar = (canSkip, onSkip) => [
    B('help', 'speaker', '다시 듣기', again),
    canSkip && B('soft', 'skip', '다른 이야기', onSkip),
    B('stop', 'stop', '그만', () => toIdle('알겠어요, 쉬어요. '))
  ].filter(Boolean);

  // 지금 이야기하는 사진 + 가족 설명(누가 썼는지 함께)
  function photoBlock() {
    const p = talk.current.photo;
    if (!p) return null;
    const note = d.notes.find((x) => x.photo_id === p.id);
    const noteBy = note && who(note.author);
    return (
      <>
        {d.urls[p.storage_path] && <div className="photo"><img src={d.urls[p.storage_path]} alt={p.title} /></div>}
        {note && <p className="photo-note">{noteBy?.role === 'elder' ? '내가 남긴 설명' : `${noteBy?.display_name} 님 설명`}: &quot;{note.text}&quot;</p>}
      </>
    );
  }

  // ---------- 장면별 화면 ----------
  function viewFor(sc) {
    switch (sc.type) {
      case 'hello':
        return {
          say: `${name} 님, 안녕하세요! 몽실이예요. ${sc.hasTasks ? '오늘 할 일부터 같이 볼까요?' : '오늘도 같이 이야기해요.'}`,
          actions: [B('go', 'check', '좋아요', () => advance())]
        };
      case 'task': {
        const t = d.tasks.find((x) => x.id === sc.id);
        return {
          say: `${t.time_label ? t.time_label + ', ' : ''}'${t.title}' 하셨어요?`,
          middle: <div className="taskbig"><Icon name={t.icon} /><span className="when">{t.time_label || '오늘'}</span><span className="what">{t.title}</span></div>,
          actions: [
            B('go', 'check', '네, 했어요', () => { markTask(t.id); advance('잘하셨어요! '); }),
            B('stop', 'x', '아직이요', () => advance('알겠어요. 잊지 마세요! '))
          ],
          bar: bar(false)
        };
      }
      case 'reply': {
        const r = d.replies.find((x) => x.id === sc.id);
        const w = who(r.author)?.display_name ?? '가족';
        const s = d.stories.find((x) => x.id === r.story_id);
        return {
          say: `${w} 님이 '${s?.title ?? '이야기'}'에 답장을 보냈어요!`,
          speakText: `${w} 님이 답장을 보냈어요. ${r.text}`,
          middle: (
            <div className="card">
              <div className="reply"><div className="avatar sm">{w.slice(-2)}</div><div><p className="who">{w}</p><p className="say">{r.text}</p></div></div>
              {r.photo_path && d.urls[r.photo_path] && <div className="photo"><img src={d.urls[r.photo_path]} alt={`${w} 님이 보낸 사진`} /></div>}
            </div>
          ),
          actions: [B('go', 'next', '다음', () => { seenReply(r.id); r.plan_title ? show({ type: 'plan', id: r.id }) : advance(); })],
          bar: bar(false)
        };
      }
      case 'plan': {
        const r = d.replies.find((x) => x.id === sc.id);
        const w = who(r.author)?.display_name ?? '가족';
        return {
          say: `${w} 님이 약속을 남겼어요. 할 일에 넣을까요?`,
          middle: <div className="cal"><span className="d">{dateLabel(r.plan_date)}</span>{r.plan_time && <span className="t">{r.plan_time}</span>}<span className="w">{r.plan_title}</span></div>,
          actions: [
            B('go', 'calendar', '할 일에 넣기', () => { addPlan(r); advance('할 일에 넣었어요! '); }),
            B('stop', 'x', '괜찮아요', () => advance('알겠어요. '))
          ],
          bar: bar(false)
        };
      }
      case 'ai': {
        const skip = () => { skipTopic(talk.current.photo.title); goTalk('mood', '알겠어요, 다른 이야기 해요. '); };
        if (sc.loading) return { say: '사진을 보고 있어요. 잠깐만요…', noSpeak: sc.history.length > 0,middle: photoBlock(), bar: bar(true, skip) };
        const n = sc.turn;
        const KIND_ICON = { go: 'check', stop: 'x', help: 'question', pick: null };
        return {
          say: n.say,
          middle: photoBlock(),
          actions: n.options.map((o) => B(o.kind, KIND_ICON[o.kind], o.t, () => {
            if (o.s) talk.current.utter.push({ text: o.s, quote: o.t });
            const history = [...sc.history, { q: n.say, a: o.t }];
            if (n.done || history.length >= 6) goTalk('wrap', '');
            else aiTurn(history);
          })),
          bar: bar(true, skip)
        };
      }
      case 'talk': {
        const n = nodeOf(sc.node);
        return {
          say: n.say,
          middle: n.photo ? photoBlock() : null,
          actions: n.opts.map((o) => B(o.kind, o.icon, o.t, () => {
            if (o.s) talk.current.utter.push({ text: o.s, quote: o.t });
            if (o.act === 'draft') return show({ type: 'draft', lines: talk.current.utter.map((u) => ({ ...u, keep: true })) });
            goTalk(o.next, o.pre || '');
          })),
          bar: bar(!!n.skipNext, () => { if (n.topic) skipTopic(n.topic); goTalk(n.skipNext, '알겠어요, 다른 이야기 해요. '); })
        };
      }
      case 'draft': {
        const kept = sc.lines.filter((l) => l.keep);
        return {
          say: '이렇게 남길게요. 빼고 싶은 문장은 눌러 주세요.',
          speakText: '이렇게 남길게요. ' + sc.lines.map((l) => l.text).join(' '),
          middle: sc.lines.map((l, i) => (
            <button key={i} className="sent" aria-pressed={l.keep}
              onClick={() => show({ ...sc, lines: sc.lines.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)) }, prefix)}>
              <span className="mark" aria-hidden="true"><Icon name={l.keep ? 'check' : 'x'} /></span><span>{l.text}</span>
            </button>
          )),
          actions: [
            B('go', 'book', '이대로 남기기', () => saveStory(kept), !kept.length),
            B('stop', 'x', '남기지 않기', () => toIdle('알겠어요, 남기지 않을게요. '))
          ],
          bar: bar(false)
        };
      }
      case 'share':
        return {
          say: '이야기책에 남겼어요. 가족에게도 보여 줄까요?',
          middle: <div className="people">{ctx.members.filter((m) => m.role !== 'elder').map((m) => <div className="person" key={m.id}><div className="avatar">{m.display_name.slice(-2)}</div>{m.relation}</div>)}</div>,
          actions: [
            B('go', 'people', '가족에게 보여 주기', () => { setVisibility(sc.id, 'family'); show({ type: 'done', say: '가족에게 보여 줬어요. 답장이 오면 알려 드릴게요!' }); }),
            B('stop', 'lock', '나만 볼래요', () => show({ type: 'done', say: '나만 볼 수 있게 남겼어요. 나중에 언제든 바꿀 수 있어요.' }))
          ],
          bar: bar(false)
        };
      case 'done':
        return { say: sc.say, actions: [B('go', 'check', '알겠어요', () => toIdle('오늘 이야기 고마워요. '))], bar: bar(false) };
      case 'book': {
        const list = d.stories;
        if (!list.length) return { say: '아직 이야기책이 비어 있어요. 같이 이야기를 나눠 볼까요?', actions: [B('go', 'chat', '이야기 나누기', () => startTalk())] };
        const i = Math.min(sc.idx, list.length - 1);
        const s = list[i];
        const photo = d.photos.find((p) => p.id === s.photo_id);
        const middle = (
          <div className="card">
            <span className="chip"><Icon name={s.visibility === 'family' ? 'people' : 'lock'} />{s.visibility === 'family' ? '가족이 볼 수 있어요' : '나만 봐요'}</span>
            <h2>{s.title}</h2>
            {photo && d.urls[photo.storage_path] && <div className="photo"><img src={d.urls[photo.storage_path]} alt={photo.title} /></div>}
            {s.lines.map((l, k) => <p className="line" key={k}>{l.text}</p>)}
            {d.replies.filter((r) => r.story_id === s.id).map((r) => {
              const w = who(r.author)?.display_name ?? '가족';
              return <div className="reply" key={r.id}><div className="avatar sm">{w.slice(-2)}</div><div><p className="who">{w}의 답장</p><p className="say">{r.text}</p></div></div>;
            })}
          </div>
        );
        if (sc.del) return {
          say: `'${s.title}' 이야기를 지울까요? 지우면 되돌릴 수 없어요.`, middle,
          actions: [
            B('go', 'check', '그대로 둘래요', () => show({ ...sc, del: false })),
            B('stop', 'trash', '지울래요', () => { deleteStory(s.id); show({ type: 'book', idx: Math.max(0, i - 1) }, '지웠어요. '); })
          ]
        };
        return {
          say: `이야기책 ${list.length}개 중 ${i + 1}번째, '${s.title}'예요.`,
          speakText: `${s.title}. ${s.lines.map((l) => l.text).join(' ')}`,
          middle,
          row: [
            B('soft', 'prev', '앞', () => show({ type: 'book', idx: i - 1 }), i === 0),
            B('help', 'speaker', '읽어 주기', again),
            B('soft', 'next', '다음', () => show({ type: 'book', idx: i + 1 }), i === list.length - 1)
          ],
          bar: [
            B('go', 'chat', '이야기하기', () => toIdle('이야기책을 다 봤어요. ')),
            s.visibility === 'family'
              ? B('soft', 'lock', '나만 보기', () => setVisibility(s.id, 'me'))
              : B('soft', 'people', '가족에게', () => setVisibility(s.id, 'family')),
            B('stop', 'trash', '지우기', () => show({ ...sc, del: true }))
          ]
        };
      }
      case 'logout':
        return {
          say: '정말 나갈까요? 다시 들어오려면 가족의 도움이 필요해요.',
          actions: [
            B('go', 'check', '그대로 있을래요', () => toIdle('')),
            B('stop', 'logout', '나가기', () => supabase.auth.signOut().then(() => router.replace('/login')))
          ]
        };
      case 'idle':
      default:
        return {
          say: '또 이야기하고 싶으면 아래 버튼을 눌러 주세요.',
          actions: [
            B('go', 'chat', '이야기 더 하기', () => startTalk()),
            B('theme', 'book', '내 이야기책 보기', () => show({ type: 'book', idx: 0 }))
          ]
        };
    }
  }

  const raw = viewFor(scene);
  const view = { ...raw, say: prefix + raw.say, speakText: raw.speakText && prefix + raw.speakText };
  const sayChanged = view.say !== lastSay.current;
  if (sayChanged) {
    lastSay.current = view.say;
    if (!view.noSpeak) pendingSpeak.current = view.speakText || view.say;
  }

  // ---------- 할 일 띠 ----------
  const todayTasks = d.tasks.filter((t) => !t.due_date || t.due_date === t0);
  const later = d.tasks.filter((t) => t.due_date && t.due_date > t0).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 2);
  const nowId = scene.type === 'task' ? scene.id : null;

  const Btn = (b, k) => (
    <button key={k} className={`ans k-${b.kind}`} disabled={b.disabled}
      onClick={() => { touched.current = true; b.onClick(); }}>
      <Icon name={b.icon} /><span>{b.label}</span>
    </button>
  );

  return (
    <div className="elder">
      <div className="app">
        <div className="top">
          <span>{koreanDate()}</span>
          <span className="right">
            <button className="mini" aria-pressed={sound} onClick={() => { touched.current = true; if (sound) try { speechSynthesis.cancel(); } catch {} setSound(!sound); }}>
              <Icon name={sound ? 'speaker' : 'mute'} />{sound ? '소리 켜짐' : '소리 꺼짐'}
            </button>
            <button className="mini" onClick={() => show({ type: 'logout' })}><Icon name="logout" />나가기</button>
          </span>
        </div>
        <div className="strip" aria-label="오늘 할 일">
          {todayTasks.map((t) => (
            <span key={t.id} className={`tchip ${t.done_on === t0 ? 'done' : ''} ${t.id === nowId ? 'now' : ''}`}>
              <Icon name={t.done_on === t0 ? 'check' : t.icon} />{t.time_label} {t.short}
            </span>
          ))}
          {later.map((t) => (
            <span key={t.id} className="tchip later"><Icon name={t.icon} />{Number(t.due_date.slice(5, 7))}/{Number(t.due_date.slice(8))} {t.short}</span>
          ))}
        </div>
        <div className={`stage ${sayChanged ? 'talking' : ''}`}>
          <div className="mascot"><Mascot /></div>
          <div className="bubble" aria-live="polite">{view.say}</div>
        </div>
        <div className="middle">{view.middle}</div>
        <div className="actions">
          {view.row && <div className="bar">{view.row.map(Btn)}</div>}
          {view.actions?.map(Btn)}
        </div>
        {view.bar && <div className="bar">{view.bar.map(Btn)}</div>}
      </div>
    </div>
  );
}
