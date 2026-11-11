/* ==========================================================================
   TOOLCHAIN DEMO -- the panel
   Drives scripts/toolchain.js. Kept apart from it so the assembler, linker
   and CPU can be tested without a DOM, which is where the bugs would be.
   ========================================================================== */

(() => {
  'use strict';

  const hex = (n, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');

  let ui = null;

  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  /* --- Rendering each stage ---------------------------------------------- */

  function renderObjects(mods) {
    return mods.map((m) => {
      const syms = Object.entries(m.symbols)
        .map(([s, o]) => `${s} = +${hex(o)}`).join('   ') || '(none)';
      const rel = m.relocs.length
        ? m.relocs.map((r) => `+${hex(r.offset + 1)} needs ${r.symbol}`).join('   ')
        : '(none)';
      const bytes = m.bytes.map((b, i) => {
        // The operand of a relocated instruction is the hole being left.
        const hole = m.relocs.some((r) => i === r.offset + 1 || i === r.offset + 2);
        return `<span class="${hole ? 'tc-hole' : ''}">${hex(b)}</span>`;
      }).join(' ');
      return `<div class="tc-block">
        <p class="tc-h">${esc(m.name)} &middot; object</p>
        <p class="tc-row"><span>symbols</span><code>${esc(syms)}</code></p>
        <p class="tc-row"><span>relocations</span><code>${esc(rel)}</code></p>
        <p class="tc-row"><span>bytes</span><code class="tc-bytes">${bytes}</code></p>
      </div>`;
    }).join('');
  }

  function renderLink(linked) {
    if (linked.errors.length) {
      return `<div class="tc-block"><p class="tc-h tc-err">link failed</p>
        <p class="tc-row"><span></span><code>${esc(linked.errors.join('\n'))}</code></p></div>`;
    }
    const layout = linked.placed
      .map((p) => `${p.name} @ ${hex(p.base, 4)} (${p.size} bytes)`).join('   ');
    const patches = linked.patches
      .map((p) => `${hex(p.at, 4)} &larr; ${p.symbol} = ${hex(p.value, 4)}`).join('   ');
    return `<div class="tc-block">
      <p class="tc-h">linked image</p>
      <p class="tc-row"><span>layout</span><code>${esc(layout)}</code></p>
      <p class="tc-row"><span>patched</span><code>${patches || '(none)'}</code></p>
    </div>`;
  }

  function renderImage(linked, cpu) {
    const patched = new Set();
    linked.patches.forEach((p) => { patched.add(p.at); patched.add(p.at + 1); });
    const cells = linked.image.map((b, i) => {
      const cls = [];
      if (patched.has(i)) cls.push('tc-patched');
      if (cpu && !cpu.halted && i >= cpu.pc && i < cpu.pc + 3) cls.push('tc-pc');
      return `<span class="${cls.join(' ')}">${hex(cpu ? cpu.mem[i] : b)}</span>`;
    });
    const rows = [];
    for (let i = 0; i < cells.length; i += 12) {
      rows.push(`<span class="tc-addr">${hex(i, 4)}</span>  ${cells.slice(i, i + 12).join(' ')}`);
    }
    return `<div class="tc-block"><p class="tc-h">memory</p>
      <pre class="tc-mem">${rows.join('\n')}</pre></div>`;
  }

  function renderCpu(cpu) {
    const regs = cpu.regs
      .map((v, i) => `r${i}=${hex(v, 4)}`).join('  ');
    const state = cpu.fault ? `fault: ${cpu.fault}` : cpu.halted ? 'halted' : 'running';
    return `<div class="tc-block">
      <p class="tc-h">cpu &middot; ${esc(state)}</p>
      <p class="tc-row"><span>pc</span><code>${hex(cpu.pc, 4)}</code></p>
      <p class="tc-row"><span>registers</span><code>${esc(regs)}</code></p>
      <p class="tc-row"><span>output</span><code class="tc-out">${
        cpu.out.length ? cpu.out.join('  ') : '(nothing yet)'}</code></p>
    </div>`;
  }

  function paint() {
    const parts = [];
    if (ui.mods) parts.push(renderObjects(ui.mods));
    if (ui.linked) parts.push(renderLink(ui.linked));
    if (ui.linked && !ui.linked.errors.length) parts.push(renderImage(ui.linked, ui.cpu));
    if (ui.cpu) parts.push(renderCpu(ui.cpu));
    ui.stage.innerHTML = parts.join('') ||
      '<p class="tc-hint">Assemble the two modules to begin.</p>';
  }

  function setStatus(text, bad) {
    ui.status.textContent = text;
    ui.status.classList.toggle('is-bad', !!bad);
  }

  /* --- Actions ------------------------------------------------------------ */

  function doAssemble() {
    const T = window.Toolchain;
    ui.mods = [T.assemble('main.s', ui.main.value), T.assemble('data.s', ui.data.value)];
    ui.linked = null;
    ui.cpu = null;
    const errs = ui.mods.flatMap((m) => m.errors);
    setStatus(errs.length ? errs.join('  |  ')
      : 'assembled; count is still a hole, because only data.s knows where it is', errs.length);
    paint();
    enable();
  }

  function doLink() {
    if (!ui.mods) return;
    ui.linked = window.Toolchain.link(ui.mods);
    ui.cpu = null;
    setStatus(ui.linked.errors.length ? ui.linked.errors.join('  |  ')
      : `linked; ${ui.linked.patches.length} reference(s) patched`,
      ui.linked.errors.length);
    paint();
    enable();
  }

  function doStep() {
    const T = window.Toolchain;
    if (!ui.linked || ui.linked.errors.length) return;
    if (!ui.cpu) ui.cpu = T.newCpu(ui.linked.image);
    else T.step(ui.cpu);
    setStatus(ui.cpu.halted ? (ui.cpu.fault || 'halted') : `pc = ${hex(ui.cpu.pc, 4)}`,
              !!ui.cpu.fault);
    paint();
    enable();
  }

  function doRun() {
    const T = window.Toolchain;
    if (!ui.linked || ui.linked.errors.length) return;
    ui.cpu = T.newCpu(ui.linked.image);
    let guard = 0;
    // A student program can loop forever; stop rather than hang the tab.
    while (!ui.cpu.halted && guard++ < 20000) T.step(ui.cpu);
    setStatus(guard >= 20000 ? 'stopped after 20000 steps - does it terminate?'
      : ui.cpu.fault || `halted after ${guard} steps`, guard >= 20000 || !!ui.cpu.fault);
    paint();
    enable();
  }

  function doReset() {
    ui.mods = ui.linked = ui.cpu = null;
    setStatus('ready');
    paint();
    enable();
  }

  function enable() {
    const linkedOk = ui.linked && !ui.linked.errors.length;
    ui.btn.link.disabled = !ui.mods;
    ui.btn.step.disabled = !linkedOk;
    ui.btn.run.disabled = !linkedOk;
  }

  /* --- Mount -------------------------------------------------------------- */

  function mount(root) {
    const q = (s) => root.querySelector(s);
    const main = q('[data-tc-main]');
    if (!main || !window.Toolchain) return;

    ui = {
      main,
      data: q('[data-tc-data]'),
      stage: q('[data-tc-stage]'),
      status: q('[data-tc-status]'),
      btn: {
        assemble: q('[data-tc="assemble"]'),
        link: q('[data-tc="link"]'),
        step: q('[data-tc="step"]'),
        run: q('[data-tc="run"]'),
        reset: q('[data-tc="reset"]'),
      },
      mods: null, linked: null, cpu: null,
    };

    ui.btn.assemble.addEventListener('click', doAssemble);
    ui.btn.link.addEventListener('click', doLink);
    ui.btn.step.addEventListener('click', doStep);
    ui.btn.run.addEventListener('click', doRun);
    ui.btn.reset.addEventListener('click', doReset);

    doReset();
    doAssemble();     // open on something already showing its working
  }

  document.addEventListener('overlay:open', (e) => {
    ui = null;
    if (e.detail.key === 'demo-asm') mount(e.detail.content);
  });
  document.addEventListener('overlay:close', () => { ui = null; });
})();
