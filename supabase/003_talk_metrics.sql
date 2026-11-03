-- 사진 대화 지표 + 대화 방식 비교 실험 (002 다음에 SQL Editor 에서 Run)
-- 여러 번 실행해도 되도록 if not exists / drop policy if exists 를 썼다.

-- 가족마다 대화 방식을 고른다: ladder(회상 대화 사다리) / free(AI 자유) / random(대화마다 반반)
alter table families add column if not exists talk_mode text not null default 'ladder';
alter table families drop constraint if exists families_talk_mode_check;
alter table families add constraint families_talk_mode_check check (talk_mode in ('ladder', 'free', 'random'));

drop policy if exists "가족 설정 바꾸기" on families;
create policy "가족 설정 바꾸기" on families for update using (is_member(id)) with check (is_member(id));

-- 사진 대화 한 번 = 한 줄
create table if not exists talk_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  photo_id uuid references photos(id) on delete set null,
  condition text not null check (condition in ('ladder', 'free', 'script')),  -- script = AI 없이 각본 대화
  started_at timestamptz not null,
  ended_at timestamptz not null default now(),
  end_reason text not null check (end_reason in ('done', 'stop', 'skip', 'error')),
  turns smallint not null default 0,      -- 질문에 대답한 횟수
  picks smallint not null default 0,      -- 내용 대답(분홍 버튼)을 고른 횟수 → 몰입도
  helps smallint not null default 0,      -- '잘 모르겠어요'·'아니요'
  heavies smallint not null default 0,    -- 힘든 기억으로 분류된 대답
  max_level smallint,                     -- 사다리에서 실제로 물어본 가장 깊은 단계 (free·script 는 비움)
  path smallint[] not null default '{}',  -- 물어본 단계 순서
  history jsonb not null default '[]',    -- [{ q, a, kind, tone, level }] 나중에 사람이 질문을 분류해 볼 수 있게
  story_saved boolean not null default false,
  story_id uuid references stories(id) on delete set null,
  story_lines smallint not null default 0,
  activity_log_id uuid references activity_logs(id) on delete set null  -- '사진 보기' 활동이면 전후 마음 기록과 연결
);

alter table talk_sessions enable row level security;
drop policy if exists "대화 지표 보기" on talk_sessions;
create policy "대화 지표 보기" on talk_sessions for select using (is_member(family_id));
drop policy if exists "대화 지표 남기기" on talk_sessions;
create policy "대화 지표 남기기" on talk_sessions for insert with check (is_elder(family_id));
drop policy if exists "대화 지표 고치기" on talk_sessions;
create policy "대화 지표 고치기" on talk_sessions for update using (is_elder(family_id));
