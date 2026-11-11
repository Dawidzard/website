"""Cut a subject out of a photograph with a real background.

    python tools/cutout.py photo.jpg assets/photo/portrait.png

The earlier portraits were supplied already flattened onto a flat colour,
which a colour key or a flood fill can undo. A photograph of a room cannot
be separated that way at all -- there is no key, and the wall behind a head
is not reliably different from a shoulder. This runs a segmentation model
instead and writes a PNG that carries real alpha, so everything downstream
can simply composite it.

The matte is refined a little before use: the model's edge is confident but
slightly hard, and a hard edge over a dark background reads as a cut-out
sticker. Eroding by a fraction of a pixel and feathering gives it back the
softness a lens had.
"""
import argparse
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter


def main():
    p = argparse.ArgumentParser()
    p.add_argument("source")
    p.add_argument("out")
    p.add_argument("--work", type=int, default=1600,
                   help="longest side fed to the model; the matte is scaled back up")
    p.add_argument("--feather", type=float, default=1.1)
    p.add_argument("--shrink", type=float, default=0.6,
                   help="pixels to pull the matte in, to lose the background fringe")
    a = p.parse_args()

    try:
        from rembg import remove, new_session
    except ImportError:
        sys.exit("rembg is not installed:  pip install rembg onnxruntime")

    src = Image.open(a.source).convert("RGB")
    scale = a.work / max(src.size)
    small = src.resize((round(src.width * scale), round(src.height * scale)),
                       Image.LANCZOS) if scale < 1 else src

    session = new_session("u2net")
    cut = remove(small, session=session).convert("RGBA")

    # Take only the matte from the model and re-apply it to the full-size
    # image, so the output keeps the photograph's own resolution.
    alpha = cut.split()[-1].resize(src.size, Image.LANCZOS)
    alpha = alpha.filter(ImageFilter.GaussianBlur(a.feather))

    arr = np.asarray(alpha, dtype=np.float64) / 255.0
    if a.shrink:
        # Pull the edge in: the matte tends to keep a rim of wall colour,
        # which against a dark background shows as a bright outline.
        arr = np.clip((arr - a.shrink / 10.0) / (1.0 - a.shrink / 10.0), 0, 1)

    out = Image.fromarray(
        np.dstack([np.asarray(src, dtype=np.uint8),
                   (arr * 255).astype(np.uint8)]), "RGBA")

    path = pathlib.Path(a.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path)

    ys, xs = np.nonzero(arr > 0.5)
    print(f"{path}  {out.size[0]}x{out.size[1]}  "
          f"{path.stat().st_size/1024:.0f} KB")
    print(f"subject occupies {100*(arr > 0.5).mean():.0f}% of the frame, "
          f"bbox x {xs.min()}-{xs.max()} y {ys.min()}-{ys.max()}")


if __name__ == "__main__":
    main()
