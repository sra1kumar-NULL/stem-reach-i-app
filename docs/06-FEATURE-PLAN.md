# Feature Plan — Student Engagement Roadmap (multi-PR implementation plan)

> Implements the 18 features in `~/.opencode/plan/feature_improvements.md` (streak freeze, goal
> ring, XP+levels, push, badges, leagues, study modes, review-misses, offline, SRS stats, streak
> calendar, AI card gen, content library, live class mode, challenges, memes, avatars, analytics)
> as **18 feature-sized PRs across 4 milestones**, aligned with the doc's Sprint 1–4 roadmap.
>
> Status: **Plan for `/plan` review** · Author: Planning Engineer · Depends on: PR #1 (SRS +
> gluestack UI, in review) merging first — PR IDs below assume that baseline.

---

## 0. How to read this plan

**Standing rules applied to every PR** (from `AGENTS.md` / `docs/DEPLOY.md` / `docs/04-LLD.md`):

- **API is the only writer** to business tables. Every write path in this plan runs through
  `api/src/routes/*`, never from `mobile/`.
- **Zod at every boundary** — new request/response schemas live in `core/src/contracts.ts`;
  model/LLM output is re-validated with Zod before it touches the DB.
- **Authz from the verified token** — org scope (`orgId`) is resolved in
  `api/src/lib/auth.ts` from `profiles`, never accepted from a body/query (AGENTS #5).
- **All SQL through Drizzle**; DDL ships as a manual SQL block appended to `docs/DEPLOY.md`
  ("DB schema updates") following the `review_states` pattern: `CREATE … IF NOT EXISTS` +
  **`ALTER TABLE … ENABLE ROW LEVEL SECURITY`** (deny-by-default, no policies; API writes with
  `service_role`). LLD §1 requires RLS on **every** table — each PR's migration block must show it.
- **AGENTS #3 discipline**: any change to `core/src/contracts.ts` is breaking for installed
  builds. Every PR below declares `core contract change: yes/no`. All contract changes in this
  plan are **additive optional fields or new endpoints**, and the deploy order is always
  **DDL → API → app** (per `DEPLOY.md` "Deploy order — API before app"). Old installed builds
  keep working because the mobile client does no runtime response validation — extra fields are
  ignored, missing optional fields render defaults.
- **Repo gates every PR must show green** (real output, AGENTS #7):
  `npm run typecheck` · `npm test` · `npm run verify` · `npm --prefix mobile run lint`
  (`eslint --max-warnings 0`; mobile `tsc` is already inside root typecheck).
- **Testing strategy for this codebase**: pure logic (XP, streak-freeze, league math, offline
  queue state machine, goal/badge math) lives in `core/` and is tested with `node:test`
  mirroring `core/src/srs.test.ts`. `mobile/` has **no test runner** — therefore any client
  logic that matters is extracted into `core/` pure modules and imported via the existing
  `@stemreach/core` file dependency; mobile keeps only rendering code under gate.
- **Size**: S ≤ ~300 LOC · M ~300–800 · L ~800–1500+ (including tests and migration SQL).
- **Risk**: LOW / MED / HIGH (HIGH = touches hot path, security boundary, or an external system).

---

## 1. Sequencing rationale (binding: org milestone first)

**Why the org series (PR-01/02) blocks everything:**

1. `daily_sets` currently has `daily_sets_set_date_unique` — **one activation per date
   globally**. Multi-tenancy changes this to `(org_id, set_date)`. Every feature that reads or
   writes a daily set (submissions, feed, practice attempts, live mode, challenges) sits on top
   of that constraint.
2. Every table this plan *adds* (`xp_ledger`, `student_badges`, `device_push_tokens`,
   `leagues`, `practice_attempts`, `activity_days`, `live_sessions`, …) needs `org_id`. Adding
   gamification tables before org means re-migrating all of them later — a second full DDL +
   RLS + backfill cycle over tables that already hold production rows. Org first = one
   migration for the foundation, every later PR just adds `org_id not null` **in its own
   CREATE TABLE**.
3. Class-dependent features (**leagues PR-07, class challenges PR-16, live class mode
   PR-15**) pool or scope by org/class and cannot exist without token-derived org scope.

**Why non-class P0 features slot right after the org series (not before):** streak freeze, goal
ring, XP, badges, push are all student-global and *could* technically land pre-org — but each
one adds a table (freeze bookkeeping, `xp_ledger`, `student_badges`, `device_push_tokens`) that
would immediately need an org backfill. Deferring them by the two-PR org window costs nothing
(Sprint 1 has room) and avoids double migrations. Push (PR-06) and the analytics/event
instrumentation are the two tracks that run **in parallel** with the XP/streak/badge chain
because they touch disjoint files.

**Serialization hot spots** (same files, must land in order):
`api/src/routes/submissions.ts` transaction → **PR-03 → PR-04 → PR-05**; student feed header
(`mobile/src/app/(student)/index.tsx`) → PR-03 (ring) → PR-04 (freeze chip) → PR-07 (league
entry) → PR-16 (challenge banner).

---

## 2. PR index

| ID | Title | Milestone (sprint) | Size | Risk | Depends on |
|---|---|---|---|---|---|
| **PR-01** | Organizations foundation — schema + token-derived org scope | M1 (pre-Sprint 1) | L | HIGH | PR #1 baseline |
| **PR-02** | Org scoping across all routes + app surfaces | M1 (Sprint 1) | L | HIGH | PR-01 |
| **PR-03** | XP engine, levels & daily goal ring | M1 (Sprint 1) | M–L | MED | PR-02 |
| **PR-04** | Streak freeze | M1 (Sprint 1) | M | MED | PR-02 |
| **PR-05** | Achievement badges (first 10) + student profile screen | M1 (Sprint 1) | M | LOW | PR-03, PR-04 |
| **PR-06** | Push notifications (Expo Push, mascot reminders) | M1 (Sprint 1) | M | MED–HIGH | PR-02 (∥ PR-03/04/05) |
| **PR-07** | Weekly leagues | M2 (Sprint 2) | L | HIGH | PR-02, PR-03 |
| **PR-08** | Review-misses + Review mode (practice-attempts foundation) | M2 (Sprint 2) | M–L | MED | PR-02, PR-03 |
| **PR-09** | Match game | M2 (Sprint 2) | S–M | LOW | PR-03, PR-08 |
| **PR-10** | Streak calendar heatmap | M2 (Sprint 2) | S | LOW | PR-04 |
| **PR-11** | Offline mode (feed cache + submission queue) | M3 (Sprint 3) | L | HIGH | baseline (any) |
| **PR-12** | Card-level SRS stats | M3 (Sprint 3) | S–M | LOW | PR #1 baseline |
| **PR-13** | Content library & self-study sessions (packs + Practice Test) | M3 (Sprint 3) | M–L | MED | PR-08, PR-02 |
| **PR-14** | AI card generation (pluggable LLM provider) | M3 (Sprint 3) | L | HIGH | PR-02 |
| **PR-15** | Live class mode (Supabase Realtime, read-only) | M4 (Sprint 4) | L | HIGH | PR-02, PR-03 |
| **PR-16** | Class challenges | M4 (Sprint 4) | M | MED | PR-02, PR-03, PR-05 |
| **PR-17** | Student-facing progress analytics | M4 (Sprint 4) | M | LOW | PR-10, PR-12 |
| **PR-18** | Meme reactions + avatar picker | M4 (Sprint 4) | S–M | LOW | PR-05, PR-02 |

Coverage check: all 18 doc features map to ≥1 PR (study modes = PR-08 Review + PR-09 Match +
PR-13 Practice Test; review-misses = PR-08; avatars/memes share PR-18 as "engagement
cosmetics" — split into two PRs if a reviewer objects, the only bundled pair in the plan).
Content library and avatars were not scheduled in the doc's §5 sprints; placed in Sprint 3 and
Sprint 4 respectively by theme.

## 3. Cross-cutting foundations (introduced early, reused by every later PR)

| Artifact | Introduced | Reused by | Why here |
|---|---|---|---|
| `app_events` table + `POST /api/events` (batch ingest, student from token) + `scripts/src/metrics.ts` (`npm run metrics`) | **PR-01** | 06, 07, 08, 09, 11, 13, 15, 16 | Batched into the org migration so we don't ship a second manual-DDL cycle; gives a §6 **baseline before P0 ships** |
| `student_settings` table (`student_id` PK, `daily_goal`) | **PR-03** | PR-06 (push prefs columns), PR-18 (avatar columns) | One table, small `ALTER ADD COLUMN`s per feature — cheap, documented in each DEPLOY block |
| `practice_attempts` table + `POST /api/practice/attempts` | **PR-08** | PR-09 (match), PR-13 (packs/practice test) | Re-attempts are impossible on `submissions` (unique student+question+set returns the stored grade); attempts live **off the hot path** |
| `activity_days` table (`student_id`, `day`, `active bool`, `protected bool`) | **PR-04** (written in the streak transaction) | PR-10 (calendar), PR-17 (analytics) | Streak domain owns day history; freeze-protected days are only knowable at write time, so the table must exist before the UI |
| **Free-tier cron pattern**: GitHub Actions `schedule:` → authenticated `POST /api/internal/*` (service secret, stored in GitHub/Render env — never the repo) → work happens inside the API | **PR-06** | PR-06 (digest), PR-07 (league rollover) | Render free tier has no cron and sleeps; Supabase `pg_cron` is rejected because it would write business tables outside the API (AGENTS #1). The API stays the only writer; the cron only *triggers* it |

---

## 4. Milestone 1 — Foundation + Retention (Sprint 1)

### PR-01 — Organizations foundation: schema + token-derived org scope
**Milestone** M1 · **Size** L (900–1400 LOC) · **Risk** HIGH (data migration on every table)

**Scope**
- `core/src/db/schema.ts`: new `organizations` table; `org_id uuid not null references
  organizations(id)` added to **every** business table — `profiles`, `chapters`, `sections`,
  `questions`, `daily_sets`, `daily_set_sections`, `submissions`, `streaks`, `review_states`.
  Replace `daily_sets_set_date_unique` with `daily_sets_org_date_unique (org_id, set_date)`.
- `core/src/contracts.ts`: `MeResponse.profile` gains optional `org: {id, name}` (additive).
- `api/src/lib/auth.ts`: after profile load, attach `orgId` (and org row) to `AuthUser`
  context — **derived from the token → profile, never from the request** (AGENTS #5).
- `scripts/src/create-users.ts` + `scripts/src/seed.ts`: create/assign a default org;
  content JSON (`core/src/content.ts`) unchanged (content stays org-scoped rows, not per-org
  JSON yet).
- **Metrics foundation**: `app_events (id, org_id, student_id, event, payload jsonb,
  client_occurred_at timestamptz null, received_at timestamptz default now())` +
  `POST /api/events` (Zod batch ≤50, student derived from token) +
  `scripts/src/metrics.ts` reporting §6 baseline (DAU, D1/D7 retention, questions/day,
  median streak). Pruning >180-day events noted in the script.
- `docs/ARCHITECTURE.md` "Current status → Next: multi-tenant organizations" flipped to
  landed; ADR-0002 (org scope from token) filed — *docs land with the PR; this plan is the
  only file written now*.

**Depends on** PR #1 baseline. **Unblocks** every later PR (all new tables carry `org_id`);
unblocks class features PR-07/15/16.

**Contract/DB changes**
- `core contract change: yes` (additive optional `org` in `MeResponse` → non-breaking under
  server-first deploy).
- DDL (manual SQL block in `docs/DEPLOY.md`): create `organizations`, insert one default org,
  `ALTER TABLE … ADD COLUMN org_id uuid NOT NULL REFERENCES organizations(id) DEFAULT
  '<const-default-uuid>'` (constant default = metadata-only add, no table rewrite on Postgres),
  drop/recreate the `daily_sets` unique index, backfill `app_events`, then
  `ENABLE ROW LEVEL SECURITY` on `organizations` + `app_events` and re-audit every existing
  table (DEPLOY.md "RLS audit" note).
- **Deploy-order hazard (call out in the PR):** the old unique index means *old API + migrated
  DB + second org* would cross-leak feeds (`WHERE set_date = today LIMIT 1`). Mitigation:
  run DDL and the new API deploy back-to-back, and do not create a second organization until
  the old API revision is fully rolled out. Single-org state during the window is safe (the
  constant default keeps old inserts valid).

**Tests**
- Route-level: `GET /api/me` returns org; cross-org negative tests deferred to PR-02 but a
  smoke test that two orgs can create `daily_sets` for the same date goes here.
- `npm run metrics` runs against a seeded local DB and prints the baseline block.
- Gates: typecheck · test · verify · mobile lint (real output in PR description).

**Acceptance criteria**
- After migration, every business table has `org_id` with RLS enabled and no policies.
- `POST /api/activations` twice for the same date in two orgs succeeds without unique violation.
- No request body/query containing `org_id` is ever read; authz tests prove scope comes from the profile row.
- `npm run metrics` prints DAU/retention/streak baseline from `app_events` + existing tables.

---

### PR-02 — Org scoping across all routes + app surfaces
**Milestone** M1 (Sprint 1) · **Size** L (700–1200 LOC) · **Risk** HIGH (security boundary)

**Scope**
- `api/src/routes/feed.ts`, `submissions.ts`, `me.ts`, `syllabus.ts`, `activations.ts`,
  `reports.ts`: add `and(eq(table.orgId, c.var.user.orgId))` to every query. Specifics:
  - feed/activations: `daily_sets` filtered by `(set_date, org_id)`;
  - syllabus: org's chapters/sections/question counts;
  - reports/participation: students filtered by `profiles.orgId` (currently class-section only);
  - submissions: set membership validated **within the caller's org** before grading.
- `core/src/contracts.ts`: optional `org` surfacing in `ActivationResponse`/`MeResponse` (if not
  already added in PR-01).
- `mobile/`: teacher dashboard header shows org name (`(teacher)/index.tsx`); student side is
  visually unchanged — org is invisible to students (white-label). `mobile/src/api/client.ts`
  untouched (never sends org).
- `docs/04-LLD.md` endpoint table gains the org-scoping note.

**Depends on** PR-01. **Unblocks** PR-07, PR-13, PR-15, PR-16 (anything org/class-scoped).

**Contract/DB changes**
- `core contract change: minimal` (only if PR-01 deferred a field — otherwise none).
- **No DDL** (columns exist from PR-01). Pure query-layer change.
- **Not breaking for installed builds**: request shapes unchanged; responses gain at most
  optional fields.

**Tests**
- **Cross-tenant isolation suite** (this PR's core deliverable, Security Reviewer engaged):
  student/teacher of org A requesting org B's set/report/syllabus → 404/403, never data.
  Route-level tests for all six route files.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Every query in `api/src/routes/*` filters on `org_id`; grep-able audit (a test or a lint
  checklist in the PR) proves none was missed.
- Participation/performance reports for org A count only org A students even within the same `class_section`.
- Existing single-org flows (activate → feed → submit → report) behave identically on a seeded DB.

---

### PR-03 — XP engine, levels & daily goal ring
**Milestone** M1 (Sprint 1) · **Size** M–L (500–900 LOC) · **Risk** MED (submission hot path)

**Scope**
- `core/src/xp.ts` + `core/src/xp.test.ts`: pure functions —
  `xpForSubmission({qtype, correct, streakDays, mode})` and `levelForXp(total)` (level curve =
  quadratic-ish thresholds, table-driven). **Update `core/package.json` test script to
  `node --experimental-strip-types --test src/*.test.ts`** (first PR after `srs.test.ts` to do
  so; later test files just drop in).
- `core/src/db/schema.ts`: `xp_ledger (id, org_id, student_id, source text
  ['submission'|'practice'|'match'|'live'|'challenge'|'bonus'], question_id null, points int,
  created_at)` + index `(student_id, created_at)`; `student_settings (student_id PK, org_id,
  daily_goal int not null default 10)`.
- `core/src/contracts.ts`: `SubmissionResponse` += optional `xp_awarded: number`,
  `level: {number, xp, next_at}`; `FeedResponse` += optional
  `goal: {answered, target, completed}` (target = `min(progress.total, daily_goal)` — always
  achievable); `MeResponse` += optional `xp` + `goal` blocks. All additive.
- `api/src/routes/submissions.ts`: inside the **existing** new-submission transaction, insert
  one `xp_ledger` row and update a `student_xp` total (or aggregate from ledger — decide once:
  total column on `student_settings` maintained in-tx, ledger is the audit trail). Streak bonus
  reads the streak value already computed by `touchStreak`. Replay/idempotent path awards
  nothing (single INSERT on the existing `existing` branch — no double XP).
- `mobile/`: feed header (`(student)/index.tsx`) — progress bar morphs into the **daily goal
  ring** + XP/level chip; `summary.tsx` — "XP earned this session" row + level-up celebration
  (reuse `components/confetti.tsx`); goal completion toast (reuse `components/toast.tsx`).

**Depends on** PR-02 (ledger carries `org_id`). **Unblocks** PR-05 (level badges), PR-07
(weekly XP is league fuel), PR-16 (xp_target challenges), PR-09 (match XP).

**Contract/DB changes**
- `core contract change: yes` — additive optional fields ⇒ **deploy DDL → API before any app
  build**; old installed builds ignore the new fields (they render ring/chip only after the
  app update, which is fine).
- DDL block: 3 tables/indexes + `ENABLE ROW LEVEL SECURITY` (no policies) on `xp_ledger` and
  `student_settings`.

**Tests**
- `core/src/xp.test.ts`: correct/incorrect/streak-bonus values, level thresholds, cap behaviour
  (mirror `srs.test.ts` style: property assertions like "XP never negative", "level monotonic").
- Route-level: new submission awards exactly one ledger row; **idempotent replay awards zero**;
  flashcard `again` still awards attempt XP (participation) but no correctness bonus — *see
  open question #3 for the final balance table*.
- Feed response contains `goal` with `target ≥ 1` when the set is non-empty.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Answering N questions yields exactly the XP the pure function predicts (route test uses the
  same function as oracle); replaying a submission changes no ledger total.
- Goal ring on the feed header reaches 100% exactly at `min(total, daily_goal)` answers.
- Level-up celebration fires exactly once per threshold crossing.

---

### PR-04 — Streak freeze
**Milestone** M1 (Sprint 1) · **Size** M (350–700 LOC) · **Risk** MED (streak hot path + edge cases)

**Scope**
- `core/src/streaks.ts` + `streaks.test.ts`: pure decision table
  `nextStreak({lastActiveDate, current, freezesAvailable, today})` —
  same day → hold; yesterday → +1; **2-day gap with `freezesAvailable > 0` → +1 and consume
  one freeze**; larger gap or no freeze → reset to 1. Weekly grant rule (default: +1 freeze
  when the previous Mon–Sun week had ≥5 active days, capped at 2 — *open question #4*) computed
  **lazily inside the same write** (no cron needed).
- `core/src/db/schema.ts`: `streaks` += `freezes_available smallint not null default 0`,
  `last_freeze_used_date date`, `grant_week_start date`; new `activity_days` table (see §3).
- `core/src/contracts.ts`: `StreakDto` += optional `freezes_available` and
  `protected_today: boolean` (additive).
- `api/src/routes/submissions.ts` (`touchStreak`): extend the existing single UPSERT CASE to
  implement the decision table atomically (keeps the no-race property documented in the
  code), consume a freeze on the 2-day-gap branch, insert `activity_days` row
  (`active=true`, or `active=false, protected=true` on freeze use) in the same transaction.
  Cross-reference comment to `core/src/streaks.ts` (same pattern as `SRS_GRADE_BY_SELF_EVAL`).
- `scripts/src/metrics` / migration SQL: backfill `activity_days` history from distinct
  `submissions.answered_at` dates (freeze history is unknowable pre-migration; forward-only —
  documented).
- `mobile/`: freeze chip (🧊 ×N) beside the flame in the feed header; "streak protected today"
  line on `summary.tsx`; short explainer sheet.

**Depends on** PR-02. **Unblocks** PR-10 (calendar reads `activity_days`), PR-05 (7-day-streak
badge uses frozen-aware streak).

**Contract/DB changes**
- `core contract change: yes` (additive) → server-first deploy.
- DDL: `ALTER TABLE streaks ADD COLUMN …` + `CREATE TABLE activity_days …` + RLS enabled on
  `activity_days`.

**Tests**
- `core/src/streaks.test.ts` (decision table): gap 0/1/2 with and without freeze, freeze
  exhaustion, first-ever activity, week-boundary grant, cap enforcement, `best >= current`
  invariant.
- Route-level: submission after a manufactured 2-day gap consumes exactly one freeze and keeps
  the streak; a gap > 2 days resets even with freezes available (default policy — *open
  question #4*); `protected_today` true only on the day a freeze was consumed.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- `streaks` UPSERT remains a single statement (no select-then-write race) with freeze logic.
- `activity_days` gains a row for every day a student submits (or is protected).
- Unit tests cover all decision-table branches; route test proves freeze consumption is
  idempotent under double-tapped submissions.

---

### PR-05 — Achievement badges (first 10) + student profile screen
**Milestone** M1 (Sprint 1) · **Size** M (400–800 LOC) · **Risk** LOW

**Scope**
- `core/src/badges.ts` + `badges.test.ts`: static catalog (code-as-config — versioned with the
  app, no `badges` table) of 10: 7-day streak · 30-day streak · 100 questions · 500 questions ·
  first perfect session · first review-misses session · level 5 · level 10 · SRS: 25 mature
  cards · full week goal completion. Pure `evaluateBadges(stats, owned) → newlyUnlocked[]`.
- `core/src/db/schema.ts`: `student_badges (org_id, student_id, badge_key text,
  unlocked_at, PK(student_id, badge_key))`.
- `core/src/contracts.ts`: `MeResponse` += optional `badges: {key, unlocked_at}[]`;
  `SubmissionResponse` += optional `badges_unlocked: string[]` (celebration hook).
- `api/src/routes/submissions.ts`: after the write transaction, run `evaluateBadges` from
  facts already in hand (streak, session correctness, counts) — only on **new** submissions;
  insert unlocks with `onConflictDoNothing` (idempotent). Badge inputs needing totals reuse
  the `progressFor` query results; no extra query on the replay path.
- `mobile/`: **new** `mobile/src/app/(student)/profile.tsx` + nav entry in
  `(student)/_layout.tsx` — profile = streak + XP + badges gallery (locked/unlocked states).
  Unlock toast on `SubmissionResponse.badges_unlocked`.

**Depends on** PR-03 (level badges), PR-04 (streak facts + profile surface order).
**Unblocks** PR-07/PR-10/PR-12/PR-17 (all mount sections on the profile screen), PR-16
(badges as challenge reward).

**Contract/DB changes**
- `core contract change: yes` (additive) → server-first.
- DDL: `student_badges` + RLS enabled.

**Tests**
- `core/src/badges.test.ts`: catalog integrity (unique keys, 10 entries), each badge unlocks
  only when its predicate holds, no duplicate unlocks.
- Route-level: replaying a submission never re-inserts a badge; two badges unlocking in one
  submission both returned.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Exactly 10 badges listed in the profile gallery; unlocking one updates `MeResponse.badges`
  and shows the toast once.
- Badge evaluation adds no query to the idempotent-replay path.

---

### PR-06 — Push notifications (Expo Push + mascot reminders)
**Milestone** M1 (Sprint 1) · **Size** M (500–900 LOC) · **Risk** MED–HIGH (external service + ops)

**Scope**
- `core/src/db/schema.ts`: `device_push_tokens (id, org_id, student_id, expo_push_token,
  platform text ['android','ios','web'], enabled bool default true, last_seen_at,
  unique(student_id, expo_push_token))`.
- `core/src/contracts.ts`: `POST /api/devices` / `DELETE /api/devices` request schemas.
- `api/src/routes/devices.ts` (new, mounted in `api/src/app.ts`): register/unregister —
  `student_id` from token (AGENTS #5).
- `api/src/notifications/` (new lib): recipient selection + quiet-hours/prefs window math
  (pure, unit-tested), message copy (mascot templates), Expo Push API client
  (`https://exp.host/--/api/v2/push/send`, chunks of 100, handle `DeviceNotRegistered` →
  disable token).
- `api/src/routes/internal.ts` (new, guarded by `x-internal-secret` env var — value in
  Render/GitHub secrets only): `POST /api/notifications/daily-digest` — recipients = students
  in orgs with an activated set who haven't submitted today, respecting per-student prefs and
  quiet hours; a second run +1h targets still-inactive students (escalating nudge). Logs
  `push_sent` events.
- `student_settings` += `push_enabled bool default true`, `quiet_start time`,
  `quiet_end time`, `reminder_hour smallint default 19` (DDL in this PR).
- `.github/workflows/notify.yml`: `schedule:` cron (e.g. 19:05 Asia/Kolkata — *open question
  #7*) + `workflow_dispatch`, calls the internal endpoint with repo secrets. Same pattern is
  what PR-07 reuses for league rollover.
- `mobile/`: `expo-notifications` permission prompt post-onboarding, token registration on
  auth + refresh on foreground (`state/auth.tsx` / `app/_layout.tsx`), notification prefs
  toggles on profile, deep link `/` (feed) on tap.
- **Note:** PWA/web builds cannot receive Expo push — platform recorded as `web` and skipped
  by the dispatcher (open question #8).

**Depends on** PR-02 (org on tokens). **Parallel with PR-03/04/05** (disjoint files).
**Unblocks** retention measurement (push CTR), and the cron pattern reused by PR-07.

**Contract/DB changes**
- `core contract change: yes` (new request schemas + optional `MeResponse` push fields) →
  server-first. Old builds simply never call `/api/devices`.
- DDL: `device_push_tokens` + `student_settings` ALTER + RLS enabled.
- New env: `NOTIFICATIONS_INTERNAL_SECRET`, `EXPO_ACCESS_TOKEN` (optional — Expo push works
  unauthenticated at low volume; flag as open question #8's deployment note).

**Tests**
- Unit: recipient selection (already-active excluded, org-scoped), quiet-hours window across
  midnight, escalation set membership.
- Route: `/api/devices` rejects body-supplied `student_id`; `/api/notifications/*` rejects
  missing/wrong secret.
- Manual (documented in PR): one real Expo push to a dev build via `expo push:android --to`.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Registering a token on device A produces exactly one row for that student; a second device
  adds a second row; unregistering disables delivery.
- Dry-run of the digest endpoint prints the exact recipient list for a seeded day without
  sending when `?dry_run=1`.
- Quiet hours and per-student opt-out are honoured in unit tests.
- GitHub Actions cron fires and the API returns 200 (first production run verified manually).

---

## 5. Milestone 2 — Social & variety (Sprint 2)

### PR-07 — Weekly leagues
**Milestone** M2 (Sprint 2) · **Size** L (800–1300 LOC) · **Risk** HIGH (weekly job + ranking math)

**Scope**
- `core/src/league.ts` + `league.test.ts`: pure math — partition an org's (section-first) cohort
  into pools of N (default 20), rank by weekly XP from `xp_ledger`, top-3 promote / bottom-3
  demote (ties: higher rank → XP → earlier achievement; *open question #5*), pool smaller than
  min (5) → hold tier, new students → bottom pool of the lowest tier, week boundaries in
  Asia/Kolkata (*open question #6*).
- `core/src/db/schema.ts`: `leagues (id, org_id, class_section, week_start date, tier
  smallint, pool_no smallint, UNIQUE(org_id, class_section, week_start, tier, pool_no))`,
  `league_members (league_id, student_id, weekly_xp, rank, result text ['promoted'|'hold'|'demoted'], PK(league_id, student_id))`.
- `core/src/contracts.ts`: `LeagueResponse` (my pool, ladder rows, countdown to rollover,
  my rank/xp) — new endpoint, additive.
- `api/src/routes/leagues.ts`: `GET /api/leagues/current` (self-scoped);
  `POST /api/internal/leagues/rollover` (internal secret, reuses PR-06 cron pattern, GitHub
  Actions Monday ~00:15 IST): compute last week's ranks, materialize next week's pools.
- `mobile/`: league ladder screen (promotion/demotion zones + countdown; Duolingo-style list),
  entry point on profile (`profile.tsx` from PR-05) and a small league chip on the feed header
  (serialize behind PR-03/04 header edits).

**Depends on** PR-02 (pools per org/class), PR-03 (`xp_ledger` is the ranking source).
**Unblocks** PR-16 (challenge reward can reference league tier), doc feature #6 complete.

**Contract/DB changes**
- `core contract change: yes` (new response type; optional `MeResponse.league`) → server-first.
- DDL: 2 tables + RLS enabled. Rollout: first rollover cron run happens *after* one full week
  of XP data exists — bootstrap: PR-06-style manual `workflow_dispatch` seeds week 1 pools on
  merge day.

**Tests**
- `core/src/league.test.ts`: partition determinism, promote/demote zones, tie-breaks, small
  pool edge (45 students → 20/20/5), pool < min size, single student, all-zero-XP week,
  week-boundary arithmetic across month/year end.
- Route: `GET /api/leagues/current` 404-before-first-rollover behaviour; rollover endpoint
  rejects missing secret; org isolation (org A's ladder never lists org B students).
- Rollover idempotency: running twice for the same `week_start` is a no-op (unique index).
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- After a seeded week of XP, a manual rollover produces pools with correct ranks and
  promotion/demotion flags; a second run changes nothing.
- The ladder screen shows countdown, my rank, and zone shading; students with equal XP tie-break
  deterministically (same order on repeat reads).
- No endpoint accepts a class/org/section scope from the client.

---

### PR-08 — Review-misses & Review mode (practice-attempts foundation)
**Milestone** M2 (Sprint 2) · **Size** M–L (600–1000 LOC) · **Risk** MED (new write path off hot path)

**Scope**
- Why a new table: `submissions` is unique on `(student, question, set)` and **idempotently
  returns the stored grade** — a missed question can never be re-attempted there, and polluting
  `submissions` with re-tries would corrupt reports/accuracy. Re-attempts live off the hot path.
- `core/src/db/schema.ts`: `practice_attempts (id, org_id, student_id, question_id, mode text
  ['review_misses'|'review'|'practice_test'|'match'|'pack'], selected_option, self_eval,
  is_correct, attempted_at)` + index `(student_id, mode, attempted_at)`.
- `core/src/contracts.ts`: `PracticeQueueRequest`/`PracticeAttemptRequest` (Zod, mirrors
  `SubmissionRequest` semantics) + `PracticeQueueResponse` (questions + latest wrong answer
  snapshot) + `PracticeAttemptResponse` (grade + explanation) — new endpoints, additive.
- `api/src/routes/practice.ts` (new):
  - `GET /api/practice/queue?mode=review_misses` — questions with a latest wrong submission in
    this org's sets (join `submissions` `is_correct = false`, dedupe to most recent attempt),
    capped (~20) and section-scoped to what exists;
  - `POST /api/practice/attempts` — server grades (correct_option from `questions`), writes
    `practice_attempts`, awards XP through the PR-03 engine (`source='practice'`, daily cap
    applies), advances SRS for flashcards by **extracting `touchReviewState`/grading into
    `api/src/lib/scoring.ts`** shared with `submissions.ts` (small refactor, no behaviour
    change), touches the streak (participation per HLD §4) — all in one transaction.
- `mobile/`: **new** `mobile/src/app/(student)/review.tsx` (missed-questions queue: card
  carousel reusing `components/question-card.tsx`, results at end); post-session "Missed N
  today — practice them" strip on `summary.tsx`; mode-picker entry (Today's Revision /
  Review Mistakes) on the feed empty/complete states.

**Depends on** PR-02, PR-03 (XP engine + shared scoring). **Unblocks** PR-09 (match XP via
practice path), PR-13 (pack queue reuses queue/attempt endpoints with `mode='pack'`).

**Contract/DB changes**
- `core contract change: yes` (new endpoints only — no existing shape touched) → server-first
  harmless (old builds never call them).
- DDL: `practice_attempts` + RLS enabled.

**Tests**
- Route: MCQ mis-answer → queue returns it → re-attempt writes a row and returns the grade;
  correct-answer questions never enter the review queue; queue org-scoped; flashcard practice
  attempt advances `review_states` (oracle: `applyGrade` from `core/src/srs.ts`); XP capped;
  streak touched.
- Refactor safety: existing `submissions` route tests still pass unchanged after the
  `scoring.ts` extraction.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- A question answered wrong in the daily set appears in "Review Mistakes" and can be answered
  repeatedly; none of those attempts change teacher accuracy reports (they read `submissions`).
- Re-attempting never writes to `submissions` or double-counts feed progress.
- `summary.tsx` lists today's missed questions with explanations after a session.

---

### PR-09 — Match game
**Milestone** M2 (Sprint 2) · **Size** S–M (250–500 LOC) · **Risk** LOW

**Scope**
- `core/src/match.ts` + `match.test.ts`: pair-builder (8–12 term/definition pairs from a
  question list: flashcard prompt→answer, MCQ text→correct option text; fall back gracefully
  when <4 pairs available) and XP cap math for match rewards.
- `api/src/routes/practice.ts` (extend): `POST /api/practice/match` — body `{correct, total,
  duration_ms}` (Zod; server **caps** XP by a daily `app_events`-derived count, re-uses xp
  engine `source='match'`), logs `mode_opened`/`match_finished` events. Client-reported scores
  are never trusted for anything beyond capped cosmetic XP.
- `mobile/`: **new** `mobile/src/app/(student)/match.tsx` — tap-to-pair grid, timer, match
  streak, completion screen (reuse confetti/toast); entry from the mode picker built in PR-08.

**Depends on** PR-03 (XP), PR-08 (mode picker + practice route file).
**Unblocks** doc feature #7 (study modes complete with PR-08 Review + PR-13 Practice Test).

**Contract/DB changes**
- `core contract change: yes` (new request schema + endpoint) → server-first not required for
  old builds, but keep the standard order anyway. **No DDL** (events + ledger exist).

**Tests**
- `core/src/match.test.ts`: pair extraction (no answer leakage — the *term* side must never
  contain the definition), small-deck handling, XP cap boundaries.
- Route: daily match XP cap enforced across repeated games; org scoping.
- Gates: typecheck · test · verify · mobile lint (mobile tsc/lint is the main risk surface).

**Acceptance criteria**
- A student can finish a match game from today's feed content in under 60 s; score persists in
  `app_events`; XP awarded once per game up to the cap.
- Game never renders the answer on the question side of a pair (unit-tested pair builder).

---

### PR-10 — Streak calendar heatmap
**Milestone** M2 (Sprint 2) · **Size** S (200–450 LOC) · **Risk** LOW

**Scope**
- `core/src/calendar.ts` + `calendar.test.ts`: month grid math (leading blanks, month/year
  rollover, IST month boundaries — *open question #6*).
- `api/src/routes/me.ts` (or new `api/src/routes/activity.ts`): `GET /api/me/activity?month=
  YYYY-MM` → `{days: [{day, active, protected}]}` read from `activity_days` (PR-04), org +
  student scoped from token.
- `core/src/contracts.ts`: `ActivityResponse` — new, additive.
- `mobile/`: heatmap section on `(student)/profile.tsx` (GitHub-style grid, `react-native-svg`
  already available), legend for active vs freeze-protected days.

**Depends on** PR-04 (`activity_days`), PR-05 (profile screen to mount on).
**Unblocks** PR-17 (analytics reuses the same activity feed).

**Contract/DB changes**
- `core contract change: yes` (new response) → server-first. **No DDL** (table from PR-04;
  note in PR that backfill from PR-04 covers history).

**Tests**
- `core/src/calendar.test.ts`: 28/29/30/31-day months, year boundary, timezone-stable.
- Route: only caller's own days returned; month param validated (Zod/regex like `DATE_RE`).
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Profile shows the current month with every day the student submitted filled, freeze-protected
  days distinctly filled, and no future day filled.
- Switching months never throws for any month in 2024–2030 (unit-tested range).

---

## 6. Milestone 3 — Content & access (Sprint 3)

### PR-11 — Offline mode
**Milestone** M3 (Sprint 3) · **Size** L (700–1200 LOC) · **Risk** HIGH (sync correctness)

**Scope** — design summary first (binding architecture note, see §9.2):
- `core/src/offline.ts` + `offline.test.ts`: **pure queue state machine** —
  `enqueue(queue, submission)`, `reconcile(queue, serverResponses | failures)`, ordering
  rules, dedupe by `(question_id, daily_set_id)`, drop-on-`question-not-in-set` rule,
  max-queue guard (matches feed `MAX_QUEUE`), conflict policy (**server-authoritative:
  answers are immutable once graded; never re-send a synced item**). Lives in `core/` because
  `mobile/` has no test runner.
- `mobile/src/offline/queue.ts`: AsyncStorage-persisted wrapper around the pure machine;
  replay on `AppState` foreground + connectivity regain (expo-network / NetInfo listener —
  add `expo-network` dependency), sequential replay through the **existing**
  `submitAnswer` in `mobile/src/api/client.ts` (API stays the only writer — no direct DB, no
  new write channel).
- `mobile/src/app/(student)/index.tsx`: serve the last cached `FeedResponse` when the fetch
  fails (AsyncStorage snapshot), show an "Offline — answers will sync" banner; sync-status row
  on `summary.tsx` + queued-count badge on the header; failure banner when items are dropped
  ("N answers couldn't sync — the day's set changed").
- `api/`: **no contract change required** (replay is ordinary `POST /api/submissions`;
  idempotency already guarantees dedupe). Add two `app_events` emissions in the replay path:
  `offline_queued` / `offline_synced` (client-originated via `POST /api/events`, plus server
  counter on submissions receiving a `X-Offline-Replay` hint header? — **decision: keep it
  simple, count via `app_events` only**).

**Depends on** baseline only (can run in parallel with M2 — no shared files beyond the feed
screen; serialize behind PR-03's header edit if they collide).
**Unblocks** doc feature #9; makes PR-08 practice mode resilient too (queue covers practice
attempts in a follow-up if needed — v1 covers daily submissions only).

**Contract/DB changes**
- `core contract change: no` (queue logic in `core/src/offline.ts` is new code, not a contract
  shape). Still deploy API first out of habit — nothing breaks either way.
- **No DDL.**

**Tests**
- `core/src/offline.test.ts`: enqueue→sync happy path; duplicate suppression; ordering (answer
  order preserved); drop rule on server 400/404; queue survives "app restart" (serialize →
  deserialize round-trip); queue overflow guard.
- Route-level (API): replaying 3 queued submissions in sequence yields the same DB rows as
  live answering and awards no duplicate XP (ties to PR-03 idempotency tests).
- Manual acceptance: airplane-mode session on a device/emulator, then reconnect.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- A full session answered offline syncs on reconnect with **zero duplicate rows** in
  `submissions` and correct `progress` reconciliation shown in the UI.
- A queued answer whose question left the set is dropped with a user-visible notice; the queue
  never blocks subsequent syncs.
- Killing the app mid-queue and relaunching preserves pending items (AsyncStorage round-trip
  test).

---

### PR-12 — Card-level SRS stats
**Milestone** M3 (Sprint 3) · **Size** S–M (250–500 LOC) · **Risk** LOW

**Scope**
- `core/src/contracts.ts`: `SrsStatsDto` += optional `learning: int` (repetitions < 2),
  `mature: int` (interval_days ≥ 21), `due_later: int`, and optional
  `by_section: [{section_id, due_today, learning, mature}]` — **additive optional fields**
  (MeResponse and PerformanceReport both embed this DTO; old builds ignore them).
- `api/src/routes/me.ts`: extend the existing `srs` aggregate query with the new buckets;
  add per-section bucketing (reuse the section join already present in `reports.ts`
  `srsStats`). Keep `due_today` semantics (mirrors feed) unchanged.
- `mobile/`: SRS breakdown card on `(student)/profile.tsx` (and summary nudge) — stacked bar
  (Due today / Learning / Mature) using `components/ui/progress` + `react-native-svg`.

**Depends on** PR #1 baseline (`review_states`), PR-05 (profile mount point).
**Unblocks** PR-17 (analytics embeds the same buckets), doc feature #10.

**Contract/DB changes**
- `core contract change: yes` (additive optional) → **server-first deploy mandatory** (old API
  + new app would omit fields — client must render `undefined` as "hide section", tested).
- **No DDL.**

**Tests**
- Unit: bucket classification boundaries (repetitions 1 vs 2; interval 20 vs 21).
- Route: counts on a seeded student match an SQL oracle; `due_today` unchanged from current
  values (regression).
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Profile shows Due/Learning/Mature totals that sum to `reviewed`.
- Per-section breakdown appears only when ≥1 section has SRS state.
- Teacher `PerformanceReport` unchanged for old clients (regression test on the response shape).

---

### PR-13 — Content library & self-study sessions (packs + Practice Test)
**Milestone** M3 (Sprint 3) · **Size** M–L (600–1100 LOC) · **Risk** MED (content pipeline)

**Scope**
- `core/src/content.ts`: `StudyPack` Zod schema (title, description, chapter/section refs,
  question selectors) alongside `SeedContent`.
- `content/packs/*.json` (first 2–3 curated packs over existing ch12 material) +
  `scripts/src/seed.ts` loads them into new tables; `scripts/src/verify.ts` gains pack checks
  (orphan section refs, pack non-empty, questions enabled).
- `core/src/db/schema.ts`: `study_packs (id, org_id, title, description, visibility
  ['org'|'draft'], created_by, created_at)` + `study_pack_items (pack_id, question_id, sort)`.
- `api/src/routes/packs.ts` (new): `GET /api/packs` (student: visibility='org' of caller's
  org), `GET /api/packs/:id`, and self-study session start
  `GET /api/practice/queue?mode=pack&pack_id=` (reuses PR-08 queue; timed Practice Test mode =
  same queue with `mode='practice_test'`, timer enforced client-side, results computed from
  `practice_attempts`).
- `mobile/`: library browse screen (pack cards with question counts), pack detail → "Study" /
  "Practice test" launchers; results screen for practice tests (score, time, missed list
  linking to PR-08 review flow).

**Depends on** PR-08 (attempt/queue path), PR-02 (org). **Unblocks** doc features #7 (Practice
Test leg) and #13.

**Contract/DB changes**
- `core contract change: yes` (new response schemas + content schema) → server-first.
- DDL: 2 tables + RLS enabled; seed/verify content additions ship in the same PR (gate:
  `npm run verify` must cover packs).

**Tests**
- Content schema unit tests (`StudyPack.parse` rejects orphan/empty packs — mirror existing
  content schema usage in `seed.ts`).
- Route: pack list org-scoped; practice queue for a pack only serves that pack's questions;
  attempts land with `mode='pack'`.
- Gates: typecheck · test · verify (now exercising packs) · mobile lint.

**Acceptance criteria**
- `npm run seed` + `npm run verify` handle packs end-to-end; a corrupted pack JSON fails verify
  with a clear message.
- A student can start a Practice Test from a pack, see a timed session, and get a results
  screen listing misses with re-attempt links.
- Packs from another org are never visible.

---

### PR-14 — AI card generation (pluggable LLM provider)
**Milestone** M3 (Sprint 3) · **Size** L (800–1400 LOC) · **Risk** HIGH (external dependency,
**OPEN DECISION — paid API key, see §11.1**)

**Scope**
- `api/src/lib/llm/provider.ts`: interface `LlmProvider { generateCandidates(input:
  {text, section_hint}): Promise<unknown> }`; implementations `mock.ts` (deterministic, used
  in tests/dev) and `openai-compatible.ts` (env `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` —
  works with any OpenAI-compatible endpoint). **Provider selection via env; feature returns
  `503 feature_disabled` when no key is configured** — the PR merges and ships without any
  paid key; enabling is a config change, not a code change.
- `core/src/contracts.ts`: `AiGenerateRequest {text: string ≤ 8000, section_id}`, candidate
  DTOs — new endpoints, additive.
- `core/src/db/schema.ts`: `candidate_questions (id, org_id, created_by, section_id,
  payload jsonb raw model output, items jsonb normalized[], status
  ['pending'|'approved'|'rejected'], created_at)`.
- `api/src/routes/ai.ts` (new, teacher-only via `requireRole("teacher")`): `POST /ai/candidates`
  (call provider, **Zod-validate the normalized output with the existing `SeedQuestion`
  schema** — malformed items dropped, never trusted), `GET /ai/candidates`,
  `POST /ai/candidates/:id/approve` (inserts into `questions` for the target section with
  `enabled=true`, org-scoped, marks status), `/reject`.
- `mobile/`: teacher flow on `(teacher)/index.tsx` → "AI card generator": paste notes →
  spinner (≤30 s) → candidate list with per-item approve/reject/edit (text edits before
  approve).

**Depends on** PR-02 (org on candidates/questions). **Unblocks** doc feature #12; feeds PR-13's
library content.

**Contract/DB changes**
- `core contract change: yes` (new schemas) → server-first.
- DDL: `candidate_questions` + RLS enabled. New env vars (placeholders in `api/.env.example`
  only — AGENTS #6, no secrets in repo).

**Tests**
- Provider unit tests with `mock.ts`; Zod rejection of malformed/hostile model output
  (missing correct option, 6 options, prompt-injection text is data not instruction — assert
  it's stored verbatim, not executed).
- Route: student gets 403; approve inserts exactly one question visible in `GET /api/syllabus`;
  disabled-without-key returns 503 `feature_disabled`.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- With no key configured: generator screen shows "not enabled yet", API returns 503, nothing crashes.
- With a key (manual, post-decision): paste 2 KB of notes → ≥5 candidates → approve → questions
  appear in the student feed's section after next activation.
- No raw LLM output reaches the DB without passing `SeedQuestion` Zod validation.

---

## 7. Milestone 4 — Classroom & competition (Sprint 4)

### PR-15 — Live class mode (Supabase Realtime, read-only for clients)
**Milestone** M4 (Sprint 4) · **Size** L (900–1500 LOC) · **Risk** HIGH (realtime, new failure modes)

**Scope** — binding design (see §9.3): Realtime is a **broadcast/read channel only; every
write still goes through the API.**
- `core/src/db/schema.ts`: `live_sessions (id, org_id, created_by, code text (join code),
  status ['lobby'|'question'|'ended'], current_question_id, starts_on, created_at)`,
  `live_answers (session_id, question_id, student_id, selected_option, self_eval, is_correct,
  answered_at, PK(session_id, question_id, student_id))`.
- `core/src/contracts.ts`: `LiveSessionResponse`, `LiveJoinRequest {code}`, `LiveAnswerRequest`
  (reuses `SubmissionRequest` semantics), `LiveStateResponse` (question + tally + top-5) —
  all new, additive.
- `api/src/routes/live.ts` (new):
  - teacher: `POST /live/sessions` (creates lobby + short code), `POST /live/sessions/:id/
    question` (advance: pick question from today's set, publish state), `POST …/end`;
  - student: `POST /live/join` (code → session, org-checked), `POST /live/:id/answer`
    (server grades, writes `live_answers`, awards XP `source='live'` capped, touches streak,
    then **publishes the updated state via the API's supabase-js realtime client** to channel
    `live:{session_id}`);
  - `GET /live/sessions/:id/state` — polling fallback (degraded mode when Realtime is blocked).
- `mobile/`: student join screen (code entry → lobby countdown → live question view with
  answer-in timer → instant result), teacher lobby/board `(teacher)/live.tsx`
  (participation count + per-question tally + leaderboard), both subscribing **read-only** to
  the Realtime broadcast with `GET …/state` polling as fallback (client picks whichever is
  live).

**Depends on** PR-02 (org), PR-03 (XP engine). **Unblocks** doc feature #14.

**Contract/DB changes**
- `core contract change: yes` (new endpoints) → server-first.
- DDL: 2 tables + RLS enabled. Realtime needs no table changes (broadcast, not
  `postgres_changes`) — if `postgres_changes` were used instead, RLS would gate reads; we use
  **broadcast** so no data flows through Supabase's client channel except what the API
  publishes.

**Tests**
- Route: join rejects wrong-org codes / ended sessions; advance rejects non-creator; answers
  rejected after `ended`; second answer for same question is idempotent (PK).
- Unit: tally/leaderboard computation from `live_answers` (ties, zero answers).
- Manual E2E documented in PR: two devices (teacher + student) on one session; fallback path
  forced by blocking the realtime websocket.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- A 3-device dry run: teacher opens lobby with code → students join → each question's answers
  appear on the board within ~1 s via broadcast; stopping Realtime degrades to polling with
  ≤3 s staleness.
- Live answers never appear in daily `submissions` or teacher participation reports for the
  daily set (assert in tests), but XP/streak are awarded (capped).
- Org isolation: a code from org A cannot be joined by org B students.

---

### PR-16 — Class challenges
**Milestone** M4 (Sprint 4) · **Size** M (400–800 LOC) · **Risk** MED

**Scope**
- `core/src/db/schema.ts`: `challenges (id, org_id, class_section, created_by, title,
  goal_type ['complete_set'|'xp_target'|'accuracy_target'], goal_value, starts_on, ends_on,
  status ['active'|'done'])`.
- `core/src/challenge.ts` + test: pure progress math (goal_type → class progress % from
  `submissions` / `xp_ledger` aggregates; completion predicate; per-student contribution).
- `api/src/routes/challenges.ts` (new): teacher `POST /challenges`, `GET /challenges` (org
  teacher view); student `GET /challenges` (active + my contribution + class %), optional
  `POST /challenges/:id/claim` (XP bonus via `source='challenge'` + badge unlock from PR-05
  catalog — add "challenge completed" as an 11th badge or reuse existing).
- `mobile/`: challenge banner on the feed header (serialize after PR-07's header edit) with a
  collective progress bar; detail sheet; teacher create screen on `(teacher)`.

**Depends on** PR-02, PR-03 (xp_target), PR-05 (reward badges).
**Unblocks** doc feature #15.

**Contract/DB changes**
- `core contract change: yes` (new endpoints) → server-first.
- DDL: `challenges` + RLS enabled.

**Tests**
- `core/src/challenge.test.ts`: progress % for each goal type, boundary (goal met exactly),
  date-window edge (before start / after end).
- Route: student cannot create; class % counts only same-org-section students; claim is
  idempotent.
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Teacher creates "Everyone finishes today's set by 6pm"; student feed shows live class %;
  when the last student completes, all students see the completion state on next feed load.
- No student-facing endpoint accepts `class_section`/`org_id` to widen the view (scoped from
  token/profile).

---

### PR-17 — Student-facing progress analytics
**Milestone** M4 (Sprint 4) · **Size** M (400–800 LOC) · **Risk** LOW

**Scope**
- `core/src/analytics.ts` + test: pure series builders — daily accuracy buckets (7/30-day),
  strongest/weakest section ranking with a min-attempts guard (avoid ranking on 1 attempt),
  time-spent heuristic (**session clustering from `submissions.answered_at` gaps — no new
  tracking needed**, documented as a proxy).
- `api/src/routes/me.ts` or new `analytics.ts` route: `GET /api/me/analytics?days=7` →
  `{trend: [{day, attempts, accuracy}], sections: [{section_id, name, attempts, accuracy}],
  time_spent_minutes, srs buckets (from PR-12)}` — student-scoped + org-scoped from token.
- `core/src/contracts.ts`: `AnalyticsResponse` — new, additive.
- `mobile/`: **new** `(student)/analytics.tsx` mounted from profile — 7/30-day trend line and
  section bar chart, hand-rolled with `react-native-svg` (already a dependency; **decision: no
  chart library** to avoid a new dependency on the gluestack/uniwind stack).

**Depends on** PR-10 (activity series), PR-12 (SRS buckets reused).
**Unblocks** doc feature #18 (last feature).

**Contract/DB changes**
- `core contract change: yes` (new response) → server-first. No DDL.

**Tests**
- `core/src/analytics.test.ts`: bucket boundaries, empty ranges (0 submissions), min-attempts
  guard, session-clustering heuristic (gap > 15 min starts a new session).
- Route: another student's id/query can't be requested (no student_id param accepted at all —
  assert 400 on unexpected query params? at minimum ignore-and-self).
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Profile → Analytics shows 7- and 30-day accuracy trend and strongest/weakest sections from
  real data; empty state for students with <5 attempts.
- No endpoint accepts a target student — everything is the caller (AGENTS #5).

---

### PR-18 — Meme reactions + avatar picker
**Milestone** M4 (Sprint 4) · **Size** S–M (300–600 LOC) · **Risk** LOW (bundled pair — see §2)

**Scope**
- **Memes:** `content/memes.json` (curated, kid-friendly, text+emoji reaction cards —
  **decision: no image hosting in v1**, see open question #11) + `core/src/content.ts`
  `MemePack` schema; `memes (id, org_id null-for-global, category, reaction text, enabled)`
  table; loaded by `scripts/src/seed.ts`, checked by `npm run verify`;
  `GET /api/memes` (org-scoped + global) with `enabled` filter;
  `mobile/src/components/meme-reaction.tsx` — after answer feedback in
  `components/question-card.tsx`, show a random reaction from the fetched set (respecting a
  per-org enable flag stored on `student_settings`? → teacher toggle: keep teacher setting
  minimal — global constant + org rows present = enabled; per-org toggle deferred, see
  open question #11).
- **Avatars:** `student_settings` += `avatar_key text`, `theme_key text` (DDL);
  `GET/PUT /api/me/settings` (own row only, token-derived); avatar catalog static in
  `core/src/avatars.ts` (emoji/illustration keys — **no image assets needed**, see open
  question #12); `mobile`: picker grid on `(student)/profile.tsx`, avatar shown on profile +
  (later) leaderboards; league ladder from PR-07 renders avatar keys when present.
- `SubmissionResponse` += optional `reaction?: string` (server picks the random meme at grade
  time — keeps client deterministic and lets us A/B via server config). Additive.

**Depends on** PR-05 (profile), PR-02 (settings/org), PR-08 (feedback strip lives near
practice flows). **Unblocks** doc features #16, #17 — completes the 18.

**Contract/DB changes**
- `core contract change: yes` (optional `reaction` field + settings schemas) → **server-first
  mandatory**: old API won't return `reaction`, new client must render `undefined` as "no
  reaction" (tested).
- DDL: `memes` + `student_settings` ALTER + RLS enabled; seed/verify extended.

**Tests**
- Content schema tests for `MemePack`; route tests for `/api/memes` (org scoping, disabled
  rows excluded) and `PUT /api/me/settings` (rejects body-supplied `student_id`/`org_id`,
  validates `avatar_key` against catalog).
- Gates: typecheck · test · verify · mobile lint.

**Acceptance criteria**
- Answering shows a reaction only when memes are enabled for the org; `reaction` never
  contains an unvalidated value (server picks from seeded rows only).
- Avatar persists across restarts and appears on the profile and league ladder.
- Student A's settings PUT cannot modify student B (route test).

---

## 8. Milestone timeline view (Sprint 1–4 sequencing)

Sprints are the doc's §5 roadmap; org foundation is prepended inside Sprint 1 as its own PR
series (binding decision #1). Two parallel tracks where files don't collide:

```
Sprint 1 — M1: Foundation + Retention (7 PRs)
  week 1-2  PR-01 Org foundation ────────► PR-02 Org scoping ───┐ (serial: same tables)
  week 2-3                ┌─────────────── PR-03 XP+levels+ring ─┤ (serial: submissions tx)
  week 2-3                │   PR-06 Push ──────────────── (parallel track — devices/notify)
  week 3    PR-04 Streak freeze ─────────► PR-05 Badges (+profile screen)
  gate: all 5 P0 features demoable; push digest firing via Actions cron

Sprint 2 — M2: Social & variety (4 PRs)
  PR-07 Leagues ◄── (needs PR-03 xp_ledger + 1 full week of XP data before first rollover)
  PR-08 Review-misses/Review  ──► PR-09 Match game        (serial: practice route file)
  PR-10 Streak calendar (parallel — profile screen, read-only vs PR-08/09)
  parallel: PR-07 backend+rollover ∥ PR-08/09 study modes ∥ PR-10

Sprint 3 — M3: Content & access (4 PRs)
  PR-11 Offline (parallel track — pure core + mobile only)
  PR-12 SRS stats (parallel — small, me.ts + profile)
  PR-13 Content library ──► PR-14 AI card gen   (serial: content pipeline + candidate→question flow)
  note: PR-11/PR-12 are independent of each other and of 13/14 — 2 tracks can run concurrently

Sprint 4 — M4: Classroom & competition (4 PRs)
  PR-15 Live class mode (L — start first in the sprint)
  PR-16 Class challenges (parallel — different routes; header edit serialized after PR-15 if colliding)
  PR-17 Student analytics (parallel — read-only)
  PR-18 Memes + avatars (parallel — small; serialize any question-card.tsx edits behind PR-15)
```

**Critical path:** PR-01 → PR-02 → PR-03 → (PR-04 → PR-05) → PR-07 / PR-08 → PR-13 → PR-14
→ PR-15. PR-06, PR-11, PR-12, PR-17 are the floaters that keep a second engineer busy while
the critical path reviews.

**Collision map** (same-file serialization): `core/src/db/schema.ts` — additive per PR, low
conflict; `core/src/contracts.ts` `MeResponse` — touched by 03/04/05/06/07/12/17 (merge
additively, rebase often); `api/src/routes/submissions.ts` — **03 → 04 → 05 (strict order)**;
`mobile/src/app/(student)/index.tsx` header — **03 → 04 → 07 → 16 (strict order)**;
`mobile/src/app/(student)/profile.tsx` — 05 → 10/12/18 sections; `practice.ts` — 08 → 09 → 13.

---

## 9. Architecture fit notes

### 9.1 Features on the feed/submission hot path (performance)
- `POST /api/submissions` grows from 3 writes (submission, streak/review, ) to 5–6 (+
  `xp_ledger` upsert, `activity_days` insert, badge evaluation, optional freeze bookkeeping).
  All are single-row writes inside the **one existing transaction**; badge evaluation is
  in-process over facts already in hand (no extra round-trip on the idempotent-replay path).
  HLD §5 budget: feed GET < 300 ms p95 — the read path is untouched by PR-03/04/05 except the
  goal block (computed from data already loaded). Watch Render free-tier single vCPU; if the
  tx grows noticeable, the first optimization is folding `xp_ledger` + `activity_days` into one
  multi-VALUES statement (not planned preemptively — YAGNI until measured).
- `GET /api/feed/today` gains only `goal` (pure arithmetic on existing `progress`). League
  chip and challenge banner read from `GET /api/me` / `GET /api/challenges`, **not** the feed,
  to keep the feed's query count flat.
- Practice/live answers are deliberately **off** the hot path (`practice_attempts`,
  `live_answers`) so re-drills and live storms never contend with daily submissions or skew
  `submissions`-based reports.

### 9.2 Offline sync design
- Client caches the last `FeedResponse` + a durable queue of unsubmitted answers
  (AsyncStorage). Replay is **sequential through `POST /api/submissions`** — the API remains
  the only writer (AGENTS #1); there is no direct DB access, no Supabase client writes, and no
  new "batch submit" bypass of validation.
- Idempotency already exists server-side: `submissions_student_question_set_unique` + the
  stored-result replay branch in `submissions.ts` ⇒ replayed items converge instead of
  duplicating. Streak/XP/SRS run only on the first successful insert, so replays award nothing
  twice.
- Conflict policy: **server-authoritative and append-only** — a graded answer is immutable;
  if the day's set changed while offline (teacher re-activated), the server 400s with
  "question is not part of this daily set" and the client drops that item with a visible
  notice. No client-supplied timestamps are trusted (anti-tamper; `answered_at` stays
  `defaultNow()`).

### 9.3 Live class mode via Supabase Realtime (read-only channel)
- Clients subscribe to broadcast channel `live:{session_id}` for question state, tallies, and
  leaderboards — **reads only**. Students' answers POST to `/api/live/:id/answer`; the **API
  publishes** state updates to the channel using its supabase-js client (server-side, with
  service credentials). Nothing in the client can publish or write; RLS is untouched because
  broadcast carries no table data beyond what the API composed.
- Degraded mode: `GET /live/sessions/:id/state` polling fallback in the client (schools have
  flaky networks; the feature must work without websockets, just slower).

### 9.4 Notifications on the free tier (device tokens + background job)
- Table: `device_push_tokens` (PR-06). Delivery: Expo Push HTTP API (approved, free).
- **There is no always-on worker on the Render free tier** (sleeps after 15 min, no cron
  triggers). Chosen pattern: **GitHub Actions scheduled workflow → authenticated internal
  API endpoint (`x-internal-secret`) → the API itself computes recipients and calls Expo
  Push.** Why not `pg_cron`/Supabase Edge cron: they would have to read business tables and
  enqueue work outside the API, violating AGENTS #1 (API is the only writer). The cron only
  *triggers*; all logic and writes stay in `api/`. Cold-start (~30 s) is acceptable for a
  daily 19:00 reminder. Escalating nudge = second scheduled run +1 h. League rollover (PR-07)
  reuses the identical pattern.

### 9.5 Contract-change discipline (AGENTS #3)
- Every `core/src/contracts.ts` change in this plan is **additive** (optional fields or brand
  new endpoints) and ships **DDL → API → app**, the `DEPLOY.md` order. Old installed builds:
  ignore unknown response fields; never send fields the new server requires; new endpoints are
  simply never called. The one *semantic* hazard is PR-01's `daily_sets` unique-index swap —
  mitigated as described there (back-to-back deploy, second org only after rollout).
- Any future non-additive change (e.g. renaming `SELF_EVAL`, making an optional field
  required) must be called out in `/review` as a **forced app update** with a compatibility
  window — none are planned in this roadmap.

---

## 10. Metrics instrumentation (doc §6 → where it lives)

Baseline lands in **PR-01** (`app_events` + `scripts/src/metrics.ts`), *before* P0 ships, so
later PRs are measured against a pre-change baseline. Current tables already answer part of
the table: questions/day and accuracy come from `submissions`, median streak from `streaks` —
the script reads those directly; `app_events` covers what no existing table can.

| Metric (§6 target) | Source | Introduced / enabled by |
|---|---|---|
| D1 / D7 / D30 retention | `app_events` first-seen + daily-active per student | **PR-01** (`app_events`, `npm run metrics`) |
| DAU / total students | `app_events` distinct student/day ÷ `profiles` | **PR-01** |
| Session length | `app_events` `session_start` / `session_end` (client `occurred_at`, untrusted-but-fine for product metrics) emitted by feed + summary screens | **PR-01** (schema), emitted from **PR-03** UI |
| Questions answered per day | `submissions` aggregate (existing table) | **PR-01** script (no new tracking) |
| Streak length (median) | `streaks` + `activity_days` | **PR-01** script; `activity_days` depth from **PR-04** |
| Churn after day 1 | `app_events` cohort math | **PR-01** script |
| P0 engagement: XP earned/level distribution, goal completion rate | `xp_ledger`, `student_settings.daily_goal` vs `activity_days` | **PR-03** |
| Freeze economy: freezes granted/used, streaks saved | `streaks` columns + `activity_days.protected` | **PR-04** |
| Badge unlock funnel | `student_badges` | **PR-05** |
| Push opt-in rate, send/open counts | `device_push_tokens`, `push_sent`/`push_opened` events | **PR-06** |
| League participation / promotion churn | `league_members` | **PR-07** |
| Mode usage & retention-by-mode | `app_events` `mode_opened`, `practice_attempts.mode` | **PR-08 / PR-09 / PR-13** |
| Offline reliability | `offline_queued` / `offline_synced` / dropped counts | **PR-11** |
| Live-session engagement | `live_answers`, `live_join` events | **PR-15** |
| Challenge completion rate | `challenges` + computed progress | **PR-16** |
| Reaction/avatar adoption | `student_settings`, `reaction` served counts | **PR-18** |

Event naming convention and payload shape are defined once in PR-01
(`api/src/routes/events.ts` + `docs/06` §0 pointer); later PRs only add event *names*.

---

## 11. Open questions for the product owner
*(numbered for one-pass answering; each has a default recommendation we will proceed with if not answered)*

1. **AI card generation provider & budget** — which paid LLM API, who holds the key, monthly
   cap? **Default:** ship PR-14 with the OpenAI-compatible interface + mock provider, feature
   disabled until a key is approved; use the cheapest tier, hard cap input at 8 KB/call and
   ~10 calls/teacher/day; key lives only in Render env.
2. **AI input format** — notes paste only, or PDF/lecture upload (needs Supabase Storage) in
   the first cut? **Default:** text paste only in PR-14; PDF is a follow-up PR.
3. **XP balance table** — points for correct MCQ / correct flashcard / attempt on wrong /
   streak bonus formula / practice-match-live rates / daily cap? **Default:** correct = 10,
   practice attempt = 4, streak bonus = `min(streak, 5)`, match bonus ≤ 20/day, live = 5/question,
   total daily cap 300 (anti-grind), no XP for wrong MCQ but attempt credit = 2.
4. **Streak freeze economy** — earn rule, cap, and can a >2-day gap ever be frozen? **Default:**
   earn 1 freeze per Mon–Sun week with ≥5 active days, cap 2 carried; only the 2-day gap is
   protectable; grants computed lazily on write (no cron).
5. **League pool sizing & scope** — pools within section or across the org? size, promote/
   demote depth, minimum viable pool? **Default:** pools of 20 within the caller's
   `class_section`, padded across sections of the same org only if a section < 10; top-3
   promote / bottom-3 demote; pools < 5 hold tier for the week.
6. **Timezone for all date math** — streaks/weeks/goals currently slice UTC
   (`toISOString()`), but the school is IST: a 00:30 IST submission counts "yesterday".
   **Default:** switch day/week boundaries to **Asia/Kolkata** in PR-04 (earliest PR that owns
   date logic), with a regression test; flag if the pilot is not in India.
7. **Notification schedule & quiet hours** — send time, escalation gap, per-day frequency cap,
   copy language (EN vs Kannada)? **Default:** one reminder at 19:00 IST if inactive, one
   escalation at 20:00 IST, hard cap 1/day (2 during escalation), quiet 21:00–07:00 local,
   English copy first.
8. **Push platform reality** — Expo Push works for the Android APK; **PWA/web builds cannot
   receive it** (web push/VAPID is separate work). **Default:** target the APK for push in
   Sprint 1, record `platform='web'` tokens and skip them; decide on web push after pilot.
9. **Mascot assets & copy** — who draws the mascot, and are notification strings localized?
   **Default:** emoji mascot (🦊/🦉) + product-written EN copy for v1; real art is a content
   deliverable before Sprint 2 ships.
10. **Badge catalog sign-off** — are the 10 badges in PR-05 the right ones (and should any be
    art-backed vs emoji)? **Default:** proceed with the listed 10 as emoji badges; art pass
    later without schema change (`badge_key` is stable).
11. **Meme moderation & format** — who curates the reaction set, images or text, and can a
    teacher opt out per org? **Default:** developer-seeded, teacher-approved text+emoji
    reactions in `content/memes.json` (no image hosting, no student uploads, ever); per-org
    enable = rows present for the org; images/Supabase Storage deferred.
12. **Avatar asset set** — image packs (Storage/CDN) or emoji/illustration keys? **Default:**
    emoji/illustration keys from a static `core` catalog (zero asset pipeline); image packs
    later behind the same `avatar_key` column.
13. **Content library curation & authoring** — who writes packs: seed JSON only, or in-app
    pack builder for teachers? **Default:** seed-only via `content/packs/*.json` in Sprint 3;
    in-app authoring is post-pilot.
14. **Live mode scoring effects** — do live answers count toward streak / daily goal / XP?
    **Default:** XP yes (capped, `source='live'`), streak yes (participation per HLD §4),
    daily goal ring **no** (it measures the day's set); answers stored only in `live_answers`.
15. **Practice-attempt side effects** — should Review/Practice-Test/Match attempts count as
    streak activity and XP? **Default:** yes with the caps in #3; streak counts any attempt
    (HLD §4 "≥1 answer" is about participation, and practice *is* participation). If the owner
    prefers strict daily-set-only streaks, PR-08 drops `touchStreak` — one-line change.
16. **Metrics cadence & access** — who runs `npm run metrics`, and does anyone but the team
    need a dashboard? **Default:** manual run in the weekly retro; no admin dashboard in this
    roadmap (revisit at pilot retro).

---

## 12. Explicitly out of scope for this plan

Hearts/lives · Duolingo-style learning path UI · 1–5 confidence rating on flashcards (would
change the SRS grade scale — separate ADR) · community/shared decks · PDF→AI ingestion (Q2) ·
web push for PWA (Q8) · image-based memes/avatars (Q11/Q12) · in-app pack authoring (Q13) ·
image upload of handwritten working (V2 backlog #1) · Kannada UI (V2 backlog #2). Each stays
in the V2 backlog in `docs/05-ROADMAP.md`.
