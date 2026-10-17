#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DB_DIR=.e2e-db
rm -rf "$DB_DIR"
npx wrangler d1 execute give-your-point-eu --local --persist-to="$DB_DIR" --file=schema.sql >/dev/null
npx wrangler d1 execute give-your-point-eu --local --persist-to="$DB_DIR" --file=e2e/seed.sql >/dev/null
exec npx wrangler pages dev public --persist-to="$DB_DIR" --port "${E2E_PORT:-8799}" \
  --binding TURNSTILE_SITE_KEY=1x00000000000000000000AA \
  --binding TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA \
  --binding APP_BASE_URL="http://localhost:${E2E_PORT:-8799}"
