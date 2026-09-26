#!/usr/bin/env node
// AGENT BROWSER P1 first half — THE REGISTRY, THE LEASE AND THE KEEPER
// (docs/design-agent-browser-v2.md §3.3–§3.5, §5.1, §8 steps 1–2; §9's
// `test-browser-pin` row). FAST tier: no real browser, no port claimed by name
// (the express app listens on 0), scratch dirs only, ~5 s.
//
// What it proves, in order:
//   ① the pin ladder as a PURE decision (explicit > conversation > Task-Group
//      > instance > none) with the ORIGIN each rung states, a FORK copying
//      the pin while MINTING a new key, and the two-site vocabulary: every
//      origin the ladder emits is in SPAWN_ORIGINS and the client mirror
//      labels it (an off-vocabulary string is the negative control);
//   ② the registry + lease model (§3.3/§3.4): the validator's named refusals,
//      ONE lease per (profile, conversation) with a resume re-carrying it,
//      `input` with one holder, child handles reaped by prefix, the boot
//      reconciliation rule (dropped at once at boot, after a grace at
//      runtime), the ceiling naming its holders, the keeper's verdicts;
//   ③ the REAL keeper over a FAKE `agent-browser` on PATH whose "daemon" is a
//      real `sleep`: attach → one browser per profile → detach → idle stop,
//      the ceiling, runaway stop + park + telemetry + notice, and ADOPTION
//      across a keeper "death" (the object is dropped without shutdown, a new
//      one boots on the same store): the orphaned lease is dropped BEFORE any
//      browser is kept alive, the leased browser is adopted by pid+starttime,
//      an unproven pid is recorded ended and NEVER signalled, a gone pid is
//      recorded ended;
//   ④ migration step 2 (§8): the machine's shared profile becomes the
//      "Shared (legacy)" record, idempotent, and any conversation may attach
//      to it (its own tab instead of a stolen one);
//   ⑤ the routes on an in-process express app (a non-local host refused by
//      name, every failure `{error, code}`, the UI answer never carries a CDP
//      url) and the shipped CLI (`use` prints no env and no CDP url, `close --all`
//      on an attachment closes only ITS session — never the namespace, whoever
//      else is attached (lane H verify r2 L6) — the wrapper form passes
//      `--pin-tab`, the no-token exit).
//
// The fake binary's shebang names the interpreter running THIS suite and its
// directory goes on PATH — a `#!/usr/bin/env node` fixture is a bet on where
// node lives (the r7 lesson). Every `sleep` the fake starts is killed on exit
// and on a signal; the suite owns its children's lifetime.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
const F = require('../src/browser-facts.js');
const K = require('../src/server/browser-keeper.js');
const LIMITS = require('../src/keeper-limits.js');
const RG = require('../src/runaway-guard.js');
const { SPAWN_ORIGINS } = require('../src/resume-continuity.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 8000, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(step); } return pred(); };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

// ── scratch world ──
const ROOT = scratch('browser-pin');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const NODE_DIR = path.dirname(process.execPath);
const PATH_ENV = `${BIN}:${NODE_DIR}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;

// The FAKE agent-browser: launch-free, JSON always (the CLI's own `--json`
// shapes, measured 0.32.0), a "daemon" that is a real detached `sleep` recorded
// per NAMESPACE. It logs every launch (profile dir + idle value) and every
// `close --all` (session + whether `--pin-tab` was passed) so the suite can
// assert what the keeper and the wrapper actually sent.
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const pinTab = process.argv.includes('--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s, session: process.env.AGENT_BROWSER_SESSION || null }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser (the real CLI would LAUNCH here)' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } fs.appendFileSync(path.join(st, 'closes.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, closed, pinTab, all: true }) + '\\n'); out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
// MEASURED on 0.38.1 (lane H verify r2 L6): a plain \`close\` under a lease's session closes THAT session only — the
// namespace's other daemons (the keeper's, whose Chrome every lease shares) keep running; \`close --all\` (above) is the
// namespace-wide close ({closed:2, sessions:[both]}) that stopped the profile's browser
// FAKE_CLOSE_HOLD (lane H verify r3): the close says it started, then waits for the suite's go — a takeover begins meanwhile
if (a === 'close') { const h = process.env.FAKE_CLOSE_HOLD; if (h) { fs.writeFileSync(h + '.started', '1'); for (let i = 0; i < 500 && !fs.existsSync(h); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); } fs.appendFileSync(path.join(st, 'closes.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, closed: 1, pinTab, all: false }) + '\\n'); out({ success: true, data: { closed: true } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });

const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const closes = () => { try { return fs.readFileSync(path.join(AB_STATE, 'closes.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const spawnedPids = new Set();
function reapAll() {
  for (const l of launches()) if (l.pid) spawnedPids.add(l.pid);
  for (const pid of spawnedPids) { try { process.kill(pid, 'SIGKILL'); } catch { } }
}
let srv = null;
function cleanup() {
  reapAll();
  try { srv?.close(); } catch { }
  fs.rmSync(ROOT, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b', KEY_C = 'bk-0000000c';

// ═══ ① the pin ladder, PURE ═══════════════════════════════════════════════
console.log('— ① the pin ladder (§3.2.5): five rungs, stated origins, the two-site vocabulary');
{
  const all = { explicit: 'bp-aaaaaaaa', conversation: 'bp-bbbbbbbb', taskGroup: 'bp-cccccccc', instanceDefault: 'bp-dddddddd' };
  const p1 = B.pinPick(all);
  ok(p1.value === 'bp-aaaaaaaa' && p1.origin === 'chosen', 'an explicit choice for THIS session wins every rung (origin chosen)');
  const p2 = B.pinPick({ ...all, explicit: '' });
  ok(p2.value === 'bp-bbbbbbbb' && p2.origin === 'conversation', 'then the conversation\'s own pin (origin conversation)');
  const p3 = B.pinPick({ ...all, explicit: '', conversation: '' });
  ok(p3.value === 'bp-cccccccc' && p3.origin === 'task-group', 'then the Task Group default (origin task-group)');
  const p4 = B.pinPick({ ...all, explicit: '', conversation: '', taskGroup: '' });
  ok(p4.value === 'bp-dddddddd' && p4.origin === 'instance', 'then the instance default (origin instance)');
  const p5 = B.pinPick({});
  ok(p5.value === '' && p5.origin === 'harness', 'nothing ⇒ ephemeral, origin harness (never a pinned value)');
  ok(B.pinPick({ explicit: 'bp-aaaaaaaa', taskGroup: 'bp-cccccccc' }).value === 'bp-aaaaaaaa', 'NEGATIVE CONTROL: a Task-Group default never beats a session\'s own choice');
  // pinForCreate: which prior applies to THIS create
  const r = B.pinForCreate({ prior: 'bp-11111111', forkParent: 'bp-22222222', instanceDefault: 'bp-dddddddd', resume: true });
  ok(r.value === 'bp-11111111' && r.origin === 'conversation', 'a RESUME restores the conversation\'s own pin');
  const f = B.pinForCreate({ prior: 'bp-11111111', forkParent: 'bp-22222222', instanceDefault: 'bp-dddddddd', fork: true });
  ok(f.value === 'bp-22222222' && f.origin === 'conversation', 'a FORK copies its PARENT\'s pin (D15), stated as the conversation rung');
  const n = B.pinForCreate({ prior: 'bp-11111111', forkParent: 'bp-22222222', instanceDefault: 'bp-dddddddd' });
  ok(n.value === 'bp-dddddddd' && n.origin === 'instance', 'a NEW session has no conversation rung — a stale prior is never consulted');
  // the fork copies the pin AND mints a new key (the key is an identity, the pin a preference)
  let minted = 0; const mint = () => `bk-${String(++minted).padStart(8, '0')}`;
  const k = B.browserKeyFor({ prior: KEY_A, fork: true, mint });
  ok(k.key !== KEY_A && k.origin === 'fork', `a fork MINTS a new browser key (${k.key}) while copying the pin`);
  ok(B.browserKeyFor({ prior: KEY_A, resume: true, mint }).key === KEY_A, 'while a resume keeps the conversation\'s key');
  // the two-site vocabulary
  const emitted = new Set([p1, p2, p3, p4, p5].map((x) => x.origin));
  ok([...emitted].every((o) => SPAWN_ORIGINS.includes(o)) && emitted.size === 5, `every origin the ladder emits is in SPAWN_ORIGINS (${[...emitted].join(', ')})`);
  ok(B.PIN_ORIGINS.every((o) => SPAWN_ORIGINS.includes(o)), 'PIN_ORIGINS ⊆ SPAWN_ORIGINS (one vocabulary, two tiers)');
  const { spawnValueOrigin } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  ok(B.PIN_ORIGINS.every((o) => spawnValueOrigin(o, 'x', 'x') === o), 'the client mirror (agent-meta.spawnValueOrigin) recognises every pin origin — incl. the fifth value task-group');
  ok(spawnValueOrigin('off-vocabulary', 'x', 'x') !== 'off-vocabulary', 'NEGATIVE CONTROL: an off-vocabulary string is NOT passed through as its own label');
  const sp = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
  ok(B.PIN_ORIGINS.every((o) => new RegExp(`['"]?${o.replace('-', '\\-')}['"]?:\\s*\\(\\)\\s*=>`).test(sp)), 'Session Properties labels every pin origin (ORIGIN_LABEL has a row per value)');
  for (const dict of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(fs.readFileSync(path.join(REPO, dict), 'utf8').includes("'Task-Group default'"), `${dict} carries the task-group label`);
  ok(B.pinApplyNotice({ liveBrowser: true }).includes('RELAUNCHES') && !B.pinApplyNotice({ liveBrowser: false }).includes('RELAUNCHES'), 'the mid-session pin says honestly when it applies (relaunch only when a browser is live)');
}

// ═══ ② the registry + lease model, PURE ══════════════════════════════════
console.log('— ② the registry record, the lease and the keeper\'s verdicts (§3.3–§3.5)');
{
  const v = B.validateProfileInput({ label: '  Work  ', proxy: 'http://user:secret@proxy.example:3128' });
  ok(v.ok && v.value.label === 'Work' && v.value.provider === 'chromium' && v.value.proxy === 'http://user:secret@proxy.example:3128', 'a valid create: label cleaned, chromium by default, the proxy kept whole server-side');
  ok(B.validateProfileInput({}).code === 'label_required', 'no label ⇒ label_required');
  ok(B.validateProfileInput({ label: 'work' }, { existing: [{ id: 'bp-00000001', label: 'Work' }] }).code === 'label_taken', 'a label is unique case-insensitively ⇒ label_taken');
  ok(B.validateProfileInput({ label: 'x', provider: 'nope' }).code === 'provider_unknown', 'an unknown provider is refused by name');
  ok(B.validateProfileInput({ label: 'x', provider: 'cloak' }).code === 'provider_unavailable', 'a known but unwired provider is refused with its reason (§7.1 capability law)');
  // P4 (§7.3 / D5 (b)): the ROW admits a paired machine for chromium/cdp — whether
  // the id names one is the keeper's question (test-browser-providers); a key-bearing
  // row is refused there by name (D34), and a non-machine id never reaches the keeper
  ok(B.validateProfileInput({ label: 'x', host: 'remote-1' }).ok === true && B.validateProfileInput({ label: 'x', host: 'remote-1' }).value.host === 'remote-1', 'a host is admitted by the chromium row (P4: the keeper judges whether it is paired)');
  ok(B.validateProfileInput({ label: 'x', host: 'remote-1', provider: 'cloak' }).code === 'provider_needs_local_key', 'a key-bearing provider on another machine is refused BY NAME (D34)');
  ok(B.validateProfileInput({ label: 'x', host: 'not a host!' }).code === 'unsupported-host', 'a host that is not a machine id is refused BY NAME');
  ok(B.validateProfileInput({ label: 'x', sharing: 'instance' }).code === 'sharing_refused', 'sharing:instance is refused until the mediating proxy ships (D6)');
  ok(B.validateProfileInput({ label: 'x', allowedDomains: ['example.com'] }).code === 'fence_refused', 'a domain fence on a persistent profile is refused (§6.3)');
  ok(B.validateProfileInput({ label: 'x', proxy: 'not a url' }).code === 'bad_proxy', 'a malformed proxy is refused');
  const rec = B.newProfileRecord({ id: 'bp-00000001', ...v.value, dir: '/tmp/x', owner: { kind: 'session', id: KEY_A }, now: 5 });
  ok(B.publicProfileView(rec).proxy === 'http://***@proxy.example:3128', 'the public view masks the proxy\'s secret half');
  ok(B.mintProfileId('deadbeef') === 'bp-deadbeef' && B.isProfileId('bp-deadbeef') && !B.isProfileId('bp-xyz'), 'profile ids are minted bp-<8 hex>');
  ok(!B.profileDirName('bp-00000001').includes('Work'), 'the label never reaches a path (the dir name is the id)');
  const profiles = [rec, { id: 'bp-00000002', label: 'Team', owner: { kind: 'instance', id: null } }, { id: 'bp-00000003', label: 'team', owner: { kind: 'task', id: 'tg-1' } }];
  ok(B.findProfile(profiles, 'bp-00000002').id === 'bp-00000002' && B.findProfile(profiles, 'work').id === 'bp-00000001', 'a profile resolves by id or by label (case-insensitive)');
  ok(Array.isArray(B.findProfile(profiles, 'TEAM').ambiguous), 'two profiles differing only in case are AMBIGUOUS by label');
  ok(B.mayAttach(profiles[1], { browserKey: KEY_B }).ok && B.mayAttach({ ...rec, legacy: true, owner: { kind: 'session', id: KEY_A } }, { browserKey: KEY_B }).ok, 'an instance-owned or legacy profile admits any conversation');
  ok(B.mayAttach(rec, { browserKey: KEY_A }).ok && B.mayAttach(rec, { browserKey: KEY_A + '.3' }).ok && B.mayAttach(rec, { browserKey: KEY_B }).code === 'not_owner', 'a session-owned profile admits its conversation (children included) and refuses another');
  ok(B.mayAttach(profiles[2], { browserKey: KEY_B, taskIds: ['tg-1'] }).ok && B.mayAttach(profiles[2], { browserKey: KEY_B, taskIds: [] }).code === 'not_owner', 'a task-owned profile admits the sessions bound to that Task Group');
  // the lease: ONE per (profile, conversation)
  let leases = [];
  const a1 = B.decideAttach({ profile: profiles[1], leases, browserKey: KEY_A, sessionId: 'sess-1', now: 10 });
  ok(a1.ok && a1.created && a1.lease.input === 'agent' && a1.lease.sessionId === 'sess-1' && a1.others === 0, 'first attach creates the lease with input held by the agent');
  leases = [a1.lease];
  const a2 = B.decideAttach({ profile: profiles[1], leases, browserKey: KEY_A, sessionId: 'sess-2', now: 20 });
  ok(a2.ok && !a2.created && a2.resumed && a2.lease.sessionId === 'sess-2' && a2.lease.since === 10, 'a resume (same conversation, new webui session) RE-CARRIES the lease in place — never a second one');
  const a3 = B.decideAttach({ profile: profiles[1], leases, browserKey: KEY_B, sessionId: 'sess-3', now: 30 });
  ok(a3.ok && a3.created && a3.others === 1, 'another conversation on the same profile gets its OWN lease and counts the other');
  leases.push(a3.lease);
  ok(B.decideAttach({ profile: profiles[1], leases, browserKey: 'nope', sessionId: 's' }).code === 'bad-request', 'a lease needs a browser key');
  const d = B.decideDetach({ leases, profileId: 'bp-00000002', browserKey: KEY_A });
  ok(d.ok && d.remaining.length === 1 && d.others === 1 && d.lease.browserKey === KEY_A, 'detach removes exactly that conversation\'s lease');
  ok(B.decideDetach({ leases: d.remaining, profileId: 'bp-00000002', browserKey: KEY_A }).code === 'no_lease', 'detaching twice ⇒ no_lease');
  leases.push({ profileId: 'bp-00000002', browserKey: KEY_A + '.1', sessionId: null, since: 40, input: 'agent' });
  ok(B.leasesOf(leases, KEY_A).length === 1 && B.leasesOf(leases, KEY_A, { children: true }).length === 2, 'a parent\'s set includes its children only when asked (§3.7 child handles)');
  ok(B.isChildKey(KEY_A + '.12') && B.parentKeyOf(KEY_A + '.12') === KEY_A && !B.isChildKey(KEY_A), 'a child handle is bk-<parent>.<n>');
  // reconciliation: boot drops at once, runtime after a grace
  const r0 = B.reconcileLeases({ leases, liveKeys: new Set([KEY_B]), now: 100, graceMs: 0 });
  ok(r0.kept.length === 1 && r0.dropped.length === 2 && r0.dropped.every((x) => /no live session carries/.test(x.why)), 'at BOOT (grace 0) every lease nobody carries is dropped at once, incl. the child of an absent parent');
  const r1 = B.reconcileLeases({ leases, liveKeys: new Set([KEY_B]), now: 100, graceMs: 1000 });
  ok(r1.kept.length === 3 && r1.stamped.length === 2 && r1.dropped.length === 0, 'at RUNTIME the loss is stamped first (a session restart must not cost a cold browser)');
  const r2 = B.reconcileLeases({ leases: r1.kept, liveKeys: new Set([KEY_B]), now: 1200, graceMs: 1000 });
  ok(r2.kept.length === 1 && r2.dropped.length === 2, '…and dropped once the grace has passed');
  const r3 = B.reconcileLeases({ leases: r1.kept, liveKeys: new Set([KEY_A, KEY_B]), now: 500, graceMs: 1000 });
  ok(r3.kept.every((l) => !l.carrierLostAt), 'a carrier that comes back un-stamps its lease');
  // the ceiling
  const running = [{ profileId: 'bp-00000001', label: 'Work', state: 'ready' }, { profileId: 'bp-00000002', label: 'Team', state: 'ready' }, { profileId: 'bp-00000009', state: 'stopped' }];
  const cap = B.ceilingVerdict(running, leases, { CONCURRENT_CAP: 2 });
  ok(cap && cap.code === 'cap' && cap.holders.length === 2 && /Work \(bp-00000001/.test(cap.error) && /Team \(bp-00000002, leased by/.test(cap.error), 'at the ceiling the refusal NAMES the holders and who leases them');
  ok(B.ceilingVerdict(running, leases, { CONCURRENT_CAP: 3 }) === null, 'below the ceiling nothing is refused (stopped records do not count)');
  // idle / runaway / pid / adoption verdicts
  ok(B.browserIdle({ profileId: 'bp-00000002', startedAt: 0, lastLeaseDroppedAt: 100 }, [], 700, 500).expired && !B.browserIdle({ profileId: 'bp-00000002', startedAt: 0, lastLeaseDroppedAt: 100 }, leases, 700, 500).expired, 'a browser is idle only with NO lease, from its last drop');
  ok(!B.browserIdle({ profileId: 'bp-00000002', startedAt: 0 }, [], 10 ** 9, 0).expired, 'idleMs 0 = never');
  // the per-provider numbers + the resource verdict live in src/runaway-guard.js since 2026-09-25 (test-runaway-guard
  // owns the verdict); here: chromium's numbers are the browser floor, and browser-profiles carries no park any more
  const guard = RG.providerGuard('chromium', LIMITS);
  ok(guard.GUARD_MEM_BYTES > LIMITS.GUARD_MEM_BYTES && guard.GUARD_CPU_PCT > LIMITS.GUARD_CPU_PCT && guard.GUARD_SAMPLE_MS === LIMITS.GUARD_SAMPLE_MS, 'chromium\'s resource numbers are per-PROVIDER (higher floor), the cadence shared');
  ok(!('runawayVerdict' in B) && !('runawayParkVerdict' in B) && !('providerGuard' in B) && !('runawayParkedUntil' in B.normalizeRegistry({ runawayParkedUntil: { 'bp-00000001': 9e15 } })), 'browser-profiles carries NO verdict and NO park: an old file\'s park map is dropped on read');
  ok(B.pidVerdict({ alive: false }) === 'gone' && B.pidVerdict({ alive: true, sameStart: false }) === 'unproven' && B.pidVerdict({ alive: true, sameStart: true }) === 'ours', 'pid verdicts: gone / unproven / ours');
  ok(B.adoptVerdict({ state: 'ready', pid: 7 }, { verdict: 'ours', active: true }).state === 'ready' && B.adoptVerdict({ state: 'ready', pid: 7 }, { verdict: 'unproven', active: true }).state === 'stopped' && /never signalled/.test(B.adoptVerdict({ state: 'ready', pid: 7 }, { verdict: 'unproven' }).lastError) && B.adoptVerdict({ state: 'ready', pid: 7 }, { verdict: 'ours', active: false }).state === 'stopped' && B.adoptVerdict({ state: 'stopped' }, { verdict: 'ours', active: true }) === null, 'adoption: ready only for a proven pid whose namespace answers; unproven ⇒ ended and never signalled');
  // naive study 2 (2026-09-25): THE KEEPER IS THE ONLY LAUNCHER — an attached session reaches the keeper's browser over its
  // CDP url, never the profile DIRECTORY (measured on 0.38.1: a second session given the directory starts its own Chrome
  // there and dies on SingletonLock). This pin said `AGENT_BROWSER_PROFILE=/p/dir` — the shape that broke "bank".
  const env = B.attachedEnvFor({ browserKey: KEY_A, profileId: 'bp-00000002', profileDir: '/p/dir', cdpUrl: 'ws://127.0.0.1:9333/devtools/browser/k' });
  ok(env.includes(`AGENT_BROWSER_SESSION=vs-${KEY_A}`) && env.includes('AGENT_BROWSER_NAMESPACE=vs-bp-00000002') && env.includes('AGENT_BROWSER_CDP=ws://127.0.0.1:9333/devtools/browser/k') && !env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')) && env.includes('AGENT_BROWSER_IDLE_TIMEOUT_MS=0'), 'an attached session browses in the profile\'s namespace with its OWN context (the tab is the unit), over the keeper browser\'s CDP url — NEVER its directory — and the CLI timeout off (the keeper owns the clock)');
  ok(B.attachedEnvFor({ browserKey: KEY_A, profileId: 'bp-00000002', profileDir: '/p/dir' }) === null && B.attachedEnvFor({ browserKey: KEY_A, profileId: 'bp-00000002', profileDir: '/p/dir', cdpUrl: 'ws://10.0.0.5:9333/x' }) === null, 'no loopback CDP url ⇒ null (the keeper refuses `browser_no_cdp` by name) — never a directory fallback');
  const reg = B.normalizeRegistry({ profiles: [rec, { id: 'junk' }], leases: [{ profileId: 'bp-00000002', browserKey: 'zzz' }, a1.lease], browsers: { x: 1 }, pins: null, extra: 1 });
  ok(reg.profiles.length === 1 && reg.leases.length === 1 && reg.version === 1 && !('extra' in reg) && reg.pins && typeof reg.pins === 'object', 'normalizeRegistry keeps only well-formed rows and drops unknown keys');
}

// ═══ ③ the REAL keeper over the fake binary ═══════════════════════════════
console.log('— ③ the keeper (§3.5): attach/detach, one browser per profile, ceiling, idle, runaway, adoption across a "death"');
let skew = 0;
const now = () => Date.now() + skew;
const settings = { 'browser.idleTimeoutMs': 60000 };
const lines = [];
const log = { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push('WARN ' + a.join(' ')), error: (...a) => lines.push('ERROR ' + a.join(' ')) };
const bcast = [], notices = [], tel = [];
let noticeReaches = 1; // what server.js's serverNotice answers: the clients it reached (0 = nobody connected)
const keeperEnv = () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE });
const mkKeeper = (live, extra = {}) => K.create({
  dataDir: DATA, homeDir: HOME, env: keeperEnv, broadcast: (m) => bcast.push(m),
  serverSetting: (k) => settings[k], serverNotice: (k, t, o) => { notices.push({ k, t, o }); return noticeReaches; },
  getTelemetry: () => ({ record: (e) => tel.push(e) }), liveKeys: () => live,
  limits: { ...LIMITS, CONCURRENT_CAP: 2 }, log, now, tickMs: 3600e3, install: false, ...extra,
});
const reg = (k) => k._reg();
const alive = (pid) => F.pidAlive(pid);
let kA, workId, teamId, thirdId;
{
  const live = new Set([KEY_A, KEY_B]);
  kA = mkKeeper(live);
  await kA._facts.probeVersion();
  ok(kA._facts.lastVersion() === '0.38.0', 'the keeper probed the fake binary\'s version (0.38.0 ≥ the 0.37.1 floor ⇒ shared profiles ON)');
  const work = kA.createProfile({ label: 'Work' }, { owner: { kind: 'session', id: KEY_A } });
  workId = work.id;
  ok(B.isProfileId(work.id) && work.owner.kind === 'session' && work.owner.id === KEY_A && work.dir === path.join(HOME, '.agent-browser', 'vs-' + work.id), `createProfile mints ${work.id} owned by the conversation, dir under ~/.agent-browser/`);
  ok((fs.statSync(work.dir).mode & 0o777) === 0o700, 'the profile directory is 0700');
  ok((fs.statSync(kA.storeFile).mode & 0o777) === 0o600 && JSON.parse(fs.readFileSync(kA.storeFile, 'utf8')).profiles.length === 1, 'data/browser-profiles.json is written 0600 and carries the record');
  ok(bcast.length >= 1 && bcast[bcast.length - 1].type === 'browser-profiles-updated' && bcast[bcast.length - 1].profiles.length === 1, 'every commit broadcasts browser-profiles-updated with the digest (multi-client law)');
  const e = await threw(() => kA.createProfile({ label: 'work' }));
  ok(e && e.code === 'label_taken', 'a duplicate label is refused with the PURE validator\'s code');
  teamId = kA.createProfile({ label: 'Team' }, { owner: { kind: 'instance', id: null } }).id;
  thirdId = kA.createProfile({ label: 'Third' }, { owner: { kind: 'instance', id: null } }).id;

  // attach KEY_A → Work: reuse-or-spawn
  const at1 = await kA.attach({ profile: 'Work', browserKey: KEY_A, sessionId: 'sess-1' });
  ok(at1.created && at1.lease.browserKey === KEY_A && at1.lease.sessionId === 'sess-1' && at1.browser.state === 'ready', 'attach creates the lease and starts the profile\'s browser (state ready)');
  const l1 = launches();
  ok(l1.length === 1 && l1[0].ns === 'vs-' + workId && l1[0].profile === work.dir && l1[0].idle === '0', `the browser launched ONCE, under the profile\'s namespace, on the profile\'s dir, with the CLI timeout OFF (the keeper owns the idle clock)`);
  const recW = reg(kA).browsers[workId];
  ok(Number.isInteger(recW.pid) && alive(recW.pid) && recW.starttime != null && F.sameProcess(recW.pid, recW.starttime), 'the record carries the daemon\'s pid AND starttime, and the process is alive');
  ok(/^ws:\/\//.test(at1.cdpUrl) && at1.pinTab === true, 'the wrapper answer carries the CDP url and pinTab (floor satisfied)');
  ok(at1.env.includes(`AGENT_BROWSER_CDP=${recW.cdpUrl}`) && !at1.env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')) && at1.env.includes('AGENT_BROWSER_NAMESPACE=vs-' + workId), 'the session\'s env names the keeper browser\'s CDP url + the profile\'s namespace — never the directory (naive study 2: a second Chrome on it dies on SingletonLock)');
  ok(kA.list().browsers[workId].cdpUrl === undefined, 'the LIST view never carries a CDP url');
  const at2 = await kA.attach({ profile: workId, browserKey: KEY_A, sessionId: 'sess-2' });
  ok(!at2.created && at2.resumed && reg(kA).leases.filter((l) => l.profileId === workId).length === 1 && launches().length === 1, 'a resume re-carries the ONE lease (one holder) and launches nothing new');
  const e2 = await threw(() => kA.attach({ profile: 'Work', browserKey: KEY_B, sessionId: 'sess-9' }));
  ok(e2 && e2.code === 'not_owner', 'another conversation cannot attach to a session-owned profile');
  // two conversations on Team share ONE browser
  const t1 = await kA.attach({ profile: 'Team', browserKey: KEY_A, sessionId: 'sess-1' });
  const t2 = await kA.attach({ profile: 'Team', browserKey: KEY_B, sessionId: 'sess-3' });
  ok(t1.others === 0 && t2.others === 1 && launches().length === 2 && reg(kA).leases.filter((l) => l.profileId === teamId).length === 2, 'two conversations on one profile = two leases, ONE browser');
  ok(t2.env.includes(`AGENT_BROWSER_SESSION=vs-${KEY_B}`) && t2.env.includes('AGENT_BROWSER_NAMESPACE=vs-' + teamId), 'each keeps its OWN context inside the shared daemon');
  const st = kA.statusFor(KEY_A);
  ok(st.leases.length === 2 && st.leases.find((l) => l.profileId === teamId).others === 1 && st.leases.find((l) => l.profileId === workId).others === 0, 'statusFor names each lease with how many OTHER sessions share it');
  // the ceiling (cap 2)
  const e3 = await threw(() => kA.attach({ profile: 'Third', browserKey: KEY_B, sessionId: 'sess-3' }));
  ok(e3 && e3.code === 'cap' && e3.holders.length === 2 && /Work \(/.test(e3.message) && /Team \(/.test(e3.message) && new RegExp(KEY_B).test(e3.message), 'at the ceiling the third browser is refused, naming the holders and their sessions');
  ok(!reg(kA).leases.some((l) => l.profileId === thirdId) && launches().length === 2, '…and no lease, no launch');
  ok(kA.list().cap.used === 2 && kA.list().cap.cap === 2, 'the digest reports used/cap');
  // detach
  const d1 = kA.detach({ profile: 'Team', browserKey: KEY_A });
  ok(d1.others === 1 && reg(kA).browsers[teamId].lastLeaseDroppedAt == null, 'detach with another holder left: the browser stays leased');
  const d2 = kA.detach({ profileId: teamId, browserKey: KEY_B });
  ok(d2.others === 0 && reg(kA).browsers[teamId].lastLeaseDroppedAt > 0, 'the LAST detach stamps the idle clock');
  const e4 = await threw(() => kA.detach({ browserKey: KEY_B }));
  ok(e4 && e4.code === 'no_lease', 'detaching with no lease ⇒ no_lease');
  // idle stop
  const teamPid = reg(kA).browsers[teamId].pid;
  skew += 60001;
  await kA.tick();
  ok(await until(() => reg(kA).browsers[teamId].state === 'stopped'), 'past browser.idleTimeoutMs with no lease the keeper STOPS the browser');
  ok(await until(() => !alive(teamPid)) && /idle timeout/.test(reg(kA).browsers[teamId].lastError), 'the daemon is gone and the record says idle');
  ok(reg(kA).browsers[workId].state === 'ready' && alive(reg(kA).browsers[workId].pid), 'the still-leased browser is untouched');
  // the resource REPORT (2026-09-25, the owner's ruling: a browser a person or an agent is using is never stopped by a
  // resource guard — it is reported). An over-threshold sample leaves the browser RUNNING, files a notice when a
  // crossing begins (r2: re-armed only after REPORT_REARM_SAMPLES clear samples, never inside the per-session floor,
  // re-sent under the same key when nobody received it), parks nothing; a start is never refused by a past sample.
  const origTree = F.treeUsage;
  const overSample = (pid) => ({ cpuTicks: 0, memBytes: 4 * 1024 ** 3, memMetric: 'pss', rssBytes: 9 * 1024 ** 3, pids: [pid] });
  const normalSample = (pid) => ({ cpuTicks: 0, memBytes: 300 * 1024 ** 2, memMetric: 'pss', rssBytes: 900 * 1024 ** 2, pids: [pid] });
  const resourceNotices = () => notices.filter((n) => n.k.startsWith('browser-resource:' + workId + ':'));
  const workPid = reg(kA).browsers[workId].pid;
  const sampleTick = async (fn) => { F.treeUsage = async (pid) => fn(pid); skew += LIMITS.GUARD_SAMPLE_MS + 1; try { await kA.tick(); } finally { F.treeUsage = origTree; } };
  await sampleTick(overSample);
  await sleep(300);
  ok(reg(kA).browsers[workId].state === 'ready' && alive(workPid) && !/runaway/.test(reg(kA).browsers[workId].lastError || ''), 'NO KILL: a 4 GB (PSS) sample over chromium\'s 3 GB number leaves the browser RUNNING, its daemon alive, no runaway on the record');
  const u = kA.usageOf(workId);
  ok(u && u.memBytes === 4 * 1024 ** 3 && u.memMetric === 'pss' && /^memory \(PSS\) 4\.0 GB \(limit 3\.0 GB\)$/.test(u.over || '') && u.since > 0 && u.rssBytes === 9 * 1024 ** 3, 'the live row carries memBytes + memMetric, the report sentence (`over`, the metric named) and since when (rssBytes kept, deprecated)', u);
  ok(resourceNotices().length === 1 && resourceNotices()[0].t === 'The agent browser of profile "Work" is using 4.0 GB (PSS) — Stop it from the Browser panel if that is not what you expect', 'ONE server notice names the profile, the reading with its metric, and the user\'s own lever', resourceNotices());
  ok(tel.some((e) => e.name === 'browser-resource' && e.value === 4096) && !tel.some((e) => e.name === 'browser-runaway'), 'telemetry browser-resource (value = MB) — the fleet still sees a hot browser');
  ok(!('runawayParkedUntil' in reg(kA)) && !('runawayParkedUntil' in JSON.parse(fs.readFileSync(kA.storeFile, 'utf8'))), 'nothing is parked: no park map in memory or on disk');
  await sampleTick(overSample);
  ok(resourceNotices().length === 1, 'still over on the next sample ⇒ no second notice (a level, not a timer)');
  const st0 = await kA.start(workId);
  ok(st0 && st0.state === 'ready', 'a start is never refused by a past sample (there is no park)');
  await sampleTick(normalSample);
  ok(kA.usageOf(workId).over === null && kA.usageOf(workId).since === null && resourceNotices().length === 1, 'a normal sample clears the report (over null) and files nothing');
  await sampleTick(overSample);
  ok(resourceNotices().length === 1, 'HYSTERESIS: over again after ONE normal sample is the same crossing — no second notice (the oscillation storm, closed)', resourceNotices().map((n) => n.k));
  for (let i = 0; i < LIMITS.REPORT_REARM_SAMPLES; i++) await sampleTick(normalSample);
  await sampleTick(overSample);
  ok(resourceNotices().length === 1, 'FLOOR: re-armed by three clear samples, a crossing inside the hour after the last notice still waits');
  skew += LIMITS.REPORT_NOTICE_FLOOR_MS;
  await sampleTick(overSample);
  ok(resourceNotices().length === 2 && resourceNotices()[1].k === 'browser-resource:' + workId + ':2', '…and past the floor it files a second notice under its own key (the server dedupes keys per boot)', resourceNotices().map((n) => n.k));
  // DELIVERY: a crossing while nobody is connected (serverNotice → 0) is re-sent, under the SAME key, on the next
  // sample still over — the server latches a key only on delivery; once somebody got it, nothing more
  for (let i = 0; i < LIMITS.REPORT_REARM_SAMPLES; i++) await sampleTick(normalSample);
  skew += LIMITS.REPORT_NOTICE_FLOOR_MS;
  noticeReaches = 0;
  const telBefore = tel.filter((e) => e.name === 'browser-resource').length;
  await sampleTick(overSample); await sampleTick(overSample);
  noticeReaches = 1;
  await sampleTick(overSample); await sampleTick(overSample);
  const k3 = 'browser-resource:' + workId + ':3';
  ok(JSON.stringify(resourceNotices().slice(2).map((n) => n.k)) === JSON.stringify([k3, k3, k3]), 'DELIVERY: undelivered twice (nobody connected) ⇒ the SAME key re-sent on each over sample, then delivered once, then silence', resourceNotices().map((n) => n.k));
  ok(tel.filter((e) => e.name === 'browser-resource').length === telBefore + 1, '…and the re-sends are the notice only — one telemetry event per crossing');
  await sampleTick((pid) => ({ cpuTicks: 0, memBytes: 12 * 1024 ** 3, memMetric: 'rss', rssBytes: 12 * 1024 ** 3, pids: [pid] }));
  await sampleTick(normalSample);
  ok(reg(kA).browsers[workId].state === 'ready' && alive(workPid) && lines.filter((l) => /memory is not judged for this session/.test(l)).length === 1, 'a summed-RSS-only sample (12 GB) is not judged on memory — said ONCE in the journal — and the browser runs on');
  const at3 = await kA.attach({ profile: 'Work', browserKey: KEY_A, sessionId: 'sess-2' });
  ok(!at3.created && at3.browser.state === 'ready' && at3.browser.pid === workPid && launches().length === 2, 'the lease and the browser survived every report; re-attaching reuses the SAME daemon (no relaunch)');
  await kA.attach({ profile: 'Team', browserKey: KEY_B, sessionId: 'sess-3' });
  ok(launches().length === 3 && reg(kA).browsers[teamId].state === 'ready', 'Team is back up for KEY_B');
  ok(lines.some((l) => /dropped the lease|attached to/.test(l)), 'the keeper journals in words');
}

// "SIGKILL": keeper A is dropped without shutdown; keeper B boots on the same store
// NEGATIVE CONTROL (2026-09-25): a copy of the keeper that STOPS the browser on `over` (the pre-ruling policy) must
// FAIL the no-kill assertion above — else that assertion proves nothing about the report-only branch
console.log('— ③a control: a keeper copy that stops on `over` fails the NO KILL assertion');
const MUT = mutantCopies('browser-pin', REPO);
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const needle = '        if (lvl.fire) {';
  ok(src.split(needle).length === 2, 'CONTROL setup: the report branch is found exactly once in the shipped keeper');
  const KM = MUT.load('src/server/browser-keeper.js', src.replace(needle, needle + " stop(rec.profileId, { why: 'resource' }).catch(() => { });"), 'stops-on-over');
  const DATA_C = path.join(ROOT, 'data-ctl'); fs.mkdirSync(DATA_C, { recursive: true });
  const kc = KM.create({ dataDir: DATA_C, homeDir: HOME, env: keeperEnv, broadcast: () => { }, serverSetting: (k) => settings[k], serverNotice: () => { }, getTelemetry: () => null, liveKeys: () => new Set([KEY_A]), limits: { ...LIMITS, CONCURRENT_CAP: 6 }, log: { log() { }, warn() { }, error() { } }, now, tickMs: 3600e3, install: false });
  await kc._facts.probeVersion();
  const pc = kc.createProfile({ label: 'Ctl' }, { owner: { kind: 'session', id: KEY_A } });
  await kc.attach({ profile: 'Ctl', browserKey: KEY_A, sessionId: 'sess-ctl' });
  const cpid = kc._reg().browsers[pc.id].pid;
  const origT = F.treeUsage;
  F.treeUsage = async (pid) => ({ cpuTicks: 0, memBytes: 4 * 1024 ** 3, memMetric: 'pss', rssBytes: 9 * 1024 ** 3, pids: [pid] });
  skew += LIMITS.GUARD_SAMPLE_MS + 1;
  try { await kc.tick(); } finally { F.treeUsage = origT; }
  await until(() => kc._reg().browsers[pc.id].state !== 'ready', 4000);
  const noKillHolds = kc._reg().browsers[pc.id].state === 'ready' && alive(cpid);
  ok(!noKillHolds, 'CONTROL: the stop-on-over copy ends the browser — the NO KILL assertion is RED against it (it judges the branch, not luck)');
  try { await kc.stop(pc.id); } catch { /* already stopped */ }
  kc.shutdown();
  for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 1, label: '③a ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

console.log('— ③b adoption across a keeper death (§3.5 boot order: drop → judge → tick)');
{
  const before = JSON.parse(fs.readFileSync(path.join(DATA, K.STORE_FILE), 'utf8'));
  ok(before.leases.length === 2 && Object.values(before.browsers).filter((b) => b.state === 'ready').length === 2, 'on disk: two leases (KEY_A on Work, KEY_B on Team), two ready browsers');
  const workPid = before.browsers[workId].pid, teamPid = before.browsers[teamId].pid;
  ok(alive(workPid) && alive(teamPid), 'both daemons are alive with nobody keeping them (the keeper is "dead")');
  lines.length = 0;
  const kB = mkKeeper(new Set([KEY_A])); // KEY_B did not survive the "restart"
  const r = await kB.boot();
  ok(r.droppedLeases === 1 && r.browsers === 2, `boot: ${r.droppedLeases} orphaned lease dropped, ${r.browsers} browsers adopted`);
  ok(reg(kB).leases.length === 1 && reg(kB).leases[0].browserKey === KEY_A, 'the lease nobody carries is gone; the carried one stays');
  const iDrop = lines.findIndex((l) => l.includes(`dropped the lease of ${KEY_B}`)), iAdopt = lines.findIndex((l) => l.includes('adopted'));
  ok(iDrop >= 0 && iAdopt > iDrop, 'the orphan is dropped BEFORE any browser is kept alive (log order)');
  ok(reg(kB).browsers[workId].state === 'ready' && reg(kB).browsers[workId].adoptedAt > 0 && reg(kB).browsers[workId].pid === workPid, 'the leased browser is ADOPTED by pid+starttime (same pid, ready, adoptedAt)');
  ok(reg(kB).browsers[teamId].state === 'ready' && reg(kB).browsers[teamId].lastLeaseDroppedAt > 0, 'the orphaned profile\'s browser is adopted too, on the ordinary idle clock');
  ok(kB.statusFor(KEY_A).leases.length === 1 && kB.statusFor(KEY_A).leases[0].browser.state === 'ready', 'the surviving conversation still holds its tab after the restart');
  skew += 60001;
  await kB.tick();
  ok(await until(() => reg(kB).browsers[teamId].state === 'stopped') && await until(() => !alive(teamPid)), 'the orphaned browser idles out; the leased one is kept');
  ok(reg(kB).browsers[workId].state === 'ready' && alive(workPid), 'Work is still up for KEY_A');
  // the tick notices a daemon that died behind our back
  process.kill(workPid, 'SIGKILL');
  await until(() => !alive(workPid));
  await kB.tick();
  ok(reg(kB).browsers[workId].state === 'stopped' && /daemon exited/.test(reg(kB).browsers[workId].lastError), 'a daemon that exits behind the keeper is recorded stopped by the tick');
  // stop() proper: the CLI's own close first, then a verified signal
  const at = await kB.attach({ profile: 'Work', browserKey: KEY_A, sessionId: 'sess-2' });
  const pid = reg(kB).browsers[workId].pid;
  const st = await kB.stop(workId);
  ok(st.state === 'stopped' && st.stoppedBy === 'user' && !st.lastError && closes().some((c) => c.ns === 'vs-' + workId) && await until(() => !alive(pid)), 'stop = the CLI\'s own close --all under that namespace, clean, daemon gone');
  ok(reg(kB).leases.length === 1, 'a stop keeps the lease (the browser restarts on the next attach)');
  const e = await threw(() => kB.removeProfile(workId));
  ok(e && e.code === 'leased', 'a leased profile cannot be removed');
  kB.detach({ profileId: workId, browserKey: KEY_A });
  const rm = kB.removeProfile(workId);
  ok(rm.removed === workId && fs.existsSync(rm.dir) && !reg(kB).profiles.some((p) => p.id === workId), 'removal drops the record and KEEPS the directory (deletion is a human act, D8)');
  // pins through the keeper
  const pin = kB.setPin(KEY_A, teamId, { origin: 'chosen' });
  ok(pin.profileId === teamId && pin.origin === 'chosen' && kB.pinFor(KEY_A).label === 'Team', 'setPin/pinFor record the conversation\'s pin with its origin');
  const pc = kB.pinForCreate({ priorKey: KEY_A, resume: true });
  ok(pc.profileId === teamId && pc.origin === 'conversation' && pc.dir === reg(kB).profiles.find((p) => p.id === teamId).dir, 'pinForCreate resolves a resume to the conversation\'s pin + dir');
  ok(kB.pinForCreate({ explicit: 'Third' }).profileId === thirdId && kB.pinForCreate({ explicit: 'Third' }).origin === 'chosen', 'an explicit label resolves through the registry');
  settings['browser.defaultProfile'] = 'Third';
  ok(kB.pinForCreate({}).profileId === thirdId && kB.pinForCreate({}).origin === 'instance', 'the instance default (setting) is the fourth rung');
  delete settings['browser.defaultProfile'];
  ok(kB.pinForCreate({}).profileId === '' && kB.pinForCreate({}).origin === 'harness', 'nothing ⇒ ephemeral');
  kB.setPin(KEY_B, thirdId, { origin: 'chosen' });
  kB.removeProfile(thirdId);
  ok(!kB.pinFor(KEY_B) && kB.pinForCreate({ priorKey: KEY_B, resume: true }).origin === 'harness', 'removing a profile drops the pins that named it');
  ok(kB.setPin(KEY_A, null) === null && !reg(kB).pins[KEY_A], 'setPin(null) unpins');
  kB.shutdown();
}

// unproven / gone pids on a THIRD store: never signalled
console.log('— ③c an unproven pid is never signalled; a gone pid is recorded ended');
{
  const DATA3 = path.join(ROOT, 'data3'); fs.mkdirSync(DATA3, { recursive: true });
  const stranger = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); stranger.unref(); spawnedPids.add(stranger.pid);
  await until(() => F.procStart(stranger.pid) != null);
  const goneChild = spawnSync('sleep', ['0']); // a pid that has exited
  const gonePid = goneChild.pid;
  const dirU = path.join(HOME, '.agent-browser', 'vs-bp-000000ee'), dirG = path.join(HOME, '.agent-browser', 'vs-bp-000000ff');
  fs.mkdirSync(dirU, { recursive: true }); fs.mkdirSync(dirG, { recursive: true });
  fs.writeFileSync(path.join(DATA3, K.STORE_FILE), JSON.stringify({
    version: 1,
    profiles: [B.newProfileRecord({ id: 'bp-000000ee', label: 'Unproven', dir: dirU, now: 1 }), B.newProfileRecord({ id: 'bp-000000ff', label: 'Gone', dir: dirG, now: 1 })],
    leases: [{ profileId: 'bp-000000ee', browserKey: KEY_C, sessionId: 's', since: 1, input: 'agent' }],
    browsers: {
      'bp-000000ee': { profileId: 'bp-000000ee', ns: 'vs-bp-000000ee', pid: stranger.pid, starttime: (F.procStart(stranger.pid) || 0) + 7, state: 'ready', startedAt: 1 },
      'bp-000000ff': { profileId: 'bp-000000ff', ns: 'vs-bp-000000ff', pid: gonePid, starttime: 123, state: 'ready', startedAt: 1 },
    }, pins: {}, runawayParkedUntil: {},
  }));
  const kC = mkKeeper(new Set([KEY_C]), { dataDir: DATA3 });
  const r = await kC.boot();
  ok(r.browsers === 0, 'neither record is adopted');
  const u = reg(kC).browsers['bp-000000ee'], g = reg(kC).browsers['bp-000000ff'];
  ok(u.state === 'stopped' && /not provably the recorded daemon/.test(u.lastError) && alive(stranger.pid), 'a live pid whose starttime differs is recorded ended and the process is LEFT ALONE (still alive)');
  ok(g.state === 'stopped' && /exited while VibeSpace was down/.test(g.lastError), 'a pid that is gone is recorded ended with the reason');
  ok(reg(kC).leases.length === 1, 'the carried lease survives — the next attach relaunches');
  const st = await kC.stop('bp-000000ee');
  ok(st.state === 'stopped' && alive(stranger.pid), 'stop() on an ended record signals nothing');
  process.kill(stranger.pid, 'SIGKILL');
  kC.shutdown();
}

// ═══ ④ migration step 2 ══════════════════════════════════════════════════
console.log('— ④ migration step 2 (§8): the shared profile becomes "Shared (legacy)", idempotent, attachable by anyone');
{
  const ROOT2 = path.join(ROOT, 'inst2'); const HOME2 = path.join(ROOT2, 'home');
  fs.mkdirSync(path.join(ROOT2, 'data'), { recursive: true });
  fs.mkdirSync(path.join(HOME2, '.claude', 'projects'), { recursive: true });
  fs.mkdirSync(path.join(HOME2, '.agent-browser', 'legacy-shared'), { recursive: true });
  fs.writeFileSync(path.join(HOME2, '.agent-browser', 'config.json'), JSON.stringify({ profile: 'legacy-shared', headed: true }));
  const { create } = require('../src/server/migrations.js');
  const m = create({ rootDir: ROOT2, homeDir: HOME2, serverNotice: () => { } });
  ok(m.MIGRATIONS.some((x) => x.id === '2026-09-adopt-legacy-browser-profile'), 'the migration is registered under a dated id');
  const res = m.runLocalMigrations();
  ok(res.find((x) => x.id === '2026-09-adopt-legacy-browser-profile')?.status === 'ran', 'it ran');
  const st = JSON.parse(fs.readFileSync(path.join(ROOT2, 'data', K.STORE_FILE), 'utf8'));
  const legacy = st.profiles.find((p) => p.legacy);
  ok(legacy && legacy.label === 'Shared (legacy)' && legacy.sharing === 'instance' && legacy.dir === path.join(HOME2, '.agent-browser', 'legacy-shared') && legacy.owner.kind === 'instance', 'the config\'s profile dir is the "Shared (legacy)" record — sharing instance, marked legacy, the directory untouched');
  ok(fs.readFileSync(path.join(HOME2, '.agent-browser', 'config.json'), 'utf8').includes('"headed":true'), 'the user\'s config file is read, never written (§8 step 4)');
  const res2 = m.runLocalMigrations();
  ok(res2.find((x) => x.id === '2026-09-adopt-legacy-browser-profile')?.status === 'already' && JSON.parse(fs.readFileSync(path.join(ROOT2, 'data', K.STORE_FILE), 'utf8')).profiles.length === 1, 'idempotent: the ledger skips it and the registry still holds ONE record');
  const k2 = mkKeeper(new Set([KEY_C]), { dataDir: path.join(ROOT2, 'data'), homeDir: HOME2 });
  ok(k2.adoptDirectory({ label: 'Shared (legacy)', dir: legacy.dir, legacy: true }).created === false, 'adoptDirectory is idempotent on the directory too');
  const at = await k2.attach({ profile: 'Shared (legacy)', browserKey: KEY_C, sessionId: 'sess-c' });
  ok(at.created && at.env.some((kv) => kv.startsWith('AGENT_BROWSER_CDP=ws://')) && !at.env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')), 'a conversation that asks for the legacy profile gets its OWN tab in it (a pinned tab over its browser\'s CDP url instead of a stolen one — never a second Chrome on its directory)');
  await k2.stop(legacy.id);
  k2.shutdown();
  // a machine with no shared profile adopts nothing
  const ROOT3 = path.join(ROOT, 'inst3'); const HOME3 = path.join(ROOT3, 'home');
  fs.mkdirSync(path.join(ROOT3, 'data'), { recursive: true }); fs.mkdirSync(path.join(HOME3, '.claude', 'projects'), { recursive: true });
  create({ rootDir: ROOT3, homeDir: HOME3, serverNotice: () => { } }).runLocalMigrations();
  ok(!fs.existsSync(path.join(ROOT3, 'data', K.STORE_FILE)), 'NEGATIVE CONTROL: no shared profile on the machine ⇒ no registry is minted');
}

// ═══ ⑤ the routes + the shipped CLI ═══════════════════════════════════════
console.log('— ⑤ the routes (in-process express) and the shipped vibespace-browser CLI (§5.1)');
{
  const express = require('express');
  const R = require('../src/routes/browser.js');
  const kR = mkKeeper(new Set([KEY_A, KEY_B]));
  // NO explicit probe here: the attach path must probe the floor itself (the
  // keeper's facts instance is the only one that answers for `pinTab`).
  ok(kR._facts.lastVersion() === undefined, 'a fresh keeper has never probed the installed version');
  const TOKEN_A = 'vsst_' + 'a'.repeat(24), TOKEN_N = 'vsst_' + 'n'.repeat(24);
  const active = new Map([
    ['sess-1', { agentToken: TOKEN_A, _browserKey: KEY_A }],
    ['sess-nokey', { agentToken: TOKEN_N, _browserKey: null }],
  ]);
  const app = express(); app.use(express.json());
  R.setup({ keeper: kR, activeSessions: active, browserEnv: () => null });
  app.use(R.router);
  srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p, body, headers = {}) => {
    const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch { }
    return { status: res.status, json };
  };
  const bearer = (t) => ({ Authorization: 'Bearer ' + t });
  let r = await j('GET', '/api/browser/profiles');
  ok(r.status === 200 && Array.isArray(r.json.profiles) && r.json.cap && 'floor' in r.json && r.json.floor === null, 'GET /api/browser/profiles: the digest (profiles/leases/browsers/cap/floor — the floor is null, not a guess, until something probed it)');
  r = await j('GET', '/api/browser/profiles?host=other-box');
  ok(r.status === 400 && r.json.code === 'unsupported-host' && /other-box/.test(r.json.error), 'a non-local host is refused BY NAME');
  r = await j('POST', '/api/browser/profiles', { label: 'Squad' });
  ok(r.status === 200 && r.json.profile.owner.kind === 'instance', 'POST creates an instance-owned profile');
  const teamId2 = r.json.profile.id;
  r = await j('POST', '/api/browser/profiles', { label: 'squad' });
  ok(r.status === 409 && r.json.code === 'label_taken' && r.json.error, 'every failure answers {error, code} with a status by code');
  r = await j('POST', '/api/browser/attach', { sessionId: 'sess-1', profile: 'Squad' });
  ok(r.status === 200 && r.json.lease.browserKey === KEY_A && !('cdpUrl' in r.json) && r.json.env.some((kv) => kv.startsWith('AGENT_BROWSER_NAMESPACE=vs-' + teamId2)), 'POST /attach: a live session\'s conversation leases the profile — the UI answer carries NO cdp url');
  ok(r.json.pinTab === true && kR._facts.lastVersion() === '0.38.0', 'the attach path probed the floor ITSELF, so pinTab is answered on the first attach (the wrapper form then passes --pin-tab)');
  r = await j('POST', '/api/browser/attach', { sessionId: 'sess-nokey', profile: 'Squad' });
  ok(r.status === 409 && r.json.code === 'bad-request', 'a session with no browser key cannot hold a profile (said, not silently)');
  r = await j('POST', '/api/browser/attach', { sessionId: 'sess-none', profile: 'Squad' });
  ok(r.status === 404 && r.json.code === 'not-found', 'an unknown session ⇒ 404');
  r = await j('GET', '/api/browser/session/sess-1');
  ok(r.status === 200 && r.json.leases.length === 1 && r.json.leases[0].label === 'Squad', 'GET /session/:id answers that session\'s leases');
  r = await j('POST', '/api/browser/pin', { sessionId: 'sess-1', profile: 'Squad' });
  ok(r.status === 200 && r.json.pin.origin === 'chosen' && /applies/.test(r.json.appliesFrom) && active.get('sess-1')._browserProfileId === teamId2 && active.get('sess-1')._browserPinOrigin === 'chosen', 'POST /pin records the conversation\'s pin, stamps the live session and says when it applies');
  r = await j('POST', '/api/browser/pin', { sessionId: 'sess-1', profile: null });
  ok(r.status === 200 && r.json.pin === null && active.get('sess-1')._browserProfileId === null, 'profile:null unpins');
  r = await j('DELETE', '/api/browser/profiles/' + teamId2);
  ok(r.status === 409 && r.json.code === 'leased', 'DELETE refuses a leased profile');
  r = await j('DELETE', '/api/browser/profiles/not-an-id');
  ok(r.status === 400, 'a malformed id is refused');
  // agent routes
  r = await j('GET', '/api/agent/browser/status');
  ok(r.status === 401 && r.json.code === 'unauthorized', 'the agent routes need a session token');
  r = await j('GET', '/api/agent/browser/status', undefined, bearer('vsst_' + 'z'.repeat(24)));
  ok(r.status === 401, 'an unknown token is refused');
  r = await j('GET', '/api/agent/browser/status', undefined, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.sessionId === 'sess-1' && r.json.leases.length === 1, 'GET /api/agent/browser/status resolves the token to its session');
  r = await j('POST', '/api/agent/browser/use', { profile: 'Squad' }, bearer(TOKEN_A));
  ok(r.status === 200 && !('cdpUrl' in r.json), 'POST /use (plain) never returns a CDP url (§5.1)');
  r = await j('POST', '/api/agent/browser/use', { profile: 'Squad', wrapper: true }, bearer(TOKEN_A));
  ok(r.status === 200 && /^ws:\/\//.test(r.json.cdpUrl), '…only the WRAPPER form asks for it explicitly');
  r = await j('POST', '/api/agent/browser/new', { label: 'Mine' }, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.profile.owner.kind === 'session' && r.json.profile.owner.id === KEY_A, 'POST /new creates a profile owned by THIS conversation');
  r = await j('GET', '/api/agent/browser/profiles', undefined, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.me.leases.length === 1 && r.json.profiles.some((p) => p.label === 'Mine') && r.json.profiles.some((p) => p.label === 'Squad'), 'GET /api/agent/browser/profiles = the digest + my status');

  // the shipped CLI
  const CLI = path.join(REPO, 'data/bin/vibespace-browser');
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: TOKEN_A };
  // ASYNC on purpose: the router the CLI calls lives in THIS process, and a
  // spawnSync would block the event loop that has to answer it (measured: a
  // plain http.get from the child hangs until the timeout under spawnSync).
  const cli = (args, env = cliEnv) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => resolve({
    status: err ? (typeof err.code === 'number' ? err.code : null) : 0, signal: (err && err.signal) || null, stdout: String(stdout || ''), stderr: String(stderr || ''),
  })));
  let c = await cli(['profiles'], { PATH: PATH_ENV, HOME });
  ok(c.status === 2 && /not inside a VibeSpace session/.test(c.stderr), 'no token ⇒ exit 2 with the reason');
  c = await cli(['profiles']);
  ok(c.status === 0 && /^\* Squad/m.test(c.stdout) && /^  Mine/m.test(c.stdout) && /\d\/2 browsers running/.test(c.stdout), '`profiles` lists every profile, marks mine with *, and says how many browsers run');
  c = await cli(['use', 'Squad', '--print']);
  ok(c.status === 1 && /\[not_offered\]/.test(c.stderr) && !/export /.test(c.stdout), '`use --print` is not offered (takeover C2): nothing to export');
  c = await cli(['use', 'Squad']);
  ok(c.status === 0 && !/export /.test(c.stdout) && /profile: Squad \(bp-/.test(c.stdout), '`use` attaches and names the profile it acted on (§3.8 layer ①) — no env, no subshell');
  ok(!/ws:\/\/|devtools|cdpUrl/i.test(c.stdout + c.stderr), '…and NEVER a CDP url (§5.1)');
  c = await cli(['use', 'nope']);
  ok(c.status === 1 && /\[not-found\]/.test(c.stderr), 'an unknown profile ⇒ exit 1 with the server\'s code');
  c = await cli(['status']);
  ok(c.status === 0 && /Squad \(bp-/.test(c.stdout) && /pin: none/.test(c.stdout), '`status` shows my lease and my pin');
  c = await cli(['pin', 'Squad']);
  ok(c.status === 0 && /pinned this conversation to Squad/.test(c.stdout), '`pin <profile>` pins the conversation');
  c = await cli(['status']);
  ok(/pin: Squad \(bp-.*origin: chosen/.test(c.stdout), '…which `status` now reports with its origin');
  c = await cli(['pin', '--none']);
  ok(c.status === 0 && /unpinned/.test(c.stdout), '`pin --none` unpins');
  c = await cli(['watch']);
  ok(c.status === 0 && /browser_paused/.test(c.stdout) && /Take over/.test(c.stdout) && !/not available yet/.test(c.stdout), '`watch` explains the user\'s live view, Take over and the typed browser_paused refusal (P3 — never "not available yet")');
  // LANE H VERIFY r2 L6: `close --all` under an ATTACHMENT closes MY session only — never the namespace. The binary's own
  // `close --all` closes every session of the namespace, and for a profile that is the keeper's daemon + the one Chrome
  // every lease shares (measured on 0.38.1: {closed:2, sessions:[s1,s2]}, the profile daemon dead). The CLI maps it to
  // its session's `close` (then drops its lease) — with another session attached AND alone.
  await kR.attach({ profile: 'Squad', browserKey: KEY_B, sessionId: 'sess-b' });
  const daemonPid = reg(kR).browsers[teamId2].pid;
  c = await cli(['--', 'close', '--all']);
  let last = closes()[closes().length - 1];
  ok(c.status === 0 && last && last.all === false && last.ns === 'vs-' + teamId2 && last.session === 'vs-' + KEY_A && last.pinTab === true && /\[close_all_scoped\]/.test(c.stderr) && /1 other session/.test(c.stderr), 'r2 L6: with another session attached, `-- close --all` runs MY session\'s close (the profile\'s namespace, my session, `--pin-tab`) — never the namespace-wide one — and says so', JSON.stringify({ last, se: c.stderr.slice(0, 300) }));
  ok(alive(daemonPid) && reg(kR).browsers[teamId2].state === 'ready' && reg(kR).leases.some((l) => l.browserKey === KEY_B && l.profileId === teamId2) && !reg(kR).leases.some((l) => l.browserKey === KEY_A && l.profileId === teamId2) && /lease dropped/.test(c.stderr), 'r2 L6: …the keeper\'s daemon still runs, the record is ready, the OTHER lease stands and only MY lease was dropped');
  kR.detach({ profileId: teamId2, browserKey: KEY_B });
  c = await cli(['use', 'Squad']);
  const closeAllAlone = async (cliPath) => { const c1 = await new Promise((resolve) => execFile(process.execPath, [cliPath, '--', 'close', '--all'], { env: cliEnv, encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }))); return { c1, last: closes()[closes().length - 1], daemonAlive: alive(reg(kR).browsers[teamId2].pid), state: reg(kR).browsers[teamId2].state, leaseLeft: reg(kR).leases.some((l) => l.browserKey === KEY_A && l.profileId === teamId2) }; };
  const alone = await closeAllAlone(CLI);
  ok(c.status === 0 && alone.c1.status === 0 && alone.last.all === false && alone.last.session === 'vs-' + KEY_A && alone.daemonAlive && alone.state === 'ready' && !alone.leaseLeft && /\[close_all_scoped\]/.test(alone.c1.stderr), 'r2 L6: the SINGLE holder\'s `-- close --all` leaves the keeper\'s daemon pid alive and the record ready (its session\'s close, then its lease dropped)', JSON.stringify({ last: alone.last, daemonAlive: alone.daemonAlive, state: alone.state }));
  // CONTROL (scripts/mutant-copy.mjs): the pre-fix CLI passes `--all` through — the namespace-wide close kills the profile's daemon
  {
    const M6 = mutantCopies('browser-pin-l6', REPO);
    const csrc = fs.readFileSync(CLI, 'utf8');
    const cmut = csrc.replace("  const argv = closeAllScoped ? framed.argv.filter((x) => x !== '--all') : [...framed.argv];", '  const argv = [...framed.argv];'); // the hand-over line since the 2.369.182 integration (lane L's in-frame argv)
    if (cmut !== csrc) {
      const cliCopy = M6.write('data/bin/vibespace-browser', cmut, 'close-all-namespace');
      c = await cli(['use', 'Squad']);
      const ctl = await closeAllAlone(cliCopy);
      ok(c.status === 0 && ctl.last.all === true && !ctl.daemonAlive, 'r2 L6 CONTROL: a CLI copy that passes `--all` through runs the namespace-wide close and the keeper\'s daemon is DEAD — the legs above can go red', JSON.stringify({ last: ctl.last, daemonAlive: ctl.daemonAlive }));
    } else ok(false, 'r2 L6 CONTROL: the argv line was not found in data/bin/vibespace-browser');
    for (const r of copiesCensus(M6.files, M6.dir, REPO, { minCopies: 1, label: 'r2 L6 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  }
  c = await cli(['detach']);
  ok(c.status === 1 && /\[no_lease\]/.test(c.stderr), '`detach` with no lease ⇒ no_lease');
  // LANE H VERIFY r3 (the verifier's code-read note): a takeover that BEGINS while the binary runs a `close` on an attachment
  // makes the post-close detach `browser_paused` — the CLI says the close ran and the lease was NOT dropped, with the code
  // and the way out, and exits non-zero (r2: the detach sat in a bare `try { … } catch {}`)
  {
    const hold = path.join(ROOT, 'close-hold');
    const heldClose = async (cliPath) => {
      for (const f of [hold, hold + '.started']) { try { fs.unlinkSync(f); } catch { } }
      const u = await cli(['use', 'Squad']);
      const pr = new Promise((resolve) => execFile(process.execPath, [cliPath, 'close'], { env: { ...cliEnv, FAKE_CLOSE_HOLD: hold }, encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
      for (let i = 0; i < 400 && !fs.existsSync(hold + '.started'); i++) await sleep(20);
      let took = null; try { took = kR.takeover({ browserKey: KEY_A, profileId: teamId2, viewerId: 'v-r3', sessionId: 'sess-1' }); } catch (e) { took = { error: e.code || e.message }; }
      fs.writeFileSync(hold, '1');
      const r = await pr;
      const leased = reg(kR).leases.some((l) => l.browserKey === KEY_A && l.profileId === teamId2);
      try { kR.handback({ browserKey: KEY_A, profileId: teamId2, viewerId: 'v-r3', cause: 'explicit' }); } catch { }
      const d = await cli(['detach']);
      return { ...r, use: u.status, took, leased, detachAfter: d.status };
    };
    const hc = await heldClose(CLI);
    ok(hc.use === 0 && hc.took && !hc.took.error && hc.status !== 0 && /\[browser_paused\]/.test(hc.stderr) && /your `close` ran, but your lease on "Squad" was NOT dropped/.test(hc.stderr) && /after they hand it back/.test(hc.stderr) && !/lease dropped/.test(hc.stderr) && hc.leased && hc.detachAfter === 0, `r3: a takeover begun DURING the binary's \`close\` — the post-close detach is refused browser_paused and the CLI says so (the close ran, the lease was NOT dropped, [browser_paused], exit ${hc.status}); the lease stands until the agent detaches after the handback (observed: exit ${hc.status}, last line "${hc.stderr.trim().split('\n').pop().slice(0, 200)}", lease ${hc.leased ? 'stands' : 'gone'})`);
    const M7 = mutantCopies('browser-pin-r3-detach', REPO);
    const csrc7 = fs.readFileSync(CLI, 'utf8');
    const R2LINE = "    if (rest[0] === 'close' && profileId && r.kind === 'attachment') { try { await call('POST', '/api/agent/browser/detach', { profile: profileId }); console.error(profileLine(r.profile, null, r.others, r.handle) + ' · lease dropped'); } catch { } }\n";
    const fixStart = csrc7.indexOf("    if (rest[0] === 'close' && profileId && r.kind === 'attachment') {\n");
    const fixEnd = fixStart < 0 ? -1 : csrc7.indexOf('\n    }\n', fixStart);
    if (fixStart >= 0 && fixEnd > fixStart) {
      const cmut7 = csrc7.slice(0, fixStart) + R2LINE + csrc7.slice(fixEnd + '\n    }\n'.length);
      const ctl7 = await heldClose(M7.write('data/bin/vibespace-browser', cmut7, 'r2-detach'));
      ok(!/was NOT dropped/.test(ctl7.stderr) && ctl7.leased, `r3 CONTROL: the r2 CLI (the detach in a bare try/catch) never says the lease was NOT dropped — it prints ${ctl7.status === 0 ? 'nothing (exit 0)' : 'only the server\'s refusal, exit ' + ctl7.status} while the lease stands: the leg above can go red (observed: exit ${ctl7.status}, last line "${ctl7.stderr.trim().split('\n').pop().slice(0, 200)}")`);
    } else ok(false, 'r3 CONTROL: the post-close detach block was not found in data/bin/vibespace-browser');
    for (const r of copiesCensus(M7.files, M7.dir, REPO, { minCopies: 1, label: 'r3 detach ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  }
  c = await cli(['new', 'Fresh', '--notes', 'hello']);
  ok(c.status === 0 && /created Fresh \(bp-/.test(c.stdout) && reg(kR).profiles.find((p) => p.label === 'Fresh').owner.id === KEY_A, '`new <label>` creates a profile owned by this conversation');
  await kR.stop(teamId2).catch(() => { });
  kR.shutdown();
  srv.close(); srv = null;
}

reapAll();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
