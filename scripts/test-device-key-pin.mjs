#!/usr/bin/env node
// A PAIRED DEVICE PROVES ITS OWN KEY (lane lg-remote-hardening, B-7f0b — design q-042 D3, its first half). Before: the hub
// believed whoever said hello with the right token. Now the device mints an ed25519 identity once (state/identity.pem, 0600,
// temp + rename, never sent, logged or shown) and signs the hub's FRESH nonce in its hello-ack; the hub pins the public half
// on the machine's record at the first proof and from then on refuses another key, a bad signature and an answer with no
// proof at all — by name, on the Machines card (a chip + the Host key… door) and in For you (urgent). A new pairing command
// or the person's «Forget the device key» lets the next proof pin again. Legs: ① the PURE verdict (src/mutual-auth.js) ·
// ② a fake device over the REAL Mux + DeviceManager (learn, keep, a swapped key, no proof, a replayed answer; a dialed stream
// is KEPT on a refusal) · ③ the record's acts (hosts.js) · ④ For you · ⑤ the route · §T the pin that the heavy twin
// test-device-key-pin-real holds the REAL agent's legs (⑥ the agent built from src/agentd/agentd.js as this box's local daemon,
// ⑦'s ④ the agent pinning the hub and ⑤ the attach child — B-7e49, 主开发 r2490: a leg that starts a real child is heavy) ·
// RED copies: a hub without the verdict accepts the swap (the agent's own REDs moved with its legs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { endDaemonsAndWait, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-device-key-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* gone */ } });
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (typeof m !== 'string' || !m) throw new TypeError('ok(cond, name): the name is no string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = { crypto };
const MA = require('../src/mutual-auth.js');
const { DeviceManager } = require('../src/agentd/client.js');
const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');

console.log('— ① PURE: the hub\'s verdict over a device\'s answer —');
{
  const A = MA.generateKeyPair(C), B = MA.generateKeyPair(C);
  const n1 = MA.newNonce(C), n2 = MA.newNonce(C);
  const pA = MA.proofOf(A, n1, C);
  const v = (nonceH, ack, pinned) => MA.hubVerdict({ nonceH, ack, pinned }, C);
  const T = [
    ['the first proof (nothing pinned) ⇒ learn', v(n1, pA, null), (r) => r.ok && r.learn === true],
    ['the pinned key, proved ⇒ ok, nothing to learn', v(n1, pA, A.publicKey), (r) => r.ok && r.learn === false],
    ['ANOTHER key ⇒ device-key-mismatch', v(n1, MA.proofOf(B, n1, C), A.publicKey), (r) => !r.ok && r.code === 'device-key-mismatch'],
    ['a recorded answer replayed to a NEW nonce ⇒ device-signature-bad', v(n2, pA, A.publicKey), (r) => !r.ok && r.code === 'device-signature-bad'],
    ['the pinned key with a forged signature ⇒ device-signature-bad', v(n1, { devPub: A.publicKey, sigD: MA.proofOf(B, n1, C).sigD }, A.publicKey), (r) => !r.ok && r.code === 'device-signature-bad'],
    ['pinned, the answer proves nothing ⇒ device-key-missing (no talking it down to the old greeting)', v(n1, { op: 'hello-ack' }, A.publicKey), (r) => !r.ok && r.code === 'device-key-missing'],
    ['nothing pinned, no proof (an agent older than the key) ⇒ not judged', v(n1, { op: 'hello-ack' }, null), (r) => r.ok && r.judged === false],
    ['a key that is no 32-byte key ⇒ device-key-shape', v(n1, { devPub: 'AAAA', sigD: pA.sigD }, null), (r) => !r.ok && r.code === 'device-key-shape'],
    ['a PIN that is no key (an edited or imported record) ⇒ device-key-mismatch, never «nothing pinned»', v(n1, pA, 'not-a-key'), (r) => !r.ok && r.code === 'device-key-mismatch'],
    ['a pin of no shape (a deviceKey without its pub reaches the verdict as "") ⇒ device-key-mismatch', v(n1, pA, ''), (r) => !r.ok && r.code === 'device-key-mismatch'],
    ['the key forgotten (the record asks for a proof), no proof ⇒ device-key-missing', MA.hubVerdict({ nonceH: n1, ack: { op: 'hello-ack' }, pinned: null, required: true }, C), (r) => !r.ok && r.code === 'device-key-missing'],
    ['the key forgotten, a proof ⇒ learn', MA.hubVerdict({ nonceH: n1, ack: pA, pinned: null, required: true }, C), (r) => r.ok && r.learn === true],
  ];
  const bad = T.filter(([, r, want]) => !want(r));
  ok(!bad.length, `PURE hubVerdict, ${T.length} rows: ${T.map(([n]) => n).join(' · ')}`, bad.map(([n, r]) => [n, r]));
  ok(MA.fingerprintOf(A.publicKey, C).startsWith('SHA256:') && !MA.fingerprintOf(A.publicKey, C).endsWith('=') && MA.fingerprintOf(A.publicKey, C) !== MA.fingerprintOf(B.publicKey, C), 'a device key is shown as ssh\'s fingerprint form (SHA256:…, no padding) — never its bytes');
}

console.log('— ② a fake device over the REAL Mux + DeviceManager —');
const fakeDevice = async (answer) => {
  const hellos = [];
  const srv = net.createServer((sock) => {
    const mux = new Mux(sock, { onControl: (m) => { if (m.op === 'hello') { hellos.push(m); mux.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.1.1', capabilities: ['device-key'], platform: 'linux', ...answer(m) }); } }, onData: (chan, buf) => mux.credit(chan, buf.length), onDead: () => { } });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, hellos, port: srv.address().port };
};
const connectThrough = async (DM, dev, { pin = null, kind = 'stream', judged = null } = {}) => {
  const s = await new Promise((res, rej) => { const c = net.connect(dev.port, '127.0.0.1'); c.on('connect', () => res(c)); c.on('error', rej); });
  const heard = [];
  const dm = new DM({ dataDir: tmp, bundlePath: path.join(tmp, 'no-bundle-here.js'), version: '1.1.1', log: () => { }, transport: { kind, hostToken: 'vsht_x', getStream: () => s }, devicePin: () => pin, ...(judged ? { deviceJudged: judged } : {}), onDeviceKey: (ev, f) => { if (ev !== 'linked') heard.push({ ev, ...f }); } }); // unit 5's 'linked' (the link opened) is no key event
  const out = await Promise.race([dm.connect().then(() => 'connected', (e) => e), sleep(2500).then(() => 'pending')]);
  const kept = !s.destroyed;
  try { dm.stop(); } catch { } try { s.destroy(); } catch { }
  return { out, heard, kept };
};
{
  const A = MA.generateKeyPair(C), B = MA.generateKeyPair(C);
  let who = A, proof = true;
  const dev = await fakeDevice((m) => (proof && MA.isNonce(m.nonceH) ? MA.proofOf(who, m.nonceH, C) : {}));
  const c1 = await connectThrough(DeviceManager, dev);
  ok(c1.out === 'connected' && c1.heard.length === 1 && c1.heard[0].ev === 'learned' && c1.heard[0].pub === A.publicKey && c1.heard[0].fp === MA.fingerprintOf(A.publicKey, C), 'the first proof: the link opens and the record is told to pin the key (learned, with its fingerprint)', c1);
  const c2 = await connectThrough(DeviceManager, dev, { pin: A.publicKey });
  ok(c2.out === 'connected' && c2.heard.length === 1 && c2.heard[0].ev === 'proved' && dev.hellos.length === 2 && MA.isNonce(dev.hellos[0].nonceH) && dev.hellos[0].nonceH !== dev.hellos[1].nonceH, 'pinned, the same key proved: the link opens (the record hears «proved»); every hello carried a FRESH nonce', dev.hellos.map((h) => h.nonceH));
  who = B;
  const c3 = await connectThrough(DeviceManager, dev, { pin: A.publicKey });
  ok(c3.out instanceof Error && c3.out.code === 'device-key-mismatch' && c3.heard[0] && c3.heard[0].ev === 'refused' && c3.heard[0].code === 'device-key-mismatch' && c3.heard[0].fp === MA.fingerprintOf(B.publicKey, C) && c3.kept,
    'ANOTHER key: refused BY NAME (device-key-mismatch), the record hears it with the key shown, and the dialed stream is KEPT (no re-dial every second)', [c3.out && c3.out.message, c3.kept]);
  who = A; proof = false;
  const c4 = await connectThrough(DeviceManager, dev, { pin: A.publicKey });
  ok(c4.out instanceof Error && c4.out.code === 'device-key-missing', 'pinned, an answer with no proof (the old greeting): refused BY NAME (device-key-missing)', c4.out && c4.out.message);
  const c5 = await connectThrough(DeviceManager, dev, { pin: null });
  ok(c5.out === 'connected' && !c5.heard.length, 'nothing pinned and no proof (an agent older than the key): works as today, nothing learned');
  // RED: a hub copy without the verdict opens the link on the swapped key
  const SRC = read('src/agentd/client.js');
  const anchor = '            if (!kv.ok) {';
  ok(SRC.includes(anchor), 'control: the verdict guards the hello-ack (the anchor)', anchor);
  const Mut = mutantCopies('device-key-hub', REPO).load('src/agentd/client.js', SRC.replace(anchor, '            if (false) {'), 'no-verdict');
  proof = true; who = B;
  const cM = await connectThrough(Mut.DeviceManager, dev, { pin: A.publicKey });
  ok(cM.out === 'connected', 'RED CONTROL: a hub copy without the verdict opens the link on the swapped key — the leg above refuses that', cM.out instanceof Error ? cM.out.message : cM.out);
  dev.srv.close();
}

console.log('— ③r a refusal is said again on every NEW connect (B-7f0b key-refused — the read\'s must 1) —');
{
  const DFr = require('../src/dial-facts.js');
  const HSRC = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
  const run = async (HMc, tag) => {
    const dR = path.join(tmp, 'hosts-again-' + tag); fs.mkdirSync(dR, { recursive: true });
    const hm = new HMc({ dataDir: dR });
    const id = hm.setDialToken('macR', 'r'.repeat(64), { name: 'macR' }); const dev = hm.get(id).deviceId;
    const row = () => DFr.dialRowState({ ...hm.get(id), online: true, dialLive: true }, { now: Date.now() + 60000 }).state;
    const ref = () => hm.noteDeviceKey(id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:x', road: 'dial' });
    const o = {};
    hm.noteDial(dev, 'accepted', { at: Date.now() - 5000 });
    o.w1 = ref(); o.s1 = row();
    o.w2 = ref();                                              // the same refusal on the SAME connect: nothing written
    hm.noteDial(dev, 'accepted', { at: Date.now() + 10 });     // a restart / a wake: its dial-in
    o.s2 = row();                                              // (before its hello is judged: the new connect)
    o.w3 = ref(); o.s3 = row();                                // its hello refused the same way again
    o.after = hm.get(id).deviceKeyRefused.at > hm.get(id).dial.lastConnectAt;
    hm.noteDial(dev, 'accepted', { at: Date.now() + 20 });     // a newcomer's connect; the refused copy takes the seat back (reseat)
    o.a3 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'ssh' });    // another road's (with a code, as reseat passes one), its time OLDER than the connect: nothing — the road alone decides
    o.a1 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'dial' }); o.s4 = row();
    o.a2 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'dial' });   // already newer than the connect: nothing
    // the second read: the seat's OWN code — a newcomer refused another way overwrote the record, or proved the key and cleared it
    hm.noteDial(dev, 'accepted', { at: Date.now() + 30 });
    hm.noteDeviceKey(id, 'refused', { code: 'hub-key-mismatch', road: 'dial' });   // the newcomer's own refusal
    o.b1 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'dial' }); o.b1c = hm.get(id).deviceKeyRefused.code; o.s5 = row();
    hm.noteDial(dev, 'accepted', { at: Date.now() + 40 });
    hm.noteDeviceKey(id, 'proved', {});                                            // the record cleared (a newcomer's proof, or a person's act)
    o.c0 = !hm.get(id).deviceKeyRefused;
    o.c1 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'dial' }); o.s6 = row(); o.c2 = !hm.get(id).deviceKeyRefused;
    // the third read: a person's Forget clears the record; the seat's kept refusal (a snapshot from before) never brings it back
    hm.noteDeviceKey(id, 'learned', { pub: MA.generateKeyPair(C).publicKey, fp: 'fpR', road: 'dial' }); hm.noteDeviceKey(id, 'refused', { code: 'device-key-mismatch', road: 'dial' }); hm.forgetDeviceKey(id); o.f0 = !hm.get(id).deviceKeyRefused;
    o.f1 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'dial' }); o.f2 = !hm.get(id).deviceKeyRefused;
    // …and another road's call, WITH a code (as reseat passes one), never rebuilds nor overwrites the dial road's record
    hm.noteDial(dev, 'accepted', { at: Date.now() + 50 }); hm.noteDeviceKey(id, 'refused', { code: 'hub-key-mismatch', road: 'dial' });
    o.r1 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'ssh' }); o.r2 = hm.get(id).deviceKeyRefused.code;
    // 主开发 00:36Z smalls: (1) a put-back never restores a refusal OLDER than a person's act; (2) it carries the seat's own fingerprint;
    // (7) a device's code is bounded before it is stored
    hm.noteDial(dev, 'accepted', { at: Date.now() + 60 });
    hm.noteDeviceKey(id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:seat', road: 'dial' }); const seatAt = Date.now();
    hm.noteDeviceKey(id, 'refused', { code: 'hub-key-mismatch', road: 'dial' });   // a newcomer's other code over it
    o.p1 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'dial', at: seatAt }); o.p1fp = hm.get(id).deviceKeyRefused.fp;
    hm.noteDeviceKey(id, 'refused', { code: 'hub-key-mismatch', road: 'dial' });
    hm.get(id).deviceKeyUnprovenAt = Date.now() + 1000;                               // a person's «Let in without a key» AFTER the seat's refusal
    o.p2 = hm.noteDeviceKey(id, 'refused-again', { code: 'device-key-mismatch', road: 'dial', at: seatAt }); o.p2c = hm.get(id).deviceKeyRefused.code;
    hm.noteDeviceKey(id, 'refused', { code: 'x'.repeat(200), road: 'dial' }); o.cb1 = hm.get(id).deviceKeyRefused.code;
    hm.noteDeviceKey(id, 'refused', { code: 'evil code\n<b>', road: 'dial' }); o.cb2 = hm.get(id).deviceKeyRefused.code;
    hm.noteDeviceKey(id, 'refused', { code: 'hub-' + 'z'.repeat(80), road: 'dial' }); o.cb3 = hm.get(id).deviceKeyRefused.code; // 01:11Z small (5): a hub-side word stays hub-side
    if (typeof hm.persisted === 'function') await hm.persisted(); // 2.369.411's hosts store writes off the loop: the file is read once the writer says it landed
    const saved = JSON.parse(fs.readFileSync(path.join(dR, 'hosts.json'), 'utf8')).hosts.find((x) => x.id === id);
    o.disk = !!(saved && saved.deviceKeyRefused && saved.deviceKeyRefused.at === hm.get(id).deviceKeyRefused.at);
    hm.get(id).hubPinClearedAt = Date.now(); hm.setDialToken('macR', 'q'.repeat(64)); o.pc = hm.get(id).hubPinClearedAt === undefined; // 主开发 01:11Z small (4): a new pairing clears «Let it pin»'s mark with the others
    return o;
  };
  const { HostManager } = require('../src/hosts.js');
  const g = await run(HostManager, 'real');
  ok(g.w1 && g.s1 === 'key-refused' && !g.w2 && g.s2 === 'connected' && g.w3 && g.s3 === 'key-refused' && g.after && g.a1 && g.s4 === 'key-refused' && !g.a2 && !g.a3 && g.disk
    && g.b1 && g.b1c === 'device-key-mismatch' && g.s5 === 'key-refused' && g.c0 && !g.c1 && g.s6 === 'connected' && g.c2 && g.f0 && !g.f1 && g.f2 && !g.r1 && g.r2 === 'hub-key-mismatch'
    && g.p1 && g.p1fp === 'SHA256:seat' && !g.p2 && g.p2c === 'hub-key-mismatch' && g.cb1 === 'device-key-mismatch' && g.cb2 === 'device-key-mismatch' && g.cb3 === 'hub-key-mismatch' && g.pc,
    'the SAME refusal on a NEW connect (a restart, a wake, a reconnect) moves its time past that connect — the row reads key-refused again, never «connected» beside a refused link; on the same connect nothing is written; a refused copy re-seated after a newcomer\'s connect says it again (refused-again), once, on its own road (another road\'s ask moves nothing, its time still older); the seat\'s OWN code puts back a record a newcomer overwrote (another code) — never one that is GONE (a proof, a person\'s Forget: the seat\'s kept refusal predates it), never from another road; the record on disk agrees', g);
  const AG = '      const again = same && !(Number(h.deviceKeyRefused.at) > lca);';
  if (!HSRC.includes(AG)) ok(false, 'control: the anchor (the repeat on a new connect) is not in this tree', AG);
  else {
    const MR = mutantCopies('device-key-again', REPO);
    const HMm = MR.load('src/hosts.js', anchored(HSRC, AG, '      const again = false;', 'no-again'), 'no-again').HostManager;
    const m = await run(HMm, 'mut');
    ok(m.s3 === 'connected' && !m.w3, 'RED CONTROL: a writer that skips the repeat (the commit before the read) leaves the refusal older than the new connect — the row reads «connected» after a restart (the leg above refuses that)', m);
    // 主开发 00:36Z small (6): an anchored control for «never rebuild a cleared record» (a put-back over NO record)
    const PB = "if (code && kr && (kr.road || null) === (facts.road || null) && kr.code !== code && ";
    const HMr = MR.load('src/hosts.js', anchored(HSRC, PB, "if (code && (!kr || ((kr.road || null) === (facts.road || null) && kr.code !== code)) && ", 'rebuild-cleared'), 'rebuild-cleared').HostManager;
    const mr = await run(HMr, 'rebuild');
    ok(mr.f1 === true && mr.f2 === false, 'RED CONTROL: a put-back that rebuilds a record that is GONE brings back a refusal the person cleared by Forget (the leg above refuses that)', mr);
    // and for the For-you words of a dial-out row (a bad hub proof is a new pairing, never «Let it pin»)
    const HWS = fs.readFileSync(path.join(REPO, 'src/server/host-key-watch.js'), 'utf8');
    const HWm = MR.load('src/server/host-key-watch.js', anchored(HWS, "        : code !== 'hub-key-mismatch' && dials ? i18nKey(", "        : false ? i18nKey(", 'dial-out-let-it-pin'), 'dial-out-let-it-pin');
    ok(/Let it pin this hub's key/.test(HWm.itemOf({ machine: 'srv', fp: 'x', kind: 'device', code: 'hub-key-missing', door: 'dial-out' }).detail), 'RED CONTROL: For-you words that send a dial-out row\'s bad hub proof to «Let it pin this hub\'s key» (a door its dialog draws for a mismatch only) — the leg in ④ refuses that');
    for (const r of copiesCensus(MR.files, MR.dir, REPO, { minCopies: 1, label: 'mutant-copy (key refused again): ' })) ok(r.pass, r.name, r.detail);
  }
  const DPS = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
  ok(/else if \(\/\^\(\?:device\|hub\)\[-_\]\/\.test\(String\(f\.rf\.code \|\| ''\)\)\) \{ const h = hosts\.findByDeviceId\(deviceId\); if \(h && hosts\.noteDeviceKey\?\.\(h\.id, 'refused-again', \{ code: String\(f\.rf\.code\), road: 'dial', at: Number\(f\.rf\.at\) \|\| 0 \}\)\)/.test(DPS), 'the seat: reseat says a key refusal again through refused-again on the dial road (a greeting refusal and an auth-fail already were)');
}

console.log('— ③ the record: pinned at the first proof, refused said on it, forgotten by the person or a new pairing —');
{
  const { HostManager } = require('../src/hosts.js');
  fs.mkdirSync(path.join(tmp, 'hosts'), { recursive: true });
  const hm = new HostManager({ dataDir: path.join(tmp, 'hosts') });
  const said = [], decided = [];
  hm.onHostKeyRefused = (h, e) => said.push({ id: h.id, ...e }); hm.onHostKeyPinned = (h, kind) => decided.push({ id: h.id, kind });
  const id = hm.setDialToken('mac1', 'a'.repeat(64), { name: 'mac1' });
  const A = MA.generateKeyPair(C);
  hm.noteDeviceKey(id, 'learned', { pub: A.publicKey, fp: MA.fingerprintOf(A.publicKey, C) });
  if (typeof hm.persisted === 'function') await hm.persisted(); // 2.369.411's hosts store writes off the loop (store-writer): the file is read once the writer says it landed
  const h1 = JSON.parse(fs.readFileSync(path.join(tmp, 'hosts', 'hosts.json'), 'utf8')).hosts.find((x) => x.id === id);
  ok(h1.deviceKey && h1.deviceKey.pub === A.publicKey && h1.deviceKey.fp === MA.fingerprintOf(A.publicKey, C) && !JSON.stringify(h1).includes('PRIVATE'), 'learned ⇒ the record pins the PUBLIC key (hosts.json: pub + fingerprint + when; never a private byte)');
  hm.noteDeviceKey(id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:other' });
  const row = hm.list().find((x) => x.id === id);
  ok(row.deviceKeyRefused && row.deviceKeyRefused.code === 'device-key-mismatch' && said.length === 1 && said[0].kind === 'device' && said[0].pinned === true, 'refused ⇒ the row carries deviceKeyRefused (the card\'s chip) and the For-you watch hears it (kind device)', row.deviceKeyRefused);
  hm.setDialToken('mac1', 'a'.repeat(64));
  ok(hm.get(id).deviceKey, 'the SAME pairing token again: the pin stays');
  hm.setDialToken('mac1', 'b'.repeat(64));
  ok(!hm.get(id).deviceKey && !hm.get(id).deviceKeyRefused && decided.some((d) => d.id === id && d.kind === 'device'), 'a NEW pairing command forgets the pin (the person re-trusted the machine) and the item is resolved');
  hm.noteDeviceKey(id, 'learned', { pub: A.publicKey, fp: 'x' });
  hm.forgetDeviceKey(id);
  ok(!hm.get(id).deviceKey, '«Forget the device key»: the record forgets it; the next proof pins again');
  // unit 3's cure: the forgotten pin is not a silent window
  ok(hm.get(id).deviceKeyForgotAt > 0, '…and the record ASKS for a proof now (an answer that proves nothing is refused, device-key-missing)');
  const learnedSaid = []; hm.onDeviceKeyLearned = (h, f) => learnedSaid.push({ id: h.id, ...f });
  const id9 = hm.setDialToken('mac9', '9'.repeat(64), { name: 'mac9' });
  hm.noteDeviceKey(id9, 'learned', { pub: MA.generateKeyPair(C).publicKey, fp: 'fp9' });
  ok(learnedSaid.length === 0, 'a first ordinary pairing files no notice (only a pin opened by a Forget is told)');
  const B2 = MA.generateKeyPair(C);
  hm.noteDeviceKey(id, 'learned', { pub: B2.publicKey, fp: 'fpB' });
  ok(learnedSaid.length === 1 && learnedSaid[0].fp === 'fpB' && !hm.get(id).deviceKeyForgotAt && hm.get(id).deviceKey.pub === B2.publicKey, '…the key the next proof pins is told to the person (once), and the mark ends', learnedSaid);
  let dropped = 0; const realInv = hm.invalidateDevice.bind(hm); hm.invalidateDevice = (x) => { if (x === id) dropped++; return realInv(x); };
  hm.forgetDeviceKey(id);
  ok(dropped === 1, 'Forget drops the machine\'s live link at once: the next hello is the one judged');
  hm.noteDeviceKey(id, 'learned', { pub: B2.publicKey, fp: 'fpB' });
  ok(learnedSaid.length === 1 && !hm.get(id).deviceKeyForgotAt, '…the SAME key proved again files no notice (nothing new was trusted), and the mark ends');
  hm.noteDeviceKey(id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:x' });
  const nd = decided.length;
  ok(hm.noteDeviceKey(id, 'proved', {}) === true && !hm.get(id).deviceKeyRefused && decided.length === nd + 1, 'the pinned key proves again: the row\'s refusal ends and its item is resolved');
  ok(hm.noteDeviceKey(id, 'proved', {}) === false, '…and a proof with nothing refused moves nothing (no write per hello)');
  hm.forgetDeviceKey(id); hm.setDialToken('mac1', 'e'.repeat(64));
  ok(!hm.get(id).deviceKeyForgotAt, 'a new pairing command ends the mark too (its agent is pinned as at a first pairing)');
  hm.noteDeviceKey(id, 'learned', { pub: B2.publicKey, fp: 'fpB' }); hm.forgetDeviceKey(id);
  const marked = hm.get(id).deviceKeyForgotAt;
  let eNone = null; try { hm.forgetDeviceKey(id); } catch (e) { eNone = e; }
  ok(marked > 0 && eNone && eNone.code === 'device-key-none' && hm.get(id).deviceKeyForgotAt === marked, 'Forget with a key pinned: the record asks for a proof — a Forget with none pinned is refused by name and changes no mark (no toggle a second tab could flip)');
  let e9 = null; try { hm.forgetDeviceKey(id9, { unproven: true }); } catch (e) { e9 = e; }
  ok(e9 && e9.code === 'device-key-not-asked' && hm.get(id9).deviceKey, '«Let in without a key» is refused while a key is pinned (it is no Forget)');
  const ls0 = learnedSaid.length;
  const lw = hm.forgetDeviceKey(id, { unproven: true });
  ok(lw.unproven === true && !hm.get(id).deviceKeyForgotAt && hm.get(id).deviceKeyUnprovenAt > 0, '«Let in without a key» while the record asks for a proof: the mark ends, its own time is kept (an agent that cannot prove one — an empty key file — is let in)');
  hm.noteDeviceKey(id, 'learned', { pub: MA.generateKeyPair(C).publicKey, fp: 'fpLater' });
  ok(learnedSaid.length === ls0 + 1 && !hm.get(id).deviceKeyUnprovenAt, '…and a key it proves later is told (the notice), as after a Forget');
}

console.log('— ③b the DIALED road: deviceForDial hands the record\'s pin and mark to the link (a leg per road) —');
{
  const { EventEmitter } = require('node:events');
  const DPM = require('../src/server/dial-pairing.js');
  const { HostManager } = require('../src/hosts.js');
  const dir = path.join(tmp, 'dial-road'); fs.mkdirSync(dir, { recursive: true });
  const H = new HostManager({ dataDir: dir });
  const opts = { rootDir: tmp, AGENTD_DIR: path.join(dir, 'agentd'), agentdHostToken: () => 'vsht_ok', getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} };
  const A = MA.generateKeyPair(C), B = MA.generateKeyPair(C);
  let who = A, prove = true, hellos = 0;
  const stream = () => { // the hub's own dial adapter over a fake ws, to a fake device that proves `who` (or nothing)
    const ws = new EventEmitter(), dev = new EventEmitter();
    let closes = 0;
    ws.send = (d) => { const b = Buffer.from(d); setImmediate(() => dev.emit('data', b)); }; ws.close = () => { closes++; setImmediate(() => ws.emit('close')); };
    dev.write = (d) => { const b = Buffer.from(d); setImmediate(() => ws.emit('message', b)); return true; }; dev.destroy = () => { };
    const m = new Mux(dev, { heartbeat: false, onControl: (x) => { if (x.op === 'hello') hellos++; if (x.op === 'hello') m.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.1.1', capabilities: ['device-key'], platform: 'linux', ...(prove && MA.isNonce(x.nonceH) ? MA.proofOf(who, x.nonceH, C) : {}) }); }, onData: () => { }, onDead: () => { } });
    const st = DPM.wsStream(ws); st.closes = () => closes; return st;
  };
  const road = async (DPx) => { DPx.agentdDials.set('devR', stream()); try { await DPx.deviceForDial('devR'); return 'connected'; } catch (e) { return e; } finally { for (const d of DPx.agentdDialDevices.values()) { try { d.stop(); } catch { } } DPx.agentdDialDevices.clear(); } };
  const id = H.setDialToken('devR', 'f'.repeat(64), { name: 'devR' });
  const DP = DPM.create(opts);
  const r1 = await road(DP);
  ok(r1 === 'connected' && H.get(id).deviceKey && H.get(id).deviceKey.pub === A.publicKey, 'the dialed road pins the key the device proves, on its record', r1 instanceof Error ? r1.message : r1);
  who = B;
  const r2 = await road(DP);
  ok(r2 instanceof Error && r2.code === 'device-key-mismatch' && H.get(id).deviceKeyRefused, 'ANOTHER key over the dialed road: refused BY NAME, said on the record', r2 instanceof Error ? r2.message : r2);
  H.forgetDeviceKey(id); prove = false;
  const r3 = await road(DP);
  ok(r3 instanceof Error && r3.code === 'device-key-missing', 'after Forget, an answer that proves nothing is refused over the dialed road (the record asks for a proof)', r3 instanceof Error ? r3.message : r3);
  prove = true; who = A;
  const r4 = await road(DP);
  ok(r4 === 'connected' && H.get(id).deviceKey.pub === A.publicKey && !H.get(id).deviceKeyForgotAt, '…and the next proof is pinned', r4 instanceof Error ? r4.message : r4);
  // Forget reaches the dialed road's LIVE link: a link built before the Forget greets again at the next op
  const S = stream(); DP.agentdDials.set('devR', S);
  const h0 = hellos; await DP.deviceForDial('devR'); await DP.deviceForDial('devR');
  const once = hellos - h0;
  await sleep(5); H.forgetDeviceKey(id);
  let rF = 'connected'; try { await DP.deviceForDial('devR'); } catch (e) { rF = e; }
  ok(once === 1 && rF instanceof Error && rF.code === 'device-key-forgotten' && S.closes() === 1 && !DP.agentdDials.has('devR') && hellos - h0 === 1, 'Forget over a LIVE dialed link: the next op closes its stream (the agent ends that connection whole, its channels with it) and is refused by name — no hello over the old connection', rF instanceof Error ? rF.message : rF);
  const S2 = stream(); DP.agentdDials.set('devR', S2);
  let rG = 'connected'; try { await DP.deviceForDial('devR'); } catch (e) { rG = e; }
  ok(rG === 'connected' && hellos - h0 === 2 && !H.get(id).deviceKeyForgotAt && H.get(id).deviceKey.pub === A.publicKey, '…and when it dials in again, its FRESH stream is judged: a proof asked, and pinned', rG instanceof Error ? rG.message : rG);
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } } DP.agentdDialDevices.clear();
  const saved = H.get(id).deviceKey; H.get(id).deviceKey = { fp: 'SHA256:x' }; // an edited record: a deviceKey with no pub
  const rS = await road(DP);
  H.get(id).deviceKey = saved;
  ok(rS instanceof Error && rS.code === 'device-key-mismatch', 'a record whose pin has no key (an edited or imported one) refuses over the dialed road — never «nothing pinned»', rS instanceof Error ? rS.message : rS);
  const DSRC = read('src/server/dial-pairing.js');
  const PIN = "      devicePin: () => { const h = hosts.findByDeviceId(deviceId); const k = h && h.deviceKey; return k == null ? null : (k && typeof k.pub === 'string' ? k.pub : ''); },";
  ok(DSRC.includes(PIN), 'control: deviceForDial hands the record\'s pin (the anchor)');
  const M = mutantCopies('device-key-road', REPO);
  const DPN = M.load('src/server/dial-pairing.js', DSRC.replace(PIN, '      devicePin: () => null,'), 'no-pin').create(opts);
  who = B;
  const rM = await road(DPN);
  ok(rM === 'connected', 'RED CONTROL: a deviceForDial copy that hands no pin lets the swapped key in — the leg above refuses it', rM instanceof Error ? rM.message : rM);
  for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy (road): ' })) ok(x.pass, x.name, x.detail);
  ok(read('src/hosts.js').includes("devicePin: () => { try { const k = this.get(id).deviceKey; return k == null ? null : (k && typeof k.pub === 'string' ? k.pub : ''); } catch { return null; } }, onDeviceKey: (ev, f) => this.noteDeviceKey(id, ev, { ...(f || {}), road: 'ssh' }), deviceProofRequired: () =>"), 'WIRING: the ssh road (hosts._deviceConnect) hands the pin, the key events (said with their road) and the proof mark the same way');
}

console.log('— ③c a machine reached BOTH ways (ssh, then upgraded to dial-out): ONE PIN, ONE ROAD —');
{
  const { EventEmitter } = require('node:events');
  const DPM = require('../src/server/dial-pairing.js');
  const DFm = require('../src/dial-facts.js');
  const A = MA.generateKeyPair(C), B = MA.generateKeyPair(C);
  // the ssh road's agent (~/.vibespace/agentd) proves A; the dial-out agent (its own root, ~/.vibespace/devicehost) proves B
  const both = async (HM, tag) => {
    const dir = path.join(tmp, 'both-' + tag); fs.mkdirSync(dir, { recursive: true });
    const H = new HM({ dataDir: dir });
    const said = []; H.onHostKeyRefused = (h, e) => said.push(e.code);
    const id = H.add({ name: 'studio', host: 'studio.example', user: 'u' });
    H.noteDeviceKey(id, 'learned', { pub: A.publicKey, fp: MA.fingerprintOf(A.publicKey, C) });
    H.graduateDial(id);
    const dev = H.get(id).deviceId;
    H.setDialToken(dev, 'c'.repeat(64));
    const DP = DPM.create({ rootDir: tmp, AGENTD_DIR: path.join(dir, 'agentd'), agentdHostToken: () => 'vsht_ok', getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} });
    const ws = new EventEmitter(), d = new EventEmitter();
    ws.send = (x) => { const b = Buffer.from(x); setImmediate(() => d.emit('data', b)); }; ws.close = () => { };
    d.write = (x) => { const b = Buffer.from(x); setImmediate(() => ws.emit('message', b)); return true; }; d.destroy = () => { };
    const m = new Mux(d, { heartbeat: false, onControl: (x) => { if (x.op === 'hello') m.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.1.1', capabilities: ['device-key'], platform: 'linux', ...(MA.isNonce(x.nonceH) ? MA.proofOf(B, x.nonceH, C) : {}) }); }, onData: () => { }, onDead: () => { } });
    DP.agentdDials.set(dev, DPM.wsStream(ws));
    let r = 'connected'; try { await DP.deviceForDial(dev); } catch (e) { r = e; }
    for (const x of DP.agentdDialDevices.values()) { try { x.stop(); } catch { } }
    return { r, said, H, id };
  };
  const R = await both(require('../src/hosts.js').HostManager, 'real');
  const rec = R.H.get(R.id);
  ok(R.r === 'connected' && rec.deviceKey && rec.deviceKey.pub === B.publicKey && !rec.deviceKeyRefused && !R.said.length, 'an ssh machine upgraded to dial-out: its dial road\'s agent (its own root, its own key) is pinned for that road — no «device key changed», no urgent false alarm', R.r instanceof Error ? R.r.message : { said: R.said });
  const judged = () => DFm.pairingDoorOf(R.H.get(R.id)) !== 'dial-out';
  const devS = await fakeDevice((m) => (MA.isNonce(m.nonceH) ? MA.proofOf(A, m.nonceH, C) : {}));
  const cS = await connectThrough(DeviceManager, devS, { pin: B.publicKey, judged });
  ok(cS.out === 'connected' && !cS.heard.length, 'its SSH road is not judged (ssh\'s own host key check guards it): the ssh agent\'s key opens the link, nothing pinned or refused', cS.out instanceof Error ? cS.out.message : cS.heard);
  const CSRC = read('src/agentd/client.js');
  const JUDGE = "            let judged = true; try { judged = !this._deviceJudged || !!this._deviceJudged(); } catch { judged = true; }\n";
  ok(CSRC.includes(JUDGE), 'control: the client asks the road rule (the anchor)');
  const MC = mutantCopies('device-key-road-rule', REPO);
  const AllRoads = MC.load('src/agentd/client.js', CSRC.replace(JUDGE, '            let judged = true;\n'), 'judges-every-road');
  const cR = await connectThrough(AllRoads.DeviceManager, devS, { pin: B.publicKey, judged });
  ok(cR.out instanceof Error && cR.out.code === 'device-key-mismatch', 'RED CONTROL: a client copy that judges every road refuses the ssh agent against the dial road\'s pin — «device key changed», the false alarm', cR.out instanceof Error ? cR.out.code : cR.out);
  for (const x of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 1, label: 'mutant-copy (road rule): ' })) ok(x.pass, x.name, x.detail);
  devS.srv.close();
  ok(read('src/hosts.js').includes("deviceJudged: () => { try { return require('./dial-facts.js').pairingDoorOf(this.get(id)) !== 'dial-out'; } catch { return true; } }"), 'WIRING: the ssh road (hosts._deviceConnect) asks the road rule');
  ok(R.H.get(R.id).sshDeviceKey && R.H.get(R.id).sshDeviceKey.pub === A.publicKey, '…and the ssh road\'s own pin (A) is kept aside while the machine dials out');
  R.H.noteDeviceKey(R.id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:imp', road: 'dial' });
  R.H.noteDeviceKey(R.id, 'proved', { road: 'ssh' });
  const kept = !!R.H.get(R.id).deviceKeyRefused;
  R.H.noteDeviceKey(R.id, 'proved', { road: 'dial' });
  ok(kept && !R.H.get(R.id).deviceKeyRefused, 'a refusal on the dial road is not cleared by the ssh road\'s proof — only by its own road\'s (no urgent item silenced by the other agent)');
  { const MW = read('src/server/mounts-plugins-wiring.js'); const at = (t) => MW.indexOf(t); const g = at('    const attempt = hosts.beginGraduation(h.id, { dialRoot: root });\n'), t0 = at('    try {\n      const gradDevice'), mint = at('      pair = agentdMintDialPair(gradDevice'), rd = at("      const installer = fs.readFileSync(path.join(rootDir, 'scripts', 'vibespace-agentd-install.sh'), 'utf-8');"), c = at('    } catch (e) { rollBack(); throw e; }\n');
    ok(g > 0 && g < t0 && t0 < mint && mint < rd && rd < c && MW.includes("    const rollBack = () => { attempt.rollBack(); bcastAll({ type: 'hosts-updated' }); };\n") && !MW.includes('the machine stays as it was') && MW.includes("    if (!inst.ok) { rollBack(); throw"), 'the upgrade\'s rollback covers ANY throw between the upgrade and the installer\'s answer (the mint — a locked vault —, the installer read, the allow list) and the installer\'s failure, through the ONE attempt (pinned by its lines: the route runs ssh; the attempt itself is driven below)', { g, t0, mint, rd, c }); }
  R.H.ungraduateDial(R.id);
  ok(R.H.get(R.id).deviceKey && R.H.get(R.id).deviceKey.pub === A.publicKey && !R.H.get(R.id).sshDeviceKey && !R.H.get(R.id).deviceId, 'removing dial-out (or a failed install\'s rollback) drops the dial road\'s pin and brings the ssh road\'s own back — nothing is pinned anew in silence');
  const HSRC = read('src/hosts.js');
  const DROP = "      this._dropDeviceKey(h, { setAside: true });\n";
  ok(HSRC.includes(DROP), 'control: the upgrade to dial-out starts the dial road with no pin (the anchor)');
  const MH = mutantCopies('device-key-both', REPO);
  const R2 = await both(MH.load('src/hosts.js', HSRC.replace(DROP, ''), 'keeps-ssh-pin').HostManager, 'red');
  ok(R2.r instanceof Error && R2.r.code === 'device-key-mismatch' && R2.said.includes('device-key-mismatch'), 'RED CONTROL: a hosts copy that keeps the ssh road\'s pin at the upgrade refuses the dial-out agent as «device key changed», with an urgent item — the false alarm of one machine, two keys', R2.r instanceof Error ? R2.r.code : R2.r);
  for (const x of copiesCensus(MH.files, MH.dir, REPO, { minCopies: 1, label: 'mutant-copy (both roads): ' })) ok(x.pass, x.name, x.detail);
  R.H.graduateDial(R.id); R.H.noteDeviceKey(R.id, 'learned', { pub: B.publicKey, fp: 'fpB' });
  ok(R.H.get(R.id).sshDeviceKey && R.H.get(R.id).sshDeviceKey.pub === A.publicKey, '(again upgraded: the ssh pin set aside)');
  R.H.forgetDeviceKey(R.id); R.H.ungraduateDial(R.id);
  ok(!R.H.get(R.id).deviceKey && !R.H.get(R.id).sshDeviceKey && R.H.get(R.id).deviceKeyForgotAt, 'a Forget while upgraded forgets the set-aside ssh pin too — removing dial-out then brings back no stale pin (no false «key changed») and the ssh road still ASKS for a proof', { forgotAt: R.H.get(R.id).deviceKeyForgotAt });
  { const told = []; R.H.onDeviceKeyLearned = (h, f) => told.push(f && f.fp); R.H.noteDeviceKey(R.id, 'learned', { pub: 'pubA2', fp: 'fpA2', road: 'ssh' }); ok(told.includes('fpA2'), 'the key the ssh road then learns is TOLD (the «pinned its new key» notice), never pinned in silence', told); }
  { // THE ORDER A PERSON MEETS: Forget while upgraded → the dial agent proves again at once (Forget ends its link) → Remove
    // dial-out → the ssh road's agent proves a key. The dial road's proof clears only the dial road's ask: the ssh road's own
    // ask (sshKeyForgot) survives, and the key it learns is TOLD
    const KEEP = '    if (asked) { if (asked.at) h.deviceKeyForgotAt = asked.at; if (asked.fp) h.deviceKeyForgotFp = asked.fp; if (asked.unproven) h.deviceKeyUnprovenAt = asked.unproven; }\n';
    ok(HSRC.includes(KEEP), 'control: the ssh road\'s ask comes back when dial-out goes (the anchor)');
    const askLeg = (HM, tag) => {
      const dK = path.join(tmp, 'hosts-forget-kept-' + tag); fs.mkdirSync(dK, { recursive: true }); const hk = new HM({ dataDir: dK }); const told = [];
      hk.onDeviceKeyLearned = (h, f) => told.push(f && f.fp);
      const kid = hk.add({ name: 'kept-ask-' + tag, host: 'kept.example', user: 'u' });
      hk.noteDeviceKey(kid, 'learned', { pub: A.publicKey, fp: 'fpA', road: 'ssh' }); hk.graduateDial(kid); hk.noteDeviceKey(kid, 'learned', { pub: B.publicKey, fp: 'fpB', road: 'dial' });
      hk.forgetDeviceKey(kid); hk.noteDeviceKey(kid, 'learned', { pub: 'pubB2', fp: 'fpB2', road: 'dial' }); // the dial agent proves again at once
      hk.ungraduateDial(kid); hk.noteDeviceKey(kid, 'learned', { pub: 'pubC', fp: 'fpC', road: 'ssh' });
      return told;
    };
    const tk = askLeg(require('../src/hosts.js').HostManager, 'real');
    ok(tk.includes('fpC'), 'Forget while upgraded, the dial agent proving again at once, then Remove dial-out: the ssh road\'s next key is TOLD (its own ask survived the dial road\'s proof)', tk);
    const MK = mutantCopies('device-key-forget-kept', REPO);
    const tkM = askLeg(MK.load('src/hosts.js', HSRC.replace(KEEP, ''), 'ask-dropped').HostManager, 'red');
    ok(!tkM.includes('fpC'), 'RED CONTROL: a hosts copy that drops the ssh road\'s ask at the removal of dial-out pins its next key in SILENCE (no notice)', tkM);
    for (const x of copiesCensus(MK.files, MK.dir, REPO, { minCopies: 1, label: 'mutant-copy (forget kept): ' })) ok(x.pass, x.name, x.detail); }
  { // A RE-PRESS ON A MACHINE THAT ALREADY DIALS OUT IS REFUSED BY NAME BEFORE ANYTHING RUNS (主开发's «as if a must»): a dialog
    // left open, a second tab, the vault locked after a hub restart — the mint would rotate the working pairing (its token, its
    // pin, its link) and a failure after it could restore none of it. A first upgrade rolled back goes back to ssh with its pin
    const pressLeg = (HM, tag) => {
      const d5 = path.join(tmp, 'hosts-repress-' + tag); fs.mkdirSync(d5, { recursive: true }); const hm5 = new HM({ dataDir: d5 });
      const id5 = hm5.add({ name: 'up-' + tag, host: 'up.example', user: 'u' }); hm5.noteDeviceKey(id5, 'learned', { pub: A.publicKey, fp: 'fpA', road: 'ssh' });
      const a1 = hm5.beginGraduation(id5, { dialRoot: '$HOME/.vibespace/device@one' }); a1.rollBack();
      const r1 = { deviceId: hm5.get(id5).deviceId || null, pin: !!(hm5.get(id5).deviceKey && hm5.get(id5).deviceKey.pub === A.publicKey) };
      hm5.beginGraduation(id5, { dialRoot: '$HOME/.vibespace/device@one' }).finish(); // its install completed
      const dev = hm5.get(id5).deviceId; hm5.setDialToken(dev, 'ab'.repeat(32)); hm5.noteDeviceKey(id5, 'learned', { pub: B.publicKey, fp: 'fpB', road: 'dial' });
      let e3 = null; try { const a3 = hm5.beginGraduation(id5, { dialRoot: '$HOME/.vibespace/device@two' }); a3.rollBack(); } catch (e) { e3 = e; }
      const h5 = hm5.get(id5);
      return { r1, code: e3 && e3.code, words: e3 && e3.message, deviceId: h5.deviceId === dev, token: h5.dialTokenHash === 'ab'.repeat(32), root: h5.dialRoot, pin: !!(h5.deviceKey && h5.deviceKey.pub === B.publicKey) };
    };
    const rl = pressLeg(require('../src/hosts.js').HostManager, 'real');
    ok(!rl.r1.deviceId && rl.r1.pin && rl.code === 'already-dial-out' && /Remove dial-out first, then Upgrade to dial-out/.test(rl.words || '') && rl.deviceId && rl.token && rl.root === '$HOME/.vibespace/device@one' && rl.pin, 'a first upgrade rolled back goes back to ssh with its pin; a re-press on a machine already dialing out is REFUSED BY NAME (its door: Remove dial-out, then Upgrade) and leaves its device id, token, root and pin whole', rl);
    const MW2 = read('src/server/mounts-plugins-wiring.js');
    ok(MW2.includes("async function graduateHostToDial(h, { serverUrl, viaRelay, by = 'system:graduate', from = '' } = {}) {\n  hosts.notDialOut(h.id);"), 'WIRING: the upgrade asks notDialOut as its FIRST statement, before the reachability check, the mint and the install (the route runs ssh: pinned by its line)');
    const NOTDO = "    if (this.get(id).deviceId) throw Object.assign(new Error('this machine already dials out";
    ok(HSRC.includes(NOTDO), 'control: the refusal of a machine already dialing out (the anchor)');
    const MR = mutantCopies('device-key-repress', REPO);
    const rlM = pressLeg(MR.load('src/hosts.js', HSRC.replace(NOTDO, "    if (false) throw Object.assign(new Error('this machine already dials out"), 'repress-runs').HostManager, 'red');
    ok(!rlM.code && !rlM.deviceId && !rlM.token && !rlM.root && !rlM.pin, 'RED CONTROL: a copy that lets a re-press run WIPES a working dial-out machine at its rollback — device id, token, root and pin gone; its agent keeps dialing, refused, and Remove dial-out can no longer find its root', rlM);
    for (const x of copiesCensus(MR.files, MR.dir, REPO, { minCopies: 1, label: 'mutant-copy (re-press): ' })) ok(x.pass, x.name, x.detail); }
  { // the edges my reader of this commit found: a second Remove (another tab) leaves the ssh road whole; a Forget pending at the
    // upgrade is carried into the ssh road's ask; a second Forget while dialing out keeps the first one's key (its fp)
    const HM6 = require('../src/hosts.js').HostManager; const d6 = path.join(tmp, 'hosts-edges'); fs.mkdirSync(d6, { recursive: true }); const hm6 = new HM6({ dataDir: d6 });
    const told6 = []; hm6.onDeviceKeyLearned = (h, f) => told6.push(f && f.fp);
    const e1 = hm6.add({ name: 'edge-remove', host: 'e1.example', user: 'u' }); hm6.noteDeviceKey(e1, 'learned', { pub: A.publicKey, fp: 'fpE1', road: 'ssh' });
    hm6.graduateDial(e1); hm6.ungraduateDial(e1); hm6.noteDeviceKey(e1, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:x', road: 'ssh' }); hm6.ungraduateDial(e1);
    const r6 = hm6.get(e1);
    ok(r6.deviceKey && r6.deviceKey.pub === A.publicKey && r6.deviceKeyRefused, 'a second Remove dial-out (another tab) on a machine that no longer dials out changes nothing: its ssh pin and its open refusal stay', { pin: !!r6.deviceKey, refused: !!r6.deviceKeyRefused });
    const e2 = hm6.add({ name: 'edge-pending', host: 'e2.example', user: 'u' }); hm6.noteDeviceKey(e2, 'learned', { pub: A.publicKey, fp: 'fpE2', road: 'ssh' });
    hm6.forgetDeviceKey(e2); hm6.graduateDial(e2); hm6.noteDeviceKey(e2, 'learned', { pub: B.publicKey, fp: 'fpB', road: 'dial' }); hm6.ungraduateDial(e2); hm6.noteDeviceKey(e2, 'learned', { pub: 'pubE2b', fp: 'fpE2b', road: 'ssh' });
    ok(told6.includes('fpE2b'), 'a Forget still pending on the ssh road when the machine is upgraded survives dial-out: the ssh road\'s next key is told', told6);
    const e3 = hm6.add({ name: 'edge-twice', host: 'e3.example', user: 'u' }); hm6.noteDeviceKey(e3, 'learned', { pub: A.publicKey, fp: 'fpE3', road: 'ssh' });
    hm6.graduateDial(e3); hm6.noteDeviceKey(e3, 'learned', { pub: B.publicKey, fp: 'fpB3', road: 'dial' }); hm6.forgetDeviceKey(e3); hm6.noteDeviceKey(e3, 'learned', { pub: 'pubB4', fp: 'fpB4', road: 'dial' }); hm6.forgetDeviceKey(e3);
    ok(hm6.get(e3).sshKeyForgot && hm6.get(e3).sshKeyForgot.fp === 'fpE3', 'a second Forget while dialing out keeps the first one\'s ssh key (the same key back is no news)', hm6.get(e3).sshKeyForgot); }
  { // AT THE RESTACK (主开发, three as if musts): (1) a rollback knows its own attempt; (2) while an upgrade runs, a second press
    // and Remove dial-out WAIT (never the remove-then-upgrade recipe, which would kill the agent the installer is writing); (3) a
    // pending «Let in without a key» is carried across the upgrade as a pending Forget is
    const HM7 = require('../src/hosts.js').HostManager;
    const run7 = (HM, tag) => {
      const d7 = path.join(tmp, 'hosts-attempt-' + tag); fs.mkdirSync(d7, { recursive: true }); const hm7 = new HM({ dataDir: d7 }); const told = []; hm7.onDeviceKeyLearned = (h, f) => told.push(f && f.fp);
      const id7 = hm7.add({ name: 'att-' + tag, host: 'att.example', user: 'u' }); hm7.noteDeviceKey(id7, 'learned', { pub: A.publicKey, fp: 'fpA7', road: 'ssh' });
      const a = hm7.beginGraduation(id7, { dialRoot: '$HOME/.vibespace/device@one' });
      let e2 = null; try { hm7.beginGraduation(id7, { dialRoot: '$HOME/.vibespace/device@one' }); } catch (e) { e2 = e; }
      const running = hm7.upgradeRunning(id7);
      a.finish(); const dev = hm7.get(id7).deviceId; a.rollBack(); // a finished attempt never rolls back
      const kept = hm7.get(id7).deviceId === dev && !!dev;
      // (3) a pending «Let in without a key» across an upgrade rolled back
      const id8 = hm7.add({ name: 'unp-' + tag, host: 'unp.example', user: 'u' }); hm7.noteDeviceKey(id8, 'learned', { pub: A.publicKey, fp: 'fpA8', road: 'ssh' });
      hm7.forgetDeviceKey(id8); hm7.forgetDeviceKey(id8, { unproven: true });
      const b = hm7.beginGraduation(id8, { dialRoot: '$HOME/.vibespace/device@two' }); b.rollBack();
      const unp = !!hm7.get(id8).deviceKeyUnprovenAt; hm7.noteDeviceKey(id8, 'learned', { pub: 'pubC8', fp: 'fpC8', road: 'ssh' });
      return { code2: e2 && e2.code, words2: e2 && e2.message, running, kept, unp, told: told.includes('fpC8') };
    };
    const r7 = run7(HM7, 'real');
    ok(r7.code2 === 'upgrade-running' && /wait for it/.test(r7.words2 || '') && r7.running, 'WHILE an upgrade runs, a second press is told to WAIT (code upgrade-running) — never «Remove dial-out first», which would kill the agent its installer is writing', r7);
    ok(r7.kept, 'a rollback knows its own attempt: once the attempt has finished, its rollback touches nothing (a later upgrade is never wiped)', r7);
    ok(r7.unp && r7.told, 'a pending «Let in without a key» is carried across the upgrade and its rollback: the ssh road\'s next key is told', r7);
    const MW3 = read('src/server/mounts-plugins-wiring.js');
    ok(MW3.includes("      if (hosts.upgradeRunning(h.id)) return res.status(409).json({ error: 'an upgrade of this machine is running — wait for it, then remove dial-out', code: 'upgrade-running' });") && MW3.includes('    attempt.finish(); // the attempt ends here') && MW3.includes("  } catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // a held machines list keeps its 503 and its name (the page words it); every other refusal 400 with its code as well as its words"), 'WIRING: Remove dial-out refuses BY NAME while an upgrade runs (before any teardown); the attempt finishes after its install; the route answers the refusal\'s code with its words (pinned by their lines: the route runs ssh)');
    const RUN = "    if (this.upgradeRunning(id)) throw Object.assign(new Error('an upgrade of this machine is running — wait for it'), { code: 'upgrade-running' });\n";
    const OPEN = '      rollBack: () => { if (!open()) return; this._upgrades.delete(id); this.ungraduateDial(id); },\n';
    const UNP = "    const pending = setAside && (h.deviceKeyForgotAt || h.deviceKeyUnprovenAt) ?";
    ok([RUN, OPEN, UNP].every((a) => HSRC.includes(a)), 'control: the running refusal, the attempt\'s mark, the carried mark (the anchors)');
    const MA7 = mutantCopies('device-key-attempt', REPO);
    const m1 = run7(MA7.load('src/hosts.js', HSRC.replace(RUN, ''), 'no-running-words').HostManager, 'm1');
    ok(m1.code2 === 'already-dial-out', 'RED CONTROL: without the running refusal a second press during an upgrade is told «Remove dial-out first» — the recipe that kills the agent mid-install', m1.code2);
    const m2 = run7(MA7.load('src/hosts.js', HSRC.replace(OPEN, '      rollBack: () => { this._upgrades.delete(id); this.ungraduateDial(id); },\n'), 'no-mark').HostManager, 'm2');
    ok(!m2.kept, 'RED CONTROL: a rollback that does not check its mark undoes a finished upgrade', m2.kept);
    const m3 = run7(MA7.load('src/hosts.js', HSRC.replace(UNP, '    const pending = setAside && (h.deviceKeyForgotAt) ?'), 'no-unproven-carry').HostManager, 'm3');
    ok(!m3.told, 'RED CONTROL: without the carried mark the ssh road\'s next key after a rolled-back upgrade is pinned in silence', m3);
    for (const x of copiesCensus(MA7.files, MA7.dir, REPO, { minCopies: 3, label: 'mutant-copy (attempt): ' })) ok(x.pass, x.name, x.detail); }
  { // A MEETING WITH THE RELEASE (B-a31a): the two-minute probe patches an ssh row's status face IN PLACE (mounts-live
    // patchHostFace) and took the row's FIRST state chip as the face's — the device-key and hub-key chips beside it were
    // swapped for «testing…» and removed within seconds of a page load. A key-pin chip is not the face's to replace
    class FE { constructor(cls, txt) { this.className = cls; this.children = []; this.parent = null; this._a = {}; this.textContent = txt || ''; }
      getAttribute(k) { return k in this._a ? this._a[k] : null; } setAttribute(k, v) { this._a[k] = String(v); }
      appendChild(c) { c.parent = this; this.children.push(c); return c; }
      insertBefore(c, ref) { c.parent = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
      replaceWith(n) { const p = this.parent, i = p.children.indexOf(this); n.parent = p; p.children[i] = n; this.parent = null; }
      remove() { const p = this.parent; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parent = null; } }
      after(n) { const p = this.parent, i = p.children.indexOf(this); n.parent = p; p.children.splice(i + 1, 0, n); } }
    const pinCase = (M) => {
      const row = new FE('mounts-row'); const top = row.appendChild(new FE('mounts-row-top mounts-host-top'));
      const dot = top.appendChild(new FE('mounts-dot mounts-dot-ok')); dot.setAttribute('title', '31ms');
      top.appendChild(new FE('mounts-name', 'studio'));
      const pin = top.appendChild(new FE('host-state-chip host-state-error host-pin-chip', 'device key changed'));
      top.appendChild(new FE('mounts-row-actions'));
      const F = { dot: 'ok', dotTip: '31ms', badge: '', chip: null, errline: null }, T = { ...F, dot: 'pending', dotTip: 'Checking…', chip: { kind: 'pending', text: 'testing…', title: '' } };
      const makers = { chipOf: (c) => new FE('host-state-chip host-state-' + c.kind, c.text), badgeOf: () => null };
      M.patchHostFace(row, F, T, makers); const afterTesting = top.children.includes(pin);
      M.patchHostFace(row, T, { ...F, dotTip: '40ms' }, makers); const afterOk = top.children.includes(pin);
      return { afterTesting, afterOk, faceChips: top.children.filter((k) => /host-state-chip/.test(k.className) && !/host-pin-chip/.test(k.className)).length };
    };
    const MLsrc = read('src/lib/mounts-live.js');
    const ML = await import(pathToFileURL(path.join(REPO, 'src/lib/mounts-live.js')).href);
    const pc = pinCase(ML);
    ok(pc.afterTesting && pc.afterOk && pc.faceChips === 0, 'a probe patching an ssh row\'s face («testing…», then answered) leaves the device-key chip beside it: a key-pin chip is never the face\'s to replace', pc);
    const SMk = read('src/lib/sidebar-mounts.js');
    ok((SMk.match(/top\.appendChild\(pinChip\('error'/g) || []).length === 2, 'WIRING: the device-key and hub-key chips are made as key-pin chips (both)');
    const FACECHIP = "  const oldChip = top.children ? [...top.children].find((k) => hasClass(k, 'host-state-chip') && !hasClass(k, 'host-pin-chip')) : null;";
    ok(MLsrc.includes(FACECHIP), 'control: the face patch skips key-pin chips (the anchor)');
    const mSrc = MLsrc.replace(FACECHIP, "  const oldChip = kid(top, 'host-state-chip');"); // stale-pins: kept — the RED copy rebuilds the release's lookup on purpose
    const mPath = path.join(tmp, 'mounts-live-release-face.mjs'); fs.writeFileSync(mPath, mSrc);
    const pcM = pinCase(await import(pathToFileURL(mPath).href));
    ok(!pcM.afterTesting, 'RED CONTROL: the release\'s face patch (the first state chip) swaps the device-key chip for «testing…» at the first probe', pcM); }
  { const r1 = R.H.noteDeviceKey(R.id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:same', road: 'ssh' }); const r2 = R.H.noteDeviceKey(R.id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:same', road: 'dial' }); const r3 = R.H.noteDeviceKey(R.id, 'refused', { code: 'device-key-mismatch', fp: 'SHA256:same', road: 'dial' }); ok(r1 && r2 && !r3 && R.H.get(R.id).deviceKeyRefused.road === 'dial', 'a refusal\'s episode is per road: the same code and key on the other road is a new episode, on the same road it is not', { r1, r2, r3 }); }
}

console.log('— ④ For you: ONE urgent item per machine for a refused device key, beside the ssh one —');
{
  const { UserTodoManager } = require('../src/user-todos.js');
  const HW = require('../src/server/host-key-watch.js');
  const dir = path.join(tmp, 'fy'); fs.mkdirSync(dir);
  const todos = new UserTodoManager({ dataDir: dir });
  const open = () => todos._state.items.filter((t) => t.status === 'open' && t.sessionKey === 'machines');
  const w = HW.create({ userTodos: todos, dataDir: dir });
  const h = { id: 'host-dial-mac1', name: 'mac1', transport: 'dial' };
  w.refused(h, { kind: 'device', code: 'device-key-mismatch', fp: 'SHA256:dev', pinned: true }); w.refused(h, { kind: 'device', code: 'device-key-mismatch', fp: 'SHA256:dev', pinned: true });
  w.refused(h, { fp: 'SHA256:ssh', pinned: true });
  const dev = open().filter((t) => /device key/.test(t.text));
  ok(open().length === 2 && dev.length === 1 && dev[0].urgency === 'urgent' && dev[0].text === 'mac1: its agent did not prove the device key VibeSpace pinned — VibeSpace did not connect' && /SHA256:dev/.test(dev[0].detail) && /make a new pairing command/.test(dev[0].detail) && /forget its key/.test(dev[0].detail),
    'a refused device key files ONE urgent item (its doors named: a new pairing command / forget the key); a repeat files nothing; the ssh host key\'s item is its own', open().map((t) => t.text));
  w.decided(h, 'device');
  ok(open().length === 1 && !/device key/.test(open()[0].text), 'a new pairing / a forgotten key resolves the device item only');
  const DFm = require('../src/dial-facts.js');
  const recs = { pairing: { transport: 'dial', deviceId: 'd1' }, 'dial-out': { transport: 'ssh', deviceId: 'grad-1', graduated: true }, none: { transport: 'ssh' } };
  ok(Object.entries(recs).every(([door, r]) => DFm.pairingDoorOf(r) === door), 'PURE pairingDoorOf: a dialed row draws «Pairing command…», an ssh row upgraded to dial-out draws Dial-out, a plain ssh row neither');
  const W3 = (door, code = 'device-key-mismatch') => HW.itemOf({ machine: 'srv', fp: 'x', kind: 'device', code, door }).detail;
  { // lane lg-remote-hardening (key-refused, the third read): the item names the row's OWN door for every hub code
    const H = (door, code) => HW.itemOf({ machine: 'srv', fp: 'x', kind: 'device', code, door }).detail;
    const SM = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
    ok(/Let it pin this hub's key/.test(H('dial-out', 'hub-key-mismatch')) && ['hub-key-missing', 'hub-key-shape', 'hub-signature-bad'].every((c) => /Remove dial-out, then Upgrade to dial-out/.test(H('dial-out', c)) && !/Let it pin/.test(H('dial-out', c)))
      && ['pairing', 'dial-out', 'none'].every((d) => /could not read it to prove it/.test(H(d, 'hub_identity_unavailable')) && !/Pairing command|Let it pin|Remove dial-out/.test(H(d, 'hub_identity_unavailable')))
      && /Pairing command/.test(H('pairing', 'hub-key-missing')) && /Make a new hub key/.test(H('dial-out', 'hub_identity_lost'))
      && /dr\.code === 'hub_identity_unavailable' \? tr\('This hub could not read its own key to prove it to this machine\./.test(SM) && /: isDialRow \? tr\('This machine refused this hub\\'s key: it pins the hub it was paired with\. If that is this hub, pair it again \(Pairing command…\)\.'\) : tr\('This machine refused this hub\\'s proof of its key\. Make a new pairing: Dial-out → Remove dial-out, then Upgrade to dial-out\.'\)/.test(SM),
      'key-refused (the third read): the For-you item and the Host key dialog name the doors the ROW draws — «Let it pin this hub\'s key» for a mismatch on an ssh row only; a missing / malformed / unsigned proof on a dial-out row is a new pairing (Remove dial-out, then Upgrade); a key this hub cannot read names no door on any row; a dialed row pairs again; a lost key makes a new hub key');
  }
  ok(/Pairing command/.test(W3('pairing')) && !/Pairing command/.test(W3('dial-out')) && /Remove dial-out, then Upgrade to dial-out/.test(W3('dial-out')) && !/Pairing command|Dial-out/.test(W3('none')) && !/sessions over ssh|nothing connects/.test(W3('none')), 'each item names the door its ROW draws: a dialed row its pairing command, a dial-out row Remove dial-out then Upgrade, an ssh row Forget only', [W3('dial-out'), W3('none')]);
  const SM = read('src/lib/sidebar-mounts.js');
  ok(SM.includes("if (pairingDoorOf(h) === 'pairing') actions.append(ibtn(MI.retry, tr('Pairing command") && SM.includes("if (pairingDoorOf(h) !== 'pairing') actions.append(ibtn(MI.bolt, h.graduated") && SM.includes("tr('Remove dial-out (keep the ssh machine)')") && SM.includes("tr('Upgrade to dial-out')"), 'the row draws its doors by the SAME predicate the words read, and its dial-out dialog holds the two buttons the words name');
  const gw = HW.create({ userTodos: todos, dataDir: dir });
  gw.refused({ id: 'host-g1', name: 'g1', transport: 'ssh', deviceId: 'grad-g1' }, { kind: 'device', code: 'device-key-mismatch', fp: 'SHA256:g', pinned: true });
  const gi = open().find((t) => t.action && t.action.hostId === 'host-g1');
  ok(gi && /Remove dial-out/.test(gi.detail) && !/Pairing command/.test(gi.detail), 'a GRADUATED machine\'s filed item names the dial-out door its ssh row draws, never «Pairing command…»', gi && gi.detail);
  gw.decided({ id: 'host-g1', name: 'g1' }, 'device', { notice: true });
  const ln = HW.learnedItemOf({ machine: 'g', fp: 'y', door: 'dial-out' }).detail;
  ok(/Remove dial-out, then Upgrade to dial-out/.test(ln) && !/Pairing command/.test(ln), 'the «pinned its new key» notice names the dial-out door on a graduated row too', ln);
  ok(/no usable device key and signature/.test(W3('pairing', 'device-key-shape')), 'a malformed answer is said as one, never «answered with the key ?»');
  ok(SM.includes("tr('no device key proved')") && SM.includes("if (h.deviceKey || h.deviceKeyRefused || h.deviceKeyForgotAt) deviceSection();"), 'the row\'s chip says «no device key proved» when a forgotten key was asked for, and every row\'s Host key dialog shows a forgotten key\'s ask');
  ok(w.learned(h, { fp: 'SHA256:new' }) === true, 'the key the open pin took is filed');
  const note = open().filter((t) => /pinned its new device key/.test(t.text));
  ok(note.length === 1 && note[0].urgency === 'normal' && /SHA256:new/.test(note[0].text) && /new pairing command/.test(note[0].detail), '…as ONE notice naming the key, with the door for «that was not me»', note.map((t) => [t.text, t.urgency]));
  const nNote = () => open().filter((t) => /pinned its new device key/.test(t.text)).length;
  w.refused(h, { kind: 'device', code: 'device-key-mismatch', fp: 'SHA256:other', pinned: true }); w.decided(h, 'device');
  ok(nNote() === 1, '…a refusal or a proof later does not take the notice (it is the only word naming the key the open pin took)');
  w.learned(h, { fp: 'SHA256:newer' });
  ok(nNote() === 1 && open().some((t) => /SHA256:newer/.test(t.text)), '…a newer notice replaces it (one per machine)');
  w.decided(h, 'device', { notice: true });
  ok(nNote() === 0, '…and a removal, a new pairing or a Forget takes it');
  const d3 = HW.itemOf({ machine: 'm', fp: null, kind: 'device', code: 'device-key-missing', pinned: false, dial: true }).detail;
  ok(/Let in without a key/.test(d3) && /state\/identity\.pem/.test(d3), 'a machine asked for a proof that proves none: the key file is named, and «Let in without a key» is the door for an agent that cannot prove one', d3);
  ok(!/Let in without a key/.test(HW.itemOf({ machine: 'm', fp: 'x', kind: 'device', code: 'device-key-missing', pinned: true, dial: true }).detail), '…never while a key is pinned (that is no open door)');
}

console.log('— ⑤ the route: forgetting a device key is the person\'s act —');
{
  const handlers = {};
  const reg = (m) => (p, ...hs) => { handlers[`${m} ${p}`] = hs[hs.length - 1]; };
  const app = { get: reg('GET'), post: reg('POST'), delete: reg('DELETE'), put: reg('PUT'), patch: reg('PATCH'), use: () => {} };
  const { HostManager } = require('../src/hosts.js');
  fs.mkdirSync(path.join(tmp, 'routes'), { recursive: true });
  const hm = new HostManager({ dataDir: path.join(tmp, 'routes') });
  const id = hm.setDialToken('mac2', 'c'.repeat(64), { name: 'mac2' });
  hm.noteDeviceKey(id, 'learned', { pub: MA.generateKeyPair(C).publicKey, fp: 'x' });
  require('../src/server/exit-routes.js').create({ app, rootDir: tmp, AGENT_BIN_DIR: tmp, activeSessions: new Map(), auth: {}, wss: null, WS_OPEN: 1, bcastAll: () => {}, integrationEnabled: () => false, unpairDialDevice: () => {}, hosts: hm, getExitProxy: () => ({}), getMounts: () => ({}), getPortForwards: () => ({}) });
  const call = async (req) => { const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } }; await handlers['DELETE /api/hosts/:id/device-key']({ params: { id }, query: {}, headers: {}, body: {}, ...req }, res); return res; };
  const r1 = await call({ headers: { authorization: 'Bearer vsst_fixture' } });
  ok(r1.statusCode === 403 && r1.body.code === 'human_only' && hm.get(id).deviceKey, 'an agent\'s bearer cannot forget a device key (human_only) — the pin stays');
  const r2 = await call({});
  ok(r2.statusCode === 200 && !hm.get(id).deviceKey, 'the person\'s request forgets it');
  const r3 = await call({ query: { unproven: '1' }, headers: { authorization: 'Bearer vsst_fixture' } });
  const r4 = await call({ query: { unproven: '1' } });
  ok(r3.statusCode === 403 && r4.statusCode === 200 && r4.body.unproven === true && !hm.get(id).deviceKeyForgotAt, '«Let in without a key» (?unproven=1) is the person\'s act too — a bearer is refused — and it ends the mark', [r3.statusCode, r4.statusCode, r4.body]);
  const r5 = await call({});
  ok(r5.statusCode === 400 && r5.body.code === 'device-key-none', 'a Forget with no key pinned is refused by name (a stale dialog clears nothing)', [r5.statusCode, r5.body]);
}

console.log('— §T the REAL agent\'s legs live in the heavy twin test-device-key-pin-real (B-7e49, 主开发 r2490) —');
{
  const TW = read('scripts/test-device-key-pin-real.mjs'), ME = read('scripts/test-device-key-pin.mjs');
  const HEADS = ['⑥ the REAL agent: this box', '// ④ the REAL agent pins the hub: another hub refused', '// ⑤ the attach child: hello names the hub key'];
  ok(HEADS.every((h) => TW.includes(h)) && HEADS.every((h) => ME.split(h).length - 1 === 1), '§T the twin holds the moved sections by their headings (⑥, ⑦ ④ and ⑤), and this file names each only here, in this pin', HEADS.map((h) => [TW.includes(h), ME.split(h).length - 1]));
  const ES = 'require(' + "'esbuild')", IL = '.install' + 'Local()';   // joined at run time: this pin's own text holds neither
  ok(!ME.includes(ES) && !ME.includes(IL) && TW.includes(ES) && TW.includes(IL), '§T this file builds no agent bundle and starts no agent; the twin does both', [ME.includes(ES), ME.includes(IL), TW.includes(ES), TW.includes(IL)]);
  ok(/\{ name: 'test-device-key-pin-real', tier: 'heavy',/.test(read('scripts/ci.mjs')), '§T the twin is a heavy row (scripts/ci.mjs)');
}

console.log('— ⑦ D3 half b: THE HUB PROVES ITS KEY (主开发\'s ruling 2026-11-18, four laws) —');
{
  const H = MA.generateKeyPair(C), H2 = MA.generateKeyPair(C), D = MA.generateKeyPair(C), D2 = MA.generateKeyPair(C);
  const nD = MA.newNonce(C), nH = MA.newNonce(C);
  // ① PURE: the one shape, the device's verdicts
  const sig = MA.hubProof(H, D.publicKey, nD, C);
  const T = [
    ['the hub\'s signature over THIS device\'s key and nonce verifies', MA.okVerdict({ hubPub: H.publicKey, devPub: D.publicKey, nonceD: nD, ok: { sigH: sig } }, C).ok === true],
    ['the same signature for ANOTHER machine means nothing (law 1)', MA.okVerdict({ hubPub: H.publicKey, devPub: D2.publicKey, nonceD: nD, ok: { sigH: sig } }, C).code === 'hub-signature-bad'],
    ['… nor for another nonce (a replay)', MA.okVerdict({ hubPub: H.publicKey, devPub: D.publicKey, nonceD: MA.newNonce(C), ok: { sigH: sig } }, C).code === 'hub-signature-bad'],
    ['… nor by another hub key', MA.okVerdict({ hubPub: H2.publicKey, devPub: D.publicKey, nonceD: nD, ok: { sigH: sig } }, C).code === 'hub-signature-bad'],
    ['the door signs nothing but the shape: a nonce that is no nonce ⇒ no signature', MA.hubProof(H, D.publicKey, 'not-a-nonce', C) === null && MA.hubProof(H, 'AAAA', nD, C) === null],
    ['pinned, a hello with no hub key ⇒ hub-key-missing (no downgrade)', MA.helloVerdict({ hello: { nonceH: nH }, pinned: H.publicKey }, C).code === 'hub-key-missing'],
    ['pinned, another hub key ⇒ hub-key-mismatch', MA.helloVerdict({ hello: { hubPub: H2.publicKey, nonceH: nH }, pinned: H.publicKey }, C).code === 'hub-key-mismatch'],
    ['nothing pinned, an old hello ⇒ the old greeting (not mutual)', MA.helloVerdict({ hello: {}, pinned: null }, C).mutual === false],
  ];
  const bad = T.filter(([, v]) => !v);
  ok(!bad.length, `PURE: ${T.map(([n]) => n).join(' · ')}`, bad.map(([n]) => n));
  // ② law 2 + law 3 in the store: signForMachine signs only for the record's OWN pinned key; a lost key is never re-minted in silence
  const HT = require('../src/server/host-tokens.js');
  const htDir = path.join(tmp, 'ht'); fs.mkdirSync(htDir, { recursive: true });
  let pinnedAnywhere = false;
  const ht = HT.create({ dataDir: htDir, anyHubPin: () => pinnedAnywhere, log: { log() { }, warn() { } } });
  const id1 = ht.identity(), id1b = ht.identity();
  const kf = path.join(htDir, 'agentd', 'hub-identity.pem');
  ok(MA.isPub(id1.publicKey) && id1.publicKey === id1b.publicKey && (fs.statSync(kf).mode & 0o777) === 0o600, 'the hub\'s identity is minted ONCE (0600 before the vault is set up) and read back the same');
  const rec = { id: 'host-x', deviceKey: { pub: D.publicKey } };
  const good = ht.signForMachine(rec, D.publicKey, nD);
  const thr2 = (f) => { try { f(); return null; } catch (e) { return e; } };
  const e1 = thr2(() => ht.signForMachine(rec, D2.publicKey, nD)), e2 = thr2(() => ht.signForMachine({ id: 'host-y' }, D.publicKey, nD)), e3 = thr2(() => ht.signForMachine(rec, D.publicKey, 'x'));
  ok(MA.okVerdict({ hubPub: id1.publicKey, devPub: D.publicKey, nonceD: nD, ok: good }, C).ok && e1 && e1.code === 'not_this_machine' && e2 && e2.code === 'not_this_machine' && e3 && e3.code === 'bad_request',
    'law 2: the door signs for a conversation\'s OWN machine only — another machine\'s key, a record that pins none, a nonce that is none: each refused by name', [e1, e2, e3].map((e) => e && e.code));
  fs.unlinkSync(kf); pinnedAnywhere = true;
  const e4 = thr2(() => ht.identity());
  ok(e4 && e4.code === 'hub_identity_lost' && !fs.existsSync(kf), 'law 3: the key LOST while a machine pins this hub ⇒ hub_identity_lost by name — never a silent new key every machine would refuse');
  { // THE CURE, must B (主开发's verdict of 2026-11-18): every pin counted before a key is minted — a lost key with pins standing is
    // refused BY NAME with its recovery, the machines named; no pin ⇒ the first key is minted
    const d3 = path.join(tmp, 'ht-named'), dz = path.join(tmp, 'ht-none'); fs.mkdirSync(d3, { recursive: true }); fs.mkdirSync(dz, { recursive: true });
    const eN = thr2(() => HT.create({ dataDir: d3, anyHubPin: () => ['studio-mac', 'lab-pi'], log: { log() { }, warn() { } } }).identity());
    let z = null; try { z = HT.create({ dataDir: dz, anyHubPin: () => [], log: { log() { }, warn() { } } }).identity(); } catch { }
    const wired = [read('server.js'), read('src/server/mounts-plugins-wiring.js')].every((t) => t.includes("anyHubPin: () => (hosts.held() ? true : hosts.list().filter((h) => !!h.hubPinned).map((h) => h.name || h.id))"));
    // the move onto bl-jobs' held store: a HELD machines list is unknown, so it counts as a pin — both wirings answer `true` (host-tokens'
    // «a pin exists»); [''] would not do: host-tokens drops an empty name, and a key would be minted in silence while held
    const dh = path.join(tmp, 'ht-held'), de = path.join(tmp, 'ht-empty-name'); fs.mkdirSync(dh, { recursive: true }); fs.mkdirSync(de, { recursive: true });
    const eH = thr2(() => HT.create({ dataDir: dh, anyHubPin: () => true, log: { log() { }, warn() { } } }).identity());
    let zE = null; try { zE = HT.create({ dataDir: de, anyHubPin: () => [''], log: { log() { }, warn() { } } }).identity(); } catch { }
    ok(!!eN && eN.code === 'hub_identity_lost' && /these machines pin it: studio-mac, lab-pi/.test(eN.message) && /then re-pair them/.test(eN.message) && eN.message.slice(0, 160).includes('studio-mac, lab-pi') && JSON.stringify(eN.machines) === '["studio-mac","lab-pi"]' && !fs.existsSync(path.join(d3, 'agentd', 'hub-identity.pem')) && !!z && MA.isPub(z.publicKey) && wired,
      'must B: every pin is counted (both wirings hand the pinning machines\' names) — a lost key with pins standing is refused BY NAME with its recovery, the machines named FIRST (the card keeps 160 characters), never replaced quietly; no pin ⇒ the first key is minted', eN && eN.message);
    ok(!!eH && eH.code === 'hub_identity_lost' && !fs.existsSync(path.join(dh, 'agentd', 'hub-identity.pem')) && wired, 'a HELD machines list (hosts.json unread) counts as a pin — both wirings answer true, and a lost key is refused by name, never minted while the pins are unread', eH && eH.message);
    ok(!!zE && MA.isPub(zE.publicKey), 'CONTROL: [\'\'] is no pin (host-tokens drops an empty name) — the wiring that answered it while held minted a key in silence', !!zE);
  }
  const id2 = ht.renewIdentity();
  ok(MA.isPub(id2.publicKey) && id2.publicKey !== id1.publicKey && ht.identity().publicKey === id2.publicKey, '… a new key is the person\'s act (renewIdentity)');
  // B-574d (lane nl-paired, 主开发 r4752): THE KEY'S BYTES ARE ON DISK BEFORE ITS NAME (before the vault is set up). The renew is the
  // secret family's replace (src/secret-file.js replaceShredding: synced, renamed, the RETIRED key's bytes overwritten in place); the
  // first mint's temp is synced (src/fd-close.js renameSynced) before its link. A sync REFUSED (placed: fs.fsyncSync throws EIO) is a
  // FAILED WRITE: a first mint throws and leaves no key and no temp; a renew throws and the old key stands byte for byte.
  // RED (a copy): the release's unsynced roads — the placed refusal is never met, and the retired key's bytes stay in its inode.
  {
    const placedSync = (code, fn) => { const s0 = fs.fsyncSync; let n = 0; fs.fsyncSync = function () { n++; throw Object.assign(new Error(`${code}: a placed sync refusal`), { code }); }; try { return { r: fn(), n }; } catch (e) { return { threw: (e && e.code) || String(e), n }; } finally { fs.fsyncSync = s0; } };
    const keyScene = (H, tag) => {
      const d = path.join(tmp, 'ht-sync-' + tag); fs.mkdirSync(d, { recursive: true });
      const h = H.create({ dataDir: d, anyHubPin: () => [], log: { log() { }, warn() { } } });
      const ad = path.join(d, 'agentd'), k = path.join(ad, 'hub-identity.pem');
      const others = () => fs.readdirSync(ad).filter((f) => f !== 'hub-identity.pem').length;
      const first = placedSync('EIO', () => h.identity());
      const firstKey = fs.existsSync(k), firstLeft = others();
      const made = h.identity(), old = fs.readFileSync(k, 'utf8');
      const oldFd = fs.openSync(k, 'r');   // the inode the renew retires, opened before it
      const renew = placedSync('EIO', () => h.renewIdentity());
      const kept = fs.readFileSync(k, 'utf8') === old;
      const id3 = h.renewIdentity();
      const retired = Buffer.alloc(Buffer.byteLength(old)); fs.readSync(oldFd, retired, 0, retired.length, 0); fs.closeSync(oldFd);
      return { first: first.threw || 'landed', firstN: first.n, firstKey, firstLeft, renew: renew.threw || 'landed', renewN: renew.n, kept,
        renewed: id3.publicKey !== made.publicKey && fs.readFileSync(k, 'utf8') !== old && h.identity().publicKey === id3.publicKey, shredded: retired.toString('utf8') !== old, left: others() };
    };
    const r = keyScene(HT, 'real');
    ok(r.first === 'EIO' && r.firstN === 1 && !r.firstKey && r.firstLeft === 0 && r.renew === 'EIO' && r.renewN === 1 && r.kept && r.renewed && r.shredded && r.left === 0,
      'B-574d: this hub\'s key is SYNCED before its name — a first mint under a refused sync (EIO, placed) leaves no key and no temp; a renew under one throws and the old key stands; the renew that lands overwrites the RETIRED key\'s bytes in place', r);
    const XH = mutantCopies('hub-key-unsynced', REPO).load('src/server/host-tokens.js', anchored(read('src/server/host-tokens.js'), "      if (replace) { replaceShredding(f, pem); return pem; }\n      FC.renameSynced(tmp + '.w', tmp, pem, { mode: 0o600, where: \"this hub's key (its first mint)\", say: (l) => log.warn?.(`[hub-key] ${l}`) });\n", "      fs.writeFileSync(tmp, pem, { mode: 0o600 });   // MUTANT: the release's unsynced roads\n      if (replace) { fs.renameSync(tmp, f); return pem; }\n", 'hub-key-unsynced'), 'hub-key-unsynced');
    const x = keyScene(XH, 'red');
    ok(x.first === 'landed' && x.firstN === 0 && x.firstKey && x.renew === 'landed' && x.renewN === 0 && !x.kept && !x.shredded, 'CONTROL (the release\'s unsynced roads, in a copy): no sync asked — the placed refusal is never met, the new key takes its name unsynced, the retired key\'s bytes stay in its inode — red', x);
  }
  // ②b THE VAULT ROAD (the reader's must 1): a LAWFUL entry — the pre-vault key ADOPTED into the vault (the same key: the machines
  // that pinned it keep working), read back from it, a locked vault ⇒ vault_locked
  {
    const VE = require('../src/server/vault-engine.js');
    const vd = path.join(tmp, 'vault-hub'); fs.mkdirSync(path.join(vd, 'agentd'), { recursive: true });
    const pre = MA.generateKeyPair(C);
    fs.writeFileSync(path.join(vd, 'agentd', 'hub-identity.pem'), pre.privateKeyPem, { mode: 0o600 });
    const vht = HT.create({ dataDir: vd, log: { log() { }, warn() { } } });
    const ve = VE.create({ dataDir: vd, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
    const su = await ve.setup('correct horse battery staple', {});
    let a = null, aErr = null; try { a = vht.identity(); } catch (e) { aErr = e; }
    let b = null; try { b = vht.identity(); } catch { }
    ok(su && su.ok && a && a.publicKey === pre.publicKey && b && b.publicKey === pre.publicKey && !fs.existsSync(path.join(vd, 'agentd', 'hub-identity.pem')), 'the vault set up: the pre-vault key is ADOPTED into its entry (host:hub-identity — a lawful name), the same key read back, the file gone', aErr && aErr.code);
    try { ve.lock('door'); } catch { }
    const eL = thr2(() => vht.identity());
    ok(eL && eL.code === 'vault_locked', 'the vault LOCKED ⇒ vault_locked by name — the hub sends no hello under a guess');
    try { ve.close(); } catch { }
  }
  // ③ the door's route: a job / unknown token resolves no session ⇒ refused; the session's machine is what the door asks about
  const handlers = {};
  const reg = (m) => (p, ...hs) => { handlers[`${m} ${p}`] = hs[hs.length - 1]; };
  const app = { get: reg('GET'), post: reg('POST'), delete: reg('DELETE'), put: reg('PUT'), patch: reg('PATCH'), use: () => {} };
  const asked = [];
  const sessions = new Map([['s1', { agentToken: 'vsst_' + 'a'.repeat(40), _agentdSession: true, host: 'host-x', name: 'c1' }]]);
  require('../src/routes/vault.js').registerVaultRoutes(app, { vault: { state: () => 'not_set_up' }, activeSessions: sessions, linkTokenFor: () => 'vsht_x', linkSignFor: (k, dp, n) => { asked.push(k); return ht.signForMachine(k === 'host-x' ? rec : null, dp, n); }, hubPubFor: () => id2.publicKey });
  const call = async (key, req) => { const res = { statusCode: 200, body: null, set() { }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } }; await handlers[key]({ params: {}, query: {}, headers: {}, body: {}, ...req }, res); return res; };
  const rJob = await call('POST /api/agent/vault/link-sign', { headers: { authorization: 'Bearer jbt_' + 'b'.repeat(40) }, body: { devPub: D.publicKey, nonceD: nD } });
  const rOk = await call('POST /api/agent/vault/link-sign', { headers: { authorization: 'Bearer vsst_' + 'a'.repeat(40) }, body: { devPub: D.publicKey, nonceD: nD } });
  const rOther = await call('POST /api/agent/vault/link-sign', { headers: { authorization: 'Bearer vsst_' + 'a'.repeat(40) }, body: { devPub: D2.publicKey, nonceD: nD } });
  const rTok = await call('GET /api/agent/vault/link-token', { headers: { authorization: 'Bearer vsst_' + 'a'.repeat(40) } });
  ok(rJob.statusCode === 401 && rOk.statusCode === 200 && MA.okVerdict({ hubPub: id2.publicKey, devPub: D.publicKey, nonceD: nD, ok: rOk.body }, C).ok && rOther.statusCode === 403 && rOther.body.code === 'not_this_machine' && asked.every((k) => k === 'host-x') && rTok.body.hubPub === id2.publicKey,
    'the signing door: a job token gets nothing; the conversation\'s own machine gets a signature that verifies; another machine\'s key ⇒ 403 not_this_machine; the link-token answer names the hub\'s PUBLIC key', [rJob.statusCode, rOk.statusCode, rOther.statusCode, rTok.body && Object.keys(rTok.body)]);
  // THE CURE, must A's other half: a PAIRED machine while the vault is locked — what works, said exactly. A running link is not cut
  // (the hub's key is read at a connect, never during a link); a new connect waits, refused BY NAME (vault_locked) in words the
  // page's chip turns into «unlock the vault», and no hello goes under a guess; after the unlock the next connect opens
  {
    const VE = require('../src/server/vault-engine.js');
    const vd = path.join(tmp, 'vault-paired'); fs.mkdirSync(path.join(vd, 'agentd'), { recursive: true });
    const vht = HT.create({ dataDir: vd, log: { log() { }, warn() { } } });
    const ve = VE.create({ dataDir: vd, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
    const PW = 'correct horse battery staple';
    await ve.setup(PW, {});
    const dev = await fakeDevice(() => ({}));
    let reads = 0;
    const dmOf = async () => { const s = await new Promise((res, rej) => { const c = net.connect(dev.port, '127.0.0.1'); c.on('connect', () => res(c)); c.on('error', rej); }); return { s, dm: new DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'no-bundle-here.js'), version: '1.1.1', log: () => { }, transport: { kind: 'stream', hostToken: 'vsht_x', getStream: () => s }, devicePin: () => null, hubIdentity: () => { reads++; return vht.identity(); } }) }; };
    const live = await dmOf();
    const o1 = await Promise.race([live.dm.connect().then(() => 'connected', (e) => e), sleep(2500).then(() => 'pending')]);
    const readsAtLink = reads;
    try { ve.lock('door'); } catch { }
    await sleep(150);
    const stillUp = !!(live.dm.status && live.dm.status().connected), again = await live.dm.connect().then(() => 'connected', (e) => e);
    ok(o1 === 'connected' && stillUp && again === 'connected' && reads === readsAtLink, 'a paired machine\'s RUNNING link is not cut when the vault locks — the hub\'s key is read at a connect, never during a link', [o1, stillUp, again, reads, readsAtLink]);
    const hellos0 = dev.hellos.length, fresh = await dmOf();
    const o2 = await Promise.race([fresh.dm.connect().then(() => 'connected', (e) => e), sleep(2500).then(() => 'pending')]);
    // the words the chat's chip (src/lib/chat-status-bar.js) turns into «unlock the vault» — its own pattern, read from its source
    ok(read('src/lib/chat-status-bar.js').includes("/\\(vault_locked\\)|the vault is locked/.test(") && o2 instanceof Error && o2.code === 'vault_locked' && /\(vault_locked\)|the vault is locked/.test(String(o2.message)) && dev.hellos.length === hellos0, 'a NEW connect while the vault is locked waits, refused BY NAME (vault_locked) in the words the chat\'s chip turns into «unlock the vault» — no hello goes under a guess', o2 instanceof Error ? [o2.code, o2.message] : o2);
    try { fresh.dm.stop(); } catch { } try { fresh.s.destroy(); } catch { }
    await ve.unlock(PW);
    const after = await dmOf();
    const o3 = await Promise.race([after.dm.connect().then(() => 'connected', (e) => e), sleep(2500).then(() => 'pending')]);
    ok(o3 === 'connected', '… and after the unlock the next connect opens — nothing was kept as refused', o3 instanceof Error ? o3.message : o3);
    for (const x of [live, after]) { try { x.dm.stop(); } catch { } try { x.s.destroy(); } catch { } }
    dev.srv.close(); try { ve.close(); } catch { }
  }
  // THE CURE, must B: A PIN ALWAYS HAS A DOOR ON ITS OWN ROAD — an ssh row's hub-side refusal opens «Let it pin this hub's key»: its
  // pin removed over ssh by the person, THEN the record and the link cleared; a dialed row keeps its pairing command; the renew
  // awaits its ssh clear before it rebuilds the link (the reader: the next use raced the rm into hub-key-mismatch)
  {
    const WS = read('src/server/mounts-plugins-wiring.js'), SM = read('src/lib/sidebar-mounts.js');
    const r0 = WS.indexOf("app.delete('/api/hosts/:id/hub-pin'"), rSsh = WS.indexOf('await hosts._ssh(h, hubPinRm(h)', r0), rNote = WS.indexOf("hosts.noteDeviceKey(h.id, 'hub-pin-cleared');", r0), rInv = WS.indexOf('hosts.invalidateDevice(h.id)', rNote);
    ok(r0 > 0 && /code: 'human_only'/.test(WS.slice(r0, r0 + 600)) && /code: 'hub-pin-dial'/.test(WS.slice(r0, r0 + 1400)) && rSsh > r0 && rNote > rSsh && rInv > rNote && /\.then\(again, again\)/.test(WS) && WS.includes('try { hosts._ssh(h, hubPinRm(h), { timeoutMs: 15000, fresh: true }).then(again, again);'),
      'the door\'s route: the person\'s act only (a bearer refused), a dialed device sent to its pairing command, the ssh clear AWAITED before the record and the link are cleared — the renew\'s too', [r0, rSsh, rNote, rInv]);
    ok(/if \(hubSide && !isDialRow && \(dr\.code === 'hub-key-mismatch' \|\| \(\/\^hub-\/\.test\(dr\.code \|\| ''\) && pairingDoorOf\(h\) === 'none'\)\)\)/.test(SM) && SM.includes("`/api/hosts/${encodeURIComponent(h.id)}/hub-pin`, { method: 'DELETE' }") && /else if \(hubSide\) body\.append/.test(SM),
      'the card: an ssh row\'s hub-side refusal has its door on ITS road («Let it pin this hub\'s key»); a dialed row keeps «pair it again (Pairing command…)»');
    const HW = require('../src/server/host-key-watch.js');
    const iS = HW.itemOf({ machine: 'old-hub-box', kind: 'device', code: 'hub-key-mismatch', door: 'none' }), iD = HW.itemOf({ machine: 'lab-pi', kind: 'device', code: 'hub-key-mismatch', door: 'pairing' }), iG = HW.itemOf({ machine: 'studio', kind: 'device', code: 'hub-key-mismatch', door: 'dial-out' });
    ok(/Let it pin this hub's key/.test(iS.detail) && !/Pairing command/.test(iS.detail) && /Pairing command/.test(iD.detail) && /Let it pin this hub's key/.test(iG.detail) && !/Pairing command/.test(iG.detail) && /door: DF\.pairingDoorOf\(h\)/.test(read('src/server/host-key-watch.js')),
      'the For-you item names the door its ROW draws (unit 3\'s pairingDoorOf): an ssh machine and one upgraded to dial-out «Let it pin this hub\'s key», a dialed one its pairing command', [iS.detail, iD.detail, iG.detail]);
    const { HostManager } = require('../src/hosts.js');
    const d4 = path.join(tmp, 'hosts-hubpin'); fs.mkdirSync(d4, { recursive: true });
    const hm = new HostManager({ dataDir: d4 });
    const idS = hm.add({ name: 'old-hub-box', user: 'me', host: 'old.example.test' });
    const hS = hm.get(idS); hS.hubPinned = Date.now(); hS.deviceKeyRefused = { code: 'hub-key-mismatch', at: Date.now() };
    const said = []; hm.onHostKeyPinned = (h, kind) => said.push([h.id, kind]);
    // unit 5's cure 2 — ONE MACHINE, TWO AGENTS: the door clears the hub pin under EVERY root of the machine (a machine upgraded
    // to dial-out runs its dial agent under its own root), and a link that opened on one road never clears the other's refusal
    {
      const fnSrc = (WS.match(/const DIAL_ROOT_RE = .*\n/) || [''])[0] + (WS.match(/const hubPinRm = .*\n/) || [''])[0];
      ok(/const DIAL_ROOT_RE = /.test(fnSrc) && /const hubPinRm = /.test(fnSrc), 'control: the door\'s root rule and its command are each one line (found — a reflow fails here, by name)');
      const build = (src) => { try { return new Function(src + 'return hubPinRm;')(); } catch (e) { ok(false, 'the door\'s command builds from its lines', e.message); return () => ''; } };
      const rm = build(fnSrc);
      const plain = rm({ transport: 'ssh' }), grad = rm({ transport: 'ssh', deviceId: 'grad-1', dialRoot: '$HOME/.vibespace/device@hub.example' }), bad = rm({ transport: 'ssh', deviceId: 'g', dialRoot: '$HOME/.vibespace/x"; touch /tmp/x; "' });
      ok(plain === 'rm -f "$HOME/.vibespace/agentd/state/hub.pub"' && grad === 'rm -f "$HOME/.vibespace/agentd/state/hub.pub" "$HOME/.vibespace/device@hub.example/state/hub.pub"' && bad === plain, '«Let it pin this hub\'s key» clears the pin under every root of the machine — the ssh agent\'s and, on a machine upgraded to dial-out, its dial agent\'s (a root of another shape is never put into the shell line)', [plain, grad, bad]); // stale-pins: kept — the expected OUTPUT of hubPinRm for a plain ssh machine (the source builds it now; no literal is pinned)
      const ROOTS = "...(h && DIAL_ROOT_RE.test(String(h.dialRoot || '')) ? [String(h.dialRoot)] : [])";
      ok(fnSrc.includes(ROOTS), 'control: the door names the dial root too (the anchor)');
      const rmOld = build(fnSrc.replace(ROOTS, ''));
      // THE ROOT'S SHAPE IS THE HUB'S OWN: `$HOME/.vibespace/..` (an imported or hand-edited record) is never put into a shell line —
      // here a `rm -f`, at Remove dial-out a `rm -rf` of the home folder — and the door says the root it skipped
      const dots = rm({ transport: 'ssh', deviceId: 'g', dialRoot: '$HOME/.vibespace/..' }), other = rm({ transport: 'ssh', deviceId: 'g', dialRoot: '$HOME/.vibespace/agentd2' });
      ok(dots === plain && other === plain, 'a dial root that is not the hub\'s own shape (`device@<host>`) is left out — `$HOME/.vibespace/..` would name the home folder', { dots, other });
      const OLDRE = 'const DIAL_ROOT_RE = /^\\$HOME\\/\\.vibespace\\/[A-Za-z0-9@._-]+$/;\n'; // stale-pins: kept — the RED copy rebuilds the earlier rule on purpose
      const dotsOld = build(fnSrc.replace(/const DIAL_ROOT_RE = .*\n/, OLDRE))({ transport: 'ssh', deviceId: 'g', dialRoot: '$HOME/.vibespace/..' });
      ok(dotsOld.includes('$HOME/.vibespace/../state/hub.pub'), 'RED CONTROL: the earlier rule admits `$HOME/.vibespace/..` (its command removes $HOME/state/hub.pub)', dotsOld);
      // the move onto 6ce6b8124 meets B-2ca0's own law of the same folder (src/hosts.js dialRootOk — the folder the graduation writes, the host
      // starting with a letter or digit): the teardown asks dialRootOk, and the door's rule here is THE SAME pattern, letter for letter
      const HJS = read('src/hosts.js'), lawOf = (src, re) => ((src.match(re) || [])[1] || null);
      const okLaw = lawOf(HJS, /const dialRootOk = \(r\) => typeof r === 'string' && (\/\^[^\n]*?\$\/)\.test\(r\);/), doorLaw = lawOf(WS, /const DIAL_ROOT_RE = (\/\^[^\n]*?\$\/);/);
      ok(WS.includes("      if (root && require('../hosts.js').dialRootOk(root)) {") && !WS.includes('if (root && /^\\$HOME\\/[\\w@.\\/-]+$/.test(root))') && !!okLaw && okLaw === doorLaw, 'Remove dial-out\'s teardown (`rm -rf` of the root) asks the same rule as the door — B-2ca0\'s dialRootOk, letter for letter — the earlier one admitted `$HOME/.vibespace/..`, the home folder', { okLaw, doorLaw }); // stale-pins: kept — an ABSENCE check of the earlier rule
      ok(WS.includes("  res.json({ success: true, ...(skipped ? { skipped } : {}) });") && /const skippedRootOf = \(h\) => /.test(WS) && WS.includes("return res.json({ success: true, removed: true, ...(root && !DIAL_ROOT_RE.test(root) ? { teardown: 'skipped', skipped: root.slice(0, 120) } : {}) });"), 'the door\'s answer names a root it skipped (never claims it cleared), and so does Remove dial-out\'s (the record cleared, its agent NOT torn down)');
      const gradOld = rmOld({ transport: 'ssh', deviceId: 'grad-1', dialRoot: '$HOME/.vibespace/device@hub.example' });
      ok(gradOld === plain && gradOld !== grad, 'RED CONTROL: the door without the dial root clears only the ssh agent\'s pin on a machine upgraded to dial-out — the dial agent keeps refusing this hub', gradOld);
      const { HostManager: HM2 } = require('../src/hosts.js');
      fs.mkdirSync(path.join(tmp, 'roads-linked'), { recursive: true });
      const hr = new HM2({ dataDir: path.join(tmp, 'roads-linked') });
      const idR = hr.add({ name: 'studio2', host: 'studio2.example', user: 'u' }); hr.graduateDial(idR);
      hr.noteDeviceKey(idR, 'refused', { code: 'hub-key-mismatch', fp: null, road: 'dial' });
      hr.noteDeviceKey(idR, 'linked', { road: 'ssh' });
      const keptR = !!hr.get(idR).deviceKeyRefused;
      hr.noteDeviceKey(idR, 'linked', { road: 'dial' });
      ok(keptR && !hr.get(idR).deviceKeyRefused, 'a link that opened on the ssh road leaves the dial road\'s refusal (and its urgent item) alone; the dial road\'s own link clears it');
    }
    const c1 = hm.noteDeviceKey(idS, 'hub-pin-cleared'), c2 = hm.noteDeviceKey(idS, 'hub-pin-cleared');
    ok(c1 === true && c2 === false && !hm.get(idS).hubPinned && !hm.get(idS).deviceKeyRefused && said.some(([i, k]) => i === idS && k === 'device'),
      'the record\'s act: the pin and the hub-side refusal go, and the machine\'s device item with them (once)', [c1, c2, said]);
  }
  for (const d of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
    const t = read(d), words = ['This machine refused this hub\'s key: it pins the key of the hub it was set up with. If that is this hub, let it pin this hub\'s key again (VibeSpace removes the old pin over ssh).', "{machine} pins the key of the hub it was set up with, and this hub did not prove it. Something may be posing as this hub to it, or it was set up from another hub. If you set it up from this hub, let it pin this hub's key again (Remote → {machine} → Host key… → Let it pin this hub's key).", 'Let it pin this hub\'s key', 'Let {name} pin this hub\'s key?', 'Do this only if {name} was set up with this hub. It then trusts this hub\'s current key.', 'It pins this hub\'s key at its next connection'];
    ok(words.every((w) => t.includes(JSON.stringify(w) + ':')), `${d}: the ssh row's door words have their rows`, words.filter((w) => !t.includes(JSON.stringify(w) + ':')));
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
