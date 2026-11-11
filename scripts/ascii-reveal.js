/* ==========================================================================
   ASCII REVEAL
   Turns a block of ASCII art into a field of noise that condenses into the
   picture. Attach by putting data-ascii-reveal on any <pre>; the element's
   own text content is the target, so the art degrades gracefully to a plain
   static drawing if this script never runs.

   Optional attributes:
     data-duration  ms for one cell to settle once its turn comes  (def 900)
     data-stagger   ms spread between the first and last cell       (def 1100)

   Performance note: the whole frame is written with ONE textContent
   assignment per tick. Wrapping every character in its own <span> would be
   the obvious way to colour cells individually, but a 70x30 drawing is 2100
   nodes - rewriting those every frame drops the page to single-digit fps.
   Perceived brightness is produced by the CHOICE of noise character instead
   (sparse punctuation reads dim, dense symbols read bright), which costs
   nothing.
   ========================================================================== */

(() => {
  'use strict';

  // Sparse glyphs read as faint dust; dense ones read as bright specks. The
  // mix shifts from sparse to dense as the drawing resolves, so the field
  // appears to gain substance rather than just swap characters.
  const NOISE_SPARSE = " .'`^\",:;~-_";
  const NOISE_DENSE = "+=*!?/\\|()<>[]{}#%&$@0123456789";

  const NOISE_TICK_MS = 55; // how often unresolved cells re-roll
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function randomChar(progress) {
    // progress 0..1 across the whole reveal
    const set = Math.random() < progress ? NOISE_DENSE : NOISE_SPARSE;
    return set[(Math.random() * set.length) | 0];
  }

  /**
   * Prepare one element: capture its art, pre-compute each cell's start time.
   */
  function prepare(el) {
    // Strip only the newline the HTML indentation adds around <pre>, never
    // the trailing spaces inside a line - those are part of the grid.
    const target = el.textContent.replace(/^\n/, '').replace(/\n$/, '');
    const duration = Number(el.dataset.duration) || 900;
    const stagger = Number(el.dataset.stagger) || 1100;

    // One delay per character. Math.random() gives the scattered "condensing
    // dust" look; an ordered sweep would read as a wipe instead.
    const chars = Array.from(target);
    const delays = chars.map(() => Math.random() * stagger);

    return { el, chars, delays, duration, stagger, total: stagger + duration };
  }

  function animate(job) {
    const { el, chars, delays, duration, total } = job;
    const start = performance.now();
    let lastNoiseRoll = -Infinity;
    let noiseFrame = null;

    el.classList.add('is-forming');

    function frame(now) {
      const t = now - start;
      const progress = Math.min(t / total, 1);

      // Re-roll the noise on its own slower clock. Rolling every animation
      // frame makes the field buzz too fast to read as forming.
      const reroll = t - lastNoiseRoll >= NOISE_TICK_MS;
      if (reroll) lastNoiseRoll = t;

      const out = new Array(chars.length);
      let settled = 0;

      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];

        // Newlines must never be replaced or the grid collapses into one line.
        if (ch === '\n') { out[i] = '\n'; settled++; continue; }

        if (t >= delays[i] + duration) {
          out[i] = ch;
          settled++;
        } else if (!reroll && noiseFrame) {
          out[i] = noiseFrame[i]; // hold the previous roll
        } else {
          out[i] = randomChar(progress);
        }
      }

      noiseFrame = out;
      el.textContent = out.join('');

      if (settled === chars.length) {
        el.classList.remove('is-forming');
        return;
      }
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  /**
   * Attach to every unattached drawing inside `root`.
   *
   * Exported, because content cloned out of a <template> into the overlay
   * never existed in the document when this script first ran. The overlay
   * calls this after it inserts a panel so figures in there animate too.
   */
  function attach(root = document) {
    const blocks = root.querySelectorAll('[data-ascii-reveal]:not([data-ascii-done])');
    if (!blocks.length) return;

    if (prefersReducedMotion) return; // leave the static art exactly as authored

    blocks.forEach((el) => {
      el.setAttribute('data-ascii-done', '');
      const job = prepare(el);

      // Reserve the final size before scrambling, so the page never reflows
      // when the art settles.
      const rect = el.getBoundingClientRect();
      el.style.minHeight = rect.height + 'px';

      // Animate when the art is actually on screen: the hero fires at once,
      // project illustrations assemble as you scroll to them.
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          obs.unobserve(entry.target);
          animate(job);
        });
      }, { threshold: 0.25 });

      observer.observe(el);
    });
  }

  // Published for the overlay, which inserts drawings after load.
  window.AsciiReveal = { attach };

  // Wait for the webfont. The grid is measured in JetBrains Mono; the
  // fallback mono has different metrics, so measuring before the font lands
  // reserves the wrong height and the page jumps.
  function boot() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => attach());
    } else {
      attach();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
