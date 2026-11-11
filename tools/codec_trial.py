"""Pick a codec for the demo sheets on evidence, not vibes.

The demo's whole claim is a ~7 px gripper displacement on a 64 px frame, so a
codec that smooths that away destroys the thing being demonstrated. Measure
both size and fidelity (PSNR against the original PNG tiles) before choosing.
"""
import base64
import io
import json
import pathlib
import re

import numpy as np
from PIL import Image

SRC = pathlib.Path("C:/Users/whizz/Desktop/Arm Control Panel (Copy).html")
TMP = pathlib.Path(__file__).parent / "codec"
TMP.mkdir(exist_ok=True)
TILE, COLS = 64, 16

line = SRC.read_text(encoding="utf-8", errors="replace").split("\n")[93]
data = json.loads(re.match(r'\s*const DATA=(\{.*\}),\s*ids=Object\.keys', line).group(1))

# Build one scene's sheet as the reference.
sid = "3"
e = data[sid]
frames = list(e["context"])
for a in e["anchored"].values():
    frames.extend(a)
for b in e["chain"]:
    frames.extend(b["frames"])

rows = -(-len(frames) // COLS)
ref = Image.new("RGB", (COLS * TILE, rows * TILE))
for i, b64 in enumerate(frames):
    ref.paste(Image.open(io.BytesIO(base64.b64decode(b64))),
              ((i % COLS) * TILE, (i // COLS) * TILE))
ref_arr = np.asarray(ref, dtype=np.float64)


def psnr(other):
    mse = np.mean((ref_arr - np.asarray(other, dtype=np.float64)) ** 2)
    return float("inf") if mse == 0 else 10 * np.log10(255.0 ** 2 / mse)


trials = [
    ("png  optimize", dict(format="PNG", optimize=True)),
    ("webp lossless", dict(format="WEBP", lossless=True, method=6)),
    ("webp q=95", dict(format="WEBP", quality=95, method=6)),
    ("webp q=90", dict(format="WEBP", quality=90, method=6)),
    ("webp q=80", dict(format="WEBP", quality=80, method=6)),
]

print(f"scene {sid}: {len(frames)} tiles, {ref.size[0]}x{ref.size[1]}\n")
print(f"{'codec':16}{'size':>10}{'PSNR vs original':>20}")
for name, kw in trials:
    buf = io.BytesIO()
    ref.save(buf, **kw)
    buf.seek(0)
    got = Image.open(buf).convert("RGB")
    p = psnr(got)
    tag = "lossless" if p == float("inf") else f"{p:.2f} dB"
    print(f"{name:16}{len(buf.getvalue())/1024:9.1f} KB{tag:>20}")
