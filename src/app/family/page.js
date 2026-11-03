'use client';
// 가족 화면: 이야기(답장) / 사진 / 할 일 / 활동(기분) / 기억 연습 / 설정
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, signedUrls } from '@/lib/supabase';
import { useMember } from '@/lib/useMember';
import { loadActivities } from '@/lib/activities';
import Icon from '@/components/Icon';
import StoriesTab from './StoriesTab';
import PhotosTab from './PhotosTab';
import TasksTab from './TasksTab';
import ActivitiesTab from './ActivitiesTab';
import ReviewTab from './ReviewTab';
import SettingsTab from './SettingsTab';

const TABS = [
  { id: 'stories', label: '이야기', icon: 'book' },
  { id: 'photos', label: '사진', icon: 'photo' },
  { id: 'tasks', label: '할 일', icon: 'calendar' },
  { id: 'activities', label: '활동', icon: 'leaf' },
  { id: 'review', label: '기억', icon: 'question' },
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
    const [photos, notes, stories, replies, tasks, skipped, act, talks, reviews, reviewLogs] = await Promise.all([
      supabase.from('photos').select('*').eq('family_id', fid).order('created_at', { ascending: false }),
      supabase.from('photo_notes').select('*').order('created_at'),
      supabase.from('stories').select('*').eq('family_id', fid).order('created_at', { ascending: false }),
      supabase.from('replies').select('*').order('created_at'),
      supabase.from('tasks').select('*').eq('family_id', fid).order('created_at'),
      supabase.from('skipped_topics').select('*').eq('family_id', fid),
      loadActivities(fid),
      supabase.from('talk_sessions').select('*').eq('family_id', fid).order('started_at', { ascending: false }),
      supabase.from('review_items').select('*').eq('family_id', fid).order('created_at'),
      supabase.from('review_logs').select('*').eq('family_id', fid).order('created_at', { ascending: false }).limit(500)
    ]);
    const paths = [...(photos.data || []).map((p) => p.storage_path), ...(replies.data || []).map((r) => r.photo_path)];
    setData({
      photos: photos.data || [], notes: notes.data || [], stories: stories.data || [],
      replies: replies.data || [], tasks: tasks.data || [], skipped: skipped.data || [],
      activities: act ? act.activities : null, activityLogs: act ? act.logs : [],
      talkSessions: talks.error ? null : talks.data, // null 이면 003 SQL 을 아직 안 돌린 것
      reviews: reviews.error ? null : reviews.data, reviewLogs: reviewLogs.data || [], // null 이면 004 SQL 을 아직 안 돌린 것
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
  // reload: 화면 데이터 다시 읽기 / reloadMember: 가족 정보(대화 방식 설정 등) 다시 읽기
  const props = { ...ctx, data, reload: load, reloadMember: ctx.reload, elder, nameOf: (id) => ctx.members.find((m) => m.id === id) };

  return (
    <>
      <main className="page">
        <div className="head">
          <div>
            <p className="muted">{ctx.family?.name}</p>
            <h1>{TABS.find((t) => t.id === tab).label}</h1>
          </div>
          <span className="badge pink">{ctx.member.display_name} · {ctx.member.relation}</span>
        </div>
        {tab === 'stories' && <StoriesTab {...props} />}
        {tab === 'photos' && <PhotosTab {...props} />}
        {tab === 'tasks' && <TasksTab {...props} />}
        {tab === 'activities' && <ActivitiesTab {...props} />}
        {tab === 'review' && <ReviewTab {...props} />}
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
