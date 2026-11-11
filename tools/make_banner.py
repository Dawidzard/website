"""Profile banners for LinkedIn, YouTube and GitHub, built from the site.

    python tools/make_banner.py            # all three
    python tools/make_banner.py linkedin

Consistency here is not an approximation: the colours are read out of
styles/tokens.css, the type is the same Inter and JetBrains Mono the page
loads, and the portrait is the same ASCII art file the hero renders. Change
a token and re-run, and the banners follow.

Canvas sizes and their traps:

  LinkedIn  1584x396. The profile photo is laid over the bottom-left corner,
            so nothing that must be read goes there.
  YouTube   2560x1440, but only the centre 1546x423 is visible on every
            device. Everything legible lives inside that box; the rest of
            the canvas exists because TV layouts crop outwards from it.
  GitHub    1280x320. GitHub has no profile banner of its own -- this is for
            the README of the repository named after the account, which
            renders at the top of the profile.
"""
import argparse
import pathlib
import re

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets/fonts"
ASCII = ROOT / "assets/ascii"
OUT = ROOT / "assets/banners"


def tokens():
    """Read the palette straight out of the stylesheet, so a banner can never
    drift away from the site it is supposed to match."""
    css = (ROOT / "styles/tokens.css").read_text(encoding="utf-8")
    found = dict(re.findall(r"(--c-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})", css))
    return {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in found.items()}


C = tokens()
BG, INK, MUTED, FAINT = C["--c-bg"], C["--c-ink"], C["--c-ink-muted"], C["--c-ink-faint"]
ACCENT, RULE = C["--c-accent"], C["--c-rule"]


def inter(size, weight=400):
    f = ImageFont.truetype(str(FONTS / "Inter-Variable.ttf"), size)
    f.set_variation_by_axes([min(32, max(14, size / 3)), weight])
    return f


def mono(size):
    return ImageFont.truetype(str(FONTS / "JetBrainsMono-Regular.ttf"), size)


def tracked(d, xy, text, font, fill, tracking=0.0):
    """Draw text with letter-spacing. PIL has no tracking, and the site's
    small uppercase labels are defined by theirs, so it is done by hand."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + tracking
    return x - xy[0]


def tracked_width(text, font, tracking=0.0):
    return sum(font.getlength(c) + tracking for c in text) - tracking


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def draw_ascii(img, art_file, box, cell, colour):
    """Render an ASCII file so its grid is centred in `box` = (x, y, w, h)."""
    art = (ASCII / art_file).read_text(encoding="utf-8").rstrip("\n").split("\n")
    font = mono(cell)
    adv = font.getlength("M")
    w = max(len(l) for l in art) * adv
    h = len(art) * cell
    x0 = box[0] + (box[2] - w) / 2
    y0 = box[1] + (box[3] - h) / 2
    d = ImageDraw.Draw(img)
    for r, line in enumerate(art):
        for c, ch in enumerate(line):
            if ch != " ":
                d.text((x0 + c * adv, y0 + r * cell), ch, font=font, fill=colour)


TARGETS = {
    "linkedin": dict(
        size=(1584, 396),
        safe=(0, 0, 1584, 396),
        # The avatar covers the bottom-left, so the text block sits high and
        # the portrait sits far right, clear of it.
        # The profile photo covers roughly the left 250 px and the lower
        # 140 px. Everything starts to the right of it.
        text_x=330, text_top=78, scale=1.0, portrait_cell=8,
        portrait_box=(1110, 0, 420, 396),
        title="David Marković",
        kicker="SOFTWARE ENGINEERING  /  ETF BELGRADE",
        line="Machine learning, and the systems that run it.",
        foot="github.com/Dawidzard     ·     youtube.com/@itsZhiwy",
    ),
    "youtube": dict(
        size=(2560, 1440),
        safe=(507, 508, 1546, 423),   # the only region every device shows
        text_x=80, text_top=92, scale=1.0, portrait_cell=8,
        portrait_box=(1100, 0, 420, 423),
        title="Zhiwy",
        kicker="AI  /  COMPUTING  /  ENGINEERING",
        line="Trying things, making stuff.",
        foot="David Marković     ·     @itsZhiwy",
    ),
    "github": dict(
        size=(1280, 320),
        safe=(0, 0, 1280, 320),
        text_x=72, text_top=74, scale=0.8, portrait_cell=6,
        portrait_box=(900, 0, 340, 320),
        title="David Marković",
        kicker="@DAWIDZARD  /  ETF BELGRADE",
        line="Machine learning, and the systems that run it.",
        foot="linkedin.com/in/david-markovic     ·     youtube.com/@itsZhiwy",
    ),
}


def build(name):
    t = TARGETS[name]
    img = Image.new("RGB", t["size"], BG)
    sx, sy, sw, sh = t["safe"]
    s = t["scale"]

    # The portrait, dim so the type stays dominant.
    px, py, pw, ph = t["portrait_box"]
    draw_ascii(img, "portrait-64.txt", (sx + px, sy + py, pw, ph),
               t["portrait_cell"], mix(FAINT, MUTED, 0.55))

    d = ImageDraw.Draw(img)
    x = sx + t["text_x"]
    y = sy + t["text_top"]

    f_kick = mono(int(15 * s))
    tracked(d, (x, y), t["kicker"], f_kick, MUTED, tracking=2.6 * s)
    y += int(38 * s)

    f_title = inter(int(76 * s), 500)
    d.text((x, y), t["title"], font=f_title, fill=INK)
    y += int(96 * s)

    # The same hairline the site puts under every section heading.
    d.line([(x, y), (x + int(300 * s), y)], fill=RULE, width=1)
    y += int(26 * s)

    f_line = inter(int(26 * s), 400)
    d.text((x, y), t["line"], font=f_line, fill=MUTED)

    f_foot = mono(int(14 * s))
    tracked(d, (x, sy + sh - int(52 * s)), t["foot"], f_foot, FAINT, tracking=1.4 * s)

    # A single accent mark, bottom-left of the safe box: the one warm note.
    d.rectangle([x, sy + sh - int(70 * s), x + int(34 * s), sy + sh - int(68 * s)],
                fill=ACCENT)

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    img.save(path, optimize=True)
    print(f"{name:9} {t['size'][0]}x{t['size'][1]}  "
          f"{path.stat().st_size / 1024:6.1f} KB  -> {path.relative_to(ROOT)}")
    return img


def write_meta():
    """Record which token values these images were baked from.

    A PNG carries no memory of the stylesheet it came from, so once the
    palette moves the banners are silently stale -- they still look fine on
    their own, just no longer like the site. This sidecar lets a test notice.
    """
    import json
    meta = {
        "tokens": {k: "#%02x%02x%02x" % v for k, v in sorted(C.items())},
        "targets": {n: list(t["size"]) for n, t in TARGETS.items()},
        "portrait": "portrait-64.txt",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"{'meta':9} token snapshot written")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("target", nargs="?", choices=list(TARGETS) + ["all"], default="all")
    a = p.parse_args()
    names = list(TARGETS) if a.target == "all" else [a.target]
    for n in names:
        build(n)
    if a.target == "all":
        write_meta()
