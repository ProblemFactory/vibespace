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
for (const f of ['src/hosts.js', 'src/ws-handler.js']) {
  const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  ok(!src.includes(LIT_PRE), `${f} has no inlined prelude copy (must import REMOTE_PRELUDE)`);
  ok(!src.includes(LIT_NF), `${f} has no inlined node finder (must import nodeFinder)`);
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
