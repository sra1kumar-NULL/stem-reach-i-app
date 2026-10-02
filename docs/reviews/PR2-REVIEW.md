# PR #2 Review — "feat(flashcards): implement anki-style spaced repetition with zettelkasten integration"

- **PR:** https://github.com/sra1kumar-NULL/stem-reach-i-app/pull/2 (nnish14:main → sra1kumar-NULL:main)
- **Base:** `sra1kumar-NULL:main` @ `817fe2e` — identical to our `origin/main` (first PR2 commit's parent is `817fe2e`), 4 commits, +2177/−350, 19 files.
- **Checks:** only *GitGuardian Security Checks* (success, "No secrets detected"). No typecheck/test CI. 1 comment (Vercel deploy authorization). PR body's `gh`-CLI-unavailable constraint: this review could not be posted to GitHub; delivered here.

**Verdict: request changes (do not merge in current state).** The PR does not compile, its API routes are never mounted, and it contains an IDOR plus fork-specific deploy identity.

---

## 1. Findings

### BLOCKING

**B1 — New API routes are never mounted; the feature is unreachable.**
`api/src/routes/decks.ts:10` and `api/src/routes/schedules.ts:9` export `routes(ctx)`, but PR2 does **not** touch `api/src/app.ts`, and neither `origin/main`'s nor our PR1 `app.ts` imports them (`api/src/app.ts:27-36` mounts only auth/feed/submissions/me/syllabus/activations/reports[/questions]).
Failing input: `GET /api/decks` → 404. Smallest fix: `api.route("/decks", decks.routes(ctx)); api.route("/schedules", schedules.routes(ctx));` after `api.use("*", authMiddleware)`.

**B2 — PR does not typecheck: imports symbols that do not exist in `@stemreach/core`.**
- `api/src/routes/decks.ts:2` imports `userDecks, customQuestions`
- `api/src/routes/decks.ts:4` imports `CreateDeckRequest, CreateQuestionRequest`
- `api/src/routes/schedules.ts:3-4` imports `userSchedules`, `UpdateScheduleRequest`

Verified by grep against `origin/main:core/src/db/schema.ts` (no `userDecks|customQuestions|userSchedules`) and `origin/main:core/src/contracts.ts` (no `CreateDeckRequest|UpdateScheduleRequest`; even `CreateQuestionRequest` doesn't exist on base). PR2 changes **zero** files under `core/`, so the tables, contracts, and migrations for decks/schedules/custom questions are all missing. `tsc -p api` fails on every run (tsconfig includes all of `src`, and `api/src/routes/*.ts` need no import graph to be compiled).
Also implies: no Drizzle schema change ⇒ no migration plan for the new tables (AGENTS #4, code-review skill repo check).

**B3 — `mobile/src/app/_layout.tsx:24` uses `me.role`; `MeResponse` only has `profile.role`.**
`core/src/contracts.ts` (base, and PR1's tree) defines `MeResponse = { profile: { id, full_name, role, class_section }, streak, totals }`; `mobile/src/state/auth.tsx:33` types `me: MeResponse | null`. So:
- `tsc --noEmit` in `mobile` fails: *Property 'role' does not exist on type 'MeResponse'*.
- Even if cast away, `me.role` is `undefined` at runtime → neither branch matches → the role-based redirect **never fires**; the PR's headline navigation feature is a silent no-op.
- Design flaw if fixed naively: `useRoleBasedNavigation` (`_layout.tsx:15-27`) redirects whenever `!pathname.startsWith('/(student)')`, so a signed-in student opening PR2's own `/(self-study)` screen would be instantly bounced back to `(student)` — the portal home (`index.tsx:33`) invites exactly that flow.

**B4 — IDOR on `POST /api/decks/questions` (authz not derived from token for the parent resource).**
`api/src/routes/decks.ts:53`: `deckId: parsed.data.deck_id` is inserted verbatim. There is no check that the deck row belongs to `c.var.user.id`. `userId` on the new question row *is* taken from the token (good), but any authenticated user can attach/delete-shape data into **another user's deck**. Violates non-negotiable #5 (authorization derived from verified token; never trust client-supplied owner/reference ids). Smallest fix: `.where(and(eq(userDecks.id, deckId), eq(userDecks.userId, userId)))` existence check before insert (and return 404), once the table exists.

### MAJOR

**M1 — Auth gate deleted from `mobile/src/app/index.tsx`.**
Base version: `if (!session) return <Redirect href="/login" />; if (!me) ... <Redirect href={role home} />`. PR2's rewrite (lines 17-25) never redirects unauthenticated users, and its `_layout` hook bails `if (!me)` — combined with B3 there is **no role gating anywhere**. `(student)/_layout.tsx` on base is a bare `<Stack/>` with no guard. API still authorizes (no data leak), but the client shell, and the PR1-hardened "meStatus error / sign-out" flow, are replaced by weaker logic.

**M2 — Fork-specific app identity in `mobile/app.json` (must not be merged).**
`:4` slug `mobile` → `n-nishchit`; `:21` android `package` → `com.nnish1411steam.nnishchit`; `:44-48` `extra.eas.projectId` + `owner: "nnish1411s-team"`. Merging takes over the upstream app's store identity and points builds at the contributor's EAS project. (PR1's pending work sets a neutral `com.anonymous.mobile` — textual + semantic conflict.)

**M3 — Backend config hardcoded/divergent; `.env.example` deleted.**
`mobile/eas.json:19-20,31-32` hardcode `EXPO_PUBLIC_SUPABASE_URL=https://ryimfvbtgatfhpzvpdzd.supabase.co`; the deleted `mobile/.env.example:1` pointed at `cihobqescuhuxtiogivb.supabase.co` — a **different Supabase project** than the API's. EAS builds would talk to another backend than `api/.env`. Deleting `.env.example` also breaks repo convention #6's setup path (`.env.example` holds placeholders). The `sb_publishable_…` key itself is publishable by design (GitGuardian: no secrets) — not the blocker; the divergence and pattern-break are.

**M4 — `mobile/metro.config.js:1-9` replaces the monorepo config.**
Removes `watchFolders: [workspaceRoot]`, `nodeModulesPaths`, `disableHierarchicalLookup` (needed to resolve the `@stemreach/core` `file:../core` symlink), and — in conflict with PR1 — drops `withUniwindConfig(...)` (`cssEntryFile: ./src/global.css`, `extraThemes: ['dark']`). Merged as-is, PR1's uniwind `className` styling stops building. Also the stale comment ("shared/ workspace") was never true.

**M5 — Dead navigation: `mobile/src/app/(self-study)/index.tsx:17` pushes `/(self-study)/decks`, but no `decks` route exists** in the PR or on base (`git ls-tree origin/main -- mobile/src/app` has no `(self-study)` at all). Unmatched-route screen at runtime. Related: PR body claims "edit and review modes, review modal, deck details screen, custom segmented control" — **none are in the diff**; `mobile/package.json:36` adds `react-native-segmented-control` (exists on npm, v1.1.0 — verified with `npm view`) but it is used nowhere. PR description misrepresents the change.

**M6 — No tests, no evidence of runs.**
Zero test files added; CI only runs GitGuardian. Per AGENTS #7 nothing here may be reported as passing. (Baseline on OUR tree — see §4 — passes, but it exercises none of PR2's code.)

**M7 — Root dependency churn: `package.json:19-27` adds `drizzle-orm@^0.45.2`, `pg@^8.23.0`, `@types/pg@^8.23.1`, `drizzle-kit@^0.31.10` at repo root** while `api/` and `core/` pin `drizzle-orm@^0.38.3` ⇒ two ORM versions coexist (schema types vs runtime mismatch risk), no migrations are generated, and the motivation is unclear. It forces a ~2,000-line `package-lock.json` rewrite that conflicts with PR1's lockfile work. `engines.node >= 20` also drifts from the documented Node 22 API runtime.

### MINOR

- **m1 `mobile/.npmrc:1`** — `allow-scripts=true` is not an npm config (npm emits "Unknown config"); and it's an add/add conflict with PR1's `legacy-peer-deps=true` on the same new file.
- **m2 `api/src/routes/decks.ts:46`, `api/src/routes/schedules.ts:37`** — copy-pasted `badRequest("Invalid deck format")` in the questions and schedules routes; wrong message on failure paths.
- **m3 `mobile/.gitignore:6-9`** — `.env.*` will now ignore `.env.example` (future placeholder files silently uncommittable); `.env1` is meaningless.
- **m4 `mobile/src/lib/sm2.ts:33-35`** — `due_date` computed from a local-time `setDate` then serialized via `toISOString()` (UTC) ⇒ possible ±1-day drift near midnight; and the file duplicates `core/src/srs.ts` (PR1, with tests) under a different grade model (0-5 vs again/hard/good/easy). Consolidate into `core/` instead of a second private SM-2.
- **m5 `api/src/routes/schedules.ts:17-22`** — hardcoded fallback (`20:00:00`, `10`, `Asia/Kolkata`) duplicated server-side and in POST defaults; magic strings should come from schema/contract defaults.
- **m6 `mobile/src/app/(self-study)/review.tsx:13-24`** — `deckId` from `useLocalSearchParams` is optional and unvalidated (query run with `undefined`), `idx` isn't reset when `deckId` changes, no loading state; `mobile/src/lib/self-study-db.ts:44-60` seeds demo cards (`deck-01`) into every fresh install — demo data shipped to real users.
- **nits** — missing trailing newlines; emoji literals in copy.

### Positive notes
- Zod validation *is* attempted on both new endpoints via `safeParse` (`decks.ts:25,49`; `schedules.ts:32`) — the right pattern, once the schemas exist.
- `userId` for inserts comes from `c.var.user.id` (token-derived), Drizzle query builder only, `onConflictDoUpdate` for the schedule upsert — no raw SQL, no client-supplied owner fields.
- Local `expo-sqlite` SQL (`review.tsx:20-22,36-39`) is parameterized device-local storage, not a business table — no violation of "API is the only writer".

---

## 2. Merge / conflict analysis

PR2 base == our `origin/main` (`817fe2e`), so conflicts are pure overlap with PR #1.

**PR2 files that ALSO differ in `origin/main...HEAD` (PR1 committed head):**

| PR2 file | PR1 side |
|---|---|
| `mobile/src/app/_layout.tsx` | PR1 rewrote providers (GluestackUIProvider, AppThemeProvider, GestureHandlerRootView) |
| `mobile/src/app/index.tsx` | PR1 rebuilt as gluestack auth gate + ConfirmSheet |
| `mobile/metro.config.js` | PR1 added `withUniwindConfig` wrapper |
| `mobile/package.json` | PR1 added gluestack/uniwind deps |
| `mobile/package-lock.json` | both regenerate |
| `mobile/.npmrc` | **add/add**: PR1 `legacy-peer-deps=true` vs PR2 `allow-scripts=true` |

**Additional conflicts with PR1's uncommitted, ship-bound work** (`git diff --name-only origin/main`): `mobile/app.json`, `package.json`, `package-lock.json`.

**Semantic (non-textual) conflicts — worse than the text ones:**
1. PR1 **deletes** `mobile/src/components/themed-text.tsx` / `themed-view.tsx` (no references remain in PR1's tree) — PR2's two new screens import them ⇒ hard break.
2. PR1 adds `core/src/srs.ts` + tests; PR2 adds `mobile/src/lib/sm2.ts` — two divergent SM-2 implementations.
3. Both rewrite `mobile/src/app/index.tsx` auth-gate semantics (opposite directions).
4. PR1 mounts `/questions` in `api/src/app.ts`; neither side mounts `/decks`, `/schedules`.
5. PR2's metro rewrite would strip PR1's uniwind wrapper.

---

## 3. UI-library migration classification (PR1's gluestack-ui + uniwind + Nord token stack)

Classes: **(a)** no change needed · **(b)** port mechanically · **(c)** restyle onto new tokens · **(d)** rework (depends on structure PR1 changed).

| PR2 file (UI-relevant) | Class | Evidence / exact lines |
|---|---|---|
| `mobile/src/app/_layout.tsx` | **(d)** | PR1 restructured root layout (providers/uniwind/theme). Hook at `:15-27` must be re-applied onto PR1's `AppShell` **and** fix `me.role` at `:24`. |
| `mobile/src/app/index.tsx` | **(d)** | Full rewrite collides with PR1's gluestack gate (Box/Button/ConfirmSheet/meStatus flow). Raw hex in `StyleSheet` `:60-87` (`#2e3440`, `#eceff4`, `#3b4252`, `#88c0d0`, `#434c5e`, `#4c566a`, `#d8dee9`, `#e5e9f0`) is dark-only — unreadable in PR1's light theme; rebuild with `Box className="bg-card"` / `text-muted-foreground` + `--*-text` tokens. Also restores auth gate (M1). |
| `mobile/src/app/(self-study)/index.tsx` | **(d)** | Imports deleted `ThemedText`/`ThemedView` (`:3-4`); screen skeleton is simple — rewrite with gluestack `Box`/`Text`/`Button` and tokens; keep `Accents.primary`→`bg-primary`, `Nord.nord6`→`text-primary-foreground`. |
| `mobile/src/app/(self-study)/review.tsx` | **(d)** | Same deleted imports (`:5-6`); hardcoded dark surfaces in styles: `card` `backgroundColor: Nord.nord1` (`:97`), `revealText`/`gradeText` `Nord.nord6` (`:100,106`), `divider` `Accents.border` (`:99`) → tokenize (`bg-card`, `text-foreground`, grade buttons → `bg-danger/warn/primary/success` with `--*-text` labels). Grade row is a natural fit for PR1's `Button` variants; destructive "Again" could reuse `ConfirmSheet` patterns only if a confirm is wanted (probably not — one tap is fine). |
| `mobile/src/components/zettel-text.tsx` | **(c)** | Compiles against PR1 (imports only `constants/theme`, which survives), but `baseText: color: Nord.nord6` (`:45`) is dark-only text and `zettelLink: color: Accents.primary` (`:46`) fails contrast on light surfaces — swap to `text-foreground` / `--primary-text` (uniwind `className`) or `Colors.light/dark` if kept RN-only. |
| `mobile/src/lib/sm2.ts` | **(a)** (logic) | No visuals. Note duplication with PR1's `core/src/srs.ts` (m4). |
| `mobile/src/lib/self-study-db.ts` | **(a)** | Local SQLite, no UI. |
| `api/src/routes/decks.ts`, `api/src/routes/schedules.ts` | **(a)** | API logic (but B1/B2/B4 first). |
| `mobile/metro.config.js` | **(d)** | Would delete PR1's `withUniwindConfig` (M4). |
| `mobile/app.json`, `eas.json`, `.gitignore`, `.env.example`, `.npmrc` | **(a)** config | Merge manually; content issues M2/M3/m1. |
| `mobile/package.json`, `mobile/package-lock.json`, `package.json`, `package-lock.json` | **(a)** mechanical | Lockfile conflict resolution only; see M7 for root-dep question. |

**Net:** 4 files need real rework onto the new stack, 1 restyle, the rest are config/logic. Nothing in PR2 already uses the new stack — it was written entirely against the pre-PR1 UI.

---

## 4. Integration order recommendation

**Merge PR #1 first, then rebase PR #2 onto post-#1 `main` and require the fixes.** Reasons:

1. PR1 is ship-bound and touches every conflict-hotspot file (`_layout.tsx`, `index.tsx`, `metro.config.js`, `package.json`/lockfiles, `.npmrc`, `app.json`); rebasing PR2 onto PR1 means resolving each hotspot **once**, against the final stack.
2. PR2's screens must be ported to gluestack/uniwind regardless (Themed* components are gone). Porting after PR1 lands avoids porting twice — the reverse order would ship PR2's old-stack screens and then re-rework them inside PR1's migration.
3. PR2 cannot land first anyway: it doesn't compile (B2/B3) and doesn't mount its routes (B1).
4. Suggested sequence: PR1 merge → author rebases PR2 → add `core/` contracts + schema + migration for decks/schedules (**breaking `core/` change — announce per AGENTS #3**) → mount routes + ownership check (B1/B4) → port UI per §3 table → revert fork identity (M2/M3) → decide root drizzle deps (M7) → tests + `npm run typecheck` (incl. `npm --prefix mobile`) with real output.

---

## 5. What was verified vs not

**Verified (real commands, OUR tree = PR1 + uncommitted work — NOT PR2's code):**
- `npm run typecheck --workspaces --if-present` → `TYPECHECK_EXIT=0` (core, api)
- `npm --prefix mobile run typecheck` (`tsc --noEmit`) → `MOBILE_TYPECHECK_EXIT=0`
- `npm test --workspaces --if-present` → `# tests 21 # pass 21 # fail 0`, `TEST_EXIT=0`
- `npm run verify` → `verify: OK — content is valid and consistent`, `VERIFY_EXIT=0`
- PR2 diff fetched in full (19 files, 3030 diff lines); GitHub API: base `817fe2e`, mergeable, 4 commits, checks = GitGuardian only.
- Symbol absence in base core (`git show origin/main:core/{contracts.ts,db/schema.ts}` + grep); `git diff --name-only origin/main...HEAD` and `origin/main` (uncommitted) for conflict sets; PR1 deletes `themed-text/themed-view` (files absent from working tree, present in `origin/main`).
- `npm view react-native-segmented-control version` → `1.1.0` (exists); `npm view expo-sqlite@57.0.3` → exists.

**Not verified:**
- Did not run typecheck/tests *against PR2's tree* (no checkout permitted; working tree holds PR1's uncommitted work). B2/B3 are proven by symbol/type absence rather than a run.
- Could not post to GitHub (`gh` unauthenticated).
- Runtime behavior (Expo Router matched routes, EAS builds) not executed; no device/emulator run.
