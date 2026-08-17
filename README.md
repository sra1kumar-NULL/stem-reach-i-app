# Daily Revision

A bite-sized daily revision app for students and teachers. Teachers pick the topics
of the day; students swipe through a reels-style vertical feed of MCQs and flashcards,
and teachers track participation and performance — all in a bright, kid-friendly UI.

Fully white-label: no school-specific branding anywhere, so any school can adopt it.

**Docs (start here):**
- [Deployment guide](DEPLOY.md) — how to host the API + web app + Android APK
- [PRD](docs/01-PRD.md) — product intent + curriculum
- [HLD](docs/03-HLD.md) — architecture, flows, decisions
- [LLD](docs/04-LLD.md) — schema, API contract, screens
- [Roadmap](docs/05-ROADMAP.md) — milestones & gates

**Stack:** Expo/React Native (mobile) · Node+TS, Hono, Drizzle, Zod (API) · Supabase (Postgres + Auth) · [Nord theme](https://www.nordtheme.com) with Fredoka + Nunito fonts

## Features

- **Self signup** — students and teachers create their own accounts in the app
- **Student app** — swipeable question feed (MCQ + flip-card recall), animated feedback, streaks, progress bar, daily summary
- **Teacher app** — activate today's topics, live participation board, per-student performance with leaderboard
- **Kid-friendly UI** — Nord palette, rounded Fredoka headings, spring animations, toast notifications, friendly error screens

## Workspaces

| Package | What |
|---|---|
| `mobile/` | Expo RN app (student feed + teacher dashboard) |
| `api/` | HTTP API — auth, feed, submissions, activations, reports |
| `core/` | Contracts, DB schema & content schemas — shared by api, mobile, scripts |
| `scripts/` | seed/verify CLI for the question bank + user creation |
| `content/` | Version-controlled question bank JSON |

## Quickstart

```bash
npm install
cp api/.env.example api/.env      # fill Supabase URL + keys + DB URL (use the pooler host)
npm run seed                       # load content/ch12.json into the DB
npm run dev:api                    # start API on :3000
```

```bash
cd mobile && npm run dev           # app: 'a' emulator · 'w' web · Expo Go QR on phone
```

Demo accounts (dummy, for testing only): see [`dummy-creds.json`](dummy-creds.json).

## Roadmap status

M1–M4 done: API (feed, submissions, reports, activations) + mobile app (auth, role routing,
student feed, teacher dashboard). **Next:** multi-tenant organizations — teacher picks a
subject → module → topic and activates revision for their own org only.