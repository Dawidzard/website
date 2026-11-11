/* The assemble -> link -> execute pipeline behind the toolchain demo.
 *
 * The property worth testing is not "does it run" but "does the hole get
 * filled with the right number". The assembler cannot know where `count`
 * will land, so it writes zero and records a relocation; the linker places
 * the modules and patches. If either half drifts the program still runs --
 * it just reads the wrong address and prints a plausible wrong answer.
 */
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'scripts/toolchain.js'), 'utf8'));
const T = global.window.Toolchain;

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok && detail) console.log(`        ${detail}`);
}

const MAIN = `
      ldi r1, 0
      ld  r2, [count]
loop: add r1, r2
      ldi r3, 1
      sub r2, r3
      jnz r2, loop
      out r1
      halt
`;
const DATA = `
count: .word 5
`;

/* --- Assembly ------------------------------------------------------------ */

const main = T.assemble('main.s', MAIN);
const data = T.assemble('data.s', DATA);

check('both modules assemble without error',
      main.errors.length === 0 && data.errors.length === 0,
      [...main.errors, ...data.errors].join('; '));
check('main.s is 8 instructions long', main.bytes.length === 8 * T.WORD,
      `${main.bytes.length} bytes`);
check('the loop label is recorded at the third instruction',
      main.symbols.loop === 2 * T.WORD, `loop = ${main.symbols.loop}`);
check('data.s defines count at its own offset 0', data.symbols.count === 0);

// `count` is defined in the other module, so main must not have resolved it.
const countRefs = main.relocs.filter((r) => r.symbol === 'count');
check('main.s records a relocation for count, not a value',
      countRefs.length === 1 && countRefs[0].offset === 1 * T.WORD,
      JSON.stringify(main.relocs));
check('the unresolved operand was left as zero',
      main.bytes[1 * T.WORD + 1] === 0 && main.bytes[1 * T.WORD + 2] === 0);

// `loop` is defined locally, so it is NOT a relocation -- but it is also
// not resolved at assembly time here, which is the honest simple design.
check('the jump to loop is recorded too', main.relocs.some((r) => r.symbol === 'loop'));

/* --- Linking -------------------------------------------------------------- */

const linked = T.link([main, data]);
check('linking reports no error', linked.errors.length === 0, linked.errors.join('; '));

const countAddr = linked.global.count;
check('count lands after main.s', countAddr === main.bytes.length, `count @ ${countAddr}`);

const at = 1 * T.WORD + 1;            // operand field of the ld instruction
const patched = linked.image[at] | (linked.image[at + 1] << 8);
check('the hole in `ld r2, [count]` now holds count’s address',
      patched === countAddr, `operand = ${patched}, count @ ${countAddr}`);
check('the linker reports the patch it made',
      linked.patches.some((p) => p.at === at && p.value === countAddr));

/* --- Execution ------------------------------------------------------------ */

let cpu = T.newCpu(linked.image);
let guard = 0;
while (!cpu.halted && guard++ < 10000) T.step(cpu);

check('the program halts', cpu.halted && !cpu.fault, cpu.fault || `after ${guard} steps`);
// 5 + 4 + 3 + 2 + 1
check('it prints 15', cpu.out.length === 1 && cpu.out[0] === 15, JSON.stringify(cpu.out));

/* --- The failure the linker exists to catch ------------------------------- */

const alone = T.link([T.assemble('main.s', MAIN)]);
check('linking without data.s is an undefined reference, not a wrong answer',
      alone.errors.some((e) => e.includes('undefined reference to "count"')),
      alone.errors.join('; '));

/* --- Assembler diagnostics ------------------------------------------------ */

const bad = T.assemble('bad.s', 'ldi r9, 1\nfrobnicate r1\nadd r1');
check('bad.s reports all three mistakes', bad.errors.length === 3, bad.errors.join(' | '));

console.log(failures ? `\n${failures} check(s) failed` : '\nall toolchain checks passed');
process.exit(failures ? 1 : 0);
