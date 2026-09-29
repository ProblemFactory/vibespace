#!/usr/bin/env node
// test-dial-token-sinks — THE DIAL-TOKEN DOOR CENSUS, at runtime (lane-pairing verify-r3, 2026-09-28). A pairing is
// two secrets: the DIAL token (vsdt_ — gates the hub's dial endpoint; whoever holds it can dial in AS the device) and
// the HOST token (vsht_ — what the hub presents in the mux hello; the device's key). Two rounds retired a leaked
// command's holder (B8, B8-r2); this suite plants SENTINELS — the tokens the real routes mint — and looks for them in
// every sink a token could leak into:
//   · the argv of EVERY process on this machine while the tokens are minted, pushed, installed and dialed
//     (/proc/*/cmdline sampled every 40 ms — the hub's children, the fake ssh the graduation spawns, the device's
//     own children and the daemon itself);
//   · the hub's journal (its stdout/stderr), every ws broadcast a client receives, every file under the hub's data/
//     (hosts.json holds HASHES; the host-token store data/agentd/host-*.token is the one legitimate holder, 0600);
//   · the device's own files (state/dial.json + state/token are the legitimate holders, 0600; the log, the dial
//     history, the socket witness hold none) and the hub's answers about the device (the dial-status route, the
//     refusal frame of a knock carrying a real token under the wrong name).
// The flows are the REAL ones: POST /api/device/dial-pair (the pairing dialog's button), a device started the way
// the installer starts it (dial.json + an argless daemon from this tree's bundle), "Generate a new command" with
// the in-place push (B8), and POST /api/hosts/:id/graduate-dial ("Upgrade to dial-out") over a FAKE `ssh` on the
// server's PATH that plays the machine: it runs the installer's own argument parsing on what it received, writes
// the device's state the way the installer does and starts a real daemon — no ssh host, no systemd, zero vendor
// calls. Heavy (a worktree server + real daemons). Run: node scripts/test-dial-token-sinks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { bootWorld, REPO, sleep } from './pairing-ui-harness.mjs';
import { scratch, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const T0 = Date.now();

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1500) : '')); } };
const waitFor = async (fn, ms = 20000, step = 150) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { } await sleep(step); } return null; };

// ── the fake `ssh`: the machine the graduation installs onto ──
const FAKE = scratch('sinks-ssh');
const DEV2 = path.join(FAKE, 'gradroot');
fs.mkdirSync(FAKE, { recursive: true });
process.on('exit', () => { try { endRootedProcesses(FAKE); } catch { } try { fs.rmSync(FAKE, { recursive: true, force: true }); } catch { } });
const FAKE_SSH = path.join(FAKE, 'bin', 'ssh');
fs.mkdirSync(path.dirname(FAKE_SSH), { recursive: true });
fs.writeFileSync(FAKE_SSH, `#!${process.execPath}
// records every invocation (its OWN argv — what /proc/<pid>/cmdline shows every local user — and its stdin), then
// plays the machine: the reachability probe answers 200; the installer run executes the installer's ARGUMENT
// PARSING on exactly what arrived (the remote command through a shell, the script on stdin), then the installer's
// persistence tail (state/token + state/dial.json, 0600, printf builtins) and an ARGLESS daemon from the bundle
const fs = require('fs'), { spawnSync } = require('child_process');
const argv = process.argv.slice(2), cmd = argv[argv.length - 1] || '';
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); // live long enough for the /proc sampler to see this argv (its own control)
let input = ''; try { if (/^bash -s\\b/.test(cmd)) input = fs.readFileSync(0, 'utf8'); } catch {}
fs.appendFileSync(${JSON.stringify(path.join(FAKE, 'calls.ndjson'))}, JSON.stringify({ pid: process.pid, argv, cmd, input }) + '\\n');
if (/curl -s -o \\/dev\\/null/.test(cmd)) { process.stdout.write('200'); process.exit(0); }
if (/^bash -s\\b/.test(cmd)) {
  const cut = input.indexOf('\\n# THE DIAL ADDRESS IS CHECKED BEFORE ANYTHING IS WRITTEN');
  const head = cut > 0 ? input.slice(0, cut) : input;
  const tail = [
    '',
    'D="$VS_FAKE_ROOT"; mkdir -p "$D/state"; chmod 700 "$D" "$D/state"',
    '( umask 077; printf "%s" "$HOST_TOKEN" > "$D/state/token"; printf "{\\\\"url\\\\":\\\\"%s\\\\",\\\\"token\\\\":\\\\"%s\\\\"}" "$DIAL_URL" "$DIAL_TOKEN" > "$D/state/dial.json" )',
    'printf "%s\\\\n%s\\\\n%s\\\\n" "$DIAL_URL" "$DIAL_TOKEN" "$HOST_TOKEN" > "$D/parsed"',
    'VIBESPACE_DEVICE_ROOT="$D" VIBESPACE_AGENTD_ROOT="$D" nohup "$VS_FAKE_NODE" "$VS_FAKE_BUNDLE" </dev/null >>"$D/state/agentd.out" 2>&1 &',
    'exit 0', '',
  ].join('\\n');
  const r = spawnSync('bash', ['-c', cmd], { input: head + tail, stdio: ['pipe', 'inherit', 'inherit'], env: process.env });
  process.exit(r.status == null ? 1 : r.status);
}
process.exit(0);
`, { mode: 0o755 });

// ── the /proc sampler: every token-shaped argument any process on this machine shows, with its pid ──
const TOKEN_RE = /vs[dh]t_[0-9a-f]{16,}/g;
const seenArgv = new Map(); // token → [{pid, argv0}]
let sampling = true;
const sample = () => {
  let pids = [];
  try { pids = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)); } catch { return; }
  for (const p of pids) {
    let c = '';
    try { c = fs.readFileSync(`/proc/${p}/cmdline`, 'latin1'); } catch { continue; }
    if (!c.includes('vs')) continue;
    for (const m of c.match(TOKEN_RE) || []) { const l = seenArgv.get(m) || []; if (l.length < 5) l.push({ pid: Number(p), argv: c.split('\0').slice(0, 3).join(' ').slice(0, 160) }); seenArgv.set(m, l); }
  }
};
(async () => { while (sampling) { sample(); await sleep(40); } })();

const W = await bootWorld('sinks', { chrome: false, env: { PATH: `${path.dirname(FAKE_SSH)}:${process.env.PATH}`, VS_FAKE_ROOT: DEV2, VS_FAKE_NODE: process.execPath, VS_FAKE_BUNDLE: '' } });
// the bundle path is only known after the boot built it — the fake reads it from a file the suite writes now
const { BASE, api, bundle, devDir, serverLog, wt } = W;
fs.writeFileSync(FAKE_SSH, fs.readFileSync(FAKE_SSH, 'utf8').replace('if (/^bash -s\\b/.test(cmd)) {', `if (/^bash -s\\b/.test(cmd)) { process.env.VS_FAKE_BUNDLE = ${JSON.stringify(bundle)};`));
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
const frames = [];
const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`);
await new Promise((r) => ws.on('open', r));
ws.on('message', (d) => frames.push(String(d)));

const secrets = new Set();
const note = (...t) => { for (const x of t) if (x) secrets.add(String(x)); };
try {
  // ── ① the pairing dialog's button + a device started the way the installer starts it ──
  console.log('① pairing via the route, the device started the installer\'s way (dial.json + an argless daemon)');
  const p1 = (await api('POST', '/api/device/dial-pair', { deviceId: 'sink1', base: BASE })).j;
  note(p1.dialToken, p1.hostToken);
  ok(/^vsdt_[0-9a-f]{36}$/.test(p1.dialToken || '') && /^vsht_[0-9a-f]{48}$/.test(p1.hostToken || ''), 'the route minted a dial token + a host token (the sentinels)', { d: p1.dialToken, h: p1.hostToken });
  const D1 = path.join(devDir, 'sink1');
  fs.mkdirSync(path.join(D1, 'state'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(D1, 'state', 'token'), p1.hostToken, { mode: 0o600 });
  fs.writeFileSync(path.join(D1, 'state', 'dial.json'), JSON.stringify({ url: p1.dialUrl, token: p1.dialToken }), { mode: 0o600 });
  const d1 = spawn(process.execPath, [bundle], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: devDir, VIBESPACE_DEVICE_ROOT: D1, VIBESPACE_AGENTD_ROOT: D1 } }); // the root inside its HOME, as an install puts it (place-secret's own fence)
  d1.unref();
  const row1 = await waitFor(async () => { const h = await W.hostRow('sink1'); return h && h.online ? h : null; }, 20000);
  ok(!!row1, 'the device dialed in (the row reads online)');
  const st = await api('GET', `/api/hosts/${row1 && row1.id}/dial-status`);
  ok(st.status === 200 && st.j.status && st.j.status.last && st.j.status.last.outcome === 'connected', 'the dial-status route answers the device\'s own record', st);
  // a knock carrying the REAL dial token under a name that is not its pairing: the refusal frame echoes nothing
  const wsMin = require(path.join(REPO, 'src/agentd/ws-min.js'));
  const knock = await new Promise((resolve) => { const c = wsMin.connect(`${BASE.replace('http', 'ws')}/api/device-dial?device=not-sink1`, { headers: { 'x-vibespace-dial-token': p1.dialToken } }); c.on('error', (e) => resolve({ status: e.status, refusal: e.refusal, body: String(e.body || '') })); c.on('open', () => { c.close?.(); resolve({ opened: true }); }); setTimeout(() => resolve({ timeout: true }), 5000); });
  ok(knock.status === 401 && knock.body && !knock.body.includes(p1.dialToken.slice(5)), 'a knock with the real token under another name: 401, the frame carries no token', knock);

  // ── ② "Generate a new command" with the in-place push (B8's opt-in) ──
  console.log('② "Generate a new command" + the in-place push');
  const p2 = (await api('POST', '/api/device/dial-pair', { deviceId: 'sink1', base: BASE, updateInPlace: true })).j;
  note(p2.dialToken, p2.hostToken);
  ok(p2.updatedInPlace === true, 'the rotated dial config was pushed to the connected device', { updatedInPlace: p2.updatedInPlace, inPlace: p2.inPlace });
  const pushed = await waitFor(() => { try { return JSON.parse(fs.readFileSync(path.join(D1, 'state', 'dial.json'), 'utf8')).token === p2.dialToken; } catch { return false; } }, 5000);
  const mode1 = fs.statSync(path.join(D1, 'state', 'dial.json')).mode & 0o777;
  ok(pushed && mode1 === 0o600, `the device's dial.json holds the new token, mode ${mode1.toString(8)} (0600)`);
  ok(serverLog.join('').includes("[device] 'sink1': the rotated dial config pushed in place (place-secret)"), 'verify-r3 (the door census): the push went through the device\'s place-secret op (0600 at open, atomic) — never fsWrite-then-chmod', serverLog.join('').split('\n').filter((l) => /pushed in place/.test(l)));
  const back = await waitFor(async () => { const h = await W.hostRow('sink1'); return h && h.online && h.dial && h.dial.lastAccept ? h : null; }, 45000);
  ok(!!back, 'the device dialed back in on the pushed token');

  // ── ③ "Upgrade to dial-out" (graduate-dial) over the fake ssh ──
  console.log('③ graduate-dial over a fake ssh on the server\'s PATH');
  const add = await api('POST', '/api/hosts', { name: 'gbox', user: 'u', host: 'gbox.invalid' });
  ok(add.status === 200 && add.j.id, 'an ssh machine row', add);
  const gr = await api('POST', `/api/hosts/${add.j.id}/graduate-dial`, { base: BASE });
  ok(gr.status === 200 && gr.j.success === true && gr.j.dialedIn === true, 'the graduation installed the device (the fake machine) and it dialed in', gr);
  const calls = fs.readFileSync(path.join(FAKE, 'calls.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const inst = calls.find((c) => /^bash -s\b/.test(c.cmd));
  const parsed = fs.existsSync(path.join(DEV2, 'parsed')) ? fs.readFileSync(path.join(DEV2, 'parsed'), 'utf8').split('\n') : [];
  note(parsed[1], parsed[2]);
  ok(/^vsdt_/.test(parsed[1] || '') && /^vsht_/.test(parsed[2] || '') && /\/api\/device-dial\?device=grad-/.test(parsed[0] || ''), 'the installer\'s own argument parsing received the dial url + both tokens', parsed);
  const leakedArgv = calls.filter((c) => TOKEN_RE.test(c.argv.join(' '))).map((c) => c.cmd.slice(0, 200));
  TOKEN_RE.lastIndex = 0;
  ok(inst && leakedArgv.length === 0, 'verify-r3 B-grad: NO ssh invocation the hub made carries a token in its argv (the local ssh\'s argv and the remote shell\'s command line are readable by every user of each machine)', leakedArgv);
  ok(inst && /^set -- /.test(inst.input) && inst.input.includes(parsed[1]) && inst.input.includes(parsed[2]), 'verify-r3 B-grad: the tokens rode the ssh STDIN (a `set --` line bash reads before the installer)', inst && inst.input.slice(0, 200));

  // ── ④ the sinks ──
  console.log('④ the sinks');
  await sleep(500);
  sampling = false; sample();
  const S = [...secrets].filter(Boolean);
  // a rotation mints a new DIAL token and keeps the machine's HOST token ("Generate a new command" retires the dial side;
  // the host token authenticates the hub TO the device — judged LOW in verify-r3, see the kb)
  ok(S.length === 5 && p1.hostToken === p2.hostToken && p1.dialToken !== p2.dialToken, `${S.length} sentinels planted (three dial tokens, two host tokens — a rotation keeps the host token)`);
  const argvHits = S.filter((t) => seenArgv.has(t)).map((t) => ({ t: t.slice(0, 9), where: seenArgv.get(t) }));
  ok(argvHits.length === 0, 'no process on this machine showed a sentinel in its argv (sampled every 40 ms through every flow)', argvHits);
  const log = serverLog.join('');
  ok(S.every((t) => !log.includes(t)), 'the hub\'s journal (stdout + stderr) names no sentinel', S.filter((t) => log.includes(t)).map((t) => t.slice(0, 9)));
  const fr = frames.join('\n');
  ok(frames.length > 0 && S.every((t) => !fr.includes(t)), `no ws broadcast carries a sentinel (${frames.length} frames)`, S.filter((t) => fr.includes(t)).map((t) => t.slice(0, 9)));
  // every file under the hub's data/: hashes only, except the host-token store
  const walk = (d, out = []) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); } return out; };
  const hubFiles = walk(path.join(wt, 'data'));
  const holders = [], leaks = [];
  for (const f of hubFiles) {
    let b = ''; try { b = fs.readFileSync(f, 'latin1'); } catch { continue; }
    for (const t of S) if (b.includes(t)) (/\/data\/agentd\/host-[\w-]+\.token$/.test(f) && t.startsWith('vsht_') ? holders : leaks).push({ f: path.relative(wt, f), t: t.slice(0, 9), mode: (fs.statSync(f).mode & 0o777).toString(8) });
  }
  ok(leaks.length === 0, `no file under the hub's data/ holds a sentinel but the host-token store (${hubFiles.length} files)`, leaks);
  ok(holders.length >= 1 && holders.every((h) => h.mode === '600'), 'the host-token store holds the host tokens at 0600', holders);
  const hostsJson = fs.readFileSync(path.join(wt, 'data', 'hosts.json'), 'utf8');
  const hashOf = (t) => require('crypto').createHash('sha256').update(t).digest('hex');
  ok(hostsJson.includes(hashOf(p2.dialToken)) && !hostsJson.includes(hashOf(p1.dialToken)), 'hosts.json holds the CURRENT dial token\'s hash (the rotated one is gone)');
  // the device's files: dial.json + state/token are the holders (0600); nothing else
  const devLeaks = [], devHolders = [];
  for (const root of [D1, DEV2]) for (const f of walk(root)) {
    let b = ''; try { b = fs.readFileSync(f, 'latin1'); } catch { continue; }
    const rel = path.relative(root, f);
    if (rel === 'parsed') continue; // the fake machine's own record of what it parsed
    for (const t of S) if (b.includes(t)) (/^state\/(dial\.json|token)$/.test(rel) ? devHolders : devLeaks).push({ f: rel, t: t.slice(0, 9), mode: (fs.statSync(f).mode & 0o777).toString(8) });
  }
  ok(devLeaks.length === 0, 'the device\'s own files (its log, its dial history, its socket witness, its sessions) hold no token', devLeaks);
  ok(devHolders.length >= 4 && devHolders.every((h) => h.mode === '600'), 'state/dial.json + state/token hold them at 0600', devHolders);
  const st2 = await api('GET', `/api/hosts/${row1 && row1.id}/dial-status`);
  ok(S.every((t) => !JSON.stringify(st2.j).includes(t)), 'the dial-status answers name no token');
} catch (e) {
  fail++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  sampling = false;
  try { ws.close(); } catch { }
  for (const root of [path.join(devDir, 'sink1'), DEV2]) { try { endRootedProcesses(root); } catch { } }
  W.cleanup();
}
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
