# Architecture

Short orientation entry point. The detailed design lives in `03-HLD.md` and `04-LLD.md` — where this
page and those disagree, those win and this page is the thing to fix.

## What it is

A bite-sized daily revision app. Teachers pick the day's topics; students swipe a reels-style
vertical feed of MCQs and flashcards; teachers track participation and performance. Fully
white-label.

## Shape

```
┌──────────────────────┐  HTTPS/JSON  ┌────────────────────┐   SQL    ┌────────────────────────┐
│  Mobile app          │ ───────────► │  API service       │ ───────► │  Supabase              │
│  Expo / React Native │ ◄─────────── │  Node + Hono       │ ◄─────── │  • Postgres + RLS      │
│                      │              │  Zod · Drizzle     │  supabase │  • Auth                │
│  • student feed      │              │                    │  -js      │  • Storage (V2)        │
│  • teacher dashboard │              │  the only writer   │          └────────────────────────┘
└──────────────────────┘              │  to business tables │                    ▲
                                      └────────────────────┘                    │
                                              ▲                               │
                                              └──────── seed / verify CLI ─────┘
                                                          ▲
                                                    content/ question bank

                          core/ — contracts, DB schema, content schemas
                          shared by api, mobile, and scripts
```

## The four players

1. **Mobile app** (`mobile/`) — one app, two role experiences. Talks only to the API.
2. **API service** (`api/`) — the only writer to business tables. Owns scoring, feed assembly,
   and reports. Delegates identity to Supabase Auth.
3. **Supabase** — database of record. RLS is defense-in-depth behind the API's privileged role.
4. **Seed/verify CLI** (`scripts/`) — loads the question bank from version-controlled JSON.

## Core flows

- **Daily activation** — teacher posts a date and its sections; the API upserts one `daily_set` per
  date and replaces the section snapshot. Idempotent.
- **Student feed** — read path. Resolve today's set, sample K questions per section, mark
  already-answered questions, compute progress. No writes.
- **Submission & scoring** — the API decides correctness. The client only renders the result.
- **Reports** — per-student performance and the teacher's participation board and leaderboard.

## Stack

| Layer | Choice |
|---|---|
| Mobile | Expo (React Native) + TypeScript, TanStack Query + Zustand |
| API | Node 20 + TypeScript, Hono, Zod, Drizzle ORM |
| Database | Supabase Postgres + Auth + RLS |
| Data fetching | TanStack Query (cache) + Zustand (minimal local state) |
| Hosting | Render or Fly.io free tier for the API; Supabase cloud free tier |
| Design system | Nord palette, Fredoka headings, Nunito body |

Deliberately one language across the whole monorepo. See `ADR/0001-initial-architecture`.

## Workspace map

| Package | Owns |
|---|---|
| `core/` | Zod contracts, Drizzle schema, content schemas. Changing these is breaking. |
| `api/` | Hono routes, auth middleware, business logic, queries. |
| `mobile/` | Screens, navigation, role routing, the feed, the dashboard. |
| `scripts/` | `npm run seed`, `npm run verify`, user creation. |
| `content/` | The question bank, in version control. |

## Current status

M1–M4 shipped: API (feed, submissions, reports, activations) and the mobile app (auth, role
routing, student feed, teacher dashboard). **Next:** multi-tenant organizations — a teacher picks
subject → module → topic and activates revision for their own org only.

That milestone's architectural consequence is the one to watch: every business table needs `org_id`,
every query needs it scoped, and org scope must be derived from the verified token, never from a
client-supplied field.

## Decisions

Architecture Decision Records are in [`ADR/`](./ADR/). One file per decision, each with Context,
Decision, Consequences, and Status. Supersede records rather than rewriting them.
