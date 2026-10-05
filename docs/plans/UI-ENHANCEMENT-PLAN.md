# UI Enhancement Plan — Daily Revision Mobile App

**Audited:** 2026-10-05  
**Scope:** All screens in `mobile/src/app/`, shared components in `mobile/src/components/`

## Priority legend

| Symbol | Level | Meaning |
|--------|-------|---------|
| 🔴 | Blocker | Accessibility failure or obvious defect — fix before next release |
| 🟠 | High | Visibly wrong or meaningfully degraded experience |
| 🟡 | Medium | Polish, consistency, copy, minor UX friction |
| 🟢 | Nice-to-have | Future improvement, low friction cost |

---

## Screen-by-screen findings

### Auth — `login.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| L1 | 🔴 | Motion | `Animated.loop` for the DECOR floating icons (lines 44–50) runs unconditionally. `useReducedMotion` is not imported or checked. Students with vestibular disorders see a perpetually moving background. | Import `useReducedMotion` from `expo-symbols` (or the project's own hook); skip `Animated.loop().start()` when reduced motion is on. Position the icons statically instead. |
| L2 | 🟠 | Accessibility | The sign-in `Button` (line 160) has no `accessibilityState={{ busy: isPending }}`. Screen readers cannot tell the user the form is submitting. | Add `accessibilityState={{ busy: isPending }}` to the `Button`. |
| L3 | 🟠 | Accessibility | The "New here? Create an account" `Pressable` (line 176) has no `accessibilityLabel`. Its nested `UIText` children are not concatenated into a screen-reader label by default. | Add `accessibilityLabel="New here? Create an account"` to the `Pressable`. |
| L4 | 🟡 | Accessibility | The "Study offline (no account)" `Pressable` (line 186) uses `accessibilityRole="button"` but the action navigates to a new route; `"link"` is more semantically correct. | Change to `accessibilityRole="link"`. |
| L5 | 🟡 | Visual consistency | The decorative icon `Ionicons` instances at lines 58–75 are inside `Animated.View` elements that are correctly marked `accessible={false}`. However the icon sizes (28, 22, 18) are raw numbers not derived from the spacing token system. | Use `Spacing.md`/`Spacing.sm` constants rather than magic numbers. |
| L6 | 🟢 | Interaction | `KeyboardAvoidingView` sets `behavior={undefined}` on Android (line 118), leaving the keyboard able to overlap the form. | Add `behavior="height"` for Android or wrap in `KeyboardAwareScrollView`. |

---

### Auth — `signup.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| S1 | 🟠 | Accessibility | The submit "Create account" `Button` lacks `accessibilityState={{ busy: isPending }}`. | Same pattern as L2 above. |
| S2 | 🟡 | Interaction | Validation errors surface only at submit time, in a single banner at the bottom. Password strength and email format could be surfaced inline as the user leaves each field. | Add `onBlur` validators that set per-field error strings, and render them below each `InputField`. |
| S3 | 🟡 | Visual consistency | The role-picker radio group (Teacher/Student) uses bespoke `Pressable` styling rather than the `Button` component system. The border-radius and padding differ from other segmented controls in the app. | Extract a `RadioGroup` or `SegmentedControl` shared component using `Button variant="outline"`. |

---

### Auth — `forgot-password.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| F1 | 🔴 | Accessibility | The progress steps container (line 38) sets `accessibilityRole="summary"`. `"summary"` is not a valid React Native accessibility role and will be silently ignored or misbehave on some screen readers. | Remove `accessibilityRole="summary"` from the container. Annotate each visible step text with `accessibilityLabel` or just leave the container with no role (it is purely presentational). |
| F2 | 🟠 | Accessibility | The countdown button label is built from ternary logic inside `ButtonText` (`'Send again in {wait}s' / 'Send again' / 'Send reset link'`) but no matching `accessibilityLabel` is set on the `Button`. Screen readers read only the static initial label on first render and may not update when the countdown starts. | Mirror the same ternary into `accessibilityLabel` on the `Button` component so VoiceOver/TalkBack re-reads the live value. |
| F3 | 🟡 | Accessibility | The `ActivityIndicator` shown while checking the reset-link hash (line 37–42 of the "change-password" recovery flow imported here) has no `accessibilityLabel`. | Add `accessibilityLabel="Verifying reset link"`. |

---

### Auth — `change-password.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| CP1 | 🔴 | Accessibility | The full-screen loading state `ActivityIndicator` at lines 41–43 has no `accessibilityLabel`. The screen is otherwise empty, so a blind user navigating in gets nothing. | Add `accessibilityLabel="Loading, please wait"` and `accessibilityRole="progressbar"` to the wrapper `View`. |
| CP2 | 🟡 | Copy | The "Sign out" action in the `ConfirmSheet` uses the label "Sign out" but the destructive-confirm copy says "Yes, sign out" — good consistency. No change needed here, noting it is correct. | No action. |

---

### Student — `(student)/index.tsx` (Feed)

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| ST1 | 🔴 | Accessibility | The full-screen loading `ActivityIndicator` (line 347) has no `accessibilityLabel`. | Add `accessibilityLabel="Loading today's questions"`. |
| ST2 | 🟠 | Accessibility | The "Review my decks" `Pressable` in the done-for-today empty state (line 421) has `accessibilityRole="button"` but no `accessibilityLabel`. Screen readers announce only "button" with no context. | Add `accessibilityLabel="Review my decks"`. Same fix for line 446. |
| ST3 | 🟡 | Visual consistency | The trophy emoji rendered by native `Text` at line 407 is inconsistent with the rest of the screen which uses `UIText`. Decorative emoji should use `UIText` with `accessible={false}` or be wrapped in a `View` with `accessible={false}`. | Replace with `<UIText accessible={false}>🏆</UIText>`. |
| ST4 | 🟡 | Empty / loading states | The streak counter only renders when `streak >= 1` — there is no "0-day streak" state. New students or students who broke their streak see nothing, missing the motivational context that a 0-streak nudges them toward. | Render the streak component unconditionally, showing "0 day streak" when `streak === 0`. |
| ST5 | 🟡 | Interaction | The `done` redirect (line 330) fires inside a `useEffect`. If `done` becomes `true` and the component unmounts and remounts (fast-refresh, back navigation), the `router.replace` may fire a second time. | Wrap the effect body in a ref-guard: `if (redirectedRef.current) return; redirectedRef.current = true;`. |

---

### Student — `(student)/summary.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| SM1 | 🟠 | Accessibility | The animated score display `{c}/{a}` (lines 83–86) uses `Animated.Text` with no `accessibilityLabel`. Screen readers may announce "18 slash 20" which is phonetically awkward. The outer animated `View` has no label either. | Add `accessibilityLabel={\`${c} out of ${a} correct\`}` on the animated `View` container and set `accessible={true}` on it; mark the child texts `accessible={false}`. |
| SM2 | 🟠 | Accessibility | The hero emoji `Animated.Text` at line 66 renders a plain emoji with no `accessible={false}`. Screen readers will read "party popper" / "pensive face" which breaks the flow of the result heading. | Add `accessible={false}` (or `aria-hidden` on web) to the `Animated.Text` emoji element. |
| SM3 | 🟡 | Accessibility | "Back to home" (line 110) and "Review my decks" (line 121) `Pressable` elements have `accessibilityRole="button"` but no explicit `accessibilityLabel`. Button text alone is fine for "Back to home" but "Review my decks" is ambiguous without context. | Add `accessibilityLabel="Review my decks in self-study"` to the second button to disambiguate from similar buttons in other states. |
| SM4 | 🟡 | Visual consistency | `Animated.Text` imports React Native's native `Text` directly (line 66) — inconsistent with the rest of the file which uses `UIText`. | Wrap: `const AnimText = Animated.createAnimatedComponent(UIText)`. |

---

### Student — `profile.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| PR1 | 🟡 | Accessibility | `SectionTitle` (line 388 onward) uses `UIText` with `accessibilityRole="header"`. `UIText` is a thin wrapper around RN `Text`; heading role should be on the rendered `Heading` component for semantic consistency across the app. | Replace `<UIText accessibilityRole="header" ...>` with `<Heading size="sm" ...>` which already carries the role. |
| PR2 | 🟡 | Accessibility | Language selector: each option has both `accessibilityState={{ selected }}` and `accessibilityState={{ checked }}`. Only `checked` is semantically correct for a radio-like element. `selected` is a valid state but may be read aloud twice. | Remove the `selected` key, keep `checked`. |
| PR3 | 🟢 | Copy | The SRS stats chip labels ("Due today", "Total") are visual only. If a chip is focused, the accessible label is the count number alone. | Wrap each chip in a `View` with `accessibilityLabel={"Due today: " + dueCount}` and `accessible={true}`, marking the inner text `accessible={false}`. |

---

### Self-study — `(self-study)/index.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| SX1 | 🔴 | Motion | Create-deck `Modal` hardcodes `animationType="fade"` (line 218) without checking `useReducedMotion`. | Compute `const animationType = reduceMotion ? 'none' : 'fade';` using the `useReducedMotion` hook and pass it to `Modal`. |
| SX2 | 🟠 | Accessibility | Decorative book emoji in the empty state (line 163) is inside a raw `Text` with no `accessible={false}`. Screen readers announce the emoji name aloud. | Add `accessible={false}` to that `Text`. |
| SX3 | 🟡 | Accessibility | "Cancel" `Button` inside the create-deck modal (line 272) has no `accessibilityLabel`. It is close to the "Save" button and a blind user cannot distinguish them by label alone. | Add `accessibilityLabel="Cancel, close dialog"`. |
| SX4 | 🟡 | Accessibility | The save `Button` in the create-deck modal sets `accessibilityState={{ disabled }}` but not `{ busy: saving }`. | Add `busy: saving` to the `accessibilityState`. |

---

### Self-study — `(self-study)/deck.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| DK1 | 🔴 | Motion | Card-editor `Modal` hardcodes `animationType="fade"` without checking `useReducedMotion`. | Same fix as SX1. |
| DK2 | 🟠 | Accessibility | Stats row chips (lines 258–272) are plain `Box` containers with visible text counts ("5 cards", "2 due") but no `accessibilityLabel`. Screen readers skip them or read raw numbers without context. | Wrap each chip in an `accessible` container: `accessibilityLabel={"5 cards"}` / `accessibilityLabel={"2 due today"}`. |
| DK3 | 🟡 | Copy / Interaction | The modal's cancel button label changes asymmetrically: "Cancel" when editing an existing card, "Done" when adding a new card. This violates the principle of least surprise — "Done" implies finishing, "Cancel" implies abandoning, but the actions are symmetric (close the editor). | Use "Close" in both cases, or "Done" in both cases consistently. |

---

### Self-study — `(self-study)/review.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| RV1 | 🟠 | Accessibility | "Show Answer" `Pressable` has `accessibilityRole="button"` and `accessibilityState={{ expanded: revealed }}` but no `accessibilityLabel`. The button text is visible but not wired as a label. | Add `accessibilityLabel="Show answer"`. |
| RV2 | 🟡 | Copy / Empty state | The "All caught up!" next-due date (line 213) displays the raw ISO-8601 date string (e.g., `2025-04-28`) rather than a human-readable format. | Format with: `new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(deckInfo.nextDue))`. |

---

### Teacher — `(teacher)/index.tsx` (Activate)

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| TI1 | 🔴 | Accessibility | The activation status line (lines 157–162) uses `successText` color when a session is active and `textSecondary` otherwise. This is color-only feedback. A color-blind teacher cannot distinguish "session live" from "no session". | Add a leading icon alongside the text: `checkmark-circle-outline` in green when active, `radio-button-off` when idle. The icon provides a non-color cue. |
| TI2 | 🟠 | Accessibility | The `AlertDialog` confirm button (lines 218–222) has no `accessibilityState={{ busy }}` while the activation request is in flight. | Add `disabled={busy}` and `accessibilityState={{ busy, disabled: busy }}` to the confirm button. |
| TI3 | 🟠 | Visual consistency | Lines 155, 156, 159 use native `Text` with inline `fontFamily` (line 154: `fontFamily: Fonts.rounded`) rather than the `Type` or `Heading` system. | Replace with `<UIText style={Type.heading}>` or `<Heading>`. |
| TI4 | 🟡 | Accessibility | The `HomeSkeleton` component that renders while loading has no outer wrapper with `accessibilityRole="progressbar"` and `accessibilityLabel`. | Add the wrapper with those props, matching the pattern used in `ProfileSkeleton`. |

---

### Teacher — `(teacher)/questions/index.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| QI1 | 🟠 | Accessibility | The filter `ChipRow` rows (Type, Difficulty, Language, Status) are labelled with `accessibilityRole="tablist"` on their container. These are mutually-exclusive filter options, not tab panels — `"radiogroup"` is semantically correct. | Change container role to `accessibilityRole="radiogroup"` and each chip to `accessibilityRole="radio"` + `accessibilityState={{ checked: isSelected }}`. |
| QI2 | 🟠 | Visual consistency | The header "New question" action (line 200) uses a custom `Pressable` with hand-crafted padding and border styling instead of the shared `Button` component. | Replace with `<Button variant="outline" size="sm" onPress={...}>`. |
| QI3 | 🟡 | Accessibility | The active-filters badge (`nFilters`) on the Filters toggle button updates when filters change but has no `accessibilityLiveRegion`. Blind teachers activating filters cannot hear the new count without re-focusing the button. | Add `accessibilityLiveRegion="polite"` to the badge `UIText`. |

---

### Teacher — `(teacher)/questions/edit.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| QE1 | 🔴 | Accessibility | The `Σ` symbol-toolbar toggle button (line 676) has no `accessibilityLabel`. Screen readers announce the literal Greek letter "Sigma", which is meaningless out of context. | Add `accessibilityLabel="Toggle math symbols toolbar"`. |
| QE2 | 🟠 | Visual consistency | The save dock "Save" and "Save & add another" buttons (lines 688–710) are custom `Pressable` components, not the shared `Button` component. This bypasses the design system's min-height, font, and state handling. | Replace with `<Button>` and `<Button variant="outline">` respectively. |
| QE3 | 🟡 | Accessibility | The save buttons have no `accessibilityHint`. Teachers using screen readers do not know that "Save & add another" will keep the editor open. | Add `accessibilityHint="Saves and opens a blank form for another question"` to the second button. |

---

### Teacher — `(teacher)/catalog.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| CA1 | 🟡 | Accessibility | Chapter and topic heading text (each section header `UIText`) does not carry `accessibilityRole="header"`. Screen readers cannot use heading navigation to jump between chapters. | Add `accessibilityRole="header"` to chapter name `UIText` elements. |
| CA2 | 🟡 | Empty state | The empty-chapters state shows descriptive copy but no illustration or icon to anchor the call to action visually. | Add a `library-outline` Ionicon (same as the teacher home empty state pattern) above the copy. |
| CA3 | 🟢 | Copy | "Organise what students revise by subject, chapter and topic" (line 131) is long. Consider trimming to "Organise the question bank by chapter and topic". | Shorten the description string. |

---

### Teacher — `(teacher)/import.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| IM1 | 🟡 | Empty state | After a successful import, the success state is displayed but there is no "Import another file" CTA. Teachers who want to batch-import must manually navigate away and return. | Add a secondary `Button` labeled "Import another file" that resets the import state. |
| IM2 | 🟢 | Accessibility | The multiline paste `InputField` has no `accessibilityHint`. | Add `accessibilityHint="Paste one question per line in the expected format"`. |

---

### Teacher — `(teacher)/calendar.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| CL1 | 🟠 | Accessibility | The calendar `Heading` at line 394 uses the `Type.heading` style but does NOT set `accessibilityRole="header"`. Screen readers cannot identify it as a section heading. | Add `accessibilityRole="header"` to the `Heading` component, or replace with the `Heading` component which handles this. |
| CL2 | 🟡 | Accessibility | Plan-mode description text (shown when entering plan mode) does not use `accessibilityLiveRegion`. The change in context is silent for screen readers. | Wrap the description in a `View accessibilityLiveRegion="polite"`. |
| CL3 | 🟡 | Accessibility | Legend dots (lines 437–441) are `View` elements with `backgroundColor` only. Each `LegendItem` has a sibling `Text` label, so the dot itself is purely decorative — it does not need a label. However the `View` dot is `accessible` by default; it should be excluded. | Add `accessible={false}` (or `importantForAccessibility="no"`) to the colored dot `View`. |
| CL4 | 🟢 | Interaction | The `Check` component in "mixed" state uses `Ionicons name="remove"` icon. Screen readers announce "remove" rather than "mixed". | Add `accessibilityLabel="Partial"` or `accessibilityState={{ checked: 'mixed' }}` using the boolean-or-string API. |

---

### Teacher — `(teacher)/reports.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| RP1 | 🔴 | Accessibility | `AnimatedBar` (lines 41–55) renders a percentage bar with no accessible description. The enclosing section row has no `accessibilityLabel` either. A blind teacher cannot hear accuracy values. | Add `accessibilityLabel={\`\${section.name}: \${pct}% accuracy\`}` to the row container; mark the bar `View` as `accessible={false}`. |
| RP2 | 🟠 | Visual consistency | `statValue` and `accuracyChipText` styles in the file's `StyleSheet` use `fontWeight: '800'` — a raw value not present in the `Type` token system. | Replace with `Type.headingBold` (or the closest `Type` variant). |
| RP3 | 🟡 | Accessibility | The time-range filter chips (Today / 7d / 30d) sit inside a container that should be `accessibilityRole="radiogroup"` with each chip carrying `accessibilityRole="radio"` and `accessibilityState={{ checked }}`. Currently the semantics are unclear. | Apply the same fix as QI1. |
| RP4 | 🟡 | Empty state | When no data exists for the selected range, only the footer shows "No answers in this range yet". The per-section `FlatList` renders empty with no inline message. | Pass a `ListEmptyComponent` to the FlatList with a short explanatory string. |

---

### Teacher — `(teacher)/participation.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| PA1 | 🟠 | Accessibility | The page `Heading` at line 78–80 has no `accessibilityRole="header"`. | Add `accessibilityRole="header"`. |
| PA2 | 🟠 | Accessibility | Each student row in the `FlatList` renders the student name, status chip, and revised-count separately. There is no combined `accessibilityLabel` on the row. Blind teachers cannot hear "Arjun Singh — done — 10/10 revised" in one announcement. | Add a single `accessibilityLabel` on the row `Pressable`: `\`\${student.name}, \${status}, \${revised} of \${total} revised\``. Mark child views `accessible={false}`. |
| PA3 | 🟡 | Accessibility | Status chip icon (checkmark / play / time) conveys state non-color, which is good. The chip text ("done" / "in progress" / "pending") is also visible. No additional change needed beyond PA2. | No action beyond PA2. |

---

### Teacher — `(teacher)/students.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| SS1 | 🟠 | Accessibility | Class filter chips use `accessibilityRole="button"` + `accessibilityState={{ selected }}`. Since they function as mutually-exclusive radio buttons ("All", "Class A", "Class B"), the correct role is `"radio"` inside a `"radiogroup"` container. | Add `accessibilityRole="radiogroup"` to the filter row container and `accessibilityRole="radio"` + `accessibilityState={{ checked: isSelected }}` to each chip. |
| SS2 | 🟡 | Accessibility | Empty-state icons (Ionicons in the no-students and no-class states) are decorative but `accessible` by default. | Add `accessible={false}` to those icon wrappers. |

---

### Layouts — `(teacher)/_layout.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| TL1 | 🔴 | Accessibility | The route-guard loading `ActivityIndicator` at line 33 has no `accessibilityLabel`. | Add `accessibilityLabel="Loading, please wait"` to the surrounding `View`. |
| TL2 | 🟡 | Visual consistency | The tab label `fontSize: 11` (line 45) is already at the minimum comfortable readable size. With iOS Dynamic Type active this does not scale up. Five tabs with long labels ("Performance", "Questions") on a 360px device can cause label truncation. | Consider abbreviating the "Performance" tab label to "Reports" (5 fewer characters). Keep `tabBarAccessibilityLabel` as "Performance" for screen readers. |

---

### Layouts — `(student)/_layout.tsx`

| # | Priority | Category | Description | Concrete fix |
|---|----------|----------|-------------|-------------|
| SL1 | 🔴 | Accessibility | Route-guard loading `ActivityIndicator` has no `accessibilityLabel`. | Add `accessibilityLabel="Loading, please wait"`. |

---

## Cross-cutting improvements

### 1. Reduced motion in modals

Three separate modals in self-study and auth pass hardcoded `animationType` values without consulting `useReducedMotion`. The `confirm-sheet.tsx` component already implements the correct pattern. The others should follow it:

```tsx
import { useReducedMotion } from 'expo-symbols'; // or own hook

const reduceMotion = useReducedMotion();
const animationType = reduceMotion ? 'none' : 'fade';

<Modal animationType={animationType} ...>
```

Files affected: `(self-study)/index.tsx`, `(self-study)/deck.tsx`.

---

### 2. ActivityIndicator without accessibilityLabel

Every bare `ActivityIndicator` in the app should have an `accessibilityLabel` and a wrapper with `accessibilityRole="progressbar"`. Known missing instances:

| File | Line | Suggested label |
|------|------|-----------------|
| `(teacher)/_layout.tsx` | 33 | "Loading, please wait" |
| `(student)/_layout.tsx` | loading branch | "Loading, please wait" |
| `(student)/index.tsx` | ~347 | "Loading today's questions" |
| `change-password.tsx` | ~41 | "Verifying reset link" |

---

### 3. Interactive element `accessibilityLabel` audit

Multiple `Pressable` elements rely on child `Text` content as their accessible label, which works when the `Text` is a direct child. However, when there are nested `View` > `Text` structures or when the button contains icons, the label may not be read. The safe approach is to always set an explicit `accessibilityLabel` on every `Pressable`, `TouchableOpacity`, and `Button`.

The following are confirmed missing:
- L3: Login "Create account" link
- QE1: Edit screen symbol toolbar button
- ST2: Student feed "Review my decks" escape hatches
- RV1: Self-study "Show Answer" button

---

### 4. Semantic roles for filter chip groups

The pattern of using `accessibilityRole="tablist"` for mutually-exclusive filter chips appears in at least three teacher screens (questions/index, reports, students). The correct semantics are:

- Container: `accessibilityRole="radiogroup"` + `accessibilityLabel="Filter by <dimension>"`
- Each chip: `accessibilityRole="radio"` + `accessibilityState={{ checked: isSelected }}`

This should be extracted into a `FilterChipGroup` component to enforce the pattern everywhere.

---

### 5. Typography token discipline

Four screens (`(teacher)/index.tsx`, `reports.tsx`, `participation.tsx`, summary.tsx) use inline `fontWeight`, `fontSize`, or `fontFamily` values that are not drawn from the `Type` or `Fonts` tokens in `theme.ts`. Every `fontWeight: '700'` / `'800'` and every `fontSize` below 14 or above 28 should be replaced by a `Type.*` variant. This prevents future drift when the design system changes.

---

### 6. Color-only feedback

Two places use color alone to signal state without any accompanying icon, pattern, or text change:

1. `(teacher)/index.tsx` — activation status line (TI1): add an icon.
2. `(teacher)/reports.tsx` — accuracy bar chart (RP1): add an accessible text description.

The existing `question-card.tsx` MCQ feedback is already correct (uses ✅/❌ emoji + text in addition to color).

---

## Component gaps

| Gap | Description | Suggested solution |
|-----|-------------|-------------------|
| No `LoadingScreen` or `LoadingOverlay` component | Each screen implements its own `ActivityIndicator` block with varying accessibility support. | Create `mobile/src/components/ui/loading-screen.tsx` with `accessibilityRole="progressbar"`, `accessibilityLabel` prop, and a centered `ActivityIndicator`. |
| No `FilterChipGroup` component | Filter chip rows are duplicated across questions, reports, and students screens with inconsistent ARIA roles. | Extract into a typed `FilterChipGroup<T>` component that enforces `radiogroup` + `radio` roles. |
| No `SectionHeader` component | `UIText` with `accessibilityRole="header"` is repeated manually in profile, catalog, and reports. | Create `mobile/src/components/ui/section-header.tsx` using the `Heading` component, `size="sm"`, and `accessibilityRole="header"` baked in. |
| No `DateDisplay` component | Dates appear in three formats across screens: ISO string, `toLocaleDateString()`, and `Intl.DateTimeFormat`. | Create a `DateDisplay` component with a `format: 'short' | 'long' | 'relative'` prop to centralise formatting. |
| No `AnimatedBar` accessible wrapper | `AnimatedBar` in reports is purely visual with no screen reader description. | Add an `accessibilityLabel` prop to `AnimatedBar` and pass the percentage string from the parent. |

---

## Summary

| Priority | Count |
|----------|-------|
| 🔴 Blocker | 10 |
| 🟠 High | 16 |
| 🟡 Medium | 21 |
| 🟢 Nice-to-have | 5 |
| **Total** | **52** |

---

## Top 3 highest-impact improvements

**1. Audit and add `accessibilityLabel` to all `ActivityIndicator` loaders (CP1, ST1, TL1, SL1)**  
These are the first thing a screen reader user encounters on any loading screen. Currently they receive no announcement at all — the experience is silent. Fixing all four in one pass is a 30-minute mechanical change with outsized accessibility impact.

**2. Fix teacher activation status to be non-color-only (TI1)**  
The teacher home screen is the highest-traffic teacher screen (opened every morning). The activation status line communicates whether a live session is running using color alone — a change that color-blind teachers cannot perceive. Adding a single `Ionicons` icon alongside the status text eliminates the WCAG SC 1.4.1 failure entirely.

**3. Gate login floating animation on `useReducedMotion` (L1)**  
The login screen's DECOR icons loop indefinitely regardless of the system accessibility setting. Vestibular disorder is the most common reason users enable reduced motion. The login screen is shown to every user on every session. This is a one-line guard (`if (reduceMotion) return;` before `Animated.loop(...).start()`) that removes a known trigger for nausea and disorientation.
