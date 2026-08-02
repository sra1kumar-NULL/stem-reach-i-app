# Daily Revision App (STEMRI · MES School Lakkere)

Bite-sized daily revision for Class 10 Science — reels-style vertical feed of MCQs and flashcards, driven by the teacher's daily topic activation.

**Docs (start here):**
- [PRD](docs/01-PRD.md) — product intent + curriculum
- [HLD](docs/03-HLD.md) — architecture, flows, decisions
- [LLD](docs/04-LLD.md) — schema, API contract, screens
- [Roadmap](docs/05-ROADMAP.md) — milestones & gates

**Stack:** Expo/React Native (mobile) · Node+TS, Hono, Drizzle, Zod (API) · Supabase (Postgres + Auth + Storage)

## Workspaces

| Package | What |
|---|---|
| `mobile/` | Expo RN app (student feed + teacher dashboard) |
| `api/` | HTTP API — feed, submissions, activations, reports |
| `core/` | Contracts, DB schema & content schemas — shared by api, mobile, scripts |
| `scripts/` | seed/verify CLI for the question bank |
| `content/` | Version-controlled question bank JSON |

## Quickstart

```bash
npm install
cp api/.env.example api/.env      # fill Supabase URL + keys + DB URL
npm run seed                       # load content/ch12.json into the DB
npm run dev:api                    # start API on :3000
```

```bash
cd mobile && npx expo start        # app: 'a' emulator · 'w' web · Expo Go QR on phone
```

## Roadmap status

See [docs/05-ROADMAP.md](docs/05-ROADMAP.md). Currently: **M1 done — M2 (API implementation) next**.
