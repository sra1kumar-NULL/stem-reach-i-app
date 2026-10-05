#!/usr/bin/env bash
# One-command local test stack: Postgres (podman) + mock Supabase Auth + real API + web app.
#   e2e/stack.sh start    # build everything and start it (about 1-2 minutes)
#   e2e/stack.sh reset    # clear test data + restart the auth stand-in (use between full e2e runs)
#   e2e/stack.sh api|web  # restart just the API or the web app
#   e2e/stack.sh stop     # stop all servers and remove the database container
#   e2e/stack.sh status
# Web app: http://localhost:8301   API: http://localhost:3100   Logins: teacher@stemri.local, s1@/s2@/s3@stemri.local  /  Stemri@2026
# Nothing here contacts a real Supabase project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${E2E_RUN_DIR:-/tmp/stem-e2e}"
DB_URL="postgresql://postgres:test@localhost:55432/stem_e2e"
mkdir -p "$RUN_DIR"

psql_() { podman exec -i stem-pg psql -U postgres -d stem_e2e -q "$@"; }
port_pids() { ss -ltnp 2>/dev/null | grep ":$1 " | grep -o 'pid=[0-9]*' | cut -d= -f2 || true; }
kill_port() { for pid in $(port_pids "$1"); do kill "$pid" 2>/dev/null || true; done; }
wait_http() { for _ in $(seq 1 90); do curl -s -o /dev/null -m 2 "$1" && return 0; sleep 2; done; echo "timeout waiting for $1" >&2; return 1; }

start_mock() {
  kill_port 9999; sleep 1
  setsid nohup node "$ROOT/e2e/mock-gotrue.mjs" > "$RUN_DIR/mock.log" 2>&1 < /dev/null & disown
  sleep 2
}
start_api() {
  kill_port 3100; sleep 1
  ( cd "$ROOT/api" && SUPABASE_URL=http://localhost:9999 SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_KEY=service \
      DATABASE_URL="$DB_URL" PORT=3100 APP_TIMEZONE=Asia/Kolkata TEACHER_INVITE_CODE=e2e-invite-code \
      setsid nohup npx tsx src/index.ts > "$RUN_DIR/api.log" 2>&1 < /dev/null & disown )
  wait_http http://localhost:3100/api/healthz
}
start_web() {
  kill_port 8301; sleep 1
  ( cd "$ROOT/mobile" && EXPO_PUBLIC_SUPABASE_URL=http://localhost:9999 EXPO_PUBLIC_SUPABASE_ANON_KEY=anon \
      EXPO_PUBLIC_API_URL=http://localhost:3100 setsid nohup npx expo start --web --port 8301 > "$RUN_DIR/web.log" 2>&1 < /dev/null & disown )
  wait_http http://localhost:8301
}
seed_db() {
  psql_ -v ON_ERROR_STOP=1 < "$ROOT/api/test/schema.sql"
  ( cd "$ROOT" && DATABASE_URL="$DB_URL" npm run seed -w scripts > "$RUN_DIR/seed.log" 2>&1 )
  psql_ -c "insert into profiles (id, full_name, role, class_section) values
    ('b2c48512-5bc1-4a33-a1cc-9c56c09fd8b9','Mrs. Kavya','teacher',null),
    ('2881f8ca-3197-4a65-be6b-8bf1cdd953d0','Ananya','student','10A'),
    ('3a1f0c11-0000-4000-8000-000000000002','Bhavya','student','10A'),
    ('3a1f0c11-0000-4000-8000-000000000003','Chetan','student','10B')" \
    -c "insert into daily_sets (set_date, activated_by) values ((now() at time zone 'Asia/Kolkata')::date,'b2c48512-5bc1-4a33-a1cc-9c56c09fd8b9') on conflict do nothing" \
    -c "insert into daily_set_sections select ds.id, s.id from daily_sets ds, sections s where ds.set_date=(now() at time zone 'Asia/Kolkata')::date on conflict do nothing"
}

case "${1:-}" in
  start)
    podman rm -f stem-pg >/dev/null 2>&1 || true
    podman run -d --name stem-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=stem_e2e -p 55432:5432 docker.io/library/postgres:16-alpine >/dev/null
    for _ in $(seq 1 40); do podman exec stem-pg pg_isready -U postgres -d stem_e2e >/dev/null 2>&1 && break; sleep 1; done
    seed_db; start_mock; start_api; start_web
    echo "stack ready: web http://localhost:8301 | api http://localhost:3100 | logs in $RUN_DIR"
    ;;
  reset)
    psql_ -c "truncate submissions, streaks, review_states, password_resets" \
      -c "delete from question_revisions" -c "delete from questions where created_by is not null" \
      -c "delete from chapters where ncert_no > 12" \
      -c "update profiles set question_language='en' where role='student'" \
      -c "update profiles set full_name='Ananya' where id='2881f8ca-3197-4a65-be6b-8bf1cdd953d0'" \
      -c "update profiles set full_name='Mrs. Kavya' where id='b2c48512-5bc1-4a33-a1cc-9c56c09fd8b9'" \
      -c "delete from profiles where full_name='New Teacher'"
    start_mock; start_api; echo "test data cleared, auth stand-in and API restarted (in-memory rate limits cleared)"
    ;;
  stop)
    for p in 8301 3100 9999; do kill_port "$p"; done
    podman rm -f stem-pg >/dev/null 2>&1 || true
    echo "stack stopped"
    ;;
  api) start_api; echo "API restarted" ;;
  web) start_web; echo "web app restarted" ;;
  status)
    for p in 8301 3100 9999 55432; do printf 'port %s: %s\n' "$p" "$([ -n "$(port_pids "$p")" ] && echo up || echo down)"; done
    ;;
  *) echo "usage: e2e/stack.sh start|reset|api|web|stop|status" >&2; exit 2 ;;
esac
