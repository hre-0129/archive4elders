// 사진 파일을 가족 폴더에 올리고, 저장 경로를 돌려준다.
import { supabase } from '@/lib/supabase';

const MAX_MB = 10;

export async function uploadPhoto(familyId, file) {
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`사진은 ${MAX_MB}MB까지 올릴 수 있어요.`);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}
