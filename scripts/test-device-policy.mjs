#!/usr/bin/env node
// test-device-policy — A PAIRED DEVICE CARRIES ITS OWN ALLOW LIST (lane device-allow-flags, design q-042 §3 D5, owner
// decision ③ 2026-10-19) — FAST.
//   ① the flag table: every op of device-acts' session / act / code layers has exactly ONE flag (or is ALWAYS, with a
//      reason); the read layer none; every op the client sends / the daemon answers is judged; MUTANT: an act row
//      without a flag ⇒ RED (named)
//   ② the parser + the defaults: --allow all / none / a list (sessions brings run + files) / an unknown word refused by
//      name; a LOCAL instance's command says all, a CLUSTER's run,files,sessions,upgrade; no file = legacy (everything,
//      said), a bad file = reads only
//   ③ the verdicts + THE re-run sentence (the whole new list; -Allow on Windows); the file itself by path
//      (`policy_is_the_devices` — a write / place / removal / rename onto it or a folder above it; mkdir above it is not)
//   ④ THE ONE SEND POINT (a fake daemon link): a refused act never travels (ONE audit line `op-not-allowed`, its head =
//      the re-run); a session open / a stream / a LAN socket refused before a channel opens; an agent that states no
//      list is not judged; the device's own refusal answers the id that asked, by name
//   ⑤ the hello-ack over the real Mux: a device whose list leaves `upgrade` off is never pushed one; CONTROL: on ⇒ pushed
//   ⑥ the DEVICE (a REAL local daemon): --write-policy writes the file 0600 and refuses an unknown flag (nothing
//      written); the hello-ack states the list; a hub that SKIPS its own check is refused by the device (input-events,
//      a session open carrying an account env, place-secret / fs-op onto policy.json, rm of its folder) and its
//      acts.log says so; MUTANT agentd without the check ⇒ the same requests run (RED)
//   ⑦ the hub's record (hosts.notePolicy), the session setup asks first (spawn/dial.js — before its first act), the
//      pairing route's default, the installers (--allow / -Allow written BEFORE the token), the exit refusal by name
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { endDaemonsAndWait } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-device-policy-'));
const DP = require('../src/device-policy.js');
const DA = require('../src/device-acts.js');
const { DeviceManager } = require('../src/agentd/client.js');

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const T0 = Date.now();
const CLUSTER = DP.CLUSTER_DEFAULT.slice();
const pol = (allow, extra = {}) => ({ v: 1, allow, all: allow.length === DP.FLAGS.length, source: 'install', at: 1, ...extra });

console.log('— ① the flag table');
/** THE census: every non-read row has exactly one of a flag / ALWAYS; no row for no op; every flag is a FLAG. → the faults */
function census(TABLE, FLAG_OF, ALWAYS) {
  const bad = [];
  for (const [k, layer] of Object.entries(TABLE)) {
    if (layer === 'read') { if (has(FLAG_OF, k) || has(ALWAYS, k)) bad.push(`${k}: a read with a row (reads are never gated)`); continue; }
    const n = (has(FLAG_OF, k) ? 1 : 0) + (has(ALWAYS, k) ? 1 : 0);
    if (n !== 1) bad.push(`${k} (${layer}): ${n ? 'a flag AND always' : 'no flag'}`);
  }
  for (const k of [...Object.keys(FLAG_OF), ...Object.keys(ALWAYS)]) if (!has(TABLE, k)) bad.push(`${k}: a row for no op`);
  for (const [k, f] of Object.entries(FLAG_OF)) if (!DP.FLAGS.includes(f)) bad.push(`${k} → ${f}: not a flag`);
  for (const [k, why] of Object.entries(ALWAYS)) if (!String(why || '').trim()) bad.push(`${k}: always without a reason`);
  return bad;
}
{
  ok(JSON.stringify(DP.FLAGS) === JSON.stringify(['run', 'files', 'input', 'socks', 'lan', 'sessions', 'upgrade']) && Object.isFrozen(DP.FLAGS), 'the flags are a closed set: run, files, input, socks, lan, sessions, upgrade');
  const bad = census(DA.TABLE, DP.FLAG_OF, DP.ALWAYS);
  const gated = Object.entries(DA.TABLE).filter(([, l]) => l !== 'read');
  ok(bad.length === 0 && gated.length >= 50, `every one of the ${gated.length} session / act / code rows has exactly one flag (${Object.keys(DP.FLAG_OF).length}) or is always (${Object.keys(DP.ALWAYS).length}: the handshake + the stops)`, bad);
  ok(DP.FLAGS.every((f) => Object.values(DP.FLAG_OF).includes(f)), 'every flag gates at least one op (no dead flag)', DP.FLAGS.filter((f) => !Object.values(DP.FLAG_OF).includes(f)));
  const mut = census({ ...DA.TABLE, 'shred-disk': 'act' }, DP.FLAG_OF, DP.ALWAYS);
  ok(mut.length === 1 && /shred-disk \(act\): no flag/.test(mut[0]), 'MUTANT: an act row with no flag ⇒ RED (named)', mut);
  const mut2 = census(DA.TABLE, { ...DP.FLAG_OF, 'kill-session': 'sessions' }, DP.ALWAYS);
  ok(mut2.some((b) => /kill-session.*a flag AND always/.test(b)), 'MUTANT: a row in both tables ⇒ RED', mut2);
  // every op the client sends and the daemon answers (test-device-acts ① reads them the same way) is judged — never 'all'
  const client = read('src/agentd/client.js'), daemon = read('src/agentd/agentd.js');
  const ops = [...new Set([...client.matchAll(/\bop: '([a-z][a-z-]*)'/g), ...daemon.matchAll(/msg\.op === '([a-z][a-z-]*)'/g)].map((m) => m[1]))]
    .filter((op) => !DA.ACTION_OPS.includes(op) && op !== 'op-refused');
  const unjudged = ops.filter((op) => DP.flagOf({ op, host: op === 'tcp-connect' ? '10.0.0.9' : undefined }) === 'all');
  ok(ops.length >= 45 && unjudged.length === 0, `${ops.length} ops the client sends / the daemon answers — each judged by a flag, a stop or the read layer`, unjudged);
  ok(DP.flagOf({ op: 'fs-op', action: 'shred' }) === 'files' && DP.flagOf({ op: 'desktop-serve', action: 'brand-new' }) === 'run' && DP.flagOf({ op: 'brand-new-op' }) === 'all', 'an unknown action takes its family\'s flag; an unknown op needs EVERY flag (fail closed)');
  ok(DP.flagOf({ op: 'fs-op', action: 'read-range' }) === null && DP.flagOf({ op: 'sysinfo' }) === null && DP.flagOf({ op: 'tcp-connect', port: 5900 }) === null && DP.flagOf({ op: 'tcp-connect', port: 22, host: '10.0.0.2' }) === 'lan', 'reads are never gated (a file read, sysinfo, a port on the device\'s own loopback); another LAN host = lan');
  ok(DP.flagOf({ op: 'hello' }) === null && DP.flagOf({ op: 'kill-pipe-session' }) === null && DP.flagOf({ op: 'unserve-socks' }) === null && DP.flagOf({ op: 'desktop-serve', action: 'stop' }) === null, 'the handshake and the stops are always answered (ending what is open never widens anything)');
}

console.log('— ② the parser + the defaults');
{
  const all = DP.parseAllow('all'), none = DP.parseAllow('none'), two = DP.parseAllow('files, run'), ses = DP.parseAllow('sessions'), bad = DP.parseAllow('run,keyboard'), empty = DP.parseAllow('');
  ok(all.ok && all.all && all.allow.length === 7 && none.ok && none.allow.length === 0 && two.ok && two.allow.join() === 'run,files', 'all / none / a list in any order (FLAGS order kept)', { all, none, two });
  ok(ses.ok && ses.allow.join() === 'run,files,sessions', 'sessions brings run + files (a conversation runs commands and writes its tools)', ses);
  ok(!bad.ok && bad.unknown.join() === 'keyboard' && /unknown: keyboard — the flags are run, files, input, socks, lan, sessions, upgrade/.test(bad.error) && !empty.ok, 'an unknown word is refused BY NAME with the flags it knows; an empty list is refused', { bad, empty });
  ok(DP.policyOf(['--allow', 'input']).allow.join() === 'input' && DP.policyOf(['--dial', 'x', '--allow=lan,socks']).allow.join() === 'socks,lan' && DP.policyOf(['-Allow', 'run']).allow.join() === 'run', 'policyOf reads --allow x / --allow=x / -Allow x from an install command');
  ok(DP.policyOf([]).all === true && DP.policyOf([], { cluster: true }).allow.join() === 'run,files,sessions,upgrade', 'no --allow ⇒ the instance kind\'s default: a LOCAL instance all, a CLUSTER instance run,files,sessions,upgrade (no socks / lan / input)');
  ok(DP.allowArg(DP.FLAGS) === 'all' && DP.allowArg([]) === 'none' && DP.allowArg(['upgrade', 'sessions']) === 'run,files,sessions,upgrade', 'the argument text: all / none / the normalized list');
  const legacy = DP.readOf(null), garbled = DP.readOf('{"v":1,"allow":["run","rootkit"]}'), junk = DP.readOf('not json'), round = DP.readOf(JSON.stringify(DP.fileOf(DP.parseAllow('run,files,sessions,upgrade'), { at: 5 })));
  ok(legacy.source === 'legacy' && legacy.allow.length === 7, 'no state/policy.json = paired before the list existed: every flag, said (legacy)', legacy);
  ok(garbled.source === 'unreadable' && garbled.allow.length === 0 && junk.source === 'unreadable', 'a file that is not a v1 list of known flags allows only reads (unreadable) — never everything', { garbled, junk });
  ok(round.source === 'install' && round.allow.join() === 'run,files,sessions,upgrade' && round.at === 5, 'the installer\'s file reads back as written (source install)', round);
  const rep = DP.reportOf({ allow: ['run', 'evil', 'sessions'], source: '<x>', at: 'y' });
  ok(rep && rep.allow.join() === 'run,files,sessions' && rep.source === 'install' && rep.at === 0 && DP.reportOf({ allow: 'all' }) === null && DP.reportOf(null) === null, 'a stated list is bounded on the hub (unknown flags dropped, the source a known word)', rep);
}

console.log('— ③ the verdicts + THE re-run sentence + the file itself');
{
  const v = DP.verdict(pol(CLUSTER), { op: 'input-events', events: [] }, { machine: 'mac1' });
  ok(!v.ok && v.code === 'op-not-allowed' && v.flag === 'input' && v.remedy === 're-run the pairing command on "mac1" with --allow run,files,input,sessions,upgrade', 'input-events on a cluster device ⇒ op-not-allowed input + THE re-run (the whole new list, never the flag alone)', v);
  const s = DP.sentenceOf(v, { machine: 'mac1' });
  ok(/^op-not-allowed: input-events needs "input" — "mac1"'s own allow list leaves it off \(it allows: run, files, sessions, upgrade\); re-run the pairing command on "mac1" with --allow run,files,input,sessions,upgrade$/.test(s), 'the sentence names the op, the flag, what it allows and the re-run', s);
  const w = DP.verdict(pol(CLUSTER), { op: 'serve-socks' }, { machine: 'WIN-1', platform: 'win32' });
  ok(!w.ok && w.flag === 'socks' && / with -Allow run,files,socks,sessions,upgrade$/.test(w.remedy), 'a Windows machine\'s re-run says -Allow (its installer\'s spelling)', w.remedy);
  ok(DP.verdict(pol(CLUSTER), { op: 'tcp-connect', port: 22, host: '192.168.1.5' }).flag === 'lan' && DP.verdict(pol(CLUSTER), { op: 'run-cmd', cmd: 'ls' }).ok && DP.verdict(pol(CLUSTER), { op: 'upgrade' }).ok, 'the cluster default: LAN refused; commands and updates allowed');
  ok(DP.verdict(pol([]), { op: 'fs-op', action: 'list', path: '/' }).ok && DP.verdict(pol([]), { op: 'kill-session', chan: 3 }).ok && !DP.verdict(pol([]), { op: 'fs-op', action: 'write', path: '/x' }).ok, '`none`: reads and stops pass; a write is refused (files)');
  const u = DP.verdict(pol(['run', 'files', 'input', 'socks', 'lan', 'sessions']), { op: 'brand-new-op' });
  ok(!u.ok && u.flag === 'all' && /--allow all$/.test(u.remedy) && DP.verdict(pol(DP.FLAGS.slice()), { op: 'brand-new-op' }).ok, 'an op the table does not know runs only where EVERY flag is on (its re-run says all)', u);
  ok(DP.verdict(null, { op: 'input-events' }).ok && DP.verdict(null, { op: 'input-events' }).unjudged, 'no list stated (an agent older than the list) = not judged by the hub');
  // the file itself (lexical, on the device's own path module)
  const pf = '/home/u/.vibespace/device@hub/state/policy.json', H = { policyFile: pf, home: '/home/u', pathMod: path.posix };
  const T = (p) => DP.touchesPolicy(p, H);
  ok(T({ op: 'place-secret', path: pf }) && T({ op: 'fs-op', action: 'write', path: '~/.vibespace/device@hub/state/policy.json' }) && T({ op: 'fs-op', action: 'write-stream', step: 'open', path: pf }), 'a place-secret / write / stream onto policy.json (`~` = the device\'s home) touches it');
  ok(T({ op: 'fs-op', action: 'rm', path: '/home/u/.vibespace', recursive: true }) && T({ op: 'fs-op', action: 'rename', path: '/home/u/.vibespace/device@hub/state', to: '/tmp/x' }) && T({ op: 'fs-op', action: 'move', path: '/tmp/evil.json', to: pf }) && T({ op: 'fs-op', action: 'copy', path: '/tmp/state', to: '/home/u/.vibespace/device@hub/state' }), 'a removal / rename OF it or a folder above it, a move / copy ONTO it (or onto a folder above it) touches it');
  ok(!T({ op: 'fs-op', action: 'mkdir', path: '/home/u/.vibespace' }) && !T({ op: 'fs-op', action: 'write', path: '/home/u/.vibespace/device@hub/state/dial.json' }) && !T({ op: 'fs-op', action: 'read-range', path: pf }) && !T({ op: 'place-secret', path: '/home/u/.vibespace/k.key' }) && !T({ op: 'fs-op', action: 'rm', path: '/home/u/.vibespace/device@hub/state/policy.json.bak' }), 'NOT: a mkdir above it (a session\'s setup), another file of the folder (dial.json), a read, a sibling name');
  const WH = { policyFile: 'C:\\Users\\U\\.vibespace\\device@hub\\state\\policy.json', home: 'C:\\Users\\U', pathMod: path.win32 };
  ok(DP.touchesPolicy({ op: 'fs-op', action: 'write', path: 'c:\\users\\u\\.VIBESPACE\\device@hub\\state\\POLICY.json' }, WH) && DP.touchesPolicy({ op: 'fs-op', action: 'rm', path: '~\\.vibespace', recursive: true }, WH), 'Windows: case-insensitive, `~\\` = its home');
  ok(/^policy_is_the_devices: \/x\/state\/policy.json is the machine's own allow list — only the pairing command, run on the machine, changes it$/.test(DP.sentenceOf(DP.ownRefusal('/x/state/policy.json'))), 'the device says policy_is_the_devices, and how it changes');
}

console.log('— ④ THE ONE SEND POINT (a fake daemon link)');
const CAPS = ['run-shell', 'fs-portable', 'fs-write-stream', 'place-secret', 'input-events', 'desktop-serve', 'app-install', 'browser-serve', 'design-fs', 'peer-post', 'pool-orders', 'settings-open', 'window-pin', 'proc-list', 'sysinfo', 'display-facts'];
function fakeDm(policy, { platform = 'linux', machine = 'mac1', answerWith = null } = {}) {
  const lines = [], sent = [], logs = [];
  const dm = new DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'no-bundle.js'), version: '0', log: (...a) => logs.push(a.join(' ')), onAct: (l) => lines.push(l), machine });
  const conn = { nextId: 1, nextChan: 2, pending: new Map(), sessions: new Map(), info: { capabilities: CAPS, platform, posixShells: ['sh'], daemonVersion: '0', ...(policy ? { policy } : {}) } };
  const answer = (m, extra) => { const r = conn.pending.get(m.id); if (r) { conn.pending.delete(m.id); r({ id: m.id, ...extra }); } };
  conn.mux = {
    control: (m) => {
      sent.push(m);
      setImmediate(() => {
        if (answerWith) return answer(m, answerWith(m));
        if (m.op === 'run-cmd') return answer(m, { code: 0, stdout: 'hi\n', stderr: '' });
        if (m.op === 'serve-socks') return answer(m, { port: 4242 });
        return answer(m, { ok: true, result: { ok: true } });
      });
    },
    data: () => true, closeChan: () => { },
  };
  dm.connect = async () => conn; dm._conn = conn;
  return { dm, lines, sent, logs, conn };
}
const BY = 'system:test-device-policy';
const codeOf = async (p) => { try { await p; return 'sent'; } catch (e) { return e; } };
{
  const F = fakeDm(pol(CLUSTER));
  const e = await codeOf(F.dm.inputEvents([{ t: 'key', key: 'a' }], { by: BY }));
  ok(e && e.code === 'op-not-allowed' && e.flag === 'input' && /re-run the pairing command on "mac1" with --allow run,files,input,sessions,upgrade/.test(e.message) && /"mac1"'s own allow list/.test(e.message), 'inputEvents on a list without input ⇒ op-not-allowed input, the sentence names the machine and THE re-run', e && e.message);
  ok(!F.sent.some((m) => m.op === 'input-events'), 'NOTHING was sent (the refused act never travels)', F.sent.map((m) => m.op));
  ok(F.lines.length === 1 && F.lines[0].op === 'input-events' && F.lines[0].code === 'op-not-allowed' && F.lines[0].ok === false && F.lines[0].by === BY && /--allow run,files,input,sessions,upgrade/.test(F.lines[0].outHead), 'ONE audit line: op-not-allowed, who asked, its head = the re-run', F.lines);
  ok(F.logs.some((l) => /\[device-policy\] REFUSED input-events/.test(l)), 'said in the journal');
  const s1 = await codeOf(F.dm.serveSocks({ by: BY })), s2 = await codeOf(F.dm.tcpForward(22, '10.1.2.3', { by: BY }));
  ok(s1.code === 'op-not-allowed' && s1.flag === 'socks' && s2.code === 'op-not-allowed' && s2.flag === 'lan' && F.conn.sessions.size === 0, 'serve-socks ⇒ socks; a socket to another LAN host ⇒ lan, refused BEFORE a channel is held', { s1: s1.message, s2: s2.message, chans: F.conn.sessions.size });
  const r = await F.dm.runCmd('sh', ['-c', 'echo hi'], { by: BY });
  const lo = await codeOf(F.dm.tcpForward(5900, null, { by: BY }));
  ok(String(r.stdout).includes('hi') && F.sent.some((m) => m.op === 'run-cmd') && lo === 'sent', 'what the list allows is sent (a command; a port on the device\'s own loopback is a read)');
  // sessions off: the opens refuse before anything is sent; a stream before its channel opens
  const G = fakeDm(pol(['run', 'files', 'upgrade']));
  const o1 = await codeOf(G.dm.openPipeSession({ sid: 's1', cmd: 'an-agent-cli', args: [], env: { ANTHROPIC_API_KEY: 'k' } }));
  const o2 = await codeOf(G.dm.openSession({ cmd: 'bash', args: [], cols: 80, rows: 24 }));
  const o3 = await codeOf(G.dm.openPipeSession({ sid: 's1' }));
  const o4 = await G.dm.refusalOf({ op: 'open-pipe-session' });
  ok([o1, o2, o3, o4].every((x) => x && x.code === 'op-not-allowed' && x.flag === 'sessions') && !G.sent.some((m) => /session/.test(m.op)), 'sessions off: open-pipe-session (its account env), open-session, an attach and refusalOf all ⇒ op-not-allowed sessions; no session frame sent', G.sent.map((m) => m.op));
  const H = fakeDm(pol(['files']));
  const st = await codeOf(H.dm.runStream('sh', ['-c', 'yes'], { by: BY }));
  ok(st.code === 'op-not-allowed' && st.flag === 'run' && H.sent.length === 0 && H.conn.sessions.size === 0 && H.lines.length === 1, 'a stream is refused before its channel opens (nothing sent, ONE line)', { sent: H.sent, lines: H.lines.length });
  // an agent that states no list: not judged by the hub (the device has none either)
  const O = fakeDm(null);
  ok(await codeOf(O.dm.inputEvents([], { by: BY })) === 'sent' && O.sent.some((m) => m.op === 'input-events'), 'no list stated (an older agent) ⇒ not judged, sent as before');
  // the DEVICE's own refusal answers the id that asked, by name (a hub that did not ask first)
  const D = fakeDm(null, { answerWith: (m) => ({ op: 'op-refused', error: 'op-not-allowed: input-events needs "input" — x', code: 'op-not-allowed', flag: 'input', remedy: 're-run …' }) });
  const de = await codeOf(D.dm.inputEvents([], { by: BY }));
  ok(de.code === 'op-not-allowed' && de.flag === 'input' && de.remedy === 're-run …' && /needs "input"/.test(de.message), 'the device\'s op-refused answer rejects with its code, flag and remedy', de);
  ok(/m\.op === 'serve-socks-result' \|\| m\.op === 'op-refused'\)/.test(read('src/agentd/client.js')), 'the reply router hands op-refused to the id that asked');
  ok(JSON.stringify(F.dm.policy()) === JSON.stringify(DP.reportOf(pol(CLUSTER))) && O.dm.policy() === null, 'dm.policy() = the list the connected agent states (null = none)');
}

console.log('— ⑤ the hello-ack: never push an upgrade the device\'s list leaves off (the real Mux)');
{
  const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');
  const bundle = path.join(tmp, 'up-bundle.js');
  fs.writeFileSync(bundle, 'module.exports = { VERSION: "9.9.9" };\n');
  // int316 (lane device-bundle-signing in the same release): a hub pushes only the SIGNED release to another machine — the
  // fake bundle carries its release manifest (a throwaway key, as test-agentd-upgrade-loop's), so the CONTROL's push is the
  // allow list's verdict alone
  { const SIG = require('../src/agentd-signature.js'); const crypto = require('node:crypto'); const k = SIG.generateKeyPair({ crypto }); fs.writeFileSync(path.join(tmp, 'up-bundle.manifest.json'), JSON.stringify(SIG.sign(k.privateKeyPem, fs.readFileSync(bundle), '9.9.9', { crypto }))); }
  const run = async (policy) => {
    let upgrades = 0;
    const srv = net.createServer((sock) => {
      const mux = new Mux(sock, {
        onControl: (m) => {
          if (m.op === 'hello') mux.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '0.0.1', capabilities: [], platform: 'linux', policy });
          if (m.op === 'upgrade') { upgrades++; mux.control({ op: 'upgrade-failed', code: 'test', error: 'not here' }); }
        },
        onData: (chan, buf) => mux.credit(chan, buf.length), onDead: () => { },
      });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const s = await new Promise((res, rej) => { const c = net.connect(srv.address().port, '127.0.0.1'); c.on('connect', () => res(c)); c.on('error', rej); });
    const lines = [], logs = [], seen = [];
    const dm = new DeviceManager({ dataDir: tmp, bundlePath: bundle, version: '1.1.1', log: (...a) => logs.push(a.join(' ')), transport: { kind: 'stream', hostToken: 'vsht_x', getStream: () => s }, onAct: (l) => lines.push(l), onPolicy: (p) => seen.push(p), machine: 'mac1' });
    const out = await Promise.race([dm.connect().then(() => 'connected', (e) => 'failed: ' + e.message), sleep(2500).then(() => 'pending')]);
    try { dm.stop(); } catch { } try { s.destroy(); } catch { } srv.close();
    return { out, upgrades, lines, logs, seen };
  };
  const off = await run(pol(CLUSTER.filter((f) => f !== 'upgrade')));
  ok(off.out === 'connected' && off.upgrades === 0, 'a list without upgrade: the version drift pushes NOTHING, the link is kept', off);
  ok(off.lines.length === 1 && off.lines[0].op === 'upgrade' && off.lines[0].code === 'op-not-allowed' && /--allow run,files,sessions,upgrade/.test(off.lines[0].outHead) && off.logs.some((l) => /leaves "upgrade" off; using it as-is/.test(l)), 'said once in the journal + ONE refused audit line (its re-run)', { lines: off.lines, logs: off.logs });
  ok(off.seen.length === 1 && off.seen[0].allow.join() === 'run,files,sessions', 'onPolicy hears the list the hello-ack states (the machine record keeps it)', off.seen);
  const on = await run(pol(CLUSTER));
  ok(on.upgrades === 1, 'CONTROL: the same drift with upgrade on ⇒ the push is sent', on.upgrades);
}

console.log('— ⑥ the DEVICE (a REAL local daemon)');
{
  process.env.VIBESPACE_NODE_MODULES = path.join(REPO, 'node_modules');
  const esbuild = require('esbuild');
  const bundle = path.join(tmp, 'agentd.js');
  esbuild.buildSync({ entryPoints: [path.join(REPO, 'src/agentd/agentd.js')], bundle: true, platform: 'node', outfile: bundle, logLevel: 'silent', external: ['node-pty'] });
  const src = read('src/agentd/agentd.js');
  const CHECK = "      if (!pv.ok) { refuseOp(mux, msg, pv); return; }\n";
  const mutSrc = src.replace(CHECK, '');
  const mutBundle = path.join(tmp, 'agentd-mutant.js');
  esbuild.buildSync({ stdin: { contents: mutSrc, resolveDir: path.join(REPO, 'src/agentd'), sourcefile: 'agentd.js', loader: 'js' }, bundle: true, platform: 'node', outfile: mutBundle, logLevel: 'silent', external: ['node-pty'] });
  ok(src.includes(CHECK) && mutSrc !== src, 'the mutant copy drops exactly the device\'s check line');
  // the installer's writer: the agent's own --write-policy
  const wp = (root, val) => spawnSync(process.execPath, [bundle, '--write-policy', val], { env: { ...process.env, VIBESPACE_DEVICE_ROOT: root, VIBESPACE_AGENTD_ROOT: root }, encoding: 'utf8', timeout: 20000 });
  const badRoot = path.join(tmp, 'bad-root');
  const bad = wp(badRoot, 'run,keyboard');
  ok(bad.status === 2 && /unknown: keyboard/.test(bad.stderr) && !fs.existsSync(path.join(badRoot, 'state', 'policy.json')), '--write-policy with an unknown flag: exit 2 by name, nothing written', { status: bad.status, err: bad.stderr });
  const notRefused = (x) => x === 'sent' || x === 'opened' || (x instanceof Error && !/op-not-allowed|policy_is_the_devices/.test(String(x.code) + ' ' + x.message));
  const leg = async (tag, bundlePath, { rmFolder = true } = {}) => {
    const root = path.join(tmp, 'root-' + tag);
    const w = wp(root, 'run,files,upgrade');
    const pf = path.join(root, 'state', 'policy.json');
    const before = fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8') : '';
    process.env.VIBESPACE_AGENTD_ROOT = root;
    const lines = [];
    const dm = new DeviceManager({ dataDir: path.join(tmp, 'data-' + tag), bundlePath, version: require('../package.json').version, log: () => { }, onAct: (l) => lines.push(l), machine: 'this-box' });
    fs.mkdirSync(path.join(tmp, 'data-' + tag), { recursive: true });
    const out = { w, pf, before };
    try {
      dm.installLocal();
      await dm.connect();
      out.stated = dm.policy();
      out.run = (await dm.runCmd('sh', ['-c', 'echo allowed'], { by: BY })).stdout;
      out.hubInput = await codeOf(dm.inputEvents([], { by: BY })); // the hub asks first
      dm._conn.info.policy = undefined; // ── a hub that SKIPS its own check: the device alone decides from here ──
      out.input = await codeOf(dm.inputEvents([], { by: BY }));
      out.placed = await codeOf(dm.placeSecret(pf, Buffer.from('{"v":1,"allow":["run","files","input","socks","lan","sessions","upgrade"],"all":true}'), { by: BY }));
      out.write = await codeOf(dm.fsWrite(pf, Buffer.from('{}'), { by: BY }));
      const h = await dm.openPipeSession({ sid: 'pol-' + tag, cmd: 'sh', args: ['-c', 'echo session-ran'], env: { ANTHROPIC_API_KEY: 'sk-test-not-a-key' } });
      out.session = await Promise.race([h.ready.then(() => 'opened', (e) => e), sleep(5000).then(() => 'pending')]);
      if (rmFolder) out.rm = await codeOf(dm.fsRm(path.join(root, 'state'), true, { by: BY })); // the mutant would really remove it
      out.after = fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8') : '';
      out.sessionFile = fs.existsSync(path.join(root, 'state', 'sessions', `pol-${tag}.json`));
      let text = '';
      for (let i = 0; i < 100 && !/open-pipe-session/.test(text); i++) { await sleep(20); try { text = fs.readFileSync(path.join(root, 'state', 'acts.log'), 'utf8'); } catch { } }
      out.acts = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      out.mode = fs.statSync(pf).mode & 0o777;
    } catch (e) { out.threw = e && e.stack; }
    finally { try { dm.stop(); } catch { } endDaemonsAndWait(root); }
    return out;
  };
  const R = await leg('real', bundle);
  ok(!R.threw && R.w.status === 0 && /allow list: run,files,upgrade/.test(R.w.stdout) && R.mode === 0o600 && JSON.parse(R.before).allow.join() === 'run,files,upgrade', '--write-policy run,files,upgrade: state/policy.json at 0600, said', R.threw || { w: R.w.stdout, mode: R.mode });
  ok(R.stated && R.stated.allow.join() === 'run,files,upgrade' && R.stated.source === 'install', 'the hello-ack states the list (source install)', R.stated);
  ok(/allowed/.test(R.run) && R.hubInput.code === 'op-not-allowed' && R.hubInput.flag === 'input', 'a command runs; the hub refuses input-events itself (its re-run named)', R.hubInput && R.hubInput.message);
  ok(R.input.code === 'op-not-allowed' && R.input.flag === 'input' && /re-run the pairing command on this machine with --allow run,files,input,upgrade/.test(R.input.message), 'a hub that skips its check: the DEVICE refuses input-events — op-not-allowed input + its re-run', R.input && R.input.message);
  ok(R.placed.code === 'policy_is_the_devices' && R.write.code === 'policy_is_the_devices' && R.rm.code === 'policy_is_the_devices' && R.after === R.before, 'place-secret / fs-op write onto policy.json and rm -r of its folder ⇒ policy_is_the_devices (files ON) — the file unchanged', { placed: R.placed.message, write: R.write.message, rm: R.rm.message });
  ok(R.session instanceof Error && /needs "sessions"/.test(R.session.message) && !R.sessionFile, 'a session open carrying an account env ⇒ refused (sessions); nothing spawned, no session record', R.session && (R.session.message || R.session));
  const refusedOps = R.acts.filter((l) => l.ok === false).map((l) => `${l.op} → ${l.code}`);
  ok(refusedOps.includes('input-events → op-not-allowed') && refusedOps.includes('place-secret → policy_is_the_devices') && refusedOps.includes('open-pipe-session → op-not-allowed'), 'the device\'s own acts.log says each refusal (who asked, the code)', refusedOps);
  const M = await leg('mutant', mutBundle, { rmFolder: false });
  ok(!M.threw && notRefused(M.input) && notRefused(M.write) && M.session === 'opened' && M.after !== M.before, 'MUTANT (agentd without the check): the same requests RUN — input-events dispatched, policy.json overwritten, the session opened ⇒ the legs above are RED', M.threw || { input: String(M.input && (M.input.message || M.input)), write: String(M.write && (M.write.message || M.write)), session: String(M.session && (M.session.message || M.session)), after: M.after });
}

console.log('— ⑦ the hub\'s record, the session setup, the pairing default, the installers, the exit refusal');
{
  const { HostManager } = require('../src/hosts.js');
  const h = { id: 'h1', name: 'mac1' }; let saves = 0;
  const fake = { get: (id) => (id === 'h1' ? h : (() => { throw new Error('no'); })()), _save: () => { saves++; } };
  const p1 = HostManager.prototype.notePolicy.call(fake, 'h1', pol(CLUSTER));
  const p2 = HostManager.prototype.notePolicy.call(fake, 'h1', pol(CLUSTER));
  const p3 = HostManager.prototype.notePolicy.call(fake, 'h1', { ...pol(DP.FLAGS.slice()), source: 'legacy' });
  ok(p1 === true && p2 === false && p3 === true && saves === 2 && h.devicePolicy.source === 'legacy' && HostManager.prototype.notePolicy.call(fake, 'zz', pol(CLUSTER)) === false, 'hosts.notePolicy keeps the stated list on the record (devicePolicy), saved only when it moved', { saves, h });
  const dial = read('src/spawn/dial.js');
  const setup = dial.slice(dial.indexOf('const deviceAgentSetup = async'), dial.indexOf('const dialAcctAssign'));
  const ask = setup.indexOf("await dm.refusalOf({ op: 'open-pipe-session', sid })");
  const firstAct = Math.min(...['dm.runCmd(', 'dm.fsMkdir(', 'dm.fsWrite(', 'dm.placeSecret(', 'dm.reverseForward('].map((n) => setup.indexOf(n)).filter((i) => i >= 0));
  ok(ask > 0 && ask < firstAct, 'a dial session\'s setup asks `sessions` BEFORE its first act (no tool, token, account key or OAuth env travels to a device with sessions off)', { ask, firstAct });
  const mutDial = setup.replace("{ const off = await dm.refusalOf({ op: 'open-pipe-session', sid }); if (off) throw off; }", '');
  ok(mutDial !== setup && mutDial.indexOf("refusalOf({ op: 'open-pipe-session'") < 0, 'MUTANT: the setup without its ask ⇒ the pin above is RED');
  const wiring = read('src/server/mounts-plugins-wiring.js');
  ok(/allowDefault: require\('\.\.\/device-policy\.js'\)\.defaultAllow\(\{ cluster: !!process\.env\.VIBESPACE_INSTANCE_NAME \}\), clusterInstance: !!process\.env\.VIBESPACE_INSTANCE_NAME,/.test(wiring) && /--host-token \$\{pair\.hostToken\} --allow \$\{require\('\.\.\/device-policy\.js'\)\.allowArg\(allowDefault\)\}/.test(wiring), 'the pairing route answers the instance kind\'s default (VIBESPACE_INSTANCE_NAME = a cluster); an ssh graduation installs with it');
  const sh = read('scripts/vibespace-agentd-install.sh'), ps = read('scripts/vibespace-agentd-install.ps1');
  const shWrite = sh.indexOf('--write-policy "$ALLOW"'), shTok = sh.indexOf('# host token: provided (from pairing) or minted locally'), shCheck = sh.indexOf('--dial-check "$DIAL_URL"');
  ok(/--allow\) ALLOW="\$2"; shift 2;;/.test(sh) && /--allow=\*\) ALLOW="\$\{1#--allow=\}"; shift;;/.test(sh) && shCheck > 0 && shCheck < shWrite && shWrite < shTok && /nothing was installed — the --allow list was refused/.test(sh), 'the bash installer: --allow x / --allow=x, written by the agent\'s own --write-policy AFTER the dial check and BEFORE the host token (refused ⇒ nothing installed)');
  const psWrite = ps.indexOf('--write-policy $Allow'), psTok = ps.indexOf("Set-Content -NoNewline -Path (Join-Path $root 'state\\token')");
  ok(/\[string\]\$Allow,/.test(ps) && psWrite > 0 && psWrite < psTok && /exit 2 \}/.test(ps.slice(psWrite, psTok)), 'the PowerShell installer: -Allow, written BEFORE the token (refused ⇒ exit 2)');
  const bashN = spawnSync('bash', ['-n', path.join(REPO, 'scripts/vibespace-agentd-install.sh')], { encoding: 'utf8' });
  ok(bashN.status === 0, 'the bash installer parses (bash -n)', bashN.stderr);
  const E = require('../src/exit-reach.js');
  const xr = read('src/server/exit-routes.js'), xp = read('src/exit-proxy.js');
  ok(E.REFUSALS.includes('op_not_allowed') && E.refusalText('op_not_allowed', { machine: 'mac1', error: 'op-not-allowed: run-cmd needs "run" — x; re-run the pairing command on "mac1" with --allow run' }).startsWith('op-not-allowed: run-cmd needs "run"') && /op_not_allowed: 403/.test(xr), 'an agent\'s exit run / use / push on a list without it: 403 op_not_allowed, the device\'s sentence (never "the link failed")');
  ok(/if \(e && e\.code === 'op-not-allowed'\) \{ card\(\{ outcome: 'not_granted', cmd \}\); throw this\._refused\(session, sessionId, \{ code: 'op_not_allowed'/.test(xp) && /e && e\.code === 'op-not-allowed' \? Object\.assign\(e, \{ code: 'op_not_allowed' \}\)/.test(xp) && /throw fail\('op_not_allowed', \{ error: e\.message \}, 'not_granted'\)/.test(xp), 'exit-proxy names it on all three roads (run, use, push)');
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
