#!/usr/bin/env bash
# Build a sideloadable release APK of the mobile app locally — no sudo, no EAS login.
#
#   scripts/build-apk.sh                       # public Render API + Supabase (mobile/.env or defaults)
#   API_URL=http://192.168.0.16:3000 scripts/build-apk.sh   # override the baked-in API URL
#   FORCE_PREBUILD=1 scripts/build-apk.sh      # regenerate mobile/android from app.json
#
# Output: dist/daily-revision-<version>.apk (dist/ is gitignored).
#
# Env knobs:
#   JAVA_HOME        JDK 17 to use. If unset, uses ~/.local/jdk17, downloading Eclipse Temurin 17 there.
#   ANDROID_HOME     Android SDK (default ~/Android/Sdk).
#   API_URL          Overrides EXPO_PUBLIC_API_URL (default: mobile/.env, else https://stemreach-api.onrender.com). EXPO_PUBLIC_* values are inlined into the JS
#                    bundle at build time — the APK talks to whatever URL it was built with.
#   FORCE_PREBUILD   1 = always run `expo prebuild --clean`. Otherwise prebuild runs only when
#                    mobile/android is missing or app.json is newer than the generated project.
#
# The release build is signed with the debug keystore that prebuild generates: fine for
# sideloading/pilots, NOT for the Play Store.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile"
JDK_DIR="${JDK_DIR:-$HOME/.local/jdk17}"
JDK_URL="https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ---------- JDK 17 ----------
java_major() { "$1/bin/java" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1; }

if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
  :
elif [[ -x "$JDK_DIR/bin/java" ]]; then
  JAVA_HOME="$JDK_DIR"
else
  [[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] \
    || die "no JDK found; set JAVA_HOME to a JDK 17 (auto-download only supports linux x64)"
  log "Downloading Eclipse Temurin JDK 17 into $JDK_DIR"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  curl -fL --retry 3 -o "$tmp/jdk.tgz" "$JDK_URL"
  mkdir -p "$JDK_DIR"
  tar -xzf "$tmp/jdk.tgz" -C "$JDK_DIR" --strip-components=1
  JAVA_HOME="$JDK_DIR"
fi
major="$(java_major "$JAVA_HOME")"
[[ "$major" -ge 17 ]] || die "JAVA_HOME=$JAVA_HOME is Java $major; need 17+"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

# ---------- Android SDK ----------
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
[[ -d "$ANDROID_HOME/platforms" ]] || die "Android SDK not found at $ANDROID_HOME (set ANDROID_HOME)"

# ---------- EXPO_PUBLIC_* env ----------
# Precedence: API_URL / already-exported EXPO_PUBLIC_* > mobile/.env > defaults below.
# Expo CLI also reads mobile/.env, but never overrides variables already in the environment,
# so whatever we export here is what gets inlined into the bundle.
DEFAULT_API_URL="https://stemreach-api.onrender.com"   # public Render deployment
DEFAULT_SUPABASE_URL="https://cihobqescuhuxtiogivb.supabase.co"
pre_api="${API_URL:-${EXPO_PUBLIC_API_URL:-}}"
pre_sb_url="${EXPO_PUBLIC_SUPABASE_URL:-}"
pre_sb_key="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}"
# Read ONLY the public EXPO_PUBLIC_* lines. The file is never sourced: executing an .env as shell breaks on
# lines like `KEY =value` and would run arbitrary text; other keys (server secrets) must not matter here.
if [[ -f "$MOBILE/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ ^(EXPO_PUBLIC_[A-Z0-9_]+)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
      val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
      export "$key=$val"
    fi
  done < "$MOBILE/.env"
fi
export EXPO_PUBLIC_API_URL="${pre_api:-${EXPO_PUBLIC_API_URL:-$DEFAULT_API_URL}}"
export EXPO_PUBLIC_SUPABASE_URL="${pre_sb_url:-${EXPO_PUBLIC_SUPABASE_URL:-$DEFAULT_SUPABASE_URL}}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="${pre_sb_key:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}}"
if [[ -z "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]]; then   # public anon key; eas.json preview env carries it
  EXPO_PUBLIC_SUPABASE_ANON_KEY="$(node -p "require('$MOBILE/eas.json').build.preview.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''" 2>/dev/null || true)"
fi
for v in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_API_URL; do
  [[ -n "${!v:-}" ]] || die "$v is not set (put it in mobile/.env or the environment)"
done
case "$EXPO_PUBLIC_API_URL" in
  *localhost*|*127.0.0.1*|*10.0.2.2*)
    echo "warning: EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL is not reachable from a phone" >&2 ;;
esac

log "JAVA_HOME=$JAVA_HOME (Java $major)"
log "ANDROID_HOME=$ANDROID_HOME"
log "EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL"
log "EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL"

# ---------- JS deps (mobile/ is not an npm workspace; it has its own lockfile) ----------
cd "$MOBILE"
if ! node -e "const fs=require('fs');for (const d of Object.keys(require('./package.json').dependencies)) if (!fs.existsSync('node_modules/'+d+'/package.json')) process.exit(1)"; then
  log "mobile/node_modules is missing dependencies; running npm install"
  npm install --no-audit --no-fund
fi

# ---------- Prebuild (only when needed) ----------
if [[ "${FORCE_PREBUILD:-0}" == "1" || ! -f android/app/build.gradle || app.json -nt android/app/build.gradle ]]; then
  log "Running expo prebuild --platform android --clean"
  CI=1 npx expo prebuild --platform android --clean --no-install
fi
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# ---------- Gradle ----------
log "gradlew assembleRelease"
# Clear the cached JS bundle so a changed EXPO_PUBLIC_* value is actually re-inlined.
rm -rf android/app/build/generated/assets/react android/app/build/intermediates/assets
(cd android && ./gradlew assembleRelease)

APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || die "build finished but $APK is missing"

VERSION="$(node -p "require('$MOBILE/app.json').expo.version")"
mkdir -p "$ROOT/dist"
OUT="$ROOT/dist/daily-revision-$VERSION.apk"
cp "$APK" "$OUT"
log "APK: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Install: adb install -r \"$OUT\""
