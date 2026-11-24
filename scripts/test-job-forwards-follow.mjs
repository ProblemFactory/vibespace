#!/usr/bin/env node
// THE FORWARDS' RECONCILE — ITS FOLLOW (主开发 r3327, round wr0rh7dmn on line 702's cure): the twin of scripts/test-job-forwards.mjs
// (that suite stands at 8.8 s of the fast tier's 10 — its twin carries the follow's legs). Each leg drives the REAL Ports store and the
// REAL jobs engine; the relay stand-in records every call. REDS in copies (scripts/mutant-copy.mjs, scripts/scratch.mjs anchored).
//   F1 an ARCHIVED service's removal while port-forwards.json is held is refused by name, as a live one's (its row would name nobody)
//   F2 a row the relay did not answer, of a job the engine KNOWS no longer asks, is taken down all the same (never left for the heal sweep)
//   F3 a row whose background job is gone says so (ownerGone; unknown is never «gone»); rm --orphan of a published service says its
//      address stays
//   F4 the removal's refusal only for a service that can own a row; a remove-with-stop stops it and refuses only the removal
//   F5 a person's Unpublish that loses to a publish landing meanwhile is refused in words (409), never a silent success
//   F6 the publish generation map leaves with its row
//   F7 while the job records are held, the Ports list's lift clears the «list of forwards could not be read» words all the same
//   F8 (r3660) the «stopped, not removed» refusal REACHES THE PAGE: both job routes (an archived row's ✕, a live row's) hand `stopped` on
//   F9 (r3660) a take-down the relay answers LATE: the heal sweep never publishes the row again meanwhile (the engine knows its job
//      no longer asks), and the pass is asked again once the take-down answers — the address down, the row gone
//   F10 (r3660) a remove-with-stop whose stop did NOT happen answers the stop's own words, never «stopped»; the Ports list never
//      reads the job archive's file (the owner lookup reads memory only)
// Run: node scripts/test-job-forwards-follow.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST (B-ba47 B2)
import { checker } from './lib/check.mjs';   // the ONE assertion helper (the swap guard)
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { mutantCopies } = await import('./mutant-copy.mjs');
const { anchored } = await import('./scratch.mjs');
const MUT = mutantCopies('job-forwards-follow', ROOT);
require('../src/server/owner-facts.js').configure({ setting: (k) => (k === 'instance.timezone' ? 'UTC' : undefined) });
const { JobManager } = require('../src/jobs.js');
const { PortForwardManager } = require('../src/port-forward.js');
const JSRC = read('src/jobs.js'), PSRC = read('src/port-forward.js');
const loadJM = (src, tag) => MUT.load('src/jobs.js', src, tag).JobManager;
const loadPF = (src, tag) => MUT.load('src/port-forward.js', src, tag).PortForwardManager;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const owner = { conversation: { backend: 'claude', id: 'conv-G' }, sessionId: 'sess-G', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const svc = (id, port, more = {}) => ({ id, kind: 'service', name: id.replace(/^jb-/, ''), state: 'up', desiredUp: true, publish: true, ports: [port], owner, access: { view: 'session', control: 'session' }, runs: [], createdAt: Date.now(), ...more });
const ownedRow = (id, port) => ({ id: `pf-__local__-${port}`, hostId: '__local__', remotePort: port, label: 'service: ' + id.replace(/^jb-/, ''), ownerJob: id, publicUrl: `https://was-${port}.relay.test/`, publicName: `pf-__local__-${port}`, publicSub: `was-${port}`, proto: 'http' });
const STOPPED = "stopped, not removed: the list of forwards could not be read, so this service's public address could not be taken down yet — remove it once the list of forwards reads";
const RMH = "not removed: the list of forwards could not be read, so this service's public address could not be taken down — stop it now; remove it once the list of forwards reads";
const roots = [];
process.on('exit', () => { for (const d of roots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
/** a placed refusal of ONE file's synchronous read for the length of fn */
const refused = (file, fn) => { const rf = fs.readFileSync; fs.readFileSync = function (q, ...a) { if (String(q) === file) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf.call(this, q, ...a); }; try { return fn(); } finally { fs.readFileSync = rf; } };
/** a world: the Ports store (held or not) + the jobs engine over one data folder, the relay stand-in recording every call */
function world({ JM = JobManager, PFM = PortForwardManager, rows = [], portsHeld = false, archive = null, archiveHeld = false, boundMs = 20000, hang = [], unpubDelayMs = 0, gates = {}, relay = null } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwdf-')); roots.push(d);
  const pdir = path.join(d, 'pf'), edir = path.join(d, 'engine'); fs.mkdirSync(pdir, { recursive: true }); fs.mkdirSync(path.join(edir, 'bin'), { recursive: true });
  const pfile = path.join(pdir, 'port-forwards.json'); fs.writeFileSync(pfile, JSON.stringify({ forwards: rows }, null, 2));
  const afile = path.join(edir, 'jobs-archive.json'); if (archive) fs.writeFileSync(afile, JSON.stringify(archive));
  const calls = [];
  const plugins = {
    // gates (F9): a call's own wait, by its name and its count (k); relay (F9): the relay's OWN state — a proxy up once a publish answers, down once a take-down answers
    async frpPublish(name, lp, o) { calls.push(['publish', name]); const k = calls.filter((c) => c[0] === 'publish' && c[1] === name).length; const g = gates.publish && gates.publish(name, k); if (g) await g; else if (hang.includes(name)) return new Promise(() => { }); if (relay) relay.add(name); return { name, subdomain: (o && o.preferSub) || 'fresh', proto: 'http', url: `https://${(o && o.preferSub) || name}.relay.test/` }; },
    async frpUnpublish(name) { calls.push(['unpublish', name]); const k = calls.filter((c) => c[0] === 'unpublish' && c[1] === name).length; const g = gates.unpublish && gates.unpublish(name, k); if (g) await g; if (unpubDelayMs) await sleep(unpubDelayMs); if (relay) relay.delete(name); return { ok: true }; },
  };
  let eng = null;
  const mkPf = () => new PFM({ hosts: { list: () => [] }, dataDir: pdir, plugins, broadcast: () => { }, log: () => { }, getJobs: () => eng, relayBoundMs: boundMs });
  const pf = portsHeld ? refused(pfile, mkPf) : mkPf();
  const E = new JM({ dataDir: edir, broadcast: () => { }, notifyUser: () => { }, log: () => { }, getPorts: () => pf, publishWaitMs: 30, publishRecheckMs: 60_000, deliverToConversation: async () => ({ ok: true }) });
  if (archiveHeld) refused(afile, () => { E.init(); E._loadArchive(); }); else E.init();   // the archive read refused at the start (read once more here: the boot's sweep may not have asked it)
  eng = E;
  const settle = async () => { for (let t0 = Date.now(), last = -1, since = Date.now(); Date.now() - t0 < 2500;) { await sleep(25); const fl = [...E.jobs.values()].some((j) => j._publish && j._publish.state === 'publishing'); if (calls.length !== last || fl) { last = calls.length; since = Date.now(); } else if (Date.now() - since > 100) break; } };
  const end = () => { try { for (const t of E._timers || []) clearInterval(t); E.shutdown(); } catch { } try { clearInterval(pf._watch); if (pf._hold && pf._hold.stop) pf._hold.stop(); } catch { } };
  return { d, pf, E, calls, settle, end };
}
const lastFor = (calls, name) => { const c = calls.filter((x) => x[1] === name); return c.length ? c[c.length - 1][0] : null; };

console.log('F1 an ARCHIVED service\'s removal while the Ports list is held is refused by name');
const F1 = async (JM) => {
  const A = svc('jb-fwdarch01', 47441, { state: 'down', desiredUp: false, endedAt: Date.now() - 1000 });
  const w = world({ JM, rows: [ownedRow(A.id, 47441)], portsHeld: true, archive: [A] });
  const r = w.E.rmArchived(A.id);
  const out = { code: r && r.code, error: r && r.error, stopped: !!(r && r.stopped), still: (w.E._archiveNext() || []).some((x) => x.id === A.id) };
  w.end(); return out;
};
const f1 = await F1();
ok(f1.code === 'ports_unread' && f1.error === STOPPED && f1.stopped && f1.still, `F1: the archived service's removal refused by name («${f1.error}»), its record kept`, f1);
const ARCH_GUARD = "    if (this._mayOwnForward(arch[i]) && this._portsHeld()) return { error: RM_PORTS_HELD_STOPPED, code: 'ports_unread', stopped: true };\n";
const f1red = await F1(loadJM(anchored(JSRC, ARCH_GUARD, '', 'archived-rm'), 'archived-rm'));
ok(f1red.code !== 'ports_unread', 'RED CONTROL F1: the archived removal\'s refusal cut (in a copy) — it goes round the refusal, its row would name nobody', f1red);

console.log('F2 an UNANSWERED row of a job the engine KNOWS no longer asks is taken down all the same');
const F2 = async (JM) => {
  const Y = svc('jb-fwdunan02', 47442, { state: 'down', desiredUp: false }), X = svc('jb-fwdunan03', 47443);
  const w = world({ JM, rows: [ownedRow(Y.id, 47442), ownedRow(X.id, 47443)], boundMs: 200, hang: ['pf-__local__-47442', 'pf-__local__-47443'] });
  w.E.jobs.set(Y.id, { ...Y }); w.E.jobs.set(X.id, { ...X });
  await Promise.race([w.pf.restore(), sleep(2500)]); await w.settle();
  const rows = w.pf.list();
  const out = { y: lastFor(w.calls, 'pf-__local__-47442'), yRow: rows.some((r) => r.id === 'pf-__local__-47442'), xRow: rows.some((r) => r.id === 'pf-__local__-47443' && !!r.publicUrl), xUnpub: w.calls.some((c) => c[0] === 'unpublish' && c[1] === 'pf-__local__-47443'), calls: w.calls.slice() };
  w.end(); return out;
};
const f2 = await F2();
ok(f2.y === 'unpublish' && !f2.yRow && f2.xRow && !f2.xUnpub, 'F2: the stopped service\'s unanswered row taken down (its unpublish bounded); the running one\'s unanswered row left as it is', f2);
const UNAN = "      if (rec.relayUnanswered && job && wants(job)) { out.unanswered.push(rec.id); served.add(rec.ownerJob); continue; }\n";
const f2red = await F2(loadJM(anchored(JSRC, UNAN, "      if (rec.relayUnanswered) { out.unanswered.push(rec.id); served.add(rec.ownerJob); continue; }\n", 'unanswered-kept'), 'unanswered-kept'));
ok(f2red.yRow && f2red.y !== 'unpublish', 'RED CONTROL F2: every unanswered row skipped (in a copy, the cure\'s form) — the stopped service\'s address stays up for the heal sweep to publish again', f2red);

console.log('F3 a row whose background job is GONE says so; rm --orphan of a published service says its address stays');
{
  const L3 = svc('jb-fwdlive03', 47445);
  const w = world({ rows: [ownedRow('jb-fwdgone31', 47444), ownedRow(L3.id, 47445)] });
  w.E.jobs.set(L3.id, { ...L3 });
  w.E._loadArchive();   // r3660: the archive in memory, as the jobs start's pass reads it (it asks the archive of every row whose job is not live) — ownerKnown never reads the file itself (F10)
  const ls = w.pf.list(), g = ls.find((r) => r.id === 'pf-__local__-47444') || {}, l = ls.find((r) => r.id === 'pf-__local__-47445') || {};
  const wasHeld = w.E._unread.archive; w.E._unread.archive = { code: 'EIO', at: Date.now() };   // the records held for a moment: unknown is never «gone»
  const gHeld = (w.pf.list().find((r) => r.id === 'pf-__local__-47444') || {}).ownerGone;
  w.E._unread.archive = wasHeld;
  // rm --orphan of a running published service: its process runs on, so its forward and address stay — said
  const O = svc('jb-fwdorph03', 47446); w.E.jobs.set(O.id, { ...O }); w.E._verifyAlive = () => true;   // its wrapper stands in as alive (nothing is signalled)
  const rmO = w.E.rm(w.E.jobs.get(O.id), { orphan: true });
  w.end();
  ok(g.ownerGone === true && l.ownerGone === false && gHeld === false, 'F3: a job row whose job the engine knows is gone says ownerGone; a live one does not; while the records are held nothing is «gone» (unknown)', { gone: g.ownerGone, live: l.ownerGone, held: gHeld });
  ok(!!rmO && rmO.ok === true && rmO.addressKept === true, 'F3: rm --orphan of a published service answers addressKept (its process runs on — its forward and public address stay)', rmO);
  const RAIL = read('src/lib/sidebar-rail.js'), CLI = read('data/bin/vibespace-job'), ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  const GONEW = 'Its background job is gone: this forward and its public address stay until you remove it here.';
  ok(RAIL.includes(`if (f.ownerGone) row.insertAdjacentHTML('beforeend', \`<div class="empty-hint empty-hint-inline">\${escHtml(tr('${GONEW}'))}</div>\`);`) && ZH.includes(`  "${GONEW}": "`) && JA.includes(`  "${GONEW}": "`) && CLI.includes("} else if (rmAns && rmAns.addressKept) {") && CLI.includes("console.log('removed — it was left running, so its forward and its public address stay: remove the forward in the Ports panel to take the address down');"), 'the Ports panel says «its background job is gone» on such a row (zh / ja), and the CLI says the orphan\'s address stays');
}

console.log('F4 the removal\'s refusal only for a service that can own a row; a remove-with-stop stops it and refuses only the removal');
{
  const w = world({ portsHeld: true });
  const N4 = svc('jb-fwdnopo04', 0, { publish: false, ports: [] }); w.E.jobs.set(N4.id, { ...N4, state: 'down', desiredUp: false });
  const rN = w.E.rm(w.E.jobs.get(N4.id), {});
  const R4 = svc('jb-fwdrstp04', 47447); w.E.jobs.set(R4.id, { ...R4 }); w.E._verifyAlive = (st) => !!w.E.jobs.get(R4.id) && w.E.jobs.get(R4.id).state === 'up';
  let stopped = 0; w.E.stop = (job) => { stopped++; job.state = 'down'; job.desiredUp = false; return { ok: true }; };   // the stop road stands in (nothing is signalled)
  const rR = w.E.rm(w.E.jobs.get(R4.id), { stop: true });
  const out = { rN, nGone: !w.E.jobs.has(N4.id), rR, stopped, rKept: w.E.jobs.has(R4.id), rState: (w.E.jobs.get(R4.id) || {}).state };
  w.end();
  ok(out.rN && out.rN.ok === true && out.nGone, 'F4: a service that never asks to publish (no port, no row) is removed while the list is held — never over-refused', out.rN);
  ok(out.stopped === 1 && out.rKept && out.rState === 'down' && out.rR && out.rR.code === 'ports_unread' && out.rR.stopped === true && out.rR.error === STOPPED, 'F4: a remove-with-stop of a running row-holding service STOPS it and refuses only the removal (its words say it is stopped)', out);
}

console.log('F5 a person\'s Unpublish that loses to a publish landing meanwhile is refused in words, never a silent success');
const F5 = async (PFM) => {
  const w = world({ PFM, rows: [{ ...ownedRow('jb-fwdpubl05', 47448), ownerJob: undefined, label: 'by hand' }], unpubDelayMs: 150 });
  const rec = w.pf._state.forwards.find((r) => r.id === 'pf-__local__-47448');
  const p = w.pf.unpublish('pf-__local__-47448').then(() => ({ ok: true }), (e) => ({ code: e && e.code, status: e && e.status, error: e && e.message }));
  await sleep(40); w.pf._adoptPublish(rec, { url: 'https://again.relay.test/', name: 'pf-__local__-47448' });   // the heal sweep's publish lands meanwhile
  const r = await p; w.end(); return r;
};
const f5 = await F5(PortForwardManager);
ok(f5.code === 'republished_meanwhile' && f5.status === 409 && /published again/.test(String(f5.error)), `F5: the Unpublish answers 409 «${f5.error}»`, f5);
const SUPERSEDED = "      throw Object.assign(new Error('not unpublished: this forward was published again while the relay was asked — it is public again; unpublish it again'), { code: 'republished_meanwhile', status: 409 });\n";
const f5red = await F5(loadPF(anchored(PSRC, SUPERSEDED, '      return;\n', 'silent-unpublish'), 'silent-unpublish'));
ok(f5red.ok === true, 'RED CONTROL F5: the silent return (in a copy, the cure\'s form) — the press answers success while the address is public again', f5red);

console.log('F6 the publish generation map leaves with its row');
{
  const w = world({ rows: [{ ...ownedRow('jb-fwdgen006', 47449), ownerJob: undefined, label: 'by hand' }] });
  const rec = w.pf._state.forwards.find((r) => r.id === 'pf-__local__-47449');
  w.pf._adoptPublish(rec, { url: 'https://g.relay.test/', name: rec.id });
  const had = w.pf._pubGen.has(rec.id);
  await w.pf.unforward(rec.id);
  const after = w.pf._pubGen.has(rec.id);
  w.end();
  ok(had && !after, 'F6: a row\'s publish generation is dropped where the row leaves (unforward, an unpair) — the map never grows past the rows', { had, after });
}

console.log('F7 while the job records are held, the Ports list\'s lift clears the held words all the same');
const F7 = async (JM) => {
  const w = world({ JM, portsHeld: true, archiveHeld: true });
  const S = svc('jb-fwdheld07', 47450); w.E.jobs.set(S.id, { ...S, publishHeld: 'not published yet: the list of forwards could not be read; published by itself when it reads', _publish: { state: 'held' } });
  await w.pf.restore();   // asked while held
  const recordsHeld = w.E._recordsHeld();
  if (w.pf._hold && w.pf._hold.again) await w.pf._hold.again().catch(() => false);   // THE PORTS LIFT
  await w.settle();
  const sn = w.E.snapshot(w.E.jobs.get(S.id));
  w.end();
  return { recordsHeld, state: sn.publishState, error: sn.publishError };
};
const f7 = await F7();
ok(f7.recordsHeld === true && f7.state !== 'held' && !/could not be read/.test(String(f7.error || '')), 'F7: the job records held (the archive unread) — at the Ports lift the card no longer says the list of forwards could not be read', f7);
const CLEAR = "    for (const job of this.jobs.values()) { if (job.kind !== 'service') continue; delete job.publishHeld; if (job._publish && job._publish.state === 'held') job._publish = null; }   // r3327: the Ports list reads now: its held words go, whatever else waits\n";
const f7red = await F7(loadJM(anchored(JSRC, CLEAR, '', 'held-words-kept'), 'held-words-kept'));
ok(f7red.state === 'held' && /could not be read/.test(String(f7red.error || '')), 'RED CONTROL F7: the clearing cut (in a copy, the cure\'s form) — the card keeps saying the list could not be read after it lifted', f7red);

console.log('F8 the «stopped, not removed» refusal reaches the page: both job routes hand `stopped` on');
const WSRC = read('src/server/jobs-wiring.js');
/** the routes' own door: app.post as the server registers it, called as the page calls it */
function fakeApp() {
  const routes = new Map();
  const reg = (m) => (p, h) => routes.set(m + ' ' + p, h);
  const app = { get: reg('GET'), post: reg('POST'), patch: reg('PATCH'), put: reg('PUT'), delete: reg('DELETE'), use() { } };
  const call = (m, p, { params = {}, query = {}, body = {}, headers = {} } = {}) => new Promise((resolve) => {
    const h = routes.get(m + ' ' + p);
    if (!h) return resolve({ status: 404, body: { error: 'no route ' + m + ' ' + p } });
    const res = { _status: 200, status(c) { this._status = c; return this; }, json(o) { resolve({ status: this._status, body: o }); return this; } };
    Promise.resolve().then(() => h({ params, query, body, headers }, res)).catch((e) => resolve({ status: 500, body: { error: e.message } }));
  });
  return { app, call };
}
const F8 = async (JW) => {
  const w = world({ portsHeld: true });   // the Ports list held
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwdr-')); roots.push(d);
  const A = svc('jb-fwdarch08', 47453, { state: 'down', desiredUp: false, endedAt: Date.now() - 1000 });
  fs.writeFileSync(path.join(d, 'jobs-archive.json'), JSON.stringify([A]));
  const fa = fakeApp();
  const todos = { filerKey: () => null, snapshot: () => ({ open: [], resolved: [] }), idsWhere: () => [], add: () => null, get: () => null, setStatus() { }, isHeldUnread: () => false };
  const J = JW.create({ app: fa.app, dataDir: d, broadcastAll: () => { }, userTodos: todos, log: () => { }, serverSetting: () => undefined, taskGroups: null, activeSessions: new Map(), deliver: { peerReachable: () => false, deliverToConversation: async () => ({ ok: false, reason: 'none' }) } });
  J.jm.d.getPorts = () => w.pf;   // as server.js binds it (the late singleton)
  J.initAfterListen();
  const S = svc('jb-fwdstop08', 47454, { state: 'down', desiredUp: false }); J.jm.jobs.set(S.id, { ...S });   // a stopped, not yet archived service
  const arch = await fa.call('POST', '/api/jobs/:id/:act', { params: { id: A.id, act: 'rm' }, body: {} });
  const live = await fa.call('POST', '/api/jobs/:id/:act', { params: { id: S.id, act: 'rm' }, body: {} });
  try { for (const t of J.jm._timers || []) clearInterval(t); J.shutdown(); } catch { }
  w.end();
  return { arch, live };
};
const f8 = await F8(require('../src/server/jobs-wiring.js'));
ok(f8.arch.status === 400 && f8.arch.body.code === 'ports_unread' && f8.arch.body.stopped === true && f8.arch.body.error === STOPPED, 'F8: an ARCHIVED row\'s ✕ while the Ports list is held answers stopped: true at the route (the card says «Stopped, not removed», never «Stop it now»)', f8.arch);
ok(f8.live.status === 400 && f8.live.body.code === 'ports_unread' && f8.live.body.stopped === true && f8.live.body.error === STOPPED, 'F8: a stopped service\'s ✕ while the Ports list is held answers stopped: true at the route', f8.live);
const f8red = await F8(MUT.load('src/server/jobs-wiring.js', anchored(WSRC, ', ...(r.stopped ? { stopped: true } : {})', '', 'route-stopped', { count: 2 }), 'route-stopped'));
ok(f8red.arch.body.code === 'ports_unread' && f8red.arch.body.stopped !== true && f8red.live.body.code === 'ports_unread' && f8red.live.body.stopped !== true, 'RED CONTROL F8: both routes\' hand-on cut (in a copy, the cure\'s form) — the page reads no stopped and tells the person «Stop it now»', f8red);

console.log('F9 a take-down the relay answers LATE: the heal sweep never publishes the row again; the pass is asked again once it answers');
const F9 = async ({ JM, PFM } = {}) => {
  const Y = svc('jb-fwdlate09', 47452, { state: 'down', desiredUp: false }), id = 'pf-__local__-47452';
  let back = null; const relayBack = new Promise((r) => { back = r; });
  const relay = new Set([id]);   // its proxy is up at the relay (published before the restart)
  const w = world({ JM, PFM, rows: [ownedRow(Y.id, 47452)], boundMs: 100, relay, gates: {
    publish: (n, k) => (n !== id ? null : k === 1 ? new Promise(() => { }) : relayBack.then(() => sleep(60))),   // the replay's publish never answers; a later one answers just after the relay's take-down
    unpublish: (n, k) => (n === id && k === 1 ? relayBack : null),   // the pass's take-down hangs past its bound, then answers
  } });
  w.E.jobs.set(Y.id, { ...Y });
  await Promise.race([w.pf.restore(), sleep(2500)]);   // the replay (its publish unanswered), then the pass (its take-down late)
  const lateFirst = w.calls.filter((c) => c[0] === 'unpublish' && c[1] === id).length === 1 && w.pf.list().some((r) => r.id === id && !!r.publicUrl);
  const heal = w.pf._healSweep();   // the heal sweep inside the window
  await sleep(30); back();   // the relay recovers: the take-down answers, then (60 ms on) a publish sent meanwhile
  await heal; await sleep(120); await w.settle();
  const out = { lateFirst, publishes: w.calls.filter((c) => c[0] === 'publish' && c[1] === id).length, up: relay.has(id), row: w.pf.list().some((r) => r.id === id), calls: w.calls.slice() };
  w.end(); return out;
};
const f9 = await F9();
ok(f9.lateFirst && f9.publishes === 1 && !f9.up && !f9.row, 'F9: the take-down answered late — no publish of the heal sweep meanwhile, the address down at the relay, the row gone (the pass asked again)', f9);
const NOASK = '      const noAsk = !!(rec.publicUrl && asksNot(rec));\n';
const f9red1 = await F9({ PFM: loadPF(anchored(PSRC, NOASK, '      const noAsk = false;\n', 'heal-republishes'), 'heal-republishes') });
ok(f9red1.lateFirst && f9red1.publishes === 2 && f9red1.up, 'RED CONTROL F9: the heal sweep\'s question cut (in a copy) — it publishes the stopped service\'s row again and its address stands at the relay', f9red1);
const LATEASK = " p0.then(() => this.forwardsReconcile('a late unpublish answered'));";
const f9red2 = await F9({ JM: loadJM(anchored(JSRC, LATEASK, '', 'no-late-ask'), 'no-late-ask') });
ok(f9red2.lateFirst && f9red2.row, 'RED CONTROL F9: the pass not asked again (in a copy) — the stopped service\'s row stays after the late take-down', f9red2);

console.log('F10 a remove-with-stop whose stop did not happen says so; the Ports list never reads the job archive\'s file');
const STOPERR = 'the stop failed: its process group could not be signalled';
const F10a = async (JM) => {
  const w = world({ JM, portsHeld: true });
  const R = svc('jb-fwdrstf10', 47456); w.E.jobs.set(R.id, { ...R }); w.E._verifyAlive = () => true;   // its wrapper stands in as alive
  w.E.stop = () => ({ error: STOPERR });   // the stop road stands in: it FAILED (nothing is signalled)
  const r = w.E.rm(w.E.jobs.get(R.id), { stop: true });
  w.end(); return r;
};
const f10a = await F10a();
ok(f10a && f10a.error === STOPERR && !f10a.stopped, 'F10: a remove-with-stop whose stop failed answers the stop\'s own words — never «stopped, not removed»', f10a);
const STOPOK = 'const s = this.stop(job, { force: false }); if (s && s.error) return s; return { error: RM_PORTS_HELD_STOPPED';
const f10ared = await F10a(loadJM(anchored(JSRC, STOPOK, "const s = this.stop(job, { force: false }); if (s && s.code === 'hub-is-main') return s; return { error: RM_PORTS_HELD_STOPPED", 'stop-said'), 'stop-said'));
ok(f10ared && f10ared.stopped === true, 'RED CONTROL F10: the stop\'s own error read only for hub-is-main (in a copy, the follow\'s form) — the words say «stopped» when it was not', f10ared);
const F10b = async (JM) => {
  const w = world({ JM, rows: [ownedRow('jb-fwdgone10', 47455)] });
  w.E.archive = null;   // the archive not loaded yet
  const af = w.E.archiveFile; let reads = 0; const rf = fs.readFileSync;
  fs.readFileSync = function (q, ...a) { if (String(q) === af) reads++; return rf.call(this, q, ...a); };
  let gone; try { gone = (w.pf.list().find((r) => r.id === 'pf-__local__-47455') || {}).ownerGone; } finally { fs.readFileSync = rf; }
  w.end(); return { reads, gone };
};
const f10b = await F10b();
ok(f10b.reads === 0 && f10b.gone === false, 'F10: the Ports list with the archive not loaded reads no file — the owner unknown, never «gone»', f10b);
const ARCHGUARD = '    if (!this.archive) return null;   // r3660: the archive not loaded yet — never read here (the Ports broadcast asks this per row)\n';
const f10bred = await F10b(loadJM(anchored(JSRC, ARCHGUARD, '', 'archive-read'), 'archive-read'));
ok(f10bred.reads > 0, 'RED CONTROL F10: the guard cut (in a copy) — the Ports list reads the archive\'s file on the loop', f10bred);

report();
