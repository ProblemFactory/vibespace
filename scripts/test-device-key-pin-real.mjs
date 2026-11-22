#!/usr/bin/env node
// THE REAL DEVICE AGENT — the heavy twin of test-device-key-pin (B-7e49, lane lg-remote-hardening, 主开发 r2490: a leg that starts a
// real child is heavy; the table stays fast). Moved VERBATIM from test-device-key-pin: ⑥ the REAL agent (an esbuild bundle of
// src/agentd/agentd.js run as this box's local daemon: it proves a key, keeps it across a restart, a reinstall is refused; RED: an
// agent without the proof is refused once pinned) and, from its ⑦ (D3 half b), ④ the REAL agent pins the hub (another hub refused,
// an old hello refused, a new pairing voids the pin, the local road; RED copies) and ⑤ the attach child (its hello names the hub key,
// the hub's signature before any op; RED: a copy that skips the ok). ⑦'s keys, its host-tokens module and its throw-catcher are
// copied with them (three lines); ⑦'s pure, store, vault and route legs stay in the fast file, which pins this one (§T).
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


console.log('— ⑥ the REAL agent: this box\'s local daemon, built from src/agentd/agentd.js —');
{
  const esbuild = require('esbuild');
  const build = (src, out) => esbuild.buildSync({ ...(src ? { stdin: { contents: src, resolveDir: path.join(REPO, 'src/agentd'), sourcefile: 'agentd.js', loader: 'js' } } : { entryPoints: [path.join(REPO, 'src/agentd/agentd.js')] }), bundle: true, platform: 'node', outfile: out, logLevel: 'silent', external: ['node-pty'] });
  const bundle = path.join(tmp, 'agentd.js');
  build(null, bundle);
  const ASRC = read('src/agentd/agentd.js');
  // unit 5 (D3 half b) computes the proof once, before the hub is judged: the hello-ack spreads `ownProof`
  const PROOF = "          ...(ownProof || {}), // lane lg-remote-hardening (D3): { devPub, sigD } over the hub's fresh nonce\n";
  const mutBundle = path.join(tmp, 'agentd-noproof.js');
  build(ASRC.replace(PROOF, ''), mutBundle);
  ok(ASRC.includes(PROOF), 'control: the agent\'s hello-ack carries the proof (the anchor the RED copy drops)');
  const root = path.join(tmp, 'root');
  const saved = process.env.VIBESPACE_AGENTD_ROOT;
  process.env.VIBESPACE_AGENTD_ROOT = root;
  const run = async (bundlePath, pin) => {
    const heard = [], logs = [];
    const dm = new DeviceManager({ dataDir: path.join(tmp, 'data-real'), bundlePath, version: require('../package.json').version, log: (...a) => logs.push(a.join(' ')), machine: 'this-box', devicePin: () => pin, onDeviceKey: (ev, f) => { if (ev !== 'linked') heard.push({ ev, ...f }); } }); // unit 5's 'linked' (the link opened) is no key event
    fs.mkdirSync(path.join(tmp, 'data-real'), { recursive: true });
    let out;
    try { dm.installLocal(); out = await Promise.race([dm.connect().then(() => 'connected', (e) => e), sleep(15000).then(() => 'pending')]); } catch (e) { out = e; }
    finally { try { dm.stop(); } catch { } endDaemonsAndWait(root); }
    return { out, heard, logs };
  };
  try {
    const r1 = await run(bundle, null);
    const keyFile = path.join(root, 'state', 'identity.pem');
    const pem = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : '';
    const learned = r1.heard.find((x) => x.ev === 'learned');
    ok(r1.out === 'connected' && learned && MA.isPub(learned.pub) && /BEGIN PRIVATE KEY/.test(pem) && (fs.statSync(keyFile).mode & 0o777) === 0o600 && MA.publicKeyOf(pem, C) === learned.pub,
      'the real agent mints its key (state/identity.pem, 0600) and proves it over the hub\'s nonce — the hub learns exactly its public half', r1.out instanceof Error ? r1.out.message : { out: r1.out, heard: r1.heard.map((x) => x.ev) });
    const agentLog = (() => { try { return fs.readdirSync(path.join(root, 'state')).filter((n) => /\.log$/.test(n)).map((n) => fs.readFileSync(path.join(root, 'state', n), 'utf8')).join('\n'); } catch { return ''; } })();
    const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    ok(body.length > 40 && !agentLog.includes(body.slice(0, 40)) && !r1.logs.join('\n').includes(body.slice(0, 40)), 'the key\'s bytes are in no log of the agent or the hub');
    const r2 = await run(bundle, learned && learned.pub);
    ok(r2.out === 'connected' && r2.heard.length === 1 && r2.heard[0].ev === 'proved', 'a restart of the agent: the SAME key proved, the pinned link opens', r2.out instanceof Error ? r2.out.message : r2.out);
    fs.unlinkSync(keyFile); // a reinstall: the agent mints a NEW key
    const r3 = await run(bundle, learned && learned.pub);
    ok(r3.out instanceof Error && r3.out.code === 'device-key-mismatch' && r3.heard.some((x) => x.ev === 'refused' && x.code === 'device-key-mismatch'), 'the agent reinstalled (a new key): refused BY NAME until the person forgets the key or pairs again', r3.out instanceof Error ? r3.out.message : r3.out);
    const rM = await run(mutBundle, learned && learned.pub);
    ok(rM.out instanceof Error && rM.out.code === 'device-key-missing', 'RED CONTROL: an agent copy without the proof is refused once its record pins a key (device-key-missing) — never let through', rM.out instanceof Error ? rM.out.message : rM.out);
    // unit 3's cure: a key file that is there but unusable is NEVER replaced by a new key (that would lock the machine out of
    // every hub that pins it, and the old key would be gone)
    const pinNow = MA.publicKeyOf(fs.readFileSync(keyFile, 'utf8'), C);
    fs.writeFileSync(keyFile, '', { mode: 0o600 }); // what a power cut after a mint could leave
    const rE = await run(bundle, pinNow);
    const logE = fs.readdirSync(path.join(root, 'state')).filter((n) => /\.log$/.test(n)).map((n) => fs.readFileSync(path.join(root, 'state', n), 'utf8')).join('\n');
    ok(rE.out instanceof Error && rE.out.code === 'device-key-missing' && fs.readFileSync(keyFile, 'utf8') === '' && /state\/identity\.pem is empty/.test(logE), 'an EMPTY identity file: no new key is made over it — the answer goes without proof (refused by name) and the agent says why', rE.out instanceof Error ? rE.out.message : rE.out);
    const READ = "  if (pem !== null && !pem.trim()) throw new Error('state/identity.pem is empty — no new key is made over it; remove it on this machine to make a new one, then forget its key on the hub');\n";
    ok(ASRC.includes(READ) && ASRC.includes('  if (pem === null) {\n'), 'control: the agent mints only when the file is not there (the anchors)');
    const NEWREAD = "  let pem = null; try { pem = fs.readFileSync(DEVICE_IDENTITY_FILE, 'utf8'); } catch (e) { if (!e || e.code !== 'ENOENT') throw new Error(`state/identity.pem cannot be read (${(e && e.code) || 'error'}) — no new key is made over it; remove it on this machine to make a new one, then forget its key on the hub`); }\n";
    const LSTAT = "    let there = false; try { fs.lstatSync(DEVICE_IDENTITY_FILE); there = true; } catch { }\n    if (there) throw new Error('state/identity.pem is there but is no readable file (a link to nothing?) — no new key is made over it; remove it on this machine to make a new one, then forget its key on the hub');\n";
    ok(ASRC.includes(NEWREAD) && ASRC.includes(LSTAT), 'control: only «not there» mints (the anchors the old agent copy undoes)');
    const oldBundle = path.join(tmp, 'agentd-mints-over.js');
    build(ASRC.replace(NEWREAD, "  let pem = null; try { pem = fs.readFileSync(DEVICE_IDENTITY_FILE, 'utf8'); } catch { /* first start */ }\n").replace(READ, '').replace(LSTAT, '').replace('  if (pem === null) {\n', '  if (!pem) {\n'), oldBundle);
    const rO = await run(oldBundle, pinNow);
    ok(rO.out instanceof Error && rO.out.code === 'device-key-mismatch' && /BEGIN PRIVATE KEY/.test(fs.readFileSync(keyFile, 'utf8')), 'RED CONTROL: an agent copy that mints over an empty file makes a NEW key — the machine is then refused by every hub that pinned the old one', rO.out instanceof Error ? rO.out.message : rO.out);
    if (process.getuid && process.getuid() === 0) console.log('  · SKIP the unreadable-file legs: this runner is root, which reads a mode-000 file');
    else {
      const before = fs.readFileSync(keyFile), pinK = MA.publicKeyOf(before.toString('utf8'), C);
      fs.chmodSync(keyFile, 0o000);
      const rA = await run(bundle, pinK);
      fs.chmodSync(keyFile, 0o600);
      ok(rA.out instanceof Error && rA.out.code === 'device-key-missing' && Buffer.compare(fs.readFileSync(keyFile), before) === 0, 'an UNREADABLE identity file (EACCES): no new key over it — the answer goes without proof (refused by name), the file untouched', rA.out instanceof Error ? rA.out.message : rA.out);
      fs.chmodSync(keyFile, 0o000);
      const rA2 = await run(oldBundle, pinK);
      try { fs.chmodSync(keyFile, 0o600); } catch { }
      ok(rA2.out instanceof Error && rA2.out.code === 'device-key-mismatch' && Buffer.compare(fs.readFileSync(keyFile), before) !== 0, 'RED CONTROL: an agent copy that reads any error as a first start makes a NEW key over the unreadable one', rA2.out instanceof Error ? rA2.out.message : rA2.out);
    }
  } finally { if (saved === undefined) delete process.env.VIBESPACE_AGENTD_ROOT; else process.env.VIBESPACE_AGENTD_ROOT = saved; endDaemonsAndWait(root); }
}

console.log('— ⑦ D3 half b, the REAL agent and the attach child (moved from test-device-key-pin ⑦: its pure, store, vault and route legs stay there) —');
{
  const H = MA.generateKeyPair(C), H2 = MA.generateKeyPair(C), D = MA.generateKeyPair(C), D2 = MA.generateKeyPair(C);
  const HT = require('../src/server/host-tokens.js');
  const thr2 = (f) => { try { f(); return null; } catch (e) { return e; } };
  // ④ the REAL agent pins the hub: another hub refused, an old hello refused, a new pairing voids the pin; RED: a copy that skips the check
  const esbuild = require('esbuild');
  const build = (src, out) => esbuild.buildSync({ ...(src ? { stdin: { contents: src, resolveDir: path.join(REPO, 'src/agentd'), sourcefile: 'agentd.js', loader: 'js' } } : { entryPoints: [path.join(REPO, 'src/agentd/agentd.js')] }), bundle: true, platform: 'node', outfile: out, logLevel: 'silent', external: ['node-pty'] });
  const bundle = path.join(tmp, 'agentd-b.js'); build(null, bundle);
  const ASRC = read('src/agentd/agentd.js');
  const CHECK = "        if (!hv.ok) { mux.control({ op: 'auth-fail', code: hv.code, error: hv.why });";
  ok(ASRC.includes(CHECK), 'control: the agent refuses a hello by the hub-key verdict (the anchor)');
  const mutB = path.join(tmp, 'agentd-b-nocheck.js'); build(ASRC.replace(CHECK, "        if (false) { mux.control({ op: 'auth-fail', code: hv.code, error: hv.why });"), mutB);
  const root = path.join(tmp, 'root-b'); const saved = process.env.VIBESPACE_AGENTD_ROOT; process.env.VIBESPACE_AGENTD_ROOT = root;
  const run = async (bundlePath, identity) => { // identity: a key, null (no hub identity), or a function (it may answer null)
    const heard = [];
    const dm = new DeviceManager({ dataDir: path.join(tmp, 'data-b'), bundlePath, version: require('../package.json').version, log: () => { }, machine: 'this-box', devicePin: () => null, onDeviceKey: (ev, f) => heard.push({ ev, ...f }), hubIdentity: typeof identity === 'function' ? identity : identity ? () => identity : null });
    fs.mkdirSync(path.join(tmp, 'data-b'), { recursive: true });
    let out; try { dm.installLocal(); out = await Promise.race([dm.connect().then(() => 'connected', (e) => e), sleep(15000).then(() => 'pending')]); } catch (e) { out = e; } finally { try { dm.stop(); } catch { } endDaemonsAndWait(root); }
    return { out, heard };
  };
  try {
    const a1 = await run(bundle, H);
    const hubFile = path.join(root, 'state', 'hub.pub');
    const pinText = fs.existsSync(hubFile) ? fs.readFileSync(hubFile, 'utf8') : '';
    ok(a1.out === 'connected' && pinText.startsWith(H.publicKey + ' ') && (fs.statSync(hubFile).mode & 0o777) === 0o600, 'the real agent: the first hub ok that verifies is PINNED (state/hub.pub, 0600, bound to the token that admitted it)', a1.out instanceof Error ? a1.out.message : a1.out);
    const a2 = await run(bundle, H);
    ok(a2.out === 'connected' && a2.heard.some((x) => x.ev === 'hub-pinned'), 'the same hub again: the link opens and the device says it pins this hub (the record keeps it — law 3)');
    const a3 = await run(bundle, H2);
    ok(a3.out instanceof Error && a3.out.code === 'hub-key-mismatch' && a3.heard.some((x) => x.ev === 'refused' && x.code === 'hub-key-mismatch'), 'ANOTHER hub key: the device refuses it BY NAME, at once (no retry loses the name), and the record hears it (law 4: the card)', a3.out instanceof Error ? a3.out.message : a3.out);
    const a4 = await run(bundle, () => null); // a hub that carries an identity function and proves no key (the local road carries none at all: its own leg below)
    ok(a4.out instanceof Error && a4.out.code === 'hub-key-missing', 'a hello that proves no hub key, once the device pins one ⇒ hub-key-missing (law 3: no downgrade)', a4.out instanceof Error ? a4.out.message : a4.out);
    fs.writeFileSync(hubFile, `${H.publicKey} ${'0'.repeat(16)}\n`, { mode: 0o600 }); // a NEW pairing: the pin is bound to another token
    const a5 = await run(bundle, H2);
    ok(a5.out === 'connected' && fs.readFileSync(hubFile, 'utf8').startsWith(H2.publicKey + ' '), 'a pin bound to another token (a new pairing) is void: the hub that pairs now is pinned');
    // a hub copy that signs ANOTHER nonce: the real agent refuses its ok (hub-signature-bad) — after the link settled, it is torn
    // down and the refusal is heard (never a muted live link)
    const CSRC = read('src/agentd/client.js');
    const SIGN = 'const sigH = MA.hubProof(ident, msg.devPub, msg.nonceD, { crypto });';
    ok(CSRC.includes(SIGN), 'control: the hub signs the device\'s nonce (the anchor)');
    const BadHub = mutantCopies('device-key-badsig', REPO).load('src/agentd/client.js', CSRC.replace(SIGN, 'const sigH = MA.hubProof(ident, msg.devPub, MA.newNonce({ crypto }), { crypto });'), 'bad-sig');
    const heardBad = [];
    const dmBad = new BadHub.DeviceManager({ dataDir: path.join(tmp, 'data-b'), bundlePath: bundle, version: require('../package.json').version, log: () => { }, machine: 'this-box', devicePin: () => null, onDeviceKey: (ev, f) => heardBad.push({ ev, ...f }), hubIdentity: () => H2 });
    try { dmBad.installLocal(); await Promise.race([dmBad.connect().catch(() => 'x'), sleep(15000)]); for (let i = 0; i < 60 && !heardBad.some((x) => x.ev === 'refused'); i++) await sleep(50); } finally { try { dmBad.stop(); } catch { } endDaemonsAndWait(root); }
    ok(heardBad.some((x) => x.ev === 'refused' && x.code === 'hub-signature-bad'), 'a hub whose signature is over another nonce: the real agent refuses its ok BY NAME (hub-signature-bad) and the hub hears it', heardBad.map((x) => `${x.ev}:${x.code || ''}`));
    const aM = await run(mutB, H);
    ok(aM.out === 'connected', 'RED CONTROL: an agent copy without the hub-key check lets ANOTHER hub key in — the leg above refuses that', aM.out instanceof Error ? aM.out.message : aM.out);
    // THE CURE, must A (主开发's verdict of 2026-11-18): NO HUB KEY ON THE LOCAL ROAD — the vault sealed AND locked, and this box's
    // own agent still connects (server.js builds the local DeviceManager with no hubIdentity: a same-user socket, where a pin proves
    // nothing a reader of the same files could not forge). RED: the pre-cure wiring was refused vault_locked — the box's machine gone
    {
      const VE = require('../src/server/vault-engine.js');
      const vd = path.join(tmp, 'vault-local'); fs.mkdirSync(path.join(vd, 'agentd'), { recursive: true });
      const vht = HT.create({ dataDir: vd, log: { log() { }, warn() { } } });
      const ve = VE.create({ dataDir: vd, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false });
      await ve.setup('correct horse battery staple', {}); try { vht.identity(); } catch { } try { ve.lock('door'); } catch { }
      const locked = thr2(() => vht.identity());
      // the reader's must 2: an ssh road to THIS box (the same root and token) pinned H — the local road, which carries no key,
      // clears that pin once and is asked again (said in the hub's log); RED: a client copy without the clear is refused for good
      try { fs.unlinkSync(hubFile); } catch { }
      const p0 = await run(bundle, H);
      const pinnedByRoad = fs.existsSync(hubFile);
      const CSRC2 = read('src/agentd/client.js'), CLR = "      if (lastErr && this._transport.kind === 'local' && !this._hubIdentity && !clearedLocalPin && /^hub-key-(missing|mismatch)$/.test(String(lastErr.code || ''))) {";
      ok(CSRC2.includes(CLR), 'control: the local road clears a pin it cannot prove (the anchor)');
      const NoClear = mutantCopies('device-key-noclear', REPO).load('src/agentd/client.js', CSRC2.replace(CLR, CLR.replace('if (lastErr &&', 'if (false &&')), 'no-clear');
      const dmN = new NoClear.DeviceManager({ dataDir: path.join(tmp, 'data-b'), bundlePath: bundle, version: require('../package.json').version, log: () => { }, machine: 'this-box', devicePin: () => null });
      let outN; try { dmN.installLocal(); outN = await Promise.race([dmN.connect().then(() => 'connected', (e) => e), sleep(15000).then(() => 'pending')]); } catch (e) { outN = e; } finally { try { dmN.stop(); } catch { } endDaemonsAndWait(root); }
      const SRV = read('server.js'), at = SRV.indexOf("bundlePath: path.join(__dirname, 'data', 'bin', 'vibespace-agentd.js'),"), localDm = at > 0 ? SRV.slice(at, SRV.indexOf('});', at)) : '';
      const l1 = await run(bundle, null);
      ok(p0.out === 'connected' && pinnedByRoad && outN instanceof Error && outN.code === 'hub-key-missing', 'RED CONTROL (must 2): an ssh road to this same box pinned the hub key, and a client copy without the clear is refused hub-key-missing on the local road for good', [p0.out instanceof Error ? p0.out.code : p0.out, pinnedByRoad, outN instanceof Error ? outN.code : outN]);
      ok(!!locked && locked.code === 'vault_locked' && at > 0 && !/hubIdentity/.test(localDm) && l1.out === 'connected' && !fs.existsSync(hubFile),
        'must A + must 2: the vault sealed AND locked, a pin an ssh road to this box left in the shared root, and this box\'s own agent still connects — server.js builds the local DeviceManager with no hub key, the local road clears the pin once, and nothing stays pinned', [locked && locked.code, l1.out instanceof Error ? l1.out.message : l1.out]);
      const dmR = new DeviceManager({ dataDir: path.join(tmp, 'data-b'), bundlePath: bundle, version: require('../package.json').version, log: () => { }, machine: 'this-box', devicePin: () => null, hubIdentity: () => vht.identity() });
      let outR; try { dmR.installLocal(); outR = await Promise.race([dmR.connect().then(() => 'connected', (e) => e), sleep(15000).then(() => 'pending')]); } catch (e) { outR = e; } finally { try { dmR.stop(); } catch { } endDaemonsAndWait(root); }
      ok(outR instanceof Error && outR.code === 'vault_locked', 'RED CONTROL: the pre-cure wiring (a hub key asked on the local road) is refused vault_locked while the vault is locked — the leg above connects', outR instanceof Error ? outR.code : outR);
      try { ve.close(); } catch { }
    }
  } finally { if (saved === undefined) delete process.env.VIBESPACE_AGENTD_ROOT; else process.env.VIBESPACE_AGENTD_ROOT = saved; endDaemonsAndWait(root); }
  // ⑤ the attach child: hello names the hub key; when the device asks, the hub's signature goes BEFORE any op
  const http = require('node:http');
  const strictDevice = async () => {
    const seen = [];
    const srv = net.createServer((sock) => {
      let nonceD = null, proven = false;
      const mux = new Mux(sock, { onControl: (m) => {
        seen.push(m.op);
        if (m.op === 'hello') { seen.helloPub = m.hubPub; nonceD = MA.newNonce(C); mux.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '1.1.1', capabilities: ['device-key', 'hub-key'], platform: 'linux', ...MA.proofOf(D, m.nonceH, C), nonceD, hubPinned: true, _hello: { hubPub: m.hubPub } }); return; }
        if (m.op === 'ok') { proven = MA.okVerdict({ hubPub: H.publicKey, devPub: D.publicKey, nonceD, ok: m }, C).ok; return; }
        if (m.op === 'open-pipe-session' || m.op === 'attach-pipe-session') { seen.push(proven ? 'op-after-proof' : 'op-WITHOUT-proof'); mux.control(proven ? { op: 'pipe-session-open', chan: m.chan, pid: 1 } : { op: 'auth-fail', code: 'hub-key-missing' }); }
      }, onData: (chan, buf) => mux.credit(chan, buf.length), onDead: () => { } });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    return { srv, seen, port: srv.address().port };
  };
  const fakeHub = async (signAnswer = null) => {
    const srv = http.createServer((req, res) => {
      let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/agent/vault/link-token') return res.end(JSON.stringify({ ok: true, token: 'vsht_fixture', hubPub: H.publicKey }));
        if (req.url === '/api/agent/vault/link-sign' && signAnswer) { res.statusCode = signAnswer.status; return res.end(JSON.stringify(signAnswer.body)); }
        if (req.url === '/api/agent/vault/link-sign') { const j = JSON.parse(b || '{}'); return res.end(JSON.stringify({ ok: true, sigH: MA.hubProof(H, j.devPub, j.nonceD, C) })); }
        res.statusCode = 404; res.end('{}');
      });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    return { srv, port: srv.address().port };
  };
  const attach = async (script, { signAnswer = null } = {}) => {
    const dev = await strictDevice(), hub = await fakeHub(signAnswer);
    const cfgFile = path.join(tmp, 'attach-' + path.basename(script) + '.json');
    fs.writeFileSync(cfgFile, JSON.stringify({ tcp: { port: dev.port }, hub: { port: hub.port }, sid: 'sid-1', spawn: { cmd: 'true', args: [], cwd: '/', env: {} }, version: '1' }), { mode: 0o600 });
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, [script, '--config', cfgFile], { env: { PATH: process.env.PATH, VIBESPACE_SESSION_TOKEN: 'vsst_fixture' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let err = ''; child.stderr.on('data', (d) => { err += d; });
    for (let i = 0; i < 100 && !dev.seen.some((x) => /^op-/.test(x)) && child.exitCode === null; i++) await sleep(50);
    const code = child.exitCode;
    try { child.kill('SIGTERM'); } catch { }
    dev.srv.close(); hub.srv.close();
    return { seen: dev.seen, err, code };
  };
  const t1 = await attach(path.join(REPO, 'src/agentd/attach-cli.js'));
  ok(t1.seen.helloPub === H.publicKey && t1.seen[0] === 'hello' && t1.seen.includes('ok') && t1.seen.indexOf('ok') < t1.seen.indexOf('op-after-proof') && !t1.seen.includes('op-WITHOUT-proof'), 'the attach child: its hello names the hub\'s key, the hub\'s signature (from the door) goes in the ok BEFORE its first op — a device that pins the hub opens it', t1.seen.concat([t1.err.slice(-200)]));
  // must 2: a NEW pairing really voids the pin — the pairing command run ON the device (both installers) forgets state/hub.pub
  ok(/\nrm -f "\$ROOT\/state\/hub\.pub"\n/.test(read('scripts/vibespace-agentd-install.sh')) && /Remove-Item -Force -ErrorAction SilentlyContinue \(Join-Path \$root 'state\\hub\.pub'\)/.test(read('scripts/vibespace-agentd-install.ps1')), 'a pairing command run on the device (sh and ps1) forgets the hub key it pinned — a new pairing pins the hub that pairs now');
  const ATT = read('src/agentd/attach-cli.js');
  const ANCH = "  if (p.sigH) mux.control({ op: 'ok', sigH: p.sigH });\n";
  ok(ATT.includes(ANCH), 'control: the attach child sends the hub\'s ok (the anchor)');
  const mutAttach = mutantCopies('device-key-attach', REPO).write('src/agentd/attach-cli.js', ATT.replace(ANCH, ''), 'no-ok');
  const tM = await attach(mutAttach);
  ok(tM.seen.includes('op-WITHOUT-proof'), 'RED CONTROL: an attach copy that skips the hub\'s ok sends its op unproven — the strict device refuses it (the leg above shows the order)', tM.seen);
  // the reader of unit 5: a vault that locks between the link token and the sign is the vault WAIT (exit 7 — the wrapper never
  // counts it to its cap), never a refusal; and no op goes
  const tV = await attach(path.join(REPO, 'src/agentd/attach-cli.js'), { signAnswer: { status: 423, body: { ok: false, code: 'vault_locked', error: 'the vault is locked' } } });
  ok(tV.code === 7 && !tV.seen.includes('op-WITHOUT-proof') && !tV.seen.includes('op-after-proof'), 'a link-sign that answers vault_locked: the attach child exits 7 (the vault wait the wrapper never counts to its cap) and sends no op', [tV.code, tV.seen]);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
