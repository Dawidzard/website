"""Measure how much ink each glyph actually puts on the page, and build a
density ramp that is evenly spaced in ink rather than in guesswork.

The naive ramp " .:-=+*oOX#%@" looks like a gradient when you read it, but
it is not one. Rasterised, `o O X # % @` all land within a few percent of
each other and `. : - = + *` all land near the bottom, so a portrait mapped
through it collapses into two tones: faint hair, solid everything else.

This renders every candidate glyph into a real character cell (0.6 x 1.0,
the JetBrains Mono ratio), measures the fraction of covered pixels, and then
picks the subset whose coverages sit closest to evenly spaced targets.

    python tools/calibrate_ramp.py --steps 12
"""
import argparse
import string

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = "assets/fonts/JetBrainsMono-Regular.ttf"
# Excluded: space (reserved for the background) and glyphs that read as
# punctuation noise or sit on the baseline in a way that implies a line.
EXCLUDE = set('  ')


def coverage(font, ch, size):
    """Ink fraction of one glyph inside its real line box.

    The cell is advance-width by (ascent + descent), not by font size: using
    the size as the height clips descenders, which measured `_`, `g`, `y`
    and friends as far lighter than they render.
    """
    ascent, descent = font.getmetrics()
    cell_w = int(round(font.getlength("M")))
    cell_h = ascent + descent
    img = Image.new("L", (cell_w, cell_h), 0)
    # Default anchor "la" puts the ascender top at y=0, so the glyph lands
    # inside the box exactly as a line of text would place it.
    ImageDraw.Draw(img).text((0, 0), ch, font=font, fill=255)
    return np.asarray(img, dtype=np.float64).mean() / 255.0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--font", default=FONT)
    p.add_argument("--size", type=int, default=64, help="raster size for measuring")
    p.add_argument("--steps", type=int, default=12, help="glyphs in the ramp")
    p.add_argument("--show-all", action="store_true")
    p.add_argument("--no-letters", action="store_true",
                   help="exclude A-Z a-z 0-9 so the art reads as a drawing "
                        "rather than as scrambled text")
    a = p.parse_args()

    font = ImageFont.truetype(a.font, a.size)
    cands = [c for c in string.printable[:94] if c not in EXCLUDE]
    if a.no_letters:
        cands = [c for c in cands if not c.isalnum()]
    cov = sorted(((coverage(font, c, a.size), c) for c in cands))

    if a.show_all:
        print("every glyph by measured ink coverage:")
        for v, c in cov:
            print(f"  {c!r:5} {v*100:5.1f}%  {'#' * int(v * 120)}")
        print()

    lo, hi = cov[0][0], cov[-1][0]
    # Cap the top: the very densest glyphs are nearly solid blocks and a
    # portrait that reaches them looks blown out rather than bright.
    hi = min(hi, 0.62)
    targets = np.linspace(lo, hi, a.steps)

    ramp, used = [], set()
    for t in targets:
        best = min((abs(v - t), v, c) for v, c in cov if c not in used)
        used.add(best[2])
        ramp.append((best[2], best[1]))

    print("calibrated ramp (dark -> bright):")
    print("  " + "".join(c for c, _ in ramp))
    print("  coverages: " + "  ".join(f"{c}={v*100:.0f}%" for c, v in ramp))

    # Residual tells you how close to a true linear gradient this ramp gets.
    vals = np.array([v for _, v in ramp])
    ideal = np.linspace(vals[0], vals[-1], len(vals))
    print(f"  max deviation from linear: {np.abs(vals - ideal).max()*100:.1f} pp")


if __name__ == "__main__":
    main()
