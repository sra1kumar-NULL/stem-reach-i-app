# Cohort-Targeting Plan

## Summary

Today every teacher activation is global — all students see the same daily feed regardless of class
section. This feature lets a teacher optionally restrict an activation to one or more
`class_section` values (e.g., "10A", "10B"). A student whose `profiles.class_section` is not in
the target list receives the same `{ empty: true }` response they get when nothing has been
activated. Old activations and old app builds are unaffected: the design is purely additive at
every layer.

---

## 1. Schema change

### Rationale

The current schema already separates content targeting (`daily_set_sections` — which chapters/topics
are in scope) from the new requirement (which class cohorts may see the set). The right place for
the new data is a separate join table rather than an array column on `daily_sets`. A join table:

- Follows the existing `daily_set_sections` pattern already in the codebase.
- Is fully relational and indexable.
- Makes the `0 rows = unrestricted` semantic concrete and backward-compatible without any column
  back-fill on existing rows.

**Naming clarity:** `sections` and `daily_set_sections` refer to *content sections* (NCERT
chapter topics). The new table is `daily_set_cohorts` to name the *class cohort* dimension.

### Drizzle definition (add to `core/src/db/schema.ts`)

```typescript
export const dailySetCohorts = pgTable(
  "daily_set_cohorts",
  {
    dailySetId: uuid("daily_set_id")
      .notNull()
      .references(() => dailySets.id, { onDelete: "cascade" }),
    /** Matches profiles.class_section exactly (e.g. "10A"). Case-sensitive. */
    classSection: text("class_section").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.dailySetId, t.classSection] }),
    index("idx_daily_set_cohorts_set").on(t.dailySetId),
  ],
);
export type DailySetCohort = typeof dailySetCohorts.$inferSelect;
```

### Migration SQL

**Filename:** `api/migrations/0002_add_daily_set_cohorts.sql`

```sql
-- 0002_add_daily_set_cohorts.sql
-- Adds cohort-targeting to daily sets.
-- 0 rows for a daily_set_id = unrestricted (all students). Backward-compatible.
CREATE TABLE IF NOT EXISTS daily_set_cohorts (
  daily_set_id  UUID    NOT NULL REFERENCES daily_sets(id) ON DELETE CASCADE,
  class_section TEXT    NOT NULL,
  PRIMARY KEY (daily_set_id, class_section)
);
CREATE INDEX IF NOT EXISTS idx_daily_set_cohorts_set ON daily_set_cohorts(daily_set_id);
```

No `ALTER TABLE` on existing tables; no data migration. Safe to run on a live database.

---

## 2. Contract changes (`core/src/contracts.ts`, additive only)

All new fields are optional so no installed app build is broken. The rule: old fields stay, new
fields are optional.

### 2a. `ActivateRequest` — add `target_cohorts`

```diff
 export const ActivateRequest = z.object({
   date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
   section_ids: z.array(z.string().uuid()).min(1),
+  /** Optional list of profiles.class_section values to restrict this activation to.
+   *  When absent or empty the activation is unrestricted (all students). */
+  target_cohorts: z.array(z.string().trim().min(1).max(20).refine(noNul, NUL_MSG)).max(50).optional(),
 });
```

### 2b. `PlanActivationsRequest` — add `target_cohorts`

```diff
 export const PlanActivationsRequest = z.object({
   dates: z.array(ISO_DATE).min(1).max(31),
   section_ids: z.array(z.string().uuid()).min(1).max(50),
+  target_cohorts: z.array(z.string().trim().min(1).max(20).refine(noNul, NUL_MSG)).max(50).optional(),
 });
```

### 2c. `ActivationResponse` — expose cohorts in the snapshot

```diff
 export const ActivationResponse = z.object({
   daily_set_id: z.string().uuid().nullable(),
   date: z.string(),
   sections: z.array(
     z.object({ id: z.string().uuid(), section_no: z.string(), name: z.string(), question_count: z.number().int() }),
   ),
+  /** Optional so older API/app builds stay compatible. Empty array = unrestricted. */
+  target_cohorts: z.array(z.string()).optional(),
 });
```

### 2d. `ActivationRangeResponse` — each activation item exposes cohorts

```diff
 export const ActivationRangeResponse = z.object({
   activations: z.array(
     z.object({
       date: ISO_DATE,
       daily_set_id: z.string().uuid(),
       sections: z.array(ActivatedSectionDto),
+      target_cohorts: z.array(z.string()).optional(),
     }),
   ),
 });
```

### 2e. New: `StudentSectionsResponse` (new contract, teacher-only)

```typescript
/** GET /api/students/sections — distinct class_section values for the cohort picker. */
export const StudentSectionsResponse = z.object({
  sections: z.array(z.string()),
});
export type StudentSectionsResponse = z.infer<typeof StudentSectionsResponse>;
```

---

## 3. API changes per route

### 3a. `api/src/routes/activations.ts`

**`POST /api/activations`**

Changes:
1. Extract `target_cohorts` from the body (already validated by updated `ActivateRequest`).
2. Inside the transaction, after re-inserting `daily_set_sections`, delete then re-insert
   `daily_set_cohorts` rows (same atomic replace pattern).
3. Update the `snapshot()` helper to fetch cohort rows and include `target_cohorts` in the return.

```typescript
// Inside the transaction (after the daily_set_sections insert):
await tx.delete(dailySetCohorts).where(eq(dailySetCohorts.dailySetId, row.id));
if (body.target_cohorts && body.target_cohorts.length > 0) {
  await tx.insert(dailySetCohorts).values(
    body.target_cohorts.map((classSection) => ({ dailySetId: row.id, classSection })),
  );
}
```

The `snapshot()` helper gains:
```typescript
const cohortRows = await ctx.db
  .select({ classSection: dailySetCohorts.classSection })
  .from(dailySetCohorts)
  .where(eq(dailySetCohorts.dailySetId, set.id));
// return includes: target_cohorts: cohortRows.map(r => r.classSection)
```

**`POST /api/activations/plan`**

Same logic — `target_cohorts` is deleted and re-inserted for each set created in the transaction.
The `activationRange()` helper must be updated to fetch cohorts alongside sections.

**`GET /api/activations` and `GET /api/activations/range`**

Both use `snapshot()` or `activationRange()` — updating those helpers propagates the change here.
No route-level code change needed beyond importing `dailySetCohorts`.

### 3b. `api/src/routes/students.ts` — new endpoint

Add `GET /api/students/sections` (teacher-only):

```typescript
app.get("/sections", requireRole("teacher"), async (c) => {
  const rows = await ctx.db
    .selectDistinct({ classSection: profiles.classSection })
    .from(profiles)
    .where(and(eq(profiles.role, "student"), isNotNull(profiles.classSection)))
    .orderBy(asc(profiles.classSection));
  return c.json({ sections: rows.map((r) => r.classSection as string) });
});
```

Register before the `:id` param route to avoid shadowing.

### 3c. `api/src/routes/feed.ts`

Add a cohort gate immediately after finding today's set and before any expensive query:

```typescript
// Cohort check: 0 cohort rows = unrestricted; N rows = student must be in one of them.
const cohorts = await ctx.db
  .select({ classSection: dailySetCohorts.classSection })
  .from(dailySetCohorts)
  .where(eq(dailySetCohorts.dailySetId, set.id));

if (cohorts.length > 0) {
  const studentSection = c.var.user.profile.classSection;
  if (!studentSection || !cohorts.some((ch) => ch.classSection === studentSection)) {
    return c.json(empty);
  }
}
```

`c.var.user.profile` is a full `Profile` row (fetched by `authMiddleware`), so `classSection` is
already available — no auth middleware change required.

### 3d. `api/src/routes/submissions.ts`

Add the same cohort gate after loading the set (before the expensive grading logic). A student
outside the target cohort attempting to submit should receive a `bad_request` error
(matching the existing "question is not part of this daily set" pattern):

```typescript
const cohorts = await ctx.db
  .select({ classSection: dailySetCohorts.classSection })
  .from(dailySetCohorts)
  .where(eq(dailySetCohorts.dailySetId, set.id));

if (cohorts.length > 0 && !existing) {
  // Only gate new submissions; replay of an existing submission always succeeds.
  const studentSection = c.var.user.profile.classSection;
  if (!studentSection || !cohorts.some((ch) => ch.classSection === studentSection)) {
    throw badRequest("question is not part of your daily set");
  }
}
```

Note: the cohort check is skipped for already-recorded answers (idempotency path) — same
principle as the existing `set.setDate !== today` gate.

### 3e. `api/src/routes/reports.ts` — participation

When the daily set has cohort restrictions, show only students in the targeted cohorts. The
existing `class_section` query parameter narrows further.

Replace the student query:
```typescript
// Before: one condition (class_section filter or all students)
// After: intersect with target_cohorts if any, then optionally narrow by class_section param.

const cohorts = await ctx.db
  .select({ classSection: dailySetCohorts.classSection })
  .from(dailySetCohorts)
  .where(eq(dailySetCohorts.dailySetId, set.id));

const effectiveSections: string[] = cohorts.length > 0
  ? cohorts.map((c) => c.classSection)
  : classSection ? [classSection] : [];
// effectiveSections.length === 0 means "all students" (no restriction at either level)

const students = await ctx.db
  .select()
  .from(profiles)
  .where(
    effectiveSections.length > 0
      ? and(eq(profiles.role, "student"), inArray(profiles.classSection, effectiveSections))
      : classSection
      ? and(eq(profiles.role, "student"), eq(profiles.classSection, classSection))
      : eq(profiles.role, "student"),
  )
  .orderBy(profiles.fullName);
```

### 3f. `api/src/app.ts` — register new route

Register the `/students/sections` endpoint (students router already mounted at `/students`).
No new router file needed.

---

## 4. Mobile changes per screen

### 4a. `mobile/src/app/(teacher)/index.tsx` — teacher home (activation flow)

What changes:
1. After loading the syllabus and today's activation, also call `GET /api/students/sections` to
   get the known class sections.
2. Add a multi-select cohort picker below the topic list. Default: "All students" (no restriction).
   When one or more cohorts are selected, the picker shows "10A, 10B".
3. Pass `target_cohorts` in the `activate()` call. When "All students" is chosen, omit the field
   (or send `[]`) — both result in unrestricted behavior.
4. Update `todaySections` reconciliation to also reconcile `todayCohorts` on focus reload.
5. Update the confirmation dialog text to say "…Students in [cohort list]…" when cohorts are set.

API client change in `mobile/src/api/client.ts`:
```typescript
// activate() already takes the ActivateRequest body; add target_cohorts to the type.
// No structural change — just pass target_cohorts when the teacher has selected some.
```

### 4b. `mobile/src/app/(student)/index.tsx` — student feed

No change needed. When `empty: true` is returned because the student is outside the target cohort,
the existing "No revision today yet" empty state is shown. This is correct and unambiguous —
students do not need to know whether a set exists but they are excluded.

### 4c. `mobile/src/api/client.ts`

Add a helper for the new endpoint:
```typescript
export async function getStudentSections(): Promise<{ sections: string[] }> {
  return apiFetch("/students/sections");
}
```

---

## 5. Migration SQL filename

`api/migrations/0002_add_daily_set_cohorts.sql`

---

## 6. Backward-compatibility guarantees

| Scenario | Behavior |
|---|---|
| Old app build sends `POST /activations` without `target_cohorts` | `target_cohorts` is optional in the schema → defaults to absent → 0 rows inserted in `daily_set_cohorts` → all students see the feed. No change from today. |
| Old `daily_set` rows (no cohort rows) | `COUNT(daily_set_cohorts) = 0` → feed gate passes for all students. No backfill needed. |
| Old app build reads `ActivationResponse` without `target_cohorts` | Field is optional in the contract → ignored. |
| Old app build reads `ActivationRangeResponse` | Same — new field is optional → ignored. |
| Student with `class_section = null` on a targeted set | `classSection` is null → cohort check fails → empty feed. Expected: students without a section assignment should be assigned a section or the set should be unrestricted. |
| Teacher activates `target_cohorts: []` (explicitly empty) | 0 rows inserted → same as absent → unrestricted. API normalizes empty array to no-op. |

---

## 7. Out of scope for the pilot

- **Multi-tenant `org_id`**: This is the next milestone. `daily_set_cohorts` is scoped via
  `daily_set_id → daily_sets`, which will gain `org_id` in that milestone. No extra column needed
  here — the scoping is inherited transitively.
- **Calendar participation percentage with cohorts**: `CalendarDayDto.participation_pct` counts
  all students as the denominator. With cohort targeting this is slightly inaccurate (students
  outside the cohort inflate the total). Acceptable for the pilot; fix when the calendar is used
  for reporting.
- **Per-student set freezing**: Already a known V2 refinement (documented in `docs/03-HLD.md`).
  Cohort targeting does not change this.
- **Cohort management UI**: Sections are discovered from `profiles.class_section`. No admin UI
  for creating or renaming cohorts. Teachers set cohort names at student registration.

---

## 8. Work split (parallel agents)

| Chunk | Owner | Description |
|---|---|---|
| **A — Schema + contracts** | Senior Engineer | Add `dailySetCohorts` to `core/src/db/schema.ts`; add all contract additions to `core/src/contracts.ts`; write `api/migrations/0002_add_daily_set_cohorts.sql`. |
| **B — Activation routes** | Senior Engineer | Update `snapshot()` and `activationRange()` helpers; update `POST /activations` and `POST /activations/plan` transactions; add `GET /students/sections`. |
| **C — Feed + Submissions guard** | Senior Engineer | Add cohort gate to `api/src/routes/feed.ts` and `api/src/routes/submissions.ts`. |
| **D — Reports** | Senior Engineer | Update participation query in `api/src/routes/reports.ts` to intersect with target cohorts. |
| **E — Mobile** | Staff Engineer | Teacher home cohort picker; `getStudentSections()` API client helper; update activation call to pass `target_cohorts`. |
| **F — Tests** | Test Engineer | Integration tests for activation with cohorts (A–D), feed cohort gate, participation report scope. |

Chunks A and B must complete before C, D, and F. Chunk E can proceed in parallel with B–D once
Chunk A (contracts) is done.
