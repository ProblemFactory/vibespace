#!/usr/bin/env node
// AGENT BROWSER P4 second half — the live backend SWITCH and the key-consumer
// half (docs/design-agent-browser-v2.md §7.4 / §7.5 / §7.6, D17 / D32 / D33 /
// D34, round 8's clauses; §9's `test-browser-backend` row).
//
//   ① PURE (src/browser-switch.js): the version ladder over a matrix (target
//      ≥ / < / unrecorded, registry-vs-`Last Version` disagreement ⇒ the
//      HIGHER), SEATS AS THREE STATES (an unknown total never satisfies the
//      ceiling — controls that treat it as 0 and as ∞ are red; a stale
//      verdict degrades past SEAT_TIER_STALE_MS), the ceiling wording forked
//      on key source, the launch-failure classifier's SHAPE, the site hint
//      carrying WHO claimed it + `tier` legal only while backend === null,
//      `blocked` a CLAIM the server never manufactures, the 403/429 HINT, the
//      derived test host (constant / the field the user typed / the region),
//      the gate's ORDER (keyScope refused before any key is resolved).
//   ② ORCH (src/server/browser-backend.js): the five runners register through
//      a REAL integration store, keyFor is the literal per-row resolve, the
//      chip's sourceOf never carries a value.
//   ③ The REAL keeper over a FAKE `agent-browser`, switching a profile to the
//      fixture row (scripts/fixtures/browser-switcher-views.mjs — lane
//      engine-spi-egress L3: no shipped row is an in-place switch target any
//      more, so the machinery is driven over a synthetic one whose key lives
//      in a cloud row's integration): the three named refusals
//      (backend_unavailable / backend_no_key + action / backend_seat_taken
//      with the cluster wording), the Chromium major read back from a real
//      launch, a real in-place switch (stop → same dir → one tab re-opened
//      per lease at its lastUrl → re-pinned → targetId rewritten → the lease
//      OBJECT never destroyed), the browser_restarting refusal mid-way, a
//      proposal when another session holds a lease, the version ladder
//      refusing a downgrade on a real dir; ③b the dialog's server half and
//      the start-failure ROLLBACK.
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
import { wired, unwired, FIXTURE_ID, FIXTURE_INTEGRATION } from './fixtures/browser-switcher-views.mjs'; // the dialog's worlds over the synthetic in-place row, one spelling shared with the switch dialog's fixtures
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
/** a wait that names its effect (lane fast-debt-clear): poll `f` until it holds, at most `ms` — the assert after it judges */
const until = async (f, ms = 5000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await sleep(10); return f(); };

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
// key-bearing launch hands it (the vendor env NAME's presence, the
// `--executable-path` / `--args` / `-p` prefix), answers `open` with a minted
// targetId (logged per session), and fails on licence when told.
// lane fast-debt-clear: ~a quarter of this suite's ~100 binary calls are `--version` — a node start for one line, the
// suite's load-sensitive cost (4.1 s idle, 12.8 s on a busy box). The binary on PATH is a /bin/sh FRONT answering
// `--version` exactly as the node fake below does (the same line, no state touched) and exec-ing the node fake for every
// other call (the same argv, env, stdin and cwd — exec replaces the shell)
const FAKE_JS = path.join(ROOT, 'fake-agent-browser.cjs');
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!/bin/sh
if [ "$1" = "--version" ]; then echo 'agent-browser 0.38.0'; exit 0; fi
exec '${process.execPath}' '${FAKE_JS}' "$@"
`, { mode: 0o755 });
fs.writeFileSync(FAKE_JS, `const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
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
// agent-browser's own ENV names for the same two options (0.38.1 --help: "or AGENT_BROWSER_EXECUTABLE_PATH" /
// "or AGENT_BROWSER_ARGS") — a launch view that rides them rides EVERY call of its session
if (!prefix.exe && process.env.AGENT_BROWSER_EXECUTABLE_PATH) prefix.exe = process.env.AGENT_BROWSER_EXECUTABLE_PATH;
if (!prefix.args && process.env.AGENT_BROWSER_ARGS) prefix.args = process.env.AGENT_BROWSER_ARGS;
const [a, b] = argv;
const vendor = { browserbase: process.env.BROWSERBASE_API_KEY || null }; // the fixture row's key (its integration is a cloud row's)
// MEASURED on the real 0.38.1 (lane-cloak, 2026-09-28): a later call of the session whose launch view (executable + args)
// differs from the running browser's RELAUNCHES it — the fake does not relaunch, it LOGS the call that would have
const viewDiffers = (s) => s && (String(s.exe || '') !== String(prefix.exe || '') || String(s.args || '') !== String(prefix.args || ''));
const noteRelaunch = (s, verb) => { if (viewDiffers(s)) fs.appendFileSync(path.join(st, 'relaunches.log'), JSON.stringify({ ns, verb, running: { exe: s.exe, args: s.args }, call: { exe: prefix.exe, args: prefix.args } }) + '\\n'); };
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
// 'tab new <url>' = the keeper's re-open after a switch (lane-cloak: the binary's own recovery for a pinned session) — logged like 'open'
const tabNew = a === 'tab' && b === 'new';
if (a === 'open' || tabNew) {
  const url = tabNew ? argv[2] : b;
  let s = read();
  { let slow = 0; try { slow = Number(fs.readFileSync(path.join(st, 'slow-ms'), 'utf8')) || 0; } catch { } if (slow) { fs.writeFileSync(path.join(st, 'slow-began'), ns); const t = Date.now() + slow; while (Date.now() < t) {} } }
  if (!(s && alive(s.pid))) {
    if (fs.existsSync(path.join(st, 'fail-license'))) { process.stderr.write('fake: license validation failed — concurrent session limit reached for this key\\n'); process.exit(1); }
    if (fs.existsSync(path.join(st, process.env.BROWSERBASE_API_KEY ? 'fail-fixture' : 'fail-plain'))) { process.stderr.write('fake: segmentation fault on start\\n'); process.exit(1); } // the rebuilt dialog: a launch that fails for no licence reason
    const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref();
    s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null, ...prefix, vendor, session: process.env.AGENT_BROWSER_SESSION || null };
    fs.writeFileSync(f, JSON.stringify(s));
    fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n');
  }
  const n = (Number((read() || {}).opens) || 0) + 1; const cur = read() || s; cur.opens = n; fs.writeFileSync(f, JSON.stringify(cur));
  const targetId = 't-' + ns + '-' + n;
  fs.appendFileSync(path.join(st, 'opens.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, url, targetId, pinTab: prefix.pinTab, verb: tabNew ? 'tab new' : 'open' }) + '\\n');
  out({ success: true, data: { url, targetId } }); process.exit(0);
}
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } if (process.env.AGENT_BROWSER_SESSION === s.session) noteRelaunch(s, 'get cdp-url'); out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:' + (process.env.FAKE_AB_CDP_PORT || '19222') + '/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } fs.appendFileSync(path.join(st, 'closes.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, closed }) + '\\n'); out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const readLog = (name) => { try { return fs.readFileSync(path.join(AB_STATE, name), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const launches = () => readLog('launches.log');
const relaunches = () => readLog('relaunches.log');
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
console.log('— ① the version ladder, seats in three states, the ceiling fork, the classifier, hints, the claim, the gate');
{
  // the version ladder (§7.4's table)
  const up = SW.versionLadder({ target: FIXTURE_ID, targetMajor: 146, recordedMajor: 140, dirMajor: 140 });
  ok(up.ok && up.recordMajor === 146 && !up.disagreement, 'target ≥ the major that wrote the dir ⇒ switch, record the new major');
  ok(SW.versionLadder({ targetMajor: 146, recordedMajor: 146 }).ok, 'same major ⇒ switch');
  const down = SW.versionLadder({ target: 'chromium', targetMajor: 146, recordedMajor: 151, dirMajor: null });
  ok(!down.ok && down.code === 'downgrade_refused' && /151/.test(down.error) && /146/.test(down.error) && down.waysOut.length === 2 && /upgrade chromium/.test(down.waysOut[0]) && /non-extractable CryptoKeys/.test(down.waysOut[1]) && /WhatsApp/.test(down.waysOut[1]), 'target < the major that wrote it ⇒ REFUSED naming both versions, two ways out (upgrade / clone via export naming what it drops)');
  const dis = SW.versionLadder({ target: FIXTURE_ID, targetMajor: 148, recordedMajor: 146, dirMajor: 151 });
  ok(!dis.ok && dis.code === 'downgrade_refused' && dis.disagreement && dis.disagreement.taken === 151 && dis.wrote === 151, 'registry (146) vs Last Version (151) disagree ⇒ the HIGHER wins and refuses 148');
  const dis2 = SW.versionLadder({ target: FIXTURE_ID, targetMajor: 152, recordedMajor: 151, dirMajor: 146 });
  ok(dis2.ok && dis2.disagreement.taken === 151, 'the other disagreement direction takes the higher too, and 152 clears it');
  const unk = SW.versionLadder({ target: FIXTURE_ID, targetMajor: 146, recordedMajor: null, dirMajor: null });
  ok(!unk.ok && unk.code === 'downgrade_unknown' && unk.needsConfirm === true, 'no recorded major AND an unreadable dir ⇒ refuse the AUTOMATIC downgrade, one human confirmation required');
  ok(SW.versionLadder({ target: FIXTURE_ID, targetMajor: 146, recordedMajor: null, dirMajor: null, confirmed: true }).ok, '…and the confirmation lets it through');
  const tu = SW.versionLadder({ target: FIXTURE_ID, targetMajor: null, recordedMajor: 146 });
  ok(!tu.ok && tu.code === 'downgrade_unknown' && tu.needsConfirm && /not known yet/.test(tu.error), 'an UNKNOWN target major is never "old enough" — refuse without a confirmation (the floor rule)');
  ok(SW.majorOf('146.0.7000.1') === 146 && SW.parseLastVersion('151.0.7100.0\n') === 151 && SW.majorOfBrowserString('HeadlessChrome/146.0.7000.1') === 146 && SW.majorOf('') === null && SW.majorOfBrowserString('Fake/2.0') === null, 'majorOf / parseLastVersion / majorOfBrowserString read what the browser writes and answer null on nothing');
  ok(SW.chromiumMajorFor(FIXTURE_ID, { majors: { [FIXTURE_ID]: { major: 150 } } }) === 150 && SW.chromiumMajorFor('chromium', { majors: { chromium: { major: 140 } } }) === 140 && SW.chromiumMajorFor('chromium', {}) === null && SW.chromiumMajorFor(FIXTURE_ID, { majors: { chromium: { major: 140 } } }) === null, 'the target major: the one its last launch was seen writing, else unknown (never another backend\'s)');

  // seats: three states
  const NOW = 1_800_000_000_000;
  const fresh = SW.seatState({ tier: 'free', total: 1, at: NOW - 3 * 3600e3, now: NOW });
  const stale = SW.seatState({ tier: 'free', total: 1, at: NOW - SW.SEAT_TIER_STALE_MS - 1, now: NOW });
  const unknown = SW.seatState({ now: NOW });
  ok(fresh.state === 'known-fresh' && fresh.total === 1 && /3 h ago/.test(fresh.text), 'known-and-fresh carries the age of the reading ("tier read from a launch 3 h ago")');
  ok(stale.state === 'known-stale' && stale.total === null && stale.lastTotal === 1 && /no longer constrains/.test(stale.text), 'older than SEAT_TIER_STALE_MS ⇒ known-but-stale: says what the LAST tier was, degrades to unknown');
  ok(unknown.state === 'unknown' && unknown.total === null && /never a fabricated/.test(unknown.text) === false && /becomes known the first time this key actually launches/.test(unknown.text), 'never launched ⇒ unknown, with the sentence and never a number');
  const IID = FIXTURE_INTEGRATION;
  const sameFixture = (at) => SW.seatVerdict({ state: SW.seatState({ tier: 'free', total: 1, at, now: NOW }), used: 1, provider: FIXTURE_ID, source: 'user', holders: [{ profileId: 'bp-1', label: 'Vendor portal' }], integrationId: IID });
  ok(!sameFixture(NOW - 1000).ok && sameFixture(NOW - 1000).code === 'backend_seat_ceiling' && sameFixture(NOW - SW.SEAT_TIER_STALE_MS - 1).ok, 'the SAME fixture flips from refuse to allow once the clock passes SEAT_TIER_STALE_MS (a stale verdict degrades to unknown)');
  ok(SW.seatState({ tier: 'free', total: 1, at: NOW - 3600e3, now: NOW, staleMs: SW.SEAT_TIER_STALE_MS }).state === 'known-fresh' && SW.seatState({ tier: 'free', total: 1, at: NOW - 3600e3, now: NOW, staleMs: 1000 }).state === 'known-stale', 'CONTROL: the version that drops the age (staleMs tiny vs the constant) changes the answer — the horizon is load-bearing');
  const unkV = SW.seatVerdict({ state: unknown, used: 5, provider: FIXTURE_ID, source: 'cluster', integrationId: IID });
  ok(unkV.ok && unkV.ceiling === null && /5 used on this instance/.test(unkV.text), 'AN UNKNOWN TOTAL NEVER SATISFIES THE CEILING TEST: 5 used against unknown ⇒ no refusal');
  const asZero = SW.seatVerdict({ state: { ...unknown, state: 'known-fresh', total: 0 }, used: 0, provider: FIXTURE_ID, source: 'user', integrationId: IID });
  const asInf = SW.seatVerdict({ state: { ...unknown, state: 'known-fresh', total: Infinity }, used: 5, provider: FIXTURE_ID, source: 'user', integrationId: IID });
  ok(!asZero.ok && asInf.ok, 'CONTROL: treating unknown as 0 refuses everything and as ∞ refuses nothing — both are wrong and the real unknown does neither');
  ok(SW.seatVerdict({ state: stale, used: 9, provider: FIXTURE_ID, source: 'user', integrationId: IID }).ok, 'a stale reading refuses nothing either');
  // the ceiling wording forks on the key's SOURCE
  const own = SW.seatVerdict({ state: fresh, used: 1, provider: FIXTURE_ID, source: 'user', holders: [{ profileId: 'bp-1', label: 'Vendor portal' }], integrationId: IID });
  const clu = SW.seatVerdict({ state: fresh, used: 1, provider: FIXTURE_ID, source: 'cluster', holders: [{ profileId: 'bp-1', label: 'Vendor portal' }], integrationId: IID });
  ok(!own.ok && /held by Vendor portal/.test(own.error) && /stop one/.test(own.error) && own.holders.length === 1 && own.action === null, "the user's own key ⇒ the refusal NAMES the profiles holding seats and offers to stop one");
  ok(!clu.ok && /cluster default \(seats shared with other users; 1 used on this instance of 1\)/.test(clu.error) && !/Vendor portal/.test(clu.error) && clu.holders.length === 0 && clu.action && clu.action.openIntegration === IID, 'the cluster default ⇒ "seats shared with other users; N used on this instance" + the one-click way out, and NO profile listed');
  ok(!/Vendor portal/.test(clu.error), 'CONTROL: the version that lists local profiles under a cluster default would be wrong (this instance cannot see the other pods) — the fork holds');
  ok(fresh.state === 'known-fresh' && SW.seatVerdict({ state: fresh, used: 0, provider: FIXTURE_ID, source: 'user', integrationId: IID }).ok, 'under the ceiling (0 used of 1) the switch is allowed');
  // the classifier's SHAPE (§12.40 unmeasured: keys on the family of words)
  const taken = SW.classifyLaunchFailure({ provider: FIXTURE_ID, text: 'license validation failed — concurrent session limit reached', source: 'cluster', integrationId: IID });
  ok(taken.code === 'backend_seat_taken' && /cluster default/.test(taken.error) && /shared fleet-wide/.test(taken.error) && taken.action.openIntegration === IID && /own key/.test(taken.action.label), 'a licence/concurrency launch failure under a cluster default ⇒ backend_seat_taken saying the seats are shared fleet-wide + "use my own key"');
  const takenOwn = SW.classifyLaunchFailure({ provider: FIXTURE_ID, text: 'Seat limit exceeded', source: 'user', integrationId: IID });
  ok(takenOwn.code === 'backend_seat_taken' && !/cluster/.test(takenOwn.error), "…and under the user's own key it says another browser under this key holds the seat");
  ok(SW.classifyLaunchFailure({ provider: FIXTURE_ID, text: 'segmentation fault', source: 'user', integrationId: IID }).code === 'launch_failed' && SW.classifyLaunchFailure({ provider: 'chromium', text: 'license', integrationId: null }).code === 'launch_failed', 'any other failure is launch_failed; a provider with no key row is never classified as a seat');

  // the derived test host (§7.5's rule) + the one request
  ok(SW.testHostFor('cloud:browserbase', {}).host === 'api.browserbase.com' && SW.testHostFor('cloud:browseruse', {}).host === 'api.browser-use.com', 'browserbase / browseruse: their constant API host');
  const h1 = SW.testHostFor('cloud:browserless', { apiUrl: 'https://chrome.example.net:8443/' }), h2 = SW.testHostFor('cloud:browserless', { apiUrl: 'https://other.example.org/v2' });
  ok(h1.host === 'chrome.example.net' && h2.host === 'other.example.org' && h1.rule === 'field apiUrl', 'browserless: the host FOLLOWS the apiUrl the user typed (driven twice with two urls)');
  ok(SW.testHostFor('cloud:kernel', { endpoint: 'https://k.example.com' }).host === 'k.example.com', 'kernel: from its endpoint field');
  const und = SW.testHostFor('cloud:browserless', {});
  ok(!und.ok && und.code === 'host_underivable' && /never a default host/.test(und.error), 'a host it cannot derive is a NAMED refusal, never "let us try the default"');
  ok(SW.testHostFor('cloud:agentcore', { region: 'us-east-1' }).host === 'bedrock-agentcore.us-east-1.amazonaws.com' && !SW.testHostFor('cloud:agentcore', { region: 'moon' }).ok, 'agentcore: derived from its region, refused on a non-region');
  ok(!SW.testHostFor('nope', {}).ok && SW.testHostFor('nope', {}).code === 'unknown-integration', 'a row that is not a key row has no host at all (refused by name)');
  const rq = SW.testRequestFor('cloud:browserless', { apiKey: 'k'.repeat(20), apiUrl: 'https://chrome.example.net' });
  ok(rq.ok && rq.host === 'chrome.example.net' && rq.url.startsWith('https://chrome.example.net/') && !/k{20}/.test(rq.url) && rq.headers.Authorization === 'Bearer ' + 'k'.repeat(20), 'the one request rides the derived host with the key in a HEADER, never in the URL');
  ok(SW.testRequestFor('cloud:agentcore', { region: 'us-east-1' }).unsigned === true, 'agentcore says its request is unsigned');
  ok(SW.vendorEnvFor('cloud:browserless', { apiKey: 'K', apiUrl: 'https://x.example', stealth: '' }).BROWSERLESS_API_KEY === 'K' && SW.vendorEnvFor('cloud:browserless', { apiKey: 'K', apiUrl: 'https://x.example', stealth: '' }).BROWSERLESS_API_URL === 'https://x.example' && !('BROWSERLESS_STEALTH' in SW.vendorEnvFor('cloud:browserless', { apiKey: 'K', stealth: '' })) && Object.keys(SW.vendorEnvFor('chromium', { apiKey: 'K' })).length === 0, "vendorEnvFor: the vendor's OWN names, only the fields that carry a value, nothing for a key-less provider");
  ok(SW.vendorEnvFor(FIXTURE_ID, { apiKey: 'K' }, wired.row).BROWSERBASE_API_KEY === 'K' && Object.keys(SW.vendorEnvFor(FIXTURE_ID, { apiKey: 'K' })).length === 0 && SW.integrationIdFor(FIXTURE_ID, wired.row) === FIXTURE_INTEGRATION && SW.integrationIdFor(FIXTURE_ID) === null, 'vendorEnvFor / integrationIdFor judge by the row table they are HANDED (the gate\'s rowOf seam): the fixture row\'s key under its row\'s names; the shipped table has no such row');
  ok(SW.launchArgsFor('cloud:kernel').join(' ') === '-p kernel' && SW.launchArgsFor('chromium').length === 0 && SW.launchArgsFor(FIXTURE_ID).length === 0, 'launchArgsFor: cloud = upstream\'s -p, an in-place row = nothing; the KEY is never in argv');
  const leC = SW.launchEnvFor('chromium', { executablePath: '/opt/b/chrome' });
  ok(leC.AGENT_BROWSER_EXECUTABLE_PATH === '/opt/b/chrome' && Object.keys(leC).length === 1 && Object.keys(SW.launchEnvFor('chromium')).length === 0 && Object.keys(SW.launchEnvFor(FIXTURE_ID, { executablePath: '/x' })).length === 0 && Object.keys(SW.launchEnvFor('nope')).length === 0, 'launchEnvFor: a build-pinned row = the build\'s executable alone under agent-browser\'s OWN env name (no path ⇒ nothing); a row with no build choice gets none (an engine\'s launch is src/browser-engines.js engineLaunchEnv)');
  ok(SW.VENDOR_ENV_NAMES.every((n) => !n.startsWith('VIBESPACE_')) && SW.VENDOR_ENV_NAMES.includes('BROWSERBASE_API_KEY'), 'the vendor names are exactly the class agentEnv passes through — which is why the cluster may inject only under the store\'s own prefix');
  // the one npm argv the browser CLI's install runs, and the bin a package names
  ok(JSON.stringify(SW.installArgv({ spec: 'agent-browser@0.38.1', prefix: '/p' })) === JSON.stringify(['install', '--prefix', '/p', '--no-audit', '--no-fund', '--no-save', 'agent-browser@0.38.1']), 'installArgv: into OUR prefix, pinned, no audit / fund, no package.json edits');
  let badSpec = null; try { SW.installArgv({ spec: 'agent-browser@0.38.1; rm -rf /', prefix: '/p' }); } catch (e) { badSpec = e; }
  ok(badSpec && /bad spec/.test(badSpec.message), 'a spec that is not a package spec is refused before any argv exists');
  ok(SW.binFromPackageJson({ bin: 'cli.js' }) === 'cli.js' && SW.binFromPackageJson({ bin: { other: 'a.js', 'agent-browser': 'bin/ab.js' } }, 'agent-browser') === 'bin/ab.js' && SW.binFromPackageJson({ bin: { only: 'x.js' } }) === 'x.js' && SW.binFromPackageJson({}) === null && SW.binFromPackageJson(null) === null, 'binFromPackageJson reads the package\'s OWN bin (a string, the preferred entry, else the first), never a guessed name');

  // per-site memory: a CLAIM with who made it; tier legal only while backend === null
  const hA = SW.siteHintVerdict({ host: 'https://Portal.Example/login', backend: 'cdp', by: 'user', at: 5, why: 'blocks chromium', providerIds: B.providerIds() });
  ok(hA.ok && hA.value.host === 'portal.example' && hA.value.backend === 'cdp' && hA.value.tier === null && hA.value.by === 'user' && hA.value.at === 5, 'a hint is keyed by EXACT host (taken from a URL, lower-cased) and records who claimed it and when');
  const hB = SW.siteHintVerdict({ host: 'bank.example', tier: 3, by: 'agent', providerIds: B.providerIds() });
  ok(hB.ok && hB.value.tier === 3 && hB.value.backend === null, 'a tier-only claim before any provider is chosen is legal (backend null)');
  const hC = SW.siteHintVerdict({ host: 'bank.example', tier: 2, backend: 'cdp', by: 'agent', providerIds: B.providerIds() });
  ok(!hC.ok && hC.code === 'hint_tier_with_backend', 'NEGATIVE CONTROL: a hint that names a backend AND carries a tier is refused (§7.6 rule 2 — the tier is derived, never stored twice)');
  ok(!SW.siteHintVerdict({ host: 'x.example', backend: 'nope', providerIds: B.providerIds() }).ok && !SW.siteHintVerdict({ host: '', backend: 'cdp' }).ok && !SW.siteHintVerdict({ host: 'x.example', backend: 'cdp', by: 'server' }).ok && !SW.siteHintVerdict({ host: 'x.example' }).ok, 'an unknown backend, no host, an unknown claimant, or a hint saying nothing are all refused by name');
  ok(SW.siteHintFor([hA.value], 'https://portal.example/x').host === 'portal.example' && SW.siteHintFor([hA.value], 'other.example') === null, 'siteHintFor matches the exact host of a URL');
  // the blocked claim: made by the agent, never manufactured
  const bc = SW.blockedClaim({ url: 'https://portal.example/login?x=1', why: 'captcha', evidence: 'HTTP 403 twice', browserKey: 'bk-00000001', sessionId: 'sess-1', profileId: 'bp-00000001', tier: 2, at: 7, id: 'bl-1' });
  ok(bc.ok && bc.value.host === 'portal.example' && bc.value.by === 'agent' && bc.value.tier === 2 && bc.value.why === 'captcha' && bc.value.id === 'bl-1', 'a blocked claim carries the URL\'s host, WHO claimed it (the agent), why, the evidence and the suggested tier');
  ok(/the agent says this page is blocked/.test(SW.blockedText(bc.value)) && !/detected/.test(SW.blockedText(bc.value)) && /suggests tier 2/.test(SW.blockedText(bc.value)), 'the sentence says WHO claimed it and never "detected"');
  ok(!SW.blockedClaim({ url: 'https://x.example', by: 'server' }).ok && !SW.blockedClaim({ url: '' }).ok && !('detected' in bc.value), 'NEGATIVE CONTROL: a claim "by the server" is refused — the server never manufactures one, and the record has no field for a detection');
  ok(SW.navHint(403).tier === 2 && SW.navHint(403).hint === 'may-need-anti-bot' && /not a detection/.test(SW.navHint(429).text) && SW.navHint(200) === null && SW.navHint(500) === null, 'a real 403/429 yields a typed HINT (may-need-anti-bot) naming its source, worded so it cannot be read as a detection');
  ok(SW.backendChip({ provider: 'chromium', major: 146 }) === 'chromium 146' && SW.backendChip({ provider: FIXTURE_ID, major: 146 }) === 'fixture-browser 146' && SW.backendChip({ provider: 'cdp' }) === 'cdp', 'the chip: `chromium 146` / `<id> <major>` / `cdp`');
  ok(SW.restartingRefusal({ label: 'Vendor portal' }).code === 'browser_restarting' && /lease survives/.test(SW.restartingRefusal({ label: 'x' }).error), 'the mid-switch refusal is named and says the lease survives');

  // the gate's ORDER: keyScope refused BEFORE any key is resolved (leg viii)
  const calls = [];
  const resolveKey = (id) => { calls.push(id); return { source: 'user', values: { apiKey: 'bb_x0000000' } }; };
  const remote = { id: 'bp-1', label: 'Remote', provider: 'chromium', host: 'dev-1', dir: null, owner: { kind: 'instance' } };
  const g1 = SW.switchVerdict({ profile: remote, target: FIXTURE_ID, rowOf: wired.row, controlOf: wired.control, resolveKey });
  ok(!g1.ok && g1.code === 'provider_needs_local_key' && calls.length === 0, 'host != null switching to a key-bearing in-place row ⇒ provider_needs_local_key and resolveKey was NEVER called (nothing resolved, nothing handed to a transport)');
  const g1b = SW.switchVerdict({ profile: remote, target: 'cloud:browserbase', rowOf: B.providerRow, controlOf: B.providerControl, resolveKey });
  ok(!g1b.ok && g1b.code === 'provider_needs_local_key' && calls.length === 0, '…and cloud:* likewise');
  const local = { id: 'bp-2', label: 'Vendor portal', provider: 'chromium', host: null, dir: '/tmp/x', lastChromiumMajor: 146, owner: { kind: 'session', id: 'bk-00000001' } };
  const g2 = SW.switchVerdict({ profile: local, target: FIXTURE_ID, rowOf: unwired.row, controlOf: unwired.control, resolveKey });
  ok(!g2.ok && g2.code === 'backend_unavailable' && /not wired in this release/.test(g2.error) && calls.length === 0, 'an unwired target (not in this build) ⇒ backend_unavailable naming why, before any key resolve');
  const needKey = SW.switchVerdict({ profile: local, target: FIXTURE_ID, rowOf: wired.row, controlOf: wired.control, resolveKey: () => ({ source: 'none', why: 'nothing configured' }) });
  ok(!needKey.ok && needKey.code === 'backend_no_key' && needKey.action.openIntegration === FIXTURE_INTEGRATION && /Integrations/.test(needKey.error) && needKey.integrationId === FIXTURE_INTEGRATION && SW.keyRequiredFor(FIXTURE_INTEGRATION) === true, 'a key-REQUIRED row with no key ⇒ backend_no_key with the ACTIONABLE way out (app.openIntegration)');
  const optKey = SW.switchVerdict({ profile: local, target: FIXTURE_ID, rowOf: wired.row, controlOf: wired.control, resolveKey: () => ({ source: 'none', why: 'nothing configured' }), keyRequiredOf: () => false, majors: { [FIXTURE_ID]: { major: 146 } } });
  ok(optKey.ok && optKey.mode === 'switch' && optKey.source === 'none', 'a row whose key is OPTIONAL (the gate\'s keyRequiredOf) passes with none');
  const nk = SW.switcherRows({ profile: local, providerIds: wired.ids(), rowOf: wired.row, controlOf: wired.control, capabilityRefusalOf: B.capabilityRefusal, sources: () => ({ source: 'none' }) }).find((r) => r.id === FIXTURE_ID);
  ok(!nk.enabled && nk.state === 'needs-key' && nk.sourceLabel === 'not configured' && nk.action && nk.action.openIntegration === FIXTURE_INTEGRATION && nk.facts.key.needed === true, 'the row with no key: needs-key, "not configured", the Integrations action, facts.key.needed true');
  const g3 = SW.switchVerdict({ profile: local, target: FIXTURE_ID, rowOf: wired.row, controlOf: wired.control, resolveKey, seats: {}, majors: { [FIXTURE_ID]: { major: 146 } }, leases: [], by: { kind: 'user' } });
  ok(g3.ok && g3.mode === 'switch' && !('seed' in g3) && !('fingerprint' in g3) && g3.ladder && g3.ladder.ok && g3.seats && g3.seats.ok && calls.length === 1, 'the gate passes: ladder ok (146 ≥ 146), seats unknown ⇒ no refusal, key resolved ONCE; no seed, no fingerprint sentence (they left with the anti-bot backend)');
  const g4 = SW.switchVerdict({ profile: { ...local, lastChromiumMajor: 151 }, target: FIXTURE_ID, rowOf: wired.row, controlOf: wired.control, resolveKey, majors: { [FIXTURE_ID]: { major: 146 } } });
  ok(!g4.ok && g4.code === 'downgrade_refused' && g4.waysOut.length === 2, 'a dir last written by 151 refuses a target last seen writing 146, with the ladder\'s two ways out');
  const g5 = SW.switchVerdict({ profile: local, target: FIXTURE_ID, rowOf: wired.row, controlOf: wired.control, resolveKey, majors: { [FIXTURE_ID]: { major: 146 } }, seats: { [IID]: { tier: 'free', total: 1, at: NOW - 1000 } }, now: NOW, runningOf: () => [{ profileId: 'bp-9', label: 'Other' }] });
  ok(!g5.ok && g5.code === 'backend_seat_ceiling' && /held by Other/.test(g5.error), 'at the ceiling (1 used of a fresh 1) the gate refuses naming the holder');
  const g6 = SW.switchVerdict({ profile: local, target: FIXTURE_ID, rowOf: wired.row, controlOf: wired.control, resolveKey, majors: { [FIXTURE_ID]: { major: 146 } }, leases: [{ browserKey: 'bk-00000001', profileId: 'bp-2' }, { browserKey: 'bk-00000002', profileId: 'bp-2' }], by: { kind: 'agent' }, byKey: 'bk-00000001' });
  ok(g6.ok && g6.mode === 'proposal' && /other session/.test(g6.reason) && g6.affected.length === 2, "an agent's switch while another session holds a lease ⇒ a PROPOSAL naming the affected sessions");
  const g7 = SW.switchVerdict({ profile: local, target: FIXTURE_ID, rowOf: wired.row, controlOf: wired.control, resolveKey, majors: { [FIXTURE_ID]: { major: 146 } }, leases: [{ browserKey: 'bk-00000001', profileId: 'bp-2' }], inputs: { 'bk-00000001|bp-2': { input: 'user' } }, by: { kind: 'user' } });
  ok(g7.ok && g7.mode === 'proposal' && /driving/.test(g7.reason), 'a profile somebody is DRIVING is never interrupted — even the user\'s switch becomes a proposal');
  ok(SW.switchVerdict({ profile: local, target: 'chromium', rowOf: B.providerRow, controlOf: B.providerControl }).code === 'switch_noop' && SW.switchVerdict({ profile: local, target: 'cdp', rowOf: B.providerRow, controlOf: B.providerControl, capabilityRefusalOf: B.capabilityRefusal }).code === 'switch_refused' && SW.switchVerdict({ profile: local, target: 'cloud:kernel', rowOf: B.providerRow, controlOf: B.providerControl, resolveKey }).code === 'switch_export_only' && SW.switchVerdict({ profile: local, target: 'nope', rowOf: B.providerRow, controlOf: B.providerControl }).code === 'provider_unknown', 'noop / cdp (a second profile, canSwitchTo no) / cloud:* (export-only, naming the lossy path) / unknown are each named');
  const rows = SW.switcherRows({ profile: local, providerIds: wired.ids(), rowOf: wired.row, controlOf: wired.control, capabilityRefusalOf: B.capabilityRefusal, sources: (id) => (id === IID ? { source: 'cluster', clusterLabel: 'Team' } : { source: 'none' }), seats: {}, majors: { [FIXTURE_ID]: { major: 146 } }, now: NOW });
  const rc = rows.find((r) => r.id === FIXTURE_ID), rk = rows.find((r) => r.id === 'cloud:kernel'), rch = rows.find((r) => r.id === 'chromium');
  ok(rows.length === wired.ids().length && rch.current && rc.enabled && /cluster default · Team \(seats shared/.test(rc.sourceLabel) && rc.seats.state === 'unknown' && rk.enabled === false && rk.sourceLabel === 'not configured' && rk.code === 'switch_export_only' && rk.action && rk.action.openIntegration === 'cloud:kernel', 'switcherRows: every backend with its verdict WRITTEN ON IT, the SOURCE chip from the masked view, seats per key row, the one-click action on a not-configured row');
  ok(rch.state === 'current' && rc.state === 'ready' && rc.switchKind === 'in-place' && rk.state === 'not-a-switch' && rk.switchKind === 'export-only' && rows.find((r) => r.id === 'cdp').state === 'not-a-switch' && rc.facts && !('binary' in rc.facts) && rc.facts.key.source === 'cluster' && rc.facts.hold === null, 'the rebuilt dialog: the SAME call (its new inputs defaulted) writes each row\'s closed STATE, its switch kind and its facts');
}

// ═══ ② ORCH: the key consumer over a REAL integration store ════════════════
console.log('— ② browser-backend: five runners registered, keyFor = the literal resolve, sourceOf never carries a value');
const fakeEnv = {};
const store = IS.create({ dataDir: path.join(ROOT, 'integ'), env: fakeEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } });
{
  const fetches = [];
  const backend = BB.create({ integrations: store, fetchImpl: async (url, init) => { fetches.push({ url, init }); return { status: 200 }; }, log: { warn() {} } });
  const ids = backend.registerTests();
  ok(ids.length === 5 && SW.KEY_IDS.length === 5 && SW.KEY_IDS.every((id) => store.hasTestRunner(id)), 'all five rows register a runner with the real store (leg v)');
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-backend.js'), 'utf8');
  // lane dc-browser-backends (F10): ONE generic resolve over the DECLARED key rows — the shared census derives this file's ids
  // from those declarations (scripts/test-integration-registry.mjs (c)), so no literal per id is left to keep in step
  const bb2 = BB.create({ integrations: store, log: { warn() {} } });
  ok(/\.resolveIntegration\(id\)/.test(src) && !/resolveIntegration\('/.test(src) && SW.KEY_IDS.every((id) => !/is not a key row/.test(String(bb2.keyFor(id).why || ''))) && /is not a key row/.test(bb2.keyFor('lark').why), 'ONE generic resolve over the declared key rows (no literal per id): every declared row resolves through it, an undeclared one (lark) is not a key row');
  ok(!store.hasTestRunner('lark'), 'NEGATIVE CONTROL: a row this track does not consume (lark) has no runner from it');
  // precedence: user > cluster > none, over ONE fixture (leg iii)
  const BBID = 'cloud:browserbase';
  ok(backend.keyFor(BBID).source === 'none' && backend.sourceOf(BBID).source === 'none', 'nothing configured ⇒ source none (both the resolve and the chip)');
  fakeEnv.VIBESPACE_INTEGRATION_CLOUD_BROWSERBASE_APIKEY = 'bb_clusterkey000000';
  const kc = backend.keyFor(BBID);
  ok(kc.source === 'cluster' && kc.values.apiKey === 'bb_clusterkey000000' && kc.clusterKey === 'default', 'the cluster default ⇒ source cluster (read from the env at the moment of the question)');
  store.setIntegration(BBID, { apiKey: 'bb_userkey0000000000' });
  const ku = backend.keyFor(BBID);
  ok(ku.source === 'user' && ku.values.apiKey === 'bb_userkey0000000000', "the user's own key wins over the cluster default");
  const so = backend.sourceOf(BBID);
  ok(so.source === 'user' && !('values' in so) && !JSON.stringify(so).includes('bb_userkey'), 'sourceOf (the chip) carries the source and never a value — asserted on the RETURNED object');
  ok(!JSON.stringify(store.publicView(BBID)).includes('bb_userkey0000000000') && store.publicView(BBID).masked.apiKey === '••••0000', 'publicView masks the secret (leg iii)');
  ok(backend.resolveCount() === 3, 'each keyFor is exactly ONE store resolve');
  store.setIntegration(BBID, { apiKey: '' });
  delete fakeEnv.VIBESPACE_INTEGRATION_CLOUD_BROWSERBASE_APIKEY;
  ok(backend.keyFor(BBID).source === 'none', 'an emptied key and no cluster default ⇒ none again (nothing remembered)');
  const before = fetches.length;
  // the egress declaration is DERIVED (leg vi): the host follows the row's own field
  store.setIntegration('cloud:browserless', { apiKey: 'k'.repeat(20), apiUrl: 'https://chrome.example.net' });
  const t3 = await store.test('cloud:browserless');
  store.setIntegration('cloud:browserless', { apiUrl: 'https://other.example.org' });
  const t4 = await store.test('cloud:browserless');
  const hosts = fetches.slice(before).map((f) => new URL(f.url).host);
  ok(t3.ok && t4.ok && hosts.length === 2 && hosts[0] === 'chrome.example.net' && hosts[1] === 'other.example.org', 'browserless driven twice with two apiUrls ⇒ the host the runner reached FOLLOWED the field (derived, never a constant)');
  ok(fetches.slice(before).every((f) => f.init.headers.Authorization === 'Bearer ' + 'k'.repeat(20) && !f.url.includes('k'.repeat(20))), 'the key rode a header on both, never the URL');
  const expectedHosts = Object.fromEntries(SW.KEY_IDS.map((id) => [id, SW.testHostFor(id, { apiUrl: 'https://chrome.example.net', endpoint: 'https://k.example.com', region: 'us-east-1' }).host]));
  ok(Object.keys(expectedHosts).length === 5 && expectedHosts['cloud:browserbase'] === 'api.browserbase.com' && expectedHosts['cloud:browserless'] === 'chrome.example.net' && expectedHosts['cloud:kernel'] === 'k.example.com' && expectedHosts['cloud:browseruse'] === 'api.browser-use.com' && expectedHosts['cloud:agentcore'] === 'bedrock-agentcore.us-east-1.amazonaws.com', 'the set of hosts the runners can reach equals exactly the set §7.5\'s rule derives');
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
console.log('— ③ the keeper: the three named refusals, the major read back, a real in-place switch, browser_restarting, a proposal');
let clock = 1_800_000_000_000;
const settings = {};
const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b';
// the fixture row's key: the cluster default under the store's own prefix (what a cluster really injects)
const CLUSTER_KEY = 'VIBESPACE_INTEGRATION_CLOUD_BROWSERBASE_APIKEY';
function mkKeeper({ liveKeys = new Set([KEY_A, KEY_B]), providers = wired, dataDir = DATA, envPath = PATH_ENV, settingsOver = null, extraEnv = null, egressResolve = null } = {}) {
  const backend = BB.create({ integrations: store, log: { warn() {} } });
  return { keeper: K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: envPath, HOME, FAKE_AB_STATE: AB_STATE, FAKE_AB_CDP_PORT: process.env.FAKE_AB_CDP_PORT, ...(extraEnv || {}) }), serverSetting: (k) => (settingsOver && k in settingsOver ? settingsOver[k] : settings[k]), egressResolve, liveKeys: () => liveKeys, install: false, now: () => clock, log: { log() {}, warn() {}, error() {} }, integrations: store, keys: backend, providers, hostKnown: () => false }), backend };
}
/** the major the fixture row's last launch was seen writing — what a real launch of it records per backend */
const seenWriting = (kk, major = 146) => kk.reshapeStore((reg) => { reg.majors[FIXTURE_ID] = { major, at: clock }; });
{
  const { keeper: k, backend } = mkKeeper();
  const p = k.createProfile({ label: 'Vendor portal' }, { owner: { kind: 'instance', id: null } }); // instance-owned so TWO conversations may lease it (sharing 'owner' admits the owner's kind)
  ok(p.provider === 'chromium' && p.defaultBackend === null && fs.existsSync(p.dir), 'a chromium profile: no default backend, a real directory');
  // (1) backend_unavailable: a build where the fixture row is not wired
  const { keeper: k0 } = mkKeeper({ providers: unwired, dataDir: path.join(ROOT, 'data0') });
  const p0 = k0.createProfile({ label: 'Plain' }, { owner: { kind: 'instance', id: null } });
  const e0 = await threw(() => k0.switchBackend({ profileId: p0.id, target: FIXTURE_ID, by: { kind: 'user' } }));
  ok(e0 && e0.code === 'backend_unavailable' && /not wired in this release/.test(e0.message) && launches().length === 0, '(1) backend_unavailable: the unwired row is refused by name, nothing spawned');
  // (2) backend_no_key: a key-REQUIRED row started with no key
  const pCloud = k.createProfile({ label: 'Cloud box', provider: 'cloud:browserbase' }, { owner: { kind: 'instance', id: null } });
  const e1 = await threw(() => k.start(pCloud.id));
  ok(e1 && e1.code === 'backend_no_key' && e1.action && e1.action.openIntegration === 'cloud:browserbase' && launches().length === 0, '(2) backend_no_key: a key-required row with no key is refused by name, carries the one-click way out, spawns nothing (never a silent fallback)', JSON.stringify({ code: e1 && e1.code, action: e1 && e1.action }));
  k.removeProfile(pCloud.id);
  // …and the in-place switch to a key-required row with no key anywhere: refused at the gate, before anything stops
  const eNk = await threw(() => k.switchBackend({ profileId: p.id, target: FIXTURE_ID, by: { kind: 'user' } }));
  ok(eNk && eNk.code === 'backend_no_key' && eNk.action && eNk.action.openIntegration === FIXTURE_INTEGRATION && closes().length === 0 && launches().length === 0 && k.profile(p.id).provider === 'chromium', 'the switch to the key-required fixture row with no key ⇒ backend_no_key with the way out, nothing stopped or started');
  fakeEnv[CLUSTER_KEY] = 'bb_clusterkey000000';
  // attach two sessions on chromium, record their URLs, then SWITCH
  const a1 = await k.attach({ profileId: p.id, browserKey: KEY_A, sessionId: 'sess-a' });
  const a2 = await k.attach({ profileId: p.id, browserKey: KEY_B, sessionId: 'sess-b' });
  ok(a1.created && a2.created && launches().length === 1 && launches()[0].exe === null && launches()[0].vendor.browserbase === null, 'two sessions attached to one chromium browser: one launch, no executable path, no vendor key');
  ok(k.noteLeaseUrl(KEY_A, p.id, 'https://portal.example/inbox') && k.noteLeaseUrl(KEY_B, p.id, 'https://portal.example/settings') && k.noteUserUrl(KEY_A, p.id, 'https://portal.example/inbox2') === false, 'each lease records its tab\'s last URL (noteUserUrl stamps it too, even with no input state)');
  ok(k.profile(p.id).lastChromiumMajor === 146 && k._reg().majors.chromium.major === 146, 'the Chromium MAJOR was read back from the launch\'s /json/version and recorded on the profile + per backend');
  seenWriting(k);
  const leaseRefs = k._reg().leases.filter((l) => l.profileId === p.id);
  const pidBefore = launches()[0].pid;
  // an AGENT proposing while the other session holds a lease ⇒ proposal, nothing moves
  const prop = await k.switchBackend({ profileId: p.id, target: FIXTURE_ID, by: { kind: 'agent' }, browserKey: KEY_A });
  ok(prop.ok && prop.mode === 'proposal' && /other session/.test(prop.reason) && prop.affected.length === 2 && closes().length === 0 && k.profile(p.id).provider === 'chromium' && /switch "Vendor portal" from chromium to fixture-browser/.test(prop.text), "the agent's switch while KEY_B holds a lease ⇒ a proposal (text + detail for the inbox), nothing stopped", prop.text);
  // the switcher's view
  const view = k.switcherView(p.id);
  const vc = view.rows.find((r) => r.id === FIXTURE_ID);
  ok(view.chip === 'chromium 146' && vc && vc.enabled && /cluster default/.test(vc.sourceLabel) && vc.seats.state === 'unknown' && view.versions.recorded === 146 && view.leases.length === 2 && view.rows.length === wired.ids().length, 'switcherView: the chip, the fixture row (the keeper\'s row LIST is the override\'s too) enabled with its cluster-default source chip, seats unknown, the versions the ladder read', JSON.stringify(vc).slice(0, 400));
  // THE SWITCH (the user's act): stop → same dir → re-open per lease → re-pin → targetId rewritten
  const sw = await k.switchBackend({ profileId: p.id, target: FIXTURE_ID, by: { kind: 'user' } });
  const L = launches();
  const O = opens();
  ok(sw.ok && sw.mode === 'switch' && sw.from === 'chromium' && sw.to === FIXTURE_ID && !('seed' in sw) && !('fingerprint' in sw), 'the switch completed chromium → the fixture row (no seed, no fingerprint sentence)');
  ok(closes().length === 1 && L.length === 2 && L[1].pid !== pidBefore && L[1].profile === p.dir && L[1].exe === null && L[1].vendor.browserbase === 'bb_clusterkey000000' && !String(L[1].args || '').includes('bb_'), 'step 2+3: the chromium browser was STOPPED, the new one started on the SAME directory with the row\'s key in its env only', JSON.stringify(L[1]));
  ok(relaunches().length === 0, 'no call of the keeper\'s session carried a different launch view than the browser it started', JSON.stringify(relaunches()));
  ok(!JSON.stringify(process.env).includes('bb_clusterkey000000'), "the parent's environment never carried the vendor name (leg ii)");
  const reopened = O.filter((o) => o.url !== 'about:blank');
  ok(reopened.length === 2 && reopened.every((o) => o.verb === 'tab new') && reopened.some((o) => o.session === 'vs-' + KEY_A && o.url === 'https://portal.example/inbox2' && o.pinTab) && reopened.some((o) => o.session === 'vs-' + KEY_B && o.url === 'https://portal.example/settings' && o.pinTab), 'step 4: ONE tab re-opened per lease at its own lastUrl (the LAST one reported — the live view\'s inbox2 outranks the earlier inbox), under its own session name, re-pinned — by `tab new` (a pinned session\'s old tab died with the switch; `open` answered tab_gone on the real binary)', JSON.stringify(reopened));
  const after = k._reg().leases.filter((l) => l.profileId === p.id);
  ok(after.length === 2 && after.every((l) => leaseRefs.includes(l)) && after.every((l) => l.targetId && /^t-/.test(l.targetId)) && sw.reopened.every((r) => r.ok && r.targetId), 'step 5: the lease OBJECTS were never destroyed — only targetId was re-minted (written back from the re-open)');
  const pp = k.profile(p.id);
  ok(pp.provider === FIXTURE_ID && pp.lastChromiumMajor === 146 && pp.lastSwitchAt === clock && k._reg().majors[FIXTURE_ID].major === 146, 'the profile records the new backend, the major, and when it switched; the target\'s launch re-recorded its major');
  ok(k.chipFor(pp) === 'fixture-browser 146', 'the chip now reads `fixture-browser 146`');
  // a switch BACK: both 146 ⇒ ok
  const back = await k.switchBackend({ profileId: p.id, target: 'chromium', by: { kind: 'user' } });
  ok(back.ok && back.to === 'chromium' && launches().length === 3 && launches()[2].exe === null && launches()[2].vendor.browserbase === null, 'switching back starts chromium on the same directory, and the row\'s key does not ride its env');
  // the version ladder on a REAL directory: the dir's own Last Version outranks the registry
  fs.writeFileSync(path.join(p.dir, 'Last Version'), '151.0.7100.0\n');
  const dg = await threw(() => k.switchBackend({ profileId: p.id, target: FIXTURE_ID, by: { kind: 'user' } }));
  ok(dg && dg.code === 'downgrade_refused' && /151/.test(dg.message) && dg.waysOut.length === 2 && k.profile(p.id).provider === 'chromium' && launches().length === 3, 'a directory whose own "Last Version" is 151 refuses a target last seen writing 146 BEFORE a byte moves (registry said 146, the dir wins — the HIGHER)');
  fs.unlinkSync(path.join(p.dir, 'Last Version'));
  // browser_restarting mid-switch: slow the fake's open, attach concurrently
  fs.writeFileSync(path.join(AB_STATE, 'slow-ms'), '400'); // a FILE flag: the keeper's child env was captured at creation
  fs.rmSync(path.join(AB_STATE, 'slow-began'), { force: true });
  const swP = k.switchBackend({ profileId: p.id, target: FIXTURE_ID, by: { kind: 'user' } });
  // lane fast-debt-clear: the attach goes in once the switch's relaunch is IN the slow open (the fake marks it) — never after
  // a 60 ms clock, which a busy box could run past the whole switch or short of its start
  await until(() => fs.existsSync(path.join(AB_STATE, 'slow-began')));
  const mid = await threw(() => k.attach({ profileId: p.id, browserKey: KEY_A, sessionId: 'sess-a' }));
  const midResolve = k.resolveFor({ browserKey: KEY_A });
  await swP;
  fs.rmSync(path.join(AB_STATE, 'slow-ms'), { force: true });
  ok(mid && mid.code === 'browser_restarting' && /lease survives/.test(mid.message), 'an attach during the switch answers the NAMED browser_restarting (never a timeout)');
  ok(midResolve && midResolve.ok === false && midResolve.code === 'browser_restarting' && Array.isArray(midResolve.handles), 'a CLI resolve during the switch answers browser_restarting with the handles');
  ok(k.profile(p.id).provider === FIXTURE_ID && k._reg().leases.filter((l) => l.profileId === p.id).length === 2, 'the lease table survived the whole round trip');
  // (3) backend_seat_taken: a licence/concurrency launch failure under the cluster default
  await k.stop(p.id, { why: 'user' });
  fs.writeFileSync(path.join(AB_STATE, 'fail-license'), '1');
  const st = await threw(() => k.start(p.id));
  fs.rmSync(path.join(AB_STATE, 'fail-license'), { force: true });
  ok(st && st.code === 'backend_seat_taken' && /cluster default/.test(st.message) && /shared fleet-wide/.test(st.message) && st.action && st.action.openIntegration === FIXTURE_INTEGRATION && /own key/.test(st.action.label), '(3) backend_seat_taken: the launch failure is classified, names the provider, says the key is the cluster default with fleet-wide seats, offers "use my own key"', st && st.message);
  ok(k.browserOf(p.id).state === 'failed' && /cluster default/.test(k.browserOf(p.id).lastError), 'the browser record carries the classified reason');
  // (viii) keyScope on a remote profile: refused, nothing resolved
  const resolvesBefore = backend.resolveCount();
  k._reg().profiles.push({ ...B.newProfileRecord({ id: 'bp-0000eeee', label: 'Remote box', dir: null, provider: 'chromium', host: 'dev-1', now: clock }) });
  const rem = await threw(() => k.switchBackend({ profileId: 'bp-0000eeee', target: FIXTURE_ID, by: { kind: 'user' } }));
  ok(rem && rem.code === 'provider_needs_local_key' && backend.resolveCount() === resolvesBefore && launches().length === 4, 'host != null switching to a key-bearing row ⇒ provider_needs_local_key: resolved nothing, spawned nothing, handed nothing to any transport (leg viii)');
  // blocked claims + site hints on the keeper
  const bl = k.blocked({ url: 'https://portal.example/login', why: 'captcha', evidence: 'HTTP 403', browserKey: KEY_A, sessionId: 'sess-a', profileId: p.id });
  ok(bl.claim.by === 'agent' && bl.claim.host === 'portal.example' && k.blockedFor({ profileId: p.id }).length === 1 && k.list().blocked.length === 1 && /the agent says this page is blocked/.test(k.list().blocked[0].text), 'a blocked claim is recorded with who made it and rides the digest');
  const h = k.addSiteHint({ host: 'portal.example', backend: FIXTURE_ID, why: 'needs the other build', by: 'user' });
  ok(h.by === 'user' && h.backend === FIXTURE_ID && k.siteHints().length === 1 && k.list().siteHints[0].host === 'portal.example', 'a site hint by the user is stored and broadcast (its backend judged against the keeper\'s own row list)');
  const bad = await threw(async () => k.addSiteHint({ host: 'portal.example', backend: FIXTURE_ID, tier: 2, by: 'agent' }));
  ok(bad && bad.code === 'hint_tier_with_backend', 'the keeper refuses a hint carrying both a backend and a tier');
  ok(k.dropSiteHint('https://portal.example/x') === true && k.siteHints().length === 0 && k.clearBlocked(bl.claim.id) === true && k.blockedFor({}).length === 0, 'hints and claims can be removed by the user');
  // boot reconciliation drops a dead conversation's claims
  k.blocked({ url: 'https://x.example', browserKey: 'bk-0000dead', sessionId: 'sess-d', profileId: p.id });
  k.reconcile({ graceMs: 0 });
  ok(k.blockedFor({}).length === 0, 'a dead conversation\'s blocked claims go with it at boot');
  await k.stop(p.id, { why: 'user' }).catch(() => {});
  delete fakeEnv[CLUSTER_KEY];
}

// ═══ ③b the rebuilt switch dialog's server half ════════════════════════════════
console.log('— ③b the rebuilt dialog: ROW_STATES / rowState / switchChoices / backendFact, the view\'s live + states, the digest backends, the start-failure ROLLBACK');
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(SW.ROW_STATES.length === 12 && Object.isFrozen(SW.ROW_STATES) && new Set(SW.ROW_STATES).size === 12, 'ROW_STATES is a frozen closed set of 12 (the install / own-binary states left with the one row that had a program to install)');
  const base = { id: 'bp-00000b01', label: 'Shop', provider: 'chromium', host: null, dir: '/tmp/x', lastChromiumMajor: 146, owner: { kind: 'instance' } };
  const ids = wired.ids();
  ok(same(SW.switchChoices({ profile: base, providerIds: B.providerIds(), rowOf: B.providerRow, controlOf: B.providerControl }), []) && same(SW.switchChoices({ profile: base, providerIds: ids, rowOf: unwired.row, controlOf: unwired.control }), []), 'switchChoices on the SHIPPED table: [] (no in-place pair is wired in this version); with the fixture row not in this build: []');
  ok(same(SW.switchChoices({ profile: base, providerIds: ids, rowOf: wired.row, controlOf: wired.control }), [FIXTURE_ID]), '…with the fixture row wired: [fixture-browser] (key, version, seats not considered)');
  ok(same(SW.switchChoices({ profile: { ...base, host: 'dev-1' }, providerIds: ids, rowOf: wired.row, controlOf: wired.control }), []) && same(SW.switchChoices({ profile: { ...base, provider: 'cdp' }, providerIds: ids, rowOf: wired.row, controlOf: wired.control }), []), '…a profile on a paired machine, or one on cdp: []');
  ok(same(SW.backendFact({ provider: 'chromium', lastChromiumMajor: 151 }), { id: 'chromium', major: 151, plan: null }) && same(SW.backendFact({ provider: FIXTURE_ID }, { majors: { [FIXTURE_ID]: { major: 146 } } }), { id: FIXTURE_ID, major: 146, plan: null }) && SW.backendChip({ provider: FIXTURE_ID, major: 146 }) === 'fixture-browser 146', 'backendFact = the chip\'s facts unstringified (the agent\'s chip spelled from it)');
  const rs = (o) => SW.rowState({ row: { canSwitchTo: 'in-place' }, currentRow: { canSwitchTo: 'in-place' }, ...o });
  ok(rs({ verdict: { ok: false, code: 'provider_needs_local_key' } }) === 'other-machine' && rs({ verdict: { ok: false, code: 'backend_unavailable' } }) === 'not-in-this-version' && rs({ verdict: { ok: false, code: 'backend_no_key' } }) === 'needs-key' && rs({ verdict: { ok: false, code: 'downgrade_refused' } }) === 'older-browser' && rs({ verdict: { ok: true } }) === 'ready', 'rowState: the other machine, not in this version, the key, a downgrade, ready — first match wins');
  ok(rs({ verdict: { ok: true, mode: 'proposal' }, hold: 'driven' }) === 'in-use-by-hand' && rs({ verdict: { ok: false, code: 'downgrade_unknown' } }) === 'ready-confirm' && rs({ verdict: { ok: false, code: 'backend_seat_ceiling', seats: { source: 'cluster' } } }) === 'all-in-use-shared' && rs({ verdict: { ok: false, code: 'backend_seat_ceiling', seats: { source: 'user' } } }) === 'all-in-use-own' && rs({ verdict: { ok: false, code: 'weird' } }) === 'unavailable' && SW.rowState({ current: true }) === 'current' && SW.rowState({ row: { canSwitchTo: 'no' }, currentRow: { canSwitchTo: 'in-place' }, verdict: {} }) === 'not-a-switch', 'rowState: driven, the confirm, the two ceilings, the fallback, current, not a switch');
  const rUnk = SW.switcherRows({ profile: { ...base, lastChromiumMajor: null }, providerIds: ids, rowOf: wired.row, controlOf: wired.control, sources: () => ({ source: 'user' }) }).find((r) => r.id === FIXTURE_ID);
  ok(rUnk.code === 'downgrade_unknown' && rUnk.enabled === false && rUnk.state === 'ready-confirm' && !('fingerprintChange' in rUnk), 'a row whose directory nobody recorded: downgrade_unknown, READY-CONFIRM (one confirmation); no fingerprint field');
  // THE KEEPER: the view's live + states, the digest's backends, the ROLLBACK on every start throw
  fakeEnv[CLUSTER_KEY] = 'bb_clusterkey000000';
  const flag = (name, on) => { const f = path.join(AB_STATE, name); if (on) fs.writeFileSync(f, '1'); else fs.rmSync(f, { force: true }); };
  const { keeper: kb } = mkKeeper({ dataDir: path.join(ROOT, 'data-3b') });
  const pb = kb.createProfile({ label: 'Rollback portal' }, { owner: { kind: 'instance', id: null } });
  let v0 = kb.switcherView(pb.id);
  ok(v0.live === false && v0.rows.find((r) => r.id === FIXTURE_ID).state === 'ready-confirm' && !('install' in v0), 'switcherView: `live` (not running yet), the fixture row READY-CONFIRM (wired, cluster key — but nothing has recorded which Chromium wrote the new directory); no install facts (no row has a program to install)', JSON.stringify({ live: v0.live, row: v0.rows.find((r) => r.id === FIXTURE_ID) }).slice(0, 900));
  const dg = kb.list();
  ok(same(dg.backends[pb.id], { id: 'chromium', major: null, plan: null, choices: [FIXTURE_ID] }) && dg.chips[pb.id] === 'chromium', 'the digest carries backends[id] = {id, major, plan, choices} (choices [fixture-browser] in the wired world)', JSON.stringify(dg.backends[pb.id]));
  const { keeper: kShip } = mkKeeper({ providers: unwired, dataDir: path.join(ROOT, 'data-3b-ship') }); // the fixture row not in this build
  const pShip = kShip.createProfile({ label: 'Plain' }, { owner: { kind: 'instance', id: null } });
  ok(same(kShip.list().backends[pShip.id].choices, []) && same(kShip.choicesFor(pShip.id), []) && kShip.switcherView(pShip.id).rows.find((r) => r.id === FIXTURE_ID).state === 'not-in-this-version', '…a build without it: choices [] (no entry point offers the dialog), the row not-in-this-version');
  const { keeper: kReal } = mkKeeper({ providers: null, dataDir: path.join(ROOT, 'data-3b-real') }); // the SHIPPED table, no override
  const pReal = kReal.createProfile({ label: 'Shipped' }, { owner: { kind: 'instance', id: null } });
  ok(same(kReal.choicesFor(pReal.id), []) && kReal.switcherView(pReal.id).rows.length === B.providerIds().length && kReal.switcherView(pReal.id).rows.every((r) => r.state !== 'ready' && r.state !== 'ready-confirm'), 'the SHIPPED table: no choices, every row of it listed, none a ready switch (this version offers no one-click switch of browser)');
  await kb.attach({ profileId: pb.id, browserKey: KEY_A, sessionId: 'sess-a' });
  seenWriting(kb);
  v0 = kb.switcherView(pb.id);
  ok(v0.live === true && v0.leases.length === 1 && v0.rows.find((r) => r.id === FIXTURE_ID).state === 'ready', 'attached: the view says live, and with both majors known the fixture row is READY');
  const n0 = launches().length;
  flag('fail-fixture', true);
  const e1 = await threw(() => kb.switchBackend({ profileId: pb.id, target: FIXTURE_ID, by: { kind: 'user' } }));
  flag('fail-fixture', false);
  ok(e1 && e1.code === 'launch_failed' && e1.restored === true && e1.from === 'chromium' && e1.to === FIXTURE_ID && kb.profile(pb.id).provider === 'chromium' && launches().length === n0 + 1 && B.isLiveBrowser(kb.browserOf(pb.id)), 'ROLLBACK: a target whose start() throws launch_failed leaves provider === from, the old browser started again ⇒ restored:true, from, to', JSON.stringify({ code: e1 && e1.code, restored: e1 && e1.restored, provider: kb.profile(pb.id).provider, launches: launches().length - n0 }));
  flag('fail-fixture', true); flag('fail-plain', true);
  const e2 = await threw(() => kb.switchBackend({ profileId: pb.id, target: FIXTURE_ID, by: { kind: 'user' } }));
  flag('fail-fixture', false); flag('fail-plain', false);
  ok(e2 && e2.code === 'launch_failed' && e2.restored === false && e2.from === 'chromium' && e2.to === FIXTURE_ID && kb.profile(pb.id).provider === 'chromium', '…and when the old backend will not start again either: still back on from, restored:false');
  // a gate that passed on a STALE view: the key resolves at the gate, is gone at start() ⇒ backend_no_key — the same three facts
  let calls = 0;
  const flaky = { keyRequired: () => true, keyFor: (id) => { calls++; return calls === 1 ? { integrationId: id, source: 'user', values: { apiKey: 'bb_userkey0000000000' }, clusterKey: null, clusterLabel: null, why: null } : { integrationId: id, source: 'none', values: {}, why: 'the key was removed' }; }, sourceOf: (id) => ({ integrationId: id, source: 'user' }) };
  const kf = K.create({ dataDir: path.join(ROOT, 'data-3b-flaky'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE, FAKE_AB_CDP_PORT: process.env.FAKE_AB_CDP_PORT }), serverSetting: (k2) => settings[k2], liveKeys: () => new Set([KEY_A, KEY_B]), install: false, now: () => clock, log: { log() {}, warn() {}, error() {} }, integrations: store, keys: flaky, providers: wired, hostKnown: () => false });
  const pf = kf.createProfile({ label: 'Stale view' }, { owner: { kind: 'instance', id: null } });
  await kf.attach({ profileId: pf.id, browserKey: KEY_B, sessionId: 'sess-b' });
  seenWriting(kf);
  const e3 = await threw(() => kf.switchBackend({ profileId: pf.id, target: FIXTURE_ID, by: { kind: 'user' } }));
  ok(e3 && e3.code === 'backend_no_key' && e3.restored === true && e3.from === 'chromium' && e3.to === FIXTURE_ID && kf.profile(pf.id).provider === 'chromium' && calls === 2, 'ROLLBACK on a start() refusal that is not a launch (backend_no_key on a stale view): the same three facts, the profile back on chromium', JSON.stringify({ code: e3 && e3.code, restored: e3 && e3.restored, calls }));
  // the route's failure body spreads the three facts
  const express = require('express');
  const RT = require('../src/routes/browser.js');
  const app = express(); app.use(express.json());
  RT.setup({ keeper: kb, activeSessions: new Map([['sess-a', { agentToken: 'vsst_' + 'c'.repeat(24), _browserKey: KEY_A, name: 'A' }]]), browserEnv: () => null, forwards: () => [], propose: () => ({ id: 'ut-3b' }) });
  app.use(RT.router);
  const srv3 = await new Promise((r) => { const s2 = app.listen(0, '127.0.0.1', () => r(s2)); });
  servers.add(srv3);
  const API3 = `http://127.0.0.1:${srv3.address().port}`;
  flag('fail-fixture', true);
  const res = await fetch(API3 + '/api/browser/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: pb.id, provider: FIXTURE_ID }) });
  const body = await res.json();
  flag('fail-fixture', false);
  ok(res.status === 502 && body.code === 'launch_failed' && body.restored === true && body.from === 'chromium' && body.to === FIXTURE_ID, 'POST /api/browser/switch: the failure body spreads restored / from / to (fail())', JSON.stringify(body).slice(0, 300));
  // a TIER-2 claim is a proposal that offers nothing in this version (D1 / D5: no plan kind left that switches a browser) —
  // the agent is told so and not to work around the refusal; a claim of another tier keeps the live view's words (whether
  // another browser is available here)
  const bl0 = await fetch(API3 + '/api/agent/browser/blocked', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_' + 'c'.repeat(24) }, body: JSON.stringify({ url: 'https://portal.example/p', profile: pb.id }) });
  const blj0 = await bl0.json();
  ok(bl0.status === 200 && blj0.proposal && blj0.proposal.state === 'unavailable' && blj0.proposal.plan.why === 'unavailable' && /no switch can be offered \(this version of VibeSpace offers no one-click switch of browser\)/.test(blj0.next) && /Do not work around it/.test(blj0.next), 'a tier-2 claim ⇒ ONE proposal that offers nothing even where another in-place row is wired: the agent is told why and not to work around the refusal', blj0.next);
  const bl = await fetch(API3 + '/api/agent/browser/blocked', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_' + 'c'.repeat(24) }, body: JSON.stringify({ url: 'https://portal.example/x', profile: pb.id, tier: 3 }) });
  const blj = await bl.json();
  ok(bl.status === 200 && !blj.proposal && /THEIR act/.test(blj.next) && /one-click switch/.test(blj.next), 'the blocked claim\'s `next` (a claim with no proposal — tier 3): another browser IS available here ⇒ the live view offers the switch (THEIR act)', blj.next);
  RT.setup({ keeper: kShip, activeSessions: new Map([['sess-a', { agentToken: 'vsst_' + 'c'.repeat(24), _browserKey: KEY_A, name: 'A' }]]), browserEnv: () => null, forwards: () => [], propose: () => ({ id: 'ut-3b' }) });
  const bl2 = await fetch(API3 + '/api/agent/browser/blocked', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_' + 'c'.repeat(24) }, body: JSON.stringify({ url: 'https://portal.example/x', profile: pShip.id, tier: 3 }) });
  const blj2 = await bl2.json();
  ok(bl2.status === 200 && /THEIR act/.test(blj2.next) && /no other browser is available on this instance/.test(blj2.next), '…without it: the agent is told no other browser is available, so the switch is not offered (still THEIR act to arrange one)', blj2.next);
  const bl3 = await fetch(API3 + '/api/agent/browser/blocked', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_' + 'c'.repeat(24) }, body: JSON.stringify({ url: 'https://portal.example/q', profile: pShip.id }) });
  const blj3 = await bl3.json();
  ok(bl3.status === 200 && blj3.proposal && blj3.proposal.state === 'unavailable' && /no switch can be offered \(this version of VibeSpace offers no one-click switch of browser\)/.test(blj3.next), '…and a tier-2 claim there is the same proposal that offers nothing, saying why', blj3.next);
  await kb.stop(pb.id, { why: 'user' }).catch(() => {});
  await kf.stop(pf.id, { why: 'user' }).catch(() => {});
  delete fakeEnv[CLUSTER_KEY];
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
  RT.setup({ keeper: kR, activeSessions: active, browserEnv: () => null, forwards: () => [], propose: (sid, s, item) => { proposals.push({ sid, ...item }); return { id: 'ut-1' }; } });
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
  const rfx = r.json.rows.find((x) => x.id === FIXTURE_ID);
  ok(r.status === 200 && r.json.chip === 'chromium' && r.json.rows.length === wired.ids().length && rfx.code === 'backend_no_key' && rfx.state === 'needs-key' && rfx.sourceLabel === 'not configured' && rfx.action && rfx.action.openIntegration === FIXTURE_INTEGRATION && rfx.facts.key.needed === true, 'GET /api/browser/switcher: every row with its verdict; with no key the fixture row needs one and offers the Integrations way out', JSON.stringify(rfx).slice(0, 500));
  r = await j('POST', '/api/browser/switch', { profile: pr.id, provider: FIXTURE_ID });
  ok(r.status === 409 && r.json.code === 'backend_no_key' && r.json.provider === FIXTURE_ID && r.json.action && r.json.action.openIntegration === FIXTURE_INTEGRATION, 'POST /api/browser/switch with no key ⇒ 409 backend_no_key carrying the way out', JSON.stringify(r.json).slice(0, 300));
  r = await j('POST', '/api/browser/switch', { profile: pr.id, provider: 'cloud:kernel' });
  ok(r.status === 400 && r.json.code === 'switch_export_only' && /vibespace-browser new/.test(r.json.error), 'a cloud target ⇒ 400 switch_export_only naming the lossy path');
  r = await j('POST', '/api/browser/switch', { profile: 'nope', provider: FIXTURE_ID });
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
  fakeEnv[CLUSTER_KEY] = 'bb_clusterkey000000';
  seenWriting(kR);
  await j('POST', '/api/agent/browser/use', { profile: pr.id }, bearer(TOKEN_B));
  r = await j('POST', '/api/agent/browser/backend', { provider: FIXTURE_ID }, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.mode === 'proposal' && r.json.filed === true && proposals.length === 1 && proposals[0].sid === 'sess-a' && /Browser backend: switch "Route portal"/.test(proposals[0].text) && /agent proposes/.test(proposals[0].detail) && kR.profile(pr.id).provider === 'chromium', "the agent's switch while B holds a lease ⇒ mode proposal, ONE 'For you' item filed under the proposing session, nothing switched", JSON.stringify(r.json).slice(0, 300));
  await j('POST', '/api/agent/browser/detach', { profile: pr.id }, bearer(TOKEN_B));
  r = await j('POST', '/api/agent/browser/backend', { provider: FIXTURE_ID }, bearer(TOKEN_A));
  ok(r.status === 200 && r.json.mode === 'switch' && r.json.to === FIXTURE_ID && r.json.chip === 'fixture-browser 146' && r.json.reopened.length === 1 && kR.profile(pr.id).provider === FIXTURE_ID, 'alone on the profile, the agent\'s switch is direct: chromium → the fixture row, its tab re-opened', JSON.stringify(r.json).slice(0, 300));
  r = await j('POST', '/api/agent/browser/blocked', { url: 'https://portal.example/login', why: 'captcha', evidence: 'HTTP 403', remember: true }, bearer(TOKEN_A));
  // a tier-2 claim files ONE proposal — in this version it offers nothing (a sentence, no Approve) and the answer says so
  ok(r.status === 200 && r.json.claim.by === 'agent' && r.json.claim.browserKey === KEY_A && r.json.claim.profileId === pr.id && /the agent says/.test(r.json.text) && r.json.remembered && r.json.remembered.tier === 2 && r.json.remembered.backend === null && r.json.remembered.by === 'agent' && r.json.proposal && r.json.proposal.state === 'unavailable' && r.json.proposal.plan.why === 'unavailable' && /no switch can be offered/.test(r.json.next) && /Do not work around it/.test(r.json.next), 'POST /api/agent/browser/blocked: a claim by the agent, remembered as a tier-only hint (never an auto-escalation); its proposal offers nothing, and the answer says so', JSON.stringify(r.json).slice(0, 400));
  r = await j('GET', '/api/browser/site-hints');
  ok(r.status === 200 && r.json.siteHints.length === 1 && r.json.siteHints[0].host === 'portal.example', 'GET /api/browser/site-hints lists it');
  r = await j('POST', '/api/browser/site-hints', { url: 'https://bank.example/x', tier: 3, why: 'step-up' });
  ok(r.status === 200 && r.json.hint.by === 'user' && r.json.hint.tier === 3, 'the user adds a tier-3 hint');
  r = await j('POST', '/api/browser/site-hints', { site: 'bank.example', tier: 3, backend: 'cdp' });
  ok(r.status === 400 && r.json.code === 'hint_tier_with_backend', 'a hint with both is refused 400 by name');
  r = await j('POST', '/api/browser/site-hints', { host: 'bank.example', tier: 3 });
  ok(r.status === 400 && r.json.code === 'unsupported-host', 'CONTROL: `host` on this route is the MACHINE parameter (refused by name like every browser route) — the site rides `site`');
  r = await j('DELETE', '/api/browser/site-hints/bank.example');
  ok(r.status === 200 && r.json.removed === true && r.json.siteHints.length === 1, 'DELETE removes it');
  const digest = kR.list();
  ok(digest.blocked.length === 1 && digest.chips[pr.id] === 'fixture-browser 146' && digest.seats[FIXTURE_INTEGRATION].state === 'unknown', 'the digest carries the claim, the chip and the seat state (the multi-client broadcast payload)');
  r = await j('DELETE', `/api/browser/blocked/${digest.blocked[0].id}`);
  ok(r.status === 200 && r.json.removed === true, 'the user dismisses the claim');
  // the shipped CLI
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: TOKEN_A };
  const cli = (args, env = {}) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...cliEnv, ...env }, encoding: 'utf8', timeout: 20000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') + (err && typeof err.code !== 'number' ? `\n[spawn error] ${err.message}` : '') })));
  const bk = await cli(['backend']);
  ok(bk.status === 0 && /backend: fixture-browser 146/.test(bk.stdout) && /\* fixture-browser/.test(bk.stdout) && /✗ cloud:kernel/.test(bk.stdout) && /not configured/.test(bk.stdout) && /USER's act/.test(bk.stdout), 'vibespace-browser backend prints the current backend, every row with its verdict and the source chips', bk.stdout + bk.stderr);
  const bk2 = await cli(['backend', 'chromium']);
  ok(bk2.status === 0 && /switched fixture-browser → chromium/.test(bk2.stdout) && /1 tab\(s\) re-opened/.test(bk2.stdout), 'vibespace-browser backend chromium switches back (alone on the profile)', bk2.stdout + bk2.stderr);
  delete fakeEnv[CLUSTER_KEY];
  const bk3 = await cli(['backend', FIXTURE_ID]);
  ok(bk3.status !== 0 && /backend_no_key|needs a key/.test(bk3.stdout + bk3.stderr) && kR.profile(pr.id).provider === 'chromium', 'with no key the CLI\'s switch to the key-required row is refused by name, nothing switched', bk3.stdout + bk3.stderr);
  const bl = await cli(['blocked', '--url', 'https://portal.example/login', '--why', 'captcha']);
  ok(bl.status === 0 && /recorded your claim: the agent says this page is blocked \(portal.example: captcha\)/.test(bl.stdout) && /no switch can be offered/.test(bl.stdout) && /proposal bl-[0-9a-f]{8}: nothing can be offered here/.test(bl.stdout), 'vibespace-browser blocked records the claim and prints its proposal (nothing to offer in this version)', bl.stdout + bl.stderr);
  const bl2 = await cli(['blocked']);
  ok(bl2.status === 2 && /usage: vibespace-browser blocked --url/.test(bl2.stderr), 'blocked without --url prints usage');
  await kR.stop(pr.id, { why: 'user' }).catch(() => {});
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
