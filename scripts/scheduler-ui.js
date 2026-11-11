/* ==========================================================================
   SCHEDULER DEMO -- the panel
   Drives scripts/scheduler.js. Separate from it so the queue, the slice and
   the semaphore can be tested without a DOM, which is where a visualisation
   is most able to lie: it can animate mutual exclusion convincingly while
   not actually enforcing it.
   ========================================================================== */

(() => {
  'use strict';

  const SPEC = {
    sem: 1,
    threads: [
      { id: 'T1', prog: ['work', 'wait', 'work', 'work', 'signal', 'work'] },
      { id: 'T2', prog: ['work', 'work', 'wait', 'work', 'signal'] },
      { id: 'T3', prog: ['work', 'work', 'work', 'work'] },
    ],
  };

  // What each cell of the timeline means. The critical section gets its own
  // mark because "who holds the semaphore" is the question being asked.
  const CELL = {
    work: { cls: 'run', ch: '█' },
    wait: { cls: 'crit', ch: '█' },
    signal: { cls: 'crit', ch: '░' },
    blocked: { cls: 'blocked', ch: '×' },
    done: { cls: 'idle', ch: '' },
  };

  let ui = null;
  let timer = null;

  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function reset() {
    stop();
    ui.sim = window.Scheduler.create({ ...SPEC, slice: ui.slice });
    paint();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (ui) ui.playing = false;
    if (ui && ui.btnRun) ui.btnRun.textContent = 'run';
  }

  function paint() {
    const s = ui.sim;
    const rows = s.threads.map((t, i) => {
      const cells = s.history.map((h) => {
        if (h.run === i) {
          const k = CELL[h.note] || CELL.work;
          return `<i class="sc-${k.cls}">${k.ch}</i>`;
        }
        const st = h.states ? h.states[i] : 'ready';
        if (st === 'blocked') return '<i class="sc-waiting">·</i>';
        if (st === 'done') return '<i class="sc-idle"> </i>';
        return '<i class="sc-queued">─</i>';
      }).join('');
      const tag = t.state === 'done' ? 'done'
                : t.state === 'blocked' ? 'blocked'
                : s.running === i ? 'running' : 'ready';
      return `<div class="sc-row">
        <span class="sc-name sc-is-${tag}">${t.id}</span>
        <span class="sc-track">${cells}</span>
        <span class="sc-state">${tag}</span>
      </div>`;
    }).join('');

    const q = s.ready.map((i) => s.threads[i].id).join(' ') || '—';
    const w = s.sem.waiting.map((i) => s.threads[i].id).join(' ') || '—';
    const running = s.running === null ? 'idle' : s.threads[s.running].id;

    ui.board.innerHTML = rows;
    ui.facts.innerHTML = `
      <p class="tc-row"><span>tick</span><code>${s.tick}</code></p>
      <p class="tc-row"><span>running</span><code>${esc(running)}${
        s.running === null ? '' : `  (${s.remaining} of ${s.slice} left)`}</code></p>
      <p class="tc-row"><span>ready queue</span><code>${esc(q)}</code></p>
      <p class="tc-row"><span>semaphore</span><code>${s.sem.value}  waiting: ${esc(w)}</code></p>`;
    ui.log.textContent = s.log.slice(-5).map((l) => `${l.tick}  ${l.text}`).join('\n');

    const done = window.Scheduler.finished(s);
    ui.btnStep.disabled = done;
    if (done) stop();
  }

  function step() {
    if (window.Scheduler.finished(ui.sim)) { stop(); return; }
    window.Scheduler.step(ui.sim);
    paint();
  }

  function toggleRun() {
    if (timer) { stop(); return; }
    ui.playing = true;
    ui.btnRun.textContent = 'pause';
    timer = setInterval(step, 260);
  }

  function mount(root) {
    const q = (s) => root.querySelector(s);
    const board = q('[data-sc-board]');
    if (!board || !window.Scheduler) return;

    ui = {
      board,
      facts: q('[data-sc-facts]'),
      log: q('[data-sc-log]'),
      btnStep: q('[data-sc="step"]'),
      btnRun: q('[data-sc="run"]'),
      slice: 2,
      sim: null,
      playing: false,
    };

    const slider = q('[data-sc-slice]');
    const label = q('[data-sc-slice-label]');
    const setSlice = () => {
      ui.slice = Number(slider.value);
      label.textContent = `${ui.slice} tick${ui.slice === 1 ? '' : 's'}`;
      reset();                      // the slice changes the whole schedule
    };
    slider.addEventListener('input', setSlice);

    ui.btnStep.addEventListener('click', step);
    ui.btnRun.addEventListener('click', toggleRun);
    q('[data-sc="reset"]').addEventListener('click', reset);

    setSlice();
  }

  document.addEventListener('overlay:open', (e) => {
    stop();
    ui = null;
    if (e.detail.key === 'demo-sched') mount(e.detail.content);
  });
  document.addEventListener('overlay:close', () => { stop(); ui = null; });
})();
