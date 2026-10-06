#!/usr/bin/env bash
#
# PrivateApply Companion — Linux Uninstallation Script
# Removes native host manifests and companion files cleanly.
#

set -euo pipefail

HOST_NAME="com.privateapply.companion"
INSTALL_DIR="$HOME/.local/lib/privateapply"

echo "Uninstalling PrivateApply Native Companion..."

# Remove manifests
TARGET_MANIFESTS=(
  "$HOME/.config/google-chrome/NativeMessagingHosts/$HOST_NAME.json"
  "$HOME/.config/chromium/NativeMessagingHosts/$HOST_NAME.json"
  "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/$HOST_NAME.json"
  "$HOME/.mozilla/native-messaging-hosts/$HOST_NAME.json"
)

for mf in "${TARGET_MANIFESTS[@]}"; do
  if [ -f "$mf" ]; then
    rm -f "$mf"
    echo "[x] Removed manifest: $mf"
  fi
done

# Remove companion binary
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo "[x] Removed directory: $INSTALL_DIR"
fi

echo "Uninstallation complete."
