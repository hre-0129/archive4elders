'use client';
// 첫 주소(/). 로그인 상태와 역할을 보고 알맞은 화면으로 보낸다.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseReady } from '@/lib/supabase';
import { useMember } from '@/lib/useMember';

function Setup() {
  return (
    <main className="page">
      <h1>Supabase 연결이 아직 안 되어 있어요</h1>
      <p><code>.env.local.example</code> 파일을 복사해 <code>.env.local</code>을 만들고, Supabase 주소와 키를 넣은 뒤 개발 서버를 다시 켜 주세요.</p>
    </main>
  );
}

function Router() {
  const router = useRouter();
  const { loading, user, member } = useMember();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!member) router.replace('/setup');
    else router.replace(member.role === 'elder' ? '/elder' : '/family');
  }, [loading, user, member, router]);
  return <main className="center"><p className="muted">불러오는 중…</p></main>;
}

export default function Home() {
  return supabaseReady ? <Router /> : <Setup />;
}
