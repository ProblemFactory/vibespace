#!/usr/bin/env node
// lane jobs-browser (B-dbc1) — A BACKGROUND WORK JOB BROWSES AS ITS OWNER CONVERSATION (fast, in-process).
//   ① the PURE principal (src/browser-job-principal.js): the verdict table, the route lists (a CENSUS over every
//      /api/agent/browser/* route in src/routes/browser.js — each in exactly one list), the profile verdict, the
//      handle + release rules
//   ② ADMISSION = THE OWNER'S, through the real browser-profiles.mayAttach: a job's child handle is admitted exactly
//      where its owner conversation is, refused `not_owner` where the owner is
//   ③ three MUTANT-COPY controls (scripts/mutant-copy.mjs) — a weakened rule turns named rows red
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { deadPort, anchored } from './scratch.mjs';
import { withUse } from './grant-fixtures.mjs';   // lane grants-unify: a hand-built record's list mirrored from its pre-unify owner
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const J = require(path.join(REPO, 'src/browser-job-principal.js'));
const B = require(path.join(REPO, 'src/browser-profiles.js'));
const W = require(path.join(REPO, 'src/browser-windows.js'));   // B-7a99: the rung-2 stand-in's RUNG2_CREATE (its line came from test-browser-windows with 066b90274, its import did not); no leg here asks rung 2 today (measured: 0 calls)

let pass = 0, fail = 0;
function ok(cond, name, detail) { if (typeof cond !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`);
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
}
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

const OWNER = 'bk-0000aaaa', OTHER = 'bk-0000bbbb';
const job = (o = {}) => ({ id: 'jb-11112222', name: 'daily reconcile', state: 'up', owner: { conversation: { id: 'conv-userW-1' } }, ...o });

// ── ① the principal ──
const PRINCIPAL_ROWS = [
  ['a running job of a conversation with a browser key', { job: job(), ownerKey: OWNER }, 'ok'],
  ['a starting job (spawned, not yet up) is running', { job: job({ state: 'starting' }), ownerKey: OWNER }, 'ok'],
  ['a FINISHED job (done) is refused — its token outlives its run', { job: job({ state: 'done' }), ownerKey: OWNER }, 'job_not_running'],
  ['a failed job', { job: job({ state: 'failed' }), ownerKey: OWNER }, 'job_not_running'],
  ['a service between restarts (down)', { job: job({ state: 'down' }), ownerKey: OWNER }, 'job_not_running'],
  ['an interrupted job', { job: job({ state: 'interrupted' }), ownerKey: OWNER }, 'job_not_running'],
  ['no job (an unknown token)', { job: null, ownerKey: OWNER }, 'unauthorized'],
  ['a job without an id', { job: { state: 'up' }, ownerKey: OWNER }, 'unauthorized'],
  ['a job with no owner conversation (created outside a conversation)', { job: job({ owner: { conversation: null } }), ownerKey: OWNER }, 'job_no_owner'],
  ['a job whose owner conversation never had a browser key', { job: job(), ownerKey: '' }, 'no_browser_key'],
  ['a CHILD key is never an owner key (a helper\'s handle cannot own a job\'s browsing)', { job: job(), ownerKey: OWNER + '.3' }, 'no_browser_key'],
  ['a malformed key', { job: job(), ownerKey: 'bk-XYZ' }, 'no_browser_key'],
];
function principalTable(M) {
  return PRINCIPAL_ROWS.map(([name, facts, want]) => {
    let v; try { v = M.jobPrincipalOf(facts); } catch (e) { v = { threw: e.message }; }
    const good = want === 'ok' ? !!(v && v.ok && v.principal && v.principal.kind === 'job' && v.principal.ownerKey === facts.ownerKey && v.principal.jobId === facts.job.id && v.principal.ownerConversationId === 'conv-userW-1')
      : !!(v && !v.ok && v.code === want && typeof v.error === 'string' && v.error.length > 10);
    return { name, want, v, good };
  });
}
console.log('— ① the principal table');
for (const r of principalTable(J)) ok(verdictOf(r.good), `${r.name} → ${r.want}`, r.v);
{ const L = (j) => String(j.name || j.id);   // the engine's ONE name accessor's contract (lane job-notify-user r5: src/jobs.js labelOf)
  ok(J.jobLabelOf(job(), L) === 'job daily reconcile' && J.jobLabelOf(job({ name: '' }), L) === 'job jb-11112222' && J.jobLabelOf(job({ name: 'x'.repeat(80) }), L).length === 44, 'jobLabelOf: "job <name>" (≤ 40 chars of it) through the accessor the caller hands, the id when unnamed');
  ok(J.jobLabelOf(job()) === 'job jb-11112222', 'jobLabelOf: no accessor ⇒ the job\'s ID — never the record\'s name (fail closed, r5)'); }

console.log('— ① the routes: every /api/agent/browser/* route is in exactly ONE list (a census of the source)');
const routesSrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
const ROUTES = [...new Set([...routesSrc.matchAll(/router\.(?:get|post|put|delete)\('\/api\/agent\/browser\/([a-z-]+)'/g)].map((m) => m[1]))];
ok(ROUTES.length >= 18, `the census reads the routes off the source (${ROUTES.length}: ${ROUTES.join(' ')})`);
const unlisted = ROUTES.filter((r) => !J.JOB_ROUTES_ALLOWED.includes(r) && !J.JOB_ROUTES_REFUSED.includes(r));
const both = ROUTES.filter((r) => J.JOB_ROUTES_ALLOWED.includes(r) && J.JOB_ROUTES_REFUSED.includes(r));
const ghosts = [...J.JOB_ROUTES_ALLOWED, ...J.JOB_ROUTES_REFUSED].filter((r) => !ROUTES.includes(r));
ok(!unlisted.length && !both.length && !ghosts.length, 'no route unlisted, none in both lists, no ghost entry (a new route must be judged for a job)', { unlisted, both, ghosts });
function routeTable(M) {
  const rows = [];
  for (const r of J.JOB_ROUTES_ALLOWED) rows.push({ name: `a job may call ${r}`, good: M.jobRouteVerdict(r).ok === true });
  for (const r of J.JOB_ROUTES_REFUSED) { const v = M.jobRouteVerdict(r); rows.push({ name: `a job is refused ${r} (job_token)`, good: v.ok === false && v.code === 'job_token' && v.error.includes(`"${r}"`) }); }
  for (const r of ['', 'teleport', 'profiles-all']) { const v = M.jobRouteVerdict(r); rows.push({ name: `FAIL CLOSED: an unknown route "${r}" is refused`, good: v.ok === false && v.code === 'job_token' }); }
  return rows;
}
for (const r of routeTable(J)) ok(verdictOf(r.good), r.name);

console.log('— ① the profile a job browses in = the owner\'s pin / attachment');
const set0 = (o = {}) => ({ attachments: [], pin: null, children: [], handles: [], defaultId: null, ...o });
function resolveTable(M) {
  const att = { profileId: 'p-work', alias: 'work', isDefault: true };
  const rows = [
    ['the owner\'s default attachment', B.resolveHandle({ set: set0({ attachments: [att], defaultId: 'p-work', handles: ['work'] }), handle: '' }), 'p-work'],
    ['the owner\'s attachment named by its alias', B.resolveHandle({ set: set0({ attachments: [att, { profileId: 'p-mail', alias: 'mail', isDefault: false }], defaultId: 'p-work', handles: ['work', 'mail'] }), handle: 'mail' }), 'p-mail'],
    ['the owner\'s pin (no lease yet)', { ok: true, kind: 'pin', profileId: 'p-bank' }, 'p-bank'],
    ['no pin, no attachment (the owner\'s temporary browser) ⇒ job_no_profile', { ok: true, kind: 'none' }, 'job_no_profile'],
    ['a helper\'s handle ⇒ job_no_profile', { ok: true, kind: 'child', handle: OWNER + '.1' }, 'job_no_profile'],
    ['an owner refusal passes through as it is (profile_changed)', { ok: false, code: 'profile_changed', error: 'x' }, 'profile_changed'],
    ['nothing at all ⇒ job_no_profile', null, 'job_no_profile'],
  ];
  return rows.map(([name, v, want]) => { const r = M.jobResolveVerdict(v); return { name, good: want.startsWith('p-') ? r.ok === true && r.profileId === want : r.ok === false && r.code === want, r }; });
}
for (const r of resolveTable(J)) ok(verdictOf(r.good), r.name, r.r);

console.log('— ① the handle and the release rule');
const children = {
  [OWNER + '.1']: { parent: OWNER, since: 1, sessionId: 's1' },                  // a helper
  [OWNER + '.2']: { parent: OWNER, since: 2, sessionId: null, job: 'jb-run' },   // a running job
  [OWNER + '.3']: { parent: OWNER, since: 3, sessionId: null, job: 'jb-done' },  // a finished job
  [OTHER + '.1']: { parent: OTHER, since: 4, sessionId: null, job: 'jb-run' },   // the same job id under ANOTHER owner key
  [OWNER + '.4']: { parent: OWNER, since: 5, sessionId: null, job: 'jb-gone' },  // a job the engine no longer knows
};
const running = (id) => id === 'jb-run';
function handleTable(M) {
  return [
    { name: 'jobHandleOf finds the job\'s handle under ITS owner', good: M.jobHandleOf(children, 'jb-run', OWNER) === OWNER + '.2' },
    { name: '…and under the other owner key, that one\'s', good: M.jobHandleOf(children, 'jb-run', OTHER) === OTHER + '.1' },
    { name: '…a helper\'s handle is never a job\'s', good: M.jobHandleOf(children, 'jb-xyz', OWNER) === null },
    { name: 'carriedJobHandles = the running jobs\' handles only', good: [...M.carriedJobHandles(children, running)].sort().join(',') === [OWNER + '.2', OTHER + '.1'].sort().join(',') },
    { name: 'THE RELEASE RULE: a finished job\'s and an unknown job\'s handles are released; a running one\'s and a helper\'s are not', good: M.jobChildrenToRelease(children, running).map((x) => x.handle).sort().join(',') === [OWNER + '.3', OWNER + '.4'].sort().join(',') },
    // r3571 (主开发 r3792): the law is turned — «could not be told» is never «not running». A throwing engine CARRIES every handle for
    // that run (said once by its code at the wiring); the first look once it can say judges each by facts (before: fail toward release)
    { name: '…a throwing engine carries every handle (r3571: «could not be told» is never «not running»)', good: M.jobChildrenToRelease(children, () => { throw new Error('down'); }).length === 0 && M.carriedJobHandles(children, () => { throw new Error('down'); }).size === 4 },
  ];
}
for (const r of handleTable(J)) ok(verdictOf(r.good), r.name);

// ── ② admission = the owner's ──
console.log('— ② admission through the REAL mayAttach: a job\'s handle is judged as its owner conversation');
const prof = (owner, label = 'work') => withUse({ id: 'p-' + label, label, owner, scopeAt: 1 });
const H = OWNER + '.2';
const ADMIT = [
  ['a profile for all conversations', prof({ kind: 'instance' }), [], true],
  ['a profile kept to the OWNER conversation', prof({ kind: 'only', who: [{ kind: 'session', id: OWNER }] }), [], true],
  ['a profile kept to ANOTHER conversation ⇒ not_owner (the owner is refused, so is its job)', prof({ kind: 'only', who: [{ kind: 'session', id: OTHER }] }), [], false],
  ['a profile kept to the owner\'s Task Group (the owner\'s groups are the job\'s)', prof({ kind: 'only', who: [{ kind: 'task', id: 'T-1' }] }), ['T-1'], true],
  ['a profile kept to a Task Group the owner is NOT in', prof({ kind: 'only', who: [{ kind: 'task', id: 'T-1' }] }), ['T-2'], false],
];
for (const [name, p, taskIds, want] of ADMIT) {
  const owner = B.mayAttach(p, { browserKey: OWNER, taskIds });
  const viaJob = B.mayAttach(p, { browserKey: H, taskIds });
  ok(owner.ok === want && viaJob.ok === want && (verdictOf(want) || (viaJob.code === 'not_owner' && owner.code === 'not_owner')), `${name}: owner ${owner.ok ? 'admitted' : owner.code}, job ${viaJob.ok ? 'admitted' : viaJob.code}`, { owner, viaJob });
}
{
  const p = prof({ kind: 'only', who: [{ kind: 'session', id: OWNER }] });
  const d = B.decideAttach({ profile: p, leases: [{ profileId: p.id, browserKey: OWNER, sessionId: 's1' }], browserKey: H, sessionId: null, now: 10, taskIds: [] });
  ok(gateOf(d.ok) && gateOf(d.created) && d.lease.browserKey === H, 'decideAttach: the job\'s handle gets its OWN lease beside the owner\'s (one window per holder)', d);
}


// ── ④ THE REAL-ENGINE LEG: a jbt_ token through the REAL routes + keeper over the fake target model ──
// (the harness — fake agent-browser 0.38.1 on PATH + the window/target model — is test-browser-windows ④'s, copied)
console.log('— ④ the real routes + keeper: a job gets its own lease + window in the owner\'s profile, is refused where the owner is, and is released at its end');
{
  const { scratch } = await import('./scratch.mjs');
  const ROOT = scratch('jbrw-leg'); fs.mkdirSync(ROOT, { recursive: true });
  const cleanups = []; process.on('exit', () => { for (const c of cleanups) { try { c(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
  const K = require('../src/server/browser-keeper.js'); const F = require('../src/browser-facts.js'); const B = require('../src/browser-profiles.js'); const TBS = require('../src/browser-tabs.js');
  const O = path.join(ROOT, 'opener'); const BIN = path.join(O, 'bin'), AB = path.join(O, 'ab'), HOME = path.join(O, 'home'), XDG = path.join(O, 'x');
  for (const d of [BIN, AB, path.join(HOME, '.agent-browser'), XDG]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const { spawn } = require('child_process');
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
  const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
  const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
  const f = path.join(st, ns + '.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const write = (s) => { fs.writeFileSync(f + '.part', JSON.stringify(s)); fs.renameSync(f + '.part', f); };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
  const raw = process.argv.slice(2);
  const pin = raw.includes('--pin-tab');
  const argv = raw.filter((x) => x !== '--pin-tab' && x !== '--json');
  const [a, b] = argv;
  fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ ns, sess, argv: raw }) + '\\n');
  if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
  let s = read();
  const live = !!(s && alive(s.pid));
  if (a === 'session' && b === 'info') { out({ success: true, data: { active: live, namespace: ns, pid: live ? s.pid : null, session: sess, socketDir: path.join(st, 'run') } }); process.exit(0); }
  if (a === 'get' && b === 'cdp-url') { if (!live) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
  if (a === 'close' && b === '--all') { if (live) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
  if (a === 'close') { out({ success: true, data: { closed: 1 } }); process.exit(0); }
  const newTab = (url, label, opener) => { s.n = (s.n || 0) + 1; const t = { tabId: 't' + s.n, targetId: (s.n.toString(16).toUpperCase().padStart(4, '0') + 'F'.repeat(28)), url: url || 'about:blank', title: 'Page ' + String(url || 'blank').replace(/^https?:\\/\\//, ''), label: label || null, opener: opener || null }; s.tabs.push(t); return t; };
  if (!live) {
    if (process.env.AGENT_BROWSER_CDP) { out({ success: false, error: 'fake: nothing at that CDP url' }); process.exit(1); }
    const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n');
    s = { pid: c.pid, n: 0, tabs: [], sessions: {} };
  }
  // a session's FIRST command binds a new tab of its own (measured: never an existing one)
  if (!(sess in s.sessions)) { if (a === 'tab' && b === 'new') s.sessions[sess] = null; else { const t = newTab('about:blank'); s.sessions[sess] = t.targetId; } }
  const bound = () => s.tabs.find((t) => t.targetId === s.sessions[sess]) || null;
  const done = (o) => { write(s); out(o); process.exit(o.success ? 0 : 1); };
  const gone = () => done({ success: false, code: 'tab_gone', data: { targetId: s.sessions[sess] }, error: 'tab_gone: bound tab is gone' });
  const find = (ref) => s.tabs.find((t) => t.tabId === ref || t.targetId === String(ref).toUpperCase() || (t.label && t.label === ref)) || null;
  if (a === 'stream' && b === 'status') { let ports = {}; try { ports = JSON.parse(fs.readFileSync(path.join(st, 'ports.json'), 'utf8')); } catch { } const port = ports[ns + '|' + sess] || null; done(port ? { success: true, data: { enabled: true, connected: true, port } } : { success: false, error: 'fake: no stream' }); }
  if (a === 'tab') {
    const rest = argv.slice(1);
    if (!rest.length || rest[0] === 'list') done({ success: true, data: { tabs: s.tabs.map((t) => ({ active: t.targetId === s.sessions[sess], label: t.label, tabId: t.tabId, targetId: t.targetId, title: t.title, type: 'page', url: t.url })) } });
    if (rest[0] === 'new') { let label = null; const r2 = rest.slice(1); const li = r2.indexOf('--label'); if (li >= 0) { label = r2[li + 1]; r2.splice(li, 2); } const t = newTab(r2[0], label); s.sessions[sess] = t.targetId; done({ success: true, data: { tabId: t.tabId, targetId: t.targetId, total: s.tabs.length, url: t.url, label } }); }
    if (rest[0] === 'close') { const t = rest[1] ? find(rest[1]) : bound(); if (!t) { if (!rest[1]) gone(); done({ success: false, error: 'fake: no tab ' + rest[1] }); } s.tabs = s.tabs.filter((x) => x !== t); done({ success: true, data: { closed: true, tabId: t.tabId, targetId: t.targetId } }); }
    const t = find(rest[0]); if (!t) done({ success: false, error: 'fake: no tab ' + rest[0] }); s.sessions[sess] = t.targetId; done({ success: true, data: { tabId: t.tabId, targetId: t.targetId, title: t.title, url: t.url } });
  }
  if (pin && !bound()) gone();
  if (a === 'open') { const t = bound() || newTab(b); t.url = b; t.title = 'Page ' + String(b).replace(/^https?:\\/\\//, ''); done({ success: true, data: { targetId: t.targetId, url: b } }); }
  if (a === 'popup') { const t = newTab(b, null, s.sessions[sess]); done({ success: true, data: { targetId: t.targetId } }); } // the test's own verb: the bound page opens a popup (target=_blank)
  done({ success: true, data: { ok: true } });
  `, { mode: 0o755 });
  
  cleanups.push(() => { try { for (const l of fs.readFileSync(path.join(AB, 'pids'), 'utf8').split('\n')) { const p = Number(l); if (p > 1) try { process.kill(p, 'SIGKILL'); } catch { } } } catch { } });
  const env = { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME, FAKE_AB_STATE: AB, XDG_RUNTIME_DIR: XDG };
  const KA = 'bk-00000a01', KB = 'bk-00000b02';
  const live = new Set([KA, KB]);
  const jl = []; const jlog = { log: (x) => jl.push(String(x)), warn: (x) => jl.push(String(x)), error() { } };
  // ── THE MODEL ──
  const model = { windows: new Map(), targets: new Map(), nextW: 100, nextT: 0, openWindowCalls: 0, inWindowCalls: 0, rung2Calls: 0, windowReadFails: 0, rung2Fails: false, elsewhereOnce: false, rung2LeakOnce: false, rung2Opts: null, active: new Map(), otherWindow: null, rung2Create: null, rung2Log: [], straysInOther: 0 }; // verify r4: each window's ACTIVE tab, the other holder's window a stray may land in, the create's shape, every rung-2 call's plan
  const nsOfUrl = (u) => (/fake-(.+)$/.exec(String(u)) || [])[1] || null;
  const fakeState = (ns) => JSON.parse(fs.readFileSync(path.join(AB, ns + '.json'), 'utf8'));
  const fakeWrite = (ns, s) => fs.writeFileSync(path.join(AB, ns + '.json'), JSON.stringify(s));
  const mintTid = () => (++model.nextT).toString(16).toUpperCase().padStart(4, '0') + 'E'.repeat(28);
  // verify r4 ③: each window's ACTIVE (foreground) tab — a foreground create takes it; a close of the active tab puts the window's LAST tab in front (Chrome's measured rule, 30/30 per mode); a background create never touches it
  const addTab = (ns, tid, { windowId, openerId = null, holder = null, foreground = true }) => { model.targets.set(tid, { windowId, openerId, holder, state: 'ok' }); if (!model.windows.has(windowId)) model.windows.set(windowId, new Set()); model.windows.get(windowId).add(tid); if (foreground || !model.active.has(windowId)) model.active.set(windowId, tid); const s = fakeState(ns); s.n = (s.n || 0) + 1; s.tabs.push({ tabId: 't' + s.n, targetId: tid, url: 'about:blank', title: 'Page blank', label: null, opener: openerId }); fakeWrite(ns, s); return tid; };
  const closeTab = (tid) => { const t = model.targets.get(tid); if (!t || t.state === 'closed') return; t.state = 'closed'; const w = model.windows.get(t.windowId); if (w) { w.delete(tid); if (!w.size) model.windows.delete(t.windowId); } if (model.active.get(t.windowId) === tid) { if (w && w.size) model.active.set(t.windowId, [...w][w.size - 1]); else model.active.delete(t.windowId); } };
  const liveTargets = () => [...model.targets].filter(([, t]) => t.state !== 'closed');
  const fakeRemove = (ns, tid) => { const st = fakeState(ns); st.tabs = st.tabs.filter((t) => t.targetId !== tid); fakeWrite(ns, st); }; // verify r5 ③: the binary knows the tab no more
  const hook = async (name, ...a) => { const f = model[name]; if (typeof f !== 'function') return; model[name] = null; await f(...a); }; // verify r5: fired ONCE
  const fns = {
    readTargets: async () => { if (model.readFails > 0) { model.readFails--; return { ok: false, error: 'fake: the target list did not answer' }; } const targets = liveTargets().map(([id, t]) => ({ targetId: id, type: 'page', openerId: t.openerId || undefined })); if (model.readGate) { const g = model.readGate; model.readGate = null; await g; } return { ok: true, targets }; }, // THE .229 MIRROR: a gate holds ONE read's answer (taken before it) in flight
    openWindow: async (url) => { model.openWindowCalls++; const w = ++model.nextW; const tid = addTab(nsOfUrl(url), mintTid(), { windowId: w, holder: 'keeper' }); const readOk = model.windowReadFails <= 0; if (!readOk) model.windowReadFails--; await hook('onWindow', tid); return { ok: true, targetId: tid, windowId: readOk ? w : null }; }, // B-0cee follow-up: onWindow (one-shot) acts on a new window's tab
    windowOf: async (url, tid) => { const t = model.targets.get(String(tid)); return t && t.state !== 'closed' ? t.windowId : null; },
    closeTarget: async (url, tid) => { closeTab(String(tid)); return { ok: true }; },
    openTabInWindow: async (url, { anchorTargetId, windowId }) => {
      model.inWindowCalls++; const ns = nsOfUrl(url); const a = model.targets.get(String(anchorTargetId));
      await hook('onProbe'); // verify r5 ①/②: a takeover or a live view that begins INSIDE rung 1 (the first anchor's probe)
      if (!a || a.state === 'closed') return { ok: false, code: 'open_failed', error: 'Unexpected server response: 500' };
      if (['dialog', 'crashed', 'navigating'].includes(a.state)) return { ok: false, code: 'anchor_unresponsive', error: 'the anchor did not answer in 400 ms (a dialog, a crash, a navigation)' }; // verify r3: the probe, not the act's timeout
      if (a.state === 'override' || a.state === 'sandbox') return { ok: false, code: 'no_new_tab', error: 'the page opened no tab (a blocked window.open)' }; // verify r3: a CSP sandbox page (allow-popups absent) opens none — measured
      // verify r3 ⑦ (measured): the anchor was its window's LAST tab and closed 0 ms into the act ⇒ no tab, the window gone
      if (a.state === 'closing-last') { closeTab(String(anchorTargetId)); return { ok: false, code: 'open_failed', error: 'closed before the answer' }; }
      if (a.state === 'elsewhere' || model.elsewhereOnce) { model.elsewhereOnce = false; const other = ++model.nextW; const tid = addTab(ns, mintTid(), { windowId: other, openerId: anchorTargetId, holder: 'stray' }); closeTab(tid); return { ok: false, code: 'window_mismatch', error: `the tab opened in window ${other}, not the holder's window ${windowId}` }; }
      const tid = addTab(ns, mintTid(), { windowId: a.windowId, openerId: anchorTargetId, holder: 'keeper' }); await hook('onCreated', tid); return { ok: true, targetId: tid, windowId: a.windowId };
    },
    openTabByActivate: async (url, { anchorTargetId, tries = 1, breaker = null }) => {
      model.rung2Calls++; model.rung2Opts = { tries, breaker }; model.rung2Log.push({ tries, breaker }); const ns = nsOfUrl(url); const a = model.targets.get(String(anchorTargetId));
      if (model.rung2Hold) { const h = model.rung2Hold; model.rung2Hold = null; await h; } // verify r5 c31: this rung 2 in flight (under the keeper's lock) until the test lets go
      if (!a || a.state === 'closed') return { ok: false, code: 'open_failed', error: 'no such target', leaks: [], tries: 1 };
      // verify r3 T2 ①: every try's stray is closed AT ONCE by the seam and listed in `leaks` (the keeper counts them);
      // verify r4 ③: a stray lands in the OTHER holder's window when the walk names one (`model.otherWindow`), in the
      // FOREGROUND unless the create is a background one (the product's RUNG2_CREATE; control (m) sets a foreground one)
      const bg = (model.rung2Create || W.RUNG2_CREATE).background === true; const strayWin = () => { if (model.otherWindow != null && model.windows.has(model.otherWindow)) { model.straysInOther++; return model.otherWindow; } return ++model.nextW; };
      if (model.rung2Fails) { const leaks = []; for (let t = 1; t <= tries; t++) { const other = strayWin(); const tid = addTab(ns, mintTid(), { windowId: other, holder: 'stray', foreground: !bg }); closeTab(tid); leaks.push({ window: other, livedMs: 7, try: t }); } return { ok: false, code: 'window_mismatch', error: 'the tab opened elsewhere', leaks, tries }; }
      if (model.rung2LeakOnce) { model.rung2LeakOnce = false; const other = strayWin(); const st = addTab(ns, mintTid(), { windowId: other, holder: 'stray', foreground: !bg }); closeTab(st); const tid = addTab(ns, mintTid(), { windowId: a.windowId, holder: 'keeper', foreground: !bg }); return { ok: true, targetId: tid, windowId: a.windowId, tries: 2, leaks: [{ window: other, livedMs: 7, try: 1 }] }; }
      const tid = addTab(ns, mintTid(), { windowId: a.windowId, holder: 'keeper', foreground: !bg }); await hook('onCreated', tid); return { ok: true, targetId: tid, windowId: a.windowId, tries: 1, leaks: [] };
    },
  };
  const DATA = path.join(O, 'data');
  const mk = (Kmod = K, extra = {}) => Kmod.create({ dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: jlog, install: false, now: () => Date.now(), conversationFacts: () => ({ turn: 'idle' }), ...fns, ...extra });
  // DATA: the copied harness's own (data-job below is this leg's)
  // the jobs engine, faked to its contract (jobByToken / jobs Map / ready) — the keeper asks `jobRunning`
  const jobs = new Map([['jb-0000aaaa', { id: 'jb-0000aaaa', name: 'daily reconcile', state: 'up', owner: { conversation: { id: 'conv-userW-1' } } }],
    ['jb-0000bbbb', { id: 'jb-0000bbbb', name: 'second', state: 'up', owner: { conversation: { id: 'conv-userW-1' } } }]]);
  const tokens = new Map([['jbt_aaaa', 'jb-0000aaaa'], ['jbt_bbbb', 'jb-0000bbbb']]);
  const eng = Object.assign(Object.create(require('../src/jobs.js').JobManager.prototype), { d: { dataDir: path.join(O, 'data-job'), log() { } } });
  const jm = { ready: true, jobs, jobByToken: (t) => jobs.get(tokens.get(t)) || null, labelOf: (j) => eng.labelOf(j) };   // r5: + the ONE name accessor (the engine's own)
  const k = mk(K, { dataDir: path.join(O, 'data-job'), jobRunning: (id) => J.jobRunningIn(jm, id) }); await k._facts.probeVersion();   // B-f276 family unit 2: the wiring's own question (the engine, its hold asked)
  const pBank = k.createProfile({ label: 'Bank' });
  const pOther = k.createProfile({ label: 'Other' });
  // the owner conversation (KA) is live, pinned to Bank
  const owner = { claudeSessionId: 'conv-userW-1', _browserKey: KA, agentToken: 'vsst_owner', name: 'owner' };
  const sessions = new Map([['w-owner', owner]]);
  k.setPin(KA, pBank.id, { origin: 'chosen', by: 'user' });
  const R = require('../src/routes/browser.js');
  R.setup({ keeper: k, activeSessions: sessions, getJobs: () => jm, bindingsLookup: (cid) => (cid === 'conv-userW-1' ? KA : ''), tasksForSession: () => [], tasksForConversation: () => [] });
  const express = require('express'); const app = express(); app.use(express.json()); app.use(R.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  cleanups.push(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (p, tok, body = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; };
  const leasesOf = (bk) => k._reg().leases.filter((l) => l.browserKey === bk).map((l) => l.profileId);
  const handleOf = (jobId) => J.jobHandleOf(k._reg().children, jobId, KA);

  // accept-fixes-jobs: the REAL CLI inside the job (its token, no session's) against this server — spawned, never blocking it
  const CLI = path.join(REPO, 'data/bin/vibespace-browser');
  const cliRun = (args, extra = {}) => new Promise((res) => { const c = spawn(process.execPath, [CLI, ...args], { env: { PATH: env.PATH, HOME, VIBESPACE_API: base, ...extra } }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); c.on('close', (code) => res(o + `[exit ${code}]`)); });
  const windowTabs = (w) => [...(model.windows.get(w) || [])];
  const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 25)); } return !!(await fn()); };
  // accept-fixes-jobs F5 (the acceptance of 2.369.202): BEFORE its first page verb, a job's status names the profile that verb lands on
  { const rs = await fetch(base + '/api/agent/browser/status', { headers: { Authorization: 'Bearer jbt_aaaa' } }); const j = await rs.json();
    ok(rs.status === 200 && gateOf(j.job) && gateOf(j.job.lands) && j.job.lands.profileId === pBank.id && gateOf(j.job.pin) && j.job.pin.profileId === pBank.id && j.job.lease === null && j.job.label === 'job daily reconcile', 'F5: a job\'s status BEFORE any page verb names the profile its next verb lands on (Bank — the owner\'s pin), the owner\'s pin and "no window yet" — it answered its bare handle\'s empty set ("no profile attached / pin: none")', j.job || j); }
  const r1 = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['open', 'https://bank.test'] });
  const H = handleOf('jb-0000aaaa');
  ok(r1.status === 200 && gateOf(r1.j) && gateOf(r1.j.ok) && r1.j.job === true && r1.j.kind === 'attachment', 'a jbt_ resolve is ADMITTED (200, kind attachment, job:true) — it was 401 "missing session token" before', r1);
  ok(gateOf(B.isChildKey(H)) && B.parentKeyOf(H) === KA && k._reg().children[H].job === 'jb-0000aaaa', `the job got its OWN handle under the owner's key (${H}, tagged job)`, k._reg().children);
  ok(JSON.stringify(leasesOf(H)) === JSON.stringify([pBank.id]), 'its own lease is in the OWNER\'s pinned profile (Bank) — the same logins', leasesOf(H));
  ok(gateOf(k._reg().pins[KA]) && k._reg().pins[KA].profileId === pBank.id && !k._reg().pins[H], 'the owner\'s pin is untouched and the job pinned nothing');
  const lw = (bk) => { const l = B.findLease(k._reg().leases, pBank.id, bk); return l ? l.windowId : undefined; };
  { const rOwner = await call('/api/agent/browser/resolve', 'vsst_owner', { argv: ['open', 'https://bank.test/home'] }); ok(rOwner.status === 200 && verdictOf(leasesOf(KA).includes(pBank.id)), 'the owner conversation still resolves to Bank, its own lease beside the job\'s', rOwner); }
  ok(lw(H) !== undefined && lw(KA) !== undefined && String(lw(H)) !== String(lw(KA)), `ITS OWN WINDOW: the job's lease and the owner's hold different windows (${lw(H)} vs ${lw(KA)})`);
  const winKA = lw(KA);
  { const out = await cliRun(['status'], { VIBESPACE_JOB_TOKEN: 'jbt_aaaa' });
    ok(gateOf(/this is Background Work job daily reconcile \(jb-0000aaaa\)/.test(out)) && gateOf(/its page verbs land on Bank \(/.test(out)) && gateOf(/its window: ready/.test(out)) && gateOf(/the conversation's pin: Bank/.test(out)) && !/no profile attached|pin: none/.test(out), 'F5: the REAL CLI\'s `status` inside the job prints the job\'s binding — lands on Bank, its window live, the conversation\'s pin — never "no profile attached / pin: none"', out); }
  // accept-fixes-jobs F10: the live view's browsers row names the job's window by the JOB's name (the route's own answer → the strip's list)
  { const S = require('../src/browser-stream.js');
    const rs = await fetch(base + '/api/browser/session/w-owner'); const j = await rs.json();
    const row = rs.status === 200 ? S.browserListFor(j).find((x) => x.ref === H) : null;
    ok(gateOf(j.jobNames) && j.jobNames[H] === 'daily reconcile' && gateOf(row) && gateOf(row.helper) && row.helper.job === true && row.helper.name === 'daily reconcile', 'F10: the browsers row of the job\'s window is the JOB by its name ("daily reconcile", job) — it read a bare "Helper 1" (the attachment set dropped the job tag, so the route named nothing)', { status: rs.status, jobNames: j.jobNames, helper: row && row.helper }); }
  // verify r1 (MED): a PENDING FORK carrying the owner's conversation id, first in the live set, with its own browser key and
  // no pin — before the fix the job was judged as the FORK (its handle minted under bk-f0f0f0f0, refused job_no_profile)
  { const fork = { claudeSessionId: 'conv-userW-1', _browserKey: 'bk-f0f0f0f0', _forkRequested: true, _forkSourceId: 'conv-userW-1', agentToken: 'vsst_fork', name: 'fork-pending' };
    const keep = [...sessions]; sessions.clear(); sessions.set('w-fork', fork); for (const [kk, v] of keep) sessions.set(kk, v); live.add('bk-f0f0f0f0');
    const rp = await call('/api/agent/browser/resolve', 'jbt_bbbb', { argv: ['open', 'https://bank.test/p'] });
    const hp = Object.entries(k._reg().children).find(([, c]) => c && c.job === 'jb-0000bbbb');
    ok(rp.status === 200 && gateOf(hp) && hp[1].parent === KA && !Object.values(k._reg().children).some((c) => c && c.parent === 'bk-f0f0f0f0'), 'verify r1: a PENDING FORK carrying the owner\'s id is NOT the owner — the job is judged as the owner (its handle under the owner\'s key, the owner\'s pin), nothing minted under the fork\'s key', { status: rp.status, code: rp.j && rp.j.code, parent: hp && hp[1].parent });
    k.releaseJob('jb-0000bbbb', 'leg cleanup'); sessions.delete('w-fork'); live.delete('bk-f0f0f0f0'); }
  const again = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['snapshot'] });
  ok(again.status === 200 && handleOf('jb-0000aaaa') === H && Object.values(k._reg().children).filter((c) => c.job === 'jb-0000aaaa').length === 1, 'a second verb reuses the job\'s handle (one handle per job)');
  for (const route of ['pin', 'use', 'new-child', 'detach', 'resume']) { const r = await call('/api/agent/browser/' + route, 'jbt_aaaa', { profile: pOther.id }); ok(r.status === 403 && gateOf(r.j) && r.j.code === 'job_token', `a job is refused /${route} by name (403 job_token)`, r); }
  { const st = await fetch(base + '/api/agent/browser/status', { headers: { Authorization: 'Bearer jbt_aaaa' } }); const j = await st.json(); ok(st.status === 200 && j.shared === false, 'a job may read its status', j); }
  // not_owner: the user narrows Bank to ANOTHER conversation — the owner is refused, and so is its job
  k._reg().profiles.find((x) => x.id === pBank.id).grantUse = { to: [{ kind: 'conversation', key: KB, browserKey: KB }], except: [] };   // lane grants-unify: the keeper's mirror of the store's row, narrowed
  const r2 = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['snapshot'] });
  ok(r2.status === 403 && gateOf(r2.j) && r2.j.code === 'not_owner' && gateOf(/Your tab in its browser was closed/.test(r2.j.error)) && !leasesOf(H).length, 'the owner conversation may no longer use Bank ⇒ its JOB is refused not_owner (the same name, the same 403) and its tab closed with the refusal', r2);
  k._reg().profiles.find((x) => x.id === pBank.id).grantUse = { to: [{ kind: 'everyone' }], except: [] };
  // a job not running is refused; a job with no profile pinned is refused by name
  jobs.get('jb-0000bbbb').state = 'done';
  { const r = await call('/api/agent/browser/resolve', 'jbt_bbbb', { argv: ['snapshot'] }); ok(r.status === 409 && gateOf(r.j) && r.j.code === 'job_not_running', 'a finished job\'s token is refused job_not_running', r); }
  jobs.get('jb-0000bbbb').state = 'up';
  k.setPin(KA, null, { origin: 'chosen', by: 'user' });
  { const r = await call('/api/agent/browser/resolve', 'jbt_bbbb', { argv: ['snapshot'] }); ok(r.status === 409 && gateOf(r.j) && r.j.code === 'job_no_profile', 'no pin and no attachment of Bank in the owner\'s set (the owner\'s own lease aside) ⇒ the job is refused job_no_profile — or resolves the owner\'s default attachment', r); }
  k.setPin(KA, pBank.id, { origin: 'chosen', by: 'user' });
  { const r = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['snapshot'] }); ok(r.status === 200 && verdictOf(leasesOf(H).includes(pBank.id)), 'Bank for all again: the job resolves again (a new lease under the same handle)', r); }
  // the OWNER conversation goes away: the running job keeps browsing
  sessions.clear(); live.delete(KA);
  k.reconcile({ graceMs: 0 });
  ok(gateOf(leasesOf(H).includes(pBank.id)) && !leasesOf(KA).length, 'the owner conversation is gone (its lease dropped) — the RUNNING job\'s lease is kept (a running job carries its handle)', { job: leasesOf(H), owner: leasesOf(KA) });
  const r3 = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['snapshot'] });
  ok(r3.status === 200 && gateOf(r3.j) && verdictOf(r3.j.ok), '…and it still resolves (the owner\'s recorded key + its pin) — it keeps browsing until the job ends', r3);
  // B-f276 family unit 2 (主开发 r3084 — the law of r3019): THE JOBS STORE HELD (its read failed: the engine keeps an EMPTY memory
  // while held) — the keeper's reconcile asks the hold («unknown») and releases NOTHING: the real reconcile, as at boot and every tick
  { const keep = new Map(jobs); jobs.clear(); jm._unread = { store: { code: 'EIO' } };
    const winHeld = lw(H), tabsHeld = windowTabs(winHeld), jl0 = jl.length;
    k.reconcile({ graceMs: 0 });
    await new Promise((r) => setTimeout(r, 50));
    const kept = !!k._reg().children[H] && leasesOf(H).includes(pBank.id) && model.windows.has(winHeld) && tabsHeld.length > 0 && tabsHeld.every((t) => model.targets.get(t).state !== 'closed') && !jl.slice(jl0).some((x) => /job handle released/.test(x));
    ok(verdictOf(kept), 'THE JOBS STORE HELD (r3084): the real reconcile over the held, EMPTY job list releases NOTHING — the job\'s handle, its lease, its window and its tabs all kept', { children: Object.keys(k._reg().children), tabs: tabsHeld.length, said: jl.slice(jl0) });
    const MH = mutantCopies('jobs-browser-held', REPO), JSRC = fs.readFileSync(path.join(REPO, 'src/browser-job-principal.js'), 'utf8');
    const JX = MH.load('src/browser-job-principal.js', anchored(JSRC, "  if (jm && jm._unread && jm._unread.store) return 'unknown';\n", '', 'B-f276 r3084: the hold not asked'));
    ok(gateOf(JX.jobChildrenToRelease(k._reg().children, (id) => JX.jobRunningIn(jm, id)).some((x) => x.handle === H)) && !J.jobChildrenToRelease(k._reg().children, (id) => J.jobRunningIn(jm, id)).some((x) => x.handle === H), 'RED CONTROL — the hold not asked (the release\'s road, in a copy): the rule releases that job\'s handle over the held list');
    for (const row of copiesCensus(MH.files, MH.dir, REPO, { minCopies: 1 })) ok(verdictOf(row.pass), row.name, row.detail);
    jobs.clear(); for (const [a, b] of keep) jobs.set(a, b); delete jm._unread;
  }
  // 主开发 r3115 (1), the census's J1: a job the engine CANNOT VERIFY (`unverified` — a skeleton recovered from torn bytes, a job whose
  // wrapper a restart could not own again) is UNKNOWN: the real reconcile keeps its handle, its lease and its tabs (none closed on a guess)
  { const jA = jobs.get('jb-0000aaaa'), st0 = jA.state; jA.state = 'unverified';
    const winU = lw(H), tabsU = windowTabs(winU), jl1 = jl.length;
    k.reconcile({ graceMs: 0 }); await new Promise((r) => setTimeout(r, 50));
    ok(!!k._reg().children[H] && gateOf(leasesOf(H).includes(pBank.id)) && tabsU.length > 0 && gateOf(tabsU.every((t) => model.targets.get(t).state !== 'closed')) && !jl.slice(jl1).some((x) => /job handle released/.test(x)), 'AN UNVERIFIED JOB (r3115 (1)): the real reconcile keeps its handle, lease and tabs — unknown is never «not running»', { children: Object.keys(k._reg().children) });
    const MU = mutantCopies('jobs-browser-unverified', REPO), JSRC1 = fs.readFileSync(path.join(REPO, 'src/browser-job-principal.js'), 'utf8');
    const JU = MU.load('src/browser-job-principal.js', anchored(JSRC1, "  if (j && j.state === 'unverified') return 'unknown';\n", '', 'B-f276 r3115 (1): unverified read as not running'));
    ok(verdictOf(JU.jobChildrenToRelease(k._reg().children, (id) => JU.jobRunningIn(jm, id)).some((x) => x.handle === H)), 'RED CONTROL — unverified read as not running (the release\'s road, in a copy): the rule releases that handle');
    for (const row of copiesCensus(MU.files, MU.dir, REPO, { minCopies: 1 })) ok(verdictOf(row.pass), row.name, row.detail);
    jA.state = st0;
  }
  // r3571 (the job handles' keep): while the jobs engine CANNOT SAY — not loaded yet (it loads its jobs on a timer after the listen
  // turn, and the keeper's first look comes before), or its start failed (its list stays empty for the run), or the ask throws — the
  // answer is UNKNOWN and the real reconcile releases nothing: the handle, its lease, its window and its tabs all kept
  { const keep = new Map(jobs);
    const keptNow = (win, tabs, j0) => !!k._reg().children[H] && leasesOf(H).includes(pBank.id) && tabs.length > 0 && tabs.every((t) => model.targets.get(t).state !== 'closed') && !jl.slice(j0).some((x) => /job handle released/.test(x));
    jobs.clear(); jm.ready = false;   // the engine made, its jobs not loaded yet: the list is EMPTY
    const winN = lw(H), tabsN = windowTabs(winN), jlN = jl.length, codeN = J.jobsUnknownCode(jm);
    k.reconcile({ graceMs: 0 }); await new Promise((r) => setTimeout(r, 50));
    ok(codeN === 'jobs_engine_not_ready' && verdictOf(keptNow(winN, tabsN, jlN)), 'THE ENGINE NOT LOADED YET (r3571): the real reconcile over its EMPTY list releases NOTHING — the job\'s handle, its lease, its window and its tabs all kept', { codeN, children: Object.keys(k._reg().children), said: jl.slice(jlN) });
    jm.initError = 'EACCES: permission denied, mkdir (placed)';   // its start failed: the list stays empty for the run
    const winF = lw(H), tabsF = windowTabs(winF), jlF = jl.length, codeF = J.jobsUnknownCode(jm);
    k.reconcile({ graceMs: 0 }); await new Promise((r) => setTimeout(r, 50));
    ok(codeF === 'jobs_engine_failed' && verdictOf(keptNow(winF, tabsF, jlF)), 'THE ENGINE WHOSE START FAILED (r3571): the real reconcile releases NOTHING — every job handle stays carried for the run', { codeF, said: jl.slice(jlF) });
    const MN = mutantCopies('jobs-browser-not-ready', REPO), JSRC2 = fs.readFileSync(path.join(REPO, 'src/browser-job-principal.js'), 'utf8');
    const JN = MN.load('src/browser-job-principal.js', anchored(JSRC2, "  if (jobsUnknownCode(jm)) return 'unknown';   // r3571: its handle is carried until the engine can say (judged by facts then)\n", '', 'r3571: the engine not asked whether it can say'));
    const relN = (ready, err) => { jm.ready = ready; if (err) jm.initError = err; else delete jm.initError; return JN.jobChildrenToRelease(k._reg().children, (id) => JN.jobRunningIn(jm, id)).some((x) => x.handle === H); };
    ok(gateOf(relN(false, null)) && verdictOf(relN(false, 'EACCES (placed)')), 'RED CONTROL — the engine not asked whether it can say (the release\'s road, in a copy): over the engine not loaded yet, and over the engine whose start failed, the rule releases that handle');
    for (const row of copiesCensus(MN.files, MN.dir, REPO, { minCopies: 1 })) ok(verdictOf(row.pass), row.name, row.detail);
    jobs.clear(); for (const [a, b] of keep) jobs.set(a, b); delete jm.initError; jm.ready = true;
    // an ask that THROWS could not tell: carried (the wiring's own catch answers unknown too, pinned below)
    const boom = () => { throw new Error('a made-up failure of the ask'); };
    const MT = mutantCopies('jobs-browser-ask-throws', REPO), JSRC3 = fs.readFileSync(path.join(REPO, 'src/browser-job-principal.js'), 'utf8');
    const JT = MT.load('src/browser-job-principal.js', anchored(JSRC3, "catch { on = true; /* r3571: an ask that throws could not tell — carried, never released */ }", 'catch { on = false; }', 'r3571: a throw read as not running'));
    ok(!J.jobChildrenToRelease(k._reg().children, boom).some((x) => x.handle === H) && verdictOf(J.carriedJobHandles(k._reg().children, boom).has(H)), 'AN ASK THAT THROWS (r3571): the job\'s handle is CARRIED — never released on a failure of the ask');
    ok(verdictOf(JT.jobChildrenToRelease(k._reg().children, boom).some((x) => x.handle === H)), 'RED CONTROL — a throw read as not running (the release\'s road, in a copy): the rule releases that handle');
    for (const row of copiesCensus(MT.files, MT.dir, REPO, { minCopies: 1 })) ok(verdictOf(row.pass), row.name, row.detail);
    // a READY engine still judges by facts: a job it lists as finished releases its handle (the rule's own road, unchanged)
    const jR = jobs.get('jb-0000aaaa'), stR = jR.state; jR.state = 'done';
    ok(J.jobsUnknownCode(jm) === null && verdictOf(J.jobChildrenToRelease(k._reg().children, (id) => J.jobRunningIn(jm, id)).some((x) => x.handle === H)), 'a READY engine still judges by facts: a job it lists as finished releases its handle');
    jR.state = stR;
  }
  // 主开发 r3115 (the census's one unverified item, verified): the SETTINGS HELD — `browser.cli` unread: the CLI pin file the agent's
  // CLI reads is never REMOVED over a setting the keeper could not read (it was: the default «path» pin removed the mirror)
  { const pinAt = (dd) => { const pf = path.join(dd, 'browser-tools', 'cli-pin.json'); fs.mkdirSync(path.dirname(pf), { recursive: true }); fs.writeFileSync(pf, JSON.stringify({ version: '9.9.9', path: '/made/up/agent-browser' })); return pf; };
    const pfH = pinAt(path.join(O, 'data-pin-held')), pfR = pinAt(path.join(O, 'data-pin-release'));
    const kH = mk(K, { dataDir: path.join(O, 'data-pin-held'), settingsHeld: () => ({ code: 'EIO' }) }), kR = mk(K, { dataDir: path.join(O, 'data-pin-release') });
    const pinH = kH.cliPin(); kR.cliPin();
    ok(gateOf(fs.existsSync(pfH)) && gateOf(pinH) && pinH.held === true, 'THE SETTINGS HELD: the CLI pin is not computed from an unread setting — its file is LEFT AS IT IS (the last pin stands)', pinH);
    ok(!fs.existsSync(pfR), 'RED CONTROL — the same keeper with no hold to ask (the release): the default «path» pin REMOVES the file');
  }
  // THE .229 MIRROR (F11 red on the Actions runner: window 104 left open, its tab never closed): a tab read in flight while the
  // job's window gained a tab — the CDP read taken BEFORE the tab, the holders read AFTER its root was stamped — pruned that
  // root as gone, so the finalize found nothing of the job's to close. A root stamped after the read began survives the read.
  { const lH = B.findLease(k._reg().leases, pBank.id, H); let go; model.readGate = new Promise((r) => { go = r; });
    const pend = k.tabOwnersFor({ kind: 'session', sessionName: H, profileId: pBank.id });
    const late = addTab(nsOfUrl(k._reg().browsers[pBank.id].cdpUrl), mintTid(), { windowId: lw(H), holder: 'keeper' });
    lH.tabRoots = [...(Array.isArray(lH.tabRoots) ? lH.tabRoots : []), late]; // the keeper's own stamp (TBS.addRoot at the tab's create)
    go(); await pend;
    const roots = (B.findLease(k._reg().leases, pBank.id, H) || {}).tabRoots || [];
    ok(gateOf(roots.includes(late)) && verdictOf(windowTabs(lw(H)).includes(late)), `THE .229 MIRROR: a root stamped while a tab read was in flight (${late.slice(0, 4)}…, the job's window's new tab) survives that read — it was pruned as gone and the finalize closed nothing`, { late, roots }); }
  // the job's end: finalize releases (what onRunEnded calls), the evidence rule releases what a missed finalize left
  const winH = lw(H), tabsH = windowTabs(winH), tabsKA = windowTabs(winKA);
  const leaseRoots = (bk) => { const l = B.findLease(k._reg().leases, pBank.id, bk); return l ? [...(l.targetId ? [l.targetId] : []), ...(l.tabRoots || [])].map((x) => String(x).slice(0, 4)) : null; };
  const rootsAtRelease = leaseRoots(H), jlAtRelease = jl.length, rebinds = jl.filter((x) => x.includes(H + ':') && /a new tab bound|bound to the browser's only tab/.test(x)).length; // the red's evidence: what the closer could hold, a rebind that replaced its roots, what the keeper said after
  const f11State = (w, tabs, roots, from) => ({ open: windowTabs(w).map((t) => t.slice(0, 4)), states: tabs.map((t) => t.slice(0, 4) + ':' + model.targets.get(t).state), roots, said: jl.slice(from).filter((x) => /window|tick|job|closed|pruned|detached/.test(x)).map((x) => x.replace(/^\[browser\] /, '').slice(0, 150)).slice(-4), windows: [...model.windows].map(([id, ts]) => id + ':' + [...ts].map((t) => t.slice(0, 4)).join('/')) });
  jobs.get('jb-0000aaaa').state = 'done';
  const released = k.releaseJob('jb-0000aaaa', 'the job run ended');
  // accept-fixes-jobs F11 (the acceptance of 2.369.202: after `vibespace-job stop` the job's window stayed open in the shared profile)
  ok(tabsH.length > 0 && gateOf(await until(() => !model.windows.has(winH) && tabsH.every((t) => model.targets.get(t).state === 'closed'), 15000)) && tabsKA.length > 0 && verdictOf(tabsKA.every((t) => model.targets.get(t).state !== 'closed')), `F11: AT FINALIZE the job's WINDOW closes (window ${winH}: ${tabsH.length} tab(s) closed over CDP) — the owner's page in its own window is untouched; the window stayed open before`, { winH, ...f11State(winH, tabsH, rootsAtRelease, jlAtRelease), rebinds, owner: tabsKA.map((t) => t.slice(0, 4) + ':' + model.targets.get(t).state) }); // THE .229 MIRROR: one deadline for both facts; the keeper's own lines name the closer's branch
  ok(!Object.values(k._reg().leftTabs || {}).some((m) => m && m[H]), 'F11: no "left tab" is kept for the released job handle (a job never comes back for its page)', k._reg().leftTabs);
  ok(gateOf(released.includes(H)) && !leasesOf(H).length && !k._reg().children[H], 'AT FINALIZE the job\'s lease and handle are gone (its window closes with the lease)', { released, leases: leasesOf(H) });
  await call('/api/agent/browser/resolve', 'jbt_bbbb', { argv: ['snapshot'] });
  const H2 = handleOf('jb-0000bbbb');
  const winH2 = lw(H2), tabsH2 = windowTabs(winH2);
  jobs.get('jb-0000bbbb').state = 'failed';
  k.reconcile({ graceMs: 120000 });
  ok(tabsH2.length > 0 && verdictOf(await until(() => !model.windows.has(winH2) && tabsH2.every((t) => model.targets.get(t).state === 'closed'), 15000)), `F11: THE SWEEP closes the window too (a job that ended without its finalize: window ${winH2}, ${tabsH2.length} tab(s))`, { winH2, ...f11State(winH2, tabsH2, leaseRoots(H2), 0) });
  ok(gateOf(H2) && !k._reg().children[H2] && !leasesOf(H2).length, 'THE SWEEP: a job that ended without its finalize hook is released at the next reconcile (evidence: not running)', { H2, children: Object.keys(k._reg().children) });
  // round wgbjnr750 (J1's end): an UNVERIFIED job keeps its handle until the PERSON removes it (the panel's Remove — Stop leaves it
  // unverified) or it is archived: then the next reconcile releases its handle (the real reconcile)
  { jobs.set('jb-0000cccc', { id: 'jb-0000cccc', name: 'third', state: 'up', owner: { conversation: { id: 'conv-userW-1' } } }); tokens.set('jbt_cccc', 'jb-0000cccc');
    await call('/api/agent/browser/resolve', 'jbt_cccc', { argv: ['snapshot'] });
    const H3 = handleOf('jb-0000cccc'); jobs.get('jb-0000cccc').state = 'unverified';
    k.reconcile({ graceMs: 0 }); const keptU = !!(H3 && k._reg().children[H3]);
    jobs.delete('jb-0000cccc'); k.reconcile({ graceMs: 0 });
    ok(!!H3 && gateOf(keptU) && !k._reg().children[H3], 'AN UNVERIFIED JOB\'s end (r3115 (1), round wgbjnr750): its handle is kept while unverified, and released by the next reconcile once the person REMOVES it', { H3, keptU });
  }
  // round wgbjnr750 (pin): the wiring hands the keeper the settings hold — a dropped line would leave every keeper leg green
  { const MW = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
    ok(verdictOf(/settingsHeld: \(\) => \(typeof persistenceRouter\.settingsHeld === 'function' \? persistenceRouter\.settingsHeld\(\) : null\),\s+\/\/ B-f276 family unit 2: the CLI pin/.test(MW)), 'THE WIRING (pin): the browser keeper is handed the settings hold (persistenceRouter.settingsHeld)'); }
  ok(gateOf(jl.some((x) => /job jb-0000aaaa uses the conversation's browser as bk-00000a01\.\d+/.test(x))) && verdictOf(jl.some((x) => /job handle released \(the job run ended\)/.test(x))), 'the journal names the job by its ID at the mint and the release (never its name)', jl.filter((x) => /job/.test(x)));
  // THE .229 RULE'S SECOND ORDERING (lane jobs-browser-f11-race — F11 red on the rel251/rel253 runners: roots at the release
  // [0009…, 0005…], tab 0004 left open): the narrowing's close of a holder's session (closeLeaseSession: `tab close`, `close`,
  // the lost-tab mark — never awaited by the refusal) landed AFTER the holder's re-attach had bound its session to its NEW
  // window's tab: it closed THAT tab and marked the new lease lost, the next verb rebound a fresh tab whose root replaced the
  // window's, and the finalize (it closes what the lease roots) left the window open. Interleaved BY HAND, no timing: the
  // close is held at its `tab close` (a gated runtime; the binary's close also closes that CDP target, as Chrome does) while
  // the re-attach runs — the shipped keeper parks the attach behind the close; the pre-fix copy binds first (RED).
  const tabsOfWindow = (w) => [...model.targets].filter(([, t]) => t.windowId === w).map(([id]) => id);
  const closeThenAttach = async (Kmod, tag) => {
    const rt0 = F.createBrowserRuntime({ env }); let gate = null, held = false; const jl2 = [];
    const rt = Object.assign(Object.create(rt0), { exec: async (ns, argv, o) => { const a = Array.isArray(argv) ? argv : []; const closing = a.length === 2 && a[0] === 'tab' && a[1] === 'close'; if (closing && gate) { held = true; const g = gate; gate = null; await g; } const r = await rt0.exec(ns, argv, o); if (closing && r && r.ok && r.json && r.json.data && r.json.data.targetId) closeTab(String(r.json.data.targetId).toUpperCase()); return r; } });
    const kk = mk(Kmod, { dataDir: path.join(O, 'data-close-' + tag), runtime: rt, log: { log: (x) => jl2.push(String(x)), warn: (x) => jl2.push(String(x)), error() { } } });
    await kk._facts.probeVersion();
    const X = 'bk-00000c03'; live.add(X);
    const pN = kk.createProfile({ label: 'Narrowed ' + tag });
    const prof = () => kk._reg().profiles.find((x) => x.id === pN.id), lease = () => B.findLease(kk._reg().leases, pN.id, X);
    await kk.attach({ profileId: pN.id, browserKey: X });
    const w1 = lease() && lease().windowId, t1 = tabsOfWindow(w1)[0] || null;
    let go; gate = new Promise((r) => { go = r; });
    prof().grantUse = { to: [{ kind: 'conversation', key: KB, browserKey: KB }], except: [] };   // lane grants-unify: the mirror narrowed
    const refused = await kk.attach({ profileId: pN.id, browserKey: X }).then(() => null, (e) => e);
    const parkedClose = await until(() => held, 15000); // witness: the narrowing's close is in flight, held at its `tab close`
    prof().grantUse = { to: [{ kind: 'everyone' }], except: [] };
    let settled = false; const again = kk.attach({ profileId: pN.id, browserKey: X }).then(() => { settled = true; }, () => { settled = true; });
    await until(() => settled || jl2.some((x) => x.includes(`${X}: its attach on ${pN.id} waits for its session's close`)), 15000); // witness: parked (shipped) or bound (pre-fix)
    const attachFirst = settled;
    go(); await again;
    await until(() => jl2.some((x) => x.includes(`${X}: its tab in ${pN.id}`)), 15000); // witness: the close said its outcome
    await kk.attach({ profileId: pN.id, browserKey: X }); // the next verb's attach
    const l = lease(), w2 = l ? l.windowId : null, t2 = w2 != null && w2 !== w1 ? tabsOfWindow(w2)[0] || null : null, roots = l ? (l.tabRoots || []).map(String) : [];
    const st = (t) => (t && model.targets.get(t) ? model.targets.get(t).state : null);
    live.delete(X); try { kk.shutdown(); } catch { }
    return { refused: refused && refused.code, parkedClose, attachFirst, w1, t1: t1 && t1.slice(0, 4), t1State: st(t1), w2, t2: t2 && t2.slice(0, 4), t2State: st(t2), rooted: !!t2 && roots.includes(t2), roots: roots.map((x) => x.slice(0, 4)), rebinds: jl2.filter((x) => x.includes(X + ':') && /a new tab bound|bound to the browser's only tab/.test(x)).length };
  };
  const ord = await closeThenAttach(K, 'shipped');
  ok(ord.refused === 'not_owner' && gateOf(ord.parkedClose) && !ord.attachFirst && ord.t1State === 'closed' && ord.t2State === 'ok' && gateOf(ord.rooted) && ord.rebinds === 0, 'THE SECOND ORDERING: a narrowing\'s session close still in flight when the holder re-attaches FINISHES FIRST — it closes the tab the narrowing took (not the re-attach\'s), the new window\'s tab stays open and rooted, no rebind replaces its root (the F11 runner red: the close landed on the new tab, the finalize left the window open)', ord);
  const KSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const WAIT_LINE = "    if (cw.wait) { log.log?.(`[browser] ${browserKey}: its attach on ${p.id} waits for its session's close in flight (bounded by the browser CLI's own timeouts, ~30 s at most)`); await sessionCloses.get(cw.key); }\n";
  const MK = mutantCopies('jobs-browser-close', REPO);
  ok(verdictOf(KSRC.includes(WAIT_LINE)), 'control "the attach does not wait for its close": its needle is in the shipped keeper');
  const pre = await closeThenAttach(MK.load('src/server/browser-keeper.js', editAnchor(KSRC, WAIT_LINE, '', "src/server/browser-keeper.js"), 'no-close-wait'), 'prefix');
  ok(gateOf(pre.attachFirst) && pre.t2State === 'closed' && !pre.rooted && pre.rebinds > 0, 'control "the attach does not wait for its close" (the pre-fix keeper): the SAME hand interleave goes RED — the re-attach binds first, the late close shuts the NEW window\'s tab and marks it lost, the next verb rebinds a fresh root', pre);
  // B-0cee (an agent's report, fb-61e4794124; test-browser-windows c32 is its heavy cell): the holder's window closed between the
  // create and the bind (every tab of it gone, the binary knows no such tab) ⇒ the keeper asks ONCE more itself: a window of its
  // own, said — never the shared fallback, never the agent's hand. The release refused window_busy (bind_failed); the agent repeated it
  const bindGone = async (Kmod, tag) => {
    const kx = mk(Kmod, { dataDir: path.join(O, 'data-b0cee-' + tag) }); await kx._facts.probeVersion();
    const px = kx.createProfile({ label: 'B0 ' + tag }); await kx.attach({ profileId: px.id, browserKey: KA, sessionId: 'x-b0-' + tag });
    const NS = B.sessionNameFor(px.id);
    const act = async (u) => { try { const r = await kx.agentTabAct({ browserKey: KA, argv: ['tab', 'new', u] }); return r && r.ok === false ? { ok: false, code: r.code || null, why: r.why || null } : { ok: true, r }; } catch (e) { return { ok: false, code: e.code || null, why: e.why || null }; } };
    const first = await act('https://b0.example/1');
    model.onCreated = (tid) => { const w = model.targets.get(tid).windowId; for (const [id, t] of [...model.targets]) if (t.windowId === w && t.state !== 'closed') { closeTab(id); fakeRemove(NS, id); } };
    const n0 = model.openWindowCalls;
    const r = await act('https://b0.example/2'); const hookLeft = typeof model.onCreated === 'function'; model.onCreated = null;
    try { kx.shutdown(); } catch { }
    return { first: first.ok, hookFired: !hookLeft, ok: r.ok, code: r.code || null, why: r.why || null, shared: !!(r.r && r.r.opened && r.r.opened.window === 'shared'), note: (r.r && r.r.noteCode) || null, newWindows: model.openWindowCalls - n0 };
  };
  const b0 = await bindGone(K, 'tree');
  ok(JSON.stringify(b0) === JSON.stringify({ first: true, hookFired: true, ok: true, code: null, why: null, shared: false, note: 'tab_new_window', newWindows: 1 }), 'B-0cee: the holder\'s window closed between the create and the bind ⇒ the keeper asks once more itself — the tab opens in a NEW window of its own, said (tab_new_window), never shared, nothing for the agent to repeat', b0);
  const b0r = await bindGone(MK.load('src/server/browser-keeper.js', anchored(KSRC, "const again = await openOwnTab(p, holderKey, { url, ns, opts, pin, fallback, json, timeout, _again: true }); if (again && again.ok && again.window === 'own') { again.remade = true; again.intoWindow = false; } return again; }", '}', 'B-0cee the release: no second ask'), 'no-bind-retry'), 'release');
  ok(JSON.stringify(b0r) === JSON.stringify({ first: true, hookFired: true, ok: false, code: 'window_busy', why: 'bind_failed', shared: false, note: null, newWindows: 0 }), 'CONTROL (the release): the same scene is refused window_busy (bind_failed) — the agent repeats `tab new` by hand (fb-61e4794124) — RED', b0r);
  // B-0cee follow-up (主开发 03:47Z): the THREE BOUNDS the second ask rests on, each driven, and its words true without a stamp.
  // Each scene counts what the act made: new windows (openWindow) and new tabs (every create mints a target id)
  const bindBounds = async (Kmod, tag, { first = true, unstamp = false, onCreated = null, onWindow = null } = {}) => {
    const kx = mk(Kmod, { dataDir: path.join(O, 'data-b0b-' + tag) }); await kx._facts.probeVersion();
    const px = kx.createProfile({ label: 'B0b ' + tag }); await kx.attach({ profileId: px.id, browserKey: KA, sessionId: 'x-b0b-' + tag });
    const NS = B.sessionNameFor(px.id);
    const closeWin = (tid) => { const w = model.targets.get(tid).windowId; for (const [id, t] of [...model.targets]) if (t.windowId === w && t.state !== 'closed') { closeTab(id); fakeRemove(NS, id); } };
    const forget = (tid) => fakeRemove(NS, tid); // the binary knows the tab no more; the browser still has it (the B-19a9 class)
    const act = async (u) => { try { const r = await kx.agentTabAct({ browserKey: KA, argv: ['tab', 'new', u] }); return r && r.ok === false ? { ok: false, code: r.code || null, why: r.why || null } : { ok: true, r }; } catch (e) { return { ok: false, code: e.code || null, why: e.why || null }; } };
    const firstOk = first ? (await act('https://b0b.example/1')).ok : null;
    // a lease whose window is not of THIS browser run (no stamp, no windowIn — a lease from before it): its tab new opens a window
    if (unstamp) { const l = B.findLease(kx._reg().leases, px.id, KA); if (l) { l.windowId = null; l.windowIn = null; } }
    const H = { closeWin, forget };
    model.onCreated = onCreated ? (tid) => onCreated(H, tid) : null; model.onWindow = onWindow ? (tid) => onWindow(H, tid) : null;
    const w0 = model.openWindowCalls, t0 = model.nextT;
    const r = await act('https://b0b.example/2'); model.onCreated = null; model.onWindow = null; model.readFails = 0;
    try { kx.shutdown(); } catch { }
    return { first: firstOk, ok: r.ok, code: r.code || null, why: r.why || null, note: (r.r && r.r.noteCode) || null, windows: model.openWindowCalls - w0, tabs: model.nextT - t0 };
  };
  const REFUSED = (windows, tabs) => ({ ok: false, code: 'window_busy', why: 'bind_failed', note: null, windows, tabs });
  const SC = {
    lives: [{ onCreated: (H, tid) => H.forget(tid) }, { first: true, ...REFUSED(0, 1) }, 'a bind that failed on a tab that STILL LIVES (the browser lists it) ⇒ refused as before, never a second tab (the B-19a9 stall is never doubled)'],
    unread: [{ onCreated: (H, tid) => { H.closeWin(tid); model.readFails = 1; } }, { first: true, ...REFUSED(0, 1) }, 'a target list that did NOT ANSWER after the failed bind ⇒ refused as before, never a guess'],
    twice: [{ onCreated: (H, tid) => H.closeWin(tid), onWindow: (H, tid) => H.closeWin(tid) }, { first: true, ...REFUSED(1, 2) }, 'a SECOND loss (the asked-again window closed too) ⇒ refused, exactly one more ask, never a third'],
    unstamped: [{ first: false, unstamp: true, onWindow: (H, tid) => H.closeWin(tid) }, { first: null, ok: true, code: null, why: null, note: 'tab_new_window', windows: 2, tabs: 2 }, 'a lease with NO window of this browser run (no stamp) whose new window closed before the bind ⇒ asked once more and SAID (tab_new_window): the manual\'s «says so» true without a stamp'],
  };
  const bounds = async (Kmod, tag) => { const out = {}; for (const [k, [o]] of Object.entries(SC)) out[k] = await bindBounds(Kmod, `${tag}-${k}`, o); return out; };
  const bt = await bounds(K, 'tree');
  for (const [k, [, want, words]] of Object.entries(SC)) ok(JSON.stringify(bt[k]) === JSON.stringify(want), `B-0cee bound: ${words}`, bt[k]);
  const ANCH_LIST = "tabGone = !!(tl && tl.ok && Array.isArray(tl.targets) && !tl.targets.some((t) => String(t.targetId || '').toUpperCase() === id));";
  const B0C = [
    ['the list read but never judged (any failed bind asked again)', anchored(KSRC, ANCH_LIST, 'tabGone = !!(tl && tl.ok);', 'B-0cee: the list not judged'), 'lives'],
    ['an unread list taken for a gone tab', anchored(KSRC, ANCH_LIST, "tabGone = !(tl && tl.ok) || !tl.targets.some((t) => String(t.targetId || '').toUpperCase() === id);", 'B-0cee: unread is gone'), 'unread'],
    ['asked again with no bound', anchored(KSRC, 'if (fallback && !_again) { let tl = null;', 'if (fallback) { let tl = null;', 'B-0cee: no second-loss bound'), 'twice'],
    ['the second ask said only when a window was stamped (6e617b6b7)', anchored(KSRC, " if (again && again.ok && again.window === 'own') { again.remade = true; again.intoWindow = false; }", '', 'B-0cee: the words of a stamp only'), 'unstamped'],
  ];
  for (const [what, src, red] of B0C) {
    const got = await bindBounds(MK.load('src/server/browser-keeper.js', src, 'b0cee-' + red), 'ctl-' + red, SC[red][0]);
    ok(JSON.stringify(got) !== JSON.stringify(SC[red][1]) && JSON.stringify(got) !== JSON.stringify(bt[red]) && got.ok === true && (red !== 'unstamped' || (got.note === null && got.windows === 2)), `CONTROL (B-0cee, ${what}): the «${red}» bound goes RED — ${red === 'unstamped' ? 'the tab opens and nothing says why' : 'the act asks again where it must not'}`, got);
  }
  for (const row of copiesCensus(MK.files, MK.dir, REPO, { minCopies: 1 })) ok(verdictOf(row.pass), row.name, row.detail);
}


// ── ⑥ accept-fixes-jobs F6 + F11's engine seam: a REAL jobs engine runs the REAL CLI ──
console.log('— ⑥ a job\'s own working directory is a write root of its browser commands (the words name the job); every run end calls the release seam');
{
  const { JobManager } = require('../src/jobs.js');
  const { scratch } = await import('./scratch.mjs');
  // the jobs' OWN temp dir (TMPDIR) is not the scratch root: the job's cwd (D/work) is then writable ONLY as the job's directory
  const D = scratch('jbrw-f6'); const WD = path.join(D, 'work'), TMP = path.join(D, 'tmp'); for (const d of [path.join(D, 'bin'), WD, TMP]) fs.mkdirSync(d, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
  fs.copyFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), path.join(D, 'bin', 'job-wrapper.js'));
  // lane mirror-green-channels (the Actions mirror, 2.369.204): the CLI looks the REAL browser CLI up on PATH after the
  // write fence and BEFORE the server call — the runner has none, so the first leg answered binary_absent and never reached
  // the server it judges (green here only because this machine has agent-browser on PATH). A job's PATH starts with its
  // engine's data bin (src/jobs.js: `<dataDir>/bin:` + the server's PATH — D/bin here), so a stand-in there that answers
  // `--version` like the flag table's build is found first: the leg reaches the server call on every machine, and a run of
  // the stand-in past `--version` says so in the job's log.
  const STAND_IN = path.join(D, 'bin');
  fs.writeFileSync(path.join(STAND_IN, 'agent-browser'), `#!/bin/sh\nif [ "$1" = --version ]; then echo 'agent-browser ${require(path.join(REPO, 'src/browser-verbs.js')).TABLE_VERSION}'; exit 0; fi\necho 'the stand-in agent-browser ran past --version' >&2; exit 9\n`, { mode: 0o755 });
  const ended = [];
  const jm = new JobManager({ dataDir: D, broadcast() { }, notifyUser() { }, log() { }, apiBase: 'http://127.0.0.1:9', onRunEnded: (job) => ended.push(job.id) });
  jm.init();
  const caller = { conversationId: 'conv-T', sessionId: 'sess-T', sessionCreatedAt: 1, groups: new Set(['T-g']) };
  const owner = { conversation: { backend: 'claude', id: 'conv-T' }, sessionId: 'sess-T', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: ['T-g'] };
  const CLI = path.join(REPO, 'data/bin/vibespace-browser');
  // the engine's own 5 s sweep (what notices a run's end) asked every 200 ms — lane fast-budget: four 5 s waits were 15 of the suite's 30 s
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); await jm._sweep(); } return false; };
  const runJob = async (name, argv, cwd) => { const r = jm.create({ kind: 'task', name, cmd: { argv, env: { TMPDIR: TMP }, ...(cwd ? { cwd } : {}) }, owner }, caller); const j = jm.jobs.get(r.job.id); await until(() => ['done', 'failed', 'interrupted'].includes(j.state)); let log = ''; try { log = fs.readFileSync(j.runs[j.runs.length - 1].log, 'utf8'); } catch { } return { j, log }; };
  const inWd = await runJob('shot-in-wd', [process.execPath, CLI, 'screenshot', path.join(WD, 'shot.png')], WD);
  ok(!/write_path_refused/.test(inWd.log) && verdictOf(/127\.0\.0\.1:9|ECONNREFUSED|fetch failed|unreachable|not answer/i.test(inWd.log)), 'F6: inside a job, `screenshot <the job\'s cwd>/shot.png` PASSES the write fence (it reaches the server call — refused write_path_refused before: a job had no VIBESPACE_SESSION_CWD)', inWd.log.slice(0, 600));
  const outside = await runJob('shot-outside', [process.execPath, CLI, 'screenshot', path.join(D, 'elsewhere.png')], WD);
  ok(gateOf(/write_path_refused/.test(outside.log)) && gateOf(/the job's working directory \(/.test(outside.log)) && !/session started before|session directory/.test(outside.log), 'F6: a path OUTSIDE the job\'s cwd is still refused — the words name "the job\'s working directory", never a session restart', outside.log.slice(0, 600));
  const noCwd = await runJob('shot-no-cwd', ['sh', '-c', `cd ${JSON.stringify(WD)} && exec ${JSON.stringify(process.execPath)} ${JSON.stringify(CLI)} screenshot ./x.png`]);
  ok(gateOf(/write_path_refused/.test(noCwd.log)) && gateOf(/Background Work job's working directory is not known here/.test(noCwd.log)) && !/session started before this VibeSpace version|once it is restarted/.test(noCwd.log), 'F6: a job with NO directory of its own (never the server\'s cwd, never the shell\'s `cd`) is refused in the JOB\'s words — never "your session is too old, restart it"', noCwd.log.slice(0, 600));
  // r2886: THE WORDS NAME THE TEMP FOLDER THE FENCE ALLOWS — the OS temp folder AS THE JOB's CLI SEES IT (its TMPDIR: TMP here, by its
  // real path), never «/tmp» (a Mac's /var/folders/…, any shell that sets TMPDIR); a save there passes. RED: the release's words,
  // through a copy of the CLI beside a verb table whose sentences say «/tmp» again (today's). TMP's own path ends in /tmp: the
  // release's words are judged by «, /tmp or» / «only /tmp or», never by a bare «/tmp or»
  const TMP_REAL = fs.realpathSync(TMP), RELEASE_WORDS = /(?:, |only |under )\/tmp or ~\/Downloads/;   // stale-pins: kept — a deliberate absence check of the release's «/tmp» words (r2886)
  ok(gateOf(outside.log.includes(`${TMP_REAL} or ~/Downloads; nothing ran`)) && gateOf(outside.log.includes(`save under the job's working directory, ${TMP_REAL} or ~/Downloads`))
    && gateOf(noCwd.log.includes(`so only ${TMP_REAL} or ~/Downloads`)) && !RELEASE_WORDS.test(outside.log + noCwd.log),
    'r2886: the refusal and its remedy name the temp folder the job\'s CLI sees (its TMPDIR, by its real path) — never «/tmp»', (outside.log + noCwd.log).slice(-500));
  const inTmp = await runJob('shot-in-tmp', [process.execPath, CLI, 'screenshot', path.join(TMP, 'shot.png')], WD);
  ok(!/write_path_refused/.test(inTmp.log) && verdictOf(/127\.0\.0\.1:9|ECONNREFUSED|fetch failed|unreachable|not answer/i.test(inTmp.log)), 'r2886: …and a screenshot in THAT folder passes the fence (it reaches the server call)', inTmp.log.slice(-300));
  const vsrc = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8'), today = anchored(vsrc, '${TMP} or ~/Downloads', '/tmp or ~/Downloads', 'the release words (r2886)', { count: 7 });   // stale-pins: kept — the release's words restored for the RED control (r2886)
  const DT = path.join(D, 'ctl-words', 'bin'); fs.mkdirSync(DT, { recursive: true });
  fs.copyFileSync(CLI, path.join(DT, 'vibespace-browser')); fs.writeFileSync(path.join(DT, 'vibespace-browser-verbs.js'), today); fs.copyFileSync(path.join(REPO, 'src/cli-call.js'), path.join(DT, 'cli-call.js'));
  const outToday = await runJob('shot-outside-today', [process.execPath, path.join(DT, 'vibespace-browser'), 'screenshot', path.join(D, 'elsewhere.png')], WD);
  ok(today !== vsrc && gateOf(/write_path_refused/.test(outToday.log)) && gateOf(RELEASE_WORDS.test(outToday.log)) && !outToday.log.includes(`${TMP_REAL} or ~/Downloads`),
    'RED CONTROL: the release\'s words (a verb table whose sentences say «/tmp», beside a copy of the CLI) tell a job whose temp folder is elsewhere to save under «/tmp» — a folder its fence then refuses', outToday.log.slice(-300));
  // F11's engine seam: an exit 0, a crash (exit 3) and a stop each call onRunEnded once (server.js wires it to the keeper's releaseJob)
  const crash = await runJob('crash', ['sh', '-c', 'exit 3']);
  const st = jm.create({ kind: 'task', name: 'stopped', cmd: { argv: ['sh', '-c', 'sleep 30'] }, owner }, caller); const sj = jm.jobs.get(st.job.id);
  await until(() => sj.state === 'up' && sj.proc && sj.proc.pid); jm.stop(sj); await until(() => ['interrupted', 'failed'].includes(sj.state));
  const once = (id) => ended.filter((x) => x === id).length === 1;
  ok(gateOf(once(inWd.j.id)) && gateOf(once(crash.j.id)) && crash.j.state === 'failed' && gateOf(once(sj.id)) && sj.state === 'interrupted', 'F11: every run end — exit, crash (exit 3), stop (interrupted) — calls the release seam exactly once', { ended, crash: crash.j.state, stopped: sj.state });
  // round wxzvih2as's MUST (1), a PERSON's REMOVAL BEATS THE COPIES: removing a job releases its browser handle BY ID (the same release a
  // run's end makes) — the keeper never keeps it because a kept copy of torn jobs.json still names the job
  { const n0 = ended.filter((x) => x === inWd.j.id).length; const rr = jm.rm(jm.jobs.get(inWd.j.id) || inWd.j);
    ok(!!rr && !rr.error && ended.filter((x) => x === inWd.j.id).length === n0 + 1 && !jm.jobs.has(inWd.j.id), 'a PERSON\'s removal of a job releases its browser handle by id (the run-end release, once more) — no kept copy keeps it', { rr, n: ended.filter((x) => x === inWd.j.id).length - n0 }); }
  // round wjgchwl6a (8): ITS RED CONTROL — the same removal on a copy of src/jobs.js whose release line is cut: nothing is released
  { const JSRCR = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8'), MR = mutantCopies('jobs-browser-rm', REPO);
    const { JobManager: JR } = MR.load('src/jobs.js', editAnchor(JSRCR, '    try { this.d.onRunEnded?.(job, null); } catch { }', '    { }', 'src/jobs.js'), 'rm-unreleased');
    const DR = path.join(D, 'rm-control'); fs.mkdirSync(DR, { recursive: true });
    const endedR = [], jr = new JR({ dataDir: DR, broadcast() { }, notifyUser() { }, log() { }, apiBase: 'http://127.0.0.1:9', onRunEnded: (job) => endedR.push(job.id) });
    jr.init();
    const rec = JSON.parse(JSON.stringify(crash.j)); rec.id = 'jb-0000c0de'; jr.jobs.set(rec.id, rec);   // a finished job's record (its run ended)
    const rx = jr.rm(jr.jobs.get(rec.id));
    ok(!!rx && !rx.error && endedR.filter((x) => x === rec.id).length === 0 && !jr.jobs.has(rec.id), 'RED CONTROL — the removal\'s release cut (in a copy): the person\'s removal of a job releases nothing — the leg above names its red', { rx, released: endedR.length });
    try { jr.shutdown(); } catch { } }
  try { jm.shutdown(); } catch { }
}

// ── ⑤ wiring pins + the trace names the job by ID ──
console.log('— ⑤ the wiring: the CLI reads the job token, a run\'s end releases, the keeper knows which jobs run, the trace stores the job id');
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  ok(verdictOf(/const TOKEN = process\.env\.VIBESPACE_SESSION_TOKEN \|\| process\.env\.VIBESPACE_JOB_TOKEN;/.test(read('data/bin/vibespace-browser'))), 'data/bin/vibespace-browser reads VIBESPACE_JOB_TOKEN when no session token (a job\'s process carries only that)');
  ok(gateOf(/VIBESPACE_JOB_TOKEN: this\._jobToken\(job\)/.test(read('src/jobs.js'))) && !/VIBESPACE_SESSION_TOKEN/.test(read('src/jobs.js')), '…which is what src/jobs.js puts in a job\'s env (and no session token)');
  // lane jobs-memory-bound round 5: ONE JUDGE PER RUN END — a run already judged returns before it (it released at its own judgment)
  ok(verdictOf(/_finalizeRun\(job, run, exit, why\) \{\n(\s*if \(run\.endedAt\) return; \/\/ ONE JUDGE PER RUN END[^\n]*\n)?\s*run\.endedAt = exit\.endedAt \|\| now\(\);\n[^\n]*\n\s*try \{ this\.d\.onRunEnded\?\.\(job, run\); \} catch \{ \}/.test(read('src/jobs.js'))), 'the run\'s finalize calls onRunEnded FIRST (before any state branch — every run end releases)');
  ok(gateOf(/onRunEnded: \(job, run\) => onRunEnded\(job, run\)/.test(read('src/server/jobs-wiring.js'))) && verdictOf(/onRunEnded: \(job\) => \{ try \{ browserKeeper\?\.releaseJob\?\.\(job\.id, 'the job run ended'\); \} catch \{ \} \}/.test(read('server.js'))), 'jobs-wiring forwards it and server.js releases the job\'s browser handle (keeper.releaseJob)');
  const mw = read('src/server/mounts-plugins-wiring.js');
  ok(gateOf(mw.includes("        return (jobId) => { try { const jm = getJobs ? getJobs() : null; const why = P.jobsUnknownCode(jm); if (why) { say(why); return 'unknown'; } return P.jobRunningIn(jm, jobId); } catch { say('jobs_ask_threw'); return 'unknown'; } }; })(),\n")) && gateOf(/getJobs: \(\) => \(getJobs \? getJobs\(\) : null\),\n\s*bindingsLookup: \(cid\) =>/.test(mw)) && verdictOf(/getJobs: \(\) => jobsWiring\.getJobs\(\)/.test(read('server.js'))), 'the keeper asks the engine which jobs run (r3571: while it cannot say, or the ask throws, UNKNOWN — said once by its code); the routes get the engine + the owner\'s recorded key');
  const kp = read('src/server/browser-keeper.js');
  ok(verdictOf(/for \(const \{ handle \} of J\.jobChildrenToRelease\(reg\.children, jobRunning\)\) releaseJobHandle\(handle, 'its job is not running'\);\n\s*const live = liveKeys\(\);/.test(kp)), 'the reconcile (boot + every tick) releases a job handle whose job is not running BEFORE the carrier rule');
  ok(verdictOf(/function liveKeys\(\) \{[\s\S]{0,200}sessionLiveKeys\(\)[\s\S]{0,200}J\.carriedJobHandles\(reg\.children, jobRunning\)/.test(kp)), 'the keeper\'s live set = the live sessions\' keys + the handles RUNNING jobs carry');
  const rb = read('src/routes/browser.js');
  ok(gateOf(/if \(token && token\.startsWith\('jbt_'\)\) return jobAgentFacts\(req, res, token\);/.test(rb)) && verdictOf(/if \(f\.job\) return resolveForJob\(req, res, k, f\);/.test(rb)), 'the routes admit jbt_ through ONE door (agentFacts → jobAgentFacts) and resolve a job through resolveForJob');
  ok(verdictOf(/if \(token && token\.startsWith\('jbt_'\)\) \{ const jf = jobFactsOf\(token, \{ mint: false \}\);/.test(rb)), 'the BELT judges a job\'s answer with the job\'s own key and never mints one');
  const T = require(path.join(REPO, 'src/browser-trace.js'));
  const base = { id: 'e1', at: 1, sessionId: 's', browserKey: 'bk-0000aaaa.2', profileId: 'p', command: { action: 'click', params: {} }, position: null };
  ok(T.entryFor({ ...base, job: 'jb-0000aaaa' }).job === 'jb-0000aaaa' && !('job' in T.entryFor({ ...base, job: 'daily reconcile' })) && !('job' in T.entryFor({ ...base, job: 'jb-0000aaaa', holder: 'user' })) && !('job' in T.entryFor(base)), 'a trace entry stores the job by ID only (a name-shaped value is never stored; the user\'s own act never carries one)');
  ok(verdictOf(/job: typeof keeper\?\.jobOf === 'function' \? keeper\.jobOf\(tp\.browserKey\) : null \}\);/.test(read('src/server/browser-trace.js'))), 'the recorder asks the keeper which job a handle is');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(gateOf(/t\('Job: \{name\}'/.test(read('src/lib/browser-live-window.js'))) && gateOf(zh.includes('"Job: {name}":')) && verdictOf(ja.includes('"Job: {name}":')), 'the strip names a job\'s window "Job: <name>" (zh + ja)');
  const bs = require(path.join(REPO, 'src/browser-stream.js'));
  if (typeof bs.browserListFor === 'function') {
    const rows = bs.browserListFor({ browserKey: 'bk-0000aaaa', leases: [], attachments: [], children: [{ handle: 'bk-0000aaaa.2', job: 'jb-0000aaaa', browser: { profileId: 'p-bank', state: 'ready', live: true, job: true } }, { handle: 'bk-0000aaaa.1', browser: null }], helperNames: { 'bk-0000aaaa.1': 'research' }, jobNames: { 'bk-0000aaaa.2': 'daily reconcile' } });
    const jr = (rows || []).find((r) => r.ref === 'bk-0000aaaa.2'), hr = (rows || []).find((r) => r.ref === 'bk-0000aaaa.1');
    ok(gateOf(jr) && gateOf(jr.helper) && jr.helper.job === true && jr.helper.name === 'daily reconcile' && jr.profileId === 'p-bank' && gateOf(hr) && gateOf(hr.helper) && !hr.helper.job && hr.helper.name === 'research', 'the strip model: the job\'s row is a helper row marked job with its live name and its profile; a helper stays a helper', rows);
  } else ok(false, 'browser-stream exports browserListFor');
}

ok(verdictOf(/const \{ addressableId \} = require\('\.\.\/claude-lock-capture\.js'\);\s*\n\s*if \(cid\) for \(const \[tid, t\] of \(ctx\.activeSessions \|\| new Map\(\)\)\) if \(t && addressableId\(t\) === cid\)/.test(fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8'))), 'PIN (verify r1): jobFactsOf finds the owner\'s live session by addressableId — a pending fork\'s borrowed id is nobody\'s');
{ const jobsSrc = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8'), wrap = fs.readFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), 'utf8');
  // B-ba47's follow-up (9fa653133): the run's env is jobRunEnv — jobEnv over the owner's own words plus the hub's additions, those
  // marked (VIBESPACE_HANDED) — written over several lines: the pin reads the spawn's whole env property, up to the next one
  // 主开发 r1278's small: the slice ends at the CALL'S OWN CLOSE (its parentheses counted), and a close not found within 4000
  // characters is a red by name — never a slice that runs on into the rest of the file
  const envAt = jobsSrc.indexOf('env: jobRunEnv(');
  const closeOf = (t, open) => { let d = 0; for (let i = open; i < t.length && i < open + 4000; i++) { if (t[i] === '(') d++; else if (t[i] === ')' && --d === 0) return i + 1; } return -1; };
  const envEnd = envAt < 0 ? -1 : closeOf(jobsSrc, envAt + 'env: jobRunEnv'.length), spawnEnv = envEnd < 0 ? '' : jobsSrc.slice(envAt, envEnd);
  ok(envAt >= 0 && envEnd > envAt && verdictOf(spawnEnv.endsWith(')')), `the job spawn's env call is found and closed within 4000 characters (${envAt}..${envEnd}) — the pin below reads exactly that call`);
  ok(gateOf(/if \(\/\^\(VIBESPACE_\|npm_\|CLAUDE_CODE_\)\/\.test\(k\)\) delete env\[k\];/.test(jobsSrc)) && gateOf(/return withHandedMark\(jobEnv\(\{ \.\.\.own, \.\.\.handed \}, base\), jobEnv\(own, base\)/.test(jobsSrc)) && spawnEnv.length > 0 && gateOf(/VIBESPACE_JOB_TOKEN: this\._jobToken\(job\)/.test(spawnEnv)) && !/VIBESPACE_SESSION_TOKEN/.test(spawnEnv) && gateOf(/env: spec\.env,/.test(wrap)) && !/process\.env/.test(wrap), 'PIN (verify r1 ④): a job\'s child env is jobEnv (through jobRunEnv since B-ba47\'s follow-up: the hub\'s additions marked) — every VIBESPACE_* of the server stripped, VIBESPACE_JOB_TOKEN set, NEVER a session token; the wrapper hands spec.env to the child unchanged and never falls back to its own env (lane job-spec-off-argv)'); }
// ── ③ mutant-copy controls ──
console.log('— ③ mutant-copy controls (a weakened rule must turn named rows red)');
const src = fs.readFileSync(path.join(REPO, 'src/browser-job-principal.js'), 'utf8');
const M = mutantCopies('jobs-browser', REPO);
const red = (mod) => [...principalTable(mod), ...routeTable(mod), ...resolveTable(mod), ...handleTable(mod)].filter((r) => !r.good).map((r) => r.name);
const CONTROLS = [
  { what: 'the route rule fails OPEN', needle: "  if (JOB_ROUTES_ALLOWED.includes(r)) return { ok: true };", repl: "  if (!JOB_ROUTES_REFUSED.includes(r)) return { ok: true };", reds: ['FAIL CLOSED: an unknown route "teleport" is refused'] },
  { what: 'a finished job still browses (no running check)', needle: "  if (!isRunningJob(job)) return", repl: "  if (false) return", reds: ['a FINISHED job (done) is refused — its token outlives its run', 'a service between restarts (down)'] },
  { what: 'the owner\'s temporary browser handed to a job', needle: "  return { ok: false, code: 'job_no_profile', error: 'this job\\'s conversation has no profile pinned", repl: "  if (v.kind === 'none') return { ok: true, profileId: null };\n  return { ok: false, code: 'job_no_profile', error: 'this job\\'s conversation has no profile pinned", reds: ['no pin, no attachment (the owner\'s temporary browser) ⇒ job_no_profile'] },
];
for (const c of CONTROLS) {
  ok(verdictOf(src.includes(c.needle)), `control "${c.what}": its needle is in the shipped source`);
  const mod = M.load('src/browser-job-principal.js', editAnchor(src, c.needle, c.repl, "src/browser-job-principal.js"), c.what.replace(/\W+/g, '-').slice(0, 24));
  const r = red(mod);
  ok(verdictOf(c.reds.every((n) => r.includes(n))), `control "${c.what}": the named rows go RED on the weakened copy (${r.length} red)`, r);
}
for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(verdictOf(row.pass), row.name, row.detail);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
