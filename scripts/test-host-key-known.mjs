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
  // r1602 (1): A KEY THE FILE REVOKES IS NEVER PINNED — the revocation names the PLAIN line's own key (whatever its host pattern)
  const KR = ED('revoked-own'), KQ = ED('revoked-elsewhere'), KK = ED('kept');
  const rev = path.join(tmp, 'known_hosts.revoked');
  fs.writeFileSync(rev, ['box-r ssh-ed25519 ' + KR, '@revoked * ssh-ed25519 ' + KR, 'box-q ssh-ed25519 ' + KQ, '@revoked some-other-host ssh-ed25519 ' + KQ, 'box-k ssh-ed25519 ' + KK, 'box-k ssh-ed25519 ' + KQ].join('\n') + '\n');
  const r1 = await HK.knownKeysOf({ host: 'box-r', port: 22 }, { file: rev }), r2 = await HK.knownKeysOf({ host: 'box-q', port: 22 }, { file: rev }), r3 = await HK.knownKeysOf({ host: 'box-k', port: 22 }, { file: rev });
  ok(r1.length === 0 && r2.length === 0 && r3.length === 1 && r3[0].key === KK && HK.revokedKeysOf(fs.readFileSync(rev, 'utf8')).size === 2,
    `a key named by ANY @revoked line is never offered: revoked for every host (box-r: ${r1.length}), revoked under another host's name (box-q: ${r2.length}); what is left decides (box-k: its one other key)`);
  // the cure round's legs: an @revoked line under a HASHED name, one beside an @cert-authority line (the host field never matters)
  const KHR = ED('revoked-hashed'), KC = ED('beside-ca'), KCA = ED('a-ca');
  const rev2 = path.join(tmp, 'known_hosts.revoked2');
  fs.writeFileSync(rev2, ['box-h ssh-ed25519 ' + KHR, '@revoked ' + hashedName('box-h') + ' ssh-ed25519 ' + KHR, '@cert-authority *.example.test ssh-ed25519 ' + KCA, 'box-c ssh-ed25519 ' + KC, '@revoked box-c ssh-ed25519 ' + KC, 'box-ca ssh-ed25519 ' + KCA].join('\n') + '\n');
  const q1 = await HK.knownKeysOf({ host: 'box-h', port: 22 }, { file: rev2 }), q2 = await HK.knownKeysOf({ host: 'box-c', port: 22 }, { file: rev2 }), q3 = await HK.knownKeysOf({ host: 'box-ca', port: 22 }, { file: rev2 });
  ok(q1.length === 0 && q2.length === 0 && q3.length === 1 && q3[0].key === KCA,
    `an @revoked line under a HASHED name still revokes its key (box-h: ${q1.length}); one beside an @cert-authority line revokes its own key (box-c: ${q2.length}); the @cert-authority line is no revocation (box-ca keeps its key: ${q3.length})`);
  const Skip = M.load('src/host-keys.js', anchored(SRC, "    if (revoked.has(k.key)) continue;   // r1602 (1): revoked anywhere in the file ⇒ never this machine's pin\n", '', 'revoked-skipped'), 'revoked-skipped');
  const rr = await Skip.knownKeysOf({ host: 'box-r', port: 22 }, { file: rev });
  ok(rr.some((k) => k.key === KR), 'CONTROL (the release\'s reader: a marker line skipped, not honoured — a copy): the revoked key would be pinned — RED');
  // a file over the bound and one that cannot be read: refused by their own codes, never «no key yet», never the path
  const big = path.join(tmp, 'known_hosts.big');
  fs.writeFileSync(big, Buffer.alloc(HK.KNOWN_FILE_MAX + 16, 0x23));
  let eb = null; try { await HK.knownKeysOf({ host: 'gpu-a', port: 22 }, { file: big }); } catch (e) { eb = e; }
  let eu = null; try { await HK.knownKeysOf({ host: 'gpu-a', port: 22 }, { file: tmp }); } catch (e) { eu = e; }   // a folder: open answers, the read refuses (EISDIR)
  ok(eb && eb.code === 'host-key-known-too-big' && eu && eu.code === 'host-key-known-unreadable' && ![eb, eu].some((e) => e.message.includes(tmp)),
    `over the bound: refused by name («${eb && eb.message}»); unreadable: refused by name («${eu && eu.message}») — neither names the file's path`);
  fs.rmSync(big, { force: true });
}

console.log('② THE PRESS: one press pins exactly those keys; none ⇒ refused by name');
{
  const { HostManager } = require('../src/hosts.js');
  const rev = path.join(tmp, 'known_hosts.revoked');
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
  // r1602 (2): THE NAME ssh REALLY LOOKS UP — a record that takes its port or address from the hub user's ssh configuration
  // (viaConfig, the port left empty) is refused by name, even with a port-22 line of the same name present, and left unpinned
  hm._state.hosts.push({ id: 'h4', name: 'cfg-box', host: 'gpu-a', port: null, viaConfig: true, transport: 'ssh' }, { id: 'h5', name: 'imported', host: 'gpu-a', port: 22, transport: 'ssh', hostKeys: [{ type: 'ssh-ed25519', key: 'not-an-ssh-key' }] }, { id: 'h6', name: 'box-r', host: 'box-r', port: 22, transport: 'ssh' });
  let e4 = null; try { await hm.pinKnownHostKeys('h4', { file: known }); } catch (e) { e4 = e; }
  const wouldPin = await HK.knownKeysOf({ host: 'gpu-a', port: null }, { file: known });
  ok(e4 && e4.code === 'host-key-via-config' && !hm._state.hosts.find((x) => x.id === 'h4').hostKeys && wouldPin.some((k) => k.key === KA),
    `an ssh-configuration record: refused by name («${e4 && e4.message.slice(0, 80)}…») and left unpinned — RED: the reader alone names the port-22 line of the same name (another sshd) for it`);
  // the law's TRUE RED (the cure round's leg): a copy of the press with its viaConfig refusal taken out pins the port-22 line's key
  const HSRC = read('src/hosts.js');
  const viaLine = HSRC.split('\n').find((l) => l.startsWith('    if (h0.viaConfig) throw Object.assign(new Error(')) + '\n';
  const NoVia = M.load('src/hosts.js', anchored(HSRC, viaLine, '', 'no-via-config'), 'no-via-config');
  const hmR = new NoVia.HostManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'hub-red-')) });
  hmR._dropConnections = () => { }; hmR.persisted = async () => true;
  hmR._state.hosts.push({ id: 'h4', name: 'cfg-box', host: 'gpu-a', port: null, viaConfig: true, transport: 'ssh' });
  let pinnedR = null; try { pinnedR = await hmR.pinKnownHostKeys('h4', { file: known }); } catch { pinnedR = null; }
  ok(!!(pinnedR && pinnedR.hostKeys && pinnedR.hostKeys.some((k) => k.fp === HK.fingerprintOf(KA))),
    'RED (the press without its viaConfig refusal, a copy): the ssh-configuration record is pinned to the port-22 line\'s key — another sshd\'s');
  // a record whose pin was REFUSED as unusable is refused by that pin's words — never re-pinned from the file; its view says so
  let e5 = null; try { await hm.pinKnownHostKeys('h5', { file: known }); } catch (e) { e5 = e; }
  const r5 = hm._state.hosts.find((x) => x.id === 'h5');
  ok(e5 && e5.code === 'host-key-name' && r5.hostKeys.length === 1 && r5.hostKeys[0].key === 'not-an-ssh-key' && JSON.stringify(HK.pinView(r5)) === JSON.stringify({ hostKeys: null, hostKeysUnusable: true }) && HK.pinView({ host: 'x' }).hostKeysUnusable === undefined,
    `a refused (unusable) pin: the press refuses it by its own words (${e5 && e5.code}), the record unchanged; its view says hostKeysUnusable (the page offers no «not pinned»)`);
  // a revoked key through the press, and the file's own refusals carried by code (never the path)
  let e6 = null; try { await hm.pinKnownHostKeys('h6', { file: rev }); } catch (e) { e6 = e; }
  let e7 = null; try { await hm.pinKnownHostKeys('h2', { file: tmp }); } catch (e) { e7 = e; }
  ok(e6 && e6.code === 'host-key-not-known' && !hm._state.hosts.find((x) => x.id === 'h6').hostKeys && e7 && e7.code === 'host-key-known-unreadable' && !e7.message.includes(tmp),
    `the press: a machine whose only key is revoked is refused by name and left unpinned; an unreadable file is refused by its code («${e7 && e7.message.slice(0, 70)}…»)`);
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
    && SM.includes("const scan = !!e && ['host-key-not-known', 'host-key-via-config', 'host-key-known-too-big', 'host-key-known-unreadable'].includes(e.code);") && SM.includes("if (scan) this._showHostKeyDialog(h, { scanNow: true }); }") && SM.includes('if (unpinned.length >= 2) {'),
    'the row says «not pinned» with its press; no certain key (none trusted, an ssh-configuration name, the file over its bound or unreadable) opens the scan-and-confirm; «Pin all N» when there are several');
  // r1602: «Pin all N» names each machine that did not pin, in its own words; a REFUSED pin is offered no «not pinned»; the codes worded
  ok(SM.includes("else missed.push(o.words); }") && SM.includes("tr('{n} pinned; not pinned — {list}', { n: pinnedN, list: missed.join(' · ') })")
    && (SM.match(/!h\.hostKeysUnusable|!x\.hostKeysUnusable/g) || []).length === 2 && ['host-key-via-config', 'host-key-known-too-big', 'host-key-known-unreadable'].every((c) => SM.includes(`if (e && e.code === '${c}') return tr(`)),
    '«Pin all N» lists every machine that did not pin with its own words (never one count under one cause); a record with an unusable pin shows no «not pinned» and is not pressed; each new refusal worded by its code');
  for (const lang of ['zh', 'ja']) {
    const T = read(`src/lib/i18n-${lang}.js`);
    const keys = ['not pinned', 'Pin key', 'Pin all {n}', '{n} pinned.', 'This hub trusts no key for {name} yet — check the key it shows now.', '{n} pinned; not pinned — {list}',
      "{name} takes its address or port from this hub's ssh configuration, so its key cannot be named from the record — check the key it shows now.",
      "This hub's known_hosts file is over 4 MiB, so it is not read for a pin — check the key {name} shows now.", "This hub's known_hosts file could not be read — check the key {name} shows now."];
    ok(keys.every((k) => T.includes(JSON.stringify(k) + ':')), `…its words have their ${lang} rows`);
  }
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
fs.rmSync(tmp, { recursive: true, force: true });
report();
