#!/usr/bin/env python3
"""Prepare the landing page's background crops from the hero photograph.

    python3 scripts/prepare-hero-image.py

Writes every crop in OUTPUTS from packages/web/assets/hero-background.png.

The screen is an ordered Bayer dither to a LIMITED NUMBER OF LEVELS, not to
1 bit. That distinction is the whole thing. At 2 levels every pixel is forced to
black or white, which throws away every mid-tone in the photograph — it read as
dots rather than as sky, and then needed a blur to look like anything at all. At
LEVELS in the handful, the quantisation steps are small enough that the tone
survives and the dither only shows up as texture in the transitions between
them, which is what a fine printed screen looks like.

What it does instead is keep the photograph and lift its black point to exactly
the page ground. The dark half of the frame then IS the page, to the pixel, so
the crop has no edge to give it away and needs no alpha channel to hide one.
That matters for weight as much as for looks: carrying the tone in alpha instead
cost 600KB a crop, because WebP encodes alpha near-losslessly, and the whole
image was alpha.

WebP, losslessly — see the note on the encoder below.
"""

import sys

from PIL import Image  # the only non-stdlib dependency in the repo's scripts

# (path, width, height, top crop). Each is sized to the box it fills at 2x, so
# the browser is always scaling down. The top crop drops empty sky: the panel is
# inset from the top of its image, so whatever lands in the first fifth is the
# band actually on show — it has to be the cloud mass, not the dark sky above.
OUTPUTS = [
    # The hero's right column at its widest: 599x710 CSS px inside a 75rem frame.
    ("packages/web/public/hero-ridge.webp", 1200, 1420, 0.11),
    # The band above the lock and trust panels: full measure, and short.
    ("packages/web/public/band-ridge.webp", 2400, 720, 0.10),
]

# The page ground, from tokens.css --bg. The photograph's black is mapped onto
# exactly this, which is what makes the crop edgeless. If --bg ever moves, this
# moves with it or a faint rectangle appears in the hero.
GROUND = 0x0A / 255.0

# The photograph is 3:2; neither box is. Crop from the left, which is where the
# ridge and the main cloud mass are — the right third is thin cirrus that
# carries no silhouette.
CROP_ANCHOR = 0.0

# Input levels. BLACK is the brightness that lands on the page ground, so the
# deep forest disappears into the page; WHITE is the brightness that reaches
# full white. Pulling WHITE below 1.0 lifts the whole image and is what keeps
# the clouds reading as bright rather than as mid-grey.
BLACK = 0.05
WHITE = 0.88

# >1 darkens the mid-tones, <1 lifts them. Kept close to 1: the photograph is
# already well exposed, and the last two attempts both failed by pushing a
# curve hard enough to flatten the subject.
GAMMA = 1.10

# The screen. LEVELS is how many grey steps the image is quantised to before
# dithering: 2 is a pure black-and-white halftone (too much — it destroys the
# photograph), and a large number is no visible texture at all. DOT is the side
# of one screen cell in output pixels; the crops are 2x, so DOT 2 is a one-CSS-
# pixel screen that reads as texture up close and averages to grey at a glance.
LEVELS = 6
DOT = 2

BAYER8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
]

# Lossless, and not a stylistic choice. The screen is high-frequency detail by
# construction, which is the worst case for a lossy encoder: at quality 82 the
# same crop came out 412KB *and* smeared the dither into mush. Quantised to
# LEVELS greys it compresses losslessly to a third of that.


def crop(src: str, w: int, h: int, crop_top: float) -> Image.Image:
    img = Image.open(src).convert("L")
    sw, sh = img.size
    top = int(sh * crop_top)
    sh -= top
    want = w / h
    if sw / sh > want:
        cw = int(sh * want)
        x = int((sw - cw) * CROP_ANCHOR)
        img = img.crop((x, top, x + cw, top + sh))
    else:
        ch = int(sw / want)
        img = img.crop((0, top, sw, top + ch))
    return img.resize((w, h), Image.LANCZOS)


def grade(grey: Image.Image) -> Image.Image:
    """Levels and gamma, in 0..1, before the screen is applied."""
    span = WHITE - BLACK
    lut = []
    for i in range(256):
        v = (i / 255.0 - BLACK) / span
        lut.append(int(round(min(1.0, max(0.0, v)) ** GAMMA * 255)))
    return grey.point(lut)


def screen(grey: Image.Image) -> Image.Image:
    """Ordered dither to LEVELS steps, then map onto GROUND..white."""
    w, h = grey.size
    src = grey.load()
    out = Image.new("L", (w, h))
    dst = out.load()
    steps = LEVELS - 1
    for y in range(h):
        row = BAYER8[(y // DOT) & 7]
        for x in range(w):
            v = src[x, y] / 255.0
            # Perturb by up to half a quantisation step, then snap. The dither
            # therefore only ever moves a pixel to a neighbouring level, which
            # is why the photograph survives it.
            v += ((row[(x // DOT) & 7] + 0.5) / 64.0 - 0.5) / steps
            v = round(min(1.0, max(0.0, v)) * steps) / steps
            dst[x, y] = int(round((GROUND + (1.0 - GROUND) * v) * 255))
    return out


if __name__ == "__main__":
    source = sys.argv[1] if len(sys.argv) > 1 else "packages/web/assets/hero-background.png"
    for target, w, h, crop_top in OUTPUTS:
        img = screen(grade(crop(source, w, h, crop_top)))
        img.convert("RGB").save(target, "WEBP", lossless=True, method=6)
        print(f"wrote {target} ({w}x{h})")
