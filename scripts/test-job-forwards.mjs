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
async function scene({ JM = JobManager, PFM = PortForwardManager, rows = [], jobs = [], held = true, whileHeld = async () => { }, restart = false }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-fwd-')); roots.push(d);
  const pdir = path.join(d, 'pf'), edir = path.join(d, 'engine'); fs.mkdirSync(pdir, { recursive: true }); fs.mkdirSync(path.join(edir, 'bin'), { recursive: true });
  const file = path.join(pdir, 'port-forwards.json');
  fs.writeFileSync(file, JSON.stringify({ forwards: rows }, null, 2));
  const calls = [];
  const plugins = {
    async frpPublish(name, localPort, o) { calls.push(['publish', name]); return { name, subdomain: (o && o.preferSub) || 'fresh', proto: 'http', url: `https://${(o && o.preferSub) || name}.relay.test/` }; },
    async frpUnpublish(name) { calls.push(['unpublish', name]); return { ok: true }; },
  };
  let eng = null;
  const mkPf = () => new PFM({ hosts: { list: () => [] }, dataDir: pdir, plugins, broadcast: () => { }, log: () => { }, getJobs: () => eng });
  let pf = null;
  if (held) { const rf = fs.readFileSync; fs.readFileSync = function (q, ...a) { if (String(q) === file) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf.call(this, q, ...a); }; try { pf = mkPf(); } finally { fs.readFileSync = rf; } }
  else pf = mkPf();
  const mkE = () => { const E = new JM({ dataDir: edir, broadcast: () => { }, notifyUser: () => { }, log: () => { }, getPorts: () => pf, publishWaitMs: 30, publishRecheckMs: 60_000, deliverToConversation: async () => ({ ok: true }) }); E.init(); return E; };
  const stopE = (E) => { try { for (const t of E._timers || []) clearInterval(t); E.shutdown(); } catch { } };
  eng = mkE();
  for (const j of jobs) eng.jobs.set(j.id, { ...j });
  await pf.restore();   // the boot's replay (server.js +5.5 s): held ⇒ only asked
  const facts = {};
  await whileHeld({ E: eng, pf, calls, facts });
  if (restart) { stopE(eng); eng = mkE(); }   // VibeSpace restarted while the list was held: the engine made again from jobs.json
  if (held && pf._hold && pf._hold.again) await pf._hold.again().catch(() => false);   // THE LIFT
  // the replay and the reconcile settle: no publish in flight and the relay quiet for 150 ms (a copy that never settles waits its bound, 2.5 s)
  const inFlight = () => [...eng.jobs.values()].some((j) => j._publish && j._publish.state === 'publishing');
  for (let t0 = Date.now(), last = -1, since = Date.now(); Date.now() - t0 < 2500;) { await sleep(25); if (calls.length !== last || inFlight()) { last = calls.length; since = Date.now(); } else if (Date.now() - since > 150) break; }
  const out = { calls: calls.slice(), rows: pf.list().map((r) => ({ id: r.id, ownerJob: r.ownerJob, label: r.label, publicUrl: r.publicUrl })), names: Object.keys((pf._state && pf._state.names) || {}), jobs: {}, facts };
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
const LIFT_SEQ = "    if (this._restoreAsked) { this._restoreAsked = false; this.restore().catch(() => {}); }   // restore() ends with the reconcile\n    else this._jobsReconcile('the lift').catch(() => {});\n";
const REPLAY_TAIL = "    await this._jobsReconcile('the replay');   // r3228: after the replay settled — the jobs engine's ONE reconcile (at every start, after every lift)\n";
const beside = anchored(anchored(PSRC, REPLAY_TAIL, '', 'reconcile-beside'), LIFT_SEQ, "    if (this._restoreAsked) { this._restoreAsked = false; this.restore().catch(() => {}); }\n    this._jobsReconcile('the lift').catch(() => {});\n", 'reconcile-beside');
const r1red = await race(JobManager, loadPF(beside, 'reconcile-beside'));
ok(raced(r1red, 'pf-__local__-47411'), `RED CONTROL §1: the reconcile BESIDE the replay (in a copy, the cure's first order) — the replay's republish lands after the reconcile's unpublish (${r1red.calls.map((c) => c.join(' ')).join(' → ')}): the race the round named`, r1red);

console.log('§2 a REMOVAL while held: the row goes and its name with it');
const S2 = svc('jb-fwdgone01', 47412);
const removal = (JM) => scene({ JM, rows: [ownedRow(S2, 47412)], jobs: [S2], whileHeld: async (c) => { await stopWhileHeld(c, S2.id); c.E.jobs.delete(S2.id); } });
const r2 = await removal();
ok(lastFor(r2, 'pf-__local__-47412') === 'unpublish' && !r2.rows.length && !r2.names.includes('pf-__local__-47412'), `§2: removed while held — at the lift its address down, its row and its kept name gone (${r2.calls.map((c) => c.join(' ')).join(' → ')})`, r2);
const ROW_JOB = '      const job = this.jobs.get(rec.ownerJob);\n';
const r2red = await removal(loadJM(anchored(JSRC, ROW_JOB, ROW_JOB + '      if (!job) continue;\n', 'gone-kept'), 'gone-kept'));
ok(lastFor(r2red, 'pf-__local__-47412') === 'publish' && r2red.rows.some((r) => r.id === 'pf-__local__-47412' && r.publicUrl), 'RED CONTROL §2: a removed service\'s row kept (in a copy) — the lift republishes an address nobody owns', r2red);

console.log('§3 a RESTART while held (the engine dropped and made again): the stopped service\'s address goes at the lift');
const S3 = svc('jb-fwdrest01', 47413);
const restart = (JM) => scene({ JM, rows: [ownedRow(S3, 47413)], jobs: [S3], restart: true, whileHeld: (c) => stopWhileHeld(c, S3.id) });
const r3 = await restart();
ok(lastFor(r3, 'pf-__local__-47413') === 'unpublish' && !r3.rows.length && !!r3.jobs[S3.id] && r3.jobs[S3.id].state === 'down', `§3: no mark carried through the hold — the engine made again reads the service down, and the reconcile takes its address down (${r3.calls.map((c) => c.join(' ')).join(' → ')})`, r3);
const DOWN_RULE = '      const forget = !job;\n';
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
    return { owner: row.ownerJob || null, published: countOf({ calls }, 'publish', 'pf-__local__-47417'), state: snap.publishState };
  };
  const gone = await reownScene(false), up = await reownScene(true);
  ok(gone.owner === 'jb-fwdnew001' && gone.published === 1, '§4b: the row of a job no longer here is taken by the service now on that port, and published once', gone);
  ok(up.owner === 'jb-fwdold001' && up.published === 0 && up.state === 'refused', '§4b: the row of a job still up and asking is never taken — the second service is refused by name', up);
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

report();
