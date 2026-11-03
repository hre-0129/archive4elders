-- 기억 연습(간격 복습) (003 다음에 SQL Editor 에서 Run)
-- 조원 설계: 처음 간격 1일, 맞히면 기존 간격 × 1.5 (올림), 틀리면 1일로, 최대 5일 → 1 → 2 → 3 → 5 → 5 …
-- 여러 번 실행해도 되도록 if not exists / drop policy if exists 를 썼다.

-- 문제 하나 = 한 줄. 가족이 만들고, 어르신이 대답하면 간격과 다음 날짜가 바뀐다
create table if not exists review_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  kind text not null check (kind in ('photo', 'routine')),   -- 사진 속 기억 / 생활 습관
  photo_id uuid references photos(id) on delete cascade,     -- kind = photo 일 때 보여 줄 사진
  question text not null,
  answer text not null,                                      -- 정답
  wrong text[] not null default '{}',                        -- 헷갈리게 섞을 다른 보기 (1~3개)
  interval_days smallint not null default 1 check (interval_days between 1 and 30),
  next_due date not null default ((now() at time zone 'Asia/Seoul')::date),
  streak smallint not null default 0,                        -- 연속으로 맞힌 횟수
  active boolean not null default true,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 대답 한 번 = 한 줄 (실험 분석용: 간격별 정답률, 늦게 푼 날 수, 대답 시간)
create table if not exists review_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  item_id uuid not null references review_items(id) on delete cascade,
  due_date date not null,             -- 원래 풀기로 한 날
  reviewed_on date not null,          -- 실제로 푼 날 (한국 날짜)
  interval_before smallint not null,  -- 이번 문제를 내기 전 간격 (= 지난번에 정한 간격)
  interval_after smallint not null,
  correct boolean not null,
  chosen text not null,               -- 고른 보기 ('잘 모르겠어요' 포함)
  response_ms integer,                -- 문제가 보이고 대답할 때까지 걸린 시간
  created_at timestamptz not null default now()
);

alter table review_items enable row level security;
alter table review_logs enable row level security;

drop policy if exists "기억 연습 문제" on review_items;
create policy "기억 연습 문제" on review_items for all using (is_member(family_id)) with check (is_member(family_id));

drop policy if exists "기억 연습 기록 보기" on review_logs;
create policy "기억 연습 기록 보기" on review_logs for select using (is_member(family_id));
drop policy if exists "기억 연습 기록 남기기" on review_logs;
create policy "기억 연습 기록 남기기" on review_logs for insert with check (is_elder(family_id));
