'use client';
// 가입 직후 한 번: 새 가족을 만들거나, 초대 코드로 들어간다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const RELATIONS = ['딸', '아들', '며느리', '사위', '손녀', '손자', '배우자', '기타'];

export default function Setup() {
  const router = useRouter();
  const [how, setHow] = useState('join');
  const [role, setRole] = useState('family');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('딸');
  const [familyName, setFamilyName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const rel = role === 'elder' ? '본인' : relation;
    const { error } = how === 'create'
      ? await supabase.rpc('create_family', { p_name: familyName || `${name} 님 가족`, p_display_name: name, p_relation: rel, p_role: role })
      : await supabase.rpc('join_family', { p_code: code, p_display_name: name, p_relation: rel, p_role: role });
    setBusy(false);
    if (error) return setMsg(error.message);
    router.replace('/');
  }

  return (
    <main className="page" style={{ maxWidth: 520 }}>
      <h1>가족 연결하기</h1>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <span className="lbl">이 계정은 누가 쓰나요?</span>
          <div className="choice">
            <button type="button" aria-pressed={role === 'elder'} onClick={() => setRole('elder')}>어르신 본인</button>
            <button type="button" aria-pressed={role === 'family'} onClick={() => setRole('family')}>가족</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="name">{role === 'elder' ? '어르신 성함' : '내 이름'}</label>
          <input id="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder={role === 'elder' ? '예) 김순자' : '예) 이하은'} />
          <span className="hint">몽실이가 이 이름으로 불러요.</span>
        </div>
        {role === 'family' && (
          <div className="field">
            <label htmlFor="rel">어르신과의 관계</label>
            <select id="rel" className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
              {RELATIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <span className="lbl">가족 묶음</span>
          <div className="choice">
            <button type="button" aria-pressed={how === 'join'} onClick={() => setHow('join')}>초대 코드가 있어요</button>
            <button type="button" aria-pressed={how === 'create'} onClick={() => setHow('create')}>새로 만들기</button>
          </div>
        </div>
        {how === 'join' ? (
          <div className="field">
            <label htmlFor="code">초대 코드 6자리</label>
            <input id="code" className="input code" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <span className="hint">가족을 만든 사람의 &apos;설정&apos; 화면에 있어요.</span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="fam">가족 이름</label>
            <input id="fam" className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="예) 김순자 님 가족" />
            <span className="hint">만들고 나면 초대 코드가 생겨요. 다른 가족과 어르신 계정은 그 코드로 들어오면 돼요.</span>
          </div>
        )}
        {msg && <p className="error" role="alert">{msg}</p>}
        <button className="btn go full" disabled={busy}>연결하기</button>
      </form>
      <button className="btn quiet" onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>다른 계정으로 로그인</button>
    </main>
  );
}
