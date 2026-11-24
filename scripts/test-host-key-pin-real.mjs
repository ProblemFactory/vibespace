#!/usr/bin/env node
// A MACHINE'S SSH HOST KEY, PINNED — THE REAL ROAD (lane lg-remote-hardening, B-7f0b — design q-042 D6). HEAVY (THE TIER
// RULE: real ssh). The fast half is test-host-key-pin. Here the REAL HostManager dials a private sshd on loopback as this
// user — scratch host keys, AuthorizedKeysFile /dev/null: no login ever happens (ssh checks the host key BEFORE any login),
// run in the foreground (-D) as THIS process's child and ended on every way out. Legs: the scan learns the key the
// stand-in shows (ssh-keygen's own fingerprint of it); unpinned ⇒ accept-new; pinned + the same key ⇒ the strict check
// passes (a data dir with a space); THE SWAP (the same address, another host key) ⇒ refused BY NAME, host-key-changed, with
// the fingerprint shown, and the For-you watch hears it; the machine's Test says the same; pinning a key no longer shown ⇒
// host-key-not-seen; re-pin / unpin. RED: a copy whose sshArgs ignores the pin trusts the swapped key. ssh reads `~` from the
// PASSWD entry, never $HOME — a PATH shim (-F /dev/null) hands any ssh naming no UserKnownHostsFile a scratch file, so no run
// writes the box user's own ~/.ssh/known_hosts. SKIPs with evidence without ssh / ssh-keygen / sshd, or an sshd that will not listen.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string' || !n) throw new TypeError('ok(cond, name): the name is no string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const which = (b) => { try { return execFileSync('sh', ['-c', `command -v ${b}`], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const SSHD = '/usr/sbin/sshd', SSH = which('ssh'), KEYGEN = which('ssh-keygen');
if (!SSH || !KEYGEN || !fs.existsSync(SSHD)) { console.log(`  - SKIP: ${!SSH ? 'no ssh' : !KEYGEN ? 'no ssh-keygen' : 'no ' + SSHD} on this machine`); console.log('\nALL PASS (0)'); process.exit(0); }
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hkpr-'));
const saved = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: process.env.HOME };
fs.mkdirSync(path.join(SCR, 't')); process.env.TMPDIR = path.join(SCR, 't'); // the ControlPath dir + the scan's scratch: this run's own
fs.mkdirSync(path.join(SCR, 'home')); process.env.HOME = path.join(SCR, 'home');
let sshd = null;
const endSshd = () => { if (sshd && sshd.exitCode === null && sshd.signalCode === null) { try { sshd.kill('SIGTERM'); } catch { } } };
process.on('exit', () => { endSshd(); Object.assign(process.env, saved); try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { /* gone */ } });
const HK = require('../src/host-keys.js');
const { HostManager } = require('../src/hosts.js');
const R = path.join(SCR, 'real'); fs.mkdirSync(path.join(R, 'shim'), { recursive: true });
for (const n of ['hostA', 'hostB', 'user']) execFileSync(KEYGEN, ['-q', '-t', 'ed25519', '-N', '', '-C', 'fixture', '-f', path.join(R, n)], { stdio: 'ignore' });
const fpOf = (n) => execFileSync(KEYGEN, ['-l', '-E', 'sha256', '-f', path.join(R, n + '.pub')], { encoding: 'utf8' }).split(/\s+/)[1];
const keyOf = (n) => fs.readFileSync(path.join(R, n + '.pub'), 'utf8').split(/\s+/)[1];
const port = await new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const listening = () => new Promise((res) => { const c = net.connect(port, '127.0.0.1', () => { c.destroy(); res(true); }).once('error', () => res(false)); });
/** the stand-in, in the foreground as our child; → true once its port answers */
async function startSshd(hostKey) {
  fs.writeFileSync(path.join(R, 'sshd_config'), `Port ${port}\nListenAddress 127.0.0.1\nHostKey ${path.join(R, hostKey)}\nPidFile none\nAuthorizedKeysFile /dev/null\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nStrictModes no\n`);
  sshd = spawn(SSHD, ['-D', '-f', path.join(R, 'sshd_config'), '-E', path.join(R, 'sshd.log')], { stdio: 'ignore' });
  for (let i = 0; i < 100 && sshd.exitCode === null; i++) { if (await listening()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
}
async function stopSshd() {
  if (!sshd || sshd.exitCode !== null || sshd.signalCode !== null) return;
  const gone = new Promise((r) => sshd.once('exit', r)); endSshd(); await gone;
  for (let i = 0; i < 50 && (await listening()); i++) await new Promise((r) => setTimeout(r, 40));
}
const thr = async (p) => { try { await p; return null; } catch (e) { return e; } };
const homeKh = path.join(R, 'home-known_hosts');
fs.writeFileSync(path.join(R, 'shim', 'ssh'), `#!/bin/sh\nset -- -F /dev/null "$@"\ncase "$*" in *UserKnownHostsFile=*) ;; *) set -- -o UserKnownHostsFile=${homeKh} -o GlobalKnownHostsFile=/dev/null "$@" ;; esac\nexec ${SSH} "$@"\n`, { mode: 0o755 });
process.env.PATH = path.join(R, 'shim') + ':' + saved.PATH;

console.log('— the real road: scan, pin, a key swap refused by name —');
if (!(await startSshd('hostA'))) console.log(`  - SKIP: the stand-in sshd did not listen (${(() => { try { return fs.readFileSync(path.join(R, 'sshd.log'), 'utf8').trim().split('\n').pop(); } catch { return 'no log'; } })()})`);
else {
  const realDir = path.join(SCR, 'real data'); fs.mkdirSync(realDir);
  const hm = new HostManager({ dataDir: realDir });
  const refusedSeen = [];
  hm.onHostKeyRefused = (h, e) => refusedSeen.push({ id: h.id, fp: e.fp });
  const id = hm.add({ name: 'loop', user: os.userInfo().username, host: '127.0.0.1', port, keyPath: path.join(R, 'user') });
  const dial = (mgr) => thr(mgr._ssh(mgr.get(id), 'true', { fresh: true, timeoutMs: 15000 }));
  const seen = await hm.hostKeyScan(id);
  ok(seen.length === 1 && seen[0].type === 'ssh-ed25519' && seen[0].fp === fpOf('hostA'), 'the scan: ONE fresh ssh over the record\'s road learns the key the stand-in shows — ssh-keygen\'s own fingerprint of it (no login happened)', seen.map((k) => k.fp));
  const e0 = await dial(hm);
  ok(e0 && !e0.code && /Permission denied/.test(e0.message), 'unpinned: ssh trusts the first key (accept-new) and goes on to the login — refused by the stand-in, as every login here is', e0 && e0.message);
  const v = await hm.pinHostKeys(id, [fpOf('hostA')]);
  ok(v.hostKeys && v.hostKeys[0].fp === fpOf('hostA') && fs.readFileSync(HK.pinFileOf(hm._sshDir, id), 'utf8') === `127.0.0.1 ssh-ed25519 ${keyOf('hostA')}\n`, 'pinned: the record carries the key the machine showed again at that moment; its file holds it under the alias');
  const e1 = await dial(hm);
  ok(e1 && !e1.code && /Permission denied/.test(e1.message), 'pinned, the same key: the strict check passes (the quoted file under a data dir with a space, the alias without the port) and ssh goes on to the login', e1 && e1.message);
  await stopSshd();
  ok(await startSshd('hostB'), 'THE SWAP: the same address now answers with another host key');
  const e2 = await dial(hm);
  ok(e2 && e2.code === 'host-key-changed' && e2.fp === fpOf('hostB') && e2.pinned === true && /loop showed an ssh host key that is not the key pinned for it/.test(e2.message) && refusedSeen.length === 1 && refusedSeen[0].fp === fpOf('hostB'),
    'pinned, ANOTHER key: refused BY NAME (host-key-changed) with the fingerprint the stand-in really showed, and the watch hears it', e2 && { code: e2.code, fp: e2.fp, m: e2.message.slice(0, 160) });
  const e3 = await thr(hm.test(id));
  ok(e3 && e3.code === 'host-key-changed', 'the machine\'s Test says the same refusal by name (the row\'s «host key changed»)', e3 && e3.message);
  const e4 = await thr(hm.pinHostKeys(id, [fpOf('hostA')]));
  ok(e4 && e4.code === 'host-key-not-seen' && hm.get(id).hostKeys[0].fp === fpOf('hostA'), 'pinning a key the machine no longer shows is refused (host-key-not-seen) — the pin stays as it was', e4 && e4.message);
  // RED CONTROL: a copy whose sshArgs ignores the pin (accept-new, the road before this lane) trusts the swapped key
  const SRC = read('src/hosts.js');
  // the move onto 6ce6b8124: sshArgs' own lines (B-2ca0's port / jump words; the multiplex guard) — sshCmd holds the same args line,
  // so the anchor runs to the multiplex line, which only sshArgs has
  const from = "    const args = [...HK.hostKeyOpts(this._sshDir, h), ...SSH_BASE_OPTS, ...portArgsOf(h), ...this._tailnetOpts(h), ...jumpArgsOf(h, this._sshDir)];\n    if (h.keyPath) args.push('-i', h.keyPath, '-o', 'IdentitiesOnly=yes');\n    if (multiplex && cmUsable(this)) {";
  ok(SRC.includes(from), 'control: sshArgs puts the record\'s host-key check first (the anchor)', from.slice(0, 80));
  const M = mutantCopies('host-key-pin-real', REPO);
  const Mut = M.load('src/hosts.js', anchored(SRC, from, from.replace('...HK.hostKeyOpts(this._sshDir, h), ', "'-o', 'StrictHostKeyChecking=accept-new', "), 'pin-ignored'), 'pin-ignored');
  fs.rmSync(homeKh, { force: true }); // the fresh pod's scene: the hub user's known_hosts holds nothing yet (accept-new TRUSTS a first key, never a changed one)
  const eM = await dial(new Mut.HostManager({ dataDir: realDir }));
  ok(eM && !eM.code && /Permission denied/.test(eM.message) && fs.readFileSync(homeKh, 'utf8').includes(keyOf('hostB')),
    'RED CONTROL: a copy that ignores the pin TRUSTS the swapped key (it lands in the scratch file standing in for the hub user\'s known_hosts) and goes on to the login — the leg above refuses that', eM && eM.message);
  const v2 = await hm.pinHostKeys(id, [fpOf('hostB')]);
  const e5 = await dial(hm);
  ok(v2.hostKeys[0].fp === fpOf('hostB') && e5 && !e5.code && /Permission denied/.test(e5.message), 'pinned again (the new key, after comparing): the strict check passes', e5 && e5.message);
  await hm.unpinHostKeys(id); // it waits for its record to land (2.369.411's hosts store writes off the loop)
  ok(!HK.pinned(hm.get(id)) && !fs.existsSync(HK.pinFileOf(hm._sshDir, id)) && hm.sshArgs(hm.get(id))[1] === 'StrictHostKeyChecking=accept-new', 'unpinned: the record and its file forget the key; accept-new again');
  ok(!/Accepted /.test(fs.readFileSync(path.join(R, 'sshd.log'), 'utf8')), 'the stand-in sshd accepted no login at all');
}
await stopSshd();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
