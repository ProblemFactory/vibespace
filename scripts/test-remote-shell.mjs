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
// ── buildRemoteExec (2.279.0): the five spawn builders collapsed to one ──
{
  const { buildRemoteExec, AMBIENT_OAT_UNSET } = require('../src/remote-shell.js');
  const shq = (x) => `'${String(x).replace(/'/g, `'"'"'`)}'`;
  const line = buildRemoteExec({
    cwd: '/home/u/my dir', shq, pre: 'PRE; ', resolve: 'RES; ',
    tokenAssign: 'T="$(cat /x)" ', acctEnv: 'A="$(cat /y)" ',
    parts: ['K=v', shq('claude'), shq('--resume')],
  });
  ok(line.startsWith("cd '/home/u/my dir' 2>/dev/null; PRE; RES; "), 'composition order: cd → pre → resolve');
  ok(line.includes(AMBIENT_OAT_UNSET), 'ambient oat strip present STRUCTURALLY (was five hand-edits in 2.267.0)');
  ok(line.indexOf(AMBIENT_OAT_UNSET) < line.indexOf('T="$(cat /x)"'), 'strip runs BEFORE the deliberate token assign (never unsets it)');
  ok(line.endsWith(`exec env K=v 'claude' '--resume'`), 'exec env carries pre-quoted parts verbatim');
  const hostile = buildRemoteExec({ cwd: `/tmp/$(rm -rf ~)'x`, shq, parts: ['a'] });
  ok(!hostile.includes('$(rm') || hostile.includes(`'/tmp/$(rm`), 'hostile cwd stays inside quotes');
  const tailLine = buildRemoteExec({ cwd: '/w', shq, parts: ['K=v'], tail: ' node keeper run sid 0 --' });
  ok(tailLine.endsWith('exec env K=v node keeper run sid 0 --'), 'tail form (keeper runTail) appends verbatim');
  // drift guard: ws-handler must never hand-assemble a spawn line again
  const ws = fs.readFileSync(new URL('../src/ws-handler.js', import.meta.url), 'utf-8')
    + fs.readFileSync(new URL('../src/ws-create.js', import.meta.url), 'utf-8');
  const handRolled = (ws.match(/exec env `/g) || []).length + (ws.match(/`exec env/g) || []).length;
  ok(handRolled === 0, `no hand-assembled 'exec env' spawn lines left in ws-handler (found ${handRolled})`);
  ok((ws.match(/buildRemoteExec\(\{/g) || []).length === 5, 'all five builders route through buildRemoteExec');

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
  ok(acLine.includes(`'--settings' '{"autoContinueAtUsageLimit":false}'`), 'a remote claude spawn carries --settings autoContinueAtUsageLimit:false, quoted like every other arg', acLine.slice(-160));
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

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
