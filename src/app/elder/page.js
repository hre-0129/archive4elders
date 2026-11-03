'use client';
// 어르신 화면. 화면은 하나이고, 몽실이가 '장면(scene)'을 하나씩 바꿔 가며 말을 건다.
// 들어오면: 인사 → 오늘 할 일 하나씩 → 새 가족 답장 → (오늘 처음이면 마음 한 페이지) → 사진 이야기
//          → 이야기책 → 활동 후 마음 한 페이지 → 쉬기(idle: 사진 이야기 더 / 다른 활동 추천 / 이야기책)
// 마음 체크는 하루 한 번만 묻고, 그날 활동들은 가장 최근 마음을 '활동 전 마음'으로 쓴다.
// (활동 표가 아직 없으면 마음 묻기 없이 바로 사진 이야기로)
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, signedUrls, today, koreanDate } from '@/lib/supabase';
import { useMember } from '@/lib/useMember';
import { loadActivities } from '@/lib/activities';
import { recommend, classifyChange, MOOD_KEYS } from '@/lib/recommend';
import { startLadder, nextLadder, MAX_TURNS } from '@/lib/ladder';
import { newSession, addAnswer } from '@/lib/metrics';
import Icon from '@/components/Icon';
import Mascot from '@/components/Mascot';
import { talkNode } from './talk';

const callName = (n = '') => (n.length === 3 ? n.slice(1) : n); // 김순자 → 순자

// 마음 묻기 (조원 설계: 1 전혀 그렇지 않음 ~ 5 매우 그러함). 설문이 아니라 몽실이 말투로 묻고, 한 페이지에 모은다.
const SCALE = ['전혀', '별로', '보통', '조금', '많이'];
const SATISFY = ['아주 별로', '별로', '보통', '좋았어요', '아주 좋았어요'];
const MOOD_PAGE = {
  pre: [
    { key: 'lonely', q: '요즘 마음이 쓸쓸하진 않으세요?', labels: SCALE },
    { key: 'positive', q: '오늘 기분은 좋으세요?', labels: SCALE },
    { key: 'tense', q: '혹시 마음이 조마조마하거나 불안하진 않으세요?', labels: SCALE }
  ],
  post: [
    { key: 'lonely', q: '지금은 쓸쓸한 마음이 드세요?', labels: SCALE },
    { key: 'positive', q: '지금 기분은 좋으세요?', labels: SCALE },
    { key: 'tense', q: '지금 마음이 불안하진 않으세요?', labels: SCALE },
    { key: 'satisfaction', q: '오늘 해 보니 어떠셨어요?', labels: SATISFY },
    { key: 'rejoin', q: '다음에 또 할래요?', labels: ['네, 또 할래요', '아니요'], values: [true, false] }
  ]
};
const kstDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso));

// 받침에 맞는 조사: josa('대화하기', '은', '는') → '는',  josa('산책', '을', '를') → '을'
function josa(word, withBatchim, without) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? withBatchim : without;
}

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
  const [tasks, photos, notes, stories, replies, skipped, act] = await Promise.all([
    supabase.from('tasks').select('*').eq('family_id', fid).order('created_at'),
    supabase.from('photos').select('*').eq('family_id', fid).order('created_at', { ascending: false }),
    supabase.from('photo_notes').select('*').order('created_at'),
    supabase.from('stories').select('*').eq('family_id', fid).order('created_at', { ascending: false }),
    supabase.from('replies').select('*').order('created_at'),
    supabase.from('skipped_topics').select('*').eq('family_id', fid),
    loadActivities(fid)
  ]);
  const d = {
    tasks: tasks.data || [], photos: photos.data || [], notes: notes.data || [],
    stories: stories.data || [], replies: replies.data || [], skipped: (skipped.data || []).map((s) => s.topic),
    activities: act ? act.activities : null, // null 이면 기분·활동 기능 꺼짐
    activityLogs: act ? act.logs : []
  };
  d.urls = await signedUrls([...d.photos.map((p) => p.storage_path), ...d.replies.map((r) => r.photo_path)]);
  return d;
}

// 대화 방식 비교 실험: 가족 설정(talk_mode)에 따라 이번 대화의 조건을 정한다. random 이면 반반 무작위.
function pickCondition(mode = 'ladder') {
  if (mode === 'random') return Math.random() < 0.5 ? 'ladder' : 'free';
  return mode === 'free' ? 'free' : 'ladder';
}

// 다음에 이야기할 사진: AI 사용 허락, 아직 이야기책에 없음, 건너뛴 적 없음
function nextPhoto(d) {
  return d.photos.find((p) => p.ai_allowed && !d.stories.some((s) => s.photo_id === p.id) && !d.skipped.includes(p.title));
}

// 서버(/api/talk)에 몽실이의 다음 질문을 요청.
// ladder: 회상 대화 사다리 상태 (어느 단계의 질문을 할지). null 이면 '자유' 조건 — 단계 없이 AI가 알아서 묻는다
async function fetchTurn(photoId, history, ladder) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/talk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ photoId, history, level: ladder ? ladder.level : null, comfort: ladder ? ladder.comfort : false })
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
  const activity = useRef(null); // 지금 하는 활동 { act, pre, score, rank, startedAt } — 끝나면 기록하고 비운다
  const todayMood = useRef(null); // 오늘 가장 최근 마음 { lonely, positive, tense } — 있으면 다시 묻지 않고 '활동 전 마음'으로 쓴다
  const lastTalkId = useRef(null); // 방금 저장한 대화 지표 id — '사진 보기' 활동 기록과 이어 붙이려고
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
  // 로그인 신호는 탭이 다시 보일 때·토큰을 갱신할 때도 다시 오므로, 같은 사람이면 한 번만 불러온다
  // (안 그러면 그때마다 AI 첫 질문을 또 요청해서 노트북 Ollama 앞에 요청이 줄줄이 쌓인다)
  const loadedFor = useRef(null);
  const memberId = member?.id;
  const role = member?.role;
  const talkMode = ctx.family?.talk_mode;
  useEffect(() => {
    if (ctx.loading) return;
    if (!ctx.user) { router.replace('/login'); return; }
    if (!memberId) { router.replace('/setup'); return; }
    if (role !== 'elder') { router.replace('/family'); return; }
    if (loadedFor.current === memberId) return;
    loadedFor.current = memberId;
    loadAll(fid).then((data) => {
      setD(data);
      // 오늘 이미 활동을 기록했다면, 그 '활동 후 마음'이 지금 마음이다 → 오늘은 마음을 다시 묻지 않는다
      const lastToday = data.activityLogs.find((l) => kstDate(l.finished_at) === t0);
      if (lastToday) todayMood.current = { lonely: lastToday.post_lonely, positive: lastToday.post_positive, tense: lastToday.post_tense };
      const todo = data.tasks.filter((t) => (!t.due_date || t.due_date === t0) && t.done_on !== t0);
      const unseen = data.replies.filter((r) => !r.seen_by_elder);
      setQueue([
        ...todo.map((t) => ({ type: 'task', id: t.id })),
        ...unseen.map((r) => ({ type: 'reply', id: r.id })),
        { type: data.activities ? 'photoMain' : 'photoStart' }
      ]);
      setScene({ type: 'hello', hasTasks: todo.length > 0 });
      // 할 일을 확인하는 동안 첫 사진 질문을 미리 받아 둔다 (내 컴퓨터 AI는 사진 읽기가 느려서)
      // 이 사진의 대화 조건(사다리·자유)도 지금 정해 둔다 → 두 조건 모두 첫 질문을 똑같이 빨리 받는다 (공정한 비교)
      const p = nextPhoto(data);
      if (p) {
        const cond = pickCondition(talkMode);
        const promise = fetchTurn(p.id, [], cond === 'ladder' ? startLadder() : null);
        promise.catch(() => {});
        prefetch.current = { photoId: p.id, promise, cond };
      }
    });
  }, [ctx.loading, ctx.user, memberId, role, fid, router, t0, talkMode]);

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
    if (next.type === 'photoMain') return photoMain(pre);
    show(next, pre);
  }

  // ---------- 기분·활동 ----------
  // 오늘 마음을 아직 모르면 한 페이지로 묻고, 다 고르면 then 으로 이어 간다 ('photo' 사진 이야기 / 'recommend' 활동 추천)
  function needMood(then, pre = '') {
    if (todayMood.current) return then === 'photo' ? photoActivity(pre) : show({ type: 'recommend', mood: todayMood.current }, pre);
    show({ type: 'moodPage', phase: 'pre', answers: {}, then }, pre);
  }

  // 사진 이야기가 기본: 볼 사진이 있으면 마음(하루 한 번) → '사진 보기' 활동으로 사진 이야기, 없으면 다른 활동 추천
  function photoMain(pre = '') {
    if (!nextPhoto(d)) return needMood('recommend', pre + '오늘은 새로 볼 사진이 없어요. 대신 다른 활동을 찾아 볼게요. ');
    needMood('photo', pre);
  }

  // 사진 이야기를 '사진 보기' 활동으로 시작 (활동 전후 마음을 남기려고). 그 활동이 꺼져 있으면 그냥 사진 이야기.
  function photoActivity(pre = '') {
    const act = d.activities?.find((a) => a.mode === 'photo_talk' && a.active);
    if (act && todayMood.current) activity.current = { act, pre: todayMood.current, score: null, rank: null, startedAt: new Date().toISOString() };
    startTalk(pre);
  }

  // 활동 중이었다면 '활동 후 마음' 한 페이지로, 아니면 쉬기로
  function finishOrIdle(pre = '') {
    if (activity.current) return show({ type: 'moodPage', phase: 'post', answers: {} }, pre);
    show({ type: 'idle' }, pre);
  }

  function chooseActivity(rec, rank, mood) {
    activity.current = { act: rec.activity, pre: mood, score: rec.score, rank, startedAt: new Date().toISOString() };
    if (rec.activity.mode === 'photo_talk') return startTalk('좋아요, 사진을 같이 봐요. ');
    show({ type: 'doing' });
  }

  async function saveActivity(post, satisfaction, rejoin) {
    const { act, pre, score, rank, startedAt } = activity.current;
    activity.current = null;
    todayMood.current = post;
    const result = classifyChange(pre, post);
    const row = {
      family_id: fid, activity_id: act.id,
      pre_lonely: pre.lonely, pre_positive: pre.positive, pre_tense: pre.tense,
      post_lonely: post.lonely, post_positive: post.positive, post_tense: post.tense,
      satisfaction, rejoin, improved_all: result.all, rec_score: score, rec_rank: rank, started_at: startedAt
    };
    show({ type: 'actDone', result, name: act.name });
    const { data, error } = await supabase.from('activity_logs').insert(row).select().single();
    if (error) return console.warn('활동 기록 저장 실패:', error.message);
    setD((prev) => ({ ...prev, activityLogs: [data, ...prev.activityLogs] }));
    // '사진 보기' 활동이었다면, 그 대화 지표에 활동 전후 마음 기록을 이어 붙인다 (대화 방식별 정서 변화 비교용)
    if (act.mode === 'photo_talk' && lastTalkId.current) {
      await supabase.from('talk_sessions').update({ activity_log_id: data.id }).eq('id', lastTalkId.current);
      lastTalkId.current = null;
    }
  }

  function startTalk(pre = '') {
    endTalk('stop'); // 끝나지 않은 대화가 있었다면 '그만'으로 기록
    const photo = nextPhoto(d);
    // 대화 조건: 미리 받아 둔 첫 질문이 이 사진 것이면 그때 정한 조건을, 아니면 지금 정한다. AI가 꺼졌으면 각본(script)
    const cond = aiOff.current ? 'script'
      : prefetch.current?.photoId === photo?.id ? prefetch.current.cond : pickCondition(ctx.family?.talk_mode);
    talk.current = { utter: [], photo, ladder: startLadder(), cond, metrics: photo ? newSession(cond, photo.id) : null };
    if (!photo) return goTalk('mood', pre + '지금은 새로 볼 사진이 없어요. ');
    goTalk('start', pre);
  }

  // 대화 하나를 끝내며 지표를 저장 (한 번만). 대답이 하나도 없던 대화는 남기지 않는다.
  async function endTalk(reason, story = null) {
    const m = talk.current.metrics;
    if (!m || m.ended) return;
    m.ended = true;
    if (!m.turns) return;
    const { data, error } = await supabase.from('talk_sessions').insert({
      family_id: fid, photo_id: m.photo_id, condition: m.condition, started_at: m.started_at, end_reason: reason,
      turns: m.turns, picks: m.picks, helps: m.helps, heavies: m.heavies,
      max_level: m.condition === 'ladder' && m.path.length ? Math.max(...m.path) : null,
      path: m.path, history: m.history,
      story_saved: Boolean(story), story_id: story?.id ?? null, story_lines: story?.lines ?? 0
    }).select('id').single();
    if (error) return console.warn('대화 지표 저장 실패:', error.message);
    lastTalkId.current = data.id;
  }

  // 버튼 하나를 고를 때마다 지표에 더한다
  function record(q, o, level) {
    const m = talk.current.metrics;
    if (!m || m.ended) return;
    talk.current.metrics = { ...addAnswer(m, { q, a: o.t, kind: o.kind, tone: o.tone, level }), ended: false };
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
      const ladder = talk.current.cond === 'ladder' ? talk.current.ladder : null;
      const body = await (early || fetchTurn(photoId, history, ladder));
      // 받아 주는 말(reflect)을 질문 앞에 붙인다: "시원했군요. 그 바람 맞으며 …?"
      if (id === aiReq.current) show({ type: 'ai', loading: false, history, turn: body }, pre + (body.reflect ? body.reflect + ' ' : ''), true);
    } catch (e) {
      console.warn('몽실이 AI 대신 각본 대화로 이어 가요:', e.message);
      if (id !== aiReq.current) return;
      if (!history.length) {
        // 첫 질문부터 AI가 안 되면 각본 대화로. 지표의 조건도 각본(script)으로 바꾼다
        aiOff.current = true;
        talk.current.cond = 'script';
        if (talk.current.metrics) talk.current.metrics.condition = 'script';
        goTalk('look', pre);
      }
      else goTalk('wrap', '');
    }
  }

  function goTalk(key, pre = '') {
    if (key === 'look' && !aiOff.current) return aiTurn([], pre);
    // 활동으로 사진을 보던 중이면, 각본의 "오늘 기분은?" 대신 활동 후 마음 기록으로 바로 간다
    if (key === 'mood' && activity.current) return finishOrIdle(pre);
    let n = nodeOf(key);
    while (n.topic && d.skipped.includes(n.topic) && n.skipNext) { key = n.skipNext; n = nodeOf(key); }
    if (key === 'wrap' && !talk.current.utter.length) key = 'bye';
    if (key === 'bye') { endTalk('done'); return finishOrIdle(pre || '이야기해 주셔서 고마워요. '); }
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
    if (error) { endTalk('error'); return show({ type: 'done', say: '저장하지 못했어요. 잠시 뒤에 다시 해 주세요.' }); }
    endTalk('done', { id: data.id, lines: lines.length });
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
  const B = (kind, icon, label, onClick, disabled = false, sub = '') => ({ kind, icon, label, onClick, disabled, sub });
  const again = () => speakOut(view.speakText || view.say, sound);
  const toIdle = (pre) => finishOrIdle(pre);
  // 마음 묻기 중의 '그만': 활동을 기록하지 않고 쉬기로
  const cancelBar = () => [
    B('help', 'speaker', '다시 듣기', again),
    B('stop', 'stop', '그만', () => { activity.current = null; show({ type: 'idle' }, '알겠어요, 쉬어요. '); })
  ];
  const bar = (canSkip, onSkip) => [
    B('help', 'speaker', '다시 듣기', again),
    canSkip && B('soft', 'skip', '다른 이야기', onSkip),
    B('stop', 'stop', '그만', () => { endTalk('stop'); toIdle('알겠어요, 쉬어요. '); }) // 대화 중이 아니면 endTalk 는 아무 일도 안 한다
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
        const skip = () => { endTalk('skip'); skipTopic(talk.current.photo.title); goTalk('mood', '알겠어요, 다른 이야기 해요. '); };
        if (sc.loading) return { say: '사진을 보고 있어요. 잠깐만요…', noSpeak: sc.history.length > 0, middle: photoBlock(), bar: bar(true, skip) };
        const n = sc.turn;
        const KIND_ICON = { go: 'check', stop: 'x', help: 'question', pick: null };
        const useLadder = talk.current.cond === 'ladder';
        // 대답 하나 (버튼이든 직접 적은 글이든 똑같이 처리)
        const answer = (o) => {
          if (o.s) talk.current.utter.push({ text: o.s, quote: o.t });
          record(n.say, o, useLadder ? talk.current.ladder.level : null);
          const history = [...sc.history, { q: n.say, a: o.t }];
          // 고른 버튼(종류·밝기)으로 다음 질문 단계를 정한다. '자유' 조건에서는 횟수 세기에만 쓴다
          talk.current.ladder = nextLadder(talk.current.ladder, { kind: o.kind, tone: o.tone });
          const done = useLadder ? talk.current.ladder.done : talk.current.ladder.turns >= MAX_TURNS;
          if (n.done || done) goTalk('wrap', '');
          // 위로 말은 작은 AI가 빼먹기도 해서, 사다리 조건에서는 알고리즘이 직접 붙인다
          else aiTurn(history, useLadder && talk.current.ladder.comfort ? '그때 마음이 힘드셨겠어요. ' : '');
        };
        // 직접 적기: 적은 말은 어르신 자신의 말이라 그대로 이야기책에 남긴다 (AI가 고쳐 쓰지 않음)
        if (sc.typing) {
          const send = () => {
            const text = document.getElementById('typed')?.value.trim().slice(0, 200);
            if (!text) return;
            answer({ t: text, kind: 'pick', tone: 'neutral', s: /[.!?]$/.test(text) ? text : text + '.' });
          };
          return {
            say: n.say,
            middle: <textarea id="typed" className="typed" autoFocus placeholder="생각나는 대로 적어 주세요. 가족이 대신 적어 드려도 돼요." />,
            actions: [B('go', 'check', '이렇게 대답할게요', send), B('soft', 'prev', '버튼으로 대답할래요', () => show({ ...sc, typing: false }, prefix, true))],
            bar: bar(true, skip)
          };
        }
        return {
          say: n.say,
          middle: photoBlock(),
          actions: n.options.map((o) => B(o.kind, KIND_ICON[o.kind], o.t, () => answer(o))),
          bar: [B('soft', 'pen', '글로 적기', () => show({ ...sc, typing: true }, prefix, true)), ...bar(true, skip)]
        };
      }
      case 'talk': {
        const n = nodeOf(sc.node);
        return {
          say: n.say,
          middle: n.photo ? photoBlock() : null,
          actions: n.opts.map((o) => B(o.kind, o.icon, o.t, () => {
            if (o.s) talk.current.utter.push({ text: o.s, quote: o.t });
            // 사진에 대한 질문(각본)의 대답만 지표에 넣는다 ("같이 볼까요?", "남길까요?" 같은 진행 질문은 빼고)
            if (n.photo) record(n.say, o, null);
            if (o.act === 'draft') return show({ type: 'draft', lines: talk.current.utter.map((u) => ({ ...u, keep: true })) });
            goTalk(o.next, o.pre || '');
          })),
          bar: bar(!!n.skipNext, () => { if (n.photo) endTalk('skip'); if (n.topic) skipTopic(n.topic); goTalk(n.skipNext, '알겠어요, 다른 이야기 해요. '); })
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
            B('stop', 'x', '남기지 않기', () => { endTalk('done'); toIdle('알겠어요, 남기지 않을게요. '); })
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
      case 'moodPage': {
        // 마음(과 활동 후엔 만족도·또 할래요)을 한 페이지에서 고른다. 다 고르면 초록 버튼이 켜진다
        const items = MOOD_PAGE[sc.phase];
        const done = items.every((it) => sc.answers[it.key] !== undefined);
        const actName = activity.current?.act.name;
        const submit = () => {
          const mood = Object.fromEntries(MOOD_KEYS.map((k) => [k, sc.answers[k]]));
          if (sc.phase === 'post') return saveActivity(mood, sc.answers.satisfaction, sc.answers.rejoin);
          todayMood.current = mood;
          if (sc.then === 'photo') return photoActivity('고마워요. 그럼 사진을 같이 봐요. ');
          show({ type: 'recommend', mood }, '고마워요. ');
        };
        return {
          say: sc.phase === 'pre'
            ? `${name} 님, 오늘 마음은 좀 어떠세요? 편하게 골라 주세요.`
            : `${actName === '사진 보기' || !actName ? '이야기 나눠 보니' : `${actName} 하고 나니`} 마음이 좀 어떠세요?`,
          speakText: (sc.phase === 'pre' ? `${name} 님, 오늘 마음은 좀 어떠세요? ` : '마음이 좀 어떠세요? ') + items.map((it) => it.q).join(' '),
          middle: (
            <div className="qpage">
              {items.map((it) => (
                <div className="qrow" key={it.key}>
                  <p>{it.q}</p>
                  <div className={`qopts n${it.labels.length}`}>
                    {it.labels.map((label, i) => {
                      const value = it.values ? it.values[i] : i + 1;
                      return (
                        <button key={label} aria-pressed={sc.answers[it.key] === value}
                          onClick={() => { touched.current = true; show({ ...sc, answers: { ...sc.answers, [it.key]: value } }, prefix); }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ),
          actions: [B('go', 'check', done ? '다 골랐어요' : '모두 골라 주세요', submit, !done)],
          bar: cancelBar()
        };
      }
      case 'recommend': {
        // 사진이 남아 있지 않으면 '사진 보기'는 추천하지 않는다
        const usable = d.activities.filter((a) => a.active && (a.mode !== 'photo_talk' || nextPhoto(d)));
        const top = recommend(sc.mood, usable, d.activityLogs).slice(0, 3);
        return {
          say: '지금 마음에는 이런 활동이 좋겠어요.',
          speakText: '지금 마음에는 이런 활동이 좋겠어요. ' + top.map((r, i) => `${i + 1}번, ${r.activity.name}. ${r.reason}.`).join(' '),
          actions: [
            ...top.map((r, i) => B('pick', r.activity.icon, `${r.activity.name} · ${r.score}점`, () => chooseActivity(r, i + 1, sc.mood), false, r.reason)),
            B('stop', 'x', '다음에 할래요', () => show({ type: 'idle' }, '알겠어요. '))
          ],
          bar: [B('help', 'speaker', '다시 듣기', again)]
        };
      }
      case 'doing': {
        const a = activity.current?.act;
        if (!a) return viewFor({ type: 'idle' });
        return {
          say: a.guide || `'${a.name}'${josa(a.name, '을', '를')} 해 보세요. 다 하시면 초록 버튼을 눌러 주세요.`,
          middle: <div className="taskbig"><Icon name={a.icon} /><span className="what">{a.name}</span></div>,
          actions: [
            B('go', 'check', '다 했어요', () => finishOrIdle('수고하셨어요! ')),
            B('stop', 'x', '그만할래요', () => { activity.current = null; show({ type: 'idle' }, '알겠어요, 다음에 해요. '); })
          ],
          bar: [B('help', 'speaker', '다시 듣기', again)]
        };
      }
      case 'actDone':
        return {
          say: sc.result.all ? '하고 나서 마음이 한결 나아지셨네요! 기록해 둘게요.'
            : sc.result.any ? '조금 나아진 마음도 있네요. 기록해 둘게요.'
            : '기록해 둘게요. 다음엔 더 잘 맞는 활동을 찾아 볼게요.',
          actions: [B('go', 'check', '알겠어요', () => show({ type: 'idle' }))]
        };
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
            nextPhoto(d) && B('go', 'photo', '사진 보며 이야기하기', () => (d.activities ? needMood('photo') : startTalk())),
            d.activities && B('pick', 'leaf', '다른 활동 추천받기', () => needMood('recommend')),
            !nextPhoto(d) && !d.activities && B('go', 'chat', '이야기 더 하기', () => startTalk()),
            B('theme', 'book', '내 이야기책 보기', () => show({ type: 'book', idx: 0 }))
          ].filter(Boolean)
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
      <Icon name={b.icon} /><span>{b.label}{b.sub && <small className="sub">{b.sub}</small>}</span>
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
        <div className={`actions ${view.scale ? 'scale' : ''}`}>
          {view.row && <div className="bar">{view.row.map(Btn)}</div>}
          {view.actions?.map(Btn)}
        </div>
        {view.bar && <div className="bar">{view.bar.map(Btn)}</div>}
      </div>
    </div>
  );
}
