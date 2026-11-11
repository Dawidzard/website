"""Rebuild the Zhiwy channel banner as one ASCII drawing.

The original is a flat-vector panel: a window strip labelled Zhiwy.txt, the
logo tile, three tags reading LIKE / SHARE / SUBSCRIBE feeding a speech
bubble full of binary, and YOU ARE A FAN on the far side. The composition
is kept; only the medium changes.

The binary is the original's, unchanged -- it decodes to "Decoding the
World!", which is the joke, so re-encoding anything else would throw the
joke away.

Laid out by code rather than by hand: a box at the wrong column is obvious
at a glance and tedious to fix in a text editor, while here the geometry is
computed once and every edge lines up by construction.
"""
import pathlib

COLS, ROWS = 168, 18

MESSAGE = "Decoding the World!"
BITS = " ".join(format(ord(c), "08b") for c in MESSAGE)


class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [[" "] * w for _ in range(h)]

    def put(self, x, y, s):
        if not (0 <= y < self.h):
            return
        for i, ch in enumerate(s):
            if 0 <= x + i < self.w:
                self.g[y][x + i] = ch

    def box(self, x, y, w, h, label=None):
        self.put(x, y, "+" + "-" * (w - 2) + "+")
        for r in range(y + 1, y + h - 1):
            self.put(x, r, "|")
            self.put(x + w - 1, r, "|")
        self.put(x, y + h - 1, "+" + "-" * (w - 2) + "+")
        if label:
            self.put(x + (w - len(label)) // 2, y + h // 2, label)

    def hline(self, x, y, w, ch="-"):
        self.put(x, y, ch * w)

    def arrow(self, x, y, w):
        """A run of dashes ending in a head, pointing right."""
        self.put(x, y, "-" * max(0, w - 1) + ">")

    def render(self):
        return "\n".join("".join(r).rstrip() for r in self.g)


g = Grid(COLS, ROWS)

# --- window strip ---------------------------------------------------------
g.put(2, 0, "( ) ( ) ( )")
g.hline(16, 0, COLS - 16 - 12)
g.put(COLS - 10, 0, "Zhiwy.txt")

# --- logo tile ------------------------------------------------------------
LX, LY, LW, LH = 4, 3, 26, 13


def centre(x, w, s):
    """Centre a string inside a box, so a label never sits a column off."""
    return x + (w - len(s)) // 2


g.box(LX, LY, LW, LH)
for i, mark in enumerate(("<=|=|=|=>", " |  |  | ")):
    g.put(centre(LX, LW, mark), LY + 4 + i, mark)
g.put(centre(LX, LW, "Z H I W Y"), LY + 8, "Z H I W Y")

# --- the three tags -------------------------------------------------------
TX, TW = 36, 15
tags = [("LIKE", 5), ("SHARE", 9), ("SUBSCRIBE", 13)]
for label, row in tags:
    g.box(TX, row - 1, TW, 3, label)

# A bus: the three tags join one vertical spine, and the spine feeds the
# bubble. Only the spine's middle row carries an arrowhead -- drawing one
# on each branch made it read as three arrows colliding.
SPINE = TX + TW + 5
for label, row in tags:
    g.put(TX + TW, row, "-" * (SPINE - TX - TW))
for r in range(tags[0][1], tags[-1][1] + 1):
    g.put(SPINE, r, "|")
for _, row in tags:
    g.put(SPINE, row, "+")

# --- the bubble -----------------------------------------------------------
BX = SPINE + 5
bits_rows = [BITS[i:i + 35] for i in range(0, len(BITS), 36)]
BW = 41
BH = len(bits_rows) + 4
BY = tags[1][1] - BH // 2
BY = max(2, BY)
g.arrow(SPINE + 1, tags[1][1], BX - SPINE - 1)
g.box(BX, BY, BW, BH)
g.put(BX + 2, BY + 1, '"')
for i, line in enumerate(bits_rows):
    g.put(BX + 3, BY + 2 + i, line)
g.put(BX + BW - 3, BY + BH - 2, '"')

# --- the verdict ----------------------------------------------------------
VX = BX + BW + 6
g.arrow(BX + BW, tags[1][1], VX - (BX + BW))
g.box(VX, tags[1][1] - 2, 21, 5, "YOU ARE A FAN")

# --- footer ---------------------------------------------------------------
g.put(4, ROWS - 1, "@itsZhiwy   ·   AI / COMPUTING / ENGINEERING   ·   David Marković")

art = g.render()
rows = art.split("\n")
width = max(len(r) for r in rows)
assert width <= COLS, f"{width} columns, over the {COLS} grid"

out = pathlib.Path(__file__).resolve().parent.parent / "assets/ascii/zhiwy-panel.txt"
out.write_text(art + "\n", encoding="utf-8")
print(f"{len(rows)} rows x {width} cols -> {out.name}")
print(f"binary decodes to: {MESSAGE!r} ({len(BITS)} chars over {len(bits_rows)} lines)")
