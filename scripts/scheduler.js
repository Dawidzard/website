/* ==========================================================================
   SCHEDULER SIMULATION
   The kernel's own mechanics, one tick at a time: a FCFS ready queue,
   threads that run until their time slice expires, and a semaphore that
   takes a blocked thread out of the queue altogether.

   Those three are what the project implements, and they are exactly what
   is hard to see from reading the code: the queue order is obvious, the
   slice is obvious, but what a blocking wait does to the queue is not.

   A thread is a list of one-tick operations:
     work    compute
     wait    P on the semaphore -- blocks if it is already taken
     signal  V on the semaphore -- hands it to whoever has waited longest
   ========================================================================== */

(() => {
  'use strict';

  function create(spec) {
    return {
      slice: spec.slice,
      sem: { value: spec.sem, waiting: [] },
      threads: spec.threads.map((t, i) => ({
        id: t.id, prog: t.prog.slice(), pc: 0, index: i,
        state: 'ready', held: false, ran: 0,
      })),
      ready: spec.threads.map((_, i) => i),   // FCFS, in declaration order
      running: null,
      remaining: 0,
      tick: 0,
      history: [],                            // one entry per tick
      log: [],
    };
  }

  const alive = (t) => t.state !== 'done';

  function snapshot(s) {
    return s.threads.map((t) => (t.state === 'running' ? 'ready' : t.state));
  }

  function note(s, text) {
    s.log.push({ tick: s.tick, text });
    if (s.log.length > 60) s.log.shift();
  }

  function step(s) {
    // Pick up a thread if the processor is idle.
    if (s.running === null && s.ready.length) {
      s.running = s.ready.shift();
      s.remaining = s.slice;
      s.threads[s.running].state = 'running';
    }

    if (s.running === null) {
      s.history.push({ tick: s.tick, run: null, note: 'idle' , states: snapshot(s) });
      s.tick++;
      return s;
    }

    const t = s.threads[s.running];
    const op = t.prog[t.pc];
    let what = op;

    if (op === undefined) {
      t.state = 'done';
      note(s, `${t.id} finished`);
      s.running = null;
      s.history.push({ tick: s.tick, run: t.index, note: 'done' , states: snapshot(s) });
      s.tick++;
      return s;
    }

    if (op === 'wait') {
      if (s.sem.value > 0) {
        s.sem.value--;
        t.held = true;
        t.pc++;
        note(s, `${t.id} took the semaphore`);
      } else {
        // The part worth watching: a blocked thread leaves the ready queue
        // entirely. It is not skipped over each turn, it is simply not
        // there until somebody signals.
        t.state = 'blocked';
        s.sem.waiting.push(t.index);
        s.running = null;
        note(s, `${t.id} blocked; ready queue is now [${s.ready.map((i) => s.threads[i].id).join(' ')}]`);
        s.history.push({ tick: s.tick, run: t.index, note: 'blocked' , states: snapshot(s) });
        s.tick++;
        return s;
      }
    } else if (op === 'signal') {
      t.held = false;
      if (s.sem.waiting.length) {
        // Hand the semaphore straight to the longest waiter rather than
        // raising the count and letting it race for it.
        const w = s.threads[s.sem.waiting.shift()];
        w.state = 'ready';
        w.held = true;
        w.pc++;                               // its wait is satisfied
        s.ready.push(w.index);
        note(s, `${t.id} handed the semaphore to ${w.id}`);
      } else {
        s.sem.value++;
        note(s, `${t.id} released the semaphore`);
      }
      t.pc++;
    } else {
      t.pc++;                                 // work
    }

    t.ran++;
    s.remaining--;
    s.history.push({ tick: s.tick, run: t.index, note: what, states: snapshot(s) });

    if (t.pc >= t.prog.length) {
      t.state = 'done';
      note(s, `${t.id} finished`);
      s.running = null;
    } else if (s.remaining <= 0) {
      t.state = 'ready';
      s.ready.push(t.index);
      s.running = null;
      note(s, `${t.id} used up its slice; back of the queue`);
    }

    s.tick++;
    return s;
  }

  const finished = (s) => s.threads.every((t) => !alive(t));

  function run(s, limit = 500) {
    let n = 0;
    while (!finished(s) && n++ < limit) step(s);
    return s;
  }

  window.Scheduler = { create, step, run, finished };
})();
