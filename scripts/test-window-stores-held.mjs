#!/usr/bin/env node
// test-window-stores-held — B-f276 slice window-targets (lane lg-recovery, 主开发 r4720): data/window-leases.json (which agent holds
// which window) and data/window-reach.json (each window's share mode) UNDER THE STORE-READ LAW, through the REAL
// src/server/window-targets-engine.js over a scratch data folder of this suite's own, a stand-in desktop-app keeper (made-up records,
// nothing launched) and the REAL grants store over the same folder. A restart is a new engine over the same folder. An unreadable file
// is a PLACED refusal of the read call (fs.readFileSync answers EIO for that one path, its next read only) — never a mount, never a mode
// change; torn bytes are bytes written whole that do not parse; the read again is the family's own (src/store-read-hold.js
// readAgainOf), never a clock. Each RED is a copy of the engine with ONE anchored edit: the release's read (a failure read as «nothing
// stored»), the reconcile blind to a hold, the stream's gate that throws; and (the cure round, 主开发 r4783 + the adversarial read) each
// INNER guard with an outer one gone (the save, the broadcast, the kill path), «what it may use» named, and the routes DRIVEN over
// loopback (the relaunch, Resume here, a launch with a share). No vendor call, no process, nothing else.
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
const MU = require(path.join(REPO, 'src/may-use-model.js'));
const ROUTES_REL = 'src/routes/desktop-apps.js';
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
const S1 = 'aaaaaaaa-1111-4000-8000-000000000071', S2 = 'bbbbbbbb-2222-4000-8000-000000000072';
const mkRec = (id, extra = {}) => ({ id, label: `App ${id}`, exec: 'x', state: 'ready', display: ':77', pids: { app: 4242, x: null, server: null, wm: null }, starts: {}, backend: 'vnc-display', startedAt: 1, ...extra });
/** one LIFE: an engine over `dir` (the module `Mod` — the real one, or a RED copy), the session `w-A`, three windows */
function life(Mod, dir) {
  const sessions = new Map([['w-A', { agentToken: 'vsst_A', claudeSessionId: S1, backendSessionId: S1, backend: 'claude', name: 'agent A', mode: 'chat' }],
    ['w-B', { agentToken: 'vsst_B', claudeSessionId: S2, backendSessionId: S2, backend: 'claude', name: 'agent B', mode: 'chat' }]]);
  const records = new Map([['da-one', mkRec('da-one')], ['da-two', mkRec('da-two')], ['da-three', mkRec('da-three')]]);
  const sent = [], logs = [], launched = [], stopped = [], relaunched = [], elected = [];
  const keeper = { listApps: () => [...records.values()], get: (id) => records.get(id) || null, sessionPids: (rec) => Object.values(rec.pids).filter(Boolean), x11EnvFor: () => null,
    launch: async () => { launched.push(1); const rec = mkRec('da-opened'); records.set(rec.id, rec); return rec; }, stop: async (id) => { stopped.push(id); return { ok: true }; },
    relaunch: async (id) => { relaunched.push(id); return { id: id + '-r' }; }, takeoverViewer: (id, viewerId) => { elected.push(id); return { ok: true, viewers: [viewerId] }; },
    registry: () => [{ id: 'gedit', label: 'gedit', exec: 'gedit', args: [], available: true, reason: null }] };
  const engine = Mod.create({ keeper, dataDir: dir, env: () => ({}), activeSessions: sessions, bins: { xdotool: null, gdbus: null }, procExe: () => null,
    log: { warn: (l) => logs.push(String(l)), log() {} }, broadcast: (m) => sent.push(m) });
  return { engine, keeper, sessions, records, sent, logs, launched, stopped, relaunched, elected, facts: engine.factsForToken('vsst_A') };
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
// (the RELEASE copies: the placed refusal is undone right after their boot — the release reads ONCE at its start, so the attach that
// follows meets the memory the failed read left, never a second read)
const LEASE_READ = "      const a = SR.storeAnswer(read, { valid: leasesShape }); if (leaseHold.start(a) === 'data') applyLeases(a.value);";
const REACH_READ = "      const a = SR.storeAnswer(read, { valid: reachShape }); if (reachHold.start(a) === 'data') applyReach(a.value);";
const RELEASE_LEASES = () => M.load(ENGINE_REL, anchored(SRC, LEASE_READ, "      try { if (read.error) throw read.error; applyLeases(JSON.parse(read.text)); } catch (e) { if (e && e.code !== 'ENOENT') log.warn?.('[window] window-leases.json unreadable — starting with no leases'); }", 'the-release-lease-read'), 'release-leases');
const RELEASE_REACH = () => M.load(ENGINE_REL, anchored(SRC, REACH_READ, "      try { if (read.error) throw read.error; applyReach(JSON.parse(read.text)); } catch (e) { if (e && e.code !== 'ENOENT') log.warn?.('[window] window-reach.json unreadable — every window starts in auto mode'); }", 'the-release-reach-read'), 'release-reach');
const PRUNE_BLIND = () => M.load(ENGINE_REL, anchored(SRC, '    for (const h of reachUnread ? [] : shareHandles()) {', '    for (const h of shareHandles()) {', 'prune-blind-to-the-hold'), 'prune-blind');   // stale-pins: kept — the red's own text (the release's loop)
const ENDS_BLIND = () => M.load(ENGINE_REL, anchored(SRC, '    if (leaseHold.held()) return [];', '', 'ends-blind-to-the-hold'), 'ends-blind');
const ENDS = ['    if (leaseHold.held()) return [];', ''], KILL = ['  function dropSession(sessionId) { if (leasesHeld()) return 0; let n = 0;', '  function dropSession(sessionId) { let n = 0;'];
const SAVE = ["    if (!leaseHold.writable('a write of the window leases')) return;", ''], PUB = ['  function publish() { if (!broadcast || leaseHold.held()) return;', '  function publish() { if (!broadcast) return;'];   // stale-pins: kept — the red's own text (the release's form)
const SAVE_R = ["    if (!reachHold.writable('a write of the windows\\' share modes')) return;", ''], PRUNE = ['    for (const h of reachUnread ? [] : shareHandles()) {', '    for (const h of shareHandles()) {'];   // stale-pins: kept — the red's own text (the release's loop)
const copyOf = (tag, ...edits) => M.load(ENGINE_REL, edits.reduce((t, [a, b], i) => anchored(t, a, b, `${tag}-${i}`), SRC), tag);
const SAVE_BLIND = () => copyOf('save-blind', ENDS, SAVE), PUBLISH_BLIND = () => copyOf('publish-blind', ENDS, PUB), KILL_BLIND = () => copyOf('kill-blind', ENDS, KILL);
const SAVE_R_BLIND = () => copyOf('save-reach-blind', PRUNE, SAVE_R);
const MAYUSE_THROWS = () => M.load(ENGINE_REL, anchored(SRC, "    if (reachHeld()) return [{ door: 'window', resource: '*', name: '', ok: false, code: REACH_UNREAD }];", '', 'may-use-unnamed'), 'may-use-unnamed');
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
  w.records.set('da-ab2', mkRec('da-ab2', { origin: 'agent-browser', by: { sessionId: 'w-B' } }));   // …and one whose conversation (w-B) is live: the kill path's
  ok(w.pr.seen.refused === 1 && Array.isArray(w.boot && w.boot.held) && w.boot.held.join() === LEASES && w.boot.dropped === 0 && heldRows(LEASES).length === 1,
    'HELD at the boot: said in its answer (held: window-leases.json), nothing dropped; the family lists the hold', w.boot);
  const syncAtBoot = w.pr.seen.sync;
  const readers = { leases: tryOf(() => w.engine.leases()), leaseOf: tryOf(() => w.engine.leaseOf('da-one')), desktop: tryOf(() => w.engine.desktopLeases()), list: await tryAsync(() => w.engine.list(w.facts)), summary: tryOf(() => w.engine.inputSummaryFor('w-A')) };
  ok(Object.values(readers).every((r) => named(r, 'window_leases_unread')), 'READERS: the lease list, one lease, the desktop leases, `list` and the session summary answer window_leases_unread BY NAME (503, the hold\'s words)', readers);
  const writers = { attach: tryOf(() => w.engine.attach('da-two', w.facts)), detach: tryOf(() => w.engine.detach('da-one', w.facts)), takeover: tryOf(() => w.engine.takeover({ handle: 'da-one', viewerId: 'v1' })),
    endHold: tryOf(() => w.engine.endHold('da-one', 'the person ended it')), open: await tryAsync(() => w.engine.open({ appId: 'gedit' }, w.facts)) };
  ok(Object.values(writers).every((r) => named(r, 'window_leases_unread')) && w.launched.length === 0, 'WRITERS: attach, detach, a person\'s takeover, the person\'s end of a hold and an open are refused BY NAME before any act (nothing launched)', { writers, launched: w.launched.length });
  const rec = w.engine.reconcile({ graceMs: 0 }); const ds = w.engine.dropSession('w-B'); w.engine.tick(); await sleep(0);   // (a stop rides a microtask: read after it)
  ok(rec.leasesHeld === true && rec.ended.length === 0 && ds === 0 && w.stopped.length === 0, 'BACKGROUND: the reconcile and the tick end nothing by the held file (the agent browser whose conversation ended is not stopped), and the kill path of a live opener (w-B) ends nothing — its browser is not stopped', { rec, ds, stopped: w.stopped });
  const gate = { policy: tryOf(() => w.engine.inputPolicy('da-one', 'v1')), input: tryOf(() => w.engine.leaseInput('da-one')), hint: tryOf(() => w.engine.agentBrowserFor('da-one', 'bk')) };
  ok(!!(gate.policy.v && gate.policy.v.relay === true && gate.input.v === null && gate.hint.v === null), 'THE STREAM\'S GATE: inputPolicy relays, leaseInput and the browser verbs\' hint answer «no lease» — never a throw (no agent verb runs while held, none injects)', gate);
  ok(w.sent.filter((m) => m.type === 'window-leases-updated').length === 0, 'NO LIST broadcast while held (an empty list reads as every lease lost)', w.sent.map((m) => m.type));
  ok(bytesOf(dir, LEASES) === f.leases && bytesOf(dir, REACH) === f.reach, 'NOT WRITTEN OVER: window-leases.json byte for byte after every writer was asked (and the share modes untouched)');
  ok(w.pr.seen.sync === syncAtBoot, `NOTHING SYNCHRONOUS ADDED: no store read again on the loop while held (${w.pr.seen.sync - syncAtBoot} after the boot's one)`);
  ok(w.logs.filter((l) => /window-leases\.json could not be read \(EIO\)/.test(l)).length === 1, 'the journal says the hold ONCE', w.logs);
  const gr = tryOf(() => w.engine.grantReach('da-three', { kind: 'session', id: 'w-A', name: 'agent A' })), rv0 = tryOf(() => w.engine.reachOf('da-one'));
  ok(!!(gr.v && gr.v.lease === null && rv0.v && rv0.v.lease === null && rv0.v.mode === 'pixels' && (JSON.parse(bytesOf(dir, REACH)).windows || {})['da-three'] && bytesOf(dir, LEASES) === f.leases),
    'A SHARE ACT NEEDS THE SHARE MODES ONLY (the cure round): while the leases are held the person shares da-three (written) and a window\'s share answers lease: null — the lease file untouched', { gr: gr.code || 'acted', rv0: rv0.v ? { lease: rv0.v.lease, mode: rv0.v.mode } : rv0 });
  const syncBeforeHeal = w.pr.seen.sync;
  const lifted = await HOLD.readAgainOf(LEASES);
  const after = { lease: tryOf(() => w.engine.leaseOf('da-one')), sent: w.sent.filter((m) => m.type === 'window-leases-updated') };
  ok(!!(lifted === true && heldRows(LEASES).length === 0 && after.lease.v && after.lease.v.sessionId === 'w-A' && after.sent.length >= 1 && after.sent.every((m) => m.leases.some((l) => l.handle === 'da-one')) && w.pr.seen.sync === syncBeforeHeal),
    'HEALED at the next good read (off the loop — no synchronous read): da-one\'s lease back as it was; every list broadcast at the lift (its own, the lift\'s reconcile) carries it', { lifted, after, sync: w.pr.seen.sync - syncBeforeHeal });
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
  const eDir = path.dirname(e.engine.leaseFile), eBytes = bytesOf(eDir, LEASES);
  e.records.set('da-ab', mkRec('da-ab', { origin: 'agent-browser', by: { sessionId: 'w-gone' } }));
  e.engine.reconcile({ graceMs: 0 }); await sleep(0);
  ok(e.stopped.includes('da-ab'), 'RED: the reconcile blind to the hold — the agent browser is stopped on an empty memory (its pending end is the held file\'s)', e.stopped);
  ok(bytesOf(eDir, LEASES) === eBytes && e.sent.filter((m) => m.type === 'window-leases-updated').length === 0 && !e.logs.some((l) => /broadcast failed/.test(l)),
    'THE INNER GUARDS ON THEIR OWN: in that copy two commits are reached while held — the save writes nothing over the file, the broadcast sends nothing and says no failure', e.logs);
  e.engine.shutdown();
  // RED: the save without its guard (the ends' guard gone too, so a commit is reached) — the empty memory written over the file
  const sv = heldLife(SAVE_BLIND(), (() => { const d = mk(); firstLife(d); return d; })(), LEASES); sv.pr.restore();
  sv.records.set('da-ab', mkRec('da-ab', { origin: 'agent-browser', by: { sessionId: 'w-gone' } })); sv.engine.reconcile({ graceMs: 0 }); await sleep(0);
  const svDisk = JSON.parse(bytesOf(path.dirname(sv.engine.leaseFile), LEASES) || '{}');
  ok(!!svDisk.leases && !svDisk.leases['da-one'], 'RED: the save without its guard — the empty memory written over window-leases.json: da-one\'s lease gone', Object.keys(svDisk.leases || {}));
  sv.engine.shutdown();
  // RED: the broadcast without its guard — it asks the held leases at each commit (its list refuses by name, so nothing leaves; the journal says a failure each time)
  const pb = heldLife(PUBLISH_BLIND(), (() => { const d = mk(); firstLife(d); return d; })(), LEASES); pb.pr.restore();
  pb.records.set('da-ab', mkRec('da-ab', { origin: 'agent-browser', by: { sessionId: 'w-gone' } })); pb.engine.reconcile({ graceMs: 0 }); await sleep(0);
  ok(pb.logs.filter((l) => /broadcast failed/.test(l)).length >= 1, 'RED: the broadcast without its guard — a failed broadcast said in the journal at every commit while held', pb.logs);
  pb.engine.shutdown();
  // RED: the kill path blind to the hold (its guard and the ends' guard gone) — a live opener's browser stopped on an empty memory
  const kb = heldLife(KILL_BLIND(), (() => { const d = mk(); firstLife(d); return d; })(), LEASES); kb.pr.restore();
  kb.records.set('da-ab2', mkRec('da-ab2', { origin: 'agent-browser', by: { sessionId: 'w-B' } })); kb.engine.dropSession('w-B'); await sleep(0);
  ok(kb.stopped.includes('da-ab2'), 'RED: the kill path blind to the hold — the browser of the conversation that ended is stopped on an empty memory', kb.stopped);
  kb.engine.shutdown();
  // RED: the gate that throws while held (the bridge catches it and warns at EVERY input message)
  const g = heldLife(GATE_THROWS(), (() => { const d4 = mk(); firstLife(d4); return d4; })(), LEASES); g.pr.restore();
  const gp = tryOf(() => g.engine.inputPolicy('da-one', 'v1'));
  ok(gp.code === 'window_leases_unread', 'RED: a gate that asks the held store throws at every input message', gp);
  g.engine.shutdown();
}

console.log('§1b (主开发 r4813) A PERSON\'s REVOKE WHILE THE LEASES ARE HELD is honoured: the reply says the holder\'s end waits for the read; the LIFT ends the revoked holder\'s lease before it publishes — the person\'s pane is theirs');
{
  const NO_MERGE = () => copyOf('no-merge', ['onLift: (v) => { if (v) { applyLeases(v); endUnreachedRestored(); }', 'onLift: (v) => { if (v) { applyLeases(v); }']);
  const scene = async (Mod) => {
    const dir = mk(); firstLife(dir);
    const w = heldLife(Mod, dir, LEASES); w.pr.restore();
    const rv = tryOf(() => w.engine.revokeReach('da-one', { kind: 'session', id: 'w-A', name: 'agent A' }));
    const lifted = await HOLD.readAgainOf(LEASES);
    const out = { rv: rv.v ? rv.v.revoked : rv, lifted, lease: tryOf(() => w.engine.leaseOf('da-one')).v, gate: w.engine.inputPolicy('da-one', 'v-person'),
      disk: Object.keys(JSON.parse(bytesOf(dir, LEASES) || '{}').leases || {}), lists: w.sent.filter((m) => m.type === 'window-leases-updated').map((m) => m.leases.map((l) => l.handle).join(',')) };
    w.engine.shutdown();
    return out;
  };
  const g = await scene(ENGINE);
  ok(!!(g.rv && g.rv.changed === true && g.rv.leaseDropped === false && g.rv.leaseEndsWhenRead === true), 'THE REVOKE ACTS while the leases are held, and its reply says the holder\'s lease ends as soon as the list can be read (leaseEndsWhenRead)', g.rv);
  ok(!!(g.lifted === true && g.lease === null && g.gate && g.gate.relay === true && !g.disk.includes('da-one') && g.lists.length >= 1 && g.lists.every((x) => !x.split(',').includes('da-one'))),
    'THE LIFT CARRIES IT OUT: the revoked agent\'s restored lease is ended before any list is published — the file drops it and the person\'s input reaches the window', g);
  const r = await scene(NO_MERGE());
  ok(!!(r.lease && r.lease.sessionId === 'w-A' && r.gate && r.gate.relay === false && r.gate.code === 'watch-mode'), 'RED (the tip before r4813): the lift brings the revoked agent\'s lease back — the person\'s own pane in watch mode behind it', r);
}

console.log('§1c a lease row with one odd field is dropped AT THE READ (that row only), the window-reach file\'s wrong shape is torn (kept aside)');
{
  const dir = mk(); const f = firstLife(dir);
  const j = JSON.parse(f.leases); j.leases['da-odd'] = { handle: 'da-odd', sessionId: { toString: 0, valueOf: 0 }, since: 1 };
  fs.writeFileSync(path.join(dir, LEASES), JSON.stringify(j, null, 2));
  const w = life(ENGINE, dir); const b = tryOf(() => w.engine.boot());
  const views = tryOf(() => w.engine.leases().map((l) => l.handle).join(','));
  ok(!!(b.v && !b.v.held && views.v === 'da-one' && fs.readdirSync(dir).every((n) => !n.startsWith(LEASES + '.corrupt-')) && w.logs.some((l) => /1 row\(s\) that are no plain record were skipped/.test(l))),
    'ONE ODD ROW: that row skipped and said, every other lease loads (da-one), nothing put aside', { b, views, logs: w.logs });
  w.engine.shutdown();
  const ROW = copyOf('odd-row-thrown', ['      if (![l.handle, l.sessionId, l.since, l.origin].every(plain)) { odd++; continue; }\n', '']);
  const w2 = life(ROW, dir); const b2 = tryOf(() => w2.engine.boot());
  ok(!!(b2.code === undefined && /Cannot convert object to primitive value/.test(b2.message || '') && heldRows(LEASES).length === 0), 'RED: without the row check the odd row throws out of the start — nothing held, the read lost', b2);
  w2.engine.shutdown();
  const d2 = mk(); firstLife(d2);
  const BAD = JSON.stringify({ v: 1, savedAt: 1, windows: [{ windowId: 'x', mode: 'pixels' }] });
  fs.writeFileSync(path.join(d2, REACH), BAD);
  const w3 = life(ENGINE, d2); const b3 = w3.engine.boot();
  await waitFor(() => !tryOf(() => w3.engine.reachViews()).code, 5000, 'the wrong-shaped share modes\' lift');
  const c3 = fs.readdirSync(d2).filter((n) => n.startsWith(REACH + '.corrupt-'));
  ok(!!(Array.isArray(b3.held) && b3.held.join() === REACH && c3.length === 1 && fs.readFileSync(path.join(d2, c3[0]), 'utf8') === BAD), 'A SHARE-MODES FILE OF ANOTHER SHAPE (windows a list) is TORN: held, kept aside byte for byte', { b3, c3 });
  w3.engine.shutdown();
  const SHAPELESS = copyOf('reach-shape-isobj', ['const a = SR.storeAnswer(read, { valid: reachShape });', 'const a = SR.storeAnswer(read, { valid: isObj });']);
  const d3 = mk(); firstLife(d3); fs.writeFileSync(path.join(d3, REACH), BAD);
  const w4 = life(SHAPELESS, d3); w4.engine.boot();
  ok(fs.readdirSync(d3).every((n) => !n.startsWith(REACH + '.corrupt-')) && bytesOf(d3, REACH) !== BAD, 'RED: a shape of «any object» — the list read as handles 0, 1…, pruned and written over; no copy kept', bytesOf(d3, REACH));
  w4.engine.shutdown();
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
  const readers = { reachOf: tryOf(() => w.engine.reachOf('da-one')), views: tryOf(() => w.engine.reachViews()), list: await tryAsync(() => w.engine.list(w.facts)) };
  ok(Object.values(readers).every((r) => named(r, 'window_reach_unread')), 'READERS: a window\'s share, the share list and `list` answer window_reach_unread BY NAME (503, the hold\'s words)', readers);
  const mu = tryOf(() => w.engine.mayUseFor({ conversationKeys: [`claude:${S1}`] })), muRow = mu.v && mu.v.length === 1 ? MU.rowOf(mu.v[0]) : null;
  ok(!!(muRow && muRow.state === 'unknown' && muRow.code === 'window_reach_unread' && mu.v[0].resource === '*'), '«WHAT IT MAY USE» NAMES IT: one window row with the held code, which the model lists as unknown BY THAT CODE (never folded into unknown_shape)', mu);
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
  ok(!!(lifted === true && v.v && v.v.mode === 'pixels' && w.sent.filter((m) => m.type === 'window-reach-updated').length >= 1 && w.sent.filter((m) => m.type === 'window-reach-updated').every((m) => m.reach.some((x) => x.handle === 'da-one'))), 'HEALED at the next good read: da-one\'s «pixels» back; every share list broadcast at the lift carries it', { lifted, v: v.v && v.v.mode });
  w.pr.restore(); w.engine.shutdown();
  // RED: the release's read — the failure read as «every window in auto»: a mode change writes the file over (da-one's «pixels» gone)
  const r = heldLife(RELEASE_REACH(), (() => { const d2 = mk(); firstLife(d2); return d2; })(), REACH); r.pr.restore();
  const rv = tryOf(() => r.engine.reachOf('da-one')); const rm = tryOf(() => r.engine.setShareMode('da-two', 'tree'));
  const rdisk = JSON.parse(bytesOf(path.dirname(r.engine.reachFile), REACH) || '{}').windows || {};
  ok(!!(rv.v && rv.v.mode === 'auto' && rm.v && !rdisk['da-one'] && rdisk['da-two']), 'RED: the release\'s read — da-one answers «auto» (no name), and a mode change writes over the file: its «pixels» is gone', { reachOf: rv.v && rv.v.mode, disk: rdisk });
  r.engine.shutdown();
  // RED: the prune blind to the hold — a gone window's share row removed on an empty memory
  const p = heldLife(PRUNE_BLIND(), (() => { const d3 = mk(); firstLife(d3); return d3; })(), REACH); p.pr.restore(); p.dir = path.dirname(p.engine.reachFile);
  const pBytes = bytesOf(p.dir, REACH);
  p.records.delete('da-two');
  const pr = p.engine.reconcile({ graceMs: 0 });
  ok(pr.pruned >= 1 && grantRows(p, 'da-two') === 0, 'RED: the reconcile blind to the hold — the gone window\'s share row removed', { pr, rows: grantRows(p, 'da-two') });
  ok(!!pBytes && bytesOf(p.dir, REACH) === pBytes && JSON.parse(pBytes).windows['da-one'].mode === 'pixels' && p.sent.filter((m) => m.type === 'window-reach-updated').length === 0,
    'THE INNER GUARDS ON THEIR OWN: in that copy a share commit is reached while held — the save writes nothing over window-reach.json («pixels» kept), nothing is broadcast');
  p.engine.shutdown();
  // RED: the share save without its guard (the prune's guard gone too) — the empty memory written over the file
  const sr = heldLife(SAVE_R_BLIND(), (() => { const d = mk(); firstLife(d); return d; })(), REACH); sr.pr.restore();
  sr.records.delete('da-two'); sr.engine.reconcile({ graceMs: 0 });
  const srDisk = JSON.parse(bytesOf(path.dirname(sr.engine.reachFile), REACH) || '{}');
  ok(!!srDisk.windows && !srDisk.windows['da-one'], 'RED: the share save without its guard — the empty memory written over window-reach.json: da-one\'s «pixels» gone', srDisk);
  sr.engine.shutdown();
  // RED: «what it may use» without its named row — it throws, and the may-use door folds a throw into unknown_shape
  const mt = heldLife(MAYUSE_THROWS(), (() => { const d = mk(); firstLife(d); return d; })(), REACH); mt.pr.restore();
  const mu2 = tryOf(() => mt.engine.mayUseFor({ conversationKeys: [`claude:${S1}`] }));
  ok(mu2.code === 'window_reach_unread' && mu2.v === undefined, 'RED: «what it may use» without its named row throws (the door would list it as unknown_shape)', mu2);
  mt.engine.shutdown();
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
  ok(fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8').includes('window_leases_unread: 503, window_reach_unread: 503'), 'PRODUCTION: `vibespace-browser new --backend desktop-app` answers both codes 503 (its status table)');
}

console.log('§6 THE ROUTES, DRIVEN over loopback (the cure round): the relaunch refused by name while the leases are held, Resume here acts with lease null, a launch with a share refused BEFORE anything starts while the share modes are held');
{
  const express = require(path.join(REPO, 'node_modules/express'));
  const http = require('node:http');
  const RT_SRC = fs.readFileSync(path.join(REPO, ROUTES_REL), 'utf8');
  /** the desktop-app routes (the real file, or a RED copy) over loopback, wired to one life's keeper and engine → { go(path, body), close() } */
  async function serve(R, w) {
    R.setup({ keeper: w.keeper, windowEngine: w.engine });
    const app = express(); app.use(express.json()); app.use(R.router);
    const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const go = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); let j = null; try { j = await r.json(); } catch { j = null; } return { status: r.status, body: j }; };
    return { go, close: () => new Promise((r) => srv.close(() => r())) };
  }
  const drive = async (R, w, p, body) => { const s1 = await serve(R, w); try { return await s1.go(p, body); } finally { await s1.close(); } };
  const RT = require(path.join(REPO, ROUTES_REL));
  const L = heldLife(ENGINE, (() => { const d = mk(); firstLife(d); return d; })(), LEASES); L.pr.restore();
  const rel = await drive(RT, L, '/api/desktop/apps/da-one/relaunch', {});
  const res = await drive(RT, L, '/api/desktop/apps/da-one/viewers/takeover', { viewerId: 'v1' });
  ok(!!(rel.status === 503 && rel.body && rel.body.code === 'window_leases_unread' && L.relaunched.length === 0), 'THE RELAUNCH while the leases are held: 503 window_leases_unread by name, nothing relaunched (unknown is never «no agent holds it»)', rel);
  ok(!!(res.status === 200 && res.body && res.body.ok === true && res.body.lease === null && L.elected.length === 1), 'RESUME HERE while the leases are held: the person\'s own election acts and answers lease: null (no agent verb runs while held)', res);
  // RED copies of the route file, ONE anchored edit each
  const RREL = M.load(ROUTES_REL, anchored(RT_SRC, "catch (e) { if (e && e.code === 'window_leases_unread') return fail(res, e); lease = null; }", 'catch { lease = null; }', 'relaunch-reads-held-as-none'), 'relaunch-none');   // stale-pins: kept — the red's own text (the release's form)
  const rel2 = await drive(RREL, L, '/api/desktop/apps/da-one/relaunch', {});
  ok(rel2.status === 200 && L.relaunched.length === 1, 'RED: the relaunch that reads a held lease table as «no agent holds it» — the window relaunched', rel2);
  const RTKO = M.load(ROUTES_REL, anchored(RT_SRC, 'lease: leaseView || (engine ? leaseAfterAct(engine, id) : null) });', 'lease: leaseView || (engine ? engine.leaseOf(id) : null) });', 'takeover-asks-the-held-lease'), 'takeover-held');   // stale-pins: kept — the red's own text (the release's form)
  const res2 = await drive(RTKO, L, '/api/desktop/apps/da-one/viewers/takeover', { viewerId: 'v2' });
  ok(!!(res2.status === 503 && L.elected.length === 2), 'RED: Resume here that asks the held lease after its act — the person is elected, then told 503 (an act done behind a refusal)', res2);
  L.engine.shutdown();
  const SHARE = { appId: 'gedit', share: { principals: [{ kind: 'session', id: 'w-A', name: 'agent A' }], mode: 'auto' } };
  const Rh = heldLife(ENGINE, (() => { const d = mk(); firstLife(d); return d; })(), REACH); Rh.pr.restore();
  const la = await drive(RT, Rh, '/api/desktop/apps', SHARE);
  ok(!!(la.status === 503 && la.body && la.body.code === 'window_reach_unread' && Rh.launched.length === 0), 'A LAUNCH WITH A SHARE while the share modes are held: 503 window_reach_unread BEFORE anything starts (nothing launched)', la);
  const RLA = M.load(ROUTES_REL, anchored(RT_SRC, "  if (shareWrites && host === 'local' && ctx.windowEngine && typeof ctx.windowEngine.storesReadable === 'function') { try { ctx.windowEngine.storesReadable({ reach: true }); } catch (e) { return fail(res, e); } }\n", '', 'launch-before-the-share'), 'launch-first');
  const la2 = await drive(RLA, Rh, '/api/desktop/apps', SHARE);
  ok(!!(Rh.launched.length === 1 && la2.body && la2.body.reachError && la2.body.reachError.code === 'window_reach_unread'), 'RED: the launch before the share\'s question — the app starts, then its share is refused (an app running unshared behind a refusal)', la2);
  // r4813: a share that writes nothing (nobody, auto — the default) is no act: the launch goes on while the share modes are held
  const EMPTY = { appId: 'gedit', share: { principals: [], mode: 'auto' } };
  const le = await drive(RT, Rh, '/api/desktop/apps', EMPTY);
  ok(!!(le.status === 200 && Rh.launched.length === 2 && le.body && !le.body.reachError), 'A LAUNCH WITH A SHARE THAT WRITES NOTHING (nobody, auto) while the share modes are held: it starts, no refusal, no share error', le);
  const RLE = M.load(ROUTES_REL, anchored(RT_SRC, "  if (shareWrites && host === 'local' && ctx.windowEngine", "  if (share != null && host === 'local' && ctx.windowEngine", 'any-share-asks'), 'any-share');   // stale-pins: kept — the red's own text (the tip's gate)
  const le2 = await drive(RLE, Rh, '/api/desktop/apps', EMPTY);
  ok(le2.status === 503 && Rh.launched.length === 2, 'RED: the gate on any share object — an empty share (no act) refused while the share modes are held', le2);
  Rh.engine.shutdown();
  // the request that ends another agent's hold asks the leases first (src/server/window-request.js)
  const WR_REL = 'src/server/window-request.js', WR_SRC = fs.readFileSync(path.join(REPO, WR_REL), 'utf8');
  const reqOf = (Mod, w) => Mod.create({ engine: w.engine, deliver: { stashFor: () => ({ stored: true }) }, activeSessions: w.sessions, log: { warn() {}, log() {} } });
  const Lq = heldLife(ENGINE, (() => { const d = mk(); firstLife(d); return d; })(), LEASES); Lq.pr.restore(); Lq.dir = path.dirname(Lq.engine.leaseFile);
  const q = await tryAsync(() => reqOf(require(path.join(REPO, WR_REL)), Lq).request({ handle: 'da-three', sessionId: 'w-B', endHold: true }));
  ok(named(q, 'window_leases_unread') && grantRows(Lq, 'da-three') === 0, 'A REQUEST THAT ENDS ANOTHER AGENT\'S HOLD while the leases are held: refused by name BEFORE the grant (no row written)', { q, rows: grantRows(Lq, 'da-three') });
  const WRB = M.load(WR_REL, anchored(WR_SRC, "    if (endHold && typeof engine.storesReadable === 'function') engine.storesReadable({ leases: true });\n", '', 'request-grants-first'), 'request-first');
  const q2 = await tryAsync(() => reqOf(WRB, Lq).request({ handle: 'da-three', sessionId: 'w-B', endHold: true }));
  ok(!!(q2.v && q2.v.endedHold === false && grantRows(Lq, 'da-three') === 1), 'RED: the request that grants first — the grant written and the hold\'s end silently skipped (no holder known while held)', { q2: q2.v ? { endedHold: q2.v.endedHold } : q2 });
  Lq.engine.shutdown();
}

report();
