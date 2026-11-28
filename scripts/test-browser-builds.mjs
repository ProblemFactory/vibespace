#!/usr/bin/env node
// LANE BROWSER-ADMIN 2a — WHICH CHROME BUILD A PROFILE RUNS (the owner, 2026-09-30: "不能pin指定版本"). Fast, in-process:
// a scratch HOME with a fake `~/.agent-browser/browsers/` (the measured layout: `chrome-<version>/chrome`), the shared fake
// agent-browser (every call's launch view logged), a loopback /json/version, port 0, no real binary, no browser.
//
//   ① PURE (src/browser-builds.js): the build-dir names, the machine's listing (usable / no chrome / not executable /
//      junk ignored / newest first / a missing root vs an unreadable one), the choice shapes, THE verdict's order
//      (well-formed · the user's · chromium · listed · runnable · the version ladder), the running build off /json/version;
//   ③ the `browser-serve` op (the SHARED table a paired machine's daemon runs): `builds` lists THAT machine's builds, a
//      start with a build rides its executable on the launch AND on every later op (cdp-url, stop) through the machine's
//      own view file, a missing build is refused there; the capability gate: an agent without `browser-builds` is never
//      asked for a list nor handed a start with a build (refused `builds_unsupported`, zero requests);
//   ④ the client words (src/lib/browser-build-model.js) in en / zh / ja + wiring pins;
//   ⑤ control (a): a verdict that lets an agent choose a build turns ①'s table red; ⑥ Download another build…'s PURE half;
//      verify r1; B-0bc7, the engine card's «Download kernel» door (the PURE step and its words).
//   THE KEEPER'S LEGS — ② the REAL keeper over the fake binary, ③b the agent's side, ⑤'s keeper controls (b) … (j), ⑦ lane
//      engine-plugin, ⑦b, ⑦e, ⑦f, ⑦g, ⑧ and ⑧c — run in the HEAVY TWIN scripts/test-browser-builds-keeper.mjs (B-7e49, 主开发
//      r2466: moved VERBATIM; a leg that starts a child is heavy, and profiled alone they held about 33 s of this file's 34–45 s).
//      §T pins that the twin holds them and that this file runs none of them.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch, deadPort, anchored } from './scratch.mjs';
const DEAD_CDP = await deadPort(); // the stub's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const thr = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const BB = require('../src/browser-builds.js');
const SW = require('../src/browser-switch.js');
const ROOT = scratch('badm');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home');
const BROWSERS = path.join(HOME, '.agent-browser', 'browsers');
const mkBuild = (v, { exec = true, chrome = true } = {}) => { const d = path.join(BROWSERS, 'chrome-' + v); fs.mkdirSync(d, { recursive: true }); if (chrome) fs.writeFileSync(path.join(d, 'chrome'), '#!/bin/sh\nexit 0\n', { mode: exec ? 0o755 : 0o644 }); return path.join(d, 'chrome'); };
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
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
  ok(gateOf(L.ok) && L.builds.map((b) => b.version).join(' ') === '151.0.7922.34 146.0.7680.153 139.0.1.1 120.0.1.1' && gateOf(L.builds[0].usable) && gateOf(L.builds[1].usable) && !L.builds[2].usable && L.builds[2].why === 'not-executable' && !L.builds[3].usable && L.builds[3].why === 'missing',
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
  ok(gateOf(BB.sameChoice(null, { kind: 'default' })) && !BB.sameChoice({ kind: 'build', version: '151.0.7922.34' }, { kind: 'build', version: '146.0.7680.153' }) && verdictOf(BB.sameChoice({ kind: 'path', path: '/a//b' }, { kind: 'path', path: '/a/b' })), 'sameChoice (Change build… to the same build is a no-op)');
  ok(JSON.stringify(SW.launchEnvFor('chromium', { executablePath: '/x/chrome' })) === JSON.stringify({ AGENT_BROWSER_EXECUTABLE_PATH: '/x/chrome' }) && JSON.stringify(SW.launchEnvFor('chromium', {})) === '{}',
    'the launch env of a pinned chromium build is the executable alone (agent-browser\'s own env name) — nothing for the default');
  const n = BB.missingNotice({ label: 'Work', choice: { kind: 'build', version: '151.0.7922.34' } });
  ok(gateOf(/Work/.test(n.text)) && gateOf(/151\.0\.7922\.34/.test(n.text)) && gateOf(/Change build…/.test(n.detail)) && verdictOf(/never switches it to another build/.test(n.detail)), 'the For-you notice names the profile, the build, and the way out (Change build…) — and says nothing falls back by itself');
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
  ok(gateOf(L.ok) && gateOf(L.listing.ok) && L.listing.builds.length === 1 && L.listing.builds[0].version === '148.0.1.1' && !('path' in L.listing.builds[0]), 'the `builds` op lists THAT machine\'s builds (plain JSON — no path crosses the wire; the machine resolves a build by version itself)', L);
  const PID = 'bp-0000c0de';
  const st = await S.runBrowserServeOp(bs, 'start', { profileId: PID, browser: { kind: 'build', version: '148.0.1.1' } });
  const exe = path.join(H3, '.agent-browser', 'browsers', 'chrome-148.0.1.1', 'chrome');
  ok(gateOf(st.ok) && seen.find((x) => x.op === 'launch').env.AGENT_BROWSER_EXECUTABLE_PATH === exe && seen.find((x) => x.op === 'cdp-url').env.AGENT_BROWSER_EXECUTABLE_PATH === exe, 'a start with a build: its executable on the launch AND on the start\'s own cdp-url', seen);
  seen.length = 0;
  await S.runBrowserServeOp(bs, 'cdp-url', { profileId: PID }); await S.runBrowserServeOp(bs, 'stop', { profileId: PID });
  ok(seen.length === 2 && gateOf(seen.every((x) => x.env.AGENT_BROWSER_EXECUTABLE_PATH === exe)) && verdictOf(fs.existsSync(S.buildFileOf(bs, B_ns(PID)))), '…and on EVERY later op of that profile (cdp-url, stop) through the machine\'s own view file', seen);
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
  ok(gateOf(e1) && e1.code === 'builds_unsupported' && gateOf(e2) && e2.code === 'builds_unsupported' && old.asked === 1 && verdictOf(okStart.ok), 'an agent WITHOUT `browser-builds`: the list and a start with a build are refused builds_unsupported with ZERO requests; a default start still goes', { asked: old.asked });
  const cur = mk(['browser-serve', 'browser-builds']);
  const ok1 = await cur.browserServe('builds', {}, { by: 'system:test' });
  ok(gateOf(ok1.ok) && cur.asked === 1, 'an agent WITH it is asked');
  const ad = read('src/agentd/agentd.js');
  ok(gateOf(/capabilities: \[[^\]]*'browser-serve', 'browser-builds'/.test(ad)) && verdictOf(/require\('\.\/\.\.\/browser-serve\.js'\)/.test(ad)), 'the daemon advertises `browser-builds` beside `browser-serve` and runs the SAME op table (the daemon bundles src/browser-serve.js → src/browser-builds.js)');
  const ac = read('src/server/browser-access.js');
  ok(verdictOf(/e\.code === 'builds_unsupported'( \|\| e\.code === 'remove_unsupported')?( \|\| e\.code === 'stop_facts_unsupported')?\) \? e\.code/.test(ac)), 'the access layer keeps the code by name (never folded into host_unavailable)'); // lane remote-profile-start: + remove_unsupported beside it; B-e799: + stop_facts_unsupported
}
function B_ns(pid) { return require('../src/browser-profiles.js').sessionNameFor(pid); }

// ═══ ④ the client words + wiring ═══════════════════════════════════════════════
console.log('— ④ the client words (en / zh / ja) + wiring');
{
  const W = await import('../src/lib/browser-build-model.js');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const mkT = (d) => (k, p) => { let s = (d && d[k]) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
  const t = mkT(null);
  ok(W.cardBuildLine({ choice: { kind: 'build', version: '151.0.7922.34' } }, t).text === 'Chrome 151.0.7922.34 (pinned)' && W.cardBuildLine({ choice: null }, t).text === "The automatic choice — usually the newest Chrome the browser driver installed"
    && W.cardBuildLine({ choice: { kind: 'path', path: '/opt/c/chrome' } }, t).text === 'The chrome at /opt/c/chrome (pinned)' && W.cardBuildLine({ choice: null, live: true, running: '149.0.1.1' }, t).text === "The automatic choice — usually the newest Chrome the browser driver installed · running Chrome 149.0.1.1"
    && W.cardBuildLine({ buildChoice: false }, t) === null && W.cardBuildLine({ choice: { kind: 'build', version: '151.0.7922.34' }, missing: { what: '151.0.7922.34' } }, t).warn === true,
  'the profile card: "Chrome 151.0.7922.34 (pinned)" / the CLI\'s default build / a path; the build its browser RUNS while live; a missing one amber; nothing for CloakBrowser');
  const rows = W.buildRows({ ok: true, builds: [{ version: '152.0.1.2', usable: true }, { version: '146.0.7680.153', usable: true }, { version: '139.0.1.1', usable: false, why: 'not-executable' }] }, { choice: { kind: 'build', version: '151.0.7922.34' }, lastChromiumMajor: 151, local: true, t });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  ok(rows[0].key === 'default' && gateOf(byKey['v:152.0.1.2'].pickable) && !byKey['v:146.0.7680.153'].pickable && gateOf(/Older/.test(byKey['v:146.0.7680.153'].note)) && !byKey['v:139.0.1.1'].pickable && gateOf(byKey['v:151.0.7922.34'].current) && !byKey['v:151.0.7922.34'].pickable && verdictOf(byKey.path),
    'Change build… rows: the default first; every build a row; an older one / one that cannot run greyed WITH why; a chosen build gone from the list still shown (what it was set to); a path row on this computer', rows.map((r) => [r.key, r.pickable, r.note]));
  const unsup = W.buildRows({ ok: false, code: 'builds_unsupported' }, { machine: 'mac', local: false, t });
  ok(unsup.length === 2 && gateOf(unsup[0].pickable) && gateOf(/can't list Chrome builds/.test(unsup[1].label)) && !unsup.some((r) => r.key === 'path'), 'a machine whose agent cannot list builds: the default stays, one sentence says why (no path row off this computer)');
  // lane mirror-green-ui (2.369.205): a list ASKED and not yet answered is said as waiting — never "could not be read"
  const pend = W.buildRows({ pending: true }, { t });
  ok(pend[0].key === 'default' && gateOf(pend.some((r) => r.kind === 'note' && /^Reading the list of Chrome builds/.test(r.label))) && !pend.some((r) => /could not be read/.test(r.label || '')) && !pend.some((r) => r.kind === 'build') && verdictOf(pend.some((r) => r.key === 'path')),
    'a list asked and not yet answered: the default, ONE "Reading the list…" note (never "could not be read"), no build rows yet', pend.map((r) => [r.key, r.label]));
  ok(JSON.stringify(W.choiceOfRow(byKey['v:152.0.1.2'])) === JSON.stringify({ kind: 'build', version: '152.0.1.2' }) && W.choiceOfRow(byKey.path, 'rel') === null && W.choiceOfRow(byKey.path, ' /opt/c/chrome ').path === '/opt/c/chrome' && W.choiceOfRow(byKey['v:146.0.7680.153']) === null, 'a picked row → the choice sent (an unpickable row / a relative path send nothing)');
  ok(gateOf(/2 conversation\(s\)/.test(W.changeSentences({ live: true, holders: 2 }, t)[0].text)) && verdictOf(/next start/.test(W.changeSentences({ live: false }, t)[0].text)), 'the sentence above the button: a running browser restarts and N conversations are told; a stopped one changes at its next start');
  ok(gateOf(/agent-browser install/.test(W.installHint({ command: 'agent-browser install', local: false }, t))) && W.installHint({ command: '' }, t) === null, 'how to add a build: the command, where to run it (installing is the user\'s act, held for a later lane)');
  const CODES = ['browser_build_missing', 'browser_build_not_executable', 'browser_path_missing', 'browser_path_not_executable', 'browser_choice_invalid', 'browser_choice_provider', 'browser_choice_user_only', 'builds_unsupported', 'builds_unreadable', 'downgrade_refused', 'downgrade_unknown', 'build_noop', 'browsing_yourself', 'browser_restarting'];
  ok(gateOf(CODES.every((c) => W.buildRefusalWords({ code: c }, t))) && W.buildRefusalWords({ code: 'x' }, t) === null && verdictOf(CODES.every((c) => BB.BUILD_CODES.includes(c) || ['build_noop', 'browsing_yourself', 'browser_restarting'].includes(c))), 'every refusal code has its sentence (an unknown one is null — the caller adds the server\'s)');
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
  ok(gateOf(/cardBuildLine\(\{ buildChoice: r\.buildChoice, choice: r\.browser, running: runningBuildOf\(r\.id\), missing: r\.buildMissing, live: !!r\.live, kernelLive: r\.kernelLive \|\| null \}, t\)/.test(tv))
    && gateOf(/r\.kernelLive = p && p\.kernelLive \? \{ engine: p\.kernelLive\.engine, version: p\.kernelLive\.version, why: p\.kernelLive\.why, probe: p\.kernelLive\.probe, live: p\.kernelLive\.live \} : null;/.test(read('src/routes/browser-trace.js'))) /* B-cf42: the panel's rows carry the mark (the pictures found it missing) */ && gateOf(/build: \(r\) => openBuildDialog\(app, r\.id,/.test(tv)) && gateOf(/id: 'build', label: t\('Change build…'\)/.test(read('src/lib/browser-panel-model.js'))) /* design 015: the ⋯ menu's act */ && verdictOf(/runningBuildOf\(r\.id\)\]\); \};/.test(tv)),
    'the Agent browser panel row: the build line (its fact in the row\'s signature) + Change build… opening THE dialog');
  const sw = read('src/lib/browser-switcher.js');
  ok(gateOf(/st\.view\.build \? cardBuildLine\(/.test(sw)) && verdictOf(/a\.kind === 'build'\) \{ close\(\); openBuildDialog\(app, profileId,/.test(sw)), 'the switch dialog gains the build row and its ONE act');
  const rb = read('src/routes/browser.js');
  ok(gateOf(/router\.post\('\/api\/browser\/profiles\/:id\/build', async \(req, res\) => \{\s*if \(refuseHost\(req, res\)\) return;\s*if \(refuseAgentBearer\(req, res, BUILD_IS_USERS\)\) return;/.test(rb)) && gateOf(/if \(req\.body && req\.body\.browser != null\) return res\.status\(403\)\.json\(\{ error: BUILD_IS_USERS, code: 'browser_choice_user_only' \}\);/.test(rb))
    && verdictOf(/createdBy: f\.browserKey, by: 'agent' \}/.test(rb)), 'the routes: Change build… is cookie-only (an agent token refused by name); the agent\'s `new` refuses a build and creates `by: agent`');
  const hb = read('src/server/browser-handback.js');
  ok(gateOf(/keeper\.onRelaunch\(\(ev\) => \{ try \{ announceRelaunch\(ev\);/.test(hb)) && !/announceRelaunch[\s\S]{0,2500}deliverToConversation/.test(hb.slice(hb.indexOf('function announceRelaunch'), hb.indexOf('function announceRelaunch') + 2500)), 'the announcer tells a relaunch through the CARD path + a zero-spend notice (never a delivery — nobody typed it)');
}

// ═══ ⑥ lane chrome-builds-download (design 004): the PURE half + the picker's words ═══════════════════════════════
console.log('— ⑥ Download another build…: the two list parsers, THE compatibility verdict, the paths, the zip\'s shape, the words');
{
  const V = require('../src/browser-verbs.js'); const R = V.CHROME_BUILDS_RECORD;
  const FIX = path.join(REPO, 'scripts/fixtures/chrome-for-testing');
  const lkg = JSON.parse(fs.readFileSync(path.join(FIX, 'last-known-good-versions-with-downloads.json'), 'utf8'));
  const kg = JSON.parse(fs.readFileSync(path.join(FIX, 'known-good-versions-with-downloads.trimmed.json'), 'utf8'));
  ok(R.listHost === 'googlechromelabs.github.io' && R.fileHost === 'storage.googleapis.com' && R.platform === 'linux64' && R.layout === 'chrome-linux64/' && R.measured.stable === '154.0.8037.92' && R.measured.bytes === 196202491 && verdictOf(Object.isFrozen(R)),
    'CHROME_BUILDS_RECORD: the two measured hosts (the ONE place they are spelled), the platform, the layout, the measurement');
  const p1 = BB.parseLastKnownGood(lkg, { fileHost: R.fileHost });
  ok(gateOf(p1.ok) && p1.rows.map((r) => r.channel).join() === 'Stable,Beta,Dev,Canary' && p1.rows[0].version === '154.0.8037.92' && gateOf(p1.rows.every((r) => r.url === `https://${R.fileHost}/chrome-for-testing-public/${r.version}/linux64/chrome-linux64.zip`)) && !p1.refused.length, 'the 10 KB channel list (measured): four rows, each the linux64 zip on the file host', p1.rows);
  const planted = JSON.parse(JSON.stringify(lkg));
  planted.channels.Beta.downloads.chrome.find((d) => d.platform === 'linux64').url = 'https://evil.example.com/chrome-linux64.zip';
  planted.channels.Dev.downloads.chrome.find((d) => d.platform === 'linux64').url = `http://${R.fileHost}/x.zip`;
  planted.channels.Canary.downloads.chrome.find((d) => d.platform === 'linux64').url = `https://u:p@${R.fileHost}/x.zip`;
  const p2 = BB.parseLastKnownGood(planted, { fileHost: R.fileHost });
  ok(gateOf(p2.ok) && p2.rows.map((r) => r.channel).join() === 'Stable' && p2.refused.length === 3 && gateOf(p2.refused.every((x) => x.code === 'build_url_offhost')) && verdictOf(/evil\.example\.com/.test(p2.refused[0].error)), 'an off-host url, a plain-http one, one with credentials: each row refused BY NAME, never offered', p2.refused);
  ok(BB.parseLastKnownGood({ nope: 1 }, { fileHost: R.fileHost }).code === 'build_list_invalid' && BB.parseKnownGood({ versions: 'x' }, { fileHost: R.fileHost }).code === 'build_list_invalid', 'a document of another shape: refused whole (`build_list_invalid`), never a crash');
  const p3 = BB.parseKnownGood(kg, { fileHost: R.fileHost });
  ok(gateOf(p3.ok) && p3.versions.length === 23 && p3.versions[0].version === '157.0.8083.0' && p3.versions.at(-1).version === '113.0.5672.0' && BB.majorsOf(p3.versions).map((m) => m.major).join() === '157,154,153,151,146,113' && BB.majorsOf(p3.versions).find((m) => m.major === 151).count === 4,
    'the known-good list (trimmed to 6 majors): every linux64 version newest first; one row per major with its newest and its count');
  const C = (o) => BB.buildCompatVerdict({ version: '155.0.1.2', platform: 'linux', arch: 'x64', ...o });
  const chip = (v, k) => v.chips.find((x) => x.kind === k);
  const mac = C({ platform: 'darwin', arch: 'arm64', command: '/x/agent-browser install' });
  ok(!mac.ok && mac.code === 'build_platform_unsupported' && verdictOf(/Linux x64.*darwin-arm64 install by hand: \/x\/agent-browser install/.test(mac.error)), 'HARD machine: off Linux x64 the download is refused, the hand command said', mac.error);
  const d1 = C({ zipBytes: 100e6, freeBytes: 299e6, freePath: '/home' }), d2 = C({ zipBytes: 100e6, freeBytes: 300e6 }), d3 = C({ freeBytes: 1 });
  ok(!d1.ok && d1.code === 'disk' && d1.hard[0].need === 300e6 && gateOf(/needs about 300 MB free, 299 MB left on \/home/.test(d1.error)) && gateOf(d2.ok) && gateOf(d3.ok) && !d3.hard.length, 'HARD disk: free bytes against the zip\'s length × 3, with the numbers; no length yet ⇒ no disk row');
  ok(gateOf(C({ present: true }).ok) && C({ present: true }).offer === false && verdictOf(chip(C({ present: true }), 'present')), 'present: a chip ("Already on this computer"), the row offers nothing — not a refusal');
  ok(chip(C({ census: 'newer', censusChrome: '154.0.8037.57' }), 'census').census === '154.0.8037.57' && chip(C({ census: 'between' }), 'census').relation === 'older' && chip(C({ census: 'censused' }), 'census').relation === 'censused', 'the census chip: the relation chromeRelation gave (between reads as older)');
  ok(chip(C({ profile: { label: 'Work', lastChromiumMajor: 156 } }), 'profile').wrote === 156 && !chip(C({ profile: { label: 'Work', lastChromiumMajor: 155 } }), 'profile') && !chip(C({ profile: { lastChromiumMajor: null } }), 'profile'), 'this profile: a chip only for a build OLDER than the major that last opened it');
  ok(!['146.0.1.1', '151.0.1.1', '152.0.1.1'].some((v) => chip(BB.buildCompatVerdict({ version: v, platform: 'linux', arch: 'x64' }), 'cloak')), 'no chip about switching to the anti-bot backend later (lane engine-spi-egress L3: it left the core)');
  const pl = BB.downloadPlan({ version: '154.0.8037.92', buildsRoot: '/h/.agent-browser/browsers' });
  ok(gateOf(pl.ok) && pl.part === '/h/.agent-browser/browsers/chrome-154.0.8037.92.part' && pl.unpackDir === '/h/.agent-browser/browsers/.unpack-154.0.8037.92' && pl.targetDir === '/h/.agent-browser/browsers/chrome-154.0.8037.92' && pl.removingDir === '/h/.agent-browser/browsers/.removing-154.0.8037.92'
    && gateOf(['../x', '154.0.8037.92/../../x', '154.0.8037.92/x', ''].every((v) => BB.downloadPlan({ version: v, buildsRoot: '/h' }).code === 'build_version_invalid')) && !BB.parseBuildDir('chrome-154.0.8037.92.part') && !BB.parseBuildDir('.unpack-154.0.8037.92'),
    'the plan: every path inside the builds folder; a version that is a path is refused; .part / .unpack- / .removing- are never listed as builds');
  const okZip = ['chrome-linux64/', 'chrome-linux64/chrome', 'chrome-linux64/locales/', 'chrome-linux64/locales/en-US.pak'];
  const Z = (extra, base = okZip) => BB.zipShapeVerdict([...base, ...extra]);
  ok(gateOf(Z([]).ok) && Z([]).files === 2, 'the zip: the measured layout passes');
  const zbad = [[['chrome-linux64/../x'], '..'], [['/etc/passwd'], 'absolute'], [[{ name: 'chrome-linux64/lnk', kind: 'link' }], 'link'], [['other/x'], 'outside'], [['chrome-linux64/chrome'], 'twice'], [['chrome-linux64/a\\b'], 'backslash'], [['chrome-linux64/./x'], '"."'], [[{ name: 'chrome-linux64/fifo', kind: 'other' }], 'special']];
  ok(gateOf(zbad.every(([e]) => Z(e).code === 'build_zip_shape')) && BB.zipShapeVerdict(['chrome-linux64/', 'chrome-linux64/x']).code === 'build_zip_shape' && BB.zipShapeVerdict([]).code === 'build_zip_shape', 'the zip refused by name: "..", absolute, a link, outside the layout, a duplicate, a backslash, ".", a special entry, no chrome, empty', zbad.map(([e, w]) => [w, Z(e).error]));
  const zl = BB.parseZipListing('chrome-linux64/\nchrome-linux64/chrome\nchrome-linux64/l\n', 'Archive:  x.zip\nZip file size: 9 bytes, number of entries: 3\ndrwxr-xr-x  3.0 unx        0 bx stor 26-Oct-02 21:49 chrome-linux64/\n-rwxr-xr-x  3.0 unx       51 tx stor 26-Oct-02 21:49 chrome-linux64/chrome\nlrwxrwxrwx  3.0 unx       11 bx stor 26-Oct-02 21:49 chrome-linux64/l\n3 files, 62 bytes uncompressed\n');
  ok(gateOf(zl.ok) && zl.entries.map((e) => e.kind).join() === 'dir,file,link' && BB.zipShapeVerdict(zl.entries).code === 'build_zip_shape' && BB.parseZipListing('a\nb\n', '-rw-r--r--  3.0 unx 1 tx stor 26-Oct-02 21:49 a\n').code === 'build_zip_shape',
    'unzip\'s two listings paired: names from -Z1, kinds from -Zs (a link is seen); listings that do not pair are refused');
  ok(gateOf(BB.versionSays('Google Chrome for Testing 154.0.8037.92 \n', '154.0.8037.92').ok) && BB.versionSays('Google Chrome for Testing 154.0.8037.93', '154.0.8037.92').says === '154.0.8037.93' && !BB.versionSays('', '1.2.3.4').ok, '`chrome --version` must name exactly the version');
  ok(gateOf(['build_platform_unsupported', 'disk', 'build_zip_shape', 'build_url_offhost', 'build_in_use', 'build_not_downloaded', 'unzip_unavailable', 'install_running', 'build_stalled'].every((c) => BB.BUILD_CODES.includes(c))) && verdictOf(BB.BUILD_CODES.every((c) => /'?[a-z_]+'?: \d{3}/.test(c) || read('src/routes/browser.js').includes(`${c}: `) || read('src/routes/browser.js').includes(`'${c}': `))),
    'every refusal code is in BUILD_CODES and the routes\' STATUS table');
  const W = await import('../src/lib/browser-build-model.js');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const mkT = (d) => (k, p) => { let x = (d && d[k]) || k; if (p) x = x.replace(/\{(\w+)\}/g, (m, y) => (p[y] !== undefined ? String(p[y]) : m)); return x; };
  const t = mkT(null);
  const rowsDl = W.buildRows({ ok: true, builds: [] }, { local: true, t, download: { offered: true } });
  ok(rowsDl.at(-1).kind === 'download' && rowsDl.at(-1).label === 'Download another build…' && !W.buildRows({ ok: true, builds: [] }, { local: false, t, download: { offered: false } }).some((r) => r.kind === 'download') && W.choiceOfRow(rowsDl.at(-1)) === null,
    'Change build… / New profile…: the LAST row "Download another build…" on this computer (Linux x64) — an act, never a choice; none on a paired machine');
  ok(W.installHint({ command: 'ab install', local: true, download: { offered: true } }, t) === null && gateOf(/Linux x64.*darwin-arm64.*ab install/.test(W.installHint({ command: 'ab install', local: true, download: { offered: false, machine: 'darwin-arm64' } }, t))) && verdictOf(/paired machine aren't offered yet.*ab install/.test(W.installHint({ command: 'ab install', local: false, download: { offered: false } }, t))),
    'the hand command: gone where the row is; elsewhere said WITH the reason (another machine kind, a paired machine)');
  const lines = W.verdictLines(BB.buildCompatVerdict({ version: '155.0.1.2', platform: 'linux', arch: 'x64', census: 'newer', censusChrome: '154.0.8037.57', profile: { label: 'Work', lastChromiumMajor: 156 }, cli: '0.38.1', zipBytes: 100e6, freeBytes: 1e6, freePath: '/h' }), t).map((x) => x.text);
  ok(gateOf(/Needs about 300 MB free, 1 MB left on \/h/.test(lines[0])) && gateOf(lines.includes('Driven by agent-browser 0.38.1')) && gateOf(lines.some((x) => /Newer than the census \(154\.0\.8037\.57\)/.test(x))) && gateOf(lines.some((x) => /last opened Work \(156\)/.test(x))) && !lines.some((x) => /CloakBrowser/.test(x)), 'a row\'s lines: the HARD refusal first with its numbers, then every chip in words', lines);
  const cf = W.downloadConfirmWords({ version: '154.0.8037.92', host: 'storage.googleapis.com', bytes: 196202491, root: '/h/.agent-browser/browsers' }, t);
  ok(cf.title === 'Download Chrome 154.0.8037.92?' && gateOf(/About 196 MB comes from storage\.googleapis\.com and unpacks to about 392 MB in \/h\/\.agent-browser\/browsers/.test(cf.message)) && gateOf(/Google publishes no separate one/.test(cf.message)) && gateOf(/Nothing restarts/.test(cf.message)) && gateOf(/never auto-updates/.test(cf.message)) && cf.confirmText === 'Download',
    'THE CONFIRM: the version, the host, the size, where it lands, how it is checked (and that Google publishes no checksum), nothing restarts, no auto-update; one button');
  ok(W.downloadProgressWords({ running: true, step: 'fetch', version: '1.2.3.4', bytes: 42e6, total: 196e6 }, t).text === 'Downloading Chrome 1.2.3.4… 42 MB of 196 MB' && gateOf(/^Unpacking/.test(W.downloadProgressWords({ running: true, step: 'unpack', version: 'x' }, t).text)) && gateOf(W.downloadProgressWords({ done: '1.2.3.4' }, t).done) && verdictOf(/didn't finish in 15 minutes/.test(W.downloadProgressWords({ failed: true, version: 'x', code: 'build_stalled' }, t).text)),
    'the progress line: "downloading… 42 MB of 196 MB" → unpacking… → ready; a failure says why (the 15-minute clock by name)');
  ok(gateOf(W.installedWords({ bytes: 389e6, downloaded: true }, t).remove) && !W.installedWords({ bytes: 389e6 }, t).remove && gateOf(/in use by Work/.test(W.installedWords({ bytes: 1, downloaded: true, profiles: ['Work'] }, t).text)) && verdictOf(/in use — Work, Live/.test(W.downloadRefusalWords({ code: 'build_in_use', build: { profiles: ['Work'], running: ['Live'] } }, t))),
    'installed builds: Remove only on a build VibeSpace downloaded that nobody uses; in use names who');
  for (const [lang, d] of [['zh', zh], ['ja', ja]]) {
    const tt = mkT(d); const said = new Set(); const rec = (k, pp) => { said.add(k); return tt(k, pp); };
    W.verdictLines({ hard: [{ code: 'build_platform_unsupported', machine: 'm', command: 'c' }, { code: 'disk', need: 1, free: 1, path: '/' }], chips: [{ kind: 'present' }, { kind: 'cli', version: '1' }, { kind: 'census', relation: 'censused' }, { kind: 'census', relation: 'newer' }, { kind: 'census', relation: 'older' }, { kind: 'profile', label: 'x', wrote: 1 }] }, rec);
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
  ok(gateOf(/if \(r\.kind === 'download'\) \{ list\.appendChild\(downloadRow\(r, \(\) => openPicker\(\)\)\); continue; \}/.test(dg)) && gateOf(/const was = shell\.active\(\) \? 'person' : 'system'; shell\.close\(\); openBuildDialog\(app, id, \{ label, onDone, pick: v, opener: was \}\)/.test(dg)) && gateOf(/if \(r\.kind === 'download'\) \{ order\.push\(row \|\| downloadRow\(r, openBuildPicker\)\); continue; \}/.test(np)) && verdictOf(/st\.buildDownload = r && !r\.error \? r\.download \|\| null : null;/.test(np)),
    'wiring: Change build… opens the picker in the dialog and comes back with the new build picked (the finished download re-opens it where the old form stood — in front only if it was the active window, else behind with its tile pulsing; lane dialog-yield r5); New profile…\'s build section opens it in place');
}

// ═══ ⑤ control (a) — the verdict table's own (B-7e49: the keeper controls (b) … (j) moved with ② to the heavy twin) ═══════════
console.log('— ⑤ control (a): a verdict that lets an agent choose a build turns ①\'s table red');
{
  const MUT = mutantCopies('badm-builds', REPO);
  const src = read('src/browser-builds.js');
  const agentMay = editAnchor(src, "  if (by !== 'user') return { ok: false, code: 'browser_choice_user_only',", "  if (false) return { ok: false, code: 'browser_choice_user_only',", "src/browser-builds.js");
  ok(agentMay !== src, 'control (a): the patch (a verdict that lets an agent choose a build) applies');
  const BBa = MUT.load('src/browser-builds.js', agentMay, 'agent-may');
  ok(judgeVerdict(BBa).length > 0, 'control (a): …and ①\'s verdict table goes red on it', judgeVerdict(BBa));
}

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
  ok(gateOf(zl.ok) && BB.zipShapeVerdict(zl.entries).unpacked === 67108915, 'the zip\'s declared unpacked size is summed over its files (the keeper weighs it against the free space before `unzip -q`)', zl);
}


// ═══ B-0bc7: THE «Download kernel» DOOR — which engine's card offers it, what its answer says (en / zh / ja, the real dictionaries),
// the unread kernel's words naming it WHERE IT STANDS (the Settings row, never Change build… / New profile…), the row asked again while
// a kernel downloads (the route answers a press when the download STARTS), the Settings row's wiring; CONTROL: no door for a FAILED download ═══
console.log('— B-0bc7: the engine card\'s «Download kernel» door');
{
  const BMk = await import('../src/lib/browser-build-model.js');
  const zhK = (await import('../src/lib/i18n-zh.js')).default, jaK = (await import('../src/lib/i18n-ja.js')).default;
  const tOf = (d) => (k, p) => { let x = (d && d[k]) || k; if (p) x = x.replace(/\{(\w+)\}/g, (m, y) => (p[y] !== undefined ? String(p[y]) : m)); return x; };
  const tE = tOf(null);
  // the engines' table in the states kernelFact gives (absent / failed / downloading / installed) + the fleet's «untrusted»
  const R0 = { defaultEngine: { value: 'default', source: 'default' }, engines: [
    { id: 'eng-missing', label: 'Missing', installed: false, kernel: { state: 'absent' } },
    { id: 'eng-failed', label: 'Failed', installed: false, kernel: { state: 'failed', code: 'disk' } },
    { id: 'eng-busy', label: 'Busy', installed: false, kernel: { state: 'downloading', bytes: 1, total: 4 } },
    { id: 'eng-unread', label: 'Unread', installed: true, executable: true, measuredVersion: '1.0', kernel: { state: 'installed', next: { version: '2.0', unread: 'EIO' } } },
    { id: 'eng-ok', label: 'Ok', installed: true, executable: true, measuredVersion: '1.0', kernel: { state: 'installed' } },
    { id: 'eng-own', label: 'Own', source: 'user', installed: false },
    { id: 'eng-bad', label: 'Bad', code: 'browser_engine_protocol' },
    { id: 'eng-consent', label: 'Consent', installed: false, kernel: { state: 'untrusted' } },
    { id: 'eng-node', label: 'Node', installed: false, kernel: { state: 'failed', code: 'engine_node_unsupported', need: '22.15', node: '20.0' } },
  ] };
  const WANT = [{ id: 'eng-missing', label: 'Missing', busy: false }, { id: 'eng-failed', label: 'Failed', busy: false }, { id: 'eng-busy', label: 'Busy', busy: true }, { id: 'eng-unread', label: 'Unread', busy: false }];
  const judgeDoors = (M) => JSON.stringify(M.kernelDoors(R0)) === JSON.stringify(WANT) && M.kernelDoors(null).length === 0 && M.kernelDoors({ error: 'unreachable' }).length === 0;
  ok(verdictOf(judgeDoors(BMk)), 'B-0bc7 kernelDoors: a door for a kernel not here (none yet, a failed download), one BUSY while it downloads, one for a waiting kernel that could not be read — none for an installed kernel, the owner\'s own program, an engine that does not answer, a package waiting for consent, a Node that cannot unpack it; none when the engines could not be read', BMk.kernelDoors(R0));
  const DOOR = ' · press «Download kernel» to fetch it again';
  const unreadSet = BMk.engineNote(R0.engines[3], tE, { door: true }), unreadCard = BMk.engineNote(R0.engines[3], tE);
  ok(gateOf(unreadSet.endsWith('the waiting kernel 2.0 could not be read (EIO) — it is kept beside its place and asked again at the next start' + DOOR)) && !unreadCard.includes('Download kernel') && verdictOf(BMk.engineFactText(R0, tE).includes(DOOR)),
    'B-0bc7: the unread waiting kernel\'s words name the door in the Settings row (engineFactText) — and NOT on the Change build… / New profile… cards, which have none (the adversarial read)', { unreadSet, unreadCard });
  ok(BMk.kernelPollDue(R0) === true && BMk.kernelPollDue({ ...R0, engines: R0.engines.filter((e) => e.id !== 'eng-busy') }) === false && BMk.kernelPollDue(null) === false && BMk.kernelPollDue({ error: 'unreachable' }) === false,
    'B-0bc7 kernelPollDue: the row asks again while ANY kernel downloads (the press\'s POST answers at the start) and stops when none does');
  // the second adversarial read: a read that FAILED in the middle of a download never ends its progress
  const judgeStep = (M) => { const a = M.kernelPollStep(R0, false), b = M.kernelPollStep(null, true), c = M.kernelPollStep({ error: 'unreachable' }, true), d = M.kernelPollStep(null, false), e = M.kernelPollStep({ ...R0, engines: R0.engines.filter((x) => x.id !== 'eng-busy') }, true);
    return a.polling && a.tick && a.redraw && b.polling && b.tick && !b.redraw && c.tick && !c.redraw && !d.tick && !d.polling && !e.polling && !e.tick && e.redraw; };
  ok(verdictOf(judgeStep(BMk)), 'B-0bc7 kernelPollStep: a good read with a download ⇒ polling, ask again; a FAILED read while a download ran ⇒ the doors stay as drawn and the row asks again; a failed read with none running ⇒ nothing; a good read with none ⇒ the poll ends');
  const ANS = [[{ ok: true, started: true, id: 'eng-missing' }, ''], [{ ok: false, code: 'install_running', error: 'x' }, 'its kernel is already downloading'],
    [{ ok: false, code: 'disk', error: 'x' }, 'the kernel could not be downloaded: not enough free disk space'],
    [{ ok: false, code: 'build_platform_unsupported', error: 'x' }, 'the kernel could not be downloaded: the engine offers no kernel for this computer'],
    [{ ok: false, code: 'engine_kernel_landing', error: 'x' }, 'the kernel could not be downloaded: its kernel is being replaced or put back in its place — try again in a moment'],
    [{ error: 'boom', code: 'odd_code' }, 'the kernel could not be downloaded: odd_code'], [null, 'VibeSpace did not answer — nothing was downloaded']];
  const badAns = ANS.filter(([a, w]) => BMk.kernelDownloadWords(a, tE) !== w).map(([a, w]) => ({ a, want: w, got: BMk.kernelDownloadWords(a, tE) }));
  ok(badAns.length === 0, 'B-0bc7 kernelDownloadWords: a started download says nothing (the card\'s line says the rest), a refusal says itself BY CODE (install_running, disk, platform, a landing or put-back, any other by its code), no answer says so', badAns);
  const KEYS = ['Download kernel', 'Download kernel: {plugin}', 'press «Download kernel» to fetch it again', 'its kernel is already downloading', 'the kernel could not be downloaded: {why}', 'its kernel is being replaced or put back in its place — try again in a moment', 'VibeSpace did not answer — nothing was downloaded'];
  const ph = (k) => (k.match(/\{\w+\}/g) || []);
  const missing = KEYS.flatMap((k) => [['zh', zhK], ['ja', jaK]].filter(([, d]) => !(typeof d[k] === 'string' && d[k] !== k && ph(k).every((x) => d[k].includes(x)))).map(([l]) => `${l}: ${k}`));
  ok(missing.length === 0, `B-0bc7: every new word (${KEYS.length}) in zh AND ja, its placeholders kept`, missing);
  ok(gateOf(BMk.engineNote(R0.engines[3], tOf(zhK), { door: true }).endsWith('按「下载内核」重新获取')) && gateOf(BMk.engineNote(R0.engines[3], tOf(jaK), { door: true }).endsWith('「カーネルをダウンロード」を押すと取得し直します')) && BMk.kernelDownloadWords({ ok: false, code: 'install_running' }, tOf(zhK)) === '它的内核正在下载',
    'B-0bc7: …said in zh / ja through the real dictionaries');
  // the Settings row's wiring (DOM-free here; the drawn row is the integrator's heavy read): the doors drawn with EVERY answer of the
  // engines, the person's POST, the row asked again while a kernel downloads (by the LINE's own tick), each door's answer beside it
  const ui = read('src/lib/settings-ui.js'), css = read('public/style.css');
  ok(gateOf(/line\.textContent = engineFactText\(r, t\);\n[^\n]*\n[^\n]*\n\s+if \(d\) line\.append\(' ', needDoorButton\(d\)\);\n\s+this\._paintKernelDoors\(line, r, \(\) => this\._loadEngines\(row, path, line\)\);/.test(ui))   // the restack -moved2: the line's words, its need door (lane ui-needs-a-button pick 5), then the kernel doors
    && gateOf(/fetchJson\(`\/api\/browser\/engines\/\$\{encodeURIComponent\(id\)\}\/kernel`, \{ method: 'POST' \}\)/.test(ui))
    && gateOf(ui.includes('const tick = () => { if (!line._kernelTick) line._kernelTick = setTimeout(() => { line._kernelTick = null; if (line.isConnected) again(); }, 1500); };'))
    && gateOf(ui.includes('    const step = kernelPollStep(r, line._kernelPolling);\n    line._kernelPolling = step.polling;\n    if (!step.redraw) { if (step.tick) tick(); return; }')) && gateOf(ui.includes('    if (step.tick) tick();\n'))
    && !/setInterval\(again/.test(ui) && gateOf(/const words = kernelDownloadWords\(ans, t\);\n\s+if \(words\) this\._kernelSaid\.set\(id, words\);/.test(ui)) && gateOf(/b\.classList\.toggle\('is-busy', busy\);/.test(ui)) && gateOf(/if \(d\.busy \|\| this\._kernelAsks\.has\(d\.id\)\) \{ this\._kernelSaid\.set\(d\.id, t\('its kernel is already downloading'\)\); again\(\); return; \}/.test(ui)) && !/\.disabled = /.test(ui.slice(ui.indexOf('  _paintKernelDoors('), ui.indexOf('\n  }\n', ui.indexOf('  async _downloadKernel(')))) /* the doors' own code (another row's button, e.g. hooks-create's Apply, is not these doors) */
    && gateOf(/, \.settings-engine-download \{ flex: none;/.test(css)) && verdictOf(/\.settings-engine-doors \{/.test(css)),
    'B-0bc7 wiring: the Settings engine row draws the doors with every engines answer, POSTs a press, asks the row again by the line\'s own tick while a kernel downloads (never a timer tied to the POST), keeps a busy door LIVE and has it say why, says each door\'s answer beside it (the old answer ends only when a download STARTS), redraws only when the doors moved and gives the focus back to its door — the row\'s own button rule (theme variables)');
  // CONTROL: a model copy whose doors skip a FAILED download (only «none yet») — the engine whose download failed would have no door
  const MUTK = mutantCopies('b0bc7-doors', REPO);
  const msrc = read('src/lib/browser-build-model.js');
  const needle = "    if (!e.installed || (k && k.next && k.next.unread)) out.push(";
  ok(msrc.split(needle).length === 2, 'B-0bc7 control setup: the door rule is found once in src/lib/browser-build-model.js');
  const fCopy = MUTK.write('src/lib/browser-build-model.js', editAnchor(msrc, needle, "    if ((!e.installed && !(k && k.state === 'failed')) || (k && k.next && k.next.unread)) out.push(", "src/lib/browser-build-model.js"), 'no-failed-door', { esm: true });
  const BMx = await import('file://' + fCopy);
  ok(!judgeDoors(BMx) && !BMx.kernelDoors(R0).some((d) => d.id === 'eng-failed'), 'CONTROL (B-0bc7): a door rule without the failed download — that engine has no «Download kernel» ⇒ the door table goes RED', BMx.kernelDoors(R0));
  const stepNeedle = "  if (!r || r.error) return { polling: !!polling, tick: !!polling, redraw: false };";
  ok(msrc.split(stepNeedle).length === 2, 'B-0bc7 control setup: the failed-read step is found once');
  const fCopy2 = MUTK.write('src/lib/browser-build-model.js', editAnchor(msrc, stepNeedle, "  if (!r || r.error) return { polling: false, tick: false, redraw: true };", "src/lib/browser-build-model.js"), 'failed-read-ends', { esm: true });
  const BMy = await import('file://' + fCopy2);
  ok(!judgeStep(BMy), 'CONTROL (B-0bc7, round 2\'s should): a step that lets ONE failed read end the poll (the doors removed, never asked again) goes RED');
  // its verdict's MUST: a press on a busy door SHOWS its words — the old answer ends when a download STARTS, never on a read that still
  // says downloading. The leg: the row's first read (a download running), a press on the busy door, the redraw's read (still
  // downloading) ⇒ the words are drawn; the download ends, a NEW one starts ⇒ the old answer goes
  const BUSY = 'its kernel is already downloading';
  const judgeSaid = (BM) => {
    const dl = [{ id: 'eng-x', kernel: { state: 'downloading' } }], failed = [{ id: 'eng-x', kernel: { state: 'failed', code: 'build_fetch_failed' } }];
    const s1 = BM.kernelSaidStep({ engines: dl });
    const pressed = new Map(s1.said); pressed.set('eng-x', BUSY); // the press on the busy door
    const s2 = BM.kernelSaidStep({ said: pressed, states: s1.states, engines: dl }); // the redraw the press asks for: still downloading
    const s3 = BM.kernelSaidStep({ said: s2.said, states: s2.states, engines: failed }); // cure 2: the download ENDED (it failed)
    const refused = new Map(s3.said); refused.set('eng-x', 'the kernel could not be downloaded: not enough free disk space'); // a press now, refused by code
    const s4 = BM.kernelSaidStep({ said: refused, states: s3.states, engines: failed }); // nothing changed since
    const s5 = BM.kernelSaidStep({ said: s4.said, states: s4.states, engines: dl }); // a NEW download starts
    return { drawn: s2.said.get('eng-x') === BUSY, endsAtEnd: !s3.said.has('eng-x'), standsWhileSame: s4.said.has('eng-x'), endsAtStart: !s5.said.has('eng-x') };
  };
  const js = judgeSaid(BMk);
  ok(gateOf(js.drawn) && gateOf(js.endsAtEnd) && gateOf(js.standsWhileSame) && verdictOf(js.endsAtStart), `B-0bc7 (its verdict's must + cure 2): a press on a busy door, then a read that still says downloading — its words are DRAWN (${js.drawn}); the download then FAILS — «already downloading» is gone (${js.endsAtEnd}, never beside a fact line that says it failed); a refusal stands while nothing changes (${js.standsWhileSame}); a download that STARTS ends it (${js.endsAtStart})`, js);
  const saidNeedle = "    if (st.has(id) ? st.get(id) !== now : now === 'downloading') s.delete(id);";
  ok(msrc.split(saidNeedle).length === 2, 'B-0bc7 control setup: the «ends at the start» rule is found once in src/lib/browser-build-model.js');
  const fCopy3 = MUTK.write('src/lib/browser-build-model.js', editAnchor(msrc, saidNeedle, "    if (now === 'downloading') s.delete(id);", "src/lib/browser-build-model.js"), 'said-every-read', { esm: true }); // stale-pins: kept — the batch's first rule, planted back
  const BMz = await import('file://' + fCopy3);
  ok(!judgeSaid(BMz).drawn, 'CONTROL (B-0bc7, its verdict\'s must): the batch\'s own rule — a downloading read ends the answer (settings-ui\'s old line) — erases the busy press\'s words before they are drawn ⇒ RED', judgeSaid(BMz));
  const fCopy4 = MUTK.write('src/lib/browser-build-model.js', editAnchor(msrc, saidNeedle, "    if (now === 'downloading' && st.get(id) !== 'downloading') s.delete(id);", "src/lib/browser-build-model.js"), 'said-only-at-start', { esm: true }); // stale-pins: kept — the first cure's rule, planted back as this control's mutant
  const BMw = await import('file://' + fCopy4);
  ok(!judgeSaid(BMw).endsAtEnd && verdictOf(judgeSaid(BMw).drawn), 'CONTROL (B-0bc7 cure 2): the first cure\'s rule — the answer ends only when a download STARTS — keeps «its kernel is already downloading» beside a download that FAILED ⇒ RED', judgeSaid(BMw));
  const ui2 = read('src/lib/settings-ui.js');
  ok(gateOf(ui2.includes('kernelSaidStep({ said: this._kernelSaid, states: this._kernelStates || new Map(), engines: r.engines })')) && !ui2.includes("if (e && e.kernel && e.kernel.state === 'downloading') this._kernelSaid.delete(String(e.id));") && gateOf(ui2.includes('if (box._doorsSig === sig) { if (step.tick) tick(); return; }')) && verdictOf(/if \(focused\) \{ const fb = \[\.\.\.box\.querySelectorAll\('button\.settings-engine-download'\)\]\.find\(\(x\) => x\.dataset\.engine === focused\); if \(fb\) fb\.focus\(\); \}/.test(ui2)), // stale-pins: kept — a deliberate absence check: the old delete-on-every-read line is gone
    'B-0bc7 wiring (its verdict): the Settings row asks the PURE step for its answers (the old delete-on-every-downloading-read line gone — stale-pins: kept), redraws only when the doors moved, and gives the focus back to its door');
}


// ── §T THE TWIN HOLDS THE KEEPER'S LEGS (B-7e49: a leg cannot fall between the two files) ──────────────────────────────────────
{
  const twinRel = 'scripts/test-browser-builds-keeper.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf-8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  const MOVED = ["console.log('— ② the keeper over the fake binary", "console.log('— ③b the agent", "console.log('— ⑤ controls: patched copies", "console.log('— ⑦ lane engine-plugin",
    "console.log('— ⑦e B-9584 U2a", "console.log('— ⑦f B-9584 U2b", "console.log('— ⑦g B-9584 U2c", "console.log('— ⑧ lane engine-distribution", "console.log('— ⑧c lane kernel-asset-credential"];
  ok(gateOf(MOVED.every((h) => twin.split(h).length === 2)) && gateOf(MOVED.every((h) => here.split(h).length === 2)) && !/require\('\.\.\/src\/server\/browser-keeper\.js'\)|writeFakeAgentBrowser\(/.test(here),
    `§T the heavy twin holds the ${MOVED.length} sections that drive the real keeper over the fake binary (② … ⑧c), and this file runs none of them (no keeper, no fake binary)`);
  const lineOf = (t, start) => (t.split('\n').find((l) => l.trim().startsWith(start)) || '').trim();
  const SETUP = ["mkBuild('151.", "fs.mkdirSync(path.join(BROWSERS, 'not-a-build')"];
  ok(verdictOf(SETUP.every((s) => lineOf(here, s) !== '' && lineOf(here, s) === lineOf(twin, s))), '§T the twin lays down the builds ① lays down here before its ② — the two setup lines, byte for byte');
  const ci = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  ok(verdictOf(/\{ name: 'test-browser-builds-keeper', tier: 'heavy',/.test(ci)), '§T the twin is a HEAVY row of the tier');
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
