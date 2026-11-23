'use strict';
// PURE — THE USAGE CELLS (row B-360d unit 1, lane lg-providers; the design read w0r2kz4cb's ruling, 2026-11-21): the Usage
// window's facts as COUNTS, one cell per (15-minute UTC slot, conversation, model, account, backend, account type, folder, mode,
// device, pool, origin, the stored account name, long-prompt class). Values: the request count, the five token counts, the first
// and last instant, the smallest and largest whole prompt (i + cr + cw5 + cw1). Costs are NEVER kept: a price change is counts ×
// rates. The dated price period, the local hour and the weekday come from the slot (every real zone's offset is a multiple of
// 15 minutes). A long-prompt threshold the class set does not name prices a cell EXACTLY from its smallest and largest prompt
// unless the cell straddles it — then that cell's rows are re-read (straddles()), never priced on the wrong side.
// PACKED: typed columns (132 B a cell, measured 804 k cells at 3 M owner-shaped rows ⇒ 101 MB; a Map of objects held 523 B a
// cell) and an open-addressing table over the key columns — no string key is held per cell. Strings are interned once.
// Imports nothing (the ledger's worker and the hub's thread both run it; the parts move between them without a copy).
const SLOT_MS = 15 * 60 * 1000;
const KEYS = ['slot', 'sid', 'model', 'acct', 'be', 'atype', 'cwd', 'mode', 'host', 'pool', 'origin', 'aname', 'lc'];
const VALS = ['n', 'i', 'o', 'cw5', 'cw1', 'cr', 'first', 'last', 'pmin', 'pmax'];
const NK = KEYS.length, NV = VALS.length;
const FNV = (h, x) => Math.imul(h ^ (x | 0), 16777619);

class UsageCells {
  constructor({ thresholds = [200000, 272000], capacity = 1024 } = {}) {
    this.th = [...new Set((thresholds || []).map(Number).filter((x) => Number.isFinite(x) && x > 0))].sort((a, b) => a - b);
    this.n = 0;
    this.fixed = false;   // (B-360d cells small) FIXED: the hub's thread never grows them — a new cell past `cap` throws CELLS_FULL (the owner stands the cells down)
    this.names = [null];   // id 0 = null / absent
    this._nameIx = new Map();
    this._alloc(Math.max(16, capacity | 0));
  }
  _alloc(cap) {
    const k = new Int32Array(cap * NK), v = new Float64Array(cap * NV);
    if (this.k) { k.set(this.k.subarray(0, this.n * NK)); v.set(this.v.subarray(0, this.n * NV)); }
    this.k = k; this.v = v; this.cap = cap;
    this._rehash(cap * 2);
  }
  _rehash(size) {
    let s = 16; while (s < size) s <<= 1;
    this.tab = new Int32Array(s).fill(-1); this.mask = s - 1;
    for (let c = 0; c < this.n; c++) this._place(c, this._hashAt(c));
  }
  _hashAt(c) { let h = 2166136261; const o = c * NK; for (let j = 0; j < NK; j++) h = FNV(h, this.k[o + j]); return h >>> 0; }
  _place(c, h) { let p = h & this.mask; while (this.tab[p] !== -1) p = (p + 1) & this.mask; this.tab[p] = c; }
  /** a string (or null / undefined) → its id; the id 0 is «none» */
  id(s) {
    if (s === null || s === undefined || s === '') return 0;
    const k = String(s);
    let i = this._nameIx.get(k);
    if (i === undefined) { i = this.names.length; this.names.push(k); this._nameIx.set(k, i); }
    return i;
  }
  name(i) { return this.names[i] === undefined ? null : this.names[i]; }
  /** the long-prompt class of a whole prompt: how many of the set's thresholds it is ABOVE (priceAt: strictly greater) */
  classOf(prompt) { let k = 0; for (const t of this.th) if (prompt > t) k++; return k; }
  static slotOf(ts) { return Math.floor((Number(ts) || 0) / SLOT_MS); }
  static wholePrompt(ev) { return (Number(ev.i) || 0) + (Number(ev.cr) || 0) + (Number(ev.cw5) || 0) + (Number(ev.cw1) || 0); }
  /** ONE ROW → its cell (made or added to). An absent token count adds 0 (the row fold does the same — law 2). */
  add(ev) {
    const prompt = UsageCells.wholePrompt(ev);
    const key = [UsageCells.slotOf(ev.ts), this.id(ev.sid), this.id(ev.model), this.id(ev.acct), this.id(ev.be || 'claude'), this.id(ev.atype), this.id(ev.cwd), this.id(ev.mode), this.id(ev.host), this.id(ev.pool), this.id(ev.origin), this.id(ev.aname), this.classOf(prompt)];
    let h = 2166136261; for (let j = 0; j < NK; j++) h = FNV(h, key[j]); h >>>= 0;
    let p = h & this.mask, c = -1;
    for (;;) {
      const at = this.tab[p];
      if (at === -1) break;
      const o = at * NK; let same = true;
      for (let j = 0; j < NK; j++) if (this.k[o + j] !== key[j]) { same = false; break; }
      if (same) { c = at; break; }
      p = (p + 1) & this.mask;
    }
    const ts = Number(ev.ts) || 0;
    if (c === -1) {
      if (this.n >= this.cap) {
        if (this.fixed) throw Object.assign(new Error(`the usage cells are full (${this.n} cells)`), { code: 'CELLS_FULL' });   // nothing written: the row is still the ledger's
        this._alloc(this.cap * 2); return this.add(ev);
      }
      c = this.n++;
      this.k.set(key, c * NK);
      const v = c * NV; this.v[v + 6] = ts; this.v[v + 7] = ts; this.v[v + 8] = prompt; this.v[v + 9] = prompt;
      this.tab[p] = c;
      if (!this.fixed && this.n * 2 > this.mask) this._rehash((this.mask + 1) * 2);   // fixed: the table was sized for `cap` (≥ 2 × cap slots) — never rehashed on the hub's thread
    }
    const v = c * NV;
    this.v[v] += 1; this.v[v + 1] += Number(ev.i) || 0; this.v[v + 2] += Number(ev.o) || 0; this.v[v + 3] += Number(ev.cw5) || 0; this.v[v + 4] += Number(ev.cw1) || 0; this.v[v + 5] += Number(ev.cr) || 0;
    if (ts < this.v[v + 6]) this.v[v + 6] = ts; if (ts > this.v[v + 7]) this.v[v + 7] = ts;
    if (prompt < this.v[v + 8]) this.v[v + 8] = prompt; if (prompt > this.v[v + 9]) this.v[v + 9] = prompt;
    return c;
  }
  /** cell c as a plain object (names resolved) — the fold's and the legs' read */
  cell(c) {
    const o = c * NK, v = c * NV, out = {};
    for (let j = 0; j < NK; j++) out[KEYS[j]] = j === 0 || j === NK - 1 ? this.k[o + j] : this.name(this.k[o + j]);
    for (let j = 0; j < NV; j++) out[VALS[j]] = this.v[v + j];
    return out;
  }
  /** does cell c straddle a long-prompt threshold X (its rows sit on both sides — it cannot be priced from the cell) */
  straddles(c, X) { const v = c * NV; return this.v[v + 8] <= X && this.v[v + 9] > X; }
  /** THE WORKER's sizing at the hand-over (B-360d cells small): the arrays cut to the cells in use plus `headroom`, the table
   *  rehashed for them (≥ 2 × cap slots) — a copy on the WORKER's thread, never the hub's → this */
  sizedTo(headroom) {
    const cap = Math.max(16, this.n + Math.max(0, headroom | 0));
    if (cap === this.cap) return this;
    const k = new Int32Array(cap * NK), v = new Float64Array(cap * NV);
    k.set(this.k.subarray(0, this.n * NK)); v.set(this.v.subarray(0, this.n * NV));
    this.k = k; this.v = v; this.cap = cap;
    this._rehash(cap * 2);
    return this;
  }
  /** the headroom a hand-over leaves: a quarter of the cells in use, at least 65 536 (a stand-down once the history grows by it) */
  static headroomOf(n) { return Math.max(65536, Math.ceil((n | 0) / 4)); }
  bytes() { return this.k.byteLength + this.v.byteLength + this.tab.byteLength + this.names.reduce((s, x) => s + (x ? x.length * 2 + 40 : 0), 0); }
  /** the parts that travel between the worker and the hub's thread (the buffers move, no copy) */
  parts() { return { n: this.n, th: this.th, names: this.names, k: this.k.buffer, v: this.v.buffer, tab: this.tab.buffer, mask: this.mask }; }
  transfer() { return [this.k.buffer, this.v.buffer, this.tab.buffer]; }
  static fromParts(p) {
    const u = new UsageCells({ thresholds: p.th, capacity: 16 });
    u.names = p.names.slice(); u._nameIx = new Map(); for (let i = 1; i < u.names.length; i++) u._nameIx.set(u.names[i], i);
    const k = new Int32Array(p.k), v = new Float64Array(p.v);
    u.k = k; u.v = v; u.cap = Math.floor(k.length / NK); u.n = p.n;
    if (p.tab) { u.tab = new Int32Array(p.tab); u.mask = p.mask; } else u._rehash(u.cap * 2);   // the table travels: no rehash on the hub's thread
    u.fixed = true;   // (B-360d cells small) adopted from the worker: never grown on the hub's thread
    return u;
  }
}

module.exports = { UsageCells, SLOT_MS, KEYS, VALS };
