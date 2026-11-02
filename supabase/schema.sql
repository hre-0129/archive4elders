-- 기억 아카이브 데이터베이스 구조
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여 넣고 Run 하면 된다.
-- 여러 번 실행해도 되도록 if not exists / or replace 를 썼다.

-- =========================================================
-- 1. 표(테이블)
-- =========================================================

-- 가족 묶음 하나 = 어르신 한 분과 그 가족들
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- 가족 구성원. role 이 'elder' 이면 어르신, 'family' 이면 가족
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  relation text not null default '',
  role text not null check (role in ('elder', 'family')),
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

-- 사진. visibility: 'me'(어르신과 올린 사람만) / 'family'(가족 모두)
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  uploaded_by uuid not null references members(id) on delete cascade,
  title text not null,
  people text[] not null default '{}',
  period text not null default '',
  storage_path text not null,
  visibility text not null default 'family' check (visibility in ('me', 'family')),
  ai_allowed boolean not null default true,
  created_at timestamptz not null default now()
);

-- 사진 설명. 누가 남겼는지(author)로 본인/가족 정보를 구분한다
create table if not exists photo_notes (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  author uuid not null references members(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

-- 이야기책. lines 는 [{ "text": 문장, "quote": 어르신이 고른 원래 대답 }] 목록
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  category text not null default '추억' check (category in ('추억', '요리법', '삶의 지혜')),
  photo_id uuid references photos(id) on delete set null,
  lines jsonb not null default '[]',
  visibility text not null default 'me' check (visibility in ('me', 'family')),
  created_at timestamptz not null default now()
);

-- 가족 답장. plan 이 있으면 어르신 화면에서 "할 일에 넣을까요?" 를 묻는다
create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  author uuid not null references members(id) on delete cascade,
  text text not null,
  photo_path text,
  plan_title text,
  plan_date date,
  plan_time text,
  seen_by_elder boolean not null default false,
  created_at timestamptz not null default now()
);

-- 할 일. due_date 가 비어 있으면 매일 하는 일. done_on 이 오늘 날짜면 오늘 한 것
-- ('오늘의 생활' 기능을 조원이 만들면 이 표를 그쪽과 맞춘다)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  short text not null,
  icon text not null default 'calendar',
  time_label text not null default '',
  due_date date,
  done_on date,
  source text not null default 'family',
  created_at timestamptz not null default now()
);

-- 어르신이 '다른 이야기'로 건너뛴 주제. 몽실이가 다시 묻지 않는다
create table if not exists skipped_topics (
  family_id uuid not null references families(id) on delete cascade,
  topic text not null,
  created_at timestamptz not null default now(),
  primary key (family_id, topic)
);

-- =========================================================
-- 2. 도우미 함수 (권한 검사용)
-- =========================================================

create or replace function is_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where family_id = fid and user_id = auth.uid());
$$;

create or replace function is_elder(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where family_id = fid and user_id = auth.uid() and role = 'elder');
$$;

create or replace function my_member_id(fid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where family_id = fid and user_id = auth.uid() limit 1;
$$;

-- 가족 만들기: 만든 사람이 첫 구성원이 된다
create or replace function create_family(p_name text, p_display_name text, p_relation text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid; code text;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  code := upper(substr(md5(random()::text), 1, 6));
  insert into families (name, invite_code) values (p_name, code) returning id into fid;
  insert into members (family_id, user_id, display_name, relation, role)
    values (fid, auth.uid(), p_display_name, p_relation, p_role);
  return fid;
end $$;

-- 초대 코드로 가족에 들어가기. 어르신 자리는 한 명만
create or replace function join_family(p_code text, p_display_name text, p_relation text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select id into fid from families where invite_code = upper(trim(p_code));
  if fid is null then raise exception '초대 코드를 찾을 수 없어요'; end if;
  if p_role = 'elder' and exists (select 1 from members where family_id = fid and role = 'elder') then
    raise exception '이 가족에는 이미 어르신 계정이 있어요';
  end if;
  insert into members (family_id, user_id, display_name, relation, role)
    values (fid, auth.uid(), p_display_name, p_relation, p_role)
    on conflict (family_id, user_id) do nothing;
  return fid;
end $$;

-- =========================================================
-- 3. 행 단위 권한(RLS): 같은 가족만 보고, '나만 보기'는 어르신만
-- =========================================================

alter table families enable row level security;
alter table members enable row level security;
alter table photos enable row level security;
alter table photo_notes enable row level security;
alter table stories enable row level security;
alter table replies enable row level security;
alter table tasks enable row level security;
alter table skipped_topics enable row level security;

drop policy if exists "가족 보기" on families;
create policy "가족 보기" on families for select using (is_member(id));

drop policy if exists "구성원 보기" on members;
create policy "구성원 보기" on members for select using (is_member(family_id));

drop policy if exists "사진 보기" on photos;
create policy "사진 보기" on photos for select using (
  is_member(family_id) and (visibility = 'family' or is_elder(family_id) or uploaded_by = my_member_id(family_id)));
drop policy if exists "사진 올리기" on photos;
create policy "사진 올리기" on photos for insert with check (
  is_member(family_id) and uploaded_by = my_member_id(family_id));
drop policy if exists "사진 설정 바꾸기" on photos;
create policy "사진 설정 바꾸기" on photos for update using (
  is_elder(family_id) or uploaded_by = my_member_id(family_id));
drop policy if exists "사진 지우기" on photos;
create policy "사진 지우기" on photos for delete using (
  is_elder(family_id) or uploaded_by = my_member_id(family_id));

drop policy if exists "설명 보기" on photo_notes;
create policy "설명 보기" on photo_notes for select using (
  exists (select 1 from photos p where p.id = photo_id));
drop policy if exists "설명 쓰기" on photo_notes;
create policy "설명 쓰기" on photo_notes for insert with check (
  exists (select 1 from photos p where p.id = photo_id and author = my_member_id(p.family_id)));

drop policy if exists "이야기 보기" on stories;
create policy "이야기 보기" on stories for select using (
  is_member(family_id) and (visibility = 'family' or is_elder(family_id)));
drop policy if exists "이야기 쓰기" on stories;
create policy "이야기 쓰기" on stories for insert with check (is_elder(family_id));
drop policy if exists "이야기 고치기" on stories;
create policy "이야기 고치기" on stories for update using (is_elder(family_id));
drop policy if exists "이야기 지우기" on stories;
create policy "이야기 지우기" on stories for delete using (is_elder(family_id));

drop policy if exists "답장 보기" on replies;
create policy "답장 보기" on replies for select using (
  exists (select 1 from stories s where s.id = story_id));
drop policy if exists "답장 쓰기" on replies;
create policy "답장 쓰기" on replies for insert with check (
  exists (select 1 from stories s where s.id = story_id and author = my_member_id(s.family_id)));
drop policy if exists "답장 읽음 표시" on replies;
create policy "답장 읽음 표시" on replies for update using (
  exists (select 1 from stories s where s.id = story_id and is_elder(s.family_id)));

drop policy if exists "할 일 전체" on tasks;
create policy "할 일 전체" on tasks for all using (is_member(family_id)) with check (is_member(family_id));

drop policy if exists "건너뛴 주제 전체" on skipped_topics;
create policy "건너뛴 주제 전체" on skipped_topics for all using (is_member(family_id)) with check (is_member(family_id));

-- =========================================================
-- 4. 사진 파일 저장소: 'photos' 버킷, 경로는 {family_id}/{파일이름}
-- =========================================================

insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;

drop policy if exists "가족 사진 파일 보기" on storage.objects;
create policy "가족 사진 파일 보기" on storage.objects for select using (
  bucket_id = 'photos' and is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "가족 사진 파일 올리기" on storage.objects;
create policy "가족 사진 파일 올리기" on storage.objects for insert with check (
  bucket_id = 'photos' and is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "가족 사진 파일 지우기" on storage.objects;
create policy "가족 사진 파일 지우기" on storage.objects for delete using (
  bucket_id = 'photos' and is_member(((storage.foldername(name))[1])::uuid));
