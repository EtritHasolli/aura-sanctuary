#!/usr/bin/env bash
# Keeps the Aura Supabase project from being paused for inactivity.
#
# Free-tier projects pause after ~7 days without database activity. Aura has no
# always-on backend (the web app is static on Netlify, the desktop/mobile apps talk
# to Supabase directly), so nothing touches Postgres while nobody is using it.
# This runs from cron on the Hetzner box and makes one real query through PostgREST.
#
# Config: /etc/aura-keepalive.env  (SUPABASE_URL, SUPABASE_ANON_KEY)
# Log:    /var/log/aura-keepalive.log  (trimmed to the last 500 lines)

set -euo pipefail

ENV_FILE="${AURA_KEEPALIVE_ENV:-/etc/aura-keepalive.env}"
LOG_FILE="${AURA_KEEPALIVE_LOG:-/var/log/aura-keepalive.log}"

# shellcheck source=/dev/null
. "$ENV_FILE"
: "${SUPABASE_URL:?SUPABASE_URL missing in $ENV_FILE}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY missing in $ENV_FILE}"

# A select on a real table, not just /rest/v1/ — the root endpoint can be answered
# from PostgREST's schema cache without reaching Postgres. RLS hides every row from
# the anon role, so this returns [] — the query still executes, which is what counts.
url="${SUPABASE_URL%/}/rest/v1/profiles?select=id&limit=1"

status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 --retry 3 --retry-delay 10 \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$url") || status="unreachable (curl exit $?)"

echo "$(date -u +%FT%TZ) $status" >> "$LOG_FILE"
tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"

[ "$status" = "200" ]
