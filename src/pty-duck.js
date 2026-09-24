'use strict';
// PURE (imports nothing) THE node-pty DUCK's listener half — ONE implementation
// for every non-node-pty bridge that reaches setupSessionPty (B-ae4b).
//
// node-pty's own `onData`/`onExit` keep a SET of listeners and hand each
// registration back a `{dispose}`. setupSessionPty relies on that: it registers
// the LIVENESS STAMP first (`session._lastPtyDataAt`, read only through
// `ptyQuietSince`) and the protocol consumer second. A duck with ONE slot
// (`onData: (cb) => { h.onData = … cb … }`) lets the LAST registration win, so
// the consumer kept streaming and the STAMP was silently dropped — the MEASURED
// failure mode (not a dead consumer): `ptyQuietSince` then reads "silent" for a
// bridge that is relaying bytes, and both liveness triggers act on that lie.
//
// `hold` (the OpenCode serve terminal's shape): bytes emitted before ANY
// listener exists are kept (bounded) and replayed once, in a microtask after
// the first registration, to EVERY listener registered by then — so the stamp
// and the consumer, which setupSessionPty registers synchronously one after the
// other, BOTH see the banner. A one-slot hold flushed it into whichever
// listener came first (the stamp) and the terminal opened blank.

function ptyListeners({ hold = 0 } = {}) {
  const cbs = new Set();
  let held = hold > 0 ? [] : null;   // null = no longer holding
  let flushQueued = false;
  const fire = (v) => { for (const cb of [...cbs]) { try { cb(v); } catch { } } };
  const flush = () => {
    const backlog = held || [];
    held = null; flushQueued = false;
    for (const v of backlog) fire(v);
  };
  return {
    on(cb) {
      cbs.add(cb);
      if (held && !flushQueued) {
        if (held.length) { flushQueued = true; queueMicrotask(flush); }
        else held = null;             // nothing arrived before the first listener — stop holding
      }
      return { dispose() { cbs.delete(cb); } };
    },
    emit(v) {
      if (held) { if (held.length < hold) held.push(v); return; }   // before (or while replaying to) the first listeners: keep order
      fire(v);
    },
    get size() { return cbs.size; },
  };
}

/** The node-pty duck over a device PIPE session handle (`dm.openPipeSession`):
 *  the R6 create path (src/ws-create.js) and the R6 boot re-open
 *  (src/server/boot-restore.js) — they carried two verbatim copies of a
 *  one-slot literal. Takes over `handle.onData`/`handle.onExit`. */
function pipePtyShim(handle) {
  const data = ptyListeners(), exit = ptyListeners();
  handle.onData = (buf) => data.emit(typeof buf === 'string' ? buf : buf.toString('utf-8'));
  handle.onExit = (code) => exit.emit({ exitCode: code ?? 0 });
  return {
    pid: handle.pid || -1,
    onData: (cb) => data.on(cb),
    onExit: (cb) => exit.on(cb),
    write: (str) => { try { handle.write(str); } catch { } },
    resize: () => { },              // a chat pipe has no window size
    kill: () => { try { handle.kill(); } catch { } },
  };
}

module.exports = { ptyListeners, pipePtyShim };
