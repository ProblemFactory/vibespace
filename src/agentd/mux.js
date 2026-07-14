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
 *   onControl(obj)              — parsed chan-0 JSON line
 *   onData(chan, buf)           — byte-channel data (consumer MUST call
 *                                 mux.credit(chan, n) as it consumes)
 *   onClose(chan)               — peer half-closed a byte channel
 *   onDead(reason)              — heartbeat death or stream close
 *   onWritable(chan)            — a previously queued channel's send queue
 *                                 drained (producers that paused on a false
 *                                 data() return may resume). Local only — no
 *                                 wire change.
 */
class Mux {
  constructor(stream, { onControl, onData, onClose, onDead, onWritable, heartbeat = true } = {}) {
    this.stream = stream;
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
    stream.on('data', (d) => this._feed(d));
    stream.on('close', () => this._die('stream closed'));
    stream.on('error', () => this._die('stream error'));
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
    try { return this.stream.write(encodeFrame(type, chan, payload)); } catch { this._die('write failed'); return false; }
  }

  /** chan-0 control message (JSON line). */
  control(obj) { this._raw(T.DATA, 0, Buffer.from(JSON.stringify(obj) + '\n')); }

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
    return !(this._sendQ.get(chan)?.length);
  }

  _flush(chan) {
    const q = this._sendQ.get(chan);
    if (!q) return;
    while (q.length) {
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
    if (!q.length) { this._sendQ.delete(chan); this.onWritable(chan); }
  }

  /** grant the peer n consumed bytes back on a byte channel. */
  credit(chan, n) {
    const p = Buffer.alloc(4);
    p.writeUInt32BE(n >>> 0, 0);
    this._raw(T.CREDIT, chan, p);
  }

  closeChan(chan) { this._raw(T.CLOSE, chan); }

  destroy() { this._die('destroyed'); try { this.stream.destroy?.(); } catch { } }

  _die(reason) {
    if (this._dead) return;
    this._dead = true;
    if (this._hb) clearInterval(this._hb);
    this.onDead(reason);
  }

  _feed(d) {
    this._acc = this._acc.length ? Buffer.concat([this._acc, d]) : d;
    while (this._acc.length >= 4) {
      const len = this._acc.readUInt32BE(0);
      if (len < 5 || len > 64 * 1024 * 1024) return this._die('bad frame length ' + len);
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
          while ((i = this._ctlAcc.indexOf(10)) !== -1) {
            const line = this._ctlAcc.subarray(0, i).toString('utf-8').trim();
            this._ctlAcc = this._ctlAcc.subarray(i + 1);
            if (!line) continue;
            let obj; try { obj = JSON.parse(line); } catch { continue; }
            this.onControl(obj);
          }
        } else {
          this.onData(chan, Buffer.from(payload));
        }
        break;
      case T.CREDIT: {
        if (payload.length !== 4) break;
        const n = payload.readUInt32BE(0);
        this._sendWin.set(chan, (this._sendWin.get(chan) ?? INITIAL_WINDOW) + n);
        this._flush(chan); // window grew — send whatever now fits
        break;
      }
      case T.CLOSE: this.onCloseChan(chan); break;
      case T.PING: this._raw(T.PONG, chan); break;
      case T.PONG: this._missedPongs = 0; break;
      default: break; // unknown type: ignore (forward compat)
    }
  }
}

module.exports = { Mux, PROTO_VERSION, INITIAL_WINDOW, T, encodeFrame };
