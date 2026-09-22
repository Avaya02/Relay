#!/usr/bin/env python3
"""Grade the join page's scene from its source painting.

    python3 scripts/prepare-join-sky.py

Reads packages/web/assets/join-sky-source.webp, writes
packages/web/public/join-sky.webp.

The source is a dusk painting: a deep-blue sky over warm-lit clouds, a figure
on a flower hill, a valley of city lights. The join page wants the same scene
at night — black sky, same stars, same clouds, same figure — so this pushes
only the *blue* toward the page ground and leaves everything else alone.

"Blue" is decided per pixel from hue and saturation, feathered at both edges so
the cyan band where sky meets cloud-glow darkens gradually rather than along a
seam. Stars survive because they are bright and unsaturated; clouds because they
are warm; the silhouette because it is already black. The valley haze is blue
too and goes dark with the sky, which reads as night rather than as a mistake.

The black point is lifted to exactly --bg so the dark sky IS the page and the
panel needs no edge treatment — the same trick prepare-hero-image.py uses.
"""

import colorsys
import sys

from PIL import Image

SOURCE = "packages/web/assets/join-sky-source.webp"
OUTPUT = "packages/web/public/join-sky.webp"

# tokens.css --bg. Move together or a faint rectangle appears around the scene.
GROUND = 0x0A

# Hue window (degrees) that counts as sky, with a feather on each side.
HUE_LO, HUE_HI, HUE_FEATHER = 188.0, 262.0, 14.0
# Saturation below which a pixel is grey (a star, a cloud shadow) not sky.
SAT_LO, SAT_HI = 0.30, 0.66
# How far a fully-blue pixel is pushed toward black.
DARKEN = 0.9
# Rendered at 2x on a ~720px-wide panel; the source is 1024. Upscaling adds no
# detail, but it does keep the GPU's bilinear filter from turning the painting
# into visible blocks at retina density.
TARGET_WIDTH = 1600


def smoothstep(lo: float, hi: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def hue_weight(h_deg: float) -> float:
    rise = smoothstep(HUE_LO - HUE_FEATHER, HUE_LO, h_deg)
    fall = 1.0 - smoothstep(HUE_HI, HUE_HI + HUE_FEATHER, h_deg)
    return rise * fall


def grade(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    out = Image.new("RGB", (w, h))
    op = out.load()
    scale = (255 - GROUND) / 255.0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            weight = hue_weight(hh * 360.0) * smoothstep(SAT_LO, SAT_HI, ss)
            if weight > 0.0:
                # Darken, and pull the little remaining colour toward neutral so
                # the black sky isn't faintly navy.
                vv *= 1.0 - DARKEN * weight
                ss *= 1.0 - 0.6 * weight
                r, g, b = (int(round(c * 255)) for c in colorsys.hsv_to_rgb(hh, ss, vv))
            op[x, y] = (
                GROUND + int(r * scale),
                GROUND + int(g * scale),
                GROUND + int(b * scale),
            )
    return out


def main() -> int:
    im = Image.open(SOURCE).convert("RGB")
    graded = grade(im)
    if graded.width < TARGET_WIDTH:
        ratio = TARGET_WIDTH / graded.width
        graded = graded.resize(
            (TARGET_WIDTH, round(graded.height * ratio)), Image.Resampling.LANCZOS
        )
    graded.save(OUTPUT, "WEBP", quality=88, method=6)
    print(f"wrote {OUTPUT} {graded.size}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
