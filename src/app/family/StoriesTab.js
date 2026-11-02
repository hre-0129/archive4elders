'use client';
// 어르신이 '가족에게 보여 주기'로 남긴 이야기 + 답장 쓰기
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadPhoto } from './upload';

function ReplyForm({ story, member, reload }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [withPlan, setWithPlan] = useState(false);
  const [plan, setPlan] = useState({ title: '', date: '', time: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return setMsg('답장 내용을 적어 주세요.');
    if (withPlan && (!plan.title.trim() || !plan.date)) return setMsg('약속 내용과 날짜를 적어 주세요.');
    setBusy(true); setMsg('');
    try {
      const photo_path = file ? await uploadPhoto(member.family_id, file) : null;
      const { error } = await supabase.from('replies').insert({
        story_id: story.id, author: member.id, text: text.trim(), photo_path,
        plan_title: withPlan ? plan.title.trim() : null,
        plan_date: withPlan ? plan.date : null,
        plan_time: withPlan ? plan.time : null
      });
      if (error) throw new Error(error.message);
      setText(''); setFile(null); setWithPlan(false); setPlan({ title: '', date: '', time: '' });
      await reload();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  return (
    <form className="field" onSubmit={submit} style={{ gap: 10 }}>
      <label htmlFor={`r-${story.id}`}>답장 쓰기</label>
      <textarea id={`r-${story.id}`} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="몽실이가 어르신께 읽어 드려요. 짧고 쉬운 말이 좋아요." />
      <div className="row">
        <label className="btn quiet" style={{ cursor: 'pointer' }}>
          사진 덧붙이기
          <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
        </label>
        {file && <span className="muted">{file.name}</span>}
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={withPlan} onChange={(e) => setWithPlan(e.target.checked)} style={{ width: 22, height: 22 }} />
          같이 할 약속 넣기
        </label>
      </div>
      {withPlan && (
        <div className="card" style={{ background: 'var(--bg)', boxShadow: 'inset 0 0 0 2px var(--pink-soft)' }}>
          <span className="hint">어르신 화면에서 몽실이가 &quot;할 일에 넣을까요?&quot;라고 여쭤봐요.</span>
          <input className="input" aria-label="약속 내용" placeholder="예) 하은이와 국밥 만들기" value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} />
          <div className="two">
            <input className="input" type="date" aria-label="날짜" value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} />
            <input className="input" aria-label="시간" placeholder="예) 오전 11시" value={plan.time} onChange={(e) => setPlan({ ...plan, time: e.target.value })} />
          </div>
        </div>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
      <button className="btn go" disabled={busy}>{busy ? '보내는 중…' : '답장 보내기'}</button>
    </form>
  );
}

export default function StoriesTab({ data, member, nameOf, elder, reload }) {
  const shared = data.stories;
  if (!shared.length) return (
    <div className="card">
      <h2>아직 보여 주신 이야기가 없어요</h2>
      <p className="muted">{elder ? `${elder.display_name} 님` : '어르신'}이 몽실이와 이야기한 뒤 &apos;가족에게 보여 주기&apos;를 누르면 여기에 나타나요. 사진을 먼저 올려 두면 몽실이가 그 사진으로 이야기를 시작해요.</p>
    </div>
  );

  return shared.map((s) => {
    const photo = data.photos.find((p) => p.id === s.photo_id);
    const replies = data.replies.filter((r) => r.story_id === s.id);
    return (
      <section className="card" key={s.id}>
        <div className="row">
          <span className="badge pink">{s.category}</span>
          <span className="muted" style={{ fontSize: 15 }}>{new Date(s.created_at).toLocaleDateString('ko-KR')}</span>
        </div>
        <h2>{s.title}</h2>
        {photo && data.urls[photo.storage_path] && (
          <div className="thumb" style={{ width: '100%', maxWidth: 360 }}><img src={data.urls[photo.storage_path]} alt={photo.title} /></div>
        )}
        {s.lines.map((l, i) => <p className="line" key={i}>{l.text}</p>)}
        <details>
          <summary className="muted" style={{ cursor: 'pointer' }}>어르신이 고른 원래 대답 보기</summary>
          {s.lines.map((l, i) => <p key={i} className="muted">&quot;{l.quote}&quot;</p>)}
        </details>
        {replies.map((r) => {
          const who = nameOf(r.author);
          return (
            <div className="list-row" key={r.id} style={{ alignItems: 'flex-start' }}>
              <div className="avatar sm">{who?.display_name.slice(-2)}</div>
              <div className="grow">
                <p className="muted" style={{ fontSize: 15 }}>{who?.display_name} · {r.seen_by_elder ? '어르신이 봤어요' : '아직 안 봤어요'}</p>
                <p>{r.text}</p>
                {r.photo_path && data.urls[r.photo_path] && <div className="thumb" style={{ width: 200 }}><img src={data.urls[r.photo_path]} alt="답장 사진" /></div>}
                {r.plan_title && <span className="badge green">약속: {r.plan_date} {r.plan_time} {r.plan_title}</span>}
              </div>
            </div>
          );
        })}
        <ReplyForm story={s} member={member} reload={reload} />
      </section>
    );
  });
}
