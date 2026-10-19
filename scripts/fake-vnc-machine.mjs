// A STAND-IN MACHINE VNC SERVER THAT CHECKS THE SIGN-IN (lane desktop-vnc-remember) — shared by scripts/test-desktop-signin.mjs
// (fast) and scripts/test-desktop-signin-chrome.mjs (heavy). RFB 3.8 with the security types of `mode`:
//   vnc [2] · tight [16] (TightVNC: no tunnels, the STDVVNCAUTH_ sub-auth) · tight2 [16, 2] · ard [30] (a Mac's Screen Sharing:
//   DH over the Oakley group 2 prime, AES-128-ECB) · mslogon [113] (UltraVNC — a type the hub does not speak: refused) · none [1]
//   · rfb33 (an RFB 3.3 server: it picks VNC auth itself as a u32 — the hub never answers one; verify r1)
// The answer is judged by code the hub does not share: VNC auth by noVNC's OWN DES (node_modules/@novnc/novnc/core/crypto/des.js,
// key = the password's characters as noVNC's genDES spells them), ARD by node's DiffieHellman + AES. A wrong answer gets
// SecurityResult 1 + "Authentication failed" and the connection ends. A tiny framebuffer (64×48, one colour) answers every
// non-incremental update request so a real noVNC reaches "connected". NOT a test-*.mjs (no tier) — like scratch.mjs.
// Every connection is a row of `seen`: { n, types, type, verdict: none | ok | refused, user, session }.
import net from 'node:net';
import crypto from 'node:crypto';
import { DESECBCipher } from '../node_modules/@novnc/novnc/core/crypto/des.js';

export const OAKLEY2 = Buffer.from('FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE65381FFFFFFFFFFFFFFFF', 'hex');
const TYPES = { vnc: [2], tight: [16], tight2: [16, 2], ard: [30], mslogon: [113], none: [1], rfb33: [2] };
const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const pad = (b, len) => (b.length >= len ? b.subarray(b.length - len) : Buffer.concat([Buffer.alloc(len - b.length), b]));
/** noVNC's own answer to a VNC challenge (RFB.genDES: the password's characters → noVNC's DES, its key bit order inside). */
export function novncDes(password, challenge) {
  const key = String(password).split('').map((c) => c.charCodeAt(0));
  return Buffer.from(DESECBCipher.importKey(key).encrypt({ name: 'DES-ECB' }, new Uint8Array(challenge)));
}

export function fakeVncMachine({ mode = 'vnc', password = '', username = null, name = 'FAKE-DESK', w = 64, h = 48, colour = [40, 150, 70] } = {}) {
  const st = { mode, password, username, refuseBefore: null };
  const seen = [];
  const conns = new Set();
  const server = net.createServer((sock) => {
    const types = TYPES[st.mode];
    const row = { n: seen.length + 1, types, type: null, verdict: 'none', user: null, session: false };
    seen.push(row);
    conns.add(sock); sock.on('close', () => conns.delete(sock)); sock.on('error', () => { });
    let buf = Buffer.alloc(0), stage = 'version', challenge = null, dh = null;
    sock.write(st.mode === 'rfb33' ? 'RFB 003.003\n' : 'RFB 003.008\n');
    const refuse = () => { row.verdict = 'refused'; const r = Buffer.from('Authentication failed'); sock.write(Buffer.concat([u32(1), u32(r.length), r])); sock.end(); stage = 'dead'; };
    const pass = () => { row.verdict = 'ok'; sock.write(u32(0)); stage = 'clientinit'; };
    const judge = (good) => (good ? pass() : refuse());
    const vncChallenge = () => { challenge = crypto.randomBytes(16); sock.write(challenge); stage = 'vnc'; };
    const frame = () => { const px = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { px[i * 4] = colour[0]; px[i * 4 + 1] = colour[1]; px[i * 4 + 2] = colour[2]; } return Buffer.concat([Buffer.from([0, 0]), u16(1), u16(0), u16(0), u16(w), u16(h), u32(0), px]); };
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (stage === 'dead') return;
        if (stage === 'version') {
          if (buf.length < 12) return;
          buf = buf.subarray(12);
          if (st.mode === 'rfb33') { sock.write(u32(2)); row.type = 2; vncChallenge(); continue; } // RFB 3.3: the server picks (a u32 type), then the challenge
          if (st.refuseBefore) { const r = Buffer.from(st.refuseBefore); sock.write(Buffer.concat([Buffer.from([0]), u32(r.length), r])); sock.end(); stage = 'dead'; return; }
          sock.write(Buffer.from([types.length, ...types])); stage = 'type'; continue;
        }
        if (stage === 'type') {
          if (buf.length < 1) return;
          const t = buf[0]; buf = buf.subarray(1); row.type = t;
          if (!types.includes(t)) { refuse(); return; }
          if (t === 1) { pass(); continue; }
          if (t === 2) { vncChallenge(); continue; }
          if (t === 16) { sock.write(Buffer.concat([u32(0), u32(1), u32(2), Buffer.from('STDVVNCAUTH_')])); stage = 'tight'; continue; }
          if (t === 30) { dh = crypto.createDiffieHellman(OAKLEY2, Buffer.from([2])); dh.generateKeys(); sock.write(Buffer.concat([Buffer.from([0, 2]), u16(128), OAKLEY2, pad(dh.getPublicKey(), 128)])); stage = 'ard'; continue; }
          refuse(); return;
        }
        if (stage === 'tight') { if (buf.length < 4) return; const c = buf.readUInt32BE(0); buf = buf.subarray(4); if (c !== 2) { refuse(); return; } vncChallenge(); continue; }
        if (stage === 'vnc') { if (buf.length < 16) return; const r = buf.subarray(0, 16); buf = buf.subarray(16); judge(Buffer.compare(novncDes(st.password, challenge), r) === 0); continue; }
        if (stage === 'ard') {
          if (buf.length < 256) return;
          const ct = buf.subarray(0, 128), cpub = buf.subarray(128, 256); buf = buf.subarray(256);
          const key = crypto.createHash('md5').update(pad(dh.computeSecret(cpub), 128)).digest();
          const dc = crypto.createDecipheriv('aes-128-ecb', key, null); dc.setAutoPadding(false);
          const pt = Buffer.concat([dc.update(ct), dc.final()]);
          const cut = (b) => { const z = b.indexOf(0); return b.subarray(0, z < 0 ? b.length : z).toString('utf8'); };
          row.user = cut(pt.subarray(0, 64));
          judge(row.user === st.username && cut(pt.subarray(64, 128)) === st.password); continue;
        }
        if (stage === 'clientinit') {
          if (buf.length < 1) return;
          buf = buf.subarray(1); row.session = true;
          const nm = Buffer.from(name);
          sock.write(Buffer.concat([u16(w), u16(h), Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0]), u32(nm.length), nm]));
          stage = 'messages'; continue;
        }
        if (stage === 'messages') {
          if (!buf.length) return;
          const t = buf[0];
          const need = t === 0 ? 20 : t === 2 ? (buf.length >= 4 ? 4 + 4 * buf.readUInt16BE(2) : 1e9) : t === 3 ? 10 : t === 4 ? 8 : t === 5 ? ((buf.length >= 2 && (buf[1] & 0x80)) ? 7 : 6) : t === 6 ? (buf.length >= 8 ? 8 + Math.abs(buf.readInt32BE(4)) : 1e9) : t === 150 ? 10 : t === 248 ? (buf.length >= 9 ? 9 + buf[8] : 1e9) : t === 251 ? (buf.length >= 8 ? 8 + 16 * buf[6] : 1e9) : t === 255 ? 12 : 1;
          if (buf.length < need) return;
          if (t === 3 && !buf[1]) sock.write(frame());
          buf = buf.subarray(need); continue;
        }
        return;
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, seen, st, close: () => { for (const s of conns) s.destroy(); server.close(); } })));
}
