# Plan — Teacher authoring, calendar, answer images, student profile, password reset

Status: **Round 2 implemented (2026-10-04) except the answer image upload (§6), delete-my-account and email verification.** Decisions in §0; API/DB spec in `ROUND2-API-SPEC.md`; rollout in `docs/DEPLOY.md`. Written 2026-10-03 against branch `chore/claude-setup-audit-fixes`.
Needs the decisions in §9 before work starts. Follows AGENTS.md (API is the only writer, Zod at every
boundary, authz from the verified token, `core/` changes additive only, Drizzle-only SQL).

Requested items:

1. Add questions from the teacher account
2. Calendar view for teachers: pick a date, see the questions for it
3. Full CRUD on questions in a category
4. A small image inside the revealed answer
5. Student profile section
6. Forgot password — reset link by email

---

## 0. Decisions locked with the product owner (2026-10-03) — these override later sections

| # | Topic | Decision |
|---|---|---|
| 1 | Media | **Images only**, uploaded **by teachers only**. No video, no audio. Students cannot upload anything. |
| 2 | Image placement | **One image, answer side only** (no question-side image — drops F5; tap-to-enlarge and required alt text kept as defaults). |
| 3 | Learner space | **"My space" inside Profile for both roles**, no logout needed: my self-study decks, my stats (students: from `/api/me`), later "my mistakes" (06 PR-08). Teachers get personal decks + their profile only. **Teachers do not answer the real student feed** (no practice flag, no report changes). |
| 4 | Calendar | **Date added + plan ahead** (option A + C1/C2): questions added per day, topics activated per day, activate for future dates, copy last week, participation colour per day. Per-question scheduling (option B) stays out. |
| 5 | Permissions | **Any teacher can edit/archive any question in the shared pool, with history**: `updated_by` + `edited_at` on every PATCH now; a `question_revisions` snapshot table so edits can be restored. Org scoping (06 PR-02) later narrows it per school via the single `assertCanEditQuestion()` helper. |
| 6 | Deleting | **Archive by default; permanent delete only when no student has ever answered it** (any teacher; seeded questions included). |
| 7 | Student email / reset | **Most students have readable email** → email reset link (built). **Teacher-set password is ALSO in this round (owner: "teacher sets the password is best")**: teacher resets a *student's* password, student must change it at next sign-in; server-enforced; audited; rate-limited. See `ROUND2-API-SPEC.md` §2.6. |
| 8 | Categories | **Teachers create/rename/reorder chapters and topics in the app (F1).** |
| 9 | Profile editing | **Name only** (`PATCH /api/me`, accepts `full_name` and `question_language` only; never `role`, `id`, class). |
| 10 | Languages | **English + Kannada authoring.** Students choose **Question language (English / Kannada / Both)** in Profile; the feed filters by it. Existing students default to English. |
| 11 | Reset landing | Hosted web app: **https://stem-reach-i-app-api.vercel.app** → `/reset-password`. |
| 12 | Extras included | **Authoring boosters** (drafts + preview as student, bulk import/export, symbol toolbar, near-duplicate warning, clone / save-and-add-another) and **Ops basics** (keep-API-warm ping, CI with web smoke tests, PWA polish). |
| 13 | Extras not in this round | Profile settings (haptics/reduced motion/text size), delete-my-account/export, email verification, AI drafting, print/PDF. |
| 14 | Email sender | Owner asked for help choosing (see §0.2). |
| 15 | Swipe cue | **Peek of the next card** at the bottom of every page (TikTok-style) so it is visibly obvious there is more below. |
| 16 | First-run guidance | **3-step skippable coach overlay** on the first feed card; re-openable from Profile → "How it works". |
| 17 | Skipping | **Lock the feed until the card is answered, with an explicit Skip button**; skipped cards return at the end of the queue. |

### 0.1 New work these decisions create

- **K1 — Language preference (needed because the feed ignores `language` today).** `profiles.question_language text not null default 'en'` (`'en' | 'kn' | 'both'`).
  `GET /api/feed/today` and the review-due query filter on it; `/api/me` returns it (additive optional field); `PATCH /api/me` writes it.
  Submissions are unaffected. Reports stay language-agnostic. Add tests for the filter (en-only student never receives `kn`).
  Kannada rendering: Nunito/Fredoka have no Kannada glyphs — verify the system fallback on Android 13+/14 and web, and if needed bundle a Kannada
  font (e.g. `@expo-google-fonts/noto-sans-kannada`, JS-asset only but included in the next APK/web build). Near-duplicate and search
  normalisation must be Unicode-safe (NFC), not ASCII-only.
- **L1 — "My space" (Profile).** Profile → My space → *My decks* (existing offline self-study), *My stats*. **Required fix first:** self-study
  decks are currently stored per **device**, not per account, so a teacher and a student on the same phone share decks (found in emulator QA).
  Add `owner_id` to the local deck table (`PRAGMA user_version` migration; `'offline'` for the no-account mode; existing decks migrate to
  the first signed-in user or stay under `'offline'`), and filter every query by it. Teachers get the same space (decks only; no feed stats).
- **P1 — Name edit.** `PATCH /api/me` (Zod `{ full_name?: string(1..80), question_language?: ... }`), `profiles` stays API-written only.
- **V1 — Vercel deep links return 404 (found 2026-10-03).** `https://stem-reach-i-app-api.vercel.app/` loads but `/login` returns Vercel's
  `NOT_FOUND`: the project has no SPA rewrite, so refreshing or opening any route directly fails — and `/reset-password` would fail the same
  way. Fix added: `mobile/vercel.json` with `rewrites: /(.*) → /index.html`, `buildCommand`, `outputDirectory: dist`. In Vercel set
  **Root Directory = `mobile`**, redeploy, then confirm `/login` returns 200. Also set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` as Vercel env vars, and note the API's CORS currently allows any origin (`*`) — tighten to the Vercel
  origin + localhost once stable.
- **Supabase Auth config (owner action):** add `https://stem-reach-i-app-api.vercel.app/reset-password` and
  `http://localhost:8081/reset-password` to Authentication → URL Configuration → Redirect URLs; set Site URL to the Vercel URL.

### 0.1b Student guidance & feed affordances (new, from owner feedback)

Goal: a student who has never seen the app understands within seconds that it is a vertical, swipe-up feed, what to do on each card,
and what the top bar means. (Current state: `FlatList` with `pagingEnabled`, an explicit Next button after answering, auto-advance
after 1.8 s when there is no explanation — nothing tells a new user to swipe, and students can swipe past unanswered cards.)

**G1 — Peek of the next card.** Each page is `pageHeight − PEEK` tall (PEEK ≈ 28–36 px, scaled for large fonts) so the top edge of the next
card shows under the current one. Replace `pagingEnabled` with `snapToInterval = pageHeight` + `snapToAlignment="start"` +
`decelerationRate="fast"` (keeps one-card-at-a-time feel with a peek). Last card shows no peek; the Done state does. Depends on the fixer's
measured page height (`onLayout`), so reuse it; test with font scale 1.3+ and on a 320 px-wide phone. The peek card is non-interactive
(`pointerEvents="none"`, hidden from screen readers) to avoid the hidden-button tap bug fixed on Android earlier.

**G2 — Lock until answered + Skip.** The list's `scrollEnabled` follows "current card answered"; when locked, a swipe attempt gives a small
shake and haptic plus a one-line hint ("Answer first — or tap Skip"). A **Skip** text button sits under the unanswered card (≥44 pt).
Skip moves the card to the end of the client-side queue (no API call; nothing is recorded) and advances; skipped cards are shown again
before the "Done for today" state. Progress counts only answered questions, unchanged. Edge cases to test: skip the last card; skip all
cards (queue never empties — show "N skipped, answer them to finish" and cap skips per card at 2 so it cannot loop forever);
app killed mid-queue (queue is rebuilt from the server feed, skipped order is not persisted); screen reader users keep Next/Skip
buttons (swipe gestures are not required for any action — WCAG 2.5.1); web/keyboard: ArrowDown/PageDown and the Next button advance,
the mouse wheel respects the lock.

**G3 — Visible "next" cue.** After answering, the Next button stays and a subtle bobbing chevron ("Swipe up") appears above the peek
for the first ~5 swipes only (counter in AsyncStorage per user: `feed_swipes_v1:<userId>`), then stops. Honors reduced motion
(static chevron). On web, copy reads "Scroll or press ↓".

**G4 — 3-step coach overlay (first launch per user).** One-time, skippable, shown over the first card after the first feed load:
1. "Swipe up for the next question" (animated finger gesture),
2. "Tap **Show Answer**, then rate yourself: Again · Average · Easy" (highlights the three buttons),
3. "Your streak 🔥 and progress are up here" (highlights the top bar).
Stored as `coach_v1:<userId>` in AsyncStorage (fails safe: if storage is unavailable, show once per session). Re-open any time from
Profile → **How it works**. Accessible: focus moves into the overlay, "Skip" and "Next" are real buttons, announced steps, no gesture-only dismissal,
no auto-advance, respects reduced motion. Copy is plain and short (reading level ~Grade 5) and must be reviewed for Kannada later.

**G5 — Header clarity (small).** The top bar currently crowds at 320 px (the streak flame touches the counter). With theme and sign-out
moving into Profile, the bar becomes: progress + streak + Study + Profile avatar. Add labels/tooltips (long-press on web) for the streak
and progress counters.

Tests: Playwright web (scroll blocked before answering; Skip reorders; overlay shows once then never; keyboard navigation), emulator gesture
test of swipe lock/peek on a real touch device size, unit tests for the queue logic (skip cap, ordering) as a pure module in `mobile/src/lib`.
Effort: M (G1–G3) + S–M (G4–G5). No API, contract or DB change.

### 0.2 Custom SMTP recommendation (for reset emails)

Supabase's built-in sender is for testing only (a handful of emails per hour). Verify current limits on each provider's pricing page before relying on them.
- **You own a domain (even a cheap one) → Resend** (generous free tier, best deliverability and simplest Supabase setup; needs DNS records on your domain to send to arbitrary recipients).
- **No domain → Brevo** (free daily allowance; can start from a verified single sender address, weaker deliverability, may land in spam).
- Avoid a personal Gmail SMTP for a school app (sending limits, app-password risk, spam-folder risk).
Setup is ~15 minutes: create account → verify sender/domain → create SMTP credentials → Supabase → Project Settings → Auth → SMTP Settings →
paste host/port/user/password/from → send a test reset to a real inbox (check spam).

### 0.3 Revised build order (supersedes §10 and §13.6)

| # | PR | Contents | Needs |
|---|---|---|---|
| 0 | Ops basics | `vercel.json` (done), keep-API-warm ping, GitHub Actions CI (typecheck/test/lint/verify + Playwright web smoke), PWA polish (manifest name/colours/icons) | Vercel Root Directory = `mobile` |
| 1 | Forgot / reset password | login link, generic success message, `/reset-password` route, `detectSessionInUrl` on web only | Supabase redirect URLs + SMTP |
| 2 | Profile v1 (+ "How it works" entry) | Profile screen (both roles), name edit (`PATCH /api/me`), question language (K1 server+client), change password, appearance, sign out; header declutter | – |
| 2b | **Feed guidance (G1–G5)** | peek of next card, lock-until-answered + Skip, swipe cue, 3-step coach overlay, header declutter | after Profile v1 (needs its "How it works" entry) |
| 3 | My space | Local deck `owner_id` migration + My space entry (L1) | – |
| 4 | Question API | PATCH, list filters/paging, CORS `PATCH`, length limits, seed lock (`edited_at`), drafts, revisions + `updated_by`, near-duplicate warning, archive/delete rules | – |
| 5 | Teacher tabs + Questions list | Today · Questions · Calendar · Reports | – |
| 6 | Editor | create/edit/archive/restore, MCQ + flashcard, **EN/KN picker**, symbol toolbar, preview as student, clone / save-and-add-another | K1 fonts check |
| 7 | Chapters & topics (F1) | create/rename/reorder | – |
| 8 | Bulk import / export (F2) | dry-run preview, per-row errors, row cap | – |
| 9 | Calendar | shared month grid; date added + activations; plan ahead; copy last week; participation colours | – |
| 10 | Answer image | bucket, signed upload, on-device resize, student display + tap to enlarge, alt text; **new APK** | Supabase bucket |

### 0.4 Still needed from you
- Confirm Vercel **Root Directory = `mobile`** and redeploy; tell me if `/login` still 404s.
- Supabase: add the redirect URLs above; set up SMTP (see §0.2) — tell me whether you own a domain.
- Pick the final Kannada font approach after I test glyph rendering (no action yet).

---

## 1. What exists today (verified in code)

| Area | State |
|---|---|
| `POST /api/questions` | Exists, teacher-only. `created_by` comes from the token. 409 on duplicate text in a section. |
| `GET /api/questions?section_id=&mine=` | Exists, teacher-only. No pagination, no date filter, no search. |
| `DELETE /api/questions/:id` | Exists. Only the creator, only while no submissions **and** no review state reference it. Seed questions can never be deleted. |
| `PATCH /api/questions/:id` | **Missing.** |
| Mobile UI for any of the above | **None.** Teacher app is a plain `Stack` (`index`, `participation`, `reports`). |
| `questions.enabled` | Column exists and the feed already filters on it → natural "archive". |
| Images | No column, no bucket, no picker. `expo-image` is installed. Supabase Storage is mentioned as V2 in HLD. |
| Calendar | Nothing. A "day" is `daily_sets.set_date` (unique per date, **global**, not per org) + `daily_set_sections`. It records *topics*, not *which questions*. |
| Student profile | `GET /api/me` returns name, class, streak, totals, SRS. No edit endpoint. No profile screen; the feed header already holds theme, Study and sign-out buttons. |
| Forgot password | Nothing. Supabase client has `detectSessionInUrl: false`; app scheme is `mobile`. Signup auto-confirms emails, so addresses are unverified. Demo accounts use `@stemri.local` (cannot receive mail). |
| CORS | `allowMethods: GET, POST, DELETE, OPTIONS` — **`PATCH`/`PUT` will fail from the web app** until added. |
| Re-seeding | `npm run seed` upserts by (section, exact text) and **overwrites** matching rows. Edits to a seeded question's answer/explanation would be silently reverted; an edited *text* would be re-inserted as a duplicate. |
| Content limits | Longest in `content/ch12.json`: text 143, answer 236, explanation 158, option 68 chars. No max lengths in the schema today. |
| Channels | DEPLOY.md: **web PWA on Vercel is primary**, APK second. Web fixes matter as much as native. |

## 2. Decisions that shape everything (recommended default in bold)

**D1 — Who may edit/delete which question?**
- (a) Own questions only.
- (b) **Any teacher edits any question in the shared pool** (what was asked), with `updated_by`/`updated_at` recorded.
- (c) Edit-any via copy-on-write.
Reasoning: today there are no organizations, so the pool is one school. PR-02 (org scoping, `docs/06-FEATURE-PLAN.md`)
will later add `org_id`; every query below gets one extra `WHERE org_id = <token org>`. Build (b) now but route all
reads/writes through one `assertCanEditQuestion()` helper so org scoping is a one-line change, not a hunt.

**D2 — Delete semantics.** **Archive (`enabled=false`) is the default action; hard delete only when nothing references
the question** (existing rule, kept). Students keep their history; the feed stops showing archived questions. Add a
"Show archived" filter + "Restore".

**D3 — Editing a question students have already answered.** Allowed: text, explanation, image, difficulty.
**Blocked with 409 + clear message** once submissions exist: changing `type`, `options`, `correct` (reports and SRS
history would silently change meaning). The UI offers "Archive and create a corrected copy" instead.

**D4 — Seed vs. teacher edits.** Add `edited_at timestamptz null` (+ `updated_by`). The seed script **skips** rows with
`edited_at` set and logs them; `npm run seed -- --force` overrides. Without this, the next deploy-time seed reverts
teacher edits. (Stable per-question keys in the JSON would be cleaner but are a larger content migration — noted as a
follow-up.)

**D5 — "Calendar date" meaning** (see §5): **A = date added now, B = scheduled-for date next.**

**D6 — Image storage.** Supabase Storage bucket `answer-images`, **public-read, unguessable paths**
(`<question_id>/<uuid>.jpg`), bucket-level `file_size_limit` (300 KB) and `allowed_mime_types` (jpeg/png/webp).
Store the **path** in the DB (not a URL) so switching to signed URLs later is an API-only change. Upload goes
**device → Supabase via a signed upload URL issued by the API** (keeps big bodies off the Render free tier and keeps
the "API decides who may write" rule).

**D7 — Password-reset landing.** **The hosted web app** (`/reset-password` route) — works from any phone/computer and
needs no deep-link plumbing in the APK. Native deep-link (`mobile://reset-password`) can follow later.

**D8 — Migrations.** The repo has no migration tooling; DEPLOY.md carries hand-run SQL. Every DB change below ships as
a **numbered idempotent SQL block in DEPLOY.md** plus the Drizzle schema change, applied **before** the API deploy.
(Adopting `drizzle-kit` migrations is recommended but is its own task, not blocking.)

## 3. Deployment order for every phase (compatibility)

1. Run the SQL (additive columns/tables only → old API and old apps keep working).
2. Deploy the API (new fields are optional in responses).
3. Deploy the web app (Vercel) — instant for all web users.
4. Ship a new APK **only** when a native dependency is added (Phase 4 images, §6).
`core/` changes are **optional/additive**; an APK installed today must keep working against the new API (AGENTS non-negotiable #3).

## 4. Phase 1 — Question management (items 1 & 3)

### API
- `PATCH /api/questions/:id` — body `UpdateQuestionRequest` = partial of `AuthoredQuestion` (+ `enabled`, `section_id`
  move). Re-validate the merged result with `authoredQuestionOk`. Enforce D3. Set `edited_at`, `updated_by`. 409 on
  `(section_id, question_text)` clash (existing unique index).
- `GET /api/questions` — add `q` (text search), `enabled`, `type`, `difficulty`, `limit`/`cursor` (keyset on
  `created_at,id`). Always return `submission_count` so the UI knows what is editable (D3).
- `DELETE` — keep; add the archive path via PATCH `enabled:false`.
- CORS: add `PATCH` to `allowMethods` (**required for web**).
- Add max lengths to `AuthoredQuestion`: text 500, option 200, answer 1000, explanation 1000 (≈3–5× the longest
  existing content; `npm run verify` must stay green — run it as the gate).
- Authz: one `assertCanEditQuestion(user, question)` helper (D1). `created_by` never read from the body.

### Mobile
- Teacher navigation becomes tabs: **Today** (current activations screen) · **Questions** · **Calendar** · **Reports**.
  (Also resolves the UI-PLAN teacher-screen gaps.)
- **Questions tab:** section picker → list (search, type/difficulty/archived filters, infinite scroll, pull to
  refresh, skeletons, empty and error-with-retry states) → tap opens editor.
- **Editor screen** (create + edit share it): type switch (MCQ/Flashcard); MCQ = 4 option inputs with a radio for the
  correct one; flashcard = answer field; explanation; difficulty chips; language (en/kn); live **preview** of the
  student card; inline field errors from the API's Zod messages; unsaved-changes guard; keyboard-safe scrolling;
  duplicate-text 409 shown on the text field; archive/restore and (when allowed) delete via the existing `ConfirmSheet`.
- Kannada: verify Nunito/Fredoka fallback renders Kannada glyphs on Android + web before promising `kn` authoring.

### Tests
- API (existing `test-utils` harness): create/patch/list/archive happy paths, 403 for student, 409 duplicate, D3
  matrix (edit text after submissions OK; change `correct` after submissions → 409), cursor paging, CORS preflight for PATCH.
- Seed: a unit test proving `edited_at` rows are skipped and `--force` overrides.
- Web e2e (Playwright, already proven working here) — create → edit → archive → restore.

**Effort:** M–L (≈3–4 PRs: API+tests, seed lock, list screen + tabs, editor).

## 5. Phase 2 — Calendar (item 2)

**Option A (recommended first): date added.** Teacher picks a date → sees questions created that day.
- API: `GET /api/questions?created_on=YYYY-MM-DD` and `GET /api/questions/calendar?month=YYYY-MM` returning
  `{ date, created_count, activated: boolean }[]` for the dots. Bucket with `created_at AT TIME ZONE APP_TIMEZONE`
  (the helper already exists in core/api; same IST rule as the rest of the app).
- Activation markers from `daily_sets`/`daily_set_sections` (reuse `GET /api/activations?date=`).
- Mobile: custom month grid (no new dependency; themeable, accessible, works on web and native): dots for "questions
  added" and "topics activated", tap a day → bottom panel listing that day's questions (tap → editor) and the topics
  activated that day. Prev/next month, "Today" button, swipe optional.
- No DB change.

**Option B (later, bigger): date scheduled.** Teacher assigns specific questions to a date.
- New table `daily_set_questions(daily_set_id, question_id, sort_order)`; feed uses explicit questions when present,
  otherwise the current "5 per activated section" rule (so nothing changes for days with no explicit pick).
- Touches `feed.ts`, `submissions.ts` (which currently validate against section membership), reports. Its own
  design review and tests; do not bundle with A.

A's screen is built so B only swaps the data source.

**Tests:** month-boundary and timezone cases (23:30 UTC vs IST), leap day, empty month; Playwright: pick date → list.
**Effort:** A = M. B = L.

## 6. Phase 3 — Image in the revealed answer (item 4)

### Data / API
- DB: `questions.answer_image_path text null`, `answer_image_alt text null`.
- Storage: bucket `answer-images` with size/MIME limits (D6). Created once in the Supabase dashboard (documented in DEPLOY.md).
- `POST /api/questions/:id/image` (teacher) → returns `{ upload_url, path }` (Supabase `createSignedUploadUrl`, service role).
  `PATCH` with `answer_image_path` records it (API verifies the path prefix equals the question id — no arbitrary paths).
  Removing/replacing deletes the old object (best effort + a periodic orphan sweep documented, not built).
- Contract (additive, optional): `QuestionDto.answer_image_url?`, `answer_image_alt?` (API builds the public URL from the path).
  Shown to students in the feed card (flashcard back face) and in the MCQ explanation block.

### Mobile
- New packages: `expo-image-picker`, `expo-image-manipulator` → **requires a new APK build** (`npm run build:apk`; the
  script prebuilds automatically when `app.json` plugins change). Web uses the browser file input via the same API.
- Teacher editor: "Add image" → pick → **resize to ≤800 px wide and re-encode JPEG/WebP quality ~70 on-device** → upload →
  thumbnail with Remove/Replace and required alt text field.
- Student card: `expo-image` under the answer text, fixed max height (~140 px), `contentFit="contain"`, blurhash/placeholder,
  tap to enlarge (modal viewer), alt text as `accessibilityLabel`, graceful fallback if the load fails (text still readable).
- Offline self-study decks are local-only and **out of scope** (no image support there).

### Risks
- Free-tier storage/bandwidth: mitigated by on-device resize + 300 KB cap.
- Public bucket: only non-sensitive study images; paths are unguessable. Revisit if students upload (not planned).
- New native module = APK rebuild + QA on emulator and one real phone.

**Tests:** API (wrong prefix rejected, non-teacher 403, replace deletes old); mobile unit for the resize-target math;
manual device check (camera roll permissions on Android 13+/14).
**Effort:** L.

## 7. Phase 4 — Forgot password (item 6)

- Login screen: "Forgot password?" → email field → `supabase.auth.resetPasswordForEmail(email, { redirectTo: <web-app>/reset-password })`.
  Always show the **same generic success message** whether or not the email exists (no account enumeration).
- New route `reset-password` (web-first): reads the recovery session from the link, shows new-password + confirm,
  calls `supabase.auth.updateUser({ password })`, then signs out and returns to login. Enable `detectSessionInUrl: true`
  on web only (currently `false` for all platforms).
- Client-side rate limit/cooldown (60 s) on the button; Supabase also rate-limits server-side.
- **Supabase dashboard work (only you can do):** Authentication → URL Configuration → add the Vercel URL (and
  `http://localhost:8081` for dev) to **Redirect URLs**; customise the *Reset password* email template; **configure custom SMTP**
  — the built-in sender is limited to a few emails per hour and is for testing only, so real reset mails will not
  reliably arrive without it.
- Caveats to document: demo `@stemri.local` accounts cannot receive mail; because signup auto-confirms, a mistyped email
  at signup means that user can never reset — consider asking for the email twice or adding verification later.
- Optional later: native deep link (`mobile://reset-password`, PKCE `exchangeCodeForSession`); same-device only for PKCE.

**Tests:** Playwright with the recovery link stubbed (set session via a test token); unit for the generic-message behaviour.
**Effort:** S–M (code), plus your Supabase setup.

## 8. Phase 5 — Student profile (item 5)

- New `(student)/profile.tsx`, opened from a single avatar button in the feed header. **This also declutters the
  header**, which is already tight at 420 px (progress + streak + theme + Study + sign-out): theme and sign-out move
  into the profile; Study stays reachable from the feed and profile.
- Contents: avatar (initials, colour from the existing palette), name, class, email (from the Supabase session — no
  extra API), streak + best streak, accuracy and total answered (from `/api/me`), SRS counts (due/learning/mastered),
  Appearance (existing `ThemeSheet`), **Change password** (`updateUser`, requires current-session; confirm field),
  Sign out (`ConfirmSheet`), app version.
- Editing name/class is **not** included by default: `profiles` is a business table, so it needs `PATCH /api/me`
  (Zod-validated; `role`/`id` never accepted from the body) — small, but a decision (§9 Q5). Everything above needs
  **no API or contract change**.
- Teachers get the same screen (shared component) behind their tab.

**Tests:** render states (loading, error + retry, offline), a11y labels, Playwright smoke.
**Effort:** S (read-only) / M (with name edit).

## 9. Open questions (please answer before implementation)

1. **Calendar:** A (date added) first, then B (date scheduled)? Or go straight to B?
2. **Permissions (D1):** any teacher edits any question (recommended for the single-school pilot), or own-only?
3. **Images:** one image per answer (assumed) or several? Tap-to-enlarge wanted? Image on the **question side** too, or answer only?
4. **Password reset landing:** hosted web page (recommended). What is the production Vercel URL?
   Are you able to configure custom SMTP in Supabase (e.g. Resend/Brevo free tier)?
5. **Profile:** may students change their own name/class (needs `PATCH /api/me`)? Anything else to show
   (badges, weekly chart, class rank)?
6. **Kannada (`kn`) authoring:** needed in the editor now?
7. **Hard-delete:** keep the "creator only, unused only" rule, or archive-only for everything?
8. **Students and email:** do your students have email addresses they can read? If not, email reset is the wrong primary
   path and §13 F8 (teacher-assisted reset) moves up.
9. **Add chapters/topics from the app (F1)?** Today new categories exist only via the seed script.
10. **Which §13 additions do you want?** Recommended "include now" set: F1, F2, F3, F4, F5, F6, F7.

## 10. Proposed order & PR breakdown

| # | PR | Needs | Size |
|---|---|---|---|
| 1 | Forgot/reset password + Supabase setup notes | Q4 | S–M |
| 2 | Student profile (read-only) + header declutter | – | S |
| 3 | API: PATCH/list filters/pagination, CORS PATCH, length limits, seed lock + tests | Q2 | M |
| 4 | Teacher tabs + Questions list | – | M |
| 5 | Question editor (create/edit/archive/delete) + preview | – | M–L |
| 6 | Calendar (option A) | Q1 | M |
| 7 | Image upload (DB, bucket, signed upload, student display) + **new APK** | Q3 | L |
| 8 | Calendar option B (scheduled questions) — separate design review | Q1 | L |

Order rationale: 1 and 2 are fast, independent and visible; 3–5 are the backbone for the rest; 6 builds on the list/editor;
7 goes late because it adds native dependencies and external setup.

## 11. Cross-cutting quality gates (every PR)

- `npm run typecheck`, `npm test`, `npm run lint`, `npm run verify` green; new API routes get tests with the existing harness.
- `/review` → Code + Security reviewer (authz on every new route; no client-supplied owner/org fields; upload path validation).
- Web smoke with Playwright (works headless against `localhost:8081`); native smoke on the emulator for anything touching
  gestures, pickers or the keyboard.
- Accessibility per `docs/plans/UI-PLAN.md`: labels, ≥44 pt targets, contrast in light and dark, keyboard flow on web.
- Docs updated in the same PR (DEPLOY.md SQL block, README env table, LLD contract section).

## 12. Risks

| Risk | Mitigation |
|---|---|
| Seed reverts teacher edits | D4 lock + test |
| Editing changes meaning of past answers | D3 restrictions |
| Web `PATCH` blocked by CORS | add to `allowMethods`, preflight test |
| No migration tooling → schema drift between envs | idempotent SQL blocks in DEPLOY.md, applied before deploy; consider drizzle-kit |
| All teachers share one question pool | D1 helper + PR-02 org scoping later |
| Reset emails don't arrive (default SMTP) | custom SMTP is a stated prerequisite |
| Image bandwidth/storage | on-device resize, 300 KB bucket cap |
| Render cold start (~30 s) makes list/editor feel broken | skeletons, retry, optimistic UI on archive |
| New native deps in Phase 7 | planned APK rebuild + device QA |


---

## 13. Additional features worth including (second pass)

Method: compared the six requests against (a) gaps found in the code, (b) the engagement features already planned in
`docs/06-FEATURE-PLAN.md` and `docs/plans/FEATURE-IMPROVEMENT-PLAN.md` (XP, streak freeze, leagues, badges, AI cards,
item analysis — **not repeated here**), and (c) what real classroom use will hit within the first weeks.
Each item says **why**, **effort**, and **contract/DB impact**. Recommendation column: **Now** = include in this effort,
**Next** = follow-up, **Defer** = needs a product decision or depends on org scoping.

### 13.1 Authoring (items 1, 3, 4)

| ID | Feature | Why (evidence) | Effort | Contract / DB | Rec |
|---|---|---|---|---|---|
| **F1** | **Create/rename chapters & topics from the app** | `GET /api/syllabus` is read-only; categories exist only via `npm run seed`. "Add questions in a category" is impossible for any new chapter/topic without a developer. | M | additive routes; no DDL (`chapters`, `sections` exist; need `section_no` uniqueness rules + sort order) | **Now** |
| **F2** | **Bulk import / export questions** (paste CSV/JSON or pick a file; dry-run preview with per-row errors; export a section as the same JSON the seed uses) | Entering 50 questions one-by-one in a phone form is the main adoption blocker. Reuses `AuthoredQuestion` validation, so imports are checked exactly like seed content; export gives backups and round-trips with `content/`. | M | additive (`POST /api/questions/import` with `dry_run`), cap rows (e.g. 200) | **Now** |
| **F3** | **Drafts + "Preview as student"** (`status: draft/published`, or reuse `enabled` plus a new `draft` flag) | Teachers need to author without going live in tomorrow's feed; preview catches wrong answers before 30 students see them. | S–M | one nullable/boolean column; additive | **Now** |
| **F4** | **Symbol/formula toolbar in the editor** (row of insert buttons: ² ³ ⁻¹ ₀₁₂ ° Ω μ θ λ π × ÷ ± → ≈ ≤ ≥ √ and units) | This is a physics/STEM app. A phone keyboard makes x², H₂O, Ω painful. Plain Unicode already renders everywhere and exists in current content (°, Ω, μ, θ, ×), so no LaTeX/KaTeX dependency (heavy on RN, accessibility issues). | S | none | **Now** |
| **F5** | **Image on the question side too, and "alt text" required** | For STEM, diagrams (field lines, circuits, ray diagrams) live in the *question*, not only the answer. Same storage path as §6; one extra column `question_image_path`. | S on top of §6 | additive; one column | **Now** (with §6) |
| **F6** | **Near-duplicate warning** while typing | The unique index only catches *exact* text; "State Fleming's left hand rule." vs "State Fleming's left-hand rule" slips through and splits SRS history. Warn (don't block) using normalised-text compare server-side in the list/create dry run. | S | none | **Now** |
| F7 | **Duplicate / "Save & add another" / keep-section-and-difficulty** | Authoring speed; trivial once the editor exists. | S | none | **Now** |
| F9 | **Edit history + restore** (`question_revisions` JSON snapshot per PATCH) | Shared pool + "any teacher edits any question" (D1) needs an undo and an audit trail. Pairs with D3. | M | DDL (1 table) | Next |
| F10 | **Link item-analysis to the editor** (06/N5 "probably bad question" → one tap to edit) | Closes the loop: find bad questions → fix them. | S once N5 exists | none | Next |
| F11 | **AI "draft questions from my notes" button in the editor** | Already planned as 06 PR-14; the editor just needs a slot ("Generate…" → candidates → review → save as drafts, which F3 makes safe). | L (PR-14) | per PR-14 | Defer |
| F12 | **Print / PDF of a day's set** (worksheet + answer key) | Common classroom need where phones are restricted. Web-only. | M | none | Defer |

### 13.2 Calendar (item 2)

| ID | Feature | Why | Effort | Impact | Rec |
|---|---|---|---|---|---|
| **C1** | **Plan ahead from the calendar** (activate topics for future dates; "copy last week" / "repeat Mon–Fri") | Today the teacher must activate topics **every morning**; the activations API already accepts a `date`. The calendar becomes the planning surface. Students still only see *today's* set (unchanged feed). | M | no DDL; additive helper endpoint for ranges | **Now** |
| **C2** | **Participation colour per day** (dot colour = % of class that finished) | Turns the calendar from "what was added" into "how did the class do"; reuses `reports` aggregation. | S–M | additive range endpoint | **Now** |
| C3 | **One shared month-grid component** for teacher calendar *and* the student streak heatmap (06 PR-10) | Build once, theme once, test once. | S | none | **Now** (design rule) |

### 13.3 Profile & account (items 5, 6)

| ID | Feature | Why | Effort | Impact | Rec |
|---|---|---|---|---|---|
| **F13** | **Delete my account / export my data** (in profile) | The app creates accounts for minors. Store policies (e.g. Google Play's in-app account-deletion requirement) and Indian data-protection rules for children's data make this likely mandatory before a public release — **confirm with whoever owns compliance**; build the mechanism regardless. Implementation: API deletes the Supabase user via service role, anonymises or deletes submissions/streaks/review states. | M | additive `DELETE /api/me` (confirm sheet, password re-entry) | **Next** (before store/public launch) |
| **F14** | **Settings: haptics on/off, reduced motion, text size** | Accessibility plus teacher/student comfort; haptics are currently always on. | S | local storage only | **Now** (profile) |
| **F8** | **Teacher-assisted password reset + roster** (teacher sets a temporary password for a student; roster list with last-active) | Email reset (§7) assumes students have readable email. Many school students won't, and the demo/created accounts use `@stemri.local`. Teachers resetting a forgotten password is the realistic school workflow. | M | additive `POST /api/students/:id/reset-password` | **Defer until org scoping (06 PR-01/02)** — without it *any* teacher could reset *any* student's password. This is a security gate, not a preference. |
| F15 | **Email verification at signup** (today auto-confirmed) | A mistyped email = permanently unrecoverable account; also needed for trustworthy reset. Cost: signup friction and SMTP dependency. | S–M | Supabase setting + UI states | Defer (decide with Q4/Q8) |
| F16 | **Notification preferences** | Needed once 06 PR-06 push exists. | S | PR-06 | Defer |

### 13.4 Platform & operations (enablers, not features)

| ID | Item | Why | Effort | Rec |
|---|---|---|---|---|
| **O1** | **Keep the API warm** (free uptime ping to `/api/healthz` every ~10 min, or paid always-on) | Render free tier sleeps after ~15 min; the first login took **20–25 s** in testing. This is the single biggest "feels broken" moment for a new user, and every new screen (list, editor, calendar) inherits it. Also add a visible "waking the server…" state on first load. | XS | **Now** |
| **O2** | **PWA polish for the web channel** | DEPLOY.md calls the web app (Vercel) the primary channel, but `app.json` has only a favicon: no `web.name/shortName/themeColor/backgroundColor`, no `public/` assets, no tested "Add to Home Screen" flow. (Not verified in a deployed build — check on the real Vercel URL first.) | S | **Now** |
| **O3** | **Error + usage monitoring** (Sentry-style crash reports for app and API; the metrics in `feature_improvements.md` §6 are currently not instrumented) | The audit found no monitoring or CI. With real students you need to know about failures before teachers do. Free tiers exist. | S–M | Next |
| **O4** | **CI** (GitHub Actions: typecheck, test, lint, verify, Playwright web smoke) | There is no `.github/`; every item above adds surface area. Playwright already runs headless here. | S | **Now** |
| **O5** | **Drizzle migrations** instead of hand-run SQL blocks | Phases 1–5 add ~5 schema changes (D8). | M | Next |

### 13.5 Considered and not recommended (yet)

- **Math rendering with LaTeX/KaTeX** — heavy on React Native, poor screen-reader support, and F4's Unicode toolbar covers the syllabus
  seen so far. Revisit if content needs fractions/integrals (then evaluate a web-view or SVG renderer).
- **Teacher-uploaded student-visible video/audio** — storage, moderation and bandwidth cost; images first.
- **Student-uploaded images/avatars** — child-safety moderation burden (consistent with 06 §12 exclusions).
- **Real-time co-editing of questions** — single-school pilot does not need it; edit history (F9) is enough.

### 13.6 Revised order with the additions

| # | PR | Notes |
|---|---|---|
| 0 | **O1 keep-warm + O4 CI + O2 PWA polish** | Small, de-risks everything after |
| 1 | Forgot/reset password (§7) | S–M, needs your Supabase setup |
| 2 | Student profile (§8) + **F14 settings** | Declutters the feed header |
| 3 | API: PATCH/filters/paging/CORS/length limits + seed lock (§4) + **F3 drafts**, **F6 duplicate warning** | Backbone |
| 4 | Teacher tabs + Questions list | |
| 5 | Editor (§4) + **F4 symbol toolbar** + **F7 clone/add-another** | |
| 6 | **F1 chapters/topics management** | Makes "add questions" complete for new content |
| 7 | **F2 bulk import/export** | Biggest authoring speed-up |
| 8 | Calendar (§5 A) + **C1 plan-ahead** + **C2 participation colours** (one shared grid, C3) | |
| 9 | Images (§6) + **F5 question-side image** — **new APK** | |
| 10 | **F13 delete account / export**, **F9 edit history**, **F15/F8** after org scoping | before public/store launch |

Total scope grows from 8 PRs to ~11. If that is too much for one round, the smallest set that makes teacher authoring *usable*
is: PRs 3 → 4 → 5 → 6 → 7, then the calendar.
