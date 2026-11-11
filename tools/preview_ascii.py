"""Render an ASCII drawing back into a PNG, in the site's own colours.

Judging ASCII art by reading the characters is unreliable: what matters is
what the eye sees once the glyphs are small, cream-on-mocha, and packed on a
0.6 x 1.0 cell. This renders exactly that so a variant can be looked at
rather than guessed at.

    python tools/preview_ascii.py art.txt out.png [--cell 9]
"""
import argparse
import pathlib

from PIL import Image, ImageDraw, ImageFont

BG = (0x24, 0x1a, 0x14)      # --c-bg
INK = (0xB3, 0x9E, 0x89)     # --c-ascii  (the muted coffee step)
MONO = "assets/fonts/JetBrainsMono-Regular.ttf"   # the font the site actually draws with


def render(text, cell_h=9, pad=24):
    lines = text.rstrip("\n").split("\n")
    cols = max(len(l) for l in lines)
    font = ImageFont.truetype(MONO, cell_h)
    ascent, descent = font.getmetrics()
    line_h = cell_h   # the site sets line-height to exactly 1em

    # Measure the real advance width rather than assuming it: Consolas and
    # JetBrains Mono do not share the same ratio, and guessing shears the art.
    adv = font.getlength("M")
    cell_w = adv

    img = Image.new("RGB", (int(cols * cell_w) + pad * 2,
                            int(len(lines) * cell_h) + pad * 2), BG)
    d = ImageDraw.Draw(img)
    for row, line in enumerate(lines):
        for col, ch in enumerate(line):
            if ch != " ":
                d.text((pad + col * cell_w, pad + row * cell_h), ch,
                       font=font, fill=INK)
    return img


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("art")
    p.add_argument("out")
    p.add_argument("--cell", type=int, default=9)
    a = p.parse_args()
    render(pathlib.Path(a.art).read_text(encoding="utf-8"), a.cell).save(a.out)
    print("wrote", a.out)
