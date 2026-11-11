// usage-relearn-stepped's WORLD — the seeded ledger + anchor histories + estimator its two suites fold over
// (test-usage-relearn-stepped: rounds 1–2; test-usage-relearn-cap: rounds 3–4). NOT a test-*.mjs on purpose (a helper,
// like boot-shape.mjs): no tier of its own.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// a world's dir removed: the store writer forgets its rates.json first (a pending write would say ENOENT and retry — hub-loop-stalls commit 2)
export const rmWorld = (w) => { try { require('../src/store-writer.js').storeWriter().forget(path.join(w.adir, 'rates.json')); } catch { } fs.rmSync(w.data, { recursive: true, force: true }); };
export const DAY = 86400e3, NOW = 1794300000000;

/** One seeded world over a source tree: a ledger (cold + hot), anchor histories, an estimator. */
export function world(TREE, { seed = 3, rows = 12000, pairs = [1500, 300, 120, 400], steps = [15, 30, 60, 20], ages = [0, 0, 0, 0], nanRate = 0.01, dataDir = null } = {}) {
  const rq = createRequire(path.join(TREE, 'scripts/x.js'));
  const { UsageHistory } = rq(path.join(TREE, 'src/usage-history.js'));
  const UA = rq(path.join(TREE, 'src/usage-anchors.js'));
  const { UsageEstimator, learnRates } = rq(path.join(TREE, 'src/usage-estimator.js'));
  let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const data = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ulw-')), hdir = path.join(data, 'usage-history'), adir = path.join(data, 'usage-anchors');
  const fresh = !dataDir || !fs.existsSync(path.join(data, '.seeded'));
  const shardOf = (ts) => { const d = new Date(ts); return path.join(hdir, `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`); };
  let rn = 0;
  const mkRow = (ts, x = {}) => { const be = rnd() < 0.15 ? 'codex' : 'claude', host = rnd() < 0.12 ? 'H1' : null, acct = pick(['sub-a', 'sub-b', 'sub-c', 'sub-d', null]);
    const ev = { ts, rid: (host ? 'h:H1:r' : 'r') + seed + '-' + (++rn), sid: 's' + (rn % 31), model: be === 'codex' ? pick(['gpt-6-astra', 'gpt-6.1-sol']) : pick(['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-4-5', 'claude-haiku-4-5']),
      be, acct, atype: host ? (rnd() < 0.5 ? 'host' : 'subscription') : (acct ? 'subscription' : 'global'), i: Math.floor(rnd() * 400000), o: Math.floor(rnd() * 3000), cw5: Math.floor(rnd() * 20000), cw1: rnd() < 0.3 ? null : Math.floor(rnd() * 900), cr: Math.floor(rnd() * 90000), ...x };
    if (host) ev.host = host; if (rnd() < nanRate) delete ev.i; return ev; };
  const IDS = [['email:a@x', ['sub-a'], pairs[0], steps[0], ages[0]], ['email:b@x', ['sub-b'], pairs[1], steps[1], ages[1]], ['org:c', ['sub-c'], pairs[2], steps[2], ages[2]], ['org:merged', [null, 'sub-d'], pairs[3], steps[3], ages[3]]];
  if (fresh) {
    fs.mkdirSync(hdir, { recursive: true }); fs.mkdirSync(adir, { recursive: true });
    const buf = new Map();
    for (let k = 0; k < rows; k++) { const ev = mkRow(Math.floor(NOW - 40 * DAY + 40 * DAY * (k / rows)) - (rnd() < 0.02 ? Math.floor(rnd() * DAY) : 0)); const f = shardOf(ev.ts); if (!buf.has(f)) buf.set(f, []); buf.get(f).push(JSON.stringify(ev)); }
    for (const [f, ls] of buf) fs.appendFileSync(f, ls.join('\n') + '\n');
    for (const [key, accts, n, stepMin, ageD] of IDS) {
      const out = []; let prev = null, u7 = 0.1, u5 = 0.1;
      for (let j = 0; j < n; j++) {
        const fetchedAt = Math.floor(NOW - 60e3 - ageD * DAY - (n - 1 - j) * stepMin * 60e3), wk = Math.floor(fetchedAt / (7 * DAY)), h5 = Math.floor(fetchedAt / (5 * 3600e3));
        if (prev && Math.floor(prev.fetchedAt / (7 * DAY)) !== wk) u7 = 0; if (prev && Math.floor(prev.fetchedAt / (5 * 3600e3)) !== h5) u5 = 0;
        u7 = Math.min(0.99, u7 + rnd() * 0.004); u5 = Math.min(0.99, u5 + rnd() * 0.03);
        const rec = { ts: fetchedAt + 500, fetchedAt, source: 'statusline', accountId: accts[j % accts.length], identityKey: key, ...(accts.length > 1 ? { accountIds: accts.map((a) => a || '__global__') } : {}),
          buckets: { fiveHour: { u: Math.round(u5 * 1000) / 1000, resetsAt: Math.floor(((h5 + 1) * 5 * 3600e3) / 1000) }, sevenDay: { u: Math.round(u7 * 1000) / 1000, resetsAt: Math.floor(((wk + 1) * 7 * DAY) / 1000) },
            scopedWeekly: [{ name: 'Fable', u: Math.round(u7 * 500) / 1000, resetsAt: Math.floor(((wk + 1) * 7 * DAY) / 1000), asOf: fetchedAt }] },
          prevFetchedAt: prev ? prev.fetchedAt : null, costSince: prev ? { total: 1, byFamily: { fable: 0.2, opus: 0.8, sonnet: 0, haiku: 0, other: 0 }, requests: 3 } : null };
        out.push(rec); prev = rec;
      }
      fs.writeFileSync(path.join(adir, 'anchors-' + UA.anchorSlug(key) + '.ndjson'), out.map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
    fs.writeFileSync(path.join(data, '.seeded'), '1');
  }
  const uh = new UsageHistory({ dataDir: data, homeDir: data }); uh.ledgerWindowMs = 12 * DAY; uh.ledgerHotMaxBytes = 2e6; uh.warm();
  const keyOf = { 'sub-a': 'email:a@x', 'sub-b': 'email:b@x', 'sub-c': 'org:c', 'sub-d': 'org:merged', __global__: 'org:merged' };
  const est = new UsageEstimator({ anchorsDir: adir, usageHistory: uh, resolveIdentity: (a) => ({ identityKey: keyOf[a || '__global__'] || 'acct:' + a }), lagS: 20 });
  let visited = 0; const real = uh._events.bind(uh);
  uh._events = function* (f, t) { for (const ev of real(f, t)) { visited++; yield ev; } };
  const append = (evs) => { const f = shardOf(NOW - 60e3); fs.appendFileSync(f, evs.map((e) => JSON.stringify(e)).join('\n') + '\n'); uh._evCache.checkedAt = 0; uh._loadEvents(); };
  return { UA, uh, est, learnRates, IDS, data, adir, mkRow, append, rnd, pick, visits: () => visited, zero: () => { visited = 0; } };
}

export const near = (a, b) => { const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object') flat(v, p + k + '.', out); else out[p + k] = v; } return out; };
  const x = flat(a), y = flat(b); return Object.keys({ ...x, ...y }).every((k) => (typeof x[k] === 'number' && typeof y[k] === 'number') ? (Number.isNaN(x[k]) ? Number.isNaN(y[k]) : Math.abs(x[k] - y[k]) <= 1.0001e-4) : x[k] === y[k]); };

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const tick = () => new Promise((r) => setImmediate(r));
export const EST = require('../src/usage-estimator.js');
export const STEP = EST.RELEARN_STEP_LINES;
// a stepped estimator: its turns queued and run one at a time by the suite (each turn's pairs counted)
export const stepper = (est) => { const q = []; est.relearnNext = (fn) => q.push(fn); return { q, turn: () => { const fn = q.shift(); if (fn) fn(); return !!fn; } }; };
export const counting = (est) => { let n = 0; const real = est._costFn.bind(est); est._costFn = (ids) => { const f = real(ids); return (a, b) => { n++; return f(a, b); }; }; return () => n; };

// an anchor's buckets at an instant: window-aligned resets, the utilization the window's elapsed fraction (pairs that learn)
export const bucketsAt = (fetchedAt) => { const wk = Math.floor(fetchedAt / (7 * DAY)), h5 = Math.floor(fetchedAt / (5 * 3600e3)); return { fiveHour: { u: Math.round(((fetchedAt - h5 * 5 * 3600e3) / (5 * 3600e3)) * 700) / 1000, resetsAt: Math.floor(((h5 + 1) * 5 * 3600e3) / 1000) }, sevenDay: { u: Math.round(((fetchedAt - wk * 7 * DAY) / (7 * DAY)) * 800) / 1000, resetsAt: Math.floor(((wk + 1) * 7 * DAY) / 1000) } }; };
