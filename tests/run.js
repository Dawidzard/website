/* Run every test in this folder.
 *
 *     node tests/run.js
 *
 * No framework and no dependencies: each test is a plain script that exits
 * non-zero on failure.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let failed = 0;
for (const f of files) {
  process.stdout.write(`${f.padEnd(28)}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'pipe' });
    console.log('PASS');
  } catch (e) {
    failed++;
    console.log('FAIL');
    console.log(String(e.stdout || '').split('\n').map((l) => '    ' + l).join('\n'));
    console.log(String(e.stderr || '').split('\n').slice(0, 6).map((l) => '    ' + l).join('\n'));
  }
}

console.log(failed ? `\n${failed} of ${files.length} failed` : `\n${files.length} passed`);
process.exit(failed ? 1 : 0);
