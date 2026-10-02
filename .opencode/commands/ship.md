---
description: Run the full release gate and ship the change
agent: senior-engineer
---

Ship the change.

Scope: $ARGUMENTS

Load the `code-review`, `security`, and `testing` skills. Do not skip any gate — if a gate cannot be
run, stop and say so rather than continuing.

## Step 1 — Final code review

Confirm the change is review-clean before anything else:

```bash
git status --short
git diff main...HEAD
git log --oneline -10
```

Then run the reviews:
- `code-reviewer` — correctness and implementation quality.
- `security-reviewer` — auth, tenant isolation, injection, secret handling.
- `staff-engineer` — system fit, boundary and contract impact.
- `test-engineer` — coverage of risky branches, real pass/fail results.

Resolve every blocker and major finding. An unresolved security finding is an automatic stop.

## Step 2 — Merge into the branch

```bash
npm run typecheck
git fetch origin
git rebase origin/main      # or merge, whichever the repo uses
npm run typecheck           # re-verify after the rebase
```

- Never rewrite history that has already been pushed to a shared branch.
- Never force-push a shared branch. If a rebase went wrong, reset and start over.
- Confirm the working tree is clean and nothing sensitive is staged. `.env` is gitignored; confirm
  no secrets, keys, or real credentials are in the diff.

## Step 3 — Final review after the merge

Re-run the checks against the merged result, since the rebase can change the code:

```bash
npm run typecheck
npm test            # if a runner is configured
npm run verify      # content bank integrity
```

Review the post-merge diff one more time. Confirm the merged commit contains exactly the intended
changes and nothing extra.

## Step 4 — Ship

- Push the branch.
- Open or update the PR with: what changed, why, how it was tested, the real test output, and a
  before/after note if there was a measurable performance or schema impact.
- Never deploy straight to production from this command. Ask before any deploy, and never merge to
  a protected branch without explicit approval.
- Update `docs/` if the change altered a contract, schema, or design: `docs/04-LLD.md` for schema
  or API changes, `docs/03-HLD.md` for flows, and add an ADR in `docs/ADR/` for any decision that
  outlives this change.

## Report

State what was reviewed, what passed with real output, what was fixed, the commit range shipped, the
PR link, and anything deliberately left undone.
