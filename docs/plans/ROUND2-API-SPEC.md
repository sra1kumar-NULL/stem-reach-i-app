# Round 2 — API spec, database changes and work split

Source of truth for the parallel build. Product decisions: `docs/plans/TEACHER-AUTHORING-PLAN.md` §0.
**Types are already written** in `core/src/contracts.ts` (block "Round 2", plus additive edits to existing schemas).
Contracts are **frozen**: do not change them. If something is truly missing, add it at the very end of the file in a block
named `// ── added by <agent> ──`, keep it additive, and say so in your report.

## 0. Conventions (apply to every route)

- Authz comes from the verified token only (`requireRole`). Never accept `created_by`, `updated_by`, `org_id`, `user_id` or role from a body/query.
- Validate every input with the Zod schema from `@stemreach/core`. Error shape: `{ error: { code, message } }` via `badRequest/notFound/conflict/forbidden` in `api/src/lib/http.ts`.
- Drizzle only; no string-built SQL. Use `db.transaction` for multi-statement writes.
- "Today"/"a day" = school timezone (`ctx.timezone`, `todayInTz`, `AT TIME ZONE`), never UTC.
- Use the existing test harness (`api/src/test-utils.ts`, `node --test` via `npm test`). Every new route needs tests: happy path, 400, 401/403 (student), 404, 409 cases.
- CORS: `api/src/app.ts` must allow `PATCH` (and `PUT`).
- **Never touch the real database.** No SQL is applied to Supabase in this round, no service key, no `api/.env`. The production DB does not have the new columns yet; the owner applies the SQL files later.
- Migrations: each agent writes **one idempotent SQL file** `docs/migrations/2026-10-04-<agent>-<name>.sql` (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, RLS enabled with no policies like the existing tables) AND the matching Drizzle schema change in `core/src/db/schema.ts`.
- Old app builds must keep working: all new response fields optional; defaults preserve current behaviour.

## 1. Database changes (by owner)

| Agent | Change |
|---|---|
| profile | `profiles.question_language text NOT NULL DEFAULT 'en' CHECK (question_language IN ('en','kn','both'))` |
| questions-api | `questions.status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published'))`, `questions.edited_at timestamptz NULL`, `questions.updated_by uuid NULL REFERENCES profiles(id)`; new table `question_revisions(id uuid pk default gen_random_uuid(), question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE, revision_no int NOT NULL, snapshot jsonb NOT NULL, edited_by uuid NULL REFERENCES profiles(id), edited_at timestamptz NOT NULL DEFAULT now(), UNIQUE(question_id, revision_no))` |
| student-reset | new table `password_resets` (see 2.6) |
| catalog-calendar | none required (chapters/sections already have `sort_order`); add indexes only if a query needs them (e.g. `questions(created_at)`), in its own SQL file |

## 2. Endpoints

All under `/api`, teacher-only unless noted. "Any teacher" edits any question (shared pool); `assertCanEditQuestion(user, question)` in `api/src/lib/question-access.ts` is the single place to change when organisations arrive (it currently allows every teacher).

### 2.1 Profile (agent: profile) — any signed-in user
- `GET /api/me` — adds `profile.question_language` (default `en`).
- `PATCH /api/me` — body `UpdateMeRequest`; returns `MeResponse`. Updates only `full_name` / `question_language`.
- **Language filter:** `GET /api/feed/today`, the due-review query (`api/src/lib/reviews.ts`) and `/api/me` `srs.due_today` return only questions whose `language` matches the student's preference (`both` = no filter). Students default to `en`. Submissions are not filtered (a student can only answer what the feed served, existing rules apply). Reports are language-agnostic.

### 2.2 Questions (agent: questions-api)
- `GET /api/questions` — filters per `ListQuestionsQuery`; ordering `created_at desc, id desc`; keyset `cursor` (opaque base64 of `created_at|id`); default `limit` 30, max 100; default `archived=exclude`. Each item includes `submission_count`, `status`, `edited_at`, `updated_by`.
  `created_on` buckets by the school timezone.
- `POST /api/questions` — as today plus `status` (default `published`). Exact duplicate (same section, same text) stays 409.
- `PATCH /api/questions/:id` — `UpdateQuestionRequest`. Merge with the stored row, re-run `authoredQuestionOk` on the merged result (400 on failure). If `submission_count > 0` and the request changes `type`, `options` or `correct` → **409 `question_in_use`** ("archive it and create a corrected copy"). Writes a `question_revisions` row with the PRE-edit snapshot (revision_no = max+1), sets `edited_at = now()`, `updated_by = caller`. Moving to another section (`section_id`) must keep the unique (section, text) rule (409 on clash). Returns `TeacherQuestionDto`.
- `DELETE /api/questions/:id` — **any teacher**; allowed only when no `submissions` and no `review_states` reference it, otherwise 409 `question_in_use`. (Replaces "creator only"; seeded questions are deletable under the same rule.)
- `GET /api/questions/:id/revisions` → `ListRevisionsResponse` (newest first).
- `POST /api/questions/:id/restore` — body `RestoreRevisionRequest`; applies that snapshot like a PATCH (same in-use rule, creates a new revision). 404 if the revision does not exist.
- `POST /api/questions/similar` — `SimilarQuestionsRequest` → `SimilarQuestionsResponse`: same section, other questions whose normalised text (NFC, lower-cased, punctuation stripped, whitespace collapsed) equals or is within a small edit distance / token-set similarity (>= 0.85). Max 5. Advisory only — create/patch never block on similarity.
- **Student-facing effect:** the feed, due reviews, submissions validation and reports must treat a question as servable only when `enabled = true AND status = 'published'`. Drafts and archived questions never reach students. (Existing answered history is untouched.)
- **Seed lock:** `scripts/src/seed.ts` skips rows with `edited_at IS NOT NULL` (logs them) unless run with `--force`. Add a unit test for the decision function (extract it so it is testable).

### 2.3 Catalog (agent: catalog-calendar)
- `GET /api/syllabus` unchanged shape (keep). Counts must exclude nothing new (enabled_question_count stays "enabled").
- `POST /api/chapters` (`CreateChapterRequest`) → `ChapterDto` 201; 409 if `ncert_no` exists.
- `PATCH /api/chapters/:id` (`UpdateChapterRequest`) → `ChapterDto`; 409 on `ncert_no` clash.
- `DELETE /api/chapters/:id` → `OkResponse`; 409 `not_empty` if it has any section with a question; empty sections are removed with it.
- `POST /api/sections` (`CreateSectionRequest`) → `SectionDetailDto` 201; `sort_order` = max+1 within the chapter; 409 on duplicate `section_no` in the chapter; 400 if the chapter does not exist.
- `PATCH /api/sections/:id` (`UpdateSectionRequest`) → `SectionDetailDto`; 409 on clash. (Reorder = set `sort_order`.)
- `DELETE /api/sections/:id` → `OkResponse`; 409 `not_empty` if it has questions or has ever been activated (`daily_set_sections`).

### 2.4 Import / export (agent: catalog-calendar)
- `POST /api/questions/import` — `ImportQuestionsRequest` → `ImportQuestionsResponse`. Per row: validate with `ImportQuestionRow`; resolve the section by `section_id`, else `(chapter_no, section_no)`, else `default_section_id`; flag `duplicate` when the normalised text already exists in that section (same normaliser as `/similar` — share it in `api/src/lib/text-normalize.ts`; **the questions-api agent owns that file**, catalog-calendar must import it only after merge — until then implement a local copy and note it). Not dry-run and no invalid rows: insert all non-duplicates in ONE transaction with `status = request.status ?? 'draft'`, `created_by` = caller → `committed: true`. Any invalid row → nothing is written, `committed: false`, `created: 0`.
- `GET /api/questions/export?chapter_id=` → `SeedContent` (from `@stemreach/core/content`): enabled questions only, drafts included, so it round-trips through `content/*.json` and `npm run verify`. 404 for unknown chapter.

### 2.5 Calendar and planning (agent: catalog-calendar)
- `GET /api/calendar?month=YYYY-MM` → `CalendarMonthResponse` (only days with data). `created_count` from `questions.created_at` in the school timezone; `activated_section_count` from `daily_sets/daily_set_sections`; `participation_pct` = distinct students with >= 1 submission in that day's set / total students (0..1), `null` when nothing was activated.
- `GET /api/calendar/day?date=` → `CalendarDayResponse`.
- `GET /api/activations/range?from=&to=` → `ActivationRangeResponse` (max 62 days, else 400).
- `POST /api/activations/plan` — `PlanActivationsRequest`; every date must be today or later in the school timezone (400 otherwise); all-or-nothing in one transaction; replaces existing activations on those dates like `POST /api/activations`; unknown section ids → 400. Returns `ActivationRangeResponse`.

### 2.6 Teacher-set student password (agent: student-reset)
Decision: students without usable email recover through their teacher (option C in the plan chat). Single-school pilot; every access check lives in `assertCanManageStudent(teacher, student)` in `api/src/lib/student-access.ts` (currently: any teacher, target must be a student) so organisation scoping is a one-line change later.
- `GET /api/students?q=&class_section=` → `ListStudentsResponse` (students only, ordered by name; `last_active_date` from submissions in the school timezone).
- `POST /api/students/:id/reset-password` → `ResetStudentPasswordResponse`. Target must exist and have role `student` (teachers and unknown ids → 404, never 403, so roles are not leaked). Generate a 10-character password from an unambiguous alphabet (no 0/O/1/l/I) using `crypto.randomInt` when none is supplied. Apply it with the Supabase **admin API** (`auth.admin.updateUserById`) and set `app_metadata.must_change_password = true` (app_metadata cannot be edited by the user). The password is never logged or stored. Write an audit row to the new table `password_resets(id uuid pk default gen_random_uuid(), student_id uuid NOT NULL REFERENCES profiles(id), reset_by uuid NOT NULL REFERENCES profiles(id), created_at timestamptz NOT NULL DEFAULT now())` (RLS on, no policies). Rate limit: 20 resets per teacher per hour (reuse the in-memory limiter in `api/src/lib/rate-limit.ts`; 429 `too_many_attempts`).
- `POST /api/me/change-password` (any signed-in user) — `ChangePasswordRequest`; sets the caller's password via the admin API for the **caller's own id from the token** and sets `app_metadata.must_change_password = false`. Returns `OkResponse`. Mount it in a new router file (`api/src/routes/account.ts`) at `/me` — do not edit `routes/me.ts` (the profile agent owns it).
- **Server-side enforcement:** in `api/src/lib/auth.ts`, when the verified user has `app_metadata.must_change_password === true`, every route returns 403 `password_change_required` except `GET /api/me` and `POST /api/me/change-password` (and `/healthz`, `/auth/*`, which are outside the middleware). Add tests (blocked on /feed, allowed on /me and change-password, cleared afterwards).
- Mobile: forced `change-password` screen (see §3); teacher `Students` screen.

## 3. Mobile structure (fixed names so agents do not collide)

```
mobile/src/app/profile.tsx                       (profile)            shared route for both roles
mobile/src/app/(student)/index.tsx               (feed-guidance)      feed + header
mobile/src/app/(teacher)/_layout.tsx             (teacher-core)       Tabs: index=Today, questions, calendar, reports ; profile button
mobile/src/app/(teacher)/questions/index.tsx     (teacher-core)       list
mobile/src/app/(teacher)/questions/edit.tsx      (teacher-core)       create/edit; params: id? , section_id?
mobile/src/app/(teacher)/calendar.tsx            (teacher-extras)
mobile/src/app/(teacher)/catalog.tsx             (teacher-extras)     chapters & topics manager
mobile/src/app/(teacher)/import.tsx              (teacher-extras)
mobile/src/app/(teacher)/students.tsx            (student-reset)      roster + "Reset password" (temp password shown once, copy button)
mobile/src/app/change-password.tsx               (student-reset)      forced screen when the session has app_metadata.must_change_password
mobile/src/api/students.ts                       (student-reset)
mobile/src/components/month-grid.tsx             (teacher-extras)     reusable month grid
mobile/src/api/me.ts | questions.ts | catalog.ts | calendar.ts   one new file per agent; do NOT edit src/api/client.ts except to export what you need
```
- Profile "How it works" navigates to `/(student)?coach=1`; the feed screen reopens the coach overlay when it sees `coach=1`.
- Profile avatar button: feed-guidance links to `/profile`; teacher-core links to `/profile` from the teacher layout. Until `profile.tsx` is merged, link with `href="/profile" as Href` casts so typecheck passes.
- Use existing UI components (`@/components/ui/*`, `ConfirmSheet`, `ThemeSheet`, `toast`, `ErrorState`, `BackButton`, `toFriendlyError`) and the Nord theme tokens. Labels, roles, >= 44 pt targets, light and dark, keyboard-safe forms, skeleton/empty/error+retry states on every list.

## 4. Verification each agent must run (real output required in the report)

`npm install` and `npm ci --prefix mobile` first. Then: `npm run typecheck`, `npm test`, `npm run lint`, `npm run verify`.
Mobile typecheck needs generated route types: start `CI=1 npx expo start --offline --port <yours>` in `mobile/` until `.expo/types/router.d.ts` exists (it is regenerated when routes change), then `npx tsc --noEmit`.
Web UI checks: use the Playwright helper at `/tmp/claude-1000/-home-sasuke-workspace-stem-app-project/f536e0d5-fb5e-4242-83b4-3e5971525d97/scratchpad/web/` (`playwright-core` + system Chrome at `/usr/bin/google-chrome`; see `lib.mjs`). It logs in against the live API — for screens that need the new endpoints use `page.route('**/api/...')` mocks, never the real database.

## 5. Out of scope this round

Answer image upload (needs the editor first), delete-my-account, push notifications, XP/leagues.
