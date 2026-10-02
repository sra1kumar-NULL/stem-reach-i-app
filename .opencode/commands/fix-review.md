---
description: Address review findings and re-submit until clean
agent: senior-engineer
---

Address the outstanding review findings and take the change through another round of review.

Findings to address: $ARGUMENTS

If `$ARGUMENTS` is empty, derive the open findings from the current diff (`git status --short`,
then `git diff`) using the `code-review` skill, and list them before touching anything.

## Step 1 — Triage before editing

Read every finding and classify each one:

- **Fix now** — real defect, wrong contract, security hole, or missing test.
- **Fix later** — legitimate but out of scope for this change. Record it as a tracked follow-up;
  do not silently expand the change.
- **Disagree** — the finding is incorrect. Say why in one line, and do not "fix" it. Never change
  code or rewrite a test expectation purely to make a reviewer stop complaining.

Never weaken a type assertion, delete a validation, or swallow an error to silence a finding.

## Step 2 — Fix

Apply the smallest correct change for each accepted finding, in severity order: blockers, then
major, then minor. One coherent change per finding — do not fold unrelated cleanups into the fix.

## Step 3 — Verify

Run the real checks and show the real output: `npm run typecheck`, plus the relevant tests. Report
honestly if something fails or was not run. Never report a test as passing that was not executed.

Confirm that any test added to guard a finding actually fails without the fix.

## Step 4 — Re-submit for review

Launch the `code-reviewer` subagent on the updated diff, plus `security-reviewer` for anything
touching auth, data access, or tenant boundaries. Report which findings are now resolved, which
are deferred with justification, and which are being disputed.

## Step 5 — Repeat

Continue rounds until there are no open blockers or major findings, or until the remaining items are
explicitly deferred by the user. Report the final state; do not loop forever.
