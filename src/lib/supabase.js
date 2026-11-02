// Supabase 연결 하나를 만들어 앱 전체에서 같이 쓴다.
// 주소와 공개 키는 .env.local 파일에서 읽는다 (.env.local.example 참고).
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase 화면에 따라 키 이름이 anon 또는 publishable 로 나온다. 어느 쪽을 붙여 넣어도 되게 한다.
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const supabaseReady = Boolean(url && key);

export const supabase = supabaseReady
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

// 사진 파일은 비공개 저장소에 있으므로, 볼 때마다 1시간짜리 임시 주소를 받는다.
export async function signedUrls(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return {};
  const { data } = await supabase.storage.from('photos').createSignedUrls(list, 3600);
  const map = {};
  (data || []).forEach((d) => { if (d.signedUrl) map[d.path] = d.signedUrl; });
  return map;
}

// 오늘 날짜를 'YYYY-MM-DD' (한국 시간)로
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export function koreanDate(d = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(d);
}
