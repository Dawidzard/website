/* ==========================================================================
   OVERLAY
   One dialog element, reused for project detail, the CV and the demo.
   Content comes from a <template id="tpl-KEY"> chosen by the opener's
   data-overlay="KEY".

   The frame around it is built from real characters that travel around the
   perimeter, not a glowing CSS border.
   ========================================================================== */

(() => {
  'use strict';

  const overlay = document.getElementById('overlay');
  if (!overlay) return;

  const panel = overlay.querySelector('.overlay__panel');
  const border = overlay.querySelector('.overlay__border');
  const content = overlay.querySelector('.overlay__content');
  const closeBtn = overlay.querySelector('.overlay__close');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Travels clockwise. No spaces: a pattern with gaps renders as a BROKEN
  // frame rather than a moving one, because at any instant whole runs of the
  // perimeter are simply missing. Every cell stays lit and the motion comes
  // from glyph weight instead -- a bright pulse sliding along a continuous
  // line. Densities here are the measured ones from calibrate_ramp.py:
  // '.' 3%, ':' 6%, '-' 4%, '=' 12%, '#' 18%, '%' 20%.
  const PATTERN = '..::--==##%%##==--::';
  const STEP_MS = 90;

  // Must match .overlay__border in the stylesheet.
  const CELL_H = 12;
  const CELL_W = 12 * 0.6;

  let opener = null;
  let timer = null;
  let offset = 0;
  // Open-state is tracked here rather than read back off the DOM. Reading
  // it from the element means a styling mistake can convince the close
  // handler that the dialog is already shut while the user is looking at
  // it -- which is precisely how this became unclosable once.
  let isOpen = false;

  /* --- The marching frame ------------------------------------------------ */

  function drawBorder() {
    const w = panel.clientWidth;
    const h = panel.clientHeight;
    const cols = Math.max(2, Math.floor(w / CELL_W));
    const rows = Math.max(2, Math.floor(h / CELL_H));

    // Start from a blank grid and light only the perimeter. Walking the
    // perimeter in one continuous clockwise order is what lets a single
    // offset make the whole frame appear to rotate.
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '));
    const ring = [];
    for (let c = 0; c < cols; c++) ring.push([0, c]);
    for (let r = 1; r < rows; r++) ring.push([r, cols - 1]);
    for (let c = cols - 2; c >= 0; c--) ring.push([rows - 1, c]);
    for (let r = rows - 2; r >= 1; r--) ring.push([r, 0]);

    ring.forEach(([r, c], i) => {
      grid[r][c] = PATTERN[(i + offset) % PATTERN.length];
    });

    border.textContent = grid.map((row) => row.join('')).join('\n');
  }

  function startBorder() {
    drawBorder();
    if (reduced) return;          // a frame that crawls is still a frame
    timer = setInterval(() => {
      offset = (offset + 1) % PATTERN.length;
      drawBorder();
    }, STEP_MS);
  }

  function stopBorder() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  /* --- Focus handling ----------------------------------------------------
     A dialog that does not hold focus is a dialog a keyboard user falls out
     of behind the scrim. */

  const FOCUSABLE =
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function trapTab(e) {
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else trapTab(e);
  }

  /* --- Open / close ------------------------------------------------------ */

  function open(key, trigger) {
    const tpl = document.getElementById(`tpl-${key}`);
    if (!tpl) return;

    if (isOpen) close();
    isOpen = true;
    opener = trigger || null;
    content.replaceChildren(tpl.content.cloneNode(true));
    content.scrollTop = 0;
    overlay.hidden = false;
    document.body.classList.add('is-locked');

    // The frame can only be measured once the panel has been laid out.
    requestAnimationFrame(() => {
      startBorder();
      // Figures cloned out of the template were never in the document when
      // the reveal script ran, so they have to be attached by hand.
      if (window.AsciiReveal) window.AsciiReveal.attach(content);
    });

    closeBtn.focus();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', drawBorder);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    stopBorder();
    overlay.hidden = true;
    document.body.classList.remove('is-locked');
    content.replaceChildren();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', drawBorder);
    if (opener) opener.focus();
    opener = null;
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-overlay]');
    if (trigger) {
      open(trigger.dataset.overlay, trigger);
      return;
    }
    if (e.target.closest('[data-overlay-close]')) close();
  });
})();
