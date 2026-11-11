// Harness: run ascii-reveal.js against a stub DOM on a virtual clock, then
// assert the invariants that matter -- the grid never shears mid-animation,
// and the final frame is byte-identical to the authored art.
const fs = require('fs');
const path = require('path');

const ART = [
  '+--------------------+',
  '|   hello  ascii     |',
  '|      /\  /\        |',
  '+--------------------+',
].join('\n');

let clock = 0;
const queue = [];

const el = {
  textContent: '\n' + ART + '\n',            // as the HTML indentation delivers it
  dataset: { duration: '750', stagger: '1200' },
  style: {},
  classList: { s: new Set(), add(c){this.s.add(c);}, remove(c){this.s.delete(c);}, has(c){return this.s.has(c);} },
  attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
  getBoundingClientRect: () => ({ height: 64 }),
};

global.window = { matchMedia: () => ({ matches: false }) };
global.document = {
  readyState: 'complete',
  fonts: { ready: Promise.resolve() },
  addEventListener: () => {},
  querySelectorAll: () => [el],
};
global.performance = { now: () => clock };
global.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
global.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(target) { this.cb([{ isIntersecting: true, target }], { unobserve(){} }); }
};

// An alternate script path may be passed as argv[2], which lets a negative
// control run this same harness against a deliberately broken build.
const target = process.argv[2] || path.join(__dirname, '..', 'scripts/ascii-reveal.js');
const src = fs.readFileSync(target, 'utf8');
eval(src);

const expectedLineLengths = ART.split('\n').map((l) => l.length);

setImmediate(() => {              // let document.fonts.ready resolve
  let frames = 0, shears = 0, firstFrame = null, bleed = 0;

  // Indices that are blank in the finished drawing. Nothing may ever be
  // painted there: scrambling the empty space around the subject fills the
  // bounding box with dust for the length of the reveal, which reads as a
  // rectangle of dirt rather than as a portrait assembling.
  const blanks = [...ART].map((c, i) => (c === ' ' ? i : -1)).filter((i) => i >= 0);

  while (queue.length && frames < 1000) {
    const fn = queue.shift();
    clock += 16.7;
    fn(clock);
    frames++;
    if (frames === 2) firstFrame = el.textContent;
    const now = el.textContent;
    const lens = now.split('\n').map((l) => l.length);
    if (lens.length !== expectedLineLengths.length ||
        lens.some((n, i) => n !== expectedLineLengths[i])) shears++;
    if (blanks.some((i) => now[i] !== ' ')) bleed++;
  }

  console.log('frames run:              ', frames);
  console.log('grid shears detected:    ', shears, shears === 0 ? 'OK' : 'FAIL');
  console.log('frames with background bleed:', bleed, bleed === 0 ? 'OK' : 'FAIL');
  console.log('blank cells watched:     ', blanks.length);
  console.log('final === authored art:  ', el.textContent === ART ? 'OK' : 'FAIL');
  console.log('is-forming cleared:      ', !el.classList.has('is-forming') ? 'OK' : 'FAIL');
  console.log('minHeight reserved:      ', el.style.minHeight);
  console.log('\n--- an early noise frame (should be unreadable dust) ---');
  console.log(firstFrame);
  console.log('--- final frame ---');
  console.log(el.textContent);
});
