#!/usr/bin/env bash
#
# PrivateApply Companion — Linux Installation Script
# Registers the Chrome and Firefox Native Messaging Host manifests
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPANION_SRC="$SCRIPT_DIR/privateapply_companion.py"
INSTALL_DIR="$HOME/.local/lib/privateapply"
HOST_NAME="com.privateapply.companion"

echo "========================================================"
echo " PrivateApply: Linux Native Messaging Companion Setup   "
echo "========================================================"
echo ""

# 1. Check Python 3
if ! command -v python3 &>/dev/null; then
  echo "[-] Error: python3 is not installed or not in PATH."
  echo "    Please install Python 3.8+ using your package manager."
  exit 1
fi
echo "[+] Python 3 detected: $(python3 --version)"

# 2. Check LaTeX Engines
echo "[*] Checking installed LaTeX toolchain..."
FOUND_TEX=0
for eng in latexmk pdflatex xelatex lualatex; do
  if command -v "$eng" &>/dev/null; then
    echo "    [x] $eng: $(command -v "$eng")"
    FOUND_TEX=1
  else
    echo "    [ ] $eng: not installed"
  fi
done

if [ "$FOUND_TEX" -eq 0 ]; then
  echo ""
  echo "[!] Notice: No LaTeX engines were found in your PATH."
  echo "    The PrivateApply extension will still work, but LaTeX compilation"
  echo "    will be unavailable until you install a TeX distribution."
  echo ""
  echo "    Recommended installation:"
  echo "      Fedora:  sudo dnf install texlive-scheme-basic latexmk"
  echo "      Ubuntu:  sudo apt install texlive-latex-base texlive-latex-recommended latexmk"
  echo "      Arch:    sudo pacman -S texlive-basic texlive-bin"
  echo ""
else
  echo "[+] TeX engines detected and ready for compilation."
fi

# 3. Extension IDs
# Extension ID can be supplied as the first argument, or defaults to development patterns
EXTENSION_ID="${1:-}"

# 4. Prepare install directory
mkdir -p "$INSTALL_DIR"
cp -f "$COMPANION_SRC" "$INSTALL_DIR/privateapply_companion.py"
chmod +x "$INSTALL_DIR/privateapply_companion.py"
echo "[+] Companion installed to: $INSTALL_DIR/privateapply_companion.py"

TARGET_BIN="$INSTALL_DIR/privateapply_companion.py"

# 5. Native host manifests
# Chrome / Chromium target directories
CHROME_DIRS=(
  "$HOME/.config/google-chrome/NativeMessagingHosts"
  "$HOME/.config/chromium/NativeMessagingHosts"
  "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
)

# Build allowed_origins for Chrome
ALLOWED_ORIGINS_JSON="["
if [ -n "$EXTENSION_ID" ]; then
  ALLOWED_ORIGINS_JSON+="\"chrome-extension://$EXTENSION_ID/\""
else
  # Default to common development IDs and wildcard development match
  ALLOWED_ORIGINS_JSON+="\"chrome-extension://*\""
fi
ALLOWED_ORIGINS_JSON+="]"

CHROME_MANIFEST=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "PrivateApply Linux compilation companion for AI LaTeX resume editor",
  "path": "$TARGET_BIN",
  "type": "stdio",
  "allowed_origins": $ALLOWED_ORIGINS_JSON
}
EOF
)

for dir in "${CHROME_DIRS[@]}"; do
  mkdir -p "$dir"
  echo "$CHROME_MANIFEST" > "$dir/$HOST_NAME.json"
  echo "[+] Registered Chrome Native Messaging manifest in: $dir/$HOST_NAME.json"
done

# Firefox target directory
FIREFOX_DIR="$HOME/.mozilla/native-messaging-hosts"
mkdir -p "$FIREFOX_DIR"

ALLOWED_EXTENSIONS_JSON="["
if [ -n "$EXTENSION_ID" ]; then
  ALLOWED_EXTENSIONS_JSON+="\"$EXTENSION_ID\""
else
  ALLOWED_EXTENSIONS_JSON+="\"privateapply@local\", \"offlyn-apply@local\""
fi
ALLOWED_EXTENSIONS_JSON+="]"

FIREFOX_MANIFEST=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "PrivateApply Linux compilation companion for AI LaTeX resume editor",
  "path": "$TARGET_BIN",
  "type": "stdio",
  "allowed_extensions": $ALLOWED_EXTENSIONS_JSON
}
EOF
)

echo "$FIREFOX_MANIFEST" > "$FIREFOX_DIR/$HOST_NAME.json"
echo "[+] Registered Firefox Native Messaging manifest in: $FIREFOX_DIR/$HOST_NAME.json"

# 6. Verify companion self-test
echo ""
echo "[*] Running companion self-test..."
SELF_TEST_OUT=$(python3 -c "
import sys, struct, json, subprocess

req = json.dumps({'cmd': 'get_status'}).encode('utf-8')
proc = subprocess.Popen(['$TARGET_BIN'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
proc.stdin.write(struct.pack('=I', len(req)) + req)
proc.stdin.flush()
raw_len = proc.stdout.read(4)
if len(raw_len) == 4:
    l = struct.unpack('=I', raw_len)[0]
    res = json.loads(proc.stdout.read(l).decode('utf-8'))
    print(json.dumps(res))
proc.terminate()
" 2>/dev/null || echo "FAILED")

if [[ "$SELF_TEST_OUT" =~ "version" ]]; then
  echo "[+] Self-test PASSED! Companion responded successfully."
else
  echo "[!] Self-test warning: Companion did not respond cleanly."
fi

echo ""
echo "========================================================"
echo " Installation Complete!                                "
echo " Restart Chrome/Chromium or reload PrivateApply.       "
echo "========================================================"
