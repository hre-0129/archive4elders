// 기억 연습(간격 복습) 계산. 데이터베이스는 건드리지 않는 순수 함수만 둔다 (recommend.js 와 같은 방식).
// 조원 설계: 처음 간격 1일, 맞히면 기존 간격 × 1.5 를 올림, 틀리면 1일로, 최대 5일
//   연속으로 맞히면 1 → 2 → 3 → 5 → 5 …  (1.5 → 2, 3 → 3, 4.5 → 5, 7.5 → 5)
export const RULE = { first: 1, growth: 1.5, max: 5 };

export const DONT_KNOW = '잘 모르겠어요';
export const PER_DAY = 3; // 하루에 묻는 문제 수 (대화가 시험처럼 길어지지 않게)

export function nextInterval(prev, correct, rule = RULE) {
  if (!correct) return rule.first;
  return Math.min(rule.max, Math.ceil(prev * rule.growth));
}

// 'YYYY-MM-DD' 에 n일 더하기 (시간대와 상관없게 UTC 정오 기준으로 계산)
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}

// 오늘 물을 문제: 날짜가 된 것 중 가장 오래 밀린 것부터 limit 개
export function dueItems(items, today, limit = PER_DAY) {
  return items
    .filter((it) => it.active && it.next_due <= today)
    .sort((a, b) => a.next_due.localeCompare(b.next_due) || a.interval_days - b.interval_days)
    .slice(0, limit);
}

// 정답과 다른 보기를 섞는다 (화면에 보일 때마다 순서가 바뀌지 않도록 문제를 낼 때 한 번만 부른다)
export function shuffledChoices(item) {
  const list = [item.answer, ...(item.wrong || []).filter((w) => w && w !== item.answer)];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// 대답 하나를 채점하고, 문제에 쓸 새 값과 기록 한 줄을 만든다
export function grade(item, chosen, today, responseMs = null) {
  const correct = chosen === item.answer;
  const after = nextInterval(item.interval_days, correct);
  return {
    correct,
    update: { interval_days: after, next_due: addDays(today, after), streak: correct ? item.streak + 1 : 0 },
    log: {
      family_id: item.family_id, item_id: item.id, due_date: item.next_due, reviewed_on: today,
      interval_before: item.interval_days, interval_after: after, correct, chosen, response_ms: responseMs
    }
  };
}

// 실험 요약: 간격(며칠 만에 다시 물었는지)별 정답률. 간격이 길어져도 정답률이 유지되는지 보는 표
export function accuracyByInterval(logs) {
  const by = {};
  for (const l of logs) {
    const k = l.interval_before;
    by[k] = by[k] || { interval: k, n: 0, correct: 0 };
    by[k].n++;
    if (l.correct) by[k].correct++;
  }
  return Object.values(by).sort((a, b) => a.interval - b.interval)
    .map((r) => ({ ...r, rate: Math.round((r.correct / r.n) * 100) }));
}
