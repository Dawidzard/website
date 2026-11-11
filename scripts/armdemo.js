/* ==========================================================================
   ARM CONTROL PANEL
   The world-model project, playable. Pick a scene, command a direction, and
   watch what the model predicted -- every branch starting from the same real
   context with the same noise, so the only thing that differs is the action.

   Two loading decisions worth knowing about.

   1. No fetch(). The page is opened straight off disk as often as it is
      served, and fetch() on a file:// URL is blocked as a cross-origin
      request. An <img> is not, so frames arrive as images and the manifest
      is inlined in the document. Drawing a file:// image onto a canvas
      taints it, which would matter only if we read pixels back -- we never
      do.

   2. Nothing loads until the demo is opened. The four sprite sheets are
      1.25 MB together; making the landing page carry that so a button can
      exist would be a poor trade.
   ========================================================================== */

(() => {
  'use strict';

  const FRAME_MS = 90;        // the original panel's playback rate
  const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left',
                   ArrowRight: 'right', ' ': 'still' };

  let manifest = null;
  const sheets = new Map();   // scene id -> HTMLImageElement
  let ui = null;              // the live demo's elements, or null when closed

  function readManifest() {
    if (manifest) return manifest;
    const el = document.getElementById('armdemo-manifest');
    if (!el) return null;
    try { manifest = JSON.parse(el.textContent); } catch (e) { manifest = null; }
    return manifest;
  }

  function loadSheet(scene) {
    if (sheets.has(scene)) return Promise.resolve(sheets.get(scene));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { sheets.set(scene, img); resolve(img); };
      img.onerror = () => reject(new Error(`scene ${scene} failed to load`));
      img.src = `assets/armdemo/scene-${scene}.${manifest.ext}`;
    });
  }

  /* --- Drawing ----------------------------------------------------------- */

  function drawTile(index) {
    const { tile, cols } = manifest;
    const img = sheets.get(ui.scene);
    if (!img) return;
    ui.ctx.drawImage(img,
      (index % cols) * tile, Math.floor(index / cols) * tile, tile, tile,
      0, 0, tile, tile);
  }

  /** Play [offset, count] frames, then call done. */
  function play(range, done) {
    const [offset, count] = range;
    let k = 0;
    ui.busy = true;
    (function tick() {
      if (!ui) return;                       // the overlay closed mid-play
      if (k >= count) { ui.busy = false; if (done) done(); return; }
      drawTile(offset + k++);
      ui.timer = setTimeout(tick, FRAME_MS);
    })();
  }

  function sceneData() { return manifest.scenes[ui.scene]; }

  function showContext() {
    setStatus(`scene ${ui.scene} &middot; real context`);
    play(sceneData().context);
  }

  function setStatus(htmlText) {
    if (ui && ui.status) ui.status.innerHTML = htmlText;
  }

  /* --- Commands ---------------------------------------------------------- */

  function act(action) {
    if (!ui || ui.busy) return;
    ui.pad.forEach((b) => b.classList.toggle('is-on', b.dataset.action === action));
    setStatus(`action <b>${action.toUpperCase()}</b> &middot; 16 generated frames `
            + `&middot; <span class="demo__branch">branched from the same context</span>`);
    play(sceneData().anchored[action]);
  }

  function freeRollout() {
    if (!ui || ui.busy) return;
    const chain = sceneData().chain;
    let i = 0;
    (function next() {
      if (!ui) return;
      if (i >= chain.length) {
        setStatus('free rollout ended &middot; <span class="demo__warn">position and '
                + 'image quality degrade; direction accuracy does not</span>');
        return;
      }
      const block = chain[i];
      setStatus(`free rollout &middot; block ${i + 1}/${chain.length} `
              + `&middot; <b>${block.action.toUpperCase()}</b>`
              + (i > 0 ? ' &middot; <span class="demo__warn">context is the model&rsquo;s '
                       + 'own output</span>' : ''));
      i++;
      play(block.range, next);
    })();
  }

  function selectScene(scene) {
    if (!ui || ui.busy) return;
    ui.scene = scene;
    ui.sceneBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.scene === scene));
    setStatus(`loading scene ${scene}&hellip;`);
    loadSheet(scene).then(showContext).catch((e) => setStatus(String(e.message)));
  }

  /* --- Wiring ------------------------------------------------------------ */

  function onKey(e) {
    if (!ui || !ARROWS[e.key]) return;
    e.preventDefault();
    act(ARROWS[e.key]);
  }

  function mount(root) {
    if (!readManifest()) return;

    const canvas = root.querySelector('[data-demo-canvas]');
    if (!canvas) return;

    const ids = Object.keys(manifest.scenes);
    ui = {
      root,
      ctx: canvas.getContext('2d'),
      status: root.querySelector('[data-demo-status]'),
      pad: [...root.querySelectorAll('[data-action]')],
      sceneBtns: [],
      scene: ids[0],
      busy: false,
      timer: null,
    };

    // Scene buttons are generated: the manifest decides how many there are.
    const strip = root.querySelector('[data-demo-scenes]');
    ids.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'demo__chip';
      b.dataset.scene = id;
      b.textContent = `scene ${id}`;
      b.addEventListener('click', () => selectScene(id));
      strip.appendChild(b);
      ui.sceneBtns.push(b);
    });

    ui.pad.forEach((b) => b.addEventListener('click', () => act(b.dataset.action)));
    const chain = root.querySelector('[data-demo-chain]');
    if (chain) chain.addEventListener('click', freeRollout);

    document.addEventListener('keydown', onKey);
    selectScene(ui.scene);
  }

  function unmount() {
    if (!ui) return;
    if (ui.timer) clearTimeout(ui.timer);
    document.removeEventListener('keydown', onKey);
    ui = null;
  }

  // The overlay announces what it just put on screen; everything else about
  // this module stays out of its way.
  document.addEventListener('overlay:open', (e) => {
    unmount();
    if (e.detail.key === 'demo') mount(e.detail.content);
  });
  document.addEventListener('overlay:close', unmount);
})();
