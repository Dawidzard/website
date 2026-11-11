"""Prepare the Galaxy Zoo demo: four framings, and the measurement.

The project's report blames the 96x96 input for barred spirals being its
weakest class. Measuring that on a real barred spiral says something more
specific, and the demo is built around what the numbers actually support.

At 96x96 the bar survives perfectly well -- IF the galaxy fills the frame.
What destroys it is the galaxy being small WITHIN the frame, which is what
a more distant or physically smaller one looks like in a fixed-size cutout.
So the variable is not the input size on its own but how many pixels land
across the galaxy, and the demo lets both be moved.

The measurement is azimuthal contrast: sample brightness around a circle at
the bar's radius and take (max - min) / (max + min). A bar makes brightness
at a fixed radius depend strongly on angle; once it smears into the bulge,
it does not. Two earlier attempts are recorded in the history as warnings --
gradient energy measures edge strength, which a bright blob has whether or
not it is bar-shaped, and measuring it after a nearest-neighbour restore
measures blockiness instead of detail.

The subject is David's own photograph of NGC 2903, a barred spiral. It is
NOT a Galaxy Zoo 2 frame; the classifier never saw it. The demo says so.
"""
import json
import pathlib

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = "E:/astro/ngc2903.png"
CENTRE = (0.540, 0.479)        # measured from the frame
MASTER = 512
RES = [512, 256, 160, 96, 64]

# Crop fraction -> how much of the frame the galaxy takes up. A wider crop
# is the same galaxy seen smaller, which is the thing being varied.
FRAMINGS = [
    (0.05, "fills the frame"),
    (0.10, "half the frame"),
    (0.18, "a third"),
    (0.30, "a fifth"),
]

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/galaxy"


def azimuthal_contrast(arr, radii):
    m = arr.shape[0]
    c = m / 2
    ang = np.linspace(0, 2 * np.pi, 180, endpoint=False)
    out = []
    for r in radii:
        xs = np.clip((c + r * np.cos(ang)).astype(int), 0, m - 1)
        ys = np.clip((c + r * np.sin(ang)).astype(int), 0, m - 1)
        v = arr[ys, xs].astype(float)
        if v.max() + v.min() > 0:
            out.append((v.max() - v.min()) / (v.max() + v.min()))
    return float(np.mean(out))


def main():
    im = Image.open(SRC).convert("RGB")
    cx, cy = int(CENTRE[0] * im.width), int(CENTRE[1] * im.height)
    OUT.mkdir(parents=True, exist_ok=True)

    framings = []
    for i, (frac, label) in enumerate(FRAMINGS):
        half = int(frac * im.height)
        master = im.crop((cx - half, cy - half, cx + half, cy + half)) \
                   .resize((MASTER, MASTER), Image.LANCZOS)
        name = f"ngc2903-{i}.webp"
        master.save(OUT / name, quality=92, method=6)

        # The bar subtends the same angle on the sky, so its radius in the
        # crop scales with how tightly we framed it.
        scale = FRAMINGS[0][0] / frac
        radii = [max(4, int(r * scale)) for r in range(14, 46, 4)]
        ref = azimuthal_contrast(np.asarray(master.convert("L")), radii)

        row = {}
        for n in RES:
            back = np.asarray(master.resize((n, n), Image.LANCZOS)
                                    .resize((MASTER, MASTER), Image.BILINEAR)
                                    .convert("L"))
            row[n] = round(100 * azimuthal_contrast(back, radii) / ref)
        framings.append({"file": name, "label": label, "retained": row})
        kb = (OUT / name).stat().st_size / 1024
        print(f"  {label:<18} {name}  {kb:5.1f} KB   " +
              "  ".join(f"{n}:{row[n]}%" for n in RES))

    data = {"master": MASTER, "res": RES, "framings": framings}
    (OUT / "framings.json").write_text(json.dumps(data), encoding="utf-8")
    print(f"\nframings.json written, {len(framings)} framings x {len(RES)} resolutions")


if __name__ == "__main__":
    main()
