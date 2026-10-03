# UI Plan: Missing and Incomplete UI in `mobile/`

> **Status:** draft, ready for `/plan` review (Senior Engineer, then Principal Engineer approval).
> **Scope:** `mobile/src` only. Nothing here changes `core/` contracts or the DB. Items that
> would need one are marked and deferred to [FEATURE-IMPROVEMENT-PLAN.md](FEATURE-IMPROVEMENT-PLAN.md) /
> [06-FEATURE-PLAN.md](../06-FEATURE-PLAN.md).
> **Baseline:** branch `chore/claude-setup-audit-fixes` @ `5b031f3`. All `file:line` references
> are relative to `mobile/src/` unless prefixed.
> **Related:** [gluestack-assessment.md](../gluestack-assessment.md) (component vendoring backlog),
> `.claude/skills/frontend` (a11y and state rules this plan enforces).

---

## 0. How to read this

- **§1** lists every route: what exists, and what is missing, broken or inconsistent.
- **§2** covers the cross-cutting audits: a11y, contrast, font scaling, theme tokens, keyboard,
  haptics, offline and navigation.
- **§3** is the prioritized backlog (P0 / P1 / P2). Each item has an ID, file:line evidence and
  acceptance criteria (AC).
- **§4** suggests a PR breakdown and lists the gates.

Severity key: **P0** = broken flow, dead end, data-correctness issue, or an a11y failure that blocks
a user group. Must fix before the pilot (roadmap M5). **P1** = degraded or inconsistent UX that
should land next. **P2** = polish and delight.

Contrast figures below come from WCAG 2.x relative-luminance math on the Nord hex values in
`constants/theme.ts:11-32` (computed while writing this plan, not taken from a tool report).

| Pair | Ratio | Verdict |
|---|---|---|
| `nord6` text on `nord10` (primary button label, `--primary-foreground` on `--primary`) | **3.50:1** | Fails AA for normal text (4.5) |
| `nord10` (`Accents.primary`) icon/spinner on `nord0` dark bg | 3.10:1 | Barely passes non-text (3:1) |
| `nord10` on `nord1` dark card | **2.50:1** | Fails non-text 3:1 |
| `nord3` (`Accents.border`) on `nord1` dark card | **1.36:1** | Borders effectively invisible in dark mode |
| `nord2` (`Accents.track`) on `nord1` dark card | **1.17:1** | Progress track invisible in dark mode |
| `nord11` (`Accents.danger`) as text on `nord5` light card | **3.36:1** | Fails AA text |
| `nord3` (`textSecondary`) spinner on `nord10` button | **1.83:1** | Busy spinner invisible on primary button |
| `nord4` muted text on `nord1` / `nord3` muted on `nord5` | 7.45 / 6.06 | Pass |

---

## 1. Screen-by-screen inventory

### 1.1 Root shell: `app/_layout.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Font loading (Fredoka + Nunito), `GluestackUIProvider`, nav theme, `ErrorBoundary`, `AuthProvider`, `ToastProvider`, a flat `Stack` with 6 screens (`_layout.tsx:60-67`) | **Font error is ignored.** `useFonts` returns `[loaded, error]` and only `loaded` is read (`:15-28`). A failed font load returns `null` forever, which is a blank screen. There is no `SplashScreen.preventAutoHideAsync()`/`hideAsync()` (no `SplashScreen` reference anywhere in `src`), so the "keep native splash" comment at `:27` is not guaranteed. |
| | **No route-level role guard.** `(student)`, `(teacher)` and `(self-study)` layouts are bare `Stack`s (`(student)/_layout.tsx:4`, `(teacher)/_layout.tsx:4`). On web, a student can deep-link to `/(teacher)` and get a broken teacher UI (the API 403s, so data is safe, but the UI is not). |
| | **No `+not-found` route**, so unknown web URLs land on expo-router's default page, which is unthemed. |
| | **No tab bar or persistent nav.** Student navigation is header pills. Teacher navigation is two `Link`s inside an absolutely positioned footer (`(teacher)/index.tsx:220-233`). |
| | `ToastProvider` is mounted *outside* any RN `Modal`, so toasts render behind modals (acknowledged at `(self-study)/index.tsx:51,116-119`). |

### 1.2 Auth gate: `app/index.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Loading spinner, redirect by role, profile-error state with Retry and Sign out (`:33-56`) | Spinners use a raw `View` with no background (`:18`, `:60`) and an un-tinted `ActivityIndicator`, which can show a white flash in dark mode. Should be `Box bg-background` plus a themed spinner. |
| | The error copy says "server may still be starting up". It needs the shared friendly-error mapper (P0-3), not a one-off string. |

### 1.3 Login: `app/login.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Email/password, inline error, busy state, signup link, "Study offline (no account)" (`:161-170`), decorative floating icons | **Inputs have no labels**, only placeholders (`:116-139`). Screen readers announce "edit text". |
| | **Decorative icons are focusable `Pressable`s with no label** (`:77-81`). TalkBack lands on 4 unnamed buttons before the form. |
| | The busy spinner uses `theme.textSecondary` on the primary button (`:149`). That is 1.83:1 in light mode, so it is invisible. |
| | No `returnKeyType`/`onSubmitEditing` chaining (email → password → submit). No `textContentType`/`autoComplete`, so password managers can't fill. No show-password toggle. |
| | No `ScrollView`. With `KeyboardAvoidingView behavior={undefined}` on Android (`:105`), small phones can hide the Sign in button behind the keyboard. |
| | The "New here?" link is `py-1.5` (`:154`), well under 44pt. |
| | The float loop animation (`:41-46`) ignores reduced-motion. |
| | Raw Supabase error strings are shown verbatim (`:68`). |

### 1.4 Signup: `app/signup.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Role picker, name/email/password/class fields, scroll + keyboard avoid, inline error | **The role picker has no radio semantics** (`:78-95`): no `accessibilityRole="radio"`/`accessibilityState.checked`, and it is unreachable by keyboard on web. It uses static `Accents.border`/`Accents.primary` StyleSheet (`:169-180`), so the border vanishes in dark mode. |
| | **Back button is 30pt** (`padding: 4` + 22 icon, `:68`, `:168`) and has no `accessibilityLabel`. |
| | Inputs have no labels (`:98-143`). The password rule exists only as placeholder text (`:125`), so it disappears once typing starts. No client-side email or password-length check before the round-trip. |
| | Same spinner contrast bug as login (`:153`). There is no keyboard "next" chaining. |
| | The error is not announced (`accessibilityRole="alert"`/live region missing at `:146-150`). |

### 1.5 Student feed: `app/(student)/index.tsx` + `components/question-card.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Loading, error+Retry, empty ("No revision yet today"), paged reels feed, progress + streak header, theme toggle, Study pill, sign-out | **Answer submit failures are silent.** On a network or API error the card fires `hapticLight()` and resets the selection with no message (`question-card.tsx:58-61`, `:75-77`). Offline students tap and nothing happens. |
| | **The error state is a dead end** (`:114-125`). It shows only Retry and a raw message ("Network request failed" / "HTTP 500"). There is no sign-out, no link to offline self-study, and no safe area. |
| | **No safe area on this screen.** The header uses a hard-coded `top: height > 700 ? 48 : 24` (`:172`), and each page is `height` = window height (`:219`, `:233`). That breaks on notches, gesture bars and Android nav bars. |
| | **Pages have a fixed height with no inner scroll.** A long question plus 4 options plus an explanation clips at large font scale. The flashcard flip area is `minHeight: 230` with `position:absolute` faces (`question-card.tsx:271-272`), so the answer and the eval buttons overflow and clip. |
| | **Auto-advance after 1.8s** (`question-card.tsx:40`) gives no time to read the explanation, with no pause or "Next" control. This fails WCAG 2.2.1 (Timing Adjustable) and is a real problem for slow readers. |
| | **MCQ options have no radio semantics or state** (`question-card.tsx:132-148`), and answer feedback is not announced (`:152-184`). |
| | The progress bar has no `accessibilityRole="progressbar"`/value (`:188-190`). The track uses `Accents.track` (`:264`), which is invisible in dark mode (1.17:1). |
| | **Header touch targets are under 44pt.** The sign-out circle is 42×42 (`:266-269`). The Study pill is `paddingVertical: 8` with a 14px icon (`:276`), about 36pt. |
| | Empty state: the emoji is not hidden from AT (`:130`). There is no illustration, mascot, or "meanwhile, review your decks" CTA. |
| | No pull-to-refresh, no loading skeleton, no offline indicator, no swipe hint on first use. |
| | `Confetti` ignores reduced-motion (`components/confetti.tsx`, no `useReducedMotion`). |
| | The student cannot reach summary/stats/profile without finishing the set. The streak only appears in the header. |

### 1.6 Student summary: `app/(student)/summary.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Hero emoji, score, streak, SRS due nudge, "Back to home", sign-out | **"Back to home" loops back to summary.** `router.replace('/')` (`:91`) → `index.tsx` redirects to `/(student)` → the feed reloads, sees `progress.completed` and `replace`s to summary again (`(student)/index.tsx:91-104`). A student who has finished today can never reach anything else. In particular, there is **no route to self-study** after finishing, which is when they would want it. |
| | Stats arrive as URL params (`:17`). A web refresh or deep link shows fabricated "0/0". There is no error or loading handling for `getMe` (`:23` swallows it). |
| | The "⏻ Sign out" glyph is read aloud (`:101`). The pill is about 36pt tall (`:121`). |
| | No "Review my mistakes" entry point. That needs `06` PR-08; the UI slot should be reserved now. |

### 1.7 Teacher activate: `app/(teacher)/index.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Syllabus load+error+Retry, chapter/section tri-state toggles, selection count, confirm dialog, toast, links to Participation/Performance | **The footer overlaps the list.** It is `position:absolute` with no background (`:203`, `:310`), so section rows scroll *under* transparent text and buttons. `paddingBottom:140` (`:199`) only helps at the very bottom. |
| | **No checkbox semantics** on chapter/section rows (`:165-192`): no `role="checkbox"`, no `checked`/`mixed` state. The state is shown by colored dots plus "✓"/"—" text glyphs (`:166`, `:170`, `:191`). This is colour-dependent, and the "—" uses `Accents.border`, which is invisible in dark mode. |
| | **Teachers cannot deactivate today's revision.** `selected.size === 0` disables the button (`:110-113`, `:212`). The intent needs a decision (open question Q1). |
| | The sign-out pill is about 30pt (`:280-289`) and uses raw `Text` with a hard-coded `fontSize: 13` (`:134`, `:290`). The Retry is `size="sm"` (`min-h-8` = 32pt, `:148`). |
| | No header indicator of what is **currently live** for students. The "was active today" hint only appears on deselected rows (`:188`). |
| | The loading state is a bare spinner (`:155`). There is no empty state if the syllabus has zero chapters. |
| | No haptic on activation success or failure. The confirm-dialog copy branch for `!isChanged` (`:257-259`) is unreachable because `save()` skips the dialog when nothing changed (`:114-115`). |

### 1.8 Teacher participation: `app/(teacher)/participation.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Stats chips, per-student rows with status chips, pull-to-refresh, focus reload | **The error state has no Retry** (`:85-90`), and pull-to-refresh is gone because the `FlatList` isn't rendered. That is a dead end. |
| | **Date is UTC** (`:36`, `toISOString`). Before 05:30 IST a teacher sees *yesterday*. Tracked as `06` Q6. The UI should use a shared `localDay()` helper. |
| | **Back is a `Link href` push** (`:72`), not `router.back()`, so the stack grows on every round-trip and Android back walks through stale copies. The 22px chevron with `paddingVertical:4` (`:149`) is under 44pt. |
| | No empty state for "no activation today" or "no students in class". It renders `0/0`. |
| | No class-section filter, although the client already supports it (`api/client.ts:108-109`). No date picker for past days. No tap-through to student detail. |
| | Status chips rely partly on colour. They do have icon+text (`:115-117`), which is good, but `Nord.nord2` "pending" fill is low-contrast against the dark card. |

### 1.9 Teacher performance: `app/(teacher)/reports.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Range chips (Today/7d/30d), class stats, per-section accuracy bars, student leaderboard, pull-to-refresh | **The error state has no Retry** (`:126-131`), the same dead end as participation. |
| | **Range math is UTC** (`:26-34`). |
| | **Range chips are about 30pt with no selected state** for AT (`:113-120`, `:226-232`). They should be `tabs`/`radio` per the gluestack assessment. |
| | **`report.srs` is fetched but never rendered.** `PerformanceReport` embeds `srs: SrsStatsDto` (`core/src/contracts.ts:267`). This is a free teacher insight with no contract change needed. |
| | Students are rendered in `ListFooterComponent` with `.map` (`:181-205`), which is not virtualized and fine for 40 students but not beyond. A "rank #" leaderboard of accuracy can shame low performers. Consider an opt-in/hidden ranking (`05-ROADMAP` V2 #6 says "opt-in"). |
| | Same back-link push issue (`:98`). Raw `Text` with hard-coded sizes (`:118`, `:146`, `:168`, `:201`). |
| | No drill-down from section to questions (item analysis), and no export. |

### 1.10 Self-study deck list: `app/(self-study)/index.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Local SQLite deck list, due-count pill, empty state with CTA, create-deck modal with inline error, focus reload | **There is no way to add, edit or delete cards.** `index.tsx` and `review.tsx` contain no card-authoring UI. The only card a deck ever has is the seeded "Welcome to …" card (`:101-111`). The feature is unusable beyond the demo. |
| | **No edit or delete for decks.** There is no long-press, swipe or overflow menu. |
| | **No back or home control.** It is reachable from login (`login.tsx:165`) and the feed (`(student)/index.tsx:194`), but the header has only New Deck and theme (`:128-144`). On web there is no in-app way out. |
| | Deck stats show only "N due". There are no total/new/learning/mature counts and no last-studied date. |
| | The create error is coloured `Accents.danger` (`:257`), which is 3.36:1 on a light card and fails AA. It should be `text-danger-text`. |
| | Tapping the scrim discards typed input with no confirmation (`:217-221`). The title field has no max length or label. |
| | **The "today" date is UTC** (`:63`, `:96`) while SM-2 uses local `setDate` then `toISOString` (`lib/sm2.ts:29-36`). Due counts can be off by a day around midnight IST. |
| | The deck id `deck-${Date.now()}` (`:95`) is fine locally but will collide if decks are ever synced. Flag this for the sync feature. |

### 1.11 Self-study review: `app/(self-study)/review.tsx`

| Exists | Missing / broken / inconsistent |
|---|---|
| Missing-deck state, error+Retry, "All caught up" state, show answer, 4-grade SM-2, haptics, SR announcements (`:69-78`), Zettel links | **Reviews every card, not just due ones.** The query is `SELECT * … WHERE deck_id = ? ORDER BY due_date` (`:50-52`). The list says "0 due" but review still serves all cards, and grading not-yet-due cards pushes them further out. This is a data-correctness bug in the SRS schedule. |
| | **"Again" cards are not re-queued in-session.** Grade 0 sets interval 1 and moves on (`:85-108`, `lib/sm2.ts:21-24`). Anki and Brainscape re-show lapses before the session ends. |
| | **The 4 grade buttons in one row** (`:230-267`) truncate at large font scale and have no hint of the next interval ("<1d / 1d / 6d / 15d"). |
| | **No session summary** (cards reviewed, again count, next due). The "All caught up" copy (`:188-190`) is shown even after reviewing non-due cards. |
| | The back link pushes (`:139`). A Zettel link pushes another review of possibly the *same* deck (`:121`), so the stack can loop. |
| | No edit-card or delete-card action from inside review. No card counter progress bar. |

### 1.12 Shared components

| Component | Gap |
|---|---|
| `components/toast.tsx` | No `accessibilityLiveRegion`/`aria-live` (`:47-71`). Hard-coded `top: 56` ignores safe-area insets (`:86`). Renders behind RN `Modal`s. Raw `Text` with fixed `fontSize: 14` (`:102`). |
| `components/error-boundary.tsx` | Raw `Pressable` with no role or label (`error-boundary.tsx:37`). Hard-coded `Nord.nord6` on `Accents.primary` (3.5:1). "Try again" just clears state and will re-crash on a deterministic error. Needs a "Go home" action. |
| `components/confetti.tsx` | No reduced-motion check. Not hidden from AT. |
| `components/ui/button/index.tsx:38-43` | **No size meets 44pt.** `default` has no min-height, `sm` = `min-h-8`, `lg` = `min-h-10`, `icon` = `min-h-9`. Screens patch this ad hoc with `min-h-11` (self-study, confirm-sheet, theme-toggle) but not elsewhere. Fix it at the token. |
| `components/ui/skeleton` | Vendored and **unused**. Every screen uses a bare `ActivityIndicator`. |
| `components/ui/form-control` | Vendored and **unused**. No input on any screen has a programmatic label. |

### 1.13 Routes that don't exist yet (needed by this plan)

| Route | Why |
|---|---|
| `(self-study)/deck/[deckId].tsx` | Deck detail: card list, stats, add/edit/delete, "Review due" CTA (P0-6) |
| `(self-study)/card-editor.tsx` (modal) | Create/edit a card front/back with Zettel link helper (P0-6) |
| `(student)/profile.tsx` | Streak, SRS stats, settings (theme, haptics), sign-out. This is the mount point `06` PR-05/PR-12 already assume. |
| `+not-found.tsx` | Themed 404 with a "Go home" button |
| `(teacher)/student/[id].tsx` | Per-student drill-down (P2). Needs the API to expose per-student history. **Contract change**, so it is deferred. |

---

## 2. Cross-cutting audits

### 2.1 Accessibility

| Check | Status | Evidence |
|---|---|---|
| Labels on inputs | ❌ none | `login.tsx:116-139`, `signup.tsx:98-143`, `(self-study)/index.tsx:229-251` |
| Roles/state on custom controls | ❌ | role picker `signup.tsx:78-95`, activation rows `(teacher)/index.tsx:165-192`, MCQ options `question-card.tsx:132-148`, range chips `reports.tsx:113-120` |
| Live announcements | ⚠️ partial | Good: `review.tsx:69-78`, `confirm-sheet.tsx` busy announce. Missing: toast, answer feedback, form errors, activation result |
| Decorative content hidden | ❌ | login decor icons `login.tsx:77-101`, hero emojis (`(student)/index.tsx:130`, `summary.tsx:42`, `review.tsx:183`), confetti |
| Touch targets ≥44pt | ❌ 10+ violations | Button tokens `ui/button/index.tsx:38-43`. Feed header `(student)/index.tsx:266-276`. Teacher sign-out `(teacher)/index.tsx:280-289`. Back links `participation.tsx:149`, `reports.tsx:224`, `review.tsx:279`. Signup back `signup.tsx:168`. Range chips `reports.tsx:226-232`. Login link `login.tsx:154`. Summary sign-out `summary.tsx:121` |
| Font scaling | ❌ | Fixed-height feed pages `(student)/index.tsx:219`. Absolute flip faces `question-card.tsx:271-272`. 3- and 4-button rows `question-card.tsx:213-223`, `review.tsx:230-267`. Fixed toast `top`. |
| Timing | ❌ | 1.8s auto-advance `question-card.tsx:40` |
| Reduced motion | ⚠️ | Respected in `confirm-sheet`/`theme-sheet`. Ignored in `confetti`, login float loop, summary pop, question-card springs |
| Not colour-only | ⚠️ | MCQ feedback has ✅/❌ (good). Activation rows rely on dot colour plus ambiguous glyphs. |
| Focus/back | ❌ | `Link href` pushes instead of back. Summary↔feed loop. Self-study has no exit. |

### 2.2 Contrast and theme tokens (Nord light/dark)

- **Primary button label is 3.50:1** (`global.css:11-12`, `:40-41`, nord6 on nord10). Fix at the token level. Options: (a) darken the light-mode `--primary` fill toward the existing `--primary-text` value (`68 96 131`), or (b) use `nord0` labels on the primary fill. Re-verify both themes ≥4.5:1.
- **`Accents` is static across themes** (`constants/theme.ts:94-114`). `border: nord3` and `track: nord2` disappear on dark cards (1.36:1, 1.17:1). Every StyleSheet using `Accents.border`/`Accents.track`/`Accents.primary` as a colour needs to move to the themed uniwind tokens (`border-border`, a new `--track` token, `text-primary-text`). The dark `--border` value is also `76 86 106` = nord3 (`global.css:52`). **Raise the dark `--border` to nord3→nord4-ish** (target ≥3:1 non-text against `--card`).
- **Dual styling system.** Raw RN `Text` with literal `fontSize`/`fontWeight` appears in `(teacher)/index.tsx:134,170,191`, `participation.tsx:117,130`, `reports.tsx:118,146,168,201`, `toast.tsx:70`, `error-boundary.tsx`. Convention (from gluestack assessment §3 #3): **uniwind classes only for new code**. Migrate these islands while touching them.
- Spinners: `ActivityIndicator color={theme.textSecondary}` on primary buttons (`login.tsx:149`, `signup.tsx:153`) → use `onAccent(Accents.primary)` as `confirm-sheet.tsx:256` already does.

### 2.3 Keyboard handling on forms

- Login/signup/create-deck have no `returnKeyType`, `onSubmitEditing`, `blurOnSubmit` or field refs.
- No `autoComplete`/`textContentType` (`email`, `password`, `newPassword`, `name`).
- Android `KeyboardAvoidingView behavior={undefined}` (`login.tsx:105`, `signup.tsx:65`, `(self-study)/index.tsx:223`). Verify `softwareKeyboardLayoutMode` (absent from `app.json`) or switch to `behavior="height"`. Login has no `ScrollView`.
- No `keyboardShouldPersistTaps` on login, so tapping Sign in with the keyboard open first only dismisses the keyboard.

### 2.4 Haptics (`components/haptics.ts`)

Used in: question-card answer/flip, self-study reveal/grade. **Missing:** activation success/error,
deck/card create/delete, role picker selection, streak milestone on summary. There is **no user
setting** to turn haptics off, and no web guard (expo-haptics is a no-op there, which is fine). It
should live behind a `useHaptics()` that reads a persisted preference.

### 2.5 Offline indicators

- There is no connectivity dependency (`mobile/package.json` has neither `expo-network` nor
  NetInfo) and no indicator anywhere.
- Network failures surface as raw `"Network request failed"` strings (feed `:40`, teacher `:55`, reports `:80`).
- Self-study works fully offline, but nothing tells the user that, or steers them there when the API is unreachable.
- The full offline queue is `06` PR-11 (L, HIGH risk). **This plan only covers the UI layer**: a
  connectivity hook, a banner, friendly copy and a self-study CTA. No queue, no contract change.

### 2.6 Navigation, back behaviour, role switching

- The flat root `Stack` plus per-group `Stack`s, with no tabs. Teachers juggle three screens through a floating footer.
- **Recommendation (P1):** `(teacher)/_layout.tsx` → `Tabs` (Activate · Participation ·
  Performance). `(student)/_layout.tsx` → `Tabs` (Today · Study · Me), with Study pointing at
  self-study (moved under `(student)` or linked) and Me = profile. The anonymous `(self-study)`
  entry from login stays a plain Stack with an explicit "Exit" to `/login`.
- Replace every `Link href="/(group)"` "Back" with a shared `<BackButton>` that does
  `router.canGoBack() ? router.back() : router.replace(fallback)`. That component is 44pt and labelled.
- Role guard: each group `_layout` checks `useAuth().me.profile.role` (from the verified `/api/me`,
  AGENTS #5) and `Redirect`s on mismatch. It is presentation only, because the API remains the enforcement point.

---

## 3. Prioritized backlog

### P0: must fix before pilot

| ID | Item | Evidence | Acceptance criteria |
|---|---|---|---|
| **P0-1** | **Fix the summary ↔ feed loop and give finished students somewhere to go** | `summary.tsx:91`, `(student)/index.tsx:91-104` | "Back to home" no longer re-enters summary. The feed renders a **"Done for today" state** (score, streak, SRS due, CTAs: *Review my decks*, *Sign out*) when `progress.completed` is true on load, and only routes to `summary` on the in-session completion transition. Summary reads score from `getMe`/feed rather than URL params, or degrades gracefully on refresh (no "0/0"). Manual: complete a set → Back to home → lands on the Done state; web refresh on `/summary` shows no fabricated numbers. |
| **P0-2** | **Surface answer-submit failures** | `question-card.tsx:58-61`, `:75-77` | On submit error the card shows an inline, announced message ("Couldn't send — check your connection") with a Retry, and keeps the selected option visibly pending. No silent reset. Verified offline in airplane mode on Android and in web DevTools offline. |
| **P0-3** | **Friendly error and offline states on every data screen** | feed `(student)/index.tsx:114-125`, participation `:85-90`, reports `:126-131`, teacher `:143-152`, `app/index.tsx:33-56` | One shared `<ErrorState>` component plus a `toFriendlyError(e)` mapper (network → "You're offline", 401 → "Session expired", 5xx → "Server is waking up…"). **Every** error state has Retry, and student/teacher screens also have Sign out. The student feed error also offers *Study offline decks*. A lightweight `useOnline()` (add `expo-network`, as PR-11 already plans) drives a slim themed banner on feed and teacher screens. No raw `HTTP 500`/`Network request failed` text reaches the UI. |
| **P0-4** | **Teacher activation footer overlaps list** | `(teacher)/index.tsx:199,203,310` | The footer has an opaque `bg-background` surface with a top border and safe-area bottom padding, *or* is laid out in flow below the list. No list row is ever visible through footer text at any scroll position (screenshot at 360×640 and 412×915). |
| **P0-5** | **Self-study reviews only due cards, and dates are consistent** | `review.tsx:50-52`, `(self-study)/index.tsx:63,96`, `lib/sm2.ts:29-36` | The review query filters `due_date <= localToday()`. The deck-list due count and the review queue match exactly. One `localDay()` helper (local calendar date, not UTC) is used by the list, the review and SM-2. "Study ahead" is an explicit secondary action, not the default. Test: create a deck, grade Good, re-open, and review says *All caught up*, not the same card. |
| **P0-6** | **Self-study card and deck management** (the feature is unusable without it) | no card UI anywhere. Seed only at `(self-study)/index.tsx:101-111` | New deck detail route listing cards (front preview, due date), with **Add card**, **Edit card**, **Delete card** (`ConfirmSheet`), deck **Rename/Delete** (`ConfirmSheet`, cascades via the existing FK `lib/self-study-db.ts:71`), and a **Review N due** CTA. The card editor has labelled multiline front/back fields, Save disabled while empty, and a keyboard-safe layout. The starter card becomes optional. Deck-list rows open the detail, not straight into review. All local SQLite, no API, no contract change. |
| **P0-7** | **Exit and back from self-study, and back-button correctness** | `(self-study)/index.tsx:128-144`, `participation.tsx:72`, `reports.tsx:98`, `review.tsx:139` | Shared 44pt `<BackButton fallback=…>` replaces all `Link href` "Back"s. The self-study header has Back (signed-in) or "Exit to sign in" (anonymous). Android hardware back and web browser back never revisit a stale duplicate screen (manual: Activate → Participation → Back → Performance → Back twice reaches Activate and then exits). |
| **P0-8** | **44pt touch targets at the token level** | `ui/button/index.tsx:38-43` plus the list in §2.1 | Button `default`/`sm`/`lg`/`icon` all have `min-h-11` (`icon` also `min-w-11`), or `sm` is documented as non-primary and given `hitSlop`. Every pill, chip, back link and sign-out control measures ≥44×44pt in the inspector (or with `hitSlop`). Audited list in §2.1 all green. |
| **P0-9** | **Primary button contrast** | `global.css:11-12,40-41`. Spinners `login.tsx:149`, `signup.tsx:153` | Primary button label ≥4.5:1 in light and dark (record the computed ratios in the PR). Busy spinners use `onAccent(Accents.primary)`. |
| **P0-10** | **Feed safe area and large-text survival** | `(student)/index.tsx:172,219,233`, `question-card.tsx:271-272` | The header uses `useSafeAreaInsets()`. Page height = measured container height (from `onLayout`), not window height. Card content scrolls inside the page when it overflows. The flashcard back face is in normal flow, not absolute. At OS font scale 200% (Android) / AX5 (iOS), a 4-option MCQ with explanation and a flashcard with eval buttons are fully readable and tappable on a 360×640 device. |
| **P0-11** | **Auto-advance is user-controllable** | `question-card.tsx:40` | After answering, show a **Next** button (44pt). Auto-advance is off when a screen reader is enabled (`AccessibilityInfo.isScreenReaderEnabled`) and otherwise pauses while the explanation is long or on touch. Feedback text is announced via live region. |
| **P0-12** | **Form labels and control semantics on shipped forms** | §2.1 rows 1–2 | Login, signup and create-deck inputs are wrapped in the vendored `FormControl` with visible or `accessibilityLabel` labels. Role picker = vendored `radio` (or `accessibilityRole="radio"` + `checked`). Activation rows = vendored `checkbox` with `mixed` for partial chapters. MCQ options expose `radio` + `checked`/`disabled`. Range chips expose `selected`. Login decor icons get `accessible={false}`/`importantForAccessibility="no-hide-descendants"`. TalkBack pass recorded in the PR. |

### P1: next

| ID | Item | Evidence | Acceptance criteria |
|---|---|---|---|
| **P1-1** | Tab navigation for teacher and student | §2.6 | Teacher Tabs (Activate/Participation/Performance), student Tabs (Today/Study/Me). Tab items are labelled, show selected state and are ≥44pt. Floating footer links are removed. Deep links still resolve. |
| **P1-2** | Route-level role guard + `+not-found` + font-error fallback | `(student)/_layout.tsx:4`, `(teacher)/_layout.tsx:4`, `_layout.tsx:15-28` | Wrong-role deep link redirects to the user's home. The unknown route shows a themed 404 with Go home. A font load error falls back to system fonts instead of a blank screen. `SplashScreen` is held until fonts and auth are restored. |
| **P1-3** | Loading skeletons | all `ActivityIndicator` sites | Use the vendored `Skeleton` for feed card, teacher rows, participation/report rows and deck list. Spinners are kept only inside buttons. Skeleton shimmer is disabled under reduced motion. |
| **P1-4** | Dark-mode token fixes for `Accents.border`/`track` and the StyleSheet migration | `constants/theme.ts:94-114`, `global.css:52` | New `--track` token. Dark `--border` ≥3:1 against `--card`. No `Accents.border`/`Accents.track` usage remains in screens. Raw `Text` islands in §2.2 are converted to `UIText` + classes. Before/after screenshots in both themes. |
| **P1-5** | Local-date helper everywhere | `participation.tsx:36`, `reports.tsx:26-34`, self-study | One `localDay()`/`localRange()` in `mobile/src/lib/dates.ts` is used by every screen. This aligns with `06` Q6 (Asia/Kolkata on the API side). A screenshot at 00:30 IST shows today. |
| **P1-6** | In-session lapse re-queue + session summary + interval hints (self-study) | `review.tsx:85-108,181-200,230-267` | "Again" cards return before the session ends. The end-of-session card shows reviewed, again count and next due date. Grade buttons show next-interval hints. At large text the buttons wrap to 2×2. |
| **P1-7** | Deck stats | `(self-study)/index.tsx:198-202` | Deck row/detail shows total, new, learning, mature and due counts, plus last studied. Learning/mature buckets match `06` PR-12 definitions (rep<2 / interval≥21) so the server and local views agree. |
| **P1-8** | Keyboard ergonomics | §2.3 | Next/Done chaining, `autoComplete`/`textContentType`, show/hide password, `ScrollView` on login, `keyboardShouldPersistTaps="handled"`. On a 360×640 Android device the submit button stays visible with the keyboard open. Create-deck/card scrim tap with unsaved input asks before discarding. |
| **P1-9** | Toast a11y + placement | `toast.tsx:47-71,86` | `accessibilityLiveRegion="polite"` (Android), `announceForAccessibility` (iOS), `aria-live` on web. Top offset = safe-area inset + 8. Errors inside modals render in-modal (generalize the `createError` pattern). |
| **P1-10** | Teacher dashboard: what's live, srs card, empty states, retry | `(teacher)/index.tsx:121-141,188`, `reports.tsx:133-214`, `participation.tsx:92-139` | The Activate header shows a "Live now: N sections · M questions" chip. Reports render `report.srs` (due today / due tomorrow / reviewed, already in the contract). Participation shows an explicit empty state for "No revision activated today → Activate" and "No students yet". Class-section filter chip uses the existing `classSection` param (`api/client.ts:108-109`). |
| **P1-11** | Reduced motion across custom animations | `confetti.tsx`, `login.tsx:36-47`, `summary.tsx:32-37`, `question-card.tsx:33-42` | `useReducedMotion()` disables confetti, the float loop and spring overshoot, and uses a fade instead. |
| **P1-12** | Error boundary upgrade | `components/error-boundary.tsx` | Uses `Button` (44pt, labelled), offers *Try again* and *Go home* (`router.replace('/')`), and logs the error (console now; `app_events` once `06` PR-01 lands). |

### P2: polish and delight

| ID | Item | Acceptance criteria |
|---|---|---|
| **P2-1** | Empty-state illustrations/mascot (the research doc §4 "Empty-state illustrations") | Shared `<EmptyState art title body cta>` used by feed-empty, done-for-today, no decks, no cards, no answers and no students. Art is `accessible={false}`. Works in both themes. |
| **P2-2** | Haptics preference + coverage | `useHaptics()` with a persisted on/off in the profile/settings sheet. Haptics added to activation result, deck/card CRUD and role select. |
| **P2-3** | First-run swipe hint on feed | One-time coach mark ("Swipe up for the next card"), dismissible, stored in AsyncStorage, skipped when a screen reader is on (pager announces position instead). |
| **P2-4** | Pull-to-refresh on feed empty/done state and deck list | `RefreshControl` themed with `primary-text`. |
| **P2-5** | Student profile screen (`(student)/profile.tsx`) | Streak, SRS due/tomorrow, theme, haptics, sign-out moved here (removes 3 header pills). This is the mount point for `06` PR-05/PR-12/PR-18. |
| **P2-6** | Teacher student drill-down + section → question item analysis | UI only once the API exposes it. **Needs a contract change** and is tracked in FEATURE-IMPROVEMENT-PLAN F-N3. |
| **P2-7** | Leaderboard opt-in/anonymize toggle on reports | Teacher can hide ranks or names when projecting. Default per `05-ROADMAP` V2 #6 ("opt-in"). |
| **P2-8** | Zettel link UX in card editor | `[[` triggers a card picker. Dead links flagged in deck detail. Linked-card navigation `replace`s when it stays in the same deck. |

---

## 4. Suggested PR breakdown (each through `/review` → `/test`)

| PR | Items | Size | Notes |
|---|---|---|---|
| UI-1 Navigation & dead ends | P0-1, P0-3, P0-7, P1-2 | M | Adds `components/back-button.tsx`, `components/error-state.tsx`, `lib/friendly-error.ts`, `hooks/use-online.ts` (+`expo-network`, shared with `06` PR-11) |
| UI-2 Feed robustness & a11y | P0-2, P0-10, P0-11, MCQ part of P0-12 | M | Highest-risk UI file (`question-card.tsx`). Serialize before `06` PR-03 header edits |
| UI-3 Tokens & targets | P0-8, P0-9, P1-4 | S–M | Token-level. Screenshot diff both themes |
| UI-4 Forms & semantics | P0-12 (rest), P1-8, P1-9 | M | Vendor `checkbox`, `radio` per gluestack assessment |
| UI-5 Teacher dashboard | P0-4, P1-10 | S–M | No contract change (`srs` already in `PerformanceReport`) |
| UI-6 Self-study completion | P0-5, P0-6, P1-6, P1-7 | M–L | Local only. Move SQL into `lib/self-study-db.ts` repository functions (`listDecks`, `dueCards`, `upsertCard`…) instead of inline SQL in screens |
| UI-7 Shell & polish | P1-1, P1-3, P1-5, P1-11, P1-12, P2-* | M | Tabs after UI-1 lands |

**Gates for every PR** (real output, AGENTS #7): `npm run typecheck` · `npm --prefix mobile run lint`
· manual TalkBack pass on changed screens · screenshots light+dark at 360×640 and font scale 200%.
`mobile/` has no test runner. Pure helpers (`localDay`, `toFriendlyError`, due-queue selection,
lapse re-queue) should either live in `core/` with `node:test`, following the `06` §0 convention, or
justify staying in `mobile/`.

## 5. Open questions

1. **Deactivate today's revision** (`(teacher)/index.tsx:110-113`): should a teacher be able to clear today's set? This needs an API semantic for "empty activation" and is possibly a contract change.
2. **Self-study placement**: should it move under `(student)` tabs for signed-in students (keeping the anonymous `/(self-study)` entry), or stay a separate group?
3. **Leaderboard visibility**: should it be on by default or opt-in (P2-7)?
4. **Auto-advance default** (P0-11): keep auto-advance for sighted users with a pause, or always require Next?
