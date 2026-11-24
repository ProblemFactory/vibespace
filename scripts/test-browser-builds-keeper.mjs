#!/usr/bin/env node
// THE HEAVY TWIN OF test-browser-builds (B-7e49, lane bl-tests-chrome, 主开发 r2466) — the legs that drive the REAL keeper over the
// fake agent-browser binary (every call a node child, about 540 a run) and the engine fixture's loader children, MOVED VERBATIM
// from test-browser-builds by the tier rule (a leg that starts a child is heavy): profiled alone on the test machine, these
// sections held about 33 s of that suite's 34–45 s. test-browser-builds keeps the TABLE (① PURE, ③, ④, ⑥, ⑤'s control (a),
// verify r1, B-0bc7) and §T, the pin that this file holds the moved sections. The builds ① lays down there are laid down here
// by its own two setup lines, verbatim, before ②. A scratch HOME with a fake `~/.agent-browser/browsers/`, the shared fake
// agent-browser (every call's launch view logged), a loopback /json/version, port 0, no real binary, no browser.
//
//   ② the REAL keeper over the fake binary: a pinned build's executable rides EVERY call of the browser's own session
//      (AGENT_BROWSER_EXECUTABLE_PATH — the measured relaunch rule), the default rides none, the panel's fact is the
//      browser's OWN answer; a build that VANISHED is refused BY NAME at the launch (no record, no fall back to another
//      build), marked on the record and filed ONCE in For you; Change build… restarts a running browser and TELLS every
//      conversation on it (the relaunch seam) before the stop, reopens its tab, and refuses an older build by name;
//      an agent never chooses a build;
//   ③b the agent's side: `providers` lists the builds and the CLI version as facts; nothing it sends chooses a build;
//   ⑤ patched copies as controls: a launch that forgets the build on later calls, a verdict that lets an agent choose,
//      a keeper that falls back to the default build when the chosen one vanished.
//   ⑦ lane engine-plugin (design-custom-browser-plugin §1): a browser ENGINE plugin — the PURE answer + choice verdicts and
//      the policy; the REAL keeper over the fixture engine (scripts/fixtures/engine-plugin, the REAL loader's IPC child): its
//      kernel + arguments on every call, the vanished kernel refused by name with ONE For-you item, a timeout / an env key /
//      another protocol / the plugin turned off each by name, Change build… to it, the policy at a create and at a
//      conversation's browser's first start (its config names the kernel for the agent's commands too); patched controls.
//   ⑦b lane engine-spi-egress (design-desk cloak-plugin §1): an engine that declares `egress-allowlist` (the fixture's EGRESS
//      VARIANT, no `surfaces`) is WRAPPED by the keeper's own per-profile proxy — the arguments the keeper appends on every call,
//      a listed host passes / an unlisted one is refused with the keeper's words / loopback never, the list read live from the
//      reserved row, the refusals on the verb answer, a conversation's browser born on ANOTHER engine id, the proxy gone with
//      its record; a plugin naming a proxy refused; the reserved row missing refused by name. ⑧e: a tar.gz kernel.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process'; // lane engine-args-string r2: the engine's wrapper run by a real sh
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, deadPort, anchored } from './scratch.mjs';   // r3834 (THE ORDER, r1857): scratch.mjs is the first import after node's own
import { mutantCopies, keeperWithInstalls } from './mutant-copy.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
const DEAD_CDP = await deadPort(); // the stub's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } return !!c; };
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
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
const servers = new Set();
process.on('exit', () => { fake.reap(); for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

// ═══ the machine's builds — what ① of test-browser-builds lays down before ② (its two setup lines, verbatim; its checks stay there) ═══
{
  mkBuild('151.0.7922.34'); mkBuild('146.0.7680.153'); mkBuild('139.0.1.1', { exec: false }); mkBuild('120.0.1.1', { chrome: false });
  fs.mkdirSync(path.join(BROWSERS, 'not-a-build'), { recursive: true }); fs.writeFileSync(path.join(BROWSERS, 'chrome-junk'), 'x');
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
const todoDone = [];   // B-cf42 cure: the stand-in store's resolutions {id, st, by}
const relaunches = [];
function mkKeeper(dataDir, extra = {}, Kmod = K) {
  fs.mkdirSync(dataDir, { recursive: true });
  return Kmod.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3,
    log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: (k, item) => { todos.push(item); return { id: 'u' + todos.length }; }, get: (id) => ({ id, status: todoDone.some((x) => x.id === id) ? 'done' : 'open' }), setStatus: (id, st, by) => { todoDone.push({ id, st, by }); } }, ...extra });
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
  // told, nothing stopped (the switch's `driving` rule — never a restart under their hands); handed back ⇒ it works
  const B153 = mkBuild('153.0.1.1');
  const tk = k.takeover({ browserKey: KEY_A, profileId: pin.id, viewerId: 'viewer-1', sessionId: 'sess-a' });
  const bvD = await k.buildsView(pin.id);
  const nRel = relaunches.length, c4 = fake.calls().length;
  const rD = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '153.0.1.1' }, by: 'user' }).catch((e) => e);
  ok(tk && tk.ok && bvD.driven === KEY_A && rD && rD.code === 'browser_driven' && /hand the browser back/.test(rD.message) && rD.driver === KEY_A && relaunches.length === nRel && callsOf(ns, c4).every((c) => c.verb !== 'close --all') && k.list().browsers[pin.id].runningBuild === '152.0.1.2',
    'a browser the user is DRIVING (a takeover) is never restarted under their hands: Change build… refused by name (browser_driven, the driver named), the dialog says who drives it, nobody told, no stop', { tk, driven: bvD.driven, code: rD && rD.code, msg: rD && rD.message });
  k.handback({ browserKey: KEY_A, profileId: pin.id, cause: 'explicit' });
  const rH = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '153.0.1.1' }, by: 'user' }).catch((e) => e);
  ok(rH && rH.ok && rH.restarted && (await k.buildsView(pin.id)).driven === null && fake.launches().at(-1).exe === B153, '…handed back ⇒ the change restarts it as before (the driver gone from the dialog\'s facts)', rH && (rH.code || rH.restarted));
  // verify r2 (H2): a takeover that lands INSIDE the restart (after the stop, before the new launch) — refused by name; the
  // restart never goes on under the user's hands (their take was accepted before: the tab reopened and the card told while they drove)
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
  // …and Browse yourself IN FLIGHT (their own tab being opened) holds a Change build… off like their browsing does
  const bw = k.browse(pin.id).catch((e) => ({ code: e.code }));
  const rB = await k.setBrowserChoice({ profileId: pin.id, choice: { kind: 'build', version: '155.0.1.1' }, by: 'user' }).catch((e) => e);
  const bwr = await bw;
  ok(rB && rB.code === 'browsing_yourself' && bwr && bwr.ok, 'a Change build… while their Browse yourself is still opening their tab ⇒ browsing_yourself (never a restart that closes the tab they are opening)', { rB: rB && (rB.code || rB.restarted), bwr });
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
  ok(hv.choice && hv.choice.path === pathExe && kA.switcherView(pp.id).build.choice.path === pathExe, '…while the user\'s own dialog and switch view still name the file they typed');
  try { await kA.stop(pp.id, { why: 'user' }); } catch { /* none */ }
  await new Promise((res) => srv.close(res));
  const cli = read('data/bin/vibespace-browser');
  ok(/console\.log\(`chrome builds\$\{r\.host \? ' on ' \+ r\.host : ' here'\}: /.test(cli) && /console\.log\(`browser driver: \$\{r\.cli\.inUse \|\| 'unknown'\} in use/.test(cli) && !/executable-path/.test(cli.slice(cli.indexOf("if (verb === 'providers')"), cli.indexOf("if (verb === 'new-child')"))),
    '`vibespace-browser providers` prints the builds and the driver version as facts (and offers no way to set one)');
}

// ═══ ⑤ controls ═══════════════════════════════════════════════════════════════
console.log('— ⑤ controls: patched copies the gates above must turn red');
{
  const MUT = mutantCopies('badm-builds', REPO);
  const ks = read('src/server/browser-keeper.js');
  const kbk = read('src/server/browser-builds-keeper.js'), CBK = 'src/server/browser-builds-keeper.js'; // rv-browser F7: Change build… is the builds row's file
  const fallback = editAnchor(ks, "    noteBuildMissing(p, c, v);\n    throw namedError(", "    noteBuildMissing(p, c, v);\n    return {};\n    throw namedError(", "src/server/browser-keeper.js");
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
  const forget = editAnchor(ks, "      const launchEnv = { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', ...(headed0 === true ? { AGENT_BROWSER_HEADED: '1' } : headed0 === false ? { AGENT_BROWSER_HEADED: '0' } : {}), ...providerEnv };", "      const launchEnv = { AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', ...(headed0 === true ? { AGENT_BROWSER_HEADED: '1' } : headed0 === false ? { AGENT_BROWSER_HEADED: '0' } : {}), ...(p.provider === 'chromium' ? {} : providerEnv) };", "src/server/browser-keeper.js");
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
  // restart and it goes on under their hands; one blind to a Browse yourself in flight ⇒ Change build… restarts their opening tab
  const noRestartGate = editAnchor(ks, "    if (profileId && switching.has(String(profileId))) { const p = profile(profileId);", "    if (false) { const p = profile(profileId);", "src/server/browser-keeper.js");
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
  ok(ri && ri.ok && ri.restarted === true, 'control (i): …Change build… RESTARTED the browser while their own tab was being opened — exactly what ②\'s Browse-in-flight leg catches', ri && (ri.code || ri.restarted));
  try { await ki.endHuman(pi.id, 'closed', { closeTab: true }); await ki.stop(pi.id, { why: 'user' }); } catch { /* none */ }
  // verify r2 (B5): a keeper with no settle window (the pre-fix heal) ⇒ the dead build is healed in its daemon, no second word
  const noSettle = editAnchor(ks, "    if (rec.buildChange && now() - Number(rec.buildChange.at || 0) <= CHANGE_SETTLE_MS) return fallBackFromChange(rec, p, seenBy);\n", '', "src/server/browser-keeper.js");
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
  const keepPath = editAnchor(ps, "v.kind === 'path' ? { kind: 'path' } :", "v.kind === 'path' ? { kind: 'path', path: v.path } :", "src/browser-profiles.js");   // r2932 (2): the browser row's shape — a named file by its kind
  ok(keepPath !== ps, 'control (e): the patch (an agent profile view that keeps the path) applies');
  const Pe = MUT.load('src/browser-profiles.js', keepPath, 'keep-path');
  const ve = Pe.agentProfileView({ id: 'bp-0000eeee', label: 'E', provider: 'chromium', owner: { kind: 'instance', id: null }, browser: { kind: 'path', path: '/opt/named/chrome' } }, {}, {});
  ok(ve.browser && ve.browser.path === '/opt/named/chrome', 'control (e): …the path crossed to the agent — exactly what ③b\'s versions-only leg catches', ve.browser);
  const envLeak = editAnchor(ks, "browser: agentBrowserView(reg.browsers[l.profileId]), others:", "browser: browserView(reg.browsers[l.profileId]), others:", "src/server/browser-keeper.js");
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

// ═══ ⑦ lane engine-plugin: A BROWSER ENGINE PLUGIN (design-custom-browser-plugin §1) ════════════════════════════════
console.log('— ⑦ lane engine-plugin: the engine verdicts, the real keeper over the fixture engine (the real loader + its IPC child), the vanished kernel, the policy');
const ENGN = require('../src/browser-engines.js');
const BPR = require('../src/browser-profiles.js');
const EID = 'vibespace.custom-browser';
// lane engine-args-string r2 — THE WRAPPER ROAD: on an engine launch the driver starts the keeper's WRAPPER (`exec '<kernel>' "$@"
// '<engine switch>'…`); these read it back as a shell would (a single-quoted word, `'\''` inside) — the kernel it runs, its words
const shWords = (line) => { const out = []; const re = /'((?:[^']|'\\'')*)'/g; let m; while ((m = re.exec(line))) out.push(m[1].replace(/'\\''/g, "'")); return out; };
const wrapperOf = (exe) => { let t = ''; try { t = fs.readFileSync(exe, 'utf8'); } catch { return null; } const line = t.split('\n').find((l) => l.startsWith('exec ')); if (!line || !line.includes(' "$@"')) return null; const [head, tail] = [line.slice(0, line.indexOf(' "$@"')), line.slice(line.indexOf(' "$@"') + 5)]; return { program: shWords(head)[0], args: shWords(tail), text: t }; };
const kernelOf = (exe) => { const w = exe ? wrapperOf(exe) : null; return w ? w.program : exe; };
// THE OWNER'S SWITCHES (a fixture — measured on their hub 2026-11-02, 2.369.370, the custom kernel v0.1.5; none is a secret): the
// keeper's line as their base config held it (the mark's value their conversation's browser key), and the custom kernel's own
// arguments as their engine config named them — the four holding a comma read by 主开发 (fixups-r2), the rest from the brief
const OWNER_KEEPER_LINE = '--no-sandbox,--disable-blink-features=AutomationControlled,--vibespace-keeper=bk-209f474e,--ozone-platform=x11,--use-angle=swiftshader,--enable-unsafe-swiftshader,--disable-gpu-compositing';
const OWNER_ENGINE = ['--no-sandbox', '--ozone-platform=x11', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--accept-lang=en-US,en', '--window-size=1920,1080', '--window-position=24,36', '--disable-features=OptimizationHints,MediaRouter,Translate,CalculateNativeWinOcclusion,HttpsUpgrades'];
const OWNER_ENGINE_K = OWNER_ENGINE.filter((x) => !x.startsWith('--ozone-platform')); // lane engine-spi-egress r2: the keeper owns the display platform
{
  ok(ENGN.ID_RE.source === require('../src/plugin-manifest.js').ID_RE.source, 'the engine id rule IS the manifest id rule (src/plugin-manifest.js ID_RE)');
  const P0 = { installed: true, executable: true, binaryPath: '/k/chrome', version: 'Chromium 150.0.7871.186', protocol: 1, kinds: ['js-dialog'], features: ['surfaces', 'webauthn'] };
  const pv = (body, status = 200) => ENGN.engineAnswerVerdict('probe', { status, body }, { id: EID, label: 'Kernel' });
  const lv = (body, status = 200) => ENGN.engineAnswerVerdict('launchOptions', { status, body }, { id: EID, label: 'Kernel' });
  const rowsP = [[P0, true], [{ ...P0, version: null }, true], [{ ...P0, protocol: 2 }, 'browser_engine_protocol'], [{ ...P0, features: ['webauthn'] }, true], [{ ...P0, installed: 'yes' }, 'browser_engine_protocol'], [{ ...P0, installed: false, executable: false }, true]];
  const badP = rowsP.filter(([b, want]) => { const r = pv(b); return want === true ? !r.ok : r.ok || r.code !== want; });
  ok(!badP.length && pv(P0, 500).code === 'browser_engine_protocol' && pv({ ...P0, version: null }).fact.version === null, 'a probe answer: version null is a FACT (ok, null), protocol ≠ 1 / another shape / HTTP 500 ⇒ browser_engine_protocol, a kernel not installed is a fact (the choice judges it); lane engine-spi-egress: no `surfaces` is a fact too (Chrome\'s dialog road)', badP);
  // B-a470: a plugin that answers with ITS OWN error is QUOTED — its code, its message, what Node denied it (the kernel side's
  // server.js answers a caught throw as 500 {error, code}); no error of its own ⇒ the generic sentence stands
  {
    const PL0 = require('../src/server/plugin-loader.js');
    const DEN = { error: 'Access to this API has been restricted. Use --allow-fs-read to manage permissions.', code: 'ERR_ACCESS_DENIED' };
    const fv = (E, status, body, verb = 'probe') => E.engineAnswerVerdict(verb, { status, body }, { id: EID, label: 'Kernel', denied: PL0.deniedWords });
    const fa = fv(ENGN, 500, { ...DEN, permission: 'FileSystemRead', resource: '/usr/bin/python3' });
    const ft = fv(ENGN, 500, { error: "Error: Access to this API has been restricted\n  code: 'ERR_ACCESS_DENIED',\n  permission: 'FileSystemRead',\n  resource: '/opt/x/bin/python3'", code: 'ERR_ACCESS_DENIED' });
    const fg = fv(ENGN, 503, { error: 'kernel index\nbroken', code: 'E_INDEX' }), fl = fv(ENGN, 500, { error: 'cannot resolve', code: 'E_RESOLVE' }, 'launchOptions');
    ok(fa.code === 'browser_engine_protocol' && fa.failed && fa.failed.code === 'ERR_ACCESS_DENIED' && fa.failed.resource === '/usr/bin/python3' && fa.failed.permission === 'FileSystemRead' && fa.failed.status === 500
      && fa.error.includes('failed its probe (HTTP 500 — ERR_ACCESS_DENIED: Access to this API has been restricted') && fa.error.includes(PL0.deniedWords({ permission: 'FileSystemRead', resource: '/usr/bin/python3' })) && /reads outside its own folder has a bug/.test(fa.error) && !/does not speak/.test(fa.error),
      'B-a470: a probe answered 500 {error, code: ERR_ACCESS_DENIED, permission, resource} ⇒ the refusal QUOTES the plugin (its code + message), says what Node denied it in the loader\'s own words (deniedWords) + the hint — never «does not speak this VibeSpace\'s engine protocol»', fa);
    ok(ft.failed.resource === '/opt/x/bin/python3' && ft.failed.permission === 'FileSystemRead' && ft.error.includes('of /opt/x/bin/python3') && !/\n/.test(ft.failed.message), '…Node\'s trace words in its message name the resource too (one line)', ft);
    ok(fg.failed && fg.failed.code === 'E_INDEX' && fg.failed.message === 'kernel index broken' && fg.error.includes("(HTTP 503 — E_INDEX: kernel index broken) — the plugin's own error") && !/denied/.test(fg.error) && fl.failed && fl.failed.code === 'E_RESOLVE' && fl.error.includes('failed its launch options (HTTP 500 — E_RESOLVE: cannot resolve)'),
      '…another error of its own is quoted as it is (its code + message, one line) — the launch verb too', { fg: fg.error, fl: fl.error });
    const cvF = ENGN.engineChoiceVerdict({ choice: { kind: 'plugin', id: EID }, engine: { code: fa.code, error: fa.error, failed: fa.failed } }), bvF = BB.browserChoiceVerdict({ choice: { kind: 'plugin', id: EID }, provider: 'chromium', by: 'user', engine: { code: fa.code, error: fa.error, failed: fa.failed } });
    ok(fa.failed.label === 'Kernel' && cvF.failed === fa.failed && bvF.failed === fa.failed && !bvF.ok, 'B-a470 (the review\'s MUST-FIX): the fact carries the engine\'s label, and BOTH choice verdicts (the engine\'s, the build\'s) carry `failed` on — every door\'s refusal can quote it', { cv: cvF.failed, bv: bvF.failed });
    ok(!pv(P0, 500).failed && /answered its probe with HTTP 500/.test(pv(P0, 500).error) && !pv({ ok: false }, 500).failed && !pv({ error: '  ' }, 500).failed && !lv({ code: 'no_binary' }, 409).failed, '…no error of its own (a body without error / code) ⇒ the generic sentence, no `failed`; the launch\'s 409 no_binary keeps its own code');
    const BMa = await import('../src/lib/browser-build-model.js');
    const zhA = (await import('../src/lib/i18n-zh.js')).default, jaA = (await import('../src/lib/i18n-ja.js')).default;
    const tA = (d) => (s, p) => String((d && d[s]) || s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
    const nA = BMa.engineNote({ id: EID, label: 'Kernel', code: fa.code, error: fa.error, failed: fa.failed }, tA(null));
    const nZ = BMa.engineNote({ id: EID, label: 'Kernel', code: fa.code, failed: { ...fa.failed, resource: null } }, tA(zhA));
    const nJ = BMa.engineNote({ id: EID, label: 'Kernel', code: fg.code, failed: fg.failed }, tA(jaA)), nOld = BMa.engineNote({ id: EID, label: 'Kernel', code: 'browser_engine_protocol' }, tA(null));
    const rwF = BMa.buildRefusalWords({ code: 'browser_engine_protocol', error: fa.error, failed: fa.failed }, tA(null));
    ok(rwF.includes('Kernel · its plugin was denied /usr/bin/python3') && !/another version/.test(rwF) && /another version/.test(BMa.buildRefusalWords({ code: 'browser_engine_protocol' }, tA(null))), 'B-a470: Change build… / New profile… / the restart doors (buildRefusalWords) quote the plugin\'s own error when the refusal carries it', rwF);
    ok(nA.includes('/usr/bin/python3, outside its own folder (ERR_ACCESS_DENIED) — a bug in the plugin') && nZ.includes('ERR_ACCESS_DENIED') && nZ.includes('文件夹之外') && nJ.includes('E_INDEX: kernel index broken') && nJ.includes('エラー') && /another version of the engine protocol/.test(nOld),
      'B-a470 THE CARD: the engine row\'s note quotes the plugin (en: the resource + the hint; zh with no resource; ja another error) — a refusal without the fact keeps its code\'s words', { nA, nZ, nJ });
    // CONTROL: a verdict that ignores the plugin's own error (the base's road) — the quote legs above go red
    const es0 = read('src/browser-engines.js');
    const qAnchor = "  const failedAs = (verbWord) => { const pe = pluginErrorOf(status, body);";
    ok(es0.includes(qAnchor), 'control setup (B-a470): the quote\'s line is where the control cuts');
    const MA = mutantCopies('badm-a470', REPO);
    const EQ = MA.load('src/browser-engines.js', editAnchor(es0, qAnchor, "  const failedAs = (verbWord) => { const pe = null;", "src/browser-engines.js"), 'no-quote');
    const qa = fv(EQ, 500, { ...DEN, permission: 'FileSystemRead', resource: '/usr/bin/python3' });
    ok(!qa.failed && !qa.error.includes('ERR_ACCESS_DENIED') && /does not speak this VibeSpace's engine protocol/.test(qa.error), 'CONTROL (B-a470): without the quote the 500 says the generic sentence — no code, no resource (RED for the legs above)', qa.error);
  }
  // B-cf42: an ENGINE profile's two answers about its kernel (the probe vs the running browser's VibeSpace.getVersion) — THE verdict,
  // the one For-you notice's words, the row's and the card's words (the owner's hub 2026-11-10: 13 of 13 answered «not a method»)
  {
    const KV = ENGN.kernelLiveVerdict, ALL3 = ['credentials', 'surfaces', 'webauthn'];
    const rowsK = [
      [{ probe: ['webauthn', 'surfaces', 'credentials'], live: ALL3, why: null }, null, 'the same features (any order) ⇒ they agree'],
      [{ probe: ALL3, live: [], why: 'no-method' }, 'standard', 'no VibeSpace.getVersion while the probe claims three ⇒ standard Chrome'],
      [{ probe: ['surfaces'], live: ALL3, why: null }, 'features', 'another feature list ⇒ features'],
      [{ probe: ALL3, live: [], why: 'no-surfaces' }, 'features', 'a kernel without `surfaces` (today\'s road, not «not a method») ⇒ features, never «standard Chrome»'],
      [{ probe: ['egress-allowlist'], live: [], why: 'no-surfaces' }, null, 'an egress-only engine (VibeSpace\'s own proxy, no kernel feature) ⇒ nothing to say'],
      [{ probe: [], live: [], why: 'no-method' }, null, 'a probe that claims no kernel feature ⇒ nothing to say'],
      [{ probe: ['surfaces', 'anti-bot'], live: ['surfaces'], why: null }, null, 'a word outside the kernel features is not compared'],
      [{ probe: ALL3, live: ['webauthn', 'credentials'], why: 'no-surfaces' }, 'features', 'a kernel that answered without `surfaces` says what it DID offer (the review: never «none»)'],
      [{ probe: ALL3, live: [], why: 'protocol' }, 'protocol', 'another kernel protocol ⇒ protocol'],
      [{ probe: ['egress-allowlist'], live: [], why: 'protocol' }, null, '…but not for an engine that claims no kernel feature'],
    ];
    const badK = rowsK.filter(([f, want]) => { const v = KV(f); return want === null ? v !== null : !v || v.why !== want; });
    ok(!badK.length && JSON.stringify(KV(rowsK[2][0])) === JSON.stringify({ why: 'features', probe: ['surfaces'], live: ALL3 }), 'B-cf42 THE VERDICT: ' + rowsK.map((r) => r[2]).join('; '), badK);
    const LW = BB.LIVE_KERNEL_WORDS || {};
    const ns = BB.liveKernelNotice({ engineLabel: 'Custom Browser Kernel', id: EID, version: '150.0.7871.186', verdict: KV(rowsK[1][0]) });
    const nf = BB.liveKernelNotice({ engineLabel: '', id: EID, version: null, verdict: KV(rowsK[3][0]) });
    ok(ns && ns.text === 'Custom Browser Kernel 150.0.7871.186 runs as standard Chrome: its browser does not answer as a VibeSpace kernel' && ns.detail.includes('offers credentials, surfaces, webauthn, but the running browser does not answer VibeSpace.getVersion') && ns.i18n.text.key === LW.standard && ns.i18n.detail[0].key === LW.standardDetail
      && nf.text === `${EID}: its running kernel offers none, but its plugin says credentials, surfaces, webauthn` && nf.i18n.text.params.live.key === LW.none && BB.liveKernelNotice({ verdict: null }) === null
      && BB.liveKernelNotice({ engineLabel: 'K', id: EID, verdict: KV(rowsK[8][0]) }).text === 'K: its running kernel speaks another VibeSpace kernel protocol, so VibeSpace uses none of what its plugin says it offers (credentials, surfaces, webauthn)',
      'B-cf42 THE NOTICE: «<engine> <version> runs as standard Chrome…» (its detail names what the plugin claims and that VibeSpace follows the running browser); another answer says both lists; its i18n keys are the table\'s («none» said in the client\'s language)', { ns, nf: nf.text });
    const BMk = await import('../src/lib/browser-build-model.js');
    const zhK = (await import('../src/lib/i18n-zh.js')).default, jaK = (await import('../src/lib/i18n-ja.js')).default;
    const tK = (d) => (s, p) => String((d && d[s]) || s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
    const KL = { engine: EID, version: '150', ...KV(rowsK[1][0]) }, KF = { engine: EID, version: '150', ...KV(rowsK[2][0]) };
    const cl = BMk.cardBuildLine({ choice: { kind: 'plugin', id: EID }, live: true, kernelLive: KL }, tK(null)), clZ = BMk.cardBuildLine({ choice: { kind: 'plugin', id: EID }, live: true, kernelLive: KF }, tK(zhK));
    const clOther = BMk.cardBuildLine({ choice: { kind: 'plugin', id: 'other.engine' }, live: true, kernelLive: KL }, tK(null)), clNone = BMk.cardBuildLine({ choice: { kind: 'plugin', id: EID }, live: true }, tK(null));
    ok(cl.warn === true && cl.text === `The custom kernel (${EID}) (pinned) · its running browser answers as standard Chrome, not as this kernel` && clZ.warn && clZ.text.includes('登录记录, 网页提示, 通行密钥') && clZ.text.includes('它的插件声称提供 网页提示')
      && !clOther.warn && !/standard Chrome/.test(clOther.text) && !clNone.warn, 'B-cf42 THE PANEL ROW: the profile\'s build line says its running kernel\'s answer (en; zh in its words) and warns; a mark for another engine / no mark says nothing', { cl, clZ: clZ.text });
    // B-cf42 cure (主开发 09:07Z): the row says the mark only while its browser RUNS (the engine card counts running browsers too)
    const clStopped = BMk.cardBuildLine({ choice: { kind: 'plugin', id: EID }, live: false, kernelLive: KL }, tK(null));
    ok(!clStopped.warn && clStopped.text === `The custom kernel (${EID}) (pinned)`, 'B-cf42 cure: a STOPPED engine profile\'s build line says no running-kernel answer (its card counts it as not running too)', clStopped);
    const bmSrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-build-model.js'), 'utf8');
    const bmCut = "  const lw = c.kind === 'plugin' && live && kernelLive && ";
    if (!bmSrc.includes(bmCut)) throw new Error('the anchor of the control «B-cf42 cure: the mark on a stopped row» is not in the source');
    const MCb = mutantCopies('browser-builds-cf42-cure', REPO);
    const BMs = await import(MCb.write('src/lib/browser-build-model.js', editAnchor(bmSrc, bmCut, "  const lw = c.kind === 'plugin' && kernelLive && ", "src/lib/browser-build-model.js"), 'mark-while-stopped', { esm: true }));   // stale-pins: kept — the base's line, written back by this RED control
    ok(BMs.cardBuildLine({ choice: { kind: 'plugin', id: EID }, live: false, kernelLive: KL }, tK(null)).warn === true, 'CONTROL (B-cf42 cure): the base\'s line warns on a stopped row (RED for the leg above)');
    const eRow = { id: EID, label: 'Kernel', installed: true, executable: true, version: '150', features: ALL3, live: { n: 13, ...KV(rowsK[1][0]) } };
    const en = BMk.engineNote(eRow, tK(null)), ej = BMk.engineNote(eRow, tK(jaK)), e0 = BMk.engineNote({ ...eRow, live: null }, tK(null));
    ok(en === `${e0} · 13 browser(s) on it: its running browser answers as standard Chrome, not as this kernel` && ej.includes('これを使うブラウザ 13 個') && ej.includes('標準の Chrome') && !/standard Chrome/.test(e0) && BMk.engineNote({ ...eRow, code: 'browser_engine_missing' }, tK(null)).indexOf('browser(s) on it') < 0,
      'B-cf42 THE ENGINE CARD: its note adds how many of its browsers answer otherwise and how (en; ja) — none without marks, none on a refused row', { en, ej });
    // CONTROL: a verdict that compares every feature word (egress-allowlist too) speaks for an egress-only engine — the table goes red
    const kAnchor = "  const side = (a) => [...new Set((Array.isArray(a) ? a : []).map(String).filter((f) => KERNEL_FEATURES.includes(f)))].sort();";
    const esK = read('src/browser-engines.js');
    ok(esK.includes(kAnchor), 'control setup (B-cf42): the verdict\'s kernel-feature filter is where the control cuts');
    const MK = mutantCopies('badm-cf42', REPO);
    const EK = MK.load('src/browser-engines.js', editAnchor(esK, kAnchor, "  const side = (a) => [...new Set((Array.isArray(a) ? a : []).map(String))].sort();", "src/browser-engines.js"), 'all-words');
    ok(EK.kernelLiveVerdict(rowsK[4][0]) !== null, 'CONTROL (B-cf42): a verdict comparing every word says an egress-only engine runs otherwise (RED for the table above)');
  }
  // lane engine-spi-egress: the features are a CLOSED set; `egress-allowlist` needs the manifest's RESERVED row (a string)
  const PE = { ...P0, features: ['egress-allowlist', 'anti-bot'] }, ROWS = [{ key: 'egressAllowlist', type: 'string', default: 'a.test', label: 'Sites' }];
  const pvS = (settings, body = PE) => ENGN.engineAnswerVerdict('probe', { status: 200, body }, { id: 'acme.engine', label: 'Acme', settings });
  const eOk = pvS(ROWS), eNone = pvS([]), eSel = pvS([{ key: 'egressAllowlist', type: 'select', default: 'a', options: [{ value: 'a', label: 'a' }] }]), eNum = pvS([{ key: 'egressAllowlist', type: 'number', default: 1 }]);
  const xk = pv({ ...P0, integrity: { verified: true, sha256: 'a'.repeat(64), verifiedAt: 1, pinned: '4a12bcde' }, vendor: { tier: 'free' } }); // L2's probe carries integrity.pinned
  ok(xk.ok && xk.fact.integrity.verified === true, 'an EXTRA key in a probe answer never refuses it (L2: `integrity.pinned`, any other) — the verdict reads the keys it knows', xk);
  ok(eOk.ok && eOk.fact.features.join() === 'egress-allowlist' && JSON.stringify(eOk.fact.egress) === JSON.stringify({ setting: 'plugin.acme.engine.egressAllowlist', default: 'a.test' }) && pv(P0).fact.egress === null
    && eNone.code === 'browser_engine_protocol' && /declares the "egress-allowlist" feature but its manifest has no "egressAllowlist" settings row of type string/.test(eNone.error) && eSel.code === 'browser_engine_protocol' && eNum.code === 'browser_engine_protocol' && ENGN.ENGINE_FEATURES.includes('egress-allowlist'),
    'V4 THE RESERVED ROW: `egress-allowlist` + a string row egressAllowlist ⇒ the fact names it (plugin.<id>.egressAllowlist, its default); the row missing / a select / a number ⇒ browser_engine_protocol BY NAME; a word outside ENGINE_FEATURES is dropped', { eOk, eNone: eNone.error });
  const eDrop = pvS(ROWS, { ...P0, features: ['surfaces'] });
  ok(eDrop.code === 'browser_engine_protocol' && /no longer declares the site list it was trusted with/.test(eDrop.error) && /never runs it outside its proxy/.test(eDrop.error) && pvS([], { ...P0, features: ['surfaces'] }).ok,
    'L2 acceptance (A) THE DOWNGRADE GUARD: a manifest that keeps the reserved row while its probe drops `egress-allowlist` ⇒ browser_engine_protocol BY NAME (never run unwrapped); an engine without the row is unaffected', eDrop.error);
  const CV = (engine) => ENGN.engineChoiceVerdict({ choice: { kind: 'plugin', id: 'acme.engine' }, engine: { ...engine, label: 'Acme' } });
  ok(CV(eOk.fact).ok && CV({ ...eOk.fact, egress: null }).code === 'browser_engine_protocol' && /never starts it unwrapped/.test(CV({ ...eOk.fact, egress: null }).error) && CV({ ...P0, features: [] }).ok,
    'the choice verdict: an egress engine whose fact lost its row is never started (browser_engine_protocol — never unwrapped); an engine with no features at all starts (Chrome\'s road)');
  const L0 = { executablePath: '/k/chrome', args: ['--x=1'], env: {} };
  const envR = lv({ ...L0, env: { LD_PRELOAD: '/x/evil.so' } });
  const PROXY_ARGS = ['--proxy-server=http://evil.test:8080', '--proxy-server', '--proxy-bypass-list=*', '--proxy-pac-url=http://x/p.pac', '--winhttp-proxy-resolver', '--no-proxy-server', '--proxy-auto-detect', '-proxy-server=http://evil.test:8080'];
  const prx = PROXY_ARGS.map((a) => [a, lv({ ...L0, args: ['--ok=1', a] })]).filter(([, r]) => r.ok || r.code !== 'browser_engine_protocol' || !/the browser's proxy is VibeSpace's to set/.test(r.error));
  const dbg1 = lv({ ...L0, args: ['-remote-debugging-port=9222'] });
  ok(!prx.length && lv({ ...L0, args: ['--proxy-serverx=1', '--my-proxy-server=1'] }).ok && dbg1.code === 'browser_engine_protocol' && /debugging endpoint and the profile's directory/.test(dbg1.error) && PROXY_ARGS.every((a) => ENGN.OWN_ARG_RE.test(a)), 'V1: a plugin naming a PROXY (--proxy-server / --proxy-bypass-list / --proxy-pac-url / --winhttp-proxy-resolver, and --no-proxy-server / --proxy-auto-detect that would undo one; a single-dash spelling too) ⇒ browser_engine_protocol by name — the boundary is VibeSpace\'s', prx.map(([a, r]) => [a, r.code || 'ok']));
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
  const leBase = ['--vibespace-keeper=bk-1', '--disable-blink-features=AutomationControlled', '--log-level=3'];
  const le = (() => { try { return ENGN.engineLaunchEnv({ args: ['--a=1,2', '--log-level=0', '--vibespace-keeper=forged'], env: { X: 'y' } }, { base: leBase }); } catch (e) { return e; } })();
  ok(le && le.AGENT_BROWSER_ARGS === '--vibespace-keeper=bk-1,--disable-blink-features=AutomationControlled' && Object.keys(le).length === 1 && ENGN.engineLaunchEnv({ args: ['--b'] }, { base: ['--m'] }).AGENT_BROWSER_ARGS === '--m' && !('AGENT_BROWSER_ARGS' in ENGN.engineLaunchEnv({ args: [] }, { base: ['--m'] })),
    'the launch view (lane engine-args-string r2): AGENT_BROWSER_ARGS carries ONLY the keeper\'s part — every name the engine gives leaves it (--log-level), the mark stays the keeper\'s — as ONE comma-separated line; an engine switch holding a comma throws nothing (it rides the wrapper); no arguments ⇒ no list (the config\'s stays); no env ever rides the driver (the wrapper exports it)', { le: le instanceof Error ? le.message : le });
  // ── lane engine-args-string (owner 2026-11-02: a conversation's browser on the custom kernel never started — its config held
  // `args` as a LIST: «invalid type: sequence, expected a string»): THE DRIVER'S `args`, ONE shape — PURE legs ──
  {
    const VB0 = require('../src/browser-verbs.js');
    const missing = (k) => () => { throw new Error(`src/browser-verbs.js has no ${k}`); };
    const VB = { ...VB0, ...Object.fromEntries(['driverArgsList', 'driverArgsText', 'mergeLaunchArgs'].map((k) => [k, typeof VB0[k] === 'function' ? VB0[k] : missing(k)])) };
    const BPRc = { ...BPR, configRefusalOf: typeof BPR.configRefusalOf === 'function' ? BPR.configRefusalOf : () => null };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const safe = (fn) => { try { return fn(); } catch (e) { return e; } };
    const driverReads = (line) => String(line).split(/[,\n]/).map((x) => x.trim()).filter(Boolean); // THE ORACLE: the driver's reading as measured on 0.38.2 (never the code under test)
    // the driver's reading, as MEASURED on agent-browser 0.38.2 (a dump-argv "chrome" launched with each config string)
    ok(safe(() => same(VB.driverArgsList('--a=1,--b=x y'), ['--a=1', '--b=x y']) && same(VB.driverArgsList('--a=1,2\n--b=x y'), ['--a=1', '2', '--b=x y']) && same(VB.driverArgsList(' --a=1 , --b ,,--c'), ['--a=1', '--b', '--c']) && same(VB.driverArgsList('--a="p,q"'), ['--a="p', 'q"']) && same(VB.driverArgsList('--a=1 --b=2'), ['--a=1 --b=2'])) === true,
      'the driver\'s reading (measured on 0.38.2): cut at EVERY comma and line break, each piece trimmed, empty ones dropped, no quoting, a space stays inside its switch');
    const L = ['--no-sandbox', '--use-angle=swiftshader', '--user-agent=Mozilla/5.0 (X11; Linux x86_64) VibeSpace', '--disk-cache-dir=/var/tmp/a b/cache', '--vibespace-keeper=bk-0000e0e1'];
    const T = safe(() => VB.driverArgsText(L));
    ok(T && T.ok && typeof T.args === 'string' && same(driverReads(T.args), L), 'THE ONE WRITER: a list → ONE string, read back by the driver\'s rule as the SAME switches (a space, an `=`, a path survive both ways)', T);
    const cut = safe(() => VB.driverArgsText(['--ok', '--enable-features=A,B', ' --pad', '', '--two\nlines']));
    ok(cut && cut.ok === false && cut.code === 'browser_args_uncarried' && same(cut.bad, ['--enable-features=A,B', ' --pad', '', '--two\nlines']) && /"--enable-features=A,B"/.test(cut.error),
      'a switch the one line cannot carry back as itself (a comma, a blank at an end, nothing, a line break) is REFUSED by name — never dropped, never split', cut);
    ok(safe(() => VB.driverArgsText('--a,--b\n--c').args === '--a,--b\n--c' && VB.driverArgsText(undefined).ok && VB.driverArgsText(undefined).args === undefined && !VB.driverArgsText({ a: 1 }).ok) === true,
      'a string is the driver\'s shape already — kept byte for byte (a running browser launched with that spelling); nothing ⇒ nothing; another type refused');
    // THE SPLIT (r2): the owner's switches — the keeper's line from their base config, the custom kernel's own (the four holding a
    // comma read from their engine config by 主开发, 2026-11-02) — one switch per name, the keeper's part rides the driver's line,
    // the engine's the wrapper
    const so = safe(() => VB.splitLaunchArgs(OWNER_KEEPER_LINE, OWNER_ENGINE));
    const names = (l) => l.map((x) => (x.startsWith('-') && x.includes('=') ? x.slice(0, x.indexOf('=')) : x));
    // lane engine-spi-egress r2 (the hotfix verifier's rule b): the display platform is the KEEPER's — the engine's --ozone-platform
    // copy is dropped (the keeper's line names the owner's x11 pin), so the engine's part is the owner's switches without it
    ok(so && same(so.keeper, ['--disable-blink-features=AutomationControlled', '--vibespace-keeper=bk-209f474e', '--ozone-platform=x11', '--disable-gpu-compositing']) && same(so.engine, OWNER_ENGINE_K) && new Set(names([...so.keeper, ...so.engine])).size === so.keeper.length + so.engine.length && same(safe(() => VB.mergeLaunchArgs(OWNER_KEEPER_LINE, OWNER_ENGINE)), [...so.keeper, ...so.engine]),
      'THE SPLIT over the owner\'s switches: every name once — the engine\'s own (--no-sandbox / --use-angle / --enable-unsafe-swiftshader, the four holding a comma) ride the ENGINE\'s part whole, the keeper\'s part keeps the rest (the mark, the automation flag, the display platform — r2: the keeper\'s alone —, --disable-gpu-compositing); merge = keeper then engine', so);
    const sk = safe(() => VB.splitLaunchArgs(['--vibespace-keeper=bk-1', '--ozone-platform=x11'], ['--ozone-platform=wayland', '-vibespace-keeper=forged', '-remote-debugging-port=9222', '-user-data-dir=/x', '-profile-directory=Y', '--proxy-pac-url=http://p', '-use-angle=gl']));
    ok(sk && same(sk.keeper, ['--vibespace-keeper=bk-1', '--ozone-platform=x11']) && same(sk.engine, ['-use-angle=gl']),
      'lane engine-spi-egress r2 (the hotfix verifier\'s rules b + c): the KEEPER owns the display platform (an engine naming wayland never undoes the x11 pin) and every proxy switch; a SINGLE-dash spelling is the same name (`-vibespace-keeper` / `-remote-debugging-port` / `-user-data-dir` / `-profile-directory` dropped like their double-dash form — they would land last and win)', sk);
    const sr = safe(() => VB.splitLaunchArgs(['--vibespace-keeper=bk-1', '--remote-debugging-port=0', '--use-angle=swiftshader', '--log-level=3'], ['--vibespace-keeper=forged', '--remote-debugging-port=9222', '--use-angle=gl', '--log-level=0', '--use-angle=vulkan']));
    ok(sr && same(sr.keeper, ['--vibespace-keeper=bk-1', '--remote-debugging-port=0']) && same(sr.engine, ['--use-angle=vulkan', '--log-level=0']),
      'THE RULE on one name, two values: the KEEPER\'s alone for its control switches (RAW_ARG_RE — the mark, the debugging endpoint: the engine\'s copy dropped), the ENGINE\'s for every other (its LAST spelling, at its first place — Chromium reads the last value; the keeper\'s copy leaves its part)', sr);
    const nul = lv({ ...L0, args: ['--a\0b'] });
    const padV = lv({ ...L0, args: [' --pad '] }); // lane engine-spi-egress L1b r4: a blank at an END is refused (Chromium trims it, then reads the switch)
    ok(lv({ ...L0, args: OWNER_ENGINE }).ok && lv({ ...L0, args: ['--pad=a  b', "--q=it's"] }).ok && padV.code === 'browser_engine_protocol' && /starts or ends with whitespace/.test(String(padV.error)) && nul.code === 'browser_engine_protocol' && lv({ ...L0, args: ['--a\n--b'] }).code === 'browser_engine_protocol',
      'the launch verdict refuses only what no road carries whole — a NUL byte, a line break (the one-line rule) — and (L1b r4) a blank at an END (Chromium trims « --x» into --x); the owner\'s comma switches, blanks INSIDE a value, a quote pass (they ride the wrapper)', { nul, padV: padV.error });
    const wt = safe(() => ENGN.engineWrapperText({ program: '/k/chr ome', args: ["--q=it's", '--w=1,2'], env: { VS_PROBE: 'a b' } }));
    ok(wt && wt.ok && /^#!\/bin\/sh\n/.test(wt.text) && wt.text.includes("export VS_PROBE='a b'\n") && wt.text.includes(`exec '/k/chr ome' "$@" '--q=it'\\''s' '--w=1,2'\n`) && !ENGN.engineWrapperText({ program: 'chrome' }).ok && !ENGN.engineWrapperText({ program: '/k/c', args: ['a\0b'] }).ok && !ENGN.engineWrapperText({ program: '/k/c', env: { 'A B': 'x' } }).ok,
      'THE WRAPPER\'s text: POSIX sh, the env as exports, `exec \'<kernel>\' "$@" \'<switch>\'…` — every word single-quoted (a \' as \'\\\'\'); refused by name: a relative program, a NUL, an env name that is no shell name', wt);
    // the driver's refusal of a config, in VibeSpace's words (the owner saw the raw serde line)
    const raw = '⚠ invalid config file /d/browser-env/display/bk-1-engine-2.json: invalid type: sequence, expected a string at line 2 column 10\n⚠ failed to load config from /d/browser-env/display/bk-1-engine-2.json';
    const cr = BPR.launchFatalOf(raw, { lineOf: (f, n) => (f === '/d/browser-env/display/bk-1-engine-2.json' && n === 2 ? '  "args": [' : null) });
    const cr0 = BPRc.configRefusalOf(raw);
    ok(cr && cr.reason === 'config_refused' && /the setting "args"/.test(cr.error) && /holds a list where the driver expects a string/.test(cr.error) && /bk-1-engine-2\.json/.test(cr.error) && !/\/d\//.test(cr.error) && cr0 && /line 2 of bk-1-engine-2\.json/.test(cr0.error) && BPRc.configRefusalOf('Chrome exited early') === null,
      'the driver REFUSING our config is said in VibeSpace\'s words: WHICH setting (the key on the line it names) and WHY (a list where it expects a string), the file by name — never a path; no line reader ⇒ the line number', { cr, cr0 });
  }
  const D = ENGN.defaultEngineOf;
  const FE = { plugin: EID, default: true };
  ok(D({ own: 'default', fleet: FE }).source === 'user' && D({ own: 'default', fleet: FE }).value === 'default' && D({ fleet: FE }).value === 'plugin:' + EID && D({ fleet: FE }).source === 'fleet' && D({ fleet: { plugin: EID, default: false } }).value === 'default' && D({ fleet: { plugin: EID, default: false } }).source === 'fleet'
    && D({}).value === 'default' && JSON.stringify(ENGN.choiceOfDefault('plugin:' + EID)) === JSON.stringify(c) && ENGN.choiceOfDefault('default') === null,
    'THE POLICY: the user\'s own value › the fleet\'s (default true ⇒ the plugin, false ⇒ Chrome — said «set by the cluster preset») › \'default\'');
  const dO = D({ own: 'plugin:other.engine', fleet: FE });
  ok(dO.value === 'plugin:other.engine' && dO.source === 'user' && ['plugin:Bad.Id', 'plugin:nodot', 'chrome', 'plugin:', 3].every((v) => D({ own: v }).source === 'default') && JSON.stringify(ENGN.choiceOfDefault('plugin:other.engine')) === JSON.stringify({ kind: 'plugin', id: 'other.engine' }),
    'V6 ids DERIVED: \'plugin:<any id>\' (the manifest id rule) is the user\'s value — an engine not installed is a FACT, never a refusal; another shape is none', dO);
  const BMe = await import('../src/lib/browser-build-model.js');
  const tE = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
  const opts = (BMe.engineOptions || (() => []))({ engines: [{ id: 'acme.engine', label: 'Acme Browser', installed: true }, { id: EID, label: 'Kernel', code: 'browser_engine_unanswered' }], defaultEngine: { value: 'plugin:gone.engine', source: 'user' } }, 'plugin:gone.engine', tE);
  const factAbsent = BMe.engineFactText({ engines: [], defaultEngine: { value: 'plugin:gone.engine', source: 'user', fleet: null } }, tE);
  ok(JSON.stringify(opts.map((o) => o.value)) === JSON.stringify(['default', 'plugin:acme.engine', 'plugin:' + EID, 'plugin:gone.engine']) && opts[1].label === 'Acme Browser (browser engine plugin)' && /gone\.engine — its plugin is not running/.test(opts[3].label)
    && /That browser engine plugin is not running on this computer/.test(factAbsent) && /Your choice:/.test(factAbsent) && BMe.engineOptions(null, 'default', tE).length === 1,
    'THE ROW\'S OPTIONS follow the engine table (Chrome + one per engine, by its label; the stored value kept and said «not running» when its engine is not here) — the fact line says it, never refuses it', { opts, factAbsent });
  const mn = BB.missingNotice({ label: 'K', choice: c, code: 'browser_engine_kernel_missing', engineLabel: 'Custom Browser Kernel' });
  ok(/"K" cannot start: the Custom Browser Kernel engine's kernel is not installed/.test(mn.text) && /never switches it to Chrome by itself/.test(mn.detail) && !/\/k\//.test(mn.text + mn.detail), 'the vanished kernel\'s ONE For-you notice says what is missing and the way out — never a path', mn);
}
// ── lane engine-args-string r2: THE WRAPPER ROAD over the REAL browser-display-config (the keeper's writer) and a real `sh` — the
// owner's switches (their base config's line + the custom kernel's own) reach an argv-recording program verbatim, once, in order ──
{
  const DCm = require('../src/server/browser-display-config.js');
  const VB = require('../src/browser-verbs.js');
  const WD = path.join(ROOT, 'engine-wrap'); fs.mkdirSync(WD, { recursive: true });
  const dc = DCm.create({ dir: path.join(WD, 'display'), writeJson: (f, o) => { fs.writeFileSync(f + '.t', JSON.stringify(o, null, 2)); fs.renameSync(f + '.t', f); }, log: { log() { }, warn() { } } });
  const STUB = path.join(WD, 'record-argv'), OUT = path.join(WD, 'argv.bin');
  fs.writeFileSync(STUB, '#!/bin/sh\nprintf \'%s\\0\' "$@" > "$STUB_OUT"\nprintf \'%s\' "${VS_PROBE-}" > "$STUB_OUT.env"\n', { mode: 0o755 });
  const runAs = (prog, argv) => { fs.rmSync(OUT, { force: true }); execFileSync(prog, argv, { env: { PATH: '/usr/bin:/bin', STUB_OUT: OUT } }); const raw = fs.readFileSync(OUT, 'utf8'); return { argv: raw ? raw.replace(/\0$/, '').split('\0') : [], env: fs.readFileSync(OUT + '.env', 'utf8') }; };
  const driverReads = (line) => String(line).split(/[,\n]/).map((x) => x.trim()).filter(Boolean); // the driver's reading, measured on 0.38.2
  const has = typeof dc.engineWrapperFor === 'function';
  ok(has, 'browser-display-config writes THE ENGINE\'S WRAPPER (engineWrapperFor) — the program the driver starts on an engine launch');
  if (has) {
    const base = path.join(WD, 'base.json'); fs.writeFileSync(base, JSON.stringify({ headed: false, noAutoDialog: true, args: OWNER_KEEPER_LINE }));
    const eng = VB.splitLaunchArgs([], OWNER_ENGINE).engine;
    const w = dc.engineWrapperFor('bk-209f474e', { program: STUB, args: eng, env: {} });
    const cfgFile = dc.engineFileFor(base, { executablePath: w.file, args: eng });
    let cfg = null; try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { cfg = null; }
    // lane engine-spi-egress r2 (the hotfix verifier's merge note 1): a WRAPPED view (its proxy rides the wrapper) is FAIL-CLOSED —
    // a program that is not the keeper's wrapper ⇒ refused (the call never runs outside its proxy); the base file's proxy switches go
    const pxS = ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'];
    const baseP = path.join(WD, 'base-proxy.json'); fs.writeFileSync(baseP, JSON.stringify({ args: '--disable-gpu-compositing,--proxy-pac-url=http://pac.test/p.pac,--no-proxy-server' }));
    const wP = dc.engineWrapperFor('bp-wrapped01', { program: STUB, args: [...eng, ...pxS], env: {} });
    const eFC = await thr(async () => dc.engineFileFor(baseP, { executablePath: STUB, args: [...eng, ...pxS], wrapped: true }));
    let cfgP = null; try { cfgP = JSON.parse(fs.readFileSync(dc.engineFileFor(baseP, { executablePath: wP.file, args: [...eng, ...pxS], wrapped: true }), 'utf8')); } catch { cfgP = null; }
    ok(eFC && eFC.code === 'egress_proxy_missing' && /never run outside its proxy/.test(eFC.message) && cfgP && cfgP.executablePath === wP.file && cfgP.args === '--disable-gpu-compositing',
      'lane engine-spi-egress r2: a WRAPPED view whose program is not the keeper\'s wrapper ⇒ REFUSED (fail-closed — never named without its proxy); with the wrapper: the config\'s line keeps no proxy switch of the base file (a pac url / no-proxy outrank --proxy-server)', { e: eFC && eFC.message, cfgP });
    const st = w.ok ? fs.lstatSync(w.file) : null;
    ok(w.ok && w.file === path.join(WD, 'display', 'engine-bk-209f474e.sh') && st.isFile() && (st.mode & 0o777) === 0o700 && cfg && cfg.executablePath === w.file && typeof cfg.args === 'string' && driverReads(cfg.args).every((x) => !x.includes(',')),
      'the wrapper: `engine-<profile>.sh` in the keeper\'s own display dir (never /tmp — the keeper\'s data dir), a regular file 0700; the derived config names it as the program, its `args` ONE comma-free line', { w, cfg, mode: st && (st.mode & 0o777).toString(8) });
    const run = cfg ? runAs(cfg.executablePath, driverReads(cfg.args)) : { argv: [] };
    const want = ['--disable-blink-features=AutomationControlled', '--vibespace-keeper=bk-209f474e', '--ozone-platform=x11', '--disable-gpu-compositing', ...OWNER_ENGINE_K]; // r2: the display platform the keeper's
    const nm = (x) => (x.startsWith('-') && x.includes('=') ? x.slice(0, x.indexOf('=')) : x);
    ok(JSON.stringify(run.argv) === JSON.stringify(want) && new Set(run.argv.map(nm)).size === run.argv.length && OWNER_ENGINE_K.filter((x) => x.includes(',')).every((x) => run.argv.includes(x)),
      `the owner's switches reach the program VERBATIM, ONCE, in order — the keeper's (the driver's reading of the line) then the engine's; --accept-lang=en-US,en, --window-size=1920,1080, --window-position=24,36, --disable-features=… whole (${run.argv.length} switches)`, { got: run.argv, want });
    const odd = ["--lang-label=it's \"quoted\" $HOME `x` \\n", '--padded=a  b   c']; // L1b r4: blanks INSIDE survive whole; one at an END is refused (below)
    const wq = dc.engineWrapperFor('q-1', { program: STUB, args: odd, env: { VS_PROBE: 'a b  c' } });
    const rq = wq.ok ? runAs(wq.file, ['--from-driver']) : { argv: [], env: '' };
    const wpad = ENGN.engineWrapperText({ program: STUB, args: [' padded '] }) || {};
    ok(JSON.stringify(rq.argv) === JSON.stringify(['--from-driver', ...odd]) && rq.env === 'a b  c' && wpad.ok === false && /starts or ends with whitespace/.test(String(wpad.error)), 'a single quote, a double quote, $, a backtick, a backslash, blanks inside a value — each argument survives whole; an env value with spaces survives its export; (L1b r4) an argument with a blank at an END is refused by the wrapper writer', { rq, wpad: wpad.error });
    const ino0 = fs.statSync(wq.file).ino, m0 = fs.statSync(wq.file).mtimeMs;
    const same1 = dc.engineWrapperFor('q-1', { program: STUB, args: odd, env: { VS_PROBE: 'a b  c' } });
    const ino1 = fs.statSync(wq.file).ino;
    const changed = dc.engineWrapperFor('q-1', { program: STUB, args: ['--other=1,2'], env: {} });
    const rc = changed.ok ? runAs(changed.file, []) : { argv: [] };
    const left = fs.readdirSync(path.join(WD, 'display')).filter((f) => f.includes('.tmp'));
    ok(same1.ok && same1.file === wq.file && ino1 === ino0 && fs.statSync(wq.file).mtimeMs >= m0 && changed.file === wq.file && JSON.stringify(rc.argv) === '["--other=1,2"]' && fs.statSync(wq.file).ino !== ino0 && !left.length,
      'RE-WRITTEN when the engine\'s switches change, under the SAME name (one wrapper per profile; an unchanged text is not touched — same inode), through a temporary file renamed over it (a new inode, nothing left beside it)', { ino0, ino1, left });
    const target = path.join(WD, 'not-ours.txt'); fs.writeFileSync(target, 'theirs');
    fs.symlinkSync(target, path.join(WD, 'display', 'engine-q-2.sh'));
    const wl = dc.engineWrapperFor('q-2', { program: STUB, args: ['--x'] });
    ok(wl.ok && !fs.lstatSync(wl.file).isSymbolicLink() && fs.readFileSync(target, 'utf8') === 'theirs', 'a link planted at the wrapper\'s name is replaced, never followed (its target untouched)');
    dc.dropEngineWrapper('q-1'); dc.dropEngineWrapper('q-2'); dc.dropEngineWrapper('../escape');
    ok(!fs.existsSync(wq.file) && !fs.existsSync(wl.file) && fs.existsSync(target) && !dc.engineWrapperFor('../x', { program: STUB }).ok, 'dropEngineWrapper removes it (the keeper\'s removeProfile); a name that is no file name is refused, never a path');
  }
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
  const keeperArgs = String(la.args || '').split(/[,\n]/), wr = la.exe ? wrapperOf(la.exe) : null, args = [...keeperArgs, ...((wr && wr.args) || [])];
  ok(kernelOf(la.exe) === KP && la.exe !== KP && cs.length >= 2 && cs.every((c) => c.exe === la.exe), `the engine's kernel rides EVERY call of the browser's own session (${cs.map((c) => c.verb).join(' · ')}) — AGENT_BROWSER_EXECUTABLE_PATH, the build pin's road: the keeper's WRAPPER over the kernel (lane engine-args-string r2)`, { la, cs });
  ok(args.includes('--vibespace-engine=fixture') && args.includes(`--vibespace-profile=${pe.id}`) && args.includes(BPR.keeperMarkArg(pe.id)) && args.includes('--disable-blink-features=AutomationControlled') && args.some((a) => /^--log-level=/.test(a) || /^--disable-logging/.test(a) || /^--v=/.test(a) || /enable-logging/.test(a))
    && !keeperArgs.includes('--vibespace-engine=fixture') && wr && wr.args.includes('--vibespace-engine=fixture'),
    'its launch arguments: AGENT_BROWSER_ARGS carries what the config\'s list carried (the keeper\'s mark, the automation flag) and the quiet switches; the ENGINE\'s ride the wrapper, never the driver\'s text', { keeperArgs, wrapper: wr && wr.args });
  const rc = ke._reg().browsers[pe.id].browserChoice;
  ok(rc && rc.kind === 'plugin' && rc.id === EID && rc.version === KVER, 'the browser record says what this launch was asked to run: {kind:\'plugin\', id, version} (the probe\'s version)', rc);
  await ke.stop(pe.id, { why: 'user' });
  // B-9584 r3946 MUST 1: THE LAUNCH RECORDS WHAT ITS PROBE SAID — through a REAL launch of the fixture engine: the release's probe (no
  // field) ⇒ the record says false; its probe stating geolocationIsolated (mode.json) ⇒ the running browser's record says true and the
  // profile may say «cannot leak» while it runs. RED: a keeper whose launch return drops the fact
  {
    const isoLaunch = async (K2, pid) => { setMode({ probe: { geolocationIsolated: true } }); try { await K2.start(pid, { why: 'test' }); const r2 = K2._reg().browsers[pid].browserChoice; const v2 = K2.placeIsolatedFor(pid); await K2.stop(pid, { why: 'user' }); return { rec: r2 ? r2.geolocationIsolated : undefined, verdict: v2 }; } finally { setMode(null); } };
    const g1 = await isoLaunch(ke, pe.id);
    ok(rc.geolocationIsolated === false && g1.rec === true && g1.verdict === true, '⑦ B-9584 r3946: a REAL launch records what its probe said of the place — the release\'s kernel (no field) false, a probe stating geolocationIsolated true; and while that browser runs, its profile may say «cannot leak»', { first: rc.geolocationIsolated, g1 });
    const kSrcI = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const MCi = mutantCopies('browser-builds-launch-iso', REPO);
    const KI = MCi.load('src/server/browser-keeper.js', editAnchor(kSrcI, 'label: engine.label || null, geolocationIsolated: engine.geolocationIsolated === true }', 'label: engine.label || null }', 'src/server/browser-keeper.js'), 'launch-drops-iso');
    const kI = mkKeeper(path.join(ROOT, 'data-eng-iso'), { engines: ENGR, serverSetting: (k) => settingsE[k], fleetFacts: () => fleetE, liveKeys: () => new Set([KEY_A, KEY_E]) }, KI);
    const pI = kI.createProfile({ label: 'Kernel iso', browser: { kind: 'plugin', id: EID } }, { engine: await kI.engineFactOf(EID) });
    const gR = await isoLaunch(kI, pI.id);
    ok(gR.rec === false && gR.verdict === false, '⑦ RED (B-9584 r3946) — a launch whose return drops the probe\'s fact records false: «cannot leak» is never said while a patched browser runs', gR);
  }
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
  ok(!ke.profile(pe.id).buildMissing && kernelOf(fake.launches().at(-1).exe) === KP, 'the kernel back ⇒ it starts, the mark clears by itself');
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
  // B-a470 over the REAL loader + the fixture's IPC child: its probe answers 500 with its own error ⇒ quoted on every road
  setMode({ probeStatus: 500, probeBody: { error: 'Access to this API has been restricted. Use --allow-fs-read to manage permissions.', code: 'ERR_ACCESS_DENIED', permission: 'FileSystemRead', resource: '/usr/bin/python3' } });
  const prF = await ENGR.probe(EID), efF = await ke.engineFactOf(EID), rvF = (await ke.engineRowsView()).find((r) => r.id === EID);
  const esF = await thr(() => ke.start(pe.id, { why: 'test' }));
  ok(!prF.ok && prF.failed && prF.failed.resource === '/usr/bin/python3' && /ERR_ACCESS_DENIED: Access to this API/.test(prF.error) && /denied file system read of \/usr\/bin\/python3/.test(prF.error)
    && efF.failed && efF.failed.code === 'ERR_ACCESS_DENIED' && rvF && rvF.failed && rvF.failed.resource === '/usr/bin/python3' && esF && esF.code === 'browser_engine_protocol' && /ERR_ACCESS_DENIED/.test(esF.message) && esF.failed && esF.failed.resource === '/usr/bin/python3',
    'B-a470 over the real loader: the fixture\'s probe answering 500 {error, code, permission, resource} ⇒ the registry quotes it (deniedWords), the keeper\'s fact and the engines view carry `failed`, a start is refused naming ERR_ACCESS_DENIED', { prF: prF.error, esF: esF && esF.message });
  // B-a470 cure (主开发 09:07Z): what an AGENT's caller is answered on that refusal carries no absolute path of the hub — the
  // plugin's code and words stay; `resource` goes, from the field and from the sentence. The owner's own road keeps it
  {
    const RB = require('../src/routes/browser.js');
    const fres = (p) => ({ req: { path: p }, locals: {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
    const answer = (Rm, p) => { const r = fres(p); Rm.fail(r, esF); return r.body || {}; };
    const ag = answer(RB, '/api/agent/browser/start'), ow = answer(RB, '/api/browser/profiles/x/start');
    ok(esF && esF.failed && esF.failed.resource === '/usr/bin/python3' && ag.failed && ag.failed.code === 'ERR_ACCESS_DENIED' && !('resource' in ag.failed) && !String(ag.error).includes('/usr/bin/python3') && String(ag.error).includes(RB.AGENT_PATH_WORDS) && /ERR_ACCESS_DENIED/.test(ag.error)
      && ow.failed && ow.failed.resource === '/usr/bin/python3' && String(ow.error).includes('/usr/bin/python3'),
      'B-a470 cure: an agent\'s start refusal quotes the plugin\'s own error WITHOUT the hub\'s path (neither the field nor the sentence); the owner\'s road keeps it', { ag, ow: ow.error });
    const rSrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
    const rCut = "{ failed: agentRoad ? agentFailed(e.failed) : e.failed }";
    if (!rSrc.includes(rCut)) throw new Error('the anchor of the control «B-a470 cure: the agent\'s path» is not in the source');
    const MCr = mutantCopies('browser-builds-a470-cure', REPO);
    const RBm = MCr.load('src/routes/browser.js', editAnchor(rSrc, rCut, '{ failed: e.failed }', "src/routes/browser.js"), 'agent-gets-path');   // stale-pins: kept — the base's line, written back by this RED control
    ok(answer(RBm, '/api/agent/browser/start').failed.resource === '/usr/bin/python3', 'CONTROL (B-a470 cure): the base\'s answer hands the agent the hub\'s path (RED for the leg above)');
  }
  setMode(null);
  if (ke.profile(pe.id).buildMissing) { await ke.start(pe.id, { why: 'test' }); await ke.stop(pe.id, { why: 'user' }); } // clear the mark the two refusals above left
  // B-cf42 THE REAL KEEPER: the dialog watch's answer (noteEngineLive) marks the profile, files ONE For-you item per engine version,
  // the engines view counts the marks; an agreeing answer clears it
  {
    const ALL3 = ['credentials', 'surfaces', 'webauthn'], STD = { engine: EID, version: KVER, label: 'Fixture Browser Engine', why: 'no-method', probe: ALL3, live: [] };
    const tL = todos.length;
    const m1 = ke.noteEngineLive(pe.id, STD), m1b = ke.noteEngineLive(pe.id, STD);
    const pe2 = ke.createProfile({ label: 'Kernel two', browser: { kind: 'plugin', id: EID } }, { engine: await ke.engineFactOf(EID) });
    const m2 = ke.noteEngineLive(pe2.id, STD);
    await ke.stop(pe.id, { why: 'user' }).catch(() => { }); await ke.stop(pe2.id, { why: 'user' }).catch(() => { });   // none running: the card counts none
    const rv0 = (await ke.engineRowsView()).find((r) => r.id === EID);
    await ke.start(pe.id, { why: 'test' }); await ke.start(pe2.id, { why: 'test' }); // the card counts RUNNING browsers
    const rv2 = (await ke.engineRowsView()).find((r) => r.id === EID);
    const items = todos.slice(tL);
    ok(m1 && m1.why === 'standard' && m1.filed && ke.profile(pe.id).kernelLive && ke.profile(pe.id).kernelLive.why === 'standard' && m2 && m2.filed && items.length === 1 && /^Fixture Browser Engine Chromium 150\.0\.7871\.186 vibespace-fake-kernel runs as standard Chrome/.test(items[0].text) && items[0].i18n && items[0].i18n.text.key === BB.LIVE_KERNEL_WORDS.standard && items[0].origin === 'browser'
      && rv2 && rv2.live && rv2.live.n === 2 && rv2.live.why === 'standard' && rv0 && !rv0.live,
      'B-cf42: the answer marks the profile (kernelLive), ONE For-you item for the engine version — a second answer and a SECOND profile on the same version file none; the engines view counts both marks while their browsers run (none while stopped)', { items: items.map((x) => x.text), live: rv2 && rv2.live });
    const tV = todos.length;
    ke.noteEngineLive(pe2.id, { ...STD, version: KVER + '.1' });
    ok(todos.length === tV + 1 && ke.profile(pe2.id).kernelLive.version === KVER + '.1', '…another engine version is its own item', todos.slice(tV).map((x) => x.text));
    const agree = ke.noteEngineLive(pe.id, { ...STD, why: null, live: ALL3 });
    const rv1 = (await ke.engineRowsView()).find((r) => r.id === EID);
    const offE = ke.noteEngineLive(pe.id, { ...STD, engine: 'other.engine' });
    ok(agree === null && !ke.profile(pe.id).kernelLive && rv1.live && rv1.live.n === 1 && offE === null && !ke.profile(pe.id).kernelLive && ke.noteEngineLive('bp-nosuch00', STD) === null,
      '…an agreeing answer clears the mark (the view counts one); an answer for another engine than the profile runs, or no such profile, marks nothing', { rv1: rv1.live });
    // the review: a profile that LEFT the engine (Change build… to Chrome) is counted no more, and its next answer drops the mark
    ke.noteEngineLive(pe.id, STD);
    const rec2 = ke._reg().profiles.find((x) => x.id === pe2.id); const was2 = rec2.browser; rec2.browser = { kind: 'default' };
    const rvL = (await ke.engineRowsView()).find((r) => r.id === EID);
    const gone = ke.noteEngineLive(pe2.id, STD);
    ok(rvL.live && rvL.live.n === 1 && gone === null && !ke.profile(pe2.id).kernelLive && ke.profile(pe.id).kernelLive, '…a profile that left the engine is not counted, and its next answer drops its mark (the other\'s stays)', { live: rvL.live });
    rec2.browser = was2;
    ke.noteEngineLive(pe.id, { ...STD, why: null, live: ALL3 });
    await ke.stop(pe.id, { why: 'user' }).catch(() => { }); await ke.stop(pe2.id, { why: 'user' }).catch(() => { });
    await ke.removeProfile(pe2.id);
    // B-cf42 cure (主开发 09:07Z): an engine version's notice is RESOLVED when the LAST mark of that engine and version clears —
    // one profile agreeing while another still answers otherwise leaves it open; the last one leaving (removed) resolves it;
    // a lone mark cleared by agreement resolves its own
    const cureRun = async (kx) => {
      const SX = { ...STD, version: KVER + '.9' }, SY = { ...STD, version: KVER + '.8' };
      const fact = await kx.engineFactOf(EID);
      const pa = kx.createProfile({ label: 'Kernel A', browser: { kind: 'plugin', id: EID } }, { engine: fact }), pb = kx.createProfile({ label: 'Kernel B', browser: { kind: 'plugin', id: EID } }, { engine: fact });
      const t0 = todos.length, d0 = todoDone.length;
      kx.noteEngineLive(pa.id, SX); kx.noteEngineLive(pb.id, SX);
      const idX = todos.length === t0 + 1 ? 'u' + todos.length : null;
      kx.noteEngineLive(pa.id, { ...SX, why: null, live: ALL3 });
      const openWhileB = todoDone.length === d0;
      await kx.removeProfile(pb.id).landing;   // lane lg-store-writes (the deferred-save census): the engine mark clears at the removal's landing
      const doneX = todoDone.slice(d0);
      kx.noteEngineLive(pa.id, SY); const idY = 'u' + todos.length; const d1 = todoDone.length;
      kx.noteEngineLive(pa.id, { ...SY, why: null, live: ALL3 });
      const doneY = todoDone.slice(d1);
      await kx.removeProfile(pa.id).landing;
      return { idX, openWhileB, doneX, idY, doneY };
    };
    const cr = await cureRun(ke);
    ok(cr.idX && cr.openWhileB && cr.doneX.length === 1 && cr.doneX[0].id === cr.idX && cr.doneX[0].st === 'done' && cr.doneX[0].by === 'kernel-answers-again' && cr.doneY.length === 1 && cr.doneY[0].id === cr.idY,
      'B-cf42 cure: the version\'s ONE notice stays open while any profile still answers otherwise and is resolved when the last mark clears (its profile removed; a lone mark cleared by agreement)', cr);
    const kSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const kCut = "  function markCleared(m, p) {\n    if (!m || !m.noticeId) return;\n";
    if (!kSrc.includes(kCut)) throw new Error('the anchor of the control «B-cf42 cure: the notice left open» is not in the source');
    const MCk = mutantCopies('browser-builds-cf42-notice', REPO);
    const Kn = MCk.load('src/server/browser-keeper.js', editAnchor(kSrc, kCut, "  function markCleared(m, p) {\n    return;\n", "src/server/browser-keeper.js"), 'notice-left-open');
    const kn = mkKeeper(path.join(ROOT, 'data-eng-notice'), { engines: ENGR, serverSetting: (k) => settingsE[k], fleetFacts: () => fleetE, liveKeys: () => new Set([KEY_A, KEY_E]) }, Kn);
    const crm = await cureRun(kn);
    ok(crm.idX && crm.doneX.length === 0 && crm.doneY.length === 0, 'CONTROL (B-cf42 cure): a keeper that never resolves leaves «runs as standard Chrome» open after the kernel answers again (RED for the leg above)', crm);
    // the agent's profile view drops the keeper's bookkeeping of the mark (filed, at, the notice id)
    const PBv = require('../src/browser-profiles.js');
    const markRow = { id: 'bp-0000cf42', label: 'K', provider: 'chromium', owner: { kind: 'instance', id: null }, browser: { kind: 'plugin', id: EID }, kernelLive: { engine: EID, version: '150', why: 'standard', probe: ALL3, live: [], at: 123, filed: true, noticeId: 'u9' } };
    const av = PBv.agentProfileView(markRow, {}, {});
    ok(av.kernelLive && Object.keys(av.kernelLive).sort().join() === 'engine,live,probe,version,why', 'B-cf42 cure: the agent\'s view of a marked profile carries the answer only — never the keeper\'s bookkeeping (filed, at, the notice id)', av.kernelLive);
    const pSrc = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
    const pCut = '  kernelLive: (v) => ({ engine: v.engine, version: v.version, why: v.why, probe: v.probe, live: v.live }),';   // r2932 (2): the kernel's fact row's shape (src/browser-profiles.js AGENT_VIEW_SHAPES)
    if (!pSrc.includes(pCut)) throw new Error('the anchor of the control «B-cf42 cure: the agent view\'s bookkeeping» is not in the source');
    const PBm = MCk.load('src/browser-profiles.js', editAnchor(pSrc, pCut, '  kernelLive: (v) => v,', "src/browser-profiles.js"), 'agent-view-keeps-bookkeeping');
    ok('filed' in (PBm.agentProfileView(markRow, {}, {}).kernelLive || {}), 'CONTROL (B-cf42 cure): a view without its projection hands the agent the keeper\'s bookkeeping (RED for the leg above)');
  }
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
  // B-f276 (主开发 r3305 (a)): the PLUGIN REGISTRY HELD (plugin-registry.json could not be read) — whether the engine's plugin is on and
  // trusted is UNKNOWN. The profile's start is refused BY THE REGISTRY's NAME: nothing launched, never Chrome in its place, NO mark and
  // NO For-you item of a missing build; a create naming the engine is refused by that name too (never «another engine protocol»).
  // RED: the release's start — the held answer read as a broken engine: the profile MARKED and a For-you item filed
  {
    const HWd = 'plugin-registry.json in VibeSpace\'s data folder could not be read (EIO)';
    const LDRH = { ...LDR, list: () => LDR.list().map((r) => ({ ...r, enabled: null, trusted: null, held: true })), held: () => ({ file: 'plugin-registry.json', code: 'EIO', since: 1 }), heldWords: () => HWd, isTrusted: () => null };
    const ENGRH = require('../src/server/browser-engines.js').create({ loader: LDRH, dataDir: path.join(EROOT, 'data'), timeoutMs: 400 });
    const heldStart = async (Kmod, dir) => {
      let eng = ENGR;
      const kh = mkKeeper(path.join(ROOT, dir), { engines: () => eng, serverSetting: (k) => settingsE[k], fleetFacts: () => fleetE, liveKeys: () => new Set([KEY_A, KEY_E]) }, Kmod);
      const ph = kh.createProfile({ label: 'Held engine', browser: { kind: 'plugin', id: EID } }, { engine: await kh.engineFactOf(EID) });
      eng = ENGRH;   // the hub's next start: the registry did not read
      const n0 = fake.launches().length, t0 = todos.length;
      const e = await thr(() => kh.start(ph.id, { why: 'test' }));
      const cr = await thr(async () => kh.createProfile({ label: 'Held create', browser: { kind: 'plugin', id: EID } }, { engine: await kh.engineFactOf(EID) }));
      const out = { code: e && e.code, chrome: /never starts Chrome in its place/.test(String(e && e.message)), launched: fake.launches().length - n0, filed: todos.length - t0,
        filedText: todos.length > t0 ? String(todos.at(-1).text) : null, marked: !!kh.profile(ph.id).buildMissing, create: cr && cr.code, table: ENGRH.rows().length };
      try { kh.shutdown(); } catch { /* its own */ }
      return out;
    };
    const hs = await heldStart(K, 'data-eng-held');
    ok(hs.code === 'plugin_registry_unread' && hs.chrome && hs.launched === 0 && hs.filed === 0 && !hs.marked && hs.create === 'plugin_registry_unread' && hs.table === 0,
      'B-f276 (r3305 (a)): the plugin registry HELD ⇒ an engine profile\'s start is refused BY THE REGISTRY\'s NAME (plugin_registry_unread) — nothing launched, never Chrome in its place, no mark and no For-you item of a missing build; a create naming the engine is refused by that name too', hs);
    const kSrcH = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const hLine = kSrcH.split('\n').find((l) => l.startsWith("    if (engine && engine.code === 'plugin_registry_unread') throw namedError("));
    if (!hLine) throw new Error('the anchor of the control «B-f276: the held registry at an engine start» is not in the source');
    const Kh = mutantCopies('browser-builds-plugreg-held', REPO).load('src/server/browser-keeper.js', editAnchor(kSrcH, hLine + '\n', '', 'src/server/browser-keeper.js'), 'held-as-broken');
    const hx = await heldStart(Kh, 'data-eng-held-red');
    ok(hx.filed === 1 && hx.marked && !hx.chrome && hx.launched === 0,
      'RED CONTROL (B-f276, the release\'s start): the held answer reads as a broken engine — the profile MARKED and a For-you item filed («cannot start…»), though nothing about the engine is wrong', hx);
  }
  // CHANGE BUILD… to the engine: a running Chrome profile restarts on the kernel; the dialog's facts never carry a path
  const pc = ke.createProfile({ label: 'Switches' });
  await ke.start(pc.id, { why: 'test' });
  const bv = await ke.buildsView(pc.id);
  const row = ((bv.listing && bv.listing.engines) || []).find((e) => e.id === EID);
  ok(row && row.version === KVER && row.installed && row.label === 'Fixture Browser Engine' && !JSON.stringify(bv).includes(KP) && !JSON.stringify(await ke.machineBuilds()).includes(KP), 'Change build… lists the engine (its probe\'s version — the «自研内核» card) and NO path anywhere in the dialog\'s facts', row);
  const swA = await thr(() => ke.setBrowserChoice({ profileId: pc.id, choice: { kind: 'plugin', id: EID }, by: 'agent' }));
  ok(swA && swA.code === 'browser_choice_user_only' && !ke.profile(pc.id).browser, 'an agent never switches a profile to an engine (refused by name, nothing changed)', swA && swA.code);
  const sw = await ke.setBrowserChoice({ profileId: pc.id, choice: { kind: 'plugin', id: EID }, by: 'user' });
  ok(sw.ok && sw.restarted && kernelOf(fake.launches().at(-1).exe) === KP && ke.profile(pc.id).browser.id === EID, 'Change build… → the engine: the running browser restarts on its kernel', { ok: sw.ok, restarted: sw.restarted });
  await ke.setBrowserChoice({ profileId: pc.id, choice: { kind: 'default' }, by: 'user' });
  await ke.stop(pc.id, { why: 'user' });
  ok(ke.list().profiles.length > 0 && t0 <= todos.length, 'the engine legs leave the keeper usable');
  // lane engine-args-string r2: the engine profile's WRAPPER (written at its engine launches) goes with the profile
  const wpe = path.join(ROOT, 'data-eng', 'browser-env', 'display', `engine-${pe.id}.sh`);
  const hadW = fs.existsSync(wpe);
  await ke.stop(pe.id, { why: 'user' }).catch(() => { });
  const rmE = await thr(() => ke.removeProfile(pe.id));
  ok(hadW && !rmE && !ke.profile(pe.id) && !fs.existsSync(wpe), 'the engine profile\'s wrapper (`engine-<profile>.sh`, written at its launches) is REMOVED with the profile (removeProfile)', { hadW, rmE: rmE && rmE.message, left: fs.existsSync(wpe) });
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
  // lane engine-args-string (r1 + r2): the engine answers the owner's switches (the four holding a comma), ones the keeper's own
  // config also carries (another value for one), a forged launch mark and a quote — the conversation's browser STARTS with all
  const ENGINE_ARGS = ['--vibespace-engine=fixture', ...OWNER_ENGINE, '--disable-blink-features=AutomationControlled', '--log-level=0', '--use-angle=gl', '--user-agent=Fixture Kernel/150 (X11)', '--vibespace-keeper=forged', "--x-quote=it's"];
  setMode({ launch: { args: ENGINE_ARGS } });
  let eph = null, ephErr = null; try { eph = await ke.ensureEphemeral({ browserKey: KEY_E, sessionId: 'sess-e', envPairs: pairs, sessionName: 'eng', variant: 'N' }); } catch (e) { ephErr = e; }
  setMode(null);
  ok(!ephErr, 'the conversation\'s browser on the engine STARTS with the owner\'s switches — none refused (a comma is carried, not a reason)', ephErr && `${ephErr.code}: ${ephErr.message}`);
  const ev0 = ke.ephemeralFor(KEY_E);
  const ep = ev0 ? ke.profile(ev0.profileId) : null;
  const la = fake.launches().at(-1);
  ok(eph && ep && ep.browser && ep.browser.id === EID && fake.launches().length === n0 + 1 && la.config && kernelOf(la.config.executablePath) === KP && ((wrapperOf(la.config.executablePath) || {}).args || []).includes('--vibespace-engine=fixture'), 'a conversation\'s browser is BORN with the policy\'s engine and LAUNCHES its kernel: the config it ran with names the program (the keeper\'s wrapper over the kernel) + its arguments (the wrapper\'s)', { browser: ep && ep.browser, config: la && la.config });
  const cf = ke.configFileFor({ ephemeral: true, pairs });
  let cfg = null; try { cfg = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch { cfg = null; }
  ok(cfg && cfg.executablePath === la.config.executablePath && kernelOf(cfg.executablePath) === KP, 'the config the AGENT\'s own commands are named (/resolve) carries the same program + arguments — the launch view never differs, so the browser is never relaunched on Chrome', cf);
  {
    // lane engine-args-string: THE FILE the launch named — `args` ONE string (the driver refuses a list: «invalid type: sequence,
    // expected a string» — the owner's hub, 2026-11-02) carrying the KEEPER's part only (r2); the program = the keeper's wrapper
    // whose words are the ENGINE's part; run with the driver's reading of the line as "$@", every switch arrives once, in order
    const VB = require('../src/browser-verbs.js');
    const a0 = la && la.config ? la.config.args : undefined;
    const got = typeof a0 === 'string' ? a0.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : []; // the driver's reading, measured on 0.38.2
    const nm = (x) => (x.startsWith('-') && x.includes('=') ? x.slice(0, x.indexOf('=')) : x);
    const dups = got.map(nm).filter((n, i, all) => all.indexOf(n) !== i);
    const marks = got.filter((x) => x.startsWith(VB.KEEPER_MARK + '='));
    const wantEngine = ['--vibespace-engine=fixture', '--no-sandbox', '--use-gl=angle', '--use-angle=gl', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--accept-lang=en-US,en', '--window-size=1920,1080', '--window-position=24,36', '--disable-features=OptimizationHints,MediaRouter,Translate,CalculateNativeWinOcclusion,HttpsUpgrades', '--disable-blink-features=AutomationControlled', '--log-level=0', '--user-agent=Fixture Kernel/150 (X11)', "--x-quote=it's"];
    const wr = la && la.config && la.config.executablePath ? wrapperOf(la.config.executablePath) : null;
    ok(typeof a0 === 'string' && cfg && cfg.args === a0, 'the engine launch\'s config (and the /resolve one, the SAME file) holds `args` as ONE string — never a list', { type: Array.isArray(a0) ? 'list' : typeof a0, args: a0 });
    ok(got.length > 0 && !dups.length && marks.length === 1 && marks[0] === BPR.keeperMarkArg(KEY_E) && !got.some((x) => wantEngine.map(nm).includes(nm(x))), 'read back by the driver\'s rule: the KEEPER\'s part only — no switch twice, the mark ONCE (its own value — the engine\'s forged one dropped), no name the engine gives', { dups, marks, got });
    const wfile = ep ? path.join(ROOT, 'data-eng', 'browser-env', 'display', `engine-${ep.id}.sh`) : '';
    const wst = (() => { try { return fs.lstatSync(wfile); } catch { return null; } })();
    ok(wr && la.config.executablePath === wfile && wst && wst.isFile() && (wst.mode & 0o777) === 0o700 && wr.program === KP && JSON.stringify(wr.args) === JSON.stringify(wantEngine),
      'the program the config names is the keeper\'s WRAPPER (`engine-<profile>.sh` beside the display configs, 0700) over the kernel, its words the ENGINE\'s part — one per name, the engine\'s last value (--use-angle=gl, --log-level=0), the forged mark gone, the four comma switches and the quote whole', { exe: la && la.config && la.config.executablePath, wr: wr && wr.args });
    let argvK = [];
    if (wr) {
      const RSTUB = path.join(ROOT, 'record-argv-k'), ROUT = path.join(ROOT, 'argv-k.bin');
      fs.writeFileSync(RSTUB, '#!/bin/sh\nprintf \'%s\\0\' "$@" > "$STUB_OUT"\n', { mode: 0o755 });
      const swapped = path.join(ROOT, 'wrapper-swapped.sh'); fs.writeFileSync(swapped, wr.text.replace(`exec '${KP}'`, `exec '${RSTUB}'`), { mode: 0o700 }); // the ONE edit: its program
      try { execFileSync(swapped, got, { env: { PATH: '/usr/bin:/bin', STUB_OUT: ROUT } }); argvK = fs.readFileSync(ROUT, 'utf8').replace(/\0$/, '').split('\0'); } catch { argvK = []; }
    }
    ok(JSON.stringify(argvK) === JSON.stringify([...got, ...wantEngine]) && new Set(argvK.map(nm)).size === argvK.length,
      `the keeper's wrapper (its program swapped for an argv recorder — the one edit), run with the driver's reading of the line as "$@": EVERY switch arrives verbatim, ONCE, keeper's first then the engine's (${argvK.length})`, argvK);
  }
  fleetE = null;
  try { if (ep) ke.retireEphemeral(ep.id, 'test'); } catch { /* best effort */ }
}
// ═══ ⑦b lane engine-spi-egress: AN ENGINE THAT MUST STAY INSIDE A LIST — THE KEEPER'S PROXY WRAPS IT ═══════════════════════
// The fixture engine's EGRESS VARIANT (scripts/fixtures/engine-plugin-egress: its manifest's reserved row; the same server.js) in
// its own scratch root through the REAL loader; a loopback TARGET server stands behind the names the keeper's egressResolve maps
// (the verdict is always taken on the name); the proxy as the browser meets it = plain http requests to the url the launch named.
const GID = 'vibespace.egress-engine';
const GROOT = path.join(ROOT, 'egress-root');
fs.cpSync(path.join(REPO, 'scripts/fixtures/engine-plugin'), path.join(GROOT, 'data', 'plugins', GID), { recursive: true });
fs.copyFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin-egress/vibespace-plugin.json'), path.join(GROOT, 'data', 'plugins', GID, 'vibespace-plugin.json'));
const LDRG = require('../src/server/plugin-loader.js').create({ rootDir: GROOT, app: expressE(), hostVersion: '2.369.356', log: { log() { }, warn() { } }, agentEnv: () => ({ PATH: process.env.PATH }) });
process.on('exit', () => { try { LDRG.shutdown(); } catch { /* gone */ } });
const ENGRG = require('../src/server/browser-engines.js').create({ loader: LDRG, dataDir: path.join(GROOT, 'data'), timeoutMs: 400 });
const pxReq = (pxUrl, method, target) => new Promise((resolve) => {
  let u; try { u = new URL(pxUrl); } catch { return resolve({ status: 0, body: 'no proxy url' }); }
  const rq = http.request({ host: u.hostname, port: Number(u.port), method, path: target, headers: method === 'GET' ? { Host: new URL(target).host, Connection: 'close' } : {}, timeout: 5000 });
  const read = (res) => { let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); };
  rq.on('response', read); rq.on('connect', (res, sock) => { sock.destroy(); resolve({ status: res.statusCode, body: '' }); });
  rq.on('timeout', () => { rq.destroy(); resolve({ status: 0, body: 'timeout' }); }); rq.on('error', (e) => resolve({ status: 0, body: String(e && e.code) })); rq.end();
});
{
  const TGT = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'close' }); r.end('hello from the target'); });
  await new Promise((res) => TGT.listen(0, '127.0.0.1', res)); servers.add(TGT);
  const TP = TGT.address().port;
  LDRG.setEnabled(GID, true, { trusted: true });
  const tw = Date.now(); while (!ENGRG.rows().length && Date.now() - tw < 8000) await new Promise((r) => setTimeout(r, 25));
  const GKP = ENGRG.kernelPath(GID);
  fs.mkdirSync(path.dirname(GKP), { recursive: true });
  fs.writeFileSync(GKP, `#!/bin/sh\necho "${KVER}"\n`, { mode: 0o755 });
  const pg = await ENGRG.probe(GID);
  ok(pg.ok && pg.fact.features.join() === 'egress-allowlist' && pg.fact.egress && pg.fact.egress.setting === `plugin.${GID}.egressAllowlist` && pg.fact.egress.default === '' && !JSON.stringify(ENGRG.rows()).includes('egressAllowlist'),
    'the EGRESS VARIANT through the REAL loader: features [egress-allowlist] — no surfaces, optional now — and the fact names its reserved row (the table\'s public rows carry no manifest settings)', pg);
  const EA = ENGN.engineArgs || (({ args = [] }) => args), WP = ENGN.withoutProxyArgs || ((l) => l); // (a tree without them: ✗ by name below)
  const leW = ENGN.engineLaunchEnv({ args: [] }, { base: ['--m', ...(ENGN.egressArgs || (() => []))('http://127.0.0.1:9')], always: true });
  // B-8b87 (主开发 2026-11-17 14:28Z): the egress pair also carries the WebRTC policy that lets UDP out only through a proxy — LAST
  ok(leW.AGENT_BROWSER_ARGS === '--m,--proxy-server=http://127.0.0.1:9,--proxy-bypass-list=<-loopback>,--force-webrtc-ip-handling-policy=disable_non_proxied_udp' && !('AGENT_BROWSER_ARGS' in ENGN.engineLaunchEnv({ args: [] }, { base: ['--m'] })) && EA({ args: ['--a'], egress: 'http://127.0.0.1:9' }).join(' ') === '--a --proxy-server=http://127.0.0.1:9 --proxy-bypass-list=<-loopback> --force-webrtc-ip-handling-policy=disable_non_proxied_udp' && EA({ args: ['--a'] }).join() === '--a'
    && WP(['--a', '--proxy-pac-url=http://p', ' --no-proxy-server', '-proxy-server=x', '--proxy-auto-detect']).join() === '--a',
    'a WRAPPED launch carries the keeper\'s proxy switches in the KEEPER\'s part of the driver line (`<-loopback>`: the proxy answers loopback too), even when the plugin names no switch (`always`); engineArgs = the plugin\'s + the proxy\'s (the attach argv); the keeper\'s own list loses every proxy switch (Chromium ranks a pac url / no-proxy above --proxy-server)', leW);
  if (!pg.ok) ok(false, '⑦b the egress variant is refused on this tree — the legs that wrap it are not reached', pg);
  else await (async () => {
  const ROWK = `plugin.${GID}.egressAllowlist`, KEY_G = 'bk-0000e9e1';
  const settingsG = { [ROWK]: 'listed.test', 'browser.headed': true }; // headed: on a box with no display + Xvfb ⇒ the hidden-window rung (its x11 pin — L2's F4)
  // the user's own driver config (its own HOME): rendering switches, a display pin, and proxy switches that would undo the wrap
  const GHOME = path.join(ROOT, 'egress-home');
  fs.mkdirSync(path.join(GHOME, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(GHOME, '.agent-browser', 'config.json'), JSON.stringify({ args: '--use-angle=swiftshader,--ozone-platform=wayland,--proxy-pac-url=http://pac.test/p.pac,--no-proxy-server' }));
  const kgOpts = { homeDir: GHOME, engines: ENGRG, serverSetting: (k) => settingsG[k], liveKeys: () => new Set([KEY_A, KEY_G]), egressResolve: (h) => (/^(?:listed\.test|(?:[a-z0-9-]+\.)*later\.test)$/.test(h) ? '127.0.0.1' : h) };
  let kg = mkKeeper(path.join(ROOT, 'data-egress'), kgOpts);
  const pe = kg.createProfile({ label: 'Wrapped', browser: { kind: 'plugin', id: GID } }, { engine: await kg.engineFactOf(GID) });
  const c0 = fake.calls().length;
  await kg.start(pe.id, { why: 'test' });
  const la = fake.launches().at(-1), args = String(la.args || '').split(/[,\n]/);
  const wrG = wrapperOf(la.exe) || { program: null, args: [] }; // lane engine-args-string r2: the program is the keeper's wrapper
  const pxArg = wrG.args.find((a) => a.startsWith('--proxy-server=')) || args.find((a) => a.startsWith('--proxy-server=')) || '', pxUrl = pxArg.slice('--proxy-server='.length); // (a tree that put it on the driver line: found there, judged below)
  ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(pxUrl) && wrG.program === GKP && JSON.stringify(wrG.args.slice(-3)) === JSON.stringify([pxArg, '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']) && wrG.args.includes('--vibespace-engine=fixture') && args.includes(BPR.keeperMarkArg(pe.id)) && !args.some((a) => /^--?proxy/.test(a)),
    'THE KEEPER WRAPS IT: --proxy-server=<this profile\'s allowlisting proxy> + --proxy-bypass-list=<-loopback> + the WebRTC policy (UDP only through a proxy; B-8b87) ride the keeper\'s WRAPPER over its kernel, LAST (after the plugin\'s switches — nothing the driver adds before can undo them); the driver\'s line carries the mark, no proxy switch', { args, wrG });
  const cs = callsOf('vs-' + pe.id, c0);
  ok(cs.length >= 2 && cs.every((c) => c.exe === la.exe) && (wrapperOf(la.exe) || { args: [] }).args.includes(pxArg), `V2: the proxy rides EVERY call's launch view (${cs.map((c) => c.verb).join(' · ')}) — each names the same wrapper, which carries it`, cs);
  // L2's F4: the env list REPLACES the config's — so it carries the keeper's OWN list from the config the launch names (the display
  // plan applied: on a box with Xvfb and no display the hidden-window rung's x11 pin), minus the user's proxy switches
  const DSPm = require('../src/browser-display.js');
  const cfgL = DSPm.argsList(la.config && la.config.args), keptL = cfgL.filter((a) => !(ENGN.PROXY_ARG_RE || /$^/).test(a));
  const lastOz = (l) => DSPm.ozoneOf(l), fb = (kg._reg().browsers[pe.id].display || {}).fallback || null;
  ok(keptL.length >= 3 && keptL.every((a) => args.includes(a)) && args.includes('--use-angle=swiftshader') && !args.some((a) => /^--?proxy|^--?no-proxy/.test(a)) && wrG.args.filter((a) => a.startsWith('--proxy-server=')).length === 1 && lastOz(args) === lastOz(cfgL) && (!fb || fb.rung !== 'hidden-window' || lastOz(args) === 'x11'),
    `F4: the engine's env list carries EVERY switch of the config the launch names (the user's, the mark, the display plan's — here ${fb ? `the ${fb.rung || fb.why} rung, ozone ${lastOz(cfgL) || 'none'}` : `no fallback, ozone ${lastOz(cfgL) || 'none'}`}), never the user's proxy switches — ONE proxy, the keeper's`, { fb, cfgL, args });
  const tq = Date.now();
  const [r1, r2, r3, r4] = [await pxReq(pxUrl, 'GET', `http://listed.test:${TP}/page`), await pxReq(pxUrl, 'GET', `http://unlisted.test:${TP}/page`), await pxReq(pxUrl, 'GET', `http://127.0.0.1:${TP}/page`), await pxReq(pxUrl, 'CONNECT', 'unlisted.test:443')];
  ok(r1.status === 200 && r1.body === 'hello from the target' && r2.status === 403 && r2.body.trim() === 'egress refused: unlisted.test is not in the egress allowlist (listed.test)' && r3.status === 403 && /127\.0\.0\.1 is loopback\/link-local — never admitted by a rule/.test(r3.body) && r4.status === 403,
    'V3: a LISTED host passes (the loopback target behind its name), an UNLISTED one is refused with the keeper\'s words, LOOPBACK never (by its address too), a CONNECT to an unlisted host refused', { r1, r2, r3, r4 });
  const n1 = fake.launches().length;
  settingsG[ROWK] = 'listed.test, .later.test';
  const r5 = await pxReq(pxUrl, 'GET', `http://www.later.test:${TP}/x`);
  delete settingsG[ROWK];
  const r6 = await pxReq(pxUrl, 'GET', `http://listed.test:${TP}/x`);
  settingsG[ROWK] = 'listed.test';
  ok(r5.status === 200 && fake.launches().length === n1 && r6.status === 403 && /empty — deny by default/.test(r6.body),
    'V3: the list is read LIVE per request from the reserved row (a site added passes at once, no relaunch); no stored value ⇒ the manifest row\'s default (empty) ⇒ deny by default', { r5, r6 });
  const hosts = kg.egressRefusals(pe.id, tq), eng = kg.egressEngineOf ? kg.egressEngineOf(pe.id) : null, said = SW.egressRefusedText(hosts, eng), view = kg.egressFor(pe.id);
  ok(hosts.includes('unlisted.test') && hosts.includes('127.0.0.1') && eng && eng.id === GID && eng.label === 'Fixture Egress Engine' && /^Fixture Egress Engine's site list refused unlisted\.test/.test(said) && /⚙ → Plugins → Fixture Egress Engine/.test(said) && !/vibespace-browser blocked/.test(said)
    && view.url === pxUrl && view.engine === GID && view.allowlist.join() === 'listed.test' && kg.egressFor().url === null && /^this browser's site list refused x\.example/.test(SW.egressRefusedText(['x.example'])),
    'F7: the refusals ride the verb answer as today (THIS profile\'s proxy, by name) — the words name the engine\'s own list, no card; no profile named ⇒ no proxy, and a sentence naming no engine says "this browser"', { hosts, eng, said });
  const rsE = read('src/routes/browser.js');
  ok(/const hosts = k\.egressRefusals\(profileId, since\); if \(hosts\.length\) egressRefused = \{ hosts, text: require\('\.\.\/browser-switch\.js'\)\.egressRefusedText\(hosts, typeof k\.egressEngineOf === 'function' \? k\.egressEngineOf\(profileId\) : null\) \}/.test(rsE), 'WIRING: the verb answer\'s egressRefused names the wrapped engine (k.egressEngineOf)');
  // r2 (主开发's acceptance, MAJOR) THE RESTART: the browser SURVIVES the hub; the next keeper's boot re-binds ITS proxy on the port
  // its launch view names before it is ready — the listed host passes, the unlisted one is refused, the refusal reaches THIS profile
  const portG = Number((/:(\d+)$/.exec(pxUrl) || [])[1] || 0);
  kg.shutdown();
  const rDead = await pxReq(pxUrl, 'GET', `http://listed.test:${TP}/x`);
  kg = mkKeeper(path.join(ROOT, 'data-egress'), kgOpts);
  await kg.boot();
  const rec2 = kg._reg().browsers[pe.id] || {}, tq2 = Date.now();
  const [b1, b2] = [await pxReq(pxUrl, 'GET', `http://listed.test:${TP}/x`), await pxReq(pxUrl, 'GET', `http://unlisted.test:${TP}/x`)];
  ok(rDead.status === 0 && rec2.state === 'ready' && rec2.egress && rec2.egress.port === portG && b1.status === 200 && b2.status === 403 && kg.egressRefusals(pe.id, tq2).includes('unlisted.test') && (kg.egressEngineOf(pe.id) || {}).id === GID,
    'r2 THE RESTART: a wrapped browser adopted by the next keeper is ready only behind ITS proxy again — the SAME port its launch view names, the listed host passes, the unlisted one refused, the refusal this profile\'s', { rDead, state: rec2.state, egress: rec2.egress, b1, b2 });
  // …and the port HELD by another program at the restart ⇒ NOT ready: refused by name, ended by identity, ONE For-you line — never
  // served by another proxy, never rebound elsewhere
  kg.shutdown();
  const FOREIGN = http.createServer((q, r) => { r.writeHead(200); r.end('foreign'); }); servers.add(FOREIGN);
  await new Promise((res) => FOREIGN.listen(portG, '127.0.0.1', res));
  const pidG = rec2.pid, tF = todos.length;
  kg = mkKeeper(path.join(ROOT, 'data-egress'), kgOpts);
  await kg.boot();
  const rec3 = kg._reg().browsers[pe.id] || {};
  const gone = (() => { try { process.kill(pidG, 0); return false; } catch (e) { return e.code === 'ESRCH'; } })();
  await new Promise((res) => FOREIGN.close(res));
  ok(rec3.state !== 'ready' && new RegExp(`cannot listen on its port ${portG} again — another program holds it`).test(String(rec3.lastError)) && !kg.egressFor(pe.id).url && todos.length === tF + 1 && /"Wrapped" was stopped at the restart: its egress proxy's port \d+ is in use/.test(todos.at(-1).text) && gone,
    'r2: the port HELD by another program at the restart ⇒ NOT ready — said by name, the browser ended by identity, ONE For-you line; no proxy of ours took another port for it', { state: rec3.state, lastError: rec3.lastError, todo: todos.at(-1), gone });
  try { await kg.stop(pe.id, { why: 'user' }); } catch { /* ended already */ }
  // L2 acceptance (A): the declaration is STICKY — the word dropped by a later answer ⇒ refused by name; a version that drops the
  // row too ⇒ its consent hash drifts ⇒ out of the table (re-enable to accept it) — nothing launched either way
  const GMODE = path.join(GROOT, 'data', 'plugins-state', GID, 'mode.json'), GMAN = path.join(GROOT, 'data', 'plugins', GID, 'vibespace-plugin.json');
  fs.writeFileSync(GMODE, JSON.stringify({ probe: { features: [] } }));
  const nD = fake.launches().length;
  const eD = await thr(() => kg.start(pe.id, { why: 'test' }));
  fs.rmSync(GMODE, { force: true });
  const manG = fs.readFileSync(GMAN, 'utf8');
  fs.writeFileSync(GMAN, JSON.stringify({ ...JSON.parse(manG), version: '0.0.2', contributes: { routes: true, browserEngine: true } }));
  LDRG.reload();
  const eV = await thr(() => kg.start(pe.id, { why: 'test' }));
  const trustedV = LDRG.isTrusted(GID), rowsV = ENGRG.rows().length, noteV = (LDRG.list().find((x) => x.id === GID) || {}).notice || '';
  fs.writeFileSync(GMAN, manG); LDRG.reload(); LDRG.setEnabled(GID, true); // the owner enables it again (the trust it agreed to is the same hash)
  const tb = Date.now(); while (!ENGRG.rows().length && Date.now() - tb < 8000) await new Promise((r) => setTimeout(r, 25));
  ok(eD && eD.code === 'browser_engine_protocol' && /no longer declares the site list it was trusted with/.test(eD.message) && eV && eV.code === 'browser_engine_missing' && !trustedV && rowsV === 0 && /capabilities changed since you trusted this plugin/.test(noteV) && fake.launches().length === nD && LDRG.isTrusted(GID) && ENGRG.rows().length === 1,
    'L2 acceptance (A) THE DOWNGRADE GUARD through the real loader + keeper: the probe drops the word ⇒ refused BY NAME; a version without the row ⇒ its consent hash drifts — switched off «capabilities changed since you trusted this plugin», out of the table, refused — NOTHING launched; enabled again over the same manifest ⇒ back', { eD: eD && eD.message, eV: eV && eV.code, trustedV, rowsV, noteV });
  // a conversation's browser born on ANOTHER engine id (the policy names any installed engine — ids derived), wrapped the same way
  settingsG['browser.defaultEngine'] = 'plugin:' + GID;
  const dG = kg.defaultEngineNow();
  const pairs = BPR.browserEnvFor({ browserKey: KEY_G, variant: BPR.VARIANTS.N, idleMs: 600000 });
  const n2 = fake.launches().length;
  await kg.ensureEphemeral({ browserKey: KEY_G, sessionId: 'sess-g', envPairs: pairs, sessionName: 'egress', variant: 'N' });
  const evG = kg.ephemeralFor(KEY_G), epG = evG ? kg.profile(evG.profileId) : null;
  const rdA = (a) => require('../src/browser-display.js').argsList(a); // the config's `args` read the driver's way (a list, or ONE line — lane engine-args-string)
  const laG = fake.launches().at(-1), cfgA = rdA(laG && laG.config && laG.config.args);
  const wrE = (laG && laG.config && laG.config.executablePath ? wrapperOf(laG.config.executablePath) : null) || { args: [] }; // r2: the proxy rides the wrapper
  const ephPx = (wrE.args.find((a) => String(a).startsWith('--proxy-server=')) || '').slice('--proxy-server='.length);
  let cfgG = null; try { cfgG = JSON.parse(fs.readFileSync(kg.configFileFor({ ephemeral: true, pairs }), 'utf8')); } catch { cfgG = null; }
  ok(dG.value === 'plugin:' + GID && dG.source === 'user' && epG && epG.browser && epG.browser.id === GID && fake.launches().length === n2 + 1 && /^http:\/\/127\.0\.0\.1:\d+$/.test(ephPx) && ephPx !== pxUrl && wrE.args.includes('--proxy-bypass-list=<-loopback>') && !cfgA.some((a) => /^--?(?:proxy|no-proxy)/.test(a)) && cfgG && cfgG.executablePath === laG.config.executablePath,
    'V6: \'plugin:<another id>\' as the default ⇒ a conversation\'s browser is BORN on that engine and wrapped by ITS OWN proxy — the config the agent\'s own commands name carries the same arguments', { dG, browser: epG && epG.browser, cfgA });
  delete settingsG['browser.defaultEngine'];
  if (epG) { try { kg.detach({ profileId: epG.id, browserKey: KEY_G, by: 'user' }); } catch { /* none */ } await kg.retireEphemeral(epG.id, 'test').catch(() => { }); } // its conversation gone (the lease dropped, then retired)
  kg.removeProfile(pe.id);
  const [g1, g2] = [await pxReq(pxUrl, 'GET', `http://listed.test:${TP}/x`), await pxReq(ephPx, 'GET', `http://listed.test:${TP}/x`)];
  ok(g1.status === 0 && g2.status === 0 && !!kg.egressEngineOf && kg.egressEngineOf(pe.id) === null, 'a record removed ⇒ its proxy is CLOSED (never outlives the record — a conversation\'s browser had one each)', { g1, g2 });
  })();
  LDRG.setEnabled(GID, false);
}
// ═══ ⑦c lane engine-spi-egress L1b: THE OWNER'S PROGRAM — the second kernel source (design-desk cloak-plugin-addendum §0/§1) ═══════
// The fixture engine's USER VARIANT (scripts/fixtures/engine-plugin-user: the reserved rows executablePath + egressAllowlist; its probe
// ECHOES the handed path and CLAIMS installed + executable — never a stat) through the REAL loader + registry + keeper + engine-
// distribution. The owner's program = files in a scratch folder: a symlink to this node (an ELF that answers --version), a folder, a
// 0644 ELF, a `#!` script, an MZ build, a missing path.
const UID = 'vibespace.user-engine', UROW = `plugin.${UID}.executablePath`;
const UROOT = path.join(ROOT, 'user-root');
fs.cpSync(path.join(REPO, 'scripts/fixtures/engine-plugin'), path.join(UROOT, 'data', 'plugins', UID), { recursive: true });
fs.copyFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin-user/vibespace-plugin.json'), path.join(UROOT, 'data', 'plugins', UID, 'vibespace-plugin.json'));
const LDRU = require('../src/server/plugin-loader.js').create({ rootDir: UROOT, app: expressE(), hostVersion: '2.369.356', log: { log() { }, warn() { } }, agentEnv: () => ({ PATH: process.env.PATH }) });
process.on('exit', () => { try { LDRU.shutdown(); } catch { /* gone */ } });
const settingsU = {};
const ENGRU = require('../src/server/browser-engines.js').create({ loader: LDRU, dataDir: path.join(UROOT, 'data'), timeoutMs: 2000, setting: (k) => settingsU[k] });
{
  const E = ENGN, ELF = [0x7f, 0x45, 0x4c, 0x46];
  const sv = (o) => (E.userBinaryVerdict || (() => ({})))({ id: UID, label: 'Fixture User Engine', platform: 'linux', ...o });
  const pRows = [[{ path: '' }, 'unset'], [{ path: 'rel/x' }, 'shape'], [{ path: '/x\ny' }, 'shape'], [{ path: '/x', fact: { usable: false, why: 'missing' } }, 'missing'], [{ path: '/x', fact: { usable: false, why: 'not-a-file' } }, 'not-a-file'], [{ path: '/x', fact: { usable: false, why: 'not-executable' } }, 'not-executable'], [{ path: '/x', fact: { usable: true }, magic: [0x23, 0x21, 0x2f, 0x62] }, 'script'], [{ path: '/x', fact: { usable: true }, magic: [0x4d, 0x5a, 0, 0] }, 'platform']];
  const badU = pRows.filter(([o, why]) => sv(o).why !== why).map(([o, why]) => [why, sv(o).why]);
  const okE = (f, ...a) => (typeof E[f] === 'function' ? E[f](...a) : undefined);
  ok(!badU.length && sv({ path: '/x', fact: { usable: true }, magic: ELF }).ok === true && sv({ path: '' }).code === 'browser_engine_kernel_missing' && /no program set — open ⚙ → Plugins → Fixture User Engine → Program file/.test(String(sv({ path: '' }).error)) && !/\/x/.test(String(sv({ path: '/x', fact: { usable: false, why: 'missing' } }).error))
    && okE('programMagicOk', [0xcf, 0xfa, 0xed, 0xfe], 'macos') === true && okE('programMagicOk', [0x4d, 0x5a, 0x90, 0], 'windows') === true && okE('programMagicOk', ELF, 'macos') === false
    && !!okE('binaryRowOf', [{ key: 'executablePath', type: 'string', default: '' }]) && !('default' in (okE('binaryRowOf', [{ key: 'executablePath', type: 'string', default: '/usr/bin/true' }]) || { default: 1 })) && okE('binaryRowOf', [{ key: 'executablePath', type: 'select' }]) === null && okE('binaryRowPath', UID) === UROW
    && (okE('engineSourceOf', { row: { default: '' } }) || {}).source === 'user' && (okE('engineSourceOf', { kernelJson: true }) || {}).source === 'download' && (okE('engineSourceOf', {}) || {}).source === 'download' && /names both a kernel\.json and an executablePath row — an engine has one source/.test(String((okE('engineSourceOf', { row: {}, kernelJson: true, id: UID }) || {}).error))
    && !!E.ENGINE_OWNER_ROW_RE && E.ENGINE_OWNER_ROW_RE.test(UROW) && E.ENGINE_OWNER_ROW_RE.test(`plugin.${UID}.egressAllowlist`) && !E.ENGINE_OWNER_ROW_RE.test(`plugin.${UID}.other`),
    'L1b PURE: the program verdict — unset / not one absolute path / missing / a folder / no x-bit / a `#!` script / another platform\'s magic, each by its why (the words name the row, never the path); the magic per platform; the reserved program row (a string — r2: PRESENCE only, no default rides it); the SOURCE (the row ⇒ user, kernel.json ⇒ download, both ⇒ refused by name); the owner-only rows', badU);
  LDRU.setEnabled(UID, true, { trusted: true });
  const tu = Date.now(); while (!ENGRU.rows().length && Date.now() - tu < 8000) await new Promise((r) => setTimeout(r, 25));
  const UD = path.join(ROOT, 'user-progs'); fs.mkdirSync(path.join(UD, 'adir'), { recursive: true });
  const PROG = path.join(UD, 'browser'); fs.symlinkSync(process.execPath, PROG);
  fs.writeFileSync(path.join(UD, 'nox'), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0]), { mode: 0o644 });
  fs.writeFileSync(path.join(UD, 'script.sh'), '#!/bin/sh\nexec node "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(UD, 'win.exe'), Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0]), { mode: 0o755 });
  const states = [['', 'unset'], [path.join(UD, 'missing'), 'missing'], [path.join(UD, 'adir'), 'not-a-file'], [path.join(UD, 'nox'), 'not-executable'], [path.join(UD, 'script.sh'), 'script'], [path.join(UD, 'win.exe'), 'platform']];
  const got = [];
  for (const [p, why] of states) { settingsU[UROW] = p; const pr = await ENGRU.probe(UID); got.push([why, !!(pr.ok && pr.fact.source === 'user' && pr.fact.executable === false && pr.fact.userBinary && pr.fact.userBinary.why === why), pr.ok ? (pr.fact.userBinary || {}).why : pr.code]); }
  settingsU[UROW] = PROG; const prOk = await ENGRU.probe(UID);
  ok(got.every(([, g]) => g) && prOk.ok && prOk.fact.executable === true && prOk.fact.installed === true && prOk.fact.binaryPath === PROG && prOk.fact.userBinary === null && prOk.fact.features.join() === 'egress-allowlist',
    'V1 / V4 THE CORE JUDGES the owner\'s program (the plugin claims installed + executable for EVERY path — its word is not read): unset · missing · a folder · no x-bit · a `#!` script · a Windows build on linux ⇒ not executable, each by its why; a real ELF program ⇒ installed, executable', got);
  // the owner's program RUNS: the keeper's wrapper over THAT path, inside the egress proxy; measured by VibeSpace; never downloaded
  const EDU = require('../src/server/engine-distribution.js').create({ dataDir: path.join(UROOT, 'data'), engines: ENGRU, loader: LDRU, log: { log() { }, warn() { } } });
  settingsU[`plugin.${UID}.egressAllowlist`] = 'listed.test';
  const ku = mkKeeper(path.join(ROOT, 'data-user'), { engines: ENGRU, engineDistribution: EDU, serverSetting: (k) => settingsU[k] });
  const pu = ku.createProfile({ label: 'Owner program', browser: { kind: 'plugin', id: UID } }, { engine: await ku.engineFactOf(UID) });
  await ku.start(pu.id, { why: 'test' });
  const laU = fake.launches().at(-1), wrU = wrapperOf(laU.exe) || { program: null, args: [] }, nodeV = process.versions.node;
  // r1926 (the load row — seen red at e44bb4a98-20261122021849-both, the box zone only; UTC green on the same tree: the row's
  // measuredVersion null while the profile's choice carried 24.22.1): the row reads the measure BY THE PROGRAM'S STAMP at the read
  // (src/server/browser-engines.js userFactOf: size:mtime:ctime:ino:path) — and PROG is a symlink to the SHARED node binary, whose
  // inode another suite on the same machine changes (test-agentd-stay-window hard-links process.execPath: its ctime moves). Between
  // the start's measure and this read the stamp moved, and the row rightly said no version for a file it never measured. So the
  // leg reads the stamp at the read: when it moved, the product's own measure for THAT stamp runs first (what the next launch
  // does), said by name — the row is then judged on the file as it is
  const measuredRec = () => { try { return ((JSON.parse(fs.readFileSync(path.join(UROOT, 'data', 'browser-engines.json'), 'utf8')).engines || {})[UID] || {}).measured || {}; } catch { return {}; } };
  const prRow = await ENGRU.probe(UID), stampRow = prRow.ok ? prRow.fact.binaryStamp : null, forStart = measuredRec().for || null;
  if (stampRow && forStart && forStart !== `user:stat:${stampRow}`) { console.log(`    (the program's stat MOVED between the start's measure and the row's read — ${forStart} → user:stat:${stampRow}: another process changed the shared node binary's inode; the product's own measure for the new stamp runs first, as the next launch's would)`); await EDU.measure(UID, { path: PROG, stamp: stampRow }); }
  const rcU = ku._reg().browsers[pu.id].browserChoice, rowU = (await ku.engineRowsView()).find((e) => e.id === UID) || {};
  ok(wrU.program === PROG && wrU.args.some((a) => a.startsWith('--proxy-server=')) && rcU.version === nodeV && rowU.source === 'user' && rowU.measuredVersion === nodeV && !rowU.binary && EDU.kernelFact(UID).state === 'absent' && !JSON.stringify(rowU).includes(UD),
    `the OWNER's program runs: the keeper's wrapper execs THAT path (inside its egress proxy); its version MEASURED by VibeSpace (\`--version\` → ${nodeV}); the row says source user, never the path — and NOTHING was downloaded`, { wrU, rcU, stamps: { measuredFor: forStart, atRow: stampRow }, rowU: { source: rowU.source, measuredVersion: rowU.measuredVersion, binary: rowU.binary }, kf: EDU.kernelFact(UID).state });
  await ku.stop(pu.id, { why: 'user' });
  // V5: the file REPLACED (another program at the same path — its size / mtime change): the core's fact carries the NEW stamp, and the
  // measure the keeper asks at every launch (the launch above proved it) runs the new program — never a stale version
  const recM = () => { try { return ((JSON.parse(fs.readFileSync(path.join(UROOT, 'data', 'browser-engines.json'), 'utf8')).engines || {})[UID] || {}).measured || {}; } catch { return {}; } }; // (a tree that measured nothing: no record file)
  const forBefore = recM(), stampBefore = prOk.ok ? prOk.fact.binaryStamp : null;
  fs.unlinkSync(PROG); fs.symlinkSync('/usr/bin/true', PROG);
  const prNew = await ENGRU.probe(UID);
  const mNew = await EDU.measure(UID, { path: PROG, stamp: prNew.ok ? prNew.fact.binaryStamp : null });
  const mAgain = await EDU.measure(UID, { path: PROG, stamp: prNew.ok ? prNew.fact.binaryStamp : null });
  const forAfter = recM();
  ok(forBefore.version === nodeV && prNew.ok && prNew.fact.binaryStamp && prNew.fact.binaryStamp !== stampBefore && mNew.cached === false && forAfter.for !== forBefore.for && /^user:stat:/.test(forAfter.for) && forAfter.version !== nodeV && mAgain.cached === true,
    'V5: the program at that path REPLACED (its stat moved) ⇒ the core\'s fact carries the new stamp and the measure runs it again (then cached by that stamp) — the record follows the file, never a stale version', { forBefore, forAfter, stampBefore, stampNew: prNew.ok && prNew.fact.binaryStamp });
  fs.unlinkSync(PROG); fs.symlinkSync(process.execPath, PROG);
  // V1 at the launch: the plugin still claims installed for a MISSING path ⇒ refused by name, nothing launched
  settingsU[UROW] = path.join(UD, 'gone');
  const n1 = fake.launches().length;
  const e1 = await thr(() => ku.start(pu.id, { why: 'test' }));
  // V2: a launch answer naming ANOTHER program ⇒ refused by name, nothing launched
  settingsU[UROW] = PROG;
  const MODEU = path.join(UROOT, 'data', 'plugins-state', UID, 'mode.json');
  fs.mkdirSync(path.dirname(MODEU), { recursive: true }); fs.writeFileSync(MODEU, JSON.stringify({ launch: { executablePath: '/usr/bin/true' } }));
  const e2 = await thr(() => ku.start(pu.id, { why: 'test' }));
  fs.rmSync(MODEU, { force: true });
  ok(e1 && e1.code === 'browser_engine_not_executable' && /can't be run \(it is not there\)/.test(e1.message) && e2 && e2.code === 'browser_engine_protocol' && /another program than the one VibeSpace resolved for it/.test(e2.message) && fake.launches().length === n1,
    'V1: the plugin\'s installed:true over a MISSING program never launches (refused by its own words); V2: a launch answer naming ANOTHER program than the one VibeSpace resolved ⇒ refused by name — nothing launched either way', { e1: e1 && e1.message, e2: e2 && e2.message });
  // L1b r2 MAJOR 2: the refused OWNER's program is said in For you by ITS door (⚙ → Plugins → <plugin> → Program file) — never a kernel to
  // install (the download door answers 409 for it), never the path; the item carries its i18n (the client says it in zh / ja)
  const PNW = BB.PROGRAM_NOTICE_WORDS || {}, PWW = BB.PROGRAM_WHY_WORDS || {};
  const progNoticeOk = (n, plugin) => !!n && /cannot start/.test(String(n.text)) && String(n.text).includes(`⚙ → Plugins → ${plugin} → Program file`) && String(n.detail).includes(`⚙ → Plugins → ${plugin} → Program file`) && !/kernel|install|download/i.test(`${n.text} ${n.detail}`) && !`${n.text} ${n.detail}`.includes(UD) && !!(n.i18n && n.i18n.text && Object.values(PNW).includes(n.i18n.text.key) && Array.isArray(n.i18n.detail) && n.i18n.detail[0].key === PNW.detail);
  const tdU = todos.filter((x) => /"Owner program"/.test(String(x.text)));
  ok(tdU.length === 1 && progNoticeOk(tdU[0], 'Fixture User Engine') && /the program you named for Fixture User Engine cannot be run \(it is not there\)/.test(tdU[0].text) && (tdU[0].i18n.text.params.why || {}).key === PWW.missing,
    'L1b r2 MAJOR 2, the REAL keeper\'s road: the V1 refusal\'s For-you item names the plugin\'s Program file row and why («cannot be run (it is not there)») — no kernel / install / download word, no path; its i18n keys are the program words', tdU.map((x) => x.text));
  // V6: BOTH sources ⇒ refused by name; the download door ⇒ 409 engine_source_user
  const KJU = path.join(UROOT, 'data', 'plugins', UID, 'kernel.json');
  fs.writeFileSync(KJU, '{}');
  const pBoth = await ENGRU.probe(UID);
  fs.rmSync(KJU, { force: true });
  const e409 = await thr(() => ku.installEngineKernel(UID));
  const rsU = read('src/routes/browser.js');
  ok(!pBoth.ok && pBoth.code === 'browser_engine_protocol' && /names both a kernel\.json and an executablePath row — an engine has one source/.test(pBoth.error) && e409 && e409.code === 'engine_source_user' && /\bengine_source_user: 409\b/.test(rsU),
    'V6: an engine naming BOTH a kernel.json and the program row ⇒ refused by name (one source); the owner\'s program has no kernel to download: POST /api/browser/engines/:id/kernel ⇒ 409 engine_source_user', { pBoth: pBoth.error, e409: e409 && e409.code });
  // V3: the program row is written by the OWNER's cookie only — a bearer (an agent, a job, an automation key) is refused at the settings door
  const PR = require('../src/routes/persistence.js');
  const PD = path.join(ROOT, 'persist-v3'); fs.mkdirSync(PD, { recursive: true });
  PR.setup({ dataDir: PD, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => {} });
  const appP = expressE(); appP.use(expressE.json()); appP.use(PR.router);
  const srvP = await new Promise((r) => { const s = appP.listen(0, '127.0.0.1', () => r(s)); }); servers.add(srvP);
  const sreq = (method, body, bearer) => new Promise((r) => { const q = http.request({ host: '127.0.0.1', port: srvP.address().port, method, path: '/api/settings', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) } }, (res) => { let b = ''; res.on('data', (x) => { b += x; }); res.on('end', () => r({ status: res.statusCode, body: b })); }); q.end(JSON.stringify(body)); });
  const v3a = await sreq('PATCH', { [UROW]: '/tmp/evil' }, 'vsst_agent'), v3b = await sreq('POST', { [`plugin.${UID}.egressAllowlist`]: '.example' }, 'jbt_job'), v3c = await sreq('PATCH', { [UROW]: PROG }), v3d = await sreq('PATCH', { 'browser.headed': true }, 'vsst_agent');
  let stP = {}; try { stP = JSON.parse(fs.readFileSync(path.join(PD, 'settings.json'), 'utf8')); } catch { stP = {}; }
  ok(v3a.status === 403 && /engine_row_owner_only/.test(v3a.body) && v3b.status === 403 && v3c.status === 200 && stP[UROW] === PROG && v3d.status === 200,
    'V3: the program row (and the site list) are written by the OWNER only — a bearer\'s PATCH / POST naming them ⇒ 403 engine_row_owner_only (sign-in OFF too); the person\'s write lands; other settings unchanged for a bearer', { v3a: v3a.status, v3b: v3b.status, v3c: v3c.status, v3d: v3d.status });
  // L1b r2 (F1): ONE verdict for EVERY bearer write road — the file the write would LEAVE against the one stored: a bearer may neither set,
  // change nor DROP an engine row (a whole-file POST omitting them; a config import's settings section); the rows carried verbatim pass
  const preq = (method, p, body, bearer, port = srvP.address().port) => new Promise((r) => { const q = http.request({ host: '127.0.0.1', port, method, path: p, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) } }, (res) => { let b = ''; res.on('data', (x) => { b += x; }); res.on('end', () => r({ status: res.statusCode, body: b })); }); q.end(JSON.stringify(body)); });
  const readP = (d = PD) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'settings.json'), 'utf8')); } catch { return {}; } };
  const EROWU = `plugin.${UID}.egressAllowlist`;
  const c1 = await preq('PATCH', '/api/settings', { [EROWU]: 'listed.test' });
  const w1 = await preq('POST', '/api/settings', { 'browser.headed': false }, 'vsst_agent'); const st1 = readP();
  const w2 = await preq('POST', '/api/settings', { ...st1, 'browser.headed': false }, 'vsst_agent'); const st2 = readP();
  const w3 = await preq('PATCH', '/api/settings', { [UROW]: null }, 'vsst_agent');
  const w4 = await preq('PATCH', '/api/settings', { [UROW]: PROG, 'browser.headed': true }, 'vsst_agent');
  const impBody = (settings, sections = ['settings', 'bookmarks']) => ({ file: { app: 'vibespace-config', sections: { ...(settings ? { settings } : {}), bookmarks: [{ name: 'Imported', url: 'https://example.test/' }] } }, sections });
  const i1 = await preq('POST', '/api/config/import', impBody({ ...readP(), [UROW]: '/tmp/imported-evil' }), 'vsst_agent');
  const i2 = await preq('POST', '/api/config/import', impBody({ 'browser.headed': false }), 'jbt_job');
  const bm1 = fs.existsSync(path.join(PD, 'bookmarks.json')), st3 = readP();
  const i3 = await preq('POST', '/api/config/import', impBody(null, ['bookmarks']), 'vsst_agent');
  const i4 = await preq('POST', '/api/config/import', impBody({ ...readP(), [UROW]: path.join(UD, 'imported') }, ['settings']));
  const st4 = readP();
  ok(c1.status === 200 && w1.status === 403 && /engine_row_owner_only/.test(w1.body) && st1[UROW] === PROG && st1[EROWU] === 'listed.test' && w2.status === 200 && st2['browser.headed'] === false && st2[UROW] === PROG && st2[EROWU] === 'listed.test'
    && w3.status === 403 && w4.status === 200 && i1.status === 403 && i2.status === 403 && !bm1 && st3[UROW] === PROG && st3[EROWU] === 'listed.test' && i3.status === 200 && i4.status === 200 && st4[UROW] === path.join(UD, 'imported'),
    'V3 r2: a bearer\'s whole-file POST that OMITS the rows ⇒ 403 (they stay); the rows carried VERBATIM with another change ⇒ 200 (no false refusal); a bearer\'s PATCH dropping one ⇒ 403, naming its stored value again ⇒ 200; a bearer\'s config IMPORT setting or dropping one ⇒ 403 and NOTHING of it applied (all or nothing — its bookmarks too); an import without settings ⇒ 200; the owner\'s import lands', { c1: c1.status, w1: w1.status, w2: w2.status, w3: w3.status, w4: w4.status, i1: i1.status, i2: i2.status, bm1, i3: i3.status, i4: i4.status });
  // L1b r3: the import's section list is read ONCE — a NAME (a string) is the list of that one name for the guard and apply() alike;
  // any other shape is refused by name before anything is read
  const impS = (settings, sections) => ({ file: { app: 'vibespace-config', sections: { settings } }, sections });
  const s5a = readP();
  const i5 = await preq('POST', '/api/config/import', impS({ ...readP(), [UROW]: '/tmp/agent-chosen' }, 'settings'), 'vsst_agent');
  const st5 = readP();
  const i6 = await Promise.all([42, {}, [1], null].map((sv) => preq('POST', '/api/config/import', impS({ 'browser.headed': true }, sv), 'vsst_agent')));
  const st6 = readP();
  const i7 = await preq('POST', '/api/config/import', impS({ ...readP(), 'browser.headed': true }, 'settings'));
  const st7 = readP();
  ok(i5.status === 403 && /engine_row_owner_only/.test(i5.body) && st5[UROW] === s5a[UROW] && JSON.stringify(st5) === JSON.stringify(s5a) && i6.every((r) => r.status === 400 && /import_sections_invalid/.test(r.body)) && JSON.stringify(st6) === JSON.stringify(s5a) && i7.status === 200 && st7['browser.headed'] === true && st7[UROW] === s5a[UROW],
    'V3 r3: a bearer\'s import naming its sections as a STRING ("settings") is judged like the list — 403, nothing written; sections 42 / {} / [1] / null ⇒ 400 import_sections_invalid by name, nothing read; the owner\'s cookie import with a string still lands', { i5: i5.status, i6: i6.map((r) => r.status), i7: i7.status });
  // L1b r4: includeSensitive is read by the SAME one reader — a name or a list of names; any other shape refused naming includeSensitive
  const impI = (inc) => ({ file: { app: 'vibespace-config', sections: { bookmarks: [] } }, sections: [], includeSensitive: inc });
  const i8 = await Promise.all(['hosts', ['hosts']].map((v) => preq('POST', '/api/config/import', impI(v))));
  const i9 = await Promise.all([true, {}, null, 7].map((v) => preq('POST', '/api/config/import', impI(v))));
  const i10 = await preq('POST', '/api/config/import', impS({ 'browser.headed': false }, ''));
  ok(i8.every((r) => r.status === 200) && i9.every((r) => r.status === 400 && /includeSensitive must be a section name or a list of section names/.test(r.body) && /import_sections_invalid/.test(r.body)) && i10.status === 200 && /"applied":\[\]/.test(i10.body) && readP()['browser.headed'] === true,
    'V3 r4: includeSensitive read by the same one reader — "hosts" / ["hosts"] ⇒ 200; true / {} / null / 7 ⇒ 400 naming includeSensitive; sections "" ⇒ 200 applied [] (the name of no section: nothing written, no bypass)', { i8: i8.map((r) => r.status), i9: i9.map((r) => r.status), i10: i10.body });
  // V7: consent covers the row — a version that DROPS it drifts (switched off until re-enabled)
  const MANU = path.join(UROOT, 'data', 'plugins', UID, 'vibespace-plugin.json'), manU = fs.readFileSync(MANU, 'utf8');
  const mU = JSON.parse(manU);
  fs.writeFileSync(MANU, JSON.stringify({ ...mU, version: '0.0.2', contributes: { ...mU.contributes, settings: mU.contributes.settings.filter((s) => s.key !== 'executablePath') } }));
  LDRU.reload();
  const noteU = (LDRU.list().find((x) => x.id === UID) || {}).notice || '', trustedU = LDRU.isTrusted(UID), enabledU = (LDRU.list().find((x) => x.id === UID) || {}).enabled;
  fs.writeFileSync(MANU, manU); LDRU.reload(); LDRU.setEnabled(UID, true);
  const tv = Date.now(); while (!ENGRU.rows().length && Date.now() - tv < 8000) await new Promise((r) => setTimeout(r, 25));
  ok(!trustedU && enabledU === false && /capabilities changed since you trusted this plugin/.test(noteU) && LDRU.isTrusted(UID) && ENGRU.rows().length === 1,
    'V7: consent COVERS the program row — a version that drops it hashes differently ⇒ switched OFF (enabled === false) «capabilities changed since you trusted this plugin» (re-enable to accept it); the trusted manifest back ⇒ trusted again', { trustedU, enabledU, noteU });
  // ── L1b r2 ──
  // MAJOR 1 (a): a plugin never names the program — a manifest whose program row carries a default is REFUSED by name
  const PMu = require('../src/plugin-manifest.js');
  const defRows = mU.contributes.settings.map((s) => (s.key === 'executablePath' ? { ...s, default: PROG } : s));
  const vDef = PMu.validateManifest({ ...mU, contributes: { ...mU.contributes, settings: defRows } }, { hostVersion: '2.369.356' });
  // MAJOR 1 (b): the registry reads ONLY the owner's stored value — a row carrying a default (hand-built: the validator refuses one) and
  // nothing stored ⇒ no program set; the keeper launches nothing, and its For-you item names the Program file row (MAJOR 2)
  const stubLoader = { list: () => LDRU.list().map((x) => (x.id === UID ? { ...x, contributes: { ...x.contributes, settings: defRows } } : x)), askRoute: (...a) => LDRU.askRoute(...a) };
  const settingsD = { [`plugin.${UID}.egressAllowlist`]: 'listed.test' };
  const ENGD = require('../src/server/browser-engines.js').create({ loader: stubLoader, dataDir: path.join(UROOT, 'data'), timeoutMs: 2000, setting: (k) => settingsD[k] });
  const pD = await ENGD.probe(UID);
  settingsD[UROW] = PROG;
  const kD = mkKeeper(path.join(ROOT, 'data-user-default'), { engines: ENGD, engineDistribution: EDU, serverSetting: (k) => settingsD[k] });
  const pdD = kD.createProfile({ label: 'Default named', browser: { kind: 'plugin', id: UID } }, { engine: await kD.engineFactOf(UID) });
  delete settingsD[UROW];
  const nD = fake.launches().length;
  const eD = await thr(() => kD.start(pdD.id, { why: 'test' }));
  const tdD = todos.filter((x) => /"Default named"/.test(String(x.text)));
  try { kD.shutdown(); } catch { /* none */ }
  ok(!vDef.ok && vDef.errors.some((e) => /a plugin never names the program it runs; the executablePath row may not carry a default/.test(e)) && pD.ok && pD.fact.userBinary && pD.fact.userBinary.why === 'unset' && pD.fact.executable === false && !pD.fact.binaryPath
    && eD && eD.code === 'browser_engine_kernel_missing' && fake.launches().length === nD && tdD.length === 1 && progNoticeOk(tdD[0], 'Fixture User Engine') && /Fixture User Engine has no program set/.test(tdD[0].text),
    'L1b r2 MAJOR 1: a plugin never names the program it runs — (a) a manifest whose program row carries a default is refused by name; (b) the registry reads ONLY the owner\'s stored value: a row carrying a default + nothing stored ⇒ «no program set», NOTHING launched; MAJOR 2: its For-you item says «has no program set — open ⚙ → Plugins → … → Program file», never a kernel', { vDef: vDef.errors, pD: pD.ok ? { binaryPath: pD.fact.binaryPath, userBinary: pD.fact.userBinary } : pD, eD: eD && eD.code, td: tdD.map((x) => x.text) });
  // MAJOR 2, every why (PURE): the notice of each refused owner's program — its door, its why, never a kernel / install / download word;
  // the download source's notice unchanged
  const whysN = ['unset', 'missing', 'not-a-file', 'not-executable', 'script', 'platform', 'shape', 'blocked', 'unreadable'];
  const mns = whysN.map((w) => [w, BB.missingNotice({ label: 'Work', choice: { kind: 'plugin', id: UID }, code: w === 'unset' ? 'browser_engine_kernel_missing' : 'browser_engine_not_executable', engineLabel: 'Fixture User Engine', source: 'user', why: w })]);
  const badN = mns.filter(([w, n]) => !progNoticeOk(n, 'Fixture User Engine') || (w !== 'unset' && !(n.i18n.text.params.why && n.i18n.text.params.why.key === PWW[w] && String(n.text).includes(`(${PWW[w]})`)))).map(([w, n]) => [w, n.text]);
  const dlN = BB.missingNotice({ label: 'Work', choice: { kind: 'plugin', id: UID }, code: 'browser_engine_kernel_missing', engineLabel: 'Fixture User Engine' });
  ok(!badN.length && /Fixture User Engine has no program set — open ⚙ → Plugins → Fixture User Engine → Program file and name one/.test(mns[0][1].text) && /install its kernel again/.test(dlN.detail) && !dlN.i18n,
    'L1b r2 MAJOR 2: the For-you notice for EVERY refused owner\'s program (unset · missing · a folder · no x-bit · a script · another platform · not one path · a stalled mount · unreadable) names the Program file row and its why — never «kernel», «install» or «download», never a path; the download source keeps its own words', badN);
  // the minors (a) + (b): an OLDER download-source record of the same plugin id (a kernel + its measured 139) never stands for the owner's
  // program — the record ignored (said once), the program MEASURED at the launch, the row's version the program's
  const DS = path.join(ROOT, 'data-user-seeded'); fs.mkdirSync(DS, { recursive: true });
  fs.writeFileSync(path.join(DS, 'browser-engines.json'), JSON.stringify({ v: 1, engines: { [UID]: { kernel: { version: '139.0.7258.1', sha256: 'a'.repeat(64), installedAt: 1, source: 'download' }, measured: { version: '139.0.7258.1', says: 'Chromium 139.0.7258.1', at: 1, for: `sha256:${'a'.repeat(64)}:1` } } } }));
  const linesS = [];
  const EDS = require('../src/server/engine-distribution.js').create({ dataDir: DS, engines: ENGRU, loader: LDRU, log: { log: (m) => linesS.push(String(m)), warn: (m) => linesS.push(String(m)) } });
  settingsU[UROW] = PROG;
  const kS = mkKeeper(path.join(ROOT, 'data-user-seeded-k'), { engines: ENGRU, engineDistribution: EDS, serverSetting: (k) => settingsU[k] });
  const pS = kS.createProfile({ label: 'Seeded record', browser: { kind: 'plugin', id: UID } }, { engine: await kS.engineFactOf(UID) });
  await kS.start(pS.id, { why: 'test' });
  const rcS = kS._reg().browsers[pS.id].browserChoice, rowS = (await kS.engineRowsView()).find((e) => e.id === UID) || {};
  await kS.stop(pS.id, { why: 'user' });
  const saidS = linesS.filter((l) => /runs the program its owner names — the kernel this computer's record holds for it .* is ignored/.test(l));
  // a changed PATH with an identical stat (a second name for the same file) ⇒ another stamp ⇒ measured again (O2)
  const PROG2 = path.join(UD, 'browser2'); fs.symlinkSync(process.execPath, PROG2);
  settingsU[UROW] = PROG2;
  const pr2 = await ENGRU.probe(UID);
  const m2 = await EDS.measure(UID, { path: PROG2, stamp: pr2.ok ? pr2.fact.binaryStamp : null });
  // a STALE record (the owner names another program, not launched yet) ⇒ no version on the card, «not measured yet»; the ladder asks
  const PROG3 = path.join(UD, 'browser3'); fs.symlinkSync('/usr/bin/true', PROG3);
  settingsU[UROW] = PROG3;
  const rowT = (await kS.engineRowsView()).find((e) => e.id === UID) || {};
  const BMm = await import('../src/lib/browser-build-model.js');
  const noteT = BMm.engineNote(rowT, (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m)));
  const ladT = BB.browserChoiceVerdict({ choice: { kind: 'plugin', id: UID }, provider: 'chromium', by: 'user', engine: await kS.engineFactOf(UID), ladder: true, written: true, recordedMajor: 146, label: 'Seeded record' });
  settingsU[UROW] = PROG;
  try { kS.shutdown(); } catch { /* none */ }
  ok(rcS.version === nodeV && rowS.measuredVersion === nodeV && saidS.length === 1 && EDS.kernelFact(UID, { source: 'user', stamp: null }).state === 'absent' && pr2.ok && pr2.fact.binaryStamp !== (prOk.ok && prOk.fact.binaryStamp) && m2.cached === false && m2.version === nodeV,
    'L1b r2 minors (a)+(b): a download-source record an older version of the plugin left (a kernel + its measured 139) is IGNORED for the owner\'s program (said once in the journal) — the program is MEASURED at its launch and the row\'s version is ITS version; another path to the same file (same size + mtime) carries another stamp ⇒ measured again', { rcS: rcS.version, rowS: rowS.measuredVersion, said: saidS.length, stamp2: pr2.ok && pr2.fact.binaryStamp, m2 });
  ok(rowT.source === 'user' && rowT.measuredVersion === null && !rowT.binary && /not measured yet/.test(noteT) && !ladT.ok && ladT.code === 'downgrade_unknown' && ladT.needsConfirm === true && /the program you named is not measured yet/.test(String(ladT.error)),
    'L1b r2 minor (a): the owner names ANOTHER program (not launched yet) ⇒ the record\'s version (the previous file\'s) is not this one\'s: the card says «not measured yet», and Change build…\'s version ladder ASKS (downgrade_unknown, confirm once) instead of judging the new program by the old one\'s version', { rowT: { measuredVersion: rowT.measuredVersion, binary: rowT.binary }, noteT, ladT: { code: ladT.code, error: ladT.error } });
  // LOW: an execute-only program (0111) — the core cannot read its magic ⇒ `unreadable`, never «another platform's build»; a --version that
  // floods past the 64 KB cap is said as that
  const XO = path.join(UD, 'xonly'); fs.writeFileSync(XO, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])); fs.chmodSync(XO, 0o111);
  settingsU[UROW] = XO;
  const prX = await ENGRU.probe(UID);
  settingsU[UROW] = PROG;
  const FLOOD = path.join(UD, 'flood.sh'); fs.writeFileSync(FLOOD, '#!/bin/sh\nhead -c 200000 /dev/zero | tr "\\000" a\n', { mode: 0o755 });
  const EDF = require('../src/server/engine-distribution.js').create({ dataDir: path.join(ROOT, 'data-user-flood'), engines: ENGRU, loader: LDRU, log: { log() { }, warn() { } } });
  const mF = await EDF.measure(UID, { path: FLOOD, stamp: 'flood' });
  const rootRun = typeof process.getuid === 'function' && process.getuid() === 0; // root reads any file: the 0111 leg has no meaning there
  ok((rootRun || (prX.ok && prX.fact.userBinary && prX.fact.userBinary.why === 'unreadable' && /can't read the file to check it — give it read permission/.test(prX.fact.userBinary.error) && !prX.fact.userBinary.error.includes(UD))) && mF.ok === false && mF.error === 'printed more than 64 KB for --version',
    `L1b r2 LOW: an execute-only program (mode 0111) is refused as UNREADABLE («VibeSpace can't read the file to check it — give it read permission»), never «another platform's build»; a --version past the 64 KB cap is said «printed more than 64 KB for --version»${rootRun ? ' (the 0111 half skipped: running as root)' : ''}`, { x: prX.ok ? prX.fact.userBinary : prX, mF });
  // ── L1b r3: THE LAUNCHER SWITCHES — a plugin never names the program it runs through a launch switch either ──
  // PURE: the closed census (adding a row = editing this list), each refused BY NAME in every spelling Chromium reads as that switch; a
  // longer name / a value holding the text is not the switch; the real CloakBrowser wrapper's args (ce45ad8) pass; the two later walls
  const LSW = ENGN.LAUNCHER_SWITCHES || [];
  const LEXPECT = ['browser-subprocess-path', 'renderer-cmd-prefix', 'utility-cmd-prefix', 'gpu-launcher', 'zygote-cmd-prefix', 'plugin-launcher', 'ppapi-plugin-launcher', 'nacl-loader-cmd-prefix', 'nacl-gdb', 'ppapi-flash-path', 'register-pepper-plugins', 'screen-ai-binary', 'translate-kit-binary-path', 'clear-key-cdm-path-for-testing', 'test-gl-lib']; // r4: + the two library rows the Chrome 154 scan found
  const lvL = (args) => ENGN.engineAnswerVerdict('launchOptions', { status: 200, body: { executablePath: '/k/chrome', args } }, { id: UID, label: 'Fixture User Engine' });
  const spellL = (n) => [`--${n}=/tmp/other-program`, `--${n}`, `-${n}=/tmp/other-program`, `--${n.toUpperCase()}=/tmp/other-program`];
  const missL = LEXPECT.flatMap((n) => spellL(n).map((a) => [a, lvL(['--no-sandbox', a])])).filter(([a, r]) => !(r.ok === false && r.code === 'browser_engine_protocol' && r.launcher === a.split('=')[0] && String(r.error).includes(`launch names another program through ${a.split('=')[0]}; a plugin never names the program it runs`))).map(([a, r]) => [a, r.code || 'ok']);
  const passL = [['--no-sandbox', '--fingerprint=1234567'], ['--browser-subprocess-pathx=/x'], ['--my-gpu-launcher=/x'], ['--fingerprint=--browser-subprocess-path=/x'], ['--lang=--renderer-cmd-prefix'], ['--gpu-launcher-y']].filter((a) => lvL(a).ok !== true);
  const wallW = ENGN.engineWrapperText({ program: '/k/chrome', args: ['--gpu-launcher=/x'] }) || {}, wallA = { names: (ENGN.launcherArgsOf || (() => []))(['--x', '--Renderer-Cmd-Prefix=/x', '-nacl-gdb']) };
  const realW = ENGN.engineWrapperText({ program: '/k/chrome', args: ['--no-sandbox', '--fingerprint=1234567'] }) || {}, realA = { names: (ENGN.launcherArgsOf || (() => ['?']))(['--no-sandbox', '--fingerprint=1234567']) };
  ok(JSON.stringify(LSW.map((r) => r.name)) === JSON.stringify(LEXPECT) && Object.isFrozen(LSW) && LSW.every((r) => /^(program|library)$/.test(r.kind) && String(r.why).length > 20) && !missL.length && !passL.length
    && wallW.ok === false && /name another program through --gpu-launcher/.test(String(wallW.error)) && wallA.names.join() === '--Renderer-Cmd-Prefix,-nacl-gdb' && realW.ok === true && realA.names.length === 0,
    'L1b r3 PURE: THE LAUNCHER SWITCHES — a closed census of 15 (r4: + clear-key-cdm-path-for-testing, test-gl-lib; each with its kind + why); each refused BY NAME in the launch verdict as --x=v, --x, -x=v and any case («… names another program through <switch>; a plugin never names the program it runs»); --x-longer / a value holding the text pass; the real wrapper\'s --no-sandbox --fingerprint pass; the wrapper writer refuses them too, and launcherArgsOf (the attach road\'s wall in the keeper) names them', { missL, passL, wallW: wallW.error, wallA: wallA.names });
  // L1b r4: ONE READING — Chromium trims whitespace from an argument before it reads it as a switch, so every rule judges the TRIMMED
  // form (switchFormOf) and a padded argument is refused by name; inner whitespace in a value is not padding
  const PADS = [[' ', ''], ['\t', ''], ['\v', ''], ['\f', ''], ['', ' ']];
  const missP = LEXPECT.flatMap((n) => PADS.map(([pre, post]) => [`${pre}--${n}=/tmp/other-program${post}`, n])).map(([a, n]) => [a, n, lvL(['--no-sandbox', a])]).filter(([, n, r]) => !(r.ok === false && r.launcher === `--${n}` && String(r.error).includes(`names another program through --${n}; a plugin never names the program it runs`))).map(([a, , r]) => [JSON.stringify(a), r.code || 'ok']);
  const ownP = [[' --no-proxy-server', /asked for --no-proxy-server — the browser's proxy is VibeSpace's to set/], ['\t--proxy-pac-url=http://x.test/p', /asked for --proxy-pac-url/], [' --user-data-dir=/elsewhere', /asked for --user-data-dir — the debugging endpoint and the profile's directory are VibeSpace's/], [' --remote-debugging-port=1', /asked for --remote-debugging-port/], [' --foo', /starts or ends with whitespace .* an engine switch may not start or end with whitespace: Chromium would read « --x» as --x/], ['--foo ', /starts or ends with whitespace/], ['   ', /starts or ends with whitespace/]].filter(([a, re]) => { const r = lvL(['--no-sandbox', a]); return !(r.ok === false && r.code === 'browser_engine_protocol' && re.test(String(r.error))); }).map(([a]) => JSON.stringify(a));
  const innerP = [['--user-agent=Mozilla 5.0 (X11; Linux)'], ['--lang=en US'], ['--no-sandbox', '--fingerprint=1234567']].filter((a) => lvL(a).ok !== true);
  const wP1 = ENGN.engineWrapperText({ program: '/k/chrome', args: [' --browser-subprocess-path=/x'] }) || {}, wP2 = ENGN.engineWrapperText({ program: '/k/chrome', args: ['\t--foo'] }) || {};
  const lP = (ENGN.launcherArgsOf || (() => []))(['\v--nacl-gdb=/x', ' --Gpu-Launcher=/x ']), pP = (ENGN.paddedArgsOf || (() => []))(['--a', ' --b', '--c\t']);
  ok(!missP.length && !ownP.length && !innerP.length && wP1.ok === false && /through --browser-subprocess-path/.test(String(wP1.error)) && wP2.ok === false && /starts or ends with whitespace/.test(String(wP2.error)) && lP.join() === '--nacl-gdb,--Gpu-Launcher' && pP.length === 2,
    'L1b r4 PURE: ONE READING — every launcher row padded with a space / tab / \\v / \\f in front or a space behind ⇒ refused NAMING the switch; « --no-proxy-server», a tab-padded --proxy-pac-url, « --user-data-dir», « --remote-debugging-port» ⇒ refused by their own rules; any other padded argument ⇒ refused «… may not start or end with whitespace: Chromium would read « --x» as --x»; inner whitespace in a value (a user agent) and the real wrapper pass; the wrapper writer reads the same form', { missP: missP.slice(0, 6), ownP, innerP, wP1: wP1.error, wP2: wP2.error, lP, pP });
  // L1b r5: THE SWITCH-ONLY RULE — an engine launch argument must be a switch: a bare -- (Chromium's end of switches — the keeper's proxy
  // pair rides after it), a page, a path, a word ⇒ refused by name; the wrapper is never written with one
  const nsRef = ['--', '-', '---', 'about:blank', 'https://x.test/', '/tmp/x', 'foo bar'].filter((a) => { const r = lvL(['--no-sandbox', a]); return !(r.ok === false && r.code === 'browser_engine_protocol' && String(r.error).includes(`an engine launch takes switches only; «${a}» is not a switch (a page, a path or a bare -- would reorder what the browser reads)`)); });
  const nsOk = [['--x'], ['-x'], ['--x='], ['--x=a b c'], ['--x-y_z=1'], ['--no-sandbox', '--fingerprint=1234567']].filter((a) => lvL(a).ok !== true);
  const nelL = lvL(['\u0085--gpu-launcher=/x']);
  const wDash = ENGN.engineWrapperText({ program: '/k/chrome', args: ['--no-sandbox', '--', '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>'] }) || {};
  const ns5 = (ENGN.nonSwitchArgsOf || (() => ['?']))(['--a', '--', 'x', '--b=c d']);
  ok(!nsRef.length && !nsOk.length && nelL.ok === false && nelL.launcher === '--gpu-launcher' && wDash.ok === false && !wDash.text && /takes switches only; «--» is not a switch/.test(String(wDash.error)) && ns5.join() === '--,x',
    'L1b r5 PURE: THE SWITCH-ONLY RULE — «--» (the end of switches: the keeper\'s proxy pair would ride after it), «-», «---», a page, a URL, a path, «foo bar» ⇒ refused by name; --x, -x, --x=, --x=a b c, --x-y_z=1 and the real wrapper pass; a NEL (U+0085) in front of a launcher is trimmed and the switch named; the wrapper text for an answer with a bare -- is NEVER written', { nsRef, nsOk, nel: nelL.error, wDash: wDash.error, ns5 });
  // L1b r6: the For-you item says the RULE that refused and what it named — every launch rule, never «does not answer as an engine»
  const ruleN = [['--', 'switch-only', /named «--», which is not a browser switch — a plugin may send browser switches only/], [' --no-proxy-server', 'proxy', /asked to set the proxy of its browser \(--no-proxy-server\) — only VibeSpace sets that proxy/], [' --user-data-dir=/x', 'own', /asked for --user-data-dir — only VibeSpace sets the debugging endpoint and the profile folder/], [' --foo', 'padded', /named an argument with a space at its start or end \(« --foo»\) — a plugin may send browser switches only/]].map(([a, rule, re]) => {
    const v = lvL(['--no-sandbox', a]);
    const n = BB.missingNotice({ label: 'Work', choice: { kind: 'plugin', id: UID }, code: v.code, engineLabel: 'Fixture User Engine', source: 'user', launcher: v.launcher, rule: v.rule, arg: v.arg });
    return { a, ok: v.rule === rule && re.test(String(n.text)) && !/does not answer as an engine|kernel|install|download/i.test(`${n.text} ${n.detail}`) && !!n.i18n && n.i18n.text.key === (BB.PROGRAM_NOTICE_WORDS || {})[rule], text: n.text };
  });
  ok(lvL(['--x=a\u2028b', '--y=c\u2029d']).ok === true && lvL(['--x=a\nb']).ok === false, 'L1b r6: a VALUE holding U+2028 / U+2029 is a switch\'s value (SWITCH_FORM_RE carries the `s` flag) — a line break stays refused by the one-line rule');
  ok(ruleN.every((x) => x.ok), 'L1b r6 PURE: the verdict carries the RULE + what it named (switch-only · proxy · own · padded), and missingNotice says each as itself (en / zh / ja keys) — never «does not answer as an engine», never a kernel / install word', ruleN.filter((x) => !x.ok));
  // the person's OWN list on a wrapped launch keeps switches only (a bare -- would end the switches before the keeper's proxy pair)
  const wo = (ENGN.wrappedOwnArgs || ((l) => ({ args: l, dropped: [] })))(['--disable-x', '--', '--proxy-server=y', 'about:blank', '--keep=a b']);
  const DCr6 = require('../src/server/browser-display-config.js'), sayR6 = [];
  const WD6 = path.join(ROOT, 'wrapped-own'); fs.mkdirSync(path.join(WD6, 'display'), { recursive: true });
  const dc6 = DCr6.create({ dir: path.join(WD6, 'display'), writeJson: (f, o) => { fs.writeFileSync(f + '.t', JSON.stringify(o, null, 2)); fs.renameSync(f + '.t', f); }, log: { log() { }, warn: (m) => sayR6.push(String(m)) } });
  const base6 = path.join(WD6, 'base.json'); fs.writeFileSync(base6, JSON.stringify({ args: '--disable-gpu-compositing,--,--proxy-server=http://own.test:1' }));
  const wr6 = dc6.engineWrapperFor('bp-0000r6aa', { program: PROG, args: ['--no-sandbox', '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>'], env: {} });
  let cfg6 = null; try { cfg6 = JSON.parse(fs.readFileSync(dc6.engineFileFor(base6, { executablePath: wr6.file, args: ['--no-sandbox'], wrapped: true }), 'utf8')); } catch (e) { cfg6 = { error: e.message }; }
  const ks6 = read('src/server/browser-keeper.js'), envOf6 = ks6.slice(ks6.indexOf('  function engineEnvOf('), ks6.indexOf('  const engineBaseArgs = '));
  ok(wo.args.join() === '--disable-x,--keep=a b' && wo.dropped.join() === '--,about:blank' && wr6.ok && cfg6 && cfg6.args === '--disable-gpu-compositing' && sayR6.some((m) => /names «--» — not a switch, so it is left out of the wrapped engine view/.test(m))
    && /ENG\.wrappedOwnArgs\(/.test(envOf6) && !/ENG\.withoutProxyArgs\(/.test(envOf6) && /left out of this wrapped launch/.test(envOf6),
    'L1b r6: the PERSON\'s own list on a WRAPPED launch keeps switches only — a bare «--» or a page there is DROPPED by name (said in the journal: their config is theirs, never refused), the proxy switches as before; the conversation road\'s derived config proves it, the profile road (engineEnvOf) reads the same helper', { wo, cfg6, said: sayR6 });
  // THE REAL registry + keeper: the user source (the fixture's launch answer bent to name one) ⇒ refused by name, NOTHING launched, the
  // For-you words name the switch; the download source (⑦'s fixture engine, its kernel in place) ⇒ the same refusal
  fs.mkdirSync(path.dirname(MODEU), { recursive: true }); fs.writeFileSync(MODEU, JSON.stringify({ launch: { args: ['--no-sandbox', '--browser-subprocess-path=/usr/bin/true'] } }));
  settingsU[UROW] = PROG;
  const loU = await ENGRU.launchOptions(UID, { profileId: 'bp-00000000', binaryPath: PROG });
  const pLn = ku.createProfile({ label: 'Launcher named', browser: { kind: 'plugin', id: UID } }, { engine: await ku.engineFactOf(UID) });
  const nLn = fake.launches().length;
  const eLn = await thr(() => ku.start(pLn.id, { why: 'test' }));
  fs.rmSync(MODEU, { force: true });
  if (!eLn) await thr(() => ku.stop(pLn.id, { why: 'user' })); // a red run (a tree without the census) started it: never left behind
  const tdLn = todos.filter((x) => /"Launcher named"/.test(String(x.text)));
  // L1b r6: a bare «--» and a padded « --no-proxy-server» in the launch answer ⇒ refused, nothing launched, and the For-you item says the rule
  const r6k = [];
  for (const [label, arg, re] of [['Dash answer', '--', /named «--», which is not a browser switch/], ['Proxy answer', ' --no-proxy-server', /asked to set the proxy of its browser \(--no-proxy-server\)/]]) {
    fs.writeFileSync(MODEU, JSON.stringify({ launch: { args: ['--no-sandbox', arg] } }));
    const pr6 = ku.createProfile({ label, browser: { kind: 'plugin', id: UID } }, { engine: await ku.engineFactOf(UID) });
    const n6 = fake.launches().length, e6 = await thr(() => ku.start(pr6.id, { why: 'test' }));
    if (!e6) await thr(() => ku.stop(pr6.id, { why: 'user' })); // a red run started it: never left behind
    const td6 = todos.filter((x) => String(x.text).startsWith(`"${label}"`));
    r6k.push({ label, ok: !!e6 && fake.launches().length === n6 && td6.length === 1 && re.test(td6[0].text) && !/does not answer as an engine/.test(td6[0].text), text: td6.map((x) => x.text) });
  }
  fs.rmSync(MODEU, { force: true });
  ok(r6k.every((x) => x.ok), 'L1b r6: through the REAL keeper — a launch answer holding «--» or « --no-proxy-server» is refused, NOTHING launched, and the For-you item names the rule + the argument (never «does not answer as an engine»)', r6k);
  fs.mkdirSync(path.dirname(MODE), { recursive: true }); fs.writeFileSync(MODE, JSON.stringify({ launch: { args: ['--utility-cmd-prefix=/usr/bin/true'] } }));
  const loD = fs.existsSync(KP) ? await ENGR.launchOptions(EID, { profileId: 'bp-00000000', binaryPath: KP }) : { ok: null, error: 'no kernel in its place' };
  fs.rmSync(MODE, { force: true });
  ok(loU.ok === false && loU.launcher === '--browser-subprocess-path' && eLn && eLn.code === 'browser_engine_protocol' && /names another program through --browser-subprocess-path/.test(eLn.message) && fake.launches().length === nLn
    && tdLn.length === 1 && /"Launcher named" cannot start: Fixture User Engine names another program through --browser-subprocess-path — a plugin never names the program it runs/.test(tdLn[0].text) && !!tdLn[0].i18n && tdLn[0].i18n.text.key === (BB.PROGRAM_NOTICE_WORDS || {}).launcher && tdLn[0].i18n.text.params.switch === '--browser-subprocess-path'
    && loD.ok === false && loD.launcher === '--utility-cmd-prefix',
    'L1b r3: through the REAL registry + keeper — the owner\'s-program engine\'s launch naming --browser-subprocess-path ⇒ refused by name, NOTHING launched, the For-you item names the switch (with its i18n); the download-source engine naming --utility-cmd-prefix ⇒ the same refusal', { loU: loU.error, eLn: eLn && eLn.message, td: tdLn.map((x) => x.text), loD: loD.error });
  // RED COPY: a registry that TRUSTS the plugin's word (no core verdict) launches the program the plugin claims — a missing one
  const MUTU = mutantCopies('badm-user', REPO);
  const bes = read('src/server/browser-engines.js');
  const overlay = 'installed: !!(fact && (fact.usable || fact.why === \'not-executable\')), executable: v.ok, userBinary: v.ok ? null : { code: v.code, why: v.why, error: v.error } } };';
  if (!bes.includes(overlay)) ok(false, 'control (u): the anchor (the core\'s verdict over the plugin\'s word) is not in this tree', overlay);
  else {
    const RU = MUTU.load('src/server/browser-engines.js', editAnchor(bes, overlay, 'userBinary: null } };', "src/server/browser-engines.js"), 'trust-plugin').create({ loader: LDRU, dataDir: path.join(UROOT, 'data'), timeoutMs: 2000, setting: (k) => settingsU[k] });
    settingsU[UROW] = path.join(UD, 'gone');
    const pTrust = await RU.probe(UID);
    const vTrust = pTrust.ok ? ENGN.engineChoiceVerdict({ choice: { kind: 'plugin', id: UID }, engine: { ...pTrust.fact, executable: true } }) : null;
    ok(pTrust.ok && pTrust.fact.installed === true && vTrust && vTrust.ok === true && vTrust.executablePath === path.join(UD, 'gone'), 'control (u): a registry that TRUSTS the plugin\'s installed:true hands THE choice verdict a missing program it would START — exactly what V1 catches', { fact: pTrust.ok && pTrust.fact, vTrust });
  }
  // L1b r3 controls — (l) a launch verdict without the launcher census accepts a plugin naming another program
  const engsL = read('src/browser-engines.js'), lAnchor = 'const LAUNCHER_ARG_RE = new RegExp(`^--?(?:${LAUNCHER_SWITCHES.map((r) => r.name).join(\'|\')})(?:=|$)`, \'i\');';
  if (!engsL.includes(lAnchor)) ok(false, 'control (l): the anchor (the launcher census\'s pattern) is not in this tree', lAnchor);
  else {
    const EL = MUTU.load('src/browser-engines.js', editAnchor(engsL, lAnchor, 'const LAUNCHER_ARG_RE = /(?!)/;', "src/browser-engines.js"), 'no-launchers');
    const vl = EL.engineAnswerVerdict('launchOptions', { status: 200, body: { executablePath: '/k/chrome', args: ['--no-sandbox', '--browser-subprocess-path=/usr/bin/true'] } }, { id: UID });
    ok(vl.ok === true && vl.launch.args.includes('--browser-subprocess-path=/usr/bin/true'), 'control (l): a launch verdict without the launcher census ACCEPTS a plugin naming another program through --browser-subprocess-path — exactly what r3 catches', vl);
  }
  // (w) the UNTRIMMED reading (r3's): a tab in front of a launcher switch passes the verdict — what Chromium then reads as the switch
  const wAnchor = "function switchFormOf(a) { return String(a == null ? '' : a).replace(/^[\\s\\u0085]+|[\\s\\u0085]+$/g, ''); }";
  if (!engsL.includes(wAnchor)) ok(false, 'control (w): the anchor (the one trimmed reading) is not in this tree', wAnchor);
  else {
    const EW = MUTU.load('src/browser-engines.js', editAnchor(engsL, wAnchor, "function switchFormOf(a) { return String(a == null ? '' : a); }", "src/browser-engines.js"), 'untrimmed');
    const vw = EW.engineAnswerVerdict('launchOptions', { status: 200, body: { executablePath: '/k/chrome', args: ['--no-sandbox', '\t--browser-subprocess-path=/usr/bin/true', ' --no-proxy-server'] } }, { id: UID });
    const vw5 = EW.engineAnswerVerdict('launchOptions', { status: 200, body: { executablePath: '/k/chrome', args: ['--no-sandbox', '\t--browser-subprocess-path=/usr/bin/true'] } }, { id: UID });
    ok(vw.launcher !== '--browser-subprocess-path' && vw5.launcher !== '--browser-subprocess-path' && !/proxy is VibeSpace/.test(String(vw.error)), 'control (w): the UNTRIMMED reading never NAMES «\\t--browser-subprocess-path=…» nor « --no-proxy-server» as the switches Chromium trims them into (r5\'s switch-only rule still stops them, unnamed) — exactly what r4\'s «refused NAMING the switch» catches', { vw, vw5 });
  }
  // (s) a launch without the switch-only rule: a bare -- passes, and the wrapper writes the keeper's proxy pair AFTER it (read as pages)
  const sAnchor = 'const SWITCH_FORM_RE = /^--?[A-Za-z0-9][A-Za-z0-9_-]*(?:=.*)?$/s;'; // r6: the `s` flag
  if (!engsL.includes(sAnchor)) ok(false, 'control (s): the anchor (the switch-only rule) is not in this tree', sAnchor);
  else {
    const ES = MUTU.load('src/browser-engines.js', editAnchor(engsL, sAnchor, 'const SWITCH_FORM_RE = /(?:)/;', "src/browser-engines.js"), 'any-argument');
    const vs = ES.engineAnswerVerdict('launchOptions', { status: 200, body: { executablePath: '/k/chrome', args: ['--no-sandbox', '--'] } }, { id: UID });
    const ws = ES.engineWrapperText({ program: '/k/chrome', args: [...(vs.ok ? vs.launch.args : []), '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>'] });
    ok(vs.ok === true && ws.ok === true && /'--' '--proxy-server=http:\/\/127\.0\.0\.1:1'/.test(ws.text), 'control (s): without the switch-only rule a bare «--» passes and the wrapper writes the keeper\'s proxy pair AFTER the end of switches — exactly what r5 catches', ws.ok ? ws.text.split('\n').pop() || ws.text.split('\n').at(-2) : ws);
  }
  // (i) the import read by two readers (the guard asks Array.isArray, apply() asks .includes) lets a bearer's STRING sections through
  const pssI = read('src/routes/persistence.js');
  const iA1 = 'const sections = namesOf(sectionsAsked), includeSensitive = namesOf(sensitiveAsked);', iA2 = "if (sections.includes('settings') && file.sections.settings && typeof file.sections.settings === 'object' && refuseEngineRows(";
  if (!pssI.includes(iA1) || !pssI.includes(iA2)) ok(false, 'control (i): the anchors (the section list read once) are not in this tree', { iA1: pssI.includes(iA1), iA2: pssI.includes(iA2) });
  else {
    const PRi = MUTU.load('src/routes/persistence.js', editAnchor(editAnchor(pssI, iA1, 'const sections = sectionsAsked, includeSensitive = sensitiveAsked;', "src/routes/persistence.js"), iA2, "if (Array.isArray(sections) && sections.includes('settings') && file.sections.settings && typeof file.sections.settings === 'object' && refuseEngineRows(", "src/routes/persistence.js"), 'two-readers');
    const PDi = path.join(ROOT, 'persist-v3-two-readers'); fs.mkdirSync(PDi, { recursive: true });
    PRi.setup({ dataDir: PDi, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => {} });
    const appI = expressE(); appI.use(expressE.json()); appI.use(PRi.router);
    const srvI = await new Promise((r) => { const s = appI.listen(0, '127.0.0.1', () => r(s)); }); servers.add(srvI);
    await preq('PATCH', '/api/settings', { [UROW]: PROG }, null, srvI.address().port);
    const wi = await preq('POST', '/api/config/import', { file: { app: 'vibespace-config', sections: { settings: { [UROW]: '/tmp/agent-chosen' } } }, sections: 'settings' }, 'vsst_agent', srvI.address().port);
    ok(wi.status === 200 && readP(PDi)[UROW] === '/tmp/agent-chosen', 'control (i): an import whose guard and apply() read the section list two ways lets a bearer\'s sections:"settings" REPLACE the owner\'s program row — exactly what V3 r3 catches', { status: wi.status, row: readP(PDi)[UROW] });
  }
  // L1b r2 controls — (d) a registry whose program path falls back to the MANIFEST's default runs the program the PLUGIN named
  const upAnchor = "const userPathOf = (id) => { let v; try { v = setting(BE.binaryRowPath(id)); } catch { v = undefined; } return typeof v === 'string' ? v.trim() : ''; };";
  if (!bes.includes(upAnchor)) ok(false, 'control (d): the anchor (the owner\'s stored value only) is not in this tree', upAnchor);
  else {
    const RD = MUTU.load('src/server/browser-engines.js', editAnchor(bes, upAnchor, "const userPathOf = (id) => { let v; try { v = setting(BE.binaryRowPath(id)); } catch { v = undefined; } const r = tableRows().find((x) => x.id === id); const d = r ? (r.settings.find((s) => s.key === 'executablePath') || {}).default : ''; return String(typeof v === 'string' ? v : d || '').trim(); };", "src/server/browser-engines.js"), 'manifest-default').create({ loader: stubLoader, dataDir: path.join(UROOT, 'data'), timeoutMs: 2000, setting: (k) => settingsD[k] });
    delete settingsD[UROW];
    const pM = await RD.probe(UID);
    ok(pM.ok && pM.fact.binaryPath === PROG && pM.fact.executable === true, 'control (d): a registry whose program path falls back to the manifest row\'s DEFAULT runs the program the PLUGIN named while the owner stored nothing — exactly what MAJOR 1 (b) catches', pM.ok ? { binaryPath: pM.fact.binaryPath } : pM);
  }
  // (n) a notice blind to the engine's source says «install its kernel again» for the owner's program
  const bbsU = read('src/browser-builds.js'), nAnchor = "if (c.kind === 'plugin' && source === 'user' && (code === 'browser_engine_kernel_missing' || code === 'browser_engine_not_executable')) {";
  if (!bbsU.includes(nAnchor)) ok(false, 'control (n): the anchor (the owner\'s program notice) is not in this tree', nAnchor);
  else {
    const nm = MUTU.load('src/browser-builds.js', editAnchor(bbsU, nAnchor, 'if (false) {', "src/browser-builds.js"), 'kernel-words').missingNotice({ label: 'Work', choice: { kind: 'plugin', id: UID }, code: 'browser_engine_kernel_missing', engineLabel: 'Fixture User Engine', source: 'user', why: 'unset' });
    ok(!progNoticeOk(nm, 'Fixture User Engine') && /kernel is not installed/.test(nm.text), 'control (n): a notice blind to the engine\'s source tells the owner its «kernel is not installed» — exactly what MAJOR 2 catches', nm.text);
  }
  // (p) the settings door judging only the keys a body NAMES lets a bearer's whole-file POST erase the owner's rows
  const pssU = read('src/routes/persistence.js'), cmpAnchor = 'return [...keys].filter((k) => Object.hasOwn(cur, k) !== Object.hasOwn(nxt, k) || JSON.stringify(cur[k]) !== JSON.stringify(nxt[k]));';
  if (!pssU.includes(cmpAnchor)) ok(false, 'control (p): the anchor (the stored rows against the would-be file) is not in this tree', cmpAnchor);
  else {
    const PRm = MUTU.load('src/routes/persistence.js', editAnchor(pssU, cmpAnchor, 'return Object.keys(req.body && typeof req.body === \'object\' ? req.body : {}).filter((k) => RE.test(k));', "src/routes/persistence.js"), 'names-only');
    const PDm = path.join(ROOT, 'persist-v3-mut'); fs.mkdirSync(PDm, { recursive: true });
    PRm.setup({ dataDir: PDm, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => {} });
    const appM = expressE(); appM.use(expressE.json()); appM.use(PRm.router);
    const srvM = await new Promise((r) => { const s = appM.listen(0, '127.0.0.1', () => r(s)); }); servers.add(srvM);
    await preq('PATCH', '/api/settings', { [UROW]: PROG }, null, srvM.address().port);
    const wm = await preq('POST', '/api/settings', { 'browser.headed': false }, 'vsst_agent', srvM.address().port);
    ok(wm.status === 200 && readP(PDm)[UROW] === undefined, 'control (p): a settings door judging only the keys a body NAMES lets a bearer\'s whole-file POST ERASE the owner\'s program row — exactly what V3 r2 catches', { status: wm.status });
  }
  settingsU[UROW] = PROG;
  try { ku.shutdown(); } catch { /* none */ }
  LDRU.setEnabled(UID, false);
}
// ⑦ controls: patched copies the gates above must turn red
{
  const MUT = mutantCopies('badm-engine', REPO);
  const ks = read('src/server/browser-keeper.js');
  const anchor = "    if (!v.ok) { if (v.code !== 'browser_engine_unanswered') noteBuildMissing(p, c, v, engine); throw namedError(v.code, v.error, { engine: c.id, ...(v.failed ? { failed: v.failed } : {}) }); }";
  // lane engine-args-string r2: the wrapper step refuses a launch with no program by name — the mutant also skips it (a keeper
  // that falls back to Chrome would): absent on an older tree, that second patch is a no-op
  const fb = editAnchor(editAnchor(ks, anchor, "    if (!v.ok) return {};", "src/server/browser-keeper.js"), '        const ew = engineProgramOf(p, buildEnv);', '        const ew = buildEnv.executablePath ? engineProgramOf(p, buildEnv) : { program: null, args: [] };', "src/server/browser-keeper.js");
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
  const open = editAnchor(es, envAnchor, "    const extra = [];", "src/browser-engines.js");
  ok(es.includes(envAnchor) && open !== es, 'control (f): the patch (an engine verdict that lets any env key through) applies');
  const ENo = MUT.load('src/browser-engines.js', open, 'env-open');
  ok(ENo.engineAnswerVerdict('launchOptions', { status: 200, body: { executablePath: '/k/chrome', args: [], env: { LD_PRELOAD: '/x' } } }, { id: EID }).ok === true, 'control (f): …LD_PRELOAD rides the browser\'s env — exactly what ⑦\'s browser_engine_env row catches');
  // lane engine-spi-egress: (g) the OLD own-argument rule — a plugin's proxy rides; (h) a keeper that does not wrap — the browser unproxied
  const ownAnchor = "const OWN_ARG_RE = /^--?(?:remote-debugging-(?:port|pipe|address)|user-data-dir|proxy-server|proxy-bypass-list|proxy-pac-url|winhttp-proxy-resolver|no-proxy-server|proxy-auto-detect)(?:=|$)/;";
  const proxAnchor = '    const proxied = args.map(switchFormOf).filter((a) => PROXY_ARG_RE.test(a));'; // L1b r4: the rule reads the trimmed form
  const ENg = MUT.load('src/browser-engines.js', editAnchor(editAnchor(es, ownAnchor, 'const OWN_ARG_RE = /^--(?:remote-debugging-(?:port|pipe|address)|user-data-dir)(?:=|$)/;', "src/browser-engines.js"), proxAnchor, '    const proxied = [];', "src/browser-engines.js"), 'old-own-args');
  ok(es.includes(ownAnchor) && es.includes(proxAnchor) && ENg.engineAnswerVerdict('launchOptions', { status: 200, body: { executablePath: '/k/chrome', args: ['--proxy-server=http://evil.test:8080'] } }, { id: EID }).ok === true, 'control (g): the base\'s own-argument rule ACCEPTS a plugin\'s --proxy-server — exactly what ⑦\'s V1 row catches');
  const wrapAnchor = '    const egress = engine.egress || pproxy ? await egressUrlFor(p.id, { engine: c.id, label: engine.label || \'\', ...(engine.egress ? { setting: engine.egress.setting, fallback: engine.egress.default } : {}), ...(pproxy ? { proxy: pproxy } : {}) }) : null;';   // B-8b87: + a profile's proxy rides the same egress pair
  if (!ks.includes(wrapAnchor)) ok(false, 'control (h): the anchor (the keeper\'s wrap) is not in this tree', wrapAnchor);
  else await (async () => {
  const Kw = MUT.load('src/server/browser-keeper.js', editAnchor(ks, wrapAnchor, '    const egress = null;', "src/server/browser-keeper.js"), 'no-wrap');
  fs.mkdirSync(path.join(ROOT, 'data-cw'), { recursive: true });
  LDRG.setEnabled(GID, true);
  const tw = Date.now(); while (!ENGRG.rows().length && Date.now() - tw < 8000) await new Promise((r) => setTimeout(r, 25));
  const kw = Kw.create({ dataDir: path.join(ROOT, 'data-cw'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, engines: ENGRG });
  const pw = kw.createProfile({ label: 'Unwrapped', browser: { kind: 'plugin', id: GID } }, { engine: await kw.engineFactOf(GID) });
  await kw.start(pw.id, { why: 'control' });
  const lw = String(fake.launches().at(-1).args || '');
  ok(ks.includes(wrapAnchor) && !/--proxy-server=/.test(lw) && !(wrapperOf(fake.launches().at(-1).exe) || { args: [] }).args.some((a) => /proxy-server/.test(a)) && /--vibespace-keeper=/.test(lw), 'control (h): a keeper that does not wrap launches the egress engine with NO proxy — its browser would reach any host; exactly what ⑦b\'s «the keeper wraps it» catches', lw);
  try { await kw.stop(pw.id, { why: 'user' }); } catch { /* none */ }
  try { kw.shutdown(); } catch { /* none */ }
  LDRG.setEnabled(GID, false);
  })();
  // control (i): --permission import confinement (capabilities.server = {}, no childProcess; only pluginDir + stateDir readable)
  {
    const cpG = require('child_process');
    const osG = require('os');
    const fkUrl = path.join(REPO, 'scripts/fixtures/fake-kernel.mjs');
    const nmLink = path.join(REPO, 'node_modules');
    const nmReal = fs.realpathSync(nmLink);
    const fkRun = cpG.spawnSync(process.execPath, [
      '--permission',
      `--allow-fs-read=${path.join(REPO, 'scripts/fixtures')}`,
      `--allow-fs-read=${fs.realpathSync(path.join(REPO, 'scripts/fixtures'))}`,
      `--allow-fs-read=${nmLink}`,
      `--allow-fs-read=${nmReal}`,
      `--allow-fs-read=${path.join(REPO, 'package.json')}`,
      `--allow-fs-read=${fs.realpathSync(path.join(REPO, 'package.json'))}`,
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify('file://' + fkUrl)}); if (m.KINDS.length !== 20 || m.FEATURES.length !== 3) process.exit(2);`,
    ], {
      cwd: osG.tmpdir(),
      env: { PATH: '/nonexistent-outside-sandbox/bin:/usr/bin', HOME: '/nonexistent-outside-sandbox/home' },
      encoding: 'utf8',
    });
    ok(fkRun.status === 0, 'fake-kernel.mjs imports cleanly under node --permission without touching paths outside its allowed read roots', { status: fkRun.status, stderr: fkRun.stderr });

    const mkSandboxRoot = (tag, topProbeLine) => {
      const sr = path.join(ROOT, `sandbox-${tag}`);
      const pdir = path.join(sr, 'data', 'plugins', EID);
      fs.mkdirSync(path.join(pdir, 'src'), { recursive: true });
      const baseMan = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/vibespace-plugin.json'), 'utf8'));
      fs.writeFileSync(path.join(pdir, 'vibespace-plugin.json'), JSON.stringify({ ...baseMan, capabilities: { server: {} } }, null, 2));
      fs.writeFileSync(path.join(pdir, 'src', 'index.mjs'), [
        "import fs from 'node:fs';",
        "import path from 'node:path';",
        topProbeLine,
        "const KINDS = ['js-dialog','http-auth','client-cert','permission','file-chooser','download','print','popup','select-popup','webauthn','credential','payment-request','external-protocol','interstitial','fullscreen','pointer-lock','media-picker','device-chooser','native-picker','suppressed'];",
        "const canRead = (p) => typeof p === 'string' && p.startsWith('/') && (!process.permission || process.permission.has('fs.read', p));",
        "export function probeBinary(input = {}) {",
        "  const stateDir = process.env.VIBESPACE_PLUGIN_DATA || '';",
        "  const bin = String(input.binaryPath || path.join(stateDir, 'kernel', 'linux-x64', 'chrome'));",
        "  let installed = false, executable = false;",
        "  if (canRead(bin)) { try { installed = fs.statSync(bin).isFile(); if (installed) { fs.accessSync(bin, fs.constants.X_OK); executable = true; } } catch {} }",
        "  return { id: 'vibespace.custom-browser', installed, executable, binaryPath: bin, version: null, declaredVersion: '150.0.7871.186-vs1', protocol: 1, kinds: KINDS, features: ['surfaces', 'webauthn', 'credentials'], capabilities: { dmtg: { available: false, code: 'dmtg_unavailable', reason: 'child_process_disabled' } } };",
        "}",
        "export function resolveLaunch(input = {}) {",
        "  const stateDir = process.env.VIBESPACE_PLUGIN_DATA || '';",
        "  const bin = String(input.binaryPath || path.join(stateDir, 'kernel', 'linux-x64', 'chrome'));",
        "  return { executablePath: bin, binaryPath: bin, args: ['--no-first-run'], env: {}, capabilities: { dmtg: { available: false, code: 'dmtg_unavailable', reason: 'child_process_disabled' } } };",
        "}",
      ].join('\n'));
      fs.writeFileSync(path.join(pdir, 'server.js'), [
        "'use strict';",
        "process.send({ t: 'hello', api: 1 });",
        "process.on('message', async (msg) => {",
        "  if (!msg || typeof msg !== 'object') return;",
        "  if (msg.t === 'shutdown') process.exit(0);",
        "  if (msg.t !== 'route') return;",
        "  try {",
        "    const mod = await import('./src/index.mjs');",
        "    const input = { ...(msg.query || {}), ...(msg.body && typeof msg.body === 'object' ? msg.body : {}) };",
        "    if (msg.path === '/probe') return process.send({ t: 'route-reply', id: msg.id, status: 200, body: mod.probeBinary(input) });",
        "    if (msg.path === '/resolve-launch' || msg.path === '/launch-options') return process.send({ t: 'route-reply', id: msg.id, status: 200, body: mod.resolveLaunch(input) });",
        "    process.send({ t: 'route-reply', id: msg.id, status: 404, body: { error: 'not found' } });",
        "  } catch (err) {",
        "    process.send({ t: 'route-reply', id: msg.id, status: 500, body: { error: err.message, ...(err && err.code ? { code: err.code } : {}) } });",
        "  }",
        "});",
      ].join('\n'));
      const ldrS = require('../src/server/plugin-loader.js').create({
        rootDir: sr,
        app: expressE(),
        hostVersion: '2.369.356',
        log: { log() {}, warn() {} },
        agentEnv: () => ({ PATH: '/nonexistent-outside-sandbox/bin:/usr/bin', HOME: '/nonexistent-outside-sandbox/home' }),
      });
      const engrS = require('../src/server/browser-engines.js').create({ loader: ldrS, dataDir: path.join(sr, 'data'), timeoutMs: 2000 });
      return { sr, ldrS, engrS };
    };

    // Clean lazy-guarded plugin: /probe and /resolve-launch (/launch-options) both answer 200 under --permission with no childProcess
    const goodS = mkSandboxRoot('clean', '// zero import-time filesystem probes');
    goodS.ldrS.setEnabled(EID, true, { trusted: true });
    const wGood = async () => { const t0 = Date.now(); while (goodS.engrS.rows().length !== 1 && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 25)); return goodS.engrS.rows().length === 1; };
    ok(await wGood(), 'sandbox clean plugin: starts under node --permission (capabilities.server = {}, no childProcess)');
    const prGood = await goodS.engrS.probe(EID);
    const loGood = await goodS.engrS.launchOptions(EID, { profileId: 'bp-sbx', binaryPath: goodS.engrS.kernelPath(EID), userDataDir: '/outside/sandbox/profile' });
    const loRaw = await goodS.ldrS.askRoute(EID, { method: 'POST', path: '/launch-options', body: { profileId: 'bp-sbx' } });
    ok(prGood.ok && prGood.fact.installed === false && prGood.fact.version === null && !prGood.fact.features.includes('dmtg') && loGood.ok && loGood.launch.executablePath === goodS.engrS.kernelPath(EID) && loRaw.status === 200 && loRaw.body.capabilities.dmtg.available === false,
      'sandbox clean plugin: import touches no outside-sandbox path — /probe, /resolve-launch and /launch-options all answer 200 (dmtg unavailable by name)', { prGood, loGood });
    goodS.ldrS.shutdown();

    // Planted RED control: an import-time fs.existsSync outside VIBESPACE_PLUGIN_DIR / VIBESPACE_PLUGIN_DATA (the v0.1.4 bug) fails 500 ERR_ACCESS_DENIED
    const badS = mkSandboxRoot('outside-probe', "const BAD_PY = fs.existsSync(path.join(process.env.HOME || '/nonexistent', '.local/bin/python3')); void BAD_PY;");
    badS.ldrS.setEnabled(EID, true, { trusted: true });
    const wBad = async () => { const t0 = Date.now(); while (badS.engrS.rows().length !== 1 && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 25)); return badS.engrS.rows().length === 1; };
    ok(await wBad(), 'control (i): the planted plugin with an import-time outside-sandbox fs.existsSync starts its IPC loop');
    const prBad = await badS.engrS.probe(EID);
    const rawBad = await badS.ldrS.askRoute(EID, { method: 'GET', path: '/probe', query: {} });
    ok(!prBad.ok && prBad.code === 'browser_engine_protocol' && rawBad.status === 500 && rawBad.body && rawBad.body.code === 'ERR_ACCESS_DENIED',
      'control (i): an import-time fs.existsSync outside VIBESPACE_PLUGIN_DIR / VIBESPACE_PLUGIN_DATA throws ERR_ACCESS_DENIED ⇒ HTTP 500 browser_engine_protocol — RED against the sandbox confinement law', { prBad, rawBad });
    // B-a470 — the owner's 2026-11-01 install, reproduced: the plugin answers {error: err.message, code: err.code} (no resource) under
    // the REAL node --permission ⇒ the refusal quotes ERR_ACCESS_DENIED + Node's message and says the plugin went outside its folder
    ok(prBad.failed && prBad.failed.code === 'ERR_ACCESS_DENIED' && prBad.failed.status === 500 && prBad.error.includes('failed its probe (HTTP 500 — ERR_ACCESS_DENIED: Access to this API has been restricted') && /outside its declared capabilities/.test(prBad.error) && !/does not speak/.test(prBad.error),
      'B-a470 (the real sandbox): the plugin\'s own ERR_ACCESS_DENIED is quoted — its code, Node\'s message, the loader\'s denied words and the hint — never the generic protocol sentence', prBad.error);
    badS.ldrS.shutdown();
  }
}

// ═══ ⑦e B-9584 U2a — A PROFILE'S OWN ENVIRONMENT ON AN ENGINE (主开发 r745 / r771; the kernel conversation's two names) ═══════
// src/plugin-manifest.js keeps `capabilities.browserEngine` (only when declared); src/browser-engines.js's word (ENVIRONMENT_WORD),
// the echo (APPLIED_ECHO) and the kernel's refusals relayed by name; the REAL keeper over a WRAPPED engine table (the fixture's
// real one beside it: the leg sets the engine's stated word and its answer, and sees every hand-over).
console.log('— ⑦e B-9584 U2a: a profile\'s own environment on an engine — the declared word kept, the hand-over beside the exit, the kernel\'s refusals by name, the echo; a profile that sets nothing is the release\'s');
{
  const J = JSON.stringify;
  const ENVm = require('../src/browser-environment.js');
  const PMf = require('../src/plugin-manifest.js');
  const raw0 = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/vibespace-plugin.json'), 'utf8'));
  const vm = (caps) => PMf.validateManifest({ ...raw0, capabilities: caps }, { hostVersion: '2.369.356', folderName: raw0.id });
  const m0 = vm({ server: { childProcess: true } }), m1 = vm({ server: { childProcess: true }, browserEngine: ['environment', 'later-word', 'environment', 7, 'Bad Word'] });
  ok(m0.ok && J(m0.manifest.capabilities) === J({ server: { fs: { read: [], write: [] }, childProcess: true, net: [] } }) && !ENGN.statesEnvironment(m0.manifest.capabilities),
    '⑦e ① a manifest that declares no browserEngine normalizes as before — no key added (its consent hash is the same), and states nothing', m0.manifest && m0.manifest.capabilities);
  ok(m1.ok && J(m1.manifest.capabilities.browserEngine) === J(['environment', 'later-word']) && m1.warnings.filter((w) => /browserEngine\[\d\] is not a plain word/.test(w)).length === 2 && ENGN.statesEnvironment(m1.manifest.capabilities),
    '⑦e ① a declaring manifest keeps its plain words (an unknown one as a word, a repeat once, two malformed ones dropped with a warning each); statesEnvironment reads the one word', m1);
  // r991 MUST 2: the word list is OUTSIDE the consent hash — the release's validator dropped it, so a plugin that declares it was
  // consented WITHOUT it (its normalized manifest = m0); inside, its unchanged manifest would lose its trust at this update
  ok(PMf.capabilitiesHash(m1.manifest) === PMf.capabilitiesHash(m0.manifest), '⑦e ① r991: a plugin consented under the release\'s validator, declaring the word, keeps its trust here — the word list is outside the consent hash (it grants nothing)', { declared: PMf.capabilitiesHash(m1.manifest), release: PMf.capabilitiesHash(m0.manifest) });
  const lv2 = (body, status = 200) => ENGN.engineAnswerVerdict('launchOptions', { status, body }, { id: EID, label: 'Kernel' });
  const okBody = { executablePath: '/k/chrome', args: ['--x=1'], env: {} };
  const a409 = lv2({ code: 'location_unsupported_by_kernel', error: 'vs1' }, 409), a400 = lv2({ code: 'bad_timezone', error: 'an offset' }, 400);
  const a400p = lv2({ code: 'bad_location', error: 'latitude 35.6762, longitude 139.6503 is out of range' }, 400);   // a kernel whose text echoes the bad input
  ok(a400p.code === 'browser_engine_environment_refused' && !/35\.67|139\.65/.test(a400p.error) && /This machine's/.test(a400p.error) && /update the browser plugin/.test(a400p.error),
    '⑦e ② r991 (a location is never in an error\'s words): a 400 whose text echoes a place is relayed by its CODE only — no number of it in the refusal — with the way out (this machine\'s, or update the plugin)', a400p.error);
  ok(a409.code === 'browser_engine_location_unsupported' && /kernel update/.test(a409.error) && a400.code === 'browser_engine_environment_refused' && /bad_timezone/.test(a400.error) && !a400.failed && a400.refusedCode === 'bad_timezone',
    '⑦e ② the kernel\'s refusals of the environment come back BY NAME: 409 location_unsupported_by_kernel ⇒ browser_engine_location_unsupported (the kernel update named); 400 bad_timezone ⇒ browser_engine_environment_refused with its code (round wyx4vuerd 1: no `failed` block — the page takes the environment\'s own sentence)', { a409, a400 });
  const echo = lv2({ ...okBody, appliedEnvironment: { timezone: 'Asia/Tokyo', language: 'ja-JP', location: 'blocked' } }), none = lv2(okBody), odd = lv2({ ...okBody, appliedEnvironment: { timezone: 'Asia/Tokyo', language: 'ja-JP', location: 'somewhere' } });
  ok(echo.ok && J(echo.launch.applied) === J({ timezone: 'Asia/Tokyo', language: 'ja-JP', location: 'blocked' }) && none.ok && !('applied' in none.launch) && !odd.ok && odd.code === 'browser_engine_protocol',
    '⑦e ② the echo: of its shape kept as `applied`; absent ⇒ none (the start says «not confirmed»); of another shape ⇒ refused by name', { echo: echo.launch, odd });
  const seen = []; let states = true, answer = null;
  const ENGW = { ...ENGR, statesEnvironment: () => states, launchOptions: async (id, input) => { seen.push(input); return answer ? answer(id, input) : ENGR.launchOptions(id, input); } };
  const roadOf = async (Kmod, tag) => {
    const kv = mkKeeper(path.join(ROOT, `data-eng-env-${tag}`), { engines: ENGW, serverSetting: (k) => settingsE[k], fleetFacts: () => fleetE, liveKeys: () => new Set([KEY_A, KEY_E]) }, Kmod);
    const efv = await kv.engineFactOf(EID);
    const pv1 = kv.createProfile({ label: `Kernel env ${tag}`, browser: { kind: 'plugin', id: EID } }, { engine: efv });
    const prof = () => kv._reg().profiles.find((x) => x && x.id === pv1.id);
    const out = {};
    states = true; answer = null;
    await kv.start(pv1.id, { why: 'test' });
    out.in0 = seen.at(-1); out.rec0 = kv._reg().browsers[pv1.id] || {};
    await kv.stop(pv1.id, { why: 'user' });
    prof().environment = ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Tokyo' }, location: { mode: 'block' } }).value;   // a stand-in for the store writer (U3's dialog)
    answer = async (id, input) => { const r = await ENGR.launchOptions(id, input); return r.ok ? { ...r, launch: { ...r.launch, applied: { timezone: 'Asia/Tokyo', language: null, location: 'blocked' } } } : r; };
    await kv.start(pv1.id, { why: 'test' });
    out.in1 = seen.at(-1); out.rec1 = kv._reg().browsers[pv1.id].environment;
    await kv.stop(pv1.id, { why: 'user' });
    answer = null;
    await kv.start(pv1.id, { why: 'test' });
    out.rec2 = kv._reg().browsers[pv1.id].environment;
    await kv.stop(pv1.id, { why: 'user' });
    const t0e = todos.length;
    answer = async () => ({ ok: false, code: 'browser_engine_location_unsupported', error: 'Kernel cannot set or block the location in this browser build yet — the kernel update brings it' });
    out.ed = await thr(() => kv.start(pv1.id, { why: 'test' })); out.marked = !!prof().buildMissing; out.todos = todos.length - t0e;
    answer = null; states = false;
    const n0 = seen.length;
    out.ee = await thr(() => kv.start(pv1.id, { why: 'test' })); out.asked = seen.length - n0;
    if (!out.ee) await kv.stop(pv1.id, { why: 'user' });
    states = true;
    return out;
  };
  const r = await roadOf(K, 'real');
  ok(!!r.in0 && !('environment' in r.in0) && !('environment' in r.rec0), '⑦e ③ a profile that sets NOTHING: the hand-over carries no `environment` key and the browser record none — the release\'s start', r.in0);
  ok(!!r.in1 && J(r.in1.environment) === J({ timezone: 'Asia/Tokyo', location: 'blocked' }) && !!r.rec1 && r.rec1.confirmed === true && J(r.rec1.applied) === J({ timezone: 'Asia/Tokyo', language: null, location: 'blocked' }) && J(r.rec1.unfollowed) === J([]),
    '⑦e ③ a profile that sets a zone and blocks the place, on an engine that states the word: `environment` rides the hand-over beside the exit («blocked» its own word) and the record keeps the echo, confirmed', { in1: r.in1 && r.in1.environment, rec1: r.rec1 });
  ok(!!r.rec2 && r.rec2.confirmed === false && r.rec2.applied === null, '⑦e ③ the same start with no echo in the answer ⇒ recorded NOT CONFIRMED (applied null), never applied', r.rec2);
  ok(!!r.ed && r.ed.code === 'browser_engine_location_unsupported' && !r.marked && r.todos === 0, '⑦e ③ the kernel\'s 409 relayed: the start is refused by name (browser_engine_location_unsupported) — no build marked missing, no For-you item of a build', { code: r.ed && r.ed.code, marked: r.marked, todos: r.todos });
  ok(!!r.ee && r.ee.code === 'browser_engine_environment_unread' && /update the browser plugin/.test(String(r.ee.message)) && r.asked === 0, '⑦e ③ an engine that does not STATE the word: a profile that sets something is refused by name BEFORE its launch is asked — never a browser in another zone than it says', { code: r.ee && r.ee.code, asked: r.asked });
  // r991 MUST 1: «confirmed» means the echo EQUALS what was told — an echo that differs in each of the three, in turn, refuses the start
  // by name before the wrapper and the exit (the setting named by its word, never a place); no build marked missing
  const mismatchOf = async (Kmod, tag, echoE, { env = null, raw = null } = {}) => {
    const km = mkKeeper(path.join(ROOT, `data-eng-mis-${tag}`), { engines: ENGW, serverSetting: (k) => settingsE[k], fleetFacts: () => fleetE, liveKeys: () => new Set([KEY_A, KEY_E]) }, Kmod);
    const pm = km.createProfile({ label: `Kernel mismatch ${tag}`, browser: { kind: 'plugin', id: EID } }, { engine: await km.engineFactOf(EID) });
    km._reg().profiles.find((x) => x && x.id === pm.id).environment = env || ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Tokyo' }, location: { mode: 'value', value: { latitude: 35.6762, longitude: 139.6503 } } }).value;
    states = true; answer = raw || (async (id, input) => { const r0 = await ENGR.launchOptions(id, input); return r0.ok ? { ...r0, launch: { ...r0.launch, applied: echoE } } : r0; });
    const t0m = todos.length;
    const e = await thr(() => km.start(pm.id, { why: 'test' }));
    answer = null;
    const b = km._reg().browsers[pm.id] || {};
    const out = { code: e && e.code, msg: String((e && e.message) || ''), settings: e && e.settings, marked: !!km._reg().profiles.find((x) => x && x.id === pm.id).buildMissing, todos: todos.length - t0m, rec: b.environment || null, ready: b.state === 'ready', egress: !!(km.egressFor(pm.id) || {}).url };
    if (!e) await km.stop(pm.id, { why: 'user' });
    return out;
  };
  const ECHOES = [['zone', { timezone: null, language: null, location: 'fixed' }, /another time zone than/], ['language', { timezone: 'Asia/Tokyo', language: 'ja-JP', location: 'fixed' }, /another language than/], ['location', { timezone: 'Asia/Tokyo', language: null, location: 'machine' }, /another location than/]];
  for (const [what, echoE, words] of ECHOES) {
    const mm = await mismatchOf(K, what, echoE);
    ok(mm.code === 'browser_engine_environment_mismatch' && words.test(mm.msg) && !/35\.67|139\.65/.test(mm.msg) && !mm.marked && mm.todos === 0 && !mm.ready && !mm.egress,
      `⑦e ③ r991: the echo differs in its ${what} from what was told (a zone and a fixed place) ⇒ the start refused BY NAME (the setting by its word, no place), no build marked missing, no browser record ready and no exit built (round wyx4vuerd)`, mm);
  }
  const mOk = await mismatchOf(K, 'equal', { timezone: 'Asia/Tokyo', language: null, location: 'fixed' });
  ok(!mOk.code && !!mOk.rec && mOk.rec.confirmed === true, '⑦e ③ r991: the echo EQUALS what was told (the zone, no language, the place as its word «fixed») ⇒ the start runs, recorded confirmed', mOk);
  // the real statesEnvironment over the loader's OWN list: the fixture states nothing; a copy of it that declares the word (trusted) states it
  await waitRows(1);   // r1120: «states» is read of a RUNNING plugin only
  ok(ENGR.statesEnvironment(EID) === false, '⑦e ④ the REAL table over the loader\'s own list: the fixture engine (no capabilities.browserEngine) states nothing', ENGR.statesEnvironment(EID));
  const EROOT2 = path.join(ROOT, 'engine-root-env');
  fs.cpSync(path.join(REPO, 'scripts/fixtures/engine-plugin'), path.join(EROOT2, 'data', 'plugins', EID), { recursive: true });
  { const mf = path.join(EROOT2, 'data', 'plugins', EID, 'vibespace-plugin.json'); const j = JSON.parse(fs.readFileSync(mf, 'utf8')); j.capabilities = { ...j.capabilities, browserEngine: ['environment'] }; fs.writeFileSync(mf, JSON.stringify(j)); }
  const LDR2 = require('../src/server/plugin-loader.js').create({ rootDir: EROOT2, app: expressE(), hostVersion: '2.369.356', log: { log() { }, warn() { } }, agentEnv: () => ({ PATH: process.env.PATH }) });
  process.on('exit', () => { try { LDR2.shutdown(); } catch { /* gone */ } });
  LDR2.setEnabled(EID, true, { trusted: true });
  const ENGR2 = require('../src/server/browser-engines.js').create({ loader: LDR2, dataDir: path.join(EROOT2, 'data'), timeoutMs: 400 });
  { const t0w = Date.now(); while (ENGR2.rows().length !== 1 && Date.now() - t0w < 8000) await new Promise((r) => setTimeout(r, 25)); }   // r1120: running first
  ok(ENGR2.statesEnvironment(EID) === true, '⑦e ④ …and a copy of it whose manifest declares capabilities.browserEngine ["environment"] (enabled, trusted) STATES it', ENGR2.statesEnvironment(EID));
  try { LDR2.shutdown(); } catch { /* gone */ }
  // r991 (small): the stated-word check comes BEFORE a first-use kernel download (and before the place hold and the probe)
  { const ks0 = read('src/server/browser-keeper.js'); const f0 = ks0.indexOf('  async function launchEngineOf(p, c) {'); const u0 = ks0.indexOf('    if (statesEnv === false) throw unread();', f0), d0 = ks0.indexOf("by: 'first-use'", f0), h0 = ks0.indexOf('d0.beforeStart(c.id)', f0);
    ok(f0 > 0 && u0 > f0 && d0 > u0 && h0 > u0, '⑦e ④ r991: in launchEngineOf the stated-word refusal stands before the place hold and the first-use kernel download', { f0, u0, d0, h0 }); }
  // REDs: the keeper with each rule taken back (anchored, THE one door for a red control's edit)
  const MUTe = mutantCopies('envm-builds', REPO);
  const ksE = read('src/server/browser-keeper.js');
  const Kno = MUTe.load('src/server/browser-keeper.js', anchored(anchored(ksE, '    if (statesEnv === false) throw unread();', '    if (false) throw unread();', '⑦e RED unread (early)'), '    if (statesEnv !== true && !(typeof engs().statesEnvironment', '    if (false && !(typeof engs().statesEnvironment', '⑦e RED unread (belt)'), 'env-unread-off');
  const rn = await roadOf(Kno, 'red-unread');
  ok(!rn.ee && rn.asked === 1, '⑦e RED — the keeper without the stated-word check: the start ASKS the launch of an engine that does not read the environment (a browser in the machine\'s own zone)', { ee: rn.ee && rn.ee.code, asked: rn.asked });
  const Kal = MUTe.load('src/server/browser-keeper.js', anchored(ksE, '...(envR.told ? { environment: envR.told } : {})', 'environment: envR.told', '⑦e RED always'), 'env-always');
  const Kany = MUTe.load('src/server/browser-keeper.js', anchored(ksE, "if (off.length) throw namedError('browser_engine_environment_mismatch',", "if (false) throw namedError('browser_engine_environment_mismatch',", '⑦e RED any echo'), 'env-any-echo');
  const rmm = await mismatchOf(Kany, 'red-any', { timezone: null, language: null, location: 'machine' });
  ok(!rmm.code && !!rmm.rec && rmm.rec.confirmed === true, '⑦e RED — any well-shaped echo is «confirmed» (the comparison taken out): told a Tokyo zone and a place, an echo of «no zone, the machine\'s location» starts and is recorded confirmed', rmm);
  const PMm = MUTe.load('src/plugin-manifest.js', anchored(read('src/plugin-manifest.js'), 'capabilities: consentCapabilities(m.capabilities),', 'capabilities: m.capabilities || {},', '⑦e RED word in the hash'), 'env-word-hashed');
  ok(PMm.capabilitiesHash(m1.manifest) !== PMm.capabilitiesHash(m0.manifest), '⑦e RED — the word list inside the consent hash: the unchanged plugin\'s hash moves (the loader switches it off at the update)', null);
  const ra = await roadOf(Kal, 'red-always');
  ok(!!ra.in0 && 'environment' in ra.in0, '⑦e RED — the keeper that always hands `environment`: an untouched profile\'s hand-over carries the key (the kernel would read it as ruling all three)', ra.in0);
  // ═══ round wyx4vuerd on U2a's cure ═══
  // MUST — A REFUSAL NAMES ITS DOOR: «does not state the word» only for an engine the loader lists valid, enabled and trusted; a plugin
  // switched OFF, UNTRUSTED (its capabilities drifted since its consent) or NOT INSTALLED is refused as at the release —
  // browser_engine_missing, its For-you line, its mark — over the REAL engine table on a copy of the fixture (statesEnvironment's
  // three answers: true / false / null)
  const doorOf = async (Kmod, tag) => {
    const EROOT3 = path.join(ROOT, `engine-root-door-${tag}`);
    fs.rmSync(EROOT3, { recursive: true, force: true });
    fs.cpSync(path.join(REPO, 'scripts/fixtures/engine-plugin'), path.join(EROOT3, 'data', 'plugins', EID), { recursive: true });
    const LDR3 = require('../src/server/plugin-loader.js').create({ rootDir: EROOT3, app: expressE(), hostVersion: '2.369.356', log: { log() { }, warn() { } }, agentEnv: () => ({ PATH: process.env.PATH }) });
    const out = { states: {} };
    try {
      LDR3.setEnabled(EID, true, { trusted: true });
      const ENGR3 = require('../src/server/browser-engines.js').create({ loader: LDR3, dataDir: path.join(EROOT3, 'data'), timeoutMs: 400 });
      { const KP3 = ENGR3.kernelPath(EID); fs.mkdirSync(path.dirname(KP3), { recursive: true }); fs.writeFileSync(KP3, `#!/bin/sh\necho "${KVER}"\n`, { mode: 0o755 }); }   // its kernel in the copy's own state folder (as the suite's own loader has it)
      const rowsAre = async (n) => { const t0r = Date.now(); while (ENGR3.rows().length !== n && Date.now() - t0r < 8000) await new Promise((r) => setTimeout(r, 25)); return ENGR3.rows().length === n; };
      out.up = await rowsAre(1);
      out.states.listed = ENGR3.statesEnvironment(EID);
      const kd = mkKeeper(path.join(ROOT, `data-eng-door-${tag}`), { engines: ENGR3, serverSetting: (k) => settingsE[k], fleetFacts: () => fleetE, liveKeys: () => new Set([KEY_A, KEY_E]) }, Kmod);
      const pd = kd.createProfile({ label: `Kernel door ${tag}`, browser: { kind: 'plugin', id: EID } }, { engine: await kd.engineFactOf(EID) });
      const prof = () => kd._reg().profiles.find((x) => x && x.id === pd.id);
      prof().environment = ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Tokyo' } }).value;   // a stand-in for U3's writer
      const one = async (key) => {
        delete prof().buildMissing;
        const t0d = todos.length;
        const e = await thr(() => kd.start(pd.id, { why: 'test' }));
        if (!e) await kd.stop(pd.id, { why: 'user' });
        out[key] = { code: e && e.code, msg: String((e && e.message) || '').slice(0, 200), marked: !!prof().buildMissing, todos: todos.length - t0d, text: todos.length > t0d ? String(todos.at(-1).text || '').slice(0, 200) : '' };
      };
      LDR3.setEnabled(EID, false); out.downOff = await rowsAre(0); out.states.off = ENGR3.statesEnvironment(EID); await one('off');
      LDR3.setEnabled(EID, true, { trusted: true }); await rowsAre(1);
      const MF = path.join(EROOT3, 'data', 'plugins', EID, 'vibespace-plugin.json'), mj = JSON.parse(fs.readFileSync(MF, 'utf8'));
      const caps = mj.capabilities || {}, srv = caps.server || {};
      fs.writeFileSync(MF, JSON.stringify({ ...mj, version: '0.0.9', capabilities: { ...caps, server: { ...srv, net: [...(Array.isArray(srv.net) ? srv.net : []), 'kernels.example'] } } }));   // a new version asks one more host: its consent drifts
      LDR3.reload(); out.downUntrusted = await rowsAre(0); out.states.untrusted = ENGR3.statesEnvironment(EID); out.trustedAfter = LDR3.isTrusted(EID); await one('untrusted');
      fs.rmSync(path.join(EROOT3, 'data', 'plugins', EID), { recursive: true, force: true });   // not installed
      LDR3.reload(); out.downAbsent = await rowsAre(0); out.states.absent = ENGR3.statesEnvironment(EID); await one('absent');
    } finally { try { LDR3.shutdown(); } catch { /* gone */ } }
    return out;
  };
  const dr = await doorOf(K, 'real');
  ok(dr.up && dr.states.listed === false && dr.states.off === null && dr.states.untrusted === null && dr.states.absent === null && dr.trustedAfter === false,
    '⑦e MUST (round wyx4vuerd): statesEnvironment answers THREE ways — a listed engine that does not state the word ⇒ false; switched off, untrusted (its consent drifted), not installed ⇒ null (not listed so)', dr.states);
  for (const key of ['off', 'untrusted', 'absent']) {
    const d = dr[key] || {};
    ok(d.code === 'browser_engine_missing' && d.marked && d.todos === 1 && /plugin is not running/.test(d.text) && !/does not state/.test(d.msg),
      `⑦e MUST: a profile with a zone on an engine plugin ${key === 'off' ? 'switched off' : key === 'untrusted' ? 'no longer trusted' : 'not installed'} ⇒ the release's refusal by name (browser_engine_missing), its For-you line («its plugin is not running») and its mark — never «update the browser plugin»`, d);
  }
  // item 4: a malformed echo is the kernel's protocol fault — refused by its own name, NO build marked missing, no «missing build» line
  const lvM = (body) => ENGN.engineAnswerVerdict('launchOptions', { status: 200, body }, { id: EID, label: 'Kernel' });
  const malformed = async () => lvM({ executablePath: '/k/chrome', args: [], env: {}, appliedEnvironment: { timezone: 7, language: null, location: 'machine' } });
  const mal = await mismatchOf(K, 'malformed', null, { raw: malformed });
  ok(mal.code === 'browser_engine_protocol' && /another shape/.test(mal.msg) && /protocol fault/.test(mal.msg) && !mal.marked && mal.todos === 0 && !mal.ready,
    '⑦e (round wyx4vuerd 4): an echo of another shape ⇒ refused browser_engine_protocol, said as the kernel\'s protocol fault — no build marked missing, no For-you line of a missing build', mal);
  // also cured: a launch TOLD an environment quotes a plugin's own error by its CODE only (its text may echo a place); untold, as at the release
  const crash = { code: 'E_KERNEL', error: 'resolve-launch crashed reading latitude 35.6762, longitude 139.6503' };
  const qTold = ENGN.engineAnswerVerdict('launchOptions', { status: 500, body: crash }, { id: EID, label: 'Kernel', told: true });
  const qUntold = ENGN.engineAnswerVerdict('launchOptions', { status: 500, body: crash }, { id: EID, label: 'Kernel' });
  ok(qTold.code === 'browser_engine_protocol' && /E_KERNEL/.test(qTold.error) && !/35\.67|139\.65/.test(J(qTold)) && qTold.failed && qTold.failed.message === null && /35\.6762/.test(qUntold.error),
    '⑦e (round wyx4vuerd, also cured): a launch that was told an environment quotes a plugin\'s own 500 by its CODE only — no number of a place in the refusal or its facts; a launch told nothing quotes it as at the release', { told: qTold.error, untold: qUntold.error });
  // item 3: EQUAL AFTER THE SAME CANONICAL FORM ON BOTH SIDES — the hub's two forms; what still differs is a real difference
  const CAN = { zone: ENVm.canonicalZone, tag: ENVm.canonicalTag };
  const toldZ = ENVm.canonicalZone('Asia/Calcutta'), otherZ = toldZ === 'Asia/Kolkata' ? 'Asia/Calcutta' : 'Asia/Kolkata';
  const eqA = ENGN.echoMismatch({ timezone: toldZ }, { timezone: otherZ, language: null, location: 'machine' }, CAN);
  const eqC = ENGN.echoMismatch({ timezone: 'Asia/Tokyo', language: 'ja-JP' }, { timezone: 'asia/tokyo', language: 'ja-jp', location: 'machine' }, CAN);
  const neq = ENGN.echoMismatch({ timezone: 'Asia/Tokyo' }, { timezone: 'Asia/Seoul', language: null, location: 'machine' }, CAN);
  const raw3 = ENGN.echoMismatch({ timezone: toldZ }, { timezone: otherZ, language: null, location: 'machine' });
  ok(ENVm.canonicalZone(otherZ) === toldZ && J(eqA) === '[]' && J(eqC) === '[]' && J(neq) === '["timezone"]' && J(raw3) === '["timezone"]',
    `⑦e (round wyx4vuerd 3): told ${toldZ}, an echo of its alias ${otherZ} ⇒ confirmed; another case of the same zone and tag (asia/tokyo, ja-jp) ⇒ confirmed; another zone (Asia/Seoul) ⇒ refused — and without the hub's forms the alias pair reads as different (the leg can see it)`, { toldZ, otherZ, eqA, eqC, neq, raw3 });
  const envAlias = ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Calcutta' }, language: { mode: 'value', value: 'ja-JP' } }).value;
  const mAlias = await mismatchOf(K, 'alias', { timezone: otherZ, language: 'ja-jp', location: 'machine' }, { env: envAlias });
  ok(!mAlias.code && !!mAlias.rec && mAlias.rec.confirmed === true, `⑦e (round wyx4vuerd 3) through the keeper: a profile told ${toldZ} and ja-JP, a kernel echoing ${otherZ} and ja-jp ⇒ the start runs, recorded confirmed`, mAlias);
  // items 1 and 2 at the person's door: the page's words for the relayed refusal and for the mismatch
  const BMe = await import('../src/lib/browser-build-model.js');
  const tE = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
  const wRef = BMe.buildRefusalWords({ code: a400p.code, error: a400p.error, ...(a400p.failed ? { failed: a400p.failed } : {}) }, tE);
  const wOld = BMe.buildRefusalWords({ code: a400p.code, error: a400p.error, failed: { status: 400, code: 'bad_location' } }, tE);
  ok(/refused this profile's time zone, language or location/.test(String(wRef)) && /This machine's/.test(String(wRef)) && !/refused this profile/.test(String(wOld)),
    '⑦e (round wyx4vuerd 1): the relayed environment refusal reaches the page in ITS OWN sentence (the way out: «This machine\'s» or the plugin\'s update); a relay with the release\'s `failed` block took the plugin-failed branch instead (the leg can see it)', { wRef, wOld });
  const w1 = BMe.buildRefusalWords({ code: 'browser_engine_environment_mismatch', settings: ['timezone'] }, tE);
  const w2 = BMe.buildRefusalWords({ code: 'browser_engine_environment_mismatch', settings: ['language', 'timezone'] }, tE);
  const w0 = BMe.buildRefusalWords({ code: 'browser_engine_environment_mismatch' }, tE);
  const RB = require('../src/routes/browser.js');
  const resOf = () => ({ req: { path: '/api/browser/profiles/bp-00000001/start' }, locals: {}, status(c) { this.c = c; return this; }, json(o) { this.o = o; return this; } });
  const rs = resOf(); RB.fail(rs, Object.assign(new Error('x'), { code: 'browser_engine_environment_mismatch', settings: ['timezone', 'nonsense'] }));
  ok(/another time zone than/.test(String(w1)) && /set the time zone to «This machine's»/.test(String(w1)) && /another time zone and language than/.test(String(w2)) && /time zone, language or location/.test(String(w0))
    && rs.c === 409 && J(rs.o.settings) === '["timezone"]',
    '⑦e (round wyx4vuerd 2): the mismatch says WHICH on the page — «another time zone», «the time zone and language» (the route forwards the setting words, only the three), the general sentence when none is named', { w1, w2, rs: rs.o });
  // r1120 (1)(2)(4) and the built-in engine — over stub loaders and the verdict (each a one-line cure)
  { const rowOf = (state, caps = {}) => ({ id: EID, valid: true, enabled: true, trusted: true, state, contributes: { browserEngine: true }, capabilities: caps });
    const SE = (list, plugins = null) => require('../src/server/browser-engines.js').create({ loader: { list: () => list }, plugins }).statesEnvironment(EID);
    const sStopped = SE([rowOf('stopped', { browserEngine: ['environment'] })]), sRunNo = SE([rowOf('running')]), sRunYes = SE([rowOf('running', { browserEngine: ['environment'] })]);
    const sBuiltin = require('../src/server/browser-engines.js').create({ loader: { list: () => [] }, plugins: { providerIds: () => ['kx'], defs: () => ({ kx: { label: 'K' } }) } }).statesEnvironment('builtin.kx');
    ok(sStopped === null && sRunNo === false && sRunYes === true && sBuiltin === false, '⑦e r1120 (2): a trusted, enabled plugin that is NOT RUNNING is not «listed so» (null: the verdict says «not running» first); running ⇒ false / true by its word; a BUILT-IN engine ⇒ false (it reads no environment)', { sStopped, sRunNo, sRunYes, sBuiltin });
    const acc = ENGN.engineAnswerVerdict('launchOptions', { status: 500, body: { code: 'EPLUGIN', error: "Error [ERR_ACCESS_DENIED]: Access to this API has been restricted. resource: '/etc/kernel.json' — while reading latitude 35.6762" } }, { id: EID, label: 'Kernel', told: true });
    ok(/ERR_ACCESS_DENIED/.test(acc.error) && /\/etc\/kernel\.json/.test(acc.error) && !/35\.67/.test(J(acc)), '⑦e r1120 (4): an ACCESS refusal under another code keeps its access words (the mark and the resource) when an environment was told — never the text\'s numbers', acc.error); }
  { const answers = [];
    const ENGS = { ...ENGR, statesEnvironment: () => answers.shift(), launchOptions: (id, input) => ENGR.launchOptions(id, input) };
    const beltOf = async (Kmod, tag, seq) => {
      const kb = mkKeeper(path.join(ROOT, `data-eng-belt-${tag}`), { engines: ENGS, serverSetting: (k) => settingsE[k], fleetFacts: () => fleetE, liveKeys: () => new Set([KEY_A, KEY_E]) }, Kmod);
      const pb = kb.createProfile({ label: `Kernel belt ${tag}`, browser: { kind: 'plugin', id: EID } }, { engine: await kb.engineFactOf(EID) });
      kb._reg().profiles.find((x) => x && x.id === pb.id).environment = ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Tokyo' } }).value;
      answers.length = 0; answers.push(...seq);
      const e = await thr(() => kb.start(pb.id, { why: 'test' }));
      if (!e) await kb.stop(pb.id, { why: 'user' });
      return e ? e.code : 'started';
    };
    const b1 = await beltOf(K, 'race', [null, true]), b2 = await beltOf(K, 'plain', [null, false]), b4 = await beltOf(K, 'unread', [null, null]);
    ok(b4 === 'browser_engine_environment_unread', `⑦e r1707 (1): a list that cannot be read at BOTH reads (null, null) is refused «update the browser plugin» as at the release — never an engine started in this machine's environment (${b4})`, b4);
    ok(b1 === 'started' && b2 === 'browser_engine_environment_unread', `⑦e r1120 (1): the belt past the verdict asks ONCE MORE — a plugin that states the word by then starts (${b1}); a plain «does not state it» is refused (${b2})`, { b1, b2 });
    const Kbelt = MUTe.load('src/server/browser-keeper.js', anchored(ksE, "    if (statesEnv !== true && !(typeof engs().statesEnvironment === 'function' && engs().statesEnvironment(c.id) === true)) throw unread();", '    if (statesEnv !== true) throw unread();', '⑦e RED belt once'), 'env-belt-once');   // stale-pins: kept (the RED's own replacement: the belt reusing the early answer)
    const b3 = await beltOf(Kbelt, 'red-race', [null, true]);
    ok(b3 === 'browser_engine_environment_unread', '⑦e RED — the belt that reuses the early answer: a plugin turned on between the two reads is refused «update the browser plugin»', b3);
    const Kplain = MUTe.load('src/server/browser-keeper.js', anchored(ksE, "    if (statesEnv !== true && !(typeof engs().statesEnvironment === 'function' && engs().statesEnvironment(c.id) === true)) throw unread();", "    if (statesEnv !== true && typeof engs().statesEnvironment === 'function' && engs().statesEnvironment(c.id) === false) throw unread();", '⑦e RED belt plain false'), 'env-belt-plain-false');   // stale-pins: kept (the RED's own replacement: the plain-false belt)
    const b5 = await beltOf(Kplain, 'red-unread', [null, null]);
    ok(b5 === 'started', '⑦e RED — the belt that refuses only a plain «false» (r1707 (1)): a list that cannot be read starts the engine, told an environment it is not listed as reading (a place there would run in this machine\'s position)', b5); }
  // REDs (anchored)
  const Kdoor = MUTe.load('src/server/browser-keeper.js', anchored(ksE, '    if (statesEnv === false) throw unread();', '    if (statesEnv !== true) throw unread();', '⑦e RED early check'), 'env-door-early');   // stale-pins: kept (the RED's own replacement: today's early check)
  const drR = await doorOf(Kdoor, 'red');
  ok(['off', 'untrusted', 'absent'].every((k) => drR[k] && drR[k].code === 'browser_engine_environment_unread' && !drR[k].marked && drR[k].todos === 0),
    '⑦e RED — today\'s early check (refused unless the engine states the word): a switched-off, an untrusted and an absent plugin are each told «update the browser plugin» — the real door never named, no For-you line', { off: drR.off, untrusted: drR.untrusted, absent: drR.absent });
  const Kmal = MUTe.load('src/server/browser-keeper.js', anchored(ksE, " && lo.echo !== 'malformed') noteBuildMissing(p, c, lo, engine);", ') noteBuildMissing(p, c, lo, engine);', '⑦e RED malformed echo'), 'env-echo-marks');
  const malR = await mismatchOf(Kmal, 'red-malformed', null, { raw: malformed });
  ok(malR.code === 'browser_engine_protocol' && malR.marked && malR.todos === 1, '⑦e RED — the malformed echo not excluded: its build is marked missing and a «missing build» line is filed', malR);
  const Kcan = MUTe.load('src/server/browser-keeper.js', anchored(ksE, 'ENG.echoMismatch(envR.told, lo.launch.applied, { zone: ENV.canonicalZone, tag: ENV.canonicalTag })', 'ENG.echoMismatch(envR.told, lo.launch.applied)', '⑦e RED canonical'), 'env-echo-raw');   // stale-pins: kept (the RED's own replacement: the raw compare)
  const mAliasR = await mismatchOf(Kcan, 'red-alias', { timezone: otherZ, language: 'ja-jp', location: 'machine' }, { env: envAlias });
  ok(mAliasR.code === 'browser_engine_environment_mismatch', '⑦e RED — the raw compare: the same zone under its alias and the same tag in another case refuse a healthy kernel at every start', mAliasR);
}

// ═══ ⑦f B-9584 U2b — THE STOCK BROWSER'S OWN LANGUAGE AND ZONE (the box measure: TZ reaches Chrome; Chrome keeps a prior language) ═══
console.log('— ⑦f B-9584 U2b: the stock browser\'s own language and zone — two switches on its launch config, TZ in its env, «this machine\'s» STATED after a language was told; an untouched profile the release\'s');
{
  const J = JSON.stringify;
  const ENVm = require('../src/browser-environment.js');
  const lastLaunch = (id) => fake.launches().filter((l) => l.ns === 'vs-' + id).at(-1);
  const argsOf = (l) => { const a = l && l.config && l.config.args; return Array.isArray(a) ? a.map(String) : String(a || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean); };
  const stockRoad = async (Kmod, tag) => {
    const kb2 = mkKeeper(path.join(ROOT, `data-stock-env-${tag}`), {}, Kmod);
    const pa = kb2.createProfile({ label: `Stock env ${tag}` }), pu = kb2.createProfile({ label: `Stock untouched ${tag}` });
    const profOf = (id) => kb2._reg().profiles.find((x) => x && x.id === id);
    const o = {};
    await kb2.start(pu.id, { why: 'test' }); o.lu = lastLaunch(pu.id); o.recU = kb2._reg().browsers[pu.id] || {}; o.markU = !!profOf(pu.id).languageTold;
    await kb2.stop(pu.id, { why: 'user' });
    profOf(pa.id).environment = ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Tokyo' }, language: { mode: 'value', value: 'ja-JP' } }).value;   // a stand-in for the store writer (U3)
    const c1 = fake.calls().length;
    await kb2.start(pa.id, { why: 'test' }); o.la1 = lastLaunch(pa.id); o.rec1 = kb2._reg().browsers[pa.id].environment; o.mark1 = profOf(pa.id).languageTold === true; o.view1 = (kb2._reg().browsers[pa.id].launchEnv || {}).TZ || null;
    await kb2.stop(pa.id, { why: 'user' });
    o.calls1 = fake.calls().slice(c1).filter((c) => c.ns === 'vs-' + pa.id && /^(?:get cdp-url|close --all)$/.test(c.verb)).map((c) => ({ verb: c.verb, tz: c.tz }));
    profOf(pa.id).environment = ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Tokyo' } }).value;   // the language back at «this machine's»
    await kb2.start(pa.id, { why: 'test' }); o.la2 = lastLaunch(pa.id);
    await kb2.stop(pa.id, { why: 'user' });
    return o;
  };
  const s0 = await stockRoad(K, 'real'), mt = ENVm.machineLanguageTag();
  ok(!!s0.lu && !argsOf(s0.lu).some((a) => /^--(?:accept-)?lang=/.test(a)) && s0.lu.tz === null && !('environment' in s0.recU) && !('envArgs' in s0.recU) && !s0.markU,
    '⑦f ① an untouched stock profile: no language switch in its launch config, no TZ in its env, no environment or stamped switches on its record, no mark — the release\'s start', { args: argsOf(s0.lu), tz: s0.lu && s0.lu.tz });
  const a1 = argsOf(s0.la1), mk = a1.findIndex((x) => x.startsWith('--vibespace-keeper='));
  ok(a1.includes('--lang=ja-JP') && a1.includes('--accept-lang=ja-JP') && mk > a1.indexOf('--accept-lang=ja-JP') && s0.la1.tz === 'Asia/Tokyo' && !!s0.rec1 && s0.rec1.by === 'stock' && J(s0.rec1.applied) === J({ timezone: 'Asia/Tokyo', language: 'ja-JP', location: 'machine' }) && s0.mark1,
    '⑦f ② a zone and a language set: --lang / --accept-lang ja-JP in the launch config (before the keeper\'s mark, the tail last), TZ=Asia/Tokyo in the browser\'s env, the record says it, the mark set', { a1, tz: s0.la1 && s0.la1.tz, rec: s0.rec1 });
  ok(!!mt && argsOf(s0.la2).includes(`--lang=${mt}`) && argsOf(s0.la2).includes(`--accept-lang=${mt}`) && s0.la2.tz === 'Asia/Tokyo',
    `⑦f ③ the language back at «this machine's» on a profile that had one: the machine's own tag (${mt}) STATED — Chrome would keep ja-JP from its Preferences`, argsOf(s0.la2));
  // round wyx4vuerd (7): THE ZONE ON A LATER CALL — the launch's own view carries it, so every later call of the record (the `get cdp-url`
  // a heal relaunches through, the stop's close) names the profile's zone, never the machine's
  ok(s0.view1 === 'Asia/Tokyo' && s0.calls1.length >= 2 && s0.calls1.some((c) => c.verb === 'get cdp-url') && s0.calls1.some((c) => c.verb === 'close --all') && s0.calls1.every((c) => c.tz === 'Asia/Tokyo'),
    '⑦f (round wyx4vuerd 7): the zone rides the record\'s launch view — every later keeper call of that browser (get cdp-url, close --all) carries TZ=Asia/Tokyo', { view: s0.view1, calls: s0.calls1 });
  // round wyx4vuerd (6): HOSTILE STORED VALUES AT USE (a stand-in for a store edited by hand) — no switch and no zone reach the launch;
  // each is listed as not followed
  const HOSTILE = [
    { language: { mode: 'value', value: 'ja-JP,--no-sandbox' }, timezone: { mode: 'value', value: ':/etc/localtime' } },
    { language: { mode: 'value', value: 'ja-JP\n--remote-debugging-port=1' }, timezone: { mode: 'value', value: '/etc/passwd' } },
    { language: { mode: 'value', value: '--no-sandbox' } },
  ];
  const kh = mkKeeper(path.join(ROOT, 'data-stock-env-hostile'), {});
  const hostile = [];
  for (const [i, env] of HOSTILE.entries()) {
    const ph = kh.createProfile({ label: `Stock hostile ${i}` });
    kh._reg().profiles.find((x) => x && x.id === ph.id).environment = env;   // planted raw: never through the verdict
    await kh.start(ph.id, { why: 'test' });
    const lh = lastLaunch(ph.id), bh = kh._reg().browsers[ph.id] || {};
    hostile.push({ args: argsOf(lh), tz: lh && lh.tz, view: (bh.launchEnv || {}).TZ || null, envArgs: bh.envArgs || null, unf: ((bh.environment || {}).unfollowed || []).map((u) => u.key).sort() });
    await kh.stop(ph.id, { why: 'user' });
  }
  const base0 = argsOf(s0.lu).filter((a) => !a.startsWith('--vibespace-keeper='));
  ok(hostile.every((h, i) => J(h.args.filter((a) => !a.startsWith('--vibespace-keeper='))) === J(base0) && h.tz === null && h.view === null && h.envArgs === null && J(h.unf) === J(Object.keys(HOSTILE[i]).sort())),
    '⑦f (round wyx4vuerd 6): a stored language with a comma and a switch, with a newline, or a leading dash, and a zone that is a file path — judged again at USE: the launch config is the untouched one\'s, no TZ, nothing stamped; each listed as not followed', hostile);
  // round wyx4vuerd (9): the environment is resolved ONCE a start (the attach road takes the driver road's answer; its fallback reuses it)
  { const ks9 = read('src/server/browser-keeper.js'); ok((ks9.match(/: stockEnvFor\(p\)/g) || []).length === 1 && (ks9.match(/stockEnvFor\(/g) || []).length === 2 && /attachStart\(p, rec, prevRec, \{[^}]*stockEnv \}\)/.test(ks9), '⑦f (round wyx4vuerd 9): ONE resolve of the stock environment a start (its definition and one call), handed to the attach road', (ks9.match(/stockEnvFor\(/g) || []).length); }
  const MUTs = mutantCopies('envs-builds', REPO), ksS = read('src/server/browser-keeper.js');
  const Km = MUTs.load('src/server/browser-keeper.js', anchored(ksS, 'languageTold: !!p.languageTold, machineTag', 'languageTold: false, machineTag', '⑦f RED mark'), 'env-mark-off');
  const sm = await stockRoad(Km, 'red-mark');
  ok(!argsOf(sm.la2).some((a) => /^--lang=/.test(a)), '⑦f RED — the mark never read: the profile back at «this machine\'s» states NO language (Chrome keeps the old one)', argsOf(sm.la2));
  const Kt = MUTs.load('src/server/browser-keeper.js', anchored(ksS, '...(stockEnv ? stockEnv.env : {}), ', '', '⑦f RED zone'), 'env-tz-off');
  const st = await stockRoad(Kt, 'red-tz');
  ok(st.la1 && st.la1.tz === null, '⑦f RED — the zone not handed to the driver\'s env: the browser runs in the machine\'s own zone', st.la1 && st.la1.tz);
  const Kv = MUTs.load('src/server/browser-keeper.js', anchored(ksS, '      if (stockEnv && stockEnv.env.TZ) launchEnv.TZ = stockEnv.env.TZ;\n', '', '⑦f RED view'), 'env-tz-view-off');
  const sv = await stockRoad(Kv, 'red-view');
  ok(sv.la1 && sv.la1.tz === 'Asia/Tokyo' && sv.view1 === null && sv.calls1.some((c) => c.tz === null), '⑦f RED — the zone on the launch only, not its view: the later calls (a heal\'s relaunch among them) name no zone — a Chrome started again comes back in the machine\'s zone', { view: sv.view1, calls: sv.calls1 });
}

// ═══ ⑦g B-9584 U2c — A PROFILE'S PLACE ON THE STOCK BROWSER: the keeper's half, FAIL CLOSED AT THE BROWSER (主开发 r1264; measured on a
// real Chrome). The REAL keeper over the fake driver with a STAND-IN hold that records every arm. Before its Chrome starts, a place or
// «blocked» writes the profile's OWN stored denial (the default and every stored geolocation row «block»), the person's values kept
// first; «blocked» is that denial alone (no hold); a place arms the hold BEFORE the browser is anyone's; back at «this machine's» the
// person's values are given back; an untouched profile writes nothing and never reaches the hold.
console.log('— ⑦g B-9584 U2c: the stored denial at the start; a place held on top of it — never an untouched profile');
{
  const J = JSON.stringify;
  const ENVm = require('../src/browser-environment.js');
  const prefsOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'Default', 'Preferences'), 'utf8')); } catch { return null; } };
  const keptOf = (dir) => fs.existsSync(path.join(dir, 'vibespace-geo-kept.json'));
  const geoOf = (pr) => { const p = (pr || {}).profile || {}; return { default: (p.default_content_setting_values || {}).geolocation ?? null, maps: ((((p.content_settings || {}).exceptions || {}).geolocation || {})['https://maps.example:443,*'] || {}).setting ?? null }; };
  const geoRoad = async (Kmod, tag, { refuse = false, quick = false } = {}) => {   // quick: the place profile alone (a RED's own leg)
    const log = { makers: 0, arms: [], disarms: [], order: [], rearms: [], held: new Set(), onEvent: null };
    let kg2 = null;
    const stub = { arm: async (pid, o) => { log.arms.push({ pid, plan: o.plan, after: o.after || null, url: typeof o.url, stateAtArm: (kg2._reg().browsers[pid] || {}).state || null }); log.order.push('arm'); if (!refuse) log.held.add(pid); return refuse ? { ok: false, code: 'place_not_held', error: 'a stand-in refusal' } : { ok: true }; }, disarm: (pid) => { log.disarms.push(pid); log.held.delete(pid); return true; }, heldOf: (pid) => (log.held.has(pid) ? { kind: 'place' } : null), factOf: () => null, rearmNow: (pid) => { log.rearms.push(pid); return true; }, dispose() { } };
    kg2 = mkKeeper(path.join(ROOT, `data-geo-${tag}`), { geoHold: (o) => { log.makers++; log.onEvent = o && o.onEvent; return stub; } }, Kmod);
    kg2.onLease((ev) => { if (ev && ev.kind) log.order.push(ev.kind); });
    const pu = kg2.createProfile({ label: `Geo untouched ${tag}` }), pz = kg2.createProfile({ label: `Geo zone only ${tag}` }), pp = kg2.createProfile({ label: `Geo place ${tag}` }), pb = kg2.createProfile({ label: `Geo blocked ${tag}` });
    const profOf = (id) => kg2._reg().profiles.find((x) => x && x.id === id);
    profOf(pz.id).environment = ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Tokyo' } }).value;
    profOf(pp.id).environment = ENVm.environmentVerdict({ location: { mode: 'value', value: { latitude: 35.6762, longitude: 139.6503 } } }).value;   // a stand-in for U3's writer
    profOf(pb.id).environment = ENVm.environmentVerdict({ location: { mode: 'block' } }).value;
    // a site the person allowed BEFORE, in the place profile's own Chrome profile (as Chrome keeps it)
    fs.mkdirSync(path.join(profOf(pp.id).dir, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(profOf(pp.id).dir, 'Default', 'Preferences'), J({ profile: { content_settings: { exceptions: { geolocation: { 'https://maps.example:443,*': { setting: 1 } } } } } }));
    const out = { log };
    if (!quick) { await kg2.start(pu.id, { why: 'test' }); await kg2.stop(pu.id, { why: 'user' });
    await kg2.start(pz.id, { why: 'test' }); await kg2.stop(pz.id, { why: 'user' }); }
    out.makersUntouched = log.makers; out.armsUntouched = log.arms.length;
    out.prefsU = prefsOf(profOf(pu.id).dir); out.keptU = keptOf(profOf(pu.id).dir) || keptOf(profOf(pz.id).dir);
    log.order.length = 0;
    out.ep = await thr(() => kg2.start(pp.id, { why: 'test' }));
    out.orderP = log.order.slice();
    out.recP = (kg2._reg().browsers[pp.id] || {}).environment || null;
    out.geoP = geoOf(prefsOf(profOf(pp.id).dir)); out.keptP = keptOf(profOf(pp.id).dir);
    if (out.keptP) out.keptMode = fs.statSync(path.join(profOf(pp.id).dir, 'vibespace-geo-kept.json')).mode & 0o777;
    if (!out.ep) {
      // r1707 (8) THE HEAL'S RE-ARM: the record's address gone (a relaunch), the next lease asks the driver again — the hold is re-armed THERE
      const recH = kg2._reg().browsers[pp.id]; if (recH) recH.cdpUrl = null;
      try { await kg2.attach({ profileId: pp.id, browserKey: KEY_A, sessionId: 'sess-geo', by: 'user' }); } catch (e) { out.healErr = (e && e.code) || String(e && e.message); }
      out.rearms = log.rearms.slice();
      // r1707 (8) THE NOTICES (the hold's events through the keeper's listener): one a run, the label only, never a value; the gap QUIET
      const tN = todos.length; if (log.onEvent) { log.onEvent({ kind: 'unplaced', profileId: pp.id, why: 'refused', opened: true, at: 1 }); log.onEvent({ kind: 'unplaced', profileId: pp.id, why: 'refused', opened: true, at: 2 }); }
      out.todoUnplaced = todos.slice(tN); const tG = todos.length;
      if (log.onEvent) log.onEvent({ kind: 'held', profileId: pp.id, after: 'restart', at: 3, lostAt: 3 });
      out.todoGap = todos.slice(tG); const tD = todos.length;
      if (log.onEvent) log.onEvent({ kind: 'down', profileId: pp.id, at: 4, lostAt: 3 });
      out.todoDown = todos.slice(tD);
      // r2172 (c): the record's «confirmed» falls with the hold and comes back with it
      const recC = () => ((kg2._reg().browsers[pp.id] || {}).environment || {}).confirmed;
      if (log.onEvent) log.onEvent({ kind: 'held', profileId: pp.id, at: 6, after: null });   // held again (the notices above took it down)
      const c0 = recC(); if (log.onEvent) log.onEvent({ kind: 'lost', profileId: pp.id, at: 7 }); const c1 = recC(); if (log.onEvent) log.onEvent({ kind: 'held', profileId: pp.id, at: 8, after: 'lost', lostAt: 7 }); const c2 = recC();
      out.confirmedFalls = { before: c0, lost: c1, heldAgain: c2 };
      // r2311 (ii): A GRANT THAT FAILED IS TOLD — the record's words follow the latest grant job; the person told ONCE a run
      const recW = () => ((kg2._reg().browsers[pp.id] || {}).environment || {}).locationSaid, tGr = todos.length, said0 = recW();
      if (log.onEvent) log.onEvent({ kind: 'grants', profileId: pp.id, ctx: 'A', failed: 1, of: 2, at: 10 });
      const wFail = recW();
      if (log.onEvent) log.onEvent({ kind: 'grants', profileId: pp.id, ctx: 'B', failed: 0, of: 2, at: 11 });   // r2767 (b): another context succeeds — it never writes over A's failure
      const wCross = recW();
      if (log.onEvent) { log.onEvent({ kind: 'grants', profileId: pp.id, ctx: 'A', failed: 1, of: 2, at: 12 }); log.onEvent({ kind: 'grants', profileId: pp.id, ctx: 'A', failed: 0, of: 2, at: 13 }); }
      out.grantsTold = { wFail, wCross, wOk: recW(), filed: todos.slice(tGr).map((x) => x.text), filedDetail: todos.slice(tGr).map((x) => String(x.detail || '')) };
      { const e0 = (kg2._reg().browsers[pp.id] || {}).environment; if (e0) e0.locationSaid = said0; }   // the record's own words back (this profile lists no site; the legs after read them)
      // B-9584 (B, 主开发 r1791): a tab the hold CLOSED (sites on the list) — its lease marked «place», said once to the person
      const lz = kg2._reg().leases.find((l) => l && l.profileId === pp.id && String(l.browserKey) === KEY_A);
      if (lz) lz.tabs = [...(Array.isArray(lz.tabs) ? lz.tabs : []), 'T-geo-closed'];
      const tC = todos.length;
      if (log.onEvent) { log.onEvent({ kind: 'closed', profileId: pp.id, targetId: 'T-geo-closed', why: 'refused', shut: true, at: 5, opened: true }); log.onEvent({ kind: 'closed', profileId: pp.id, targetId: 'T-geo-other', why: 'refused', shut: true, at: 6, opened: true }); }
      out.lostWhy = ((kg2._reg().tabLostWhy) || {})[`${pp.id}|${KEY_A}`] || null; out.todoClosed = todos.slice(tC); out.leaseFound = !!lz;
      await kg2.stop(pp.id, { why: 'user' });
    } else { const t0s = Date.now(); while (!log.order.includes('browser-stopped') && Date.now() - t0s < 3000) await new Promise((r) => setTimeout(r, 25)); }   // the stop runs once the refused start settles
    out.stateP = (kg2._reg().browsers[pp.id] || {}).state; out.stopRan = log.order.includes('browser-stopped');
    if (refuse && !out.stopRan) { try { await kg2.stop(pp.id, { why: 'user' }); } catch { /* a RED's own copy: ended here */ } }
    if (quick) return out;
    const armsBefore = log.arms.length;
    out.eb = await thr(() => kg2.start(pb.id, { why: 'test' }));
    out.recB = (kg2._reg().browsers[pb.id] || {}).environment || null;
    out.geoB = geoOf(prefsOf(profOf(pb.id).dir)); out.armsForBlocked = log.arms.length - armsBefore;
    if (!out.eb) await kg2.stop(pb.id, { why: 'user' });
    // back at «this machine's»: the person's own values given back, the kept file gone
    delete profOf(pp.id).environment;
    const e2 = await thr(() => kg2.start(pp.id, { why: 'test' })); if (!e2) await kg2.stop(pp.id, { why: 'user' });
    out.geoP2 = geoOf(prefsOf(profOf(pp.id).dir)); out.keptP2 = keptOf(profOf(pp.id).dir);
    return out;
  };
  const g0 = await geoRoad(K, 'real');
  ok(g0.makersUntouched === 0 && g0.armsUntouched === 0 && g0.prefsU === null && !g0.keptU,
    '⑦g (U2c bound 3) a profile with neither a place nor «blocked» (untouched, or a zone only): nothing written into its browser profile, the hold never reached (its maker not even called) — the release\'s start', { makers: g0.makersUntouched, arms: g0.armsUntouched, prefs: g0.prefsU });
  ok(!g0.ep && g0.geoP.default === 2 && g0.geoP.maps === 2 && g0.keptP,
    '⑦g FAIL CLOSED (r1264): before a place\'s Chrome starts, its OWN stored setting denies — the default «block» AND the site the person allowed before rewritten to «block» (measured: alone, the default loses to it); the person\'s values kept first', g0.geoP);
  const aP = g0.log.arms[0] || {};
  ok(J(aP.plan) === J({ kind: 'place', latitude: 35.6762, longitude: 139.6503, accuracy: 100, sites: [] }) && aP.url === 'function' && aP.stateAtArm === 'starting' && g0.orderP.indexOf('browser-ready') > g0.orderP.indexOf('arm'),
    '⑦g a place: the hold is armed with the plan BEFORE the browser is anyone\'s — the record still «starting» (ahead of ready and the mediator\'s repoint), its address read live (a relaunch moves it)', { arm: aP, order: g0.orderP });
  ok(!!g0.recP && g0.recP.applied.location === 'fixed' && g0.recP.confirmed === true && /every site is denied the location/.test(String(g0.recP.locationSaid)) && !/35\.67|139\.65/.test(J(g0.recP)),
    '⑦g the record says «fixed», confirmed once held — and in its own words that every site is denied the location (r1707 (4): no site is allowed the place yet); never the place\'s numbers', g0.recP);
  ok(g0.keptMode === 0o600, `⑦g the person's kept values beside the profile are the owner's alone (mode ${g0.keptMode !== undefined ? g0.keptMode.toString(8) : 'none'})`, g0.keptMode);
  ok(!g0.healErr && J(g0.rearms) === J([aP.pid]), '⑦g r1707 (8) THE HEAL: the record\'s address gone (a relaunch), the next lease takes the driver\'s new one and re-arms the hold THERE at once (rearmNow)', { rearms: g0.rearms, err: g0.healErr });
  ok(g0.todoUnplaced.length === 1 && /without its place/.test(g0.todoUnplaced[0].text) && /denied the location/.test(g0.todoUnplaced[0].text) && g0.todoGap.length === 0 && g0.todoDown.length === 1 && /may stay frozen/.test(String(g0.todoDown[0].detail)) && !/35\.67|139\.65/.test(J([g0.todoUnplaced, g0.todoDown])),
    '⑦g r1707 (8) THE NOTICES: a tab without its place — ONE For-you line a run (twice said once), its words «denied the location»; the place given again after a restart files NOTHING (r1707 (6): quiet while no site can read it); the hold down for good says a tab may stay frozen (r1707 (5)); no value of the place in any', { unplaced: g0.todoUnplaced, gap: g0.todoGap, down: g0.todoDown });
  ok(/^fixed — 1 of the 2 grants of the sites on its list \(each site, in each browser context\) was not given — there it reads «denied»/.test(String(g0.grantsTold && g0.grantsTold.wFail)) && /^fixed — 1 of the 4 grants of the sites on its list/.test(String(g0.grantsTold && g0.grantsTold.wCross))
    && /only the 2 sites on its list read the place/.test(String(g0.grantsTold && g0.grantsTold.wOk))
    && g0.grantsTold.filed.length === 1 && /a site on its list was not given its place/.test(g0.grantsTold.filed[0]) && !/127\.0\.0\.1|example/.test(J(g0.grantsTold.filed))
    && /did not take 1 of those 2 grants/.test(g0.grantsTold.filedDetail[0]) && /once in each browser context/.test(g0.grantsTold.filedDetail[0]) && !/of the \d+ sites?\b/.test(g0.grantsTold.filedDetail[0]) && !/127\.0\.0\.1|example/.test(J(g0.grantsTold.filedDetail)),
    '⑦g r2311 (ii) a grant that failed is TOLD: the record says how many grants of its listed sites were not given, the RUN\'s whole count across contexts (r2767 (b): a later context that succeeds never writes over one that failed), whole again when every context holds; the person told ONCE a run, no origin, its count of GRANTS (r2932 (4): one site in one browser context — never «N of the M sites»)', g0.grantsTold);
  ok(J(g0.confirmedFalls) === J({ before: true, lost: false, heldAgain: true }), '⑦g r2172 (c) the record\'s «confirmed» FALLS when the hold is lost (and down) and comes back when it holds again — never «fixed, confirmed» over a dead hold', g0.confirmedFalls);
  ok(g0.leaseFound && g0.lostWhy === 'place' && g0.todoClosed.length === 1 && /a tab was closed/.test(g0.todoClosed[0].text) && !/35\.67|139\.65|example/.test(J(g0.todoClosed)),
    '⑦g B-9584 (B): a tab the hold CLOSED (its place not given, sites on the list) — the lease whose tab it was is marked «place» (its next command says why BY NAME), the person told ONCE a run, no value, no site', { lostWhy: g0.lostWhy, todo: g0.todoClosed });
  { const TBSm = require('../src/browser-tabs.js'); const t = TBSm.reboundNoteText({ how: 'new', why: 'place' });
    ok(/this profile's place could not be given to it in time/.test(t) && /a new tab was opened and bound for you/.test(t), '⑦g (B): the agent\'s rebound note for a tab the hold closed names WHY', t); }
  { const ks4 = read('src/server/browser-keeper.js');
    ok((ks4.match(/const geolocation = geoPlanFor\(p, envR\);/g) || []).length === 1 && /notApplied \? 'not-applied' : 'machine'/.test(ks4), '⑦g r1707 (4) THE RECORD TELLS THE TRUTH (by its source — the keeper\'s ephemeral start re-creates its profile, no fast seam): the record\'s location word comes from the ONE plan the arm reads (geoPlanFor), an ephemeral or a paired machine\'s environment said «not-applied»', null); }
  ok(!g0.eb && g0.armsForBlocked === 0 && g0.geoB.default === 2 && !!g0.recB && g0.recB.applied.location === 'blocked' && g0.recB.confirmed === true,
    '⑦g «blocked» is the profile\'s OWN stored denial ALONE — written before its Chrome, NO hold armed (nothing of ours needs to be alive), recorded confirmed', { geo: g0.geoB, arms: g0.armsForBlocked, rec: g0.recB });
  ok(g0.geoP2.default === null && g0.geoP2.maps === 1 && !g0.keptP2,
    '⑦g back at «this machine\'s»: the person\'s own values GIVEN BACK at the next start (the site allowed before allowed again, no default of ours), the kept file gone', g0.geoP2);
  ok(g0.log.disarms.includes(aP.pid), '⑦g the stop disarms the hold (it ends with its browser)', g0.log.disarms);
  const gr = await geoRoad(K, 'refused', { refuse: true });
  ok(!!gr.ep && gr.ep.code === 'browser_place_not_held' && /never runs with this machine's location/.test(String(gr.ep.message)) && !/This machine's/.test(String(gr.ep.message)) && gr.stateP !== 'ready' && !gr.orderP.includes('browser-ready') && gr.stopRan,
    '⑦g a refused arm ⇒ the start refused BY NAME (browser_place_not_held; no door named that does not exist yet), no browser-ready, and the stop RAN once the start settled (browser-stopped)', { code: gr.ep && gr.ep.code, state: gr.stateP, order: gr.orderP, stopRan: gr.stopRan });
  // REDs (anchored): the arm taken out; the hold asked for every start; the stored denial not written
  const MUTg = mutantCopies('geo-builds', REPO), ksG = read('src/server/browser-keeper.js');
  const ARM_LINE = "      if (stockEnv && stockEnv.geolocation && stockEnv.geolocation.kind === 'place') await armGeo(p, rec, stockEnv.geolocation);";
  const Knoarm = MUTg.load('src/server/browser-keeper.js', anchored(ksG, ARM_LINE, "      if (false) await armGeo(p, rec, stockEnv.geolocation);", '⑦g RED no arm'), 'geo-no-arm');
  const gn = await geoRoad(Knoarm, 'red-noarm');
  ok(gn.log.arms.length === 0 && gn.orderP.includes('browser-ready'), '⑦g RED — the driver road without the arm: a place\'s browser is anyone\'s with no place on it (the arm leg goes red)', gn.log);
  const Kalways = MUTg.load('src/server/browser-keeper.js', anchored(ksG, ARM_LINE, "      if (stockEnv) await geo().arm(p.id, { url: rec.cdpUrl, plan: stockEnv.geolocation });", '⑦g RED always'), 'geo-always');
  const ga = await geoRoad(Kalways, 'red-always');
  ok(ga.makersUntouched > 0 && ga.armsUntouched > 0, '⑦g RED — the hold asked for every stock start: an untouched profile reaches the hold (its start is no longer the release\'s)', { makers: ga.makersUntouched, arms: ga.armsUntouched });
  const Knostore = MUTg.load('src/server/browser-keeper.js', anchored(ksG, "      { const gs = await geoStoreAt(p, stockEnv && stockEnv.geolocation);", "      { const gs = { ok: true, why: 'skipped' }; void geoStoreAt;", '⑦g RED no store'), 'geo-no-store');
  const gs = await geoRoad(Knostore, 'red-nostore');
  ok(gs.geoP.maps === 1 && gs.geoP.default === null, '⑦g RED — the start without the stored denial: the site allowed before keeps «allow» (with nothing of ours alive it reads this machine\'s position — measured)', gs.geoP);
  const Knostop = MUTg.load('src/server/browser-keeper.js', anchored(ksG, "    setImmediate(() => { stop(pid, { why: 'place-not-held' })", "    void (() => { stop(pid, { why: 'place-not-held' })", '⑦g RED no stop'), 'geo-no-stop');
  const gt = await geoRoad(Knostop, 'red-nostop', { refuse: true, quick: true });
  ok(!gt.stopRan, '⑦g RED — the refused arm without its stop: the refused start leaves a started Chrome under a «starting» record (the stop leg goes red)', { stopRan: gt.stopRan, state: gt.stateP });
  const Knoheal = MUTg.load('src/server/browser-keeper.js', anchored(ksG, '    if (geoHoldOwn && geoHoldOwn.heldOf(profileId)) geoHoldOwn.rearmNow(profileId);', '    void 0;', '⑦g RED no heal re-arm'), 'geo-no-heal');
  const gh = await geoRoad(Knoheal, 'red-noheal', { quick: true });
  ok(J(gh.rearms) === '[]', '⑦g RED — the heal without its re-arm: a Chrome relaunched on a new address is never held again (the heal leg goes red)', gh.rearms);
  const Kgap = MUTg.load('src/server/browser-keeper.js', anchored(ksG, "      log.log?.(`[browser] ${pid} \"${label}\": ${what} given to its tabs again", "      file('gap:' + (ev.lostAt || ev.at), 'gap', 'gap'), log.log?.(`[browser] ${pid} \"${label}\": ${what} given to its tabs again", '⑦g RED gap notice'), 'geo-gap-notice');
  const gq = await geoRoad(Kgap, 'red-gap', { quick: true });
  ok(gq.todoGap.length === 1, '⑦g RED — the gap notice back: every hub restart files a For-you line per place profile that tells nothing to act on (the quiet leg goes red)', gq.todoGap);
  // r1707 (3) THE PERSON'S OWN SETTINGS: a site they allow in Chrome's own settings WHILE held is kept at the next held launch, given back after
  const geoOf2 = (pr) => { const g = ((((pr || {}).profile || {}).content_settings || {}).exceptions || {}).geolocation || {}; return { maps: (g['https://maps.example:443,*'] || {}).setting ?? null, shop: (g['https://shop.example:443,*'] || {}).setting ?? null, default: ((((pr || {}).profile || {}).default_content_setting_values) || {}).geolocation ?? null }; };
  const PLACEV = ENVm.environmentVerdict({ location: { mode: 'value', value: { latitude: 35.6762, longitude: 139.6503 } } }).value;
  const okStub = () => ({ arm: async () => ({ ok: true }), disarm: () => true, heldOf: () => null, factOf: () => null, rearmNow: () => false, dispose() { } });
  const twice = async (Kmod, tag) => {
    const kq = mkKeeper(path.join(ROOT, `data-geo2-${tag}`), { geoHold: okStub }, Kmod);
    const pq = kq.createProfile({ label: `Geo twice ${tag}` }); const pr = kq._reg().profiles.find((x) => x && x.id === pq.id);
    pr.environment = PLACEV;
    const pf = path.join(pr.dir, 'Default', 'Preferences'); fs.mkdirSync(path.dirname(pf), { recursive: true });
    fs.writeFileSync(pf, J({ profile: { content_settings: { exceptions: { geolocation: { 'https://maps.example:443,*': { setting: 1 } } } } } }));
    const e1 = await thr(() => kq.start(pq.id, { why: 'test' })); if (!e1) await kq.stop(pq.id, { why: 'user' });
    const mid = prefsOf(pr.dir) || {}; (((mid.profile = mid.profile || {}).content_settings = mid.profile.content_settings || {}).exceptions = mid.profile.content_settings.exceptions || {}).geolocation = { ...(mid.profile.content_settings.exceptions.geolocation || {}), 'https://shop.example:443,*': { setting: 1 } };
    fs.writeFileSync(pf, J(mid));   // while held, the person allowed another site in Chrome's own settings (Chrome wrote its row)
    const e2 = await thr(() => kq.start(pq.id, { why: 'test' })); if (!e2) await kq.stop(pq.id, { why: 'user' });
    const held2 = geoOf2(prefsOf(pr.dir));
    delete pr.environment;
    const e3 = await thr(() => kq.start(pq.id, { why: 'test' })); if (!e3) await kq.stop(pq.id, { why: 'user' });
    return { errs: [e1, e2, e3].map((e) => e && e.code), held2, back: geoOf2(prefsOf(pr.dir)) };
  };
  const tw = await twice(K, 'real');
  ok(tw.errs.every((e) => !e) && tw.held2.maps === 2 && tw.held2.shop === 2 && tw.back.maps === 1 && tw.back.shop === 1 && tw.back.default === null,
    '⑦g r1707 (3) THE SECOND HELD LAUNCH: a site the person allowed in Chrome\'s own settings while held is denied at the next held launch AND kept — at «this machine\'s» both sites are allowed again (the first value of the one kept before, never a denial)', tw);
  const Konce = MUTg.load('src/server/browser-keeper.js', anchored(ksG, 'if (!kept) await writeAtomic(keptFile, v.kept); else {', '{ await writeAtomic(keptFile, v.kept); } if (false) {', '⑦g RED once-only cut'), 'geo-kept-every-launch');
  const tw1 = await twice(Konce, 'red-once');
  ok(tw1.back.maps === 2, '⑦g RED — the once-only guard cut: the second held launch keeps the DENIED values as the person\'s, and the give-back restores «block» everywhere (the second-launch leg goes red)', tw1.back);
  const Knomerge = MUTg.load('src/server/browser-keeper.js', anchored(ksG, 'if (m.changed) await writeAtomic(keptFile, m.kept); }', 'void m; }', '⑦g RED no merge'), 'geo-kept-no-merge');
  const tw2 = await twice(Knomerge, 'red-nomerge');
  ok(tw2.back.shop === 2, '⑦g RED — no merge: the site allowed while held stays «block» after the give-back (the person\'s own setting lost)', tw2.back);
  // r1707 (2) + (8) THE STORE'S REFUSALS: a held launch whose kept file or Preferences cannot be read, or whose write fails, is refused BY NAME
  // (the file and what failed, no door that does not exist); a profile that asks for no place and no «blocked» is NEVER refused by this road
  const storeLegs = async (Kmod, tag, which) => {
    const ksx = mkKeeper(path.join(ROOT, `data-geo3-${tag}`), { geoHold: okStub }, Kmod);
    const one = async (label, place, plant) => {
      const p = ksx.createProfile({ label: `Geo store ${label} ${tag}` }); const pr = ksx._reg().profiles.find((x) => x && x.id === p.id);
      if (place) pr.environment = PLACEV;
      fs.mkdirSync(path.join(pr.dir, 'Default'), { recursive: true }); plant(pr.dir);
      const e = await thr(() => ksx.start(p.id, { why: 'test' }));
      if (!e) await ksx.stop(p.id, { why: 'user' });
      return e ? { code: e.code, message: String(e.message) } : { started: true };
    };
    const r = {};
    if (which.includes('kept')) r.kept = await one('kept', true, (d) => fs.mkdirSync(path.join(d, 'vibespace-geo-kept.json')));   // unreadable: a folder there
    if (which.includes('prefs')) r.prefs = await one('prefs', true, (d) => fs.writeFileSync(path.join(d, 'Default', 'Preferences'), '[1]'));
    if (which.includes('write')) r.write = await one('write', true, (d) => { fs.writeFileSync(path.join(d, 'Default', 'Preferences'), J({ profile: { content_settings: { exceptions: { geolocation: { 'https://maps.example:443,*': { setting: 1 } } } } } })); fs.mkdirSync(path.join(d, 'Default', `Preferences.vibespace-${process.pid}.tmp`)); });
    if (which.includes('untouched')) r.untouched = await one('untouched', false, (d) => fs.mkdirSync(path.join(d, 'vibespace-geo-kept.json')));
    return r;
  };
  const sr = await storeLegs(K, 'real', ['kept', 'prefs', 'write', 'untouched']);
  const named = (x, re) => !!x && x.code === 'browser_place_not_held' && re.test(x.message) && !/This machine's/.test(x.message);
  ok(named(sr.kept, /vibespace-geo-kept\.json: unreadable \(EISDIR\)/) && named(sr.prefs, /Default\/Preferences: its Preferences are not an object/) && named(sr.write, /Default\/Preferences: not written \(EISDIR\)/),
    '⑦g r1707 (8) THE STORE\'S THREE REFUSALS: a kept file it cannot read, Preferences of another shape, a write that fails — each refuses the held start BY NAME, saying the file and what failed (and no door that does not exist)', sr);
  ok(!!sr.untouched && sr.untouched.started === true, '⑦g r1707 (2) a profile that asks for no place and no «blocked» is NEVER refused by this road: its kept file unreadable, it starts (said in the journal, given back at a later start)', sr.untouched);
  const STORE_FAIL = '    const fail = (why) => (plan ? { ok: false, why } : later(why));';
  const Klax = MUTg.load('src/server/browser-keeper.js', anchored(ksG, STORE_FAIL, '    const fail = (why) => later(why);', '⑦g RED store lax'), 'geo-store-lax');
  const srL = await storeLegs(Klax, 'red-lax', ['kept']);
  ok(!!srL.kept && srL.kept.started === true, '⑦g RED — the store\'s refusals taken out: a place profile whose kept file cannot be read STARTS (its denial not written)', srL.kept);
  const Kstrict = MUTg.load('src/server/browser-keeper.js', anchored(ksG, STORE_FAIL, '    const fail = (why) => ({ ok: false, why });', '⑦g RED store strict'), 'geo-store-strict');
  const srS = await storeLegs(Kstrict, 'red-strict', ['untouched']);
  ok(!!srS.untouched && srS.untouched.code === 'browser_place_not_held', '⑦g RED — the release\'s strictness: an untouched profile whose kept file cannot be read is REFUSED at its start (r1707 (2)\'s leg goes red)', srS.untouched);
  // r1707 (5) + (8) THE ADOPTION: a restart's arm refused leaves the person's running browser running (the stored denial holds) and says so once
  const adoptOf = async (Kmod, tag, { red = false } = {}) => {
    const dir = path.join(ROOT, `data-geo4-${tag}`);
    const ka = mkKeeper(dir, { geoHold: okStub }, Kmod);
    const pa = ka.createProfile({ label: `Geo adopt ${tag}` }); ka._reg().profiles.find((x) => x && x.id === pa.id).environment = PLACEV;
    const e = await thr(() => ka.start(pa.id, { why: 'test' }));
    ka.shutdown();
    const arms = [], t0 = todos.length;
    const kb2 = mkKeeper(dir, { geoHold: () => ({ ...okStub(), arm: async (pid, o) => { arms.push({ pid, after: (o && o.after) || null }); return { ok: false, code: 'place_not_held', error: 'a stand-in refusal' }; } }) }, Kmod);
    await kb2.boot();
    if (red) { const tR = Date.now(); while ((kb2._reg().browsers[pa.id] || {}).state === 'ready' && Date.now() - tR < 6000) await new Promise((r) => setTimeout(r, 25)); } else await new Promise((r) => setTimeout(r, 400));
    const state = (kb2._reg().browsers[pa.id] || {}).state, items = todos.slice(t0), conf = (((kb2._reg().browsers[pa.id] || {}).environment) || {}).confirmed;
    try { await kb2.stop(pa.id, { why: 'user' }); } catch { /* ended */ }
    kb2.shutdown();
    return { e: e && e.code, arms, state, items, conf };
  };
  // r2172 (a): a PAIRED MACHINE's profile (and an ephemeral one) asking a place or «blocked» is REFUSED BY NAME at its start — never started «not applied»
  { const ka = mkKeeper(path.join(ROOT, 'data-geo6'), { geoHold: okStub }, K);
    const pa = ka.createProfile({ label: 'Geo paired' }); const ra = ka._reg().profiles.find((x) => x && x.id === pa.id);
    ra.host = 'paired-stand-in'; ra.environment = PLACEV;
    const e = await thr(() => ka.start(pa.id, { why: 'test' }));
    ok(!!e && e.code === 'browser_place_unsupported' && /a paired machine/.test(String(e.message)) && !/35\.67|139\.65/.test(String(e.message)), '⑦g r2172 (a) a paired machine\'s profile asking a place is REFUSED BY NAME at its start (browser_place_unsupported) — never started with that machine\'s real position', e && { code: e.code, message: String(e.message) });
    const RB = require('../src/routes/browser.js'); const rs = { req: { path: '/x' }, locals: {}, status(c) { this.c = c; return this; }, json(o) { this.o = o; return this; } }; RB.fail(rs, Object.assign(new Error('x'), { code: 'browser_place_unsupported' }));
    ok(rs.c === 409, '⑦g (a) the route answers it 409', rs.c); }
  // r2311 (lens 3): the EPHEMERAL half of r2172 (a), pinned in the keeper's source (its ephemeral start re-creates its profile: no fast seam)
  ok(/function placeRefusalOf\(p\) \{\n    if \(!p \|\| !\(isEph\(p\) \|\| p\.host\)/.test(read('src/server/browser-keeper.js')), '⑦g r2172 (a) its ephemeral half pinned in the source: placeRefusalOf refuses an ephemeral profile (isEph) as it refuses a paired one', null);
  const ad = await adoptOf(K, 'real');
  ok(!ad.e && ad.arms.length === 1 && ad.arms[0].after === 'restart' && ad.state === 'ready' && ad.conf === false && ad.items.length === 1 && /could not be armed after VibeSpace restarted/.test(String(ad.items[0].detail)) && /may stay frozen/.test(String(ad.items[0].detail)) && !/35\.67|139\.65/.test(J(ad.items)),
    '⑦g r1707 (5) THE ADOPTION: a restart\'s arm refused does NOT stop the person\'s running browser (the stored denial holds) — ONE For-you line says the place cannot be given and that a tab may stay frozen', ad);
  const Krestop = MUTg.load('src/server/browser-keeper.js', anchored(ksG, "    if (after === 'restart') { log.warn?.(", "    if (false) { log.warn?.(", '⑦g RED restart stops'), 'geo-restart-stops');
  const adR = await adoptOf(Krestop, 'red-stop', { red: true });
  ok(adR.state !== 'ready', '⑦g RED — the release\'s adoption: a restart\'s refused arm STOPS the person\'s browser, tabs and all, for no safety gain (the adoption leg goes red)', { state: adR.state });
  // r1897 THE STORED DENIAL'S WRITES ARE SYNCED: the person's kept values FIRST, then the profile's Preferences — each temp's bytes on
  // disk BEFORE its rename (awaited). The leg watches the keeper's own calls (the fs module it shares) on this profile's folder only
  const syncOrder = async (Kmod, tag) => {
    const kz = mkKeeper(path.join(ROOT, `data-geo5-${tag}`), { geoHold: () => ({ arm: async () => ({ ok: true }), disarm: () => true, heldOf: () => null, factOf: () => null, rearmNow: () => false, dispose() { } }) }, Kmod);
    const pq = kz.createProfile({ label: `Geo synced ${tag}` }); const pr = kz._reg().profiles.find((x) => x && x.id === pq.id);
    pr.environment = ENVm.environmentVerdict({ location: { mode: 'value', value: { latitude: 35.6762, longitude: 139.6503 } } }).value;
    fs.mkdirSync(path.join(pr.dir, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(pr.dir, 'Default', 'Preferences'), J({ profile: { content_settings: { exceptions: { geolocation: { 'https://maps.example:443,*': { setting: 1 } } } } } }));
    const seq = [], realOpen = fs.promises.open, realRename = fs.promises.rename;
    const mine = (p) => String(p).startsWith(pr.dir);
    fs.promises.open = async function (p, ...a) { const fh = await realOpen.call(this, p, ...a); if (mine(p)) { const s = fh.sync.bind(fh); fh.sync = async () => { seq.push(`sync ${path.basename(String(p))}`); return s(); }; } return fh; };
    fs.promises.rename = async function (a, b) { if (mine(a)) seq.push(`rename ${path.basename(String(b))}`); return realRename.call(this, a, b); };
    let e = null;
    try { e = await thr(() => kz.start(pq.id, { why: 'test' })); } finally { fs.promises.open = realOpen; fs.promises.rename = realRename; }
    if (!e) await kz.stop(pq.id, { why: 'user' });
    return { e: e && e.code, seq };
  };
  const so = await syncOrder(K, 'real');
  const wantSeq = [`sync vibespace-geo-kept.json.vibespace-${process.pid}.tmp`, 'rename vibespace-geo-kept.json', `sync Preferences.vibespace-${process.pid}.tmp`, 'rename Preferences'];
  ok(!so.e && J(so.seq) === J(wantSeq), `⑦g r1897 THE WRITES ARE SYNCED: the person's kept values FIRST, then the profile's Preferences — each temp synced to disk BEFORE its rename (a power cut never leaves a torn Preferences): ${J(so.seq)}`, so);
  const Knosync = MUTg.load('src/server/browser-keeper.js', anchored(ksG, 'await fh.writeFile(JSON.stringify(obj)); await fh.sync();', 'await fh.writeFile(JSON.stringify(obj));', '⑦g RED no sync'), 'geo-no-sync');
  const sn = await syncOrder(Knosync, 'red-nosync');
  ok(!sn.e && !sn.seq.some((x) => x.startsWith('sync ')) && sn.seq.includes('rename Preferences'), '⑦g RED — the write without its sync: each file renamed with its bytes not yet on disk (the order leg goes red)', sn);
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
  const tarRawOf = (entries) => {
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
    return Buffer.concat(parts);
  };
  const tarOf = (entries) => zlib.zstdCompressSync(tarRawOf(entries));
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
  ok(keD._reg().browsers[pk.id].browserChoice.version === '150.0.7871.186-vs1' && runs1() === 1 && kernelOf(fake.launches().at(-1).exe) === KP, 'the launch: the kernel, the MEASURED version on the browser record — the kernel ran --version once in all', { runs: runs1(), rc: keD._reg().browsers[pk.id].browserChoice });
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
  ok(ED.kernelFact(EID).state === 'installed' && kernelOf(fake.launches().at(-1).exe) === KP && ke8._reg().browsers[p8.id].browserChoice.version === '150.0.7871.186-vs1' && runs1() === 1, '…it lands, and the next launch runs it with its measured version (one --version)', { st: ED.kernelFact(EID).state, runs: runs1() });
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
    // ⑧c the kernel side's OWN server.js + src/index.mjs forked by the REAL plugin-loader under node --permission (capabilities.server = {}):
    // /probe, /launch-options and /resolve-launch all answer 200 without touching any path outside VIBESPACE_PLUGIN_DIR / VIBESPACE_PLUGIN_DATA
    const peerRoot = path.join(ROOT, 'peer-loader-sandbox');
    const peerPlugDst = path.join(peerRoot, 'data', 'plugins', EID);
    fs.mkdirSync(peerPlugDst, { recursive: true });
    for (const rel of ['server.js', 'vibespace-plugin.json', 'package.json', 'kernel.json', 'config', 'src']) {
      if (fs.existsSync(path.join(peerDir, rel))) fs.cpSync(path.join(peerDir, rel), path.join(peerPlugDst, rel), { recursive: true });
    }
    const ldrP = require('../src/server/plugin-loader.js').create({
      rootDir: peerRoot,
      app: expressE(),
      hostVersion: '2.369.369',
      log: { log() {}, warn() {} },
      agentEnv: () => ({ PATH: '/nonexistent-outside-sandbox/bin:/usr/bin', HOME: '/nonexistent-outside-sandbox/home' }),
    });
    const engrP = require('../src/server/browser-engines.js').create({ loader: ldrP, dataDir: path.join(peerRoot, 'data'), timeoutMs: 3000 });
    ldrP.setEnabled(EID, true, { trusted: true });
    const tPeer = Date.now(); while (engrP.rows().length !== 1 && Date.now() - tPeer < 8000) await new Promise((r) => setTimeout(r, 25));
    const prPeer0 = await engrP.probe(EID);
    const loPeerRaw = await ldrP.askRoute(EID, { method: 'POST', path: '/launch-options', body: { profileId: 'bp-peer', userDataDir: '/outside/sandbox/profile' } });
    const kpPeer = engrP.kernelPath(EID);
    fs.mkdirSync(path.dirname(kpPeer), { recursive: true });
    const elfBuf = Buffer.alloc(64); elfBuf[0] = 0x7f; elfBuf[1] = 0x45; elfBuf[2] = 0x4c; elfBuf[3] = 0x46; elfBuf[4] = 2;
    fs.writeFileSync(kpPeer, elfBuf, { mode: 0o755 });
    const prPeer1 = await engrP.probe(EID);
    const loPeer1 = await engrP.launchOptions(EID, { profileId: 'bp-peer', binaryPath: kpPeer, userDataDir: '/outside/sandbox/profile' });
    ok(prPeer0.ok && prPeer0.fact.installed === false && loPeerRaw.status === 200 && prPeer1.ok && prPeer1.fact.installed === true && prPeer1.fact.executable === true && prPeer1.fact.version === null && loPeer1.ok && loPeer1.launch.executablePath === kpPeer,
      'the kernel side\'s OWN plugin (VIBESPACE_CUSTOM_BROWSER_PLUGIN) under the real loader\'s --permission sandbox: /probe, /launch-options and /resolve-launch all answer 200 with zero outside-sandbox fs touches', { prPeer0, loStatus: loPeerRaw.status, prPeer1, loPeer1 });
    ldrP.shutdown();
  }
  // ⑨ RED CONTROL: a copy without the sha256 check installs the corrupted archive — exactly what ④'s sha leg refuses
  const EDS = read('src/server/engine-distribution.js');
  const shaAnchor = "    if (sha !== m.sha256) throw named('build_verify_failed',";
  // lane fleet-plugin-catalog r3: the landing's ONE judge compares the download with the plan's sha256 too (a second line) — the
  // control removes it beside the sha check, so it still measures the sha check alone (r4: the judge's comparison, asked before the
  // scan AND last inside the landing — removed at its one place, landingVerdict)
  const judgeAnchor = "      if (!p || p.sha256 !== sha256) return { ok: false, why: 'stale', p };\n";
  ok(EDS.includes(shaAnchor) && EDS.includes(judgeAnchor), 'control: the sha256 check\'s anchor (and the landing judge\'s) is in engine-distribution.js');
  const { mutantCopies: mutantCopies8 } = await import('./mutant-copy.mjs');
  const EDx = mutantCopies8('builds-kernel', REPO).load('src/server/engine-distribution.js', editAnchor(editAnchor(EDS, shaAnchor, "    if (false) throw named('build_verify_failed',", "src/server/engine-distribution.js"), judgeAnchor, '', "src/server/engine-distribution.js"), 'no-sha');
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
  ok(!sA && fs.existsSync(KP) && !fs.existsSync(removing) && hits.length === h12b && kernelOf(fake.launches().at(-1).exe) === KP, 'round 3: a FIRST USE finds the kernel aside ⇒ the launch puts it back (no download) and starts it', { e: sA && sA.message, hits: hits.slice(h12b) });
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
  ok(dropped && stillC === 'failed' && !sC && kernelOf(fake.launches().at(-1).exe) === KP && kfC.state === 'installed' && kfC.version === kL.version && kfC.code === null && JSON.stringify(recC.kernel) === JSON.stringify(kL) && !recC.aside && !recC.failure && leftTodos.length === 1 && hits.length === h12c,
    'round 4 (c): a record DROPPED once (a put-back that failed) + the kernel back in its place ⇒ the next good probe (a first use: installed, executable) measures and the record says installed again — its own record, the failure cleared, no download, no second notice',
    { dropped, stillC, kfC, e: sC && sC.message });
  await keC.stop(pC.id, { why: 'user' });

  // ⑬ THE RED CONTROLS of round 2 — patched copies, each turning a leg above red
  const fwA = EDS.indexOf('  function fileWriter(dest) {'), fwB = EDS.indexOf('  /** The free bytes of the filesystem');
  const gateAnchor = '      planOf(sid, { unpack: unpackFacts(), format: m0.ok ? m0.layout.archiveFormat : EK.archiveFormatOf(doc, plan.tag) });'; // lane engine-spi-egress: the gate reads the archive's format (r2: after kernel.json is judged)
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
  const EDg = M8.load('src/server/engine-distribution.js', editAnchor(EDS, gateAnchor, '      planOf(sid, { unpack: null });', "src/server/engine-distribution.js"), 'no-node-gate');
  writeKJ('/k.tar.zst'); const h13 = hits.length;
  const eG = await thrK(edAt('data-ed13c', { zlib: {}, nodeVersion: '20.20.2' }, EDg).installKernel(EID, { wait: true }));
  ok(eG && eG.code === 'build_unpack_failed' && hits.length > h13 && fs.existsSync(KP), 'control (3): a copy WITHOUT the gate fetches the whole archive, hashes it, then blames the ARCHIVE (build_unpack_failed) — RED against ⑪', { code: eG && eG.code, hits: hits.slice(h13) });
  // (4) no put-back / no restore: the previous kernel lost
  const EDb = M8.load('src/server/engine-distribution.js', editAnchor(EDS, backAnchor, backAnchor.replace('if (had)', 'if (false)'), "src/server/engine-distribution.js"), 'no-put-back');
  const eB = await thrK(edAt('data-ed13d', { io: failLand }, EDb).installKernel(EID, { wait: true }));
  const lostB = !fs.existsSync(KP) && fs.existsSync(removing);
  const EDa = M8.load('src/server/engine-distribution.js', editAnchor(EDS, asideAnchor, asideAnchor + ' return false;', "src/server/engine-distribution.js"), 'no-restore');
  const mB = await edAt('data-ed13e', {}, EDa).measure(EID, { force: true }); // round 3's measure would put it back — this copy never does
  const eA = await thrK(edAt('data-ed13f', { io: failLand }, EDa).installKernel(EID, { wait: true })); // the aside copy the control above left
  const lostA = !fs.existsSync(KP) && !fs.existsSync(removing);
  ok(eB && eA && !mB.ok && mB.code === 'browser_engine_kernel_missing' && lostB && lostA, 'control (4): a copy that does not move the previous kernel back leaves NO kernel at its path (measure: kernel missing) — RED; a copy that does not restore an aside copy DELETES it at the next landing — the previous kernel lost, RED', { mB: mB.code, lostB, lostA });
  // (6) the fleet's http URL dropped for the package's; (7) `./` read as a top folder
  const EKf = M8.load('src/engine-kernel.js', editAnchor(EKS, urlAnchor, "if (flUrl && !httpsUrlOf(flUrl)) flUrl = ''; if (false) return { ok: false, code: 'engine_url_not_https'", "src/engine-kernel.js"), 'fleet-fallback');
  const fF = EKf.kernelManifestVerdict(kjson(), { tag: 'linux-x64', id: EID, fleet: { url: 'http://artifacts.fleet.test/k.tar.zst', sha256: 'b'.repeat(64) } });
  ok(fF.ok && fF.host === 'kernels.test', 'control (6): a copy that DROPS the http fleet URL silently takes the package\'s address in its place — RED against the refusal', { ok: fF.ok, host: fF.host });
  const EKr = M8.load('src/engine-kernel.js', editAnchor(EKS, rootAnchor, '    /* no root rule */', "src/engine-kernel.js"), 'no-root');
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
  const ED9 = M8.load('src/server/engine-distribution.js', editAnchor(EDS, bootAnchor, '    const restored = [];', "src/server/engine-distribution.js"), 'no-boot-restore');
  await thrK(atB().installKernel(EID, { wait: true })); // the record: installed
  fs.renameSync(kdir, removing);
  const n9 = atB({}, ED9); await n9.bootFleet();
  const lie9 = !fs.existsSync(KP) && n9.kernelFact(EID).state === 'installed';
  fs.renameSync(removing, kdir);
  ok(lie9, 'control (9): a copy whose boot does not put the aside copy back leaves the place EMPTY while the record says «installed» — RED against ⑫b', { lie9 });
  // (10) the landing keeps the record when NEITHER kernel is in its place
  const ED10 = M8.load('src/server/engine-distribution.js', editAnchor(EDS, asideRecAnchor, '      if (false) { const rk = recOf(sid);', "src/server/engine-distribution.js"), 'aside-record');
  const n10 = atB({ io: failBoth }, ED10); const e10 = await thrK(n10.installKernel(EID, { wait: true }));
  const lie10 = !fs.existsSync(KP) && fs.existsSync(removing) && n10.kernelFact(EID).state === 'installed';
  fs.renameSync(removing, kdir);
  ok(e10 && e10.code === 'build_unpack_failed' && lie10, 'control (10): a copy whose landing keeps the record when both renames fail says «installed» over an EMPTY place — RED against ⑫b', { e10: e10 && e10.code, lie10 });
  // (11) round 2's fleet reading: a malformed fleet sha256 dropped for the package's — the silent fallback
  const shaFleetAnchor = "  const flSha = isObj(fleet) ? given(fleet.sha256).toLowerCase() : '';";
  const EKs = M8.load('src/engine-kernel.js', editAnchor(EKS, shaFleetAnchor, "  const flSha = isObj(fleet) && SHA_RE.test(given(fleet.sha256).toLowerCase()) ? given(fleet.sha256).toLowerCase() : '';", "src/engine-kernel.js"), 'fleet-sha-fallback');
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
  const ED13 = M8.load('src/server/engine-distribution.js', editAnchor(EDS, healAnchor, '', "src/server/engine-distribution.js"), 'no-heal');
  const n13 = atR({}, ED13); const m13 = await n13.measure(EID, { force: true });
  const kf13 = n13.kernelFact(EID);
  ok(EDS.includes(healAnchor) && m13.ok && kf13.state === 'failed' && !recAt('data-ed13i').kernel, 'control (13): a copy without the heal MEASURES the kernel in its place while the record stays dropped («failed» over a good kernel) — RED against ⑫c (c)', { m: m13.version || m13.code, kf13: kf13.state });
  // (14) the keeper's round-3 re-measure condition: a probe that says installed + a measured version never asks — no heal
  const KS = read('src/server/browser-keeper.js');
  const unrecAnchor = '(!engine.measuredVersion || unrecorded)';
  const K14 = M8.load('src/server/browser-keeper.js', editAnchor(KS, unrecAnchor, '!engine.measuredVersion', "src/server/browser-keeper.js"), 'no-reprobe');
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

  // ═══ ⑧e lane engine-spi-egress: A tar.gz KERNEL (a vendor's own archive — CloakBrowser's is one) ══════════════════════════════
  // gunzip beside zstd: the SAME list pass, verdicts, receipt and ONE rename; it unpacks on a Node without zstd; a member outside
  // the top folder is refused BEFORE anything is extracted; zstd bytes under a tar.gz kernel.json are refused by the format's name.
  // Each install in its own kernel place (an `engines` stub naming it) — the shared kernel above is never touched.
  const TOPG = 'vibespace-chromium-150.0.7871.186-vs1-linux-x64';
  const flatEntries = kernelEntries().filter((e) => e.name !== TOPG + '/').map((e) => ({ ...e, name: e.name.slice(TOPG.length + 1) }));
  const GZFLAT = zlib.gzipSync(tarRawOf(flatEntries));
  const GZ = zlib.gzipSync(tarRawOf(kernelEntries())), GZDOTS = zlib.gzipSync(tarRawOf(kernelEntries(undefined, [{ name: 'vibespace-chromium-150.0.7871.186-vs1-linux-x64/../../oops', body: 'x' }])));
  Object.assign(served, { '/k.tar.gz': GZ, '/dots.tar.gz': GZDOTS, '/zst-as.tar.gz': ARCH, '/flat.tar.gz': GZFLAT });
  const GZL = { archiveFormat: 'tar.gz', stripComponents: 1, binaryRelPath: 'chrome' };
  const gzAt = (name, file, opts = {}, layout = GZL) => { const kpG = path.join(ROOT, name + '-k', 'kernel', 'linux-x64', 'chrome'); const e = edAt(name, { engines: { kernelPath: () => kpG }, ...opts }); fs.writeFileSync(path.join(ROOT, name, 'plugins', EID, 'kernel.json'), JSON.stringify(kjson({}, { url: `https://kernels.test${file}`, sha256: sha(served[file]), bytes: served[file].length, layout }))); return { e, kpG }; };
  const mvG = EK.kernelManifestVerdict(kjson({}, { layout: GZL }), { tag: 'linux-x64', id: EID });
  const AF = EK.archiveFormatOf || (() => null);
  ok(mvG.ok && mvG.layout.archiveFormat === 'tar.gz' && EK.ARCHIVE_FORMATS.join() === 'tar.zst,tar.gz' && AF(kjson({}, { layout: GZL })) === 'tar.gz' && AF(kjson()) === 'tar.zst'
    && EK.kernelPlan({ kernelPath: '/d/kernel/linux-x64/chrome', unpack: { zstd: false, node: '20.20.2' }, format: 'tar.gz' }).ok && EK.kernelPlan({ kernelPath: '/d/kernel/linux-x64/chrome', unpack: { zstd: false, node: '20.20.2' }, format: 'tar.zst' }).code === 'engine_node_unsupported',
    'PURE: kernel.json may name archiveFormat tar.gz (the platform layout over the top one); a Node without zstd plans a tar.gz, never a tar.zst', mvG);
  const hG = hits.length;
  const g1 = gzAt('data-gz1', '/k.tar.gz');
  const rG = await thrK(g1.e.installKernel(EID, { wait: true }));
  const kdG = path.dirname(g1.kpG);
  let rcG = null; try { rcG = JSON.parse(fs.readFileSync(path.join(kdG, 'install-receipt.json'), 'utf8')); } catch { rcG = null; }
  ok(!rG && hits.slice(hG).includes('/k.tar.gz') && fs.statSync(g1.kpG).mode & 0o100 && LAYOUT.requiredFiles.every((f) => fs.statSync(path.join(kdG, f)).isFile()) && rcG && rcG.sha256 === sha(GZ) && rcG.archiveBytes === GZ.length && rcG.binarySha256 === sha(Buffer.from(chromeBody)) && g1.e.kernelFact(EID).state === 'installed' && !fs.readdirSync(path.dirname(kdG)).some((n) => /\.part$|^\.unpack-|^\.removing-/.test(n)),
    'a tar.gz kernel DOWNLOADS (loopback https stand-in), LISTS, VERIFIES and LANDS with its receipt (the archive\'s sha256) — ONE rename, nothing left beside it', { e: rG && rG.message, rcG });
  // L2 acceptance (B): Chrome makes `<kernel dir>/extensions` at its first start — the receipt reads the program's size only, so the
  // kernel stays installed and verified (no false «changed»)
  fs.mkdirSync(path.join(kdG, 'extensions', 'Temp'), { recursive: true }); fs.writeFileSync(path.join(kdG, 'extensions', 'Temp', 'x'), 'x');
  const mX = await g1.e.measure(EID, { force: true });
  ok(mX.ok && g1.e.kernelFact(EID).state === 'installed' && EK.receiptVerdict(rcG, { size: fs.statSync(g1.kpG).size }).verified === true, 'L2 acceptance (B): an `extensions` folder Chrome made in the kernel\'s folder changes nothing — installed, the receipt verified (it reads the program\'s size only)', mX);
  const g2 = gzAt('data-gz2', '/k.tar.gz', { zlib: {}, nodeVersion: '20.20.2' });
  const rN = await thrK(g2.e.installKernel(EID, { wait: true }));
  const g3 = gzAt('data-gz3', '/dots.tar.gz');
  const rD = await thrK(g3.e.installKernel(EID, { wait: true }));
  const g4 = gzAt('data-gz4', '/zst-as.tar.gz');
  const rZ = await thrK(g4.e.installKernel(EID, { wait: true }));
  ok(!rN && fs.existsSync(g2.kpG) && rD && rD.code === 'build_unpack_failed' && !fs.existsSync(path.dirname(g3.kpG)) && rZ && rZ.code === 'build_unpack_failed' && /not a readable tar\.gz/.test(rZ.message) && !fs.existsSync(path.dirname(g4.kpG)),
    'V5: a tar.gz installs on a Node WITHOUT zstd; a member outside the top folder ⇒ refused before anything is extracted (build_unpack_failed, no kernel folder); zstd bytes named tar.gz ⇒ refused by the format\'s name', { rN: rN && rN.message, rD: rD && rD.message, rZ: rZ && rZ.message });
  // L2's F1 (measured): the vendor's archive has NO top folder — `stripComponents: 0` lands it; 1 on the same archive is refused
  // before anything is extracted; a link / `..` / a missing required file stay refused at 0 (the shape the manifest declares)
  const gF = gzAt('data-gz7', '/flat.tar.gz', {}, { ...GZL, stripComponents: 0 });
  const rF = await thrK(gF.e.installKernel(EID, { wait: true }));
  const gF1 = gzAt('data-gz8', '/flat.tar.gz');
  const rF1 = await thrK(gF1.e.installKernel(EID, { wait: true }));
  const flat0 = (extra) => EK.tarShapeVerdict([...flatEntries, ...extra].map((e) => ({ name: e.name, kind: e.type === '5' ? 'dir' : e.type === '2' ? 'link' : 'file', size: e.body ? Buffer.from(e.body).length : 0, mode: e.mode || 0o644 })), { layout: { ...LAYOUT, stripComponents: 0 }, id: EID });
  const fLink = flat0([{ name: 'escape', type: '2', link: '/etc/passwd' }]), fDots = flat0([{ name: 'locales/../../oops', body: 'x' }]);
  const fMiss = EK.tarShapeVerdict(flatEntries.filter((e) => e.name !== 'libEGL.so').map((e) => ({ name: e.name, kind: e.type === '5' ? 'dir' : 'file', size: 1, mode: e.mode || 0o644 })), { layout: { ...LAYOUT, stripComponents: 0 }, id: EID });
  ok(!rF && fs.statSync(gF.kpG).mode & 0o100 && LAYOUT.requiredFiles.every((f) => fs.statSync(path.join(path.dirname(gF.kpG), f)).isFile()) && rF1 && rF1.code === 'build_unpack_failed' && /a file above the archive's top folder/.test(rF1.message) && !fs.existsSync(path.dirname(gF1.kpG))
    && !fLink.ok && /a link entry/.test(fLink.error) && !fDots.ok && /"\.\."/.test(fDots.error) && !fMiss.ok && /no libEGL\.so/.test(fMiss.error),
    'L2 F1: a FLAT tar.gz (no top folder — the vendor\'s real shape) lands with stripComponents 0; 1 on it ⇒ refused before extraction; at 0 a link / ".." / a missing required file are still refused', { rF: rF && rF.message, rF1: rF1 && rF1.message });
  // r2 (主开发's acceptance, minor 2): kernel.json is read and judged FIRST — on a Node without zstd a broken kernel.json is refused
  // as itself (never recorded engine_node_unsupported); a tar.zst one is (for THAT Node and THAT plugin version) — the plugin updated
  // to a tar.gz kernel.json ⇒ the record says nothing of it and the download runs
  let verN = '0.0.1';
  const kpN = path.join(ROOT, 'data-gzn-k', 'kernel', 'linux-x64', 'chrome');
  const edN = edAt('data-gzn', { engines: { kernelPath: () => kpN }, loader: { list: () => [{ id: EID, label: 'Fixture Browser Engine', version: verN, trusted: true }] }, zlib: {}, nodeVersion: '20.20.2' }); // lane fleet-plugin-catalog r3: the landing's judge asks a definite «trusted» (a loader with no answer lands nothing)
  const kjN = path.join(ROOT, 'data-gzn', 'plugins', EID, 'kernel.json');
  fs.writeFileSync(kjN, '{ not json');
  const eBrk = await thrK(edN.installKernel(EID, { wait: true })), fBrk = edN.kernelFact(EID);
  fs.writeFileSync(kjN, JSON.stringify(kjson({ layout: { ...LAYOUT, archiveFormat: 'zip' } }, { layout: {} })));
  const eZip = await thrK(edN.installKernel(EID, { wait: true })), fZip = edN.kernelFact(EID);
  fs.writeFileSync(kjN, JSON.stringify(kjson({}, { url: 'https://kernels.test/k.tar.zst', sha256: sha(ARCH), bytes: ARCH.length })));
  const eZst = await thrK(edN.installKernel(EID, { wait: true })), fZst = edN.kernelFact(EID);
  verN = '0.0.2';
  fs.writeFileSync(kjN, JSON.stringify(kjson({}, { url: 'https://kernels.test/k.tar.gz', sha256: sha(GZ), bytes: GZ.length, layout: GZL })));
  const fUpd = edN.kernelFact(EID);
  const eUpd = await thrK(edN.installKernel(EID, { wait: true }));
  ok(eBrk && eBrk.code === 'browser_engine_protocol' && fBrk.code !== 'engine_node_unsupported' && eZip && eZip.code === 'browser_engine_protocol' && fZip.code !== 'engine_node_unsupported'
    && eZst && eZst.code === 'engine_node_unsupported' && fZst.state === 'failed' && fZst.code === 'engine_node_unsupported' && fUpd.state !== 'failed' && !eUpd && fs.existsSync(kpN),
    'r2 minor 2: on a Node WITHOUT zstd a broken / zip kernel.json is refused AS ITSELF (browser_engine_protocol — never recorded engine_node_unsupported); a tar.zst one is engine_node_unsupported for that Node and that plugin version — the plugin updated to a tar.gz kernel.json ⇒ asked again and it lands', { eBrk: eBrk && eBrk.code, fBrk: fBrk.code, eZip: eZip && eZip.code, eZst: eZst && eZst.code, fUpd: fUpd.state, eUpd: eUpd && eUpd.message });
  const EDz = M8.load('src/server/engine-distribution.js', editAnchor(EDS, 'gz ? zlib.createGunzip() : zlibIn.createZstdDecompress()', 'zlibIn.createZstdDecompress()', "src/server/engine-distribution.js"), 'zstd-only');
  const gC = (() => { const kpC = path.join(ROOT, 'data-gz6-k', 'kernel', 'linux-x64', 'chrome'); const d = edAt('data-gz6', { engines: { kernelPath: () => kpC } }, EDz); fs.writeFileSync(path.join(ROOT, 'data-gz6', 'plugins', EID, 'kernel.json'), JSON.stringify(kjson({}, { url: 'https://kernels.test/k.tar.gz', sha256: sha(GZ), bytes: GZ.length, layout: GZL }))); return d; })();
  const rCz = await thrK(gC.installKernel(EID, { wait: true }));
  ok(EDS.includes('gz ? zlib.createGunzip() : zlibIn.createZstdDecompress()') && rCz && rCz.code === 'build_unpack_failed', 'control (gz): a copy that reads every archive as zstd refuses the same tar.gz (build_unpack_failed) — RED against ⑧e', rCz && rCz.message);

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

// ═══ B-0645 cure (主开发 09:07Z, as if a must): A FOLDER THAT COULD NOT BE CONFIRMED PUT BACK IS TOLD TO THE PERSON — the REAL
// keeper over a stand-in mediator's folder signal: ONE For-you item per browser (its door: Restart), resolved by a confirmed
// put-back or by the browser's end; nothing for a browser that is not running
{
  const MED = require('../src/browser-mediation.js');
  const folderRun = async (Kmod) => {
    let cb = null; const items = [], statuses = [];
    const med = { available: () => false, repoint() { }, revoke() { }, admitTarget() { }, adopt: async () => { }, onTold: () => () => { }, onFolder: (fn) => { cb = fn; return () => { }; } };   // mediation off; only the folder signal
    const uT = { add: (k, it) => { items.push(it); return { id: 'f' + items.length }; }, setStatus: (id, st, by) => statuses.push({ id, st, by }), get: (id) => ({ id, status: statuses.some((x) => x.id === id) ? 'done' : 'open' }) };
    fs.mkdirSync(path.join(ROOT, 'data-folder-' + (Kmod === K ? 'real' : 'mut')), { recursive: true });
    const kf = Kmod.create({ dataDir: path.join(ROOT, 'data-folder-' + (Kmod === K ? 'real' : 'mut')), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3,
      log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: uT, mediator: med });
    const pf = kf.createProfile({ label: 'Folder lent' });
    const lost = () => cb && cb({ kind: 'lost', profileId: pf.id, browserKey: KEY_A });
    lost();   // not running: nothing
    const before = items.length;
    await kf.start(pf.id, { why: 'test' });
    lost(); lost();
    const once = items.length - before;
    if (cb) cb({ kind: 'back', profileId: pf.id, browserKey: KEY_A });
    const back = statuses.map((x) => x.by).join();
    lost();   // lost again after a confirmed put-back: told again
    await kf.stop(pf.id, { why: 'user' });
    const out = { before, once, back, all: items.length, ended: statuses.map((x) => x.by).join(), item: items[0] || null };
    lost();   // stopped: nothing
    out.after = items.length;
    return out;
  };
  const f1 = await folderRun(K);
  ok(f1.before === 0 && f1.once === 1 && f1.back === 'put-back-confirmed' && f1.all === 2 && f1.ended === 'put-back-confirmed,browser-ended' && f1.after === 2
    && f1.item && f1.item.kind === 'action' && f1.item.action && f1.item.action.type === 'browser-restart' && /^Agent browser "Folder lent" may still save your downloads to the folder a conversation was lent — Restart it$/.test(f1.item.text)
    && f1.item.i18n && f1.item.i18n.text.key === MED.FOLDER_LOST_WORDS.text && /asked the browser 3 times/.test(f1.item.detail),
    'B-0645 cure (the real keeper): a download folder the hub could not confirm put back on a RUNNING browser is ONE For-you item with its Restart door (twice said, once filed); a confirmed put-back resolves it; the browser\'s end resolves the next one; a browser that is not running files nothing', f1);
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const sub = "  if (mediator && typeof mediator.onFolder === 'function') mediator.onFolder((ev) => {";
  if (!ksrc.includes(sub)) throw new Error('the anchor of the control «B-0645 cure: no folder subscription» is not in the source');
  const MCf = mutantCopies('browser-builds-folder', REPO);
  const f0 = await folderRun(MCf.load('src/server/browser-keeper.js', editAnchor(ksrc, sub, "  if (false) mediator.onFolder((ev) => {", "src/server/browser-keeper.js"), 'no-folder-notice'));
  ok(f0.once === 0 && f0.all === 0, 'CONTROL (B-0645 cure): a keeper that does not hear the folder signal tells the person nothing — the base\'s journal line only (RED for the leg above)', f0);
  // B-0645 cure 2 (主开发 10:26Z): A HUB RESTART — the notices live in memory, the items in the For-you store; the keeper's first
  // load takes an open one back (its browser alive ⇒ held, a later put-back ends it) or resolves it (its browser gone)
  const restartRun = async (Kmod, tag) => {
    const items = [], statuses = [];
    const uT = { add: (k, it) => { const id = 'r' + (items.length + 1); items.push({ ...it, id, status: 'open' }); return { id }; }, setStatus: (id, st, by) => { statuses.push({ id, st, by }); const x = items.find((i) => i.id === id); if (x) x.status = st; },
      get: (id) => items.find((i) => i.id === id) || null, openItems: () => items.filter((i) => i.status === 'open').map((i) => ({ ...i })) };
    const dd = path.join(ROOT, 'data-folder-restart-' + tag);
    fs.mkdirSync(dd, { recursive: true });
    const mk = (cbBox) => Kmod.create({ dataDir: dd, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: () => undefined, liveKeys: () => new Set([KEY_A]), install: false, tickMs: 3600e3,
      log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: uT,
      mediator: { available: () => false, repoint() { }, revoke() { }, admitTarget() { }, adopt: async () => { }, onTold: () => () => { }, onFolder: (fn) => { cbBox.cb = fn; return () => { }; } } });
    const b1 = {}, k1 = mk(b1);
    const pa = k1.createProfile({ label: 'Lent A' }), pb = k1.createProfile({ label: 'Lent B' });
    await k1.start(pa.id, { why: 'test' });
    b1.cb({ kind: 'lost', profileId: pa.id, browserKey: KEY_A });
    // an item of a browser that is not running when the hub comes back (it ended while the hub was down)
    const n = MED.folderLostNotice({ label: 'Lent B' });
    uT.add('browser', { origin: 'browser', kind: 'action', text: n.text, i18n: n.i18n, action: { type: 'browser-restart', profileId: pb.id } });
    const b2 = {}, k2 = mk(b2);
    k2.list();   // the first load
    const atLoad = statuses.map((x) => x.id + ':' + x.by).join();
    if (b2.cb) b2.cb({ kind: 'back', profileId: pa.id, browserKey: KEY_A });
    const out = { atLoad, after: statuses.map((x) => x.id + ':' + x.by).join(), open: uT.openItems().map((x) => x.id).join() };
    await k2.stop(pa.id, { why: 'user' }).catch(() => { });
    return out;
  };
  const rr = await restartRun(K, 'real');
  ok(rr.atLoad === 'r2:browser-ended' && rr.after === 'r2:browser-ended,r1:put-back-confirmed' && rr.open === '',
    'B-0645 cure 2: after a hub restart the keeper takes the open folder notices back — one of a browser that ended is resolved at the first load, one of a running browser is held and ended by its next confirmed put-back', rr);
  const rcCut = "cliBoot(); reclaimFolderNotices(); } }";
  if (!ksrc.includes(rcCut)) throw new Error('the anchor of the control «B-0645 cure 2: no reclaim» is not in the source');
  const r0 = await restartRun(MCf.load('src/server/browser-keeper.js', editAnchor(ksrc, rcCut, 'cliBoot(); } }', "src/server/browser-keeper.js"), 'no-reclaim'), 'mut');
  ok(r0.atLoad === '' && r0.open.split(',').length === 2, 'CONTROL (B-0645 cure 2): a keeper that does not take them back leaves both open after a restart — the first one ends only by its Restart press (RED for the leg above)', r0);
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
