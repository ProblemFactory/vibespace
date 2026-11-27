#!/usr/bin/env node
// LAW 6 IN agy-wrapper's STOP (fast — lane nl-starts, 主开发 r5494, a unit on B-b2d3's births follow): a person's Stop reaches the running
// agy BEFORE any disk call of the wrapper — the forward FIRST, and delivered at once.
//   data/bin/agy-wrapper.js's `case 'interrupt'` calls restartChild('stop', true) first for a dispatched turn; `now` closes the old process's
//   stdin with destroy() — end() reaches the kernel only at the loop's next turn, so a synchronous disk call after it would hold the EOF too.
//   THE PLANT: a module the wrapper's own node loads first (--require; its child, the fake agy, loads none) holds every append to the
//   wrapper's log while the leg's hold file exists — its witness (the held line) written first, «left» after, bounded 8 s. GREEN: the fake
//   agy's own EOF mark ($AGY_STUB_EOF_MARK) appears while the append is held; once it is let go the Stop's records come as before (the
//   cancelled turn's end, then its notice). REDs, each with its plant's witness: today's order (held in the notice's own line, no EOF) and
//   the order alone with end() (held in the restart's own line, no EOF). The three wrappers run side by side, each in its own folder.
// The leg signals only its own children, by their handles; the fake agy ends on its EOF and the restart's SIGTERM, or by the exit sweep
// while its birth reads `same` (read when the kernel listed it as a child of a wrapper this suite holds).
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
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok() was handed a ${typeof c} as its condition (arguments swapped, or not a verdict): ${n}`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
function editAnchor(text, from, to, file) {
  const n = String(text).split(String(from)).length - 1;
  if (n !== 1) ok(false, `ANCHOR (${file}): ${JSON.stringify(String(from)).slice(0, 100)} — found ${n} times, one meant: the copy is not the control it says`);
  return String(text).replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await sleep(20); return fn(); };
const realKill = process.kill.bind(process);
const PIt = require(path.join(REPO, 'src/proc-identity.js'));
const kids = [], grandkids = [];   // grandkids: [pid, start, boot] of a wrapper's stand-in CLI, ended at exit only while its birth reads same
process.on('exit', () => {
  for (const k of kids) if (k.exitCode === null && k.signalCode === null) { try { k.kill('SIGKILL'); } catch { } }   // by its handle, and only while it runs
  for (const [pid, start, boot] of grandkids) if (start && PIt.tokenVerdict(pid, start, boot) === 'same') { try { realKill(pid, 'SIGKILL'); } catch { } }
});
const ROOT = scratch('agy-stop-forward');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const M = mutantCopies('agy-stop-forward', REPO);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const env0 = (() => { const e = { ...process.env }; for (const k of Object.keys(e)) if (/^(VIBESPACE_|ACP_WEBUI_|AGY_|CODEX_WEBUI_|CLAUDE_CODE_)/.test(k)) delete e[k]; return { ...e, VIBESPACE_SKIP_AGENT_HOOKS: '1' }; })();
const recOf = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const verdict = (pid, start, boot) => PIt.tokenVerdict(Number(pid), typeof start === 'string' ? start : '', typeof boot === 'string' ? boot : '');
const kidsOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).map(Number).filter((n) => n > 1); } catch { return []; } };
// a grandchild is kept for the exit sweep only while the kernel lists it as a child of a process this suite HOLDS — its birth read then (the round's should, K7)
const holdGrandkid = (holder, pid) => { if (holder && kidsOf(holder.pid).includes(Number(pid))) grandkids.push([Number(pid), PIt.startToken(Number(pid)), PIt.bootToken()]); };

try {
  console.log('LAW 6 IN agy-wrapper\'s STOP (主开发 r5494): the forward reaches the old child while the Stop\'s log append is HELD (a stall placed in that append)');
  const STALL = path.join(ROOT, 'log-stall.cjs');
  fs.writeFileSync(STALL, [
    "const fs = require('fs');",
    'const FILE = process.env.VS_LOG_STALL_FILE, HOLD = process.env.VS_LOG_STALL_HOLD, WIT = process.env.VS_LOG_STALL_WITNESS;',
    'const real = fs.appendFileSync, cell = new Int32Array(new SharedArrayBuffer(4));',
    'fs.appendFileSync = function (p, data, ...rest) {',
    '  if (FILE && HOLD && WIT && String(p) === FILE && fs.existsSync(HOLD)) {',
    "    try { fs.writeFileSync(WIT, 'held ' + String(data)); } catch { }",
    '    const end = Date.now() + 8000;',
    '    while (fs.existsSync(HOLD) && Date.now() < end) Atomics.wait(cell, 0, 0, 10);',
    "    try { real.call(fs, WIT, '\\nleft'); } catch { }",
    '  }',
    '  return real.call(fs, p, data, ...rest);',
    '};',
    ''].join('\n'));
  const RED_WINDOW_MS = 800;   // a red's claim: no EOF for this long while the append is held (the green's EOF comes within its first reads)
  const held = async (script, tag, green) => {
    const d = path.join(ROOT, tag); fs.mkdirSync(d, { recursive: true });
    const id = 'sess-' + tag, meta = path.join(d, id + '.json'), buf = path.join(d, id + '.buf');
    const hold = path.join(d, 'hold'), wit = path.join(d, 'held'), eof = path.join(d, 'eof');
    const k = spawn(process.execPath, ['--require', STALL, script, buf, meta, path.join(REPO, 'scripts/fixtures/antigravity-agy')], { cwd: d, stdio: ['pipe', 'ignore', 'ignore'],
      env: { ...env0, HOME: d, AGY_WEBUI_CWD: d, AGY_WEBUI_BACKEND: 'antigravity', AGY_WEBUI_AUTH_GRACE_MS: '400', AGY_STUB_SLOW_MS: '5000', AGY_STUB_LOG: path.join(d, 'stub.log'), AGY_STUB_EOF_MARK: eof,
        VS_LOG_STALL_FILE: path.join(d, 'agy-wrapper.log'), VS_LOG_STALL_HOLD: hold, VS_LOG_STALL_WITNESS: wit } });
    kids.push(k);
    await until(() => { const r = recOf(meta); return r && Number(r.childPid) > 1 && r.childStart; }, 8000);
    k.stdin.write(JSON.stringify({ type: 'chat-input', text: 'run the slow driver', msgId: 'u-held' }) + '\n');   // a dispatched turn held open 5 s: the Stop comes inside it
    await until(() => fs.existsSync(path.join(d, 'stub.log')) && /slow driver/.test(fs.readFileSync(path.join(d, 'stub.log'), 'utf8')), 5000);
    await until(() => { const r = recOf(meta); return r && kidsOf(k.pid).includes(Number(r.childPid)) && verdict(r.childPid, r.childStart, r.childBoot) === 'same'; }, 3000);
    const old = recOf(meta) || {};
    holdGrandkid(k, old.childPid);
    const eofBefore = fs.existsSync(eof);
    fs.writeFileSync(hold, '');   // THE STALL ARMED: from now on every append to the wrapper's log is held until the leg lets it go
    k.stdin.write(JSON.stringify({ type: 'interrupt' }) + '\n');   // the person's Stop
    const inHold = await until(() => fs.existsSync(wit), 4000);   // the plant's witness: the wrapper is INSIDE a held append
    // the forward, as the old child saw it (its own EOF mark) — read while the append is still held: the hold file there, no «left»
    let eofSeen = false;
    for (const end = Date.now() + RED_WINDOW_MS; inHold && Date.now() < end;) { if (fs.existsSync(eof)) { eofSeen = true; break; } await sleep(20); }
    const w = inHold ? fs.readFileSync(wit, 'utf8') : '';
    const stillHeld = fs.existsSync(hold) && !w.includes('\nleft');
    fs.rmSync(hold, { force: true });   // THE RELEASE
    // after it (the green only) the Stop says all it said before: the cancelled turn's end, then its notice, in the persisted buffer
    const ended = (b) => /"kind":"prompt_end"[^\n]*"stopReason":"cancelled"/.test(b) && b.includes('"noticeKind":"stop-restart"');
    const bufOf = () => { try { return fs.readFileSync(buf, 'utf8'); } catch { return ''; } };
    const after = green ? await until(() => ended(bufOf()), 6000) : null;
    const b = bufOf();
    try { k.kill('SIGTERM'); } catch { }   // by its handle
    return { inHold, eofBefore, eofSeen, stillHeld, heldLine: w.split('\n')[0].slice(0, 160), after, inOrder: b.indexOf('"kind":"prompt_end"') >= 0 && b.indexOf('"kind":"prompt_end"') < b.indexOf('"noticeKind":"stop-restart"'), old: old.childPid };
  };
  const AGY = read('data/bin/agy-wrapper.js');
  const FWD = "      if (fwd) { fwd.cancelled = true; restartChild('stop', true); }\n";
  const NOTICE = "        notice('info', 'Stopped — Antigravity has no cancel in its stream, so its process was restarted on the same conversation; what the turn already did stays.', 'stop-restart');\n";
  const CLOSE_NOW = "  try { if (now) old.stdin.destroy(); else old.stdin.end(); } catch { }\n";
  // RED 1 — today's order (the release's): the turn's end, the notice and ITS log line first, the restart (by end()) last
  const today = editAnchor(editAnchor(AGY, FWD, "      if (fwd) fwd.cancelled = true;   // RED: the release's order — no forward here\n", 'data/bin/agy-wrapper.js'),
    NOTICE, NOTICE + "        restartChild('stop');   // RED: the release's order — the forward last, by end()\n", 'data/bin/agy-wrapper.js');
  // RED 2 — the order alone: the forward first, but by end(), whose EOF waits for the loop's next turn
  const orderOnly = editAnchor(AGY, CLOSE_NOW, "  try { old.stdin.end(); } catch { }   // RED: end() — the order alone\n", 'data/bin/agy-wrapper.js');
  const [g, r1, r2] = await Promise.all([
    held(path.join(REPO, 'data/bin/agy-wrapper.js'), 'held-g', true),
    held(M.write('data/bin/agy-wrapper.js', today, 'stop-today'), 'held-r1', false),
    held(M.write('data/bin/agy-wrapper.js', orderOnly, 'stop-end'), 'held-r2', false),
  ]);
  ok(g.inHold && g.stillHeld && !g.eofBefore && g.eofSeen && g.heldLine.includes('restart (stop)'),
    `LAW 6: the Stop's forward reached the old child (its stdin's EOF, by the child's own mark) while the wrapper was HELD inside its log append («${g.heldLine}»)`, g);
  ok(g.after === true && g.inOrder, '…and once the append is let go the Stop says all it said before — the cancelled turn\'s end, then its notice, in the persisted buffer', g);
  ok(r1.inHold && r1.stillHeld && !r1.eofSeen && r1.heldLine.includes('Stopped — Antigravity has no cancel'),
    `RED (today's order): held in the Stop's own notice line («${r1.heldLine}»), the old child sees NO EOF for ${RED_WINDOW_MS} ms — the Stop waits on the disk`, r1);
  ok(r2.inHold && r2.stillHeld && !r2.eofSeen && r2.heldLine.includes('restart (stop)'),
    `RED (the order alone, end()): held in the restart's own line, the old child sees NO EOF for ${RED_WINDOW_MS} ms — end() reaches the kernel only at the loop's next turn`, r2);
} catch (e) { fail++; console.error('  ✗ threw: ' + (e && e.stack || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
