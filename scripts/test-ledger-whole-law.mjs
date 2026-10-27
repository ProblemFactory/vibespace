#!/usr/bin/env node
// lane ledger-dedup-law ROUND 2 (B-7f9e, the acceptance of e11e1f61) — THE WHOLE-LEDGER LAWS, each leg beside the RED it
// answers (every leg fails on e11e1f61, the round-1 tip):
//   ① no money decision from a partial ledger — 20 000 rows, a 256 KiB takeover bound, 64 KiB warm steps, two steps in:
//     costBetweenMulti says `partial` (e11e1f61: a few hundred of 20 000 requests answered as the whole), the estimator
//     writes no rates.json and answers no estimate, the anchor sweep waits and runs ONCE on the whole ledger, the automatic
//     pool decision is skipped and said once
//   ② a reload mid-warm RESTARTS the warm — 5000 rows three times, three warm steps, the shard's dedup ends: a warm is
//     pending again and the next sync reader loads nothing in its own tick (e11e1f61: the cache is gone, the reader parses
//     the whole ledger)
//   ③ a standing item per SUBJECT — the usage harvest stands; the writer sweep's act of the same kind on the same machine
//     gets its OWN item (e11e1f61: ask_standing under the harvest's words); Allow once on the harvest's item lets no other
//     subject's act go (e11e1f61: the next background act took it)
//   ④ a standing item CLOSES — its subject's act allowed by the instance-wide setting, the setting alone (re-judged), a week
//     silent («no longer asked»); a boot re-judges instead of restoring
//   ⑤ F4 says what HAPPENED — a dedup that fails (EACCES) leaves the machine paused with the error and the next try in the
//     notice (never «resumes by itself»); retried at a later pause past the backoff; back in shape ⇒ resumed + closed
//   ⑥ F4 ONE notice per machine, reconciled at boot — still out of shape ⇒ the same item stays (size re-worded in place); in
//     shape ⇒ closed; a new size never files a second one
//   ⑦ F4 the shape judged WHOLE — the sample spans head, middle and tail; a 448 MiB SPARSE shard whose first 64 MiB are unique
//     and the rest one window three times ⇒ paused 'ratio' by the ingest index's exact count, deduped, resumed (e11e1f61:
//     the sample reads it in shape and the batch is appended)
// In-process, no server; sparse files for every big shape (fs.truncateSync / a write at an offset — no disk, no load).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); if (d !== undefined) console.error('    ' + JSON.stringify(d).slice(0, 700)); } };
const legMs = [];
const leg = async (name, fn) => { const t0 = performance.now(); try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name} — threw: ${String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ')}`); } legMs.push(`${name} ${Math.round(performance.now() - t0)} ms`); };
/** One loop turn's work, timed (the boot law's unit): → [its value, ms]. */
const turn = (fn) => { const t0 = performance.now(); const v = fn(); return [v, performance.now() - t0]; };
const tick = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ldw-'));
const KiB = 1024, MiB = 1024 * KiB, GiB = 1024 * MiB;
const quiet = (fn) => { const w = console.warn, l = console.log, said = []; console.warn = (...a) => said.push(a.join(' ')); console.log = (...a) => said.push(a.join(' ')); try { return [fn(), said]; } finally { console.warn = w; console.log = l; } };
const quietAsync = async (fn) => { const w = console.warn, l = console.log, said = []; console.warn = (...a) => said.push(a.join(' ')); console.log = (...a) => said.push(a.join(' ')); try { return [await fn(), said]; } finally { console.warn = w; console.log = l; } };
const opt = (rel) => { try { return require(REPO + rel); } catch { return {}; } };

const { UsageHistory } = require(REPO + '/src/usage-history.js');
const { costBetweenMulti } = require(REPO + '/src/usage-anchors.js');
const EST = require(REPO + '/src/usage-estimator.js');
const LSN = opt('/src/server/ledger-shape-notice.js');
const LD = opt('/src/usage-ledger-dedup.js');
const T0 = Date.UTC(2026, 9, 22, 23, 0, 0, 195);
const SHARD = 'events-2026-10.ndjson';
const dirOf = (name) => { const d = path.join(tmp, name); fs.mkdirSync(path.join(d, 'usage-history'), { recursive: true }); return d; };
const shardOf = (dataDir) => path.join(dataDir, 'usage-history', SHARD);
const size = (f) => { try { return fs.statSync(f).size; } catch { return -1; } };
const newUh = (dataDir) => new UsageHistory({ dataDir, homeDir: path.join(dataDir, 'home') });
// a local ledger row (its account = the machine login, priced) and a remote one the way the hub ingests it
const local = (i) => JSON.stringify({ rid: `req_local_${String(i).padStart(8, '0')}`, ts: T0 + i * 1000, sid: 'sid-' + (i % 5), be: 'claude', model: 'claude-opus-5-5', acct: null, atype: 'unknown', aname: null, mode: 'chat', cwd: '/srv/work/hub', origin: 'main', i: 7, cw5: 0, cw1: 2, cr: 900, o: 120, tier: null });
const row = (i, host = 'host-m') => JSON.stringify({ rid: `h:${host}:req_${String(i).padStart(8, '0')}`, ts: T0 + i * 1000, sid: 'sid-' + (i % 7), be: 'claude', model: 'claude-opus-5-5', acct: host, atype: 'host', aname: 'M', mode: null, host, cwd: '/srv/work/app', origin: 'main', i: 10 + (i % 5), cw5: 1, cw1: 0, cr: 5000, o: 300, tier: null });
const remote = (i) => JSON.stringify({ rid: 'req_' + String(i).padStart(8, '0'), ts: T0 + i * 1000, sid: 'sid-' + (i % 7), model: 'claude-opus-5-5', cwd: '/srv/work/app', origin: 'main', i: 10, cw5: 1, cw1: 0, cr: 5000, o: 300, tier: null });
const batchOf = (from, n) => Array.from({ length: n }, (_, k) => remote(from + k)).join('\n') + '\n';
const loadedRows = (uh) => (uh._evCache ? uh._evCache.events.length + uh._evCache.cold.n : 0);

console.log('① NO MONEY DECISION FROM A PARTIAL LEDGER — 20 000 rows, two warm steps in');
await leg('①', async () => {
  const d = dirOf('w1'), N = 20000;
  fs.writeFileSync(shardOf(d), Array.from({ length: N }, (_, i) => local(i)).join('\n') + '\n');
  const uh = newUh(d), q = [];
  uh.takeoverMaxBytes = 256 * KiB; // the product's 8 MiB, scaled with the fixture (the acceptance's own numbers)
  const warm = uh.warmStepped({ chunkBytes: 64 * KiB, next: (fn) => q.push(fn) });
  q.shift()(); // …two warm steps in (the first ran in the call)
  const ids = ['__global__'], from = T0 - 1, to = T0 + N * 1000;
  const c1 = costBetweenMulti(uh, ids, from, to);
  ok(c1.requests < N && c1.partial === true, `① costBetweenMulti two steps into the warm: ${c1.requests} of ${N} requests, $${c1.total} — partial: ${c1.partial} (e11e1f61: the same count answered as the whole, silently)`, { requests: c1.requests, partial: c1.partial });
  const c1b = costBetweenMulti(uh, ids, from, to);
  ok(c1b.partial === true, '① …and a partial answer is never memoized (the second ask reads again, still partial)');
  // the estimator: no rate learned from it, none written, no estimate
  const ad = path.join(d, 'usage-anchors'); fs.mkdirSync(ad, { recursive: true });
  const ue = new EST.UsageEstimator({ lagS: 0, anchorsDir: ad, usageHistory: () => uh, resolveIdentity: () => ({ identityKey: 'ident-1' }) }); // the Max priors: rates exist with no pair
  ue.ratesFor('ident-1');
  const raw = { fetchedAt: T0 + N * 1000, fiveHour: { utilization: 0.4, resetsAt: Math.floor((T0 + N * 1000) / 1000) + 3600 }, sevenDay: { utilization: 0.3, resetsAt: Math.floor((T0 + N * 1000) / 1000) + 86400 } };
  const est = ue.estimateFor(null, raw, T0 + N * 1000 + 60e3);
  ok(!fs.existsSync(path.join(ad, 'rates.json')) && est === null, `① the estimator during the warm: rates.json ${fs.existsSync(path.join(ad, 'rates.json')) ? 'WRITTEN' : 'not written'}, the estimate ${est === null ? 'none (the reading stands)' : 'computed off part of the ledger'} (e11e1f61: written + computed)`, { est });
  // the engine's sweep + its automatic decision, through the gate
  const gate = typeof EST.wholeLedgerGate === 'function' ? EST.wholeLedgerGate({ ledger: uh, log: (m) => said.push(m), onWhole: () => { wholes++; } }) : null;
  const said = []; let wholes = 0, sweeps = 0, sweptReq = -1, sweptPartial = null;
  const sweep = () => { sweeps++; const c = costBetweenMulti(uh, ids, from, to); sweptReq = c.requests; sweptPartial = !!c.partial; };
  const r1 = gate ? gate.run(sweep) : (sweep(), 'ran'), r2 = gate ? gate.run(sweep) : 'ran', held = gate ? gate.holds() : false;
  ok(r1 === 'waiting' && r2 === 'waiting' && sweeps === 0 && held === true && said.length === 1 && /ledger still loading/.test(said[0]), `① the anchor sweep WAITS (${r1}, a second ask joins it — ${sweeps} run), the automatic pool decision is skipped (holds: ${held}), said once: «${said[0] || ''}»`, { r1, r2, sweeps, said });
  while (q.length) q.shift()();
  await warm; await tick(); await tick();
  const c2 = costBetweenMulti(uh, ids, from, to);
  ok(sweeps === 1 && sweptReq === N && sweptPartial === false && wholes === 1 && c2.requests === N && !c2.partial, `① the warm ends ⇒ the sweep runs ONCE on the whole ledger (${sweptReq} requests), the pools are decided again (onWhole ×${wholes}), costBetweenMulti whole: ${c2.requests} requests, $${c2.total}`, { sweeps, sweptReq, wholes, c2: c2.requests });
  ue.ratesFor('ident-1');
  ok(fs.existsSync(path.join(ad, 'rates.json')), '① on the whole ledger the rates are learned and written again (the first ask after the warm)');
  // the wiring: the engine's two money writers stand behind the gate
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const auto = eng.slice(eng.indexOf('function maybePoolAutoSwitchForPool('), eng.indexOf('function maybePoolAutoSwitchForPool(') + 600);
  ok(/function sweepUsageAnchors\(\) \{ return _wholeLedger\.run\(sweepUsageAnchorsNow\); \}/.test(eng) && /if \(_wholeLedger\.holds\(\)\) return;/.test(auto) && /wholeLedgerGate\(\{\s*ledger: usageHistory/.test(eng), '① the wiring: the pool engine\'s sweep goes through the gate, its automatic decision returns while it holds');
});

console.log('② A RELOAD MID-WARM RESTARTS THE WARM — 5000 rows three times, three steps in, the dedup ends');
await leg('②', async () => {
  const d = dirOf('w2'), sh = shardOf(d), N = 5000, lines = [];
  for (let k = 0; k < 3; k++) for (let i = 0; i < N; i++) lines.push(row(i));
  fs.writeFileSync(sh, lines.join('\n') + '\n');
  const uh = newUh(d), q = [];
  uh.takeoverMaxBytes = 256 * KiB;
  const warm = uh.warmStepped({ chunkBytes: 64 * KiB, next: (fn) => q.push(fn) });
  q.shift()(); q.shift()(); // three warm steps
  const before = loadedRows(uh);
  const [res] = await quietAsync(() => uh.dedupShard(sh, { archiveDir: path.join(d, 'archive'), sliceMs: 40 }));
  const c = uh._evCache;
  ok(res && res.renamed && res.removed === 2 * N && c && c.pending && uh.ledgerLoading && uh.ledgerLoading(), `② the dedup ends mid-warm (${before} rows loaded, ${res && res.removed} repeated rows removed): a warm is PENDING again — ${c ? `${loadedRows(uh)} rows, pending ${!!c.pending}` : 'the cache is gone'} (e11e1f61: the cache nulled, the warm ended)`, { before, removed: res && res.removed, cache: !!c, pending: !!(c && c.pending) });
  const r0 = loadedRows(uh);
  const [, ms] = turn(() => uh._loadEvents());
  const r1 = loadedRows(uh);
  ok(r1 === r0 && r1 < N, `② the next sync reader loads NOTHING in its own tick: ${r0} → ${r1} rows (${ms.toFixed(1)} ms; e11e1f61: it parsed the whole ledger, ${N} rows, there)`, { r0, r1, ms });
  let maxMs = 0, steps = 0;
  while (q.length) { const [, m] = turn(() => q.shift()()); steps++; if (m > maxMs) maxMs = m; }
  const w = await warm;
  ok(w && w.restarts === 1 && loadedRows(uh) === N && maxMs < 250, `② the restarted warm runs to its end stepped (${steps} more steps, the longest ${maxMs.toFixed(1)} ms < 250 — the boot law): ${loadedRows(uh)} rows, restarts ${w && w.restarts}`, w);
  let waited = false;
  const uh2 = newUh(dirOf('w2b')); fs.writeFileSync(shardOf(path.join(tmp, 'w2b')), lines.join('\n') + '\n');
  uh2.takeoverMaxBytes = 256 * KiB; const q2 = [];
  const warm2 = uh2.warmStepped({ chunkBytes: 64 * KiB, next: (fn) => q2.push(fn) });
  const p = (uh2.whenWarm ? uh2.whenWarm() : Promise.resolve()).then(() => { waited = true; });
  await quietAsync(() => uh2.dedupShard(shardOf(path.join(tmp, 'w2b')), { archiveDir: path.join(tmp, 'w2b', 'archive'), sliceMs: 40 }));
  await tick();
  const pendingAfterDedup = !waited;
  while (q2.length) q2.shift()();
  await warm2; await p;
  ok(pendingAfterDedup && waited && loadedRows(uh2) === N, '② whenWarm() stays pending through the restart and resolves when the restarted warm ends (the readers that wait for it read the whole, deduped ledger)');
});

const ASK = opt('/src/server/hub-act-ask.js');
const P = require(REPO + '/src/hub-act-policy.js');
const { UserTodoManager } = require(REPO + '/src/user-todos.js');
const { HostManager } = require(REPO + '/src/hosts.js');
function asker(name, { setting = () => undefined, userTodos = null, clock = null } = {}) {
  const d = dirOf(name);
  const hosts = new HostManager({ dataDir: d });
  hosts.setDialToken('mac1', 'x'.repeat(64));
  const hid = hosts.findByDeviceId('mac1').id;
  clock = clock || { t: 1_800_000_000_000 };
  const todos = userTodos || new UserTodoManager({ dataDir: d, expirySweepMs: 0, now: () => clock.t });
  const timers = [];
  const mk = () => ASK.create({ hosts, userTodos: todos, log: () => { }, now: () => clock.t, instanceKind: 'cluster', settingOf: (k) => (k === P.SETTING_KEY ? setting() : undefined), timers: { set: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; }, clear: (h) => { if (h) h.live = false; } } });
  const fire = () => { for (const h of timers.splice(0)) if (h.live) { h.live = false; h.fn(); } };
  const items = () => todos._state.items.filter((i) => i.action && i.action.type === 'hub-act-ask');
  return { d, hosts, hid, clock, todos, asker: mk(), mk, fire, items };
}
const act = (by, cmd = 'ls') => ({ op: 'run-cmd', cmd, args: [], by });
const HARVEST = act('system:usage-harvest', 'node'), SWEEP = act('system:writer-sweep', 'find'), MOUNTS = act('system:machine-mounts', 'mount');
/** One background act held its 60 s and refused: → its code. */
async function heldOut(w, payload) { const p = w.asker.check(w.hid, payload); await tick(); w.clock.t += 61000; w.fire(); const g = await p; return g && (g.code || (g.ok ? 'allowed' : g.ask)); }

console.log('③ A STANDING ITEM PER SUBJECT — machine × kind × who asks');
await leg('③', async () => {
  const w = asker('w3');
  const c0 = await heldOut(w, HARVEST);
  const u = w.items().find((i) => /^Usage of mac1 is not being recorded/.test(i.text));
  ok(c0 === 'ask_expired' && u && u.status === 'open', '③ the usage harvest\'s first act held and refused ⇒ its standing item («Usage of mac1 is not being recorded»)', w.items().map((i) => i.text));
  const pw = w.asker.check(w.hid, SWEEP); await tick();
  const n2 = w.items().length;
  w.clock.t += 61000; w.fire(); const g = await pw;
  const mine = w.items().filter((i) => i !== u && i.action.by === 'system:writer-sweep');
  ok(n2 === 2 && g && g.code === 'ask_expired' && mine.length === 1 && mine[0].status === 'open' && !/^Usage of/.test(mine[0].text) && w.items().find((i) => i.id === u.id).action.count === 1, `③ the writer sweep's act of the SAME kind on the SAME machine ⇒ its OWN standing item in its own words («${mine[0] ? mine[0].text : ''}»), held its own 60 s (${g && g.code}); the harvest's count untouched (e11e1f61: ask_standing at once, counted under the harvest's words)`, { n2, code: g && g.code, items: w.items().map((i) => [i.text, i.action.by, i.action.count]) });
  const c2 = await w.asker.check(w.hid, SWEEP);
  const counts = Object.fromEntries((w.asker.standingList ? w.asker.standingList() : []).map((x) => [x.by, x.count]));
  ok(c2 && c2.code === 'ask_standing' && w.items().length === 2 && counts['system:writer-sweep'] === 2 && counts['system:usage-harvest'] === 1, `③ the writer sweep's next act: refused at once on ITS item, counted there (${counts['system:writer-sweep']}; the harvest's ${counts['system:usage-harvest']})`, { c2, counts });
  await w.asker.answer(u.action.askId, { answer: 'once', by: 'user', answeredBy: 'human:0123456789ab' });
  const pm = w.asker.check(w.hid, MOUNTS); await tick();
  const mHeld = w.asker.list().some((k) => k.by === 'system:machine-mounts');
  w.clock.t += 61000; w.fire(); const gm = await pm;
  let ghNow = null; const ph = w.asker.check(w.hid, HARVEST).then((x) => { ghNow = ghNow || x; return x; }); await tick(); await tick();
  const gh = ghNow; w.clock.t += 61000; w.fire(); await ph; // (e11e1f61: the harvest's act is held again — its once was spent)
  ok(mHeld && gm && gm.ok !== true && gh && gh.ok === true, `③ Allow once on the harvest's item: the machine-mounts act is NOT let go by it (${gm && (gm.code || gm.ask)} — e11e1f61: allowed), the harvest's own next act goes (${gh && gh.ask})`, { gm, gh });
});

console.log('④ A STANDING ITEM CLOSES — allowed by any road, the setting, a week silent; a boot re-judges');
await leg('④', async () => {
  let setting = 'auto';
  const w = asker('w4', { setting: () => setting });
  await heldOut(w, HARVEST);
  const u = w.items()[0];
  setting = 'everyone';
  const g = await w.asker.check(w.hid, HARVEST);
  ok(g === null && w.todos.get(u.id).status === 'done' && w.todos.get(u.id).resolvedBy === 'allowed', `④ the instance-wide setting allows the act ⇒ it goes and its standing item CLOSES (${w.todos.get(u.id).status}/${w.todos.get(u.id).resolvedBy}; e11e1f61: still open)`, w.todos.get(u.id));
  setting = 'auto';
  await heldOut(w, SWEEP);
  const s = w.items().find((i) => i.action.by === 'system:writer-sweep' && i.status === 'open');
  setting = 'everyone';
  const n = typeof w.asker.reevaluate === 'function' ? w.asker.reevaluate() : 0;
  ok(s && n === 1 && w.todos.get(s.id).status === 'done' && w.todos.get(s.id).resolvedBy === 'always', `④ the setting alone (no act comes): the next re-judge closes it (${s && w.todos.get(s.id).resolvedBy})`, s && w.todos.get(s.id));
  setting = 'auto';
  await heldOut(w, MOUNTS);
  const m = w.items().find((i) => i.action.by === 'system:machine-mounts' && i.status === 'open');
  w.clock.t += 7 * 24 * 3600e3;
  if (typeof w.asker.reevaluate === 'function') w.asker.reevaluate();
  ok(m && w.todos.get(m.id).status === 'done' && w.todos.get(m.id).resolvedBy === 'no-longer-asked', `④ a subject silent for 7 days: its item closes «no longer asked» (${m && w.todos.get(m.id).resolvedBy})`, m && w.todos.get(m.id));
  const pNext = w.asker.check(w.hid, MOUNTS); await tick();
  const fresh = w.asker.list().some((k) => k.by === 'system:machine-mounts');
  w.clock.t += 61000; w.fire(); await pNext;
  ok(fresh, '④ …and its next act asks afresh (held its 60 s), never refused under the closed item');
  // a boot: an open standing item from before the restart is RE-JUDGED (the setting allows it now ⇒ closed), never restored
  const open = w.items().filter((i) => i.status === 'open');
  setting = 'everyone';
  const a2 = w.mk(); a2.reconcile();
  ok(open.length === 1 && w.todos.get(open[0].id).status === 'done' && !a2.standingList().length, `④ a restart with the setting now allowing it: reconcile closes the item (${w.todos.get(open[0].id).resolvedBy}) instead of restoring it (e11e1f61: restored, open)`, a2.standingList());
});

console.log('⑤ F4 SAYS WHAT HAPPENED — a dedup that fails, the retry, the shard back in shape');
await leg('⑤', async () => {
  const d = dirOf('w5'), sh = shardOf(d), rows = [];
  for (let k = 0; k < 3; k++) for (let i = 0; i < 400; i++) rows.push(row(i));
  fs.writeFileSync(sh, rows.join('\n') + '\n');
  const uh = newUh(d), todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  uh.shapeRatioMinBytes = 0; // the product's 64 MiB, scaled (a 3× file of 1200 rows)
  uh.remedyRetryMs = 300; // the product's 10 min, scaled
  const said = [];
  const wired = LSN.wire ? LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null }) : null;
  const on = uh.onShape; uh.onShape = (e) => { said.push(e); on && on(e); };
  const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
  fs.chmodSync(path.dirname(sh), 0o555); // the dedup's new copy cannot be written: EACCES
  let r1;
  try { [r1] = quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5))); await quietAsync(async () => { for (let i = 0; i < 400 && uh._dedupJobs && uh._dedupJobs.size; i++) await sleep(5); }); }
  finally { fs.chmodSync(path.dirname(sh), 0o755); }
  const n1 = notices(), last = said[said.length - 1] || {};
  const rem = last.remedy || {};
  ok(r1 && r1.paused && n1.length === 1 && rem.state === 'failed' && rem.code === 'EACCES' && rem.nextAt > Date.now() - 1000, `⑤ a dedup that FAILS: the machine stays paused and is said again with the outcome (${rem.state} ${rem.code}, the next try at a later pause)`, { said: said.map((e) => [e.kind, e.remedy && e.remedy.state]) });
  ok(n1[0] && /What happened: removing the repeated rows failed — EACCES/.test(n1[0].detail) && /tries again after \d\d:\d\d UTC/.test(n1[0].detail) && !/resumes by itself/.test(n1[0].detail) && !/resumes/.test(n1[0].detail.split('\n')[2] || ''), '⑤ the notice says what happened, when it is tried again, what to do — never «resumes by itself» (e11e1f61: it did, while paused for the life of the process)', n1[0] && n1[0].detail);
  const [r2] = quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  ok(r2.paused && !(uh._dedupJobs && uh._dedupJobs.size) && notices().length === 1, '⑤ a pause inside the backoff: no new run, the ONE notice (no second item)');
  await sleep(320);
  const [r3] = quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const job = uh._dedupJobs && [...uh._dedupJobs.values()][0];
  await quietAsync(async () => { if (job) await job.catch(() => { }); });
  const [r4] = quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const n4 = notices();
  ok(r3.paused && job && r4.appended === 5 && !uh.ingestPaused().length && n4.length === 1 && n4[0].status === 'done' && n4[0].resolvedBy === 'shape-ok', `⑤ past the backoff the next pause RETRIES (a run in flight: ${!!job}); in shape ⇒ recorded again (${r4.appended} appended) and the one notice closes (${n4[0] && n4[0].resolvedBy}) — e11e1f61: never retried, paused for good`, { r3: !!r3.paused, r4, n: n4.map((i) => [i.status, i.resolvedBy]) });
  ok(wired && typeof wired.reconcile === 'function', '⑤ the wiring answers {open, reconcile} (the boot door ⑥ proves)');
});

console.log('⑥ F4 ONE NOTICE PER MACHINE, RECONCILED AT BOOT');
await leg('⑥', async () => {
  const d = dirOf('w6'), sh = shardOf(d);
  fs.writeFileSync(sh, [row(0), row(1), row(2)].join('\n') + '\n');
  const small = size(sh);
  fs.truncateSync(sh, 3 * GiB); // SPARSE
  const todos = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
  const notices = () => todos._state.items.filter((i) => i.sessionKey === 'usage-ledger');
  const life = () => {
    const uh = newUh(d);
    uh.dedupShard = (f) => { const p = new Promise(() => { }); if (uh._dedupJobs) uh._dedupJobs.set(f, p); return p; }; // its 3 GiB pass is not this leg's
    const wired = LSN.wire({ usageHistory: uh, userTodos: todos, log: () => { }, reconcileAfterMs: null });
    return { uh, wired };
  };
  const L1 = life();
  quiet(() => L1.uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  const first = notices();
  fs.truncateSync(sh, 3.5 * GiB); // the file grew while paused (another writer of the month)
  const L2 = life(); // a restart
  const [n2] = quiet(() => (L2.wired && L2.wired.reconcile ? L2.wired.reconcile() : -1));
  const after = notices();
  ok(first.length === 1 && n2 === 0 && after.length === 1 && after[0].id === first[0].id && after[0].status === 'open' && /3\.50 GiB/.test(after[0].detail) && L2.uh.ingestPaused().some((p) => p.host === 'host-m'), `⑥ a restart, the shard still out of shape: the SAME notice stays (1 item), its size re-worded in place (3.50 GiB), the machine paused again from boot (e11e1f61: no reconcile; a new size string is a second item)`, after.map((i) => [i.status, i.text, i.detail.split('\n')[0]]));
  fs.truncateSync(sh, small);
  const L3 = life();
  const [n3] = quiet(() => (L3.wired && L3.wired.reconcile ? L3.wired.reconcile() : -1));
  const end = notices();
  ok(n3 === 1 && end.length === 1 && end[0].status === 'done' && end[0].resolvedBy === 'shape-ok' && !L3.uh.ingestPaused().length, `⑥ a restart with the shard back in shape: the notice closes (${end[0] && end[0].resolvedBy}), nothing paused`, end.map((i) => [i.status, i.resolvedBy]));
});

console.log('⑦ F4 THE SHAPE JUDGED WHOLE — head, middle, tail; a 448 MiB sparse shard, first 64 MiB unique, the rest 3×');
await leg('⑦', async () => {
  const d = dirOf('w7'), sh = shardOf(d);
  // each row followed by a 1 MiB hole: 64 unique rows over the first 64 MiB, then a 128-row window three times
  const order = [];
  for (let i = 0; i < 64; i++) order.push(i);
  for (let k = 0; k < 3; k++) for (let i = 0; i < 128; i++) order.push(1000 + i);
  const fd = fs.openSync(sh, 'w'); let at = 0;
  try { for (const i of order) { const b = Buffer.from(row(i) + '\n'); fs.writeSync(fd, b, 0, b.length, at); at += b.length + MiB; } } finally { fs.closeSync(fd); }
  fs.truncateSync(sh, at - MiB); // the file ends with its last row's newline
  const uniqueHead = order.slice(0, 64).length, rows = order.length, distinct = new Set(order).size;
  const s = LD.shapeOf ? LD.shapeOf(sh) : {};
  const wins = s.windows || [];
  ok(wins.length === 16 && wins[0] === 0 && wins[15] === s.size - MiB && wins.some((x) => Math.abs(x - s.size / 2) < s.size / 15) && wins.every((x, i) => !i || x > wins[i - 1]), `⑦ the sample spans the head, the middle and the tail: 16 windows at ${wins.slice(0, 3).map((x) => (x / MiB).toFixed(0)).join(', ')} … ${wins.slice(-2).map((x) => (x / MiB).toFixed(0)).join(', ')} MiB of ${(s.size / MiB).toFixed(0)} — and it reads the shard ~${s.ratio == null ? '—' : s.ratio.toFixed(2)}× (a repeat far from its first copy is never in two windows)`, { wins, ratio: s.ratio });
  const uh = newUh(d);
  const [r1] = quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  await quietAsync(() => uh.ingestIndexSettled());
  const s0 = size(sh);
  const [r2] = quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  ok(r1.deferred && r2.paused && r2.paused.why === 'ratio' && r2.appended === 0 && size(sh) === s0, `⑦ a ${(s0 / MiB).toFixed(0)} MiB shard, ${uniqueHead} unique rows over its first 64 MiB then one window 3×: its index read it whole ⇒ PAUSED, why ratio ${r2.paused && r2.paused.ratio}× (${rows} rows / ${distinct} distinct), nothing appended (e11e1f61: in shape — appended ${r2.appended})`, { r1, r2 });
  const job = uh._dedupJobs && [...uh._dedupJobs.values()][0];
  const [res] = await quietAsync(async () => (job ? job : null));
  const [r3] = quiet(() => uh.ingestRemoteEvents('host-m', 'M', batchOf(9000, 5)));
  ok(res && res.renamed && res.removed === rows - distinct && r3.appended === 5 && !uh.ingestPaused().length, `⑦ the remedy dedups it (${res && res.removed} repeated rows removed — the holes stepped over, never copied: ${(size(sh) / KiB).toFixed(0)} KiB left) and the machine is recorded again (${r3.appended} appended)`, { res, r3 });
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log('  · ' + legMs.join(' · '));
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
