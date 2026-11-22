#!/usr/bin/env node
// THE PIPED HUB RECOMPUTES THE INTERFACE'S WORD, AND A REVOKE THAT IS SAID IS A REVOKE THAT HOLDS (the separation, M1 — lane B,
// piece B3b-2 and its follow; 主开发 r1517 (A) + r1970). B3b-1 and B3b-2 are picked only together: no train ever holds a piped
// hub that takes the interface's word for a cookie without recomputing it. FAST, in-process: today's hub as the interface's
// party (src/server/interface-party.js, src/server/hub-port.js) behind the REAL gate in the piped form (src/server/piped-auth.js
// over src/auth.js's middleware); a FAKE interface where a leg must write a fact or hold an answer the real one would not, the
// REAL interface with its table (src/interface/signin.js) where it must answer.
//   ① THE HONOUR CHECK (law 4 of the shape): a fact naming the head's own login is served; one naming ANOTHER login than its
//      cookie (or a fact with no cookie, a malformed one, none) is refused, said by name — at most five lines a minute, the
//      rest counted. The same on an UPGRADE: a same-origin one is served, a cross-site one and another login's are refused.
//      RED: B3b-1's gate (the fact taken as it came).
//   ② THE REVOKE HOLDS UNTIL ITS ANSWER: a vault lock says its order; until the interface answers it NO login is honoured.
//      LAW 1 (the follow): a head (or an upgrade) stamped BEFORE the interface applied the order is refused AFTER its answer;
//      one stamped after it is served. LAW 4: two orders in flight hold until BOTH are answered. REDS: the hold cut; the epoch
//      check cut; one answer clearing every order.
//   ③ LAW 2, THE ANSWER MEANS ON DISK (the real interface): the answer comes only once the table's save landed; a save that
//      fails is answered «not done» and the hub keeps holding. RED: B3b-2's answer (at once, before the save).
//   ④ LAW 3, THE LOCK ASKS FRESH: a timer born inside a request reads the table's CURRENT state, never that request's fact.
//      RED: the gate's context kept for async work (B3b-1's AsyncLocalStorage).
//   ⑤ ACROSS A RE-JOIN (real interfaces, one file): the order is kept while no interface holds the hub; the new interface hears
//      the hub's epoch and the order FIRST, signs the old login out (written), the old cookie is refused there. And the two
//      paths an order can take before any join: given after the wiring (said at the first join) and given before it (kept for
//      the wiring). REDS: each path cut.
//   ⑥ THE CENSUS: one sign-in reader in the hub's tree (server.js builds PipedAuth in the piped form); no quoted 'auth.json'
//      outside src/auth.js but the vendor CLI's own, by file and count; src/auth.js required elsewhere for its statics only.
//      REDS: each rule planted.
import './scratch.mjs';   // FIRST (主开发 r1845 2, test-architecture §113: the scratch import before every other)
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const express = require('express');
const { ok: check, report } = checker();
/** the condition first (made a boolean), the name a string — a swap throws (test-ci-gate-tiers §7b) */
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(condition, name): the name comes second, a string'); return check(!!c, n, d); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-honour-'));   // 0700: this account's alone
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
/** `rel`'s text with each [needle, into] swapped — every needle exactly once, or the control is void (it throws) */
function swapped(rel, pairs) { let src = read(rel); for (const [needle, into] of pairs) { if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); src = src.replace(needle, into); } return src; }
const mutant = (rel, needle, into) => compileAt(rel, swapped(rel, [[needle, into]]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) return false; await sleep(5); } return true; };
const quiet = { log() { }, error() { }, warn() { } };
const said = (lines) => ({ log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)) });
const { Mux } = require(path.join(REPO, 'src/agentd/mux.js'));
const IP = require(path.join(REPO, 'src/server/interface-party.js'));
const HP = require(path.join(REPO, 'src/server/hub-port.js'));
const PA = require(path.join(REPO, 'src/server/piped-auth.js'));
const ST = require(path.join(REPO, 'src/signin-table.js'));
const SI = require(path.join(REPO, 'src/interface/signin.js'));
const SF = require(path.join(REPO, 'src/secret-file.js'));
const LP = require(path.join(REPO, 'src/link-proof.js'));
let n = 0;
const sock = () => path.join(T, `s${++n}.sock`);
const secretPair = () => { const s = crypto.randomBytes(32).toString('hex'); return { secret: s, digest: crypto.createHash('sha256').update(s).digest('hex') }; };
const tok = () => crypto.randomBytes(24).toString('hex');
const alive = (t, epoch = 0) => ({ alive: ST.tokenDigest(t), epoch });

/** the hub's app: the gate in the piped form (`AuthClass` over `opts`), one page route and one upgrade road */
function hubApp(AuthClass, opts) {
  const auth = new AuthClass(fs.mkdtempSync(path.join(T, 'hub-')), opts);
  const app = express(); app.use(auth.middleware()); app.get('/api/x', (req, res) => res.json({ served: true }));
  const server = http.createServer(app);
  server.on('upgrade', (req, s) => { s.on('error', () => { }); s.end(auth.requestAuthed(req) ? 'HTTP/1.1 101 Switching Protocols\r\n\r\n' : 'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); });
  return { auth, server, app };
}
/** a FAKE interface on `link`: any proof admitted; it writes the open lines a leg names; its answer to an order is held when asked */
async function fakeInterface(link, { holdAck = false, holdChallenge = false, ackOk = true } = {}) {
  let side = null, chan = 0; const got = new Map(), orders = [], heard = []; const held = [];
  const greet = () => side.control({ op: 'challenge', protoVersion: 2, nonce: LP.challenge() });
  let greetLater = null, greetAsked = false;   // a greet asked before the hub has even connected greets at its connect
  const srv = net.createServer((s) => {
    side = new Mux(s, { heartbeat: false, closeAfterQueue: true,
      onControl: (m) => {
        if (m && m.op) heard.push(m.op);
        if (m && m.op === 'hello') { side.control({ op: 'hello-ack', protoVersion: 2, party: 'interface', capabilities: ['relay@1', 'signin@1'] }); side.control({ op: 'signin-state', enabled: true, password: true, sso: false, held: null }); }
        else if (m && m.op === 'signin-revoke-all') { orders.push(m); const ack = () => side.control(ackOk ? { op: 'signin-revoke-all-ack', id: m.id, ok: true, revoked: 3 } : { op: 'signin-revoke-all-ack', id: m.id, ok: false, revoked: 3, why: 'ENOSPC' }); if (holdAck) held.push({ id: m.id, ack }); else ack(); }
      },
      onData: (c, b) => { got.set(c, (got.get(c) || '') + b.toString('latin1')); side.credit(c, b.length); }, onClose: () => { } });
    if (holdChallenge && !greetAsked) greetLater = greet; else greet();
  }).listen(link);
  await new Promise((r) => srv.once('listening', r));
  /** ONE head on its own channel with `fact` on its stamp → the hub's status (an upgrade when `upgrade`) */
  const head = async (cookie, fact, { upgrade = false, origin = 'http://hub.example', at = '/api/x' } = {}) => {
    const c = ++chan;
    side.control({ op: 'open', chan: c, to: 'hub', trace: 't', stamp: { secure: false, addr: '127.0.0.1', port: 1, signin: fact } });
    const lines = upgrade
      ? `GET /ws HTTP/1.1\r\nHost: hub.example\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nOrigin: ${origin}\r\n`
      : `GET ${at} HTTP/1.1\r\nHost: hub.example\r\nAccept: application/json\r\n`;
    side.data(c, Buffer.from(`${lines}${cookie ? `Cookie: vs_token=${cookie}\r\n` : ''}${upgrade ? '' : 'Connection: close\r\n'}\r\n`, 'latin1'));
    await until(() => /HTTP\/1\.1 \d{3}/.test(got.get(c) || ''), 3000);
    return Number((/HTTP\/1\.1 (\d{3})/.exec(got.get(c) || '') || [])[1] || 0);
  };
  /** the open line now, its head's bytes later — the gap law 1 is about (the stamp travels ahead of the head) */
  const openNow = (cookie, fact) => { const c = ++chan; side.control({ op: 'open', chan: c, to: 'hub', trace: 't', stamp: { secure: false, addr: '127.0.0.1', port: 1, signin: fact } }); return async () => { side.data(c, Buffer.from(`GET /api/x HTTP/1.1\r\nHost: hub.example\r\nAccept: application/json\r\nCookie: vs_token=${cookie}\r\nConnection: close\r\n\r\n`, 'latin1')); await until(() => /HTTP\/1\.1 \d{3}/.test(got.get(c) || ''), 3000); return Number((/HTTP\/1\.1 (\d{3})/.exec(got.get(c) || '') || [])[1] || 0); }; };
  return { head, openNow, orders, heard, ackAll: () => { while (held.length) held.shift().ack(); }, ack: (id) => { const i = held.findIndex((h) => h.id === id); if (i >= 0) held.splice(i, 1)[0].ack(); }, greet: () => { greetAsked = true; if (greetLater) { const g = greetLater; greetLater = null; g(); } }, linked: () => !!side, close: () => { try { side && side.destroy(); } catch { } srv.close(); } };
}
/** the hub joined to a fake interface by hand (no wiring): its gate over the given class, no order ever given */
async function joinedHub(AuthClass, opts = {}) {
  const link = sock(), F = await fakeInterface(link), k = secretPair(), lines = [];
  const H = hubApp(AuthClass, { subscribe: () => { }, revoke: () => { }, revokePending: () => false, revokeFloor: () => 0, log: said(lines), ...opts });
  const party = await IP.join({ start: { party: 'hub', secret: k.secret, link }, server: H.server, log: quiet });
  return { F, H, lines, close: () => { try { party.mux.destroy(); } catch { } F.close(); } };
}
/** the hub WIRED through hub-port (`hp`: the module or a copy) to a fake interface — its revoke line real */
async function wiredHub(hp, { holdAck = true, holdChallenge = false, ackOk = true, before = null, pa = PA } = {}) {
  const link = sock(), F = await fakeInterface(link, { holdAck, holdChallenge, ackOk }), k = secretPair(), lines = [];
  if (before) before(hp);
  const H = hubApp(pa.PipedAuth, { subscribe: (fn) => hp.onSigninState(fn), revoke: (why) => hp.signinRevokeAll(why), revokePending: () => hp.revokePending(), revokeFloor: () => hp.revokeFloor(), log: said(lines) });
  const hubObj = { listen: () => hubObj };
  hp.wire({ form: 'piped', start: { party: 'hub', secret: k.secret, link } }, { hub: hubObj, server: H.server, join: (o) => IP.join({ ...o, log: quiet }), end: () => { }, log: said(lines), rejoinMs: 3000 });
  let booted = false; hubObj.listen(0, '127.0.0.1', () => { booted = true; });
  return { F, H, hp, lines, booted: () => booted, close: () => F.close() };
}

console.log('— ① THE HONOUR CHECK: the hub recomputes the digest from the cookie of the head it parsed itself');
async function honour(AuthClass) {
  const J = await joinedHub(AuthClass);
  const A = tok(), B = tok();
  const r = {
    own: await J.F.head(A, alive(A)), other: await J.F.head(A, alive(B)), noCookie: await J.F.head(null, alive(A)),
    malformed: await J.F.head(A, { alive: 'not-a-digest', epoch: 0 }), none: await J.F.head(A, null), off: await J.F.head(null, 'off'),
    upOwn: await J.F.head(A, alive(A), { upgrade: true }), upCross: await J.F.head(A, alive(A), { upgrade: true, origin: 'https://elsewhere.example' }), upOther: await J.F.head(A, alive(B), { upgrade: true }),
  };
  r.named = J.lines.filter((l) => /names another login than the cookie it carries/.test(l)).length;
  for (let i = 0; i < 6; i++) await J.F.head(A, alive(B));   // seven mismatches in all: five said by name, the rest counted
  r.namedAfter = J.lines.filter((l) => /names another login than the cookie it carries/.test(l)).length;
  J.close(); return r;
}
{
  const r = await honour(PA.PipedAuth);
  ok(r.own === 200 && r.other === 401 && r.noCookie === 401 && r.malformed === 401 && r.none === 401 && r.off === 200 && r.named === 2,
    `the fact naming the head's own login: ${r.own}; ANOTHER login than its cookie: ${r.other}, said by name; no cookie ${r.noCookie}, a malformed fact ${r.malformed}, none ${r.none}; 'off' ${r.off}`, r);
  ok(r.upOwn === 101 && r.upCross === 401 && r.upOther === 401, `an UPGRADE through the piped gate: same origin with its own login ${r.upOwn}; cross-site ${r.upCross}; another login's fact ${r.upOther}`, r);
  ok(r.namedAfter === 5, `the mismatch journal is bounded: ${r.namedAfter} lines for 8 mismatches in a minute (at most five, the rest counted)`, r);
  const asTaken = mutant('src/server/piped-auth.js', "    if (!hashMatches(tokenDigest(token), f.alive)) { this._mismatch(); return false; }   // THE HONOUR CHECK\n", '');
  const red = await honour(asTaken.PipedAuth);
  ok(red.other === 200 && red.upOther === 101, `RED CONTROL — B3b-1's gate (the fact taken as it came): a head and an upgrade whose fact names another login are SERVED (${red.other}, ${red.upOther})`, red);
}

console.log('— ② THE REVOKE HOLDS: until its answer no login; after it, never a stamp made before it (law 1); two orders, two answers (law 4)');
async function holds(hp, pa = PA) {
  const W = await wiredHub(hp, { pa }); const H = W.H;
  await until(() => W.booted(), 3000);
  const A = tok(), r = { before: await W.F.head(A, alive(A, 0)) };
  const early = W.F.openNow(A, alive(A, 0));   // LAW 1's gap: stamped (the open line) before the interface hears the order
  H.auth.revokeAllTokens();
  r.said = await until(() => W.F.orders.length === 1, 2000); const id1 = W.F.orders[0] && W.F.orders[0].id;
  r.waiting = await W.F.head(A, alive(A, id1));   // even a stamp made after the order: no login while it waits
  H.auth.revokeAllTokens();   // a SECOND order in flight
  await until(() => W.F.orders.length === 2, 2000); const id2 = W.F.orders[1] && W.F.orders[1].id;
  W.F.ack(id1); await sleep(30);
  r.afterFirst = { pending: hp.revokePending(), status: await W.F.head(A, alive(A, id2)) };   // law 4: the second still holds
  W.F.ack(id2);
  r.lifted = await until(() => !hp.revokePending(), 2000);
  r.stale = await early();                           // law 1: its head's bytes judged AFTER both answers — stamped before them
  r.staleUp = await W.F.head(A, alive(A, id1), { upgrade: true });   // an upgrade stamped before the newest order
  r.fresh = await W.F.head(A, alive(A, id2));        // stamped after the interface applied the newest order
  r.ids = [id1, id2];
  W.close(); return r;
}
{
  const r = await holds(HP);
  ok(r.before === 200 && r.said && r.waiting === 401 && r.afterFirst.pending === true && r.afterFirst.status === 401 && r.lifted,
    `a vault lock's order said (id ${r.ids[0]}); while it waits a login is refused (${r.waiting}); a SECOND order (id ${r.ids[1]}) still holds after the FIRST answer (law 4: ${r.afterFirst.status}); both answered: the hold lifts`, r);
  ok(r.stale === 401 && r.staleUp === 401 && r.fresh === 200, `LAW 1: a head stamped before the orders, judged after their answers: ${r.stale}; an upgrade stamped before the newest: ${r.staleUp}; a stamp made after the newest order: ${r.fresh}`, r);
  const PAS = 'src/server/piped-auth.js', HPS = 'src/server/hub-port.js';
  const noHold = await holds(HP, mutant(PAS, "    if (this.#pending()) return false;   // a vault lock's revoke said, not yet answered: no login is honoured\n", ''));
  ok(noHold.waiting === 200, `RED CONTROL — the hold cut: a login is honoured while the order waits (${noHold.waiting})`, noHold);
  const noEpoch = await holds(HP, mutant(PAS, "    if (!(f.epoch >= this.#floor())) return false;   // law 1: stamped BEFORE the interface applied the newest order — never honoured after it\n", ''));
  ok(noEpoch.stale === 200, `RED CONTROL — the epoch check cut: the head stamped before the order is SERVED after its answer (${noEpoch.stale}) — the lock's revoked login`, noEpoch);
  const oneSlot = await holds(compileAt(HPS, swapped(HPS, [["      } else { held.delete(m.id); answered = Math.max(answered, m.id); }   // law 4: THIS order is done, no other", '      } else { held.clear(); answered = Math.max(answered, m.id); }']])));
  ok(oneSlot.afterFirst.pending === false, `RED CONTROL — one answer clearing every order (B3b-2's single slot): the hold lifts at the FIRST answer while the second waits (${oneSlot.afterFirst.status})`, oneSlot.afterFirst);
}

console.log('— ③ LAW 2: THE ANSWER MEANS ON DISK (the real interface\'s handler)');
async function onDisk(idxSrc, { fail = false } = {}) {
  const events = [];
  globalThis.__vsHonourWriter = { replaceShreddingAsync: async (file, text) => { events.push('write-start'); await sleep(120); if (fail) { events.push('write-failed'); throw Object.assign(new Error('no room'), { code: 'ENOSPC' }); } const r = await SF.replaceShreddingAsync(file, text); events.push('write-landed'); return r; } };
  const S = compileAt('src/interface/signin.js', swapped('src/interface/signin.js', [["const { replaceShreddingAsync } = require('../secret-file.js');", 'const { replaceShreddingAsync } = globalThis.__vsHonourWriter;']]));
  const dir = fs.mkdtempSync(path.join(T, 'disk-')), file = path.join(dir, 'auth.json');
  fs.writeFileSync(file, JSON.stringify({ tokens: { [ST.tokenDigest(tok())]: { createdAt: Date.now(), usedAt: Date.now() } }, tokensHashed: 1 }), { mode: 0o600 });   // one live login to revoke
  const t = S.create({ file, log: quiet }); await t.load();
  const I = compileAt('src/interface/index.js', idxSrc).create({ signin: t, log: quiet, helloMs: 2000 });
  const link = sock(), k = secretPair(); const srv = net.createServer((s) => I.attachLink(s)); await new Promise((r) => srv.listen(link, r)); I.admit({ party: 'hub', digest: k.digest });
  const acks = [];
  const party = await IP.join({ start: { party: 'hub', secret: k.secret, link }, server: http.createServer(), onSignin: (m) => { if (m.op === 'signin-revoke-all-ack') { events.push(`ack ${m.ok === false ? 'not-done' : 'done'}`); acks.push(m); } }, log: quiet });
  party.mux.control({ op: 'signin-revoke-all', id: 1, why: 'a leg\'s lock' });
  await until(() => acks.length > 0, 3000); await t.flushed().catch((e) => e); await sleep(20);
  try { party.mux.destroy(); } catch { } srv.close(); await I.close();
  return { events, ack: acks[0] || null };
}
{
  const IDX = read('src/interface/index.js');
  const law = await onDisk(IDX);
  ok(law.ack && law.ack.ok === true && law.ack.id === 1 && law.events.indexOf('write-landed') >= 0 && law.events.indexOf('write-landed') < law.events.indexOf('ack done'),
    `the order's answer comes once the table's save LANDED: ${law.events.join(' → ')}`, law);
  const failed = await onDisk(IDX, { fail: true });
  ok(failed.ack && failed.ack.ok === false && failed.ack.why === 'ENOSPC', `a save that FAILS is answered «not done» (${failed.ack && failed.ack.why}): ${failed.events.join(' → ')}`, failed);
  // the hub's side: an answer «not done» keeps the order held, and it is said again (a copy of hub-port with RESAY_MS 50)
  const HPS = 'src/server/hub-port.js';
  const quick = compileAt(HPS, swapped(HPS, [['const RESAY_MS = 5000;', 'const RESAY_MS = 50;']]));
  const W = await wiredHub(quick, { holdAck: false, ackOk: false }); await until(() => W.booted(), 3000);
  W.H.auth.revokeAllTokens();
  const again = await until(() => W.F.orders.length >= 2, 2000);
  const stillHeld = quick.revokePending();
  W.close();
  ok(again && stillHeld && W.F.orders[0].id === W.F.orders[1].id, `and the hub HOLDS on an answer «not done»: the same order said again (${W.F.orders.length}× id ${W.F.orders[0] && W.F.orders[0].id}), still pending (${stillHeld})`, { orders: W.F.orders.length, stillHeld });
  const IDXOLD = swapped('src/interface/index.js', [["          r.written.then((w) => {\n", "          Promise.resolve(true).then((w) => {   // (the red: answered at once)\n"]]);
  const early = await onDisk(IDXOLD, { fail: true });
  ok(!!early.ack && early.ack.ok === true && early.events.indexOf('ack done') >= 0 && early.events.indexOf('ack done') < early.events.indexOf('write-failed'), `RED CONTROL — B3b-2's answer (at once): a save that FAILS is answered «done» (${early.events.join(' → ')}) — an interface that dies there brings the revoked logins back`, early);
}

console.log('— ④ LAW 3: THE LOCK ASKS FRESH — a timer born in a request reads the table\'s current state');
{
  // the request runs through the REAL gate; its timer fires after the table's state line said sign-in is ON
  async function scene(pa) {
    let stateFn = () => { };
    const H = hubApp(pa.PipedAuth, { subscribe: (fn) => { stateFn = fn; }, revoke: () => { }, revokePending: () => false, revokeFloor: () => 0, log: quiet });
    let readLater = null;
    H.app.get('/api/arm', (req, res) => { setTimeout(() => { readLater = H.auth.enabled; }, 80); res.json({ armed: true }); });   // a lock's timer armed inside a request
    const link = sock(), F = await fakeInterface(link), k = secretPair();
    const party = await IP.join({ start: { party: 'hub', secret: k.secret, link }, server: H.server, log: quiet });
    stateFn({ op: 'signin-state', enabled: false, password: false, sso: false, held: null });   // sign-in off …
    const armed = await F.head(null, 'off', { at: '/api/arm' });                                // … the arming head, stamped 'off'
    stateFn({ op: 'signin-state', enabled: true, password: true, sso: false, held: null });     // the person sets a password
    await until(() => readLater !== null, 1000);
    try { party.mux.destroy(); } catch { } F.close();
    return { armed, readLater };
  }
  const law = await scene(PA);
  ok(law.armed === 200 && law.readLater === true, `a timer armed inside a request (sign-in off then, served ${law.armed}) reads the table's CURRENT state when it fires: enabled ${law.readLater}`, law);
  const PAS = 'src/server/piped-auth.js';
  const als = compileAt(PAS, swapped(PAS, [
    ['  #run(req, fn) { const prev = this.#cur; this.#cur = req; try { return fn(); } finally { this.#cur = prev; } }', '  #run(req, fn) { return (globalThis.__vsHonourALS || (globalThis.__vsHonourALS = new (require(\'node:async_hooks\').AsyncLocalStorage)())).run(req, fn); }'],
    ['  _fact() { return this.#cur ? signinFactOf(this.#cur.socket) : undefined; }', '  _fact() { const r = globalThis.__vsHonourALS && globalThis.__vsHonourALS.getStore(); return r ? signinFactOf(r.socket) : undefined; }'],
  ]));
  const red = await scene(als);
  ok(red.readLater === false, `RED CONTROL — the gate's context kept for async work (B3b-1's AsyncLocalStorage): the timer reads that request's «off» for good (${red.readLater}) — a vault lock would revoke nothing`, red);
}

console.log('— ⑤ ACROSS A RE-JOIN, AND THE TWO PATHS BEFORE ANY JOIN');
async function rejoin(hp) {
  const dir = fs.mkdtempSync(path.join(T, 'tbl-')), file = path.join(dir, 'auth.json');
  const link = sock(), k = secretPair(), lines = [];
  const anInterface = async () => {
    const t = SI.create({ file, log: quiet }); await t.load();
    const I = require(path.join(REPO, 'src/interface/index.js')).create({ signin: t, log: quiet, helloMs: 2000 });
    const where = await I.listen(0, '127.0.0.1');
    try { fs.rmSync(link, { force: true }); } catch { }
    const srv = net.createServer((s) => I.attachLink(s)); await new Promise((r) => srv.listen(link, r));
    I.admit({ party: 'hub', digest: k.digest });
    return { I, t, port: where.port, close: async () => { srv.close(); await I.close(); try { fs.rmSync(link, { force: true }); } catch { } } };
  };
  const ask = (port, method, p, { cookie, body } = {}) => new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const q = http.request({ host: '127.0.0.1', port, method, path: p, agent: false, headers: { accept: 'application/json', 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie: `vs_token=${cookie}` } : {}), ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, cookies: [].concat(res.headers['set-cookie'] || []) })); });
    q.on('error', () => resolve({ status: 0, cookies: [] })); if (data) q.write(data); q.end();
  });
  const A = await anInterface();
  const H = hubApp(PA.PipedAuth, { subscribe: (fn) => { hp.onSigninState(fn); }, revoke: (why) => hp.signinRevokeAll(why), revokePending: () => hp.revokePending(), revokeFloor: () => hp.revokeFloor(), log: said(lines) });   // the hooks of THIS hub-port (a red's copy too)
  const out = []; const connect = (p) => { const s = net.connect(p); const w = s.write.bind(s); s.write = (d, ...rest) => { out.push(Buffer.from(d)); return w(d, ...rest); }; return s; };
  const hubObj = { listen: () => hubObj };
  hp.wire({ form: 'piped', start: { party: 'hub', secret: k.secret, link } }, { hub: hubObj, server: H.server, join: (o) => IP.join({ ...o, connect, log: quiet }), end: () => { lines.push('ENDED'); }, log: said(lines), rejoinMs: 4000 });
  let booted = false; hubObj.listen(0, '127.0.0.1', () => { booted = true; });
  await until(() => booted, 3000);
  const first = await ask(A.port, 'POST', '/api/auth/set-password', { body: { newPassword: 'pw-rejoin-8' } });
  const C = (first.cookies.map((c) => /^vs_token=([a-f0-9]+);/.exec(c)).find(Boolean) || [])[1];
  await A.t.flushed();
  const r = { mine: (await ask(A.port, 'GET', '/api/x', { cookie: C })).status };
  await A.close();   // THE INTERFACE GOES
  r.ended = await until(() => lines.some((l) => l.includes('link ended')), 2000);
  H.auth.revokeAllTokens();   // a vault lock while no interface holds this hub
  r.kept = hp.revokePending();
  const mark = out.length;
  const B = await anInterface();   // a NEW interface on the same path, its table over the same file (the old login still in it)
  r.rejoined = await until(() => lines.some((l) => l.includes('a new interface took this hub')), 4000);
  r.answered = await until(() => !hp.revokePending(), 2000);
  await B.t.flushed();
  r.old = (await ask(B.port, 'GET', '/api/x', { cookie: C })).status;
  const sent = Buffer.concat(out.slice(mark)).toString('latin1');
  r.order = { hello: sent.indexOf('"op":"hello"'), epoch: sent.indexOf('"op":"signin-epoch"'), revoke: sent.indexOf('"op":"signin-revoke-all"') };
  r.tokens = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).tokens || {}).length;
  await B.close(); try { H.server.close(); } catch { }
  return r;
}
{
  const r = await rejoin(HP);
  ok(r.mine === 200 && r.ended && r.kept && r.rejoined && r.answered && r.old === 401 && r.tokens === 0,
    `the interface gone (its link said ended), a vault lock: the order KEPT; a new interface on the same path takes the hub, hears it and signs the old login out — written (${r.tokens} left); the old cookie ${r.old} there`, r);
  ok(r.order.hello >= 0 && r.order.revoke > r.order.hello && r.order.epoch === -1,
    `after its hello the hub says the held order — before anything else (hello ${r.order.hello} < order ${r.order.revoke}); no epoch line, as no order was answered yet (the interface starts the join at 0)`, r.order);
  const SAY = '            party = p; sayAll();   // the follow: the epoch, then every order not yet answered — the FIRST things this hub says to the new interface\n';
  const silent = await rejoin(mutant('src/server/hub-port.js', SAY, '            party = p;\n'));
  ok(silent.tokens >= 1 && silent.answered === false, `RED CONTROL — the order not said after the re-join: the file keeps the old login (${silent.tokens}), the hold never lifts`, silent);
  // THE TWO PATHS BEFORE ANY JOIN, each on a fresh copy of hub-port (its own module state)
  const HPS = 'src/server/hub-port.js', fresh = (pairs = []) => compileAt(HPS, swapped(HPS, pairs));
  async function beforeJoin(hp, early) {
    const W = await wiredHub(hp, { holdAck: false, holdChallenge: true, before: early ? (h) => h.signinRevokeAll('ordered before the wiring') : null });
    if (!early) hp.signinRevokeAll('ordered before the first join');
    const pendingBefore = hp.revokePending();
    W.F.greet();
    await until(() => W.booted(), 3000);
    const answered = await until(() => !hp.revokePending(), 2000);
    W.close();
    return { pendingBefore, answered, orders: W.F.orders.length, heard: W.F.heard.join(' ') };
  }
  const a = await beforeJoin(fresh(), false), b = await beforeJoin(fresh(), true);
  ok(a.pendingBefore && a.answered && a.orders === 1 && b.pendingBefore && b.answered && b.orders === 1,
    `an order given after the wiring but before the first join is said at that join (${a.orders}); one given BEFORE the wiring is kept for it and said (${b.orders}); both answered`, { a, b });
  const aCut = await beforeJoin(fresh([['        .then((p) => { party = p; sayAll(); record', '        .then((p) => { party = p; record']]), false);
  const bCut = await beforeJoin(fresh([['  if (earlyRevoke !== null) { const why = earlyRevoke; earlyRevoke = null; revokeAll(why); }   // a revoke ordered before this wiring\n', '']]), true);
  ok(aCut.orders === 0 && aCut.answered === false && bCut.orders === 0, `RED CONTROLS — the first join's say cut: the order is never said and the hub refuses every login for good (${aCut.orders} said); the early order's hand-over cut: it is lost (${bCut.orders} said)`, { aCut, bCut });
}

console.log('— ⑥ THE CENSUS: one sign-in reader in the hub\'s tree; no reader of data/auth.json but src/auth.js');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const files = ['server.js', ...(function walk(d) { return fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'lib' && d === 'src' ? [] : walk(`${d}/${e.name}`)) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : [])); })('src')];
  /** the VENDOR CLI's own auth.json (~/.codex, its account copies), by file and count — never the sign-in table: a new quoted
   *  'auth.json' anywhere else, or one more in these files, is red by name */
  const VENDOR = { 'src/harnesses/codex.js': 4, 'src/accounts.js': 1, 'src/machine-probes.js': 3, 'src/routes/persistence.js': 1, 'src/login-state.js': 1 };
  function census(texts) {
    const out = [], quoted = new Map();
    for (const [rel, raw] of texts) {
      const src = strip(raw);
      if (/\bnew Auth\(/.test(src)) out.push(`${rel}: new Auth( — a second sign-in reader`);
      const q = src.split('\n').filter((l) => /['"]auth\.json['"]/.test(l)).length;
      if (q && rel !== 'src/auth.js') quoted.set(rel, q);
      if (rel !== 'server.js' && rel !== 'src/auth.js' && /require\(\s*['"][./]*(?:src\/)?auth(?:\.js)?['"]\s*\)/.test(src)) {
        const uses = [...src.matchAll(/\bAuth\b(?:\.(\w+))?/g)].map((m) => m[1] || '').filter((u) => !['signInHandle', 'cookieToken', ''].includes(u));
        const extendsOnly = /class \w+ extends Auth\b/.test(src);
        const bareUses = [...src.matchAll(/\bAuth\b(?!\.)/g)].length - (src.match(/\{ Auth \}/g) || []).length - (extendsOnly ? 1 : 0);
        if (uses.length || bareUses > 0) out.push(`${rel}: src/auth.js used beyond its statics (${uses.join(', ') || `${bareUses} bare`})`);
      }
    }
    for (const [rel, q] of quoted) if (q !== (VENDOR[rel] || 0)) out.push(`${rel}: ${q} quoted 'auth.json' line(s), its row says ${VENDOR[rel] || 0} — a reader of the sign-in table?`);
    for (const rel of Object.keys(VENDOR)) if (!quoted.has(rel)) out.push(`${rel}: its vendor row names no quoted 'auth.json' any more (a dead row)`);
    const srv = texts.get('server.js') || '';
    if ((srv.match(/new \(require\('\.\/src\/server\/hub-port\.js'\)\.piped\(\) \? require\('\.\/src\/server\/piped-auth\.js'\)\.PipedAuth : Auth\)\(/g) || []).length !== 1) out.push('server.js: the ONE sign-in reader is not built by the piped switch (PipedAuth in the piped form)');
    return out;
  }
  const texts = new Map(files.map((f) => [f, read(f)]));
  const real = census(texts);
  ok(real.length === 0, `over server.js and ${files.length - 1} src/ files: one sign-in reader (server.js's piped switch), no quoted 'auth.json' outside src/auth.js but the vendor CLI's own rows (${Object.keys(VENDOR).length} files), src/auth.js elsewhere for its statics only (${real.length} findings)`, real);
  const plant = (rel, f) => { const m = new Map(texts); m.set(rel, f(m.get(rel))); return census(m); };
  const p1 = plant('server.js', (t) => t.replace("new (require('./src/server/hub-port.js').piped() ? require('./src/server/piped-auth.js').PipedAuth : Auth)(", 'new Auth('));
  const p2 = plant('src/server/vault-hooks.js', (t) => t + "\nconst _peek = (d) => require('fs').readFileSync(require('path').join(d, 'auth.json'), 'utf8');\n");
  const p3 = plant('src/accounts.js', (t) => t + "\nconst _codexPeek = (d) => require('fs').readFileSync(require('path').join(d, 'auth.json'), 'utf8');   // names codex, reads the table\n");
  const p4 = plant('src/device-audit.js', (t) => t + '\nconst _second = (d) => new Auth(d);\n');
  ok(p1.some((x) => /piped switch/.test(x)) && p1.some((x) => /new Auth\(/.test(x)) && p2.some((x) => /vault-hooks/.test(x)) && p3.some((x) => /src\/accounts\.js: 2 quoted/.test(x)) && p4.some((x) => /device-audit/.test(x)),
    'RED CONTROLS — server.js building today\'s Auth in every form, a hub module reading data/auth.json, a line in a vendor file that names codex yet reads one more, a second reader built from src/auth.js: each found by name', { p1, p2, p3, p4 });
}

report();
