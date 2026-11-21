#!/usr/bin/env node
// THE CLI COMMAND REFRESH — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-cli-cmd-refresh.mjs, whose helper legs and real scratch server stay there: ② the wiring (server.js
// holds no resolver, cli-env registers every harness, ws-create re-checks ONCE before the one local argv, cliCmds is in the ws
// contract). Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-cli-cmd-refresh-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0, skipped = 0;
const ok = (c, n) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } return !!c; };

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => { try { return fs.readFileSync(path.join(repo, f), 'utf8'); } catch { return ''; } };

const done = () => {
  console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
  process.exit(fail ? 1 : 0);
};

// ═══ ② wiring pins ══════════════════════════════════════════════════════════
console.log('\n② wiring');
{
  const server = read('server.js'), cliEnv = read('src/server/cli-env.js'), wsCreate = read('src/ws-create.js');
  ok(!/function resolveCmd\s*\(/.test(server) && /const \{ resolveCmd \} = require\('\.\/src\/server\/cli-cmd\.js'\)/.test(server),
    'server.js holds no resolver of its own — it imports THE one (boot and spawn share one lookup)');
  ok(/cliCmds\.register\('claude'/.test(cliEnv) && /cliCmds\.register\('codex'/.test(cliEnv) && /for \(const id of Object\.keys\(ACP_COMMANDS\)\)[\s\S]{0,40}cliCmds\.register\(id/.test(cliEnv),
    'cli-env registers claude, codex and every ACP harness where they are resolved');
  const at = wsCreate.indexOf('try { spawnCmd = await cliCmds.forSpawn(backend, spawnCmd); } catch (e) {');
  const argv = wsCreate.indexOf('const r6Line = sessionSpawnLine('); // lane antigravity-spawn-argv: THE line (src/spawn/line.js)
  ok(at > 0 && argv > at && (wsCreate.match(/const r6Line = sessionSpawnLine\(/g) || []).length === 1 && (wsCreate.match(/cliCmds\.forSpawn\(/g) || []).length === 1,
    'ws-create re-checks the command ONCE, right BEFORE the ONE local argv every local spawn runs (pty terminal, chat wrapper, daemon pipe)');
  ok(/'cliCmds'/.test(read('src/ws-handler.js')), 'cliCmds is in WS_CTX_CONTRACT');
}

done();
