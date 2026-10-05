# UX audit, round 3

Note: a few `[name]` references below point to shots taken during the audit that were pruned to keep the folder at 25 images; the described behaviour was observed directly.

Method: headless Chrome against the local stack (web build, real API), 420 px and 320 px, light and dark where noted. Both roles walked end to end. Screenshots live in `docs/reviews/ux-r3/` (25 files, referenced below as `[file]`). The web server was restarted with hot reload mid-audit; every screen was re-captured after that, so the shots are current. The teacher **Today** screen was redesigned during the audit (reviewed in A7). The teacher **Students** screen is **in progress, skip** and is not audited.

Caveats:
- Kannada glyphs render as boxes in this sandbox (no Kannada system font), so the Kannada text itself is unverified. See C12.
- The seeded day contains only flashcards. The student MCQ card was reviewed through the teacher editor's "Preview as student", which renders the same `QuestionCard`.
- The self-study review and Done states were only partly captured: Easy and Again were rated but the card-2 and finish states were not seen.
- Dark mode was sampled on login, forgot password, feed, profile, appearance sheet and Today. The rest was not captured in dark.

---

## A. Screen-by-screen problems

### A1. Login / signup / forgot password / forced change
`[login-l420]` `[signup-l420]` `[forced-chpw-err-l420]`
1. **Fields have placeholders only, no labels.** Login (`email`, `password`) and signup (`full name`, ...) lose their meaning once typed in. On the forced change-password screen `[forced-chpw-err-l420]` the two password fields have **no placeholder and no label at all**, so a 12-year-old cannot tell which one is "new" and which is "confirm". Fix: visible 14 px/700 label above each field (or at least placeholders "New password" and "Type it again").
2. **Input text is inset about 28 px** (text starts at x=73 in a field starting at x=44), which suggests a reserved icon slot with no icon. Text looks mis-aligned against the button and card edges. Remove the slot or add the icon.
3. **Layout jumps when an error appears.** On login the logo and title shift up about 16 px when "Invalid login credentials" is inserted. Reserve a fixed-height message row.
4. **Raw server wording**: "Invalid login credentials". Replace it with "That email or password is not right. Try again." and never echo the provider string.
5. **Sign-in button text is regular weight, while "Create account" is bold** (`[signup-l420]`). The primary-button label weight should be fixed in the Button component (700).
6. **Title "Daily Revision" is about 16 px**, smaller than the rocket illustration and weak as a hero. On web it renders in the fallback font (see B1).
7. **Signup header is detached.** The back chevron sits at x=35 and "Create account" at x=80, vertically centred in the page rather than pinned to the top. The same words appear again on the button ("Create account" twice, 100 px apart). Pin the header, and name the card "Create your account" or make the button "Sign up".
8. **Signup validation shows one error at a time** ("Enter your name" only). Show all field errors inline under their fields.
9. **Student/Teacher segmented control**: the selected state is only a lighter fill, and the contrast between selected and unselected is low (about 1.5:1 in the fill). Add a 2 px primary border or a check icon.
10. **Login "Study offline (no account)"** is a full-width outline button of the same height as Sign in, so it competes with the primary action. Make it a text link, or move it under "Create an account" with less weight.
11. **Forgot password** (`forgot-d420`, dark) is clear, but "Teachers: Ask your school admin to reset your password." is a dead end with no contact action. The text-only 1-2-3 list is good. Fix: the numbers sit at about 14 px in the accent colour (low contrast in dark). Use `text` colour at 700.

### A2. Student feed
`[stu-tour3-l420]` `[stu-feed-q-l420]` `[stu-after-answer-l420]`
1. **First-run tour step 3 does not point at anything.** It draws a fake "3/15 / 4" chip pair inside the dialog and an arrow that does not line up with the real header (which is dimmed behind). Either spotlight the real header or drop the arrow.
2. **The tour reappears on every fresh browser or device** (flag is stored locally per user key). It is a per-device first-run, so a student on a shared tablet sees it again. Confirm with product (D-item 20).
3. **Progress counter contradicts the card label.** After answering 1 of 15 the header says `1/15` but the card says `Q1/14`, and on the final card it says `15/15` with `Q1/1` `[stu-after-answer-l420]`. Two different denominators on one screen confuse a student. Use the same number: "Question 2 of 15".
4. **"Show Answer" is a mauve fill with dark text** (about 3.2:1 contrast, below 4.5:1 AA for 14 px text). The three rating buttons (red/green/teal) use pastel fills with dark text of about 3.5:1. Rating buttons use emoji while the header uses Ionicons, so there are two icon languages (also in the review and tour screens).
5. **"Skip" is a small underlined text link in the middle of the empty space**, about 18 px high, a tiny touch target and far from the thumb. It also sits at the same visual weight as the helper line "Think hard, then flip!". Make it a 44 px ghost button and add a one-line explanation the first time: "Skip - it comes back at the end".
6. **Header: "Study" pill is ambiguous.** It opens self-study decks, while the header also has the avatar for Profile. Rename it "My decks" (the Profile screen already calls it "My decks"; the self-study screen calls itself "Self Study"). Three names for one thing.
7. **Large empty space.** The question sits mid-card with about 130 px of blank above and 200 px below. Top-align the question block so long questions don't push the answer off screen at 320 px.
8. **After answering, "Great recall!" + explanation + "Next" + a ghost bar "Scroll or press the Down arrow"** says the same thing two ways. "Scroll or press the Down arrow" is a desktop hint that is wrong on a phone. Show it only on web with a keyboard, or drop it.
9. **Progress bar track and fill nearly the same colour** in dark (`[stu-feed-q-d420]` in the earlier run: track `Nord2`, fill `Nord10`). At 0/15 the bar looks empty or full depending on theme. Raise the track contrast.
10. **Flame count `0` shown in the header on day 0** reads as a failure. Hide the streak until it is at least 1, or show "Start a streak".

### A3. Student Done state and summary
`[stu-done-l420]` `[stu-summary-l420]`
1. **Done state offers three buttons that do two things**: "Review my decks" (primary), "Refresh", and two pills "Study" and "Profile". "Study" and "Review my decks" go to the same place. Keep one primary CTA ("Review my decks"), one secondary ("Refresh" as text link), remove the pills (the Profile link is the avatar elsewhere).
2. **Two completion screens with different copy**: `Done for today!` (feed) vs `Daily Revision Complete!` (`/summary`). The summary also contains "Sign out", which is odd directly after a win.
3. **`/summary` can be opened directly with 0 answers** and still says "Daily Revision Complete! You made it through today's set" with "Streak: 0". A wrong congratulation. Guard: redirect to the feed if `progress.completed` is false.
4. Emoji in headings (🎊 🧠 🌟 🔥) are inconsistent with the Ionicons used everywhere else, and render differently per OS.
5. The illustration is a large decorative emoji (about 64 px) that pushes the CTA to the middle; fine on 420, tight at 320.

### A4. Student profile
`[stu-profile-tall-l420]` `[stu-profile-chpw-err-d420]`
1. **Big empty gap**: "Profile" heading sits 56 px below the Back link and 40 px above the first card. Header uses a different pattern from every other screen (see B3).
2. **Edit-name pencil** is a 16 px glyph with no visible button boundary; the touch area is probably 44 px but looks like decoration. Give it a 44 px circular outline button or make the whole name row tappable.
3. **Name block alignment**: name, role and class are spread over three rows with large spacing (name at y=230, "Student - Class 10A" at y=274). Tighten to 4 px between lines.
4. **Question Language** radio cards are large (about 56 px each) with a heading above and a card around them, so a three-option choice takes 230 px. Use a segmented control, or drop the nested card.
5. **My stats**: six numbers with unclear labels. "Learned" and "Reviewed" are not explained; "Due today" and "Tomorrow" relate to the self-study decks, not to the daily set (the section is under "My space" but looks like general progress). Rename "Deck cards due today" and so on, or move into My decks.
6. **0 days / 0 days / 0% / 0 / 0** is a lot of zeros for a new student; show a single friendly line "Answer your first question to start your stats".
7. **Settings group**: Appearance has a right chevron, Change password has a down chevron, How it works has a right chevron, and only some rows have subtitles. Rows have different heights (Appearance 70, Change password 74). Use one pattern.
8. **Change password has no "current password" field** and no show/hide toggle; the mismatch error "Passwords don't match." appears only after pressing Update; the fields have no labels (same as A1.1). Error text is about 13 px red on dark (about 4:1).
9. **Sign out** is a red-outlined button directly under settings with no confirmation. Sign out of a shared device is cheap, but the red outline competes with real destructive actions. Use neutral outline plus a `ConfirmSheet` only if there is unsynced data.
10. Version line "Daily Revision - v1.0.0" is 11 px grey, below contrast guidance.

### A5. Self-study
`[ss-list-l420]` `[ss-deck-2cards-l420]` `[ss-review-answer-l420]`
1. **Two "+ New Deck" buttons** on the empty list (header and body). Keep the body one in the empty state, the header one when decks exist.
2. **Header pattern differs between list and deck screens.** List: chevron-only back, title not centred, a "+ New Deck" button and a sun icon. Deck and review: bold "< Back" text link with the title beside it. Pick one.
3. **Unlabelled sun icon button** top right (theme). A theme button on a flashcard screen is out of place; it is on every screen of the self-study stack and takes space from the title.
4. **Empty-state copy says "it lives on this device, no account needed"** to a signed-in student. For a signed-in user the useful message is that the decks are **not synced**: "Your decks are saved on this phone only. They are lost if you clear the app's data or sign in on another phone." Today a student who signs in on another device sees "No decks yet" and thinks the data is gone.
5. **Disabled "Save" / "Add" buttons look like pale primary buttons**, with no hint of why they are disabled. Add helper text ("Give your deck a name") or enable and show the validation message on press.
6. **Add-card sheet**: the two textareas have only placeholders; after "Add" the sheet stays open (good) but the only feedback is a toast that overlaps the page header (`[ss-deck-2cards-l420]`: the "Card added" toast covers the Back button and title). Toast position must be below the safe area but not on top of the header, or at the bottom above the tab bar.
7. **"Nothing due" and "Review 2 due"** is a wide primary button; "Edit deck" and "Delete deck" are two tiny text links with an icon, at the bottom (about 18 px high). Make Delete a 44 px outline-danger button with `ConfirmSheet`.
8. **Review screen typography is different from the main feed**: question 16 px regular (feed: 24 px bold), "Show Answer" outline (feed: mauve fill), 4 ratings Again/Hard/Average/Easy (feed: 3 ratings). The rating buttons sit at the bottom edge of the viewport and at 320x700 are partly cut off (`ss-review` run); the card consumes all height. Use the same `QuestionCard` visuals.
9. **Web console error: `<button> cannot contain a nested <button>`** on the deck screen (the row is a button that contains the delete icon button). This is a real accessibility problem (screen readers announce nested interactive controls) and shows a red dev overlay in development. Make the row a `View` with two siblings.
10. Delete-card icon button has no confirmation visible (the trash circle deletes a card); confirm it is a `ConfirmSheet`.

### A6. Teacher: Questions list, filters, editor
`[t-questions-l420]` `[t-q-filters-l420]` `[t-editor-empty-save-l420]` `[t-editor-bottom-l420]` `[t-editor-delete-confirm-l420]`
1. **Header inconsistency**: "Questions" is 28 px bold with a primary "+ New question" button; Calendar is 20 px; Reports is "< Back  Performance" 18 px. Three tab roots, three header styles (B3).
2. **Three layers of controls above the list** (two action chips, a Topic select, a search field, then "Filters") use about 360 px before the first question. On 420x860 only 5 rows fit. Merge "Manage topics" and "Import / export" into one overflow ("...") menu, and put Topic and Search on one row or put the topic filter inside Filters.
3. **Filters collapsed show no active-filter state.** If a teacher sets Draft and closes the panel, nothing indicates the list is filtered. Show "Filters (2)" and a "Clear" link.
4. **Filter groups use "All / Hide / Show / Only"** for Archived: "Hide / Show / Only" is jargon. Use "Active", "Archived", "Both".
5. **List rows**: status chips (MCQ, Medium, Draft) use 4 different colour families on one row, plus "0 answered" right-aligned in grey. The chip colours (blue, yellow, green, red) mean type, difficulty and status at once. Colour only status, neutral for type and difficulty.
6. **Editor validation toast covers the form.** "Please fix the highlighted fields." is rendered over the Topic field and the header (`[t-editor-empty-save-l420]`, `[t-editor-noanswer-l420]` at run time), hiding the first error. Show it as a banner **inside** the scroll content, or at the bottom above the save bar.
7. **Required fields are not marked.** The MCQ "Explanation" is required, but only discovered on Save ("Add a short explanation students see after answering."). Mark required fields or describe them ("Explanation (required)").
8. **"Mark which option is correct." error appears under Option D**, below the sticky bar's top edge on 860 px; the radio circles (about 28 px) are the only way to mark the answer. Circles are below the 44 pt target (the hit area may be bigger but is visually 28 px). Make the whole option row show a "Correct" toggle.
9. **Explanation placeholder is a sentence** ("Why is this the answer? Students read this after answering.") that is long and clipped on 320 px. Use a short placeholder + helper text.
10. **Flashcard "Answer" textarea shows 2.5 lines and clips the text** (`[t-editor-existing-l420]` run: 126 characters with the third line cut off). Auto-grow to content.
11. **The "Preview as student" panel is about 700 px tall** with mostly empty space, and pushes "More actions" (Duplicate, History, Archive, Delete) to the very bottom (`[t-editor-bottom-l420]`). Actions that matter (History, Archive) are buried. Collapse the preview by default, cap its height at 360 px, or move "More actions" to an overflow in the header.
12. **"Save & add another" is shown when editing an existing question**, where it makes no sense. Show it only for new questions.
13. **Delete confirmation uses the primary blue button** for "Delete" (`[t-editor-delete-confirm-l420]`). A destructive confirm must be red/danger. The body copy "If students have answered it, archive it instead." is good; the title "Delete this question?" is fine.
14. **History sheet empty state** "No earlier versions yet. Edits are recorded here." is fine, but the sheet is half-height with large dead space. Fine; consistent with other sheets.
15. A one-time **"Topics could not load - tap to retry"** appeared on the New question screen during the audit, after navigating back from an edit. The error row is a bare red outline box; style it as `ErrorState` and retry automatically once.
16. **Toast after "Save" overlaps the page title and the "+ New question" button** (`[t-after-save2-l420]` run) while it fades in; position it below the header or above the tab bar.

### A7. Teacher Today (redesigned, done)
`[t-today-redesigned-l320]`
Much better than before: date line, headline, a clear collapsible chapter, a sticky bar, and "Class overview" rows. Remaining notes:
1. The status is stated **three times**: "3 topics activated today - 49 questions" (green), "Physics - 3 of 3 topics selected", and the sticky bar "3 topics selected / 49 questions". Keep the first and the sticky bar, drop the middle one or make it "All 3 selected".
2. **The sticky bar's button says "Update" even when nothing changed**, and it is fully enabled. Disable it until the selection differs from what is active, and label it "Update today's topics" (first activation: "Activate for students").
3. "Clear" is a tiny text action (about 12 px) next to the chapter title and clears all topics in one tap with no undo; consider moving to the bar or confirming. Its target is under 44 px.
4. **At 320 px the sticky bar and tab bar together take 130 px of 700** (`[t-today-redesigned-l320]`), and the third overview card is cut off; the tab label "Questions" is truncated to "Questio...". Reduce the sticky bar to a single 56 px row, and shorten tab labels to "Quiz"/"Bank"? (product decision) or reduce the label to 10 px.
5. Topic counts differ from the catalog: Today says **15** questions for 12.1, the catalog says **16** (`[t-catalog-l420]`). One counts published, the other everything including drafts/archived. Label it ("15 published") or use one definition.
6. Dark mode (checked) is good; the green status line is a pale green on dark (OK).

### A8. Teacher Calendar
`[t-calendar-l420]` `[t-cal-daysheet-l420]` `[t-cal-plan-day-l420]`
1. **Title is 20 px "Calendar" while Questions is 28 px**; the "Plan ahead" outline button is in the header while "Done" replaces it in plan mode (good) but changes size.
2. **Legend "Tint: participation" is cryptic.** Rewrite: "Green background = students took part", or hide the legend behind an info icon. Dots: blue "Questions added", green "Topics activated" are tiny (4 px).
3. **Day sheet**: "Questions added (49)" lists all 49 questions as 50-px rows, a very long list for a summary; the group "Topics activated" is the key information. Collapse the list behind "Show 49 questions". The sheet title is "Sunday, 4 October 2026" in a different (serif/fallback) font and bold, whereas everywhere else dates are sentence case.
4. **Participation line "0 of 3 students answered (0%)"** is sensible, but there is no link to Participation.
5. **Plan mode**: past days are greyed with no explanation; the helper copy "Tap today or future days to select them, then choose the topics to activate." is fine. The selected day (6) is a solid primary block with white text, whereas today (4) is outlined, easy to confuse. The bottom bar is "1 day selected / Choose topics / Copy last week / Clear selection": "Copy last week" has no description of what it copies; add a sub-label "Same topics as 29 Sep".
6. The first weekday is Monday, with Sunday on the right; blank cells before Oct 1 are not tappable, fine. The calendar occupies the top half; the lower 200 px is empty on 860 px.

### A9. Teacher Reports and Participation
`[t-reports-l420]` `[t-participation-l420]`
1. **Naming mismatch**: tab "Reports", screen title "Performance", link text on Today "Performance". Choose one (suggest "Performance").
2. **A root tab shows a "< Back" link**; there is nothing to go back to (it would leave the tab). Remove it on tab roots; use a header title only.
3. **"0% class accuracy / 0 answers / 0 students" on an empty range** reads as "the class is failing". Show "-" for accuracy when answers = 0 (this audit's API returned an empty `per_student`).
4. Range chips "Today / 7 days / 30 days" are good (44 px), but the selected chip fill is low contrast (about 1.6:1 vs unselected). See B1 (selected state).
5. **Empty state "No answers in this range yet - ask students to start their revision! 🚀"**: fine, but add a secondary link to Participation.
6. **Participation**: the grey "pending" badge with white text is about 3:1 on `Nord3`-like grey; the row text "not started yet" is also grey on grey tint. The avatars use random pastel colours that vary in lightness; the initial letter is low contrast on the yellow/peach ones. No sort order is stated (alphabetical?), and a teacher would want pending students first with a "Nudge" (not a new feature: just sort pending to top).
7. Header here is "< Back  Participation" at 18 px in the left; the page title is not large, the stat tiles (0/3, 0, 3) have no explanation of "completed" vs "started".

### A10. Catalog and import/export
`[t-catalog-l420]`
1. **Naming**: button says "Manage topics", the screen says "Chapters and topics". "Import / export" appears both on the Questions screen and here.
2. **Icon-only controls** (up arrow, down arrow, edit, delete) in each topic row: 4 square 44 px buttons without labels, and disabled ones (first up, last down, delete) fade to 30%; the red trash button is pale at rest. Row is 3 lines tall for a title and the count. Consider overflow menu per topic.
3. The delete is disabled for non-empty topics with no explanation visible ("can only be deleted when empty" is in the page header only). Add a tooltip-like helper below: "Move or delete its 16 questions first".
4. **Import page**: "Default topic (optional)" selector text "None: rows carry chapter_no and section_no" is code jargon for a teacher. Say "Use the topic in each row". The textarea placeholder is a long monospace CSV header that wraps mid-word (`option1,option2,...`). "Check" is a disabled full-width primary button; the dry-run concept ("Check" then "Import") is good but the words should say "Check file" and "Import 12 questions".
5. "Export a chapter" uses a radio card with a single chapter and a disabled "Download JSON"; fine, but the radio affordance for a single option is odd, preselect the only chapter.

### A11. Teacher profile
Same structure as student profile minus stats. "My decks - Your own flashcards" appears for the teacher too (needs a product decision, D26). Same chevron inconsistencies as A4.

---

## B. Cross-cutting design-system issues

1. **Fonts do not load on web.** `document.fonts` shows `Fredoka_500Medium/600/700` and `Nunito_400/600/700` as **unloaded**, while the CSS vars point to `Nunito, ui-sans-serif` and `Fredoka, sans-serif` (names that don't match the registered faces `Nunito_400Regular`...). Headings and body fall back to Arial/Noto. Result: the "kid-friendly" Fredoka heading never shows on web, and heading weight/size cues are weak. Fix the family names used by the web `--font-sans`/`--font-rounded` or register the faces under those names (`mobile/src/constants/theme.ts`, the web font loader in `_layout.tsx`/global CSS). Native is unaffected.
2. **Button variants are not consistent.** Observed: primary fill (slate blue) with regular text on login, bold text on signup/editor; outline buttons with 2 different border radii (pill on header "Study", 12 px rect on login "Study offline"); mauve "Show Answer"; pastel rating buttons; text-link buttons ("Skip", "Clear", "Edit deck"); danger as red outline (Sign out) vs red text (Delete deck) vs blue (Delete confirm). Define: Primary, Secondary (outline), Ghost (text), Danger (filled red for confirm, outline red for entry), each with min height 44, label 14/700.
3. **Selected state for chips/segmented controls is too faint.** Chips (Type, Difficulty, Language, Status, range chips, Student/Teacher) use a light tinted fill with a thin border; the unselected has a dark border, so unselected looks heavier than selected. Selected = filled `primary` with white text, or 2 px primary border + check.
4. **Header patterns (5 variants)**: (a) big title + action (Questions), (b) small title + action (Calendar), (c) "< Back" bold text + 18 px title (Reports, Participation, Catalog, Import, deck, review, editor), (d) chevron-only + centred-ish title + actions (Self Study list), (e) "< Back" then 28 px "Profile" below (Profile). Choose two: **Tab root** (28 px title + right action) and **Pushed screen** (44 px chevron back + 18 px title + optional right action). Reuse `BackButton` everywhere.
5. **Cards**: three radii (about 16, 20, 24) and three fills (flat tint, tint with border, outline-only on Questions rows). Question rows use outline-only 12 px radius; settings cards use filled 16 px; stat tiles 12 px. Pick `card` (filled, 16) and `row` (outline, 12) and use them by role.
6. **Sheets/modals**: history/theme/confirm sheets are bottom sheets with a drag handle and a left-aligned title; "Create New Deck"/"Add card" are **centred dialogs** with a different title weight; the day sheet has a drag handle but no title spacing. Use bottom sheets for everything, with the same title (18/700) and button row.
7. **Toasts overlap content**: top-anchored, they cover headers in at least four places (editor save, deck "Card added", question created, validation). Anchor them above the tab bar / bottom safe area, 56 px from the bottom, and never above 16 px of header.
8. **Icon usage**: Ionicons in navigation and rows; emoji in cards, headings, rating buttons, empty states (🚀 🎊 📚 👀 ✨ ✅ ❌ 🧠 💪). Emoji render differently per platform and sit oddly next to line icons. Allow emoji only for celebratory moments; use Ionicons for buttons and tags.
9. **Typography scale** is not defined; observed sizes: 11 (tab labels, version), 12-13 (helper, chips, errors), 14 (body small, buttons), 16 (body), 18 (screen title), 20 (Calendar), 24 (question), 28 (Questions/Profile). Define 6 steps: caption 12, small 14, body 16, title-s 18, title-m 24, title-l 28; no 11 px except tab labels; min 12 px for error text.
10. **Spacing**: screen gutter is 16, card padding 16-20, section gaps 16-40 (Profile heading gap 56). Standardise: gutter 16, card padding 16, gap between sections 24, between heading and content 12.
11. **Dark mode**: the card and background differ by only about 6% lightness (`Nord1` vs `Nord2`), so cards are hard to see on dark; outlines at `Nord3` are low contrast. Error red `#bf616a` text on `Nord1` is about 4:1. Progress track vs fill are close (A2.9). Use `Nord3` borders at 1.5 px for outline controls and a lighter red (`#d08770`/`#e5a0a6`) for error text on dark.
12. **Touch targets**: "Skip", "Clear", "Edit deck", "Delete deck", the profile pencil, the MCQ correct-radio circles (28 px) and the catalog icon buttons' disabled state are all smaller than or at 44 pt in practice. Enforce `min-h-11 min-w-11` on every `Pressable` via the Button component.
13. **Error and validation language**: mixes full sentences ("Passwords don't match."), imperatives ("Enter your name"), and raw ("Invalid login credentials"). Define: short sentence, kind tone, say what to do ("Type your name.").
14. **Accessible names** are generally good (the e2e uses them), but the nested button issue (A5.9) and unlabeled password fields (A1.1) are gaps.

---

## C. Logic and flow improvements

1. **Counter mismatch (feed)**: header `1/15` vs card `Q1/14`; final card shows `Q1/1`. Use one global counter (A2.3).
2. **Direct `/summary` shows a false "complete"** with 0 answers (A3.3). Guard on `progress.completed`.
3. **Forced change-password has no way to see/verify what you type**: no labels, no show toggle, "Sign out" is the only escape. Add labels and an eye toggle; keep "Sign out".
4. **Change password without current password** (profile). If the session is hijacked on an unlocked phone the account is lost. Needs product/security decision, but at least add the confirmation field label and a success toast with "You're still signed in".
5. **Self-study decks are device-local** but the UI never says so after sign-in. A student who switches phone loses everything silently (A5.4). Show a one-line banner with the limitation on the deck list.
6. **Nothing says what "Skip" does** until you use it ("it comes back at the end" is only announced to screen readers). Show a toast "Skipped - you'll see it again at the end".
7. **Validation on save is deferred**: the editor shows a generic toast, scrolls to the first error, but required fields are unmarked (A6.7). Mark required fields; disable "Save" only if nothing changed.
8. **"Update" on Today is always enabled** and the first activation vs an update look the same. Use "Activate for students" the first time and "Update today's topics" after, disabled until changed, with a confirm only when removing a topic that students already started.
9. **Edit screen offers "Save & add another"** (A6.12) and there is no unsaved-changes guard visible: pressing "< Back" in the editor after typing should ask "Discard changes?" (verify; not observed as a sheet during the audit, treat as to-check).
10. **Delete flow**: a question with answers can be deleted only by the API refusing; the sheet warns in text, but the destructive confirm is blue (A6.13). Disable "Delete" and show "Archive instead" when the question has answers (the list already shows "0 answered").
11. **Counts disagree** between Today (15), Catalog (16) and the calendar day sheet ("Questions added (49)" for the day) (A7.5, A8.3). Define "questions" as published, non-archived, everywhere, and label drafts separately.
12. **Kannada**: the Language filter, the student language picker and the editor all show Kannada text, which must render with an Indic font on web; headless Chrome showed boxes. On low-end Android WebViews the same can happen. Ship a Kannada font (Noto Sans Kannada) with the web build and verify on a real phone.
13. **Empty-range reports** show 0% (A9.3). Show "-" and a hint.
14. **Participation order**: put pending students first, and show "Revised 8/15" instead of only a state badge for started students.
15. **Teacher profile "My decks"**: a teacher's personal decks live only on that device; same issue as C5.
16. **Login errors for locked/expired sessions** are not distinguishable from wrong passwords ("Invalid login credentials"). If the API returns a network error, say "No connection. Check your internet and try again."
17. **Back behaviour on web**: the self-study list reports URL `/` while on that screen (no path change), so the browser Back button leaves the app. Route self-study with a real path (e.g. `/self-study`) so Back and refresh work.
18. **Toast "Deck created" appears after the sheet closes**, fine, but "Card added" appears while the sheet remains open and covers the header; move toasts (B7).

---

## D. Prioritised backlog (30 items)

Effort: S under half a day, M 1-2 days, L more. Risk: low/med/high for regression. Files are mobile paths under `mobile/src/` unless noted.

| # | Pri | Change | Why | Files | Effort | Risk | Product decision? |
|---|---|---|---|---|---|---|---|
| 1 | P0 | Fix the `<button>` inside `<button>` on the deck list: make the card row a `View` containing a primary `Pressable` and a sibling delete `Pressable`. | Invalid DOM, broken screen-reader semantics, dev overlay. | `app/(self-study)/deck.tsx` | S | low | no |
| 2 | P0 | Make the destructive confirm in `ConfirmSheet` red: `variant="destructive"` on the confirm button when the action is Delete/Remove/Reset. Verify every caller passes the flag. | A blue "Delete" is a wrong affordance on an irreversible action. | `components/confirm-sheet.tsx`, callers in `questions/edit.tsx`, `students.tsx`, catalog | S | low | no |
| 3 | P0 | Guard `/summary`: redirect to `/` unless the feed reports `completed`. Unify copy with the Done state ("You're done for today!"). Remove "Sign out" from Summary. | False congratulation; two completion screens. | `app/(student)/summary.tsx`, `app/(student)/index.tsx` | S | low | no |
| 4 | P0 | Fix web font loading: make `--font-sans` and `--font-rounded` resolve to the loaded `Nunito_*` and `Fredoka_*` faces (or register the faces under `Nunito` and `Fredoka`). Check `document.fonts` shows "loaded". | Brand typography never shows on web. | `constants/theme.ts`, `app/_layout.tsx`, global CSS | M | med (whole-app visual change; check wrapping at 320 px) | no |
| 5 | P0 | One counter on the feed: show `Question {answered+1} of {total}` on the card label, matching the header. | `1/15` vs `Q1/14` contradicts itself. | `app/(student)/index.tsx`, `components/question-card.tsx` | S | low | no |
| 6 | P1 | Add visible labels (14/700) above every text input on login, signup, change-password (forced and profile), deck/card sheets; password fields get an eye toggle. The forced screen needs "New password" and "Type it again". | Placeholder-only forms are the top usability gap; the forced screen has neither. | `app/login.tsx`, `signup.tsx`, `change-password.tsx`, `profile.tsx`, `components/auth-shell.tsx`, `ui/input` | M | low | no |
| 7 | P1 | Replace raw errors with friendly copy: "That email or password is not right. Try again." and a separate "No connection" message. Map auth error codes in one helper. | No raw strings is already the quality bar. | `state/auth.tsx`, `app/login.tsx` | S | low | no |
| 8 | P1 | Toast placement: anchor above the tab bar (bottom, 16 px above safe area); one toast at a time; never on the header. | Four screens hide the header or the first error under a toast. | `components/toast.tsx` | S | low | no |
| 9 | P1 | Editor: render the validation banner inside the scroll area (above the first field) and mark required fields with "(required)" in the label; only show "Save & add another" when creating. | The toast hides the first error; hidden required Explanation. | `app/(teacher)/questions/edit.tsx`, `components/question-editor/*` | M | low | no |
| 10 | P1 | Editor layout: collapse "Preview as student" by default (header row "Preview" with a chevron); cap its height at 360 px; move "More actions" (Duplicate, History, Archive, Delete) above the preview as a "..." menu in the header. | History/Archive are buried 700 px down. | `app/(teacher)/questions/edit.tsx`, `components/question-editor/preview-panel.tsx` | M | med | no |
| 11 | P1 | Today sticky bar: label "Activate for students" (first time) / "Update today's topics" (after), disabled until the selection differs from the active set; remove the redundant "3 of 3 topics selected" line; keep "Clear" at 44 px or move it into the bar. | Always-enabled "Update" is ambiguous; status is written three times. | `app/(teacher)/index.tsx` | S | low | no |
| 12 | P1 | Hide the "< Back" link on tab roots (Reports) and rename the screen "Performance" consistently with the Today link; make tab title "Performance" or the screen "Reports" (pick one). Show "-" instead of "0%" when there are no answers. | Dead "Back", mismatched names, misleading 0%. | `app/(teacher)/reports.tsx`, `_layout.tsx`, Today | S | low | yes (name) |
| 13 | P1 | Define the header patterns: `TabHeader` (28 px title + optional action) and `PushedHeader` (44 px `BackButton` + 18 px title + optional action). Apply to Calendar, Reports, Profile, Participation, Catalog, Import, editor, self-study screens. Remove the theme sun button from the self-study stack. | Five header variants today. | `components/back-button.tsx`, new `components/screen-header.tsx`, all screens | L | med | no |
| 14 | P1 | Button system: set min-height 44, label 14/700 in `ui/button`; add `destructive` filled; make "Skip", "Clear", "Edit deck", "Delete deck" 44 px ghost/danger buttons; unify "Study offline" as a text link. | Mixed weights, small targets. | `components/ui/button/index.tsx`, `question-card.tsx`, `login.tsx`, `deck.tsx`, Today | M | med | no |
| 15 | P1 | Chip/segment selected state: filled primary + white text (or 2 px border + check) for Type, Difficulty, Language, Status, Archived, range and role chips. Verify 3:1 against the unselected state in both themes. | Selected looks fainter than unselected. | `components/question-editor/chip.tsx`, `reports.tsx`, `signup.tsx`, `ui/` | S | low | no |
| 16 | P1 | Questions list: merge "Manage topics" and "Import / export" into a "..." menu; add active-filter count "Filters (2)" and a "Clear" link; rename Archived options to Active / Archived / Both; colour chips for status only. | 360 px of controls before the first row; hidden filter state; jargon. | `app/(teacher)/questions/index.tsx`, `components/question-editor/question-row.tsx` | M | low | no |
| 17 | P2 | Feed polish: "Show Answer" and rating buttons to 4.5:1 text contrast (darker label on the pastel or a deeper fill); replace the in-card "Skip" link with a 44 px ghost button and a toast "Skipped - comes back at the end"; hide "Scroll or press the Down arrow" off web; hide the streak until >= 1. | Contrast, small targets, desktop copy on a phone. | `components/question-card.tsx`, `app/(student)/index.tsx`, `constants/theme.ts` | M | low | no |
| 18 | P2 | Done state: one primary "Review my decks", one text link "Refresh", remove the Study/Profile pills. Rename the header pill "Study" to "My decks" and the screen title to "My decks" (profile and decks agree). | Redundant controls, three names for one thing. | `app/(student)/index.tsx`, `(self-study)/index.tsx`, `profile.tsx` | S | low | yes (name) |
| 19 | P2 | Tour: highlight the real header on step 3 (or remove the fake chips and arrow), and move the "seen" flag to the profile (server) so it doesn't reappear per device. | The step explains something it doesn't show; repeats on new devices. | `components/coach-overlay.tsx`, `lib/coach-storage.ts`, API profile field | M (L if server flag) | med (core contract is additive) | yes (server flag) |
| 20 | P2 | Profile cleanup: pull "Profile" heading up (use PushedHeader), tighten name block spacing, make the pencil a 44 px outline button, replace the 3-card language group with a segmented control, rename stats ("Deck cards due"), single empty message when all stats are 0, one chevron pattern in Settings. | Large dead gaps, inconsistent rows. | `app/profile.tsx`, `(teacher)/profile.tsx` | M | low | no |
| 21 | P2 | Self-study copy and structure: one "+ New Deck" per state; empty state text "Your decks are saved on this phone only. Clearing the app or switching phones removes them."; helper text under disabled Save/Add; real route path (`/self-study`) so web Back works; review screen reuses the feed card styling and 3 or 4 ratings consistently. | Silent data loss risk, two buttons, inconsistent visuals. | `app/(self-study)/*` | M | low | yes (3 vs 4 ratings) |
| 22 | P2 | Calendar: rename legend ("Green day = students took part"), collapse "Questions added (49)" behind "Show all", sub-label "Copy last week" with its date, make title 28 px like other tabs. Link participation line to the Participation screen. | Cryptic legend, long list, unclear copy action. | `app/(teacher)/calendar.tsx`, `components/month-grid.tsx` | M | low | no |
| 23 | P2 | Dark mode contrast: card vs background delta, outline borders to `Nord3` at 1.5 px, error text to a lighter red, progress track/fill separation, "pending" badge colours. Re-check each with a contrast tool (4.5:1 text, 3:1 UI). | Cards and tracks are hard to see on dark. | `constants/theme.ts`, `ui/card`, `ui/progress`, `ui/badge` | M | med | no |
| 24 | P2 | Catalog: per-topic overflow menu instead of 4 icon buttons, helper under disabled Delete ("Move or delete its 16 questions first"); unify counts with Today (published only) and label drafts; rename "Manage topics" to "Chapters and topics". | Dense icon rows, count mismatch. | `app/(teacher)/catalog.tsx`, `api/` counts (check) | M | low | yes (count definition) |
| 25 | P2 | Import/export: replace "None: rows carry chapter_no and section_no" with "Use the topic in each row"; buttons "Check file" / "Import 12 questions"; preselect the single chapter in export; shorten the placeholder to "Paste your questions here, or choose a file". | Jargon, ambiguous buttons. | `app/(teacher)/import.tsx` | S | low | no |
| 26 | P3 | Participation: pending first, "Revised 8/15" for started, readable pending badge (>= 4.5:1), consistent avatar colours with enough contrast for the initial. | Teacher needs to see who to chase. | `app/(teacher)/participation.tsx`, `ui/avatar` | S | low | no |
| 27 | P3 | Replace emoji in buttons and headings with Ionicons (keep one celebratory emoji on the Done screen); keep rating labels text-first. | Cross-platform emoji differences, two icon languages. | `question-card.tsx`, `summary.tsx`, `(student)/index.tsx`, tour | S | low | yes (tone) |
| 28 | P3 | Ship a Kannada web font (Noto Sans Kannada) and verify on a real phone and the web build; add the font to the web `<head>` with `font-display: swap`. | Indic glyphs showed as boxes in the test browser. | `app/_layout.tsx` / web HTML | S-M | low | no |
| 29 | P3 | Unsaved-changes guard in the editor ("Discard changes?" `ConfirmSheet` on Back when dirty) and "Archive instead" when the question has answers. | Prevent silent loss of long edits and a failing delete. | `app/(teacher)/questions/edit.tsx`, `BackButton` | M | low | no |
| 30 | P3 | Type scale and spacing tokens: add `Type.caption/small/body/titleS/titleM/titleL` and a 4/8/16/24 spacing scale; replace ad hoc sizes (11-13 px for text, 56 px gaps). | Foundation for all of the above. | `constants/theme.ts`, all screens (gradual) | L | med | no |

Suggested order: items 1-5 first (bugs and honesty), then 6-8, 11-12, 15 (cheap, high visibility), then the structural items 13-14 and 30, which unlock the rest.
