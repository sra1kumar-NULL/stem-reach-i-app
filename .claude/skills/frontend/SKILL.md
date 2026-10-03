---
name: frontend
description: Use when working on the mobile/ Expo + React Native app or any UI — React components, screens, the student feed pager, TypeScript in the client, Nord/Fredoka/Nunito styling, and accessibility (labels, roles, touch targets, text scaling, contrast).
---

# Frontend

Applies to `mobile/` — an Expo + React Native + TypeScript app with role-gated student and
teacher experiences.

## React and React Native

- One app, two experiences. Route by role, but keep the role check coming from the verified
  session — never let a client-side flag decide what a user may see as the only protection.
- The student feed is a vertical, snap-scrolling, reels-style pager over MCQs and flip cards. Use
  the existing pager rather than a new list implementation; swipe feel is a feature.
- Derive state, don't mirror it. If a value can be computed from props or a store selector, do not
  hold it in `useState`.
- Every async call needs all four: loading, empty, error, and success. "No revision today yet" is a
  real state, not an error.
- Effects that fetch must handle unmount and out-of-order responses.
- Animate with the existing spring/reanimated approach. Respect `prefers-reduced-motion` where the
  platform exposes it.
- The UI is deliberately bright, rounded, and kid-friendly — Nord palette, Fredoka headings, Nunito
  body. Match it. A new screen that looks like a different product is a defect.
- Keep client-side logic to presentation. Scoring, streak rules, and feed composition are the API's
  job; duplicating them in the app guarantees the two drift apart.

## TypeScript

- `strict` is on. No `any`, no `@ts-ignore` without a comment explaining why, no widening a
  contract type to make a call site compile.
- Model API responses with the types from `core/`. Do not redeclare them in `mobile/`.
- Discriminated unions beat optional booleans: `{ kind: 'loading' } | { kind: 'error'; ... }`
  makes illegal states unrepresentable.
- Keep prop types and component contracts explicit. Prefer composition over a growing config prop.

## Accessibility

This app is used by students in real classrooms, including children with disabilities and users on
older or cheaper devices. Treat accessibility as a requirement, not a polish pass.

- **Labels** — every interactive element has an `accessibilityLabel` that a teacher would read
  aloud, not a raw id or an emoji alone. Decorative images get `accessibilityElementsHidden` or
  `importantForAccessibility="no"`.
- **Roles and traits** — set `accessibilityRole` correctly: `button` for presses, `header` for
  headings, `progressbar` for the progress bar, `adjustable` for swipers.
- **State** — expose selected/disabled/checked through `accessibilityState`, so TalkBack and
  VoiceOver announce "selected, 3 of 5" rather than just the label.
- **Announcements** — live regions for async results: answer feedback, submission success, and
  error toasts must be announced, not only animated.
- **Touch targets** — at least 44×44pt. Check the small chips, the close buttons, and the pager dots.
- **Text scaling** — respect OS font scaling; no fixed heights that clip at larger sizes. Verify the
  layout does not break at the largest accessibility sizes.
- **Contrast** — Nord's palette is good, but check text on `snowStorm` and `polarNight` surfaces
  against WCAG AA (4.5:1 for body text).
- **Focus order** — logical left-to-right, top-to-bottom, and never trapped. Back must go back.
- **Motion and sound** — no flashing, no autoplaying sound, nothing startling for young users.
- **Not colour-only** — correct/incorrect feedback must carry an icon or text, since colour-blind
  students must also see the result.

## Checks before calling it done

- `npm run typecheck` clean.
- Every new state has a testable render path: loading, empty, error, success.
- Reviewed once with the screen reader on, or with the accessibility inspector.
