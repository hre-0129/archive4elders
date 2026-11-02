'use client';
// 사진 올리기 + 사진별 공개 범위 / AI 활용 설정
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadPhoto } from './upload';

const DECADES = ['1950년대', '1960년대', '1970년대', '1980년대', '1990년대', '2000년대', '2010년대', '2020년대'];

function UploadForm({ member, reload, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [f, setF] = useState({ title: '', people: '', decade: '1970년대', part: '잘 모름', note: '', visibility: 'family', ai: true });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function pick(e) {
    const file = e.target.files[0];
    setFile(file || null);
    setPreview(file ? URL.createObjectURL(file) : '');
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return setMsg('사진을 골라 주세요.');
    if (!f.title.trim()) return setMsg('사진 이름을 적어 주세요.');
    setBusy(true); setMsg('');
    try {
      const storage_path = await uploadPhoto(member.family_id, file);
      const { data: photo, error } = await supabase.from('photos').insert({
        family_id: member.family_id, uploaded_by: member.id, title: f.title.trim(),
        people: f.people.split(',').map((s) => s.trim()).filter(Boolean),
        period: f.decade + (f.part === '잘 모름' ? '' : ' ' + f.part),
        storage_path, visibility: f.visibility, ai_allowed: f.ai
      }).select().single();
      if (error) throw new Error(error.message);
      if (f.note.trim()) await supabase.from('photo_notes').insert({ photo_id: photo.id, author: member.id, text: f.note.trim() });
      await reload();
      onDone();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>사진 올리기</h2>
      <div className="field">
        <label htmlFor="up-file">사진</label>
        <input id="up-file" type="file" accept="image/*" onChange={pick} />
        {preview && <div className="thumb" style={{ width: 240 }}><img src={preview} alt="고른 사진" /></div>}
      </div>
      <div className="field">
        <label htmlFor="up-title">사진 이름</label>
        <input id="up-title" className="input" value={f.title} onChange={set('title')} placeholder="예) 남대문 시장 국밥집 앞" />
      </div>
      <div className="field">
        <label htmlFor="up-people">함께 나온 사람</label>
        <input id="up-people" className="input" value={f.people} onChange={set('people')} placeholder="쉼표로 나눠 적기. 예) 할머니, 할아버지" />
        <span className="hint">몽실이가 &quot;사진 속에 아는 얼굴이 있어요?&quot;라고 물을 때 버튼으로 보여 줘요.</span>
      </div>
      <div className="field">
        <span className="lbl">대략 언제쯤</span>
        <div className="two">
          <select className="input" aria-label="연대" value={f.decade} onChange={set('decade')}>{DECADES.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="input" aria-label="연대 안에서" value={f.part} onChange={set('part')}>{['잘 모름', '초반', '중반', '후반'].map((x) => <option key={x}>{x}</option>)}</select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="up-note">내가 아는 설명</label>
        <textarea id="up-note" className="input" value={f.note} onChange={set('note')} placeholder="예) 어머니가 시장에서 장사하시던 시절 같아요." />
        <span className="hint">가족이 남긴 설명으로 표시돼요. 몽실이는 이 설명을 어르신의 기억처럼 말하지 않아요.</span>
      </div>
      <div className="field">
        <label htmlFor="up-vis">누가 볼 수 있나요?</label>
        <select id="up-vis" className="input" value={f.visibility} onChange={set('visibility')}>
          <option value="family">가족 모두</option>
          <option value="me">어르신과 나만</option>
        </select>
      </div>
      <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={f.ai} onChange={set('ai')} style={{ width: 22, height: 22 }} />
        몽실이가 이 사진으로 대화해도 돼요
      </label>
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="row">
        <button className="btn go" disabled={busy}>{busy ? '올리는 중…' : '올리기'}</button>
        <button type="button" className="btn quiet" onClick={onDone}>그만두기</button>
      </div>
    </form>
  );
}

export default function PhotosTab({ data, member, reload, nameOf }) {
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  async function update(p, patch) {
    await supabase.from('photos').update(patch).eq('id', p.id);
    reload();
  }
  async function remove(p) {
    await supabase.storage.from('photos').remove([p.storage_path]);
    await supabase.from('photos').delete().eq('id', p.id);
    setConfirmDel(null);
    reload();
  }

  return (
    <>
      {adding ? <UploadForm member={member} reload={reload} onDone={() => setAdding(false)} />
        : <button className="btn go" onClick={() => setAdding(true)}>+ 사진 올리기</button>}
      <section className="card">
        <h2>올린 사진 {data.photos.length}장</h2>
        {!data.photos.length && <p className="muted">아직 사진이 없어요. 옛날 앨범 사진을 휴대폰으로 찍어서 올려도 돼요.</p>}
        {data.photos.map((p) => {
          const mine = p.uploaded_by === member.id;
          const notes = data.notes.filter((n) => n.photo_id === p.id);
          return (
            <div className="list-row" key={p.id} style={{ alignItems: 'flex-start' }}>
              <div className="thumb">{data.urls[p.storage_path] && <img src={data.urls[p.storage_path]} alt={p.title} />}</div>
              <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <strong>{p.title}</strong>
                <span className="muted" style={{ fontSize: 15 }}>{p.period}{p.people.length ? ` · ${p.people.join(', ')}` : ''} · {nameOf(p.uploaded_by)?.display_name} 올림</span>
                {notes.map((n) => <span key={n.id} style={{ fontSize: 16 }}><span className="badge">{nameOf(n.author)?.role === 'elder' ? '본인' : nameOf(n.author)?.display_name}</span> {n.text}</span>)}
                {mine ? (
                  <div className="row" style={{ gap: 8 }}>
                    <select className="input" style={{ width: 'auto', minHeight: 44 }} aria-label="공개 범위" value={p.visibility} onChange={(e) => update(p, { visibility: e.target.value })}>
                      <option value="family">가족 모두</option>
                      <option value="me">어르신과 나만</option>
                    </select>
                    <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={p.ai_allowed} onChange={(e) => update(p, { ai_allowed: e.target.checked })} style={{ width: 20, height: 20 }} />
                      대화에 사용
                    </label>
                    {confirmDel === p.id
                      ? <><button className="btn danger" onClick={() => remove(p)}>정말 지우기</button><button className="btn quiet" onClick={() => setConfirmDel(null)}>그만두기</button></>
                      : <button className="btn quiet" onClick={() => setConfirmDel(p.id)}>지우기</button>}
                  </div>
                ) : (
                  <span className="muted" style={{ fontSize: 15 }}>{p.ai_allowed ? '대화에 사용' : '대화에 쓰지 않음'} · 설정은 올린 사람과 어르신만 바꿀 수 있어요</span>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
