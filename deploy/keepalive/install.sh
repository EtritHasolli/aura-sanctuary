#!/usr/bin/env bash
# Installs the Aura Supabase keepalive on the server. Run as root, from the folder
# this file is in. Safe to re-run: it never overwrites an existing env file.
#
#   bash install.sh

set -euo pipefail
cd "$(dirname "$0")"

# Files copied from a Windows checkout can carry CRLF, which bash rejects.
sed 's/\r$//' aura-keepalive.sh > /usr/local/bin/aura-keepalive
chmod 755 /usr/local/bin/aura-keepalive

if [ ! -f /etc/aura-keepalive.env ]; then
  cat > /etc/aura-keepalive.env <<'EOF'
# Same values as VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in the laptop .env.
# The anon key is public (it ships in the web bundle). Never put the service-role key here.
SUPABASE_URL=
SUPABASE_ANON_KEY=
EOF
  chmod 600 /etc/aura-keepalive.env
  echo "Created /etc/aura-keepalive.env — fill it in:  nano /etc/aura-keepalive.env"
fi

# Every 6 hours, at a minute that is not :00 so it does not collide with other jobs.
cat > /etc/cron.d/aura-keepalive <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 */6 * * * root /usr/local/bin/aura-keepalive
EOF
chmod 644 /etc/cron.d/aura-keepalive

echo "Installed. Test it now:  aura-keepalive && tail -n 3 /var/log/aura-keepalive.log"
