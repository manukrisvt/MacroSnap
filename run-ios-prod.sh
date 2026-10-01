#!/usr/bin/env bash
# Build the MacroSnap iOS app pointing at PRODUCTION (Railway).
# Use this when you want the app on your phone to talk to the live
# backend — no local server needed, works anywhere (not just your WiFi).
#
# Usage:  ./run-ios-prod.sh

set -euo pipefail
cd "$(dirname "$0")"

export VITE_API_BASE="https://macrosnap-production.up.railway.app"
npm run build

# Verify the build actually points at production (guards against a stale
# dist from a plain `vite build` without the env var).
if ! grep -q "macrosnap-production.up.railway.app/api" dist/assets/index-*.js; then
  echo "ERROR: build does not contain the production API URL. Aborting." >&2
  exit 1
fi
echo "✓ Build verified: points at production"

npx cap sync ios
npx cap open ios

echo ""
echo "Xcode is opening. In Xcode:"
echo "  1. Select the MacroSnap scheme + your iPhone at the top."
echo "  2. App > Signing & Capabilities > select your Personal team."
echo "  3. Press Cmd+R to build & run on your phone."
echo ""
echo "This build talks to PRODUCTION — your real account, real data."
