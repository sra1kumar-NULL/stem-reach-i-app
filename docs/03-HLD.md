# HLD — Daily Revision App (v0.1)

Status: **Draft for review** · Author: Principal Engineer (shared) · Reviewed-by: TBD

## 1. System Context

```
┌──────────────────┐   HTTPS/JSON    ┌──────────────────┐   Postgres (SQL)   ┌─────────────────────┐
│  Mobile App      │ ───────────────►│  API Service     │ ──────────────────► │  Supabase           │
│  (React Native)  │ ◄───────────────│  (Node + TS)     │ ◄────────────────── │  • Postgres + RLS   │
│  Student &       │                 │                  │    supabase-js     │  • Auth             │
│  Teacher UIs     │                 │  auth: supabase  │ ◄────────────────── │  • Storage (V2)     │
└──────────────────┘                 └──────────────────┘                     └─────────────────────┘
        │                                     │
        └── one codebase, role-gated screens ─┘
                                        ▲
                                        │
                              ┌──────────┴──────────┐
                              │  Seed / CLI scripts │  (content JSON → DB)
                              └─────────────────────┘
```

**Players:**
1. **Mobile app (Expo / React Native + TS)** — one app, two role experiences (student feed, teacher dashboard). Talks only to the API.
2. **API service (Node.js + TypeScript)** — the only writer to business tables. Owns scoring, feed assembly, reports. Delegates identity to Supabase Auth.
3. **Supabase (managed Postgres + Auth + Storage)** — the database of record. RLS enabled as defense-in-depth (belt-and-braces: API uses a privileged role; RLS still prevents accidental client-side writes).
4. **Seed/CLI scripts** — load the question bank from version-controlled JSON; verify integrity.

## 2. Tech Stack & Rationale (decisions for sign-off)

| Layer | Choice | Why (vs. alternatives) |
|---|---|---|
| Mobile | **Expo (React Native) + TypeScript** | Fastest path to a testable app on real student phones (Expo Go = no Play Store build for the pilot). One codebase for student + teacher. |
| API | **Node.js 20 + TypeScript, Hono, Zod, Drizzle ORM** | Single language across mobile + API + shared types — critical for a 2-person team. Hono = tiny, fast, typed. Zod validates every boundary. Drizzle = type-safe SQL, no codegen magic. |
| Database | **Supabase Postgres** | Managed Postgres, built-in auth, storage for V2 photo uploads, free tier fits pilot scale. |
| Why not Go | — | Go is great, but adds a second language + type-sync tax across the monorepo for zero measurable benefit at this scale. Revisit if API becomes compute-heavy. |
| Hosting | **Render (or Fly.io) free tier** for API; Supabase cloud free tier | Zero-cost pilot. |
| Data fetching (mobile) | TanStack Query + Zustand | Caching/stale-while-revalidate for feed; minimal local state. |
| Vertical paging | `react-native-pager-view` (or FlatList `pagingEnabled`) | Native snap-scroll per question. |

## 3. Core Data Flows

### Flow 1 — Daily Activation (teacher → set)

```
Teacher app → POST /api/activations {date: today, section_ids: [12.1, 12.2]}
API        → validates teacher role + sections exist
           → upserts daily_sets (one row per date)
           → replaces daily_set_sections (snapshot of the day's scope)
           → 200 {set_id, date, sections}
```

- One `daily_set` per date. Re-activation replaces the snapshot (idempotent).
- **Rule:** a student's feed is built from the *latest snapshot* for a date. If the teacher adds sections mid-day, students who already finished just see fewer total questions that day — acceptable for MVP, flagged as a V2 refinement (per-student set freezing).

### Flow 2 — Student Feed (read path)

```
Student app → GET /api/feed/today
API         → finds/creates nothing; reads:
              1. daily_set for today (or nearest active date, configurable; MVP = today only)
              2. sample K questions per section from that set (K default 5, seeded by RNG)
              3. mark already-answered questions (from submissions)
              4. compute progress {answered, total, completed}
           → 200 {set, sections, questions[], progress}
```

- **Sampling** (random K per section) stops students from memorizing the order while keeping the set small enough for 5–10 min.
- If no set exists for today → `200 {empty: true}`; app shows "No revision today yet — check back after class."

### Flow 3 — Submission (write path + scoring)

```
Student app → POST /api/submissions {question_id, set_id, selected_option? | self_eval?}
API         → MCQ:    look up question → is_correct = (selected_option == correct_option)
             → Flash:  is_correct = (self_eval == 'got_it')  [self-graded, stored as-is]
             → upserts into submissions (unique student+question+set → no double count)
             → updates streaks row (see §4)
           → 200 {is_correct, correct_option, explanation, progress}
```

### Flow 4 — Reporting (teacher read path)

```
Teacher app → GET /api/reports/participation?date=&class_section=
Teacher app → GET /api/reports/performance?section_id=&from=&to=
API         → aggregates submissions ⋈ questions ⋈ sections, grouped by student / section
           → 200 {rows, summaries}
```

Aggregations run in SQL (fast, trivial at this scale); no materialized cubes in MVP.

### Flow 5 — Content Seeding (admin/offline)

```
developer → content/ch12.json → `npm run seed` → chapters/sections/questions
         → `npm run verify`   → orphan checks, duplicate checks, answer-in-range checks
```

## 4. Streaks (gamification core)

- A **day counts** toward the streak if the student submits ≥1 answer that day (participation). Full completion is separate ("Daily Revision Complete" badge).
- `streaks` table is updated transactionally inside Flow 3:
  - `last_activity_date == today` → no-op (already counted).
  - `last_activity_date == yesterday` → `current_streak += 1`, update `best_streak`.
  - otherwise → reset `current_streak = 1`.
- MVP: computed at write time (materialized), avoids per-read recomputation.

## 5. Non-Functional Requirements

- **Latency:** feed GET < 300ms p95 (single query + tiny payload; trivial).
- **Scale:** 1 class (~40 students) × 6 days/week for pilot. Design assumes ≤ 10k daily requests — no caching layer needed yet.
- **Auth & security:** Supabase Auth (email/password); teacher creates student accounts (no email verification needed for pilot — teacher shares credentials). API validates role from JWT on every route. RLS on as defense-in-depth.
- **Offline:** NOT in MVP. Students need network; school context assumed OK (review after pilot).
- **Language:** `language` column (`en`/`kn`) on content from day one; bilingual UI is V2.
- **Observability:** request logging + error reporting (Sentry free tier) — decide before pilot week.

## 6. Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Students share/reuse answers within a day | Unique(student, question, set) blocks dupes; acceptable for MVP (it's a recall tool, not an exam). |
| Teacher forgets to activate | App "empty state" + teacher dashboard shows last-active dates; V2: push reminder. |
| Content quality (bad questions) | 1-sentence explanations, `difficulty` tags, teacher can `enabled=false` a question via seed update. |
| Phone/network constraints (govt school) | Keep payloads tiny; lazy-load images only; app targets Android-first (Expo Go). |
| No emails for students | Teacher-provisioned accounts with simple credentials; document login UX in teacher app. |

## 7. Decisions (signed off by team)

| # | Decision | Chosen |
|---|---|---|
| 1 | API stack | **Node.js + TypeScript** (Hono + Drizzle + Zod) |
| 2 | Student auth | **Teacher-created accounts** (bulk create, shared simple credentials, no email verification) |
| 3 | Empty-feed behavior | **Empty state** ("No revision today yet — check back after class") |
| 4 | Daily question dose | **5 per section** (sampled randomly) |
