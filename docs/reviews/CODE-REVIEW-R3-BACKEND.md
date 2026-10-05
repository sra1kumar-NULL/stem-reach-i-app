# Round 3 backend code review

Scope: `api/src`, `core/src`, `scripts/src`, `docs/migrations/*.sql`, `api/test/schema.sql`, `.github/workflows/ci.yml`, `render.yaml`.
Read-only review, 2026-10-04. Every finding below was confirmed by reading the code at the cited line. Those marked **[repro]** were also reproduced by running the real routes against a throwaway Postgres 16 (a scratch database in the local e2e container, since dropped; probe scripts were kept outside the repo).

## Checks run (real output)

| Command | Result |
|---|---|
| `npm run typecheck` (core, api, scripts, mobile) | exit 0, no errors |
| `npm test -w core` | 34 tests, 34 pass, 0 fail |
| `npm test -w api` (no `TEST_DATABASE_URL`) | 165 tests, 165 pass, 0 fail |
| `npm test -w scripts` | 4 tests, 4 pass |
| `npm run verify` | `3 sections, 34 MCQs, 15 flashcards` / `verify: OK` |
| `TEST_DATABASE_URL=...scratch npx tsx --test "src/**/*.integration.test.ts"` | 65 tests, 65 pass, 0 fail |

Note: plain `npm test` reports the integration suite as skipped-in-place, so "165 pass" does not include real-Postgres coverage unless `TEST_DATABASE_URL` is set. CI does set it in the `db-integration` job.

The suite is green, and still all the blockers/majors below passed through it. The tests encode the author's happy-path expectations, not hostile or malformed input.

---

## A. Blockers and majors

### B1. Any database missing the Round-2 migration returns 500 for every authenticated request; there is no startup check and `/healthz` stays green (BLOCKER, confidence high) [repro]
- `api/src/lib/auth.ts:33` does `ctx.db.select().from(profiles)`. Drizzle selects every column in `core/src/db/schema.ts`, including `question_language` (`schema.ts:10`). On a DB without the migration this throws `column "question_language" does not exist` and the error handler returns 500 (`lib/http.ts` errorHandler).
- Reproduced: dropped `profiles.question_language`, `questions.status/edited_at/updated_by`, `question_revisions`, `password_resets` from the test DB. Result: `GET /api/me` (student and teacher) and `GET /api/syllabus` all 500 with the generic "something went wrong". `GET /api/healthz` still returned `{"ok":true}`.
- This is exactly the live outage. `render.yaml:8` uses `/api/healthz` as `healthCheckPath`, and `healthz` (`app.ts:30`) never touches the DB. So Render marks a deployment that cannot serve a single request as healthy, and a bad deploy will not roll back.
- Nothing in the repo applies migrations: no ledger table, no runner, and `docs/DEPLOY.md:235` relies on a human pasting SQL.
- Fix (S, safe now):
  1. In `api/src/index.ts`, before `serve()`, run a schema probe derived from the Drizzle tables: use `getTableConfig` for each exported table, compare with one `information_schema.columns` query, and on any gap log "database is missing: profiles.question_language ... run docs/migrations/2026-10-04-round2-ALL.sql" and `process.exit(1)`. Failing at boot makes Render keep the old version running.
  2. Make `/api/healthz` cheap but real (`select 1`), and add `/api/healthz?deep=1` (or `/api/readyz`) that runs the schema probe result cached at boot. Point `healthCheckPath` at it.
  3. Add a unit test that the probe's expected-columns list equals the Drizzle schema (fails when someone adds a column without a migration).
- Medium-term (M): adopt `drizzle-kit` generated migrations or a tiny `schema_migrations` ledger run by a script, so `api/test/schema.sql`, prod and Drizzle come from one source (see D1).

### B2. Demo accounts with a public shared password, including a teacher, may exist on the production Supabase project (BLOCKER until verified, confidence medium; needs owner action)
- `dummy-creds.json` (tracked) names project ref `cihobqescuhuxtiogivb`, password `Stemri@2026`, and `teacher@stemri.local`. `scripts/src/create-users.ts:6-13` hard-codes the same, `scripts/build-apk.sh:62` defaults to the same project URL, and `docs/DEPLOY.md` references the live Supabase ref. `create-users.ts` creates whatever project `api/.env` points to.
- If those accounts were ever created on the live project, anyone who reads the repo can sign in as a teacher: read every student's name/progress, reset any student's password (`students.ts` reset-password returns a usable password), edit/delete the question bank.
- Fix (S, needs product/owner): confirm in Supabase Auth whether `*@stemri.local` users exist; delete or rotate them; make `create-users.ts` refuse to run unless an explicit `--allow-demo` flag and a non-production URL are given.

### M1. Teacher-invite rate limit is bypassable by spoofing `X-Forwarded-For` (MAJOR, confidence medium-high) [repro]
- `lib/rate-limit.ts:93-96` keys on the FIRST hop of `X-Forwarded-For`; `routes/auth.ts:38` uses it. The first hop is whatever the client sent; proxies append the real address after it.
- Reproduced (with an invite code configured): 8 wrong guesses from one key give `[403,403,403,403,403,429,429,429]`; the same 8 guesses with a different spoofed first hop each give `[403 x8]`, never blocked.
- Impact: unlimited online guessing of `TEACHER_INVITE_CODE`, the only gate on teacher self-signup (teacher = full access to all student data). Strength depends on the code the owner chose; `.env.example` only says "long random value".
- Fix (S, safe now): key on the LAST entry that was appended by a trusted proxy (`xff.split(",").at(-1)`) or on Render's trusted client-IP header; also add a second, global limiter (for example 50 failures/hour across all keys) so rotation cannot defeat it. Verify Render's exact header behaviour before choosing.
- Same helper is only used for invites; the rest of the API has no rate limiting (see M7).

### M2. Malformed or empty JSON on `POST /activations` and `POST /submissions` returns 500, not 400 (MAJOR, confidence high) [repro]
- `routes/activations.ts:97` and `routes/submissions.ts:43` call `X.parse(await c.req.json())` inside `try/catch` that only handles `ZodError`; `c.req.json()` throws `SyntaxError` for bad/empty bodies, which falls through to the 500 handler and logs a stack trace each time.
- Reproduced: body `{bad` gives 500 on both routes; an empty body to `/activations` gives 500. `/auth/signup`, `/questions`, `/catalog` use `.json().catch(() => null)` and return 400. The mobile client and any proxy retry will hammer the 500 log.
- Fix (S, safe now): replace with `parseOr400(Schema, await c.req.json().catch(() => null))` (already exists in `lib/catalog-utils.ts`). Also route `me.ts:84`, `account.ts:14`, `auth.ts:28` through the same helper (they work but duplicate the logic).

### M3. Invalid calendar dates and NUL characters become 500s (MAJOR, confidence high) [repro]
- `routes/reports.ts:9,18,87-88`: `DATE_RE` is shape-only. `GET /reports/participation?date=2026-02-30` and `/reports/performance?from=2026-02-30` reach Postgres (`eq(dailySets.setDate, date)` / `${from}::date`) and fail with "date/time field value out of range": 500. Reproduced: both 500. Other routes (activations, calendar, questions `created_on`) correctly call `isValidIsoDate`.
- A NUL byte (`\u0000`) in any text goes to Postgres and errors ("invalid byte sequence"): reproduced 500 for `GET /students?q=%00`, `GET /questions?q=%00`, `POST /questions` with `text:"a\u0000b"`, and `PATCH /me` with `full_name:"a\u0000b"`. A teacher pasting from a PDF can trigger it in the question editor and gets "something went wrong".
- Fix (S, safe now): (a) in `core/src/contracts.ts` make `ISO_DATE` also `.refine(isValidIsoDate)`; this only tightens input that already 500s, so it is additive in practice. (b) Add a shared `safeText()` Zod helper (`.refine(s => !s.includes("\u0000"))`, or strip) and use it in `AuthoredQuestion.text/answer/explanation/options`, `full_name`, `q` filters. (c) As a safety net, map Postgres SQLSTATE class 22 (data exceptions: 22P02, 22008, 22021) to 400 in `errorHandler`.

### M4. Student progress `total`/`completed` ignores the student's language: the feed and the submission response disagree, and reports mislabel kn/both students (MAJOR, confidence high) [repro]
- `routes/submissions.ts:50-70` (`progressFor`) counts enabled published questions per section WITHOUT the language filter that `routes/feed.ts:49-55` applies. `routes/reports.ts:56-63` (participation `target`) has the same omission.
- Reproduced: section with 6 English and 2 Kannada flashcards, Kannada student: `GET /feed/today` gives `progress.total = 2`; after answering one card the `POST /submissions` response says `progress.total = 5`. For the English student, feed and submit both say 5.
- Consequences: the progress bar jumps when the first answer is submitted; `completed` in the submit response (`answered >= total`) can never become true for a Kannada student whose pool is smaller than 5; participation `completed` is wrong for them for the same reason. `progress.completed` is also computed with two different definitions: feed = "queue empty" (feed.ts:200), submission = "answered >= total" (submissions.ts:70), `reports` = "answered >= target". The feed's own comment explains why `answered >= total` is wrong, but the submit path still uses it.
- Fix (M, safe now): extract `dailyTarget(db, sectionIds, langPref)` and `isCompleted(...)` into `lib/reviews.ts` (or `lib/progress.ts`), use it in feed, submissions, reports (per-student language via a join to `profiles.question_language`). Add one real-DB test with a kn student.

### M5. Chapter delete silently cascades away activation history; section delete refuses (MAJOR, confidence high) [repro]
- `routes/catalog.ts:75-89` (chapter DELETE) checks only for questions. `daily_set_sections.section_id` and `sections.chapter_id` are `ON DELETE CASCADE` (`schema.ts`, `schema.sql`). A chapter whose topics were activated (but have no questions) is deleted with 200 and the `daily_set_sections` rows disappear. Section delete (`catalog.ts:182-203`) correctly returns 409 for the same data.
- Reproduced: section delete -> 409; chapter delete of the same section's chapter -> 200; `daily_set_sections` rows for it = 0; one `daily_sets` row is left with zero sections (the calendar then shows a "set" with no content and `/feed/today` returns `empty`).
- Related TOCTOU: both deletes do check-then-delete without a transaction or lock. A question created in the gap is removed by `questions.section_id ON DELETE CASCADE` (and fails with 23503 if it already has submissions, surfacing as an unhandled 500). The cascade FKs are the actual safety net, so they should be restrictive.
- Fix (S for the check, M for the DB hardening): in chapter DELETE also reject when any of its sections is in `daily_set_sections` (reuse the section check). Then (needs a migration, product-safe) change `questions.section_id` and `daily_set_sections.section_id` to `ON DELETE RESTRICT` so a race can never delete teacher or student content; keep `sections.chapter_id` cascade only for empty chapters. Wrap delete+check in a transaction with `FOR UPDATE` on the chapter/section row.

### M6. Missing migration/runner and test-schema drift: the "real Postgres" suite does not run against the production schema (MAJOR, confidence high) -- see D1.

### M7. No request body limit and almost no rate limiting (MAJOR for a public API, confidence high) [repro-partial]
- Reproduced: `POST /auth/signup` with a 5,000,000-character `full_name` is read fully into memory before Zod rejects it (400). No `bodyLimit` anywhere (`app.ts`). `full_name` max is 80 in the contract but only checked after the entire body is parsed.
- `POST /auth/signup` (students, no invite) has no limiter at all: a script can create unbounded Supabase auth users + profile rows (account spam; the profile insert path also runs for every attempt). Signup also returns Supabase's raw `error.message` (`auth.ts:60`), which distinguishes "already registered": email enumeration.
- Fix (S, safe now): Hono `bodyLimit({ maxSize: 1_000_000 })` globally (import endpoint max 200 rows fits), a per-IP failure/attempt limiter on signup (reuse `FailureLimiter`, counting every attempt), and replace the echoed Supabase message with a fixed "could not create account" (keep a distinct 409 only if you accept enumeration).

### M8. pg `Pool` has no error handler, no timeouts, and no graceful shutdown (MAJOR, confidence high on the pg behaviour)
- `core/src/db/client.ts:5` `new Pool({ connectionString })`. pg emits an `'error'` event when an idle client is dropped (Supabase pooler restarts, network blips). With no listener, Node throws "Unhandled 'error' event" and the process exits; Render restarts it, but in-flight requests fail.
- No `connectionTimeoutMillis`, `idleTimeoutMillis`, `statement_timeout` or `max`: if the DB is unreachable every request hangs until the platform times out instead of failing fast; a slow query can hold all 10 connections.
- No SIGTERM handler in `api/src/index.ts`, so a redeploy cuts requests mid-flight.
- Fix (S, safe now): `pool.on("error", log)`, `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 30000`, `max: 10`, `statement_timeout: 10000` (via `options`), and `SIGTERM` -> `server.close()` + `pool.end()`.

### M9. A per-request network round trip to Supabase on every call plus an unbounded profile lookup (MAJOR performance, confidence high)
- `lib/auth.ts:30` calls `supabase.auth.getUser(token)` (a remote HTTPS call to GoTrue) on every request, then a profile query. Every screen load pays 2 serial remote hops before any business query; `/feed/today` then runs about 9 more queries and `/me` 5 more.
- Fix (M, needs a small decision): verify the JWT locally against Supabase's JWKS (`jose` `createRemoteJWKSet`) and read `app_metadata.must_change_password` from the token claims. Trade-off: the must-change flag would be as fresh as the token (up to the token lifetime, 1 hour) after `change-password`, so the client must refresh the session after changing; alternatively cache `getUser` results for about 30 seconds keyed by token hash (S, safe, cuts most calls). Cache the profile row the same way and invalidate on `PATCH /me`.

---

## B. Medium/minor findings

### Security and authorization
- **S1 (minor, confidence high): every route has a role guard; identity always comes from the token.** Audited: feed/submissions = student; syllabus, activations, reports, questions (+import/export), chapters, sections, calendar, students = teacher; `/me`, `/me/change-password` = any authed user. No route accepts `user_id`/`org_id`/`created_by` from the client (`UpdateMeRequest`, `ChangePasswordRequest`, `ResetStudentPasswordRequest` are `.strict()`). No finding here; recorded so nobody re-audits it.
- **S2 (minor, confidence medium): temp-password reset does not revoke the student's existing sessions.** `students.ts:103` `updateUserById(... password ...)` does not sign the user out; an old refresh token held on a lost phone keeps working. Fix (S): call the admin sign-out/revoke endpoint for that user after the reset. Needs a check of the supabase-js version's API; low risk.
- **S3 (minor, confidence high): `must_change_password` gate is enforced correctly** (`auth.ts:42-47`; HEAD, PATCH, trailing-slash and case variants tried and all blocked or 404). Fresh flag read from GoTrue per request, so it cannot be forged client-side. Reproduced: feed -> 403 `password_change_required`; `GET /api/me?x=1` allowed. No change needed.
- **S4 (minor): CORS `origin: "*"`** (`app.ts:24`). Because auth is a Bearer header (no cookies), this is not a CSRF vector, but it is unnecessary exposure and lets any site call the API on behalf of a user whose token it obtains. Restrict to the Vercel origin(s) and localhost dev ports through an env var (`CORS_ORIGINS`), S, and note native apps do not send Origin. Add `secureHeaders()`. Needs the owner to list the production origins.
- **S5 (minor): signup email enumeration and error echo** -- see M7.
- **S6 (nit): no logging of secrets found.** Reset/change-password log only ids and provider status; audit-insert failure logs ids only; `logger()` logs paths and query strings (e.g. `?q=` search text, student names) but never headers. `.env` is gitignored, `.env.example` has placeholders. The Supabase anon key in `mobile/eas.json` is public by design.
- **S7 (minor): `change-password` and reset accept any 8-char password** (no breach/complexity rule) and `SignupRequest.password` has no max while the other two cap at 72 (bcrypt limit). Add `.max(72)` to signup (additive, S).
- **S8 (nit, confidence medium):** `students` reset rate limit is per teacher and counts every reset (`students.ts:94-99`), in memory; after a restart or with two instances the cap resets. Fine for the pilot; documented in the code.

### Correctness
- **C1 (minor, confidence high): `POST /activations` accepts any past or far-future date** (`activations.ts:101`; reproduced 200 for 2020-01-01 and 9999-12-31) while `/activations/plan` rejects past dates. Replacing a past day's sections rewrites history that reports and participation read. Needs a product decision; suggested: past dates 400 for activations, and cap the future horizon (for example 1 year).
- **C2 (minor, confidence high): `enabled_question_count` includes drafts** (`syllabus.ts:24`; reproduced: 8 total, 7 "enabled" with one disabled and one draft). The feed serves `enabled AND status = 'published' AND language match`. Teachers think a topic has 7 live cards when students get 5-6. Fix (S): count `enabled AND published`; keep contract name, document semantics; same for `question_count` in `activationRange`/`snapshot` which counts disabled/draft/other-language rows.
- **C3 (minor): `GET /reports/participation` returns 400 for a valid date with no activation** (`reports.ts:25`). A normal state is reported as a client error, unlike `/calendar/day` and `/activations`, which return empty. Fix (S): 200 with `done: [], pending: all students`, or 404 with a stable code; needs a mobile check on how it renders.
- **C4 (minor): `GET /students` and `reports/*` are unbounded**: no pagination or limit (`students.ts:47-66`, `reports.ts`). Fine at pilot size (about 30-500 students); becomes a full table scan of `submissions` per call because `last_active_date` is computed with `max(answered_at)` over a left join. The `streaks.last_activity_date` column already holds the same value in school timezone; use it (S) and add `limit/cursor` before multi-school use.
- **C5 (minor): `restore` reads the revision outside the transaction** (`questions.ts:300-312`). Harmless because `applyQuestionEdit` locks the row and recomputes `max+1`; verified revision numbering is race-safe (`question-revisions.ts:145-153` runs under `FOR UPDATE`). No change.
- **C6 (verified OK):** duplicate `POST /submissions` is idempotent under concurrency (10 parallel identical submissions: 10x 200, 1 submission row, 1 review state, streak 1). Streak upsert and SRS upsert maths read correct; `effectiveCurrentStreak` handles gap/yesterday/today. `todayInTz` (en-CA) and `addDaysIso` are DST-safe. Calendar month bounds handle December, leap day (covered by existing tests).
- **C7 (minor): export/seed round-trip is not lossless.** `questions-io.ts:162` replaces missing explanation with "No explanation provided." and emits topics with fewer than 5 questions, but `SeedSection` requires `min(5)` (`core/src/content.ts:22`), so an exported file can fail `npm run verify`/`seed`. Also `scripts/src/verify.ts` only checks one file (`ch12.json`), and CI runs `npm run verify` with no argument, so any future `content/*.json` is never checked. Fix (S): loop over all `content/*.json` in verify; relax `min(5)` for export or warn.
- **C8 (nit): feed returns questions in per-section groups, not interleaved**, and `feed.ts` runs three overlapping submission queries (`done`, `answeredAnySection`, `answeredBySection`). Merge into one query (S).

### Data integrity (D)
- **D1 (major, confidence high): three divergent sources of truth for the schema.**
  - Prod base tables were "created by hand" (`docs/DEPLOY.md:111`); their DDL exists only as prose in `docs/04-LLD.md` (older than the code: no `answer` column, no `question_language`, `status`...). There is no migration for the base tables or for `questions.created_by`/`answer` beyond a DEPLOY.md snippet; the Round-2 migration covers only the new columns.
  - `api/test/schema.sql` has NO CHECK constraints (LLD has `role`, `subject`, `qtype`, `language`, `difficulty`, `self_eval` checks, the mcq/flashcard shape check; migrations add `questions_status_check`, `profiles_question_language_check`), no RLS, and no FK from `streaks.student_id`/`profiles.id` to `auth.users`. So the integration suite cannot detect an insert that production would reject, nor a missing constraint.
  - Drizzle `streaks.studentId` has no FK, the LLD does. `daily_sets.set_date` default is `now()` in Drizzle/test schema vs `current_date` in LLD.
  - Migration files: `round2-ALL.sql` is a hand-concatenation of the other three (it can drift; no check). Idempotence relies on `IF NOT EXISTS` and a `pg_constraint` name lookup without a schema filter (works, but would be fooled by a same-named constraint in another schema).
  - Fix (M, safe): generate a baseline `docs/migrations/0000-baseline.sql` from the live schema (`pg_dump --schema-only`) and make `api/test/schema.sql` = baseline + all migrations applied in CI (`psql -f` in order), plus a CI job that dumps columns and compares to `getTableConfig` from Drizzle. Remove the hand-edited `schema.sql`.
- **D2 (major perf/integrity, confidence high): missing indexes for the new queries.** Existing indexes (listed from the test DB): `idx_questions_section`, `idx_review_states_due`, `idx_submissions_student_set`, the PK/unique indexes. Missing:
  - `submissions(question_id)`: used by the per-row correlated `submission_count` in `GET /questions` (`questions.ts:94`), the in-use check in PATCH/DELETE, and the FK. `EXPLAIN` on the test DB shows `Seq Scan on submissions`. A 30-row page does 30 sequential scans.
  - `submissions(daily_set_id)`: calendar participation, reports, feed `answeredInSet` filter by set; the existing `(student_id, daily_set_id)` index cannot serve a lookup by set alone.
  - `review_states(question_id)` for the FK and delete checks; `review_states(student_id, due_date)` is better than `(due_date)` alone for the feed query (`student_id =` + `due_date <=`; the PK prefix helps, but a composite avoids the sort).
  - `questions(created_at desc, id desc)` for the keyset list (small table, low priority) and `questions(section_id, enabled, status, language)` (low).
  - Add as `CREATE INDEX IF NOT EXISTS` in a new migration and in `schema.ts` (S).
- **D3 (minor): `questions.created_by`, `updated_by`, `question_revisions.edited_by` FK to `profiles` with no ON DELETE action**: deleting a teacher profile is impossible once they authored anything. Fine now (no profile deletion path); note for account deletion.
- **D4 (minor): RLS.** Migrations enable RLS only on the two new tables; the base tables' RLS status is unverifiable from the repo (DEPLOY.md says "audit by hand"). Because the browser app holds an anon key, any base table without RLS is readable through PostgREST. Fix (S, owner): run the audit query from DEPLOY.md and add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for all tables in the baseline migration.
- **D5 (nit): `profiles` rows are inserted by `scripts/create-users.ts` through PostgREST (`admin.from("profiles").insert`)** rather than Drizzle; it bypasses the "API is the only writer" rule in spirit, and uses `listUsers({perPage:1000})` per user, which stops finding existing users beyond 1000.

### API design consistency
- **A1 (minor): validation error messages drop the field path in some routes.** `questions.ts:38` `zodMessage` joins `i.message` only; `catalog-utils.ts:4` includes paths. Reproduced: `POST /api/questions {}` returns `"Required; Required; Required; Required"`, which is useless to a client or a CSV importer. Fix (S): one shared `parseOr400` everywhere; optionally add `details: [{path, message}]` to `ApiError` (additive).
- **A2 (minor): error code vocabulary is inconsistent.** 429 bodies are hand-built twice (`auth.ts:42`, `students.ts:96`) instead of an `HttpError` subclass with headers; 409 uses `conflict`, `not_empty`, `question_in_use`; stale set is 409 `conflict`, disabled question is 400 `bad_request`, unknown set is 404; password-reset provider failure is 502. Fix (S): add `tooManyAttempts(retryAfter)` to `lib/http.ts`; document codes in the core contract.
- **A3 (nit): `/me` router is mounted twice** (`app.ts:48,52`: `me.routes` and `account.routes`). Works, but splits one resource across files; merge or mount `account` at `/me/account`-free path.
- **A4 (nit): Contract bounds missing:** `ActivateRequest.section_ids` has no `.max()` (plan has 50), `ActivateRequest.date`/reports shape-only date (M3), `ListStudentsQuery` has no limit/cursor.
- **A5 (nit): `TeacherQuestionDto` is built by two mappers** (`questions.ts:toDto`, `calendar.ts:toTeacherDto`) that already differ (`status ?? "published"`, `correct_option`, `submission_count`). Calendar day cards therefore omit `correct_option`/`edited_at`. Share one mapper in `lib/`.

### Performance
- **P1 (minor): `feed` loads the entire unseen pool for the activated sections ordered by `random()`** (`feed.ts:92-105`, again `:134-147` for MCQs) and then slices in JS; `notInArray` takes every question the student ever reviewed as bind parameters (limit 65,535 and a growing plan). Fine for 50 questions per section; at hundreds per section per day it is wasteful. Fix (M): `LIMIT` per section with a window function (`row_number() over (partition by section_id order by random())`) and `NOT EXISTS` against `review_states`/`submissions`.
- **P2 (minor): `/me` runs 6+ queries sequentially** (streak, totals, set, answered, due, srs) and is called from several screens; run independent ones with `Promise.all` (S).
- **P3 (nit): `GET /questions?created_on=` uses a non-sargable `(created_at AT TIME ZONE tz)::date = ...`** (`questions.ts:167`) whereas calendar uses range bounds (`localDayStart`). Use the range form (S).

### Test quality
- **T1 (major): fake-DB tests encode query order and cannot catch SQL or column errors.** `fakeDb` (`test-utils.ts`) returns queued results by call order, so `feed.test.ts` fails on any harmless reorder and passes when the SQL is wrong. Every bug above except the pure-JS ones (M2) is invisible to it: invalid dates, NUL bytes, missing columns, language totals. About 100 of the 165 default tests are in this style.
- **T2: gaps in the real-Postgres suite** (65 tests): no test for (a) a DB without the migration / startup check; (b) invalid calendar dates and NUL bytes on every route that takes text or dates; (c) a Kannada/`both` student's progress totals; (d) chapter delete with activated sections; (e) rate limiting with spoofed `X-Forwarded-For`; (f) body size; (g) timezone boundary (a submission at 23:50 and 00:10 IST around UTC midnight, streak across the boundary); (h) `reports/participation` beyond 1 test; (i) concurrency: activation vs. submission; (j) the `/students` last-active date.
- **T3 (minor): CI** (`ci.yml`) runs integration tests only against `api/test/schema.sql` (see D1), does not run the e2e browser suites, and does not run `verify` for more than one file. Add a schema-drift job (D1) and run `npx tsx --test` integration also on PRs that touch `core/` (already covered by workflow triggers).
- **T4 (nit): `npm test` silently skips the integration describe** with "TEST_DATABASE_URL is not set", so a developer sees "165 pass" and may think the DB paths were run. Print a loud notice or add `npm run test:db`.

### Maintainability
- **R1: duplicated helpers.** `pgCode` is defined twice (`lib/catalog-utils.ts:16`, `lib/question-revisions.ts:10`); the UUID regex three times (`students.ts:21`, `questions.ts:77`, `reports.ts:10`); body-parse+Zod-to-400 five times (`parse` in `questions.ts`, `readBody` in `submissions.ts`, inline in `activations.ts`, `me.ts`, `auth.ts`, `account.ts`, `students.ts`); `zodMessage` twice with different output; "learned" criteria written in SQL twice (`me.ts:48`, `reports.ts:164`) while `isLearned` in `core/src/srs.ts:93` is unused.
- **R2: dead code.** `languagesFor` (`lib/language.ts:11`, tested but unused in routes), `isLearned` (above), unused `sections` import in `routes/submissions.ts:4`, `assertCanEditQuestion`'s `_question` parameter (reserved for org scoping; fine, but undocumented in callers).
- **R3: naming drift** between `section` (code) and "topic" (UI/messages) in error strings (`"topic not found"` vs `"section_id not found"`); `sections.sort_order` is per chapter but `activationRange` orders sections of a day only by `sort_order`, so topics from different chapters interleave arbitrarily (`activations.ts:55`; add `chapters.ncertNo` first, S).
- **R4: `scripts/src/seed.ts`** overwrites teacher-edited chapter names and section order on every run (no lock like the question `edited_at` lock), is not transactional, and `row.id` crashes if `onConflictDoNothing` returned nothing (`seed.ts:73-76`). Run it inside one transaction and guard the `undefined` (S).

---

## C. Verified fine (no action)
Role guards on all routes; token-derived identity and `.strict()` request schemas (no mass assignment); Drizzle everywhere (no string SQL; `sql` templates are parameterised, `AT TIME ZONE ${tz}` is a bind parameter); LIKE escaping for `ilike`; keyset pagination uses microsecond text cursors and a row-value compare (11-row walk test passes); revision numbering is race-safe under `FOR UPDATE`; submission/streak/SRS upserts are idempotent under concurrent duplicates (10 parallel -> 1 row); invite code comparison is constant-time on hashed values; reset/change-password never echo provider text or log passwords; `Cache-Control: no-store` on password responses; timezone arithmetic is UTC-day-safe.

---

## D. Prioritised TOP 15 (for the coordinator)

| # | Fix | Severity | Effort | Safe immediately? |
|---|---|---|---|---|
| 1 | Startup schema check (exit 1 with a clear "run migration X" message) + real `/healthz` DB probe + Render health check (B1) | blocker | S | Yes |
| 2 | Verify and remove demo accounts / shared password from the production Supabase project; guard `create-users.ts` (B2) | blocker (if present) | S | Needs owner action |
| 3 | Fix rate-limit key (use the trusted last hop) and add a global invite-failure cap (M1) | major | S | Yes (confirm Render header behaviour) |
| 4 | Malformed/empty JSON -> 400 on `/activations` and `/submissions`; single shared `parseOr400` with field paths (M2, A1, R1) | major | S | Yes |
| 5 | Validate dates in `reports/*` (`ISO_DATE` refine in core) and reject NUL bytes in text (shared `safeText`); map SQLSTATE class 22 to 400 (M3) | major | S | Yes |
| 6 | Language-aware progress: one shared `dailyTarget`/`isCompleted` used by feed, submissions, reports (M4) | major | M | Yes |
| 7 | Add indexes: `submissions(question_id)`, `submissions(daily_set_id)`, `review_states(question_id)`; new migration + schema.ts (D2) | major | S | Yes |
| 8 | Chapter delete must refuse activated sections; make question/section FKs `RESTRICT` (M5) | major | S + M | Check is yes; FK change needs a migration decision |
| 9 | Body size limit and signup/attempt rate limiting; stop echoing Supabase messages from signup (M7) | major | S | Yes (enumeration trade-off is a product call) |
| 10 | pg Pool hardening: error listener, timeouts, statement_timeout, graceful shutdown (M8) | major | S | Yes |
| 11 | One schema source of truth: baseline migration, apply all migrations to the CI test DB, drift check vs Drizzle, include CHECKs/RLS (D1, D4, M6) | major | M | Yes (needs a `pg_dump` from the live DB) |
| 12 | Cache `getUser` (30 s) or verify JWT locally; cache profile (M9) | major | S/M | Cache: yes; JWKS: needs a decision on flag freshness |
| 13 | Fix count semantics (`enabled_question_count`, activation `question_count`) and `reports/participation` 400-on-no-activation (C2, C3) | minor | S | Needs a quick mobile check |
| 14 | Real-DB tests for each of the above (invalid dates, NUL, kn progress, chapter-delete, XFF spoof, no-migration boot, timezone boundary); retire queue-order fake-DB tests where a real-DB twin exists (T1, T2) | major | M | Yes |
| 15 | Dedupe helpers and dead code (`pgCode`, UUID regex, `zodMessage`, `languagesFor`, `isLearned`, `toDto` mappers), `activationRange` ordering by chapter (R1-R3, A5) | minor | S | Yes |

Product decisions needed: past/future activation window (C1), whether to restrict CORS and the origin list (S4), signup enumeration vs UX (M7), JWT freshness for `must_change_password` (M9), session revocation on reset (S2).
