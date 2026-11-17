'use strict';
/**
 * B-beaf — THE DEVICE LINK HOLDS BACK A SENDER THAT OUTRUNS ITS READER, at the two ends the hub's cure (dial-bridge-credit,
 * src/dial-session-bridge.js) does not reach. SHARED, node builtins only, nothing required: the attach CLI
 * (src/agentd/attach-cli.js, bundled into data/bin) and the device daemon (src/agentd/agentd.js, the signed bundle) both use it.
 * The link's frame code (src/agentd/mux.js) answers `data()` with false when any of it had to wait for the peer's credit, and
 * calls `onWritable(chan)` when that channel's queue drained. A sender that ignores the false queues without bound in its own
 * process; these keep it to about one window plus one chunk.
 *   heldSender  — a sender that PAUSES its source on a false answer and RESUMES it on the channel's writable (the attach CLI's
 *                 stdin road; the device's terminal road, where the source is the pty).
 *   attachRoads — the attach CLI's two roads: the device's bytes to stdout, the device credited ONLY in the write's callback
 *                 (what the reader truly took — the pattern client.js uses for forwards); stdin → the link through heldSender.
 *   pumpPass    — one pass of the device's pipe-session pump: read the buffer file and send while the link takes it; a false
 *                 answer ends the pass `held` (the pump reads nothing more until the channel is writable again).
 *   fileTail    — the device's pipe-session tail over its buffer FILE (the fd, the reads, the close) — what agentd.js runs.
 *   heldPump    — the device's pipe-session TAIL on one channel (src/agentd/agentd.js pipeSessions.attach): pass() on its
 *                 timer, wake() on the channel's writable — which reads again ONLY when the link had held it: the mux says
 *                 writable after EVERY flushed send, and a wake inside a pass would read the same bytes twice.
 */

/** send(buf) → the link's answer; pause() / resume() — the source's. → { send(buf) → bool, writable(), held } */
function heldSender({ send, pause, resume }) {
  let held = false;
  return {
    send(buf) {
      let ok = true;
      try { ok = send(buf) !== false; } catch { ok = true; }   // a dead link answers by its own death, never by a stall here
      if (!ok && !held) { held = true; try { pause(); } catch { } }
      return ok;
    },
    writable() { if (!held) return; held = false; try { resume(); } catch { } },
    get held() { return held; },
  };
}

/** The attach CLI's roads on ONE channel: mux = the device link, stdin / stdout = this process's. */
function attachRoads({ mux, chan, stdin, stdout }) {
  const input = heldSender({ send: (d) => mux.data(chan, d), pause: () => stdin.pause(), resume: () => stdin.resume() });
  return {
    /** device → stdout: credited when the write is DONE (its callback), never when it was merely asked */
    out(buf) {
      const n = buf.length;
      const credit = () => { try { mux.credit(chan, n); } catch { } };
      try { stdout.write(buf, credit); } catch { credit(); }   // a stdout that throws ends this process anyway
    },
    /** stdin → device: a false answer pauses stdin */
    in(d) { return input.send(d); },
    /** the mux's onWritable(chan): only this channel's drain resumes stdin */
    writable(c) { if (c === chan) input.writable(); },
    get held() { return input.held; },
  };
}

/** One pass: read(pos, want) → Buffer | null (null / empty = nothing more now), send(buf) → the link's answer.
 *  → { pos, held } — `held` = the link held this channel back: stop reading until its writable. */
function pumpPass({ pos, size, read, send, chunk = 65536 }) {
  let held = false;
  while (pos < size) {
    let b;
    try { b = read(pos, Math.min(chunk, size - pos)); } catch { break; }   // r2 (#7): what was sent stays sent — never re-read
    if (!b || !b.length) break;
    pos += b.length;
    if (send(b) === false) { held = true; break; }
  }
  return { pos, held };
}

/** stat() → the file's size now | null (not open yet); read / send as pumpPass. → { pass(), wake(), held, pos } */
function heldPump({ pos = 0, stat, read, send, chunk = 65536 }) {
  let held = false;
  const pass = () => {
    if (held) return;
    const size = stat();
    if (size == null) return;
    if (pos > size) pos = 0; // the buffer was rewritten shorter: from its start
    ({ pos, held } = pumpPass({ pos, size, read, send, chunk }));
  };
  return { pass, wake() { if (!held) return; held = false; pass(); }, get held() { return held; }, get pos() { return pos; } };
}

/** THE DEVICE'S TAIL OVER ITS BUFFER FILE (src/agentd/agentd.js pipeSessions.attach runs exactly this): the file opened at
 *  the first pass that finds it, read at positions with readSync, closed by close(); fs is the daemon's own (injected).
 *  → { pass(), wake(), close(), held, pos, fd } — pass / wake never throw (a read error ends the pass where it was). */
function fileTail({ file, offset = 0, send, fs, chunk = 65536 }) {
  let fd = null;
  const pump = heldPump({
    pos: Math.max(0, Number(offset) || 0), chunk, send,
    stat: () => { if (fd === null) { try { fd = fs.openSync(file, 'r'); } catch { return null; } } return fs.fstatSync(fd).size; },
    read: (p, want) => { const b = Buffer.alloc(want); const n = fs.readSync(fd, b, 0, want, p); return n > 0 ? b.subarray(0, n) : null; },
  });
  return {
    pass() { try { pump.pass(); } catch { } },
    wake() { try { pump.wake(); } catch { } },
    close() { try { if (fd !== null) fs.closeSync(fd); } catch { } fd = null; },
    get held() { return pump.held; }, get pos() { return pump.pos; }, get fd() { return fd; },
  };
}

module.exports = { heldSender, attachRoads, pumpPass, heldPump, fileTail };
