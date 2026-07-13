#!/usr/bin/env node
// E2E test for data/bin/vibespace-remote-keeper — the remote-side persistence
// layer for remote chat sessions (2.124.0). Simulates the local chat-wrapper's
// life: attach, lose the pipe (ssh drop), reattach with a byte offset, and the
// final _remote_exit sentinel. The "claude" stand-in echoes stdin lines and
// exits on "quit". Run: node scripts/test-remote-keeper.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const KEEPER = path.join(dir, '..', 'data', 'bin', 'vibespace-remote-keeper');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-keeper-'));
const env = { ...process.env, VIBESPACE_KEEPER_DIR: tmp };
const SID = 'testsess-1';
const STUB = `process.stdin.setEncoding("utf8");let b="";process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))!==-1){const l=b.slice(0,i);b=b.slice(i+1);if(l==="quit")process.exit(7);console.log("echo:"+l);}});setInterval(()=>{},1e3);`;

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function attach(offset) {
  const p = spawn(process.execPath, [KEEPER, 'run', SID, String(offset), '--', process.execPath, '-e', STUB], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  p.out = Buffer.alloc(0);
  p.stdout.on('data', (d) => { p.out = Buffer.concat([p.out, d]); });
  p.errText = '';
  p.stderr.on('data', (d) => { p.errText += d; });
  return p;
}
const meta = () => { try { return JSON.parse(fs.readFileSync(path.join(tmp, SID + '.json'), 'utf8')); } catch { return null; } };

console.log('— keeper: first contact starts the daemon —');
const a1 = attach(0);
await sleep(2500); // daemon start + socket wait
a1.stdin.write('hello\n');
await sleep(800);
check('echoed through socket→stdin, buffer→stdout', a1.out.toString().includes('echo:hello'), JSON.stringify(a1.out.toString()));
const m1 = meta();
check('meta carries keeper+child pids', m1 && m1.keeperPid > 0 && m1.childPid > 0, JSON.stringify(m1));

console.log('— pipe death (ssh drop): daemon survives —');
const offset1 = a1.out.length; // wrapper-style byte accounting
a1.kill('SIGKILL');
await sleep(400);
let daemonAlive = true;
try { process.kill(m1.keeperPid, 0); } catch { daemonAlive = false; }
check('daemon survives attach death', daemonAlive, '');
let stubAlive = true;
try { process.kill(m1.childPid, 0); } catch { stubAlive = false; }
check('child (claude stand-in) survives attach death', stubAlive, '');

console.log('— reattach with offset: no replay, input still works —');
const a2 = attach(offset1);
await sleep(1200);
check('no replayed bytes at the exact offset', a2.out.length === 0, JSON.stringify(a2.out.toString()));
a2.stdin.write('again\n');
await sleep(800);
check('post-reconnect input echoes', a2.out.toString() === 'echo:again\n', JSON.stringify(a2.out.toString()));

console.log('— remote exit: sentinel + no restart —');
a2.stdin.write('quit\n');
await sleep(1200);
const tail = a2.out.toString();
check('sentinel _remote_exit with the real exit code', tail.includes('"_remote_exit"') && tail.includes('"code":7'), JSON.stringify(tail));
const m2 = meta();
check('meta records exited', m2 && m2.exited === 7, JSON.stringify(m2));
await sleep(600);
const a3 = attach(0);
await sleep(1500);
check('run after exit only drains (never restarts the session)', a3.out.toString().includes('"_remote_exit"') && !fs.existsSync(path.join(tmp, SID + '.sock')), JSON.stringify(a3.out.toString().slice(0, 120)));
check('exit code 3 = ended', a3.exitCode === 3, String(a3.exitCode)); // already exited by now — read the property, the event has fired

console.log('— stop mode kills a live daemon —');
const SID2 = 'testsess-2';
const b1 = spawn(process.execPath, [KEEPER, 'run', SID2, '0', '--', process.execPath, '-e', STUB], { env, stdio: ['pipe', 'pipe', 'pipe'] });
await sleep(2500);
const mb = JSON.parse(fs.readFileSync(path.join(tmp, SID2 + '.json'), 'utf8'));
const stop = spawn(process.execPath, [KEEPER, 'stop', SID2], { env, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => stop.on('exit', r));
await sleep(500);
let stopped = true;
try { process.kill(mb.childPid, 0); stopped = false; } catch { }
check('stop kills the child', stopped, '');
b1.kill('SIGKILL');

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall remote-keeper tests passed');
process.exit(0);
