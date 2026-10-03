# Feature Improvement Plan: Competitor-Informed Roadmap

> **Status:** draft, ready for `/plan` review.
> **Inputs:** competitor research `~/.opencode/plan/feature_improvements.md` ("research doc" below,
> covering Quizlet, Knowt, Anki, Brainscape, Quizizz, Kahoot!, Duolingo and Gimkit), the
> existing PR-level plan [06-FEATURE-PLAN.md](../06-FEATURE-PLAN.md) ("06"), the
> [roadmap](../05-ROADMAP.md) V2 backlog, and the screen audit in [UI-PLAN.md](UI-PLAN.md).
> **What this doc does:** (1) reconciles every research idea with 06 without restating 06's PR specs,
> (2) adds the **new** ideas 06 does not cover, mostly around the offline self-study decks that
> shipped after 06 was written (`0c678eb`), and (3) proposes one phased order.

**AGENTS.md rules applied throughout:**

- **#3: a `core/` contract change is breaking for installed builds.** Every item states
  `Contract: none | additive | breaking`. Additive changes still need **DDL → API → app** deploy order (06 §0).
- **#1: the API is the only writer to business tables.** Anything that persists server-side goes
  through an `api/` route. Local SQLite (`mobile/src/lib/self-study-db.ts`) is device-only and is
  not a business table.
- **#5: authz from the token.** No feature here accepts `org_id`/`user_id` from the client.

Effort scale (same as 06 §0): **S** ≤ ~300 LOC · **M** ~300–800 · **L** 800+.

---

## 1. Reconciliation: research ideas vs 06 (already planned)

All 18 research features already map to a 06 PR. This table **does not duplicate** 06's scope, tests
or AC. It records the competitor, the user value, the dependency facts, and **any adjustment this plan
proposes**. "Adj." = a proposed amendment to 06 (see §5).

| # | Research feature | Inspired by | User value | 06 PR | Effort | Contract / DB | Status · Adj. |
|---|---|---|---|---|---|---|---|
| 1 | Streak freeze | Duolingo | Removes all-or-nothing streak anxiety | PR-04 | M | additive / DDL (`activity_days`) | Planned. **Adj.:** land 06 Q6 (IST day boundary) here *and* the client `localDay()` helper (UI-PLAN P1-5) together |
| 2 | Daily goal ring | Duolingo | Concrete, visible daily target | PR-03 | M–L (with XP) | additive / DDL (`student_settings`) | Planned. **Adj.:** ship a **v0 ring now** driven by existing `feed.progress.answered/total`, with no contract change and no DDL. PR-03 later swaps the source to `daily_goal` |
| 3 | XP + levels | Duolingo | Tangible progression | PR-03 | M–L | additive / DDL (`xp_ledger`) | Planned |
| 4 | Push notifications (mascot) | Duolingo | Biggest DAU driver | PR-06 | M | additive / DDL (`device_push_tokens`) | Planned. APK only; web push is out (06 Q8) |
| 5 | Achievement badges | Duolingo, Quizizz | Collection and long-term motivation | PR-05 | M | additive / DDL | Planned. **Adj.:** PR-05's profile screen = UI-PLAN P2-5. Build the shell once |
| 6 | Weekly leagues | Duolingo | Social competition, loss aversion | PR-07 | L | additive / DDL | Planned (HIGH risk) |
| 7 | More study modes (Review / Match / Practice Test) | Quizlet, Knowt | Variety, different goals | PR-08, PR-09, PR-13 | M–L total | additive / DDL (`practice_attempts`) | Planned. **Adj.:** add the **mode picker shell** (N8 below) |
| 8 | Question-level review of misses | Quizizz | Closes the learning loop | PR-08 | M–L | additive / DDL | Planned. UI slot reserved on summary/Done state (UI-PLAN §1.6) |
| 9 | Offline mode | Anki | Removes connectivity barrier | PR-11 | L | none / none | Planned. **Adj.:** the research doc §2 says "No offline mode", which is now outdated: **offline self-study decks exist**. PR-11 is about the *daily feed* queue only. Its `expo-network` hook is pulled forward into UI-PLAN P0-3 |
| 10 | Card-level SRS stats | Anki, Brainscape | Makes SRS visible and trusted | PR-12 | S–M | additive / none | Planned. **Adj.:** put the bucket rules (learning = rep<2, mature = interval≥21) in a pure `core/` module reused by **local** deck stats (N2) so both views agree |
| 11 | Streak calendar heatmap | Duolingo, GitHub | "Don't break the chain" | PR-10 | S | none (reads `activity_days`) | Planned |
| 12 | AI card generation (teacher) | Knowt, Quizlet | Cuts content-authoring cost | PR-14 | L | additive / DDL | Planned. Provider/budget is 06 Q1 |
| 13 | Pre-made content library | Quizlet, Knowt | Value beyond the daily set | PR-13 | M–L | additive / DDL | Planned. **Adj.:** PR-13 calls these "self-study sessions", which collides with the shipped local `(self-study)` group. Rename to **"Study packs"** in UI copy and routes |
| 14 | Live class mode | Kahoot!, Gimkit | Classroom energy | PR-15 | L | additive / DDL + Realtime | Planned |
| 15 | Class challenges | Quizizz | Peer accountability | PR-16 | M | additive / DDL | Planned |
| 16 | Meme/reaction feedback | Quizizz | Gen-Z engagement | PR-18 | S–M | additive / DDL | Planned (text+emoji only, 06 Q11) |
| 17 | Custom avatar | Duolingo, Gimkit | Personal investment | PR-18 | S–M | additive / DDL (column) | Planned |
| 18 | Student-facing analytics | Anki, Brainscape | Metacognition | PR-17 | M | additive / none | Planned |

Research §4 UI patterns:

| Pattern | Source | Disposition |
|---|---|---|
| Mode picker | Quizlet | **New → N8** (thin shell over PR-08/09/13) |
| Empty-state illustrations | Duolingo | **Covered by UI-PLAN P2-1** (no backend) |
| Streak heatmap, league ladder, live lobby, meme feedback | various | Already in 06 (PR-10, PR-07, PR-15, PR-18) |
| Confidence 1–5 rating | Brainscape | 06 §12 puts this **out of scope for the daily feed** because it changes the server SRS grade scale (needs an ADR and is a breaking-ish contract change). **New → N9** proposes it for *local* decks only, where SM-2 already takes 0–5 (`lib/sm2.ts:1`), at zero contract cost |
| Duolingo learning path | Duolingo | **Stays out of scope** (06 §12). It conflicts with the teacher-driven daily set, and the reels feed is the product |

---

## 2. New ideas (not in 06)

These come from (a) research-doc competitor mechanics that 06 did not turn into PRs, and (b) the
self-study feature that landed after 06 was written. Most of them are **local-first and need no
contract change**, so unlike nearly all of 06 they **do not wait on the org series (PR-01/02)**.

| ID | Feature | Inspired by | User value | Effort | Contract | DB / storage | Depends on |
|---|---|---|---|---|---|---|---|
| **N1** | **Self-study deck completeness.** Add/edit/delete cards, rename/delete decks, due-only review, lapse re-queue. This is UI-PLAN P0-5/P0-6/P1-6. | Anki, Quizlet | The shipped feature is unusable without it: decks only contain a seed card | M | none | **Local SQLite schema versioning** (`PRAGMA user_version` migrations in `lib/self-study-db.ts`) needed before any column change | none |
| **N2** | **Local deck stats + review history.** New/learning/mature/due counts, reviews per day, retention %, and a mini heatmap for self-study. | Anki, Brainscape | Makes the SRS trustworthy. Gives anonymous learners progress | S–M | none | Local: new `local_reviews(card_id, grade, reviewed_at)` table (migration via N1's versioning) | N1. Share bucket rules with 06 PR-12 via `core/` |
| **N3** | **"Save to my deck" from the feed.** One tap on a question card copies the question/answer (and, for MCQ, the correct option and explanation) into a chosen local deck. | Quizlet (save sets), Anki | Turns the teacher's daily set into personal long-term review. Bridges the two halves of the app | S | none (uses data already in `QuestionDto` / `SubmissionResponse`) | Local only | N1 |
| **N4** | **Deck import/export.** Paste CSV/TSV (`front,back`) or share a deck as a text file. `.apkg` later. | Anki, Quizlet, Knowt | Fast authoring. Teachers can hand out decks without a backend | S–M | none | Local only. Validate import with a Zod schema (AGENTS #2 spirit, client-side) and cap size | N1 |
| **N5** | **Teacher question-level item analysis.** Per-question accuracy, most-chosen wrong option, and flags for "probably bad question". Drill-down from a section in Performance. | Quizizz | Tells the teacher *what* to re-teach, and finds broken content | M | **additive** (new `GET /api/reports/questions?section_id=` response type) | None. Computed from `submissions` (index check on `(question_id)` per the performance skill) | 06 PR-02 (org scope on reports) |
| **N6** | **Per-student drill-down** for teachers: history, accuracy trend, streak and SRS load. | Quizizz, Brainscape (instructor dashboards) | Supports targeted intervention | M | **additive** (new endpoint) | None | PR-02. Pairs with UI-PLAN P2-6 |
| **N7** | **Self-study cloud backup/sync.** Signed-in users' local decks are backed up and restored across devices. | Anki (AnkiWeb sync) | No lost decks on a phone reset or swap | L | **additive** (new deck/card endpoints) | **DDL**: `student_decks`, `student_cards` + org_id + RLS (06 §0 pattern). Conflict policy needed. **Deck ids must become UUIDs** (today `deck-${Date.now()}`, `(self-study)/index.tsx:95`) | PR-02, PR-11 (reuse queue/replay design) |
| **N8** | **Study mode picker.** A Quizlet-style switcher on the student home: Today · Review mistakes · Practice test · Match · My decks. | Quizlet | One discoverable entry point once modes exist | S | none (routes only) | none | PR-08 (first mode). Vendor `tabs` (gluestack assessment §4) |
| **N9** | **Confidence 1–5 grading for local decks.** | Brainscape | More granular, less binary self-rating | S | none | none (SM-2 already accepts 0–5) | N1. The daily-feed version stays out of scope per 06 §12 |
| **N10** | **Learn mode for local decks.** Auto-generated MCQ from a deck, using other cards' backs as distractors, mixed with flip cards. | Knowt, Quizlet "Learn" | Recognition before recall. Variety | M | none | none | N1 (needs ≥4 cards) |
| **N11** | **Cloze cards** (`{{c1::…}}`) in local decks. | Anki | Better for definitions and formulae | S | none | none | N1 |
| **N12** | **Homework/assignments with due dates.** Teacher assigns a pack or sections with a deadline, separate from the daily set. | Quizizz, Gimkit (assignment mode) | Weekly structure beyond daily revision | L | **additive** | **DDL** (`assignments`, `assignment_items`) + org | PR-02, PR-13 (packs). Overlaps PR-16. **Post-pilot**; needs product decision |
| **N13** | **Team mode for live class.** | Kahoot!, Gimkit | Cooperative play that also includes weaker students | M | additive | DDL (`live_teams`) | 06 PR-15 |
| **N14** | **Student AI flashcards from own notes** into local decks. | Knowt | Makes deck creation effortless | M | **additive** (`POST /api/ai/cards`, rate-limited) | none server-side (output goes to local SQLite) | 06 PR-14 provider + 06 Q1 budget. Needs security review (prompt injection, cost abuse) |

**Considered and rejected for this roadmap:**

| Idea | Source | Why rejected |
|---|---|---|
| Hearts / lives | Duolingo | Penalizes wrong answers. Violates research-doc principle #2 "make failure feel safe" (also 06 §12) |
| Learning-path UI | Duolingo | Conflicts with teacher-activated daily set (06 §12) |
| LMS integrations (Google Classroom etc.) | Quizizz | L effort, OAuth plus a third-party data-sharing surface. No pilot demand. Revisit post-pilot |
| Community/public shared decks | Anki, Quizlet | Moderation and child-safety burden. 06 §12 already excludes it. N4 file sharing covers the classroom need |

Already in **05-ROADMAP V2** and deliberately not re-planned here: handwritten-work image upload (#1),
Kannada UI/content (#2), in-app question-bank admin (#7).

---

## 3. Phased ordering

06 §1 makes the **org series (PR-01/02) a hard prerequisite** for every server-backed feature. This
plan keeps that rule and adds a **Phase 0 local-first track** that can run *in parallel with* PR-01/02,
because it touches neither `core/` contracts nor business tables.

```
Phase 0  (now, ∥ 06 PR-01/02)   UI-PLAN P0  ·  N1  ·  goal-ring v0  ·  N3  ·  N9  ·  N11
Phase 1  (06 Milestone 1)       PR-01 → PR-02 → PR-03/04/05 (+ PR-06 ∥)  ·  N2  ·  N4
Phase 2  (06 Milestone 2)       PR-07 · PR-08 → N8 mode picker · PR-09 · PR-10  ·  N5 item analysis
Phase 3  (06 Milestone 3)       PR-11 · PR-12 (shared buckets w/ N2) · PR-13 "Study packs" · PR-14  ·  N6 · N10
Phase 4  (06 Milestone 4)       PR-15 (+ N13) · PR-16 · PR-17 · PR-18  ·  N7 sync
Post-pilot / needs decision     N12 assignments · N14 student AI · LMS
```

Ordering rationale:

1. **Phase 0 fixes what already shipped before adding more.** Self-study is live but incomplete
   (UI-PLAN §1.10–1.11), and the student "done" flow dead-ends (UI-PLAN P0-1). New engagement
   mechanics on top of a dead end would waste the retention gain.
2. **Local-first items don't wait on the org series.** That hides 06's longest dependency chain.
3. **N5 item analysis lands in Phase 2**, right after org scoping of reports (PR-02). It is the
   highest-value *teacher* feature and is cheap (read-only, no DDL).
4. **N7 sync waits for PR-11.** Both need the same replay/conflict thinking (06 §9.2), and doing it
   twice would be worse than waiting.
5. **Serialization hot spot.** `mobile/src/app/(student)/index.tsx` and `components/question-card.tsx`
   are touched by UI-PLAN UI-2, goal-ring v0, N3, PR-03, PR-04, PR-07 and PR-16. Land UI-2 first,
   then extend 06 §1's serialization chain with it.

---

## 4. Contract and DB change register (new items only)

| ID | `core/` contract | Server DDL | Local SQLite migration | Deploy order |
|---|---|---|---|---|
| N1, N3, N4, N9, N10, N11 | none | none | N1 introduces versioning. N4/N11 may add columns | app only |
| N2 | none | none | `local_reviews` table | app only |
| goal-ring v0 | none | none | none | app only |
| N5, N6 | additive (new response schemas) | none | none | API → app |
| N7 | additive (new request + response schemas) | 2 tables + RLS + org_id | id migration to UUID | DDL → API → app |
| N8 | none | none | none | app only |
| N12 | additive | 2+ tables + RLS | none | DDL → API → app |
| N13 | additive | 1 table + RLS | none | DDL → API → app |
| N14 | additive | none (maybe `ai_usage` for rate caps; share PR-14's) | none | API → app |

No item here proposes a **breaking** contract change. Anything that would (for example, confidence 1–5
on the server SRS) stays out of scope until it has an ADR.

---

## 5. Proposed amendments to 06 (for the 06 owner to accept or reject)

1. **PR-03:** split out a no-DDL **goal-ring v0** that renders from `feed.progress` today. PR-03 then only swaps the data source.
2. **PR-11:** note that the `expo-network` connectivity hook and offline banner ship earlier in UI-PLAN P0-3. PR-11 reuses them.
3. **PR-12:** move SRS bucket classification into a pure `core/` module so local deck stats (N2) and server stats agree.
4. **PR-13:** rename "self-study sessions" to **"Study packs"** to avoid colliding with the shipped local `(self-study)` route group.
5. **PR-05 / PR-12 / PR-18:** these all assume a `(student)/profile.tsx`. Build it once as UI-PLAN P2-5 and have the PRs extend it.
6. **Q6 (timezone):** extend the decision to the **client**. `participation.tsx:36`, `reports.tsx:26-34` and the self-study dates all use UTC `toISOString()` (UI-PLAN P1-5).
7. **§2 coverage note:** the research doc §2 "No offline mode" is stale. Update it to "offline self-study decks only; daily feed is online-only".

---

## 6. Top recommendations

| Rank | Recommendation | Why now | Effort | Contract |
|---|---|---|---|---|
| 1 | **Finish self-study (N1: card CRUD, due-only review, lapse re-queue) + "Save to my deck" (N3)** | The shipped feature is unusable beyond a seed card. N3 ties the teacher's daily content to long-term SRS, the Anki/Quizlet loop. | M + S | none |
| 2 | **Daily goal ring v0 → XP (06 PR-03)** | The cheapest visible progress win (Duolingo). v0 ships with zero backend while org work proceeds. | S, then M–L | none, then additive |
| 3 | **Streak freeze + IST date fix (06 PR-04 + Q6, client side too)** | Streaks are the app's main retention hook. Today a 00:30 IST answer counts as "yesterday". | M | additive |
| 4 | **Review-my-mistakes mode (06 PR-08) behind a mode picker (N8)** | Closes the learning loop (Quizizz). It is the foundation for Match and Practice Test. | M–L + S | additive |
| 5 | **Teacher item analysis (N5)** | The highest-leverage teacher insight (Quizizz). It is read-only and needs no DDL. It also surfaces bad questions in the bank. | M | additive |

Push reminders (06 PR-06) remain the top *DAU* lever, but they depend on PR-02, need an APK build and
exclude web. They are ranked just outside the top 5 because UI and data fixes have to land first for
reminders to bring users back to a working experience.

---

## 7. Open questions

1. Should self-study stay anonymous-capable (login → "Study offline") once N7 sync exists, or require sign-in for sync only? (Recommend: anonymous stays, and sync is opt-in when signed in.)
2. N3 copies teacher content into a student's device-local deck. Is that acceptable for content licensing and teacher expectations? (The content is already delivered to the device. Recommend yes, with attribution of the source section.)
3. N5: should item analysis be visible only to the teacher who activated, or to all teachers in the org? (Depends on 06 PR-02's teacher↔class model.)
4. N12 assignments vs 06 PR-16 class challenges: do we want both, or should challenges absorb due-dated assignments?
