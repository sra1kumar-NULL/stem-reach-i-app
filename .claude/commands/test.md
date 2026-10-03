---
description: Run the test suites (typecheck, verify, unit, integration, e2e) and triage failures
argument-hint: "[workspace or area — defaults to whole repo]"
---
Use the `test-engineer` subagent for this workflow (or act as it, following
`.claude/agents/test-engineer.md`).


Run the test suites and address failures.

Scope: $ARGUMENTS

If `$ARGUMENTS` is empty, cover the whole repository. Use the `testing` skill first.

## Step 1 — Find out what actually exists

Before running anything, check the real setup — this repo may not have a test runner configured yet:

```bash
cat package.json
cat api/package.json core/package.json scripts/package.json mobile/package.json
```

Then run, in order, and show the real output of each:

```bash
npm run typecheck
npm run verify      # content bank integrity
```

If no test script exists, say so plainly and propose the smallest setup that fits the stack
(`node:test` or `vitest` for the Node workspaces). Do not add a large framework without asking.

## Step 2 — Unit tests

Run the unit suite. Cover pure logic first, since it is fast and deterministic:

- Scoring correctness and streak/progress calculation.
- Feed sampling of K questions per section, seeded for reproducibility.
- Zod schemas in `core/`, including rejection cases.

## Step 3 — Integration tests

Run against a real or containerized database — this is where authorization and query-scoping bugs
appear, so do not mock the database out of this layer:

- Every route rejects unauthenticated and wrong-role access.
- A student cannot read or write another student's submissions or performance.
- A teacher cannot reach another org's data.
- Error codes are right: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found.
- Re-activating a date is idempotent.

## Step 4 — End-to-end tests

Run the E2E suite, if one is configured: signup → teacher activates topics → student answers the
feed → teacher sees the result. Keep it small and make failures readable.

## Step 5 — Address failing tests

For each failure:
1. Determine whether the **test** is wrong or the **code** is wrong. Do not assume the test is
   right, and do not assume the code is right.
2. If the code is wrong, fix the cause — use the `debugger` subagent rather than patching the
   symptom.
3. If the test is wrong, state concretely why the old expectation was incorrect before changing it.
4. Re-run the failing suite and show the real result.

Never weaken an assertion, delete a test, or skip a test to make the suite green. A skip with a
reason is acceptable; a silent skip is not.

## Step 6 — Report

State the commands run, pass/fail counts per suite, what was fixed, and what remains untested.
Never report a test as passing that was not executed.
