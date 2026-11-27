#!/usr/bin/env node
// A PAIR IS DECIDED BY EACH SOCKET'S OWN PROGRAM (fast, in-process — section ③d of scripts/test-boot-probes.mjs, MOVED WORD FOR WORD with its
// red controls by 主开发 r5537, lane nl-starts: that suite read 11.05 s alone, past the 10 s bound). The setup below is the old suite's own,
// copied as it is (its fakes, its scratch data dir, its session stand-ins, its signal recorder); nothing in the legs is changed.
// ONE helper line differs: ok() refuses a name that is not a string (test-ci-gate-tiers §7b: a new file's helper is guarded) — its verdicts as before.
//   ③d A PAIR IS DECIDED BY EACH SOCKET'S OWN PROGRAM, NOTHING IS SIGNALLED BY A PATTERN, THE SOCKET LEAVES LAST (B-b2d3 step 2,
//     主开发 r5028 / r5032): (a) the kernel's answer for one socket's file (the REAL fuser over a real socket of the leg's own) names
//     its listener, never a person's attach or the hub's own; (b) one proven dead retires by its held records only (its master by the
//     fuser answer's birth — the master this session started, its wrapper's parent (r5523) — its wrapper by pid + birth), a person's attach untouched, the socket after both are gone; (b2) the wrapper
//     first: one that outlives its signal by the bound leaves the master unsignalled and the socket in place; (c) a master past
//     the bound is LEFT with its socket, one signal only; (d) a second start over that folder meets the dead-socket road; (e) both alive
//     ⇒ both kept, said once as a pair by their names; (f) both dead ⇒ the newer kept; (g) a number with no birth: still there = kept and
//     asked again, gone = its program ended but no master proven: its holder left and said (r5523); (h) a pair proven alive at a later pass is decided, said once, never asked again. REDs: the
//     release's retire (its pattern SIGTERMs the person's attach; it removes the socket before an answer), its decision (the newer
//     always wins: a living older one ended), and a retire that signals the wrapper and the master at once (the master ended first).
// Run: node scripts/test-boot-probes-pairs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok() was handed a ${typeof n} as its name (arguments swapped, or not a sentence)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
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
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (fn, ms) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await sleep(25); return fn(); };
const kids = [];
const SESS = [];   // [pid, start] of each session's wrapper stand-in (a grandchild, read from its master's children list): swept at exit only while its birth reads the same
let PIDS = null; // every hanging fake appends its pid: the exit sweep ends what a bound has not — registered BEFORE scratch(), whose own exit hook removes the root (and this file) first otherwise
process.on('exit', () => {
  let pids = []; try { pids = fs.readFileSync(PIDS, 'utf8').split('\n').map((l) => Number(l.split(' ')[0])).filter((n) => n > 1); } catch { }
  const isOurs = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').startsWith('sleep\u0000'); } catch { return false; } }; // still the fake's sleep (a recorded pid is never trusted blind)
  for (const pid of [...pids, ...kids.map((k) => k.pid)]) if (isOurs(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } }
  try { for (const [pid, st] of SESS) if (st && PIt.startToken(pid) === st) { try { process.kill(pid, 'SIGKILL'); } catch { } } } catch { }
});
const ROOT = scratch('boot-probes-pairs');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(path.join(ROOT, 'bin'), { recursive: true });
PIDS = path.join(ROOT, 'pids');
const realBin = (b) => process.env.PATH.split(':').map((d) => path.join(d, b)).find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } });
const REAL_FUSER = realBin('fuser');   // B-b2d3 step 2 (③d (a)): the kernel's own answer for one socket's file, read before the fakes go on PATH
const HANG = (what) => `echo "$$ ${what}" >> "$d/pids"; trap '' TERM; exec sleep 60`; // <pid> <socket basename or cut>
fs.writeFileSync(path.join(ROOT, 'bin', 'fuser'), `#!/bin/sh\nd=${JSON.stringify(ROOT)}\nfor a; do last=$a; done\nm=$(cat "$d/mode-$(basename "$0")-$(basename "$last")" 2>/dev/null || cat "$d/mode-$(basename "$last")" 2>/dev/null || cat "$d/mode" 2>/dev/null || echo hang)\ncase "$m" in\n  alive) cat "$d/alive-pid"; exit 0;;\n  dead) exit 1;;\nesac\n${HANG('$(basename "$last")')}\n`, { mode: 0o755 });
fs.copyFileSync(path.join(ROOT, 'bin', 'fuser'), path.join(ROOT, 'bin', 'pgrep')); fs.chmodSync(path.join(ROOT, 'bin', 'pgrep'), 0o755);
const mode = (name, m) => fs.writeFileSync(path.join(ROOT, name ? `mode-${name}` : 'mode'), m); // name = '<socket>' or '<tool>-<socket>' or 'cut'
mode(null, 'hang');
process.env.PATH = path.join(ROOT, 'bin') + ':' + process.env.PATH;
process.env.VIBESPACE_PROBE_CAP_MS = '1500';
const CAP = 1500;
const victim = spawn('sh', ['-c', 'sleep 60 & exec sleep 61'], { stdio: 'ignore' }); kids.push(victim); // the "dtach husk" a duplicate's retire SIGTERMs (the fake pgrep names it) — its wrapper's PARENT (r5523: only that master is signalled)
fs.writeFileSync(path.join(ROOT, 'alive-pid'), String(victim.pid));

const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
const M = mutantCopies('boot-probes-pairs', REPO);

// ── a scratch data dir: sockets, metas (session-stdout's file shape), buffers + sidecars ──
const dataDir = (tag) => { const d = path.join(ROOT, tag); for (const s of ['sockets', 'meta', 'buffers']) fs.mkdirSync(path.join(d, s), { recursive: true }); return d; };
function instance(BRm, d, { onAttach = null, retireWaitMs = 1000 } = {}) {   // B-b2d3 step 2: the retire's bound here 1 s (the hub's 5 s): a program of ours ends at its signal
  const SOCK = path.join(d, 'sockets'), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers');
  const metaFile = (s) => path.join(META, s + '.json');
  const activeSessions = new Map(), attached = [], notes = [], broadcasts = { n: 0 }, ended = [];
  const api = BRm.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
    activeSessions, sessionCounterRef: { value: 0 }, attachToDtach: (id, sp, s, o) => { if (onAttach) onAttach(id, s, o); attached.push(id); s.pty = null; }, setupSessionPty: () => { },
    readSessionMeta: (s) => { try { return JSON.parse(fs.readFileSync(metaFile(s), 'utf8')); } catch { return {}; } },
    writeSessionMeta: (s, m) => fs.writeFileSync(metaFile(s), JSON.stringify(m)), deleteSessionMeta: (s) => { try { fs.unlinkSync(metaFile(s)); } catch { } },
    broadcastToSession: () => { }, broadcastActiveSessions: () => { broadcasts.n++; }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { },
    getHosts: () => null, getDialBridge: () => null, getExitProxy: () => ({ onSessionEnd: (s, id) => ended.push(id) }), note: (l) => notes.push(l), retireWaitMs });
  // a session the shape of a real one: cw-<counter>-<ms> socket, its meta, its wrapper sidecar + buffer
  const add = (n, meta = {}) => {
    const sock = `cw-${n}-${1760480000000 + n * 1000}`, id = 'sess-' + sock.slice(3);
    fs.writeFileSync(path.join(SOCK, sock), '');
    fs.writeFileSync(metaFile(sock), JSON.stringify({ webuiSessionId: id, name: `shell ${n}`, cwd: '/srv/work/app', backend: 'shell', mode: 'terminal', createdAt: 1760480000000 + n * 1000, ...meta }));
    fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify({ mode: 'terminal' })); fs.writeFileSync(path.join(BUF, id + '.buf'), '$ ');
    return { sock, id, sockPath: path.join(SOCK, sock), meta: metaFile(sock), buf: path.join(BUF, id + '.buf') };
  };
  return { api, activeSessions, attached, notes, broadcasts, ended, add };
}
// B-b2d3 step 2: a pair member's PROGRAM as its wrapper's side file records it — `liveChild()` a sleep of ours with its real birth
// (alive), `deadChild()` the same number with a birth that is not its own (pid-recycled = proven dead); `programAs(x, rec)` writes it
const PIt = require(path.join(REPO, 'src/proc-identity.js'));
const kidsOfP = (pid) => { try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).map(Number).filter((n) => n > 1); } catch { return []; } };
const cmdOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { return ''; } };
// A SESSION's stand-ins (主开发 r5523: the retire signals only the master THIS session started — its wrapper's parent): `sh` forks the wrapper
// stand-in and execs into the master; the wrapper's birth read only while the kernel lists it as that held master's child
const wrapperOfMaster = async (m) => { await until(() => kidsOfP(m.pid).length > 0 && cmdOf(m.pid).startsWith('sleep\u000061'), 3000); const w = kidsOfP(m.pid)[0] || 0, st = PIt.startToken(w); SESS.push([w, st]); return { w, rec: { pid: w, pidStart: st, pidBoot: PIt.bootToken() } }; };
const sessionOf = async ({ deafWrapper = false, deafMaster = false } = {}) => {
  const m = spawn('sh', ['-c', `${deafWrapper ? '(trap "" TERM; exec sleep 60)' : 'sleep 60'} & ${deafMaster ? 'trap "" TERM; ' : ''}exec sleep 61`], { stdio: 'ignore' }); kids.push(m);
  const r = await wrapperOfMaster(m); fs.writeFileSync(path.join(ROOT, 'alive-pid'), String(m.pid));   // the fake fuser names this master
  return { m, ...r };
};
const liveChild = () => { const v = spawn('sleep', ['60'], { stdio: 'ignore' }); kids.push(v); return { childPid: v.pid, childStart: PIt.startToken(v.pid), childBoot: PIt.bootToken(), proc: v }; };
const deadChild = () => { const v = spawn('sleep', ['60'], { stdio: 'ignore' }); kids.push(v); return { childPid: v.pid, childStart: 'l1', childBoot: PIt.bootToken(), proc: v }; };
const PAIR_WORDS = "two cards of one conversation: «claude older» and «claude newer» — both kept: each one's program runs or is not proven ended, and none is ended because of a pair; end the one you meant";   // B-b2d3 step 2: a kept pair's ONE sentence, by its cards' names (word (b))
const programAs = (x, rec) => { const f = x.buf.replace(/\.buf$/, '.json'); let cur = {}; try { cur = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { } const { proc, ...keep } = rec || {}; fs.writeFileSync(f, JSON.stringify({ ...cur, ...keep })); };
const logged = async (fn) => { const lines = [], log = console.log, warn = console.warn; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { return { r: await fn(), lines }; } finally { console.log = log; console.warn = warn; } };
const signals = []; const realKill = process.kill.bind(process);
process.kill = (pid, sig) => { if (sig !== 0 && sig !== undefined) signals.push([pid, sig]); return realKill(pid, sig); };
const brSrc = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');

try {
  console.log('③d B-b2d3 STEP 2 (主开发 r5028 / r5032): A PAIR IS DECIDED BY EACH SOCKET\'S OWN PROGRAM; NOTHING IS SIGNALLED BY A PATTERN; THE SOCKET LEAVES LAST');
  {
    const net = require('net');
    const master = () => { const v = spawn('sleep', ['60'], { stdio: 'ignore' }); kids.push(v); fs.writeFileSync(path.join(ROOT, 'alive-pid'), String(v.pid)); return v; };   // the socket's master as the fake fuser names it
    const stubborn = () => { const v = spawn('sh', ['-c', 'trap "" TERM; exec sleep 60'], { stdio: 'ignore' }); kids.push(v); fs.writeFileSync(path.join(ROOT, 'alive-pid'), String(v.pid)); return v; };   // a master that does not end on SIGTERM
    const pairOf = (X, n, older, newer) => { const cid = `5f0c2a8e-7d41-4b9a-9e36-0c1d2b3b${n}`; const o = X.add(n, { backend: 'claude', claudeSessionId: cid, name: 'claude older' }), w = X.add(n + 1, { backend: 'claude', claudeSessionId: cid, name: 'claude newer' }); mode(o.sock, 'alive'); mode(w.sock, 'alive'); if (older) programAs(o, older); if (newer) programAs(w, newer); return { cid, older: o, newer: w }; };
    const boot = async (BRm, tag, setUp, opts = {}) => { const X = instance(BRm, dataDir(tag), opts), p = setUp(X); const t = await logged(async () => { await X.api.probeSockets(); return X.api.restoreSessions(); }); return { X, p, lines: t.lines }; };
    const termsTo = (pid) => signals.filter(([q, sig]) => q === pid && sig === 'SIGTERM').length;
    const t3d = Date.now(), warned = [], warnD = console.warn;
    console.warn = (...a) => { warned.push(a.join(' ')); warnD(...a); };   // the retire's «not retired» line comes after its boot returned
    const leftSaid = (sock, more = []) => [...more, ...warned].filter((l) => l.includes(`] ${sock}: not retired — `)).length;   // more: its boot's own lines (a slow boot may still hold the capture)
    // THE RELEASE'S READINGS, in copies of the tip: its retire (a pgrep of the socket's whole path, SIGTERM to every pid it names, the
    // socket removed before the answer) and its local decision (the newer always wins — the scan answered «nobody» for every claude)
    const RD_A = '/** A stale duplicate of a conversation another socket owns — B-b2d3 step 2', RD_Z = "  } catch (e) { return leave(`its retire failed: ${(e && e.message) || e}`); }\n}\n";
    const rdAt = brSrc.indexOf(RD_A), rdEnd = rdAt >= 0 ? brSrc.indexOf(RD_Z, rdAt) : -1, RD = rdAt >= 0 && rdEnd > rdAt ? brSrc.slice(rdAt, rdEnd + RD_Z.length) : RD_A;
    ok(rdAt >= 0 && rdEnd > rdAt, 'the RED copies\' slice of the tip\'s retire is found (its doc head to its end)', { rdAt, rdEnd });
    const RELEASE_RETIRE = "function retireDuplicate(sockFile, socketPath, id, claudeSessionId, run = runChildP) {\n  console.log(`  ⤫ Duplicate of ${claudeSessionId} — retiring stale ${sockFile}`);\n  run('pgrep', ['-f', socketPath], 2000).then((r) => {\n    for (const p of r.code === 0 ? r.out.split('\\n') : []) {\n      const pid = Number(p.trim());\n      if (pid > 1 && pid !== process.pid) { try { process.kill(pid, 'SIGTERM'); } catch {} }\n    }\n  }, () => { });\n  try { fs.unlinkSync(socketPath); } catch {}\n  require('./wrapper-files.js').removeWrapperFiles(BUFFERS_DIR, id);\n  deleteSessionMeta(sockFile);\n}\n";   // stale-pins: kept (the release's retire, put back in a RED copy)
    const OLDRET = require(M.write('src/server/boot-restore.js', editAnchor(brSrc, RD, RELEASE_RETIRE, 'src/server/boot-restore.js'), 'b2d3s2-release-retire'));
    const OLDDEC = require(M.write('src/server/boot-restore.js', editAnchor(editAnchor(brSrc, "  const dead = rows.filter((r) => r.program === 'dead');\n", '  const dead = rows;   // the release: the newer always wins\n', 'src/server/boot-restore.js'), '    if (recheck) {', '    if (false) { /* the release read no program at its retire either */', 'src/server/boot-restore.js'), 'b2d3s2-newer-wins'));
    const W_FIRST = "    for (const h of wrapper) PIB.signalIdentity(h.ident, 'SIGTERM', { what: h.what });\n";
    const BOTHNOW = require(M.write('src/server/boot-restore.js', editAnchor(brSrc, W_FIRST, "    for (const h of [...wrapper, ...masters]) PIB.signalIdentity(h.ident, 'SIGTERM', { what: h.what });   // RED: both at once\n", 'src/server/boot-restore.js'), 'b2d3s2-both-at-once'));
    try {
      // (a) THE KERNEL'S ANSWER FOR ONE SOCKET'S FILE NAMES ITS LISTENER: a real socket of the leg's own — its master a child of ours
      // listening on it, a «person's own attach» a child connected to it, the «hub's own attach» this process connected to it; the
      // real fuser names the master alone
      const rsock = path.join(ROOT, 'b2d3-real.sock');
      try { fs.unlinkSync(rsock); } catch { }
      const lis = spawn(process.execPath, ['-e', "require('net').createServer(() => process.stdout.write('c')).listen(process.argv[1]); setInterval(() => {}, 1e5)", rsock], { stdio: ['ignore', 'pipe', 'ignore'] }); kids.push(lis);
      let accepted = 0; lis.stdout.on('data', (b) => { accepted += String(b).split('c').length - 1; });   // the listener's own word for each attach it took
      await until(() => fs.existsSync(rsock), 5000);
      const att = spawn(process.execPath, ['-e', "require('net').connect(process.argv[1]); setInterval(() => {}, 1e5)", rsock], { stdio: 'ignore' }); kids.push(att);
      const mine = net.connect(rsock); await new Promise((r) => { mine.once('connect', r); mine.once('error', r); });
      await until(() => accepted >= 2, 3000);   // both attaches taken by the listener (no fixed wait)
      let named = null;
      if (REAL_FUSER) named = await new Promise((r) => require('child_process').execFile(REAL_FUSER, [rsock], { timeout: 5000 }, (e, out) => r(String(out || '').match(/\d+/g) || [])));
      ok(!!REAL_FUSER && named.includes(String(lis.pid)) && !named.includes(String(att.pid)) && !named.includes(String(process.pid)),
        `THE KERNEL'S ANSWER FOR THAT ONE FILE (fuser) names the socket's LISTENER (${lis.pid}) — not a person's own attach to it (${att.pid}), not the hub's own attach (${process.pid})`, { fuser: REAL_FUSER, named });
      mine.destroy(); for (const k of [lis, att]) { try { k.kill('SIGKILL'); } catch { } }
      // (b) ONE PROVEN DEAD RETIRES — by its held records only: its master (the fuser answer's pid, by its birth) and its wrapper (pid +
      // birth); a «person's attach» whose command line names the socket's path is never signalled; the socket and its files go only
      // after the kernel says both are gone. RED: the release's retire SIGTERMs the person's attach (its pgrep matched the path)
      const personSock = path.join(ROOT, 'b2d3s2-dead', 'sockets', `cw-141-${1760480000000 + 141 * 1000}`);   // the older socket's path (add()'s naming): the command line a `pgrep -f` matches — its round's should: the leg says what it tests
      const person = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e5)', 'vs-person-attach', personSock], { stdio: 'ignore' }); kids.push(person);
      const s1 = await sessionOf(), m1 = s1.m, wr = { childPid: s1.w };
      const b1 = await boot(BR, 'b2d3s2-dead', (X) => { const p = pairOf(X, 141, deadChild(), liveChild()); programAs(p.older, s1.rec); return p; });
      await until(() => !fs.existsSync(b1.p.older.sockPath), 6000);
      ok(termsTo(m1.pid) === 1 && termsTo(wr.childPid) === 1 && !alive(m1.pid) && !alive(wr.childPid) && termsTo(person.pid) === 0 && alive(person.pid)
        && !fs.existsSync(b1.p.older.sockPath) && !fs.existsSync(b1.p.older.meta) && !b1.X.activeSessions.has(b1.p.older.id) && b1.X.activeSessions.has(b1.p.newer.id),
        'ONE PROVEN DEAD (its birth not its own) RETIRES by its held records only — its socket\'s master and its wrapper SIGTERMed once each by their births, the person\'s attach untouched — and its socket, files and meta go after both are gone; the newer stays', { signals: signals.slice(-6), person: alive(person.pid) });
      fs.writeFileSync(path.join(ROOT, 'alive-pid'), String(person.pid));   // the release's pgrep (the fake) now names the process whose command line holds the path
      const r1 = await boot(OLDRET, 'b2d3s2-red-pattern', (X) => pairOf(X, 143, deadChild(), liveChild()));
      await until(() => !alive(person.pid), 3000);
      ok(termsTo(person.pid) === 1, `RED: the release's retire signals by the pattern — the person's attach SIGTERMed (${termsTo(person.pid)})`, r1.lines.filter((l) => /Duplicate/.test(l)));
      // (b2) THE WRAPPER FIRST: a wrapper held by its pid + birth that outlives its SIGTERM by the bound (300 ms here) leaves its socket's
      // master UNSIGNALLED — a dtach master removes its own socket as it ends — and the socket, files and meta in place, said once.
      // RED: a copy that signals the wrapper and the master at once ends the master while the wrapper still runs
      const wrapperOf = () => { const v = spawn('sh', ['-c', 'trap "" TERM; exec sleep 60'], { stdio: 'ignore' }); kids.push(v); return v; };   // a wrapper that does not end on SIGTERM (not on the fake fuser's answer)
      const sb = await sessionOf({ deafWrapper: true }), sw = { pid: sb.w }, mw = sb.m;
      const bw = await boot(BR, 'b2d3s2-wrapper-first', (X) => { const p = pairOf(X, 145, deadChild(), liveChild()); programAs(p.older, sb.rec); return p; }, { retireWaitMs: 300 });
      await until(() => leftSaid(bw.p.older.sock, bw.lines) > 0, 4000);   // the retire's own word that it left everything (past its 0.3 s bound)
      ok(leftSaid(bw.p.older.sock, bw.lines) === 1 && termsTo(sw.pid) === 1 && alive(sw.pid) && termsTo(mw.pid) === 0 && alive(mw.pid) && fs.existsSync(bw.p.older.sockPath) && fs.existsSync(bw.p.older.meta) && fs.existsSync(bw.p.older.buf),
        'THE WRAPPER FIRST: a wrapper still there past the bound leaves its socket\'s master unsignalled and the socket, files and meta in place — one SIGTERM, to the wrapper only, said once', { wrapper: termsTo(sw.pid), master: termsTo(mw.pid), said: warned.filter((l) => l.includes(bw.p.older.sock)) });
      const sb2 = await sessionOf({ deafWrapper: true }), sw2 = { pid: sb2.w }, mw2 = sb2.m;
      await boot(BOTHNOW, 'b2d3s2-red-both-at-once', (X) => { const p = pairOf(X, 147, deadChild(), liveChild()); programAs(p.older, sb2.rec); return p; }, { retireWaitMs: 300 });
      await until(() => signals.some(([q]) => q === mw2.pid), 3000);
      ok(termsTo(mw2.pid) === 1 && alive(sw2.pid), `RED: a retire that signals both at once ends the master (${termsTo(mw2.pid)}) while the wrapper still runs`);
      for (const k of [mw, mw2]) { try { k.kill('SIGKILL'); } catch { } }   // the masters by their handles; their deaf wrappers by the exit sweep (by birth)
      // (c) THE SOCKET LEAVES LAST, THE BOUND SAID: a master that outlives its SIGTERM by the bound (here 300 ms) is LEFT — its socket,
      // files and meta in place, no second signal, said once; then (d) the hub ended between (the master gone at last, a second start
      // over the same folder) meets the dead-socket road, nothing signalled twice. RED: the release removes the socket before an answer
      const sc = await sessionOf({ deafMaster: true }), m2 = sc.m;
      const c1 = await boot(BR, 'b2d3s2-stubborn', (X) => { const p = pairOf(X, 151, deadChild(), liveChild()); programAs(p.older, sc.rec); return p; }, { retireWaitMs: 300 });
      await until(() => leftSaid(c1.p.older.sock, c1.lines) > 0, 4000);   // the retire's own word that it left everything (past its 0.3 s bound)
      ok(leftSaid(c1.p.older.sock, c1.lines) === 1 && termsTo(m2.pid) === 1 && alive(m2.pid) && fs.existsSync(c1.p.older.sockPath) && fs.existsSync(c1.p.older.meta) && fs.existsSync(c1.p.older.buf),
        'THE SOCKET LEAVES LAST: a master still there past the bound (0.3 s here, 5 s in the hub) is LEFT — socket, files and meta in place, ONE SIGTERM, no stronger signal, said once', { terms: termsTo(m2.pid), alive: alive(m2.pid), said: warned.filter((l) => l.includes(c1.p.older.sock)) });
      try { process.kill(m2.pid, 'SIGKILL'); } catch { }
      await until(() => !alive(m2.pid), 3000);
      mode(c1.p.older.sock, 'dead');
      const again = instance(BR, path.join(ROOT, 'b2d3s2-stubborn'));
      const t2 = await logged(async () => { await again.api.probeSockets(); return again.api.restoreSessions(); });
      ok(t2.lines.some((l) => l.includes(`✗ Dead socket: ${c1.p.older.sock}`)) && termsTo(m2.pid) === 1, 'THE HUB ENDED BETWEEN (a second start over the same folder, the master gone): the dead-socket road takes it; nothing is signalled twice', t2.lines.filter((l) => /Dead|Duplicate/.test(l)));
      mode(c1.p.older.sock, 'alive');
      const m3 = master(); mode('pgrep-cw-153-' + (1760480000000 + 153 * 1000), 'hang');
      const r3 = await boot(OLDRET, 'b2d3s2-red-early', (X) => pairOf(X, 153, deadChild(), liveChild()));
      await until(() => !fs.existsSync(r3.p.older.sockPath), 3000);   // the retire rides the re-probe's road at once since the births follow (its pair adopted first)
      ok(!fs.existsSync(r3.p.older.sockPath), 'RED: the release removes the socket before its pgrep answers (one that never answers here)', r3.lines.filter((l) => /Duplicate/.test(l)));
      // (e) A LIVING OLDER PROGRAM IS NEVER ENDED BECAUSE OF A PAIR: both alive ⇒ both kept, said as a pair by their names, nothing signalled.
      // RED: the release's decision (the newer always wins) ends the older
      const s0 = signals.length;
      const e1 = await boot(BR, 'b2d3s2-both-alive', (X) => pairOf(X, 161, liveChild(), liveChild()));
      ok(signals.length === s0 && e1.X.activeSessions.has(e1.p.older.id) && e1.X.activeSessions.has(e1.p.newer.id) && fs.existsSync(e1.p.older.sockPath) && !e1.lines.some((l) => l.includes('Duplicate of'))
        && e1.X.notes.filter((l) => l === PAIR_WORDS).length === 1
        && !e1.X.api.probePending().has(e1.p.older.sock),
        'BOTH ALIVE ⇒ BOTH KEPT: two cards of one conversation, said ONCE in Diagnostics by their names (never a path), nothing signalled, nothing left to ask', e1.X.notes);
      const se = await sessionOf(), m4 = se.m;
      const e2 = await boot(OLDDEC, 'b2d3s2-red-newer', (X) => { const p = pairOf(X, 163, liveChild(), liveChild()); programAs(p.older, se.rec); return p; });
      await until(() => !fs.existsSync(e2.p.older.sockPath), 6000);
      ok(!e2.X.activeSessions.has(e2.p.older.id) && termsTo(m4.pid) === 1, 'RED: the release\'s decision — the newer always wins: the LIVING older one retired, its master SIGTERMed', e2.lines.filter((l) => /Duplicate/.test(l)));
      // (f) BOTH DEAD ⇒ THE NEWER KEPT (the release's rule)
      const sf = await sessionOf();
      const f1 = await boot(BR, 'b2d3s2-both-dead', (X) => { const p = pairOf(X, 171, deadChild(), deadChild()); programAs(p.older, sf.rec); return p; });
      await until(() => !fs.existsSync(f1.p.older.sockPath), 6000);
      ok(!fs.existsSync(f1.p.older.sockPath) && fs.existsSync(f1.p.newer.sockPath) && f1.X.activeSessions.has(f1.p.newer.id), 'BOTH PROVEN DEAD ⇒ the newer kept, the older retired (the release\'s rule)', f1.lines.filter((l) => /Duplicate/.test(l)));
      // (g) A WRAPPER THAT KEEPS NO BIRTH (a terminal's pty-wrapper): its child's number still there = NOT PROVEN — the pair is kept and
      // asked again at the cadence (never signalled); its number gone = proven ended — retired
      const gone = require('child_process').spawnSync('true').pid, here = liveChild();
      const g1 = await boot(BR, 'b2d3s2-no-birth', (X) => pairOf(X, 181, { childPid: here.childPid }, liveChild()));
      ok(g1.X.api.probePending().get(g1.p.older.sock)?.includes('dedup') && fs.existsSync(g1.p.older.sockPath) && termsTo(here.childPid) === 0,
        'A NUMBER WITH NO BIRTH, STILL THERE: not proven ⇒ the pair kept, asked again at the cadence, its program never signalled', [...g1.X.api.probePending()]);
      for (const x of [g1.p.older, g1.p.newer]) mode('pgrep-' + x.sock, 'dead');
      const m6 = master();
      const g2 = await boot(BR, 'b2d3s2-no-birth-gone', (X) => pairOf(X, 183, { childPid: gone }, liveChild()));
      await until(() => leftSaid(g2.p.older.sock, g2.lines) > 0, 6000);
      const g2w = [...g2.lines, ...warned].filter((l) => l.includes(`] ${g2.p.older.sock}: not retired — `));
      ok(g2w.length === 1 && /its socket is also held by pid \d+ \(sleep\), which this hub cannot prove it started/.test(g2w[0]) && termsTo(m6.pid) === 0 && alive(m6.pid) && fs.existsSync(g2.p.older.sockPath) && g2.X.activeSessions.has(g2.p.newer.id),
        'A NUMBER WITH NO BIRTH, GONE: its program proven ended — but a record with no wrapper birth proves no master (主开发 r5523): its socket\'s holder LEFT, never signalled, said once by its number and name; the pair waits', g2w);
      // (h) THE RE-PROBE with a pair proven alive at a later pass: decided, said once, never asked again
      const h1 = await boot(BR, 'b2d3s2-later', (X) => pairOf(X, 191, { childPid: liveChild().childPid }, liveChild()));
      const hl = h1.X.notes.length;
      programAs(h1.p.older, liveChild());
      const ht = await logged(async () => h1.X.api.reprobePending());
      ok(!h1.X.api.probePending().has(h1.p.older.sock) && h1.X.notes.slice(0, hl).filter((l) => l === PAIR_WORDS).length === 1 && !h1.X.notes.slice(hl).includes(PAIR_WORDS) && ht.r.alive.length === 2,
        'THE RE-PROBE: a pair proven alive at a later pass is decided — nothing left to ask, no loop; its sentence said ONCE (at the start, while unproven), never again', h1.X.notes);
    } finally { console.warn = warnD; console.log(`  (③d: ${Date.now() - t3d} ms)`); for (const f of ['alive-pid']) { try { fs.writeFileSync(path.join(ROOT, f), String(victim.pid)); } catch { } } }
  }
} catch (e) { fail++; console.error('  ✗ threw: ' + (e && e.stack || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
