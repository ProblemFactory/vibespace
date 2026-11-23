#!/usr/bin/env node
// THE JOBS ENGINE's FORWARDS OVER A HELD PORTS LIST (主开发 r3228, round whu7689zw on line 645 — the shape after the second round):
//   (a) OWNERSHIP IS WRITTEN ON THE ROW: the jobs engine makes, keeps, publishes, unpublishes and removes ONLY a row that says it is
//       that job's service (ownerJob); a row a person made carries none and is never touched; a row the release's engine wrote is
//       claimed once by its own label («service: <name>»).
//   (b) ONE RECONCILE from the facts as they are, AFTER the list's own replay settled (src/port-forward.js restore → src/jobs.js
//       forwardsReconcile), at every start once the list reads and after every lift — no mark kept through a hold.
//   (c) SAID WHERE IT IS READ: the agent's status line (data/bin/vibespace-job, the real CLI over the engine's real snapshot) and the
//       job card's note (src/lib/jobs-layout.js publishBlockedNote, drawn by src/lib/jobs-panel.js).
// Every scene runs the REAL store (a PLACED refusal of its read at its create) and the REAL engine, the relay stand-in recording
// every call in order. REDS in copies (scripts/mutant-copy.mjs, scripts/scratch.mjs anchored): the reconcile beside the replay; a
// removed service's row kept; a stopped service's row kept; the release's look-up by the port; a published row published again;
// the held line cut from the CLI; the held note cut from the card.
// Run: node scripts/test-job-forwards.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import './scratch.mjs';   // FIRST (B-ba47 B2)
import { checker } from './lib/check.mjs';   // the ONE assertion helper (the swap guard)
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { mutantCopies } = await import('./mutant-copy.mjs');
const { anchored } = await import('./scratch.mjs');
const MUT = mutantCopies('job-forwards', ROOT);
require('../src/server/owner-facts.js').configure({ setting: (k) => (k === 'instance.timezone' ? 'UTC' : undefined) });
const { JobManager } = require('../src/jobs.js');
const { PortForwardManager } = require('../src/port-forward.js');
const jobModel = require('../src/job-model.js');
const LS = require('../src/job-logs-sweep.js');   // the engine's own skeleton predicate
const { jobWhen } = require('../src/agent-routes.js');
const JSRC = read('src/jobs.js'), PSRC = read('src/port-forward.js');
const loadJM = (src, tag) => MUT.load('src/jobs.js', src, tag).JobManager;
const loadPF = (src, tag) => MUT.load('src/port-forward.js', src, tag).PortForwardManager;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HW = 'not published yet: the list of forwards could not be read; published by itself when it reads';
const owner = { conversation: { backend: 'claude', id: 'conv-F' }, sessionId: 'sess-F', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const svc = (id, port, more = {}) => ({ id, kind: 'service', name: id.replace(/^jb-/, ''), state: 'up', desiredUp: true, publish: true, ports: [port], owner, access: { view: 'session', control: 'session' }, runs: [], createdAt: Date.now(), ...more });
const ownedRow = (job, port) => ({ id: `pf-__local__-${port}`, hostId: '__local__', remotePort: port, label: 'service: ' + job.name, ownerJob: job.id, publicUrl: `https://was-${port}.relay.test/`, publicName: `pf-__local__-${port}`, publicSub: `was-${port}`, proto: 'http' });
const roots = [];
process.on('exit', () => { for (const d of roots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });

/** ONE SCENE: the list held at the start (its read refused), the boot's replay asked while held, `whileHeld` acts, the LIFT (the
 *  hold's own read again), then the replay and the reconcile settle. `restart`: the engine is dropped and made again before the lift. */
async function scene({ JM = JobManager, PFM = PortForwardManager, rows = [], jobs = [], held = true, whileHeld = async () => { }, restart = false, boundMs = 20000, hang = [], unpubDelayMs = 0 }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwd-')); roots.push(d);
  const pdir = path.join(d, 'pf'), edir = path.join(d, 'engine'); fs.mkdirSync(pdir, { recursive: true }); fs.mkdirSync(path.join(edir, 'bin'), { recursive: true });
  const file = path.join(pdir, 'port-forwards.json');
  fs.writeFileSync(file, JSON.stringify({ forwards: rows }, null, 2));
  const calls = [];
  const plugins = {
    async frpPublish(name, localPort, o) { calls.push(['publish', name]); if (hang.includes(name)) return new Promise(() => { }); return { name, subdomain: (o && o.preferSub) || 'fresh', proto: 'http', url: `https://${(o && o.preferSub) || name}.relay.test/` }; },
    async frpUnpublish(name) { calls.push(['unpublish', name]); if (unpubDelayMs) await sleep(unpubDelayMs); return { ok: true }; },
  };
  let eng = null;
  const mkPf = () => new PFM({ hosts: { list: () => [] }, dataDir: pdir, plugins, broadcast: () => { }, log: () => { }, getJobs: () => eng, relayBoundMs: boundMs });
  let pf = null;
  if (held) { const rf = fs.readFileSync; fs.readFileSync = function (q, ...a) { if (String(q) === file) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf.call(this, q, ...a); }; try { pf = mkPf(); } finally { fs.readFileSync = rf; } }
  else pf = mkPf();
  const mkE = () => { const E = new JM({ dataDir: edir, broadcast: () => { }, notifyUser: () => { }, log: () => { }, getPorts: () => pf, publishWaitMs: 30, publishRecheckMs: 60_000, deliverToConversation: async () => ({ ok: true }) }); E.init(); return E; };
  const stopE = (E) => { try { for (const t of E._timers || []) clearInterval(t); E.shutdown(); } catch { } };
  eng = mkE();
  for (const j of jobs) eng.jobs.set(j.id, { ...j });
  await Promise.race([pf.restore(), sleep(2500)]);   // the boot's replay (server.js +5.5 s): held ⇒ only asked (a copy whose replay never ends waits its bound)
  const facts = {};
  await whileHeld({ E: eng, pf, calls, facts });
  if (restart) { stopE(eng); eng = mkE(); }   // VibeSpace restarted while the list was held: the engine made again from jobs.json
  if (held && pf._hold && pf._hold.again) await pf._hold.again().catch(() => false);   // THE LIFT
  // the replay and the reconcile settle: no publish in flight and the relay quiet for 150 ms (a copy that never settles waits its bound, 2.5 s)
  const inFlight = () => [...eng.jobs.values()].some((j) => j._publish && j._publish.state === 'publishing');
  for (let t0 = Date.now(), last = -1, since = Date.now(); Date.now() - t0 < 2500;) { await sleep(25); if (calls.length !== last || inFlight()) { last = calls.length; since = Date.now(); } else if (Date.now() - since > 100) break; }
  const out = { replayed: !!pf._replayed, calls: calls.slice(), rows: pf.list().map((r) => ({ id: r.id, ownerJob: r.ownerJob, label: r.label, publicUrl: r.publicUrl, relayUnanswered: !!r.relayUnanswered })), names: Object.keys((pf._state && pf._state.names) || {}), jobs: {}, facts };
  for (const j of eng.jobs.values()) out.jobs[j.id] = { pfId: j._pfId || null, publishedUrl: j.publishedUrl || null, state: j.state };
  stopE(eng);
  try { clearInterval(pf._watch); if (pf._hold && pf._hold.stop) pf._hold.stop(); } catch { }
  for (const l of (pf._live && pf._live.values()) || []) { try { l.server && l.server.close(); } catch { } }
  return out;
}
const lastFor = (o, name) => { const c = o.calls.filter((x) => x[1] === name); return c.length ? c[c.length - 1][0] : null; };
/** a publish of that name AFTER its first unpublish: the replay's republish racing the reconcile's teardown */
const raced = (o, name) => { const c = o.calls.filter((x) => x[1] === name).map((x) => x[0]); const u = c.indexOf('unpublish'); return u >= 0 && c.slice(u + 1).includes('publish'); };
const countOf = (o, op, name) => o.calls.filter((x) => x[0] === op && x[1] === name).length;
const stopWhileHeld = async ({ E }, id) => { const j = E.jobs.get(id); j.state = 'down'; j.desiredUp = false; E._touch(j); await E._teardownPublish(j); };   // the stop road's own state change and teardown call

console.log('§1 a STOP while held, the replay asked while held (the race): after the lift the LAST relay call for its name is an unpublish');
const S1 = svc('jb-fwdstop01', 47411);
const race = (JM, PFM) => scene({ JM, PFM, rows: [ownedRow(S1, 47411)], jobs: [S1], whileHeld: (c) => stopWhileHeld(c, S1.id) });
const r1 = await race();
ok(lastFor(r1, 'pf-__local__-47411') === 'unpublish' && !raced(r1, 'pf-__local__-47411') && !r1.rows.length, `§1: the stopped service's address down, its row removed — the replay first, then the reconcile, never interleaved (${r1.calls.map((c) => c.join(' ')).join(' → ')})`, r1);
const REPLAYED_GATE = '  replayedOnce() { return !this._hold.held() && this._replayed; }\n', NO_GATE = '  replayedOnce() { return !this._hold.held(); }\n';
const REPLAY_TAIL = "    await this._jobsReconcile('the replay');   // r3228: after the replay settled — the jobs engine's ONE reconcile (at every start, after every lift)\n";
const noReplayAsk = anchored(PSRC, REPLAY_TAIL, '', 'no-replay-ask');
const r1red = await race(JobManager, loadPF(noReplayAsk, 'no-replay-ask'));
ok(lastFor(r1red, 'pf-__local__-47411') === 'publish' && r1red.rows.some((r) => r.id === 'pf-__local__-47411' && !!r.publicUrl), `RED CONTROL §1: the replay's own ask cut (in a copy) — no pass after the replay: the stopped service's address stays up (${r1red.calls.map((c) => c.join(' ')).join(' → ')})`, r1red);

console.log('§2 a REMOVAL while held is REFUSED by name (the stop is not); a row whose job the engine cannot name is KEPT (unknown keeps)');
const S2 = svc('jb-fwdgone01', 47412), RMH = "not removed: the list of forwards could not be read, so this service's public address could not be taken down — stop it now; remove it once the list of forwards reads";
const removal = (JM) => scene({ JM, rows: [ownedRow(S2, 47412)], jobs: [S2], whileHeld: async (c) => { c.facts.rm = c.E.rm(c.E.jobs.get(S2.id), { stop: true }); c.facts.still = c.E.jobs.has(S2.id); if (c.facts.still) await stopWhileHeld(c, S2.id); } });
const r2 = await removal();
ok(!!r2.facts.rm && r2.facts.rm.code === 'ports_unread' && r2.facts.rm.error === RMH && r2.facts.still === true && lastFor(r2, 'pf-__local__-47412') === 'unpublish' && !r2.rows.length && r2.names.includes('pf-__local__-47412'), `§2: rm of a service while held refused by name («${r2.facts.rm && r2.facts.rm.error}»), the record kept; the stop is not refused — at the lift its address down, its name KEPT for its next start`, r2);
const RM_GUARD = "    if (this._mayOwnForward(job) && this._portsHeld()) {\n";
const r2red = await removal(loadJM(anchored(JSRC, RM_GUARD, '    if (false) {\n', 'rm-while-held'), 'rm-while-held'));
ok(r2red.facts.still === false, 'RED CONTROL §2: the removal\'s refusal cut (in a copy) — the service leaves the records while its row cannot be closed', r2red.facts);
const S2b = svc('jb-fwdlost01', 47418);
const unknownScene = (JM) => scene({ JM, rows: [ownedRow(S2b, 47418)], jobs: [S2b], whileHeld: async (c) => { c.E.jobs.delete(S2b.id); } });   // a record the engine can no longer name
const r2b = await unknownScene();
ok(!r2b.calls.some((c) => c[0] === 'unpublish') && r2b.rows.some((r) => r.id === 'pf-__local__-47418' && !!r.publicUrl && r.ownerJob === S2b.id), '§2: a row whose job the engine cannot name is KEPT at the lift — its address and its name (removed is never inferred)', r2b);
const UNKNOWN_KEEPS = "      if (!job && !archived) { out.unknown.push(rec.id); continue; }   // UNKNOWN KEEPS — its address and its name\n";
const r2bred = await unknownScene(loadJM(anchored(JSRC, UNKNOWN_KEEPS, '', 'unknown-taken'), 'unknown-taken'));
ok(r2bred.calls.some((c) => c[0] === 'unpublish' && c[1] === 'pf-__local__-47418'), 'RED CONTROL §2: unknown keeps cut (in a copy) — the unnamed job\'s address is taken down', r2bred.calls);

console.log('§3 a RESTART while held (the engine dropped and made again): the stopped service\'s address goes at the lift');
const S3 = svc('jb-fwdrest01', 47413);
const restart = (JM) => scene({ JM, rows: [ownedRow(S3, 47413)], jobs: [S3], restart: true, whileHeld: (c) => stopWhileHeld(c, S3.id) });
const r3 = await restart();
ok(lastFor(r3, 'pf-__local__-47413') === 'unpublish' && !r3.rows.length && !!r3.jobs[S3.id] && r3.jobs[S3.id].state === 'down', `§3: no mark carried through the hold — the engine made again reads the service down, and the reconcile takes its address down (${r3.calls.map((c) => c.join(' ')).join(' → ')})`, r3);
const DOWN_RULE = '      // a job it KNOWS that no longer asks (live or archived): the address down — its name KEPT for its next start — the row removed\n';
const r3red = await restart(loadJM(anchored(JSRC, DOWN_RULE, '      if (job) continue;\n' + DOWN_RULE, 'stopped-kept'), 'stopped-kept'));
ok(lastFor(r3red, 'pf-__local__-47413') === 'publish' && r3red.rows.some((r) => r.id === 'pf-__local__-47413' && r.publicUrl), 'RED CONTROL §3: a stopped service\'s row kept (in a copy) — after the restart its address stays up', r3red);

console.log('§4 a PERSON\'s forward of the port an agent\'s service uses: the service\'s stop never touches it (publish or not)');
const P4 = 47414, person = { id: `pf-__local__-${P4}`, hostId: '__local__', remotePort: P4, label: 'my demo', publicUrl: 'https://demo.relay.test/', publicName: `pf-__local__-${P4}`, publicSub: 'demo', proto: 'http', pathMount: 'demo' };
const personScene = (JM, publish) => {
  const A = svc(publish ? 'jb-fwdpubl01' : 'jb-fwdnopb01', P4, { publish });
  return scene({ JM, held: false, rows: [person], jobs: [A], whileHeld: async (c) => {
    if (publish) { await c.E._ensurePublish(c.E.jobs.get(A.id)); c.facts.snap = c.E.snapshot(c.E.jobs.get(A.id)); }
    await stopWhileHeld(c, A.id);
  } });
};
const r4a = await personScene(JobManager, false), r4b = await personScene(JobManager, true);
const personKept = (o) => o.rows.some((r) => r.id === person.id && r.publicUrl === person.publicUrl && !r.ownerJob && r.label === 'my demo') && !o.calls.some((c) => c[0] === 'unpublish' && c[1] === person.id);
ok(personKept(r4a), '§4: a service that does not publish stops — the person\'s row, its address and its path mount stay', r4a);
ok(personKept(r4b) && !!r4b.facts.snap && r4b.facts.snap.publishState === 'refused' && /forwarded in the Ports panel by hand/.test(String(r4b.facts.snap.publishError || '')), `§4: a service that asks to publish on that port is REFUSED by name (never takes the person\'s row: «${r4b.facts.snap && r4b.facts.snap.publishError}») and its stop leaves the row`, r4b);
const TD_FIND = 'rows.find((r) => r.ownerJob === job.id)', ISF_TAIL = '    return false;   // r3228: never found by a port alone (a row with no owner is a person\'s, or the release\'s until the reconcile claims it)\n';
const byPort = anchored(anchored(JSRC, TD_FIND, 'rows.find((r) => this._isJobForward(job, r))', 'by-port'), ISF_TAIL, "    return rec.hostId === '__local__' && !rec.targetHost && Number(rec.remotePort) === Number((job.ports || [])[0]);\n", 'by-port');
const r4red = await personScene(loadJM(byPort, 'by-port'), false);
ok(!personKept(r4red), 'RED CONTROL §4: the release\'s look-up by the port (in a copy, the cure\'s first form) — a service that never published takes the person\'s forward and its address down', r4red);

console.log('§4b a row of a job that no longer asks for it is the next service\'s on that port; a job still up keeps its own');
{
  const reownScene = async (ownerUp) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwd-reown-')); roots.push(d);
    const pdir = path.join(d, 'pf'), edir = path.join(d, 'engine'); fs.mkdirSync(pdir, { recursive: true }); fs.mkdirSync(path.join(edir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(pdir, 'port-forwards.json'), JSON.stringify({ forwards: [{ id: 'pf-__local__-47417', hostId: '__local__', remotePort: 47417, label: 'service: fwdold001', ownerJob: 'jb-fwdold001' }] }));
    const calls = [], plugins = { async frpPublish(name) { calls.push(['publish', name]); return { name, subdomain: 'r', proto: 'http', url: `https://${name}.relay.test/` }; }, async frpUnpublish(name) { calls.push(['unpublish', name]); return { ok: true }; } };
    let eng = null;
    const pf = new PortForwardManager({ hosts: { list: () => [] }, dataDir: pdir, plugins, broadcast: () => { }, log: () => { }, getJobs: () => eng });
    const E = new JobManager({ dataDir: edir, broadcast: () => { }, notifyUser: () => { }, log: () => { }, getPorts: () => pf, publishWaitMs: 30, publishRecheckMs: 60_000, deliverToConversation: async () => ({ ok: true }) }); E.init(); eng = E;
    if (ownerUp) E.jobs.set('jb-fwdold001', svc('jb-fwdold001', 47417));
    const N = svc('jb-fwdnew001', 47417); E.jobs.set(N.id, { ...N });
    await E._ensurePublish(E.jobs.get(N.id));
    const row = pf.list().find((r) => r.id === 'pf-__local__-47417') || {};
    const snap = E.snapshot(E.jobs.get(N.id));
    try { for (const t of E._timers || []) clearInterval(t); E.shutdown(); } catch { }
    try { clearInterval(pf._watch); if (pf._hold && pf._hold.stop) pf._hold.stop(); } catch { }
    return { owner: row.ownerJob || null, published: countOf({ calls }, 'publish', 'pf-__local__-47417'), state: snap.publishState, refusal: snap.publishRefusal || null, snap };
  };
  const gone = await reownScene(false), up = await reownScene(true);
  ok(gone.owner === 'jb-fwdnew001' && gone.published === 1, '§4b: the row of a job no longer here is taken by the service now on that port, and published once', gone);
  ok(up.owner === 'jb-fwdold001' && up.published === 0 && up.state === 'refused' && up.refusal === 'another-service', '§4b: the row of a job still up and asking is never taken — the second service is refused by name (another service\'s, not «by hand»)', { owner: up.owner, published: up.published, state: up.state, refusal: up.refusal });
  globalThis.__fwdOwnedSnap = up.snap;
}

console.log('§5 started with publish WHILE HELD + a published service the release adopted: each published ONCE at the lift, never twice');
const A5 = svc('jb-fwdadop01', 47415, { publishedUrl: 'https://was-47415.relay.test/', lastPublicUrl: 'https://was-47415.relay.test/' }), B5 = svc('jb-fwdheld01', 47416);
const legacy = { ...ownedRow(A5, 47415) }; delete legacy.ownerJob;   // the release's row: no owner yet, its own label
const once = (JM) => scene({ JM, rows: [legacy], jobs: [A5, B5], whileHeld: async (c) => { await c.E._ensurePublish(c.E.jobs.get(B5.id)); const j = c.E.jobs.get(B5.id); c.facts.snap = jobWhen({ ...jobModel.agentJobView(c.E.snapshot(j, { tail: 5 }), { mine: true }), mine: true, mySubscription: null }); c.facts.web = c.E.snapshot(j); } });
const r5 = await once();
ok(countOf(r5, 'publish', 'pf-__local__-47415') === 1 && countOf(r5, 'publish', 'pf-__local__-47416') === 1, `§5: the adopted one republished by the replay alone, the one started while held published once by the reconcile (${r5.calls.map((c) => c.join(' ')).join(' → ')})`, r5.calls);
ok(!!r5.jobs[A5.id] && !!r5.jobs[B5.id] && r5.jobs[A5.id].pfId === 'pf-__local__-47415' && r5.jobs[B5.id].pfId === 'pf-__local__-47416' && (r5.rows.find((r) => r.id === 'pf-__local__-47415') || {}).ownerJob === A5.id && (r5.rows.find((r) => r.id === 'pf-__local__-47416') || {}).ownerJob === B5.id, '§5: both jobs know their ids; the release\'s row is CLAIMED by its own label (its owner written), the new row written as its job\'s', { jobs: r5.jobs, rows: r5.rows });
const KEPT_LINE = "        if (rec.publicUrl) { if (job.publishedUrl !== rec.publicUrl) { job._publish = null; this._publishOutcome(job, { ok: true, url: rec.publicUrl }); this._touch(job); } out.kept.push(rec.id); }\n";
const r5red = await once(loadJM(anchored(JSRC, KEPT_LINE, '        if (false) { }\n', 'published-again'), 'published-again'));
ok(countOf(r5red, 'publish', 'pf-__local__-47415') >= 2, `RED CONTROL §5: a published row published again (in a copy, the cure\'s first lift) — two publishes of one name (${countOf(r5red, 'publish', 'pf-__local__-47415')})`, r5red.calls);

console.log('§6 SAID WHERE IT IS READ: the agent\'s status line (the real CLI) and the job card\'s note');
const snapHeld = r5.facts.snap, webHeld = r5.facts.web, snapRefused = r4b.facts.snap;
ok(!!snapHeld && snapHeld.publishState === 'held' && snapHeld.publishError === HW && !!webHeld && webHeld.publishState === 'held', '§6: the engine\'s snapshot of a service started while held: publishState held, its words', { snapHeld: snapHeld && { s: snapHeld.publishState, e: snapHeld.publishError } });
const cliOver = async (cliPath, snap) => {
  const api = http.createServer((q, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(q.url.startsWith('/api/agent/jobs/') ? { success: true, job: snap } : { success: true, jobs: [snap] })); });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  const cli = (...a) => new Promise((res) => { const c = spawn(process.execPath, [cliPath, ...a], { env: { PATH: process.env.PATH, VIBESPACE_API: `http://127.0.0.1:${api.address().port}`, VIBESPACE_SESSION_TOKEN: 'vst_test' } }); let o = ''; c.stdout.on('data', (x) => { o += x; }); c.stderr.on('data', (x) => { o += x; }); c.on('close', () => res(o)); });
  try { return { show: await cli('show', snap.id), list: await cli('list') }; } finally { api.close(); }
};
const CLI = path.join(ROOT, 'data/bin/vibespace-job');
const said = await cliOver(CLI, snapHeld);
ok(said.show.includes(`public URL: ${HW}`) && !/none while up/.test(said.show), `§6: vibespace-job show says it — «public URL: ${HW}»`, said.show.slice(0, 600));
ok(said.list.includes('not published yet (the list of forwards is unread)') && !/publishing…/.test(said.list), '§6: vibespace-job list says it (never «publishing…»)', said.list.slice(0, 400));
const saidRef = await cliOver(CLI, jobWhen({ ...jobModel.agentJobView(snapRefused, { mine: true }), mine: true, mySubscription: null }));
ok(/public URL: NOT published — port 47414 is already forwarded in the Ports panel by hand/.test(saidRef.show), '§6: the refusal over a person\'s row is said too', saidRef.show.slice(0, 600));
const CLISRC = read('data/bin/vibespace-job'), HELD_LINE = "  if (j.publishState === 'held') return `public URL: ${j.publishError || 'not published yet: the list of forwards could not be read; published by itself when it reads'}`;\n";
const saidRed = await cliOver(MUT.write('data/bin/vibespace-job', anchored(CLISRC, HELD_LINE, '', 'cli-held-cut'), 'cli-held-cut'), snapHeld);
ok(!saidRed.show.includes(HW) && /none while up/.test(saidRed.show), 'RED CONTROL §6: the CLI\'s held line cut (in a copy) — the status falls through to «none while up», the hold said nowhere', saidRed.show.slice(0, 400));
const tt = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? String(v[k]) : `{${k}}`));
const LAYOUT = await import(pathToFileURL(path.join(ROOT, 'src/lib/jobs-layout.js')).href);
const CARD_HELD = 'Not published yet: the list of forwards could not be read. It is published by itself when it reads.';
const CARD_REF = 'Not published: port {port} is already forwarded by hand in the Ports panel. Publish it there, or remove that forward and start the service again.';
ok(LAYOUT.publishBlockedNote(webHeld, tt) === CARD_HELD && LAYOUT.publishBlockedNote(snapRefused, tt) === tt(CARD_REF, { port: 47414 }) && LAYOUT.publishBlockedNote({ ...webHeld, publishedUrl: 'https://x.relay.test/' }, tt) === '', '§6: the card\'s note, drawn from the field the card reads (the engine\'s snapshot): held, refused, none once published', { held: LAYOUT.publishBlockedNote(webHeld, tt), refused: LAYOUT.publishBlockedNote(snapRefused, tt) });
const LSRC = read('src/lib/jobs-layout.js'), NOTE_HELD = `  if (j.publishState === 'held') return t('${CARD_HELD}');\n`;
const LRED = await import(pathToFileURL(MUT.write('src/lib/jobs-layout.js', anchored(LSRC, NOTE_HELD, '', 'card-held-cut'), 'card-held-cut', { esm: true })).href);
ok(LRED.publishBlockedNote(webHeld, tt) === '', 'RED CONTROL §6: the card\'s held note cut (in a copy) — the card says nothing of the hold');
const PANEL = read('src/lib/jobs-panel.js'), ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
ok(PANEL.split('  const pubNote = publishBlockedNote(j, t);').length === 2 && PANEL.split("    if (pubNote) { const pn = document.createElement('span'); pn.className = 'jobs-note'; pn.textContent = pubNote; l2.appendChild(pn); }").length === 2 && [CARD_HELD, CARD_REF].every((k) => ZH.includes(`  "${k}": "`) && JA.includes(`  "${k}": "`)), 'the card draws that note (src/lib/jobs-panel.js renderCard, compact too) and both sentences are in zh and ja');

console.log('§7 the wiring the reconcile rides: server.js hands the jobs to the forwards\' manager; the routes answer the store\'s 503');
const SRV = read('server.js'), i0 = SRV.indexOf('const portForwards = new PortForwardManager({'), i1 = i0 >= 0 ? SRV.indexOf('});', i0) : -1;
const ctor = i0 >= 0 && i1 > i0 ? SRV.slice(i0, i1) : '';
ok(ctor.includes('getJobs: jobsWiring.getJobs,'), 'server.js builds the forwards\' manager WITH the jobs engine (getJobs: jobsWiring.getJobs) — without it no reconcile runs', ctor.slice(0, 200));
const r0 = SRV.indexOf("app.post('/api/hosts/:id/port-forward'"), r9 = SRV.indexOf('killOrphan', r0), routes = r0 >= 0 && r9 > r0 ? SRV.slice(r0, r9) : '';
ok(!!routes && !routes.includes('res.status(400).json({ error: e.message })') && (routes.match(/res\.status\(e\.status \|\| 400\)\.json\(\{ error: e\.message, \.\.\.\(e\.code \? \{ code: e\.code \} : \{\}\) \}\)/g) || []).length >= 7, 'every port-forward route answers the store\'s own status and code (503 ports_unread while held — never a 400)');

console.log('§8 THE READER TABLE\'s empty states (主开发 r3230): the machine dialog, the artifact cards, the new-port watcher while held');
// (a) the machine dialog (src/lib/sidebar-mounts.js, a page): the list held or torn is said there in the Ports panel's own sentences
{
  const SM = read('src/lib/sidebar-mounts.js'), RAIL = read('src/lib/sidebar-rail.js');
  const held = /tr\('(VibeSpace could not read its list of port forwards;[^']*)'\)/.exec(RAIL), torn = /tr\('(The list of port forwards was damaged;[^']*)'/.exec(RAIL);
  ok(!!held && !!torn && SM.includes("fwHeld = fr.held || null; fwTorn = fr.torn || null;") && SM.includes(`if (fwHeld) body.innerHTML += \`<p class="empty-hint" style="margin:0 0 8px">\${escHtml(tr('${held && held[1]}'))}</p>\`;`) && SM.includes(`tr('${torn && torn[1]}', { name: fwTorn })`), 'the machine dialog reads the list\'s held / torn fields and says them in the Ports panel\'s own sentences (never an empty «Active» as if none)');
}
// (b) the artifact cards (src/server/artifact-registry.js noteForwards): an UNREAD list re-feeds no link — judged by whether it asks
// for the jobs at all (the cards are fed from them)
{
  const runNote = (REG) => { let asked = 0; REG.configure({ jobs: () => { asked++; return { jobs: new Map() }; }, ports: () => null, activeSessions: () => new Map(), log: { warn() { } } }); REG.noteForwards({ type: 'port-forwards-updated', forwards: [], held: 'port-forwards.json … could not be read' }); return asked; };
  const ARS = read('src/server/artifact-registry.js'), HELDNOTE = "  if (msg.held) return 0;   // r3228: port-forwards.json held — an UNREAD list says nothing of a link: the live cards keep the one they have\n";
  const a0 = runNote(require('../src/server/artifact-registry.js')), a1 = runNote(MUT.load('src/server/artifact-registry.js', anchored(ARS, HELDNOTE, '', 'cards-fed-held'), 'cards-fed-held'));
  ok(a0 === 0, `a held list's broadcast re-feeds no service card (the jobs asked ${a0} times): the cards keep the link they had — the relay still serves it`);
  ok(a1 >= 1, `RED CONTROL §8: the held line cut (in a copy) — the unread list re-feeds the cards (the jobs asked ${a1} times: each published card would lose its public link)`);
}
// (c) the new-port watcher (src/port-forward.js _watchSweep): held ⇒ no port is «new» (which are forwarded is unknown)
{
  const sweep = async (PFM) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwd-watch-')); roots.push(d);
    const file = path.join(d, 'port-forwards.json'); fs.writeFileSync(file, JSON.stringify({ forwards: [] }));
    const rf = fs.readFileSync; fs.readFileSync = function (q, ...a) { if (String(q) === file) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf.call(this, q, ...a); };
    let pw = null; try { pw = new PFM({ hosts: { list: () => [] }, dataDir: d, broadcast: () => { }, log: () => { } }); } finally { fs.readFileSync = rf; }
    clearInterval(pw._watch);
    let detects = 0; pw.detect = async () => { detects++; return []; };
    await pw._watchSweep();
    if (pw._hold && pw._hold.stop) pw._hold.stop();
    return detects;
  };
  const WATCH = "    if (this._hold.held()) return;   // r3228: held — which ports are forwarded is unknown: no port is «new» until the list reads\n";
  const w0 = await sweep(PortForwardManager), w1 = await sweep(loadPF(anchored(PSRC, WATCH, '', 'watch-held'), 'watch-held'));
  ok(w0 === 0, `while held the new-port watcher scans nothing (${w0} scans): no forwarded port toasts as «new»`);
  ok(w1 >= 1, `RED CONTROL §8: the watcher's held line cut (in a copy) — it scans (${w1}) and compares against an unread list`);
}

/** A START WITH ITS OWN ORDER: jobs.json as given (`jobsFile`: records, `'held'` — a placed read refusal at the engine's init, or a
 *  string of torn bytes), the Ports list readable; `portsFirst`: the Ports manager built and restored BEFORE the engine's init (a real
 *  start's order); `liftJobs`: the jobs list's own read again after the replay. The relay stand-in records every call. */
async function startScene({ JM = JobManager, PFM = PortForwardManager, rows = [], jobsFile = [], portsFirst = false, liftJobs = false, logIds = [], afterReplay = async () => { } }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwd-start-')); roots.push(d);
  const pdir = path.join(d, 'pf'), edir = path.join(d, 'engine'); fs.mkdirSync(pdir, { recursive: true }); fs.mkdirSync(path.join(edir, 'bin'), { recursive: true });
  for (const id of logIds) fs.mkdirSync(path.join(edir, 'job-logs', id), { recursive: true });
  fs.writeFileSync(path.join(pdir, 'port-forwards.json'), JSON.stringify({ forwards: rows }, null, 2));
  const jfile = path.join(edir, 'jobs.json');
  if (Array.isArray(jobsFile)) fs.writeFileSync(jfile, JSON.stringify(jobsFile)); else if (jobsFile === 'held') fs.writeFileSync(jfile, '[]'); else fs.writeFileSync(jfile, String(jobsFile));
  const calls = [], plugins = { async frpPublish(name, lp, o) { calls.push(['publish', name]); return { name, subdomain: (o && o.preferSub) || 'fresh', proto: 'http', url: `https://${(o && o.preferSub) || name}.relay.test/` }; }, async frpUnpublish(name) { calls.push(['unpublish', name]); return { ok: true }; } };
  let eng = null;
  const pf = new PFM({ hosts: { list: () => [] }, dataDir: pdir, plugins, broadcast: () => { }, log: () => { }, getJobs: () => eng });
  const E = new JM({ dataDir: edir, broadcast: () => { }, notifyUser: () => { }, log: () => { }, getPorts: () => pf, publishWaitMs: 30, publishRecheckMs: 60_000, deliverToConversation: async () => ({ ok: true }) });
  E._verifyAlive = () => true;   // the adopted services' wrappers stand in as alive (no process is started by the adoption)
  if (jobsFile === 'held') fs.writeFileSync(jfile, JSON.stringify(rows.length ? startScene.heldJobs || [] : []));
  const initE = () => {
    if (jobsFile !== 'held') { E.init(); return; }
    const rf = fs.readFileSync; fs.readFileSync = function (q, ...a) { if (String(q) === jfile) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf.call(this, q, ...a); };
    try { E.init(); } finally { fs.readFileSync = rf; }
  };
  const settle = async () => { for (let t0 = Date.now(), last = -1, since = Date.now(); Date.now() - t0 < 2500;) { await sleep(25); const fl = [...E.jobs.values()].some((j) => j._publish && j._publish.state === 'publishing'); if (calls.length !== last || fl) { last = calls.length; since = Date.now(); } else if (Date.now() - since > 100) break; } };
  const snap = () => ({ calls: calls.slice(), rows: pf.list().map((r) => ({ id: r.id, ownerJob: r.ownerJob, publicUrl: r.publicUrl })), names: Object.keys((pf._state && pf._state.names) || {}), held: E._recordsHeld(), skeletons: [...E.jobs.values()].filter((j) => LS.isSkeleton(j)).map((j) => j.id), jobs: Object.fromEntries([...E.jobs.values()].map((j) => [j.id, { pfId: j._pfId || null, state: j.state }])) });
  if (!portsFirst) { initE(); eng = E; }
  else eng = E;   // the manager reaches the engine from its first moment (server.js getJobs) — the engine NOT ready yet
  await pf.restore(); await settle();
  await afterReplay({ E, pf, calls });
  const atReplay = snap();
  if (portsFirst) { initE(); await settle(); }
  if (liftJobs) { await E._unreadRetry('store').catch(() => { }); await settle(); }
  const after = snap();
  try { for (const t of E._timers || []) clearInterval(t); E.shutdown(); } catch { }
  try { clearInterval(pf._watch); if (pf._hold && pf._hold.stop) pf._hold.stop(); } catch { }
  return { atReplay, after };
}
const GATE = "    if (!this.ready || this.readOnly) return null;   // r3287 (d): this engine not ready / read-only\n", GATE_HELD = "    if (this._recordsHeld()) return null;   // r3287 (a): its records held — their lift asks\n";
const guardsCut = (src) => anchored(anchored(anchored(src, GATE, '', 'r3228-form'), GATE_HELD, '', 'r3228-form'), UNKNOWN_KEEPS, '', 'r3228-form');   // the r3228 form: no gate, no unknown keeps

console.log('§9 MUST 1: the jobs list HELD at a start (a placed refusal of its read), the Ports list readable with a published job row');
const A9 = svc('jb-fwdheld09', 47421, { publishedUrl: 'https://was-47421.relay.test/', lastPublicUrl: 'https://was-47421.relay.test/' });
startScene.heldJobs = [A9];
const heldStart = (JM) => startScene({ JM, rows: [ownedRow(A9, 47421)], jobsFile: 'held', liftJobs: true });
const h9 = await heldStart();
ok(h9.atReplay.held === true && !h9.atReplay.calls.some((c) => c[0] === 'unpublish') && h9.atReplay.rows.some((r) => r.id === 'pf-__local__-47421' && !!r.publicUrl) && h9.atReplay.names.length === 0, '§9: while the job records are held the replay\'s pass does NOTHING — no unpublish, the row and its address kept', h9.atReplay);
ok(h9.after.held === false && countOf(h9.after, 'publish', 'pf-__local__-47421') === 1 && !h9.after.calls.some((c) => c[0] === 'unpublish') && !!h9.after.jobs[A9.id] && h9.after.jobs[A9.id].pfId === 'pf-__local__-47421', '§9: the records\' lift runs the ONE pass — the service knows its row, published once (the replay\'s), nothing taken down', h9.after);
const h9red = await heldStart(loadJM(guardsCut(JSRC), 'r3228-form'));
ok(h9red.atReplay.calls.some((c) => c[0] === 'unpublish' && c[1] === 'pf-__local__-47421'), 'RED CONTROL §9: the guards cut (the r3228 form, in a copy) — the held list\'s silence takes the address down', h9red.atReplay.calls);
const LIFT_ASK = "      if (!this._recordsHeld()) this.forwardsReconcile('the job records read again');   // r3287: the records' lift asks too\n";
const h9red2 = await heldStart(loadJM(anchored(JSRC, LIFT_ASK, '', 'no-lift-ask'), 'no-lift-ask'));
ok(!!h9red2.after.jobs[A9.id] && !h9red2.after.jobs[A9.id].pfId, 'RED CONTROL §9: the records\' lift not asking (in a copy) — the adopted service never learns its row (a later stop would leave its address up)', h9red2.after.jobs);

console.log('§10 MUST 2: a REAL START\'s order — the Ports manager built and replayed BEFORE the jobs engine\'s init');
const A10 = svc('jb-fwdboot10', 47422, { publishedUrl: 'https://was-47422.relay.test/', lastPublicUrl: 'https://was-47422.relay.test/' }), B10 = svc('jb-fwdboot11', 47423);
const portsFirst = (JM) => startScene({ JM, rows: [ownedRow(A10, 47422)], jobsFile: [A10, B10], portsFirst: true });
const r10 = await portsFirst();
ok(!r10.atReplay.calls.some((c) => c[0] === 'unpublish') && r10.atReplay.rows.some((r) => r.id === 'pf-__local__-47422' && !!r.publicUrl), '§10: the replay\'s pass before the engine is ready does nothing — the row and its address kept', r10.atReplay);
ok(!r10.after.calls.some((c) => c[0] === 'unpublish') && countOf(r10.after, 'publish', 'pf-__local__-47422') === 1 && countOf(r10.after, 'publish', 'pf-__local__-47423') === 1 && r10.after.jobs[A10.id].pfId === 'pf-__local__-47422' && r10.after.jobs[B10.id].pfId === 'pf-__local__-47423', '§10: the init\'s own ask runs the ONE pass — each service published once (the row\'s by the replay, the other by the pass), both know their rows', r10.after);
const r10red = await portsFirst(loadJM(guardsCut(JSRC), 'r3228-form-boot'));
ok(r10red.atReplay.calls.some((c) => c[0] === 'unpublish' && c[1] === 'pf-__local__-47422'), 'RED CONTROL §10: the guards cut (the r3228 form, in a copy) — at a plain restart the empty engine takes the address down', r10red.atReplay.calls);
const INIT_ASK = "      this.forwardsReconcile('the jobs start');   // r3287: this engine has read and adopted — whichever list settles last runs the ONE pass\n";
const r10red2 = await portsFirst(loadJM(anchored(JSRC, INIT_ASK, '', 'no-init-ask'), 'no-init-ask'));
ok(countOf(r10red2.after, 'publish', 'pf-__local__-47423') === 0, 'RED CONTROL §10: the init not asking (in a copy) — the service with no row is never published after the restart', r10red2.after.calls);

console.log('§11 HOLD 1: a relay that never answers ONE row — the replay ENDS (each call bounded), the pass runs for the others');
const X11 = svc('jb-fwdhang11', 47424), Y11 = svc('jb-fwdhang12', 47425, { state: 'down', desiredUp: false });
const hangScene = (PFM) => scene({ PFM, held: false, boundMs: 200, hang: ['pf-__local__-47424'], rows: [ownedRow(X11, 47424), ownedRow(Y11, 47425)], jobs: [X11, Y11] });
const r11 = await hangScene();
ok(r11.replayed && lastFor(r11, 'pf-__local__-47425') === 'unpublish' && !r11.rows.some((r) => r.id === 'pf-__local__-47425') && !r11.calls.some((c) => c[0] === 'unpublish' && c[1] === 'pf-__local__-47424') && r11.rows.some((r) => r.id === 'pf-__local__-47424' && !!r.publicUrl && r.relayUnanswered), '§11: the unanswered row left as it is (marked, its address untouched), the replay ended, the stopped service\'s address taken down', r11);
const BOUND_LINE = "    let t = null; const LATE = Symbol('late');\n";
const r11red = await hangScene(loadPF(anchored(PSRC, BOUND_LINE, '    return await p;\n', 'no-bound'), 'no-bound'));
ok(!r11red.replayed && !r11red.calls.some((c) => c[0] === 'unpublish'), 'RED CONTROL §11: the bound cut (in a copy) — the replay never ends and no pass runs: the stopped service\'s address stays up', { replayed: r11red.replayed, calls: r11red.calls });

console.log('§12 HOLD 2: a TORN jobs list set aside (skeletons) — a row whose owner is only a skeleton is KEPT; the person\'s own door ends it');
const SK = 'jb-fwdskel12', skRow = { ...ownedRow({ id: SK, name: 'skel' }, 47426) };
const tornScene = (JM) => startScene({ JM, rows: [skRow], jobsFile: '[{"id": "jb-fwdskel12", "kind": "serv', logIds: [SK], afterReplay: async ({ pf, calls }) => { tornScene.before = calls.slice(); tornScene.rowBefore = pf.list().find((r) => r.id === skRow.id) || null; await pf.unforward(skRow.id); } });
const r12 = await tornScene();
const kept12 = tornScene.before, row12 = tornScene.rowBefore;
ok(r12.atReplay.held === false && r12.atReplay.skeletons.includes(SK) && !kept12.some((c) => c[0] === 'unpublish') && !!row12 && !!row12.publicUrl, '§12: the torn list\'s skeleton names no job — its row is KEPT with its address and its name (unknown keeps)', { kept12, row12, skeletons: r12.atReplay.skeletons, held: r12.atReplay.held });
ok(r12.atReplay.calls.some((c) => c[0] === 'unpublish' && c[1] === skRow.id) && !r12.atReplay.rows.some((r) => r.id === skRow.id), '§12: its END is the person\'s own door in the Ports panel — unforward (DELETE /api/port-forward/:id) takes the job-owned row and its address down: no «not yours»', r12.atReplay);
const SKEL_LINE = '      const job = live && !LS.isSkeleton(live) ? live : null;\n';
const r12red = await tornScene(loadJM(anchored(JSRC, SKEL_LINE, '      const job = live || null;\n', 'skeleton-known'), 'skeleton-known'));
ok(tornScene.before.some((c) => c[0] === 'unpublish' && c[1] === skRow.id), 'RED CONTROL §12: a skeleton taken for a job (in a copy) — the torn list takes the address down', tornScene.before);
const SRV12 = read('server.js');
ok(/app\.delete\('\/api\/port-forward\/:id'[\s\S]{0,200}portForwards\.unforward\(String\(req\.params\.id\)\)/.test(SRV12) && !/ownerJob/.test(SRV12.slice(SRV12.indexOf("app.delete('/api/port-forward/:id'"), SRV12.indexOf("app.delete('/api/port-forward/:id'") + 300)), 'the person\'s door (DELETE /api/port-forward/:id) asks no owner of the row');

console.log('§13 HOLD 3 + the shoulds\' words: the card says the removal\'s refusal and the other service\'s row in the reader\'s language');
{
  const RMW = "Not removed: the list of forwards could not be read, so this service's public address could not be taken down. Stop it now; remove it once the list of forwards reads.";
  const OWNED = 'Not published: port {port} is forwarded for another service that is still running. Stop that one, or give this service another port.';
  const P13 = read('src/lib/jobs-panel.js'), Z13 = read('src/lib/i18n-zh.js'), J13 = read('src/lib/i18n-ja.js');
  ok(P13.includes(`if (r?.error && r.code === 'ports_unread' && act === 'rm') r.error = r.stopped ? t("`) && P13.includes(`: t("${RMW}");`) && [RMW, OWNED].every((k) => Z13.includes(`  "${k}": "`) && J13.includes(`  "${k}": "`)), 'the card\'s remove press shows the removal\'s refusal in words (never a bare code), zh and ja carry both sentences');
  const ownedSnap = globalThis.__fwdOwnedSnap;
  ok(!!ownedSnap && LAYOUT.publishBlockedNote(ownedSnap, tt) === tt(OWNED, { port: 47417 }), 'should 1: a row of ANOTHER live service — the card names that, never «by hand»', ownedSnap && { state: ownedSnap.publishState, refusal: ownedSnap.publishRefusal });
}

console.log('§14 should 6: a Ports lift BEFORE the boot\'s replay was asked runs no pass — the replay, when it runs, ends with it');
const S14 = svc('jb-fwdearly4', 47427, { state: 'down', desiredUp: false });
const earlyLift = async (PFM) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwd-early-')); roots.push(d);
  const pdir = path.join(d, 'pf'), edir = path.join(d, 'engine'); fs.mkdirSync(pdir, { recursive: true }); fs.mkdirSync(path.join(edir, 'bin'), { recursive: true });
  const file = path.join(pdir, 'port-forwards.json'); fs.writeFileSync(file, JSON.stringify({ forwards: [ownedRow(S14, 47427)] }));
  const calls = [], plugins = { async frpPublish(name) { calls.push(['publish', name]); return { name, subdomain: 's', proto: 'http', url: `https://${name}.relay.test/` }; }, async frpUnpublish(name) { calls.push(['unpublish', name]); return { ok: true }; } };
  let eng = null, pf = null;
  const rf = fs.readFileSync; fs.readFileSync = function (q, ...a) { if (String(q) === file) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf.call(this, q, ...a); };
  try { pf = new PFM({ hosts: { list: () => [] }, dataDir: pdir, plugins, broadcast: () => { }, log: () => { }, getJobs: () => eng }); } finally { fs.readFileSync = rf; }
  const E = new JobManager({ dataDir: edir, broadcast: () => { }, notifyUser: () => { }, log: () => { }, getPorts: () => pf, publishWaitMs: 30, publishRecheckMs: 60_000, deliverToConversation: async () => ({ ok: true }) }); E.init(); eng = E;
  E.jobs.set(S14.id, { ...S14 });
  await pf._hold.again().catch(() => false); await sleep(150);   // THE LIFT — the boot's replay not asked yet
  const atLift = calls.slice();
  await pf.restore(); await sleep(150);
  const out = { atLift, after: calls.slice(), rows: pf.list().map((r) => r.id) };
  try { for (const t of E._timers || []) clearInterval(t); E.shutdown(); } catch { }
  try { clearInterval(pf._watch); if (pf._hold && pf._hold.stop) pf._hold.stop(); } catch { }
  return out;
};
const r14 = await earlyLift(PortForwardManager);
ok(r14.atLift.length === 0 && lastFor({ calls: r14.after }, 'pf-__local__-47427') === 'unpublish' && !r14.rows.length, '§14: nothing at that lift; the replay then the ONE pass (the stopped service\'s address down)', r14);
const EARLY = "    else if (this._replayed) this._jobsReconcile('the lift').catch(() => {});\n";
const r14red = await earlyLift(loadPF(anchored(anchored(PSRC, EARLY, "    else this._jobsReconcile('the lift').catch(() => {});\n", 'early-lift'), REPLAYED_GATE, NO_GATE, 'early-lift'), 'early-lift'));
ok(r14red.atLift.some((c) => c[0] === 'unpublish'), 'RED CONTROL §14: the replayed gate cut (in a copy) — the pass runs at the lift, before the replay', r14red.atLift);

console.log('§15 the shoulds: the claim in both spellings; a start in the pass\'s own window; the refused state after a restart');
{
  const TOK = 'ghp_' + Array.from({ length: 36 }, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789'[(i * 7 + 3) % 36]).join('');   // built at run time
  const R15 = svc('jb-fwdrawn15', 47429, { name: 'deploy-' + TOK });
  const rawRow = { id: 'pf-__local__-47429', hostId: '__local__', remotePort: 47429, label: 'service: deploy-' + TOK, publicUrl: 'https://raw.relay.test/', publicName: 'pf-__local__-47429', publicSub: 'raw', proto: 'http' };
  const raw = (JM) => scene({ JM, held: false, rows: [rawRow], jobs: [R15] });
  const r15 = await raw();
  ok((r15.rows.find((r) => r.id === rawRow.id) || {}).ownerJob === R15.id && r15.jobs[R15.id].pfId === rawRow.id, 'should 2: a release row labelled with the job\'s RAW name (its belted label differs) is claimed as that job\'s', r15.rows);
  const RAW_FORM = "...(job && job.name ? ['service: ' + job.name] : [])";
  const r15red = await raw(loadJM(anchored(JSRC, RAW_FORM, '', 'raw-unclaimed'), 'raw-unclaimed'));
  ok(!(r15red.rows.find((r) => r.id === rawRow.id) || {}).ownerJob, 'RED CONTROL should 2: the raw spelling cut (in a copy) — the release row stays nobody\'s', r15red.rows);
  // a start during the pass's own await: a stopped service's unpublish waits, the person starts it meanwhile — its row is never unforwarded under it
  const S15 = svc('jb-fwdwind15', 47430, { state: 'down', desiredUp: false });
  const windowScene = (JM) => scene({ JM, held: false, unpubDelayMs: 300, rows: [ownedRow(S15, 47430)], jobs: [S15] });
  // the start is made by a hook on the scene's engine: the scene runs restore; this leg polls the engine through the relay's own record
  const runWin = async (JM) => {
    const r = await windowScene(JM && JM !== JobManager ? JM : class extends JobManager {
      async _forwardsPass(why) {
        const j = this.jobs.get(S15.id);
        if (why === 'the replay' && !this.__armed) { this.__armed = true; const t = setTimeout(() => { if (j) { j.state = 'up'; j.desiredUp = true; this._ensurePublish(j); } }, 120); t.unref?.(); }   // the person's start, mid-await of the pass's unpublish
        return super._forwardsPass(why);
      }
    });
    return r;
  };
  const r15w = await runWin();
  ok(r15w.rows.some((r) => r.id === 'pf-__local__-47430' && r.ownerJob === S15.id && !!r.publicUrl) && lastFor(r15w, 'pf-__local__-47430') === 'publish', 'should 3: a start in the pass\'s own window keeps its row and its fresh address (judged again after the await; an unpublish that waited never clears a newer publish)', r15w);
  // the refused state after a restart: derived from the persisted words, never «none while up»
  const E15 = new JobManager({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwd-snap-')), broadcast: () => { }, notifyUser: () => { }, log: () => { } });
  const j15 = { ...svc('jb-fwdsnap15', 47431), publishNotOwned: 'port 47431 is already forwarded in the Ports panel by hand', publishRefusal: 'by-hand' };
  const sn15 = E15.snapshot(j15);
  ok(sn15.publishState === 'refused' && sn15.publishRefusal === 'by-hand' && /by hand/.test(String(sn15.publishError)), 'should 4: the refused state is DERIVED from the persisted words after a restart (never «none while up»)', { s: sn15.publishState, r: sn15.publishRefusal });
}

report();
