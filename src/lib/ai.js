// 서버에서만 쓰는 AI 호출 모듈. AI_PROVIDER 환경변수로 gemini / ollama 를 고른다.
// 어느 AI든 같은 형식의 JSON을 받아 화면용 { say, options:[{t, kind, s}], done } 로 바꿔 돌려준다.
// (작은 모델도 헷갈리지 않게 AI에게는 question / buttons[{label, type, story}] 라는 쉬운 이름을 쓴다)

export const PROVIDER = (process.env.AI_PROVIDER || '').toLowerCase();

// 몽실이가 지켜야 할 규칙. 짧을수록 작은 모델이 빠르고 정확하다.
export function systemPrompt({ elderName }) {
  return `너는 '몽실이'. ${elderName} 님과 옛 사진을 보며 이야기한다. 어르신은 버튼만 누른다.
규칙:
- question: 존댓말 한 문장, 40자 이내. 맞고 틀림이 있는 질문(언제·누구·어디) 대신 느낌·분위기·감각을 묻는다.
- 사진에 보이는 것만 말하고, 보이지 않는 사실은 지어내지 않는다. 가족 설명은 가족의 생각이다.
- buttons: 2~3개. label은 어르신이 할 말, 한국어 12자 이내.
- type: 내용 대답 "pick", 네 "go", 아니요 "stop", 잘 모르겠어요 "help". 내용 대답이 있으면 "잘 모르겠어요"를 하나 넣는다.
- story: 그 버튼을 누르면 이야기책에 남을 과거형 한 문장. label 내용만 쓰고 새 사실을 더하지 않는다. 기록할 게 없으면 "".
- 힘든 이야기에는 공감하고 가벼운 질문으로 넘어간다. 같은 질문을 반복하지 않는다. 다시 묻지 않을 주제는 꺼내지 않는다.
- 4~5번 오갔으면 done: true.
예시:
{"question":"바다 냄새가 기억나세요?","buttons":[{"label":"시원했어요","type":"pick","story":"바닷바람이 시원했다."},{"label":"짭짤했어요","type":"pick","story":"바다 냄새가 짭짤했다."},{"label":"잘 모르겠어요","type":"help","story":""}],"done":false}`;
}

export function userPrompt({ photo, notes, history, skipped }) {
  const lines = [
    `사진 제목: ${photo.title}`,
    photo.period && `시기(가족이 적음): ${photo.period}`,
    photo.people?.length && `나온 사람(가족이 적음): ${photo.people.join(', ')}`,
    ...notes.map((n) => `${n.by} 설명: "${n.text}"`),
    skipped.length && `다시 묻지 않을 주제: ${skipped.join(', ')}`,
    ...history.map((h, i) => `${i + 1}. 몽실이: ${h.q} → 어르신: ${h.a}`),
    history.length ? '다음 질문을 JSON으로.' : '첫 질문을 JSON으로.'
  ];
  return lines.filter(Boolean).join('\n');
}

const SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    buttons: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, type: { type: 'string', enum: ['pick', 'go', 'stop', 'help'] }, story: { type: 'string' } },
        required: ['label', 'type', 'story']
      }
    },
    done: { type: 'boolean' }
  },
  required: ['question', 'buttons', 'done']
};

async function callGemini({ system, user, image }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY 가 설정되지 않았어요');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const parts = [{ text: user }];
  if (image) parts.unshift({ inline_data: { mime_type: image.mime, data: image.base64 } });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.7 }
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message || '알 수 없는 오류'}`);
  return body.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

async function callOllama({ system, user, image }) {
  const base = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'gemma3:4b';
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: false, format: SCHEMA, keep_alive: '30m',
      options: { temperature: 0.6, num_predict: 300 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user, ...(image ? { images: [image.base64] } : {}) }
      ]
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${body.error || 'Ollama 가 켜져 있는지 확인해 주세요'}`);
  return body.message?.content || '';
}

const KINDS = ['pick', 'go', 'stop', 'help'];
const HANGUL = /[가-힣]/;

// 이야기책 문장 검사. AI 문장이 버튼 말과 이어지고 "~다."로 끝나며 너무 길지 않을 때만 쓴다.
// 아니면 어르신이 고른 말을 그대로 옮겨 적는다 (없던 내용이 끼어들지 않도록).
function storyLine(story, label, title) {
  const stem = label.replace(/[^가-힣]/g, '').slice(0, 2);
  const s = story.trim().replace(/\s+/g, ' ');
  if (s && /다\.?$/.test(s) && s.includes(stem) && s.length <= label.length + 12) return s.endsWith('.') ? s : s + '.';
  const plain = label.replace(/(했|였|었|았|났|웠|왔)(어요|어|요)$/, '$1다.');
  return plain !== label ? plain : `'${title}' 사진을 보며 "${label}"라고 했다.`;
}

// AI 응답을 화면에 쓰기 안전한 모양으로 다듬는다. 쓸 수 없으면 오류.
function clean(raw, title) {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  const j = JSON.parse(text);
  const options = (Array.isArray(j.buttons) ? j.buttons : [])
    .map((b) => ({
      t: typeof b?.label === 'string' ? b.label.trim().slice(0, 16) : '',
      kind: KINDS.includes(b?.type) ? b.type : 'pick',
      s: typeof b?.story === 'string' && HANGUL.test(b.story) ? b.story.trim().slice(0, 120) : ''
    }))
    // 버튼 글자가 한국어가 아니거나(예: "pick") 겹치면 버린다
    .filter((o, i, all) => HANGUL.test(o.t) && !KINDS.includes(o.t) && all.findIndex((x) => x.t === o.t) === i)
    .slice(0, 3);
  // "잘 모르겠어요" 같은 대답은 이야기책에 남기지 않는다
  // 파란 버튼은 늘 같은 말로 (작은 모델이 "도움이 필요해요" 같은 엉뚱한 말을 넣기도 한다)
  options.forEach((o) => {
    if (o.kind === 'help') { o.s = ''; o.t = '잘 모르겠어요'; }
    else if (o.kind === 'pick') o.s = storyLine(o.s, o.t, title);
  });
  const say = typeof j.question === 'string' ? j.question.trim() : '';
  if (!HANGUL.test(say) || options.length < 2) throw new Error('AI 응답 형식이 맞지 않아요');
  return { say: say.slice(0, 80), options, done: Boolean(j.done) };
}

const norm = (s) => s.replace(/[^가-힣a-z0-9]/gi, '');

export async function askMongsil(input) {
  const args = { system: systemPrompt(input), user: userPrompt(input), image: input.image };
  const call = PROVIDER === 'ollama' ? callOllama : PROVIDER === 'gemini' ? callGemini : null;
  if (!call) throw new Error('AI_PROVIDER 가 설정되지 않았어요');
  const asked = new Set(input.history.map((h) => norm(h.q)));
  const once = async (a) => {
    // 형식이 한 번 깨지면 한 번만 다시 시도한다
    try { return clean(await call(a), input.photo.title); } catch (e) {
      if (e instanceof SyntaxError || e.message.includes('형식')) return clean(await call(a), input.photo.title);
      throw e;
    }
  };
  let turn = await once(args);
  // 작은 모델은 같은 질문을 되풀이하기도 한다 → 한 번 더 부탁하고, 그래도 같으면 대화를 마무리한다
  if (asked.has(norm(turn.say))) {
    turn = await once({ ...args, user: `${args.user}\n(앞에서 한 질문과 다른 새로운 질문으로)` });
    if (asked.has(norm(turn.say))) turn.done = true;
  }
  return turn;
}
