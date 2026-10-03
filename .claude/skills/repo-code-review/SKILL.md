---
name: repo-code-review
description: Use when reviewing a diff, preparing changes for review, or judging implementation quality, design patterns, and refactoring in this repo. Provides the severity ladder (blocker/major/minor/nit), repo-specific checks, and the review output format.
---

# Code Review

## What to look at first

Run `git status --short` and `git diff` before forming any opinion. An empty diff means stop and
say so. Read the whole changed function — not just the `+` lines — because most real defects live
in the interaction between new code and what it already called.

## Severity ladder

| Severity | Meaning |
|---|---|
| `blocker` | Incorrect result, data loss, or a security hole. Must fix. |
| `major` | Wrong under a realistic input, or a broken contract. Fix before merge. |
| `minor` | Maintainability, naming, duplication. Follow up. |
| `nit` | Taste. Say "nit" and move on. |

Do not inflate a nit into a blocker to look thorough. The most useful review is short and ranked.

## Code quality

- Does the code do one thing, and is that thing named?
- Are early returns and guard clauses used instead of nesting?
- Is the happy path the only path that reads well? Error paths should be as obvious as success.
- Is anything mutable shared, exported by reference, or captured in a closure unintentionally?
- Are magic numbers and magic strings named and shared from one place?

## Types and boundaries

This is a TypeScript monorepo; the type system is the first reviewer.

- Is every external input parsed with Zod before use — request bodies, query params, headers,
  env vars, and the seed CLI's JSON?
- Are Drizzle queries used instead of string-built SQL?
- Did a `core/` contract change? Then check every consumer in `api/`, `mobile/`, and `scripts/`.
- Is `any`, a bare type assertion, or a non-null `!` hiding a real possibility of null?

## Design patterns

Add a pattern only when it removes a concrete duplication or makes a real variation explicit.

- Reject: a repository layer that forwards every call to Drizzle; a factory for a class with one
  implementation; an interface added purely for mocking.
- Prefer: one obvious way to do the common thing, and a seam only where you have two real
  implementations or a real reason to test without the database.

## Refactoring

- Refactoring and behaviour change in the same commit is the main way bugs reach production. Ask
  for them to be split when the diff mixes them.
- Any refactor must be behaviour-preserving **and** covered by tests that passed before the
  change. If the tests did not exist first, the refactor is not verifiable — say so.
- Duplicated code that is about to diverge is worth extracting now. Duplicated code that is stable
  is not worth a churn-y abstraction.

## Repo-specific checks

- Is the API still the only writer to business tables?
- Do teacher-scoped queries filter by the caller's org/user rather than by a client-supplied id?
- Does a Drizzle schema change have a migration and a plan for existing rows?
- Does an API change stay backward-compatible with the mobile build already in students' hands?
- Are there secrets, tokens, or real credentials in the diff? `.env` is gitignored — nothing
  sensitive should appear anywhere.

## Output format

Severity-ordered findings, each with `file:line`, the concrete failing input, the user-visible
effect, and the smallest correct fix. Close with `approve`, `approve with nits`, or
`request changes`.
