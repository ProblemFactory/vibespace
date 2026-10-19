// worklet.js — VibeSpace lane stream-audio-probe (probe only): the page's two AudioWorklet processors.
//   onset   a 1 kHz detector on its input (Goertzel over 2 ms blocks: > 0.02, > 3x the previous 100 ms, 300 ms apart); posts
//           { t } = the onset block's context time — the moment that sample is in the graph
//   player  the DATA-CHANNEL road's sink: decoded PCM ({L, R} Float32Arrays) queued, played after `target` frames are
//           buffered, the same detector on what it plays; posts { t } and its underruns
class Det {
  constructor() { this.n = Math.round(sampleRate * 0.002); this.coeff = 2 * Math.cos(2 * Math.PI * 1000 / sampleRate); this.k = 0; this.s1 = 0; this.s2 = 0; this.hist = new Float32Array(50); this.hi = 0; this.last = -1e12; this.start = 0; }
  push(x, frame) {
    if (this.k === 0) this.start = frame;
    const s0 = x + this.coeff * this.s1 - this.s2; this.s2 = this.s1; this.s1 = s0; this.k++;
    if (this.k < this.n) return null;
    const amp = 2 * Math.sqrt(Math.max(0, this.s1 * this.s1 + this.s2 * this.s2 - this.coeff * this.s1 * this.s2)) / this.n;
    let base = 0; for (const h of this.hist) base = Math.max(base, h);
    let hit = null;
    if (amp > 0.02 && amp > 3 * base && this.start - this.last > this.n * 150) { hit = { frame: this.start, amp }; this.last = this.start; }
    this.hist[this.hi] = amp; this.hi = (this.hi + 1) % this.hist.length; this.k = 0; this.s1 = this.s2 = 0;
    return hit;
  }
}

class Onset extends AudioWorkletProcessor {
  constructor() { super(); this.d = new Det(); }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) { const h = this.d.push(ch[i], currentFrame + i); if (h) this.port.postMessage({ t: h.frame / sampleRate, amp: h.amp }); }
    return true;
  }
}

class Player extends AudioWorkletProcessor {
  constructor(opts) {
    super(); this.q = []; this.off = 0; this.buffered = 0; this.started = false; this.under = 0; this.d = new Det();
    this.target = (opts && opts.processorOptions && opts.processorOptions.targetFrames) || 960;
    this.port.onmessage = (e) => { this.q.push(e.data); this.buffered += e.data.L.length; };
  }
  process(_, outputs) {
    const L = outputs[0][0], R = outputs[0][1] || outputs[0][0];
    if (!this.started && this.buffered >= this.target) this.started = true;
    if (this.started) {
      for (let i = 0; i < L.length; i++) {
        if (!this.q.length) { this.under++; this.started = this.buffered >= this.target; this.port.postMessage({ under: this.under }); break; }
        const c = this.q[0]; L[i] = c.L[this.off]; R[i] = c.R[this.off]; this.off++; this.buffered--;
        if (this.off >= c.L.length) { this.q.shift(); this.off = 0; }
      }
    }
    for (let i = 0; i < L.length; i++) { const h = this.d.push(L[i], currentFrame + i); if (h) this.port.postMessage({ t: h.frame / sampleRate, amp: h.amp }); }
    return true;
  }
}

registerProcessor('onset', Onset);
registerProcessor('player', Player);
