'use client';
// 지금 로그인한 사람과, 그 사람이 속한 가족 정보를 불러오는 React 훅.
// 상태: loading → (로그인 안 됨: user=null) / (가족 없음: member=null) / (준비됨)
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

export function useMember() {
  const [state, setState] = useState({ loading: true, user: null, member: null, family: null, members: [] });

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return setState({ loading: false, user: null, member: null, family: null, members: [] });

    const { data: mine } = await supabase.from('members').select('*').eq('user_id', user.id).limit(1);
    const member = mine?.[0] ?? null;
    if (!member) return setState({ loading: false, user, member: null, family: null, members: [] });

    const [{ data: family }, { data: members }] = await Promise.all([
      supabase.from('families').select('*').eq('id', member.family_id).single(),
      supabase.from('members').select('*').eq('family_id', member.family_id).order('created_at')
    ]);
    setState({ loading: false, user, member, family, members: members || [] });
  }, []);

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
  }, [load]);

  return { ...state, reload: load };
}
