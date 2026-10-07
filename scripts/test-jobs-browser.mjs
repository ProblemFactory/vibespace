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
import { deadPort } from './scratch.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const J = require(path.join(REPO, 'src/browser-job-principal.js'));
const B = require(path.join(REPO, 'src/browser-profiles.js'));

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
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
for (const r of principalTable(J)) ok(r.good, `${r.name} → ${r.want}`, r.v);
ok(J.jobLabelOf(job()) === 'job daily reconcile' && J.jobLabelOf(job({ name: '' })) === 'job jb-11112222' && J.jobLabelOf(job({ name: 'x'.repeat(80) })).length === 44, 'jobLabelOf: "job <name>" (≤ 40 chars of it), the id when unnamed');

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
for (const r of routeTable(J)) ok(r.good, r.name);

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
for (const r of resolveTable(J)) ok(r.good, r.name, r.r);

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
    { name: '…a throwing engine releases (fail toward release, never a lease nobody carries)', good: M.jobChildrenToRelease(children, () => { throw new Error('down'); }).length === 4 },
  ];
}
for (const r of handleTable(J)) ok(r.good, r.name);

// ── ② admission = the owner's ──
console.log('— ② admission through the REAL mayAttach: a job\'s handle is judged as its owner conversation');
const prof = (owner, label = 'work') => ({ id: 'p-' + label, label, owner, scopeAt: 1 });
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
  ok(owner.ok === want && viaJob.ok === want && (want || (viaJob.code === 'not_owner' && owner.code === 'not_owner')), `${name}: owner ${owner.ok ? 'admitted' : owner.code}, job ${viaJob.ok ? 'admitted' : viaJob.code}`, { owner, viaJob });
}
{
  const p = prof({ kind: 'only', who: [{ kind: 'session', id: OWNER }] });
  const d = B.decideAttach({ profile: p, leases: [{ profileId: p.id, browserKey: OWNER, sessionId: 's1' }], browserKey: H, sessionId: null, now: 10, taskIds: [] });
  ok(d.ok && d.created && d.lease.browserKey === H, 'decideAttach: the job\'s handle gets its OWN lease beside the owner\'s (one window per holder)', d);
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
    readTargets: async () => ({ ok: true, targets: liveTargets().map(([id, t]) => ({ targetId: id, type: 'page', openerId: t.openerId || undefined })) }),
    openWindow: async (url) => { model.openWindowCalls++; const w = ++model.nextW; const tid = addTab(nsOfUrl(url), mintTid(), { windowId: w, holder: 'keeper' }); const readOk = model.windowReadFails <= 0; if (!readOk) model.windowReadFails--; return { ok: true, targetId: tid, windowId: readOk ? w : null }; },
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
  const jm = { ready: true, jobs, jobByToken: (t) => jobs.get(tokens.get(t)) || null };
  const k = mk(K, { dataDir: path.join(O, 'data-job'), jobRunning: (id) => J.isRunningJob(jobs.get(id)) }); await k._facts.probeVersion();
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
    ok(rs.status === 200 && j.job && j.job.lands && j.job.lands.profileId === pBank.id && j.job.pin && j.job.pin.profileId === pBank.id && j.job.lease === null && j.job.label === 'job daily reconcile', 'F5: a job\'s status BEFORE any page verb names the profile its next verb lands on (Bank — the owner\'s pin), the owner\'s pin and "no window yet" — it answered its bare handle\'s empty set ("no profile attached / pin: none")', j.job || j); }
  const r1 = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['open', 'https://bank.test'] });
  const H = handleOf('jb-0000aaaa');
  ok(r1.status === 200 && r1.j && r1.j.ok && r1.j.job === true && r1.j.kind === 'attachment', 'a jbt_ resolve is ADMITTED (200, kind attachment, job:true) — it was 401 "missing session token" before', r1);
  ok(B.isChildKey(H) && B.parentKeyOf(H) === KA && k._reg().children[H].job === 'jb-0000aaaa', `the job got its OWN handle under the owner's key (${H}, tagged job)`, k._reg().children);
  ok(JSON.stringify(leasesOf(H)) === JSON.stringify([pBank.id]), 'its own lease is in the OWNER\'s pinned profile (Bank) — the same logins', leasesOf(H));
  ok(k._reg().pins[KA] && k._reg().pins[KA].profileId === pBank.id && !k._reg().pins[H], 'the owner\'s pin is untouched and the job pinned nothing');
  const lw = (bk) => { const l = B.findLease(k._reg().leases, pBank.id, bk); return l ? l.windowId : undefined; };
  { const rOwner = await call('/api/agent/browser/resolve', 'vsst_owner', { argv: ['open', 'https://bank.test/home'] }); ok(rOwner.status === 200 && leasesOf(KA).includes(pBank.id), 'the owner conversation still resolves to Bank, its own lease beside the job\'s', rOwner); }
  ok(lw(H) !== undefined && lw(KA) !== undefined && String(lw(H)) !== String(lw(KA)), `ITS OWN WINDOW: the job's lease and the owner's hold different windows (${lw(H)} vs ${lw(KA)})`);
  const winKA = lw(KA);
  { const out = await cliRun(['status'], { VIBESPACE_JOB_TOKEN: 'jbt_aaaa' });
    ok(/this is Background Work job daily reconcile \(jb-0000aaaa\)/.test(out) && /its page verbs land on Bank \(/.test(out) && /its window: ready/.test(out) && /the conversation's pin: Bank/.test(out) && !/no profile attached|pin: none/.test(out), 'F5: the REAL CLI\'s `status` inside the job prints the job\'s binding — lands on Bank, its window live, the conversation\'s pin — never "no profile attached / pin: none"', out); }
  // accept-fixes-jobs F10: the live view's browsers row names the job's window by the JOB's name (the route's own answer → the strip's list)
  { const S = require('../src/browser-stream.js');
    const rs = await fetch(base + '/api/browser/session/w-owner'); const j = await rs.json();
    const row = rs.status === 200 ? S.browserListFor(j).find((x) => x.ref === H) : null;
    ok(j.jobNames && j.jobNames[H] === 'daily reconcile' && row && row.helper && row.helper.job === true && row.helper.name === 'daily reconcile', 'F10: the browsers row of the job\'s window is the JOB by its name ("daily reconcile", job) — it read a bare "Helper 1" (the attachment set dropped the job tag, so the route named nothing)', { status: rs.status, jobNames: j.jobNames, helper: row && row.helper }); }
  // verify r1 (MED): a PENDING FORK carrying the owner's conversation id, first in the live set, with its own browser key and
  // no pin — before the fix the job was judged as the FORK (its handle minted under bk-f0f0f0f0, refused job_no_profile)
  { const fork = { claudeSessionId: 'conv-userW-1', _browserKey: 'bk-f0f0f0f0', _forkRequested: true, _forkSourceId: 'conv-userW-1', agentToken: 'vsst_fork', name: 'fork-pending' };
    const keep = [...sessions]; sessions.clear(); sessions.set('w-fork', fork); for (const [kk, v] of keep) sessions.set(kk, v); live.add('bk-f0f0f0f0');
    const rp = await call('/api/agent/browser/resolve', 'jbt_bbbb', { argv: ['open', 'https://bank.test/p'] });
    const hp = Object.entries(k._reg().children).find(([, c]) => c && c.job === 'jb-0000bbbb');
    ok(rp.status === 200 && hp && hp[1].parent === KA && !Object.values(k._reg().children).some((c) => c && c.parent === 'bk-f0f0f0f0'), 'verify r1: a PENDING FORK carrying the owner\'s id is NOT the owner — the job is judged as the owner (its handle under the owner\'s key, the owner\'s pin), nothing minted under the fork\'s key', { status: rp.status, code: rp.j && rp.j.code, parent: hp && hp[1].parent });
    k.releaseJob('jb-0000bbbb', 'leg cleanup'); sessions.delete('w-fork'); live.delete('bk-f0f0f0f0'); }
  const again = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['snapshot'] });
  ok(again.status === 200 && handleOf('jb-0000aaaa') === H && Object.values(k._reg().children).filter((c) => c.job === 'jb-0000aaaa').length === 1, 'a second verb reuses the job\'s handle (one handle per job)');
  for (const route of ['pin', 'use', 'new-child', 'detach', 'resume']) { const r = await call('/api/agent/browser/' + route, 'jbt_aaaa', { profile: pOther.id }); ok(r.status === 403 && r.j && r.j.code === 'job_token', `a job is refused /${route} by name (403 job_token)`, r); }
  { const st = await fetch(base + '/api/agent/browser/status', { headers: { Authorization: 'Bearer jbt_aaaa' } }); const j = await st.json(); ok(st.status === 200 && j.shared === false, 'a job may read its status', j); }
  // not_owner: the user narrows Bank to ANOTHER conversation — the owner is refused, and so is its job
  k._reg().profiles.find((x) => x.id === pBank.id).owner = { kind: 'only', who: [{ kind: 'session', id: KB }] };
  const r2 = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['snapshot'] });
  ok(r2.status === 403 && r2.j && r2.j.code === 'not_owner' && /Your tab in its browser was closed/.test(r2.j.error) && !leasesOf(H).length, 'the owner conversation may no longer use Bank ⇒ its JOB is refused not_owner (the same name, the same 403) and its tab closed with the refusal', r2);
  k._reg().profiles.find((x) => x.id === pBank.id).owner = { kind: 'instance' };
  // a job not running is refused; a job with no profile pinned is refused by name
  jobs.get('jb-0000bbbb').state = 'done';
  { const r = await call('/api/agent/browser/resolve', 'jbt_bbbb', { argv: ['snapshot'] }); ok(r.status === 409 && r.j && r.j.code === 'job_not_running', 'a finished job\'s token is refused job_not_running', r); }
  jobs.get('jb-0000bbbb').state = 'up';
  k.setPin(KA, null, { origin: 'chosen', by: 'user' });
  { const r = await call('/api/agent/browser/resolve', 'jbt_bbbb', { argv: ['snapshot'] }); ok(r.status === 409 && r.j && r.j.code === 'job_no_profile', 'no pin and no attachment of Bank in the owner\'s set (the owner\'s own lease aside) ⇒ the job is refused job_no_profile — or resolves the owner\'s default attachment', r); }
  k.setPin(KA, pBank.id, { origin: 'chosen', by: 'user' });
  { const r = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['snapshot'] }); ok(r.status === 200 && leasesOf(H).includes(pBank.id), 'Bank for all again: the job resolves again (a new lease under the same handle)', r); }
  // the OWNER conversation goes away: the running job keeps browsing
  sessions.clear(); live.delete(KA);
  k.reconcile({ graceMs: 0 });
  ok(leasesOf(H).includes(pBank.id) && !leasesOf(KA).length, 'the owner conversation is gone (its lease dropped) — the RUNNING job\'s lease is kept (a running job carries its handle)', { job: leasesOf(H), owner: leasesOf(KA) });
  const r3 = await call('/api/agent/browser/resolve', 'jbt_aaaa', { argv: ['snapshot'] });
  ok(r3.status === 200 && r3.j && r3.j.ok, '…and it still resolves (the owner\'s recorded key + its pin) — it keeps browsing until the job ends', r3);
  // the job's end: finalize releases (what onRunEnded calls), the evidence rule releases what a missed finalize left
  const winH = lw(H), tabsH = windowTabs(winH), tabsKA = windowTabs(winKA);
  jobs.get('jb-0000aaaa').state = 'done';
  const released = k.releaseJob('jb-0000aaaa', 'the job run ended');
  // accept-fixes-jobs F11 (the acceptance of 2.369.202: after `vibespace-job stop` the job's window stayed open in the shared profile)
  ok(tabsH.length > 0 && await until(() => !model.windows.has(winH)) && tabsH.every((t) => model.targets.get(t).state === 'closed') && tabsKA.length > 0 && tabsKA.every((t) => model.targets.get(t).state !== 'closed'), `F11: AT FINALIZE the job's WINDOW closes (window ${winH}: ${tabsH.length} tab(s) closed over CDP) — the owner's page in its own window is untouched; the window stayed open before`, { winH, tabsH, open: windowTabs(winH), tabsKA });
  ok(!Object.values(k._reg().leftTabs || {}).some((m) => m && m[H]), 'F11: no "left tab" is kept for the released job handle (a job never comes back for its page)', k._reg().leftTabs);
  ok(released.includes(H) && !leasesOf(H).length && !k._reg().children[H], 'AT FINALIZE the job\'s lease and handle are gone (its window closes with the lease)', { released, leases: leasesOf(H) });
  await call('/api/agent/browser/resolve', 'jbt_bbbb', { argv: ['snapshot'] });
  const H2 = handleOf('jb-0000bbbb');
  const winH2 = lw(H2), tabsH2 = windowTabs(winH2);
  jobs.get('jb-0000bbbb').state = 'failed';
  k.reconcile({ graceMs: 120000 });
  ok(tabsH2.length > 0 && await until(() => !model.windows.has(winH2)), `F11: THE SWEEP closes the window too (a job that ended without its finalize: window ${winH2}, ${tabsH2.length} tab(s))`, { winH2, open: windowTabs(winH2) });
  ok(H2 && !k._reg().children[H2] && !leasesOf(H2).length, 'THE SWEEP: a job that ended without its finalize hook is released at the next reconcile (evidence: not running)', { H2, children: Object.keys(k._reg().children) });
  ok(jl.some((x) => /job jb-0000aaaa uses the conversation's browser as bk-00000a01\.\d+/.test(x)) && jl.some((x) => /job handle released \(the job run ended\)/.test(x)), 'the journal names the job by its ID at the mint and the release (never its name)', jl.filter((x) => /job/.test(x)));
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
  ok(!/write_path_refused/.test(inWd.log) && /127\.0\.0\.1:9|ECONNREFUSED|fetch failed|unreachable|not answer/i.test(inWd.log), 'F6: inside a job, `screenshot <the job\'s cwd>/shot.png` PASSES the write fence (it reaches the server call — refused write_path_refused before: a job had no VIBESPACE_SESSION_CWD)', inWd.log.slice(0, 600));
  const outside = await runJob('shot-outside', [process.execPath, CLI, 'screenshot', path.join(D, 'elsewhere.png')], WD);
  ok(/write_path_refused/.test(outside.log) && /the job's working directory \(/.test(outside.log) && !/session started before|session directory/.test(outside.log), 'F6: a path OUTSIDE the job\'s cwd is still refused — the words name "the job\'s working directory", never a session restart', outside.log.slice(0, 600));
  const noCwd = await runJob('shot-no-cwd', ['sh', '-c', `cd ${JSON.stringify(WD)} && exec ${JSON.stringify(process.execPath)} ${JSON.stringify(CLI)} screenshot ./x.png`]);
  ok(/write_path_refused/.test(noCwd.log) && /Background Work job's working directory is not known here/.test(noCwd.log) && !/session started before this VibeSpace version|once it is restarted/.test(noCwd.log), 'F6: a job with NO directory of its own (never the server\'s cwd, never the shell\'s `cd`) is refused in the JOB\'s words — never "your session is too old, restart it"', noCwd.log.slice(0, 600));
  // F11's engine seam: an exit 0, a crash (exit 3) and a stop each call onRunEnded once (server.js wires it to the keeper's releaseJob)
  const crash = await runJob('crash', ['sh', '-c', 'exit 3']);
  const st = jm.create({ kind: 'task', name: 'stopped', cmd: { argv: ['sh', '-c', 'sleep 30'] }, owner }, caller); const sj = jm.jobs.get(st.job.id);
  await until(() => sj.state === 'up' && sj.proc && sj.proc.pid); jm.stop(sj); await until(() => ['interrupted', 'failed'].includes(sj.state));
  const once = (id) => ended.filter((x) => x === id).length === 1;
  ok(once(inWd.j.id) && once(crash.j.id) && crash.j.state === 'failed' && once(sj.id) && sj.state === 'interrupted', 'F11: every run end — exit, crash (exit 3), stop (interrupted) — calls the release seam exactly once', { ended, crash: crash.j.state, stopped: sj.state });
  try { jm.shutdown(); } catch { }
}

// ── ⑤ wiring pins + the trace names the job by ID ──
console.log('— ⑤ the wiring: the CLI reads the job token, a run\'s end releases, the keeper knows which jobs run, the trace stores the job id');
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  ok(/const TOKEN = process\.env\.VIBESPACE_SESSION_TOKEN \|\| process\.env\.VIBESPACE_JOB_TOKEN;/.test(read('data/bin/vibespace-browser')), 'data/bin/vibespace-browser reads VIBESPACE_JOB_TOKEN when no session token (a job\'s process carries only that)');
  ok(/VIBESPACE_JOB_TOKEN: this\._jobToken\(job\)/.test(read('src/jobs.js')) && !/VIBESPACE_SESSION_TOKEN/.test(read('src/jobs.js')), '…which is what src/jobs.js puts in a job\'s env (and no session token)');
  ok(/_finalizeRun\(job, run, exit, why\) \{\n\s*run\.endedAt = exit\.endedAt \|\| now\(\);\n[^\n]*\n\s*try \{ this\.d\.onRunEnded\?\.\(job, run\); \} catch \{ \}/.test(read('src/jobs.js')), 'the run\'s finalize calls onRunEnded FIRST (before any state branch — every run end releases)');
  ok(/onRunEnded: \(job, run\) => onRunEnded\(job, run\)/.test(read('src/server/jobs-wiring.js')) && /onRunEnded: \(job\) => \{ try \{ browserKeeper\?\.releaseJob\?\.\(job\.id, 'the job run ended'\); \} catch \{ \} \}/.test(read('server.js')), 'jobs-wiring forwards it and server.js releases the job\'s browser handle (keeper.releaseJob)');
  const mw = read('src/server/mounts-plugins-wiring.js');
  ok(/jobRunning: \(jobId\) => \{[^\n]*isRunningJob\(j\)/.test(mw) && /getJobs: \(\) => \(getJobs \? getJobs\(\) : null\),\n\s*bindingsLookup: \(cid\) =>/.test(mw) && /getJobs: \(\) => jobsWiring\.getJobs\(\)/.test(read('server.js')), 'the keeper asks the engine which jobs run; the routes get the engine + the owner\'s recorded key');
  const kp = read('src/server/browser-keeper.js');
  ok(/for \(const \{ handle \} of J\.jobChildrenToRelease\(reg\.children, jobRunning\)\) releaseJobHandle\(handle, 'its job is not running'\);\n\s*const live = liveKeys\(\);/.test(kp), 'the reconcile (boot + every tick) releases a job handle whose job is not running BEFORE the carrier rule');
  ok(/function liveKeys\(\) \{[\s\S]{0,200}sessionLiveKeys\(\)[\s\S]{0,200}J\.carriedJobHandles\(reg\.children, jobRunning\)/.test(kp), 'the keeper\'s live set = the live sessions\' keys + the handles RUNNING jobs carry');
  const rb = read('src/routes/browser.js');
  ok(/if \(token && token\.startsWith\('jbt_'\)\) return jobAgentFacts\(req, res, token\);/.test(rb) && /if \(f\.job\) return resolveForJob\(req, res, k, f\);/.test(rb), 'the routes admit jbt_ through ONE door (agentFacts → jobAgentFacts) and resolve a job through resolveForJob');
  ok(/if \(token && token\.startsWith\('jbt_'\)\) \{ const jf = jobFactsOf\(token, \{ mint: false \}\);/.test(rb), 'the BELT judges a job\'s answer with the job\'s own key and never mints one');
  const T = require(path.join(REPO, 'src/browser-trace.js'));
  const base = { id: 'e1', at: 1, sessionId: 's', browserKey: 'bk-0000aaaa.2', profileId: 'p', command: { action: 'click', params: {} }, position: null };
  ok(T.entryFor({ ...base, job: 'jb-0000aaaa' }).job === 'jb-0000aaaa' && !('job' in T.entryFor({ ...base, job: 'daily reconcile' })) && !('job' in T.entryFor({ ...base, job: 'jb-0000aaaa', holder: 'user' })) && !('job' in T.entryFor(base)), 'a trace entry stores the job by ID only (a name-shaped value is never stored; the user\'s own act never carries one)');
  ok(/job: typeof keeper\?\.jobOf === 'function' \? keeper\.jobOf\(tp\.browserKey\) : null \}\);/.test(read('src/server/browser-trace.js')), 'the recorder asks the keeper which job a handle is');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(/t\('Job: \{name\}'/.test(read('src/lib/browser-live-window.js')) && zh.includes('"Job: {name}":') && ja.includes('"Job: {name}":'), 'the strip names a job\'s window "Job: <name>" (zh + ja)');
  const bs = require(path.join(REPO, 'src/browser-stream.js'));
  if (typeof bs.browserListFor === 'function') {
    const rows = bs.browserListFor({ browserKey: 'bk-0000aaaa', leases: [], attachments: [], children: [{ handle: 'bk-0000aaaa.2', job: 'jb-0000aaaa', browser: { profileId: 'p-bank', state: 'ready', live: true, job: true } }, { handle: 'bk-0000aaaa.1', browser: null }], helperNames: { 'bk-0000aaaa.1': 'research' }, jobNames: { 'bk-0000aaaa.2': 'daily reconcile' } });
    const jr = (rows || []).find((r) => r.ref === 'bk-0000aaaa.2'), hr = (rows || []).find((r) => r.ref === 'bk-0000aaaa.1');
    ok(jr && jr.helper && jr.helper.job === true && jr.helper.name === 'daily reconcile' && jr.profileId === 'p-bank' && hr && hr.helper && !hr.helper.job && hr.helper.name === 'research', 'the strip model: the job\'s row is a helper row marked job with its live name and its profile; a helper stays a helper', rows);
  } else ok(false, 'browser-stream exports browserListFor');
}

ok(/const \{ addressableId \} = require\('\.\.\/claude-lock-capture\.js'\);\s*\n\s*if \(cid\) for \(const \[tid, t\] of \(ctx\.activeSessions \|\| new Map\(\)\)\) if \(t && addressableId\(t\) === cid\)/.test(fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8')), 'PIN (verify r1): jobFactsOf finds the owner\'s live session by addressableId — a pending fork\'s borrowed id is nobody\'s');
{ const jobsSrc = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8'), wrap = fs.readFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), 'utf8');
  const spawnEnv = (/env: jobEnv\(\{[^\n]*\}\),/.exec(jobsSrc) || [''])[0];
  ok(/if \(\/\^\(VIBESPACE_\|npm_\|CLAUDE_CODE_\)\/\.test\(k\)\) delete env\[k\];/.test(jobsSrc) && /VIBESPACE_JOB_TOKEN: this\._jobToken\(job\)/.test(spawnEnv) && !/VIBESPACE_SESSION_TOKEN/.test(spawnEnv) && /env: spec\.env \|\| process\.env/.test(wrap), 'PIN (verify r1 ④): a job\'s child env is jobEnv — every VIBESPACE_* of the server stripped, VIBESPACE_JOB_TOKEN set, NEVER a session token; the wrapper hands spec.env to the child unchanged'); }
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
  ok(src.includes(c.needle), `control "${c.what}": its needle is in the shipped source`);
  const mod = M.load('src/browser-job-principal.js', src.replace(c.needle, c.repl), c.what.replace(/\W+/g, '-').slice(0, 24));
  const r = red(mod);
  ok(c.reds.every((n) => r.includes(n)), `control "${c.what}": the named rows go RED on the weakened copy (${r.length} red)`, r);
}
for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(row.pass, row.name, row.detail);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
