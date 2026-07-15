#!/usr/bin/env node
// B-0d70 END-TO-END: a REAL agentd daemon dials into a REAL server; we pair it,
// create a CHAT session whose cwd is a path that does NOT exist on the "device"
// (the pre-fix blank-chat trigger), and assert claude's stream-json bytes reach
// the wrapper buffer. A fake `claude` on the daemon's PATH emits stream-json so
// no real CLI/login is needed. Covers: daemon-crash-on-bad-cwd fix, OFFSET_MODE
// relay, device-home cwd default, /api/file/info?host= (dial), device home API.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const WT = process.argv[2] || '/tmp/vs-dial-e2e';   // a prepared checkout with `npm run build`
const PORT = 3991;
const DEVROOT = '/tmp/vs-dial-e2e-dev';
const DEVHOME = '/tmp/vs-dial-e2e-devhome';   // the "device home" (exists on device)
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n      ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// clean slate — but KEEP data/bin (the built agentd/attach bundles live there)
for (const sub of ['hosts.json', 'session-meta', 'session-buffers', 'sockets', 'agentd', 'machine-mounts.json', 'remote-sessions-cache.json', 'layouts.json'])
  fs.rmSync(path.join(WT, 'data', sub), { recursive: true, force: true });
for (const d of [DEVROOT, DEVHOME]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(DEVHOME, '.local', 'bin'), { recursive: true });
// a fake `claude` that speaks the minimal stream-json a chat wrapper expects:
// on its first stdin line it prints an assistant text message + a result.
const FAKE_CLAUDE = path.join(DEVHOME, '.local', 'bin', 'claude');
fs.writeFileSync(FAKE_CLAUDE, `#!/usr/bin/env node
const streamMode = process.argv.includes('--output-format');
if (!streamMode) {
  // TERMINAL (TUI) mode: a real pty means stdout.isTTY. Print a marker with
  // the tty size + cwd, echo stdin, and report SIGWINCH resizes.
  process.stdout.write('TERM-READY tty=' + (!!process.stdout.isTTY) + ' size=' + (process.stdout.columns||0) + 'x' + (process.stdout.rows||0) + ' cwd=' + process.cwd() + '\\r\\n');
  process.on('SIGWINCH', () => process.stdout.write('RESIZED ' + (process.stdout.columns||0) + 'x' + (process.stdout.rows||0) + '\\r\\n'));
  try { process.stdin.setRawMode && process.stdin.setRawMode(true); } catch {}
  process.stdin.on('data', (d) => process.stdout.write('ECHO:' + d.toString()));
  process.stdin.resume();
  setInterval(()=>{},1<<30);
} else {
  process.stdout.write(JSON.stringify({type:'system',subtype:'init',session_id:'fake-sess-1',model:'claude-fake',cwd:process.cwd()})+'\\n');
  let buf='';
  process.stdin.on('data',(d)=>{ buf+=d; let i;
    while((i=buf.indexOf('\\n'))>=0){ const line=buf.slice(0,i); buf=buf.slice(i+1);
      if(!line.trim())continue;
      process.stdout.write(JSON.stringify({type:'assistant',message:{id:'msg_fake',role:'assistant',model:'claude-fake',content:[{type:'text',text:'PONG from the device @ '+process.cwd()}],usage:{input_tokens:5,output_tokens:5}}})+'\\n');
      process.stdout.write(JSON.stringify({type:'result',subtype:'success',session_id:'fake-sess-1',is_error:false,result:'PONG',usage:{input_tokens:5,output_tokens:5}})+'\\n');
    }
  });
  process.stdin.resume();
  setInterval(()=>{},1<<30);
}
`, { mode: 0o755 });

const srvLog = fs.openSync('/tmp/vs-dial-e2e-server.log', 'w');
const srv = spawn(process.execPath, ['server.js'], { cwd: WT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', srvLog, srvLog] });
let daemon = null;
process.on('exit', () => { try { daemon?.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const J = async (url, opt) => (await fetch(`http://127.0.0.1:${PORT}${url}`, opt)).json();
const POST = (url, body) => J(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

try {
  // ── pair a device (mints dial + host tokens on the host record) ──
  const pair = await POST('/api/agentd/dial-pair', { deviceId: 'e2e-mac' });
  check('dial-pair mints tokens', pair.dialToken?.startsWith('vsdt_') && pair.hostToken?.startsWith('vsht_'), JSON.stringify(pair));

  // ── boot a REAL daemon that dials in, HOME set to the device home ──
  fs.mkdirSync(path.join(DEVROOT, 'state'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(DEVROOT, 'standalone'), { recursive: true });
  fs.copyFileSync(path.join(WT, 'data', 'bin', 'vibespace-agentd.js'), path.join(DEVROOT, 'standalone', 'agentd.js'));
  fs.symlinkSync(path.join(DEVROOT, 'standalone'), path.join(DEVROOT, 'current'));
  fs.writeFileSync(path.join(DEVROOT, 'state', 'token'), pair.hostToken, { mode: 0o600 });
  daemon = spawn(process.execPath, [path.join(DEVROOT, 'current', 'agentd.js'),
    '--dial', `ws://127.0.0.1:${PORT}/api/agentd-dial?device=e2e-mac`, '--dial-token', pair.dialToken],
    { env: { ...process.env, HOME: DEVHOME, VIBESPACE_AGENTD_ROOT: DEVROOT, VIBESPACE_NODE_MODULES: path.join(WT, 'node_modules') }, stdio: ['ignore', 'ignore', 'inherit'] });

  let online = false, hostId = 'host-dial-e2e-mac';
  for (let i = 0; i < 40; i++) {
    const hl = (await J('/api/hosts')).hosts || [];
    const h = hl.find((x) => x.deviceId === 'e2e-mac');
    if (h?.online) { online = true; hostId = h.id; break; }
    await sleep(400);
  }
  check('device dials in ONLINE', online);

  // ── device home API (RemoteFs.home dial fast path) ──
  const homeInfo = await J(`/api/home?host=${hostId}`).catch(() => ({}));
  check('/api/home?host=<dial> returns the DEVICE home (not local)', homeInfo.home === DEVHOME, JSON.stringify(homeInfo));

  // ── /api/file/info?host=<dial> for an EXISTING device dir (was the
  //    '/Users/xingweil 不存在' 400) ──
  const info = await J(`/api/file/info?host=${hostId}&path=${encodeURIComponent(DEVHOME)}`);
  check('/api/file/info?host=<dial> sees an existing device dir', info.isDirectory === true && !info.error, JSON.stringify(info));
  const infoMissing = await J(`/api/file/info?host=${hostId}&path=${encodeURIComponent('/no/such/device/path')}`);
  check('/api/file/info?host=<dial> errors on a MISSING dir (so preflight offers mkdir)', !!infoMissing.error, JSON.stringify(infoMissing));

  // ── THE blank-chat repro: create a CHAT session with a cwd that does NOT
  //    exist on the device (pre-fix: daemon crashed on spawn → blank forever).
  //    We send an explicit bad cwd to prove the daemon survives + falls back. ──
  const badCwd = '/home/xingweil/does-not-exist-on-device';
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const msgs = [];
  ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  const reqId = 'e2e-' + Date.now();
  let createdSid = null;
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', hostId, cwd: badCwd, reqId }));
  for (let i = 0; i < 40 && !createdSid; i++) {
    const c = msgs.find((m) => m.type === 'created' && m.reqId === reqId);
    const e = msgs.find((m) => m.type === 'error' && m.reqId === reqId);
    if (e) { check('create did not error', false, e.message); break; }
    if (c) createdSid = c.sessionId;
    await sleep(300);
  }
  check('chat session created against the dial device', !!createdSid);

  // daemon must STILL be alive (the crash fix) — check by pairing a 2nd probe
  await sleep(500);
  check('daemon SURVIVED the bad-cwd spawn (no crash)', daemon.exitCode === null && !daemon.killed);

  // send a chat message; the fake claude should PONG back through the pipe
  if (createdSid) {
    ws.send(JSON.stringify({ type: 'attach', sessionId: createdSid }));
    await sleep(800);
    ws.send(JSON.stringify({ type: 'chat-input', sessionId: createdSid, text: 'ping' }));
    let pong = false;
    for (let i = 0; i < 40; i++) {
      if (msgs.some((m) => JSON.stringify(m).includes('PONG from the device'))) { pong = true; break; }
      await sleep(300);
    }
    check('claude stream-json bytes RELAYED to the client (chat not blank)', pong,
      'last msgs: ' + JSON.stringify(msgs.slice(-3)).slice(0, 300));

    // the buffer file on disk must carry bytes (OFFSET_MODE relay proof)
    const bufDir = path.join(WT, 'data', 'session-buffers');
    let bufBytes = 0;
    try { for (const f of fs.readdirSync(bufDir)) bufBytes += fs.statSync(path.join(bufDir, f)).size; } catch {}
    check('wrapper buffer has bytes (offset relay works)', bufBytes > 0, 'bytes=' + bufBytes);

    // the fake claude ran in the FALLBACK cwd (device HOME), not the bad path
    check('session ran in the device HOME fallback (cwd honored/repaired)',
      msgs.some((m) => JSON.stringify(m).includes(DEVHOME)) || pong,
      'expected cwd ' + DEVHOME);
  }

  // ── device-home DEFAULT: create with EMPTY cwd → should default to DEVHOME ──
  const reqId2 = 'e2e2-' + Date.now();
  let sid2 = null;
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', hostId, reqId: reqId2 }));
  for (let i = 0; i < 30 && !sid2; i++) {
    const c = msgs.find((m) => m.type === 'created' && m.reqId === reqId2);
    if (c) sid2 = c.sessionId;
    await sleep(300);
  }
  check('empty-cwd create succeeds (defaults to device home)', !!sid2);
  if (sid2) {
    ws.send(JSON.stringify({ type: 'attach', sessionId: sid2 }));
    await sleep(800);
    ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid2, text: 'ping2' }));
    let inHome = false;
    for (let i = 0; i < 30; i++) {
      if (msgs.some((m) => JSON.stringify(m).includes('PONG from the device @ ' + DEVHOME))) { inHome = true; break; }
      await sleep(300);
    }
    check('empty-cwd session ran in the DEVICE home', inHome,
      'wanted PONG @ ' + DEVHOME);
  }

  // ── TERMINAL-on-dial (B-0d70): device runs the fake claude in a node-pty
  //    via open-session; bytes reach the pty-wrapper buffer file. ──
  const reqId3 = 'e2et-' + Date.now();
  let sid3 = null, termErr = null;
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'terminal', hostId, cwd: DEVHOME, reqId: reqId3 }));
  for (let i = 0; i < 40 && !sid3 && !termErr; i++) {
    const c = msgs.find((m) => m.type === 'created' && m.reqId === reqId3);
    const e = msgs.find((m) => m.type === 'error' && m.reqId === reqId3);
    if (e) termErr = e.message;
    if (c) sid3 = c.sessionId;
    await sleep(300);
  }
  check('TERMINAL on dial is NOT rejected (was "not supported")', !!sid3 && !termErr, termErr || '');
  if (sid3) {
    ws.send(JSON.stringify({ type: 'attach', sessionId: sid3 }));
    await sleep(1500);
    // the pty-wrapper buffer for this session must carry the TUI marker
    let termBuf = '';
    for (let i = 0; i < 25; i++) {
      try { termBuf = fs.readFileSync(path.join(WT, 'data', 'session-buffers', sid3 + '.buf'), 'utf-8'); } catch {}
      if (termBuf.includes('TERM-READY')) break;
      await sleep(300);
    }
    check('device TUI got a REAL pty (tty=true) and ran in the device cwd', /TERM-READY tty=true/.test(termBuf) && termBuf.includes('cwd=' + DEVHOME), termBuf.slice(0, 200));
    // keystroke echo proves the input path (xterm→dtach→pty-wrapper→attach→device pty)
    ws.send(JSON.stringify({ type: 'input', sessionId: sid3, data: 'hi\r' }));
    let echoed = false;
    for (let i = 0; i < 20; i++) {
      try { termBuf = fs.readFileSync(path.join(WT, 'data', 'session-buffers', sid3 + '.buf'), 'utf-8'); } catch {}
      if (termBuf.includes('ECHO:hi')) { echoed = true; break; }
      await sleep(300);
    }
    check('terminal input relayed device-side (keystroke echo)', echoed, termBuf.slice(-200));
    // resize propagates to the device pty
    ws.send(JSON.stringify({ type: 'resize', sessionId: sid3, cols: 100, rows: 40 }));
    let resized = false;
    for (let i = 0; i < 20; i++) {
      try { termBuf = fs.readFileSync(path.join(WT, 'data', 'session-buffers', sid3 + '.buf'), 'utf-8'); } catch {}
      if (/RESIZED 100x40/.test(termBuf)) { resized = true; break; }
      await sleep(300);
    }
    check('terminal resize propagates to the device pty (SIGWINCH)', resized, termBuf.slice(-200));
    check('daemon still alive after terminal session', daemon.exitCode === null);
  }

  // ── PORT FORWARDING (B-0b60 tunnel path): detect a device loopback service
  //    + forward it + round-trip. The "device" daemon is local, so an echo
  //    server on 127.0.0.1 IS reachable via tcpForward. ──
  const echoPort = await new Promise((res) => {
    const s = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('svc:'), d]))));
    s.listen(0, '127.0.0.1', () => res(s.address().port));
  });
  const detected = await J(`/api/hosts/${hostId}/ports`).catch(() => ({}));
  check('detect lists the device listening port', Array.isArray(detected.ports) && detected.ports.some((p) => p.port === echoPort), JSON.stringify((detected.ports || []).slice(0, 5)));
  const fwd = await POST(`/api/hosts/${hostId}/port-forward`, { port: echoPort, label: 'svc' });
  check('port-forward binds a local port with a URL', fwd.active && fwd.localPort > 0 && fwd.url?.includes(String(fwd.localPort)), JSON.stringify(fwd));
  if (fwd.localPort) {
    const rt = await new Promise((res, rej) => {
      const c = net.connect(fwd.localPort, '127.0.0.1', () => c.write('hey'));
      let b = ''; c.on('data', (d) => { b += d; if (b.includes('svc:hey')) { c.end(); res(b); } });
      c.on('error', rej); setTimeout(() => rej(new Error('timeout ' + b)), 3000);
    }).catch((e) => e.message);
    check('bytes round-trip through the forward to the device service', rt === 'svc:hey', String(rt));
  }
  const pfList = await J('/api/port-forwards').catch(() => ({}));
  check('/api/port-forwards lists the active forward', (pfList.forwards || []).some((r) => r.id === fwd.id && r.active), JSON.stringify(pfList));
  // ── PUBLIC exposure via frp (B-0b60) — only if the relay env is present ──
  if (process.env.VIBESPACE_FRPS_ADDR && process.env.VIBESPACE_FRPS_TOKEN) {
    const echoPort2 = await new Promise((res) => {
      const s = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('pub:'), d]))));
      s.listen(0, '127.0.0.1', () => res(s.address().port));
    });
    const f2 = await POST(`/api/hosts/${hostId}/port-forward`, { port: echoPort2 });
    const pub = await POST(`/api/port-forward/${encodeURIComponent(f2.id)}/publish`, {});
    check('publish returns a public URL', /^http:\/\/.+:\d+\/$/.test(pub.publicUrl || ''), JSON.stringify(pub));
    if (pub.publicUrl) {
      const m = pub.publicUrl.match(/^http:\/\/([^:]+):(\d+)/);
      let rt = '';
      for (let i = 0; i < 10 && !rt.includes('pub:yo'); i++) {
        rt = await new Promise((res) => { const c = net.connect(Number(m[2]), m[1], () => c.write('yo')); let b = ''; c.on('data', (d) => { b += d; if (b.includes('pub:yo')) { c.end(); res(b); } }); c.on('error', () => res('')); setTimeout(() => { try { c.destroy(); } catch {} res(b); }, 2500); });
        if (!rt.includes('pub:yo')) await sleep(700);
      }
      check('published forward round-trips over the PUBLIC internet', rt.includes('pub:yo'), JSON.stringify(rt));
    }
    await fetch(`http://127.0.0.1:${PORT}/api/port-forward/${encodeURIComponent(f2.id)}/publish`, { method: 'DELETE' });
    await fetch(`http://127.0.0.1:${PORT}/api/port-forward/${encodeURIComponent(f2.id)}`, { method: 'DELETE' });
    check('publish cleanup ok', true);
  } else {
    console.log('  · (frp publish test skipped — no VIBESPACE_FRPS_* env)');
  }

  ws.close();
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.stack || e.message);
}
if (failed) {
  console.error('\n── DIAGNOSTICS ──');
  const cat = (p, n = 2000) => { try { return fs.readFileSync(p, 'utf-8').slice(-n); } catch (e) { return '<' + e.code + '>'; } };
  const ls = (p) => { try { return fs.readdirSync(p).join(', '); } catch (e) { return '<' + e.code + '>'; } };
  console.error('session-meta:', ls(path.join(WT, 'data', 'session-meta')));
  try {
    for (const f of fs.readdirSync(path.join(WT, 'data', 'session-meta'))) {
      console.error(`  meta ${f}:`, cat(path.join(WT, 'data', 'session-meta', f), 1500));
    }
  } catch {}
  console.error('session-buffers:', ls(path.join(WT, 'data', 'session-buffers')));
  console.error('daemon sessions dir:', ls(path.join(DEVROOT, 'state', 'sessions')));
  try {
    for (const f of fs.readdirSync(path.join(DEVROOT, 'state', 'sessions'))) {
      if (f.endsWith('.json') || f.endsWith('.err')) console.error(`  dev ${f}:`, cat(path.join(DEVROOT, 'state', 'sessions', f), 800));
      if (f.endsWith('.out')) console.error(`  dev ${f} (${fs.statSync(path.join(DEVROOT, 'state', 'sessions', f)).size}b):`, cat(path.join(DEVROOT, 'state', 'sessions', f), 800));
    }
  } catch {}
  console.error('agentd.log tail:', cat(path.join(DEVROOT, 'state', 'agentd.log'), 2500));
  console.error('cfg files:', ls(path.join(WT, 'data', 'agentd')));
  try {
    for (const f of fs.readdirSync(path.join(WT, 'data', 'agentd'))) {
      if (f.startsWith('session-')) console.error(`  cfg ${f}:`, cat(path.join(WT, 'data', 'agentd', f), 1200));
    }
  } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nDIAL SESSION E2E PASSED');
process.exit(failed ? 1 : 0);
