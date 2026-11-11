/* The scheduler behind the kernel demo.
 *
 * The properties worth asserting are the ones a visualisation makes look
 * plausible whether or not they hold: that two threads are never inside the
 * critical section at once, that a blocked thread really leaves the ready
 * queue rather than being skipped over, and that the queue is first come
 * first served. A demo can animate all three convincingly while doing none
 * of them.
 */
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'scripts/scheduler.js'), 'utf8'));
const S = global.window.Scheduler;

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok && detail) console.log(`        ${detail}`);
}

const SPEC = {
  slice: 2,
  sem: 1,
  threads: [
    { id: 'T1', prog: ['work', 'wait', 'work', 'work', 'signal', 'work'] },
    { id: 'T2', prog: ['work', 'work', 'wait', 'work', 'signal'] },
    { id: 'T3', prog: ['work', 'work', 'work', 'work'] },
  ],
};

/* --- Mutual exclusion ---------------------------------------------------- */
{
  const s = S.create(SPEC);
  let both = 0;
  let sawContention = false;
  let n = 0;
  while (!S.finished(s) && n++ < 500) {
    S.step(s);
    const holders = s.threads.filter((t) => t.held).length;
    if (holders > 1) both++;
    if (s.sem.waiting.length) sawContention = true;
  }
  check('every thread finishes', S.finished(s), `after ${n} ticks`);
  check('the semaphore is never held by two threads at once', both === 0,
        `${both} ticks with two holders`);
  // A mutual-exclusion test proves nothing if nobody ever contends.
  check('and the threads did actually contend for it', sawContention);
}

/* --- Blocking removes a thread from the queue ---------------------------- */
{
  const s = S.create(SPEC);
  let sawBlocked = false;
  let blockedWhileQueued = 0;
  let n = 0;
  while (!S.finished(s) && n++ < 500) {
    S.step(s);
    const blocked = s.threads.filter((t) => t.state === 'blocked');
    if (blocked.length) {
      sawBlocked = true;
      // The point of the demo: a blocked thread is gone from the queue,
      // not sitting in it being passed over.
      if (blocked.some((t) => s.ready.includes(t.index))) blockedWhileQueued++;
    }
  }
  check('a thread does block at some point', sawBlocked);
  check('a blocked thread is never in the ready queue', blockedWhileQueued === 0,
        `${blockedWhileQueued} ticks with a blocked thread still queued`);
}

/* --- The queue is first come, first served -------------------------------- */
{
  const s = S.create(SPEC);
  let outOfOrder = 0;
  let n = 0;
  while (!S.finished(s) && n++ < 500) {
    const before = s.ready.slice();
    const wasIdle = s.running === null;
    S.step(s);
    // Compare against who RAN this tick, from the history, not against who
    // is running once it is over: a thread can be picked off the head and
    // then block on the same tick, leaving the processor idle again. The
    // first version of this check read that as a scheduling fault.
    const ran = s.history[s.history.length - 1].run;
    if (wasIdle && before.length && ran !== before[0]) outOfOrder++;
  }
  check('the processor always takes the head of the queue', outOfOrder === 0,
        `${outOfOrder} departures from FCFS`);
}

/* --- The time slice is what it says --------------------------------------- */
{
  for (const slice of [1, 2, 4]) {
    const s = S.create({ ...SPEC, slice });
    S.run(s);
    // No thread may run more consecutive ticks than the slice allows.
    let longest = 0, cur = 0, last = null;
    for (const h of s.history) {
      if (h.run !== null && h.run === last) cur++; else cur = 1;
      last = h.run;
      longest = Math.max(longest, cur);
    }
    check(`with slice ${slice}, no thread runs more than ${slice} ticks in a row`,
          longest <= slice, `longest run was ${longest}`);
  }
}

/* --- A slice of 1 should cost more switches than a slice of 8 ------------- */
{
  const switches = (slice) => {
    const s = S.run(S.create({ ...SPEC, slice }));
    let n = 0, last = null;
    for (const h of s.history) {
      if (h.run !== null && h.run !== last) n++;
      if (h.run !== null) last = h.run;
    }
    return n;
  };
  const fine = switches(1), coarse = switches(8);
  check('a short slice means more context switches', fine > coarse,
        `slice 1: ${fine} switches, slice 8: ${coarse}`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall scheduler checks passed');
process.exit(failures ? 1 : 0);
