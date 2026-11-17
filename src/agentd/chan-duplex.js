// chan-duplex.js — ONE byte channel of a Mux as a duplex stream, so another Mux can ride it: a link inside a link (cs M1,
// docs: the separation design, «The link» — party to party is a virtual link). ZERO dependencies but node's events; ships in
// the agent bundle like mux.js.
//
// The owner of the OUTER Mux routes three of its callbacks for this channel here: onData(chan) ⇒ push(buf), onWritable(chan)
// ⇒ writable(), onClose(chan) / onDead ⇒ closed(). In return:
//   write(buf)  = the outer data()'s answer — FALSE when the outer channel had to queue (its window or its wire is full), and
//                 then 'drain' follows at the outer channel's onWritable, so an inner Mux holds its frames (mux.js honours a
//                 stream that declares `emitsDrain`) and its producers pause: the outer queue stays within one window.
//                 'drain' comes ONLY after a write that answered false (a socket's own contract — 主开发 2026-11-17): the
//                 outer Mux says onWritable whenever a frame goes straight through, and an inner Mux that heard 'drain' for
//                 each of those re-entered its own flush from inside it — a stack one deeper per frame, and a writable
//                 told for a channel whose CLOSE had already left.
//   push(buf)   emits 'data' to the inner Mux, which parses it synchronously; the outer credit for those bytes is the outer
//                 owner's to return (today's owners credit as they deliver) — real flow control lives at the inner level.
//   destroy()   closes the outer channel; 'close' is emitted once, whichever side ends it.
'use strict';
const { EventEmitter } = require('events');

class ChanDuplex extends EventEmitter {
  constructor(outer, chan) {
    super();
    this.outer = outer;          // { data(chan, buf) → boolean, closeChan(chan) } — a Mux, or a channel handle shaped like one
    this.chan = chan;
    this.emitsDrain = true;      // mux.js holds its frames on a false write and waits for 'drain'
    this.closedAt = 0;
    this._needDrain = false;     // a write answered false: the next outer onWritable is a drain
  }
  write(buf) {
    if (this.closedAt) return false;
    let ok = false; try { ok = this.outer.data(this.chan, buf) !== false; } catch { ok = false; }
    if (!ok) this._needDrain = true;
    return ok;
  }
  push(buf) { if (!this.closedAt) this.emit('data', buf); }
  writable() { if (this.closedAt || !this._needDrain) return; this._needDrain = false; this.emit('drain'); }
  closed() { if (this.closedAt) return; this.closedAt = Date.now(); this.emit('close'); }
  destroy() { if (this.closedAt) return; try { this.outer.closeChan(this.chan); } catch { } this.closed(); }
}

module.exports = { ChanDuplex };
