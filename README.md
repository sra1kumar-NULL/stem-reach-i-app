# Daily Revision

A bite-sized daily revision app for students and teachers. Teachers pick the topics of the day;
students swipe through a reels-style vertical feed of MCQs and flashcards, build their own offline
self-study decks, and teachers track participation and performance — all in a bright, kid-friendly
UI. Fully white-label: no school-specific branding, so any school can adopt it.

## Features

**Students**
- Swipeable question feed (MCQ + flip-card recall) with animated feedback, streaks, a progress bar
  and a daily summary
- Spaced-repetition review: questions you got wrong or found hard come back when they are due
- Offline **self-study decks** stored on the device (SQLite) with SM-2 scheduling, kept per account
- Guided feed: next-card peek, answer-first with Skip, swipe cue and a 3-step first-run guide
- Profile: name, question language (English / Kannada / Both), change password, appearance, "How it works"

**Teachers**
- Author questions in the app: create, edit, archive/restore, delete (when unused), drafts, edit history with restore, near-duplicate warning, preview-as-student, symbol toolbar (², ₂, Ω, θ …), English + Kannada
- Manage chapters and topics, bulk import (CSV/TSV/JSON) and export
- Calendar: see what was added and activated each day, class participation by day, plan topics ahead, copy last week
- Activate today's topics, live participation board, per-student performance, leaderboard and reports
- Students: roster and teacher-set temporary passwords (student must choose a new one at next sign-in)

**Everyone**
- Self signup and sign-in (Supabase Auth); teacher signup needs an invite code
- Forgot password by email link, or ask a teacher to set a temporary password
- Nord theme with light/dark modes, Fredoka + Nunito fonts, toasts and friendly error screens

## Repository layout

An npm-workspaces TypeScript monorepo.

| Path | Role |
|---|---|
| `core/` | Contracts (Zod), Drizzle schema, content schemas, SRS maths — shared by api, mobile, scripts |
| `api/` | Node 22 + Hono + Zod + Drizzle HTTP API. The only writer to business tables |
| `mobile/` | Expo / React Native app — student feed + teacher dashboard + self-study, role-gated |
| `scripts/` | Seed / verify CLI for the question bank and user creation, plus `build-apk.sh` |
| `content/` | Version-controlled question bank JSON |
| `docs/` | PRD, HLD, LLD, roadmap, ADRs, plans and review reports |

Stack: Supabase (Postgres + Auth + RLS) · Hono · Drizzle · Zod · Expo Router · gluestack-ui + uniwind.

## Quickstart

Requires Node >= 22.6.

```bash
npm install
cp api/.env.example api/.env     # Supabase URL + keys + DB URL (use the pooler host)
cp mobile/.env.example mobile/.env
npm run seed                     # load content/*.json into the database
npm run dev:api                  # API on :3000
npm run dev:web                  # app in the browser (second terminal)
npm run dev:mobile               # Expo dev server: 'a' emulator · 'w' web · Expo Go QR on a phone
```

Demo accounts (dummy, for testing only): see [`dummy-creds.json`](dummy-creds.json).

### Environment variables

| Where | Variable | Purpose |
|---|---|---|
| `api/.env` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Supabase project |
| `api/.env` | `DATABASE_URL` | Postgres connection string (pooler host) |
| `api/.env` | `TEACHER_INVITE_CODE` | Code teachers must enter at signup. Unset = teacher signup disabled |
| `api/.env` | `PORT` | API port (default 3000) |
| `mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase client config |
| `mobile/.env` | `EXPO_PUBLIC_API_URL` | API base URL. Falls back to the Expo dev-server host, then `localhost` |

Never commit `.env` files. Only `.env.example` placeholders belong in the repo.

## Common commands

```bash
npm run typecheck        # all workspaces
npm test                 # core unit tests
npm run verify           # question bank integrity
npm run lint             # mobile ESLint
```

| Script (repo root) | What it does |
|---|---|
| `dev:api` | Start the API on :3000 |
| `dev:web` | Run the app in the browser |
| `dev:mobile` | Expo dev server (emulator / Expo Go / web) |
| `dev:android` | Build and run on a connected Android device or emulator |
| `build:apk` | Build a release APK into `dist/` |

## Testing

```bash
npm test                      # unit tests: core, api, scripts, mobile (no database)
# real Postgres, real routes and SQL (truncates all tables — use a scratch database):
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/stem npm test -w api
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, content verification, unit tests and the real-database suite.
Database changes ship as SQL in [`docs/migrations/`](docs/migrations/); see the rollout steps in [docs/DEPLOY.md](docs/DEPLOY.md).

## Building an Android APK

```bash
npm run build:apk        # same as scripts/build-apk.sh; needs JDK 17 + Android SDK; output in dist/daily-revision-<version>.apk
```

The APK talks to the hosted API set by `EXPO_PUBLIC_API_URL` (see `mobile/eas.json` for the EAS
`preview` / `production` profiles). See [docs/DEPLOY.md](docs/DEPLOY.md) for hosting the API, web
app and APK.

## Working with AI agents

The repo ships agents, skills and workflows for both tools, kept in sync:

| | OpenCode | Claude Code |
|---|---|---|
| Agents (Senior/Staff/Principal Engineer, Architect, Code/Security Reviewer, Test Engineer, Debugger) | `.opencode/agents/` | `.claude/agents/` |
| Skills (architecture, code-review, frontend, testing, security, performance) | `.opencode/skills/` | `.claude/skills/` (`code-review` is `repo-code-review`) |
| Workflows `/plan` `/review` `/fix-review` `/test` `/ship` | `.opencode/commands/` | `.claude/commands/` |

Rules for all agents and contributors live in [AGENTS.md](AGENTS.md) (entry point for Claude Code:
[CLAUDE.md](CLAUDE.md)). Highlights: the API is the only writer to business tables, every boundary is
validated with Zod, authorization comes from the verified token only, and a `core/` contract change
is a breaking change for installed apps.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — system shape, flows, stack
- [PRD](docs/01-PRD.md) · [HLD](docs/03-HLD.md) · [LLD](docs/04-LLD.md) · [Roadmap](docs/05-ROADMAP.md) · [Feature plan](docs/06-FEATURE-PLAN.md)
- [Deployment guide](docs/DEPLOY.md) · [ADRs](docs/ADR/)
- Plans: [Round 2 spec](docs/plans/ROUND2-API-SPEC.md) · [Teacher authoring](docs/plans/TEACHER-AUTHORING-PLAN.md) · [UI](docs/plans/UI-PLAN.md) · [Feature improvements](docs/plans/FEATURE-IMPROVEMENT-PLAN.md) · [Bug hunt](docs/plans/BUG-HUNT-PLAN.md)
- Reviews: [Audit 2026-10](docs/reviews/AUDIT-2026-10.md) · [Emulator QA](docs/reviews/EMULATOR-QA.md)

## Status

M1–M4 done: API (feed, submissions, reports, activations), mobile app (auth, role routing, student
feed, teacher dashboard) and offline self-study. **Next:** multi-tenant organizations — a teacher
picks subject → module → topic and activates revision for their own org only. See the
[roadmap](docs/05-ROADMAP.md) and [feature plan](docs/06-FEATURE-PLAN.md).
