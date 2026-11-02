// Ollama 문지기: 터널로 들어온 요청 중 비밀번호(OLLAMA_TOKEN)가 맞는 /api/chat 만 내 컴퓨터의 Ollama로 넘긴다.
// Ollama 자체에는 비밀번호 기능이 없어서, 터널 주소를 아는 누구나 내 AI를 쓰지 못하게 막는 용도.
// 실행: npm run ai:gate   (.env.local 의 OLLAMA_TOKEN 을 읽는다)
import http from 'node:http';
import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const TOKEN = process.env.OLLAMA_TOKEN;
const TARGET = 'http://localhost:11434';
const PORT = 11435;
if (!TOKEN || TOKEN.length < 16) {
  console.error('.env.local 에 OLLAMA_TOKEN(16자 이상)을 넣어 주세요.');
  process.exit(1);
}

http.createServer(async (req, res) => {
  const time = new Date().toLocaleTimeString('ko-KR');
  const ok = req.method === 'POST' && req.url === '/api/chat' && req.headers.authorization === `Bearer ${TOKEN}`;
  if (!ok) {
    const why = req.url !== '/api/chat' ? `다른 주소(${req.url})` : !req.headers.authorization ? '비밀번호 없음' : '비밀번호 틀림';
    console.log(time, '막음:', why);
    res.writeHead(403).end('forbidden');
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const r = await fetch(`${TARGET}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: Buffer.concat(chunks) });
    res.writeHead(r.status, { 'Content-Type': 'application/json' }).end(Buffer.from(await r.arrayBuffer()));
    console.log(time, '몽실이 질문 1개 처리', r.status);
  } catch (e) {
    res.writeHead(502).end(JSON.stringify({ error: 'Ollama 가 꺼져 있어요' }));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Ollama 문지기 대기 중: http://127.0.0.1:${PORT} → ${TARGET}`));
