// 서버에서만 쓰는 AI 호출 모듈. AI_PROVIDER 환경변수로 gemini / ollama 를 고른다.
// 어느 AI든 같은 형식의 JSON을 받아 화면용 { say, options:[{t, kind, s, tone}] } 로 바꿔 돌려준다.
// (작은 모델도 헷갈리지 않게 AI에게는 question / buttons[{label, type, story, tone}] 라는 쉬운 이름을 쓴다)
// 무엇을 물을지(질문 단계)는 회상 대화 사다리(src/lib/ladder.js)가 정하고, AI는 그 단계의 질문을 말로 만든다.
import { LEVELS } from './ladder';

export const PROVIDER = (process.env.AI_PROVIDER || '').toLowerCase();

// 몽실이가 지켜야 할 규칙. 짧을수록 작은 모델이 빠르고 정확하다.
export function systemPrompt({ elderName }) {
  return `너는 '몽실이'. ${elderName} 님과 옛 사진을 보며 이야기한다. 어르신은 버튼만 누른다.
규칙:
- question: 존댓말 한 문장, 40자 이내. 매번 주어지는 '이번 질문 단계'에 맞는 질문을 만든다. 맞고 틀림이 있는 질문(언제·누구·어디)은 하지 않는다.
- 사진에 보이는 것만 말하고, 보이지 않는 사실은 지어내지 않는다. 가족 설명은 가족의 생각이다.
- buttons: 2~3개. label은 어르신이 할 말, 한국어 12자 이내. 서로 다른 기억·느낌이 되게.
- type: 내용 대답 "pick", 네 "go", 아니요 "stop", 잘 모르겠어요 "help". 내용 대답이 있으면 "잘 모르겠어요"를 하나 넣는다.
- story: 그 버튼을 누르면 이야기책에 남을 과거형 한 문장. label 내용만 쓰고 새 사실을 더하지 않는다. 기록할 게 없으면 "".
- tone: 그 대답이 즐겁거나 따뜻한 기억이면 "bright", 슬프거나 힘든 기억이면 "heavy", 그 외 "neutral".
- reflect: 바로 앞 어르신 대답을 받아 주는 짧은 한마디(25자 이내). 어르신이 한 말만 되받고 새 사실을 더하지 않는다. 첫 질문이면 "".
- question은 바로 앞 대답을 이어받아 묻는다. '버튼 낱말'이 주어지면 그 낱말로 구체적인 버튼을 만든다.
- 같은 질문을 반복하지 않는다. 다시 묻지 않을 주제는 꺼내지 않는다.
예시 (앞 대답이 "시원했어요", 감각 단계):
{"reflect":"바람이 시원했군요.","question":"그 바람 맞으며 바다 냄새도 나셨어요?","buttons":[{"label":"짭짤했어요","type":"pick","story":"바다 냄새가 짭짤했다.","tone":"neutral"},{"label":"비릿했어요","type":"pick","story":"바다 냄새가 비릿했다.","tone":"neutral"},{"label":"잘 모르겠어요","type":"help","story":"","tone":"neutral"}]}`;
}

// 버튼에 쓸 '자료 낱말': 사진 속 사람, 사진 제목과 가족 설명의 낱말 (형용사 대신 구체적인 버튼을 만들게)
// 가족 설명은 가족의 눈으로 쓴 글이라 '할머니'·'엄마'는 어르신 본인이다 → 낱말에서 빼고 '나'로 대신한다
export const SELF_WORDS = ['할머니', '할매', '엄마', '어머니', '어머님', '어무이', '할아버지', '아버지', '아빠'];
const ENDING = /(에서|으로|이에요|예요|같아요|이래요|래요|했던|하던|을|를|은|는|에|와|과|의|도|로|요)$/;
const hasBatchim = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
function stripParticle(w) {
  w = w.replace(ENDING, '');
  // '가'는 받침 없는 글자 뒤에서만 조사 (할머니가 → 할머니). '이'는 낱말의 일부인 경우가 많아(나들이) 길 때만 뗀다
  if (w.length >= 3 && w.endsWith('가') && !hasBatchim(w[w.length - 2])) w = w.slice(0, -1);
  else if (w.length >= 4 && w.endsWith('이') && hasBatchim(w[w.length - 2])) w = w.slice(0, -1);
  return w;
}
export function groundWords({ photo, notes, elderName }) {
  const self = elderName ? [elderName] : [];
  const people = (photo.people || []).map((p) => (self.includes(p) ? '나' : p));
  const words = [photo.title, ...notes.map((n) => n.text)].join(' ')
    .split(/[\s.,!?'"()]+/).map((w) => stripParticle(w.replace(/[^가-힣]/g, '')))
    // 동사 꼴(싸서·갔던·먹고…)은 버튼 낱말로 쓰기 어려워 뺀다 → 사람·장소·물건 낱말만 남는다
    .filter((w) => w.length >= 2 && !SELF_WORDS.includes(w) && !/(서|던|고|며|다|게|면)$/.test(w));
  return [...new Set([...people, ...words])].slice(0, 12);
}

export function userPrompt({ photo, notes, history, skipped, level = 1, comfort = false, elderName }) {
  const L = level ? LEVELS[level] : null; // null = 비교 실험의 '자유' 조건
  // 자료 낱말 버튼은 사람·그날의 일 단계에서만 (느낌을 묻는데 명사 버튼이 나오지 않게)
  const ground = [3, 4].includes(level) ? groundWords({ photo, notes, elderName }) : [];
  const last = history[history.length - 1];
  const lines = [
    `대화 상대: ${elderName} 님 (부를 때는 "${elderName} 님"이라고만 부른다)`,
    notes.length && `가족 설명은 가족이 쓴 글이라, 그 속의 '할머니'·'엄마'·'어머니'는 ${elderName} 님 본인이다.`,
    `사진 제목: ${photo.title}`,
    photo.period && `시기(가족이 적음): ${photo.period}`,
    photo.people?.length && `나온 사람(가족이 적음): ${photo.people.join(', ')}`,
    ...notes.map((n) => `${n.by} 설명: "${n.text}"`),
    skipped.length && `다시 묻지 않을 주제: ${skipped.join(', ')}`,
    ...history.map((h, i) => `${i + 1}. 몽실이: ${h.q} → 어르신: ${h.a}`),
    '',
    L ? `이번 질문 단계: ${L.name} — ${L.ask}. (예: "${L.example}" 처럼, 하지만 이 사진에 맞게 새로)`
      : '이번 질문 단계: 자유 — 대화 흐름에 맞게 알아서 묻는다.',
    last && `바로 앞 어르신 대답: "${last.a}" — reflect 로 받아 주고, 질문은 이 대답을 이어받는다.`,
    ground.length && `버튼 낱말: ${ground.join(', ')}`,
    comfort && '앞의 대답이 힘든 기억이었다. 질문 앞에 짧게 공감하는 말을 넣고, 가볍게 묻는다.',
    history.length ? '다음 질문을 JSON으로.' : '첫 질문을 JSON으로.'
  ];
  return lines.filter((l) => l !== false && l !== undefined && l !== 0).join('\n');
}

const TONES = ['bright', 'heavy', 'neutral'];

const SCHEMA = {
  type: 'object',
  properties: {
    reflect: { type: 'string' },
    question: { type: 'string' },
    buttons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          type: { type: 'string', enum: ['pick', 'go', 'stop', 'help'] },
          story: { type: 'string' },
          tone: { type: 'string', enum: TONES }
        },
        required: ['label', 'type', 'story', 'tone']
      }
    }
  },
  required: ['reflect', 'question', 'buttons']
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
  // 터널로 내 컴퓨터의 Ollama 를 부를 때는 문지기(scripts/ollama-gate.mjs) 비밀번호를 함께 보낸다
  const token = process.env.OLLAMA_TOKEN;
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

// 받아 주는 말(reflect) 검사: 어르신이 방금 한 말의 앞 두 글자가 들어 있고 짧을 때만 쓴다.
// 아니면 어르신 말을 그대로 되받는 틀 문장으로 바꾼다 (반영적 경청 — 새 사실이 끼어들지 않게)
function reflectLine(reflect, lastAnswer) {
  if (!lastAnswer || lastAnswer === '잘 모르겠어요') return '';
  const stem = lastAnswer.replace(/[^가-힣]/g, '').slice(0, 2);
  const r = (reflect || '').trim();
  if (r && r.includes(stem) && r.length <= 30) return /[.!?]$/.test(r) ? r : r + '.';
  return lastAnswer.length > 12 ? '그런 일이 있으셨군요.' : `"${lastAnswer}"… 그러셨군요.`;
}

// AI 응답을 화면에 쓰기 안전한 모양으로 다듬는다. 쓸 수 없으면 오류.
function clean(raw, title, lastAnswer) {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  const j = JSON.parse(text);
  const options = (Array.isArray(j.buttons) ? j.buttons : [])
    .map((b) => ({
      t: typeof b?.label === 'string' ? b.label.trim().slice(0, 16) : '',
      kind: KINDS.includes(b?.type) ? b.type : 'pick',
      s: typeof b?.story === 'string' && HANGUL.test(b.story) ? b.story.trim().slice(0, 120) : '',
      tone: TONES.includes(b?.tone) ? b.tone : 'neutral'
    }))
    // 버튼 글자가 한국어가 아니거나(예: "pick"), 질문처럼 끝나거나("맑았나"), 겹치면 버린다
    .filter((o, i, all) => HANGUL.test(o.t) && !KINDS.includes(o.t) && !/(\?|나|까|니|가요)$/.test(o.t)
      && all.findIndex((x) => x.t === o.t) === i)
    .slice(0, 3);
  // "잘 모르겠어요" 같은 대답은 이야기책에 남기지 않는다
  // 파란 버튼은 늘 같은 말로 (작은 모델이 "도움이 필요해요" 같은 엉뚱한 말을 넣기도 한다)
  options.forEach((o) => {
    if (o.kind === 'help') { o.s = ''; o.t = '잘 모르겠어요'; o.tone = 'neutral'; }
    else if (o.kind === 'pick') o.s = storyLine(o.s, o.t, title);
  });
  const say = typeof j.question === 'string' ? j.question.trim() : '';
  if (!HANGUL.test(say) || options.length < 2) throw new Error('AI 응답 형식이 맞지 않아요');
  return { say: say.slice(0, 80), reflect: reflectLine(j.reflect, lastAnswer), options, done: false };
}

const norm = (s) => s.replace(/[^가-힣a-z0-9]/gi, '');

export async function askMongsil(input) {
  const args = { system: systemPrompt(input), user: userPrompt(input), image: input.image };
  const call = PROVIDER === 'ollama' ? callOllama : PROVIDER === 'gemini' ? callGemini : null;
  if (!call) throw new Error('AI_PROVIDER 가 설정되지 않았어요');
  const asked = new Set(input.history.map((h) => norm(h.q)));
  const lastAnswer = input.history[input.history.length - 1]?.a;
  const ground = groundWords(input);
  const once = async (a) => {
    // 형식이 한 번 깨지면 한 번만 다시 시도한다
    try { return clean(await call(a), input.photo.title, lastAnswer); } catch (e) {
      if (e instanceof SyntaxError || e.message.includes('형식')) return clean(await call(a), input.photo.title, lastAnswer);
      throw e;
    }
  };
  let turn = await once(args);
  // 작은 모델은 같은 질문을 되풀이하기도 한다 → 한 번 더 부탁하고, 그래도 같으면 대화를 마무리한다
  if (asked.has(norm(turn.say))) {
    turn = await once({ ...args, user: `${args.user}\n(앞에서 한 질문과 다른 새로운 질문으로)` });
    if (asked.has(norm(turn.say))) turn.done = true;
  }
  // 사람·그날의 일 단계에서 버튼이 자료 낱말을 하나도 안 쓰면 한 번 더 부탁한다 (구체적인 버튼으로)
  const usesGround = (t) => t.options.some((o) => ground.some((g) => o.t.includes(g)));
  if ([3, 4].includes(input.level) && ground.length && !usesGround(turn)) {
    const retry = await once({ ...args, user: `${args.user}\n(버튼 label 에 '버튼 낱말' 중 하나를 꼭 넣어서)` }).catch(() => null);
    if (retry && usesGround(retry) && !asked.has(norm(retry.say))) turn = retry;
  }
  return turn;
}
