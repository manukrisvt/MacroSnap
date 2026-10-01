#!/usr/bin/env bash
# Build the MacroSnap Android app pointing at PRODUCTION (Railway).
# Use this when you want the app on your phone to talk to the live
# backend — no local server needed, works anywhere.
#
# Usage:  ./run-android-prod.sh

set -euo pipefail
cd "$(dirname "$0")"

export VITE_API_BASE="https://macrosnap-production.up.railway.app"
npm run build

# Verify the build actually points at production.
if ! grep -q "macrosnap-production.up.railway.app/api" dist/assets/index-*.js; then
  echo "ERROR: build does not contain the production API URL. Aborting." >&2
  exit 1
fi
echo "✓ Build verified: points at production"

npx cap sync android
npx cap open android

echo ""
echo "Android Studio is opening. In Android Studio:"
echo "  1. Select the 'app' configuration + your phone at the top."
echo "  2. Press the green Run (▶) button to build & install on your phone."
echo "  3. Accept the install + camera permissions prompts on the phone."
echo ""
echo "This build talks to PRODUCTION — your real account, real data."
