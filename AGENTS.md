# AGENTS.md

Project instructions for OpenCode in the **Daily Revision** repo. Read this before working here.

## What this repo is

An npm-workspaces TypeScript monorepo.

| Path | Role |
|---|---|
| `core/` | Contracts, Drizzle schema, content schemas — shared by `api`, `mobile`, `scripts` |
| `api/` | Node 20 + Hono + Zod + Drizzle HTTP API. The only writer to business tables. |
| `mobile/` | Expo / React Native app — student feed + teacher dashboard, role-gated |
| `scripts/` | Seed and verify CLI for the question bank and user creation |
| `content/` | Version-controlled question bank JSON |

Stack: Supabase (Postgres + Auth + RLS) as the database of record. Nord theme, Fredoka + Nunito
fonts.

Design docs: `docs/01-PRD.md`, `docs/03-HLD.md`, `docs/04-LLD.md`, `docs/05-ROADMAP.md`,
`docs/ARCHITECTURE.md`, `docs/ADR/`.

## Non-negotiables

1. **The API is the only writer to business tables.** The mobile app never writes directly.
2. **Validate every boundary with Zod.** Body, query, params, headers, env, and seed JSON.
3. **A `core/` contract change is a breaking change** for every consumer, including the app build
   already installed on student phones.
4. **All SQL goes through Drizzle.** No string-built SQL.
5. **Authorization is derived from the verified token**, never from a request body or query
   parameter. Never accept an `org_id`, `user_id`, or owner field from the client.
6. **No secrets in the repo.** `.env` is gitignored; `.env.example` holds placeholders only.
   `dummy-creds.json` is for demo accounts only.
7. **Never report a test as passing unless you ran it.** Show the real command and real output.
8. **Follow existing patterns.** Read the surrounding code before writing new code.

## Agents

Defined in `.opencode/agents/`.

| Agent | Mode | Focus |
|---|---|---|
| **Senior Engineer** | `all` | Correctness, maintainability, tests, edge cases, existing patterns, implementation quality. Owns implementation in `api/` and `core/`. |
| **Staff Engineer** | `all` | Does this change work well within the larger system? Boundaries, contracts, dependencies, operational impact. |
| **Principal Engineer** | `all` | Should we be building it this way at all? Strategic fit, long-term cost, systemic complexity. |
| **Architect** | `all` | Designing the system architecture. Owns `docs/ARCHITECTURE.md` and the ADRs. |
| **Code Reviewer** | `subagent`, read-only | Reviews code for correctness and implementation quality. |
| **Security Reviewer** | `subagent`, read-only | Ensures the application adheres to security standards. |
| **Test Engineer** | `all` | Creating and running tests. Reports real pass/fail results. |
| **Debugger** | `all` | Systematic debugging — root cause from evidence before any code change. |

### Responsibilities

**Senior Engineer** — ensure the code is implemented correctly; review for correctness,
maintainability, and quality; conduct reviews with the Code Reviewer; ensure all tests are written
and pass; identify and address edge cases; ensure all patterns are followed; feed system-level
observations back to the Staff Engineer.

**Staff Engineer** — develop and maintain code according to the architecture; ensure it fits the
larger system; identify issues at system boundaries, dependencies, and interfaces; report technical
debt and inconsistencies; keep the system scalable and operationally effective; collaborate with the
Principal Engineer on architectural decisions.

**Principal Engineer** — ensure the overall architecture is sound and aligned with the long-term
vision; review architectural decisions with the Architect; conduct high-level reviews with the
Senior Engineer; identify systemic complexity and failure modes; ensure technology choices are
strategic; guide on boundaries and migration strategy; avoid unnecessary complexity and strategic
technical debt.

**Architect** — design and document the system architecture; ensure it supports long-term goals;
conduct architecture reviews with the Principal Engineer; address architecture concerns raised by
the Code Reviewer and Staff Engineer.

**Code Reviewer** — review code for correctness and implementation quality; give feedback on
patterns, maintainability, and adherence to the standards in this file; raise design and
implementation issues with the Senior and Staff Engineers.

**Security Reviewer** — ensure the application adheres to security standards and best practices;
conduct security reviews with the Staff Engineer; identify and address security vulnerabilities.

**Test Engineer** — develop and execute tests; ensure coverage is comprehensive and hits all edge
cases; identify and address testing issues.

**Debugger** — methodically debug issues found during development or testing; ensure issues are
resolved and the application runs as expected.

## Skills

Defined in `.opencode/skills/`, loaded on demand with the `skill` tool. Per-agent access is granted
in `opencode.json`.

| Skill | Covers |
|---|---|
| `architecture` | System design, boundaries, multi-tenancy, relational vs NoSQL, ADRs |
| `code-review` | Code quality, design patterns, refactoring discipline, repo-specific checks |
| `frontend` | React, React Native, TypeScript, accessibility standards |
| `testing` | Unit, integration, and end-to-end tests; what to prioritize here |
| `security` | OWASP Top 10, OWASP API, auth, tenant isolation, secrets, rate limiting |
| `performance` | Profiling, benchmarking, load testing, common hot spots |

## Commands

Defined in `.opencode/commands/`.

| Command | Workflow |
|---|---|
| `/plan` | Draft a plan → Senior Engineer review → address feedback → Principal Engineer approval |
| `/review` | Submit changes → Code Reviewer review → address feedback → Senior Engineer final review |
| `/fix-review` | Address requested changes → re-submit → repeat until clean |
| `/test` | Unit → integration → end-to-end → address failures |
| `/ship` | Final review → merge → post-merge review → ship |

## Development

```bash
npm install
cp api/.env.example api/.env    # Supabase URL + keys + DB URL (use the pooler host)
npm run seed                    # load content/*.json into the DB
npm run dev:api                 # API on :3000
cd mobile && npm run dev        # 'a' emulator · 'w' web · Expo Go QR

npm run typecheck               # all workspaces
npm run verify                  # question bank integrity
```

## Review workflow

1. **`/plan`** for anything non-trivial. Get Principal Engineer approval before writing code.
2. **`/review`** before opening a PR. Security findings are blocking.
3. **`/fix-review`** until no blockers or majors remain.
4. **`/test`** with real output.
5. **`/ship`**. Never deploy to production from a command — ask first.
