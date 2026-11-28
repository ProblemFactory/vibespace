#!/usr/bin/env node
// B-7e49 (主开发 r2535, lane login-request-card): the legs that START the keeper's node stand-ins (the fake Chrome, the fake driver,
// the fake display keeper, at each launch) MOVED VERBATIM to the heavy twin scripts/test-browser-keeper-launch.mjs (a leg that starts a
// real child may go to a heavy twin with its table fast). This file keeps the legs that judge the keeper's TABLE or its TEXT: ① the
// argv table + the census, ①b, ② the port file's PURE table, ③ the socket dir, ④'s road table and wiring pins, ⑥ the picture switch
// (an in-process CDP stand-in, no launch), B-346d — and §T, the pin that the twin holds the moved sections. The original description follows.
// lane one-browser-b1 (design q-026 r1 §2.1 / §2.4 / §3 row B1, 2026-10-16): THE ATTACH ROAD — on a machine with xpra the
// keeper spawns Google Chrome ITSELF on a display-only session and agent-browser attaches with `--cdp <port>`. FAST: a fake
// Chrome (node), a fake driver and a fake display keeper — no X, no real browser (the real one is test-browser-live ⑱).
//   ① the argv table + the census over the argv builder (--disable-sync FORBIDDEN, the two flags required) + RED controls
//   ② the port file's three states (PURE table + the real spawn/poll over the fake Chrome: new / stale / missing / exit) + RED
//   ③ the socket dir per config (the rule, the owned-dir check, the call shape) + RED: a shared dir lets close --all cross
//   ④ the keeper: start on the attach road, every driver call `--cdp` in the config's own root, stop, Chrome's own exit, the
//     driver road without xpra (said), a display that never came up, cdp_port_missing at the keeper, the boot, the reconcile
//   ①b lane hotfix-attach-engine-args (2.369.375): an ENGINE's forbidden switch is DROPPED and SAID (never the launch refused);
//     the hub's own forbidden switch is still RED; every launch the road does not start is journaled by name (④'s engine block)
//   ⑦ lane browser-display-holders: the display record reads the conversations attached (holders); a PERSON's stop of the
//     display stamps the record, tells each holder once, and is NEVER healed (RED control: the keeper without the gate heals
//     it on the next tick); the next command starts a new record with no stamp
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, deadPort, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AT = require('../src/browser-attach.js');
const ATL = require('../src/server/browser-attach-launch.js');
const B = require('../src/browser-profiles.js');
const BE = require('../src/browser-stderr.js');
const F = require('../src/browser-facts.js');
const DA = require('../src/desktop-apps.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** a wait that names its effect (lane fast-debt-clear): poll `f` until it holds, at most `ms` — the assert after it judges */
const until = async (f, ms = 3000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await sleep(10); return f(); };
const S = scratch('bkr'); fs.mkdirSync(S, { recursive: true });
const DP = await deadPort(); // the port the PURE rows name: one the kernel just released, never a fixed one (§81)
/** A mutant copy of a PURE module (one replace, asserted to apply) — the RED controls' instrument. */
function mutant(rel, from, to) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  if (!src.includes(from)) throw new Error(`mutant anchor missing in ${rel}: ${from}`);
  const f = path.join(S, 'mut-' + Math.random().toString(36).slice(2) + '-' + path.basename(rel));
  fs.writeFileSync(f, editAnchor(src, from, to, rel));
  return require(f);
}

// ═══ ① THE ARGV ═══
console.log('— ① the argv table + the census');
const quiet = BE.QUIET_LOG_ARGS;
const av = AT.attachArgv({ profileDir: '/home/u/.agent-browser/vs-bp-0000000a', mark: B.keeperMarkArg('bp-0000000a'), quiet });
const WANT = ['--remote-debugging-port=0', '--user-data-dir=/home/u/.agent-browser/vs-bp-0000000a', '--no-first-run', '--no-default-browser-check', '--ozone-platform=x11', '--disable-blink-features=AutomationControlled', '--disable-background-networking', '--password-store=basic', '--use-mock-keychain', '--disable-logging', '--log-level=3', '--vibespace-keeper=bp-0000000a', 'about:blank'];
ok(gateOf(av.ok) && JSON.stringify(av.argv) === JSON.stringify(WANT), 'the argv AS COMMITTED (design §2.1 + the profile store + the quiet switches + the launch mark + about:blank)', av);
ok(gateOf(AT.argvVerdict(av.argv).ok) && !av.argv.includes('--disable-sync'), 'its census: every required flag present, --disable-sync absent, one --user-data-dir');
ok(gateOf(av.argv.includes('--disable-blink-features=AutomationControlled')) && verdictOf(av.argv.includes('--disable-background-networking')), 'the two flags the brief names are on it (webdriver hidden; no Google traffic of Chrome\'s own)');
ok(!AT.attachArgv({ profileDir: 'relative/dir' }).ok && AT.attachArgv({ profileDir: 'relative/dir' }).code === 'bad_profile_dir', 'a relative profile dir is refused by name');
// THE CENSUS OVER THE ARGV BUILDER: no file of the attach road spells --disable-sync outside the FORBIDDEN declaration
const codeOf = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '')).join('\n');
// an ARGV literal: a quoted token with no space whose comma / newline parts include the flag (a sentence that NAMES the
// flag — the hidden-window words — is prose, not an argv); the one FORBIDDEN declaration is the rule itself
const syncCensus = (text) => { const code = codeOf(text); const decl = /ATTACH_FORBIDDEN = Object\.freeze\(\['--disable-sync'\]\)/.test(code); return (code.match(/(['"`])((?:(?!\1)[^\n\s])*)\1/g) || []).filter((m) => m.slice(1, -1).split(/,|\\n/).some((x) => /^--?disable-sync(?:=|$)/.test(x))).filter((m, i, all) => !(decl && m === "'--disable-sync'" && all.indexOf(m) === i)); };
const ATTACH_FILES = ['src/browser-attach.js', 'src/server/browser-attach-launch.js'];
const hits = ATTACH_FILES.flatMap((f) => syncCensus(fs.readFileSync(path.join(REPO, f), 'utf8')).map((m) => `${f}: ${m}`));
const ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
const attachFn = ks.slice(ks.indexOf('  async function attachStart('), ks.indexOf('  async function stop(profileId'));
ok(hits.length === 0 && attachFn.length > 2000 && syncCensus(attachFn).length === 0, `no literal --disable-sync on the attach road (${ATTACH_FILES.length} files + the keeper's attachStart, ${attachFn.length} chars) beyond the FORBIDDEN list`, hits);
ok(gateOf(/AT\.attachArgv\(\{ profileDir: p\.dir, mark: B\.keeperMarkArg\(p\.id\), quiet: BE\.QUIET_LOG_ARGS, extra: engineArgs \}\)/.test(attachFn)) && gateOf(/const engineArgs = engineLaunch && Array\.isArray\(engineLaunch\.args\) \? ENG\.engineArgs\(engineLaunch\) : \[\];/.test(attachFn)) && verdictOf(/ATL\.spawnChrome\(\{ exe, argv: av\.argv,/.test(attachFn)), 'the keeper spawns EXACTLY the builder\'s argv (no flag added beside it — lane engine-plugin: an engine\'s own arguments go IN through the builder, censused with the rest; lane engine-spi-egress: the keeper\'s proxy arguments of a wrapped engine with them, engineArgs)');
ok(syncCensus("const ARGV = ['--remote-debugging-port=0', '--disable-sync'];").length === 1, 'CONTROL: a planted argv literal with --disable-sync is RED');
ok(syncCensus("const ARGV = ['--remote-debugging-port=0', '-disable-sync'];").length === 1, 'CONTROL (B-0528): a planted single-dash -disable-sync literal is RED too');
const noAC = mutant('src/browser-attach.js', "\n    '--disable-blink-features=AutomationControlled', '--disable-background-networking', ...PROFILE_STORE", "\n    '--disable-background-networking', ...PROFILE_STORE");
ok(!noAC.attachArgv({ profileDir: '/p' }).ok && AT.argvVerdict(['--remote-debugging-port=0', '--user-data-dir=/p', '--no-first-run', '--no-default-browser-check', '--ozone-platform=x11', '--disable-background-networking']).missing.join() === '--disable-blink-features=AutomationControlled', 'CONTROL: a builder that drops AutomationControlled is RED (its census names the missing flag)');
const withSync = mutant('src/browser-attach.js', "'--disable-background-networking', ...PROFILE_STORE", "'--disable-background-networking', '--disable-sync', ...PROFILE_STORE");
// ①b lane hotfix-attach-engine-args (2.369.375; the owner's hub: the custom kernel's plugin passes a driver-road switch, so every
// profile on it was refused bad_argv — the kernel unusable through a named profile)
console.log('— ①b an engine\'s forbidden switch: dropped and said, never the launch refused');
{
  const sf = typeof AT.stripForbidden === 'function' ? AT.stripForbidden(['--vibespace-engine=x', '--disable-sync', '--disable-sync=1', '--disable-syncx']) : null;
  ok(gateOf(sf) && JSON.stringify(sf) === JSON.stringify({ kept: ['--vibespace-engine=x', '--disable-syncx'], dropped: ['--disable-sync', '--disable-sync=1'] }), 'stripForbidden (PURE): an engine\'s forbidden switch (bare or =value) is dropped, every other kept in its order (a longer name is another switch)', sf);
  // B-0528 (1): the single-dash spelling is the same switch to Chromium (the engine walls' `^--?` rule) — dropped and said too
  const sf1 = AT.stripForbidden(['-disable-sync', '-disable-sync=1', '-disable-syncx', '---disable-sync']);
  ok(JSON.stringify(sf1) === JSON.stringify({ kept: ['-disable-syncx', '---disable-sync'], dropped: ['-disable-sync', '-disable-sync=1'] }) && AT.argvVerdict(['-disable-sync']).forbidden.join() === '-disable-sync', 'B-0528: a single-dash -disable-sync (bare or =value) is the forbidden switch too — dropped from an engine, red in the census; a longer name or a triple dash is another switch', sf1);
  { const old = "const isForbiddenSwitch = (x) => { const s = /^-[^-]/.test(x) ? '-' + x : x; return ATTACH_FORBIDDEN.some((f) => s === f || s.startsWith(f + '=')); };";
    const pre = mutant('src/browser-attach.js', old, "const isForbiddenSwitch = (x) => ATTACH_FORBIDDEN.some((f) => x === f || x.startsWith(f + '='));"); // stale-pins: kept — the release's own isForbiddenSwitch, planted back as this control's mutant
    ok(pre.stripForbidden(['-disable-sync']).kept.join() === '-disable-sync', 'CONTROL (B-0528, the release\'s rule): an engine\'s -disable-sync is KEPT — it reached Chrome unsaid'); }
  const ae = AT.attachArgv({ profileDir: '/p', mark: B.keeperMarkArg('bp-0000000a'), quiet, extra: ['--vibespace-engine=x', '--disable-sync'] });
  const want = AT.attachArgv({ profileDir: '/p', mark: B.keeperMarkArg('bp-0000000a'), quiet, extra: ['--vibespace-engine=x'] });
  ok(gateOf(ae.ok) && JSON.stringify(ae.argv) === JSON.stringify(want.argv) && gateOf(AT.argvVerdict(ae.argv).ok) && JSON.stringify(ae.dropped) === JSON.stringify(['--disable-sync']), 'an ENGINE\'s --disable-sync: the launch is NOT refused — its argv is the one without it, and `dropped` names it for the caller to say', ae);
  ok(gateOf(want.ok) && gateOf(Array.isArray(want.dropped)) && want.dropped.length === 0, 'an engine with nothing forbidden: `dropped` is empty (nothing to say)', want.dropped);
  const own = AT.attachArgv({ profileDir: '/p', quiet: [...quiet, '--disable-sync'] });
  const ownMark = AT.attachArgv({ profileDir: '/p', mark: '--disable-sync=1' });
  ok(!own.ok && own.code === 'bad_argv' && JSON.stringify(own.offending) === JSON.stringify(['--disable-sync']) && !ownMark.ok && ownMark.code === 'bad_argv', 'PLANTED CONTROL: a forbidden switch the HUB puts in the argv (its quiet switches, its mark) is still refused bad_argv — the strip is the engine\'s part only, and the refusal names the item', { own, ownMark });
  const dup = AT.attachArgv({ profileDir: '/p', extra: ['--user-data-dir=/elsewhere'] });
  ok(!dup.ok && dup.code === 'bad_argv' && JSON.stringify(dup.offending) === JSON.stringify(['--user-data-dir=/p', '--user-data-dir=/elsewhere']) && verdictOf(/--user-data-dir ×2/.test(dup.error)), 'an engine\'s second --user-data-dir is still refused, the census naming both items (×2 in its words)', dup);
  ok(typeof AT.droppedWords === 'function' && AT.droppedWords({ engine: 'vibespace.custom-browser', dropped: ['--disable-sync'] }) === "engine vibespace.custom-browser's launch switch --disable-sync dropped on the attach road (driver-only; the attach road needs Chrome's sign-in entry)" && typeof AT.argvItemsText === 'function' && AT.argvItemsText(['--a=1', '--b c', '\t--x']) === '--a=1 "--b c" "\\t--x"', 'the words: one sentence names the engine and its switch(es); an argv item with a space or a control character is quoted (a journal line stays one line)');
  let judged = null; try { judged = mutant('src/browser-attach.js', '...eng.kept,', '...(Array.isArray(extra) ? extra.map(String) : []),'); } catch (e) { judged = { error: e && e.message }; } // a tree without the strip: red by name, the suite goes on
  ok(gateOf(judged) && typeof judged.attachArgv === 'function' && !judged.attachArgv({ profileDir: '/p', extra: ['--disable-sync'] }).ok, 'CONTROL (the incident): a builder that JUDGES the engine\'s switch instead of dropping it refuses the whole launch bad_argv', judged && judged.error);
}
ok(!withSync.attachArgv({ profileDir: '/p' }).ok && syncCensus(fs.readFileSync(path.join(REPO, 'src/browser-attach.js'), 'utf8').replace("'--disable-background-networking', ...PROFILE_STORE", "'--disable-background-networking', '--disable-sync', ...PROFILE_STORE")).length === 1, 'CONTROL: a builder that adds --disable-sync is RED twice (its own census + the source census)');

// ═══ ② THE PORT FILE ═══
console.log('— ② the port file\'s three states');
const T0 = 1_792_000_000_000;
const pf = (text, mtimeMs) => AT.portFileVerdict({ text, mtimeMs, spawnedAt: T0 });
ok(pf(`${DP}\n/devtools/browser/0b1f-aa\n`, T0 + 160).state === 'new' && pf(`${DP}\n/devtools/browser/0b1f-aa\n`, T0 + 160).port === DP, 'new: written after the spawn, both lines ⇒ its port');
ok(pf(`${DP}\n/devtools/browser/0b1f-aa\n`, T0 - 60000).state === 'stale' && pf(`${DP}\n/devtools/browser/0b1f-aa\n`, T0).state === 'stale', 'stale: written before (or at) the spawn — a killed Chrome\'s dead port, never connected to');
ok(pf(null, null).state === 'missing' && pf(`${DP}\n`, T0 + 10).state === 'missing' && pf('x\ny', T0 + 10).state === 'missing', 'missing: absent, or a new file still half-written (keep polling)');
ok(AT.cdpUrlOf(DP, '/devtools/browser/0b1f-aa') === `ws://127.0.0.1:${DP}/devtools/browser/0b1f-aa` && verdictOf(B.isLoopbackCdpUrl(AT.cdpUrlOf(1, '/devtools/browser/x'))), 'the cdpUrl is the loopback ws url a lease is handed');
ok(AT.portMissing({}).code === 'cdp_port_missing' && verdictOf(/never connects to a port this launch did not write/.test(AT.portMissing({}).error)), 'the refusal is named cdp_port_missing');
const lax = mutant('src/browser-attach.js', 'if (!(Number(mtimeMs) > Number(spawnedAt))) return', 'if (false) return');
ok(lax.portFileVerdict({ text: `${DP}\n/devtools/browser/0b1f-aa\n`, mtimeMs: T0 - 60000, spawnedAt: T0 }).state === 'new', 'CONTROL: a verdict that ignores the mtime ACCEPTS the stale file (the table goes red on that row)');
// the stand-ins' folders (the keeper's env names them; the fake Chrome and every launch are in the heavy twin)
const FAKE_BIN = path.join(S, 'bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const STATE = path.join(S, 'state'); fs.mkdirSync(STATE, { recursive: true });

// ═══ ③ THE SOCKET DIR PER CONFIG ═══
console.log('— ③ the socket dir per config');
const sa = AT.attachSocketDir({ base: '/tmp', uid: 1000, profileId: 'bp-0000000a' });
const sb = AT.attachSocketDir({ base: '/tmp', uid: 1000, profileId: 'bp-0000000b' });
ok(sa.dir === '/tmp/vs-ab-1000/bp-0000000a' && sb.dir === '/tmp/vs-ab-1000/bp-0000000b' && sa.parent === sb.parent && sa.dir !== sb.dir, 'one dir per config under the short per-uid root (browser-profiles\' vs-ab-<uid>)', { sa, sb });
ok(gateOf(sa.fits) && sa.bytes === sa.dir.length + 50 && sa.bytes <= 103 && !AT.attachSocketDir({ base: '/tmp/' + 'x'.repeat(40), uid: 1000, profileId: 'bp-0000000a' }).fits, 'the socket path stays within 103 bytes (a long base is refused, never emitted)');
ok(AT.attachSocketDir({ profileId: '../etc' }).dir === null && AT.attachSocketDir({ base: '/tmp;rm', uid: 1, profileId: 'bp-1' }).dir === '/tmp/vs-ab-1/bp-1', 'a profile id that is not one names no dir; a base with shell syntax falls back to /tmp');
const call = AT.attachCall(['tab', 'list', '--json'], { AGENT_BROWSER_SESSION: 'vs-bk-1', AGENT_BROWSER_PROFILE: '/x', AGENT_BROWSER_CDP: 'ws://127.0.0.1:9/x', AGENT_BROWSER_HEADED: '1', AGENT_BROWSER_EXECUTABLE_PATH: '/e', AGENT_BROWSER_SOCKET_DIR: '/run/user/1/agent-browser', AGENT_BROWSER_CONFIG: '/c/machine.json' }, { cdp: `ws://127.0.0.1:${DP}/devtools/browser/0b1f`, socketDir: sa.dir });
ok(JSON.stringify(call.args) === JSON.stringify(['--cdp', `ws://127.0.0.1:${DP}/devtools/browser/0b1f`, 'tab', 'list', '--json']) && call.env.AGENT_BROWSER_SOCKET_DIR === sa.dir && !('AGENT_BROWSER_PROFILE' in call.env) && !('AGENT_BROWSER_CDP' in call.env) && !('AGENT_BROWSER_HEADED' in call.env) && !('AGENT_BROWSER_EXECUTABLE_PATH' in call.env) && call.env.AGENT_BROWSER_SESSION === 'vs-bk-1', 'a call: --cdp <the ws url> FIRST, no launch key in its env, the config\'s own socket root', call);
const SOCKBASE = path.join(S, 's'); fs.mkdirSync(SOCKBASE, { recursive: true }); // production's base is /tmp (it exists)
const own = ATL.ensureSocketDir(AT.attachSocketDir({ base: SOCKBASE, uid: process.getuid(), profileId: 'bp-0000000a' }));
ok(gateOf(own.ok) && (fs.statSync(own.dir).mode & 0o777) === 0o700 && (fs.statSync(path.dirname(own.dir)).mode & 0o777) === 0o700, 'made 0700, the per-uid root too', own);
fs.symlinkSync('/tmp', path.join(path.dirname(own.dir), 'bp-0000000c'));
const planted = ATL.ensureSocketDir(AT.attachSocketDir({ base: SOCKBASE, uid: process.getuid(), profileId: 'bp-0000000c' }));
ok(!planted.ok && planted.code === 'socket_dir_unavailable' && verdictOf(/SYMLINK/.test(planted.error)), 'a planted symlink at a config\'s name is refused by name (a socket never lands in somebody else\'s directory)', planted);
ok(gateOf(B.attachedEnvFor({ browserKey: 'bk-00000001', profileId: 'bp-0000000a', cdpUrl: `ws://127.0.0.1:${DP}/devtools/browser/x`, socketDir: sa.dir }).includes(`AGENT_BROWSER_SOCKET_DIR=${sa.dir}`)) && !B.attachedEnvFor({ browserKey: 'bk-00000001', profileId: 'bp-0000000a', cdpUrl: `ws://127.0.0.1:${DP}/devtools/browser/x` }).some((kv) => kv.startsWith('AGENT_BROWSER_SOCKET_DIR=')), 'the agent\'s pairs name the config\'s root on the attach road only (the CLI sets it last — the same daemon as the keeper\'s calls)');

// ═══ ④ THE KEEPER ═══
console.log('— ④ the keeper: its road table and wiring pins (the launching legs are in the heavy twin)');
// the fake driver and the keeper factory (no launch here: ⑥'s keeper reads its driver through the stub)
// the fake DRIVER: logs every call; `--cdp` is taken off and recorded; `close --all` closes EVERY session under its socket
// root (the M0 worst case — the real 0.38.2 scopes it to the namespace: tools/probe1.sh e1), so only a per-config root
// keeps another config's sessions; a call WITHOUT --cdp that opens is a LAUNCH (the driver road), logged
fs.writeFileSync(path.join(FAKE_BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ST = process.env.FAKE_STATE; let argv = process.argv.slice(2); let cdp = null;
if (argv[0] === '--cdp') { cdp = argv[1]; argv = argv.slice(2); }
const E = (k) => process.env[k] || null;
const root = E('AGENT_BROWSER_SOCKET_DIR') || path.join(ST, 'default-root'); const ns = E('AGENT_BROWSER_NAMESPACE') || 'default'; const sess = E('AGENT_BROWSER_SESSION') || 'default';
const out = (o) => { console.log(JSON.stringify(o)); };
if (argv[0] === '--version') { console.log('agent-browser 0.38.2'); process.exit(0); }
fs.appendFileSync(path.join(ST, 'ab.log'), JSON.stringify({ argv, cdp, ns, sess, root: E('AGENT_BROWSER_SOCKET_DIR'), profile: E('AGENT_BROWSER_PROFILE'), config: E('AGENT_BROWSER_CONFIG'), envCdp: E('AGENT_BROWSER_CDP'), headed: E('AGENT_BROWSER_HEADED') }) + '\\n');
const sdir = path.join(root, 'fake-sessions', ns); const sfile = path.join(sdir, sess);
const dstate = path.join(ST, 'driver-' + ns + '.json');
const readD = () => { try { return JSON.parse(fs.readFileSync(dstate, 'utf8')); } catch { return null; } };
const aliveP = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
if (argv[0] === 'close' && argv[1] === '--all') { fs.rmSync(path.join(root, 'fake-sessions'), { recursive: true, force: true }); const d = readD(); if (!cdp && d && aliveP(d.pid)) { try { process.kill(d.pid, 'SIGKILL'); } catch {} } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (argv[0] === 'session' && argv[1] === 'info') { const d = readD(); const act = !cdp && !!(d && aliveP(d.pid)); out({ success: true, data: { active: act, pid: act ? d.pid : null, socketDir: path.join(root, 'run'), version: '0.38.2' } }); process.exit(0); }
if (argv[0] === 'get' && argv[1] === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:9/devtools/browser/fake-driver' } }); process.exit(0); }
if (!cdp && !E('AGENT_BROWSER_CDP') && argv[0] === 'open') { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); fs.writeFileSync(dstate, JSON.stringify({ pid: c.pid })); fs.appendFileSync(path.join(ST, 'launches.log'), JSON.stringify({ ns, pid: c.pid }) + '\\n'); out({ success: true, data: { url: 'about:blank' } }); process.exit(0); }
fs.mkdirSync(sdir, { recursive: true }); fs.writeFileSync(sfile, String(cdp || E('AGENT_BROWSER_CDP')));
out({ success: true, data: { ok: true, tabs: [] } }); process.exit(0);
`, { mode: 0o755 });
const abLog = () => { try { return fs.readFileSync(path.join(STATE, 'ab.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const launches = () => { try { return fs.readFileSync(path.join(STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const sessionsUnder = (root) => { try { return fs.readdirSync(path.join(root, 'fake-sessions')).flatMap((n) => fs.readdirSync(path.join(root, 'fake-sessions', n)).map((x) => `${n}/${x}`)); } catch { return []; } };
// the fake DISPLAY KEEPER (the desktop keeper's five methods)
const dcalls = []; const dlive = new Map(); let dn = 0; let fakeXpra = true; let fakeDisplayFail = false;
const DK = {
  facts: async () => ({ bins: fakeXpra ? { xpra: '/usr/bin/xpra', xauth: '/usr/bin/xauth' } : { xpra: null, xauth: '/usr/bin/xauth' } }),
  launchDisplay: async (body) => { dcalls.push(['launch', body.forBrowser, body.label]); if (fakeDisplayFail) return { id: 'da-fail', state: 'failed', lastError: 'xpra exited (code 1)' }; const id = `da-fake-${++dn}`; const rec = { id, kind: DA.DISPLAY_FOR_BROWSER, forBrowser: body.forBrowser, state: 'ready', display: ':' + (90 + dn), label: DA.displayForBrowserLabel(body.label) }; dlive.set(id, rec); return { ...rec }; },
  x11EnvFor: (id) => (dlive.has(id) ? { DISPLAY: dlive.get(id).display, XAUTHORITY: path.join(S, 'xauth-' + id) } : null),
  stop: async (id, o) => { dcalls.push(['stop', id, o && o.why]); const r0 = dlive.get(id); dlive.delete(id); return r0 ? { ...r0, state: 'exited' } : null; },
  liveRecords: () => [...dlive.values()],
};
const K = require('../src/server/browser-keeper.js');
const DATA = path.join(S, 'data'); const HOME = path.join(S, 'home'); fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
const rtEnv = { PATH: `${FAKE_BIN}:/usr/bin:/bin`, HOME, FAKE_STATE: STATE, XDG_RUNTIME_DIR: path.join(S, 'xdg'), AGENT_BROWSER_SESSION: 'leaked-from-the-server' };
const settings = { 'browser.idleTimeoutMs': 600000 };
const journal = [];
const jlog = { log(m) { journal.push(String(m)); }, warn(m) { journal.push(String(m)); }, error() { } };
const mk = (extra = {}) => K.create({ dataDir: DATA, homeDir: HOME, env: () => rtEnv, serverSetting: (x) => settings[x], serverNotice: () => 1, liveKeys: () => new Set(), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: jlog, install: false, tickMs: 3600e3, displaySessions: DK, attachSocketBase: SOCKBASE, ...extra });
// the wiring pins: the road decided in start() before the display fact; the api seam
ok(gateOf(/const road = AT\.launchRoad\(\{ local: true, starts: !!prow\.starts, ownLaunch: argvPrefix\.length > 0, headed: headed0, wired: !!displayKeeper, driverVersion: displayKeeper \? \(\(await cliNow\(\)\) \|\| \{\}\)\.version \|\| null : null, xpra: await displayHasXpra\(\), exe: attachExe \}\);/.test(ks)) && verdictOf(/setDisplaySessions: \(dk\) =>/.test(ks)), 'the keeper decides the road before the driver\'s display fact; server.js wires the desktop keeper through setDisplaySessions');
ok(verdictOf(/browserKeeper\?\.setDisplaySessions\?\.\(desktopKeeper\)/.test(fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'))), 'server.js hands the desktop keeper over');
// the road table (PURE)
const R = (o) => AT.launchRoad({ local: true, starts: true, ownLaunch: false, headed: null, wired: true, driverVersion: '0.38.2', xpra: true, exe: '/usr/bin/google-chrome', ...o });
ok(R({}).launch === 'attach' && R({ headed: true }).launch === 'attach' && R({ driverVersion: '0.39.0' }).launch === 'attach', 'the road: xpra + a Chrome + the display keeper + the measured driver (0.38.2, or newer) ⇒ attach');
ok(verdictOf([R({ xpra: false }), R({ exe: null }), R({ wired: false }), R({ headed: false }), R({ ownLaunch: true }), R({ local: false }), R({ starts: false }), R({ driverVersion: '0.38.1' }), R({ driverVersion: null })].every((x) => x.launch === 'driver' && x.why)), 'everything else ⇒ the driver road, each with its why (an older or unknown driver too: the attach facts are 0.38.2\'s)');
ok(gateOf(/older than 0\.38\.2, the version the attach road was measured on/.test(R({ driverVersion: '0.38.1' }).why)) && gateOf(AT.driverAtLeast('agent-browser 0.38.2')) && !AT.driverAtLeast('0.38.1') && gateOf(AT.driverAtLeast('1.0.0')) && !AT.driverAtLeast(''), 'the driver gate says the version it saw and the one it needs');
// ═══ ⑥ LANE BROWSER-X-IN-WINDOW (design q-026 r1 §2.1 / §3 row B2): THE PICTURE SWITCH's verdict wiring ═══
// The keeper's three doors over a FAKE CDP (the window calls the keeper makes — Browser.getWindowBounds / getWindowForTarget /
// setWindowBounds, answered from a window map) and a FAKE display keeper whose `windows(id)` rows ARE that map (MEASURED: CDP
// bounds = the X geometry): the source verdict from the record, the holder's X window by its OWN window's bounds, the
// two-twins ambiguity resolved by a one-pixel move, Chrome's own dialog window said to the holder it is over and to no other.
console.log('— ⑥ lane browser-x-in-window: the picture source, the holder\'s X window, Chrome\'s own dialog windows');
{
  const { WebSocketServer } = require('ws');
  const net = require('net');
  const freeP = () => new Promise((r) => { const s0 = net.createServer(); s0.listen(0, '127.0.0.1', () => { const pt = s0.address().port; s0.close(() => r(pt)); }); });
  const PDIR = path.join(S, 'pic-profile');
  const INSTX = `google-chrome (${PDIR})`;
  // windowId → { xid, bounds }; two holders' windows + the launch window
  const wins = new Map([[11, { xid: 0x400003, bounds: { left: 10, top: 10, width: 1050, height: 980, windowState: 'normal' } }], [12, { xid: 0x40000c, bounds: { left: 20, top: 20, width: 1050, height: 980, windowState: 'normal' } }], [13, { xid: 0x40000f, bounds: { left: 300, top: 120, width: 900, height: 700, windowState: 'normal' } }]]);
  const tabWin = { 'TAB-A': 12, 'TAB-B': 13 };
  const cdpCalls = [];
  const port = await freeP();
  const wss = new WebSocketServer({ port, host: '127.0.0.1' }); await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (ws) => ws.on('message', (d) => {
    const m = JSON.parse(d); cdpCalls.push(m); const reply = (o) => ws.send(JSON.stringify({ id: m.id, ...o }));
    if (m.method === 'Browser.getWindowBounds') { const w = wins.get(m.params.windowId); return reply(w ? { result: { bounds: { ...w.bounds } } } : { error: { message: 'no window' } }); }
    if (m.method === 'Browser.getWindowForTarget') { const id = tabWin[m.params.targetId]; return reply(id ? { result: { windowId: id, bounds: { ...wins.get(id).bounds } } } : { error: { message: 'no target' } }); }
    if (m.method === 'Browser.setWindowBounds') { const w = wins.get(m.params.windowId); if (w) Object.assign(w.bounds, m.params.bounds); return reply({ result: {} }); }
    return reply({ result: {} });
  }));
  const CHOOSER_X = { id: 0x60000a, title: 'Open File', instance: 'chrome', cls: 'Chrome', x: 330, y: 160, w: 700, h: 500, depth: 2, frame: 0x20002a };
  let dialogs = [];
  const rowsNow = () => [...dialogs, ...[...wins.values()].reverse().map((w) => ({ id: w.xid, title: 'x - Google Chrome', instance: INSTX, cls: 'Google-chrome', x: w.bounds.left, y: w.bounds.top, w: w.bounds.width, h: w.bounds.height, depth: 2, frame: w.xid + 1 })), { id: 0x600001, title: 'chrome', instance: 'chrome', cls: 'Chrome', x: 10, y: 10, w: 10, h: 10, depth: 1 }];
  const winCalls = [];
  const DKP = { facts: async () => ({ bins: { xpra: '/usr/bin/xpra', xauth: '/usr/bin/xauth' } }), launchDisplay: async () => null, x11EnvFor: () => null, stop: async () => null, liveRecords: () => [], windows: async (id) => { winCalls.push(id); return { ok: true, windows: rowsNow() }; } };
  let picSkew = 0;   // B-7e49: the keeper's own clock (its injected now) is carried past the rows' 750 ms memo — the memo is the keeper's, unchanged
  const kP = mk({ dataDir: path.join(S, 'data-pic'), displaySessions: DKP, now: () => Date.now() + picSkew });
  const pP = kP.createProfile({ label: 'Pic' }, { owner: { kind: 'instance', id: null } });
  const prof = kP._reg().profiles.find((x) => x.id === pP.id); prof.dir = PDIR;
  const startedAt = Date.now();
  kP._reg().browsers[pP.id] = { profileId: pP.id, state: 'ready', launch: 'attach', launchWhy: 'Google Chrome on its own display (xpra)', displaySession: { id: 'da-pic', display: ':93' }, cdpUrl: `ws://127.0.0.1:${port}/devtools/browser/fake-pic`, startedAt, host: 'this-box' };
  kP._reg().leases.push({ profileId: pP.id, browserKey: 'bk-0000pa01', sessionId: 'sA', windowId: 12, windowIn: String(startedAt), targetId: 'TAB-A', since: startedAt });
  kP._reg().leases.push({ profileId: pP.id, browserKey: 'bk-0000pb02', sessionId: 'sB', targetId: 'TAB-B', since: startedAt });
  const v = kP.pictureSourceFor(pP.id);
  ok(v.source === 'x' && v.why === 'attach' && v.displaySession === 'da-pic', `the keeper's verdict: the attach record ⇒ 'x' on its display session (${JSON.stringify(v)})`);
  const xa = await kP.xWindowFor(pP.id, { browserKey: 'bk-0000pa01' });
  ok(xa.wid === 0x40000c && xa.why === 'bounds' && xa.windowId === 12 && verdictOf(cdpCalls.some((m) => m.method === 'Browser.getWindowBounds' && m.params.windowId === 12)), `A's X window = its OWN window's bounds matched against the display's rows (${xa.wid && xa.wid.toString(16)})`, xa);
  const xb = await kP.xWindowFor(pP.id, { browserKey: 'bk-0000pb02' });
  ok(xb.wid === 0x40000f && xb.windowId === 13 && verdictOf(cdpCalls.some((m) => m.method === 'Browser.getWindowForTarget' && m.params.targetId === 'TAB-B')), "B (no window of its own stamped): the window of its tab (getWindowForTarget) ⇒ its X window", xb);
  ok(winCalls.length >= 1 && verdictOf(winCalls.every((id) => id === 'da-pic')), "the rows are the desktop keeper's own windows(id) of the record's display session (no spawn of the keeper's)", winCalls);
  // two windows with the very bounds ⇒ A's moved one pixel, asked again
  Object.assign(wins.get(13).bounds, { left: 20, top: 20, width: 1050, height: 980 });
  const set0 = cdpCalls.filter((m) => m.method === 'Browser.setWindowBounds').length;
  picSkew += 800; // past the rows' 750 ms memo (by the keeper's clock)
  const xa2 = await kP.xWindowFor(pP.id, { browserKey: 'bk-0000pa01' });
  const nudge = cdpCalls.filter((m) => m.method === 'Browser.setWindowBounds').slice(set0);
  ok(xa2.wid === 0x40000c && nudge.length >= 1 && gateOf(nudge.some((m) => m.params.windowId === 12 && m.params.bounds.left === 21)) && wins.get(12).bounds.left === 21, 'TWINS (two windows, one geometry) ⇒ its window is moved ONE pixel and told apart', { xa2, nudge });
  // Chrome's own dialog window over B's window: said to B, never to A
  dialogs = [{ ...CHOOSER_X, x: 300 + 100, y: 20 + 100 }];
  Object.assign(wins.get(13).bounds, { left: 300, top: 120, width: 900, height: 700 });
  picSkew += 800;
  const dB = await kP.nativeDialogsFor(pP.id, { browserKey: 'bk-0000pb02' });
  const dA = await kP.nativeDialogsFor(pP.id, { browserKey: 'bk-0000pa01' });
  ok(dB.length === 1 && dB[0].title === 'Open File' && dA.length === 0, `Chrome's own "Open File" over B's window is B's (${dB.map((x) => x.title)}) — never A's (${dA.length})`, { dA, dB });
  kP._reg().browsers[pP.id] = { ...kP._reg().browsers[pP.id], launch: 'driver', launchWhy: AT.HIDDEN_WINDOW_WHY, displaySession: null };
  const xd = await kP.xWindowFor(pP.id, { browserKey: 'bk-0000pa01' });
  ok(kP.pictureSourceFor(pP.id).source === 'screencast' && xd.wid === null && xd.why === 'no-display' && (await kP.nativeDialogsFor(pP.id, { browserKey: 'bk-0000pa01' })).length === 0, "a driver-road record: the screencast, no X window, no dialog window asked", xd);
  kP._reg().browsers[pP.id] = { ...kP._reg().browsers[pP.id], launch: 'attach', displaySession: { id: 'da-pic', display: ':93' }, hostId: 'h-mac' };
  ok(kP.pictureSourceFor(pP.id).why === 'remote', 'a paired machine\'s record keeps the screencast (remote)');
  wss.close();
}

// ═══ B-346d: a conversation's own browser's CDP url is cached per RUN — a relaunched daemon is never answered with the old port ═══
console.log('— B-346d: the child url cache key follows the browser\'s run');
{
  const judgeKey = (Bm) => {
    const ephs = [{ id: 'bp-e1', owner: { kind: 'conversation', id: 'bk-0000000c' } }, { id: 'bp-e2', owner: { kind: 'conversation', id: 'bk-0000000d' } }];
    const run1 = { 'bp-e1': { startedAt: 1000, pid: 41 } }, run2 = { 'bp-e1': { startedAt: 2000, pid: 77 } }, noStamp = { 'bp-e1': { pid: 77 } };
    const a = Bm.childUrlKey('bk-0000000c', ephs, run1), a2 = Bm.childUrlKey('bk-0000000c', ephs, run1), b = Bm.childUrlKey('bk-0000000c', ephs, run2);
    return a === a2 && a !== b && a.startsWith('child:bk-0000000c@') && Bm.childUrlKey('bk-0000000c', ephs, noStamp) === 'child:bk-0000000c@77'
      && Bm.childUrlKey('bk-0000000d', ephs, run1) === 'child:bk-0000000d@' && Bm.childUrlKey('bk-0000000c', ephs, run1) !== Bm.childUrlKey('bk-0000000d', ephs, run1);
  };
  // its verdict's should: a Chrome the SAME daemon relaunched in place (same start, a new browser pid / start time) ⇒ a NEW key
  const judgeInPlace = (Bm) => {
    const ephs = [{ id: 'bp-e1', owner: { kind: 'conversation', id: 'bk-0000000c' } }];
    const c1 = { 'bp-e1': { startedAt: 1000, pid: 41, browser: { pid: 500, starttime: 9001 } } }, c1b = { 'bp-e1': { startedAt: 1000, pid: 41, browser: { pid: 500, starttime: 9001 } } };
    const c2 = { 'bp-e1': { startedAt: 1000, pid: 41, browser: { pid: 501, starttime: 9002 } } };
    return Bm.childUrlKey('bk-0000000c', ephs, c1) === Bm.childUrlKey('bk-0000000c', ephs, c1b) && Bm.childUrlKey('bk-0000000c', ephs, c1) !== Bm.childUrlKey('bk-0000000c', ephs, c2);
  };
  ok(verdictOf(judgeKey(B)), 'B-346d childUrlKey: one run of a conversation\'s browser ⇒ one key; its daemon relaunched (a new start) ⇒ a NEW key (the old run\'s port is never the answer); no start stamp ⇒ the pid; no record ⇒ its own empty-run key');
  ok(verdictOf(judgeInPlace(B)), 'B-346d (its verdict\'s should): a Chrome its daemon relaunched IN PLACE (the same start, a new browser pid + start time) ⇒ a NEW key — the old port is never the answer on that road either');
  const ks3 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ok(gateOf(ks3.includes('    const key = B.childUrlKey(h, reg.profiles.filter(isEph), reg.browsers);')) && gateOf(ks3.includes("    for (const k of [...vpUrls.keys()]) if (k !== key && k.startsWith('child:' + h + '@')) vpUrls.delete(k);"))
    && gateOf(ks3.includes("target.kind === 'child' ? childUrlKey(target.handle) :")) && gateOf(ks3.includes('    if (fresh) vpUrls.delete(childUrlKey(p.owner.id));')) && !ks3.includes("'child:' + String(target.handle || '')"),
    'B-346d wiring: withCdpUrl and cdpEndpointFor key a conversation\'s browser\'s url by its run (the previous runs\' urls dropped); the per-conversation key is gone');
  const bsrc3 = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8'), keyNeedle = "  return 'child:' + h + '@' + (rec ? String(Number(rec.startedAt) || rec.pid || '') + br : '');";
  ok(bsrc3.split(keyNeedle).length === 2, 'B-346d control setup: the run in the key is found once in src/browser-profiles.js');
  const brNeedle = "  const br = rec && rec.browser && rec.browser.pid ? ':' + rec.browser.pid + '.' + (rec.browser.starttime == null ? '' : rec.browser.starttime) : '';";
  ok(bsrc3.split(brNeedle).length === 2, 'B-346d control setup: the browser\'s identity in the key is found once');
  const By = mutantCopies('keeper-b346d-inplace', REPO).load('src/browser-profiles.js', editAnchor(bsrc3, brNeedle, "  const br = '';", "src/browser-profiles.js"), 'no-browser-in-key');
  ok(gateOf(judgeKey(By)) && !judgeInPlace(By), 'CONTROL (B-346d, its verdict\'s should: the key without the browser\'s identity) ⇒ an in-place relaunch keeps the old key — RED');
  const Bx = mutantCopies('keeper-b346d', REPO).load('src/browser-profiles.js', editAnchor(bsrc3, keyNeedle, "  return 'child:' + h;", "src/browser-profiles.js"), 'one-key-per-conversation');
  ok(!judgeKey(Bx), 'CONTROL (B-346d, the release\'s cache: one key per conversation) ⇒ a relaunched daemon is answered with the OLD run\'s port — RED');
}

// ── §T THE TWIN HOLDS THE LAUNCHING LEGS (B-7e49, 主开发 r2535: a leg cannot fall between the two files) ─────────────────────────────
{
  const twinRel = 'scripts/test-browser-keeper-launch.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf-8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  const MOVED = ["// the real spawn + poll, over a fake Chrome (node): the modes ok / stale / never / exit", "console.log('— ④ the keeper on the attach road');", "// THE HEAL: an attach Chrome that dies under a HOLDER", "// lane engine-plugin: a profile on a browser ENGINE takes the ATTACH road too", "console.log('— ⑦ lane browser-display-holders", "// cdp_port_missing AT THE KEEPER (started before Chrome", "// THE BOOT: a new keeper on the same data adopts a live attach record", "console.log('— B-8b87: the attach road carries the WebRTC policy", "console.log('— B-9584 U2b: the attach road with a profile"];
  const codeHere = here.replace(/`[\s\S]*?`/g, '``');   // the stubs' sources are template literals: only this file's own code is judged
  ok(gateOf(MOVED.every((h) => twin.includes(h))) && gateOf(MOVED.every((h) => here.split(h).length === 2)) && !/\bspawnChrome\(|\.start\(|\.attach\(|\badoptAll\(|\bexecFileSync\(/.test(codeHere),
    `§T the heavy twin holds the ${MOVED.length} launching sections (② the real spawn … B-9584 U2b), and this file starts none of them`);
  const stubOf = (t) => { const a = t.indexOf("fs.writeFileSync(path.join(FAKE_BIN, 'agent-browser'), `"); const b = a < 0 ? -1 : t.indexOf('`, { mode: 0o755 });', a); return a >= 0 && b > a ? t.slice(a, b) : null; };
  ok(stubOf(here) !== null && stubOf(here) === stubOf(twin), '§T this file and the twin write the SAME fake driver, byte for byte (the keepers here read their driver through it)');
  const ci = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  ok(verdictOf(/\{ name: 'test-browser-keeper-launch', tier: 'heavy',/.test(ci)), '§T the twin is a HEAVY row of the tier');
}

fs.rmSync(S, { recursive: true, force: true });
console.log(`\n${fail ? '✗' : '✓'} test-browser-keeper: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';