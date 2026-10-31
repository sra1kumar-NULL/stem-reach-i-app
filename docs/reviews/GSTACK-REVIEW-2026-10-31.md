# App review, 31 October 2026

Reviewed revision: `eb06319` (`main` and `feat/refactor-architecture-lev` are identical).
Companion plan: [`docs/plans/IMPROVEMENT-PLAN-2026-11.md`](../plans/IMPROVEMENT-PLAN-2026-11.md).

Everything below ran locally. Nothing touched the live Render, Vercel or Supabase services, so the state
of production is **unknown** and every production question is listed as an owner check in the plan.
No product code changed, no stash was applied or dropped, and nothing was deployed.

## 1. Verdict

The engineering base is healthier than the older reviews suggest: most Round 3 findings are fixed, and the
unit, integration and lint gates are green. Four things stand out:

1. **Cohort targeting shipped half finished.** The code is on `main`, but its migration is only in a stash and
   that migration leaves the new table without RLS. Targeting also has silent failure modes (section 3).
2. **Production data protection cannot be proven from the repo.** No baseline DDL exists, RLS on the base tables
   is unverifiable, and a shared demo teacher password is committed next to the production project ref.
3. **The browser e2e suites are rotting outside CI.** Three of four failed on a first run. All causes were in
   the tests or the cold start, not the product, but nothing was watching.
4. **The bottleneck may be content, not features.** The repo's bank is one chapter: 3 topics, 34 MCQs and
   15 flashcards. Whether teachers have added more in the app is unknown (owner check O5).

## 2. Gates (real commands, real output)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Content | `npm run verify` | exit 0, `3 sections, 34 MCQs, 15 flashcards` |
| Unit | `npm test` | core 34/34, api 210 (see note), scripts 6/6, mobile 154 pass + 6 skipped |
| Integration | `TEST_DATABASE_URL=... npx tsx --test "src/**/*.integration.test.ts"` on a throwaway Postgres 16 | 95/95 |
| e2e, first run | `node student.mjs`, `teacher-a`, `teacher-b`, `teacher-c` | student aborted, a 23/23, b 18/20, c 32/33 |
| e2e, student on warm bundle | `node student.mjs` | 36/36 |
| Dependencies | `npm audit --omit=dev` | root: 2 high, 2 moderate. mobile: 1 critical, 13 high, 14 moderate, 1 low |
| Shell | `shellcheck` 0.11.0 on both scripts | exit 0 |
| Web bundle | `expo export --platform web` | entry 3.9 MB raw, 973 KB gzip. 9.8 MB total, of which 4.9 MB fonts |

Notes:

- The api count of 210 includes the integration suite as one skipped-but-`ok` wrapper line, so a plain `npm test`
  does not exercise real Postgres.
- The 6 mobile skips need CSV fixtures from `~/Downloads`, so those tests never run in CI or on a fresh clone.
- `/health` composite: **8.6 / 10, partial coverage** (typecheck 10, lint 10, tests 10, shell 10, dead code 0;
  GBrain not installed). The dead-code 0 overstates the problem: knip's raw count is mostly exports used only by
  tests. The actionable part is 18 unused mobile files and 11 unused mobile dependencies.

### Why the e2e suites failed

| Failure | Cause | Evidence | Product bug? |
|---|---|---|---|
| `student` aborts at first `goto` | 8 s timeout on Metro's first bundle | 36/36 once warm | No |
| `teacher-c` roster step | Test clicks `button 'Class 10B'`; the filters are now `radio` | `$B snapshot` shows `[radio] "Class 10B"` | No, stale test |
| `teacher-b` day panel check | Questions now sit behind "Show all (49)" | Day sheet text | No, stale test |
| `teacher-b` calendar step | Plan-ahead clicks tomorrow's cell, and 1 November is not in October's grid | `e2e/teacher-b.mjs:98-100` | No, fails on the last day of any month |

The teacher fixes are diagnosed from these observations; the corrected suites have not been run yet.

## 3. Findings

Evidence labels: **reproduced** (run locally), **static** (read in code), **unknown** (needs production access).

### Security

`/cso` did **not** run: status **not assessed**. Its native helper `bin/gstack-cso-launcher` is missing from this
install, so it failed closed. The findings below come from a manual pass and are not `/cso` output. Scanner and
fuller STRIDE coverage are still outstanding (plan task 2.5).

| ID | Sev | Evidence | Finding | Location |
|---|---|---|---|---|
| F1 | High | static | The stashed `daily_set_cohorts` migration has no `ENABLE ROW LEVEL SECURITY`. Every other table's standard is RLS on, no policies. The app ships a public anon key, so if this SQL was run as written the table may be reachable through PostgREST. Whether anon can write depends on the project's grants. | `stash@{0}:docs/migrations/2026-10-05-cohort-targeting.sql` |
| F2 | High | unknown | RLS on base tables cannot be verified. They were created by hand and no DDL is committed. Students are minors. | `docs/DEPLOY.md:111` |
| F3 | High | static | A demo teacher password sits in the repo beside the live project ref, and the file says it is for "pilot testing". If those accounts exist in production, anyone with repo access is a teacher. | `dummy-creds.json`, `scripts/src/create-users.ts:9` |
| F4 | Med | static | `POST /me/change-password` needs no current password, so a stolen session can take over the account. The repo's code does not explicitly end sessions on reset, but GoTrue's source suggests an admin password update may log them out. That is unconfirmed on hosted Supabase, so test it (plan task 6.2). The mock cannot show this. | `api/src/routes/students.ts`, `api/src/routes/account.ts:12` |
| F5 | Med | static | The anon key can call GoTrue signup directly, bypassing the API's rate limit and invite check. Those users have no profile, so the API rejects them, but it allows account spam. | Supabase Auth setting |
| F6 | Med | reproduced | Signup reveals whether an email is registered. | `api/src/routes/auth.ts:101` |
| F7 | Med | static | `hono` 4.12.33 has a CORS ReDoS advisory and this API uses the CORS middleware before auth. `drizzle-orm` 0.38.4 has an identifier-escaping advisory; no user-controlled identifiers were found, so reachability looks low. | `api/package.json` |
| F8 | Med | static | Native sessions are in plain AsyncStorage (`allowBackup` is now false, which limits exposure). Release APKs are debug-signed and attached to public GitHub Releases. | `mobile/src/state/auth.tsx:34`, `scripts/build-apk.sh:18` |
| F9 | Low | static | CORS `*`, no CSP on the web app, no `permissions:` block in workflows, `github.event.inputs.tag` interpolated into a shell step. Search terms containing student names reach request logs. | `api/src/app.ts:46`, `mobile/vercel.json`, `.github/workflows/release-apk.yml` |

The mobile critical (`shell-quote`) and most mobile highs are build tooling, not code on a student's phone. The
`expo-router` chain (`query-string`, `decode-uri-component`) ships to clients but needs a major Expo upgrade.

**Checked, nothing found:** real secrets in the tree or in history for the patterns searched (service keys, invite
codes, connection strings, private keys, Resend keys). Every hit was a placeholder or an e2e throwaway. This was a
pattern search, not a full Gitleaks run. No API read of `user_metadata` drives authorization.

### Correctness

| ID | Sev | Evidence | Finding | Location |
|---|---|---|---|---|
| F10 | High | reproduced | `POST /activations` without `target_cohorts` wipes existing targeting. Any installed teacher build older than the picker removes a restriction on update, and the targeted class stops being targeted with no notice. | `api/src/routes/activations.ts` |
| F11 | High | reproduced | Cohort values are not validated: `10a` and `ZZZ` both return 200, every student gets "no revision today", and participation shows 0 students. | `api/src/routes/activations.ts` |
| F12 | High | static | `class_section` is free text at signup and matching is exact, so `10a` or `10 A` silently fall out of targeted sets. There is also no route for a teacher to correct a student's section. | `mobile/src/app/signup.tsx`, `core/src/contracts.ts:267` |
| F28 | High | static | The Today screen does not load saved cohorts on first open: `loadedOnce` is set at line 86, before the check at line 92. A teacher who targets 10A, reopens the app and updates topics sends no cohorts, which triggers F10 from the **current** build. | `mobile/src/app/(teacher)/index.tsx:86,92` |
| F29 | High | static | Calendar plan-ahead and copy-last-week never send cohorts, and `/activations/plan` deletes them, so planning over a targeted day silently removes its audience. | `mobile/src/app/(teacher)/calendar.tsx:309,346`, `api/src/routes/activations.ts:209` |
| F30 | Med | static | `isChanged` ignores cohorts, so a change to the audience alone cannot be saved. | `mobile/src/app/(teacher)/index.tsx:120,147` |
| F13 | Med | static | Calendar participation counts all students even when a set is targeted, understating class participation. Known and deferred in the cohort plan. | `api/src/routes/calendar.ts:76,124` |
| F14 | Med | static | `MIGRATION_HINT` names the round-2 file, which cannot create `daily_set_cohorts`. The boot failure message points at the wrong fix. | `api/src/lib/schema-check.ts:15` |
| F15 | Med | reproduced | Activation accepts `2020-01-01` and `9999-12-31`, so a past day's history can be rewritten. | `api/src/routes/activations.ts` |
| F16 | Low | reproduced | `GET /reports/participation` returns 400 `no_activation` for a normal day with nothing activated. | `api/src/routes/reports.ts` |
| F17 | Low | static | The feed does not refresh when the date changes, so a tab left open overnight keeps yesterday's set. | `mobile/src/app/(student)/index.tsx` |
| F18 | Low | static | `verify` checks one file by default, and `seed` is not transactional. | `scripts/src/verify.ts:6`, `scripts/src/seed.ts` |

### Delivery and operations

| ID | Sev | Evidence | Finding |
|---|---|---|---|
| F19 | High | reproduced | e2e is not in CI and three of four suites fail on a first run (section 2). |
| F20 | High | static | Schema has no single source of truth: no baseline, no migration ledger, a hand-kept `api/test/schema.sql`, no `drizzle-kit`. |
| F21 | Med | static | No crash or error reporting in the app or API. Production failures are invisible. |
| F22 | Med | static | Render free tier sleeps, so the first student of the morning waits for a cold start. |
| F23 | Low | static | `versionCode` is not incremented by the build script, so testers cannot tell builds apart. |

### UX and performance

| ID | Sev | Evidence | Finding |
|---|---|---|---|
| F24 | Med | reproduced | At 1280 px the feed and Today stretch edge to edge while Questions is capped at about 730 px. |
| F25 | Med | reproduced | At 320x640 the sticky bar and tab bar take about 24% of the height, and "Performance" truncates. "Who sees this?" sits below the topic list, so a teacher can activate without noticing it. |
| F26 | Med | reproduced | Web entry bundle is 3.9 MB with no route splitting, and teacher code ships to students. |
| F27 | Low | reproduced | A new student sees a streak of `0`. |

## 4. Status of older reviews

The stashed R3 reviews describe a state that has mostly been fixed. Do not work from them directly.

**Fixed, verified by reading code or running it:** schema check at boot and `/readyz`, body limits, rate-limit key,
malformed JSON and invalid date handling (reproduced), NUL rejection (reproduced), pool hardening, graceful shutdown,
indexes, route guards, signed-out redirects (reproduced), web fonts (reproduced), request timeout, 401 and forced
password handling, app identity and `allowBackup`, reduced motion on login, toast announcements, primary contrast,
self-study rollback, calendar refresh on focus.

**Still open:** CORS, session revocation, JWT or `getUser` caching, FK cascade hardening, past-date activation, list
pagination, `verify` scope, `seed` transaction, schema source of truth, secure storage, release keystore, feed
refresh on date change.

**Not re-checked:** the rest of the UX backlog in `UX-IMPROVEMENTS-R3.md` and `UI-ENHANCEMENT-PLAN.md`, and the 18
feature roadmap. Treat them as leads.

## 5. Stash inventory

| Stash | Contents | Verdict |
|---|---|---|
| `stash@{0}` | ADR 0002, two migrations, cohort and UI plans, three R3 reviews, 25 screenshots, and a **121 MB APK** | Land the docs and migrations (with the RLS fix). **Do not commit the APK.** |
| `stash@{1}` | Older gluestack UI work, plus `.aider*` cache files | Superseded by `main`. Safe to drop after a look. |
| `stash@{2}` | Older SRS and UI work | No exported symbol is missing from `main`. Safe to drop after a look. |

The stash check compared files and exported symbols. It would not catch a small behaviour tweak inside a function.

## 6. Limits of this review

- Mobile was tested through the **web build** only. No Android device, emulator or APK was run.
- Auth ran against the repo's mock GoTrue, so real Supabase session and RLS behaviour is untested.
- The `/qa-only` run used repo e2e suites plus `$B` and API probes. It did not follow the skill's per-probe
  checkpoint protocol, so this report is not a formal `/qa-only` artifact.
- The screenshots labelled 420 px were captured at 1280 px after the browser daemon restarted, so 420 px layout was
  not visually reviewed. 320 px and 1280 px were. The student e2e suite itself ran at 420 px.
- Kannada rendering on real phones was not verified.
- F1 to F3 need production access to confirm; their severity assumes the worst case until checked.
- F28 to F30 came from the Principal Engineer review and were confirmed by reading the code, not by running them.
