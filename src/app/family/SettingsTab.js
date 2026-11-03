'use client';
// 초대 코드, 가족 구성원, 다시 묻지 않을 주제, 대화 방식 실험, 로그아웃
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import TalkMetrics from './TalkMetrics';

export default function SettingsTab({ family, members, data, reload, reloadMember }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(family.invite_code); setCopied(true); } catch { setCopied(false); }
  }
  async function unskip(topic) {
    await supabase.from('skipped_topics').delete().eq('family_id', family.id).eq('topic', topic);
    reload();
  }

  return (
    <>
      <section className="card">
        <h2>초대 코드</h2>
        <p className="code">{family.invite_code}</p>
        <p className="muted">다른 가족이나 어르신 계정이 가입한 뒤 이 코드를 넣으면 같은 가족으로 연결돼요.</p>
        <button className="btn quiet" onClick={copy}>{copied ? '복사했어요' : '코드 복사'}</button>
      </section>
      <section className="card">
        <h2>가족 구성원</h2>
        {members.map((m) => (
          <div className="list-row" key={m.id}>
            <div className="avatar sm">{m.display_name.slice(-2)}</div>
            <div className="grow"><strong>{m.display_name}</strong><p className="muted">{m.role === 'elder' ? '어르신' : m.relation}</p></div>
          </div>
        ))}
        {!members.some((m) => m.role === 'elder') && (
          <p className="notice">아직 어르신 계정이 없어요. 어르신이 쓰실 기기에서 새로 가입한 뒤, &apos;어르신 본인&apos;을 고르고 위 초대 코드를 넣어 주세요.</p>
        )}
      </section>
      <section className="card">
        <h2>다시 묻지 않을 이야기</h2>
        {data.skipped.length ? data.skipped.map((s) => (
          <div className="list-row" key={s.topic}>
            <span className="grow">{s.topic}</span>
            <button className="btn quiet" onClick={() => unskip(s.topic)}>다시 물어도 돼요</button>
          </div>
        )) : <p className="muted">어르신이 대화 중 &apos;다른 이야기&apos;를 누르면 그 주제가 여기에 남고, 몽실이가 다시 묻지 않아요.</p>}
      </section>
      <TalkMetrics family={family} data={data} reloadMember={reloadMember} />
      <section className="card">
        <h2>몽실이의 약속</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2em', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>어르신이 고른 대답만 이야기책 문장으로 만들어요.</li>
          <li>가족이 남긴 사진 설명을 어르신의 기억처럼 말하지 않아요.</li>
          <li>이야기를 나눌 때는 기억이 맞는지 시험하지 않아요. 기억 연습은 가족이 만든 문제만, 하루 3개까지 여쭤봐요.</li>
          <li>저장과 공유는 어르신이 초록 버튼을 누른 다음에만 해요.</li>
        </ul>
      </section>
      <button className="btn quiet" onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>로그아웃</button>
    </>
  );
}
