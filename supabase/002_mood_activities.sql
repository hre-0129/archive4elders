-- 기분·활동 추천 기능 (schema.sql 을 먼저 실행한 뒤, 이 파일을 SQL Editor 에서 Run)
-- 여러 번 실행해도 되도록 if not exists / drop policy if exists 를 썼다.

-- 활동 목록. 가족마다 따로 가진다. 기본 4개는 처음 화면을 열 때 앱이 넣는다.
-- fit_*: 이 활동이 어떤 마음일 때 잘 맞는지 (0~1). 추천의 '현재 감정 적합성'에 쓰인다.
-- preference: 어르신이 좋아하는 정도 1~5 (가족이 설정). 기록이 없을 때도 추천에 쓰인다.
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  icon text not null default 'calendar',
  mode text not null default 'offline' check (mode in ('offline', 'photo_talk')),
  guide text not null default '',
  fit_lonely real not null default 0 check (fit_lonely between 0 and 1),
  fit_lowpos real not null default 0 check (fit_lowpos between 0 and 1),
  fit_tense real not null default 0 check (fit_tense between 0 and 1),
  preference smallint not null default 3 check (preference between 1 and 5),
  active boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

-- 활동 기록 한 줄 = 활동 한 번. 활동 전·후 마음(외로움·긍정 기분·긴장감, 1~5), 만족도, 재참여 의사.
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  pre_lonely smallint not null check (pre_lonely between 1 and 5),
  pre_positive smallint not null check (pre_positive between 1 and 5),
  pre_tense smallint not null check (pre_tense between 1 and 5),
  post_lonely smallint not null check (post_lonely between 1 and 5),
  post_positive smallint not null check (post_positive between 1 and 5),
  post_tense smallint not null check (post_tense between 1 and 5),
  satisfaction smallint not null check (satisfaction between 1 and 5),
  rejoin boolean not null,
  improved_all boolean not null,          -- 세 가지 모두 좋아졌으면 true (긍정적 변화)
  rec_score smallint,                     -- 고를 때의 추천 점수 (나중에 추천이 맞았는지 분석용)
  rec_rank smallint,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

alter table activities enable row level security;
alter table activity_logs enable row level security;

-- 활동 목록은 같은 가족 누구나 보고 고칠 수 있다
drop policy if exists "활동 전체" on activities;
create policy "활동 전체" on activities for all using (is_member(family_id)) with check (is_member(family_id));

-- 기록은 가족이 볼 수 있고, 남기는 건 어르신만
drop policy if exists "활동 기록 보기" on activity_logs;
create policy "활동 기록 보기" on activity_logs for select using (is_member(family_id));
drop policy if exists "활동 기록 남기기" on activity_logs;
create policy "활동 기록 남기기" on activity_logs for insert with check (is_elder(family_id));
