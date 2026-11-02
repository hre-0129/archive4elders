// 몽실이 사진 대화 각본. 고른 사진의 이름·사람 정보로 질문과 버튼을 만든다.
// (나중에 AI를 연결하면 이 함수가 AI 응답으로 바뀐다. 화면 쪽은 그대로 둔다.)
// 버튼 kind: go(초록) stop(빨강) help(파랑) pick(분홍 테두리)
// s: 이 버튼을 누르면 이야기책 초안에 들어갈 문장. s가 없는 대답은 기록하지 않는다.

export function talkNode(key, photo, uploaderName, elderName = '') {
  const title = photo?.title ?? '';
  const people = (photo?.people ?? []).slice(0, 3);

  switch (key) {
    case 'start':
      return {
        skipNext: 'mood',
        say: uploaderName ? `${uploaderName} 님이 올린 사진이 있어요. 같이 볼까요?` : '예전에 올려 두신 사진이 있어요. 같이 볼까요?',
        opts: [
          { t: '네, 볼래요', icon: 'check', kind: 'go', next: 'look' },
          { t: '다음에 볼래요', icon: 'x', kind: 'stop', next: 'bye', pre: '알겠어요. ' }
        ]
      };
    case 'look':
      return {
        topic: title, skipNext: 'mood', photo: true,
        say: `'${title}' 사진이에요. 이 사진을 보니 어떤 느낌이 드세요?`,
        opts: [
          { t: '반가워요', kind: 'pick', s: `'${title}' 사진을 보니 반가웠다.`, next: 'who' },
          { t: '그리워요', kind: 'pick', s: `'${title}' 사진을 보니 그 시절이 그리웠다.`, next: 'who' },
          { t: '잘 모르겠어요', icon: 'question', kind: 'help', next: 'who', pre: '괜찮아요. 꼭 기억하지 않으셔도 돼요. ' }
        ]
      };
    case 'who':
      return {
        topic: title, skipNext: 'when', photo: true,
        say: '사진 속에 아는 얼굴이 있어요?',
        opts: people.length
          ? [
              ...people.map((p) => (p === elderName
                ? { t: '나', kind: 'pick', s: '사진에서 내 얼굴을 찾았다.', next: 'when' }
                : { t: p, kind: 'pick', s: `사진에서 ${p}의 얼굴을 알아보았다.`, next: 'when' })),
              { t: '잘 모르겠어요', icon: 'question', kind: 'help', next: 'when', pre: '괜찮아요. ' }
            ]
          : [
              { t: '네, 있어요', icon: 'check', kind: 'go', s: '사진 속에서 아는 얼굴을 찾았다.', next: 'when' },
              { t: '아니요', icon: 'x', kind: 'stop', next: 'when', pre: '괜찮아요. ' }
            ]
      };
    case 'when':
      return {
        topic: `${title} 그때 일`, skipNext: 'wrap', photo: true,
        say: '그때는 어떤 때였어요?',
        opts: [
          { t: '즐거운 때였어요', kind: 'pick', s: '그때는 즐거운 때였다.', next: 'wrap', pre: '즐거운 때였군요! ' },
          { t: '힘든 때였어요', kind: 'pick', s: '그때는 힘든 때였다.', next: 'wrap', pre: '힘든 시절이었군요. 이야기해 주셔서 고마워요. ' },
          { t: '그냥 그랬어요', kind: 'pick', next: 'wrap' }
        ]
      };
    case 'wrap':
      return {
        say: '오늘 이야기를 이야기책에 남길까요?',
        opts: [
          { t: '네, 남길래요', icon: 'check', kind: 'go', act: 'draft' },
          { t: '아니요', icon: 'x', kind: 'stop', next: 'bye', pre: '알겠어요, 남기지 않을게요. ' }
        ]
      };
    case 'mood':
    default:
      return {
        skipNext: 'bye',
        say: '오늘 기분은 어떠세요?',
        opts: [
          { t: '좋아요', kind: 'pick', next: 'bye', pre: '좋으시다니 저도 기뻐요! ' },
          { t: '그저 그래요', kind: 'pick', next: 'bye', pre: '그런 날도 있지요. ' }
        ]
      };
  }
}
