#!/usr/bin/env node
// test-dropline-signin-held — THE VOICE SIGN-IN's FILE UNDER THE STORE-READ LAW (主开发 r3334 unit 2; lane bl-chat-b). data/dropline-oauth.json
// holds the Dropline sign-in pair (sealed through the vault once it is set up) and the hub's own registered client. The release read a
// torn file as ABSENT (the card said «Connect», and the person's next Connect wrote over it: the pair and the registration lost) and a read
// that FAILED as «not connected» (a Connect exchanged its code and wrote over the unread file; a Disconnect removed it). These legs drive the
// REAL sealed file, the REAL Dropline client and the REAL Connect start, with a stand-in vendor (a counted fetch, no network) and the file
// made unreadable by a PLACED refusal of the read call (EIO — never a mount, never a mode change):
//   ① HELD (a read that failed): the account says «unread», never «connect»; a Connect, the landing's code exchange, a Disconnect and a
//      refresh are refused BY NAME (503 voice_signin_unread) before any vendor call and before any write; the route says it; nothing is
//      written over or removed; at the lift the pair is back (nothing lost).
//   ② TORN bytes: kept aside ONCE (0600 from its create, the same bytes); the account says «damaged» with the copy's name; Connect is the
//      way out (a fresh pair written over them, their copy kept); THE SECRET LENS — no journal line, no log, no route reply carries a
//      byte of the torn sign-in (a secret-shaped refresh token planted in it, built at runtime).
//   ③ THE PAGE's WORDS: the family's table row, the Connect block's two words (a closed set), the mic's two codes, each with zh and ja.
//   ④ THE COPIES UNDER THE VAULT's LAW (主开发 r3932): no plain copy of a sign-in outlives its live file's seal or replace — a torn
//      plain file, the vault set up (its copy SEALED in place), then a Connect: no file holds a byte of the torn sign-in; with no vault a
//      Connect, and a Disconnect, SHRED the plain copy; a copy made while the vault is open is a box from its creation (no write the
//      helper made carries a plain byte) and is its copy at the next start; while it is locked none is made (the lock's refusal).
//   ⑤ THE SMALL ITEMS (r3932): the open hook writes nothing while held; a dictation while held answers the hold's code; a second tear
//      with other bytes is copied once more; the Test press while held says the hold's words; the chip while unread has no Connect look.
//   ⑥ THE COPIES' ROAD OFF THE LOOP (主开发 r4045): a placed stall in the main thread's own file calls on the copies during a Connect —
//      nothing stalled, the copy gone before the reply; a shred that fails is told (the reply and the account's words); a stop's part
//      file is swept.
//   RED CONTROLS: a copy of the sealed file with the release's read (① ② red); copies with one r3932 / r4045 line cut each (④ ⑤ ⑥ red).
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { anchored, scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const cons = { log: console.log, warn: console.warn, error: console.error };   // the suite's own lines go to the real console (the lens captures the rest)
const { ok: check0, report } = checker({ log: (l) => cons.log(l), err: (l) => cons.error(l) });
const ok = (name, cond, detail) => { if (typeof name !== 'string') throw new TypeError('ok(name, cond): this suite\'s legs are NAME-FIRST'); return check0(!!cond, name, detail); };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const SJ = require(path.join(REPO, 'src/server/sealed-json.js'));
const DC = require(path.join(REPO, 'src/server/dropline-client.js'));
const DO = require(path.join(REPO, 'src/server/dropline-oauth.js'));
const HOLD = require(path.join(REPO, 'src/store-read-hold.js'));
const REG_WORDS = () => require(path.join(REPO, 'src/integration-registry.js')).ROWS.find((x) => x.id === 'dropline').connect.words;   // r4045: the row's words
const { mutantCopies } = await import(path.join(REPO, 'scripts/mutant-copy.mjs'));
const MO = mutantCopies('dropline-held', REPO);
const ROOT = scratch('dropline-held'); fs.mkdirSync(ROOT, { recursive: true });
let dirs = 0;
const mkdir = () => { const d = path.join(ROOT, `d${++dirs}`); fs.mkdirSync(d, { recursive: true }); return d; };

// ── the PLACED refusal: the file's read call answers EIO while its path is in `refused` ──
const realRead = fs.readFileSync, realPRead = fs.promises.readFile;
const refused = new Set();
const eio = () => Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO', errno: -5, syscall: 'read' });
fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && refused.has(path.resolve(p))) throw eio(); return realRead.call(this, p, ...a); };
fs.promises.readFile = async function (p, ...a) { if (typeof p === 'string' && refused.has(path.resolve(p))) throw eio(); return realPRead.call(this, p, ...a); };

// ── THE SECRET LENS: everything said is captured (the journal = the hold's log + console; the routes' replies) ──
const said = [];
for (const k of ['log', 'warn', 'error']) console[k] = (...a) => { said.push(a.map(String).join(' ')); };
const restoreConsole = () => { for (const k of Object.keys(cons)) console[k] = cons[k]; };
// a secret-shaped refresh token, built at runtime by joining pieces (never a literal in the tree)
const SECRET = ['drt', 'live', Buffer.from('torn-signin-lens').toString('hex')].join('_');

// ── a stand-in vendor: every call counted, none leaves the process ──
const calls = [];
const vendor = async (url, init = {}) => {
  const u = new URL(String(url)); calls.push(u.pathname);
  const j = (o, s = 200) => new Response(J(o), { status: s, headers: { 'content-type': 'application/json' } });
  if (u.pathname === '/oauth/register') return j({ client_id: 'vsc-fresh-1' });
  if (u.pathname === '/oauth/token') return j({ access_token: 'acc-fresh', refresh_token: 'ref-fresh', expires_in: 3600 });
  if (u.pathname === '/v1/me') return j({ name: 'userL', team: 'team-a' });
  return j({}, 404);
};
const noKey = { resolveIntegration: () => ({ values: {}, source: null }), setIntegration: () => { } };
const PAIR = (dir) => ({ access: 'acc-old', accessExp: Date.now() + 3600e3, refresh: SECRET, refreshExp: Date.now() + 30 * 864e5, clientId: 'vsc-kept', name: 'userL', team: 'team-a', registeredFor: 'https://hub.example.test/api/channels/oauth/cb/dropline', registeredClientId: null });
function sceneOf(mod = SJ, { bytes, dc = DC } = {}) {
  const dir = mkdir(), file = path.join(dir, 'dropline-oauth.json');
  fs.writeFileSync(file, bytes !== undefined ? bytes : J(PAIR(dir)), { mode: 0o600 });
  const logs = [];
  const tokens = mod.sealedJson(file, { dataDir: dir, hold: { code: 'voice_signin_unread', log: (l) => logs.push(String(l)), words: (h) => `the voice sign-in (dropline-oauth.json in VibeSpace's data folder) could not be read (${(h && h.code) || 'unreadable'}) — nothing was changed and no sign-in is lost` } });
  const client = dc.create({ integrations: () => noKey, tokens, fetchImpl: vendor, log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)) } });
  const flows = { begin: async ({ buildConsentUrl, redirectUri }) => ({ flowId: 'f1', consentUrl: buildConsentUrl({ redirectUri, state: 's1' }) }) };
  const oauth = DO.create({ client, flows, integrations: () => noKey, instanceUrl: () => 'https://hub.example.test', tokens, log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)) } });
  return { dir, file, tokens, client, oauth, logs, bytes: realRead(file) };
}
const rejectsOf = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const rowOf = (file) => HOLD.holds().find((r) => r.file === path.basename(file) && r.held) || null;
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(15); } return !!(await fn()); };
const copiesIn = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith('dropline-oauth.json.corrupt-'));

// THE RELEASE's READ, for the red controls (0a031b541: a failed read throws raw; torn bytes are absent; nothing is held)
const SSRC = read('src/server/sealed-json.js');
const READ_RE = /    \{ const no = heldRefusal\(`reading \$\{base\}`\); if \(no\) throw no; \}\n[\s\S]*?\n      \}\n    \}\n/;   // stale-pins: kept
const RELEASE_READ = "    const st = stateOf();\n    const text = readRaw();\n    let j = null;\n    if (text !== null) { try { j = JSON.parse(text); } catch { j = null; } }\n";   // stale-pins: kept (the release's read, the red control's replacement)
const RELEASE = MO.load('src/server/sealed-json.js', anchored(SSRC, READ_RE, RELEASE_READ, 'the release read'), 'release-read');

console.log('① HELD — a read that failed: «unread», every act refused by name before any vendor call or write; the pair back at the lift');
{
  const S = sceneOf();
  refused.add(S.file);
  const a = S.client.account();
  ok('the account while the sign-in is HELD says «unread» — never «connect» (no pair known, none taken as absent)', a.tier === 'oauth' && a.state === 'unread' && S.client.connected() === false, a);
  ok('…and the hold is LISTED for the family\'s notice (its base name, its code)', !!rowOf(S.file) && rowOf(S.file).code === 'EIO', HOLD.holds());
  const eStart = await rejectsOf(() => S.oauth.start({ origin: 'https://hub.example.test' }));
  ok('A CONNECT while held is REFUSED BY NAME (503 voice_signin_unread) before any vendor call (no registration)', !!eStart && eStart.status === 503 && eStart.code === 'voice_signin_unread' && calls.length === 0, { e: eStart && eStart.message, calls });
  const eLand = await rejectsOf(() => S.client.connectWith({ clientId: 'vsc-kept', code: 'code-1', verifier: 'v', redirectUri: 'https://hub.example.test/cb' }));
  ok('…THE LANDING\'s code exchange while held is refused by name BEFORE the token call (the code stays unspent), nothing written over', !!eLand && eLand.status === 503 && eLand.code === 'voice_signin_unread' && calls.length === 0 && realRead(S.file).equals(S.bytes), { e: eLand && eLand.message, calls });
  const eOff = await rejectsOf(() => S.client.disconnect());
  ok('A DISCONNECT while held is refused by name: the unread file is NOT removed', !!eOff && eOff.code === 'voice_signin_unread' && fs.existsSync(S.file) && realRead(S.file).equals(S.bytes), eOff && eOff.message);
  const eRef = await rejectsOf(() => S.client.refreshPair());
  ok('A REFRESH while held is refused by name — never «the sign-in has ended, connect again», no reconnect mark written', !!eRef && eRef.code === 'voice_signin_unread' && calls.length === 0 && realRead(S.file).equals(S.bytes), eRef && eRef.message);
  // THE ROUTE: the voice door says it by name (status 503 + the code the page words from the family's table)
  const express = require(path.join(REPO, 'node_modules/express'));
  const app = express(); app.use(express.json()); app.use(require(path.join(REPO, 'src/routes/voice.js')).create({ client: S.client, oauth: S.oauth, prefs: () => ({ enabled: true, config: {} }), log: { log() { }, warn() { } } }));
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const st = await (await fetch(`${base}/api/voice/status`)).json();
  const rs = await fetch(`${base}/api/voice/oauth/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const rb = await rs.json();
  ok('THE ROUTE: the status says «unread»; POST /api/voice/oauth/start answers 503 voice_signin_unread (no vendor call)', st.account && st.account.state === 'unread' && rs.status === 503 && rb.error === 'voice_signin_unread' && calls.length === 0, { st: st.account, status: rs.status, rb });
  srv.close();
  // THE LIFT: the read answers again — the pair is back, nothing lost
  refused.delete(S.file);
  const lifted = await HOLD.readAgainOf(rowOf(S.file));
  const a2 = S.client.account();
  ok('AT THE LIFT the sign-in reads again: connected as before, the same pair (nothing was lost)', lifted === true && a2.state === 'connected' && a2.name === 'userL' && S.client.connected() === true && realRead(S.file).equals(S.bytes), a2);
  S.tokens.dispose();
  // RED CONTROL: the release's read — the same scene reads «connect», the landing exchanges its code and writes over the unread file
  const R = sceneOf(RELEASE);
  refused.add(R.file);
  const ra = R.client.account();
  calls.length = 0;
  const eR = await rejectsOf(() => R.client.connectWith({ clientId: 'vsc-kept', code: 'code-1', verifier: 'v', redirectUri: 'https://hub.example.test/cb' }));
  refused.delete(R.file);
  let over = false; try { over = JSON.parse(realRead(R.file, 'utf8')).refresh !== SECRET; } catch { over = false; }
  ok('RED CONTROL (the release\'s read, in a copy): the held scene says «connect» and the landing EXCHANGES its code and writes over the unread pair', ra.state === null && !eR && calls.includes('/oauth/token') && over, { ra, eR: eR && eR.message, calls, over });
  calls.length = 0;
}

console.log('② TORN bytes — kept aside once (0600), said damaged, Connect the way out; no byte of them said anywhere');
const TORN = Buffer.from(`{"access":"acc-old","refresh":"${SECRET}","clientId":"vsc-k`);
{
  const T = sceneOf(SJ, { bytes: TORN });
  const a1 = T.client.account();
  await until(() => T.client.account().state === 'damaged');
  const a = T.client.account(), cp = copiesIn(T.dir);
  const mode = cp.length ? fs.statSync(path.join(T.dir, cp[0])).mode & 0o777 : null;
  ok('torn bytes are kept aside ONCE (the same bytes, 0600 from its create); the live file left as it was', cp.length === 1 && realRead(path.join(T.dir, cp[0])).equals(TORN) && mode === 0o600 && realRead(T.file).equals(TORN), { cp, mode });
  ok('…the account says «damaged» with the copy\'s name (while the copy was made, «unread» — never «connect»)', a.state === 'damaged' && a.copy === cp[0] && (a1.state === 'unread' || a1.state === 'damaged') && T.client.connected() === false, { a1, a });
  T.client.account(); T.client.account();
  ok('…read again, the same torn bytes stay damaged and are NOT copied again', copiesIn(T.dir).length === 1 && T.client.account().state === 'damaged');
  // Connect is the way out: a fresh pair written over the torn bytes, their copy kept
  const r = await T.oauth.start({ origin: 'https://hub.example.test' });
  await T.client.connectWith({ clientId: 'vsc-fresh-1', code: 'code-2', verifier: 'v', redirectUri: 'https://hub.example.test/api/channels/oauth/cb/dropline' });
  const a3 = T.client.account();
  let fresh = null; try { fresh = JSON.parse(realRead(T.file, 'utf8')); } catch { fresh = null; }
  ok('CONNECT is the way out: a new registration, the code exchanged, a fresh pair written over the torn bytes; their plain copy SHREDDED (r3932: no vault set up, so no road to seal it under); connected', r.ok === true && calls.includes('/oauth/register') && calls.includes('/oauth/token') && !!fresh && fresh.access === 'acc-fresh' && a3.state === 'connected' && copiesIn(T.dir).length === 0, { r, calls, a3 });
  // THE SECRET LENS: no journal line, no log, no reply carries a byte of the torn sign-in
  const express = require(path.join(REPO, 'node_modules/express'));
  const T2 = sceneOf(SJ, { bytes: TORN });
  T2.client.account(); await until(() => T2.client.account().state === 'damaged');
  const app = express(); app.use(express.json()); app.use(require(path.join(REPO, 'src/routes/voice.js')).create({ client: T2.client, oauth: T2.oauth, prefs: () => ({ enabled: true, config: {} }), log: { log() { }, warn() { } } }));
  const srv = http.createServer(app); await new Promise((rr) => srv.listen(0, '127.0.0.1', rr));
  const replies = [await (await fetch(`http://127.0.0.1:${srv.address().port}/api/voice/status`)).text()];
  srv.close();
  const lines = [...said, ...T.logs, ...T2.logs, ...replies];
  const leaks = lines.filter((l) => l.includes(SECRET) || l.includes(SECRET.slice(9, 25)) || /Unexpected|is not valid JSON/.test(l));
  ok('THE SECRET LENS: no journal line, no log line and no route reply carries a byte of the torn sign-in (nor the parse\'s message, which quotes bytes)', leaks.length === 0 && lines.length > 0, { leaks: leaks.map((l) => l.slice(0, 120)), n: lines.length });
  ok('…and the status reply names the copy only by its base name', replies[0].includes(copiesIn(T2.dir)[0]) && !replies[0].includes(T2.dir), replies[0].slice(0, 300));
  T.tokens.dispose(); T2.tokens.dispose();
  // RED CONTROL: the release's read — torn bytes are absent: «connect», no copy, the next Connect writes over them
  const R = sceneOf(RELEASE, { bytes: TORN });
  const ra = R.client.account();
  ok('RED CONTROL (the release\'s read, in a copy): torn bytes read as absent — «connect», no copy kept (the next Connect writes over the only copy)', ra.state === null && copiesIn(R.dir).length === 0, ra);
}

console.log('③ THE PAGE\'s WORDS — the table row, the Connect block\'s two words, the mic\'s two codes; zh and ja with them');
{
  const U = read('src/lib/utils.js'), ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  const REG = require(path.join(REPO, 'src/integration-registry.js'));
  const VM = require(path.join(REPO, 'src/voice-model.js'));
  const row = /\n  voice_signin_unread: \(\) => t\('((?:[^'\\]|\\.)+)'\)/.exec(U);
  const w = REG.ROWS.find((x) => x.id === 'dropline').connect.words;
  const sentences = [row && row[1].replace(/\\'/g, "'"), w.unread, w.damaged, w.left, VM.voiceWords('voice-signin-held').words, VM.voiceWords('signin-damaged').words].map((x) => (x && typeof x === 'object' && x.key) ? x.key : x);
  const both = (s) => !!s && ZH.includes(J(s) + ':') && JA.includes(J(s) + ':');
  ok('the family\'s table words voice_signin_unread; the Connect block declares «unread» and «damaged» (a closed set); the mic has both codes; each sentence has zh and ja', !!row && REG.CONNECT_WORDS.includes('unread') && REG.CONNECT_WORDS.includes('damaged') && REG.CONNECT_WORDS.includes('left') && VM.VOICE_CODES.includes('voice-signin-held') && VM.VOICE_CODES.includes('signin-damaged') && sentences.every(both), sentences.map((s) => [String(s).slice(0, 50), both(s)]));
  ok('…no sentence names a file path; the damaged one names only the copy by its {copy} slot, and none says to restore it', sentences.every((s) => !/data\/|\.json/.test(String(s)) && !/restore/i.test(String(s))) && /\{copy\}/.test(String(w.damaged && (w.damaged.key || w.damaged))));
}

// ── r3932: a real vault over a scene's data folder (the hub's engine, a cheap KDF; its open hook wired as the hub wires it) ──
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const SB = require(path.join(REPO, 'src/secret-box.js'));
const { wireVaultHooks } = require(path.join(REPO, 'src/server/vault-hooks.js'));
const PW = ['correct', 'horse', 'battery', 'staple'].join(' ');
const quiet = { log() { }, warn() { }, error() { } };
const engines = [];
const mkVault = (dir, ...sealed) => { const v = VE.create({ dataDir: dir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false }); engines.push(v); wireVaultHooks({ vault: v, sealed, log: quiet }); return v; };
const holdOf = (logs) => ({ code: 'voice_signin_unread', log: (l) => logs.push(String(l)), words: (h) => `the voice sign-in could not be read (${(h && h.code) || 'unreadable'})` });
const handleOf = (S, mod = SJ) => mod.sealedJson(S.file, { dataDir: S.dir, hold: holdOf(S.logs) });   // a restart: a fresh handle on the same file
/** every file in the folder whose bytes carry the torn sign-in's secret (the lens on disk) */
const hits = (dir) => fs.readdirSync(dir).filter((n) => { try { const f = path.join(dir, n); return fs.lstatSync(f).isFile() && realRead(f).includes(SECRET); } catch { return false; } });
const boxOf = (dir, n) => { try { const j = JSON.parse(realRead(path.join(dir, n), 'utf8')); return SJ.isSealed(j) && j.copy === 'torn-bytes' ? j : null; } catch { return null; } };
const opened = (v, j) => Buffer.from(SB.decWith(v.secretGet('file:dropline-oauth.json').value, j.box), 'base64');
const tornCopied = async (mod = SJ) => { const S = sceneOf(mod, { bytes: TORN }); S.client.account(); await until(() => S.client.account().state === 'damaged'); return S; };
const connect = async (S) => { await S.oauth.start({ origin: 'https://hub.example.test' }); await S.client.connectWith({ clientId: 'vsc-fresh-1', code: 'code-4', verifier: 'v', redirectUri: 'https://hub.example.test/api/channels/oauth/cb/dropline' }); };
const tornOnce = async (H) => { try { H.read(); } catch { /* held while its copy is made */ } await until(() => !!H.torn()); return H.torn(); };
// THE r3932 LINES, cut one at a time in copies (the red controls of ④ ⑤)
const cut = (src, anchor, to, name) => anchored(src, anchor, to, name);   // stale-pins: kept (each anchor below is a line r3932 added)
const CUT_COPIES = MO.load('src/server/sealed-json.js', cut(cut(SSRC, 'function sealCopies({ parts = false } = {}) {\n', 'function sealCopies({ parts = false } = {}) { return Promise.resolve(0);\n', 'the seal of the copies'), 'function shredPlainCopies() {\n', 'function shredPlainCopies() { return Promise.resolve({ removed: 0, left: [] });\n', 'the shred of the copies'), 'copies-cut');
const CUT_ROAD = MO.load('src/server/sealed-json.js', cut(SSRC, /\n    copy: \{ bytes: \(buf\) => copyBytes\(buf\), opens: \(on\) => copyOpens\(on\) \},[^\n]*/, '', 'the copy road'), 'road-cut');
const CUT_OPENS = MO.load('src/server/sealed-json.js', cut(SSRC, 'function copyOpens(on) { ', 'function copyOpens(on) { return on; ', 'a box opened back'), 'opens-cut');
const CUT_LOCKED = MO.load('src/server/sealed-json.js', cut(SSRC, /\n        if \(st === 'locked'\) throw lockedRefusal\(\);[^\n]*/, '', 'no copy while locked'), 'locked-cut');
const CUT_SEALHELD = MO.load('src/server/sealed-json.js', cut(SSRC, /\n    if \(H && H\.held\(\)\) return false;   \/\/ r3334: HELD — nothing is written over the unread file[^\n]*/, '', 'the open hook while held'), 'seal-held-cut');
const HSRC = read('src/store-read-hold.js');
const SIZE_HELPER = MO.write('src/store-read-hold.js', cut(HSRC, '&& sameAs(await fs.promises.readFile(p), buf)) return n;', '&& true) return n;', 'the compare byte for byte'), 'size-only');
const CUT_COMPARE = MO.load('src/server/sealed-json.js', cut(SSRC, "const HOLD = require('../store-read-hold.js');", `const HOLD = require(${J(SIZE_HELPER)});`, 'the helper'), 'compare-cut');
const DSRC = read('src/server/dropline-client.js');
const DC_TEST = MO.load('src/server/dropline-client.js', cut(DSRC, /\n    if \(!key && !livePair\(\) && heldNow\(\)\)[^\n]*/, '', 'the Test press while held'), 'test-cut');
const VSRC = read('src/routes/voice.js');
const VOICE_CUT = MO.load('src/routes/voice.js', cut(VSRC, /\n      if \(!st\.connected && st\.account && st\.account\.state === 'unread'\)[^\n]*/, '', 'a dictation while held'), 'dictate-cut');

console.log('④ THE COPIES UNDER THE VAULT\'s LAW (r3932) — sealed at its seal, shredded at the person\'s act, a box from its creation while open, none while locked');
{
  // THE LEG r3932 NAMES: a torn plain file, the vault set up, then a Connect — no plain copy is left
  const A = await tornCopied();
  const cp0 = copiesIn(A.dir);
  ok('(the scene) a torn plain file with no vault: its copy is the plain bytes', cp0.length === 1 && realRead(path.join(A.dir, cp0[0])).equals(TORN), cp0);
  const v = mkVault(A.dir, A.tokens);
  const su = await v.setup(PW, {});
  await A.tokens.settled();   // r4045: the opening never waits for the copies' sweep — the leg waits for its turn
  const box = boxOf(A.dir, cp0[0]);
  ok('THE VAULT\'s SEAL (the setup\'s open hook): the copy SEALED in place — its name kept, a box under the store\'s own key holding the bytes as they are; only the torn live file still holds them', su.ok && copiesIn(A.dir).length === 1 && !!box && opened(v, box).equals(TORN) && hits(A.dir).join() === 'dropline-oauth.json' && A.client.account().state === 'damaged' && A.client.account().copy === cp0[0], { su, hits: hits(A.dir) });
  await connect(A);
  ok('…THEN A CONNECT: connected, and NO FILE in the data folder holds a byte of the torn sign-in — no plain copy is left (the sealed copy stays the person\'s)', A.client.account().state === 'connected' && hits(A.dir).length === 0 && copiesIn(A.dir).length === 1 && !!boxOf(A.dir, copiesIn(A.dir)[0]), hits(A.dir));
  A.tokens.dispose();
  const R = await tornCopied(CUT_COPIES);
  const vr = mkVault(R.dir, R.tokens); await vr.setup(PW, {}); await R.tokens.settled();
  await connect(R);
  ok('RED CONTROL (the copies\' seal and shred cut, in a copy): after the vault\'s seal and a Connect the PLAIN copy is still there, for good', hits(R.dir).length === 1 && hits(R.dir)[0].startsWith('dropline-oauth.json.corrupt-'), hits(R.dir));
  R.tokens.dispose();
  // no vault: a Connect, and a Disconnect, SHRED the plain copy
  const B = await tornCopied(), B2 = await tornCopied(), RB = await tornCopied(CUT_COPIES);
  await connect(B); const off = await B2.client.disconnect(); await connect(RB);
  ok('NO VAULT SET UP: a Connect SHREDS the plain copy, and so does a Disconnect (the person\'s own acts) — no byte of the torn sign-in left in either folder', B.client.account().state === 'connected' && copiesIn(B.dir).length === 0 && hits(B.dir).length === 0 && off.ok === true && copiesIn(B2.dir).length === 0 && hits(B2.dir).length === 0, { b: copiesIn(B.dir), b2: copiesIn(B2.dir) });
  ok('RED CONTROL (the same cut): the Connect leaves the plain copy', copiesIn(RB.dir).length === 1 && hits(RB.dir).length === 1, copiesIn(RB.dir));
  for (const x of [B, B2, RB]) x.tokens.dispose();
  // a copy made while the vault is OPEN: a box from its creation (no write the helper made carries a plain byte), its copy at the next start
  const fh0 = await fs.promises.open(path.join(ROOT, 'fh-probe'), 'w'); const FHP = Object.getPrototypeOf(fh0); await fh0.close();
  const realFhWrite = FHP.writeFile, written = [];
  const openCopy = async (mod) => {
    const C = sceneOf(SJ); const vc = mkVault(C.dir, C.tokens); await vc.setup(PW, {}); C.tokens.dispose();
    fs.writeFileSync(C.file, TORN, { mode: 0o600 });
    written.length = 0; FHP.writeFile = function (data, ...a) { written.push(Buffer.from(data)); return realFhWrite.call(this, data, ...a); };
    const C2 = handleOf(C, mod); const t2 = await tornOnce(C2); await C2.settled();
    FHP.writeFile = realFhWrite;
    const w = written.slice();
    C2.dispose(); const C3 = handleOf(C, mod); const t3 = await tornOnce(C3); await C3.settled(); C3.dispose();
    return { C, vc, t2, t3, w, cp: copiesIn(C.dir) };
  };
  const O = await openCopy(SJ);
  ok('A COPY MADE WHILE THE VAULT IS OPEN is written sealed from its creation: one copy, a box of the bytes as they are; no write the helper made carried a plain byte of them', O.cp.length === 1 && !!boxOf(O.C.dir, O.cp[0]) && opened(O.vc, boxOf(O.C.dir, O.cp[0])).equals(TORN) && O.w.length > 0 && !O.w.some((b) => b.includes(SECRET)) && !!O.t2 && O.t2.copy === O.cp[0], { cp: O.cp, w: O.w.length });
  ok('…met again at the next start, the box IS their copy (opened back for the compare): none made again', !!O.t3 && O.t3.copy === O.cp[0] && O.cp.length === 1, O.t3);
  const OR = await openCopy(CUT_ROAD), OO = await openCopy(CUT_OPENS);
  ok('RED CONTROL (the copy road cut, in a copy): the copy is WRITTEN PLAIN while the vault is open (sealed only at its lift, not from its creation) and the same bytes are copied again at the next start', OR.w.some((b) => b.includes(SECRET)) && OR.cp.length === 2, { cp: OR.cp, plainWrites: OR.w.filter((b) => b.includes(SECRET)).length });
  ok('RED CONTROL (a box not opened back for the compare): the same torn bytes are copied AGAIN at every start', OO.cp.length === 2, OO.cp);
  // while the vault is LOCKED: no copy (the lock's refusal), then at the unlock a box
  const lockedRead = async (mod, { unlock = true } = {}) => {
    const L = sceneOf(SJ); const vl = mkVault(L.dir, L.tokens); await vl.setup(PW, {}); L.tokens.dispose(); vl.lock('door');
    fs.writeFileSync(L.file, TORN, { mode: 0o600 });
    const L2 = handleOf(L, mod); let e = null; try { L2.read(); } catch (x) { e = x; }
    await sleep(120);
    const r = { e, held: L2.held(), cp: copiesIn(L.dir) };
    if (!unlock) { L2.dispose(); return r; }
    wireVaultHooks({ vault: vl, sealed: [L2], log: quiet }); await vl.unlock(PW, {});
    r.t = await tornOnce(L2); await L2.settled(); r.after = copiesIn(L.dir); r.box = r.after.length === 1 && !!boxOf(L.dir, r.after[0]); L2.dispose();
    return r;
  };
  const K = await lockedRead(SJ), KR = await lockedRead(CUT_LOCKED, { unlock: false });
  ok('WHILE THE VAULT IS LOCKED a torn file is refused as LOCKED (its own words) — nothing copied, nothing held; at the unlock it is copied as a box', !!K.e && K.e.code === 'vault_locked' && K.held === null && K.cp.length === 0 && !!K.t && K.box, { e: K.e && K.e.code, held: K.held, cp: K.cp, after: K.after });
  ok('RED CONTROL (that line cut, in a copy): the locked read is HELD as «unread» (the ladder armed) for a vault that is only locked', !!KR.e && KR.e.code === 'voice_signin_unread' && !!KR.held, { e: KR.e && KR.e.code, held: KR.held });
}

console.log('⑤ THE SMALL ITEMS (r3932) — the open hook while held, a dictation while held, a second tear, the Test press, the chip');
{
  // the vault's open hook writes NOTHING while held — the hold stands until its read again, even once the file answers
  const sealWhileHeld = async (mod) => {
    const S = sceneOf(mod); refused.add(S.file); S.client.account(); refused.delete(S.file);
    const v = mkVault(S.dir, S.tokens); const su = await v.setup(PW, {}); const direct = S.tokens.seal();
    const r = { su: su.ok, direct, same: realRead(S.file).equals(S.bytes), key: v.secretGet('file:dropline-oauth.json').value, held: !!S.tokens.held() };
    await HOLD.readAgainOf(rowOf(S.file)); S.client.account();
    try { r.after = SJ.isSealed(JSON.parse(realRead(S.file, 'utf8'))) && S.client.account().state === 'connected'; } catch { r.after = false; }
    S.tokens.dispose(); return r;
  };
  const H1 = await sealWhileHeld(SJ), HR = await sealWhileHeld(CUT_SEALHELD);
  ok('THE VAULT\'s OPEN HOOK WRITES NOTHING WHILE HELD: the setup\'s seal and a direct seal() leave the unread file\'s bytes as they were, no key minted for it; at the lift its next read seals it', H1.su && H1.direct === false && H1.same && H1.held && H1.key === null && H1.after === true, H1);
  ok('RED CONTROL (that line cut, in a copy): the setup\'s seal writes a box over the HELD file', HR.su && !HR.same, HR);
  // a dictation while held answers the hold's code — the route, and the client's own bearer
  const express = require(path.join(REPO, 'node_modules/express'));
  const dictate = async (routes) => {
    const S = sceneOf(SJ); refused.add(S.file); calls.length = 0;
    const app = express(); app.use(express.json()); app.use(routes.create({ client: S.client, oauth: S.oauth, prefs: () => ({ enabled: true, config: {} }), log: { log() { }, warn() { } } }));
    const srv = http.createServer(app); await new Promise((rr) => srv.listen(0, '127.0.0.1', rr));
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/voice/dictate`, { method: 'POST' });
    const body = await res.json(); srv.close();
    const e = await rejectsOf(() => S.client.dictate({ audio: Buffer.from('not-audio'), mime: 'audio/webm' }));
    refused.delete(S.file); S.tokens.dispose();
    return { status: res.status, body, e, calls: calls.slice() };
  };
  const D1 = await dictate(require(path.join(REPO, 'src/routes/voice.js'))), DR = await dictate(VOICE_CUT);
  ok('A DICTATION WHILE HELD answers the hold\'s code: POST /api/voice/dictate 503 voice_signin_unread, and the client\'s own bearer refuses by name (503) — no vendor call', D1.status === 503 && D1.body.error === 'voice_signin_unread' && !!D1.e && D1.e.code === 'voice_signin_unread' && D1.e.status === 503 && D1.calls.length === 0, { status: D1.status, body: D1.body, e: D1.e && D1.e.code });
  ok('RED CONTROL (the route\'s line cut, in a copy): the held dictation answers «not connected»', DR.status === 409 && DR.body.error === 'not-connected', { status: DR.status, body: DR.body });
  // a second tear with OTHER bytes (the same length) is copied once more, at the next start
  const secondTear = async (mod) => {
    const T = await tornCopied(mod); const c1 = copiesIn(T.dir); T.tokens.dispose();
    const other = Buffer.from(TORN); other[other.length - 1] ^= 1;
    fs.writeFileSync(T.file, other, { mode: 0o600 });
    const T2 = handleOf(T, mod); const t = await tornOnce(T2); T2.dispose();
    const c2 = copiesIn(T.dir), fresh = c2.find((n) => n !== c1[0]);
    return { c1, c2, t, first: c1.length === 1 && realRead(path.join(T.dir, c1[0])).equals(TORN), second: !!fresh && realRead(path.join(T.dir, fresh)).equals(other) && !!t && t.copy === fresh };
  };
  const ST = await secondTear(SJ), SR2 = await secondTear(CUT_COMPARE);
  ok('A SECOND TEAR WITH OTHER BYTES (the same length) is copied once more at the next start: two copies, the first unchanged, the second its bytes, named as the damage', ST.c2.length === 2 && ST.first && ST.second, ST);
  ok('RED CONTROL (a helper that compares by size, not byte for byte): the second tear is taken for the first — no copy of it', SR2.c2.length === 1, SR2.c2);
  // the Integrations Test press while held says the hold's words
  const testPress = async (dc) => { const S = sceneOf(SJ, { dc }); refused.add(S.file); calls.length = 0; const r = await S.client.testRunner({ resolved: { values: {} } }); refused.delete(S.file); S.tokens.dispose(); return { r, calls: calls.slice() }; };
  const P1 = await testPress(DC), PR = await testPress(DC_TEST);
  ok('THE TEST PRESS WHILE HELD says the hold\'s words with its code — never «sign in above»; no vendor call', P1.r.ok === false && P1.r.code === 'voice_signin_unread' && /could not be read/.test(P1.r.error) && !/sign in above/.test(P1.r.error) && P1.calls.length === 0, P1.r);
  ok('RED CONTROL (that line cut, in a copy): the held Test press says «sign in above»', PR.r.ok === false && /sign in above/.test(PR.r.error), PR.r);
  // the plugin's chip while UNREAD: the real lines of src/lib/plugins-ui.js, run over three states
  const PUI = read('src/lib/plugins-ui.js');
  const CHIP_RE = /\n( *chip = p\.vaultLocked \?[\s\S]*?chipTitle = t\('or paste a Dropline key in Integrations'\);\n)/;
  const chipOf = (src, p) => { const m = CHIP_RE.exec(src); if (!m) return null; return new Function('p', 't', 'waiting', `let chip = '', tone = '', chipTitle = '';\n${m[1]}\nreturn { chip, tone, chipTitle };`)(p, (x) => x, 0); };
  const chipsOf = (src) => ['unread', 'damaged', null].map((signin) => chipOf(src, { configured: false, vaultLocked: false, signin }));
  const [un, dm, none] = chipsOf(PUI), [unR] = chipsOf(cut(PUI, "const unread = !p.vaultLocked && p.signin === 'unread';", 'const unread = false;', 'the chip while unread'));
  ok('THE PLUGIN\'s CHIP WHILE UNREAD wears no Connect look and no Connect hint (tone warn, no title); damaged and never connected keep the Connect door', !!un && un.tone === 'warn' && !un.chipTitle && /cannot be read/.test(un.chip) && !!dm && dm.tone === 'primary' && !!dm.chipTitle && !!none && none.tone === 'primary' && none.chip === 'Connect with Fish Audio', { un, dm, none });
  ok('RED CONTROL (that line cut): the unread chip wears the Connect look and its hint', !!unR && unR.tone === 'primary' && !!unR.chipTitle, unR);
}
console.log('⑥ THE COPIES\' ROAD OFF THE LOOP (r4045) — a placed stall on the copies\' file calls, a shred that fails told, a stop\'s part swept');
{
  // THE PLACED STALL: every SYNCHRONOUS file call the main thread makes on a copy, a part or the folder listing stalls 150 ms and is
  // counted (the live file's own write stays as at the release: synchronous, never counted)
  const STALL = 150, SYNC = ['readdirSync', 'lstatSync', 'statSync', 'readFileSync', 'openSync', 'writeFileSync', 'renameSync', 'unlinkSync', 'existsSync'];
  const realSync = Object.fromEntries(SYNC.map((k) => [k, fs[k]]));
  let stalled = [], placing = null;
  // the folder counts for a LISTING only (the live file's replace opens the folder to sync it, as at the release); a copy or a part for every call
  const isCopyPath = (k, a) => typeof a === 'string' && !!placing && ((k === 'readdirSync' && path.resolve(a) === placing) || (path.dirname(path.resolve(a)) === placing && /^\.?dropline-oauth\.json\.corrupt-/.test(path.basename(a))));
  const place = (dir) => { placing = path.resolve(dir); stalled = []; for (const k of SYNC) { const real = realSync[k]; fs[k] = function (a, ...r) { if (isCopyPath(k, a)) { stalled.push(k); const t0 = Date.now(); while (Date.now() - t0 < STALL) { /* the placed stall */ } } return real.call(this, a, ...r); }; } };
  const unplace = () => { placing = null; for (const k of SYNC) fs[k] = realSync[k]; };
  const stallRun = async (mod) => {
    const S = await tornCopied(mod); const cp = copiesIn(S.dir);
    let worst = 0, last = Date.now(); const tick = setInterval(() => { const t = Date.now(); worst = Math.max(worst, t - last); last = t; }, 5);
    place(S.dir); calls.length = 0;
    let r = null, e = null; try { await S.oauth.start({ origin: 'https://hub.example.test' }); r = await S.client.connectWith({ clientId: 'vsc-fresh-1', code: 'code-6', verifier: 'v', redirectUri: 'https://hub.example.test/api/channels/oauth/cb/dropline' }); } catch (x) { e = x; }
    unplace(); clearInterval(tick);   // (lifted FIRST: the leg's own look at the folder below is no call of the product's)
    const goneAtReply = copiesIn(S.dir).length === 0;
    S.tokens.dispose();
    return { stalled: stalled.slice(), worst, goneAtReply, cp, ok: !!r && !e, e: e && e.message };
  };
  const ON_LOOP = MO.load('src/server/sealed-json.js', cut(SSRC, 'let names = []; try { names = await fs.promises.readdir(dir); } catch { return []; }', 'let names = []; try { names = fs.readdirSync(dir); } catch { return []; }', 'the listing on the loop'), 'listing-on-loop');   // stale-pins: kept (the red's replacement: the listing back on the loop, as at 90c2dd4c9)
  const G = await stallRun(SJ), GR = await stallRun(ON_LOOP);
  ok('A CONNECT WITH A COPY ON DISK, a stall placed in the main thread\'s own file calls on the copies: NOT ONE of them is made (nothing stalled on the main thread), and the copy is gone when the Connect answers', G.ok && G.cp.length === 1 && G.stalled.length === 0 && G.goneAtReply, G);
  ok('RED CONTROL (the copies\' listing back on the loop, as at 90c2dd4c9): the Connect makes a synchronous file call on the data folder and stalls the main thread', GR.ok && GR.stalled.length >= 1 && GR.worst >= STALL, { stalled: GR.stalled, worst: GR.worst });
  // A SHRED THAT FAILS is told: the copy's removal refused (a placed EACCES on its unlink), the Connect's answer and the account carry its name
  const realUnlink = fs.promises.unlink;
  const failRun = async (mod) => {
    const S = await tornCopied(mod); const cp = copiesIn(S.dir);
    fs.promises.unlink = async function (q, ...r) { if (typeof q === 'string' && path.resolve(q) === path.join(S.dir, cp[0])) throw Object.assign(new Error('EACCES: permission denied, unlink'), { code: 'EACCES' }); return realUnlink.call(this, q, ...r); };
    let r = null; try { await S.oauth.start({ origin: 'https://hub.example.test' }); r = await S.client.connectWith({ clientId: 'vsc-fresh-1', code: 'code-7', verifier: 'v', redirectUri: 'https://hub.example.test/api/channels/oauth/cb/dropline' }); } finally { fs.promises.unlink = realUnlink; }
    const a = S.client.account(); S.tokens.dispose();
    return { r, a, cp, said: S.logs.some((l) => l.includes(cp[0]) && /could not be removed/.test(l)) };
  };
  const F = await failRun(SJ), FR = await failRun(MO.load('src/server/sealed-json.js', cut(SSRC, '      leftCopies = left;\n', '', 'the left copies kept'), 'left-cut'));
  const leftWord = REG_WORDS().left;
  ok('A SHRED THAT FAILS IS TOLD to the person: the Connect still lands, its answer names the copy left, and the account the card reads carries it (the row says «could not be removed», with its name, in three languages)', !!F.r && Array.isArray(F.r.left) && F.r.left[0] === F.cp[0] && F.a.state === 'connected' && F.a.left === F.cp[0] && F.said && !!leftWord && /\{copy\}/.test(String(leftWord)), { r: F.r, a: F.a });
  ok('RED CONTROL (the left copies not kept, in a copy): the card is never told — the account carries no copy left', !!FR.r && !FR.a.left, FR.a);
  // A STOP'S PART FILE (the helper's `.<copy>.part`, plain torn bytes) is swept with the copies at the person's Connect
  const partRun = async (mod) => {
    const S = await tornCopied(mod); const part = path.join(S.dir, '.dropline-oauth.json.corrupt-1700000000000.part');
    fs.writeFileSync(part, TORN, { mode: 0o600 });
    await connect(S); const r = { part: fs.existsSync(part), hits: hits(S.dir) }; S.tokens.dispose(); return r;
  };
  const P = await partRun(SJ), PR = await partRun(MO.load('src/server/sealed-json.js', cut(SSRC, "const part = n.startsWith(partHead) && n.endsWith('.part');", 'const part = false;', 'the part in the pattern'), 'part-cut'));
  ok('A STOP\'S PART FILE is swept at the person\'s Connect: no part, no copy, no byte of the torn sign-in left in the folder', !P.part && P.hits.length === 0, P);
  ok('RED CONTROL (the part out of the sweep\'s pattern, in a copy): the hidden part keeps the plain torn bytes after the Connect', PR.part && PR.hits.some((n) => n.endsWith('.part')), PR);
}
for (const e of engines) { try { e.close(); } catch { /* closed */ } }

restoreConsole();
fs.readFileSync = realRead; fs.promises.readFile = realPRead;
report();
