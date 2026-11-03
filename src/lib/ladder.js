// 회상 대화 사다리: 사진 이야기에서 '다음에 어떤 종류의 질문을 할지'를 정하는 알고리즘.
// LLM은 이 단계가 정한 종류의 질문을 말로 옮기기만 한다. (화면·서버와 상관없는 순수 계산)
//
// 원리: 회상 요법처럼 부담이 적은 감각 질문(L1)에서 시작해, 어르신이 이야기에 빠져들면 한 단계씩 깊이(L5) 들어가고,
//       어려워하면 머물거나 내려오고, 힘든 기억이 나오면 위로하고 가벼운 질문으로 돌아온다.

export const LEVELS = [
  null,
  { lv: 1, name: '감각', ask: '사진에 보이는 풍경·물건·색, 또는 그때의 소리·냄새·날씨처럼 감각을 묻는다', example: '뒤에 바다가 보이네요. 파도 소리가 기억나세요?' },
  { lv: 2, name: '느낌', ask: '그때의 기분이나 분위기를 묻는다', example: '그날은 마음이 어떠셨어요?' },
  { lv: 3, name: '사람', ask: '함께한 사람과의 관계나 추억을 묻는다. 누구인지 맞히게 하지 않는다', example: '옆에 계신 분과는 자주 놀러 다니셨어요?' },
  { lv: 4, name: '그날의 일', ask: '그날 있었던 일, 먹은 것, 한 일을 묻는다', example: '그날 바닷가에서 뭘 드셨어요?' },
  { lv: 5, name: '의미', ask: '이 기억이 지금 어떤 의미인지, 가족에게 전하고 싶은 말을 묻는다', example: '손주들에게 이날 이야기를 해 준다면 뭐라고 하실래요?' }
];

export const MAX_TURNS = 6;     // 한 사진으로 최대 6번까지 묻는다
const DOWN_AFTER_HELP = 2;      // '잘 모르겠어요'가 2번 이어지면 한 단계 내려간다 (한 번에 바로 내려가면 단계가 너무 출렁인다)

// 대화 시작 상태
export function startLadder() {
  return { level: 1, helpStreak: 0, turns: 0, maxLevel: 1, comfort: false, done: false, path: [1] };
}

// 어르신이 버튼 하나를 고른 뒤의 다음 상태.
// choice.kind: 'pick'(내용 대답) 'go'(네) 'stop'(아니요) 'help'(잘 모르겠어요)
// choice.tone: 'bright'(밝은 기억) 'heavy'(힘든 기억) 'neutral'
export function nextLadder(s, choice) {
  const turns = s.turns + 1;
  let level = s.level, helpStreak = 0, comfort = false;

  if (choice.tone === 'heavy') {
    level = 1; comfort = true;                                   // 힘든 기억 → 위로하고 가장 가벼운 질문으로
  } else if (choice.kind === 'help' || choice.kind === 'stop') {
    helpStreak = s.helpStreak + 1;                               // 어려워함 → 같은 단계에서 다른 질문
    if (helpStreak >= DOWN_AFTER_HELP) { level = Math.max(1, s.level - 1); helpStreak = 0; }
  } else {
    level = Math.min(5, s.level + 1);                            // 빠져듦 → 한 단계 깊이
  }

  const answeredTop = s.level === 5 && choice.kind === 'pick';   // 가장 깊은 질문에 대답했으면 마무리
  return {
    level, helpStreak, turns, comfort,
    maxLevel: Math.max(s.maxLevel, level),
    done: answeredTop || turns >= MAX_TURNS,
    path: [...s.path, level]
  };
}
