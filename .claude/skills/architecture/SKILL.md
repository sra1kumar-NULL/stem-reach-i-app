---
name: architecture
description: Use when designing or changing system structure for Daily Revision — service boundaries, data model, Drizzle schema, core/ contracts, multi-tenancy/org scoping, choosing a datastore or cache, writing or superseding an ADR, or deciding where a piece of logic belongs (mobile vs api vs core).
---

# Architecture

System design, boundaries, and data modelling for the Daily Revision app.

## Canonical documents

Read before designing anything, and update them after:

| Doc | Owns |
|---|---|
| `docs/01-PRD.md` | Product intent, users, curriculum scope |
| `docs/03-HLD.md` | System context, tech stack, data flows |
| `docs/04-LLD.md` | DB schema, API contract, screen specs |
| `docs/05-ROADMAP.md` | Milestones and gates |
| `docs/ARCHITECTURE.md` | Short orientation entry point |
| `docs/ADR/` | One file per decision |

Do not create a second source of truth. If `ARCHITECTURE.md` disagrees with the HLD, the HLD wins
and `ARCHITECTURE.md` gets fixed.

## Current system

```
Expo/React Native app (mobile/)
   student feed + teacher dashboard, role-gated
        │ HTTPS / JSON
        ▼
Node 20 + TS + Hono API (api/)  ← the only writer to business tables
   Zod at every boundary, Drizzle ORM, scoring + feed assembly + reports
        │ SQL
        ▼
Supabase (Postgres + Auth + RLS)  ← database of record
        ▲
Seed/verify CLI (scripts/) ← content/ question bank JSON
        ▲
core/ — contracts, Drizzle schema, content schemas (shared by api, mobile, scripts)
```

## Topics

### System design and boundaries

Ask first, in this order:

1. Whose job is this logic? If it is duplicated in `mobile/` and `api/`, one of them is wrong.
2. Is this a business rule? Business rules belong in the API, never in the client. The client
   renders; the API decides.
3. Does it need a new network hop? Only if the mobile app must survive the API being down, which
   it currently does not need to.
4. Does it change a `core/` contract? Then it is a breaking change for every consumer, including
   the app build already installed on student phones.

### Multi-tenancy

The next milestone is real: a teacher picks subject → module → topic and activates revision for
their own organization only. Design implications to get right now:

- Every business table needs an `org_id`, and every query needs it in the `WHERE` clause.
- Never accept an `org_id`, `user_id`, or owner field from the request body. Derive the caller's org
  from the verified token.
- Org scoping belongs in a shared query helper in `core/`, not repeated at each call site, so a new
  endpoint cannot forget it.
- Supabase RLS is defense-in-depth behind a privileged API role, not the primary control.

### Relational and NoSQL

This project is relational and should stay that way. Postgres handles the question bank, daily
sets, submissions, and reports in one transactional store.

Reach for something else only when you can name the requirement Postgres cannot meet:

- **Object storage** (Supabase Storage) for media — correct for images, wrong for questions.
- **Redis** only after a measured need appears (rate limiting, feed caching). Do not pre-build it.
- **A document store** for the question bank is a mistake — content questions have stable IDs,
  need referential integrity, and need to be joined to submissions.

### Caching and read paths

- The mobile app uses TanStack Query, so feed reads are already cached client-side.
- Do not add a server-side cache before the query cost is measured. Sample K per section with a
  seeded RNG keeps the read cheap.
- The feed is built from the latest snapshot for a date. Per-student set freezing is a known V2
  refinement, not something to solve pre-emptively.

## Writing an ADR

Create `docs/ADR/NNN-short-title.md`:

```md
# NNN — Title

Status: Proposed | Accepted | Superseded by NNN

## Context
What forced this decision. Constraints: scale, team size, budget, timeline.

## Decision
The choice, stated plainly.

## Consequences
What this makes easy, what it makes hard, and what it costs to reverse.
```

Mark an old ADR `Superseded by NNN` and link both. Never rewrite history.
