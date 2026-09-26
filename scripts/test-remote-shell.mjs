#!/usr/bin/env node
// Remote shell prelude unification (2.274.0, campaign Phase 4) — the guard
// against the drift that produced remote-only bugs: EVERY remote command
// builder must go through src/remote-shell.js, not its own copy of the
// PATH/nvm string or the POSIX node finder.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { REMOTE_PRELUDE, nodeFinder, buildRemoteShellPrelude } = require('../src/remote-shell.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

ok(REMOTE_PRELUDE.includes('$HOME/.local/bin'), 'prelude puts ~/.local/bin on PATH (native claude installer target)');
ok(REMOTE_PRELUDE.includes('nvm.sh'), 'prelude sources nvm (the #1 "node: not found" cause on dev machines)');
ok(REMOTE_PRELUDE.trimEnd().endsWith(';'), 'prelude is a composable ;-terminated prefix');
const nf = nodeFinder();
ok(nf.includes('command -v node') && nf.includes('.nvm/versions/node') && nf.includes('/opt/homebrew/bin/node'),
  'node finder covers PATH → nvm → common absolute paths');
ok(nf.includes('export PATH="$(dirname "$VS_NODE")'),
  'node finder EXPORTS node dir onto PATH (revives env-node shebang tools on dash hosts)');
ok(buildRemoteShellPrelude({ toolsOnPath: true }).includes('.vibespace/bin'), 'toolsOnPath adds the agent-tool dir');
ok(!buildRemoteShellPrelude().includes('.vibespace/bin'), 'toolsOnPath is opt-in (a pristine spawn must not see agent tools)');
ok(buildRemoteShellPrelude({ withNodeFinder: true }).includes('VS_NODE'), 'withNodeFinder composes');

// THE DRIFT GUARD: no remote-command file may re-inline the prelude or finder.
const LIT_PRE = 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ]';
const LIT_NF = 'VS_NODE="$(command -v node';
for (const f of ['src/hosts.js', 'src/ws-handler.js', 'src/ws-create.js']) {
  const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  ok(!src.includes(LIT_PRE), `${f} has no inlined prelude copy (must import REMOTE_PRELUDE)`);
  ok(!src.includes(LIT_NF), `${f} has no inlined node finder (must import nodeFinder)`);
}
const tailLineHas = (l) => l.includes('VIBESPACE_SESSION_CWD=') && l.indexOf('VIBESPACE_SESSION_CWD=') < l.indexOf('exec env ');
// ── buildRemoteExec (2.279.0): the five spawn builders collapsed to one ──
{
  const { buildRemoteExec, AMBIENT_OAT_UNSET } = require('../src/remote-shell.js');
  const shq = (x) => `'${String(x).replace(/'/g, `'"'"'`)}'`;
  const line = buildRemoteExec({
    cwd: '/home/u/my dir', shq, pre: 'PRE; ', resolve: 'RES; ',
    tokenAssign: 'T="$(cat /x)" ', acctEnv: 'A="$(cat /y)" ',
    parts: ['K=v', shq('claude'), shq('--resume')],
  });
  ok(line.startsWith("cd '/home/u/my dir' 2>/dev/null; VIBESPACE_SESSION_CWD='/home/u/my dir'; export VIBESPACE_SESSION_CWD; PRE; RES; "), 'composition order: cd → the session cwd export (lane L r5) → pre → resolve');
  ok(line.includes(AMBIENT_OAT_UNSET), 'ambient oat strip present STRUCTURALLY (was five hand-edits in 2.267.0)');
  ok(line.indexOf(AMBIENT_OAT_UNSET) < line.indexOf('T="$(cat /x)"'), 'strip runs BEFORE the deliberate token assign (never unsets it)');
  ok(line.endsWith(`exec env K=v 'claude' '--resume'`), 'exec env carries pre-quoted parts verbatim');
  const hostile = buildRemoteExec({ cwd: `/tmp/$(rm -rf ~)'x`, shq, parts: ['a'] });
  ok(!hostile.includes('$(rm') || hostile.includes(`'/tmp/$(rm`), 'hostile cwd stays inside quotes');
  // ── lane L r5 F3: the SESSION's directory is exported beside the `cd`, STRUCTURALLY (all five builders compose
  // buildRemoteExec — the count below), so a remote agent's `vibespace-browser` fences its writes to the session's
  // project and never to wherever its shell has `cd`ed. The value is the `cd`'s own, quoted by the same shq.
  const { sessionCwdExport } = require('../src/remote-shell.js');
  ok(line.includes(sessionCwdExport('/home/u/my dir', shq)) && sessionCwdExport('/home/u/my dir', shq) === "VIBESPACE_SESSION_CWD='/home/u/my dir'; export VIBESPACE_SESSION_CWD; ", 'lane L r5 F3: buildRemoteExec exports VIBESPACE_SESSION_CWD = the cd\'s own quoted cwd');
  ok(hostile.split(`'/tmp/$(rm -rf ~)'"'"'x'`).length === 3, 'lane L r5 F3: …a hostile cwd is quoted in the export exactly as in the cd (both occurrences inside quotes)');
  ok(tailLineHas(buildRemoteExec({ cwd: '/w', shq, parts: ['K=v'], tail: ' node keeper run sid 0 --' })), 'lane L r5 F3: …the keeper tail form carries it too (the keeper hands its env to the detached CLI)');
  {
    // a REAL sh runs the composed line: the exported value reaches the exec'd command; a hostile cwd runs nothing
    const { execFileSync } = await import('node:child_process');
    const pth = (await import('node:path')).default;
    const dir = (await import('./scratch.mjs')).scratch('remote-shell-cwd'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const weird = pth.join(dir, `a b'c`); fs.mkdirSync(weird);
    const probe = [shq('sh'), shq('-c'), shq('printf %s "$VIBESPACE_SESSION_CWD|$PWD"')];
    try {
      const got = execFileSync('sh', ['-c', buildRemoteExec({ cwd: weird, shq, parts: probe })], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir } });
      ok(got === `${weird}|${weird}`, `lane L r5 F3: a real sh — the exec'd command sees VIBESPACE_SESSION_CWD = the session's cwd (a space and a quote in it) = its PWD (${JSON.stringify(got)})`);
      const pre = buildRemoteExec({ cwd: weird, shq, parts: probe }).replace(sessionCwdExport(weird, shq), '');
      const bad = execFileSync('sh', ['-c', pre], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir } });
      ok(bad === `|${weird}`, `lane L r5 F3 NEGATIVE CONTROL: the pre-r5 line (no export) leaves the command with no session cwd — the leg above can go red (${JSON.stringify(bad)})`);
      const pwn = pth.join(dir, 'pwned');
      execFileSync('sh', ['-c', buildRemoteExec({ cwd: `${dir}/$(touch ${pwn})'x`, shq, parts: probe })], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir } });
      ok(!fs.existsSync(pwn), 'lane L r5 F3: a hostile cwd in the export runs nothing (no $(…) expanded)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const tailLine = buildRemoteExec({ cwd: '/w', shq, parts: ['K=v'], tail: ' node keeper run sid 0 --' });
  ok(tailLine.endsWith('exec env K=v node keeper run sid 0 --'), 'tail form (keeper runTail) appends verbatim');
  // drift guard: ws-handler must never hand-assemble a spawn line again
  const ws = fs.readFileSync(new URL('../src/ws-handler.js', import.meta.url), 'utf-8')
    + fs.readFileSync(new URL('../src/ws-create.js', import.meta.url), 'utf-8');
  const handRolled = (ws.match(/exec env `/g) || []).length + (ws.match(/`exec env/g) || []).length;
  ok(handRolled === 0, `no hand-assembled 'exec env' spawn lines left in ws-handler (found ${handRolled})`);
  ok((ws.match(/buildRemoteExec\(\{/g) || []).length === 5, 'all five builders route through buildRemoteExec');
  ok((ws.match(/VIBESPACE_SESSION_CWD=/g) || []).length === 1 && /`VIBESPACE_SESSION_CWD=\$\{spawnCwd\}`/.test(ws), 'lane L r5 F3 drift guard: ws-create spells VIBESPACE_SESSION_CWD ONCE — the LOCAL argv pair; every remote builder gets it from buildRemoteExec, never a hand-written copy');

  // ── PER-SESSION GIT WORKTREE reaches a REMOTE spawn (owner ruling 9) ──
  // The flag is not a special case anywhere in the transport: the ADAPTER
  // emits it into sessionSpec.args, ws-create shq's every arg into `parts`,
  // and buildRemoteExec composes the line — so this leg proves the whole
  // chain by driving the REAL adapter and the REAL builder, and pins that no
  // remote builder acquired a hand-written worktree branch of its own.
  const { ClaudeCodeAdapter } = require('../src/adapters/claude-code.js');
  const ad = new ClaudeCodeAdapter({ claudeCmd: '/usr/bin/claude', chatWrapper: '/w/chat', ptyWrapper: '/w/pty', buffersDir: '/b' });
  const remoteLine = (opts) => {
    const spec = ad.buildSessionArgs({ cwd: '/home/u/proj', mode: 'chat', ...opts });
    const rcmd = 'claude';
    return buildRemoteExec({ cwd: '/home/u/proj', shq, pre: buildRemoteShellPrelude({ toolsOnPath: true }), parts: ['TERM=xterm-256color', rcmd, ...spec.args.map(shq)] });
  };
  const wtNew = remoteLine({ worktree: true });
  ok(wtNew.includes(` '--worktree'`), 'a remote NEW session carries --worktree, quoted like every other arg (no bespoke transport branch)');
  ok((wtNew.match(/--worktree/g) || []).length === 1, '…exactly once (no duplicate from a second builder)');
  ok(!wtNew.includes('--tmux'), '…and NEVER --tmux (dtach is our persistence layer; the CLI would open a tmux nobody attaches to)');
  ok(!remoteLine({ worktree: true, resumeId: 'abc' }).includes('--worktree'),
    'a remote RESUME carries NO --worktree (the CLI re-enters its own recorded worktree — a second flag would add a SECOND tree on the host)');
  ok(remoteLine({ worktree: true, resumeId: 'abc', fork: true }).includes(` '--worktree'`),
    'a remote FORK carries it again (--fork-session strips the binding)');
  ok(!remoteLine({}).includes('--worktree'), 'an ordinary remote spawn carries nothing new');
  // A hand-written builder would need the flag as a STRING LITERAL; prose in a
  // comment (the preflight block explains the CLI's refusal verbatim) is not a
  // second implementation. Strip comments first so the guard measures CODE.
  const wsCode = ws.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(!/['"`]--worktree/.test(wsCode), 'no remote builder hand-writes a --worktree literal — it can only arrive through the adapter args (drift guard)');

  // ── CLAUDE CODE'S OWN AUTO-CONTINUE reaches EVERY transport OFF (owner ruling
  // 2026-09-22). The switch is inline --settings JSON in the adapter's args, so
  // — like --worktree — it rides every remote builder through `spawnArgs.map(shq)`
  // with no transport branch. Driven with the REAL adapter + the REAL builder:
  const acLine = remoteLine({});
  // (lane L: the same flag also carries the agent-tool allow rules — read the quoted JSON by CONTENT)
  const acJson = (() => { const m = /'--settings' '(\{[^']*\})'/.exec(acLine); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } })();
  ok(!!acJson && acJson.autoContinueAtUsageLimit === false, 'a remote claude spawn carries --settings autoContinueAtUsageLimit:false, quoted like every other arg', acLine.slice(-160));
  ok(!!acJson && Array.isArray(acJson.permissions?.allow) && acJson.permissions.allow.includes('Bash(vibespace-browser:*)'), 'lane L: …and the SAME quoted flag carries the agent-tool allow rules to the remote CLI (no transport branch)');
  ok(!/permissions/.test(remoteLine({ settings: { allowAgentTools: false } })), 'lane L NEGATIVE CONTROL: the row off ⇒ the remote line carries no allow rules');
  ok(!remoteLine({ settings: { autoContinueAtUsageLimit: true } }).includes('autoContinueAtUsageLimit'), 'NEGATIVE CONTROL: the row ON ⇒ the remote line carries nothing (the leg above can say no)');
  const termSpec = ad.buildSessionArgs({ cwd: '/home/u/proj', mode: 'terminal' });
  ok(termSpec.args.includes('--settings') && JSON.parse(termSpec.args[termSpec.args.indexOf('--settings') + 1]).autoContinueAtUsageLimit === false, 'a terminal-mode spec (ssh terminal / dial pty / local dtach) carries it too');
  // TWIN SWEEP (drift guard): ONE buildSessionArgs call feeds every spawn path
  // (local dtach/r6Argv + the five remote builders all read sessionSpec.args ⇒
  // spawnArgs), and every ws-create site that rewrites the --settings value
  // MERGES the parsed JSON (the remote + local statusline injections) — a
  // site that assigned a fresh object would silently drop the switch.
  const wcCode = wsCode;
  ok((wcCode.match(/\.buildSessionArgs\(/g) || []).length === 1, 'exactly ONE buildSessionArgs call feeds every spawn path in ws-create/ws-handler (no second spec builder that could miss the switch)');
  const rewrites = (wcCode.match(/spawnArgs\[si \+ 1\] = sjson/g) || []).length;
  const merges = (wcCode.match(/settingsObj = JSON\.parse\(spawnArgs\[si \+ 1\]\)/g) || []).length;
  ok(rewrites >= 2 && rewrites === merges, `every --settings rewrite in ws-create merges the parsed spawn JSON (${rewrites} rewrite(s), ${merges} merge(s))`);
  ok((("spawnArgs[si + 1] = sjson;").match(/spawnArgs\[si \+ 1\] = sjson/g) || []).length === 1 && (("let settingsObj = {};").match(/settingsObj = JSON\.parse\(spawnArgs\[si \+ 1\]\)/g) || []).length === 0, 'NEGATIVE CONTROL: a rewrite with no merge is what the census counts apart');
  // the statusline merge itself, run on the adapter's real args (the remote terminal injection's exact shape)
  { let spawnArgs = [...termSpec.args]; let settingsObj = {}; const si = spawnArgs.indexOf('--settings'); if (si >= 0 && spawnArgs[si + 1]) { try { settingsObj = JSON.parse(spawnArgs[si + 1]) || {}; } catch {} } settingsObj.statusLine = { type: 'command', command: 'x', padding: 0 }; const sjson = JSON.stringify(settingsObj); if (si >= 0) spawnArgs[si + 1] = sjson; else spawnArgs = [...spawnArgs, '--settings', sjson];
    const o = JSON.parse(spawnArgs[spawnArgs.indexOf('--settings') + 1]);
    ok(o.autoContinueAtUsageLimit === false && o.statusLine && spawnArgs.filter((a) => a === '--settings').length === 1, 'the statusline injection keeps the switch on the ONE flag'); }
}

// ── THE BROWSER SHIM STAYS FIRST ON A REMOTE PATH (design-browser-takeover §4, T2) ──
// The node finder PREPENDS node's own bin dir — on an nvm / npm-global host the
// very dir that holds the real browser CLI — so the tools dir must be prepended
// AFTER it. Three ws-create builders hand-wrote the tools prepend; one ran it
// BEFORE the finder, so the shim shipped to ~/.vibespace/bin was shadowed.
{
  const { TOOLS_ON_PATH } = require('../src/remote-shell.js');
  const both = buildRemoteShellPrelude({ toolsOnPath: true, withNodeFinder: true });
  ok(both.indexOf(TOOLS_ON_PATH) > both.indexOf('VS_NODE=') && both.indexOf('VS_NODE=') > both.indexOf('nvm.sh'), 'composition order: REMOTE_PRELUDE → node finder → tools (the tools prepend runs LAST, so it is FIRST on PATH)');
  const wc = fs.readFileSync(new URL('../src/ws-create.js', import.meta.url), 'utf8');
  ok(!wc.includes('export PATH="$HOME/.vibespace/bin'), 'drift guard: ws-create.js hand-writes NO ~/.vibespace/bin PATH prepend (every builder composes buildRemoteShellPrelude)');
  ok((wc.match(/buildRemoteShellPrelude\(\{/g) || []).length === 3, `the three agent-tool builders (ssh setup, dial pty, dial pipe) compose it (${(wc.match(/buildRemoteShellPrelude\(\{/g) || []).length})`);
  const hs = fs.readFileSync(new URL('../src/hosts.js', import.meta.url), 'utf8');
  ok(/AGENT_TOOLS = \[[^\]]*'agent-browser'/.test(hs), 'the shim is an agent tool (it ships where the prelude puts it first)');
  ok((wc.match(/"\$HOME\/\.vibespace\/bin\/agent-browser"|"\$\{bin\}\/agent-browser"/g) || []).length === 2 && /chmod \+x "\$HOME\/\.vibespace\/bin"\/vibespace-\* "\$HOME\/\.vibespace\/bin\/agent-browser"/.test(hs), 'every ship path chmods the shim (it does not match the vibespace-* glob)');

  // a REAL `sh` over a fake home: no node on PATH, so the finder falls to the
  // (fake) nvm install whose bin dir ALSO holds a fake real browser CLI; the
  // shim sits in ~/.vibespace/bin. After the prelude, the name must resolve
  // to the shim. CONTROL: the pre-fix order (tools before the finder) must
  // resolve to the fake real binary — the leg can say no.
  const { scratch } = await import('./scratch.mjs');
  const { execFileSync } = await import('node:child_process');
  const path = (await import('node:path')).default;
  const root = scratch('remote-shell-shim'); fs.rmSync(root, { recursive: true, force: true });
  const home = path.join(root, 'home'); const nvmBin = path.join(home, '.nvm/versions/node/v0/bin'); const tools = path.join(home, '.vibespace/bin'); const box = path.join(root, 'box');
  for (const d of [nvmBin, tools, box]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(nvmBin, 'node'), '#!/bin/sh\necho fake-node\n', { mode: 0o755 });
  fs.writeFileSync(path.join(nvmBin, 'agent-browser'), '#!/bin/sh\necho REAL\n', { mode: 0o755 });
  fs.copyFileSync(new URL('../data/bin/agent-browser', import.meta.url), path.join(tools, 'agent-browser')); fs.chmodSync(path.join(tools, 'agent-browser'), 0o755);
  // a toolbox PATH with exactly what the finder needs and NO node
  const which = (b) => { for (const d of ['/usr/bin', '/bin', '/usr/local/bin']) { const p = path.join(d, b); if (fs.existsSync(p)) return p; } return null; };
  for (const b of ['ls', 'sort', 'tail', 'dirname', 'cat']) { const p = which(b); if (p) fs.symlinkSync(p, path.join(box, b)); }
  const shPath = which('sh') || '/bin/sh';
  const resolveUnder = (prelude) => execFileSync(shPath, ['-c', prelude + 'command -v agent-browser'], { env: { HOME: home, PATH: box }, encoding: 'utf8' }).trim();
  try {
    const got = resolveUnder(buildRemoteShellPrelude({ toolsOnPath: true, withNodeFinder: true }));
    ok(got === path.join(tools, 'agent-browser'), `a real sh: after the prelude \`agent-browser\` resolves to the SHIM in ~/.vibespace/bin (${got})`);
    const preFix = REMOTE_PRELUDE + TOOLS_ON_PATH + nodeFinder();
    const bad = resolveUnder(preFix);
    ok(bad === path.join(nvmBin, 'agent-browser'), `CONTROL: the pre-fix order (tools before the finder) resolves to the real binary (${bad}) — the leg above can go red`);
    const noTools = resolveUnder(buildRemoteShellPrelude({ toolsOnPath: false, withNodeFinder: true }));
    ok(noTools === path.join(nvmBin, 'agent-browser'), 'integration OFF (no tools on PATH): nothing of ours shadows anything');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
