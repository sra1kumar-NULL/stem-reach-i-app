---
description: Draft a plan for a change and walk it through the review chain
agent: plan
subagent: false
---

Plan the following change:

$ARGUMENTS

Work through the numbered steps below and stop after each one so the next reviewer can be brought
in. Do not skip ahead and do not start implementing.

## 1. Understand the request

- Read `AGENTS.md` for the agent roles, and the relevant design docs: `docs/01-PRD.md`,
  `docs/03-HLD.md`, `docs/04-LLD.md`, `docs/05-ROADMAP.md`.
- Load the `architecture` skill if the change touches system boundaries, the data model, or a
  contract; load `code-review` if there is existing code to follow.
- State what is being asked, and anything ambiguous in the request.

## 2. Scope the change

Identify:
- Which workspaces are affected (`core/`, `api/`, `mobile/`, `scripts/`, `content/`).
- Whether this changes a shared contract in `core/`, the Drizzle schema, the API surface, or a
  Supabase RLS policy.
- Whether the mobile build already installed on student phones stays compatible.
- Existing patterns in the repo that the change must follow.

## 3. Write the plan

Cover, in order:
1. **Approach** — the design, in a few sentences.
2. **Files** — specific paths to create or change, and what changes in each.
3. **Schema/migrations** — if any, with the plan for existing rows.
4. **Edge cases** — empty, oversized, duplicate, out-of-order, unauthorized, expired.
5. **Tests** — what will be written, and which risky branches they cover.
6. **Risks and rollback** — what could go wrong and how to undo it.
7. **Out of scope** — explicitly what this change does *not* include.

Keep it short enough to read. A plan nobody finishes reading is not a plan.

## 4. Submit for Senior Engineer review

Present the plan and ask for the Senior Engineer's review of correctness, edge cases, pattern
consistency, and test coverage. Address the feedback.

## 5. Submit for Principal Engineer approval

Present the revised plan and ask the Principal Engineer whether this should be built this way at
all: strategic fit, long-term cost, unnecessary complexity, and strategic technical debt. Record any
decision that outlives the change as an ADR in `docs/ADR/`.

Stop here. Do not implement until the plan is approved.
