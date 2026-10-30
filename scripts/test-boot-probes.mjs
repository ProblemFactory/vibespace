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
//   ④ THE CENSUS: src/server/boot-restore.js holds no sync child (execFileSync / spawnSync / execSync) — a planted one is RED.
// The fakes: `fuser` / `pgrep` read a mode file per (tool,) socket basename (hang = TERM ignored, never answers — the
// D-state stand-in; alive; dead) and `cut` (the fd scan's last stage) hangs on demand. The legs that wait run side by
// side (the two controls, three probe passes): ~7 s. Run: node scripts/test-boot-probes.mjs
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
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
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
function instance(BRm, d) {
  const SOCK = path.join(d, 'sockets'), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers');
  const metaFile = (s) => path.join(META, s + '.json');
  const activeSessions = new Map(), attached = [], notes = [], broadcasts = { n: 0 }, ended = [];
  const api = BRm.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
    activeSessions, sessionCounterRef: { value: 0 }, attachToDtach: (id, sp, s) => { attached.push(id); s.pty = null; }, setupSessionPty: () => { },
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
  const NOCAP = require(M.write('src/server/boot-restore.js', brSrc.replace(RACE, 'await Promise.all([drain(), drain(), drain(), drain()]);'), 'no-cap'));
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

  console.log('④ the census: no sync child in the boot restore');
  {
    const SYNC = /\b(?:execFileSync|spawnSync|execSync)\b/g;
    const sites = (src) => [...src.matchAll(SYNC)].length;
    ok(sites(brSrc) === 0, `src/server/boot-restore.js: ${sites(brSrc)} execFileSync / spawnSync / execSync site(s) — none allowed`);
    for (const plant of ["require('child_process').execFileSync('fuser', [socketPath], { timeout: 2000 });", "require('child_process').spawnSync('pgrep', ['-f', socketPath]);", "require('child_process').execSync('true');"])
      ok(sites(brSrc.replace('function restoreSessions() {\n', `function restoreSessions() {\n  try { ${plant} } catch { }\n`)) === 1, `CONTROL: a planted ${plant.split('(')[1].split('.')[1] || plant.slice(0, 30)} in restoreSessions is RED`);
  }
} catch (e) { fail++; console.error('  ✗ threw: ' + (e && e.stack || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
