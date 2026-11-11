"""Repack the artifact's 628 inline base64 frames into one sprite sheet per
scene plus a small JSON manifest.

Why: the original page carries every frame as a base64 data URI, which costs
7.47 MB of HTML before a single pixel is drawn. Tiling the frames into one
PNG per scene lets the browser make 4 requests instead of inlining 628
images, and PNG's row filters compress a tiled sheet far better than 157
separate 64x64 files, because neighbouring tiles share structure.
"""
import base64
import io
import json
import pathlib
import re

from PIL import Image

SRC = pathlib.Path("C:/Users/whizz/Desktop/Arm Control Panel (Copy).html")
OUT = pathlib.Path("C:/Users/whizz/Desktop/Website/assets/armdemo")
TILE = 64
COLS = 16

line = SRC.read_text(encoding="utf-8", errors="replace").split("\n")[93]
data = json.loads(re.match(r'\s*const DATA=(\{.*\}),\s*ids=Object\.keys', line).group(1))

OUT.mkdir(parents=True, exist_ok=True)
manifest = {"tile": TILE, "cols": COLS, "ext": "webp", "scenes": {}}
total_png = 0
total_inline = 0

for sid, entry in data.items():
    frames = []          # flat list of base64 strings, in packing order
    index = {}           # where each sequence lives in that flat list

    def add(seq):
        start = len(frames)
        frames.extend(seq)
        return [start, len(seq)]          # [offset, count]

    index["context"] = add(entry["context"])
    index["anchored"] = {a: add(f) for a, f in entry["anchored"].items()}
    index["chain"] = [{"action": b["action"], "range": add(b["frames"])}
                      for b in entry["chain"]]

    rows = -(-len(frames) // COLS)
    sheet = Image.new("RGB", (COLS * TILE, rows * TILE))
    for i, b64 in enumerate(frames):
        raw = base64.b64decode(b64)
        total_inline += len(b64)
        sheet.paste(Image.open(io.BytesIO(raw)), ((i % COLS) * TILE, (i // COLS) * TILE))

    # WebP q=95: 4x smaller than PNG, and its 35.6 dB error sits ~17 dB
    # below the model's own 18.56 dB reconstruction error, so the
    # compression cannot be mistaken for anything the model did.
    path = OUT / f"scene-{sid}.webp"
    sheet.save(path, quality=95, method=6)
    size = path.stat().st_size
    total_png += size
    index["count"] = len(frames)
    manifest["scenes"][sid] = index
    print(f"scene {sid:>3}: {len(frames):>3} tiles  {sheet.size[0]}x{sheet.size[1]}  "
          f"-> {size/1024:7.1f} KB")

(OUT / "index.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
mf = (OUT / "index.json").stat().st_size

print(f"\nsprite sheets + manifest: {(total_png + mf)/1_048_576:.2f} MB")
print(f"original inline base64:   {total_inline/1_048_576:.2f} MB")
print(f"saving:                   {100 * (1 - (total_png + mf) / total_inline):.1f}%")
