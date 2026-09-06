#!/usr/bin/env python3
"""Generate the landing page's dithered ridgeline band.

Why generated rather than a stock photo: the reference's premium feel comes from
a *photograph* put through a halftone screen — tonal range, atmosphere, a
subject — and a repeating CSS gradient cannot produce any of that, because it
has no image in it. Buying or lifting a landscape would import someone else's
brand along with it. So the terrain is synthesised here and dithered the same
way, which keeps the look and owes nobody.

Pure stdlib: writes a 1-bit greyscale PNG by hand, no Pillow, no numpy.

    python3 scripts/generate-dither.py packages/web/public/ridge.png
"""

import math
import struct
import sys
import zlib

W, H = 1600, 460

# Ordered dither. A Bayer matrix is what gives the flat, printed look — error
# diffusion (Floyd–Steinberg) would look photographic and organic, which is the
# opposite of the instrument register this sits inside.
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


def _hash(x: int, seed: int) -> float:
    h = (x * 374761393 + seed * 668265263) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def _smooth(a: float, b: float, t: float) -> float:
    t = t * t * (3 - 2 * t)
    return a + (b - a) * t


def ridge(x: float, seed: int, octaves: int = 6) -> float:
    """1-D fractal ridge noise in 0..1 — the skyline for one mountain layer."""
    total, amp, freq, norm = 0.0, 1.0, 1.0, 0.0
    for o in range(octaves):
        xi = x * freq
        i = int(math.floor(xi))
        f = xi - i
        v = _smooth(_hash(i, seed + o), _hash(i + 1, seed + o), f)
        # Folding the wave about its midpoint is what makes a ridge rather
        # than a rolling hill: it puts a sharp crease at every peak.
        total += (1.0 - abs(v * 2 - 1)) * amp
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


def clouds(x: float, y: float, seed: int) -> float:
    total, amp, freq, norm = 0.0, 1.0, 1.0, 0.0
    for o in range(5):
        xi, yi = x * freq, y * freq * 2.2
        i, j = int(math.floor(xi)), int(math.floor(yi))
        fx, fy = xi - i, yi - j
        a = _smooth(_hash(i + j * 7919, seed + o), _hash(i + 1 + j * 7919, seed + o), fx)
        b = _smooth(
            _hash(i + (j + 1) * 7919, seed + o),
            _hash(i + 1 + (j + 1) * 7919, seed + o),
            fx,
        )
        total += _smooth(a, b, fy) * amp
        norm += amp
        amp *= 0.55
        freq *= 2.0
    return total / norm


def build_field() -> list:
    """Continuous greyscale 0..1 before dithering. Bright sky, dark ground."""
    # Near layers sit lower and darker; far layers sit higher and paler, which
    # is the only cue that reads as distance once the image is 1-bit.
    layers = [
        # (seed, horizon 0..1, amplitude, base value, scale)
        # Scale is peaks across the full width: too low and the ridges flatten
        # into horizontal bands, which is the failure this was tuned out of.
        (11, 0.40, 0.26, 0.72, 6.5),
        (29, 0.56, 0.32, 0.46, 4.0),
        (47, 0.74, 0.40, 0.14, 2.4),
    ]
    field = []
    for y in range(H):
        v = y / (H - 1)
        row = []
        for x in range(W):
            u = x / (W - 1)
            # Sky: bright at the top, falling toward the horizon, with cloud
            # structure that thins as it descends.
            sky = 0.92 - v * 0.30
            c = clouds(u * 3.0, v * 3.0, 5)
            sky += (c - 0.5) * 0.7 * (1.0 - v * 0.5)

            value = sky
            for seed, horizon, amp, base, scale in layers:
                h = horizon - (ridge(u * scale, seed) - 0.5) * amp
                if v >= h:
                    # Slight vertical shading inside each mass so the silhouettes
                    # do not flatten into solid blocks after dithering.
                    d = (v - h) / max(1e-6, 1.0 - h)
                    value = base - d * 0.16 + (clouds(u * 9, v * 9, seed) - 0.5) * 0.1
            row.append(min(1.0, max(0.0, value)))
        field.append(row)
    return field


def dither_to_png(field: list, path: str) -> None:
    raw = bytearray()
    for y in range(H):
        raw.append(0)  # filter type 0 (None)
        bits, acc = 0, 0
        for x in range(W):
            threshold = (BAYER8[y & 7][x & 7] + 0.5) / 64.0
            acc = (acc << 1) | (1 if field[y][x] > threshold else 0)
            bits += 1
            if bits == 8:
                raw.append(acc)
                bits, acc = 0, 0
        if bits:
            raw.append(acc << (8 - bits))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 1, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "packages/web/public/ridge.png"
    dither_to_png(build_field(), out)
    print(f"wrote {out} ({W}x{H}, 1-bit)")
