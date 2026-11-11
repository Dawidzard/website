/* ==========================================================================
   VM EXIT DEMO -- the panel
   Drives scripts/vmexit.js. Two columns, and the only thing that really
   matters is which one currently holds the processor.
   ========================================================================== */

(() => {
  'use strict';

  let ui = null;
  let timer = null;

  const esc = (s) => String(s).replace(/[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (ui && ui.btnRun) ui.btnRun.textContent = 'run';
  }

  function reset() {
    stop();
    ui.sim = window.VmExit.create(ui.vmId);
    paint();
  }

  function paint() {
    const s = ui.sim;

    ui.prog.innerHTML = s.prog.map((op, i) => {
      const cls = i === s.pc && !s.done ? ' is-pc' : i < s.pc ? ' is-past' : '';
      return `<li class="vx-line${cls}">${esc(op.text)}</li>`;
    }).join('');

    ui.root.querySelector('[data-vx-guest]')
      .classList.toggle('is-active', s.where === 'guest' && !s.done);
    ui.root.querySelector('[data-vx-monitor]')
      .classList.toggle('is-active', s.where === 'monitor');

    const r = s.request;
    ui.struct.innerHTML = r
      ? `<p class="vx-h">file_request @ 0x${r.addr.toString(16).toUpperCase()} &middot; in guest memory</p>
         <p class="tc-row"><span>call</span><code>${esc(r.call)}</code></p>
         <p class="tc-row"><span>args</span><code>${esc(r.args)}</code></p>
         <p class="tc-row"><span>ret</span><code>${r.ret === null
            ? '<span class="vx-pending">not written yet</span>' : r.ret}</code></p>`
      : '<p class="vx-idle">no request in flight</p>';

    ui.facts.innerHTML = `
      <p class="tc-row"><span>vm exits</span><code>${s.exits}</code></p>
      <p class="tc-row"><span>guest instructions</span><code>${s.instructions.toLocaleString()}</code></p>
      <p class="tc-row"><span>per exit</span><code>${
        s.exits ? Math.round(s.instructions / s.exits).toLocaleString() : '—'}</code></p>
      <p class="tc-row"><span>host file</span><code>${esc(s.hostFile || '—')}</code></p>`;

    ui.out.textContent = s.output.join('\n') || '(nothing yet)';
    ui.log.innerHTML = s.log.slice(-6).map(
      (l) => `<span class="vx-${l.side}">${l.side === 'guest' ? 'guest  ' : 'monitor'}</span>  ${esc(l.text)}`
    ).join('\n');

    ui.btnStep.disabled = s.done;
    if (s.done) stop();
  }

  function step() {
    if (ui.sim.done) { stop(); return; }
    window.VmExit.step(ui.sim);
    paint();
  }

  function toggleRun() {
    if (timer) { stop(); return; }
    ui.btnRun.textContent = 'pause';
    timer = setInterval(step, 620);
  }

  function mount(root) {
    const q = (s) => root.querySelector(s);
    if (!q('[data-vx-prog]') || !window.VmExit) return;

    ui = {
      root,
      prog: q('[data-vx-prog]'),
      struct: q('[data-vx-struct]'),
      facts: q('[data-vx-facts]'),
      out: q('[data-vx-out]'),
      log: q('[data-vx-log]'),
      btnStep: q('[data-vx="step"]'),
      btnRun: q('[data-vx="run"]'),
      vmId: 0,
      sim: null,
    };

    const sel = q('[data-vx-vm]');
    sel.addEventListener('change', () => { ui.vmId = Number(sel.value); reset(); });
    ui.btnStep.addEventListener('click', step);
    ui.btnRun.addEventListener('click', toggleRun);
    q('[data-vx="reset"]').addEventListener('click', reset);

    reset();
  }

  document.addEventListener('overlay:open', (e) => {
    stop();
    ui = null;
    if (e.detail.key === 'demo-kvm') mount(e.detail.content);
  });
  document.addEventListener('overlay:close', () => { stop(); ui = null; });
})();
