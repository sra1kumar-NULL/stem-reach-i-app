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
- Offline **self-study decks** stored on the device (SQLite) with SM-2 scheduling

**Teachers**
- Activate today's topics (subject → module → topic)
- Live participation board
- Per-student performance, leaderboard and reports

**Everyone**
- Self signup and sign-in (Supabase Auth); teacher signup needs an invite code
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
cd mobile && npm run dev         # 'a' emulator · 'w' web · Expo Go QR on a phone
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
cd mobile && npm run lint
```

## Building an Android APK

```bash
scripts/build-apk.sh     # needs JDK 17 + Android SDK; output in dist/daily-revision-<version>.apk
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
- Plans: [UI](docs/plans/UI-PLAN.md) · [Feature improvements](docs/plans/FEATURE-IMPROVEMENT-PLAN.md) · [Bug hunt](docs/plans/BUG-HUNT-PLAN.md)
- Reviews: [Audit 2026-10](docs/reviews/AUDIT-2026-10.md) · [Emulator QA](docs/reviews/EMULATOR-QA.md)

## Status

M1–M4 done: API (feed, submissions, reports, activations), mobile app (auth, role routing, student
feed, teacher dashboard) and offline self-study. **Next:** multi-tenant organizations — a teacher
picks subject → module → topic and activates revision for their own org only. See the
[roadmap](docs/05-ROADMAP.md) and [feature plan](docs/06-FEATURE-PLAN.md).
