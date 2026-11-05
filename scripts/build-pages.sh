#!/usr/bin/env bash
# Build the Cloudflare Pages output. Does not deploy.
# Layout: dist/pages/        ← site/ (landing)
#         dist/pages/app/    ← Angular browser build with base href /app/
#         dist/pages/_headers
#
# Uses a separate Angular --output-path so this script does not overwrite
# app/dist/sawti/browser (Capacitor webDir, built with base href /).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/dist/pages"
NG_OUT="$APP/dist/pages-browser"

export PATH="/opt/homebrew/bin:${PATH:-}"

cd "$APP"
npx ng build --base-href /app/ --output-path dist/pages-browser

rm -rf "$OUT"
mkdir -p "$OUT/app"
cp -R "$ROOT/site/." "$OUT/"
cp -R "$NG_OUT/browser/." "$OUT/app/"
cp "$ROOT/site/_headers" "$OUT/_headers"

echo "Pages output: $OUT"
