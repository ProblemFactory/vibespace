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
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');
const { DeviceManager } = require('../src/agentd/client.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
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
// "at once" is EVIDENCE, never a stopwatch (lane mirror-flake-hardening): the answer settles before the event loop
// turns — no hello round trip, no probe, no timer stood between the ask and the refusal. The ms are information.
const inTurn = (p) => Promise.race([p.then(() => true, () => true), new Promise((res) => setImmediate(() => res(false)))]);
const closed = (s) => new Promise((res) => { if (s.destroyed) return res(true); s.once('close', () => res(true)); setTimeout(() => res(false), 800); });

console.log('— the real DeviceManager over a stream transport: auth-fail rejects fast and KEEPS the stream —');
{
  const stream = await dialIn();
  const dm = new DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_wrong', getStream: () => stream } });
  const t0 = Date.now();
  // "at once" is the retry COUNT at the rejection (lane wall-clock-ratchet-down: `< 2000 ms` judged the machine): the
  // first refusal rejects — one hello sent when connect() settles, no retry stood between; the ms are information
  let err = null, hellosAtReject = null; try { await dm.connect(); } catch (e) { err = e; hellosAtReject = hellos; }
  ok(gateOf(err) && err.code === 'auth_failed' && gateOf(/auth failed/.test(err.message)) && hellosAtReject === 1, `connect() rejects auth_failed on the first refusal (${hellosAtReject} hello sent when it settled, ${Date.now() - t0} ms) — no minute of retries`, err && err.message);
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
  let e1 = null; const p1 = DP.deviceForDial('devK').catch((e) => { e1 = e; }); const now1 = await inTurn(p1); await p1;
  ok(gateOf(e1) && e1.code === 'auth_failed', 'the first op: auth_failed (one hello)', e1 && e1.message);
  ok(now1 === false, 'CONTROL: that first op waited on its hello round trip — it had NOT settled when the loop turned (what "before the loop turned" rules out below)');
  const DF = require('../src/dial-facts.js');
  const row = () => H.list().find((h) => h.deviceId === 'devK');
  ok(DF.dialRowState(row()).state === 'auth-fail', `THE ROW reads auth-fail while the device stays dialed in (${DF.dialRowState(row()).state})`);
  const t1 = Date.now();
  let e2 = null; const p2 = DP.deviceForDial('devK').catch((e) => { e2 = e; }); const now2 = await inTurn(p2); await p2;
  ok(gateOf(e2) && e2.code === 'auth_failed' && hellos === 1 && verdictOf(now2), `a second op on the SAME stream is refused at once — before the loop turned — with NO second hello (hellos=${hellos}, ${Date.now() - t1} ms) and names the way out`, e2 && e2.message);
  ok(verdictOf(/generate a new command/.test(String(e2 && e2.message))), '…the sentence says: generate a new command and run it there');
  ok(!stream1.destroyed && DP.agentdDials.get('devK') === stream1, 'the link is still the same live stream (never destroyed by the refusal)');
  // a FRESH stream (the device re-dialed after the user ran the new command) is asked again
  stream1.destroy();
  const stream2 = await dialIn();
  DP.agentdDials.set('devK', stream2);
  let e3 = null; try { await DP.deviceForDial('devK'); } catch (e) { e3 = e; }
  ok(gateOf(e3) && hellos === 2, `a fresh stream gets a fresh hello (hellos=${hellos})`);
  // the re-hello window: after AUTH_FAIL_REHELLO_MS the same stream is asked once more (a token fixed in place heals)
  const realNow = Date.now;
  Date.now = () => realNow() + DP.AUTH_FAIL_REHELLO_MS + 1;
  try { let e4 = null; try { await DP.deviceForDial('devK'); } catch (e) { e4 = e; } ok(gateOf(e4) && hellos === 3, `after AUTH_FAIL_REHELLO_MS (${DP.AUTH_FAIL_REHELLO_MS / 1000} s) the same stream is asked once more (hellos=${hellos})`); }
  finally { Date.now = realNow; }
  stream2.destroy();
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
}

console.log('— CONTROL: a client.js copy without the keep destroys the stream on auth-fail (the loop\'s first step) —');
{
  const M = mutantCopies('dialkept', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const patched = editAnchor(src, "if (this._transport.kind === 'stream') { keepStream = true; mux.onControl = () => { }; }", '', "src/agentd/client.js");
  ok(patched !== src, '(the patch applies)');
  const { DeviceManager: DM2 } = M.load('src/agentd/client.js', patched, 'nokeep');
  const stream = await dialIn();
  const dm = new DM2({ dataDir: tmp, bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_wrong', getStream: () => stream } });
  try { await dm.connect(); } catch { }
  ok(verdictOf(await closed(stream)), 'CONTROL: without the keep the stream is destroyed on auth-fail — the pre-fix shape (a real device re-dials a second later)');
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
  ok(admit === null && gateOf(/401 Unauthorized/.test(sk.frame)) && verdictOf(/X-VibeSpace-Dial-Refusal: duplicate-device/.test(sk.frame)), `a newcomer with NO boot id is REFUSED duplicate-device while the current answers (${Date.now() - t0} ms; r1 admitted it unasked)`, sk.frame.slice(0, 80));
  ok(DP.agentdDials.get('devA') === s1 && !s1.destroyed, '…and the current link is untouched');
  ok(DF.dialRowState(H.list().find((h) => h.deviceId === 'devA')).dup?.from === '10.0.0.9', '…the row carries the duplicate note with the newcomer\'s address');
  // ② a newcomer with a DIFFERENT boot id: refused (r1's cell, still)
  sk = fakeSocket(); admit = await DP.admitDial('devA', { boot: BOOT_B }, sk);
  ok(admit === null && verdictOf(/duplicate-device/.test(sk.frame)), 'a newcomer with another boot id is refused (r1)');
  // ③ the SAME boot id: replaced without a probe (the daemon re-dialing after its own drop)
  sk = fakeSocket(); t0 = Date.now(); const pA = DP.admitDial('devA', { boot: BOOT_A }, sk); const nowA = await inTurn(pA); admit = await pA;
  ok(admit === true && sk.frame === '' && verdictOf(nowA), `the same boot id is admitted at once — before the loop turned, no probe (${Date.now() - t0} ms)`);
  // ④ a hello IN FLIGHT: a fresh stream accepted, its hello answered after 700 ms, a newcomer arriving inside that
  //    window — r1 read `connected:false` as dead and let it evict the healthy device; now the probe JOINS the hello
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } } DP.agentdDialDevices.clear();
  s1.destroy();
  helloDelay = 700;
  const s2 = await accept(DP, BOOT_A);
  const helloP = DP.deviceForDial('devA').catch(() => null); // server.js's accept path: the hello NOW
  await sleep(50);
  sk = fakeSocket(); t0 = Date.now(); admit = await DP.admitDial('devA', { boot: BOOT_B }, sk);
  ok(admit === null && gateOf(/duplicate-device/.test(sk.frame)) && Date.now() - t0 >= 600, `a newcomer inside the current's hello round trip is refused after the hello lands (${Date.now() - t0} ms) — never "not connected ⇒ dead ⇒ replace"`, sk.frame.slice(0, 60));
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
    const dfMut = editAnchor(dfSrc, "if (cb && ib && cb === ib) return { action: 'replace', why: 'same-daemon' };", "if (!cb || !ib) return { action: 'replace', why: 'unknown-boot' };\n  if (cb === ib) return { action: 'replace', why: 'same-daemon' };", "src/dial-facts.js");
    ok(dfMut !== dfSrc, '(the verdict patch applies)');
    const dfPath = M.write('src/dial-facts.js', dfMut, 'r1rule', { name: 'dial-facts-r1' });
    const dpSrc = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
    const dpMut = editAnchor(dpSrc, "const DF = require('../dial-facts.js');", `const DF = require(${JSON.stringify(dfPath)});`, "src/server/dial-pairing.js");
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
  ok(lf.length === 1 && !/\n/.test(lf[0]) && verdictOf(/REJECTED for 'x\?\[device\] dial accepted/.test(lf[0])), 'a name carrying a newline is logged as ONE line with the control character shown as "?" (no forged "[device] dial accepted" line)', lf);
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
  ok(lines.length <= 2 * 30 + 2 && verdictOf(lines.some((l) => /exceed 30 in 10 min/.test(l))), `2 000 refusals from one address write ${lines.length} journal lines (≤ 62: 30 for the paired name, 30 for guesses, one summary each) — the pre-fix gate wrote 2 000`, lines.slice(-2));
  ok(gateOf(row.dial.lastRefusal) && row.dial.lastRefusal.at >= lastAt - 1000 && row.dial.lastRefusal.code === 'token-mismatch', '…the paired device\'s row still records the LAST refusal (the record is never budgeted — the r2 WIP muted it past 30, so a device behind the relay\'s shared address stopped showing why it was refused)');
  ok(g.saves() - savesBefore <= 1, `…and hosts.json was written ${g.saves() - savesBefore} time(s) for 2 000 knocks (throttled per device)`);
  // ④ two paired devices behind ONE address (the relay's loopback): neither mutes the other
  const g2 = mkGate(require('../src/server/dial-pairing.js'));
  g2.DP.agentdMintDialPair('pi', { host: 'hub:3456' });
  const l2 = await captureLogs(() => { for (let i = 0; i < 25; i++) { g2.DP.gateDialUpgrade(req('macbook', wrong(), '127.0.0.1'), sock()); g2.DP.gateDialUpgrade(req('pi', wrong(), '127.0.0.1'), sock()); } });
  ok(l2.filter((l) => /for 'macbook'/.test(l)).length === 25 && l2.filter((l) => /for 'pi'/.test(l)).length === 25, `two paired devices dialing through one address (the relay) are each logged (${l2.length} lines for 50 refusals)`);
  // ⑤ a correct token after 2 000 refusals from the same address is admitted at once (a log budget, never a lock)
  const okGate = g.DP.gateDialUpgrade(req('macbook', g.pair.dialToken), sock());
  ok(gateOf(okGate) && okGate.deviceId === 'macbook', 'a correct token from the same address is admitted after 2 000 refusals (the budget never locks: a lock keyed by address would let one stale device behind the relay lock out every other)');
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
    const i = editAnchor(dpSrc, "const code = why === 'no-pairing' ? 'token-mismatch' : why;", 'const code = why;', "src/server/dial-pairing.js");
    ok(i !== dpSrc, '(i) the patch applies');
    const gi = mkGate(M.load('src/server/dial-pairing.js', i, 'twoanswers'));
    const si = sock(); await captureLogs(() => gi.DP.gateDialUpgrade(req('nosuch-device', wrong()), si));
    ok(heard(si).code === 'no-pairing', 'CONTROL (i): the pre-fix gate answers an unknown name `no-pairing` — the one-answer leg goes red');
    const j = editAnchor(dpSrc, 'if (b.log) { console.log(line); return; }', 'console.log(line); return;', "src/server/dial-pairing.js");
    ok(j !== dpSrc, '(j) the patch applies');
    const gj = mkGate(M.load('src/server/dial-pairing.js', j, 'nobudget'));
    const lj = await captureLogs(() => { for (let n = 0; n < 2000; n++) gj.DP.gateDialUpgrade(req(n % 2 ? 'macbook' : 'guess-' + n, wrong()), sock()); });
    ok(lj.length === 2000, `CONTROL (j): without the budget 2 000 refusals write ${lj.length} lines — the budget leg goes red`);
    const k = editAnchor(editAnchor(dpSrc, "    if (why === 'token-mismatch') noteDialEvent(deviceId, 'refused', { ...facts, code });\n", '', "src/server/dial-pairing.js"), 'if (b.log) { console.log(line); return; }', "if (b.log) { console.log(line); if (/token mismatch/.test(line)) noteDialEvent(deviceKey, 'refused', { ...facts, code: 'token-mismatch' }); return; }", "src/server/dial-pairing.js");
    ok(k !== dpSrc && !/noteDialEvent\(deviceId, 'refused'/.test(k), '(k) the patch applies');
    const gk = mkGate(M.load('src/server/dial-pairing.js', k, 'recordbudgeted'));
    let lastK = 0;
    await captureLogs(async () => { for (let n = 0; n < 200; n++) gk.DP.gateDialUpgrade(req('macbook', wrong()), sock()); await sleep(30); for (let n = 0; n < 10; n++) gk.DP.gateDialUpgrade(req('macbook', wrong()), sock()); lastK = Date.now(); });
    const rk = gk.H.list().find((h) => h.deviceId === 'macbook');
    ok(gateOf(rk.dial.lastRefusal) && rk.dial.lastRefusal.at < lastK - 20, 'CONTROL (k): with the record inside the budget the row stops at the 30th refusal — the row-recording leg goes red');
    const hostsSrc = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
    const l = editAnchor(editAnchor(hostsSrc, 'const prevAt = Number(d.lastDuplicate && d.lastDuplicate.at) || 0;', 'const prevBoot = d.lastDuplicate && d.lastDuplicate.boot;', "src/hosts.js"), 'urgent = at - prevAt > DF.DUP_NOTE_MS;', 'urgent = prevBoot !== d.lastDuplicate.boot;', "src/hosts.js");
    ok(l !== hostsSrc && verdictOf(/urgent = prevBoot !== d\.lastDuplicate\.boot;/.test(l)), '(l) the patch applies');
    const Hl = M.load('src/hosts.js', l, 'r1dup').HostManager;
    const gl = mkGate(require('../src/server/dial-pairing.js'), Hl);
    const sl = gl.saves();
    for (let n = 0; n < 50; n++) gl.H.noteDial('macbook', 'duplicate', { at: Date.now(), from: '10.0.0.7', boot: crypto.randomBytes(8).toString('hex') });
    ok(gl.saves() - sl === 50, `CONTROL (l): r1's rule writes hosts.json ${gl.saves() - sl} times for 50 fresh boot ids — the duplicate-note leg goes red`);
    for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 4, label: 'mutant-copy: ' })) ok(verdictOf(r.pass), r.name, r.detail);
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
  const noGuard = editAnchor(dpSrc, "  socket.on('error', () => { try { socket.destroy(); } catch { } });\n  const q = new URL(req.url, 'http://x').searchParams;", "  const q = new URL(req.url, 'http://x').searchParams;", "src/server/dial-pairing.js");
  ok(noGuard !== dpSrc, '(m) the patch applies');
  const c = await rstLeg(M.load('src/server/dial-pairing.js', noGuard, 'noguard'));
  ok(c.uncaught.length >= 3 && verdictOf(c.uncaught.every((x) => x === 'ECONNRESET')), `CONTROL (m): the gate without its error listener lets ${c.uncaught.length} ECONNRESET(s) through uncaught — the leg above goes red`, c);
  for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(verdictOf(x.pass), x.name, x.detail);
}

// ── B-4d71 AN UNPAIRED DEVICE IS TOLD «retired», WITH THE PROOF — the hub keeps the unpaired token's TOMBSTONE (its hash); the
// device's next dial with that EXACT token hears «retired» and an HMAC of its own per-dial nonce keyed by the token's hash,
// which its agent checks from the token it holds before it removes its own start; anyone else hears the one answer ──
console.log('— B-4d71 an unpaired device: «retired» with the proof to its own token, the one answer to anyone else —');
{
  const { HostManager } = require('../src/hosts.js');
  const PT = require('../src/pairing-token.js');
  const crypto = require('node:crypto');
  const mkGate = (DPmod) => {
    const dataDir = path.join(tmp, 'retire-' + Math.random().toString(36).slice(2, 8)); fs.mkdirSync(dataDir, { recursive: true });
    const H = new HostManager({ dataDir });
    const DP = DPmod.create({ rootDir: tmp, AGENTD_DIR: path.join(dataDir, 'agentd'), agentdHostToken: () => 'vsht_ok', getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} });
    H.dialOnline = (d) => DP.agentdDials.has(d);
    return { H, DP, dataDir };
  };
  const sock = () => ({ destroyed: false, frame: '', on() { }, end(s) { this.frame = String(s || ''); }, destroy() { this.destroyed = true; } });
  const dial = (DP, device, token, nonce = null) => { const s = sock(); const o = console.log; console.log = () => { }; try { DP.gateDialUpgrade({ url: `/api/device-dial?device=${encodeURIComponent(device)}`, headers: { 'x-vibespace-dial-token': token, host: 'hub:3456', ...(nonce ? { 'x-vibespace-dial-nonce': nonce } : {}) }, socket: { remoteAddress: '203.0.113.9' } }, s); } finally { console.log = o; } return s; };
  const heard = (s) => ({ code: (/X-VibeSpace-Dial-Refusal: (\S+)/.exec(s.frame) || [])[1] || null, proof: (/X-VibeSpace-Retire-Proof: (\S+)/.exec(s.frame) || [])[1] || null });
  const unpair = async (g, deviceId) => { await g.DP.unpairDialDevice(deviceId); const h = g.H.findByDeviceId(deviceId); if (h) g.H.remove(h.id); };   // exit-routes removeHost's order: the unpair, then the record
  const g = mkGate(require('../src/server/dial-pairing.js'));
  const HOST_TOKEN = 'vsht_ok';   // (this rig's agentdHostToken: the host token the hub sends inside a live link's hello, never on a dial)
  const { dialToken: tok } = g.DP.agentdMintDialPair('mini', { host: 'hub:3456' });
  await unpair(g, 'mini');
  const nonce = crypto.randomBytes(16).toString('hex');
  const r1 = heard(dial(g.DP, 'mini', tok, nonce));
  ok(r1.code === 'retired' && !!r1.proof && verdictOf(PT.retireProofMatches(HOST_TOKEN, { deviceId: 'mini', dialToken: tok, nonce }, r1.proof)), 'an unpaired device dials with its own token: «retired», and the proof its agent checks (its HOST token, its id, its dial token, the nonce) holds', r1);
  ok(!PT.retireProofMatches(HOST_TOKEN, { deviceId: 'mini', dialToken: tok, nonce: crypto.randomBytes(16).toString('hex') }, r1.proof) && !PT.retireProofMatches('vsht_' + crypto.randomBytes(24).toString('hex'), { deviceId: 'mini', dialToken: tok, nonce }, r1.proof)
    && !PT.retireProofMatches(tok, { deviceId: 'mini', dialToken: tok, nonce }, r1.proof) && !PT.retireProofMatches(HOST_TOKEN, { deviceId: 'mini2', dialToken: tok, nonce }, r1.proof),
    '…the proof holds for THAT dial\'s nonce, THAT host token and THAT device only — a replay to another dial, another host token, the DIAL token in its place (it rides every dial), another device id: all refused');
  await g.H.persisted();   // (the store writes on its own thread)
  const reloaded = new HostManager({ dataDir: g.dataDir }), rt = reloaded.retiredDialFor('mini', tok, PT.tokenMatches);
  ok(!!rt && rt.hash === PT.tokenHash(tok) && rt.proofKey === PT.tokenHash(HOST_TOKEN), '…the tombstone keeps the two HASHES (the dial token\'s, the host token\'s) and outlives a hub restart (hosts.json)', rt);
  const r2 = heard(dial(g.DP, 'mini', 'vsdt_' + crypto.randomBytes(18).toString('hex'), nonce));
  ok(r2.code === 'token-mismatch' && !r2.proof, 'the same name with ANY other token: the one answer every stranger hears (no word that the name was ever paired)', r2);
  const r3 = heard(dial(g.DP, 'mini', tok));
  ok(r3.code === 'retired' && !r3.proof, 'a dial with no nonce (an agent older than the answer): «retired» and NO proof — such an agent keeps its start, as before', r3);
  // the name paired again (another machine, or this one with a new command): the OLD pairing's token is still told «retired» — a new
  // pairing drops no tombstone (its fresh token never matches one); unpaired again, both are
  const { dialToken: tok2 } = g.DP.agentdMintDialPair('mini', { host: 'hub:3456' });
  ok(heard(dial(g.DP, 'mini', tok, nonce)).code === 'retired', 'the name paired again: the old pairing\'s device is still told «retired» (never «token-mismatch» for ever, nor a «second agent» warning on the new row)');
  await unpair(g, 'mini');
  ok(heard(dial(g.DP, 'mini', tok, nonce)).code === 'retired' && heard(dial(g.DP, 'mini', tok2, nonce)).code === 'retired', 'unpaired again: both pairings\' devices are told (a tombstone per token)');
  {
    let asked = 0;
    const dataDirL = path.join(tmp, 'retire-locked'); fs.mkdirSync(dataDirL, { recursive: true });
    const HL = new HostManager({ dataDir: dataDirL });
    const DPL = require('../src/server/dial-pairing.js').create({ rootDir: tmp, AGENTD_DIR: path.join(dataDirL, 'agentd'), agentdHostToken: () => { asked++; return 'vsht_ok'; }, hostTokenLocked: () => (asked > 0 ? 'the vault is locked' : null), getHosts: () => HL, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} });
    const { dialToken: tokL } = DPL.agentdMintDialPair('locked', { host: 'hub:3456' });   // (the mint asks it once: the vault was open then)
    const before = asked;
    await DPL.unpairDialDevice('locked'); const hl = HL.findByDeviceId('locked'); if (hl) HL.remove(hl.id);
    const rl = heard(dial(DPL, 'locked', tokL, nonce)), tl = HL.retiredDialFor('locked', tokL, PT.tokenMatches);
    ok(asked === before && !!tl && !tl.proofKey && rl.code === 'retired' && !rl.proof, 'a vault locked at the unpair: the host token is never asked (no «waiting on the vault» note for a machine just removed), the tombstone has no proof key — the device hears «retired» without a proof and keeps its start', { asked, before, tl, rl });
  }
  const tomb2 = mkGate(require('../src/server/dial-pairing.js'));
  for (let i = 0; i < 3; i++) { tomb2.DP.agentdMintDialPair('d' + i, { host: 'hub:3456' }); await unpair(tomb2, 'd' + i); }
  ok((tomb2.H._state.retiredDials || []).length === 3 && verdictOf((tomb2.H._state.retiredDials || []).every((x) => x.proofKey === PT.tokenHash(HOST_TOKEN))), 'one tombstone per unpaired pairing, each with its proof key');
  // RED CONTROL (anchored: the gate without the tombstone, as released) — the unpaired device hears «token-mismatch» for ever
  const M = mutantCopies('dialretire', REPO);
  const dpSrc = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
  const anchorT = "  const tomb = deviceId && !(want && PT.tokenMatches(tok, want)) ? hosts.retiredDialFor?.(deviceId, tok, PT.tokenMatches) : null;\n";
  ok(verdictOf(dpSrc.includes(anchorT)), 'the control\'s anchor is in the source');
  const gm = mkGate(M.load('src/server/dial-pairing.js', anchored(dpSrc, anchorT, '  const tomb = null;\n', 'no-tomb'), 'no-tomb'));
  const { dialToken: tokM } = gm.DP.agentdMintDialPair('mini', { host: 'hub:3456' });
  await unpair(gm, 'mini');
  ok(heard(dial(gm.DP, 'mini', tokM, nonce)).code === 'token-mismatch', 'CONTROL (the gate without the tombstone, as released): the unpaired device hears «token-mismatch» — its agent dials a refusing hub for ever ⇒ RED');
  for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(verdictOf(x.pass), x.name, x.detail);
}


console.log('— unit 4\'s cure: a refused GREETING on a dialed stream is remembered — N ops, ONE hello, ONE kept Mux that answers the heartbeat —');
{
  // THE HUB'S OWN ADAPTER (dial-pairing wsStream, which server.js hands every dial-in) over a fake ws, wired to a fake device
  // whose greeting has the wrong shape (300 capabilities). The device's Mux asks a PING of the hub whenever the leg wants.
  const { EventEmitter } = require('node:events');
  const DPM = require('../src/server/dial-pairing.js');
  let gHellos = 0;
  const badAck = { op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.1.1', platform: 'linux', capabilities: Array.from({ length: 300 }, (_, i) => 'cap' + i) };
  const wsPair = (ackOf = () => badAck) => {
    const ws = new EventEmitter(), dev = new EventEmitter();
    let closed = 0;
    ws.send = (d) => { const b = Buffer.from(d); setImmediate(() => dev.emit('data', b)); };
    ws.close = () => { closed++; if (closed === 1) setImmediate(() => ws.emit('close')); }; // a real ws says 'close' once its socket is gone
    dev.write = (d) => { const b = Buffer.from(d); setImmediate(() => ws.emit('message', b)); return true; };
    dev.destroy = () => {};
    const devMux = new Mux(dev, { heartbeat: false, onControl: (m) => { if (m.op === 'hello') { gHellos++; devMux.control(ackOf()); } }, onData: () => {}, onDead: () => {} });
    return { stream: DPM.wsStream(ws), devMux, closed: () => closed };
  };
  const counts = (st) => ['data', 'close', 'error'].map((e) => st.listenerCount(e)).join('/');
  const { HostManager } = require('../src/hosts.js');
  const dataDir = path.join(tmp, 'data-greet'); fs.mkdirSync(dataDir, { recursive: true });
  const H = new HostManager({ dataDir });
  const dpOpts = { rootDir: tmp, AGENTD_DIR: path.join(dataDir, 'agentd'), agentdHostToken: () => 'vsht_ok', getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} };
  const DP = DPM.create(dpOpts);
  H.dialOnline = (d) => DP.agentdDials.has(d);
  H.setDialToken('devG', 'cd'.repeat(32));
  const P = wsPair();
  ok(typeof P.stream.removeListener === 'function' && counts(P.stream) === '0/0/0', 'the hub\'s own dial adapter can let a listener go, and starts empty', counts(P.stream));
  DP.agentdDials.set('devG', P.stream);
  DP.noteDialEvent('devG', 'accepted', { at: Date.now() });
  const N = 5, errs = [];
  for (let i = 0; i < N; i++) { try { await DP.deviceForDial('devG'); errs.push(null); } catch (e) { errs.push(e); } }
  ok(gateOf(errs.every((e) => e && e.code === 'hello-ack-shape')) && gHellos === 1, `${N} ops on the refused stream: each refused BY NAME (hello-ack-shape), ONE hello in all (hellos=${gHellos}) — the stream is remembered for the re-greet interval`, errs.map((e) => e && e.code));
  ok(counts(P.stream) === '1/1/1', `ONE kept Mux on the stream after ${N} ops: data/close/error listeners ${counts(P.stream)} (one each — the handshake's own error listener left with it)`);
  ok(verdictOf(await P.devMux.ping(1000)), 'the kept Mux answers the device\'s heartbeat (a PING gets its PONG) — the device keeps its link, so the next ask meets a live one');
  ok(P.closed() === 0, 'the dialed stream is KEPT (no re-dial storm)');
  ok(gateOf(errs[1]) && errs[1].stage === 'connect' && verdictOf(/update its agent, or rerun its install command/.test(String(errs[1].message))), 'the fast refusal has the first one\'s shape: its door named, stage connect', errs[1] && { m: errs[1].message, stage: errs[1].stage });
  const DF = require('../src/dial-facts.js');
  const row = () => H.list().find((h) => h.deviceId === 'devG');
  // list line 144's cure: the leg prints the two stamps it read (the accept and the refusals can share one millisecond here —
  // the row reads the order the hub recorded them, never the luck of the clock)
  { const r0 = row(), st0 = DF.dialRowState(r0).state, dd = (r0 && r0.dial) || {};
    ok(st0 === 'greeting-refused', `THE ROW reads greeting-refused while the device stays dialed in (${st0}; the connect stamped ${dd.lastConnectAt}, the greeting refusal ${dd.lastGreetingRefused && dd.lastGreetingRefused.at}) — its words name the door`); }
  const realNow = Date.now;
  Date.now = () => realNow() + DP.AUTH_FAIL_REHELLO_MS + 1;
  try {
    let e4 = null; try { await DP.deviceForDial('devG'); } catch (e) { e4 = e; }
    ok(gateOf(e4) && e4.code === 'hello-ack-shape' && gHellos === 2 && counts(P.stream) === '1/1/1', `after the re-greet interval the same stream is asked ONCE more (hellos ${gHellos}), and the new kept Mux took the old one's place (${counts(P.stream)})`);
  } finally { Date.now = realNow; }
  ok(verdictOf(await P.devMux.ping(1000)), '…and that one answers the device\'s heartbeat too');
  // the delta read's must: a newcomer that replaces the refused stream CLOSES it (left open, its kept Mux held the link for ever)
  const admit = await DP.admitDial('devG', { boot: 'another-boot' }, { destroyed: false });
  ok(admit === true && P.closed() === 0, 'a newcomer is admitted over a refused stream — nothing is closed yet: its upgrade may still fail, and its own greeting decides', { admit, closed: P.closed() });
  const goodAck = () => ({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: require('../package.json').version, platform: 'linux', capabilities: [] });
  const P2 = wsPair(goodAck);
  DP.adoptDialStream('devG', P2.stream);
  let eP2 = null; try { await DP.deviceForDial('devG'); } catch (e) { eP2 = e; }
  ok(!eP2 && DP.agentdDials.get('devG') === P2.stream && P.closed() === 1 && P2.closed() === 0, 'a newcomer that PASSES its greeting takes the place, and the refused stream it replaced is CLOSED (its kept Mux no longer holds the link)', { e: eP2 && eP2.message, closed: P.closed() });
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } } DP.agentdDialDevices.clear();
  DP.agentdDials.set('devG', P.stream);
  await DP.unpairDialDevice('devG');
  {
    // a GOOD greeting after a refusal on the same stream: the kept Mux leaves, the live one is the only reader
    let good = false;
    const Q = wsPair(() => (good ? { op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.0.0', platform: 'linux', capabilities: [] } : badAck));
    const dmQ = () => new (require('../src/agentd/client.js').DeviceManager)({ dataDir: tmp, bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_ok', getStream: () => Q.stream } });
    let e1 = null; try { await dmQ().connect(); } catch (e) { e1 = e; }
    good = true;
    const live = dmQ(); let e2 = null; try { await live.connect(); } catch (e) { e2 = e; }
    ok(gateOf(e1) && e1.code === 'hello-ack-shape' && !e2 && Q.stream.listenerCount('data') === 1 && Q.stream.listenerCount('close') === 1 && verdictOf(await Q.devMux.ping(1000)), 'a good greeting after a refusal on the same stream: the link opens and its Mux is the ONLY reader (the kept one left)', { e1: e1 && e1.code, e2: e2 && e2.message, data: Q.stream.listenerCount('data') });
    // a live link's Mux that DIES over a stream still open (its heartbeat) is swapped out at the next handshake on it
    const deadThenAgain = async (Cl) => { const R = wsPair(() => ({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.0.0', platform: 'linux', capabilities: [] })); const dm = new Cl.DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_ok', getStream: () => R.stream } }); await dm.connect(); dm._conn.mux._die('heartbeat: 3 missed pongs'); await dm.connect(); const n = R.stream.listenerCount('data'); try { dm.stop(); } catch { } return n; };
    ok(await deadThenAgain(require('../src/agentd/client.js')) === 1, 'a live link\'s Mux that died over a still-open stream leaves it at the next handshake: ONE reader');
    try { live.stop(); } catch { }
  }
  ok(gateOf(fs.readFileSync(path.join(REPO, 'server.js'), 'utf8').includes('      const stream = wsStream(ws);')) && verdictOf(fs.readFileSync(path.join(REPO, 'server.js'), 'utf8').includes('      adoptDialStream(deviceId, stream);')), 'WIRING: server.js hands every dial-in to THIS adapter (wsStream), and adopts it through adoptDialStream (the replaced stream is closed)');
  ok(gateOf(fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8').includes("rs.state === 'greeting-refused' ? tr('GREETING REFUSED')")) && verdictOf(fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8').includes("drs.state === 'greeting-refused' || drs.state === 'key-refused')")), 'the row\'s badge says GREETING REFUSED and the Machines dot is red for it');
  {
    // TWO copies of ONE pairing, both refused (a migrated home folder — the B9 class). The law: a refused copy is remembered and
    // is no reason to close another refused copy's stream; the seat goes only to a copy that PASSES its greeting. The newcomer
    // over a refused copy is greeted ON PROBATION: refused, the first copy keeps its seat, both stay open (no close, so no
    // re-dial: no loop) and the row says each with its door; passing, it takes the seat. Beside the seat at most SPARES_MAX
    // copies wait: at that cap a further copy is turned away BY NAME (its daemon backs off), one more is greeted per interval,
    // a copy closed at the cap is known by its boot, and no copy is ever closed to make room.
    // Each dial here is what server.js does: admitDial → adoptDialStream → noteDialEvent('accepted') with the daemon's own boot
    // (16 hex, kept across its re-dials) → the greeting (deviceForDial). The accept is stamped a millisecond early: a real
    // greeting is a network round trip, so its refusal never shares the accept's millisecond (the row orders by time).
    const said = [];
    const sock = () => ({ destroyed: false, end(t) { said.push(String(t)); }, destroy() { this.destroyed = true; } });
    const goodAck2 = () => ({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: require('../package.json').version, platform: 'linux', capabilities: [] });
    const hex16 = () => require('node:crypto').randomBytes(8).toString('hex');
    const dialIn = async (DPx, id, pair, from = '', boot = hex16()) => { const facts = { boot, from }; const r = await DPx.admitDial(id, facts, sock()); if (r !== true) return { r }; DPx.adoptDialStream(id, pair.stream); DPx.noteDialEvent(id, 'accepted', { ...facts, at: Date.now() - 1 }); let e = null; try { await DPx.deviceForDial(id); } catch (x) { e = x; } return { r, e }; };
    const seatIn = async (DPx, id, pair, boot = hex16()) => { DPx.adoptDialStream(id, pair.stream); DPx.noteDialEvent(id, 'accepted', { boot, at: Date.now() - 1 }); try { await DPx.deviceForDial(id); } catch { } };
    const tick = () => new Promise((r) => setImmediate(r));
    const rowOf = (id) => DF.dialRowState(H.list().find((h) => h.deviceId === id));
    H.setDialToken('devD', 'ef'.repeat(32));
    const A = wsPair(); let eA = null; DP.adoptDialStream('devD', A.stream); DP.noteDialEvent('devD', 'accepted', { boot: hex16(), at: Date.now() - 1 }); try { await DP.deviceForDial('devD'); } catch (e) { eA = e; }
    const B = wsPair(), dB = await dialIn(DP, 'devD', B, 'copy-B');
    ok(gateOf(eA) && eA.code === 'hello-ack-shape' && dB.r === true && gateOf(dB.e) && dB.e.code === 'hello-ack-shape' && DP.agentdDials.get('devD') === A.stream && A.closed() === 0 && B.closed() === 0, 'two REFUSED copies: the second is greeted on probation and refused — the first keeps its seat, and BOTH stay open (no close, so no re-dial: no loop)', { dB: dB.e && dB.e.code, closedA: A.closed(), closedB: B.closed() });
    const rsD = rowOf('devD');
    ok(rsD.state === 'greeting-refused' && gateOf(rsD.dup) && rsD.dup.from === 'copy-B', 'THE ROW SAYS EACH: the seat\'s refusal with its door (greeting refused — update its agent) and the second copy with its own (another device dials in as this one — pair it under its own name)', { state: rsD.state, dup: rsD.dup });
    const hSeat = gHellos; let eSeat = null; try { await DP.deviceForDial('devD'); } catch (e) { eSeat = e; }
    ok(gateOf(eSeat) && eSeat.code === 'hello-ack-shape' && gHellos === hSeat, 'the seat\'s refusal is remembered after the probation (ops are refused fast, by name, with no hello)', { e: eSeat && eSeat.code, hellos: gHellos - hSeat });
    const C = wsPair(), dC = await dialIn(DP, 'devD', C, 'copy-C');
    said.length = 0;
    const D2 = wsPair(), dD = await dialIn(DP, 'devD', D2, 'copy-D');
    await tick();
    ok(dC.r === true && dD.r === null && gateOf(said.some((t) => /duplicate-device/.test(t))) && gateOf([A, B, C, D2].every((x) => x.closed() === 0)) && DP.agentdDials.get('devD') === A.stream, `at the cap (${DP.SPARES_MAX} copies beside the seat) a further refused copy is turned away BY NAME at admission — no copy is closed to make room, so none dials again`, { C: dC.r, D: dD.r, closed: [A, B, C, D2].map((x) => x.closed()) });
    said.length = 0;
    const G0 = wsPair(goodAck2), dG0 = await dialIn(DP, 'devD', G0, 'copy-G');
    ok(dG0.r === null && gateOf(said.some((t) => /asked again within a minute/.test(t))) && rowOf('devD').dup.from !== 'copy-G', 'a HEALTHY copy arriving inside the same interval at the cap is told to WAIT («asked again within a minute»), and the row does not call it a copy', { r: dG0.r, dup: rowOf('devD').dup });
    const realNow2 = Date.now;
    Date.now = () => realNow2() + DP.AUTH_FAIL_REHELLO_MS + 1;
    let G, dG;
    try { G = wsPair(goodAck2); dG = await dialIn(DP, 'devD', G); await tick(); } finally { Date.now = realNow2; }
    ok(dG.r === true && !dG.e && DP.agentdDials.get('devD') === G.stream && verdictOf([A, B, C].every((x) => x.closed() === 1)), 'its next dial after the interval is greeted, PASSES and takes the seat — the refused seat AND the copies beside it are closed (they dial again, meet a seat that answers, and are told duplicate-device)', { e: dG.e && dG.e.message, closed: [A, B, C].map((x) => x.closed()) });
    said.length = 0;
    const R2 = wsPair(), dR = await dialIn(DP, 'devD', R2);
    ok(dR.r === null && gateOf(said.some((t) => /duplicate-device/.test(t))) && DP.agentdDials.get('devD') === G.stream, 'a refused copy dialing in while the healthy one holds the seat and answers is turned away by name (duplicate-device)', dR);
    for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } } DP.agentdDialDevices.clear();
    {
      // THE SEAT'S COPY GOES while a refused copy waits beside it: that copy takes the seat with ITS refusal (the row reads what
      // IS dialed in, ops are refused fast by name — no hello), never «offline» while a copy is dialed in
      H.setDialToken('devS', '5e'.repeat(32));
      const S1 = wsPair(); await seatIn(DP, 'devS', S1);
      const S2 = wsPair(), s2Boot = hex16(); await dialIn(DP, 'devS', S2, 'copy-S2', s2Boot);
      S1.stream.destroy(); await tick();
      const h0 = gHellos; let eS = null; try { await DP.deviceForDial('devS'); } catch (e) { eS = e; }
      ok(DP.agentdDials.get('devS') === S2.stream && gateOf(eS) && eS.code === 'hello-ack-shape' && gHellos === h0 && rowOf('devS').state === 'greeting-refused', 'the seat\'s copy closes: the refused copy beside it takes the seat with its own refusal — the row reads greeting-refused and ops are refused at once by name (no hello)', { seat: DP.agentdDials.get('devS') === S2.stream, e: eS && eS.code, hellos: gHellos - h0, state: rowOf('devS').state });
    }
    {
      // TWO NEWCOMERS IN ONE GREETING'S WINDOW (every copy re-dials together after a hub restart): one is admitted on probation,
      // the other is turned away by name — the second can never close the first, nor the copy held back behind it
      H.setDialToken('devR', '7c'.repeat(32));
      const Q = wsPair(); DP.adoptDialStream('devR', Q.stream); DP.noteDialEvent('devR', 'accepted', { boot: hex16(), at: Date.now() - 1 });
      const pend = DP.deviceForDial('devR').catch(() => { });
      const [rX, rY] = await Promise.all([DP.admitDial('devR', { boot: hex16() }, sock()), DP.admitDial('devR', { boot: hex16() }, sock())]);
      await pend;
      ok([rX, rY].filter((r) => r === true).length === 1 && gateOf([rX, rY].includes(null)) && Q.closed() === 0, 'two newcomers in one greeting\'s window (refused): ONE is admitted on probation, the other is turned away by name, nothing is closed', { rX, rY });
    }
    {
      // A GREETING THAT NEVER DECIDES (a locked vault): after PROBATION_MAX the probation ends at the next dial-in — the copy held
      // back takes its seat back, nothing is closed, and the next newcomer is judged against it
      H.setDialToken('devP', '3d'.repeat(32));
      const P1 = wsPair(); await seatIn(DP, 'devP', P1);
      const admitP = await DP.admitDial('devP', { boot: hex16() }, sock());
      const P2b = wsPair(); DP.adoptDialStream('devP', P2b.stream); // its greeting never runs
      const realNow3 = Date.now; let rP;
      Date.now = () => realNow3() + 31 * 1000;
      try { rP = await DP.admitDial('devP', { boot: hex16() }, sock()); } finally { Date.now = realNow3; }
      await tick();
      ok(admitP === true && DP.agentdDials.get('devP') === P1.stream && rP === true && P1.closed() === 0 && P2b.closed() === 1, 'a probation whose greeting never decides ends after 30 s: the refused copy takes its seat back, the stalled copy is CLOSED (never kept unasked, never remembered: its re-dial is greeted afresh), and the next copy is greeted', { admitP, rP, seat: DP.agentdDials.get('devP') === P1.stream, closedP2: P2b.closed() });
    }
    {
      // A LOCKED VAULT IS A WAIT: no greeting can be judged, so no probation is started (it could never decide); the newcomer
      // is told to wait, by name, and the row does not call it a copy
      let locked = false;
      const DPV = DPM.create({ ...dpOpts, agentdHostToken: () => { if (locked) throw Object.assign(new Error('the vault is locked'), { code: 'vault_locked' }); return 'vsht_ok'; } });
      H.setDialToken('devL', '1f'.repeat(32));
      const L1 = wsPair(); await seatIn(DPV, 'devL', L1);
      locked = true; said.length = 0;
      const rL = await DPV.admitDial('devL', { boot: hex16(), from: 'copy-L2' }, sock());
      ok(rL === null && gateOf(said.some((t) => /asked again within a minute/.test(t))) && DPV.agentdDials.get('devL') === L1.stream && !(rowOf('devL').dup && rowOf('devL').dup.from === 'copy-L2'), 'a newcomer over a refused seat while the vault is locked is told to WAIT — no probation that could never decide, nothing closed, not called a copy', { rL });
      for (const d of DPV.agentdDialDevices.values()) { try { d.stop(); } catch { } }
    }
    // a newcomer arriving while the incumbent's FIRST greeting is in flight, and refused: admitted on probation, nothing closed
    H.setDialToken('devH', 'ab'.repeat(32));
    const Q = wsPair(); DP.adoptDialStream('devH', Q.stream);
    const pending = DP.deviceForDial('devH').catch(() => { });
    const rH = await DP.admitDial('devH', { boot: 'copy-H' }, sock());
    await pending;
    ok(rH === true && Q.closed() === 0, 'a newcomer arriving while the incumbent\'s first greeting is in flight (and refused) is admitted on probation — the refusal it joined is judged, nothing is closed by it', rH);
    // THE STORM, on a simulated clock: refused copies of one pairing, each a daemon with its OWN boot kept across its dials; a
    // closed copy dials again 1 s later (agentd.js resets its back-off when a link opens), a turned-away one backs off
    // 2 / 5 / 15 / 30 s. `rotate` = a copy that states a new boot at every dial. `healthyAt` = a healthy copy's first dial (s).
    const storm = async (DPx, id, { minutes = 10, copies = ['b', 'c', 'd', 'e'], rotate = [], healthyAt = null } = {}) => {
      H.setDialToken(id, '9a'.repeat(32));
      const realNow = Date.now; let now = realNow(); const t0 = now;
      Date.now = () => now;
      try {
        const S = wsPair(); await seatIn(DPx, id, S);
        const cs = copies.map((n) => ({ n, boot: hex16(), at: now, back: 0, pair: null, good: false }));
        if (healthyAt != null) cs.push({ n: 'healthy', boot: hex16(), at: t0 + healthyAt * 1000, at0: t0 + healthyAt * 1000, back: 0, pair: null, good: true });
        let admitted = 0, closes = 0, turned = 0, dials = 0, healthyIn = null;
        const LADDER = [2, 5, 15, 30];
        while (now - t0 < minutes * 60000 && dials < 2000) {
          for (const c of cs) {
            if (c.pair || c.at > now) continue;
            dials++;
            const X = wsPair(c.good ? goodAck2 : undefined);
            const d = await dialIn(DPx, id, X, 'copy-' + c.n, rotate.includes(c.n) ? hex16() : c.boot);
            if (d.r !== true) { turned++; c.at = now + 1000 * LADDER[Math.min(c.back++, LADDER.length - 1)]; continue; }
            admitted++; c.pair = X; c.back = 0;
            if (c.good && !d.e && DPx.agentdDials.get(id) === X.stream && healthyIn == null) healthyIn = Math.round((now - c.at0) / 1000);
          }
          await tick();
          for (const c of cs) if (c.pair && c.pair.closed() > 0) { closes++; c.pair = null; c.at = now + 1000; }
          now += 1000;
        }
        for (const d of DPx.agentdDialDevices.values()) { try { d.stop(); } catch { } }
        return { dials, admitted, closes, turned, healthyIn };
      } finally { Date.now = realNow; }
    };
    const st = await storm(DP, 'devT', { minutes: 30 });
    ok(st.closes <= 2 && st.admitted >= 2 && st.admitted <= 4, `THE STORM ENDS: five refused copies over THIRTY simulated minutes — ${st.admitted} greeted on probation, ${st.closes} closed at the cap (each once, then known), ${st.turned} turned away by name; ${st.dials} dials in all`, st);
    const sr = await storm(DP, 'devT2', { copies: ['b', 'c', 'x'], rotate: ['x'] });
    ok(sr.closes <= 12, `a copy that states a NEW boot at every dial is greeted at most once per interval at the cap: ${sr.closes} closes in ten simulated minutes (${sr.dials} dials)`, sr);
    const sh = await storm(DP, 'devT3', { healthyAt: 180 });
    ok(sh.healthyIn != null && sh.healthyIn <= 95, `a HEALTHY machine arriving at minute 3 among five refused copies takes the seat ${sh.healthyIn} s after its first dial (at most one interval and one back-off)`, sh);
    const DSRC2 = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
    const PROB = '  if ((af && af.stream === was) || (rf && rf.stream === was)) {\n';
    const FENCED = '    else if (fenced()) { alive = false; given = facts || {}; } // a refused copy: the newcomer is greeted on probation\n';
    const HELD = '  const held = () => pending() || (liveSpares(deviceId) >= SPARES_MAX && Date.now() - (lastProbationAt.get(deviceId) || 0) < AUTH_FAIL_REHELLO_MS);\n';
    const ROOM = '    else if (liveSpares(deviceId) < SPARES_MAX) spare(deviceId, pb.stream, own);\n';
    const PUSH = '  list.push(stream); // never one closed to make room: admitDial keeps the count (a close is a re-dial)\n';
    const RULED = "  let v = ruledAtStart ? { action: 'probe', why: 'refused-seat' } : judge(null);\n";
    const RESEAT = '  if (streamBoot.has(stream)) dialBootOf.set(deviceId, streamBoot.get(stream)); // the seat\'s own boot, never the last newcomer\'s\n';
    const MEMO = '    if (ruled && refusedBoot()) {';
    ok(verdictOf([PROB, FENCED, HELD, ROOM, PUSH, RULED, RESEAT, MEMO].every((a) => DSRC2.split(a).length === 2)), 'control: the probation, the cap, the rules over a refused seat, the seat\'s own boot and the refused boots (the anchors, each once)');
    const MD = mutantCopies('dial-dup-refused', REPO);
    const twoRefused = async (DPx, id) => { H.setDialToken(id, 'fe'.repeat(32)); const A2 = wsPair(); await seatIn(DPx, id, A2); const B2 = wsPair(); await dialIn(DPx, id, B2); return { A2, B2 }; };
    const closing = await twoRefused(MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, PROB, '  if (false) {\n', "src/server/dial-pairing.js"), 'replace-closes').create(dpOpts), 'devE');
    ok(closing.A2.closed() === 1, 'RED CONTROL: a copy that closes the refused copy it replaces (no probation) closes the first copy at the second\'s arrival — its daemon dials again: the loop\'s first turn', closing.A2.closed());
    const DPL = MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, FENCED, '    else if (fenced()) { alive = true; }\n', "src/server/dial-pairing.js"), 'refused-holds').create(dpOpts);
    const lk = await twoRefused(DPL, 'devF');
    const G2 = wsPair(goodAck2), dG2 = await dialIn(DPL, 'devF', G2);
    ok(dG2.r === null && DPL.agentdDials.get('devF') === lk.A2.stream, 'RED CONTROL: a copy where a refused copy keeps its seat against every newcomer turns the HEALTHY device away — locked out behind the refused one', dG2);
    for (const d of DPL.agentdDialDevices.values()) { try { d.stop(); } catch { } }
    const ROOMX = ROOM + '    else { try { pb.stream.destroy(); } catch { } if (pb.facts) {';
    const oldSrc = editAnchor(editAnchor(editAnchor(DSRC2, HELD, '  const held = () => pending();\n', "src/server/dial-pairing.js"), ROOMX, '    else { spare(deviceId, pb.stream, own); }\n    if (false) { try { pb.stream.destroy(); } catch { } if (pb.facts) {', "src/server/dial-pairing.js"), PUSH, '  list.push(stream); while (list.length > SPARES_MAX) { const old = list.shift(); try { old.destroy(); } catch { } }\n', "src/server/dial-pairing.js");
    ok(DSRC2.split(ROOMX).length === 2 && gateOf(oldSrc.includes('const held = () => pending();')) && gateOf(oldSrc.includes('else { spare(deviceId, pb.stream, own); }')) && verdictOf(oldSrc.includes('while (list.length > SPARES_MAX)')), 'control: round 3\'s form is rebuilt whole (each of its three patches applied — a patch that misses would test nothing)');
    const oldForm = MD.load('src/server/dial-pairing.js', oldSrc, 'spare-closes-oldest').create(dpOpts);
    const so = await storm(oldForm, 'devU');
    ok(so.closes >= 50, `RED CONTROL: round 3's form (the oldest spare closed to make room) never ends the storm — ${so.closes} closes in ten simulated minutes`, so);
    const round4 = MD.load('src/server/dial-pairing.js', editAnchor(editAnchor(DSRC2, RULED, '  let v = judge(null);\n', "src/server/dial-pairing.js"), RESEAT, '', "src/server/dial-pairing.js"), 'same-boot-skips').create(dpOpts);
    const s4 = await storm(round4, 'devV');
    ok(s4.closes >= 50, `RED CONTROL: round 4's form (a copy closed at the cap dials again with its own boot, is taken for «the same daemon» and skips the rules) loops — ${s4.closes} closes in ten simulated minutes`, s4);
    const noMemo = MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, MEMO, '    if (false) {', "src/server/dial-pairing.js"), 'no-boot-memory').create(dpOpts);
    const sm = await storm(noMemo, 'devW', { minutes: 30 });
    ok(sm.closes >= 15, `RED CONTROL: without the known copies, the copies beyond the cap are greeted and closed once per interval for ever — ${sm.closes} closes in thirty simulated minutes (the leg above: ${st.closes})`, sm);
    const noIv = MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, HELD, '  const held = () => pending();\n', "src/server/dial-pairing.js"), 'no-interval').create(dpOpts);
    const sn = await storm(noIv, 'devX', { copies: ['b', 'c', 'x'], rotate: ['x'] });
    ok(sn.closes >= 50, `RED CONTROL: without the once-per-interval rule a copy stating a new boot at every dial is greeted and closed at every dial — ${sn.closes} closes in ten simulated minutes`, sn);
    const RESERVE = '  const pending = () => probation.has(deviceId) || admitted.has(deviceId);\n';
    const STALE = '  { const pb = probation.get(deviceId); if (pb && Date.now() - pb.at > PROBATION_MAX_MS) settleProbation(deviceId, false); }';
    const UNASKED = '    if (!refused) { try { pb.stream.destroy(); } catch { } }';
    ok(verdictOf([RESERVE, STALE, UNASKED].every((a) => DSRC2.split(a).length === 2)), 'control: the reservation, the probation\'s 30 s end and the closing of a copy never greeted to the end (the anchors, each once)');
    {
      const DPN = MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, RESERVE, '  const pending = () => probation.has(deviceId);\n', "src/server/dial-pairing.js"), 'no-reservation').create(dpOpts);
      H.setDialToken('devN', '6b'.repeat(32));
      const N1 = wsPair(); DPN.adoptDialStream('devN', N1.stream); DPN.noteDialEvent('devN', 'accepted', { boot: hex16(), at: Date.now() - 1 });
      const pendN = DPN.deviceForDial('devN').catch(() => { });
      const two = await Promise.all([DPN.admitDial('devN', { boot: hex16() }, sock()), DPN.admitDial('devN', { boot: hex16() }, sock())]);
      await pendN;
      ok(verdictOf(two.every((r) => r === true)), 'RED CONTROL: without the reservation both newcomers in one greeting\'s window are admitted (the second then replaces the first and closes it)', two);
      for (const d of DPN.agentdDialDevices.values()) { try { d.stop(); } catch { } }
    }
    const RELEASE = "      try { socket.once?.('close', () => { if (admitted.get(deviceId) === r) admitted.delete(deviceId); }); } catch { }\n";
    ok(DSRC2.split(RELEASE).length === 2, 'control: a reservation ends with its socket (the anchor)');
    const upgradeDies = async (DPx, id) => { // the websocket upgrade never calls back: its socket closes, and the reservation goes with it
      const { EventEmitter } = require('node:events');
      H.setDialToken(id, '4a'.repeat(32)); const Y1 = wsPair(); await seatIn(DPx, id, Y1);
      const so = Object.assign(new EventEmitter(), { destroyed: false, end() { }, destroy() { this.destroyed = true; } });
      const r1 = await DPx.admitDial(id, { boot: hex16() }, so); so.destroyed = true; so.emit('close');
      const r2 = await DPx.admitDial(id, { boot: hex16() }, sock());
      return { r1, r2 };
    };
    const ud = await upgradeDies(DP, 'devU2');
    ok(ud.r1 === true && ud.r2 === true, 'an upgrade that never calls back frees its reservation at its socket\'s close: the next copy is greeted at once', ud);
    const udM = await upgradeDies(MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, RELEASE, '', "src/server/dial-pairing.js"), 'no-release').create(dpOpts), 'devU3');
    ok(udM.r1 === true && udM.r2 === null, 'RED CONTROL: without the release a dead upgrade holds the reservation, and every copy is told to wait (for 10 s each time, renewed by a holder that knocks with broken upgrades)', udM);
    // A TOKEN THAT CANNOT BE READ for another reason than a locked vault (a damaged entry, a failed mint) is a wait too
    const UNREADABLE = '  const tokenUnreadable = () => { try { agentdHostToken(\'dial-\' + deviceId); return false; } catch { return true; } };';
    const NOBOOT = "(k.startsWith('b:') ? REFUSED_BOOT_MS : AUTH_FAIL_REHELLO_MS)";
    const CLEARS = 'function lockOutDialHolder(deviceId) {\n  refusedBoots.delete(deviceId); admitted.delete(deviceId);';
    ok(verdictOf([UNREADABLE, NOBOOT, CLEARS].every((a) => DSRC2.split(a).length === 2)), 'control: any unreadable token waits, a key with no boot is known for one interval, a rotation forgets the known copies and the reservation BEFORE it asks whether a link is up (the anchors, each once — the last is pinned by its line only)');
    const eio = async (DPx, id) => { H.setDialToken(id, '8c'.repeat(32)); const E1 = wsPair(); await seatIn(DPx, id, E1); bad = true; said.length = 0; try { return await DPx.admitDial(id, { boot: hex16() }, sock()); } finally { bad = false; } };
    let bad = false;
    const eioOpts = { ...dpOpts, agentdHostToken: () => { if (bad) throw Object.assign(new Error('the link token entry is damaged'), { code: 'EIO' }); return 'vsht_ok'; } };
    const rE = await eio(DPM.create(eioOpts), 'devE2');
    ok(rE === null && verdictOf(said.some((t) => /asked again within a minute/.test(t))), 'a token that cannot be read for ANOTHER reason than a locked vault: the newcomer is told to wait too (no probation that could never decide)', rE);
    const rEM = await eio(MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, UNREADABLE, "  const tokenUnreadable = () => { try { agentdHostToken('dial-' + deviceId); return false; } catch (e) { return !!(e && e.code === 'vault_locked'); } };", "src/server/dial-pairing.js"), 'locked-only').create(eioOpts), 'devE3');
    ok(rEM === true, 'RED CONTROL: a copy that waits only for a locked vault starts a probation that could never decide', rEM);
    // A COPY WITH NO BOOT (an agent before the boot header): closed at the cap, it is known by address + version for ONE interval
    // and told to wait; after the interval it is greeted again (a healthy machine behind the same relay is never held longer)
    const noBoot = async (DPx, id) => {
      H.setDialToken(id, '9d'.repeat(32));
      const rn = Date.now; let now = rn(); Date.now = () => now;
      try {
        const Z0 = wsPair(); await seatIn(DPx, id, Z0);
        await dialIn(DPx, id, wsPair(), 'copy-1'); await dialIn(DPx, id, wsPair(), 'copy-2'); // the two spares
        now += DPx.AUTH_FAIL_REHELLO_MS + 1000;
        const Z = wsPair(); const zf = { from: 'relay', daemon: '0.9.0' };
        const r0 = await DPx.admitDial(id, zf, sock()); if (r0 === true) { DPx.adoptDialStream(id, Z.stream); DPx.noteDialEvent(id, 'accepted', { ...zf, at: now - 1 }); try { await DPx.deviceForDial(id); } catch { } }
        await tick();
        now += 1000; said.length = 0;
        const r1 = await DPx.admitDial(id, zf, sock()); const waited = said.some((t) => /asked again within a minute/.test(t));
        now += DPx.AUTH_FAIL_REHELLO_MS + 1000;
        const r2 = await DPx.admitDial(id, zf, sock());
        return { r0, closed: Z.closed(), r1, waited, r2 };
      } finally { Date.now = rn; for (const d of DPx.agentdDialDevices.values()) { try { d.stop(); } catch { } } }
    };
    const nb = await noBoot(DP, 'devZ');
    ok(nb.r0 === true && nb.closed === 1 && nb.r1 === null && gateOf(nb.waited) && nb.r2 === true, 'a copy stating NO boot, refused and closed at the cap: inside the interval it is told to WAIT (never named a copy: a healthy machine behind the same relay may share its address and version); after the interval it is greeted again', nb);
    const nbM = await noBoot(MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, NOBOOT, 'REFUSED_BOOT_MS', "src/server/dial-pairing.js"), 'noboot-long').create(dpOpts), 'devZ2');
    ok(nbM.r2 === null, 'RED CONTROL: a copy that keeps a key with no boot as long as a boot (24 h) still turns that address and version away after the interval — a healthy bootless machine behind the same relay would be held for a day', nbM);
    // ── unit 4's cure 2, its verdict's shoulds ──
    const SAME = '  if (backOpen && newOpen && refused && nb && nb === hb) { try { pb.heldBack.destroy(); } catch { } reseat(deviceId, pb.stream, own); return; }\n';
    const TWIN = '  const twin = refused && nb ? (sparesOf.get(deviceId) || []).find((x) => !closedStreams.has(x) && streamBoot.get(x) === nb) : null;\n';
    const UNJ = ' if (alive) { copy = false; unjudged = true; } }';
    const NOFACTS = "if (refused && pb.facts && !twin) noteDialEvent(deviceId, 'duplicate', { ...pb.facts, at: Date.now() });";
    const KEYCAP = 'while (m.size > REFUSED_KEYS_MAX) m.delete(m.keys().next().value); ';
    ok(verdictOf([SAME, TWIN, UNJ, NOFACTS, KEYCAP].every((a) => DSRC2.split(a).length === 2)), 'control: the same daemon\'s re-dial, the rate rule\'s wait, a probation with no facts, the known copies\' count (the anchors, each once)');
    // ONE REFUSED MACHINE THAT SLEEPS AND WAKES (not a copy): its daemon dials again with its own boot while its older stream is
    // half-open — over the SEAT, and over a SPARE. The older stream goes, the live one keeps the place; never a copy, never known
    const sameDaemon = async (DPx, id) => {
      H.setDialToken(id, '5c'.repeat(32));
      const rn = Date.now; let now = rn(); Date.now = () => now;
      try {
        const bootA = hex16(), A3 = wsPair(); await seatIn(DPx, id, A3, bootA);
        const bootB = hex16(), B3 = wsPair(); await dialIn(DPx, id, B3, 'copy-B3', bootB);
        const C3 = wsPair(); await dialIn(DPx, id, C3, 'copy-C3');
        now += DPx.AUTH_FAIL_REHELLO_MS + 1000;
        const A4 = wsPair(), dA = await dialIn(DPx, id, A4, 'laptop', bootA); await tick();
        const seatIsNew = DPx.agentdDials.get(id) === A4.stream;
        now += DPx.AUTH_FAIL_REHELLO_MS + 1000;
        const B4 = wsPair(), dB = await dialIn(DPx, id, B4, 'copy-B3', bootB); await tick();
        const rs = rowOf(id);
        return { dA: dA.r, closedA3: A3.closed(), seatIsNew, A4open: A4.closed() === 0, dB: dB.r, closedB3: B3.closed(), B4open: B4.closed() === 0, C3open: C3.closed() === 0, known: DPx.knownCount(id), dupFrom: rs.dup && rs.dup.from, state: rs.state };
      } finally { Date.now = rn; for (const d of DPx.agentdDialDevices.values()) { try { d.stop(); } catch { } } }
    };
    const sd = await sameDaemon(DP, 'devSD');
    ok(sd.dA === true && sd.closedA3 === 1 && gateOf(sd.seatIsNew) && gateOf(sd.A4open) && sd.dB === true && sd.closedB3 === 1 && gateOf(sd.B4open) && gateOf(sd.C3open) && sd.known === 0 && sd.dupFrom === 'copy-C3' && sd.state === 'greeting-refused', 'ONE refused machine that sleeps and wakes, its daemon dialing again with its own boot: over the seat, its older (half-open) stream goes and the live one keeps the seat with its refusal; over a spare, the same in the spare\'s place — never noted as a copy, never known', sd);
    const sdM = await sameDaemon(MD.load('src/server/dial-pairing.js', editAnchor(editAnchor(DSRC2, SAME, '', "src/server/dial-pairing.js"), TWIN, '  const twin = null;\n', "src/server/dial-pairing.js"), 'same-daemon-copy').create(dpOpts), 'devSD2');
    ok(sdM.closedA3 === 0 && sdM.known >= 1 && sdM.dupFrom === 'copy-B3', 'RED CONTROL: a copy that takes the same daemon\'s re-dial for a copy closes the live stream at the cap, remembers the machine\'s own boot (every later dial: «pair this machine under its own name») and notes it as another device', sdM);
    // THE RATE RULE'S REFUSAL IS A WAIT (a probe that cannot judge: the vault locked at a hub start, a daemon restarting twice in a
    // minute): the second dial-in inside the interval is told to wait, and the row does not call the machine its own copy
    const unjudgedLeg = async (mk, id) => {
      let locked = false;
      const DPx = mk({ ...dpOpts, agentdHostToken: () => { if (locked) throw Object.assign(new Error('the vault is locked'), { code: 'vault_locked' }); return 'vsht_ok'; } });
      H.setDialToken(id, '6e'.repeat(32));
      const S = wsPair(); DPx.adoptDialStream(id, S.stream); DPx.noteDialEvent(id, 'accepted', { boot: hex16(), at: Date.now() - 1 });
      locked = true;
      const r1 = await DPx.admitDial(id, { boot: hex16(), from: 'restart-1' }, sock());
      if (r1 === true) { const N1 = wsPair(); DPx.adoptDialStream(id, N1.stream); DPx.noteDialEvent(id, 'accepted', { boot: hex16(), from: 'restart-1', at: Date.now() - 1 }); }
      said.length = 0;
      const r2 = await DPx.admitDial(id, { boot: hex16(), from: 'restart-2' }, sock());
      const rs = rowOf(id);
      for (const d of DPx.agentdDialDevices.values()) { try { d.stop(); } catch { } }
      return { r1, r2, waited: said.some((t) => /asked again within a minute/.test(t)), dup: rs.dup && rs.dup.from };
    };
    const uj = await unjudgedLeg((o) => DPM.create(o), 'devUJ');
    ok(uj.r1 === true && uj.r2 === null && gateOf(uj.waited) && uj.dup !== 'restart-2', 'a probe that cannot judge replaces once per interval; the second dial-in inside it is told to WAIT, and the row does not call the machine its own copy', uj);
    const ujM = await unjudgedLeg((o) => MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, UNJ, ' }', "src/server/dial-pairing.js"), 'unjudged-copy').create(o), 'devUJ2');
    ok(ujM.r2 === null && !ujM.waited && ujM.dup === 'restart-2', 'RED CONTROL: a copy whose rate rule answers «duplicate» tells the restarting machine it is another device holding a copy, on its own row', ujM);
    // A PROBATION WITH NO DIAL FACTS (adopted without admission — a seat refused between admission and the upgrade): refused, it
    // writes no duplicate note (the row would read «from »)
    const noFacts = async (DPx, id) => { H.setDialToken(id, '7d'.repeat(32)); const F1 = wsPair(); await seatIn(DPx, id, F1); const F2 = wsPair(); DPx.adoptDialStream(id, F2.stream); DPx.noteDialEvent(id, 'accepted', { boot: hex16(), at: Date.now() - 1 }); try { await DPx.deviceForDial(id); } catch { } const rs = rowOf(id); return { dup: rs.dup ? rs.dup.from : null, seat: DPx.agentdDials.get(id) === F1.stream }; };
    const nf = await noFacts(DP, 'devNF');
    ok(nf.dup === null && verdictOf(nf.seat), 'a probation with no dial facts, refused: the seat goes back and the row gets no «from »-less duplicate note', nf);
    const nfM = await noFacts(MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, NOFACTS, "if (refused && !twin) noteDialEvent(deviceId, 'duplicate', { ...pb.facts, at: Date.now() });", "src/server/dial-pairing.js"), 'nofacts-note').create(dpOpts), 'devNF2');
    ok(nfM.dup === '', 'RED CONTROL: without the guard the row reads «Another device … (from )»', nfM);
    // THE KNOWN COPIES HAVE A COUNT: a holder stating a new boot at every dial adds one per interval; the oldest goes past 16
    const kc = await storm(DP, 'devKC', { minutes: 30, copies: ['b', 'c', 'x'], rotate: ['x'] });
    const kcN = DP.knownCount('devKC');
    ok(kc.closes > 16 && kcN === 16, `the known copies are capped: ${kc.closes} rotating boots closed at the cap in thirty simulated minutes, ${kcN} kept (the oldest dropped first)`, { closes: kc.closes, known: kcN });
    const DPKC = MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, KEYCAP, '', "src/server/dial-pairing.js"), 'keys-uncapped').create(dpOpts);
    const kcM = await storm(DPKC, 'devKC2', { minutes: 30, copies: ['b', 'c', 'x'], rotate: ['x'] });
    ok(DPKC.knownCount('devKC2') === kcM.closes && kcM.closes > 16, `RED CONTROL: without the count the map keeps every one (${DPKC.knownCount('devKC2')})`, { known: DPKC.knownCount('devKC2'), closes: kcM.closes });
    const stall = async (DPx, id) => { H.setDialToken(id, '2e'.repeat(32)); const X1 = wsPair(); await seatIn(DPx, id, X1); await DPx.admitDial(id, { boot: hex16() }, sock()); const X2 = wsPair(); DPx.adoptDialStream(id, X2.stream); const rn = Date.now; let r; Date.now = () => rn() + 31 * 1000; try { r = await DPx.admitDial(id, { boot: hex16() }, sock()); } finally { Date.now = rn; } await tick(); return { r, X2 }; };
    const noEnd = await stall(MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, STALE, '', "src/server/dial-pairing.js"), 'no-probation-end').create(dpOpts), 'devO');
    ok(noEnd.r === null, 'RED CONTROL: without the 30 s end a probation that never decides turns every later copy away — the healthy one too, for ever', noEnd.r);
    const kept = await stall(MD.load('src/server/dial-pairing.js', editAnchor(DSRC2, UNASKED, '    if (false) { }', "src/server/dial-pairing.js"), 'unasked-kept').create(dpOpts), 'devK');
    ok(kept.r === true && kept.X2.closed() === 0, 'RED CONTROL: a copy that keeps a never-greeted probationer as a spare leaves it open and unasked — nothing ever greets a spare, so a healthy machine stalled by a locked vault would wait beside a refused seat for as long as that link lives', kept.X2.closed());
    for (const x of copiesCensus(MD.files, MD.dir, REPO, { minCopies: 16, label: 'mutant-copy (duplicate): ' })) ok(verdictOf(x.pass), x.name, x.detail);
  }
  // RED CONTROLS, each over the same adapter
  const CSRC = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const KEEP = "              if (this._transport.kind === 'stream') { keepStream = true; mux.onControl = () => {}; }";
  const SWAP = "      { const was = this._transport.kind === 'stream' ? keptMuxOf.get(sock) : null; if (was) { keptMuxOf.delete(sock); was.detach(); } }\n";
  ok(gateOf(CSRC.includes(KEEP)) && verdictOf(CSRC.includes(SWAP)), 'control: the refused greeting keeps its Mux, and the next handshake swaps it out, in client.js (the anchors)');
  const DEAD = "              if (this._transport.kind === 'stream') keptMuxOf.set(sock, mux); // unit 4's cure r3: a dead link's Mux leaves the stream at the next handshake on it\n";
  ok(verdictOf(CSRC.includes(DEAD)), 'control: a dead link\'s Mux is recorded for the swap (the anchor)');
  const M = mutantCopies('dial-greeting-kept', REPO);
  const dmOver = (Cl, st) => new Cl.DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_ok', getStream: () => st } });
  {
    const Det = M.load('src/agentd/client.js', editAnchor(CSRC, KEEP, "              if (this._transport.kind === 'stream') { keepStream = true; mux.detach(); }", "src/agentd/client.js", 'first'), 'detach-at-once'); // stale-pins: kept — the RED copy re-creates the cure's first form on purpose
    const Q = wsPair(); try { await dmOver(Det, Q.stream).connect(); } catch { }
    ok(!(await Q.devMux.ping(300)), 'RED CONTROL: a copy that lets go of the Mux at once (the first form) answers no PING — the device\'s heartbeat would end its link ~40 s later');
  }
  {
    const NoSwap = M.load('src/agentd/client.js', editAnchor(CSRC, SWAP, '', "src/agentd/client.js"), 'no-swap');
    const Q = wsPair(), R = wsPair();
    for (let i = 0; i < N; i++) { try { await dmOver(NoSwap, Q.stream).connect(); } catch { } try { await dmOver(require('../src/agentd/client.js'), R.stream).connect(); } catch { } }
    ok(counts(Q.stream) === `${N}/${N}/${N}` && counts(R.stream) === '1/1/1', `RED CONTROL: ${N} handshakes on one stream pile ${counts(Q.stream)} listeners without the swap; the real client keeps ${counts(R.stream)}`);
  }
  {
    const DSRC = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
    const FENCE = "  if (rf && rf.stream === curStream && Date.now() - rf.at < AUTH_FAIL_REHELLO_MS) throw Object.assign(new Error(rf.message), { code: rf.code, stage: 'connect' });\n";
    ok(verdictOf(DSRC.includes(FENCE)), 'control: deviceForDial\'s refused-stream fence (the anchor)');
    const DPN = M.load('src/server/dial-pairing.js', editAnchor(DSRC, FENCE, '', "src/server/dial-pairing.js"), 'no-fence').create(dpOpts);
    const Q = wsPair(); DPN.agentdDials.set('devG', Q.stream);
    const h0 = gHellos;
    for (let i = 0; i < N; i++) { try { await DPN.deviceForDial('devG'); } catch { } }
    ok(gHellos - h0 === N, `RED CONTROL: deviceForDial without the fence says hello on every op (${gHellos - h0} hellos for ${N} ops) — the leg above says ONE`);
    await DPN.unpairDialDevice('devG');
  }
  {
    const NoDead = M.load('src/agentd/client.js', editAnchor(CSRC, DEAD, '', "src/agentd/client.js"), 'no-dead-swap');
    const R = wsPair(() => ({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.0.0', platform: 'linux', capabilities: [] }));
    const dm = new NoDead.DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_ok', getStream: () => R.stream } });
    await dm.connect(); dm._conn.mux._die('heartbeat: 3 missed pongs'); await dm.connect();
    ok(R.stream.listenerCount('data') === 2, `RED CONTROL: a copy that does not record a dead link's Mux leaves TWO readers on the stream after it reconnects (${R.stream.listenerCount('data')})`);
    try { dm.stop(); } catch { }
  }
  for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 4, label: 'mutant-copy (greeting): ' })) ok(verdictOf(x.pass), x.name, x.detail);
}

// WIRING: server.js runs the hello on every dial-in through deviceForDial (where the refused stream is remembered)
ok(verdictOf(/deviceForDial\(deviceId\)\.catch\(\(\) => \{ \}\); \/\/ the mux hello NOW/.test(fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'))), 'WIRING: server.js hands every dial-in to deviceForDial (the refused-stream memo lives there)');
ok(verdictOf(/authFailedStreams\.set\(deviceId, \{ stream: curStream, at: Date\.now\(\) \}\)/.test(fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8'))), 'WIRING: deviceForDial remembers the refused stream');

console.log('— THE ORDER THE HUB RECORDED (list line 144\'s cure): between a connect and a refusal of the same machine the row reads the order recorded, never the luck of the clock — a tie and a clock that stepped back, both directions, for each kind of refusal —');
{
  const DFo = require('../src/dial-facts.js');
  const HSRC = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
  // THE PARENT'S CODE (7a260a506), in a copy: noteDial's connect and its two refusals stamped by the clock alone (noteDeviceKey's
  // dial road already stamped `max(now, lastConnectAt + 1)` there — so its key kind is red only in (d), the other direction)
  let rel = anchored(HSRC, "      d.lastConnectAt = Math.max(at, Number(d.lastAuthFail && d.lastAuthFail.at) || 0, Number(d.lastGreetingRefused && d.lastGreetingRefused.at) || 0, Number(kr0 && kr0.at) || 0, (Number(d.lastConnectAt) || 0) + 1); if (!d.firstConnectAt) d.firstConnectAt = at;", "      d.lastConnectAt = at; if (!d.firstConnectAt) d.firstConnectAt = at;", 'order-connect');   // stale-pins: kept — the RED copy rebuilds the release's stamping on purpose
  rel = anchored(rel, "      d.lastAuthFail = { at: Math.max(at, (Number(d.lastConnectAt) || 0) + 1) };", "      d.lastAuthFail = { at };", 'order-authfail');   // stale-pins: kept — the RED copy rebuilds the release's stamping on purpose
  rel = anchored(rel, "      d.lastGreetingRefused = { at: Math.max(at, (Number(d.lastConnectAt) || 0) + 1) };", "      d.lastGreetingRefused = { at };", 'order-greeting');   // stale-pins: kept — the RED copy rebuilds the release's stamping on purpose
  const MO = mutantCopies('dialorder', REPO);
  const REL = MO.load('src/hosts.js', rel, 'order-parent');
  // the cure WITHOUT the connect's own order (the reader's M1): a connect stamped only above the refusals
  const NOSEQ = MO.load('src/hosts.js', anchored(HSRC, ", (Number(d.lastConnectAt) || 0) + 1); if (!d.firstConnectAt)", "); if (!d.firstConnectAt)", 'order-noseq'), 'order-noseq');
  const CUR = require('../src/hosts.js');
  const T = 1795150000000;
  let n = 0;
  // the noting functions themselves, with a clock handed to them: noteDial takes its stamp from facts.at, noteDeviceKey from Date.now
  const scene = (Mod, kind, first, dt) => {
    const dir = path.join(tmp, `order-${++n}`); fs.mkdirSync(dir, { recursive: true });
    const hm = new Mod.HostManager({ dataDir: dir }); hm.dialOnline = () => true;
    hm.setDialToken('devO', 'ef'.repeat(32), { name: 'devO' });
    const id = hm.list().find((x) => x.deviceId === 'devO').id;
    const realNow = Date.now;
    const refuse = (t) => { if (kind === 'key') { Date.now = () => t; try { hm.noteDeviceKey(id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:order', road: 'dial' }); } finally { Date.now = realNow; } } else hm.noteDial('devO', kind, { at: t }); };
    const connect = (t) => hm.noteDial('devO', 'accepted', { at: t, from: '127.0.0.1' });
    if (first === 'connect') { connect(T); refuse(T + dt); } else { refuse(T); connect(T + dt); }
    return DFo.dialRowState({ ...hm.list().find((x) => x.deviceId === 'devO'), online: true }).state;
  };
  const KINDS = [['greetingRefused', 'greeting-refused'], ['authFail', 'auth-fail'], ['key', 'key-refused']];
  const LAWS = [['a', 'connect', 0, true], ['b', 'refusal', 0, false], ['c', 'connect', -5, true], ['d', 'refusal', -5, false]];   // [leg, recorded first, the clock's step, reads refused]
  const read = (Mod) => KINDS.flatMap(([k, st]) => LAWS.map(([leg, first, dt, refused]) => { const got = scene(Mod, k, first, dt); return { kind: k, leg, want: refused ? st : 'connected', got }; }));
  const cur = read(CUR), old = read(REL);
  ok(verdictOf(cur.every((r) => r.got === r.want)), 'THE ORDER RECORDED, for each kind (greeting refusal, sign-in failure, the dial road\'s device-key refusal): (a) a connect then a refusal in the SAME millisecond reads refused; (b) a refusal then a connect in the same millisecond reads connected; (c) a connect, the clock steps back 5 ms, a refusal: refused; (d) a refusal, the clock steps back 5 ms, a connect: connected', cur.filter((r) => r.got !== r.want));
  const redOf = (leg) => old.filter((r) => r.leg === leg && r.got !== r.want).map((r) => r.kind).join();
  ok(redOf('a') === 'greetingRefused,authFail' && redOf('c') === 'greetingRefused,authFail' && redOf('d') === 'greetingRefused,authFail,key' && redOf('b') === '',
    'CONTROL (the parent\'s code in a copy): (a) and (c) RED for the greeting refusal and the sign-in failure — the row read «connected» over a refusal recorded after the connect (the dial road\'s key refusal was already ordered there); (d) RED for all three — «refused» over a connect recorded after the refusal; (b) holds there too (the row\'s strict compare)', { a: redOf('a'), b: redOf('b'), c: redOf('c'), d: redOf('d') });
  // the reader's M1: a connect's stamp is the link's identity — two connects with no refusal between them never share one, even
  // while a refusal's stamp stands above a clock that stepped back (connect T, refused T+100, the clock back at T: connect, connect)
  const ids = (Mod) => { const dir = path.join(tmp, `order-${++n}`); fs.mkdirSync(dir, { recursive: true }); const hm = new Mod.HostManager({ dataDir: dir }); hm.dialOnline = () => true; hm.setDialToken('devO', 'ef'.repeat(32), { name: 'devO' });
    const lc = () => hm.list().find((x) => x.deviceId === 'devO').dial.lastConnectAt;
    hm.noteDial('devO', 'accepted', { at: T, from: '127.0.0.1' }); hm.noteDial('devO', 'greetingRefused', { at: T + 100 });
    hm.noteDial('devO', 'accepted', { at: T, from: '127.0.0.1' }); const c1 = lc(); hm.noteDial('devO', 'accepted', { at: T + 1, from: '127.0.0.1' }); const c2 = lc();
    return { c1, c2, row: DFo.dialRowState({ ...hm.list().find((x) => x.deviceId === 'devO'), online: true }).state }; };
  const idCur = ids(CUR), idNo = ids(NOSEQ);
  ok(idCur.c2 > idCur.c1 && idCur.c1 >= T + 100 && idCur.row === 'connected', 'two connects with no refusal between them never share a stamp (the link\'s identity), even while a refusal stamped above the stepped-back clock stands — both read connected', idCur);
  ok(idNo.c2 === idNo.c1 && idNo.c1 >= T + 100, 'CONTROL (the cure without the connect\'s own order, in a copy): the two connects share one stamp — a second device would pass for the first at the keep box (RED)', idNo);
  for (const x of copiesCensus(MO.files, MO.dir, REPO, { minCopies: 1, label: 'mutant-copy (order): ' })) ok(verdictOf(x.pass), x.name, x.detail);
}

srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
