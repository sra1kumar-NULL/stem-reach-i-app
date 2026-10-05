# 0002 — Cohort-targeting via a join table on daily sets

Status: **Proposed** · Date: 2026-10-05 · Supersedes: nothing · Superseded by: nothing

## Context

Today a teacher activation is global: every student in the app sees the same daily feed for a
given date. The school pilots the app across multiple class sections (e.g., "10A", "10B") and
teachers need to direct a day's revision to one or more specific sections without affecting the
others.

Constraints that drove the design:

- **Installed app builds cannot be broken.** Students on an older APK must continue to receive
  their feed unchanged. Any change to `ActivateRequest`, `ActivationResponse`, or the student
  feed contract must be strictly additive.
- **No per-row backfill.** Existing `daily_sets` rows have no cohort data. The implementation
  must treat "no cohort data" as "unrestricted" without touching historical rows.
- **Relational schema — no Postgres arrays.** The question bank, sections, and submissions are
  all fully relational. Array columns (`text[]`) are Postgres-idiomatic but add friction with
  Drizzle (no native array type) and make the row non-atomic to join. The project's schema
  convention is normalised join tables.
- **One daily set per date.** The `daily_sets` table has a unique index on `set_date`. One set
  serves all cohorts for that date; the cohort table gates which students can read it, not which
  set they get.
- **Pre-multi-tenancy.** The upcoming `org_id` milestone will add tenant scoping to every
  business table. This decision must not require rework in that migration.

Three approaches were considered:

1. **`target_sections text[]` column on `daily_sets`** — a Postgres array storing the allowed
   class_section values. Simple to add, no join needed in the gate check, but inconsistent with
   the normalised join-table pattern already used in `daily_set_sections`, and harder to index
   efficiently for range scans.

2. **A `cohort_restricted bool` flag on `daily_sets` plus a join table** — explicit on-off flag
   with a separate table for the rows. More explicit intent, but two things that must be kept in
   sync (flag and table), and the flag adds a column to an existing table.

3. **A new join table `daily_set_cohorts(daily_set_id, class_section)` with no changes to
   `daily_sets`** — 0 rows means unrestricted; N rows means restricted to those sections. Clean,
   no existing-table alteration, follows the `daily_set_sections` pattern exactly.

## Decision

Use **option 3**: a new join table `daily_set_cohorts` with `(daily_set_id, class_section)` as the
composite primary key.

- **0 rows for a given `daily_set_id`** = no cohort restriction; all students see the feed.
  This is the state of every existing `daily_sets` row after the migration.
- **N rows** = only students whose `profiles.class_section` matches one of the listed values may
  see the feed or submit answers for that set.

The `target_cohorts` field is added as **optional** to `ActivateRequest`,
`PlanActivationsRequest`, `ActivationResponse`, and `ActivationRangeResponse`. Old clients that
omit it get unrestricted behavior. Old clients that read the response silently ignore the new
field.

A new teacher-only endpoint `GET /api/students/sections` returns the distinct `class_section`
values present in `profiles` so the teacher UI can offer a cohort picker without a free-text field.

The cohort gate is enforced in two places:

- `GET /api/feed/today` — returns `{ empty: true }` for out-of-cohort students; indistinguishable
  from "nothing activated today" from the student's perspective.
- `POST /api/submissions` — rejects new answers from out-of-cohort students with `400
  bad_request`; idempotent replays of existing answers are not gated (same as the existing
  date-staleness check).

The participation report (`GET /api/reports/participation`) intersects its student list with the
set's target cohorts so out-of-cohort students do not inflate the pending count.

## Consequences

**Easier**

- No backfill: existing rows are automatically unrestricted because they have no cohort rows.
- The `daily_set_cohorts` table is trivially scoped by `daily_set_id → daily_sets` and will
  inherit org scoping transitively when `daily_sets` gains `org_id` in the multi-tenancy
  milestone. No column needs to be added to `daily_set_cohorts` later.
- The join-table pattern is already understood by everyone on the team (`daily_set_sections`).
- A single non-breaking migration (`CREATE TABLE IF NOT EXISTS`) that is safe to run online.
- The additive contract changes mean old app builds continue to work with zero-restriction
  behavior for as long as they remain installed.

**Harder**

- Every cohort-aware read (feed, submission gate, participation report) requires an extra indexed
  lookup on `daily_set_cohorts`. The table is very small (at most `cohorts × active_dates` rows)
  and the index on `daily_set_id` keeps this O(log n). No caching is needed at pilot scale.
- A student with `class_section = null` is excluded from any targeted activation. Teachers must
  ensure all students have a `class_section` set, or they must not target cohorts for those
  sessions. This is a human-process requirement, not a defect.
- The `CalendarDayDto.participation_pct` denominator counts all students (not just targeted
  cohort students). This makes the percentage slightly inaccurate for targeted activations. Noted
  as a known limitation for the pilot.

**Costs to reverse**

- Removing cohort targeting means dropping `daily_set_cohorts` and stripping the optional
  `target_cohorts` field from the contract. Both are low-effort. The gate checks in feed and
  submissions are a few lines each.

## Follow-ups

- When `org_id` lands on `daily_sets`, verify that all queries joining through `daily_set_cohorts`
  filter by org (transitively via `daily_set_id`) — no direct `org_id` column is needed on the
  cohort table.
- Fix `CalendarDayDto.participation_pct` to use the effective cohort population as the
  denominator (V2 refinement, not a pilot blocker).
- Consider a `GET /api/activations/cohorts/today` endpoint (or extend `ActivationResponse`) so
  the student app can show a user-friendly message when a cohort restriction is the reason for an
  empty feed, rather than "no revision today" (UX improvement, not a functional gap for the pilot).
