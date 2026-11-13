#!/usr/bin/env node
// test-connection-notice-bound — lane connection-notice-once r6 (the acceptance's B1 + B2): the hub's heartbeat holds a socket's backlog within its STATED BOUND,
// searched, on the tree's own src/server/ws-heartbeat.js (REPO=<tree> for a RED copy). The model is the acceptance's, byte-faithful: a producer P(t), a kernel send
// buffer S that wakes the writer when a third of it is free, a reader R(t, state) reading from the kernel, a pong once the reader has read past the ping.
// THE BOUND (the heartbeat's comment, kb 不变量 4b): at a round the socket survives, backlog ≤ max(A, ceiling) + Pr; at the round that cuts it, + Pr more.
// A = the allowance (4 MiB), ceiling = the episode's first backlog past A + A, Pr = the most the producer wrote in one round. The looser form, with what the
// socket was owed: ≤ max(A, owed) + A + 2·Pr (+ Pr at the cut). Searched: 3 random seeds × 10 000 profiles (ten families), a constant grid of 21 600, the ratchet,
// a stall-and-catch-up reader; each 30 min of model time. Then THE PRICE: no reader that keeps up (any margin ≥ 0, owed 8 MB) is cut for its backlog, and the
// declared deep-buffer limit, as measured. RED on 4a34eed82: 61 / 66 / 74 random profiles over, the ratchet never cut at 31 MiB, the 5 % / 19 % lines cut.
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = path.resolve(process.env.REPO || new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
const HB = require(path.join(REPO, 'src/server/ws-heartbeat.js'));
const N = Number(process.env.VS_BOUND_N || 10000);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const ALLOW = 4194304;
const MiB = 1048576;
function sim(HB, { T, S, wakeFrac = 1 / 3, dt = 0.05, maxS = 1800, seed = 0, P, R, forcePong = false, kernelFull = true, logs = null, events = null, onTick = null }) {
  let t = 0; const ms = () => Math.round(t * 1000);
  let produced = (kernelFull ? S : 0) + seed, taken = kernelFull ? S : 0, readPos = 0, kernelQ = kernelFull ? S : 0, maxQ = 0, maxQTick = 0;
  const pings = []; let lastPingRound = -1, round = 0;
  const c = { readyState: 1, _isAlive: true, terminated: null, _socket: { _handle: {}, get _bytesDispatched() { return produced; }, get bytesWritten() { return produced; } },
    ping() { produced += 2; pings.push(produced); lastPingRound = round; }, terminate() { this.terminated = ms(); } };
  Object.defineProperty(c._socket._handle, 'writeQueueSize', { get() { return produced - taken; } });
  const log = { warn: (l) => { if (logs) logs.push([ms(), l]); } };
  const prevEv = global.__vsEvent; if (events) global.__vsEvent = (e) => events.push([ms(), e]);
  const hb = HB.createWsHeartbeat({ clients: new Set([c]) }, { intervalMs: T * 1000, now: ms, log, metric() {} });
  hb.pulse(); hb.tick(); c._isAlive = true; pings.length = 0; produced -= 2;
  const steps = Math.round(T / dt), pulseEvery = Math.round(1 / dt);
  let step = 0, readR = 0, prodR = 0; const reads = [], prods = [], backlogAtTick = [];
  const st = { get lastPingRound() { return lastPingRound; }, get pingPending() { return pings.length > 0; }, get pendingPing() { return pings.length ? pings[0] : null; }, get readPos() { return readPos; }, get kernelQ() { return kernelQ; }, get backlog() { return produced - taken; }, get round() { return round; }, get tInRound() { return (step % steps) * dt; }, T, S, pingSentAt: null };
  let pingAge = 0;
  const maxSteps = Math.round(maxS / dt);
  while (step < maxSteps && c.terminated == null) {
    step++; t = step * dt;
    const p = P(t, st) * dt; produced += p; prodR += p;
    let want = R(t, st) * dt; if (want < 0) want = 0;
    const rd = Math.min(kernelQ, want); readPos += rd; kernelQ -= rd; readR += rd;
    const free = S - kernelQ; if (free >= S * wakeFrac) { const mv = Math.min(free, produced - taken); taken += mv; kernelQ += mv; }
    while (pings.length && readPos >= pings[0]) { pings.shift(); c._isAlive = true; }
    if (step % pulseEvery === 0) hb.pulse();
    const q = produced - taken; if (q > maxQ) maxQ = q;
    if (step % steps === 0) {
      if (forcePong) c._isAlive = true;
      const wasAlive = c._isAlive, readThis = readR; hb.tick(); round++; if (onTick) onTick({ round, t, wasAlive, backlog: produced - taken, stretch: c._hbStretch, drainRound: c._hbDrainRound, terminated: c.terminated, read: readThis, kernelQ });
      reads.push(readR); prods.push(prodR); backlogAtTick.push(produced - taken); readR = 0; prodR = 0;
      if (produced - taken > maxQTick) maxQTick = produced - taken;
    }
  }
  if (events) global.__vsEvent = prevEv;
  const maxRead = reads.length ? Math.max(...reads) : 0; const maxProdRound = prods.length ? Math.max(...prods) : 0;
  let maxSurplus = 0; for (let i = 0; i < reads.length; i++) maxSurplus = Math.max(maxSurplus, prods[i] - reads[i]);
  const sumR = reads.reduce((a, b) => a + b, 0), sumP = prods.reduce((a, b) => a + b, 0), n = Math.max(1, reads.length);
  const G = Math.max(ALLOW, maxRead, seed) + S * wakeFrac + 2 * Math.max(0, maxSurplus); // per-round peaks: the generous reading of the stated bound
  const A = Math.max(ALLOW, sumR / n, seed) + S * wakeFrac + 2 * Math.max(0, (sumP - sumR) / n); // average rates: the literal reading
  const GT = G; return { maxProdRound, ratioTickG: maxQTick / G, maxQTickMiB: +(maxQTick / MiB).toFixed(2), trace: backlogAtTick, cutS: c.terminated == null ? null : c.terminated / 1000, rounds: round, maxQ, maxQMiB: +(maxQ / MiB).toFixed(2), maxQTick, G, A, ratioG: maxQ / G, ratioA: maxQ / A, endQ: produced - taken, maxRead, maxSurplus };
}

function sets(N) {
  const out = {};
  for (const SEED of [12345, 777, 4242]) {
    let s0 = SEED; const rnd = () => { s0 |= 0; s0 = (s0 + 0x6D2B79F5) | 0; let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const U = (a, b) => a + (b - a) * rnd(), LU = (a, b) => Math.exp(U(Math.log(a), Math.log(b))), pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    const FAM = ['const', 'onoff', 'altround', 'decay', 'piecewise', 'burstyProducer', 'ratchet', 'peakShave', 'latePong', 'trickle'];
    const list = [];
    for (let i = 0; i < N; i++) {
      const fam = FAM[i % FAM.length], T = pick([2, 30]), S = pick([16384, 65536, 262144, 1048576, 2097152, 4.4e6, 6e6]), seed = rnd() < 0.3 ? 0 : U(0, ALLOW);
      const P0 = T === 2 ? LU(5e3, 3e6) : LU(2e3, 4e5), dt = T === 2 ? 0.05 : 0.1; let P = () => P0, R, desc;
      switch (fam) {
        case 'const': { const r = U(0.7, 1.3) * P0; R = () => r; desc = `R ${(r / 1e3).toFixed(1)}K`; break; }
        case 'onoff': { const per = LU(0.1 * T, 30 * T), duty = U(0.05, 0.95), mean = U(0.8, 1.2) * P0; R = (t) => ((t % per) < per * duty ? mean / duty : 0); desc = `onoff per ${per.toFixed(1)} duty ${duty.toFixed(2)}`; break; }
        case 'altround': { const n = 2 + Math.floor(rnd() * 4), w = Array.from({ length: n }, () => (rnd() < 0.4 ? 0 : rnd())); const sw = w.reduce((a, b) => a + b, 0) || 1, mean = U(0.8, 1.2) * P0; R = (t, st) => (mean * n * w[st.round % n]) / sw; desc = `altround ${w.map((x) => x.toFixed(2)).join('/')}`; break; }
        case 'decay': { const R0 = P0 * U(0.95, 1.25), d = R0 * LU(1e-4, 5e-2); R = (t, st) => Math.max(0, R0 - d * st.round); desc = 'decay'; break; }
        case 'piecewise': { const segs = []; let at = 0; while (at < 1800) { const len = LU(0.05 * T, 10 * T); segs.push([at + len, U(0, 2.5) * P0]); at += len; } let k = 0; R = (t) => { while (segs[k][0] < t) k++; return segs[k][1]; }; desc = 'piecewise'; break; }
        case 'burstyProducer': { const per = LU(0.2 * T, 20 * T), duty = U(0.05, 0.9), r = U(0.8, 1.2) * P0; P = (t) => ((t % per) < per * duty ? P0 / duty : 0); R = () => r; desc = 'burstyProducer'; break; }
        case 'ratchet': { const d = U(-0.005, 0.02), q = U(0.5, 1), p = U(0, 0.1); const stall = new Map(); R = (t, st) => { const k = st.round; if (!stall.has(k)) stall.set(k, (st.round > 2 && st.pingPending && k === st.lastPingRound + 1 && rnd() < q) || rnd() < p); return stall.get(k) ? 0 : P0 * (1 + d); }; desc = 'ratchet'; break; }
        case 'peakShave': { const x = U(0.02, 0.5), mean = U(0.8, 1.2) * P0; R = (t, st) => (st.tInRound >= T * (1 - x) ? mean / x : 0); desc = 'peakShave'; break; }
        case 'latePong': { const Lr = 1 + Math.floor(rnd() * 3), f = U(0.5, 0.99), hi = P0 * LU(1, 20), drip = P0 * U(0, 1.1); R = (t, st) => (st.pingPending && (st.round - st.lastPingRound - 1) * T + st.tInRound >= ((Lr - 1) + f) * T ? hi : drip); desc = 'latePong'; break; }
        case 'trickle': { const r = U(0, 100); R = () => r; desc = 'trickle'; break; }
      }
      list.push({ T, S, seed, dt, P, R, maxS: 1800, desc: `${fam} T${T} S ${(S / 1024).toFixed(0)}K P ${(P0 / 1e3).toFixed(1)}K seed ${(seed / MiB).toFixed(2)}MiB ${desc}` });
    }
    out[`random seed ${SEED}`] = list;
  }
  const grid = [];
  for (const T of [2, 30]) for (const S of [262144, 1048576, 4.4e6]) for (const seed of [0, 2 * MiB, 4 * MiB]) for (let i = 0; i < 40; i++) for (let j = 0; j < 30; j++) {
    const R = Math.exp(Math.log(T === 2 ? 50e3 : 5e3) + (Math.log(T === 2 ? 3e6 : 4e5) - Math.log(T === 2 ? 50e3 : 5e3)) * i / 39), P = R * (1 + 0.3 * j / 29);
    grid.push({ T, S, seed, P: () => P, R: () => R, maxS: 1800, dt: T === 2 ? 0.05 : 0.1, desc: `grid T${T} S ${(S / MiB).toFixed(2)} seed ${seed / MiB} R ${(R / 1e3).toFixed(1)}K P +${((P / R - 1) * 100).toFixed(1)}%` });
  }
  out['constant grid'] = grid;
  const ratchet = [];
  for (const [T, S, P, d, seed] of [[2, 65536, 400e3, 0.002, 1e6], [2, 65536, 400e3, 0.005, 1e6], [2, 65536, 400e3, 0.01, 1e6], [2, 65536, 400e3, 0.0, 1e6], [2, 262144, 400e3, 0.002, 1e6], [2, 4.4e6, 400e3, 0.002, 1e6], [30, 65536, 30e3, 0.002, 1e6], [30, 262144, 100e3, 0.002, 1e6], [30, 65536, 25e3, 0.005, 1e6], [2, 65536, 100e3, 0.002, 1e6]])
    ratchet.push({ T, S, seed, P: () => P, R: (t, st) => (st.round > 2 && st.pingPending && st.round === st.lastPingRound + 1 ? 0 : P * (1 + d)), maxS: 1800, desc: `ratchet T${T} S ${S} P ${P} δ ${d}` });
  out['ratchet'] = ratchet;
  const stall = []; // a link that stalls one whole round, then catches up at twice its average, under a producer faster by f
  for (const T of [2, 30]) for (const S of [65536, 1048576, 4.4e6]) for (const f of [0, 0.05, 0.1, 0.2]) for (const every of [2, 3, 5]) for (const seed of [0, 2 * MiB]) {
    const R0 = T === 2 ? 400e3 : 30e3, P = R0 * (1 + f);
    stall.push({ T, S, seed, P: () => P, R: (t, st) => (st.round % every === 0 ? 0 : st.round % every === 1 ? 2 * R0 : R0), maxS: 1800, desc: `stall T${T} S ${S} every ${every} f ${f} seed ${seed}` });
  }
  out['stall and catch up'] = stall;
  for (const [k, v] of Object.entries(out)) for (const pr of v) pr.dt ??= pr.T === 2 ? 0.05 : 0.1;
  return out;
}

function judged(pr) {
  let ceil = null, worst = 0, worstLoose = 0; const ticks = [];
  const r = sim(HB, { ...pr, onTick: (k) => { const seen = ceil; if (k.backlog > ALLOW) { if (ceil == null) ceil = k.backlog + ALLOW; } else ceil = null; ticks.push([k.backlog, seen ?? ceil, k.terminated != null]); } });
  const Pr = r.maxProdRound;
  for (const [b, c, cutHere] of ticks) { const extra = cutHere ? 2 : 1; worst = Math.max(worst, b / (Math.max(ALLOW, c ?? 0) + extra * Pr)); worstLoose = Math.max(worstLoose, b / (Math.max(ALLOW, pr.seed || 0) + ALLOW + (extra + 1) * Pr)); }
  return { r, worst, worstLoose };
}
console.log('THE BOUND, searched (' + N + ' random profiles per seed)');
const t0 = Date.now();
for (const [name, list] of Object.entries(sets(N))) {
  let over = 0, overLoose = 0, worst = 0, wd = '', cut = 0;
  for (const pr of list) { const { r, worst: w, worstLoose: wl } = judged(pr); if (r.cutS != null) cut++; if (w > 1.0001) over++; if (wl > 1.0001) overLoose++; if (w > worst) { worst = w; wd = `${pr.desc} ⇒ cut ${r.cutS ?? 'never'}, ${r.maxQTickMiB} MiB at a round`; } }
  ok(`${name}: ${list.length} profiles, ${cut} cut, 0 past the bound (worst ${worst.toFixed(3)} of it: ${wd})`, over === 0, { over, worst, wd });
  ok(`${name}: …and 0 past its looser form, with what was owed`, overLoose === 0, overLoose);
}
console.log(`    ${((Date.now() - t0) / 1000).toFixed(1)} s`);

console.log('THE PRICE: a reader that keeps up is KEPT through its drain (never cut while its backlog stands; red on the release, which cuts each at 4 s or 60 s)');
for (const [T, Rr, S] of [[2, 400e3, 4.4e6], [30, 30e3, 4.4e6], [30, 100e3, 4.4e6], [30, 30e3, 1048576], [30, 30e3, 262144], [2, 400e3, 1048576], [30, 300e3, 4.4e6]]) {
  const cut = [];
  for (const m of [0, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3]) {
    const ev = [], prev = global.__vsEvent; global.__vsEvent = (e) => ev.push(e);
    let drainedAt = null; // the first round the hub's backlog is gone (a pending ping's 2 bytes aside); a backlog that holds exactly never gets there
    const r = sim(HB, { T, S, seed: 8e6, P: () => Rr * (1 - m), R: () => Rr, maxS: 1800, dt: T === 2 ? 0.05 : 0.1, onTick: (k) => { if (drainedAt == null && k.backlog <= 64) drainedAt = k.t; } });
    global.__vsEvent = prev;
    const during = r.cutS != null && (drainedAt == null || r.cutS <= drainedAt);
    if (during || ev.includes('ws-heartbeat-outrun')) cut.push(`${(m * 100).toFixed(1)}%: cut at ${r.cutS} s${drainedAt == null ? ' (its backlog held)' : `, drained at ${drainedAt.toFixed(0)} s`}${ev.includes('ws-heartbeat-outrun') ? ', as outrun' : ''}`);
  }
  ok(`T${T} s, ${Rr / 1e3} KB/s, a ${(S / MiB).toFixed(2)} MiB send buffer, 8 MB owed: every margin from 0 (holds exactly, 30 min) to 30 % kept through its drain`, cut.length === 0, cut);
}

console.log('THE LIMIT, declared: a deep (4.4 MB) send buffer at 30 s rounds, 8 MB owed');
{
  const v = (kbit, m, S = 4.4e6) => { const R = kbit * 125, ev = [], prev = global.__vsEvent; global.__vsEvent = (e) => ev.push(e); const r = sim(HB, { T: 30, S, seed: 8e6, P: () => R * (1 - m), R: () => R, maxS: 1800, dt: 0.1 }); global.__vsEvent = prev; let drained = null; r.trace.forEach((b, i) => { if (drained == null && b < ALLOW) drained = (i + 1) * 30; }); return { outrun: ev.includes('ws-heartbeat-outrun'), cutS: r.cutS, drained }; };
  const slow = v(160, 0.5);
  ok('≤ 160 kbit/s is cut on its second round: the kernel takes its bursts further apart than the grace (as on 8b3fdb6ab)', slow.cutS === 60 && !slow.outrun, slow);
  const mid = [200, 300, 427, 560].map((k) => v(k, 0.3));
  ok('200–560 kbit/s is kept through its drain (a cut, if any, comes after the queue is empty: the kernel\'s 4 MB ahead of the ping)', mid.every((x) => !x.outrun && x.drained != null && (x.cutS == null || x.cutS > x.drained)), mid);
  const fast = [650, 1000, 3200].map((k) => v(k, 0.3));
  ok('from 650 kbit/s kept', fast.every((x) => x.cutS == null), fast);
  const shallow = [160, 300, 560].map((k) => v(k, 0.3, 1048576));
  ok('a 1 MiB send buffer: kept at every rate tried from 160 kbit/s', shallow.every((x) => x.cutS == null), shallow);
}
console.log(fail ? `\nFAILED: ${fail} failed, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
