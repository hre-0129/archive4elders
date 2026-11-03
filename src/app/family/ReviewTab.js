'use client';
// 가족 화면 '기억' 탭: 기억 연습 문제 만들기, 문제별 간격·다음 날짜, 간격별 정답률(실험 요약)
// 간격 계산은 src/lib/review.js (조원 설계: 1일 → 맞히면 ×1.5 올림, 틀리면 1일, 최대 5일)
import { useState } from 'react';
import { supabase, today } from '@/lib/supabase';
import { RULE, PER_DAY, accuracyByInterval, daysBetween } from '@/lib/review';

const KINDS = [
  { id: 'photo', label: '사진 속 기억', ex: '예) 이 사진은 어디에서 찍었을까요?' },
  { id: 'routine', label: '생활 습관', ex: '예) 혈압약은 언제 드세요?' }
];

function AddForm({ data, member, reload }) {
  const photos = data.photos;
  const [f, setF] = useState({ kind: photos.length ? 'photo' : 'routine', photo_id: photos[0]?.id || '', question: '', answer: '', wrong1: '', wrong2: '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const photo = photos.find((p) => p.id === f.photo_id);

  async function submit(e) {
    e.preventDefault();
    const wrong = [f.wrong1.trim(), f.wrong2.trim()].filter(Boolean);
    if (f.kind === 'photo' && !f.photo_id) return setMsg('사진을 골라 주세요.');
    if (!f.question.trim() || !f.answer.trim()) return setMsg('질문과 정답을 적어 주세요.');
    if (!wrong.length) return setMsg('헷갈릴 만한 다른 보기를 하나 이상 적어 주세요.');
    if (wrong.includes(f.answer.trim())) return setMsg('다른 보기가 정답과 같아요.');
    const { error } = await supabase.from('review_items').insert({
      family_id: member.family_id, kind: f.kind, photo_id: f.kind === 'photo' ? f.photo_id : null,
      question: f.question.trim(), answer: f.answer.trim(), wrong, created_by: member.id
    });
    if (error) return setMsg(error.message);
    setF({ ...f, question: '', answer: '', wrong1: '', wrong2: '' }); setMsg('');
    reload();
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>문제 더하기</h2>
      <div className="field">
        <span className="lbl">종류</span>
        <div className="choice">
          {KINDS.map((k) => <button type="button" key={k.id} aria-pressed={f.kind === k.id} onClick={() => setF({ ...f, kind: k.id })}>{k.label}</button>)}
        </div>
      </div>
      {f.kind === 'photo' && (
        <div className="field">
          <label htmlFor="r-photo">사진</label>
          {photos.length ? (
            <>
              <select id="r-photo" className="input" value={f.photo_id} onChange={set('photo_id')}>
                {photos.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {photo && data.urls[photo.storage_path] && <img src={data.urls[photo.storage_path]} alt={photo.title} style={{ maxWidth: 200, borderRadius: 12 }} />}
            </>
          ) : <p className="muted">사진 탭에서 먼저 사진을 올려 주세요.</p>}
        </div>
      )}
      <div className="field">
        <label htmlFor="r-q">질문</label>
        <input id="r-q" className="input" value={f.question} onChange={set('question')} placeholder={KINDS.find((k) => k.id === f.kind).ex} />
      </div>
      <div className="field">
        <label htmlFor="r-a">정답</label>
        <input id="r-a" className="input" value={f.answer} onChange={set('answer')} placeholder="예) 해운대" maxLength={20} />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="r-w1">다른 보기 1</label>
          <input id="r-w1" className="input" value={f.wrong1} onChange={set('wrong1')} placeholder="예) 경포대" maxLength={20} />
        </div>
        <div className="field">
          <label htmlFor="r-w2">다른 보기 2 (없어도 돼요)</label>
          <input id="r-w2" className="input" value={f.wrong2} onChange={set('wrong2')} placeholder="예) 대천" maxLength={20} />
        </div>
      </div>
      <span className="hint">어르신 화면에는 보기들이 섞여서 큰 버튼으로 나오고, &apos;잘 모르겠어요&apos; 버튼도 함께 나와요.</span>
      {msg && <p className="error" role="alert">{msg}</p>}
      <button className="btn go">더하기</button>
    </form>
  );
}

export default function ReviewTab({ data, member, reload }) {
  if (!data.reviews) {
    return <p className="notice">기억 연습을 쓰려면 Supabase SQL Editor 에서 supabase/004_review.sql 을 한 번 실행해 주세요.</p>;
  }
  const t0 = today();
  const logs = data.reviewLogs;
  const table = accuracyByInterval(logs);

  async function update(it, patch) {
    await supabase.from('review_items').update(patch).eq('id', it.id);
    reload();
  }
  async function remove(it) {
    await supabase.from('review_items').delete().eq('id', it.id);
    reload();
  }
  const dueText = (it) => {
    const n = daysBetween(t0, it.next_due);
    return n <= 0 ? '오늘 물어봐요' : n === 1 ? '내일' : `${n}일 뒤`;
  };

  return (
    <>
      <section className="card">
        <h2>기억 연습은 이렇게 해요</h2>
        <p className="muted">
          몽실이가 대화 처음에 날짜가 된 문제를 하루 {PER_DAY}개까지 여쭤봐요. 처음 간격은 {RULE.first}일, 맞히면 간격이 {RULE.growth}배(올림)로 늘고,
          틀리거나 &apos;잘 모르겠어요&apos;를 누르면 {RULE.first}일로 돌아가요. 가장 긴 간격은 {RULE.max}일이에요 (1 → 2 → 3 → 5일).
        </p>
      </section>
      <AddForm data={data} member={member} reload={reload} />
      <section className="card">
        <h2>문제 {data.reviews.length}개</h2>
        {data.reviews.length ? data.reviews.map((it) => {
          const mine = logs.filter((l) => l.item_id === it.id);
          const ok = mine.filter((l) => l.correct).length;
          return (
            <div className="list-row" key={it.id}>
              <div className="grow">
                <strong>{it.question}</strong>
                <p className="muted" style={{ fontSize: 15 }}>
                  정답 {it.answer} · 간격 {it.interval_days}일 · 연속 {it.streak}번 맞힘 · {mine.length ? `${mine.length}번 중 ${ok}번 맞힘` : '아직 안 풀었어요'}
                </p>
              </div>
              {it.active ? <span className={`badge ${it.next_due <= t0 ? 'pink' : ''}`}>{dueText(it)}</span> : <span className="badge">쉬는 중</span>}
              <button className="btn quiet" onClick={() => update(it, { active: !it.active })}>{it.active ? '쉬기' : '다시 묻기'}</button>
              <button className="btn quiet" onClick={() => remove(it)}>지우기</button>
            </div>
          );
        }) : <p className="muted">아직 문제가 없어요. 위에서 하나 만들어 보세요.</p>}
      </section>
      <section className="card">
        <h2>간격별 정답률</h2>
        <p className="muted">며칠 만에 다시 물었을 때 얼마나 기억하셨는지예요. 간격이 길어져도 정답률이 유지되면 기억이 단단해졌다는 뜻이에요.</p>
        {table.length ? table.map((r) => (
          <div className="list-row" key={r.interval}>
            <strong className="grow">{r.interval}일 만에</strong>
            <span className="muted">{r.n}번 중 {r.correct}번</span>
            <span className="badge green">{r.rate}%</span>
          </div>
        )) : <p className="muted">어르신이 문제를 풀면 여기에 쌓여요.</p>}
      </section>
      {logs.length > 0 && (
        <section className="card">
          <h2>최근 기록</h2>
          {logs.slice(0, 10).map((l) => {
            const it = data.reviews.find((x) => x.id === l.item_id);
            return (
              <div className="list-row" key={l.id}>
                <div className="grow">
                  <strong>{it?.question ?? '지운 문제'}</strong>
                  <p className="muted" style={{ fontSize: 15 }}>
                    {l.reviewed_on} · 고른 답 &apos;{l.chosen}&apos; · 간격 {l.interval_before}일 → {l.interval_after}일
                    {l.reviewed_on > l.due_date && ` · ${daysBetween(l.due_date, l.reviewed_on)}일 늦게 풂`}
                  </p>
                </div>
                <span className={`badge ${l.correct ? 'green' : ''}`}>{l.correct ? '맞힘' : '다시'}</span>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
