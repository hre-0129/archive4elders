// 기분 맞춤 활동 추천 알고리즘 (조원 설계: 현재 감정 적합성 40% + 과거 반응 40% + 선호·재참여 20%)
// 화면·데이터베이스와 상관없는 '순수 계산'만 모았다 → 같은 입력이면 늘 같은 결과, 따로 테스트하기 쉽다.
//
// 마음(mood) = { lonely: 외로움, positive: 긍정적 기분, tense: 긴장감 }  각 1~5
// 활동(activity) = activities 표 한 줄,  기록(log) = activity_logs 표 한 줄

export const MOOD_KEYS = ['lonely', 'positive', 'tense'];

const W_FIT = 0.4, W_PAST = 0.4, W_PREF = 0.2;
const PAST_PRIOR = 1;    // 과거 반응: 기록이 적을 때 '보통(50점)' 쪽으로 당기는 힘 (가상의 기록 1개만큼)
const PREF_PRIOR = 2;    // 선호도: 가족이 정한 선호도를 가상의 기록 2개만큼 믿는다
const HALF_LIFE_DAYS = 30; // 30일 지난 기록은 절반만 반영 (요즘 반응을 더 중요하게)

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const to100 = (v1to5) => ((v1to5 - 1) / 4) * 100; // 1~5점 → 0~100점

// ① 지금 마음에서 '필요한 정도' (0~1). 외로울수록, 기분이 낮을수록, 긴장될수록 1에 가깝다
export function needs(m) {
  return { lonely: (m.lonely - 1) / 4, lowpos: (5 - m.positive) / 4, tense: (m.tense - 1) / 4 };
}

// 현재 감정 적합성 (0~100): 활동이 잘 맞는 마음(fit)과 지금 필요한 정도(needs)의 가중 평균
export function fitScore(a, n) {
  const w = a.fit_lonely + a.fit_lowpos + a.fit_tense;
  if (w === 0) return 50;
  return (100 * (a.fit_lonely * n.lonely + a.fit_lowpos * n.lowpos + a.fit_tense * n.tense)) / w;
}

// 활동 한 번의 마음 변화량: 외로움 감소 + 긍정 기분 증가 + 긴장감 감소 (각 -4~+4) 의 평균
export function change(log) {
  return ((log.pre_lonely - log.post_lonely) + (log.post_positive - log.pre_positive) + (log.pre_tense - log.post_tense)) / 3;
}

// 조원 기준: 세 가지가 '모두' 좋아졌으면 긍정적 변화
export function classifyChange(pre, post) {
  const better = [pre.lonely > post.lonely, post.positive > pre.positive, pre.tense > post.tense];
  return { all: better.every(Boolean), any: better.some(Boolean), delta: change({
    pre_lonely: pre.lonely, pre_positive: pre.positive, pre_tense: pre.tense,
    post_lonely: post.lonely, post_positive: post.positive, post_tense: post.tense
  }) };
}

const ageWeight = (log, now) => 0.5 ** ((now - new Date(log.finished_at)) / 86400000 / HALF_LIFE_DAYS);

// ② 과거 감정 변화 반응 (0~100): 변화량 0 → 50점, +2 이상 → 100점. 오래된 기록은 덜 반영하고, 기록이 적으면 50점 쪽으로.
export function pastScore(logs, now) {
  let sum = 0, wsum = 0;
  for (const l of logs) { const w = ageWeight(l, now); sum += w * clamp(50 + 25 * change(l), 0, 100); wsum += w; }
  return (sum + PAST_PRIOR * 50) / (wsum + PAST_PRIOR);
}

// ③ 개인 선호도·재참여 의사 (0~100): 가족이 정한 선호도에서 출발해, 만족도와 '또 하고 싶어요'로 고쳐 간다
export function prefScore(a, logs, now) {
  let sum = 0, wsum = 0;
  for (const l of logs) { const w = ageWeight(l, now); sum += w * (0.5 * to100(l.satisfaction) + 0.5 * (l.rejoin ? 100 : 0)); wsum += w; }
  return (sum + PREF_PRIOR * to100(a.preference)) / (wsum + PREF_PRIOR);
}

const NEED_REASON = { lonely: '외로운 마음이 드셔서', lowpos: '기분이 조금 가라앉아 계셔서', tense: '마음이 긴장되어 계셔서' };

// 추천 이유 문장: 점수에 가장 크게 기여한 것 1~2개
function reasonFor(a, n, logs, pref) {
  const parts = [];
  const contrib = { lonely: a.fit_lonely * n.lonely, lowpos: a.fit_lowpos * n.lowpos, tense: a.fit_tense * n.tense };
  const [topNeed, topVal] = Object.entries(contrib).sort((x, y) => y[1] - x[1])[0];
  if (topVal >= 0.3) parts.push(NEED_REASON[topNeed]);
  if (logs.length) {
    const good = logs.filter((l) => change(l) > 0).length;
    if (good > 0) parts.push(`지난 ${logs.length}번 중 ${good}번은 하고 나서 마음이 나아지셨어요`);
  }
  if (pref >= 70 && parts.length < 2) parts.push('좋아하시는 활동이에요');
  return parts.slice(0, 2).join(', ') || '오늘 해 보기 좋은 활동이에요';
}

// 모든 활동의 추천 점수를 계산해 높은 순으로 돌려준다
export function recommend(mood, activities, logs, now = new Date()) {
  const n = needs(mood);
  return activities
    .map((a) => {
      const mine = logs.filter((l) => l.activity_id === a.id);
      const fit = fitScore(a, n);
      const pref = prefScore(a, mine, now);
      // 과거 기록이 없으면 임의의 점수를 만들지 않고, 현재 감정과 선호도만으로 (가중치를 0.4:0.2 비율로 다시 나눈다)
      const past = mine.length ? pastScore(mine, now) : null;
      const score = past === null
        ? (W_FIT * fit + W_PREF * pref) / (W_FIT + W_PREF)
        : W_FIT * fit + W_PAST * past + W_PREF * pref;
      return { activity: a, score: Math.round(score), parts: { fit: Math.round(fit), past: past === null ? null : Math.round(past), pref: Math.round(pref) }, reason: reasonFor(a, n, mine, pref), count: mine.length };
    })
    .sort((x, y) => y.score - x.score);
}
