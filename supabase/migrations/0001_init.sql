-- Schema for the Daily Revision App (v0.1 — matches docs/04-LLD.md §1)
-- Run this whole file once in the Supabase SQL Editor.

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          text not null check (role in ('student','teacher')),
  class_section text,
  created_at    timestamptz not null default now()
);

create table chapters (
  id         uuid primary key default gen_random_uuid(),
  ncert_no   int  not null unique,
  name       text not null,
  subject    text not null check (subject in ('physics','chemistry','biology','general')),
  sort_order int  not null default 0
);

create table sections (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  section_no text not null,
  name       text not null,
  sort_order int  not null default 0,
  unique (chapter_id, section_no)
);

create table questions (
  id             uuid primary key default gen_random_uuid(),
  section_id     uuid not null references sections(id) on delete cascade,
  qtype          text not null check (qtype in ('mcq','flashcard')),
  language       text not null default 'en' check (language in ('en','kn')),
  question_text  text not null,
  options        jsonb,
  correct_option smallint,
  explanation    text,
  difficulty     text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  check (
    (qtype = 'mcq' and options is not null and correct_option is not null)
    or (qtype = 'flashcard' and options is null and correct_option is null)
  )
);

create index idx_questions_section on questions(section_id) where enabled;
create unique index questions_section_text_unique on questions(section_id, question_text);

create table daily_sets (
  id           uuid primary key default gen_random_uuid(),
  set_date     date not null default current_date,
  activated_by uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  unique (set_date)
);

create table daily_set_sections (
  daily_set_id uuid not null references daily_sets(id) on delete cascade,
  section_id   uuid not null references sections(id) on delete cascade,
  primary key (daily_set_id, section_id)
);

create table submissions (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references profiles(id),
  question_id     uuid not null references questions(id),
  daily_set_id    uuid not null references daily_sets(id),
  selected_option smallint,
  self_eval       text check (self_eval in ('got_it','need_practice')),
  is_correct      boolean,
  answered_at     timestamptz not null default now(),
  unique (student_id, question_id, daily_set_id)
);

create index idx_submissions_student_set on submissions(student_id, daily_set_id);
create index idx_submissions_question on submissions(question_id);

create table streaks (
  student_id         uuid primary key references profiles(id),
  current_streak     int  not null default 0,
  best_streak        int  not null default 0,
  last_activity_date date,
  updated_at         timestamptz not null default now()
);

-- Keep streaks in sync whenever a submission is inserted
create or replace function bump_streak() returns trigger as $$
declare
  today date := (select current_date);
  prev  date;
begin
  select last_activity_date into prev from streaks where student_id = new.student_id for update;

  if prev is distinct from today then
    insert into streaks (student_id, current_streak, best_streak, last_activity_date)
    values (new.student_id, 1, 1, today)
    on conflict (student_id) do update set
      current_streak = case when prev = today - 1 then streaks.current_streak + 1 else 1 end,
      best_streak    = greatest(streaks.best_streak, case when prev = today - 1 then streaks.current_streak + 1 else 1 end),
      last_activity_date = today,
      updated_at = now();
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_bump_streak
  after insert on submissions
  for each row execute function bump_streak();
