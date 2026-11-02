'use client';
// 가족 화면: 이야기(답장) / 사진 / 할 일 / 설정
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, signedUrls } from '@/lib/supabase';
import { useMember } from '@/lib/useMember';
import Icon from '@/components/Icon';
import StoriesTab from './StoriesTab';
import PhotosTab from './PhotosTab';
import TasksTab from './TasksTab';
import SettingsTab from './SettingsTab';

const TABS = [
  { id: 'stories', label: '이야기', icon: 'book' },
  { id: 'photos', label: '사진', icon: 'photo' },
  { id: 'tasks', label: '할 일', icon: 'calendar' },
  { id: 'settings', label: '설정', icon: 'gear' }
];

export default function FamilyPage() {
  const router = useRouter();
  const ctx = useMember();
  const [tab, setTab] = useState('stories');
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!ctx.member) return;
    const fid = ctx.member.family_id;
    const [photos, notes, stories, replies, tasks, skipped] = await Promise.all([
      supabase.from('photos').select('*').eq('family_id', fid).order('created_at', { ascending: false }),
      supabase.from('photo_notes').select('*').order('created_at'),
      supabase.from('stories').select('*').eq('family_id', fid).order('created_at', { ascending: false }),
      supabase.from('replies').select('*').order('created_at'),
      supabase.from('tasks').select('*').eq('family_id', fid).order('created_at'),
      supabase.from('skipped_topics').select('*').eq('family_id', fid)
    ]);
    const paths = [...(photos.data || []).map((p) => p.storage_path), ...(replies.data || []).map((r) => r.photo_path)];
    setData({
      photos: photos.data || [], notes: notes.data || [], stories: stories.data || [],
      replies: replies.data || [], tasks: tasks.data || [], skipped: skipped.data || [],
      urls: await signedUrls(paths)
    });
  }, [ctx.member]);

  useEffect(() => {
    if (ctx.loading) return;
    if (!ctx.user) router.replace('/login');
    else if (!ctx.member) router.replace('/setup');
    else if (ctx.member.role === 'elder') router.replace('/elder');
    else load();
  }, [ctx.loading, ctx.user, ctx.member, router, load]);

  if (!data) return <main className="center"><p className="muted">불러오는 중…</p></main>;

  const elder = ctx.members.find((m) => m.role === 'elder');
  const props = { ...ctx, data, reload: load, elder, nameOf: (id) => ctx.members.find((m) => m.id === id) };

  return (
    <>
      <main className="page">
        <div className="head">
          <div>
            <p className="muted">{ctx.family.name}</p>
            <h1>{TABS.find((t) => t.id === tab).label}</h1>
          </div>
          <span className="badge pink">{ctx.member.display_name} · {ctx.member.relation}</span>
        </div>
        {tab === 'stories' && <StoriesTab {...props} />}
        {tab === 'photos' && <PhotosTab {...props} />}
        {tab === 'tasks' && <TasksTab {...props} />}
        {tab === 'settings' && <SettingsTab {...props} />}
      </main>
      <nav className="tabs" aria-label="가족 메뉴">
        <div className="inner">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>
              <Icon name={t.icon} />{t.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
