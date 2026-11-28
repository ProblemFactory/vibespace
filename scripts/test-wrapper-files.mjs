#!/usr/bin/env node
// resolveWrapperFiles (2.339.2): the sidecar/buffer pair must resolve to the
// files the wrapper ACTUALLY maintains, even for counter-collision sessions
// whose socket name and wrapper-env id diverged (the 设备运维大师 incident:
// boot-restore read a nonexistent sidecar into catch{} on every restart and
// silently lost streaming/goal/todos/buffer for those sessions).
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveWrapperFiles } = require('../src/server/wrapper-files.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-wf-'));
try {
  // 1. healthy session: expected pair exists → returned untouched, no /proc walk
  fs.writeFileSync(path.join(tmp, 'sess-1-123.json'), '{}');
  const r1 = resolveWrapperFiles(tmp, 'sess-1-123', '/nonexistent/sock');
  ok(r1.sidecar === path.join(tmp, 'sess-1-123.json'), 'existing sidecar wins without any /proc walk');

  // 2. missing sidecar + no matching process → falls back to the expected pair
  const r2 = resolveWrapperFiles(tmp, 'sess-9-999', path.join(tmp, 'no-such-socket'));
  ok(r2.buf === path.join(tmp, 'sess-9-999.buf') && r2.sidecar === path.join(tmp, 'sess-9-999.json'),
    'no process match → expected pair (never throws)');

  // 3. REAL /proc resolution: spawn a decoy process whose argv mimics the
  //    dtach master shape (dtach\0-c\0<sock>…chat-wrapper.js…<buf>)
  const sock = path.join(tmp, 'cw-5-555');
  const buf = path.join(tmp, 'sess-4-444.buf');
  fs.writeFileSync(buf.replace(/\.buf$/, '.json'), JSON.stringify({ streaming: false }));
  const { spawn } = await import('node:child_process');
  // argv[0] must literally contain 'dtach' and the args '-c <sock> … chat-wrapper.js … <buf>'
  const decoyPath = path.join(tmp, 'dtach');
  fs.writeFileSync(decoyPath, '#!/bin/bash\nsleep 15\n'); fs.chmodSync(decoyPath, 0o755);
  const decoy = spawn(decoyPath, ['-c', sock, 'x', 'node', 'chat-wrapper.js', buf, buf.replace(/\.buf$/, '.json')], { stdio: 'ignore', detached: true });
  // B-b403: the decoy leads its own group, so it is ended ONCE through it — below, else at exit, else on a signal (raised again after)
  let decoyEnded = false, decoyMembers = [];   // B-b403 cure 2: its members, read while it lived (they hold the group past a reaped leader)
  // …and only while its leader is not reaped (the handle: a live or zombie leader holds the group id — never a stranger's group)
  const memberAlive = (p) => { try { const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'), f = st.slice(st.lastIndexOf(')') + 2).split(' '); return f[0] !== 'Z' && f[0] !== 'X' && Number(f[2]) === decoy.pid; } catch { return false; } };   // alive AND still in its group
  const endDecoy = () => { if (decoyEnded) return; decoyEnded = true; try { if (((decoy.exitCode === null && decoy.signalCode === null) || decoyMembers.some(memberAlive)) && Number.isInteger(decoy.pid) && decoy.pid > 1) process.kill(-decoy.pid, 'SIGKILL'); } catch { } };
  process.once('exit', endDecoy);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.once(sig, () => { endDecoy(); process.kill(process.pid, sig); });
  await new Promise((r) => setTimeout(r, 300));
  const r3 = resolveWrapperFiles(tmp, 'sess-5-555', sock);
  // B-b403 (lane bl-scratch, 2026-11-17): the decoy is a bash script whose `sleep 15` is a child of its own — a pid kill of the
  // script left the sleep behind every run; the decoy leads its own group (detached) and the GROUP ends
  const childrenOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number); } catch { return []; } };
  { const end = Date.now() + 5000; while (!childrenOf(decoy.pid).length && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); }   // the condition, not a clock
  const decoyKids = childrenOf(decoy.pid); decoyMembers = decoyKids;
  endDecoy();
  const aliveW = (p) => { try { return !/^\d+ \([^)]*\) [ZX]/.test(fs.readFileSync(`/proc/${p}/stat`, 'utf8')); } catch { return false; } };
  { const end = Date.now() + 5000; while (decoyKids.some(aliveW) && Date.now() < end) await new Promise((r) => setTimeout(r, 50)); }
  ok(decoyKids.length === 1 && !decoyKids.some(aliveW), `B-b403: the decoy ends with its group — its own sleep too (${decoyKids.length} child, ${decoyKids.filter(aliveW).length} alive)`);
  ok(r3.buf === buf && r3.sidecar === buf.replace(/\.buf$/, '.json'),
    'counter-collision shape: wrapper files resolved from the socket process argv', JSON.stringify(r3));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
