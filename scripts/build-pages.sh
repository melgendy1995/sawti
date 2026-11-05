#!/usr/bin/env bash
# Build the Cloudflare Pages output. Does not deploy.
# Layout: dist/pages/        ← site/ (landing)
#         dist/pages/app/    ← Angular browser build
#         dist/pages/_headers
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/dist/pages"

export PATH="/opt/homebrew/bin:${PATH:-}"

cd "$APP"
npx ng build --base-href /app/

rm -rf "$OUT"
mkdir -p "$OUT/app"
cp -R "$ROOT/site/." "$OUT/"
cp -R "$APP/dist/sawti/browser/." "$OUT/app/"
cp "$ROOT/site/_headers" "$OUT/_headers"

echo "Pages output: $OUT"
