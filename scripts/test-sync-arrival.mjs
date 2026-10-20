#!/usr/bin/env node
// STATESYNC'S ARRIVAL RULE (lane statesync-last-arrival, B-cede — first seen 2.112.6, re-seen by lane stage-blank verify
// r4 Z3): a REMOTE op never lands over the client's own NEWER set. Before, the server answered no set and every remote op
// landed on arrival, so two devices setting one key within a round trip each took the OTHER's set last and ended crossed
// (two staged devices on different heroes until the next op). Fast, in-process, DETERMINISTIC: the REAL server SyncStore
// (src/sync-store.js) behind the REAL `state-set` / `state-resync` cases of src/ws-handler.js (cut verbatim) and REAL
// client StateSyncs (src/lib/utils.js's class, cut verbatim) over fake sockets on a discrete-event clock — each direction
// a FIFO link with its own latency (a socket is ordered); no timer, no wall clock:
//   §1 the PURE verdict (src/sync-arrival.js): its table, its one caller
//   §2 THE RACE: two clients set the stage's `hero` d ∈ {0,1,2,5,10,20,50} ms apart, seeded order + latencies; after
//      quiescence both hold the server's value, and neither ever held a value older than one it had acked
//   §3 per KEY: another key's op while an own set is pending lands at once
//   §4 a reconnect: the missed ops and the full snapshot converge; a set in flight when the socket drops
//   §5 the frames: state-ack to the sender only (its listener hears nothing), `from` + `basedOn` on the broadcast
//   §6 CONTROLS: the pre-fix client (every remote op lands on arrival) crosses ≥ 1 offset and holds older than acked;
//      a per-STORE verdict loses another key's op
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); } return !!c; };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const S = JSON.stringify;
const { SyncStore } = require('../src/sync-store.js');
const { ARRIVAL_TABLE, arrivalVerdict } = require('../src/sync-arrival.js');

// ── the real code, cut verbatim ──
const handler = read('src/ws-handler.js');
const a = handler.indexOf("        case 'state-set': {"), b = handler.indexOf("        case 'layout-sync': {");
const CASES = a > 0 && b > a ? handler.slice(a, b) : '';
const utils = read('src/lib/utils.js');
const c0 = utils.indexOf('class StateSync {'), c1 = utils.indexOf('\nlet _stateSync = null;');
const CLASS = c0 > 0 && c1 > c0 ? utils.slice(c0, c1) : '';
const CALL = 'const verdict = arrivalVerdict({ remote: op, own: { ackedVersion: s.acked.get(op.key), pending: s.pending.has(op.key) } });';
const PER_KEY = 'own: { ackedVersion: s.acked.get(op.key), pending: s.pending.has(op.key) }';
// the pre-fix client: every remote op lands on arrival (the rule's one caller answers 'apply')
const PRE_FIX = CLASS.replace(CALL, "const verdict = 'apply';");
// a per-STORE verdict: any own set pending holds every key's op, the store's newest ack drops them
const PER_STORE = CLASS.replace(PER_KEY, 'own: { ackedVersion: Math.max(0, ...s.acked.values()), pending: s.pending.size > 0 }');

console.log('§0 the cuts');
ok(/case 'state-set'/.test(CASES) && /case 'state-resync'/.test(CASES) && /store\.set\(data\.key, data\.value, ws, data\.basedOn\)/.test(CASES) && /store\.delete\(data\.key, ws, data\.basedOn\)/.test(CASES), 'src/ws-handler.js: the state-set + state-resync cases cut verbatim (a set hands the store its socket + basedOn)');
ok(CLASS.includes(CALL) && /_applyAck\(storeName, ack\)/.test(CLASS) && /msg\.type === 'state-ack'/.test(CLASS), 'src/lib/utils.js: the client StateSync class cut verbatim (the arrival rule\'s call, the ack)');
ok(PRE_FIX !== CLASS && PER_STORE !== CLASS, 'control targets present: the rule\'s call, its per-key facts');

// ── a discrete-event clock: the next event by (time, order) ──
function makeClock() {
  const q = []; let now = 0, seq = 0;
  return {
    get now() { return now; },
    at(t, fn) { q.push({ t: Math.max(t, now), s: seq++, fn }); },
    run() { let n = 0; while (q.length && n++ < 100000) { let i = 0; for (let j = 1; j < q.length; j++) if (q[j].t < q[i].t || (q[j].t === q[i].t && q[j].s < q[i].s)) i = j; const [e] = q.splice(i, 1); now = e.t; e.fn(); } return n; },
  };
}

// ── one server store, N clients: each socket a FIFO link per direction; a dropped socket loses what is in flight to it ──
function world({ cls = CLASS, maxOps } = {}) {
  const clock = makeClock();
  const wss = { clients: new Set() };
  const store = new SyncStore('stage', null, wss, maxOps ? { maxOps } : {});
  const log = []; // every op the store produced, unbounded (the ring keeps maxOps): value → version
  const push = store._pushOp.bind(store); store._pushOp = (op) => { log.push(op); push(op); };
  const stores = { stage: store };
  const handle = new Function('getSyncStore', 'activeSessions', `return function handle(data, ws) { switch (data.type) {\n${CASES}\n} };`)((n) => stores[n], new Map());
  const fetchFake = async (url) => { const st = stores[String(url).split('/').pop()]; return { ok: !!st, json: async () => JSON.parse(S(st ? st.getSnapshot() : {})) }; };
  const StateSync = new Function('fetch', 'arrivalVerdict', cls + '\nreturn StateSync;')(fetchFake, arrivalVerdict);
  const versionOf = (key, value) => { if (value === undefined) return 0; for (let i = log.length - 1; i >= 0; i--) if (log[i].key === key && log[i].op === 'set' && log[i].value === value) return log[i].version; return null; };
  const client = (name, { up = 5, down = 5 } = {}) => {
    const globals = [], states = [], events = [], offline = [];
    let gen = 0, sock = null, connected = true, lastUp = 0, lastDown = 0;
    const open = () => {
      const g = ++gen;
      sock = { name, readyState: 1, send(m) {
        const t = Math.max(lastDown, clock.now + down); lastDown = t;
        clock.at(t, () => { if (g !== gen || !connected) return; const d = JSON.parse(m); const e = { kind: 'frame', t: clock.now, d }; events.push(e); for (const h of globals) h(d); e.holds = C.sync.get('stage', d.key); });
      } };
      wss.clients.add(sock);
    };
    const upTo = (d) => {
      const so = sock, txt = S(d);
      const t = Math.max(lastUp, clock.now + up); lastUp = t;
      clock.at(t, () => { if (!so.lost) handle(JSON.parse(txt), so); });
    };
    open();
    const wm = { onGlobal: (h) => globals.push(h), onStateChange: (h) => states.push(h), send: (d) => { events.push({ kind: 'sent', t: clock.now, d: JSON.parse(S(d)) }); if (connected) upTo(d); else offline.push(d); } };
    const C = {
      name, events, sync: new StateSync(wm),
      get sock() { return sock; },
      listen(key = '*') { this.sync.on('stage', key, (value, k) => events.push({ kind: 'heard', t: clock.now, key: k, value })); },
      heard(key) { return events.filter((e) => e.kind === 'heard' && e.key === key).map((e) => e.value); },
      acks(key) { return events.filter((e) => e.kind === 'frame' && e.d.type === 'state-ack' && e.d.key === key); },
      // a frame after which this client held a value OLDER than one of its sets the server had acked by then
      olderThanAcked(key) {
        let acked = 0; const out = [];
        for (const e of events) {
          if (e.kind !== 'frame' || e.d.key !== key) continue;
          if (e.d.type === 'state-ack' && e.d.version > acked) acked = e.d.version;
          const v = versionOf(key, e.holds);
          if (acked && v != null && v < acked) out.push({ t: e.t, frame: e.d.type, holds: v, acked });
        }
        return out;
      },
      drop({ loseInFlight = false } = {}) { connected = false; sock.readyState = 3; wss.clients.delete(sock); if (loseInFlight) sock.lost = true; for (const h of states) h(false); },
      reconnect() { open(); connected = true; for (const h of states) h(true); for (const d of offline.splice(0)) upTo(d); },
    };
    return C;
  };
  return { clock, store, log, client, versionOf };
}

const OFFSETS = [0, 1, 2, 5, 10, 20, 50];
const SEED = 0x5eedcede;
function rng(seed) { let x = seed >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hero = (row, who) => S({ key: 'claude:e2e00000-0000-4000-8000-0000000' + String(row).padStart(3, '0') + who, by: who });
const tag = (v) => { try { return v ? JSON.parse(v).by : '∅'; } catch { return '?'; } };

/** One row: both clients on H0, then `first` sets its hero, the other d ms later; run to quiescence. */
async function raceRow(row, { d, first, lat }, cls) {
  const w = world({ cls });
  const A = w.client('A', lat.A), B = w.client('B', lat.B);
  await A.sync.init('stage'); await B.sync.init('stage');
  A.listen(); B.listen();
  w.store.set('hero', hero(row, '0')); w.clock.run(); // the shared start: the hub's record, both hold it
  const [P, Q] = first === 'A' ? [A, B] : [B, A];
  const t0 = w.clock.now + 10;
  w.clock.at(t0, () => P.sync.set('stage', 'hero', hero(row, P.name)));
  w.clock.at(t0 + d, () => Q.sync.set('stage', 'hero', hero(row, Q.name)));
  w.clock.run();
  const srv = w.store.get('hero');
  const sets = w.log.filter((o) => o.key === 'hero' && o.from);
  const raced = sets.length === 2 && sets[0].basedOn < sets[1].version && sets[1].basedOn < sets[0].version; // neither had seen the other
  const older = [...A.olderThanAcked('hero'), ...B.olderThanAcked('hero')];
  return { row, d, first, lat, srv: tag(srv), A: tag(A.sync.get('stage', 'hero')), B: tag(B.sync.get('stage', 'hero')), converged: A.sync.get('stage', 'hero') === srv && B.sync.get('stage', 'hero') === srv, crossed: A.sync.get('stage', 'hero') !== B.sync.get('stage', 'hero'), older: older.length, raced, onWire: sets.length, heardA: A.heard('hero').map(tag).join(''), heardB: B.heard('hero').map(tag).join('') };
}

function table() {
  const r = rng(SEED), rows = [];
  const L = () => 1 + Math.floor(r() * 30);
  for (const d of OFFSETS) {
    rows.push({ d, first: 'A', lat: { A: { up: 10, down: 10 }, B: { up: 10, down: 10 } } });
    for (let k = 0; k < 2; k++) rows.push({ d, first: r() < 0.5 ? 'A' : 'B', lat: { A: { up: L(), down: L() }, B: { up: L(), down: L() } } });
  }
  return rows;
}

console.log('§1 the PURE verdict');
{
  const cases = [
    [{ remote: {}, own: { pending: true, ackedVersion: 9 } }, 'apply', 'no server version ⇒ apply (as before the rule), even beside a pending own set'],
    [{ remote: { version: 0 }, own: {} }, 'apply', 'version 0 is no version ⇒ apply'],
    [{ remote: { version: 7 }, own: { pending: true, ackedVersion: 3 } }, 'queue', 'an own set of the key awaits its ack ⇒ queue'],
    [{ remote: { version: 7 }, own: {} }, 'apply', 'no own acked set ⇒ apply'],
    [{ remote: { version: 7 }, own: { ackedVersion: 7 } }, 'drop', 'version = the own acked set\'s ⇒ drop'],
    [{ remote: { version: 6 }, own: { ackedVersion: 7 } }, 'drop', 'version < the own acked set\'s ⇒ drop'],
    [{ remote: { version: 8 }, own: { ackedVersion: 7 } }, 'apply', 'version > the own acked set\'s ⇒ apply'],
    [{ remote: { version: 8, from: 'c1' }, own: { ackedVersion: 7, pending: false } }, 'apply', '`from` does not decide (the server\'s version does)'],
    [{}, 'apply', 'no input ⇒ apply'],
  ];
  for (const [input, want, name] of cases) ok(arrivalVerdict(input) === want, name, { input, got: arrivalVerdict(input) });
  ok(ARRIVAL_TABLE.length === 5 && ARRIVAL_TABLE.every((x) => ['apply', 'drop', 'queue'].includes(x.verdict) && x.when && x.why), 'the table: five rows, each a case + a verdict + why');
  for (const x of ARRIVAL_TABLE) console.log(`    · ${x.verdict.padEnd(5)} ${x.when} — ${x.why}`);
  const calls = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).reduce((n, f) => n + (read('src/lib/' + f).match(/arrivalVerdict\(/g) || []).length, 0);
  ok(calls === 1 && (CLASS.match(/arrivalVerdict\(/g) || []).length === 1, 'the client asks the verdict at ONE place (StateSync._applyOp)', { calls });
}

console.log('§2 THE RACE — two clients, one key, d ms apart (seeded ' + SEED.toString(16) + ')');
const ROWS = table();
const fixed = [], before = [];
for (let i = 0; i < ROWS.length; i++) { fixed.push(await raceRow(i, ROWS[i], CLASS)); before.push(await raceRow(i, ROWS[i], PRE_FIX)); }
console.log('    row  d  first  lat A↑↓ B↑↓   server | pre-fix A B        | fixed A B');
for (let i = 0; i < ROWS.length; i++) {
  const f = fixed[i], p = before[i], l = ROWS[i].lat;
  console.log(`    ${String(i).padStart(3)} ${String(f.d).padStart(2)}  ${f.first}      ${String(l.A.up).padStart(2)}/${String(l.A.down).padEnd(2)} ${String(l.B.up).padStart(2)}/${String(l.B.down).padEnd(2)}   ${f.srv}      | ${p.A} ${p.B} ${p.crossed ? 'CROSSED' : p.converged ? 'ok     ' : 'OFF    '}${p.older ? ' older×' + p.older : '        '} | ${f.A} ${f.B} ${f.crossed ? 'CROSSED' : f.converged ? 'ok' : 'OFF'}${f.older ? ' older×' + f.older : ''}${f.raced ? '   (raced)' : ''}`);
}
for (const f of fixed) ok(f.onWire === 2 && f.converged && !f.older, `§2 d=${f.d} first=${f.first} lat=${S(ROWS[f.row].lat)}: both hold the server's ${f.srv}; neither held older than its acked set (heard A ${f.heardA || '–'}, B ${f.heardB || '–'})`, f);
const raced = fixed.filter((f) => f.raced).length;
ok(raced >= ROWS.length / 2, `§2 the table races: in ${raced}/${ROWS.length} rows neither set had seen the other (each basedOn < the other's version)`);
const crossedBefore = before.filter((p) => p.crossed).length, olderBefore = before.filter((p) => p.older).length;
const crossedOffsets = [...new Set(before.filter((p) => p.crossed).map((p) => p.d))];
console.log(`    · pre-fix: crossed ${crossedBefore}/${ROWS.length} rows (offsets ${crossedOffsets.join(', ') || '–'}), held older than acked in ${olderBefore}; fixed: crossed ${fixed.filter((f) => f.crossed).length}/${ROWS.length}`);
ok(crossedBefore >= 1 && olderBefore >= 1, `§6 CONTROL: the pre-fix client (every remote op lands on arrival) crosses ${crossedBefore}/${ROWS.length} rows and holds older than acked in ${olderBefore} — the §2 judge sees the bug`);

console.log('§3 per key: another key\'s op lands while an own set is pending');
async function perKey(cls) {
  const w = world({ cls });
  const A = w.client('A', { up: 30, down: 5 }), B = w.client('B', { up: 2, down: 5 });
  await A.sync.init('stage'); await B.sync.init('stage'); A.listen(); B.listen();
  w.clock.at(10, () => A.sync.set('stage', 'hero', hero(900, 'A'))); // A's set is slow to land (30 ms up)
  w.clock.at(10, () => B.sync.set('stage', 'grid', '{"rows":2,"cols":2}')); // B's other key lands first and reaches A at 17
  w.clock.run();
  const gridAt = A.events.find((e) => e.kind === 'heard' && e.key === 'grid');
  const ackAt = A.acks('hero')[0];
  return { grid: A.sync.get('stage', 'grid'), gridAt: gridAt && gridAt.t, ackAt: ackAt && ackAt.t, hero: tag(A.sync.get('stage', 'hero')), srv: tag(w.store.get('hero')) };
}
{
  const r = await perKey(CLASS);
  ok(r.grid === '{"rows":2,"cols":2}' && r.gridAt < r.ackAt && r.hero === 'A' && r.srv === 'A', `③ B's grid reaches A at t=${r.gridAt} — before A's own hero set is acked (t=${r.ackAt}); A keeps its hero`, r);
  const m = await perKey(PER_STORE);
  ok(m.grid === undefined, '§6 CONTROL: a per-STORE verdict holds the grid op behind A\'s hero set and never releases it — A never gets the grid (③ would be red)', m);
}

console.log('§4 a reconnect still converges');
async function offlineSet(cls, { maxOps } = {}) {
  const w = world({ cls, maxOps });
  const A = w.client('A', { up: 5, down: 5 }), B = w.client('B', { up: 5, down: 5 });
  await A.sync.init('stage'); await B.sync.init('stage'); A.listen(); B.listen();
  w.store.set('hero', hero(901, '0')); w.clock.run();
  A.drop();
  B.sync.set('stage', 'hero', hero(901, 'B')); B.sync.set('stage', 'grid', '{"rows":1,"cols":2}'); w.clock.run(); // A misses both
  A.sync.set('stage', 'hero', hero(901, 'A')); // A's user picks a hero while offline (queued on the socket)
  A.reconnect(); w.clock.run(); // resync first, then the queued set (src/lib/ws.js: notify, then flush)
  return { srv: tag(w.store.get('hero')), A: tag(A.sync.get('stage', 'hero')), B: tag(B.sync.get('stage', 'hero')), gridA: A.sync.get('stage', 'grid'), heardA: A.heard('hero').map(tag).join(''), snap: A.events.some((e) => e.kind === 'frame' && e.d.type === 'state-snapshot') };
}
{
  const r = await offlineSet(CLASS);
  ok(!r.snap && r.srv === 'A' && r.A === 'A' && r.B === 'A' && r.gridA === '{"rows":1,"cols":2}' && !r.heardA.includes('B'), `④a the missed ops (state-resync): B's hero is held behind A's offline set and dropped at its ack; the grid lands; all on ${r.srv} (A heard ${r.heardA || '–'})`, r);
  const p = await offlineSet(PRE_FIX);
  ok(p.A === 'B' && p.B === 'A', `§6 CONTROL: the pre-fix client takes B's missed hero over its own offline set — A ${p.A}, B ${p.B}, server ${p.srv}`, p);
  const s = await offlineSet(CLASS, { maxOps: 1 });
  ok(s.snap && s.srv === 'A' && s.A === 'A' && s.B === 'A' && s.gridA === '{"rows":1,"cols":2}', `④b the full snapshot (a ring gap): A's key keeps its offline set, the snapshot's hero is held and dropped at the ack; the grid lands; all on ${s.srv} (A heard ${s.heardA || '–'})`, s);
  const ps = await offlineSet(PRE_FIX, { maxOps: 1 });
  ok(ps.snap && ps.A === 'B' && ps.B === 'A' && ps.srv === 'A', `§6 CONTROL: the pre-fix client takes the snapshot's hero over its own offline set — A ${ps.A}, B ${ps.B}, server ${ps.srv} (④b would be red; the base did the same: its snapshot replaced the key)`, ps);
}
async function inFlight(cls, { loseInFlight }) {
  const w = world({ cls });
  const A = w.client('A', { up: 1, down: 5 }), B = w.client('B', { up: 20, down: 5 });
  await A.sync.init('stage'); await B.sync.init('stage'); A.listen(); B.listen();
  w.store.set('hero', hero(902, '0')); w.clock.run();
  const t0 = w.clock.now + 10;
  w.clock.at(t0, () => { A.sync.set('stage', 'hero', hero(902, 'A')); B.sync.set('stage', 'hero', hero(902, 'B')); });
  w.clock.at(t0 + 10, () => B.drop({ loseInFlight })); // A's op reached B at t0+6 (held); B's own set is still on its way
  w.clock.at(t0 + 60, () => B.reconnect());
  w.clock.run();
  return { srv: tag(w.store.get('hero')), A: tag(A.sync.get('stage', 'hero')), B: tag(B.sync.get('stage', 'hero')), heardB: B.heard('hero').map(tag).join('') };
}
{
  const r = await inFlight(CLASS, { loseInFlight: false });
  ok(r.srv === 'B' && r.A === 'B' && r.B === 'B', `④c B's socket drops with its set in flight (it lands, the ack is lost): the held op is judged at the drop, the resync replays B's own op — all on ${r.srv} (B heard ${r.heardB})`, r);
  const l = await inFlight(CLASS, { loseInFlight: true });
  ok(l.srv === 'A' && l.A === 'A' && l.B === 'A', `④d …the set is lost with the socket: the held op lands at the drop — all on ${l.srv} (B heard ${l.heardB})`, l);
}

console.log('§5 the frames');
{
  const w = world();
  const A = w.client('A'), B = w.client('B');
  await A.sync.init('stage'); await B.sync.init('stage'); A.listen(); B.listen();
  w.store.set('slot', '{"x":1}'); w.clock.run();
  A.sync.set('stage', 'hero', hero(903, 'A')); w.clock.run();
  const op = w.log.at(-1), sent = A.events.find((e) => e.kind === 'sent' && e.d.type === 'state-set');
  const ack = A.acks('hero'), toB = B.events.filter((e) => e.kind === 'frame' && e.d.type === 'state-sync' && e.d.key === 'hero');
  ok(ack.length === 1 && S(Object.keys(ack[0].d)) === S(['type', 'store', 'key', 'version']) && ack[0].d.version === op.version && A.heard('hero').length === 0, `⑤ the sender gets ONE state-ack {type, store, key, version} — the version its set produced (${op.version}); its own listener hears nothing`, { ack: ack.map((e) => e.d), heard: A.heard('hero') });
  ok(sent && sent.d.basedOn === 1, '⑤ the client\'s state-set carries basedOn = the store version it had seen (1: the hub\'s slot)', sent && sent.d);
  ok(toB.length === 1 && /^c[0-9a-z]+$/.test(toB[0].d.from) && toB[0].d.basedOn === 1 && toB[0].d.version === op.version && B.acks('hero').length === 0, `⑤ the broadcast names the sender (from ${toB[0] && toB[0].d.from}) and its basedOn; the other client gets no ack`, toB.map((e) => e.d));
  const before = A.events.length + B.events.length;
  w.store.set('grid', '{"rows":1}'); w.clock.run();
  const hub = B.events.find((e) => e.kind === 'frame' && e.d.key === 'grid');
  ok(hub && !('from' in hub.d) && !('basedOn' in hub.d) && A.acks('grid').length === 0 && B.acks('grid').length === 0, '⑤ a hub write names no sender and is acked to nobody', hub && hub.d);
  A.sync.set('stage', 'nothing-here', ''); w.clock.run();
  const nack = A.acks('nothing-here');
  ok(nack.length === 1 && nack[0].d.version === w.store.version && !B.events.some((e) => e.kind === 'frame' && e.d.key === 'nothing-here') && !A.sync.stores.stage.pending.size, '⑤ deleting a key the server never held is still answered (the store\'s version) and broadcast to nobody — no set is left waiting', nack.map((e) => e.d));
  void before;
  // an op without a version (nothing to judge it by) lands as before, even beside a pending own set
  A.sync.stores.stage.pending.set('hero', 1);
  A.sync._applyOp('stage', { type: 'state-sync', store: 'stage', op: 'set', key: 'hero', value: hero(903, 'X') });
  ok(tag(A.sync.get('stage', 'hero')) === 'X' && A.heard('hero').length === 1, '⑤ an op with no version lands at once, even while an own set of the key is pending (the table\'s first row)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
