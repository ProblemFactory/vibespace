#!/usr/bin/env node
// STARTING A HELPER NEVER ENDS THE HUB (ckpt61's hosted red, lane bl-loop-a: test-restore-liveness's minute at a FULL file table
// ended the hub, exit 1). Node's ChildProcess.spawn answers EMFILE / ENFILE by RETURNING with no pipes and its 'error' queued for
// the next tick (Node 22.23.4 and 24.22.1 read); a pipe touched before the error listener threw, and the queued error then found
// none: process.on('uncaughtException') exits 1. Split out of test-hub-program-starts (cure 5: THE TIER RULE — that row stays
// under the fast bound, and so does this one; the fast tier's over-list is at its bound).
//  ④i A START THAT FAILS AT ONCE NEVER ENDS THE HUB: a REAL full file table in a child node ⇒ the starter's start answered
//     «unknown» (the fault counted), the old road's «not started», the process alive; RED the tip's order (a pipe touched before
//     the error listener) ⇒ the uncaught «spawn … EMFILE», exit 1 — at the starter, at the old road; RED the unknown uncounted
//  ④k THE SELF-UPDATE'S FAILED START IS SAID: the dialog's log carries the failure and its end mark, a second press tries again,
//     the log write allowed and refused; RED each half (not written and not kept · the status's fallback · the in-flight check)
//  ④l THE STREAM LAW on the copy and archive roads, read in the route's own order; RED each claim flipped alone
//  ④m B-147f THE DEVICE AGENT's starts under a full table (the node runtime, the RDP trust run, the X resources merge: answered,
//     alive; the upgrade's hand-over exits non-zero for a successor that did not start); RED each in the tip's order
//  (B-147f's stay, run for real with the built bundle as daemons: scripts/test-agentd-stay.mjs — split out by THE TIER RULE)
//  ④j THE CLASS, over every module the HUB loads (the require graph from server.js) and every form of a start (bare, an alias
//     of one, namespaced, inline, fork, an execFile with a pipe touched): the error listener before the first unguarded pipe
//     touch, a catch in a start's own flow signals only with a real pid; the named debt (scripts/fixtures/spawn-listener-debt.json)
//     only falls; RED each form planted broken + the real sites put back; the shapes it must never flag
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CP = require('child_process');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string — the arguments are swapped?'); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 2400) : ''}`); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-start-failures-'));
const MC = mutantCopies('hub-start-failures', REPO);

try {
  console.log('④i/④k/④l/④j a start that fails at once, a stream, a kill: the hub lives');
  { // ④i A START THAT FAILS AT ONCE NEVER ENDS THE HUB (ckpt61's hosted red, test-restore-liveness: its minute at a FULL file
    // table ended the hub, exit 1 — the port watch's 30 s request started the starter). Node's ChildProcess.spawn answers EMFILE /
    // ENFILE by RETURNING with no pipes and its 'error' queued for the next tick (Node 22.23.4 and 24.22.1 read); the tip touched a
    // pipe before its error listener: a TypeError run() caught as a fault, then the queued error found no listener — an uncaught
    // exception. A REAL full table: a child node under `ulimit -n 128` fills its own table (/dev/null) and asks the starter twice
    // — ⇒ unknown, the fault counted, the starter to be replaced; ⇒ the old road, whose start fails the same way ⇒ «not started»
    // (EMFILE) — then frees its table and says it is alive. RED CONTROLS, the tip's order: the starter's pipe touched before its
    // listener ⇒ the child dies before its first answer (exit 1, the uncaught «spawn … EMFILE»); the old road's capture pipes
    // touched before its listener ⇒ it dies before its answer line (its rejected ask is caught in the same microtask drain, the
    // queued error's tick comes after it)
    const FULL = path.join(T, 'full-table.cjs');
    fs.writeFileSync(FULL, [
      "const fs = require('fs'); const CS = require(process.argv[2]); const S = CS.createChildStarter({ log: { warn: () => { } } });",
      "const held = []; let full = null; try { for (let i = 0; i < 100000; i++) held.push(fs.openSync('/dev/null', 'r')); } catch (e) { full = e.code; }",
      "(async () => {",
      "  const r1 = await S.run('true', [], { timeoutMs: 2000 }); const st1 = S.stats(); process.stderr.write('ASKED-1\\n');",
      "  let r2; try { r2 = await S.run('true', [], { timeoutMs: 2000, capture: true }); } catch (e) { r2 = { threw: String(e && e.message) }; } const st2 = S.stats(); process.stderr.write('ASKED-2\\n');",
      "  await new Promise((r) => setTimeout(r, 300));   // every queued error has had its turn",
      "  for (const fd of held) fs.closeSync(fd);",
      "  process.stdout.write(JSON.stringify({ full, held: held.length, r1, st1, r2, st2 }) + '\\n'); S.closePipe(); process.exit(0);",
      "})();",
    ].join('\n'));
    const fullRun = (csPath) => new Promise((resolve) => {
      let out = '', err = '', c;
      try { c = CP.spawn('sh', ['-c', 'ulimit -n 128 && exec "$0" "$@"', process.execPath, FULL, csPath], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: null, err: String(e) }); return; }
      c.on('error', (e) => { err += String(e); });
      if (c.stdout) c.stdout.on('data', (d) => { out += d; });
      if (c.stderr) c.stderr.on('data', (d) => { err += d; });
      const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 20000);
      c.on('close', (code, signal) => { clearTimeout(t); let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { } resolve({ code, signal, j, unheard: /Unhandled 'error' event|Emitted 'error' event on ChildProcess/.test(err), died: (/Error: spawn (\S+) EMFILE/.exec(err) || [])[1] || null, err: err.slice(-500) }); });
    });
    const csE = fs.readFileSync(path.join(REPO, 'src/server/child-starter.js'), 'utf8');
    const LIS = "    p.on('error', () => { if (p === proc) fault('the starter could not be started'); });\n", PIPE_IN = "    p.stdin.on('error', () => { });\n";
    const DLIS = "      c.on('error', (e) => { if (t) clearTimeout(t); if (!done) { done = true; resolve({ started: false, code: null, error: String((e && e.code) || e), stdout: out, stderr: err }); } });\n";
    const CAPG = '      if (o.capture && c.stdout && c.stderr) {', CLOSE = "      c.on('close', (code, signal) => {";
    const redStartSrc = anchored(anchored(csE, LIS, '', 'emfile-start-off'), PIPE_IN, PIPE_IN + LIS, 'emfile-start-late');
    const redDirectSrc = anchored(anchored(anchored(csE, DLIS, '', 'emfile-direct-off'), CAPG, '      if (o.capture) {', 'emfile-direct-unguarded'), CLOSE, DLIS + CLOSE, 'emfile-direct-late');
    // the four children run AT ONCE (each its own process and its own full table; cure 5: the row stays under the fast bound)
    const [g, rU, rA, rB] = await Promise.all([
      fullRun(path.join(REPO, 'src/server/child-starter.js')),
      fullRun(MC.write('src/server/child-starter.js', anchored(csE, 'stats.unknown++; return Promise.resolve', 'return Promise.resolve', 'emfile-unknown-uncounted'), 'red-emfile-unknown')),
      fullRun(MC.write('src/server/child-starter.js', redStartSrc, 'red-emfile-start')),
      fullRun(MC.write('src/server/child-starter.js', redDirectSrc, 'red-emfile-direct')),
    ]);
    const j = g.j || {};
    ok(g.code === 0 && j.full === 'EMFILE' && j.r1 && j.r1.unknown === true && j.st1.faults === 1 && j.st1.restarted && !j.st1.direct && j.st1.unknown === 1
      && j.r2 && j.r2.started === false && /EMFILE|ENFILE/.test(String(j.r2.error)) && j.st2.faults === 2 && j.st2.direct && j.st2.starts === 2
      // the reds are judged by THE DEATH ITSELF — exit 1, no answer line, and the uncaught start error by its name — never by how many
      // asks ran before it (the order of a tick and a rejection is the runtime's: the hosted Node 22 and the hub's Node 24)
      && rA.code === 1 && rA.unheard && path.basename(String(rA.died)) === path.basename(process.execPath) && !rA.j
      && rB.code === 1 && rB.unheard && rB.died === 'true' && !rB.j
      && rU.code === 0 && rU.j && rU.j.r1 && rU.j.r1.unknown === true && rU.j.st1.unknown === 0,
      `a FULL file table (${j.held} handles held, the next open «${j.full}»): the starter's start fails at once ⇒ answered «unknown», ${j.st1 && j.st1.faults} fault counted, ${j.st1 && j.st1.unknown} unknown; the second ⇒ the old road, its start failing the same way ⇒ «not started» (${j.r2 && j.r2.error}), ${j.st2 && j.st2.faults} faults — the process ALIVE after (exit ${g.code}); RED the tip's order: the starter's pipe first ⇒ exit ${rA.code}, the unheard «spawn ${rA.died} EMFILE», no answer line; the old road's pipes first ⇒ exit ${rB.code}, the unheard «spawn ${rB.died} EMFILE», no answer line; RED the unknown not counted ⇒ ${rU.j && rU.j.st1 ? rU.j.st1.unknown : '?'} counted for the same answer`,
      { g: { code: g.code, j: g.j, err: g.err }, rA: { code: rA.code, died: rA.died, unheard: rA.unheard, err: rA.err }, rB: { code: rB.code, died: rB.died, unheard: rB.unheard, err: rB.err }, rU: { code: rU.code, st1: rU.j && rU.j.st1 } });

    // ④k THE SELF-UPDATE'S FAILED START IS SAID (cure 2; cure 3: each half with its own red): the route answers «started» before the
    // queued 'error' arrives; the dialog reads the update's log for its end mark (src/lib/app.js: «Update failed (exit N) — see the log
    // below») — without it, it spun to its ten-minute timeout, and a second press was refused as a run «already» in flight. A REAL
    // full table, refilled before EACH call with exactly ONE handle free (the route opens its log, the start's pipes cannot be made —
    // whatever else of the process took a handle meanwhile): the status's log says it and carries the mark, the process alive, a
    // second press tries again — with the log write allowed, and with it REFUSED (the status answers the mark from memory).
    // RED, each half alone: the status's fallback out (the write refused ⇒ no mark), the in-flight check's «failed at once» out (the
    // write refused ⇒ the press refused), the failure neither written nor kept (no mark, the press refused)
    // EACH RUN ITS OWN ROOT (cure 4: one shared data/update.log carried a run's state into the next — «a recent log with no mark»
    // answered the next run's FIRST press «already», so its start never failed and the reds after it judged nothing)
    const OPSF = path.join(T, 'ops-full.cjs');
    let rootN = 0;
    const freshRoot = () => { const R = path.join(T, `ops-root-${++rootN}`); fs.mkdirSync(path.join(R, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(R, 'data'), { recursive: true }); fs.writeFileSync(path.join(R, 'scripts', 'update.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 }); return R; };
    fs.writeFileSync(OPSF, [
      "const fs = require('fs'); const [opsPath, root, refuse] = process.argv.slice(2); const routes = {};",
      "if (refuse === '1') { const ra = fs.promises.appendFile; fs.promises.appendFile = async function (p, ...a) { if (String(p).endsWith('update.log')) { const e = new Error('EMFILE: the leg refuses the write'); e.code = 'EMFILE'; throw e; } return ra.call(this, p, ...a); }; }",
      "const app = new Proxy({}, { get: (t, k) => (p, ...h) => { if (typeof p === 'string' && h.length) routes[String(k).toUpperCase() + ' ' + p] = h[h.length - 1]; } });",
      "require(opsPath).create({ app, rootDir: root, wss: { clients: new Set() }, WS_OPEN: 1 });",
      "const call = (k) => new Promise((r) => { const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { r({ code: this.statusCode, body: o }); return this; }, end() { r({ code: this.statusCode }); }, set() { return this; }, setHeader() { } }; routes[k]({ body: {}, query: {}, headers: {} }, res); });",
      "const held = []; let full = null;",
      "const oneFree = () => { try { for (let i = 0; i < 100000; i++) held.push(fs.openSync('/dev/null', 'r')); } catch (e) { full = e.code; } fs.closeSync(held.pop()); };   // full, ONE handle free",
      "const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
      "(async () => {",
      "  oneFree(); const post = await call('POST /api/self-update'); await sleep(300);",
      "  oneFree(); const st = await call('GET /api/self-update/status');",
      "  oneFree(); const again = await call('POST /api/self-update'); await sleep(300);",
      "  for (const fd of held) fs.closeSync(fd);",
      "  process.stdout.write(JSON.stringify({ full, post, st, again }) + '\\n'); process.exit(0);",
      "})();",
    ].join('\n'));
    const opsRun = (opsPath, refuse) => new Promise((resolve) => {
      let out = '', err = '', c;
      try { c = CP.spawn('sh', ['-c', 'ulimit -n 128 && exec "$0" "$@"', process.execPath, OPSF, opsPath, freshRoot(), refuse ? '1' : '0'], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: null, err: String(e) }); return; }
      c.on('error', (e) => { err += String(e); });
      if (c.stdout) c.stdout.on('data', (d) => { out += d; });
      if (c.stderr) c.stderr.on('data', (d) => { err += d; });
      const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 20000);
      c.on('close', (code) => { clearTimeout(t); let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { } resolve({ code, j, err: err.slice(-400) }); });
    });
    const opsSrc = fs.readFileSync(path.join(REPO, 'src/server/ops-routes.js'), 'utf8'), OPS = path.join(REPO, 'src/server/ops-routes.js');
    const KEPT = "      _selfUpdateFailed = { why };\n", WRITTEN = /\n {6}fs\.promises\.appendFile\(_updateLogPath, failedStart\(why\)\)\.catch\(\(\) => \{ \}\);[^\n]*/;
    const FALLBACK = /\n {2}if \(_selfUpdateFailed && !log\.includes\('__UPDATE_EXIT:'\)\) log \+= failedStart\(_selfUpdateFailed\.why\);[^\n]*/, INFLIGHT = " && !_selfUpdateFailed) return res.json({ success: true, already: true });";
    const view = (r) => { const j = r.j || {}; return { code: r.code, full: j.full, posted: !!(j.post && j.post.body && j.post.body.success), log: String((j.st && j.st.body && j.st.body.log) || ''), running: j.st && j.st.body ? j.st.body.running : null, already: j.again && j.again.body ? j.again.body.already === true : null, err: r.err }; };
    // the five children run AT ONCE (each its own root and its own full table)
    const [kOk, kRef, kSilent, kNoFallback, kInflight] = (await Promise.all([
      opsRun(OPS, false), opsRun(OPS, true),
      opsRun(MC.write('src/server/ops-routes.js', anchored(anchored(opsSrc, KEPT, '', 'update-failed-kept'), WRITTEN, '', 'update-failed-written'), 'red-update-silent'), false),
      opsRun(MC.write('src/server/ops-routes.js', anchored(opsSrc, FALLBACK, '', 'update-status-fallback'), 'red-update-no-fallback'), true),
      opsRun(MC.write('src/server/ops-routes.js', anchored(opsSrc, INFLIGHT, ') return res.json({ success: true, already: true });', 'update-inflight'), 'red-update-inflight'), true),
    ])).map(view);
    const said = (v) => /could not be started \(EMFILE\)/.test(v.log) && /__UPDATE_EXIT:127\s*$/.test(v.log);
    ok([kOk, kRef].every((v) => v.code === 0 && v.full === 'EMFILE' && v.posted && said(v) && v.running === false && v.already === false)
      && [kSilent, kNoFallback, kInflight].every((v) => v.code === 0 && v.full === 'EMFILE' && /\[update\] the update could not be started: EMFILE/.test(v.err))   // each red's first start REALLY failed
      && kSilent.code === 0 && !/__UPDATE_EXIT:/.test(kSilent.log) && kSilent.already === true
      && kNoFallback.code === 0 && !/__UPDATE_EXIT:/.test(kNoFallback.log)
      && kInflight.code === 0 && said(kInflight) && kInflight.already === true,
      `the self-update's start failing at once (a full table, one handle free before each call): the dialog's log says «${(kOk.log.match(/could not be started \([^)]*\)/) || ['—'])[0]}» and ends with its mark (${(kOk.log.match(/__UPDATE_EXIT:\d+/) || ['none'])[0]} ⇒ «Update failed»), nothing running, a second press tries again — the log write allowed and REFUSED alike (refused: ${(kRef.log.match(/__UPDATE_EXIT:\d+/) || ['no mark'])[0]} from memory, already ${kRef.already}); the process alive; RED each half: the failure neither written nor kept ⇒ no mark + the press refused (${kSilent.already}); the status's fallback out ⇒ ${/__UPDATE_EXIT:/.test(kNoFallback.log) ? 'a mark' : 'no mark'}; the in-flight check's «failed at once» out ⇒ the press refused (${kInflight.already})`,
      { kOk, kRef, kSilent, kNoFallback, kInflight });

    // ④l THE STREAM LAW (cure 3; pinned with its reds in cure 4 — a closed must has a leg): any stream the hub opens on the copy and
    // archive roads has its error listener before anything that can throw (a full table fails its open on a later tick: unheard, the
    // hub ended). The order is read in the route's own source: a reader that never started is refused BEFORE any stream is made, the
    // local reader is heard before it is counted or piped, the write stream before the pipe, the archive entry's out stream at its
    // creation (before its reader starts), and a reader that never started is refused before its pipe. RED: the guard removed, the
    // write stream's order reverted, the out stream's listener removed — each flips its own claim
    const streamClaims = (src) => {
      const at = (needle, from = 0) => src.indexOf(needle, from);
      const r0 = at('else reader = fs.createReadStream(safePath(src));'), g = at('if (!reader) return res.status(503)', r0), rl = at("reader.on('error', () => { });", r0), rc = at('count(reader);', r0);
      const w0 = at('const w = fs.createWriteStream(part);'), we = at("w.on('error', reject);", w0), wp = at('reader.pipe(w);', w0);
      const o0 = at('const outStream = fs.createWriteStream(outPath);'), oe = at("outStream.on('error'", o0), sp = at('const child = spawn(cmd, args', o0), cg = at('if (!child.stdout)', o0), cp = at('child.stdout.pipe(outStream);', o0);
      return {
        'a reader that never started is refused before any stream is made': r0 >= 0 && g > r0 && g < rc && at('createWriteStream(part)', r0) > g && at('const w = spawn(', r0) > g,
        'the local reader heard before it is counted or piped': rl > r0 && rl < rc,
        'the write stream heard before the pipe': w0 >= 0 && we > w0 && wp > we,
        'the archive entry out stream heard at its creation': o0 >= 0 && oe > o0 && oe < sp,
        'an archive reader that never started refused before its pipe': sp > 0 && cg > sp && cg < cp,
      };
    };
    const filesSrc = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8'), sGreen = streamClaims(filesSrc);
    const sReds = [
      ['the reader guard removed', 'a reader that never started is refused before any stream is made', streamClaims(anchored(filesSrc, /\n {2}if \(!reader\) return res\.status\(503\)[^\n]*/, '', 'stream-guard'))],
      ['the write stream order reverted', 'the write stream heard before the pipe', streamClaims(anchored(filesSrc, "const w = fs.createWriteStream(part); w.on('error', reject); w.on('finish', resolve); reader.on('error', reject); reader.pipe(w);", "const w = fs.createWriteStream(part); reader.pipe(w); w.on('error', reject); w.on('finish', resolve); reader.on('error', reject);", 'stream-order'))],
      ['the out stream listener removed', 'the archive entry out stream heard at its creation', streamClaims(anchored(filesSrc, "  outStream.on('error', (e) => { outErr = outErr || e; });\n", '', 'stream-out'))],
    ].map(([what, claim, r]) => [what, claim, r[claim] === false && Object.entries(r).filter(([k, v]) => k !== claim && !v).length === 0]);
    ok(Object.values(sGreen).every(Boolean) && sReds.every(([, , flipped]) => flipped),
      `the stream law on the copy and archive roads: ${Object.entries(sGreen).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(' · ')}; RED each flips only its own claim: ${sReds.map(([w, , f]) => `${w} ${f}`).join(' · ')}`, { sGreen, sReds });

    // ④m B-147f — THE DEVICE AGENT'S STARTS UNDER A FULL TABLE (the modules it bundles, each loaded in a child node under its own
    // `ulimit -n 128`, its table filled): the node runtime's bounded child answers «not started» (code -1, the spawn's EMFILE) and the
    // RDP trust run «not started», the X resources merge «failed» — the process ALIVE after; the upgrade's hand-over, told its
    // successor did not start (a false answer, a throw), STAYS (its lock and socket taken again: an exit of any code left the machine
    // with no agent where nothing restarts it); with no stay to take it exits 75. RED, the tip's order: the node runtime's pipes first ⇒ the unheard
    // «spawn true EMFILE», exit 1, no answer line; the RDP trust run's pipes first ⇒ the same; the old hand-over ⇒ exit 0.
    // (agentd.js itself starts the daemon when it is loaded: its own starts — the pipe conversation, the successor, the stream child,
    // the stdio bridge — are read by ④j's census below, each put back as a red.)
    const AGF = path.join(T, 'agent-full.cjs'), AGCFG = path.join(T, 'agent-rdp-cfg');
    fs.mkdirSync(AGCFG, { recursive: true });
    fs.writeFileSync(AGF, "const fs = require('fs'); const [nrPath, ddPath, rxPath, cfg] = process.argv.slice(2);\nconst NR = require(nrPath), DD = require(ddPath), RX = require(rxPath);\nconst held = []; let full = null; try { for (let i = 0; i < 100000; i++) held.push(fs.openSync('/dev/null', 'r')); } catch (e) { full = e.code; }\n(async () => {\n  const nr = await NR.runChild('true', [], { timeoutMs: 3000 });\n  const rdp = await DD.rdpTrustRun({ exec: 'true', argv: [], env: { PATH: process.env.PATH }, configDir: cfg, stdinLine: () => 'y', deadlineMs: 3000 });\n  const xr = await DD.applyXResources({ binPath: 'true', env: { PATH: process.env.PATH }, text: 'x', deadlineMs: 3000 });\n  let handOverExit = null; RX.handOver({ server: { close: (cb) => cb() }, spawnNext: () => false, exit: (c) => { handOverExit = c; }, log: () => { } });\n  let stayed = 0, stayExit = null; for (const spawnNext of [() => false, () => { throw new Error('a start that threw'); }]) RX.handOver({ server: { close: (cb) => cb() }, spawnNext, stay: () => { stayed++; }, exit: (c) => { stayExit = c; }, log: () => { } });\n  await new Promise((r) => setTimeout(r, 300));   // every queued error has had its turn\n  for (const fd of held) fs.closeSync(fd);\n  process.stdout.write(JSON.stringify({ full, nr, rdp: { code: rdp.code, out: rdp.out }, xr, handOverExit, stayed, stayExit }) + '\\n'); process.exit(0);\n})();");
    const agentRun = (nrPath, ddPath, rxPath) => new Promise((resolve) => {
      let out = '', err = '', c;
      try { c = CP.spawn('sh', ['-c', 'ulimit -n 128 && exec "$0" "$@"', process.execPath, AGF, nrPath, ddPath, rxPath, AGCFG], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: null, err: String(e) }); return; }
      c.on('error', (e) => { err += String(e); });
      if (c.stdout) c.stdout.on('data', (d) => { out += d; });
      if (c.stderr) c.stderr.on('data', (d) => { err += d; });
      const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 20000);
      c.on('close', (code) => { clearTimeout(t); let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { } resolve({ code, j, unheard: /Unhandled 'error' event|Emitted 'error' event on ChildProcess/.test(err), died: (/Error: spawn (\S+) EMFILE/.exec(err) || [])[1] || null, err: err.slice(-400) }); });
    });
    const NRP = path.join(REPO, 'src/node-runtime.js'), DDP = path.join(REPO, 'src/desktop-display.js'), RXP = path.join(REPO, 'src/agentd/reexec.js');
    const nrSrc = fs.readFileSync(NRP, 'utf8'), ddSrc = fs.readFileSync(DDP, 'utf8'), rxSrc = fs.readFileSync(RXP, 'utf8');
    const [ag, agNr, agDd, agRx] = await Promise.all([
      agentRun(NRP, DDP, RXP),
      agentRun(MC.write('src/node-runtime.js', anchored(nrSrc, "    child.on('error', (e) => { take(String(e && e.message)); end(-1); });\n    child.on('close', (code) => end(code == null ? -1 : code));\n    if (child.stdout) child.stdout.on('data', take); if (child.stderr) child.stderr.on('data', take);\n", "    child.stdout.on('data', take); child.stderr.on('data', take);\n    child.on('error', (e) => { take(String(e && e.message)); end(-1); });\n    child.on('close', (code) => end(code == null ? -1 : code));\n", 'b147f-nr-order'), 'red-b147f-nr'), DDP, RXP),
      agentRun(NRP, MC.write('src/desktop-display.js', anchored(ddSrc, "    child.on('error', (e) => finish(null, null, `not started: ${e.message}`));\n    child.on('close', (code, signal) => finish(code, signal));\n    const keep = (b) => { if (size < 65536) { chunks.push(b); size += b.length; } };\n    if (child.stdout) child.stdout.on('data', keep); if (child.stderr) child.stderr.on('data', keep);\n", "    const keep = (b) => { if (size < 65536) { chunks.push(b); size += b.length; } };\n    child.stdout.on('data', keep); child.stderr.on('data', keep);\n    child.on('error', (e) => finish(null, null, `not started: ${e.message}`));\n    child.on('close', (code, signal) => finish(code, signal));\n", 'b147f-dd-order'), 'red-b147f-dd'), RXP),
      agentRun(NRP, DDP, MC.write('src/agentd/reexec.js', anchored(rxSrc, "    let started = false;\n    try { started = spawnNext() !== false; } catch (e) { log(`upgrade hand-over: the successor's start threw (${(e && e.message) || e})`); }\n    if (started) { exit(0); return; }\n    log('upgrade hand-over: the successor did not start \u2014 this daemon stays');\n    if (typeof stay === 'function') { try { stay(); return; } catch (e) { log(`upgrade hand-over: it could not stay (${(e && e.message) || e}) — exit 75`); } }\n    exit(75);", "    try { spawnNext(); } finally { exit(0); }", 'b147f-rx-exit'), 'red-b147f-rx')),
    ]);
    const aj = ag.j || {};
    ok(ag.code === 0 && aj.full === 'EMFILE' && aj.nr && aj.nr.code === -1 && /EMFILE/.test(String(aj.nr.out)) && aj.rdp && /not started: spawn true EMFILE/.test(String(aj.rdp.out)) && aj.xr && aj.xr.ok === false && /EMFILE/.test(String(aj.xr.why)) && aj.handOverExit === 75 && aj.stayed === 2 && aj.stayExit === null
      && agNr.code === 1 && agNr.unheard && agNr.died === 'true' && !agNr.j
      && agDd.code === 1 && agDd.unheard && agDd.died === 'true' && !agDd.j
      && agRx.code === 0 && agRx.j && agRx.j.handOverExit === 0 && agRx.j.stayed === 0,
      `the device agent's starts under a FULL table (the next open «${aj.full}»): the node runtime's child «${aj.nr && aj.nr.out}» (code ${aj.nr && aj.nr.code}), the RDP trust run «${String(aj.rdp && aj.rdp.out).trim().slice(0, 60)}», the X resources merge «${aj.xr && aj.xr.why}» — the process ALIVE (exit ${ag.code}); the hand-over told its successor did not start STAYS (${aj.stayed} of 2 — a false answer and a throw; nothing exited) and, with no stay to take, exits ${aj.handOverExit}; RED the tip's order: the node runtime ⇒ exit ${agNr.code}, the unheard «spawn ${agNr.died} EMFILE»; the RDP trust run ⇒ exit ${agDd.code}, «spawn ${agDd.died} EMFILE»; the old hand-over ⇒ exit ${agRx.j && agRx.j.handOverExit}, stayed ${agRx.j && agRx.j.stayed}`,
      { ag: { code: ag.code, j: ag.j, err: ag.err }, agNr: { code: agNr.code, died: agNr.died, err: agNr.err }, agDd: { code: agDd.code, died: agDd.died, err: agDd.err }, agRx: { code: agRx.code, j: agRx.j } });

    // ④j THE CLASS (cure 2: every module the HUB loads, every form of a start): the hub's module set is DERIVED — the require graph
    // from server.js, never a typed list — and in each, every start is read: a bare spawn / fork / execFile destructured from
    // child_process, a namespaced one (cp.spawn), an inline require('child_process').spawn. A spawn / fork attaches its 'error'
    // listener BEFORE its first unguarded pipe touch, and has one (a start that fails at once queues its error; unheard, the hub
    // ends: process.on('uncaughtException') exits 1); an execFile holds its own listener — its child's pipe is never touched
    // unguarded (a rejection instead of the road's own refusal). A start handed straight on (an argument, a return) is judged
    // where it lands, counted here. Comments are blanked first. node-pty's spawn (claude-signin, oat-mint: a local `spawn`) throws
    // instead: not this class. RED: each form planted broken, the five sites cured here put back, and three shapes it must NOT flag
    // the engine (cure 3, the fresh read's MUST: a `/*` inside a line comment or a string opened a FAKE comment — server.js's
    // «/api/file/serve/*» hid its lines 143–579 and with them 37 hub modules): comments are blanked in ONE left-to-right pass
    // that knows strings, template literals (and their ${…}) and regex literals; a start's listener is judged in its own scope (up
    // to its name's next declaration: a second `const w` is another child); a pipe is touched by a member read, a stdio slot or
    // being handed as a call's first argument
    function blank(src) {
      const n = src.length, cuts = [], stack = [];   // cuts: [a, b) comment ranges; stack: the brace depth of each ${…} we are inside
      let i = 0, last = '';                          // last: the last significant code token's tail (a regex vs a division)
      const isWord = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
      const regexStart = () => /^$|[(,=:[!&|?{};+\-*%<>~^]$/.test(last) || /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new)$/.test(last);
      const tpl = () => {   // i at the char after the opening backtick: scan to its closing backtick, recursing into ${…}
        while (i < n) {
          const c = src.charCodeAt(i);
          if (c === 92) { i += 2; continue; }
          if (c === 96) { i++; return; }
          if (c === 36 && src.charCodeAt(i + 1) === 123) { i += 2; stack.push(0); code(true); continue; }
          i++;
        }
      };
      const code = (inTpl) => {
        while (i < n) {
          const c = src.charCodeAt(i), d = src.charCodeAt(i + 1);
          if (c === 47 && d === 47) { const e = src.indexOf('\n', i); const end = e < 0 ? n : e; cuts.push(i, end); i = end; continue; }
          if (c === 47 && d === 42) { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; cuts.push(i, end); i = end; continue; }
          if (c === 47 && regexStart()) { let k = i + 1, cls = false; while (k < n) { const x = src.charCodeAt(k); if (x === 10) break; if (x === 92) { k += 2; continue; } if (x === 91) cls = true; else if (x === 93) cls = false; else if (x === 47 && !cls) break; k++; } i = k + 1; while (i < n && src.charCodeAt(i) >= 97 && src.charCodeAt(i) <= 122) i++; last = 'r'; continue; }
          if (c === 34 || c === 39) { let k = i + 1; while (k < n) { const x = src.charCodeAt(k); if (x === c || x === 10) break; if (x === 92) k++; k++; } i = k + 1; last = 's'; continue; }
          if (c === 96) { i++; tpl(); last = 's'; continue; }
          if (inTpl && c === 123) { stack[stack.length - 1]++; i++; last = '{'; continue; }
          if (inTpl && c === 125) { if (stack[stack.length - 1] === 0) { stack.pop(); i++; return; } stack[stack.length - 1]--; i++; last = '}'; continue; }
          if (c > 32) { if (isWord(c)) { let k = i; while (k < n && isWord(src.charCodeAt(k))) k++; last = src.slice(Math.max(i, k - 12), k); i = k; continue; } last = src[i]; }
          i++;
        }
      };
      code(false);
      if (!cuts.length) return src;
      let out = '', p = 0;
      for (let k = 0; k < cuts.length; k += 2) { out += src.slice(p, cuts[k]) + src.slice(cuts[k], cuts[k + 1]).replace(/[^\n]/g, ' '); p = cuts[k + 1]; }
      return out + src.slice(p);
    }
    // deferred(text): is a function body (an arrow's or a `function`'s) still open at the end of `text`? (its code runs later)
    function deferred(text) {
      const stack = [];
      for (let k = 0; k < text.length; k++) {
        const ch = text[k];
        if (ch === '{') { const pre = text.slice(Math.max(0, k - 160), k); stack.push(/=>\s*$/.test(pre) || /\bfunction\b[^{};]*$/.test(pre) ? 'fn' : 'block'); }
        else if (ch === '}') stack.pop();
      }
      return stack.includes('fn');
    }
    // blockAt(text, k): the text of the block whose `{` is at k (to its matching `}`)
    function blockAt(text, k) { let depth = 0, e = k; for (; e < text.length; e++) { if (text[e] === '{') depth++; else if (text[e] === '}') { depth--; if (!depth) break; } } return text.slice(k, e + 1); }
    const CPQ = `require\\(\\s*['"](?:node:)?child_process['"]\\s*\\)`;
    // sitesOf(rel, raw) → [{ site, form, v, handed, bad }]: every start in a file, judged
    function sitesOf(rel, raw, pre = null) {
      const src = pre != null ? pre : blank(raw), out = [];
      const ns = [...src.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${CPQ}`, 'g'))].map((m) => m[1]);
      const bare = new Map();
      for (const m of src.matchAll(new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${CPQ}`, 'g'))) for (const part of m[1].split(',')) { const [k, v] = part.split(':').map((x) => x.trim()); if (['spawn', 'fork', 'execFile'].includes(k)) bare.set(v || k, k); }
      // B-147f (the read's MUST): a start handed IN — a function's parameter named spawn / fork / execFile (destructured, or by
      // position: the agent's stream and sound modules get child_process's own from agentd.js) is that form in this file
      for (const m of src.matchAll(/\(\s*\{([^{}]*)\}\s*(?:=\s*\{\s*\})?\s*\)/g)) for (const part of m[1].split(',')) { const k = part.split(/[:=]/)[0].trim(), al = (/:\s*([A-Za-z_$][\w$]*)/.exec(part) || [])[1]; if (['spawn', 'fork', 'execFile'].includes(k)) bare.set(al || k, k); }
      for (const m of src.matchAll(/(?:\bfunction\b[^(]*\(([^)]*)\)|\(([^()]*)\)\s*=>)/g)) for (const part of String(m[1] || m[2] || '').split(',')) { const k = part.split('=')[0].trim(); if (['spawn', 'fork', 'execFile'].includes(k)) bare.set(k, k); }
      // an alias is the form it names: a default `spawnImpl = spawn`, `x = opts.spawn || spawn`, `x = cp.spawn` (the injected doors)
      const forms = new Map(bare); for (const n of ns) for (const f of ['spawn', 'fork', 'execFile']) forms.set(n + '.' + f, f);
      for (const [name, form] of [...forms]) for (const m of src.matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*=\\s*(?:[^;,()\\n]*?(?:\\|\\||\\?\\?)\\s*)?${name.replace(/[$.]/g, (ch) => '\\' + ch)}\\b(?!\\s*\\()`, 'g'))) if (!forms.has(m[1]) && m[1] !== name) { bare.set(m[1], form); forms.set(m[1], form); }
      const calls = [];
      for (const m of src.matchAll(new RegExp(`${CPQ}\\.(spawn|fork|execFile)\\(`, 'g'))) calls.push({ at: m.index, form: m[1] });
      for (const n of ns) for (const m of src.matchAll(new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\.(spawn|fork|execFile)\\(`, 'g'))) calls.push({ at: m.index, form: m[1] });
      for (const [name, form] of bare) for (const m of src.matchAll(new RegExp(`(?<![.\\w$])${name.replace(/\$/g, '\\$')}\\(`, 'g'))) if (!/\bfunction\s*$/.test(src.slice(Math.max(0, m.index - 12), m.index))) calls.push({ at: m.index, form });
      for (const c of calls) {
        const back = src.slice(Math.max(0, c.at - 300), c.at).split(';').pop(), line = src.slice(0, c.at).split('\n').length, site = `${rel}:${line}`;
        if (/(?:\breturn|=>)\s*$/.test(back) || /[(,]\s*$/.test(back)) { out.push({ site, form: c.form, handed: true, bad: false }); continue; }
        const a = /([A-Za-z_$][\w$]*)\s*=\s*(?:[^;=]*?[?:]\s*)?$/.exec(back), v = a ? a[1] : null;
        let win = src.slice(c.at, c.at + 4000);
        if (v) { const re = new RegExp(`\\b(?:const|let|var)\\s+${v.replace(/\$/g, '\\$')}\\b`); const k = win.slice(1).search(re); if (k >= 0) win = win.slice(0, k + 1); }   // the start's own scope: up to the name's next declaration
        let lis = -1, first = -1;
        if (v) {
          const al = [...win.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${v.replace(/\$/g, '\\$')}\\s*;`, 'g'))].map((m) => m[1]);
          const V = `(?:${[v, ...al].map((x) => x.replace(/\$/g, '\\$')).join('|')})`;   // B-147f: the child under its alias too (`const me = child;`)
          lis = win.search(new RegExp(`\\b${V}\\.(?:on|once|addListener)\\('error'`));
          // a TOUCH: a member read on a pipe (x.stdout.on — `?.` is guarded), a stdio slot (x.stdio[3]), or a pipe handed as a call's
          // first argument (count(x.stdout), r.pipe(w.stdin)) — never a pipe listed in an array (each then checked by the reader)
          const touch = new RegExp(`\\b${V}\\.(?:stdout|stdin|stderr)\\s*\\.(?!\\?)|\\b${V}\\.stdio\\s*\\[|\\(\\s*${V}\\.(?:stdout|stdin|stderr)\\s*[),]`, 'g');
          const guard = new RegExp(`if \\((?:[^)\\n]*(?:&&|\\|\\|)\\s*)?!?${V}\\.std|${V}\\.std\\w* &&`);
          let t;
          while ((t = touch.exec(win))) {
            const lineStart = win.lastIndexOf('\n', t.index) + 1, upto = win.slice(lineStart, t.index + t[0].length), post = win.slice(t.index, t.index + 240).split('\n')[0];
            if (guard.test(upto) || (/\btry \{/.test(upto) && /\}\s*catch\b/.test(post))) continue;
            first = t.index; break;
          }
        }
        // THE KILL LAW (cure 4): a catch in the start's OWN flow (no function opened between the start and it — a callback runs later,
        // when a failed start's handle is gone) that signals a child names a real pid on that line: a start that failed in the same
        // tick has no pid, and its kill went to whatever that slot held (0: the hub's own process group)
        const killNoPid = [];
        for (const m of win.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)) {
          if (deferred(win.slice(0, m.index))) continue;
          const body = blockAt(win, m.index + m[0].length - 1);
          for (const t of body.matchAll(/\b([A-Za-z_$][\w$]*)\.kill\(/g)) { if (t[1] === 'process') continue; const ls = body.lastIndexOf('\n', t.index) + 1, le = body.indexOf('\n', t.index); if (!new RegExp(`\\b${t[1].replace(/\$/g, '\\$')}\\.pid\\b`).test(body.slice(ls, le < 0 ? undefined : le))) killNoPid.push(t[1]); }
        }
        // B-147f: NOTHING that can throw stands between a spawn / fork and its listener — a synchronous fs call there (it throws EMFILE
        // on the very table that failed the start) skips the listener as a pipe read does; read in the start's OWN block (a sibling
        // branch never runs after it), a call inside a one-line try is guarded
        let syncFirst = false;
        if (c.form !== 'execFile' && v && lis > 0) {
          const seg = win.slice(0, lis); let depth = 0;
          for (let k = 0; k < seg.length && !syncFirst; k++) {
            const ch = seg[k];
            if (ch === '{') depth++;
            else if (ch === '}') { if (--depth < 0) break; }
            else if (depth === 0 && ch === 'f' && /^fs\.\w+Sync\(/.test(seg.slice(k, k + 48)) && !/[\w$.]/.test(seg[k - 1] || ' ')) {
              const ls = seg.lastIndexOf('\n', k) + 1, le = win.indexOf('\n', k), line = win.slice(ls, le < 0 ? undefined : le), at = k - ls;
              if (!(/\btry \{/.test(line.slice(0, at)) && /\}\s*catch\b/.test(line.slice(at)))) syncFirst = true;
            }
          }
        }
        out.push({ site, form: c.form, v, killNoPid, syncFirst, bad: killNoPid.length > 0 || syncFirst || (c.form === 'execFile' ? first >= 0 : (!v || lis < 0 || (first >= 0 && first < lis))) });
      }
      return out;
    }
    const RAW = new Map(), BLANK = new Map();   // a module read and blanked ONCE: the require walk and the census share it
    const walk = (root) => {
      const seen = new Set(), todo = [root];
      while (todo.length) {
        const rel = todo.pop(); if (seen.has(rel)) continue; let src; try { src = fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { continue; } seen.add(rel);
        RAW.set(rel, src); BLANK.set(rel, blank(src));
        for (const m of BLANK.get(rel).matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
          const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
          const hit = [base, base + '.js', base + '/index.js'].find((c) => /\.c?js$/.test(c) && fs.existsSync(path.join(REPO, c)) && fs.statSync(path.join(REPO, c)).isFile());
          if (hit) todo.push(hit);
        }
      }
      return [...seen].sort();
    };
    // B-147f: the device agent's own module set too (the require graph from src/agentd/agentd.js — its bundle): a start that ends
    // the agent ends every link of that machine (its supervisor may bring it back, or nothing does: a Windows logon task, a bare start)
    const hubMods = walk('server.js'), agentMods = walk('src/agentd/agentd.js');
    const mods = [...new Set([...hubMods, ...agentMods])].sort(), sites = mods.flatMap((r) => sitesOf(r, RAW.get(r), BLANK.get(r)));
    const rd = (r) => RAW.get(r) ?? fs.readFileSync(path.join(REPO, r), 'utf8');
    // THE NAMED DEBT (主开发 20:53Z, road (b)): scripts/fixtures/spawn-listener-debt.json — the sites whose listener comes after a pipe
    // touch, a count a file that only FALLS (the founding sums below are this commit's: raising one is an edit here too), and the
    // starts that only SURVIVE (one listener, the journal line: «the hub survives; the road's own failure words owed») — each
    // file's survival lines counted and each still holding its listener on its line
    const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/spawn-listener-debt.json'), 'utf8')), DEBT = FIX.pipeFirst, SURV = FIX.survives;
    // FOUNDING, a count a FILE (cure 3, the read's SHOULD: a sum let one file grow while another fell): raising one is an edit here
    const FOUNDING = {
      pipeFirst: { 'src/routes/files.js': 3, 'src/machine-mounts.js': 2, 'src/remote-fs.js': 1 },   // B-147f: desktop-display (2) and node-runtime (1) cured — out
      survives: { 'src/mounts.js': 2, 'src/plugins/frp.js': 1, 'src/plugins/tailscale.js': 2, 'src/vnc.js': 1, 'src/routes/files.js': 4, 'src/remote-fs.js': 1, 'src/claude-oat-probe.js': 1, 'src/device-mount.js': 1 },
    };
    const SURV_MARK = 'ckpt61 cure 2: the hub survives a start that fails';
    const bad = sites.filter((x) => x.bad).map((x) => x.site);
    const newBad = bad.filter((x) => !DEBT.some((d) => x.startsWith(d.file + ':') && d.n > 0)), debtNow = Object.fromEntries(DEBT.map((d) => [d.file, bad.filter((x) => x.startsWith(d.file + ':')).length]));
    // the survival lines are counted in EVERY hub module (a new survive-only start in a file the fixture does not name is red)
    const marked = mods.map((r) => { const lines = rd(r).split('\n').filter((l) => l.includes(SURV_MARK)); return { file: r, now: lines.length, held: lines.filter((l) => /\.on\('error', \(e\) => console\.warn\(/.test(l)).length }; }).filter((x) => x.now > 0);
    const survNow = SURV.map((r) => ({ file: r.file, n: r.n, ...(marked.find((x) => x.file === r.file) || { now: 0, held: 0 }) }));
    const unnamedSurv = marked.filter((x) => !SURV.some((r) => r.file === x.file)).map((x) => x.file);
    const survOk = survNow.every((r) => r.now === r.n && r.held === r.n) && !unnamedSurv.length
      && DEBT.every((d) => FOUNDING.pipeFirst[d.file] != null && d.n <= FOUNDING.pipeFirst[d.file]) && SURV.every((r) => FOUNDING.survives[r.file] != null && r.n <= FOUNDING.survives[r.file]);
    const planted = {
      'a namespaced spawn, its pipe first': "const cp = require('child_process');\nfunction f() { const c = cp.spawn('x', [], { stdio: 'pipe' }); c.stdout.on('data', () => {}); c.on('error', () => {}); }",
      'an inline spawn, no listener': "function f() { const c = require('child_process').spawn('x', [], { stdio: 'ignore' }); c.unref(); }",
      'a fork, its pipe first': "const { fork } = require('child_process');\nfunction f() { const w = fork('w.js', [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }); w.stdout.on('data', () => {}); w.on('error', () => {}); }",
      'an execFile, its stdin unguarded': "const { execFile } = require('child_process');\nfunction f() { const c = execFile('x', [], () => {}); c.stdin.end('y'); }",
      'a stdio slot read first': "const { spawn } = require('child_process');\nfunction f() { const x = spawn('x', [], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] }); x.stdio[3].on('data', () => {}); x.on('error', () => {}); }",
      'a pipe handed on before the listener': "const { spawn } = require('child_process');\nfunction f(r) { const w = spawn('x', [], { stdio: 'pipe' }); r.pipe(w.stdin); w.on('error', () => {}); }",
      'a catch that signals a child with no pid check': "const { spawn } = require('child_process');\nfunction f() { let c; try { c = spawn('x', []); c.on('error', () => {}); more(); } catch (e) { c.kill('SIGTERM'); } }",
      'a start handed in as a parameter, its pipe first': "function f({ platform, spawn }) { const c = spawn('x', [], { stdio: 'pipe' }); c.stdout.on('data', () => {}); c.on('error', () => {}); }",
      'a meta write between a start and its listener': "const { spawn } = require('child_process'); const fs = require('fs');\nfunction f() { const c = spawn('x', [], { stdio: 'ignore' }); fs.writeFileSync('m', String(c.pid)); c.on('error', () => {}); }",
      'a listener of ANOTHER child of the same name': "const { spawn } = require('child_process'); const fs = require('fs');\nfunction f(r) { const w = spawn('x', [], { stdio: 'pipe' }); r.pipe(w.stdin); }\nfunction g() { const w = fs.createWriteStream('p'); w.on('error', () => {}); }",
      'a start behind a «/*» in a string and a comment': "const { spawn } = require('child_process');\nconst ROUTE = '/files/*'; // a route /api/x/* serves it\nfunction f() { const c = spawn('x', [], { stdio: 'pipe' }); c.stdout.on('data', () => {}); }\n// */",
    };
    const keep = {
      'a start in a comment': "const { spawn } = require('child_process');\n// spawn(cmd) — its child.stdout.on(...) before c.on('error') would be the fault\nfunction f() { const c = spawn('x', [], { stdio: 'pipe' }); c.on('error', () => {}); if (c.stdout) c.stdout.on('data', () => {}); }",
      'a child handed on': "const { spawn } = require('child_process');\nfunction f(ran) { return new Promise((r) => { ran(spawn('x', [], { stdio: 'ignore' }), r); }); }",
      'a try-guarded pipe': "const cp = require('child_process');\nfunction f() { const c = cp.execFile('x', [], () => {}); if (c.stdin) c.stdin.on('error', () => {}); try { c.stdin.end('y'); } catch { } }",
      'a kill in a later callback (the failed start\'s handle is gone by then)': "const { spawn } = require('child_process');\nfunction f() { const c = spawn('x', []); c.on('error', () => {}); setTimeout(() => { try { c.kill(); } catch { c.kill('SIGKILL'); } }, 10); }",
      'a sync fs call in a SIBLING branch': "const { spawn } = require('child_process'); const fs = require('fs');\nfunction f(a) { let c; if (a) { c = spawn('x', []); } else { fs.mkdirSync('d'); c = spawn('y', []); } c.on('error', () => {}); }",
      'a one-line try around a sync close': "const { spawn } = require('child_process'); const fs = require('fs');\nfunction f(fd) { const c = spawn('x', [], { stdio: ['ignore', fd, fd] }); try { fs.closeSync(fd); } catch { } c.on('error', () => {}); }",
      'the listener on the child\'s alias, first': "const { spawn } = require('child_process');\nfunction f() { const child = spawn('x', []); const me = child; me.on('error', () => {}); if (me.stdout) me.stdout.on('data', () => {}); }",
      'pipes listed in an array': "const cp = require('child_process');\nfunction f() { const c = cp.spawn('x', []); for (const p of [c.stdin, c.stdout]) if (p) p.destroy(); c.on('error', () => {}); }",
    };
    const reds = [
      ...Object.entries(planted).map(([w, src]) => [w, sitesOf('planted.js', src).filter((x) => x.bad).length]),
      ['the starter (its pipe first)', sitesOf('src/server/child-starter.js', redStartSrc).filter((x) => x.bad).length], ['the old road (its pipes first)', sitesOf('src/server/child-starter.js', redDirectSrc).filter((x) => x.bad).length],
      ['the self-update (no listener)', sitesOf('src/server/ops-routes.js', anchored(rd('src/server/ops-routes.js'), /\n {4}child\.on\('error', \(e\) => \{\n/, '\n    child.on(\'exit\', (e) => {\n', 'class-ops')).filter((x) => x.bad).length],
      ['the local daemon start (no listener)', sitesOf('src/agentd/client.js', anchored(rd('src/agentd/client.js'), /\n {4}child\.on\('error', \(e\) => \{ this\._log\([^\n]*/, '', 'class-daemon')).filter((x) => x.bad).length],
      ['the desktop session X server (no listener: its display slot read first)', sitesOf('src/vnc.js', anchored(rd('src/vnc.js'), /\n {6}x\.on\('error', \(e\) => \{ console\.warn\(`\[vnc\][^\n]*/, '', 'class-vnc')).filter((x) => x.bad).length],
      ['the single-file copy writer (no listener; the later `const w` is another child)', sitesOf('src/routes/files.js', anchored(rd('src/routes/files.js'), "      w.on('error', (e) => { wErr = e; });\n", '', 'class-copy-writer')).filter((x) => x.bad && x.v === 'w').length],
      ['the folder copy catch (a child signalled with no pid check)', sitesOf('src/routes/files.js', anchored(rd('src/routes/files.js'), 'Number.isInteger(c.pid) && c.pid > 0 && ', '', 'class-copy-kill')).some((x) => x.killNoPid && x.killNoPid.length) ? 1 : 0],
      ["the agent's pipe conversation (its meta written before its listener)", sitesOf("src/agentd/agentd.js", anchored(rd("src/agentd/agentd.js"), "    child.on('error', (e) => { sayEnd(String(e && e.message || e)); log(`pipe-session ${sid} spawn error: ${e && e.message}`); });\n    child.unref();\n", "    child.unref();\n    fs.writeFileSync(P2.meta, '{}');\n    child.on('error', (e) => { sayEnd(String(e && e.message || e)); log(`pipe-session ${sid} spawn error: ${e && e.message}`); });\n", "b147f-0")).filter((x) => x.bad).length > 0 ? 1 : 0],
      ["the agent's successor (no listener)", sitesOf("src/agentd/agentd.js", anchored(rd("src/agentd/agentd.js"), "  child.on('error', (e) => log(`the successor could not be started: ${(e && e.code) || e}`));\n", "", "b147f-1")).filter((x) => x.bad).length > 0 ? 1 : 0],
      ["the agent's stream child (its pipe first)", sitesOf("src/agentd/agentd.js", anchored(rd("src/agentd/agentd.js"), "          child.on('error', () => { });\n          if (!child.stdout || !child.stderr || !child.stdin) {", "          if (false) {", "b147f-2")).filter((x) => x.bad).length > 0 ? 1 : 0],
      ["the agent's stdio bridge (no listener)", sitesOf("src/agentd/agentd.js", anchored(rd("src/agentd/agentd.js"), "        child.on('error', (e) => { process.stderr.write(`vibespace-device --stdio: the daemon could not be started (${(e && e.code) || e})\\n`); });\n", "", "b147f-3")).filter((x) => x.bad).length > 0 ? 1 : 0],
      ["the RDP trust run (its pipes first)", sitesOf("src/desktop-display.js", anchored(rd("src/desktop-display.js"), "    child.on('error', (e) => finish(null, null, `not started: ${e.message}`));\n    child.on('close', (code, signal) => finish(code, signal));\n    const keep = (b) => { if (size < 65536) { chunks.push(b); size += b.length; } };\n    if (child.stdout) child.stdout.on('data', keep); if (child.stderr) child.stderr.on('data', keep);\n", "    const keep = (b) => { if (size < 65536) { chunks.push(b); size += b.length; } };\n    child.stdout.on('data', keep); child.stderr.on('data', keep);\n    child.on('error', (e) => finish(null, null, `not started: ${e.message}`));\n    child.on('close', (code, signal) => finish(code, signal));\n", "b147f-4")).filter((x) => x.bad).length > 0 ? 1 : 0],
      ["the node runtime's child (its pipes first)", sitesOf("src/node-runtime.js", anchored(rd("src/node-runtime.js"), "    child.on('error', (e) => { take(String(e && e.message)); end(-1); });\n    child.on('close', (code) => end(code == null ? -1 : code));\n    if (child.stdout) child.stdout.on('data', take); if (child.stderr) child.stderr.on('data', take);\n", "    child.stdout.on('data', take); child.stderr.on('data', take);\n    child.on('error', (e) => { take(String(e && e.message)); end(-1); });\n    child.on('close', (code) => end(code == null ? -1 : code));\n", "b147f-5")).filter((x) => x.bad).length > 0 ? 1 : 0],
      ["the window helper (its pipes first)", sitesOf("src/agentd/stream-window-source.js", anchored(rd("src/agentd/stream-window-source.js"), "      c.on('error', (e) => { procs.delete(c); if (!c.asked) finish('helper_missing', `the window helper did not start (${e && (e.code || e.message)})`); });   // B-147f: the listener first\n", "", "b147f-m0")).filter((x) => x.bad).length > 0 ? 1 : 0],
      ["the sound helper (its pipes first)", sitesOf("src/desktop-sound.js", anchored(rd("src/desktop-sound.js"), "      hc.on('error', (e) => { hcErr = e; });   // B-147f: heard at once (the promise below answers it in its own words); its pipes guarded\n      r.helper = hc;\n      if (hc.stdin) hc.stdin.on('error', () => { });\n      if (hc.stdout) hc.stdout.pipe(enc.stdin);\n", "      r.helper = hc;\n      hc.stdin.on('error', () => { });\n      hc.stdout.pipe(enc.stdin);\n", "b147f-m1")).filter((x) => x.bad).length > 0 ? 1 : 0],
      ['the cache count (its pipe first)', sitesOf('src/mounts.js', anchored(rd('src/mounts.js'), "      c.on('error', end); c.on('close', end);\n      if (c.stdout) c.stdout.on(", "      c.stdout.on(", 'class-cache-count')).filter((x) => x.bad).length],
    ];
    const kept = Object.entries(keep).map(([w, src]) => [w, sitesOf('kept.js', src).filter((x) => x.bad).length]);
    ok(mods.length > 100 && mods.includes('src/agentd/client.js') && mods.includes('src/mounts.js') && agentMods.includes('src/agentd/agentd.js') && agentMods.includes('src/node-runtime.js') && sites.length > 100 && !newBad.length && DEBT.every((d) => debtNow[d.file] <= d.n) && survOk && reds.every(([, n]) => n === 1) && kept.every(([, n]) => n === 0),
      `the hub's ${hubMods.length} modules and the device agent's ${agentMods.length} (the require graphs from server.js and src/agentd/agentd.js; ${mods.length} in all) hold ${sites.length} starts (${sites.filter((x) => x.handed).length} handed on): every spawn / fork has its error listener before its first unguarded pipe touch, every execFile's pipes guarded${newBad.length ? '; NOT: ' + newBad.join(', ') : ''}; the named debt (a count a file only falls): ${DEBT.map((d) => `${d.file} ${debtNow[d.file]}/${d.n}`).join(', ')}; the starts that only survive (words owed): ${survNow.map((r) => `${r.file} ${r.held}/${r.n}`).join(', ')}; RED each planted break named once: ${reds.map(([w, n]) => `${w} ${n}`).join(' · ')}; never flagged: ${kept.map(([w, n]) => `${w} ${n}`).join(' · ')}`, { newBad, debtNow, survNow, unnamedSurv, reds, kept });
  }

} finally {
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
