/* ==========================================================================
   VM EXIT SIMULATION
   What a hypervisor built on KVM actually does, step by step: almost
   nothing. The hardware runs the guest at full speed, and the monitor only
   wakes up when the guest does something it is not allowed to finish on its
   own. Each of those is one vm exit.

   The guest program here is the one the project's phase B runs: print,
   then open / write / lseek / read / close over the file protocol, then
   halt. Two details from that code are modelled because they are the
   interesting ones:

     - a filename is prefixed per VM, so the guest's "test.txt" is the
       host's "vm0_test.txt" and two guests cannot tread on each other
     - OUT is synchronous, so by the time the instruction retires the
       monitor has already serviced the request and written `ret` back
       into the structure on the guest's own stack
   ========================================================================== */

(() => {
  'use strict';

  const SERIAL = 0xE9;
  const FILE_PORT = 0x0278;

  // op: what the guest does. `cost` is how many instructions it represents,
  // so the ratio of work to exits is visible rather than asserted.
  const PROGRAM = [
    { op: 'io', port: SERIAL, text: 'print("Guest running, phase B.")',
      out: 'Guest running, phase B.', cost: 24 },
    { op: 'file', call: 'open', args: '"test.txt", O_RDWR|O_CREAT',
      text: 'fd = open("test.txt", O_RDWR|O_CREAT)', cost: 11 },
    { op: 'file', call: 'write', args: 'fd, "Data from the guest.", 20',
      text: 'write(fd, "Data from the guest.", 20)', cost: 13 },
    { op: 'file', call: 'lseek', args: 'fd, 0, SEEK_SET',
      text: 'lseek(fd, 0, SEEK_SET)', cost: 9 },
    { op: 'file', call: 'read', args: 'fd, buf, 32',
      text: 'n = read(fd, buf, 32)', cost: 12 },
    { op: 'io', port: SERIAL, text: 'print(buf)',
      out: 'Data from the guest.', cost: 22 },
    { op: 'file', call: 'close', args: 'fd', text: 'close(fd)', cost: 7 },
    { op: 'compute', text: 'checksum loop over the buffer', cost: 1840 },
    { op: 'hlt', text: 'hlt', cost: 1 },
  ];

  function create(vmId = 0) {
    return {
      vmId,
      pc: 0,
      prog: PROGRAM,
      where: 'guest',        // 'guest' | 'monitor'
      exits: 0,
      instructions: 0,
      output: [],
      hostFile: null,        // the name the host actually opened
      offset: 0,
      fd: null,
      request: null,         // the file_request currently in guest memory
      log: [],
      done: false,
      lastExit: null,
    };
  }

  function note(s, side, text) {
    s.log.push({ side, text });
    if (s.log.length > 40) s.log.shift();
  }

  function hostName(s, guestName) {
    // The prefix is what keeps two guests out of each other's files.
    return `vm${s.vmId}_${guestName}`;
  }

  function step(s) {
    if (s.done) return s;
    const op = s.prog[s.pc];

    // Second half of an exit: control is in the monitor, which services the
    // request and hands the processor back.
    if (s.where === 'monitor') {
      if (op.op === 'io') {
        s.output.push(op.out);
        note(s, 'monitor', `wrote ${op.out.length} bytes to stdout`);
      } else if (op.op === 'file') {
        const r = s.request;
        if (op.call === 'open') {
          s.hostFile = hostName(s, 'test.txt');
          s.fd = 3;
          r.ret = s.fd;
          note(s, 'monitor', `opened host file ${s.hostFile} -> fd ${s.fd}`);
        } else if (op.call === 'write') {
          r.ret = 20; s.offset = 20;
          note(s, 'monitor', `wrote 20 bytes to ${s.hostFile}`);
        } else if (op.call === 'lseek') {
          r.ret = 0; s.offset = 0;
          note(s, 'monitor', 'seek to 0');
        } else if (op.call === 'read') {
          r.ret = 20; s.offset = 20;
          note(s, 'monitor', `read 20 bytes from ${s.hostFile} into guest memory`);
        } else if (op.call === 'close') {
          r.ret = 0; s.fd = null;
          note(s, 'monitor', `closed ${s.hostFile}`);
        }
        note(s, 'monitor', `wrote ret = ${r.ret} back into the guest's structure`);
      }
      s.where = 'guest';
      s.pc++;
      s.request = null;
      if (s.pc >= s.prog.length) s.done = true;
      return s;
    }

    // In the guest.
    s.instructions += op.cost;

    if (op.op === 'compute') {
      note(s, 'guest', `${op.cost} instructions, no exit`);
      s.pc++;
      if (s.pc >= s.prog.length) s.done = true;
      return s;
    }

    if (op.op === 'hlt') {
      s.exits++;
      s.lastExit = 'KVM_EXIT_HLT';
      note(s, 'guest', 'hlt');
      note(s, 'monitor', 'KVM_EXIT_HLT - the guest has finished');
      s.done = true;
      s.where = 'guest';
      s.pc++;
      return s;
    }

    s.exits++;
    s.lastExit = 'KVM_EXIT_IO';
    if (op.op === 'io') {
      note(s, 'guest', `out 0x${op.port.toString(16).toUpperCase()}, one byte at a time`);
    } else {
      s.request = { call: op.call, args: op.args, ret: null, addr: 0x7FD0 };
      note(s, 'guest', `filled a file_request on its stack at 0x${s.request.addr.toString(16)}`);
      note(s, 'guest', `outl(0x0278, 0x${s.request.addr.toString(16)})`);
    }
    s.where = 'monitor';
    return s;
  }

  function run(s, limit = 200) {
    let n = 0;
    while (!s.done && n++ < limit) step(s);
    return s;
  }

  window.VmExit = { create, step, run, PROGRAM, SERIAL, FILE_PORT };
})();
