#!/usr/bin/env node
// lane ledger-dedup-law (B-7f9e, a fleet instance measured 2026-10-26) — THE LEDGER LAWS, each leg beside the RED it
// answers (every assertion below fails on the base 6428c67e):
//   ① F1 the ledger law — a re-emission costs zero bytes: the same 1000-event batch twice ⇒ the shard unchanged; a big
//     shard's rid index loads in steps while its batch waits (nothing appended blind)
//   ② F2 the harvest law — a cursor nobody approved never re-reads a window: the device commit refused (the base appended
//     the whole window again on every run) ⇒ the hub keeps the cursor and the second run brings 0 events; an old daemon
//     re-reads, the ledger keeps none of it twice, `since-unsupported` said once
//   ③ F3 the ask flood — 20 refusals of a background subject ⇒ ONE standing item (20 cards on the base); the For-you cap
//     evicts the expired first and never an open item
//   ④ F4 the growth alarm — a 3 GiB sparse shard ⇒ its machine's ingest PAUSED + the named notice (the base appends)
//   ⑤ F5 the memory notice names the stranger — pid, command-line head, «an exec from outside the container»
//   ⑥ the latent twin — a 300 MiB sparse tail ⇒ the reader's peak allocation ≤ the step; a sync reader never takes a big
//     warm over
//   ⑦ M the one-shot migration — a 3× fixture ⇒ ⅓ the size, the same totals before and after; a restart mid-way resumes
//   ⑧ (r11) the usage fold worker requires only what it folds — never the hold road (src/usage-hold-road.js) nor the dedup
// Sparse files only (fs.truncateSync — no disk, no load).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); if (d !== undefined) console.error('    ' + JSON.stringify(d).slice(0, 600)); } };
const legMs = [];
const leg = async (name, fn) => { const t0 = performance.now(); try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name} — threw: ${String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ')}`); } legMs.push(`${name} ${Math.round(performance.now() - t0)} ms`); };
const tick = () => new Promise((r) => setImmediate(r));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ldl-'));
const MiB = 1024 * 1024, GiB = 1024 * MiB;
// r8: an ingest that goes to a hold answers once its hold's ASYNC road did (a promise) — quiet() awaits it and settles every
// UsageHistory's road (holdsSettled; absent on a tree whose hold is synchronous — then nothing)
const quiet = async (fn) => { const w = console.warn, l = console.log, said = []; console.warn = (...a) => said.push(a.join(' ')); console.log = (...a) => said.push(a.join(' ')); try { const v = await fn(); await settle(); return [v, said]; } finally { console.warn = w; console.log = l; } };
const quietAsync = async (fn) => { const w = console.warn, l = console.log, said = []; console.warn = (...a) => said.push(a.join(' ')); console.log = (...a) => said.push(a.join(' ')); try { return [await fn(), said]; } finally { console.warn = w; console.log = l; } };

const { UsageHistory: UsageHistory0 } = require(REPO + '/src/usage-history.js');
const ALL_UH = []; // r8: every UsageHistory a leg builds — settle() waits for its hold road
class UsageHistory extends UsageHistory0 { constructor(...a) { super(...a); ALL_UH.push(this); } }
const settle = async () => { for (const u of ALL_UH) if (typeof u.holdsSettled === 'function') await u.holdsSettled(); };
const T0 = Date.UTC(2026, 9, 22, 23, 0, 0, 195); // the window every harvest re-sent
const SHARD = 'events-2026-10.ndjson';
const dirOf = (name) => { const d = path.join(tmp, name); fs.mkdirSync(path.join(d, 'usage-history'), { recursive: true }); return d; };
const shardOf = (dataDir) => path.join(dataDir, 'usage-history', SHARD);
const size = (f) => { try { return fs.statSync(f).size; } catch { return -1; } };
// a remote event as the device walker emits it
const remote = (i) => JSON.stringify({ rid: 'req_' + String(i).padStart(8, '0'), ts: T0 + i * 1000, sid: 'sid-' + (i % 7), model: 'claude-opus-5-5', cwd: '/srv/work/app', origin: 'main', i: 10 + (i % 5), cw5: 1, cw1: 0, cr: 5000, o: 300, tier: null });
const batchOf = (from, n) => Array.from({ length: n }, (_, k) => remote(from + k)).join('\n') + '\n';
// a ledger row the way the hub wrote it (rid, ts, model, be, mode, i/o/cr/cw5/cw1, atype, aname, cwd — the real rows' shape)
const row = (i, host = 'host-m') => JSON.stringify(host
  ? { rid: `h:${host}:req_${String(i).padStart(8, '0')}`, ts: T0 + i * 1000, sid: 'sid-' + (i % 7), be: 'claude', model: 'claude-opus-5-5', acct: host, atype: 'host', aname: 'M', mode: null, host, cwd: '/srv/work/app', origin: 'main', i: 10 + (i % 5), cw5: 1, cw1: 0, cr: 5000, o: 300, tier: null }
  : { rid: `req_local_${String(i).padStart(8, '0')}`, ts: T0 + i * 1000, sid: 'sid-local', be: 'claude', model: 'claude-fable-5-1', acct: null, atype: 'unknown', aname: null, mode: 'chat', cwd: '/srv/work/hub', origin: 'main', i: 7, cw5: 0, cw1: 2, cr: 900, o: 120, tier: null });
const newUh = (dataDir) => new UsageHistory({ dataDir, homeDir: path.join(dataDir, 'home') });

console.log('① F1 THE LEDGER LAW — a re-emission costs zero bytes');
await leg('①', async () => {
  const d = dirOf('f1'), uh = newUh(d), text = batchOf(0, 1000);
  const r1 = uh.ingestRemoteEvents('host-m', 'M', text), s1 = size(shardOf(d));
  const r2 = uh.ingestRemoteEvents('host-m', 'M', text), s2 = size(shardOf(d));
  ok(s1 > 0 && s2 === s1 && r1.appended === 1000 && r1.duplicates === 0 && r2.appended === 0 && r2.duplicates === 1000,
    `① the same 1000-event batch ingested twice ⇒ the shard ${s1} → ${s2} B (2nd: appended ${r2.appended}, duplicates ${r2.duplicates}; the base doubled it)`, { r1, r2, s1, s2 });
  ok(r1.added === 1000 && r2.added === 0, '① `added` (the callers\' old field) is what was appended');
  const uh2 = newUh(d); // a FRESH process: the index is read from the shard, not memory
  const r3 = uh2.ingestRemoteEvents('host-m', 'M', batchOf(990, 20) + remote(1005) + '\n');
  ok(r3.appended === 10 && r3.duplicates === 11 && size(shardOf(d)) > s2, `① a fresh ledger reads its rid index from the shard: 20 events of which 10 known + 1 repeated inside the batch ⇒ appended ${r3.appended}, duplicates ${r3.duplicates}`, r3);
  // a big shard (> 8 MiB unread): its index loads a step per turn; the batch meanwhile is DEFERRED — never appended blind
  const db = dirOf('f1-big'), lines = [];
  for (let i = 0, b = 0; b < 2 * MiB; i++) { lines.push(row(i)); b += lines[i].length + 1; }
  fs.writeFileSync(shardOf(db), lines.join('\n') + '\n');
  const ub = newUh(db), sb = size(shardOf(db));
  ub.ingestIndexInlineBytes = MiB; // the product's 8 MiB, scaled with the fixture
  const known = Array.from({ length: 10 }, (_, k) => remote(k)).join('\n'), fresh = Array.from({ length: 5 }, (_, k) => remote(lines.length + 100 + k)).join('\n');
  const rb1 = ub.ingestRemoteEvents('host-m', 'M', known + '\n' + fresh + '\n');
  ok(rb1.deferred === 'ledger-index-loading' && rb1.appended === 0 && size(shardOf(db)) === sb, `① a ${(sb / MiB).toFixed(1)} MiB shard past the inline bound: the first batch waits while its rid index loads in steps (deferred, nothing appended)`, rb1);
  await ub.ingestIndexSettled?.();
  const rb2 = ub.ingestRemoteEvents('host-m', 'M', known + '\n' + fresh + '\n');
  ok(rb2.appended === 5 && rb2.duplicates === 10, `① …then the same batch: the 10 rows the shard holds are duplicates, the 5 new appended (${rb2.appended}/${rb2.duplicates})`, rb2);
});

console.log('② F2 THE HARVEST LAW — a cursor that cannot be committed never re-reads a window');
const { runUsageWalk } = require(REPO + '/src/usage-walker.js');
const { HostManager } = require(REPO + '/src/hosts.js');
/** A device home with claude transcripts: n assistant records, each one API request. */
function deviceHome(name, n) {
  const home = path.join(tmp, name); const proj = path.join(home, '.claude', 'projects', '-srv-work-app');
  fs.mkdirSync(proj, { recursive: true });
  let k = 0;
  const rec = () => JSON.stringify({ type: 'assistant', requestId: 'req_' + name + '_' + (++k), timestamp: new Date(T0 + k * 1000).toISOString(), cwd: '/srv/work/app', sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', message: { id: 'msg_' + name + '_' + k, model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 7 } } } }) + '\n';
  const file = path.join(proj, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl');
  fs.writeFileSync(file, Array.from({ length: n }, rec).join(''));
  return { home, add: (m) => fs.appendFileSync(file, Array.from({ length: m }, rec).join('')) };
}
/** The device link: its usage scan runs the REAL walker over the device home; every write is REFUSED the way the hub-act
 *  gate refuses an unanswered ask (the base committed the cursor with fsWrite + fsRename). */
function fakeDevice({ home, hubCap = true }) {
  const deviceCursor = path.join(home, '.vibespace', 'usage-cursor.json');
  const calls = { fsWrite: 0, fsRename: 0, scans: [] };
  const refuse = () => Object.assign(new Error('nobody answered within 60 s — VibeSpace did not change files on "M", nothing was done'), { code: 'ask_expired' });
  const dm = {
    async usageScan({ hubCursor = null } = {}) {
      const useHub = !!(hubCursor && hubCap);
      const r = runUsageWalk({ home, cursorFile: deviceCursor, ...(useHub ? { cursors: JSON.parse(JSON.stringify(hubCursor)) } : {}) });
      calls.scans.push({ useHub, events: r.events.length });
      return { ndjson: r.events.length ? r.events.join('\n') + '\n' : '', cursors: r.cursors, cursorFile: deviceCursor, since: useHub ? 'hub' : hubCursor ? 'unsupported' : 'device' };
    },
    async fsWrite() { calls.fsWrite++; throw refuse(); },
    async fsRename() { calls.fsRename++; throw refuse(); },
  };
  return { dm, calls, deviceCursor };
}
function hubWith(name, dev) {
  const d = dirOf(name);
  const hosts = new HostManager({ dataDir: d });
  hosts.setDialToken('m1', 'x'.repeat(64));
  const hid = hosts.findByDeviceId('m1').id;
  hosts.deviceBounded = async () => dev.dm;
  const uh = newUh(d);
  const harvest = async () => {
    const [r, said] = await quietAsync(() => hosts.harvestUsage(hid, { force: true, scannerPath: path.join(REPO, 'data/bin/vibespace-usage-scan'), ledger: uh }));
    return { res: typeof r === 'string' ? uh.ingestRemoteEvents(hid, 'M', r) : r, said }; // the base answers the text; its callers ingested it
  };
  return { d, hosts, hid, uh, harvest };
}
await leg('②', async () => {
  const H = deviceHome('dev-a', 40), dev = fakeDevice({ home: H.home }), w = hubWith('f2', dev);
  const h1 = await w.harvest(), s1 = size(shardOf(w.d));
  const h2 = await w.harvest(), s2 = size(shardOf(w.d));
  ok(dev.calls.scans[0].events === 40 && h1.res.appended === 40, `② run 1: the device walks from its own cursor (none yet) — 40 events, all appended`, { scans: dev.calls.scans, res: h1.res });
  ok(dev.calls.scans[1].events === 0 && dev.calls.scans[1].useHub === true && s2 === s1, `② run 2 with the device commit REFUSED: the hub's cursor was walked from — ${dev.calls.scans[1].events} events, the shard ${s1} → ${s2} B (the base re-read the whole window and appended it again)`, { scans: dev.calls.scans, s1, s2 });
  ok(dev.calls.fsWrite === 0 && dev.calls.fsRename === 0 && !fs.existsSync(dev.deviceCursor), `② no device-side cursor write at all — nothing went to the hub-act gate (fsWrite ${dev.calls.fsWrite}, fsRename ${dev.calls.fsRename})`);
  const hc = w.uh.hostCursorOf?.(w.hid);
  ok(hc && hc.v === 1 && hc.cursors && Object.keys(hc.cursors).length === 1 && fs.existsSync(path.join(w.d, 'usage-history', '_host-cursors', w.hid + '.json')), '② the hub keeps the cursor beside the ledger (_host-cursors/<host>.json — the walker\'s own cursor map + the newest ts / rid)', hc && { since: hc.since, lastTs: hc.lastTs });
  H.add(3);
  const h3 = await w.harvest();
  ok(dev.calls.scans[2].events === 3 && h3.res.appended === 3, `② new transcript records: the next run brings exactly them (${dev.calls.scans[2].events})`, h3.res);
  // an OLDER daemon (no usage-scan-hub-cursor): it walks from its own (never-committed) cursor, the ledger drops the repeats
  const H2 = deviceHome('dev-b', 25), old = fakeDevice({ home: H2.home, hubCap: false }), w2 = hubWith('f2-old', old);
  await w2.harvest(); const so = size(shardOf(w2.d));
  const o2 = await w2.harvest(), o3 = await w2.harvest();
  const saidUnsupported = [...o2.said, ...o3.said].filter((l) => /since-unsupported/.test(l)).length;
  ok(old.calls.scans[1].events === 25 && o2.res.appended === 0 && o2.res.duplicates === 25 && size(shardOf(w2.d)) === so, `② an old daemon re-reads its window (${old.calls.scans[1].events} events) — the ledger keeps none of it twice (appended ${o2.res.appended}, duplicates ${o2.res.duplicates})`, o2.res);
  ok(saidUnsupported === 1 && o2.res.since === 'unsupported', `② …and the hub says since-unsupported ONCE for that machine (${saidUnsupported} lines over two runs)`);
});

console.log('③ F3 THE ASK FLOOD — a refused background subject is ONE standing item');
const ASK = require(REPO + '/src/server/hub-act-ask.js');
const P = require(REPO + '/src/hub-act-policy.js');
const { UserTodoManager } = require(REPO + '/src/user-todos.js');
function asker(name, { userTodos = null } = {}) {
  const d = dirOf(name);
  const hosts = new HostManager({ dataDir: d });
  hosts.setDialToken('mac1', 'x'.repeat(64));
  const hid = hosts.findByDeviceId('mac1').id;
  const clock = { t: 1_800_000_000_000 };
  const todos = userTodos || new UserTodoManager({ dataDir: d, expirySweepMs: 0, now: () => clock.t });
  const timers = [];
  const a = ASK.create({ hosts, userTodos: todos, log: () => { }, now: () => clock.t, instanceKind: 'cluster', settingOf: () => undefined, timers: { set: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; }, clear: (h) => { if (h) h.live = false; } } });
  const fire = () => { for (const h of timers.splice(0)) if (h.live) { h.live = false; h.fn(); } };
  const hubItems = () => todos._state.items.filter((i) => i.action && (i.action.type === 'hub-act-ask' || i.action.type === 'hub-act-standing')); // r8: a standing item has its own type
  return { d, hosts, hid, clock, todos, asker: a, fire, hubItems };
}
const HARVEST_WRITE = { op: 'fs-op', action: 'write', path: '/home/u/.vibespace/usage-cursor.json.tmp', size: 1785031, by: 'system:usage-harvest' };
await leg('③', async () => {
  const w = asker('f3');
  const codes = [];
  for (let i = 0; i < 20; i++) {
    const p = w.asker.check(w.hid, HARVEST_WRITE);
    await tick(); w.clock.t += 61000; w.fire();
    const g = await p; codes.push(g && g.code);
    w.clock.t += P.QUIET_MS; // past the quiet window every time: the base files a new card
  }
  const items = w.hubItems();
  ok(items.length === 1 && items[0].status === 'open' && items[0].action.standing === true && items[0].action.count === 20, `③ 20 refusals of the usage harvest ⇒ ${items.length} item(s) (the base: 20 cards) — ONE standing item, open, its count in place (${items[0] && items[0].action.count})`, items.map((i) => ({ s: i.status, a: i.action })));
  ok(codes[0] === 'ask_expired' && codes.slice(1).every((c) => c === 'ask_standing'), '③ its first act was held the 60 s and expired; every later one refused AT ONCE (ask_standing) — none held', codes);
  ok(items[0] && /^Usage of mac1 is not being recorded/.test(items[0].text) && !items[0].expiresAt && /Refused 20 time\(s\)/.test(items[0].detail), '③ the item names the consequence («Usage of mac1 is not being recorded»), never expires, says how often and when last', items[0] && [items[0].text, items[0].detail]);
  // Allow once ⇒ the NEXT act goes; the one after asks again — on the SAME item (reopened), never a second
  await w.asker.answer(items[0].action.askId, { answer: 'once', by: 'user', answeredBy: 'human:0123456789ab' });
  const g1 = await w.asker.check(w.hid, HARVEST_WRITE);
  const p2 = w.asker.check(w.hid, HARVEST_WRITE); await tick(); w.clock.t += 61000; w.fire(); await p2;
  ok(g1 && g1.ok === true && w.hubItems().length === 1 && w.hubItems()[0].status === 'open', '③ Allow once ⇒ the next act goes; the one after stands again on the SAME item (reopened), never a second', { g1, n: w.hubItems().length });
  // a restart: the open standing item keeps standing — no new card for the next life (a crash loop is not a card per life)
  const a2 = ASK.create({ hosts: w.hosts, userTodos: w.todos, log: () => { }, now: () => w.clock.t, instanceKind: 'cluster', settingOf: () => undefined, timers: { set: () => ({}), clear: () => { } } });
  a2.reconcile();
  const g3 = await a2.check(w.hid, HARVEST_WRITE);
  ok(g3 && g3.code === 'ask_standing' && w.hubItems().length === 1 && w.hubItems()[0].status === 'open', '③ after a restart the standing item still stands: the next act is refused at once, no new card', g3);
});
await leg('③ the cap', async () => {
  // the For-you cap: the expired go first, the open stay, a person's answered item outlives newer expired ones
  const cap = (name, maxItems, nExpired) => {
    const d = dirOf(name), clock = { t: 1_800_000_000_000 };
    const s = new UserTodoManager({ dataDir: d, expirySweepMs: 0, now: () => clock.t, maxItems });
    const u = s.add('k-user', { text: 'answered by the owner', origin: 'agent' }); s.setStatus(u.id, 'done', 'user');
    const ex = [];
    for (let i = 0; i < nExpired; i++) { clock.t += 1000; ex.push(s.add('k-e' + i, { text: 'an ask nobody answered ' + i, origin: 'machines', expiresAt: clock.t + 500 }).id); }
    clock.t += 1000; s.expireDue();
    const open = [s.add('k-o1', { text: 'open one', origin: 'agent' }).id, s.add('k-o2', { text: 'open two', origin: 'agent' }).id];
    const ids = new Set(s._state.items.map((i) => i.id));
    s.stop();
    return { u: u.id, ex, open, ids };
  };
  const c5 = cap('f3-cap5', 5, 4);
  ok(c5.ids.size === 5 && !c5.ids.has(c5.ex[0]) && !c5.ids.has(c5.ex[1]) && c5.ids.has(c5.u) && c5.open.every((id) => c5.ids.has(id)), `③ a cap of 5 with 1 answered + 4 expired + 2 open ⇒ the two oldest EXPIRED go; the open and the owner's answered item stay`, [...c5.ids]);
  const c1000 = cap('f3-cap1000', undefined, 998);
  ok(c1000.ids.size === 1000 && c1000.ids.has(c1000.u) && !c1000.ids.has(c1000.ex[0]) && c1000.open.every((id) => c1000.ids.has(id)), '③ the real 1000 cap: 998 expired asks + 2 open never evict the owner\'s older answered item (base: it went first — oldest resolved)');
});

console.log('④ F4 THE GROWTH ALARM — a shard out of shape pauses its machine and is said');
const LSN = (() => { try { return require(REPO + '/src/server/ledger-shape-notice.js'); } catch { return null; } })();
await leg('④', async () => {
  const d = dirOf('f4'), sh = shardOf(d);
  fs.writeFileSync(sh, [row(0), row(1), row(2)].join('\n') + '\n');
  const small = size(sh);
  fs.truncateSync(sh, 3 * GiB); // SPARSE: 3 GiB of nothing on disk
  const uh = newUh(d), said = []; let remedy = null;
  uh.onShape = (e) => said.push(e);
  uh.dedupShard = (f, o) => { remedy = { f: path.basename(f), why: o && o.why }; const p = new Promise(() => { }); if (uh._dedupJobs) uh._dedupJobs.set(f, p); return p; }; // the remedy is asked (in flight, as the real one registers); its 3 GiB pass is ⑦'s to prove
  const [r] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(0, 50)));
  ok(r.paused && r.appended === 0 && size(sh) === 3 * GiB, `④ a 3 GiB shard: ${size(sh) - 3 * GiB} B appended, the machine's ingest PAUSED (the base appended the batch)`, r);
  const pz = (uh.ingestPaused?.() || [])[0];
  ok(said.length === 1 && said[0].kind === 'paused' && pz && pz.host === 'host-m' && pz.shard === SHARD && pz.why === 'size' && remedy && remedy.f === SHARD, '④ said ONCE (onShape: paused — what, how big, which machine) + the remedy started (the shard\'s streaming dedup)', { said, pz, remedy });
  const w = LSN && LSN.noticeOf(said[0] || {});
  // r4 (a pause is ONE month's, its rows HELD at the hub): the words name the month held, and how many of its events
  ok(w && /Usage of M for 2026-10 is held/.test(w.text) && /3\.00 GiB/.test(w.detail) && /events-2026-10/.test(w.detail) && /Which machine: M/.test(w.detail) && /50 events of 2026-10 held/.test(w.detail) && /What to do/.test(w.detail), '④ the notice names what (the file), how big, which machine, what is held (50 events of 2026-10), what happens now and what to do', w && [w.text, w.detail]);
  const [r2] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(0, 50)));
  // r4 re-derived: it PINNED «held 100 events on the device» (the same 50 refused twice); it PINS NOW the same 50 held ONCE
  // at the hub (the re-send is 50 duplicates), so nothing new to say
  ok(r2.paused && r2.paused.held === 50 && r2.duplicates === 50 && said.length === 1, '④ a second batch (the same 50 re-sent): still paused, held ONCE at the hub (50 held, 50 duplicates), not said again');
  fs.truncateSync(sh, small); // back in shape (what the dedup leaves)
  const [r3] = await quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(100, 50)));
  // r8: the drain runs on the hold's async road — the batch is queued in the hold behind it (held 50, acked) and recorded in
  // order once it ends (the tail below); r7 drained a small hold inline and appended the batch after it (appended 50)
  ok((r3.appended === 50 || (r3.held === 50 && r3.ack)) && said.length === 2 && said[1].kind === 'resumed' && !(uh.ingestPaused?.() || []).length, `④ back in shape ⇒ recorded again (${r3.appended ? `${r3.appended} appended` : `${r3.held} held behind the drain, acked`}), said (resumed), the pause gone from the Usage window's state`, { r3, said: said.map((e) => e.kind) });
  const tail = fs.readFileSync(sh, 'utf-8').split('\n').filter(Boolean).slice(3).map((l) => JSON.parse(l).rid);
  const want = [...Array.from({ length: 47 }, (_, k) => 3 + k), ...Array.from({ length: 50 }, (_, k) => 100 + k)].map((i) => 'h:host-m:req_' + String(i).padStart(8, '0'));
  ok(tail.join() === want.join(), `④ r4: the 50 events held while paused are in the ledger first, in order — the 3 it already held (req 0–2) cost 0 bytes, the ledger law — then the batch that found it in shape (${tail.length} rows after the 3)`, tail.slice(0, 2).concat(tail.slice(45, 49)));
  // the ratio rule (from 64 MiB in the product — a seam here): a shard ~3× its distinct rows ⇒ paused, why 'ratio'
  const d2 = dirOf('f4-ratio'), rows = [];
  for (let k = 0; k < 3; k++) for (let i = 0; i < 400; i++) rows.push(row(i));
  fs.writeFileSync(shardOf(d2), rows.join('\n') + '\n');
  const u2 = newUh(d2); u2.shapeRatioMinBytes = 0; u2.dedupShard = () => new Promise(() => { });
  const [r4] = await quiet(() => u2.ingestRemoteEvents('host-m', 'M', batchOf(5000, 5)));
  ok(r4.paused && r4.paused.why === 'ratio' && r4.paused.ratio >= 2.9, `④ a shard ~3× its distinct rows ⇒ paused (why ratio, ${r4.paused && r4.paused.ratio}×)`, r4);
});

console.log('⑤ F5 THE MEMORY NOTICE NAMES THE STRANGER');
const MP = require(REPO + '/src/memory-pressure.js');
const SI = require(REPO + '/src/sysinfo.js');
await leg('⑤', async () => {
  const B64 = 'Y29uc3QgZnMgPSByZXF1aXJlKCdmcycpOyBmb3IgKGNvbnN0IGYgb2YgZnMucmVhZGRpclN5bmMoJ2RhdGEvdXNhZ2UtaGlzdG9yeScpKSA'.repeat(40);
  const procs = [ // a fleet container: init, the hub, a job — and the admin's probe exec'd in from outside (ppid 0)
    { pid: 1, ppid: 0, pss: 4 * MiB, comm: 'tini', args: 'tini -- node server.js' },
    { pid: 7, ppid: 1, pss: 420 * MiB, comm: 'node', args: 'node server.js' },
    { pid: 185, ppid: 1, pss: 57 * MiB, comm: 'node', args: 'node server.mjs' },
    { pid: 339, ppid: 0, pss: 3 * MiB, comm: 'runuser', args: 'runuser -u userq -- bash -lc ...' },
    { pid: 340, ppid: 339, pss: 4 * MiB, comm: 'bash', args: 'bash -lc ...' },
    { pid: 346, ppid: 340, pss: 18 * GiB, comm: 'node', args: 'node' },
  ];
  const groups = MP.attribute(procs, { sessions: [], jobs: [{ pid: 185, name: 'asset-planner' }], apps: [], keepers: {} });
  const g = groups[0];
  // what the watch hands in: sysinfo's ONE reader over each /proc/<pid>/cmdline (here: the fixture bytes)
  if (typeof SI.cmdlineHeadOf === 'function') { g.topCmd = SI.cmdlineHeadOf(Buffer.from('node\0')); g.rootCmd = SI.cmdlineHeadOf(Buffer.from(`runuser\0-u\0userq\0--\0bash\0-lc\0cd ~/vibespace && echo ${B64} | base64 -d | node\0`)); }
  const it = MP.pressureItem({ pct: 96, used: 30.1 * GiB, limit: 32 * GiB, groups });
  ok(g.kind === 'unknown' && g.topPid === 346 && g.rootPid === 339 && g.outside === true, `⑤ the stranger's group: its largest process pid ${g.topPid}, its tree's root pid ${g.rootPid} with no parent in the container (outside: ${g.outside})`, { kind: g.kind, topPid: g.topPid, rootPid: g.rootPid, outside: g.outside });
  ok(/held by pid 346 \(node\) — not started by VibeSpace, an exec from outside the container/.test(it.text), `⑤ the item names it: pid, command line, «not started by VibeSpace — an exec from outside the container» (here: «${it.text.split('— the most is held by ')[1] || it.text}»; the base: «a process VibeSpace did not start: runuser (339)»)`, it.text);
  ok(/pid 346 was started under pid 339: runuser -u userq -- bash -lc cd ~\/vibespace && echo /.test(it.detail) && it.detail.split('\n').every((l) => l.length <= 400) && !it.detail.includes(B64), '⑤ …and who started it: the root\'s command-line head, cut at 120 chars (the base64 payload never whole)', it.detail);
  const tok = ['sk', '-an', 't-0123456789abcdefghijklmnop'].join(''); // a key SHAPE built at runtime (never a literal in the tree — push protection)
  const secret = SI.cmdlineHeadOf && SI.cmdlineHeadOf(Buffer.from(`curl\0-H\0Authorization: Bearer ${tok}\0https://x\0`));
  ok(typeof secret === 'string' && !secret.includes(tok.slice(0, 16)) && /«redacted»/.test(secret), '⑤ a secret on a command line is redacted (secret-shapes, the one rule)', secret);
  const own = await (SI.cmdlineHead ? SI.cmdlineHead(process.pid) : Promise.resolve(null));
  // r10 (int361's train fact): /proc/<pid>/cmdline starts with argv[0] AS THE SPAWNER PASSED IT — `process.argv0`, a bare `node` or
  // the full path ci.mjs spawns (process.execPath); r1–r9 compared its basename, red under ci.mjs (green by hand)
  ok(typeof own === 'string' && own.startsWith(String(process.argv0).slice(0, 100)) && own.length <= 120, '⑤ the shared reader on a live process: /proc/<pid>/cmdline, ≤ 120 chars', own);
  const watch = fs.readFileSync(path.join(REPO, 'src/server/memory-pressure-watch.js'), 'utf8');
  ok(/SI\.cmdlineHead\(g\.topPid\)/.test(watch) && !/['"`]\/cmdline/.test(watch.replace(/\/\/.*$/gm, '')), '⑤ the watch names strangers through sysinfo\'s reader (the shared module) — no /proc cmdline reader of its own');
});

console.log('⑥ THE LATENT TWIN — the tail reader is bounded');
await leg('⑥', async () => {
  const d = dirOf('f6'), sh = shardOf(d);
  fs.writeFileSync(sh, [0, 1, 2, 3, 4].map((i) => row(i)).join('\n') + '\n');
  fs.truncateSync(sh, size(sh) + 300 * MiB); // a 300 MiB SPARSE tail with no row in it
  const real = Buffer.alloc; let peak = 0;
  Buffer.alloc = function (n, ...a) { if (n > peak) peak = n; return real.call(this, n, ...a); };
  let n1 = -1;
  const uh = newUh(d);
  try { [n1] = await quiet(() => uh._loadEvents().length); } finally { Buffer.alloc = real; }
  ok(n1 === 5 && peak <= MiB, `⑥ a 300 MiB sparse tail: the sync load reads it a step at a time — peak allocation ${(peak / MiB).toFixed(2)} MiB ≤ the 1 MiB step (the base: one 300 MiB allocation), ${n1} rows loaded`, { n1, peak });
  fs.appendFileSync(sh, row(5) + '\n'); uh._evCache.checkedAt = 0;
  const [n2] = await quiet(() => uh._loadEvents().length);
  ok(n2 === 6, `⑥ a row appended past the zeros is read (the zero run glued to its start is stripped): ${n2} rows`);
  // a sync reader never takes a BIG warm over: it answers from the rows loaded so far and says so; an async one waits
  const d2 = dirOf('f6-warm'), lines = [];
  for (let i = 0, b = 0; b < 3 * MiB; i++) { lines.push(row(i)); b += lines[i].length + 1; }
  fs.writeFileSync(shardOf(d2), lines.join('\n') + '\n');
  const u2 = newUh(d2), q = [];
  u2.takeoverMaxBytes = MiB; // the product's 8 MiB (≈ 8 steps), scaled with the fixture
  const warm = u2.warmStepped({ next: (fn) => q.push(fn) });
  const t0 = performance.now(); u2.sourceWatermarks(); const held = performance.now() - t0;
  const loaded = u2._evCache.events.length + u2._evCache.cold.n;
  ok(loaded < lines.length && u2._evCache.pending && u2.ledgerLoading?.() && u2.ledgerLoading().bytesLeft > MiB, `⑥ a sync reader during a ${(size(shardOf(d2)) / MiB).toFixed(0)} MiB warm (past the takeover bound) does not take it over (${loaded} of ${lines.length} rows loaded, ${held.toFixed(0)} ms) and ledgerLoading() says what is left (base: the reader parses the whole rest in its own tick)`, { loaded, total: lines.length, held });
  let aDone = false;
  const ap = u2.aggregateAsync({}).then((a) => { aDone = true; return a; });
  await tick(); await tick();
  const waited = !aDone;
  while (q.length) q.shift()();
  await warm; const a = await ap;
  ok(waited && a && a.totals && a.totals.requests === lines.length, `⑥ an async reader waits for the warm and then answers from the whole ledger (${a && a.totals && a.totals.requests} requests)`, a && a.totals);
});

console.log('⑦ M THE ONE-SHOT MIGRATION — a 3× shard to ⅓, the same totals');
const LD = (() => { try { return require(REPO + '/src/usage-ledger-dedup.js'); } catch { return null; } })();
await leg('⑦', async () => {
  const root = path.join(tmp, 'm7'), d = path.join(root, 'data'); fs.mkdirSync(path.join(d, 'usage-history'), { recursive: true });
  const sh = shardOf(d), N = 1500, windows = [];
  // the incident's shape: every harvest re-sent the window since the floor — windows [0, k·N/3) appended one after another
  for (let k = 1; k <= 3; k++) for (let i = 0; i < N; i++) windows.push(i % 10 === 0 ? row(i, null) : row(i));
  fs.writeFileSync(sh, windows.join('\n') + '\n');
  const uniqueBytes = Array.from({ length: N }, (_, i) => (i % 10 === 0 ? row(i, null) : row(i)).length + 1).reduce((a, b) => a + b, 0);
  const before = size(sh), tot0 = newUh(d).aggregate().totals;
  const M = require(REPO + '/src/server/migrations.js').create({ rootDir: root });
  const m = M.MIGRATIONS.find((x) => x.id === '2026-10-usage-ledger-dedup');
  ok(!!m, '⑦ the registry row 2026-10-usage-ledger-dedup exists (src/server/migrations.js, through the shared runner)');
  const r0 = process.resourceUsage().maxRSS;
  const [rep] = await quietAsync(async () => (m ? m.run() : null));
  const rss = process.resourceUsage().maxRSS;
  const after = size(sh), tot1 = newUh(d).aggregate().totals;
  const line = rep && rep.journal && rep.journal[0];
  ok(rep && after === uniqueBytes && Math.abs(after * 3 - before) <= 3 && line && line.shard === SHARD && line.before === before && line.after === after && line.removed === 2 * N, `⑦ the 3× shard: ${before} → ${after} B (⅓), journal {shard, before, after, removed: ${line && line.removed}} — peak RSS ${(rss / 1024).toFixed(0)} MiB (+${((rss - r0) / 1024).toFixed(0)})`, { rep, after, uniqueBytes });
  ok(JSON.stringify(tot0) === JSON.stringify(tot1) && tot0.requests === N, `⑦ the totals from a fresh ledger read are the SAME before and after (${tot0.requests} requests, $${(tot0.cost || 0).toFixed ? tot0.cost.toFixed(4) : tot0.cost})`, { tot0, tot1 });
  const [rep2] = await quietAsync(async () => (m ? m.run() : null));
  ok(rep2 && rep2.deduped === 0 && size(sh) === after, '⑦ run again: nothing repeated is left (the shard sampled in shape, untouched)');
  // a restart MID-WAY: the pass leaves its tmp; the next run discards it and resumes from the shard's start
  fs.writeFileSync(sh, windows.join('\n') + '\n');
  const gen = LD.dedupSteps(sh, { step: 64 * 1024 });
  for (let i = 0; i < 5; i++) gen.next(); // … and the process dies here (no return, no finally)
  const tmpLeft = fs.existsSync(sh + LD.TMP_SUFFIX);
  const res = LD.runNow(LD.dedupSteps(sh, { step: 64 * 1024 }));
  ok(tmpLeft && res.renamed && size(sh) === uniqueBytes && !fs.existsSync(sh + LD.TMP_SUFFIX), '⑦ a restart mid-way: the stale tmp is discarded, the run resumes and ends at the same ⅓');
  // the boot law: stepped on the loop, no turn ≥ 250 ms
  fs.writeFileSync(sh, windows.join('\n') + '\n');
  const r2 = await LD.runStepped(LD.dedupSteps(sh, { step: 64 * 1024 }), { sliceMs: 40 });
  ok(r2.drive && r2.drive.steps > 10 && r2.drive.maxStepMs < 250, `⑦ stepped: ${r2.drive && r2.drive.steps} steps, the longest ${r2.drive && r2.drive.maxStepMs} ms (< 250 — the boot law)`, r2.drive);
  // through the runner: the boot goes on at once ("started"), the ledger records it when it ENDS
  fs.writeFileSync(sh, windows.join('\n') + '\n');
  const [res3] = await quiet(() => M.runLocalMigrations({ only: ['2026-10-usage-ledger-dedup'] }));
  const st0 = res3 && res3[0] && res3[0].status;
  const ledger = () => { try { return JSON.parse(fs.readFileSync(path.join(d, 'migrations.json'), 'utf8')); } catch { return {}; } };
  const at0 = !!(ledger().applied || {})['2026-10-usage-ledger-dedup'];
  for (let i = 0; i < 2000 && !(ledger().applied || {})['2026-10-usage-ledger-dedup']; i++) await new Promise((r) => setTimeout(r, 5));
  const rec = ledger();
  ok(st0 === 'started' && !at0 && rec.applied && rec.applied['2026-10-usage-ledger-dedup'] && rec.reports['2026-10-usage-ledger-dedup'].deduped === 1 && size(sh) === uniqueBytes, `⑦ through the runner: the boot goes on at once (${st0}), recorded only when it ends (ledger: applied + its report)`, { st0, at0, report: rec.reports && rec.reports['2026-10-usage-ledger-dedup'] });
});

// ── ⑧ (r11 — test-cache-bounds §30 red 13 of 34 at 3c8c0501: the usage fold worker requires usage-history.js, which had grown
// to 3 006 lines with the hold road and required the dedup; its baseline heap +0.32 MB against §30's 30 MB soft cap):
// THE FOLD WORKER REQUIRES ONLY WHAT IT FOLDS — the hold road (src/usage-hold-road.js) and the dedup are loaded by the first
// UsageHistory constructed, never by the worker; the two files define no method twice; nothing the worker reaches is the road's ──
await leg('⑧', async () => {
  const { Worker } = require('node:worker_threads');
  const H = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8'), roadFile = path.join(REPO, 'src/usage-hold-road.js');
  const R = fs.existsSync(roadFile) ? fs.readFileSync(roadFile, 'utf8') : '';
  const methods = (text) => { const out = new Map(), heads = [...text.matchAll(/^  (?:async )?([A-Za-z_$][\w$]*)\s*\(.*\)\s*\{/gm)].filter((m) => !/^(if|for|while|switch|catch|function|return)$/.test(m[1])); /* r12: a keyword is no method */ heads.forEach((m, i) => out.set(m[1], text.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : text.length))); return out; };
  const hm = methods(H), rm = methods(R);
  const both = [...rm.keys()].filter((n) => hm.has(n) && n !== 'constructor');
  const seen = new Set(), todo = ['_aggBegin', '_aggRow', '_aggEnd', '_packWhole'];
  while (todo.length) { const n = todo.pop(); if (seen.has(n) || !hm.has(n)) { if (rm.has(n)) seen.add(n); continue; } seen.add(n); for (const m of hm.get(n).matchAll(/this\.([A-Za-z_$][\w$]*)/g)) todo.push(m[1]); }
  const reachedRoad = [...seen].filter((n) => rm.has(n));
  // the worker, as usage-history.js starts it — every module it loads recorded; a rebuild and a fold asked of it
  const d = path.join(tmp, 'w8'); fs.mkdirSync(d, { recursive: true });
  const src = `const M = require('module'), { parentPort } = require('worker_threads'), seen = new Set(), o = M._load;
M._load = function (r, p, ...x) { try { seen.add(M._resolveFilename(r, p)); } catch { } return o.call(this, r, p, ...x); };
parentPort.on('message', (m) => { if (m && m.op === 'loaded?') parentPort.postMessage({ ev: 'loaded', files: [...seen] }); });
require(${JSON.stringify(path.join(REPO, 'src/usage-cold-worker.js'))});`;
  const w = new Worker(src, { eval: true });
  const ask = (msg, ev) => new Promise((res) => { const t = setTimeout(() => res({ ev: 'timeout' }), 10000); const on = (m) => { if (m && (m.id === msg.id || (ev && m.ev === ev))) { clearTimeout(t); w.off('message', on); res(m); } }; w.on('message', on); w.postMessage(msg); });
  let rb, fold, files = [];
  try {
    rb = await ask({ op: 'rebuild', id: 1, dir: d, windowMs: 40 * 864e5, hotMaxBytes: MiB, coldMaxBytes: MiB });
    fold = await ask({ op: 'fold', id: 2, query: { from: 0, to: Date.now() }, walk: { dir: d, shards: [], groups: [] }, hot: { tss: new Float64Array(0), locs: new Float64Array(0), rh: new Uint32Array(0) }, pricing: {}, rowBudget: 1000, capMb: 0 });
    ({ files = [] } = await ask({ op: 'loaded?' }, 'loaded'));
  } finally { await w.terminate(); }
  const rel = files.map((f) => path.relative(REPO, f)).filter((f) => f.startsWith('src/'));
  const loadedRoad = rel.filter((f) => f === 'src/usage-hold-road.js' || f === 'src/usage-ledger-dedup.js');
  ok(R && rm.size > 50 && !both.length && !reachedRoad.length && rb && rb.ev === 'done' && fold && fold.ev === 'done' && rel.includes('src/usage-history.js') && !loadedRoad.length,
    `⑧ the usage fold worker (a rebuild ${rb && rb.ev}, a fold ${fold && fold.ev}) loads ${rel.length} src modules — usage-history.js, ${loadedRoad.length ? 'AND ' + loadedRoad.join(' + ') : 'not the hold road (' + rm.size + ' methods) nor the dedup'}; the two files define ${both.length} method(s) twice; the worker's reach (${seen.size} methods) holds ${reachedRoad.length} of the road's (3c8c0501: no road — the worker loads usage-ledger-dedup.js with the 3 006-line usage-history.js)`,
    { both, reachedRoad, rel, rb: rb && rb.ev, fold: fold && (fold.error || fold.ev) });
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log('  · ' + legMs.join(' · '));
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
