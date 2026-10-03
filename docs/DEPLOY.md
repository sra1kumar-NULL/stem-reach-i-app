# Deployment Guide — Daily Revision (StemReach)

How to get the app into the hands of students & teachers at any school.
Generic deployment playbook: the app is white-label (no school-specific branding).
Target: students on Android phones → **web (PWA) first, Android APK second**. All free tiers, $0 cost.

## Architecture

```
┌─────────────┐   HTTPS    ┌──────────────────┐   HTTPS    ┌──────────────────┐
│  Students / │ ─────────▶ │  Web app (PWA)   │ ─────────▶ │   API (Hono)     │
│  Teacher    │            │  Vercel/Pages    │            │   Render         │
└─────────────┘            └──────────────────┘            └────────┬─────────┘
        │                                                           │ pooler
        │ (or) install APK via WhatsApp link                        ▼
┌─────────────┐                                          ┌──────────────────┐
│ Android app │  (same API)                              │ Supabase Postgres│
└─────────────┘                                          └──────────────────┘
```

- **Mobile app**: Expo SDK 57, expo-router, Supabase auth (`mobile/`)
- **API**: Hono + Drizzle + Postgres (`api/`), runs with `tsx src/index.ts`, CORS `origin: "*"`, healthcheck at `/api/healthz`
- **DB/auth**: Supabase (bring your own project; create one at supabase.com)

---

## Deploy order — API before app

**Deploy/migrate the API (Phase 1, including the DB schema SQL) FIRST, then release the app build
(PWA/APK, Phases 2–3).** The new app sends flashcard grades `again|good|easy` which the old API
rejects (`SubmissionRequest` only accepts `got_it|need_practice` → HTTP 400, flashcards
ungradeable), and `summary.tsx` reads `me.srs.*` which the old API omits → runtime crash (the
mobile client does no runtime response validation). The reverse order (old app + new API) is safe:
legacy grades are still accepted and extra fields are ignored.

**Migration before API build (teacher question authoring).** Run the `questions.created_by`
migration SQL (see *DB schema updates* below) **before** deploying an API build that writes
`created_by`. If the column is missing, `POST /api/questions` 500s on every insert; all other
endpoints never touch the column and are unaffected in either order. (Schema SQL before API,
API before app — that's the full order.)

---

## Phase 1 — Host the API on Render (do first; nothing works without it)

Prep already in the repo:
- `render.yaml` — Render blueprint: Node service, `rootDir: api`, `npm start`, healthcheck `/api/healthz`
- `api/.env.example` — documented env vars (incl. the pooler-host note)

### Steps
1. Push the repo to GitHub.
2. Go to <https://render.com> → **New → Blueprint** → select your repo.
3. Render creates the service from `render.yaml`. Set these env vars in the service dashboard
   (values come from your local `api/.env` + Supabase dashboard):

   | Variable | Where to find it |
   |---|---|
   | `SUPABASE_URL` | Supabase → Project Settings → API |
   | `SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API (service_role) |
   | `DATABASE_URL` | Supabase → Settings → Database → **Connection pooling** (use the region pooler host, NOT `db.…` — that host fails to resolve from some providers) |
   | `TEACHER_INVITE_CODE` | *Optional.* A long random secret you choose (e.g. `openssl rand -hex 16`) and give only to teachers. Teachers must enter it to self-register; leave unset to disable teacher self-signup. Mark it secret in Render. |
   | `APP_TIMEZONE` | *Optional.* IANA zone that defines the school's "today" (activations, feed, streaks, SRS). Defaults to `Asia/Kolkata`. |

   The API validates its env at startup and exits with the offending variable name if one is
   missing or invalid. Failed teacher invite attempts are rate limited (5 per 15 min per client
   IP → `429`); the limiter is in-memory, so it is per instance and resets on restart.

4. Deploy. Wait for the green "Live" badge.
5. Verify: open `https://<your-service>.onrender.com/api/healthz` → should return `{"ok":true}`.

### Monorepo note
The API depends on `@stemreach/core` (local workspace package, not on npm).
`npm install` inside `api/` works because npm walks up and installs the whole workspace.
If Render ever fails to resolve `@stemreach/core`, switch the build command to `npm ci` at repo root
and use a custom start command `npm run start -w api`.

### Caveat: free tier sleep
Render's free tier sleeps after ~15 min of no traffic. First request after idle takes ~30 s to wake.
Acceptable for school-day usage; upgrade to a paid plan later if it annoys.

### DB schema updates
The schema lives in `core/src/db/schema.ts` (Drizzle). Create tables in the Supabase SQL editor
from the existing schema. For databases created before these objects existed, run:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS daily_sets_set_date_unique ON daily_sets (set_date);

CREATE TABLE IF NOT EXISTS review_states (
  student_id uuid NOT NULL REFERENCES profiles (id),
  question_id uuid NOT NULL REFERENCES questions (id),
  ease integer NOT NULL DEFAULT 250,
  interval_days integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  last_reviewed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_review_states_due ON review_states (due_date);

ALTER TABLE review_states ENABLE ROW LEVEL SECURITY;
-- No policies: deny-by-default via PostgREST. The API writes with the service_role key.

-- Teacher-authored questions (PR #1): provenance column — null = seed row, uuid = author.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles (id);
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
-- No policies: deny-by-default via PostgREST. The API writes with the service_role key.
```

> **RLS audit:** older tables were created by hand — audit every existing table for RLS
> (Supabase dashboard → Database → Tables → "RLS enabled"). Any table without it is reachable
> from the app bundle's anon key, bypassing the API.

### Teacher-created questions & re-seeding
`npm run seed` upserts by (section, exact question text) with DB-generated ids, so rows already
in the DB are updated in place, never re-keyed. Teacher-authored questions match no JSON text,
get logged `… (left in place …)` and survive re-seeds untouched (id and `created_by` preserved).
`npm run verify` reads only `content/*.json` — teacher-created rows don't affect it.

### Caveat: Supabase free-tier auto-pause
Free Supabase projects **pause automatically after ~7 days of no activity**. Symptoms:
the project subdomain stops resolving (login fails with "Failed to fetch", DB pooler says
`tenant ... not found`) even though the API server itself is healthy.
Fix: supabase.com dashboard → open the project → click **Restore** (~1 min, free).
A hosted API (Phase 1) that queries the DB regularly keeps the project awake.

---

## Phase 2 — Ship the app as a website (PWA) — primary channel

The app already exports a working web build. Host it statically; students open a URL on any device.

### Steps
1. Set the API URL for web builds:
   ```bash
   cd mobile
   echo "EXPO_PUBLIC_API_URL=https://<your-api>.onrender.com" >> .env
   ```
   (Keep `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` as-is — copy from `api/.env`.)
   Without this, the app falls back to `http://<expo-host>:3000` / `localhost:3000` (dev only).
2. Build:
   ```bash
   npx expo export --platform web
   ```
   Output goes to `mobile/dist/`.
3. Deploy `mobile/dist/` to **Vercel** (free):
   - Option A (dashboard): vercel.com → New Project → import repo → Root Directory `mobile` → Build command `npx expo export --platform web` → Output directory `dist`
   - Option B (CLI): `npx vercel` inside `mobile/`
4. Share the URL with students.
   - Android: "Add to Home Screen" from the browser menu → behaves like an app.
   - Pin it as a shortcut on the home screen.

### CORS
Already handled: the API sets `Access-Control-Allow-Origin: *` (no cookies, bearer-token auth only).

### Caveat: free Render sleep + web
Every page load after idle waits ~30 s for the API to wake. Consider a paid Render plan
once real classes use it daily, or a keep-alive cron (e.g. UptimeRobot pinging `/api/healthz` every 10 min — free).

---

## Phase 3 — Android APK (for students who want an installed app)

1. Install EAS CLI once: `npm i -g eas-cli` and log in (`eas login`).
2. In `mobile/`:
   ```bash
   eas build -p android --profile preview
   ```
   (First run creates an `eas.json`; the preview profile = unsigned/installable APK.)
3. Download the APK from the EAS build page, upload it somewhere shareable, send the link in the class group.
4. Students install with "allow unknown sources" enabled. Same `EXPO_PUBLIC_API_URL` build-time env as Phase 2 — set it before building.

### Building an APK locally (without EAS)

For local testing on an emulator/device, from `mobile/android` (requires JDK 17 and the Android SDK:

```bash
export JAVA_HOME=~/.sdkman/candidates/java/17.0.13-tem   # your JDK path
export ANDROID_HOME="$HOME/Android/Sdk"
./gradlew :app:createBundleDebugJsAndAssets --rerun-tasks # embed the JS bundle
./gradlew assembleDebug                                   # → app/build/outputs/apk/debug/app-debug.apk
```

**Gotcha:** React Native's Gradle plugin *skips JS bundling for the `debug` variant* (it assumes a
Metro server). A plain `assembleDebug` therefore produces an APK that crashes with
`Unable to load script…`. The fix is one line in the generated `mobile/android/app/build.gradle`
(inside the `react { }` block) — note `android/` is gitignored, so **re-apply it after every
`expo prebuild`**:

```gradle
debuggableVariants = []
```

EAS `preview`/release builds bundle JS by default and are unaffected.

### iOS
Skip for now: TestFlight/App Store requires an Apple Developer account ($99/yr).
Teachers can use the web version instead.

---

## Phase 4 — Real accounts & scale

- **Bulk-create students**: the seed scripts in `scripts/src/` create users in bulk —
  adapt the roster for the school/class and run.
- **Optional: self-signup** with a class code (needs a small API + screen change — future work).
- **Optional: custom domain** for the web app, e.g. `app.<school>.in` (~$10/yr) — then the PWA URL is
  short enough to write on the class board.

---

## Handy references

| What | Where |
|---|---|
| API code | `api/` (Hono, entry `api/src/index.ts`, routes `api/src/routes/`) |
| Mobile code | `mobile/` (Expo, screens under `mobile/src/app/`) |
| Contracts | `core/` (`@stemreach/core`, shared types) |
| DB schema/seed/users | `scripts/` |
| Local dev | terminal 1: `npm run dev:api` (repo root, port 3000) · terminal 2: `npm run dev` (in `mobile/`) |

### White-labeling
The app contains **no school-specific branding** — it is fully generic by design.
Same build works for any school; the only per-deployment difference is the roster of user accounts
created in Supabase.
