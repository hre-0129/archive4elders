// 사진 대화 지표: 한 번의 대화를 기록하고(newSession·addAnswer), 조건별로 요약하고(summarize), CSV로 바꾼다(toCSV).
// 데이터베이스와 상관없는 순수 계산만 모았다. (저장은 어르신 화면, 요약 표는 가족 화면에서 이 함수들을 부른다)
import { change } from './recommend';

// 대화 하나를 시작할 때의 빈 기록
export function newSession(condition, photoId) {
  return {
    condition, photo_id: photoId ?? null, started_at: new Date().toISOString(),
    turns: 0, picks: 0, helps: 0, heavies: 0, path: [], history: [], ended: false, id: null
  };
}

// 어르신이 버튼 하나를 고를 때마다 (원래 기록은 두고 새 기록을 돌려준다)
export function addAnswer(s, { q, a, kind, tone, level }) {
  return {
    ...s,
    turns: s.turns + 1,
    picks: s.picks + (kind === 'pick' ? 1 : 0),
    helps: s.helps + (kind === 'help' || kind === 'stop' ? 1 : 0),
    heavies: s.heavies + (tone === 'heavy' ? 1 : 0),
    path: level ? [...s.path, level] : s.path,
    history: [...s.history, { q, a, kind, tone: tone ?? null, level: level ?? null }]
  };
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// 조건(사다리·자유·각본)별로 비교 표 한 줄씩
// 몰입도 = 내용 대답 비율, 깊이 = 최고 단계, 저장률 = 이야기책으로 이어진 비율, 정서 변화 = 연결된 활동 기록의 전후 변화
export function summarize(sessions, activityLogs = []) {
  const byLog = new Map(activityLogs.map((l) => [l.id, l]));
  const groups = {};
  for (const s of sessions) (groups[s.condition] ||= []).push(s);
  return Object.entries(groups).map(([condition, rows]) => {
    const answered = rows.filter((r) => r.turns > 0);
    const moods = rows.map((r) => byLog.get(r.activity_log_id)).filter(Boolean).map(change);
    return {
      condition,
      n: rows.length,
      turns: avg(rows.map((r) => r.turns)),
      pickRate: avg(answered.map((r) => r.picks / r.turns)),
      maxLevel: avg(rows.filter((r) => r.max_level).map((r) => r.max_level)),
      saveRate: avg(rows.map((r) => (r.story_saved ? 1 : 0))),
      heavyRate: avg(answered.map((r) => r.heavies / r.turns)),
      mood: avg(moods),
      moodN: moods.length
    };
  });
}

// 파이썬(pandas.read_csv)으로 분석할 수 있게 한 대화 = 한 줄 CSV
export function toCSV(sessions, activityLogs = []) {
  const byLog = new Map(activityLogs.map((l) => [l.id, l]));
  const cols = ['started_at', 'condition', 'end_reason', 'turns', 'picks', 'helps', 'heavies', 'max_level', 'path',
    'story_saved', 'story_lines', 'mood_change', 'questions', 'answers'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = sessions.map((s) => {
    const log = byLog.get(s.activity_log_id);
    const row = {
      ...s,
      path: s.path.join('-'),
      mood_change: log ? change(log).toFixed(2) : '',
      questions: s.history.map((h) => h.q).join(' | '),
      answers: s.history.map((h) => h.a).join(' | ')
    };
    return cols.map((c) => esc(row[c])).join(',');
  });
  return [cols.join(','), ...lines].join('\n');
}
