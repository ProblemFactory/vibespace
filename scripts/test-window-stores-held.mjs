#!/usr/bin/env node
// test-window-stores-held — B-f276 slice window-targets (lane lg-recovery, 主开发 r4720): data/window-leases.json (which agent holds
// which window) and data/window-reach.json (each window's share mode) UNDER THE STORE-READ LAW, through the REAL
// src/server/window-targets-engine.js over a scratch data folder of this suite's own, a stand-in desktop-app keeper (made-up records,
// nothing launched) and the REAL grants store over the same folder. A restart is a new engine over the same folder. An unreadable file
// is a PLACED refusal of the read call (fs.readFileSync answers EIO for that one path, its next read only) — never a mount, never a mode
// change; torn bytes are bytes written whole that do not parse; the read again is the family's own (src/store-read-hold.js
// readAgainOf), never a clock. Each RED is a copy of the engine with ONE anchored edit: the release's read (a failure read as «nothing
// stored»), the reconcile blind to a hold, the stream's gate that throws. No vendor call, no process, nothing else.
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const ENGINE_REL = 'src/server/window-targets-engine.js';
const ENGINE = require(path.join(REPO, ENGINE_REL));
const HOLD = require(path.join(REPO, 'src/store-read-hold.js'));
const SRC = fs.readFileSync(path.join(REPO, ENGINE_REL), 'utf8');
const M = mutantCopies('window-stores-held', REPO);
const LEASES = 'window-leases.json', REACH = 'window-reach.json';
const EIO = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
/** the PLACED refusal: fs.readFileSync of `file` answers EIO for its next `n` reads; every synchronous read of the two stores is counted */
const placeReads = (dir, file, n = 1) => {
  const f = path.resolve(dir, file), stores = [path.resolve(dir, LEASES), path.resolve(dir, REACH)], realS = fs.readFileSync, seen = { refused: 0, sync: 0 };
  fs.readFileSync = function (p, ...a) {
    if (typeof p === 'string' && stores.includes(path.resolve(p))) seen.sync++;
    if (typeof p === 'string' && path.resolve(p) === f && seen.refused < n) { seen.refused++; throw EIO(); }
    return realS.call(this, p, ...a);
  };
  return { seen, restore: () => { fs.readFileSync = realS; } };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** a wait ON THE FACT the leg judges, with a generous bound whose expiry fails by its NAMED harness line */
async function waitFor(fact, ms, name) {
  const t0 = Date.now();
  while (!fact()) { if (Date.now() - t0 > ms) { ok(false, `HARNESS: «${name}» did not come within ${ms} ms`); return false; } await sleep(10); }
  return true;
}
let dirN = 0;
const mk = () => { const d = path.join(scratch('window-stores-held'), 'd' + (++dirN)); fs.mkdirSync(d, { recursive: true }); return d; };
const READ0 = fs.readFileSync;   // the suite's OWN reads (a file's bytes, judged) — never counted as the engine's, never refused
const bytesOf = (dir, f) => { try { return READ0.call(fs, path.join(dir, f), 'utf8'); } catch { return null; } };
const S1 = 'aaaaaaaa-1111-4000-8000-000000000071';
const mkRec = (id, extra = {}) => ({ id, label: `App ${id}`, exec: 'x', state: 'ready', display: ':77', pids: { app: 4242, x: null, server: null, wm: null }, starts: {}, backend: 'vnc-display', startedAt: 1, ...extra });
/** one LIFE: an engine over `dir` (the module `Mod` — the real one, or a RED copy), the session `w-A`, three windows */
function life(Mod, dir) {
  const sessions = new Map([['w-A', { agentToken: 'vsst_A', claudeSessionId: S1, backendSessionId: S1, backend: 'claude', name: 'agent A', mode: 'chat' }]]);
  const records = new Map([['da-one', mkRec('da-one')], ['da-two', mkRec('da-two')], ['da-three', mkRec('da-three')]]);
  const sent = [], logs = [], launched = [], stopped = [];
  const keeper = { listApps: () => [...records.values()], get: (id) => records.get(id) || null, sessionPids: (rec) => Object.values(rec.pids).filter(Boolean), x11EnvFor: () => null,
    launch: async () => { launched.push(1); const rec = mkRec('da-opened'); records.set(rec.id, rec); return rec; }, stop: async (id) => { stopped.push(id); return { ok: true }; },
    registry: () => [{ id: 'gedit', label: 'gedit', exec: 'gedit', args: [], available: true, reason: null }] };
  const engine = Mod.create({ keeper, dataDir: dir, env: () => ({}), activeSessions: sessions, bins: { xdotool: null, gdbus: null }, procExe: () => null,
    log: { warn: (l) => logs.push(String(l)), log() {} }, broadcast: (m) => sent.push(m) });
  return { engine, sessions, records, sent, logs, launched, stopped, facts: engine.factsForToken('vsst_A') };
}
/** a call's answer: its value, or its refusal's { code, status, message } */
const tryOf = (fn) => { try { return { v: fn() }; } catch (e) { return { code: e && e.code, status: e && e.status, message: String((e && e.message) || e) }; } };
const tryAsync = async (fn) => { try { return { v: await fn() }; } catch (e) { return { code: e && e.code, status: e && e.status, message: String((e && e.message) || e) }; } };
const named = (r, code) => !!r && r.code === code && r.status === 503 && /could not be read \(EIO\)/.test(r.message) && /Nothing was lost or changed/.test(r.message);
/** life one (readable, the files absent — a FIRST RUN): two windows shared with the session, da-one in «pixels», da-one held by it */
function firstLife(dir) {
  const w = life(ENGINE, dir);
  const b = w.engine.boot();
  w.engine.grantReach('da-one', { kind: 'session', id: 'w-A', name: 'agent A' });
  w.engine.grantReach('da-two', { kind: 'session', id: 'w-A', name: 'agent A' });
  w.engine.setShareMode('da-one', 'pixels');
  const a = w.engine.attach('da-one', w.facts);
  w.engine.shutdown();
  return { boot: b, attached: a && a.handle, leases: bytesOf(dir, LEASES), reach: bytesOf(dir, REACH) };
}
/** a held life: the engine starts with `file` refused once; its boot is the first read */
function heldLife(Mod, dir, file) {
  const pr = placeReads(dir, file);
  const w = life(Mod, dir);
  const boot = w.engine.boot();
  return { ...w, boot, pr };
}
const heldRows = (file) => HOLD.holds().filter((r) => r.file === file && r.held);
const grantRows = (w, h) => { try { return require(path.join(REPO, 'src/server/grants-store.js')).forDir(w.dir).rowsFor('window', h).length; } catch { return -1; } };

// THE RED COPIES — each ONE anchored edit of the engine's text
const LEASE_READ = "      const a = SR.storeAnswer(read, { valid: isObj }); if (leaseHold.start(a) === 'data') applyLeases(a.value);";
const REACH_READ = "      const a = SR.storeAnswer(read, { valid: isObj }); if (reachHold.start(a) === 'data') applyReach(a.value);";
const RELEASE_LEASES = () => M.load(ENGINE_REL, anchored(SRC, LEASE_READ, "      try { if (read.error) throw read.error; applyLeases(JSON.parse(read.text)); } catch (e) { if (e && e.code !== 'ENOENT') log.warn?.('[window] window-leases.json unreadable — starting with no leases'); }", 'the-release-lease-read'), 'release-leases');
const RELEASE_REACH = () => M.load(ENGINE_REL, anchored(SRC, REACH_READ, "      try { if (read.error) throw read.error; applyReach(JSON.parse(read.text)); } catch (e) { if (e && e.code !== 'ENOENT') log.warn?.('[window] window-reach.json unreadable — every window starts in auto mode'); }", 'the-release-reach-read'), 'release-reach');
const PRUNE_BLIND = () => M.load(ENGINE_REL, anchored(SRC, '    for (const h of reachUnread ? [] : shareHandles()) {', '    for (const h of shareHandles()) {', 'prune-blind-to-the-hold'), 'prune-blind');   // stale-pins: kept — the red's own text (the release's loop)
const ENDS_BLIND = () => M.load(ENGINE_REL, anchored(SRC, '    if (leaseHold.held()) return [];', '', 'ends-blind-to-the-hold'), 'ends-blind');
const GATE_THROWS = () => M.load(ENGINE_REL, anchored(SRC, '    if (leasesHeld()) return { relay: true, code: null, why: null };', '    load();', 'gate-throws-while-held'), 'gate-throws');

console.log('§0 an ABSENT file is a first run: no hold, the verbs act, both files written');
const base = mk();
const one = firstLife(base);
ok(!!(one.boot && !one.boot.held && one.attached === 'da-one' && !!one.leases && JSON.parse(one.leases).leases['da-one'] && JSON.parse(one.reach).windows['da-one'].mode === 'pixels' && heldRows(LEASES).length === 0 && heldRows(REACH).length === 0),
  'FIRST RUN: no file ⇒ no hold; da-one held by the session (window-leases.json) and in «pixels» (window-reach.json)', { boot: one.boot, leases: one.leases && one.leases.slice(0, 120) });

console.log('§1 window-leases.json UNREADABLE: HELD — readers and writers refused by name, nothing written over it, nothing dropped or ended; the stream relays; it heals at the next good read');
{
  const dir = mk(); const f = firstLife(dir);
  const w = heldLife(ENGINE, dir, LEASES); w.dir = dir;
  w.records.set('da-ab', mkRec('da-ab', { origin: 'agent-browser', by: { sessionId: 'w-gone' } }));   // an agent's desktop browser whose conversation ended
  ok(w.pr.seen.refused === 1 && Array.isArray(w.boot && w.boot.held) && w.boot.held.join() === LEASES && w.boot.dropped === 0 && heldRows(LEASES).length === 1,
    'HELD at the boot: said in its answer (held: window-leases.json), nothing dropped; the family lists the hold', w.boot);
  const syncAtBoot = w.pr.seen.sync;
  const readers = { leases: tryOf(() => w.engine.leases()), leaseOf: tryOf(() => w.engine.leaseOf('da-one')), desktop: tryOf(() => w.engine.desktopLeases()), list: await tryAsync(() => w.engine.list(w.facts)), summary: tryOf(() => w.engine.inputSummaryFor('w-A')) };
  ok(Object.values(readers).every((r) => named(r, 'window_leases_unread')), 'READERS: the lease list, one lease, the desktop leases, `list` and the session summary answer window_leases_unread BY NAME (503, the hold\'s words)', readers);
  const writers = { attach: tryOf(() => w.engine.attach('da-two', w.facts)), detach: tryOf(() => w.engine.detach('da-one', w.facts)), takeover: tryOf(() => w.engine.takeover({ handle: 'da-one', viewerId: 'v1' })),
    endHold: tryOf(() => w.engine.endHold('da-one', 'the person ended it')), share: tryOf(() => w.engine.setShareMode('da-two', 'tree')), open: await tryAsync(() => w.engine.open({ appId: 'gedit' }, w.facts)) };
  ok(Object.values(writers).every((r) => named(r, 'window_leases_unread')) && w.launched.length === 0, 'WRITERS: attach, detach, a person\'s takeover, the person\'s end of a hold, a share change and an open are refused BY NAME before any act (nothing launched)', { writers, launched: w.launched.length });
  const rec = w.engine.reconcile({ graceMs: 0 }); const ds = w.engine.dropSession('w-A'); w.engine.tick();
  ok(rec.leasesHeld === true && rec.dropped.length === 0 && rec.ended.length === 0 && ds === 0 && w.stopped.length === 0, 'BACKGROUND: the reconcile (and the tick) drop, stamp and end nothing by the held file — the agent browser whose conversation ended is not stopped; the kill path drops nothing', { rec, ds, stopped: w.stopped });
  const gate = { policy: tryOf(() => w.engine.inputPolicy('da-one', 'v1')), input: tryOf(() => w.engine.leaseInput('da-one')), hint: tryOf(() => w.engine.agentBrowserFor('da-one', 'bk')) };
  ok(!!(gate.policy.v && gate.policy.v.relay === true && gate.input.v === null && gate.hint.v === null), 'THE STREAM\'S GATE: inputPolicy relays, leaseInput and the browser verbs\' hint answer «no lease» — never a throw (no agent verb runs while held, none injects)', gate);
  ok(w.sent.filter((m) => m.type === 'window-leases-updated').length === 0, 'NO LIST broadcast while held (an empty list reads as every lease lost)', w.sent.map((m) => m.type));
  ok(bytesOf(dir, LEASES) === f.leases && bytesOf(dir, REACH) === f.reach, 'NOT WRITTEN OVER: window-leases.json byte for byte after every writer was asked (and the share modes untouched)');
  ok(w.pr.seen.sync === syncAtBoot, `NOTHING SYNCHRONOUS ADDED: no store read again on the loop while held (${w.pr.seen.sync - syncAtBoot} after the boot's one)`);
  ok(w.logs.filter((l) => /window-leases\.json could not be read \(EIO\)/.test(l)).length === 1, 'the journal says the hold ONCE', w.logs);
  const syncBeforeHeal = w.pr.seen.sync;
  const lifted = await HOLD.readAgainOf(LEASES);
  const after = { lease: tryOf(() => w.engine.leaseOf('da-one')), sent: w.sent.filter((m) => m.type === 'window-leases-updated') };
  ok(!!(lifted === true && heldRows(LEASES).length === 0 && after.lease.v && after.lease.v.sessionId === 'w-A' && after.sent.length === 1 && after.sent[0].leases.some((l) => l.handle === 'da-one') && w.pr.seen.sync === syncBeforeHeal),
    'HEALED at the next good read (off the loop — no synchronous read): da-one\'s lease back as it was, ONE list broadcast with it', { lifted, after, sync: w.pr.seen.sync - syncBeforeHeal });
  const att = tryOf(() => w.engine.attach('da-two', w.facts));
  const disk = JSON.parse(bytesOf(dir, LEASES) || '{}').leases || {};
  ok(!!(att.v && att.v.handle === 'da-two' && disk['da-one'] && disk['da-two']), 'after the heal a verb acts and the file keeps what it held (da-one AND da-two)', Object.keys(disk));
  w.pr.restore(); w.engine.shutdown();
  // RED: the release's read — the failure read as «no leases»: no named answer, and the next attach writes the empty memory over the file
  const r = heldLife(RELEASE_LEASES(), (() => { const d2 = mk(); firstLife(d2); return d2; })(), LEASES); r.pr.restore();
  const rl = tryOf(() => r.engine.leases()); const ra = tryOf(() => r.engine.attach('da-two', r.facts));
  const rdisk = JSON.parse(bytesOf(r.engine.leaseFile.replace(/[^/]+$/, ''), LEASES) || '{}').leases || {};
  ok(!!(Array.isArray(rl.v) && rl.v.length === 0 && ra.v && !rdisk['da-one'] && !!rdisk['da-two']), 'RED: the release\'s read — the lease list answers EMPTY (no name), and an attach writes over the file: da-one\'s lease is gone', { list: rl, disk: Object.keys(rdisk) });
  r.engine.shutdown();
  // RED: the lease half blind to the hold — the agent browser stopped on an empty memory
  const e = heldLife(ENDS_BLIND(), (() => { const d3 = mk(); firstLife(d3); return d3; })(), LEASES); e.pr.restore();
  e.records.set('da-ab', mkRec('da-ab', { origin: 'agent-browser', by: { sessionId: 'w-gone' } }));
  e.engine.reconcile({ graceMs: 0 }); await sleep(0);
  ok(e.stopped.includes('da-ab'), 'RED: the reconcile blind to the hold — the agent browser is stopped on an empty memory (its pending end is the held file\'s)', e.stopped);
  e.engine.shutdown();
  // RED: the gate that throws while held (the bridge catches it and warns at EVERY input message)
  const g = heldLife(GATE_THROWS(), (() => { const d4 = mk(); firstLife(d4); return d4; })(), LEASES); g.pr.restore();
  const gp = tryOf(() => g.engine.inputPolicy('da-one', 'v1'));
  ok(gp.code === 'window_leases_unread', 'RED: a gate that asks the held store throws at every input message', gp);
  g.engine.shutdown();
}

console.log('§2 window-leases.json TORN: held while its bytes are kept aside (once, byte for byte), then it starts empty and the verbs act');
{
  const dir = mk(); const f = firstLife(dir);
  const TORN = f.leases.slice(0, 40);
  fs.writeFileSync(path.join(dir, LEASES), TORN);
  const w = life(ENGINE, dir);
  const boot = w.engine.boot();
  ok(Array.isArray(boot.held) && boot.held.join() === LEASES, 'TORN: held at the boot', boot);
  await waitFor(() => !tryOf(() => w.engine.leases()).code, 5000, 'the torn leases\' lift');
  const copies = fs.readdirSync(dir).filter((n) => n.startsWith(LEASES + '.corrupt-'));
  ok(copies.length === 1 && fs.readFileSync(path.join(dir, copies[0]), 'utf8') === TORN && w.engine.leases().length === 0, 'TORN: kept aside ONCE, byte for byte; it starts empty', copies);
  const att = tryOf(() => w.engine.attach('da-two', w.facts));
  ok(!!(att.v && att.v.handle === 'da-two' && JSON.parse(bytesOf(dir, LEASES)).leases['da-two']), 'after the lift the verbs act (the torn bytes are their copy)');
  w.engine.shutdown();
}

console.log('§3 window-reach.json UNREADABLE: HELD — no agent reaches a window, no share changes (refused by name), nothing written over it, nothing pruned; giving a window up still works; it heals');
{
  const dir = mk(); const f = firstLife(dir);
  const w = heldLife(ENGINE, dir, REACH); w.dir = dir;
  ok(w.pr.seen.refused === 1 && Array.isArray(w.boot && w.boot.held) && w.boot.held.join() === REACH && heldRows(REACH).length === 1, 'HELD at the boot: said in its answer (held: window-reach.json)', w.boot);
  const syncAtBoot = w.pr.seen.sync;
  const readers = { reachOf: tryOf(() => w.engine.reachOf('da-one')), views: tryOf(() => w.engine.reachViews()), list: await tryAsync(() => w.engine.list(w.facts)), mayUse: tryOf(() => w.engine.mayUseFor({ conversationKeys: [`claude:${S1}`] })) };
  ok(Object.values(readers).every((r) => named(r, 'window_reach_unread')), 'READERS: a window\'s share, the share list, `list` and «what it may use» answer window_reach_unread BY NAME (503, the hold\'s words)', readers);
  const grantsBefore = grantRows(w, 'da-three');
  const writers = { attach: tryOf(() => w.engine.attach('da-two', w.facts)), mode: tryOf(() => w.engine.setShareMode('da-one', 'tree')), grant: tryOf(() => w.engine.grantReach('da-three', { kind: 'session', id: 'w-A', name: 'agent A' })),
    revoke: tryOf(() => w.engine.revokeReach('da-two', { kind: 'session', id: 'w-A', name: 'agent A' })), open: await tryAsync(() => w.engine.open({ appId: 'gedit' }, w.facts)) };
  ok(Object.values(writers).every((r) => named(r, 'window_reach_unread')) && w.launched.length === 0 && grantRows(w, 'da-three') === grantsBefore && grantsBefore === 0, 'WRITERS: an attach, a mode, a grant, a revoke and an open are refused BY NAME before any act (no grants row written, nothing launched)', { writers, launched: w.launched.length });
  const det = tryOf(() => w.engine.detach('da-one', w.facts));
  ok(!!(det.v && det.v.detached === true && !(JSON.parse(bytesOf(dir, LEASES)).leases || {})['da-one']), 'GIVING A WINDOW UP never waits on the share modes: the detach acts (the lease store reads)', det);
  w.records.delete('da-two');   // da-two's window is gone: its share would be pruned
  const rec = w.engine.reconcile({ graceMs: 0 });
  ok(rec.reachHeld === true && rec.pruned === 0 && grantRows(w, 'da-two') === 1, 'BACKGROUND: the reconcile prunes nothing by the held file (the gone window\'s share row kept)', { rec, rows: grantRows(w, 'da-two') });
  ok(w.sent.filter((m) => m.type === 'window-reach-updated').length === 0, 'NO LIST broadcast while held', w.sent.map((m) => m.type));
  ok(bytesOf(dir, REACH) === f.reach, 'NOT WRITTEN OVER: window-reach.json byte for byte after every writer was asked');
  ok(w.pr.seen.sync === syncAtBoot, `NOTHING SYNCHRONOUS ADDED: no store read again on the loop while held (${w.pr.seen.sync - syncAtBoot} after the boot's)`);
  const lifted = await HOLD.readAgainOf(REACH);
  const v = tryOf(() => w.engine.reachOf('da-one'));
  ok(!!(lifted === true && v.v && v.v.mode === 'pixels' && w.sent.filter((m) => m.type === 'window-reach-updated').length === 1), 'HEALED at the next good read: da-one\'s «pixels» back, ONE share list broadcast', { lifted, v: v.v && v.v.mode });
  w.pr.restore(); w.engine.shutdown();
  // RED: the release's read — the failure read as «every window in auto»: a mode change writes the file over (da-one's «pixels» gone)
  const r = heldLife(RELEASE_REACH(), (() => { const d2 = mk(); firstLife(d2); return d2; })(), REACH); r.pr.restore();
  const rv = tryOf(() => r.engine.reachOf('da-one')); const rm = tryOf(() => r.engine.setShareMode('da-two', 'tree'));
  const rdisk = JSON.parse(bytesOf(path.dirname(r.engine.reachFile), REACH) || '{}').windows || {};
  ok(!!(rv.v && rv.v.mode === 'auto' && rm.v && !rdisk['da-one'] && rdisk['da-two']), 'RED: the release\'s read — da-one answers «auto» (no name), and a mode change writes over the file: its «pixels» is gone', { reachOf: rv.v && rv.v.mode, disk: rdisk });
  r.engine.shutdown();
  // RED: the prune blind to the hold — a gone window's share row removed on an empty memory
  const p = heldLife(PRUNE_BLIND(), (() => { const d3 = mk(); firstLife(d3); return d3; })(), REACH); p.pr.restore(); p.dir = path.dirname(p.engine.reachFile);
  p.records.delete('da-two');
  const pr = p.engine.reconcile({ graceMs: 0 });
  ok(pr.pruned >= 1 && grantRows(p, 'da-two') === 0, 'RED: the reconcile blind to the hold — the gone window\'s share row removed', { pr, rows: grantRows(p, 'da-two') });
  p.engine.shutdown();
}

console.log('§4 window-reach.json TORN: kept aside once, then every window in auto; the share acts');
{
  const dir = mk(); const f = firstLife(dir);
  const TORN = f.reach.slice(0, 30);
  fs.writeFileSync(path.join(dir, REACH), TORN);
  const w = life(ENGINE, dir);
  const boot = w.engine.boot();
  ok(Array.isArray(boot.held) && boot.held.join() === REACH, 'TORN: held at the boot', boot);
  await waitFor(() => !tryOf(() => w.engine.reachViews()).code, 5000, 'the torn share modes\' lift');
  const copies = fs.readdirSync(dir).filter((n) => n.startsWith(REACH + '.corrupt-'));
  ok(copies.length === 1 && fs.readFileSync(path.join(dir, copies[0]), 'utf8') === TORN && w.engine.reachOf('da-one').mode === 'auto', 'TORN: kept aside ONCE, byte for byte; da-one starts in auto', copies);
  const m = tryOf(() => w.engine.setShareMode('da-one', 'tree'));
  ok(!!(m.v && JSON.parse(bytesOf(dir, REACH)).windows['da-one'].mode === 'tree'), 'after the lift a share change acts');
  w.engine.shutdown();
}

console.log('§5 the routes answer both codes 503 by name; the relaunch never reads a held store as «no agent holds it»');
{
  const wr = fs.readFileSync(path.join(REPO, 'src/routes/window-targets.js'), 'utf8'), da = fs.readFileSync(path.join(REPO, 'src/routes/desktop-apps.js'), 'utf8');
  ok(wr.includes('window_leases_unread: 503, window_reach_unread: 503,'), 'PRODUCTION: the window routes\' STATUS maps both codes to 503');
  ok(da.includes("code === 'window_leases_unread' || code === 'window_reach_unread' ? 503") && da.includes("catch (e) { if (e && e.code === 'window_leases_unread') return fail(res, e); lease = null; }"), 'PRODUCTION: the desktop-app routes answer both 503; the relaunch refuses by name while the leases are held');
  ok(ENGINE.LEASE_FILE === LEASES, 'PRODUCTION: the engine\'s lease file is the census\'s name');
}

report();
