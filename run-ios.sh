#!/usr/bin/env bash
# Build the MacroSnap iOS app for personal-device testing.
# Usage:  ./run-ios.sh
#
# Prereqs (one-time):
#   1. Install Xcode from the Mac App Store (free).
#   2. Open Xcode once and accept the license.
#   3. Sign in with your Apple ID under Xcode > Settings > Accounts
#      (a free personal team is fine — no $99 developer program needed).
#   4. Plug in your iPhone via USB and enable Developer Mode
#      (iPhone: Settings > Privacy & Security > Developer Mode).
#
# This script:
#   - builds the frontend with VITE_API_BASE pointing at your Mac's LAN IP
#   - syncs the web build into the Xcode project
#   - opens Xcode so you can pick your phone + your signing team and Run.
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
echo "Make sure your iPhone is on the same WiFi network, and run 'npm run server' in another terminal."

export VITE_API_BASE="http://$LAN_IP:8787"
npm run build
npx cap sync ios
npx cap open ios
echo ""
echo "Xcode is opening. In Xcode:"
echo "  1. Select the MacroSnap scheme + your iPhone at the top."
echo "  2. App > Signing & Capabilities > select your Personal team."
echo "  3. Press Cmd+R to build & run on your phone."
echo "  4. On your iPhone: trust the developer profile if prompted"
echo "     (Settings > General > VPN & Device Management)."
