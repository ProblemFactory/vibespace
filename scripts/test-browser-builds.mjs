#!/usr/bin/env node
// LANE BROWSER-ADMIN 2a — WHICH CHROME BUILD A PROFILE RUNS (the owner, 2026-09-30: "不能pin指定版本"). Fast, in-process:
// a scratch HOME with a fake `~/.agent-browser/browsers/` (the measured layout: `chrome-<version>/chrome`), the shared fake
// agent-browser (every call's launch view logged), a loopback /json/version, port 0, no real binary, no browser.
//
//   ① PURE (src/browser-builds.js): the build-dir names, the machine's listing (usable / no chrome / not executable /
//      junk ignored / newest first / a missing root vs an unreadable one), the choice shapes, THE verdict's order
//      (well-formed · the user's · chromium · listed · runnable · the version ladder), the running build off /json/version;
//   ② the REAL keeper over the fake binary: a pinned build's executable rides EVERY call of the browser's own session
//      (AGENT_BROWSER_EXECUTABLE_PATH — the measured relaunch rule), the default rides none, the panel's fact is the
//      browser's OWN answer; a build that VANISHED is refused BY NAME at the launch (no record, no fall back to another
//      build), marked on the record and filed ONCE in For you; Change build… restarts a running browser and TELLS every
//      conversation on it (the relaunch seam) before the stop, reopens its tab, and refuses an older build by name;
//      an agent never chooses a build;
//   ③ the `browser-serve` op (the SHARED table a paired machine's daemon runs): `builds` lists THAT machine's builds, a
//      start with a build rides its executable on the launch AND on every later op (cdp-url, stop) through the machine's
//      own view file, a missing build is refused there; the capability gate: an agent without `browser-builds` is never
//      asked for a list nor handed a start with a build (refused `builds_unsupported`, zero requests);
//   ④ the client words (src/lib/browser-build-model.js) in en / zh / ja + wiring pins;
//   ⑤ patched copies as controls: a launch that forgets the build on later calls, a verdict that lets an agent choose,
//      a keeper that falls back to the default build when the chosen one vanished.
//   ⑦ lane engine-plugin (design-custom-browser-plugin §1): a browser ENGINE plugin — the PURE answer + choice verdicts and
//      the policy; the REAL keeper over the fixture engine (scripts/fixtures/engine-plugin, the REAL loader's IPC child): its
//      kernel + arguments on every call, the vanished kernel refused by name with ONE For-you item, a timeout / an env key /
//      another protocol / the plugin turned off each by name, Change build… to it, the policy at a create and at a
//      conversation's browser's first start (its config names the kernel for the agent's commands too); patched controls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, keeperWithInstalls } from './mutant-copy.mjs';
import { scratch, deadPort } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
const DEAD_CDP = await deadPort(); // the stub's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } return !!c; };
const thr = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const BB = require('../src/browser-builds.js');
const SW = require('../src/browser-switch.js');
const ROOT = scratch('badm');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home');
const BROWSERS = path.join(HOME, '.agent-browser', 'browsers');
const mkBuild = (v, { exec = true, chrome = true } = {}) => { const d = path.join(BROWSERS, 'chrome-' + v); fs.mkdirSync(d, { recursive: true }); if (chrome) fs.writeFileSync(path.join(d, 'chrome'), '#!/bin/sh\nexit 0\n', { mode: exec ? 0o755 : 0o644 }); return path.join(d, 'chrome'); };
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
const servers = new Set();
process.on('exit', () => { fake.reap(); for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

// ═══ ① PURE ═══════════════════════════════════════════════════════════════════
console.log('— ① PURE: the listing, the choice, THE verdict\'s order, the running build');
function judgeVerdict(BBm) {
  const bad = [];
  const builds = { ok: true, builds: [{ version: '151.0.7922.34', major: 151, path: '/h/.agent-browser/browsers/chrome-151.0.7922.34/chrome', usable: true }, { version: '146.0.7680.153', major: 146, path: '/h/b/chrome-146/chrome', usable: true }, { version: '140.0.1.2', major: 140, path: '/x', usable: false, why: 'not-executable' }] };
  const V = (o) => BBm.browserChoiceVerdict({ builds, ...o });
  const rows = [
    [{ choice: { kind: 'build', version: 'x' } }, 'browser_choice_invalid'],
    [{ choice: { kind: 'path', path: 'relative/chrome' } }, 'browser_choice_invalid'],
    [{ choice: { kind: 'default' }, by: 'agent' }, null], // the default asks nothing of anybody
    [{ choice: { kind: 'build', version: '151.0.7922.34' }, by: 'agent' }, 'browser_choice_user_only'],
    [{ choice: { kind: 'build', version: '151.0.7922.34' }, by: 'agent', provider: 'cloak' }, 'browser_choice_user_only'], // the user rung comes BEFORE the provider rung
    [{ choice: { kind: 'build', version: '151.0.7922.34' }, provider: 'cloak' }, 'browser_choice_provider'],
    [{ choice: { kind: 'build', version: '151.0.7922.34' }, builds: null }, 'builds_unsupported'],
    [{ choice: { kind: 'build', version: '150.0.1.1' } }, 'browser_build_missing'],
    [{ choice: { kind: 'build', version: '140.0.1.2' } }, 'browser_build_not_executable'],
    [{ choice: { kind: 'path', path: '/no/such' }, pathFact: { usable: false, why: 'missing' } }, 'browser_path_missing'],
    [{ choice: { kind: 'path', path: '/etc/passwd' }, pathFact: { usable: false, why: 'not-executable' } }, 'browser_path_not_executable'],
    [{ choice: { kind: 'build', version: '146.0.7680.153' }, ladder: true, written: true, recordedMajor: 151 }, 'downgrade_refused'],
    [{ choice: { kind: 'build', version: '146.0.7680.153' }, ladder: true, written: true, recordedMajor: null, dirMajor: null }, 'downgrade_unknown'],
    [{ choice: { kind: 'build', version: '146.0.7680.153' }, ladder: true, written: true, confirmed: true }, null],
    [{ choice: { kind: 'build', version: '146.0.7680.153' }, ladder: true, written: false, recordedMajor: 151 }, null], // a directory nothing wrote has no ladder
    [{ choice: { kind: 'build', version: '146.0.7680.153' }, ladder: false, written: true, recordedMajor: 151 }, null], // a launch runs the build already judged
    [{ choice: { kind: 'build', version: '151.0.7922.34' }, ladder: true, written: true, recordedMajor: 146 }, null],
    [{ choice: { kind: 'path', path: '/opt/c//chrome' }, pathFact: { usable: true }, ladder: true, written: true, recordedMajor: 151 }, 'downgrade_unknown'], // a path's major is unknown until it runs
  ];
  for (const [o, code] of rows) { const v = V(o); if ((v.ok ? null : v.code) !== code) bad.push(`${JSON.stringify(o).slice(0, 120)} ⇒ ${v.ok ? 'ok' : v.code}, want ${code}`); }
  const okv = V({ choice: { kind: 'build', version: '151.0.7922.34' } });
  if (!(okv.ok && okv.executablePath === '/h/.agent-browser/browsers/chrome-151.0.7922.34/chrome' && okv.major === 151)) bad.push('the ok answer names the executable + the major');
  return bad;
}
{
  ok(JSON.stringify(BB.parseBuildDir('chrome-151.0.7922.34')) === JSON.stringify({ version: '151.0.7922.34', major: 151 }) && BB.parseBuildDir('chrome-146.0.7680.153').major === 146
    && BB.parseBuildDir('chromium-151.0.1.1') === null && BB.parseBuildDir('chrome-151') === null && BB.parseBuildDir('chrome-x.y.z') === null && BB.parseBuildDir('chrome-151.0.7922.34/../x') === null,
  'a build directory is `chrome-<dotted version>` (the measured names) — nothing else');
  ok(BB.listBuilds({ homeDir: HOME }).missing === true && BB.listBuilds({ homeDir: HOME }).builds.length === 0, 'no builds folder ⇒ `missing` (no build was ever installed) — not an error');
  mkBuild('151.0.7922.34'); mkBuild('146.0.7680.153'); mkBuild('139.0.1.1', { exec: false }); mkBuild('120.0.1.1', { chrome: false });
  fs.mkdirSync(path.join(BROWSERS, 'not-a-build'), { recursive: true }); fs.writeFileSync(path.join(BROWSERS, 'chrome-junk'), 'x');
  const L = BB.listBuilds({ homeDir: HOME });
  ok(L.ok && L.builds.map((b) => b.version).join(' ') === '151.0.7922.34 146.0.7680.153 139.0.1.1 120.0.1.1' && L.builds[0].usable && L.builds[1].usable && !L.builds[2].usable && L.builds[2].why === 'not-executable' && !L.builds[3].usable && L.builds[3].why === 'missing',
    'the listing: every chrome-<version> folder, newest first; a chrome that cannot run / is missing is LISTED with why (never hidden); junk ignored', L.builds);
  ok(L.builds[0].path === path.join(BROWSERS, 'chrome-151.0.7922.34', 'chrome') && L.root === BROWSERS, 'each build names its executable — the `chrome` at the top of its folder (Chrome for Testing\'s linux layout)');
  const H2 = path.join(ROOT, 'home-file'); fs.mkdirSync(path.join(H2, '.agent-browser'), { recursive: true }); fs.writeFileSync(path.join(H2, '.agent-browser', 'browsers'), 'not a folder');
  const L2 = BB.listBuilds({ homeDir: H2 });
  ok(L2.ok === false && L2.code === 'builds_unreadable', 'a builds folder that cannot be read is `builds_unreadable` — never reported as "no builds"', L2);
  const N = BB.normalizeBrowserChoice;
  ok(N(null).kind === 'default' && N({ kind: 'build', version: '151.0.7922.34' }).version === '151.0.7922.34' && N({ kind: 'path', path: '/opt/x/../c/chrome' }).path === '/opt/c/chrome'
    && N({ kind: 'path', path: 'rel' }) === null && N({ kind: 'path', path: '/a\nb' }) === null && N({ kind: 'path', path: '/' }) === null && N({ kind: 'build', version: '151' }) === null && N({ kind: 'other' }) === null,
  'the choice: default | a build by version | an ABSOLUTE path (normalised; no newline, never "/"); anything else is no choice');
  ok(judgeVerdict(BB).length === 0, 'THE verdict, in its order: invalid · the user\'s · chromium · listed · runnable · the version ladder (only when the directory was ever written, and only where the caller asks for it)', judgeVerdict(BB));
  ok(BB.runningBuildOf('Chrome/151.0.7922.34') === '151.0.7922.34' && BB.runningBuildOf('HeadlessChrome/146.0.7680.153') === '146.0.7680.153' && BB.runningBuildOf('') === null && BB.runningBuildOf('Firefox/1') === null,
    'the running build is read off the browser\'s own /json/version (the fact — headless or not)');
  ok(BB.sameChoice(null, { kind: 'default' }) && !BB.sameChoice({ kind: 'build', version: '151.0.7922.34' }, { kind: 'build', version: '146.0.7680.153' }) && BB.sameChoice({ kind: 'path', path: '/a//b' }, { kind: 'path', path: '/a/b' }), 'sameChoice (Change build… to the same build is a no-op)');
  ok(JSON.stringify(SW.launchEnvFor('chromium', { executablePath: '/x/chrome' })) === JSON.stringify({ AGENT_BROWSER_EXECUTABLE_PATH: '/x/chrome' }) && JSON.stringify(SW.launchEnvFor('chromium', {})) === '{}',
    'the launch env of a pinned chromium build is the executable alone (agent-browser\'s own env name) — nothing for the default');
  const n = BB.missingNotice({ label: 'Work', choice: { kind: 'build', version: '151.0.7922.34' } });
  ok(/Work/.test(n.text) && /151\.0\.7922\.34/.test(n.text) && /Change build…/.test(n.detail) && /never switches it to another build/.test(n.detail), 'the For-you notice names the profile, the build, and the way out (Change build…) — and says nothing falls back by itself');
}

// ═══ ② the REAL keeper ════════════════════════════════════════════════════════
console.log('— ② the keeper over the fake binary: the executable on every call, a vanished build refused by name, Change build…');
const K = require('../src/server/browser-keeper.js');
// /json/version answers the build the LAST launch ran (the fake records its executable) — the fact the panel prints
const lastExe = () => { const l = fake.launches().at(-1); return l ? l.exe : null; };
const cdpSrv = http.createServer((req, res) => { const e = lastExe(); const m = e && /chrome-(\d+\.\d+\.\d+\.\d+)/.exec(e); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/' + (m ? m[1] : '149.0.1.1') })); });
servers.add(cdpSrv);
const CDP_PORT = await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port)));
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const KEY_A = 'bk-0000a0a1';
const todos = [];
const relaunches = [];
function mkKeeper(dataDir, extra = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  return K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3,
    log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: (k, item) => { todos.push(item); return { id: 'u' + todos.length }; } }, ...extra });
}
const B151 = path.join(BROWSERS, 'chrome-151.0.7922.34', 'chrome'), B146 = path.join(BROWSERS, 'chrome-146.0.7680.153', 'chrome');
// every call of the browser's own session that CAN launch — `session info` is launch-free (measured on the real binary,
// test-browser-profiles ⑨), so its view never relaunches anything and the keeper asks it bare, as for every provider
const callsOf = (ns, from = 0) => fake.calls().slice(from).filter((c) => c.ns === ns && (!c.session || c.session === ns) && c.verb !== 'session info');
let kk;
{
  const k = mkKeeper(path.join(ROOT, 'data-2')); kk = k;
  const plain = k.createProfile({ label: 'Plain' });
  const c0 = fake.calls().length;
  await k.start(plain.id, { why: 'test' });
  ok(fake.launches().at(-1).exe === null && callsOf('vs-' + plain.id, c0).every((c) => c.exe === null), 'the DEFAULT build: no executable on any call (the CLI picks, as before this lane)', callsOf('vs-' + plain.id, c0));
  const e0 = await thr(() => k.createProfile({ label: 'Gone', browser: { kind: 'build', version: '150.0.1.1' } }));
  ok(e0 && e0.code === 'browser_build_missing' && !k.list().profiles.some((p) => p.label === 'Gone'), 'a create naming a build this machine does not have ⇒ refused by name, nothing created');
  const ea = await thr(() => k.createProfile({ label: 'By agent', browser: { kind: 'build', version: '151.0.7922.34' } }, { by: 'agent' }));
  ok(ea && ea.code === 'browser_choice_user_only', 'an agent never chooses a build (createProfile by:agent ⇒ browser_choice_user_only)');
  const pin = k.createProfile({ label: 'Pinned', browser: { kind: 'build', version: '151.0.7922.34' } });
  ok(pin.browser && pin.browser.kind === 'build' && pin.browser.version === '151.0.7922.34', 'the record carries the choice');
  const c1 = fake.calls().length;
  await k.start(pin.id, { why: 'test' });
  const ns = 'vs-' + pin.id;
  const cs = callsOf(ns, c1);
  ok(fake.launches().at(-1).exe === B151 && cs.length >= 2 && cs.every((c) => c.exe === B151), `the pinned build's executable rides EVERY call of the browser's own session (${cs.map((c) => c.verb).join(' · ')}) — the measured relaunch rule`, cs);
  const rec = k.list().browsers[pin.id];
  ok(rec.runningBuild === '151.0.7922.34' && k._reg().browsers[pin.id].launchFlags === false, 'the panel\'s fact is the browser\'s OWN answer (/json/version: 151.0.7922.34); a build pin is not a provider\'s own flags (the heal relaunches the SAME build through rec.launchEnv)', { rb: rec.runningBuild, lf: k._reg().browsers[pin.id].launchFlags });
  const c2 = fake.calls().length;
  await k.stop(pin.id, { why: 'user' });
  ok(callsOf(ns, c2).every((c) => c.exe === B151) && callsOf(ns, c2).some((c) => c.verb === 'close --all'), 'the stop\'s own call carries it too (a differing view would relaunch Chrome)');
  // the build VANISHES
  fs.renameSync(path.dirname(B151), path.dirname(B151) + '.away');
  const n0 = fake.launches().length, t0 = todos.length;
  const e1 = await thr(() => k.start(pin.id, { why: 'test' }));
  ok(e1 && e1.code === 'browser_build_missing' && /151\.0\.7922\.34/.test(e1.message) && fake.launches().length === n0, 'a chosen build that VANISHED ⇒ the launch is refused BY NAME (browser_build_missing) — nothing launched, never another build', e1 && e1.code);
  const pr = k.profile(pin.id);
  ok(pr.buildMissing && pr.buildMissing.what === '151.0.7922.34' && todos.length === t0 + 1 && todos.at(-1).origin === 'browser' && /cannot start/.test(todos.at(-1).text), 'the record is MARKED (the panel row says it) and ONE For-you item is filed (origin browser)', { m: pr.buildMissing, todos: todos.length - t0 });
  const e2 = await thr(() => k.start(pin.id, { why: 'test' }));
  ok(e2 && e2.code === 'browser_build_missing' && todos.length === t0 + 1, '…a second refused launch files nothing more (ONE item per profile and choice)');
  ok(k.list().browsers[pin.id] === undefined || k.list().browsers[pin.id].state !== 'starting', 'no half-started record is left behind');
  fs.renameSync(path.dirname(B151) + '.away', path.dirname(B151));
  await k.start(pin.id, { why: 'test' });
  ok(!k.profile(pin.id).buildMissing && fake.launches().at(-1).exe === B151, 'the build back ⇒ it starts, and the mark clears by itself');
  // CHANGE BUILD… under a holder
  const lease = await k.attach({ profileId: pin.id, browserKey: KEY_A, sessionId: 'sess-a', by: 'user' });
  k.onRelaunch((ev) => relaunches.push(ev));
  const nOpens = fake.opens().length, c3 = fake.calls().length;
  const r = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '146.0.7680.153' }, confirmed: false, by: 'user' }).catch((e) => e);
  ok(r && r.code === 'downgrade_refused' && /151/.test(r.message) && /146/.test(r.message), 'Change build… to an OLDER major than the one that last wrote the profile ⇒ refused by name (the §7.4 ladder: it would damage its saved logins)', r && (r.code || r));
  ok(relaunches.length === 0 && callsOf(ns, c3).every((c) => c.verb !== 'close --all'), '…and a refusal touched nothing: nobody told, no stop');
  // a NEWER build (made now) — the running browser restarts and the holder is told first
  const B152 = mkBuild('152.0.1.2');
  const r2 = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '152.0.1.2' }, by: 'user' });
  ok(r2.ok && r2.restarted && r2.told.length === 1 && relaunches.length === 1 && relaunches[0].browserKey === KEY_A && relaunches[0].from === 'Chrome 151.0.7922.34' && relaunches[0].to === 'Chrome 152.0.1.2' && relaunches[0].label === 'Pinned',
    'a running browser RESTARTS on the new build and every conversation on it is told (the relaunch seam: label, from, to) — never a silent restart under a holder', { r2: { ok: r2.ok, restarted: r2.restarted, told: r2.told }, relaunches });
  ok(relaunches[0].outcome === 'changed' && /it restarted and your tab reopened/.test(require('../src/browser-interrupt.js').relaunchText(relaunches[0])), 'verify r1 (F9): the holder is told AFTER the restart, what happened — "changed" (it runs the new build)', relaunches[0]);
  ok(fake.launches().at(-1).exe === B152 && callsOf(ns, c3).filter((c) => c.verb === 'close --all').length >= 1 && fake.opens().slice(nOpens).some((o) => o.verb === 'tab new' && o.session === 'vs-' + KEY_A), 'the old browser was stopped, the new one launched with the new executable, and the holder\'s tab reopened in it', fake.opens().slice(nOpens));
  ok(k.list().browsers[pin.id].runningBuild === '152.0.1.2' && lease && lease.lease, 'the running build follows (the browser\'s own answer)');
  const r3 = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '152.0.1.2' }, by: 'user' }).catch((e) => e);
  ok(r3 && r3.code === 'build_noop', 'the same build again ⇒ build_noop');
  // verify r1 (F1): the user DRIVES this browser (a takeover from a live view) ⇒ Change build… is refused BY NAME, nobody
  // told, nothing stopped (the switch's `driving` rule — never a restart under his hands); handed back ⇒ it works
  const B153 = mkBuild('153.0.1.1');
  const tk = k.takeover({ browserKey: KEY_A, profileId: pin.id, viewerId: 'viewer-1', sessionId: 'sess-a' });
  const bvD = await k.buildsView(pin.id);
  const nRel = relaunches.length, c4 = fake.calls().length;
  const rD = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '153.0.1.1' }, by: 'user' }).catch((e) => e);
  ok(tk && tk.ok && bvD.driven === KEY_A && rD && rD.code === 'browser_driven' && /hand the browser back/.test(rD.message) && rD.driver === KEY_A && relaunches.length === nRel && callsOf(ns, c4).every((c) => c.verb !== 'close --all') && k.list().browsers[pin.id].runningBuild === '152.0.1.2',
    'a browser the user is DRIVING (a takeover) is never restarted under his hands: Change build… refused by name (browser_driven, the driver named), the dialog says who drives it, nobody told, no stop', { tk, driven: bvD.driven, code: rD && rD.code, msg: rD && rD.message });
  k.handback({ browserKey: KEY_A, profileId: pin.id, cause: 'explicit' });
  const rH = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '153.0.1.1' }, by: 'user' }).catch((e) => e);
  ok(rH && rH.ok && rH.restarted && (await k.buildsView(pin.id)).driven === null && fake.launches().at(-1).exe === B153, '…handed back ⇒ the change restarts it as before (the driver gone from the dialog\'s facts)', rH && (rH.code || rH.restarted));
  // verify r2 (H2): a takeover that lands INSIDE the restart (after the stop, before the new launch) — refused by name; the
  // restart never goes on under the user's hands (his take was accepted before: the tab reopened and the card told while he drove)
  mkBuild('154.0.1.1'); mkBuild('155.0.1.1'); // newer than what runs (no downgrade refusal first)
  const h2 = await raceLeg(k, pin.id, '154.0.1.1');
  ok(h2.sawStop && h2.take && h2.take.ok === false && h2.take.code === 'browser_restarting' && /take over again in a few seconds/.test(h2.take.error) && h2.change.ok && h2.inputAfter === 'agent',
    'a takeover raced into the restart (after the stop, before the new launch) is refused BY NAME (browser_restarting, "take over again in a few seconds"): the change completes, nobody drives', h2);
  ok(h2.after && h2.after.ok === true, '…and once the browser is back the same take over works', h2.after);
  // verify r2 (B5): the new build starts, then closes within seconds ⇒ a SECOND message names the fall-back, the choice goes
  // back, the tabs reopen once per launch, ONE For-you notice names the build — never healed on the dead build, never silent
  const fb = await fallBackLeg(K);
  ok(fb.change === true && fb.events.map((e) => e.outcome).join() === 'changed,fell-back' && fb.choice === '156.0.1.1' && fb.launches.join() === 'chrome-156.0.1.1,chrome-157.0.1.1,chrome-156.0.1.1' && fb.live && fb.leases === 1,
    'Change build… to a build that closes within seconds: "changed", then "fell-back" — the choice back on 156 and the browser started on it (never healed on 157)', fb);
  ok(fb.reopens === 2, `…the conversation's tab reopened ONCE per launch (the change's, the fall-back's — ${fb.reopens})`, fb.reopens);
  ok(fb.todos.length === 1 && /Chrome 157\.0\.1\.1 closed within seconds of starting — it is back on Chrome 156\.0\.1\.1/.test(fb.todos[0]), '…and ONE For-you notice names the build that closed and the one it is back on', fb.todos);
  const INT5 = require('../src/browser-interrupt.js');
  ok(/closed within seconds of starting, so it restarted on Chrome 156\.0\.1\.1 again and your tab reopened/.test(INT5.relaunchText({ label: 'Settling', ...fb.events[1] })), '…the conversation\'s second card / notice: "… closed within seconds of starting, so it restarted on Chrome 156 again"', INT5.relaunchText({ label: 'Settling', ...fb.events[1] }));
  const fd = await fallBackLeg(K, { failBack: true });
  ok(fd.events.map((e) => e.outcome).join() === 'changed,fell-down' && fd.choice === '156.0.1.1' && !fd.live && fd.leases === 1 && /did not start again either/.test(fd.todos[0] || '') && /it is not running now \(your next browser command starts it on Chrome 156\.0\.1\.1\)/.test(INT5.relaunchText({ label: 'S', ...fd.events[1] })),
    'the old build does not start either ⇒ "fell-down": not running, the lease kept, the next command starts it on 156 — said to the conversation and the user', fd);
  const fa = await fallBackLeg(K, { aged: true });
  ok(fa.events.map((e) => e.outcome).join() === 'changed' && fa.choice === '157.0.1.1' && fa.todos.length === 0, 'a browser lost PAST the settle window is no fall-back — the choice stays (the ordinary heal decides)', fa);
  { const lw = read('src/lib/browser-live-window.js'); const KEYW = 'The browser is restarting — take over again in a few seconds, when it is back'; const zhD = (await import('../src/lib/i18n-zh.js')).default, jaD = (await import('../src/lib/i18n-ja.js')).default;
    ok(lw.includes(`else if (m.code === 'browser_restarting') showToast(t('${KEYW}'), { type: 'warn' });`) && zhD[KEYW] && jaD[KEYW], 'the live view says the refusal in the device\'s language (its own toast, zh / ja), never the raw server sentence'); }
  k.handback({ browserKey: KEY_A, profileId: pin.id, cause: 'explicit' });
  // …and Browse yourself IN FLIGHT (his own tab being opened) holds a Change build… off like his browsing does
  const bw = k.browse(pin.id).catch((e) => ({ code: e.code }));
  const rB = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '155.0.1.1' }, by: 'user' }).catch((e) => e);
  const bwr = await bw;
  ok(rB && rB.code === 'browsing_yourself' && bwr && bwr.ok, 'a Change build… while his Browse yourself is still opening his tab ⇒ browsing_yourself (never a restart that closes the tab he is opening)', { rB: rB && (rB.code || rB.restarted), bwr });
  try { await k.endHuman(pin.id, 'closed', { closeTab: true }); } catch { /* none */ }
  // verify r1 (F9): the NEW build does not start ⇒ the old one runs again, and the holder is told THAT (never "restarted on the
  // new build"); neither starts ⇒ told it is not running (the next command starts it on the old build) — never a dead lease
  const of9 = await relaunchOutcomeLeg(K);
  const INT = require('../src/browser-interrupt.js'), SS = require('../src/session-status.js');
  ok(of9.restored.err && of9.restored.err.code === 'launch_failed' && of9.restored.err.restored === true && of9.restored.live && of9.restored.choice === 'default' && of9.restored.events.length === 1 && of9.restored.events[0].outcome === 'restored'
    && /did not start, so it restarted on the default build again/.test(INT.relaunchText(of9.restored.events[0])) && !/changed the Chrome build/.test(INT.relaunchText(of9.restored.events[0])),
    'the new build did not start ⇒ the OLD build runs again (restored), the choice put back, and the holder is told it is back on the old build — told after the outcome, never "restarted on Chrome 160"', of9.restored);
  ok(of9.down.err && of9.down.err.restored === false && !of9.down.live && of9.down.leases === 1 && of9.down.events.length === 1 && of9.down.events[0].outcome === 'down' && /not running now/.test(INT.relaunchText(of9.down.events[0])),
    'neither build starts ⇒ the lease stays (the next command starts it on the old build) and the holder is told it is NOT running — never "it restarted and your tab reopened"', of9.down);
  ok(/did not start, so it restarted on the default build again/.test(SS.SessionStatusManager.renderNotice({ kind: 'browser-relaunch', label: 'W', from: 'the default build', to: 'Chrome 152.0.1.2', outcome: 'restored', n: 0, verbs: [] })), 'the zero-spend notice the agent reads at its next turn carries the outcome too (session-status renders relaunchText with it)');
  // back to the default, browser stopped first ⇒ just recorded
  await k.stop(pin.id, { why: 'user' });
  const r4 = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'default' }, by: 'user' });
  ok(r4.ok && r4.restarted === false && !k.profile(pin.id).browser, 'a browser that is not running: the choice is recorded, nothing restarts (its next start runs it)');
  // a cloak profile never takes a build
  const e5 = await thr(() => k.setBrowserChoice({ profileId: plain.id, choice: { kind: 'build', version: '152.0.1.2' }, by: 'agent' }));
  ok(e5 && e5.code === 'browser_choice_user_only', 'Change build… by an agent ⇒ refused by name');
}

/** verify r2 (B5): Change build… to a build that LAUNCHES and then closes within seconds (measured on the real 0.38.1: a
 *  build wrapped to die at 3 s was healed three times in its own daemon, then browser_unstable — the conversation told only
 *  "changed", the choice left on the dead build). The fake has no Chrome to lose, so the loss is the tick's own reading
 *  (`browserLost`, the record of a browser gone while its daemon lives) — then THE TICK decides. `failBack` = the old build
 *  does not start either; `aged` = the loss is seen past the settle window. → events, todos, choice, launches, reopens. */
async function fallBackLeg(KK, { failBack = false, aged = false } = {}) {
  const st = path.join(ROOT, 'ab-b5-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(st, { recursive: true });
  const dd = path.join(ROOT, 'data-b5-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dd, { recursive: true });
  mkBuild('156.0.1.1'); mkBuild('157.0.1.1'); // newer than every build an earlier leg left the shared CDP answer naming (no downgrade refusal)
  const todos5 = []; let clock = Date.now();
  const k5 = KK.create({ dataDir: dd, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: st, FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, now: () => clock, userTodos: { add: (w, item) => { todos5.push(item); return { id: 'u' + todos5.length }; } } });
  const p5 = k5.createProfile({ label: 'Settling', browser: { kind: 'build', version: '156.0.1.1' } });
  await k5.start(p5.id, { why: 'test' });
  await k5.attach({ profileId: p5.id, browserKey: KEY_A, sessionId: 'sess-a', by: 'user' });
  const events = []; k5.onRelaunch((ev) => events.push({ outcome: ev.outcome, from: ev.from, to: ev.to }));
  const r = await k5.setBrowserChoice({ profileId: p5.id, choice: { kind: 'build', version: '157.0.1.1' }, by: 'user' });
  if (failBack) fs.writeFileSync(path.join(st, 'fail-cloak'), '1'); // every launch with an executable fails from here on
  if (aged) clock += 31000; // the loss seen past the settle window
  const rec = k5._reg().browsers[p5.id];
  rec.browserLost = { pid: null, at: clock }; // its Chrome gone, its daemon alive (the tick's own reading)
  await k5.tick();
  for (let i = 0; i < 100 && events.length < 2 && !aged; i++) await new Promise((r2) => setTimeout(r2, 20));
  const readLog = (n) => { try { return fs.readFileSync(path.join(st, n), 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x)); } catch { return []; } };
  const out = { change: r.restarted, events, todos: todos5.map((x) => x.text), choice: (k5.profile(p5.id).browser || { kind: 'default' }).version || 'default', launches: readLog('launches.log').map((l) => (l.exe ? path.basename(path.dirname(l.exe)) : 'default')), reopens: readLog('opens.log').filter((o) => o.session === 'vs-' + KEY_A && o.verb === 'tab new').length, live: !!(k5.list().browsers[p5.id] && k5.list().browsers[p5.id].state === 'ready'), leases: k5.leasesOn(p5.id).length };
  try { fs.rmSync(path.join(st, 'fail-cloak'), { force: true }); await k5.stop(p5.id, { why: 'user' }); } catch { /* none */ }
  for (const l of readLog('launches.log')) { try { process.kill(l.pid, 'SIGKILL'); } catch { /* gone */ } }
  return out;
}
/** verify r2 (H2): Change build… to `to` on a running, leased profile; a takeover is raced in the moment the restart's stop
 *  ran (the fake's close --all logged) — `{sawStop, take, change, inputAfter, after}`. */
async function raceLeg(k, pid, to) {
  const c0 = fake.closes().length;
  const pr = k.setBrowserChoice({ profileId: pid, choice: { kind: 'build', version: to }, by: 'user' }).then((r) => ({ ok: true, restarted: r.restarted }), (e) => ({ ok: false, code: e.code }));
  let sawStop = false; for (let i = 0; i < 20000 && !sawStop; i++) { sawStop = fake.closes().length > c0; if (!sawStop) await new Promise((r) => setImmediate(r)); }
  const take = k.takeover({ browserKey: KEY_A, profileId: pid, viewerId: 'viewer-race', sessionId: 'sess-a', holderAlive: true });
  const change = await pr;
  const inputAfter = (k.inputStateFor(KEY_A, pid) || {}).input;
  const after = k.takeover({ browserKey: KEY_A, profileId: pid, viewerId: 'viewer-race', sessionId: 'sess-a', holderAlive: true });
  return { sawStop, take: take && { ok: take.ok, code: take.code || null, error: take.error || null }, change, inputAfter, after: after && { ok: after.ok, code: after.code || null } };
}
/** verify r1 (F9): Change build… whose new build does not start (`KK` = the keeper module or a patched copy): a holder on a
 *  running default-build browser; the fake refuses a launch WITH an executable (`fail-cloak`), and for `down` every launch. */
async function relaunchOutcomeLeg(KK) {
  const out = {};
  for (const name of ['restored', 'down']) {
    const st = path.join(ROOT, 'ab-f9-' + name + '-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(st, { recursive: true });
    const dd = path.join(ROOT, 'data-f9-' + name + '-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dd, { recursive: true });
    const k9 = KK.create({ dataDir: dd, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: st, FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
    const p9 = k9.createProfile({ label: 'Work' });
    await k9.start(p9.id, { why: 'test' });
    await k9.attach({ profileId: p9.id, browserKey: KEY_A, sessionId: 'sess-a', by: 'user' });
    const events = []; k9.onRelaunch((ev) => events.push(ev));
    fs.writeFileSync(path.join(st, 'fail-cloak'), '1');
    if (name === 'down') fs.writeFileSync(path.join(st, 'fail-plain'), '1');
    mkBuild('160.0.1.1'); // newer than every build the shared fake CDP answer can name (no downgrade refusal first)
    const err = await k9.setBrowserChoice({ profileId: p9.id, choice: { kind: 'build', version: '160.0.1.1' }, by: 'user' }).then(() => null, (e) => e);
    const rec = k9.list().browsers[p9.id];
    out[name] = { err: err && { code: err.code, restored: err.restored }, live: !!(rec && rec.state === 'ready'), choice: (k9.profile(p9.id).browser || { kind: 'default' }).kind, leases: k9.leasesOn(p9.id).length, events };
    try { fs.rmSync(path.join(st, 'fail-plain'), { force: true }); await k9.stop(p9.id, { why: 'user' }); } catch { /* none */ }
    try { for (const l of fs.readFileSync(path.join(st, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x))) { try { process.kill(l.pid, 'SIGKILL'); } catch { /* gone */ } } } catch { /* none */ } // the fake's own reap, over this leg's state
  }
  return out;
}

// ═══ ③ the browser-serve op + the capability gate ════════════════════════════
console.log('— ③ the browser-serve op (what a paired machine runs) + the capability gate');
const S = require('../src/browser-serve.js');
{
  const H3 = path.join(ROOT, 'home-remote');
  fs.mkdirSync(path.join(H3, '.agent-browser', 'browsers', 'chrome-148.0.1.1'), { recursive: true });
  fs.writeFileSync(path.join(H3, '.agent-browser', 'browsers', 'chrome-148.0.1.1', 'chrome'), '#!/bin/sh\n', { mode: 0o755 });
  const seen = [];
  const rt = {
    launch: async (ns, o) => { seen.push({ op: 'launch', env: { ...(o.extraEnv || {}) } }); return { ok: true }; },
    // the daemon's pid is one that is GONE (as after a real close --all): this suite's own pid kept `stop` in its 8 s grace (lane fast-budget)
    info: async () => ({ ok: true, active: true, pid: 2147483000, socketDir: '/tmp', version: '0.38.1' }),
    cdpUrl: async (ns, o) => { seen.push({ op: 'cdp-url', env: { ...(o.extraEnv || {}) } }); return { ok: true, url: `ws://127.0.0.1:${DEAD_CDP}/devtools/browser/x` }; },
    closeAll: async (ns, o) => { seen.push({ op: 'stop', env: { ...(o.extraEnv || {}) } }); return { ok: true }; },
  };
  const bs = { facts: { probeVersion: async () => '0.38.1' }, runtime: rt, homeDir: H3, cmd: 'fake-cli', displayProbe: async () => ({ ok: true, x11: [], wayland: [], why: [] }) };
  const L = await S.runBrowserServeOp(bs, 'builds', {});
  ok(L.ok && L.listing.ok && L.listing.builds.length === 1 && L.listing.builds[0].version === '148.0.1.1' && !('path' in L.listing.builds[0]), 'the `builds` op lists THAT machine\'s builds (plain JSON — no path crosses the wire; the machine resolves a build by version itself)', L);
  const PID = 'bp-0000c0de';
  const st = await S.runBrowserServeOp(bs, 'start', { profileId: PID, browser: { kind: 'build', version: '148.0.1.1' } });
  const exe = path.join(H3, '.agent-browser', 'browsers', 'chrome-148.0.1.1', 'chrome');
  ok(st.ok && seen.find((x) => x.op === 'launch').env.AGENT_BROWSER_EXECUTABLE_PATH === exe && seen.find((x) => x.op === 'cdp-url').env.AGENT_BROWSER_EXECUTABLE_PATH === exe, 'a start with a build: its executable on the launch AND on the start\'s own cdp-url', seen);
  seen.length = 0;
  await S.runBrowserServeOp(bs, 'cdp-url', { profileId: PID }); await S.runBrowserServeOp(bs, 'stop', { profileId: PID });
  ok(seen.length === 2 && seen.every((x) => x.env.AGENT_BROWSER_EXECUTABLE_PATH === exe) && fs.existsSync(S.buildFileOf(bs, B_ns(PID))), '…and on EVERY later op of that profile (cdp-url, stop) through the machine\'s own view file', seen);
  const bad = await S.runBrowserServeOp(bs, 'start', { profileId: PID, browser: { kind: 'build', version: '149.0.1.1' } });
  ok(bad.ok === false && bad.code === 'browser_build_missing', 'a build that machine does not have ⇒ refused THERE, by name (never its default build)', bad);
  seen.length = 0;
  await S.runBrowserServeOp(bs, 'start', { profileId: PID });
  ok(!seen.some((x) => x.env.AGENT_BROWSER_EXECUTABLE_PATH) && !fs.existsSync(S.buildFileOf(bs, B_ns(PID))), 'a default start removes the view file — its existence IS the view', seen);
  // the capability gate (client.js): never asked, never handed a start with a build
  const { DeviceManager } = require('../src/agentd/client.js');
  const mk = (caps) => { const dm = Object.create(DeviceManager.prototype); dm.asked = 0; dm.connect = async () => ({ info: { capabilities: caps } }); dm._request = async () => { dm.asked++; return { result: { ok: true, listing: { ok: true, builds: [] } } }; }; return dm; };
  const old = mk(['browser-serve']);
  const e1 = await thr(() => old.browserServe('builds', {}, { by: 'system:test' }));
  const e2 = await thr(() => old.browserServe('start', { profileId: PID, browser: { kind: 'build', version: '148.0.1.1' } }, { by: 'system:test' }));
  const okStart = await old.browserServe('start', { profileId: PID }, { by: 'system:test' });
  ok(e1 && e1.code === 'builds_unsupported' && e2 && e2.code === 'builds_unsupported' && old.asked === 1 && okStart.ok, 'an agent WITHOUT `browser-builds`: the list and a start with a build are refused builds_unsupported with ZERO requests; a default start still goes', { asked: old.asked });
  const cur = mk(['browser-serve', 'browser-builds']);
  const ok1 = await cur.browserServe('builds', {}, { by: 'system:test' });
  ok(ok1.ok && cur.asked === 1, 'an agent WITH it is asked');
  const ad = read('src/agentd/agentd.js');
  ok(/capabilities: \[[^\]]*'browser-serve', 'browser-builds'/.test(ad) && /require\('\.\/\.\.\/browser-serve\.js'\)/.test(ad), 'the daemon advertises `browser-builds` beside `browser-serve` and runs the SAME op table (the daemon bundles src/browser-serve.js → src/browser-builds.js)');
  const ac = read('src/server/browser-access.js');
  ok(/e\.code === 'builds_unsupported'( \|\| e\.code === 'remove_unsupported')?\) \? e\.code/.test(ac), 'the access layer keeps the code by name (never folded into host_unavailable)'); // lane remote-profile-start: + remove_unsupported beside it
}
function B_ns(pid) { return require('../src/browser-profiles.js').sessionNameFor(pid); }

// ═══ ③b chunk 3: the agent's side — FACTS, never a choice ═══════════════════════
console.log('— ③b the agent\'s side: `providers` lists the builds and the CLI version as facts; nothing it sends chooses a build');
{
  const express = require('express');
  const R = require('../src/routes/browser.js');
  const kA = mkKeeper(path.join(ROOT, 'data-agent'));
  const TOKEN = 'vsst_' + 'e'.repeat(24);
  const app = express(); app.use(express.json());
  R.setup({ keeper: kA, activeSessions: new Map([['s1', { agentToken: TOKEN, _browserKey: KEY_A }]]), browserEnv: () => null });
  app.use(R.router);
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p, body) => { const res = await fetch(API + p, { method, headers: { Authorization: 'Bearer ' + TOKEN, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  let r = await j('GET', '/api/agent/browser/providers');
  const txt = JSON.stringify({ builds: (r.json || {}).builds, cli: (r.json || {}).cli }); // the two fields this lane adds (the provider rows' `binary` cell is the documented exception)
  ok(r.status === 200 && r.json.builds && r.json.builds.ok && r.json.builds.builds.some((b) => b.version === '151.0.7922.34') && !('root' in r.json.builds) && r.json.cli && r.json.cli.table === require('../src/browser-verbs.js').TABLE_VERSION && 'inUse' in r.json.cli,
    'the agent\'s `providers` answer carries this machine\'s builds and the browser CLI version in use — versions only', { builds: r.json && r.json.builds, cli: r.json && r.json.cli });
  ok(!/agent-browser/.test(txt) && !txt.includes(HOME) && !txt.includes(ROOT), '…and no path at all (never the hidden CLI\'s location, never the account\'s home)', (txt.match(/.{60}(?:agent-browser|vs-badm).{60}/g) || []).slice(0, 4));
  const n0 = kA.list().profiles.length;
  r = await j('POST', '/api/agent/browser/new', { label: 'Agent build', browser: { kind: 'build', version: '151.0.7922.34' } });
  ok(r.status === 403 && r.json.code === 'browser_choice_user_only' && kA.list().profiles.length === n0, 'an agent\'s `new` naming a build ⇒ 403 browser_choice_user_only, nothing created');
  r = await j('POST', '/api/agent/browser/new', { label: 'Agent plain' });
  ok(r.status === 200 && r.json.profile && !r.json.profile.browser, 'an agent\'s plain `new` still works (the default build)');
  r = await j('POST', `/api/browser/profiles/${r.json.profile.id}/build`, { choice: { kind: 'build', version: '151.0.7922.34' } });
  ok(r.status === 403 && r.json.code === 'agent_forbidden', 'Change build… with an agent\'s token ⇒ 403 agent_forbidden');
  // verify r1 (F5): a build's PATH never reaches an agent — a chrome file the user named is a fact by KIND only on every
  // agent answer (status / profiles / use / the switcher view), and no launch view (its executable path) crosses either
  const pathExe = path.join(ROOT, 'named chrome', 'chrome'); fs.mkdirSync(path.dirname(pathExe), { recursive: true }); fs.writeFileSync(pathExe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const pp = kA.createProfile({ label: 'By path', browser: { kind: 'path', path: pathExe } });
  await kA.start(pp.id, { why: 'test' });
  await kA.attach({ profileId: pp.id, browserKey: KEY_A, sessionId: 's1', by: 'user' });
  const answers = {};
  for (const [name, m, p, body] of [['status', 'GET', '/api/agent/browser/status'], ['profiles', 'GET', '/api/agent/browser/profiles'], ['use', 'POST', '/api/agent/browser/use', { profile: pp.id }]]) { const x = await j(m, p, body); answers[name] = { status: x.status, text: JSON.stringify(x.json) }; }
  answers.switcher = { status: 200, text: JSON.stringify(kA.switcherView(pp.id, { forAgent: true }).build) };
  const leaks = Object.entries(answers).filter(([, a]) => a.text.includes(path.dirname(pathExe)) || /launchEnv|AGENT_BROWSER_EXECUTABLE_PATH/.test(a.text));
  ok(Object.values(answers).every((a) => a.status === 200) && leaks.length === 0 && /"kind":"path"/.test(answers.profiles.text) && /"kind":"path"/.test(answers.switcher.text),
    'a chrome file the user named is a FACT by kind only for an agent: status / profiles / use / the switcher view carry neither its path nor the launch view (no launchEnv, no AGENT_BROWSER_EXECUTABLE_PATH)', { statuses: Object.fromEntries(Object.entries(answers).map(([n, a]) => [n, a.status])), leaks: leaks.map(([n, a]) => n + ': ' + (a.text.match(/.{0,50}(?:named chrome|launchEnv|EXECUTABLE).{0,60}/) || [''])[0]) });
  const hv = await kA.buildsView(pp.id);
  ok(hv.choice && hv.choice.path === pathExe && kA.switcherView(pp.id).build.choice.path === pathExe, '…while the user\'s own dialog and switch view still name the file he typed');
  try { await kA.stop(pp.id, { why: 'user' }); } catch { /* none */ }
  await new Promise((res) => srv.close(res));
  const cli = read('data/bin/vibespace-browser');
  ok(/console\.log\(`chrome builds\$\{r\.host \? ' on ' \+ r\.host : ' here'\}: /.test(cli) && /console\.log\(`browser driver: \$\{r\.cli\.inUse \|\| 'unknown'\} in use/.test(cli) && !/executable-path/.test(cli.slice(cli.indexOf("if (verb === 'providers')"), cli.indexOf("if (verb === 'new-child')"))),
    '`vibespace-browser providers` prints the builds and the driver version as facts (and offers no way to set one)');
}

// ═══ ④ the client words + wiring ═══════════════════════════════════════════════
console.log('— ④ the client words (en / zh / ja) + wiring');
{
  const W = await import('../src/lib/browser-build-model.js');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const mkT = (d) => (k, p) => { let s = (d && d[k]) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
  const t = mkT(null);
  ok(W.cardBuildLine({ choice: { kind: 'build', version: '151.0.7922.34' } }, t).text === 'Chrome 151.0.7922.34 (pinned)' && W.cardBuildLine({ choice: null }, t).text === "The browser CLI's default build"
    && W.cardBuildLine({ choice: { kind: 'path', path: '/opt/c/chrome' } }, t).text === 'The chrome at /opt/c/chrome (pinned)' && W.cardBuildLine({ choice: null, live: true, running: '149.0.1.1' }, t).text === "The browser CLI's default build · running Chrome 149.0.1.1"
    && W.cardBuildLine({ buildChoice: false }, t) === null && W.cardBuildLine({ choice: { kind: 'build', version: '151.0.7922.34' }, missing: { what: '151.0.7922.34' } }, t).warn === true,
  'the profile card: "Chrome 151.0.7922.34 (pinned)" / the CLI\'s default build / a path; the build its browser RUNS while live; a missing one amber; nothing for CloakBrowser');
  const rows = W.buildRows({ ok: true, builds: [{ version: '152.0.1.2', usable: true }, { version: '146.0.7680.153', usable: true }, { version: '139.0.1.1', usable: false, why: 'not-executable' }] }, { choice: { kind: 'build', version: '151.0.7922.34' }, lastChromiumMajor: 151, local: true, t });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  ok(rows[0].key === 'default' && byKey['v:152.0.1.2'].pickable && !byKey['v:146.0.7680.153'].pickable && /Older/.test(byKey['v:146.0.7680.153'].note) && !byKey['v:139.0.1.1'].pickable && byKey['v:151.0.7922.34'].current && !byKey['v:151.0.7922.34'].pickable && byKey.path,
    'Change build… rows: the default first; every build a row; an older one / one that cannot run greyed WITH why; a chosen build gone from the list still shown (what it was set to); a path row on this computer', rows.map((r) => [r.key, r.pickable, r.note]));
  const unsup = W.buildRows({ ok: false, code: 'builds_unsupported' }, { machine: 'mac', local: false, t });
  ok(unsup.length === 2 && unsup[0].pickable && /can't list Chrome builds/.test(unsup[1].label) && !unsup.some((r) => r.key === 'path'), 'a machine whose agent cannot list builds: the default stays, one sentence says why (no path row off this computer)');
  // lane mirror-green-ui (2.369.205): a list ASKED and not yet answered is said as waiting — never "could not be read"
  const pend = W.buildRows({ pending: true }, { t });
  ok(pend[0].key === 'default' && pend.some((r) => r.kind === 'note' && /^Reading the list of Chrome builds/.test(r.label)) && !pend.some((r) => /could not be read/.test(r.label || '')) && !pend.some((r) => r.kind === 'build') && pend.some((r) => r.key === 'path'),
    'a list asked and not yet answered: the default, ONE "Reading the list…" note (never "could not be read"), no build rows yet', pend.map((r) => [r.key, r.label]));
  ok(JSON.stringify(W.choiceOfRow(byKey['v:152.0.1.2'])) === JSON.stringify({ kind: 'build', version: '152.0.1.2' }) && W.choiceOfRow(byKey.path, 'rel') === null && W.choiceOfRow(byKey.path, ' /opt/c/chrome ').path === '/opt/c/chrome' && W.choiceOfRow(byKey['v:146.0.7680.153']) === null, 'a picked row → the choice sent (an unpickable row / a relative path send nothing)');
  ok(/2 conversation\(s\)/.test(W.changeSentences({ live: true, holders: 2 }, t)[0].text) && /next start/.test(W.changeSentences({ live: false }, t)[0].text), 'the sentence above the button: a running browser restarts and N conversations are told; a stopped one changes at its next start');
  ok(/agent-browser install/.test(W.installHint({ command: 'agent-browser install', local: false }, t)) && W.installHint({ command: '' }, t) === null, 'how to add a build: the command, where to run it (installing is the user\'s act, held for a later lane)');
  const CODES = ['browser_build_missing', 'browser_build_not_executable', 'browser_path_missing', 'browser_path_not_executable', 'browser_choice_invalid', 'browser_choice_provider', 'browser_choice_user_only', 'builds_unsupported', 'builds_unreadable', 'downgrade_refused', 'downgrade_unknown', 'build_noop', 'browsing_yourself', 'browser_restarting'];
  ok(CODES.every((c) => W.buildRefusalWords({ code: c }, t)) && W.buildRefusalWords({ code: 'x' }, t) === null && CODES.every((c) => BB.BUILD_CODES.includes(c) || ['build_noop', 'browsing_yourself', 'browser_restarting'].includes(c)), 'every refusal code has its sentence (an unknown one is null — the caller adds the server\'s)');
  const said = new Set(); const rec = (k) => { said.add(k); return k; };
  for (const o of [{ choice: { kind: 'build', version: '1.2.3.4' } }, { choice: null }, { choice: { kind: 'path', path: '/a' } }, { choice: null, live: true, running: '1.2.3' }, { choice: { kind: 'build', version: '1.2.3.4' }, missing: {} }]) W.cardBuildLine(o, rec);
  W.buildRows({ ok: true, builds: [{ version: '152.0.1.2', usable: true }, { version: '146.0.1.1', usable: true }, { version: '139.0.1.1', usable: false, why: 'not-executable' }, { version: '138.0.1.1', usable: false, why: 'missing' }] }, { choice: { kind: 'build', version: '151.0.1.1' }, lastChromiumMajor: 151, t: rec });
  W.buildRows({ ok: true, builds: [] }, { t: rec }); W.buildRows({ ok: false, code: 'builds_unsupported' }, { t: rec }); W.buildRows(null, { t: rec }); W.buildRows({ pending: true }, { t: rec });
  W.changeSentences({ live: true, holders: 1 }, rec); W.changeSentences({ live: true, holders: 0 }, rec); W.changeSentences({ live: false }, rec);
  W.installHint({ command: 'x', local: true }, rec); W.installHint({ command: 'x', local: false }, rec);
  W.changedWords({ restarted: false }, rec); W.changedWords({ restarted: true, told: 1 }, rec); W.changedWords({ restarted: true, told: 0 }, rec);
  for (const c of CODES) W.buildRefusalWords({ code: c }, rec);
  const noZh = [...said].filter((k) => !(k in zh)), noJa = [...said].filter((k) => !(k in ja));
  ok(said.size > 25 && !noZh.length && !noJa.length, `every sentence the build model says (${said.size}) has a zh and a ja entry`, { noZh, noJa });
  const tv = read('src/lib/browser-trace-view.js');
  ok(/cardBuildLine\(\{ buildChoice: r\.buildChoice, choice: r\.browser, running: runningBuildOf\(r\.id\), missing: r\.buildMissing, live: !!r\.live \}, t\)/.test(tv) && /build: \(r\) => openBuildDialog\(app, r\.id,/.test(tv) && /id: 'build', label: t\('Change build…'\)/.test(read('src/lib/browser-panel-model.js')) /* design 015: the ⋯ menu's act */ && /runningBuildOf\(r\.id\)\]\); \};/.test(tv),
    'the Agent browser panel row: the build line (its fact in the row\'s signature) + Change build… opening THE dialog');
  const sw = read('src/lib/browser-switcher.js');
  ok(/st\.view\.build \? cardBuildLine\(/.test(sw) && /a\.kind === 'build'\) \{ close\(\); openBuildDialog\(app, profileId,/.test(sw), 'the switch dialog gains the build row and its ONE act');
  const rb = read('src/routes/browser.js');
  ok(/router\.post\('\/api\/browser\/profiles\/:id\/build', async \(req, res\) => \{\s*if \(refuseHost\(req, res\)\) return;\s*if \(refuseAgentBearer\(req, res, BUILD_IS_USERS\)\) return;/.test(rb) && /if \(req\.body && req\.body\.browser != null\) return res\.status\(403\)\.json\(\{ error: BUILD_IS_USERS, code: 'browser_choice_user_only' \}\);/.test(rb)
    && /createdBy: f\.browserKey, by: 'agent' \}/.test(rb), 'the routes: Change build… is cookie-only (an agent token refused by name); the agent\'s `new` refuses a build and creates `by: agent`');
  const hb = read('src/server/browser-handback.js');
  ok(/keeper\.onRelaunch\(\(ev\) => \{ try \{ announceRelaunch\(ev\);/.test(hb) && !/announceRelaunch[\s\S]{0,2500}deliverToConversation/.test(hb.slice(hb.indexOf('function announceRelaunch'), hb.indexOf('function announceRelaunch') + 2500)), 'the announcer tells a relaunch through the CARD path + a zero-spend notice (never a delivery — nobody typed it)');
}

// ═══ ⑥ lane chrome-builds-download (design 004): the PURE half + the picker's words ═══════════════════════════════
console.log('— ⑥ Download another build…: the two list parsers, THE compatibility verdict, the paths, the zip\'s shape, the words');
{
  const V = require('../src/browser-verbs.js'); const R = V.CHROME_BUILDS_RECORD;
  const FIX = path.join(REPO, 'scripts/fixtures/chrome-for-testing');
  const lkg = JSON.parse(fs.readFileSync(path.join(FIX, 'last-known-good-versions-with-downloads.json'), 'utf8'));
  const kg = JSON.parse(fs.readFileSync(path.join(FIX, 'known-good-versions-with-downloads.trimmed.json'), 'utf8'));
  ok(R.listHost === 'googlechromelabs.github.io' && R.fileHost === 'storage.googleapis.com' && R.platform === 'linux64' && R.layout === 'chrome-linux64/' && R.measured.stable === '154.0.8037.92' && R.measured.bytes === 196202491 && Object.isFrozen(R),
    'CHROME_BUILDS_RECORD: the two measured hosts (the ONE place they are spelled), the platform, the layout, the measurement');
  const p1 = BB.parseLastKnownGood(lkg, { fileHost: R.fileHost });
  ok(p1.ok && p1.rows.map((r) => r.channel).join() === 'Stable,Beta,Dev,Canary' && p1.rows[0].version === '154.0.8037.92' && p1.rows.every((r) => r.url === `https://${R.fileHost}/chrome-for-testing-public/${r.version}/linux64/chrome-linux64.zip`) && !p1.refused.length, 'the 10 KB channel list (measured): four rows, each the linux64 zip on the file host', p1.rows);
  const planted = JSON.parse(JSON.stringify(lkg));
  planted.channels.Beta.downloads.chrome.find((d) => d.platform === 'linux64').url = 'https://evil.example.com/chrome-linux64.zip';
  planted.channels.Dev.downloads.chrome.find((d) => d.platform === 'linux64').url = `http://${R.fileHost}/x.zip`;
  planted.channels.Canary.downloads.chrome.find((d) => d.platform === 'linux64').url = `https://u:p@${R.fileHost}/x.zip`;
  const p2 = BB.parseLastKnownGood(planted, { fileHost: R.fileHost });
  ok(p2.ok && p2.rows.map((r) => r.channel).join() === 'Stable' && p2.refused.length === 3 && p2.refused.every((x) => x.code === 'build_url_offhost') && /evil\.example\.com/.test(p2.refused[0].error), 'an off-host url, a plain-http one, one with credentials: each row refused BY NAME, never offered', p2.refused);
  ok(BB.parseLastKnownGood({ nope: 1 }, { fileHost: R.fileHost }).code === 'build_list_invalid' && BB.parseKnownGood({ versions: 'x' }, { fileHost: R.fileHost }).code === 'build_list_invalid', 'a document of another shape: refused whole (`build_list_invalid`), never a crash');
  const p3 = BB.parseKnownGood(kg, { fileHost: R.fileHost });
  ok(p3.ok && p3.versions.length === 23 && p3.versions[0].version === '157.0.8083.0' && p3.versions.at(-1).version === '113.0.5672.0' && BB.majorsOf(p3.versions).map((m) => m.major).join() === '157,154,153,151,146,113' && BB.majorsOf(p3.versions).find((m) => m.major === 151).count === 4,
    'the known-good list (trimmed to 6 majors): every linux64 version newest first; one row per major with its newest and its count');
  const C = (o) => BB.buildCompatVerdict({ version: '155.0.1.2', platform: 'linux', arch: 'x64', ...o });
  const chip = (v, k) => v.chips.find((x) => x.kind === k);
  const mac = C({ platform: 'darwin', arch: 'arm64', command: '/x/agent-browser install' });
  ok(!mac.ok && mac.code === 'build_platform_unsupported' && /Linux x64.*darwin-arm64 install by hand: \/x\/agent-browser install/.test(mac.error), 'HARD machine: off Linux x64 the download is refused, the hand command said', mac.error);
  const d1 = C({ zipBytes: 100e6, freeBytes: 299e6, freePath: '/home' }), d2 = C({ zipBytes: 100e6, freeBytes: 300e6 }), d3 = C({ freeBytes: 1 });
  ok(!d1.ok && d1.code === 'disk' && d1.hard[0].need === 300e6 && /needs about 300 MB free, 299 MB left on \/home/.test(d1.error) && d2.ok && d3.ok && !d3.hard.length, 'HARD disk: free bytes against the zip\'s length × 3, with the numbers; no length yet ⇒ no disk row');
  ok(C({ present: true }).ok && C({ present: true }).offer === false && chip(C({ present: true }), 'present'), 'present: a chip ("Already on this computer"), the row offers nothing — not a refusal');
  ok(chip(C({ census: 'newer', censusChrome: '154.0.8037.57' }), 'census').census === '154.0.8037.57' && chip(C({ census: 'between' }), 'census').relation === 'older' && chip(C({ census: 'censused' }), 'census').relation === 'censused', 'the census chip: the relation chromeRelation gave (between reads as older)');
  ok(chip(C({ profile: { label: 'Work', lastChromiumMajor: 156 } }), 'profile').wrote === 156 && !chip(C({ profile: { label: 'Work', lastChromiumMajor: 155 } }), 'profile') && !chip(C({ profile: { lastChromiumMajor: null } }), 'profile'), 'this profile: a chip only for a build OLDER than the major that last opened it');
  const reach = (v) => chip(BB.buildCompatVerdict({ version: v, platform: 'linux', arch: 'x64' }), 'cloak').reach;
  ok(reach('146.0.1.1') === 'both' && reach('147.0.1.1') === 'pro' && reach('151.0.1.1') === 'pro' && reach('152.0.1.1') === 'none', 'CloakBrowser later: ≤ 146 both tiers, 147–151 Pro only, ≥ 152 neither (CLOAK_TIERS, F7)');
  const pl = BB.downloadPlan({ version: '154.0.8037.92', buildsRoot: '/h/.agent-browser/browsers' });
  ok(pl.ok && pl.part === '/h/.agent-browser/browsers/chrome-154.0.8037.92.part' && pl.unpackDir === '/h/.agent-browser/browsers/.unpack-154.0.8037.92' && pl.targetDir === '/h/.agent-browser/browsers/chrome-154.0.8037.92' && pl.removingDir === '/h/.agent-browser/browsers/.removing-154.0.8037.92'
    && ['../x', '154.0.8037.92/../../x', '154.0.8037.92/x', ''].every((v) => BB.downloadPlan({ version: v, buildsRoot: '/h' }).code === 'build_version_invalid') && !BB.parseBuildDir('chrome-154.0.8037.92.part') && !BB.parseBuildDir('.unpack-154.0.8037.92'),
    'the plan: every path inside the builds folder; a version that is a path is refused; .part / .unpack- / .removing- are never listed as builds');
  const okZip = ['chrome-linux64/', 'chrome-linux64/chrome', 'chrome-linux64/locales/', 'chrome-linux64/locales/en-US.pak'];
  const Z = (extra, base = okZip) => BB.zipShapeVerdict([...base, ...extra]);
  ok(Z([]).ok && Z([]).files === 2, 'the zip: the measured layout passes');
  const zbad = [[['chrome-linux64/../x'], '..'], [['/etc/passwd'], 'absolute'], [[{ name: 'chrome-linux64/lnk', kind: 'link' }], 'link'], [['other/x'], 'outside'], [['chrome-linux64/chrome'], 'twice'], [['chrome-linux64/a\\b'], 'backslash'], [['chrome-linux64/./x'], '"."'], [[{ name: 'chrome-linux64/fifo', kind: 'other' }], 'special']];
  ok(zbad.every(([e]) => Z(e).code === 'build_zip_shape') && BB.zipShapeVerdict(['chrome-linux64/', 'chrome-linux64/x']).code === 'build_zip_shape' && BB.zipShapeVerdict([]).code === 'build_zip_shape', 'the zip refused by name: "..", absolute, a link, outside the layout, a duplicate, a backslash, ".", a special entry, no chrome, empty', zbad.map(([e, w]) => [w, Z(e).error]));
  const zl = BB.parseZipListing('chrome-linux64/\nchrome-linux64/chrome\nchrome-linux64/l\n', 'Archive:  x.zip\nZip file size: 9 bytes, number of entries: 3\ndrwxr-xr-x  3.0 unx        0 bx stor 26-Oct-02 21:49 chrome-linux64/\n-rwxr-xr-x  3.0 unx       51 tx stor 26-Oct-02 21:49 chrome-linux64/chrome\nlrwxrwxrwx  3.0 unx       11 bx stor 26-Oct-02 21:49 chrome-linux64/l\n3 files, 62 bytes uncompressed\n');
  ok(zl.ok && zl.entries.map((e) => e.kind).join() === 'dir,file,link' && BB.zipShapeVerdict(zl.entries).code === 'build_zip_shape' && BB.parseZipListing('a\nb\n', '-rw-r--r--  3.0 unx 1 tx stor 26-Oct-02 21:49 a\n').code === 'build_zip_shape',
    'unzip\'s two listings paired: names from -Z1, kinds from -Zs (a link is seen); listings that do not pair are refused');
  ok(BB.versionSays('Google Chrome for Testing 154.0.8037.92 \n', '154.0.8037.92').ok && BB.versionSays('Google Chrome for Testing 154.0.8037.93', '154.0.8037.92').says === '154.0.8037.93' && !BB.versionSays('', '1.2.3.4').ok, '`chrome --version` must name exactly the version');
  ok(['build_platform_unsupported', 'disk', 'build_zip_shape', 'build_url_offhost', 'build_in_use', 'build_not_downloaded', 'unzip_unavailable', 'install_running', 'build_stalled'].every((c) => BB.BUILD_CODES.includes(c)) && BB.BUILD_CODES.every((c) => /'?[a-z_]+'?: \d{3}/.test(c) || read('src/routes/browser.js').includes(`${c}: `) || read('src/routes/browser.js').includes(`'${c}': `)),
    'every refusal code is in BUILD_CODES and the routes\' STATUS table');
  const W = await import('../src/lib/browser-build-model.js');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const mkT = (d) => (k, p) => { let x = (d && d[k]) || k; if (p) x = x.replace(/\{(\w+)\}/g, (m, y) => (p[y] !== undefined ? String(p[y]) : m)); return x; };
  const t = mkT(null);
  const rowsDl = W.buildRows({ ok: true, builds: [] }, { local: true, t, download: { offered: true } });
  ok(rowsDl.at(-1).kind === 'download' && rowsDl.at(-1).label === 'Download another build…' && !W.buildRows({ ok: true, builds: [] }, { local: false, t, download: { offered: false } }).some((r) => r.kind === 'download') && W.choiceOfRow(rowsDl.at(-1)) === null,
    'Change build… / New profile…: the LAST row "Download another build…" on this computer (Linux x64) — an act, never a choice; none on a paired machine');
  ok(W.installHint({ command: 'ab install', local: true, download: { offered: true } }, t) === null && /Linux x64.*darwin-arm64.*ab install/.test(W.installHint({ command: 'ab install', local: true, download: { offered: false, machine: 'darwin-arm64' } }, t)) && /paired machine aren't offered yet.*ab install/.test(W.installHint({ command: 'ab install', local: false, download: { offered: false } }, t)),
    'the hand command: gone where the row is; elsewhere said WITH the reason (another machine kind, a paired machine)');
  const lines = W.verdictLines(BB.buildCompatVerdict({ version: '155.0.1.2', platform: 'linux', arch: 'x64', census: 'newer', censusChrome: '154.0.8037.57', profile: { label: 'Work', lastChromiumMajor: 156 }, cli: '0.38.1', zipBytes: 100e6, freeBytes: 1e6, freePath: '/h' }), t).map((x) => x.text);
  ok(/Needs about 300 MB free, 1 MB left on \/h/.test(lines[0]) && lines.includes('Driven by agent-browser 0.38.1') && lines.some((x) => /Newer than the census \(154\.0\.8037\.57\)/.test(x)) && lines.some((x) => /last opened Work \(156\)/.test(x)) && lines.some((x) => /can't switch to CloakBrowser later \(Free 146 \/ Pro 151\)/.test(x)), 'a row\'s lines: the HARD refusal first with its numbers, then every chip in words', lines);
  const cf = W.downloadConfirmWords({ version: '154.0.8037.92', host: 'storage.googleapis.com', bytes: 196202491, root: '/h/.agent-browser/browsers' }, t);
  ok(cf.title === 'Download Chrome 154.0.8037.92?' && /About 196 MB comes from storage\.googleapis\.com and unpacks to about 392 MB in \/h\/\.agent-browser\/browsers/.test(cf.message) && /Google publishes no separate one/.test(cf.message) && /Nothing restarts/.test(cf.message) && /never auto-updates/.test(cf.message) && cf.confirmText === 'Download',
    'THE CONFIRM: the version, the host, the size, where it lands, how it is checked (and that Google publishes no checksum), nothing restarts, no auto-update; one button');
  ok(W.downloadProgressWords({ running: true, step: 'fetch', version: '1.2.3.4', bytes: 42e6, total: 196e6 }, t).text === 'Downloading Chrome 1.2.3.4… 42 MB of 196 MB' && /^Unpacking/.test(W.downloadProgressWords({ running: true, step: 'unpack', version: 'x' }, t).text) && W.downloadProgressWords({ done: '1.2.3.4' }, t).done && /didn't finish in 15 minutes/.test(W.downloadProgressWords({ failed: true, version: 'x', code: 'build_stalled' }, t).text),
    'the progress line: "downloading… 42 MB of 196 MB" → unpacking… → ready; a failure says why (the 15-minute clock by name)');
  ok(W.installedWords({ bytes: 389e6, downloaded: true }, t).remove && !W.installedWords({ bytes: 389e6 }, t).remove && /in use by Work/.test(W.installedWords({ bytes: 1, downloaded: true, profiles: ['Work'] }, t).text) && /in use — Work, Live/.test(W.downloadRefusalWords({ code: 'build_in_use', build: { profiles: ['Work'], running: ['Live'] } }, t)),
    'installed builds: Remove only on a build VibeSpace downloaded that nobody uses; in use names who');
  for (const [lang, d] of [['zh', zh], ['ja', ja]]) {
    const tt = mkT(d); const said = new Set(); const rec = (k, pp) => { said.add(k); return tt(k, pp); };
    W.verdictLines({ hard: [{ code: 'build_platform_unsupported', machine: 'm', command: 'c' }, { code: 'disk', need: 1, free: 1, path: '/' }], chips: [{ kind: 'present' }, { kind: 'cli', version: '1' }, { kind: 'census', relation: 'censused' }, { kind: 'census', relation: 'newer' }, { kind: 'census', relation: 'older' }, { kind: 'profile', label: 'x', wrote: 1 }, { kind: 'cloak', reach: 'both' }, { kind: 'cloak', reach: 'pro' }, { kind: 'cloak', reach: 'none' }] }, rec);
    W.pickerIntro(rec); W.downloadConfirmWords({ bytes: 1 }, rec); W.downloadConfirmWords({}, rec); W.majorLabel({ major: 1, newest: '1', count: 1 }, rec);
    for (const c of ['install_running', 'build_present', 'unzip_unavailable', 'build_url_offhost', 'build_version_unknown', 'build_list_unreachable', 'build_list_invalid', 'disk', 'build_check_failed', 'build_zip_shape', 'build_unpack_failed', 'build_verify_failed', 'build_stalled', 'build_in_use', 'build_not_downloaded', 'build_removing', 'build_platform_unsupported']) W.downloadRefusalWords({ code: c }, rec);
    for (const st of ['fetch', 'check', 'unpack', 'verify']) W.downloadProgressWords({ running: true, step: st }, rec);
    W.downloadProgressWords({ other: 'cli' }, rec); W.downloadProgressWords({ done: '1' }, rec); W.downloadProgressWords({ failed: true, code: 'disk' }, rec);
    W.installedWords({ profiles: ['a'] }, rec); W.installedWords({ downloaded: true }, rec); W.installedWords({}, rec); W.freeWords({ free: 1 }, rec); W.removeConfirmWords({}, rec); W.removedWords('1', rec);
    W.buildRows({ ok: true, builds: [] }, { t: rec, download: { offered: true } }); W.installHint({ command: 'x', download: { offered: false } }, rec); W.installHint({ command: 'x', local: false, download: { offered: false } }, rec);
    const miss = [...said].filter((k) => !(k in d));
    ok(said.size > 45 && !miss.length, `${lang}: every sentence of the picker (${said.size}) has its entry`, miss);
  }
  const dg = read('src/lib/browser-build-dialog.js'), np = read('src/lib/browser-new-profile.js');
  ok(/if \(r\.kind === 'download'\) \{ list\.appendChild\(downloadRow\(r, \(\) => openPicker\(\)\)\); continue; \}/.test(dg) && /openBuildDialog\(app, id, \{ label, onDone, pick: v, opener: 'system' \}\)/.test(dg) && /if \(r\.kind === 'download'\) \{ order\.push\(row \|\| downloadRow\(r, openBuildPicker\)\); continue; \}/.test(np) && /st\.buildDownload = r && !r\.error \? r\.download \|\| null : null;/.test(np),
    'wiring: Change build… opens the picker in the dialog and comes back with the new build picked (the finished download re-opens it: the system\'s open — lane dialog-yield r3); New profile…\'s build section opens it in place');
}

// ═══ ⑤ controls ═══════════════════════════════════════════════════════════════
console.log('— ⑤ controls: patched copies the gates above must turn red');
{
  const MUT = mutantCopies('badm-builds', REPO);
  const src = read('src/browser-builds.js');
  const agentMay = src.replace("  if (by !== 'user') return { ok: false, code: 'browser_choice_user_only',", "  if (false) return { ok: false, code: 'browser_choice_user_only',");
  ok(agentMay !== src, 'control (a): the patch (a verdict that lets an agent choose a build) applies');
  const BBa = MUT.load('src/browser-builds.js', agentMay, 'agent-may');
  ok(judgeVerdict(BBa).length > 0, 'control (a): …and ①\'s verdict table goes red on it', judgeVerdict(BBa));
  const ks = read('src/server/browser-keeper.js');
  const kbk = read('src/server/browser-builds-keeper.js'), CBK = 'src/server/browser-builds-keeper.js'; // rv-browser F7: Change build… is the builds row's file
  const fallback = ks.replace("    noteBuildMissing(p, c, v);\n    throw namedError(", "    noteBuildMissing(p, c, v);\n    return {};\n    throw namedError(");
  ok(fallback !== ks, 'control (b): the patch (a keeper that falls back to the default build when the chosen one vanished) applies');
  const Kb = MUT.load('src/server/browser-keeper.js', fallback, 'fallback');
  const kb = Kb.create({ dataDir: path.join(ROOT, 'data-cb'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  fs.mkdirSync(path.join(ROOT, 'data-cb'), { recursive: true });
  const pb = kb.createProfile({ label: 'Fallback', browser: { kind: 'build', version: '152.0.1.2' } });
  fs.renameSync(path.join(BROWSERS, 'chrome-152.0.1.2'), path.join(BROWSERS, 'chrome-152.0.1.2.away'));
  const n0 = fake.launches().length;
  const eb = await thr(() => kb.start(pb.id, { why: 'control' }));
  ok(!eb && fake.launches().length === n0 + 1 && fake.launches().at(-1).exe === null, 'control (b): …it LAUNCHED the default build silently — exactly what ②\'s "refused by name, nothing launched" catches');
  try { await kb.stop(pb.id, { why: 'user' }); } catch { /* none */ }
  fs.renameSync(path.join(BROWSERS, 'chrome-152.0.1.2.away'), path.join(BROWSERS, 'chrome-152.0.1.2'));
  const forget = ks.replace("      const launchEnv = { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', ...(headed0 === true ? { AGENT_BROWSER_HEADED: '1' } : headed0 === false ? { AGENT_BROWSER_HEADED: '0' } : {}), ...providerEnv };", "      const launchEnv = { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', ...(headed0 === true ? { AGENT_BROWSER_HEADED: '1' } : headed0 === false ? { AGENT_BROWSER_HEADED: '0' } : {}), ...(p.provider === 'chromium' ? {} : providerEnv) };");
  ok(forget !== ks, 'control (c): the patch (the build on the launch only, forgotten on the later calls) applies');
  const Kc = MUT.load('src/server/browser-keeper.js', forget, 'forget');
  fs.mkdirSync(path.join(ROOT, 'data-cc'), { recursive: true });
  const kc = Kc.create({ dataDir: path.join(ROOT, 'data-cc'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  const pc = kc.createProfile({ label: 'Forgets', browser: { kind: 'build', version: '152.0.1.2' } });
  const c0 = fake.calls().length;
  await kc.start(pc.id, { why: 'control' });
  const cs = callsOf('vs-' + pc.id, c0);
  ok(cs.length >= 2 && !cs.every((c) => c.exe), 'control (c): …a later call of the session carried no executable — exactly what ②\'s "on EVERY call" catches', cs);
  try { await kc.stop(pc.id, { why: 'user' }); } catch { /* none */ }
  // verify r1 (F1): a keeper that does not ask who DRIVES the browser ⇒ Change build… restarts it under the user's hands
  const blind = kbk.replace("    const drivenNow = () => SW.holdOf(ctx.reg.leases.filter((l) => l.profileId === p.id), inputsView({ withHumans: false }));", "    const drivenNow = () => ({ hold: null, driver: null });");
  ok(blind !== kbk, 'control (d): the patch (a Change build… blind to a takeover) applies');
  const Kd = keeperWithInstalls(MUT, REPO, { [CBK]: blind }, 'blind');
  fs.mkdirSync(path.join(ROOT, 'data-cd'), { recursive: true });
  const kd = Kd.create({ dataDir: path.join(ROOT, 'data-cd'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  const pd = kd.createProfile({ label: 'Blind', browser: { kind: 'build', version: '152.0.1.2' } });
  await kd.start(pd.id, { why: 'control' });
  await kd.attach({ profileId: pd.id, browserKey: KEY_A, sessionId: 'sess-a', by: 'user' });
  kd.takeover({ browserKey: KEY_A, profileId: pd.id, viewerId: 'viewer-1', sessionId: 'sess-a' });
  const rd = await kd.setBrowserChoice({ profileId: pd.id, choice: { kind: 'build', version: '153.0.1.1' }, by: 'user' }).catch((e) => e);
  ok(rd && rd.ok && rd.restarted === true, 'control (d): …it RESTARTED the browser the user was driving — exactly what ②\'s browser_driven leg catches', rd && (rd.code || rd.restarted));
  try { await kd.stop(pd.id, { why: 'user' }); } catch { /* none */ }
  // verify r2 (H2): a keeper whose takeover does not ask whether the browser is restarting ⇒ the user takes over inside the
  // restart and it goes on under his hands; one blind to a Browse yourself in flight ⇒ Change build… restarts his opening tab
  const noRestartGate = ks.replace("    if (profileId && switching.has(String(profileId))) { const p = profile(profileId);", "    if (false) { const p = profile(profileId);");
  ok(noRestartGate !== ks, 'control (h): the patch (a takeover blind to a restart in progress) applies');
  const Kh = MUT.load('src/server/browser-keeper.js', noRestartGate, 'no-restart-gate');
  fs.mkdirSync(path.join(ROOT, 'data-ch'), { recursive: true });
  const kh = Kh.create({ dataDir: path.join(ROOT, 'data-ch'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  const ph = kh.createProfile({ label: 'Race', browser: { kind: 'build', version: '152.0.1.2' } });
  await kh.start(ph.id, { why: 'control' });
  await kh.attach({ profileId: ph.id, browserKey: KEY_A, sessionId: 'sess-a', by: 'user' });
  const hr = await raceLeg(kh, ph.id, '153.0.1.1');
  ok(hr.sawStop && hr.take && hr.take.ok === true && hr.change.ok && hr.inputAfter === 'user', 'control (h): …the take over inside the restart was ACCEPTED and the restart went on under it — exactly what ②\'s race leg catches', hr);
  try { kh.handback({ browserKey: KEY_A, profileId: ph.id, cause: 'explicit' }); await kh.stop(ph.id, { why: 'user' }); } catch { /* none */ }
  const noBrowseGate = kbk.replace("    const refuseBrowsing = () => { if (humans.get(p.id) || browsing.has(p.id)) throw", "    const refuseBrowsing = () => { if (humans.get(p.id)) throw");
  ok(noBrowseGate !== kbk, 'control (i): the patch (Change build… blind to a Browse yourself in flight) applies');
  const Ki = keeperWithInstalls(MUT, REPO, { [CBK]: noBrowseGate }, 'no-browse-gate');
  fs.mkdirSync(path.join(ROOT, 'data-ci'), { recursive: true });
  const ki = Ki.create({ dataDir: path.join(ROOT, 'data-ci'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  const pi = ki.createProfile({ label: 'Opening', browser: { kind: 'build', version: '152.0.1.2' } });
  await ki.start(pi.id, { why: 'control' });
  const bwi = ki.browse(pi.id).catch((e) => ({ code: e.code }));
  const ri = await ki.setBrowserChoice({ profileId: pi.id, choice: { kind: 'build', version: '153.0.1.1' }, by: 'user' }).catch((e) => e);
  try { await bwi; } catch { /* its own end */ }
  ok(ri && ri.ok && ri.restarted === true, 'control (i): …Change build… RESTARTED the browser while his own tab was being opened — exactly what ②\'s Browse-in-flight leg catches', ri && (ri.code || ri.restarted));
  try { await ki.endHuman(pi.id, 'closed', { closeTab: true }); await ki.stop(pi.id, { why: 'user' }); } catch { /* none */ }
  // verify r2 (B5): a keeper with no settle window (the pre-fix heal) ⇒ the dead build is healed in its daemon, no second word
  const noSettle = ks.replace("    if (rec.buildChange && now() - Number(rec.buildChange.at || 0) <= CHANGE_SETTLE_MS) return fallBackFromChange(rec, p, seenBy);\n", '');
  ok(noSettle !== ks, 'control (j): the patch (no fall-back from a change that closed within seconds) applies');
  const fj = await fallBackLeg(MUT.load('src/server/browser-keeper.js', noSettle, 'no-settle'));
  ok(fj.events.map((e) => e.outcome).join() === 'changed' && fj.choice === '157.0.1.1' && fj.todos.length === 0, 'control (j): …the conversation heard only "changed" and the choice stayed on the build that closed — exactly what ②\'s fall-back leg catches', fj);
  // verify r1 (F9): a keeper that tells the holders BEFORE the stop, "changed", whatever happens (the pre-fix order)
  const early = kbk.replace("      const pre = leases.map((l) => interruptForRelaunch(p, l, { from, to })); // what each holder had in flight is cut NOW, before the stop\n", "      const pre = leases.map((l) => interruptForRelaunch(p, l, { from, to })); told = tellRelaunch(pre, 'changed');\n")
    .replace("        told = tellRelaunch(pre, restored ? 'restored' : 'down'); // verify r1 (F9): said as it happened\n", '')
    .replace("      told = tellRelaunch(pre, 'changed'); // verify r1 (F9): said once the new build runs\n", '');
  ok(early !== kbk && early.split("told = tellRelaunch(pre,").length === 2, 'control (g): the patch (holders told "changed" before the stop, whatever the outcome) applies');
  const eg = await relaunchOutcomeLeg(keeperWithInstalls(MUT, REPO, { [CBK]: early }, 'tell-early'));
  ok(eg.restored.err && eg.restored.err.restored === true && eg.restored.events.length === 1 && eg.restored.events[0].outcome === 'changed', 'control (g): …the holder read "changed to Chrome 160" while the old build ran again — exactly what ②\'s outcome leg catches', eg.restored.events);
  // verify r1 (F5): the agent's profile view that keeps a named file's path; a status that hands the agent the launch view
  const ps = read('src/browser-profiles.js');
  const keepPath = ps.replace("  if (rest.browser && rest.browser.kind === 'path') rest.browser = { kind: 'path' };\n", '');
  ok(keepPath !== ps, 'control (e): the patch (an agent profile view that keeps the path) applies');
  const Pe = MUT.load('src/browser-profiles.js', keepPath, 'keep-path');
  const ve = Pe.agentProfileView({ id: 'bp-0000eeee', label: 'E', provider: 'chromium', owner: { kind: 'instance', id: null }, browser: { kind: 'path', path: '/opt/named/chrome' } }, {}, {});
  ok(ve.browser && ve.browser.path === '/opt/named/chrome', 'control (e): …the path crossed to the agent — exactly what ③b\'s versions-only leg catches', ve.browser);
  const envLeak = ks.replace("browser: agentBrowserView(reg.browsers[l.profileId]), others:", "browser: browserView(reg.browsers[l.profileId]), others:");
  ok(envLeak !== ks, 'control (f): the patch (a status that hands the agent the browser\'s launch view) applies');
  const Kf = MUT.load('src/server/browser-keeper.js', envLeak, 'env-leak');
  fs.mkdirSync(path.join(ROOT, 'data-cf'), { recursive: true });
  const kf = Kf.create({ dataDir: path.join(ROOT, 'data-cf'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  const pf = kf.createProfile({ label: 'Leak', browser: { kind: 'build', version: '152.0.1.2' } });
  await kf.start(pf.id, { why: 'control' });
  await kf.attach({ profileId: pf.id, browserKey: KEY_A, sessionId: 'sess-a', by: 'user' });
  const sf = JSON.stringify(kf.statusFor(KEY_A));
  ok(/AGENT_BROWSER_EXECUTABLE_PATH/.test(sf) && sf.includes(BROWSERS), 'control (f): …the agent\'s status carried the executable\'s path in the launch view — exactly what ③b catches');
  try { await kf.stop(pf.id, { why: 'user' }); } catch { /* none */ }
}
try { if (kk) for (const p of kk.list().profiles) { try { await kk.stop(p.id, { why: 'user' }); } catch { /* none */ } } } catch { /* none */ }

// verify r1 (H1, L1): with no executable path the CLI launches its NEWEST build — a download newer than every build here says it
// becomes that default (naming the default-choice profiles); the zip's declared unpacked size is summed from `unzip -Zs`
console.log('— verify r1: the default chip · the zip\'s declared unpacked size');
{
  const cv = (v, o) => BB.buildCompatVerdict({ version: v, platform: 'linux', arch: 'x64', ...o });
  const d = (r) => r.chips.find((c) => c.kind === 'default');
  ok(d(cv('157.0.8083.0', { defaultBuild: '154.0.8037.92', defaultUsers: ['Bank logins'] })).users.join() === 'Bank logins' && d(cv('157.0.8083.0', { defaultBuild: null })).from === null
    && !d(cv('153.0.8010.47', { defaultBuild: '154.0.8037.92' })) && !d(cv('154.0.8037.92', { defaultBuild: '154.0.8037.92' })) && !d(cv('157.0.8083.0', { defaultBuild: '154.0.8037.92', present: true })) && !d(cv('157.0.8083.0', {})),
    'the default chip: only a version newer than every build here (or with none) says it, naming the default-choice profiles; never an older / equal / present one, nor when not asked');
  const zl = BB.parseZipListing('chrome-linux64/\nchrome-linux64/chrome\nchrome-linux64/blob\n', 'drwxr-xr-x  3.0 unx        0 b- stor 80-000-00 00:00 chrome-linux64/\n-rwxr-xr-x  3.0 unx       51 b- stor 80-000-00 00:00 chrome-linux64/chrome\n-rw-r--r--  3.0 unx 67108864 b- defN 80-000-00 00:00 chrome-linux64/blob\n');
  ok(zl.ok && BB.zipShapeVerdict(zl.entries).unpacked === 67108915, 'the zip\'s declared unpacked size is summed over its files (the keeper weighs it against the free space before `unzip -q`)', zl);
}

// ═══ ⑦ lane engine-plugin: A BROWSER ENGINE PLUGIN (design-custom-browser-plugin §1) ════════════════════════════════
console.log('— ⑦ lane engine-plugin: the engine verdicts, the real keeper over the fixture engine (the real loader + its IPC child), the vanished kernel, the policy');
const ENGN = require('../src/browser-engines.js');
const BPR = require('../src/browser-profiles.js');
const EID = 'vibespace.custom-browser';
{
  ok(ENGN.ID_RE.source === require('../src/plugin-manifest.js').ID_RE.source, 'the engine id rule IS the manifest id rule (src/plugin-manifest.js ID_RE)');
  const P0 = { installed: true, executable: true, binaryPath: '/k/chrome', version: 'Chromium 150.0.7871.186', protocol: 1, kinds: ['js-dialog'], features: ['surfaces', 'webauthn'] };
  const pv = (body, status = 200) => ENGN.engineAnswerVerdict('probe', { status, body }, { id: EID, label: 'Kernel' });
  const lv = (body, status = 200) => ENGN.engineAnswerVerdict('launchOptions', { status, body }, { id: EID, label: 'Kernel' });
  const rowsP = [[P0, true], [{ ...P0, version: null }, true], [{ ...P0, protocol: 2 }, 'browser_engine_protocol'], [{ ...P0, features: ['webauthn'] }, 'browser_engine_protocol'], [{ ...P0, installed: 'yes' }, 'browser_engine_protocol'], [{ ...P0, installed: false, executable: false }, true]];
  const badP = rowsP.filter(([b, want]) => { const r = pv(b); return want === true ? !r.ok : r.ok || r.code !== want; });
  ok(!badP.length && pv(P0, 500).code === 'browser_engine_protocol' && pv({ ...P0, version: null }).fact.version === null, 'a probe answer: version null is a FACT (ok, null), protocol ≠ 1 / no surfaces / another shape / HTTP 500 ⇒ browser_engine_protocol, a kernel not installed is a fact (the choice judges it)', badP);
  const L0 = { executablePath: '/k/chrome', args: ['--x=1'], env: {} };
  const envR = lv({ ...L0, env: { LD_PRELOAD: '/x/evil.so' } });
  const rowsL = [[L0, true], [{ ...L0, env: undefined }, true], [{ ...L0, args: ['--remote-debugging-port=9222'] }, 'browser_engine_protocol'], [{ ...L0, args: ['--user-data-dir=/elsewhere'] }, 'browser_engine_protocol'], [{ ...L0, args: ['--a\n--b'] }, 'browser_engine_protocol'], [{ ...L0, executablePath: 'chrome' }, 'browser_engine_protocol'], [{ ...L0, args: Array(65).fill('--a') }, 'browser_engine_protocol'], [{ ...L0, env: { X: 1 } }, 'browser_engine_protocol']];
  const badL = rowsL.filter(([b, want]) => { const r = lv(b); return want === true ? !r.ok : r.ok || r.code !== want; });
  ok(!badL.length && lv({ error: 'x', code: 'no_binary' }, 409).code === 'browser_engine_kernel_missing' && envR.code === 'browser_engine_env' && /LD_PRELOAD/.test(envR.error) && !/evil/.test(envR.error),
    'a launch answer: 409 no_binary ⇒ browser_engine_kernel_missing; an env key outside ENGINE_ENV_KEYS (none) ⇒ browser_engine_env, named, its VALUE never read; the debugging endpoint / the profile\'s directory / a multi-line argument / a relative program ⇒ browser_engine_protocol', { badL, envR });
  const ok1 = BB.normalizeBrowserChoice({ kind: 'plugin', id: EID }), c = { kind: 'plugin', id: EID };
  ok(ok1 && ok1.id === EID && BB.normalizeBrowserChoice({ kind: 'plugin', id: 'Bad.Id' }) === null && BB.normalizeBrowserChoice({ kind: 'plugin', id: 'nodot' }) === null && BB.sameChoice(c, { kind: 'plugin', id: EID }) && !BB.sameChoice(c, { kind: 'plugin', id: 'other.engine' }) && !BB.sameChoice(c, null)
    && JSON.stringify(BB.choiceView(c)) === JSON.stringify(c) && JSON.stringify(BB.agentChoiceView(c)) === JSON.stringify(c) && BB.buildWords(c, { engineLabel: 'Custom Browser Kernel' }) === 'the Custom Browser Kernel engine' && BB.buildWords(c) === `the ${EID} engine`,
    'the choice {kind:\'plugin\', id}: the manifest id rule, sameChoice / choiceView / agentChoiceView (the id is a public name) / buildWords «the <label> engine»');
  const V = (o) => BB.browserChoiceVerdict({ choice: c, provider: 'chromium', ...o });
  const order = [[{ choice: { kind: 'plugin', id: 'x' } }, 'browser_choice_invalid'], [{ by: 'agent', engine: P0 }, 'browser_choice_user_only'], [{ provider: 'cloak', engine: P0 }, 'browser_choice_provider'], [{}, 'browser_engine_missing'], [{ engine: { code: 'browser_engine_unanswered', error: 'x' } }, 'browser_engine_unanswered'],
    [{ engine: { ...P0, installed: false } }, 'browser_engine_kernel_missing'], [{ engine: { ...P0, executable: false } }, 'browser_engine_not_executable'], [{ engine: { ...P0, protocol: 2 } }, 'browser_engine_protocol']];
  const badO = order.filter(([o, want]) => V(o).code !== want).map(([o, want]) => [want, V(o).code]);
  const good = V({ engine: P0 });
  ok(!badO.length && good.ok && good.executablePath === '/k/chrome' && good.version === P0.version && good.major === 150 && ENGN.ENGINE_CODES.every((k) => BB.BUILD_CODES.includes(k)), 'THE verdict for an engine, in order: well-formed · the user\'s · chromium · the engine there · its kernel installed · executable · protocol; ok ⇒ its kernel\'s path + the version (major 150); the 6 codes are in BUILD_CODES', badO);
  const rs = read('src/routes/browser.js');
  ok(ENGN.ENGINE_CODES.every((k) => new RegExp(`\\b${k}: 409\\b`).test(rs)), 'every engine refusal is a 409 in the routes\' STATUS table');
  const le = ENGN.engineLaunchEnv({ args: ['--a=1,2', '--b'], env: { X: 'y' } }, { base: ['--mark'] });
  ok(le.AGENT_BROWSER_ARGS === '--mark\n--a=1,2\n--b' && !('X' in le) && ENGN.engineLaunchEnv({ args: ['--b'] }, { base: ['--m'] }).AGENT_BROWSER_ARGS === '--m,--b' && !('AGENT_BROWSER_ARGS' in ENGN.engineLaunchEnv({ args: [] }, { base: ['--m'] })),
    'the launch view: the base arguments first, the engine\'s after; newline-separated when one holds a comma (the CLI takes either); no arguments ⇒ no list (the config\'s stays); env outside the whitelist never carried', le);
  const D = ENGN.defaultEngineOf;
  const FE = { plugin: EID, default: true };
  ok(D({ own: 'default', fleet: FE }).source === 'user' && D({ own: 'default', fleet: FE }).value === 'default' && D({ fleet: FE }).value === 'plugin:' + EID && D({ fleet: FE }).source === 'fleet' && D({ fleet: { plugin: EID, default: false } }).value === 'default' && D({ fleet: { plugin: EID, default: false } }).source === 'fleet'
    && D({ own: 'plugin:nope.x', fleet: null }).source === 'default' && D({}).value === 'default' && JSON.stringify(ENGN.choiceOfDefault('plugin:' + EID)) === JSON.stringify(c) && ENGN.choiceOfDefault('default') === null,
    'THE POLICY: the user\'s own value › the fleet\'s (default true ⇒ the plugin, false ⇒ Chrome — said «set by the cluster preset») › \'default\'; a stored value outside the enum is none');
  const mn = BB.missingNotice({ label: 'K', choice: c, code: 'browser_engine_kernel_missing', engineLabel: 'Custom Browser Kernel' });
  ok(/"K" cannot start: the Custom Browser Kernel engine's kernel is not installed/.test(mn.text) && /never switches it to Chrome by itself/.test(mn.detail) && !/\/k\//.test(mn.text + mn.detail), 'the vanished kernel\'s ONE For-you notice says what is missing and the way out — never a path', mn);
}
// the fixture engine through the REAL loader (its node --permission child over IPC) in a scratch root; the kernel = a tiny
// program in the plugin's own state folder (the path VibeSpace resolves and hands it); the shared fake agent-browser logs
// every call's launch view
const EROOT = path.join(ROOT, 'engine-root');
fs.cpSync(path.join(REPO, 'scripts/fixtures/engine-plugin'), path.join(EROOT, 'data', 'plugins', EID), { recursive: true });
const expressE = require(path.join(REPO, 'node_modules/express'));
const LDR = require('../src/server/plugin-loader.js').create({ rootDir: EROOT, app: expressE(), hostVersion: '2.369.356', log: { log() { }, warn() { } }, agentEnv: () => ({ PATH: process.env.PATH }) });
process.on('exit', () => { try { LDR.shutdown(); } catch { /* gone */ } });
const ENGR = require('../src/server/browser-engines.js').create({ loader: LDR, dataDir: path.join(EROOT, 'data'), timeoutMs: 400 });
const KP = ENGR.kernelPath(EID);
const KVER = 'Chromium 150.0.7871.186 vibespace-fake-kernel';
const MODE = path.join(EROOT, 'data', 'plugins-state', EID, 'mode.json');
const setMode = (m) => { fs.mkdirSync(path.dirname(MODE), { recursive: true }); if (m) fs.writeFileSync(MODE, JSON.stringify(m)); else fs.rmSync(MODE, { force: true }); };
const waitRows = async (n, ms = 8000) => { const t0 = Date.now(); while (ENGR.rows().length !== n && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25)); return ENGR.rows().length === n; };
{
  ok(ENGR.rows().length === 0, 'the table before anything: no engine (the fixture plugin installed, not enabled)');
  const nc = thr(() => LDR.setEnabled(EID, true));
  const ncE = await nc;
  ok(ncE && /needs your consent/.test(ncE.message) && ENGR.rows().length === 0, 'an engine plugin cannot be enabled without consent (contributes.browserEngine ⇒ needsConsent)', ncE && ncE.message);
  LDR.setEnabled(EID, true, { trusted: true });
  ok(await waitRows(1) && ENGR.rows()[0].id === EID && ENGR.rows()[0].family === 'manifest', 'enabled + trusted + running ⇒ ONE row in the engine table', ENGR.rows());
  fs.mkdirSync(path.dirname(KP), { recursive: true });
  ok(/\/plugins-state\/vibespace\.custom-browser\/kernel\/linux-x64\/chrome$/.test(KP), 'the kernel\'s place: the plugin\'s own state folder (its only readable place besides its package)', KP);
  const pr0 = await ENGR.probe(EID);
  ok(pr0.ok && pr0.fact.installed === false && pr0.fact.binaryPath === KP, 'no kernel there yet ⇒ the probe answers installed:false about the path it was HANDED (a fact, not an error)', pr0);
  fs.writeFileSync(KP, `#!/bin/sh\necho "${KVER}"\n`, { mode: 0o755 });
  const pr1 = await ENGR.probe(EID);
  ok(pr1.ok && pr1.fact.installed && pr1.fact.executable && pr1.fact.version === KVER && pr1.fact.label === 'Fixture Browser Engine', 'the kernel placed ⇒ installed, executable, its own --version (the plugin\'s childProcess grant)', pr1);
}
const settingsE = {};
let fleetE = null;
const KEY_E = 'bk-0000e0e1';
const ke = mkKeeper(path.join(ROOT, 'data-eng'), { engines: ENGR, serverSetting: (k) => settingsE[k], fleetFacts: () => fleetE, liveKeys: () => new Set([KEY_A, KEY_E]) });
{
  const t0 = todos.length;
  const ef = await ke.engineFactOf(EID);
  const pe = ke.createProfile({ label: 'Kernel', browser: { kind: 'plugin', id: EID } }, { engine: ef });
  ok(pe.browser && pe.browser.kind === 'plugin' && pe.browser.id === EID, 'a create naming the engine, its probe handed in (the route asks it) ⇒ the record carries {kind:\'plugin\', id}');
  const ea = await thr(() => ke.createProfile({ label: 'Agent kernel', browser: { kind: 'plugin', id: EID } }, { engine: ef, by: 'agent' }));
  const en = await thr(() => ke.createProfile({ label: 'Unasked', browser: { kind: 'plugin', id: EID } }));
  ok(ea && ea.code === 'browser_choice_user_only' && en && en.code === 'browser_engine_missing', 'an agent never chooses an engine; a create nobody asked the engine for is refused by name (browser_engine_missing), never recorded blind', { ea: ea && ea.code, en: en && en.code });
  const c0 = fake.calls().length;
  await ke.start(pe.id, { why: 'test' });
  const ns = 'vs-' + pe.id;
  const la = fake.launches().at(-1), cs = callsOf(ns, c0);
  const args = String(la.args || '').split(/[,\n]/);
  ok(la.exe === KP && cs.length >= 2 && cs.every((c) => c.exe === KP), `the engine's kernel rides EVERY call of the browser's own session (${cs.map((c) => c.verb).join(' · ')}) — AGENT_BROWSER_EXECUTABLE_PATH, the build pin's road`, { la, cs });
  ok(args.includes('--vibespace-engine=fixture') && args.includes(`--vibespace-profile=${pe.id}`) && args.includes(BPR.keeperMarkArg(pe.id)) && args.includes('--disable-blink-features=AutomationControlled') && args.some((a) => /^--log-level=/.test(a) || /^--disable-logging/.test(a) || /^--v=/.test(a) || /enable-logging/.test(a)),
    'its launch arguments ride AGENT_BROWSER_ARGS with what the config\'s list carried (the keeper\'s mark, the automation flag) and the quiet switches', args);
  const rc = ke._reg().browsers[pe.id].browserChoice;
  ok(rc && rc.kind === 'plugin' && rc.id === EID && rc.version === KVER, 'the browser record says what this launch was asked to run: {kind:\'plugin\', id, version} (the probe\'s version)', rc);
  await ke.stop(pe.id, { why: 'user' });
  // the kernel VANISHES
  fs.renameSync(KP, KP + '.away');
  const n0 = fake.launches().length, t1 = todos.length;
  const e1 = await thr(() => ke.start(pe.id, { why: 'test' }));
  ok(e1 && e1.code === 'browser_engine_kernel_missing' && fake.launches().length === n0, 'the kernel gone ⇒ the launch is refused BY NAME (browser_engine_kernel_missing) — nothing launched, never Chrome in its place', e1 && (e1.code || e1));
  const mk = ke.profile(pe.id).buildMissing;
  ok(mk && mk.what === EID && mk.kind === 'plugin' && todos.length === t1 + 1 && /cannot start: the Fixture Browser Engine's kernel is not installed/.test(todos.at(-1).text) && !todos.at(-1).detail.includes(KP), 'the record is MARKED and ONE For-you item filed (origin browser), the words without a path', { mk, todo: todos.at(-1) });
  const e2 = await thr(() => ke.start(pe.id, { why: 'test' }));
  ok(e2 && e2.code === 'browser_engine_kernel_missing' && todos.length === t1 + 1 && !(ke.list().browsers[pe.id] && ke.list().browsers[pe.id].state === 'starting'), '…a second refused launch files nothing more, and no half-started record is left');
  fs.renameSync(KP + '.away', KP);
  await ke.start(pe.id, { why: 'test' });
  ok(!ke.profile(pe.id).buildMissing && fake.launches().at(-1).exe === KP, 'the kernel back ⇒ it starts, the mark clears by itself');
  await ke.stop(pe.id, { why: 'user' });
  // an engine that does not answer / asks for env / speaks another protocol — each by name; a timeout marks nothing
  setMode({ hang: 'probe' });
  const tq = Date.now(), t2 = todos.length;
  const eu = await thr(() => ke.start(pe.id, { why: 'test' }));
  ok(eu && eu.code === 'browser_engine_unanswered' && /did not answer within 0 s|did not answer/.test(eu.message) && !ke.profile(pe.id).buildMissing && todos.length === t2, `no answer within the registry's bound ⇒ browser_engine_unanswered (answered after ${Date.now() - tq} ms — printed, never judged), nothing marked, nothing filed — the next launch asks again`, eu && eu.code);
  setMode({ launch: { env: { LD_PRELOAD: '/x/evil.so' } } });
  const nv = fake.launches().length;
  const ev = await thr(() => ke.start(pe.id, { why: 'test' }));
  ok(ev && ev.code === 'browser_engine_env' && /LD_PRELOAD/.test(ev.message) && !/evil/.test(ev.message) && fake.launches().length === nv, 'an engine asking to set LD_PRELOAD on its browser ⇒ browser_engine_env, named, its value never read, nothing launched', ev && ev.message);
  setMode({ probe: { protocol: 2 } });
  const ep = await thr(() => ke.start(pe.id, { why: 'test' }));
  ok(ep && ep.code === 'browser_engine_protocol' && /protocol 2/.test(ep.message), 'an engine of another protocol ⇒ browser_engine_protocol by name', ep && ep.message);
  setMode(null);
  if (ke.profile(pe.id).buildMissing) { await ke.start(pe.id, { why: 'test' }); await ke.stop(pe.id, { why: 'user' }); } // clear the mark the two refusals above left
  // the PLUGIN turned off ⇒ the table loses it at once ⇒ refused browser_engine_missing (marked, ONE item)
  LDR.setEnabled(EID, false);
  const t3 = todos.length;
  const em = await thr(() => ke.start(pe.id, { why: 'test' }));
  ok(ENGR.rows().length === 0 && em && em.code === 'browser_engine_missing' && todos.length === t3 + 1 && /plugin is not running/.test(todos.at(-1).text), 'the plugin turned off ⇒ out of the table at once ⇒ the launch refused browser_engine_missing (one For-you item: its plugin is not running)', em && em.code);
  LDR.setEnabled(EID, true);
  ok(await waitRows(1), 'enabled again (its trust kept) ⇒ back in the table');
  await ke.start(pe.id, { why: 'test' });
  ok(!ke.profile(pe.id).buildMissing, '…and the profile starts again');
  await ke.stop(pe.id, { why: 'user' });
  // CHANGE BUILD… to the engine: a running Chrome profile restarts on the kernel; the dialog's facts never carry a path
  const pc = ke.createProfile({ label: 'Switches' });
  await ke.start(pc.id, { why: 'test' });
  const bv = await ke.buildsView(pc.id);
  const row = ((bv.listing && bv.listing.engines) || []).find((e) => e.id === EID);
  ok(row && row.version === KVER && row.installed && row.label === 'Fixture Browser Engine' && !JSON.stringify(bv).includes(KP) && !JSON.stringify(await ke.machineBuilds()).includes(KP), 'Change build… lists the engine (its probe\'s version — the «自研内核» card) and NO path anywhere in the dialog\'s facts', row);
  const swA = await thr(() => ke.setBrowserChoice({ profileId: pc.id, choice: { kind: 'plugin', id: EID }, by: 'agent' }));
  ok(swA && swA.code === 'browser_choice_user_only' && !ke.profile(pc.id).browser, 'an agent never switches a profile to an engine (refused by name, nothing changed)', swA && swA.code);
  const sw = await ke.setBrowserChoice({ profileId: pc.id, choice: { kind: 'plugin', id: EID }, by: 'user' });
  ok(sw.ok && sw.restarted && fake.launches().at(-1).exe === KP && ke.profile(pc.id).browser.id === EID, 'Change build… → the engine: the running browser restarts on its kernel', { ok: sw.ok, restarted: sw.restarted });
  await ke.setBrowserChoice({ profileId: pc.id, choice: { kind: 'default' }, by: 'user' });
  await ke.stop(pc.id, { why: 'user' });
  ok(ke.list().profiles.length > 0 && t0 <= todos.length, 'the engine legs leave the keeper usable');
}
// THE POLICY: the two read points (a profile's create, a conversation's browser's first start), written on the record
{
  fleetE = { browserEngine: { plugin: EID, default: true } };
  const d1 = ke.defaultEngineNow();
  const p1 = ke.createProfile({ label: 'By fleet' });
  ok(d1.value === 'plugin:' + EID && d1.source === 'fleet' && p1.browser && p1.browser.kind === 'plugin' && p1.browser.id === EID, 'the fleet says the kernel is the default, the user said nothing ⇒ a new profile is BORN with {kind:\'plugin\'} (written on the record)', { d1, b: p1.browser });
  settingsE['browser.defaultEngine'] = 'default';
  const p2 = ke.createProfile({ label: 'By user' });
  ok(ke.defaultEngineNow().source === 'user' && !p2.browser && ke.profile(p1.id).browser.id === EID, 'the user\'s own value wins over the fleet\'s (a new profile runs Chrome) — and the profile born before keeps its choice (never a silent migration)');
  delete settingsE['browser.defaultEngine'];
  fleetE = { relayUrl: 'https://relay.example.test/relay/' };
  const p3 = ke.createProfile({ label: 'No key' });
  ok(ke.defaultEngineNow().source === 'default' && !p3.browser, 'a fleet.json without the key changes nothing (Chrome, source default)');
  fleetE = { browserEngine: { plugin: EID, default: true } };
  const ad = path.join(ROOT, 'adopted-dir'); fs.mkdirSync(ad, { recursive: true });
  const p4 = ke.createProfile({ label: 'Adopted' }, { dir: ad });
  ok(!p4.browser, 'an adopted folder keeps its browser (the policy names NEW profiles only)');
  // a conversation's browser: the policy read at its first start, written on its record; its program + arguments ride the
  // config every call names (the agent's own commands included) — never a relaunch on Chrome
  const pairs = BPR.browserEnvFor({ browserKey: KEY_E, variant: BPR.VARIANTS.N, idleMs: 600000 });
  const n0 = fake.launches().length;
  const eph = await ke.ensureEphemeral({ browserKey: KEY_E, sessionId: 'sess-e', envPairs: pairs, sessionName: 'eng', variant: 'N' });
  const ev0 = ke.ephemeralFor(KEY_E);
  const ep = ev0 ? ke.profile(ev0.profileId) : null;
  const la = fake.launches().at(-1);
  ok(eph && ep && ep.browser && ep.browser.id === EID && fake.launches().length === n0 + 1 && la.config && la.config.executablePath === KP && (la.config.args || []).includes('--vibespace-engine=fixture'), 'a conversation\'s browser is BORN with the policy\'s engine and LAUNCHES its kernel: the config it ran with names the program + its arguments', { browser: ep && ep.browser, config: la && la.config });
  const cf = ke.configFileFor({ ephemeral: true, pairs });
  let cfg = null; try { cfg = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch { cfg = null; }
  ok(cfg && cfg.executablePath === KP && (cfg.args || []).includes('--vibespace-engine=fixture'), 'the config the AGENT\'s own commands are named (/resolve) carries the same program + arguments — the launch view never differs, so the browser is never relaunched on Chrome', cf);
  fleetE = null;
  try { if (ep) ke.retireEphemeral(ep.id, 'test'); } catch { /* best effort */ }
}
// ⑦ controls: patched copies the gates above must turn red
{
  const MUT = mutantCopies('badm-engine', REPO);
  const ks = read('src/server/browser-keeper.js');
  const anchor = "    if (!v.ok) { if (v.code !== 'browser_engine_unanswered') noteBuildMissing(p, c, v, engine); throw namedError(v.code, v.error, { engine: c.id }); }";
  const fb = ks.replace(anchor, "    if (!v.ok) return {};");
  ok(ks.includes(anchor) && fb !== ks, 'control (e): the patch (a keeper that starts Chrome when the engine\'s kernel vanished) applies');
  const Ke = MUT.load('src/server/browser-keeper.js', fb, 'engine-fallback');
  fs.mkdirSync(path.join(ROOT, 'data-ce'), { recursive: true });
  const kx = Ke.create({ dataDir: path.join(ROOT, 'data-ce'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, engines: ENGR });
  const px = kx.createProfile({ label: 'Falls back', browser: { kind: 'plugin', id: EID } }, { engine: await kx.engineFactOf(EID) });
  fs.renameSync(KP, KP + '.away');
  const n0 = fake.launches().length;
  const ex = await thr(() => kx.start(px.id, { why: 'control' }));
  ok(!ex && fake.launches().length === n0 + 1 && fake.launches().at(-1).exe === null, 'control (e): …it LAUNCHED Chrome silently — exactly what ⑦\'s "refused by name, nothing launched" catches');
  try { await kx.stop(px.id, { why: 'user' }); } catch { /* none */ }
  fs.renameSync(KP + '.away', KP);
  const es = read('src/browser-engines.js');
  const envAnchor = "    const extra = Object.keys(env).filter((k) => !ENGINE_ENV_KEYS.includes(k));";
  const open = es.replace(envAnchor, "    const extra = [];");
  ok(es.includes(envAnchor) && open !== es, 'control (f): the patch (an engine verdict that lets any env key through) applies');
  const ENo = MUT.load('src/browser-engines.js', open, 'env-open');
  ok(ENo.engineAnswerVerdict('launchOptions', { status: 200, body: { executablePath: '/k/chrome', args: [], env: { LD_PRELOAD: '/x' } } }, { id: EID }).ok === true, 'control (f): …LD_PRELOAD rides the browser\'s env — exactly what ⑦\'s browser_engine_env row catches');
}

// ═══ ⑧ lane engine-distribution: THE KERNEL DOWNLOADED (design-custom-browser-plugin §5.3 as built) ═══════════════════════
// PURE src/engine-kernel.js (kernel.json, the plan, the tar entries + shape, the receipt, the version words) + the REAL
// src/server/engine-distribution.js over the fixture engine (the real loader's IPC child, in the kernel side's v0.1.1 shape:
// no childProcess ⇒ version null, declaredVersion + integrity from the receipt) and a FAKE FILE HOST on loopback — a few-KB
// tar.zst of the kernel's layout, built here (ustar + node's zstd), never the real 1.2 GB kernel.
console.log('— ⑧ lane engine-distribution: kernel.json, the download over a fake file host, the receipt, the measured version, first use');
{
  const EK = require('../src/engine-kernel.js');
  const EDM = require('../src/server/engine-distribution.js');
  const zlib = require('zlib');
  const crypto = require('crypto');
  const BMm = await import('../src/lib/browser-build-model.js');
  const tW = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
  // ── the PURE half ──
  const LAYOUT = { archiveFormat: 'tar.zst', stripComponents: 1, binaryRelPath: 'chrome', requiredFiles: ['chrome', 'icudtl.dat', 'resources.pak', 'v8_context_snapshot.bin', 'libEGL.so', 'libGLESv2.so', 'libvk_swiftshader.so'] };
  const kjson = (over = {}, plat = {}) => ({ schemaVersion: 1, id: EID, version: '150.0.7871.186-vs1', protocol: 1, layout: LAYOUT, platforms: { 'linux-x64': { url: 'https://kernels.test/k.tar.zst', sha256: 'a'.repeat(64), bytes: 1246347752, version: '150.0.7871.186-vs1', binaryRelPath: 'chrome', layout: { archiveFormat: 'tar.zst', stripComponents: 1, binaryRelPath: 'chrome' }, ...plat } }, ...over });
  const mv = EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID });
  ok(mv.ok && mv.version === '150.0.7871.186-vs1' && mv.url === 'https://kernels.test/k.tar.zst' && mv.host === 'kernels.test' && mv.bytes === 1246347752 && mv.source === 'package' && mv.layout.stripComponents === 1 && mv.layout.requiredFiles.length === 7 && mv.layout.requiredFiles[0] === 'chrome',
    'kernel.json in the kernel side\'s shape (schemaVersion 1, the top-level layout + platforms[linux-x64]) ⇒ ONE artifact: url, sha256, bytes, version, layout (requiredFiles, the platform layout merged over the top one)', mv);
  const peerDir = process.env.VIBESPACE_CUSTOM_BROWSER_PLUGIN || '';
  if (peerDir && fs.existsSync(path.join(peerDir, 'kernel.json'))) { const pm = EK.kernelManifestVerdict(JSON.parse(fs.readFileSync(path.join(peerDir, 'kernel.json'), 'utf8')), { tag: 'linux-x64', id: EID }); ok(pm.ok && pm.layout.requiredFiles.includes('chrome'), 'the kernel side\'s OWN kernel.json (VIBESPACE_CUSTOM_BROWSER_PLUGIN) passes the same verdict', pm); }
  else console.log('  … SKIP the kernel side\'s own kernel.json — VIBESPACE_CUSTOM_BROWSER_PLUGIN names no package here');
  const refusals = [
    [kjson({ platforms: { 'macos-arm64': kjson().platforms['linux-x64'] } }), 'build_platform_unsupported'],
    [kjson({ schemaVersion: 2 }), 'browser_engine_protocol'],
    [kjson({}, { url: 'http://kernels.test/k.tar.zst' }), 'browser_engine_protocol'],
    [kjson({}, { url: 'https://u:p@kernels.test/k.tar.zst' }), 'browser_engine_protocol'],
    [kjson({}, { sha256: 'xyz' }), 'browser_engine_protocol'],
    [kjson({}, { binaryRelPath: 'bin/chrome' }), 'browser_engine_protocol'],
    [kjson({ layout: { ...LAYOUT, archiveFormat: 'zip' } }, { layout: {} }), 'browser_engine_protocol'],
    [kjson({ layout: { ...LAYOUT, requiredFiles: ['../etc/passwd'] } }), 'browser_engine_protocol'],
    [kjson({}, { bytes: -1 }), 'browser_engine_protocol'],
    [null, 'browser_engine_protocol'],
  ].map(([d, code]) => [EK.kernelManifestVerdict(d, { tag: 'linux-x64', id: EID }).code, code]);
  ok(refusals.every(([a, b]) => a === b), 'kernel.json refused BY NAME: no artifact for this machine ⇒ build_platform_unsupported; another schema, an http / user@ URL, a bad sha256, a program not at <tag>/chrome, a zip, a requiredFile outside, no length, no file ⇒ browser_engine_protocol', refusals);
  const fv = EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: 'https://artifacts.fleet.test/k.tar.zst', sha256: 'b'.repeat(64) } });
  const fs2 = EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: 'https://artifacts.fleet.test/k.tar.zst', sha256: 'a'.repeat(64) } });
  const fHalf = EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: 'https://mirror.fleet.test/k.tar.zst', sha256: '' } });
  const fPin = EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: '', sha256: 'b'.repeat(64) } });
  const fHttp = EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: 'http://artifacts.fleet.test/k.tar.zst', sha256: 'b'.repeat(64) } });
  ok(fv.ok && fv.source === 'fleet' && fv.host === 'artifacts.fleet.test' && fv.sha256 === 'b'.repeat(64) && fv.bytes === null && fs2.bytes === 1246347752
    && fHalf.ok && fHalf.source === 'fleet' && fHalf.host === 'mirror.fleet.test' && fHalf.sha256 === 'a'.repeat(64) && fHalf.bytes === 1246347752 && fPin.ok && fPin.host === 'kernels.test' && fPin.sha256 === 'b'.repeat(64) && fPin.bytes === null,
    'the fleet\'s kernel {url, sha256} is MERGED over the package\'s field by field (round 2): both ⇒ its own archive (its length kept only for the SAME sha256); a url alone ⇒ a mirror (the package\'s sha256 authenticates it); a sha256 alone ⇒ the package\'s address pinned to it', { fHalf: fHalf.host, fPin: fPin.sha256 });
  ok(!fHttp.ok && fHttp.code === 'engine_url_not_https' && /not an https address/.test(fHttp.error) && /never takes the package's address/.test(fHttp.error),
    'round 2: a fleet kernel URL that is not https ⇒ refused BY NAME (engine_url_not_https) — never the package\'s address in its place', fHttp);
  const fBad = ['xyz', 'b'.repeat(65), 'g'.repeat(64), 1234].map((x) => EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: '', sha256: x } }));
  const PLr = require('../src/preset-layers.js');
  const viaFleet = ['XYZ', 'c'.repeat(65)].map((x) => EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: PLr.parseFleet({ browserEngine: { plugin: EID, kernel: { sha256: x } } }).browserEngine.kernel }));
  ok(fBad.every((v) => !v.ok && v.code === 'engine_sha_malformed' && /not 64 hex digits/.test(v.error) && /never takes the package's sha256/.test(v.error)) && viaFleet.every((v) => v.code === 'engine_sha_malformed')
    && EK.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: 7, sha256: '' } }).code === 'engine_url_not_https',
    'round 3: a fleet sha256 that is not 64 hex digits (short, 65 long, not hex, a number) ⇒ refused BY NAME (engine_sha_malformed) — never the package\'s sha256 in its place; the same through fleet.json\'s reader (it keeps the value AS NAMED — no longer blanked, nor clipped to 64); a url of another type is «not https»', { codes: fBad.map((v) => v.code || v.sha256), viaFleet: viaFleet.map((v) => v.code) });
  const pl = EK.kernelPlan({ kernelPath: KP });
  ok(pl.ok && pl.exe === KP && pl.targetDir === path.dirname(KP) && pl.part === path.dirname(KP) + '.part' && pl.unpackDir === path.join(path.dirname(path.dirname(KP)), '.unpack-linux-x64') && pl.receipt === path.join(path.dirname(KP), 'install-receipt.json') && !EK.kernelPlan({ kernelPath: '/a/../b/chrome' }).ok && !EK.kernelPlan({ kernelPath: 'rel/x/chrome' }).ok,
    'THE PLAN: every path inside the kernel\'s own folder (<tag>.part, .unpack-<tag>, <tag>/, the receipt beside chrome); a path of another shape is never planned', pl);
  const ev = (e, strip = 1) => EK.tarEntryVerdict(e, { strip });
  const er = [ev({ name: 'k/chrome', kind: 'file' }).rel === 'chrome', ev({ name: './k/sub/a', kind: 'file' }).rel === 'sub/a', ev({ name: 'k/', kind: 'dir' }).rel === null, !ev({ name: '/etc/x', kind: 'file' }).ok, !ev({ name: 'k/../x', kind: 'file' }).ok, !ev({ name: 'k/l', kind: 'link', linkname: '/etc' }).ok, !ev({ name: 'k/fifo', kind: 'special' }).ok, !ev({ name: 'chrome', kind: 'file' }).ok, !ev({ name: 'k/a\\b', kind: 'file' }).ok];
  ok(er.every(Boolean), 'each archive entry judged: inside the top folder ⇒ its path after stripComponents; an absolute name, "..", a link, a special file, a file above the top folder, a backslash ⇒ refused', er);
  const dotList = [{ name: './', kind: 'dir' }, { name: './k/', kind: 'dir' }, { name: './k/chrome', kind: 'file', size: 3, mode: 0o755 }, { name: './k/icudtl.dat', kind: 'file', size: 1, mode: 0o644 }];
  const dotV = EK.tarShapeVerdict(dotList, { layout: { stripComponents: 1, requiredFiles: ['chrome', 'icudtl.dat'] } });
  ok(dotV.ok && dotV.files === 2 && ev({ name: './', kind: 'dir' }).root === true && !ev({ name: './', kind: 'file' }).ok && !ev({ name: './../x', kind: 'file' }).ok && !ev({ name: '/k/chrome', kind: 'file' }).ok && !EK.tarShapeVerdict([...dotList, { name: './k/../../x', kind: 'file', size: 1 }], { layout: { stripComponents: 1 } }).ok,
    'round 2: an archive made with `tar -C dir -cf - .` (its own root `./` first) has ONE top folder — `./` is the root, never a second top; "..", an absolute name and a nameless file are still refused', dotV.ok ? { files: dotV.files } : dotV);
  ok(EK.receiptVerdict({ sha256: 'c'.repeat(64), bytes: 45, verifiedAt: 1, version: 'v' }, { size: 45 }).verified && !EK.receiptVerdict({ sha256: 'c'.repeat(64), bytes: 45, verifiedAt: 1, version: 'v' }, { size: 46 }).verified && !EK.receiptVerdict(null).verified,
    'the receipt read back: verified only while the program\'s size is the receipt\'s bytes (never a rehash of 1.2 GB)');
  ok(EK.versionOf('Chromium 150.0.7871.186-vs1\n').version === '150.0.7871.186-vs1' && EK.versionOf('Chromium 150.0.7871.186 vibespace-fake-kernel').version === '150.0.7871.186' && EK.versionOf('nothing').version === null
    && EK.versionFact({ measuredVersion: 'm', version: 'r', declaredVersion: 'd' }).kind === 'measured' && EK.versionFact({ version: 'r', declaredVersion: 'd' }).kind === 'reported' && EK.versionFact({ declaredVersion: 'd' }).kind === 'declared' && EK.versionFact({}).kind === 'none',
    '`--version`\'s first line → the version (with its -suffix); the version a surface says: measured › reported › declared › none');
  const hr = BB.downloadHardRows({ machine: 'linux-x64', offered: ['linux-x64'], freeBytes: 1e6, archiveBytes: 1e6, freePath: '/pvc' });
  const hm = BB.downloadHardRows({ machine: 'darwin-arm64', offered: ['linux-x64'], unsupported: 'no kernel here' });
  ok(hr.hard.length === 1 && hr.hard[0].code === 'disk' && /on \/pvc/.test(hr.hard[0].error) && hr.needBytes === 3e6 && hm.hard[0].code === 'build_platform_unsupported' && hm.hard[0].error === 'no kernel here', 'design 004\'s two hard rows are ONE helper (downloadHardRows): the disk (archive × DISK_FACTOR, the place named) and the machine');
  // ── the ARCHIVE (ustar built here, zstd by node) + the FAKE FILE HOST ──
  const tarOf = (entries) => {
    const parts = [];
    for (const e of entries) {
      const h = Buffer.alloc(512), body = e.body == null ? Buffer.alloc(0) : Buffer.from(e.body);
      h.write(e.name, 0, 100, 'utf8'); h.write(((e.mode || 0o644).toString(8)).padStart(7, '0') + '\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
      h.write((e.type === '5' || e.type === '2' ? 0 : body.length).toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.write(e.type || '0', 156);
      if (e.link) h.write(e.link, 157, 100, 'utf8');
      h.write('ustar\0', 257); h.write('00', 263); h.fill(32, 148, 156);
      let sum = 0; for (const b of h) sum += b;
      h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
      parts.push(h);
      if (e.type !== '5' && e.type !== '2') parts.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
    }
    parts.push(Buffer.alloc(1024));
    return zlib.zstdCompressSync(Buffer.concat(parts));
  };
  const RUNS = path.join(EROOT, 'kernel-runs.log');
  const KSAYS = 'Chromium 150.0.7871.186-vs1';
  const chromeBody = `#!/bin/sh\necho run >> ${JSON.stringify(RUNS)}\necho "${KSAYS}"\n`;
  const kernelEntries = (top = 'vibespace-chromium-150.0.7871.186-vs1-linux-x64', extra = []) => [{ name: top + '/', type: '5', mode: 0o755 }, { name: `${top}/chrome`, body: chromeBody, mode: 0o755 },
    ...['icudtl.dat', 'resources.pak', 'v8_context_snapshot.bin', 'libEGL.so', 'libGLESv2.so', 'libvk_swiftshader.so'].map((f) => ({ name: `${top}/${f}`, body: crypto.randomBytes(700) })), { name: `${top}/locales/`, type: '5', mode: 0o755 }, { name: `${top}/locales/en-US.pak`, body: 'x' }, ...extra];
  const ARCH = tarOf(kernelEntries());
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const BAD = Buffer.from(ARCH); BAD[BAD.length - 9] ^= 0xff;
  const EVIL = tarOf(kernelEntries(undefined, [{ name: 'vibespace-chromium-150.0.7871.186-vs1-linux-x64/escape', type: '2', link: '/etc/passwd' }]));
  const DOTS = tarOf(kernelEntries(undefined, [{ name: 'vibespace-chromium-150.0.7871.186-vs1-linux-x64/../../oops', body: 'x' }]));
  const SHORT = tarOf(kernelEntries().filter((e) => !/libEGL/.test(e.name)));
  const served = { '/k.tar.zst': ARCH, '/bad.tar.zst': BAD, '/evil.tar.zst': EVIL, '/dots.tar.zst': DOTS, '/short.tar.zst': SHORT, '/fleet/k.tar.zst': ARCH };
  const hits = [];
  const host = http.createServer((q, r) => { hits.push(q.url); if (q.url === '/hop') { r.writeHead(302, { location: 'https://kernels.test/k.tar.zst' }); return r.end(); } if (q.url === '/hop-http') { r.writeHead(302, { location: 'http://kernels.test/k.tar.zst' }); return r.end(); } const b = served[q.url]; if (!b) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-length': b.length }); r.end(b); });
  await new Promise((res) => host.listen(0, '127.0.0.1', res));
  process.on('exit', () => { try { host.close(); } catch { /* gone */ } });
  const hostPort = host.address().port;
  const resolveUrl = (u) => u.replace(/^https:\/\/(kernels\.test|artifacts\.fleet\.test)/, `http://127.0.0.1:${hostPort}`);
  const KJ = path.join(EROOT, 'data', 'plugins', EID, 'kernel.json');
  const writeKJ = (file, s = sha(served[file] || ARCH), extra = {}) => fs.writeFileSync(KJ, JSON.stringify(kjson({}, { url: `https://kernels.test${file}`, sha256: s, bytes: (served[file] || ARCH).length, ...extra })));
  let freeNow = null, fleetK = null;
  const edTodos = [];
  const ED = EDM.create({ dataDir: path.join(EROOT, 'data'), engines: ENGR, loader: LDR, resolveUrl, freeOf: async (d) => (freeNow ? { ...freeNow } : { free: 1e12, path: d }), fleetFacts: () => (fleetK ? { browserEngine: { plugin: EID, kernel: fleetK } } : null), userTodos: { add: (k, item) => { edTodos.push(item); return 'ut-' + edTodos.length; } }, log: { log() {}, warn() {} } });
  const keD = mkKeeper(path.join(ROOT, 'data-eng8'), { engines: ENGR, engineDistribution: ED, fleetFacts: () => null }); // a keeper with the kernel's distribution
  setMode({ noExec: true }); // the kernel side's plugin: no childProcess — its version is null, the receipt is its integrity
  fs.rmSync(path.dirname(KP), { recursive: true, force: true }); fs.rmSync(RUNS, { force: true });
  // ① the download: fetch → sha256 → list → extract → requiredFiles → the receipt → ONE rename → the version measured ONCE
  writeKJ('/k.tar.zst');
  const r1 = await ED.installKernel(EID, { wait: true });
  const kdir = path.dirname(KP);
  const rc = JSON.parse(fs.readFileSync(path.join(kdir, 'install-receipt.json'), 'utf8'));
  ok(r1.ok && r1.sha256 === sha(ARCH) && fs.statSync(KP).mode & 0o100 && LAYOUT.requiredFiles.every((f) => fs.statSync(path.join(kdir, f)).isFile()) && fs.existsSync(path.join(kdir, 'locales', 'en-US.pak')) && !fs.readdirSync(path.dirname(kdir)).some((n) => /\.part$|^\.unpack-|^\.removing-/.test(n)),
    'the kernel lands at kernelPath\'s folder: stripComponents 1, every requiredFiles a file, chrome executable — no .part / .unpack- / .removing- left', fs.readdirSync(path.dirname(kdir)));
  ok(rc.sha256 === sha(ARCH) && rc.bytes === fs.statSync(KP).size && rc.version === '150.0.7871.186-vs1' && Number.isFinite(rc.verifiedAt) && rc.archiveBytes === ARCH.length && rc.binarySha256 === sha(Buffer.from(chromeBody)),
    'install-receipt.json beside chrome: {sha256 (the archive\'s, verified), bytes (chrome\'s size), verifiedAt, version} (+ the archive\'s length, the program\'s own hash)', rc);
  const runs1 = () => { try { return fs.readFileSync(RUNS, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const kf1 = ED.kernelFact(EID);
  ok(kf1.state === 'installed' && kf1.measuredVersion === '150.0.7871.186-vs1' && runs1() === 1 && kf1.sha256 === sha(ARCH), 'right after the install VibeSpace ran `<kernel> --version` ONCE (serviceEnv, 5 s) — measuredVersion + measuredAt on the engine record', { kf1, runs: runs1() });
  const m2 = await ED.measure(EID);
  const pr = await ENGR.probe(EID);
  ok(m2.cached && runs1() === 1 && pr.ok && pr.fact.version === null && pr.fact.declaredVersion === '150.0.7871.186-vs1' && pr.fact.integrity && pr.fact.integrity.verified === true && pr.fact.integrity.sha256 === sha(ARCH),
    'asked again ⇒ the record answers (no second run); the plugin\'s probe (no childProcess) says version null, declaredVersion, integrity {verified} from the receipt', { runs: runs1(), fact: pr.fact });
  const rec0 = JSON.parse(fs.readFileSync(path.join(EROOT, 'data', 'browser-engines.json'), 'utf8'));
  ok(rec0.engines[EID].measured.version === '150.0.7871.186-vs1' && rec0.engines[EID].kernel.sha256 === sha(ARCH) && !JSON.stringify(rec0).includes(KP), 'THE ENGINE RECORD (data/browser-engines.json, one writer) keeps the measured version + the installed kernel — never a path');
  // ② the card + Settings' fact line say what was measured / declared — never a path
  const rowsV = await keD.engineRowsView();
  const ro = rowsV.find((e) => e.id === EID);
  ok(ro && ro.measuredVersion === '150.0.7871.186-vs1' && ro.declaredVersion === '150.0.7871.186-vs1' && ro.integrity.verified && /measured 150\.0\.7871\.186-vs1 · verified/.test(BMm.engineNote(ro, tW)) && !JSON.stringify(rowsV).includes(KP),
    'Change build…\'s «自研内核» row: «… · measured 150.0.7871.186-vs1 · verified» (the engine record over the probe) — no path', ro && BMm.engineNote(ro, tW));
  ok(/declared 150\.0\.7871\.186-vs1 \(not measured\)/.test(BMm.engineNote({ ...ro, measuredVersion: null, version: null }, tW)) && /version 9/.test(BMm.engineNote({ ...ro, measuredVersion: null, version: '9' }, tW)) && /downloading its kernel… 50%/.test(BMm.engineNote({ id: EID, installed: false, executable: false, kernel: { state: 'downloading', bytes: 5, total: 10 } }, tW)) && /could not be downloaded: the download did not match its sha256/.test(BMm.engineNote({ id: EID, installed: false, kernel: { state: 'failed', code: 'build_verify_failed' } }, tW)),
    'the words: «declared x (not measured)» when nothing was measured; the plugin\'s own version next; a download in flight with its %; a failed one by its code');
  ok(/measured 150\.0\.7871\.186-vs1/.test(BMm.engineFactText({ engines: rowsV, defaultEngine: keD.defaultEngineNow() }, tW)), 'Settings\' fact line under «Default browser engine» says the same measured version');
  // ③ the launch reads the MEASURED version (no second --version), the record says it
  const pk = keD.createProfile({ label: 'Measured', browser: { kind: 'plugin', id: EID } }, { engine: await keD.engineFactOf(EID) });
  await keD.start(pk.id, { why: 'test' });
  ok(keD._reg().browsers[pk.id].browserChoice.version === '150.0.7871.186-vs1' && runs1() === 1 && fake.launches().at(-1).exe === KP, 'the launch: the kernel, the MEASURED version on the browser record — the kernel ran --version once in all', { runs: runs1(), rc: keD._reg().browsers[pk.id].browserChoice });
  await keD.stop(pk.id, { why: 'user' });
  // ④ refusals BY NAME, before / after bytes — the installed kernel untouched by every failed attempt
  const before = fs.readFileSync(KP, 'utf8');
  const thrK = async (p) => { try { await p; return null; } catch (e) { return e; } };
  freeNow = { free: 1000, path: '/pvc/data' }; const h0 = hits.length;
  const eDisk = await thrK(ED.installKernel(EID, { wait: true }));
  const hDisk = hits.length;
  freeNow = null;
  writeKJ('/k.tar.zst', sha(ARCH).replace(/^./, (c) => (c === '0' ? '1' : '0')));
  const eSha = await thrK(ED.installKernel(EID, { wait: true }));
  writeKJ('/bad.tar.zst', sha(ARCH)); const eBad = await thrK(ED.installKernel(EID, { wait: true }));
  writeKJ('/evil.tar.zst'); const eEvil = await thrK(ED.installKernel(EID, { wait: true }));
  writeKJ('/dots.tar.zst'); const eDots = await thrK(ED.installKernel(EID, { wait: true }));
  writeKJ('/short.tar.zst'); const eShort = await thrK(ED.installKernel(EID, { wait: true }));
  writeKJ('/gone.tar.zst', 'd'.repeat(64)); const e404 = await thrK(ED.installKernel(EID, { wait: true }));
  writeKJ('/hop-http'); const eHop = await thrK(ED.installKernel(EID, { wait: true }));
  fs.writeFileSync(KJ, JSON.stringify(kjson({ platforms: { 'windows-x64': kjson().platforms['linux-x64'] } })));
  const ePlat = await thrK(ED.installKernel(EID, { wait: true }));
  const codes = { eDisk, eSha, eBad, eEvil, eDots, eShort, e404, eHop, ePlat };
  const want = { eDisk: 'disk', eSha: 'build_verify_failed', eBad: 'build_verify_failed', eEvil: 'build_unpack_failed', eDots: 'build_unpack_failed', eShort: 'build_unpack_failed', e404: 'build_fetch_failed', eHop: 'build_fetch_failed', ePlat: 'build_platform_unsupported' };
  ok(Object.entries(want).every(([k, c]) => codes[k] && codes[k].code === c), 'every refusal BY NAME: disk · a sha256 that is not the archive\'s · bytes that are not the declared ones · a link entry · a ".." entry · a missing requiredFile · a 404 · an http redirect hop · no artifact for this machine', Object.fromEntries(Object.entries(codes).map(([k, e]) => [k, e && e.code])));
  ok(/0 MB left on \/pvc\/data/.test(eDisk.message) && hDisk === h0 && /nothing was downloaded/.test(eDisk.message) && /is not the declared/.test(eSha.message) && /link entry/.test(eEvil.message) && /no libEGL\.so/.test(eShort.message) && /windows-x64/.test(ePlat.message),
    '…each says why: `disk` names the folder\'s free bytes (a pod\'s PVC) before any byte moved, the sha256 mismatch names both, the entry, the missing file, what the engine offers', { disk: eDisk.message, sha: eSha.message });
  ok(fs.readFileSync(KP, 'utf8') === before && ED.kernelFact(EID).state === 'installed' && !fs.readdirSync(path.dirname(kdir)).some((n) => /\.part$|^\.unpack-|^\.removing-/.test(n)) && !fs.existsSync(path.join(EROOT, 'data', 'plugins-state', 'oops')) && !fs.existsSync(path.join(EROOT, 'data', 'oops')),
    '…and the kernel already in place is untouched by every failed attempt; no partial is left; nothing escaped its folder');
  ok(edTodos.length === 0, 'a person\'s own download files no For-you notice (the card says it)');
  // ⑤ a redirect hop (https) is followed; the FLEET's artifact host wins over the package's
  writeKJ('/hop', sha(ARCH)); const h1 = hits.length;
  const r5 = await ED.installKernel(EID, { wait: true });
  ok(r5.ok && hits.slice(h1).join() === '/hop,/k.tar.zst', 'an https redirect hop is followed by hand (each hop judged https)', hits.slice(h1));
  fleetK = { url: 'https://artifacts.fleet.test/fleet/k.tar.zst', sha256: sha(ARCH) }; const h2 = hits.length;
  writeKJ('/k.tar.zst', 'e'.repeat(64));
  const r6 = await ED.installKernel(EID, { wait: true, by: 'fleet' });
  ok(r6.ok && hits.slice(h2).join() === '/fleet/k.tar.zst' && ED.kernelFact(EID).source === 'fleet', 'the fleet\'s browserEngine.kernel {url, sha256} replaces kernel.json\'s (the cluster\'s own artifact host)', hits.slice(h2));
  fleetK = null;
  // ⑤b round 2: a fleet kernel URL that is not https ⇒ refused by name BEFORE any byte — never the package's address instead
  fleetK = { url: 'http://artifacts.fleet.test/fleet/k.tar.zst', sha256: sha(ARCH) }; const h3 = hits.length;
  writeKJ('/k.tar.zst');
  const eHttpF = await thrK(ED.installKernel(EID, { wait: true, by: 'user' }));
  ok(eHttpF && eHttpF.code === 'engine_url_not_https' && hits.length === h3 && ED.kernelFact(EID).state === 'installed' && /not https/.test(BMm.engineNote({ id: EID, installed: false, kernel: { state: 'failed', code: 'engine_url_not_https' } }, tW)),
    'round 2: the fleet names an http kernel URL ⇒ engine_url_not_https by name, ZERO requests (the package\'s https address is NOT taken in its place); the card says so', { code: eHttpF && eHttpF.code, hits: hits.slice(h3) });
  fleetK = null;
  // ⑤d round 3: a fleet sha256 that is not 64 hex digits ⇒ refused by name BEFORE any byte — never the package's sha256 instead
  fleetK = { url: '', sha256: 'abc123' }; const h4 = hits.length;
  const eShaF = await thrK(ED.installKernel(EID, { wait: true, by: 'user' }));
  ok(eShaF && eShaF.code === 'engine_sha_malformed' && /not 64 hex digits/.test(eShaF.message) && hits.length === h4 && ED.kernelFact(EID).state === 'installed' && /not 64 hex digits/.test(BMm.engineNote({ id: EID, installed: false, kernel: { state: 'failed', code: 'engine_sha_malformed' } }, tW)),
    'round 3: the fleet pins a sha256 that is not 64 hex digits ⇒ engine_sha_malformed by name, ZERO requests (the package\'s sha256 is NOT taken in its place); the card says so', { code: eShaF && eShaF.code, hits: hits.slice(h4) });
  fleetK = null;
  // ⑤c round 2: an archive whose names start with `./` (made with `tar -C dir -cf - .`) installs
  served['/dot.tar.zst'] = tarOf([{ name: './', type: '5', mode: 0o755 }, ...kernelEntries().map((e) => ({ ...e, name: './' + e.name }))]);
  writeKJ('/dot.tar.zst');
  const rDot = await thrK(ED.installKernel(EID, { wait: true }));
  ok(!rDot && ED.kernelFact(EID).sha256 === sha(served['/dot.tar.zst']) && fs.existsSync(path.join(kdir, 'locales', 'en-US.pak')) && (fs.statSync(KP).mode & 0o100), 'round 2: a `./`-rooted archive (tar -C dir -cf - .) installs — its root is no second top folder', rDot && rDot.message);
  writeKJ('/k.tar.zst');
  // ⑥ a failure nobody watched (the fleet's, a first use) files ONE For-you notice, once per code
  writeKJ('/k.tar.zst', 'f'.repeat(64));
  await thrK(ED.installKernel(EID, { wait: true, by: 'fleet' })); await thrK(ED.installKernel(EID, { wait: true, by: 'fleet' }));
  ok(edTodos.length === 1 && edTodos[0].origin === 'plugin' && edTodos[0].kind === 'notice' && /could not be downloaded/.test(edTodos[0].text) && /build_verify_failed/.test(edTodos[0].detail) && !edTodos[0].detail.includes(KP), 'a fleet download\'s failure ⇒ ONE For-you notice (origin plugin), the code named, no path — the same failure again files nothing more', edTodos);
  // ⑦ FIRST USE: the kernel absent ⇒ the launch refused by name, the download started; when it lands the next launch runs it
  writeKJ('/k.tar.zst');
  const ke8 = keD;
  const p8 = ke8.createProfile({ label: 'First use', browser: { kind: 'plugin', id: EID } }, { engine: await ke8.engineFactOf(EID) });
  fs.rmSync(kdir, { recursive: true, force: true }); fs.rmSync(RUNS, { force: true });
  const e8 = await thrK(ke8.start(p8.id, { why: 'test' }));
  ok(e8 && e8.code === 'browser_engine_kernel_missing' && /VibeSpace is downloading it now/.test(e8.message), 'the kernel not there ⇒ the launch is refused BY NAME and says VibeSpace is downloading it now (its first use) — never Chrome in its place', e8 && e8.message);
  const t8 = Date.now(); while (ED.kernelFact(EID).state === 'downloading' && Date.now() - t8 < 8000) await new Promise((r) => setTimeout(r, 25));
  await ke8.start(p8.id, { why: 'test' });
  ok(ED.kernelFact(EID).state === 'installed' && fake.launches().at(-1).exe === KP && ke8._reg().browsers[p8.id].browserChoice.version === '150.0.7871.186-vs1' && runs1() === 1, '…it lands, and the next launch runs it with its measured version (one --version)', { st: ED.kernelFact(EID).state, runs: runs1() });
  await ke8.stop(p8.id, { why: 'user' });
  // ⑧ a kernel placed BY HAND (no receipt): measured once (keyed by its size + mtime), «declared» until then
  const ED2 = EDM.create({ dataDir: path.join(ROOT, 'data-ed2'), engines: ENGR, loader: LDR, log: { log() {}, warn() {} } });
  fs.rmSync(path.join(kdir, 'install-receipt.json'), { force: true }); fs.rmSync(RUNS, { force: true });
  const m8 = await ED2.measure(EID); const m8b = await ED2.measure(EID);
  ok(m8.version === '150.0.7871.186-vs1' && /^stat:/.test(m8.for) && m8b.cached && runs1() === 1 && ED2.kernelFact(EID).state === 'absent' && ED2.kernelFact(EID).measuredVersion === '150.0.7871.186-vs1', 'a kernel placed by hand (no receipt): measured once too, keyed by its size + mtime');
  // ⑧b the kernel side's OWN CLI stub (their src/fake-kernel-stub.mjs — a shebang program whose --version prints a version) as the
  // kernel at its place: measured by VibeSpace (the plugin has no childProcess) — when VIBESPACE_CUSTOM_BROWSER_PLUGIN names their package
  const peerStub = peerDir ? path.join(peerDir, 'src', 'fake-kernel-stub.mjs') : '';
  if (!peerStub || !fs.existsSync(peerStub)) console.log('  … SKIP the measured --version of the kernel side\'s own CLI stub — VIBESPACE_CUSTOM_BROWSER_PLUGIN names no package with src/fake-kernel-stub.mjs here');
  else {
    const PD = path.join(ROOT, 'peer-kernel', 'data');
    const pk = path.join(PD, 'plugins-state', EID, 'kernel', 'linux-x64', 'chrome');
    // a COPY at the kernel's place (their CLI checks argv[1] against its own path — a symlink would never run its main): the stub as
    // `chrome` beside its sibling modules, an ESM package marker so the extension-less program loads as a module
    fs.mkdirSync(path.dirname(pk), { recursive: true });
    for (const f of fs.readdirSync(path.dirname(peerStub)).filter((n) => /\.mjs$/.test(n))) fs.copyFileSync(path.join(path.dirname(peerStub), f), path.join(path.dirname(pk), f));
    fs.copyFileSync(peerStub, pk); fs.chmodSync(pk, 0o755);
    fs.writeFileSync(path.join(path.dirname(pk), 'package.json'), JSON.stringify({ type: 'module' }));
    const EDp = EDM.create({ dataDir: PD, engines: { kernelPath: () => pk }, log: { log() {}, warn() {} } });
    const mp = await EDp.measure(EID);
    ok(mp.ok && /^\d{2,4}\.\d+\.\d+\.\d+/.test(mp.version) && /measured /.test(BMm.engineNote({ id: EID, label: 'Custom Browser Kernel', installed: true, executable: true, version: null, measuredVersion: mp.version }, tW)), `the kernel side's OWN CLI stub at the kernel's place: VibeSpace's --version (serviceEnv, 5 s) measures it — «measured ${mp.version}» (it says «${mp.says}»)`, mp);
  }
  // ⑨ RED CONTROL: a copy without the sha256 check installs the corrupted archive — exactly what ④'s sha leg refuses
  const EDS = read('src/server/engine-distribution.js');
  const shaAnchor = "    if (sha !== m.sha256) throw named('build_verify_failed',";
  ok(EDS.includes(shaAnchor), 'control: the sha256 check\'s anchor is in engine-distribution.js');
  const { mutantCopies: mutantCopies8 } = await import('./mutant-copy.mjs');
  const EDx = mutantCopies8('builds-kernel', REPO).load('src/server/engine-distribution.js', EDS.replace(shaAnchor, "    if (false) throw named('build_verify_failed',"), 'no-sha');
  const EDxi = EDx.create({ dataDir: path.join(EROOT, 'data'), engines: ENGR, loader: LDR, resolveUrl, log: { log() {}, warn() {} } });
  writeKJ('/k.tar.zst', 'a'.repeat(64), { bytes: ARCH.length });
  const ex8 = await thrK(EDxi.installKernel(EID, { wait: true }));
  ok(!ex8 && JSON.parse(fs.readFileSync(path.join(kdir, 'install-receipt.json'), 'utf8')).sha256 === sha(ARCH), 'control: a copy without the sha256 check INSTALLS an archive whose sha256 is not the declared one — RED against ④', ex8 && ex8.code);

  // ═══ ROUND 2 (主开发's acceptance, 2026-10-25): the extract's writes, a Node without zstd, the landing, the fleet URL, `./` ═══
  const quiet8 = { log() {}, warn() {} };
  const fsp8 = fs.promises;
  const M8 = mutantCopies8('builds-kernel-r2', REPO);
  /** an engine-distribution over its OWN data folder (a copy of the package's kernel.json) — its record never mixes with ED's */
  const edAt = (name, opts = {}, mod = EDM) => { const dd = path.join(ROOT, name); fs.mkdirSync(path.join(dd, 'plugins', EID), { recursive: true }); fs.copyFileSync(KJ, path.join(dd, 'plugins', EID, 'kernel.json')); return mod.create({ dataDir: dd, engines: ENGR, loader: LDR, resolveUrl, log: quiet8, ...opts }); };
  const removing = path.join(path.dirname(kdir), '.removing-linux-x64'), unpacking = path.join(path.dirname(kdir), '.unpack-linux-x64');
  const leftovers = () => fs.readdirSync(path.dirname(kdir)).filter((n) => /\.part$|^\.unpack-|^\.removing-/.test(n));
  // ⑩ (MUST 1) THE EXTRACT'S WRITES: ONE 'error' listener per file for its whole life; a failed write (ENOSPC) is the install's
  // refusal by name — no 'uncaughtException' (the hub's exit), no partial, the previous kernel untouched
  /** a write-stream door that COUNTS each stream's 'error' listeners at every write and fails the write `failOn` picks (ENOSPC) */
  const countingIo = (failOn = () => false) => {
    const st = { writes: 0, maxErr: 0, failed: 0 };
    return { st, createWriteStream: (f, o) => {
      const ws = fs.createWriteStream(f, o); const w0 = ws._write.bind(ws); let n = 0; ws._writev = undefined;
      ws._write = (c, e, cb) => { st.writes++; n++; st.maxErr = Math.max(st.maxErr, ws.listenerCount('error')); if (failOn(f, n)) { st.failed++; return cb(Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC', errno: -28, syscall: 'write' })); } return w0(c, e, cb); };
      return ws;
    } };
  };
  const uncaught = []; const onU = (e) => uncaught.push((e && e.code) || String(e)); process.on('uncaughtException', onU);
  /** the install's answer, or `uncaught` the moment one reached the process, or `hung` */
  const settled = (p, ms) => Promise.race([p.then(() => null, (e) => e), new Promise((r) => { const t0 = Date.now(); const iv = setInterval(() => { if (uncaught.length || Date.now() - t0 > ms) { clearInterval(iv); r({ code: uncaught.length ? 'uncaught' : 'hung' }); } }, 10); })]);
  served['/big.tar.zst'] = tarOf(kernelEntries(undefined, [{ name: 'vibespace-chromium-150.0.7871.186-vs1-linux-x64/big.pak', body: crypto.randomBytes(3 * 1024 * 1024) }]));
  writeKJ('/big.tar.zst');
  const big = countingIo();
  const rBig = await settled(edAt('data-ed10a', { io: big }).installKernel(EID, { wait: true }), 20000);
  ok(!rBig && big.st.writes > 60 && big.st.maxErr <= 2 && !leftovers().length, `round 2: a 3 MB file extracted in ${big.st.writes} writes — at most ${big.st.maxErr} 'error' listener on its stream at any write (ONE, attached at its creation; the drain wait reuses it)`, { err: rBig && rBig.message, ...big.st });
  const prev10 = fs.readFileSync(KP);
  const nos = countingIo((f, n) => path.basename(f) === 'icudtl.dat' && n === 1);
  const eNos = await settled(edAt('data-ed10b', { io: nos }).installKernel(EID, { wait: true }), 8000);
  ok(eNos && eNos.code === 'disk' && /ran out of room/.test(eNos.message) && /ENOSPC/.test(eNos.message) && nos.st.failed === 1 && uncaught.length === 0 && !leftovers().length && fs.readFileSync(KP).equals(prev10) && fs.statSync(path.join(kdir, 'icudtl.dat')).size === 700,
    'round 2: an injected ENOSPC on an extracted file\'s write ⇒ the install answers `disk` by name; NO uncaughtException (the hub stays up), the partial folder removed, the previous kernel untouched', { code: eNos && eNos.code, msg: eNos && eNos.message, uncaught });
  const nosBig = countingIo((f, n) => path.basename(f) === 'big.pak' && n === 40);
  const eNosB = await settled(edAt('data-ed10c', { io: nosBig }).installKernel(EID, { wait: true }), 8000);
  const nosPart = countingIo((f, n) => /\.part$/.test(f) && n === 3);
  const eNosP = await settled(edAt('data-ed10d', { io: nosPart }).installKernel(EID, { wait: true }), 8000);
  ok(eNosB && eNosB.code === 'disk' && eNosP && eNosP.code === 'disk' && /the download/.test(eNosP.message) && uncaught.length === 0 && !leftovers().length && fs.readFileSync(KP).equals(prev10),
    '…the same mid-file (a write that waited for drain) and on the download\'s .part — `disk`, nothing left, no uncaughtException', { b: eNosB && eNosB.message, p: eNosP && eNosP.message, uncaught });
  // ⑩b ROUND 3 (1): A CLOSE THAT FAILS — 'finish' comes BEFORE fs.close; the writer settles on 'close', so a close-time ENOSPC (an
  // NFS bind's close-to-open) is the install's `disk` and nothing lands; fewer bytes on disk than written after the close ⇒ refused
  /** a write-stream door whose fs.close FAILS (ENOSPC) for the files `pick` names — or answers after cutting the file 1 byte short */
  const closeIo = (pick, how = 'enospc') => ({ createWriteStream: (f, o) => fs.createWriteStream(f, pick(f) ? { ...o, fs: { open: fs.open, write: fs.write, writev: fs.writev,
    close: (fd, cb) => (how === 'short' ? fs.ftruncate(fd, Math.max(0, fs.fstatSync(fd).size - 1), () => fs.close(fd, cb)) : fs.close(fd, () => cb(Object.assign(new Error('ENOSPC: no space left on device, close'), { code: 'ENOSPC', errno: -28, syscall: 'close' })))) } } : o) });
  const isIcu = (f) => path.basename(f) === 'icudtl.dat';
  writeKJ('/k.tar.zst');
  const inoC = fs.statSync(kdir).ino;
  const eC1 = await settled(edAt('data-ed10e', { io: closeIo(isIcu) }).installKernel(EID, { wait: true }), 8000);
  const eC2 = await settled(edAt('data-ed10f', { io: closeIo((f) => /\.part$/.test(f)) }).installKernel(EID, { wait: true }), 8000);
  const eC3 = await settled(edAt('data-ed10g', { io: closeIo(isIcu, 'short') }).installKernel(EID, { wait: true }), 8000);
  ok(eC1 && eC1.code === 'disk' && /ENOSPC/.test(eC1.message) && /icudtl\.dat/.test(eC1.message) && eC2 && eC2.code === 'disk' && /the download/.test(eC2.message) && uncaught.length === 0 && !leftovers().length && fs.statSync(kdir).ino === inoC,
    'round 3: an injected ENOSPC at CLOSE (after \'finish\') on an extracted file and on the download\'s .part ⇒ `disk` by name — NOTHING landed (the previous kernel\'s folder is the same one), nothing left, no uncaughtException', { c1: eC1 && eC1.message, c2: eC2 && eC2.message, uncaught });
  ok(eC3 && eC3.code === 'build_unpack_failed' && /699 of its 700 bytes are on disk after it was closed/.test(eC3.message) && !leftovers().length && fs.statSync(kdir).ino === inoC,
    'round 3: a close that leaves fewer bytes on disk than were written (699 of 700) ⇒ build_unpack_failed by name — the size on disk is compared after the close; nothing landed', eC3 && eC3.message);

  // ⑪ (MUST 3) A NODE WITHOUT ZSTD: refused by name BEFORE any byte (engine_node_unsupported: the floor + the running Node),
  // remembered on the engine record for THAT Node — its first use never downloads on it; the card says it
  writeKJ('/k.tar.zst');
  const nodeTodos = [];
  const EDn = edAt('data-ed11', { zlib: {}, nodeVersion: '20.20.2', userTodos: { add: (k, item) => { nodeTodos.push(item); return 'ut-n' + nodeTodos.length; } } });
  const h11 = hits.length;
  const eN1 = await thrK(EDn.installKernel(EID, { wait: true, by: 'first-use' }));
  const eN2 = await thrK(EDn.installKernel(EID, { wait: true, by: 'first-use' }));
  const recN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-ed11', 'browser-engines.json'), 'utf8')).engines[EID];
  const kfN = EDn.kernelFact(EID);
  ok(eN1 && eN1.code === 'engine_node_unsupported' && /Node 20\.20\.2/.test(eN1.message) && /Node 22\.15 or later/.test(eN1.message) && eN2 && eN2.code === 'engine_node_unsupported' && hits.length === h11,
    'round 2: a Node whose zlib has no zstd (a stub — Node 20.20.2\'s) ⇒ engine_node_unsupported BY NAME, naming the floor 22.15 and the running Node — ZERO bytes fetched, twice', { msg: eN1 && eN1.message, hits: hits.slice(h11) });
  ok(recN.failure && recN.failure.code === 'engine_node_unsupported' && recN.failure.node === '20.20.2' && recN.failure.need === '22.15' && kfN.code === 'engine_node_unsupported' && kfN.node === '20.20.2' && nodeTodos.length === 1 && /22\.15 or later/.test(nodeTodos[0].detail)
    && /needs Node 22\.15 or later to unpack — this VibeSpace runs on Node 20\.20\.2/.test(BMm.engineNote({ id: EID, installed: false, kernel: { state: 'failed', code: kfN.code, node: kfN.node, need: kfN.need } }, tW)),
    '…remembered on the engine record for that Node {code, node, need}; ONE For-you notice (update Node); the card says «needs Node 22.15 or later … runs on Node 20.20.2»', { failure: recN.failure, todos: nodeTodos.length });
  const EDn2 = EDM.create({ dataDir: path.join(ROOT, 'data-ed11'), engines: ENGR, loader: LDR, resolveUrl, nodeVersion: '24.12.0', log: quiet8 });
  await EDn2.ready;
  ok(EDn2.kernelFact(EID).code === null, '…a fact about THAT Node: the same record read on another Node (an upgrade) says nothing of it — the gate is asked again');
  const keN = mkKeeper(path.join(ROOT, 'data-eng11'), { engines: ENGR, engineDistribution: EDn, fleetFacts: () => null });
  const pN = keN.createProfile({ label: 'Old Node', browser: { kind: 'plugin', id: EID } }, { engine: await keN.engineFactOf(EID) });
  const keptK = path.join(ROOT, 'kernel-kept'); fs.rmSync(keptK, { recursive: true, force: true }); fs.renameSync(kdir, keptK); // the kernel absent: its first use
  const h11b = hits.length;
  const eK1 = await thrK(keN.start(pN.id, { why: 'test' })); const eK2 = await thrK(keN.start(pN.id, { why: 'test' }));
  fs.renameSync(keptK, kdir);
  ok(eK1 && eK1.code === 'browser_engine_kernel_missing' && /cannot download it here/.test(eK1.message) && /Node 20\.20\.2/.test(eK1.message) && !/downloading it now/.test(eK1.message) && eK2 && eK2.code === 'browser_engine_kernel_missing' && hits.length === h11b && nodeTodos.length === 1,
    'round 2: its FIRST USE on that Node: the launch refused by name saying why (Node 20.20.2; 22.15 or later) — never «downloading it now», no request, again none, still ONE notice', { e1: eK1 && eK1.message, hits: hits.slice(h11b) });

  // ⑫ (SHOULD 4) THE LANDING: a final rename that fails AFTER the previous kernel was moved aside puts it BACK; a landing that
  // finds an aside copy (an earlier one stopped between its renames) restores it before anything could delete it
  const failLand = { rename: async (a, b) => { if (a === unpacking && b === kdir) throw Object.assign(new Error('EXDEV: cross-device link not permitted, rename'), { code: 'EXDEV' }); return fsp8.rename(a, b); } };
  const prev12 = fs.readFileSync(KP);
  const eL = await thrK(edAt('data-ed12a', { io: failLand }).installKernel(EID, { wait: true }));
  const mL = await edAt('data-ed12b').measure(EID, { force: true });
  ok(eL && eL.code === 'build_unpack_failed' && /the previous kernel was put back/.test(eL.message) && fs.readFileSync(KP).equals(prev12) && mL.ok && mL.version === '150.0.7871.186-vs1' && !leftovers().length,
    'round 2: the final rename fails (EXDEV) after the previous kernel was moved aside ⇒ it is moved BACK and said so — the previous kernel\'s path still measures', { msg: eL && eL.message, m: mL.version || mL.code });
  fs.renameSync(kdir, removing); // an earlier landing stopped between its two renames: the previous kernel aside, nothing in its place
  const eL2 = await thrK(edAt('data-ed12c', { io: failLand }).installKernel(EID, { wait: true }));
  const back2 = fs.existsSync(KP) && fs.readFileSync(KP).equals(prev12) && !fs.existsSync(removing);
  fs.renameSync(kdir, removing);
  const rL3 = await thrK(edAt('data-ed12d').installKernel(EID, { wait: true }));
  ok(eL2 && /put back/.test(eL2.message) && back2 && !rL3 && fs.existsSync(KP) && !leftovers().length, '…a kernel found ASIDE is restored first (never deleted unrestored): a failing landing leaves it in its place, a good one replaces it and leaves no .removing-', { e2: eL2 && eL2.message, back2, r3: rL3 && rL3.message });
  // ⑫b ROUND 3 (2): THE ASIDE COPY IS PUT BACK FIRST — at the boot, at measure, at a first use — with NO download; one that cannot
  // be put back ⇒ the record holds NO kernel (engine_kernel_aside: never «installed» over an empty place), the card names it
  writeKJ('/k.tar.zst');
  const failBack = { rename: async (a, b) => { if (a === removing && b === kdir) throw Object.assign(new Error('EACCES: permission denied, rename'), { code: 'EACCES' }); return fsp8.rename(a, b); } };
  const failBoth = { rename: async (a, b) => { if ((a === unpacking || a === removing) && b === kdir) { const c = a === removing ? 'EACCES' : 'EXDEV'; throw Object.assign(new Error(c + ': rename'), { code: c }); } return fsp8.rename(a, b); } };
  const asideTodos = [];
  const atB = (opts = {}, mod = EDM) => edAt('data-ed12e', { userTodos: { add: (k, item) => { asideTodos.push(item); return 'ut-a' + asideTodos.length; } }, ...opts }, mod);
  const recB = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data-ed12e', 'browser-engines.json'), 'utf8')).engines[EID];
  const r12e = await thrK(atB().installKernel(EID, { wait: true })); // the record: installed
  fs.renameSync(kdir, removing); // a landing stopped between its two renames (the hub died there): the kernel aside, its place empty
  const h12 = hits.length;
  const B1 = atB(); const b1 = await B1.bootFleet();
  const mB1 = await B1.measure(EID, { force: true });
  ok(!r12e && b1.restored && b1.restored.length === 1 && b1.restored[0].restored === true && fs.existsSync(KP) && !fs.existsSync(removing) && mB1.ok && mB1.version === '150.0.7871.186-vs1' && hits.length === h12 && B1.kernelFact(EID).state === 'installed',
    'round 3: a .removing-<tag> beside an EMPTY place ⇒ the boot puts it back with NO download — the kernel path measures; the record says installed (it is)', { b1, m: mB1.version || mB1.code, hits: hits.slice(h12) });
  fs.renameSync(kdir, removing);
  const B2 = atB({ io: failBack }); const b2 = await B2.bootFleet();
  const kf2 = B2.kernelFact(EID), rec2 = recB();
  const m2b = await B2.measure(EID, { force: true });
  const e2b = await thrK(B2.installKernel(EID, { wait: true, by: 'first-use' }));
  ok(b2.restored[0].restored === false && b2.restored[0].code === 'engine_kernel_aside' && kf2.state === 'failed' && kf2.code === 'engine_kernel_aside' && !rec2.kernel && rec2.aside && rec2.aside.version === '150.0.7871.186-vs1' && !fs.existsSync(KP) && fs.existsSync(removing)
    && !m2b.ok && m2b.code === 'engine_kernel_aside' && e2b && e2b.code === 'engine_kernel_aside' && hits.length === h12 && asideTodos.length === 1 && /set aside and could not be put back/.test(asideTodos[0].text)
    && /previous kernel is set aside and could not be put back in its place/.test(BMm.engineNote({ id: EID, installed: false, kernel: { state: kf2.state, code: kf2.code } }, tW)),
    'round 3: the put-back FAILS (EACCES) ⇒ the record holds NO kernel (engine_kernel_aside; the aside kernel kept as `aside`) — never «installed» over an empty place; measure and a first use refuse by name with NO download; ONE For-you notice; the card names it', { b2: b2.restored, kf2, todos: asideTodos.length });
  const B3 = atB(); const b3 = await B3.bootFleet(); const kf3 = B3.kernelFact(EID);
  ok(b3.restored[0].restored === true && fs.existsSync(KP) && kf3.state === 'installed' && kf3.version === '150.0.7871.186-vs1' && kf3.code === null && hits.length === h12,
    '…the next start puts it back: the aside kernel\'s record is the installed one again, the failure cleared — still no download', kf3);
  const D1 = atB({ io: failBoth });
  const eD = await thrK(D1.installKernel(EID, { wait: true }));
  const kfD = D1.kernelFact(EID), emptyD = !fs.existsSync(KP) && fs.existsSync(removing);
  const mD = await atB().measure(EID, { force: true });
  ok(eD && eD.code === 'engine_kernel_aside' && /could not be put back \(EACCES\)/.test(eD.message) && emptyD && kfD.state !== 'installed' && kfD.code === 'engine_kernel_aside' && mD.ok && fs.existsSync(KP) && !fs.existsSync(removing),
    'round 3: the final rename AND the put-back fail in ONE landing ⇒ engine_kernel_aside by name, the record NOT «installed» while the place is empty; the next measure puts it back FIRST and measures it', { e: eD && eD.message, kfD, m: mD.version || mD.code });
  const keA = mkKeeper(path.join(ROOT, 'data-eng12'), { engines: ENGR, engineDistribution: atB(), fleetFacts: () => null });
  const pA = keA.createProfile({ label: 'Aside', browser: { kind: 'plugin', id: EID } }, { engine: await keA.engineFactOf(EID) });
  fs.renameSync(kdir, removing); const h12b = hits.length;
  const sA = await thrK(keA.start(pA.id, { why: 'test' }));
  ok(!sA && fs.existsSync(KP) && !fs.existsSync(removing) && hits.length === h12b && fake.launches().at(-1).exe === KP, 'round 3: a FIRST USE finds the kernel aside ⇒ the launch puts it back (no download) and starts it', { e: sA && sA.message, hits: hits.slice(h12b) });
  await keA.stop(pA.id, { why: 'user' });
  // ⑫c ROUND 4: THE PUT-BACK ONLY ONTO AN ENOENT-EMPTY PLACE — a stat of the place answering anything else (EIO / ESTALE) is a
  // transient: nothing moved, nothing said; a leftover beside a GOOD kernel is deleted, never put back over it; a record dropped
  // once is healed by the next probe / measure that finds the kernel in its place
  const leftTodos = [];
  const atL = (opts = {}, mod = EDM) => edAt('data-ed12f', { userTodos: { add: (k, item) => { leftTodos.push(item); return 'ut-l' + leftTodos.length; } }, ...opts }, mod);
  const recAt = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, name, 'browser-engines.json'), 'utf8')).engines[EID];
  /** a stat door whose FIRST stat of the kernel's place answers EIO (an NFS bind's transient), every other one the disk's */
  const eioOnce = () => { const st = { n: 0 }; return { st, io: { stat: async (f) => { if (f === kdir && st.n++ === 0) throw Object.assign(new Error('EIO: i/o error, stat'), { code: 'EIO' }); return fsp8.stat(f); } } }; };
  const r12f = await thrK(atL().installKernel(EID, { wait: true })); // the record: installed
  const kL = recAt('data-ed12f').kernel;
  fs.cpSync(kdir, removing, { recursive: true }); // (a) a LEFTOVER beside a GOOD kernel (the landing's rm failed; an NFS silly-rename)
  const h12c = hits.length;
  const eA1 = eioOnce();
  const A1 = atL({ io: eA1.io }); const a1 = await A1.bootFleet();
  const kfA1 = A1.kernelFact(EID), recA1 = recAt('data-ed12f'), keptA1 = fs.existsSync(removing);
  const mA1 = await A1.measure(EID, { force: true }); // the next time the place reads: the leftover is deleted
  const recA2 = recAt('data-ed12f');
  ok(!r12f && eA1.st.n >= 2 && a1.restored.length === 0 && keptA1 && kfA1.state === 'installed' && kfA1.code === null && JSON.stringify(recA1.kernel) === JSON.stringify(kL) && !recA1.aside && !recA1.failure
    && mA1.ok && !fs.existsSync(removing) && fs.existsSync(KP) && JSON.stringify(recA2.kernel) === JSON.stringify(kL) && !recA2.failure && leftTodos.length === 0 && hits.length === h12c,
    'round 4 (a): a .removing-<tag> LEFTOVER beside a GOOD kernel + ONE stat of the place answering EIO ⇒ a transient: nothing moved, no notice, the record untouched; the next measure deletes the leftover — never put back over the kernel — still no notice, no download',
    { stats: eA1.st.n, a1: a1.restored, kfA1, kept: keptA1, m: mA1.version || mA1.code, todos: leftTodos.length });
  fs.renameSync(kdir, removing); // (b) an aside copy beside an EMPTY place (ENOENT)
  const A2 = atL(); const a2 = await A2.bootFleet();
  ok(a2.restored.length === 1 && a2.restored[0].restored === true && fs.existsSync(KP) && !fs.existsSync(removing) && A2.kernelFact(EID).state === 'installed' && JSON.stringify(recAt('data-ed12f').kernel) === JSON.stringify(kL) && leftTodos.length === 0 && hits.length === h12c,
    'round 4 (b): …an aside copy beside an EMPTY place (ENOENT) is put back, as in round 3 — the record installed, no notice, no download', a2.restored);
  fs.renameSync(kdir, removing); // (c) the put-back FAILS once: the record drops its kernel (engine_kernel_aside), ONE notice
  const C1 = atL({ io: failBack }); const c1 = await C1.bootFleet();
  const dropped = c1.restored[0] && c1.restored[0].code === 'engine_kernel_aside' && !recAt('data-ed12f').kernel && C1.kernelFact(EID).state === 'failed' && leftTodos.length === 1;
  fs.renameSync(removing, kdir); // the kernel back in its place without VibeSpace (put back by hand; the file server's late rename)
  const C2 = atL(); await C2.ready; // kernelFact is sync: read once the record is loaded
  const stillC = C2.kernelFact(EID).state;
  const keC = mkKeeper(path.join(ROOT, 'data-eng12c'), { engines: ENGR, engineDistribution: C2, fleetFacts: () => null });
  const pC = keC.createProfile({ label: 'Healed', browser: { kind: 'plugin', id: EID } }, { engine: await keC.engineFactOf(EID) });
  const sC = await thrK(keC.start(pC.id, { why: 'test' }));
  const kfC = C2.kernelFact(EID), recC = recAt('data-ed12f');
  ok(dropped && stillC === 'failed' && !sC && fake.launches().at(-1).exe === KP && kfC.state === 'installed' && kfC.version === kL.version && kfC.code === null && JSON.stringify(recC.kernel) === JSON.stringify(kL) && !recC.aside && !recC.failure && leftTodos.length === 1 && hits.length === h12c,
    'round 4 (c): a record DROPPED once (a put-back that failed) + the kernel back in its place ⇒ the next good probe (a first use: installed, executable) measures and the record says installed again — its own record, the failure cleared, no download, no second notice',
    { dropped, stillC, kfC, e: sC && sC.message });
  await keC.stop(pC.id, { why: 'user' });

  // ⑬ THE RED CONTROLS of round 2 — patched copies, each turning a leg above red
  const fwA = EDS.indexOf('  function fileWriter(dest) {'), fwB = EDS.indexOf('  /** The free bytes of the filesystem');
  const gateAnchor = '      planOf(sid, { unpack: unpackFacts() });';
  const backAnchor = '      if (had) { try { await io.rename(plan.removingDir, plan.targetDir); back = true; }';
  const asideAnchor = '  async function putBack(sid, plan) {';
  const EKS = read('src/engine-kernel.js');
  const urlAnchor = "if (flUrl && !httpsUrlOf(flUrl)) return { ok: false, code: 'engine_url_not_https'";
  const rootAnchor = '    if (v.root) continue;';
  ok(fwA > 0 && fwB > fwA && [gateAnchor, backAnchor, asideAnchor].every((a) => EDS.includes(a)) && [urlAnchor, rootAnchor].every((a) => EKS.includes(a)), 'control: round 2\'s anchors are in engine-distribution.js and engine-kernel.js');
  // (1) the OLD writer: an 'error' listener per drain wait, none between waits
  const OLDW = ['  function fileWriter(dest) {', "    const ws = io.createWriteStream(dest, { flags: 'wx', mode: 0o600 });", '    return {', '      stream: ws,',
    "      async write(buf) { if (!ws.write(buf)) await new Promise((r, j) => { ws.once('drain', r); ws.once('error', j); }); },",
    '      async end() { await new Promise((resolve, reject) => ws.end((e) => (e ? reject(e) : resolve()))); },', '      destroy() { try { ws.destroy(); } catch { /* gone */ } },', '    };', '  }', ''].join('\n');
  const EDw = M8.load('src/server/engine-distribution.js', EDS.slice(0, fwA) + OLDW + EDS.slice(fwB), 'old-writer');
  writeKJ('/big.tar.zst');
  const bigR = countingIo();
  await settled(edAt('data-ed13a', { io: bigR }, EDw).installKernel(EID, { wait: true }), 20000);
  const nosR = countingIo((f, n) => path.basename(f) === 'icudtl.dat' && n === 1);
  const eNosR = await settled(edAt('data-ed13b', { io: nosR }, EDw).installKernel(EID, { wait: true }), 3000);
  await new Promise((r) => setTimeout(r, 50));
  process.off('uncaughtException', onU);
  ok(bigR.st.maxErr > 2 && (uncaught.length > 0 || (eNosR && eNosR.code === 'hung')), `control (1): the OLD extract is RED — ${bigR.st.maxErr} 'error' listeners piled on one stream; the injected ENOSPC ${uncaught.length ? `reached process 'uncaughtException' (${uncaught.join(', ')}) — the hub's exit` : 'hung the install'}`, { maxErr: bigR.st.maxErr, uncaught, eNosR: eNosR && eNosR.code });
  for (const n of leftovers()) fs.rmSync(path.join(path.dirname(kdir), n), { recursive: true, force: true }); // what the hung copy left
  // (3) no node gate: the whole archive fetched and hashed, then the ARCHIVE blamed
  const EDg = M8.load('src/server/engine-distribution.js', EDS.replace(gateAnchor, '      planOf(sid, { unpack: null });'), 'no-node-gate');
  writeKJ('/k.tar.zst'); const h13 = hits.length;
  const eG = await thrK(edAt('data-ed13c', { zlib: {}, nodeVersion: '20.20.2' }, EDg).installKernel(EID, { wait: true }));
  ok(eG && eG.code === 'build_unpack_failed' && hits.length > h13 && fs.existsSync(KP), 'control (3): a copy WITHOUT the gate fetches the whole archive, hashes it, then blames the ARCHIVE (build_unpack_failed) — RED against ⑪', { code: eG && eG.code, hits: hits.slice(h13) });
  // (4) no put-back / no restore: the previous kernel lost
  const EDb = M8.load('src/server/engine-distribution.js', EDS.replace(backAnchor, backAnchor.replace('if (had)', 'if (false)')), 'no-put-back');
  const eB = await thrK(edAt('data-ed13d', { io: failLand }, EDb).installKernel(EID, { wait: true }));
  const lostB = !fs.existsSync(KP) && fs.existsSync(removing);
  const EDa = M8.load('src/server/engine-distribution.js', EDS.replace(asideAnchor, asideAnchor + ' return false;'), 'no-restore');
  const mB = await edAt('data-ed13e', {}, EDa).measure(EID, { force: true }); // round 3's measure would put it back — this copy never does
  const eA = await thrK(edAt('data-ed13f', { io: failLand }, EDa).installKernel(EID, { wait: true })); // the aside copy the control above left
  const lostA = !fs.existsSync(KP) && !fs.existsSync(removing);
  ok(eB && eA && !mB.ok && mB.code === 'browser_engine_kernel_missing' && lostB && lostA, 'control (4): a copy that does not move the previous kernel back leaves NO kernel at its path (measure: kernel missing) — RED; a copy that does not restore an aside copy DELETES it at the next landing — the previous kernel lost, RED', { mB: mB.code, lostB, lostA });
  // (6) the fleet's http URL dropped for the package's; (7) `./` read as a top folder
  const EKf = M8.load('src/engine-kernel.js', EKS.replace(urlAnchor, "if (flUrl && !httpsUrlOf(flUrl)) flUrl = ''; if (false) return { ok: false, code: 'engine_url_not_https'"), 'fleet-fallback');
  const fF = EKf.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: 'http://artifacts.fleet.test/k.tar.zst', sha256: 'b'.repeat(64) } });
  ok(fF.ok && fF.host === 'kernels.test', 'control (6): a copy that DROPS the http fleet URL silently takes the package\'s address in its place — RED against the refusal', { ok: fF.ok, host: fF.host });
  const EKr = M8.load('src/engine-kernel.js', EKS.replace(rootAnchor, '    /* no root rule */'), 'no-root');
  const dR = EKr.tarShapeVerdict(dotList, { layout: { stripComponents: 1, requiredFiles: ['chrome', 'icudtl.dat'] } });
  ok(!dR.ok && /two top folders/.test(dR.error), 'control (7): a copy without the root rule reads `./` as a top folder («two top folders») — RED', dR.error);
  // ROUND 3's RED controls. (8) the end settles at 'finish' (round 2's): a file that failed at close LANDS, and one short of its bytes
  const endA = EDS.indexOf('      async end() {'), endB = EDS.indexOf('      destroy() { try { ws.destroy(); }');
  const OLDEND = "      async end() { if (err()) throw err(); const p = wait(); ws.end((e) => settle(e ? err() || e : err())); await p; if (err()) throw err(); },\n";
  const EDe = M8.load('src/server/engine-distribution.js', EDS.slice(0, endA) + OLDEND + EDS.slice(endB), 'end-at-finish');
  writeKJ('/k.tar.zst');
  await thrK(edAt('data-ed13x').installKernel(EID, { wait: true })); // a kernel in its place again (control (4) lost it)
  const ino8 = fs.statSync(kdir).ino;
  const rE1 = await thrK(edAt('data-ed13g', { io: closeIo(isIcu) }, EDe).installKernel(EID, { wait: true }));
  const landed8 = fs.statSync(kdir).ino !== ino8;
  const rE2 = await thrK(edAt('data-ed13h', { io: closeIo(isIcu, 'short') }, EDe).installKernel(EID, { wait: true }));
  const short8 = fs.statSync(path.join(kdir, 'icudtl.dat')).size;
  ok(endA > 0 && endB > endA && !rE1 && landed8 && !rE2 && short8 === 699, 'control (8): a copy whose end settles at \'finish\' (round 2\'s) LANDS the kernel whose icudtl.dat failed at close, and one whose icudtl.dat is 699 of its 700 bytes — RED against ⑩b', { e1: rE1 && rE1.message, landed8, e2: rE2 && rE2.message, short8 });
  // (9) no put-back at the boot: the place stays EMPTY while the record says «installed»
  const bootAnchor = '    const restored = await bootRestore();';
  const asideRecAnchor = '      if (!back) { const rk = recOf(sid);';
  ok([bootAnchor, asideRecAnchor].every((a) => EDS.includes(a)), 'control: round 3\'s anchors are in engine-distribution.js');
  const ED9 = M8.load('src/server/engine-distribution.js', EDS.replace(bootAnchor, '    const restored = [];'), 'no-boot-restore');
  await thrK(atB().installKernel(EID, { wait: true })); // the record: installed
  fs.renameSync(kdir, removing);
  const n9 = atB({}, ED9); await n9.bootFleet();
  const lie9 = !fs.existsSync(KP) && n9.kernelFact(EID).state === 'installed';
  fs.renameSync(removing, kdir);
  ok(lie9, 'control (9): a copy whose boot does not put the aside copy back leaves the place EMPTY while the record says «installed» — RED against ⑫b', { lie9 });
  // (10) the landing keeps the record when NEITHER kernel is in its place
  const ED10 = M8.load('src/server/engine-distribution.js', EDS.replace(asideRecAnchor, '      if (false) { const rk = recOf(sid);'), 'aside-record');
  const n10 = atB({ io: failBoth }, ED10); const e10 = await thrK(n10.installKernel(EID, { wait: true }));
  const lie10 = !fs.existsSync(KP) && fs.existsSync(removing) && n10.kernelFact(EID).state === 'installed';
  fs.renameSync(removing, kdir);
  ok(e10 && e10.code === 'build_unpack_failed' && lie10, 'control (10): a copy whose landing keeps the record when both renames fail says «installed» over an EMPTY place — RED against ⑫b', { e10: e10 && e10.code, lie10 });
  // (11) round 2's fleet reading: a malformed fleet sha256 dropped for the package's — the silent fallback
  const shaFleetAnchor = "  const flSha = isObj(fleet) ? given(fleet.sha256).toLowerCase() : '';";
  const EKs = M8.load('src/engine-kernel.js', EKS.replace(shaFleetAnchor, "  const flSha = isObj(fleet) && SHA_RE.test(given(fleet.sha256).toLowerCase()) ? given(fleet.sha256).toLowerCase() : '';"), 'fleet-sha-fallback');
  const fS = EKs.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: '', sha256: 'abc123' } });
  ok(EKS.includes(shaFleetAnchor) && fS.ok && fS.sha256 === 'a'.repeat(64), 'control (11): a copy that DROPS a malformed fleet sha256 silently takes the package\'s sha256 in its place — RED against the refusal', { ok: fS.ok, sha: fS.sha256 });
  // ROUND 4's RED controls. (12) round 3's put-back predicate: ANY stat error of the place reads as an empty place (its stat
  // through the same injectable door, so the EIO reaches it), and a leftover beside a kernel is kept
  const pbA = EDS.indexOf('    // round 4: put back ONLY onto a place that answers ENOENT'), pbB = EDS.indexOf('    const rec = recOf(sid);\n    try { await io.rename(plan.removingDir, plan.targetDir); }');
  const OLDPB = '    try { await io.stat(plan.targetDir); return false; } catch { /* nothing in its place — restore */ }\n';
  const ED12 = M8.load('src/server/engine-distribution.js', EDS.slice(0, pbA) + OLDPB + EDS.slice(pbB), 'any-error-put-back');
  const redTodos = [];
  const atR = (opts = {}, mod = EDM) => edAt('data-ed13i', { userTodos: { add: (k, item) => { redTodos.push(item); return 'ut-r' + redTodos.length; } }, ...opts }, mod);
  await thrK(atR().installKernel(EID, { wait: true })); // the record: installed
  const k13 = recAt('data-ed13i').kernel;
  fs.cpSync(kdir, removing, { recursive: true }); // a leftover beside the good kernel
  const n12 = atR({ io: eioOnce().io }, ED12); const b12 = await n12.bootFleet();
  const kf12 = n12.kernelFact(EID), rec12 = recAt('data-ed13i');
  const b12b = await atR({}, ED12).bootFleet(); // the next start, the place reading again
  ok(pbA > 0 && pbB > pbA && b12.restored[0] && b12.restored[0].code === 'engine_kernel_aside' && kf12.state === 'failed' && !rec12.kernel && fs.existsSync(KP) && redTodos.length === 1 && /set aside and could not be put back/.test(redTodos[0].text) && b12b.restored.length === 0 && fs.existsSync(removing),
    'control (12): round 3\'s predicate (any stat error = an empty place) renames onto the GOOD kernel after ONE EIO ⇒ engine_kernel_aside, the record DROPPED, a FALSE For-you notice — and the leftover kept beside the kernel at the next start — RED against ⑫c (a)', { b12: b12.restored, kf12: kf12.state, todos: redTodos.length, kept: fs.existsSync(removing) });
  // (13) no heal: the record dropped by (12) stays dropped while the kernel measures in its place
  const healAnchor = '    if (!rec.kernel && !running.has(sid)) await placeHeld(sid, plan, rec);';
  const ED13 = M8.load('src/server/engine-distribution.js', EDS.replace(healAnchor, ''), 'no-heal');
  const n13 = atR({}, ED13); const m13 = await n13.measure(EID, { force: true });
  const kf13 = n13.kernelFact(EID);
  ok(EDS.includes(healAnchor) && m13.ok && kf13.state === 'failed' && !recAt('data-ed13i').kernel, 'control (13): a copy without the heal MEASURES the kernel in its place while the record stays dropped («failed» over a good kernel) — RED against ⑫c (c)', { m: m13.version || m13.code, kf13: kf13.state });
  // (14) the keeper's round-3 re-measure condition: a probe that says installed + a measured version never asks — no heal
  const KS = read('src/server/browser-keeper.js');
  const unrecAnchor = '(!engine.measuredVersion || unrecorded)';
  const K14 = M8.load('src/server/browser-keeper.js', KS.replace(unrecAnchor, '!engine.measuredVersion'), 'no-reprobe');
  fs.mkdirSync(path.join(ROOT, 'data-eng13'), { recursive: true });
  const d14 = atR(); await d14.ready;
  const ke14 = K14.create({ dataDir: path.join(ROOT, 'data-eng13'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3,
    log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, engines: ENGR, engineDistribution: d14, fleetFacts: () => null });
  const p14 = ke14.createProfile({ label: 'Not healed', browser: { kind: 'plugin', id: EID } }, { engine: await ke14.engineFactOf(EID) });
  const s14 = await thrK(ke14.start(p14.id, { why: 'control' }));
  const kf14 = d14.kernelFact(EID);
  await ke14.stop(p14.id, { why: 'user' }).catch(() => {});
  ok(KS.includes(unrecAnchor) && !s14 && kf14.state === 'failed' && !recAt('data-ed13i').kernel, 'control (14): a keeper that re-measures only a kernel with no measured version launches it and leaves the record dropped — RED against ⑫c (c)', { e: s14 && s14.message, kf14: kf14.state });
  const n14 = atR(); const m14 = await n14.measure(EID, { force: true });
  ok(m14.ok && n14.kernelFact(EID).state === 'installed' && JSON.stringify(recAt('data-ed13i').kernel) === JSON.stringify(k13), '(the same record healed by the product\'s measure — its own record again)', recAt('data-ed13i'));
  const rRe = await thrK(ED.installKernel(EID, { wait: true })); // the kernel back in its place
  ok(!rRe && fs.existsSync(KP) && !leftovers().length, '(the kernel reinstalled; nothing left beside it)', rRe && rRe.message);

  // ═══ ⑧c lane kernel-asset-credential: THE KERNEL ON THE PLUGIN'S OWN REPOSITORY (a GitHub Release asset) ═════════════════════
  // The owner 2026-10-26: 「内核是支持文件，应该放到仓库里」. PURE kernelCredentialVerdict (R1) + the REAL engine-distribution over
  // loopback fakes in GitHub's shape — THE RULE RELIED ON (docs.github.com «Get a release asset»: set `Accept:
  // application/octet-stream`; «the API will either redirect the client to the location, or stream it directly»; API clients
  // handle 200 or 302): a PRIVATE repository's asset answers the API form `api.github.com/repos/<o>/<r>/releases/assets/<n>` to
  // `Authorization: Bearer <token>` with a 302 to a SIGNED file-host address (404 without the token); the file host answers 400
  // when an Authorization arrives beside the signature; the browser form `github.com/<o>/<r>/releases/download/<tag>/<file>` is
  // a browser's (a session cookie) — a token gets 404 there. And a STRANGER host. The token is built at runtime (never one literal).
  // ROUND 2 (acceptance r2): `pub` turns the fake repository PUBLIC (the API and the browser form answer without a token) — the
  // credential is OPTIONAL: a row that cannot serve (locked, unreadable, a deploy key) goes anonymous and is said only on a 404.
  console.log('— ⑧c lane kernel-asset-credential: a kernel on the plugin\'s own repository (a release asset) downloads with the Plugin Git credential');
  {
    const TOKEN = ['fx', 'kpat', 'R2d7', 'mQ94', 'Zt1x'].join('-');
    const KEYTEXT = ['-----BEGIN OPENSSH ', 'PRIVATE KEY-----\n', 'Zml4dHVyZS1rZXJuZWwta2V5', '\n-----END OPENSSH ', 'PRIVATE KEY-----'].join('');
    const OWN = 'https://github.com/acme/kernel-plugin.git';
    const ASSET = 'https://api.github.com/repos/acme/kernel-plugin/releases/assets/5550001';
    const FORM = 'https://github.com/acme/kernel-plugin/releases/download/v0.1.4/k.tar.zst';
    const STRANGER = 'https://mirror.stranger.test/k.tar.zst';
    // ── R1: PURE ──
    const KCV = typeof EK.kernelCredentialVerdict === 'function' ? EK.kernelCredentialVerdict : null;
    const cv = (kernelUrl, value = OWN, host = 'github.com', source = 'git') => (KCV ? KCV({ kernelUrl, install: value == null ? null : { source, value }, integration: host ? { host } : null }) : { use: null, why: 'engine-kernel.js has no kernelCredentialVerdict' });
    const yes = [[ASSET], [ASSET, 'git@github.com:Acme/Kernel-Plugin.git'], [ASSET, 'ssh://git@github.com/acme/kernel-plugin'], ['https://git.example.test/team/kp/releases/download/v1/k.tar.zst', 'https://git.example.test/team/kp.git', 'git.example.test']].map((a) => cv(...a));
    ok(yes.every((v) => v.use === true && v.why === 'plugin-repository') && yes[0].host === 'api.github.com' && yes[0].form === 'api' && yes[3].host === 'git.example.test' && yes[3].form === 'path',
      'R1 (PURE kernelCredentialVerdict): use ONLY for the plugin repository\'s own release asset — GitHub\'s API form of the SAME owner/repo (https, git@ and ssh:// sources; names case-insensitive), a Gitea / GitLab path under /<owner>/<repo>/ on the SAME host', yes.map((v) => `${v.use}:${v.host || v.why}`));
    const vForm = cv(FORM);
    ok(vForm.use === false && vForm.why === 'browser-form' && vForm.asset === true && vForm.form === 'browser' && vForm.repository && vForm.repository.path === 'acme/kernel-plugin',
      'R1 round 2 (minor 1): GitHub\'s BROWSER form of the plugin\'s own repository (github.com/<o>/<r>/releases/download/…) is the repository\'s asset but NEVER a use — GitHub serves it to a session, not a token (why browser-form)', vForm);
    const nos = [
      [[STRANGER], 'other-host'], [['https://objects.githubusercontent.com/x/k.tar.zst'], 'other-host'], [['https://evil.test/team/kp/k', 'https://git.example.test/team/kp.git', 'git.example.test'], 'other-host'],
      [['https://api.github.com/repos/acme/other/releases/assets/1'], 'not-the-repository'], [['https://api.github.com/repos/acme/kernel-plugin/releases/1'], 'not-the-repository'],
      [['https://github.com/acme/kernel-plugin/releases/download/../../x/k'], 'not-the-repository'], [['https://git.example.test/team/kpx/k.tar.zst', 'https://git.example.test/team/kp.git', 'git.example.test'], 'not-the-repository'],
      [['https://git.example.test/team/kp/%2e%2e/evil/k', 'https://git.example.test/team/kp.git', 'git.example.test'], 'not-the-repository'],
      [[ASSET, null], 'not-a-git-install'], [[ASSET, 'acme/kernel-plugin', 'github.com', 'github-release'], 'not-a-git-install'], [[ASSET, '/srv/plugins/kernel-plugin', 'github.com', 'path'], 'not-a-git-install'],
      [[ASSET, OWN, null], 'no-credential'], [[ASSET, OWN, 'gitlab.example.test'], 'credential-other-host'], [['http://api.github.com/repos/acme/kernel-plugin/releases/assets/1'], 'not-https'],
    ].map(([a, why]) => { const v = cv(...a); return [v.use === false ? v.why : `use=${v.use}`, why]; });
    ok(nos.every(([a, b]) => a === b) && cv(ASSET, OWN, null).asset === true && cv(STRANGER).asset === false,
      'R1: every no BY NAME — another host (a stranger, the release\'s file host) never sees it; another repository / not a release asset / a dot segment ⇒ not-the-repository; no git install ⇒ not-a-git-install; no row ⇒ no-credential; a row for another git host ⇒ credential-other-host; `asset` = the URL is the repository\'s own whatever the row', nos.filter(([a, b]) => a !== b));
    // ROUND 3 (minor 2a): THE GRAMMAR'S REFUSALS, each by its reason — the closed set GIT_SOURCE_REFUSALS (kb-file-structure's
    // table); the 13 shapes the round-2 unification narrowed (git cannot clone them) + the 4 it widened (a space before #ref)
    const GSV = typeof EK.gitSourceVerdict === 'function' ? EK.gitSourceVerdict : () => ({ ok: null, reason: 'engine-kernel.js has no gitSourceVerdict' });
    const GWHY = EK.GIT_SOURCE_REFUSALS || {};
    const WHY = [
      ['https://h.example/o/r #main', 'space'], ['https://h.example/o/r\n#main', 'space'], ['https://h.example/o/r\t#main', 'space'], ['git@h.example:o/r #v1', 'space'], ['https://h.example/o/r\r#main', 'space'], ['https://h.example/o/r#ma in', 'space'], ['https://h.example/o/r#main\u0000', 'space'],
      ['https://h.example:123456/o/r', 'port'], ['ssh://git@h.example:123456/o/r', 'port'],
      ['https://h.example/o/./r', 'dot'], ['https://h.example/o/../r', 'dot'], ['git@h.example:o/../r', 'dot'],
      ['https://h.example/.git', 'empty'], ['https://h.example/o/.git', 'empty'], ['https://h.example//', 'empty'], ['git@h.example:.git', 'empty'],
      ['https://h.example/' + 'b'.repeat(600), 'long'], ['git@h.example:2222:o/r', 'scp-port'], ['git@h.example/o/r', 'scp-slash'], ['ssh://git@h.example:o/r', 'ssh-colon'],
      ['https://h.example/o/k%2Fp', 'chars'], ['https://h.example/o/r?x=1', 'chars'], ['https://user@h.example/o/r', 'form'], ['http://h.example/o/r', 'form'], ['file:///tmp/x', 'form'], ['ssh://h.example/o/r', 'form'],
    ];
    const whyR = WHY.map(([v, want]) => { const r = GSV(v); return { v: JSON.stringify(v).slice(0, 48), want, got: r.ok === false ? r.reason : `ok=${r.ok}`, said: !!r.why && r.why === GWHY[want] }; });
    const reasonsG = Object.keys(GWHY);
    ok(whyR.every((r) => r.got === r.want && r.said) && reasonsG.length === 10 && reasonsG.every((k) => WHY.some(([, w]) => w === k)),
      'round 3 (minor 2a): EVERY refusal of the ONE git grammar by its reason (the closed set of 10, each in words): a space / tab / CR / LF / control character before or after #ref · a port of 6+ digits · a ./.. segment · an empty / slashes-only / .git-only path · a path > 512 · user@host:port:path · user@host/path · ssh://user@host:path · a character outside the path\'s set · none of git\'s three forms',
      whyR.filter((r) => r.got !== r.want || !r.said));
    const recG = GSV('  https://GitHub.com/acme/kernel-plugin.git#v1  '), recS = GSV('git@github.com:/acme/kernel-plugin.git');
    ok(recG.ok === true && recG.url === 'https://GitHub.com/acme/kernel-plugin.git' && recG.ref === 'v1' && recG.host === 'github.com' && recG.path === 'acme/kernel-plugin' && recG.https === true
      && recS.ok === true && recS.url === 'git@github.com:/acme/kernel-plugin.git' && recS.ref === null && recS.path === 'acme/kernel-plugin' && recS.https === false,
      'round 3 (major): THE PARSED RECORD — `url` = the value trimmed with its #ref cut off, as written (THE string git receives), `ref` the fragment; host lower-cased, .git dropped and empty segments folded only in `path` (the verdict\'s key)', { recG, recS });
    // ── the fakes ──
    const seen = { api: [], blob: [], stranger: [] };
    const SIGNED = '/github-production-release-asset/7770001/k?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=fx0sig&response-content-type=application%2Foctet-stream';
    const recQ = (q) => ({ url: q.url, auth: q.headers.authorization || null, accept: q.headers.accept || null });
    let pub = false; // round 2: a PUBLIC repository — its asset answers without a token (the API and the browser form alike)
    const api = http.createServer((q, r) => {
      seen.api.push(recQ(q));
      const authed = q.headers.authorization === `Bearer ${TOKEN}`, bin = q.headers.accept === 'application/octet-stream';
      if (q.url.startsWith('/acme/kernel-plugin/releases/download/')) { if (pub) { r.writeHead(302, { location: 'https://objects.githubusercontent.com' + SIGNED }); return r.end(); } r.writeHead(404); return r.end('Not Found'); } // a browser's route: a token is not a session
      if (!authed && !pub) { r.writeHead(404, { 'content-type': 'application/json' }); return r.end('{"message":"Not Found"}'); } // a private repository
      if (q.url === '/repos/acme/kernel-plugin/releases/assets/7') { r.writeHead(302, { location: '/repos/acme/kernel-plugin/releases/assets/5550001' }); return r.end(); } // a hop on the SAME host
      if (q.url === '/repos/acme/kernel-plugin/releases/assets/8' && bin) { r.writeHead(200, { 'content-length': ARCH.length, 'content-type': 'application/octet-stream' }); return r.end(ARCH); } // streamed directly
      if (q.url === '/repos/acme/kernel-plugin/releases/assets/9') return; // round 3: an asset that never answers (the stall ends it)
      if (q.url !== '/repos/acme/kernel-plugin/releases/assets/5550001') { r.writeHead(404); return r.end(); }
      if (!bin) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"id":5550001,"name":"k.tar.zst"}'); } // the metadata, not the bytes
      r.writeHead(302, { location: 'https://objects.githubusercontent.com' + SIGNED }); r.end();
    });
    const blob = http.createServer((q, r) => { seen.blob.push(recQ(q)); if (q.headers.authorization) { r.writeHead(400, { 'content-type': 'application/xml' }); return r.end('<Error><Code>InvalidArgument</Code><Message>Only one auth mechanism allowed</Message></Error>'); } if (q.url !== SIGNED) { r.writeHead(403); return r.end(); } r.writeHead(200, { 'content-length': ARCH.length, 'content-type': 'application/octet-stream' }); r.end(ARCH); });
    const stranger = http.createServer((q, r) => { seen.stranger.push(recQ(q)); if (q.url !== '/k.tar.zst') { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-length': ARCH.length }); r.end(ARCH); });
    for (const sv of [api, blob, stranger]) await new Promise((res) => sv.listen(0, '127.0.0.1', res));
    process.on('exit', () => { for (const sv of [api, blob, stranger]) { try { sv.close(); } catch { /* gone */ } } });
    const at = (sv) => `http://127.0.0.1:${sv.address().port}`;
    const resolveC = (u) => u.replace(/^https:\/\/(?:api\.)?github\.com(?=[/?:]|$)/, at(api)).replace(/^https:\/\/objects\.githubusercontent\.com(?=[/?:]|$)/, at(blob)).replace(/^https:\/\/mirror\.stranger\.test(?=[/?:]|$)/, at(stranger));
    // ── the Plugin Git row (a store), the plugin's install record (a loader), one engine-distribution per leg ──
    let row = { host: 'github.com', token: TOKEN }; // null = none set; 'locked' = the vault locked; 'throws' / 'unreadable' = the store cannot be read
    const reads = [];
    const store = { resolveIntegration: (id) => { reads.push(id); if (id !== 'plugin-git') throw new Error('unknown integration'); if (row === 'locked') return { source: 'none', values: {}, whyCode: 'vault-locked', why: 'the vault is locked' };
      if (row === 'throws') throw new Error('the integrations store is being rewritten');
      if (row === 'unreadable') return { source: 'none', values: {}, whyCode: 'store-unreadable', why: 'integrations.json exists but cannot be read (EIO) — every write is refused until it can be read' }; return row ? { source: 'user', values: { ...row }, whyCode: null, why: null } : { source: 'none', values: {}, whyCode: 'no-values', why: 'no key of your own and no cluster default' }; } };
    const PIN = 'e21f1064e3e38511b11e45c4cab6d60b48fbcce0';
    let inst = { source: 'git', value: OWN, ref: PIN, sha: PIN };
    const loaderC = { list: () => LDR.list(), installRecord: (id) => (id === EID && inst ? { ...inst } : null), install: async () => { throw new Error('the fleet\'s plugin is already installed — never asked'); } };
    const logs = [], todosC = [];
    const logC = { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)) };
    const edC = (name, url, opts = {}, mod = EDM) => {
      const dd = path.join(ROOT, name); fs.rmSync(dd, { recursive: true, force: true }); fs.mkdirSync(path.join(dd, 'plugins', EID), { recursive: true });
      fs.writeFileSync(path.join(dd, 'plugins', EID, 'kernel.json'), JSON.stringify(kjson({}, { url, sha256: sha(ARCH), bytes: ARCH.length })));
      return mod.create({ dataDir: dd, engines: ENGR, loader: loaderC, resolveUrl: resolveC, integrations: () => store, log: logC, userTodos: { add: (k, item) => { todosC.push(item); return 'ut-c' + todosC.length; } }, ...opts });
    };
    const reset = () => { for (const k of Object.keys(seen)) seen[k].length = 0; reads.length = 0; };
    const recOfC = (name) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, name, 'browser-engines.json'), 'utf8')).engines[EID] || {}; } catch { return {}; } };
    const receiptNow = () => { try { return JSON.parse(fs.readFileSync(path.join(kdir, 'install-receipt.json'), 'utf8')); } catch { return {}; } };
    const said = (e) => (e ? `${e.code}: ${e.message}` : 'landed');
    // R2 (a) THE ASSET of a PRIVATE repository: the first hop Accept + Authorization: Bearer → 302 → the signed file host WITHOUT it
    reset(); const t0a = Date.now();
    const EDa = edC('data-kac-a', ASSET);
    const ea = await thrK(EDa.installKernel(EID, { wait: true }));
    const rca = receiptNow(), reca = recOfC('data-kac-a');
    console.log(`  … (a) the asset download: ${said(ea)}`);
    ok(!ea && rca.sha256 === sha(ARCH) && rca.verifiedAt >= t0a && reca.kernel && reca.kernel.sha256 === sha(ARCH) && reca.kernel.credential === 'plugin-git' && EDa.kernelFact(EID).state === 'installed' && EDa.kernelFact(EID).credential === 'plugin-git' && !leftovers().length,
      'R2 (a): a kernel.json naming the API form of the plugin\'s OWN private repository ⇒ the archive LANDS (sha256 verified, the receipt written) — the engine record says it came by the Plugin Git credential (credential: plugin-git)', said(ea));
    ok(seen.api.length === 1 && seen.api[0].auth === `Bearer ${TOKEN}` && seen.api[0].accept === 'application/octet-stream' && reads.length === 1 && reads[0] === 'plugin-git',
      'R2 (a): the FIRST hop (api.github.com) carries Accept: application/octet-stream + Authorization: Bearer <the row\'s token> — the row read ONCE through the integration store (resolveIntegration(\'plugin-git\'))', { api: seen.api.map((x) => ({ ...x, auth: x.auth ? (x.auth === `Bearer ${TOKEN}` ? 'Bearer <token>' : 'OTHER') : null })), reads });
    ok(seen.blob.length === 1 && seen.blob[0].auth === null && seen.blob[0].accept === 'application/octet-stream' && seen.blob[0].url === SIGNED,
      'R2 (c): the 302 to the release\'s file host (ANOTHER host, a signed address) carries NO Authorization — Accept kept; the fake file host answers 400 the moment one arrives', seen.blob.map((x) => ({ url: x.url.slice(0, 40), auth: !!x.auth, accept: x.accept })));
    // a hop on the SAME host keeps it; the API streaming the bytes itself (200) lands too
    reset();
    const ea2 = await thrK(edC('data-kac-a2', ASSET.replace(/5550001$/, '7')).installKernel(EID, { wait: true }));
    const sameHop = seen.api.map((x) => x.auth === `Bearer ${TOKEN}`), blob2 = seen.blob.map((x) => !!x.auth);
    reset();
    const ea3 = await thrK(edC('data-kac-a3', ASSET.replace(/5550001$/, '8')).installKernel(EID, { wait: true }));
    ok(!ea2 && sameHop.length === 2 && sameHop.every(Boolean) && blob2.length === 1 && !blob2[0] && !ea3 && seen.api.length === 1 && seen.blob.length === 0,
      'R2: a redirect on the SAME host (api.github.com → api.github.com) keeps Authorization, the next one to the file host drops it; an API that streams the bytes itself (200, GitHub\'s other answer) lands too', { e2: said(ea2), sameHop, blob2, e3: said(ea3) });
    // R2 (b) A KERNEL URL ON ANOTHER HOST with the same row + the same git install: the stranger NEVER sees the credential
    reset();
    const eb = await thrK(edC('data-kac-b', STRANGER).installKernel(EID, { wait: true }));
    ok(!eb && seen.stranger.length === 1 && seen.stranger[0].auth === null && reads.length === 0 && recOfC('data-kac-b').kernel && recOfC('data-kac-b').kernel.credential === null,
      'R2 (b): a kernel.json naming ANOTHER host (same Plugin Git row, same git install) ⇒ the stranger records NO Authorization header — the row is not even read; the record says no credential', { e: said(eb), stranger: seen.stranger.map((x) => !!x.auth), reads });
    // ROUND 2 (minor 1) the browser form: the token is NOT sent there (GitHub serves it to a session, never a token), the row is not
    // even read; a private repository's 404 names the real cause — the plugin's kernel.json — never the credential
    reset();
    const EDf = edC('data-kac-f', FORM);
    const ef = await thrK(EDf.installKernel(EID, { wait: true }));
    ok(ef && ef.code === 'kernel_asset_browser_form' && /github\.com answered 404/.test(ef.message) && /the plugin's kernel\.json names the browser download form \(github\.com\/acme\/kernel-plugin\/releases\/download\/…\); a private repository's asset needs the API form \(api\.github\.com\/repos\/acme\/kernel-plugin\/releases\/assets\/<id>\) — tell the plugin's author/.test(ef.message) && !/Integrations/.test(ef.message)
      && seen.api.length === 1 && seen.api[0].auth === null && reads.length === 0 && EDf.kernelFact(EID).code === 'kernel_asset_browser_form' && EDf.kernelFact(EID).credential === null,
      'round 2 (minor 1): the browser form of the plugin\'s own PRIVATE repository ⇒ asked WITHOUT the token (the row not even read), its 404 refused kernel_asset_browser_form «the plugin\'s kernel.json names the browser download form; a private repository\'s asset needs the API form (api.github.com/repos/acme/kernel-plugin/releases/assets/<id>) — tell the plugin\'s author» — never sent to Integrations', { e: ef && `${ef.code}: ${ef.message}`, auth: seen.api.map((x) => !!x.auth), reads });
    pub = true; reset();
    const efPub = await thrK(edC('data-kac-fp', FORM).installKernel(EID, { wait: true }));
    ok(!efPub && seen.api.length === 1 && seen.api[0].auth === null && seen.blob.length === 1 && seen.blob[0].auth === null,
      'round 2: the browser form of a PUBLIC repository still lands anonymously (the base\'s road)', { e: said(efPub) });
    pub = false;
    // a deploy key only (a person / a first use): round 2 — the credential is OPTIONAL: the anonymous try goes, a private
    // repository's 404 is then refused kernel_credential_unusable by name (a public one would have answered)
    row = { host: 'github.com', deployKey: KEYTEXT }; reset();
    const EDk = edC('data-kac-k', ASSET);
    const ek = await thrK(EDk.installKernel(EID, { wait: true }));
    const ek2 = await thrK(edC('data-kac-k2', ASSET).installKernel(EID, { wait: true, by: 'first-use' }));
    ok(ek && ek.code === 'kernel_credential_unusable' && /asked without a credential: the Plugin Git credential is a deploy key; a release asset needs a token \(Integrations → Plugins → Plugin Git repository\)/.test(ek.message) && ek2 && ek2.code === 'kernel_credential_unusable' && seen.api.length === 2 && seen.api.every((x) => x.auth === null) && seen.blob.length + seen.stranger.length === 0 && EDk.kernelFact(EID).code === 'kernel_credential_unusable',
      'R2 + round 2: a deploy-key-only Plugin Git row cannot download over https ⇒ ONE anonymous try (no Authorization), its 404 refused kernel_credential_unusable BY NAME (a person\'s download and a first use); the record names the code', { e: ek && ek.message, hits: seen.api.map((x) => !!x.auth) });
    // ROUND 2 (minor 2) THE VAULT LOCKED: the credential is OPTIONAL — a private asset's anonymous 404 ⇒ vault_locked by name
    row = 'locked'; reset();
    const el = await thrK(edC('data-kac-l', ASSET).installKernel(EID, { wait: true }));
    const elAsked = seen.api.map((x) => x.auth);
    ok(el && el.code === 'vault_locked' && elAsked.every((x) => x === null),
      'round 2 (minor 2): the vault locked + a PRIVATE asset ⇒ refused vault_locked BY NAME (on b43799e5 before any byte; now after the anonymous try\'s 404) — no Authorization ever', { e: el && `${el.code}: ${el.message}`, asked: elAsked });
    ok(el && /asked without a credential: the Plugin Git credential is sealed in the locked vault — unlock it and try again \(Unlock… at the top of the page; For you names what is waiting on it\)/.test(el.message) && elAsked.length === 1,
      'round 2 (minor 2): its words — «the Plugin Git credential is sealed in the locked vault — unlock it and try again (Unlock… …)», after ONE anonymous request', el && el.message);
    pub = true; reset();
    const EDlp = edC('data-kac-lp', ASSET);
    const elp = await thrK(EDlp.installKernel(EID, { wait: true }));
    const elpAsked = seen.api.map((x) => x.auth), elpReads = reads.length;
    reset();
    const elp2 = await thrK(edC('data-kac-lp2', ASSET).installKernel(EID, { wait: true, by: 'first-use' }));
    reset();
    const elp3 = await thrK(edC('data-kac-lp3', ASSET).installKernel(EID, { wait: true, by: 'fleet' }));
    pub = false;
    ok(!elp && !elp2 && !elp3 && elpAsked.length === 1 && elpAsked[0] === null && elpReads === 1 && EDlp.kernelFact(EID).state === 'installed' && EDlp.kernelFact(EID).credential === null && fs.existsSync(KP),
      'round 2 (minor 2): the vault locked + a PUBLIC asset (the fake answers anonymously) ⇒ DOWNLOADED, anonymously — a person\'s download, a first use and the fleet alike (on b43799e5 refused vault_locked before any byte)', { user: said(elp), firstUse: said(elp2), fleet: said(elp3), asked: elpAsked });
    reset();
    const elOther = await thrK(edC('data-kac-l2', STRANGER).installKernel(EID, { wait: true }));
    ok(!elOther && seen.stranger.length === 1 && reads.length === 0,
      'R2: a kernel on another host is not stopped by the locked vault — the row is never read for it', { other: said(elOther) });
    // ROUND 2 (minor 3) THE STORE UNREADABLE (it throws / answers store-unreadable): its own words, never «no credential is set»
    row = 'throws'; reset();
    const eu = await thrK(edC('data-kac-u', ASSET).installKernel(EID, { wait: true }));
    const euAsked = seen.api.map((x) => x.auth);
    row = 'unreadable'; reset();
    const eu2 = await thrK(edC('data-kac-u2', ASSET).installKernel(EID, { wait: true }));
    ok(eu && eu.code === 'build_fetch_failed' && /asked without a credential: the Integrations store could not be read \(the integrations store is being rewritten\)/.test(eu.message) && !/no Plugin Git credential is set/.test(eu.message)
      && eu2 && /the Integrations store could not be read \(integrations\.json exists but cannot be read \(EIO\)/.test(eu2.message) && !/no Plugin Git credential is set/.test(eu2.message) && euAsked.length === 1 && euAsked[0] === null,
      'round 2 (minor 3): an integration store that THROWS / answers store-unreadable ⇒ the anonymous try\'s 404 says «the Integrations store could not be read (<why>)», never «no Plugin Git credential is set»', { throws: eu && eu.message, unreadable: eu2 && eu2.message });
    // no row / a row for another git host / not a git install ⇒ anonymous, and the 404 says why
    row = null; reset();
    const en = await thrK(edC('data-kac-n', ASSET).installKernel(EID, { wait: true }));
    const n1 = seen.api.map((x) => x.auth);
    row = { host: 'gitlab.example.test', token: TOKEN }; reset();
    const eo = await thrK(edC('data-kac-o', ASSET).installKernel(EID, { wait: true }));
    const o1 = seen.api.map((x) => x.auth);
    row = { host: 'github.com', token: TOKEN }; inst = { source: 'path', value: '/srv/plugins/kernel-plugin' }; reset();
    const ep = await thrK(edC('data-kac-p', ASSET).installKernel(EID, { wait: true }));
    const p1 = seen.api.map((x) => x.auth), pReads = reads.length;
    inst = { source: 'git', value: OWN, ref: PIN, sha: PIN };
    ok(en && en.code === 'build_fetch_failed' && /answered 404/.test(en.message) && /no Plugin Git credential is set/.test(en.message) && n1.length === 1 && n1[0] === null
      && eo && /the Plugin Git credential is for another git host/.test(eo.message) && o1.length === 1 && o1[0] === null && ep && ep.code === 'build_fetch_failed' && p1.length === 1 && p1[0] === null && pReads === 0,
      'no row ⇒ anonymous (the 404 says «a release asset of its plugin\'s own repository … no Plugin Git credential is set»); a row for ANOTHER git host ⇒ its token never goes; a plugin not installed from git ⇒ anonymous, the row never read', { n: en && en.message, o: eo && eo.message, p: ep && ep.message });
    // R3 THE FLEET'S PRESINSTALL (customBrowser.preinstall → bootFleet): the same road, 'auto' — a deploy key ⇒ anonymous
    const fleetC = { browserEngine: { plugin: EID, source: { git: OWN, ref: PIN }, preinstall: true } };
    const keptC = path.join(ROOT, 'kernel-kept-kac'); fs.rmSync(keptC, { recursive: true, force: true }); fs.renameSync(kdir, keptC);
    row = { host: 'github.com', token: TOKEN }; reset();
    const bf = await edC('data-kac-fleet', ASSET, { fleetFacts: () => fleetC }).bootFleet();
    const bfAuth = seen.api.map((x) => x.auth === `Bearer ${TOKEN}`), bfBlob = seen.blob.map((x) => !!x.auth);
    ok(bf.ok && bf.outcome === 'same' && bf.kernel && bf.kernel.ok && bf.kernel.sha256 === sha(ARCH) && fs.existsSync(KP) && bfAuth.length === 1 && bfAuth[0] && bfBlob.length === 1 && !bfBlob[0] && recOfC('data-kac-fleet').kernel.by === 'fleet' && recOfC('data-kac-fleet').kernel.credential === 'plugin-git',
      'R3: the boot job\'s fleet preinstall rides the same road — the kernel absent, the fleet\'s plugin already the recorded git source ⇒ downloaded with the Plugin Git credential on the first hop only', { kernel: bf.kernel && (bf.kernel.code || 'ok'), bfAuth, bfBlob });
    fs.rmSync(kdir, { recursive: true, force: true }); todosC.length = 0;
    row = { host: 'github.com', deployKey: KEYTEXT }; reset();
    const bk = await edC('data-kac-fleet2', ASSET, { fleetFacts: () => fleetC }).bootFleet();
    ok(bk.ok && bk.kernel && bk.kernel.ok === false && bk.kernel.code === 'kernel_credential_unusable' && /asked without a credential: the Plugin Git credential is a deploy key; a release asset needs a token/.test(bk.kernel.error) && seen.api.length === 1 && seen.api[0].auth === null && todosC.length === 1 && /could not be downloaded/.test(todosC[0].text),
      'R3: \'auto\' for the fleet — a deploy-key row does not fit an https asset ⇒ an ANONYMOUS try (never refused before it: a public repository would answer), its 404 refused kernel_credential_unusable with the reason (round 2: the same road as a person\'s); ONE For-you notice', { k: bk.kernel && bk.kernel.error, todos: todosC.length });
    fs.rmSync(kdir, { recursive: true, force: true }); fs.renameSync(keptC, kdir); row = { host: 'github.com', token: TOKEN };
    // ROUND 3 (minor 2b) A FIRST USE'S WORDS: the launch that finds the kernel absent says «downloading» only when the archive
    // answered — a refusal before any byte (the platform) or at the first answer (a private asset asked without a credential)
    // is said BY NAME; no answer in time says it asked. Each leg: the profile made with the kernel in place, then it is absent.
    const keptU = path.join(ROOT, 'kernel-kept-kac3');
    const firstUse = async (name, url, { prep = null, opts = {} } = {}) => {
      const EDx = edC(name, url, opts); if (prep) prep(path.join(ROOT, name, 'plugins', EID, 'kernel.json'));
      const kx = mkKeeper(path.join(ROOT, 'data-eng-' + name), { engines: ENGR, engineDistribution: EDx, fleetFacts: () => null });
      const px = kx.createProfile({ label: 'First use ' + name, browser: { kind: 'plugin', id: EID } }, { engine: await kx.engineFactOf(EID) });
      fs.rmSync(keptU, { recursive: true, force: true }); fs.renameSync(kdir, keptU); reset();
      const e = await thrK(kx.start(px.id, { why: 'test' }));
      const t = Date.now(); while (!['installed', 'failed'].includes(EDx.kernelFact(EID).state) && Date.now() - t < 8000) await new Promise((r) => setTimeout(r, 25)); // the outcome RECORDED (a failure is noted after the run ends)
      const out = { e, msg: e ? String(e.message) : 'launched', asked: seen.api.map((x) => x.auth), fact: EDx.kernelFact(EID) };
      fs.rmSync(kdir, { recursive: true, force: true }); fs.renameSync(keptU, kdir);
      return out;
    };
    row = 'locked';
    const fuL = await firstUse('data-kac-fu-l', ASSET);
    row = { host: 'github.com', deployKey: KEYTEXT };
    const fuK = await firstUse('data-kac-fu-k', ASSET);
    row = 'locked'; pub = true;
    const fuP = await firstUse('data-kac-fu-p', ASSET);
    pub = false; row = { host: 'github.com', token: TOKEN };
    const fuX = await firstUse('data-kac-fu-x', ASSET, { prep: (f) => fs.writeFileSync(f, JSON.stringify(kjson({ platforms: { 'windows-x64': kjson({}, { url: ASSET, sha256: sha(ARCH), bytes: ARCH.length }).platforms['linux-x64'] } }))) });
    const fuS = await firstUse('data-kac-fu-s', ASSET.replace(/5550001$/, '9'), { opts: { answerMs: 50, stallMs: 250 } });
    const DLW = /VibeSpace is downloading it now/;
    ok(fuL.e && fuL.e.code === 'browser_engine_kernel_missing' && !DLW.test(fuL.msg) && /VibeSpace could not download it: api\.github\.com answered 404 .*the Plugin Git credential is sealed in the locked vault — unlock it and try again/.test(fuL.msg) && fuL.asked.length === 1 && fuL.asked[0] === null && fuL.fact.code === 'vault_locked',
      'round 3 (minor 2b): the vault locked + a PRIVATE asset, its FIRST USE ⇒ the launch says the download\'s NAMED refusal («VibeSpace could not download it: … sealed in the locked vault — unlock it and try again») after ONE anonymous request — never «downloading it now» (9d02b48f promised a download that failed a moment later)', fuL.msg);
    ok(fuK.e && !DLW.test(fuK.msg) && /VibeSpace could not download it: .*the Plugin Git credential is a deploy key; a release asset needs a token/.test(fuK.msg) && fuK.fact.code === 'kernel_credential_unusable',
      'round 3 (minor 2b): a deploy-key-only row + a private asset, its first use ⇒ the named refusal (a release asset needs a token), never «downloading»', fuK.msg);
    ok(fuP.e && DLW.test(fuP.msg) && fuP.fact.state === 'installed' && fuP.asked.length === 1 && fuP.asked[0] === null,
      'round 3 (minor 2b) control: the vault locked + a PUBLIC asset — the archive answers ⇒ «VibeSpace is downloading it now», and it lands (anonymously)', { msg: fuP.msg, st: fuP.fact.state });
    ok(fuX.e && !DLW.test(fuX.msg) && /VibeSpace could not download it: .*offers no kernel for linux-x64 computers \(it has windows-x64\) — nothing was downloaded/.test(fuX.msg) && fuX.asked.length === 0,
      'round 3 (minor 2b): a kernel.json with no kernel for this machine, its first use ⇒ the launch names it (build_platform_unsupported: «offers no kernel for linux-x64 computers (it has windows-x64)»), no request', fuX.msg);
    ok(fuS.e && !DLW.test(fuS.msg) && /VibeSpace has asked api\.github\.com for it and has no answer yet; start the browser again in a moment/.test(fuS.msg) && fuS.fact.state === 'failed',
      'round 3 (minor 2b): an asset that has not answered within the bound ⇒ «VibeSpace has asked api.github.com for it and has no answer yet» — not «downloading»; the stall then ends it by name', { msg: fuS.msg, st: fuS.fact.state, code: fuS.fact.code });
    // R3 THE WORDS: the server answers STRUCTURE (kernel.credential), the card words it (zh / ja / en)
    const keC = mkKeeper(path.join(ROOT, 'data-eng-kac'), { engines: ENGR, engineDistribution: EDa, fleetFacts: () => null });
    const roC = (await keC.engineRowsView()).find((e) => e.id === EID);
    const ROADW = "from the plugin repository's Release (with the Plugin Git credential)";
    const nDl = BMm.engineNote({ id: EID, installed: false, executable: false, kernel: { state: 'downloading', bytes: 5, total: 10, credential: 'plugin-git' } }, tW);
    const nFail = BMm.engineNote({ id: EID, installed: false, kernel: { state: 'failed', code: 'build_fetch_failed', credential: 'plugin-git' } }, tW);
    const nPlain = BMm.engineNote({ id: EID, installed: false, executable: false, kernel: { state: 'downloading', bytes: 5, total: 10, credential: null } }, tW);
    const nKey = BMm.engineNote({ id: EID, installed: false, kernel: { state: 'failed', code: 'kernel_credential_unusable', credential: 'plugin-git' } }, tW);
    const nLock = BMm.engineNote({ id: EID, installed: false, kernel: { state: 'failed', code: 'vault_locked', credential: 'plugin-git' } }, tW);
    const FORMW = "the plugin's kernel.json names the browser download form; a private repository's asset needs the API form (api.github.com/repos/<owner>/<repo>/releases/assets/<id>) — tell the plugin's author";
    const nForm = BMm.engineNote({ id: EID, installed: false, kernel: { state: 'failed', code: 'kernel_asset_browser_form', credential: null } }, tW);
    const ZH = (await import('../src/lib/i18n-zh.js')).default, JA = (await import('../src/lib/i18n-ja.js')).default;
    ok(roC && roC.kernel && roC.kernel.credential === 'plugin-git' && nDl.endsWith('downloading its kernel… 50% · ' + ROADW) && nFail.endsWith(' · ' + ROADW) && !nPlain.includes('Release') && /a release asset needs an access token/.test(nKey) && /The vault is locked — unlock it first \(Unlock…/.test(nLock) && !nKey.includes(ROADW)
      && ZH[ROADW] === '从插件仓库的 Release 下载（用插件 Git 凭据）' && /Release/.test(JA[ROADW] || '') && ZH['The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)'] && JA['the Plugin Git credential cannot download it — a release asset needs an access token (https)'],
      'R3: GET /api/browser/engines\' row carries kernel.credential (STRUCTURE); the card says «… · 从插件仓库的 Release 下载（用插件 Git 凭据）» while downloading / after a failure, nothing for another road, and the two refusals by their code (zh / ja / en through t())', { row: roC && roC.kernel, nDl, nKey, nLock });
    ok(nForm.endsWith(': ' + FORMW) && /^插件的 kernel\.json 写的是浏览器下载形式；私有仓库的附件要用 API 形式（api\.github\.com\/repos\/<owner>\/<repo>\/releases\/assets\/<id>）— 请告诉插件作者$/.test(ZH[FORMW] || '') && /kernel\.json/.test(JA[FORMW] || '') && /api\.github\.com\/repos\/<owner>\/<repo>\/releases\/assets\/<id>/.test(JA[FORMW] || ''),
      'round 2 (minor 1): the card words kernel_asset_browser_form «… could not be downloaded: the plugin\'s kernel.json names the browser download form; … needs the API form (api.github.com/repos/<owner>/<repo>/releases/assets/<id>) — tell the plugin\'s author» (zh / ja / en through t())', { nForm, zh: ZH[FORMW], ja: JA[FORMW] });
    // THE CREDENTIAL'S CENSUS: the token in no URL asked, no log line, no error, no engine record, no fact, no For-you item
    const allUrls = [...seen.api, ...seen.blob, ...seen.stranger].map((x) => x.url).join('\n');
    const recTexts = fs.readdirSync(ROOT).filter((n) => /^data-kac-/.test(n)).map((n) => { try { return fs.readFileSync(path.join(ROOT, n, 'browser-engines.json'), 'utf8'); } catch { return ''; } }).join('\n');
    const errs = [ea, ea2, ea3, eb, ef, efPub, ek, ek2, el, elp, elp2, elp3, elOther, eu, eu2, en, eo, ep, fuL.e, fuK.e, fuP.e, fuX.e, fuS.e].filter(Boolean).map((e) => e.message).join('\n') + JSON.stringify([bf, bk]);
    const leaksC = { url: allUrls.includes(TOKEN), log: logs.some((l) => l.includes(TOKEN)), error: errs.includes(TOKEN), record: recTexts.includes(TOKEN), fact: JSON.stringify([EDa.kernelFact(EID), EDk.kernelFact(EID), roC]).includes(TOKEN), todo: JSON.stringify(todosC).includes(TOKEN), env: Object.values(process.env).some((v) => String(v).includes(TOKEN)) };
    ok(!Object.values(leaksC).some(Boolean) && recTexts.length > 200 && logs.some((l) => /with the Plugin Git credential/.test(l)),
      `the credential's census: the token is in no URL asked, no log line (the journal says only «with the Plugin Git credential»), no error, no engine record, no card fact, no For-you item, no env (${Object.entries(leaksC).filter(([, v]) => v).map(([k]) => k).join(', ') || 'clean'})`, leaksC);
    // ── THE RED CONTROLS: patched copies of engine-distribution.js, each turning a leg above red ──
    const EDC = read('src/server/engine-distribution.js');
    const ctrl = async (tag, edits, url) => {
      let t = EDC; for (const [from, to] of edits) { if (!t.includes(from)) return { anchor: from }; t = t.replace(from, to); }
      reset(); const e = await thrK(edC('data-kac-ctl-' + tag, url, {}, M8.load('src/server/engine-distribution.js', t, 'kac-' + tag)).installKernel(EID, { wait: true }));
      return { e, api: seen.api.map((x) => !!x.auth), blob: seen.blob.map((x) => !!x.auth), stranger: seen.stranger.map((x) => !!x.auth) };
    };
    const c1 = await ctrl('none', [["      st.credential = cr.road.use ? 'plugin-git' : null;", "      cr = { road: { use: false, why: 'control', asset: false }, token: null }; st.credential = null;"]], ASSET);
    ok(c1.e && c1.e.code === 'build_fetch_failed' && /answered 404/.test(c1.e.message) && c1.api.length === 1 && !c1.api[0], 'control (a): a copy that sends no credential (today\'s downloader) fails the private asset — build_fetch_failed «api.github.com answered 404» — RED against R2 (a)', c1.anchor || (c1.e && c1.e.message));
    const C2_AT = "    let inst = null; try { const l = L(); inst = l && typeof l.installRecord === 'function' ? l.installRecord(sid) : null; } catch { inst = null; }\n    const pre = EK.kernelCredentialVerdict(";
    const c2 = await ctrl('anyhost', [[C2_AT, "    return { road: { use: true, host: EK.httpsUrlOf(url).host, why: 'control', asset: true, repository: { host: 'x', path: 'y' } }, token: I().resolveIntegration('plugin-git').values.token };\n" + C2_AT]], STRANGER);
    ok(!c2.anchor && c2.stranger.length === 1 && c2.stranger[0] === true, 'control (b): a copy that sends the credential to whatever host kernel.json names hands the STRANGER an Authorization header — RED against R2 (b)', c2.anchor || c2);
    const c3 = await ctrl('keep', [["      if (carry && x.host.replace(/:443$/, '') !== bound) carry = false;", '      ;']], ASSET);
    ok(c3.e && c3.e.code === 'build_fetch_failed' && /objects\.githubusercontent\.com answered 400/.test(c3.e.message) && c3.blob.length === 1 && c3.blob[0] === true, 'control (c): a copy that keeps Authorization on the redirect to the file host — the signed address answers 400 (build_fetch_failed) — RED against R2 (c)', c3.anchor || (c3.e && c3.e.message));
    ok(!fs.existsSync(KP) ? false : !leftovers().length, '(the kernel is in its place after the controls; nothing left beside it)', leftovers());
  }
  setMode(null);
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
