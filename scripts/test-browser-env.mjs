#!/usr/bin/env node
// LANE BROWSER-PROPOSE step 1 — THE AUTOMATION FLAG BY DEFAULT (userW's fleet pod, 2026-09-30: a FRESH Google sign-in
// refused with "This browser or app may not be secure" — the agent's browser announced itself as automated; the
// generated config carried no `--disable-blink-features=AutomationControlled`).
//
//   ① PURE (src/browser-profiles.js): `automationFlagVerdict` / `withAutomationFlag` over every args shape (none, a
//      comma string, a newline string, a list), the user's own AutomationControlled value wins either way it points,
//      a `--disable-blink-features=…` switch of theirs is never overridden (Chromium keeps one value per switch), off
//      adds nothing; `generatedConfigParts` composes the flag BEFORE the keeper's mark (the mark rides LAST, its rule
//      unchanged) and says which way it decided.
//   ② ORCH browser-env (the REAL module, scratch dirs): rung D's spawn config carries the flag by default, not with
//      `browser.automationFlag: false`, keeps the user's own value and says so ONCE in the journal; the child config
//      inherits it with its own mark last.
//   ③ ORCH the REAL keeper over a fake agent-browser: a named chromium profile's launch config carries the flag + the
//      mark last and the record is stamped; the setting off ⇒ neither; a row whose launch is not ours to stamp (its
//      `automationFlag` cell false — the fixture's in-place row) is untouched; a browser launched before the change keeps its file
//      (the holdDialogs precedent — a different launch config relaunches Chrome).
//   ④ Controls (scripts/mutant-copy.mjs): a verdict that ignores the user's value, and a browser-env that never passes
//      the setting, are both RED against the rows above.
//
// The measurement behind the flag (navigator.webdriver true → false, headed AND headless, agent-browser 0.38.1) is
// scripts/measure-automation-flag.mjs, recorded in docs/kb-file-structure.md (browser-env.js). No real browser here.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
import { wired, FIXTURE_ID } from './fixtures/browser-switcher-views.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const FLAG = '--disable-blink-features=AutomationControlled';
const argList = (a) => (Array.isArray(a) ? a : String(a || '').split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean);

const ROOT = scratch('bprop');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
const servers = new Set();
process.on('exit', () => { fake.reap(); for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

// ═══ ① PURE ══════════════════════════════════════════════════════════════════
console.log('— ① the flag rule (PURE)');
{
  const V = B.automationFlagVerdict;
  ok(B.AUTOMATION_FLAG === FLAG, 'the flag is spelled once: --disable-blink-features=AutomationControlled');
  const rows = [
    [undefined, { on: true }, 'added', FLAG],
    ['', { on: true }, 'added', FLAG],
    ['--no-sandbox', { on: true }, 'added', '--no-sandbox,' + FLAG],
    ['--no-sandbox\n--lang=en', { on: true }, 'added', '--no-sandbox\n--lang=en\n' + FLAG],
    [['--no-sandbox'], { on: true }, 'added', ['--no-sandbox', FLAG]],
    ['--no-sandbox,' + FLAG, { on: true }, 'theirs', '--no-sandbox,' + FLAG],
    ['--enable-blink-features=AutomationControlled', { on: true }, 'theirs', '--enable-blink-features=AutomationControlled'],
    ['--disable-blink-features=Foo', { on: true }, 'their-switch', '--disable-blink-features=Foo'],
    [['--disable-blink-features'], { on: true }, 'their-switch', ['--disable-blink-features']],
    ['--no-sandbox', { on: false }, 'off', '--no-sandbox'],
  ];
  for (const [args, o, why, want] of rows) {
    const v = V(args, o);
    const got = B.withAutomationFlag(args, o);
    ok(v.why === why && v.add === (why === 'added') && JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(args)} (${o.on ? 'on' : 'off'}) ⇒ ${why}: ${JSON.stringify(want)}`, { v, got });
  }
  const g = B.generatedConfigParts({ userConfig: { args: '--no-sandbox' }, mark: 'bk-0000beef', automationFlag: true });
  ok(argList(g.config.args).join(' ') === `--no-sandbox ${FLAG} --disable-logging --log-level=3 --vibespace-keeper=bk-0000beef` && g.automationFlag === 'added', 'generatedConfigParts: the flag composes BEFORE the launch tail (B-1789 cure: the quiet log switches, then the keeper mark — it rides LAST, its rule unchanged) — and the answer says it was added', g);
  const gS = B.generatedConfigParts({ userConfig: { args: '--no-sandbox' }, mark: 'bk-0000beef', quietLog: false });
  ok(argList(gS.config.args).join(' ') === '--no-sandbox --vibespace-keeper=bk-0000beef', 'B-1789 cure: quietLog false (the keeper\'s file for a record launched before the switches — its stamp) ⇒ the mark alone, still last', gS.config.args);
  const g0 = B.generatedConfigParts({ userConfig: { args: '--no-sandbox' }, mark: 'bk-0000beef' });
  ok(!argList(g0.config.args).includes(FLAG) && g0.automationFlag === 'off', 'generatedConfigParts without the setting passed adds nothing (every caller passes the setting — the default lives in the setting, never in the composer)', g0);
  const gT = B.generatedConfigParts({ userConfig: { args: '--enable-blink-features=AutomationControlled' }, mark: 'bk-0000beef', automationFlag: true });
  ok(argList(gT.config.args).join(' ') === '--enable-blink-features=AutomationControlled --disable-logging --log-level=3 --vibespace-keeper=bk-0000beef' && gT.automationFlag === 'theirs', 'the user\'s own AutomationControlled value wins (even one pointing the other way) and the mark still rides last', gT);
  const forged = B.generatedConfigParts({ userConfig: { args: `--vibespace-keeper=bk-evil,${FLAG}` }, mark: 'bk-0000beef', automationFlag: true });
  ok(argList(forged.config.args).join(' ') === `${FLAG} --disable-logging --log-level=3 --vibespace-keeper=bk-0000beef`, 'a forged mark in the user file is still dropped (sanctionedConfig) — the flag rule changes nothing about the mark', forged.config.args);
}

// ═══ ② browser-env (the REAL module) ═══════════════════════════════════════════
console.log('— ② browser-env: rung D\'s spawn config');
const BE = require('../src/server/browser-env.js');
function mkEnv(settings, userCfg) {
  const d = fs.mkdtempSync(path.join(ROOT, 'env-'));
  const h = path.join(d, 'home'); fs.mkdirSync(path.join(h, '.agent-browser'), { recursive: true });
  if (userCfg) fs.writeFileSync(path.join(h, '.agent-browser', 'config.json'), JSON.stringify(userCfg));
  const lines = [];
  const be = BE.create({ dataDir: path.join(d, 'data'), homeDir: h, serverSetting: (k) => settings[k], log: { log() {}, warn: (l) => lines.push(String(l)), error() {} }, env: {}, socketDirBase: path.join(d, 'sock'), facts: { floor: async () => ({ state: 'ok' }) } });
  return { be, lines, d };
}
{
  const K1 = 'bk-00000e01';
  const { be } = mkEnv({}, { args: '--no-sandbox' });
  const r = be.envFor({ browserKey: K1 });
  const cfg = r.configPath ? JSON.parse(fs.readFileSync(r.configPath, 'utf8')) : null;
  ok(r.variant === B.VARIANTS.D && cfg && argList(cfg.args).join(' ') === `--no-sandbox ${FLAG} --disable-logging --log-level=3 --vibespace-keeper=${K1}` && r.automationFlag === 'added', 'DEFAULT (no setting stored): the spawn config carries the flag, the user\'s own args kept, the mark last', cfg);
  const child = be.childConfigFor(K1 + '.1');
  const cc = child.path ? JSON.parse(fs.readFileSync(child.path, 'utf8')) : null;
  ok(cc && argList(cc.args).join(' ') === `--no-sandbox ${FLAG} --disable-logging --log-level=3 --vibespace-keeper=${K1}.1`, 'a sub-agent\'s own config inherits the flag, with ITS OWN mark last', cc);
  const { be: beOff } = mkEnv({ 'browser.automationFlag': false }, { args: '--no-sandbox' });
  const rOff = beOff.envFor({ browserKey: 'bk-00000e02' });
  const cOff = JSON.parse(fs.readFileSync(rOff.configPath, 'utf8'));
  ok(!argList(cOff.args).includes(FLAG) && rOff.automationFlag === 'off', '`browser.automationFlag: false` ⇒ no flag (the user\'s choice)', cOff);
  const { be: beT, lines } = mkEnv({}, { args: '--no-sandbox,--disable-blink-features=Foo' });
  const rT = beT.envFor({ browserKey: 'bk-00000e03' });
  const cT = JSON.parse(fs.readFileSync(rT.configPath, 'utf8'));
  beT.envFor({ browserKey: 'bk-00000e04' });
  const said = lines.filter((l) => /does not add --disable-blink-features=AutomationControlled/.test(l));
  ok(argList(cT.args).join(' ') === '--no-sandbox --disable-blink-features=Foo --disable-logging --log-level=3 --vibespace-keeper=bk-00000e03' && said.length === 1 && /drop yours/.test(said[0]), 'a --disable-blink-features switch of the user\'s is theirs: never overridden, and the journal says why ONCE (two spawns, one line)', { cT, said });
}
// B-1789 (a sub-agent's child browser stopped answering ~20–25 s after its start): the spawn file — and the helper's copy — carry
// lane browser-stderr-pipe's quiet log switches, by THE LAUNCH TAIL every launch road passes (B.launchTail; the census of roads
// is test-browser-stderr-pipe's); a user's own logging switch wins. CONTROLS: the tail without the switches; the helper's
// line put back to the release's
{
  const quietOf = (args) => argList(args).filter((x) => x === '--disable-logging' || x === '--log-level=3').length;
  const { be: beQ } = mkEnv({}, { args: '--no-sandbox,--v=1' });
  const rQ = beQ.envFor({ browserKey: 'bk-00000e05' });
  const cQ = JSON.parse(fs.readFileSync(rQ.configPath, 'utf8'));
  ok(quietOf(cQ.args) === 0 && argList(cQ.args).includes('--v=1'), 'B-1789: a user\'s own logging switch (--v=1) is theirs — the spawn file adds no quiet switch beside it', cQ.args);
  // B-1789 cure (its readers: «the second fix has no leg» — a parent file written BEFORE the switches): a helper's copy of such a
  // parent still starts a quiet Chrome, its own mark last
  const KP = 'bk-00000e07';
  const { be: beP, d: dP } = mkEnv({}, { args: '--no-sandbox' });
  const rP = beP.envFor({ browserKey: KP });
  const old = { ...JSON.parse(fs.readFileSync(rP.configPath, 'utf8')), args: `--no-sandbox,${FLAG},--vibespace-keeper=${KP}` }; // the release's spawn file
  fs.writeFileSync(rP.configPath, JSON.stringify(old, null, 2));
  const childOf = (be0) => { const c = be0.childConfigFor(KP + '.1'); return c.path ? JSON.parse(fs.readFileSync(c.path, 'utf8')) : null; };
  const cP = childOf(beP);
  ok(cP && argList(cP.args).join(' ') === `--no-sandbox ${FLAG} --disable-logging --log-level=3 --vibespace-keeper=${KP}.1`, 'B-1789 cure: a helper of a conversation whose spawn file was written BEFORE the switches gets them in its own copy (its mark last)', cP && cP.args);
  // CONTROLS — the composer's tail without the switches (every road reads it: the spawn file is then loud), and the helper's
  // line put back to the release's (a mark only: the old parent's helper is then loud)
  const MQ = mutantCopies('b1789-env', REPO);
  const bsrc = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
  const TANCH = '  const a = quiet ? VERBS.withQuietLogging(args) : args;';
  if (!bsrc.includes(TANCH)) ok(false, 'the anchor of the control «B-1789 the launch tail» is not in the source (src/browser-profiles.js)');
  else {
    const Bc = MQ.load('src/browser-profiles.js', editAnchor(bsrc, TANCH, '  const a = args;', "src/browser-profiles.js"), 'b1789-tail-no-quiet');
    const cg = Bc.generatedConfigParts({ userConfig: { args: '--no-sandbox' }, mark: 'bk-00000e06', holdDialogs: true, automationFlag: true }).config;
    ok(quietOf(cg.args) === 0 && quietOf(B.generatedConfigParts({ userConfig: { args: '--no-sandbox' }, mark: 'bk-00000e06', holdDialogs: true, automationFlag: true }).config.args) === 2,
      'CONTROL (B-1789 cure, a launch tail without the switches): the composer browser-env\'s spawn file is made by (the call above, as envFor makes it) carries none — the spawn-file legs above are RED on it', cg.args);
  }
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8');
  const CANCH = '    out.args = B.launchTail(out.args, childKey);';
  if (!esrc.includes(CANCH)) ok(false, 'the anchor of the control «B-1789 the helper\'s copy» is not in the source (src/server/browser-env.js)');
  else {
    const BEc = MQ.load('src/server/browser-env.js', editAnchor(esrc, CANCH, '    out.args = B.withKeeperMark(out.args, childKey);', "src/server/browser-env.js"), 'b1789-child-mark-only'); // stale-pins: kept — the release's helper line
    const bc = BEc.create({ dataDir: path.join(dP, 'data'), homeDir: path.join(dP, 'home'), serverSetting: () => undefined, log: { log() {}, warn() {}, error() {} }, env: {}, socketDirBase: path.join(dP, 'sock'), facts: { floor: async () => ({ state: 'ok' }) } }); // the SAME data dir: it reads the old parent file above
    const cc0 = childOf(bc);
    ok(cc0 && quietOf(cc0.args) === 0, 'CONTROL (B-1789 cure, the release\'s helper line): the old parent\'s helper launches with Chrome\'s logging on — the leg above is RED on it', cc0 && cc0.args);
  }
  for (const r of copiesCensus(MQ.files, MQ.dir, REPO, { label: 'B-1789 CONTROL: ' })) ok(r.pass, r.name, r.detail);
}

console.log('— ②b lane hooks-create H5: the window preference on a machine with no desktop (resolved at the LAUNCH, never baked at the spawn)');
{
  // rung D's spawn config carries the preference AS STORED: unset ⇒ no `headed` key (the user's own config decides there).
  // It is composed at the SPAWN; the display is probed at the LAUNCH — a config that baked "no desktop now" would open a
  // visible window on a desktop that logged in since. The keeper's launch config (the planned file every call names) is
  // where an unset preference becomes headed:true on a no-desktop + Xvfb machine.
  const { be: beU } = mkEnv({}, { args: '--no-sandbox' });
  const rU = beU.envFor({ browserKey: 'bk-00000e51' });
  const cU = JSON.parse(fs.readFileSync(rU.configPath, 'utf8'));
  const { be: beY } = mkEnv({ 'browser.headed': 'yes' }, { args: '--no-sandbox' });
  const cY = JSON.parse(fs.readFileSync(beY.envFor({ browserKey: 'bk-00000e52' }).configPath, 'utf8'));
  const { be: beN } = mkEnv({ 'browser.headed': 'no' }, { args: '--no-sandbox', headed: true });
  const cN = JSON.parse(fs.readFileSync(beN.envFor({ browserKey: 'bk-00000e53' }).configPath, 'utf8'));
  ok(!('headed' in cU) && cY.headed === true && cN.headed === false, 'H5 rung D\'s spawn config: unset stays unset (no headed key), yes / no ride as stored', { cU, cY, cN });
  const D = require('../src/browser-display.js');
  const DC = require('../src/server/browser-display-config.js');
  const podX = { ...D.displayVerdict({}), xvfb: true };
  const desk = { ...D.displayVerdict({ env: { XDG_RUNTIME_DIR: '/r' }, entries: [{ path: '/r/wayland-0', type: 'socket', alive: true }] }), xvfb: true };
  // 2.369.200: H5's rule ships behind its switch, OFF (browser-display NO_DESKTOP_WINDOW_DEFAULT) — these legs judge the RULE
  // with the switch ON (the shape it will ship in — still OFF in 2.369.202; `noDesktopWindow: true`); the shipped default is judged by the leg right after
  const mkDisp = (v, o = { noDesktopWindow: true }) => DC.create({ dir: path.join(ROOT, 'disp-' + Math.random().toString(36).slice(2, 8)), writeJson: (f, o2) => fs.writeFileSync(f, JSON.stringify(o2, null, 2)), log: { warn() {} }, probe: async () => v, ...o });
  const dOff = mkDisp(podX, {});
  const fOff = await dOff.factFor({ baseFile: rU.configPath, mode: 'auto', preference: null });
  ok(D.NO_DESKTOP_WINDOW_DEFAULT === false && !fOff.wanted.byDefault && !fOff.fallback && dOff.fileFor(rU.configPath, fOff) === rU.configPath, 'H5 OFF (2.369.200): the keeper\'s launch for an UNSET preference on a no-desktop + Xvfb machine asks no window — the base file, as in .199', fOff);
  const dP = mkDisp(podX);
  const fP = await dP.factFor({ baseFile: rU.configPath, mode: 'auto', preference: null });
  const fileP = dP.fileFor(rU.configPath, fP);
  const cP = JSON.parse(fs.readFileSync(fileP, 'utf8'));
  ok(fP.wanted.byDefault === true && fP.fallback.rung === 'hidden-window' && fileP !== rU.configPath && cP.headed === true && argList(cP.args).includes('--ozone-platform=x11') && argList(cP.args).includes(FLAG) && argList(cP.args).includes('--vibespace-keeper=bk-00000e51'), 'H5 the keeper\'s LAUNCH config for that spawn file on a no-desktop + Xvfb machine, setting unset: headed:true (x11 pinned; the flag and the mark kept)', { fP, cP });
  const dD = mkDisp(desk);
  const fD = await dD.factFor({ baseFile: rU.configPath, mode: 'auto', preference: null });
  ok(!fD.wanted.byDefault && !fD.fallback && dD.fileFor(rU.configPath, fD) === rU.configPath, 'H5 …the same spawn file on a machine WITH a desktop: unset keeps today\'s meaning (the base file, no window asked)', fD);
  const fNo = await dP.factFor({ baseFile: rU.configPath, mode: 'auto', preference: false });
  const fHl = await dP.factFor({ baseFile: rU.configPath, mode: 'headless', preference: null });
  ok(!fNo.wanted.byDefault && !fHl.wanted.byDefault && dP.fileFor(rU.configPath, fNo) === rU.configPath && dP.fileFor(rU.configPath, fHl) === rU.configPath, 'H5 …browser.headed = no, or browser.noDisplayMode = headless: nothing asks a window (the base file)', { fNo: fNo.wanted, fHl: fHl.wanted });
  const fOld = await dP.factFor({ baseFile: rU.configPath, mode: 'auto' });
  ok(!fOld.wanted.byDefault && !fOld.fallback, 'H5 …a caller that hands no preference (an older keeper) keeps today\'s meaning', fOld);
}

// ═══ ③ the REAL keeper over a fake agent-browser ══════════════════════════════
console.log('— ③ the keeper: named chromium launch stamped + flagged, a row not ours to stamp untouched, setting off, a browser launched before');
const K = require('../src/server/browser-keeper.js');
const cdpSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/151.0.7922.34' })); });
servers.add(cdpSrv);
const CDP_PORT = await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port)));
// the keeper's PATH holds NO system Xvfb (lane hooks-create H5: with Xvfb on the launch PATH and no desktop, an UNSET
// window preference plans the hidden-window rung — a fact of the box, never of this suite, whose subject is the flag;
// test-browser-display owns the display legs): the fake's one system binary, `sleep`, through a private dir
const SYSBIN = path.join(ROOT, 'sysbin'); fs.mkdirSync(SYSBIN, { recursive: true });
for (const d of ['/usr/bin', '/bin']) { try { if (fs.statSync(path.join(d, 'sleep')).isFile()) { fs.symlinkSync(path.join(d, 'sleep'), path.join(SYSBIN, 'sleep')); break; } } catch { /* next */ } }
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:${SYSBIN}`;
function mkKeeper(dataDir, settings) {
  return K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: (k) => settings[k], liveKeys: () => new Set(), install: false, log: { log() {}, warn() {}, error() {} }, providers: wired, hostKnown: () => false,
    keys: { keyFor: (id) => ({ integrationId: id, source: 'user', values: { apiKey: 'k' } }), sourceOf: (id) => ({ integrationId: id, source: 'user' }) } }); // the fixture row's key resolves (its integration is a cloud row's)
}
fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox' }));
{
  const settings = {};
  const k = mkKeeper(path.join(ROOT, 'data-k1'), settings);
  const p = k.createProfile({ label: 'Plain' }, { owner: { kind: 'instance', id: null } });
  await k.start(p.id, { why: 'test' });
  const L1 = fake.launches().at(-1);
  ok(L1 && L1.config && argList(L1.config.args).join(' ') === `--no-sandbox ${FLAG} --disable-logging --log-level=3 --vibespace-keeper=${p.id}` && !L1.args && k._reg().browsers[p.id].automationFlag === true && k._reg().browsers[p.id].quietLog === true, 'a named chromium profile\'s launch ran with the flag + the quiet log switches (lane browser-stderr-pipe) (the user\'s args kept, the mark last) and its record is stamped', L1);
  const pc = k.createProfile({ label: 'Other build', provider: FIXTURE_ID }, { owner: { kind: 'instance', id: null } });
  await k.start(pc.id, { why: 'test' });
  const L2 = fake.launches().at(-1);
  ok(L2 && L2 !== L1 && !argList(L2.config && L2.config.args).includes(FLAG) && !argList(L2.args).includes(FLAG) && k._reg().browsers[pc.id].automationFlag === false, 'a row whose launch is not ours to stamp (its automationFlag cell false) is untouched: no flag in its config, none in its env list', L2);
  await k.stop(p.id, { why: 'test' }); await k.stop(pc.id, { why: 'test' });
  // a browser launched BEFORE the change keeps its file: a record without the stamp names the file without the flag
  const rec = k._reg().browsers[p.id];
  const stamped = argList(JSON.parse(fs.readFileSync(k.machineConfigFile('machine', p.id), 'utf8')).args).includes(FLAG);
  delete rec.automationFlag;
  const before = JSON.parse(fs.readFileSync(k.machineConfigFile('machine', p.id), 'utf8'));
  ok(stamped && !argList(before.args).includes(FLAG) && argList(before.args).at(-1) === `--vibespace-keeper=${p.id}`, 'the file follows the RECORD\'s stamp: a browser launched before the change (no stamp) keeps its file without the flag — a different launch config would relaunch its Chrome (the holdDialogs precedent)', before);
  const file = k.configFileFor({ ephemeral: false, pairs: null });
  ok(file && !argList(JSON.parse(fs.readFileSync(file, 'utf8')).args).includes(FLAG), 'a lease session\'s machine.json (it never launches) carries no flag', file);
  settings['browser.automationFlag'] = false;
  const k2 = mkKeeper(path.join(ROOT, 'data-k2'), settings);
  const p2 = k2.createProfile({ label: 'Off' }, { owner: { kind: 'instance', id: null } });
  await k2.start(p2.id, { why: 'test' });
  const L3 = fake.launches().at(-1);
  ok(L3 && !argList(L3.config.args).includes(FLAG) && argList(L3.config.args).at(-1) === `--vibespace-keeper=${p2.id}` && k2._reg().browsers[p2.id].automationFlag === false, '`browser.automationFlag: false` ⇒ the keeper\'s launch carries no flag (the mark still last)', L3);
  await k2.stop(p2.id, { why: 'test' });
}

// ═══ ④ controls ══════════════════════════════════════════════════════════════
// verify r1 V7: the Settings row SHOWS what the server DOES — the server never reads the schema (serverSetting = the file),
// so its own fallback (`setting('browser.automationFlag', true) !== false`) and the schema's default are two spellings of
// one fact; a schema default of false would show "off" over a flag that is on
{
  const { SETTINGS_SCHEMA } = await import('../src/lib/settings-schema.js');
  const row = SETTINGS_SCHEMA['browser.automationFlag'];
  const readers = ['src/server/browser-env.js', 'src/server/browser-keeper.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8'));
  ok(row && row.type === 'boolean' && row.default === true && readers.every((src) => /setting\('browser\.automationFlag', true\) !== false/.test(src)), 'the Settings row\'s default (on) is the server\'s own fallback in both readers — what the row shows is what the launch does (verify r1 V7)', row && row.default);
}

console.log('— ④ controls: patched copies judged by the rows above');
const M = mutantCopies('bprop-env', REPO);
{
  const src = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
  const cut = "  if (list.some((x) => /AutomationControlled/.test(x))) return { add: false, why: 'theirs' };\n";
  ok(src.includes(cut), 'the theirs rule is where the control cuts it');
  const Bm = M.load('src/browser-profiles.js', editAnchor(src, cut, '', "src/browser-profiles.js"), 'no-theirs');
  const r = Bm.generatedConfigParts({ userConfig: { args: '--enable-blink-features=AutomationControlled' }, automationFlag: true });
  ok(argList(r.config.args).includes(FLAG), 'CONTROL: a verdict that ignores the user\'s own value adds a second, contradicting flag — the theirs row above would be red', r.config.args);
}
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8');
  const cut = ', automationFlag: automationFlagOn() });';
  ok(src.includes(cut), 'browser-env passes the setting where the control cuts it');
  const BEm = M.load('src/server/browser-env.js', editAnchor(src, cut, ' });', "src/server/browser-env.js"), 'no-setting');
  const d = fs.mkdtempSync(path.join(ROOT, 'env-mut-'));
  const be = BEm.create({ dataDir: path.join(d, 'data'), homeDir: HOME, serverSetting: () => undefined, log: { log() {}, warn() {}, error() {} }, env: {}, socketDirBase: path.join(d, 'sock'), facts: { floor: async () => ({ state: 'ok' }) } });
  const r = be.envFor({ browserKey: 'bk-00000e09' });
  ok(r.configPath && !argList(JSON.parse(fs.readFileSync(r.configPath, 'utf8')).args).includes(FLAG), 'CONTROL: a browser-env that never passes the setting spawns WITHOUT the flag — the DEFAULT row above would be red');
}
for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);


// ═══ ⑤ WHICH HOME EACH CHILD SEES (lane profile-lock-roll verify r8, T2 ⑦) ════════════════════════════════════════════════
// Two children, two homes, on purpose. (a) The keeper's browser DAEMON (agent-browser) is spawned with the keeper's `env()` —
// the server's agentEnv() in production, this suite's scratch env here — so its HOME is the keeper's `homeDir` and its socket root
// `$HOME/.agent-browser` is the keeper's. (b) The agent's `vibespace-browser` reads the ACCOUNT's home off the passwd entry
// (`os.userInfo().homedir`, r4 takeover finding 2) for the machine's own things (~/.agent-browser/config.json, the pinned composed
// config under ~/.vibespace/browser-config) and takes the socket root from the keeper's /resolve answer — never from $HOME. A suite
// that runs the CLI without test-browser-verbs' PASSWD_PRELOAD (os.userInfo faked onto the scratch HOME) therefore reaches the
// owner's real home READ-ONLY for config.json (r8 census: 21 fast suites do; the pinned-config dir on the owner's box was last
// written 2026-09-26, six days of gate runs later), and the two deliberate reads are censused by test-architecture §68.
console.log('— ⑤ which HOME each child sees: the daemon the keeper\'s, the CLI the account\'s (passwd), the socket root the keeper\'s');
{
  const cliSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  ok(/function accountHome\(\)[\s\S]*os\.userInfo\(\)\.homedir/.test(cliSrc) && /const HOMES = accountHome\(\);/.test(cliSrc), '⑤ the CLI reads the ACCOUNT\'s home off the passwd entry (accountHome → the getpwuid answer), never $HOME, for the machine\'s own things');
  ok(/path\.join\(HOMES\.home, '\.agent-browser', 'config\.json'\)/.test(cliSrc) && /path\.join\(HOMES\.home, '\.vibespace', 'browser-config'\)/.test(cliSrc), '⑤ the account home is where the CLI reads config.json and pins a composed config (the two writes/reads a bare suite could reach — read-only unless an `open` through the real binary composes a config)');
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/require\('\.\/browser-keeper'\)\.create\(\{[\s\S]{0,400}env: \(\) => agentEnv\(\)/.test(wiring), '⑤ the keeper is wired with env: () => agentEnv() — the daemon\'s HOME is the server\'s (the keeper\'s homeDir), the suites\' scratch HOME here');
  const verbs = fs.readFileSync(path.join(REPO, 'scripts/test-browser-verbs.mjs'), 'utf8');
  ok(/PASSWD_PRELOAD/.test(verbs) && /os\.userInfo = \(o\) => \(\{ \.\.\.real\(o\), homedir: /.test(verbs), '⑤ the ONE way a suite redirects the CLI\'s account home is test-browser-verbs\' passwd preload (os.userInfo faked onto the scratch HOME) — a suite without it reaches the real passwd home read-only');
}

// ── B-574d «browser-stores» 7/8 (lane nl-migrations, 主开发 r5101 / r5128 (b)): the generated configs are DERIVED — their read-side check
// at the conversation's start: the file read back as an object after its write, or written again ONCE (a write that tore heals at
// once), said once by name when it still does not read (the browser falls back as before). RED (anchored copy): one write, no second
console.log('— B-574d browser-stores 7/8: a generated config read back, or written again once');
{
  const readBack = (BEmod, tag, tornWrites) => {
    const d = fs.mkdtempSync(path.join(ROOT, `bs7-${tag}-`)), h = path.join(d, 'home'); fs.mkdirSync(path.join(h, '.agent-browser'), { recursive: true });
    const lines = []; let n = 0;
    const writeJson = (f, o) => { n++; if (n <= tornWrites) fs.writeFileSync(f, '{ torn'); else fs.writeFileSync(f, JSON.stringify(o, null, 2)); };   // the first `tornWrites` writes land torn
    const be = BEmod.create({ dataDir: path.join(d, 'data'), homeDir: h, serverSetting: () => undefined, log: { log() {}, warn: (l) => lines.push(String(l)), error() {} }, env: {}, socketDirBase: path.join(d, 'sock'), facts: { floor: async () => ({ state: 'ok' }) }, writeJson });
    const r = be.envFor({ browserKey: 'bk-0000b7b7', integrationOn: true });
    const cfg = (r.pairs || []).find((p) => String(p).startsWith('AGENT_BROWSER_CONFIG='));
    return { variant: r.variant, named: !!cfg, writes: n, said: lines.filter((l) => l.includes('does not read back after two writes')).length };
  };
  const R1 = readBack(BE, 'once', 1), R2 = readBack(BE, 'always', 99);
  ok(R1.variant === 'D' && R1.named && R1.writes === 2 && R1.said === 0, 'B-574d browser-stores 7/8: a generated config whose write tore ONCE is written again at once — the conversation keeps rung D, its config named, nothing said', R1);
  ok(R2.variant === 'C' && !R2.named && R2.said === 1, '…one that still does not read after the second write falls back as before (rung C, never named) and is SAID once by name', R2);
  const esrc7 = fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8');
  const BE1 = mutantCopies('bs7-env', REPO).load('src/server/browser-env.js', editAnchor(esrc7, '    for (let i = 0; i < 2; i++) {\n      writeJson(p, obj);\n', '    for (let i = 0; i < 1; i++) {\n      writeJson(p, obj);\n', 'src/server/browser-env.js'), 'bs7-one-write');
  const R1x = readBack(BE1, 'red', 1);
  ok(R1x.variant === 'C', 'RED (anchored copy: one write, no second): the config that tore once drops the conversation to rung C — 7/8 goes red', R1x);
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? ` passed, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
