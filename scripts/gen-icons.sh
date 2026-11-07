#!/usr/bin/env bash
# Draws every brand icon from Jon's coin, the 11/7/2026 TroyStack logo.
#   public/troy-avatar.png   the CUTOUT, transparent, coin edge to edge
#   public/icon.png          ICON v2, the coin on a warm near black, opaque
# Run from the repo root with ImageMagick 6 or 7: bash scripts/gen-icons.sh
# For the share card, run node scripts/og-image.mjs first, then this script,
# so the squeeze at the end takes the new card too.
#
# Favicons and the PWA icons stay transparent. Formats that need a fill get
# the warm near black from ICON v2 (#0E0C07 into #070604), never pure black
# right against the coin's edge.
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v magick >/dev/null; then IM=magick
elif command -v convert >/dev/null; then IM=convert
else echo 'gen-icons.sh needs ImageMagick (magick or convert)' >&2; exit 1; fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

SRC=public/troy-avatar.png
BG_IN='#0E0C07'
BG_OUT='#070604'

# A transparent square of the coin at $1 pixels.
# troy-avatar.png is already trimmed to the coin and square.
coin() { $IM "$SRC" -filter Lanczos -resize "$1x$1" -strip "$2"; }

# The coin at $2 percent of a $1 square on the warm near black.
coin_on_bg() {
  local size=$1 pct=$2 out=$3 inner
  inner=$(( size * pct / 100 ))
  $IM -size "${size}x${size}" "radial-gradient:${BG_IN}-${BG_OUT}" \
    \( "$SRC" -filter Lanczos -resize "${inner}x${inner}" \) \
    -gravity center -composite -alpha off -depth 8 -strip "$out"
}

coin 16 public/favicon-16x16.png
coin 32 public/favicon-32x32.png
coin 48 "$TMP/favicon-48.png"
$IM public/favicon-16x16.png public/favicon-32x32.png "$TMP/favicon-48.png" public/favicon.ico

# The brand mark in the app's bar, Troy's chat and the sign-in pages.
coin 96 public/troy-96.png
# Twice that for the 56 and 80 pixel spots on a 2x screen.
coin 192 public/troy-192.png

# The PWA's icons. Maskable keeps the coin inside the 80% safe circle.
coin 192 public/icon-192.png
coin 512 public/icon-512.png
coin_on_bg 512 76 public/icon-maskable-512.png

# iOS fills a transparent touch icon with black, so it gets the warm fill.
coin_on_bg 180 88 public/apple-touch-icon.png

# The app icon on /app, from ICON v2.
$IM public/icon.png -filter Lanczos -resize 384x384 -strip -quality 88 public/app-icon.jpg

# Squeeze the big PNGs. Lossy to 256 colors, which can't be seen at these
# sizes, then lossless. Skipped with a note when pngquant isn't installed.
BIG=(public/icon-192.png public/icon-512.png public/icon-maskable-512.png
     public/apple-touch-icon.png public/troy-192.png public/og-image.png)
if command -v pngquant >/dev/null; then
  # 98 and 99 mean a file was left as it was, too small to gain or below quality.
  pngquant --force --skip-if-larger --quality 80-98 --ext .png "${BIG[@]}" || {
    code=$?; [ "$code" -eq 98 ] || [ "$code" -eq 99 ] || exit "$code"; }
else
  echo 'pngquant not found, so the PNGs are left full size' >&2
fi
if command -v oxipng >/dev/null; then oxipng -q -o 4 --strip safe "${BIG[@]}"; fi

echo 'icons drawn'
