// channel-outbox-world.mjs — THE ONE WORLD of test-channel-outbox's three suites (B-54a9 split, 主开发 r4755; lane bl-tests-a):
// test-channel-outbox (the core), test-channel-outbox-stash (§5v2, §5v3) and test-channel-outbox-card (§6 r6). Every line below is
// the old suite's own, moved word for word: its setup (imports, ok and its counts as live bindings, the scratch root and its
// cleanup), and the top-level helpers more than one of the three read, with every helper they read in turn (§2's engine maker
// and its counter, §5v's waits, §5v2's real-deliver maker, the stores §6 r6 reads). Each suite builds its own scratch root at its load.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

const P = require(path.join(REPO, 'src/channel-policy.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));

const ROOT = scratch('chan-outbox');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// ── §1 PURE ───────────────────────────────────────────────────────────────

let seq = 0;

function mkEngine(opts = {}) {
  const dataDir = path.join(ROOT, opts.name || `e${++seq}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const events = [];
  const delivered = [];
  const stash = [];
  // the stash's own events (2026-09-27): a producer's `ref` entry is reported when it is stashed and drained
  const stashListeners = new Set();
  const retryListeners = new Set();
  const held = new Map();
  const deliver = {
    gate: null, atGate: 0, gated: null,   // r401: the delivery `gate.match` names waits on `gate.wait` (consumed) — a hold PLACED in the sweep-window leg's race
    async deliverToConversation(cid, text, o) { delivered.push({ cid, text, opts: o }); if (deliver.gate && deliver.gate.match(text, o)) { const g = deliver.gate; deliver.gate = null; deliver.atGate++; deliver.gated = String(text).split('\n').slice(-1)[0]; await g.wait; } if (o && o.noWake === false && deliver.wakeOk) return { ok: true, lane: 'message' }; return opts.deliverOk ? { ok: true, lane: 'rpc-queue', steered: true } : { ok: false, reason: 'no free lane', refused: 'no-wake' }; },
    stashFor(cid, env) { stash.push({ cid, env }); (held.get(cid) || held.set(cid, []).get(cid)).push(env); if (env.ref) for (const fn of stashListeners) fn('stashed', cid, [env]); },
    onStash(fn) { stashListeners.add(fn); return () => stashListeners.delete(fn); },
    onRetry(fn) { retryListeners.add(fn); return () => retryListeners.delete(fn); },   // lane paced-wake-retry (D6): the park's events
    retryEvent(ev, cid, entry, extra) { for (const fn of retryListeners) fn(ev, cid, entry, extra); },
    drain(cid) { const q = held.get(cid) || []; held.delete(cid); const r = q.filter((e) => e.ref); if (r.length) for (const fn of stashListeners) fn('drained', cid, r); return q; },
    // verify: the read the boot reconcile asks (copies, never a drain)
    stashPeek(cid) { return (held.get(cid) || []).map((e) => ({ ...e })); },
    forget(cid) { held.delete(cid); },
  };
  let offset = 0;
  // `opts.now` — the engine's clock (ci-346-reds: the collect window's legs judge the hold on a clock they hold still)
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now() + offset;
  const userTodos = opts.userTodos === null ? null : (opts.userTodos || new UserTodoManager({ dataDir, now }));
  const e = (opts.engine || ENG).create({
    dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry: opts.registry, broadcast: (m) => events.push(m),
    userTodos, deliver, now, serverSetting: (k) => (opts.settings || {})[k], log: opts.log || { log() {}, warn() {}, error() {} }, channelsHeldRetry: { firstMs: 5, maxMs: 10 }, collectWindowMs: opts.collectWindowMs ?? null,   // B-eca3: the collect window is an engine option (a constant in the product)
    liveSessions: () => opts.live || [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }],
  });
  return { eng: e, events, delivered, stash, userTodos, deliver, advance: (ms) => { offset += ms; }, dataDir };
}

const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['g1'], msgLevelFor: () => 'none' };

const A = 'fake-poll', C = 'fake-poll-ops', KEY = `${A}/${C}`;

async function prime(eng) {
  await eng.pass(A, { force: true });
  await eng.refresh(A, C);
  await eng.pass(A, { force: true });
  await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, level: 'visible' });
}

const sleep = (ms) => new Promise((z) => setTimeout(z, ms));

const waitUntil = async (pred, ms, what) => { for (let k = 0, n = Math.ceil(ms / 2); k <= n; k++) { if (pred()) return true; await sleep(2); } console.log(`  … waited ${ms} ms of turns for ${what} — it never came`); return null; };   // bounded by a COUNT of turns (no wall clock)

async function settled(what, cond, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) { ok(false, `waited ${ms} ms for ${what} — it never happened`); return { ok: false, ms: Date.now() - t0, what }; } await sleep(5); }
  return { ok: true, ms: Date.now() - t0, what };
}

const DEL = require(path.join(REPO, 'src/server/conversation-deliver.js'));

function mkReal(opts = {}) {
  const dataDir = opts.dataDir || path.join(ROOT, opts.name || `r${++seq}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const events = [], delivered = [];
  // r3720: `holdRead` — the ladder's ONE start read of msg-stash.json PLACED as a refusal (EIO), so the list of waiting messages is HELD
  const realRead = fs.readFileSync, held = path.resolve(path.join(dataDir, 'msg-stash.json')); let place = !!opts.holdRead;
  if (place) fs.readFileSync = function (f, ...a) { if (place && typeof f === 'string' && path.resolve(f) === held) { place = false; throw Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' }); } return realRead.call(this, f, ...a); };
  let real = null;
  try { real = (opts.ladderMod || DEL).create({ dataDir, activeSessions: new Map(), log: () => {} }); } finally { fs.readFileSync = realRead; }
  const liftTells = [], landTells = [];
  const ladder = {
    delay: 0,
    async deliverToConversation(cid, text, o) { delivered.push({ cid, text, opts: o }); if (ladder.delay) await sleep(ladder.delay); if (o.noWake === true) return { ok: false, reason: 'no free lane', refused: 'no-wake' }; return { ok: true, lane: 'message' }; },
    stashFor: real.stashFor, drainStash: real.drainStash, stashPeek: real.stashPeek, onStash: real.onStash, stashCount: real.stashCount, flush: real.flush,
    // r3919 / r3988 (A): the lift's listeners and the landing's, as server.js wires the real ladder — r4037: each call's own promise (the
    // reconcile's end) is KEPT, so a leg waits on that fact, never on a sleep
    onStashLift: (fn) => real.onStashLift(() => { const r = fn(); if (r && typeof r.then === 'function') liftTells.push(r); return r; }),
    onStashLanded: (fn) => real.onStashLanded(() => { const r = fn(); if (r && typeof r.then === 'function') landTells.push(r); return r; }), stashOnDisk: real.stashOnDisk,
    ...(opts.noTornAt ? {} : { stashTornAt: real.stashTornAt }),   // r3003 (a): the stash's torn instant, as server.js wires the real ladder (noTornAt: the RED — a reconcile that cannot see it)
  };
  const reg = CH.createChannelRegistry();
  const send = { hold: null, throwOnce: false, reconciles: 0 };
  const mkA = reg.create;
  reg.create = (kind, record, deps) => {
    const a = mkA(kind, record, deps);
    if (a && typeof a.send === 'function') { const s0 = a.send; a.send = async (convId, o) => { if (send.hold) { send.heldCount = (send.heldCount || 0) + 1; await send.hold; } if (send.throwOnce) { send.throwOnce = false; const e = new Error('socket hang up'); e.code = 'ECONNRESET'; throw e; } return s0(convId, o); }; }
    if (a && typeof a.reconcile === 'function') { const r0 = a.reconcile; a.reconcile = async (...args) => { send.reconciles++; await sleep(15); return r0(...args); }; }
    return a;
  };
  let offset = 0;
  const now = () => Date.now() + offset;
  const userTodos = new UserTodoManager({ dataDir, now });
  const e = (opts.engine || ENG).create({
    dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry: reg, broadcast: (m) => events.push(m),
    userTodos, deliver: ladder, now, serverSetting: () => undefined, log: opts.log || { log() {}, warn() {}, error() {} },
    liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }],
  });
  return { eng: e, events, delivered, userTodos, ladder, real, send, advance: (ms) => { offset += ms; }, dataDir, liftTells, landTells };
}

const CAPS = require(path.join(REPO, 'src/channel-caps.js'));

const REC = require(path.join(REPO, 'src/channel-record.js'));

export { cleanup, ROOT, UserTodoManager, fake, CH, ENG, P, editAnchor, ok, fail, pass, REPO, require, engineSource, scratch, createRequire, path, fs, seq, mkEngine, AGENT, A, C, KEY, prime, sleep, waitUntil, settled, DEL, mkReal, CAPS, REC };
