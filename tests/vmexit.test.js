/* The vm-exit simulation behind the KVM demo.
 *
 * The claim the demo makes is an economic one -- the guest runs thousands
 * of instructions for every exit -- and a claim like that is easy to
 * animate and easy to get wrong. So it is counted here rather than
 * asserted on screen.
 */
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'scripts/vmexit.js'), 'utf8'));
const V = global.window.VmExit;

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok && detail) console.log(`        ${detail}`);
}

/* --- A full run ----------------------------------------------------------- */
{
  const s = V.run(V.create(0));
  check('the program finishes', s.done);
  check('the processor ends up back in the guest', s.where === 'guest');

  // Every io and file step is one exit, plus the hlt.
  const expected = V.PROGRAM.filter((p) => p.op === 'io' || p.op === 'file').length + 1;
  check(`every exit is accounted for (${expected})`, s.exits === expected,
        `counted ${s.exits}`);

  check('the guest printed both of its lines',
        s.output.length === 2 && s.output[1] === 'Data from the guest.',
        JSON.stringify(s.output));
}

/* --- The economics the demo is about -------------------------------------- */
{
  const s = V.run(V.create(0));
  const ratio = s.instructions / s.exits;
  check(`the guest runs far more instructions than it takes exits (${Math.round(ratio)}:1)`,
        ratio > 100, `${s.instructions} instructions over ${s.exits} exits`);
}

/* --- Per-VM filename prefixing -------------------------------------------- */
{
  const a = V.run(V.create(0));
  const b = V.run(V.create(1));
  check('each VM opens its own host file',
        a.hostFile === 'vm0_test.txt' && b.hostFile === 'vm1_test.txt',
        `${a.hostFile} vs ${b.hostFile}`);
  check('and the two cannot collide', a.hostFile !== b.hostFile);
}

/* --- An exit is two halves, and the structure is written between them ----- */
{
  const s = V.create(0);
  // Step up to the open call.
  while (s.prog[s.pc].call !== 'open') V.step(s);

  V.step(s);                                   // guest fills in and issues outl
  check('issuing the call leaves the processor in the monitor', s.where === 'monitor');
  check('the request is in guest memory with no answer yet',
        s.request && s.request.call === 'open' && s.request.ret === null,
        JSON.stringify(s.request));

  const fdAfter = (() => { V.step(s); return s.fd; })();   // monitor services it
  check('the monitor hands the processor back', s.where === 'guest');
  check('and the guest now has a descriptor', fdAfter === 3, `fd = ${fdAfter}`);
}

/* --- A compute step must not be an exit ----------------------------------- */
{
  const s = V.create(0);
  while (s.prog[s.pc] && s.prog[s.pc].op !== 'compute') V.step(s);
  const before = s.exits;
  const pcBefore = s.pc;
  V.step(s);
  check('a compute step costs no exit', s.exits === before);
  check('and advances in one step, not two', s.pc === pcBefore + 1);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall vm-exit checks passed');
process.exit(failures ? 1 : 0);
