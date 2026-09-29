#!/usr/bin/env node
// A DIALED DEVICE THAT REFUSES OUR HOST KEY KEEPS ITS LINK (verify-r1 C2, 2026-09-28; fast, in-process).
// Before: the server destroyed the stream on `auth-fail`, the device re-dialed a second later, the server accepted
// it again (hosts.json rewritten + every client repainted per second, forever) and the machine row read "offline —
// no dial attempt has reached this server" while the device reached it every second (measured 75 dial-ins / 75 s).
// Now: the link is KEPT unauthenticated, the row reads `auth-fail`, and ops on that stream are refused at once
// without another hello (dial-pairing.js remembers the refused stream for AUTH_FAIL_REHELLO_MS; a fresh stream is
// always asked). A fake daemon over the REAL Mux + the REAL DeviceManager + the REAL deviceForDial.
// Control: a patched copy of client.js without the keep ⇒ the socket closes (the pre-fix loop's first step).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');
const { DeviceManager } = require('../src/agentd/client.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dial-kept-'));

// the fake daemon: every hello is refused (the device holds another command's host token)
let hellos = 0; const socks = new Set();
const srv = net.createServer((sock) => {
  socks.add(sock); sock.on('close', () => socks.delete(sock));
  const mux = new Mux(sock, { onControl: (m) => { if (m.op === 'hello') { hellos++; mux.control({ op: 'auth-fail' }); } }, onData: () => {}, onDead: () => {} });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const dialIn = () => new Promise((res, rej) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => res(s)); s.on('error', rej); });
const closed = (s) => new Promise((res) => { if (s.destroyed) return res(true); s.once('close', () => res(true)); setTimeout(() => res(false), 800); });

console.log('— the real DeviceManager over a stream transport: auth-fail rejects fast and KEEPS the stream —');
{
  const stream = await dialIn();
  const dm = new DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_wrong', getStream: () => stream } });
  const t0 = Date.now();
  let err = null; try { await dm.connect(); } catch (e) { err = e; }
  ok(err && err.code === 'auth_failed' && /auth failed/.test(err.message) && Date.now() - t0 < 2000, `connect() rejects auth_failed at once (${Date.now() - t0} ms) — no minute of retries`, err && err.message);
  ok(!(await closed(stream)) && !stream.destroyed, 'the stream is KEPT open (the device stays dialed in; no re-dial loop)');
  ok(hellos === 1, `one hello was sent (${hellos})`);
  dm.stop(); stream.destroy();
}

console.log('— deviceForDial (the real one): the refused stream is remembered — ops refused without a second hello —');
{
  const { HostManager } = require('../src/hosts.js');
  const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const H = new HostManager({ dataDir });
  const DP = require('../src/server/dial-pairing.js').create({ rootDir: tmp, AGENTD_DIR: path.join(dataDir, 'agentd'), agentdHostToken: () => 'vsht_wrong', getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} });
  H.dialOnline = (d) => DP.agentdDials.has(d);
  H.setDialToken('devK', 'ab'.repeat(32));
  hellos = 0;
  const stream1 = await dialIn();
  DP.agentdDials.set('devK', stream1);
  DP.noteDialEvent('devK', 'accepted', { at: Date.now() });
  let e1 = null; try { await DP.deviceForDial('devK'); } catch (e) { e1 = e; }
  ok(e1 && e1.code === 'auth_failed', 'the first op: auth_failed (one hello)', e1 && e1.message);
  const DF = require('../src/dial-facts.js');
  const row = () => H.list().find((h) => h.deviceId === 'devK');
  ok(DF.dialRowState(row()).state === 'auth-fail', `THE ROW reads auth-fail while the device stays dialed in (${DF.dialRowState(row()).state})`);
  const t1 = Date.now();
  let e2 = null; try { await DP.deviceForDial('devK'); } catch (e) { e2 = e; }
  ok(e2 && e2.code === 'auth_failed' && hellos === 1 && Date.now() - t1 < 200, `a second op on the SAME stream is refused at once with NO second hello (hellos=${hellos}, ${Date.now() - t1} ms) and names the way out`, e2 && e2.message);
  ok(/generate a new command/.test(String(e2 && e2.message)), '…the sentence says: generate a new command and run it there');
  ok(!stream1.destroyed && DP.agentdDials.get('devK') === stream1, 'the link is still the same live stream (never destroyed by the refusal)');
  // a FRESH stream (the device re-dialed after the user ran the new command) is asked again
  stream1.destroy();
  const stream2 = await dialIn();
  DP.agentdDials.set('devK', stream2);
  let e3 = null; try { await DP.deviceForDial('devK'); } catch (e) { e3 = e; }
  ok(e3 && hellos === 2, `a fresh stream gets a fresh hello (hellos=${hellos})`);
  // the re-hello window: after AUTH_FAIL_REHELLO_MS the same stream is asked once more (a token fixed in place heals)
  const realNow = Date.now;
  Date.now = () => realNow() + DP.AUTH_FAIL_REHELLO_MS + 1;
  try { let e4 = null; try { await DP.deviceForDial('devK'); } catch (e) { e4 = e; } ok(e4 && hellos === 3, `after AUTH_FAIL_REHELLO_MS (${DP.AUTH_FAIL_REHELLO_MS / 1000} s) the same stream is asked once more (hellos=${hellos})`); }
  finally { Date.now = realNow; }
  stream2.destroy();
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
}

console.log('— CONTROL: a client.js copy without the keep destroys the stream on auth-fail (the loop\'s first step) —');
{
  const M = mutantCopies('dialkept', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const patched = src.replace("if (this._transport.kind === 'stream') { keepStream = true; mux.onControl = () => { }; }", '');
  ok(patched !== src, '(the patch applies)');
  const { DeviceManager: DM2 } = M.load('src/agentd/client.js', patched, 'nokeep');
  const stream = await dialIn();
  const dm = new DM2({ dataDir: tmp, bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_wrong', getStream: () => stream } });
  try { await dm.connect(); } catch { }
  ok(await closed(stream), 'CONTROL: without the keep the stream is destroyed on auth-fail — the pre-fix shape (a real device re-dials a second later)');
  dm.stop();
}
// ── verify-r2 B9-r2a: THE ADMISSION GATE (admitDial) over a fake daemon that answers — a newcomer is refused BY
// LIVENESS, never admitted for a missing boot id, and a hello still in flight is joined, not read as dead ──
console.log('— verify-r2 B9-r2a: admitDial — a header-less newcomer is refused while the current answers; a hello in flight is joined —');
{
  const { HostManager } = require('../src/hosts.js');
  const DF = require('../src/dial-facts.js');
  // the answering daemon: hello-ack after `helloDelay` (a real device's round trip), PINGs answered by the Mux itself
  let helloDelay = 0; let paused = null;
  const srvOk = net.createServer((sock) => {
    if (paused) paused.add(sock);
    const mux = new Mux(sock, { onControl: (m) => { if (m.op === 'hello') setTimeout(() => mux.control({ op: 'hello-ack', daemonVersion: '1.0.0', capabilities: [] }), helloDelay); }, onData: () => {}, onDead: () => {} });
  });
  await new Promise((r) => srvOk.listen(0, '127.0.0.1', r));
  const portOk = srvOk.address().port;
  const dialOk = () => new Promise((res, rej) => { const s = net.connect(portOk, '127.0.0.1'); s.on('connect', () => res(s)); s.on('error', rej); });
  const fakeSocket = () => ({ destroyed: false, frame: '', end(s) { this.frame = String(s || ''); }, destroy() { this.destroyed = true; } });
  const BOOT_A = 'a'.repeat(16), BOOT_B = 'b'.repeat(16);
  const mk = (DPmod) => {
    const dataDir = path.join(tmp, 'data-' + Math.random().toString(36).slice(2, 8)); fs.mkdirSync(dataDir, { recursive: true });
    const H = new HostManager({ dataDir });
    const DP = DPmod.create({ rootDir: tmp, AGENTD_DIR: path.join(dataDir, 'agentd'), agentdHostToken: () => 'vsht_ok', getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} });
    H.dialOnline = (d) => DP.agentdDials.has(d);
    H.setDialToken('devA', 'cd'.repeat(32));
    return { H, DP };
  };
  const accept = async (DP, boot) => { const s = await dialOk(); DP.agentdDials.set('devA', s); DP.noteDialEvent('devA', 'accepted', { at: Date.now(), boot }); return s; };
  const { H, DP } = mk(require('../src/server/dial-pairing.js'));
  // ① the current answers (hello done) — a newcomer WITHOUT a boot id is refused by name
  const s1 = await accept(DP, BOOT_A);
  await DP.deviceForDial('devA');
  let sk = fakeSocket(); let t0 = Date.now();
  let admit = await DP.admitDial('devA', { boot: null, from: '10.0.0.9' }, sk);
  ok(admit === null && /401 Unauthorized/.test(sk.frame) && /X-VibeSpace-Dial-Refusal: duplicate-device/.test(sk.frame), `a newcomer with NO boot id is REFUSED duplicate-device while the current answers (${Date.now() - t0} ms; r1 admitted it unasked)`, sk.frame.slice(0, 80));
  ok(DP.agentdDials.get('devA') === s1 && !s1.destroyed, '…and the current link is untouched');
  ok(DF.dialRowState(H.list().find((h) => h.deviceId === 'devA')).dup?.from === '10.0.0.9', '…the row carries the duplicate note with the newcomer\'s address');
  // ② a newcomer with a DIFFERENT boot id: refused (r1's cell, still)
  sk = fakeSocket(); admit = await DP.admitDial('devA', { boot: BOOT_B }, sk);
  ok(admit === null && /duplicate-device/.test(sk.frame), 'a newcomer with another boot id is refused (r1)');
  // ③ the SAME boot id: replaced without a probe (the daemon re-dialing after its own drop)
  sk = fakeSocket(); t0 = Date.now(); admit = await DP.admitDial('devA', { boot: BOOT_A }, sk);
  ok(admit === true && sk.frame === '' && Date.now() - t0 < 100, 'the same boot id is admitted at once (no probe)');
  // ④ a hello IN FLIGHT: a fresh stream accepted, its hello answered after 700 ms, a newcomer arriving inside that
  //    window — r1 read `connected:false` as dead and let it evict the healthy device; now the probe JOINS the hello
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } } DP.agentdDialDevices.clear();
  s1.destroy();
  helloDelay = 700;
  const s2 = await accept(DP, BOOT_A);
  const helloP = DP.deviceForDial('devA').catch(() => null); // server.js's accept path: the hello NOW
  await sleep(50);
  sk = fakeSocket(); t0 = Date.now(); admit = await DP.admitDial('devA', { boot: BOOT_B }, sk);
  ok(admit === null && /duplicate-device/.test(sk.frame) && Date.now() - t0 >= 600, `a newcomer inside the current's hello round trip is refused after the hello lands (${Date.now() - t0} ms) — never "not connected ⇒ dead ⇒ replace"`, sk.frame.slice(0, 60));
  await helloP;
  ok(DP.agentdDials.get('devA') === s2 && !s2.destroyed, '…the current link survived its own hello window');
  helloDelay = 0;
  // ⑤ the current is SILENT (a half-open socket): the daemon side stops reading ⇒ no PONG ⇒ replaced after the probe
  paused = new Set();
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } } DP.agentdDialDevices.clear();
  s2.destroy();
  const s3 = await accept(DP, BOOT_A);
  await DP.deviceForDial('devA');
  for (const p of paused) p.pause(); // the daemon never reads our PING
  sk = fakeSocket(); t0 = Date.now(); admit = await DP.admitDial('devA', { boot: null }, sk);
  ok(admit === true && sk.frame === '' && Date.now() - t0 >= DP.DUP_PROBE_MS - 50 && Date.now() - t0 < 2 * DP.DUP_PROBE_MS + 500, `a silent current is replaced after the ${DP.DUP_PROBE_MS} ms probe even by a header-less newcomer (${Date.now() - t0} ms) — a pre-B9 daemon\'s own re-dial after a half-open drop still gets in`);
  for (const p of paused) p.resume(); paused = null;
  s3.destroy();
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
  // CONTROL: r1's verdict ("no boot id ⇒ replace") in a closed world of copies — the header-less newcomer is ADMITTED
  // while the current answers (the eviction by omission)
  {
    const M = mutantCopies('dialadmit', REPO);
    const dfSrc = fs.readFileSync(path.join(REPO, 'src/dial-facts.js'), 'utf8');
    const dfMut = dfSrc.replace("if (cb && ib && cb === ib) return { action: 'replace', why: 'same-daemon' };", "if (!cb || !ib) return { action: 'replace', why: 'unknown-boot' };\n  if (cb === ib) return { action: 'replace', why: 'same-daemon' };");
    ok(dfMut !== dfSrc, '(the verdict patch applies)');
    const dfPath = M.write('src/dial-facts.js', dfMut, 'r1rule', { name: 'dial-facts-r1' });
    const dpSrc = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
    const dpMut = dpSrc.replace("const DF = require('../dial-facts.js');", `const DF = require(${JSON.stringify(dfPath)});`);
    ok(dpMut !== dpSrc, '(the gate is bound to the patched verdict)');
    const DPm = M.load('src/server/dial-pairing.js', dpMut, 'r1gate');
    const w = mk(DPm);
    const c1 = await accept(w.DP, BOOT_A);
    await w.DP.deviceForDial('devA');
    const skc = fakeSocket();
    const adm = await w.DP.admitDial('devA', { boot: null }, skc);
    ok(adm === true && skc.frame === '', 'CONTROL: under r1\'s rule the header-less newcomer is admitted while the current answers — the leg above goes red');
    c1.destroy();
    for (const d of w.DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
  }
  srvOk.close();
}

// ── verify-r2 THE DIAL ENDPOINT: the REAL gateDialUpgrade over fake sockets + a real HostManager — a stranger hears ONE
// answer for an unknown name and a wrong token (the answer leaves before anything is done for a known name), the journal
// is budgeted (2 000 knocks from one address in ~200 ms wrote 2 000 lines: journald's per-service burst spent in a second),
// the paired device's row keeps recording, and a correct token is admitted whatever the count ──
console.log('— verify-r2 the dial endpoint: one answer, the answer first, a LOG budget, the row still recording, the right token admitted —');
{
  const { HostManager } = require('../src/hosts.js');
  const crypto = require('node:crypto');
  const mkGate = (DPmod, HostsMod = HostManager) => {
    const dataDir = path.join(tmp, 'gate-' + Math.random().toString(36).slice(2, 8)); fs.mkdirSync(dataDir, { recursive: true });
    const H = new HostsMod({ dataDir });
    let saves = 0; const save = H._save.bind(H); H._save = (...a) => { saves++; return save(...a); };
    const DP = DPmod.create({ rootDir: tmp, AGENTD_DIR: path.join(dataDir, 'agentd'), agentdHostToken: () => 'vsht_ok', getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} });
    H.dialOnline = (d) => DP.agentdDials.has(d);
    const pair = DP.agentdMintDialPair('macbook', { host: 'hub:3456' });
    return { H, DP, pair, saves: () => saves };
  };
  const order = [];
  const sock = () => ({ destroyed: false, frame: '', on() { }, end(s) { this.frame = String(s || ''); order.push('answer'); }, destroy() { this.destroyed = true; } });
  const req = (device, token, from = '203.0.113.5') => ({ url: `/api/device-dial?device=${encodeURIComponent(device)}`, headers: { 'x-vibespace-dial-token': token, host: 'hub:3456' }, socket: { remoteAddress: from } });
  const heard = (s) => ({ code: (/X-VibeSpace-Dial-Refusal: (\S+)/.exec(s.frame) || [])[1], error: (() => { try { return JSON.parse(s.frame.slice(s.frame.indexOf('\r\n\r\n') + 4)).error; } catch { return null; } })() });
  const captureLogs = async (fn) => { const lines = []; const orig = console.log; console.log = (...a) => { const l = a.join(' '); if (l.startsWith('[device]')) lines.push(l); else orig(...a); }; try { await fn(); } finally { console.log = orig; } return lines; };
  const g = mkGate(require('../src/server/dial-pairing.js'));
  const wrong = () => 'vsdt_' + crypto.randomBytes(18).toString('hex');
  // ① ONE answer
  const sU = sock(), sK = sock();
  await captureLogs(() => { g.DP.gateDialUpgrade(req('nosuch-device', wrong()), sU); g.DP.gateDialUpgrade(req('macbook', wrong()), sK); });
  const hu = heard(sU), hk = heard(sK);
  ok(hu.code === 'token-mismatch' && hk.code === 'token-mismatch' && hu.error.replace('"nosuch-device"', '"X"') === hk.error.replace('"macbook"', '"X"'), `an unknown name and a wrong token hear the SAME code and sentence (${hu.code} / ${hk.code}) — the port no longer names which devices are paired here`, [hu, hk]);
  const norm = (f, name) => f.split(name).join('X').replace(/Content-Length: \d+/, 'Content-Length: N');
  ok(norm(sU.frame, 'nosuch-device') === norm(sK.frame, 'macbook'), '…the whole frame byte for byte, but for the name the request itself carried (and its length)', [norm(sU.frame, 'nosuch-device').slice(0, 300), norm(sK.frame, 'macbook').slice(0, 300)]);
  // ①b the name is the stranger's bytes: a %0A in it never forges a journal line of its own
  const lf = await captureLogs(() => g.DP.gateDialUpgrade(req("x\n[device] dial accepted for 'macbook'", wrong(), '198.51.100.77'), sock()));
  ok(lf.length === 1 && !/\n/.test(lf[0]) && /REJECTED for 'x\?\[device\] dial accepted/.test(lf[0]), 'a name carrying a newline is logged as ONE line with the control character shown as "?" (no forged "[device] dial accepted" line)', lf);
  // ② the answer leaves FIRST — the row's record for a known name runs after the bytes
  order.length = 0;
  const note = g.H.noteDial.bind(g.H); g.H.noteDial = (...a) => { order.push('record:' + a[1]); return note(...a); };
  await captureLogs(() => g.DP.gateDialUpgrade(req('macbook', wrong()), sock()));
  g.H.noteDial = note;
  ok(order.join(',') === 'answer,record:refused', `the refusal is written before the known name's record (${order.join(' → ')}) — no work for a paired name stands between the knock and its answer`);
  // ③ 2 000 knocks from ONE address, half on the paired name, half on guesses: the LOG is budgeted, the row keeps recording
  const savesBefore = g.saves();
  let lastAt = 0;
  const lines = await captureLogs(() => { for (let i = 0; i < 2000; i++) { g.DP.gateDialUpgrade(req(i % 2 ? 'macbook' : 'guess-' + i, wrong()), sock()); } lastAt = Date.now(); });
  const row = g.H.list().find((h) => h.deviceId === 'macbook');
  ok(lines.length <= 2 * 30 + 2 && lines.some((l) => /exceed 30 in 10 min/.test(l)), `2 000 refusals from one address write ${lines.length} journal lines (≤ 62: 30 for the paired name, 30 for guesses, one summary each) — the pre-fix gate wrote 2 000`, lines.slice(-2));
  ok(row.dial.lastRefusal && row.dial.lastRefusal.at >= lastAt - 1000 && row.dial.lastRefusal.code === 'token-mismatch', '…the paired device\'s row still records the LAST refusal (the record is never budgeted — the r2 WIP muted it past 30, so a device behind the relay\'s shared address stopped showing why it was refused)');
  ok(g.saves() - savesBefore <= 1, `…and hosts.json was written ${g.saves() - savesBefore} time(s) for 2 000 knocks (throttled per device)`);
  // ④ two paired devices behind ONE address (the relay's loopback): neither mutes the other
  const g2 = mkGate(require('../src/server/dial-pairing.js'));
  g2.DP.agentdMintDialPair('pi', { host: 'hub:3456' });
  const l2 = await captureLogs(() => { for (let i = 0; i < 25; i++) { g2.DP.gateDialUpgrade(req('macbook', wrong(), '127.0.0.1'), sock()); g2.DP.gateDialUpgrade(req('pi', wrong(), '127.0.0.1'), sock()); } });
  ok(l2.filter((l) => /for 'macbook'/.test(l)).length === 25 && l2.filter((l) => /for 'pi'/.test(l)).length === 25, `two paired devices dialing through one address (the relay) are each logged (${l2.length} lines for 50 refusals)`);
  // ⑤ a correct token after 2 000 refusals from the same address is admitted at once (a log budget, never a lock)
  const okGate = g.DP.gateDialUpgrade(req('macbook', g.pair.dialToken), sock());
  ok(okGate && okGate.deviceId === 'macbook', 'a correct token from the same address is admitted after 2 000 refusals (the budget never locks: a lock keyed by address would let one stale device behind the relay lock out every other)');
  // ⑥ a copy of the pairing sending a fresh boot id per knock: the row's 10-min duplicate note is written once, not per knock
  const sd = g.saves();
  for (let i = 0; i < 50; i++) g.H.noteDial('macbook', 'duplicate', { at: Date.now(), from: '10.0.0.7', boot: crypto.randomBytes(8).toString('hex') });
  ok(g.saves() - sd <= 1, `50 duplicate refusals with 50 fresh boot ids write hosts.json ${g.saves() - sd} time(s) (r1: once per NEW boot id = per knock)`);
  // CONTROLS (patched copies, a closed world): (i) the gate answering `no-pairing` for an unknown name ⇒ ① red;
  // (j) the gate logging every refusal (no budget) ⇒ ③ red; (k) the record inside the budget (the WIP) ⇒ ③'s row leg red;
  // (l) hosts.js with r1's "urgent for every new boot" ⇒ ⑥ red
  {
    const M = mutantCopies('dialgate', REPO);
    const dpSrc = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
    const i = dpSrc.replace("const code = why === 'no-pairing' ? 'token-mismatch' : why;", 'const code = why;');
    ok(i !== dpSrc, '(i) the patch applies');
    const gi = mkGate(M.load('src/server/dial-pairing.js', i, 'twoanswers'));
    const si = sock(); await captureLogs(() => gi.DP.gateDialUpgrade(req('nosuch-device', wrong()), si));
    ok(heard(si).code === 'no-pairing', 'CONTROL (i): the pre-fix gate answers an unknown name `no-pairing` — the one-answer leg goes red');
    const j = dpSrc.replace('if (b.log) { console.log(line); return; }', 'console.log(line); return;');
    ok(j !== dpSrc, '(j) the patch applies');
    const gj = mkGate(M.load('src/server/dial-pairing.js', j, 'nobudget'));
    const lj = await captureLogs(() => { for (let n = 0; n < 2000; n++) gj.DP.gateDialUpgrade(req(n % 2 ? 'macbook' : 'guess-' + n, wrong()), sock()); });
    ok(lj.length === 2000, `CONTROL (j): without the budget 2 000 refusals write ${lj.length} lines — the budget leg goes red`);
    const k = dpSrc.replace("    if (why === 'token-mismatch') noteDialEvent(deviceId, 'refused', { ...facts, code });\n", '').replace('if (b.log) { console.log(line); return; }', "if (b.log) { console.log(line); if (/token mismatch/.test(line)) noteDialEvent(deviceKey, 'refused', { ...facts, code: 'token-mismatch' }); return; }");
    ok(k !== dpSrc && !/noteDialEvent\(deviceId, 'refused'/.test(k), '(k) the patch applies');
    const gk = mkGate(M.load('src/server/dial-pairing.js', k, 'recordbudgeted'));
    let lastK = 0;
    await captureLogs(async () => { for (let n = 0; n < 200; n++) gk.DP.gateDialUpgrade(req('macbook', wrong()), sock()); await sleep(30); for (let n = 0; n < 10; n++) gk.DP.gateDialUpgrade(req('macbook', wrong()), sock()); lastK = Date.now(); });
    const rk = gk.H.list().find((h) => h.deviceId === 'macbook');
    ok(rk.dial.lastRefusal && rk.dial.lastRefusal.at < lastK - 20, 'CONTROL (k): with the record inside the budget the row stops at the 30th refusal — the row-recording leg goes red');
    const hostsSrc = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
    const l = hostsSrc.replace('const prevAt = Number(d.lastDuplicate && d.lastDuplicate.at) || 0;', 'const prevBoot = d.lastDuplicate && d.lastDuplicate.boot;').replace('urgent = at - prevAt > DF.DUP_NOTE_MS;', 'urgent = prevBoot !== d.lastDuplicate.boot;');
    ok(l !== hostsSrc && /urgent = prevBoot !== d\.lastDuplicate\.boot;/.test(l), '(l) the patch applies');
    const Hl = M.load('src/hosts.js', l, 'r1dup').HostManager;
    const gl = mkGate(require('../src/server/dial-pairing.js'), Hl);
    const sl = gl.saves();
    for (let n = 0; n < 50; n++) gl.H.noteDial('macbook', 'duplicate', { at: Date.now(), from: '10.0.0.7', boot: crypto.randomBytes(8).toString('hex') });
    ok(gl.saves() - sl === 50, `CONTROL (l): r1's rule writes hosts.json ${gl.saves() - sl} times for 50 fresh boot ids — the duplicate-note leg goes red`);
    for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 4, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
  }
}

// ── verify-r3 B-rst: a client that RESETS while the gate holds its socket never takes the hub down ──
// node's http server removes its own 'error' listener at 'upgrade'; the gate holds the socket (a refusal / a probe answer
// end() and destroy 2 s later; admitDial parks it ≤ 1.5 s) — an RST inside that window was an unhandled ECONNRESET ⇒
// server.js's uncaughtException ⇒ process.exit(1) (reproduced 3 / 3: scratch/r3-repro-rst.mjs). A REAL http server,
// real TCP clients that answer the hub's frame with an RST, the real gate behind server.js's branch.
const rstLeg = async (DPmod) => {
  const dataDir = path.join(tmp, 'rst-' + Math.random().toString(36).slice(2, 8)); fs.mkdirSync(dataDir, { recursive: true });
  const H = new (require('../src/hosts.js').HostManager)({ dataDir });
  const DP = DPmod.create({ rootDir: tmp, AGENTD_DIR: path.join(dataDir, 'agentd'), agentdHostToken: () => 'vsht_ok', getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} });
  const pr = DP.agentdMintDialPair('rstdev', { host: 'hub' });
  const uncaught = []; const onU = (e) => uncaught.push((e && e.code) || String(e && e.message));
  process.on('uncaughtException', onU);
  const hs = (await import('node:http')).createServer((q, r) => { r.writeHead(404); r.end(); });
  hs.on('upgrade', (rq, socket) => { const gate = DP.gateDialUpgrade(rq, socket); if (!gate) return; DP.admitDial(gate.deviceId, gate.facts, socket).then((admit) => { if (admit) socket.destroy(); }); });
  await new Promise((r) => hs.listen(0, '127.0.0.1', r));
  const knock = (dev, tok, { probe = false, boot = '' } = {}) => new Promise((resolve) => {
    const c = net.connect(hs.address().port, '127.0.0.1', () => c.write(`GET /api/device-dial?device=${dev} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nx-vibespace-dial-token: ${tok}\r\n${probe ? 'x-vibespace-dial-probe: 1\r\n' : ''}${boot ? `x-vibespace-daemon-boot: ${boot}\r\n` : ''}\r\n`));
    c.on('error', () => {});
    c.once('data', () => { c.resetAndDestroy(); resolve('answered'); });
    setTimeout(() => { if (!c.destroyed) c.resetAndDestroy(); resolve('parked'); }, 250); // RST while admitDial still probes the current link
  });
  const outs = [];
  outs.push(await knock('rstdev', 'vsdt_' + 'f'.repeat(36)));              // a refusal (a wrong token)
  outs.push(await knock('nosuch', 'vsdt_' + 'f'.repeat(36)));              // a refusal (no such pairing)
  outs.push(await knock('rstdev', pr.dialToken, { probe: true }));         // a --dial-check probe's 200
  DP.agentdDials.set('rstdev', { write: () => true, on() { }, destroy() { } }); // a current link that does not answer yet
  outs.push(await knock('rstdev', pr.dialToken, { boot: 'deadbeef00' })); // a second daemon: parked in admitDial's probe
  await sleep(400); // an RST's error fires as it arrives (the refusals' 2 s destroy and admitDial's 1.5 s probe are still pending — the window under test)
  process.removeListener('uncaughtException', onU);
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
  hs.close();
  return { outs, uncaught };
};
{
  console.log('— verify-r3 B-rst: an RST while the gate holds the socket —');
  const r = await rstLeg(require('../src/server/dial-pairing.js'));
  ok(r.outs.join(',') === 'answered,answered,answered,parked' && r.uncaught.length === 0, 'verify-r3 B-rst: four RSTs — after a refusal, an unknown name\'s refusal, a probe\'s 200, and inside admitDial\'s probe window — raise NOTHING uncaught (server.js would exit the whole hub on one)', r);
  const M = mutantCopies('dialrst', REPO);
  const dpSrc = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
  const noGuard = dpSrc.replace("  socket.on('error', () => { try { socket.destroy(); } catch { } });\n  const q = new URL(req.url, 'http://x').searchParams;", "  const q = new URL(req.url, 'http://x').searchParams;");
  ok(noGuard !== dpSrc, '(m) the patch applies');
  const c = await rstLeg(M.load('src/server/dial-pairing.js', noGuard, 'noguard'));
  ok(c.uncaught.length >= 3 && c.uncaught.every((x) => x === 'ECONNRESET'), `CONTROL (m): the gate without its error listener lets ${c.uncaught.length} ECONNRESET(s) through uncaught — the leg above goes red`, c);
  for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(x.pass, x.name, x.detail);
}

// WIRING: server.js runs the hello on every dial-in through deviceForDial (where the refused stream is remembered)
ok(/deviceForDial\(deviceId\)\.catch\(\(\) => \{ \}\); \/\/ the mux hello NOW/.test(fs.readFileSync(path.join(REPO, 'server.js'), 'utf8')), 'WIRING: server.js hands every dial-in to deviceForDial (the refused-stream memo lives there)');
ok(/authFailedStreams\.set\(deviceId, \{ stream: curStream, at: Date\.now\(\) \}\)/.test(fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8')), 'WIRING: deviceForDial remembers the refused stream');

srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
