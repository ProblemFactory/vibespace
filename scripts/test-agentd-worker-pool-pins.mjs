#!/usr/bin/env node
// THE DEVICE AGENT'S WORKER POOL — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-agentd-worker-pool.mjs, whose real pools, the wedged-worker exits and their controls
// stay there: §4 the daemon runs THIS pool (and its re-exec and SIGTERM exit through it). Each reads the file it pins BY NAME,
// so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-agentd-worker-pool-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d !== undefined ? ' — ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''}`); } };

console.log('— §4 the daemon runs THIS pool —');
const agentd = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
ok(/require\('\.\/worker-pool\.js'\)\.createWorkerPool\(\{ file: __filename, workerData: \{ role: 'agentd-worker' \}/.test(agentd), "WIRING PIN: agentd.js builds its pool with createWorkerPool over its OWN bundle (__filename, role 'agentd-worker')");
ok(!/new wt\.Worker\(/.test(agentd), 'WIRING PIN: agentd.js spawns no Worker of its own (one pool implementation, the bounded one)');
ok(/handOver\(\{ server, log, exit: exitDaemon, stay: /.test(agentd) && /spawnNext: \(\) => \{/.test(agentd) && /try \{ started = spawnNext\(\) !== false; \} catch[^\n]*\n\s*if \(started\) \{ exit\(0\); return; \}/.test(fs.readFileSync(path.join(REPO, 'src/agentd/reexec.js'), 'utf8')) && /SIGTERM — exiting \(sessions unaffected by design\)'\); exitDaemon\(0\);/.test(agentd) && /function exitDaemon\(code\) \{ if \(workerPool\) workerPool\.exit\(code\);/.test(agentd),
  'WIRING PIN (verify r1): the self-upgrade\'s re-exec (reexec.js handOver: spawnNext, then exit = exitDaemon — int206) and SIGTERM exit through exitDaemon → pool.exit (a wedged worker cannot hold them)');

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
