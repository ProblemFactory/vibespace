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
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
