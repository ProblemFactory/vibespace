#!/usr/bin/env node
// THE GUIDED DOOR FOR AN ACCOUNT ADDED BY ITS LONG-LIVED TOKEN (lane oat-add-door, 2.369.399 — the owner, 2026-11-13: way ①
// «登录一次（推荐）», way ② «我自己选» with the names a person reads; «订阅在改名»). Fast, in-process, no binary run, no vendor call:
//   §1 PURE src/claude-plan-catalog.js — the CLI's own subscription values read as data (the measured 2.1.321 map; a map cut by a
//      chunk boundary; a hostile value; the zero tier withheld)
//   §2 PURE src/plan-names.js — the dated table → the choices this CLI offers (order, «原 …» until 2027-11-13, «先不选» last, none
//      without measured scopes or read types) and the shape each choice writes
//   §3 PURE src/cli-caps.js — the mint's scopes read off what setup-token PRINTS (the measured 2.1.321 screen: wrapped, escaped, the
//      vendor's origin), per exact version; the shipped fixture
//   §4 PURE src/login-expiry.js — a person's typeless shape IS a shape (the file carries no type), an empty one is not
//   §5 src/server/cli-model-catalog.js — the plan values ride the streamed read (a map across the 8 MiB chunk boundary; a binary
//      without one keeps its catalog verdict); the ledger accepts only what the reader writes
//   §6 THE STORE (real AccountManager, scratch data dir): no type ⇒ no-scopes; the mint's scopes per version; the person's choice
//      (typeless, then Ultra) written through the one queue; a SIGN-IN replaces the choice, said once; a sign-in's shape is not
//      re-chosen by hand; export / import carry the provenance
//   §7 THE DOORS (source pins): the routes refuse an agent's bearer; the row's words never «re-login» alone; zh / ja
//   RED CONTROLS: the shape verdict without the typeless clause (materializeVerdict says no-scopes); the reader without the plan
//      scanner (no plans)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CPC = require(path.join(REPO, 'src/claude-plan-catalog.js'));
const PN = require(path.join(REPO, 'src/plan-names.js'));
const CC = require(path.join(REPO, 'src/cli-caps.js'));
const LE = require(path.join(REPO, 'src/login-expiry.js'));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oat-add-door-'));
const OAT = ['sk', '-ant-oat01-'].join('') + 'ADDfake_' + 'k3P9'.repeat(12) + '-qq';
const MAP = 'new Map([["claude_max","max"],["claude_pro","pro"],["claude_enterprise","enterprise"],["claude_team","team"]])';
const CAT = { types: ['max', 'pro', 'enterprise', 'team'], tiers: ['default_claude_max_20x', 'default_claude_max_5x'] };
const NOW = Date.UTC(2026, 10, 13, 2);

console.log('§1 the CLI\'s own subscription values');
{
  const c = CPC.planCatalogOf(MAP.slice('new Map(['.length, -2), ['default_claude_max_20x', 'default_claude_zero', 'default_claude_max_5x', 'default_claude_max_20x']);
  ok(c.anchor && JSON.stringify(c.types) === '["max","pro","enterprise","team"]' && c.orgTypes.max === 'claude_max' && JSON.stringify(c.tiers) === '["default_claude_max_20x","default_claude_max_5x"]' && JSON.stringify(c.withheld) === '["default_claude_zero"]', 'the measured map ⇒ types max / pro / enterprise / team in the CLI\'s order; the tiers sorted, `default_claude_zero` withheld (never offered)', c);
  const sc = CPC.createPlanScanner();
  const text = 'x'.repeat(5000) + ',"default_claude_max_5x",' + 'y'.repeat(300) + MAP + 'z'.repeat(50); // quoted, as the bytes hold it
  const cut = text.indexOf('"claude_pro"');
  sc.feed(text.slice(0, cut)); ok(!sc.found(), 'the scanner before the map\'s end: not found yet');
  sc.feed(text.slice(cut)); const r = sc.result();
  ok(sc.found() && r.types.length === 4 && JSON.stringify(r.tiers) === '["default_claude_max_5x"]', 'a map CUT by a chunk boundary is read whole (the scanner carries the tail)', r);
  const none = CPC.createPlanScanner(); none.feed('nothing here default_claude_max_20x'); const n = none.result();
  ok(!n.anchor && n.types.length === 0 && n.tiers.length === 1, 'no map in the bytes ⇒ anchor false, no type (way ② is then not offered)', n);
  const hostile = CPC.planCatalogOf('["claude_max","MAX"],["claude_x","' + 'a'.repeat(41) + '"]', ['default_claude_<b>', 'default_claude_ok']);
  ok(hostile.types.length === 0 && JSON.stringify(hostile.tiers) === '["default_claude_ok"]', 'a value outside [a-z0-9_]{1,40} is never read (the binary is data from outside)', hostile);
}

console.log('§2 the dated table → the choices');
{
  const sc = ['user:inference'];
  const ch = PN.planChoices(CAT, { scopes: sc, now: NOW });
  ok(ch.map((c) => c.choice).join(' ') === 'ultra max pro type:enterprise type:team unsure', 'the order a person reads: Ultra, Max, Pro, the CLI\'s other types by their ids, «先不选» LAST', ch.map((c) => c.choice));
  ok(ch[0].name === 'Ultra' && ch[0].formerly === 'Max 20x' && ch[0].type === 'max' && ch[0].tier === 'default_claude_max_20x' && ch[1].name === 'Max' && ch[1].formerly === 'Max 5x' && ch[1].tier === 'default_claude_max_5x' && ch[2].type === 'pro' && ch[2].tier === null, 'Ultra = max + default_claude_max_20x (原 Max 20x); Max = max + default_claude_max_5x (原 Max 5x); Pro = pro, no tier');
  const late = PN.planChoices(CAT, { scopes: sc, now: Date.UTC(2027, 10, 13) });
  ok(late[0].formerly === null && late[1].formerly === null && PN.planChoices(CAT, { scopes: sc, now: Date.UTC(2027, 10, 12) })[0].formerly === 'Max 20x', 'the «原 …» names are shown until 2027-11-13, then dropped');
  ok(PN.planChoices(CAT, { scopes: null, now: NOW }).length === 0 && PN.planChoices(CAT, { scopes: [], now: NOW }).length === 0 && PN.planChoices({ types: [], tiers: CAT.tiers }, { scopes: sc, now: NOW }).length === 0 && PN.planChoices(null, { scopes: sc }).length === 0, 'no measured mint scopes, or no type read from the bytes ⇒ NO choice (the door offers «sign in once» alone)');
  const noTier = PN.planChoices({ types: ['max', 'pro'], tiers: [] }, { scopes: sc, now: NOW });
  ok(noTier.map((c) => c.choice).join(' ') === 'pro unsure', 'a CLI that carries no max tiers offers no Ultra / Max (never a guessed tier)', noTier.map((c) => c.choice));
  ok(!ch.some((c) => /free|zero/i.test(String(c.choice) + c.name + c.tier)), 'never Free, never the zero tier');
  ok(JSON.stringify(PN.choiceShape('ultra', CAT, { scopes: sc, now: NOW })) === '{"scopes":["user:inference"],"subscriptionType":"max","rateLimitTier":"default_claude_max_20x"}' && JSON.stringify(PN.choiceShape('pro', CAT, { scopes: sc })) === '{"scopes":["user:inference"],"subscriptionType":"pro"}' && JSON.stringify(PN.choiceShape('type:team', CAT, { scopes: sc })) === '{"scopes":["user:inference"],"subscriptionType":"team"}', 'each choice writes the mint\'s scopes + exactly the chosen values');
  ok(JSON.stringify(PN.choiceShape('unsure', CAT, { scopes: sc })) === '{"scopes":["user:inference"],"typeless":true}', '«先不选» writes the scopes and NO type (nothing false written for a person who does not know the plan)');
  ok(PN.choiceShape('free', CAT, { scopes: sc }) === null && PN.choiceShape('type:max2', CAT, { scopes: sc }) === null && PN.choiceShape('ultra', { types: ['pro'], tiers: [] }, { scopes: sc }) === null && PN.choiceShape('ultra', CAT, { scopes: ['Bad Scope'] }) === null, 'a choice this CLI does not offer, or scopes the grammar refuses ⇒ null (the route answers not_offered)');
  ok(PN.choiceIdOk('ultra') && PN.choiceIdOk('unsure') && PN.choiceIdOk('type:team') && !PN.choiceIdOk('type:') && !PN.choiceIdOk('__proto__') && !PN.choiceIdOk(''), 'the choice id grammar (the route\'s first check)');
  ok(PN.PLAN_NAMES_AT === '2026-11-13' && PN.FORMER_NAMES_UNTIL === Date.UTC(2027, 10, 13), 'the table is dated (2026-11-13) and its former names end on 2027-11-13');
}

console.log('§3 the mint\'s own scopes');
{
  // the 2.1.321 screen as the probe read it (lane copy, loopback mock, 2026-11-13): wrapped at 80 columns, escapes between words
  const screen = "\x1b[2m·\x1b[39mOpening\x1b[12Gbrowser\x1b[20Gto\x1b[23Gsign\x1b[28Gin…\r\r\nBrowser didn't open? Use the url below to sign in (c to copy)\r\r\n\r\r\nhttps://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88\r\r\ned-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.co\r\r\nm%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&code_challenge=f2yz0FeYvPsiCB\r\r\nqZwHUafHzTViUEpKsNGUK62r4xunA&code_challenge_method=S256&state=q8EE3BafF-ydoVpFx\r\r\n-oefm6z6vbr56RLsmIfx_idSoM\r\r\n\r\r\nHold Shift while selecting to use your terminal's native copy\r\r\n\r\r\nPaste code here if prompted >";
  const m = CC.mintScopesIn(screen);
  ok(!!m && JSON.stringify(m.scopes) === '["user:inference"]' && m.origin === 'https://claude.com', 'the measured 2.1.321 screen ⇒ scope user:inference (the URL read whole across its wraps and escapes; the vendor\'s origin — printed, never fetched)', m);
  ok(CC.mintScopesIn(screen.slice(0, screen.indexOf('callback'))) === null, 'a URL not yet printed past its scope ⇒ null (the probe keeps reading)');
  ok(CC.mintScopesIn('https://h.example/oauth/authorize?a=1&scope=user%3Ainference Hold') === null, 'a LAST-parameter scope glued to the next words ⇒ refused by the grammar, never guessed');
  ok(JSON.stringify(CC.mintScopesIn('http://127.0.0.1:9/oauth/authorize?scope=user%3Ainference+user%3Aprofile&x=1')?.scopes) === '["user:inference","user:profile"]', 'several scopes (+ or space separated) are read in order');
  ok(CC.mintScopesIn('no url') === null && CC.mintScopesIn('http://h/oauth/authorize?scope=&x=1') === null, 'no URL / an empty scope ⇒ null');
  const fx = { versions: { '2.1.321': { cliVersion: '2.1.321', verdict: 'PASS', scopes: ['user:inference'] }, '2.1.322': { cliVersion: '2.1.322', verdict: 'FAIL', note: 'n' } } };
  ok(JSON.stringify(CC.mintScopesOf('2.1.321 (Claude Code)', fx)) === '["user:inference"]' && CC.mintScopesOf('2.1.322', fx) === null && CC.mintScopesOf('2.1.323', fx) === null && CC.mintScopesOf('2.1.321-dev.1', fx) === null, 'per EXACT version, a PASS only (a FAIL, another version, a build suffix ⇒ null)');
  const shipped = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/oat-mint-scopes.json'), 'utf8'));
  ok(JSON.stringify(CC.mintScopesOf('2.1.321', shipped)) === '["user:inference"]' && shipped.versions['2.1.321'].script === 'scripts/measure-claude-cred-read.mjs' && shipped.versions['2.1.321'].rung === 'loopback-real', 'the shipped fixture: 2.1.321 asks user:inference — written by the release road (loopback-real rung)', shipped.versions['2.1.321']);
  ok(CC.MINT_VARIANT === 'oat-mint-scopes' && !CC.OAT_VARIANTS.includes(CC.MINT_VARIANT) && !CC.OAT_IN_FILE_GATE.includes(CC.MINT_VARIANT), 'the mint is its own variant — never one of the six, never in the gate');
}

console.log('§4 a person\'s typeless shape is a shape');
{
  const sh = LE.storedShapeOf({ scopes: ['user:inference'], typeless: true });
  ok(JSON.stringify(sh) === '{"scopes":["user:inference"],"typeless":true}' && LE.storedShapeOf({ scopes: [], typeless: true }) === null && JSON.stringify(LE.storedShapeOf({ scopes: ['user:inference'], subscriptionType: 'pro' })) === '{"scopes":["user:inference"],"subscriptionType":"pro"}' && LE.storedShapeOf({ scopes: ['a'] }) === null, 'storedShapeOf: typeless with scopes ✓, typeless without scopes ✗, a typed one ✓, scopes alone ✗');
  const body = LE.oatFileBody(OAT, { expiresAt: NOW + 1e9, shape: sh, mintedAt: NOW, account: 'sub-x' });
  ok(!('subscriptionType' in body.claudeAiOauth) && !('rateLimitTier' in body.claudeAiOauth) && JSON.stringify(body.claudeAiOauth.scopes) === '["user:inference"]' && !('refreshToken' in body.claudeAiOauth), 'the file a typeless shape writes carries the scopes and NO type, no tier, no refresh token');
  const base = { ours: false, fileState: 'absent', file: null, dirState: 'dir', oat: { present: true, validUntil: NOW + 1e9, readable: true }, caps: { ok: true, known: true } };
  ok(LE.materializeVerdict({ ...base, shape: sh }, NOW).verdict === 'materialize' && LE.materializeVerdict({ ...base, shape: null }, NOW).verdict === 'no-scopes' && LE.materializeVerdict({ ...base, shape: { scopes: ['user:inference'] } }, NOW).verdict === 'no-scopes', 'materializeVerdict: the person\'s typeless shape ⇒ materialize; no shape / scopes without a type or the typeless mark ⇒ no-scopes');
  // RED CONTROL: the verdict without the typeless clause
  const src = fs.readFileSync(path.join(REPO, 'src/login-expiry.js'), 'utf8');
  const red = src.replace("(!!sh.subscriptionType || sh.typeless === true)", '!!sh.subscriptionType');
  ok(red !== src, 'RED CONTROL: the typeless clause is where the verdict reads it');
  const f = path.join(tmp, 'login-expiry-red.js'); fs.writeFileSync(f, red.replace(/require\('\.\//g, `require('${REPO}/src/`));
  const LR = require(f);
  ok(LR.materializeVerdict({ ...base, shape: sh }, NOW).verdict === 'no-scopes', 'RED CONTROL: without it the person\'s «先不选» would be refused as no-scopes (the suite sees the difference)');
}

console.log('§5 the plan values ride the streamed read');
{
  const CMC = require(path.join(REPO, 'src/server/cli-model-catalog.js'));
  const big = path.join(tmp, 'claude-fake-bin');
  const fd = fs.openSync(big, 'w');
  const CH = 8 << 20;
  fs.writeSync(fd, Buffer.from('#!fake\0default_claude_max_20x\0default_claude_zero\0'), 0, undefined, 0);
  const mapAt = CH - 40; // the map STRADDLES the first 8 MiB chunk's end
  fs.writeSync(fd, Buffer.from(MAP), 0, undefined, mapAt);
  fs.writeSync(fd, Buffer.from('\0default_claude_max_5x\0'), 0, undefined, CH + 200);
  fs.ftruncateSync(fd, CH + 4096); fs.closeSync(fd);
  const e = await CMC.readBinary(big, { version: '9.9.9' });
  ok(e.state === 'unreadable' && e.reason?.code === 'no-anchor' && e.plans && e.plans.anchor && e.plans.types.join() === 'max,pro,enterprise,team' && e.plans.tiers.join() === 'default_claude_max_20x,default_claude_max_5x' && e.plans.withheld.join() === 'default_claude_zero', 'a map across the chunk boundary is read; a binary with no model catalog keeps its own verdict (no-anchor) — the plans never decide it', { state: e.state, reason: e.reason, plans: e.plans });
  const none = path.join(tmp, 'claude-fake-none'); fs.writeFileSync(none, Buffer.alloc(4096));
  const n = await CMC.readBinary(none, { version: '9.9.8' });
  ok(n.plans && n.plans.anchor === false && n.plans.types.length === 0, 'a binary without the map ⇒ plans.anchor false (way ② not offered)', n.plans);
  // the ledger: what the load accepts is what the reader writes
  const dd = path.join(tmp, 'ledger'); fs.mkdirSync(dd);
  const entry = (plans) => ({ cli: '9.9.9', state: 'unreadable', models: [], aliases: {}, latestPerFamily: {}, refused: [], reason: { code: 'no-anchor', at: 0 }, reader: 2, plans });
  fs.writeFileSync(path.join(dd, CMC.LEDGER), JSON.stringify({ schema: 1, current: 'k1', binaries: { k1: entry(e.plans), k2: entry({ ...e.plans, types: ['max', 'EVIL'] }), k3: entry({ ...e.plans, tiers: ['default_claude_zero'] }) }, said: [] }));
  CMC._reset(); const l = CMC._load(dd);
  ok(!!l.binaries.k1 && !l.binaries.k2 && !l.binaries.k3 && JSON.stringify(CMC.plans()?.types) === '["max","pro","enterprise","team"]', 'the ledger load re-checks the plan values: a hostile type or a withheld tier offered ⇒ the entry is dropped; plans() hands the current binary\'s', Object.keys(l.binaries));
  CMC._reset();
  const MC = require(path.join(REPO, 'src/claude-model-catalog.js'));
  ok(MC.READER_VERSION === 2, 'the reader\'s version moved (2): a binary read before the plan values were is read once more');
  // RED CONTROL: the reader without the scanner's feed
  const src = fs.readFileSync(path.join(REPO, 'src/server/cli-model-catalog.js'), 'utf8');
  const red = src.replace("        plans.feed(buf.subarray(carry, carry + bytesRead).toString('latin1'));\n", '');
  ok(red !== src, 'RED CONTROL: the feed line is where the read hands the bytes over');
  const rf = path.join(tmp, 'cmc-red.js'); fs.writeFileSync(rf, red.replace(/require\('\.\.\//g, `require('${REPO}/src/`).replace(/require\('\.\//g, `require('${REPO}/src/server/`));
  const RR = require(rf); const er = await RR.readBinary(big, { version: '9.9.9' });
  ok(er.plans && er.plans.anchor === false, 'RED CONTROL: without it the same binary yields no plan values (the suite sees the difference)', er.plans);
}

console.log('§6 the store');
{
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const am = new AccountManager({ dataDir: path.join(tmp, 'data'), platform: 'linux' });
  const id = am.createSubscription({ name: 'Token Only' }).id;
  am.noteCliVersion('2.1.321 (Claude Code)'); await am.oatFileSettled();
  const cred = () => { try { return JSON.parse(fs.readFileSync(path.join(am.subDir(id), '.credentials.json'), 'utf8')); } catch { return null; } };
  am.setOat(id, OAT); const f0 = await am.oatFileSettled(id);
  const row = () => am.list().accounts.find((a) => a.id === id);
  ok(f0?.verdict === 'no-scopes' && cred() === null && row().oatFile?.state === 'refused' && row().oatFile?.reason === 'no-scopes' && am.placeWallOf(id)?.code === 'oat-not-in-folder' && am.placeWallOf(id)?.reason === 'no-scopes', 'a token pasted on a row no sign-in ever shaped ⇒ no-scopes: nothing written, the pool\'s wall names it (oat-not-in-folder · no-scopes)', { f0, wall: am.placeWallOf(id) });
  const mc = am.oatMintCaps();
  ok(mc.ok && mc.cli === '2.1.321' && JSON.stringify(mc.scopes) === '["user:inference"]' && mc.from === 'fixture', 'oatMintCaps: the hub\'s 2.1.321 ⇒ the mint\'s scopes from the release road\'s fixture', mc);
  am.noteCliVersion('2.1.999 (Claude Code)'); await am.oatFileSettled();
  ok(!am.oatMintCaps().ok && am.oatMintCaps().scopes === null, 'a version neither road measured ⇒ no scopes (way ② not offered)');
  am.noteCliMeasured({ cli: '2.1.999', sha256: 'sha-x', state: 'pass', mintScopes: ['user:inference'] });
  am._oatCliBin = { sha256: 'sha-x' };
  ok(am.oatMintCaps().ok && am.oatMintCaps().from === 'hub', 'the hub\'s own check of exactly these bytes carries the scopes ⇒ from hub');
  am._oatCliBin = { sha256: 'sha-other' };
  ok(!am.oatMintCaps().ok, '…other bytes of the same version ⇒ not (law 2: never another build)');
  am.noteCliMeasured(null); am._oatCliBin = null;
  am.noteCliVersion('2.1.321 (Claude Code)'); await am.oatFileSettled();
  const S = ['user:inference'];
  await am.setOatShapeByPerson(id, PN.choiceShape('unsure', CAT, { scopes: S }));
  const c1 = cred();
  ok(!!c1 && c1.claudeAiOauth.accessToken === OAT && !('subscriptionType' in c1.claudeAiOauth) && JSON.stringify(c1.claudeAiOauth.scopes) === '["user:inference"]' && row().oatShape?.source === 'person' && row().oatShape?.typeless === true && am.placeWallOf(id) === null, '«先不选» ⇒ the file written with the mint\'s scope and NO type; the row\'s shape = the person\'s, typeless; the pool may place it', { c1: c1 && Object.keys(c1.claudeAiOauth), shape: row().oatShape, wall: am.placeWallOf(id) });
  await am.setOatShapeByPerson(id, PN.choiceShape('ultra', CAT, { scopes: S, now: NOW }));
  const c2 = cred();
  ok(c2.claudeAiOauth.subscriptionType === 'max' && c2.claudeAiOauth.rateLimitTier === 'default_claude_max_20x' && row().oatShape?.type === 'max' && row().oatShape?.tier === 'default_claude_max_20x' && !row().oatShape?.typeless, 'a changed choice (Ultra) is written again in place — the row\'s line is the door to change it');
  let refusedBad = null; try { await am.setOatShapeByPerson(id, { scopes: [] }); } catch (e) { refusedBad = e.code; }
  ok(refusedBad === 'bad_shape', 'a shape the grammar refuses ⇒ bad_shape, nothing written', refusedBad);
  // a SIGN-IN states the shape: it replaces the person's choice, said once
  const H = 3600e3;
  fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'acc-x', refreshToken: 'ref-x', expiresAt: Date.now() + H, refreshTokenExpiresAt: Date.now() + 20 * 24 * H, scopes: ['user:inference', 'user:profile'], subscriptionType: 'pro' } }), { mode: 0o600 });
  const logs = []; const cl = console.log; console.log = (...a) => { logs.push(a.join(' ')); };
  try { await am.syncOatFile(id); } finally { console.log = cl; }
  const r3 = row();
  ok(r3.oatShape?.source === 'login' && r3.oatShape?.type === 'pro' && r3.oatShapeReplaced?.type === 'max' && logs.filter((l) => /a sign-in stated the subscription type \(pro\) — it replaces the one chosen by hand \(max\)/.test(l)).length === 1, 'a SIGN-IN replaces the person\'s choice: source login, the row says what it replaced (7 days), ONE journal line', { shape: r3.oatShape, replaced: r3.oatShapeReplaced, logs });
  logs.length = 0; console.log = (...a) => { logs.push(a.join(' ')); };
  try { await am.syncOatFile(id); } finally { console.log = cl; }
  ok(!logs.some((l) => /replaces the one chosen by hand/.test(l)), '…said ONCE: the next sweep says nothing again');
  let refusedLogin = null; try { await am.setOatShapeByPerson(id, PN.choiceShape('pro', CAT, { scopes: S })); } catch (e) { refusedLogin = e.code; }
  ok(refusedLogin === 'from_login', 'a shape a sign-in stated is not re-chosen by hand (from_login — a sign-in again states it)', refusedLogin);
  // export / import carry the provenance
  const id2 = am.createSubscription({ name: 'Token Two' }).id;
  am.setOat(id2, OAT.replace('ADDfake_', 'ADDfak2_')); await am.oatFileSettled(id2);
  await am.setOatShapeByPerson(id2, PN.choiceShape('unsure', CAT, { scopes: S }));
  const bundle = am.exportBundle();
  const rec = (bundle.accounts || []).find((x) => x.name === 'Token Two');
  ok(!!rec && rec.oatShapeSource === 'person' && rec.oatShape?.typeless === true && Number(rec.oatShapeAt) > 0, 'export carries the shape + whose word it is + when', rec && { s: rec.oatShapeSource, sh: rec.oatShape });
  const am2 = new AccountManager({ dataDir: path.join(tmp, 'data-import'), platform: 'linux' });
  am2.importBundle(bundle); await am2.oatFileSettled();
  const imp = am2.list().accounts.find((a) => a.name === 'Token Two');
  ok(!!imp && imp.oatShape?.source === 'person' && imp.oatShape?.typeless === true, 'import keeps the person\'s typeless choice as the person\'s (never upgraded to a sign-in\'s)', imp && imp.oatShape);
  let noTok = null; const id3 = am.createSubscription({ name: 'No Token' }).id; try { await am.setOatShapeByPerson(id3, PN.choiceShape('pro', CAT, { scopes: S })); } catch (e) { noTok = e.code; }
  ok(noTok === 'no_token', 'a row with no long-lived token ⇒ no_token', noTok);
}

console.log('§7 the doors');
{
  // THE ROUTES AS THEY ARE (src/server/oat-shape-routes.js, mounted by account-usage-routes) over a scratch store and stated plan values
  const R = fs.readFileSync(path.join(REPO, 'src/server/oat-shape-routes.js'), 'utf8');
  const get = R.slice(R.indexOf("app.get('/api/accounts/:id/oat-shape'"), R.indexOf("app.post('/api/accounts/:id/oat-shape'"));
  const post = R.slice(R.indexOf("app.post('/api/accounts/:id/oat-shape'"));
  ok(/^app\.get\('\/api\/accounts\/:id\/oat-shape', \(req, res\) => \{\n    if \(isAgentBearer\(req\)\) return res\.status\(403\)/.test(get) && /^app\.post\('\/api\/accounts\/:id\/oat-shape', async \(req, res\) => \{\n    if \(isAgentBearer\(req\)\) return res\.status\(403\)/.test(post), 'both routes refuse an agent\'s bearer FIRST (a person\'s door)');
  ok(/require\('\.\/oat-shape-routes\.js'\)\.registerOatShapeRoutes\(app, \{ accounts, isAgentBearer \}\);/.test(fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8')), 'the hub mounts them (account-usage-routes, behind the auth gate like every account route)');
  const express = require(path.join(REPO, 'node_modules/express'));
  const http = require('node:http');
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const { registerOatShapeRoutes } = require(path.join(REPO, 'src/server/oat-shape-routes.js'));
  const am = new AccountManager({ dataDir: path.join(tmp, 'data-routes'), platform: 'linux' });
  const id = am.createSubscription({ name: 'Route Row' }).id;
  am.noteCliVersion('2.1.321 (Claude Code)'); await am.oatFileSettled();
  am.setOat(id, OAT.replace('ADDfake_', 'ADDrout_')); await am.oatFileSettled(id);
  let PL = { cli: '2.1.321', anchor: true, ...CAT, withheld: ['default_claude_zero'] };
  const app = express(); app.use(express.json());
  registerOatShapeRoutes(app, { accounts: am, isAgentBearer: (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String(req.headers.authorization || '')), plans: () => PL });
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const U = 'http://127.0.0.1:' + srv.address().port + '/api/accounts/' + id + '/oat-shape';
  const call = async (method, body, headers = {}) => { const r = await fetch(U, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, j: await r.json() }; };
  try {
    const g = await call('GET');
    ok(g.status === 200 && g.j.choices.map((c) => c.choice).join(' ') === 'ultra max pro type:enterprise type:team unsure' && g.j.cli === '2.1.321' && !g.j.why && g.j.shape === null, 'GET: the choices THIS CLI offers, no shape yet', g.j);
    const ag = await call('POST', { choice: 'unsure' }, { authorization: 'Bearer ' + ['vs', 'st_'].join('') + 'x' });
    ok(ag.status === 403 && ag.j.code === 'agent_forbidden', 'POST with an agent\'s bearer ⇒ 403 agent_forbidden', ag);
    const bad = await call('POST', { choice: '__proto__' });
    ok(bad.status === 400 && bad.j.code === 'bad_choice', 'POST a choice outside the grammar ⇒ 400 bad_choice', bad);
    const p1 = await call('POST', { choice: 'unsure' });
    ok(p1.status === 200 && p1.j.success && p1.j.shape?.typeless === true && p1.j.shape?.source === 'person' && p1.j.oatFile === 'materialize', 'POST «先不选» ⇒ the shape stored as the person\'s, the file written (oatFile: materialize)', p1);
    PL = { cli: '2.1.321', anchor: false, types: [], tiers: [], withheld: [], orgTypes: {} };
    const g2 = await call('GET'); const p2 = await call('POST', { choice: 'pro' });
    ok(g2.j.choices.length === 0 && g2.j.why === 'no-types' && p2.status === 409 && p2.j.code === 'not_offered' && p2.j.why === 'no-types', 'a binary whose values were not read ⇒ no choice, `why` named, POST 409 not_offered', { g2: g2.j, p2 });
    PL = { cli: '2.1.320', ...CAT };
    const g3 = await call('GET');
    ok(g3.j.choices.length === 0 && g3.j.why === 'version-mismatch', 'plan values of another version than the mint\'s ⇒ no choice (version-mismatch)', g3.j);
  } finally { srv.close(); }
  const MA = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  ok(/if \(reason === 'no-scopes'\) return t\('the subscription type is missing — sign in once, or choose it'\)/.test(MA) && !/mint again to record the subscription type/.test(MA), 'the row\'s refusal words: «sign in once, or choose it» — never «mint again» / «re-login» alone');
  ok(/if \(r\.oatFile === 'no-scopes'\) \{ shut\(\); refresh\?\.\(\); openOatShapeDialog\(\{ id, name, fresh: true/.test(MA), 'a pasted token that states no type opens the guide — never «now usable on any machine»');
  ok(/if \(chip\.dataset\.oatShape\) \{ openOatShapeDialog\(/.test(MA) && /label: t\('Subscription type…'\)/.test(MA), 'the row\'s chip and its ⋯ menu open the guide (the choice stays changeable at the row)');
  const D = fs.readFileSync(path.join(REPO, 'src/lib/oat-shape-dialog.js'), 'utf8');
  const signAt = D.indexOf("t('Sign in once (recommended)')"), pickAt = D.indexOf("t('Choose it myself')");
  ok(signAt > 0 && pickAt > signAt, 'way ① «Sign in once (recommended)» comes FIRST, way ② «Choose it myself» second');
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const K = ['Sign in once (recommended)', 'Choose it myself', 'Not sure — choose later', '{name} (formerly {old})', 'the subscription type is missing — sign in once, or choose it',
    'The subscription type decides which model Claude Code uses when none is picked, and which features Claude Code opens for that subscription; a wrong choice can be changed on this row.'];
  ok(zh[K[0]] === '登录一次（推荐）' && zh[K[1]] === '我自己选' && zh[K[2]] === '不确定 — 先不选' && zh[K[3]] === '{name}（原 {old}）' && zh[K[4]] === '还差订阅类型：登录一次，或自己选' && zh[K[5]] === '订阅类型决定没选模型时用哪个默认模型，以及 Claude Code 为该订阅开放的功能；选错了可以在这一行改。', 'the owner\'s words, verbatim in zh');
  const keys = [...new Set([...D.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1].replace(/\\'/g, "'")))];
  const missing = keys.filter((k) => !zh[k] || !ja[k]);
  ok(keys.length >= 20 && !missing.length, `every word of the dialog has zh + ja (${keys.length})`, missing);
  ok(!keys.some((k) => /re-login|mint again/i.test(k)), 'no word of the dialog says «re-login» or «mint again»');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
