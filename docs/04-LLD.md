# LLD — Daily Revision App (v0.1)

Companion to [HLD](03-HLD.md). Covers schema, API contract, mobile screens, and seed format.

## 1. Data Schema (Postgres / Supabase)

```sql
-- 1. Users
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          text not null check (role in ('student','teacher')),
  class_section text,                          -- e.g. '10A'
  created_at    timestamptz not null default now()
);

-- 2. Syllabus
create table chapters (
  id         uuid primary key default gen_random_uuid(),
  ncert_no   int  not null unique,             -- 12
  name       text not null,                    -- 'Magnetic Effects of Electric Current'
  subject    text not null check (subject in ('physics','chemistry','biology','general')),
  sort_order int  not null default 0
);

create table sections (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  section_no text not null,                    -- '12.1'
  name       text not null,                    -- 'Magnetic Field and Field Lines'
  sort_order int  not null default 0,
  unique (chapter_id, section_no)
);

-- 3. Questions
create table questions (
  id             uuid primary key default gen_random_uuid(),
  section_id     uuid not null references sections(id) on delete cascade,
  qtype          text not null check (qtype in ('mcq','flashcard')),
  language       text not null default 'en' check (language in ('en','kn')),
  question_text  text not null,
  options        jsonb,                        -- MCQ only: ["A…","B…","C…","D…"]
  correct_option smallint,                     -- MCQ only: 0..3 index
  explanation    text,                         -- 1-sentence explanation
  difficulty     text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  check ( (qtype='mcq' and options is not null and correct_option is not null)
       or (qtype='flashcard' and options is null and correct_option is null) )
);

-- 4. Daily activation (teacher trigger)
create table daily_sets (
  id           uuid primary key default gen_random_uuid(),
  set_date     date not null default current_date,
  activated_by uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  unique (set_date)
);

create table daily_set_sections (
  daily_set_id uuid references daily_sets(id) on delete cascade,
  section_id   uuid references sections(id)   on delete cascade,
  primary key (daily_set_id, section_id)
);

-- 5. Submissions
create table submissions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references profiles(id),
  question_id      uuid not null references questions(id),
  daily_set_id     uuid not null references daily_sets(id),
  selected_option  smallint,                   -- MCQ
  self_eval        text check (self_eval in ('got_it','need_practice')),  -- Flashcard
  is_correct       boolean,                    -- MCQ: server-graded; Flash: self-graded
  answered_at      timestamptz not null default now(),
  unique (student_id, question_id, daily_set_id)
);

-- 6. Streaks (materialized on write)
create table streaks (
  student_id         uuid primary key references profiles(id),
  current_streak     int not null default 0,
  best_streak        int not null default 0,
  last_activity_date date,
  updated_at         timestamptz not null default now()
);
```

**RLS:** all tables `enable row level security`. MVP uses API-only writes (service role), so policies are restrictive-by-default; we still add basic select policies for diagnostics. Kept intentionally minimal until the app is feature-frozen.

## 2. API Contract

Base URL: `/api` · Auth: `Authorization: Bearer <supabase JWT>` · Errors: `{error: {code, message}}` · Validation: Zod on all inputs.

### Student endpoints

**`GET /api/feed/today`**
```json
200 {
  "set":      {"id": "…", "date": "2026-08-02"},
  "sections": [{"id": "…", "section_no": "12.1", "chapter": "Magnetic Effects of Electric Current", "name": "Magnetic Field and Field Lines"}],
  "questions": [{"id": "…", "section_id": "…", "type": "mcq|flashcard", "question_text": "…", "options": ["A…","B…","C…","D…"] | null}],
  "progress": {"answered": 2, "total": 5, "completed": false}
}
```
Edge cases: no set today → `200 {empty: true}` · set exists but student answered everything → `completed: true` + summary payload.

**`POST /api/submissions`**
```json
req  {"question_id": "…", "daily_set_id": "…", "selected_option": 1}           // MCQ
req  {"question_id": "…", "daily_set_id": "…", "self_eval": "got_it"}          // Flashcard
200  {"is_correct": true, "correct_option": 1, "explanation": "…", "progress": {"answered": 3, "total": 5, "completed": false}}
```
Idempotent: same (student, question, set) → returns stored result, never duplicates.

**`GET /api/me`** → `{profile, streak: {current, best, last_active_date}, totals: {questions_answered, accuracy}}`

### Teacher endpoints

**`GET /api/syllabus`** → chapters+sections tree incl. question counts + `enabled` status.

**`POST /api/activations`**
```json
req {"date": "2026-08-02"?, "section_ids": ["…","…"]}   // date defaults to today
200 {"daily_set_id": "…", "date": "…", "sections": [{"id","section_no","name","question_count"}]}
```

**`GET /api/activations?date=2026-08-02`** → current snapshot for that date (or `null`).

**`GET /api/reports/participation?date=&class_section=`**
```json
200 {"total_students": 40, "done": [{"id","name","answered","completed"}], "pending": [{"id","name"}]}
```

**`GET /api/reports/performance?section_id=&from=&to=`**
```json
200 {"per_section": [{"section_id","section_no","name","attempts","accuracy"}],
     "per_student": [{"id","name","avg_accuracy","questions_answered"}]}
```

### Admin / content (CLI, not HTTP)
- `npm run seed -- content/ch12.json` · `npm run verify` (orphan FK, duplicate text, correct_option in range, missing explanations).

## 3. Mobile App Structure (Expo, one codebase)

```
mobile/
  app/                      # expo-router file-based routing
    _layout.tsx             # auth gate + role redirect
    login.tsx
    (student)/
      feed.tsx              # vertical pager + progress header
      summary.tsx           # end-of-session screen
      profile.tsx           # streak + stats
    (teacher)/
      activate.tsx          # A.1 syllabus checklist → Activate
      participation.tsx     # A.2 who-did-today
      reports.tsx           # A.2 accuracy per section/student
  src/
    api/client.ts           # typed fetch wrapper (TanStack Query hooks)
    api/types.ts            # mirrored from api/src/contracts
    components/
      QuestionCard.tsx      # renders MCQ | Flashcard variants
      OptionButton.tsx      # A/B/C/D + correct/incorrect states
      StreakHeader.tsx
    state/  stores.ts       # zustand: session progress, streak
    theme/  index.ts        # dark, reels-style: bold gradients, big type
```

**Student feed UX (B.1):**
- `FlatList` with `pagingEnabled` + `getItemLayout` (or `react-native-pager-view`) → one full-screen question per page, vertical snap.
- Top overlay: progress pill `3/5` + streak flame. Bottom: answer area.
- **MCQ card:** options as large tappable rows → tap → instant green/red highlight + explanation strip + auto-advance to next page after ~1.2s.
- **Flashcard card:** big prompt + "Show Answer" flip → answer + "Got it right" / "Need practice" buttons → advance.
- After last question → `summary.tsx` (score, completion badge, streak update, "back to feed" note).
- Empty state: friendly "No revision today yet 🧪" + teacher hint.

**Teacher screens:** activate = expandable chapters → checkboxes per section → question count badge → "Activate Revision" → confirmation with date. Participation = list w/ green/amber states + progress bars. Reports = section selector + accuracy bars + per-student table.

## 4. Seed Content Format (content/ch12.json)

```json
{
  "chapter": {"ncert_no": 12, "name": "Magnetic Effects of Electric Current", "subject": "physics"},
  "sections": [
    {
      "section_no": "12.1",
      "name": "Magnetic Field and Field Lines",
      "questions": [
        {"type": "mcq", "difficulty": "easy", "language": "en",
         "text": "The magnetic field lines around a bar magnet…",
         "options": ["…", "…", "…", "…"], "correct": 2, "explanation": "…"},
        {"type": "flashcard", "difficulty": "medium",
         "text": "State Fleming's Left Hand Rule.", "answer": "…", "explanation": "…"}
      ]
    }
  ]
}
```

## 5. Monorepo Layout

```
stem-app-project/
├── docs/            # 01-PRD, 03-HLD, 04-LLD, 05-ROADMAP
├── mobile/          # Expo RN app (student + teacher)
├── api/             # Node+TS service (Hono, Drizzle, Zod)
│   ├── src/routes/  # feed, submissions, activations, reports, me
│   ├── src/db/      # drizzle schema + migrations
│   └── src/lib/     # auth middleware, scoring, streaks
├── content/         # seed JSON (ch12.json …)
├── scripts/         # seed.ts, verify.ts, create-students.ts
└── shared/          # TS types + zod schemas imported by api & mobile
```

## 6. Build Order (implementation sequence)

1. `shared/` contracts + zod schemas
2. Supabase project, `profiles` trigger (create on auth signup), schema migrations
3. `content/` Ch.12 seed JSON + seed/verify scripts
4. API: auth middleware → feed → submissions (+streak) → activations → reports
5. Mobile: login → feed (MCQ + flashcard) → summary → streak
6. Mobile: teacher screens (activate, participation, reports)
7. `scripts/create-students.ts` + pilot runbook
