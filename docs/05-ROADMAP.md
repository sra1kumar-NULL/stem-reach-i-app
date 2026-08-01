# Roadmap — Daily Revision App (Pilot)

Phased to match the PRD's prototyping roadmap. Each phase ends with something demoable and a go/no-go gate.

## M0 — Plan Freeze (done ✅)
- [x] PRD archived → `docs/01-PRD.md`
- [x] Curriculum extracted from Notion → syllabus table
- [x] HLD (`docs/03-HLD.md`) + LLD (`docs/04-LLD.md`)
- [x] HLD §7 decisions signed off (Node+TS · teacher-created accounts · empty state · 5 q/section)

## M1 — Foundation & Content (week 1)
- Create Supabase project; schema migrations (profiles, chapters, sections, questions, daily_sets, submissions, streaks)
- Auth: email/password + profiles trigger (role from signup metadata)
- Seed `content/ch12.json`: **2–3 sections of Ch.12, 10–15 MCQs + ~5 flashcards per section**, each with 1-sentence explanation
- `npm run seed` / `npm run verify`
- **Deliverable:** `psql`-queryable question bank; **gate:** verify passes, content reviewed by teacher

## M2 — API Service (week 2)
- `shared/` zod contracts; Hono server; auth middleware (JWT + role guard)
- Endpoints: `feed/today`, `submissions`, `me`, `syllabus`, `activations`, `reports/*`
- Scoring + streak logic (transactional)
- Unit tests on scoring/streak edge cases
- **Deliverable:** full API tested via HTTP; **gate:** all endpoint tests green

## M3 — Student App (week 3)
- Login/onboarding (credentials provided by teacher)
- Vertical feed (FlatList paging), MCQ card w/ instant feedback, flashcard card w/ self-eval
- Progress header + streak, end-of-session summary, empty state
- **Deliverable:** Expo Go testable on a real Android phone; **gate:** student user-story walkthrough passes on device

## M4 — Teacher App (week 4)
- Syllabus checklist → Activate Revision (A.1)
- Participation tracker (A.2) + performance reports (A.2)
- `scripts/create-students.ts` (bulk account creation for the class)
- **Deliverable:** teacher can run a full daily cycle end-to-end; **gate:** dry-run with teacher on 2–3 real sections

## M5 — Pilot (week 5–6)
- Provision all student accounts; 1-week live run at MES School, Lakkere
- Daily: teacher activates → students complete 5–10 min revision
- Collect feedback: engagement, question quality, UI issues, phone/network constraints
- Retro → freeze V2 backlog (below)

## V2 Backlog (post-pilot, priority order)
1. Image upload of handwritten working (Supabase Storage) + teacher review queue
2. Bilingual content/UI (Kannada toggle — module 11.vidyucchakti already signals demand)
3. Push reminders (when teacher activates / streak at risk)
4. Per-student daily-set freeze (mid-day activation consistency)
5. Spaced-repetition (SRS) scheduling instead of flat random sampling
6. Leaderboard (class-level, opt-in) + badges
7. Lightweight admin UI in app for question bank management (replace seed scripts)
