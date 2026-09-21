#!/usr/bin/env node
// AGENT BROWSER P4 second half — the live backend SWITCH and the key-consumer
// half (docs/design-agent-browser-v2.md §7.4 / §7.5 / §7.6, D17 / D32 / D33 /
// D34, round 8's clauses; §9's `test-browser-backend` row).
//
//   ① PURE (src/browser-switch.js): the version ladder over a matrix (target
//      ≥ / < / unrecorded, registry-vs-`Last Version` disagreement ⇒ the
//      HIGHER), the seed carried and never re-minted, the fingerprint
//      sentence from the FACT, SEATS AS THREE STATES (an unknown total never
//      satisfies the ceiling — controls that treat it as 0 and as ∞ are red;
//      a stale verdict degrades past SEAT_TIER_STALE_MS), the ceiling wording
//      forked on key source, the launch-failure classifier's SHAPE, the site
//      hint carrying WHO claimed it + `tier` legal only while backend === null,
//      `blocked` a CLAIM the server never manufactures, the 403/429 HINT, the
//      derived test host (constant / the field the user typed / the region),
//      the gate's ORDER (keyScope refused before any key is resolved).
//   ② ORCH (src/server/browser-backend.js): the six runners register through
//      a REAL integration store, keyFor is the literal per-row resolve, the
//      chip's sourceOf never carries a value, cloak's Test is zero-network.
//   ③ The REAL keeper over a FAKE `agent-browser` playing cloak: the three
//      named refusals (backend_unavailable / backend_no_key + action /
//      backend_seat_taken with the cluster wording), the tier + Chromium major
//      read back from a real launch, a real in-place switch (stop → same dir +
//      carried seed → one tab re-opened per lease at its lastUrl → re-pinned
//      → targetId rewritten → the lease OBJECT never destroyed), the
//      browser_restarting refusal mid-way, a proposal when another session
//      holds a lease, the version ladder refusing a downgrade on a real dir.
//   ④ Routes + the shipped CLI (`backend`, `backend <name>`, `blocked`).
//
// No real browser, no vendor call, port 0 everywhere, scratch dirs only; the
// fake binary's shebang is THIS node and every `sleep` it starts is reaped.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');
const SW = require('../src/browser-switch.js');
const K = require('../src/server/browser-keeper.js');
const BB = require('../src/server/browser-backend.js');
const IS = require('../src/server/integration-store.js');
const R = require('../src/integration-registry.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── scratch world ──
const ROOT = scratch('browser-backend');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const NODE_DIR = path.dirname(process.execPath);
const PATH_ENV = `${BIN}:${NODE_DIR}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;
process.env.HOME = HOME;
process.env.FAKE_AB_STATE = AB_STATE;

// The FAKE agent-browser: the test-browser-pin fixture + it RECORDS what a
// key-bearing / cloak launch hands it (the vendor env NAME's presence, the
// `--executable-path` / `--args` / `-p` prefix), answers `open` with a minted
// targetId (logged per session), prints a "plan" line when launched as cloak
// (what the keeper reads the TIER back from), and fails on licence when told.
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const raw = process.argv.slice(2);
const prefix = { exe: null, args: null, provider: null, pinTab: raw.includes('--pin-tab') };
const argv = [];
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === '--pin-tab') continue;
  if (raw[i] === '--executable-path') { prefix.exe = raw[i + 1]; i++; continue; }
  if (raw[i] === '--args') { prefix.args = raw[i + 1]; i++; continue; }
  if (raw[i] === '-p') { prefix.provider = raw[i + 1]; i++; continue; }
  argv.push(raw[i]);
}
const [a, b] = argv;
const vendor = { cloak: process.env.CLOAKBROWSER_LICENSE_KEY || null, browserbase: process.env.BROWSERBASE_API_KEY || null };
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') {
  let s = read();
  { let slow = 0; try { slow = Number(fs.readFileSync(path.join(st, 'slow-ms'), 'utf8')) || 0; } catch { } if (slow) { const t = Date.now() + slow; while (Date.now() < t) {} } }
  if (!(s && alive(s.pid))) {
    if (fs.existsSync(path.join(st, 'fail-license'))) { process.stderr.write('cloakbrowser: license validation failed — concurrent session limit reached for this key\\n'); process.exit(1); }
    const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref();
    s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null, ...prefix, vendor, session: process.env.AGENT_BROWSER_SESSION || null };
    fs.writeFileSync(f, JSON.stringify(s));
    fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n');
    if (prefix.exe) process.stdout.write('cloakbrowser 0.5.10: plan free (1 concurrent session)\\n');
  }
  const n = (Number((read() || {}).opens) || 0) + 1; const cur = read() || s; cur.opens = n; fs.writeFileSync(f, JSON.stringify(cur));
  const targetId = 't-' + ns + '-' + n;
  fs.appendFileSync(path.join(st, 'opens.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, url: b, targetId, pinTab: prefix.pinTab }) + '\\n');
  out({ success: true, data: { url: b, targetId } }); process.exit(0);
}
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:' + (process.env.FAKE_AB_CDP_PORT || '19222') + '/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } fs.appendFileSync(path.join(st, 'closes.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, closed }) + '\\n'); out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
// a fake `cloakbrowser` binary: exists and is executable — the keeper only resolves its PATH
const CLOAK_EXE = path.join(BIN, 'cloakbrowser'); fs.writeFileSync(CLOAK_EXE, `#!${process.execPath}\nprocess.exit(0);\n`, { mode: 0o755 });
const readLog = (name) => { try { return fs.readFileSync(path.join(AB_STATE, name), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const launches = () => readLog('launches.log');
const opens = () => readLog('opens.log');
const closes = () => readLog('closes.log');
const servers = new Set();
function cleanup() {
  for (const l of launches()) if (l.pid) { try { process.kill(l.pid, 'SIGKILL'); } catch { /* gone */ } }
  for (const s of servers) { try { s.close(); } catch { /* gone */ } }
  fs.rmSync(ROOT, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

// a fake /json/version so a launch reads its Chromium MAJOR back (the ladder's input)
let cdpBrowser = 'Chrome/146.0.7000.1';
const cdpSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: cdpBrowser })); });
servers.add(cdpSrv);
process.env.FAKE_AB_CDP_PORT = String(await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port))));

// ═══ ① PURE ════════════════════════════════════════════════════════════════
console.log('— ① the version ladder, the seed, seats in three states, the ceiling fork, the classifier, hints, the claim, the gate');
{
  // the version ladder (§7.4's table)
  const up = SW.versionLadder({ target: 'cloak', targetMajor: 146, recordedMajor: 140, dirMajor: 140 });
  ok(up.ok && up.recordMajor === 146 && !up.disagreement, 'target ≥ the major that wrote the dir ⇒ switch, record the new major');
  ok(SW.versionLadder({ targetMajor: 146, recordedMajor: 146 }).ok, 'same major ⇒ switch');
  const down = SW.versionLadder({ target: 'chromium', targetMajor: 146, recordedMajor: 151, dirMajor: null });
  ok(!down.ok && down.code === 'downgrade_refused' && /151/.test(down.error) && /146/.test(down.error) && down.waysOut.length === 2 && /upgrade chromium/.test(down.waysOut[0]) && /non-extractable CryptoKeys/.test(down.waysOut[1]) && /WhatsApp/.test(down.waysOut[1]), 'target < the major that wrote it ⇒ REFUSED naming both versions, two ways out (upgrade / clone via export naming what it drops)');
  const dis = SW.versionLadder({ target: 'cloak', targetMajor: 148, recordedMajor: 146, dirMajor: 151 });
  ok(!dis.ok && dis.code === 'downgrade_refused' && dis.disagreement && dis.disagreement.taken === 151 && dis.wrote === 151, 'registry (146) vs Last Version (151) disagree ⇒ the HIGHER wins and refuses 148');
  const dis2 = SW.versionLadder({ target: 'cloak', targetMajor: 152, recordedMajor: 151, dirMajor: 146 });
  ok(dis2.ok && dis2.disagreement.taken === 151, 'the other disagreement direction takes the higher too, and 152 clears it');
  const unk = SW.versionLadder({ target: 'cloak', targetMajor: 146, recordedMajor: null, dirMajor: null });
  ok(!unk.ok && unk.code === 'downgrade_unknown' && unk.needsConfirm === true, 'no recorded major AND an unreadable dir ⇒ refuse the AUTOMATIC downgrade, one human confirmation required');
  ok(SW.versionLadder({ target: 'cloak', targetMajor: 146, recordedMajor: null, dirMajor: null, confirmed: true }).ok, '…and the confirmation lets it through');
  const tu = SW.versionLadder({ target: 'cloak', targetMajor: null, recordedMajor: 146 });
  ok(!tu.ok && tu.code === 'downgrade_unknown' && tu.needsConfirm && /not known yet/.test(tu.error), 'an UNKNOWN target major is never "old enough" — refuse without a confirmation (the floor rule)');
  ok(SW.majorOf('146.0.7000.1') === 146 && SW.parseLastVersion('151.0.7100.0\n') === 151 && SW.majorOfBrowserString('HeadlessChrome/146.0.7000.1') === 146 && SW.majorOf('') === null && SW.majorOfBrowserString('Fake/2.0') === null, 'majorOf / parseLastVersion / majorOfBrowserString read what the browser writes and answer null on nothing');
  ok(SW.chromiumMajorFor('cloak', { tier: 'free' }) === 146 && SW.chromiumMajorFor('cloak', { tier: 'pro' }) === 151 && SW.chromiumMajorFor('chromium', { majors: { chromium: { major: 140 } } }) === 140 && SW.chromiumMajorFor('chromium', {}) === null && SW.chromiumMajorFor('cloak', { tier: 'free', majors: { cloak: { major: 150 } } }) === 150, 'the target major: cloak from its tier (or the higher seen), chromium from its last launch, else unknown');
  // the seed: minted once, carried
  const s1 = SW.seedForSwitch({ profile: { fingerprintSeed: null }, target: 'cloak', hex: '0000002a' });
  const s2 = SW.seedForSwitch({ profile: { fingerprintSeed: 118293 }, target: 'cloak', hex: 'ffffffff' });
  const s3 = SW.seedForSwitch({ profile: { fingerprintSeed: 118293 }, target: 'chromium', hex: 'ffffffff' });
  ok(s1.minted && s1.seed === 42 && !s2.minted && s2.seed === 118293 && !s3.minted && s3.seed === 118293, 'a seed is minted ONCE (from the hex it is handed) and carried through every later switch; leaving cloak keeps it on the record');
  ok(SW.mintSeed('00000000') === 1 && SW.mintSeed('zz') === 1 && SW.mintSeed('7fffffff') > 0, 'mintSeed is always a positive 31-bit integer');
  const fn1 = SW.fingerprintNote({ from: 'chromium', to: 'cloak', hadSeed: false, seed: 42 });
  const fn2 = SW.fingerprintNote({ from: 'cloak', to: 'chromium', hadSeed: true });
  ok(/no stable fingerprint before/.test(fn1) && /log in again/.test(fn1) && /minted now/.test(fn1) && /new device/.test(fn2) && SW.fingerprintNote({ from: 'chromium', to: 'chromium' }) === null, 'the dialog sentence is worded from the FACT (chromium→cloak: "had no stable fingerprint before"; cloak→chromium: "leaves its fingerprint"); nothing to say when nothing changes');

  // seats: three states
  const NOW = 1_800_000_000_000;
  const fresh = SW.seatState({ tier: 'free', total: 1, at: NOW - 3 * 3600e3, now: NOW });
  const stale = SW.seatState({ tier: 'free', total: 1, at: NOW - SW.SEAT_TIER_STALE_MS - 1, now: NOW });
  const unknown = SW.seatState({ now: NOW });
  ok(fresh.state === 'known-fresh' && fresh.total === 1 && /3 h ago/.test(fresh.text), 'known-and-fresh carries the age of the reading ("tier read from a launch 3 h ago")');
  ok(stale.state === 'known-stale' && stale.total === null && stale.lastTotal === 1 && /no longer constrains/.test(stale.text), 'older than SEAT_TIER_STALE_MS ⇒ known-but-stale: says what the LAST tier was, degrades to unknown');
  ok(unknown.state === 'unknown' && unknown.total === null && /never a fabricated/.test(unknown.text) === false && /becomes known the first time this key actually launches/.test(unknown.text), 'never launched ⇒ unknown, with the sentence and never a number');
  const sameFixture = (at) => SW.seatVerdict({ state: SW.seatState({ tier: 'free', total: 1, at, now: NOW }), used: 1, provider: 'cloak', source: 'user', holders: [{ profileId: 'bp-1', label: 'Vendor portal' }], integrationId: 'cloak' });
  ok(!sameFixture(NOW - 1000).ok && sameFixture(NOW - 1000).code === 'backend_seat_ceiling' && sameFixture(NOW - SW.SEAT_TIER_STALE_MS - 1).ok, 'the SAME fixture flips from refuse to allow once the clock passes SEAT_TIER_STALE_MS (a stale verdict degrades to unknown)');
  ok(SW.seatState({ tier: 'free', total: 1, at: NOW - 3600e3, now: NOW, staleMs: SW.SEAT_TIER_STALE_MS }).state === 'known-fresh' && SW.seatState({ tier: 'free', total: 1, at: NOW - 3600e3, now: NOW, staleMs: 1000 }).state === 'known-stale', 'CONTROL: the version that drops the age (staleMs tiny vs the constant) changes the answer — the horizon is load-bearing');
  const unkV = SW.seatVerdict({ state: unknown, used: 5, provider: 'cloak', source: 'cluster', integrationId: 'cloak' });
  ok(unkV.ok && unkV.ceiling === null && /5 used on this instance/.test(unkV.text), 'AN UNKNOWN TOTAL NEVER SATISFIES THE CEILING TEST: 5 used against unknown ⇒ no refusal');
  const asZero = SW.seatVerdict({ state: { ...unknown, state: 'known-fresh', total: 0 }, used: 0, provider: 'cloak', source: 'user', integrationId: 'cloak' });
  const asInf = SW.seatVerdict({ state: { ...unknown, state: 'known-fresh', total: Infinity }, used: 5, provider: 'cloak', source: 'user', integrationId: 'cloak' });
  ok(!asZero.ok && asInf.ok, 'CONTROL: treating unknown as 0 refuses everything and as ∞ refuses nothing — both are wrong and the real unknown does neither');
  ok(SW.seatVerdict({ state: stale, used: 9, provider: 'cloak', source: 'user', integrationId: 'cloak' }).ok, 'a stale reading refuses nothing either');
  // the ceiling wording forks on the key's SOURCE
  const own = SW.seatVerdict({ state: fresh, used: 1, provider: 'cloak', source: 'user', holders: [{ profileId: 'bp-1', label: 'Vendor portal' }], integrationId: 'cloak' });
  const clu = SW.seatVerdict({ state: fresh, used: 1, provider: 'cloak', source: 'cluster', holders: [{ profileId: 'bp-1', label: 'Vendor portal' }], integrationId: 'cloak' });
  ok(!own.ok && /held by Vendor portal/.test(own.error) && /stop one/.test(own.error) && own.holders.length === 1 && own.action === null, "the user's own key ⇒ the refusal NAMES the profiles holding seats and offers to stop one");
  ok(!clu.ok && /cluster default \(seats shared with other users; 1 used on this instance of 1\)/.test(clu.error) && !/Vendor portal/.test(clu.error) && clu.holders.length === 0 && clu.action && clu.action.openIntegration === 'cloak', 'the cluster default ⇒ "seats shared with other users; N used on this instance" + the one-click way out, and NO profile listed');
  ok(!/Vendor portal/.test(clu.error), 'CONTROL: the version that lists local profiles under a cluster default would be wrong (this instance cannot see the other pods) — the fork holds');
  ok(fresh.state === 'known-fresh' && SW.seatVerdict({ state: fresh, used: 0, provider: 'cloak', source: 'user', integrationId: 'cloak' }).ok, 'under the ceiling (0 used of 1) the switch is allowed');
  // the classifier's SHAPE (§12.40 unmeasured: keys on the family of words)
  const taken = SW.classifyLaunchFailure({ provider: 'cloak', text: 'license validation failed — concurrent session limit reached', source: 'cluster', integrationId: 'cloak' });
  ok(taken.code === 'backend_seat_taken' && /cluster default/.test(taken.error) && /shared fleet-wide/.test(taken.error) && taken.action.openIntegration === 'cloak' && /own key/.test(taken.action.label), 'a licence/concurrency launch failure under a cluster default ⇒ backend_seat_taken saying the seats are shared fleet-wide + "use my own key"');
  const takenOwn = SW.classifyLaunchFailure({ provider: 'cloak', text: 'Seat limit exceeded', source: 'user', integrationId: 'cloak' });
  ok(takenOwn.code === 'backend_seat_taken' && !/cluster/.test(takenOwn.error), "…and under the user's own key it says another browser under this key holds the seat");
  ok(SW.classifyLaunchFailure({ provider: 'cloak', text: 'segmentation fault', source: 'user', integrationId: 'cloak' }).code === 'launch_failed' && SW.classifyLaunchFailure({ provider: 'chromium', text: 'license', integrationId: null }).code === 'launch_failed', 'any other failure is launch_failed; a provider with no key row is never classified as a seat');
  ok(SW.tierFromLaunch('cloakbrowser 0.5.10: plan free (1 concurrent session)').tier === 'free' && SW.tierFromLaunch('plan: pro, 20 concurrent sessions').total === 20 && SW.tierFromLaunch('FREE tier').total === 1 && SW.tierFromLaunch('hello') === null, 'tierFromLaunch reads the tier/seat count a launch prints and answers null (unknown) on nothing recognisable');

  // the derived test host (§7.5's rule) + the one request
  ok(SW.testHostFor('cloak', {}).ok && SW.testHostFor('cloak', {}).host === null, 'cloak: zero network — no host');
  ok(SW.testHostFor('cloud:browserbase', {}).host === 'api.browserbase.com' && SW.testHostFor('cloud:browseruse', {}).host === 'api.browser-use.com', 'browserbase / browseruse: their constant API host');
  const h1 = SW.testHostFor('cloud:browserless', { apiUrl: 'https://chrome.example.net:8443/' }), h2 = SW.testHostFor('cloud:browserless', { apiUrl: 'https://other.example.org/v2' });
  ok(h1.host === 'chrome.example.net' && h2.host === 'other.example.org' && h1.rule === 'field apiUrl', 'browserless: the host FOLLOWS the apiUrl the user typed (driven twice with two urls)');
  ok(SW.testHostFor('cloud:kernel', { endpoint: 'https://k.example.com' }).host === 'k.example.com', 'kernel: from its endpoint field');
  const und = SW.testHostFor('cloud:browserless', {});
  ok(!und.ok && und.code === 'host_underivable' && /never a default host/.test(und.error), 'a host it cannot derive is a NAMED refusal, never "let us try the default"');
  ok(SW.testHostFor('cloud:agentcore', { region: 'us-east-1' }).host === 'bedrock-agentcore.us-east-1.amazonaws.com' && !SW.testHostFor('cloud:agentcore', { region: 'moon' }).ok, 'agentcore: derived from its region, refused on a non-region');
  const rq = SW.testRequestFor('cloud:browserless', { apiKey: 'k'.repeat(20), apiUrl: 'https://chrome.example.net' });
  ok(rq.ok && rq.host === 'chrome.example.net' && rq.url.startsWith('https://chrome.example.net/') && !/k{20}/.test(rq.url) && rq.headers.Authorization === 'Bearer ' + 'k'.repeat(20), 'the one request rides the derived host with the key in a HEADER, never in the URL');
  ok(SW.testRequestFor('cloak', {}) === null && SW.testRequestFor('cloud:agentcore', { region: 'us-east-1' }).unsigned === true, 'cloak has no request at all; agentcore says it is unsigned');
  ok(SW.vendorEnvFor('cloud:browserless', { apiKey: 'K', apiUrl: 'https://x.example', stealth: '' }).BROWSERLESS_API_KEY === 'K' && SW.vendorEnvFor('cloud:browserless', { apiKey: 'K', apiUrl: 'https://x.example', stealth: '' }).BROWSERLESS_API_URL === 'https://x.example' && !('BROWSERLESS_STEALTH' in SW.vendorEnvFor('cloud:browserless', { apiKey: 'K', stealth: '' })) && Object.keys(SW.vendorEnvFor('chromium', { apiKey: 'K' })).length === 0 && SW.vendorEnvFor('cloak', { licenseKey: 'cb_x' }).CLOAKBROWSER_LICENSE_KEY === 'cb_x', "vendorEnvFor: the vendor's OWN names, only the fields that carry a value, nothing for a key-less provider");
  ok(SW.launchArgsFor('cloak', { seed: 42, executablePath: '/opt/cb' }).join(' ') === '--executable-path /opt/cb --args --fingerprint=42' && SW.launchArgsFor('cloud:kernel', {}).join(' ') === '-p kernel' && SW.launchArgsFor('chromium', {}).length === 0, 'launchArgsFor: cloak = the other binary + its seed, cloud = upstream\'s -p, chromium = nothing; the KEY is never in argv');
  ok(SW.VENDOR_ENV_NAMES.every((n) => !n.startsWith('VIBESPACE_')) && SW.VENDOR_ENV_NAMES.includes('BROWSERBASE_API_KEY'), 'the vendor names are exactly the class agentEnv passes through — which is why the cluster may inject only under the store\'s own prefix');

  // per-site memory: a CLAIM with who made it; tier legal only while backend === null
  const hA = SW.siteHintVerdict({ host: 'https://Portal.Example/login', backend: 'cloak', by: 'user', at: 5, why: 'blocks chromium', providerIds: B.providerIds() });
  ok(hA.ok && hA.value.host === 'portal.example' && hA.value.backend === 'cloak' && hA.value.tier === null && hA.value.by === 'user' && hA.value.at === 5, 'a hint is keyed by EXACT host (taken from a URL, lower-cased) and records who claimed it and when');
  const hB = SW.siteHintVerdict({ host: 'bank.example', tier: 3, by: 'agent', providerIds: B.providerIds() });
  ok(hB.ok && hB.value.tier === 3 && hB.value.backend === null, 'a tier-only claim before any provider is chosen is legal (backend null)');
  const hC = SW.siteHintVerdict({ host: 'bank.example', tier: 2, backend: 'cloak', by: 'agent', providerIds: B.providerIds() });
  ok(!hC.ok && hC.code === 'hint_tier_with_backend', 'NEGATIVE CONTROL: a hint that names a backend AND carries a tier is refused (§7.6 rule 2 — the tier is derived, never stored twice)');
  ok(!SW.siteHintVerdict({ host: 'x.example', backend: 'nope', providerIds: B.providerIds() }).ok && !SW.siteHintVerdict({ host: '', backend: 'cloak' }).ok && !SW.siteHintVerdict({ host: 'x.example', backend: 'cloak', by: 'server' }).ok && !SW.siteHintVerdict({ host: 'x.example' }).ok, 'an unknown backend, no host, an unknown claimant, or a hint saying nothing are all refused by name');
  ok(SW.siteHintFor([hA.value], 'https://portal.example/x').host === 'portal.example' && SW.siteHintFor([hA.value], 'other.example') === null, 'siteHintFor matches the exact host of a URL');
  // the blocked claim: made by the agent, never manufactured
  const bc = SW.blockedClaim({ url: 'https://portal.example/login?x=1', why: 'captcha', evidence: 'HTTP 403 twice', browserKey: 'bk-00000001', sessionId: 'sess-1', profileId: 'bp-00000001', tier: 2, at: 7, id: 'bl-1' });
  ok(bc.ok && bc.value.host === 'portal.example' && bc.value.by === 'agent' && bc.value.tier === 2 && bc.value.why === 'captcha' && bc.value.id === 'bl-1', 'a blocked claim carries the URL\'s host, WHO claimed it (the agent), why, the evidence and the suggested tier');
  ok(/the agent says this page is blocked/.test(SW.blockedText(bc.value)) && !/detected/.test(SW.blockedText(bc.value)) && /suggests tier 2/.test(SW.blockedText(bc.value)), 'the sentence says WHO claimed it and never "detected"');
  ok(!SW.blockedClaim({ url: 'https://x.example', by: 'server' }).ok && !SW.blockedClaim({ url: '' }).ok && !('detected' in bc.value), 'NEGATIVE CONTROL: a claim "by the server" is refused — the server never manufactures one, and the record has no field for a detection');
  ok(SW.navHint(403).tier === 2 && /not a detection/.test(SW.navHint(429).text) && SW.navHint(200) === null && SW.navHint(500) === null, 'a real 403/429 yields a typed HINT naming its source, worded so it cannot be read as a detection');
  ok(SW.backendChip({ provider: 'chromium', major: 146 }) === 'chromium 146' && SW.backendChip({ provider: 'cloak', major: 146, tier: 'free' }) === 'cloak 146 (free)' && SW.backendChip({ provider: 'cdp' }) === 'cdp', 'the chip: `chromium 146` / `cloak 146 (free)` / `cdp`');
  ok(SW.restartingRefusal({ label: 'Vendor portal' }).code === 'browser_restarting' && /lease survives/.test(SW.restartingRefusal({ label: 'x' }).error), 'the mid-switch refusal is named and says the lease survives');

  // the gate's ORDER: keyScope refused BEFORE any key is resolved (leg viii)
  const calls = [];
  const resolveKey = (id) => { calls.push(id); return { source: 'user', values: { licenseKey: 'cb_x' } }; };
  const remote = { id: 'bp-1', label: 'Remote', provider: 'chromium', host: 'dev-1', dir: null, owner: { kind: 'instance' } };
  const g1 = SW.switchVerdict({ profile: remote, target: 'cloak', rowOf: B.providerRow, controlOf: B.providerControl, resolveKey });
  ok(!g1.ok && g1.code === 'provider_needs_local_key' && calls.length === 0, 'host != null switching to cloak ⇒ provider_needs_local_key and resolveKey was NEVER called (nothing resolved, nothing handed to a transport)');
  const g1b = SW.switchVerdict({ profile: remote, target: 'cloud:browserbase', rowOf: B.providerRow, controlOf: B.providerControl, resolveKey });
  ok(!g1b.ok && g1b.code === 'provider_needs_local_key' && calls.length === 0, '…and cloud:* likewise');
  const wiredCloak = { row: (id) => (id === 'cloak' ? { ...B.providerRow('cloak'), wired: true } : B.providerRow(id)), control: (id, o) => (id === 'cloak' && !(o && o.host) ? { ok: true, row: { ...B.providerRow('cloak'), wired: true } } : B.providerControl(id, o)) };
  const local = { id: 'bp-2', label: 'Vendor portal', provider: 'chromium', host: null, dir: '/tmp/x', fingerprintSeed: null, lastChromiumMajor: 146, owner: { kind: 'session', id: 'bk-00000001' } };
  const g2 = SW.switchVerdict({ profile: local, target: 'cloak', rowOf: B.providerRow, controlOf: B.providerControl, resolveKey });
  ok(!g2.ok && g2.code === 'backend_unavailable' && /binary_absent/.test(g2.error) && calls.length === 0, 'an unwired target ⇒ backend_unavailable naming what is missing, before any key resolve');
  const noKey = SW.switchVerdict({ profile: local, target: 'cloak', rowOf: wiredCloak.row, controlOf: wiredCloak.control, resolveKey: () => ({ source: 'none', why: 'nothing configured' }) });
  ok(!noKey.ok && noKey.code === 'backend_no_key' && noKey.action.openIntegration === 'cloak' && /Integrations/.test(noKey.error) && noKey.integrationId === 'cloak', 'no key ⇒ backend_no_key with the ACTIONABLE way out (app.openIntegration("cloak"))');
  const g3 = SW.switchVerdict({ profile: local, target: 'cloak', rowOf: wiredCloak.row, controlOf: wiredCloak.control, resolveKey, seats: {}, majors: {}, hex: '0000002a', leases: [], by: { kind: 'user' } });
  ok(g3.ok && g3.mode === 'switch' && g3.seed === 42 && g3.seedMinted && /no stable fingerprint before/.test(g3.fingerprint) && g3.ladder && g3.ladder.ok && g3.seats && g3.seats.ok && calls.length === 1, 'the gate passes: seed minted, fingerprint sentence, ladder ok (cloak free = 146 ≥ 146), seats unknown ⇒ no refusal, key resolved ONCE');
  const g4 = SW.switchVerdict({ profile: { ...local, lastChromiumMajor: 151 }, target: 'cloak', rowOf: wiredCloak.row, controlOf: wiredCloak.control, resolveKey, seats: { cloak: { tier: 'free', total: 1, at: 1 } } });
  ok(!g4.ok && g4.code === 'downgrade_refused' && g4.waysOut.length === 2, 'a dir last written by 151 refuses the free tier\'s 146 with the ladder\'s two ways out');
  const g5 = SW.switchVerdict({ profile: local, target: 'cloak', rowOf: wiredCloak.row, controlOf: wiredCloak.control, resolveKey, seats: { cloak: { tier: 'free', total: 1, at: NOW - 1000 } }, now: NOW, runningOf: () => [{ profileId: 'bp-9', label: 'Other' }] });
  ok(!g5.ok && g5.code === 'backend_seat_ceiling' && /held by Other/.test(g5.error), 'at the ceiling (1 used of a fresh 1) the gate refuses naming the holder');
  const g6 = SW.switchVerdict({ profile: local, target: 'cloak', rowOf: wiredCloak.row, controlOf: wiredCloak.control, resolveKey, leases: [{ browserKey: 'bk-00000001', profileId: 'bp-2' }, { browserKey: 'bk-00000002', profileId: 'bp-2' }], by: { kind: 'agent' }, byKey: 'bk-00000001' });
  ok(g6.ok && g6.mode === 'proposal' && /other session/.test(g6.reason) && g6.affected.length === 2, "an agent's switch while another session holds a lease ⇒ a PROPOSAL naming the affected sessions");
  const g7 = SW.switchVerdict({ profile: local, target: 'cloak', rowOf: wiredCloak.row, controlOf: wiredCloak.control, resolveKey, leases: [{ browserKey: 'bk-00000001', profileId: 'bp-2' }], inputs: { 'bk-00000001|bp-2': { input: 'user' } }, by: { kind: 'user' } });
  ok(g7.ok && g7.mode === 'proposal' && /driving/.test(g7.reason), 'a profile somebody is DRIVING is never interrupted — even the user\'s switch becomes a proposal');
  ok(SW.switchVerdict({ profile: local, target: 'chromium', rowOf: B.providerRow, controlOf: B.providerControl }).code === 'switch_noop' && SW.switchVerdict({ profile: local, target: 'cdp', rowOf: B.providerRow, controlOf: B.providerControl, capabilityRefusalOf: B.capabilityRefusal }).code === 'switch_refused' && SW.switchVerdict({ profile: local, target: 'cloud:kernel', rowOf: B.providerRow, controlOf: B.providerControl, resolveKey }).code === 'switch_export_only' && SW.switchVerdict({ profile: local, target: 'nope', rowOf: B.providerRow, controlOf: B.providerControl }).code === 'provider_unknown', 'noop / cdp (a second profile, canSwitchTo no) / cloud:* (export-only, naming the lossy path) / unknown are each named');
  const rows = SW.switcherRows({ profile: local, providerIds: B.providerIds(), rowOf: wiredCloak.row, controlOf: wiredCloak.control, capabilityRefusalOf: B.capabilityRefusal, sources: (id) => (id === 'cloak' ? { source: 'cluster', clusterLabel: 'Team' } : { source: 'none' }), seats: {}, majors: {}, now: NOW });
  const rc = rows.find((r) => r.id === 'cloak'), rk = rows.find((r) => r.id === 'cloud:kernel'), rch = rows.find((r) => r.id === 'chromium');
  ok(rows.length === B.providerIds().length && rch.current && rc.enabled && /cluster default · Team \(seats shared/.test(rc.sourceLabel) && rc.seats.state === 'unknown' && rk.enabled === false && rk.sourceLabel === 'not configured' && rk.code === 'switch_export_only' && rk.action && rk.action.openIntegration === 'cloud:kernel', 'switcherRows: every backend with its verdict WRITTEN ON IT, the SOURCE chip from the masked view, seats per key row, the one-click action on a not-configured row');
}

// ═══ ② ORCH: the key consumer over a REAL integration store ════════════════
console.log('— ② browser-backend: six runners registered, keyFor = the literal resolve, sourceOf never carries a value, cloak zero-network');
const fakeEnv = {};
const store = IS.create({ dataDir: path.join(ROOT, 'integ'), env: fakeEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } });
{
  const fetches = [];
  const backend = BB.create({ integrations: store, fetchImpl: async (url, init) => { fetches.push({ url, init }); return { status: 200 }; }, log: { warn() {} } });
  const ids = backend.registerTests();
  ok(ids.length === 6 && SW.KEY_IDS.every((id) => store.hasTestRunner(id)), 'all six rows register a runner with the real store (leg v)');
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-backend.js'), 'utf8');
  ok(SW.KEY_IDS.every((id) => src.includes(`resolveIntegration('${id}')`)), 'the literal per-row resolveIntegration table is what the shared census reads (one module declares, registers and resolves)');
  ok(!store.hasTestRunner('lark'), 'NEGATIVE CONTROL: a row this track does not consume (lark) has no runner from it');
  // precedence: user > cluster > none, over ONE fixture (leg iii)
  ok(backend.keyFor('cloak').source === 'none' && backend.sourceOf('cloak').source === 'none', 'nothing configured ⇒ source none (both the resolve and the chip)');
  fakeEnv.VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY = 'cb_clusterkey000000';
  const kc = backend.keyFor('cloak');
  ok(kc.source === 'cluster' && kc.values.licenseKey === 'cb_clusterkey000000' && kc.clusterKey === 'default', 'the cluster default ⇒ source cluster (read from the env at the moment of the question)');
  store.setIntegration('cloak', { licenseKey: 'cb_userkey0000000000' });
  const ku = backend.keyFor('cloak');
  ok(ku.source === 'user' && ku.values.licenseKey === 'cb_userkey0000000000', "the user's own key wins over the cluster default");
  const so = backend.sourceOf('cloak');
  ok(so.source === 'user' && !('values' in so) && !JSON.stringify(so).includes('cb_userkey'), 'sourceOf (the chip) carries the source and never a value — asserted on the RETURNED object');
  ok(!JSON.stringify(store.publicView('cloak')).includes('cb_userkey0000000000') && store.publicView('cloak').masked.licenseKey === '••••0000', 'publicView masks the secret (leg iii)');
  ok(backend.resolveCount() === 3, 'each keyFor is exactly ONE store resolve');
  // cloak's Test is zero-network (leg vii): no fetch, no spawn
  const cp = require('node:child_process');
  const spawns = [];
  const orig = { spawn: cp.spawn, execFile: cp.execFile, spawnSync: cp.spawnSync, execFileSync: cp.execFileSync };
  for (const k of Object.keys(orig)) cp[k] = (...a) => { spawns.push([k, a[0]]); return orig[k](...a); };
  const before = fetches.length;
  const t1 = await store.test('cloak');
  for (const k of Object.keys(orig)) cp[k] = orig[k];
  ok(t1.ok === true && t1.kind === 'shape-only' && fetches.length === before && spawns.length === 0 && /free tier|cb_ key present/.test(JSON.stringify(t1.detail)), "cloak's Test: ok, zero fetches, zero child processes, zero bytes (the tier is not read here)");
  store.setIntegration('cloak', { licenseKey: '' });
  delete fakeEnv.VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY;
  fakeEnv.VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY = 'notacloakkey';
  const t2 = await store.test('cloak');
  ok(t2.ok === false && /validate: licenseKey/.test(t2.error) && /cb_/.test(t2.error), 'a malformed key ⇒ a named validate complaint');
  delete fakeEnv.VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY;
  ok(fetches.length === before, 'CONTROL: a runner that started cloakserve or fetched would have been counted — cloak did neither');
  // the egress declaration is DERIVED (leg vi): the host follows the row's own field
  store.setIntegration('cloud:browserless', { apiKey: 'k'.repeat(20), apiUrl: 'https://chrome.example.net' });
  const t3 = await store.test('cloud:browserless');
  store.setIntegration('cloud:browserless', { apiUrl: 'https://other.example.org' });
  const t4 = await store.test('cloud:browserless');
  const hosts = fetches.slice(before).map((f) => new URL(f.url).host);
  ok(t3.ok && t4.ok && hosts.length === 2 && hosts[0] === 'chrome.example.net' && hosts[1] === 'other.example.org', 'browserless driven twice with two apiUrls ⇒ the host the runner reached FOLLOWED the field (derived, never a constant)');
  ok(fetches.slice(before).every((f) => f.init.headers.Authorization === 'Bearer ' + 'k'.repeat(20) && !f.url.includes('k'.repeat(20))), 'the key rode a header on both, never the URL');
  const expectedHosts = Object.fromEntries(SW.KEY_IDS.map((id) => [id, SW.testHostFor(id, { apiUrl: 'https://chrome.example.net', endpoint: 'https://k.example.com', region: 'us-east-1' }).host]));
  ok(expectedHosts.cloak === null && expectedHosts['cloud:browserbase'] === 'api.browserbase.com' && expectedHosts['cloud:browserless'] === 'chrome.example.net' && expectedHosts['cloud:kernel'] === 'k.example.com' && expectedHosts['cloud:browseruse'] === 'api.browser-use.com' && expectedHosts['cloud:agentcore'] === 'bedrock-agentcore.us-east-1.amazonaws.com', 'the set of hosts the runners can reach equals exactly the set §7.5\'s rule derives');
  store.setIntegration('cloud:kernel', { apiKey: 'k'.repeat(20) });
  const t5 = await store.test('cloud:kernel');
  ok(t5.ok === false && /host_underivable|endpoint you typed|set endpoint/.test(t5.error) && fetches.length === before + 2, 'kernel with no endpoint ⇒ a NAMED refusal and NO request (never a default host)');
  store.setIntegration('cloud:kernel', { apiKey: '' });
  store.setIntegration('cloud:browserless', { apiKey: '', apiUrl: '' });
  // (i) a consumer never reads env itself: the real agentEnv drops the cluster forms, and the vendor names are the trap
  const { agentEnv } = require('../src/agent-env.js');
  // the NAMES come from the store itself: a Proxy env records every key the
  // resolver asks the environment for while it resolves the six key rows —
  // no builder call and no spelled name here (test-integration-registry's two
  // censuses keep envFieldName and the VIBESPACE_INTEGRATION_* spellings inside
  // src/server/integration-store.js), so the set below is whatever a cluster
  // could really inject, as the store would really read it.
  const asked = new Set();
  const spyEnv = new Proxy({}, { get: (_, k) => { if (typeof k === 'string') asked.add(k); return undefined; }, has: () => false });
  const probe = IS.create({ dataDir: path.join(ROOT, 'integ-probe'), env: spyEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } });
  for (const id of SW.KEY_IDS) probe.resolveIntegration(id);
  const injected = Object.fromEntries([...asked].map((k) => [k, 'secret-' + k]));
  const a = agentEnv({ HOME: '/h', PATH: '/bin', ...injected });
  ok(Object.keys(injected).length >= 9 && Object.keys(injected).every((k) => !(k in a)) && a.HOME === '/h', 'a full set of fake provider keys under the cluster\'s names never reaches an agent child (real agentEnv)');
  const vendorInjected = Object.fromEntries(SW.VENDOR_ENV_NAMES.map((n) => [n, 'leak']));
  const b = agentEnv({ HOME: '/h', ...vendorInjected });
  ok(SW.VENDOR_ENV_NAMES.every((n) => b[n] === 'leak'), 'NEGATIVE CONTROL: the same keys injected under the VENDOR\'S OWN names pass straight through agentEnv — which is exactly why the cluster may inject only under the store\'s prefix');
}

// ═══ ③ the REAL keeper over the fake binary ═════════════════════════════════
console.log('— ③ the keeper: the three named refusals, the tier + major read back, a real in-place switch, browser_restarting, a proposal');
let clock = 1_800_000_000_000;
const settings = { 'browser.cloak.executablePath': '' };
const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b';
const wired = { row: (id) => (id === 'cloak' ? { ...B.providerRow('cloak'), wired: true } : B.providerRow(id)), control: (id, o) => (id === 'cloak' && !(o && o.host) ? { ok: true, row: { ...B.providerRow('cloak'), wired: true } } : B.providerControl(id, o)) };
function mkKeeper({ liveKeys = new Set([KEY_A, KEY_B]), providers = wired, dataDir = DATA, envPath = PATH_ENV } = {}) {
  const backend = BB.create({ integrations: store, log: { warn() {} } });
  return { keeper: K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: envPath, HOME, FAKE_AB_STATE: AB_STATE, FAKE_AB_CDP_PORT: process.env.FAKE_AB_CDP_PORT }), serverSetting: (k) => settings[k], liveKeys: () => liveKeys, install: false, now: () => clock, log: { log() {}, warn() {}, error() {} }, integrations: store, keys: backend, providers, hostKnown: () => false }), backend };
}
{
  const { keeper: k, backend } = mkKeeper();
  const p = k.createProfile({ label: 'Vendor portal' }, { owner: { kind: 'instance', id: null } }); // instance-owned so TWO conversations may lease it (sharing 'owner' admits the owner's kind)
  ok(p.provider === 'chromium' && p.fingerprintSeed === null && p.defaultBackend === null && fs.existsSync(p.dir), 'a chromium profile: no seed, no default backend, a real directory');
  // (1) backend_unavailable: the PURE table says cloak is unwired (binary_absent)
  const { keeper: k0 } = mkKeeper({ providers: null, dataDir: path.join(ROOT, 'data0') });
  const p0 = k0.createProfile({ label: 'Plain' }, { owner: { kind: 'instance', id: null } });
  const e0 = await threw(() => k0.switchBackend({ profileId: p0.id, target: 'cloak', by: { kind: 'user' } }));
  ok(e0 && e0.code === 'backend_unavailable' && /binary_absent/.test(e0.message) && e0.missing === 'cloakbrowser' && launches().length === 0, '(1) backend_unavailable: the unwired row is refused by name, nothing spawned');
  // (2) backend_no_key: cloak wired, nothing configured
  const e1 = await threw(() => k.switchBackend({ profileId: p.id, target: 'cloak', by: { kind: 'user' } }));
  ok(e1 && e1.code === 'backend_no_key' && e1.action && e1.action.openIntegration === 'cloak' && launches().length === 0 && k.profile(p.id).provider === 'chromium', '(2) backend_no_key: named, carries the one-click way out, spawns nothing, the profile stays on chromium (never a silent fallback)');
  // with a cluster key but no binary on PATH and no setting: unavailable naming cloakbrowser
  fakeEnv.VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY = 'cb_clusterkey000000';
  const { keeper: kNoBin } = mkKeeper({ dataDir: path.join(ROOT, 'data-nobin'), envPath: `${NODE_DIR}:/usr/bin:/bin` }); // the keeper's OWN env has no cloakbrowser on PATH
  const pNoBin = kNoBin.createProfile({ label: 'Cloak box', provider: 'cloak' }, { owner: { kind: 'instance', id: null } }); // through the keeper's own door (a push before ensureLoaded is replaced by the load)
  const eNoBin = await threw(() => kNoBin.start(pNoBin.id));
  ok(eNoBin && eNoBin.code === 'backend_unavailable' && /cloakbrowser is not installed/.test(eNoBin.message), 'with the row wired and a key present but no cloakbrowser binary ⇒ backend_unavailable naming what is missing (nothing downloaded)');
  // attach two sessions on chromium, record their URLs, then SWITCH
  const a1 = await k.attach({ profileId: p.id, browserKey: KEY_A, sessionId: 'sess-a' });
  const a2 = await k.attach({ profileId: p.id, browserKey: KEY_B, sessionId: 'sess-b' });
  ok(a1.created && a2.created && launches().length === 1 && launches()[0].exe === null && launches()[0].vendor.cloak === null, 'two sessions attached to one chromium browser: one launch, no executable path, no vendor key');
  ok(k.noteLeaseUrl(KEY_A, p.id, 'https://portal.example/inbox') && k.noteLeaseUrl(KEY_B, p.id, 'https://portal.example/settings') && k.noteUserUrl(KEY_A, p.id, 'https://portal.example/inbox2') === false, 'each lease records its tab\'s last URL (noteUserUrl stamps it too, even with no input state)');
  ok(k.profile(p.id).lastChromiumMajor === 146 && k._reg().majors.chromium.major === 146, 'the Chromium MAJOR was read back from the launch\'s /json/version and recorded on the profile + per backend');
  const leaseRefs = k._reg().leases.filter((l) => l.profileId === p.id);
  const pidBefore = launches()[0].pid;
  // an AGENT proposing while the other session holds a lease ⇒ proposal, nothing moves
  const prop = await k.switchBackend({ profileId: p.id, target: 'cloak', by: { kind: 'agent' }, browserKey: KEY_A });
  ok(prop.ok && prop.mode === 'proposal' && /other session/.test(prop.reason) && prop.affected.length === 2 && closes().length === 0 && k.profile(p.id).provider === 'chromium' && /switch "Vendor portal" from chromium to cloak/.test(prop.text), "the agent's switch while KEY_B holds a lease ⇒ a proposal (text + detail for the inbox), nothing stopped");
  // the switcher's view
  const view = k.switcherView(p.id);
  const vc = view.rows.find((r) => r.id === 'cloak');
  ok(view.chip === 'chromium 146' && vc.enabled && /cluster default/.test(vc.sourceLabel) && vc.seats.state === 'unknown' && view.versions.recorded === 146 && view.leases.length === 2, 'switcherView: the chip, the cloak row enabled with its cluster-default source chip, seats unknown, the versions the ladder read');
  // THE SWITCH (the user's act): stop → same dir + carried seed → re-open per lease → re-pin → targetId rewritten
  const sw = await k.switchBackend({ profileId: p.id, target: 'cloak', by: { kind: 'user' }, makeDefault: true });
  const L = launches();
  const O = opens();
  ok(sw.ok && sw.mode === 'switch' && sw.from === 'chromium' && sw.to === 'cloak' && Number.isInteger(sw.seed) && sw.seedMinted, 'the switch completed chromium → cloak with a minted seed');
  ok(closes().length === 1 && L.length === 2 && L[1].pid !== pidBefore && L[1].profile === p.dir && L[1].exe === CLOAK_EXE && L[1].args === `--fingerprint=${sw.seed}` && L[1].vendor.cloak === 'cb_clusterkey000000', 'step 2+3: the chromium browser was STOPPED, the new one started on the SAME directory with the cloakbrowser binary, the seed and the licence key in its env only');
  ok(!JSON.stringify(process.env).includes('cb_clusterkey000000') && !L[1].args.includes('cb_'), "the parent's environment never carried the vendor name and the key never rode argv (leg ii)");
  const reopened = O.filter((o) => o.url !== 'about:blank');
  ok(reopened.length === 2 && reopened.some((o) => o.session === 'vs-' + KEY_A && o.url === 'https://portal.example/inbox2' && o.pinTab) && reopened.some((o) => o.session === 'vs-' + KEY_B && o.url === 'https://portal.example/settings' && o.pinTab), 'step 4: ONE tab re-opened per lease at its own lastUrl (the LAST one reported — the live view\'s inbox2 outranks the earlier inbox), under its own session name, re-pinned');
  const after = k._reg().leases.filter((l) => l.profileId === p.id);
  ok(after.length === 2 && after.every((l) => leaseRefs.includes(l)) && after.every((l) => l.targetId && /^t-/.test(l.targetId)) && sw.reopened.every((r) => r.ok && r.targetId), 'step 5: the lease OBJECTS were never destroyed — only targetId was re-minted (written back from the re-open)');
  const pp = k.profile(p.id);
  ok(pp.provider === 'cloak' && pp.fingerprintSeed === sw.seed && pp.defaultBackend === 'cloak' && pp.lastChromiumMajor === 146 && pp.lastSwitchAt === clock, 'the profile records the new backend, the seed, the per-profile default and the major');
  ok(k._reg().seats.cloak && k._reg().seats.cloak.tier === 'free' && k._reg().seats.cloak.total === 1 && k._reg().seats.cloak.source === 'cluster' && k.seatStates().cloak.state === 'known-fresh' && k.seatStates().cloak.used === 1, 'the seat TIER was read back from the first real launch (free, 1) and is now known-and-fresh with used = 1 on this instance');
  ok(k.chipFor(pp) === 'cloak 146 (free)', 'the chip now reads `cloak 146 (free)`');
  // a switch BACK: cloak → chromium is a downgrade? both 146 ⇒ ok; seed kept on the record
  const back = await k.switchBackend({ profileId: p.id, target: 'chromium', by: { kind: 'user' } });
  ok(back.ok && back.to === 'chromium' && k.profile(p.id).fingerprintSeed === sw.seed && /new device/.test(back.fingerprint) && launches().length === 3 && launches()[2].exe === null, 'switching back keeps the seed on the record (carried, never re-minted) and says the site sees a new device');
  // the version ladder on a REAL directory: the dir's own Last Version outranks the registry
  fs.writeFileSync(path.join(p.dir, 'Last Version'), '151.0.7100.0\n');
  const dg = await threw(() => k.switchBackend({ profileId: p.id, target: 'cloak', by: { kind: 'user' } }));
  ok(dg && dg.code === 'downgrade_refused' && /151/.test(dg.message) && dg.waysOut.length === 2 && k.profile(p.id).provider === 'chromium' && launches().length === 3, 'a directory whose own "Last Version" is 151 refuses the free tier\'s 146 BEFORE a byte moves (registry said 146, the dir wins — the HIGHER)');
  fs.unlinkSync(path.join(p.dir, 'Last Version'));
  // browser_restarting mid-switch: slow the fake's open, attach concurrently
  fs.writeFileSync(path.join(AB_STATE, 'slow-ms'), '400'); // a FILE flag: the keeper's child env was captured at creation
  const swP = k.switchBackend({ profileId: p.id, target: 'cloak', by: { kind: 'user' } });
  await sleep(60);
  const mid = await threw(() => k.attach({ profileId: p.id, browserKey: KEY_A, sessionId: 'sess-a' }));
  const midResolve = k.resolveFor({ browserKey: KEY_A });
  await swP;
  fs.rmSync(path.join(AB_STATE, 'slow-ms'), { force: true });
  ok(mid && mid.code === 'browser_restarting' && /lease survives/.test(mid.message), 'an attach during the switch answers the NAMED browser_restarting (never a timeout)');
  ok(midResolve && midResolve.ok === false && midResolve.code === 'browser_restarting' && Array.isArray(midResolve.handles), 'a CLI resolve during the switch answers browser_restarting with the handles');
  ok(k.profile(p.id).provider === 'cloak' && k._reg().leases.filter((l) => l.profileId === p.id).length === 2, 'the lease table survived the whole round trip');
  // (3) backend_seat_taken: a licence/concurrency launch failure under the cluster default
  await k.stop(p.id, { why: 'user' });
  fs.writeFileSync(path.join(AB_STATE, 'fail-license'), '1');
  const st = await threw(() => k.start(p.id));
  fs.rmSync(path.join(AB_STATE, 'fail-license'), { force: true });
  ok(st && st.code === 'backend_seat_taken' && /cluster default/.test(st.message) && /shared fleet-wide/.test(st.message) && st.action && st.action.openIntegration === 'cloak' && /own key/.test(st.action.label), '(3) backend_seat_taken: the launch failure is classified, names the provider, says the key is the cluster default with fleet-wide seats, offers "use my own key"');
  ok(k.browserOf(p.id).state === 'failed' && /cluster default/.test(k.browserOf(p.id).lastError), 'the browser record carries the classified reason');
  // (viii) keyScope on a remote profile: refused, nothing resolved
  const resolvesBefore = backend.resolveCount();
  k._reg().profiles.push({ ...B.newProfileRecord({ id: 'bp-0000eeee', label: 'Remote box', dir: null, provider: 'chromium', host: 'dev-1', now: clock }) });
  const rem = await threw(() => k.switchBackend({ profileId: 'bp-0000eeee', target: 'cloak', by: { kind: 'user' } }));
  ok(rem && rem.code === 'provider_needs_local_key' && backend.resolveCount() === resolvesBefore && launches().length === 4, 'host != null switching to cloak ⇒ provider_needs_local_key: resolved nothing, spawned nothing, handed nothing to any transport (leg viii)');
  // blocked claims + site hints on the keeper
  const bl = k.blocked({ url: 'https://portal.example/login', why: 'captcha', evidence: 'HTTP 403', browserKey: KEY_A, sessionId: 'sess-a', profileId: p.id });
  ok(bl.claim.by === 'agent' && bl.claim.host === 'portal.example' && k.blockedFor({ profileId: p.id }).length === 1 && k.list().blocked.length === 1 && /the agent says this page is blocked/.test(k.list().blocked[0].text), 'a blocked claim is recorded with who made it and rides the digest');
  const h = k.addSiteHint({ host: 'portal.example', backend: 'cloak', why: 'needs cloak', by: 'user' });
  ok(h.by === 'user' && k.siteHints().length === 1 && k.list().siteHints[0].host === 'portal.example', 'a site hint by the user is stored and broadcast');
  const bad = await threw(async () => k.addSiteHint({ host: 'portal.example', backend: 'cloak', tier: 2, by: 'agent' }));
  ok(bad && bad.code === 'hint_tier_with_backend', 'the keeper refuses a hint carrying both a backend and a tier');
  ok(k.dropSiteHint('https://portal.example/x') === true && k.siteHints().length === 0 && k.clearBlocked(bl.claim.id) === true && k.blockedFor({}).length === 0, 'hints and claims can be removed by the user');
  // boot reconciliation drops a dead conversation's claims
  k.blocked({ url: 'https://x.example', browserKey: 'bk-0000dead', sessionId: 'sess-d', profileId: p.id });
  k.reconcile({ graceMs: 0 });
  ok(k.blockedFor({}).length === 0, 'a dead conversation\'s blocked claims go with it at boot');
  await k.stop(p.id, { why: 'user' }).catch(() => {});
  delete fakeEnv.VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY;
}

// ═══ ④ routes + the shipped CLI ═════════════════════════════════════════════
console.log('— ④ the routes and the CLI: switcher, switch, backend, blocked, site hints');
{
  const express = require('express');
  const RT = require('../src/routes/browser.js');
  const { keeper: kR } = mkKeeper({ dataDir: path.join(ROOT, 'data-routes') });
  const TOKEN_A = 'vsst_' + 'a'.repeat(24), TOKEN_B = 'vsst_' + 'b'.repeat(24);
  const active = new Map([['sess-a', { agentToken: TOKEN_A, _browserKey: KEY_A, name: 'A' }], ['sess-b', { agentToken: TOKEN_B, _browserKey: KEY_B, name: 'B' }]]);
  const proposals = [];
  const app = express(); app.use(express.json());
  RT.setup({ keeper: kR, activeSessions: active, browserEnv: () => null, cloakPlan: () => B.cloakservePlan({ enabled: false }), forwards: () => [], propose: (sid, s, item) => { proposals.push({ sid, ...item }); return { id: 'ut-1' }; } });
  app.use(RT.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  servers.add(srv);
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p, body, headers = {}) => {
    const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, json };
  };
  const bearer = (t) => ({ Authorization: 'Bearer ' + t });
  const pr = kR.createProfile({ label: 'Route portal' }, { owner: { kind: 'instance', id: null } }); // instance-owned so two conversations may lease it
  let r = await j('GET', `/api/browser/switcher?profile=${pr.id}`);
  ok(r.status === 200 && r.json.chip === 'chromium' && r.json.rows.length === B.providerIds().length && r.json.rows.find((x) => x.id === 'cloak').enabled === false && r.json.rows.find((x) => x.id === 'cloak').code === 'backend_no_key' && r.json.rows.find((x) => x.id === 'cloak').action.openIntegration === 'cloak' && r.json.seats.cloak.state === 'unknown', 'GET /api/browser/switcher: every row with its verdict; with no key the cloak row is disabled with backend_no_key + the openIntegration action written on it');
  r = await j('POST', '/api/browser/switch', { profile: pr.id, provider: 'cloak' });
  ok(r.status === 409 && r.json.code === 'backend_no_key' && r.json.action.openIntegration === 'cloak' && r.json.provider === 'cloak' && r.json.integrationId === 'cloak', 'POST /api/browser/switch with no key ⇒ 409 backend_no_key carrying the actionable way out');
  r = await j('POST', '/api/browser/switch', { profile: pr.id, provider: 'cloud:kernel' });
  ok(r.status === 400 && r.json.code === 'switch_export_only' && /vibespace-browser new/.test(r.json.error), 'a cloud target ⇒ 400 switch_export_only naming the lossy path');
  r = await j('POST', '/api/browser/switch', { profile: 'nope', provider: 'cloak' });
  ok(r.status === 404 && r.json.code === 'not-found', 'an unknown profile ⇒ 404');
  // the agent side
  r = await j('GET', '/api/agent/browser/backend', undefined, bearer(TOKEN_A));
  ok(r.status === 409 && r.json.code === 'no_profile' && /ephemeral/.test(r.json.error), 'GET /api/agent/browser/backend with no attachment ⇒ no_profile (a backend is a property of a PROFILE) with the remedy');
  r = await j('POST', '/api/agent/browser/use', { profile: pr.id }, bearer(TOKEN_A));
  ok(r.status === 200, 'the agent attaches');
  r = await j('POST', '/api/agent/browser/audit', { profile: pr.id, verb: 'open', ok: true, url: 'https://portal.example/start' }, bearer(TOKEN_A));
  ok(r.status === 200 && kR._reg().leases.find((l) => l.profileId === pr.id && l.browserKey === KEY_A).lastUrl === 'https://portal.example/start', 'POST /api/agent/browser/audit with a url stamps the lease\'s lastUrl (what a switch re-opens); the audit line itself stays verb-only');
  r = await j('GET', '/api/agent/browser/backend', undefined, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.profile.id === pr.id && r.json.chip === 'chromium 146' && r.json.attachments.length === 1 && r.json.attachments[0].chip === 'chromium 146' && r.json.me === KEY_A, 'GET /api/agent/browser/backend: the profile, its chip, every attachment with its chip');
  fakeEnv.VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY = 'cb_clusterkey000000';
  await j('POST', '/api/agent/browser/use', { profile: pr.id }, bearer(TOKEN_B));
  r = await j('POST', '/api/agent/browser/backend', { provider: 'cloak' }, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.mode === 'proposal' && r.json.filed === true && proposals.length === 1 && proposals[0].sid === 'sess-a' && /Browser backend: switch "Route portal"/.test(proposals[0].text) && /agent proposes/.test(proposals[0].detail) && kR.profile(pr.id).provider === 'chromium', "the agent's switch while B holds a lease ⇒ mode proposal, ONE 'For you' item filed under the proposing session, nothing switched");
  await j('POST', '/api/agent/browser/detach', { profile: pr.id }, bearer(TOKEN_B));
  r = await j('POST', '/api/agent/browser/backend', { provider: 'cloak' }, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.mode === 'switch' && r.json.to === 'cloak' && r.json.chip === 'cloak 146 (free)' && r.json.reopened.length === 1 && kR.profile(pr.id).provider === 'cloak', 'alone on the profile, the agent\'s switch is direct: chromium → cloak, its tab re-opened');
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://portal.example/login', why: 'captcha', evidence: 'HTTP 403', remember: true }, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.claim.by === 'agent' && r.json.claim.browserKey === KEY_A && r.json.claim.profileId === pr.id && /the agent says/.test(r.json.text) && r.json.remembered && r.json.remembered.tier === 2 && r.json.remembered.backend === null && r.json.remembered.by === 'agent' && /THEIR act/.test(r.json.next), 'POST /api/agent/browser/blocked: a claim by the agent, remembered as a tier-only hint (never an auto-escalation), the answer says the switch is the user\'s act');
  r = await j('GET', '/api/browser/site-hints');
  ok(r.status === 200 && r.json.siteHints.length === 1 && r.json.siteHints[0].host === 'portal.example', 'GET /api/browser/site-hints lists it');
  r = await j('POST', '/api/browser/site-hints', { url: 'https://bank.example/x', tier: 3, why: 'step-up' });
  ok(r.status === 200 && r.json.hint.by === 'user' && r.json.hint.tier === 3, 'the user adds a tier-3 hint');
  r = await j('POST', '/api/browser/site-hints', { site: 'bank.example', tier: 3, backend: 'cloak' });
  ok(r.status === 400 && r.json.code === 'hint_tier_with_backend', 'a hint with both is refused 400 by name');
  r = await j('POST', '/api/browser/site-hints', { host: 'bank.example', tier: 3 });
  ok(r.status === 400 && r.json.code === 'unsupported-host', 'CONTROL: `host` on this route is the MACHINE parameter (refused by name like every browser route) — the site rides `site`');
  r = await j('DELETE', '/api/browser/site-hints/bank.example');
  ok(r.status === 200 && r.json.removed === true && r.json.siteHints.length === 1, 'DELETE removes it');
  const digest = kR.list();
  ok(digest.blocked.length === 1 && digest.chips[pr.id] === 'cloak 146 (free)' && digest.seats.cloak.state === 'known-fresh', 'the digest carries the claim, the chip and the seat state (the multi-client broadcast payload)');
  r = await j('DELETE', `/api/browser/blocked/${digest.blocked[0].id}`);
  ok(r.status === 200 && r.json.removed === true, 'the user dismisses the claim');
  // the shipped CLI
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: TOKEN_A };
  const cli = (args, env = {}) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...cliEnv, ...env }, encoding: 'utf8', timeout: 20000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') + (err && typeof err.code !== 'number' ? `\n[spawn error] ${err.message}` : '') })));
  const bk = await cli(['backend']);
  ok(bk.status === 0 && /backend: cloak 146 \(free\)/.test(bk.stdout) && /\* cloak/.test(bk.stdout) && /✗ cloud:kernel/.test(bk.stdout) && /not configured/.test(bk.stdout) && /seats: 1 used on this instance/.test(bk.stdout) && /USER's act/.test(bk.stdout), 'vibespace-browser backend prints the current backend, every row with its verdict, the source chips and the seats', bk.stdout + bk.stderr);
  const bk2 = await cli(['backend', 'chromium']);
  ok(bk2.status === 0 && /switched cloak → chromium/.test(bk2.stdout) && /1 tab\(s\) re-opened/.test(bk2.stdout), 'vibespace-browser backend chromium switches back (alone on the profile)', bk2.stdout + bk2.stderr);
  delete fakeEnv.VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY;
  const bk3 = await cli(['backend', 'cloak']);
  ok(bk3.status === 1 && /backend_no_key/.test(bk3.stderr) && /Integrations → cloak/.test(bk3.stderr), 'with no key the CLI prints the named refusal and the way out', bk3.stdout + bk3.stderr);
  const bl = await cli(['blocked', '--url', 'https://portal.example/login', '--why', 'captcha']);
  ok(bl.status === 0 && /recorded your claim: the agent says this page is blocked \(portal.example: captcha\)/.test(bl.stdout) && /THEIR act/.test(bl.stdout), 'vibespace-browser blocked records the claim and says the switch is the user\'s act', bl.stdout + bl.stderr);
  const bl2 = await cli(['blocked']);
  ok(bl2.status === 2 && /usage: vibespace-browser blocked --url/.test(bl2.stderr), 'blocked without --url prints usage');
  await kR.stop(pr.id, { why: 'user' }).catch(() => {});
}

// ═══ ⑤ §7.4 failure form (1): the INSTALL action — "measure first, then install" ═══
console.log('— ⑤ the install action: the PURE verdict over the §7.2.1 record, the keeper over a fake npm, rung 3, the routes');
{
  const refused = B.CLOAK_EGRESS_PROOF;
  const measured = { ...refused, status: 'measured', refusal: undefined, blocks: undefined, detail: 'fixture', version: '0.5.10', runs: B.CLOAK_EGRESS_RUNS.map((what) => ({ what, inetConnects: 0 })) };
  ok(B.proofVerdict(refused).ok && B.proofVerdict(measured).ok, 'both fixtures pass the local-oracles discipline (the refused record is the shipped one)');
  // the PURE matrix
  const u = SW.installVerdict({ proof: refused, proofOk: B.proofVerdict(refused), exe: { ok: false } });
  ok(!u.ok && u.code === 'install_precondition_unmet' && /binary_absent/.test(u.error) && /measure first/.test(u.error) && u.proof.status === 'refused', 'the shipped record (refused: binary_absent) ⇒ install_precondition_unmet naming the record\'s own refusal and the way to measure');
  const m = SW.installVerdict({ proof: measured, proofOk: B.proofVerdict(measured), exe: { ok: false } });
  ok(m.ok && m.spec === 'cloakbrowser@0.5.10' && m.version === '0.5.10' && m.package === 'cloakbrowser', 'a measured record ⇒ ok with the spec PINNED to the version the measurement describes');
  ok(SW.installVerdict({ proof: { ...measured, version: null }, proofOk: { ok: true }, exe: { ok: false } }).code === 'install_precondition_unmet', 'a measured record naming no version ⇒ unmet (nothing to pin)');
  ok(SW.installVerdict({ proof: measured, proofOk: { ok: false, error: 'lacks the run "x"' }, exe: { ok: false } }).code === 'install_precondition_unmet', 'a record that fails its own discipline ⇒ unmet');
  ok(SW.installVerdict({ proof: null, exe: { ok: false } }).code === 'install_precondition_unmet', 'no record at all ⇒ unmet');
  const ai = SW.installVerdict({ proof: measured, proofOk: { ok: true }, exe: { ok: true, path: '/usr/local/bin/cloakbrowser' } });
  ok(!ai.ok && ai.code === 'already_installed' && ai.path === '/usr/local/bin/cloakbrowser', 'an executable that answers ⇒ already_installed naming the path (the executable rung outranks the record)');
  ok(SW.installVerdict({ proof: measured, proofOk: { ok: true }, exe: null, host: 'h1' }).code === 'install_local_only', 'host != null ⇒ install_local_only (a paired machine\'s binary is its own to install)');
  ok(SW.installVerdict({ proof: measured, proofOk: { ok: true }, exe: { ok: false }, running: true }).code === 'install_running', 'one install at a time');
  // the CONTROL the design names: an install that skips the measurement answers ok for the refused record — ours must not
  const skipsMeasurement = ({ exe }) => (exe && exe.ok ? { ok: false, code: 'already_installed' } : { ok: true, spec: 'cloakbrowser@latest' });
  ok(skipsMeasurement({ exe: { ok: false } }).ok === true && SW.installVerdict({ proof: refused, proofOk: B.proofVerdict(refused), exe: { ok: false } }).ok === false, 'NEGATIVE CONTROL: a verdict that ignores the record says ok (and unpinned) for the refused record; the shipped verdict refuses it');
  ok(JSON.stringify(SW.installArgv({ spec: 'cloakbrowser@0.5.10', prefix: '/p' })) === JSON.stringify(['install', '--prefix', '/p', '--no-audit', '--no-fund', '--no-save', 'cloakbrowser@0.5.10']), 'installArgv: into OUR prefix, pinned, never -g');
  let badSpec = null; try { SW.installArgv({ spec: 'cloakbrowser@0.5.10; rm -rf /', prefix: '/p' }); } catch (e) { badSpec = e; }
  ok(badSpec && /bad spec/.test(badSpec.message), 'a spec that is not a package spec is refused before any argv exists');
  ok(SW.binFromPackageJson({ bin: 'cli.js' }) === 'cli.js' && SW.binFromPackageJson({ bin: { other: 'a.js', cloakbrowser: 'bin/cb.js' } }) === 'bin/cb.js' && SW.binFromPackageJson({ bin: { only: 'x.js' } }) === 'x.js' && SW.binFromPackageJson({}) === null && SW.binFromPackageJson(null) === null, 'binFromPackageJson: the package\'s OWN bin — string, the preferred key, else the first — never a guessed name');
  // the REAL keeper over a FAKE npm on PATH (it records its argv under the prefix and installs a package whose bin is what rung 3 must find).
  // Its PATH deliberately lacks the suite's fake `cloakbrowser` (BIN carries one for the switch legs): the executable rung must answer NO first.
  const BIN2 = path.join(ROOT, 'bin-npm-only'); fs.mkdirSync(BIN2, { recursive: true });
  const PATH_NPM = `${BIN2}:${NODE_DIR}:${String(process.env.PATH || '').split(':').filter((d) => d && d !== BIN).join(':')}`;
  fs.writeFileSync(path.join(BIN2, 'npm'), `#!${process.execPath}
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2); const i = a.indexOf('--prefix'); const prefix = i >= 0 ? a[i + 1] : process.cwd();
fs.mkdirSync(prefix, { recursive: true }); fs.writeFileSync(path.join(prefix, 'npm-argv.json'), JSON.stringify(a));
const spec = a[a.length - 1]; const name = spec.split('@')[0]; const pkgDir = path.join(prefix, 'node_modules', name);
fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version: spec.split('@')[1], bin: { [name]: 'bin/cb.js' } }));
fs.writeFileSync(path.join(pkgDir, 'bin', 'cb.js'), '#!/bin/sh\\necho fake-cloak\\n', { mode: 0o755 });
process.stdout.write('fake npm installed ' + spec + '\\n');
`, { mode: 0o755 });
  const dataI = path.join(ROOT, 'data-install');
  const { keeper: kI } = mkKeeper({ dataDir: dataI, providers: wired, envPath: PATH_NPM });
  ok(!kI.cloakExecutable().ok, 'PRECONDITION: on the install keepers\' PATH no cloakbrowser answers (the executable rung says no)');
  const gv = kI.installVerdict();
  ok(!gv.ok && gv.code === 'install_precondition_unmet' && gv.prefix === path.join(dataI, 'browser-tools') && gv.state.running === false, 'the keeper\'s verdict over the SHIPPED record: unmet, naming the prefix it would use');
  const eI = await threw(() => kI.installCloak());
  ok(eI && eI.code === 'install_precondition_unmet' && !fs.existsSync(path.join(dataI, 'browser-tools', 'npm-argv.json')) && !kI.cloakExecutable().ok, 'installCloak() on the shipped record REFUSES by name and spawns nothing (no npm argv recorded, no executable appears)');
  const { keeper: kM } = mkKeeper({ dataDir: path.join(ROOT, 'data-install-m'), providers: { ...wired, proof: measured }, envPath: PATH_NPM });
  ok(kM.installVerdict().ok === true && kM.installVerdict().spec === 'cloakbrowser@0.5.10' && !kM.cloakExecutable().ok, 'with a MEASURED record the verdict is ok (spec pinned) while nothing is installed yet');
  const started = await kM.installCloak();
  ok(started.ok && started.started && started.spec === 'cloakbrowser@0.5.10' && started.prefix === kM.installDir && typeof started.pid === 'number', 'installCloak() starts ONE npm install and answers the spec, the prefix and the log');
  await new Promise((resolve, reject) => { const t0 = Date.now(); const iv = setInterval(() => { if (!kM.installVerdict().state.running) { clearInterval(iv); resolve(); } else if (Date.now() - t0 > 10000) { clearInterval(iv); reject(new Error('fake npm never exited')); } }, 20); });
  const argvRec = JSON.parse(fs.readFileSync(path.join(kM.installDir, 'npm-argv.json'), 'utf8'));
  ok(JSON.stringify(argvRec) === JSON.stringify(['install', '--prefix', kM.installDir, '--no-audit', '--no-fund', '--no-save', 'cloakbrowser@0.5.10']), 'the fake npm received exactly the pinned argv under the keeper\'s own prefix');
  const st2 = kM.installVerdict();
  ok(st2.state.exitCode === 0 && st2.state.error === null && st2.state.spec === 'cloakbrowser@0.5.10', 'the install state records the exit');
  const bin = kM.installedCloakBin();
  ok(bin === path.join(kM.installDir, 'node_modules', 'cloakbrowser', 'bin', 'cb.js') && kM.cloakExecutable().ok && kM.cloakExecutable().path === bin, 'rung 3: the executable is read from the installed package\'s OWN package.json bin and cloakExecutable() now answers it (setting empty, nothing on PATH)');
  ok(!st2.ok && st2.code === 'already_installed' && st2.path === bin, '…so the verdict flips to already_installed naming that path');
  const eM = await threw(() => kM.installCloak());
  ok(eM && eM.code === 'already_installed', 'a second installCloak() is refused by name');
  ok(!fs.existsSync(path.join(kI.installDir, 'node_modules')), 'CONTROL: the refused keeper\'s prefix still holds no package');
  // the routes: GET = the verdict (200 either way), POST = the act (typed 4xx on a refusal), host refused by name
  const express = require('express');
  const RT = require('../src/routes/browser.js');
  const app = express(); app.use(express.json());
  RT.setup({ keeper: kI, activeSessions: new Map(), browserEnv: () => null, cloakPlan: () => B.cloakservePlan({ enabled: false }), forwards: () => [], propose: () => ({ id: 'ut-x' }) });
  app.use(RT.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  servers.add(srv);
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p) => { const res = await fetch(API + p, { method }); let json = null; try { json = await res.json(); } catch { /* none */ } return { status: res.status, json }; };
  let r = await j('GET', '/api/browser/install');
  ok(r.status === 200 && r.json.ok === false && r.json.code === 'install_precondition_unmet' && /binary_absent/.test(r.json.error) && r.json.state && r.json.state.running === false, 'GET /api/browser/install: 200 with the verdict (a card renders the disabled control WITH its reason)');
  r = await j('POST', '/api/browser/install');
  ok(r.status === 409 && r.json.code === 'install_precondition_unmet' && !fs.existsSync(path.join(kI.installDir, 'npm-argv.json')), 'POST /api/browser/install on the shipped record ⇒ 409 by name, nothing spawned');
  r = await j('GET', '/api/browser/install?host=h1');
  ok(r.status === 400 && r.json.code === 'unsupported-host', 'host is the MACHINE parameter and a non-local one is refused by name');
  const pI = kI.createProfile({ label: 'Install portal' }, { owner: { kind: 'instance', id: null } });
  r = await j('GET', `/api/browser/switcher?profile=${pI.id}`);
  ok(r.status === 200 && r.json.install && r.json.install.ok === false && r.json.install.code === 'install_precondition_unmet', 'the switcher view carries the install verdict (the dialog reads it with no second fetch)');
  fs.rmSync(path.join(BIN2, 'npm'), { force: true });
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
