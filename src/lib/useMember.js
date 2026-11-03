'use client';
// 지금 로그인한 사람과, 그 사람이 속한 가족 정보를 불러오는 React 훅.
// 상태: loading → (로그인 안 됨: user=null) / (가족 없음: member=null) / (준비됨)
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

const EMPTY = { loading: false, user: null, member: null, family: null, members: [] };

export function useMember() {
  const [state, setState] = useState({ ...EMPTY, loading: true });

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return setState(EMPTY);

      const { data: mine } = await supabase.from('members').select('*').eq('user_id', user.id).limit(1);
      const member = mine?.[0] ?? null;
      if (!member) return setState({ ...EMPTY, user });

      const [{ data: family }, { data: members }] = await Promise.all([
        supabase.from('families').select('*').eq('id', member.family_id).single(),
        supabase.from('members').select('*').eq('family_id', member.family_id).order('created_at')
      ]);
      setState({ loading: false, user, member, family, members: members || [] });
    } catch (e) {
      // 네트워크 오류 등으로 실패해도 '불러오는 중'에 갇히지 않게 한다.
      console.error(e);
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    load();
    // 이 콜백 안에서 곧바로 supabase 를 다시 부르면 인증 잠금이 풀리지 않아 멈출 수 있다
    // (supabase-js 알려진 문제). setTimeout 으로 콜백이 끝난 뒤에 부른다.
    const { data: sub } = supabase.auth.onAuthStateChange(() => { setTimeout(load, 0); });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  return { ...state, reload: load };
}
