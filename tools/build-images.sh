#!/usr/bin/env bash
#
# build-images.sh — regenerate sized image variants from img/logo.png.
#
# Source:
#   img/logo.png                 (2048×2048 master, generated externally)
#
# Targets in this repo:
#   img/icon-192.png             PWA icon (192×192, lossless PNG)
#   img/icon-512.png             PWA icon (512×512, lossless PNG; any+maskable)
#   img/favicon-32.png           browser tab icon (32×32, lossless PNG)
#
# Targets in the launcher repo (skipped if launcher dir not found):
#   $LAUNCHER_DIR/images/moon-glow.png
#                                Launcher card (600×600 JPEG saved with a
#                                .png extension to match the repo's sibling
#                                cards — pi-game.png, hecknsic.png, etc. are
#                                all 600×600 JPEGs by the same convention).
#
# Run from any cwd. Idempotent — re-run after replacing logo.png.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GAME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LAUNCHER_DIR="${ARCADE_LAUNCHER_DIR:-$GAME_DIR/../paulgibeault.github.io}"
SRC="$GAME_DIR/img/logo.png"

if [ ! -f "$SRC" ]; then
  echo "build-images: source not found at $SRC" >&2
  exit 1
fi
command -v sips >/dev/null 2>&1 || {
  echo "build-images: 'sips' required (macOS bundled)" >&2
  exit 1
}

emit_png() {
  local size=$1 out=$2
  sips -Z "$size" -s format png "$SRC" --out "$out" >/dev/null
  printf '  %-48s %8d bytes\n' "$out" "$(stat -f '%z' "$out")"
}

emit_jpeg_as_png() {
  local size=$1 out=$2 q=$3
  sips -Z "$size" -s format jpeg -s formatOptions "$q" "$SRC" --out "$out" >/dev/null
  printf '  %-48s %8d bytes\n' "$out" "$(stat -f '%z' "$out")"
}

echo "Rendering from $SRC"
emit_png 192 "$GAME_DIR/img/icon-192.png"
emit_png 512 "$GAME_DIR/img/icon-512.png"
emit_png  32 "$GAME_DIR/img/favicon-32.png"

if [ -d "$LAUNCHER_DIR/images" ]; then
  emit_jpeg_as_png 600 "$LAUNCHER_DIR/images/moon-glow.png" 80
else
  echo "  (skipping launcher card — $LAUNCHER_DIR/images not found)"
fi

echo "Done."
