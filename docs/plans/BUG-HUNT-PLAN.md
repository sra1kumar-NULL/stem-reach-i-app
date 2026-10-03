# Bug-Hunt Plan — October 2026

Companion to [`docs/reviews/AUDIT-2026-10.md`](../reviews/AUDIT-2026-10.md). The audit lists the defects already found by reading the code. This plan sets out how to find the ones still hidden: what to suspect, which tests prove or rule out each suspicion, what tooling to add, the order of work, and when to stop.

Ground rules (AGENTS.md): no test is reported as passing unless it was run (paste command + output); no prod deploys; API stays the only writer; every new test dependency is a devDependency.

---

## 1. Tooling to add (Phase 0 — prerequisite, ~1 day)

| Tool | Where | Why |
|---|---|---|
| **Fix the gates first** | `mobile/` | `npm --prefix mobile ci` (installs `expo-sqlite`). Add a `pretypecheck` step that regenerates `.expo/types/router.d.ts` (it is written by the Expo CLI when typed routes are on, e.g. during `expo start`/`expo export`; find the cheapest non-interactive command that writes it, and do not commit the generated file) so `tsc` never sees stale routes. The gate must be green on a fresh clone. |
| **Vitest** | `core/`, `api/`, `scripts/` | Keep the existing `node:test` files running (vitest can't run them as-is; either migrate the 21 tests — trivial `test`/`assert` → `it`/`expect` — or keep `node --test` for core and use vitest for api). Recommendation: vitest everywhere, one config at root, `npm test` runs all workspaces. |
| **fast-check** | `core/` devDep | Property tests for SRS/SM-2, date helpers, completion math. |
| **Postgres for integration tests** | `api/` | `@testcontainers/postgresql` (Docker available locally) or `pg-mem` is **not** sufficient (needs `onConflict`, `filter`, `random()`, `::date`). Apply schema via `drizzle-kit push` against the container. Seed with a small fixture (2 chapters, 4 sections, mixed MCQ/flashcards, 1 teacher, 3 students). |
| **Auth stub for API tests** | `api/test/` | `createApp(ctx)` already takes an injected `AppContext` — pass a fake `supabase.auth.getUser(token)` mapping `"tok-student-1"` → user id. No network, no real Supabase. `serviceRole.auth.admin.createUser/deleteUser` stubbed for signup tests. |
| **Clock control** | `api/`, `core/` | `vi.useFakeTimers({ now })` + `TZ` env; prerequisite refactor: route code reads time via one `now()`/`schoolDate()` helper so tests can pin it (today `new Date()` is inlined in 9 places). |
| **Jest (jest-expo) + @testing-library/react-native** | `mobile/` | Only for logic that cannot move to `core` (hooks: `useAuth`, feed screen state). Prefer moving logic to `core` first. |
| **Maestro** | `mobile/.maestro/` | Black-box e2e on emulator `emulator-5554` (Android). YAML flows, `maestro test .maestro/`. Needs `testID`s on key controls (login inputs, Activate button, MCQ options, flip/grade buttons, summary score). |
| **CI** | `.github/workflows/ci.yml` | Jobs: install (root + mobile), typecheck, unit, verify, mobile lint, api integration (service container Postgres). Maestro job manual/nightly (emulator in CI is slow). |

---

## 2. Hypotheses and the tests that settle them

Each row: **H** = hypothesis (suspected bug), **Test** = concrete case, **Type** = U (unit), P (property), I (API integration), E (Maestro e2e). "Known" = already confirmed in the audit, so the test is a regression test that should fail now and pass after the fix.

### 2.1 `core/srs.ts` (server SM-2)

| ID | H | Test | Type |
|---|---|---|---|
| SRS-1 (known, audit M9) | `hard` never grows the interval | `hard`×N from INITIAL → intervals strictly non-decreasing and > 1 after ≥2 hards | U |
| SRS-2 | Invariants hold for any grade sequence | For random sequences (len ≤ 50): `MIN_EASE ≤ ease ≤ MAX_EASE`; `0 ≤ intervalDays ≤ 180`; integer interval; `again` ⇒ reps 0; passing grade ⇒ reps+1 | P |
| SRS-3 | Monotonicity: for the same state, `again ≤ hard ≤ good ≤ easy` interval | fast-check over arbitrary valid states | P |
| SRS-4 | Ease round-trip through DB scaling (×100 int) drifts | `applyGrade(fromDb(toDb(s)))` vs `applyGrade(s)` over 1000 steps — interval difference ≤ 1 day | P |
| SRS-5 (known) | NaN/negative/Infinity state poisons output | `applyGrade({ease:NaN,…})`, `intervalDays:-5`, `repetitions:-1` → finite, clamped output | U |
| SRS-6 | `dueDateFor` breaks on leap years / DST-free but non-integer interval | `2028-02-28 +1 → 2028-02-29`, `+366`, interval `0`, `180`; property: `dueDateFor(d, n)` minus `d` == n days | U/P |
| SRS-7 | `isLearned` disagrees with the SQL in `me.ts:56` / `reports.ts:158` | Generate states, compare `isLearned` to the SQL predicate replicated in TS (or better: run the SQL against the test DB) | P/I |

### 2.2 `mobile/src/lib/sm2.ts` + self-study (local SM-2)

| ID | H | Test | Type |
|---|---|---|---|
| SM2-1 (known, M1) | `due_date` off by one before 05:30 IST | Run with `TZ=Asia/Kolkata`, clock `02:00` → interval 1 must give tomorrow's local date | U (after moving to core) |
| SM2-2 (known, M10) | "Hard" (grade 2) resets the card | grade 2 on a rep-3 card keeps reps>0 | U |
| SM2-3 | EF formula drifts below 1.3 or above sensible max over long sequences | property: `ease_factor ≥ 1.3`; with grade 5 forever, ease bounded (it is currently **unbounded** upward) | P |
| SM2-4 | Interval explodes (no cap, unlike core's 180) | grade 5 ×20 → interval ≤ cap | P |
| SM2-5 (known) | Review shows non-due cards | E: create deck, grade starter card Good, back, reopen deck → expect "All caught up", not the card | E |
| SM2-6 | Deck due-count uses UTC while due_date uses local+UTC mix | E/U: seed card due "today local" at 01:00 IST → list shows 1 due | U |

**Decision to take before writing these:** port self-study to `core/srs.ts` (audit M10). If done, SM2-* collapse into SRS-* plus a local-date adapter test.

### 2.3 Date / timezone ("today")

| ID | H | Test | Type |
|---|---|---|---|
| TZ-1 (known, M1) | Feed resolves yesterday's set between 00:00–05:30 IST | Activate set for `2026-10-04`; pin clock `2026-10-04T00:30+05:30` → `GET /feed/today` returns that set | I |
| TZ-2 | Streak increments wrongly across the IST/UTC boundary | Submit at `2026-10-03T22:00+05:30` and `2026-10-04T01:00+05:30` → streak `2`, `last_active_date` `2026-10-04` | I |
| TZ-3 | Teacher activating at 05:00 IST activates the wrong date | `POST /activations` without date at `05:00 IST` → `date` = IST date | I |
| TZ-4 | Performance "Today" window misses early-morning answers | Answer at 01:00 IST, request `from=to=<IST today>` → included | I |
| TZ-5 | `me.srs.due_tomorrow` computed with UTC "tomorrow" | due on IST tomorrow, clock 01:00 IST → counted | I |

### 2.4 Feed selection (`GET /api/feed/today`)

| ID | H | Test | Type |
|---|---|---|---|
| FEED-1 | Total = Σ min(5, enabled) per section and is stable across calls | 3 sections with 2/5/9 enabled questions → total 12, identical on 3 calls | I |
| FEED-2 | No question appears twice in one response | property over random fixtures (sizes, prior submissions, review states) | I (looped) |
| FEED-3 | Disabled questions never served (new, MCQ top-up, or review) | disable a question with a due review_state → absent | I |
| FEED-4 | Reviews from non-activated sections are never served (current behaviour — audit M2). Write the test for the **decided** behaviour. | due review in section B, activate only A | I |
| FEED-5 | Completion: answering every served item eventually yields `completed:true` and never strands the student with `completed:false` + 0 questions | loop: GET → answer all → GET until completed (max 10 iterations), assert termination and that `questions.length===0 ⇔ completed` | I |
| FEED-6 | `progress.completed` (feed) vs `SubmissionResponse.progress.completed` vs participation `completed` disagree (audit C4) | same state, call all three, assert agreement once the definition is centralised | I |
| FEED-7 | MAX_QUEUE respected; reviews first, oldest due first | 40 due reviews → 30 served, sorted by due_date | I |
| FEED-8 | New-card starvation with review backlog | 5 due reviews in a 5-cap section → 0 new cards (document whether intended) | I |
| FEED-9 | Teacher changes sections mid-day: answered counts only current sections, no 500 | activate A,B; answer 3 in A; re-activate B,C → answered=0, B/C served | I |
| FEED-10 | MCQ `correct_option` / explanation never leak in the feed payload | assert keys of each question ⊆ QuestionDto keys; `FeedResponse.strict().parse(body)` | I |
| FEED-11 | Empty states: no set / set with 0 sections / sections with 0 enabled questions → `empty:true` and valid schema | three cases | I |
| FEED-12 | Teacher calling student routes → 403; unauthenticated → 401 | role matrix test over **every** route | I |

### 2.5 Submissions & idempotency (`POST /api/submissions`)

| ID | H | Test | Type |
|---|---|---|---|
| SUB-1 (known, M4) | Concurrent identical POSTs → one 500 | `Promise.all` ×5 identical → all 200, same `is_correct`, exactly 1 row, streak +1 once, review_state advanced once | I |
| SUB-2 | Replay with a *different* answer returns the original grade, writes nothing | answer option 0 (wrong) then option 2 (right) → second response `is_correct:false`, row unchanged | I |
| SUB-3 | Grading: `is_correct` iff `selected_option === correct_option`, for all 4 options | table test | I |
| SUB-4 | Type mismatch → 400 (MCQ with `self_eval`, flashcard with `selected_option`, both, neither, option 4, option -1) | table test | I |
| SUB-5 (known, M5) | Past/future set accepted | submit to yesterday's set → 4xx after fix | I |
| SUB-6 | Question outside set → 400; unknown question/set → 404; malformed JSON → 400 (not 500) | table test incl. `body: "not json"` | I |
| SUB-7 | Transaction atomicity: a failing streak/SRS write leaves no submission row | inject failure (drop `streaks` table in a test schema or stub tx) → retry re-grades | I |
| SUB-8 | Disabled question can still be submitted | disable then submit → expect 4xx after fix | I |
| SUB-9 | Legacy grades (`got_it`, `need_practice`) still accepted and mapped (installed builds) | both → 200; SRS mapping good/again | I |
| SUB-10 (known, M12) | `hard` → `is_correct:false` but SRS pass | assert the decided mapping in one place | U/I |

### 2.6 Streaks

| ID | H | Test | Type |
|---|---|---|---|
| STR-1 | first ever → 1/1; same day → unchanged; next day → +1; gap → 1, best kept | sequence with pinned clock (extract a pure `nextStreak(prev, today)` into `core` and unit-test it, keep the SQL CASE in sync via an I test) | U + I |
| STR-2 (known, M3) | `/me` shows a stale streak after a gap | last_active 5 days ago → `/me.streak.current === 0` after fix | I |
| STR-3 | Concurrent first submissions on two different questions → streak 1, not 2 | `Promise.all` two different questions, fresh student | I |
| STR-4 | Streak only from *today's* set activity (after SUB-5 fix) | old-set submission doesn't touch streak | I |

### 2.7 Activations

| ID | H | Test | Type |
|---|---|---|---|
| ACT-1 (known, M6) | Duplicate ids wipe today's sections | POST `[A, A]` → 400 (or dedup), previous sections intact | I |
| ACT-2 (known) | Unknown section id → 500 after delete | POST `[A, <random uuid>]` → 400, previous sections intact | I |
| ACT-3 | Invalid dates (`2026-02-30`, `2026-13-01`) → 400 on POST and GET | | I |
| ACT-4 | Concurrent activations by two teachers converge to one of the two inputs, never a union/empty | `Promise.all` two POSTs with disjoint sets, assert final == one of them | I |
| ACT-5 | Student → 403 | | I |

### 2.8 Reports

| ID | H | Test | Type |
|---|---|---|---|
| REP-1 | Participation `answered` counts distinct questions in current sections only, `completed` matches feed | fixture with de-selected section answers | I |
| REP-2 | Performance accuracy is a number in [0,1] (no numeric strings) for all three endpoints incl. `/me` (known M8) | `PerformanceReport.parse`, `MeResponse.parse` on real responses | I |
| REP-3 | Date window boundaries inclusive of `to` day (and IST — TZ-4) | answers at 23:59 and 00:00 | I |
| REP-4 | `section_id` filter applies to both per_section and per_student; invalid uuid → 400 | | I |
| REP-5 | Empty DB → zeros, not NaN/null | | I |
| REP-6 | `class_section` filter: SQL-ish strings, very long strings, unicode → 400 or safe result | after adding Zod | I |

### 2.9 Auth & security

| ID | H | Test | Type |
|---|---|---|---|
| SEC-1 (known, B1) | Public signup as teacher | `POST /auth/signup {role:"teacher"}` → rejected / forced student | I |
| SEC-2 | Signup partial failure: profile insert fails → auth user deleted | stub insert to throw, assert `deleteUser` called | I |
| SEC-3 | Signup error messages don't enumerate accounts | duplicate email → generic message | I |
| SEC-4 | Every route except `/healthz`, `/auth/signup` → 401 without/with bad bearer, and profile-less user → 401 | route-table test generated from `app.routes` | I |
| SEC-5 | No route accepts owner/org/user ids from body/query (AGENTS #5) | grep-based lint test: route files don't read `user_id|student_id|created_by|org_id` from `req` | U (static) |
| SEC-6 (known, B2) | `DELETE /questions/:id` works for owner, 403 for other teacher, 403 for seed row, 409 with submissions/review_states | | I |
| SEC-7 | RLS: with the **anon** key, PostgREST `select`/`insert` on every business table is denied | script `scripts/src/rls-probe.ts` run against a **staging** project (never prod), listing table → allowed/denied | I (manual) |
| SEC-8 | Rate limit on signup/submissions (after adding) | 20 signups/min from one IP → 429 | I |

### 2.10 Content & scripts

| ID | H | Test | Type |
|---|---|---|---|
| CON-1 | `verify` covers every `content/*.json` | run with 2 files, one invalid → exit 1 | U |
| CON-2 | Seed is idempotent: run twice → 0 inserted, N updated, same ids | I (test DB) |
| CON-3 | Seed with a section conflict → no `row.id` TypeError | I |
| CON-4 | MCQ with duplicate options / correct pointing at a duplicate → verify fails | U |

### 2.11 Mobile e2e (Maestro on `emulator-5554`)

Preconditions: API running locally against the test DB fixture (`EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`), dev build installed (`npx expo run:android`), `testID`s added. Each flow resets state via a `scripts/src/e2e-reset.ts` (truncate submissions/streaks/review_states/daily_sets; recreate fixture users) invoked from a Maestro `runScript` or a pre-step.

| Flow | Steps | Assertions | Catches |
|---|---|---|---|
| E1 `teacher-activate.yaml` | login teacher → select 2 sections → Activate → confirm | toast with today's (IST) date and counts; re-open shows sections preselected | TZ-3, C5 |
| E2 `student-daily-loop.yaml` | login student → answer every card (MCQ tap option; flashcard flip → Good) | progress pill increments, summary shows `correct/attempted` equal to what was tapped, streak = 1 | M7, FEED-5 |
| E3 `student-reopen-after-complete.yaml` | kill app after E2 → relaunch | summary does **not** show `0/N 0%`; streak correct | M7 (known) |
| E4 `double-tap-submit.yaml` | rapid double tap on an MCQ option; airplane-mode toggle mid-submit | no error state, single answer recorded (verify via API) | M4, S5 |
| E5 `participation.yaml` | after E2, teacher → Participation | student shown done/completed; others pending | REP-1, C4 |
| E6 `no-activation-empty.yaml` | no set → student login | empty state + Refresh; streak shown is decayed | M3 |
| E7 `self-study.yaml` | logged out → "Study offline" → New Deck → review starter → Good → back → reopen | due badge 0, "All caught up" on reopen | M10, SM2-5 |
| E8 `signup-role.yaml` | signup screen | teacher option absent / blocked | B1 |
| E9 `role-deeplink.yaml` | student deep-links `mobile://(teacher)` | redirected to student home | S6 |
| E10 `signout-offline.yaml` | airplane mode → sign out | lands on login within 5 s; relaunch stays logged out | auth.tsx signOut path |
| E11 `release-config.yaml` (manual) | install EAS preview APK on emulator | login succeeds (API reachable, not localhost) | B3 |

Timezone e2e: set emulator TZ (`adb shell setprop persist.sys.timezone Asia/Kolkata`) and time near 00:30 for TZ-1/SM2-1 smoke.

---

## 3. Order of execution

1. **Phase 0 — gates (day 1).** Reinstall mobile deps, fix typed-route generation, add CI with typecheck/test/verify/lint. Exit: all four gates green on a fresh clone in CI.
2. **Phase 1 — pure logic (day 2).** Vitest + fast-check in `core`. Extract `schoolDate`, `nextStreak`, `isCompleted`, `selfEvalToSrs` into `core`. Write SRS-1…7, SM2-*, STR-1 (unit), TZ helpers. Fast, no infra; finds math bugs first.
3. **Phase 2 — API integration harness (days 3–4).** Testcontainers Postgres + auth stub + clock injection. Start with the **known** regressions so fixes have a red test: SEC-1, SEC-6 (B2), SUB-1, ACT-1/2, REP-2, STR-2, TZ-1. Then the exploratory hypotheses: FEED-*, SUB-*, ACT-*, REP-*, SEC-4/5.
4. **Phase 3 — security probes (day 5).** SEC-7 RLS probe against a staging Supabase project; rate-limit tests after limiter lands; decide demo-account policy.
5. **Phase 4 — mobile e2e (days 5–7).** Add `testID`s, Maestro flows E1–E10 on `emulator-5554`; E11 manually against an EAS preview build once B3 is fixed.
6. **Phase 5 — triage loop.** Every failing test → issue with repro + severity; blockers fixed before new features (feature plan PR-01 waits on B1/B4).

Run order inside CI: lint → typecheck → unit (core) → verify → api integration → (nightly) Maestro.

---

## 4. Exit criteria

- `npm run typecheck`, `npm test` (all workspaces), `npm run verify`, `npm --prefix mobile run lint` green in CI on a fresh clone; outputs pasted in the PR.
- Every audit item marked *known* has a regression test that failed before its fix and passes after.
- Integration suite covers **every** route × {happy path, 400, 401, 403, 404/409 where applicable} — route table enumerated from `createApp` so a new route without tests fails a meta-test.
- Property tests: ≥1,000 runs each for SRS-2/3/4 and SM2-3/4 with no counterexample.
- Concurrency tests SUB-1, STR-3, ACT-4 pass 50 consecutive runs (no flakes).
- Timezone tests pass with `TZ=UTC` and `TZ=Asia/Kolkata` on the runner.
- Maestro E1–E10 pass twice in a row on `emulator-5554`; E11 passes on the preview APK.
- RLS probe report committed (table → anon access) with every business table denied.
- Zero open blockers; remaining majors have owners and issues.

---

## 5. Out of scope

Load/performance testing (see `performance` skill; worth a later pass on `/feed/today`, which runs 8 queries and a `random()` sort over the full pool per call), iOS, multi-org behaviour (no `org_id` yet — tests in FEED-12/SEC-4 should be extended when PR-01 lands).
