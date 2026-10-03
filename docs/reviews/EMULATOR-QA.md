# Emulator QA — release APK smoke test (2026-10-03)

**Build under test:** `dist/daily-revision-1.0.0.apk` (release, signed with the debug keystore, all 4 ABIs, ~117 MB),
built with `scripts/build-apk.sh`.
**Device:** Android emulator `emulator-5554`, 1440x3120.
**API:** baked in as `EXPO_PUBLIC_API_URL=https://stemreach-api.onrender.com` (the public Render deployment).
The local API (`npm run dev:api`) was also started and returned the same `/api/me` and `/api/feed/today` data,
but the APK does not use it. Every request in this run went to Render.
**Accounts:** `s1@stemri.local` (student) and `teacher@stemri.local` (teacher) from `dummy-creds.json`.
**Screenshots:** `qa/NN-*.png` in the session scratchpad. They are not committed.

> **Caveat: source was moving.** Other agents were editing `mobile/src` while the APK was built. The JS
> bundle is a snapshot of the working tree from about 19:15 to 19:35. Since then, files such as
> `(self-study)/deck.tsx` and `components/back-button.tsx` have been added, so some findings below may
> already be fixed or changed in the working tree. Each finding gives the screen and the likely file. Repeat
> the check against a fresh build before acting on it.

## How it was driven

`adb shell input tap/text/swipe` plus `adb exec-out screencap`. **`uiautomator dump` does not work on this
app**: it fails with `ERROR: could not get idle state` because the login screen runs an infinite
`Animated.loop` (floating decor icons in `src/app/login.tsx`), so the UI never goes idle. Espresso, Maestro
and any other UiAutomator-based e2e tool will hit the same problem. Consider turning off the loop when
`AccessibilityInfo.isReduceMotionEnabled()` is true or under an e2e flag.

## What works

| Area | Result |
|---|---|
| Cold launch | Login screen renders. Fonts load. No crash. |
| Student login (Render API) | Works. A first sign-in on the emulator took about 20–25 s on a spinner (Supabase auth, then `/api/me`, then `/api/feed/today` over a ~500 ms RTT emulator network). |
| Bad password | Shows "Invalid login credentials" inline. |
| Student feed | Loads 15 flashcards. The vertical pager swipes between cards. The header progress (`n/15`) and streak chip update. |
| Theme toggle | The sheet opens. System, Light and Dark apply right away and persist across sign-out and sign-in. |
| Self study (logged-in "Study" button and "Study offline" on login) | Creating a deck works and shows the "Deck created" toast. The deck appears with a starter card. Review shows the card, Show Answer flips it, Again/Hard/Good/Easy grades it, and "All caught up!" follows. The due count drops 1 → 0 on return. |
| Summary screen | Renders the score, streak, cards due tomorrow, "Back to home" and "Sign out". |
| Sign out (feed header and summary) | The confirm sheet appears, then the app returns to login. |
| Teacher login | Opens "Today's Revision" with the chapter and section list. Select and deselect update "N selected · M questions". |
| Activate Revision | Spinner, then back to idle with no error. |
| Participation | Shows 0/6 completed, 1 started and 5 pending. Ananya is "in progress" with 3 answers. |
| Performance | Today, 7-day and 30-day tabs work. Shows class accuracy, answers, students, the per-section row and the per-student rank. |
| Crashes | **None from the app.** `adb logcat` shows no `AndroidRuntime` FATAL for `com.anonymous.mobile` and no `ReactNativeJS` errors. The only FATAL in the log is the `uiautomator` process itself (see above). The only app-level noise is `E ReactNativeJNI: Could not parse OutlineStyle:none`, which repeats when a TextInput is focused. It is harmless but comes from an `outline-none` style that Android does not support. |

## Broken / half-done

### B1. BLOCKER: the student flashcard "Show Answer" button does nothing, and invisible buttons record grades
- **Repro:** sign in as `s1`, then tap **Show Answer** on any flashcard. The card does not flip, whether you
  tap once or several times. Then tap the empty area roughly 1/3 of the screen below the button. An answer is
  submitted: the progress went 0/15 → 1/15 and the card auto-advanced, even though the answer was never
  shown. Later blind taps raised it to 3/15. Teacher Performance then reported these as **100% accuracy**,
  meaning the hidden "Good" button was hit.
- **Likely cause:** `src/components/question-card.tsx` (flip area, around lines 221–282). `flipBack` is a normal-flow
  `Animated.View` rendered *after* the absolutely positioned `flipFront`, so it sits on top of it. It is only
  hidden by `rotateY(180deg)` plus `backfaceVisibility: 'hidden'`, and on Android a hidden backface still
  receives touches. The back face swallows taps on Show Answer, and its invisible Again/Good/Easy buttons are
  live.
- **Fix direction:** set `pointerEvents={flipped ? 'auto' : 'none'}` on the back face (and the inverse on the
  front), or mount the back face only after the flip. The self-study review screen
  (`src/app/(self-study)/review.tsx`) does not have this bug.
- **Impact:** on Android a student cannot complete the daily set legitimately, and the data in the teacher
  reports is corrupted.

### B2. MCQ path could not be exercised
- Today's feed for s1, s2 and s3 is 15 flashcards and 0 MCQs. `api/src/routes/feed.ts` fills from flashcards
  first and tops up with MCQs only when the flashcard pool runs out. `content/ch12.json` has 5 flashcards and
  10–12 MCQs per section, so with 3 sections active the 15 flashcards fill the whole set. This is by design,
  but it means students will rarely see MCQs and the MCQ UI went untested. Confirm the mix is intended.

### B3. Dark theme: the flashcard "Show Answer" button loses its fill and its label becomes unreadable
- **Repro:** set the theme to Dark and open the student feed. The button is outline-only, and its
  "Show Answer" text is dark-on-dark (`qa/11-dark.png`).
- **Likely cause:** `question-card.tsx` uses `className="... bg-purple border-purple"` with
  `onAccent(Accents.purple)` text. Either `bg-purple` is not defined for the dark theme in `src/global.css`,
  or the outline variant overrides it in dark.

### B4. Unselected checkmarks render black instead of hidden (Android)
- **Theme sheet:** all three options show a check. Selected is blue and the other two are black
  (`qa/10-theme-tap.png`). The cause is `src/components/theme-sheet.tsx:137`,
  `color={selected ? ... : 'transparent'}`.
- **Teacher section list:** a deselected section still shows a black ✓ (`qa/37-teacher-deselect.png`). The
  cause is `src/app/(teacher)/index.tsx:201`, `color: isOn ? ... : 'transparent'`.
- `'transparent'` as an icon or text color renders black here. Render nothing, or use `opacity: 0`.

### B5. Teacher Performance: the accuracy bar does not match the percentage
- 100% accuracy draws a bar about 30% of the track width (`qa/33-performance.png`).
- **Cause:** `src/app/(teacher)/reports.tsx:19`, `const BAR_MAX = 100`. The fill width is a fixed 100 dp
  while the track is the full card width. Use a percentage width or measure the track.

### B6. The summary is reachable for an incomplete set and claims "Complete!"
- **Repro:** with the feed at 3/15, open `mobile://summary` (deep link). The screen shows "Daily Revision
  Complete! … You made it through today's set" and "Streak: 0", while the feed header showed streak 1
  (`qa/26-summary-deeplink.png`).
- **Files:** `src/app/(student)/summary.tsx`. It trusts URL params and does not check `progress.completed`.
  The streak source also differs from the feed header.

### B7. Summary "Sign out" button shows a tofu glyph
- `⏻ Sign out` renders as `▯ Sign out`, because U+23FB is not in Nunito or the Android system fonts.
  **File:** `src/app/(student)/summary.tsx` (around line 114). Use the Ionicons `log-out-outline` like the feed header.

### B8. Status bar icons are white in the light theme
- In every light-theme screenshot the clock and system icons are white on near-white. There is no
  `<StatusBar>` (expo-status-bar) anywhere in `src`. Add one in `src/app/_layout.tsx` with its style driven by
  `resolvedTheme`.

### B9. Self-study: no way to add cards in this build, and back navigation is awkward
- In the APK, a new deck contains only the auto-generated "Welcome to <deck>" card. There is no "add card"
  UI, and tapping a deck goes straight to Review. The working tree now has an untracked
  `src/app/(self-study)/deck.tsx`, which is probably the fix. Rebuild and re-test.
- The deck list had no on-screen Back control in this build, so only the system back gesture works. "Back to
  decks" after a review pushes a *second* deck list, so you need two system-back presses to reach the feed.
  The working tree now imports `components/back-button.tsx`. Re-test.
- **Data scoping:** decks live in device-local SQLite (`self_study.db`), which is not keyed by user. A deck
  created while signed in as a student also appears under "Study offline" and for any other account on the
  same phone. That may be acceptable for a single-user phone, but it is worth deciding explicitly.

### B10. Minor UI issues
- **Feed card header overflow:** the section label ("Force on a Current-Carrying Conductor in a Magne…") runs
  off the right edge instead of wrapping or truncating (`question-card.tsx`, the NEW badge and label row).
- **Light-theme progress bar:** at 0/15 the track is dark slate, so it reads as a *full* bar
  (`qa/06-wait.png`). In dark mode it reads correctly. See `src/app/(student)/index.tsx`, header progress.
- **Login:**
  - Pressing Enter on the password field only closes the keyboard; it does not submit. There is no
    `onSubmitEditing` or `returnKeyType="go"` in `src/app/login.tsx`.
  - The first tap on "Sign in" right after dismissing the keyboard was not registered once. This is
    probably a layout shift while the keyboard hides.
  - The star decor icon overlaps the "Study offline" button.
  - Tapping a decor icon leaves a grey square press highlight (`qa/29-teacher-enter.png`).
  - The title "Daily Revision" renders in the system font, not Fredoka.
- **Post-login spinner:** the screen between login and feed (`src/app/index.tsx`) uses a default
  teal `ActivityIndicator` on `#F2F2F2`, not the Nord theme, and it lasted about 20 s. `apiFetch`
  (`src/api/client.ts`) has no timeout, so a hung request spins forever instead of reaching
  `meStatus === 'error'`.
- **Activate Revision:** after the spinner there is no visible confirmation, or the toast had disappeared by
  the time of the screenshot 6 s later. Consider a persistent "Active today" state.

## Env / API URL notes (for the build)

- `mobile/.env` sets `EXPO_PUBLIC_API_URL=https://stemreach-api.onrender.com`. The URL is live
  (`/api/healthz` returns `{"ok":true}`), and the bundle was checked to contain it. Being on Render, it may
  take about 30–60 s on the first request after idling.
- **`mobile/eas.json` `preview` and `production` profiles do not set `EXPO_PUBLIC_API_URL`.** An EAS build
  would fall back to `Constants.expoConfig.hostUri`, then `http://localhost:3000`, which a phone cannot reach.
  It needs adding (the coordinator is handling this).
- For a phone-to-laptop setup with no Render, build with `API_URL=http://<LAN IP>:3000 scripts/build-apk.sh`.
  This machine is `192.168.0.16` on `wlp3s0`. The API must listen on `0.0.0.0`, and Android blocks cleartext
  HTTP in release builds unless `usesCleartextTraffic` is enabled. For the emulator only,
  `http://10.0.2.2:3000` works the same way.

---

## Re-test after fixes (2026-10-03, rebuilt APK on emulator-5554)

Verified on the final build against the live API (`https://stemreach-api.onrender.com`):

| Earlier finding | Result |
|---|---|
| Show Answer did nothing; hidden grade buttons took taps | **Fixed** — answer reveals, progress unchanged until a grade is tapped, "Good" moved 3/15 → 4/15 |
| Dark-theme Show Answer unreadable | **Fixed** — purple fill, readable label |
| Black checkmarks on unselected theme rows | **Fixed** — only the selected row shows a check |
| Status bar icons invisible on light theme | **Fixed** |
| Enter on password did not submit | **Fixed** |
| Self-study: no back button, no card management | **Fixed** — back arrow, deck screen with add/edit/delete card, edit/delete deck, stats |

Fixed in code but not re-tested on device: performance bar width (reports.tsx), broken sign-out glyph on the summary screen.

Still open: MCQ rendering untested (today's feed is all flashcards by design of `feed.ts`), self-study decks are per device not per account, `apiFetch` has no timeout, first login after Render idle takes 20-25 s.
