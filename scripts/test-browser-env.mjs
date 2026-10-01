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
//      mark last and the record is stamped; the setting off ⇒ neither; a CloakBrowser launch is untouched (its own build:
//      no flag in its config, none in its AGENT_BROWSER_ARGS); a browser launched before the change keeps its file
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
import { wiredCloak } from './fixtures/browser-switcher-views.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
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
  ok(argList(g.config.args).join(' ') === `--no-sandbox ${FLAG} --vibespace-keeper=bk-0000beef` && g.automationFlag === 'added', 'generatedConfigParts: the flag composes BEFORE the keeper mark — the mark rides LAST (its rule unchanged) — and the answer says it was added', g);
  const g0 = B.generatedConfigParts({ userConfig: { args: '--no-sandbox' }, mark: 'bk-0000beef' });
  ok(!argList(g0.config.args).includes(FLAG) && g0.automationFlag === 'off', 'generatedConfigParts without the setting passed adds nothing (every caller passes the setting — the default lives in the setting, never in the composer)', g0);
  const gT = B.generatedConfigParts({ userConfig: { args: '--enable-blink-features=AutomationControlled' }, mark: 'bk-0000beef', automationFlag: true });
  ok(argList(gT.config.args).join(' ') === '--enable-blink-features=AutomationControlled --vibespace-keeper=bk-0000beef' && gT.automationFlag === 'theirs', 'the user\'s own AutomationControlled value wins (even one pointing the other way) and the mark still rides last', gT);
  const forged = B.generatedConfigParts({ userConfig: { args: `--vibespace-keeper=bk-evil,${FLAG}` }, mark: 'bk-0000beef', automationFlag: true });
  ok(argList(forged.config.args).join(' ') === `${FLAG} --vibespace-keeper=bk-0000beef`, 'a forged mark in the user file is still dropped (sanctionedConfig) — the flag rule changes nothing about the mark', forged.config.args);
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
  return { be, lines };
}
{
  const K1 = 'bk-00000e01';
  const { be } = mkEnv({}, { args: '--no-sandbox' });
  const r = be.envFor({ browserKey: K1 });
  const cfg = r.configPath ? JSON.parse(fs.readFileSync(r.configPath, 'utf8')) : null;
  ok(r.variant === B.VARIANTS.D && cfg && argList(cfg.args).join(' ') === `--no-sandbox ${FLAG} --vibespace-keeper=${K1}` && r.automationFlag === 'added', 'DEFAULT (no setting stored): the spawn config carries the flag, the user\'s own args kept, the mark last', cfg);
  const child = be.childConfigFor(K1 + '.1');
  const cc = child.path ? JSON.parse(fs.readFileSync(child.path, 'utf8')) : null;
  ok(cc && argList(cc.args).join(' ') === `--no-sandbox ${FLAG} --vibespace-keeper=${K1}.1`, 'a sub-agent\'s own config inherits the flag, with ITS OWN mark last', cc);
  const { be: beOff } = mkEnv({ 'browser.automationFlag': false }, { args: '--no-sandbox' });
  const rOff = beOff.envFor({ browserKey: 'bk-00000e02' });
  const cOff = JSON.parse(fs.readFileSync(rOff.configPath, 'utf8'));
  ok(!argList(cOff.args).includes(FLAG) && rOff.automationFlag === 'off', '`browser.automationFlag: false` ⇒ no flag (the user\'s choice)', cOff);
  const { be: beT, lines } = mkEnv({}, { args: '--no-sandbox,--disable-blink-features=Foo' });
  const rT = beT.envFor({ browserKey: 'bk-00000e03' });
  const cT = JSON.parse(fs.readFileSync(rT.configPath, 'utf8'));
  beT.envFor({ browserKey: 'bk-00000e04' });
  const said = lines.filter((l) => /does not add --disable-blink-features=AutomationControlled/.test(l));
  ok(argList(cT.args).join(' ') === '--no-sandbox --disable-blink-features=Foo --vibespace-keeper=bk-00000e03' && said.length === 1 && /drop yours/.test(said[0]), 'a --disable-blink-features switch of the user\'s is theirs: never overridden, and the journal says why ONCE (two spawns, one line)', { cT, said });
}

// ═══ ③ the REAL keeper over a fake agent-browser ══════════════════════════════
console.log('— ③ the keeper: named chromium launch stamped + flagged, cloak untouched, setting off, a browser launched before');
const K = require('../src/server/browser-keeper.js');
const cdpSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/151.0.7922.34' })); });
servers.add(cdpSrv);
const CDP_PORT = await new Promise((r) => cdpSrv.listen(0, '127.0.0.1', () => r(cdpSrv.address().port)));
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
function mkKeeper(dataDir, settings) {
  return K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) }), serverSetting: (k) => settings[k], liveKeys: () => new Set(), install: false, log: { log() {}, warn() {}, error() {} }, providers: wiredCloak, hostKnown: () => false });
}
fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox' }));
{
  const settings = { 'browser.cloak.executablePath': fake.cloakExe };
  const k = mkKeeper(path.join(ROOT, 'data-k1'), settings);
  const p = k.createProfile({ label: 'Plain' }, { owner: { kind: 'instance', id: null } });
  await k.start(p.id, { why: 'test' });
  const L1 = fake.launches().at(-1);
  ok(L1 && L1.config && argList(L1.config.args).join(' ') === `--no-sandbox ${FLAG} --vibespace-keeper=${p.id}` && !L1.args && k._reg().browsers[p.id].automationFlag === true, 'a named chromium profile\'s launch ran with the flag (the user\'s args kept, the mark last) and its record is stamped', L1);
  const pc = k.createProfile({ label: 'Cloaked', provider: 'cloak' }, { owner: { kind: 'instance', id: null } });
  await k.start(pc.id, { why: 'test' });
  const L2 = fake.launches().at(-1);
  ok(L2 && L2.exe === fake.cloakExe && !argList(L2.config && L2.config.args).includes(FLAG) && !argList(L2.args).includes(FLAG) && /--fingerprint=/.test(L2.args) && k._reg().browsers[pc.id].automationFlag === false, 'a CloakBrowser launch is untouched: no flag in its config, none in its AGENT_BROWSER_ARGS (its own build\'s patches), never stamped', L2);
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
  const Bm = M.load('src/browser-profiles.js', src.replace(cut, ''), 'no-theirs');
  const r = Bm.generatedConfigParts({ userConfig: { args: '--enable-blink-features=AutomationControlled' }, automationFlag: true });
  ok(argList(r.config.args).includes(FLAG), 'CONTROL: a verdict that ignores the user\'s own value adds a second, contradicting flag — the theirs row above would be red', r.config.args);
}
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8');
  const cut = ', automationFlag: automationFlagOn() });';
  ok(src.includes(cut), 'browser-env passes the setting where the control cuts it');
  const BEm = M.load('src/server/browser-env.js', src.replace(cut, ' });'), 'no-setting');
  const d = fs.mkdtempSync(path.join(ROOT, 'env-mut-'));
  const be = BEm.create({ dataDir: path.join(d, 'data'), homeDir: HOME, serverSetting: () => undefined, log: { log() {}, warn() {}, error() {} }, env: {}, socketDirBase: path.join(d, 'sock'), facts: { floor: async () => ({ state: 'ok' }) } });
  const r = be.envFor({ browserKey: 'bk-00000e09' });
  ok(r.configPath && !argList(JSON.parse(fs.readFileSync(r.configPath, 'utf8')).args).includes(FLAG), 'CONTROL: a browser-env that never passes the setting spawns WITHOUT the flag — the DEFAULT row above would be red');
}
for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? ` passed, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
