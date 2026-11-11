"""Avatars and banners for LinkedIn, YouTube and GitHub.

    python tools/make_brand.py              # everything
    python tools/make_brand.py gh-avatar

Consistency is by construction, not by eye: the palette is read out of
styles/tokens.css, the type is the same Inter and JetBrains Mono the page
loads, and the ASCII art is the same files the site renders. Move a token,
re-run, and every image follows.

Four kinds of output:

  text banner   type-led, with ASCII art set behind it
  art banner    the art IS the banner; type is a caption
  ascii avatar  one drawing, square, centred
  photo avatar  a real photograph composited over a field of source code

Platform sizes and their traps are recorded on each target below.
"""
import argparse
import pathlib
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets/fonts"
ASCII = ROOT / "assets/ascii"
OUT = ROOT / "assets/brand"


def tokens():
    css = (ROOT / "styles/tokens.css").read_text(encoding="utf-8")
    found = dict(re.findall(r"(--c-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})", css))
    return {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in found.items()}


C = tokens()
BG, DEEP = C["--c-bg"], C["--c-bg-deep"]
INK, MUTED, FAINT = C["--c-ink"], C["--c-ink-muted"], C["--c-ink-faint"]
ACCENT, RULE = C["--c-accent"], C["--c-rule"]


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def inter(size, weight=400):
    f = ImageFont.truetype(str(FONTS / "Inter-Variable.ttf"), size)
    f.set_variation_by_axes([min(32, max(14, size / 3)), weight])
    return f


def mono(size):
    return ImageFont.truetype(str(FONTS / "JetBrainsMono-Regular.ttf"), size)


def tracked(d, xy, text, font, fill, tracking=0.0):
    """Letter-spaced text. PIL has no tracking, and the site's small
    uppercase labels are defined by theirs."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + tracking


def art_lines(name):
    return (ASCII / name).read_text(encoding="utf-8").rstrip("\n").split("\n")


def draw_art(img, lines, box, cell, colour, align="center"):
    """Render ASCII so its grid sits inside box = (x, y, w, h)."""
    font = mono(cell)
    adv = font.getlength("M")
    w = max(len(l) for l in lines) * adv
    h = len(lines) * cell
    x0 = box[0] + (box[2] - w) / 2 if align == "center" else box[0]
    y0 = box[1] + (box[3] - h) / 2
    d = ImageDraw.Draw(img)
    for r, line in enumerate(lines):
        for c, ch in enumerate(line):
            if ch != " ":
                d.text((x0 + c * adv, y0 + r * cell), ch, font=font, fill=colour)
    return (x0, y0, w, h)


def cell_for(lines, box_w, box_h):
    """Largest cell size at which the drawing still fits the box."""
    cols = max(len(l) for l in lines)
    rows = len(lines)
    return min(box_w / (cols * 0.6), box_h / rows)


# --------------------------------------------------------------------------
#  Builders
# --------------------------------------------------------------------------

def build_ascii_avatar(spec):
    size = spec["size"]
    img = Image.new("RGB", (size, size), BG)
    lines = art_lines(spec["art"])
    pad = size * spec.get("pad", 0.08)
    cell = cell_for(lines, size - 2 * pad, size - 2 * pad)
    draw_art(img, lines, (pad, pad, size - 2 * pad, size - 2 * pad), cell, spec["colour"])
    return img


def build_photo_avatar(spec):
    """A real photograph standing in front of the project's own source code.

    The cutout was flattened onto white, so alpha is recovered from distance
    to white with a soft edge -- a hard threshold leaves a white fringe
    around the hair, which is exactly where it is most visible.
    """
    size = spec["size"]
    img = Image.new("RGB", (size, size), BG)

    # Background: real lines from the repository, dim, clipped to the square.
    src = (ROOT / spec["code"]).read_text(encoding="utf-8").split("\n")
    code = [l.rstrip()[:52] for l in src if l.strip()][spec.get("skip", 0):]
    cell = spec.get("code_cell", 15)
    font = mono(cell)
    adv = font.getlength("M")
    d = ImageDraw.Draw(img)
    y = -cell
    i = 0
    while y < size:
        line = code[i % len(code)]
        x = -adv * 2
        while x < size:
            d.text((x, y), line, font=font, fill=mix(BG, FAINT, 0.38))
            x += adv * (len(line) + 3)
        y += cell * 1.5
        i += 1

    # Subject.
    photo = Image.open(spec["photo"]).convert("RGB")
    x0, y0, x1, y1 = spec["crop"]
    photo = photo.crop((int(x0 * photo.width), int(y0 * photo.height),
                        int(x1 * photo.width), int(y1 * photo.height)))
    a = np.asarray(photo, dtype=np.float64)
    dist = (255.0 - a).max(axis=2)                    # 0 on pure white
    alpha = np.clip((dist - 8.0) / 26.0, 0.0, 1.0)

    # Un-multiply the white. Every edge pixel in this cutout is already a
    # blend of the subject with the white it was flattened onto:
    #     observed = colour * alpha + 255 * (1 - alpha)
    # Taking alpha without inverting that leaves those pixels near-white and
    # still partly opaque, which composites as a pale halo around the hair
    # and shoulders. Solving for colour removes it.
    safe = np.maximum(alpha, 1e-3)[..., None]
    colour = np.clip((a - 255.0 * (1.0 - safe)) / safe, 0, 255)
    rgba = np.dstack([colour, alpha * 255]).astype(np.uint8)
    cut = Image.fromarray(rgba, "RGBA")

    # Centred, not bottom-anchored: the platforms crop this to a circle, and
    # a subject pushed to the bottom loses its shoulders to the arc.
    fill = spec.get("fill", 0.92)
    scale = size * fill / max(cut.width, cut.height)
    cut = cut.resize((max(1, round(cut.width * scale)),
                      max(1, round(cut.height * scale))), Image.LANCZOS)
    img.paste(cut, ((size - cut.width) // 2, (size - cut.height) // 2), cut)
    return img


def build_art_banner(spec):
    w, h = spec["size"]
    sx, sy, sw, sh = spec["safe"]
    img = Image.new("RGB", (w, h), BG)
    lines = art_lines(spec["art"])
    # The art gets its own box rather than filling the banner. A wide strip
    # cannot contain a galaxy whose long axis runs diagonally; placing the
    # whole object in a field of empty sky is both truer to the photograph
    # and a better composition than cropping through it.
    bx, by, bw, bh = spec.get("art_box", (0, 0, sw, sh))
    cell = cell_for(lines, bw, bh)
    draw_art(img, lines, (sx + bx, sy + by, bw, bh), cell, spec["colour"])

    d = ImageDraw.Draw(img)
    tx = sx + spec["text_x"]
    f_title = inter(spec.get("title_px", 46), 500)
    d.text((tx, sy + spec["text_y"]), spec["title"], font=f_title, fill=INK)
    f_sub = mono(spec.get("sub_px", 15))
    tracked(d, (tx + 2, sy + spec["text_y"] + spec.get("title_px", 46) + 18),
            spec["sub"], f_sub, MUTED, tracking=2.2)
    return img


def build_text_banner(spec):
    w, h = spec["size"]
    sx, sy, sw, sh = spec["safe"]
    s = spec.get("scale", 1.0)
    img = Image.new("RGB", (w, h), BG)

    px, py, pw, ph = spec["art_box"]
    draw_art(img, art_lines(spec["art"]), (sx + px, sy + py, pw, ph),
             spec["art_cell"], mix(FAINT, MUTED, 0.55))

    d = ImageDraw.Draw(img)
    x, y = sx + spec["text_x"], sy + spec["text_y"]
    tracked(d, (x, y), spec["kicker"], mono(int(15 * s)), MUTED, tracking=2.6 * s)
    y += int(38 * s)
    d.text((x, y), spec["title"], font=inter(int(76 * s), 500), fill=INK)
    y += int(96 * s)
    d.line([(x, y), (x + int(300 * s), y)], fill=RULE, width=1)
    y += int(26 * s)
    d.text((x, y), spec["line"], font=inter(int(26 * s), 400), fill=MUTED)
    tracked(d, (x, sy + sh - int(52 * s)), spec["foot"], mono(int(14 * s)),
            FAINT, tracking=1.4 * s)
    d.rectangle([x, sy + sh - int(70 * s), x + int(34 * s), sy + sh - int(68 * s)],
                fill=ACCENT)
    return img


# --------------------------------------------------------------------------
#  Targets
# --------------------------------------------------------------------------

TARGETS = {
    # GitHub crops avatars to a circle. Saturn's rings run diagonally, so
    # the drawing is taller than it is wide and sits inside the circle with
    # room at the sides, rather than being clipped through the ansae.
    "gh-avatar": dict(kind="ascii_avatar", size=800, art="saturn.txt",
                      colour=mix(ACCENT, INK, 0.3), pad=0.05),

    # Framed for a circle: chin, neck and shoulders inside the disc, rather
    # than a head floating with its jaw cut off at the bottom.
    "yt-avatar": dict(kind="ascii_avatar", size=800, art="portrait-avatar.txt",
                      colour=MUTED, pad=0.05),

    # LinkedIn keeps the real photograph, standing in front of the site's
    # own source.
    "li-avatar": dict(kind="photo_avatar", size=800,
                      photo="C:/Users/whizz/Desktop/8484.jpg",
                      # A square crop centred on the head. The subject runs off the right
                      # and bottom edges of the source, so the shoulder cannot be
                      # recovered -- this at least frames it symmetrically.
                      crop=(0.225, 0.0, 0.975, 1.0), fill=1.0,
                      code="scripts/ascii-reveal.js", skip=20, code_cell=15),

    # 2560x1440, but only the centre 1546x423 is shown on every device, so
    # the whole panel lives inside that box and the rest is plain ground.
    "yt-banner": dict(kind="art_banner", size=(2560, 1440), safe=(507, 508, 1546, 423),
                      art="zhiwy-panel.txt", colour=mix(MUTED, INK, 0.2),
                      art_box=(0, 0, 1546, 423),
                      text_x=0, text_y=-10_000,   # the panel carries its own type
                      title="", sub=""),

    # 1280x320, for the README of the repository named after the account --
    # GitHub has no profile banner of its own, and that README is what it
    # renders at the top of a profile.
    "gh-banner": dict(kind="art_banner", size=(1280, 320), safe=(0, 0, 1280, 320),
                      art="andromeda.txt", colour=mix(FAINT, MUTED, 0.78),
                      art_box=(190, 0, 520, 320),
                      text_x=790, text_y=126, title="David Marković", title_px=40,
                      sub="SOFTWARE ENGINEERING  /  ETF BELGRADE"),

    # 1584x396. The profile photo covers the bottom-left, so the caption
    # sits right of centre.
    "li-banner": dict(kind="art_banner", size=(1584, 396), safe=(0, 0, 1584, 396),
                      art="andromeda.txt", colour=mix(FAINT, MUTED, 0.75),
                      art_box=(300, 0, 620, 396),
                      text_x=1010, text_y=172, title="David Marković",
                      sub="M31  /  ANDROMEDA  /  MY OWN FRAME"),
}


def build(name):
    spec = TARGETS[name]
    img = {"ascii_avatar": build_ascii_avatar,
           "photo_avatar": build_photo_avatar,
           "art_banner": build_art_banner,
           "text_banner": build_text_banner}[spec["kind"]](spec)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    img.save(path, optimize=True)
    print(f"{name:12} {img.size[0]}x{img.size[1]:<5} {path.stat().st_size/1024:7.1f} KB"
          f"  -> {path.relative_to(ROOT)}")
    return img


def write_meta():
    """Record the tokens and art these images were baked from.

    A PNG keeps no memory of the stylesheet it came from. Once the palette
    moves, the brand images are silently stale -- still fine on their own,
    just no longer the same thing as the site. This lets a test notice.
    """
    import json
    meta = {
        "tokens": {k: "#%02x%02x%02x" % v for k, v in sorted(C.items())},
        "targets": {n: list(t["size"]) if isinstance(t["size"], tuple)
                       else [t["size"], t["size"]] for n, t in TARGETS.items()},
        "art": sorted({t["art"] for t in TARGETS.values() if "art" in t}),
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"{'meta':12} token and art snapshot written")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("target", nargs="?", choices=list(TARGETS) + ["all"], default="all")
    a = p.parse_args()
    for n in (list(TARGETS) if a.target == "all" else [a.target]):
        build(n)
    if a.target == "all":
        write_meta()
