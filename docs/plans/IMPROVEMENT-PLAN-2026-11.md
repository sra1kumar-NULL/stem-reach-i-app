# Improvement Plan, November 2026

Status: **Reviewed, awaiting owner approval.** The Principal Engineer review returned APPROVE WITH CHANGES, and
those changes are applied here. See [Review record](#review-record) for what ran and what did not.

Evidence: [`docs/reviews/GSTACK-REVIEW-2026-10-31.md`](../reviews/GSTACK-REVIEW-2026-10-31.md) (`F1` to `F30`).
Baseline: `eb06319`.

**Goal:** make the current pilot safe and trustworthy, then let real usage decide what gets built next.

## Order of work

| Step | Work | Why here |
|---|---|---|
| 0 | Check production and take a backup | Answers can reorder everything else |
| 1 | Land the stashed migrations | The code already depends on them |
| 2 | Quick security fixes | Small, no installed-build risk |
| 3 | Testing safety net | Nothing risky should land without it |
| 4 | Version visibility, in the next app build | Later steps must measure who has updated |
| 5 | Cohort integrity | Fixes a live silent failure |
| 6 | Larger security work | Needs steps 3 and 4 |
| 7 | Polish and performance | Only after the above |

## How to execute this plan

- One branch and PR per step unless a task says otherwise. Follow `AGENTS.md`: `/review`, `/fix-review`, `/test`.
- A task is done only when its **Done when** check has been run and its real output is in the PR.
- Every PR runs `npm run typecheck && npm run lint && npm run verify && npm test`, plus the integration suite against
  a scratch database. Never point `TEST_DATABASE_URL` at `api/.env`'s database: that suite truncates tables.
- Rollout stays **database → API → app**. `core/` contracts change additively, because installed apps cannot be
  force-updated.
- New tables ship with `ENABLE ROW LEVEL SECURITY` and no policies.
- Nothing here deploys automatically. Production steps are marked **Owner**.
- Anything about real Supabase sessions must be tested against a scratch Supabase project. The e2e mock and the
  integration fakes cannot prove it.

Size: **S** under half a day, **M** one to two days, **L** more.

---

## Decisions needed

Defaults are what the plan assumes if nobody says otherwise.

| # | Decision | Default | Blocks |
|---|---|---|---|
| D1 | Should students self-register, or should teachers create accounts? The HLD chose teacher-created; the code allows self-signup. | Keep self-signup, but pick the class from a list | 5.5 |
| D2 | Should changing a password in Profile need the current password? It tightens security but breaks that form on installed builds. | Yes, enforced only after the update gate passes | 6.3 |
| D3 | How far can activations go back or forward? | No past dates, up to 1 year ahead | 5.7 |
| D4 | Who owns the Android release keystore? | Owner, stored in GitHub Actions secrets | 4.3 |
| D5 | Pay about $7 a month for an always-on API? | Yes before a full class pilot | 3.7 |
| D6 | Is the first target more depth at one school, or a second school? | One school. Keep `org_id` deferred | Roadmap |

---

## Step 0: Check production and back it up (Owner, 1 hour, no code)

The SQL is read-only, for the Supabase SQL editor. `public` names are checked against `core/src/db/schema.ts`.
`auth.users` columns are outside the repo, so a failure there means adjusting the query, not a finding.

**O0. Backup.** Export the database, keep it outside the repo, and test-restore it to a scratch database. Neither this
plan nor `docs/DEPLOY.md` had a backup step. Repeat before 1.5 and 5.4.

**O1. RLS on every table (F1, F2).** Any `rls = false`, or any policy that opens a table to `anon`, is an incident: fix
it the same day.

```sql
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('anon', c.oid, 'insert') as anon_insert,
       has_table_privilege('anon', c.oid, 'update') as anon_update,
       has_table_privilege('anon', c.oid, 'delete') as anon_delete
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies where schemaname = 'public';
```

**O2. Does the cohort schema exist?**

```sql
select to_regclass('public.daily_set_cohorts') as cohorts_table,
       to_regclass('public.idx_submissions_set') as round3_index;
```

**O3. Do demo accounts exist (F3)?** Any rows: delete them or rotate each password before anything else. The password
stays in git history, so rotation is the real fix.

```sql
select u.email, p.role, u.last_sign_in_at
from auth.users u left join public.profiles p on p.id = u.id
where u.email like '%@stemri.local';
```

**O4. Users without profiles (F5).** Rows here are signups that bypassed the API.

```sql
select count(*) from auth.users u left join public.profiles p on p.id = u.id where p.id is null;
```

**O5. Real usage and content.** This decides the roadmap at the end of this plan.

```sql
select (select count(*) from public.questions where status = 'published' and enabled) as live_questions,
       (select count(distinct section_id) from public.questions) as topics_with_questions,
       (select count(*) from public.profiles where role = 'student') as students,
       (select count(distinct student_id) from public.submissions
         where answered_at > now() - interval '7 days') as active_students_7d,
       (select count(*) from public.daily_sets where set_date > current_date - 30) as activations_30d;
```

**O6. Class section spelling (F12).** Run the second query only if O2 shows the table exists.

```sql
select class_section, count(*) from public.profiles
where role = 'student' group by 1 order by 1;

select class_section, count(*) from public.daily_set_cohorts group by 1 order by 1;
```

**O7. Auth settings.** Dashboard → Authentication: turn off "Allow new users to sign up". The API uses the admin
endpoint, so app signup should keep working. Test one signup afterwards.

---

## Step 1: Land the stashed work (S)

Branch: `chore/land-cohort-migrations`.

| # | Task | Done when |
|---|---|---|
| 1.1 | Restore only the docs from `stash@{0}`, by explicit path: `git checkout 'stash@{0}' -- docs/ADR/0002-cohort-targeting.md docs/migrations/2026-10-05-cohort-targeting.sql docs/migrations/2026-10-05-round3-indexes.sql docs/plans/COHORT-TARGETING-PLAN.md docs/plans/UI-ENHANCEMENT-PLAN.md docs/reviews/CODE-REVIEW-R3-BACKEND.md docs/reviews/CODE-REVIEW-R3-MOBILE.md docs/reviews/UX-IMPROVEMENTS-R3.md docs/reviews/ux-r3`. Never `stash apply` or `pop`: that brings in the 121 MB APK. | `git status` shows no `.apk`. `*.apk` added to `.gitignore`. |
| 1.2 | Add `ALTER TABLE daily_set_cohorts ENABLE ROW LEVEL SECURITY;` to the cohort migration (F1). | Applied twice to a scratch DB without error; `relrowsecurity` is true. |
| 1.3 | Fix `MIGRATION_HINT` so a missing table names the right file (F14). Point it at an ordered list in `docs/DEPLOY.md`. | Unit test on `formatMissingMessage`. |
| 1.4 | Add a Round 3 rollout section and a backup step to `docs/DEPLOY.md`. Mark ADR 0002 **Accepted**. Add a banner to the R3 reviews linking the review report. | Doc review. |
| 1.5 | **Owner:** after O0, run the two migrations, depending on O2's answer. If the table already exists, run just the RLS line. | Re-run O1 and O2: `rls = true`. |
| 1.6 | **Owner:** after a look, drop `stash@{1}` and `stash@{2}`. Keep `stash@{0}` until the APK is archived elsewhere. | `git stash list`. |

---

## Step 2: Quick security fixes (S to M)

Branch: `fix/security-quick`. None of these touch installed-build behaviour.

| # | Task | Done when |
|---|---|---|
| 2.1 | **Hono (F7).** Upgrade `hono` and `@hono/node-server` to patched versions. Run non-major `npm audit fix` in mobile. Drizzle and zod wait for 6.1. | `npm audit --omit=dev` shows no hono advisory. All suites green. |
| 2.2 | **Demo credentials (F3).** Remove the password and project ref from `dummy-creds.json`, and the hard-coded passwords at `scripts/src/create-users.ts:9,17`. Make `create-users` refuse to run without `--allow-demo` and a non-production URL. Update the README. | Unit test for the guard. |
| 2.3 | **Signup (F6).** Return one fixed message for duplicates and remove the echoed provider text. | Integration test: new-failure and duplicate give the same response. |
| 2.4 | **Web hardening (F9).** Add a `CORS_ORIGINS` allowlist (native apps send no Origin). Add `secureHeaders()`. Add a CSP in `vercel.json`, checked against Supabase, fonts and wasm. Add `permissions: contents: read` to workflows, with `contents: write` only on the release job. Pass the tag through `env:`. Stop logging query strings. | Web login works against a preview with the CSP on, with no CSP errors in the console. |
| 2.5 | **Run `/cso` for real.** Rebuild it with gstack's `./setup` (the helper is missing), then run `/cso --comprehensive`. Triage results into this plan. | Status is **complete**, or gaps are named. |

---

## Step 3: Testing safety net (M to L)

Branch: `chore/test-and-ops`.

| # | Task | Done when |
|---|---|---|
| 3.1 | **Fix e2e (F19).** `teacher-c`: use `radio` role. `teacher-b`: press "Show all" first, and pick a future day in the visible month. `stack.sh`: warm the bundle before returning. | All four suites pass, including with the date set to a month end. |
| 3.2 | **Run e2e in CI.** Add a job with a Postgres service. Replace the hard-coded `podman exec` and Chrome path with env-driven versions. Run on PRs touching `mobile/` or `api/`, plus nightly. | Green CI run. A deliberately broken selector turns it red. |
| 3.3 | **Stop silent skips.** Copy CSV fixtures into the repo. Add `npm run test:db`. Print a loud notice when the DB suite is skipped. Verify every `content/*.json` (F18). | 0 skipped in mobile. |
| 3.4 | **Baseline schema (F20), part 1.** **Owner:** after 1.5, provide `pg_dump --schema-only` of `public`. Diff it against `api/test/schema.sql` first and record every difference. | Written diff. |
| 3.5 | **Baseline schema, part 2.** Commit the baseline as the first numbered migration and archive the older files rather than replaying them. Add CI stubs for the `auth` schema and Supabase roles: production may have `profiles.id` referencing `auth.users` (`docs/04-LLD.md:10`), and plain `postgres:16` has neither. Repoint `api/src/integration-utils.ts:81`, `e2e/stack.sh:41` and `e2e/README.md:23`. | CI builds the DB from migrations only. `schema.sql` is gone. |
| 3.6 | **Schema guards.** Add a `schema_migrations` ledger table in production. Fail CI when a column has no migration, using `expectedFromSchema`, and when a table lacks RLS. CI proves only the migrations: add a read-only production RLS check to the owner's rollout steps too. | CI fails on a deliberately missing migration and on a table with RLS off. |
| 3.7 | **API observability (F21, F22).** Add an uptime check on `/api/readyz` and error alerting from API logs. Per D5, move the API off the sleeping tier. App crash reporting is deferred: it adds a vendor handling minors' data, and no need has been shown. | Stopping the API raises an alert. |

---

## Step 4: Version visibility, in the next app build (S, plus a reinstall)

Branch: `feat/app-version-header`. This one build carries 4.1, 4.2 and 4.3, because a signature change needs a
reinstall and only one reinstall should be asked of students.

| # | Task | Done when |
|---|---|---|
| 4.1 | **App version header.** The next build sends `X-App-Version` on every API call, and the API logs it. Installed builds send nothing and have no `expo-updates`, so today no one can tell who has updated. | Logs show the version for the new build and "none" for older ones. |
| 4.2 | **Build identity (F23).** Set `versionCode` from CI and show the build number in Profile. | Two consecutive builds differ. |
| 4.3 | **Release signing (F8), per D4.** Sign with a real keystore held in secrets. This blocks update-in-place on sideloaded installs, so warn first: local self-study decks are lost on uninstall. | Reinstall tested on a real Android device. |
| 4.4 | **Update gate.** Define it once: **zero headerless requests of the relevant kind for 14 school days, and each teacher confirmed updated.** 5.2 needs teachers only. 6.3 needs all users. | Written into `docs/DEPLOY.md`. |

---

## Step 5: Cohort integrity (M)

Branch: `fix/cohort-integrity`. The first task ships in the Step 4 build.

| # | Task | Done when |
|---|---|---|
| 5.1 | **Client fixes, in the Step 4 build (F28, F29, F30).** Move the cohort hydration at `mobile/src/app/(teacher)/index.tsx:92` above `loadedOnce.current = true` at `:86`, so saved cohorts load the first time. Include cohorts in `isChanged` (`:120`) so audience-only changes save. Always send `target_cohorts` (`[]` for All students). | Component or e2e test: reopening the app shows the saved audience, and changing only the audience saves. |
| 5.2 | **API keep-on-omit (F10).** On `POST /activations`, **omitted keeps the existing audience and `[]` clears it**, only after the 4.4 gate. Doing this first would leave current builds unable to return to All students. For `POST /activations/plan`, apply it now: no build sends cohorts there, so no wait is needed. | Integration tests for omitted, `[]` and a list on both routes. |
| 5.3 | **Calendar audience (F29).** Add an audience choice to plan-ahead so targeted plans are possible. | e2e: a planned targeted day reaches only that class. |
| 5.4 | **Clean existing data (F12).** Review O6, write an explicit mapping (`Class 10B` → `10B` is not something a rule should guess), and keep the originals. **Owner**, after O0, runs one transaction: `INSERT ... ON CONFLICT DO NOTHING` into `daily_set_cohorts`, delete old rows, update `profiles`. A plain `UPDATE` can hit the primary key, and updating only `profiles` would hide sets and reject submissions, since matching is exact (`feed.ts:37`, `submissions.ts:174`). | Dry run on the O0 restore. Before and after counts match the mapping. |
| 5.5 | **Keep it clean.** Deploy before 5.4: normalize at signup (trim, upper-case, no spaces). Add `PATCH /students/:id` for teachers. Per D1, replace the free-text field with a list. | Integration test: `10 a` becomes `10A`. A teacher can fix a student. |
| 5.6 | **Validate cohorts (F11),** only after 5.4. Reject values not in the current section list with a clear 400. Show the audience in the confirm step: "Activate for 10A (31 students)". | Integration tests for unknown and wrong case. |
| 5.7 | **Bound activation dates (F15).** Per D3. | Integration tests at each boundary. |
| 5.8 | **Correct the numbers (F13, F16).** Use the targeted audience as the calendar denominator. Return 200 with an empty result for days with no activation, after checking the mobile screen. | Integration tests. Reports shows no error on an empty day. |
| 5.9 | **Tell excluded students.** Decide whether to add an optional `not_in_audience` field so the app can suggest their decks instead of "no revision today". | Decision recorded. |
| 5.10 | **Feed refresh (F17).** Refetch on foreground when the date changed. | Unit test on the date-change check. |

---

## Step 6: Larger security work (M to L)

Branch per task. Needs the Step 3 safety net.

| # | Task | Done when |
|---|---|---|
| 6.1 | **Drizzle and zod (F7).** Upgrade `drizzle-orm` past 0.45.2 after reading its changelog: it touches every query. Only a literal `sql.identifier` was found in non-test code (`questions.ts:57`), so this is not urgent. Assess zod separately: its fix needs zod 4, contracts are shared, and the 256 KB body limit already bounds it. | Advisory cleared or accepted in writing. All suites and e2e green. |
| 6.2 | **Does reset already end sessions? (F4), one hour.** On a scratch Supabase project, reset a user's password through `admin.updateUserById`, then try the old access token against `getUser` and the old refresh token. GoTrue's source suggests all sessions are logged out, but the hosted version is unconfirmed. Do **not** have the API write to `auth.sessions`: GoTrue owns that schema and it sits outside Drizzle. If sessions survive, assess `ban_duration`, which is also untested for this. | Observed behaviour written down. F4 is updated. |
| 6.3 | **Change password (F4), per D2.** Add optional `current_password` now, and require it outside forced-change mode after the 4.4 gate. | Integration tests: wrong password rejected, forced change still works, old path works until enforcement. |
| 6.4 | **Native session storage (F8).** Add a chunked `expo-secure-store` adapter that migrates the existing session on first launch, so nobody is logged out. | Upgrade tested on a real Android device: session survives. |
| 6.5 | **Account deletion and retention.** No path exists to delete a student's account or data, and the users are minors. Decide the policy with the school and take advice on applicable law; this plan makes no legal judgment. Then build deletion through the API. | Written policy. Integration test: a deleted student leaves no personal rows. |

---

## Step 7: Polish and performance (stop when it stops mattering)

Branch per item. Re-check the R3 UX backlog against current screens first, since much of it is done.

| # | Task | Done when |
|---|---|---|
| 7.1 | Cap the feed and Today to the same centered width as Questions (F24). | Screens at 1280 px match. |
| 7.2 | Compact the Today sticky bar at small heights, shorten the tab label, and keep the audience visible before confirming (F25). | 320x640 review. |
| 7.3 | Remove the 18 unused mobile files and 11 unused dependencies, confirming each with a build. | Web export and APK both build. |
| 7.4 | Split teacher routes out of the student bundle (F26). Set a budget in CI. | Entry bundle below an agreed target, measured like the 3.9 MB baseline. |
| 7.5 | Hide the streak until it reaches 1 (F27). The UI plan's ST4 asks for the opposite, so settle it once. | Screen review. |
| 7.6 | Upgrade Expo for the `expo-router` advisory chain, as its own PR with a device test pass. | `npm audit` clean of that chain. |

---

## After this: what to build next

Decide from O5 and a week of pilot data, not from the backlog.

| If the data shows | Then |
|---|---|
| Few live questions | **Content first.** A daily feed cannot retain students on a small bank. Use the CSV import path and get teachers adding chapters before any feature work. |
| Good content, students stop returning | Push reminders (roadmap item 3), then streak protection. |
| Students return, teachers stop activating | Teacher time: plan-ahead defaults, copy last week, one-tap activate. |
| A second school asks | Multi-tenant `org_id` (see ARCHITECTURE.md). Do not build it speculatively: it touches every table, every query and every contract. |

## Explicitly not in this plan

- The 18-feature engagement roadmap in `docs/06-FEATURE-PLAN.md`. Wait for data.
- Multi-tenancy, per D6.
- App crash reporting, until a need is shown (3.7).
- Caching `getUser`: it is the check that makes a reset take effect immediately (`api/src/lib/auth.ts:30`). Revisit only with measured latency.
- A design system rewrite. Fix specific screens.
- iOS release work.

## Review record

| Review | Status |
|---|---|
| Principal Engineer (`AGENTS.md` plan approval) | **APPROVE WITH CHANGES.** All changes applied. Code read, nothing executed. |
| `/autoplan` | **Partial.** Started, but the full pipeline was not completed. Its CEO, DX and Eng section-by-section reviews, spec loop and approval gate did not run, and its Design phase was skipped by the detector. Do not treat this plan as `/autoplan` approved. |
| Codex outside voice | **Unavailable.** The account rejected both `gpt-6-astra` and `gpt-5.4-mini`, so this plan has one reviewer, not two. |
| Senior Engineer review (`AGENTS.md` `/plan`) | **Not run.** |

Applied from the Principal Engineer review, after checking each code claim:

- 4.1 was unsafe as first written: an always-sent `[]` plus the hydration bug would have made the wipe permanent.
- Added measurable update visibility, because no wait period could otherwise be justified.
- Replaced the `auth.sessions` spike with a direct test of whether reset already revokes sessions.
- Reordered: quick fixes, then the safety net, then riskier upgrades.
- Added a backup step, a cohort data migration that handles both tables, and stubs for the baseline schema.
- Cut `getUser` caching and deferred app crash reporting.
