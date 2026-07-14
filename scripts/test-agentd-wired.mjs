#!/usr/bin/env node
// M2 WIRED-CHAIN e2e: the full production pipeline with the agentd path ON —
//   chat-wrapper (remote mode) → agentd-attach bridge → standing daemon →
//   persistent pipe session (stub claude)
// exactly as ws-handler assembles it (config file + __VS_OFFSET__ + sentinel).
// Proves the wrapper's reconnect machinery works UNCHANGED over the new
// transport: bytes flow, a killed bridge auto-reconnects with the consumed
// offset (no loss/dup), and the child's real exit finalizes the wrapper.
// Run: node scripts/test-agentd-wired.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-wired-'));
const AGENTD_ROOT = path.join(tmp, 'agentd');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// build bundles
const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const daemonBundle = path.join(tmp, 'agentd.js');
const attachBundle = path.join(tmp, 'attach.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${daemonBundle}`], { cwd: repo });
execFileSync('npx', ['esbuild', 'src/agentd/attach-cli.js', '--bundle', '--platform=node', `--outfile=${attachBundle}`], { cwd: repo });
// install into the throwaway root + provision the token
const instDir = path.join(AGENTD_ROOT, version); fs.mkdirSync(instDir, { recursive: true });
fs.copyFileSync(daemonBundle, path.join(instDir, 'agentd.js'));
fs.symlinkSync(instDir, path.join(AGENTD_ROOT, 'current'));
const stateDir = path.join(AGENTD_ROOT, 'state'); fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const TOKEN = 'vsht_wired' + crypto.randomBytes(6).toString('hex');
fs.writeFileSync(path.join(stateDir, 'token'), TOKEN, { mode: 0o600 });

// fake-ssh: strips --, execs the command string (the bridge doesn't care)
const fakeSsh = path.join(tmp, 'fake-ssh');
fs.writeFileSync(fakeSsh, `#!/bin/sh\nwhile [ "$1" = "--" ]; do shift; done\nexec sh -c "$1"\n`, { mode: 0o755 });

// stub "claude": stream-json-ish — emits lines, echoes input, exits on quit
const STUB = 'let n=0;process.stdin.setEncoding("utf8");let b="";process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))!==-1){const l=b.slice(0,i);b=b.slice(i+1);if(l.includes("quit"))process.exit(7);console.log(JSON.stringify({type:"echo",line:l}))}});const t=setInterval(()=>{console.log(JSON.stringify({type:"tick",n}));n++;if(n>=30)clearInterval(t)},60);';

// the ws-handler-shaped session config for agentd-attach
const cfgFile = path.join(tmp, 'session-wired.json');
fs.writeFileSync(cfgFile, JSON.stringify({
  sshBin: fakeSsh,
  sshArgs: [],
  remoteCmd: `VIBESPACE_AGENTD_ROOT=${JSON.stringify(AGENTD_ROOT)} exec node ${JSON.stringify(path.join(AGENTD_ROOT, 'current', 'agentd.js'))} --stdio`,
  hostToken: TOKEN,
  sid: 'wired-1',
  version,
  spawn: { cmd: process.execPath, args: ['-e', STUB], cwd: os.homedir() },
}), { mode: 0o600 });

// run the REAL chat-wrapper in remote mode with agentd-attach as its child,
// exactly as the dtach line would (buf/meta in tmp; VIBESPACE_REMOTE_SID set)
const buf = path.join(tmp, 's.buf');
const metaF = path.join(tmp, 's.meta');
console.log('— wired chain: chat-wrapper → agentd-attach → daemon → stub —');
const w = spawn(process.execPath, [
  path.join(repo, 'data/bin/chat-wrapper.js'), buf, metaF,
  process.execPath, attachBundle, '--config', cfgFile, '--offset', '__VS_OFFSET__',
], { env: { ...process.env, VIBESPACE_REMOTE_SID: 'wired-1' }, stdio: ['pipe', 'pipe', 'pipe'] });
w.outText = '';
w.stdout.on('data', (d) => { w.outText += d.toString(); });
w.stderr.on('data', () => {});
await sleep(3500);
check('ticks flow through the whole chain', w.outText.includes('"type":"tick"') && w.outText.includes('"n":5'), JSON.stringify(w.outText.slice(-150)));
check('wrapper reports remote connected', w.outText.includes('"_remote_state"') && w.outText.includes('"connected"'), '');

console.log('— kill the attach bridge (ssh drop): wrapper auto-reconnects by offset —');
const meta0 = JSON.parse(fs.readFileSync(metaF, 'utf8'));
process.kill(meta0.childPid, 'SIGKILL'); // the attach bridge = the "ssh"
await sleep(3500); // wrapper backoff #1 = 1s, respawn, reattach
const daemonSessMeta = JSON.parse(fs.readFileSync(path.join(stateDir, 'sessions', 'wired-1.json'), 'utf8'));
let stubAlive = true; try { process.kill(daemonSessMeta.childPid, 0); } catch { stubAlive = false; }
check('stub claude SURVIVED the bridge kill (daemon-owned)', stubAlive, '');
// send input through the reconnected chain (wrapper stdin → attach → fifo)
w.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hello-after-drop' }] } }) + '\n');
await sleep(1200);
check('input flows post-reconnect (echo arrives)', w.outText.includes('hello-after-drop') && w.outText.includes('"type":"echo"'), JSON.stringify(w.outText.slice(-200)));
// tick continuity: all tick numbers seen exactly once across the drop
const ticks = [...w.outText.matchAll(/"type":"tick","n":(\d+)/g)].map((m) => Number(m[1]));
const uniq = new Set(ticks);
check('no tick lost or duplicated across the drop', uniq.size === ticks.length && ticks.length >= 25, `got ${ticks.length} ticks, ${uniq.size} unique`);

console.log('— child real exit → sentinel → wrapper finalizes —');
w.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'quit' }] } }) + '\n');
const wrapperExit = await new Promise((r) => { w.on('exit', r); setTimeout(() => r('timeout'), 6000); });
check('wrapper finalized with the child exit code (7)', wrapperExit === 7, String(wrapperExit));

try { const dpid = Number(fs.readFileSync(path.join(stateDir, 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch {}
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd WIRED-CHAIN tests passed');
process.exit(0);
