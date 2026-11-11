/* Static guards over the markup and stylesheets.
 *
 *     node tests/guards.test.js
 *
 * These are the checks that catch the mistakes this project has actually
 * made, rather than a generic linter's opinions. Run them after touching
 * index.html, the stylesheets, or any ASCII asset.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Normalise line endings on the way in. These files are written on Windows
// and carry CRLF; a pattern anchored on ">\n" then silently matches nothing,
// which is how the ASCII-sizing guard below spent its first run inspecting
// an empty set and reporting success. The browser normalises newlines when
// it parses HTML, so this only affects reading the source as text.
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const html = read('index.html');
const cssFiles = ['styles/tokens.css', 'styles/base.css', 'styles/layout.css'];
const css = cssFiles.map(read).join('\n');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok && detail) console.log(`        ${detail}`);
}

/* 1. Every custom property used is actually declared. ------------------- */
{
  const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  const declared = new Set([...read('styles/tokens.css').matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)]
    .map((m) => m[1]));
  const missing = [...used].filter((t) => !declared.has(t));
  check('every var(--token) is declared in tokens.css', missing.length === 0, missing.join(', '));
}

/* 2. Every class in the markup has at least one rule. -------------------- */
{
  const inHtml = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => inHtml.add(c));
  }
  const orphans = [...inHtml].filter(
    (c) => !new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![a-zA-Z0-9_-])`).test(css));
  check('every class in index.html has a CSS rule', orphans.length === 0, orphans.join(', '));
}

/* 3. The `hidden` attribute must beat author `display` rules. ------------
 * The browser honours `hidden` only from its own stylesheet, so any author
 * rule setting `display` on the element silently defeats it. That shipped
 * once: .overlay sets display:grid, so the dialog was on screen from page
 * load and could not be dismissed. */
{
  const usesHidden = /<[^>]+\shidden(\s|>)/.test(html);
  const guarded = /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/.test(css);
  check('markup using [hidden] is guarded by a !important display:none rule',
        !usesHidden || guarded,
        'add: [hidden] { display: none !important; }');
}

/* 4. ASCII column counts must match the font-size divisors. --------------
 * Each drawing is sized by calc(100cqw / D) where D = columns * 0.6. If art
 * is regenerated at a different width and the divisor is not updated, the
 * drawing overflows or under-fills its column -- silently, because nothing
 * errors. */
{
  const divisors = new Map();
  for (const m of css.matchAll(/\.(ascii--[a-z-]+)\s*\{[^}]*?100cqw\s*\/\s*([\d.]+)/gs)) {
    divisors.set(m[1], parseFloat(m[2]));
  }

  const problems = [];
  let inspected = 0;
  // Match on the attribute's contents rather than on an exact two-name class
  // string: the first version of this demanded `class="ascii ascii--x"` in
  // that exact shape, matched nothing, and so passed while reporting on an
  // empty set.
  for (const m of html.matchAll(/<pre\s+class="([^"]*)"[^>]*>\n([\s\S]*?)<\/pre>/g)) {
    const cls = m[1].split(/\s+/).find((c) => c.startsWith('ascii--'));
    if (!cls) continue;              // the overlay border is drawn by script
    inspected++;
    const art = m[2];
    const cols = Math.max(...art.replace(/\n$/, '').split('\n').map((l) => l.length));
    const want = +(cols * 0.6).toFixed(2);
    const got = divisors.get(cls);
    if (got === undefined) problems.push(`${cls}: no calc(100cqw / D) rule`);
    else if (Math.abs(got - want) > 0.05) {
      problems.push(`${cls}: art is ${cols} cols (needs /${want}) but CSS says /${got}`);
    }
  }

  // A guard that inspects nothing always passes, which is worse than having
  // no guard at all. Make an empty inspection a failure in its own right.
  check('ASCII blocks were found to inspect', inspected > 0,
        'the <pre> matcher found no drawings, so the check below proves nothing');
  check(`every ASCII block is sized for its real column count (${inspected} checked)`,
        problems.length === 0, problems.join('\n        '));
}

/* 5. Tags balance. -------------------------------------------------------- */
{
  const VOID = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'source', 'wbr']);
  const stack = [];
  const bad = [];
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)(\s[^>]*)?>/g)) {
    const [, slash, tag] = m;
    if (VOID.has(tag)) continue;
    if (!slash) stack.push(tag);
    else if (stack[stack.length - 1] === tag) stack.pop();
    else bad.push(tag);
  }
  check('tags balance', bad.length === 0 && stack.length === 0,
        `unbalanced: ${bad.join(', ')} | left open: ${stack.join(', ')}`);
}

console.log(failures ? `\n${failures} guard(s) failed` : '\nall guards passed');
process.exit(failures ? 1 : 0);
