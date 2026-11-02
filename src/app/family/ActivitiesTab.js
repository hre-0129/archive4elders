'use client';
// 가족 화면 '활동' 탭: 활동별 선호도·사용 여부 설정, 새 활동 추가, 활동 기록 요약
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toRow } from '@/lib/activities';
import { change } from '@/lib/recommend';
import Icon, { ACTIVITY_ICONS } from '@/components/Icon';

const PREF = ['아주 싫어하심', '싫어하심', '보통', '좋아하심', '아주 좋아하심'];
const FIT = [
  { key: 'fit_lonely', label: '외로울 때' },
  { key: 'fit_lowpos', label: '기분이 가라앉을 때' },
  { key: 'fit_tense', label: '긴장되거나 불안할 때' }
];

function AddForm({ member, reload, onDone }) {
  const [f, setF] = useState({ name: '', icon: 'walk', guide: '', helps: { fit_lonely: false, fit_lowpos: false, fit_tense: false } });
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return setMsg('활동 이름을 적어 주세요.');
    if (!Object.values(f.helps).some(Boolean)) return setMsg('어떤 마음일 때 좋은지 하나 이상 골라 주세요.');
    // 고른 마음은 1.0, 안 고른 마음은 0.2 (조금은 도움이 될 수 있으니 0 대신)
    const fit = FIT.map((x) => (f.helps[x.key] ? 1 : 0.2));
    const { error } = await supabase.from('activities').insert(toRow(member.family_id, {
      name: f.name.trim(), icon: f.icon, mode: 'offline', fit,
      guide: f.guide.trim()   // 비워 두면 어르신 화면이 이름에 맞는 조사를 붙여 기본 안내를 만든다
    }));
    if (error) return setMsg(error.message.includes('duplicate') ? '같은 이름의 활동이 이미 있어요.' : error.message);
    await reload();
    onDone();
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>활동 더하기</h2>
      <div className="field">
        <label htmlFor="a-name">활동 이름</label>
        <input id="a-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="예) 동네 산책" />
      </div>
      <div className="field">
        <span className="lbl">그림</span>
        <div className="choice">
          {ACTIVITY_ICONS.map((ic) => (
            <button type="button" key={ic} aria-pressed={f.icon === ic} aria-label={ic} onClick={() => setF({ ...f, icon: ic })}><Icon name={ic} /></button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="lbl">이럴 때 좋아요</span>
        <div className="choice">
          {FIT.map((x) => (
            <button type="button" key={x.key} aria-pressed={f.helps[x.key]} onClick={() => setF({ ...f, helps: { ...f.helps, [x.key]: !f.helps[x.key] } })}>{x.label}</button>
          ))}
        </div>
        <span className="hint">몽실이가 지금 마음에 맞는 활동을 고를 때 써요.</span>
      </div>
      <div className="field">
        <label htmlFor="a-guide">몽실이가 할 안내 말</label>
        <textarea id="a-guide" className="input" value={f.guide} onChange={(e) => setF({ ...f, guide: e.target.value })} placeholder="예) 집 앞을 10분만 천천히 걸어 보세요. 다녀오시면 초록 버튼을 눌러 주세요." />
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="row">
        <button className="btn go">더하기</button>
        <button type="button" className="btn quiet" onClick={onDone}>그만두기</button>
      </div>
    </form>
  );
}

export default function ActivitiesTab({ data, member, reload }) {
  const [adding, setAdding] = useState(false);
  if (!data.activities) return (
    <div className="card">
      <h2>기분·활동 기능이 아직 꺼져 있어요</h2>
      <p className="muted">Supabase SQL Editor 에서 <code>supabase/002_mood_activities.sql</code> 을 실행하면 켜져요.</p>
    </div>
  );

  async function update(a, patch) {
    await supabase.from('activities').update(patch).eq('id', a.id);
    reload();
  }

  const logs = data.activityLogs;
  return (
    <>
      <section className="card">
        <h2>활동 목록</h2>
        <p className="muted" style={{ fontSize: 15 }}>몽실이는 지금 마음(40%), 지난번 하고 난 뒤 마음 변화(40%), 좋아하는 정도와 다시 하고 싶은지(20%)를 합쳐 추천해요.</p>
        {data.activities.map((a) => {
          const mine = logs.filter((l) => l.activity_id === a.id);
          const good = mine.filter((l) => l.improved_all).length;
          const avg = mine.length ? mine.reduce((s, l) => s + change(l), 0) / mine.length : null;
          return (
            <div className="list-row" key={a.id} style={{ alignItems: 'flex-start', opacity: a.active ? 1 : 0.5 }}>
              <Icon name={a.icon} />
              <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <strong>{a.name}</strong>
                <span className="muted" style={{ fontSize: 15 }}>
                  {FIT.filter((x) => a[x.key] >= 0.5).map((x) => x.label).join(' · ') || '어느 마음에나'}
                  {mine.length ? ` · ${mine.length}번 함, 모두 나아진 날 ${good}번, 평균 변화 ${avg > 0 ? '+' : ''}${avg.toFixed(1)}` : ' · 아직 기록 없음'}
                </span>
                <div className="row" style={{ gap: 8 }}>
                  <select className="input" style={{ width: 'auto', minHeight: 44 }} aria-label={`${a.name} 좋아하는 정도`} value={a.preference} onChange={(e) => update(a, { preference: Number(e.target.value) })}>
                    {PREF.map((p, i) => <option key={p} value={i + 1}>{p}</option>)}
                  </select>
                  <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={a.active} onChange={(e) => update(a, { active: e.target.checked })} style={{ width: 20, height: 20 }} />
                    추천에 넣기
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </section>
      {adding ? <AddForm member={member} reload={reload} onDone={() => setAdding(false)} />
        : <button className="btn go" onClick={() => setAdding(true)}>+ 활동 더하기</button>}
      <section className="card">
        <h2>최근 활동 기록</h2>
        {!logs.length && <p className="muted">어르신이 몽실이와 활동을 하고 나면 여기에 쌓여요.</p>}
        {logs.slice(0, 10).map((l) => {
          const a = data.activities.find((x) => x.id === l.activity_id);
          return (
            <div className="list-row" key={l.id}>
              <div className="grow">
                <strong>{a?.name ?? '지운 활동'}</strong>
                <p className="muted" style={{ fontSize: 15 }}>
                  {new Date(l.finished_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {` · 외로움 ${l.pre_lonely}→${l.post_lonely} · 기분 ${l.pre_positive}→${l.post_positive} · 긴장 ${l.pre_tense}→${l.post_tense} · 만족 ${l.satisfaction}/5`}
                </p>
              </div>
              {l.improved_all ? <span className="badge green">모두 나아짐</span> : <span className="badge">기록</span>}
            </div>
          );
        })}
      </section>
    </>
  );
}
