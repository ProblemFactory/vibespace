#!/usr/bin/env node
// A MACHINE'S DESKTOP SIGN-IN, REMEMBERED (lane desktop-vnc-remember, owner 2026-10-19 「现在远程桌面密码能保留了吧 就存到 vault 里？」)
// — fast, in-process: the REAL vault engine (set up, unlocked, locked), the REAL integration store (its key is the vault's), the
// REAL access layer + routes + the ONE picture bridge (desktop-stream + the RFB relay + src/server/rfb-signin.js's gate), over
// stand-in paired machines whose agent's tcpForward reaches scripts/fake-vnc-machine.mjs — a VNC server that CHECKS the sign-in
// with code the hub does not share (noVNC's own DES; node's DiffieHellman + AES for ARD). The "browser" is a minimal RFB
// client over the bridge's WebSocket: it signs in only when told a password, and keeps every byte it was sent.
//   §1 the crypto: the hub's VNC answer = noVNC's (8 passwords × random challenges, short / long / non-ASCII); the ARD block
//      opens with the machine's own DH (a UTF-8 name, a 70-byte password cut at 63); the type tables
//   §2 nothing kept: connect says kept false · can true · auto false; the viewer meets the machine's own sign-in (asked [2]);
//      people only (an agent token ⇒ 403 on every door); refusals by name (no password 400, an unknown machine 404)
//   §3 REMEMBER (VNC password): the answer is the state (no password); integrations.json holds the row's ciphertext, never
//      the password; the viewer — given NO password — meets a server that asks nothing (types [1]) and reaches the desktop;
//      the machine saw the hub's answer and took it; one audit line, one log line, neither with the password
//   §4 TightVNC: a machine that offers only [16] (and [16, 2]) — the hub speaks Tight's sub-auth (or picks 2)
//   §5 a Mac (ARD, name + password): remembered, signed in by the hub; ARD without a name ⇒ 400; an UltraVNC machine (MSLogonII,
//      113 — a sign-in the hub does not speak): can false, remember ⇒ 409 signin_unsupported (the dialog offers no tick there);
//      an RFB 3.3 server (it picks VNC auth itself — the gate never answers one): can false, remember ⇒ 409 (verify r1)
//   §6 WRONG (the password changed on the machine): the hub's try is refused, the viewer meets the machine's own sign-in on a
//      FRESH connection (nothing of the refused one reached it); the row stays (cleared nothing); GET says refused; the next
//      window is NOT tried again (one plain connection); the person signs in with the new one + remembers ⇒ auto again
//   §7 LOCKED vault: state locked · kept · not auto; the viewer meets the machine's own sign-in; remember ⇒ 409 vault_locked
//      and integrations.json is byte-identical; forget (the Mac's) works while locked; unlock ⇒ remember works again
//   §8 forget + UNPAIR: forget ⇒ kept false, the next viewer is asked; the access layer's hosts.onRemoved listener forgets
//      the machine's desktop sign-in AND its RemoteApp sign-in; the REAL HostManager calls its removal listeners
//   §9 THE SINKS: every password used — never in a route answer, the console, the logs, a store broadcast, an audit row, any
//      file under the data dir, or ANY byte a viewer was sent (the hub never hands it to a browser); the sinks were live
//   CONTROLS (patched copies, scripts/mutant-copy.mjs): a planted log line in rememberSignin ⇒ the log sink sees it; the
//   registry row's password `secret: false` ⇒ integrations.json holds the plaintext (the seal census is RED); a relay that
//   ignores the remembered sign-in ⇒ §3's viewer is asked [2]
//   §10 the words: every new key has zh + ja; the brief's zh sentences verbatim
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { fakeVncMachine, novncDes, OAKLEY2 } from './fake-vnc-machine.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RS = require(path.join(repo, 'src/server/rfb-signin.js'));
const VE = require(path.join(repo, 'src/server/vault-engine.js'));
const IS = require(path.join(repo, 'src/server/integration-store.js'));
const A = require(path.join(repo, 'src/server/desktop-access.js'));
const DS = require(path.join(repo, 'src/server/desktop-stream.js'));
const R = require(path.join(repo, 'src/routes/desktop-apps.js'));
const { HostManager } = require(path.join(repo, 'src/hosts.js'));
const { BOX_CIPHERTEXT_RE } = require(path.join(repo, 'src/secret-box.js'));
const express = require('express');
const { WebSocket } = require('ws');
const MUT = mutantCopies('dsi', repo);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : ''}`); } };
const section = async (title, fn) => { console.log(title); try { await fn(); } catch (e) { ok(false, `${title.split(' ')[0]} threw — ${(e && e.message) || e}`, String((e && e.stack) || '').split('\n').slice(1, 4).map((x) => x.trim()).join(' | ')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 30) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };

// ── the secrets, built at runtime from shapes ──
const PW = ['Vn', crypto.randomBytes(2).toString('hex'), '!'].join('');          // a VNC password (≤ 8 count)
const PW2 = ['Wq', crypto.randomBytes(2).toString('hex'), '#'].join('');
const PWA = ['Ma', crypto.randomBytes(5).toString('hex'), 'c-ü'].join('');      // the Mac's
const SECRETS = [PW, PW2, PWA];
const VAULT_PW = 'vault-' + crypto.randomBytes(6).toString('hex');
const HOST = 'win-a', MAC = 'mac-a', ULTRA = 'win-u', OLD = 'win-33';

const root = scratch('dsi');
fs.mkdirSync(root, { recursive: true });
const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });

// ── the spies: console + the logs ──
const said = [];
for (const k of ['log', 'warn', 'error', 'info']) { const orig = console[k].bind(console); console[k] = (...a) => { said.push(a.map(String).join(' ')); if (k !== 'log' || !String(a[0]).startsWith('[')) orig(...a); }; }
const logs = [];
const spyLog = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), info: (...a) => logs.push(a.join(' ')) };
const quiet = { log() { }, warn() { }, error() { }, info() { } };

// ── the machines: one fake VNC server each, reached through a stand-in agent's tcpForward ──
const mWin = await fakeVncMachine({ mode: 'vnc', password: PW, name: 'WIN-A' });
const mMac = await fakeVncMachine({ mode: 'ard', username: 'xw ü', password: PWA, name: 'MAC-A' });
const mUltra = await fakeVncMachine({ mode: 'mslogon', name: 'WIN-U' });
const mOld = await fakeVncMachine({ mode: 'rfb33', password: PW, name: 'WIN-33' });
const MACHINES = { [HOST]: { m: mWin, platform: 'win32', name: 'Lab PC' }, [MAC]: { m: mMac, platform: 'darwin', name: 'Lab Mac' }, [ULTRA]: { m: mUltra, platform: 'win32', name: 'Ultra PC' }, [OLD]: { m: mOld, platform: 'win32', name: 'Old PC' } };
const dmOf = (hostId) => {
  const net = require('node:net');
  return {
    status: () => ({ connected: true, info: { platform: MACHINES[hostId].platform, capabilities: [] } }),
    desktopServe: async () => ({ ok: false, code: 'unused', error: 'this stand-in runs no desktop-serve op' }),
    tcpForward: async () => {
      const s = net.connect(MACHINES[hostId].m.port, '127.0.0.1');
      await new Promise((r, j) => { s.once('connect', r); s.once('error', j); });
      const h = { onData: null, onClose: null, write: (b) => s.write(b), close: () => s.destroy() };
      s.on('data', (b) => h.onData && h.onData(b)); s.on('close', () => h.onClose && h.onClose()); s.on('error', () => { });
      return h;
    },
  };
};
const dms = Object.fromEntries(Object.keys(MACHINES).map((h) => [h, dmOf(h)]));
const removedFns = [];
const hosts = {
  deviceBounded: async (id) => dms[id], connectedDevice: (id) => dms[id] || null, get: (id) => (MACHINES[id] ? { id, name: MACHINES[id].name, transport: 'dial' } : null),
  isLocal: (id) => !id || id === 'local', list: () => Object.keys(MACHINES).map((id) => ({ id, name: MACHINES[id].name, transport: 'dial' })), linkState: () => 'online',
  onRemoved: (fn) => { removedFns.push(fn); return () => { }; },
};

// ── the vault (set up, unlocked) → the store → the access layer → the bridge + routes ──
const eng = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
const su = await eng.setup(VAULT_PW);
const frames = [], audits = [];
const store = IS.create({ dataDir, env: {}, broadcast: (m) => frames.push(JSON.stringify(m)), log: spyLog });
const access = A.create({ hosts, install: false, integrations: store, audit: (line) => { audits.push(JSON.stringify(line)); return line; }, log: spyLog, probeMs: 3000 });
const mkBridge = (relayLog) => DS.create({ auth: { requestAuthed: () => true }, log: relayLog, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
let bridge = mkBridge(spyLog);
R.setup({ access, stream: bridge, vnc: { status: async () => ({ available: true, running: false }) } });
const app = express(); app.use(express.json()); app.use(R.router);
const srv = http.createServer(app);
srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head, bridge.upgradeId(new URL(req.url, 'http://x').pathname)));
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `127.0.0.1:${srv.address().port}`;
const answers = [];
async function api(method, url, body, headers = {}) {
  const r = await fetch(`http://${base}${url}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); answers.push(text);
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}
const connect = (host) => api('POST', '/api/desktop/machine-desktop/connect', { host });
const stateOf = async (host) => (await api('GET', `/api/desktop/machine-desktop/signins?host=${host}`)).json?.signin || null;

/** THE "BROWSER": an RFB client over the bridge. `password` = what the person would type (null = they would be asked).
 *  → { how: 'hub' | 'typed' | 'asked' | 'refused' | 'closed', types, name, bytes } */
const received = [];
function viewer(host, { password = null, ms = 8000 } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${base}/api/desktop/machine-desktop.${host}/stream`);
    ws.binaryType = 'nodebuffer';
    let buf = Buffer.alloc(0), stage = 'version', types = null, how = null, all = [], via = null, nm = null;
    const done = (v) => { if (how) return; how = v; clearTimeout(timer); const bytes = Buffer.concat(all); received.push(bytes); try { ws.close(); } catch { } resolve({ how: v, types, name: nm, bytes }); };
    const timer = setTimeout(() => done('timeout:' + stage), ms);
    ws.on('message', (d) => {
      all.push(Buffer.from(d)); buf = Buffer.concat([buf, Buffer.from(d)]);
      for (;;) {
        if (stage === 'version') { if (buf.length < 12) return; buf = buf.subarray(12); ws.send(Buffer.from('RFB 003.008\n')); stage = 'types'; continue; }
        if (stage === 'types') {
          if (buf.length < 1) return;
          const n = buf[0]; if (buf.length < 1 + n) return;
          types = [...buf.subarray(1, 1 + n)]; buf = buf.subarray(1 + n);
          if (n === 0) return done('refused');
          if (types.includes(1)) { ws.send(Buffer.from([1])); stage = 'result'; via = 'hub'; continue; }
          if (types.includes(2) && password != null) { ws.send(Buffer.from([2])); stage = 'challenge'; via = 'typed'; continue; }
          return done('asked');
        }
        if (stage === 'challenge') { if (buf.length < 16) return; ws.send(novncDes(password, buf.subarray(0, 16))); buf = buf.subarray(16); stage = 'result'; continue; }
        if (stage === 'result') { if (buf.length < 4) return; const s = buf.readUInt32BE(0); buf = buf.subarray(4); if (s !== 0) return done('refused'); ws.send(Buffer.from([1])); stage = 'serverinit'; continue; }
        if (stage === 'serverinit') { if (buf.length < 24) return; const nl = buf.readUInt32BE(20); if (buf.length < 24 + nl) return; nm = buf.subarray(24, 24 + nl).toString(); return done(via); }
        return;
      }
    });
    ws.on('close', () => done('closed:' + stage));
    ws.on('error', () => done('error:' + stage));
  });
}
const rowsSince = (m, n) => m.seen.slice(n);
const recordOf = () => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'integrations.json'), 'utf8')).integrations || {}; } catch { return {}; } };

ok(su && su.ok === true && eng.state && eng.state() === 'unlocked', 'the vault is set up and unlocked (the store\'s key is the vault\'s)', su);

await section('§1 the crypto — the hub\'s answers against code it does not share', async () => {
  const pws = ['', 'a', 'pass', '12345678', '123456789abc', 'pässwörd', '密码12', PW];
  let same = 0;
  for (const p of pws) for (let i = 0; i < 4; i++) { const ch = crypto.randomBytes(16); if (Buffer.compare(RS.vncResponse(p, ch), novncDes(p, ch)) === 0) same++; }
  ok(same === pws.length * 4, `VNC auth: the hub's DES answer = noVNC's own (RFB.genDES) for ${pws.length} passwords × 4 challenges`, { same });
  const dh = crypto.createDiffieHellman(OAKLEY2, Buffer.from([2])); dh.generateKeys();
  const pk = dh.getPublicKey(); const pub = pk.length < 128 ? Buffer.concat([Buffer.alloc(128 - pk.length), pk]) : pk;
  const long = 'L'.repeat(70);
  const out = RS.ardResponse({ generator: Buffer.from([0, 2]), prime: OAKLEY2, serverKey: pub }, '名前 user', long);
  const sh = dh.computeSecret(out.subarray(128)); const shared = sh.length < 128 ? Buffer.concat([Buffer.alloc(128 - sh.length), sh]) : sh;
  const dc = crypto.createDecipheriv('aes-128-ecb', crypto.createHash('md5').update(shared).digest(), null); dc.setAutoPadding(false);
  const pt = Buffer.concat([dc.update(out.subarray(0, 128)), dc.final()]);
  const cut = (b) => { const z = b.indexOf(0); return b.subarray(0, z < 0 ? b.length : z).toString('utf8'); };
  ok(out.length === 256 && cut(pt.subarray(0, 64)) === '名前 user' && cut(pt.subarray(64)) === 'L'.repeat(63), 'ARD: the 128-byte block opens with the machine\'s own DH + MD5 + AES — the UTF-8 name, the password cut at 63 bytes, NUL-terminated; then the 128-byte public key', { len: out.length, user: cut(pt.subarray(0, 64)) });
  ok(RS.rowAuthOf(30) === 'ard' && RS.rowAuthOf(2) === 'vnc' && RS.rowAuthOf(16) === 'vnc' && [1, 6, 19, 22, 113].every((t) => RS.rowAuthOf(t) === null), 'the kinds the hub speaks: 30 ard · 2 / 16 vnc — MSLogonII / VeNCrypt / RA2ne / XVP / None: nothing offered');
  ok(RS.pickType('vnc', [16, 2]) === 2 && RS.pickType('vnc', [16]) === 16 && RS.pickType('ard', [30, 2]) === 30 && RS.pickType('ard', [2]) === null && RS.pickType('user', [113]) === null && RS.pickType('nope', [2]) === null, 'the type it answers with: 2 before 16 for a VNC password; none the row speaks ⇒ null');
  ok(RS.namesUser('ard') === true && RS.namesUser('vnc') === false && RS.namesUser('toString') === false, 'a name rides an ARD row only');
  { // verify r1: the ARD key length is capped at 256 bytes BEFORE any arithmetic (a 1024-byte prime cost the hub 0.8 s of BigInt per connection)
    const ends = []; const gateOf = () => RS.signInGate({ auth: 'ard', username: 'u', password: 'p' }, { toServer() { }, toBrowser() { }, onEnd: (v) => ends.push(v) });
    const h = Buffer.alloc(4); h.writeUInt16BE(2, 0);
    const g1 = gateOf(); g1.fromServer(Buffer.from('RFB 003.008\n')); g1.fromServer(Buffer.from([1, 30])); h.writeUInt16BE(257, 2); g1.fromServer(h);
    const g2 = gateOf(); g2.fromServer(Buffer.from('RFB 003.008\n')); g2.fromServer(Buffer.from([1, 30])); h.writeUInt16BE(256, 2); g2.fromServer(h); const waiting = !g2.ended; g2.abort('test over');
    ok(ends.length === 2 && ends[0].code === 'unusable' && /key length 257/.test(ends[0].why) && waiting && /test over/.test(ends[1].why), 'ARD: a key length past 256 bytes is refused by name before any arithmetic; 256 is read on', ends);
  }
});

await section('§2 nothing kept — the machine asks, people only', async () => {
  const c = await connect(HOST);
  ok(c.status === 200 && c.json.signin && c.json.signin.kept === false && c.json.signin.can === true && c.json.signin.auto === false && c.json.signin.locked === false, 'connect: kept false · can true (a VNC password the hub can speak) · auto false', c.json && c.json.signin);
  const n0 = mWin.seen.length;
  const v = await viewer(HOST);
  ok(v.how === 'asked' && JSON.stringify(v.types) === '[2]', 'the viewer meets the machine\'s own sign-in (types [2]) — the hub did not sign in', v.how);
  ok(rowsSince(mWin, n0).length === 1 && rowsSince(mWin, n0)[0].verdict === 'none', 'ONE connection reached the machine (plain)', rowsSince(mWin, n0));
  const tok = { Authorization: 'Bearer vsst_agent' };
  const doors = [await api('GET', `/api/desktop/machine-desktop/signins?host=${HOST}`, null, tok), await api('GET', '/api/desktop/machine-desktop/signins', null, tok), await api('POST', '/api/desktop/machine-desktop/signin', { host: HOST, password: PW }, tok), await api('POST', '/api/desktop/machine-desktop/signin/forget', { host: HOST }, tok)];
  ok(doors.every((d) => d.status === 403 && d.json && d.json.code === 'human_only'), 'people only: an agent token on every door ⇒ 403 human_only', doors.map((d) => d.status));
  const np = await api('POST', '/api/desktop/machine-desktop/signin', { host: HOST });
  const unk = await api('POST', '/api/desktop/machine-desktop/signin', { host: 'nobody-x', password: PW });
  ok(np.status === 400 && np.json.code === 'bad-request' && unk.status === 404 && unk.json.code === 'unsupported-host', 'refused by name: no password ⇒ 400 · an unknown machine ⇒ 404', [np.status, np.json && np.json.code, unk.status, unk.json && unk.json.code]);
  ok(!recordOf()[`desktop-signin/${HOST}`], 'nothing was stored by a refusal');
});

let fileAfterRemember = null;
await section('§3 REMEMBER — sealed; the hub signs in; the viewer is never handed it', async () => {
  const r = await api('POST', '/api/desktop/machine-desktop/signin', { host: HOST, password: PW });
  ok(r.status === 200 && r.json.signin && r.json.signin.kept === true && r.json.signin.auth === 'vnc' && r.json.signin.auto === true && !r.text.includes(PW), 'POST signin ⇒ the state (kept · vnc · auto) — no password in the answer', r.json);
  const rec = recordOf()[`desktop-signin/${HOST}`];
  fileAfterRemember = fs.readFileSync(path.join(dataDir, 'integrations.json'), 'utf8');
  ok(rec && rec.values && BOX_CIPHERTEXT_RE.test(rec.values.password) && rec.values.auth === 'vnc' && !('username' in rec.values) && !fileAfterRemember.includes(PW), 'integrations.json: the password is the box\'s ciphertext, the kind plain, no name for a VNC password — the password\'s bytes nowhere in the file', rec);
  const n0 = mWin.seen.length;
  const v = await viewer(HOST); // NO password given — it would be asked if the hub did not sign in
  const rows = rowsSince(mWin, n0);
  ok(v.how === 'hub' && JSON.stringify(v.types) === '[1]' && v.name === 'WIN-A', 'the viewer meets a server that asks nothing (types [1]) and reaches the desktop (ServerInit WIN-A)', { how: v.how, types: v.types, name: v.name });
  ok(rows.length === 1 && rows[0].type === 2 && rows[0].verdict === 'ok' && rows[0].session === true, 'the machine saw ONE connection: type 2, the hub\'s answer checked by noVNC\'s DES — taken; the session followed', rows);
  ok(logs.some((l) => l.includes(`machine-desktop.${HOST}: signed in with the remembered sign-in (vnc)`)), 'the bridge says it in one line (the kind, never the password)');
  ok(audits.some((a) => a.includes('"verb":"desktop-signin-remember"') && a.includes('"auth":"vnc"')), 'one audit line: desktop-signin-remember (the kind)');
  const c = await connect(HOST);
  ok(c.json.signin.auto === true && c.json.signin.kept === true, 'connect now says auto');
});

await section('§4 TightVNC — [16] only, and [16, 2]', async () => {
  mWin.st.mode = 'tight';
  let n0 = mWin.seen.length;
  const v = await viewer(HOST);
  ok(v.how === 'hub' && rowsSince(mWin, n0).length === 1 && rowsSince(mWin, n0)[0].type === 16 && rowsSince(mWin, n0)[0].verdict === 'ok', 'a machine offering only Tight (16): the hub speaks its no-tunnel + VNC sub-auth — taken', rowsSince(mWin, n0));
  mWin.st.mode = 'tight2';
  n0 = mWin.seen.length;
  const v2 = await viewer(HOST);
  ok(v2.how === 'hub' && rowsSince(mWin, n0)[0].type === 2 && rowsSince(mWin, n0)[0].verdict === 'ok', '[16, 2]: the hub picks plain VNC auth (2) — taken', rowsSince(mWin, n0));
  mWin.st.mode = 'vnc';
});

await section('§5 a Mac (ARD) and an UltraVNC machine', async () => {
  const c = await connect(MAC);
  ok(c.status === 200 && c.json.auth === 'ard' && c.json.signin.can === true && c.json.signin.kept === false, 'the Mac: auth ard, can', c.json);
  const noName = await api('POST', '/api/desktop/machine-desktop/signin', { host: MAC, password: PWA });
  ok(noName.status === 400 && noName.json.code === 'bad-request', 'ARD without a user name ⇒ 400 (nothing stored)', noName.json);
  const r = await api('POST', '/api/desktop/machine-desktop/signin', { host: MAC, username: 'xw ü', password: PWA });
  ok(r.status === 200 && r.json.signin.auth === 'ard' && r.json.signin.auto === true, 'remembered: kind ard, auto', r.json);
  const n0 = mMac.seen.length;
  const v = await viewer(MAC);
  ok(v.how === 'hub' && v.name === 'MAC-A' && rowsSince(mMac, n0)[0].type === 30 && rowsSince(mMac, n0)[0].verdict === 'ok' && rowsSince(mMac, n0)[0].user === 'xw ü', 'the hub signs in to the Mac: DH + AES, the machine opened the name and the password — taken', rowsSince(mMac, n0));
  const cu = await connect(ULTRA);
  const ru = await api('POST', '/api/desktop/machine-desktop/signin', { host: ULTRA, username: 'ops', password: PWA });
  ok(cu.status === 200 && cu.json.auth === 'user' && cu.json.signin.can === false && ru.status === 409 && ru.json.code === 'signin_unsupported' && !recordOf()[`desktop-signin/${ULTRA}`], 'an UltraVNC machine (MSLogonII 113): can false — remember ⇒ 409 signin_unsupported, nothing stored', { connect: cu.json && cu.json.signin, remember: ru.json });
  const c33 = await connect(OLD);
  const r33 = await api('POST', '/api/desktop/machine-desktop/signin', { host: OLD, password: PW });
  ok(c33.status === 200 && c33.json.type === 2 && c33.json.signin.can === false && r33.status === 409 && r33.json.code === 'signin_unsupported' && !recordOf()[`desktop-signin/${OLD}`], 'an RFB 3.3 server (it picks VNC auth itself; the gate never answers one): can false — remember ⇒ 409 signin_unsupported, nothing stored (verify r1)', { connect: c33.json && c33.json.signin, remember: r33.json });
});

await section('§6 WRONG — the password changed on the machine', async () => {
  const before = recordOf()[`desktop-signin/${HOST}`];
  mWin.st.password = PW2;
  let n0 = mWin.seen.length;
  const v = await viewer(HOST);
  const rows = rowsSince(mWin, n0);
  ok(rows.length === 2 && rows[0].verdict === 'refused' && rows[0].type === 2 && rows[1].verdict === 'none', 'the hub\'s try was refused, then ONE fresh connection the person signs in on', rows);
  ok(v.how === 'asked' && JSON.stringify(v.types) === '[2]' && !v.bytes.includes(Buffer.from('Authentication failed')), 'the viewer meets the machine\'s own sign-in — nothing of the refused connection reached it', { how: v.how, types: v.types });
  const s = await stateOf(HOST);
  ok(s && s.kept === true && s.refused === true && s.auto === false && JSON.stringify(recordOf()[`desktop-signin/${HOST}`]) === JSON.stringify(before), 'GET says refused · kept — the row is untouched (a failure clears nothing)', s);
  ok(logs.some((l) => l.includes('the remembered sign-in was refused (Authentication failed)')), 'the bridge names the refusal (the machine\'s own reason)');
  n0 = mWin.seen.length;
  const v2 = await viewer(HOST);
  ok(v2.how === 'asked' && rowsSince(mWin, n0).length === 1 && rowsSince(mWin, n0)[0].verdict === 'none', 'the next window is NOT tried again (a machine\'s lockout counts failures): ONE plain connection', rowsSince(mWin, n0));
  n0 = mWin.seen.length;
  const v3 = await viewer(HOST, { password: PW2 });
  ok(v3.how === 'typed' && rowsSince(mWin, n0)[0].verdict === 'ok', 'the person types the new password: taken', v3.how);
  const r = await api('POST', '/api/desktop/machine-desktop/signin', { host: HOST, password: PW2 });
  ok(r.json.signin.refused === false && r.json.signin.auto === true, 'remembered anew: refused cleared, auto again', r.json.signin);
  n0 = mWin.seen.length;
  const v4 = await viewer(HOST);
  ok(v4.how === 'hub' && rowsSince(mWin, n0).length === 1 && rowsSince(mWin, n0)[0].verdict === 'ok', 'the hub signs in with the new one', rowsSince(mWin, n0));
});

await section('§7 LOCKED vault', async () => {
  const lk = eng.lock('test');
  const s = await stateOf(HOST);
  ok(lk.ok && s.locked === true && s.kept === true && s.auto === false, 'locked: the state says locked · kept · not auto', s);
  const n0 = mWin.seen.length;
  const v = await viewer(HOST);
  ok(v.how === 'asked' && rowsSince(mWin, n0).length === 1 && rowsSince(mWin, n0)[0].verdict === 'none', 'the viewer meets the machine\'s own sign-in (the hub opened nothing)', rowsSince(mWin, n0));
  const file0 = fs.readFileSync(path.join(dataDir, 'integrations.json'));
  const r = await api('POST', '/api/desktop/machine-desktop/signin', { host: HOST, password: PW });
  ok(r.status === 409 && r.json.code === 'vault_locked' && Buffer.compare(file0, fs.readFileSync(path.join(dataDir, 'integrations.json'))) === 0, 'remember ⇒ 409 vault_locked; integrations.json byte-identical (nothing stored)', r.json);
  const f = await api('POST', '/api/desktop/machine-desktop/signin/forget', { host: MAC });
  ok(f.status === 200 && f.json.signin.kept === false && !recordOf()[`desktop-signin/${MAC}`], 'forget works while the vault is locked (nothing is opened)', f.json);
  const ul = await eng.unlock(VAULT_PW);
  const r2 = await api('POST', '/api/desktop/machine-desktop/signin', { host: MAC, username: 'xw ü', password: PWA });
  ok(ul.ok && r2.status === 200 && r2.json.signin.auto === true, 'unlock ⇒ remember works again', r2.json);
});

await section('§8 forget + UNPAIR', async () => {
  const f = await api('POST', '/api/desktop/machine-desktop/signin/forget', { host: HOST });
  const n0 = mWin.seen.length;
  const v = await viewer(HOST);
  ok(f.json.signin.kept === false && !recordOf()[`desktop-signin/${HOST}`] && v.how === 'asked' && rowsSince(mWin, n0).length === 1, 'forget ⇒ the row gone; the next viewer is asked', f.json.signin);
  ok(audits.some((a) => a.includes('"verb":"desktop-signin-forget"')), 'one audit line: desktop-signin-forget');
  store.setMachineValues('remoteapp', MAC, { user: 'xw', password: PWA });
  ok(!!recordOf()[`desktop-signin/${MAC}`] && !!recordOf()[`remoteapp/${MAC}`] && removedFns.length === 1, 'before the unpair: the Mac has a desktop sign-in and a RemoteApp sign-in; the access layer listens for removals');
  removedFns[0](MAC);
  ok(!recordOf()[`desktop-signin/${MAC}`] && !recordOf()[`remoteapp/${MAC}`], 'UNPAIR: both of the machine\'s sealed sign-ins are forgotten', Object.keys(recordOf()));
  ok(audits.some((a) => a.includes('"verb":"desktop-signin-forget"') && a.includes('"why":"unpaired"')) && audits.some((a) => a.includes('"verb":"remoteapp-forget"') && a.includes('"why":"unpaired"')), 'each said in the audit (why: unpaired)');
  fs.mkdirSync(path.join(root, 'hm'), { recursive: true });
  const hm = new HostManager({ dataDir: path.join(root, 'hm') });
  const got = [];
  hm.onRemoved((id) => got.push(id));
  const id = hm.add({ name: 'pc', user: 'u', host: '127.0.0.9' });
  hm.remove(id);
  ok(got.length === 1 && got[0] === id, 'the REAL HostManager calls its removal listeners with the machine\'s id', got);
});

await section('§9 THE SINKS — every password used, nowhere but the sealed row and the machine\'s handshake', async () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(dataDir);
  const look = (what, text) => { const hits = SECRETS.filter((s) => String(text).includes(s)); ok(hits.length === 0, `${what}: no password`, hits.length ? `${hits.length} hit(s)` : undefined); };
  look(`every route answer (${answers.length})`, answers.join('\n'));
  look(`the console (${said.length} lines)`, said.join('\n'));
  look(`the logs (${logs.length} lines)`, logs.join('\n'));
  look(`every store broadcast (${frames.length})`, frames.join('\n'));
  look(`every audit row (${audits.length})`, audits.join('\n'));
  for (const f of files) look(`file ${path.relative(dataDir, f)}`, fs.readFileSync(f).toString('latin1') + fs.readFileSync(f).toString('utf8'));
  const sent = Buffer.concat(received);
  ok(SECRETS.every((s) => !sent.includes(Buffer.from(s, 'utf8'))), `every byte the viewers were sent (${sent.length} B over ${received.length} connections): no password — the hub never hands it to a browser`);
  ok(answers.length >= 20 && frames.some((f) => f.includes('integration-machine-updated')) && audits.length >= 4 && files.some((f) => f.endsWith('integrations.json')) && logs.some((l) => l.includes('remembered sign-in')), 'the sinks were live: route answers, store broadcasts, audit rows, the sealed file, the bridge\'s lines');
});

await section('CONTROLS — the census can see', async () => {
  // (a) a planted log line in rememberSignin ⇒ the log sink sees the password
  const accSrc = fs.readFileSync(path.join(repo, 'src/server/desktop-access.js'), 'utf8');
  const anchor = "    signinRefused.delete(hostId);\n    auditSignin(hostId, 'desktop-signin-remember', { ok: true, auth });\n";
  ok(accSrc.includes(anchor), 'the planted-log anchor is in desktop-access.js');
  const leakAcc = MUT.load('src/server/desktop-access.js', accSrc.replace(anchor, "    log.log?.('remembered ' + password);\n" + anchor), 'leaklog');
  const lLogs = [];
  const dir2 = path.join(root, 'data-c1'); fs.mkdirSync(dir2, { recursive: true });
  const store2 = IS.create({ dataDir: dir2, env: {}, broadcast: () => { }, log: quiet });
  const acc2 = leakAcc.create({ hosts: { ...hosts, onRemoved: undefined }, install: false, integrations: store2, log: { log: (...a) => lLogs.push(a.join(' ')), warn: () => { } }, probeMs: 3000 });
  await acc2.openMachineDesktop(HOST);
  mWin.st.password = PW;
  acc2.rememberSignin(HOST, { password: PW });
  ok(lLogs.some((l) => l.includes(PW)), 'CONTROL: a planted log of the password ⇒ the log sink sees it (§9\'s log leg would be red)');
  // (b) the registry row's password not secret ⇒ the plaintext lands in integrations.json
  const regSrc = fs.readFileSync(path.join(repo, 'src/integration-registry.js'), 'utf8');
  const pwField = "      { key: 'password', label: i18nKey('Password'), secret: true, required: true, placeholder: '',\n        help: i18nKey('Sealed on this VibeSpace server; the hub signs in with it while the vault is unlocked.')";
  ok(regSrc.includes(pwField), 'the row\'s password field is `secret: true` (the seal\'s one switch)');
  const regCopy = MUT.write('src/integration-registry.js', regSrc.replace(pwField, pwField.replace('secret: true', 'secret: false')), 'plain');
  const isSrc = fs.readFileSync(path.join(repo, 'src/server/integration-store.js'), 'utf8');
  const plainStore = MUT.load('src/server/integration-store.js', isSrc.replace("require('../integration-registry.js')", `require(${JSON.stringify(regCopy)})`), 'plain');
  const dir3 = path.join(root, 'data-c2'); fs.mkdirSync(dir3, { recursive: true });
  const store3 = plainStore.create({ dataDir: dir3, env: {}, broadcast: () => { }, log: quiet });
  const acc3 = A.create({ hosts: { ...hosts, onRemoved: undefined }, install: false, integrations: store3, log: quiet, probeMs: 3000 });
  await acc3.openMachineDesktop(HOST);
  acc3.rememberSignin(HOST, { password: PW });
  const sealCensus = (dir) => { const t = fs.readFileSync(path.join(dir, 'integrations.json'), 'utf8'); const v = (JSON.parse(t).integrations[`desktop-signin/${HOST}`] || {}).values || {}; return t.includes(PW) || !BOX_CIPHERTEXT_RE.test(String(v.password || '')) ? 'RED' : 'GREEN'; };
  ok(sealCensus(dataDir.replace(/data$/, 'data-c1')) === 'GREEN' && sealCensus(dir3) === 'RED', 'CONTROL: the row\'s password NOT secret ⇒ integrations.json holds the plaintext — the seal census is RED (GREEN on the real row)');
  // (c) a relay that ignores the remembered sign-in ⇒ §3's viewer is asked
  const relaySrc = fs.readFileSync(path.join(repo, 'src/server/stream-relay-rfb.js'), 'utf8');
  const pass1 = '  return (a) => bridgeRfb(a.ws, a.id, a.port, a.viewerId, a.req, a.signIn || null);\n';
  ok(relaySrc.includes(pass1), 'the relay\'s signIn hand-over line');
  const blindRelay = MUT.write('src/server/stream-relay-rfb.js', relaySrc.replace(pass1, pass1.replace('a.signIn || null', 'null')), 'blind');
  const regsSrc = fs.readFileSync(path.join(repo, 'src/server/stream-relays.js'), 'utf8');
  const regs = MUT.write('src/server/stream-relays.js', regsSrc.replace("require('./stream-relay-rfb.js')", `require(${JSON.stringify(blindRelay)})`), 'blind');
  const dsSrc = fs.readFileSync(path.join(repo, 'src/server/desktop-stream.js'), 'utf8');
  const DSb = MUT.load('src/server/desktop-stream.js', dsSrc.replace("require('./stream-relays.js')", `require(${JSON.stringify(regs)})`), 'blind');
  await api('POST', '/api/desktop/machine-desktop/signin', { host: HOST, password: PW });
  const real = bridge;
  bridge = DSb.create({ auth: { requestAuthed: () => true }, log: quiet, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
  const vb = await viewer(HOST);
  bridge = real;
  const vr = await viewer(HOST);
  ok(vb.how === 'asked' && vr.how === 'hub', 'CONTROL: a relay that ignores the remembered sign-in ⇒ the viewer is asked [2] (the real one: signed in by the hub)', { blind: vb.how, real: vr.how });
});

await section('§10 the words', async () => {
  const zh = (await import(pathToFileURL(path.join(repo, 'src/lib/i18n-zh.js')).href)).default;
  const ja = (await import(pathToFileURL(path.join(repo, 'src/lib/i18n-ja.js')).href)).default;
  const keys = ['Remember this machine’s sign-in', 'The remembered password did not work — type it again', 'The vault is locked — unlock it to sign in automatically', 'Forget sign-in', 'Sign-in remembered', '{machine}’s sign-in remembered — sealed in the vault', '{machine}’s sign-in forgotten', 'Could not remember the sign-in: {why}',
    '{machine} asks for its VNC password. VibeSpace seals it in the vault and signs in by itself while the vault is unlocked.', '{machine} asks for your Mac user name and password. VibeSpace seals them in the vault and signs in by itself while the vault is unlocked.', 'Desktop sign-in', 'Used by the desktop window of a paired Windows or macOS machine'];
  const missing = keys.filter((k) => !zh[k] || !ja[k]);
  ok(!missing.length, `every new key has zh + ja (${keys.length})`, missing);
  ok(zh['Remember this machine’s sign-in'] === '记住这台机器的登录' && zh['The remembered password did not work — type it again'] === '上次记住的密码不对，请重输' && zh['The vault is locked — unlock it to sign in automatically'] === '保险库已锁定——先解锁后可自动登录' && zh['Forget sign-in'] === '忘掉登录' && zh['Sign-in remembered'] === '登录已记住', 'the brief\'s zh words verbatim: 记住这台机器的登录 · 上次记住的密码不对，请重输 · 保险库已锁定——先解锁后可自动登录 · 忘掉登录 · 登录已记住');
});

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 5 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);
try { srv.close(); } catch { }
for (const { m } of Object.values(MACHINES)) m.close();
try { access.shutdown(); } catch { }
try { eng.close(); } catch { }
try { fs.rmSync(root, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
