// chan-socket.js — ONE byte channel of a Mux as a Node stream.Duplex shaped like a socket, so an http.Server (and its ws
// upgrade) takes each channel the interface opens as one CONNECTION (cs M1 piece 1b, for the hub's side of the link; the
// link-inside-a-link adapter is chan-duplex.js). ZERO dependencies but node's stream.
//
//   writes   — _write hands a chunk to mux.data(); when the channel's window or the wire is full (data() says false) the
//              write's callback waits for the channel's onWritable: the http server's own back-pressure follows the link's
//              credit, and the Mux never queues more than one write for this channel.
//   reads    — bytes the owner pushes are credited back to the peer only as the stream's reader TAKES them (what still sits
//              in the readable buffer is not credited), so a slow reader slows its sender.
//   ends     — a CLOSE is a HALF-close, as a TCP FIN: the side that says it sends nothing more (the interface's relay reads it
//              so — a page that half-closes after an upload must reach its owner whole). end() sends THIS side's CLOSE after its
//              queued bytes (mux.closeChan, which then forgets the channel's send state — the only state the Mux keeps for
//              it); the reader still takes, and credits, what the far side sends until the far CLOSE. A far CLOSE ends the
//              readable side only: a reply written after it still goes out under credit, then this side's CLOSE
//              (allowHalfOpen false, as a net.Socket: the writable side ends by itself once the readable has ended).
//   sink     — a socket destroyed before the far CLOSE leaves its channel as a SINK in the router: what the far side still
//              sends is credited and dropped, never kept, until its CLOSE. There is no reset frame, so this keeps the far
//              window from stalling on a reader that is gone. The destroy itself first credits what still sat UNREAD in
//              the socket (a paused keep-alive socket can hold a whole window: else the far side stalls for good, its
//              CLOSE never leaves and the sink is never removed — 主开发 2026-11-17).
//   death    — the owner calls the router's dead() from the Mux's onDead: every socket is ended on its far side, then
//              destroyed with «link lost» (a held write's callback gets the error), and both maps are cleared.
//   the link — the owner's Mux MUST be built with `closeAfterQueue` (a CLOSE behind the channel's own queued bytes, the
//              interface's link): without it end() would drop the reply still queued. createChanSockets refuses one.
//   socket   — remoteAddress / remotePort / encrypted come from the open line's stamp; setNoDelay / setTimeout /
//              setKeepAlive / ref / unref are accepted and do nothing (a channel has no TCP of its own).
// The owner of the Mux routes its callbacks through createChanSockets(mux): onData / onWritable / onClose for a channel it
// opened with open(chan, stamp). Those channels must not be credited by the owner — the socket credits them itself.
'use strict';
const { Duplex } = require('stream');

class ChanSocket extends Duplex {
  constructor(mux, chan, stamp = {}) {
    super({ allowHalfOpen: false });
    this.mux = mux; this.chan = chan;
    this.remoteAddress = typeof stamp.addr === 'string' ? stamp.addr : '127.0.0.1';
    this.remotePort = Number(stamp.port) || 0;
    this.remoteFamily = this.remoteAddress.includes(':') ? 'IPv6' : 'IPv4';
    this.encrypted = !!stamp.secure;
    this.connecting = false;
    this._pushed = 0; this._credited = 0; this._waitWrite = null; this._sentClose = false; this._farClosed = false;
  }
  _write(chunk, enc, cb) {
    if (this._sentClose) { cb(new Error('this side of the channel is closed')); return; }
    const ok = this.mux.data(this.chan, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
    if (ok) cb(); else this._waitWrite = cb;   // resumed by drained()
  }
  _final(cb) { this._closeChan(); cb(); }   // THIS side's CLOSE after its queued bytes; the far side may still send (a half-close)
  _destroy(err, cb) {
    const owed = this._pushed - this._credited;   // what the far side sent that no reader will take now — its window back
    if (owed > 0 && !this._farClosed) { this._credited += owed; try { this.mux.credit(this.chan, owed); } catch { } }
    this._closeChan(); const w = this._waitWrite; this._waitWrite = null; if (w) w(err || new Error('destroyed')); cb(err);
  }
  _read() { this._settleCredit(); }
  // every reader takes bytes through read() — the flowing mode's own loop too — so the credit is settled right there
  read(n) { const r = super.read(n); this._settleCredit(); return r; }
  _settleCredit() {
    if (this._farClosed) return;   // the far side sends nothing more: no credit is owed
    const consumed = this._pushed - this._credited - this.readableLength;   // taken by the reader
    if (consumed > 0) { this._credited += consumed; try { this.mux.credit(this.chan, consumed); } catch { } }
  }
  _closeChan() { if (this._sentClose) return; this._sentClose = true; try { this.mux.closeChan(this.chan); } catch { } }
  // ── the owner's three routes ──
  pushData(buf) { this._pushed += buf.length; this.push(buf); this._settleCredit(); }
  // NOT named `writable`: that is the stream's own property (Node's end-of-stream and http.Server read `socket.writable` — a
  // method there is always truthy, so a socket ended both ways was never destroyed and never left its router)
  drained() { const w = this._waitWrite; this._waitWrite = null; if (w) w(); }
  remoteClosed() { if (this._farClosed) return; this._farClosed = true; this.push(null); }   // the readable side ends; writes go on
  // ── what an http.Server asks of a socket ──
  setNoDelay() { return this; } setKeepAlive() { return this; } ref() { return this; } unref() { return this; }
  setTimeout(ms, cb) { if (typeof cb === 'function') this.once('timeout', cb); return this; }
  address() { return { address: this.remoteAddress, port: this.remotePort, family: this.remoteFamily }; }
}

/** The router an owner plugs into its Mux: open(chan, stamp) → a ChanSocket; onData / onWritable / onClose return true when
 *  the channel is one of its sockets or sinks (the owner then neither credits nor handles it itself). A socket stays routed
 *  until it has closed, so its writes still drain after a far CLOSE; `size` = sockets + sinks still held. */
function createChanSockets(mux) {
  if (!mux || mux.closesAfterQueue !== true) throw new Error('createChanSockets: the link\'s Mux must be built with closeAfterQueue (a socket\'s CLOSE leaves after its queued bytes)');
  const socks = new Map(), sinks = new Set();
  return {
    open(chan, stamp) {
      const s = new ChanSocket(mux, chan, stamp); socks.set(chan, s);
      s.once('close', () => { socks.delete(chan); if (!s._farClosed) sinks.add(chan); });   // gone before the far CLOSE ⇒ a sink
      return s;
    },
    onData(chan, buf) {
      const s = socks.get(chan); if (s) { s.pushData(buf); return true; }
      if (!sinks.has(chan)) return false;
      try { mux.credit(chan, buf.length); } catch { }   // credited and dropped: nobody reads it any more
      return true;
    },
    onWritable(chan) { const s = socks.get(chan); if (s) { s.drained(); return true; } return sinks.has(chan); },
    onClose(chan) { const s = socks.get(chan); if (s) { s.remoteClosed(); return true; } return sinks.delete(chan); },
    /** the link died (the owner calls this from the Mux's onDead): each socket ends on its far side, then is destroyed */
    dead(reason = 'link lost') {
      const all = [...socks.values()]; socks.clear(); sinks.clear();
      for (const s of all) { try { s.remoteClosed(); } catch { } try { s.destroy(new Error(reason)); } catch { } }
    },
    get size() { return socks.size + sinks.size; },
  };
}

module.exports = { ChanSocket, createChanSockets };
