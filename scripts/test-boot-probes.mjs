#!/usr/bin/env node
// A PROBE THAT CANNOT BE REAPED IS AN ANSWER, NEVER A WAIT (fast, in-process — B-92a4, lane boot-probes-unkillable,
// 2026-10-14). Production's hub printed `[safe-fs] worker pool up` and then nothing for 96 s, no listener: the boot
// restore's `fuser` (data/sockets on NFS) sat in D state; runChild only TERMed it at its timer and resolved only in
// execFile's callback, which a child that cannot die never fires — and server.js listens after probeSockets().
//   ① runChild ANSWERS at its own timer: a TERM-ignoring child ⇒ TIMEOUT within timeout + 1.5 s, KILLed within 2 s more;
//     what it wrote before the timer is the answer's out; an answer given during a held loop stays the child's own; one
//     console line per (bin, socket basename). CONTROL: the old runChild (a scratch copy) is still pending at 5 s (RED).
//   ② probeSockets has a CAP: a fake `fuser` + `pgrep` that never die ⇒ it settles at the cap, `unanswered` names every
//     socket and its open question, probeFacts says `N unanswered (fuser cw-…)`. CONTROL: no cap ⇒ pending at cap + 5 s (RED).
//   ③ restoreSessions never asks itself: over a scratch data dir the unanswered sockets are adopted probe-pending (alive),
//     nothing is retired or killed — an undecided duplicate set included; the deferred re-probe (the fakes now answering)
//     settles alive (the mark clears) / dead (the shared dead-socket retire) / the duplicate's loser (the shared duplicate
//     retire, its SIGTERM by the pgrep answer) / still unanswered; after the fifth try it stays alive, said — never a kill.
//   ③c THE RE-PROBE RIDES THE HUB'S STARTER (B-323e's remainder, lane nl-starts): its fuser / pgrep are asked of the starter and
//     NONE starts from this process (counted at ChildProcess.prototype.spawn), with the same tally and Diagnostics line as the
//     release's road. RED: a copy whose re-probe runner is the release's (runChild) starts all three from this process.
//   ④ THE CENSUS: src/server/boot-restore.js holds no sync child (execFileSync / spawnSync / execSync) — a planted one is RED.
// The fakes: `fuser` / `pgrep` read a mode file per (tool,) socket basename (hang = TERM ignored, never answers — the
// D-state stand-in; alive; dead) and `cut` (the fd scan's last stage) hangs on demand. The legs that wait run side by
// side (the two controls, three probe passes): ~7 s. Run: node scripts/test-boot-probes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
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
const settledBy = (p, ms) => Promise.race([p.then((v) => ({ v })), sleep(ms).then(() => null)]);
const until = async (fn, ms) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await sleep(25); return fn(); };

const kids = [];
let PIDS = null; // every hanging fake appends its pid: the exit sweep ends what a bound has not — registered BEFORE scratch(), whose own exit hook removes the root (and this file) first otherwise
process.on('exit', () => {
  let pids = []; try { pids = fs.readFileSync(PIDS, 'utf8').split('\n').map((l) => Number(l.split(' ')[0])).filter((n) => n > 1); } catch { }
  const isOurs = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').startsWith('sleep\u0000'); } catch { return false; } }; // still the fake's sleep (a recorded pid is never trusted blind)
  for (const pid of [...pids, ...kids.map((k) => k.pid)]) if (isOurs(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } }
});
const ROOT = scratch('boot-probes');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(path.join(ROOT, 'bin'), { recursive: true });
PIDS = path.join(ROOT, 'pids');
const realBin = (b) => process.env.PATH.split(':').map((d) => path.join(d, b)).find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } });
const CUT = realBin('cut');
const HANG = (what) => `echo "$$ ${what}" >> "$d/pids"; trap '' TERM; exec sleep 60`; // <pid> <socket basename or cut>
fs.writeFileSync(path.join(ROOT, 'bin', 'fuser'), `#!/bin/sh\nd=${JSON.stringify(ROOT)}\nfor a; do last=$a; done\nm=$(cat "$d/mode-$(basename "$0")-$(basename "$last")" 2>/dev/null || cat "$d/mode-$(basename "$last")" 2>/dev/null || cat "$d/mode" 2>/dev/null || echo hang)\ncase "$m" in\n  alive) cat "$d/alive-pid"; exit 0;;\n  dead) exit 1;;\nesac\n${HANG('$(basename "$last")')}\n`, { mode: 0o755 });
fs.copyFileSync(path.join(ROOT, 'bin', 'fuser'), path.join(ROOT, 'bin', 'pgrep')); fs.chmodSync(path.join(ROOT, 'bin', 'pgrep'), 0o755);
fs.writeFileSync(path.join(ROOT, 'bin', 'cut'), `#!/bin/sh\nd=${JSON.stringify(ROOT)}\nif [ "$(cat "$d/mode-cut" 2>/dev/null)" = hang ]; then ${HANG('cut')}; fi\nexec ${CUT} "$@"\n`, { mode: 0o755 });
const mode = (name, m) => fs.writeFileSync(path.join(ROOT, name ? `mode-${name}` : 'mode'), m); // name = '<socket>' or '<tool>-<socket>' or 'cut'
mode(null, 'hang'); mode('cut', 'real');
process.env.PATH = path.join(ROOT, 'bin') + ':' + process.env.PATH;
process.env.VIBESPACE_PROBE_CAP_MS = '1500';
const CAP = 1500;
const victim = spawn('sleep', ['60'], { stdio: 'ignore' }); kids.push(victim); // the "dtach husk" a duplicate's retire SIGTERMs (the fake pgrep names it)
fs.writeFileSync(path.join(ROOT, 'alive-pid'), String(victim.pid));

const TLS = require(path.join(REPO, 'src/server/tls.js'));
const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
const M = mutantCopies('boot-probes', REPO);
// the pre-fix runChild (2.369.274), verbatim: the timer only TERMs, the promise settles only in execFile's callback
const OLD_RUN_CHILD = `function runChild(bin, args, timeout) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let timer = null, timedOut = false;
    const child = execFile(bin, args, { maxBuffer: 4 * 1024 * 1024 }, (e, out, err) => {
      clearTimeout(timer);
      resolve({ code: e ? (e.code === 'ENOENT' ? 'ENOENT' : timedOut && e.signal ? 'TIMEOUT' : e.code || e.signal || 1) : 0, out: String(out || ''), err: String(err || (e && e.message) || ''), ms: Date.now() - t0 });
    });
    timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch { } }, timeout);
  });
}
`;
const tlsSrc = fs.readFileSync(path.join(REPO, 'src/server/tls.js'), 'utf8');
const rcAt = tlsSrc.indexOf('function runChild('), rcEnd = tlsSrc.indexOf('\n}\n', rcAt) + 3;
const OLD = require(M.write('src/server/tls.js', tlsSrc.slice(0, rcAt) + OLD_RUN_CHILD + tlsSrc.slice(rcEnd), 'old-runchild'));

// ── a scratch data dir: sockets, metas (session-stdout's file shape), buffers + sidecars ──
const dataDir = (tag) => { const d = path.join(ROOT, tag); for (const s of ['sockets', 'meta', 'buffers']) fs.mkdirSync(path.join(d, s), { recursive: true }); return d; };
function instance(BRm, d, { onAttach = null } = {}) {
  const SOCK = path.join(d, 'sockets'), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers');
  const metaFile = (s) => path.join(META, s + '.json');
  const activeSessions = new Map(), attached = [], notes = [], broadcasts = { n: 0 }, ended = [];
  const api = BRm.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
    activeSessions, sessionCounterRef: { value: 0 }, attachToDtach: (id, sp, s, o) => { if (onAttach) onAttach(id, s, o); attached.push(id); s.pty = null; }, setupSessionPty: () => { },
    readSessionMeta: (s) => { try { return JSON.parse(fs.readFileSync(metaFile(s), 'utf8')); } catch { return {}; } },
    writeSessionMeta: (s, m) => fs.writeFileSync(metaFile(s), JSON.stringify(m)), deleteSessionMeta: (s) => { try { fs.unlinkSync(metaFile(s)); } catch { } },
    broadcastToSession: () => { }, broadcastActiveSessions: () => { broadcasts.n++; }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { },
    getHosts: () => null, getDialBridge: () => null, getExitProxy: () => ({ onSessionEnd: (s, id) => ended.push(id) }), note: (l) => notes.push(l) });
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
const logged = async (fn) => { const lines = [], log = console.log, warn = console.warn; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { return { r: await fn(), lines }; } finally { console.log = log; console.warn = warn; } };
const signals = []; const realKill = process.kill.bind(process);
process.kill = (pid, sig) => { if (sig !== 0 && sig !== undefined) signals.push([pid, sig]); return realKill(pid, sig); };

try {
  const ignorer = (tag) => { const pf = path.join(ROOT, `pid-${tag}`); return { pf, args: ['-c', 'echo $$ > "$1"; echo partial; trap "" TERM; exec sleep 30', 'sh', pf], pid: () => Number(fs.readFileSync(pf, 'utf8')) || null }; };
  const timed = (p) => { const t0 = Date.now(); return p.then((v) => ({ v, ms: Date.now() - t0 })); };
  // ── what waits starts first and runs beside the rest: the two controls (each must still be PENDING at its mark) and three probe passes ──
  const oldK = ignorer('old'), oldP = OLD.runChild('sh', oldK.args, 600), oldT0 = Date.now();
  const brSrc = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  const RACE = /await Promise\.race\(\[Promise\.all\(\[drain\(\), drain\(\), drain\(\), drain\(\)\]\), new Promise\(\(r\) => \{ cap = setTimeout\(\(\) => \{ out\.capped = true; r\(\); \}, capMs\); \}\)\]\);/;
  const NOCAP = require(M.write('src/server/boot-restore.js', editAnchor(brSrc, RACE, 'await Promise.all([drain(), drain(), drain(), drain()]);', "src/server/boot-restore.js"), 'no-cap'));
  const B = instance(NOCAP, dataDir('nocap')); for (let i = 31; i <= 42; i++) B.add(i);
  const bP = B.api.probeSockets(), bT0 = Date.now();
  const A = instance(BR, dataDir('cap')); for (let i = 1; i <= 12; i++) A.add(i);
  const aP = timed(A.api.probeSockets());
  const R = instance(BR, dataDir('restore'));
  const live = R.add(21), dead = R.add(22), mute = R.add(23);
  const cid = '5f0c2a8e-7d41-4b9a-9e36-0c1d2b3a4f50';
  const dOld = R.add(24, { backend: 'claude', claudeSessionId: cid, name: 'claude older' }), dNew = R.add(25, { backend: 'claude', claudeSessionId: cid, name: 'claude newer' });
  const dOldRcpt = dOld.buf.replace(/\.buf$/, '.receipts');
  fs.writeFileSync(dOldRcpt, '{"type":"_stdin_ack","msg_id":"vs-cli-1"}\n');   // lane human-cli r5: a person's CLI chatted with it — its wrapper's receipts
  mode('cut', 'hang'); // the fd scan (the duplicates' liveness question) never answers either
  const rP = R.api.probeSockets();

  console.log('① runChild answers at its own timer');
  {
    const k = ignorer('new'), BOUND = 600;
    const { v: r, ms } = await timed(TLS.runChild('sh', k.args, BOUND));
    const pid = k.pid(), heldAtAnswer = alive(pid);
    ok(r.code === 'TIMEOUT' && heldAtAnswer, `a TERM-ignoring child: the answer is TIMEOUT while the child still runs — the promise did not wait for it (${ms} ms over a ${BOUND} ms bound)`, r);
    ok(ms < BOUND + TLS.KILL_AFTER_MS, `…at the bound, before runChild's own KILL step (bound + KILL_AFTER_MS ${TLS.KILL_AFTER_MS} ms)`);
    ok(r.out === 'partial\n' && r.err === 'timeout', `what it wrote before the timer is the answer's out (${JSON.stringify(r.out)}), err 'timeout'`, r);
    await until(() => !alive(pid), 2 * TLS.KILL_AFTER_MS);
    ok(pid && !alive(pid), `…and the child (pid ${pid}) is gone after the KILL step — KILLed, never waited on`);
    const p = TLS.runChild('sh', ['-c', 'echo held-answer'], 200); const holdEnd = Date.now() + 700; while (Date.now() < holdEnd);
    const h = await p;
    ok(h.code === 0 && h.out === 'held-answer\n', `an answer given during a 700 ms hold over a 200 ms bound stays the child's own (code ${h.code}) — the bound never overtakes an exited child`, h);
    const t = await logged(async () => { for (let i = 0; i < 2; i++) await TLS.runChild('sh', ['-c', 'sleep 5', 'sh', path.join(ROOT, 'sockets', 'cw-9-1760480009000')], 100); });
    const said = t.lines.filter((l) => l.startsWith('[child] sh cw-9-1760480009000: no answer in 100 ms'));
    ok(said.length === 1 && !t.lines.some((l) => l.includes(ROOT)), `one console line per (bin, socket basename), never the path: ${said[0]}`, t.lines);
  }

  console.log('② probeSockets settles at its cap; the span names what did not answer');
  const { v: aOut, ms: aMs } = await aP;
  const askedA = () => { let n = 0; try { for (const l of fs.readFileSync(PIDS, 'utf8').split('\n')) if (aOut.unanswered.has(l.split(' ')[1])) n++; } catch { } return n; };
  const askedAtCap = askedA();
  {
    // CAP - 5: a Node timer may fire up to 1 ms early against Date.now() (monotonic ms truncation vs the wall clock) — the hosted runner measured 1499 ms on a 1500 ms cap (ci/int277)
    ok(aOut.capped && aMs >= CAP - 5 && aMs < CAP + TLS.KILL_AFTER_MS, `twelve sockets whose fuser + pgrep never die: probeSockets settles at the cap (${aMs} ms, cap ${CAP})`);
    const qs = [...aOut.unanswered.values()];
    ok(aOut.unanswered.size === 12 && qs.filter((q) => q === 'fuser').length === 4 && qs.filter((q) => q === 'not asked').length === 8, `unanswered names every socket with its open question (4 fuser in flight, 8 not asked)`, [...aOut.unanswered]);
    const facts = A.api.probeFacts(aOut);
    ok(!!facts && facts.unanswered === 12 && /^12 unanswered \(fuser cw-\d+-\d+, fuser cw-\d+-\d+, fuser cw-\d+-\d+, \+9\)$/.test(facts.note), `the boot trace's restore-probes facts: ${facts && facts.note}`, facts);
    ok(RACE.test(brSrc), 'CONTROL setup: the cap\'s race is where the no-cap copy cuts it');
  }

  console.log('③ restoreSessions adopts what did not answer; the re-probe settles it');
  {
    const out = await rP;
    ok(out.unanswered.size === 5 && out.unanswered.get(dOld.sock) && !out.liveConvos && !out.fdScanError, `the probes: 5 unanswered, the fd scan no answer (${[...out.unanswered].map(([s, q]) => q + ' ' + s).join(', ')})`);
    const t = await logged(async () => R.api.restoreSessions());
    const pend = R.api.probePending();
    ok(R.activeSessions.size === 5 && R.attached.length === 5, `every unanswered socket is adopted ALIVE and attached (${R.activeSessions.size} sessions, ${R.attached.length} attaches)`);
    ok([live, dead, mute, dOld, dNew].every((x) => fs.existsSync(x.sockPath) && fs.existsSync(x.meta)) && !t.lines.some((l) => /Dead socket|Duplicate of/.test(l)) && !signals.length,
      'nothing retired, nothing killed: every socket + meta in place, no Dead / Duplicate line, no signal sent', { lines: t.lines, signals });
    ok(pend.size === 5 && pend.get(live.sock).join() === 'alive' && pend.get(dOld.sock).join() === 'alive,dedup' && pend.get(dNew.sock).join() === 'alive,dedup', 'each is probe-pending with its open questions (the duplicate pair undecided: alive + dedup)', [...pend]);
    ok(R.notes.length === 1 && /^5 session\(s\) adopted probe-pending — no answer \(fuser cw-/.test(R.notes[0]), `the note sink (the boot trace → ⚙ Diagnostics): ${R.notes[0]}`);
    // the fakes answer now: one alive, one dead, one still mute (fuser says nobody, pgrep never answers); the pair's sockets
    // alive and the fd scan real (nobody holds the conversation ⇒ the newer wins)
    mode(live.sock, 'alive'); mode(dead.sock, 'dead'); mode(`fuser-${mute.sock}`, 'dead'); mode(dOld.sock, 'alive'); mode(dNew.sock, 'alive'); mode('cut', 'real');
    const b0 = R.broadcasts.n;
    const r = await logged(async () => R.api.reprobePending());
    const tally = r.r;
    ok(tally.alive.sort().join() === [live.sock, dNew.sock].sort().join() && tally.dead.join() === dead.sock && tally.duplicate.join() === dOld.sock && tally.open.join() === mute.sock,
      `the re-probe settles each: alive ${tally.alive.join(' ')} · dead ${tally.dead.join(' ')} · duplicate ${tally.duplicate.join(' ')} · open ${tally.open.join(' ')}`, tally);
    ok(!fs.existsSync(dead.sockPath) && !fs.existsSync(dead.meta) && !R.activeSessions.has(dead.id) && r.lines.some((l) => l.includes(`✗ Dead socket: ${dead.sock}`)) && R.broadcasts.n > b0,
      'dead ⇒ the boot\'s own dead-socket retire (socket + meta gone, the Dead line) and the adopted session goes (the list re-broadcast)');
    await until(() => !alive(victim.pid), 2 * TLS.KILL_AFTER_MS);
    ok(!fs.existsSync(dOld.sockPath) && !fs.existsSync(dOld.meta) && !fs.existsSync(dOld.buf) && !R.activeSessions.has(dOld.id) && r.lines.some((l) => l.includes(`⤫ Duplicate of ${cid} — retiring stale ${dOld.sock}`))
      && signals.some(([pid, sig]) => pid === victim.pid && sig === 'SIGTERM') && !alive(victim.pid),
      'the older duplicate ⇒ the boot\'s own duplicate retire: SIGTERM to the pid its pgrep answer named (the husk is gone), socket + buffer + meta gone', { signals });
    ok(!fs.existsSync(dOldRcpt), '…and its <id>.receipts with them (lane human-cli r5: THE ONE LIST of a wrapper\'s files — round 4 left this end path\'s to the 7-day sweep)');
    ok(R.activeSessions.has(live.id) && R.activeSessions.has(dNew.id) && R.activeSessions.has(mute.id) && [live, dNew, mute].every((x) => fs.existsSync(x.sockPath)), 'the alive, the winner and the still-mute session stay adopted, their sockets in place');
    ok(R.ended.slice().sort().join() === [dead.id, dOld.id].sort().join(), `each un-adopted session ends through the exit proxy's onSessionEnd, as any ended one (${R.ended.join(', ')})`, R.ended);
    ok([...R.api.probePending()].map(([s, q]) => s + ':' + q.join()).join() === `${mute.sock}:alive`, 'only the still-mute socket keeps its mark');
    ok(/^re-probe 1\/5: 2 alive, 1 dead \(retired\), 1 duplicate \(retired\), 1 still unanswered$/.test(R.notes[1] || ''), `its line: ${R.notes[1]}`);
  }

  console.log('② (cont.) past the cap nothing more is asked; CONTROL no cap');
  {
    const n = askedA();
    ok(n === askedAtCap && n === 4, `${n - askedAtCap} probe child(ren) for those twelve sockets after the cap — only the 4 fusers in flight at it ever ran (their chains stop at the next question)`);
    const r = await settledBy(bP, Math.max(0, CAP + 5000 - (Date.now() - bT0)));
    ok(r === null, `CONTROL no cap (the race cut from a copy): the same twelve sockets are still PENDING at cap + 5 s — the listener would wait (RED)`, r && { unanswered: r.v.unanswered.size });
  }

  console.log('① CONTROL the old runChild');
  {
    const r = await settledBy(oldP, Math.max(0, 5000 - (Date.now() - oldT0)));
    const pid = oldK.pid();
    ok(r === null && pid && alive(pid), `CONTROL the old runChild (a scratch copy): the same TERM-ignoring child is still PENDING at 5 s, the child alive (RED)`, r);
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { } }
  }

  console.log('③b five tries without an answer (here: no fuser, no pgrep on PATH — a missing tool is no answer either): kept alive, said, never a kill');
  {
    const PATH0 = process.env.PATH; process.env.PATH = path.join(ROOT, 'empty'); fs.mkdirSync(process.env.PATH);
    const G = instance(BR, dataDir('giveup')); const g1 = G.add(90);
    let tallies = [];
    try { const p = await G.api.probeSockets(); ok(p.unanswered.get(g1.sock) === 'pgrep' && !p.capped, `the probe: fuser + pgrep ENOENT ⇒ unanswered (${p.unanswered.get(g1.sock)}), not dead`); await logged(async () => G.api.restoreSessions()); for (let i = 0; i < 5; i++) tallies.push(await G.api.reprobePending()); }
    finally { process.env.PATH = PATH0; }
    ok(tallies.length === 5 && tallies.every((t) => t.open.join() === g1.sock) && G.activeSessions.has(g1.id) && fs.existsSync(g1.sockPath) && fs.existsSync(g1.meta), `five passes, ${g1.sock} never answered: still adopted, socket + meta in place`, tallies);
    ok(G.notes.filter((l) => /^re-probe \d\/5: 0 alive, 0 dead \(retired\), 0 duplicate \(retired\), 1 still unanswered$/.test(l)).length === 5
      && G.notes.filter((l) => l === `re-probe gave up after 5 tries: ${g1.sock} kept alive — a non-answer is never a kill`).length === 1, `the Diagnostics lines: five passes, then once: ${G.notes.at(-1)}`, G.notes);
  }

  console.log('③c B-323e\'s remainder (lane nl-starts): THE RE-PROBE RIDES THE HUB\'S STARTER — its questions start nothing from this process, the same tally; RED the release\'s runner');
  {
    const CPm = require('child_process'), realCpSpawn = CPm.ChildProcess.prototype.spawn, direct = [];
    CPm.ChildProcess.prototype.spawn = function (o) { direct.push(path.basename(String((o && o.file) || ''))); return realCpSpawn.call(this, o); };   // every async start of this process (spawn / execFile) passes here
    const STARTER = require(path.join(REPO, 'src/server/child-starter.js')).childStarter();
    const STARTER_LINE = "const starterP = (bin, args, ms) => require('./tls.js').runViaStarter(bin, args, ms, { envAdd: { PATH: process.env.PATH || '' }, maxBuffer: 4 * 1024 * 1024 });";
    const OLDROAD = require(M.write('src/server/boot-restore.js', editAnchor(brSrc, STARTER_LINE, 'const starterP = runChildP;', 'src/server/boot-restore.js'), 'reprobe-old-road'));
    const onePass = async (BRm, tag, n) => {
      const PATH0 = process.env.PATH, empty = path.join(ROOT, 'empty-' + tag); fs.mkdirSync(empty);
      const X = instance(BRm, dataDir(tag)); const up = X.add(n), gone = X.add(n + 1);
      process.env.PATH = empty;   // the boot's own questions find no tool: both sockets adopted probe-pending (as ③b)
      try { await X.api.probeSockets(); await logged(async () => X.api.restoreSessions()); } finally { process.env.PATH = PATH0; }
      mode(up.sock, 'alive'); mode(gone.sock, 'dead');
      const d0 = direct.length, q0 = STARTER.stats().requests;
      const r = await logged(async () => X.api.reprobePending());
      return { tally: r.r, line: String(X.notes.filter((l) => String(l).startsWith('re-probe ')).at(-1) || ''), direct: direct.slice(d0).filter((b) => b === 'fuser' || b === 'pgrep' || b === 'sh').sort(), asked: STARTER.stats().requests - q0, up, gone };
    };
    try {
      const mine = await onePass(BR, 'via-starter', 81), old = await onePass(OLDROAD, 'old-road', 91);
      ok(mine.direct.length === 0 && mine.asked === 3, `the re-probe's three questions (fuser ×2, pgrep ×1) are asked of the starter (${mine.asked}) — NONE starts from the hub's process (${mine.direct.join(' ') || 'none'})`, mine.direct);
      ok(mine.tally.alive.join() === mine.up.sock && mine.tally.dead.join() === mine.gone.sock && !mine.tally.open.length && fs.existsSync(mine.up.sockPath) && !fs.existsSync(mine.gone.sockPath),
        `…with the release's answers: alive ${mine.tally.alive.join(' ')} · dead ${mine.tally.dead.join(' ')} (its socket retired)`, mine.tally);
      ok(old.direct.join() === 'fuser,fuser,pgrep' && old.asked === 0 && old.tally.alive.join() === old.up.sock && old.tally.dead.join() === old.gone.sock,
        `RED: a copy with the release's runner — the same tally, its three questions started from the hub's process (${old.direct.join(' ')})`, { direct: old.direct, asked: old.asked });
      ok(mine.line !== '' && mine.line === old.line, `the Diagnostics line is the same on both roads: ${mine.line}`, { mine: mine.line, old: old.line });
    } finally { CPm.ChildProcess.prototype.spawn = realCpSpawn; }
  }

  console.log('④ the census: no sync child in the boot restore');
  {
    const SYNC = /\b(?:execFileSync|spawnSync|execSync)\b/g;
    const sites = (src) => [...src.matchAll(SYNC)].length;
    ok(sites(brSrc) === 0, `src/server/boot-restore.js: ${sites(brSrc)} execFileSync / spawnSync / execSync site(s) — none allowed`);
    for (const plant of ["require('child_process').execFileSync('fuser', [socketPath], { timeout: 2000 });", "require('child_process').spawnSync('pgrep', ['-f', socketPath]);", "require('child_process').execSync('true');"])
      ok(sites(brSrc.replace('function restoreSessions() {\n', `function restoreSessions() {\n  try { ${plant} } catch { }\n`)) === 1, `CONTROL: a planted ${plant.split('(')[1].split('.')[1] || plant.slice(0, 30)} in restoreSessions is RED`);
  }

  console.log('⑤ B-cd4b: the survivors\' attaches in bounded batches (every survivor in the live set at once; one used before its batch is attached at once)');
  {
    // 20 survivors no probe answered (adopted ALIVE, as ③): restoreSessions returns with all 20 in the live set and NONE attached
    // (the round's follow: a restore bigger than one batch attaches from the next loop turn on — the registration's turn holds no
    // attach); they attach a batch a turn (src/server/loop-turns.js — the listen step's turns in the same queue: a step asked
    // right after the restore returns, as server.js asks the rest of its listen step, runs AFTER the first batch and BEFORE the
    // second: a batch never shares a turn with it), each waiting one carrying its attach-at-first-use
    // (`_attachPending` — every door that writes to its pty asks it first): one USED before its batch is attached at once and
    // never again; one whose attach throws stays pending (said) and its next use attaches it; one that ended while it waited is
    // never attached; every attach takes the local road (`restore: true`); the restore's timing said once. THE DOOR (the real
    // sender, src/server/user-input.js send): a chat message to a survivor whose attach still waits is written after its attach,
    // never refused. RED: the bound taken away (one batch of all) ⇒ every attach in the listen turn; the attach-at-first-use taken
    // away ⇒ the used one waits for its batch; the door's ask taken away ⇒ «not a live chat session», nothing written; the first
    // batch put back in the registration's turn ⇒ 8 attached at its return; the batches chained by setImmediate ⇒ the second
    // batch runs before the step asked after the first (the two share a turn)
    const BATCH = 'const ATTACH_BATCH = 8,';
    const LT = require(path.join(REPO, 'src/server/loop-turns.js'));   // the ONE queue (a copy of the restore requires the same file)
    const run = async (BRm, tag) => {
      const opts = [], byId = new Map(), threw = new Set(), order = []; let throwId = null;
      const X = instance(BRm, dataDir(tag), { onAttach: (id, s, o) => { order.push(id); opts.push(o || null); if (id === throwId && !threw.has(id)) { threw.add(id); throw new Error('spawn EAGAIN (planted)'); } byId.set(id, o || null); } });
      const socks = Array.from({ length: 20 }, (_, i) => X.add(300 + i));
      throwId = socks[15].id;
      const t = await logged(async () => X.api.restoreSessions());
      const pending = () => [...X.activeSessions.values()].filter((v) => typeof v._attachPending === 'function').length;
      const atReturn = { live: X.activeSessions.size, attached: X.attached.length, pending: pending() };
      // THE ROUND'S MUST (wzvgb5033): two survivors WRITE after the restore read their buffers — one waits for a later batch, one is
      // used first; each attach must hand what was written meanwhile (whole records: the read's partial last line «$ » with it)
      const GROWN = 'line written after the read\n{"type":"result","subtype":"success"}\n';
      fs.appendFileSync(socks[18].buf, GROWN); fs.appendFileSync(socks[12].buf, GROWN);
      const usedId = socks[12].id, used = X.activeSessions.get(usedId);
      const usedPend = !!used && typeof used._attachPending === 'function';
      if (usedPend) used._attachPending();   // a door's ask, before the survivor's batch
      const usedAtOnce = X.attached.includes(usedId);
      const gone = socks.find((x) => !X.attached.includes(x.id) && x.id !== throwId); if (gone) X.activeSessions.delete(gone.id);   // ends before its turn
      LT.turn(() => order.push('step'));   // the rest of the listen step, asked right after the restore returned (server.js hub.turn)
      const lines = [];
      const log0 = console.log, warn0 = console.warn; console.log = console.warn = (...a) => lines.push(a.join(' '));
      const RESTORED = /^\[boot-restore\] 20 survivor\(s\): registered in /;
      try { const tEnd = Date.now() + 5000; while (!(lines.concat(t.lines).some((l) => RESTORED.test(l)) && order.includes('step')) && Date.now() < tEnd) await new Promise((r) => setTimeout(r, 5)); }   // the restore's own last line (its batches are done) and the step's turn
      finally { console.log = log0; console.warn = warn0; }
      const si = order.indexOf('step'), early = socks.slice(0, 8).map((x) => x.id), late = socks.slice(8).map((x) => x.id);
      const stepBetween = si > 0 && order.slice(0, si).some((x) => early.includes(x)) && order.slice(0, si).every((x) => early.includes(x) || x === usedId) && order.slice(si + 1).length > 0 && order.slice(si + 1).every((x) => late.includes(x));
      const after = X.attached.length, thrown = X.activeSessions.get(throwId);
      const stillPending = !!thrown && typeof thrown._attachPending === 'function' && !X.attached.includes(throwId);
      if (stillPending) thrown._attachPending();   // its next use
      return { atReturn, usedPend, usedAtOnce, usedOnce: X.attached.filter((x) => x === usedId).length, after, goneAttached: gone ? X.attached.includes(gone.id) : null, stepBetween, stepAt: si, order: order.map((x) => (x === 'step' ? x : socks.findIndex((y) => y.id === x))),
        stillPending, thrownAttached: X.attached.includes(throwId), allLocal: opts.length > 0 && opts.every((o) => !!o && o.restore === true),
        cuBatched: (byId.get(socks[18].id) || {}).catchUp || null, cuUsed: (byId.get(usedId) || {}).catchUp || null, cuOther: (byId.get(socks[17].id) || {}).catchUp || null, GROWN,
        warned: lines.find((l) => /the attach failed \(spawn EAGAIN \(planted\)\) — it stays pending: its next use attaches it, or a retry in 2 s/.test(l)) || null,
        said: lines.concat(t.lines).find((l) => /^\[boot-restore\] 20 survivor\(s\): registered in \d+ ms; attached in \d+ batch\(es\) of ≤ 8 \(\d+ ms, the longest batch \d+ ms\); 1 attached at their first use; 2 caught up what they wrote since the read$/.test(l)) || null };
    };
    const g = await run(BR, 'batches');
    const r1 = await run(require(M.write('src/server/boot-restore.js', anchored(brSrc, BATCH, 'const ATTACH_BATCH = Infinity,', 'b-cd4b-one-pass'), 'cd4b-one-pass')), 'batches-red');
    const r2 = await run(require(M.write('src/server/boot-restore.js', anchored(brSrc, ' entry[2]._attachPending = entry.pend; }', ' }', 'b-cd4b-no-first-use'), 'cd4b-no-first-use')), 'batches-red2');
    const r3 = await run(require(M.write('src/server/boot-restore.js', anchored(brSrc, 'catchUp: cu && cu.text ? cu : null', 'catchUp: null', 'b-cd4b-no-catchup'), 'cd4b-no-catchup')), 'batches-red3');
    const r4 = await run(require(M.write('src/server/boot-restore.js', anchored(brSrc, '  if (total <= ATTACH_BATCH) one(); else loopTurn(one);', '  one();', 'b-cd4b-first-in-turn'), 'cd4b-first-in-turn')), 'batches-red4');
    const r5 = await run(require(M.write('src/server/boot-restore.js', anchored(brSrc, '    if (queue.length) { loopTurn(one); return; }', '    if (queue.length) { setImmediate(one); return; }', 'b-cd4b-immediate-chain'), 'cd4b-immediate-chain')), 'batches-red5');   // stale-pins: kept (the red plants the old chain)
    const cuOk = (c, G) => !!c && c.text === '$ ' + G && c.drop === '$ ';
    ok(cuOk(g.cuBatched, g.GROWN) && cuOk(g.cuUsed, g.GROWN) && g.cuOther === null,
      `THE ROUND'S MUST: a survivor that WROTE after the restore's read hands it to its attach, in the attach's turn — waiting for a later batch (${JSON.stringify(g.cuBatched)}) and used first; its read's partial last line moves with it (whole records); one that wrote nothing hands nothing`, { batched: g.cuBatched, used: g.cuUsed, other: g.cuOther });
    ok(r3.cuBatched === null && r3.cuUsed === null, 'RED: the catch-up dropped ⇒ the two attaches hand nothing — what was written in the window never reaches the conversation');
    ok(g.atReturn.live === 20 && g.atReturn.attached === 0 && g.atReturn.pending === 20 && g.usedPend && g.usedAtOnce && g.usedOnce === 1 && g.after === 18 && g.goneAttached === false
      && g.stillPending && g.thrownAttached && g.allLocal && !!g.warned && !!g.said && g.stepBetween,
      `20 survivors: all 20 in the live set when restoreSessions returns, ${g.atReturn.attached} attached in that turn (the registration's turn holds no attach), ${g.atReturn.pending} waiting with their attach-at-first-use; the step asked after the restore ran between the first and the second batch (the order: ${JSON.stringify(g.order)}); one USED before its batch attached at once (and once: ${g.usedOnce}); then the batches, the one that ended never, the one whose attach threw said and kept pending — its next use attached it; every attach on the local road; said: ${g.said}`, g);
    ok(r4.atReturn.attached === 8 && r5.stepBetween === false && r5.stepAt > 8,
      `RED: the first batch back in the registration's turn ⇒ ${r4.atReturn.attached} attached at its return; the batches chained by setImmediate ⇒ the second batch runs before the step asked after the first (the step at ${r5.stepAt}: ${JSON.stringify(r5.order)})`, { r4: r4.atReturn, r5: r5.order });
    ok(r1.atReturn.attached >= 19 && r2.usedPend === false && r2.usedAtOnce === false,
      `RED: one batch of all ⇒ every attach in the listen turn (${r1.atReturn.attached}); the attach-at-first-use taken away ⇒ a survivor used before its batch is not attached (${r2.usedAtOnce})`, { r1: r1.atReturn, r2: { usedPend: r2.usedPend, usedAtOnce: r2.usedAtOnce } });
    // ONE CARD, ONE CHAIN (round wed0m8jzl): a survivor whose attach ALWAYS throws — its retries shortened in a copy (20, 40,
    // 60 ms) — used twice while its first retry is armed, then once after the chain is spent: 1 batch + 2 uses + 3 retries + 1
    // use = 7 tries, ONE card, and each use while the retry is armed SAYS it arms none (the retries are counted once, so a second
    // chain shows as these words gone, not as more tries). RED: the chain's guard taken away ⇒ the two uses arm their own
    // retries (the words gone); the card's guard taken away ⇒ a second card at the use after the chain is spent
    const N5 = require(path.join(REPO, 'src/normalizers'));
    const chain = async (BRm, tag) => {
      const cards = []; const feed0 = N5.feedPeerCard; N5.feedPeerCard = (s, c) => { cards.push(c && c.text); return true; };
      try {
        let tries = 0; let bad = null;
        const X = instance(BRm, dataDir(tag), { onAttach: (id) => { if (id === bad) { tries++; throw new Error('spawn EAGAIN (planted, always)'); } } });
        const socks = Array.from({ length: 3 }, (_, i) => X.add(400 + i)); bad = socks[1].id;
        await logged(async () => X.api.restoreSessions());
        const s1 = X.activeSessions.get(bad);
        const u2 = await logged(async () => { s1._attachPending(); s1._attachPending(); });   // two uses while the first retry is armed
        const armedSaid = (u2.lines || []).filter((l) => /its retry is armed already/.test(l));
        await logged(() => new Promise((r) => setTimeout(r, 400)));                  // the shortened chain runs out
        await logged(async () => { s1._attachPending(); });                          // a use after the chain is spent
        await logged(() => new Promise((r) => setTimeout(r, 150)));
        return { tries, cards: cards.length, pending: typeof s1._attachPending === 'function', failed: s1._attachFailed || null, armedSaid: armedSaid.length, uses: (u2.lines || []).slice(0, 2) };
      } finally { N5.feedPeerCard = feed0; }
    };
    const SHORT = (src) => anchored(src, 'ATTACH_RETRY_MS = [2000, 10000, 30000]', 'ATTACH_RETRY_MS = [20, 40, 60]', 'b-cd4b-short');
    const cg = await chain(require(M.write('src/server/boot-restore.js', SHORT(brSrc), 'cd4b-short')), 'chain');
    const noChain = anchored(SHORT(brSrc), "      if (entry.timer) { console.warn(", "      if (false) { console.warn(", 'b-cd4b-no-chain-guard');
    const cr1 = await chain(require(M.write('src/server/boot-restore.js', noChain, 'cd4b-no-chain-guard')), 'chain-red1');
    const cr2 = await chain(require(M.write('src/server/boot-restore.js', anchored(SHORT(brSrc), '      if (entry.carded) return;\n', '', 'b-cd4b-no-card-guard'), 'cd4b-no-card-guard')), 'chain-red2');
    ok(cg.tries === 7 && cg.cards === 1 && cg.armedSaid === 2 && cg.pending && /spawn EAGAIN/.test(cg.failed || ''),
      `ONE CARD, ONE CHAIN: an attach that always throws — 1 batch + 2 uses while its retry is armed + 3 retries + 1 use after = ${cg.tries} tries, ${cg.cards} card; each use said it armed none (${JSON.stringify(cg.uses)}); it stays pending, its failure named`, cg);
    ok(cr1.armedSaid === 0 && cr2.cards > 1, `RED: the chain's guard away ⇒ each failed use arms its own retry (none says it armed none: ${JSON.stringify(cr1.uses)}); the card's guard away ⇒ a card again (${cr2.cards} cards)`, { cr1, cr2 });
    // THE DOOR: the real sender, a chat survivor whose attach still waits
    const UI_HOOK = "    if (!session.pty && typeof session._attachPending === 'function') session._attachPending();";
    const uiSrc = fs.readFileSync(path.join(REPO, 'src/server/user-input.js'), 'utf8');
    const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
    const ad = new ClaudeCodeAdapter({ buffersDir: ROOT });
    const door = (UI) => {
      const written = [];
      const s = { mode: 'chat', backend: 'claude', buffer: '', pty: null };
      s._attachPending = () => { s._attachPending = null; s.pty = {}; };   // as the restore's: the pty is there once it returns
      const send = UI.createUserInputSender({ activeSessions: new Map([['w-pend', s]]), adapterRegistry: { get: () => ad }, BUFFERS_DIR: ROOT, broadcastToSession() { }, feedLive() { }, autoResume: null, reattachLocalPty() { }, ptyQuietSince: () => false, writeSessionInput: (x, l) => written.push(l), log() { } }).send;
      const r = send('w-pend', 'typed before its batch', { msgId: 'm-pend', origin: 'ws' });
      return { r, written, attached: !!s.pty };
    };
    const dg = door(require(path.join(REPO, 'src/server/user-input.js')));
    const dr = door(require(M.write('src/server/user-input.js', anchored(uiSrc, UI_HOOK, '    // (the ask taken away)', 'b-cd4b-door'), 'cd4b-door')));
    ok(dg.attached && dg.written.length === 1 && /typed before its batch/.test(dg.written[0]) && !(dg.r && dg.r.code === 'not_chat'),
      `the door (the real send): a chat message to a survivor whose attach still waits attaches it and is written (${dg.written.length} line), never refused`, dg);
    ok(!dr.attached && dr.written.length === 0 && !!dr.r && dr.r.code === 'not_chat', `RED the door's ask taken away: «${dr.r && dr.r.error}», nothing written — the message lost`, dr);
    ok(/async function handleMessage\(data\) \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(data && typeof data\.sessionId === 'string' && activeSessions\) \{ const s = activeSessions\.get\(data\.sessionId\); if \(s && !s\.pty && typeof s\._attachPending === 'function'\) s\._attachPending\(\); \}\n\s*switch \(data\.type\) \{/.test(fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8')),
      'the page\'s socket (src/ws-handler.js): every message naming a session asks its attach-at-first-use BEFORE the switch (its input, an interrupt, a resize, an attach) — pinned by text: the handler is not loaded here');
  }
  console.log('⑥ B-cd4b (round wzvgb5033): what a survivor wrote between the restore\'s read and its attach reaches the conversation');
  {
    // restoreCatchUp over real files: nothing new; appended (the plain case); the ring REWRITTEN (trimmed, a new file); another file
    const d6 = dataDir('catchup'), f6 = path.join(d6, 'buffers', 'cu.buf');
    const lines6 = Array.from({ length: 30 }, (_, i) => `{"type":"x","n":${i},"pad":"${'p'.repeat(24)}"}`);
    const partial6 = '{"type":"res', more6 = 'ult","subtype":"success"}\n{"type":"system","subtype":"session_state_changed","state":"idle"}\n';
    fs.writeFileSync(f6, lines6.join('\n') + '\n' + partial6);
    const rb6 = BR.restoreBufOf(f6, fs.readFileSync(f6));
    const none6 = BR.restoreCatchUp(rb6);
    fs.appendFileSync(f6, more6);
    const app6 = BR.restoreCatchUp(rb6);
    fs.writeFileSync(f6 + '.tmp', lines6.slice(10).join('\n') + '\n' + partial6 + more6); fs.renameSync(f6 + '.tmp', f6);
    const rew6 = BR.restoreCatchUp(rb6);
    fs.writeFileSync(f6, '{"type":"another conversation"}\n');
    const lost6 = BR.restoreCatchUp(rb6);
    ok(none6 === null && !!app6 && app6.text === partial6 + more6 && app6.drop === partial6 && !!rew6 && rew6.text === app6.text && rew6.drop === partial6 && !!lost6 && /rewritten/.test(lost6.skipped || ''),
      `restoreCatchUp: nothing new ⇒ nothing; appended ⇒ the read's partial last line + what followed (whole records); the ring rewritten ⇒ found after the read's last whole line, the same text; another file ⇒ said, nothing fed («${lost6 && lost6.skipped}»)`, { none6, app6, rew6, lost6 });
    // the backfill (PURE): the LAST source a buffer holds; none ⇒ unset; it reads the restore's own copy, never `<id>.buf` by name
    ok(BR.lastApiKeySource('{"apiKeySource":"none"}\n{"apiKeySource":"ANTHROPIC_API_KEY"}\n') === 'ANTHROPIC_API_KEY' && BR.lastApiKeySource('{"apiKeySource":"ANTHROPIC_API_KEY"}\n{"apiKeySource":"none"}\n') === 'none' && BR.lastApiKeySource('{"type":"system","subtype":"init"}\n') === null && BR.lastApiKeySource('') === null,
      'the backfill: the LATER of two billing sources wins (both orders); a buffer with none ⇒ unset (no meta write follows a null)');
    ok(/const src = billingRead\.has\(s\) \? billingRead\.get\(s\) : lastApiKeySource\(typeof s\.buffer === 'string' \? s\.buffer : ''\);/.test(brSrc) && /const src = lastApiKeySource\(savedBuffer\); if \(src\) billingRead\.set\(session, src\);/.test(brSrc) && /if \(src\) \{\n\s*s\._apiKeySource = src;/.test(brSrc),
      'the backfill writes the source the REGISTRATION read (r1487: nothing fed after the attach takes it away), else the copy the restore holds (`s.buffer`: the file resolveWrapperFiles named, a counter collision included), and only a source it found — pinned by text');
    // THE CONSUMER SIDE (src/server/session-stdout.js setupSessionPty `catchUp`, the REAL claude consumer): the caught-up records are
    // parsed before the pty's first byte, the buffer holds them once (the partial line not doubled). RED: the feed taken away
    const anyFn = () => new Proxy(function () { }, { get: (t, k) => (k === 'then' || typeof k === 'symbol' ? undefined : anyFn()), apply: () => undefined });
    const soOf = (mod, tag) => { const dd = dataDir(tag); const engine = new Proxy({ _vsuPending: new Map() }, { get: (t, k) => (k in t ? t[k] : anyFn()), has: () => true });
      return mod.create({ rootDir: dd, BUFFERS_DIR: path.join(dd, 'buffers'), META_DIR: path.join(dd, 'meta'), DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(dd, 'none'), CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(), activeSessions: new Map(), engine,
        checkClaudeGoalStatus() { }, broadcastToSession() { }, broadcastActiveSessions() { }, noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h, sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null,
        getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), getTelemetry: () => null, getNoConvoRef: () => ({ map: new Map() }), getDeliver: () => ({ stashFor: () => ({}) }), getBrain: () => anyFn(), getPages: () => null, getPermissionRules: () => null, agentEnv: () => ({}) }); };
    const { ptyListeners } = require(path.join(REPO, 'src/pty-duck.js'));
    const { createMessageManager } = require(path.join(REPO, 'src/normalizers'));
    const fed = (so) => {
      const Ld = ptyListeners(), Le = ptyListeners();
      const duck = { pid: 0, onData: (cb) => Ld.on(cb), onExit: (cb) => Le.on(cb), write() { }, resize() { }, kill() { } };
      const sid = 'w-cu6', drop = '{"type":"sys';
      const text = drop + 'tem","subtype":"status","status":"x"}\n{"type":"system","subtype":"init","session_id":"cu6","apiKeySource":"caught-up"}\n';
      const sess = { mode: 'chat', backend: 'claude', buffer: '{"type":"old"}\n' + drop, sockName: null, clients: new Set(), _normalizer: createMessageManager('claude', sid) };
      let threw = null; try { so.setupSessionPty(sess, sid, duck, { catchUp: { text, drop } }); } catch (e) { threw = String((e && e.message) || e); }
      return { threw, apiKeySource: sess._apiKeySource || null, buffer: sess.buffer, want: '{"type":"old"}\n' + text };
    };
    const soSrc = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf8');
    const fg = fed(soOf(require(path.join(REPO, 'src/server/session-stdout.js')), 'cu-so'));
    const fr = fed(soOf(require(M.write('src/server/session-stdout.js', anchored(soSrc, '      for (const cb of caught) { try { cb(catchUp.text); }', '      for (const cb of []) { try { cb(catchUp.text); }', 'b-cd4b-no-feed'), 'cd4b-no-feed')), 'cu-so-red'));
    ok(!fg.threw && fg.apiKeySource === 'caught-up' && fg.buffer === fg.want,
      `the consumer side: the caught-up records reach the REAL claude consumer before the pty's first byte (its init parsed: apiKeySource «${fg.apiKeySource}») and the buffer holds them once, the partial line not doubled`, fg);
    ok(!fr.threw && fr.apiKeySource === null, 'RED: the feed taken away ⇒ the consumer never sees the caught-up init (apiKeySource unset): what the CLI said in the window is lost to the conversation', fr);
    // an attach that keeps failing is said AT THE CONVERSATION (the card road) and in the send's own words, never «not a live chat session»
    ok(/require\('\.\.\/normalizers'\)\.feedPeerCard\(session, \{ fromName: 'VibeSpace', kind: 'notification', text: `This conversation could not be reconnected after the restart \(\$\{why\}\)/.test(brSrc)
      && /if \(!session\.pty && session\._attachFailed\) return \{ ok: false, code: 'attach_failed'/.test(fs.readFileSync(path.join(REPO, 'src/server/user-input.js'), 'utf8'))
      && /if \(session && !session\.pty && typeof session\._attachPending === 'function'\) session\._attachPending\(\);/.test(fs.readFileSync(path.join(REPO, 'src/server/permission-answer.js'), 'utf8'))
      && /return s && \(s\.pty !== null \|\| typeof s\._attachPending === 'function'\) \? null : \{ cause: 'not-running'/.test(fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8')),
      'a survivor whose attach spent its retries: ONE card at the conversation, and a send answers «could not be reconnected after the restart (its words)»; the permission answer asks the attach first; the deliverer\'s wake gate counts a waiting survivor as running (r587) — pinned by text');
  }
  console.log('⑥b B-cd4b (the round\'s follow): the catch-up\'s close is said when it fails, never swallowed (test-fd-close-census\'s law)');
  {
    // the descriptor's close answers EBADF once (the real close done first: nothing leaks) — the catch-up still returns what it read,
    // and SAYS the close's errno and the file. RED: the empty catch put back ⇒ the same return, nothing said
    const fc = path.join(dataDir('close'), 'buffers', 'fc.buf');
    fs.writeFileSync(fc, '{"type":"a"}\n{"ty'); const rbc = BR.restoreBufOf(fc, fs.readFileSync(fc)); fs.appendFileSync(fc, 'pe":"b"}\n');
    const failClose = async (Mod) => {
      const c0 = fs.closeSync; let n = 0;
      fs.closeSync = (fd) => { c0(fd); if (!n++) { const e = new Error('EBADF: bad file descriptor, close'); e.code = 'EBADF'; throw e; } };
      try { return await logged(async () => Mod.restoreCatchUp(rbc)); } finally { fs.closeSync = c0; }
    };
    const SAID = "catch (e) { console.warn(`[boot-restore] the catch-up could not close its descriptor of ${rb.file} (${(e && e.code) || (e && e.message) || e})`); }";
    const cg6 = await failClose(BR), cr6 = await failClose(require(M.write('src/server/boot-restore.js', anchored(brSrc, SAID, 'catch { }', 'b-cd4b-close-swallowed'), 'cd4b-close-swallowed')));
    const saidRe = /^\[boot-restore\] the catch-up could not close its descriptor of \S*fc\.buf \(EBADF\)$/;
    const read6 = (x) => !!x.r && x.r.text === '{"type":"b"}\n' && x.r.drop === '{"ty';
    ok(read6(cg6) && cg6.lines.filter((l) => saidRe.test(l)).length === 1, `a failed close is said once (${JSON.stringify(cg6.lines)}) and the catch-up still returns what it read (${JSON.stringify(cg6.r)})`, cg6);
    ok(read6(cr6) && !cr6.lines.some((l) => /could not close/.test(l)), 'RED: the empty catch put back ⇒ the same return, the failed close unheard', cr6);
  }
  console.log('⑦ B-cd4b (the round\'s follow): one job a loop turn — the listen step in turns of its own, the restore\'s batches in the same queue');
  {
    // src/server/loop-turns.js — asked from a TIMERS callback (the listen callback ran in one: the restore's probes ended on their
    // cap on the first test machine): a timer asked beside the ask fires BEFORE the first job (a timers phase between the asking
    // turn and the job: the loop turned), and the first job's own immediate runs before the second job (the second is a turn
    // later). RED: a hop by setImmediate alone ⇒ the job runs in the asking turn's own check phase, before the timer (one hold
    // for the loop's clock); every queued job in one hop ⇒ the second job runs before the first's immediate (one turn)
    const ltSrc = fs.readFileSync(path.join(REPO, 'src/server/loop-turns.js'), 'utf8');
    const seq = (T) => new Promise((resolve) => setTimeout(() => {
      const seen = [], push = (x) => { seen.push(x); if (seen.length === 4) resolve(seen); };
      setTimeout(() => push('timer'), 0);
      T.turn(() => { push('job1'); setImmediate(() => push('imm1')); });
      T.turn(() => push('job2'));
    }, 0));
    const lg = await seq(require(path.join(REPO, 'src/server/loop-turns.js')));
    const lr1 = await seq(require(M.write('src/server/loop-turns.js', anchored(ltSrc, 'setTimeout(() => setImmediate(next), 0)', 'setImmediate(next)', 'b-cd4b-turn-immediate'), 'cd4b-turn-immediate')));
    const lr2 = await seq(require(M.write('src/server/loop-turns.js', anchored(ltSrc, '  const fn = queue.shift();\n  try { if (fn) fn(); }', '  const fn = () => { while (queue.length) queue.shift()(); };\n  try { if (fn) fn(); }', 'b-cd4b-turn-all'), 'cd4b-turn-all')));
    ok(lg.join() === 'timer,job1,imm1,job2', `one job a loop turn: asked from a timers callback, the first job runs after the next timers phase (${lg.join(' → ')}), the second a turn after the first`, lg);
    ok(lr1.indexOf('job1') < lr1.indexOf('timer') && lr2.indexOf('job2') < lr2.indexOf('imm1'), `RED: a hop by setImmediate alone ⇒ the job before the timer (${lr1.join(' → ')}); every job in one hop ⇒ the second before the first's immediate (${lr2.join(' → ')})`, { lr1, lr2 });
    // a job that THROWS (planted; the process's uncaught handler hears it, as the hub's own does): the job asked after it still runs.
    // RED: the re-arm taken out of the finally ⇒ the queue stops at the throw (the next job never runs)
    const thrownSeq = async (T) => {
      const heard = [], ran = [];
      const onU = (e) => { if (e && e.message === 'planted: a job that throws') heard.push(1); else throw e; };
      process.on('uncaughtException', onU);
      try {
        T.turn(() => { throw new Error('planted: a job that throws'); }); T.turn(() => ran.push('after'));
        const tEnd = Date.now() + 300; while (!ran.length && Date.now() < tEnd) await new Promise((r) => setTimeout(r, 5));
        return { heard: heard.length, ran: ran.length };
      } finally { process.removeListener('uncaughtException', onU); }
    };
    const tg7 = await thrownSeq(require(path.join(REPO, 'src/server/loop-turns.js')));
    const tr7 = await thrownSeq(require(M.write('src/server/loop-turns.js', anchored(ltSrc, '  try { if (fn) fn(); } finally { if (queue.length) hop(); else armed = false; }', '  if (fn) fn();\n  if (queue.length) hop(); else armed = false;', 'b-cd4b-turn-no-rearm'), 'cd4b-turn-no-rearm')));
    ok(tg7.heard === 1 && tg7.ran === 1, `a job that throws: the throw reaches the process and the job after it still runs (${tg7.ran} ran)`, tg7);
    ok(tr7.heard === 1 && tr7.ran === 0, `RED: the re-arm out of the finally ⇒ the queue stops at the throw (${tr7.ran} ran after it)`, tr7);
    // server.js (pinned by text: it is not loaded here): the listen callback's restore in a turn of its own ('restore'), the rest of
    // the step in the turn after it ('listen'); the person's CLI index configured in that last turn (its boot write lists the
    // survivors); the hub's turns named through the boot trace; the front holds new connections until the last turn (test-tls-demux §6)
    const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    const lA = srv.indexOf('  migrateLegacyHomeProjects(); hub.turn(() => { //'), lB = srv.indexOf('\n  restoreSessions(); hub.turn(() => { bootBrowserKeeper(); ');
    const lI = srv.indexOf("try { require('./src/server/local-index.js').configure("), lEnd = srv.indexOf("\n}, 'listen-rest'); }, 'restore'); })));");   // the separation's B2b: the listen rides .finally(() => hubForm.then(…)) — one more close
    ok(lA > 0 && srv.indexOf('\n', lA) === lB && lI > lB && lEnd > lI && srv.split("require('./src/server/local-index.js').configure(").length === 2
      && /const hub = require\('\.\/src\/server\/tls\.js'\)\.create\(\{[^\n]*, step: \(name, fn\) => bootTrace\.step\(name, fn\) \}\);/.test(srv),
      'server.js: the restore\'s registration in a loop turn of its own (\'restore\'), the rest of the listen step in the turn after it (\'listen-rest\'), the CLI index configured in that last turn, the turns named in the boot trace');
  }
} catch (e) { fail++; console.error('  ✗ threw: ' + (e && e.stack || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
