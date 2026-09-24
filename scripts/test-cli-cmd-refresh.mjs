#!/usr/bin/env node
// B-a18e — THE SPAWN-TIME RE-RESOLVE OF THE AGENT-CLI PATH.
//
// On a fleet instance (2026-08-11) an Update restart landed inside the
// installer's window ("old version deleted, new one not yet placed"); the
// boot-time resolve pinned a path that no longer existed and EVERY spawn failed
// until somebody restarted again. src/server/cli-cmd.js re-checks the resolved
// path at each local spawn and re-resolves ONCE when it has gone.
//
//   ① the helper over injected resolve/usable (no process): a live path costs
//      no re-resolve; a gone path is re-resolved, handed to the adapter and
//      logged naming both paths; a failed re-resolve leaves the command as it
//      was (the existing error path); overrides / ssh / node / unregistered
//      backends pass through; the async lookup finds what the boot lookup finds.
//   ② wiring pins: ONE resolver (server.js imports it), cli-env registers
//      claude + codex + every ACP harness, ws-create re-checks BEFORE the ONE
//      local argv (pty terminal = chat wrapper = daemon pipe).
//   ③ a REAL scratch server (worktree + own data/ + scratch HOME) booted with
//      a FAKE `claude` in dir A: the binary is renamed to dir B and back
//      between spawns — each spawn runs the binary where it NOW is, without a
//      restart (RED on the pre-fix code: the second spawn runs nothing), and
//      with it gone entirely the spawn fails the way it always did.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, withoutVendorKeys } from './scratch.mjs';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => { try { return fs.readFileSync(path.join(repo, f), 'utf8'); } catch { return ''; } };

let srv = null;
const ROOT = scratch('cli-cmd');
let fakeHome = null;
const cleanup = () => {
  try { srv?.kill('SIGKILL'); } catch { }
  // the dtach masters, wrappers and fake CLIs of THIS suite all carry ROOT in argv
  try { execFileSync('pkill', ['-KILL', '-f', ROOT], { stdio: 'ignore' }); } catch { }
  try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', path.join(ROOT, 'wt')], { stdio: 'ignore' }); } catch { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { if (fakeHome) fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const done = () => {
  console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
  process.exit(fail ? 1 : 0);
};

// ═══ ① the helper ═══════════════════════════════════════════════════════════
console.log('\n① createCliCmds.forSpawn over injected facts');
let mod = null;
try { mod = require('../src/server/cli-cmd.js'); } catch (e) { ok(false, `src/server/cli-cmd.js loads (${e.message.split('\n')[0]})`); }
if (mod) {
  const mk = (present, answer) => {
    const calls = { resolve: 0, logs: [], applied: [] };
    const c = mod.createCliCmds({
      resolve: async (name) => { calls.resolve++; return typeof answer === 'function' ? answer(name) : answer; },
      usable: async (p) => present.has(p),
      log: (l) => calls.logs.push(l),
    });
    c.register('claude', { name: 'claude', current: '/old/claude', apply: (p) => calls.applied.push(p) });
    return { c, calls };
  };
  {
    const { c, calls } = mk(new Set(['/old/claude']), '/new/claude');
    const r = await c.forSpawn('claude', '/old/claude');
    ok(r === '/old/claude' && calls.resolve === 0 && !calls.logs.length, 'a path still executable at spawn is spawned as-is — no re-resolve, no log line');
  }
  {
    const { c, calls } = mk(new Set(['/new/claude']), '/new/claude');
    const r = await c.forSpawn('claude', '/old/claude');
    ok(r === '/new/claude', `a GONE path is re-resolved and the new one spawned (${r})`);
    ok(calls.resolve === 1, `resolveCmd ran exactly ONCE (${calls.resolve})`);
    ok(calls.applied.join() === '/new/claude', 'the new path is handed to the adapter (later spawns are born right)');
    ok(calls.logs.length === 1 && calls.logs[0].includes("'/old/claude'") && calls.logs[0].includes("'/new/claude'"), `ONE log line naming the old AND the new path (${calls.logs[0]})`);
    ok(c.current('claude') === '/new/claude', 'the registry now answers the new path');
    const r2 = await c.forSpawn('claude', '/new/claude');
    ok(r2 === '/new/claude' && calls.resolve === 1 && calls.logs.length === 1, 'the next spawn with the new path costs nothing more');
  }
  {
    const { c, calls } = mk(new Set(), 'claude');
    const r = await c.forSpawn('claude', '/old/claude');
    ok(r === '/old/claude', 'a re-resolve that finds nothing leaves the command as it was — the existing error path stands');
    ok(calls.resolve === 1 && !calls.applied.length, 'nothing is handed to the adapter');
    ok(calls.logs.length === 1 && /found nothing/.test(calls.logs[0]) && calls.logs[0].includes("'/old/claude'"), `and the one line says so (${calls.logs[0]})`);
  }
  {
    const { c, calls } = mk(new Set(), async () => { throw new Error('boom'); });
    ok(await c.forSpawn('claude', '/old/claude') === '/old/claude' && calls.logs.length === 1, 'a throwing re-resolve is the same as finding nothing');
  }
  {
    const { c, calls } = mk(new Set(), '/new/claude');
    const a = await c.forSpawn('claude', '/usr/bin/ssh');
    const b = await c.forSpawn('claude', '/opt/custom/claude-override');
    const d = await c.forSpawn('shell', '/bin/bash');
    const e = await c.forSpawn('codex', '/old/claude');
    ok(a === '/usr/bin/ssh' && b === '/opt/custom/claude-override' && d === '/bin/bash' && e === '/old/claude' && calls.resolve === 0,
      'only the registered, boot-resolved command is ever re-resolved: ssh, a spec override, a shell and an unregistered backend pass through untouched');
  }
  // SINGLE-FLIGHT (batch r1): creates that land in the stale window TOGETHER
  // share ONE re-resolve — one `which`, one adapter hand-off, one journal line
  // — and every one of them spawns the fresh path. (Before: three creates in
  // flight = three lookups, three applies, three identical 'old → new' lines.)
  {
    const { c, calls } = mk(new Set(['/new/claude']), async () => { await new Promise((r) => setTimeout(r, 20)); return '/new/claude'; });
    const rs = await Promise.all([1, 2, 3].map(() => c.forSpawn('claude', '/old/claude')));
    ok(rs.every((r) => r === '/new/claude'), `three concurrent spawns in the stale window all get the fresh path (${rs.join(', ')})`);
    ok(calls.resolve === 1 && calls.applied.length === 1 && calls.logs.length === 1,
      `…through ONE shared re-resolve: resolves=${calls.resolve} applies=${calls.applied.length} journal lines=${calls.logs.length}`);
    const r4 = await c.forSpawn('claude', '/old/claude');
    ok(r4 === '/old/claude' && calls.resolve === 1, 'a caller still passing the OLD path AFTER the adoption is passed through untouched (it is no longer the registered command)');
  }
  {
    const { c, calls } = mk(new Set(), async () => { await new Promise((r) => setTimeout(r, 20)); return 'claude'; });
    const rs = await Promise.all([1, 2, 3].map(() => c.forSpawn('claude', '/old/claude')));
    ok(rs.every((r) => r === '/old/claude') && calls.resolve === 1 && calls.logs.length === 1 && /found nothing/.test(calls.logs[0]),
      `a binary still missing: the concurrent creates share one lookup and one found-nothing line (resolves=${calls.resolve}, lines=${calls.logs.length})`);
    await c.forSpawn('claude', '/old/claude');
    ok(calls.resolve === 2 && calls.logs.length === 2, 'and the NEXT create asks again (the shared lookup is released when it settles — never a cached "missing")');
  }
  {
    const { c, calls } = mk(new Set(['/found/claude']), '/found/claude');
    c.register('claude', { name: 'claude', current: 'claude', apply: (p) => calls.applied.push(p) });
    ok(await c.forSpawn('claude', 'claude') === '/found/claude', 'a boot resolve that came back BARE (nothing found at boot) is resolved at the next spawn');
  }
  {
    // the async lookup is the boot lookup's twin
    const want = mod.resolveCmd('sh');
    const got = await mod.resolveCmdAsync('sh');
    ok(want === got && got.startsWith('/'), `resolveCmdAsync answers what resolveCmd answers (sh → ${got})`);
    const none = 'vs-no-such-cmd-' + process.pid;
    ok(mod.resolveCmd(none) === none && await mod.resolveCmdAsync(none) === none, 'both answer the bare name when nothing is found');
  }
}

// ═══ ② wiring pins ══════════════════════════════════════════════════════════
console.log('\n② wiring');
{
  const server = read('server.js'), cliEnv = read('src/server/cli-env.js'), wsCreate = read('src/ws-create.js');
  ok(!/function resolveCmd\s*\(/.test(server) && /const \{ resolveCmd \} = require\('\.\/src\/server\/cli-cmd\.js'\)/.test(server),
    'server.js holds no resolver of its own — it imports THE one (boot and spawn share one lookup)');
  ok(/cliCmds\.register\('claude'/.test(cliEnv) && /cliCmds\.register\('codex'/.test(cliEnv) && /for \(const id of Object\.keys\(ACP_COMMANDS\)\)[\s\S]{0,40}cliCmds\.register\(id/.test(cliEnv),
    'cli-env registers claude, codex and every ACP harness where they are resolved');
  const at = wsCreate.indexOf('spawnCmd = await cliCmds.forSpawn(backend, spawnCmd)');
  const argv = wsCreate.indexOf('const r6Argv = [');
  ok(at > 0 && argv > at && (wsCreate.match(/const r6Argv = \[/g) || []).length === 1 && (wsCreate.match(/cliCmds\.forSpawn\(/g) || []).length === 1,
    'ws-create re-checks the command ONCE, right BEFORE the ONE local argv every local spawn runs (pty terminal, chat wrapper, daemon pipe)');
  ok(/'cliCmds'/.test(read('src/ws-handler.js')), 'cliCmds is in WS_CTX_CONTRACT');
}

// ═══ ③ a real scratch server ════════════════════════════════════════════════
console.log('\n③ a scratch server: the fake claude renamed away and back between spawns');
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
const FALLBACK_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
const hasClaude = (d) => { try { fs.accessSync(path.join(d, 'claude'), fs.constants.X_OK); return true; } catch { return false; } };
const shadow = FALLBACK_DIRS.filter(hasClaude);
if (!dtachOk) { skip('dtach is not installed — a local terminal session cannot be created here'); done(); }
else if (shadow.length) { skip(`a real claude sits in a resolver fallback dir (${shadow.join(', ')}) — the "gone" leg would find it`); done(); }
else {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const A = path.join(ROOT, 'binA'), B = path.join(ROOT, 'binB'), WORK = path.join(ROOT, 'work'), MARK = path.join(ROOT, 'ran.log');
  const wt = path.join(ROOT, 'wt');
  for (const d of [A, B, WORK]) fs.mkdirSync(d, { recursive: true });
  fakeHome = scratchHome('cli-cmd-home', fs);
  // A fake CLI: records the path it was run AS, then holds the pty briefly.
  fs.writeFileSync(path.join(A, 'claude'), `#!/bin/sh\necho "$0" >> '${MARK}'\nexec sleep 15\n`, { mode: 0o755 });
  const marks = () => { try { return fs.readFileSync(MARK, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json']) {
    execFileSync('rm', ['-rf', path.join(wt, f)]);
    execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]);
  }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  // PATH: A then B, and NO directory that holds a real claude — the re-resolve
  // must only ever find the fake.
  const basePath = (process.env.PATH || '').split(path.delimiter).filter((d) => d && !hasClaude(d));
  const env = { ...withoutVendorKeys(), PATH: [A, B, ...basePath].join(path.delimiter), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  delete env.CLAUDE_CMD;
  const PORT = await freePort();
  env.PORT = String(PORT);
  let journal = '';
  srv = spawn(process.execPath, ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => { journal += d; });
  srv.stderr.on('data', (d) => { journal += d; });
  const ready = await until(() => journal.includes('Ready.'), 40000, 50);
  if (!ok(ready, 'the scratch server booted')) { console.error(journal.slice(-1500)); done(); }
  ok(journal.includes(`claude: ${path.join(A, 'claude')}`), `boot resolved claude to dir A (${(journal.match(/claude: \S+/) || [''])[0]})`);
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let n = 0;
  const create = async () => {
    const reqId = 'c' + (++n);
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'terminal', cwd: WORK, cols: 80, rows: 24, reqId }));
    await until(() => msgs.some((m) => m.reqId === reqId && (m.type === 'created' || m.type === 'error')), 20000);
    return msgs.find((m) => m.reqId === reqId && (m.type === 'created' || m.type === 'error')) || null;
  };
  const cliLines = () => journal.split('\n').filter((l) => l.includes('[cli-cmd] claude:'));
  const spawnRuns = async (want, label) => {
    const before = marks().length;
    const r = await create();
    const ran = await until(() => marks().length > before, 8000);
    const last = marks()[marks().length - 1];
    ok(r?.type === 'created' && ran && last === want, `${label}: the spawn ran ${want} (${r?.type}${r?.type === 'error' ? ' ' + String(r.message).slice(0, 80) : ''}; ran=${ran}${ran ? ' as ' + last : ''})`);
  };

  await spawnRuns(path.join(A, 'claude'), 'spawn 1, binary in A (the boot answer)');
  ok(cliLines().length === 0, 'a spawn whose path is present logs nothing and re-resolves nothing');

  fs.renameSync(path.join(A, 'claude'), path.join(B, 'claude'));
  await spawnRuns(path.join(B, 'claude'), 'spawn 2, binary MOVED to B — THE FINDING (pre-fix: the dead A path is spawned, nothing runs)');
  const l1 = cliLines()[0] || '';
  ok(cliLines().length === 1 && l1.includes(`'${path.join(A, 'claude')}'`) && l1.includes(`'${path.join(B, 'claude')}'`), `ONE journal line naming the old and the new path (${l1.trim().slice(0, 200)})`);

  fs.renameSync(path.join(B, 'claude'), path.join(A, 'claude'));
  await spawnRuns(path.join(A, 'claude'), 'spawn 3, binary moved BACK to A — no restart in between');
  ok(cliLines().length === 2, `the move back is re-resolved too (${cliLines().length} lines)`);
  await spawnRuns(path.join(A, 'claude'), 'spawn 4, nothing moved');
  ok(cliLines().length === 2, 'and a spawn with the path in place adds no line');

  fs.renameSync(path.join(A, 'claude'), path.join(A, 'claude.gone'));
  const before = marks().length;
  const r5 = await create();
  await sleep(3000);
  ok(marks().length === before, `CONTROL: with the binary gone everywhere nothing runs — the spawn fails the way it always did (${r5?.type})`);
  const l3 = cliLines()[2] || '';
  ok(cliLines().length === 3 && /found nothing/.test(l3) && l3.includes(`'${path.join(A, 'claude')}'`), `and the journal says the re-resolve found nothing (${l3.trim().slice(0, 200)})`);
  try { ws.close(); } catch { }
  done();
}
