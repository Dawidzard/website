// Verify the border geometry: the ring must visit every perimeter cell
// exactly once, and the grid must stay rectangular at any panel size.
const PATTERN = require('fs').readFileSync(require('path').join(__dirname,'..','scripts/overlay.js'),'utf8').match(/const PATTERN = '([^']*)'/)[1];
function build(w, h, offset) {
  const CELL_H = 12, CELL_W = 7.2;
  const cols = Math.max(2, Math.floor(w / CELL_W));
  const rows = Math.max(2, Math.floor(h / CELL_H));
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '));
  const ring = [];
  for (let c = 0; c < cols; c++) ring.push([0, c]);
  for (let r = 1; r < rows; r++) ring.push([r, cols - 1]);
  for (let c = cols - 2; c >= 0; c--) ring.push([rows - 1, c]);
  for (let r = rows - 2; r >= 1; r--) ring.push([r, 0]);
  ring.forEach(([r, c], i) => { grid[r][c] = PATTERN[(i + offset) % PATTERN.length]; });
  return { cols, rows, ring, text: grid.map(r => r.join('')).join('\n') };
}
let ok = true;
for (const [w, h] of [[840, 600], [840, 200], [320, 480], [100, 40], [1200, 900]]) {
  const { cols, rows, ring, text } = build(w, h, 0);
  const expected = 2 * cols + 2 * rows - 4;
  const unique = new Set(ring.map(p => p.join(','))).size;
  const lens = new Set(text.split('\n').map(l => l.length));
  const interiorClean = text.split('\n').slice(1, -1)
    .every(l => l.slice(1, -1).trim() === '');
  const pass = ring.length === expected && unique === expected
            && lens.size === 1 && [...lens][0] === cols && interiorClean;
  if (!pass) ok = false;
  console.log(`${w}x${h} -> ${cols}x${rows}  ring ${ring.length}/${expected}  unique ${unique}  rect ${lens.size === 1}  hollow ${interiorClean}  ${pass ? 'OK' : 'FAIL'}`);
}
// The frame must actually appear to move: consecutive offsets differ.
const a = build(840, 600, 0).text, b = build(840, 600, 1).text;
console.log('frame advances between offsets:', a !== b ? 'OK' : 'FAIL');
console.log(ok ? '\nall geometry checks passed' : '\nGEOMETRY FAILURE');
console.log('\n--- a small frame, rendered ---');
console.log(build(150, 90, 0).text);
