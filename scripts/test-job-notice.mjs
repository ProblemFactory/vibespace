#!/usr/bin/env node
// A PUBLISHED SERVICE'S NOTICE IS A STATE CHANGE (lane job-notice-dedupe — agent feedback fb-4ff6e673ad / fb-a001be4917 /
// fb-666f37fd38). §1 the PURE verdict (src/job-notice.js): the transition table, the vault class never said per job, the
// counter, the recovery said once — and the RED control: the pre-fix verdict (a notice at every failed attempt) fails the
// same table. §2 the real engine (src/jobs.js) over the real Ports manager (src/port-forward.js) and a fake relay plugin
// (no spawn, no vendor): five failed publishes for one cause ⇒ ONE notice; a restart keeps the record (the repeat came at
// every restart); the vault's unlock re-publishes NOW; the relay's success elsewhere (the heal sweep's republish, the
// Ports panel) is the job's state in the same tick; `show` says the cause, since when, how many attempts; the owner's own
// subscription filter shapes its auto-notify; a deliberate stop ends the episode; the RED control: a patched copy with the
// pre-fix per-attempt notice says five. §3 THE DROPPED LOGIN (lane frp-token-proof, 2026-10-30 — the relay took this
// instance's login and closed it at once; the hub said «is the domain / DNS set up?» / «could not allocate a public port» per
// forward per sweep): its own class, never said per job (the frp plugin's ONE For-you item carries it), the job's status
// waits for the relay with the relay's words; the Ports manager's re-publish says it ONCE per episode, each forward's error
// carries the words, another failure still per forward. RED on the base: the class is `other:…` (said per job) and the
// Ports manager logs a line per forward per sweep.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
const require = createRequire(import.meta.url);
const JN = require('../src/job-notice.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ── §1 THE PURE VERDICT ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('§1 the verdict (src/job-notice.js)');
const LOCKED = () => Object.assign(new Error('the vault is locked — the relay token opens after the owner unlocks it with the second password (the relay does not start until then)'), { code: 'vault_locked' });
const UNREACH = (n) => new Error(`frpc reload failed: connect ECONNREFUSED 127.0.0.1:${7400 + n}`);
const NOPORT = () => new Error('could not allocate a public port on the relay (busy)');
// lane frp-token-proof: the frp plugin's publish error for THE DROPPED LOGIN (src/relay-token.js droppedAlertOf's message, spelled
// here so the base — which has no such words — runs the same rows)
const DROPPED_MSG = (n) => `the relay accepts this instance's login but closes the connection right after (${n} logins since 2026-10-30 12:00Z, no proxy started) — the relay still requires the shared relay token, and this frpc runs without it because the vault was locked when it started. Unlock the vault with the second password, or set the relay token again in Plugins › Public URLs.`;
const DROPPED = (n = 3) => Object.assign(new Error(DROPPED_MSG(n)), { code: 'relay_login_dropped' });
const URL0 = 'https://vs1785a95b84.relay.test/', URL1 = 'https://vsfeedbeef00.relay.test/', URL2 = 'https://vsc0ffee0001.relay.test/';
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
  ['the dropped login is NEVER said per job — the frp plugin\'s ONE For-you item carries it (×5 with a moving count, then published: nothing)', [...fails((i) => DROPPED(3 + i * 40), 5), { ok: true, url: URL0 }], []],
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
  ok(nu.said.length === 2 && nu.said[1].kind === 'recovered' && nu.said[1].what.includes(URL0) && nu.said[1].what.includes(URL1) && !/no longer works|NEW address/.test(nu.said[1].what), 'a recovery to another address names both in ONE notice — never «the old link no longer works» (B-74f5: the proven check says a change)', nu.said[1] && nu.said[1].what);
  // B-74f5: THE CHANGE CHECK'S VERDICT — said only when the new address answered AND the old one failed; a web address read as tcp:// is
  // kept unless proven; neither answering ⇒ look again
  const TCP0 = 'tcp://relay.test:22999', UV = JN.urlChangeVerdict;
  const rowsU = [
    ['the incident: https kept answering, the tcp read answers nothing', { from: URL0, to: TCP0, toAnswers: false, fromAnswers: true }, { say: false, adopt: false, again: false }],
    ['both answer: nothing said, the new web address taken', { from: URL0, to: URL1, toAnswers: true, fromAnswers: true }, { say: false, adopt: true, again: false }],
    ['proven: the new answered, the old failed', { from: URL0, to: TCP0, toAnswers: true, fromAnswers: false }, { say: true, adopt: true, again: false }],
    ['neither answers yet (the relay coming back): look again, the web address kept', { from: URL0, to: TCP0, toAnswers: false, fromAnswers: false }, { say: false, adopt: false, again: true }],
    ['no change', { from: URL0, to: URL0, toAnswers: false, fromAnswers: false }, { say: false, adopt: true, again: false }],
  ];
  const badU = rowsU.filter(([, i, w]) => { const v = UV(i); return v.say !== w.say || v.adopt !== w.adopt || v.again !== w.again; }).map(([n]) => n);
  ok(typeof UV === 'function' && !badU.length && JN.keepsWebUrl(URL0, TCP0) && !JN.keepsWebUrl(TCP0, URL0) && !JN.keepsWebUrl(URL0, URL1), 'B-74f5: urlChangeVerdict — said only when proven; a web address read as tcp:// kept until then; neither answering ⇒ again', JSON.stringify(badU));
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
  ok(JN.CLASSES.includes('vault_locked') && !JN.SAID_PER_JOB('vault_locked') && JN.SAID_PER_JOB('relay_unreachable'), 'the vault class is never said per job');
  // lane frp-token-proof: THE DROPPED LOGIN — its own class (by code, and by its words), before the generic texts
  ok(C(DROPPED(3)) === 'relay_login_dropped' && C(DROPPED(2459)) === 'relay_login_dropped' && C(new Error(DROPPED_MSG(7))) === 'relay_login_dropped', 'causeOf: the dropped login is its own class (by code, by its words; its count is not a new cause) — never subdomain_refused / port_in_use', C(DROPPED(3)));
  ok(JN.CLASSES.includes('relay_login_dropped') && JN.SAID_PER_JOB('relay_login_dropped') === false, 'the dropped login is never said per job (the owner has ONE item)');
  const dr = play(JN.noticeVerdict, fails((i) => DROPPED(3 + i), 4));
  ok(dr.said.length === 0 && dr.rec.cause === 'relay_login_dropped' && dr.rec.attempts === 4 && /^waiting for the relay — it drops this instance's login/.test(JN.whyOf(dr.rec) || '') && /closes the connection right after/.test(JN.whyOf(dr.rec) || ''), 'the dropped login: counted, never said; the status waits for the relay with the relay\'s words', JN.whyOf(dr.rec));
  {
    const RT = require('../src/relay-token.js');
    const a = typeof RT.droppedAlertOf === 'function' ? RT.droppedAlertOf({ logins: 3, since: Date.parse('2026-10-30T12:00:05Z'), why: 'locked' }) : null;
    ok(!!a && a.message === DROPPED_MSG(3), 'the words spelled here are src/relay-token.js droppedAlertOf\'s message (the plugin\'s publish error)', a && a.message);
  }
}

// ── §2 THE REAL ENGINE over the real Ports manager and a fake relay ──────────────────────────────────────────────────
console.log('§2 the engine (src/jobs.js) + the Ports manager (src/port-forward.js), a fake relay plugin');
const { JobManager } = require('../src/jobs.js');
const { PortForwardManager } = require('../src/port-forward.js');
const jobModel = require('../src/job-model.js');
// lane agent-context-owner-facts (B-7960 a): the stub hub answers what the real one does — the job view + its instants as words
// (agent-routes jobWhen), in this fixture's zone (UTC: never the box's own)
const { jobWhen } = require('../src/agent-routes.js');
require('../src/server/owner-facts.js').configure({ setting: (k) => (k === 'instance.timezone' ? 'UTC' : undefined) });
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
      if (relay.mode === 'tcp') return { name, remotePort: 22999, proto: 'tcp', url: 'tcp://relay.test:22999' }; // B-74f5: the http probe misfired
      if (relay.mode === 'moved') return { name, subdomain: 'vsfeedbeef00', proto: 'http', url: URL1 }; // B-74f5 r2: a real move to another web address
      if (relay.mode === 'moved2') return { name, subdomain: 'vsc0ffee0001', proto: 'http', url: URL2 }; // B-74f5 follow-up: a second move, B to C
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
  const mk = (JM, d, ports = pf, extra = {}) => {
    fs.mkdirSync(path.join(d, 'bin'), { recursive: true });
    const E = new JM({ dataDir: d, broadcast: () => { }, notifyUser: () => { }, log: () => { }, getPorts: () => ports, publishWaitMs: 3000, publishRecheckMs: 60_000, ...extra,
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
    const snap = jobWhen({ ...jobModel.agentJobView(G.snapshot(gj, { tail: 5 }), { mine: true }), mine: true, mySubscription: null });
    res.end(JSON.stringify(q.url.startsWith('/api/agent/jobs/') ? { success: true, job: snap } : { success: true, jobs: [snap] }));
  });
  await new Promise((r) => api.listen(0, '127.0.0.1', r)); servers.push(api);
  const cli = (...a) => new Promise((res) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'data/bin/vibespace-job'), ...a], { env: { PATH: process.env.PATH, VIBESPACE_API: `http://127.0.0.1:${api.address().port}`, VIBESPACE_SESSION_TOKEN: 'vst_test' } });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', () => res(out));
  });
  const showLocked = await cli('show', job.id);
  ok(/public URL: NOT published — waiting for the vault — it is locked; the owner has the unlock item[^\n]* — since \d{4}-\d\d-\d\d \d\d:\d\d UTC \(6 attempts\) \(was https:\/\/vs1785a95b84\.relay\.test\/\)/.test(showLocked), 'vibespace-job show: NOT published — waiting for the vault … — since <when> (6 attempts) (was <url>)', showLocked);

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
  const AT = '    if (v.notice) this._notifyOwner(job, { what: v.notice.what });'; // B-74f5 r3: a «DOWN» is answered by its «back UP» at once, always
  ok(JS.split(AT).length === 2, 'the verdict\'s notice is the one notify of a publish outcome');
  const PRE = '    if (!next.ok && job.lastPublicUrl) this._notifyOwner(job, { what: `public URL ${job.lastPublicUrl} is DOWN — publish failed: ${(next.error && next.error.message) || next.error}` });'; // the pre-fix rule
  const JMpre = mutantCopies('job-notice', ROOT).load('src/jobs.js', editAnchor(JS, AT, PRE, "src/jobs.js"), 'pre-fix').JobManager;
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
  const JMnoOwn = mutantCopies('job-notice', ROOT).load('src/jobs.js', editAnchor(JS, OWN, '', "src/jobs.js"), 'no-owner-filter').JobManager;
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
  const { PortForwardManager: PFmut } = mutantCopies('job-notice', ROOT).load('src/port-forward.js', editAnchor(PFS, TELL, '', "src/port-forward.js"), 'no-tell');
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

  // (k) B-74f5 (fb-71b12fb3cd, fb-197c3042ca, fb-9efc35787c): A RESTART'S tcp:// READ OF A WEB SERVICE IS NO URL CHANGE. A published
  // https service adopted by a fresh engine; the relay's publish answers tcp:// (the http probe misfired while things came back).
  // The change is judged after the grace by a look at both addresses (a stand-in for the looks: `answering`)
  {
    const TCP0 = 'tcp://relay.test:22999', answering = new Set(), lines = [];
    const scene = async (JM, tag, { grace = 150 } = {}) => {
      said.length = 0; lines.length = 0;
      const E = mk(JM, path.join(dir, 'b74f5-' + tag), pf, { urlGraceMs: grace, urlCheckEveryMs: 40, urlRelookMs: 40, urlAnswers: async (u) => answering.has(u), log: (...a) => lines.push(a.join(' ')) }); cur = E;
      const bj = { ...job, id: 'jb-b74f5' + tag.slice(0, 3).padEnd(3, '0'), publishDown: undefined, _pfId: undefined, notifyLog: [], subscribers: [], lastPublicUrl: URL0, publishedUrl: URL0 };
      E.jobs.set(bj.id, bj);
      relay.mode = 'tcp'; await E._ensurePublish(bj);
      const atOnce = { said: said.slice(), url: E.snapshot(bj).publishedUrl, last: bj.lastPublicUrl };
      const t0 = Date.now(); while (!lines.some((l) => l.includes(bj.id) && /public URL (changed|was not said)/.test(l)) && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 15));
      const out = { atOnce, said: said.slice(), url: E.snapshot(bj).publishedUrl, last: bj.lastPublicUrl, line: lines.find((l) => l.includes(bj.id) && /public URL (changed|was not said)/.test(l)) || null };
      stopEngine(E); cur = null; relay.mode = 'ok';
      return out;
    };
    answering.clear(); answering.add(URL0); // the incident: the https address keeps answering, the tcp one answers nothing
    const a = await scene(JobManager, 'kept');
    ok(a.atOnce.said.length === 0 && a.atOnce.url === URL0 && a.atOnce.last === URL0, 'B-74f5: the restart\'s tcp:// read of an https service says NOTHING at once and the job keeps its https address (show / poll list it)', JSON.stringify(a.atOnce));
    ok(a.said.length === 0 && a.url === URL0 && a.last === URL0 && /the old address still answers/.test(a.line || ''), 'B-74f5: after the grace the look finds the https address answering ⇒ no «CHANGED», the https address stays, the journal says why', JSON.stringify({ said: a.said, url: a.url, line: a.line }));
    answering.clear(); answering.add(TCP0); // a real move: the https address gone, the tcp one answering
    const b = await scene(JobManager, 'moved');
    ok(b.atOnce.said.length === 0 && b.atOnce.url === URL0, 'B-74f5: inside the restart\'s grace nothing is said even for a real move', JSON.stringify(b.atOnce));
    ok(b.said.length === 1 && /public URL CHANGED/.test(b.said[0]) && b.said[0].includes(URL0) && b.said[0].includes(TCP0) && b.url === TCP0 && b.last === TCP0, 'B-74f5: after the grace, the new address answering and the old one failing ⇒ ONE «CHANGED» notice, and only then the job takes the tcp address', JSON.stringify({ said: b.said, url: b.url }));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
    answering.clear(); // nothing answers (the relay still coming back): the look is made three times, nothing is said
    const c = await scene(JobManager, 'quiet');
    ok(c.said.length === 0 && c.url === URL0 && /neither address answers yet/.test(c.line || ''), 'B-74f5: neither address answering ⇒ looked at again (bounded), nothing said, the https address kept', JSON.stringify({ said: c.said, line: c.line }));
    // RED CONTROL — the base's adopt (a URL different from the last one is said at once and taken): the incident's false notice
    const JSb = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
    const { mutantCopies: mcB } = await import('./mutant-copy.mjs');
    const { anchored } = await import('./scratch.mjs');
    const NOW_HEAD = "  _adoptJobUrl(job, url, { named = false } = {}) {\n    const before = job.lastPublicUrl || null;\n    if (!url) { job.publishedUrl = url; return; }\n    const keep = JN.keepsWebUrl(before, url);\n    job.publishedUrl = keep ? before : url;\n    if (!keep) job.lastPublicUrl = url;\n";
    const BASE_HEAD = "  _adoptJobUrl(job, url, { named = false } = {}) {\n    const before = job.lastPublicUrl || null;\n    job.publishedUrl = url;\n    if (!url) return;\n    job.lastPublicUrl = url;\n    if (before && before !== url) { this.d.log(`[jobs] ${job.id} public URL changed`); this._notifyOwner(job, { what: `public URL CHANGED: ${before} → ${url} (the old link no longer works — share the new one)` }); return; }\n";   // stale-pins: kept — the base's adopt, written back by this RED control
    const JMb = mcB('job-notice-b74f5', ROOT).load('src/jobs.js', anchored(JSb, NOW_HEAD, BASE_HEAD, 'B-74f5 control: the base\'s adopt'), 'base-adopt').JobManager;
    answering.clear(); answering.add(URL0);
    const r = await scene(JMb, 'base');
    ok(r.atOnce.said.length === 1 && /public URL CHANGED/.test(r.atOnce.said[0]) && r.atOnce.said[0].includes(TCP0) && r.atOnce.url === TCP0, 'RED CONTROL (B-74f5): the base\'s adopt says «public URL CHANGED … → tcp://…, the old link no longer works» at once while the https address answers (the three reports)', JSON.stringify(r.atOnce));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)

    // B-74f5 r2 (主开发 03:47Z, three musts + shoulds) — each over the real engine and Ports manager, each with its red control
    const JSr = JSb;
    const settle = async (E, id, re = /public URL (changed|back up|was not said)/, ms = 3000) => { const t0 = Date.now(); while (!lines.some((l) => l.includes(id) && re.test(l)) && Date.now() - t0 < ms) await new Promise((res) => setTimeout(res, 15)); };
    const mkU = (JM, tag, extra = {}) => { const E = mk(JM, path.join(dir, 'b74f5r2-' + tag), pf, { urlGraceMs: 150, urlCheckEveryMs: 40, urlRelookMs: 40, urlAnswers: async (u) => answering.has(u), log: (...a) => lines.push(a.join(' ')), ...extra }); cur = E; return E; };
    const jobU = (tag, more = {}) => ({ ...job, id: 'jb-b74f5' + tag, publishDown: undefined, _pfId: undefined, urlPending: undefined, notifyLog: [], subscribers: [], lastPublicUrl: URL0, publishedUrl: URL0, ...more });
    // (a) ONE WAKE A CHANGE: a «DOWN» said, then the relay publishes at ANOTHER address — exactly one notice, after the grace
    const wake = async (JM, tag) => {
      said.length = 0; lines.length = 0; answering.clear(); answering.add(URL1);
      const E = mkU(JM, tag), wj = jobU(tag); E.jobs.set(wj.id, wj);
      relay.mode = 'unreachable'; await E._ensurePublish(wj);
      relay.mode = 'moved'; await E._ensurePublish(wj);
      const atOnce = said.slice(); await settle(E, wj.id);
      const out = { atOnce, said: said.slice(), url: wj.publishedUrl, pending: wj.urlPending || null }; stopEngine(E); cur = null; relay.mode = 'ok'; return out;
    };
    const w1 = await wake(JobManager, 'wak');
    ok(w1.atOnce.length === 2 && /is DOWN/.test(w1.atOnce[0]) && /back UP at/.test(w1.atOnce[1]) && w1.atOnce[1].includes(URL0) && w1.atOnce[1].includes(URL1) && /not checked yet/.test(w1.atOnce[1]) && w1.said.length === 2 && !w1.pending && lines.some((l) => /confirmed: the recovery already named both addresses/.test(l)),
      'B-74f5 r3 (L1 / L2): a service said DOWN that comes back at ANOTHER address is told UP AT ONCE, both addresses named («not checked yet»); the later check only confirms it — a journal line, never a second wake', JSON.stringify(w1));
    const NAMED = '      const words = JN.urlChangeWords({ from, to, verdict: v, named: tok.named });';
    const JMw = mcB('job-notice-b74f5-wake', ROOT).load('src/jobs.js', anchored(JSr, NAMED, '      const words = JN.urlChangeWords({ from, to, verdict: v, named: false });', 'B-74f5 r3 control: the confirmation said again'), 'named-said').JobManager;
    const w0 = await wake(JMw, 'wa0');
    ok(w0.said.length === 3 && /back UP at/.test(w0.said[1]) && /public URL CHANGED/.test(w0.said[2]), 'RED CONTROL (B-74f5 r3 (L2)): a check that ignores what the recovery named says the move again — two wakes for one event', JSON.stringify(w0.said));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
    // (L1 / L3) THE MUST'S OWN SCENE (主开发 04:23Z): DOWN said; the relay comes back and the probe misreads the web address as tcp; one more
    // publish read inside the grace reads it right — the person was told UP at once, at the web address, and nothing is lost after
    const misread = async (JM, tag) => {
      said.length = 0; lines.length = 0; answering.clear(); answering.add(URL0);
      const E = mkU(JM, tag, { urlGraceMs: 80, urlCheckEveryMs: 20, urlRelookMs: 20 }), mj = jobU(tag); E.jobs.set(mj.id, mj);
      relay.mode = 'unreachable'; await E._ensurePublish(mj);
      relay.mode = 'tcp'; await E._ensurePublish(mj);
      const atOnce = said.slice();
      relay.mode = 'ok'; await E._ensurePublish(mj); // inside the grace: the keep-up restart's / the boot replay's read, right this time
      const out = { atOnce, said: said.slice(), url: mj.publishedUrl, pending: mj.urlPending || null, check: !!mj._urlCheck, timers: (E._urlTimers || new Set()).size }; // the FACTS: no check, no timer left to speak later
      stopEngine(E); cur = null; relay.mode = 'ok'; return out;
    };
    const m1 = await misread(JobManager, 'mis');
    ok(m1.atOnce.length === 2 && /is DOWN/.test(m1.atOnce[0]) && /back UP/.test(m1.atOnce[1]) && m1.atOnce[1].includes(URL0) && !m1.atOnce[1].includes('tcp://') && m1.said.length === 2 && m1.url === URL0 && !m1.pending && !m1.check && m1.timers === 0,
      'B-74f5 r3 (L1 / L3): DOWN said, then a tcp MISREAD of the web address — «back UP» at the web address AT ONCE (the misread changes nothing it says), and the later right read ends the check and its timer: nothing is left to speak (the round-2 hole: the held «back UP» was dropped in silence)', JSON.stringify(m1));
    const NOTIFY = '    if (v.notice) this._notifyOwner(job, { what: v.notice.what });';
    const JMm = mcB('job-notice-b74f5-mis', ROOT).load('src/jobs.js', anchored(JSr, NOTIFY, "    if (v.notice && !(v.notice.kind === 'recovered' && next.url !== job.lastPublicUrl)) this._notifyOwner(job, { what: v.notice.what });", 'B-74f5 r3 control: the round-2 hold'), 'held').JobManager;
    const m0 = await misread(JMm, 'mi0');
    ok(m0.said.length === 1 && /is DOWN/.test(m0.said[0]), 'RED CONTROL (B-74f5 r3 (L1)): a recovery held behind the raw address\'s check is dropped when the right read clears it — told DOWN, never told UP', JSON.stringify(m0.said));
    // (smalls) a check whose job ENDED says nothing; a keep-up service's CRASH keeps the change for its respawn; the engine's STOP ends
    // its checks; an EXHAUSTED pending pair leaves the record. Each waits for a FACT (the check's journal line, the timers, the check)
    const waitLine = async (id, re, ms = 3000) => { const t0 = Date.now(); while (!lines.some((l) => l.includes(id) && re.test(l)) && Date.now() - t0 < ms) await new Promise((res) => setTimeout(res, 10)); return lines.find((l) => l.includes(id) && re.test(l)) || null; };
    const ended = async (JM, tag) => {
      said.length = 0; lines.length = 0; answering.clear(); answering.add(TCP0);
      const E = mkU(JM, tag, { urlGraceMs: 80, urlRelookMs: 20 }), ej = jobU(tag); E.jobs.set(ej.id, ej);
      relay.mode = 'tcp'; await E._ensurePublish(ej); ej.state = 'down'; ej.desiredUp = false; // stopped for good: no longer wanted up
      const line = await waitLine(ej.id, /a public URL check ended with the job|public URL changed/);
      const out = { said: said.slice(), pending: ej.urlPending || null, line }; stopEngine(E); cur = null; relay.mode = 'ok'; return out;
    };
    const e1 = await ended(JobManager, 'end');
    ok(e1.said.length === 0 && !e1.pending && /ended with the job/.test(e1.line || ''), 'B-74f5 (small): a change check whose job is no longer wanted up says nothing about a service no longer there, and its pending pair leaves the record (its journal line)', JSON.stringify(e1));
    const ENDIF = "      if (!['up', 'starting'].includes(job.state)) { // follow-up: a keep-up service between a crash and its respawn keeps its pending change (the respawn's publish read looks again); a job no longer wanted up says nothing";
    const e0 = await ended(mcB('job-notice-b74f5-end', ROOT).load('src/jobs.js', anchored(JSr, ENDIF, '      if (false) {', 'B-74f5 control: no job-ended block'), 'no-ended').JobManager, 'en0');
    ok(e0.said.length === 1 && /public URL CHANGED/.test(e0.said[0]), 'RED CONTROL (B-74f5 (small)): without the job-ended block the check speaks about a service that is gone', JSON.stringify(e0.said));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
    // (follow-up (1)) a keep-up service CRASHES inside the grace (state down, still wanted up): the pending change waits for its respawn,
    // whose publish read looks again — a real move is said once (r3 dropped the pair in silence at the crash)
    const crash = async (JM, tag) => {
      said.length = 0; lines.length = 0; answering.clear(); answering.add(URL1);
      const E = mkU(JM, tag, { urlGraceMs: 80, urlRelookMs: 20 }), cj = jobU(tag); E.jobs.set(cj.id, cj);
      relay.mode = 'moved'; await E._ensurePublish(cj); cj.state = 'down'; // crashed; desiredUp stays true — the keep-up respawn follows
      const atCrash = await waitLine(cj.id, /a public URL check (waits|ended)/);
      const kept = cj.urlPending ? { ...cj.urlPending } : null;
      cj.state = 'up'; cj.runs = [{ startedAt: Date.now(), trigger: 'restart' }]; await E._ensurePublish(cj); // the respawn's publish read
      const started = !!cj._urlCheck; if (started) await waitLine(cj.id, /public URL changed/);
      const out = { atCrash, kept, started, said: said.slice() }; stopEngine(E); cur = null; relay.mode = 'ok'; return out;
    };
    const k1 = await crash(JobManager, 'crs');
    ok(/waits for the service to run again/.test(k1.atCrash || '') && k1.kept && k1.kept.from === URL0 && k1.started && k1.said.length === 1 && /public URL CHANGED/.test(k1.said[0]) && k1.said[0].includes(URL1),
      'B-74f5 follow-up (1): a keep-up service that crashes inside the grace keeps its pending change (the journal says it waits); the respawn\'s publish read checks it and the real move is said ONCE', JSON.stringify(k1));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
    const WAITLINE = "        if (job.desiredUp) { this.d.log(`[jobs] ${job.id}: a public URL check waits for the service to run again (its pending change is kept)`); return; }";
    const k0 = await crash(mcB('job-notice-b74f5-crs', ROOT).load('src/jobs.js', anchored(JSr, WAITLINE, '', 'B-74f5 control: the crash drops the pair'), 'crash-drops').JobManager, 'cr0');
    ok(!k0.started && k0.said.length === 0, 'RED CONTROL (B-74f5 follow-up (1)): a check that treats the crash as the job\'s end drops the pair — the respawn checks nothing and the real move is never said', JSON.stringify(k0));
    const stopped = async (JM, tag) => {
      said.length = 0; lines.length = 0; answering.clear(); answering.add(TCP0);
      const E = mkU(JM, tag, { urlGraceMs: 100, urlRelookMs: 20 }), sj = jobU(tag); E.jobs.set(sj.id, sj);
      relay.mode = 'tcp'; await E._ensurePublish(sj); const before = (E._urlTimers || new Set()).size;
      stopEngine(E); cur = null; relay.mode = 'ok';
      return { before, after: (E._urlTimers || new Set()).size }; // the FACT: the stopped engine holds no timer that could speak
    };
    const p1 = await stopped(JobManager, 'stp');
    ok(p1.before === 1 && p1.after === 0, 'B-74f5 r3 (small): the engine\'s stop clears its URL checks — a stopped engine holds no timer that could speak', JSON.stringify(p1));
    const STOPCLR = '  shutdown() { for (const t of this._urlTimers || []) clearTimeout(t); this._urlTimers = new Set(); /* B-74f5 r3: the URL checks end with the engine */ ';
    const p0 = await stopped(mcB('job-notice-b74f5-stp', ROOT).load('src/jobs.js', anchored(JSr, STOPCLR, '  shutdown() { ', 'B-74f5 r3 control: no timers cleared at the stop'), 'no-stop-clear').JobManager, 'st0');
    ok(p0.after === 1, 'RED CONTROL (B-74f5 r3 (small)): a stop that leaves the URL timers keeps one that would speak for a stopped engine', JSON.stringify(p0));
    const exhaust = async (JM, tag, { teardown = false, newRun = false } = {}) => {
      said.length = 0; lines.length = 0; answering.clear(); // nothing answers: every round is inconclusive
      const E = mkU(JM, tag, { urlGraceMs: 60, urlCheckEveryMs: 20, urlRelookMs: 20 }), xj = jobU(tag); E.jobs.set(xj.id, xj);
      const rounds = [];
      for (let k = 0; k < 3; k++) { const n0 = lines.length; relay.mode = 'tcp'; await E._ensurePublish(xj); const t0 = Date.now(); while (!lines.slice(n0).some((l) => l.includes(xj.id) && /was not said/.test(l)) && Date.now() - t0 < 1500) await new Promise((res) => setTimeout(res, 10)); rounds.push({ pending: xj.urlPending ? xj.urlPending.rounds : null, newLine: lines.slice(n0).find((l) => l.includes(xj.id)) || null }); }
      relay.mode = 'tcp'; await E._ensurePublish(xj); const fourth = !!xj._urlCheck; // the FACT: a fourth read starts no check
      let afterMove = null;
      if (teardown || newRun) { // follow-up (2): the give-up mark ends with the teardown / a new run — a later REAL move to that address is said
        if (teardown) await E._teardownPublish(xj); else xj.runs = [{ startedAt: Date.now() + 1, trigger: 'restart' }];
        answering.add(TCP0); relay.mode = 'tcp'; await E._ensurePublish(xj); const started = !!xj._urlCheck; if (started) await waitLine(xj.id, /public URL changed/);
        afterMove = { started, said: said.slice() };
      }
      const out = { rounds, fourth, afterMove, said: said.slice() }; stopEngine(E); cur = null; relay.mode = 'ok'; return out;
    };
    const x1 = await exhaust(JobManager, 'exh');
    ok(x1.said.length === 0 && x1.rounds[0].pending === 1 && x1.rounds[1].pending === 2 && x1.rounds[2].pending === null && /after 3 rounds \(dropped\)/.test(x1.rounds[2].newLine || '') && x1.fourth === false,
      'B-74f5 (small): a change not said is looked at again at the next publish reads, three rounds — then its pending pair LEAVES the record and a fourth read starts no check', JSON.stringify(x1.rounds));
    const ROUNDLINE = '        if (rounds + 1 < URL_ROUNDS) {';
    const x0 = await exhaust(mcB('job-notice-b74f5-exh', ROOT).load('src/jobs.js', anchored(JSr, ROUNDLINE, '        if (true) {', 'B-74f5 r3 control: never dropped'), 'never-dropped').JobManager, 'ex0');
    ok(x0.rounds[2].pending !== null && x0.fourth === true, 'RED CONTROL (B-74f5 (small)): a pair never dropped stays in the record and a fourth read starts its looks again', JSON.stringify({ rounds: x0.rounds.map((r) => r.pending), fourth: x0.fourth }));
    const g1 = await exhaust(JobManager, 'gtd', { teardown: true }), g2 = await exhaust(JobManager, 'gnr', { newRun: true });
    ok(g1.afterMove && g1.afterMove.started && g1.afterMove.said.length === 1 && /public URL CHANGED/.test(g1.afterMove.said[0]) && g2.afterMove && g2.afterMove.started && g2.afterMove.said.length === 1,
      'B-74f5 follow-up (2): the give-up mark ends with the teardown and with a new run — a later REAL move to the given-up address is checked and said once', JSON.stringify({ teardown: g1.afterMove, newRun: g2.afterMove }));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
    const GIVEUP = '  _urlGaveUp(job, from, to) { const g = job._urlGaveUp; return !!(g && g.key === `${from} ${to}` && g.run === this._runStartOf(job)); }';
    const TEARCLR = 'this._endUrlCheck(job); delete job.urlPending; delete job._urlGaveUp; // B-74f5';
    const JMg = mcB('job-notice-b74f5-giveup', ROOT).load('src/jobs.js', anchored(anchored(JSr, GIVEUP, '  _urlGaveUp(job, from, to) { const g = job._urlGaveUp; return !!(g && g.key === `${from} ${to}`); }', 'B-74f5 control: the mark for the process\'s life'), TEARCLR, 'this._endUrlCheck(job); delete job.urlPending; // B-74f5', 'B-74f5 control: the teardown keeps the mark'), 'giveup-for-life').JobManager;
    const g0a = await exhaust(JMg, 'g0t', { teardown: true }), g0b = await exhaust(JMg, 'g0n', { newRun: true });
    ok(!g0a.afterMove.started && g0a.afterMove.said.length === 0 && !g0b.afterMove.started && g0b.afterMove.said.length === 0, 'RED CONTROL (B-74f5 follow-up (2)): a give-up mark for the life of the process — after the teardown or a new run the real move to that address is never checked nor said', JSON.stringify({ teardown: g0a.afterMove, newRun: g0b.afterMove }));
    // (b1) THE JOB'S OWN RESTART opens the grace: the hub up for 10 minutes, the service's run started just now. The leg judges the
    // wait ON THE CLOCK THAT SCHEDULES IT (主开发 2026-11-20 01:52Z: a red of 299 against 300, once): the product reads Date.now()
    // and hands setTimeout a delay, and a Node timer is due on the event loop's own clock (cached at the loop's turn, whole
    // milliseconds), so by Date.now() it may FIRE a millisecond early. So the leg records each setTimeout call of the publish
    // (its delay and Date.now() at the call) and judges the URL check's timer by its DUE INSTANT on Date.now(): exact arithmetic,
    // no slack. When it fires does not matter: the check looks when it fires, with no «too early» test of its own.
    // the flake census round 2 (主开发 r4456, its find at the RED CONTROL below): `graceMs` the grace planted, `wait` whether the check is
    // awaited (a planted grace of a minute is judged by its SCHEDULE alone, its timer never awaited), `hold` a PLACED hold of the loop
    // between the run's start and the publish (what a loaded box does to the call that schedules the check)
    const own = async (JM, tag, { graceMs = 300, wait = true, hold = 0 } = {}) => {
      said.length = 0; lines.length = 0;
      const E = mkU(JM, tag, { urlGraceMs: graceMs, urlRelookMs: 20, urlAnswers: async (u) => u === TCP0 }); E._bootAt = Date.now() - 600_000;
      const runStart = Date.now(); const oj = jobU(tag, { runs: [{ startedAt: runStart, trigger: 'restart' }] }); E.jobs.set(oj.id, oj);
      if (hold) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, hold);
      const realSetTimeout = globalThis.setTimeout, scheduled = new Map();
      globalThis.setTimeout = (fn, ms, ...a) => { const at = Date.now(), t = realSetTimeout(fn, ms, ...a); scheduled.set(t, { at, ms: Number(ms) || 0 }); return t; };
      try { relay.mode = 'tcp'; await E._ensurePublish(oj); } finally { globalThis.setTimeout = realSetTimeout; }
      const urlTimer = [...(E._urlTimers || [])].map((t) => scheduled.get(t)).find(Boolean) || null; // the URL check's own timer, by the engine's own set
      if (wait) await waitLine(oj.id, /public URL changed/);
      const out = { said: said.slice(), dueAfterStart: urlTimer ? urlTimer.at + urlTimer.ms - runStart : null, urlTimer, graceMs }; stopEngine(E); cur = null; relay.mode = 'ok'; return out;
    };
    const o1 = await own(JobManager, 'own');
    ok(o1.dueAfterStart !== null && o1.dueAfterStart >= 300 && o1.said.length === 1, 'B-74f5 r2 (b): a service\'s OWN restart (its run 0 s old, the hub 10 min up) opens the grace too — its URL check is DUE no earlier than the run\'s start + the grace (judged on Date.now(), the clock the product schedules with)', JSON.stringify(o1));
    const START = '    const start = Math.max(this._bootAt || 0, this._relayAt || 0, this._runStartOf(job));';
    const JMo = mcB('job-notice-b74f5-own', ROOT).load('src/jobs.js', anchored(JSr, START, '    const start = Math.max(this._bootAt || 0, this._relayAt || 0);', 'B-74f5 r2 control: no grace from the job\'s start'), 'no-own-grace').JobManager;
    // r4456: the RED CONTROL read its grace on a CLOCK — the mutant's check due «< 300 ms» after the run's start — and a publish that ran
    // 300 ms late on a loaded box made the mutant's due look like the grace, with nothing wrong. The grace is PLANTED at a minute (no box is
    // that late) and the schedule judged against it, the timer never awaited: the fixed engine's check is due no earlier than the run's
    // start + the grace; the mutant's at once (inside it). The same under a PLACED hold of 320 ms; and the old reading, placed, shown wrong.
    const LONG = 60_000;
    const oL = await own(JobManager, 'owL', { graceMs: LONG, wait: false }), o0 = await own(JMo, 'ow0', { graceMs: LONG, wait: false });
    ok(oL.dueAfterStart !== null && oL.dueAfterStart >= LONG && o0.dueAfterStart !== null && o0.dueAfterStart < LONG, 'RED CONTROL (B-74f5 r2 (b)), by the SCHEDULE: a grace measured from the hub\'s start only makes the job\'s restart\'s check DUE at once, inside its own grace — the grace planted at a minute, judged against it (the fixed engine\'s check due after it)', JSON.stringify({ fixed: oL.dueAfterStart, mutant: o0.dueAfterStart }));
    const oLh = await own(JobManager, 'owLh', { graceMs: LONG, wait: false, hold: 320 }), o0h = await own(JMo, 'ow0h', { graceMs: LONG, wait: false, hold: 320 });
    ok(oLh.dueAfterStart !== null && oLh.dueAfterStart >= LONG && o0h.dueAfterStart !== null && o0h.dueAfterStart < LONG, 'PLACED: the loop held 320 ms between the run\'s start and the publish — the schedule reads the same (fixed: after the grace; mutant: inside it)', JSON.stringify({ fixed: oLh.dueAfterStart, mutant: o0h.dueAfterStart }));
    const pl0 = await own(JMo, 'ow0p', { graceMs: 300, wait: false, hold: 320 });
    ok(pl0.dueAfterStart !== null && pl0.dueAfterStart >= 300, `PLACED (the find): with the 300 ms grace and the same 320 ms hold, the mutant's check reads due ${pl0.dueAfterStart} ms after the run's start — the old reading («< 300») called it the grace: a clock, so the control is judged by the schedule now`, JSON.stringify(pl0));
    const twice = async (JM, tag) => {
      said.length = 0; lines.length = 0; const asked = new Map();
      const E = mkU(JM, tag, { urlAnswers: async (u) => { const n = (asked.get(u) || 0) + 1; asked.set(u, n); return u === TCP0 || (u === URL0 && n > 1); } });
      const tj = jobU(tag); E.jobs.set(tj.id, tj);
      relay.mode = 'tcp'; await E._ensurePublish(tj); await settle(E, tj.id);
      const out = { said: said.slice(), url: tj.publishedUrl, line: lines.find((l) => l.includes(tj.id) && /not said|changed/.test(l)) || null }; stopEngine(E); cur = null; relay.mode = 'ok'; return out;
    };
    const t1 = await twice(JobManager, 'two');
    ok(t1.said.length === 0 && t1.url === URL0 && /both addresses answer/.test(t1.line || ''), 'B-74f5 r2 (b): one missed look at the old address is not «failed» — the second look 15 s later (40 ms here) finds it answering (the tcp one answers too: «both addresses answer»): nothing said, the https address kept', JSON.stringify(t1));
    const CONFIRM = '      if (v.say && !confirm) { this._checkUrlChange(job, from, to, { ...next, confirm: true }); return; } // «the old one failed» is seen twice';
    const JMt = mcB('job-notice-b74f5-two', ROOT).load('src/jobs.js', anchored(JSr, CONFIRM, '', 'B-74f5 r2 control: one look'), 'one-look').JobManager;
    const t0 = await twice(JMt, 'tw0');
    ok(t0.said.length === 1 && /public URL CHANGED/.test(t0.said[0]), 'RED CONTROL (B-74f5 r2 (b)): one look decides «failed» — the address that answered a moment later is said to be gone', JSON.stringify(t0.said));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
    // (should) A HUB RESTART INSIDE THE GRACE: the pending pair is on disk — the next engine checks the change and says it once
    const restart = async (JM, tag, { down = false } = {}) => { // (down: a «DOWN» said before the move — the recovery names both, and the restart must keep that it did)
      said.length = 0; lines.length = 0; answering.clear(); answering.add(URL1);
      const d = path.join(dir, 'b74f5r2-' + tag);
      const E1 = mk(JM, d, pf, { urlGraceMs: 60_000, urlCheckEveryMs: 40, urlRelookMs: 40, urlAnswers: async (u) => answering.has(u), log: (...a) => lines.push(a.join(' ')) }); cur = E1;
      const rj = jobU(tag); E1.jobs.set(rj.id, rj);
      if (down) { relay.mode = 'unreachable'; await E1._ensurePublish(rj); }
      relay.mode = 'moved'; await E1._ensurePublish(rj); stopEngine(E1); rj._urlCheck = null; // (the first engine's pending look ends with it)
      const E2 = mk(JM, d, pf, { urlGraceMs: 0, urlCheckEveryMs: 40, urlRelookMs: 40, urlAnswers: async (u) => answering.has(u), log: (...a) => lines.push(a.join(' ')) }); cur = E2;
      const g = E2.jobs.get(rj.id); const onDisk = g ? { last: g.lastPublicUrl, pending: g.urlPending || null } : null;
      if (g) { g.state = 'up'; await E2._ensurePublish(g); if (g._urlCheck) await settle(E2, rj.id); } // the FACT: no check started, nothing to wait for
      const out = { onDisk, said: said.slice(), confirmed: lines.some((l) => l.includes(rj.id) && /confirmed: the recovery already named both addresses/.test(l)) }; stopEngine(E2); cur = null; relay.mode = 'ok'; return out;
    };
    const s1 = await restart(JobManager, 'rst');
    ok(s1.onDisk && s1.onDisk.last === URL1 && s1.onDisk.pending && s1.onDisk.pending.from === URL0 && s1.said.length === 1 && /public URL CHANGED/.test(s1.said[0]) && s1.said[0].includes(URL0) && s1.said[0].includes(URL1),   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
      'B-74f5 r2 (should): a hub restart inside the grace keeps the pending change on disk (urlPending) — the next engine checks it and says it once', JSON.stringify(s1));
    const PEND = '      if (pend && pend.to === url && pend.from !== url) {';
    const JMs = mcB('job-notice-b74f5-rst', ROOT).load('src/jobs.js', anchored(JSr, PEND, '      if (false) {', 'B-74f5 r2 control: the pending pair never read again'), 'no-pending').JobManager;
    const s0 = await restart(JMs, 'rs0');
    ok(s0.said.length === 0, 'RED CONTROL (B-74f5 r2 (should)): an engine that never reads the pending pair loses the true change across the restart (nothing said)', JSON.stringify(s0.said));
    // (follow-up (4)) «named» RIDES THE PENDING PAIR across a hub restart: DOWN said, the recovery at B named both; the hub restarts
    // inside the grace — the next engine's check only confirms it (a journal line), never a second wake
    const n1 = await restart(JobManager, 'rnm', { down: true });
    ok(n1.onDisk && n1.onDisk.pending && n1.onDisk.pending.named === true && n1.said.length === 2 && /is DOWN/.test(n1.said[0]) && /back UP at/.test(n1.said[1]) && n1.confirmed,
      'B-74f5 follow-up (4): «named» rides the pending pair across a hub restart — the recovery named both addresses, so the next engine\'s check only confirms (a journal line): ONE wake for the event', JSON.stringify(n1));
    const PENDSET = '    job.urlPending = { from, to, rounds, ...(named ? { named: true } : {}) };';
    const n0 = await restart(mcB('job-notice-b74f5-rnm', ROOT).load('src/jobs.js', anchored(JSr, PENDSET, '    job.urlPending = { from, to, rounds };', 'B-74f5 control: named not kept on disk'), 'named-not-kept').JobManager, 'rn0', { down: true });
    ok(n0.said.length === 3 && /public URL CHANGED/.test(n0.said[2]), 'RED CONTROL (B-74f5 follow-up (4)): a pending pair that forgets «named» across the restart says the move a second time', JSON.stringify(n0.said));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
    // (follow-up (4)) a move B → C after a NAMED A → B is a new event — said once
    const waitNew = async (id, re, n0l, ms = 3000) => { const t0 = Date.now(); while (!lines.slice(n0l).some((l) => l.includes(id) && re.test(l)) && Date.now() - t0 < ms) await new Promise((res) => setTimeout(res, 10)); };
    const bc = async (JM, tag) => {
      said.length = 0; lines.length = 0; answering.clear(); answering.add(URL1);
      const E = mkU(JM, tag, { urlGraceMs: 60, urlRelookMs: 20 }), cj = jobU(tag); E.jobs.set(cj.id, cj);
      relay.mode = 'unreachable'; await E._ensurePublish(cj);
      relay.mode = 'moved'; await E._ensurePublish(cj); await waitNew(cj.id, /confirmed: the recovery already named both addresses/, 0);
      const n0l = lines.length; answering.clear(); answering.add(URL2); relay.mode = 'moved2'; await E._ensurePublish(cj); await waitNew(cj.id, /public URL changed|was not said/, n0l);
      const out = { said: said.slice() }; stopEngine(E); cur = null; relay.mode = 'ok'; return out;
    };
    const c1 = await bc(JobManager, 'b2c');
    ok(c1.said.length === 3 && /is DOWN/.test(c1.said[0]) && /back UP at/.test(c1.said[1]) && /public URL CHANGED/.test(c1.said[2]) && c1.said[2].includes(URL1) && c1.said[2].includes(URL2),
      'B-74f5 follow-up (4): after a NAMED recovery A → B, a later real move B → C is a new event — said once («CHANGED B → C»)', JSON.stringify(c1.said));   // stale-pins: kept — the notice's words at run time (src/job-notice.js urlChangeWords now)
    const ADOPTCALL = '    this._checkUrlChange(job, before, url, { named: named || !!(same && pend.named), rounds: same ? Number(pend.rounds) || 0 : 0 });';
    const c0 = await bc(mcB('job-notice-b74f5-b2c', ROOT).load('src/jobs.js', anchored(JSr, ADOPTCALL, '    this._checkUrlChange(job, before, url, { named: true, rounds: same ? Number(pend.rounds) || 0 : 0 });', 'B-74f5 control: named sticks to the next pair'), 'named-sticky').JobManager, 'b20');
    ok(c0.said.length === 2, 'RED CONTROL (B-74f5 follow-up (4)): a «named» that sticks to the next pair silences the real move B → C', JSON.stringify(c0.said));
    // (follow-up (4)) THE REAL LOOK (`_urlAnswers`, no stand-in) over loopback: a 200 answers; the relay's own 404 page (its body names
    // frp) does NOT, another 404 does; a 502 does not; a 404 body is read only to its bound (a page that never ends still decides); a
    // server that never answers is a no at the look's bound; a tcp connect answers, a closed port does not; a self-signed https
    // backend answers (its certificate not judged)
    const nodeNet = require('net'), nodeHttps = require('https'), { spawnSync: spawnS } = require('child_process');
    const pageSrv = http.createServer((q, r) => {
      if (q.url === '/ok') { r.end('ok'); return; }
      if (q.url === '/frp404') { r.statusCode = 404; r.end('<html><body>The page you visit not found.<br>Faithfully yours, frp.</body></html>'); return; }
      if (q.url === '/plain404') { r.statusCode = 404; r.end('Not Found'); return; }
      if (q.url === '/bad') { r.statusCode = 502; r.end('bad gateway'); return; }
      if (q.url === '/stream404') { r.statusCode = 404; r.write('x'.repeat(5000)); return; } // never ends: the bound decides
      /* /hang: never answered */
    });
    await new Promise((res) => pageSrv.listen(0, '127.0.0.1', res));
    const tcpSrv = nodeNet.createServer((c) => c.end()); await new Promise((res) => tcpSrv.listen(0, '127.0.0.1', res));
    const gone = nodeNet.createServer(); await new Promise((res) => gone.listen(0, '127.0.0.1', res)); const gonePort = gone.address().port; await new Promise((res) => gone.close(res));
    const certDir = path.join(dir, 'b74f5-cert'); fs.mkdirSync(certDir, { recursive: true });
    const ssl = spawnS('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(certDir, 'k.pem'), '-out', path.join(certDir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore', timeout: 20000 });
    const tlsSrv = !ssl.error && ssl.status === 0 ? nodeHttps.createServer({ key: fs.readFileSync(path.join(certDir, 'k.pem')), cert: fs.readFileSync(path.join(certDir, 'c.pem')) }, (q, r) => r.end('ok')) : null;
    if (tlsSrv) await new Promise((res) => tlsSrv.listen(0, '127.0.0.1', res));
    const P1 = pageSrv.address().port, base = `http://127.0.0.1:${P1}`;
    const realLooks = async (JM, tag) => {
      const E = mk(JM, path.join(dir, 'b74f5-looks-' + tag), pf, { urlLookMs: 150 }); // (no urlAnswers: the real look)
      const at = async (u) => E._urlAnswers(u);
      const out = { ok: await at(base + '/ok'), frp404: await at(base + '/frp404'), plain404: await at(base + '/plain404'), bad: await at(base + '/bad'), stream404: await at(base + '/stream404'), hang: await at(base + '/hang'),
        tcp: await at(`tcp://127.0.0.1:${tcpSrv.address().port}`), tcpGone: await at(`tcp://127.0.0.1:${gonePort}`), tls: tlsSrv ? await at(`https://127.0.0.1:${tlsSrv.address().port}/`) : null };
      stopEngine(E); return out;
    };
    const r1 = await realLooks(JobManager, 'real');
    ok(r1.ok === true && r1.frp404 === false && r1.plain404 === true && r1.bad === false && r1.stream404 === true && r1.hang === false && r1.tcp === true && r1.tcpGone === false,
      'B-74f5 follow-up (4): THE REAL LOOK over loopback — a 200 answers; the relay\'s own 404 page does not, another 404 does; a 502 does not; a never-ending 404 decides at its 4 KB bound; a silent server is a no at the look\'s bound; a tcp connect answers, a closed port does not', JSON.stringify(r1));
    if (tlsSrv) ok(r1.tls === true, 'B-74f5 follow-up (4): a self-signed https backend ANSWERS — its certificate is not judged', JSON.stringify(r1.tls));
    else console.log('  · SKIP B-74f5 the certificate look: no openssl on this machine to make a self-signed certificate');
    const FRP404 = '          if (st !== 404) { fin(st > 0 && st < 500); return; }';
    const BOUND = "          let body = ''; r.on('data', (d) => { body += d.toString('latin1'); if (body.length > 4096) fin(!/\\bfrp\\b/i.test(body)); });";
    const CERT = 'rejectUnauthorized: false, ';
    // (two copies: without the relay-page rule no 404 body is read at all — the bound needs a copy of its own)
    const JMr = mcB('job-notice-b74f5-looks', ROOT).load('src/jobs.js', anchored(anchored(JSr, FRP404, '          { fin(st > 0 && st < 500); return; }', 'B-74f5 control: no relay-page rule'), CERT, 'rejectUnauthorized: true, ', 'B-74f5 control: the certificate judged'), 'looks-base').JobManager;
    const r0 = await realLooks(JMr, 'base');
    ok(r0.frp404 === true && (!tlsSrv || r0.tls === false), 'RED CONTROL (B-74f5 follow-up (4)): a look without the relay-page rule takes the relay\'s 404 for an answer, and one that judges the certificate refuses the self-signed backend', JSON.stringify(r0));
    const JMunbound = mcB('job-notice-b74f5-bound', ROOT).load('src/jobs.js', anchored(JSr, BOUND, "          let body = ''; r.on('data', (d) => { body += d.toString('latin1'); });", 'B-74f5 control: no body bound'), 'looks-unbound').JobManager;
    const rb = await realLooks(JMunbound, 'unbound');
    ok(rb.stream404 === false && rb.plain404 === true, 'RED CONTROL (B-74f5 follow-up (4)): a look without the body bound waits out a 404 that never ends and calls it a no (its own bound) — another 404 still answers', JSON.stringify(rb));
    for (const sv of [pageSrv, tcpSrv, tlsSrv].filter(Boolean)) { try { sv.closeAllConnections?.(); } catch { } sv.close(); }
  }

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

// ── §3 THE DROPPED LOGIN in the Ports manager's re-publish (lane frp-token-proof) ────────────────────────────────────────
console.log('§3 the dropped login — the Ports manager says it ONCE per episode, never a line per forward per sweep');
{
  const { PortForwardManager } = require('../src/port-forward.js');
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-job-notice-pf-'));
  const svcs = [0, 1, 2].map(() => http.createServer((q, r) => r.end('ok')));
  try {
    for (const sv of svcs) await new Promise((r) => sv.listen(0, '127.0.0.1', r));
    const relay = { mode: 'dropped', n: 0 };
    const plugins = {
      async frpPublish(name) { relay.n++; if (relay.mode === 'dropped') throw DROPPED(3 + relay.n); if (relay.mode === 'unreachable') throw UNREACH(relay.n); return { name, subdomain: 'vs' + name.slice(-10).replace(/[^a-z0-9]/g, '0'), proto: 'http', url: 'https://' + name.replace(/[^a-z0-9-]/g, '-') + '.relay.test/' }; },
      async frpUnpublish() { return { ok: true }; },
    };
    const lines = [];
    const pf = new PortForwardManager({ hosts: { list: () => [] }, dataDir: d3, plugins, broadcast: () => { }, log: (l) => lines.push(String(l)), getJobs: () => null });
    clearInterval(pf._watch);
    const recs = [];
    for (let i = 0; i < 3; i++) { const r = await pf.forward('__local__', svcs[i].address().port, { label: 'svc ' + i }); const rec = pf._state.forwards.find((x) => x.id === r.id); rec.publicUrl = 'https://old' + i + '.relay.test/'; recs.push(rec); }
    for (let sweep = 0; sweep < 3; sweep++) for (const r of recs) await pf._republish(r);
    const dropLines = lines.filter((l) => /closes the connection right after/.test(l));
    ok(relay.n === 9 && dropLines.length === 1, `three forwards × three sweeps against the dropped relay ⇒ ONE journal line (was one per forward per sweep: ${relay.n} attempts, ${dropLines.length} line(s))`, JSON.stringify(dropLines.map((l) => l.slice(0, 80))));
    ok(recs.every((r) => /^public URL down — the relay accepts this instance's login but closes the connection right after/.test(r.error || '')), 'each forward\'s error carries the relay\'s words (never «retrying republish» alone, never «DNS»)', JSON.stringify(recs.map((r) => r.error)));
    ok(!lines.some((l) => /DNS|could not allocate a public port/.test(l)), 'no line says «DNS» or «a public port» — nothing was refused');
    relay.mode = 'ok'; await pf._republish(recs[0]);
    relay.mode = 'dropped'; await pf._republish(recs[1]);
    ok(lines.filter((l) => /closes the connection right after/.test(l)).length === 2, 'a publish that ran ends the episode: the next drop is said again (once)');
    relay.mode = 'unreachable'; lines.length = 0;
    for (const r of recs) await pf._republish(r);
    ok(lines.filter((l) => /^re-publish pf-/.test(l)).length === 3, 'any other failure is still said per forward (the drop alone is the relay\'s state)', JSON.stringify(lines));
    for (const r of recs) { const l = pf._live.get(r.id); if (l) { try { l.server.close(); } catch { } for (const so of l.sockets) try { so.destroy(); } catch { } } }
  } finally { for (const sv of svcs) try { sv.close(); } catch { } fs.rmSync(d3, { recursive: true, force: true }); }
}
// r3228 (round whu7689zw): the held-list legs of the jobs engine's forwards moved to scripts/test-job-forwards.mjs (the reconcile)
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
