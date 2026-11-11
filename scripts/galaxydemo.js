/* ==========================================================================
   GALAXY RESOLUTION DEMO
   Two controls: how much of the frame the galaxy fills, and what resolution
   the network gets. The readout is a measurement, not an impression --
   azimuthal contrast of the bar, computed offline by
   tools/make_galaxy_demo.py and looked up here.

   It is looked up rather than computed live because reading pixels back off
   a canvas that was drawn from a file:// image throws: the canvas is
   tainted. Drawing is fine, getImageData is not, and this page is opened
   off disk as often as it is served.
   ========================================================================== */

(() => {
  'use strict';

  let ui = null;
  let data = null;
  const cache = new Map();

  function readData() {
    if (data) return data;
    const el = document.getElementById('galaxy-framings');
    if (!el) return null;
    try { data = JSON.parse(el.textContent); } catch (e) { data = null; }
    return data;
  }

  function image(file) {
    if (cache.has(file)) return cache.get(file);
    const img = new Image();
    img.onload = () => paint();
    img.src = `assets/galaxy/${file}`;
    cache.set(file, img);
    return img;
  }

  function paint() {
    if (!ui) return;
    const f = data.framings[ui.framing];
    const res = data.res[ui.res];
    const img = image(f.file);

    const c = ui.canvas;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.clearRect(0, 0, c.width, c.height);

    if (img.complete && img.naturalWidth) {
      // Down to the network's input size on an offscreen canvas, then back
      // up with smoothing off, so what is on screen is literally the pixels
      // the model would have been handed.
      const small = ui.scratch;
      small.width = small.height = res;
      const sg = small.getContext('2d');
      sg.imageSmoothingEnabled = true;
      sg.drawImage(img, 0, 0, res, res);

      g.imageSmoothingEnabled = false;
      g.drawImage(small, 0, 0, c.width, c.height);
    }

    const pct = f.retained[res];
    ui.meterFill.style.width = `${pct}%`;
    ui.meterFill.classList.toggle('is-low', pct < 75);
    ui.readout.textContent = `${pct}%`;
    ui.caption.textContent =
      `${f.label} · ${res}×${res} input · bar contrast ${pct}% of best`;
    ui.labelFraming.textContent = f.label;
    ui.labelRes.textContent = `${res}×${res}`;
  }

  function mount(root) {
    if (!readData()) return;
    const q = (s) => root.querySelector(s);
    const canvas = q('[data-gx-canvas]');
    if (!canvas) return;

    ui = {
      canvas,
      scratch: document.createElement('canvas'),
      framing: 0,
      res: data.res.indexOf(96) >= 0 ? data.res.indexOf(96) : 0,
      readout: q('[data-gx-readout]'),
      meterFill: q('[data-gx-meter]'),
      caption: q('[data-gx-caption]'),
      labelFraming: q('[data-gx-label-framing]'),
      labelRes: q('[data-gx-label-res]'),
    };

    const sf = q('[data-gx-framing]');
    sf.max = String(data.framings.length - 1);
    sf.value = String(ui.framing);
    sf.addEventListener('input', () => { ui.framing = +sf.value; paint(); });

    const sr = q('[data-gx-res]');
    sr.max = String(data.res.length - 1);
    sr.value = String(ui.res);
    sr.addEventListener('input', () => { ui.res = +sr.value; paint(); });

    // Warm every framing so dragging the slider does not flash.
    data.framings.forEach((f) => image(f.file));
    paint();
  }

  document.addEventListener('overlay:open', (e) => {
    ui = null;
    if (e.detail.key === 'demo-galaxy') mount(e.detail.content);
  });
  document.addEventListener('overlay:close', () => { ui = null; });
})();
