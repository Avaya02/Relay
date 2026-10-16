#!/bin/sh
# Encodes the rendered master and poster into the landing's public folder.
# Needs ffmpeg (with libsvtav1 and libx264) and cwebp, e.g. from Homebrew.
set -eu
cd "$(dirname "$0")/.."
out=../web/public/tour
mkdir -p "$out"

# AV1 at full size for every browser that decodes it; scm=1 is SVT-AV1's
# screen-content mode, which keeps small UI type sharp at a low bitrate.
ffmpeg -hide_banner -loglevel error -y -i out/tour-master.mp4 -an \
  -c:v libsvtav1 -preset 5 -crf 44 -svtav1-params scm=1:tune=0 -g 240 \
  -pix_fmt yuv420p -movflags +faststart "$out/relay-tour-av1.mp4"

# H.264 for the rest (Safari without an AV1 decoder), at 1920 to stay near the
# AV1 file's size.
ffmpeg -hide_banner -loglevel error -y -i out/tour-master.mp4 -an \
  -vf scale=1920:1200:flags=lanczos -c:v libx264 -preset veryslow -tune animation -crf 25 \
  -pix_fmt yuv420p -movflags +faststart "$out/relay-tour-h264.mp4"

cwebp -quiet -q 80 -m 6 out/poster.png -o "$out/poster.webp"
ls -l "$out"
