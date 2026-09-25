#!/usr/bin/env node
// A RESTART BESIDE A PENDING FORK (fork-group round 3, both findings reproduced
// on a scratch server before the fix). A fork's row is SEEDED with its
// source's id (`--resume <parent> --fork-session`) until the harness announces
// its own, and an older server left every TERMINAL fork naming its parent for
// life. Two things went wrong at a SIGKILL-restart inside that window:
//   ① boot-restore's conversation DEDUP keyed the fork's meta by the borrowed
//     id, called the live PARENT the "stale duplicate" of its own fork, and
//     SIGTERMed + unlinked it (socket, buffer, meta — the parent's CLI died);
//   ② a pending CHAT fork whose init landed while the server was down never
//     adopted its id (the init is never replayed; the lock capture refused chat
//     mode), and one whose init was the FIRST line after the re-attach lost it
//     to dtach's `\e[H\e[J` preamble glued in front of the JSON.
//
// DRIVEN, END TO END: a scratch copy of THIS tree (never the checkout's data/),
// a scratch HOME, a fake `claude` on PATH (a node script — it writes the CLI's
// lock shape `{pid, sessionId, cwd, startedAt, procStart}` and, in stream-json
// mode, an init record; a fork waits for a `.go` file in its cwd so the suite
// decides WHEN each fork announces itself). Parents A (terminal) and B (chat);
// forks FT (terminal, of A), FC (chat, of B, announced while the server is
// DOWN) and FC2 (chat, of B, announced right after the reboot with NO lock
// file — only the stream parser can adopt it, so the preamble strip is what
// is measured). SIGKILL, reboot, release the forks:
//   · every socket survives, no `Duplicate of` line, both parents' CLIs alive
//     with their own ids;
//   · FT and FC adopt the id their own lock names (the pid-witnessed capture,
//     armed by the +2 s sweep for every restored session);
//   · FC2 adopts the id its init names.
// NEGATIVE CONTROL: the same run on a second scratch copy whose boot-restore
// feeds the dedup EVERY meta with an id (the pre-fix loop) — the parent is
// retired. (The chat-capture and preamble controls are deterministic
// patched-copy legs in test-fork-groups.)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { WebSocket } = require('ws');
const { scratch, freePort, withoutVendorKeys } = await import(path.join(REPO, 'scripts/scratch.mjs'));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? `\n      ${extra}` : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = scratch('fork-restore');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const servers = new Set();
function cleanup() {
  for (const s of servers) { try { s.kill('SIGKILL'); } catch { } }
  // everything this run started lives under ROOT (per-pid): dtach masters,
  // wrappers, fake CLIs, the scratch daemon — never anything else
  try { execFileSync('pkill', ['-KILL', '-f', ROOT], { stdio: 'ignore' }); } catch { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

// ── the fake CLI ──
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN, { recursive: true });
fs.writeFileSync(path.join(BIN, 'claude'), `#!/usr/bin/env node
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('2.1.281 (Claude Code)'); process.exit(0); }
const fork = a.includes('--fork-session');
const ri = a.indexOf('--resume'); const resume = ri >= 0 ? a[ri + 1] : null;
const sj = a.includes('stream-json');
const sid = resume && !fork ? resume : crypto.randomUUID();
const cwd = process.cwd();
process.stdin.on('data', () => {}); process.stdin.on('error', () => {});
const lockDir = fs.readFileSync(path.join(__dirname, 'lock-dir-' + path.basename(path.dirname(process.env.HOME || '')) + '-' + path.basename(process.env.HOME || '')), 'utf8').trim(); // the suite names the scratch lock dir (never a real home)
const lockFile = path.join(lockDir, process.pid + '.json');
const announce = () => {
  const st = fs.readFileSync('/proc/self/stat', 'utf8'); const procStart = st.slice(st.lastIndexOf(')') + 2).split(' ')[19];
  if (!fs.existsSync(path.join(cwd, '.nolock'))) { fs.mkdirSync(lockDir, { recursive: true }); fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, sessionId: sid, cwd, startedAt: Date.now(), procStart, kind: 'interactive' })); }
  fs.writeFileSync(path.join(cwd, '.sid-' + process.pid), sid);
  if (sj) process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: sid, cwd, model: 'fake', tools: [], permissionMode: 'default', apiKeySource: 'none' }) + '\\n');
  else process.stdout.write('FAKE-CLAUDE ' + sid + '\\r\\n');
};
if (!fork) setTimeout(announce, 200);
else { const t = setInterval(() => { if (fs.existsSync(path.join(cwd, '.go'))) { clearInterval(t); announce(); } }, 100); }
const bye = () => { try { fs.unlinkSync(lockFile); } catch {} process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGHUP', bye);
setInterval(() => {}, 60000);
`);
fs.chmodSync(path.join(BIN, 'claude'), 0o755);

function makeTree(name, patch = null) {
  const wt = path.join(ROOT, name);
  fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  for (const f of ['src', 'public', 'server.js', 'package.json']) execFileSync('cp', ['-r', path.join(REPO, f), path.join(wt, f)]);
  execFileSync('cp', ['-r', path.join(REPO, 'data', 'bin'), path.join(wt, 'data', 'bin')]);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  if (patch) {
    const f = path.join(wt, patch.file);
    const src = fs.readFileSync(f, 'utf8');
    const out = src.replace(patch.from, patch.to);
    ok(out !== src, `control copy: the patch applied to ${patch.file}`);
    fs.writeFileSync(f, out);
  }
  return wt;
}

async function scenario(tag, wt) {
  const HOME = path.join(ROOT, 'home-' + tag);
  for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(HOME, d), { recursive: true });
  fs.writeFileSync(path.join(BIN, 'lock-dir-' + path.basename(ROOT) + '-home-' + tag), path.join(HOME, '.claude', 'sessions'));
  const cwdOf = (n) => { const d = path.join(ROOT, `work-${tag}-${n}`); fs.mkdirSync(d, { recursive: true }); return d; };
  const PORT = await freePort();
  const env = { ...withoutVendorKeys(process.env), HOME, PATH: `${BIN}:${process.env.PATH}`, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '',
    VIBESPACE_AGENTD_ROOT: path.join(ROOT, 'agentd-' + tag), VIBESPACE_NODE_MODULES: path.join(REPO, 'node_modules') };
  delete env.CLAUDE_CODE_CHILD_SESSION; delete env.CLAUDECODE;
  const boot = async () => {
    const c = spawn(process.execPath, ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
    servers.add(c);
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.log = () => out;
    const t0 = Date.now();
    while (!out.includes('Ready.')) { if (c.exitCode != null || Date.now() - t0 > 90000) throw new Error(`[${tag}] boot failed\n${out.slice(-3000)}`); await sleep(200); }
    return c;
  };
  const connect = () => new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = [];
    ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
    ws.on('open', () => res({ ws, msgs })); ws.on('error', rej);
  });
  const rows = (c) => (c.msgs.filter((m) => m.type === 'active-sessions').pop()?.sessions || []);
  const rowOf = (c, id) => rows(c).find((s) => s.id === id);
  const cid = (r) => r?.claudeSessionId || r?.backendSessionId || null;
  const create = async (c, extra) => {
    const reqId = 'r' + Math.random().toString(36).slice(2);
    c.ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'terminal', cols: 80, rows: 24, reqId, ...extra }));
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const m = c.msgs.find((x) => x.type === 'created' && x.reqId === reqId); if (m) return m.sessionId;
      const e = c.msgs.find((x) => x.type === 'error' && x.reqId === reqId); if (e) throw new Error(`[${tag}] create refused: ${JSON.stringify(e)}`);
      await sleep(100);
    }
    throw new Error(`[${tag}] no created reply`);
  };
  const waitRow = async (c, id, pred, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = rowOf(c, id); if (r && pred(r)) return r; await sleep(200); } return rowOf(c, id) || null; };
  const locks = () => { const d = path.join(HOME, '.claude/sessions'); return fs.readdirSync(d).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch { return null; } }).filter(Boolean); };
  const sidIn = (dir) => { const f = fs.readdirSync(dir).find((n) => n.startsWith('.sid-')); return f ? fs.readFileSync(path.join(dir, f), 'utf8').trim() : null; };
  const sockets = () => fs.readdirSync(path.join(wt, 'data/sockets')).filter((f) => f.startsWith('cw-')).sort();

  let srv = await boot();
  let c = await connect();
  const dA = cwdOf('A'), dB = cwdOf('B'), dFT = cwdOf('FT'), dFC = cwdOf('FC'), dFC2 = cwdOf('FC2');
  fs.writeFileSync(path.join(dFC2, '.nolock'), '');
  const A = await create(c, { cwd: dA, name: 'parent-A' });
  const B = await create(c, { cwd: dB, name: 'parent-B', mode: 'chat' });
  const rA = await waitRow(c, A, (r) => !!cid(r), 20000), rB = await waitRow(c, B, (r) => !!cid(r), 20000);
  const idA = cid(rA), idB = cid(rB);
  ok(!!idA && !!idB, `[${tag}] both parents have their own ids (A terminal via the lock capture, B chat via its init)`, JSON.stringify({ idA, idB }));
  const fork = (name, cwd, src, mode) => create(c, { cwd, name, mode, resume: true, resumeId: src, backendSessionId: src, fork: true, extraArgs: '--fork-session' });
  const FT = await fork('fork-FT', dFT, idA, 'terminal');
  const FC = await fork('fork-FC', dFC, idB, 'chat');
  const FC2 = await fork('fork-FC2', dFC2, idB, 'chat');
  await sleep(2500);
  const pending = [FT, FC, FC2].map((id) => cid(rowOf(c, id)));
  ok(pending[0] === idA && pending[1] === idB && pending[2] === idB, `[${tag}] the three forks are PENDING (each row still carries its source's id)`, JSON.stringify(pending));
  const lockA = locks().find((l) => l.sessionId === idA), lockB = locks().find((l) => l.sessionId === idB);
  const before = sockets();
  c.ws.close(); srv.kill('SIGKILL'); servers.delete(srv);
  await sleep(500);
  // FC announces itself while NOBODY is listening
  fs.writeFileSync(path.join(dFC, '.go'), '');
  const t0 = Date.now(); while (!sidIn(dFC) && Date.now() - t0 < 10000) await sleep(100);
  const sidFC = sidIn(dFC);
  ok(!!sidFC && locks().some((l) => l.sessionId === sidFC), `[${tag}] FC's init + lock landed while the server was down`, sidFC);

  srv = await boot();
  c = await connect();
  // FT and FC2 announce themselves after the reboot (FC2's init is the first
  // line its re-attached consumer sees; it writes no lock)
  fs.writeFileSync(path.join(dFT, '.go'), ''); fs.writeFileSync(path.join(dFC2, '.go'), '');
  const t1 = Date.now(); while ((!sidIn(dFT) || !sidIn(dFC2)) && Date.now() - t1 < 10000) await sleep(100);
  const sidFT = sidIn(dFT), sidFC2 = sidIn(dFC2);
  const after = await (async () => {
    const tEnd = Date.now() + 30000;
    for (;;) {
      const r = { FT: cid(rowOf(c, FT)), FC: cid(rowOf(c, FC)), FC2: cid(rowOf(c, FC2)) };
      if ((r.FT === sidFT && r.FC === sidFC && r.FC2 === sidFC2) || Date.now() > tEnd) return r;
      await sleep(300);
    }
  })();
  const log = srv.log();
  const res = {
    retired: /Duplicate of/.test(log),
    socketsGone: before.filter((s) => !sockets().includes(s)),
    aAlive: !!lockA && fs.existsSync('/proc/' + lockA.pid), bAlive: !!lockB && fs.existsSync('/proc/' + lockB.pid),
    aRow: cid(rowOf(c, A)), bRow: cid(rowOf(c, B)),
    after, sidFT, sidFC, sidFC2, log,
  };
  c.ws.close(); srv.kill('SIGKILL'); servers.delete(srv);
  try { execFileSync('pkill', ['-KILL', '-f', wt], { stdio: 'ignore' }); } catch { }
  try { execFileSync('pkill', ['-KILL', '-f', path.join(BIN, 'claude')], { stdio: 'ignore' }); } catch { }
  return res;
}

console.log('① the fixed tree: a SIGKILL-restart beside three pending forks');
{
  const r = await scenario('fixed', makeTree('wt-fixed'));
  ok(!r.retired && r.socketsGone.length === 0, 'no socket retired — a pending fork\'s borrowed id is not a dedup claim', JSON.stringify({ retired: r.retired, gone: r.socketsGone, lines: r.log.split('\n').filter((l) => /Duplicate/.test(l)) }));
  ok(r.aAlive && r.bAlive && !!r.aRow && !!r.bRow, 'both parents survive: their CLIs alive, their rows listed with their own ids', JSON.stringify({ aAlive: r.aAlive, bAlive: r.bAlive, aRow: r.aRow, bRow: r.bRow }));
  ok(!!r.sidFT && r.after.FT === r.sidFT, 'the pending TERMINAL fork adopts its own id after the restart (the +2 s sweep arms the pid-witnessed capture)', JSON.stringify({ want: r.sidFT, got: r.after.FT }));
  ok(!!r.sidFC && r.after.FC === r.sidFC, 'the pending CHAT fork whose init landed while the server was DOWN adopts its own id (the capture now covers a chat fork)', JSON.stringify({ want: r.sidFC, got: r.after.FC }));
  ok(!!r.sidFC2 && r.after.FC2 === r.sidFC2, 'the pending CHAT fork whose init is the FIRST line after the re-attach adopts it (no lock: only the parser can — the dtach preamble is stripped)', JSON.stringify({ want: r.sidFC2, got: r.after.FC2 }));
  ok(!/cli-unparsable-line/.test(r.log), 'no stream line was dropped as unparsable', r.log.split('\n').filter((l) => /cli-unparsable-line/.test(l)).slice(0, 3).join(' | '));
}

console.log('② NEGATIVE CONTROL: the pre-fix dedup (every meta with an id is a claim)');
{
  const wt = makeTree('wt-control', { file: 'src/server/boot-restore.js', from: '    if (ownsItsId(m)) dedupMetas.push({ sockFile, m });\n', to: '    if (m && m.claudeSessionId) dedupMetas.push({ sockFile, m });\n' });
  const r = await scenario('control', wt);
  ok(r.retired && r.socketsGone.length > 0 && (!r.aAlive || !r.bAlive), 'control: a parent is retired as the "stale duplicate" of its own pending fork (its socket unlinked, its CLI SIGTERMed) — the reproduced defect', JSON.stringify({ retired: r.retired, gone: r.socketsGone, aAlive: r.aAlive, bAlive: r.bAlive }));
}

console.log(`\ntest-fork-restore: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
