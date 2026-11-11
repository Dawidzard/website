/* Drive armdemo.js against a stub DOM and a stub Image, and separately
 * check that the inlined manifest agrees with the sprite sheets on disk.
 *
 * The manifest and the drawing maths are two halves of one contract: the
 * manifest says "frames 93 to 108", the drawing code turns an index into an
 * (x, y) in the sheet. Repack the frames differently and nothing throws --
 * the demo just plays the wrong pictures. So the arithmetic is checked here
 * rather than left to be noticed by eye.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok && detail) console.log(`        ${detail}`);
}

/* --- 1. The manifest, against the files it describes --------------------- */

const m = html.match(
  /<script type="application\/json" id="armdemo-manifest">([\s\S]*?)<\/script>/);
check('the manifest is inlined in the page', !!m);
const manifest = JSON.parse(m[1]);

const { tile, cols, ext, scenes } = manifest;
check('manifest declares tile, cols and ext',
      Number.isInteger(tile) && Number.isInteger(cols) && typeof ext === 'string');

const problems = [];
for (const [id, s] of Object.entries(scenes)) {
  const ranges = [s.context,
                  ...Object.values(s.anchored),
                  ...s.chain.map((b) => b.range)];

  // Every range must land inside the sheet.
  for (const [off, n] of ranges) {
    if (off < 0 || n <= 0 || off + n > s.count) {
      problems.push(`scene ${id}: range [${off}, ${n}] escapes count ${s.count}`);
    }
  }

  // Ranges must tile the sheet exactly once: no overlap, nothing stranded.
  const seen = new Array(s.count).fill(0);
  for (const [off, n] of ranges) {
    for (let i = off; i < off + n && i < s.count; i++) seen[i]++;
  }
  const twice = seen.filter((v) => v > 1).length;
  const never = seen.filter((v) => v === 0).length;
  if (twice) problems.push(`scene ${id}: ${twice} frames claimed by two ranges`);
  if (never) problems.push(`scene ${id}: ${never} frames unreachable`);

  // The file has to exist and be a real WebP.
  const file = path.join(ROOT, 'assets/armdemo', `scene-${id}.${ext}`);
  if (!fs.existsSync(file)) { problems.push(`scene ${id}: ${file} missing`); continue; }
  const head = fs.readFileSync(file).subarray(0, 12);
  if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WEBP') {
    problems.push(`scene ${id}: not a RIFF/WEBP file`);
  }

  // The last tile must fit in the rows the packer would have produced.
  const rowsNeeded = Math.ceil(s.count / cols);
  const lastY = Math.floor((s.count - 1) / cols);
  if (lastY >= rowsNeeded) problems.push(`scene ${id}: last tile row ${lastY} >= ${rowsNeeded}`);
}
check(`every range fits its sheet and the sheets exist (${Object.keys(scenes).length} scenes)`,
      problems.length === 0, problems.join('\n        '));

/* --- 2. The module, against a stub DOM ----------------------------------- */

const drawn = [];          // [sx, sy] per drawImage call
const listeners = {};
let loadedSrc = null;

function el(extra = {}) {
  return {
    textContent: '', innerHTML: '', dataset: {}, children: [],
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                 toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
                 contains(c) { return this._s.has(c); } },
    appendChild(c) { this.children.push(c); },
    addEventListener(t, fn) { (this._l = this._l || {})[t] = fn; },
    click() { this._l && this._l.click && this._l.click(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getContext: () => ({ drawImage: (_img, sx, sy) => drawn.push([sx, sy]) }),
    ...extra,
  };
}

const canvas = el();
const status = el();
const scenesStrip = el();
const chainBtn = el();
const pad = ['up', 'down', 'left', 'right', 'still'].map((a) => {
  const b = el(); b.dataset.action = a; return b;
});

const content = el({
  querySelector(sel) {
    return { '[data-demo-canvas]': canvas, '[data-demo-status]': status,
             '[data-demo-scenes]': scenesStrip, '[data-demo-chain]': chainBtn }[sel] || null;
  },
  querySelectorAll: (sel) => (sel === '[data-action]' ? pad : []),
});

global.window = {};
global.document = {
  getElementById: (id) => (id === 'armdemo-manifest' ? { textContent: m[1] } : null),
  createElement: () => el(),
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener: () => {},
};
/* The module paces itself at 90 ms a frame. Rather than sleep through that
 * -- or shorten the delay and race it, which is how the first version of
 * this test reported five frames out of thirteen -- time is taken over
 * completely. Scheduled callbacks go on a queue the test drains on demand,
 * so every assertion runs at an exactly known point. */
const queue = [];
global.setTimeout = (fn) => { queue.push(fn); return queue.length; };
global.clearTimeout = () => {};

// Async, because loadSheet resolves a Promise and its .then is a
// microtask: a purely synchronous drain returns before the continuation
// ever runs, which is why the first version saw zero context frames.
// Awaiting inside the loop hands control back long enough for them.
async function drain(limit = 10000) {
  let n = 0;
  for (;;) {
    await null;                       // let pending promise callbacks run
    if (!queue.length) break;
    queue.shift()();
    if (++n > limit) throw new Error('the task queue never emptied');
  }
  return n;
}

global.Image = class {
  set src(v) { loadedSrc = v; queue.push(() => this.onload && this.onload()); }
};

eval(fs.readFileSync(path.join(ROOT, 'scripts/armdemo.js'), 'utf8'));

const fire = (t, ev) => (listeners[t] || []).forEach((fn) => fn(ev));
fire('overlay:open', { detail: { key: 'demo', content } });

(async () => {
  const first = Object.keys(scenes)[0];

  check('the sheet for the first scene is requested',
        loadedSrc === `assets/armdemo/scene-${first}.${ext}`, `got ${loadedSrc}`);
  check('a scene button was built for every scene',
        scenesStrip.children.length === Object.keys(scenes).length);

  await drain();                                   // image load, then the context plays out

  const ctx = scenes[first].context;
  check(`the context plays all ${ctx[1]} of its frames`, drawn.length === ctx[1],
        `drew ${drawn.length}`);

  // Index -> sheet coordinates, recomputed here independently of the module.
  const wrong = drawn.filter(([sx, sy], k) => {
    const i = ctx[0] + k;
    return sx !== (i % cols) * tile || sy !== Math.floor(i / cols) * tile;
  });
  check('every frame is read from the right tile', wrong.length === 0,
        `${wrong.length} frames drawn from the wrong offset`);

  drawn.length = 0;
  pad.find((b) => b.dataset.action === 'right').click();
  await drain();

  const r = scenes[first].anchored.right;
  check(`a direction plays its ${r[1]} frames`, drawn.length === r[1], `drew ${drawn.length}`);
  check('the pressed key is marked active',
        pad.find((b) => b.dataset.action === 'right').classList.contains('is-on'));
  check('the frames came from the right range', drawn.every(([sx, sy], k) => {
    const i = r[0] + k;
    return sx === (i % cols) * tile && sy === Math.floor(i / cols) * tile;
  }));

  // The free rollout chains four blocks, each feeding the next.
  drawn.length = 0;
  chainBtn._l.click();
  await drain();
  const chainFrames = scenes[first].chain.reduce((n, b) => n + b.range[1], 0);
  check(`free rollout plays all ${chainFrames} frames across ${scenes[first].chain.length} blocks`,
        drawn.length === chainFrames, `drew ${drawn.length}`);

  // Closing must stop the loop: a timer still ticking against a detached
  // canvas is a leak that only shows up as a mystery later.
  fire('overlay:close');
  drawn.length = 0;
  await drain();
  check('closing the overlay stops playback', drawn.length === 0, `drew ${drawn.length} after close`);

  console.log(failures ? `\n${failures} check(s) failed` : '\nall demo checks passed');
  process.exit(failures ? 1 : 0);

})();
