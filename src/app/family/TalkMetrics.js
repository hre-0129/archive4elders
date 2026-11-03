'use client';
// 가족 화면 '설정' 탭 안의 '대화 방식 실험' 칸: 조건 고르기 + 조건별 지표 비교 표 + CSV 내려받기
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { summarize, toCSV } from '@/lib/metrics';

const MODES = [
  { id: 'ladder', label: '회상 대화 사다리', desc: '감각 → 느낌 → 사람 → 그날의 일 → 의미 순서로 알고리즘이 질문 단계를 정해요.' },
  { id: 'free', label: 'AI 자유', desc: '단계 없이 AI가 알아서 질문해요. (비교용)' },
  { id: 'random', label: '무작위 (실험)', desc: '사진 대화마다 반반 무작위로 정해요. 두 방식을 공정하게 비교할 때 써요.' }
];
const COND_LABEL = { ladder: '사다리', free: 'AI 자유', script: '각본 (AI 꺼짐)' };
const pct = (x) => (x === null ? '–' : `${Math.round(x * 100)}%`);
const num = (x, d = 1) => (x === null ? '–' : x.toFixed(d));

export default function TalkMetrics({ family, data, reloadMember }) {
  const [busy, setBusy] = useState(false);
  if (!data.talkSessions) return (
    <section className="card">
      <h2>대화 방식 실험</h2>
      <p className="muted">Supabase SQL Editor 에서 <code>supabase/003_talk_metrics.sql</code> 을 실행하면 켜져요.</p>
    </section>
  );

  async function setMode(mode) {
    setBusy(true);
    await supabase.from('families').update({ talk_mode: mode }).eq('id', family.id);
    await reloadMember();
    setBusy(false);
  }

  function download() {
    const csv = toCSV(data.talkSessions, data.activityLogs);
    // 엑셀에서 한글이 깨지지 않게 맨 앞에 BOM(﻿)을 붙인다
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `talk_sessions_${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const rows = summarize(data.talkSessions, data.activityLogs);
  return (
    <section className="card">
      <h2>대화 방식 실험</h2>
      <div className="field">
        <span className="lbl">몽실이 사진 대화 방식</span>
        <div className="choice">
          {MODES.map((m) => (
            <button type="button" key={m.id} aria-pressed={family.talk_mode === m.id} disabled={busy} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
        <span className="hint">{MODES.find((m) => m.id === family.talk_mode)?.desc}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="metrics">
          <thead>
            <tr><th>방식</th><th>대화 수</th><th>평균 대답</th><th>몰입도</th><th>최고 단계</th><th>이야기책 저장</th><th>힘든 기억</th><th>정서 변화</th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.condition}>
                <td>{COND_LABEL[r.condition]}</td>
                <td>{r.n}</td>
                <td>{num(r.turns)}</td>
                <td>{pct(r.pickRate)}</td>
                <td>{num(r.maxLevel)}</td>
                <td>{pct(r.saveRate)}</td>
                <td>{pct(r.heavyRate)}</td>
                <td>{r.mood === null ? '–' : `${r.mood > 0 ? '+' : ''}${r.mood.toFixed(2)} (${r.moodN})`}</td>
              </tr>
            )) : <tr><td colSpan={8} className="muted">아직 기록된 사진 대화가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        몰입도 = 내용 대답을 고른 비율 · 최고 단계 = 사다리에서 들어간 가장 깊은 단계(1~5) ·
        정서 변화 = &apos;사진 보기&apos; 활동 전후 마음 변화 평균(괄호는 기록 수)
      </p>
      <button className="btn quiet" onClick={download} disabled={!data.talkSessions.length}>CSV로 내려받기 (파이썬·엑셀 분석용)</button>
    </section>
  );
}
