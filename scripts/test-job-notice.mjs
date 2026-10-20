#!/usr/bin/env node
// A PUBLISHED SERVICE'S NOTICE IS A STATE CHANGE (lane job-notice-dedupe — agent feedback fb-4ff6e673ad / fb-a001be4917 /
// fb-666f37fd38). §1 the PURE verdict (src/job-notice.js): the transition table, the vault class never said per job, the
// counter, the recovery said once — and the RED control: the pre-fix verdict (a notice at every failed attempt) fails the
// same table. §2 the real engine (src/jobs.js) over the real Ports manager (src/port-forward.js) and a fake relay plugin
// (no spawn, no vendor): five failed publishes for one cause ⇒ ONE notice; a restart keeps the record (the repeat came at
// every restart); the vault's unlock re-publishes NOW; the relay's success elsewhere (the heal sweep's republish, the
// Ports panel) is the job's state in the same tick; `show` says the cause, since when, how many attempts; the owner's own
// subscription filter shapes its auto-notify; a deliberate stop ends the episode; the RED control: a patched copy with the
// pre-fix per-attempt notice says five.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JN = require('../src/job-notice.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ── §1 THE PURE VERDICT ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('§1 the verdict (src/job-notice.js)');
const LOCKED = () => Object.assign(new Error('the vault is locked — the relay token opens after the owner unlocks it with the second password (the relay does not start until then)'), { code: 'vault_locked' });
const UNREACH = (n) => new Error(`frpc reload failed: connect ECONNREFUSED 127.0.0.1:${7400 + n}`);
const NOPORT = () => new Error('could not allocate a public port on the relay (busy)');
const URL0 = 'https://vs1785a95b84.relay.test/', URL1 = 'https://vsfeedbeef00.relay.test/';
// run a sequence of outcomes through a verdict → the notices it says, the last record
const play = (verdict, outcomes, url = URL0) => {
  let rec = null, cur = url; const said = [];
  outcomes.forEach((o, i) => { const v = verdict({ prev: rec, next: o, url: cur, at: 1_792_480_000_000 + i * 3_600_000 }); rec = v.record; if (v.notice) said.push(v.notice); if (o.ok && o.url) cur = o.url; });
  return { said, rec };
};
const fails = (mk, n) => Array.from({ length: n }, (_, i) => ({ ok: false, error: mk(i) }));
// THE TABLE (each row: outcomes → the notice kinds said) — judged on the real verdict, then on the pre-fix one
const TABLE = [
  ['none → failed(X) ×5 (one cause, the restarts of record)', fails(UNREACH, 5), ['down']],
  ['failed(X) → failed(Y): the new cause is said once', [...fails(UNREACH, 3), ...fails(NOPORT, 3)], ['down', 'down']],
  ['failed → published: the recovery once', [...fails(UNREACH, 4), { ok: true, url: URL0 }, { ok: true, url: URL0 }], ['down', 'recovered']],
  ['the vault class is NEVER said per job (×5, then published: nothing)', [...fails(LOCKED, 5), { ok: true, url: URL0 }], []],
  ['said X → the vault → published: the recovery is still said once (said is sticky)', [...fails(UNREACH, 2), ...fails(LOCKED, 3), { ok: true, url: URL0 }], ['down', 'recovered']],
  ['two episodes: down, back, down, back — four notices, never a repeat', [...fails(UNREACH, 3), { ok: true, url: URL0 }, ...fails(UNREACH, 3), { ok: true, url: URL0 }], ['down', 'recovered', 'down', 'recovered']],
];
const judge = (verdict) => TABLE.filter(([, outs, want]) => JSON.stringify(play(verdict, outs).said.map((n) => n.kind)) !== JSON.stringify(want)).map(([name]) => name);
const bad = judge(JN.noticeVerdict);
for (const [name, outs, want] of TABLE) ok(!bad.includes(name), name, JSON.stringify(play(JN.noticeVerdict, outs).said.map((n) => n.kind)) + ' ≠ ' + JSON.stringify(want));
// RED CONTROL — the pre-fix verdict as src/jobs.js had it: every failed attempt with a URL said DOWN, a recovery never
const PREFIX = ({ next, url }) => ({ record: next.ok ? null : { cause: 'x' }, notice: !next.ok && url ? { kind: 'down' } : null });
const badPre = judge(PREFIX);
ok(badPre.length >= 4 && badPre.includes(TABLE[0][0]) && badPre.includes(TABLE[3][0]), `RED CONTROL: the pre-fix verdict (a notice at every failed attempt) fails ${badPre.length}/${TABLE.length} rows — the repeat and the vault class among them`, JSON.stringify(badPre));
{
  const r = play(JN.noticeVerdict, fails(UNREACH, 5));
  ok(r.rec.attempts === 5 && r.rec.cause === 'relay_unreachable' && r.rec.sinceAt === 1_792_480_000_000 && r.rec.said === true, 'the counter: attempts 5, sinceAt = the first failure, said', JSON.stringify(r.rec));
  ok(r.said.length === 1 && r.said[0].what.includes(URL0) && /is DOWN — publish failed: frpc reload failed/.test(r.said[0].what) && /said once/.test(r.said[0].what), 'the DOWN notice names the URL and the relay\'s sentence, and says it is said once', r.said[0] && r.said[0].what);
  const y = play(JN.noticeVerdict, [...fails(UNREACH, 2), ...fails(NOPORT, 1)]);
  ok(y.rec.cause === 'port_in_use' && y.rec.attempts === 1 && y.rec.sinceAt === 1_792_480_000_000 + 2 * 3_600_000 && y.rec.downAt === 1_792_480_000_000, 'a new cause restarts the count and its since; the episode keeps when it went down (downAt)', JSON.stringify(y.rec));
  const v = play(JN.noticeVerdict, fails(LOCKED, 5));
  ok(v.rec.cause === 'vault_locked' && v.rec.said === false && v.rec.attempts === 5 && JN.whyOf(v.rec) === JN.VAULT_WAIT && /waiting for the vault/.test(JN.whyOf(v.rec)), 'the vault class: counted (5), never said, its status words = waiting for the vault', JSON.stringify(v.rec));
  const nu = play(JN.noticeVerdict, [...fails(UNREACH, 1), { ok: true, url: URL1 }]);
  ok(nu.said.length === 2 && nu.said[1].kind === 'recovered' && nu.said[1].what.includes(URL0) && nu.said[1].what.includes(URL1) && /NEW address/.test(nu.said[1].what), 'a recovery to a NEW address names both in ONE notice', nu.said[1] && nu.said[1].what);
  const first = play(JN.noticeVerdict, [...fails(UNREACH, 3), { ok: true, url: URL0 }], null);
  ok(first.said.length === 0, 'a first publish that never had a URL: no DOWN (the creator polls), no recovery either', JSON.stringify(first.said));
  ok(JN.noticeVerdict({ prev: null, next: { ok: true, url: URL0 }, url: URL0 }).notice === null, 'published → published: nothing');
}
{
  const C = (e) => JN.causeOf(e);
  ok(C(LOCKED()) === 'vault_locked' && C('publish failed: vault is locked') === 'vault_locked', 'causeOf: the relay\'s vault_locked (by code, and by its words)');
  ok(C(new Error('public URLs are not available — the frp relay is not configured on this instance')) === 'relay_not_configured' && C(new Error('public URLs are not available on this instance')) === 'relay_not_configured', 'causeOf: not configured');
  ok(C(NOPORT()) === 'port_in_use' && C(new Error('could not allocate a public port on the relay (ECONNREFUSED)')) === 'port_in_use', 'causeOf: no public port (before the connection words it may carry)');
  ok(C(new Error('could not publish the subdomain on the relay (is the domain / DNS set up?)')) === 'subdomain_refused' && C(new Error('the forward is not active (is the machine online?)')) === 'forward_inactive', 'causeOf: the subdomain refused, the forward inactive');
  ok(C(UNREACH(1)) === C(UNREACH(9)) && C(UNREACH(1)) === 'relay_unreachable', 'causeOf: the relay unreachable (its port number is not a new cause)');
  ok(C(new Error('odd failure 12 at 07:13')) === C(new Error('odd failure 99 at 08:41')) && C(new Error('odd failure 1')) !== C(new Error('another failure 1')), 'causeOf: any other sentence is its own cause, numbers folded');
  ok(JN.CLASSES.includes('vault_locked') && !JN.SAID_PER_JOB('vault_locked') && JN.SAID_PER_JOB('relay_unreachable'), 'the vault class is the one class never said per job');
}

// ── §2 THE REAL ENGINE over the real Ports manager and a fake relay ──────────────────────────────────────────────────
console.log('§2 the engine (src/jobs.js) + the Ports manager (src/port-forward.js), a fake relay plugin');
const { JobManager } = require('../src/jobs.js');
const { PortForwardManager } = require('../src/port-forward.js');
const jobModel = require('../src/job-model.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-notice-'));
const servers = [];
try {
  const svc = http.createServer((q, s) => s.end('ok'));
  await new Promise((r) => svc.listen(0, '127.0.0.1', r)); servers.push(svc);
  const P = svc.address().port;
  const relay = { mode: 'vault', n: 0, calls: 0 };
  const fakePlugins = {
    async frpPublish(name) {
      relay.calls++;
      if (relay.mode === 'vault') throw LOCKED();
      if (relay.mode === 'unreachable') throw UNREACH(++relay.n);
      if (relay.mode === 'noport') throw NOPORT();
      return { name, subdomain: 'vs1785a95b84', proto: 'http', url: URL0 };
    },
    async frpUnpublish() { return { ok: true }; },
  };
  let cur = null;
  const pdir = path.join(dir, 'pf'); fs.mkdirSync(pdir, { recursive: true });
  const pf = new PortForwardManager({ hosts: { list: () => [] }, dataDir: pdir, plugins: fakePlugins, broadcast: () => { }, log: () => { }, getJobs: () => cur });
  let forwards = 0; const fwd = pf.forward.bind(pf); pf.forward = (...a) => { forwards++; return fwd(...a); };
  const said = [], delivered = [];
  const owner = { conversation: { backend: 'claude', id: 'conv-O' }, sessionId: 'sess-O', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: ['T-g'] };
  const ownerCaller = { conversationId: 'conv-O', sessionId: 'sess-O', sessionCreatedAt: 1, groups: new Set(['T-g']) };
  const mk = (JM, d, ports = pf) => {
    fs.mkdirSync(path.join(d, 'bin'), { recursive: true });
    const E = new JM({ dataDir: d, broadcast: () => { }, notifyUser: () => { }, log: () => { }, getPorts: () => ports, publishWaitMs: 3000, publishRecheckMs: 60_000,
      deliverToConversation: async (cid, text) => { delivered.push({ cid, text }); return { ok: true, lane: 'message', peerName: 'owner' }; } });
    E.init();
    const orig = E._notifyOwner.bind(E); E._notifyOwner = (job, ev) => { said.push(ev.what); return orig(job, ev); };
    return E;
  };
  const stopEngine = (E) => { for (const t of E._timers || []) clearInterval(t); E.shutdown(); };
  const edir = path.join(dir, 'engine');
  const F = mk(JobManager, edir); cur = F;
  // a published service the server adopted (the restart path of record): up, its last URL known — injected, no process
  const job = { id: 'jb-topo0001', kind: 'service', name: 'rack-topo-web', state: 'up', desiredUp: true, publish: true, ports: [P], owner, access: { view: 'session', control: 'session' }, runs: [], createdAt: Date.now(), lastPublicUrl: URL0, publishedUrl: URL0 };
  F.jobs.set(job.id, job);

  // (a) the vault locked: five publishes ⇒ nothing said; the status says it is waiting for the vault
  for (let i = 0; i < 5; i++) await F._ensurePublish(job);
  let s = F.snapshot(job);
  ok(relay.calls === 5 && said.length === 0, 'the vault locked: five publish attempts ⇒ NOTHING said to the owner conversation (the vault\'s own item carries it)', JSON.stringify({ calls: relay.calls, said }));
  ok(s.publishState === 'failed' && s.publishCause === 'vault_locked' && s.publishAttempts === 5 && /waiting for the vault/.test(s.publishWhy) && !s.publishedUrl && s.publishSince > 0, 'the snapshot: failed · vault_locked · 5 attempts · since · waiting for the vault', JSON.stringify({ st: s.publishState, c: s.publishCause, n: s.publishAttempts, w: s.publishWhy }));

  // (b) a restart: the record is on disk; the next attempt under the same cause says nothing (the repeat of record)
  stopEngine(F);
  const onDisk = JSON.parse(fs.readFileSync(path.join(edir, 'jobs.json'), 'utf-8')).find((j) => j.id === job.id);
  ok(onDisk && onDisk.publishDown && onDisk.publishDown.cause === 'vault_locked' && onDisk.publishDown.attempts === 5, 'the down record is persisted (the repeat came at every restart — a runtime-only state forgot it)', JSON.stringify(onDisk && onDisk.publishDown));
  const G = mk(JobManager, edir); cur = G;
  const gj = G.jobs.get(job.id); gj.state = 'up'; // adopted (its process lives on — the stamp check is test-jobs-engine's)
  await G._ensurePublish(gj);
  ok(said.length === 0 && gj.publishDown.attempts === 6, 'after the restart: the same cause ⇒ still nothing said, attempts 6', JSON.stringify({ said, n: gj.publishDown.attempts }));

  // (c) the CLI says the cause, since when, how many attempts — against a stand-in agent API serving the engine's snapshot
  const api = http.createServer((q, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (q.method === 'POST') { res.end(JSON.stringify({ success: true, ok: true, filter: '^(?!.*is DOWN)', count: 1, ownerLane: true })); return; }
    const snap = { ...jobModel.agentJobView(G.snapshot(gj, { tail: 5 }), { mine: true }), mine: true, mySubscription: null };
    res.end(JSON.stringify(q.url.startsWith('/api/agent/jobs/') ? { success: true, job: snap } : { success: true, jobs: [snap] }));
  });
  await new Promise((r) => api.listen(0, '127.0.0.1', r)); servers.push(api);
  const cli = (...a) => new Promise((res) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'data/bin/vibespace-job'), ...a], { env: { PATH: process.env.PATH, VIBESPACE_API: `http://127.0.0.1:${api.address().port}`, VIBESPACE_SESSION_TOKEN: 'vst_test' } });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', () => res(out));
  });
  const showLocked = await cli('show', job.id);
  ok(/public URL: NOT published — waiting for the vault — it is locked; the owner has the unlock item[^\n]* — since \d{4}-\d\d-\d\d \d\d:\d\dZ \(6 attempts\) \(was https:\/\/vs1785a95b84\.relay\.test\/\)/.test(showLocked), 'vibespace-job show: NOT published — waiting for the vault … — since <when> (6 attempts) (was <url>)', showLocked);

  // (d) the vault unlocks: the re-publish STARTS in the unlock's own tick (never the hourly restart, never the 5-min heal)
  relay.mode = 'ok';
  const f0 = forwards;
  const n = G.relayChanged('the vault unlocked');
  ok(n === 1 && forwards === f0 + 1, 'relayChanged (the vault\'s onUnlock): the down service re-publishes in the same tick (its forward asked synchronously)', JSON.stringify({ n, forwards: forwards - f0 }));
  const t0 = Date.now(); while (gj.publishDown && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
  s = G.snapshot(gj);
  ok(!gj.publishDown && s.publishState === null && s.publishedUrl === URL0 && said.length === 0, 'published again: the URL, no down state — and no «back UP» either (the vault class was never said, so neither is its end)', JSON.stringify({ st: s.publishState, u: s.publishedUrl, said }));
  const showUp = await cli('show', job.id);
  ok(showUp.includes(`public URL: ${URL0}`) && !/NOT published/.test(showUp), 'vibespace-job show: the URL (fb-666f37fd38: never «NOT published» after the relay\'s 200)', showUp);

  // (e) a cause the agent can act on: five failures ⇒ ONE notice; the relay's success through the Ports manager's heal-sweep
  // republish is the job's state IN THE SAME TICK (the job never asked); then ONE «back UP»
  relay.mode = 'unreachable';
  for (let i = 0; i < 5; i++) await G._ensurePublish(gj);
  ok(said.length === 1 && /is DOWN — publish failed: frpc reload failed/.test(said[0]) && gj.publishDown.attempts === 5 && gj.publishDown.cause === 'relay_unreachable', 'the relay unreachable ×5 (a new port number each time) ⇒ ONE DOWN notice, attempts 5', JSON.stringify({ said, rec: gj.publishDown }));
  relay.mode = 'ok';
  const rec = pf._state.forwards.find((r) => r.id === gj._pfId);
  const seen = []; const adopt = pf._adoptPublish.bind(pf); pf._adoptPublish = (r, a) => { adopt(r, a); seen.push(G.snapshot(gj)); };
  const healed = await pf._republish(rec);
  ok(healed === true && seen.length === 1 && seen[0].publishState === null && seen[0].publishedUrl === URL0, 'the heal sweep\'s republish (pf._republish): the job\'s snapshot shows the URL in the very tick the Ports manager adopts it', JSON.stringify({ healed, seen: seen.map((x) => [x.publishState, x.publishedUrl]) }));
  ok(said.length === 2 && /is back UP — published again \(down since/.test(said[1]) && said[1].includes(URL0), 'ONE «back UP» notice (the DOWN was said)', JSON.stringify(said));
  await pf._republish(rec);
  ok(said.length === 2, 'the next adopt of the same URL says nothing', JSON.stringify(said));
  pf._adoptPublish = adopt;

  // (f) the cause changes: one notice per cause; the Ports panel's publish (the relay's success, not the job's) ends it once
  relay.mode = 'unreachable'; await G._ensurePublish(gj); await G._ensurePublish(gj);
  relay.mode = 'noport'; await G._ensurePublish(gj); await G._ensurePublish(gj);
  ok(said.length === 4 && /frpc reload failed/.test(said[2]) && /could not allocate a public port/.test(said[3]), 'unreachable ×2 then no-port ×2 ⇒ two notices, one per cause', JSON.stringify(said.slice(2)));
  relay.mode = 'ok'; await pf.publish(gj._pfId);
  ok(said.length === 5 && /back UP/.test(said[4]) && !gj.publishDown, 'the Ports panel\'s publish: ONE «back UP»', JSON.stringify(said.slice(4)));

  // (g) the owner's OWN subscription filter shapes its auto-notify (fb-a001be4917 — the loop skipped it, the lane ignored it)
  const sub = G.subscribe(gj, ownerCaller, { filter: '^(?!.*is DOWN)' });
  ok(sub.ok && sub.ownerLane === true, 'the owner subscribing to its own job: the answer says it shapes its own lane (ownerLane)', JSON.stringify(sub));
  G._notifyRate.clear(); delivered.length = 0;
  relay.mode = 'unreachable'; await G._ensurePublish(gj);
  const filt = (gj.notifyLog || []).slice(-1)[0];
  ok(said.length === 6 && delivered.length === 0 && filt && filt.lane === 'filtered' && filt.ok === false && /your own subscription filter/.test(filt.reason), 'a DOWN the filter names never reaches the owner conversation — journalled as filtered, never stashed', JSON.stringify({ delivered, filt }));
  G._notifyRate.clear();
  relay.mode = 'ok'; await G._ensurePublish(gj);
  ok(delivered.length === 1 && delivered[0].cid === 'conv-O' && /back UP/.test(delivered[0].text), 'what the filter does not name (the «back UP») is delivered', JSON.stringify(delivered));
  const subOut = await cli('subscribe', job.id, '--filter', '^(?!.*is DOWN)');
  ok(/your own auto-notify included/.test(subOut), 'the CLI\'s subscribe echo says the owner\'s auto-notify is included', subOut);

  // (h) a deliberate stop ends the episode (the next start is a fresh one); a restart never does (b)
  relay.mode = 'unreachable'; await G._ensurePublish(gj);
  ok(!!gj.publishDown, 'down again before the stop');
  await G._teardownPublish(gj);
  ok(!gj.publishDown && G.snapshot(gj).publishState === null, 'teardown (stop / park / refusal) ends the down episode');
  stopEngine(G); cur = null;

  // (i) RED CONTROL — a patched copy of src/jobs.js with the pre-fix per-attempt notice back: five failures ⇒ five notices
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const JS = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
  const AT = '    if (v.notice) this._notifyOwner(job, { what: v.notice.what });';
  ok(JS.split(AT).length === 2, 'the verdict\'s notice is the one notify of a publish outcome');
  const PRE = '    if (!next.ok && job.lastPublicUrl) this._notifyOwner(job, { what: `public URL ${job.lastPublicUrl} is DOWN — publish failed: ${(next.error && next.error.message) || next.error}` });'; // the pre-fix rule
  const JMpre = mutantCopies('job-notice', ROOT).load('src/jobs.js', JS.replace(AT, PRE), 'pre-fix').JobManager;
  const H = mk(JMpre, path.join(dir, 'pre')); cur = H;
  const hj = { ...job, id: 'jb-topo0002', publishDown: undefined, _pfId: undefined, notifyLog: [], subscribers: [] };
  H.jobs.set(hj.id, hj);
  said.length = 0; relay.mode = 'unreachable';
  for (let i = 0; i < 5; i++) await H._ensurePublish(hj);
  ok(said.length === 5 && said.every((w) => /is DOWN/.test(w)), `RED CONTROL: the pre-fix rule (a notice at every failed attempt) says ${said.length} for five failures — the fix says 1`, JSON.stringify(said.length));
  stopEngine(H); cur = null;
  // RED CONTROL ② — the owner's filter line taken out: the DOWN the owner's own filter names reaches it (fb-a001be4917)
  const OWN = "      if (own && !M.filterMatches(own.filter, notifText)) { this._notifyLogPush(job, { lane: 'filtered', ok: false, reason: 'your own subscription filter' }); return; }";
  ok(JS.split(OWN).length === 2, 'the owner-filter line is present once');
  const JMnoOwn = mutantCopies('job-notice', ROOT).load('src/jobs.js', JS.replace(OWN, ''), 'no-owner-filter').JobManager;
  const K = mk(JMnoOwn, path.join(dir, 'noown')); cur = K;
  const kj = { ...job, id: 'jb-topo0003', publishDown: undefined, _pfId: undefined, notifyLog: [], subscribers: [] };
  K.jobs.set(kj.id, kj); K.subscribe(kj, ownerCaller, { filter: '^(?!.*is DOWN)' });
  delivered.length = 0; relay.mode = 'unreachable'; await K._ensurePublish(kj);
  ok(delivered.length === 1 && /is DOWN/.test(delivered[0].text), 'RED CONTROL ②: without the owner-filter line the DOWN the filter names is delivered anyway (the feedback of record)', JSON.stringify(delivered.length));
  stopEngine(K); cur = null;
  // RED CONTROL ③ — the Ports manager without its relayPublished line: the heal sweep republishes and the job still says
  // «NOT published» (fb-666f37fd38 — the URL answered 200, poll said the vault was locked)
  const PFS = fs.readFileSync(path.join(ROOT, 'src/port-forward.js'), 'utf-8');
  const TELL = "    try { const jm = this.getJobs && this.getJobs(); if (jm && typeof jm.relayPublished === 'function') jm.relayPublished(rec, r.url || null); } catch (e) { this.log('jobs follow ' + rec.id + ': ' + e.message); }";
  ok(PFS.split(TELL).length === 2, 'the Ports manager tells the jobs once, in _adoptPublish');
  const { PortForwardManager: PFmut } = mutantCopies('job-notice', ROOT).load('src/port-forward.js', PFS.replace(TELL, ''), 'no-tell');
  let curM = null;
  const pfm = new PFmut({ hosts: { list: () => [] }, dataDir: path.join(dir, 'pfm'), plugins: fakePlugins, broadcast: () => { }, log: () => { }, getJobs: () => curM });
  const L = mk(JobManager, path.join(dir, 'stale'), pfm); curM = L;
  const lj = { ...job, id: 'jb-topo0004', publishDown: undefined, _pfId: undefined, notifyLog: [], subscribers: [] };
  L.jobs.set(lj.id, lj);
  relay.mode = 'ok'; await L._ensurePublish(lj);
  relay.mode = 'vault'; await L._ensurePublish(lj);
  relay.mode = 'ok';
  const staleRec = pfm._state.forwards.find((r) => r.id === lj._pfId);
  await pfm._republish(staleRec);
  ok(staleRec.publicUrl === URL0 && L.snapshot(lj).publishState === 'failed' && /waiting for the vault/.test(L.snapshot(lj).publishWhy), 'RED CONTROL ③: without the tell, the relay republished and the job still says NOT published — waiting for the vault (the stale snapshot of record)', JSON.stringify(L.snapshot(lj).publishState));
  stopEngine(L); curM = null;

  // (j) the wiring: the vault's unlock calls relayChanged; the Ports manager's adopt calls relayPublished
  const wiring = fs.readFileSync(path.join(ROOT, 'src/server/mounts-plugins-wiring.js'), 'utf-8');
  ok(/vault\.onUnlock\(\(\) => \{ try \{ const jm = getJobs && getJobs\(\); if \(jm && typeof jm\.relayChanged === 'function'\) jm\.relayChanged\('the vault unlocked'\);/.test(wiring), 'mounts-plugins-wiring: the vault\'s onUnlock → jobs.relayChanged');
  const pfSrc = fs.readFileSync(path.join(ROOT, 'src/port-forward.js'), 'utf-8');
  const adoptBody = pfSrc.slice(pfSrc.indexOf('  _adoptPublish(rec, r) {'), pfSrc.indexOf('  _localSocket('));
  ok(/jm\.relayPublished\(rec, r\.url \|\| null\)/.test(adoptBody), 'port-forward _adoptPublish (every relay success: heal sweep, restore, machine link, the Ports panel) → jobs.relayPublished');
} finally {
  for (const sv of servers) try { sv.close(); } catch { }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
