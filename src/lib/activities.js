// 활동 목록·기록을 데이터베이스에서 읽고 쓰는 곳. (계산은 recommend.js, 저장은 여기 — 역할을 나눴다)
import { supabase } from './supabase';

// 처음 쓰는 가족에게 넣어 줄 기본 활동 4가지 (조원 설계).
// fit: [외로울 때, 기분이 가라앉을 때, 긴장될 때] 얼마나 잘 맞는지 0~1
export const DEFAULT_ACTIVITIES = [
  { name: '대화하기', icon: 'chat', mode: 'offline', fit: [1.0, 0.3, 0.1], sort: 1,
    guide: '가족이나 이웃에게 전화하거나, 가까이 계신 분과 이야기를 나눠 보세요. 다 하시면 초록 버튼을 눌러 주세요.' },
  { name: '음악 듣기', icon: 'music', mode: 'offline', fit: [0.2, 0.8, 0.8], sort: 2,
    guide: '좋아하는 노래를 한두 곡 들어 보세요. 다 들으시면 초록 버튼을 눌러 주세요.' },
  { name: '사진 보기', icon: 'photo', mode: 'photo_talk', fit: [0.3, 0.8, 0.2], sort: 3, guide: '' },
  { name: '식물 돌보기', icon: 'leaf', mode: 'offline', fit: [0.1, 0.3, 1.0], sort: 4,
    guide: '화분에 물을 주거나 잎을 닦아 주세요. 다 하시면 초록 버튼을 눌러 주세요.' }
];

export const toRow = (fid, a) => ({
  family_id: fid, name: a.name, icon: a.icon, mode: a.mode, guide: a.guide, sort: a.sort ?? 99,
  fit_lonely: a.fit[0], fit_lowpos: a.fit[1], fit_tense: a.fit[2], preference: a.preference ?? 3
});

// 활동 목록과 최근 기록을 불러온다. 표가 아직 없으면(SQL 미실행) null 을 돌려줘서 기능을 끈다.
export async function loadActivities(fid) {
  let { data: acts, error } = await supabase.from('activities').select('*').eq('family_id', fid).order('sort');
  if (error) return null;
  if (!acts.length) {
    // 같은 이름은 한 번만 (두 기기에서 동시에 열어도 중복되지 않게)
    await supabase.from('activities').upsert(DEFAULT_ACTIVITIES.map((a) => toRow(fid, a)), { onConflict: 'family_id,name', ignoreDuplicates: true });
    ({ data: acts } = await supabase.from('activities').select('*').eq('family_id', fid).order('sort'));
  }
  const { data: logs } = await supabase.from('activity_logs').select('*').eq('family_id', fid)
    .order('finished_at', { ascending: false }).limit(300);
  return { activities: acts || [], logs: logs || [] };
}
