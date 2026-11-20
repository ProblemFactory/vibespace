#!/usr/bin/env node
// A MACHINE'S SSH HOST KEY, PINNED (lane lg-remote-hardening, B-7f0b — design q-042 D6, approved by the owner 2026-10-19).
// A machine record used to be dialled with StrictHostKeyChecking=accept-new: the first key ssh met was trusted, and a pod
// has no known_hosts of its own. Now the person may PIN the key the machine shows (src/host-keys.js; the HostManager's
// hostKeyScan / pinHostKeys / unpinHostKeys; the routes /api/hosts/:id/host-keys) and every ssh of that record checks it
// strictly over the record's own file; a different key is refused BY NAME (host-key-changed) and said once in For you
// (src/server/host-key-watch.js, urgent) — the item OPENS that machine's Host key… dialog (主开发's verdict of 2026-11-18;
// RED: the release's key alone lands on Manage Agents). FAST legs (no real program — THE TIER RULE): ① the PURE table · ② the
// HostManager's options, files and page view · ④ the routes (an agent's bearer refused; RED: a copy without the person
// check) · ⑤ For you · the page. The REAL road — scan, pin, a key swap refused by name over real ssh against a private sshd
// on loopback, the pin-ignored RED copy — is the heavy test-host-key-pin-real.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string' || !n) throw new TypeError('ok(cond, name): the name is no string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hkp-'));
const saved = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: process.env.HOME };
// the HostManager's ControlPath dir and the scan's scratch follow os.tmpdir(): this run's own, never the hub's /tmp/vs-cm-<uid>
fs.mkdirSync(path.join(SCR, 't')); process.env.TMPDIR = path.join(SCR, 't');
fs.mkdirSync(path.join(SCR, 'home')); process.env.HOME = path.join(SCR, 'home');
process.on('exit', () => { Object.assign(process.env, saved); try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { /* gone */ } });
const HK = require('../src/host-keys.js');
const { HostManager } = require('../src/hosts.js');
const { UserTodoManager } = require('../src/user-todos.js');
const HW = require('../src/server/host-key-watch.js');
// a public-key blob in ssh's wire form (uint32 length + the type, uint32 length + 32 bytes) — built here, no ssh-keygen
const blob = (type, fill) => { const t = Buffer.from(type), b = Buffer.alloc(8 + t.length + 32, fill); b.writeUInt32BE(t.length, 0); t.copy(b, 4); b.writeUInt32BE(32, 4 + t.length); return b.toString('base64'); };

console.log('— ① PURE: the pin\'s names, file text, options, refusal —');
{
  const KA = blob('ssh-ed25519', 1), KB = blob('ssh-ed25519', 2);
  const h22 = { id: 'host-a', name: 'box', host: 'Box.Example.test', port: 22 }, h2222 = { id: 'host-b', name: 'box2', host: 'git.example.test', port: 2222 };
  ok(JSON.stringify(HK.namesOf(h22)) === '["box.example.test"]' && JSON.stringify(HK.namesOf(h2222)) === '["git.example.test"]' && HK.aliasOf(h2222) === 'git.example.test',
    'a pinned record is looked up by ONE name: its HostKeyAlias = the host as typed, lowercased (an alias looks up WITHOUT the port)');
  const pinnedRec = { ...h2222, hostKeys: [{ type: 'ssh-ed25519', key: KA, fp: HK.fingerprintOf(KA) }] };
  ok(HK.pinText(pinnedRec) === `git.example.test ssh-ed25519 ${KA}\n` && HK.pinText(h22) === '', 'the pin file holds every pinned key under the alias; an unpinned record has none');
  const o0 = HK.hostKeyOpts('/d/ssh', h22), o1 = HK.hostKeyOpts('/d s/ssh', pinnedRec);
  ok(o0.join(' ') === '-o StrictHostKeyChecking=accept-new' && o1.join(' ') === '-o StrictHostKeyChecking=yes -o HostKeyAlias=git.example.test -o UserKnownHostsFile="/d s/ssh/known_hosts.d/host-b" -o GlobalKnownHostsFile=/dev/null -o UpdateHostKeys=no',
    'options: unpinned ⇒ accept-new (as before); pinned ⇒ strict over the record\'s own file ALONE under its alias (no ssh config / tailnet IP moves the lookup), the path in double quotes (ssh splits an option value on spaces)', { o0, o1 });
  ok(HK.fingerprintOf(KA).startsWith('SHA256:') && !HK.fingerprintOf(KA).endsWith('=') && HK.fingerprintOf(KA) !== HK.fingerprintOf(KB), 'a fingerprint is ssh\'s own form: SHA256: + base64 without padding');
  const scan = HK.keysOfScan(`[127.0.0.1]:2222 ssh-ed25519 ${KA}\n127.0.0.1 ssh-ed25519 ${KA}\n[127.0.0.1]:2222 ssh-ed25519 ${KB}\nbroken line\n`);
  ok(scan.length === 0, 'a scan file that does not parse yields NO key (never a part of one)');
  const scan2 = HK.keysOfScan(`[127.0.0.1]:2222 ssh-ed25519 ${KA}\n127.0.0.1 ssh-ed25519 ${KA}\n[127.0.0.1]:2222 ssh-ed25519 ${KB}\n`);
  ok(scan2.length === 2 && scan2[0].fp === HK.fingerprintOf(KA) && scan2[1].key === KB, 'a scan\'s keys, deduplicated, each with its fingerprint (the names are the scan\'s own, ignored)');
  const banner = ['@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @', 'The fingerprint for the ED25519 key sent by the remote host is', 'SHA256:QgibyDN+7rw3QB56CaUdSmTUKuvnkFmSuWz1AmqpfwY.', 'Host key for [127.0.0.1]:2222 has changed and you have requested strict checking.', 'Host key verification failed.'].join('\n');
  const r1 = HK.hostKeyRefusal(pinnedRec, banner), r2 = HK.hostKeyRefusal(h22, 'No ED25519 host key is known for box and you have requested strict checking.\nHost key verification failed.'), r3 = HK.hostKeyRefusal(h22, 'me@box: Permission denied (publickey).');
  ok(r1 && r1.code === 'host-key-changed' && r1.fp === 'SHA256:QgibyDN+7rw3QB56CaUdSmTUKuvnkFmSuWz1AmqpfwY' && r1.pinned === true && /not the key pinned for it/.test(r1.message) && /Host key for \[127\.0\.0\.1\]:2222 has changed/.test(r1.sshLine) && r2 && r2.code === 'host-key-changed' && r2.pinned === false && /saw before/.test(r2.message) && r3 === null,
    'ssh\'s refusal of a key ⇒ host-key-changed BY NAME with the fingerprint it showed (pinned or not, worded for each); a refused LOGIN is not one', [r1 && r1.message, r2 && r2.message]);
  // 主开发's verdict of 2026-11-18: ONE door phrase (the For-you item says the same), and a machine never pinned is not told «again»
  const door2 = HK.DOOR.replace('{machine}', 'box2'), door1 = HK.DOOR.replace('{machine}', 'box');
  ok(HK.DOOR === 'Remote → {machine} → Host key…' && r1.message.includes(`pin it again in ${door2}`) && r2.message.includes(`pin the key it shows now in ${door1}`) && !/again/.test(r2.message) && HW.itemOf({ machine: 'box', fp: 'SHA256:x', pinned: false }).i18n.detail[1].key.includes(HK.DOOR),
    'the refusal names THE door (Remote → the machine → Host key…), the phrase the For-you item says; a pinned machine is told to pin it again, a machine never pinned to pin the key it shows now (never «again»)', [r1.message, r2.message]);
  ok(/Host key…$/.test(r1.message) && /Host key…$/.test(r2.message), 'the refusal ends on the door\'s own «…» — no fourth dot (the pictures\' second take saw «Host key….»)', [r1.message.slice(-30), r2.message.slice(-30)]);
  const many = Array.from({ length: 65 }, (_, k) => ({ type: 'ssh-ed25519', key: blob('ssh-ed25519', 10 + k) }));
  ok(HK.pinWhy({ id: 'host-m', name: 'm', host: 'plain.example.test', hostKeys: many }) === null && HK.nameWhy({ host: 'plain.example.test' }) === null && typeof HK.nameWhy({ host: 'a,b.example.test' }) === 'string' && typeof HK.nameWhy({ host: 'prod*' }) === 'string',
    'the NAME is what is judged, with no key needed (the scan\'s check too): 65 keys under a plain name are no address problem; a comma or a wildcard address is one');
  const junk = { id: 'host-j', name: 'j', host: 'plain.example.test', hostKeys: [{ type: 'ssh-ed25519', key: 'x' }] }, oJ = HK.hostKeyOpts('/d', junk);
  ok(!HK.pinned(junk) && /its pinned keys are not ssh host keys/.test(HK.pinUnusable(junk) || '') && oJ.includes('ProxyCommand=false') && !oJ.includes('StrictHostKeyChecking=accept-new') && HK.hostKeyRefusal(junk, '').code === 'host-key-name',
    'a record that CARRIES pinned keys none of which is an ssh key (an imported bundle) is never silently unpinned: never dialled, refused by name', oJ);
  const so = HK.scanOpts('/s/kh').join(' ');
  ok(['PubkeyAuthentication=no', 'PasswordAuthentication=no', 'KbdInteractiveAuthentication=no', 'GSSAPIAuthentication=no', 'HostbasedAuthentication=no', 'IdentityAgent=none', 'ForwardAgent=no'].every((o) => so.includes(o)), 'the scan attempts no login by ANY method: no key, password, keyboard, GSSAPI or host-based method, no agent, no forwarding', so);
  // ONE judge of a pinned key — unit 1's paste and a machine's record (主开发's verdict: no second copy of the test in host-keys.js)
  const SKF = require('../src/ssh-key-format.js'), HKS = read('src/host-keys.js');
  ok(/SKF\.isHostKey\(k\.type, k\.key\)/.test(HKS) && !HKS.includes('[A-Za-z0-9+/]{16,}') && /const bad = hostKeyWhy\(type, key\);/.test(read('src/ssh-key-format.js')) && SKF.isHostKey('ssh-ed25519', KA) && !SKF.isHostKey('ssh-rsa', KA) && SKF.hostKeyWhy('ssh-ed25519', 'not base64!') === 'the key is not base64',
    'a machine\'s pinned key and a pasted one are judged by THE one function (ssh-key-format hostKeyWhy / isHostKey) — host-keys.js holds no copy of the base64 + type test');
  // the alias is the pin line's NAME: whitespace, a control character, or a name ssh would read as a pattern ⇒ no pin is written
  const named = (host) => HK.pinWhy({ id: 'host-n', name: 'n', host, hostKeys: [{ type: 'ssh-ed25519', key: KA }] });
  const bads = ['two words.example.test', `x.example.test\n* ssh-ed25519 ${KB}`, 'tab\there.example.test', 'a.example.test,b.example.test', '!neg.example.test', '*.example.test', 'q?.example.test', '@cert-authority'];
  ok(named('plain.example.test') === null && named('[::1]') === null && named('fe80::1') === null && bads.every((b) => typeof named(b) === 'string'),
    'a pin is written only for an address that is ONE plain host name: whitespace or a control character (a smuggled `*` line), a comma, a !, a wildcard or a marker is refused — read back by THE parser', bads.filter((b) => named(b) === null));
  ok(JSON.stringify(HK.pinView(pinnedRec)) === JSON.stringify({ hostKeys: [{ type: 'ssh-ed25519', fp: HK.fingerprintOf(KA) }], hostKeysAt: null }) && HK.pinView(h22).hostKeys === null, 'the page\'s view: type + fingerprint, never the key text');
}

console.log('— ② the HostManager: options first, the pin\'s file (0600, healed at boot, gone with the record, written on import), the page view —');
const dataDir = path.join(SCR, 'data with space'); fs.mkdirSync(dataDir, { recursive: true });
{
  const KA = blob('ssh-ed25519', 5);
  const hm = new HostManager({ dataDir });
  const id = hm.add({ name: 'plain', user: 'me', host: 'plain.example.test', port: 22 });
  const a0 = hm.sshArgs(hm.get(id));
  ok(a0[0] === '-o' && a0[1] === 'StrictHostKeyChecking=accept-new' && a0.filter((x) => /^StrictHostKeyChecking=/.test(x)).length === 1 && !a0.some((x) => /UserKnownHostsFile/.test(x)), 'an unpinned record: accept-new, ONCE, first (ssh keeps the first value of an option)', a0);
  const h = hm.get(id); h.hostKeys = [{ type: 'ssh-ed25519', key: KA, fp: HK.fingerprintOf(KA) }]; hm._save(); HK.writePinFile(hm._sshDir, h);
  const file = HK.pinFileOf(hm._sshDir, id);
  const a1 = hm.sshArgs(hm.get(id)), c1 = hm.sshCmd(hm.get(id));
  ok(a1.slice(0, 8).join(' ') === `-o StrictHostKeyChecking=yes -o HostKeyAlias=plain.example.test -o UserKnownHostsFile="${file}" -o GlobalKnownHostsFile=/dev/null` && a1.filter((x) => /^StrictHostKeyChecking=/.test(x)).length === 1 && !a1.includes('StrictHostKeyChecking=accept-new'),
    'a pinned record: strict over its own file, first, the only StrictHostKeyChecking (never accept-new)', a1.slice(0, 8));
  ok(c1.startsWith('ssh -o StrictHostKeyChecking=yes -o ') && c1.includes(`'UserKnownHostsFile="${file}"'`) && !/accept-new/.test(c1), 'sshCmd (rsync -e) carries the same check, the spaced path in SINGLE quotes (rsync\'s -e parser has no backslash escapes)', c1.slice(0, 200));
  // a pin from a bundle / a hand-edited record is RE-JUDGED: a newline smuggled into `key` never reaches the file, the fingerprint is recomputed
  const evil = { id: 'host-evil', name: 'evil', host: 'evil.example.test', port: 22, hostKeys: [{ type: 'ssh-ed25519', key: KA + '\n@cert-authority * ssh-ed25519 ' + KA, fp: 'SHA256:lie' }, { type: 'ssh-ed25519', key: KA, fp: 'SHA256:lie' }] };
  ok(HK.pinText(evil) === `evil.example.test ssh-ed25519 ${KA}\n` && HK.pinView(evil).hostKeys.length === 1 && HK.pinView(evil).hostKeys[0].fp === HK.fingerprintOf(KA), 'a pinned key is re-judged before the file: a key with a smuggled line is dropped, the shown fingerprint is recomputed from the key (never the record\'s word)', HK.pinText(evil));
  // 主开发's verdict: an address no pin can name never reaches a file — the heal, an import and a pin refuse it by name
  const smug = { id: 'host-smug', name: 'smug', host: `smug.example.test\n* ssh-ed25519 ${KA}`, port: 22, hostKeys: [{ type: 'ssh-ed25519', key: KA }] };
  let we = null; try { HK.writePinFile(hm._sshDir, smug); } catch (e) { we = e; }
  ok(we && we.code === 'host-key-name' && !fs.existsSync(HK.pinFileOf(hm._sshDir, 'host-smug')), 'a pinned record whose address smuggles a second line: its pin file is NOT written (refused by name, host-key-name)', we && we.message);
  const idS = hm.add({ name: 'spaced', user: 'me', host: 'spaced host.example.test' });
  const noBin = path.join(SCR, 'no-bin'); fs.mkdirSync(noBin, { recursive: true });
  const P0 = process.env.PATH; process.env.PATH = noBin; // no program at all: the refusal must come before any scan
  let pe = null; try { await hm.pinHostKeys(idS, ['SHA256:x']); } catch (e) { pe = e; } finally { process.env.PATH = P0; }
  ok(pe && pe.code === 'host-key-name', 'pinning a machine whose address holds a space is refused by name BEFORE any scan runs (host-key-name, never host-key-none-seen)', pe && [pe.code, pe.message]);
  let se = null; process.env.PATH = noBin; try { await hm.hostKeyScan(idS); } catch (e) { se = e; } finally { process.env.PATH = P0; }
  ok(se && se.code === 'host-key-name' && /Remote → spaced → Remove host, then Remote → Add machine/.test(se.message), 'Check the key now / the add flow\'s scan of an address no pin can name is refused by name before ssh, with its door (remove it, add it again)', se && [se.code, se.message]);
  const idC = hm.add({ name: 'comma', user: 'me', host: 'a,b.example.test' });
  let ce = null; process.env.PATH = noBin; try { await hm.hostKeyScan(idC); } catch (e) { ce = e; } finally { process.env.PATH = P0; }
  ok(ce && ce.code === 'host-key-name', 'a comma address is refused by the scan before ssh too (the whole name, read by THE parser)', ce && [ce.code, ce.message]);
  hm.remove(idC);
  // the move onto 6ce6b8124 meets B-2ca0: the first-contact scan dials the machine every other road reaches — an alias of the hub's
  // ssh config keeps ITS Port and User (no `-p 22`, no `user@`), a jump record goes through its hop (a stand-in ssh records its argv)
  const fakeBin = path.join(SCR, 'fake-ssh-bin'), argvLog = path.join(SCR, 'fake-ssh-argv'); fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'ssh'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argvLog}'\nexit 255\n`, { mode: 0o755 });
  const scanArgv = async (id) => { fs.rmSync(argvLog, { force: true }); process.env.PATH = fakeBin; try { await hm.hostKeyScan(id); } catch { /* no key seen: the stand-in shows none */ } finally { process.env.PATH = P0; } return fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8').split('\n').filter(Boolean) : []; };
  const idA = hm.add({ name: 'alias', user: 'me', host: 'gpu-alias' }); Object.assign(hm.get(idA), { viaConfig: true, user: '', port: null });
  const idJ = hm.add({ name: 'jumped', user: 'ubuntu', host: '203.0.113.10' }); hm.get(idJ).jump = 'me@bastion.example.test:2200';
  const aA = await scanArgv(idA), aJ = await scanArgv(idJ), pcJ = aJ.find((x) => x.startsWith('ProxyCommand=')) || '';
  ok(aA.length > 2 && aA.at(-2) === 'gpu-alias' && !aA.includes('-p') && aJ.at(-2) === 'ubuntu@203.0.113.10' && pcJ.startsWith('ProxyCommand=ssh ') && pcJ.includes(' -o StrictHostKeyChecking=accept-new') && pcJ.endsWith(" -l me -p 2200 -W '[%h]:%p' bastion.example.test"),
    'the first-contact scan dials as every road does (B-2ca0): an alias keeps its config\'s Port and User (no -p, no user@), a jump record goes through its hop — the hop keeping accept-new into the hub user\'s own known_hosts', { aA, aJ });
  hm.remove(idA); hm.remove(idJ);
  // 主开发's ruling of 2026-11-18: a PINNED record whose address no pin can name (an imported bundle) has no pin file — it is never
  // dialled, never downgraded, refused BY NAME on every road that words ssh's exit, never «host key changed»
  const oU = HK.hostKeyOpts(hm._sshDir, smug).join(' '), rU = HK.hostKeyRefusal(smug, 'kex_exchange_identification: Connection closed by remote host');
  ok(['ProxyCommand=false', 'ControlMaster=no', 'ControlPath=none', 'StrictHostKeyChecking=yes', 'UserKnownHostsFile=/dev/null', 'GlobalKnownHostsFile=/dev/null'].every((o) => oU.includes(o)) && !oU.includes('accept-new') && !oU.includes(HK.pinFileOf(hm._sshDir, 'host-smug')),
    'a pinned record whose address no pin can name is never dialled (the proxy command ends before any connection; no master), never downgraded (strict over an empty file), never over a pin file that does not exist', oU);
  ok(rU && rU.code === 'host-key-name' && /its host-key pin cannot be used/.test(rU.message) && /Remote → smug → Remove host, then Remote → Add machine/.test(rU.message) && !/showed an ssh host key/.test(rU.message), 'its ssh exit is refused BY NAME (host-key-name) with its door — never «host key changed»', rU && rU.message);
  fs.mkdirSync(path.join(SCR, 'fy-unusable'), { recursive: true });
  const fyU = new UserTodoManager({ dataDir: path.join(SCR, 'fy-unusable') });
  ok(HW.create({ userTodos: fyU }).refused(smug, rU) === false && !fyU._state.items.some((t) => t.status === 'open'), 'a pin that cannot be used files NO «host key changed» item in For you (its row says it, by name)');
  hm.remove(idS);
  // ssh's OWN refusal only (exit 255): the same words printed by a REMOTE program are not a key refusal
  const { sshRefusal } = require('../src/hosts.js');
  const words = 'No ED25519 host key is known for plain.example.test and you have requested strict checking.\nHost key verification failed.';
  const own = sshRefusal(hm.get(id), { code: 255 }, words, null), remote = sshRefusal(hm.get(id), { code: 1 }, words, null);
  ok(own && own.code === 'host-key-changed' && remote === null, 'ssh\'s own exit (255) with host-key words ⇒ host-key-changed; a remote command exiting 1 with the same words in its stderr ⇒ not a key refusal', [own && own.code, remote]);
  ok(fs.readFileSync(file, 'utf8') === `plain.example.test ssh-ed25519 ${KA}\n` && (fs.statSync(file).mode & 0o777) === 0o600 && (fs.statSync(path.dirname(file)).mode & 0o777) === 0o700, 'the pin file: the key under the record\'s names, 0600 in a 0700 folder');
  fs.unlinkSync(file);
  if (typeof hm.persisted === 'function') await hm.persisted(); // 2.369.411's hosts store writes off the loop: a restart reads what LANDED
  const hm2 = new HostManager({ dataDir }); // a restart: the record says pinned, its file is gone ⇒ healed
  ok(fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(KA), 'a boot heals a pinned record\'s missing file from the record');
  const row = hm2.list().find((x) => x.id === id);
  ok(row.hostKeys && row.hostKeys.length === 1 && row.hostKeys[0].fp === HK.fingerprintOf(KA) && !JSON.stringify(row).includes(KA), 'the /api/hosts row carries the pin as type + fingerprint — the key text never reaches the page');
  const bundle = hm2.exportBundle();
  fs.unlinkSync(file);
  hm2.importBundle(bundle);
  ok(fs.existsSync(file), 'an import writes the pins\' files of the records it brings');
  { // 主开发's verdict: a machine an import DROPS is a removal — its pin file goes and its host-key items are resolved
    const fyDir = path.join(SCR, 'fy-import'); fs.mkdirSync(fyDir, { recursive: true });
    const todosI = new UserTodoManager({ dataDir: fyDir });
    HW.create({ userTodos: todosI, hosts: hm2 });
    hm2.onHostKeyRefused(hm2.get(id), { fp: 'SHA256:ddd', pinned: true });
    const openI = () => todosI._state.items.filter((t) => t.status === 'open');
    const had = openI().length;
    hm2.importBundle({ ...bundle, hosts: bundle.hosts.filter((x) => x.id !== id) });
    ok(had === 1 && openI().length === 0 && !fs.existsSync(file), 'an import that DROPS a pinned machine removes its pin file and resolves its host-key item, as a removal does', [had, openI().length, fs.existsSync(file)]);
    hm2.importBundle(bundle);
    const dropped = [], D0 = hm2._dropConnections, KC = blob('ssh-ed25519', 7);
    hm2._dropConnections = (x) => dropped.push(x.id);
    hm2.importBundle({ ...bundle, hosts: bundle.hosts.map((x) => (x.id === id ? { ...x, hostKeys: [{ type: 'ssh-ed25519', key: KC, fp: HK.fingerprintOf(KC) }] } : x)) });
    hm2._dropConnections = D0;
    ok(dropped.includes(id), 'an import that CHANGES a kept machine\'s pin drops its connections (its master; its cached device link, which captured the old options)', dropped);
    hm2.importBundle(bundle);
  }
  await hm2.remove(id);   // the removal's teardown runs once hosts.json carries it (bl-jobs' (2b) order)
  ok(!fs.existsSync(file), 'removing the machine removes its pin file');
}

console.log('— ④ the routes: read / scan / pin / unpin — the person\'s act only —');
{
  const handlers = {};
  const reg = (m) => (p, ...hs) => { handlers[`${m} ${p}`] = hs[hs.length - 1]; };
  const app = { get: reg('GET'), post: reg('POST'), delete: reg('DELETE'), put: reg('PUT'), patch: reg('PATCH'), use: () => {} };
  fs.mkdirSync(path.join(SCR, 'routes'), { recursive: true });
  const hm = new HostManager({ dataDir: path.join(SCR, 'routes') });
  const id = hm.add({ name: 'r', user: 'me', host: 'r.example.test' });
  const make = (mod) => mod.create({ app, rootDir: SCR, AGENT_BIN_DIR: SCR, activeSessions: new Map(), auth: {}, wss: null, WS_OPEN: 1, bcastAll: () => {}, integrationEnabled: () => false, unpairDialDevice: () => {}, hosts: hm, getExitProxy: () => ({}), getMounts: () => ({}), getPortForwards: () => ({}) });
  const call = async (key, req) => { const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } }; await handlers[key]({ params: { id }, query: {}, headers: {}, body: {}, ...req }, res); return res; };
  let made = null; try { make(require('../src/server/exit-routes.js')); made = true; } catch (e) { made = e; }
  ok(made === true && ['GET', 'POST', 'DELETE'].every((m) => typeof handlers[`${m} /api/hosts/:id/host-keys`] === 'function'), 'the three host-key routes are registered', made !== true ? String(made && made.message) : Object.keys(handlers).filter((k) => /host-keys/.test(k)));
  if (made === true) {
    const bearer = { headers: { authorization: 'Bearer vsst_fixture' } };
    const r1 = await call('GET /api/hosts/:id/host-keys', bearer), r2 = await call('POST /api/hosts/:id/host-keys', { ...bearer, body: { fps: ['SHA256:x'] } }), r3 = await call('DELETE /api/hosts/:id/host-keys', bearer), r4 = await call('DELETE /api/hosts/:id/host-keys', { body: { token: 'vsst_fixture' } });
    ok([r1, r2, r3, r4].every((r) => r.statusCode === 403 && r.body.code === 'human_only'), 'an agent\'s bearer (a header or a body token) is refused on all three: human_only — an agent that could unpin could reopen the first-key trust', [r1, r2, r3, r4].map((r) => r.statusCode));
    const r5 = await call('GET /api/hosts/:id/host-keys', {}), r6 = await call('POST /api/hosts/:id/host-keys', { body: { fps: [] } });
    ok(r5.statusCode === 200 && r5.body.hostKeys === null && r5.body.seen === null && r6.statusCode === 400 && r6.body.code === 'host-key-none-chosen', 'the person\'s read answers the pin view; a pin with no key chosen is refused by name', [r5.body, r6.body]);
    // RED CONTROL: the routes without the person check let a bearer unpin
    const SRC = read('src/server/exit-routes.js');
    const anchor = "const hostKeyHumanOnly = (req, res) => { if (!isAnyBearer(req)) return false;";
    ok(SRC.includes(anchor), 'control: the person check is in exit-routes.js', anchor);
    for (const k of Object.keys(handlers)) delete handlers[k];
    const M = mutantCopies('host-key-routes', REPO);
    make(M.load('src/server/exit-routes.js', SRC.replace(anchor, 'const hostKeyHumanOnly = (req, res) => { if (true) return false;'), 'no-person-check'));
    const rm = await call('DELETE /api/hosts/:id/host-keys', { headers: { authorization: 'Bearer vsst_fixture' } });
    ok(rm.statusCode === 200, 'RED CONTROL: a copy without the person check lets an agent\'s bearer unpin (200) — the leg above refuses that', rm.statusCode);
  }
}

console.log('— ⑤ For you: ONE urgent item per (machine, key shown), across a restart, resolved by a new pin —');
{
  const dir = path.join(SCR, 'fy'); fs.mkdirSync(dir);
  const todos = new UserTodoManager({ dataDir: dir });
  const open = () => todos._state.items.filter((t) => t.status === 'open' && t.sessionKey === 'machines');
  const h = { id: 'host-x', name: 'build box' };
  const w1 = HW.create({ userTodos: todos, dataDir: dir });
  w1.refused(h, { fp: 'SHA256:aaa', pinned: true }); w1.refused(h, { fp: 'SHA256:aaa', pinned: true });
  ok(open().length === 1 && open()[0].urgency === 'urgent' && open()[0].origin === 'machines' && open()[0].text === 'build box: its ssh host key changed — VibeSpace did not connect' && /SHA256:aaa, which is not the key pinned for it/.test(open()[0].detail) && open()[0].i18n && open()[0].i18n.text.key === '{machine}: its ssh host key changed — VibeSpace did not connect',
    'the first refusal files ONE urgent item (origin machines, worded as structure for the page\'s language); the same key again files nothing', open().map((t) => [t.urgency, t.text]));
  // THE DOOR (主开发's verdict of 2026-11-18): the item names its machine by the record's id and its row DECLARES the dialog it opens
  const FA = require('../src/foryou-actions.js');
  const it0 = open()[0], op = FA.opensOf(it0);
  ok(it0.action && it0.action.type === 'host-key' && it0.action.hostId === 'host-x' && op && op.dialog === 'host-key-dialog' && op.hostId === 'host-x' && op.name === 'build box' && FA.ROW_OF['host-key'].opens === 'host-key-dialog',
    'the item carries its machine (action host-key, the record\'s id) and its registry row DECLARES the dialog it opens: THAT machine\'s Host key…', [it0.action, op]);
  const ACT = read('src/lib/user-todos-actions.js');
  const doorAt = ACT.indexOf("{ const op = opensOf(item); if (op && op.dialog === 'host-key-dialog') { close(); app.sidebar?._showHostKeyDialog?.({ id: op.hostId, name: op.name }); return; } }"), machinesAt = ACT.indexOf("if (key === 'machines') { close();");
  ok(doorAt > 0 && machinesAt > doorAt, 'the jump\'s declared-dialog door comes before the machines key\'s Manage Agents (THE REAL JUMP is pressed in test-card-grammar ⑥: the bundled For-you model, a stand-in app — 主开发\'s ruling of 2026-11-18)', [doorAt, machinesAt]);
  { // the item's identity is its machine's record id (主开发's ruling (3)): two machines whose items carry the same words never merge
    const dI = path.join(SCR, 'fy-ident'); fs.mkdirSync(dI);
    const tI = new UserTodoManager({ dataDir: dI }), wI = HW.create({ userTodos: tI });
    wI.refused({ id: 'host-i1', name: 'twin' }, { fp: 'SHA256:same', pinned: true }); wI.refused({ id: 'host-i2', name: 'twin' }, { fp: 'SHA256:same', pinned: true });
    const openI = tI._state.items.filter((t) => t.status === 'open');
    ok(FA.ACTION_IDENTITY['host-key'] === 'hostId' && openI.length === 2 && openI.map((t) => t.action.hostId).sort().join() === 'host-i1,host-i2', 'the row\'s identity is the machine\'s record id: two machines whose items carry the same words are TWO items (by text alone the store merged them and re-pointed the first)', openI.map((t) => t.action && t.action.hostId));
  }
  const w2 = HW.create({ userTodos: todos, dataDir: dir }); // a restart
  w2.refused(h, { fp: 'SHA256:aaa', pinned: true });
  ok(open().length === 1, 'a restart while the same key is refused files NO second item (the ledger outlives the boot)');
  w2.refused(h, { fp: 'SHA256:bbb', pinned: true });
  ok(open().length === 1 && /SHA256:bbb/.test(open()[0].detail), 'another key shown: the old item is resolved, ONE new one names the new key');
  w2.decided(h);
  ok(open().length === 0, 'the person pinned again / unpinned: the item is resolved (by the system)');
  // a machine REMOVED takes its item with it (the watch hears hosts.onRemoved)
  fs.mkdirSync(path.join(SCR, 'fy-hosts'), { recursive: true });
  const hmF = new HostManager({ dataDir: path.join(SCR, 'fy-hosts') });
  const idF = hmF.add({ name: 'gone box', user: 'me', host: 'gone.example.test' });
  const w3 = HW.create({ userTodos: todos, dataDir: dir, hosts: hmF });
  w3.refused(hmF.get(idF), { fp: 'SHA256:ccc', pinned: false });
  const before = open().length;
  await hmF.remove(idF);
  ok(before === 1 && open().length === 0, 'a machine removed: its host-key item is resolved with it (never an urgent item about a machine that is gone)', [before, open().length]);
  // the removal passes the KIND through: a device-key item of the machine (unit 3 files it; its words' key says the kind) goes too
  const idK = hmF.add({ name: 'kind box', user: 'me', host: 'kind.example.test' });
  todos.add('machines', { origin: 'machines', text: 'kind box: its agent did not prove the pinned device key', i18n: { text: { key: '{machine}: its agent did not prove the pinned device key', params: { machine: 'kind box' } } }, urgency: 'urgent', by: 'agent', sessionName: 'Machines', action: { type: 'host-key', hostId: idK, kind: 'device' } });
  const hadK = open().length;
  await hmF.remove(idK);
  ok(hadK === 1 && open().length === 0, 'a removal passes the KIND through (onHostKeyPinned(h, kind)): the machine\'s device-key item is resolved too — a wiring of (h) => decided(h) left it open', [hadK, open().length]);
  ok(/HostKeyWatch|host-key-watch\.js/.test(read('server.js')) && /require\('\.\/src\/server\/host-key-watch\.js'\)\.create\(\{ userTodos, hosts/.test(read('server.js')), 'the server wires the watch to the real hosts + For you');
}

console.log('— ⑥ an act that tells a person «done» waits for its record (主开发 00:36Z: 2.369.411\'s hosts store writes off the loop) —');
{
  const KH = blob('ssh-ed25519', 9), FPH = HK.fingerprintOf(KH);
  const run = async (HMc, tag) => {
    const d = path.join(SCR, 'hunt-' + tag); fs.mkdirSync(d, { recursive: true });
    const hm = new HMc({ dataDir: d }); const id = hm.add({ name: 'hunt', user: 'me', host: 'hunt.example.test', port: 22 });
    const said = []; hm.onHostKeyPinned = (h) => said.push(h.id);
    hm.hostKeyScan = async () => [{ type: 'ssh-ed25519', key: KH, fp: FPH }];
    hm.persisted = async () => false; hm.whyNotDurable = () => ({ why: 'queued', ahead: 3 });
    const o = {};
    try { await hm.pinHostKeys(id, [FPH]); o.e1 = null; } catch (e) { o.e1 = e.code || 'error'; o.m1 = e.message; }
    o.kept1 = !!hm.get(id).hostKeys; o.file1 = fs.existsSync(HK.pinFileOf(hm._sshDir, id)); o.said1 = said.length;
    hm.persisted = async () => true;
    const v = await hm.pinHostKeys(id, [FPH]); o.pinned = !!(v.hostKeys && v.hostKeys.length === 1) && fs.existsSync(HK.pinFileOf(hm._sshDir, id));
    hm.persisted = async () => false;
    try { await hm.unpinHostKeys(id); o.e2 = null; } catch (e) { o.e2 = e.code || 'error'; }
    o.still = !!(hm.get(id).hostKeys && hm.get(id).hostKeys.length === 1) && fs.existsSync(HK.pinFileOf(hm._sshDir, id));
    // 主开发 01:11Z small (1): TWO presses in flight on one machine, both refused (the writer answers in order) — memory ends on the value
    // from before the FIRST, never on the first press's
    const KH2 = blob('ssh-ed25519', 10), FPH2 = HK.fingerprintOf(KH2);
    hm.hostKeyScan = async () => [{ type: 'ssh-ed25519', key: KH, fp: FPH }, { type: 'ssh-ed25519', key: KH2, fp: FPH2 }];
    const before2 = JSON.stringify(hm.get(id).hostKeys || null);
    hm.persisted = async () => { await new Promise((r) => setTimeout(r, 10)); return false; };
    const two = await Promise.allSettled([hm.pinHostKeys(id, [FPH2]), hm.pinHostKeys(id, [FPH])]);
    o.two = two.every((x) => x.status === 'rejected' && x.reason && x.reason.code === 'host-key-not-durable') && JSON.stringify(hm.get(id).hostKeys || null) === before2;
    // the reader's must on small (1): an act that LANDED moves the machine's base — the last refused act puts back the newest
    // landed value, never one from before an act that landed. An unpin landed, then a pin refused ⇒ unpinned (its pin file gone
    // with it, though the unpin's tail wrote it from the pin's value); a pin refused, a pin landed, a pin refused ⇒ the landed pin
    const KH3 = blob('ssh-ed25519', 11), FPH3 = HK.fingerprintOf(KH3);
    hm.hostKeyScan = async () => [{ type: 'ssh-ed25519', key: KH, fp: FPH }, { type: 'ssh-ed25519', key: KH2, fp: FPH2 }, { type: 'ssh-ed25519', key: KH3, fp: FPH3 }];
    const answers = (plan) => { let i = 0; return async () => { const [ms, r] = plan[i++] || [0, true]; await new Promise((res) => setTimeout(res, ms)); return r; }; };
    hm.persisted = async () => true; await hm.pinHostKeys(id, [FPH]);
    hm.persisted = answers([[10, true], [20, false]]);
    const lf = await Promise.allSettled([hm.unpinHostKeys(id), hm.pinHostKeys(id, [FPH2])]);
    o.lf = lf[0].status === 'fulfilled' && lf[1].status === 'rejected' && lf[1].reason.code === 'host-key-not-durable' && !hm.get(id).hostKeys && !fs.existsSync(HK.pinFileOf(hm._sshDir, id));
    hm.persisted = answers([[10, false], [20, true], [30, false]]);
    const three = await Promise.allSettled([hm.pinHostKeys(id, [FPH]), hm.pinHostKeys(id, [FPH2]), hm.pinHostKeys(id, [FPH3])]);
    const kk = hm.get(id).hostKeys || [], pf = fs.existsSync(HK.pinFileOf(hm._sshDir, id)) ? fs.readFileSync(HK.pinFileOf(hm._sshDir, id), 'utf8') : '';
    o.three = three.map((x) => x.status).join() === 'rejected,fulfilled,rejected' && kk.length === 1 && kk[0].fp === FPH2 && pf.includes(KH2) && !pf.includes(KH3);
    return o;
  };
  const { HostManager } = require('../src/hosts.js');
  const g = await run(HostManager, 'real');
  ok(g.e1 === 'host-key-not-durable' && /is NOT pinned: hosts\.json is not on disk \(queued behind 3 write\(s\)\) — nothing changed/.test(g.m1 || '') && !g.kept1 && !g.file1 && g.said1 === 0 && g.pinned && g.e2 === 'host-key-not-durable' && g.still && g.two,
    'a pin whose record did not land is UNDONE and refused by name (host-key-not-durable: no pin in memory, no pin file, no item resolved, never «pinned»); landed, it pins; an unpin that did not land leaves the pin as it was', g);
  ok(g.lf && g.three, 'small (1), the reader\'s must: an act that LANDED moves the base — an unpin landed then a pin refused ends unpinned with no pin file; a pin refused, a pin landed, a pin refused ends on the landed pin (record and file)', { lf: g.lf, three: g.three });
  const HS = read('src/hosts.js'), AW = "    await this._landedOrUndo(h, was, 'pinned');";
  const MH = mutantCopies('host-key-hunt', REPO);
  const m = await run(MH.load('src/hosts.js', anchored(HS, AW, '', 'pin-never-waits'), 'pin-never-waits').HostManager, 'mut');
  ok(m.e1 === null && m.kept1 && m.file1 && m.said1 === 1, 'RED CONTROL: a pin that does not wait tells «pinned», writes its file and resolves the item before its record landed — a kill then brings the machine back on accept-new with nobody told (the leg above refuses that)', m);
  const ER = read('src/server/exit-routes.js'), MW = read('src/server/mounts-plugins-wiring.js');
  ok(/app\.delete\('\/api\/hosts\/:id\/device-key', async \(req, res\) => \{[\s\S]{0,400}?if \(await notDurable\(res\)\) return; res\.json\(\{ success: true, \.\.\.v \}\);/.test(ER) && /const v = await hosts\.unpinHostKeys\(req\.params\.id\);/.test(ER) && /e && \(e\.code === 'host-key-not-durable' \|\| e\.code === 'hosts-unread'\) \? 503 : 400/.test(ER)
    && /if \(r && r\.code === 'not_durable'\) \{ showToast\(tr\('Dial-out is removed from "\{name\}", but the change is not saved yet/.test(read('src/lib/sidebar-mounts.js')) && !/press Remove dial-out once more/.test(MW) // stale-pins: kept — the sentence that named a door the row no longer offers is gone on purpose (01:11Z small 3)
    && /hosts\.ungraduateDial\(h\.id\);\n[^\n]*\n\s*bcastAll\(\{ type: 'hosts-updated' \}\);\n(?:\s*\/\/[^\n]*\n)*\s*if \(typeof hosts\.persisted === 'function' && !\(await hosts\.persisted\(\)\)\) return res\.status\(503\)\.json\(\{[^\n]*code: 'not_durable' \}\);\n/.test(MW),
    'Forget / Let in answers only once its record landed (and Remove dial-out\'s not-saved answer is worded on the page by its code) (the not-durable guard its siblings carry); unpin waits; a refusal is 503; Remove dial-out — the agent already gone from the machine — waits for its record and says when it is not saved');
}

console.log('— the page: the door, the dialog, the words in zh + ja —');
{
  const sm = read('src/lib/sidebar-mounts.js');
  ok(/ibtn\(MI\.key, tr\('Host key of "\{name\}"…'/.test(sm) && /_showHostKeyDialog\(h\)/.test(sm) && /st\.code === 'host-key-changed' \? tr\('host key changed'\)/.test(sm), 'the ssh row has the Host key… door (accent while refused) and the chip says «host key changed», never «unreachable», for that refusal');
  ok((sm.match(/this\._hostStatus\[h\.id\] = \{ (?:ok: false, )?error: (?:hostKeyErrorWords\(h, e\)|said), code: e\.code \|\| null, at: Date\.now\(\) \}/g) || []).length === 2, 'the auto-probe AND the manual Test keep the refusal\'s code and its time (a re-probe never turns «host key changed» back into «unreachable»)');
  const addAt = sm.indexOf("this._showHostKeyDialog({ id: r.id, name: v.name || v.host, transport: 'ssh' }, { scanNow: true, done: resolve })"), testAt = sm.indexOf('this._hostStatus[r.id] = await api(`/api/hosts/${r.id}/test`');
  ok(addAt > 0 && testAt > addAt, 'a NEW machine: its key is shown for a pin (a scan, nothing trusted) BEFORE the first test dials it — the first-connection window D6 closes');
  // the pictures' second take (2026-11-18): the row's red line and the Test / Add toasts word a refused key (and a pin that cannot be
  // used) in the PAGE's language — the route hands code + fp + pinned; the server's English sentence was printed as it came
  ok(/function hostKeyErrorWords\(h, e\)/.test(sm) && (sm.match(/hostKeyErrorWords\(/g) || []).length === 6 && /code: e\.code, fp: e\.fp \|\| null, pinned: !!e\.pinned/.test(read('src/server/exit-routes.js')) && /st\.code === 'host-key-name' \? tr\('pin cannot be used'\)/.test(sm),
    'a refused host key and a pin that cannot be used are worded by the PAGE on the row (its own chip) and in the Test / Add toasts, never the server\'s English as it came; the sentence ends on the door\'s own «…» (no fourth dot)');
  // the reader of unit 3 (a must): an item's jump hands {id, name}; the dialog reads the machine's WHOLE record (transport, device
  // key, refusal) from the hosts route before it draws — or a device-kind item showed the ssh view, without «Forget the device key»
  const dlgAt = sm.indexOf('async _showHostKeyDialog(h, { scanNow = false, done = null } = {}) {'), readAt = sm.indexOf("if (h && h.id && h.transport === undefined) { try { h = ((await api('/api/hosts')).hosts || []).find((x) => x.id === h.id) || h; } catch { } }"), shellAt = sm.indexOf("const { body, close, raised } = createModalShell({ id: 'host-key-dialog'");
  ok(dlgAt > 0 && readAt > dlgAt && shellAt > readAt && /isDialRow|h\.transport === 'dial'/.test(sm.slice(shellAt, shellAt + 6000)), 'the Host key dialog reads a partial record (an item\'s {id, name}) WHOLE from the hosts route before it draws — so a device item shows the device-key section', [dlgAt, readAt, shellAt]);
  const words = ['{name} showed an ssh host key that is not the key pinned for it ({fp}) — VibeSpace did not connect. If its key really changed, compare it on the machine and pin it again in Remote → {name} → Host key…', '{name} showed an ssh host key that is not the key this VibeSpace saw before ({fp}) — VibeSpace did not connect. If its key really changed, compare it on the machine and pin the key it shows now in Remote → {name} → Host key…', '{name}: its host-key pin cannot be used — its address is not one plain host name, so VibeSpace does not connect to it. Remove it and add it again with its plain address (Remote → {name} → Remove host, then Remote → Add machine)', 'pin cannot be used', 'Host key of "{name}"', 'Host key of "{name}"…', 'Pinned: VibeSpace connects to {name} only while it shows this key.', 'Not pinned: VibeSpace trusts the key {name} showed the first time it connected.', 'Check the key now', 'Pin this key', 'Pin the key it shows now', 'Remove the pin', 'host key changed', '{machine}: its ssh host key changed — VibeSpace did not connect'];
  for (const d of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) { const t = read(d); ok(words.every((w) => t.includes(JSON.stringify(w) + ':')), `${d}: every new word has its row`, words.filter((w) => !t.includes(JSON.stringify(w) + ':'))); }
  const css = read('public/style.css');
  ok(/\.host-key-same \{ color: var\(--green\); \}/.test(css) && /\.host-key-diff \{ color: var\(--red\);/.test(css), 'the dialog\'s marks are theme variables');
}

console.log('— ⑦ the move onto c72bbedd2: ONE catch per route carries both units — the hold\'s 503 with its name (bl-jobs, list line 124) AND every other refusal\'s code and facts (this lane) —');
{
  const ER = read('src/server/exit-routes.js'), PW = read('src/server/mounts-plugins-wiring.js');
  const handlerOf = (src, head, names) => { const i = src.indexOf(head), j = src.indexOf('\n});\n', i); return i < 0 || j < 0 ? null : new Function(...names, `return (${src.slice(i + head.length, j + 2)});`); };   // eslint-disable-line no-new-func
  const answer = async (h, req) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = { status: this.code || 200, ...b }; return this; } }; await h(req, res); return out; };
  const held = () => Object.assign(new Error('hosts.json in VibeSpace\'s data folder could not be read (EACCES); …'), { code: 'hosts-unread', status: 503 });
  const changed = () => Object.assign(new Error('box showed an ssh host key that is not the key pinned for it'), { code: 'host-key-changed', fp: 'SHA256:abc', pinned: true });
  const T = handlerOf(ER, "app.post('/api/hosts/:id/test', ", ['hosts', 'DAU']);
  const tOf = async (thrower) => T && answer(T({ test: async () => { throw thrower(); } }, { byOfReq: () => null }), { params: { id: 'h-1' }, body: {}, headers: {} });
  const tHeld = await tOf(held), tKey = await tOf(changed), tPlain = await tOf(() => new Error('no route to host'));
  ok(!!T && tHeld && tHeld.status === 503 && tHeld.code === 'hosts-unread' && tKey && tKey.status === 400 && tKey.code === 'host-key-changed' && tKey.fp === 'SHA256:abc' && tKey.pinned === true && tPlain && tPlain.status === 400 && !tPlain.code,
    'Test connection, its handler compiled from its source: a held list ⇒ 503 hosts-unread (line 124); a changed key ⇒ 400 with its code, the fingerprint and its pin mark (this lane); any other failure ⇒ 400 with its words — one catch, neither reply swallowed', { tHeld, tKey, tPlain });
  const G = handlerOf(PW, "app.post('/api/hosts/:id/graduate-dial', ", ['hosts']);
  const gOf = async (thrower) => G && answer(G({ get: () => { throw thrower(); } }), { params: { id: 'h-1' }, body: {}, headers: {} });
  const gHeld = await gOf(held), gRef = await gOf(() => Object.assign(new Error('this machine already dials out — Remove dial-out first'), { code: 'already-dial-out' }));
  ok(!!G && gHeld && gHeld.status === 503 && gHeld.code === 'hosts-unread' && gRef && gRef.status === 400 && gRef.code === 'already-dial-out',
    'Upgrade / Remove dial-out (graduate-dial), compiled from its source: a held list ⇒ 503 hosts-unread (line 124); a refusal by name ⇒ 400 with ITS code beside its words (this lane) — one catch', { gHeld, gRef });
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
