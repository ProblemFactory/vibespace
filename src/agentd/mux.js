// mux.js — the CS-refactor wire protocol (M0, docs/design-remote-cs.md
// addendum). Length-prefixed binary mux over any duplex byte stream:
//   [u32BE len][u8 type][u32BE chan][payload]   (len = 1 + 4 + payload.length)
// Types: 0=DATA 1=CLOSE 2=CREDIT 3=PING 4=PONG.
// Chan 0 = newline-JSON control (credit-exempt); byte channels ≥1 are opened
// implicitly by the CONNECTING side and flow-controlled by per-channel byte
// credits. ZERO dependencies — this exact file ships inside the daemon bundle
// AND is required by the server (invariant: one protocol, no local special
// case). The frame format is the protocol-v1 compatibility surface — change
// only with a protoVersion bump (invariant #8).
'use strict';

const PROTO_VERSION = 1;
const T = { DATA: 0, CLOSE: 1, CREDIT: 2, PING: 3, PONG: 4 };
const INITIAL_WINDOW = 262144; // bytes, per byte-channel per direction
const PING_INTERVAL = 10000;
const PING_DEAD_MISSES = 3;
// lane lg-remote-hardening (B-7f0b, design q-042 D8): THE LINE'S BOUND. A frame's length field over FRAME_MAX ends the link (the
// release's bound); a control line rides ONE frame, so no line is longer than LINE_MAX. The SENDER refuses an over-long line BY
// NAME before it sends a frame the peer must die on (an `overLong` hook may send a refusal in its place — the agent's: that ONE
// op refused, the link kept); the RECEIVER ends the link BY NAME on a line still open past it (a line split over frames used to
// grow without bound). The same numbers as src/agentd/answer-caps.js (scripts/test-answer-caps.mjs pins them equal).
const FRAME_MAX = 64 * 1024 * 1024;
const LINE_MAX = FRAME_MAX - 5;

function encodeFrame(type, chan, payload = Buffer.alloc(0)) {
  const head = Buffer.alloc(9);
  head.writeUInt32BE(1 + 4 + payload.length, 0);
  head.writeUInt8(type, 4);
  head.writeUInt32BE(chan >>> 0, 5);
  return payload.length ? Buffer.concat([head, payload]) : head;
}

/**
 * Mux — wraps a duplex stream (net.Socket or any {write, on('data'/'close')}).
 * Events via callbacks:
 *   onControl(obj, bytes)       — parsed chan-0 JSON line (bytes: the line's length — the hub judges an answer's cap by it)
 *   onData(chan, buf)           — byte-channel data (consumer MUST call
 *                                 mux.credit(chan, n) as it consumes)
 *   onClose(chan)               — peer half-closed a byte channel
 *   onDead(reason)              — heartbeat death or stream close
 *   onWritable(chan)            — a previously queued channel's send queue
 *                                 drained (producers that paused on a false
 *                                 data() return may resume). Local only — no
 *                                 wire change.
 *
 * THE STREAM'S BACK-PRESSURE IS HONOURED (cs M1, the link — wire-neutral): a stream whose write() says FALSE is full; from
 * then every frame waits, IN ORDER, until its 'drain' — so data() says false when the WIRE is full, not only when the
 * channel's window is, and a producer that pauses on it is resumed by onWritable after the drain. Without it a Mux riding
 * a byte channel of another Mux (a link inside a link, src/agentd/chan-duplex.js) told every inner producer «writable»
 * while the outer channel queued each inner channel's whole window. Only a stream that DECLARES `emitsDrain` is held (the
 * adapter); a socket keeps today's write-through, which its windows already bound. While the wire is full a channel's
 * data waits in its own queue (its window untouched); a control line may pass it, as it passes data waiting for credit
 * today, but a channel's CLOSE never passes that channel's own data.
 * BOUNDS (an inner link's): `maxControl` — a chan-0 line longer than it is a protocol error (the link dies, named), and
 * control() refuses to send one; `maxFrame` — a longer frame is a protocol error. `heartbeat: false` — a link inside a link
 * takes its liveness from the outer one (an inner PING waits behind the outer channel's credit).
 */
class Mux {
  constructor(stream, { onControl, onData, onClose, onDead, onWritable, heartbeat = true, lineMax = LINE_MAX, overLong = null, maxControl = 0, maxFrame = FRAME_MAX } = {}) {
    this.stream = stream;
    this._lineMax = Number(lineMax) > 0 ? Math.min(Number(lineMax), LINE_MAX) : LINE_MAX;   // a suite may lower it; never above the frame
    this._overLong = typeof overLong === 'function' ? overLong : null;
    this._maxControl = Number(maxControl) > 0 ? Number(maxControl) : 0;   // 0 = unbounded (the outer link, until every growable control payload rides a byte channel)
    this._maxFrame = Number(maxFrame) > 0 ? Math.min(Number(maxFrame), FRAME_MAX) : FRAME_MAX;   // an inner link's bound; never above the release's
    this._honorsDrain = stream.emitsDrain === true;   // only a stream that SAYS it emits 'drain' (the channel adapter): an outer link keeps today's socket buffer, bounded by its windows
    this._closeAfter = new Set(); // channels whose CLOSE waits behind their own held data
    this._wireFull = false;   // the stream said write() === false; every frame waits for its 'drain'
    this._wireQ = [];         // encoded frames waiting for the drain, in order
    this._wireWaiters = new Set(); // channels whose producer was told false only because the wire was full
    this.onControl = onControl || (() => {});
    this.onData = onData || (() => {});
    this.onCloseChan = onClose || (() => {});
    this.onDead = onDead || (() => {});
    this.onWritable = onWritable || (() => {});
    this._acc = Buffer.alloc(0);
    this._ctlAcc = Buffer.alloc(0);
    this._sendWin = new Map();  // chan → bytes we may still send
    this._sendQ = new Map();    // chan → [{buf}] waiting for credit
    this._dead = false;
    this._missedPongs = 0;
    this._pongWaiters = []; // ping(ms): resolved by the next PONG of any kind
    this._on = [['data', (d) => { if (!this._detached) this._feed(d); }], ['close', () => { if (!this._detached) this._die('stream closed'); }], ['error', () => { if (!this._detached) this._die('stream error'); }]];
    for (const [e, f] of this._on) stream.on(e, f);
    if (this._honorsDrain) { const d = ['drain', () => { if (!this._detached) this._drained(); }]; this._on.push(d); stream.on(d[0], d[1]); }   // detach() lets it go too
    if (heartbeat) {
      this._hb = setInterval(() => {
        if (this._dead) return;
        if (++this._missedPongs > PING_DEAD_MISSES) return this._die('heartbeat: ' + PING_DEAD_MISSES + ' missed pongs');
        this._raw(T.PING, 0);
      }, PING_INTERVAL);
      if (this._hb.unref) this._hb.unref();
    }
  }

  _raw(type, chan, payload) {
    if (this._dead) return false;
    const f = encodeFrame(type, chan, payload);
    if (this._wireFull) { this._wireQ.push(f); return false; }
    let ok; try { ok = this.stream.write(f); } catch { this._die('write failed'); return false; }
    if (ok === false && this._honorsDrain) { this._wireFull = true; return false; }
    return ok;
  }

  /** the stream drained: the waiting frames go first, in order, then every channel the wire held; a channel whose
   *  queue is empty again hears onWritable */
  _drained() {
    if (this._dead) return;
    this._wireFull = false;
    while (this._wireQ.length && !this._wireFull) {
      const f = this._wireQ.shift();
      let ok; try { ok = this.stream.write(f); } catch { this._die('write failed'); return; }
      if (ok === false) this._wireFull = true;
    }
    if (this._wireFull) return;
    for (const chan of [...this._sendQ.keys()]) { this._flush(chan); if (this._wireFull) return; }
    const waiting = [...this._wireWaiters]; this._wireWaiters.clear();
    for (const chan of waiting) if (!this._sendQ.get(chan)?.length) this.onWritable(chan);
  }

  /** chan-0 control message (JSON line). A line over the link's bound is never sent: the `overLong` hook's refusal goes in its
   *  place, or it THROWS by name (control-line-too-large) — the caller's refusal, never a frame the peer must die on.
   *  → true when the line went as it was, false when its refusal went instead. */
  control(obj) {
    let b = Buffer.from(JSON.stringify(obj) + '\n');
    // an INNER link's own bound (cs M1, the link): a line over `maxControl` is refused by name before any frame
    if (this._maxControl && b.length - 1 > this._maxControl) { const e = new Error(`control line of ${b.length - 1} bytes over this link's ${this._maxControl}`); e.code = 'control_too_long'; throw e; }
    if (b.length > this._lineMax) {
      let sub = null; if (this._overLong) { try { sub = this._overLong(obj, b.length, this._lineMax); } catch { sub = null; } }
      const sb = sub ? Buffer.from(JSON.stringify(sub) + '\n') : null;
      if (!sb || sb.length > this._lineMax) throw Object.assign(new Error(`a control line of ${b.length} bytes (${(obj && obj.op) || 'a line'}) is over the device link's ${this._lineMax} — not sent`), { code: 'control-line-too-large', op: (obj && obj.op) || null, bytes: b.length, cap: this._lineMax });
      this._raw(T.DATA, 0, sb);
      return false;
    }
    this._raw(T.DATA, 0, b);
    return true;
  }

  /** Is the peer answering RIGHT NOW? One PING, true on the next PONG (the heartbeat's counts too), false at the
   *  deadline or on a dead mux. Never throws (verify-r1 B9: the duplicate-device probe). */
  ping(ms = 1500) {
    if (this._dead) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; resolve(false); } }, Math.max(1, Number(ms) || 1500));
      if (t.unref) t.unref();
      this._pongWaiters.push((ok) => { if (!done) { done = true; clearTimeout(t); resolve(!!ok); } });
      if (!this._raw(T.PING, 0)) { done = true; clearTimeout(t); resolve(false); }
    });
  }

  /** byte-channel data with credit flow control; returns false when any of it
   *  had to be queued. A write larger than the window sends up to the window
   *  now and queues the rest (NOT all-or-nothing — that starved large writes). */
  data(chan, buf) {
    if (!this._sendWin.has(chan)) this._sendWin.set(chan, INITIAL_WINDOW);
    // append to the channel's pending tail, then flush what the window allows
    const q = this._sendQ.get(chan);
    if (q && q.length) { q.push(buf); this._sendQ.set(chan, q); this._flush(chan); return false; }
    this._sendQ.set(chan, [buf]);
    this._flush(chan);
    if (this._sendQ.get(chan)?.length) return false;
    if (this._wireFull) { this._wireWaiters.add(chan); return false; }   // sent onto a full wire: pause until the drain
    return true;
  }

  _flush(chan) {
    const q = this._sendQ.get(chan);
    if (!q) return;
    while (q.length) {
      if (this._wireFull) { this._wireWaiters.add(chan); return; }   // the wire is full: the channel waits for the drain
      let win = this._sendWin.get(chan) ?? INITIAL_WINDOW;
      if (win <= 0) break;
      const head = q[0];
      if (head.length <= win) {
        q.shift();
        this._sendWin.set(chan, win - head.length);
        this._raw(T.DATA, chan, head);
      } else {
        // split: send a window-sized slice now, keep the remainder at the head
        q[0] = head.subarray(win);
        this._sendWin.set(chan, 0);
        this._raw(T.DATA, chan, head.subarray(0, win));
      }
    }
    if (!q.length) {
      this._sendQ.delete(chan);
      if (this._closeAfter.delete(chan)) { this._raw(T.CLOSE, chan); this.forget(chan); return; }
      if (this._wireFull) this._wireWaiters.add(chan); else this.onWritable(chan);
    }
  }

  /** B-beaf: bytes still queued on a channel for the peer's credit (0 = all sent). Local only — no wire change. */
  queued(chan) { return (this._sendQ.get(chan) || []).reduce((n, b) => n + b.length, 0); }

  /** grant the peer n consumed bytes back on a byte channel. */
  credit(chan, n) {
    const p = Buffer.alloc(4);
    p.writeUInt32BE(n >>> 0, 0);
    this._raw(T.CREDIT, chan, p);
  }

  /** A CHANNEL'S CLOSE LEAVES AFTER THAT CHANNEL'S QUEUE, and the side that drops a channel FORGETS it (cs M1, 主开发
   *  2026-11-17 from the interface's acceptance): a close behind bytes still waiting for credit waits for them; once it
   *  leaves, the channel's send state is dropped — a party that opens a channel per connection never grows for good. */
  closeChan(chan) {
    if (this._sendQ.get(chan)?.length) { this._closeAfter.add(chan); return; }   // behind its own queued data
    this._raw(T.CLOSE, chan);
    this.forget(chan);
  }

  /** forget a channel's send state locally — NO frame on the wire (the side whose peer closed it calls this; B-beaf: a
   *  side done with a channel): its send window, anything still queued on it; a credit that arrives later re-creates nothing */
  forget(chan) { this._sendWin.delete(chan); this._sendQ.delete(chan); this._closeAfter.delete(chan); this._wireWaiters.delete(chan); }

  destroy() { this._die('destroyed'); try { this.stream.destroy?.(); } catch { } }
  /** let go of the stream, which stays open: its listeners leave (on a stream that cannot remove one, they turn inert), the
   *  heartbeat ends, every handler becomes a no-op and the buffers are dropped, so no frame still in the loop is read; no onDead */
  detach() {
    this._detached = true; this._dead = true; if (this._hb) clearInterval(this._hb);
    this.onControl = this.onData = this.onCloseChan = this.onDead = this.onWritable = () => {};
    this._acc = Buffer.alloc(0); this._ctlAcc = Buffer.alloc(0);
    for (const w of this._pongWaiters.splice(0)) { try { w(false); } catch { } }
    for (const [e, f] of this._on) { try { if (typeof this.stream.removeListener === 'function') this.stream.removeListener(e, f); } catch { } }
  }

  _die(reason) {
    if (this._dead) return;
    this._dead = true;
    if (this._hb) clearInterval(this._hb);
    this._wireQ = []; this._wireWaiters.clear(); this._sendQ.clear(); this._closeAfter.clear();
    for (const w of (this._pongWaiters || []).splice(0)) { try { w(false); } catch { } }
    this.onDead(reason);
  }

  _feed(d) {
    if (this._detached || this._lineDead) return;   // the line bound ended the link: nothing more is held
    this._acc = this._acc.length ? Buffer.concat([this._acc, d]) : d;
    while (!this._detached && !this._lineDead && this._acc.length >= 4) {
      const len = this._acc.readUInt32BE(0);
      if (len < 5 || len > this._maxFrame) return this._die('bad frame length ' + len);
      if (this._acc.length < 4 + len) return; // incomplete
      const type = this._acc.readUInt8(4);
      const chan = this._acc.readUInt32BE(5);
      const payload = this._acc.subarray(9, 4 + len);
      this._acc = this._acc.subarray(4 + len);
      this._onFrame(type, chan, payload);
    }
  }

  _onFrame(type, chan, payload) {
    switch (type) {
      case T.DATA:
        if (chan === 0) {
          this._ctlAcc = this._ctlAcc.length ? Buffer.concat([this._ctlAcc, payload]) : Buffer.from(payload);
          let i;
          while (!this._detached && (i = this._ctlAcc.indexOf(10)) !== -1) {
            if (this._maxControl && i > this._maxControl) return this._die(`control line over ${this._maxControl} bytes`);
            const line = this._ctlAcc.subarray(0, i).toString('utf-8').trim(), bytes = i;
            this._ctlAcc = this._ctlAcc.subarray(i + 1);
            if (bytes > this._lineMax) { this._lineDead = true; this._ctlAcc = Buffer.alloc(0); return this._die(`control-line-too-large: a control line of ${bytes} bytes is over the device link's ${this._lineMax}`); }
            if (!line) continue;
            let obj; try { obj = JSON.parse(line); } catch { continue; }
            this.onControl(obj, bytes);
          }
          // a line still open past the bound (split over frames, no newline yet) ends the link BY NAME — it never grows for ever
          if (!this._detached && this._ctlAcc.length > this._lineMax) { this._lineDead = true; this._ctlAcc = Buffer.alloc(0); return this._die(`control-line-too-large: a control line still open past the device link's ${this._lineMax} bytes`); }
          if (this._maxControl && this._ctlAcc.length > this._maxControl) return this._die(`control line over ${this._maxControl} bytes`);
        } else {
          this.onData(chan, Buffer.from(payload));
        }
        break;
      case T.CREDIT: {
        if (payload.length !== 4) break;
        // a credit for a channel this side never sent on, or forgot (B-beaf: a detached pipe channel — the peer still credits
        // the input it took before the CLOSE; cs M1: a channel both sides closed), is stale: never a send window made again
        if (!this._sendWin.has(chan)) break;
        const n = payload.readUInt32BE(0);
        this._sendWin.set(chan, this._sendWin.get(chan) + n);
        this._flush(chan); // window grew — send whatever now fits
        break;
      }
      case T.CLOSE: this.onCloseChan(chan); break;
      case T.PING: this._raw(T.PONG, chan); break;
      case T.PONG: this._missedPongs = 0; for (const w of this._pongWaiters.splice(0)) { try { w(true); } catch { } } break;
      default: break; // unknown type: ignore (forward compat)
    }
  }
}

module.exports = { Mux, PROTO_VERSION, INITIAL_WINDOW, T, encodeFrame, FRAME_MAX, LINE_MAX };
