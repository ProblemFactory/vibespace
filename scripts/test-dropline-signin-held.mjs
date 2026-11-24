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
//   RED CONTROLS: a copy of the sealed file with the release's read (① ② red).
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
function sceneOf(mod = SJ, { bytes } = {}) {
  const dir = mkdir(), file = path.join(dir, 'dropline-oauth.json');
  fs.writeFileSync(file, bytes !== undefined ? bytes : J(PAIR(dir)), { mode: 0o600 });
  const logs = [];
  const tokens = mod.sealedJson(file, { dataDir: dir, hold: { code: 'voice_signin_unread', log: (l) => logs.push(String(l)), words: (h) => `the voice sign-in (dropline-oauth.json in VibeSpace's data folder) could not be read (${(h && h.code) || 'unreadable'}) — nothing was changed and no sign-in is lost` } });
  const client = DC.create({ integrations: () => noKey, tokens, fetchImpl: vendor, log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)) } });
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
  ok('CONNECT is the way out: a new registration, the code exchanged, a fresh pair written over the torn bytes; their copy kept; connected', r.ok === true && calls.includes('/oauth/register') && calls.includes('/oauth/token') && !!fresh && fresh.access === 'acc-fresh' && a3.state === 'connected' && copiesIn(T.dir).length === 1, { r, calls, a3 });
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
  const sentences = [row && row[1].replace(/\\'/g, "'"), w.unread, w.damaged, VM.voiceWords('voice-signin-held').words, VM.voiceWords('signin-damaged').words].map((x) => (x && typeof x === 'object' && x.key) ? x.key : x);
  const both = (s) => !!s && ZH.includes(J(s) + ':') && JA.includes(J(s) + ':');
  ok('the family\'s table words voice_signin_unread; the Connect block declares «unread» and «damaged» (a closed set); the mic has both codes; each sentence has zh and ja', !!row && REG.CONNECT_WORDS.includes('unread') && REG.CONNECT_WORDS.includes('damaged') && VM.VOICE_CODES.includes('voice-signin-held') && VM.VOICE_CODES.includes('signin-damaged') && sentences.every(both), sentences.map((s) => [String(s).slice(0, 50), both(s)]));
  ok('…no sentence names a file path; the damaged one names only the copy by its {copy} slot, and none says to restore it', sentences.every((s) => !/data\/|\.json/.test(String(s)) && !/restore/i.test(String(s))) && /\{copy\}/.test(String(w.damaged && (w.damaged.key || w.damaged))));
}

restoreConsole();
fs.readFileSync = realRead; fs.promises.readFile = realPRead;
report();
