'use client';
// 어르신의 할 일 관리. 몽실이가 대화 처음에 하나씩 여쭤본다.
// ('오늘의 생활' 기능을 조원이 만들면 이 화면은 그쪽으로 연결한다)
import { useState } from 'react';
import { supabase, today } from '@/lib/supabase';
import Icon, { TASK_ICONS } from '@/components/Icon';

const ICON_LABEL = { pill: '약', music: '모임', phone: '통화', walk: '운동', pot: '요리', calendar: '기타' };

export default function TasksTab({ data, member, reload }) {
  const [f, setF] = useState({ title: '', short: '', time_label: '', icon: 'pill', daily: true, due_date: '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const t0 = today();

  async function add(e) {
    e.preventDefault();
    if (!f.title.trim()) return setMsg('할 일을 적어 주세요.');
    if (!f.daily && !f.due_date) return setMsg('날짜를 골라 주세요.');
    const { error } = await supabase.from('tasks').insert({
      family_id: member.family_id, title: f.title.trim(), short: f.short.trim() || f.title.trim().slice(0, 6),
      time_label: f.time_label.trim(), icon: f.icon, due_date: f.daily ? null : f.due_date, source: 'family'
    });
    if (error) return setMsg(error.message);
    setF({ ...f, title: '', short: '', time_label: '' }); setMsg('');
    reload();
  }
  async function remove(t) {
    await supabase.from('tasks').delete().eq('id', t.id);
    reload();
  }

  const daily = data.tasks.filter((t) => !t.due_date);
  const dated = data.tasks.filter((t) => t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date));

  const row = (t) => (
    <div className="list-row" key={t.id}>
      <Icon name={t.icon} />
      <div className="grow">
        <strong>{t.title}</strong>
        <p className="muted" style={{ fontSize: 15 }}>
          {t.due_date ? t.due_date : '매일'} {t.time_label}
          {t.source === 'elder' && ' · 어르신이 대화에서 남김'}
        </p>
      </div>
      {t.done_on === t0 ? <span className="badge green">오늘 했어요</span> : <span className="badge">아직</span>}
      <button className="btn quiet" onClick={() => remove(t)}>지우기</button>
    </div>
  );

  return (
    <>
      <form className="card" onSubmit={add}>
        <h2>할 일 더하기</h2>
        <div className="field">
          <label htmlFor="t-title">할 일</label>
          <input id="t-title" className="input" value={f.title} onChange={set('title')} placeholder="예) 혈압약 먹기" />
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="t-short">짧은 이름</label>
            <input id="t-short" className="input" value={f.short} onChange={set('short')} placeholder="예) 혈압약" maxLength={10} />
            <span className="hint">화면 위 작은 칸에 보여요.</span>
          </div>
          <div className="field">
            <label htmlFor="t-time">시간</label>
            <input id="t-time" className="input" value={f.time_label} onChange={set('time_label')} placeholder="예) 오전 9시" />
          </div>
        </div>
        <div className="field">
          <span className="lbl">그림</span>
          <div className="choice">
            {TASK_ICONS.map((ic) => (
              <button type="button" key={ic} aria-pressed={f.icon === ic} onClick={() => setF({ ...f, icon: ic })}>
                <Icon name={ic} />{ICON_LABEL[ic]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lbl">언제</span>
          <div className="choice">
            <button type="button" aria-pressed={f.daily} onClick={() => setF({ ...f, daily: true })}>매일</button>
            <button type="button" aria-pressed={!f.daily} onClick={() => setF({ ...f, daily: false })}>하루만</button>
          </div>
          {!f.daily && <input className="input" type="date" aria-label="날짜" value={f.due_date} onChange={set('due_date')} />}
        </div>
        {msg && <p className="error" role="alert">{msg}</p>}
        <button className="btn go">더하기</button>
      </form>
      <section className="card">
        <h2>매일 하는 일</h2>
        {daily.length ? daily.map(row) : <p className="muted">아직 없어요.</p>}
      </section>
      <section className="card">
        <h2>날짜가 정해진 일</h2>
        {dated.length ? dated.map(row) : <p className="muted">아직 없어요. 답장에 약속을 넣으면 어르신이 여기로 남길 수 있어요.</p>}
      </section>
    </>
  );
}
