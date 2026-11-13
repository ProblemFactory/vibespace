// THE FLEET DAY — reader B's simulation (int359/acc-399/cut-b/drivers/d5-noise.mjs + world.mjs, copied for lane
// queued-is-not-woke laws 2 + 3, SHAPE C): ONE simulated day of a fleet on the REAL groups engine + wait watch + user-todos +
// delivery ladder, one injected clock. 20 claude workers (turns U(60,240) min, gaps U(2,10)), one coordinator (turns
// U(30,180)) posting a quiet message to 3 random workers every 15 min; each worker posts to the coordinator at each turn end.
// A 4 h warm-up, then 24 h counted. The watch sweeps every WW.TICK_MS (5 min). HANG=1: worker 20's turn opening at hour 6
// lasts 8 h. Prints one JSON line: owner items a day, sender entries HANDED to the coordinator a day (rule a), reads and
// their time per sweep, the hang seen after how many minutes.   usage: [SEED=42] [HANG=1] node scripts/wait-fleet.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = process.env.REPO || path.resolve(new URL('..', import.meta.url).pathname);
const R = (rel) => require(path.join(REPO, rel));
const { createChannelStore } = R('src/channel-store.js');
const GE = process.env.FLEET_GE ? require(process.env.FLEET_GE) : R('src/server/groups-engine.js');
const DELIVER = process.env.FLEET_DELIVER ? require(process.env.FLEET_DELIVER) : R('src/server/conversation-deliver.js');   // a suite's patched copy (its red control)
const WATCH = R('src/server/wait-watch.js');
const WW = R('src/wait-words.js');
const { UserTodoManager } = R('src/user-todos.js');
const J = JSON.stringify;
const MIN = 60e3, T0 = Date.UTC(2026, 10, 13, 8, 0, 0);
const tick = () => new Promise((r) => setImmediate(r));
const SEED = Number(process.env.SEED || 42), HANG = process.env.HANG === '1';
let s = SEED >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const U = (a, b) => a + (b - a) * rnd();
const NW = 20;
const cidOf = (i) => `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`;
const dir = fs.mkdtempSync(path.join(process.env.SCR || os.tmpdir(), 'fleet-'));
fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true });
const clock = { t: T0 }; const now = () => clock.t;
const st = createChannelStore({ dir: path.join(dir, 'channels') });
const sessions = new Map(), S = [];
const members = [{ name: 'coord' }, ...Array.from({ length: NW }, (_, i) => ({ name: 'worker-' + String(i + 1).padStart(2, '0') }))];
members.forEach((m, i) => { const cid = cidOf(i + 1), wid = 'w' + (i + 1); const x = { backend: 'claude', mode: 'chat', name: m.name, host: null, socketPath: path.join(dir, 'cw-' + wid), _isStreaming: false, _turnStateSeen: true, _turnOpenSaidAt: null, claudeSessionId: cid, pty: { write: () => { } } }; sessions.set(wid, x); S.push({ cid, s: x, name: m.name }); });
const deliver = DELIVER.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined, getHosts: () => null, getConvIndex: () => null,
  peerMsg: { findPeer: (cid) => { const x = S.find((y) => y.cid === cid); return x ? { name: x.name, socketPath: '/dev/null', pid: process.pid } : null; }, postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) },
  emitPeerCard: () => true, authorizeSpend: () => ({ ok: true, identity: { key: 'slot-1', name: 'slot one' }, hold: 'h' }), noteSpend: () => { }, releaseSpend: () => { }, log: () => { } });
const roster = S.map((x) => ({ cid: x.cid, name: x.name, groups: ['tg1'], reachability: null }));
const eng = GE.create({ store: st, deliver, now, roster: () => roster, groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
let utChanges = 0;
const ut = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(dir, 'ut-')), onChange: () => { utChanges++; }, now });
const filings = [];
const emptied = new Set();   // senders whose set emptied (the watch forgot what it handed): a repeat after that is a new wait
const watchDeliver = Object.assign(Object.create(deliver), { stashSlot: (cid, slot, env, o) => { const r = deliver.stashSlot(cid, slot, env, o); if (r && r.filed) filings.push({ cid, at: clock.t }); if (!env && o && o.forget) emptied.add(cid); return r; } });
const watch = WATCH.create({ activeSessions: sessions, getDeliver: () => watchDeliver, getGroups: () => eng, getUserTodos: () => ut, sessionKeyOf: (x, id) => 'webui:' + id, now, log: { log() { } }, setTimer: () => null, clearTimer: () => { } });
const C = cidOf(1), WK = Array.from({ length: NW }, (_, i) => cidOf(i + 2));
const sess = (cid) => S.find((x) => x.cid === cid).s;
const WARM = 240, DAY = 24 * 60, END = WARM + DAY, base = T0 - WARM * MIN, atMin = (m) => base + m * MIN;
const stt = new Map();
const plan = (coord) => ({ len: coord ? U(30, 180) : U(60, 240), gap: U(2, 10) });
for (const cid of [C, ...WK]) { const p = plan(cid === C); const phase = U(0, p.len + p.gap); stt.set(cid, { inTurn: phase < p.len, next: phase < p.len ? p.len - phase : p.len + p.gap - phase }); sess(cid)._isStreaming = phase < p.len; }
const report = async (cid) => { const rep = eng.reportsForTurn(cid); if (rep && rep.marks) await eng.commitReports(cid, rep.marks); await tick(); };
let handedToC = 0, handedToW = 0, repeats = 0;
const lastHanded = new Map();   // cid → the set its last handed waiting entry named (rule a: never the same set twice)
const startTurn = async (cid, m) => {
  stt.get(cid).inTurn = true; sess(cid)._isStreaming = true;
  await report(cid);
  const took = deliver.drainStash(cid) || [];
  if (emptied.delete(cid)) lastHanded.delete(cid);   // {X} → {} → {X} is a leave and a join (主开发 15:30Z): not a repeat
  for (const e of took) if (e && e.slot) { if (m >= WARM) { if (cid === C) handedToC++; else handedToW++; if (lastHanded.get(cid) === e.setKey) repeats++; } lastHanded.set(cid, e.setKey); }
};
const endTurn = async (cid) => { stt.get(cid).inTurn = false; sess(cid)._isStreaming = false; if (cid !== C) await eng.sendToAgent({ from: cid, to: C, text: 'report from ' + cid.slice(-2), wake: false }); };
const hangCid = WK[NW - 1];
let hangStart = null;
const sweeps = [];
for (let m = 0; m < END; m++) {
  clock.t = atMin(m);
  for (const cid of [C, ...WK]) {
    const x = stt.get(cid);
    while (x.next <= 0) {
      if (x.inTurn) { await endTurn(cid); x.next += plan(cid === C).gap; }
      else { await startTurn(cid, m); let len = plan(cid === C).len; if (HANG && cid === hangCid && m >= WARM + 360 && !x.hung) { x.hung = true; len = 8 * 60; hangStart = m; } x.next += len; }
    }
    x.next -= 1;
  }
  if (m % 15 === 0) { const pick = new Set(); while (pick.size < 3) pick.add(WK[Math.floor(rnd() * NW)]); for (const w of pick) { clock.t = atMin(m) + 1; await eng.sendToAgent({ from: C, to: w, text: 'task note at ' + m, wake: false }); } }
  if (m % (WW.TICK_MS / MIN) === 0) {
    clock.t = atMin(m);
    const a = performance.now();
    const r = await watch.sweep();
    if (m >= WARM) sweeps.push({ m, ms: performance.now() - a, reads: r ? r.reads : 0, looked: r ? r.looked : 0 });
  }
}
const items = ut._state.items.filter((i) => String(i.itemKey || '').startsWith(WATCH.ITEM_KEY) && i.createdAt >= atMin(WARM) && i.createdAt < atMin(END));
const hangItem = HANG && hangStart != null ? items.filter((i) => i.action && i.action.cid === hangCid && i.createdAt >= atMin(hangStart)).sort((a, b) => a.createdAt - b.createdAt)[0] : null;
const q = (k) => { const a = sweeps.map((x) => x[k]).sort((p, r) => p - r); return { median: +a[Math.floor(a.length / 2)].toFixed(2), max: +a[a.length - 1].toFixed(2), mean: +(a.reduce((p, r) => p + r, 0) / a.length).toFixed(2) }; };
console.log('FLEET ' + J({
  seed: SEED, hang: HANG, sweeps: sweeps.length, periodMin: WW.TICK_MS / MIN,
  ownerItemsDay: items.length, ownerItemsByCid: items.reduce((o, i) => { const k = i.action && i.action.cid === hangCid ? 'hang' : 'other'; o[k] = (o[k] || 0) + 1; return o; }, {}),
  senderEntriesHandedToCoordDay: handedToC, senderEntriesHandedToWorkersDay: handedToW, sameSetHandedAgainDay: repeats, slotFilingsDay: filings.filter((f) => f.at >= atMin(WARM)).length,
  readsPerSweep: q('reads'), msPerSweep: q('ms'), readsDay: sweeps.reduce((p, x) => p + x.reads, 0),
  hangSeenAfterMin: hangItem ? Math.round((hangItem.createdAt - atMin(hangStart)) / MIN) : null, utChanges,
}));
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
