#!/usr/bin/env node
// test-host-key-known — lane lg-remote-hardening, row B-7f0b (the coordinator's r1220 (2)): «NOT PINNED» SAID ON THE ROW, AND ONE
// PRESS PINS THE KEY THIS HUB ALREADY TRUSTS. FAST: a STAND-IN known_hosts file in a temp folder (never the hub user's real one),
// a real HostManager in a temp data folder; no ssh is run (the pin's connection drop is stood in).
//   ① THE READER (host-keys.js knownKeysOf): the record's own name (`host`, `[host]:port` off 22), a hashed name by its HMAC; each
//      line judged alone (a marker, a wildcard, a bad line elsewhere costs nothing); another host's key never; no file ⇒ none.
//      REDs: the whole file judged at once (one marker line blocks every key); the name without its port (another port's key)
//   ② THE PRESS (hosts.js pinKnownHostKeys): the record pinned with exactly those keys, its pin file written; a record the hub
//      trusts no key for refused BY NAME (host-key-not-known — the page then opens the scan-and-confirm); a dial record refused;
//      a pinned record unchanged; nothing pins by itself (the boot never calls it)
//   ③ THE ROUTE and THE PAGE: POST …/host-keys/known, human only; the row's «not pinned» chip and press, «Pin all N», the scan on
//      host-key-not-known; zh / ja
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';   // FIRST after node's own (§113: a suite runs on a temp home before any of its code)
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-host-key-known-'));
const M = mutantCopies('host-key-known', REPO);
const HK = require('../src/host-keys.js');

// ssh-ed25519 / ecdsa wire blobs, built here (a key whose own bytes name its type — THE judge's rule)
const blob = (type, n) => { const t = Buffer.from(type), body = crypto.createHash('sha256').update(type + n).digest(); const b = Buffer.alloc(8 + t.length + 32); b.writeUInt32BE(t.length, 0); t.copy(b, 4); b.writeUInt32BE(32, 4 + t.length); body.copy(b, 8 + t.length); return b.toString('base64'); };
const ED = (n) => blob('ssh-ed25519', n);
const hashedName = (name, salt = crypto.randomBytes(20)) => `|1|${salt.toString('base64')}|${crypto.createHmac('sha1', salt).update(name).digest('base64')}`;
const KA = ED('a'), KB = ED('b'), KP = ED('port'), KO = ED('other'), KH = ED('hashed');
const known = path.join(tmp, 'known_hosts');
fs.writeFileSync(known, [
  '# the hub user\'s known_hosts, stood in',
  '@revoked * ssh-ed25519 ' + ED('revoked'),          // a marker line: never a pin, and it costs no other line its read
  'gpu-a ssh-ed25519 ' + KA,
  '*.example.test ssh-ed25519 ' + ED('wild'),          // a wildcard line: skipped
  'not a key line at all',
  'other-box ssh-ed25519 ' + KO,
  '[gpu-a]:2222 ssh-ed25519 ' + KP,
  hashedName('gpu-a') + ' ssh-ed25519 ' + KH,
  'gpu-a,10.0.0.7 ssh-ed25519 ' + KA,                  // the same key again (a second name): kept once
].join('\n') + '\n');

console.log('① THE READER: the keys this hub already trusts for a record');
{
  const k22 = await HK.knownKeysOf({ host: 'GPU-A', port: 22 }, { file: known });
  const k2222 = await HK.knownKeysOf({ host: 'gpu-a', port: 2222 }, { file: known });
  const none = await HK.knownKeysOf({ host: 'nobody', port: 22 }, { file: known });
  const nofile = await HK.knownKeysOf({ host: 'gpu-a', port: 22 }, { file: path.join(tmp, 'absent') });
  ok(k22.length === 2 && k22.some((k) => k.key === KA) && k22.some((k) => k.key === KH) && k22.every((k) => k.fp === HK.fingerprintOf(k.key)) && !k22.some((k) => k.key === KO || k.key === KP),
    `port 22: its plain line and its HASHED line (${k22.length} keys, the repeat once) — not another host's, not another port's; a marker / wildcard / bad line elsewhere costs nothing`);
  ok(k2222.length === 1 && k2222[0].key === KP && none.length === 0 && nofile.length === 0, `port 2222: only its [host]:port line; a host it trusts nothing for, and no file at all: none`);
  const SRC = read('src/host-keys.js');
  const Whole = M.load('src/host-keys.js', anchored(SRC, "  for (const line of text.split('\\n')) {\n    const p = SKF.parseKnownHosts(line + '\\n');\n", "  for (const line of [text]) {\n    const p = SKF.parseKnownHosts(line);\n", 'whole-file'), 'whole-file');
  const w = await Whole.knownKeysOf({ host: 'gpu-a', port: 22 }, { file: known });
  ok(w.length === 0, `CONTROL (the whole file judged at once, a copy): one marker line elsewhere blocks every key (${w.length}) — RED`);
  const NoPort = M.load('src/host-keys.js', anchored(SRC, "  const want = SKF.knownHostName(port !== 22 ? `${aliasOf(h)}:${port}` : aliasOf(h));\n", "  const want = SKF.knownHostName(aliasOf(h));\n", 'no-port'), 'no-port');
  const np = await NoPort.knownKeysOf({ host: 'gpu-a', port: 2222 }, { file: known });
  ok(np.some((k) => k.key === KA), 'CONTROL (the name without its port, a copy): the port-2222 record would pin the port-22 key — RED');
}

console.log('② THE PRESS: one press pins exactly those keys; none ⇒ refused by name');
{
  const { HostManager } = require('../src/hosts.js');
  const hm = new HostManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'hub-')) });
  hm._dropConnections = () => { };   // no ssh in this suite
  hm.persisted = async () => true;   // the store's landing stood in (test-host-key-pin drives the refused road)
  hm._state.hosts.push({ id: 'h1', name: 'gpu-a', host: 'gpu-a', port: 22, transport: 'ssh' }, { id: 'h2', name: 'nobody', host: 'nobody', port: 22, transport: 'ssh' }, { id: 'h3', name: 'phone', host: 'phone', transport: 'dial' });
  const v = await hm.pinKnownHostKeys('h1', { file: known });
  const rec = hm._state.hosts.find((x) => x.id === 'h1'), pinFile = HK.pinFileOf(hm._sshDir, 'h1');
  ok(v.hostKeys && v.hostKeys.length === 2 && rec.hostKeys.length === 2 && rec.hostKeysAt > 0 && fs.existsSync(pinFile) && fs.readFileSync(pinFile, 'utf8').includes(KA),
    `gpu-a pinned with the two keys this hub already trusts, its pin file written (${v.hostKeys && v.hostKeys.map((k) => k.fp.slice(0, 14)).join(', ')})`);
  let e2 = null; try { await hm.pinKnownHostKeys('h2', { file: known }); } catch (e) { e2 = e; }
  let e3 = null; try { await hm.pinKnownHostKeys('h3', { file: known }); } catch (e) { e3 = e; }
  ok(e2 && e2.code === 'host-key-not-known' && !hm._state.hosts.find((x) => x.id === 'h2').hostKeys && e3 && e3.code === 'host-key-no-ssh',
    `a record this hub trusts no key for: refused by name («${e2 && e2.message}») and left unpinned; a dial record refused`);
  const again = await hm.pinKnownHostKeys('h1', { file: path.join(tmp, 'absent') });
  ok(again.hostKeys && again.hostKeys.length === 2, 'a pinned record is left as it is');
  const HS = read('src/hosts.js');
  ok((HS.split('pinKnownHostKeys(').length - 1) === 1 && !/pinKnownHostKeys/.test(read('server.js')),
    'nothing pins by itself: the press is its only caller (the route)');
  // THE FILE THE PRESS READS, DRIVEN: the account's entry (stood in: os.userInfo) names one home, $HOME another; ssh trusted the
  // key into the ACCOUNT's file, so that is the one read. RED: the $HOME road (os.homedir()) names the other file.
  const realUserInfo = os.userInfo, realHome = process.env.HOME;
  const pwHome = path.join(tmp, 'pw-home'), envHome = path.join(tmp, 'env-home');
  let kf = null, viaEnv = null;
  try {
    os.userInfo = () => ({ uid: 1, gid: 1, username: 'userL', homedir: pwHome, shell: null });
    process.env.HOME = envHome;
    kf = hm._knownHostsFile(); viaEnv = path.join(os.homedir(), '.ssh', 'known_hosts');
  } finally { os.userInfo = realUserInfo; process.env.HOME = realHome; }
  ok(kf === path.join(pwHome, '.ssh', 'known_hosts') && viaEnv === path.join(envHome, '.ssh', 'known_hosts') && kf !== viaEnv,
    `the file is the ACCOUNT's home's known_hosts, as ssh reads it (${kf && path.relative(tmp, kf)}); RED: the $HOME road names ${viaEnv && path.relative(tmp, viaEnv)}`);
}

console.log('③ THE ROUTE and THE PAGE');
{
  const XR = read('src/server/exit-routes.js'), SM = read('src/lib/sidebar-mounts.js');
  ok(/app\.post\('\/api\/hosts\/:id\/host-keys\/known', async \(req, res\) => \{\n  if \(hostKeyHumanOnly\(req, res\)\) return;\n  try \{ const v = await hosts\.pinKnownHostKeys\(req\.params\.id\);/.test(XR),
    'POST /api/hosts/:id/host-keys/known: human only, the press with no file from the caller');
  ok(SM.includes("top.appendChild(pinChip('stale', { text: tr('not pinned')") && SM.includes("pb.textContent = tr('Pin key');") && SM.includes("await api(`/api/hosts/${encodeURIComponent(h.id)}/host-keys/known`, { method: 'POST' });")
    && SM.includes("if (e && e.code === 'host-key-not-known') { if (one) {") && SM.includes("this._showHostKeyDialog(h, { scanNow: true }); } return 'unknown'; }") && SM.includes('if (unpinned.length >= 2) {'),
    'the row says «not pinned» with its press; a record the hub trusts no key for opens the scan-and-confirm; «Pin all N» when there are several');
  for (const lang of ['zh', 'ja']) {
    const T = read(`src/lib/i18n-${lang}.js`);
    const keys = ['not pinned', 'Pin key', 'Pin all {n}', '{n} pinned.', 'This hub trusts no key for {name} yet — check the key it shows now.'];
    ok(keys.every((k) => T.includes(JSON.stringify(k) + ':')), `…its words have their ${lang} rows`);
  }
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
fs.rmSync(tmp, { recursive: true, force: true });
report();
