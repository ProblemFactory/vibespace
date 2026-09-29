#!/usr/bin/env node
// ExitProxyManager (task #164; lane-pairing ⑥ 2026-09-28): WHO may borrow a machine's network (the `use` list),
// machine resolution over EVERY machine with the grant judged after (a refusal names the grant, never "no such
// machine"), and the SOCKS forward's byte pipe + lifecycle. The daemon SOCKS5 protocol itself is covered by
// test-agentd-socks.mjs; here the "device SOCKS" is a plain echo so we test the MANAGER (a dumb pipe + gate), not
// the protocol. The grant model's full table lives in test-exit-reach.mjs.
// Run: node scripts/test-exit-proxy.mjs
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { ExitProxyManager } = require('../src/exit-proxy.js');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = scratch('exitproxy'); // the real stores' data dirs (verify-r3)
fs.mkdirSync(SCR, { recursive: true });
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
// verify-r1 A3: the local forward demands the credentials `use` minted for THIS conversation (RFC 1929 username /
// password) before a byte reaches the machine — the port is a loopback port every local process could reach.
// A tiny SOCKS-auth client: greeting (offer 0x02) → the pair → then the payload; returns what came back.
const socksClient = (port, { user, pass, offer = [0x02], payload = 'ping', want = 'EX:ping' } = {}) => new Promise((resolve) => {
  const c = net.connect(port, '127.0.0.1', () => c.write(Buffer.from([0x05, offer.length, ...offer])));
  let stage = 0, b = Buffer.alloc(0), log = [];
  c.on('data', (d) => {
    b = Buffer.concat([b, d]);
    if (stage === 0 && b.length >= 2) { log.push('method:' + b[1].toString(16)); if (b[1] !== 0x02) { c.destroy(); return resolve({ log, text: '' }); } b = b.subarray(2); stage = 1; c.write(Buffer.concat([Buffer.from([0x01, user.length]), Buffer.from(user), Buffer.from([pass.length]), Buffer.from(pass)])); }
    else if (stage === 1 && b.length >= 2) { log.push('auth:' + b[1]); if (b[1] !== 0) { c.destroy(); return resolve({ log, text: '' }); } b = b.subarray(2); stage = 2; c.write(payload); }
    else if (stage === 2) { const t = b.toString(); if (t.includes(want)) { c.end(); resolve({ log, text: t }); } }
  });
  c.on('error', () => resolve({ log, text: '' })); setTimeout(() => { try { c.destroy(); } catch {} resolve({ log, text: b.toString() }); }, 3000);
});
const credsOf = (url) => { const m = /^socks5h:\/\/([^:]+):([^@]+)@127\.0\.0\.1:(\d+)$/.exec(url); return m && { user: m[1], pass: m[2], port: Number(m[3]) }; };

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a "device SOCKS": an echo server (the manager only pipes bytes through it)
const echoPort = await new Promise((r) => { const s = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('EX:'), d])))); s.listen(0, '127.0.0.1', () => r(s.address().port)); });

// mock host registry + device — `exit` records (the two lists), everyone may borrow three of them
const EVERYONE = { use: { mode: 'everyone' }, run: { mode: 'nobody', ask: false } };
const records = [
  { id: 'host-mac', name: 'Mac', transport: 'dial', online: true, exit: EVERYONE },
  { id: 'host-box', name: 'Build Box', transport: 'ssh', exit: EVERYONE },
  { id: 'host-off', name: 'Off Mac', transport: 'dial', online: false, exit: EVERYONE },
  { id: 'host-no', name: 'NotAnExit', transport: 'ssh', exit: { use: { mode: 'nobody' }, run: { mode: 'nobody', ask: false } } },
];
let served = 0, unserved = 0;
const mkDevice = () => ({
  async serveSocks() { served++; return { port: echoPort }; },
  async tcpForward(port) {
    const sock = net.connect(port, '127.0.0.1');
    const handle = { onData: null, onClose: null, write: (b) => sock.write(b), close: () => sock.destroy() };
    sock.on('data', (b) => handle.onData?.(b)); sock.on('close', () => handle.onClose?.()); sock.on('error', () => handle.onClose?.());
    return handle;
  },
  async unserveSocks() { unserved++; return { closed: true }; },
});
const hosts = {
  list: () => records.map((r) => ({ ...r })),
  get: (id) => { const h = records.find((x) => x.id === id); if (!h) throw new Error('host not found'); return h; },
  async device(id) { const h = records.find((x) => x.id === id); if (h.online === false) throw new Error(`device "${h.name}" is offline`); return mkDevice(); },
  deviceBounded(id, ms) { return this.device(id); }, // mirrors the real HostManager (2.247.0)
  setExitAccess(id, exit) { this.get(id).exit = exit; }, setLastRun() {},
};
// a fake conversation (the caller) — its own keys, no Task Group
const S = { name: 'agent', backend: 'claude', claudeSessionId: 'c-1' };
const ex = new ExitProxyManager({ hosts, log: () => {}, sessionsMap: () => new Map([['w1', S]]) });
const tryUse = async (ref) => { try { return { r: await ex.use(S, 'w1', ref) }; } catch (e) { return { e }; } };

try {
  // ── listFor: the machines THIS conversation may use, with online + active ──
  const list = ex.listFor(S, 'w1');
  check('listFor returns only the machines open to this conversation', list.length === 3 && !list.some((m) => m.id === 'host-no'), JSON.stringify(list.map((m) => m.id)));
  check('list carries online flag (dial offline shows false)', list.find((m) => m.id === 'host-off').online === false);
  check('…and the grants (network yes, commands no)', list.every((m) => m.grants.use === true && m.grants.run === false));

  // ── resolution: id / exact name / unique substring, then the grant ──
  const rm = await tryUse('Mac');
  check('resolve by exact name ("Mac" exact beats "Off Mac" substring)', rm.r && rm.r.hostId === 'host-mac', JSON.stringify(rm.e && rm.e.message));
  check('resolve by unique substring', (await tryUse('build')).r?.hostId === 'host-box');
  const amb = await tryUse('ma'); // 'ma' ⊂ Mac AND Off Mac, exact of neither
  check('ambiguous substring is rejected with names', amb.e && amb.e.code === 'ambiguous' && /more specific/.test(amb.e.message), amb.e && amb.e.message);
  const notExit = await tryUse('NotAnExit');
  check('a real machine not open to this conversation is refused BY GRANT (never "no such machine")', notExit.e && notExit.e.code === 'not_granted' && /"Who can use it"/.test(notExit.e.message), notExit.e && notExit.e.message);
  const none = await tryUse('nope');
  check('no match is rejected', none.e && none.e.code === 'no_machine', none.e && none.e.message);
  await ex.stop('host-mac'); await ex.stop('host-box'); served = 0; unserved = 0;

  // ── use: binds a local port, bytes round-trip through the (mock) device SOCKS ──
  const r = (await tryUse('host-mac')).r;
  const cr = credsOf(r.url);
  check('use returns a socks5h url on the server loopback WITH this conversation\'s own credentials (A3)', cr && cr.port === r.localPort && /^s[0-9a-f]{12}$/.test(cr.user) && /^[0-9a-f]{36}$/.test(cr.pass), r.url);
  check('serveSocks was called on the device', served === 1);
  const reply = await socksClient(r.localPort, cr);
  check('bytes round-trip through the exit forward once the credentials are given (the device SOCKS greeted on the client\'s behalf)', reply.text.includes('EX:ping'), JSON.stringify(reply));
  const bare = await new Promise((resolve) => { const c = net.connect(r.localPort, '127.0.0.1', () => c.write('ping')); let b = ''; c.on('data', (d) => { b += d; }); c.on('close', () => resolve(b)); c.on('error', () => resolve(b)); setTimeout(() => { try { c.destroy(); } catch {} resolve(b); }, 2000); });
  check('a bare connection (any local process, no SOCKS auth) gets NOTHING through — not a byte reaches the machine', !bare.includes('EX:'), JSON.stringify(bare));
  const noAuth = await socksClient(r.localPort, { ...cr, offer: [0x00] });
  check('a client offering only no-auth is refused (05 FF)', noAuth.log[0] === 'method:ff' && !noAuth.text.includes('EX:'), JSON.stringify(noAuth));
  const wrong = await socksClient(r.localPort, { ...cr, pass: 'nope' });
  check('a wrong password is refused (01 01)', wrong.log[1] === 'auth:1' && !wrong.text.includes('EX:'), JSON.stringify(wrong));
  const other = await socksClient(r.localPort, { user: 's000000000000', pass: cr.pass });
  check('an unknown user is refused', other.log[1] === 'auth:1', JSON.stringify(other));
  // another conversation granted `use` gets ITS OWN pair on the same port; a revoke kills only its pair
  const S2 = { name: 'other', backend: 'claude', claudeSessionId: 'c-2' };
  ex.sessionsMap = () => new Map([['w1', S], ['w2', S2]]);
  const r2u = await ex.use(S2, 'w2', 'host-mac');
  const cr2 = credsOf(r2u.url);
  check('a second granted conversation gets its OWN credentials on the same port', cr2 && cr2.port === r.localPort && cr2.user !== cr.user && cr2.pass !== cr.pass);
  check('…which work', (await socksClient(r.localPort, cr2)).text.includes('EX:ping'));
  await ex.setAccess('host-mac', { use: { mode: 'only', who: [{ kind: 'session', id: 'claude:c-1' }] } });
  check('after the revoke of the second conversation its pair is dead and the first still works', (await socksClient(r.localPort, cr2)).log[1] === 'auth:1' && (await socksClient(r.localPort, cr)).text.includes('EX:ping'));
  check('…and `use` again by the first conversation hands back the SAME pair (eval twice is fine)', (await ex.use(S, 'w1', 'host-mac')).url === r.url);
  ex.sessionsMap = () => new Map([['w1', S]]);
  await ex.setAccess('host-mac', { use: { mode: 'everyone' } });


  // ── use is idempotent (reuses the live forward) ──
  const r2 = (await tryUse('host-mac')).r;
  check('use is idempotent (same local port, no second serveSocks)', r2.localPort === r.localPort && served === 1);
  check('list marks the machine active with its localPort', ex.list().find((m) => m.id === 'host-mac').active === true);

  // ── offline device fails loud ──
  const off = await tryUse('host-off');
  check('use on an offline device fails loud', off.e && off.e.code === 'offline' && /offline/i.test(off.e.message), off.e && off.e.message);

  // ── stop tears down + unserves the device SOCKS ──
  await ex.stop('host-mac');
  check('stop unserves the device SOCKS', unserved === 1);
  check('stop clears the live forward', !ex.list().find((m) => m.id === 'host-mac').active);
  const dead = await new Promise((resolve) => {
    const c = net.connect(r.localPort, '127.0.0.1'); c.on('connect', () => { c.end(); resolve(false); }); c.on('error', () => resolve(true)); setTimeout(() => resolve(true), 1500);
  });
  check('the local exit port is closed after stop', dead === true);

  // ── onMachineUnpaired drops a machine's forward ──
  await tryUse('host-box'); await sleep(100);
  ex.onMachineUnpaired('host-box'); await sleep(200);
  check('onMachineUnpaired stops the machine\'s exit', !ex.list().find((m) => m.id === 'host-box').active);

  // ── verify-r2 A3-r2: a CONNECTION is judged like a call — the pair alone is not a grant ──
  {
    // a conversation granted through a Task Group; the group is left (unbind / group deleted) with NO PATCH on the machine
    const S3 = { name: 'grouped', backend: 'claude', claudeSessionId: 'c-3' };
    let member = ['G'];
    ex.sessionsMap = () => new Map([['w1', S], ['w3', S3]]);
    ex.groupsOf = (s) => (s === S3 ? member : []).map((id) => ({ id }));
    await ex.setAccess('host-mac', { use: { mode: 'only', who: [{ kind: 'session', id: 'claude:c-1' }, { kind: 'group', id: 'G' }] } });
    const cr = credsOf((await ex.use(S, 'w1', 'host-mac')).url); // the other holder, listed by session
    const r3 = await ex.use(S3, 'w3', 'host-mac');
    const cr3 = credsOf(r3.url);
    check('A3-r2: a conversation granted through a Task Group gets its pair and connects', (await socksClient(r3.localPort, cr3)).text.includes('EX:ping'));
    member = []; // left the group — the only re-judge r1 had was the machine's PATCH
    const left = await socksClient(r3.localPort, cr3);
    check('A3-r2: after the conversation LEFT the group its pair is refused (01 01) — the connection asks the verdict, not just the pair (r1: bytes through)', left.log[1] === 'auth:1' && !left.text.includes('EX:'), JSON.stringify(left));
    const use3 = await ex.use(S3, 'w3', 'host-mac').then(() => null, (e) => e);
    check('…and `use` says not_granted', use3 && use3.code === 'not_granted');
    check('…the other holder\'s pair still works', (await socksClient(r3.localPort, cr)).text.includes('EX:ping'));
    // a conversation that DIED (killed / exited) — nobody PATCHed anything
    member = ['G'];
    const r3b = await ex.use(S3, 'w3', 'host-mac');
    const cr3b = credsOf(r3b.url);
    check('(a re-granted conversation gets a fresh pair)', cr3b.user !== cr3.user && (await socksClient(r3.localPort, cr3b)).text.includes('EX:ping'));
    ex.sessionsMap = () => new Map([['w1', S]]); // w3 is gone from the live map
    const dead = await socksClient(r3.localPort, cr3b);
    check('A3-r2: a DEAD conversation\'s pair is refused (01 01) — r1 honoured it until the forward stopped', dead.log[1] === 'auth:1' && !dead.text.includes('EX:'), JSON.stringify(dead));
    // the kill / exit path tells the manager: the pair goes with its connections; a forward nobody holds stops
    ex.sessionsMap = () => new Map([['w1', S], ['w3', S3]]);
    const r3c = await ex.use(S3, 'w3', 'host-mac');
    const cr3c = credsOf(r3c.url);
    const held = await new Promise((resolve) => { const c = net.connect(r3.localPort, '127.0.0.1', () => c.write(Buffer.from([0x05, 1, 0x02]))); let st = 0; c.on('data', (d) => { if (st === 0) { st = 1; c.write(Buffer.concat([Buffer.from([0x01, cr3c.user.length]), Buffer.from(cr3c.user), Buffer.from([cr3c.pass.length]), Buffer.from(cr3c.pass)])); } else if (st === 1) { st = 2; resolve(c); } }); c.on('error', () => {}); });
    ex.onSessionEnd(S3, 'w3');
    const cut = await new Promise((resolve) => { held.once('close', () => resolve(true)); setTimeout(() => resolve(false), 1500); });
    check('A3-r2: onSessionEnd (the kill / exit path) cuts the conversation\'s open connection at once', cut === true);
    check('…and its pair is gone', (await socksClient(r3.localPort, cr3c)).log[1] === 'auth:1');
    check('…the forward stays up for its other holder', ex.list().find((m) => m.id === 'host-mac').active === true && (await socksClient(r3.localPort, cr)).text.includes('EX:ping'));
    const u0 = unserved;
    ex.onSessionEnd(S, 'w1'); await sleep(200);
    check('A3-r2: the last holder gone ⇒ the forward stops (the device SOCKS unserved)', !ex.list().find((m) => m.id === 'host-mac').active && unserved === u0 + 1, `unserved=${unserved}`);
    // constant-time compare (r1's LOW): the pair is judged by crypto.timingSafeEqual, never ===
    const src = fs.readFileSync(path.join(REPO, 'src/exit-proxy.js'), 'utf8');
    check('A3-r2: the password compare is constant-time (timingSafeEqual) — no `c.pass === p` left', /crypto\.timingSafeEqual\(A, B\)/.test(src) && !/c\.pass === p/.test(src));
    // WIRING: both session-end sites (the ws kill path, the stdout exit path) tell the manager, beside helper-asks.forget
    const wsh = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'), sso = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf8'), srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    check('WIRING (A3-r2): the kill path and the exit path both call exitProxy.onSessionEnd(session, id) right before activeSessions.delete', /getExitProxy\(\)\?\.onSessionEnd\?\.\(session, data\.sessionId\); \} catch \{ \}[^\n]*\n\s*activeSessions\.delete\(data\.sessionId\);/.test(wsh) && /exitProxyRef\.onSessionEnd\?\.\(session, id\); \} catch \{ \}[^\n]*\n\s*activeSessions\.delete\(id\);/.test(sso) && (srv.match(/getExitProxy: \(\) => \{ try \{ return exitProxy; \} catch \{ return null; \} \}/g) || []).length >= 4);
    ex.groupsOf = null; ex.sessionsMap = () => new Map([['w1', S]]);
    await ex.setAccess('host-mac', { use: { mode: 'everyone' } });
  }

  // ── verify-r2 (the open connection): a Task Group change is a revoke too — rejudgeAll cuts an OPEN connection ──
  // r1 re-judged on the machine's PATCH, A3-r2 on each NEW connection; a conversation that left its granting group
  // (unbound, the group deleted / archived — no PATCH) kept its OPEN connection carrying bytes (reproduced: 1.5 s after)
  const openConn = (port, c) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => s.write(Buffer.from([0x05, 1, 0x02]))); let st = 0, got = ''; s.on('data', (d) => { if (st === 0) { st = 1; s.write(Buffer.concat([Buffer.from([0x01, c.user.length]), Buffer.from(c.user), Buffer.from([c.pass.length]), Buffer.from(c.pass)])); } else if (st === 1) { st = 2; resolve({ s, got: () => got }); } else got += d; }); s.on('error', () => {}); });
  const talk = async (o, msg) => { o.s.write(msg); await sleep(150); return o.got(); };
  {
    const S4 = { name: 'grouped4', backend: 'claude', claudeSessionId: 'c-4' };
    let member = ['G'];
    ex.sessionsMap = () => new Map([['w1', S], ['w4', S4]]);
    ex.groupsOf = (s) => (s === S4 ? member : []).map((id) => ({ id }));
    await ex.setAccess('host-mac', { use: { mode: 'only', who: [{ kind: 'session', id: 'claude:c-1' }, { kind: 'group', id: 'G' }] } });
    const crS = credsOf((await ex.use(S, 'w1', 'host-mac')).url);
    const r4 = await ex.use(S4, 'w4', 'host-mac');
    const cr4 = credsOf(r4.url);
    const o4 = await openConn(r4.localPort, cr4), oS = await openConn(r4.localPort, crS);
    check('(open): a group-granted conversation holds an open connection carrying bytes', (await talk(o4, 'one')).includes('EX:one'));
    member = []; // the conversation leaves G — nothing PATCHed on the machine
    const noHook = await talk(o4, 'two');
    check('(open): without a re-judge the open connection still carries bytes after the group was left (the shape reproduced)', noHook.includes('EX:two'));
    const rj = ex.rejudgeAll('task-groups');
    const cut = await new Promise((resolve) => { if (o4.s.destroyed) return resolve(true); o4.s.once('close', () => resolve(true)); setTimeout(() => resolve(false), 1500); });
    check('verify-r2: rejudgeAll (the Task Group store\'s change hook) cuts the OPEN connection of a conversation that lost `use` — as a PATCH does', cut === true && rj.stopped.some((x) => x.sessionId === 'w4'), JSON.stringify(rj));
    check('…its pair is dropped (a new connection hears 01 01)', (await socksClient(r4.localPort, cr4)).log[1] === 'auth:1');
    check('…the other holder\'s open connection is untouched', (await talk(oS, 'three')).includes('EX:three') && !oS.s.destroyed);
    check('…a re-judge with nothing changed drops nobody', ex.rejudgeAll('task-groups').stopped.length === 0);
    const u0 = unserved;
    ex.sessionsMap = () => new Map([['w4', S4]]); // the listed conversation is gone too (its end hook never ran)
    ex.rejudgeAll('task-groups'); await sleep(200);
    check('…the last holder judged out ⇒ the forward stops (the device SOCKS unserved)', !ex.list().find((m) => m.id === 'host-mac').active && unserved === u0 + 1 && oS.s.destroyed);
    // WIRING: the Task Group store's onChange (server.js) calls it on every change
    const srvSrc = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    check('WIRING (open): server.js\'s TaskGroupManager onChange calls exitProxy.rejudgeAll(\'task-groups\')', /onChange: \(list\) => \{[^}]*?\n[^\n]*\n[^\n]*\n\s*try \{ exitProxy\.rejudgeAll\('task-groups'\); \} catch \{ \}/.test(srvSrc));
    ex.groupsOf = null; ex.sessionsMap = () => new Map([['w1', S]]);
    await ex.setAccess('host-mac', { use: { mode: 'everyone' } });
  }

  // ── verify-r3 A-r3a: a hosts.json write that is NOT the PATCH — Settings → Import config, a removal — is a revoke too ──
  // the machine's lists live on its record; only the PATCH re-judged, so after an import that took a conversation off
  // a machine its OPEN connection kept carrying bytes and its "ask me" request kept waiting (scratch/r3-repro-a.mjs
  // E1/E2). The REAL HostManager in a scratch dir, wired as server.js wires it (onReachChange → rejudgeAll).
  const hostsLeg = async (HM, tag, { narrowOnly = false, waitMs = 1500 } = {}) => {
    const dir = path.join(SCR, tag); fs.mkdirSync(dir, { recursive: true });
    const H = new HM({ dataDir: dir });
    H.deviceBounded = async () => mkDevice();
    const Sx = { name: 'imp', backend: 'claude', claudeSessionId: 'c-imp' };
    const exH = new ExitProxyManager({ hosts: H, log: () => {}, sessionsMap: () => new Map([['wi', Sx]]) });
    H.onReachChange = (why) => exH.rejudgeAll(`hosts-${why}`); // THE server.js wiring
    const grant = (id) => H.setExitAccess(id, { use: { mode: 'only', who: [{ kind: 'session', id: 'claude:c-imp' }] }, run: { mode: 'only', who: [{ kind: 'session', id: 'claude:c-imp' }], ask: true }, updatedAt: 1 });
    const out = {};
    // (1) an import that NARROWS the machine's lists
    let hid = H.add({ name: 'Box', user: 'u', host: 'box.invalid' }); grant(hid);
    let r = await exH.use(Sx, 'wi', 'Box'); let o = await openConn(r.localPort, credsOf(r.url));
    out.before = (await talk(o, 'imp1')).includes('EX:imp1');
    const askP = exH.run(Sx, 'wi', 'Box', 'id').then(() => null, (e) => e);
    await sleep(30); out.asked = exH.listAsks().length;
    const recs = JSON.parse(JSON.stringify(H.exportBundle().hosts)); recs[0].exit = { use: { mode: 'nobody' }, run: { mode: 'nobody', ask: false }, updatedAt: 2 };
    H.importBundle({ hosts: recs, keys: {} });
    out.narrowCut = await new Promise((res) => { if (o.s.destroyed) return res(true); o.s.once('close', () => res(true)); setTimeout(() => res(false), waitMs); });
    out.narrowAsk = await Promise.race([askP, sleep(waitMs).then(() => 'still waiting')]);
    out.narrowStopped = !exH.list().find((m) => m.id === hid)?.active;
    out.narrowUsedBy = exH.view(hid).usedBy.use.length;
    if (narrowOnly) { try { o.s.destroy(); } catch { } for (const k of exH.listAsks()) { try { exH.answerAsk(k.askId, { answer: 'deny', by: 'user' }); } catch { } } for (const [k] of exH._live) await exH.stop(k); return out; }
    // (2) an import WITHOUT the machine
    grant(hid);
    r = await exH.use(Sx, 'wi', 'Box'); o = await openConn(r.localPort, credsOf(r.url));
    out.before2 = (await talk(o, 'imp2')).includes('EX:imp2');
    H.importBundle({ hosts: [], keys: {} });
    out.dropCut = await new Promise((res) => { if (o.s.destroyed) return res(true); o.s.once('close', () => res(true)); setTimeout(() => res(false), 1500); });
    out.dropAfter = o.s.destroyed ? '' : await talk(o, 'imp3');
    // (3) a removal that did not go through the route's onMachineUnpaired
    hid = H.add({ name: 'Box', user: 'u', host: 'box.invalid' }); grant(hid);
    r = await exH.use(Sx, 'wi', 'Box'); o = await openConn(r.localPort, credsOf(r.url));
    H.remove(hid);
    out.removeCut = await new Promise((res) => { if (o.s.destroyed) return res(true); o.s.once('close', () => res(true)); setTimeout(() => res(false), 1500); });
    try { o.s.destroy(); } catch { }
    for (const [k] of exH._live) await exH.stop(k);
    return out;
  };
  {
    const { HostManager } = require('../src/hosts.js');
    const a = await hostsLeg(HostManager, 'real');
    check('(A-r3a): the borrowed connection carries bytes and the ask waits before the import', a.before && a.asked === 1, JSON.stringify(a));
    check('verify-r3 A-r3a: Import config NARROWING the machine\'s lists cuts the conversation\'s OPEN connection at once (r2: bytes through)', a.narrowCut === true, JSON.stringify(a));
    check('…its waiting "ask me" request is answered not_granted (nothing runs), the forward stops and the row lists nobody', a.narrowAsk && a.narrowAsk.code === 'not_granted' && a.narrowStopped && a.narrowUsedBy === 0, JSON.stringify(a));
    check('verify-r3 A-r3a: Import config WITHOUT the machine cuts its open connection', a.before2 && a.dropCut === true && !a.dropAfter.includes('EX:'), JSON.stringify(a));
    check('verify-r3 A-r3a: a removal that skipped the route\'s onMachineUnpaired still cuts (hosts.remove itself tells the re-judge)', a.removeCut === true, JSON.stringify(a));
    const hsrc = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
    const bodyOf = (name) => { const i = hsrc.indexOf(`\n  ${name}(`); const j = hsrc.indexOf('\n  }\n', i); return i < 0 ? '' : hsrc.slice(i, j); };
    check('WIRING (A-r3a): hosts.js importBundle / remove / reshapeStore / setExitAccess each call this._reachChanged(…) after the save', ['importBundle', 'remove', 'reshapeStore', 'setExitAccess'].every((n) => /this\._save\(\);\s*\n\s*this\._reachChanged\('/.test(bodyOf(n))), ['importBundle', 'remove', 'reshapeStore', 'setExitAccess'].filter((n) => !/this\._reachChanged\('/.test(bodyOf(n))).join(','));
    check('WIRING (A-r3a): server.js points hosts.onReachChange at exitProxy.rejudgeAll', /\nhosts\.onReachChange = \(why\) => exitProxy\.rejudgeAll\(`hosts-\$\{why\}`\);/.test(fs.readFileSync(path.join(REPO, 'server.js'), 'utf8')));
    // CONTROL (A-r3a): a HostManager whose import does not tell the re-judge — the pre-fix shape: the open connection lives on
    const M = mutantCopies('exitproxy-hosts', REPO);
    const patchedH = hsrc.replace("    this._reachChanged('import');", '    ;');
    check('(the A-r3a control patch applies)', patchedH !== hsrc);
    const { HostManager: HM2 } = M.load('src/hosts.js', patchedH, 'noimporthook');
    const c = await hostsLeg(HM2, 'ctl', { narrowOnly: true, waitMs: 600 });
    check('CONTROL (A-r3a): with the import not telling the re-judge the open connection still carries bytes after a narrowing import, the ask still waits — the legs above go red', c.narrowCut === false && c.narrowAsk === 'still waiting', JSON.stringify(c));
  }

  // ── CONTROL (A3): a copy whose local listener skips the SOCKS auth pipes a bare connection straight through ──
  {
    const M = mutantCopies('exitproxy', REPO);
    const src = fs.readFileSync(path.join(REPO, 'src/exit-proxy.js'), 'utf8');
    const patched = src.replace("try { user = await socksAuth(sock, (u, p) => this._credOk(h.id, u, p)); }", "user = 'anon'; try { } ").replace("let greeted = false, pend = [];", "let greeted = true, pend = [];");
    check('(the control patch applies)', patched !== src);
    const { ExitProxyManager: EPM } = M.load('src/exit-proxy.js', patched, 'noauth');
    const ex2 = new EPM({ hosts, log: () => {}, sessionsMap: () => new Map([['w1', S]]) });
    const r3 = await ex2.use(S, 'w1', 'host-mac');
    const bare2 = await new Promise((resolve) => { const c = net.connect(r3.localPort, '127.0.0.1', () => c.write('ping')); let b = ''; c.on('data', (d) => { b += d; if (/EX:[\s\S]*ping/.test(b)) { c.end(); resolve(b); } }); c.on('error', () => resolve(b)); setTimeout(() => { try { c.destroy(); } catch {} resolve(b); }, 2000); });
    check('CONTROL: without the gate a bare local connection reaches the machine — the pre-verify shape', /EX:[\s\S]*ping/.test(bare2), JSON.stringify(bare2));
    await ex2.stop('host-mac');
    // CONTROL (A3-r2): a copy whose connection judge stops at the pair (r1's check) lets a dead conversation's pair through
    const pairOnly = src.replace("    const s = this.sessionsMap().get(c.sessionId);\n    if (!s || !E.exitVerdict(this.access(hostId), 'use', this.ctxFor(s, c.sessionId)).ok) {", "    const s = null;\n    if (false) {");
    check('(the A3-r2 control patch applies)', pairOnly !== src);
    const { ExitProxyManager: EPM3 } = M.load('src/exit-proxy.js', pairOnly, 'paironly');
    const S9 = { name: 'nine', backend: 'claude', claudeSessionId: 'c-9' };
    const ex3 = new EPM3({ hosts, log: () => {}, sessionsMap: () => new Map([['w9', S9]]) });
    const r9 = await ex3.use(S9, 'w9', 'host-mac');
    const cr9 = credsOf(r9.url);
    ex3.sessionsMap = () => new Map(); // died
    const through = await socksClient(r9.localPort, cr9);
    check('CONTROL (A3-r2): with the pair-only judge a DEAD conversation\'s pair still opens the machine — the leg above goes red', through.text.includes('EX:ping'), JSON.stringify(through.log));
    await ex3.stop('host-mac');
    // CONTROL (open): a copy whose re-judge judges nobody (the pre-fix manager: no hook) keeps the open connection
    const noRejudge = src.replace("        for (const sid of new Set([...live.users, ...(live.bySession ? live.bySession.keys() : [])])) {", "        for (const sid of []) {");
    check('(the open-connection control patch applies)', noRejudge !== src);
    const { ExitProxyManager: EPM4 } = M.load('src/exit-proxy.js', noRejudge, 'norejudge');
    const S8 = { name: 'eight', backend: 'claude', claudeSessionId: 'c-8' };
    let m8 = ['G'];
    const ex4 = new EPM4({ hosts, log: () => {}, sessionsMap: () => new Map([['w8', S8]]), groupsOf: () => m8.map((id) => ({ id })) });
    await ex4.setAccess('host-mac', { use: { mode: 'only', who: [{ kind: 'group', id: 'G' }] } });
    const r8 = await ex4.use(S8, 'w8', 'host-mac');
    const o8 = await openConn(r8.localPort, credsOf(r8.url));
    m8 = [];
    ex4.rejudgeAll('task-groups');
    check('CONTROL (open): with a re-judge that judges nobody the open connection still carries bytes after the group was left — the leg above goes red', (await talk(o8, 'ctl')).includes('EX:ctl') && !o8.s.destroyed);
    o8.s.destroy();
    await ex4.stop('host-mac');
    await ex4.setAccess('host-mac', { use: { mode: 'everyone' } });
  }
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  try { for (const m of ['host-mac', 'host-box']) await ex.stop(m); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nexit-proxy test passed');
process.exit(failed ? 1 : 0);
