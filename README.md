# davidmarkovic — personal site

A portfolio built by hand: no framework, no build step, no dependencies at
runtime. Open `index.html` and it works, from a server or straight off disk.

## What is here

```
index.html          the whole page
styles/
  tokens.css        every colour, size and spacing value the site uses
  base.css          reset and bare-element defaults
  layout.css        components
scripts/
  ascii-reveal.js   ASCII art condensing out of noise
  overlay.js        one dialog, reused; its frame is marching characters
  armdemo.js        the world model, playable
  toolchain.js      assembler, linker and CPU emulator
  scheduler.js      the kernel's FCFS queue, time slice and semaphore
  vmexit.js         guest, exit, monitor
  *-ui.js           the panels that drive the four above
tools/              Python: ASCII generation, brand images, demo assets
tests/              node tests/run.js
assets/             art, fonts, demo frames, profile images
```

## Two ideas the code keeps coming back to

**ASCII art is a character grid, not a picture.** Line height is exactly 1,
nothing wraps, and the font size is *solved* rather than chosen:

```
font-size = container width / (columns * 0.6)
```

0.6 being JetBrains Mono's advance. A drawing can then never be wider than its
box, which is why no ASCII block on the page needs a scrollbar.

**Simulation logic never touches the DOM.** The assembler, the scheduler and the
vm-exit model are plain modules with their own tests, and a separate file draws
them. That split exists because a visualisation is extremely good at looking
correct: it can animate mutual exclusion convincingly while not enforcing it, or
play the wrong sprite-sheet frames without erroring. The tests assert the
properties instead — that the semaphore is never held twice, that a relocation
gets the right address, that the guest runs hundreds of instructions per exit.

## Running the tests

```bash
node tests/run.js
```

No framework; each file exits non-zero on failure. `tests/guards.test.js` is the
static one — it checks that every CSS variable resolves, every class has a rule,
every overlay trigger has a template, the JSON-LD parses, and that each ASCII
block's column count matches the divisor sizing it.

## Regenerating the art

```bash
python tools/img2ascii.py photo.jpg --width 100 > art.txt   # image to ASCII
python tools/calibrate_ramp.py                              # measure a density ramp
python tools/make_brand.py                                  # avatars and banners
python tools/preview_ascii.py art.txt out.png               # see it as the page will
```

`calibrate_ramp.py` exists because the obvious ramp is not one. Rasterised,
`" .:-=+*oOX#%@"` runs 3, 6, 4, 12, 12, 16, 19, 24, 22, 24, 26, 29 percent ink —
two inversions, two ties, and only ten points of range across its top half. The
tool measures each glyph in the real font and picks an evenly spaced subset.
