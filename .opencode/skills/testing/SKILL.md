---
name: Testing
description: Use when writing or running unit, integration, and end-to-end tests for the api, core, scripts, or mobile workspaces.
---

# Testing

## Ground rules

- **Never report a passing test you did not run.** Show the command and the real output. If you
  cannot run it, say "not run" and say why.
- A test that passes while the feature is broken is worse than no test. Assert on observable
  behaviour, not on internals.
- Deterministic only: inject the clock, seed or mock randomness, no network, no reliance on
  iteration order.

## Check the existing harness first

Before writing tests, find out what this repo actually has:

```bash
cat package.json
cat api/package.json core/package.json scripts/package.json mobile/package.json
npm run typecheck
```

There may be no test runner configured yet. If so, say so and propose the smallest setup that fits
the existing stack (the API and CLI are Node + TS, so a lightweight runner like `node:test` or
`vitest` is usually enough). Do not silently introduce a large framework.

## What to test, by priority

Ranked by blast radius, not by coverage percentage.

### 1. Authorization — always first

One student's data leaking to another is the worst defect this app can ship. Test that a student
cannot read or write another student's submissions, progress, or performance; that a teacher cannot
reach another org's data; and that role is derived from the verified token, never from a request
parameter.

### 2. Scoring and progress maths

Correct/incorrect scoring, streak computation including the first-attempt and already-answered
cases, and the progress `{answered, total, completed}` calculation. These are pure functions — test
them directly and exhaustively.

### 3. Feed assembly

Per-section sampling of K questions, seeded so it is reproducible; already-answered questions
marked; correct total count; the empty-feed response when no `daily_set` exists for today; the
nearest-active-date fallback if that is the configured behaviour.

### 4. API boundaries

Zod rejection returning 400 (not 500); 401 unauthenticated; 403 authenticated but not permitted;
404 for a resource that does not belong to the caller. Check that a validation failure never
leaks the raw database error.

### 5. Idempotency and state transitions

Re-activating the same date must replace the snapshot rather than duplicate it. Duplicate
submissions for one question must not double-count. Out-of-order activation must not corrupt the
day.

### 6. Content integrity

`npm run verify` covers the question bank in `content/`. Add tests for malformed question JSON, bad
option counts, missing correct answers, and content that fails the Zod schemas in `core/`.

## Level by layer

- **Unit** — pure functions: scoring, sampling, progress, Zod schemas. Fast, no I/O, most cases.
- **Integration** — API route handlers against a real or containerized Postgres, exercising auth and
  queries together. This is where RLS and query-scoping bugs surface, so do not mock the database
  out of it.
- **End-to-end** — the mobile app against a running API: signup → teacher activates topics →
  student answers the feed → teacher sees the result. Keep this small; it is the slowest and most
  brittle layer.

## Naming and structure

Name tests for the behaviour and the case, not the function:

```ts
test('rejects a submission for a question in another org')
```

Keep each test to one behaviour with an arrange-act-assert shape. A 60-line test is usually a
missing abstraction or a missing test.

## Coverage discipline

Do not chase a percentage. Aim for full coverage of the risky branches in the list above and accept
thin coverage of trivial UI. Explicitly list what remains untested rather than implying full
coverage.
