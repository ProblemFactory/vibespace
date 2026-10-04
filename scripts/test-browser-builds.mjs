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
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
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
    info: async () => ({ ok: true, active: true, pid: process.pid, socketDir: '/tmp', version: '0.38.1' }),
    cdpUrl: async (ns, o) => { seen.push({ op: 'cdp-url', env: { ...(o.extraEnv || {}) } }); return { ok: true, url: 'ws://127.0.0.1:9333/devtools/browser/x' }; },
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
  const e1 = await thr(() => old.browserServe('builds', {}));
  const e2 = await thr(() => old.browserServe('start', { profileId: PID, browser: { kind: 'build', version: '148.0.1.1' } }));
  const okStart = await old.browserServe('start', { profileId: PID });
  ok(e1 && e1.code === 'builds_unsupported' && e2 && e2.code === 'builds_unsupported' && old.asked === 1 && okStart.ok, 'an agent WITHOUT `browser-builds`: the list and a start with a build are refused builds_unsupported with ZERO requests; a default start still goes', { asked: old.asked });
  const cur = mk(['browser-serve', 'browser-builds']);
  const ok1 = await cur.browserServe('builds', {});
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
    && W.cardBuildLine({ provider: 'cloak' }, t) === null && W.cardBuildLine({ choice: { kind: 'build', version: '151.0.7922.34' }, missing: { what: '151.0.7922.34' } }, t).warn === true,
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
  ok(/cardBuildLine\(\{ provider: r\.provider, choice: r\.browser, running: runningBuildOf\(r\.id\), missing: r\.buildMissing, live: !!r\.live \}, t\)/.test(tv) && /build: \(r\) => openBuildDialog\(app, r\.id,/.test(tv) && /id: 'build', label: t\('Change build…'\)/.test(read('src/lib/browser-panel-model.js')) /* design 015: the ⋯ menu's act */ && /runningBuildOf\(r\.id\)\]\); \};/.test(tv),
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
  ok(/if \(r\.kind === 'download'\) \{ list\.appendChild\(downloadRow\(r, \(\) => openPicker\(\)\)\); continue; \}/.test(dg) && /openBuildDialog\(app, id, \{ label, onDone, pick: v \}\)/.test(dg) && /if \(r\.kind === 'download'\) \{ order\.push\(row \|\| downloadRow\(r, openBuildPicker\)\); continue; \}/.test(np) && /st\.buildDownload = r && !r\.error \? r\.download \|\| null : null;/.test(np),
    'wiring: Change build… opens the picker in the dialog and comes back with the new build picked; New profile…\'s build section opens it in place');
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
  const blind = ks.replace("    const drivenNow = () => SW.holdOf(reg.leases.filter((l) => l.profileId === p.id), inputsView({ withHumans: false }));", "    const drivenNow = () => ({ hold: null, driver: null });");
  ok(blind !== ks, 'control (d): the patch (a Change build… blind to a takeover) applies');
  const Kd = MUT.load('src/server/browser-keeper.js', blind, 'blind');
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
  const noBrowseGate = ks.replace("    const refuseBrowsing = () => { if (humans.get(p.id) || browsing.has(p.id)) throw", "    const refuseBrowsing = () => { if (humans.get(p.id)) throw");
  ok(noBrowseGate !== ks, 'control (i): the patch (Change build… blind to a Browse yourself in flight) applies');
  const Ki = MUT.load('src/server/browser-keeper.js', noBrowseGate, 'no-browse-gate');
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
  const early = ks.replace("      const pre = leases.map((l) => interruptForRelaunch(p, l, { from, to })); // what each holder had in flight is cut NOW, before the stop\n", "      const pre = leases.map((l) => interruptForRelaunch(p, l, { from, to })); told = tellRelaunch(pre, 'changed');\n")
    .replace("        told = tellRelaunch(pre, restored ? 'restored' : 'down'); // verify r1 (F9): said as it happened\n", '')
    .replace("      told = tellRelaunch(pre, 'changed'); // verify r1 (F9): said once the new build runs\n", '');
  ok(early !== ks && early.split("told = tellRelaunch(pre,").length === 2, 'control (g): the patch (holders told "changed" before the stop, whatever the outcome) applies');
  const eg = await relaunchOutcomeLeg(MUT.load('src/server/browser-keeper.js', early, 'tell-early'));
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

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
