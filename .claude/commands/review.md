---
description: Review the current changes through the code review chain (code, security, system fit, tests, then Senior Engineer final pass)
argument-hint: "[branch, path, or PR scope — defaults to working-tree diff]"
---

Review the current changes in this repository.

Target: $ARGUMENTS

If `$ARGUMENTS` is empty, review the working-tree diff (`git status --short`, then `git diff`) and
report if there is nothing to review.

## Step 1 — Submit the changes

Establish the diff under review and state it back to the user so there is no ambiguity about scope:
a working-tree diff, a branch against main, or the specific path given above.

## Step 2 — Code review with the Code Reviewer

Use the `code-reviewer` subagent on the diff. It runs read-only and reports findings in severity
order with `file:line` references.

Then review for the areas it explicitly cannot see from a diff alone, and report separately:
- **Security** — use the `security-reviewer` subagent. Treat any possibility of one student's
  data reaching another as a blocker.
- **System fit** — use the `staff-engineer` subagent to check boundaries, contracts,
  dependencies, and operational impact.
- **Tests** — use the `test-engineer` subagent for missing coverage of risky branches.

## Step 3 — Address feedback

Do not fix anything yet. Present the collected findings to the user, grouped by severity, with the
smallest correct fix for each. Ask what to take now and what to defer.

## Step 4 — Final review by the Senior Engineer

Once the accepted findings are addressed, use the `senior-engineer` subagent for the final pass over the updated diff:
correctness, maintainability, edge cases, adherence to the patterns in `AGENTS.md`, and that the
tests actually cover the change. Use the `repo-code-review`, `security`, and `testing` skills as
relevant.

Close with a verdict: `approve`, `approve with nits`, or `request changes`, plus anything still
untested.
