'use client';
// 로그인 / 가입. 어르신 기기는 가족이 처음 한 번 로그인해 두면 계속 유지된다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const fn = mode === 'login' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) {
      const known = {
        'Invalid login credentials': '이메일이나 비밀번호가 맞지 않아요.',
        'User already registered': '이미 가입된 이메일이에요. 위에서 \'로그인\'을 눌러 주세요.'
      };
      return setMsg(known[error.message] || error.message);
    }
    if (!data.session) return setMsg('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
    router.replace('/');
  }

  return (
    <main className="page" style={{ maxWidth: 440 }}>
      <h1>기억 아카이브</h1>
      <div className="choice" role="group" aria-label="로그인 또는 가입">
        <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>로그인</button>
        <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>처음이에요 (가입)</button>
      </div>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input id="password" className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === 'signup' && <span className="hint">6자 이상</span>}
        </div>
        {msg && <p className="error" role="alert">{msg}</p>}
        <button className="btn go full" disabled={busy}>{mode === 'login' ? '로그인' : '가입하기'}</button>
      </form>
      <p className="muted">어르신이 쓰실 기기는 가족이 어르신 계정으로 한 번 로그인해 두면, 다음부터는 바로 몽실이 화면이 열려요.</p>
    </main>
  );
}
