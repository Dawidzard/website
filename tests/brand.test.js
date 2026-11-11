/* The profile images, checked against the site they are meant to match.
 *
 * A PNG keeps no memory of the stylesheet it was rendered from. Move the
 * palette and these still look fine on their own -- they just quietly stop
 * being the same thing as the site, for as long as nobody re-runs the
 * generator. make_brand.py writes a snapshot of what it used; this compares
 * that snapshot to what is live.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const B = path.join(ROOT, 'assets/brand');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok && detail) console.log(`        ${detail}`);
}

check('the brand images have been generated', fs.existsSync(path.join(B, 'meta.json')));
const meta = JSON.parse(fs.readFileSync(path.join(B, 'meta.json'), 'utf8'));

/* --- Sizes the platforms impose ------------------------------------------
 * Getting one wrong means the platform crops the image, usually through
 * something that mattered. */
const SPEC = {
  'gh-avatar': [800, 800],
  'yt-avatar': [800, 800],
  'li-avatar': [800, 800],
  'li-banner': [1584, 396],
  'yt-banner': [2560, 1440],   // only the centre 1546x423 is shown everywhere
};

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (!b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const wrong = [];
for (const [name, want] of Object.entries(SPEC)) {
  const file = path.join(B, `${name}.png`);
  if (!fs.existsSync(file)) { wrong.push(`${name}.png missing`); continue; }
  const got = pngSize(file);
  if (!got) { wrong.push(`${name}.png is not a PNG`); continue; }
  if (got[0] !== want[0] || got[1] !== want[1]) {
    wrong.push(`${name}: ${got.join('x')}, the platform wants ${want.join('x')}`);
  }
  const declared = meta.targets[name];
  if (!declared || declared[0] !== want[0] || declared[1] !== want[1]) {
    wrong.push(`${name}: the generator declares ${declared}, not ${want}`);
  }
}
check(`every image is at its platform size (${Object.keys(SPEC).length} images)`,
      wrong.length === 0, wrong.join('\n        '));

/* --- Palette, against the live stylesheet -------------------------------- */
const css = fs.readFileSync(path.join(ROOT, 'styles/tokens.css'), 'utf8');
const live = {};
for (const m of css.matchAll(/(--c-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) live[m[1]] = m[2];

const drifted = Object.entries(live)
  .filter(([k, v]) => meta.tokens[k] && meta.tokens[k].toLowerCase() !== v.toLowerCase())
  .map(([k, v]) => `${k}: site ${v}, images ${meta.tokens[k]}`);
check('images were built from the current palette', drifted.length === 0,
      `${drifted.join('\n        ')}\n        re-run: python tools/make_brand.py`);

/* --- The art they were drawn from ---------------------------------------- */
const missingArt = meta.art.filter(
  (a) => !fs.existsSync(path.join(ROOT, 'assets/ascii', a)));
check(`the ASCII art the images use is still present (${meta.art.length} files)`,
      missingArt.length === 0, missingArt.join(', '));

/* --- The joke in the YouTube panel has to survive editing ----------------
 * The binary in the channel banner is the point of it. A stray character
 * would leave a wall of digits that no longer says anything. */
{
  const panel = fs.readFileSync(path.join(ROOT, 'assets/ascii/zhiwy-panel.txt'), 'utf8');
  const bits = (panel.match(/[01]{8}/g) || []);
  const decoded = bits.map((b) => String.fromCharCode(parseInt(b, 2))).join('');
  check('the channel banner binary still decodes', decoded === 'Decoding the World!',
        `decodes to ${JSON.stringify(decoded)}`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall brand checks passed');
process.exit(failures ? 1 : 0);
