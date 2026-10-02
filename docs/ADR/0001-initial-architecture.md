# 0001 — Initial architecture

Status: **Accepted** · Date: 2026-09-30 · Supersedes: nothing · Superseded by: nothing

## Context

We needed a working architecture for the Daily Revision app: a white-label daily revision product
for students and teachers, to be piloted in real classrooms with a small team and no dedicated
infrastructure budget.

The constraints that actually drove the decision:

- **Two audiences, one product.** Students need a swipeable feed; teachers need a dashboard and
  reports. Shipping two apps doubles the maintenance surface for a small team.
- **Real student data.** Minors, per-student performance, teacher accounts. Privacy and
  authorization are requirements, not later hardening.
- **Devices we do not control.** Students will be on a mix of Android hardware, some old. A
  Play-Store-grade native build is a distribution problem, not just an engineering one.
- **One free tier, no ops team.** Zero-cost hosting was a hard requirement for the pilot.
- **Small team.** Every additional language or toolchain has a real sync cost.

## Decision

- **One codebase in TypeScript.** Expo / React Native for `mobile/`, Node 20 + Hono + Zod +
  Drizzle for `api/`, npm workspaces with `core/` holding the shared contracts, Drizzle schema,
  and content schemas.
- **One mobile app with role-gated experiences**, not separate student and teacher apps. Role comes
  from the verified session.
- **Supabase Postgres as the database of record**, with Supabase Auth as the identity provider and
  RLS enabled as defense-in-depth behind the API's privileged role.
- **The API is the only writer to business tables.** All SQL through Drizzle; Zod validation at
  every boundary.
- **Version-controlled question bank** in `content/`, loaded into the DB by a seed CLI and checked
  by a verify CLI.
- **Zero-cost hosting**: Render or Fly.io free tier for the API, Supabase cloud free tier for the
  database.

### Explicitly rejected

- **Microservices.** A modular monolith in one repository. Splitting services would add network
  hops, distributed transactions, and deployment complexity with no scale benefit at classroom
  size. Revisit only if a component needs independent scaling or a separate release cadence.
- **Docker as the deployment primitive.** Containers run fine on the free tiers, but they add a
  build-and-push step to a single-service deployment for no operational gain here. Revisit if the
  API grows a second process or the deployment target requires it.
- **A NoSQL store for the question bank.** Questions have stable IDs, need referential integrity,
  and are joined to submissions and reports. Postgres handles all of it transactionally. Supabase
  Storage is used for media later; that is object storage, not a replacement for the database.
- **Go for the API.** Excellent language, but it would add a second language and a type-sync tax
  across the monorepo for no measurable benefit. Revisit if the API becomes compute-bound.
- **Separate teacher tooling.** A web dashboard for teachers would be a second front end to build,
  secure, and keep in sync. One app first.

## Consequences

**Easier**

- One language, one type system, one install, one `npm run typecheck`.
- Sharing schemas between client, server, and CLI is free — `core/` is imported, not duplicated.
- Shipping to real student phones without a store review, via Expo Go.
- Reversible: this is a plain modular monolith, so any layer can be extracted later without a
  rewrite.

**Harder**

- One app means one release train for two audiences. A student-facing regression ships to teachers
  too.
- A modular monolith puts a scaling limit on the API as a whole. Fine at classroom scale; it is the
  first thing to break if one school district goes viral.
- Single-language TypeScript means the team has no fallback in a second ecosystem.

**Costs to reverse**

- Extracting a service later is a real project, but bounded: `core/` already marks the contract
  boundaries.
- Swapping Postgres means reimplementing the query layer, the schema, and the seed tooling.

## Follow-ups

- Multi-tenant organizations are the next milestone. It will need its own ADR. The consequence for
  this decision is that every business table gains `org_id` and every query gains org scoping
  derived from the verified token.
- Per-student set freezing for mid-day activation is a known V2 refinement, not a defect.
