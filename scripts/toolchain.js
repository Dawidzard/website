/* ==========================================================================
   TOOLCHAIN DEMO
   A miniature of the three stages the project implements: assemble, link,
   execute. Two source modules, so the linker has real work -- main.s uses a
   symbol that only data.s defines, and you can watch the placeholder in the
   object code get patched once the sections have addresses.

   This is an illustration of the mechanism, running here in the page. It is
   not the project's own code, and its instruction set is a toy chosen to
   make relocation visible in three bytes.

   Encoding: one instruction is three bytes.
       byte 0   opcode << 4 | register
       byte 1-2 operand, little endian
   A relocation is therefore always "patch the 16-bit word at offset+1",
   which keeps the thing being demonstrated easy to point at.
   ========================================================================== */

(() => {
  'use strict';

  const OPS = {
    ldi: { code: 1, args: ['reg', 'imm'] },
    ld: { code: 2, args: ['reg', 'addr'] },
    st: { code: 3, args: ['reg', 'addr'] },
    add: { code: 4, args: ['reg', 'reg2'] },
    sub: { code: 5, args: ['reg', 'reg2'] },
    jmp: { code: 6, args: ['addr'] },
    jnz: { code: 7, args: ['reg', 'addr'] },
    out: { code: 8, args: ['reg'] },
    halt: { code: 9, args: [] },
  };

  const WORD = 3;

  /* --- Assembler ---------------------------------------------------------
     One pass to lay out and record symbols, with anything unresolved noted
     as a relocation rather than guessed at. That split is the whole point:
     the assembler cannot know where `count` lands, so it leaves a hole and
     says so. */

  function assemble(name, text) {
    const bytes = [];
    const symbols = {};     // name -> offset within this module
    const relocs = [];      // { offset, symbol }
    const errors = [];
    const listing = [];

    text.split('\n').forEach((raw, lineNo) => {
      let line = raw.replace(/[;#].*$/, '').trim();
      if (!line) return;

      const label = line.match(/^([A-Za-z_][\w]*)\s*:\s*/);
      if (label) {
        symbols[label[1]] = bytes.length;
        line = line.slice(label[0].length).trim();
        if (!line) return;
      }

      const at = bytes.length;
      const [mnemonic, ...rest] = line.split(/\s+/);
      const argText = rest.join(' ');
      const args = argText ? argText.split(',').map((a) => a.trim()) : [];

      if (mnemonic === '.word') {
        const v = Number(args[0]);
        if (!Number.isFinite(v)) { errors.push(`${name}:${lineNo + 1}: .word needs a number`); return; }
        bytes.push(v & 0xff, (v >> 8) & 0xff, 0);
        listing.push({ at, text: raw.trim(), bytes: 3 });
        return;
      }

      const op = OPS[mnemonic];
      if (!op) { errors.push(`${name}:${lineNo + 1}: unknown instruction "${mnemonic}"`); return; }
      if (args.length !== op.args.length) {
        errors.push(`${name}:${lineNo + 1}: ${mnemonic} takes ${op.args.length} operand(s)`);
        return;
      }

      let reg = 0, operand = 0;
      op.args.forEach((kind, i) => {
        const a = args[i];
        if (kind === 'reg' || kind === 'reg2') {
          const m = a.match(/^r([0-7])$/i);
          if (!m) { errors.push(`${name}:${lineNo + 1}: "${a}" is not r0-r7`); return; }
          if (kind === 'reg') reg = Number(m[1]); else operand = Number(m[1]);
        } else if (kind === 'imm') {
          const v = Number(a);
          if (!Number.isFinite(v)) { errors.push(`${name}:${lineNo + 1}: "${a}" is not a number`); return; }
          operand = v & 0xffff;
        } else {                                  // addr
          const bare = a.replace(/^\[|\]$/g, '');
          if (/^\d+$/.test(bare)) {
            operand = Number(bare) & 0xffff;
          } else {
            // Unknown here by construction: leave a hole, record the need.
            relocs.push({ offset: at, symbol: bare });
            operand = 0;
          }
        }
      });

      bytes.push((op.code << 4) | reg, operand & 0xff, (operand >> 8) & 0xff);
      listing.push({ at, text: raw.trim(), bytes: WORD });
    });

    return { name, bytes, symbols, relocs, errors, listing };
  }

  /* --- Linker ------------------------------------------------------------
     Place each module end to end, shift its symbols by where it landed, then
     walk the relocations and patch. A relocation that finds no definition is
     the classic undefined-reference error, and it is reported as one. */

  function link(modules) {
    const image = [];
    const placed = [];
    const global = {};
    const errors = [];

    for (const m of modules) {
      const base = image.length;
      placed.push({ name: m.name, base, size: m.bytes.length });
      for (const [sym, off] of Object.entries(m.symbols)) {
        if (sym in global) errors.push(`duplicate symbol "${sym}"`);
        global[sym] = base + off;
      }
      image.push(...m.bytes);
    }

    const patches = [];
    for (let i = 0; i < modules.length; i++) {
      const base = placed[i].base;
      for (const r of modules[i].relocs) {
        const target = global[r.symbol];
        if (target === undefined) {
          errors.push(`undefined reference to "${r.symbol}" in ${modules[i].name}`);
          continue;
        }
        const at = base + r.offset + 1;      // the operand field
        image[at] = target & 0xff;
        image[at + 1] = (target >> 8) & 0xff;
        patches.push({ at, symbol: r.symbol, value: target });
      }
    }

    return { image, placed, global, patches, errors };
  }

  /* --- Emulator ----------------------------------------------------------- */

  function newCpu(image) {
    return { pc: 0, regs: new Array(8).fill(0), mem: image.slice(), out: [], halted: false };
  }

  function step(cpu) {
    if (cpu.halted) return cpu;
    const b = cpu.mem[cpu.pc];
    if (b === undefined) { cpu.halted = true; cpu.fault = 'ran off the end of memory'; return cpu; }
    const op = b >> 4;
    const reg = b & 0x0f;
    const operand = cpu.mem[cpu.pc + 1] | (cpu.mem[cpu.pc + 2] << 8);
    let next = cpu.pc + WORD;

    switch (op) {
      case 1: cpu.regs[reg] = operand; break;
      case 2: cpu.regs[reg] = cpu.mem[operand] | (cpu.mem[operand + 1] << 8); break;
      case 3: cpu.mem[operand] = cpu.regs[reg] & 0xff;
              cpu.mem[operand + 1] = (cpu.regs[reg] >> 8) & 0xff; break;
      case 4: cpu.regs[reg] = (cpu.regs[reg] + cpu.regs[operand]) & 0xffff; break;
      case 5: cpu.regs[reg] = (cpu.regs[reg] - cpu.regs[operand]) & 0xffff; break;
      case 6: next = operand; break;
      case 7: if (cpu.regs[reg] !== 0) next = operand; break;
      case 8: cpu.out.push(cpu.regs[reg]); break;
      case 9: cpu.halted = true; break;
      default: cpu.halted = true; cpu.fault = `illegal opcode ${op} at ${cpu.pc}`;
    }
    cpu.pc = next;
    return cpu;
  }

  window.Toolchain = { assemble, link, newCpu, step, OPS, WORD };
})();
