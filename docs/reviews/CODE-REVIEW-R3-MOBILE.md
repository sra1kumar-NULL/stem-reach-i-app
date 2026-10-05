# Round 3 code review: mobile app

Scope: `mobile/src` (routes, components, state, lib, api client), `app.json`, `eas.json`, `vercel.json`, metro/tsconfig/eslint config, `mobile/public`, `scripts/build-apk.sh`, `e2e/`. Skipped by instruction: `(teacher)/students.tsx`, `(teacher)/index.tsx` and their new components (`components/students/*`, `components/teacher-home/*`).

Method: read the code, then reproduced behaviour on the running web stack (http://localhost:8301) with headless Chrome probes (scratch scripts in `/tmp/stem-e2e/review-mobile/`, not in the repo), and produced a real web export (`expo export --platform web`, output kept in the session scratchpad) to measure the bundle. No source file was edited. The e2e suites were not run (the probes only read; a few GETs were rewritten to 401 inside the browser, nothing was written to the DB).

Severity: blocker / major / minor / nit. Confidence: H = reproduced or unambiguous in code, M = code-read, plausible, L = inferred. Effort: S (under 1 h), M (half day), L (more than a day).

## Verification (real output)

Run from the repo root.

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 (core, api, scripts, mobile all clean) |
| `npm test` | exit 0. core 34/34, api 165/165, scripts 4/4, mobile 103/103 (`node --test src/lib/*.test.ts`) pass, 0 fail |
| `npm run lint` | exit 0 (`eslint . --max-warnings 0`; note `src/components/ui/**` is excluded from lint) |

Mobile tests cover only pure `src/lib/*` helpers. There are zero component, screen, auth-flow or api-client tests, which is why most findings below (all in glue code) are invisible to CI.

Web export: `expo export --platform web` succeeds. Entry bundle 3.9 MB raw / about 967 KB gzip, plus 133 KB worker, 7.0 MB of assets (2.4 MB of that is font files, 608 KB the sqlite wasm). The teacher invite code that sits in `mobile/.env` is NOT in the bundle (checked with a fixed-string grep of the built JS); only `EXPO_PUBLIC_*` values are inlined.

## Summary

The core student loop (feed queue, skip/lock, SM-2, owner-scoped local DB, sign-out cap) is carefully built and well unit tested. The weaknesses are at the seams:

1. There is no auth or role guard on any route except `/`. A signed-out visitor or a student can open teacher screens, and `/summary` shows a fabricated "Daily Revision Complete!" to anyone.
2. Session loss mid-use (refresh failure, 401, sign-out in another tab) is never turned into a redirect, and 401 or forced-password-change errors are shown as misleading text.
3. The brand fonts do not render on web at all, and 2.1 MB of unused Nunito weights are shipped.
4. The release/APK identity is still the Expo template (package id, icons, splash, PWA icons, debug-signed, `allowBackup=true`).
5. Several caches and "today" values are frozen for the life of a mounted screen.

---

## 1. Logic bugs

### 1.1 No route guards: signed-out users and students can open teacher routes. MAJOR, H
- Evidence: `src/app/(student)/_layout.tsx:3-4`, `src/app/(self-study)/_layout.tsx`, `src/app/(teacher)/_layout.tsx:25-77`. Each is a bare `Stack`/`Tabs`; the only gate is `src/app/index.tsx:37-93`, which runs only for the `/` route.
- Reproduced (web, signed out): `/calendar` renders the full teacher calendar and tab bar; `/students`, `/catalog`, `/questions`, `/reports`, `/participation` render the teacher chrome with "Your session has expired. Please sign out and sign in again." plus a useless Retry. `/summary` renders "Daily Revision Complete!" with no session.
- Reproduced (web, student s1): `/calendar` renders; `/students` and `/reports` show "Your account doesn't have access to this. Retry" with the teacher tab bar. Retry can never succeed (403).
- Failure scenario: a student bookmarks or follows a teacher URL, or a deep link `mobile://calendar` opens it; the PWA shows a teacher shell with dead-end Retry buttons. Also any signed-out state after a session loss leaves the user inside the shell (see 1.2). The API still enforces authz, so this is UX and defense in depth, not a data leak.
- Fix (M): add a shared `useRequireRole('teacher' | 'student')` in each group layout that returns `<Redirect href="/" />` when `!session`, `must_change_password`, or the role mismatches (and renders the loading state while `loading || (session && !me && meStatus !== 'error')`). `(self-study)` is intentionally open (offline mode). Guard `summary.tsx` to redirect to `/(student)` when `attempted`/`correct` are missing instead of showing the congratulation copy.

### 1.2 Session loss is never navigated; 401/403 are shown as misleading text. MAJOR, H
- Evidence: `src/state/auth.tsx:213-217` (`onAuthStateChange` only sets state, no navigation); `src/api/client.ts:61-82` (no 401/403 handling); `src/lib/friendly-error.ts:35-39` tells the user to "sign out and sign in again" but nothing signs them out or sends them to `/change-password`.
- Reproduced: with every `/api/**` response rewritten to 401, loading `/` shows "Couldn't load your profile. The server may still be starting up." (`src/app/index.tsx:62-68` treats every `/api/me` failure as a cold start). No redirect to login.
- Failure scenarios: (a) refresh token revoked or expired: the user stays on a mounted screen showing "session expired" banners; (b) a student whose password a teacher just reset: the API returns 403 `password_change_required` and the app tells them to sign out and in again instead of routing to `/change-password`; (c) 401 on `/api/me` is mislabelled "server starting up".
- Fix (M): in `apiFetch`, on 401 call a registered `onUnauthorized()` (set by `AuthProvider`) that signs out locally and `router.replace('/login')`; on 403 `password_change_required` `router.replace('/change-password')`. In `loadMe`, distinguish `ApiError 401` (sign out) from network or 5xx (retry state).

### 1.3 `apiFetch` has no timeout or abort; the cold-start API hangs spinners forever. MAJOR, M
- Evidence: `src/api/client.ts:69-76` (plain `fetch`, no `AbortController`). The Render free tier sleeps and cold starts take 30-60 s (`docs/DEPLOY.md`, memory note).
- Failure scenario: the student opens the app after 15 minutes idle; `Index` and the feed show an indefinite `ActivityIndicator` with no message, no cancel, no sign-out (the retry UI only appears after a failure, and a hang is not a failure).
- Fix (S): `AbortSignal.timeout(20_000)` (or `AbortController` fallback) and throw `TypeError('timeout')`; show "server waking up, still trying" after 8 s.

### 1.4 Raw transport error on the login screen. MINOR, H
- Evidence: `src/app/login.tsx:294-296` shows `e.message` verbatim; `state/auth.tsx:259-260` rethrows Supabase's message. Reproduced: with the auth host unreachable, the login form shows exactly "Failed to fetch". Violates "no raw error strings". Same pattern in `forgot-password.tsx:~102` and `app/profile.tsx:153`.
- Fix (S): route through `toFriendlyError` (it already maps "failed to fetch"/"network request failed"), keep "Invalid login credentials" readable.

### 1.5 Local self-study DB and SM-2: mostly correct; three real defects. MINOR
Verified OK: owner scoping is applied in every statement in `src/lib/self-study-owner.ts:275-322` (cards are joined to decks by owner); `resolveOwnerId` waits during `loading`; SM-2 delegates to core and uses local-calendar dates (`lib/sm2.ts`); `newLocalId` avoids same-ms PK collisions; DB open and schema init are single-flight.
- (a) Failed migration leaves an open transaction. `src/lib/self-study-db.ts:215` runs `BEGIN; ...; COMMIT;` via `execAsync` with no `ROLLBACK` on error; `schemaPromise` is reset to null (`:217-220`), so the retry hits "cannot start a transaction within a transaction" forever until app restart. M confidence (needs a failing ALTER to trigger). Fix (S): use `db.withTransactionAsync` or `try { ... } catch { await db.execAsync('ROLLBACK') }`.
- (b) After a save in the deck editor the whole screen swaps to the loading branch. `src/app/(self-study)/deck.tsx:135` calls `load()`, which sets `loading=true`; `:182` `if (loading) return <spinner>` omits the `<Modal>` (defined at `:362`), so the "keep the editor open for the next card" modal is unmounted and remounted on every save. On web it re-appears (checked); on native this closes and reopens the sheet and drops the keyboard each time. M confidence for native. Fix (S): reload with a `silent` flag that never toggles `loading` after first load.
- (c) Offline decks vanish on account creation. Decks created in "Study offline" are owner `offline` and are never shown after sign-up or login (`use-self-study-owner.ts`). Matches the doc'd design, but the UI never warns. Needs a product decision: claim `offline` decks into the account on first sign-in, or warn on the offline screen and sign-up.

### 1.6 Stale caches. MAJOR for 1.6a, MINOR for the rest
- (a) `src/app/(teacher)/calendar.tsx:56,82-83,95-100`: the month fetch runs only when `month` changes (30 s throttle), there is no `useFocusEffect` (grep confirms only participation, questions list and reports have one), and `dayCache` (`:~104`) never expires. Tabs stay mounted, so after activating topics on Today, creating questions, or deleting a topic in Catalog, the Calendar tab shows the old dots and counts until the app reloads. Fix (S): `useFocusEffect` that refetches the visible month with `silent: true`, clear `dayCache` on focus.
- (b) `src/api/questions.ts:24-35,49-52`: module-level `cache` is never cleared on sign-out and `findQuestion` is cache-first. Another teacher account on the same device (shared school phone) can open an editor from cached rows by id, and the editor can start from a stale row (e.g. `submission_count` out of date, so the lock state is wrong until the server rejects). Fix (S): clear on `SIGNED_OUT`; for `edit.tsx` re-fetch in the background when the cached row is older than N seconds.
- (c) Syllabus is fetched independently by home, calendar, questions list, edit, catalog and import (`getSyllabus` in six places) and held in component state, so a chapter/topic created or deleted in Catalog is not reflected in a mounted Calendar topic picker (`calendar.tsx:~250` `if (!syllabus) loadSyllabus()` never refreshes). Fix (M): one `useSyllabus()` store with a `version` bumped by `api/catalog.ts` writes (same pattern as `questionsVersion`).
- (d) Feed (`app/(student)/index.tsx:111-134`) loads once on mount. A PWA left open past midnight keeps yesterday's set and submits answers to it. Fix (S): refetch on `AppState` active / `visibilitychange` when the local date changed.

### 1.7 Client "today" is device-local and frozen. MINOR (MAJOR if teachers and school are in different time zones), M
- `calendar.tsx:56` (`useState(() => localDateString())`), `reports.tsx:30-34` (always sends explicit device-local `from`/`to`), `students.tsx` (`useMemo(..., [])`). `src/api/client.ts:116` documents that omitting the date uses the server's `APP_TIMEZONE` calendar day, but Reports defeats this by always sending a device-local date. A teacher travelling or a device in UTC sees "today" differently from the server's activation day; a long-lived tab keeps yesterday as "today" (past-day check in plan mode, `calendar.tsx:~103`).
- Four duplicated date helpers: `localDateString` (`lib/sm2.ts:33`), `localIsoDate` (`lib/students.ts:14`), `addDays` in both `lib/sm2.ts:43` and `lib/calendar.ts:70`, and `dayNumber`. Fix (M): one `lib/dates.ts`; let Reports omit `from/to` for "Today"; recompute "today" on focus.

### 1.8 Feed queue logic. MINOR, M
- `lib/feed-queue.ts` is correct and tested. One edge in the screen: `canSkip` only needs "another unanswered card exists", but when the current card is already the last in `order` (reached through `nextIndex` wrap-around), `skipCard` moves it to the end of the same position. The skip count and the "Skipped. It will come back at the end." announcement fire with no visible change (`app/(student)/index.tsx:209-214`). Fix (S): when the card is already last, scroll to the first other unanswered card instead.
- `load()` runs `Promise.all([getFeedToday(), getMe()])` (`:114`); `/api/me` is already in `useAuth().me`, so every feed load makes a duplicate request, and a transient `/me` failure blocks the feed. Use `useAuth().me` for streak/name/id. (S)

### 1.9 Other
- `app/(teacher)/catalog.tsx:~93-96` reorders with `Promise.all` of N PATCHes (not atomic; partial failure leaves a half-renumbered chapter, then `load()` heals it). Needs an API bulk reorder to be correct. MINOR, L effort.
- `calendar.tsx:~236-248` "Copy last week" applies groups sequentially; if group 2 fails it throws, and `runPending` shows "Could not save the plan" although group 1 was applied. MINOR (S): report partial success.
- Web `/` collision: `app/index.tsx`, `(student)/index.tsx`, `(teacher)/index.tsx` and `(self-study)/index.tsx` all resolve to the URL `/`. Reproduced: "Study offline" sits at `http://localhost:8301/` and a browser reload re-runs the gate, sending an offline-mode user to `/login` and losing their place. MINOR (M): give self-study a real path (`/study`) via a non-index route name.
- A signed-in user can still open `/login` and sign up screens (reproduced). NIT (S): `<Redirect href="/" />` when `session`.
- `src/app/_layout.tsx:353-366`: `useFonts` returns `[loaded, error]`; the error is ignored, so a font load failure (offline first launch on web) renders `null` forever. MINOR (S): proceed when `error`.
- `AuthProvider` does not call `supabase.auth.startAutoRefresh()/stopAutoRefresh()` on `AppState` changes (Supabase's RN guidance). On native a token can expire while backgrounded and the first requests after resume hit 401 (see 1.2). MINOR, L confidence (S).
- Hourly `TOKEN_REFRESHED` re-runs `loadMe` (`state/auth.tsx:239-247`) and a transient failure sets `me=null`, flipping a mounted Profile screen to an error state. MINOR (S): keep the previous `me` on refresh failures.

---

## 2. Duplication and dead code

Good news: the five `initials` copies are gone (single `lib/profile.ts:8`, 5 importers). `zettel-text.tsx` is NOT dead; it is used by `(self-study)/review.tsx:236-240`.

- Sheet/modal implementations (MINOR, M effort to unify). `ConfirmSheet`, `FormSheet`, `ThemeSheet`, `SectionPicker`, `RevisionsSheet`, `CoachOverlay` each own a `<Modal>` + scrim, and two screens inline their own: `(self-study)/index.tsx:211` (create deck) and `(self-study)/deck.tsx:362` (card editor), plus the `students.tsx` local one (not reviewed). `const SCRIM` is re-declared in 6 files. Behaviour differs: `FormSheet` has `maxWidth: 640` and a scrollable keyboard-avoiding body; `ConfirmSheet` has no max width (reproduced: full 1280 px wide on desktop web); the two inline modals are neither scrollable nor width-capped. Fix: move the self-study create/edit modals onto `FormSheet`, extract `SheetScaffold` (scrim + grabber + insets + max width) used by all, add the max width to `ConfirmSheet`.
- Five copies of the sign-out sheet markup (`app/index.tsx:49`, `change-password.tsx:134`, `summary.tsx:117`, `profile.tsx:398`, `(teacher)/index.tsx:255`) around the shared `useConfirmSignOut` hook. Extract `<SignOutSheet />`. (S)
- Profile-local `Card`/`Row`/`SectionTitle`/`Divider`/`Stat`/`Chip` (`app/profile.tsx:~370-480`) while `components/ui/card` exists and is unused.
- Unused `components/ui` primitives (no importer outside `ui/`): `alert`, `badge`, `card`, `center`, `form-control`, `image`, `progress`, `hstack`, `vstack`, `spinner`. They are excluded from lint and typecheck noise but cost maintenance. (S) delete the unused ones (keep `button`, `box`, `text`, `heading`, `input`, `skeleton`, `alert-dialog`, `avatar` after checking the latter two).
- Two reduce-motion implementations: `useReduceMotion` in `components/swipe-hint.tsx:5-20` (AccessibilityInfo) and `useReducedMotion` from reanimated in the sheets. One shared hook, used everywhere (see 3.4).
- Unused dependencies (0 imports in `src/`): `@legendapp/motion`, `react-aria`, `react-stately`, `@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-web-browser`, `expo-device`, `expo-image`, `tailwind-variants`. (`expo-system-ui`, `react-native-worklets`, `expo-linking` are needed as peers/plugins; keep.) Verify with `npx depcheck` then remove. (S)
- Template leftovers: `assets/images/{react-logo*,expo-badge*,expo-logo,logo-glow,tutorial-web}.png`, `assets/images/tabIcons/*`, `assets/expo.icon/*` are not referenced by any source; empty directory `mobile/components/`; `package.json` script `reset-project` points at a missing `scripts/reset-project.js`; `tsconfig.json` path `@/* -> ./*` and `@/assets/*` support a `mobile/components` layout that no longer exists. (S)
- Dead style: `toast.tsx:227` `emoji: { display: 'none' }`.
- The `AVATAR_COLORS` palette is duplicated in `reports.tsx`, `participation.tsx` and `components/students/student-row.tsx`, as is the accuracy colour ramp. Extract to `constants/theme.ts`. (S)
- `app/(teacher)/profile.tsx` re-exports the root `app/profile.tsx`. As a tab it shows a "Back" button (see 4), a pattern no other tab uses.

---

## 3. Accessibility

### 3.1 Toasts are silent for screen readers. MAJOR, H
`src/components/toast.tsx:173-197`: no `accessibilityRole="alert"`, no live region, no `announceForAccessibility`. "Name updated", "Password updated", "Card deleted", all error toasts and the Plan result are invisible to TalkBack/VoiceOver users. Also `top: 56` (`:212`) ignores safe-area insets (overlaps a notch/Dynamic Island) and the toast renders in the root window so it sits behind any open `<Modal>` (the code comments already work around this in the self-study modals). Fix (S): call `AccessibilityInfo.announceForAccessibility(message)` in `showToast`, add `accessibilityLiveRegion="polite"` and `role="alert"`, offset by `useSafeAreaInsets().top + 8`.

### 3.2 Contrast: solid primary fill is 3.5:1 in several places. MAJOR, H
The CSS token `--primary` was deliberately darkened for 4.5:1 (`global.css:11-14`), but `Accents.primary` (`constants/theme.ts`, Nord10 `#5E81AC`) is still used as a fill with Nord6 text/icons. Measured contrast: Nord6 on `#5E81AC` = 3.50:1 (AA needs 4.5 for these 14-16 px labels). Affected: signup role toggle (`signup.tsx:222` + `text-primary-foreground`), calendar "Done" pill and check marks (`calendar.tsx:327-328,554`, hard-coded `#ECEFF4`), import checkbox (`import.tsx:357`), feed/profile avatar initials (`onAccent(Accents.primary)`). Destructive buttons use white on `#BF616A` = about 4.1:1. Fix (S): set `Accents.primary` to the same value as `--primary` (76,106,145 = `#4C6A91`), and derive hard-coded `#ECEFF4` from `Nord.nord6`. This also removes the dual source of truth between `theme.ts` and `global.css`.

### 3.3 Nested interactive controls. MINOR, H
`(self-study)/deck.tsx:306-337`: each card row is a `Pressable role=button` that contains a `Button` (delete). Web logs "In HTML, <button> cannot be a descendant of <button>... hydration error" (reproduced), and keyboard/screen-reader users get a button inside a button. Fix (S): make the row a `View` with two sibling pressables (edit area + delete).

### 3.4 Reduced motion is honoured in only 6 places. MINOR, H
Honoured: `swipe-hint`, `coach-overlay`, sheets. Not honoured: `login.tsx:263-274` (an infinite looping 5 s float on four decor icons, which also fails WCAG 2.2.2 pause/stop since it runs forever and cannot be stopped; the loop is never stopped on unmount either), `Confetti` (`components/confetti.tsx`), `question-card.tsx` entry/pop/flip springs, feed shake (`student/index.tsx:230-235`), progress bar, summary hero, toast. Fix (S/M): shared `useReducedMotion()`; skip loops and confetti, use opacity-only transitions.

### 3.5 Other
- Placeholder-only labels (lowercase "email"/"password"/"new password") on login, signup, change-password: they have accessible names but no visible label once typing starts (WCAG 3.3.2). MINOR (S/M).
- `ActivityIndicator` spinners at `app/index.tsx:25,89`, `change-password.tsx:125`, feed loading have no `accessibilityLabel`. NIT (S).
- Emoji used as content in labels and badges ("🤔 MCQ", "✨ New", "Streak: 3 🔥") are read by TalkBack as "thinking face MCQ". NIT: hide decorative emoji (`accessible={false}`) and provide plain-text labels.
- MCQ options use `role=radio` without a `radiogroup` container and without a group label (`question-card.tsx:177-183`) while `profile.tsx:257` does it correctly. MINOR (S).
- Fixed pixel sizes: feed `HEADER_HEIGHT = 64` and tab bar `height: 64` (`(teacher)/_layout.tsx:45`, label 11 px) do not grow with `fontScale` (only the card "peek" does). At 150% font scale the progress card overflows its fixed slot. L confidence, needs a device check. MINOR (M).
- Good: touch targets. A 320 px and 420 px sweep of login, feed (also flipped), profile, calendar, questions, reports, catalog, import found no horizontal overflow and no interactive element under 43 px.

---

## 4. UX consistency

- Brand fonts do not render on web. MAJOR, H. `constants/theme.ts:136-141` sets web fonts to `var(--font-sans)`/`var(--font-rounded)`, defined in `global.css:124-125` as `Nunito, ...` and `Fredoka, ...`. The faces actually registered by `useFonts` are `Nunito_400Regular`, `Fredoka_600SemiBold` etc. Reproduced: computed `font-family` of the login heading is "Fredoka, sans-serif"; `document.fonts` lists all six faces as `unloaded` (never requested). Every web user (the Vercel PWA is the main surface) sees the system sans font (Arial/Noto) instead of Fredoka/Nunito, while the app still blocks first render until the unused fonts finish loading (`_layout.tsx:364`). Fix (S): in `Fonts.web` use the registered names (`Nunito_400Regular`, `Fredoka_600SemiBold`) or define `@font-face` aliases in `global.css`.
- Native weights are synthetic. Even where the fonts do load, all text uses `Nunito_400Regular` with `fontWeight: '600'/'700'` (`theme.ts` `Type.*`); the loaded `Nunito_600SemiBold/Bold` and `Fredoka_500/700` are never referenced (grep shows only the imports). On Android, custom families ignore `fontWeight`, so "bold" text may look regular or be faux-bolded. MINOR, M confidence (S): map weights to families (`bodyBold` -> `Nunito_700Bold`, ...).
- Desktop web layout: the student feed and cards stretch to the full viewport width (reproduced at 1280 px: a 1230 px wide question card and 1230 px wide button), `ConfirmSheet` is full width, while Profile is capped at 560 px and `FormSheet` at 640 px. MINOR (S): wrap the feed list items in a `maxWidth: 640` centered column and cap `ConfirmSheet`.
- Header patterns differ per screen: self-study pages use `BackButton iconOnly` + 2xl heading + `ThemeToggle`; catalog/import use `BackButton` with label above the heading; profile uses `BackButton` + 28 px heading; the teacher tabs (Calendar, Questions, Reports) have no back button. The Profile tab reuses the stack Profile (with "Back"), so tapping Back from a tab jumps to the previous tab or `router.replace` fallback. Spacing scales also differ (`safe` padding 16 vs `column` 560 max vs `content` styles). Fix (M): one `ScreenHeader` component (title, optional back, right actions) and a `Screen` wrapper (safe area + max width + padding); hide Back when the screen is a tab.
- Error and empty states are consistent where `ErrorState` is used, but several screens still hand-roll them: `(self-study)/index.tsx:152-159`, `deck.tsx:~195-205`, `review.tsx:487-495` and `Index` show raw `e.message` strings ("failed to load decks", SQLite messages). MINOR (S): `toFriendlyError` + `ErrorState`.
- Retry is offered for permanent failures (403 "no access" and signed-out 401) on teacher screens. See 1.1/1.2.
- Wording: "card(s)" (`summary.tsx:84-85`), raw ISO dates ("Due 2026-10-05", "Next card due 2026-10-05" in deck/review) while the rest of the app uses "Mon 5 Oct". "Average" button wire value `good` is documented. NIT (S).
- The summary screen is reachable by URL with no session or score and shows "Daily Revision Complete!" (see 1.1).
- Theme preference loads asynchronously after first paint (`state/theme.tsx:265-276`), so a user who chose Dark on a Light-system device sees a light flash on cold start. NIT (M): hold the splash until the preference is read (fonts already block).

---

## 5. Performance

- Fonts: `import { Nunito_... } from '@expo-google-fonts/nunito'` (barrel) bundles every weight and italic: 2.1 MB of the 2.4 MB font payload for 3 weights actually referenced (and on web, none work, see 4). Fix (S): import from `@expo-google-fonts/nunito/400Regular` etc. and only the faces used. MAJOR for first-load size on a free-tier PWA over mobile data; H confidence.
- Entry JS 3.9 MB raw / 967 KB gzip, single bundle (`web.output: "single"`). The sqlite wasm (608 KB) and the teacher-only screens ship to students. MINOR (L): route-level lazy loading for `(teacher)`, or at least confirm Vercel serves brotli.
- Feed re-renders: `FlatList extraData={{ current, queue, skippedNote, itemHeight }}` (`student/index.tsx:493`) is a new object every render, and `renderItem`/`QuestionCard` props are inline closures, so every state change (hint timer, scroll index, submit) re-renders all rendered cards (`windowSize=5`, `initialNumToRender=2`). The React Compiler is enabled (`app.json` experiments), which mitigates but does not memoize an `extraData` identity. MINOR (S): `useMemo` the extraData, `React.memo(QuestionCard)`.
- Feed fires 2 requests per load (feed + me), and the auth gate fires `/api/me` on every full navigation (`GET /api/me` appears after each page load in the probe request log). MINOR (S).
- `Confetti` allocates the pieces array each render; negligible.
- Calendar: `getDay` and `MonthGrid` recompute on every `planMode` toggle; fine for one month.
- Startup: `AuthProvider` + `ThemeProvider` + font loading are sequential (fonts block first render, then auth restore, then `/api/me`); the 3 s `AUTH_INIT_CAP_MS` race in `apiFetch` is reasonable. NIT.

---

## 6. Security (client)

- Token storage. `state/auth.tsx:154-160`: Supabase session (with refresh token) is persisted in plain `AsyncStorage` (localStorage on web). `expo-secure-store` is not installed. Combined with `android:allowBackup="true"` (generated manifest, `AndroidManifest.xml` line `<application ... allowBackup="true">`), Google auto-backup can copy the unencrypted session JSON and local decks off the device. MAJOR for a student/minor-facing app (MASVS-STORAGE), H confidence on allowBackup, M on exploitability. Fix: `android.allowBackup: false` in `app.json` (S) now; secure-store storage adapter for native (chunked, since values exceed 2 KB) (M).
- Release APK is signed with the public Android debug keystore (`scripts/build-apk.sh` header says so). Anyone can produce an APK that Android will treat as an update of the sideloaded app. MAJOR if distributed beyond the pilot, M confidence; needs a product decision on a real keystore (EAS credentials). (S to generate and store a release keystore outside the repo.)
- Generated manifest requests `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (maxSdk 32) that the app does not use (no file or overlay APIs; import uses a web file input and `Share`). MINOR (S): `android.blockedPermissions` in `app.json`. Cleartext is correctly limited to the debug manifests; release is HTTPS-only.
- Env handling. Build-time only `EXPO_PUBLIC_*` are inlined (verified: the `TEACHER_INVITE_CODE` in `mobile/.env` is absent from the built JS, and `service_role` does not appear). But a server secret still lives in `mobile/.env` (`TEACHER_INVITE_CODE`, gitignored, with a malformed `KEY =value` spacing that the build script comments on). It is one rename (`EXPO_PUBLIC_...`) away from shipping. MINOR (S): remove it from `mobile/.env` (it belongs only in `api/.env`). `mobile/.env.example` omits `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL`.
- Misconfiguration is silent. `api/client.ts:15-24` falls back to `http://<expo host>:3000` / `http://localhost:3000`, and `state/auth.tsx:150-153` passes `''` to `createClient` when env is missing, so a Vercel build without `EXPO_PUBLIC_API_URL` ships a web app that calls localhost, and a missing Supabase URL throws at import (white screen). MINOR (S): in non-dev (`!__DEV__`) throw a clear startup error or render a config-error screen.
- Anon key in `eas.json` is the public anon JWT (expiry 2100); acceptable, and never the service key. Hard-coded production URLs are in `eas.json`, `auth-links.ts:7`, `build-apk.sh`. Fine, but they must be kept in sync with the deployment (memory note). NIT.
- Deep links. Scheme `mobile` (generic, collides with any other app using it; also `com.anonymous.mobile`) opens any route unguarded (see 1.1). No WebView and no `Linking.openURL` of user input exists; `expo-web-browser` is installed but unused. Reset links land on the Vercel web app, not the scheme. MINOR (S): rename the scheme (for example `dailyrevision`) with the package id.
- Logging: no `console.*` calls in `src/` (good); the `ErrorBoundary` shows a friendly screen but reports nothing anywhere, so production crashes are invisible. NIT.
- `vercel.json` sets no security headers (no `X-Content-Type-Options`, `Referrer-Policy`, frame protection, CSP). The Supabase session lives in localStorage on web, so an XSS-reducing CSP matters more than usual. MINOR (S): add a `headers` block.
- The `reset-password` flow signs the user out after update and the error copy is friendly. Good. The recovery session exists briefly, during which `/` would route the holder into the app; acceptable.

---

## 7. Build and release hygiene

- Package id `com.anonymous.mobile` (`app.json:21`), scheme `mobile`, slug `mobile`: Expo template defaults. Changing the application id later makes it a different app (no in-place update, and app data such as self-study SQLite decks and AsyncStorage sessions is lost), so it must be decided before wider distribution. BLOCKER for Play distribution, MAJOR for the sideload pilot. Needs a product decision (final app name, id, scheme). Effort S to change, M to migrate existing installs.
- App icon, Android adaptive icons, iOS `expo.icon`, splash image and PWA icons are all the Expo template artwork (viewed: `assets/images/icon.png`, `public/icon-512.png` show the Expo blue "^" logo; `splash-icon.png` is the white Expo logo on `#208AEF`, not the Nord palette used by the app). The APK and installed PWA ship another vendor's branding. MAJOR (needs design assets; S to wire once supplied). Splash background `#208AEF` and adaptive icon background `#E6F4FE` should use Nord.
- PWA manifest (`public/manifest.json`): has `purpose: any` icons only (no `maskable`), no `id`, no `lang`; there is no service worker, so the "installed" PWA is not offline-capable and shows a blank error offline. The manifest and apple-touch tags are injected at runtime by `<Head>` (`_layout.tsx:396-405`) because `+html.tsx` is ignored, which works in Chrome but not for crawlers/Lighthouse static checks. MINOR (M).
- Versioning: `app.json` `version: 1.0.0` and the generated Android `versionCode 1`; `build-apk.sh` never increments, so every sideloaded build reports the same version (hard to tell which build testers run; `Profile` shows `v1.0.0`). `eas.json` uses `appVersionSource: remote` + `autoIncrement` for production only, a different scheme from the local script. MINOR (S): set `android.versionCode` from `package.json`/CI or pass it in the script.
- `eas.json`: `production.android.buildType: "apk"` (Play needs `aab`); `submit.production: {}` empty; no `channel`/runtime version since updates are disabled (`expo.modules.updates.ENABLED=false`). Fine for the pilot. NIT.
- `scripts/build-apk.sh` is careful (does not `source` .env, only reads `EXPO_PUBLIC_*`, clears stale bundle cache). Concern: it commits the Supabase project URL as a default and installs a JDK from the network without checksum verification (`DEFAULT_SUPABASE_URL`, `JDK_URL`). NIT.
- `vercel.json`: SPA rewrite `/(.*) -> /index.html` is correct (static files in `dist` take precedence); no cache headers for hashed assets (Vercel defaults are fine), no headers (see 6). Build command `npx expo export --platform web` needs `EXPO_PUBLIC_*` set in the Vercel project; nothing validates them (see 6).
- `metro.config.js`: `disableHierarchicalLookup` + `watchFolders` workspace root is right; the `wasm` asset extension is needed for web sqlite (verified: wasm is emitted in the export). `eslint.config.js` ignores all of `components/ui/**`; two React Compiler lint rules are turned off globally (`react-hooks/refs`, `react-hooks/set-state-in-effect`), which hides real issues (for example `student/index.tsx:91-96` writes refs during render). NIT.
- `e2e/`: not wired into any `package.json` script; `lib.mjs` hard-codes `/usr/bin/google-chrome`, `podman exec stem-pg`, ports 8301/3100/9999, and `stack.sh` uses throwaway secrets; fine as a local dev tool but not CI-ready; `e2e/` is untracked in git. NIT (M to wire into CI).
- Untracked build outputs: `mobile/dist` (stale web export from Oct 2, gitignored), `mobile/android` (gitignored, generated).

---

## 8. Things verified fine (so nobody re-checks)

- Sign-out cannot hang: `state/auth.tsx:283-321` caps the remote call at 4 s and removes the persisted keys directly, `useConfirmSignOut` navigates after it.
- Forced password change: `Index` checks `app_metadata.must_change_password` before role routing; `change-password.tsx` blocks hardware back, refreshes the session and falls back to re-sign-in. The only gap is direct URL access (1.1/1.2).
- `apiFetch` first-request race with session restore is handled (bounded wait gate).
- Listener hygiene: keydown/wheel listeners in the feed and coach overlay are removed on blur/unmount; `ConfirmSheet` double-tap lock; toast and hint timers are cleared; the editor guards unsaved changes on native (`beforeRemove`) and web (`beforeunload`).
- No `console.*`, no `Alert.alert`, no `eval`/`dangerouslySetInnerHTML`; no hard-coded API secrets in source; `.env*` gitignored (`.env.example` tracked).
- Touch targets and 320 px overflow sweep (see 3).

---

## TOP-15 (prioritized for the coordinator)

| # | Item | Sev | Effort | Decision? |
|---|---|---|---|---|
| 1 | Add auth/role guards to `(student)`, `(teacher)` layouts and `summary.tsx` (1.1) | major | M | no |
| 2 | Handle 401 and 403 `password_change_required` in `apiFetch` (sign out + `/login`, or `/change-password`); stop labelling 401 as "server starting up" (1.2) | major | M | no |
| 3 | Fix web fonts: use registered family names in `Fonts.web`, import only used font files (4, 5) | major | S | no |
| 4 | Replace template identity: package id, scheme, app name, icon, adaptive icon, splash, PWA icons (7) | major (blocker for Play) | S + design assets | YES: final name, id, brand art |
| 5 | `allowBackup: false`, block unused Android permissions; plan secure-store session adapter (6) | major | S (+M adapter) | no (adapter: confirm scope) |
| 6 | Real release keystore instead of the debug key (6) | major | S | YES: who owns signing, EAS vs local |
| 7 | Toasts: announce to screen readers, safe-area offset, visible above modals (3.1) | major | S | no |
| 8 | Contrast: align `Accents.primary` with the darkened CSS `--primary`; remove hard-coded `#ECEFF4` (3.2) | major | S | no |
| 9 | Calendar freshness: refetch on focus, clear day cache, recompute "today"; shared syllabus store with version bump (1.6a, 1.6c, 1.7) | major/minor | M | no |
| 10 | Request timeout and "server waking up" state in `apiFetch` (1.3) | major | S | no |
| 11 | Friendly errors on login/forgot/profile/self-study screens (no raw strings) (1.4, 4) | minor | S | no |
| 12 | Self-study: fix nested button in deck rows, stop modal remount on save, `ROLLBACK` on migration failure, move modals to `FormSheet` (1.5, 2, 3.3) | minor | M | no |
| 13 | Reduced-motion everywhere (login float loop, confetti, card springs), shared hook (3.4) | minor | S/M | no |
| 14 | Dedupe: one `SignOutSheet`, one sheet scaffold (+ `ConfirmSheet` max width, feed max width), one `lib/dates.ts`, drop unused deps/ui/primitives/template assets (2, 4) | minor | M | no |
| 15 | Offline-deck ownership on sign-up/login (claim vs warn) and give self-study a real URL instead of `/` (1.5c, 1.9) | minor | M | YES: claim, warn, or leave as is |

Also worth scheduling after the top 15: client-side config validation (fail loudly when `EXPO_PUBLIC_API_URL`/Supabase env is missing in a production build), `vercel.json` security headers, remove `TEACHER_INVITE_CODE` from `mobile/.env`, mobile component/auth-flow tests (none exist), and route-level code splitting to shrink the 3.9 MB entry.
