// POST /api/talk — 몽실이의 다음 질문을 AI에게 받아 온다. (서버에서만 실행되므로 AI 키가 브라우저에 가지 않는다)
// 보내는 것: { photoId, history: [{ q, a }] } + 헤더 Authorization: Bearer <로그인 토큰>
// 사진·설명은 브라우저가 보낸 값을 믿지 않고, 로그인한 사람의 권한으로 데이터베이스에서 직접 읽는다.
import { createClient } from '@supabase/supabase-js';
import { askMongsil, PROVIDER } from '@/lib/ai';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const MAX_TURNS = 8;
// 내 컴퓨터의 Ollama 는 첫 질문(사진 읽기)에 40초쯤 걸리므로 Vercel 이 중간에 끊지 않게 넉넉히
export const maxDuration = 60;
const fail = (status, error) => Response.json({ error }, { status });

export async function POST(req) {
  if (!PROVIDER) return fail(503, 'AI가 아직 연결되지 않았어요');

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return fail(401, '로그인이 필요해요');
  const db = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return fail(401, '로그인이 필요해요');

  const { photoId, history = [] } = await req.json().catch(() => ({}));
  if (!Array.isArray(history) || history.length > MAX_TURNS) return fail(400, '대화가 너무 길어요');

  const { data: photo } = await db.from('photos').select('*').eq('id', photoId).single();
  if (!photo) return fail(404, '사진을 찾을 수 없어요');
  if (!photo.ai_allowed) return fail(403, '이 사진은 AI 대화에 쓰지 않도록 설정되어 있어요');

  const { data: me } = await db.from('members').select('*').eq('family_id', photo.family_id).eq('user_id', user.id).single();
  if (me?.role !== 'elder') return fail(403, '어르신 계정만 쓸 수 있어요');

  const [{ data: notes }, { data: members }, { data: skipped }, file] = await Promise.all([
    db.from('photo_notes').select('*').eq('photo_id', photo.id),
    db.from('members').select('id, display_name, role').eq('family_id', photo.family_id),
    db.from('skipped_topics').select('topic').eq('family_id', photo.family_id),
    db.storage.from('photos').download(photo.storage_path)
  ]);

  // 내 컴퓨터의 Ollama 는 사진을 읽는 데 오래 걸리므로 첫 질문에만 사진을 보여 준다
  const sendImage = PROVIDER !== 'ollama' || history.length === 0;
  let image = null;
  if (sendImage && file.data && file.data.size < 4 * 1024 * 1024) {
    const buf = Buffer.from(await file.data.arrayBuffer());
    image = { mime: file.data.type || 'image/jpeg', base64: buf.toString('base64') };
    // SVG 는 AI 가 그림으로 못 읽으므로 보내지 않는다 (시연용 가상 사진)
    if (image.mime.includes('svg')) image = null;
  }

  const nameOf = (id) => {
    const m = members?.find((x) => x.id === id);
    return !m ? '가족' : m.role === 'elder' ? '어르신 본인' : `${m.display_name} 님`;
  };

  try {
    const turn = await askMongsil({
      elderName: me.display_name,
      photo,
      notes: (notes || []).map((n) => ({ by: nameOf(n.author), text: n.text })),
      skipped: (skipped || []).map((s) => s.topic),
      history: history.map((h) => ({ q: String(h.q).slice(0, 100), a: String(h.a).slice(0, 30) })),
      image
    });
    return Response.json(turn);
  } catch (e) {
    console.error('[api/talk]', e.message);
    return fail(502, e.message);
  }
}
