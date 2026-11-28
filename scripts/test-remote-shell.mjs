#!/usr/bin/env node
// Remote shell prelude unification (2.274.0, campaign Phase 4) — the guard
// against the drift that produced remote-only bugs: EVERY remote command
// builder must go through src/remote-shell.js, not its own copy of the
// PATH/nvm string or the POSIX node finder.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this script runs on a temp home of its own before any of its code
const require = createRequire(import.meta.url);
const { REMOTE_PRELUDE, nodeFinder, buildRemoteShellPrelude } = require('../src/remote-shell.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

{ // dc-twins M9 drift guard: claude's chat transport flags are spelled ONCE (src/harnesses/claude-transport.js) — the
  // local chat-wrapper and ws-create's remote leg both read that list (adapter.chatTransportArgs()), never a literal
  const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const sites = ['src/ws-create.js', 'data/bin/chat-wrapper.js', 'src/adapters/claude-code.js', 'src/harnesses/claude-transport.js'].filter((f) => /['"]--output-format['"]|['"]--permission-prompt-tool['"]/.test(rd(f)));
  ok(sites.join() === 'src/harnesses/claude-transport.js' && gateOf(/chatTransportArgs\(\)/.test(rd('src/ws-create.js'))) && verdictOf(/claude-transport\.js'\)\)\.CHAT_TRANSPORT_ARGS/.test(rd('data/bin/chat-wrapper.js'))), `M9 drift guard: the stream-json flags have ONE spelling (${sites.join(', ')}); ws-create + chat-wrapper read it`);
}
ok(verdictOf(REMOTE_PRELUDE.includes('$HOME/.local/bin')), 'prelude puts ~/.local/bin on PATH (native claude installer target)');
ok(verdictOf(REMOTE_PRELUDE.includes('nvm.sh')), 'prelude sources nvm (the #1 "node: not found" cause on dev machines)');
ok(verdictOf(REMOTE_PRELUDE.trimEnd().endsWith(';')), 'prelude is a composable ;-terminated prefix');
const nf = nodeFinder();
ok(gateOf(nf.includes('command -v node')) && gateOf(nf.includes('.nvm/versions/node')) && verdictOf(nf.includes('/opt/homebrew/bin/node')),
  'node finder covers PATH → nvm → common absolute paths');
ok(verdictOf(nf.includes('export PATH="$(dirname "$VS_NODE")')),
  'node finder EXPORTS node dir onto PATH (revives env-node shebang tools on dash hosts)');
ok(verdictOf(buildRemoteShellPrelude({ toolsOnPath: true }).includes('.vibespace/bin')), 'toolsOnPath adds the agent-tool dir');
ok(!buildRemoteShellPrelude().includes('.vibespace/bin'), 'toolsOnPath is opt-in (a pristine spawn must not see agent tools)');
ok(verdictOf(buildRemoteShellPrelude({ withNodeFinder: true }).includes('VS_NODE')), 'withNodeFinder composes');

// THE DRIFT GUARD: no remote-command file may re-inline the prelude or finder.
const LIT_PRE = 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ]';
const LIT_NF = 'VS_NODE="$(command -v node';
for (const f of ['src/hosts.js', 'src/ws-handler.js', 'src/ws-create.js', 'src/spawn/ssh.js', 'src/spawn/dial.js', 'src/spawn/local.js']) {
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
  ok(verdictOf(line.startsWith("cd '/home/u/my dir' 2>/dev/null; VIBESPACE_SESSION_CWD='/home/u/my dir'; export VIBESPACE_SESSION_CWD; PRE; RES; ")), 'composition order: cd → the session cwd export (lane L r5) → pre → resolve');
  ok(verdictOf(line.includes(AMBIENT_OAT_UNSET)), 'ambient oat strip present STRUCTURALLY (was five hand-edits in 2.267.0)');
  ok(line.indexOf(AMBIENT_OAT_UNSET) < line.indexOf('T="$(cat /x)"'), 'strip runs BEFORE the deliberate token assign (never unsets it)');
  ok(verdictOf(line.endsWith(`exec env K=v 'claude' '--resume'`)), 'exec env carries pre-quoted parts verbatim');
  const hostile = buildRemoteExec({ cwd: `/tmp/$(rm -rf ~)'x`, shq, parts: ['a'] });
  ok(!hostile.includes('$(rm') || verdictOf(hostile.includes(`'/tmp/$(rm`)), 'hostile cwd stays inside quotes');
  // ── lane L r5 F3: the SESSION's directory is exported beside the `cd`, STRUCTURALLY (all five builders compose
  // buildRemoteExec — the count below), so a remote agent's `vibespace-browser` fences its writes to the session's
  // project and never to wherever its shell has `cd`ed. The value is the `cd`'s own, quoted by the same shq.
  const { sessionCwdExport } = require('../src/remote-shell.js');
  ok(gateOf(line.includes(sessionCwdExport('/home/u/my dir', shq))) && sessionCwdExport('/home/u/my dir', shq) === "VIBESPACE_SESSION_CWD='/home/u/my dir'; export VIBESPACE_SESSION_CWD; ", 'lane L r5 F3: buildRemoteExec exports VIBESPACE_SESSION_CWD = the cd\'s own quoted cwd');
  ok(hostile.split(`'/tmp/$(rm -rf ~)'"'"'x'`).length === 3, 'lane L r5 F3: …a hostile cwd is quoted in the export exactly as in the cd (both occurrences inside quotes)');
  ok(verdictOf(tailLineHas(buildRemoteExec({ cwd: '/w', shq, parts: ['K=v'], tail: ' node keeper run sid 0 --' }))), 'lane L r5 F3: …the keeper tail form carries it too (the keeper hands its env to the detached CLI)');
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
  ok(verdictOf(tailLine.endsWith('exec env K=v node keeper run sid 0 --')), 'tail form (keeper runTail) appends verbatim');
  // drift guard: ws-handler must never hand-assemble a spawn line again
  let ws = fs.readFileSync(new URL('../src/ws-handler.js', import.meta.url), 'utf-8')
    + fs.readFileSync(new URL('../src/ws-create.js', import.meta.url), 'utf-8');
  for (const f of ['src/spawn/ssh.js', 'src/spawn/dial.js', 'src/spawn/local.js']) ws += fs.readFileSync(new URL('../' + f, import.meta.url), 'utf-8'); // the transport ladders (lane dc-seams-server)
  const handRolled = (ws.match(/exec env `/g) || []).length + (ws.match(/`exec env/g) || []).length;
  ok(handRolled === 0, `no hand-assembled 'exec env' spawn lines left in ws-handler (found ${handRolled})`);
  ok((ws.match(/buildRemoteExec\(\{/g) || []).length === 5, 'all five builders route through buildRemoteExec');
  ok((ws.match(/VIBESPACE_SESSION_CWD=/g) || []).length === 1 && verdictOf(/`VIBESPACE_SESSION_CWD=\$\{spawnCwd\}`/.test(ws)), 'lane L r5 F3 drift guard: ws-create spells VIBESPACE_SESSION_CWD ONCE — the LOCAL argv pair; every remote builder gets it from buildRemoteExec, never a hand-written copy');

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
  ok(verdictOf(wtNew.includes(` '--worktree'`)), 'a remote NEW session carries --worktree, quoted like every other arg (no bespoke transport branch)');
  ok((wtNew.match(/--worktree/g) || []).length === 1, '…exactly once (no duplicate from a second builder)');
  ok(!wtNew.includes('--tmux'), '…and NEVER --tmux (dtach is our persistence layer; the CLI would open a tmux nobody attaches to)');
  ok(!remoteLine({ worktree: true, resumeId: 'abc' }).includes('--worktree'),
    'a remote RESUME carries NO --worktree (the CLI re-enters its own recorded worktree — a second flag would add a SECOND tree on the host)');
  ok(verdictOf(remoteLine({ worktree: true, resumeId: 'abc', fork: true }).includes(` '--worktree'`)),
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
  ok(!!acJson && gateOf(Array.isArray(acJson.permissions?.allow)) && verdictOf(acJson.permissions.allow.includes('Bash(vibespace-browser:*)')), 'lane L: …and the SAME quoted flag carries the agent-tool allow rules to the remote CLI (no transport branch)');
  ok(!/permissions/.test(remoteLine({ settings: { allowAgentTools: false } })), 'lane L NEGATIVE CONTROL: the row off ⇒ the remote line carries no allow rules');
  ok(!remoteLine({ settings: { autoContinueAtUsageLimit: true } }).includes('autoContinueAtUsageLimit'), 'NEGATIVE CONTROL: the row ON ⇒ the remote line carries nothing (the leg above can say no)');
  const termSpec = ad.buildSessionArgs({ cwd: '/home/u/proj', mode: 'terminal' });
  ok(gateOf(termSpec.args.includes('--settings')) && JSON.parse(termSpec.args[termSpec.args.indexOf('--settings') + 1]).autoContinueAtUsageLimit === false, 'a terminal-mode spec (ssh terminal / dial pty / local dtach) carries it too');
  // TWIN SWEEP (drift guard): ONE buildSessionArgs call feeds every spawn path
  // (local dtach/r6Argv + the five remote builders all read sessionSpec.args ⇒
  // spawnArgs), and every ws-create site that rewrites the --settings value
  // MERGES the parsed JSON (the remote + local statusline injections) — a
  // site that assigned a fresh object would silently drop the switch.
  const wcCode = wsCode;
  ok((wcCode.match(/\.buildSessionArgs\(/g) || []).length === 1, 'exactly ONE buildSessionArgs call feeds every spawn path in ws-create/ws-handler (no second spec builder that could miss the switch)');
  // dc-ws-create: the rewrite is the claude descriptor's spawn.statusline hook (ONE body); ws-create's
  // remote + local statusline sites both call it and rewrite nothing themselves
  const cl = fs.readFileSync(new URL('../src/harnesses/claude.js', import.meta.url), 'utf8');
  const rewrites = (cl.match(/args\[si \+ 1\] = sjson/g) || []).length;
  const merges = (cl.match(/settingsObj = JSON\.parse\(args\[si \+ 1\]\)/g) || []).length;
  ok(rewrites === 1 && rewrites === merges && (wcCode.match(/SP\.statusline\(spawnArgs, /g) || []).length === 2 && !/spawnArgs\[si \+ 1\] = /.test(wcCode),
    `every --settings rewrite merges the parsed spawn JSON — ONE hook (claude.js, ${rewrites} rewrite / ${merges} merge), called by both ws-create statusline sites`);
  ok((("spawnArgs[si + 1] = sjson;").match(/spawnArgs\[si \+ 1\] = sjson/g) || []).length === 1 && (("let settingsObj = {};").match(/settingsObj = JSON\.parse\(spawnArgs\[si \+ 1\]\)/g) || []).length === 0, 'NEGATIVE CONTROL: a rewrite with no merge is what the census counts apart');
  // the statusline merge itself, run on the adapter's real args (the remote terminal injection's exact shape)
  { let spawnArgs = [...termSpec.args]; let settingsObj = {}; const si = spawnArgs.indexOf('--settings'); if (si >= 0 && spawnArgs[si + 1]) { try { settingsObj = JSON.parse(spawnArgs[si + 1]) || {}; } catch {} } settingsObj.statusLine = { type: 'command', command: 'x', padding: 0 }; const sjson = JSON.stringify(settingsObj); if (si >= 0) spawnArgs[si + 1] = sjson; else spawnArgs = [...spawnArgs, '--settings', sjson];
    const o = JSON.parse(spawnArgs[spawnArgs.indexOf('--settings') + 1]);
    ok(o.autoContinueAtUsageLimit === false && gateOf(o.statusLine) && spawnArgs.filter((a) => a === '--settings').length === 1, 'the statusline injection keeps the switch on the ONE flag'); }
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
  const wc = ['src/ws-create.js', 'src/spawn/ssh.js', 'src/spawn/dial.js', 'src/spawn/local.js'].map((f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
  ok(!wc.includes('export PATH="$HOME/.vibespace/bin'), 'drift guard: ws-create.js + src/spawn/ hand-write NO ~/.vibespace/bin PATH prepend (every builder composes buildRemoteShellPrelude)');
  ok((wc.match(/buildRemoteShellPrelude\(\{/g) || []).length === 3, `the three agent-tool builders (ssh setup, dial pty, dial pipe) compose it (${(wc.match(/buildRemoteShellPrelude\(\{/g) || []).length})`);
  // the ssh setup composes it ONCE, at its top; its after-ship branch APPENDS the register (checkpoint cure 411): a slip to
  // `prelude =` would hand every integrated ssh spawn whose ship landed the register alone — no PATH, no node finder, no tools
  const sshSrc = fs.readFileSync(new URL('../src/spawn/ssh.js', import.meta.url), 'utf8');
  const appendsOnce = (s) => (s.match(/prelude \+= \(ownerWriteRefusal\(\) \? '' :/g) || []).length === 1 && !/^\s*prelude = /m.test(s);
  ok(verdictOf(appendsOnce(sshSrc)), 'the ssh setup\'s after-ship branch APPENDS the register to its one composition (`prelude += …`, no `prelude =` reassignment)');
  const slip = sshSrc.replace("prelude += (ownerWriteRefusal() ? '' :", "prelude = (ownerWriteRefusal() ? '' :");
  ok(slip !== sshSrc && !appendsOnce(slip), 'CONTROL: the one-character slip (`prelude = (ownerWriteRefusal() …`) is RED by the same judge');
  const hs = fs.readFileSync(new URL('../src/hosts.js', import.meta.url), 'utf8');
  ok(verdictOf(/AGENT_TOOLS = \[[^\]]*'agent-browser'/.test(hs)), 'the shim is an agent tool (it ships where the prelude puts it first)');
  ok((wc.match(/"\$HOME\/\.vibespace\/bin\/agent-browser"|"\$\{bin\}\/agent-browser"/g) || []).length === 2 && verdictOf(/chmod \+x "\$HOME\/\.vibespace\/bin"\/vibespace-\* "\$HOME\/\.vibespace\/bin\/agent-browser"/.test(hs)), 'every ship path chmods the shim (it does not match the vibespace-* glob)');

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

// B-b83c: THE AGENT'S OWN NODE FIRST on the dial road — the hello says it (nodePath), the hub reads only a PATH (agentNodeOf), and
// the node finder takes it from the run's env (VS_AGENT_NODE: never spliced into the text); none handed ⇒ the release's text
{
  const { agentNodeOf } = require('../src/remote-shell.js');
  const { execFileSync } = await import('node:child_process');
  const RELEASED_NF = 'VS_NODE="$(command -v node 2>/dev/null)"; '
    + '[ -z "$VS_NODE" ] && VS_NODE="$(ls -1 "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort | tail -1)"; '
    + 'if [ -z "$VS_NODE" ]; then for vs_c in /usr/local/bin/node /usr/bin/node /opt/homebrew/bin/node "$HOME/.local/bin/node"; do [ -x "$vs_c" ] && VS_NODE="$vs_c" && break; done; fi; '
    + '[ -n "$VS_NODE" ] && export PATH="$(dirname "$VS_NODE"):$PATH"; ';
  ok(nodeFinder() === RELEASED_NF && nodeFinder({}) === RELEASED_NF && nodeFinder({ agentNode: false }) === RELEASED_NF, 'B-b83c: with no agent node handed, the node finder is byte for byte the release\'s text (an older agent, the ssh road: asked nothing new)');
  ok(gateOf(nodeFinder({ agentNode: true }).endsWith(RELEASED_NF)) && gateOf(nodeFinder({ agentNode: true }).includes('"$VS_AGENT_NODE"')) && !/VS_AGENT_NODE=[^"]/.test(nodeFinder({ agentNode: true })), 'B-b83c: handed, the finder reads the agent\'s node from the run\'s env first (VS_AGENT_NODE, quoted), then the release\'s rungs — the path is never typed into the text');
  ok(agentNodeOf({ nodePath: '/opt/agent/node/bin/node' }) === '/opt/agent/node/bin/node' && agentNodeOf({ nodePath: 'C:\\Program Files\\vibespace\\node.exe', platform: 'win32' }) === 'C:/Program Files/vibespace/node.exe' && agentNodeOf({ nodePath: 'd:/n/node.exe', platform: 'win32' }) === 'd:/n/node.exe'
    && agentNodeOf({ nodePath: 'C:/x/node', platform: 'linux' }) === null && agentNodeOf({ nodePath: '/' + 'x'.repeat(1024) }) === null && agentNodeOf({ nodePath: '/' + 'x'.repeat(1023) }) === '/' + 'x'.repeat(1023)
    && gateOf([undefined, null, '', 'node', 'bin/node', '/a\nb', '/a\u0000b', 42, '\u202e/node', '/opt/\u202enode', '/opt/\u2066x\u2069/node', '/opt/\u200fnode', '/opt/\u061cnode'].every((v) => agentNodeOf({ nodePath: v }) === null)) && agentNodeOf(null) === null && agentNodeOf({}) === null,
    'B-b83c: the hub reads the hello\'s nodePath only as a PATH (absolute POSIX; a drive path from a Windows agent, given forward slashes); a name, a relative path, a control character, over 1024 characters, a drive path from another platform, not a string, absent ⇒ none');
  // the finder in a REAL sh: the agent's node (a planted executable) wins over the PATH's; not executable / not handed ⇒ the release's rungs
  const os = await import('node:os'), pth = await import('node:path');
  const root = fs.mkdtempSync(pth.join(os.tmpdir(), 'vs-b83c-'));
  try {
    const agentNode = pth.join(root, 'agent node', 'node'), pathNode = pth.join(root, 'bin', 'node'), notExec = pth.join(root, 'plain', 'node');
    for (const f of [agentNode, pathNode, notExec]) fs.mkdirSync(pth.dirname(f), { recursive: true });
    fs.writeFileSync(agentNode, '#!/bin/sh\nexit 0\n', { mode: 0o755 }); fs.writeFileSync(pathNode, '#!/bin/sh\nexit 0\n', { mode: 0o755 }); fs.writeFileSync(notExec, 'x\n', { mode: 0o644 });
    const run = (text, vsAgent) => execFileSync('/bin/sh', ['-c', `${text}printf %s "$VS_NODE"`], { encoding: 'utf8', timeout: 10000, env: { PATH: `${pth.dirname(pathNode)}:/usr/bin:/bin`, HOME: root, ...(vsAgent ? { VS_AGENT_NODE: vsAgent } : {}) } });
    const got = { handed: run(nodeFinder({ agentNode: true }), agentNode), notExec: run(nodeFinder({ agentNode: true }), notExec), dir: run(nodeFinder({ agentNode: true }), pth.dirname(agentNode)), unset: run(nodeFinder({ agentNode: true })), control: run(nodeFinder(), agentNode) };
    ok(got.handed === agentNode && got.notExec === pathNode && got.dir === pathNode && got.unset === pathNode, `B-b83c: in a real sh the agent's node (a folder with a space) wins over the PATH's; one that is not executable, a FOLDER, or none handed falls to the release's rungs (${JSON.stringify(got)})`);
    ok(got.control === pathNode, 'RED CONTROL (the finder without the agent\'s rung, as released): the PATH\'s node answers though the agent handed its own');
    // THE GIT BASH LINES, proven here (主开发 r317 (1)): a planted cygpath on the scratch PATH. One that maps the Windows drive path
    // to a scratch file ⇒ the agent's node wins; one that exits 1 ⇒ the handed value is tried AS IT STANDS (no such file here) ⇒
    // the release's rungs. NOT MEASURED in Git Bash itself (no Windows machine in our gates)
    const cyg = pth.join(root, 'cyg-ok'), cygBad = pth.join(root, 'cyg-bad'), WINP = 'C:/Program Files/vibespace/node.exe';
    for (const d of [cyg, cygBad]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(pth.join(cyg, 'cygpath'), `#!/bin/sh\n[ "$1" = "-u" ] && [ "$2" = ${JSON.stringify(WINP)} ] && printf '%s' ${JSON.stringify(agentNode)} && exit 0\nexit 1\n`, { mode: 0o755 });
    fs.writeFileSync(pth.join(cygBad, 'cygpath'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const runIn = (extra, text, vsAgent) => execFileSync('/bin/sh', ['-c', `${text}printf %s "$VS_NODE"`], { encoding: 'utf8', timeout: 10000, env: { PATH: `${extra}:${pth.dirname(pathNode)}:/usr/bin:/bin`, HOME: root, VS_AGENT_NODE: vsAgent } });
    const viaCyg = runIn(cyg, nodeFinder({ agentNode: true }), WINP), cygFails = runIn(cygBad, nodeFinder({ agentNode: true }), WINP), cygBadButFile = runIn(cygBad, nodeFinder({ agentNode: true }), agentNode);
    ok(viaCyg === agentNode && cygFails === pathNode && cygBadButFile === agentNode, `B-b83c: the Git Bash lines with a planted cygpath — a drive path it maps to the agent's node wins; a cygpath that fails leaves the value as it stands (not a file here ⇒ the release's rungs; a real file ⇒ it) (${JSON.stringify({ viaCyg, cygFails, cygBadButFile })})`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  // the wiring: the hello says it, the hub judges its shape, the dial road's two finder sites and the scanner's fallback take it
  const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const AG = rd('src/agentd/agentd.js'), CL = rd('src/agentd/client.js'), DL = rd('src/spawn/dial.js'), HS = rd('src/hosts.js');
  ok(gateOf(AG.includes('          nodePath: process.execPath, //')) && verdictOf(CL.includes("if (msg.nodePath != null && typeof msg.nodePath !== 'string') return no('its nodePath is not a string');")),
    'WIRING: the agent\'s hello-ack says nodePath (process.execPath); the hub\'s greeting judge refuses a nodePath that is no string (its size is the hello\'s own bound: a long real path never locks a device out)');
  ok(gateOf(DL.includes('+ nodeFinder({ agentNode: !!agentNode })')) && gateOf(DL.includes('...(agentNode ? { VS_AGENT_NODE: agentNode } : {})')) && gateOf(HS.includes("nodeFinder({ agentNode: !!agentNode })")) && gateOf(HS.includes('...(agentNode ? { env: { VS_AGENT_NODE: agentNode } } : {})'))
    && gateOf(HS.includes('await dm.runStream(HostManager.scannerNodeOf(dm), [scanPath]')) && gateOf(HS.includes("static scannerNodeOf(dm) { return agentNodeOf(helloOf(dm)) || 'node'; }")) && gateOf(HS.includes("const helloOf = (dm) => { try { return typeof dm.helloInfo === 'function' ? dm.helloInfo() : dm.status().info; } catch { return null; } };")) && (HS.match(/\.\.\.\(env \? \{ env \} : \{\}\)/g) || []).length === 2,
    'WIRING: the dial road\'s hook register (spawn/dial.js) and the tools status (hosts.js) hand VS_AGENT_NODE in the run\'s env with the agent\'s rung; the dial run carries that env; the scanner\'s fallback runs the agent\'s node first');
}

{ // B-99b9 — THE DRIFT GUARD of the path field's remote script (src/dir-slice-script.js: what the host rung runs on another machine —
  // its TWO asks, the typed folders and the rest — and its reader). ONE implementation: one script builder, one reader; written for a
  // plain POSIX sh — dash, busybox ash, bash as sh (macOS /bin/sh) — and nothing beyond them; run here under every one this machine has.
  const DS = require('../src/dir-slice-script.js');
  const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const { spawnSync } = require('node:child_process');
  const os = require('node:os'), path = require('node:path');
  const FULL = DS.sliceScript({ list: ['~', '/abs/x y', "~/it's"], probes: ['~/p'], files: true, index: true, names: true, skip: ['/mnt/z'] });
  // (1) nothing beyond a plain POSIX sh (a fixed list of the forms bash or zsh have and it lacks; `[[:space:]]` is POSIX, `[[ ` is not)
  const BEYOND = [[/(^|[\s;])\[\[\s/, '[[ … ]]'], [/(^|[\s;])function\s/, 'function'], [/(^|[\s;{])local\s/, 'local'], [/<\(/, 'process substitution'], [/\$'/, "$'…'"],
    [/\$\{[A-Za-z_][A-Za-z_0-9]*\/\//, '${x//}'], [/=~/, '=~'], [/echo -e/, 'echo -e'], [/(^|[\s;])\(\(/, '(( ))'], [/(^|[\s;])source\s/, 'source'],
    [/&>/, '&>'], [/\|&/, '|&'], [/(^|[\s;])(declare|typeset|pushd|popd|shopt|mapfile|readarray)\s/, 'a bash builtin'], [/[A-Za-z_]\w*=\(/, 'an array'], [/\$\{[A-Za-z_]\w*:[0-9]/, '${x:n}']];
  const beyond = BEYOND.filter(([re]) => re.test(FULL)).map(([, n]) => n);
  ok(!beyond.length, `B-99b9: the remote script uses nothing beyond a plain POSIX sh (none of ${BEYOND.length} bash / zsh forms)${beyond.length ? ' — found: ' + beyond.join(', ') : ''}`);
  const LS1 = FULL.slice(FULL.indexOf('ls1() {'), FULL.indexOf('\n', FULL.indexOf('ls1() {')));
  ok(LS1.indexOf('[ -L "$e" ]') > 0 && LS1.indexOf('[ -L "$e" ]') < LS1.indexOf('[ -e "$e" ]') && verdictOf(LS1.includes('p=${d%/}; for e in "$p"/*')),
    'B-99b9: in the lister a LINK is asked about BEFORE any test that would follow it (`[ -L ]` before `[ -e ]`), and the children of / are /x (never //x)');
  // (2) THE WRITER AND ITS READER, one set of rows: every row the script prints is one parseSlice reads, and every row it reads is printed
  const SRC = rd('src/dir-slice-script.js');
  const wrote = new Set([...FULL.matchAll(/(?:printf '|\\n|print ")([A-Za-z])\\t/g)].map((m) => m[1]));   // a printf's first row, a row after a \n in one format, an awk print's row
  const reads = new Set([...SRC.slice(SRC.indexOf('function parseSlice')).matchAll(/case '([A-Za-z])':/g)].map((m) => m[1]));
  ok(wrote.size >= 14 && gateOf([...wrote].every((t) => reads.has(t))) && gateOf([...reads].every((t) => wrote.has(t))) && verdictOf(FULL.endsWith('echo VS-SLICE-END')),
    `B-99b9: the script's rows and its reader's are ONE set (${[...wrote].sort().join('')} = ${[...reads].sort().join('')}) and it ends with VS-SLICE-END`);
  // (3) RUN under each shell this machine has: a folder listed with a kid; a BROKEN link listed by its target AS WRITTEN (never tested,
  // never followed — the release dropped it after a test); a name holding a TAB never listed (it could fake a row); a probe stated
  const H = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rs99-'));
  fs.mkdirSync(path.join(H, 'a', 'kid'), { recursive: true }); fs.mkdirSync(path.join(H, 'b')); fs.mkdirSync(path.join(H, 'a', 'bad\tname'));
  fs.symlinkSync('../gone/nowhere', path.join(H, 'a', 'lnk'));
  const script = DS.sliceScript({ list: ['~/a'], probes: ['~/b'] });
  const have = (c) => spawnSync('sh', ['-c', `command -v ${c} >/dev/null 2>&1`]).status === 0;
  const SHELLS = [['sh', ['sh']], ['dash', ['dash']], ['busybox sh', ['busybox', 'sh']], ['bash --posix', ['bash', '--posix']]].filter(([, a]) => have(a[0]) && (a[0] !== 'busybox' || spawnSync('busybox', ['sh', '-c', 'true']).status === 0));
  const ran = SHELLS.map(([name, argv]) => {
    const r = spawnSync(argv[0], [...argv.slice(1), '-c', script], { env: { HOME: H, PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 8000 });
    const x = DS.parseSlice(String(r.stdout || '')), a = x.dirs.find((d) => d.path === path.join(H, 'a')) || { kids: [] };
    const lnk = a.kids.find((k) => k.name === 'lnk');
    return { name, ok: x.done && x.home === H && a.kids.some((k) => k.name === 'kid') && !!lnk && lnk.link === path.join(H, 'gone', 'nowhere') && !a.kids.some((k) => k.name.includes('\t')) && x.probes.some((p) => p.path === path.join(H, 'b') && p.exists), lnk: lnk && lnk.link };
  });
  fs.rmSync(H, { recursive: true, force: true });
  ok(SHELLS.length >= 1 && verdictOf(ran.every((r) => r.ok)), `B-99b9: the script under ${ran.map((r) => r.name).join(', ') || 'no shell'}: the folder listed, a broken link listed by its target as written (${JSON.stringify(ran.map((r) => r.lnk))}: never tested, never followed), a name with a tab not listed, the probe stated`);
  const absent = ['dash', 'busybox sh', 'bash --posix'].filter((n) => !ran.some((r) => r.name === n));
  if (absent.length) console.log(`  · not on this machine, so not run here: ${absent.join(', ')} (the forms they share are checked in (1))`);
  // (4) THE HUB READS WHAT IT WROTE: both asks (the typed folders and the rest) are this one script, read by this one reader; the ssh
  // rung runs it under plain sh, never the login prelude
  const HS2 = rd('src/hosts.js');
  ok(gateOf(HS2.includes('e.p = run(DS.sliceScript({ list, files })).then((out) => {')) && gateOf(HS2.includes('r2.p = run(DS.sliceScript({ ...want, files })).then((out) => {')) && (HS2.split('const r = DS.parseSlice(out);').length - 1) >= 2
    && verdictOf(HS2.includes("return String(await this._ssh(h, `exec sh -c '${script.replace(/'/g, `'\\\\''`)}'`, { timeoutMs: RUN_MS, connectTimeoutS: 3 }));")),
    'B-99b9 WIRING: the host rung writes both asks with the one script builder and reads both with the one reader; the ssh rung runs it under plain sh (no login prelude)');
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
