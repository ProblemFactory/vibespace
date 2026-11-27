#!/usr/bin/env node
// EVERY WRAPPER KEEPS ITS OWN BIRTH AND ITS CHILD'S; THE RETIRE SIGNALS ONLY WHAT IT KNOWS IS ITS OWN AT THE SIGNAL (fast — row B-b2d3's
// births follow, lane nl-starts, 主开发 r5032 / r5367; the step-2 round's smalls, r5149, page shoulds-wbb65bc71-b2d3-s2).
//   ① THE FOUR WRAPPERS' BIRTHS — data/bin/pty-wrapper.js, acp-wrapper.js, agy-wrapper.js, codex-chat-wrapper.js, each started over a
//      stand-in CLI of ours: its first record carries pidStart + pidBoot, its child's record childStart + childBoot, and proc-identity's
//      tokenVerdict reads both `same` for THOSE very processes. REDs: a copy of each with no birth (the release's record) reads
//      `unknown-identity` — never signalled by the hub.
//   ② LAW 6 FOR agy-wrapper (r5238; the one of the four whose Stop starts a child): its Stop's restart ends the old child first and the
//      new child — and its two reads — come only after the old child's EXIT, placed by a STALL in that window (the fake agy's
//      $AGY_STUB_EXIT_DELAY_MS: stdin EOF, then exit after that long once its turn ended, SIGTERM ignored). RED: a copy whose restart starts the new child at
//      once — its record names a new child inside the window.
//   ③ THE SPAWN CENSUS (r5367 (1): «no spawn on a Stop's road» is a census, not a sentence): every call site of each wrapper's spawn, by
//      its text, with its road; no spawn inside a Stop handler but agy's restart, whose spawn waits for the old child's exit. RED: a
//      planted spawn in a Stop handler.
//   ④ THE RETIRE (src/server/boot-restore.js) over records of these shapes, through fake fuser / pgrep: a TERMINAL pair with both births
//      alive — kept, said, nothing signalled (RED: birth-less records — asked again); a birth-less wrapper number WAITED FOR before the
//      masters, bounded, off the loop, nothing signalled at its bound (r5367 (2); RED: a copy that signals it); a wrapper birth that is not
//      `same` LEAVES everything (RED: the step-2 reading); the decision READ AGAIN at the retire (RED: a copy without it); fuser's exit 1
//      WITH words, its exit 2, an unreadable holder's birth, no /proc, an EMFILE that is not ENOENT — each LEAVES (REDs: exit 1 read as
//      nobody, exit 2 read as nobody, any failure read as gone); the hub's own attach ended AFTER its unadopt (RED: the kill first); the
//      follow (r5494): leg ①'s reds read from RUNNING copies; computed reds for the silent exit (driven through runChild's road too), the
//      socket already gone and the unreadable record; the groups-only pass clears what it answered (two REDs); a leave after the first
//      touch says its card is gone; THE MASTERS LAW (r5523, (o)): only the master THIS session started — its wrapper's parent, proven
//      by the wrapper's birth — is signalled; another hub's master, a holder of a listener left open across exec and the holder behind an
//      unread parent are left and said (REDs: today's loop; a copy that never proves the parent); two unnamed cards told apart by their
//      harness and start, never a path.
// The legs signal only their own children (a grandchild — a wrapper's stand-in CLI — only while its recorded birth reads `same`).
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
const alive = (pid) => { try { realKill(pid, 0); return true; } catch { return false; } };
const PIt = require(path.join(REPO, 'src/proc-identity.js'));
const kids = [], grandkids = [];   // grandkids: [pid, start, boot] of a wrapper's stand-in CLI, ended at exit only while its birth reads same
process.on('exit', () => {
  for (const k of kids) if (k.exitCode === null && k.signalCode === null) { try { k.kill('SIGKILL'); } catch { } }   // by its handle, and only while it runs
  for (const [pid, start, boot] of grandkids) if (start && PIt.tokenVerdict(pid, start, boot) === 'same') { try { realKill(pid, 'SIGKILL'); } catch { } }
});
const ROOT = scratch('wrapper-births');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(path.join(ROOT, 'bin'), { recursive: true });
const M = mutantCopies('wrapper-births', REPO);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const BIRTH_LINE = "const birthOf = (pid) => { try { const start = PI && pid ? PI.startToken(pid) : ''; return start ? { start, boot: PI.bootToken() } : null; } catch { return null; } };\n";
const NO_BIRTH = "const birthOf = () => null;   // RED: the release's record — a pid with no birth\n";
const env0 = (() => { const e = { ...process.env }; for (const k of Object.keys(e)) if (/^(VIBESPACE_|ACP_WEBUI_|AGY_|CODEX_WEBUI_|CLAUDE_CODE_)/.test(k)) delete e[k]; return { ...e, VIBESPACE_SKIP_AGENT_HOOKS: '1' }; })();
const STANDIN = [process.execPath, ['-e', 'setInterval(() => { }, 1e5)', 'vs-births-standin']];
const recOf = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const verdict = (pid, start, boot) => PIt.tokenVerdict(Number(pid), typeof start === 'string' ? start : '', typeof boot === 'string' ? boot : '');
const kidsOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).map(Number).filter((n) => n > 1); } catch { return []; } };
// a grandchild is kept for the exit sweep only while the kernel lists it as a child of a process this suite HOLDS — its birth read then (the round's should, K7)
const holdGrandkid = (holder, pid) => { if (holder && kidsOf(holder.pid).includes(Number(pid))) grandkids.push([Number(pid), PIt.startToken(Number(pid)), PIt.bootToken()]); };

try {
  console.log('① THE FOUR WRAPPERS KEEP THEIR OWN BIRTH AND THEIR CHILD\'S, beside each pid, in the write that already carries it');
  const WRAPPERS = [
    { file: 'data/bin/pty-wrapper.js', env: {}, cli: STANDIN },
    { file: 'data/bin/acp-wrapper.js', env: { ACP_WEBUI_BACKEND: 'opencode' }, cli: STANDIN },
    { file: 'data/bin/agy-wrapper.js', env: { AGY_WEBUI_BACKEND: 'antigravity', AGY_WEBUI_AUTH_GRACE_MS: '400' }, cli: [path.join(REPO, 'scripts/fixtures/antigravity-agy'), []] },
    { file: 'data/bin/codex-chat-wrapper.js', env: {}, cli: STANDIN },
  ];
  const run = (script, w, tag) => {
    const d = path.join(ROOT, tag); fs.mkdirSync(d, { recursive: true });
    const id = 'sess-' + tag, buf = path.join(d, id + '.buf'), meta = path.join(d, id + '.json');
    const cwdKey = /acp-wrapper/.test(w.file) ? 'ACP_WEBUI_CWD' : /agy-wrapper/.test(w.file) ? 'AGY_WEBUI_CWD' : /codex/.test(w.file) ? 'CODEX_WEBUI_CWD' : null;
    const k = spawn(process.execPath, [script, buf, meta, w.cli[0], ...w.cli[1]], { cwd: d, stdio: ['pipe', 'ignore', 'ignore'], env: { ...env0, HOME: d, ...(cwdKey ? { [cwdKey]: d } : {}), ...w.env } });
    kids.push(k);
    return { k, meta };
  };
  const greens = WRAPPERS.map((w, i) => ({ w, ...run(path.join(REPO, w.file), w, `g${i}`) }));
  const reds = WRAPPERS.map((w, i) => ({ w, ...run(M.write(w.file, editAnchor(read(w.file), BIRTH_LINE, NO_BIRTH, w.file), `no-birth-${i}`), w, `r${i}`) }));
  const started = await until(() => [...greens, ...reds].every((x) => { const r = recOf(x.meta); return r && Number(r.childPid) > 1; }), 8000);
  ok(started === true, 'every copy STARTED and wrote its record naming a child (green and red alike — a red is read from a running copy)');
  const shapes = {};
  for (const g of greens) {
    const r = recOf(g.meta) || {};
    holdGrandkid(g.k, r.childPid);
    shapes[g.w.file] = Object.keys(r);
    ok(r.pid === g.k.pid && verdict(r.pid, r.pidStart, r.pidBoot) === 'same' && Number(r.childPid) > 1 && verdict(r.childPid, r.childStart, r.childBoot) === 'same',
      `${g.w.file}: its record names its own pid with a birth that reads \`same\` for it, and its child's pid with ITS birth (\`same\`) — the hub can prove both by one clock`, { rec: { pid: r.pid, pidStart: r.pidStart, childPid: r.childPid, childStart: r.childStart }, wrapper: g.k.pid });
  }
  for (const x of reds) {
    const r = recOf(x.meta) || {};
    const running = r.pid === x.k.pid && x.k.exitCode === null && x.k.signalCode === null && Number(r.childPid) > 1 && kidsOf(x.k.pid).includes(Number(r.childPid));   // its OWN number, and a child the kernel lists as its own
    holdGrandkid(x.k, r.childPid);
    ok(running && !r.pidStart && !r.childStart && verdict(r.pid, r.pidStart, r.pidBoot) === 'unknown-identity' && verdict(r.childPid, r.childStart, r.childBoot) === 'unknown-identity',
      `RED (${x.w.file}): a RUNNING copy with the release's record — its own pid and a child of its own named — keeps no birth: both read \`unknown-identity\` (never signalled)`, { running, pid: r.pid, wrapper: x.k.pid, childPid: r.childPid, pidStart: r.pidStart, childStart: r.childStart });
  }
  for (const x of [...greens, ...reds]) { try { x.k.kill('SIGTERM'); } catch { } }

  console.log('② LAW 6 FOR agy-wrapper: its Stop\'s restart reads the new child\'s birth only after the old child\'s EXIT (a stall placed in the window)');
  {
    const STALL_MS = 800, TURN_MS = 600;   // the fake agy's own constants: its turn's length and its exit's delay after stdin's end (SIGTERM ignored)
    const stall = async (script, tag) => {
      const d = path.join(ROOT, tag); fs.mkdirSync(d, { recursive: true });
      const id = 'sess-' + tag, meta = path.join(d, id + '.json');
      const k = spawn(process.execPath, [script, path.join(d, id + '.buf'), meta, path.join(REPO, 'scripts/fixtures/antigravity-agy')], { cwd: d, stdio: ['pipe', 'ignore', 'ignore'],
        env: { ...env0, HOME: d, AGY_WEBUI_CWD: d, AGY_WEBUI_BACKEND: 'antigravity', AGY_WEBUI_AUTH_GRACE_MS: '400', AGY_STUB_SLOW_MS: String(TURN_MS), AGY_STUB_EXIT_DELAY_MS: String(STALL_MS), AGY_STUB_LOG: path.join(d, 'stub.log') } });
      kids.push(k);
      await until(() => { const r = recOf(meta); return r && Number(r.childPid) > 1 && r.childStart; }, 8000);
      { const r0 = recOf(meta) || {}; holdGrandkid(k, r0.childPid); }
      k.stdin.write(JSON.stringify({ type: 'chat-input', text: 'run the slow driver', msgId: 'u-slow' }) + '\n');   // a dispatched turn that ends (600 ms): the old child's EOF exit then waits 800 ms
      await until(() => fs.existsSync(path.join(d, 'stub.log')) && /slow driver/.test(fs.readFileSync(path.join(d, 'stub.log'), 'utf8')), 5000);   // the turn reached a child
      // THE child that holds the turn (the wrapper may have started another than its first by now): read from its record once it names a
      // living child by its own birth — that is the process the Stop's restart must end before the next one starts
      // …proven, not waited for: the record names the child the kernel lists as the wrapper's own NOW (the round's should: no settle)
      await until(() => { const r = recOf(meta); return r && kidsOf(k.pid).includes(Number(r.childPid)) && verdict(r.childPid, r.childStart, r.childBoot) === 'same'; }, 3000);
      const old = recOf(meta) || {};
      holdGrandkid(k, old.childPid);
      const t0 = Date.now();
      k.stdin.write(JSON.stringify({ type: 'interrupt' }) + '\n');   // the person's Stop: the old child's stdin is closed (the forward); it ends its turn, then stalls 800 ms
      const inWindow = [];
      let exitAt = null;
      while (Date.now() - t0 < 6000) {
        const r = recOf(meta) || {};
        if (alive(Number(old.childPid))) inWindow.push(Number(r.childPid));   // every read while the old child still runs (the window)
        else if (exitAt === null) exitAt = Date.now();
        if (exitAt !== null && Number(r.childPid) !== Number(old.childPid) && r.childStart) break;
        await sleep(25);
      }
      const now = recOf(meta) || {};
      holdGrandkid(k, now.childPid);
      try { k.kill('SIGTERM'); } catch { }
      return { old, now, inWindow, exitAt, t0 };
    };
    const g = await stall(path.join(REPO, 'data/bin/agy-wrapper.js'), 'stop-g');
    // the stall was in force (its exit came at least half its own delay after the Stop), and every read in it named the OLD child
    ok(g.exitAt !== null && g.exitAt - g.t0 >= STALL_MS / 2 && g.inWindow.length > 0 && g.inWindow.every((p) => p === Number(g.old.childPid))
      && Number(g.now.childPid) !== Number(g.old.childPid) && verdict(g.now.childPid, g.now.childStart, g.now.childBoot) === 'same',
      `LAW 6: through the old child's stall (${g.exitAt !== null ? g.exitAt - g.t0 : '—'} ms after the Stop) the record still names the OLD child (${g.inWindow.length} reads in the window); the new child and its birth come after that exit`, { old: g.old.childPid, now: g.now.childPid, inWindow: [...new Set(g.inWindow)] });
    const AGY = read('data/bin/agy-wrapper.js');
    const ON_EXIT = "  old.once('exit', () => { restarting = false; if (!shuttingDown) startChild(); });\n";
    const r = await stall(M.write('data/bin/agy-wrapper.js', editAnchor(AGY, ON_EXIT, "  restarting = false; startChild();   // RED: the new child at once, inside the old one's stall\n", 'data/bin/agy-wrapper.js'), 'restart-at-once'), 'stop-r');
    ok(r.inWindow.some((p) => p !== Number(r.old.childPid)), `RED: a restart that starts the new child at once names a NEW child inside the old one's stall — its birth read before the old exit (${[...new Set(r.inWindow)].join(', ')})`);
  }

  console.log('③ THE SPAWN CENSUS: each wrapper\'s spawn call sites by text, each with its road — none on a Stop\'s road before its forward');
  {
    const CENSUS = {
      'data/bin/pty-wrapper.js': { fns: ['spawnChild'], sites: { 'spawnChild();': 'the wrapper\'s start', 'try { spawnChild(); } catch (err) {': 'a remote terminal\'s retry, after its child ENDED (onChildExit)' } },
      'data/bin/acp-wrapper.js': { fns: ['startChild'], sites: { 'startChild();': 'the wrapper\'s start (boot)' } },
      'data/bin/codex-chat-wrapper.js': { fns: ['startChild'], sites: { 'reconnectTimer = setTimeout(startChild, delay);': 'the REMOTE road\'s reconnect, after its ssh transport ENDED', 'startChild();': 'the wrapper\'s start (boot)' } },
      'data/bin/agy-wrapper.js': { fns: ['startChild', 'restartChild'], sites: {
        'if (!child) { if (!childEnding) startChild(); return; }': 'restartChild with NO child (nothing to end, nothing to forward)',
        "old.once('exit', () => { restarting = false; if (!shuttingDown) startChild(); });": 'restartChild: the new child on the OLD child\'s EXIT (after the forward)',
        'if (!child && !restarting && !shuttingDown && !childEnding) startChild();': 'a prompt with no process (a person\'s send)',
        'startChild();': 'the wrapper\'s start (boot)',
        'if (activePrompt) pendingRestart = pendingRestart || `rule ${d.rule}`; else restartChild(`rule ${d.rule}`);': 'a permission rule (resolveSoftDeny)',
        'restartChild(why);': 'stopRunningTurn',
        'if (pendingRestart && !activePrompt) { const why = pendingRestart; pendingRestart = null; restartChild(why); return; }': 'a pending restart at a turn\'s end',
        "restartChild(wantBypass ? 'allow and retry' : 'the retry\\'s bypass ends');": 'a retry\'s bypass',
        "else { notice('info', words + '.', 'command_applied'); restartChild(`${key} ${v}`); }": 'a setting applied',
        "if (retryBypass && !activePrompt?.opts?.retry) { retryBypass = false; restartChild('stop: the dropped retry\\'s bypass ends'); }": 'the Stop (a dropped retry\'s bypass) — restartChild: its spawn waits for the old child\'s exit',
        "if (fwd) { fwd.cancelled = true; restartChild('stop', true); }": 'the Stop, FIRST (law 6) — restartChild closes the old child\'s stdin at once; its spawn waits for that child\'s exit',
      } },
    };
    const sitesOf = (src, fns) => {
      const out = [];
      for (const raw of src.split('\n')) {
        const l = raw.replace(/\/\/.*$/, '').trim(); if (!l || l.startsWith('*') || l.startsWith('/*')) continue;
        for (const fn of fns) if (new RegExp('\\b' + fn + '\\b').test(l) && !new RegExp('^(async\\s+)?function\\s+' + fn + '\\b').test(l)) { out.push(l); break; }
      }
      return out;
    };
    const blockAt = (src, head) => { const a = src.indexOf(head); if (a < 0) return null; let i = src.indexOf('{', a + head.length - 1), depth = 0; for (let j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1); } return null; };
    const STOPS = { 'data/bin/acp-wrapper.js': "    case 'interrupt': {", 'data/bin/agy-wrapper.js': "    case 'interrupt': {", 'data/bin/codex-chat-wrapper.js': "  if (msg.type === 'interrupt') {" };
    for (const [file, c] of Object.entries(CENSUS)) {
      const src = read(file), got = sitesOf(src, c.fns), want = Object.keys(c.sites);
      const missing = want.filter((s) => !got.includes(s)), extra = got.filter((s) => !want.includes(s));
      ok(!missing.length && !extra.length && JSON.stringify([...got].sort()) === JSON.stringify([...want].sort()), `${file}: its spawn's ${got.length} call site(s), each with its road — ${want.map((s) => c.sites[s]).join(' · ')}`, { missing, extra });
      if (STOPS[file]) {
        const stop = blockAt(src, STOPS[file]) || '';
        const spawns = sitesOf(stop, ['startChild', 'spawnChild', 'spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']), restarts = sitesOf(stop, ['restartChild']);   // its reader's find: a raw start too
        ok(stop.length > 0 && !spawns.length && (file.endsWith('agy-wrapper.js') ? restarts.length === 2 : !restarts.length),
          `${file}: its Stop (${STOPS[file].trim()}) starts no child itself${file.endsWith('agy-wrapper.js') ? ' — only restartChild, whose spawn waits for the old child\'s exit' : ''}`, { spawns, restarts });
      }
    }
    const rs = blockAt(read('data/bin/agy-wrapper.js'), 'function restartChild(why, now = false) {') || '';
    ok(sitesOf(rs, ['startChild']).length === 2 && rs.includes("old.once('exit', () => { restarting = false; if (!shuttingDown) startChild(); });") && rs.includes("try { if (now) old.stdin.destroy(); else old.stdin.end(); } catch { }"),
      'agy-wrapper.js restartChild: the old child\'s stdin closed (the forward; a Stop\'s at once — test-agy-stop-forward), its spawn only on that child\'s exit — or at once when there is no child to end');
    const planted = read('data/bin/acp-wrapper.js').replace("    case 'interrupt': {", "    case 'interrupt': { startChild();");
    ok(sitesOf(blockAt(planted, "    case 'interrupt': {") || '', ['startChild']).length === 1 && sitesOf(planted, ['startChild']).length === 2, 'RED: a spawn planted in acp-wrapper\'s Stop handler is seen there, and as a census site with no road');
    ok(['pty-wrapper.js', 'acp-wrapper.js', 'agy-wrapper.js', 'codex-chat-wrapper.js'].every((f) => { const s = read('data/bin/' + f); return s.includes(BIRTH_LINE) && s.split('birthOf(child.pid)').length === 2 && s.split('birthOf(process.pid)').length === 2 && s.includes("meta.childStart = b ? b.start : ''; meta.childBoot = b ? b.boot : '';"); }),
      'each of the four: ONE guarded birth helper, its own birth read ONCE (its first record), its child\'s ONCE (with the pid, \'\' when unread — never left from an older child)');
    ok(Object.values(shapes).every((k) => ['pid', 'pidStart', 'pidBoot', 'childPid', 'childStart', 'childBoot'].every((x) => k.includes(x))), 'the four real records carry the six fields ④\'s records are shaped by', shapes);
    const pidSites = (f) => { const ls = read('data/bin/' + f).split('\n'); return ls.map((l, i) => [l.replace(/\/\/.*$/, ''), i]).filter(([l]) => /\bmeta\.childPid\s*=/.test(l)).map(([, i]) => ({ i, next: ls[i + 1] || '' })); };
    ok(['pty-wrapper.js', 'acp-wrapper.js', 'agy-wrapper.js', 'codex-chat-wrapper.js'].every((f) => { const at = pidSites(f); return at.length === 1 && at[0].next.includes('birthOf(child.pid)'); }),
      'each of the four writes `meta.childPid` at ONE site with its child\'s birth on the very next line (its reader\'s find: a respawn that skipped it would leave an older child\'s birth beside a new pid — read «ended»)');
  }

  console.log('④ THE RETIRE over these records: births decide, a number with no birth is waited for and never signalled, every refusal leaves');
  {
    const signals = []; process.kill = (pid, sig) => { if (sig !== 0 && sig !== undefined) signals.push([pid, sig]); return realKill(pid, sig); };
    const termsTo = (pid) => signals.filter(([q, s]) => q === pid && s === 'SIGTERM').length;
    fs.writeFileSync(path.join(ROOT, 'bin', 'fuser'), `#!/bin/sh\nd=${JSON.stringify(ROOT)}\nfor a; do last=$a; done\nm=$(cat "$d/mode-$(basename "$0")-$(basename "$last")" 2>/dev/null || cat "$d/mode-$(basename "$last")" 2>/dev/null || echo dead)\ncase "$m" in\n  alive) cat "$d/holders-$(basename "$last")" 2>/dev/null || cat "$d/alive-pid"; exit 0;;\n  blind) echo "Cannot stat file $last: No such file or directory" >&2; exit 1;;\n  err2) exit 2;;\nesac\nexit 1\n`, { mode: 0o755 });
    fs.copyFileSync(path.join(ROOT, 'bin', 'fuser'), path.join(ROOT, 'bin', 'pgrep')); fs.chmodSync(path.join(ROOT, 'bin', 'pgrep'), 0o755);
    const mode = (name, m) => fs.writeFileSync(path.join(ROOT, `mode-${name}`), m);
    const PATH0 = process.env.PATH; process.env.PATH = path.join(ROOT, 'bin') + ':' + PATH0;
    const live = (argv = 'vs-births-sleep') => { const v = spawn('sh', ['-c', `exec sleep 60 # ${argv}`], { stdio: 'ignore' }); kids.push(v); return v; };
    const stubborn = () => { const v = spawn('sh', ['-c', 'trap "" TERM; exec sleep 60'], { stdio: 'ignore' }); kids.push(v); return v; };
    const birth = (pid) => ({ start: PIt.startToken(pid), boot: PIt.bootToken() });
    const freshGone = () => { for (let i = 0; i < 20; i++) { const p = require('node:child_process').spawnSync('true').pid; if (p > 1 && !fs.existsSync('/proc/' + p)) return p; } return 0; };   // a number nothing holds NOW (re-read per leg: a number can be taken again)
    const master = () => { const v = live(); fs.writeFileSync(path.join(ROOT, 'alive-pid'), String(v.pid)); return v; };
    master();   // the fake fuser's alive answer names a process of ours from the first probe on
    const holders = (sock, pids) => fs.writeFileSync(path.join(ROOT, 'holders-' + sock), pids.join(' ') + '\n');
    // A SESSION's stand-ins (r5523): `sh` forks the wrapper stand-in and then execs into the master, so the master IS the wrapper's parent —
    // as a dtach master forks its program. The master is a process this leg spawned and holds (its handle); the wrapper's birth is read
    // only while the kernel lists it as that master's child. stubborn: the wrapper ignores SIGTERM
    const session = async ({ stubborn: deaf = false } = {}) => {
      const m = spawn('sh', ['-c', `${deaf ? '(trap "" TERM; exec sleep 60)' : 'sleep 60'} & exec sleep 61`], { stdio: 'ignore' }); kids.push(m);
      await until(() => kidsOf(m.pid).length > 0 && /sleep 61/.test((() => { try { return fs.readFileSync(`/proc/${m.pid}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { return ''; } })()), 3000);
      const w = kidsOf(m.pid)[0] || 0; holdGrandkid(m, w);
      return { m, w: { pid: w } };
    };
    const BRSRC = read('src/server/boot-restore.js');
    const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
    function instance(BRm, d, retireWaitMs = 300) {
      const SOCK = path.join(d, 'sockets'), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers');
      for (const x of [SOCK, META, BUF]) fs.mkdirSync(x, { recursive: true });
      const metaFile = (s) => path.join(META, s + '.json');
      const activeSessions = new Map(), notes = [], ended = [];
      const api = BRm.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
        activeSessions, sessionCounterRef: { value: 0 }, attachToDtach: (id, sp, s) => { s.pty = null; }, setupSessionPty: () => { },
        readSessionMeta: (s) => { try { return JSON.parse(fs.readFileSync(metaFile(s), 'utf8')); } catch { return {}; } },
        writeSessionMeta: (s, m) => fs.writeFileSync(metaFile(s), JSON.stringify(m)), deleteSessionMeta: (s) => { try { fs.unlinkSync(metaFile(s)); } catch { } },
        broadcastToSession: () => { }, broadcastActiveSessions: () => { }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { },
        getHosts: () => null, getDialBridge: () => null, getExitProxy: () => ({ onSessionEnd: (s, id) => ended.push(id) }), note: (l) => notes.push(l), retireWaitMs });
      const add = (n, meta, rec) => {
        const sock = `cw-${n}-${1760480000000 + n * 1000}`, id = 'sess-' + sock.slice(3);
        fs.writeFileSync(path.join(SOCK, sock), '');
        fs.writeFileSync(metaFile(sock), JSON.stringify({ webuiSessionId: id, cwd: '/srv/work/app', backend: 'claude', mode: 'terminal', createdAt: 1760480000000 + n * 1000, ...meta }));
        fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify({ mode: 'terminal', ...rec })); fs.writeFileSync(path.join(BUF, id + '.buf'), '$ ');
        mode(sock, 'alive');
        return { sock, id, sockPath: path.join(SOCK, sock), meta: metaFile(sock), side: path.join(BUF, id + '.json') };
      };
      return { api, activeSessions, notes, ended, add };
    }
    let seq = 0;
    const warned = [], warn0 = console.warn, log0 = console.log;
    console.warn = (...a) => { warned.push(a.join(' ')); };
    const said = (sock) => warned.filter((l) => l.includes(`] ${sock}: not retired — `));
    // a pair of one conversation: older + newer, each with its record (rec: the side file's pid / birth fields)
    const pair = (BRm, older, newer, { names = ['claude older', 'claude newer'], wait } = {}) => {
      const n = 100 + (seq += 2), X = instance(BRm, path.join(ROOT, 'r' + n), wait), cid = `5f0c2a8e-7d41-4b9a-9e36-0c1d2b3b0${n}`;
      const o = X.add(n, { claudeSessionId: cid, name: names[0] }, older), w = X.add(n + 1, { claudeSessionId: cid, name: names[1] }, newer);
      return { X, o, w };
    };
    const boot = async (p, between = null, after = null) => { console.log = () => { }; try { await p.X.api.probeSockets(); if (between) await between(); p.X.api.restoreSessions(); if (after) after(); } finally { console.log = log0; } };
    // a side file's reads from the Nth on answer `rec` (a string, or a function that throws): the probe's read is the first, the pair's
    // decision on the re-probe's road the second, the retire's record read the third, its recheck (right before the first touch) the fourth
    const reads = (side, from, rec, upto = Infinity) => { const n = { k: 0 }, rf0 = fs.promises.readFile; fs.promises.readFile = async (f, ...r) => { if (f === side && ++n.k >= from && n.k <= upto) return typeof rec === 'function' ? rec() : rec; return rf0.call(fs.promises, f, ...r); }; return () => { fs.promises.readFile = rf0; return n.k; }; };
    const childRec = (v) => ({ childPid: v.pid, childStart: birth(v.pid).start, childBoot: birth(v.pid).boot });
    const wrapRec = (v) => ({ pid: v.pid, pidStart: birth(v.pid).start, pidBoot: birth(v.pid).boot });
    const ended = () => ({ childPid: freshGone(), childStart: 'l1', childBoot: PIt.bootToken() });   // a birth that is not its own: proven ended
    const PAIR_SAID = (a, b) => `two cards of one conversation: ${a} and ${b} — both kept: each one's program runs or is not proven ended, and none is ended because of a pair; end the one you meant`;
    const copy = (from, to, tag) => require(M.write('src/server/boot-restore.js', editAnchor(BRSRC, from, to, 'src/server/boot-restore.js'), tag));

    // (a) A TERMINAL PAIR WITH BOTH BIRTHS ALIVE (pty-wrapper's record shape): kept, said once, nothing signalled, nothing left to ask
    const s0 = signals.length;
    const a1 = pair(BR, { ...wrapRec(live()), ...childRec(live()) }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(a1);
    ok(signals.length === s0 && a1.X.activeSessions.has(a1.o.id) && a1.X.activeSessions.has(a1.w.id) && a1.X.notes.filter((l) => l === PAIR_SAID('«claude older»', '«claude newer»')).length === 1 && !a1.X.api.probePending().has(a1.o.sock),
      'a TERMINAL pair whose two records carry births that read alive: both kept, said ONCE by their names, nothing signalled, nothing left to ask', a1.X.notes);
    const a2 = pair(BR, { pid: live().pid, childPid: live().pid }, { pid: live().pid, childPid: live().pid });
    await boot(a2);
    ok((a2.X.api.probePending().get(a2.o.sock) || []).includes('dedup') && signals.length === s0, 'RED (the release\'s birth-less records): the same terminal pair is NOT decided — asked again at the cadence, never signalled', [...a2.X.api.probePending()]);
    // (b) A WRAPPER NUMBER WITH NO BIRTH is waited for BEFORE the masters — bounded, off the loop; at its bound NOTHING is signalled, said once
    const wb = stubborn(), mb = master();
    const b1 = pair(BR, { pid: wb.pid, ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(b1, async () => { mode(`fuser-${b1.o.sock}`, 'dead'); });   // nobody listed: the wait itself is what is read
    await until(() => said(b1.o.sock).length > 0, 4000);
    ok(said(b1.o.sock).length === 1 && /still there 0\.3 s after its program ended — nothing signalled/.test(said(b1.o.sock)[0]) && termsTo(wb.pid) === 0 && termsTo(mb.pid) === 0 && alive(wb.pid) && alive(mb.pid) && fs.existsSync(b1.o.sockPath),
      'a birth-less wrapper of a proven-ended program: WAITED FOR (0.3 s here, 5 s in the hub), never signalled — and its socket\'s master not signalled, the socket in place, said once', said(b1.o.sock));
    ok(b1.X.activeSessions.has(b1.o.id) && (b1.X.api.probePending().get(b1.o.sock) || []).includes('dedup') && b1.X.notes.some((l) => l.startsWith('the card «claude older» (') && l.includes(`(${b1.o.sock}): not retired — `)),
      'that wait comes BEFORE anything of the session is touched: its CARD KEPT and judged again, the leave said in ⚙ Diagnostics too', { pending: [...b1.X.api.probePending()] });
    const SIGNAL_WATCHED = copy("    let left = await waitGone([], watched);\n", "    for (const x of watched) process.kill(x.pid, 'SIGTERM');   // RED: the number with no birth signalled\n    let left = await waitGone([], watched);\n", 'signals-watched');
    const wb2 = stubborn(); master();
    const b2 = pair(SIGNAL_WATCHED, { pid: wb2.pid, ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(b2, async () => { mode(`fuser-${b2.o.sock}`, 'dead'); }); await until(() => termsTo(wb2.pid) > 0, 3000);
    ok(termsTo(wb2.pid) === 1, 'RED: a copy that signals a number with no birth sends it a SIGTERM — a process the hub cannot prove its own');
    // (c) A WRAPPER BIRTH THAT IS NOT `same` (a birth this machine cannot read): LEFT, nothing signalled
    const wc = live(), mc = master();
    const c1 = pair(BR, { pid: wc.pid, pidStart: 'pThu Jan  1 00:00:00 2026', pidBoot: PIt.bootToken(), ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(c1); await until(() => said(c1.o.sock).length > 0, 3000);
    ok(said(c1.o.sock).length === 1 && /neither proven its own nor proven ended \(unknown\)/.test(said(c1.o.sock)[0]) && termsTo(mc.pid) === 0 && fs.existsSync(c1.o.sockPath), 'a wrapper birth that reads neither `same` nor ended (unknown): LEFT — its master not signalled, its socket in place, said once', said(c1.o.sock));
    const STEP2_WRAPPER = copy("        else if (!(v === 'pid-recycled' || v === 'zombie' || (v === 'gone' && (await procGone(Number(w.pid)))))) return leave(`its wrapper (pid ${w.pid}) is neither proven its own nor proven ended (${v})`);\n", '', 'step2-wrapper');
    const mc2 = master();
    const c2 = pair(STEP2_WRAPPER, { pid: live().pid, pidStart: 'pThu Jan  1 00:00:00 2026', pidBoot: PIt.bootToken(), ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(c2, async () => { mode(`fuser-${c2.o.sock}`, 'dead'); }); await until(() => !fs.existsSync(c2.o.sockPath), 3000);
    ok(termsTo(mc2.pid) === 0 && !fs.existsSync(c2.o.sockPath) && !fs.existsSync(c2.o.meta), 'RED: the step-2 reading (a birth not `same` = not held, go on): its socket, files and meta removed while that wrapper may live (the masters law alone keeps an unproven master unsignalled)');
    // (d) THE DECISION READ AGAIN RIGHT BEFORE THE RETIRE TOUCHES ANYTHING: the record names a living child from the retire's own reads
    // (its record read and its recheck) ⇒ LEFT — nothing signalled, the card KEPT and judged again
    const sd = await session(), md = sd.m, dl = live();
    const d1 = pair(BR, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) }); holders(d1.o.sock, [md.pid]);
    const undo1 = reads(d1.o.side, 3, JSON.stringify({ mode: 'terminal', ...wrapRec(sd.w), ...childRec(dl) }));
    try { await boot(d1); await until(() => said(d1.o.sock).length > 0, 3000); } finally { undo1(); }
    ok(said(d1.o.sock).length === 1 && /no longer proven ended at the retire \(alive\)/.test(said(d1.o.sock)[0]) && termsTo(md.pid) === 0 && fs.existsSync(d1.o.sockPath) && d1.X.activeSessions.has(d1.o.id) && (d1.X.api.probePending().get(d1.o.sock) || []).includes('dedup'),
      'the decision READ AGAIN right before anything is touched: a program alive by then is LEFT — nothing signalled, its socket in place, its CARD KEPT and judged again, said once', { said: said(d1.o.sock), pending: [...d1.X.api.probePending()] });
    const NO_RECHECK = copy('    if (recheck) {', '    if (false) {', 'no-recheck');
    const sd2 = await session(), md2 = sd2.m, dl2 = live();
    const d2 = pair(NO_RECHECK, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) }); holders(d2.o.sock, [md2.pid]);
    const undo2 = reads(d2.o.side, 3, JSON.stringify({ mode: 'terminal', ...wrapRec(sd2.w), ...childRec(dl2) }));
    try { await boot(d2); await until(() => termsTo(md2.pid) > 0, 3000); } finally { undo2(); }
    ok(termsTo(md2.pid) === 1, 'RED: a retire that trusts the decision SIGTERMs the master of a program alive by then');
    // (e) FUSER'S EXIT 1 WITH WORDS (it could not see the file), its EXIT 2, AN UNREADABLE HOLDER'S BIRTH: each LEAVES
    const fuserAfterProbe = (p, m) => async () => { mode(`fuser-${p.o.sock}`, m); };
    for (const [m, words] of [['blind', /not answered \(1: Cannot stat file/], ['err2', /not answered \(2\)/]]) {
      const e1 = pair(BR, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
      await boot(e1, fuserAfterProbe(e1, m)); await until(() => said(e1.o.sock).length > 0, 3000);
      ok(said(e1.o.sock).length === 1 && words.test(said(e1.o.sock)[0]) && fs.existsSync(e1.o.sockPath), `fuser ${m === 'blind' ? 'exits 1 WITH words (it could not stat the file)' : 'exits 2'}: no answer of who holds the socket — LEFT, said once`, said(e1.o.sock));
    }
    const ANY_ONE = copy('      if (said && !(await pathGone(socketPath))) return leave(', '      if (false) return leave(', 'words-as-nobody');
    const e3 = pair(ANY_ONE, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(e3, fuserAfterProbe(e3, 'blind')); await until(() => !fs.existsSync(e3.o.sockPath), 3000);
    ok(!fs.existsSync(e3.o.sockPath), 'RED: a retire that reads fuser\'s exit 1 WITH words as «nobody» removes a socket whose holders it never saw');
    const sh = await session(), mh = sh.m, ident0 = PIt.identityOf;
    PIt.identityOf = (pid, o) => (pid === mh.pid ? null : ident0(pid, o));
    try {
      const h1 = pair(BR, { ...wrapRec(sh.w), ...ended() }, { ...wrapRec(live()), ...childRec(live()) }); holders(h1.o.sock, [mh.pid]);
      await boot(h1); await until(() => said(h1.o.sock).length > 0, 3000);
      ok(said(h1.o.sock).length === 1 && /its socket is also held by pid \d+ \(sleep\), which this hub cannot prove it started/.test(said(h1.o.sock)[0]) && termsTo(mh.pid) === 0 && termsTo(sh.w.pid) === 0 && fs.existsSync(h1.o.sockPath), 'this session\'s master whose birth cannot be read is no proven master: LEFT, never signalled (nor its wrapper), said once by its number and name', said(h1.o.sock));
    } finally { PIt.identityOf = ident0; }
    // (f) NO /proc ON THIS MACHINE: no program is proven — the pair kept, asked again, nothing signalled (no `ps` asked for a birth)
    const hp0 = PIt.hasProc;
    const n1 = pair(BR, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    PIt.hasProc = () => false;
    try { await boot(n1); } finally { PIt.hasProc = hp0; }
    ok(n1.X.activeSessions.has(n1.o.id) && n1.X.activeSessions.has(n1.w.id) && fs.existsSync(n1.o.sockPath) && (n1.X.api.probePending().get(n1.o.sock) || []).includes('dedup'), 'no /proc on this machine: no program is proven — the pair kept, asked again, nothing signalled', [...n1.X.api.probePending()]);
    // …and an EMFILE that is not ENOENT proves nothing
    const access0 = fs.promises.access, g0 = freshGone();
    fs.promises.access = async (f, ...r) => { if (f === '/proc/' + g0) { const e = new Error('EMFILE: too many open files'); e.code = 'EMFILE'; throw e; } return access0.call(fs.promises, f, ...r); };
    try {
      const f1 = pair(BR, { childPid: g0 }, { ...wrapRec(live()), ...childRec(live()) });
      await boot(f1);
      ok((f1.X.api.probePending().get(f1.o.sock) || []).includes('dedup') && fs.existsSync(f1.o.sockPath), 'a /proc read that failed by EMFILE (not ENOENT) proves nothing: the number with no birth is NOT ended — the pair kept, asked again', [...f1.X.api.probePending()]);
      const ANY_FAIL = copy("async function pathGone(p) { try { await fs.promises.access(p); return false; } catch (e) { return !!e && e.code === 'ENOENT'; } }", "async function pathGone(p) { try { await fs.promises.access(p); return false; } catch (e) { return true; } }", 'any-failure-gone');
      const f2 = pair(ANY_FAIL, { childPid: g0 }, { ...wrapRec(live()), ...childRec(live()) });
      await boot(f2, async () => { mode(`fuser-${f2.o.sock}`, 'dead'); }); await until(() => !fs.existsSync(f2.o.sockPath), 3000);
      ok(!fs.existsSync(f2.o.sockPath), 'RED: a retire that reads any failed /proc read as «gone» retires the socket of a program it never proved ended');
    } finally { fs.promises.access = access0; }
    // (i) A CHILD PROVEN ENDED BESIDE A WRAPPER THAT HAS A LIVING CHILD (agy's restart: the new child spawned, its record not yet written):
    // its program started again — NOT ended: the pair kept, asked again, nothing signalled. RED: a copy that reads the dead child alone
    const childrenOf = kidsOf;
    const withKid = async () => { const v = spawn('sh', ['-c', 'sleep 60 & wait'], { stdio: 'ignore' }); kids.push(v); await until(() => childrenOf(v.pid).length > 0, 3000); for (const p of childrenOf(v.pid)) holdGrandkid(v, p); return v; };
    const wk = await withKid(), mi = master();
    const i1 = pair(BR, { ...wrapRec(wk), ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(i1); await sleep(100);
    ok(childrenOf(wk.pid).length > 0 && (i1.X.api.probePending().get(i1.o.sock) || []).includes('dedup') && termsTo(wk.pid) === 0 && termsTo(mi.pid) === 0 && fs.existsSync(i1.o.sockPath),
      'a child proven ended beside a wrapper that HAS a living child (a program started again — agy\'s restart): NOT ended — the pair kept, asked again, nothing signalled', [...i1.X.api.probePending()]);
    const CHILD_ALONE = copy("  return kids ? 'unknown' : 'dead';\n", "  return 'dead';   // RED: the dead child alone decides\n", 'child-alone');
    const wk2 = await withKid(); master();
    const i2 = pair(CHILD_ALONE, { ...wrapRec(wk2), ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(i2, async () => { mode(`fuser-${i2.o.sock}`, 'dead'); }); await until(() => termsTo(wk2.pid) > 0, 3000);
    ok(termsTo(wk2.pid) === 1, 'RED: a copy that reads the dead child alone SIGTERMs a wrapper whose program started again');
    // (j) FUSER'S SILENT EXIT 1 = NOBODY holds the socket: no master to signal — retired (and runChild keeps the program's own words apart)
    const j1 = pair(BR, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(j1, async () => { mode(`fuser-${j1.o.sock}`, 'dead'); }); await until(() => !fs.existsSync(j1.o.meta), 3000);
    ok(!fs.existsSync(j1.o.sockPath) && !fs.existsSync(j1.o.meta) && !j1.X.activeSessions.has(j1.o.id) && !said(j1.o.sock).length, 'fuser\'s SILENT exit 1 = nobody holds it: its socket, files and meta removed, its card gone — nothing left behind');
    const rc = await require(path.join(REPO, 'src/server/tls.js')).runChild('sh', ['-c', 'exit 1'], 2000);
    ok(rc.code === 1 && rc.stderr === '' && rc.err !== '', 'runChild keeps what the program itself said (`stderr`, empty here) apart from its error text (`err`: execFile\'s «Command failed») — a silent exit 1 says nothing', rc);
    // (k) fuser «cannot stat» a socket GONE by the kernel's word (its master removed it as it ended): nobody — its files and meta removed
    const k1 = pair(BR, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(k1, async () => { mode(`fuser-${k1.o.sock}`, 'blind'); }, () => { fs.unlinkSync(k1.o.sockPath); });
    await until(() => !fs.existsSync(k1.o.meta), 3000);
    ok(!fs.existsSync(k1.o.meta) && !k1.X.activeSessions.has(k1.o.id) && !said(k1.o.sock).length, 'fuser «cannot stat» a socket that is GONE (its master removed it as it ended): nobody holds it — its files and meta removed, never orphaned');
    // (l) A RECORD THAT CANNOT BE READ AT THE RETIRE (EMFILE; a torn write reads the same): LEFT — no master signalled while a wrapper may be unseen
    const ml = master();
    const l1 = pair(BR, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    const undoL = reads(l1.o.side, 3, () => { const e = new Error('EMFILE: too many open files'); e.code = 'EMFILE'; throw e; });
    try { await boot(l1); await until(() => said(l1.o.sock).length > 0, 3000); } finally { undoL(); }
    ok(said(l1.o.sock).length === 1 && /its record could not be read \(EMFILE\)/.test(said(l1.o.sock)[0]) && termsTo(ml.pid) === 0 && l1.X.activeSessions.has(l1.o.id), 'a record that cannot be read at the retire (EMFILE): LEFT — no master signalled while a wrapper may be unseen, its card kept, said once', said(l1.o.sock));
    // (j2) THE SILENT EXIT DRIVEN THROUGH runChild's ROAD (the start-time retire of a REMOTE pair's older transport, L4): nobody — retired, the
    // newer kept. RED: a retire that reads runChild's `err` (execFile's «Command failed») as the program's words leaves a socket nobody holds
    const remotePair = (BRm) => { const n = 100 + (seq += 2), X = instance(BRm, path.join(ROOT, 'r' + n)), cid = `5f0c2a8e-7d41-4b9a-9e36-0c1d2b3b0${n}`;
      const o = X.add(n, { claudeSessionId: cid, name: 'remote older', host: 'h-test' }, {}), w = X.add(n + 1, { claudeSessionId: cid, name: 'remote newer', host: 'h-test' }, {}); return { X, o, w }; };
    const j2 = remotePair(BR);
    await boot(j2, async () => { mode(`fuser-${j2.o.sock}`, 'dead'); }); await until(() => !fs.existsSync(j2.o.meta), 3000);
    ok(!fs.existsSync(j2.o.sockPath) && !fs.existsSync(j2.o.meta) && fs.existsSync(j2.w.sockPath) && !said(j2.o.sock).length, 'a REMOTE pair\'s older transport at the start (runChild\'s road): fuser\'s SILENT exit 1 = nobody — retired, the newer kept');
    const ERR_AS_WORDS = copy("      const said = String(typeof f.stderr === 'string' ? f.stderr : f.err || '').trim();", "      const said = String(f.err || '').trim();   // RED: execFile's «Command failed» read as the program's words", 'err-as-words');
    const j3 = remotePair(ERR_AS_WORDS);
    await boot(j3, async () => { mode(`fuser-${j3.o.sock}`, 'dead'); }); await until(() => said(j3.o.sock).length > 0, 3000);
    ok(fs.existsSync(j3.o.sockPath) && said(j3.o.sock).length === 1 && /Command failed/.test(said(j3.o.sock)[0]), 'RED: a retire that reads runChild\'s `err` as the program\'s words leaves a socket nobody holds — its «Command failed» taken for an answer', said(j3.o.sock));
    // (k2) RED for (k): a retire that never asks whether the socket is gone leaves the files and meta of a socket its master already removed
    const NO_GONE_CHECK = copy('      if (said && !(await pathGone(socketPath))) return leave(', '      if (said) return leave(', 'no-gone-check');
    const k2 = pair(NO_GONE_CHECK, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    await boot(k2, async () => { mode(`fuser-${k2.o.sock}`, 'blind'); }, () => { fs.unlinkSync(k2.o.sockPath); });
    await until(() => said(k2.o.sock).length > 0, 3000);
    ok(fs.existsSync(k2.o.meta) && said(k2.o.sock).length === 1, 'RED: a retire that never asks whether the socket is gone leaves its meta and files ORPHANED (its master had removed the socket)', said(k2.o.sock));
    // (l2) RED for (l): the release's read of the record (a bare catch) goes on past an unreadable record and SIGTERMs the master — the
    // read fails ONCE (a transient EMFILE, a torn write): the decision read again just after it reads the record whole, so only the
    // ENOENT-only catch stands between the unseen wrapper and the master's signal (failing every read, (b1)'s re-read leaves first)
    const RELEASE_CATCH = copy("    catch (e) { if (!(e && e.code === 'ENOENT')) return leave(`its record could not be read (${(e && (e.code || e.name)) || 'unreadable'})`); }", '    catch { }   /* RED: the release\'s read */', 'release-catch');
    const ml2 = master();
    const l2 = pair(RELEASE_CATCH, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
    const undoL2 = reads(l2.o.side, 3, () => { const e = new Error('EMFILE: too many open files'); e.code = 'EMFILE'; throw e; }, 3);
    try { await boot(l2, async () => { mode(`fuser-${l2.o.sock}`, 'dead'); }); await until(() => !fs.existsSync(l2.o.sockPath), 3000); } finally { undoL2(); }
    ok(!fs.existsSync(l2.o.sockPath) && !fs.existsSync(l2.o.meta) && termsTo(ml2.pid) === 0, 'RED: the release\'s bare catch reads an unreadable record as «no wrapper» and goes on: its socket, files and meta removed while a wrapper may be unseen');
    // (m2) THE GROUPS-ONLY PASS CLEARS WHAT IT ANSWERED: after a deferred pair's retire the surviving member is out of the pending list, and the
    // start's «no answer» line names none of the pair. REDs: a pass that keeps what it answered; a line that counts the deferred members
    const n3check = async (BRm) => {
      master();
      const p = pair(BRm, { ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
      await boot(p, async () => { mode(`fuser-${p.o.sock}`, 'dead'); }); await until(() => !fs.existsSync(p.o.meta), 3000); await until(() => !p.X.api.probePending().has(p.w.sock), 1000);
      return { pending: p.X.api.probePending().has(p.w.sock), line: p.X.notes.some((l) => /adopted probe-pending — no answer/.test(l)), retired: !fs.existsSync(p.o.meta) };
    };
    const m3 = await n3check(BR);
    ok(m3.retired && !m3.pending && !m3.line, 'the groups-only pass clears what it answered: the surviving member is out of the pending list, and the start\'s «no answer» line names none of the pair', m3);
    const KEEPS = copy('  if (onlyKeys) { for (const [sockFile, p] of [...pendingProbes]) if (!p.q.size) pendingProbes.delete(sockFile); return tally; }', '  if (onlyKeys) return tally;   /* RED: what it answered kept */', 'keeps-answered');
    const m4 = await n3check(KEEPS);
    ok(m4.retired && m4.pending, 'RED: a pass that keeps what it answered leaves the surviving member pending — the next ladder pass counts it «alive», never unanswered', m4);
    const ASKED_ALL = copy('    const asked = [...pendingProbes].filter(([sockFile]) => !deferredSocks.has(sockFile));', '    const asked = [...pendingProbes];   /* RED */', 'asked-all');
    const m5 = await n3check(ASKED_ALL);
    ok(m5.line, 'RED: a start line that counts the deferred members says «no answer» of sockets that were answered', m5);
    // (n) A LEAVE AFTER THE FIRST TOUCH (a wrapper, by its birth, deaf to its SIGTERM): its card is ALREADY gone — said so in Diagnostics, with what stays
    const lvN = live(), sN = await session({ stubborn: true }), wsN = sN.w;
    const n2 = pair(BR, { childPid: lvN.pid }, { ...wrapRec(live()), ...childRec(live()) });   // the older's number still there: undecided at the start
    await boot(n2);
    holders(n2.o.sock, [sN.m.pid]); fs.writeFileSync(n2.o.side, JSON.stringify({ mode: 'terminal', ...wrapRec(wsN), ...ended() }));   // since: its program ended, its wrapper still there
    try { lvN.kill('SIGKILL'); } catch { }   // by its handle
    console.log = () => { }; try { await n2.X.api.reprobePending(); } finally { console.log = log0; }
    const nl = n2.X.notes.find((l) => l.includes(`(${n2.o.sock}): not retired — `)) || '';
    ok(/its card is already gone/.test(nl) && /stay until the next start/.test(nl) && !n2.X.activeSessions.has(n2.o.id) && termsTo(wsN.pid) === 1,
      'a leave AFTER the first touch (its wrapper outlived its SIGTERM): Diagnostics says its card is already gone (its program proven ended first) and that the socket and what holds it stay', nl);
    // (o) THE MASTERS LAW (主开发 r5523): the retire signals ONLY the master this session started — its wrapper's PARENT, read while that
    // wrapper reads `same` by its recorded birth; every other listed holder is left, said by its number and name. Four scenes and their reds side by side
    // (eight at once), each on stand-ins the leg spawned and holds; each with its computed red (TODAY: the loop that took every listed holder it could read)
    const TODAY = copy("        if (own && pid === own.pid) { masters.push({ what: `its socket's master (pid ${pid})`, ident: own }); continue; }\n        if (await procGone(pid)) continue;\n        return leave(`its socket is also held by pid ${pid} (${await commOf(pid)}), which this hub cannot prove it started (only the parent of this session's own wrapper is) — nothing signalled`);\n",
      "        const ident = PIB.identityOf(pid);   /* RED: today's loop — every listed holder it can read */\n        if (ident) masters.push({ what: `its socket's master (pid ${pid})`, ident });\n        else if (!(await procGone(pid))) return leave(`its socket's holder ${pid} could not be proven (its birth not read)`);\n", 'masters-today');
    const NO_PROOF = copy("          if (pp > 1 && pp !== process.pid && PIB.tokenVerdict(Number(w.pid), w.pidStart, typeof w.pidBoot === 'string' ? w.pidBoot : '') === 'same') own = PIB.identityOf(pp);\n", "          /* RED: the parent never proven */\n", 'masters-no-proof');
    const STRANGER = /its socket is also held by pid (\d+) \((\w[\w.-]*)\), which this hub cannot prove it started/;
    const ppid0 = PIt.ppidOf, noParent = new Set();   // ONE patch for every scene at once: the parent of these wrappers cannot be read
    const scene = async (BRm, kind) => {
      const S = await session(), other = kind === 'other-hub' || kind === 'descendant' ? live(kind === 'other-hub' ? 'vs-births-other-hub-master' : 'vs-births-left-open') : null;
      const p = pair(BRm, { ...wrapRec(S.w), ...ended() }, { ...wrapRec(live()), ...childRec(live()) });
      holders(p.o.sock, kind === 'own' || kind === 'no-parent' ? [S.m.pid] : kind === 'other-hub' ? [other.pid] : [S.m.pid, other.pid]);
      if (kind === 'no-parent') noParent.add(S.w.pid);
      await boot(p); await until(() => !fs.existsSync(p.o.meta) || said(p.o.sock).length > 0, 3000);
      await sleep(2 * 300);   // THE SETTLE (r5523: «the stranger's life judged … after a settle»): twice this instance's retire bound, so a late signal would have come
      return { S, other, p, words: said(p.o.sock)[0] || '', retired: !fs.existsSync(p.o.meta), mTerms: termsTo(S.m.pid), wTerms: termsTo(S.w.pid), oTerms: other ? termsTo(other.pid) : 0 };
    };
    PIt.ppidOf = (pid, o) => (noParent.has(Number(pid)) ? null : ppid0(pid, o));
    let o1, o2, o3, o4, r1, r2, r3, r4;
    try { [o1, o2, o3, o4, r1, r2, r3, r4] = await Promise.all([scene(BR, 'own'), scene(BR, 'other-hub'), scene(BR, 'descendant'), scene(BR, 'no-parent'), scene(NO_PROOF, 'own'), scene(TODAY, 'other-hub'), scene(TODAY, 'descendant'), scene(TODAY, 'no-parent')]); } finally { PIt.ppidOf = ppid0; }
    ok(o1.retired && o1.wTerms === 1 && o1.mTerms === 1 && !fs.existsSync(o1.p.o.sockPath) && !o1.words,
      '(o1) this session\'s OWN master — its wrapper\'s parent, proven by the wrapper\'s birth — is ended after its wrapper; the socket, files and meta go', o1.words);
    const x2 = STRANGER.exec(o2.words);
    ok(!o2.retired && x2 !== null && Number(x2[1]) === o2.other.pid && x2[2] === 'sleep' && o2.oTerms === 0 && o2.wTerms === 0 && o2.mTerms === 0 && fs.existsSync(o2.p.o.sockPath) && o2.p.X.activeSessions.has(o2.p.o.id),
      '(o2) ANOTHER HUB\'s MASTER on the same sockets folder is NOT signalled: nothing of the pair touched, the socket left, said once by its number and name, the card kept', o2.words);
    ok(alive(o2.other.pid), '(o2) …and that stranger still LIVES after the settle (judged on its own, outside every other condition)');
    const x3 = STRANGER.exec(o3.words);
    ok(!o3.retired && x3 !== null && Number(x3[1]) === o3.other.pid && o3.oTerms === 0 && o3.mTerms === 0 && o3.wTerms === 0 && alive(o3.other.pid),
      '(o3) a holder of a listener LEFT OPEN ACROSS exec (a background job of the session, re-parented once its program ended) is NOT signalled — nor the session\'s own master beside it: all left, said', o3.words);
    ok(!o4.retired && STRANGER.test(o4.words) && o4.mTerms === 0 && o4.wTerms === 0 && fs.existsSync(o4.p.o.sockPath),
      '(o4) a wrapper whose PARENT cannot be read proves no master: nothing signalled, the socket left, said once', o4.words);
    ok(!r1.retired && r1.mTerms === 0 && STRANGER.test(r1.words), 'RED (o1): a copy that never proves the parent leaves this session\'s own master too — the green\'s ending is the proof\'s', r1.words);
    ok(r2.oTerms === 1, 'RED (o2): today\'s loop SIGTERMs another hub\'s live master — any listed holder it can read', { oTerms: r2.oTerms });
    ok(r3.oTerms === 1, 'RED (o3): today\'s loop SIGTERMs a process holding a listener left open across exec', { oTerms: r3.oTerms });
    ok(r4.mTerms === 1, 'RED (o4): today\'s loop SIGTERMs a holder although the wrapper\'s parent was never read', { mTerms: r4.mTerms });
    // (g) THE HUB'S OWN ATTACH: on the re-probe's road its session is unadopted FIRST, then its pty ended by its own handle
    const order = (BRm, tag) => async () => {
      const lv = live();
      const g1 = pair(BRm, { childPid: lv.pid }, { ...wrapRec(live()), ...childRec(live()) });   // the older's number still there: undecided at the boot
      await boot(g1); mode(`fuser-${g1.o.sock}`, 'dead');   // the older keeps no wrapper birth: nobody listed at its retire (the masters law leaves any holder)
      const steps = [], s = g1.X.activeSessions.get(g1.o.id);
      if (s) s.pty = { kill: () => steps.push(g1.X.activeSessions.get(g1.o.id) === s ? 'killed while adopted' : 'killed after its unadopt') };
      try { lv.kill('SIGKILL'); } catch { }   // by its handle
      await until(() => !alive(lv.pid), 2000);
      console.log = () => { }; try { await g1.X.api.reprobePending(); } finally { console.log = log0; }
      await until(() => steps.length > 0, 3000);
      return { steps, ended: g1.X.ended.includes(g1.o.id) };
    };
    const g = await order(BR, 'g')();
    ok(g.steps.join() === 'killed after its unadopt' && g.ended, 'the re-probe\'s retire: the hub\'s own attach is ended AFTER its session is unadopted (its exit pairs end with it), by its own handle', g);
    const KILL_FIRST = copy("      if (onUnadopt) { try { onUnadopt(); } catch { } }\n      if (adopted.pty) { try { adopted.pty.kill(); } catch { } }\n", "      if (adopted.pty) { try { adopted.pty.kill(); } catch { } }   // RED: the kill before the unadopt\n      if (onUnadopt) { try { onUnadopt(); } catch { } }\n", 'kill-first');
    const gr = await order(KILL_FIRST, 'gr')();
    ok(gr.steps.join() === 'killed while adopted', 'RED: the kill before the unadopt ends the pty of a session still adopted (its exit runs as an unasked end)', gr);
    // (h) TWO UNNAMED CARDS: told apart by their harness and their start, never «a conversation» twice, never a path
    const h = pair(BR, { ...wrapRec(live()), ...childRec(live()) }, { ...wrapRec(live()), ...childRec(live()) }, { names: ['', ''] });
    await boot(h);
    ok(h.X.notes.includes(PAIR_SAID('the unnamed claude conversation that started first', 'the unnamed claude conversation that started second')) && !h.X.notes.some((l) => l.includes('/')), 'two unnamed cards: told apart by their harness and the order they started in, no path', h.X.notes);
    const m1 = pair(BR, { ...wrapRec(live()), ...childRec(live()) }, { ...wrapRec(live()), ...childRec(live()) }, { names: ['', ''] });
    for (const x of [m1.o, m1.w]) { const mm = JSON.parse(fs.readFileSync(x.meta, 'utf8')); fs.writeFileSync(x.meta, JSON.stringify({ ...mm, createdAt: 1760480000000 })); }
    await boot(m1);
    const UNK = 'an unnamed claude conversation (one of 2; the order they started in is not known)';
    ok(m1.X.notes.includes(PAIR_SAID(UNK, UNK)), 'two unnamed cards that started at the same moment: no order is claimed that nobody knows', m1.X.notes);
    console.warn = warn0; process.kill = realKill; process.env.PATH = PATH0;
  }
} catch (e) { fail++; console.error('  ✗ threw: ' + (e && e.stack || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
