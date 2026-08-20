#!/usr/bin/env bash
# Build the MacroSnap Android app for personal-device testing.
# Usage:  ./run-android.sh
#
# Prereqs (one-time):
#   1. Install Android Studio from https://developer.android.com/studio (free).
#      Open it once so it downloads the Android SDK + platform tools.
#   2. Plug in your Android phone via USB and enable USB debugging
#      (Settings > About phone > tap Build number 7x to unlock Developer options,
#       then Settings > System > Developer options > USB debugging = ON).
#   3. Accept the "Allow USB debugging?" prompt on the phone the first time.
#
# This script:
#   - builds the frontend with VITE_API_BASE pointing at your Mac's LAN IP
#   - syncs the web build into the Android project
#   - opens Android Studio so you can press Run (▶) to install on your phone.
#
# Your Mac must keep running `npm run server` (the backend) while you use
# the app on your phone, and your phone must be on the same WiFi network.

set -euo pipefail
cd "$(dirname "$0")"

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [ -z "$LAN_IP" ]; then
  echo "Could not detect your Mac's WiFi IP. Set LAN_IP manually at the top of this script." >&2
  exit 1
fi
echo "Using LAN IP: $LAN_IP"
echo "Make sure your Android phone is on the same WiFi, and run 'npm run server' in another terminal."

export VITE_API_BASE="http://$LAN_IP:8787"
npm run build
npx cap sync android
npx cap open android
echo ""
echo "Android Studio is opening. In Android Studio:"
echo "  1. Select the 'app' configuration + your phone at the top."
echo "  2. Press the green Run (▶) button to build & install on your phone."
echo "  3. Accept the install + camera permissions prompts on the phone."
echo ""
echo "To build a shareable .apk instead (no USB needed):"
echo "  cd android && ./gradlew assembleDebug"
echo "  -> output at android/app/build/outputs/apk/debug/app-debug.apk"
echo "  Transfer it to your phone and tap Install (enable 'Install unknown apps' for your file manager)."
