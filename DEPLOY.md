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
| School branding | mobile login screen reads the school name from env (see below) |
| Local dev | terminal 1: `npm run dev:api` (repo root, port 3000) · terminal 2: `npm run dev` (in `mobile/`) |

### White-labeling the app per school
The login screen shows a school name from the env var `EXPO_PUBLIC_SCHOOL_NAME`
(fallback: a generic subtitle). Set it in `mobile/.env` per deployment:
```bash
echo "EXPO_PUBLIC_SCHOOL_NAME=Your School Name" >> mobile/.env
```
