// 감각(L1)·느낌(L2)·의미(L5) 단계의 대답 버튼 목록.
// 작은 모델(gemma3:4b)은 한국어 활용을 자주 틀려서("붉었요", "흥했었어요") 이 단계의 버튼 말은 사람이 미리 적어 두고,
// AI는 이 목록에서 질문에 맞는 것을 '고르기만' 한다 (JSON 형식의 enum 으로 목록 밖의 말은 아예 못 쓰게).
// 사람·그날의 일 단계(L3·L4)는 사진마다 내용이 달라서 목록 없이 AI가 만든다.
//
// tone 은 AI 대신 여기서 정한다: bright 밝은 기억 / heavy 힘든 기억(→ 사다리가 위로하고 가벼운 질문으로) / neutral
// 목록을 늘리려면 [말, tone] 한 줄만 더하면 된다. 말은 "~요"로 끝나고 16자 이내.
const LISTS = {
  1: [
    ['밝았어요', 'bright'], ['어두웠어요', 'neutral'], ['알록달록했어요', 'bright'], ['북적였어요', 'neutral'],
    ['한산했어요', 'neutral'], ['시끄러웠어요', 'neutral'], ['조용했어요', 'neutral'], ['냄새가 좋았어요', 'bright'],
    ['날이 맑았어요', 'bright'], ['흐렸어요', 'neutral'], ['따뜻했어요', 'bright'], ['더웠어요', 'neutral'],
    ['추웠어요', 'neutral'], ['시원했어요', 'neutral'], ['바람이 불었어요', 'neutral']
  ],
  2: [
    ['즐거웠어요', 'bright'], ['신났어요', 'bright'], ['행복했어요', 'bright'], ['설렜어요', 'bright'],
    ['뿌듯했어요', 'bright'], ['편안했어요', 'bright'], ['정겨웠어요', 'bright'], ['떨렸어요', 'neutral'],
    ['바빴어요', 'neutral'], ['고단했어요', 'neutral'], ['그저 그랬어요', 'neutral'],
    ['힘들었어요', 'heavy'], ['쓸쓸했어요', 'heavy'], ['슬펐어요', 'heavy']
  ],
  5: [
    ['그리워요', 'neutral'], ['고마워요', 'bright'], ['소중한 날이에요', 'bright'], ['자랑스러워요', 'bright'],
    ['다시 가 보고 싶어요', 'bright'], ['웃음이 나요', 'bright'], ['아련해요', 'neutral'], ['열심히 살았어요', 'bright'],
    ['잘 살았다고 전하고 싶어요', 'bright'], ['건강하라고 하고 싶어요', 'bright'], ['마음이 아파요', 'heavy']
  ]
};

export const HELP = '잘 모르겠어요';

// 그 단계의 목록: [{ t: 말, tone }] — 목록이 없는 단계(3·4, 자유 조건)는 null
export function answersFor(level) {
  return LISTS[level] ? LISTS[level].map(([t, tone]) => ({ t, tone })) : null;
}
