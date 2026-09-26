#!/usr/bin/env node
// AGENT BROWSER P4 first half — provider rows + capability gating, the
// §7.2.1 egress precondition as a RECORDED result, the cloakserve egress
// allowlist (opt-in), the remote `cdp` provider over tcpForward and the
// `browser-serve` device op under the THREE-TOUCH RULE
// (docs/design-agent-browser-v2.md §7.1–§7.3, §7.2.1, §3.6 row 3, D5/D34).
//
//   ① PURE (src/browser-profiles.js): the rows' cells, the two tables'
//      consistency, `providerControl`'s exact refusals (a disabled control
//      names its reason), `capabilityRefusal` per cell, the local-oracles
//      discipline over the egress proof (a `blocks` claim's cell IS false; a
//      measured record without its four runs FAILS), the create validator
//      with host/cdpPort, the cdp env pair, url re-pointing, the cloakserve
//      plan's typed refusals + docker argv, the egress verdict table.
//   ② SHARED (src/browser-serve.js): the op runner over a FAKE agent-browser
//      on PATH — the machine composes its own directory.
//   ③ DEVICE: a REAL agentd daemon answers `browser-serve` (capability in
//      the hello-ack, reply routed by op); an OLD daemon is never asked
//      (the gate throws before a single frame is sent).
//   ④ ORCH: the access layer forwards a paired machine's CDP port over a fake
//      tcpForward (bytes round-trip), the keeper records remote chromium /
//      remote cdp / local cdp browsers (never pid-signalled, stop closes the
//      forward, the tick leaves them alone, boot re-adopts them by asking).
//   ⑤ Routes + the shipped CLI: providers, create with host/cdpPort, the
//      refusals by name, `use` printing no env and no CDP url.
//   ⑥ The allowlisting egress proxy over real loopback sockets.
//
// No real browser, no vendor call, port 0 everywhere, scratch dirs only; the
// fake binary's shebang is THIS node (the r7 lesson) and every `sleep` it
// starts is reaped on exit and on a signal.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');
const S = require('../src/browser-serve.js');
const A = require('../src/server/browser-access.js');
const E = require('../src/server/egress-proxy.js');
const K = require('../src/server/browser-keeper.js');
const LIMITS = require('../src/keeper-limits.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── scratch world ──
const ROOT = scratch('browser-providers');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const REMOTE_HOME = path.join(ROOT, 'remote-home'); fs.mkdirSync(path.join(REMOTE_HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const NODE_DIR = path.dirname(process.execPath);
const PATH_ENV = `${BIN}:${NODE_DIR}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;
process.env.HOME = HOME;
process.env.FAKE_AB_STATE = AB_STATE;
process.env.VIBESPACE_AGENTD_ROOT = path.join(HOME, 'agentd-root');

// The FAKE agent-browser (the test-browser-pin fixture + a configurable cdp
// port so a "device" can serve the port its browser names).
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null, cdp: process.env.AGENT_BROWSER_CDP || null }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s, session: process.env.AGENT_BROWSER_SESSION || null }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:' + (process.env.FAKE_AB_CDP_PORT || '19222') + '/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } fs.appendFileSync(path.join(st, 'closes.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, closed }) + '\\n'); out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const closes = () => { try { return fs.readFileSync(path.join(AB_STATE, 'closes.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const servers = new Set();
let dmReal = null;
function cleanup() {
  for (const l of launches()) if (l.pid) { try { process.kill(l.pid, 'SIGKILL'); } catch { /* gone */ } }
  for (const s of servers) { try { s.close(); } catch { /* gone */ } }
  try { dmReal?.stop?.(); } catch { /* gone */ }
  fs.rmSync(ROOT, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

// ═══ ① PURE ════════════════════════════════════════════════════════════════
console.log('— ① the provider rows, their refusals, the egress record, the cdp pair, the cloakserve plan');
{
  const ids = B.providerIds();
  ok(ids.includes('chromium') && ids.includes('cloak') && ids.includes('cdp') && ids.includes('local-window') && ids.includes('cloud:browserbase') && ids.length === 4 + B.CLOUD_PROVIDERS.length, `every §7.1 row exists (${ids.join(', ')})`);
  const cells = ['tier', 'wired', 'label', 'keyScope', 'canSwitchTo', 'ownsDir', 'leaseKind', 'remote', 'starts', 'headed', 'binary'];
  ok(ids.every((id) => cells.every((c) => c in B.providerRow(id))), 'every row carries every capability cell (a row, not an if chain)');
  const cdp = B.providerRow('cdp'), lw = B.providerRow('local-window'), cloak = B.providerRow('cloak'), chromium = B.providerRow('chromium'), cloud = B.providerRow('cloud:kernel');
  ok(cdp.canSwitchTo === 'no' && cdp.ownsDir === false && cdp.leaseKind === 'tab' && cdp.keyScope === 'none' && cdp.starts === false && cdp.remote === 'tcp-forward' && cdp.tier === 1, '`cdp`: tier 1, no key, switch "no", owns no dir, starts nothing, reached over tcp-forward');
  ok(lw.canSwitchTo === 'no' && lw.ownsDir === false && lw.leaseKind === 'window-target' && lw.tier === 3 && lw.wired === true && lw.consent === 'window.realDesktopTargets' && lw.cdp === false, '`local-window`: the three "no"s (§7.6 rule 3), the window-target lease kind, WIRED since P10 behind its named consent setting, no CDP');
  ok(cloak.keyScope === 'local-only' && cloak.canSwitchTo === 'in-place' && cloak.ownsDir === true && cloak.tier === 2 && cloak.wired === false, '`cloak`: tier 2, local-only key, in-place switch, owns its dir — NOT wired (the §7.2.1 record says why)');
  ok(chromium.wired && chromium.remote === 'browser-serve' && chromium.keyScope === 'none' && chromium.ownsDir, '`chromium`: wired, runs on a paired machine through browser-serve');
  ok(cloud && cloud.cloud === 'kernel' && cloud.keyScope === 'local-only' && cloud.canSwitchTo === 'export-only' && cloud.ownsDir === false && cloud.wired && cloud.starts && B.providerRow('cloud:agentcore').wired === false && /unverified/.test(B.providerRow('cloud:agentcore').unwiredWhy), '`cloud:<name>`: a FAMILY of rows — local-only key, export-only switch, no dir; wired since the key half landed (P4 second half), except agentcore whose field set is unverified — unwired BY NAME');
  ok(B.providerRow('cloud:nope') === null && B.providerRow('nope') === null, 'an unknown provider / cloud name is not a row');
  // the exact refusal a disabled control shows
  const c1 = B.providerControl('nope');
  ok(!c1.ok && c1.code === 'provider_unknown' && /one of chromium/.test(c1.error), 'unknown ⇒ provider_unknown listing the rows');
  const c2 = B.providerControl('cloak');
  ok(!c2.ok && c2.code === 'provider_unavailable' && /binary_absent/.test(c2.error) && /nothing was downloaded/i.test(c2.error), 'cloak here ⇒ provider_unavailable NAMING the §7.2.1 refusal (binary_absent) and that nothing was downloaded');
  const c3 = B.providerControl('cloak', { host: 'dev-1' });
  ok(!c3.ok && c3.code === 'provider_needs_local_key' && /D34/.test(c3.error) && /dev-1/.test(c3.error), 'cloak on host != null ⇒ provider_needs_local_key (D34) — the structural refusal wins over the measurement state');
  ok(B.providerControl('cloud:browserbase', { host: 'dev-1' }).code === 'provider_needs_local_key', 'cloud:* on host != null ⇒ provider_needs_local_key too');
  const c4 = B.providerControl('local-window', { host: 'dev-1' });
  ok(!c4.ok && c4.code === 'provider_local_only', 'a row with no remote transport on a host ⇒ provider_local_only');
  ok(B.providerControl('chromium', { host: 'dev-1' }).ok && B.providerControl('cdp', { host: 'dev-1' }).ok && B.providerControl('').ok && B.providerControl(undefined).row === chromium, 'chromium/cdp are admitted on a host; empty/undefined = chromium');
  const r1 = B.capabilityRefusal('cdp', 'start');
  ok(r1 && r1.code === 'provider_lacks_capability' && r1.capability === 'start' && /somebody else/.test(r1.error), 'capabilityRefusal(cdp, start) names the cell\'s reason');
  ok(B.capabilityRefusal('chromium', 'start') === null && B.capabilityRefusal('cdp', 'switch').code === 'provider_lacks_capability' && B.capabilityRefusal('local-window', 'sweep').code === 'provider_lacks_capability' && B.capabilityRefusal('cloak', 'headed').code === 'provider_lacks_capability' && B.capabilityRefusal('chromium', 'headed') === null && B.capabilityRefusal('local-window', 'remote').code === 'provider_lacks_capability', 'a control the row HAS answers null; one it lacks is typed per cell (switch / sweep / headed / remote)');
  ok(B.capabilityRefusal('chromium', 'fly').code === 'bad-request' && B.capabilityRefusal('nope', 'start').code === 'provider_unknown', 'an unknown capability / provider is refused, never silently "has it"');
  const rows = B.providerRows({ host: 'dev-1' });
  const rc = rows.find((r) => r.id === 'cloak');
  ok(rows.length === ids.length && rc.control.code === 'provider_unavailable' && rc.onHost.code === 'provider_needs_local_key' && rc.onHost.host === 'dev-1' && rc.proof && rc.proof.refusal === 'binary_absent' && rows.find((r) => r.id === 'chromium').onHost.ok === true, 'providerRows carries the local verdict, the per-host verdict and the proof beside the row it explains');

  // the §7.2.1 record: the local-oracles discipline
  const P = B.CLOAK_EGRESS_PROOF;
  ok(['tool', 'date', 'version', 'runs'].every((k) => k in P) && P.status === 'refused' && P.refusal === 'binary_absent' && P.blocks === 'cloak.wired' && P.runs.length === 0 && /strace/.test(P.tool), 'the shipped record has the proof shape, is a REFUSAL by name (binary_absent) and blocks cloak.wired');
  ok(B.proofVerdict(P).ok, 'proofVerdict accepts it: the cell it blocks really IS false');
  const reEnabled = { ...B.PROVIDERS, cloak: { ...B.PROVIDERS.cloak, wired: true } };
  const v1 = B.proofVerdict(P, reEnabled);
  ok(!v1.ok && /re-enabled without re-measuring/.test(v1.error), 'a caps row re-enabled without re-measuring FAILS the discipline (the blocks claim would be a lie)');
  ok(!B.proofVerdict({ ...P, status: 'measured', version: 'x', runs: [] }).ok, 'a record that CLAIMS measured while carrying a blocks claim fails');
  const measured = { ...P, status: 'measured', version: 'cloakbrowser 0.5.10', blocks: undefined, runs: B.CLOAK_EGRESS_RUNS.map((what, i) => ({ what, inetConnects: i === 0 ? 12 : 0 })) };
  ok(B.proofVerdict(measured).ok, 'a measured record with all four runs (first launch expected to connect) passes');
  ok(!B.proofVerdict({ ...measured, runs: measured.runs.slice(0, 3) }).ok && /lacks the run/.test(B.proofVerdict({ ...measured, runs: measured.runs.slice(0, 3) }).error), 'a measured record missing the idle run FAILS (a record with no counts is not a record)');
  ok(!B.proofVerdict({ ...measured, runs: measured.runs.map((r) => ({ what: r.what })) }).ok, 'a run without an INET count fails');
  ok(!B.proofVerdict({ ...P, refusal: undefined }).ok && !B.proofVerdict({ ...P, blocks: 'nope.wired' }).ok && !B.proofVerdict({ ...P, runs: [{ what: 'x', inetConnects: 1 }] }).ok, 'a refusal without a name / naming an unknown row / carrying runs fails');
  ok(B.blockedCell('cloak', 'wired') === P && B.blockedCell('cdp', 'wired') === null, 'blockedCell finds the record that explains the false cell, and only that one');

  // the create validator with host / cdpPort
  const v = B.validateProfileInput({ label: 'Ext', provider: 'cdp', host: 'dev-1', cdpPort: '9222' });
  ok(v.ok && v.value.host === 'dev-1' && v.value.cdpPort === 9222 && v.value.ownsDir === false, 'a cdp profile on a paired machine: host + numeric cdpPort, owns no dir');
  ok(B.validateProfileInput({ label: 'Ext', provider: 'cdp' }).code === 'cdp_port_required', 'a cdp profile without a port is refused cdp_port_required');
  ok(B.validateProfileInput({ label: 'Ext', provider: 'cdp', cdpPort: 70000 }).code === 'cdp_port_required' && B.validateProfileInput({ label: 'Ext', provider: 'cdp', cdpPort: 0 }).code === 'cdp_port_required', 'an out-of-range port is refused');
  ok(B.validateProfileInput({ label: 'C', cdpPort: 9222 }).code === 'bad-request', 'cdpPort on a non-cdp provider is refused (never silently dropped)');
  ok(B.validateProfileInput({ label: 'C', provider: 'cloak' }).code === 'provider_unavailable' && B.validateProfileInput({ label: 'C', provider: 'cloak', host: 'dev-1' }).code === 'provider_needs_local_key' && B.validateProfileInput({ label: 'C', provider: 'local-window', host: 'dev-1' }).code === 'provider_local_only', 'the validator speaks the control\'s codes');
  const rec = B.newProfileRecord({ id: 'bp-0000000a', label: 'Ext', dir: null, provider: 'cdp', host: 'dev-1', cdpPort: 9222 });
  ok(rec.dir === null && rec.host === 'dev-1' && rec.cdpPort === 9222 && B.publicProfileView(rec).cdpPort === 9222, 'the record carries host + cdpPort and a null dir; the public view keeps both (a port is not a secret)');
  ok(B.newProfileRecord({ id: 'bp-0000000b', label: 'L', dir: '/x' }).host === null && B.newProfileRecord({ id: 'bp-0000000b', label: 'L', dir: '/x' }).cdpPort === null, 'a local chromium record: host null, cdpPort null');

  // the cdp env pair
  const e1 = B.attachedEnvFor({ browserKey: 'bk-0123abcd', profileId: 'bp-0123abcd', profileDir: '/p', cdpUrl: 'ws://127.0.0.1:4444/devtools/browser/x' });
  ok(e1.includes('AGENT_BROWSER_CDP=ws://127.0.0.1:4444/devtools/browser/x') && !e1.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')) && e1.includes('AGENT_BROWSER_NAMESPACE=vs-bp-0123abcd'), 'a reached browser: the env names the loopback CDP url and NO profile directory');
  const e2 = B.attachedEnvFor({ browserKey: 'bk-0123abcd', profileId: 'bp-0123abcd', profileDir: '/p', cdpUrl: 'ws://10.0.0.5:4444/x' });
  ok(e2 === null, 'a NON-loopback CDP url is never handed to a session (§6.1: only through the forward) — and no directory instead (naive study 2: the keeper is the only launcher; the caller refuses `browser_no_cdp`)');
  ok(B.forwardedCdpUrl('ws://127.0.0.1:9222/devtools/browser/abc', 5555) === 'ws://127.0.0.1:5555/devtools/browser/abc' && B.forwardedCdpUrl(9222, 5555) === 'http://127.0.0.1:5555' && B.forwardedCdpUrl('', 5555) === 'http://127.0.0.1:5555' && B.forwardedCdpUrl('ftp://x', 5555) === null && B.forwardedCdpUrl('9222', 0) === null, 'forwardedCdpUrl keeps scheme + path and re-points host:port; a bare port becomes an http endpoint');
  ok(B.cdpPortOf('ws://127.0.0.1:19222/devtools/browser/x') === 19222 && B.cdpPortOf('http://localhost:9222') === 9222 && B.cdpPortOf('ws://10.0.0.1:9222/') === null, 'cdpPortOf reads a LOOPBACK url\'s port only');

  // the cloakserve plan + the egress verdicts
  ok(B.cloakservePlan({}).code === 'cloak_opt_in_off' && B.cloakservePlan({ enabled: true }).code === 'egress_not_measured' && /binary_absent/.test(B.cloakservePlan({ enabled: true }).error), 'the plan refuses: opt-in off; then the unmeasured precondition BY NAME');
  ok(B.cloakservePlan({ enabled: true, proof: measured }).code === 'egress_allowlist_empty' && B.cloakservePlan({ enabled: true, proof: measured, allowlist: 'a.test' }).code === 'egress_proxy_missing', 'then an empty allowlist; then a proxy that is not listening');
  ok(B.cloakservePlan({ enabled: true, proof: { ...P, status: 'measured' } }).code === 'egress_proof_invalid', 'a malformed record refuses before anything else is considered');
  const plan = B.cloakservePlan({ enabled: true, proof: measured, allowlist: 'portal.example, .docs.example', proxyPort: 4321 });
  ok(plan.ok && plan.image === B.CLOAKSERVE_IMAGE && /:\d+\.\d+\.\d+$/.test(plan.image) && plan.egress.hosts.join() === 'portal.example,.docs.example' && plan.egress.proxy === 'http://host.docker.internal:4321', 'a full plan: the image is PINNED to a version, the egress hosts and the proxy named');
  const run = plan.docker[1];
  ok(plan.docker[0].join(' ') === 'network create --internal vs-cloak-egress' && run.includes('--internal') === false && run.includes('--network') && run[run.indexOf('--network') + 1] === 'vs-cloak-egress' && run.includes('-p') && run[run.indexOf('-p') + 1] === '127.0.0.1:9222:9222' && run.includes('HTTPS_PROXY=http://host.docker.internal:4321') && run[run.length - 1] === B.CLOAKSERVE_IMAGE, 'docker argv: an INTERNAL network, 9222 published on the hub\'s loopback only, the proxy as the only way out, the pinned image last');
  ok(!run.some((a) => /0\.0\.0\.0|--network host|--privileged/.test(a)), 'nothing in the argv publishes on all interfaces, joins the host network or is privileged');
  // (`bad host` would split on the space into two VALID labels — junk has to be junk)
  const L = B.parseEgressAllowlist('Portal.Example, .docs.example https://x.test/path, bad_host!, ,');
  ok(L.join() === 'portal.example,.docs.example,x.test', 'parseEgressAllowlist: lowercased, scheme/path stripped, junk dropped, deduped');
  const T = [
    ['portal.example', true], ['sub.portal.example', false], ['docs.example', true], ['a.docs.example', true], ['a.b.docs.example', true], ['xdocs.example', false],
    ['localhost', false], ['127.0.0.1', false], ['127.9.9.9', false], ['::1', false], ['169.254.1.1', false], ['host.docker.internal', false], ['x.localhost', false], ['', false],
  ];
  ok(T.every(([h, want]) => B.egressVerdict(h, L).allow === want), 'the egress verdict table: exact / dotted-suffix admit, loopback + link-local NEVER, everything else refused', JSON.stringify(T.map(([h]) => [h, B.egressVerdict(h, L).allow])));
  ok(!B.egressVerdict('portal.example', '').allow && /empty/.test(B.egressVerdict('portal.example', '').why) && /loopback/.test(B.egressVerdict('localhost', L).why) && /not in the egress allowlist/.test(B.egressVerdict('evil.test', L).why), 'every refusal carries its sentence (empty list / loopback / not listed)');
}

// ═══ ② SHARED: the op runner over the fake binary ═══════════════════════════
console.log('— ② the browser-serve runner (SHARED): the machine composes its own directory');
const localEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE };
{
  const bs = S.install({ env: localEnv, homeDir: HOME });
  const v = await S.runBrowserServeOp(bs, 'version');
  ok(v.ok && v.version === '0.38.0' && v.floor && v.floor.sharedProfiles === true, `version op probes the binary (${v.version}) and answers the floor verdict`);
  const bad = await S.runBrowserServeOp(bs, 'start', { profileId: '../../etc' });
  ok(!bad.ok && bad.code === 'bad-request' && /profile id/.test(bad.error), 'a profileId that is not bp-<8 hex> is refused — the hub cannot point a machine at an arbitrary directory');
  ok((await S.runBrowserServeOp(bs, 'bogus', {})).code === 'bad-request', 'an unknown op is refused by name');
  const id = 'bp-0a0a0a0a';
  const st0 = await S.runBrowserServeOp(bs, 'status', { profileId: id });
  ok(st0.ok && st0.active === false && st0.exists === false && st0.dir === path.join(HOME, '.agent-browser', 'vs-' + id), 'status before start: inactive, the directory named but not yet made');
  const s1 = await S.runBrowserServeOp(bs, 'start', { profileId: id, idleMs: 0 });
  ok(s1.ok && s1.active && Number.isInteger(s1.pid) && s1.starttime != null && s1.cdpUrl === `ws://127.0.0.1:19222/devtools/browser/fake-vs-${id}` && s1.cdpPort === 19222 && s1.dir === st0.dir, `start: pid ${s1.pid} + starttime, the machine's own loopback cdp url + its port, the dir it composed`);
  ok((fs.statSync(s1.dir).mode & 0o777) === 0o700 && launches().some((l) => l.ns === 'vs-' + id && l.profile === s1.dir && l.idle === '0'), 'the directory is 0700 and the launch used it with the CLI timeout OFF');
  const s2 = await S.runBrowserServeOp(bs, 'start', { profileId: id });
  ok(s2.ok && s2.pid === s1.pid && launches().filter((l) => l.ns === 'vs-' + id).length === 1, 'a second start reuses the live daemon (one launch)');
  const cu = await S.runBrowserServeOp(bs, 'cdp-url', { profileId: id });
  ok(cu.ok && cu.port === 19222 && cu.url === s1.cdpUrl, 'cdp-url answers the same url + port');
  const st1 = await S.runBrowserServeOp(bs, 'status', { profileId: id });
  ok(st1.ok && st1.active && st1.pid === s1.pid && st1.starttime === s1.starttime, 'status after start: active with the same identity');
  const sp = await S.runBrowserServeOp(bs, 'stop', { profileId: id });
  ok(sp.ok && sp.closed === 1 && sp.left === null && closes().some((c) => c.ns === 'vs-' + id), 'stop: the CLI\'s own close --all, the daemon gone within the grace');
  ok((await S.runBrowserServeOp(bs, 'status', { profileId: id })).active === false && (await S.runBrowserServeOp(bs, 'cdp-url', { profileId: id })).code === 'no_cdp', 'after stop: inactive, no cdp url (typed)');
}

// ═══ ③ DEVICE: a REAL daemon, the capability gate ══════════════════════════
console.log('— ③ a real agentd answers browser-serve; an old daemon is never asked');
{
  const { DeviceManager } = require('../src/agentd/client.js');
  const dataDir = path.join(ROOT, 'dm-data'); fs.mkdirSync(dataDir, { recursive: true });
  dmReal = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  const conn = await dmReal.connect();
  ok(conn.info?.capabilities?.includes?.('browser-serve'), 'the daemon advertises the browser-serve capability in its hello-ack');
  const v = await dmReal.browserServe('version');
  ok(v.ok && v.version === '0.38.0', `the op answers over the mux (version ${v.version}) — reply routed by its own op`);
  const id = 'bp-0b0b0b0b';
  const s1 = await dmReal.browserServe('start', { profileId: id });
  ok(s1.ok && s1.active && Number.isInteger(s1.pid) && s1.cdpPort === 19222 && s1.dir === path.join(HOME, '.agent-browser', 'vs-' + id), `start through the daemon: pid ${s1.pid}, the daemon composed the dir under ITS home`);
  const st = await dmReal.browserServe('status', { profileId: id });
  ok(st.ok && st.active && st.pid === s1.pid, 'status through the daemon agrees');
  const cu = await dmReal.browserServe('cdp-url', { profileId: id });
  ok(cu.ok && cu.port === 19222, 'cdp-url through the daemon');
  const sp = await dmReal.browserServe('stop', { profileId: id });
  ok(sp.ok && sp.closed === 1, 'stop through the daemon');
  // the op never throws across the wire (the daemon relays the runner's own
  // {ok:false, code, error}); the ACCESS layer is where it becomes a coded throw (④)
  const bad = await dmReal.browserServe('start', { profileId: 'nope' });
  ok(bad && bad.ok === false && bad.code === 'bad-request' && /profile id/.test(bad.error), 'a machine-side refusal arrives as the machine\'s own {ok:false, code, error} object — never a throw across the wire');
  // THE GATE: an OLD daemon (no capability) is never sent a frame
  const c2 = await dmReal.connect();
  const saved = c2.info.capabilities;
  c2.info.capabilities = saved.filter((x) => x !== 'browser-serve');
  let sent = 0; const origControl = c2.mux.control.bind(c2.mux);
  c2.mux.control = (m) => { if (m && m.op === 'browser-serve') sent++; return origControl(m); };
  const g = await threw(() => dmReal.browserServe('version'));
  ok(g && /lacks browser-serve \(capabilities gate\)/.test(g.message) && g.code === 'host_needs_daemon' && sent === 0, 'an old daemon is refused by the capability gate BEFORE any frame is sent (unknown ops hang)');
  c2.info.capabilities = saved; c2.mux.control = origControl;
  ok((await dmReal.browserServe('version')).version === '0.38.0', 'with the capability back, the op answers again');
  // drift guards over the three touches
  const cli = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const daemon = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  const bundle = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-agentd.js'), 'utf8');
  ok(/m\.op === 'browser-serve-result'/.test(cli) && /daemon lacks browser-serve \(capabilities gate\)/.test(cli), 'client: the reply op is in the id-keyed routing set and the method is gated');
  ok(/capabilities: \[[^\]]*'browser-serve'[^\]]*\]/.test(daemon) && /msg\.op === 'browser-serve'/.test(daemon) && /op: 'browser-serve-result'/.test(daemon) && /^let bsFacts = null;/m.test(daemon), 'daemon: capability in the hello-ack, the handler, the reply op, ONE facts singleton per process');
  ok(/\/\/ src\/browser-serve\.js/.test(bundle), 'the daemon bundle carries src/browser-serve.js (the SHARED module, one implementation)');
  try { await dmReal.stop?.(); } catch { /* gone */ }
  dmReal = null;
}

// ═══ ④ ORCH: the access layer, the forward, the keeper's remote records ═════
console.log('— ④ the access layer + the keeper: remote chromium / remote cdp / local cdp');
// a fake "device loopback": the CDP endpoint a remote browser would serve
const cdpTarget = http.createServer((req, res) => {
  if (req.url === '/json/version') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Fake/1.0', 'User-Agent': 'fake' })); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('echo ' + req.url);
});
servers.add(cdpTarget);
const CDP_PORT = await new Promise((r) => cdpTarget.listen(0, '127.0.0.1', () => r(cdpTarget.address().port)));
const remoteEnv = { PATH: PATH_ENV, HOME: REMOTE_HOME, FAKE_AB_STATE: AB_STATE, FAKE_AB_CDP_PORT: String(CDP_PORT) };
const bsRemote = S.install({ env: remoteEnv, homeDir: REMOTE_HOME });
let forwardOpens = 0;
const fakeDm = {
  browserServe: (action, params) => S.runBrowserServeOp(bsRemote, action, params),
  tcpForward: async (port) => {
    forwardOpens++;
    const up = net.connect({ host: '127.0.0.1', port });
    const handle = { onData: null, onClose: null, write: (b) => { try { up.write(b); } catch { /* gone */ } }, close: () => { try { up.destroy(); } catch { /* gone */ } } };
    await new Promise((resolve, reject) => { up.once('connect', resolve); up.once('error', reject); });
    up.on('data', (b) => handle.onData?.(b)); up.on('close', () => handle.onClose?.()); up.on('error', () => handle.onClose?.());
    return handle;
  },
};
const oldDm = { tcpForward: fakeDm.tcpForward }; // a daemon that predates browser-serve
const fakeHosts = {
  isLocal: (id) => !id || id === 'local',
  get: (id) => { if (id === 'dev-1' || id === 'dev-old' || id === 'dev-down') return { id }; throw new Error('host not found'); },
  deviceBounded: async (id) => { if (id === 'dev-1') return fakeDm; if (id === 'dev-old') return oldDm; throw new Error('device link not responding'); },
};
const access = A.create({ hosts: fakeHosts, env: () => localEnv, homeDir: HOME, install: false, log: { log: () => { }, warn: () => { } } });
const getJson = (url) => new Promise((resolve) => { const req = http.get(url, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { j = null; } resolve({ status: res.statusCode, body: b, json: j }); }); }); req.on('error', (e) => resolve({ status: 0, error: e.message })); });
{
  ok(access.hostKnown('dev-1') && access.hostKnown('') && access.hostKnown('local') && !access.hostKnown('nope'), 'hostKnown: paired machines + this one; an unknown id is not known');
  const f1 = await access.forwardCdp('dev-1', CDP_PORT);
  ok(f1.localPort !== CDP_PORT && f1.url === `http://127.0.0.1:${f1.localPort}`, `a paired machine's port ${CDP_PORT} becomes a hub-side loopback port ${f1.localPort}`);
  const r = await getJson(f1.url + '/json/version');
  ok(r.status === 200 && r.json && r.json.Browser === 'Fake/1.0' && forwardOpens === 1, 'bytes round-trip through tcpForward (the device was asked once per connection)');
  const f2 = await access.forwardCdp('dev-1', CDP_PORT, { remoteUrl: `ws://127.0.0.1:${CDP_PORT}/devtools/browser/abc` });
  ok(f2.localPort === f1.localPort && f2.url === `ws://127.0.0.1:${f1.localPort}/devtools/browser/abc`, 'idempotent per (host, port); a ws url keeps its scheme + path');
  ok(access.forwards().length === 1 && access.forwards()[0].hostId === 'dev-1' && access.forwards()[0].refs === 2 && f2.close() === false && access.forwards().length === 1 && (await getJson(f1.url + '/json/version')).status === 200, 'two holders of one (host, port) share ONE listener (refs 2); releasing one keeps it up for the other');
  ok(f1.close() === true && access.forwards().length === 0 && (await getJson(f1.url + '/json/version')).status === 0, 'the last release tears the listener down (a connect afterwards fails)');
  const fl = await access.forwardCdp(null, CDP_PORT);
  ok(fl.local === true && fl.localPort === CDP_PORT && fl.url === `http://127.0.0.1:${CDP_PORT}` && access.forwards().length === 0, 'the LOCAL machine needs no forward: the port is already ours');
  ok((await threw(() => access.forwardCdp('nope', CDP_PORT))).code === 'unsupported-host' && (await threw(() => access.forwardCdp('dev-down', CDP_PORT))).code === 'host_unavailable' && (await threw(() => access.forwardCdp('dev-1', 0))).code === 'bad-request', 'forward refusals: unknown host / device down / bad port, each by name');
  const v = await access.call('dev-1', 'version');
  ok(v.ok && v.version === '0.38.0', 'call(dev-1, version) runs the SHARED runner at the far end');
  ok((await access.call(null, 'version')).version === '0.38.0' && (await access.call('local', 'version')).version === '0.38.0', 'call(null|local, …) runs it in-process — the same code, zero hops');
  ok((await threw(() => access.call('nope', 'version'))).code === 'unsupported-host' && (await threw(() => access.call('dev-1', 'bogus'))).code === 'bad-request' && (await threw(() => access.call('dev-old', 'version'))).code === 'host_needs_daemon' && (await threw(() => access.call('dev-down', 'version'))).code === 'host_unavailable', 'call refusals: unknown host / unknown op / a daemon without the op / device down');
  const e = await threw(() => access.call('dev-1', 'start', { profileId: 'nope' }));
  ok(e && e.code === 'bad-request' && /profile id/.test(e.message), 'a machine-side {ok:false} is thrown with ITS code and sentence (one shape for callers)');
  const unwired = A.access();
  ok((await threw(() => unwired.call('dev-1', 'version'))).code === 'host_unavailable' && unwired.hostKnown('dev-1') === false, 'an unwired process refuses LOUDLY, never a no-op');
}

// the keeper over the access layer
const lines = [];
const log = { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push('WARN ' + a.join(' ')), error: (...a) => lines.push('ERROR ' + a.join(' ')) };
const KEY_A = 'bk-aaaa0001', KEY_B = 'bk-bbbb0002';
const settings = { 'browser.idleTimeoutMs': 60000 };
const mkKeeper = (live, extra = {}) => K.create({
  dataDir: DATA, homeDir: HOME, env: () => localEnv, broadcast: () => { }, serverSetting: (k) => settings[k], serverNotice: () => { },
  getTelemetry: () => null, liveKeys: () => live, limits: { ...LIMITS, CONCURRENT_CAP: 4 }, log, tickMs: 3600e3, install: false,
  access, hostKnown: (h) => access.hostKnown(h), ...extra,
});
let remoteId, extId, localCdpId;
{
  const k = mkKeeper(new Set([KEY_A, KEY_B]));
  const rp = k.createProfile({ label: 'On the laptop', host: 'dev-1' }, { owner: { kind: 'session', id: KEY_A } });
  remoteId = rp.id;
  ok(rp.host === 'dev-1' && rp.dir === null && rp.provider === 'chromium' && !fs.existsSync(path.join(HOME, '.agent-browser', 'vs-' + rp.id)), 'a chromium profile on a paired machine: host set, NO directory here (the machine owns its own)');
  const e1 = await threw(() => k.createProfile({ label: 'X', host: 'nope' }));
  ok(e1 && e1.code === 'unsupported-host' && /not a paired machine/.test(e1.message), 'an unpaired host is refused BY NAME by the keeper');
  ok((await threw(() => k.createProfile({ label: 'C1', provider: 'cloak' }))).code === 'provider_unavailable' && (await threw(() => k.createProfile({ label: 'C2', provider: 'cloak', host: 'dev-1' }))).code === 'provider_needs_local_key' && (await threw(() => k.createProfile({ label: 'C3', provider: 'cdp' }))).code === 'cdp_port_required', 'the keeper speaks the PURE refusals (cloak unavailable / cloak on a host / cdp without a port)');
  const ep = k.createProfile({ label: 'Their Chrome', provider: 'cdp', host: 'dev-1', cdpPort: CDP_PORT }, { owner: { kind: 'session', id: KEY_A } });
  extId = ep.id;
  ok(ep.provider === 'cdp' && ep.cdpPort === CDP_PORT && ep.dir === null, 'a cdp profile on a paired machine: the port, no dir');
  const lp = k.createProfile({ label: 'My Chrome here', provider: 'cdp', cdpPort: CDP_PORT }, { owner: { kind: 'session', id: KEY_B } });
  localCdpId = lp.id;
  ok(lp.host === null && lp.cdpPort === CDP_PORT, 'a cdp profile on THIS machine: no host');
  ok(k.list().providers.length === B.providerIds().length && k.list().providers.find((r) => r.id === 'cloak').control.code === 'provider_unavailable', 'the digest carries the provider rows with their local verdicts');

  // remote chromium: start on the device, forward its port, env names the forward
  const launchesBefore = launches().length;
  const a1 = await k.attach({ profileId: remoteId, browserKey: KEY_A, sessionId: 'sess-a' });
  const rec1 = k.browserOf(remoteId);
  ok(a1.browser.state === 'ready' && rec1.hostId === 'dev-1' && Number.isInteger(rec1.pid) && rec1.forward && rec1.forward.remotePort === CDP_PORT && rec1.forward.localPort !== CDP_PORT && rec1.dir === path.join(REMOTE_HOME, '.agent-browser', 'vs-' + remoteId), `attach: the device started it (pid ${rec1.pid} THERE, dir under the device's home), the hub forwarded ${CDP_PORT} → ${rec1.forward.localPort}`);
  ok(launches().length === launchesBefore + 1 && launches().slice(-1)[0].profile === rec1.dir, 'exactly one launch, on the device-composed directory');
  const cdpPair = a1.env.find(B.isCdpPair);
  ok(cdpPair === `AGENT_BROWSER_CDP=ws://127.0.0.1:${rec1.forward.localPort}/devtools/browser/fake-vs-${remoteId}` && !a1.env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')) && a1.cdpUrl === cdpPair.slice('AGENT_BROWSER_CDP='.length), 'the session\'s env names the hub-side forward (scheme + path kept) and no directory; the wrapper\'s cdpUrl is the same');
  const view = k.list().browsers[remoteId];
  ok(view.cdpUrl === undefined && view.remoteCdpUrl === undefined && view.hostId === 'dev-1' && view.forward.localPort === rec1.forward.localPort, 'the UI view strips both CDP urls and keeps the forward + host');
  ok(access.forwards().some((f) => f.hostId === 'dev-1' && f.remotePort === CDP_PORT), 'the forward is live in the access layer');
  // the tick never pid-judges or samples a remote record
  await k.tick();
  ok(k.browserOf(remoteId).state === 'ready' && !k.list().browsers[remoteId].live, 'the tick leaves a remote record alone: still ready, never sampled (the pid is not local)');
  ok(k.setFor(KEY_A).attachments.some((a) => a.profileId === remoteId), 'the lease is an ordinary lease');
  // stop: the device's own stop, the forward closed, nothing signalled here
  const closesBefore = closes().length;
  const sp = await k.stop(remoteId, { why: 'user' });
  ok(sp.state === 'stopped' && closes().length === closesBefore + 1 && closes().slice(-1)[0].ns === 'vs-' + remoteId && !access.forwards().some((f) => f.remotePort === CDP_PORT && f.hostId === 'dev-1'), 'stop: the device ran its own close --all, the hub closed the forward');
  ok(lines.some((l) => /stopped on dev-1 \(user\)/.test(l)), 'the log says WHERE it stopped');

  // remote cdp (external): reached, probed, never launched
  const a2 = await k.attach({ profileId: extId, browserKey: KEY_A, sessionId: 'sess-a' });
  const rec2 = k.browserOf(extId);
  ok(rec2.external === true && rec2.pid === null && rec2.state === 'ready' && rec2.cdpBrowser === 'Fake/1.0' && rec2.forward.remotePort === CDP_PORT && launches().length === launchesBefore + 1, 'an external browser over CDP: reached (probed /json/version through the forward), NOTHING launched, no pid');
  ok(a2.env.find(B.isCdpPair) === `AGENT_BROWSER_CDP=http://127.0.0.1:${rec2.forward.localPort}`, 'its env names the forward as an http endpoint');
  const sp2 = await k.stop(extId, { why: 'user' });
  ok(sp2.state === 'stopped' && /released/.test(lines.slice(-1)[0]) && (await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`)).status === 200 && access.forwards().length === 0, 'stop releases it: the forward is closed and the external browser is LEFT RUNNING (never signalled)');

  // local cdp: no forward, the port is ours
  const a3 = await k.attach({ profileId: localCdpId, browserKey: KEY_B, sessionId: 'sess-b' });
  ok(a3.env.find(B.isCdpPair) === `AGENT_BROWSER_CDP=http://127.0.0.1:${CDP_PORT}` && k.browserOf(localCdpId).forward === null && k.browserOf(localCdpId).external && access.forwards().length === 0, 'a local cdp profile: the env names the port directly, no forward');
  ok((await k.streamPortFor({ ok: true, kind: 'attachment', profileId: localCdpId, ns: 'x', sessionName: 'y' })).code === 'stream_unavailable', 'the live view of a reached browser is refused by name (not bridged in this release)');
  await k.stop(localCdpId, { why: 'user' });

  // a dead cdp port is a named refusal, never a local launch
  const dead = k.createProfile({ label: 'Dead', provider: 'cdp', cdpPort: 1 }, { owner: { kind: 'instance', id: null } });
  const e2 = await threw(() => k.attach({ profileId: dead.id, browserKey: KEY_B, sessionId: 'sess-b' }));
  ok(e2 && e2.code === 'cdp_unreachable' && /remote-debugging-port=1/.test(e2.message) && /NON-default --user-data-dir/.test(e2.message) && k.browserOf(dead.id).state === 'failed' && launches().length === launchesBefore + 1, 'a port nobody answers ⇒ cdp_unreachable with the remedy (Chrome ≥ 136 needs a non-default user-data-dir) and NO launch');
  // a device without the op / a device down: the keeper refuses by name
  const kd = mkKeeper(new Set([KEY_A]));
  const onOld = kd.createProfile({ label: 'Old box', host: 'dev-old' }, { owner: { kind: 'instance', id: null } });
  const e3 = await threw(() => kd.attach({ profileId: onOld.id, browserKey: KEY_A, sessionId: 'sess-a' }));
  ok(e3 && e3.code === 'host_needs_daemon' && /upgrade the agent/.test(e3.message) && kd.browserOf(onOld.id).state === 'failed', 'a machine whose daemon predates browser-serve ⇒ host_needs_daemon (upgrade the agent), the record failed WITH the reason');
  const onDown = kd.createProfile({ label: 'Down box', host: 'dev-down' }, { owner: { kind: 'instance', id: null } });
  const e4 = await threw(() => kd.attach({ profileId: onDown.id, browserKey: KEY_A, sessionId: 'sess-a' }));
  ok(e4 && e4.code === 'host_unavailable' && /device link not responding/.test(e4.message), 'a machine that cannot be reached ⇒ host_unavailable with the link\'s sentence');
  k.shutdown(); kd.shutdown();
}
// boot adoption of remote records: ask, never signal
{
  const k = mkKeeper(new Set([KEY_A, KEY_B]));
  await k.attach({ profileId: remoteId, browserKey: KEY_A, sessionId: 'sess-a' });
  await k.attach({ profileId: extId, browserKey: KEY_A, sessionId: 'sess-a' });
  const pidThere = k.browserOf(remoteId).pid;
  k.shutdown();
  access.shutdown(); // the "old process" is gone with its forwards (the layer's own forced teardown)
  ok(access.forwards().length === 0, 'shutdown() tears every forward down whatever its reference count');
  const k2 = mkKeeper(new Set([KEY_A]));
  const b = await k2.boot();
  const r1 = k2.browserOf(remoteId), r2 = k2.browserOf(extId);
  ok(b.browsers === 2 && r1.state === 'ready' && r1.adoptedAt && r1.pid === pidThere && r1.forward && r1.forward.remotePort === CDP_PORT, 'boot re-adopts the remote chromium record by ASKING the device (status + cdp-url) and re-forwards its port');
  // both records name dev-1:CDP_PORT (the fake device's browser reports the same port the cdp profile points at) ⇒ ONE shared listener, two holders
  ok(r2.state === 'ready' && r2.adoptedAt && r2.forward && access.forwards().length === 1 && access.forwards()[0].refs === 2, 'boot re-adopts the external record by re-probing through a forward it SHARES with the chromium record (one listener, refs 2)');
  ok(lines.some((l) => /adopted .* on dev-1 \(daemon pid \d+ there\)/.test(l)) && lines.some((l) => /adopted .*external browser over CDP/.test(l)), 'both adoptions are logged with where the process is');
  await k2.stop(remoteId, { why: 'user' });
  ok(access.forwards().length === 1 && access.forwards()[0].refs === 1 && (await getJson(`http://127.0.0.1:${r2.forward.localPort}/json/version`)).status === 200, 'stopping the chromium record releases ITS reference only — the external record\'s forward still answers (never torn down under the other record\'s feet)');
  // the external browser goes away: the next boot records it stopped WITH the reason
  await new Promise((r) => cdpTarget.close(() => r())); servers.delete(cdpTarget);
  k2.shutdown();
  access.shutdown();
  const k3 = mkKeeper(new Set([KEY_A]));
  await k3.boot();
  ok(k3.browserOf(extId).state === 'stopped' && /no browser answers CDP at dev-1:/.test(k3.browserOf(extId).lastError) && access.forwards().length === 0, 'an external browser that vanished: recorded stopped naming the machine + port, its forward closed');
  k3.shutdown();
}

// ═══ ⑤ routes + the shipped CLI ═════════════════════════════════════════════
console.log('— ⑤ the routes and the CLI: providers, create with host/cdpPort, refusals by name, --print withholds the CDP pair');
let srv = null;
{
  // a fresh CDP target for the route/CLI leg
  const cdp2 = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Fake/2.0' })); });
  servers.add(cdp2);
  const CDP2 = await new Promise((r) => cdp2.listen(0, '127.0.0.1', () => r(cdp2.address().port)));
  const express = require('express');
  const R = require('../src/routes/browser.js');
  const kR = mkKeeper(new Set([KEY_A]));
  const TOKEN_A = 'vsst_' + 'a'.repeat(24);
  const active = new Map([['sess-1', { agentToken: TOKEN_A, _browserKey: KEY_A }]]);
  const app = express(); app.use(express.json());
  R.setup({ keeper: kR, activeSessions: active, browserEnv: () => null, cloakPlan: () => B.cloakservePlan({ enabled: false }), forwards: () => access.forwards() });
  app.use(R.router);
  srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  servers.add(srv);
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p, body, headers = {}) => {
    const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, json };
  };
  const bearer = (t) => ({ Authorization: 'Bearer ' + t });
  let r = await j('GET', '/api/browser/providers');
  ok(r.status === 200 && r.json.providers.length === B.providerIds().length && r.json.proof.refusal === 'binary_absent' && r.json.cloak.code === 'cloak_opt_in_off' && r.json.host === null && r.json.hostKnown === true && Array.isArray(r.json.forwards), 'GET /api/browser/providers: the rows, the §7.2.1 record, the cloakserve refusal by name, the forwards');
  r = await j('GET', '/api/browser/providers?host=dev-1');
  ok(r.status === 200 && r.json.hostKnown === true && r.json.providers.find((x) => x.id === 'cloak').onHost.code === 'provider_needs_local_key' && r.json.providers.find((x) => x.id === 'chromium').onHost.ok === true, '?host=dev-1: the verdict FOR that machine per row (a host the route answers ABOUT is not refused)');
  r = await j('GET', '/api/browser/providers?host=nope');
  ok(r.status === 200 && r.json.hostKnown === false, '?host=nope: answered, with hostKnown false');
  r = await j('GET', '/api/browser/profiles?host=other-box');
  ok(r.status === 400 && r.json.code === 'unsupported-host', 'the registry routes still refuse a non-local host by name (the registry is the hub\'s)');
  r = await j('POST', '/api/browser/profiles', { label: 'Their Chrome (route)', provider: 'cdp', host: 'dev-1', cdpPort: CDP2 });
  ok(r.status === 200 && r.json.profile.host === 'dev-1' && r.json.profile.cdpPort === CDP2 && r.json.profile.dir === null, 'POST /api/browser/profiles with host + cdpPort creates the remote cdp profile', JSON.stringify(r.json));
  const extRoute = r.json.profile.id;
  r = await j('POST', '/api/browser/profiles', { label: 'Cloaked', provider: 'cloak' });
  ok(r.status === 400 && r.json.code === 'provider_unavailable' && /binary_absent/.test(r.json.error), 'cloak ⇒ 400 provider_unavailable naming the measurement');
  r = await j('POST', '/api/browser/profiles', { label: 'Elsewhere', host: 'nope' });
  ok(r.status === 400 && r.json.code === 'unsupported-host' && /not a paired machine/.test(r.json.error), 'an unpaired host ⇒ 400 unsupported-host by name');
  r = await j('POST', '/api/browser/profiles', { label: 'Portless', provider: 'cdp' });
  ok(r.status === 400 && r.json.code === 'cdp_port_required', 'cdp without a port ⇒ 400 cdp_port_required');
  r = await j('GET', '/api/browser/profiles');
  ok(r.status === 200 && Array.isArray(r.json.providers) && r.json.providers.length === B.providerIds().length, 'the digest carries the provider rows');
  r = await j('POST', '/api/browser/attach', { sessionId: 'sess-1', profile: extRoute });
  ok(r.status === 200 && !('cdpUrl' in r.json) && r.json.env.some(B.isCdpPair) && r.json.browser.hostId === 'dev-1' && r.json.browser.cdpUrl === undefined, 'attach over the route: the env carries the pair, the UI answer no top-level cdpUrl and the browser view none either');
  r = await j('GET', '/api/agent/browser/providers?host=dev-1', undefined, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.providers.find((x) => x.id === 'cdp').onHost.ok === true, 'the agent-side providers route answers the same rows');
  // the shipped CLI
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: TOKEN_A };
  // run the shipped CLI under THIS node (the r7 lesson) and ASYNC: the route server it talks to
  // runs in THIS process, so a spawnSync would block the very loop that has to answer it
  const cli = (args) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: cliEnv, encoding: 'utf8', timeout: 20000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') + (err && typeof err.code !== 'number' ? `\n[spawn error] ${err.message}` : '') })));
  const pv = await cli(['providers', '--host', 'dev-1']);
  ok(pv.status === 0 && /✗ cloak/.test(pv.stdout) && /provider_needs_local_key|needs a key/.test(pv.stdout) && /✓ chromium/.test(pv.stdout) && /egress measurement .* refused — binary_absent/.test(pv.stdout), 'vibespace-browser providers --host dev-1 prints each row with its verdict and the egress record', pv.stdout + pv.stderr);
  const nw = await cli(['new', 'Laptop Chrome', '--provider', 'cdp', '--host', 'dev-1', '--cdp-port', String(CDP2)]);
  ok(nw.status === 0 && /reaching an existing browser over CDP \(dev-1:\d+; nothing is started\)/.test(nw.stdout), 'vibespace-browser new --provider cdp --host --cdp-port says what it made', nw.stdout + nw.stderr);
  const newId = /\((bp-[0-9a-f]{8})\)/.exec(nw.stdout)?.[1];
  const up = await cli(['use', newId]);
  ok(up.status === 0 && !/AGENT_BROWSER_CDP=|ws:\/\/|devtools/i.test(up.stdout + up.stderr) && !/export /.test(up.stdout) && /attached — run `vibespace-browser <verb>`/.test(up.stdout), '`use` of a reached browser prints no env and no CDP url (§5.1; takeover C2: there is nothing to export)', up.stdout + up.stderr);
  const cl = await cli(['new', 'Cloaked', '--provider', 'cloak']);
  ok(cl.status !== 0 && /provider_unavailable/.test(cl.stdout + cl.stderr), 'the CLI prints the typed refusal for cloak', cl.stdout + cl.stderr);
  const pf = await cli(['profiles']);
  ok(pf.status === 0 && /cdp on dev-1 cdp:\d+/.test(pf.stdout), '`profiles` shows host + cdp port on the row', pf.stdout);
  await kR.stop(extRoute, { why: 'user' }).catch(() => { });
  await kR.stop(newId, { why: 'user' }).catch(() => { });
  kR.shutdown();
  await new Promise((r) => srv.close(() => r())); servers.delete(srv);
  await new Promise((r) => cdp2.close(() => r())); servers.delete(cdp2);
}

// ═══ ⑥ the egress proxy over real loopback sockets ═════════════════════════
console.log('— ⑥ the allowlisting egress proxy (§7.2.1: enforcing, not observed)');
{
  const target = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('hi ' + req.url); });
  servers.add(target);
  const TP = await new Promise((r) => target.listen(0, '127.0.0.1', () => r(target.address().port)));
  let list = 'allowed.test, .sub.test';
  const proxy = E.create({ allowlist: () => list, resolve: (h) => (h === 'allowed.test' || h.endsWith('.sub.test') ? '127.0.0.1' : h), log: { log: () => { } } });
  const PP = await proxy.listen();
  ok(Number.isInteger(PP) && PP > 0 && proxy.url() === `http://127.0.0.1:${PP}`, `the proxy listens on loopback:${PP}`);
  const raw = (lines2) => new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: PP }); let buf = '';
    s.on('data', (d) => { buf += d; }); s.on('close', () => resolve(buf)); s.on('error', () => resolve(buf));
    s.once('connect', () => s.write(lines2));
    setTimeout(() => { try { s.destroy(); } catch { /* gone */ } }, 3000);
  });
  const tunnel = (host) => new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: PP }); let buf = '', stage = 0;
    s.on('data', (d) => { buf += d; if (stage === 0 && /\r\n\r\n/.test(buf)) { if (/ 200 /.test(buf)) { stage = 1; buf = ''; s.write(`GET /through HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`); } else { s.end(); } } });
    s.on('close', () => resolve({ stage, buf })); s.on('error', () => resolve({ stage, buf }));
    s.once('connect', () => s.write(`CONNECT ${host}:${TP} HTTP/1.1\r\nHost: ${host}:${TP}\r\n\r\n`));
    setTimeout(() => { try { s.destroy(); } catch { /* gone */ } }, 3000);
  });
  const t1 = await tunnel('allowed.test');
  ok(t1.stage === 1 && /hi \/through/.test(t1.buf), 'CONNECT to an allowlisted host: 200 Connection Established, bytes tunnelled both ways');
  const t2 = await tunnel('a.sub.test');
  ok(t2.stage === 1 && /hi \/through/.test(t2.buf), 'a dotted-suffix rule admits a sub-domain');
  const t3 = await tunnel('blocked.test');
  ok(t3.stage === 0 && /HTTP\/1\.1 403/.test(t3.buf) && /egress refused: blocked.test is not in the egress allowlist/.test(t3.buf), 'CONNECT to a host not listed: 403 with the verdict\'s own sentence, socket closed');
  const t4 = await tunnel('localhost');
  ok(t4.stage === 0 && /403/.test(t4.buf) && /loopback/.test(t4.buf), 'CONNECT to loopback is refused even though 127.0.0.1 is where the target lives (never a way back into the hub)');
  const g1 = await raw(`GET http://allowed.test:${TP}/plain HTTP/1.1\r\nHost: allowed.test\r\nConnection: close\r\n\r\n`);
  ok(/HTTP\/1\.1 200/.test(g1) && /hi \/plain/.test(g1), 'plain http through the proxy for an allowlisted host');
  const g2 = await raw(`GET http://blocked.test:${TP}/plain HTTP/1.1\r\nHost: blocked.test\r\nConnection: close\r\n\r\n`);
  ok(/HTTP\/1\.1 403/.test(g2) && /egress refused/.test(g2), 'plain http to a host not listed: 403');
  const g3 = await raw('GET /relative HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
  ok(/HTTP\/1\.1 400/.test(g3), 'a non-proxy (origin-form) request is refused 400 — it is a proxy, not a server');
  list = '';
  const t5 = await tunnel('allowed.test');
  ok(t5.stage === 0 && /403/.test(t5.buf) && /empty/.test(t5.buf), 'the allowlist is re-read per request: emptied ⇒ the same host is now refused (deny by default)');
  // allowed: t1, t2, g1 · refused: t3, t4, g2, t5 (g3's 400 is a malformed request, not a verdict)
  ok(proxy.stats.allowed === 3 && proxy.stats.refused === 4, `stats count what happened (${proxy.stats.allowed} allowed / ${proxy.stats.refused} refused)`);
  await proxy.close();
  await new Promise((r) => target.close(() => r())); servers.delete(target);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
