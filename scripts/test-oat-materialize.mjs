#!/usr/bin/env node
// THE MATERIALIZED LONG-LIVED TOKEN (lane pool-oat-materialize, design q-035 A, B-b928;
// measured GO on CLI 2.1.296 — scripts/fixtures/oat-in-file.json). A pooled session's CLI
// reads its member's credential FILE through a symlink, so a token that lives only in
// accounts.json can never serve it. For a member with NO usable login, accounts.setOat also
// writes the row's oat into <member dir>/.credentials.json in the CLI's measured login shape
// (expiresAt = mint + OAT_TTL, the row's scopes / subscriptionType, NO refreshToken, our
// `vibespaceOat` mark) through account-material's ONE 0600 atomic writer.
//   §1 PURE: the verdict table (keep-login / materialize / written / none / no-scopes /
//      cli-unmeasured), the file's login state (oat-only, dated by the token), the shape
//   §2 THE STORE (real AccountManager, scratch data dir): archive-then-write, keep-login
//      byte-identical, no-scopes, re-mint, idempotence, clear removes ONLY ours, a CLI login
//      on top is never removed, the token's death, the CLI version flipping, a failed write
//   §3 THE POOL: the member is a normal slot (members, rank, no escape), the hot switch is the
//      ordinary re-point (utimes), attribution by slot (the ledger), the slot law unchanged
//   §4 THE SPAWN: the file, not CLAUDE_CODE_OAUTH_TOKEN; without it today's env road
//   §5 THE DOORS: the row / pool fields, the client chip + the pool model, the words in zh / ja
//   §6 oat-file-sync: the hub's CLI version through machine-probes gates it
//   §7 VERIFY R1 (pool-oat-verify REFUTED 4c1be7e0e): F1 the CLI's other keys kept, F2 a failed read
//      refused by name, F3 ours by the mark (a re-mint swaps in place), F4 an undecryptable token moves
//      nothing, F5 an unmeasured CLI keeps a linked member's file and places nothing new, F7 the fresh-stat
//      guard, F8 a symlinked member dir, F9 a build suffix, F10 no usage bearer, F11 the export carries
//      the token once, F12 a merge moves the archives, F13 the sweep never blocks the loop
// RED controls: one mutant per invariant (the verdict, the archive, the cleanup, the spawn,
// the slot law, the capability gate) and per verify-r1 finding. The secret's spies + the one-writer
// census (behaviour + structure) live in test-oat-mint §8. In-process, no network, no real CLI.
// The store's file acts are ASYNC (one queue, fs.promises): every act here is awaited (so / nv / co).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LE = require(path.join(REPO, 'src/login-expiry.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const Module = require('node:module');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const T0 = Date.now();
const H = 3600e3, DAY = 24 * H;
// token shapes built at runtime, never a literal
const OAT = ['sk', '-ant-oat01-'].join('') + 'MATfake_' + 'q7R2'.repeat(12) + '-zz';
const OAT2 = ['sk', '-ant-oat01-'].join('') + 'MATfake2_' + 'w9K4'.repeat(12) + '-yy';
const SHAPE = { scopes: ['user:inference', 'user:profile', 'user:sessions:claude_code', 'user:mcp_servers'], subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' };
const login = (now, { dead = false, wiped = false } = {}) => ({ claudeAiOauth: wiped
  ? { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: now - DAY, ...SHAPE }
  : { accessToken: 'acc-' + crypto.randomBytes(4).toString('hex'), refreshToken: 'ref-' + crypto.randomBytes(4).toString('hex'), expiresAt: now + (dead ? -2 * H : H), refreshTokenExpiresAt: now + (dead ? -H : 20 * DAY), ...SHAPE } });
// the store's file acts run on its queue: these await them (setOat / noteCliVersion / clearOat stay synchronous calls)
const so = async (am, id, t) => { const r = am.setOat(id, t); const f = await am.oatFileSettled(id); return { ...r, oatFile: f && f.verdict }; };
const nv = async (am, v) => { const c = am.noteCliVersion(v); await am.oatFileSettled(); return c; };
const co = async (am, id) => { am.clearOat(id); await am.oatFileSettled(); };
// a mutant STORE: accounts.js compiled with text replaced, its account-material / login-expiry swapped for
// mutated copies (scratch files) — null when an anchor is missing. `tmp` exists by the first call (§2).
const mutantStore = ({ acc = [], mat = [], le = [] } = {}) => {
  const patch = (rel, reps) => { let src = fs.readFileSync(path.join(REPO, rel), 'utf8'); for (const [a, b] of reps) { if (!src.includes(a)) return null; src = src.replace(a, b); } return src; };
  const accSrc = patch('src/accounts.js', acc), matSrc = patch('src/account-material.js', mat), leSrc = patch('src/login-expiry.js', le);
  if (accSrc == null || matSrc == null || leSrc == null) return null;
  const dir = fs.mkdtempSync(path.join(tmp, 'mut-'));
  const matP = path.join(dir, 'account-material.js'), leP = path.join(dir, 'login-expiry.js');
  fs.writeFileSync(matP, matSrc); fs.writeFileSync(leP, leSrc);
  const src = accSrc.split("require('./account-material.js')").join(`require(${JSON.stringify(matP)})`).split("require('./login-expiry.js')").join(`require(${JSON.stringify(leP)})`);
  const file = path.join(REPO, 'src/accounts.js');
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file); return m.exports;
};
const compileWith = (rel, from, to) => {
  const file = path.join(REPO, rel);
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes(from)) return null;
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src.replace(from, to), file); return m.exports;
};

console.log('§1 PURE — the verdict table, the file\'s login state, the shape');
const NOW = T0;
const caps = { ok: true };
const V = (m) => LE.materializeVerdict({ caps, shape: SHAPE, oat: { present: true, validUntil: NOW + 300 * DAY }, fileState: 'present', ...m }, NOW);
const oursFile = LE.oatFileBody(OAT, { expiresAt: NOW + 300 * DAY, shape: SHAPE, mintedAt: NOW - 65 * DAY });
const TABLE = [
  ['no token ⇒ none', { oat: null, fileState: 'absent', file: null }, { verdict: 'none', archive: false, cleanup: false }],
  ['an expired token + our file ⇒ none, cleanup ours', { oat: { present: true, validUntil: NOW - 1 }, file: oursFile, ours: true }, { verdict: 'none', archive: false, cleanup: true }],
  ['a live login (refresh token, 20 d left) ⇒ keep-login', { file: login(NOW) }, { verdict: 'keep-login', archive: false, cleanup: false }],
  ['an expiring login (refresh token, 3 h left) ⇒ keep-login', { file: { claudeAiOauth: { ...login(NOW).claudeAiOauth, refreshTokenExpiresAt: NOW + 3 * H } } }, { verdict: 'keep-login', archive: false, cleanup: false }],
  ['a login with no readable deadline (\'unknown\') ⇒ keep-login (no claim never overwrites)', { file: { claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: NOW + H } } }, { verdict: 'keep-login', archive: false, cleanup: false }],
  ['a CLI login on top of our file (mark kept, a refresh token) ⇒ keep-login, never ours', { file: { ...login(NOW), vibespaceOat: { v: 1 } } }, { verdict: 'keep-login', archive: false, cleanup: false }],
  ['a dead login (deadline passed) ⇒ materialize, archive first', { file: login(NOW, { dead: true }) }, { verdict: 'materialize', archive: true, cleanup: false }],
  ['a wiped login (tokens blanked, scopes kept) ⇒ materialize, archive first', { file: login(NOW, { wiped: true }) }, { verdict: 'materialize', archive: true, cleanup: false }],
  ['no file ⇒ materialize, nothing to archive', { fileState: 'absent', file: null }, { verdict: 'materialize', archive: false, cleanup: false }],
  ['an unreadable file ⇒ materialize, archive its bytes first', { fileState: 'unreadable', file: null }, { verdict: 'materialize', archive: true, cleanup: false }],
  ['our file, already exactly this ⇒ written', { file: oursFile, ours: true, current: true }, { verdict: 'written', archive: false, cleanup: false }],
  ['our file, an older token / date ⇒ materialize, no archive (ours is replaced)', { file: oursFile, ours: true, current: false }, { verdict: 'materialize', archive: false, cleanup: false }],
  ['a marked file holding ANOTHER token (not ours) ⇒ materialize, archive first', { file: LE.oatFileBody(OAT2, { expiresAt: NOW + DAY, shape: SHAPE }) }, { verdict: 'materialize', archive: true, cleanup: false }],
  ['this CLI unmeasured ⇒ cli-unmeasured, nothing written', { caps: { ok: false }, file: login(NOW, { dead: true }) }, { verdict: 'cli-unmeasured', archive: false, cleanup: false }],
  ['this CLI unmeasured + our file ⇒ cli-unmeasured, cleanup ours', { caps: { ok: false, known: true }, file: oursFile, ours: true, current: true }, { verdict: 'cli-unmeasured', archive: false, cleanup: true }],
  ['the CLI version UNKNOWN (a probe that failed) + our file ⇒ nothing written, nothing taken back', { caps: { ok: false, known: false }, file: oursFile, ours: true, current: true }, { verdict: 'cli-unmeasured', archive: false, cleanup: false }],
  ['no subscription shape known ⇒ no-scopes, nothing written', { shape: null, fileState: 'absent', file: null }, { verdict: 'no-scopes', archive: false, cleanup: false }],
  ['a live login wins over an unmeasured CLI (keep-login first)', { caps: { ok: false }, file: login(NOW) }, { verdict: 'keep-login', archive: false, cleanup: false }],
  // verify r1 (pool-oat-verify, 4c1be7e0e REFUTED)
  ['F2: a READ that failed (EACCES / EIO / EMFILE …) ⇒ read-failed: nothing archived, nothing written', { fileState: 'read-failed', file: null }, { verdict: 'read-failed', archive: false, cleanup: false }],
  ['F8: the member dir is a symlink ⇒ dir-symlink, nothing written through it', { dirState: 'symlink', fileState: 'absent', file: null }, { verdict: 'dir-symlink', archive: false, cleanup: false }],
  ['F4: a stored token that does not DECRYPT ⇒ none (oat-unreadable): nothing archived, written or removed', { oat: { present: true, validUntil: NOW + 300 * DAY, readable: false }, file: oursFile, ours: true, current: false }, { verdict: 'none', archive: false, cleanup: false, reason: 'oat-unreadable' }],
  ['F3: a STALE ours (an older token of this row) on an UNKNOWN CLI ⇒ replaced in place (the window stops writes, never the swap)', { caps: { ok: false, known: false }, file: oursFile, ours: true, current: false }, { verdict: 'materialize', archive: false, cleanup: false }],
  ['F5: a KNOWN unmeasured CLI + ours + a link names the member ⇒ cli-unmeasured, HELD (the file stays)', { caps: { ok: false, known: true }, file: oursFile, ours: true, current: true, linked: true }, { verdict: 'cli-unmeasured', archive: false, cleanup: false, held: true }],
  ['F5: …a STALE ours there, linked ⇒ replaced in place (the sessions on it keep a valid token)', { caps: { ok: false, known: true }, file: oursFile, ours: true, current: false, linked: true }, { verdict: 'materialize', archive: false, cleanup: false }],
  ['F5: …a stale ours, no link ⇒ cli-unmeasured, cleanup ours', { caps: { ok: false, known: true }, file: oursFile, ours: true, current: false, linked: false }, { verdict: 'cli-unmeasured', archive: false, cleanup: true }],
  ['F1: a file holding only the CLI\'s other keys (mcpOAuth, no login) ⇒ materialize, NOTHING archived (merged in place)', { file: { mcpOAuth: { 'srv|1': { accessToken: 'm' } } } }, { verdict: 'materialize', archive: false, cleanup: false }],
];
const runTable = (fn) => TABLE.map(([name, m, want]) => { const got = fn({ caps, shape: SHAPE, oat: { present: true, validUntil: NOW + 300 * DAY }, fileState: 'present', ...m }, NOW); return { name, ok: JSON.stringify(got) === JSON.stringify(want), got, want }; });
for (const r of runTable(LE.materializeVerdict)) ok(r.ok, 'verdict: ' + r.name, r.ok ? undefined : { got: r.got, want: r.want });
{
  const f = LE.loginState(oursFile, NOW);
  ok(f.state === 'oat-only' && f.oatFile === true && f.login === 'none' && f.oatValidUntil === NOW + 300 * DAY && f.msLeft === 300 * DAY && f.refreshExpiresAt === null, 'our file reads oat-only — dated by ITS expiresAt (the token\'s death), login none, oatFile', f);
  ok(LE.loginUsable(f) && LE.loginRank(f) === 1 && LE.loginSwitchTarget(f), '…usable, a switch target, ranked below an equal healthy login (rank 1)');
  const near = LE.loginState(LE.oatFileBody(OAT, { expiresAt: NOW + 10 * 60e3, shape: SHAPE }), NOW);
  ok(near.state === 'oat-only' && !LE.loginSwitchTarget(near) && LE.loginRank(near) === 2, 'inside its last 30 min it is never MOVED onto (the NEAR rule counts the token)');
  const gone = LE.loginState(LE.oatFileBody(OAT, { expiresAt: NOW - 1, shape: SHAPE }), NOW);
  ok(gone.state === 'expired' && gone.oatExpired === true && !LE.loginUsable(gone), 'after expiresAt it is expired — dead, never a candidate', gone);
  ok(LE.warnStageFor(f) === null && LE.warnStageFor({ ...f, msLeft: 5 * H }) === '24h' && LE.warnStageFor({ ...f, msLeft: 0.5 * H }) === '1h', 'its ladder: no LOW "login ended" rung (there is no login), the token\'s own 24h / 1h rungs');
  ok(LE.warnStageFor({ state: 'oat-only', msLeft: 30 * DAY }) === 'oat-only', '…while a ROW\'s oat-only (dead login + token) keeps its LOW rung (unchanged)');
  const noMark = { claudeAiOauth: { accessToken: OAT, expiresAt: NOW + DAY, ...SHAPE } };
  ok(LE.loginState(noMark, NOW).state === 'unknown' && !LE.loginState(noMark, NOW).oatFile, 'the same shape WITHOUT our mark stays \'unknown\' (every other file reads as before)');
  ok(LE.oatFileOf({ ...login(NOW), vibespaceOat: { v: 1 } }) === null, 'a marked file WITH a refresh token is not ours (a CLI login spreads the mark along)');
  const body = LE.oatFileBody(OAT, { expiresAt: NOW + 9, shape: SHAPE, mintedAt: 7 });
  ok(JSON.stringify(Object.keys(body.claudeAiOauth)) === JSON.stringify(['accessToken', 'expiresAt', 'scopes', 'subscriptionType', 'rateLimitTier']) && !('refreshToken' in body.claudeAiOauth) && body.vibespaceOat.v === 1, 'the body = the measured shape (accessToken, expiresAt, scopes, subscriptionType, rateLimitTier) + our mark — no refreshToken key at all', body.claudeAiOauth && Object.keys(body.claudeAiOauth));
  ok(JSON.stringify(LE.oatShapeOf(login(NOW, { wiped: true }))) === JSON.stringify(SHAPE) && LE.oatShapeOf({ claudeAiOauth: { accessToken: 'a', expiresAt: 1 } }) === null, 'the shape reads off a wiped login\'s residue; a file without scopes / subscriptionType has none');
  // RED: a verdict that forgets the live login overwrites it
  const mut = compileWith('src/login-expiry.js', "loginUsable(loginFileState(f, now))) return { verdict: 'keep-login'", "false) return { verdict: 'keep-login'");
  const red = mut ? runTable(mut.materializeVerdict).filter((r) => !r.ok).map((r) => r.name) : null;
  ok(!!red && red.some((n) => /live login/.test(n)), 'RED control (invariant 4): a verdict without the keep-login rung overwrites a live login — the table catches it', red);
  const mut3 = compileWith('src/login-expiry.js', "return { verdict: 'cli-unmeasured', archive: false, cleanup: ours && known };", "return { verdict: 'cli-unmeasured', archive: false, cleanup: ours };");
  const red3 = mut3 ? runTable(mut3.materializeVerdict).filter((r) => !r.ok).map((r) => r.name) : null;
  ok(!!red3 && red3.some((n) => /UNKNOWN/.test(n)), 'RED control (layer 2): a verdict that cleans up on an UNKNOWN CLI would take files back on a failed probe — caught', red3);
  const mut2 = compileWith('src/login-expiry.js', "archive: !ours && (m.fileState === 'unreadable' || !!o)", 'archive: false');
  const red2 = mut2 ? runTable(mut2.materializeVerdict).filter((r) => !r.ok).map((r) => r.name) : null;
  ok(!!red2 && red2.some((n) => /dead login/.test(n)), 'RED control (invariant 4): a verdict that never archives would lose a dead login — caught', red2);
  // verify r1: each new rung, removed, turns its row RED
  for (const [what, from, to, re] of [
    ['F2 (a failed read archived like unreadable bytes)', "  if (m.fileState === 'read-failed') return { verdict: 'read-failed', archive: false, cleanup: false };\n", '', /^F2:/],
    ['F8 (a symlinked dir written through)', "  if (m.dirState === 'symlink') return { verdict: 'dir-symlink', archive: false, cleanup: false };\n", '', /^F8:/],
    ['F4 (an undecryptable token treated as present)', "  if (m.oat && m.oat.present && m.oat.readable === false) return { verdict: 'none', archive: false, cleanup: false, reason: 'oat-unreadable' };\n", '', /^F4:/],
    ['F3 (a stale ours left in the unknown window)', '    if (ours && !m.current && shaped && !(known && !m.linked)) return { verdict: \'materialize\', archive: false, cleanup: false };\n', '', /^F3:/],
    ['F5 (a linked member\'s file taken back)', "    if (ours && known && m.linked) return { verdict: 'cli-unmeasured', archive: false, cleanup: false, held: true };\n", '', /^F5: a KNOWN/],
    ['F1 (any file there archived)', "archive: !ours && (m.fileState === 'unreadable' || !!o)", "archive: !ours && m.fileState !== 'absent'", /^F1:/],
  ]) {
    const mu = compileWith('src/login-expiry.js', from, to);
    const r = mu ? runTable(mu.materializeVerdict).filter((x) => !x.ok).map((x) => x.name) : null;
    ok(!!r && r.some((n) => re.test(n)), `RED control (verify r1 ${what}) — its row goes RED`, r);
  }
}

console.log('§2 THE STORE — real AccountManager over a scratch data dir');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oat-mat-'));
const credsOf = (am, id) => path.join(am.subDir(id), '.credentials.json');
const readJ = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const sha = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; } };
const modeOf = (p) => (fs.statSync(p).mode & 0o777).toString(8);
const put = (am, id, o) => fs.writeFileSync(credsOf(am, id), JSON.stringify(o), { mode: 0o600 });
const archives = (am, id) => fs.readdirSync(am.subDir(id)).filter((f) => /^\.credentials\.json\.dead-\d+(-\d+)?$/.test(f));
const am = new AccountManager({ dataDir: path.join(tmp, 'data') });
const dead = am.createSubscription({ name: 'Dead Max' }).id;
const live = am.createSubscription({ name: 'Live Max' }).id;
const wiped = am.createSubscription({ name: 'Wiped Max' }).id;
const never = am.createSubscription({ name: 'Never signed in' }).id;
put(am, dead, login(NOW, { dead: true })); put(am, live, login(NOW)); put(am, wiped, login(NOW, { wiped: true }));
const deadBytes = sha(credsOf(am, dead)), liveBytes = sha(credsOf(am, live));
{
  const r = await so(am, dead, OAT);
  ok(am.oatFileCaps().ok === false && r.oatFile === 'cli-unmeasured' && sha(credsOf(am, dead)) === deadBytes && !archives(am, dead).length, 'no CLI version known ⇒ the capability gate is shut: setOat stores the token, writes NOTHING (cli-unmeasured)', r);
  const c = await nv(am, '2.1.296 (Claude Code)');
  ok(c.ok === true && c.cli === '2.1.296' && c.measured === '2.1.296' && c.changed === true, 'the hub\'s CLI = the measured 2.1.296 ⇒ oatInFile true (cli-caps over the committed fixture), and the rows re-sync', c);
  const arch = archives(am, dead);
  const f = readJ(credsOf(am, dead));
  const a = am.get(dead);
  ok(arch.length === 1 && sha(path.join(am.subDir(dead), arch[0])) === deadBytes && modeOf(path.join(am.subDir(dead), arch[0])) === '600', 'the DEAD login is archived first — .credentials.json.dead-<ms>, byte-identical, 0600 (never deleted)', arch);
  ok(!!f && f.claudeAiOauth.accessToken === OAT && !('refreshToken' in f.claudeAiOauth) && f.claudeAiOauth.expiresAt === a.oatMintedAt + am.OAT_TTL_MS && JSON.stringify(f.claudeAiOauth.scopes) === JSON.stringify(SHAPE.scopes) && f.claudeAiOauth.subscriptionType === 'max' && f.claudeAiOauth.rateLimitTier === SHAPE.rateLimitTier && f.vibespaceOat && f.vibespaceOat.mintedAt === a.oatMintedAt, '…then the file: the oat, expiresAt = mint + OAT_TTL, the row\'s scopes / subscriptionType / rateLimitTier, NO refreshToken, our mark', f && { ...f, claudeAiOauth: { ...f.claudeAiOauth, accessToken: '…' } });
  ok(modeOf(credsOf(am, dead)) === '600' && modeOf(am.subDir(dead)) === '700' && !fs.readdirSync(am.subDir(dead)).some((n) => n.endsWith('.tmp')), 'file 0600, dir 0700, no tmp left behind (atomic: tmp `wx` + rename)');
  ok(JSON.stringify(a.oatShape) === JSON.stringify(SHAPE), 'the shape now rides on the row (it outlives the archived file it came from)', a.oatShape);
  const r2 = await so(am, live, OAT2);
  ok(r2.oatFile === 'keep-login' && sha(credsOf(am, live)) === liveBytes && !archives(am, live).length, 'a LIVE login is never touched (keep-login): its file byte-identical, nothing archived (decision 2)', r2);
  const r3 = await so(am, wiped, OAT);
  ok(r3.oatFile === 'materialize' && archives(am, wiped).length === 1 && readJ(credsOf(am, wiped))?.claudeAiOauth?.subscriptionType === 'max', 'a WIPED login: archived, then written with the shape its residue kept', r3);
  const r4 = await so(am, never, OAT);
  ok(r4.oatFile === 'no-scopes' && !fs.existsSync(credsOf(am, never)), 'a member that never signed in has no shape ⇒ no-scopes, nothing written (the CLI would read "Not logged in")', r4);
  const m1 = fs.statSync(credsOf(am, dead)).mtimeMs, ino1 = fs.statSync(credsOf(am, dead)).ino;
  const again = await am.syncOatFile(dead);
  ok(again.verdict === 'written' && !again.wrote && fs.statSync(credsOf(am, dead)).mtimeMs === m1 && fs.statSync(credsOf(am, dead)).ino === ino1, 'idempotent: a second sync finds it written and writes nothing', again);
  const r5 = await so(am, dead, OAT2);
  ok(r5.oatFile === 'materialize' && readJ(credsOf(am, dead))?.claudeAiOauth?.accessToken === OAT2 && archives(am, dead).length === 1, 'a RE-MINT replaces OUR file in place (no second archive — ours is not a login)', r5);
}
{
  // cleanup deletes ONLY ours
  await co(am, dead);
  ok(!fs.existsSync(credsOf(am, dead)) && archives(am, dead).length === 1, 'clearOat removes OUR file; the archived dead login stays');
  const r = await so(am, dead, OAT);
  ok(r.oatFile === 'materialize' && readJ(credsOf(am, dead))?.claudeAiOauth?.accessToken === OAT, '…a new mint writes it again (the shape from the row)', r);
  // the person signs this member in on top of our file — the CLI spreads the store, the mark rides along
  const relog = { ...readJ(credsOf(am, dead)), claudeAiOauth: login(NOW).claudeAiOauth };
  put(am, dead, relog);
  const relogBytes = sha(credsOf(am, dead));
  const s = await am.syncOatFile(dead);
  await co(am, dead);
  ok(s.verdict === 'keep-login' && sha(credsOf(am, dead)) === relogBytes, 'a CLI login on top of our file (mark kept + a refresh token) is the authority: kept by the sync AND by clearOat', s);
  ok(am.loginStateOf(dead, Date.now(), { slot: true }).state === 'ok' && !am.loginStateOf(dead, Date.now(), { slot: true }).oatFile, '…and it reads as the login it is');
  // the token's death
  put(am, dead, login(NOW, { dead: true }));
  await so(am, dead, OAT);
  ok(readJ(credsOf(am, dead))?.claudeAiOauth?.accessToken === OAT, '(re-armed: dead login archived, token written)');
  am.get(dead).oatMintedAt = Date.now() - am.OAT_TTL_MS - 1000;
  const e = await am.syncOatFile(dead);
  ok(e.verdict === 'none' && e.removed === true && !fs.existsSync(credsOf(am, dead)), 'the token ENDED ⇒ none ⇒ our file goes (archives stay)', e);
  ok(archives(am, dead).length >= 2, '…every dead login it ever replaced is still on disk', archives(am, dead));
  // RED: a cleanup that ignores ownership deletes the login
  // two layers ask "ours?": the store's verdict and the remover itself, on the bytes it is about to remove (verify r1 F6)
  const OURS_ALL = ['const ours = oatFileOurs(seen.file, id);', 'const ours = !!seen.file;'];
  const NO_ASK = ["if (seen.fileState !== 'present' || !isOurs(seen.file)) throw", "if (seen.fileState !== 'present') throw"];
  const liveAfter = async (M, tag) => {
    const amM = new M.AccountManager({ dataDir: path.join(tmp, 'data-mut-' + tag) });
    const x = amM.createSubscription({ name: 'Mut' }).id;
    put(amM, x, login(NOW)); const b = sha(credsOf(amM, x));
    await nv(amM, '2.1.296'); await so(amM, x, OAT); await co(amM, x);
    return sha(credsOf(amM, x)) === b;
  };
  const mA = mutantStore({ acc: [OURS_ALL] }), mB = mutantStore({ acc: [OURS_ALL], mat: [NO_ASK] });
  if (mA && mB) {
    ok(await liveAfter(mA, 'a'), 'a store whose verdict calls every file ours still leaves a LIVE login byte-identical — the remover asks "ours?" again on the bytes it would remove');
    ok(!(await liveAfter(mB, 'b')), 'RED control (invariant 4): …and with the remover\'s own question gone too, the LIVE login is destroyed — the byte check above catches exactly that');
  } else ok(false, 'RED control anchors present (accounts.js ours / account-material remover)');
}
{
  // the CLI version flips to an unmeasured one ⇒ the store takes its files back
  const am2 = new AccountManager({ dataDir: path.join(tmp, 'data2') });
  const m = am2.createSubscription({ name: 'Dead Two' }).id;
  put(am2, m, login(NOW, { dead: true }));
  await nv(am2, '2.1.296');
  await so(am2, m, OAT);
  ok(readJ(credsOf(am2, m))?.claudeAiOauth?.accessToken === OAT, '(2.1.296: written)');
  const c = await nv(am2, '2.1.300 (Claude Code)');
  ok(c.ok === false && c.changed && !fs.existsSync(credsOf(am2, m)) && archives(am2, m).length === 1, 'the hub moves to an UNMEASURED 2.1.300 ⇒ our file is removed (today\'s behaviour returns), the archive stays', c);
  const row = am2.list().accounts.find((a) => a.id === m);
  ok(row.oatFile && row.oatFile.state === 'refused' && row.oatFile.reason === 'cli-unmeasured' && row.oatFile.cli === '2.1.300', 'the row says why: refused · cli-unmeasured · CLI 2.1.300', row.oatFile);
  // a failed write leaves the token working on today's env road
  const open0 = fs.promises.open; // inject the failure at the writer's own O_EXCL open (the owner could chmod a 0500 dir back)
  fs.promises.open = function (p, flags, ...r) { if (flags === 'wx' && String(p).startsWith(am2.subDir(m) + path.sep)) return Promise.reject(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })); return open0.call(this, p, flags, ...r); };
  let w = null, sp = null;
  try { await nv(am2, '2.1.296'); w = await am2.syncOatFile(m); sp = am2.resolveForSpawn(m); } finally { fs.promises.open = open0; }
  ok(w && w.verdict === 'write-failed' && /^E/.test(w.code || '') && sp.localEnv.CLAUDE_CODE_OAUTH_TOKEN === OAT && !sp.oatFile, 'a write that fails (EACCES) is said (write-failed) and the token keeps serving on the env road', { w, kind: sp.kind });
  // a fixture that names another version: the gate reads the fixture, not a wish
  const fx = path.join(tmp, 'fx.json');
  fs.writeFileSync(fx, JSON.stringify({ cliVersion: '9.9.9', variants: { 'oat-file': { verdict: 'PASS' }, 'oat-file-401': { verdict: 'PASS' }, 'oat-file-switch': { verdict: 'FAIL' } } }));
  const am3 = new AccountManager({ dataDir: path.join(tmp, 'data3'), oatFixture: fx });
  ok(am3.noteCliVersion('9.9.9').ok === false, 'a fixture whose oat-file-switch FAILED grants nothing for its own version (the three gate variants)');
  const amMac = new AccountManager({ dataDir: path.join(tmp, 'data-mac'), platform: 'darwin' });
  ok(amMac.noteCliVersion('2.1.296').ok === false, 'macOS: never (its CLI keys the keychain by the env string — the measurement is Linux, the pool\'s own platform rule)');
}
{
  // our token file is not a LOGIN where a login is the question
  const amL = new AccountManager({ dataDir: path.join(tmp, 'data-login') });
  await nv(amL, '2.1.296');
  const t = amL.createSubscription({ name: 'Token row' }).id;
  put(amL, t, login(NOW, { wiped: true })); await so(amL, t, OAT);
  ok(readJ(credsOf(amL, t))?.claudeAiOauth?.accessToken === OAT, '(the row holds our token file)');
  ok(amL.reloginResolve(t).outcome === 'pending', 'a re-login of that row stays PENDING until the CLI writes a real login (our file is not "signed in again")');
  const v = amL.evaluateOnHost(amL.get(t), null);
  ok(v.usable && v.how === 'oat', 'availability says it runs through its long-lived token (how: oat), not a login to ship', v);
  const f = amL.createSubscription({ name: 'Fresh login' }).id;
  put(amL, f, login(NOW));
  const fBytes = sha(credsOf(amL, f));
  amL.mergeSubscription(f, t); await amL.oatFileSettled();
  ok(sha(credsOf(amL, t)) === fBytes, 'merging a REAL login into the token row keeps the login (our file never outranks it)');
}

console.log('§3 THE POOL — a normal slot; the slot law unchanged by one character');
const amP = new AccountManager({ dataDir: path.join(tmp, 'data-pool') });
const A = amP.createSubscription({ name: 'Login A' }).id;
const O = amP.createSubscription({ name: 'Token O' }).id;
put(amP, A, login(NOW)); put(amP, O, login(NOW, { dead: true }));
await so(amP, O, OAT); // gate shut
const P = amP.createPool({ name: 'Pool' }).id;
{
  const esc = amP.poolLoginState(P);
  ok(esc.worstId === O && !!esc.worstOatValidUntil && esc.worstOatFileRefused === 'cli-unmeasured', 'gate shut: the pool still escapes O and says why (worstOatValidUntil + cli-unmeasured)', { worstId: esc.worstId, refused: esc.worstOatFileRefused });
  await nv(amP, '2.1.296');
  const st = amP.loginStateOf(O, Date.now(), { slot: true });
  ok(st.state === 'oat-only' && st.oatFile && LE.loginUsable(st), 'gate open: O\'s SLOT reads oat-only, usable — the file is the whole answer, as before');
  ok(amP.poolMembers(P).some((m) => m.id === O) && amP.isPoolMember(P, O), 'O is a candidate member (poolMembers / isPoolMember read the file the CLI reads)');
  const pl = amP.poolLoginState(P);
  ok(!pl.worstOatValidUntil && !pl.worstOatFileRefused, 'the escape is gone (no worstOatValidUntil — the pool row loses 「池用不了它的长期 token」)', pl);
  const slotsBefore = amP.slotTransitions.read?.() || null;
  const link = amP.ensureSessionPoolLink(P, 'sess-9-1791900000000', A, { why: 'spawn' });
  const credsViaLink = path.join(link, '.credentials.json');
  const mtA = fs.statSync(credsViaLink).mtimeMs;
  await new Promise((r) => setTimeout(r, 15));
  amP.ensureSessionPoolLink(P, 'sess-9-1791900000000', O, { why: 'pool-switch' });
  ok(fs.realpathSync(link) === fs.realpathSync(amP.subDir(O)) && readJ(credsViaLink)?.claudeAiOauth?.accessToken === OAT, 'the HOT SWITCH onto O is the ordinary re-point: the link names O\'s dir, the file through it is O\'s token');
  ok(fs.statSync(credsViaLink).mtimeMs > mtA, '…and the target\'s creds mtime moved (repointPoolSymlink\'s utimes — the measured next-turn follow)');
  const rows = fs.readFileSync(path.join(amP.dataDir, 'slot-transitions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const last = rows[rows.length - 1];
  ok(last.sessionId === 'sess-9-1791900000000' && last.from === A && last.to === O && last.why === 'pool-switch', 'attribution by SLOT holds: the ledger records A → O for this conversation (readings key on it)', last);
  void slotsBefore;
  // the slot law: byte-identical to rel267 (d5f352538)
  const src = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8'), mat = fs.readFileSync(path.join(REPO, 'src/account-material.js'), 'utf8');
  const fnText = (s, name) => { const i = s.indexOf('\n  ' + name + '('); if (i < 0) return ''; return s.slice(i + 1, s.indexOf('\n  }\n', i) + 4); };
  const fnTop = (s, name) => { const i = s.indexOf('\nfunction ' + name + '('); if (i < 0) return ''; return s.slice(i + 1, s.indexOf('\n}\n', i) + 2); };
  const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  const PIN = { ensureSessionPoolLink: 'ea444b5b7962469d', _noteSlot: 'f7c6d00977b723ab', setPoolTarget: '79b61f209800c3bc', repointPoolSymlink: '90eae116e782737a' };
  const now = { ensureSessionPoolLink: h(fnText(src, 'ensureSessionPoolLink')), _noteSlot: h(fnText(src, '_noteSlot')), setPoolTarget: h(fnText(src, 'setPoolTarget')), repointPoolSymlink: h(fnTop(mat, 'repointPoolSymlink')) };
  ok(JSON.stringify(now) === JSON.stringify(PIN), 'THE SLOT LAW (invariant 3): ensureSessionPoolLink / _noteSlot / setPoolTarget / repointPoolSymlink are byte-identical to rel267 (sha pins)', now);
  const mutated = h(fnText(src.replace("const from = this.poolCurrentFor(poolId, sessKey);", "const from = this.poolCurrentFor(poolId, sessKey) ;"), 'ensureSessionPoolLink'));
  ok(mutated !== PIN.ensureSessionPoolLink, 'RED control: one added character in ensureSessionPoolLink moves its pin');
  // its death: an expired file leaves the candidate list through the slot reader
  const amD = new AccountManager({ dataDir: path.join(tmp, 'data-death') });
  const D = amD.createSubscription({ name: 'Dying' }).id;
  fs.writeFileSync(credsOf(amD, D), JSON.stringify(LE.oatFileBody(OAT, { expiresAt: Date.now() - 1, shape: SHAPE })), { mode: 0o600 });
  ok(amD.loginStateOf(D, Date.now(), { slot: true }).state === 'expired' && require(path.join(REPO, 'src/login-state.js')).loginState(credsOf(amD, D)).usable === false, 'an expired token file is dead to BOTH pool readers (login-expiry slot state + login-state\'s file verdict)');
}

console.log('§4 THE SPAWN — the file, not CLAUDE_CODE_OAUTH_TOKEN');
{
  const s = amP.resolveForSpawn(O);
  ok(s.oatOnly === true && s.oatFile === true && Object.keys(s.localEnv).join() === 'CLAUDE_SECURESTORAGE_CONFIG_DIR' && s.localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR === amP.subDir(O), 'an oat-only member WITH our file spawns on its dir — localEnv carries no CLAUDE_CODE_OAUTH_TOKEN (the env road defaults the model to sonnet: oat-env)', Object.keys(s.localEnv));
  ok(s.secret && s.secret.var === 'CLAUDE_CODE_OAUTH_TOKEN' && !s.remoteCreds, '…a REMOTE spawn keeps the secret channel; no creds dir is ever shipped for it');
  const amE = new AccountManager({ dataDir: path.join(tmp, 'data-env') });
  const E = amE.createSubscription({ name: 'Env road' }).id;
  put(amE, E, login(NOW, { dead: true }));
  await so(amE, E, OAT); // no CLI version: no file
  const se = amE.resolveForSpawn(E);
  ok(se.oatOnly && se.localEnv.CLAUDE_CODE_OAUTH_TOKEN === OAT && !se.oatFile, 'a row WITHOUT the file (unmeasured CLI) keeps today\'s env spawn');
  const amX = new AccountManager({ dataDir: path.join(tmp, 'data-x') });
  const X = amX.createSubscription({ name: 'Ended' }).id;
  await nv(amX, '2.1.296');
  fs.writeFileSync(credsOf(amX, X), JSON.stringify(LE.oatFileBody(OAT, { expiresAt: Date.now() - 1, shape: SHAPE })), { mode: 0o600 });
  let err = null; try { amX.resolveForSpawn(X); } catch (e) { err = e.message; }
  ok(/not logged in/.test(err || ''), 'a token file left with no token on the row is not a login — the spawn is refused, never a dir spawn on a dead token', err);
  const mutS = compileWith('src/accounts.js', "localEnv: { [this._credsOf('claude').spawnEnvVar]: this._acctDir('claude', id) }, secret: oatSecret };", "localEnv: { [this._credsOf('claude').spawnEnvVar]: this._acctDir('claude', id), CLAUDE_CODE_OAUTH_TOKEN: oat }, secret: oatSecret };");
  if (mutS) {
    const amS = new mutS.AccountManager({ dataDir: path.join(tmp, 'data-s') });
    const y = amS.createSubscription({ name: 'S' }).id;
    put(amS, y, login(NOW, { dead: true })); await nv(amS, '2.1.296'); await so(amS, y, OAT);
    ok(Object.keys(amS.resolveForSpawn(y).localEnv).includes('CLAUDE_CODE_OAUTH_TOKEN'), 'RED control (spawn): a resolver that also puts the token in env is caught by the localEnv key check above');
  } else ok(false, 'RED control anchor present (spawn)');
  const mutC = compileWith('src/accounts.js', '    const caps = this.oatFileCaps();\n    const linked', '    const caps = { ok: true, known: true };\n    const linked');
  if (mutC) {
    const amC = new mutC.AccountManager({ dataDir: path.join(tmp, 'data-c') });
    const z = amC.createSubscription({ name: 'C' }).id;
    put(amC, z, login(NOW, { dead: true })); await so(amC, z, OAT);
    ok(readJ(credsOf(amC, z))?.claudeAiOauth?.accessToken === OAT, 'RED control (invariant 5): a store that skips the capability gate writes on an UNKNOWN CLI — the first §2 leg (nothing written) catches it');
  } else ok(false, 'RED control anchor present (caps)');
}

let MA5 = null; // the real manage-agents chip module, kept for §8's words
console.log('§5 THE DOORS — the row, the pool row, the client chip and model, the words');
{
  const rowO = amP.list().accounts.find((a) => a.id === O);
  ok(rowO.oatFile && rowO.oatFile.state === 'written' && rowO.oatFile.cli === '2.1.296' && rowO.loginState.oatFile === true, 'the member row carries oatFile {written, cli 2.1.296} (proved by its own slot reading)', rowO.oatFile);
  ok(!JSON.stringify(amP.list()).includes(OAT) && !JSON.stringify(amP.list()).includes(OAT.slice(14, 40)), 'the roster (every GET / broadcast of it) carries no token bytes');
  const rowN = am.list().accounts.find((a) => a.id === never);
  ok(rowN.oatFile && rowN.oatFile.reason === 'no-scopes', 'a refusal is a door with its reason (no-scopes)', rowN.oatFile);
  const M = await import(path.join(REPO, 'src/lib/pool-priority-model.js'));
  ok(M.memberState({ loggedIn: true, loginState: { state: 'oat-only', oatFile: true } }).code !== 'login-expired' && M.memberState({ loggedIn: true, loginState: { state: 'oat-only' } }).code === 'login-expired', 'the Members… dialog: oat-only WITH the file is not "login expired"; without it, unchanged');
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const K = ['long-lived token written to this account’s folder (CLI {cli} verified)', 'this CLI version is not measured', 'mint again to record the subscription type', 'could not write it to the account folder', 'long-lived token ends in {left}'];
  ok(zh[K[0]] === '长期 token 已写入此账号目录（CLI {cli} 已验）' && zh[K[1]] === '此 CLI 版本未测量' && zh[K[2]] === '重新铸造一次以记录订阅类型', 'zh says the brief\'s words: 长期 token 已写入此账号目录（CLI {cli} 已验） / 此 CLI 版本未测量 / 重新铸造一次以记录订阅类型');
  ok(K.every((k) => zh[k] && ja[k] && zh[k].includes('{cli}') === k.includes('{cli}') && ja[k].includes('{left}') === k.includes('{left}')), 'every new door word has zh + ja with its placeholders');
  // the chip itself, rendered by the real manage-agents module (esbuild, a fake DOM)
  let MA = null, why = null;
  try {
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
    const stub = { name: 'stub', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
    const out = await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/manage-agents.js')], bundle: true, write: false, format: 'iife', globalName: 'MA', platform: 'browser', target: 'es2022', logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stub] });
    const vm = require('node:vm');
    const el = () => new Proxy(function () { }, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'style' || k === 'dataset' || k === 'classList' ? el() : el()), apply: () => el(), construct: () => el(), set: () => true });
    const g = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URL, URLSearchParams, TextEncoder, TextDecoder, Intl, Date, Math, JSON, Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect, Error, TypeError, RangeError, Array, Object, String, Number, Boolean, RegExp, encodeURIComponent, decodeURIComponent, structuredClone, performance, fetch: async () => ({ ok: false, json: async () => ({}) }), localStorage: { getItem: () => null, setItem() { }, removeItem() { } }, sessionStorage: { getItem: () => null, setItem() { }, removeItem() { } }, navigator: { userAgent: 'node', language: 'en', platform: 'Linux', clipboard: {} }, location: { href: 'http://x/', origin: 'http://x', protocol: 'http:', host: 'x', search: '', hash: '', pathname: '/' }, matchMedia: () => ({ matches: false, addEventListener() { }, addListener() { } }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout, getComputedStyle: () => el(), ResizeObserver: function () { return { observe() { }, disconnect() { } }; }, MutationObserver: function () { return { observe() { }, disconnect() { } }; }, IntersectionObserver: function () { return { observe() { }, disconnect() { } }; }, CustomEvent: function () { }, Event: function () { }, HTMLElement: function () { }, Element: function () { }, Node: function () { }, WebSocket: function () { return el(); } };
    g.document = el(); g.window = g; g.self = g; g.globalThis = g; g.addEventListener = () => { }; g.removeEventListener = () => { }; g.dispatchEvent = () => true;
    vm.createContext(g);
    vm.runInContext(out.outputFiles[0].text, g, { timeout: 5000 });
    MA = g.MA; MA5 = MA;
  } catch (e) { why = String(e && e.message || e).slice(0, 200); }
  if (!MA || typeof MA.loginExpiryChipHtml !== 'function') ok(false, 'the real manage-agents chip renders under a fake DOM', why);
  else {
    const ls = am.list().accounts.find((a) => a.id === wiped);
    const chip = MA.loginExpiryChipHtml(ls);
    ok(/long-lived token written to this account’s folder \(CLI 2\.1\.296 verified\)/.test(chip) && /data-relogin="sub-/.test(chip) && !chip.includes(OAT.slice(14, 30)), 'the member row\'s chip: "long-lived token written to this account’s folder (CLI 2.1.296 verified)" (the re-login door kept for the quota ⟳)', chip.slice(0, 200));
    const poolRow = amP.list().accounts.find((a) => a.id === P);
    ok(MA.loginExpiryChipHtml(poolRow) === '', 'the POOL row whose worst member is the token slot says nothing (the escape sentence is gone; a slot that serves is not a warning)', MA.loginExpiryChipHtml(poolRow));
    const nearPool = { ...poolRow, loginState: { ...poolRow.loginState, state: 'oat-only', oatFile: true, msLeft: 5 * H, worstId: O, worstName: 'Token O' } };
    ok(/Token O: long-lived token ends in/.test(MA.loginExpiryChipHtml(nearPool)), '…until the token\'s last day: "Token O: long-lived token ends in …"');
    const escRow = { id: 'pool-x', name: 'P', type: 'pooled', pooled: true, loginState: { state: 'expired', msLeft: -H, refreshExpiresAt: NOW - H, worstId: 'sub-1', worstName: 'Old', worstOatValidUntil: NOW + 99 * DAY, worstOatFileRefused: 'cli-unmeasured' } };
    ok(/the pool can’t use its long-lived token · this CLI version is not measured/.test(MA.loginExpiryChipHtml(escRow)), 'gate shut: the pool row keeps 「池用不了它的长期 token」 and adds 「此 CLI 版本未测量」 (en words here)', MA.loginExpiryChipHtml(escRow).slice(0, 300));
    const noSc = { ...escRow, loginState: { ...escRow.loginState, worstOatFileRefused: 'no-scopes' } };
    ok(/mint again to record the subscription type/.test(MA.loginExpiryChipHtml(noSc)), '…no shape known: 「重新铸造一次以记录订阅类型」 names what to do');
  }
}

console.log('§6 oat-file-sync — the spawned claude\'s --version gates it');
{
  const S = require(path.join(REPO, 'src/server/oat-file-sync.js'));
  const amY = new AccountManager({ dataDir: path.join(tmp, 'data-sync') });
  const y = amY.createSubscription({ name: 'Sync' }).id;
  put(amY, y, login(NOW, { dead: true })); await so(amY, y, OAT);
  let ver = '2.1.296 (Claude Code)';
  const logs = [];
  const h = S.start({ accounts: amY, machineProbes: { cliVersion: async () => ver }, claudeCmd: '/nowhere/claude', log: (...a) => logs.push(a.join(' ')), bootDelayMs: 1e9, recheckMs: 1e9 });
  const c1 = await h.tick();
  ok(c1.ok && readJ(credsOf(amY, y))?.claudeAiOauth?.accessToken === OAT && logs.some((l) => /claude CLI 2\.1\.296 — measured/.test(l)), 'a tick learns 2.1.296 through machineProbes.cliVersion and the row materializes (said once in the log, never a token)', logs);
  // a login that dies AFTER the mint: the sweep materializes it
  const yl = amY.createSubscription({ name: 'Later' }).id;
  put(amY, yl, login(NOW)); await so(amY, yl, OAT2);
  ok(fs.existsSync(credsOf(amY, yl)) && readJ(credsOf(amY, yl)).claudeAiOauth.refreshToken, '(a live login at mint time: kept)');
  put(amY, yl, login(NOW, { dead: true }));
  await h.tick();
  ok(readJ(credsOf(amY, yl))?.claudeAiOauth?.accessToken === OAT2 && archives(amY, yl).length === 1, 'its login dies later ⇒ the next sweep archives it and writes the token (nobody presses anything)');
  ver = null; // the probe times out on a loaded box
  const c0 = await h.tick();
  ok(c0.ok && amY.oatFileCaps().cli === '2.1.296' && fs.existsSync(credsOf(amY, y)) && logs.some((l) => /gave no answer — keeping CLI 2\.1\.296/.test(l)), 'a probe that FAILS keeps the last known version — no file is taken back from running sessions on a hiccup', logs.slice(-1));
  const mutY = compileWith('src/server/oat-file-sync.js', "if (!v) { caps", "if (false) { caps");
  if (mutY) {
    const amR = new AccountManager({ dataDir: path.join(tmp, 'data-sync-red') });
    const q = amR.createSubscription({ name: 'R' }).id;
    put(amR, q, login(NOW, { dead: true })); await so(amR, q, OAT);
    let vv = '2.1.296';
    const hr = mutY.start({ accounts: amR, machineProbes: { cliVersion: async () => vv }, claudeCmd: 'x', log: () => { }, bootDelayMs: 1e9, recheckMs: 1e9 });
    await hr.tick(); const had = fs.existsSync(credsOf(amR, q));
    vv = null; await hr.tick(); hr.stop();
    ok(had && amR.oatFileCaps().cli === null, 'RED control (layer 1): a sync that hands the failed probe on as the version LOSES the measured CLI (spawns fall back to env, the door goes quiet) — the leg above pins the real one');
    ok(fs.existsSync(credsOf(amR, q)), '…and even then nothing is taken back: the store never cleans up for an UNKNOWN version (layer 2, the verdict\'s known rule — its own RED in §1)');
  } else ok(false, 'RED control anchor present (oat-file-sync)');
  ver = '2.1.300';
  const c2 = await h.tick();
  ok(!c2.ok && !fs.existsSync(credsOf(amY, y)) && logs.some((l) => /2\.1\.300 — not measured/.test(l)), 'the CLI upgrades to an unmeasured version ⇒ the next tick takes the files back', logs.slice(-1));
  h.stop();
  ok(!logs.join('\n').includes(OAT.slice(14, 40)), 'nothing it logged carries token bytes');
  const P2 = require(path.join(REPO, 'src/machine-probes.js'));
  ok(typeof P2.cliVersion === 'function' && (await P2.cliVersion(path.join(tmp, 'no-such-claude'))) === null, 'machine-probes.cliVersion: cliFacts\' own which + --version read; a missing binary is null (never a throw)');
}

console.log('§7 VERIFY R1 — each finding of pool-oat-verify (4c1be7e0e REFUTED) as a store leg, with its RED control');
{
  const fsp = fs.promises;
  let k7 = 0;
  const mk = (M = { AccountManager }) => new M.AccountManager({ dataDir: path.join(tmp, 'r1-' + (++k7), 'data') });
  const mcpOf = () => ({ 'srv|abc123': { serverName: 'srv', accessToken: 'mcp-acc-' + crypto.randomBytes(3).toString('hex'), refreshToken: 'mcp-ref-' + crypto.randomBytes(3).toString('hex'), expiresAt: NOW + DAY } });
  const cliWrite = (file, obj) => { const t = file + '.cli-' + crypto.randomBytes(3).toString('hex'); fs.writeFileSync(t, JSON.stringify(obj), { mode: 0o600 }); fs.renameSync(t, file); };
  const hook = (obj, k, fn) => { const k0 = obj[k]; obj[k] = function (...a) { return fn.call(this, k0, ...a); }; return () => { obj[k] = k0; }; };
  const allBytes = (root, needle) => { const out = []; (function scan(d) { let n = []; try { n = fs.readdirSync(d); } catch { } for (const f of n) { const p = path.join(d, f); let st; try { st = fs.lstatSync(p); } catch { continue; } if (st.isDirectory()) scan(p); else if (st.isFile()) { try { if (fs.readFileSync(p, 'latin1').includes(needle)) out.push(path.relative(root, p)); } catch { } } } })(root); return out; };

  // ── F1 (BLOCKER): the file is the CLI's bag of top-level keys — ours replaces claudeAiOauth + the mark only ──
  const f1 = async (M) => {
    const am1 = mk(M);
    await nv(am1, '2.1.296');
    const m = am1.createSubscription({ name: 'MCP' }).id;
    put(am1, m, login(NOW, { dead: true }));
    await so(am1, m, OAT);
    const mcp = mcpOf();
    cliWrite(credsOf(am1, m), { ...readJ(credsOf(am1, m)), mcpOAuth: mcp });
    const m0 = fs.statSync(credsOf(am1, m)).mtimeMs;
    const s = await am1.syncOatFiles();
    const after = readJ(credsOf(am1, m));
    const rewritten = (() => { try { return fs.statSync(credsOf(am1, m)).mtimeMs !== m0; } catch { return true; } })();
    // a DEAD login that also holds the CLI's mcpOAuth: archive-then-write keeps the MCP credentials in service
    const d = am1.createSubscription({ name: 'MCP dead' }).id;
    const mcp2 = mcpOf();
    put(am1, d, { ...login(NOW, { dead: true }), mcpOAuth: mcp2 });
    await so(am1, d, OAT2);
    const afterD = readJ(credsOf(am1, d)), archD = archives(am1, d);
    // our token goes (clearOat) — the CLI's key stays in the file
    await co(am1, m);
    return { s, after, mcp, rewritten, afterD, mcp2, archD: archD.map((f) => readJ(path.join(am1.subDir(d), f))), cleared: readJ(credsOf(am1, m)) };
  };
  const r1 = await f1();
  ok(JSON.stringify(r1.after?.mcpOAuth) === JSON.stringify(r1.mcp) && r1.after?.claudeAiOauth?.accessToken === OAT && !r1.rewritten && Object.values(r1.s)[0] === 'written', 'F1 cliKey: an mcpOAuth the CLI wrote into our file survives the sweep — `current` is judged on claudeAiOauth + the mark, the file is not rewritten', { keys: r1.after && Object.keys(r1.after), verdict: r1.s });
  ok(JSON.stringify(r1.afterD?.mcpOAuth) === JSON.stringify(r1.mcp2) && r1.afterD?.claudeAiOauth?.accessToken === OAT2 && r1.archD.length === 1 && !!r1.archD[0]?.claudeAiOauth?.refreshToken, 'F1 cliKeyArchive: over a DEAD login the archive keeps the whole old file and the NEW file keeps its mcpOAuth (in service, not only in the archive)', { keys: r1.afterD && Object.keys(r1.afterD) });
  ok(!!r1.cleared && JSON.stringify(Object.keys(r1.cleared)) === JSON.stringify(['mcpOAuth']), 'F1: clearOat takes back ONLY our two keys — the CLI\'s mcpOAuth stays in the file', r1.cleared && Object.keys(r1.cleared));
  const mF1 = mutantStore({ acc: [['oatFileMerge(seen.fileState === \'present\' ? seen.file : null, body)', 'body'], ['ours && !!body && oatFileCurrent(seen.file, body)', 'ours && !!body && JSON.stringify(seen.file) === JSON.stringify(body)']] });
  const r1m = mF1 ? await f1(mF1) : null;
  ok(!!r1m && !r1m.after?.mcpOAuth && !r1m.afterD?.mcpOAuth, 'RED control (F1): the r1 store (writes the body WHOLE, judges `current` on the whole file) drops mcpOAuth on the next sweep and leaves it only in the archive — both legs above catch it', r1m && { keys: r1m.after && Object.keys(r1m.after) });

  // ── F2: only read-but-unparseable is 'unreadable'; any read errno ⇒ a named refusal, nothing archived or written ──
  const f2 = async (M, { failWrite = false } = {}) => {
    const am2 = mk(M);
    await nv(am2, '2.1.296');
    const m = am2.createSubscription({ name: 'Live' }).id;
    const live = login(NOW); put(am2, m, live);
    await so(am2, m, OAT);
    let hits = 0;
    const un = hook(fsp, 'open', function (o0, p, flags, ...r) {
      if (String(p) === credsOf(am2, m) && (flags || 'r') === 'r' && hits++ === 0) return Promise.reject(Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' }));
      if (failWrite && flags === 'wx' && String(p).startsWith(am2.subDir(m) + path.sep)) return Promise.reject(Object.assign(new Error('EMFILE'), { code: 'EMFILE' }));
      return o0.call(this, p, flags, ...r);
    });
    let s; try { s = await am2.syncOatFile(m); } finally { un(); }
    return { s, live, file: readJ(credsOf(am2, m)), arch: archives(am2, m), row: am2.list().accounts.find((a) => a.id === m) };
  };
  const r2 = await f2(), r2b = await f2(undefined, { failWrite: true });
  ok(r2.s.verdict === 'read-failed' && r2.s.code === 'EMFILE' && r2.file?.claudeAiOauth?.refreshToken === r2.live.claudeAiOauth.refreshToken && !r2.arch.length, 'F2 emfile: one EMFILE reading a LIVE login ⇒ read-failed:EMFILE — the login untouched, nothing archived, nothing written', r2.s);
  ok(r2.row.oatFile && r2.row.oatFile.state === 'refused' && r2.row.oatFile.reason === 'read-failed' && r2.row.oatFile.code === 'EMFILE', 'F2: the row says it (refused · read-failed · EMFILE)', r2.row.oatFile);
  ok(r2b.s.verdict === 'read-failed' && !!r2b.file && !r2b.arch.length, 'F2 emfile2: the read AND the write fail ⇒ the member still has its credential file (no archive ran, so no write could leave it bare)', { s: r2b.s, present: !!r2b.file });
  const mF2 = mutantStore({ mat: [["return e.code === 'ENOENT' ? out('dir', 'absent') : out('dir', 'read-failed', { code: String(e.code || 'error') });", "return e.code === 'ENOENT' ? out('dir', 'absent') : out('dir', 'unreadable');"], ['  if (expect !== undefined) await stillSame(src, expect);\n', '']] });
  const r2m = mF2 ? await f2(mF2, { failWrite: true }) : null;
  ok(!!r2m && !r2m.file && r2m.arch.length === 1, 'RED control (F2): the r1 reader (errno ⇒ unreadable) without the stat guard archives the LIVE login and, the write failing, leaves the member with NO credential file — the legs above catch it', r2m && { s: r2m.s, arch: r2m.arch.length });

  // ── F3: ours is the MARK's (+ this row); a re-mint swaps our token in place, whatever the window ──
  const f3 = async (M) => {
    const dataDir = path.join(tmp, 'r1-' + (++k7), 'data');
    const amA = new (M || { AccountManager }).AccountManager({ dataDir });
    await nv(amA, '2.1.296');
    const m = amA.createSubscription({ name: 'Remint' }).id;
    put(amA, m, login(NOW, { dead: true }));
    await so(amA, m, OAT);
    const amB = new (M || { AccountManager }).AccountManager({ dataDir }); // the hub restarted: the CLI version is UNKNOWN for its first 20 s
    const r = await so(amB, m, OAT2);
    const during = readJ(credsOf(amB, m))?.claudeAiOauth?.accessToken;
    await nv(amB, '2.1.296 (Claude Code)'); // the first good probe
    const oldOnDisk = allBytes(path.dirname(dataDir), OAT);
    // a re-mint whose write fails once (ENOSPC) on a measured CLI: the row says write-failed until the next sweep swaps it
    const amC = mk(M); await nv(amC, '2.1.296');
    const c = amC.createSubscription({ name: 'RemintWF' }).id;
    put(amC, c, login(NOW, { dead: true })); await so(amC, c, OAT);
    const un = hook(fsp, 'open', function (o0, p, flags, ...rr) { if (flags === 'wx' && String(p).startsWith(amC.subDir(c) + path.sep)) return Promise.reject(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })); return o0.call(this, p, flags, ...rr); });
    let wf; try { wf = await so(amC, c, OAT2); } finally { un(); }
    const doorWF = amC.list().accounts.find((a) => a.id === c).oatFile;
    await amC.syncOatFiles();
    return { r, during, oldOnDisk, wf, doorWF, oldAfterWF: allBytes(path.dirname(amC.dataDir), OAT), fileWF: readJ(credsOf(amC, c))?.claudeAiOauth?.accessToken };
  };
  const r3 = await f3();
  ok(r3.r.oatFile === 'materialize' && r3.during === OAT2 && r3.oldOnDisk.length === 0, 'F3 remintUnknown: a re-mint in the unknown-CLI window swaps OUR file\'s token in place — the old year-long token is on no disk file (no archive of it, ever)', { verdict: r3.r.oatFile, during: r3.during === OAT2 ? 'new' : r3.during, old: r3.oldOnDisk });
  ok(r3.wf.oatFile === 'write-failed' && r3.doorWF?.state === 'written' && r3.fileWF === OAT2 && r3.oldAfterWF.length === 0, 'F3 remintWriteFail: a re-mint whose write failed is retried by the next sweep (swapped in place, no archive) — the old token on no disk file', { wf: r3.wf.oatFile, door: r3.doorWF, old: r3.oldAfterWF });
  const mF3 = mutantStore({ acc: [['const ours = oatFileOurs(seen.file, id);', 'const ours = oatFileOurs(seen.file, id) && seen.file.claudeAiOauth.accessToken === this.getOat(id);']] });
  const r3m = mF3 ? await f3(mF3) : null;
  ok(!!r3m && r3m.oldOnDisk.length > 0, 'RED control (F3): ours judged by the TOKEN value (r1) leaves the old token on disk (archived as "foreign") — the leg above catches it', r3m && r3m.oldOnDisk);
  {
    // the merge copies no materialized file: ours is re-derived on the survivor (its mark names the survivor)
    const amM = mk(); await nv(amM, '2.1.296');
    const into = amM.createSubscription({ name: 'Into' }).id; put(amM, into, login(NOW, { dead: true }));
    const from = amM.createSubscription({ name: 'From' }).id; put(amM, from, login(NOW, { dead: true }));
    await so(amM, from, OAT);
    amM.mergeSubscription(from, into, { liveAccountIds: new Set() }); await amM.oatFileSettled();
    const f = readJ(credsOf(amM, into));
    ok(f?.claudeAiOauth?.accessToken === OAT && f?.vibespaceOat?.account === into && LE.oatFileOurs(f, into), 'F3: a merge never copies our file — the survivor\'s is re-derived from the moved token, its mark naming the survivor', f && f.vibespaceOat);
  }

  // ── F4: a token that does not decrypt is oat-unreadable — nothing archived, written or removed; the writer refuses a non-object ──
  const f4 = async (M) => {
    const dataDir = path.join(tmp, 'r1-' + (++k7), 'data');
    const amA = new (M || { AccountManager }).AccountManager({ dataDir });
    await nv(amA, '2.1.296');
    const m = amA.createSubscription({ name: 'Key lost' }).id;
    put(amA, m, login(NOW, { dead: true })); await so(amA, m, OAT);
    const before = fs.readFileSync(credsOf(amA, m), 'utf8'), arch0 = archives(amA, m).length;
    fs.writeFileSync(path.join(dataDir, '.accounts-key'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 }); // a restore without the old key file
    const amB = new (M || { AccountManager }).AccountManager({ dataDir });
    await nv(amB, '2.1.296');
    const v = [];
    for (let i = 1; i <= 5; i++) v.push(Object.values(await amB.syncOatFiles({ now: Date.now() + i * 15 * 60e3 }))[0]);
    return { v, same: fs.readFileSync(credsOf(amB, m), 'utf8') === before, archAdded: archives(amB, m).length - arch0, door: amB.list().accounts.find((a) => a.id === m).oatFile };
  };
  const r4 = await f4();
  ok(r4.v.every((x) => x === 'none') && r4.same && r4.archAdded === 0, 'F4 decrypt: 5 sweeps over a token that no longer decrypts — zero archives, zero writes, the file byte-identical', r4);
  ok(r4.door && r4.door.state === 'refused' && r4.door.reason === 'oat-unreadable', 'F4: the row names it (refused · oat-unreadable — 「长期 token 无法解密——重新铸造」)', r4.door);
  const mF4 = mutantStore({ le: [["  if (m.oat && m.oat.present && m.oat.readable === false) return { verdict: 'none', archive: false, cleanup: false, reason: 'oat-unreadable' };\n", '']] });
  const r4m = mF4 ? await f4(mF4) : null;
  ok(!!r4m && !(r4m.door && r4m.door.reason === 'oat-unreadable'), 'RED control (F4): without the oat-unreadable rung the row never says why (the door leg above goes RED)', r4m && r4m.door);
  {
    const MAT = require(path.join(REPO, 'src/account-material.js'));
    const d = fs.mkdtempSync(path.join(tmp, 'f4w-'));
    const codes = [];
    for (const body of [null, 'null', [], 7]) { try { await MAT.writeCredentialFile(d, body); codes.push('wrote'); } catch (e) { codes.push(e.code); } }
    ok(codes.every((c) => c === 'not-an-object') && !fs.existsSync(path.join(d, '.credentials.json')), 'F4: writeCredentialFile REFUSES a non-object body by name (not-an-object) and writes nothing', codes);
  }

  // ── F5 (ruling): an unmeasured CLI never pulls a linked member's file; the pool stops placing on it ──
  const f5 = async (M) => {
    const am5 = mk(M); await nv(am5, '2.1.296');
    const O1 = am5.createSubscription({ name: 'O1' }).id; put(am5, O1, login(NOW, { dead: true })); await so(am5, O1, OAT);
    const O2 = am5.createSubscription({ name: 'O2' }).id; put(am5, O2, login(NOW, { dead: true })); await so(am5, O2, OAT2);
    const P5 = am5.createPool({ name: 'All-oat pool' }).id;
    const link = am5.ensureSessionPoolLink(P5, 'sess-5-1791900000000', O1, { why: 'spawn' });
    const c = await nv(am5, '2.1.300 (Claude Code)');
    let spawnErr = null; try { am5.resolveForSpawn(P5, 'claude', { sessionKey: 'sess-6-1791900000000' }); } catch (e) { spawnErr = e; }
    const out = { c, linkedCreds: readJ(path.join(link, '.credentials.json'))?.claudeAiOauth?.accessToken === OAT, cands: am5.poolMembers(P5).length, isMember: am5.isPoolMember(P5, O1), spawnErr: spawnErr && { code: spawnErr.code, msg: spawnErr.message }, doorO1: am5.list().accounts.find((a) => a.id === O1).oatFile, o2Gone: !fs.existsSync(credsOf(am5, O2)) };
    am5.dropSessionPoolLink(P5, 'sess-5-1791900000000');
    await am5.syncOatFiles();
    out.afterLast = fs.existsSync(credsOf(am5, O1));
    return out;
  };
  const r5 = await f5();
  ok(r5.c.ok === false && r5.c.known && r5.linkedCreds && r5.o2Gone, 'F5 gateFlip: the hub moves to an unmeasured 2.1.300 — the linked conversation\'s file STAYS (its creds intact through the link); the unlinked member\'s goes', r5);
  ok(r5.cands === 0 && r5.isMember === false && r5.spawnErr && r5.spawnErr.code === 'oat-cli-unmeasured' && /conversations already running continue/.test(r5.spawnErr.msg), 'F5: the pool has 0 candidates for a NEW placement (poolMembers / isPoolMember) and a new conversation is refused by name (oat-cli-unmeasured), never "signed out"', { cands: r5.cands, err: r5.spawnErr });
  ok(r5.doorO1 && r5.doorO1.state === 'held' && r5.doorO1.cli === '2.1.300', 'F5: the row says it — held (「此 CLI 版本未测量：现有会话继续，不再新派」)', r5.doorO1);
  ok(r5.afterLast === false, 'F5: the last link gone, the next sweep takes the file back', r5.afterLast);
  const mF5 = mutantStore({ le: [["    if (ours && known && m.linked) return { verdict: 'cli-unmeasured', archive: false, cleanup: false, held: true };\n", '']] });
  const r5m = mF5 ? await f5(mF5) : null;
  ok(!!r5m && r5m.linkedCreds === false, 'RED control (F5): without the held rung the flip unlinks the file under the running conversation (r1) — the leg above catches it', r5m && { linkedCreds: r5m.linkedCreds });
  const mF5b = mutantStore({ acc: [['    return !(c.known && !c.ok);\n', '    return true;\n']] });
  const r5b = mF5b ? await f5(mF5b) : null;
  ok(!!r5b && r5b.cands > 0, 'RED control (F5): a candidacy that ignores the gate keeps placing on the held member — the 0-candidates leg catches it', r5b && r5b.cands);

  // ── F7: the archive is guarded by a fresh stat; what moved must be what was judged ──
  const f7 = async (M, where) => {
    const am7 = mk(M);
    const m = am7.createSubscription({ name: 'Race' }).id;
    put(am7, m, login(NOW, { dead: true }));
    await so(am7, m, OAT); // gate shut: nothing yet
    const fresher = login(NOW);
    let landed = false;
    const un = where === 'rename'
      ? hook(fsp, 'rename', function (r0, src, dest, ...rr) { if (!landed && String(src) === credsOf(am7, m) && /\.dead-/.test(String(dest))) { landed = true; cliWrite(credsOf(am7, m), fresher); } return r0.call(this, src, dest, ...rr); })
      : hook(fsp, 'lstat', function (l0, p, ...rr) { if (!landed && String(p) === credsOf(am7, m)) { landed = true; cliWrite(credsOf(am7, m), fresher); } return l0.call(this, p, ...rr); });
    try { await nv(am7, '2.1.296'); } finally { un(); }
    return { landed, kept: readJ(credsOf(am7, m))?.claudeAiOauth?.refreshToken === fresher.claudeAiOauth.refreshToken, fact: am7._oatFileFacts.get(m) };
  };
  const r7a = await f7(undefined, 'lstat'), r7b = await f7(undefined, 'rename');
  ok(r7a.landed && r7a.kept && r7a.fact.code === 'changed', 'F7: a `claude login` landing between the verdict\'s read and the archive is never displaced — the fresh stat refuses (changed), the next sweep reads a live login', r7a);
  ok(r7b.landed && r7b.kept, 'F7: …landing INSIDE the archive rename window too: what moved is checked against what was judged and put straight back (link(2), never over a file)', r7b);
  const mF7 = mutantStore({ mat: [['  if (expect !== undefined) await stillSame(src, expect);\n', ''], ['  if (expect) {\n    const st = await fsp.lstat(dst);', '  if (false) {\n    const st = await fsp.lstat(dst);']] });
  const r7m = mF7 ? await f7(mF7, 'rename') : null;
  ok(!!r7m && r7m.landed && !r7m.kept, 'RED control (F7): the r1 archive (no fresh stat, no check after) displaces the fresh login — the leg above catches it', r7m);

  // ── F8: a member dir that is a symlink is refused (lstat, never followed) ──
  const f8 = async (M) => {
    const am8 = mk(M); await nv(am8, '2.1.296');
    const m = am8.createSubscription({ name: 'SymDir' }).id;
    const real = fs.mkdtempSync(path.join(tmp, 'outside-')); fs.chmodSync(real, 0o755);
    fs.writeFileSync(path.join(real, '.credentials.json'), JSON.stringify(login(NOW, { dead: true })), { mode: 0o600 });
    const b = sha(path.join(real, '.credentials.json'));
    fs.rmSync(am8.subDir(m), { recursive: true, force: true }); fs.symlinkSync(real, am8.subDir(m));
    const r = await so(am8, m, OAT);
    return { r, untouched: sha(path.join(real, '.credentials.json')) === b && !fs.readdirSync(real).some((f) => /dead-/.test(f)), mode: (fs.statSync(real).mode & 0o777).toString(8), door: am8.list().accounts.find((a) => a.id === m).oatFile };
  };
  const r8 = await f8();
  ok(r8.r.oatFile === 'dir-symlink' && r8.untouched && r8.mode === '755' && r8.door?.reason === 'dir-symlink', 'F8: a member dir that is a symlink is refused (dir-symlink) — nothing archived or written through it, its target\'s mode untouched, the row says it', r8);
  const mF8 = mutantStore({ le: [["  if (m.dirState === 'symlink') return { verdict: 'dir-symlink', archive: false, cleanup: false };\n", '']], mat: [["  try { if ((await fsp.lstat(dir)).isSymbolicLink()) throw Object.assign(new Error('the account folder is a symlink'), { code: 'dir-symlink' }); } catch (e) { if (e.code !== 'ENOENT') throw e; }\n", ''], ["  try { if ((await fsp.lstat(dir)).isSymbolicLink()) return out('symlink', 'absent'); }", "  try { await fsp.lstat(dir); }"]] });
  const r8m = mF8 ? await f8(mF8) : null;
  ok(!!r8m && !r8m.untouched, 'RED control (F8): the r1 reader + writer (no lstat) write through the symlink — the leg above catches it', r8m && r8m.r);

  // ── F9: a build suffix is another version; an answer with no version is a KNOWN unmeasured CLI ──
  {
    const am9 = mk();
    const c1 = am9.noteCliVersion('2.1.296-dev.1'), c2 = am9.noteCliVersion('unparsed'), c3 = am9.noteCliVersion('2.1.296 (Claude Code)');
    ok(c1.ok === false && c1.known && c1.cli === '2.1.296-dev.1' && c2.ok === false && c2.known && c2.cli === 'unparsed' && c3.ok === true, 'F9: 2.1.296-dev.1 never opens the gate (an exact measured version only); \'unparsed\' is a known CLI nobody measured', { c1, c2 });
    await am9.oatFileSettled();
  }

  // ── F10: the usage reads never get our long-lived token ──
  const f10 = (M) => {
    const am10 = new (M || { AccountManager }).AccountManager({ dataDir: path.join(tmp, 'r1-' + (++k7), 'data') });
    return am10;
  };
  {
    const am10 = f10(); await nv(am10, '2.1.296');
    const o = am10.createSubscription({ name: 'Oat only' }).id; put(am10, o, login(NOW, { dead: true })); await so(am10, o, OAT);
    const l = am10.createSubscription({ name: 'Login' }).id; const lv = login(NOW); put(am10, l, lv);
    ok(am10.readSubCreds(o).oatFile === true && am10.usageToken(o) === null && am10.usageToken(l) === lv.claudeAiOauth.accessToken, 'F10: usageToken never hands out a materialized oat (inference-only; the ⟳ / identity-group reads refuse an oat-only row as before — no token ⇒ no request) — a live login\'s access token still reads', { oat: am10.usageToken(o) === OAT ? 'OAT' : am10.usageToken(o) });
    const mF10 = mutantStore({ acc: [['    return info.oatFile ? null : (info.accessToken || null);', '    return info.accessToken || null;']] });
    if (mF10) { const amM = f10(mF10); await nv(amM, '2.1.296'); const x = amM.createSubscription({ name: 'X' }).id; put(amM, x, login(NOW, { dead: true })); await so(amM, x, OAT); ok(amM.usageToken(x) === OAT, 'RED control (F10): the r1 reader hands the oat to the usage call — the leg above catches it'); } else ok(false, 'F10 anchor present');
  }

  // ── F11: the export carries the token ONCE (rec.oat); ours is re-derived on import ──
  const f11 = async (M) => {
    const amE = mk(M); await nv(amE, '2.1.296');
    const m = amE.createSubscription({ name: 'Export' }).id; amE.setEmail(m, 'w@example.com');
    put(amE, m, login(NOW, { dead: true })); await so(amE, m, OAT);
    cliWrite(credsOf(amE, m), { ...readJ(credsOf(amE, m)), mcpOAuth: mcpOf() });
    const bundle = amE.exportBundle();
    const txt = JSON.stringify(bundle);
    const amI = mk(); fs.mkdirSync(amI.dataDir, { recursive: true }); await nv(amI, '2.1.296');
    amI.importBundle(bundle); await amI.oatFileSettled();
    const imp = readJ(credsOf(amI, m));
    return { copies: txt.split(OAT).length - 1, rec: bundle.accounts.find((a) => a.id === m), imp };
  };
  const r11 = await f11();
  ok(r11.copies === 1 && r11.rec.oat === OAT && !String(r11.rec.files['.credentials.json'] || '').includes(OAT) && /mcpOAuth/.test(r11.rec.files['.credentials.json'] || ''), 'F11: the export carries the token ONCE (rec.oat) — our file is left out, the CLI\'s other keys in it travel', { copies: r11.copies, files: Object.keys(r11.rec.files || {}) });
  ok(LE.oatFileOurs(r11.imp, r11.rec.id) && r11.imp.claudeAiOauth.accessToken === OAT && !!r11.imp.mcpOAuth, '…and the import re-derives ours on the target (its mcpOAuth kept)', r11.imp && Object.keys(r11.imp));
  const mF11 = mutantStore({ acc: [["        if (rec.files['.credentials.json'] && a.oatEnc) {", "        if (false) {"]] });
  const r11m = mF11 ? await f11(mF11) : null;
  ok(!!r11m && r11m.copies === 2, 'RED control (F11): the r1 export carries the token twice — the leg above catches it', r11m && r11m.copies);

  // ── F12: a merge MOVES the folded dir's archives into the survivor before the rm ──
  const f12 = async (M) => {
    const amG = mk(M); await nv(amG, '2.1.296');
    const into = amG.createSubscription({ name: 'Older' }).id; put(amG, into, login(NOW));
    const from = amG.createSubscription({ name: 'Newer' }).id; put(amG, from, login(NOW, { dead: true }));
    await so(amG, from, OAT);
    const a0 = archives(amG, from).map((f) => sha(path.join(amG.subDir(from), f)));
    amG.mergeSubscription(from, into, { liveAccountIds: new Set() }); await amG.oatFileSettled();
    return { a0, a1: archives(amG, into).map((f) => sha(path.join(amG.subDir(into), f))), gone: !fs.existsSync(amG.subDir(from)) };
  };
  const r12 = await f12();
  ok(r12.a0.length === 1 && r12.gone && r12.a0.every((h) => r12.a1.includes(h)), 'F12: the merge moves the folded record\'s .dead-* archives (byte-identical) into the survivor before its dir goes', r12);
  const mF12 = mutantStore({ acc: [["      require('./account-material.js').moveCredentialArchives(fromDir, intoDir);\n", '']] });
  const r12m = mF12 ? await f12(mF12) : null;
  ok(!!r12m && r12m.a1.length === 0, 'RED control (F12): the r1 merge destroys them with the dir — the leg above catches it', r12m);

  // ── F13: the sweep never blocks the loop — fs.promises, one row per loop turn, no sync fs on a member path ──
  // (lane oat-loop-gap-bound, .270: the old `maxGap < 50` read 59.4 ms on ubuntu-latest — an absolute wall-clock bound
  // judges the runner, never the sweep.) ONE ROW PER LOOP TURN is a WORK count: the rows the sweep STARTS between two
  // turns of a ticker loop (≤ 1 — a sweep that starts them together reads N). The stall is RELATIVE: a CONTROL loop of
  // the same length in this process — as long as the two sweeps took, turns that do nothing but `await setImmediate`,
  // each half ending in the store's own roster broadcast (_notify → list(): the ONE synchronous O(rows) read a sweep
  // that moved something makes, ~2.5 ms at 200 written rows here against ~0.5 ms for the longest act turn) — and the
  // sweep's longest stall ≤ 3 × the control's. It runs right AFTER the sweeps, under the same spy, so its broadcast reads
  // the same written rows at the same cost, and a loaded runner's preemption gets the same window to land in (a control
  // of N turns is ~1 % of the sweeps' wall: 2 hogs on one CPU read the sweep 3.2 × it). A do-nothing control alone reads
  // ~0.1 ms — no K holds against it. A slower runner scales both.
  const loopMeter = () => {
    let maxGap = 0, turns = 0, last = performance.now(), on = true;
    const mark = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; };
    const tick = () => { mark(); turns++; if (on) setImmediate(tick); };
    setImmediate(tick);
    // stop() closes the open turn: a sweep that never yields reads its whole length
    return { turn: () => turns, stop: () => { on = false; mark(); return { maxGap, turns }; } };
  };
  const f13 = async (M, N = 200) => {
    const am13 = mk(M); await nv(am13, '2.1.296');
    const ids = [];
    for (let i = 0; i < N; i++) { const m = am13.createSubscription({ name: 'C' + i }).id; put(am13, m, login(NOW, { dead: true })); ids.push(m); }
    for (const m of ids) { const a = am13.get(m); a.oatEnc = am13._enc(OAT); a.oatMintedAt = Date.now(); a.oatShape = SHAPE; }
    am13._save();
    const subs = path.join(am13.dataDir, 'subs') + path.sep;
    const syncHits = [];
    const SYNC = ['readFileSync', 'writeFileSync', 'openSync', 'renameSync', 'unlinkSync', 'fsyncSync', 'statSync', 'lstatSync', 'existsSync', 'chmodSync', 'mkdirSync', 'readdirSync'];
    const keep = {};
    // (the ONE roster rebuild a sweep that moved something broadcasts — list(), the store's existing _notify path for
    // every change — reads the rows synchronously; it is outside the sweep's acts, and inside both stall figures)
    let inList = 0;
    am13.list = function (...a) { inList++; try { return Object.getPrototypeOf(this).list.apply(this, a); } finally { inList--; } };
    for (const k of SYNC) { keep[k] = fs[k]; fs[k] = function (p, ...r) { if (!inList && String(p).startsWith(subs)) syncHits.push(k); return keep[k].call(this, p, ...r); }; }
    const meter = loopMeter(), starts = [];
    am13.syncOatFile = function (...a) { starts.push(meter.turn()); return Object.getPrototypeOf(this).syncOatFile.apply(this, a); };
    let first, steady, run, ctl;
    try {
      const t0 = performance.now();
      first = await am13.syncOatFiles(); steady = await am13.syncOatFiles(); run = meter.stop();
      const took = performance.now() - t0;
      // the CONTROL: as long as the sweeps, their one broadcast each, not one act — over the rows they wrote
      const c = loopMeter();
      for (let k = 0; k < 2; k++) { const until = performance.now() + took / 2; do await new Promise((res) => setImmediate(res)); while (performance.now() < until); am13._notify(); }
      ctl = c.stop();
    } finally { if (!run) meter.stop(); delete am13.syncOatFile; delete am13.list; for (const k of SYNC) fs[k] = keep[k]; }
    const counts = {}; for (const v of Object.values(first)) counts[v] = (counts[v] || 0) + 1;
    const perTurn = {}; for (const t of starts) perTurn[t] = (perTurn[t] || 0) + 1;
    return { N, maxGap: +run.maxGap.toFixed(2), ctlGap: +ctl.maxGap.toFixed(2), turns: run.turns, starts: starts.length, rowsPerTurn: Math.max(0, ...Object.values(perTurn)), counts, steady: [...new Set(Object.values(steady))], syncHits: [...new Set(syncHits)] };
  };
  const r13 = await f13();
  ok(r13.counts.materialize === 200 && r13.steady.join() === 'written', 'F13: 200 fake rows — the first sweep materializes every one (archive + write), the next finds every one written', r13.counts);
  ok(r13.starts === 400 && r13.rowsPerTurn === 1, `F13: ONE row per loop turn — the two sweeps start ${r13.starts} row acts over ${r13.turns} turns of the loop, never more than ${r13.rowsPerTurn} between two turns`, r13);
  ok(r13.maxGap <= 3 * r13.ctlGap, `F13: the event loop's longest stall across both sweeps is ${r13.maxGap} ms ≤ 3 × the control's ${r13.ctlGap} ms (as long as the sweeps, no act, each half ending in the store's own roster broadcast over the rows they wrote — measured right after, in this process)`, r13);
  ok(r13.syncHits.length === 0, 'F13: not one synchronous fs call on a member path from the sweep\'s acts (every read / write / rename / fsync is fs.promises; the one roster broadcast after it is the store\'s existing list())', r13.syncHits);
  const mF13 = mutantStore({ mat: [['    await fh.sync();\n', '    require(\'fs\').fsyncSync(fh.fd);\n    require(\'fs\').statSync(dest + \'.never\', { throwIfNoEntry: false });\n']] });
  const r13m = mF13 ? await f13(mF13, 20) : null;
  ok(!!r13m && r13m.syncHits.length > 0, 'RED control (F13): a writer that goes synchronous on the member path is seen by the spy', r13m && r13m.syncHits);
  // a sweep that starts every row in one turn (no queue): the work count reads N — the stall cannot see it (each row's
  // start is a few µs; the longest turn is still the broadcast)
  const mF13b = mutantStore({ acc: [['      for (const id of ids) {\n        let r = null;\n', '      await Promise.all(ids.map(async (id) => {\n        let r = null;\n'], ['        await new Promise((res) => setImmediate(res));\n      }\n      if (moved) this._notify();\n', '        await new Promise((res) => setImmediate(res));\n      }));\n      if (moved) this._notify();\n']] });
  const r13b = mF13b ? await f13(mF13b) : null;
  ok(!!r13b && r13b.counts.materialize === 200 && r13b.rowsPerTurn === 200, `RED control (F13): a sweep that starts all ${r13b && r13b.N} rows in one turn reads ${r13b && r13b.rowsPerTurn} rows between two turns of the loop`, r13b);
  // the r1 shape (pool-oat-verify F13): every act ON the loop — account-material's fs.promises answered by the sync
  // calls, no turn between rows — both sweeps run in ONE turn: the stall passes 3 × the control, the count reads 2 × N
  const R1_FSP = "const fsp = (() => { const h = (fd) => ({ fd, chmod: async (m) => fs.fchmodSync(fd, m), close: async () => fs.closeSync(fd), readFile: async (o) => fs.readFileSync(fd, o), stat: async () => fs.fstatSync(fd), sync: async () => fs.fsyncSync(fd), writeFile: async (b) => fs.writeFileSync(fd, b) }); return { open: async (...a) => h(fs.openSync(...a)), chmod: async (...a) => fs.chmodSync(...a), link: async (...a) => fs.linkSync(...a), lstat: async (...a) => fs.lstatSync(...a), mkdir: async (...a) => fs.mkdirSync(...a), rename: async (...a) => fs.renameSync(...a), unlink: async (...a) => fs.unlinkSync(...a) }; })();\n";
  const mF13c = mutantStore({ mat: [['const fsp = fs.promises;\n', R1_FSP]], acc: [['        await new Promise((res) => setImmediate(res));\n      }\n      if (moved) this._notify();\n', '      }\n      if (moved) this._notify();\n']] });
  const r13c = mF13c ? await f13(mF13c) : null;
  ok(!!r13c && r13c.counts.materialize === 200 && r13c.maxGap > 3 * r13c.ctlGap && r13c.rowsPerTurn === 400, `RED control (F13): the r1 sweep (every act on the loop) stalls it ${r13c && r13c.maxGap} ms — past 3 × its control's ${r13c && r13c.ctlGap} ms; ${r13c && r13c.rowsPerTurn} rows in one turn`, r13c);
}

console.log('§8 VERIFY R2 (lane oat-census-closure, pool-oat-verify-r2 REFUTED c9fea70ad) — O1 the key-file law, F2 rename-aside, F3 the merge keeps the survivor\'s keys, the two lows');
{
  let k8 = 0;
  const fsp8 = fs.promises;
  const mk8 = (M = { AccountManager }) => new M.AccountManager({ dataDir: path.join(tmp, 'r2-' + (++k8), 'data') });
  const cliWrite = (file, obj) => { const t = file + '.cli-' + crypto.randomBytes(3).toString('hex'); fs.writeFileSync(t, JSON.stringify(obj), { mode: 0o600 }); fs.renameSync(t, file); };
  const hook = (obj, k, fn) => { const k0 = obj[k]; obj[k] = function (...a) { return fn.call(this, k0, ...a); }; return () => { obj[k] = k0; }; };
  const allArch = (am, id) => fs.readdirSync(am.subDir(id)).filter((f) => /^\.credentials\.json\.dead-/.test(f));
  const where = (am, id, fr) => (readJ(credsOf(am, id))?.claudeAiOauth?.refreshToken === fr.claudeAiOauth.refreshToken ? 'in place' : allArch(am, id).some((f) => readJ(path.join(am.subDir(id), f))?.claudeAiOauth?.refreshToken === fr.claudeAiOauth.refreshToken) ? 'archived' : 'LOST');
  const errOf = (code) => Object.assign(new Error(code + ': injected'), { code });
  const tokenFiles = (root, t) => { const out = []; (function scan(d) { let n = []; try { n = fs.readdirSync(d); } catch { } for (const f of n) { const p = path.join(d, f); let st; try { st = fs.lstatSync(p); } catch { continue; } if (st.isDirectory()) scan(p); else if (st.isFile()) { try { if (fs.readFileSync(p, 'latin1').includes(t.slice(13, 40))) out.push(path.relative(root, p)); } catch { } } } })(root); return out; };
  const APIKEY = ['sk', '-ant-api03-'].join('') + 'MATkey_' + 'x9Y8'.repeat(10), APIKEY2 = ['sk', '-ant-api03-'].join('') + 'MATkey2_' + 'z7W6'.repeat(10);
  const refusal = (fn) => { try { fn(); return 'no refusal'; } catch (e) { return String(e.code || e.message).slice(0, 80); } };

  // ── O1 THE KEY-FILE LAW: a new key only when ABSENT and no ciphertext exists; any other failure a named refusal ──
  const keyRegen = async (M) => { // the verifier's probe: ONE EIO on the key read during a sweep
    const am = mk8(M); await nv(am, '2.1.296');
    const m = am.createSubscription({ name: 'K' }).id; put(am, m, login(NOW, { dead: true })); await so(am, m, OAT);
    const kf = am._keyFile, k0 = fs.readFileSync(kf, 'utf8'), f0 = fs.readFileSync(credsOf(am, m), 'utf8');
    let hit = 0; const un = hook(fs, 'readFileSync', function (r0, q, ...r) { if (String(q) === kf && hit++ === 0) throw errOf('EIO'); return r0.call(this, q, ...r); });
    let during = null; try { await am.syncOatFiles(); during = { fact: am._oatFileFacts.get(m), door: am.list().accounts.find((a) => a.id === m).oatFile }; } finally { un(); }
    const after = []; for (let i = 0; i < 2; i++) after.push((await am.syncOatFiles())[m]);
    return { hit, keySame: fs.readFileSync(kf, 'utf8') === k0, fileSame: fs.readFileSync(credsOf(am, m), 'utf8') === f0, decrypts: am.getOat(m) === OAT, during, after };
  };
  const rk = await keyRegen();
  ok(rk.hit >= 1 && rk.keySame && rk.fileSame && rk.decrypts && rk.after.every((v) => v === 'written'), 'O1 keyRegen (the verifier\'s probe): one EIO reading .accounts-key during a sweep — the key byte-identical, the member\'s file untouched, every token still decrypts, the next sweeps find it written', rk);
  ok(rk.during && rk.during.fact.reason === 'key-unreadable' && rk.during.fact.code === 'EIO' && rk.during.door.state === 'refused' && rk.during.door.reason === 'key-unreadable' && rk.during.door.code === 'EIO', 'O1: that sweep\'s row names the KEY FILE (refused · key-unreadable · EIO) — never "mint it again"', rk.during);
  const mKey = mutantStore({ acc: [["    const r = lawfulKey(this._keyFile, { hasCiphertext: () => this._holdsCiphertext() });\n    if (!r.ok) throw keyRefusal(r.code === 'key-malformed' ? 'key-unreadable:malformed' : r.code, this._keyFile);\n    return r.key;\n", "    try { return Buffer.from(fs.readFileSync(this._keyFile, 'utf-8').trim(), 'hex'); } catch { const k = crypto.randomBytes(32); fs.writeFileSync(this._keyFile, k.toString('hex'), { mode: 0o600 }); return k; }\n"]] }); // lane key-file-law-stores: _key() routed through lawfulKey — the old bare catch as the mutant
  const rkm = mKey ? await keyRegen(mKey) : null;
  ok(!!rkm && rkm.hit >= 1 && !rkm.keySame && !rkm.decrypts, 'RED control (O1): the old mint-on-any-error _key() — that one EIO REPLACES the key and every stored token is undecryptable from then on (the leg above catches it)', rkm && { keySame: rkm.keySame, decrypts: rkm.decrypts });
  { // a store holding ciphertext whose key file is GONE (a restore without it): refused by name, nothing minted, nothing moved
    const am = mk8(); await nv(am, '2.1.296');
    const m = am.createSubscription({ name: 'Lost key' }).id; put(am, m, login(NOW, { dead: true })); await so(am, m, OAT);
    const api = am.add({ name: 'API', key: APIKEY }).id;
    const kf = am._keyFile, f0 = fs.readFileSync(credsOf(am, m), 'utf8'), acc0 = fs.readFileSync(path.join(am.dataDir, 'accounts.json'), 'utf8');
    fs.unlinkSync(kf);
    const am2 = new AccountManager({ dataDir: am.dataDir }); await nv(am2, '2.1.296');
    const sweeps = []; for (let i = 0; i < 3; i++) sweeps.push((await am2.syncOatFiles())[m]);
    const codes = { setOat: refusal(() => am2.setOat(m, OAT2)), add: refusal(() => am2.add({ name: 'API2', key: APIKEY2 })), spawn: refusal(() => am2.resolveForSpawn(api, 'claude')) };
    const door = am2.list().accounts.find((a) => a.id === m).oatFile;
    ok(!fs.existsSync(kf) && sweeps.every((v) => v === 'none') && fs.readFileSync(credsOf(am2, m), 'utf8') === f0 && fs.readFileSync(path.join(am2.dataDir, 'accounts.json'), 'utf8') === acc0, 'O1 key-missing: ciphertext in the store and no key file — 3 sweeps mint NO key, the member\'s file and accounts.json byte-identical (F4\'s rung: nothing moves)', { keyFile: fs.existsSync(kf), sweeps });
    ok(codes.setOat === 'key-missing' && codes.add === 'key-missing' && codes.spawn === 'key-missing' && door && door.reason === 'key-missing', 'O1: every road refuses by NAME — setOat, a new API key, an API-key spawn (key-missing) — and the row says it', { codes, door });
    let words = ''; try { am2.add({ name: 'API3', key: APIKEY2 }); } catch (e) { words = e.message; }
    ok(/restore it from a backup/.test(words) && !/sk-ant/.test(words), 'O1: the refusal\'s words say restore the key file from a backup (and carry no secret)', words);
  }
  { // accounts.json holding ciphertext this process could NOT load + no key file ⇒ still key-missing (the disk is asked)
    const am = mk8(); fs.mkdirSync(am.dataDir, { recursive: true });
    fs.writeFileSync(path.join(am.dataDir, 'accounts.json'), '{"accounts":[{"id":"acct-1","keyEnc":"00:11:22"', { mode: 0o600 }); // truncated mid-write
    const am2 = new AccountManager({ dataDir: am.dataDir });
    ok(refusal(() => am2.add({ name: 'A', key: APIKEY })) === 'key-missing' && !fs.existsSync(am2._keyFile), 'O1: an accounts.json the store could not load still holds what it holds — its ciphertext keeps the key from being minted');
  }
  { // a FRESH store: no key, no ciphertext ⇒ minted ONCE (0600, 64 hex), and every later instance reads that one
    const am = mk8(); const kf = am._keyFile; const existed = fs.existsSync(kf);
    const id = am.add({ name: 'First', key: APIKEY }).id;
    const k1 = fs.readFileSync(kf, 'utf8'), mode = fs.statSync(kf).mode & 0o777;
    const am2 = new AccountManager({ dataDir: am.dataDir });
    ok(!existed && /^[0-9a-f]{64}$/.test(k1) && mode === 0o600 && am2.getKey(id) === APIKEY && fs.readFileSync(kf, 'utf8') === k1, 'O1 fresh: no key file and no ciphertext — the first secret mints ONE key (0600, 64 hex, through secret-box\'s link(2)), a second store reads the same one', { existed, mode: mode.toString(8) });
  }
  { // every other failure is key-unreadable:<code> FOR THAT CALL: nothing written, the next call reads again
    const faults = {
      EACCES: (kf) => { fs.chmodSync(kf, 0o000); return () => fs.chmodSync(kf, 0o600); },
      EIO: (kf) => hook(fs, 'readFileSync', function (r0, q, ...r) { if (String(q) === kf) throw errOf('EIO'); return r0.call(this, q, ...r); }),
      EMFILE: (kf) => hook(fs, 'readFileSync', function (r0, q, ...r) { if (String(q) === kf) throw errOf('EMFILE'); return r0.call(this, q, ...r); }),
      truncated: (kf) => { const k = fs.readFileSync(kf, 'utf8'); fs.writeFileSync(kf, k.slice(0, 32)); return () => fs.writeFileSync(kf, k); },
      emptied: (kf) => { const k = fs.readFileSync(kf, 'utf8'); fs.writeFileSync(kf, ''); return () => fs.writeFileSync(kf, k); },
    };
    const rows = {};
    for (const [name, apply] of Object.entries(faults)) {
      const am = mk8(); await nv(am, '2.1.296');
      const m = am.createSubscription({ name }).id; put(am, m, login(NOW, { dead: true })); await so(am, m, OAT);
      const kf = am._keyFile, acc0 = fs.readFileSync(path.join(am.dataDir, 'accounts.json'), 'utf8');
      const undo = apply(kf); const faulted = fs.readFileSync.length >= 0 ? (() => { try { return fs.readFileSync(kf, 'utf8'); } catch { return null; } })() : null;
      let r;
      try { r = { sweep: (await am.syncOatFiles())[m], fact: { ...am._oatFileFacts.get(m) }, setOat: refusal(() => am.setOat(m, OAT2)) }; } finally { undo(); }
      rows[name] = { ...r, keyNotReplaced: (() => { try { return faulted == null || fs.readFileSync(kf, 'utf8') !== faulted || name === 'truncated' || name === 'emptied'; } catch { return false; } })(), accSame: fs.readFileSync(path.join(am.dataDir, 'accounts.json'), 'utf8') === acc0, decryptsAfter: am.getOat(m) === OAT };
    }
    const want = { EACCES: 'EACCES', EIO: 'EIO', EMFILE: 'EMFILE', truncated: 'malformed', emptied: 'malformed' };
    ok(Object.entries(rows).every(([n, x]) => x.sweep === 'none' && x.fact.reason === 'key-unreadable' && x.fact.code === want[n] && x.setOat === 'key-unreadable:' + want[n] && x.accSame && x.decryptsAfter), 'O1 errnos: EACCES (a real chmod 000) / EIO / EMFILE / a truncated / an emptied key file — each a named key-unreadable:<code> for that call (the sweep moves nothing, setOat refuses, accounts.json untouched) and the secrets decrypt again once the fault is gone', rows);
  }

  // ── F2 RENAME-ASIDE: the swap and the remove move the judged file aside FIRST, check it, then act ──
  const toc = async (M, kind) => {
    const am = mk8(M); await nv(am, '2.1.296');
    const m = am.createSubscription({ name: 'T' }).id; put(am, m, login(NOW, { dead: true })); await so(am, m, OAT);
    const p = credsOf(am, m), strip = kind.startsWith('strip');
    if (strip) { const j = readJ(p); j.mcpOAuth = { s: 1 }; cliWrite(p, j); await am.syncOatFiles(); }
    const fr = strip ? { ...login(NOW), mcpOAuth: { s: 1 } } : login(NOW);
    let landed = false; const land = () => { if (!landed) { landed = true; cliWrite(p, fr); } };
    const at = kind.split(':')[1];
    const un = at === 'before-aside' ? hook(fsp8, 'rename', function (r0, s, d, ...r) { if (String(s) === p && /\.dead-\d+-a/.test(String(d))) land(); return r0.call(this, s, d, ...r); })
      : at === 'before-link' ? hook(fsp8, 'link', function (k0, s, d, ...r) { if (String(d) === p && /\.tmp$/.test(String(s))) land(); return k0.call(this, s, d, ...r); })
      : at === 'before-unlink' ? hook(fsp8, 'unlink', function (u0, q, ...r) { if (/\.dead-\d+-a/.test(String(q))) land(); return u0.call(this, q, ...r); })
      : at === 'old-rename' ? hook(fsp8, 'rename', function (r0, s, d, ...r) { if (String(d) === p && /\.tmp$/.test(String(s))) land(); return r0.call(this, s, d, ...r); }) // the verifier's window on c9fea70ad
      : hook(fsp8, 'unlink', function (u0, q, ...r) { if (String(q) === p) land(); return u0.call(this, q, ...r); });
    try { if (kind.startsWith('remint')) await so(am, m, OAT2); else await co(am, m); } finally { un(); }
    const f = am._oatFileFacts.get(m);
    return { landed, fresh: where(am, m, fr), fact: f && { verdict: f.verdict, code: f.code } };
  };
  const T2 = {};
  for (const k of ['remint:before-aside', 'remint:before-link', 'clear:before-aside', 'clear:before-unlink', 'strip:before-aside', 'strip:before-link']) T2[k] = await toc(undefined, k);
  ok(Object.values(T2).every((x) => x.landed && x.fresh !== 'LOST'), 'F2 toctou (the verifier\'s probe, ported to the new acts): a CLI login landing at every point of a re-mint swap, a clearOat and a strip — before the move aside, before the link into the empty name, before the aside\'s unlink — is never LOST', T2);
  ok(['remint:before-aside', 'clear:before-aside', 'strip:before-aside'].every((k) => T2[k].fresh === 'in place' && T2[k].fact.code === 'changed') && ['remint:before-link', 'strip:before-link'].every((k) => T2[k].fresh === 'in place' && T2[k].fact.code === 'changed'), 'F2: a login that is what moved goes straight back (refused · changed); one that took the empty name stays where it landed (refused · changed)', T2);
  const mF2r = mutantStore({ mat: [["    else if (expect !== undefined) {\n      const aside = await moveAside(dest, expect);\n      try { await linkInto(tmp, dest); } catch (e) { await putBack(aside, dest); throw e; } // a login that took the empty name stays; ours goes back or rests archived\n      try { await fsp.unlink(aside); } catch { }\n    } else await fsp.rename(tmp, dest);\n", "    else { if (expect !== undefined) await stillSame(dest, expect); await fsp.rename(tmp, dest); }\n"], ['  await fsp.unlink(await moveAside(p, seen.stat)); // F2: rename aside → check → unlink (never the name itself)\n', '  await stillSame(p, seen.stat);\n  await fsp.unlink(p);\n']] });
  const T2m = {};
  if (mF2r) for (const k of ['remint:old-rename', 'clear:old-unlink', 'strip:old-rename']) T2m[k] = await toc(mF2r, k);
  ok(!!mF2r && Object.values(T2m).every((x) => x.landed && x.fresh === 'LOST'), 'RED control (F2): c9fea70ad\'s check-then-rename / check-then-unlink — a login landing after the stat guard is LOST in all three acts (the legs above catch it)', T2m);
  { // what the rename-aside costs: the name is absent between the move aside and the link-in (a reader there sees ENOENT)
    const am = mk8(); await nv(am, '2.1.296');
    const m = am.createSubscription({ name: 'W' }).id; put(am, m, login(NOW, { dead: true })); await so(am, m, OAT);
    const p = credsOf(am, m), gaps = []; let t0 = null;
    const u1 = hook(fsp8, 'rename', function (r0, s, d, ...r) { const pr = r0.call(this, s, d, ...r); if (String(s) === p) pr.then(() => { t0 = process.hrtime.bigint(); }, () => { }); return pr; });
    const u2 = hook(fsp8, 'link', function (k0, s, d, ...r) { const pr = k0.call(this, s, d, ...r); if (String(d) === p && t0 != null) pr.then(() => { gaps.push(Number(process.hrtime.bigint() - t0) / 1e3); t0 = null; }, () => { }); return pr; });
    try { for (let i = 0; i < 100; i++) await so(am, m, i % 2 ? OAT : OAT2); } finally { u1(); u2(); }
    gaps.sort((a, b) => a - b);
    const q = (x) => gaps.length ? Math.round(gaps[Math.min(gaps.length - 1, Math.floor(x * gaps.length))]) : null;
    ok(gaps.length === 100 && readJ(p)?.claudeAiOauth?.accessToken === OAT && allArch(am, m).length === 1, `F2: 100 re-mint swaps through rename-aside — each leaves ours in place and no aside behind (one archive: the dead login); the name is absent ${q(0.5)} µs p50 / ${q(0.99)} µs p99 / ${gaps.length ? Math.round(gaps[gaps.length - 1]) : '?'} µs max per swap`, { n: gaps.length, archives: allArch(am, m) });
  }

  // ── F3 THE MERGE KEEPS THE SURVIVOR'S OTHER KEYS: the folded login over credsRestOf(ours), those keys archived first ──
  const mergeKeys = async (M, { foldedMcp = null } = {}) => {
    const am = mk8(M); await nv(am, '2.1.296');
    const into = am.createSubscription({ name: 'Into' }).id; am.setEmail(into, 's@example.com'); put(am, into, login(NOW, { dead: true })); await so(am, into, OAT);
    const mcp = { 'srv|1': { accessToken: 'mcp-' + crypto.randomBytes(3).toString('hex'), refreshToken: 'mcpr-' + crypto.randomBytes(3).toString('hex') } };
    const j = readJ(credsOf(am, into)); j.mcpOAuth = mcp; j.designOauth = { t: 'd' }; cliWrite(credsOf(am, into), j); await am.syncOatFiles();
    const from = am.createSubscription({ name: 'From' }).id; am.setEmail(from, 's@example.com');
    const lv = { ...login(NOW), ...(foldedMcp ? { mcpOAuth: foldedMcp } : {}) }; put(am, from, lv);
    am.mergeSubscription(from, into, { preferFromCreds: false, liveAccountIds: new Set() }); await am.oatFileSettled();
    const f = readJ(credsOf(am, into));
    const arch = allArch(am, into).map((n) => readJ(path.join(am.subDir(into), n)));
    return { login: f?.claudeAiOauth?.refreshToken === lv.claudeAiOauth.refreshToken, fileMcp: JSON.stringify(f?.mcpOAuth) === JSON.stringify(foldedMcp || mcp), design: f?.designOauth?.t === 'd', restArchived: arch.some((a) => a && JSON.stringify(a.mcpOAuth) === JSON.stringify(mcp) && !a.claudeAiOauth && !a.vibespaceOat), tokenFiles: tokenFiles(path.dirname(am.dataDir), OAT), fact: am._oatFileFacts.get(into)?.verdict };
  };
  const m3 = await mergeKeys(), m3c = await mergeKeys(undefined, { foldedMcp: { 'srv|2': { accessToken: 'other' } } });
  ok(m3.login && m3.fileMcp && m3.design && m3.restArchived, 'F3 merge.cliKeys (the verifier\'s probe): a live login folded onto a member holding OUR file — the new file is the login over the CLI\'s other keys (mcpOAuth + designOauth kept), and those keys were archived first', m3);
  ok(m3c.login && m3c.fileMcp && m3c.restArchived, 'F3: …a folded login that brings its OWN mcpOAuth wins the key, and the survivor\'s is in the archive — never lost', m3c);
  ok(m3.tokenFiles.length === 0 && m3c.tokenFiles.length === 0, 'F3: our token rests in no file afterwards — not the new file, not the archive (the survivor now has a live login; the store keeps the token)', { a: m3.tokenFiles, b: m3c.tokenFiles });
  const mF3 = mutantStore({ acc: [['        if (fromBytes && oatFileOurs(intoFile, intoId)) {\n', '        if (false) {\n']] });
  const m3m = mF3 ? await mergeKeys(mF3) : null;
  ok(!!m3m && m3m.login && !m3m.fileMcp && !m3m.restArchived, 'RED control (F3): c9fea70ad\'s whole-file copy — mcpOAuth in no file and no archive (the legs above catch it)', m3m);

  // ── the two lows: a top-level "__proto__" key kept; a symlinked credential FILE named on its row ──
  {
    const txt = '{"__proto__":{"polluted":true},"mcpOAuth":{"a":1},"claudeAiOauth":{"accessToken":"x"},"vibespaceOat":{"v":1}}';
    const r = LE.credsRestOf(JSON.parse(txt));
    const merged = JSON.stringify(LE.oatFileMerge(JSON.parse(txt), { claudeAiOauth: { accessToken: 'y' }, vibespaceOat: { v: 1, account: 'a' } }));
    ok(Object.prototype.hasOwnProperty.call(r, '__proto__') && Object.getPrototypeOf(r) === Object.prototype && JSON.stringify(r) === '{"__proto__":{"polluted":true},"mcpOAuth":{"a":1}}' && merged.includes('"__proto__":{"polluted":true}') && ({}).polluted === undefined, 'low ①: a top-level "__proto__" key (JSON.parse makes it an OWN key) is kept by credsRestOf and the merge — an own data property, never the prototype', { rest: JSON.stringify(r), merged: merged.slice(0, 120) });
  }
  {
    const am = mk8(); await nv(am, '2.1.296');
    const m = am.createSubscription({ name: 'SymFile' }).id;
    const real = fs.mkdtempSync(path.join(tmp, 'symfile-')); const tgt = path.join(real, 'creds.json');
    fs.writeFileSync(tgt, JSON.stringify(login(NOW, { dead: true })), { mode: 0o600 }); const b = sha(tgt);
    fs.symlinkSync(tgt, credsOf(am, m));
    const r = await so(am, m, OAT); const again = (await am.syncOatFiles())[m];
    const door = am.list().accounts.find((a) => a.id === m).oatFile;
    ok(r.oatFile === 'write-failed' && again === 'write-failed' && door && door.code === 'symlink' && sha(tgt) === b && fs.lstatSync(credsOf(am, m)).isSymbolicLink() && !allArch(am, m).length && fs.readdirSync(real).length === 1, 'low ②: a .credentials.json that is itself a symlink is never archived or written through, and its row says so (write-failed · symlink), sweep after sweep', { r: r.oatFile, again, door });
    const d = am.createSubscription({ name: 'Dangling' }).id; const gone = path.join(real, 'never-there.json');
    put(am, d, login(NOW, { dead: true })); await so(am, d, OAT); // the shape is recorded (ours written) …
    fs.unlinkSync(credsOf(am, d)); fs.symlinkSync(gone, credsOf(am, d)); // … then the name becomes a dangling symlink
    const rd = { oatFile: (await am.syncOatFiles())[d] }; const doorD = am.list().accounts.find((a) => a.id === d).oatFile;
    ok(rd.oatFile === 'write-failed' && doorD && doorD.code === 'symlink' && !fs.existsSync(gone) && fs.lstatSync(credsOf(am, d)).isSymbolicLink(), 'low ②: …a DANGLING one too (the link-in\'s EEXIST is asked what is there): write-failed · symlink, no target created', { rd: rd.oatFile, door: doorD });
  }
  if (!MA5) ok(false, 'the real manage-agents chip module (§5) for the words');
  else {
    const row = (reason, code) => ({ id: 'sub-k', name: 'K', loginState: { state: 'oat-only', msLeft: 200 * DAY, refreshExpiresAt: NOW - H, oatValidUntil: NOW + 200 * DAY }, oatFile: { state: 'refused', reason, ...(code ? { code } : {}) } });
    const c1 = MA5.loginExpiryChipHtml(row('key-missing')), c2 = MA5.loginExpiryChipHtml(row('key-unreadable', 'EIO')), c3 = MA5.loginExpiryChipHtml(row('write-failed', 'symlink'));
    ok(/the key file is missing — restore it from a backup/.test(c1) && /the key file could not be read \(EIO\) — nothing was replaced/.test(c2) && /the credential file is a symlink — nothing written/.test(c3), 'the row\'s chip (the real manage-agents module) says each: the key file is missing — restore it from a backup / could not be read (EIO) — nothing was replaced / the credential file is a symlink', { c1: c1.slice(0, 200), c2: c2.slice(0, 200), c3: c3.slice(0, 200) });
    const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
    const K8 = ['the key file is missing — restore it from a backup', 'the key file could not be read ({code}) — nothing was replaced', 'the credential file is a symlink — nothing written'];
    ok(zh[K8[0]] === '密钥文件丢失——恢复备份' && K8.every((k) => zh[k] && ja[k] && zh[k].includes('{code}') === k.includes('{code}') && ja[k].includes('{code}') === k.includes('{code}')), 'zh says the brief\'s words 「密钥文件丢失——恢复备份」; every new door word has zh + ja with its placeholder');
  }
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(`\ntest-oat-materialize: ${pass} passed, ${fail} failed · ${Date.now() - T0} ms`);
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
