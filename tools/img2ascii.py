"""Turn a background-removed photo into ASCII art sized for the site's grid.

    python tools/img2ascii.py photo.jpg --width 78 > art.txt

Three things decide whether the result reads as a face or as noise:

1. Character aspect. A monospace cell is taller than it is wide, so asking
   for N columns does NOT mean N*(h/w) rows -- that stretches the subject
   vertically. JetBrains Mono's advance is 0.6 em and our line-height is
   exactly 1 em, so one cell is 0.6 wide by 1.0 tall and the row count must
   be scaled by that ratio.

2. The silhouette floor. The site's background is dark, so the obvious
   mapping (dark pixel -> space) deletes dark hair entirely and leaves a
   face floating with no head around it. Inside the subject mask the ramp
   therefore never reaches space: the darkest subject pixel still gets the
   faintest visible glyph. Only the removed background becomes space.

3. Contrast. A face occupies a narrow band of mid greys. Without
   autocontrast the ramp uses maybe four of its glyphs and the portrait
   comes out flat.
"""
import argparse
import sys

import numpy as np
from PIL import Image, ImageFilter

# Dark -> bright. Index 0 is reserved for the removed background.
DEFAULT_RAMP = " .:-=+*oOX#%@"


def build_mask(rgb, bg=(255, 255, 255), tol=16):
    """True where the subject is. The cutout was flattened onto white, so the
    background is whatever still matches that white within a JPEG-ringing
    tolerance."""
    diff = np.abs(rgb.astype(np.int16) - np.array(bg, dtype=np.int16))
    return diff.max(axis=2) > tol


def to_ascii(path, width, ramp, char_aspect, gamma, invert, margin,
             keep_top=1.0, equalize=True, crop=None, sharpen=0.0, radius=1.6,
             solid=False, despeckle=0, dissolve=0.0):
    im = Image.open(path).convert("RGB")

    # An explicit crop, in fractions of the image, beats auto-framing for a
    # portrait: the subject bbox includes the whole torso, and the shirt is
    # a large flat mid-grey region that eats most of the equalised range and
    # leaves nothing for the face.
    if crop:
        x0f, y0f, x1f, y1f = crop
        im = im.crop((int(x0f * im.width), int(y0f * im.height),
                      int(x1f * im.width), int(y1f * im.height)))

    rgb = np.asarray(im)
    # solid: the image has no removed background (a rendered frame, say),
    # so every pixel is subject and nothing maps to a space.
    mask = np.ones(rgb.shape[:2], bool) if solid else build_mask(rgb)

    # Crop to the subject so the art is not mostly empty margin.
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    y0, y1 = rows[0], rows[-1] + 1
    x0, x1 = cols[0], cols[-1] + 1
    pad_y = int((y1 - y0) * margin)
    pad_x = int((x1 - x0) * margin)
    y0, y1 = max(0, y0 - pad_y), min(im.height, y1 + pad_y)
    x0, x1 = max(0, x0 - pad_x), min(im.width, x1 + pad_x)

    # Optionally keep only the top slice of the subject. At 72 columns a
    # full head-and-shoulders crop leaves the face about 22 cells wide,
    # which is not enough cells to resolve eyes or a mouth; tightening onto
    # the head spends the same grid on the part that has to be recognisable.
    if keep_top < 1.0:
        y1 = y0 + int((y1 - y0) * keep_top)

    im = im.crop((x0, y0, x1, y1))
    sub = Image.fromarray((mask[y0:y1, x0:x1] * 255).astype(np.uint8))

    height = max(1, round(width * (im.height / im.width) * char_aspect))

    grey = im.convert("L").resize((width, height), Image.LANCZOS)
    # Lanczos on the mask would ring and produce grey edge pixels; BILINEAR
    # then a threshold keeps the silhouette crisp.
    sub = sub.resize((width, height), Image.BILINEAR)

    lum = np.asarray(grey, dtype=np.float64) / 255.0
    inside = np.asarray(sub, dtype=np.float64) / 255.0 > 0.5

    # Despeckle. Wispy hair at the crown survives the downsample as isolated
    # single cells, which read as dirt on the screen rather than as hair.
    # Drop any subject cell with too few subject neighbours.
    if despeckle > 0:
        pad = np.pad(inside, 1, constant_values=False)
        neighbours = sum(pad[i:i + inside.shape[0], j:j + inside.shape[1]]
                         for i in range(3) for j in range(3)) - inside
        inside &= neighbours >= despeckle

    # Edge dissolve. A hard silhouette looks cut out with scissors; letting
    # cells drop out with a probability that rises towards the boundary makes
    # the portrait read as emerging from the page, and matches the way the
    # reveal animation scatters.
    if dissolve > 0:
        pad = np.pad(inside, 1, constant_values=False)
        neighbours = sum(pad[i:i + inside.shape[0], j:j + inside.shape[1]]
                         for i in range(3) for j in range(3)) - inside
        edge = (8 - neighbours) / 8.0            # 0 deep inside, 1 at the rim
        rng = np.random.default_rng(7)           # fixed seed: reproducible art
        inside &= rng.random(inside.shape) >= edge * dissolve

    # Normalise over the SUBJECT ONLY. Running autocontrast on the whole
    # frame lets the white background own the top of the histogram, which
    # squeezes the face into a few ramp steps and turns it to mush.
    vals = lum[inside]
    if vals.size:
        if equalize:
            # Histogram equalisation, not a linear stretch. A linear stretch
            # is spent on the two extremes -- dark hair and bright cheek --
            # so the mid greys that actually carry the eyes, nose and mouth
            # still land on two or three glyphs. Equalising by rank forces
            # every ramp step to be used equally often, which is what makes
            # features legible on a grid this coarse.
            order = np.argsort(vals)
            ranks = np.empty(vals.size)
            ranks[order] = np.arange(vals.size)
            out = np.zeros_like(lum)
            out[inside] = ranks / max(vals.size - 1, 1)
            lum = out
        else:
            lo, hi = np.percentile(vals, [2, 98])
            if hi > lo:
                lum = (lum - lo) / (hi - lo)

    # Local contrast. A face lit this evenly has almost no global shadow, so
    # after any global normalisation the cheeks, nose and brow all land on
    # the same two or three glyphs. Subtracting a blurred copy (an unsharp
    # mask) amplifies what differs from a cell's neighbourhood, which is
    # exactly where eyes, nostrils and the mouth line live.
    if sharpen > 0:
        blur = np.array(Image.fromarray((lum * 255).astype(np.uint8))
                        .filter(ImageFilter.GaussianBlur(radius)), dtype=np.float64) / 255.0
        lum = np.clip(lum + sharpen * (lum - blur), 0.0, 1.0)
        v = lum[inside]
        if v.size and v.max() > v.min():
            lum = (lum - v.min()) / (v.max() - v.min())

    if invert:
        lum = 1.0 - lum
    lum = np.clip(lum, 0.0, 1.0) ** gamma

    # Inside the subject the ramp starts at index 1, so nothing in the
    # silhouette can collapse to a space.
    body = len(ramp) - 1
    idx = 1 + np.clip((lum * (body - 1)).round().astype(int), 0, body - 1)
    idx = np.where(inside, idx, 0)

    table = np.array(list(ramp))
    return "\n".join("".join(row).rstrip() for row in table[idx])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("image")
    p.add_argument("--width", type=int, default=78, help="columns of output")
    p.add_argument("--ramp", default=DEFAULT_RAMP)
    p.add_argument("--char-aspect", type=float, default=0.6,
                   help="cell width / cell height; 0.6 for JetBrains Mono at line-height 1")
    p.add_argument("--gamma", type=float, default=1.0,
                   help=">1 darkens midtones, <1 lifts them")
    p.add_argument("--invert", action="store_true")
    p.add_argument("--despeckle", type=int, default=0,
                   help="drop subject cells with fewer than N subject neighbours (0-8)")
    p.add_argument("--dissolve", type=float, default=0.0,
                   help="0-1; how strongly the silhouette edge scatters")
    p.add_argument("--solid", action="store_true",
                   help="treat the whole image as subject (no background to mask)")
    p.add_argument("--no-equalize", action="store_true",
                   help="use a linear percentile stretch instead of equalisation")
    p.add_argument("--margin", type=float, default=0.02)
    p.add_argument("--crop", help="x0,y0,x1,y1 as fractions of the image")
    p.add_argument("--sharpen", type=float, default=0.0,
                   help="unsharp strength on the character grid; try 0.6-1.5")
    p.add_argument("--radius", type=float, default=1.6,
                   help="unsharp blur radius, in cells")
    p.add_argument("--keep-top", type=float, default=1.0,
                   help="keep only this fraction of the subject height (1.0 = all)")
    a = p.parse_args()

    art = to_ascii(a.image, a.width, a.ramp, a.char_aspect, a.gamma,
                   a.invert, a.margin, a.keep_top, not a.no_equalize,
                   tuple(float(v) for v in a.crop.split(',')) if a.crop else None,
                   a.sharpen, a.radius, a.solid, a.despeckle, a.dissolve)
    sys.stdout.write(art + "\n")


if __name__ == "__main__":
    main()
