// lane S2 MEASUREMENT (not a test — never in ci.mjs, like measure-cloak-egress.mjs): what does agent-browser 0.38.1's stream server do with an input record,
// and how many CDP Input.* calls does ONE record become — measured through the REAL mediator (the mediated
// live view path), with a Chrome we launch ourselves on a scratch dir.
import fs from 'node:fs'; import path from 'node:path'; import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module'; import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const M = require('../src/browser-mediation.js');
const F = require('../src/browser-facts.js');
const seen = [];
const judge0 = M.judge; M.judge = (msg, scope, o) => { const v = judge0(msg, scope, o); if (msg && msg.method) seen.push({ at: Date.now(), method: msg.method, type: msg.params && msg.params.type, params: msg.params, paused: !!(o && o.paused), kind: v.kind }); // verify S2: the FULL params (the credit is bound to them) return v; };
const MED = require('../src/server/cdp-mediator.js');
const ROOT = scratch('input-receipts-measure'); fs.mkdirSync(ROOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const CDP = await freePort();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--no-sandbox', '--disable-gpu', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let ver = null; for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await sleep(250); } }
const med = MED.create({ log: { log() {}, warn() {} } }); await med.listen();
let paused = false;
const g = await med.grantFor({ profileId: 'bp-00000001', browserKey: 'bk-00000001', upstream: ver.webSocketDebuggerUrl, paused: () => paused });
const envBase = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_')) envBase[k] = v;
const realBin = F.binaryResolver('agent-browser', envBase)();
fs.mkdirSync(path.join(ROOT, 'home'), { recursive: true }); fs.mkdirSync(path.join(ROOT, 'sock'), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(ROOT, 'cfg.json'), JSON.stringify({ headed: false }));
const env = { ...envBase, HOME: path.join(ROOT, 'home'), AGENT_BROWSER_SESSION: 'vs-s2m', AGENT_BROWSER_NAMESPACE: 'vs-s2m', AGENT_BROWSER_CDP: g.url, AGENT_BROWSER_SOCKET_DIR: path.join(ROOT, 'sock'), AGENT_BROWSER_CONFIG: path.join(ROOT, 'cfg.json'), AGENT_BROWSER_IDLE_TIMEOUT_MS: '120000', AGENT_BROWSER_JSON: '1' };
const run = (args) => new Promise((r) => execFile(realBin, args, { env, timeout: 60000, encoding: 'utf8' }, (e, so, se) => r({ ok: !e, so: String(so || ''), se: String(se || '') })));
const out = { version: (await run(['--version'])).so.trim() };
out.open = await run(['open', 'data:text/html,<title>s2</title><input id=i autofocus><script>document.i=0;addEventListener("keydown",()=>document.i++);addEventListener("mousedown",()=>document.i+=100)</script>']);
out.status = await run(['stream', 'status', '--json']);
let port = null; try { port = JSON.parse(out.status.so).data.port; } catch { }
if (!port) { out.enable = await run(['stream', 'enable', '--json']); out.status2 = await run(['stream', 'status', '--json']); try { port = JSON.parse(out.status2.so).data.port; } catch { } }
out.port = port;
const recv = [];
if (port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { } if (m && m.type !== 'frame') recv.push({ at: Date.now(), type: m.type, keys: Object.keys(m).slice(0, 8), m: JSON.stringify(m).slice(0, 200) }); if (m && m.type === 'frame') recv.push({ at: Date.now(), type: 'frame' }); });
  await new Promise((r) => ws.on('open', r)); await sleep(1500);
  const mark = (label) => seen.push({ at: Date.now(), mark: label });
  const send = (o) => ws.send(JSON.stringify(o));
  // three rounds: the agent drives (not paused) · the user drives, as shipped before lane S2 (paused, no credit — every
  // Input.* refused) · the user drives with lane S2's bridge credit minted per record (paused, credited — admitted, and
  // each credit settled by the browser's own reply = the receipt)
  out.receipts = [];
  for (const [pz, credited] of [[false, false], [true, false], [true, true]]) {
    paused = pz; mark('paused=' + pz + (credited ? ' credited' : ''));
    const sendC = (o) => { if (credited) med.creditInput({ profileId: 'bp-00000001', browserKey: 'bk-00000001', record: o }).then((r) => out.receipts.push({ type: o.eventType, ...r })); send(o); }; // verify S2: a credit is bound to its record
    mark('mouse press'); sendC({ type: 'input_mouse', eventType: 'mousePressed', x: 50, y: 20, button: 'left', clickCount: 1 }); await sleep(400);
    mark('mouse release'); sendC({ type: 'input_mouse', eventType: 'mouseReleased', x: 50, y: 20, button: 'left', clickCount: 1 }); await sleep(400);
    mark('key down'); sendC({ type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }); await sleep(400);
    mark('char'); sendC({ type: 'input_keyboard', eventType: 'char', text: 'abc' }); await sleep(400);
    mark('key up'); sendC({ type: 'input_keyboard', eventType: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }); await sleep(400);
    mark('wheel'); sendC({ type: 'input_mouse', eventType: 'mouseWheel', x: 50, y: 50, deltaX: 0, deltaY: 100 }); await sleep(400);
  }
  // verify S2 (2026-09-26): a BURST — 60 moves back to back then a press, and 40 chars: is it still one Input.* per record, in order?
  paused = false; mark('burst');
  { const n0 = seen.length; for (let i = 0; i < 60; i++) send({ type: 'input_mouse', eventType: 'mouseMoved', x: 100 + i, y: 100, button: 'none', clickCount: 0, modifiers: 0 }); send({ type: 'input_mouse', eventType: 'mousePressed', x: 160, y: 100, button: 'left', clickCount: 1, modifiers: 0 }); await sleep(2500);
    const calls = seen.slice(n0).filter((c) => c.method); out.burst = { sent: 61, calls: calls.length, inOrder: calls.every((c, i) => i === 60 ? c.params.type === 'mousePressed' : c.params.x === 100 + i) }; }
  { const n0 = seen.length; for (let i = 0; i < 40; i++) send({ type: 'input_keyboard', eventType: 'char', text: String.fromCharCode(97 + (i % 26)), modifiers: 0 }); await sleep(2500); out.charBurst = { sent: 40, calls: seen.slice(n0).filter((c) => c.method).length }; }
  out.value = await run(['eval', 'document.getElementById("i").value + "|" + document.i']);
  ws.close();
}
out.seen = seen.filter((s) => s.mark || /^Input\./.test(s.method));
out.recvTypes = [...new Set(recv.map((r) => r.type))];
out.recvNonFrame = recv.filter((r) => r.type !== 'frame').slice(0, 30);
fs.writeFileSync(path.join(process.env.MEASURE_OUT || ROOT, 'measure-input.json'), JSON.stringify(out, null, 2));
await run(['close']); // this daemon's one session (its own scratch socket dir / namespace — never `close --all`)
try { chrome.kill('SIGKILL'); } catch { }
med.shutdown?.();
await sleep(500);
endRootedProcesses(ROOT);
fs.rmSync(ROOT, { recursive: true, force: true });
let value = null; try { value = JSON.parse(out.value.so).data.result; } catch { }
console.log(JSON.stringify({ version: out.version, port, value, burst: out.burst, charBurst: out.charBurst, sampleParams: out.seen.filter((x) => x.params).slice(0, 6).map((x) => x.method + ' ' + JSON.stringify(x.params)), perRound: out.seen.reduce((a, x) => { if (x.mark && x.mark.startsWith('paused=')) a.push({ round: x.mark, calls: [] }); else if (!x.mark && a.length) a[a.length - 1].calls.push(`${x.method}:${x.type}:${x.kind}`); return a; }, []), receipts: out.receipts, recvTypes: out.recvTypes }, null, 1));
process.exit(0);
