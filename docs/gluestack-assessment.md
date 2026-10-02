# UI Stack Assessment — gluestack-ui v5 + uniwind (PR #1)

**Verdict: SUFFICES. Keep and extend — zero new dependencies required.**

Read-only assessment. Everything below was verified against the repo (no builds run, no files
edited other than this report).

---

## 1. What actually exists (verified)

### Dependencies (`mobile/package.json`)

| Dep | Present | Used by app code? | Role |
|---|---|---|---|
| `@gluestack-ui/core@^5.0.15` | ✅ (installed 5.0.15) | ✅ via vendored components | Headless creators, **react-aria powered** (`@react-aria/{checkbox,focus,interactions,label,menu,overlays,radio,selection,slider,switch,utils,visually-hidden}` + `@react-stately/*` are hard deps of core) |
| `@gluestack-ui/utils` | ✅ | ✅ | `tva` / `withStyleContext` styling primitives |
| `uniwind@^1.11` | ✅ | ✅ | Tailwind-v4 RN styling (`className`), web + native, `Uniwind.setTheme` for dark mode; wired in `metro.config.js` (`cssEntryFile: ./src/global.css`, `extraThemes: ['dark']`) |
| `react-aria`, `react-stately`, `tailwind-variants` | ✅ direct deps | ❌ **no direct imports in `mobile/src`** | Only reachable today as transitive deps of gluestack core |
| `@expo/html-elements` | ✅ | ✅ (only `ui/heading`) | semantic `h1..h6` on web |
| `@expo/ui` | ✅ | ❌ **unused** | native SwiftUI/Compose-first components |
| `@legendapp/motion` | ✅ | ❌ **unused** | — |
| `expo-haptics` | ✅ | ✅ (`components/haptics.ts`) | — |
| `react-native-svg` | ✅ | ✅ (`ui/badge`) | also available for progress rings |
| `react-native-gesture-handler@~2.32`, `reanimated@4.5.1` | ✅ | ✅ | gestures/animation (relevant for drag UI) |

Note: `@legendapp/form-motion` is **not** in the dependency list; `@legendapp/motion` is.

### Vendored components (`mobile/src/components/ui/`) — source copies, not re-exports

All are full local implementations, shadcn-style: interactive ones call the headless
`createX` factory from `@gluestack-ui/core/*/creator` + local `tva` styles; layout/typography
ones are pure style wrappers over RN primitives.

- **Creator-based (8):** alert, alert-dialog, avatar, button, form-control, image, input, progress
- **Pure-style (11):** badge, box, card, center, gluestack-ui-provider, heading, hstack, skeleton,
  spinner, text, vstack
- **Provider:** `gluestack-ui-provider` (`.tsx` + `.index.web.tsx`) mounts gluestack
  `OverlayProvider` + `ToastProvider` and drives theme via `Uniwind.setTheme('light'|'dark')`
  from `useColorScheme()` in `app/_layout.tsx`. Nord tokens in `src/global.css`
  (`@variant light/dark` → `--primary`, `--card`, … → `bg-card`, `text-muted-foreground`,
  plus Aurora accents `bg-warn-soft` etc.).

**Creators installed in `@gluestack-ui/core@5.0.15` but NOT yet vendored:**
accordion, actionsheet, bottomsheet, calendar, chat-ai, checkbox, date-time-picker, fab, link,
menu, modal, popover, pressable, radio, select, slider, switch, tabs, textarea, toast, tooltip.

**Not in the installed package at all:** Table (upstream alpha), Divider, Grid, Drawer.

### What screens actually use

- **UI kit in use:** box, button, heading, input, text, avatar, alert-dialog (teacher confirm),
  provider. Vendored-but-unused: alert, badge, card, center, form-control, hstack, image,
  progress, skeleton, spinner, vstack.
- **Raw RN islands still present** (`Pressable` + `StyleSheet`):
  - `signup.tsx` — student/teacher role picker = hand-rolled segmented control (no radio
    semantics, no `accessibilityState`, no keyboard focus on web).
  - `(teacher)/index.tsx` — activation chapter/section rows = hand-rolled **tri-state checkbox**
    (dots + `✓` text; no `role="checkbox"`, no indeterminate state, unreachable by keyboard on web).
  - `question-card.tsx` — MCQ options = hand-rolled radio group (no `role="radio"` /
    `aria-checked`); meta row uses raw `View` + `StyleSheet`.
  - `toast.tsx` — custom toast (works on both platforms; no `aria-live` on web).
  - `(student)/index.tsx`, `(teacher)/reports.tsx`, `summary.tsx`, `login.tsx`,
    `error-boundary.tsx` — sign-out pills, chips, back buttons as raw `Pressable`.
- **Dual styling systems:** uniwind Tailwind classes *and* `useTheme()` + `Colors`/`Accents`
  `StyleSheet`s coexist. `Accents` is static (same hex in light/dark), so StyleSheet-based
  borders/surfaces don't adapt with the theme the way `--border`/`--card` do.

---

## 2. Gap table — needed by feature vs present

| Feature (current 🔵 / roadmap 🟢) | Component needed | Status |
|---|---|---|
| 🔵 Signup role picker (student/teacher) | Segmented control / Radio / Tabs | ❌ raw `Pressable` today; ✅ `tabs` + `radio` creators in installed core (unvendored) |
| 🔵 Teacher activation tri-state rows | Checkbox (indeterminate) | ❌ raw `Pressable` today; ✅ `checkbox` creator in core (unvendored), react-aria `isIndeterminate` |
| 🔵 MCQ answer options a11y | Radio group semantics | ❌ raw `Pressable` today; ✅ `radio` creator in core (unvendored) |
| 🔵 Form labels/errors (login, signup, activation) | FormControl + Label wiring | ⚠️ `form-control` vendored but **unused** — inputs currently have no programmatic label |
| 🔵 Confirmations (teacher delete/stop) | AlertDialog | ✅ vendored + used |
| 🔵 Toast feedback | Toast | ⚠️ custom `toast.tsx` works both platforms (missing `aria-live` on web); gluestack `toast` creator available if queueing/overlays wanted |
| 🔵 Loading/empty/error states | Spinner, Skeleton, Alert, Button | ✅ all vendored (Skeleton/Alert unused so far) |
| 🟢 Mode picker on feed (Quizlet-style) | Tabs / segmented | ✅ core `tabs` (unvendored) — vendor when built |
| 🟢 Confidence 1–5 scale | Radio / Slider | ✅ core `radio`, `slider` (unvendored); Buttons also fine for v1 |
| 🟢 Bottom sheets (roadmap) | BottomSheet / Actionsheet / Modal | ✅ core `bottomsheet`, `actionsheet`, `modal` (all unvendored) — no `@gorhom` needed |
| 🟢 Celebration / level-up modals | AlertDialog + confetti | ✅ AlertDialog vendored; `confetti.tsx` exists |
| 🟢 League ladder screen | Rows + Badge + Avatar + zones | ✅ Badge/Avatar/Box/VStack vendored; countdown = Text + timer |
| 🟢 Streak calendar heatmap | Month grid | ✅ Box/HStack/VStack/Pressable — custom grid; core `calendar` exists (alpha) if a real date-picker is ever needed |
| 🟢 Daily goal ring | Circular progress | ⚠️ Progress is linear — custom `react-native-svg` circle (dep already present) |
| 🟢 Match game drag UI | Pan/drag gestures | ⚠️ not a UI-lib item: `react-native-gesture-handler` + `reanimated` already installed; **recommend tap-to-pair as primary interaction** (works reliably on web + keyboard/AT), drag as native enhancement |
| 🟢 Live-class lobby + countdown | Layout + Progress + Modal | ✅ present (custom composition) |
| 🟢 Profile menus / dropdowns | Menu / Popover | ✅ core `menu`, `popover` (unvendored) |
| 🟢 Tooltips / hints | Tooltip | ✅ core `tooltip` (unvendored) |
| 🟢 Textareas (AI card gen, notes) | Textarea | ✅ core `textarea` (unvendored) |
| 🟢 Teacher reports table | Table | ❌ not in installed core (upstream alpha) → build with Box/HStack grid; lists already use FlatList |
| 🟢 Achievement badges | Badge | ✅ vendored |

Legend: ✅ available with what's installed · ⚠️ custom build from existing deps · ❌ gap.

---

## 3. Gaps ranked

1. **[High] Form-control semantics missing on current screens.** Signup role picker and teacher
   activation are the two concrete forms the app ships today, and both are hand-rolled
   `Pressable` islands: no checked/indeterminate state for screen readers, no keyboard focus or
   Space/Enter activation on web (our primary channel). The components to fix this (`checkbox`,
   `radio`/`tabs`) are **already in `node_modules`** — they just need vendoring.
2. **[High] Unvendored overlay/menu components needed by the roadmap** — `tabs` (mode picker),
   `bottomsheet`/`actionsheet`/`modal` (bottom sheets), `menu`/`popover`/`tooltip`. Not urgent
   today, but each roadmap sprint will need 1–3 more vendor copies. This is the recurring cost
   of the chosen architecture (see §4).
3. **[Medium] Dual styling system drift.** `StyleSheet` + static `Accents` vs uniwind
   `bg-card`/`--border` tokens. Not a missing package — a convention gap: new UI should be
   uniwind-only so dark mode stays correct through one source of truth.
4. **[Medium] FormControl vendored but unused** — inputs lack associated labels; a11y regression
   risk on web even though the widget itself is fine.
5. **[Low] Custom toast lacks `aria-live`** on web; works otherwise. Gluestack toast provider is
   already mounted in the app root, so migration is possible later at no dependency cost.
6. **[Low] Table** (reports/analytics) — no package covers it properly upstream; a Box grid is
   the right answer at our scale anyway.
7. **[Low] Dead dependencies from PR #1** — `@expo/ui`, `@legendapp/motion` have zero imports
   in `mobile/src`. `@expo/ui` pulls native modules into the Android build for nothing.
   `react-aria`/`react-stately` as *direct* deps are also unused (core brings the granular
   `@react-aria/*` it needs); keep them only if we plan to call react-aria hooks directly when
   building custom components — otherwise remove.

**Nothing above requires a new npm package.** Every gap is either (a) vendoring a component
from the already-installed `@gluestack-ui/core`, (b) composing existing primitives, or (c) a
semantics/convention fix in screens.

---

## 4. Recommendation: **keep + extend (augment by vendoring, not by installing)**

**Rationale:**

- **The stack already meets every hard requirement.** gluestack v5 peers are
  `react >=16.8`, `react-native >=0.64`, `react-native-web >=0.19` — satisfied by React 19.2.3 /
  RN 0.86.2 / RNW 0.21. react-aria gives keyboard/AT behavior for free on web (our primary
  deploy target per `docs/DEPLOY.md`) and equivalent semantics on native. Dark mode runs
  through one mechanism (`Uniwind.setTheme` + Nord tokens in `global.css`), which the provider
  already wires to the system color scheme.
- **The gap surface is "20 more components in the same pattern", not "a different pattern".**
  The installed core ships checkbox, radio, select, switch, tabs, menu, popover, tooltip, modal,
  actionsheet, bottomsheet, slider, textarea, fab, accordion, calendar, date-time-picker —
  covering essentially the entire roadmap except Table (build it) and drag (gestures already
  installed). Replacing the stack now would discard working, reviewed code to re-solve problems
  we've already solved.
- **Vendoring = ownership, which is the right trade here.** Copy-paste components are the
  documented gluestack v5 model; we style them with our own Nord/uniwind tokens, upgrades are
  deliberate, and there is no hidden theming layer fighting ours.

**Why not the alternatives (considered, rejected):**

| Alternative | Why rejected |
|---|---|
| React Native Paper | Second theming engine; its color system doesn't map to Nord CSS vars; weaker web story than what we have; would mean replacing working code. |
| Tamagui | New compiler/styling paradigm, real RN/React-19 compat risk, large migration; unjustified complexity for this app size (AGENTS.md: no deps without concrete need). |
| shadcn rn/primitives | Functionally the same "vendored source" model we already have; swapping source-of-truth components for identical ones = pure churn. |
| `@gorhom/bottom-sheet` (for roadmap sheets) | Native-only — **no web**, fails the PWA-parity requirement. Use gluestack `bottomsheet`/`actionsheet`/`modal` instead. |
| `@expo/ui` (already a dep) | Native-first (SwiftUI/Compose); mixing its un-styled-by-uniwind views with the Nord token system breaks visual consistency and it helps nothing on web. It is currently unused — candidate for **removal**, not adoption. |

**Augmentation plan — exact packages: none.** Instead, this vendor backlog (copy from
`mobile/node_modules/@gluestack-ui/core/<name>/creator` + upstream component source into
`mobile/src/components/ui/<name>`, following the existing `button`/`input` pattern with
`tva` + uniwind classes):

| Priority | Vendor | Consumed by |
|---|---|---|
| Now (screens in flight) | `checkbox`, `radio`, `tabs` (+ use existing `form-control`) | teacher activation, signup role picker, MCQ semantics, mode picker |
| Sprint 2 | `modal`/`actionsheet`/`bottomsheet`, `menu`, `tooltip` | bottom sheets, profile menus, hints |
| Sprint 3–4 | `select`, `textarea`, `slider`, `switch` | AI card gen forms, confidence scale, settings toggles |
| On demand | `popover`, `accordion`, `fab`, `calendar` | analytics drill-down, syllabus groups, floating CTA, date picking |

RN/web compat notes for the vendoring work: these creators are the same cross-platform source
we already ship (`.web.tsx` variants only exist where DOM behavior differs — provider,
text/box/hstack layout); overlays rely on gluestack's `OverlayProvider` already mounted in
`_layout.tsx`; `bottomsheet`/`calendar` are marked alpha upstream — validate on web early and
fall back to `modal`-based sheets (still zero new deps) if they underperform.

Housekeeping (cheap, do with the PR review): pin `@gluestack-ui/core` to an exact version so
vendored copies and creator APIs can't drift silently; drop or start using `@expo/ui`,
`@legendapp/motion`, and the direct `react-aria`/`react-stately` deps.

---

## 5. Open questions for the team

1. **Vendoring cadence:** do we vendor on demand (recommended — only pay for what screens use)
   or pre-vendor the whole catalog now? Pre-vendoring maximizes files we own for zero current
   benefit.
2. **Toast:** keep the custom `toast.tsx` (add an `aria-live` region for web), or migrate to
   gluestack's toast creator (provider is already mounted)? One system should own toasts
   before the roadmap adds XP/level-up notifications.
3. **Styling convention:** declare uniwind classes the only allowed way to style new code and
   grandfather the `StyleSheet`/`Accents` islands? (Needed to keep dark mode coherent.)
4. **Match game interaction:** is tap-to-pair acceptable as the primary UX (recommended for web
   + accessibility), with drag as a native-only enhancement via the already-installed RNGH?
5. **Dependency hygiene:** confirm removal of unused `@expo/ui` and `@legendapp/motion`, and
   decide whether direct `react-aria`/`react-stately` stay (for custom components) or go.
6. **Table:** confirm Box-grid over any table library for teacher reports (no maintained
   RN+web table lib justifies its weight at our scale).
7. **Supply-chain posture:** gluestack/react-native-aria had a June 2025 npm compromise
   (affecting the old v0.x line; v5 uses Adobe's react-aria). Pin versions and keep
   `npm audit` in CI — agree on who owns that?
8. **In-app theme toggle:** provider currently follows system scheme only. Is an explicit
   light/dark toggle wanted for the PWA? (`Uniwind.setTheme` already supports it.)
