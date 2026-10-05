# End-to-end suites (web build, real API, real Postgres)

Headless Chrome drives the web app against the **real API and a real Postgres**. Only Supabase Auth is replaced by a
tiny local stand-in (`mock-gotrue.mjs`), so password-reset and forced-change flows can run without touching real accounts.
Nothing here ever contacts your Supabase project.

| Suite | Covers |
|---|---|
| `student.mjs` | forgot-password screen, first-run tour, answer lock, grading, profile (tour, name edit, language filter, password change), per-account decks |
| `teacher-a.mjs` | tabs, draft + Kannada questions, student visibility, edit, history/restore, archive, delete rules, in-use lock |
| `teacher-b.mjs` | chapters/topics, bulk import (dry run + commit), export, calendar, plan ahead |
| `teacher-c.mjs` | student roster, teacher-set password, forced change at next sign-in, invite-code signup, teacher profile |

## Run

Needs Chrome at `/usr/bin/google-chrome`, `podman` (or edit the `dbq` helper for `docker`), Node 22.

```bash
cd e2e && npm install
# 1. Postgres with the schema, the question bank and demo profiles
# (the whole setup below is automated by:  e2e/stack.sh start)
podman run -d --name stem-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=stem_e2e -p 55432:5432 postgres:16-alpine
podman exec -i stem-pg psql -U postgres -d stem_e2e -q < ../api/test/schema.sql
DATABASE_URL=postgresql://postgres:test@localhost:55432/stem_e2e npm run seed -w scripts   # from the repo root
podman exec stem-pg psql -U postgres -d stem_e2e -q -c "insert into profiles (id, full_name, role, class_section) values
 ('b2c48512-5bc1-4a33-a1cc-9c56c09fd8b9','Mrs. Kavya','teacher',null),
 ('2881f8ca-3197-4a65-be6b-8bf1cdd953d0','Ananya','student','10A'),
 ('3a1f0c11-0000-4000-8000-000000000002','Bhavya','student','10A'),
 ('3a1f0c11-0000-4000-8000-000000000003','Chetan','student','10B')"
# activate today's topics (so students have a feed)
podman exec stem-pg psql -U postgres -d stem_e2e -q -c "insert into daily_sets (set_date, activated_by) values ((now() at time zone 'Asia/Kolkata')::date,'b2c48512-5bc1-4a33-a1cc-9c56c09fd8b9')" \
  -c "insert into daily_set_sections select ds.id, s.id from daily_sets ds, sections s where ds.set_date=(now() at time zone 'Asia/Kolkata')::date"
# 2. Auth stand-in, API and web app (each in its own terminal)
node mock-gotrue.mjs
(cd ../api && SUPABASE_URL=http://localhost:9999 SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_KEY=service DATABASE_URL=postgresql://postgres:test@localhost:55432/stem_e2e PORT=3100 APP_TIMEZONE=Asia/Kolkata TEACHER_INVITE_CODE=e2e-invite-code npx tsx src/index.ts | tee ../e2e/api.log)
(cd ../mobile && EXPO_PUBLIC_SUPABASE_URL=http://localhost:9999 EXPO_PUBLIC_SUPABASE_ANON_KEY=anon EXPO_PUBLIC_API_URL=http://localhost:3100 npx expo start --web --port 8301)
# 3. Suites (run in this order; each prints PASS/FAIL lines and exits non-zero on failure)
node student.mjs && node teacher-a.mjs && node teacher-b.mjs && node teacher-c.mjs
```

Between full runs restart `mock-gotrue.mjs` (it resets passwords) and clear test rows
(`truncate submissions, streaks, review_states, password_resets; delete from questions where created_by is not null`).
`teacher-c.mjs` checks that a temporary password never reaches the API log: run the API with its output teed to `e2e/api.log`
(or set `API_LOG` to its path; `stack.sh` writes it to `/tmp/stem-e2e/api.log`, which is the default).
