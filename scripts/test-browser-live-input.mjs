#!/usr/bin/env node
// LANE LIVE-INPUT — THE TRUSTED LEGS (heavy). The owner (2026-09-27, Chrome on a Mac, the instance over plain http on a
// hostname, the agent's NAMED profile "shopping", agent-browser 0.38.1 + chromium 151): a paste from outside never
// reached the page, the Chinese IME never typed, the fit chip was unreadable. Diagnosed and MEASURED on the same
// binaries: Chrome refuses a key event's text of 4+ UTF-16 units (-32602), so every paste ≥ 4 units and every IME
// commit ≥ 4 units died at the last hop while the bar said "sent"; ⌘A/C/X/Z TYPED their letter into a Linux page; a
// drag / a double click selected nothing (a drag's moves carried no button, a press no click count); nothing ever
// carried a copy OUT. This suite drives the REAL stack with TRUSTED input (CDP Input.* on the viewer's own page —
// the browser treats it as the user's):
//   ① the agent's own Chromium, no server: the key-text cap (3 ok / 4 refused — CHAR_TEXT_MAX_UNITS), the chunker
//      typing a seeded 300 texts EXACTLY into a real textarea (CONTROL: the pre-fix one-record text through a patched
//      copy lands nothing), the copy watch on a real page (a paragraph, an input after Ctrl+A, a cut, a password field
//      that gives nothing, a navigation, a same-origin frame);
//   ② THE WORLD: a scratch server (its own data/, HOME, XDG root) + a fake claude + the REAL agent-browser 0.38.1 and
//      its chromium, the viewer = headless Chrome on the machine's NON-loopback address (isSecureContext false,
//      navigator.clipboard absent — the owner's shape), per kind of browser — the conversation's OWN (ephemeral), a
//      NAMED profile (a direct lease, the owner's), a MEDIATED named profile (every input through the credit fence):
//      a real click into the picture keeps the keyboard sink focused; Ctrl+V and ⌘V (the Mac form: the `paste`
//      editing command) of 11 characters, CJK + emoji, a 600-character multi-line text; a real composition from
//      keyCode 229 committing 12 characters; the commit key's keyup never reaches the page; a double click selects a
//      word and a drag a paragraph; Ctrl+C lands the selection in the viewer's clipboard (the gesture copy on plain
//      http); Ctrl+A + Ctrl+X cuts to it. THE COPY-OUT DOOR (verify 2026-09-27): a hostile page firing synthetic copies
//      on a timer (the agent can plant that with `eval`) leaves the driving user's clipboard untouched — with nothing
//      pressed on a SECURE viewer (the Clipboard API rung) and after a plain click on plain http (the click's copy is
//      the chip only). The journal: no "already holds" per command, no query string in the
//      handback line, ONE `record start` when recording is switched on during agent commands;
//   ③ a MAC VIEWER (the viewer's UA / platform / userAgentData emulate a Mac): ⌘A selects all (never types "a"), ⌘C
//      copies, ⌘X cuts, ⌘Z undoes, ⌘⇧Z redoes;
//   ④ THE FIT CHIP: two windows of one browser — the smaller one reads where the size comes from, its click makes the
//      page follow it; the bar is shot in en and zh (env LIVE_INPUT_SHOTS=<dir>);
//   ⑤ CONTROLS — the same legs on a server built from a patched copy of the tree (the pre-fix chunk in the bridge; the
//      client without the ⌘ table, forwarding every keyup, moving without the held button; the bridge without the
//      copy-out door — the hostile page's copy IS written after one click; bundle rebuilt): each goes red.
// SKIPs (with the reason) without dtach, the real agent-browser ≥ 0.37 + an installed chromium, or a viewer chrome.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const S = require('../src/browser-stream.js');
const VP = require('../src/server/browser-viewport.js');
const F = require('../src/browser-facts.js');
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await pred(); if (v) return v; await sleep(every); } return pred(); };
const T0 = Date.now();
const ROOT = scratch('bli'); // SHORT: the mediated rung's socket tail is 62 bytes under XDG_RUNTIME_DIR / HOME (103 cap)
try { fs.rmSync(ROOT, { recursive: true }); } catch { }
fs.mkdirSync(ROOT, { recursive: true });
const SHOTS = process.env.LIVE_INPUT_SHOTS || null;
const procs = new Set();
function cleanup() {
  for (const p of [...procs].reverse()) { try { p.kill('SIGKILL'); } catch { } }
  const spin = (ms) => { const x = Date.now(); while (Date.now() - x < ms) { /* synchronous: this runs inside 'exit' */ } };
  // everything rooted in ROOT — the server's dtach sessions, the agent-browser daemons and their Chromes (HOME is under it),
  // and whatever carries ROOT only in its ENVIRONMENT (a GPU / accessibility helper a dying Chrome started wrote its cache /
  // socket dir back after the removal — seen): killed by EVIDENCE, never a name, until two passes in a row find nothing
  const sweep = () => {
    let hit = []; try { hit = endRootedProcesses(ROOT); } catch { }
    for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { if (Number(d) === process.pid) continue; try { if (fs.readFileSync(`/proc/${d}/environ`, 'utf8').includes(ROOT + '/')) { process.kill(Number(d), 'SIGKILL'); hit.push(Number(d)); } } catch { /* not ours / gone */ } }
    return hit;
  };
  const t0 = Date.now(); let quiet = 0;
  while (Date.now() - t0 < 6000 && quiet < 2) { const hit = sweep(); quiet = hit.length ? 0 : quiet + 1; spin(hit.length ? 150 : 100); }
  for (let i = 0; i < 4 && fs.existsSync(ROOT); i++) { try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } spin(250); sweep(); }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
/** The end: the verdict, then the scratch root cleaned TWICE with a settle between (a GPU helper a killed Chromium had
 *  re-spawned wrote its shader cache back under the scratch HOME a moment after the first removal — seen), then exit. */
const done = async () => {
  console.log(`\n(${Math.round((Date.now() - T0) / 1000)} s)`);
  console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`);
  cleanup(); await sleep(1500); cleanup();
  process.exit(fail ? 1 : 0);
};

// ── the machine's facts ──
const REAL_AB = (() => { try { const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_'))); const r = F.binaryResolver('agent-browser', env); return r ? r() : null; } catch { return null; } })();
let abVer = null; if (REAL_AB) { try { abVer = execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { } }
const BROWSERS = path.join(os.homedir(), '.agent-browser', 'browsers');
const INNER_CHROME = (() => { try { const d = fs.readdirSync(BROWSERS).filter((x) => /^chrome-\d/.test(x)).sort((a, b) => Number(b.split('-')[1].split('.')[0]) - Number(a.split('-')[1].split('.')[0])); for (const x of d) { const p = path.join(BROWSERS, x, 'chrome'); if (fs.existsSync(p)) return p; } } catch { } return null; })();
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p)) || null;
const dtachOk = (() => { try { execFileSync('dtach', ['--help'], { stdio: 'ignore' }); return true; } catch (e) { return e && e.status !== undefined && e.code !== 'ENOENT'; } })();
const LAN_IP = (() => { for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a && a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) return a.address; return null; })();
if (!INNER_CHROME) { skip(`no installed browser under ${BROWSERS} (the suite never downloads one)`); await done(); }

/** A throwaway Chrome (headless) with its own profile under ROOT; → { port, close }. */
async function launchChrome(bin, { name, args = [], url = 'about:blank' } = {}) {
  const ud = path.join(ROOT, 'ud-' + name);
  const ch = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${ud}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--password-store=basic', ...args, url], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, NO_AT_BRIDGE: '1' } });
  procs.add(ch);
  let port = null, buf = '';
  ch.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(buf); if (m) port = Number(m[1]); });
  await until(() => port, 15000, 50);
  return { port, proc: ch, close: () => { try { ch.kill('SIGTERM'); } catch { } } };
}
/** One CDP connection to a page target (by url prefix or id). */
async function cdpPage(port, pick) {
  let t = null;
  for (let i = 0; i < 100 && !t; i++) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); t = list.find((x) => x.type === 'page' && pick(x)); } catch { } if (!t) await sleep(100); }
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  let id = 0; const pend = new Map(); const events = [];
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method) { events.push(m); if (events.length > 500) events.shift(); } });
  const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw'); return r.result && r.result.result ? r.result.result.value : undefined; };
  return { ws, call, ev, target: t, events, close: () => { try { ws.close(); } catch { } } };
}

// ═══ ① THE AGENT'S OWN CHROMIUM — the cap, the chunker, the copy watch ═══
console.log(`— ① the agent's own Chromium (${path.basename(path.dirname(INNER_CHROME))}): the key-text cap, the chunker, the copy watch`);
const M = mutantCopies('bli', REPO);
{
  const PAGE = `<!doctype html><meta charset=utf-8><input id=a autocomplete=off><input id=p type=password value=secret><textarea id=b>line one\nline two</textarea><div id=c contenteditable></div><p id=s>SELECT-ME 可选文字 text</p><iframe id=f srcdoc="<p id=q>inside frame</p>"></iframe>`;
  const srv = http.createServer((q, s) => { s.setHeader('Content-Type', 'text/html; charset=utf-8'); s.end(PAGE); });
  const sp = await freePort(); await new Promise((r) => srv.listen(sp, '127.0.0.1', r));
  const url = `http://127.0.0.1:${sp}/`;
  const C = await launchChrome(INNER_CHROME, { name: 'inner1', url });
  const A = await cdpPage(C.port, (x) => x.url.startsWith(url));
  await sleep(300);
  const verRes = await A.call('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true });
  const ver = (/Chrome\/([\d.]+)/.exec(verRes.result.result.value) || [])[1];
  // the cap
  const cap = [];
  for (const t of ['abc', 'abcd', '你好世', '你好世界', '😀a', '😀😀', 'hello world']) { await A.ev(`(() => { const e = document.getElementById('a'); e.value = ''; e.focus(); return 1; })()`); const r = await A.call('Input.dispatchKeyEvent', { type: 'char', text: t, modifiers: 0 }); cap.push({ t, units: t.length, refused: !!r.error, v: await A.ev('document.getElementById("a").value') }); }
  ok(cap.every((c) => (c.units <= S.CHAR_TEXT_MAX_UNITS ? !c.refused && c.v === c.t : c.refused && c.v === '')), `Chromium ${ver}: a key event's text of ≤ ${S.CHAR_TEXT_MAX_UNITS} UTF-16 units inserts, 4+ is REFUSED (${cap.map((c) => `${JSON.stringify(c.t)}:${c.refused ? 'refused' : 'ok'}`).join(' ')})`, JSON.stringify(cap));
  // the chunker on the real textarea: a seeded walk
  const ALPH = ['a', 'b', 'Z', ' ', '-', '\n', '\n', '\t', '你', '好', '😀', '👩‍👩‍👧', 'é', '́', '\r\n'];
  let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let n = 0, bad = 0, refused = 0; const bads = [];
  for (let k = 0; k < 300; k++) {
    let t = ''; const len = 1 + Math.floor(rnd() * 24); for (let i = 0; i < len; i++) t += ALPH[Math.floor(rnd() * ALPH.length)];
    const r = S.textRecords(t); if (!r.ok) continue; n++;
    await A.ev(`(() => { const e = document.getElementById('b'); e.value = ''; e.focus(); return 1; })()`);
    for (const x of r.records) { const res = await A.call('Input.dispatchKeyEvent', { type: 'char', text: x.text, modifiers: 0 }); if (res.error) refused++; }
    const v = await A.ev('document.getElementById("b").value');
    let want = t.replace(/\r\n?/g, '\n'); if (r.dropped) want = want.replace(/\n$/, '');
    if (v !== want) { bad++; if (bads.length < 3) bads.push({ t, v }); }
  }
  ok(n > 280 && bad === 0 && refused === 0, `the chunker types ${n} seeded texts (CJK, emoji + ZWJ, combining marks, tabs, line breaks) EXACTLY into the real textarea (${bad} wrong, ${refused} refused)`, JSON.stringify(bads));
  const src = fs.readFileSync(path.join(REPO, 'src/browser-stream.js'), 'utf8');
  const PRE = "    if (cur.length + cp.length > cap || (cp === '\\n' && /[^\\n]/.test(cur))) flush();";
  const Spre = M.load('src/browser-stream.js', src.replace(PRE, '    if (Array.from(cur).length >= 200) flush();'), 'pre-fix-200');
  await A.ev(`(() => { const e = document.getElementById('b'); e.value = ''; e.focus(); return 1; })()`);
  let preRefused = 0; for (const x of Spre.textRecords('hello world').records) { const res = await A.call('Input.dispatchKeyEvent', { type: 'char', text: x.text, modifiers: 0 }); if (res.error) preRefused++; }
  ok(src.split(PRE).length === 2 && preRefused === 1 && (await A.ev('document.getElementById("b").value')) === '', 'NEGATIVE CONTROL: the pre-fix record (the whole paste in ONE `char`) is refused by the real Chromium — the textarea stays empty');
  // the copy watch on the real page (a SECOND CDP client = the daemon dispatching the keys)
  const got = [];
  const w = await VP.watchCopies(`ws://127.0.0.1:${C.port}/devtools/browser/x`, { activeUrl: url, onCopy: (c) => got.push(c) });
  ok(w.ok, 'the copy watch arms on the real page', w.error);
  const chord = async (letter) => { await A.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 }); await A.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: letter, code: 'Key' + letter.toUpperCase(), windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0), modifiers: 2 }); await A.call('Input.dispatchKeyEvent', { type: 'keyUp', key: letter, code: 'Key' + letter.toUpperCase(), windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0), modifiers: 2 }); await A.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 }); };
  const take = async (n0) => { await until(() => got.length > n0, 1500, 20); await sleep(60); return got.slice(n0); };
  const selectP = (id = 's', doc = 'document') => A.ev(`(() => { const d = ${doc}; const r = d.createRange(); r.selectNodeContents(d.getElementById('${id}')); d.getSelection().removeAllRanges(); d.getSelection().addRange(r); return 1; })()`);
  let n0 = got.length; await selectP(); await chord('c'); const g1 = await take(n0);
  ok(g1.length === 1 && g1[0].text === 'SELECT-ME 可选文字 text' && g1[0].kind === 'copy', 'a selected paragraph + Ctrl+C: the page\'s copy reports its text once', JSON.stringify(g1));
  n0 = got.length; await A.ev(`document.getElementById('a').value = 'hello world', document.getElementById('a').focus(), 1`); await chord('a'); await chord('c'); const g2 = await take(n0);
  ok(g2.length === 1 && g2[0].text === 'hello world', 'Ctrl+A then Ctrl+C in an input: the field\'s selection (read AT the copy — the order the keys arrived in)', JSON.stringify(g2));
  n0 = got.length; await A.ev(`(() => { const b = document.getElementById('b'); b.value = 'line one\\nline two'; b.focus(); b.setSelectionRange(0, 4); return 1; })()`); await chord('x'); const g3 = await take(n0);
  ok(g3.length === 1 && g3[0].kind === 'cut' && g3[0].text === 'line' && (await A.ev('document.getElementById("b").value')) === ' one\nline two', 'a cut reports the text BEFORE it leaves the field', JSON.stringify(g3));
  n0 = got.length; await A.ev(`(() => { const p = document.getElementById('p'); p.focus(); p.select(); return 1; })()`); await chord('c'); await sleep(400);
  ok(got.length === n0, 'a password field gives nothing (Chrome fires no copy there — nothing of it is ever read)');
  n0 = got.length; await selectP('q', "document.getElementById('f').contentDocument"); await A.ev(`document.getElementById('f').focus(), 1`); await chord('c'); const g4 = await take(n0);
  ok(g4.length === 1 && g4[0].text === 'inside frame', 'a same-origin frame\'s selection is read in its own world', JSON.stringify(g4));
  await A.ev(`location.href = ${JSON.stringify(url + '?nav=2')}, 1`); await sleep(700); // a navigation of the TEST page (never VibeSpace's — no wizard to skip)
  n0 = got.length; await selectP(); await chord('c'); const g5 = await take(n0);
  ok(g5.length === 1 && g5[0].text === 'SELECT-ME 可选文字 text', 'after a navigation the new document has the world again (one report)', JSON.stringify(g5));
  ok(!(await A.ev('Object.keys(window).some((k) => /__vsCopy/.test(k))')), 'the page\'s own scripts never see the binding (it lives in the isolated world)');
  w.close(); A.close(); C.close(); srv.close();
}
if (!CHROME) { skip('② – ⑤: no viewer chrome (google-chrome / chromium)'); await done(); }
if (!dtachOk) { skip('② – ⑤: dtach is not installed — a local session cannot be created'); await done(); }
if (!REAL_AB || !abVer || !/\b0\.(3[7-9]|[4-9]\d)\.|\b[1-9]\d*\./.test(abVer)) { skip(`② – ⑤: the real agent-browser ≥ 0.37 is not resolvable (${REAL_AB || 'none'} ${abVer || ''})`); await done(); }
if (!LAN_IP) console.log('  (no non-loopback IPv4 on this machine — the viewer uses 127.0.0.1, a SECURE context; the plain-http leg is then the API path)');

// ═══ THE WORLD ═══════════════════════════════════════════════════════════════
const VNC = await vncEnv();
/** The quiet test page the AGENT's browser shows: an input, a textarea, a paragraph, a password field; it reports its
 *  state (values, selection, the keys it saw) every 120 ms to the collector — one small POST, never one per event. */
/** verify (2026-09-27): THE HOSTILE PAGE — a script (the page's own, or one the agent planted with `eval`) selecting a
 *  hidden element and dispatching a synthetic `copy` every 400 ms: before the door, its text landed on the driving user's
 *  clipboard with nothing pressed (secure) / after any click (plain http). */
const HOSTILE = `const h=document.createElement('div');h.id='h';h.style.cssText='position:absolute;left:-2000px;top:0';document.body.appendChild(h);let k=0;setInterval(()=>{k++;h.textContent='HIJACK-'+k;const r=document.createRange();r.selectNodeContents(h);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('copy',{bubbles:true}));},400);`;
const innerPage = (n, hostile = false) => `<!doctype html><meta charset=utf-8><title>q ${n}</title><style>html,body{margin:0;background:#fff;font:16px sans-serif}
#a{position:absolute;left:20px;top:20px;width:300px;height:40px;font-size:18px;box-sizing:border-box}
#b{position:absolute;left:20px;top:80px;width:420px;height:120px;font-size:16px;box-sizing:border-box}
#s{position:absolute;left:20px;top:220px;margin:0;font-size:22px;white-space:nowrap}
#p{position:absolute;left:20px;top:270px;width:200px;height:30px}</style>
<input id=a autocomplete=off><textarea id=b></textarea><p id=s>SELECT-ME selectable 可选文字 text</p><input id=p type=password value=secret>
<script>const N=${JSON.stringify(n)};const ku=[],kd=[];document.addEventListener('keyup',(e)=>{ku.push(e.key);if(ku.length>40)ku.shift();},true);document.addEventListener('keydown',(e)=>{kd.push(e.key+(e.ctrlKey?'^C':'')+(e.metaKey?'^M':''));if(kd.length>40)kd.shift();},true);
const b=document.getElementById('b'),a=document.getElementById('a');setInterval(()=>fetch('/st',{method:'POST',body:JSON.stringify({n:N,a:a.value,b:b.value,act:document.activeElement&&document.activeElement.id,sel:String(getSelection()),ss:b.selectionStart,se:b.selectionEnd,ku,kd}),keepalive:true}).catch(()=>{}),120);
${hostile ? HOSTILE : ''}</script>`;

async function makeWorld(name, { patches = [] } = {}) {
  const D = path.join(ROOT, name); const INST = path.join(D, 'i'), HOME = path.join(D, 'h'), XDG = path.join(D, 'x'), BIN = path.join(D, 'b'), ENVS = path.join(D, 'e'), CWD = path.join(D, 'c');
  for (const d of [INST, path.join(HOME, '.agent-browser'), BIN, ENVS, CWD]) fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(XDG, { recursive: true, mode: 0o700 });
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(REPO, f), path.join(INST, f), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(INST, 'node_modules'));
  // THE PATCHED TREE (⑤): one named edit per file, the bundle rebuilt in this tree (never the checkout)
  let rebuilt = null;
  if (patches.length) {
    for (const p of patches) { const f = path.join(INST, p.file); const s = fs.readFileSync(f, 'utf8'); if (s.split(p.from).length !== 2) throw new Error(`patch ${p.name}: its text is not found once in ${p.file}`); fs.writeFileSync(f, s.replace(p.from, p.to)); M.files.push(f); }
    try { execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: INST, stdio: 'ignore', timeout: 120000 }); rebuilt = true; } catch (e) { rebuilt = String(e && e.message).slice(0, 200); }
  }
  fs.symlinkSync(BROWSERS, path.join(HOME, '.agent-browser', 'browsers')); // the INSTALLED chromium, read-only use; never a download, never the owner's profiles or sockets
  // no GPU shader cache under the scratch HOME: a GPU process a dying Chromium re-spawned wrote one back after the removal
  fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({ headed: false, args: '--no-sandbox,--disable-blink-features=AutomationControlled,--disable-gpu,--disable-gpu-shader-disk-cache' }));
  const SID = crypto.randomUUID();
  const hook = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
  const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: CWD, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) env > "${ENVS}/$$.env"; sleep 1; printf '%s\\n%s\\n' '${hook}' '${init}'; exec cat > "${ENVS}/$$.stdin";; esac\necho '2.1.281 (Claude Code)'\n`, { mode: 0o755 });
  // the collector: the inner page + its reports
  const reports = new Map();
  const col = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/q') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(innerPage(u.searchParams.get('n') || '', u.searchParams.get('hostile') === '1')); return; }
    if (u.pathname === '/st' && req.method === 'POST') { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { try { const o = JSON.parse(b); o.at = Date.now(); reports.set(o.n, o); } catch { } res.statusCode = 204; res.end(); }); return; }
    res.statusCode = 404; res.end();
  });
  const CP = await freePort(); await new Promise((r) => col.listen(CP, '127.0.0.1', r));
  const PORT = await freePort();
  const env = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['WAYLAND_DISPLAY', 'DISPLAY', 'XDG_RUNTIME_DIR'].includes(k)) env[k] = v;
  Object.assign(env, { PATH: `${BIN}:${path.dirname(REAL_AB)}:${path.dirname(process.execPath)}:/usr/bin:/bin`, CLAUDE_CMD: path.join(BIN, 'claude'), HOME, XDG_RUNTIME_DIR: XDG, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', NO_AT_BRIDGE: '1', MESA_SHADER_CACHE_DISABLE: 'true', DBUS_SESSION_BUS_ADDRESS: 'disabled:' }); // no accessibility bridge (its socket dir came back under the scratch XDG root after the removal), no session bus, no shader cache written under the scratch roots
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: INST, env: { ...env, ...VNC, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  const booted = await until(() => journal.includes('Ready.'), 60000, 100);
  const W = { D, INST, HOME, PORT, CP, journal: () => journal, reports, rebuilt, booted, env };
  if (!booted) return W;
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  W.innerUrl = (n, q = '') => `http://127.0.0.1:${CP}/q?n=${encodeURIComponent(n)}${q}`;
  W.inner = (n) => reports.get(n) || null;
  W.innerUntil = (n, pred, ms = 6000) => until(() => { const r = reports.get(n); return r && pred(r) ? r : null; }, ms, 40);
  W.api = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  W.createSession = async (sname) => {
    const envBefore = new Set(fs.readdirSync(ENVS));
    const n0 = msgs.filter((m) => m.type === 'created').length;
    wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, cols: 80, rows: 24, reqId: 'r-' + sname, name: sname }));
    await until(() => msgs.filter((m) => m.type === 'created').length > n0, 20000);
    const created = msgs.filter((m) => m.type === 'created').at(-1);
    const envFile = await until(() => { for (const f of fs.readdirSync(ENVS)) { if (envBefore.has(f) || !f.endsWith('.env')) continue; let t = ''; try { t = fs.readFileSync(path.join(ENVS, f), 'utf8'); } catch { continue; } if (/^AGENT_BROWSER_SESSION=/m.test(t) && /^VIBESPACE_SESSION_TOKEN=/m.test(t)) return f; } return null; }, 15000, 100);
    const senv = {}; for (const line of fs.readFileSync(path.join(ENVS, envFile), 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) senv[line.slice(0, i)] = line.slice(i + 1); }
    const pairs = Object.fromEntries(Object.entries(senv).filter(([k]) => k.startsWith('AGENT_BROWSER_')));
    const vb = (args, timeout = 120000) => new Promise((resolve) => execFile(process.execPath, [path.join(INST, 'data/bin/vibespace-browser'), ...args], { env: { ...env, ...pairs, VIBESPACE_API: senv.VIBESPACE_API, VIBESPACE_SESSION_TOKEN: senv.VIBESPACE_SESSION_TOKEN, VIBESPACE_SESSION_CWD: CWD }, cwd: CWD, timeout, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') })));
    // lane takeover-keyboard: what the fake claude READ on its stdin (the chat message Enter sent lands here)
    return { sessionId: created.sessionId, vb, stdinFile: path.join(ENVS, envFile.replace(/\.env$/, '.stdin')), cwd: CWD };
  };
  // the VIEWER: headless Chrome on the machine's own NON-loopback address (a non-secure context), a clipboard tab on
  // 127.0.0.1 (a secure one — it fills and reads the clipboard the viewer shares, the way another app would)
  const outer = await launchChrome(CHROME, { name: 'outer-' + name, args: ['--window-size=1920,1080', '--lang=en-US'] });
  W.outer = outer;
  W.APP = `http://${LAN_IP || '127.0.0.1'}:${PORT}/`;
  W.APP_SECURE = `http://127.0.0.1:${PORT}/`; // verify: a viewer on the loopback IS a secure context (navigator.clipboard present — the API rung)
  const bver = await (await fetch(`http://127.0.0.1:${outer.port}/json/version`)).json();
  const bws = new WebSocket(bver.webSocketDebuggerUrl); await new Promise((r, e) => { bws.on('open', r); bws.on('error', e); });
  let bid = 0; const bpend = new Map(); bws.on('message', (d) => { const m = JSON.parse(d); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } });
  const bcall = (method, params = {}) => new Promise((r) => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
  /** A target in its OWN window (a background tab reads an empty clipboard and is `hidden` — it would never vote for the page's size). */
  W.newWindow = async (url) => (await bcall('Target.createTarget', { url, newWindow: true })).result.targetId;
  /** lane takeover-keyboard: END a viewer page (its target), not only this suite's CDP socket to it — a page left loaded
   *  stays a live CLIENT of the app with live views of the browser that vote for the page's size. Measured: with the door
   *  leg's secure viewer (origin 127.0.0.1 ⇒ its own device tag) left loaded, ④'s page followed a 1398×866 window of
   *  "another device" 3 runs of 3 (also on master b970f16d); with its target ended, 1398×835 and "your other tab". */
  W.closePage = async (P) => { try { P.close(); } catch { } await bcall('Target.closeTarget', { targetId: P.target.id }); await sleep(300); };
  const tab2Id = await W.newWindow(`http://127.0.0.1:${PORT}/api/version`);
  const clip = await cdpPage(outer.port, (x) => x.id === tab2Id);
  await clip.call('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: `http://127.0.0.1:${PORT}` });
  await clip.call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await sleep(300);
  W.clipLog = [];
  W.setClipboard = async (text) => { const r = await clip.call('Runtime.evaluate', { expression: `navigator.clipboard.writeText(${JSON.stringify(text)}).then(() => navigator.clipboard.readText()).then((t) => ({ t }), (e) => ({ err: String(e && e.message) }))`, awaitPromise: true, returnByValue: true, userGesture: true }); const v = r.result && r.result.result ? r.result.result.value : r; if (!(v && v.t === text)) W.clipLog.push({ set: text.slice(0, 20), v: JSON.stringify(v).slice(0, 200) }); return !!(v && v.t === text); };
  W.readClipboard = async () => { const r = await clip.call('Runtime.evaluate', { expression: 'navigator.clipboard.readText().then((t) => ({ t }), (e) => ({ err: String(e && e.message) }))', awaitPromise: true, returnByValue: true, userGesture: true }); const v = r.result && r.result.result ? r.result.result.value : null; if (!v || v.err !== undefined) { W.clipLog.push({ read: JSON.stringify(v || r).slice(0, 200) }); return null; } return v.t; };
  /** A viewer PAGE of the app (its own target in its own window): `mac` emulates a Mac viewer; `lang` its language. */
  W.page = async ({ mac = false, lang = 'en', size = [1920, 963], app = W.APP, uiScale = null } = {}) => {
    const createdId = await W.newWindow('about:blank');
    const P = await cdpPage(outer.port, (x) => x.id === createdId);
    await P.call('Page.enable'); await P.call('Runtime.enable');
    if (mac) await P.call('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', platform: 'MacIntel', userAgentMetadata: { brands: [{ brand: 'Google Chrome', version: '152' }], fullVersion: '152.0.0.0', platform: 'macOS', platformVersion: '14.0.0', architecture: 'arm', model: '', mobile: false } });
    await P.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await P.call('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await P.call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
    if (uiScale) await P.call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.uiScale', ${JSON.stringify(String(uiScale))}); } catch {}` }); // lane takeover-keyboard: userW's UI scale (0.9)
    await P.call('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
    await P.call('Page.navigate', { url: app });
    P.ready = await until(async () => { try { return await P.ev('!!(window.app && window.app.wm && window.app.sidebar)'); } catch { return false; } }, 60000, 250);
    if (P.ready) await P.ev('window.app.ready');
    P.facts = P.ready ? await P.ev('({ secure: isSecureContext, clipboard: !!navigator.clipboard, platform: navigator.platform, uad: navigator.userAgentData ? navigator.userAgentData.platform : null })') : null;
    /** Run `js` with `w` = the n-th live-view window of `sid` and `L` = its controller. */
    P.q = (sid, js, nth = 0) => P.ev(`(() => { const w = [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})[${nth}]; const L = w && w._browserLive; ${js} })()`);
    P.openLive = async (sid, { profileId = null, popOut = false, box = [24, 12, 1400, 900], nth = 0 } = {}) => {
      await P.ev(`(() => { const w = window.app.openBrowserLive({ sessionId: ${JSON.stringify(sid)}, profileId: ${JSON.stringify(profileId)}, popOut: ${popOut} }); if (w) w.gridBounds = null; return true; })()`);
      const live = await until(() => P.q(sid, 'return L && L.state().frames >= 1 && L.img().naturalWidth > 0 ? true : null;', nth).catch(() => null), 40000, 200);
      await P.layout(sid, box, nth);
      return !!live;
    };
    P.layout = async (sid, [x, y, wd, ht], nth = 0) => { await P.q(sid, `const el = w.element; w.gridBounds = null; window.app.wm.focusWindow?.(w.id); el.style.left = '${x}px'; el.style.top = '${y}px'; el.style.width = '${wd}px'; el.style.height = '${ht}px'; w.onResize && w.onResize(); return true;`, nth); await sleep(400); };
    P.takeover = async (sid, nth = 0) => { await P.q(sid, 'L.send({ type: "takeover" }); return true;', nth); return until(() => P.q(sid, 'return L.state().mode === "takeover" && L.state().mine && L.ownsKeyboard() ? true : null;', nth), 8000, 100); };
    P.handback = async (sid, nth = 0) => { await P.q(sid, 'L.send({ type: "handback" }); return true;', nth); return until(() => P.q(sid, 'return L.state().mode !== "takeover" ? true : null;', nth), 8000, 100); };
    /** Where page point (px, py) of the agent's page is drawn in this viewer page. */
    P.pointOf = async (sid, px, py, nth = 0) => {
      const g = await P.q(sid, 'const r = L.img().getBoundingClientRect(); const op = getComputedStyle(L.img()).objectPosition; const G = L.geometry(); return { left: r.left, top: r.top, width: r.width, height: r.height, natW: L.img().naturalWidth, natH: L.img().naturalHeight, op, cssW: G.cssW, cssH: G.cssH };', nth);
      const k = Math.min(g.width / g.natW, g.height / g.natH); const dw = g.natW * k, dh = g.natH * k;
      const frac = (v, room) => (/%$/.test(v) ? parseFloat(v) / 100 : room ? parseFloat(v) / room : 0.5);
      const [opx = '50%', opy = '50%'] = String(g.op || '').split(/\s+/);
      return { x: g.left + (g.width - dw) * frac(opx, g.width - dw) + px * dw / g.cssW, y: g.top + (g.height - dh) * frac(opy, g.height - dh) + py * dh / g.cssH };
    };
    const I = (params) => P.call('Input.dispatchMouseEvent', params);
    /** lane takeover-keyboard: a REAL press on an app element — `js` returns it; the point is its rect's centre, proven to
     *  hit it (elementFromPoint) before the press (B-b122: an input is sent only onto the surface that will take it). */
    P.clickEl = async (js) => {
      const at = await P.ev(`(() => { const el = (() => { ${js} })(); if (!el) return null; const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 14); const hit = document.elementFromPoint(x, y); return { x, y, hit: !!hit && (hit === el || el.contains(hit)), hitCls: hit ? String(hit.className || hit.tagName) : null }; })()`);
      if (!at || !at.hit) return { ok: false, at };
      await I({ type: 'mouseMoved', x: at.x, y: at.y }); await I({ type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }); await I({ type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      return { ok: true, at };
    };
    P.click = async (sid, px, py, { count = 1 } = {}) => { const p = await P.pointOf(sid, px, py); await I({ type: 'mouseMoved', x: p.x, y: p.y }); for (let c = 1; c <= count; c++) { await I({ type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: c }); await I({ type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: c }); } return p; };
    P.drag = async (sid, [ax, ay], [bx, by], steps = 10) => { const a = await P.pointOf(sid, ax, ay), b = await P.pointOf(sid, bx, by); await I({ type: 'mouseMoved', x: a.x, y: a.y }); await sleep(60); await I({ type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 }); for (let i = 1; i <= steps; i++) { await I({ type: 'mouseMoved', x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps, button: 'left', buttons: 1 }); await sleep(45); } await I({ type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 }); };
    const K = (params) => P.call('Input.dispatchKeyEvent', params);
    P.key = async (key, { code, vk, mods = 0, text, commands } = {}) => {
      const up = key.length === 1 ? key.toUpperCase() : key; const c = code || (key.length === 1 ? 'Key' + up : key); const v = vk || (key.length === 1 ? up.charCodeAt(0) : 0);
      const down = { type: text !== undefined || (key.length === 1 && !(mods & 6)) ? 'keyDown' : 'rawKeyDown', key, code: c, windowsVirtualKeyCode: v, modifiers: mods };
      if (text !== undefined) { down.text = text; down.unmodifiedText = text; } else if (key.length === 1 && !(mods & 6)) { down.text = key; down.unmodifiedText = key; }
      if (commands) down.commands = commands;
      await K(down); await K({ type: 'keyUp', key, code: c, windowsVirtualKeyCode: v, modifiers: mods });
    };
    /** lane takeover-keyboard: plain text as real keys, one character at a time (space by its code) */
    P.type = async (text) => { for (const ch of text) await P.key(ch, ch === ' ' ? { code: 'Space', vk: 32 } : {}); };
    /** A chord as the browser delivers it: the modifier down, the key, the modifier up (⌘ = Meta, with the Mac's editing command). */
    P.chord = async (letter, { meta = false, shift = false, commands = null } = {}) => {
      const mk = meta ? ['Meta', 'MetaLeft', 91, 4] : ['Control', 'ControlLeft', 17, 2]; const mods = mk[3] | (shift ? 8 : 0);
      await K({ type: 'rawKeyDown', key: mk[0], code: mk[1], windowsVirtualKeyCode: mk[2], modifiers: mk[3] });
      await P.key(shift ? letter.toUpperCase() : letter, { code: 'Key' + letter.toUpperCase(), vk: letter.toUpperCase().charCodeAt(0), mods, commands: commands || undefined });
      await K({ type: 'keyUp', key: mk[0], code: mk[1], windowsVirtualKeyCode: mk[2], modifiers: 0 });
    };
    /** An IME as Chrome delivers one: keyDown 229, the composition, the commit — then the commit key's own keyUp (Enter). */
    P.ime = async (commit) => {
      await K({ type: 'keyDown', key: 'Process', code: 'KeyN', windowsVirtualKeyCode: 229, modifiers: 0 });
      for (let i = 1; i <= Array.from(commit).length; i++) { const s = Array.from(commit).slice(0, i).join(''); await P.call('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length }); }
      await P.call('Input.insertText', { text: commit });
      await K({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 0 });
    };
    return P;
  };
  W.close = async () => { try { wsMain.close(); } catch { } try { clip.close(); } catch { } try { bws.close(); } catch { } outer.close(); try { srv.kill('SIGKILL'); } catch { } col.close(); };
  return W;
}

/** The legs every kind of browser runs (the viewer page `P` holds a live view of `sid` driving page `n`). */
async function inputLegs(W, P, sid, n, label, { control = false } = {}) {
  const out = {};
  const view = () => P.q(sid, 'const s = L.state(); return { echo: s.echo, receipts: s.receipts, copyChip: s.copyChip, sink: document.activeElement === L.kbd(), owns: L.ownsKeyboard() };');
  await P.click(sid, 200, 140); // a REAL click into the picture: the textarea
  out.focus = await W.innerUntil(n, (r) => r.act === 'b', 5000);
  out.sinkAfterClick = await P.q(sid, 'return document.activeElement === L.kbd();');
  const typed = async (pasteText, how) => { const before = (W.inner(n) || {}).b || ''; ok(await W.setClipboard(pasteText), `${label}: the clipboard holds the text (another app filled it)`, JSON.stringify(W.clipLog.slice(-2))); if (how === 'meta') await P.chord('v', { meta: true, commands: ['paste'] }); else await P.chord('v'); const want = before + pasteText.replace(/\r\n?/g, '\n'); const r = await W.innerUntil(n, (x) => x.b === want, 15000); return { ok: !!r, got: ((W.inner(n) || {}).b || '').slice(before.length) }; };
  out.p11 = await typed('hello world', 'ctrl');
  out.pCjk = await typed('你好世界 😀😀', 'meta');
  const long = Array.from({ length: 12 }, (_, i) => `row ${i}\tvalue 值 ${i} 😀`).join('\n');
  out.pLong = await typed(long, 'ctrl');
  // the IME: 12 characters committed with Enter — and the Enter's keyUp must not reach the page alone
  const kuBefore = ((W.inner(n) || {}).ku || []).length;
  const beforeIme = (W.inner(n) || {}).b || '';
  await P.ime('我想买这个东西然后付款吧');
  const ime = await W.innerUntil(n, (x) => x.b === beforeIme + '我想买这个东西然后付款吧', 8000);
  await sleep(400);
  out.ime = !!ime;
  out.enterKeyUp = ((W.inner(n) || {}).ku || []).slice(Math.max(0, kuBefore - 40)).filter((k) => k === 'Enter').length;
  // selection by the mouse, then copy out
  await P.click(sid, 60, 232, { count: 2 });
  out.dbl = (await W.innerUntil(n, (x) => x.sel && x.sel.length > 0, 3000) || {}).sel || '';
  await P.click(sid, 200, 140); await W.innerUntil(n, (x) => !x.sel, 3000); // collapse the word first (a press ON a selection would start a drag-and-drop of it)
  await P.call('Network.enable'); const evMark = P.events.length;
  await P.drag(sid, [22, 232], [330, 232]);
  out.drag = (await W.innerUntil(n, (x) => x.sel && x.sel.length > 12, 3000) || {}).sel || '';
  out.dragFrames = P.events.slice(evMark).filter((m) => m.method === 'Network.webSocketFrameSent' && /input_mouse/.test(m.params.response.payloadData)).map((m) => m.params.response.payloadData.replace(/"type":"input_mouse",/, '').slice(0, 110));
  await P.call('Network.disable');
  await W.setClipboard('(before the copy)');
  await P.chord('c');
  out.clip = await until(async () => { const v = await W.readClipboard(); return v && v !== '(before the copy)' ? v : null; }, 4000, 100);
  out.copyView = await view();
  // cut in the textarea: select all, cut
  await P.click(sid, 200, 140);
  await P.chord('a'); await P.chord('x');
  const cutR = await W.innerUntil(n, (x) => x.b === '', 4000);
  out.cut = { emptied: !!cutR, clip: await until(async () => { const v = await W.readClipboard(); return v && v.includes('我想买') ? v : null; }, 4000, 100) };
  out.view = await view();
  return out;
}

const ONLY = (process.env.LIVE_INPUT_ONLY || '').split(',').filter(Boolean); // debugging: a subset of kinds / sections (named,eph,med,journal,mac,fit,controls)
const want = (x) => !ONLY.length || ONLY.includes(x);
const kinds = [];
const wd = await makeWorld('w');
if (!ok(wd.booted, 'the scratch server booted (its own data/, HOME, XDG root; the real agent-browser on its PATH)', wd.journal().slice(-800))) await done();
const E = await wd.page({ lang: 'en' });
ok(E.ready && E.facts && (LAN_IP ? E.facts.secure === false && E.facts.clipboard === false : true), `the viewer page: ${JSON.stringify(E.facts)} (the owner's shape: a hostname over plain http — no secure context, no navigator.clipboard)`);

// ── ② per kind ──
console.log('— ② every kind of browser: a real click, the real paste chord (Ctrl and ⌘), a real composition, the mouse selecting, copy out');
const S1 = await wd.createSession('shop-chat');
const newRes = await S1.vb(['new', 'shopping']); await S1.vb(['use', 'shopping']);
const profId = (/\((bp-[0-9a-f]{8})\)/.exec(newRes.stdout + newRes.stderr) || [])[1] || null;
await S1.vb(['open', wd.innerUrl('named')]);
await wd.innerUntil('named', () => true, 20000);
if (want('named')) kinds.push({ label: 'named profile "shopping" (a direct lease — the owner\'s)', S: S1, n: 'named', profileId: profId });
// (a LIVE_INPUT_ONLY subset without these kinds does not start their browsers — the full run is unchanged)
const S2 = want('eph') ? await wd.createSession('eph-chat') : null;
if (S2) await S2.vb(['open', wd.innerUrl('eph')]);
if (S2) await wd.innerUntil('eph', () => true, 25000);
if (want('eph')) kinds.push({ label: 'the conversation\'s own browser', S: S2, n: 'eph', profileId: null });
const S3 = want('med') ? await wd.createSession('med-chat') : null;
const medNew = S3 ? await S3.vb(['new', 'medshop', '--sharing', 'instance']) : { stdout: '', stderr: '' }; if (S3) await S3.vb(['use', 'medshop']);
const medId = (/\((bp-[0-9a-f]{8})\)/.exec(medNew.stdout + medNew.stderr) || [])[1] || null;
const medOpen = S3 ? await S3.vb(['open', wd.innerUrl('med')]) : { stdout: '', stderr: '' };
const medUp = S3 ? !!(await wd.innerUntil('med', () => true, 45000)) : false;
if (medUp && want('med')) kinds.push({ label: 'a MEDIATED named profile (every input through the credit fence)', S: S3, n: 'med', profileId: medId });
else if (want('med')) ok(false, 'the MEDIATED named profile comes up (new medshop --sharing instance, use, open)', `${(medNew.stdout + medNew.stderr).slice(-300)} | ${(medOpen.stdout + medOpen.stderr).slice(-300)} | ${wd.journal().split('\n').filter((l) => /mediat|medshop|bp-/.test(l)).slice(-6).join(' / ')}`);
const results = {};
for (const k of kinds) {
  const opened = await E.openLive(k.S.sessionId, { profileId: k.profileId });
  if (!ok(opened, `${k.label}: its live view shows the page`)) continue;
  ok(await E.takeover(k.S.sessionId), `${k.label}: take over — this view owns the keyboard`);
  const r = await inputLegs(wd, E, k.S.sessionId, k.n, k.label);
  results[k.n] = r;
  ok(r.focus && r.sinkAfterClick, `${k.label}: a real click into the picture focuses the page's field AND the view's keyboard sink keeps the focus`, JSON.stringify({ focus: !!r.focus, sink: r.sinkAfterClick }));
  ok(r.p11.ok, `${k.label}: Ctrl+V of "hello world" (11 units) lands`, JSON.stringify(r.p11));
  ok(r.pCjk.ok, `${k.label}: ⌘V (the Mac's paste command) of "你好世界 😀😀" lands`, JSON.stringify(r.pCjk));
  ok(r.pLong.ok, `${k.label}: a 12-line paste with tabs, CJK and emoji lands EXACTLY in the textarea`, JSON.stringify(r.pLong).slice(0, 300));
  ok(r.ime, `${k.label}: a real composition (keyCode 229 → the IME's commit of 12 characters) lands`);
  ok(r.enterKeyUp === 0, `${k.label}: the commit key's keyup never reaches the page alone (${r.enterKeyUp} Enter keyups seen)`);
  ok(/^SELECT/.test(r.dbl), `${k.label}: a double click selects a word ("${r.dbl}")`);
  ok(/SELECT-ME selectable/.test(r.drag), `${k.label}: a drag selects across the paragraph ("${r.drag}")`, JSON.stringify(r.dragFrames));
  ok(r.clip && /SELECT-ME selectable/.test(r.clip), `${k.label}: Ctrl+C puts the page's selection on the VIEWER's clipboard (plain http: inside the key's moment, no click) — "${r.clip}"`, JSON.stringify(r.copyView));
  ok(r.cut.emptied && r.cut.clip && r.cut.clip.includes('hello world') && r.cut.clip.includes('我想买这个东西然后付款吧'), `${k.label}: Ctrl+A + Ctrl+X cuts the whole textarea to the viewer's clipboard`, JSON.stringify(r.cut).slice(0, 300));
  ok(r.view && r.view.receipts && r.view.receipts.failed === 0 && !r.view.receipts.failing, `${k.label}: every receipt came back delivered (${r.view && r.view.receipts && r.view.receipts.delivered} delivered, 0 failed)`, JSON.stringify(r.view));
  await E.handback(k.S.sessionId);
  await E.q(k.S.sessionId, 'window.app.wm.minimize(w.id); return true;');
}

// ── builder r2 (the reality verifier's A): A SHARED browser's size while you drive it ──
console.log('— a shared browser keeps its size while you drive it: said in plain words, never as the agent\'s size, re-fitted at the handback');
if (medUp && want('med') && want('fit')) {
  const sid = S3.sessionId;
  await E.q(sid, 'window.app.wm.revealWindow(w.id); return true;');
  await E.layout(sid, [24, 12, 1400, 900]);
  const mine = (js) => E.q(sid, js).catch(() => null);
  const fitted0 = await until(() => mine('const s = L.state(); return s.mode !== "takeover" && s.fit && s.fit.state === "fitted" && s.fit.viewerId === s.you ? { w: s.fit.width, h: s.fit.height } : null;'), 15000, 200);
  ok(!!fitted0, `the shared browser's page fits the big window while the agent drives (${fitted0 && fitted0.w}×${fitted0 && fitted0.h})`);
  const jFrom = wd.journal().length; // this leg's own takeover (the input legs above took over this browser too)
  ok(await E.takeover(sid), 'take over the shared browser');
  await E.layout(sid, [24, 12, 1000, 700]); // the window changes size while you drive
  const held = await until(() => mine('const s = L.state(); const c = L.el().querySelector(".browser-live-fit"); return s.fit && s.fit.code === "held_while_driving" && c && c.style.display !== "none" ? { state: s.fit.state, text: c.textContent, title: c.title, natW: L.img().naturalWidth } : null;'), 15000, 200);
  ok(held && held.state === 'unavailable' && fitted0 && held.text === `Page ${fitted0.w}×${fitted0.h} · resized after the handback` && /cannot change its size while you drive it/.test(held.title) && !/CDP|Emulation|interrupted|Details/.test(held.title), `the chip says it in plain words: "${held && held.text}" — "${held && held.title}"`, JSON.stringify(held));
  const j = wd.journal().slice(jFrom).split('\n');
  const jl = j.filter((l) => /the agent set the page|could not be sized to the pane|keeps its size while the user drives/.test(l));
  ok(!j.some((l) => /the agent set the page/.test(l)) && !j.some((l) => l.includes(medId) && /could not be sized to the pane/.test(l)) && j.filter((l) => l.includes(medId) && /keeps its size while the user drives/.test(l)).length === 1, 'the journal (this takeover): never "the agent set the page\'s size", never a warning — ONE line for the takeover', jl.slice(-8).join(' | '));
  await E.handback(sid);
  const after = await until(() => mine('const s = L.state(); const c = L.el().querySelector(".browser-live-fit"); return s.fit && s.fit.state === "fitted" && s.fit.viewerId === s.you && (!c || c.style.display === "none") ? { w: s.fit.width, h: s.fit.height, natW: L.img().naturalWidth } : null;'), 15000, 200);
  ok(after && fitted0 && after.w < fitted0.w - 100, `after the handback the page fits THIS window again at once (${after && after.w}×${after && after.h}; the chip gone)`, JSON.stringify(after));
  await E.q(sid, 'window.app.wm.minimize(w.id); return true;');
}

// ── THE COPY-OUT DOOR (verify 2026-09-27) ──
console.log('— the copy-out door: a page firing its own copies (or the agent\'s planted script) never reaches the driving user\'s clipboard');
if (want('door')) {
  const view = (P) => P.q(S1.sessionId, 'const s = L.state(); return { echo: s.echo, copyChip: s.copyChip, copiedLength: s.copiedLength };');
  await S1.vb(['open', wd.innerUrl('hostile', '&hostile=1')]);
  ok(!!(await wd.innerUntil('hostile', () => true, 20000)), 'the hostile page is up in the agent\'s browser (a synthetic copy every 400 ms on a hidden selection)');
  await E.q(S1.sessionId, 'window.app.wm.revealWindow(w.id); return true;');
  ok(await E.takeover(S1.sessionId), 'the non-secure viewer takes over');
  ok(await wd.setClipboard('(untouched)'), 'the clipboard holds "(untouched)"');
  await sleep(1300);
  const v0 = await view(E);
  ok((await wd.readClipboard()) === '(untouched)' && !v0.copyChip && !/copied/.test(String(v0.echo || '')), `nothing pressed: the clipboard is untouched and the bar offers nothing (${JSON.stringify(v0)})`);
  await E.click(S1.sessionId, 200, 140); // ONE plain click — no copy chord
  await sleep(1500);
  const v1 = await view(E);
  ok((await wd.readClipboard()) === '(untouched)', `after one plain click the clipboard is STILL untouched (before the door: "HIJACK-11") — ${JSON.stringify(v1)}`);
  ok(v1.copyChip && v1.copiedLength > 0, 'the click\'s copy is offered as the chip only (one explicit click) — never a silent write');
  await E.handback(S1.sessionId);
  await E.q(S1.sessionId, 'window.app.wm.minimize(w.id); return true;');
  const Es = await wd.page({ lang: 'en', app: wd.APP_SECURE });
  ok(Es.ready && Es.facts && Es.facts.secure === true && Es.facts.clipboard === true, `a SECURE viewer (127.0.0.1): ${JSON.stringify(Es.facts)} — the Clipboard API rung, which needs no browser gesture`);
  ok(await Es.openLive(S1.sessionId, { profileId: profId }), 'its live view shows the hostile page');
  ok(await wd.setClipboard('(untouched-secure)'), 'the clipboard holds "(untouched-secure)"');
  ok(await Es.takeover(S1.sessionId), 'the secure viewer takes over');
  await sleep(1500);
  const v2 = await view(Es);
  ok((await wd.readClipboard()) === '(untouched-secure)' && !v2.copyChip && !/copied/.test(String(v2.echo || '')), `nothing pressed on a secure page: the clipboard is untouched, no chip (before the door: "HIJACK-19" written through the API) — ${JSON.stringify(v2)}`);
  await Es.handback(S1.sessionId);
  await Es.q(S1.sessionId, 'window.app.wm.closeWindow?.(w.id); return true;');
  await wd.closePage(Es);
  await S1.vb(['open', wd.innerUrl('named')]); await wd.innerUntil('named', () => true, 20000);
}

// ── the journal ──
console.log('— the journal: a lease said when the holder changes; the handback without the query; ONE record start');
if (want('journal')) {
  for (let i = 0; i < 4; i++) await S1.vb(['get', 'url']);
  const j = wd.journal();
  ok(!/^\[browser\] .*already holds/m.test(j) && (j.match(/attached to bp-/g) || []).length >= 1, `repeated agent commands add no "already holds" line (the lease is said when it is taken: ${(j.match(/attached to bp-/g) || []).length} "attached to" line(s))`);
  await S1.vb(['open', wd.innerUrl('named', '&order=A-1234&token=s3cr3t')]);
  await wd.innerUntil('named', () => true, 10000);
  await E.q(S1.sessionId, 'window.app.wm.revealWindow(w.id); return true;');
  await E.takeover(S1.sessionId); await sleep(300); await E.handback(S1.sessionId);
  const hb = await until(() => (wd.journal().split('\n').filter((l) => /handed back to the agent/.test(l)).at(-1) || '').includes('/q?') ? wd.journal().split('\n').filter((l) => /handed back to the agent/.test(l)).at(-1) : null, 5000, 100);
  ok(hb && /\/q\?…/.test(hb) && !/A-1234|s3cr3t|order=/.test(hb), `the handback line prints origin + path, never the query ("…${hb && hb.slice(hb.indexOf(' at ')).slice(0, 80)}")`, hb);
  // recording switched on WHILE agent commands run: one start
  const patchP = wd.api('PATCH', `/api/browser/profiles/${profId}`, { record: true });
  const verbs = [S1.vb(['get', 'title']), S1.vb(['get', 'url'])];
  await Promise.all([patchP, ...verbs]);
  await until(() => /\[browser-trace\] (recording bp-|record start failed)/.test(wd.journal()), 20000, 200);
  await sleep(1500);
  const starts = (wd.journal().match(/\[browser-trace\] recording bp-/g) || []).length, failed = (wd.journal().match(/record start failed/g) || []).length;
  ok(starts + failed === 1, `recording switched on during agent commands: ONE \`record start\` (${starts} started, ${failed} failed — the owner's journal had one of each, 106 ms apart)`, wd.journal().split('\n').filter((l) => /browser-trace/.test(l)).join('\n').slice(-600));
  const dig = await wd.api('GET', '/api/browser/profiles');
  const rr = dig.json && dig.json.recordingRefused ? dig.json.recordingRefused[profId] : null;
  ok(starts === 0 || !rr, 'no refusal beside a live recording in the digest', JSON.stringify(rr));
  await wd.api('PATCH', `/api/browser/profiles/${profId}`, { record: false });
}

// ═══ ③ A MAC VIEWER ════════════════════════════════════════════════════════════
console.log('— ③ a Mac viewer on the Linux browser: ⌘A / ⌘C / ⌘X / ⌘Z / ⌘⇧Z are the editing chords, never letters');
async function macLegs(W, Mp, sid, n) {
  const out = {};
  await Mp.openLive(sid, { profileId: profId });
  out.took = await Mp.takeover(sid);
  await Mp.click(sid, 200, 140);
  await W.innerUntil(n, (r) => r.act === 'b', 5000);
  await W.setClipboard('mac text 苹果');
  await Mp.chord('v', { meta: true, commands: ['paste'] });
  await W.innerUntil(n, (r) => r.b.endsWith('mac text 苹果'), 8000);
  const base = (W.inner(n) || {}).b || '';
  await Mp.chord('a', { meta: true });
  out.selAll = await W.innerUntil(n, (r) => r.ss === 0 && r.se === r.b.length && r.b.length > 0, 4000);
  out.noA = ((W.inner(n) || {}).b || '') === base;
  await W.setClipboard('(before)');
  await Mp.chord('c', { meta: true });
  out.clip = await until(async () => { const v = await W.readClipboard(); return v && v !== '(before)' ? v : null; }, 4000, 100);
  await Mp.chord('x', { meta: true });
  out.cut = !!(await W.innerUntil(n, (r) => r.b === '', 4000));
  await Mp.chord('z', { meta: true });
  out.undo = !!(await W.innerUntil(n, (r) => r.b === base, 4000));
  await Mp.chord('z', { meta: true, shift: true });
  out.redo = !!(await W.innerUntil(n, (r) => r.b === '', 4000));
  out.kd = ((W.inner(n) || {}).kd || []).slice(-8);
  await Mp.handback(sid);
  return out;
}
if (want('mac')) {
  const Mp = await wd.page({ mac: true, lang: 'en' });
  ok(Mp.ready && Mp.facts && /Mac/.test(Mp.facts.platform) && (Mp.facts.uad === 'macOS' || (Mp.facts.uad === null && Mp.facts.secure === false)), `the Mac viewer: navigator.platform ${Mp.facts && Mp.facts.platform}, userAgentData ${Mp.facts && Mp.facts.uad} (a plain-http page has no userAgentData — the view reads navigator.platform)`);
  const m = await macLegs(wd, Mp, S1.sessionId, 'named');
  ok(m.took, 'the Mac viewer takes over');
  ok(m.selAll && m.noA, `⌘A selects ALL of the textarea and types no "a" (the owner's Chromium typed it) — keys the page saw: ${JSON.stringify(m.kd)}`);
  ok(m.clip && m.clip.includes('mac text 苹果'), `⌘C copies the selection to the viewer's clipboard ("${String(m.clip).slice(-20)}")`);
  ok(m.cut && m.undo && m.redo, `⌘X cuts, ⌘Z undoes, ⌘⇧Z redoes (${JSON.stringify({ cut: m.cut, undo: m.undo, redo: m.redo })})`);
  await Mp.q(S1.sessionId, 'window.app.wm.closeWindow?.(w.id); return true;');
  Mp.close();
}

// ═══ ④ THE FIT CHIP ═══════════════════════════════════════════════════════════
console.log('— ④ the fit chip: where the page\'s size comes from, and a click that makes the page follow THIS window');
async function shootBar(P, sid, nth, file) {
  if (!SHOTS) return null;
  const r = await P.q(sid, 'const b = L.el().querySelector(".browser-live-bar").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height };', nth);
  const shot = await P.call('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: Math.max(0, r.y - 30), width: r.w, height: r.h + 30 + 60, scale: 1 } });
  fs.mkdirSync(SHOTS, { recursive: true });
  const f = path.join(SHOTS, file); fs.writeFileSync(f, Buffer.from(shot.result.data, 'base64')); return f;
}
if (want('fit')) {
  // the big window on the en page; a smaller pop-out on the same page; a small window on a zh page (another tab/window of this browser)
  await E.q(S1.sessionId, 'window.app.wm.revealWindow(w.id); return true;');
  await E.layout(S1.sessionId, [24, 12, 1400, 900]);
  await E.openLive(S1.sessionId, { profileId: profId, popOut: true, box: [1000, 520, 900, 420], nth: 1 });
  const chipOf = (P, nth) => P.q(S1.sessionId, 'const c = L.el().querySelector(".browser-live-fit"); return c && c.style.display !== "none" ? { text: c.textContent, title: c.title, kind: c.dataset.kind } : null;', nth);
  const popChip = await until(() => chipOf(E, 1), 12000, 200);
  ok(popChip && popChip.text === 'Sized for your other window · Fit here', `the smaller window on the same page: "${popChip && popChip.text}" — "${popChip && popChip.title}"`);
  ok(popChip && /your other window/.test(popChip.title) && /shown smaller/.test(popChip.title) && /Click to make the page fit this window instead/.test(popChip.title), 'its tooltip: the page follows your other window, it is shown smaller here, a click makes it fit this one');
  const shotEn = await shootBar(E, S1.sessionId, 1, 'live-bar-en-other-window.png');
  const Z = await wd.page({ lang: 'zh' });
  await Z.openLive(S1.sessionId, { profileId: profId, box: [24, 12, 960, 480] });
  const zChip = await until(() => chipOf(Z, 0), 12000, 200);
  ok(zChip && zChip.text === '网页大小跟随你的另一个标签页 · 点此适配本窗口' && /另一个标签页或窗口/.test(zChip.title) && /缩小显示/.test(zChip.title) && /适配这个窗口/.test(zChip.title), `a window in another tab, in Chinese: "${zChip && zChip.text}" — "${zChip && zChip.title}"`);
  const shotZh = await shootBar(Z, S1.sessionId, 0, 'live-bar-zh-other-tab.png');
  // the click: the page follows the zh window
  await Z.q(S1.sessionId, 'L.el().querySelector(".browser-live-fit").click(); return true;');
  const followed = await until(async () => { const s = await Z.q(S1.sessionId, 'const s = L.state(); return s.fit && s.fit.state === "fitted" && s.fit.viewerId === s.you ? s.fit : null;').catch(() => null); return s; }, 12000, 200);
  ok(!!followed, `a click makes the page follow THIS window (fitted ${followed && followed.width}×${followed && followed.height} for the zh window)`, JSON.stringify(followed));
  const zGone = await until(async () => !(await chipOf(Z, 0)), 5000, 200);
  const bigChip = await until(() => chipOf(E, 0), 8000, 200);
  ok(zGone && bigChip && bigChip.text === 'Sized for your other tab · Fit here' && /shown larger/.test(bigChip.title), `the zh window's chip is gone; the big en window now says "${bigChip && bigChip.text}" (${bigChip && bigChip.title})`);
  const shotEnBig = await shootBar(E, S1.sessionId, 0, 'live-bar-en-other-tab.png');
  const recTitle = await E.q(S1.sessionId, 'const r = L.el().querySelector(".browser-live-rec"); return { text: r.textContent, title: r.title };');
  ok(recTitle && recTitle.text === 'Video off' && /Actions/.test(recTitle.title), `the recording chip in words: "${recTitle && recTitle.text}" — "${recTitle && recTitle.title}"`);
  if (SHOTS) console.log(`  (shots: ${[shotEn, shotZh, shotEnBig].filter(Boolean).join(', ')})`);
  Z.close();
}

// ═══ ⑥ THE SPLIT LAYOUT — userW inc-mum339id-1zsb (lane takeover-keyboard, 2026-09-28) ═══════════════════════
// "PC web端 takeover browser后无法在session窗口里输入": the chat and its agent's live view side by side in ONE split tab
// group, the viewer 2327×1229 at UI scale 0.9; Take over, three presses on the chat composer, typing — which landed in
// the live view's hidden keyboard sink (i.e. in the PAGE), then Hand back. Lane J r2's reclaim treated the user's OWN
// press like a script's focus. Real presses (the Take over button, the composer, the picture) and real keys throughout.
/** verify r1: WCAG contrast of an element's text against what is really behind it — every translucent background layer up
 *  the tree composited over the first opaque one (a bar with no background of its own inherits the window's) */
const CONTRAST_JS = `const parseC = (c) => { let m = /rgba?\\(([^)]+)\\)/.exec(c); if (m) { const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; } m = /color\\(srgb ([^)]+)\\)/.exec(c); if (m) { const p = m[1].split(/[ \\/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; } return [0, 0, 0, 0]; };
  const lumC = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrastOf = (el) => { const layers = []; let n = el; while (n && n.nodeType === 1) { const c = parseC(getComputedStyle(n).backgroundColor); layers.push(c); if (c[3] >= 1) break; n = n.parentElement; } if (!layers.length || layers[layers.length - 1][3] < 1) layers.push([255, 255, 255, 1]); let bg = layers.pop().slice(0, 3); while (layers.length) { const c = layers.pop(); bg = bg.map((v, i) => v * (1 - c[3]) + c[i] * c[3]); } const f = parseC(getComputedStyle(el).color); const fg = f.slice(0, 3).map((v, i) => v * f[3] + bg[i] * (1 - f[3])); const a = lumC(fg), b = lumC(bg); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100; };`;
async function splitLegs(W, { tag = 'split', upTo = null } = {}) {
  const o = {};
  const S = await W.createSession(tag + '-chat');
  const nr = await S.vb(['new', tag + 'work']); await S.vb(['use', tag + 'work']);
  const pid = (/\((bp-[0-9a-f]{8})\)/.exec(nr.stdout + nr.stderr) || [])[1] || null;
  await S.vb(['open', W.innerUrl(tag)]);
  o.pageUp = !!(await W.innerUntil(tag, () => true, 25000));
  const P = await W.page({ lang: 'en', size: [2327, 1229], uiScale: 90 });
  o.P = P; o.S = S; o.pid = pid;
  o.ready = !!P.ready;
  const sid = S.sessionId;
  const C = `const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(sid)}); const cv = cw && window.app.sessions.get(cw.id); const ta = cv && cv._chatInput && cv._chatInput._textarea;`;
  const LQ = `const w = [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})[0]; const L = w && w._browserLive;`;
  const q = (js) => P.ev(`(() => { ${C} ${LQ} ${js} })()`).catch((e) => ({ error: String(e && e.message) }));
  await P.ev(`(() => { window.app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(tag + '-chat')}, ${JSON.stringify(S.cwd)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  o.chat = !!(await until(() => q('return !!ta || null;'), 30000, 200));
  await q(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(sid)}, profileId: ${JSON.stringify(pid)}, intoChain: { hostId: cw.id, split: true, side: 'left' } }); return true;`);
  o.live = !!(await until(() => q('return L && L.state().frames >= 1 && L.img().naturalWidth > 0 ? true : null;'), 40000, 200));
  await q('const ch = w._tabChain; const host = ch && window.app.wm.windows.get(ch.tabs[0]); if (host && !host.isMaximized) window.app.wm.toggleMaximize(host.id); return true;');
  await sleep(800);
  o.layout = await q('const ch = w._tabChain; const lr = L.el().getBoundingClientRect(), cr = ta.getBoundingClientRect(); return { split: !!(ch && ch.layout === "split" && ch.split && ch.split.pair.includes(w.id) && ch.split.pair.includes(cw.id)), pane: String(w.content.className), zoom: String(getComputedStyle(document.body).zoom), vw: innerWidth, vh: innerHeight, liveLeft: Math.round(lr.left), chatLeft: Math.round(cr.left) };');
  const view = () => q('const s = L.state(); const line = cw.element.querySelector(".chat-kbd-yield"); const chip = L.el().querySelector(".browser-live-kbd-chip"); return { mode: s.mode, mine: s.mine, owns: L.ownsKeyboard(), reclaims: s.reclaims, active: document.activeElement === ta ? "composer" : document.activeElement === L.kbd() ? "sink" : String((document.activeElement && document.activeElement.className) || (document.activeElement && document.activeElement.tagName)), chip: chip && chip.style.display !== "none" ? chip.textContent : null, chipTitle: chip ? chip.title : null, line: line && !line.hidden && line.offsetParent ? line.textContent : null, composer: ta.value };');
  const settled = async (read) => { let last = null; const t0 = Date.now(); while (Date.now() - t0 < 6000) { const v = JSON.stringify(await read()); if (v === last) return JSON.parse(v); last = v; await sleep(150); } return JSON.parse(last); };
  /** verify r1 (lane takeover-keyboard): the legs its findings were reproduced with — run in the main flow and, alone, on
   *  the pre-fix control tree (`upTo: 'verify-r1'`) */
  const r1Legs = async () => {
    const K = (p) => P.call('Input.dispatchKeyEvent', p);
    const keyLog = () => { const r = W.inner(tag) || {}; return { kd: (r.kd || []).slice(), ku: (r.ku || []).slice() }; };
    const n = (arr, k) => arr.filter((x) => x === k).length;
    // K4: modifiers HELD in the page across a real press on the composer (non-printing: the page's field is not touched)
    await sleep(700); // past the multi-click window: this press is a single click (a double one would select the page's word)
    await P.click(sid, 200, 140); await sleep(250);
    const k0 = keyLog();
    await K({ type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
    await K({ type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 9 });
    await sleep(250);
    o.heldPress = await P.clickEl(`${C} return ta;`);
    await sleep(250);
    await K({ type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 8 });
    await K({ type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 0 });
    await sleep(700);
    const k1 = keyLog();
    o.held = { press: o.heldPress.ok, view: await view(), kdTail: k1.kd.slice(-4), kuTail: k1.ku.slice(-4), shiftDown: n(k1.kd, 'Shift') - n(k0.kd, 'Shift'), altDown: n(k1.kd, 'Alt') - n(k0.kd, 'Alt'), shiftUp: n(k1.ku, 'Shift') - n(k0.ku, 'Shift'), altUp: n(k1.ku, 'Alt') - n(k0.ku, 'Alt') };
    // the yielded chip's WORDS against what is really behind them (every translucent layer composited), in all six themes
    // verify r2 (H4): EVERY word the bar says about the keys — the takeover badge ("You are driving"), the chip's three states
    // (owning / failing / yielded) — against what is really behind it, in all six themes (measured on 51a2c699: the badge's
    // amber 1.93 : 1 on light and 3.46 on solarized; the owning chip's accent 2.96 on solarized, 3.89 on nord)
    o.barContrast = await q(`${CONTRAST_JS} const nt = document.createElement('style'); nt.textContent = '* { transition: none !important; }'; document.head.appendChild(nt); const chip = L.el().querySelector('.browser-live-kbd-chip'); const badge = L.el().querySelector('.browser-live-mode'); const hb = L.el().querySelector('.browser-live-handback'); const was = document.documentElement.dataset.theme; const keep = chip.className; const out = {}; for (const th of ['dark', 'light', 'dracula', 'nord', 'solarized', 'monokai']) { document.documentElement.dataset.theme = th; const r = {}; r.badge = badge.classList.contains('takeover') ? contrastOf(badge) : null; r.handback = hb && hb.offsetParent ? contrastOf(hb) : null; for (const k of ['', 'failing', 'yielded']) { chip.className = 'browser-live-kbd-chip' + (k ? ' ' + k : ''); r[k || 'own'] = contrastOf(chip); } out[th] = r; } chip.className = keep; document.documentElement.dataset.theme = was || 'dark'; nt.remove(); return out;`); // (transitions off while measuring: a button's colour transition read mid-way after the theme switch — Hand back 1.11 was the DARK theme's --text on the light background)
    o.chipContrast = await q(`const chip = L.el().querySelector('.browser-live-kbd-chip'); const was = document.documentElement.dataset.theme; ${CONTRAST_JS} const out = {}; for (const th of ['dark', 'light', 'dracula', 'nord', 'solarized', 'monokai']) { document.documentElement.dataset.theme = th; out[th] = contrastOf(chip); } document.documentElement.dataset.theme = was || 'dark'; return { yielded: chip.classList.contains('yielded'), out };`);
    // K3: still yielded (the composer holds the caret) — a real press on the live view's OWN TAB in the split strip, then
    // typing: the keys are the page's again (before: the tab kept the caret in the composer and "kk" landed there)
    await q('ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); return 1;');
    const b0 = (W.inner(tag) || {}).b || '';
    o.tabPress = await P.clickEl(`${LQ} const tab = w && document.querySelector('.tab-item[data-win-id="' + w.id + '"]'); return tab && (tab.querySelector('.tab-label') || tab);`);
    await sleep(300);
    o.afterTab = await view();
    await P.type('kk');
    o.tabPage = !!(await W.innerUntil(tag, (r) => r.b === b0 + 'kk', 5000));
    o.afterTabTyped = { view: await settled(view), page: (W.inner(tag) || {}).b, b0 };
    await P.click(sid, 200, 140); await sleep(250); // the keys back to the page for the legs that follow
  };
  // ── Take over: a real press on the bar's button ──
  o.take = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-mode-btn');`);
  o.took = !!(await until(() => q('return L.state().mode === "takeover" && L.state().mine && L.ownsKeyboard() ? true : null;'), 8000, 100));
  // the page's own field first (a real press in the picture) — it holds what the page gets; the bug typed into it
  await P.click(sid, 200, 140);
  o.pageField = !!(await W.innerUntil(tag, (r) => r.act === 'b', 5000));
  await P.type('pg');
  o.pageFirst = !!(await W.innerUntil(tag, (r) => r.b === 'pg', 6000));
  if (upTo === 'verify-r1') { // the verify r1 control: its legs alone on the pre-fix tree, then Hand back (the standalone legs take over next)
    await r1Legs();
    o.handPress = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-handback');`);
    o.handed = !!(await until(() => q('return L.state().mode !== "takeover" ? true : null;'), 8000, 100));
    await q('window.app.wm.closeWindow(w.id); window.app.wm.closeWindow(cw.id); return 1;'); await sleep(500);
    return o;
  }
  // ── userW's act: a real press on the chat composer, then typing ──
  o.pressComposer = await P.clickEl(`${C} return ta;`);
  await sleep(120);
  o.afterPress = await view();
  await P.type('hello agent');
  await sleep(400);
  o.typed = await settled(view);
  o.pageAfterTyping = await settled(() => (W.inner(tag) || {}).b);
  if (upTo === 'typed') return o; // the control: userW's two acts are the whole question
  // the takeover itself continues: the agent's page command is still refused
  const r = await S.vb(['press', 'Tab'], 30000);
  o.agentRefused = { ok: r.ok, paused: /browser_paused/.test(r.stdout + r.stderr), tail: (r.stdout + r.stderr).slice(-240) };
  // Enter SENDS the chat message (to the agent's stdin — the fake claude writes what it read)
  await P.key('Enter', { code: 'Enter', vk: 13, text: '\r' });
  o.sent = !!(await until(() => { try { return fs.readFileSync(S.stdinFile, 'utf8').includes('hello agent'); } catch { return false; } }, 15000, 150));
  o.afterSend = await settled(view);
  // ── a press on the PICTURE: the keyboard goes back to the page ──
  await P.click(sid, 200, 140);
  await sleep(150);
  o.afterPicture = await view();
  await P.type('xyz');
  o.pageAfterPicture = !!(await W.innerUntil(tag, (r) => r.b === 'pgxyz', 6000));
  o.afterPictureTyped = await settled(view);
  // ── THE PASSWORD GUARD (lane J r2's case): a SCRIPT puts the caret in the composer while you type in the page ──
  o.script = await q('cv.focus(); const a1 = document.activeElement === ta; ta.focus(); return { a1, a2: document.activeElement === ta };');
  await sleep(80);
  o.afterScript = await view();
  await P.type('tomsmith');
  o.pageGuard = !!(await W.innerUntil(tag, (r) => r.b === 'pgxyztomsmith', 8000));
  o.guard = await settled(view);
  // …and a script focus right after a press on the PICTURE (inside the window a press opens) is still the script's
  await P.click(sid, 200, 140);
  await q('ta.focus(); return true;');
  await sleep(80);
  o.afterPressThenScript = await view();
  // ── a TERMINAL (item 5): a real xterm — its own window opened while you drive (its programmatic focus stands down), then
  // a real press on its screen yields the keys to it (xterm focuses its helper textarea in its own mousedown) ──
  const TQ = 'const tw = [...window.app.wm.windows.values()].find((x) => x.type === "terminal"); const ts = tw && window.app.sessions.get(tw.id);';
  try { fs.writeFileSync(path.join(W.HOME, '.zshrc'), ''); } catch { } // the WORLD's scratch HOME: no zsh new-user menu eating the first key
  await q(`window.app.openShellTerminal(${JSON.stringify(S.cwd)}); return true;`);
  o.termUp = !!(await until(() => q(`${TQ} return ts && ts.terminal && tw.element.querySelector('.xterm-screen') ? true : null;`), 20000, 200));
  if (o.termUp) {
    await q(`${TQ} const el = tw.element; tw.gridBounds = null; el.style.left = '1300px'; el.style.top = '60px'; el.style.width = '900px'; el.style.height = '520px'; tw.onResize && tw.onResize(); return true;`);
    await sleep(900); // the shell's prompt
    o.termOpened = await view(); // its window's own focus() while you drive: stood down
    o.pressTerm = await P.clickEl(`${TQ} return tw.element.querySelector('.xterm-screen');`);
    await sleep(120);
    o.afterTermPress = await view();
    o.termActive = await q('return String(document.activeElement && document.activeElement.className);');
    await P.type('echo tkbdtyped'); // (no punctuation: P.key's keyCode for a dash would be 45 = Insert)
    o.termGot = !!(await until(() => q(`${TQ} const b = ts.terminal.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) { const l = b.getLine(i); if (l) s += l.translateToString(true) + '\\n'; } return s.includes('echo tkbdtyped') ? true : null;`), 8000, 150));
    o.termBuf = await q(`${TQ} const b = ts.terminal.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) { const l = b.getLine(i); if (l) s += l.translateToString(true) + '\\n'; } return { buf: s.replace(/\\n+$/, '').slice(-400), sid: ts.sessionId || null, title: tw.title || null };`);
    o.pageAfterTerm = await settled(() => (W.inner(tag) || {}).b);
    await P.click(sid, 200, 140); await sleep(150);
    o.afterTermPicture = await view();
    await q(`${TQ} window.app.wm.closeWindow?.(tw.id); return true;`);
  }
  await r1Legs(); // verify r1 (lane takeover-keyboard): keys held across the press, the view's own tab, …
  // ── Hand back: a real press ──
  o.handPress = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-handback');`);
  o.handed = !!(await until(() => q('return L.state().mode !== "takeover" ? true : null;'), 8000, 100));
  o.afterHandback = await settled(view);
  await q('window.app.wm.closeWindow(w.id); window.app.wm.closeWindow(cw.id); return 1;'); await sleep(500); // verify r1: the next client's standalone windows must not inherit this group through the layout sync
  return o;
}
/** verify r1 (lane takeover-keyboard): ANOTHER client with the chat and its live view as TWO standalone windows (no tab
 *  group) — the view's own title bar is its alone. Real presses and keys throughout. */
/** verify r2 (H1b') CONTROL PREDICATE, shared (verify r4, attack 6): "back on the view's desktop the yield outlives its home — the caret
 *  not in the sink, k2 nowhere, the chip still a yielded wording" — true on the patched tree, FALSE on the fixed one (asserted both ways) */
const h1bPreFix = (back, typed) => !!(back && back.yielded && !back.owns && back.active !== 'sink' && typed && typed.page === typed.b && /^Keyboard is (in the chat box|not in a text box) — /.test(String(back.chip)));
async function standaloneLegs(W, { S, pid, tag }) {
  const o = {};
  const sid = S.sessionId;
  const P = await W.page({ lang: 'en', size: [2000, 1100] });
  o.P = P; o.ready = !!P.ready;
  const C = `const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(sid)}); const cv = cw && window.app.sessions.get(cw.id); const ta = cv && cv._chatInput && cv._chatInput._textarea;`;
  const LQ = `const w = [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})[0]; const L = w && w._browserLive;`;
  const q = (js) => P.ev(`(() => { ${C} ${LQ} ${js} })()`).catch((e) => ({ error: String(e && e.message) }));
  const view = () => q('const s = L.state(); const line = cw.element.querySelector(".chat-kbd-yield"); const chip = L.el().querySelector(".browser-live-kbd-chip"); const a = document.activeElement; return { mode: s.mode, mine: s.mine, owns: L.ownsKeyboard(), yielded: s.kbdYielded, active: a === ta ? "composer" : a === L.kbd() ? "sink" : String((a && a.className) || (a && a.tagName)), line: line && !line.hidden && line.offsetParent ? line.textContent : null, chip: chip && chip.style.display !== "none" ? chip.textContent : null, caretMoves: s.caretMoves, strayKeys: s.strayKeys, composer: ta.value };');
  await P.ev(`(() => { window.app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(tag + '-chat')}, ${JSON.stringify(S.cwd)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  o.chat = !!(await until(() => q('return !!ta || null;'), 30000, 200));
  await q(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(sid)}, profileId: ${JSON.stringify(pid)} }); return true;`);
  o.live = !!(await until(() => q('return L && L.state().frames >= 1 && L.img().naturalWidth > 0 ? true : null;'), 40000, 200));
  await sleep(1200); // the layout sync settles first
  await q('const set = (x, l, t, wd, h) => { if (x.isMaximized) window.app.wm.toggleMaximize(x.id); x.gridBounds = null; x.element.style.left = l + "px"; x.element.style.top = t + "px"; x.element.style.width = wd + "px"; x.element.style.height = h + "px"; x.onResize && x.onResize(); }; set(w, 20, 20, 900, 700); set(cw, 960, 20, 900, 700); return 1;');
  await sleep(800);
  o.alone = await q('const r = (x) => x.element.querySelector(".window-title").getBoundingClientRect(); return !(w._tabChain && Array.isArray(w._tabChain.tabs) && w._tabChain.tabs.length > 1) && !(cw._tabChain && Array.isArray(cw._tabChain.tabs) && cw._tabChain.tabs.length > 1) && r(w).width > 0 && r(cw).width > 0;');
  o.take = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-mode-btn');`);
  o.took = !!(await until(() => q('return L.state().mode === "takeover" && L.state().mine && L.ownsKeyboard() ? true : null;'), 8000, 100));
  await P.click(sid, 200, 140); await sleep(300);
  // K3: yielded to the composer, then a real press on the live window's OWN TITLE BAR — the keys are the page's again
  await q('ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); return 1;'); // (the draft syncs across clients)
  o.pressComposer = await P.clickEl(`${C} return ta;`); await sleep(250);
  o.yielded = await view();
  const b0 = (W.inner(tag) || {}).b || '';
  o.titlePress = await P.clickEl(`${LQ} return w && w.element.querySelector('.window-title');`);
  await sleep(300);
  o.afterTitle = await view();
  await P.type('tt');
  o.titlePage = !!(await W.innerUntil(tag, (r) => r.b === b0 + 'tt', 5000));
  o.afterTitleTyped = { view: await view(), page: (W.inner(tag) || {}).b, b0 };
  // verify r2 (Q1): a BUTTON of the user's that focuses the composer (its expand button) — measured on cd867c05: reclaimed,
  // "qq" to the page, nothing said. Still reclaimed (binding it would let a message arriving within ANY press's window take
  // the keys), now SAID once (rate-limited) with advice that works — and following it (a press on the box itself) yields.
  await P.click(sid, 200, 140); await sleep(300);
  const cues0 = await q('return L.state().cues;');
  o.expandPress = await P.clickEl(`${C} return cw.element.querySelector('.chat-expand-btn');`); await sleep(400);
  o.q1 = { view: await view(), cues: (await q('return L.state().cues;')) - cues0, toast: await P.ev(`[...document.querySelectorAll('#global-toasts .global-toast')].map((x) => x.textContent).join(' | ')`) };
  o.q1Press = await P.clickEl(`${C} return ta;`); await sleep(250);
  await P.type('ok'); await sleep(400);
  o.q1Typed = await view();
  await P.click(sid, 200, 140); await sleep(300);
  await P.clickEl(`${C} return cw.element.querySelector('.chat-expand-btn');`); await sleep(300); // (the composer back to its size)
  // verify r2 (H1) — THE REVERSE DIRECTION: the view starts owning again while the caret sits in the composer.
  // H1a: the live window MINIMIZED, a real press on the composer, "c1" typed, the window RESTORED — measured on cd867c05:
  // the view owned again with the caret left in the composer, said nothing (no chip, no line) and "c2" went to the PAGE.
  // The press made while the takeover is his yields: back on screen the keys stay in the composer, said at once.
  await q('ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); return 1;');
  await P.click(sid, 200, 140); await sleep(300); // from the OWNER state on both trees (the pre-fix tree kept the title-bar leg's yield)
  await q('window.app.wm.minimize(w.id); return 1;'); await sleep(500);
  o.pressHidden = await P.clickEl(`${C} return ta;`); await sleep(250);
  await P.type('c1'); await sleep(300);
  o.hiddenTyped = await view();
  await q('window.app.wm.restore(w.id); return 1;'); await sleep(600);
  o.restored = await view(); // BEFORE any key
  o.b1 = (W.inner(tag) || {}).b || '';
  await P.type('c2'); await sleep(700);
  o.restoredTyped = { view: await view(), page: (W.inner(tag) || {}).b };
  // H1b: the PASSWORD GUARD across the same return — a SCRIPT puts the caret in the composer while the window is minimized
  // (no press), "d1" typed there; restored: the view takes the keys AND the caret (moved to the sink at once, before any
  // key — never only the keys routed past a caret the user still sees in the composer)
  await P.click(sid, 200, 140); await sleep(300);
  await q('ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); return 1;');
  await q('window.app.wm.minimize(w.id); return 1;'); await sleep(500);
  o.scriptFocus = await q('ta.focus(); return document.activeElement === ta;');
  await P.type('d1'); await sleep(300);
  await q('window.app.wm.restore(w.id); return 1;'); await sleep(600);
  o.restoredB = await view(); // BEFORE any key
  o.b2 = (W.inner(tag) || {}).b || '';
  await P.type('d2'); await sleep(700);
  o.restoredBTyped = { view: await view(), page: (W.inner(tag) || {}).b };
  await q('ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); return 1;');
  // verify r2 (H1b'): the chat on ANOTHER desktop — pressed there while the view is off screen (a yield), back on the view's
  // desktop the chat box is hidden: measured on 51a2c699 — the caret fell to <body>, "k2" went nowhere and the chip said
  // "Keyboard is in the chat box". A yield whose home is gone ends: the caret to the sink, the keys to the page.
  await P.click(sid, 200, 140); await sleep(300);
  await q('ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); return 1;');
  o.desks = await q(`const dm = window.app.desktopManager; const d1 = dm._activeId; const d2 = dm.createDesktop('D2 ' + ${JSON.stringify(tag)}); dm.moveWindowToDesktop(cw.id, d2); return { d1, d2 };`);
  await sleep(600);
  await q(`window.app.desktopManager.switchTo(${JSON.stringify(o.desks.d2)}); return 1;`); await sleep(900);
  o.deskPressComposer = await P.clickEl(`${C} return ta;`); await sleep(300);
  await P.type('k1'); await sleep(300);
  o.deskYielded = await view();
  await q(`window.app.desktopManager.switchTo(${JSON.stringify(o.desks.d1)}); return 1;`); await sleep(1200);
  o.deskBack = await view(); // BEFORE any key
  const bk = (W.inner(tag) || {}).b || '';
  await P.type('k2'); await sleep(700);
  o.deskBackTyped = { view: await view(), page: (W.inner(tag) || {}).b, b: bk };
  await q(`window.app.desktopManager.moveWindowToDesktop(cw.id, ${JSON.stringify(o.desks.d1)}); return 1;`); await sleep(600); // the chat back beside the view
  // verify r2 (N1): a DESKTOP APP and the DESKTOP while you drive — measured on cd867c05: a real press on the Desktop's noVNC
  // canvas (and on an xpra pane) was reclaimed and the typing went to the agent's PAGE (userW's report in another window).
  // The Desktop: a REAL noVNC over this world's own Xvnc (vncEnv — never :7/5901); the app: a REAL xterm under xpra whose
  // shell writes what it reads to a file (the witness that the keys reached the app).
  const place = (x, l, t, wd, h) => `(() => { const x = ${x}; if (x.isMaximized) window.app.wm.toggleMaximize(x.id); x.gridBounds = null; x.element.style.left = '${l}px'; x.element.style.top = '${t}px'; x.element.style.width = '${wd}px'; x.element.style.height = '${h}px'; x.onResize && x.onResize(); return 1; })()`;
  const DQ = `const dw = [...window.app.wm.windows.values()].find((x) => x.type === 'desktop'); const dcv = dw && dw.element.querySelector('.picture-shell canvas');`;
  await q('window.app.openDesktop(); return 1;');
  o.deskUp = !!(await until(() => q(`${DQ} return dcv && dcv.width > 10 ? true : null;`), 40000, 300));
  if (o.deskUp) {
    await q(`${DQ} return ${place('dw', 960, 740, 900, 340)};`); await sleep(800);
    await P.click(sid, 200, 140); await sleep(300);
    const bd = (W.inner(tag) || {}).b || '';
    o.deskPress = await P.clickEl(`${DQ} return dcv;`); await sleep(300);
    o.deskAfter = { view: await view(), active: await q(`${DQ} return document.activeElement === dcv;`) };
    await P.type('vn'); await sleep(700);
    o.deskTyped = { view: await view(), page: (W.inner(tag) || {}).b, b: bd };
  }
  await q(`${DQ} if (dw) window.app.wm.closeWindow(dw.id); return 1;`); await sleep(400); // ALWAYS: a Desktop that never came up must not stay over the picture (every later press would land on it)
  const typedFile = path.join(W.D, `xterm-${tag}.txt`);
  const launch = await P.ev(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: '/usr/bin/xterm', args: ['-T', 'vs-tkbd-' + tag, '-geometry', '80x24', '-e', 'sh', '-c', `cat > ${typedFile}`], label: 'vs-tkbd-' + tag }))} }).then((r) => r.json())`).catch(() => null);
  o.appId = launch && launch.id || null;
  const XQ = `const xw = [...window.app.wm.windows.values()].find((x) => x.type === 'desktop-app'); const xc = xw && xw.element.querySelector('.xpra-pane canvas');`;
  if (o.appId) {
    await P.ev(`app.openDesktopApp(${JSON.stringify(o.appId)}); true`);
    // x5 ONE ACTIVE VIEWER per app window: another client of this world (the ② viewer page is still loaded) may take the
    // seat first ("Active on another client — Resume here", no picture here) — the user's own act is a press on Resume
    // here (measured: 3 of 7 runs raced it and waited 40 s on a blocked pane)
    const seat = await until(() => q(`${XQ} const rb = xw && xw.element.querySelector('.desktop-app-resume'); return xc && xc.width > 10 ? 'up' : rb && rb.offsetParent ? 'blocked' : null;`), 40000, 300);
    if (seat === 'blocked') { o.appResume = await P.clickEl(`${XQ} return xw.element.querySelector('.desktop-app-resume');`); await sleep(500); }
    o.appUp = !!(await until(() => q(`${XQ} return xc && xc.width > 10 ? true : null;`), 30000, 300));
    if (o.appUp) {
      await q(`${XQ} return ${place('xw', 960, 740, 800, 340)};`); await sleep(1500);
      await P.click(sid, 200, 140); await sleep(300);
      const bx = (W.inner(tag) || {}).b || '';
      o.appPress = await P.clickEl(`${XQ} return xc;`); await sleep(300);
      o.appAfter = { view: await view(), active: await q(`${XQ} return String(document.activeElement && document.activeElement.className);`) };
      await P.type('xp'); await P.key('Enter', { code: 'Enter', vk: 13, text: '\r' }); await sleep(1500);
      let got = null; try { got = fs.readFileSync(typedFile, 'utf8'); } catch (e) { got = null; }
      o.appTyped = { view: await view(), page: (W.inner(tag) || {}).b, b: bx, app: got };
      await q(`${XQ} window.app.wm.closeWindow(xw.id); return 1;`); await sleep(400);
    } else {
      o.appDiag = { win: await q(`${XQ} return xw ? { status: (xw.element.querySelector('.desktop-status') || {}).textContent || null, text: String(xw.element.textContent || '').slice(0, 300) } : null;`), rec: await P.ev(`fetch('/api/desktop/apps').then((r) => r.json()).then((j) => JSON.stringify(j).slice(0, 1200))`).catch(() => null), journal: W.journal().split('\n').filter((l) => /desktop|xpra|da-/i.test(l)).slice(-12) };
      await q(`${XQ} if (xw) window.app.wm.closeWindow(xw.id); return 1;`); await sleep(400); // never leave it over the picture
    }
  }
  // verify r2 (H5): a FRAME — a Web view window showing a page with a field. A real press INTO that field while you drive
  // is the frame's document's press (nothing here can tell it from the frame's own script) — taken back as before, and now
  // SAID with the one way that works; the typing still reaches the agent's page (measured on cd867c05: "wv" to the page,
  // nothing said)
  await P.click(sid, 200, 140); await sleep(300);
  const WQ = `const bw = [...window.app.wm.windows.values()].find((x) => x.type === 'browser'); const bf = bw && bw.element.querySelector('iframe');`;
  // (a same-origin page — the Web view hides a cross-origin one as "blocked"; a blob: page is what an HTML code block's Preview opens)
  await q(`window.app.openBrowser(URL.createObjectURL(new Blob(['<input id=i style="width:90%;height:80px">'], { type: 'text/html' }))); return 1;`);
  o.wvUp = !!(await until(() => q(`${WQ} return bf && bf.getBoundingClientRect().width > 50 && bf.contentDocument && bf.contentDocument.getElementById('i') ? true : null;`), 15000, 200));
  if (o.wvUp) {
    await q(`${WQ} return ${place('bw', 960, 740, 700, 300)};`); await sleep(1200);
    await P.click(sid, 200, 140); await sleep(300);
    const fr0 = await q('return L.state().frameReclaims;'); const bw0 = (W.inner(tag) || {}).b || '';
    o.wvPress = await P.clickEl(`${WQ} return bf;`); await sleep(500);
    o.wv = { view: await view(), frames: (await q('return L.state().frameReclaims;')) - fr0, toast: await P.ev(`[...document.querySelectorAll('#global-toasts .global-toast')].map((x) => x.textContent).join(' | ')`) };
    await P.type('wv'); await sleep(700);
    o.wvTyped = { page: (W.inner(tag) || {}).b, b: bw0, field: await q(`${WQ} return bf.contentDocument.getElementById('i').value;`) };
    await q(`${WQ} window.app.wm.closeWindow(bw.id); return 1;`); await sleep(300);
  }
  // verify r2 (H3): a key HELD in the page when the keys leave it — measured on cd867c05: Shift held across a minimize, and
  // across a real press on Hand back, reached the page as a keydown and never as a keyup
  const K = (p) => P.call('Input.dispatchKeyEvent', p);
  // (the page logs its last 40 keys: a marker key first, then the LAST keydown / keyup say what reached it — a count over a
  // full sliding window can stay put while a key is added)
  const lastKeys = () => { const r = W.inner(tag) || {}; return { kd: (r.kd || []).at(-1) || null, ku: (r.ku || []).at(-1) || null }; };
  await P.click(sid, 200, 140); await sleep(300);
  await P.type('m'); await W.innerUntil(tag, (r) => (r.ku || []).at(-1) === 'm', 4000);
  await K({ type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
  const downA = !!(await W.innerUntil(tag, (r) => (r.kd || []).at(-1) === 'Shift', 4000));
  await q('window.app.wm.minimize(w.id); return 1;'); await sleep(400);
  await K({ type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 0 }); await sleep(700);
  o.heldHide = { down: downA, ...lastKeys(), pressed: (await q('return L.state().pressed;')) };
  await q('window.app.wm.restore(w.id); return 1;'); await sleep(600);
  await P.click(sid, 200, 140); await sleep(300);
  await P.type('n'); await W.innerUntil(tag, (r) => (r.ku || []).at(-1) === 'n', 4000);
  await K({ type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
  const downB = !!(await W.innerUntil(tag, (r) => (r.kd || []).at(-1) === 'Shift', 4000));
  o.hand = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-handback');`);
  o.handed = !!(await until(() => q('return L.state().mode !== "takeover" ? true : null;'), 8000, 100));
  await K({ type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 0 }); await sleep(700);
  o.heldHandback = { down: downB, ...lastKeys() };
  return o;
}
/** verify r3 (lane takeover-keyboard): THE INPUT-SURFACE CENSUS's chrome asserts — a real press on the CODE EDITOR and on the
 *  CHANNEL COMPOSER yields to it — and the round's findings, each by the user's own real presses and keys: F1 a <select>
 *  stays open, F2 "Copy Path" says nothing about a box, F4 a dialog the user opened says its Enter is the page's, r2's held
 *  (a press on the message list while yielded) says the keys are in no text box. Its own client, standalone windows. Run in
 *  the main flow and, alone, on the r3 pre-fix control tree. */
async function newBrowserSession(W, tag) {
  const S = await W.createSession(tag + '-chat');
  const nr = await S.vb(['new', tag + 'work']); await S.vb(['use', tag + 'work']);
  const pid = (/\((bp-[0-9a-f]{8})\)/.exec(nr.stdout + nr.stderr) || [])[1] || null;
  await S.vb(['open', W.innerUrl(tag)]);
  return { S, pid, pageUp: !!(await W.innerUntil(tag, () => true, 25000)) };
}
async function r3Legs(W, { S, pid, tag }) {
  const o = {};
  const sid = S.sessionId;
  const P = await W.page({ lang: 'en', size: [2000, 1100] });
  o.P = P; o.ready = !!P.ready;
  await P.ev('(() => { for (const w of [...window.app.wm.windows.values()]) window.app.wm.closeWindow(w.id); return 1; })()'); await sleep(600); // (a layout another client left: this client places its own)
  const C = `const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(sid)}); const cv = cw && window.app.sessions.get(cw.id); const ta = cv && cv._chatInput && cv._chatInput._textarea;`;
  const LQ = `const w = [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})[0]; const L = w && w._browserLive;`;
  const q = (js) => P.ev(`(() => { ${C} ${LQ} ${js} })()`).catch((e) => ({ error: String(e && e.message) }));
  const view = () => q('const s = L.state(); const chip = L.el().querySelector(".browser-live-kbd-chip"); const a = document.activeElement; return { mode: s.mode, mine: s.mine, owns: L.ownsKeyboard(), yielded: s.kbdYielded, where: s.yieldWhere, cues: s.cues, dialogCues: s.dialogCues, reclaims: s.reclaims, active: a === (cv && cv._chatInput && cv._chatInput._textarea) ? "composer" : a === L.kbd() ? "sink" : String((a && a.className) || (a && a.tagName)), chip: chip && chip.style.display !== "none" ? chip.textContent : null, composer: ta ? ta.value : null, toasts: [...document.querySelectorAll("#global-toasts .global-toast")].map((x) => x.textContent).join(" | ") };');
  const page = () => (W.inner(tag) || {}).b || '';
  const place = (x, l, t, wd, h) => `(() => { const x = ${x}; if (x.isMaximized) window.app.wm.toggleMaximize(x.id); x.gridBounds = null; x.element.style.left = '${l}px'; x.element.style.top = '${t}px'; x.element.style.width = '${wd}px'; x.element.style.height = '${h}px'; x.onResize && x.onResize(); return 1; })()`;
  const I = (p) => P.call('Input.dispatchMouseEvent', p);
  await P.ev(`(() => { window.app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(tag + '-chat')}, ${JSON.stringify(S.cwd)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  o.chat = !!(await until(() => q('return !!ta || null;'), 30000, 200));
  await q(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(sid)}, profileId: ${JSON.stringify(pid)} }); return true;`);
  o.live = !!(await until(() => q('return L && L.state().frames >= 1 && L.img().naturalWidth > 0 ? true : null;'), 40000, 200));
  await sleep(1000);
  await q(`${place('w', 20, 20, 900, 700)}; ${place('cw', 960, 20, 900, 700)}; return 1;`); await sleep(800);
  o.take = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-mode-btn');`);
  o.took = !!(await until(() => q('return L.state().mode === "takeover" && L.state().mine && L.ownsKeyboard() ? true : null;'), 8000, 100));
  await P.click(sid, 200, 140); await sleep(300);
  // ── the census: THE CODE EDITOR (CodeMirror) — a real press on a line yields to .cm-content, the typing lands in the doc ──
  const fp = path.join(S.cwd, `r3-${tag}.js`); fs.writeFileSync(fp, 'line one\nline two\nline three\n');
  const EQ = `const ew = [...window.app.wm.windows.values()].find((x) => x.type === 'editor'); const doc = () => [...ew.element.querySelectorAll('.cm-line')].map((l) => l.textContent).join('/');`;
  await q(`window.app.openEditor(${JSON.stringify(fp)}, 'r3-${tag}.js'); return 1;`);
  o.cmUp = !!(await until(() => q(`${EQ} return ew && ew.element.querySelector('.cm-content') ? true : null;`), 20000, 200));
  if (o.cmUp) {
    await q(`${EQ} return ${place('ew', 960, 740, 900, 330)};`); await sleep(800);
    o.cmOpened = await view(); // its own focus() while you drive: stood down / taken back
    await P.click(sid, 200, 140); await sleep(300);
    const b0 = page();
    o.cmPress = await P.clickEl(`${EQ} return ew.element.querySelectorAll('.cm-line')[1];`); await sleep(300);
    o.cm = await view();
    await P.type('zz'); await sleep(600);
    o.cmTyped = { doc: await q(`${EQ} return doc();`), page: page(), b0 };
    // F1: the language <select> — a real press opens its list; while you drive the list stays open (before: closed at once)
    await P.click(sid, 200, 140); await sleep(300);
    o.selPress = await P.clickEl(`${EQ} return ew.element.querySelector('select');`); await sleep(150);
    o.sel = await q(`${EQ} const s = ew.element.querySelector('select'); let open = null; try { open = s.matches(':open'); } catch (e) { open = 'n/a'; } return { focused: document.activeElement === s, open, owns: L.ownsKeyboard() };`);
    await q(`${EQ} window.app.wm.closeWindow(ew.id); return 1;`); await sleep(400); // (its list goes with it)
  }
  // ── F2: "Copy Path" (the explorer's context menu) on the plain-http viewer — copyText's scratch box, taken back, never said ──
  fs.writeFileSync(path.join(S.cwd, `copyme-${tag}.txt`), 'x'); fs.writeFileSync(path.join(S.cwd, `keepme-${tag}.txt`), 'x');
  const XQ = `const fw = [...window.app.wm.windows.values()].find((x) => x.type === 'files');`;
  await q(`window.app.openFileExplorer(${JSON.stringify(S.cwd)}); return 1;`);
  o.exUp = !!(await until(() => q(`${XQ} return fw && fw.element.querySelectorAll('.file-item').length >= 2 ? true : null;`), 15000, 200));
  const menuOn = async (name) => { const rp = await q(`${XQ} const it = [...fw.element.querySelectorAll('.file-item')].find((x) => x.textContent.includes(${JSON.stringify(name)})); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 };`); if (!rp || rp.error) return false; await I({ type: 'mouseMoved', x: rp.x, y: rp.y }); await I({ type: 'mousePressed', x: rp.x, y: rp.y, button: 'right', clickCount: 1 }); await I({ type: 'mouseReleased', x: rp.x, y: rp.y, button: 'right', clickCount: 1 }); await sleep(400); return true; };
  if (o.exUp) {
    await q(`${XQ} return ${place('fw', 960, 740, 800, 330)};`); await sleep(800);
    await P.click(sid, 200, 140); await sleep(300);
    const v0 = await view();
    await menuOn(`copyme-${tag}`);
    o.copyPress = await P.clickEl(`return [...document.querySelectorAll('.context-menu-item')].find((x) => x.textContent.trim() === 'Copy Path');`); await sleep(600);
    const v1 = await view();
    o.copy = { reclaims: v1.reclaims - v0.reclaims, cues: v1.cues - v0.cues, toasts: v1.toasts, active: v1.active, owns: v1.owns };
    // ── F4: Delete → the confirm dialog (it focuses its default button a tick later): taken back — SAID once; its Enter is the page's ──
    await P.click(sid, 200, 140); await sleep(300);
    const d0 = await view(); const bd = page();
    await menuOn(`keepme-${tag}`);
    o.delPress = await P.clickEl(`return [...document.querySelectorAll('.context-menu-item')].find((x) => x.textContent.trim() === 'Delete');`); await sleep(600);
    const d1 = await view();
    o.dialog = { open: await q(`return !!document.querySelector('.dialog-overlay:not(.hidden) .btn-cancel');`), cues: d1.dialogCues - d0.dialogCues, toasts: d1.toasts, active: d1.active, owns: d1.owns };
    await P.key('Enter', { code: 'Enter', vk: 13, text: '\r' }); await sleep(700);
    o.dialogEnter = { page: page(), b: bd, stillOpen: await q(`return !!document.querySelector('.dialog-overlay:not(.hidden) .btn-cancel');`), kept: fs.existsSync(path.join(S.cwd, `keepme-${tag}.txt`)) };
    o.cancelPress = await P.clickEl(`return [...document.querySelectorAll('.dialog-overlay:not(.hidden) .btn-cancel')].pop();`); await sleep(500);
    o.dialogClosed = { open: await q(`return !!document.querySelector('.dialog-overlay:not(.hidden) .btn-cancel');`), cues: (await view()).dialogCues - d0.dialogCues, kept: fs.existsSync(path.join(S.cwd, `keepme-${tag}.txt`)) };
    await q(`${XQ} window.app.wm.closeWindow(fw.id); return 1;`); await sleep(300);
  }
  // ── the census: THE CHANNEL COMPOSER (the fake adapters' named seam: fake-poll · Ops) — a real press yields, "ch" lands ──
  const HQ = `const hw = [...window.app.wm.windows.values()].find((x) => x && x._openSpec && x._openSpec.action === 'openChannel'); const cta = hw && hw.element.querySelector('.chanwin-composer textarea');`;
  for (let i = 0; i < 60; i++) { const r = await W.api('GET', '/api/channels'); if (((r.json && r.json.conversations) || []).some((c) => c.adapterId === 'fake-poll' && c.id === 'fake-poll-ops')) break; await sleep(250); }
  await q(`window.app.openChannel('fake-poll', 'fake-poll-ops'); return 1;`);
  o.chanUp = !!(await until(() => q(`${HQ} return cta ? true : null;`), 20000, 200));
  if (o.chanUp) {
    await q(`${HQ} return ${place('hw', 960, 740, 900, 330)};`); await sleep(800);
    await P.click(sid, 200, 140); await sleep(300);
    const b0 = page();
    o.chanPress = await P.clickEl(`${HQ} return cta;`); await sleep(300);
    o.chan = { view: await view(), active: await q(`${HQ} return document.activeElement === cta;`) };
    await P.type('ch'); await sleep(600);
    o.chanTyped = { value: await q(`${HQ} return cta.value;`), page: page(), b0 };
    await q(`${HQ} cta.value = ''; window.app.wm.closeWindow(hw.id); return 1;`); await sleep(300);
  }
  // ── r2's held: yielded to the chat composer, a real press on its MESSAGE LIST — the chip says where the keys are now ──
  await P.click(sid, 200, 140); await sleep(300);
  await q('ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); return 1;');
  o.listComposer = await P.clickEl(`${C} return ta;`); await sleep(250);
  await P.type('l1'); await sleep(300);
  o.listYielded = await view();
  o.listPress = await P.clickEl(`${C} return cw.element.querySelector('.chat-message-list');`); await sleep(400);
  o.list = await view();
  const bl = page(); await P.type('nn'); await sleep(600);
  o.listTyped = { view: await view(), page: page(), b: bl };
  await P.click(sid, 200, 140); await sleep(300);
  o.handPress = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-handback');`);
  o.handed = !!(await until(() => q('return L.state().mode !== "takeover" ? true : null;'), 8000, 100));
  await q('window.app.wm.closeWindow(w.id); window.app.wm.closeWindow(cw.id); return 1;'); await sleep(400);
  return o;
}
/** verify r4 (lane takeover-keyboard): the round's chrome legs on the same session — (a) a `<select>` while you drive: its OPEN list
 *  takes the arrows / Enter / Escape / type-ahead itself (none reaches the agent's page), Enter commits, and the closing key's
 *  keyup hands the caret to the sink (onDocKey's trailing focusSink) so the next keys are the page's; (b) an `<input type=color>`
 *  keeps its picker OPEN across the sink's take-back; (c) THE FOCUS STORM while yielded — 300 focus moves over a list: the chip
 *  is written 0 times (its words never change; before r4: 4 records per move), the focus stays where the script put it;
 *  (d) the socket closes while yielded — the takeover ends as the server ends it, the caret stays in the composer, nothing is
 *  left claimed, a new takeover works; (e) two views driving, one press yields both, a handback on one leaves the other's
 *  yield. `only: 'storm'` runs (c) alone (the control tree). */
async function r4Legs(W, { S, pid, tag, only = null } = {}) {
  const o = {};
  const sid = S.sessionId;
  const P = await W.page({ lang: 'en', size: [2000, 1100] });
  o.P = P; o.ready = !!P.ready;
  await P.ev('(() => { for (const w of [...window.app.wm.windows.values()]) window.app.wm.closeWindow(w.id); return 1; })()'); await sleep(600);
  const C = `const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(sid)}); const cv = cw && window.app.sessions.get(cw.id); const ta = cv && cv._chatInput && cv._chatInput._textarea;`;
  const LQ = `const w = [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})[0]; const L = w && w._browserLive;`;
  const q = (js) => P.ev(`(() => { ${C} ${LQ} ${js} })()`).catch((e) => ({ error: String(e && e.message) }));
  const view = () => q('const s = L.state(); const chip = L.el().querySelector(".browser-live-kbd-chip"); const a = document.activeElement; return { mode: s.mode, mine: s.mine, owns: L.ownsKeyboard(), yielded: s.kbdYielded, where: s.yieldWhere, connected: s.connected, active: a === (cv && cv._chatInput && cv._chatInput._textarea) ? "composer" : a === L.kbd() ? "sink" : String((a && (a.id || a.className)) || (a && a.tagName)), chip: chip && chip.style.display !== "none" ? chip.textContent : null, line: cv && cv._chatInput && cv._chatInput._kbdLine && !cv._chatInput._kbdLine.hidden ? cv._chatInput._kbdLine.textContent : null, composer: ta ? ta.value : null, owned: window.app.takeoverOwnsKeyboard() };');
  const page = () => (W.inner(tag) || {}).b || '';
  const kd = () => ((W.inner(tag) || {}).kd || []).slice();
  const place = (x, l, t, wdt, h) => `(() => { const x = ${x}; if (x.isMaximized) window.app.wm.toggleMaximize(x.id); x.gridBounds = null; x.element.style.left = '${l}px'; x.element.style.top = '${t}px'; x.element.style.width = '${wdt}px'; x.element.style.height = '${h}px'; x.onResize && x.onResize(); return 1; })()`;
  await P.ev(`(() => { window.app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(tag + '-chat')}, ${JSON.stringify(S.cwd)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  o.chat = !!(await until(() => q('return !!ta || null;'), 30000, 200));
  await q(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(sid)}, profileId: ${JSON.stringify(pid)} }); return true;`);
  o.live = !!(await until(() => q('return L && L.state().frames >= 1 && L.img().naturalWidth > 0 ? true : null;'), 40000, 200));
  await sleep(1000);
  await q(`${place('w', 20, 20, 900, 700)}; ${place('cw', 960, 20, 900, 700)}; return 1;`); await sleep(800);
  o.take = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-mode-btn');`);
  o.took = !!(await until(() => q('return L.state().mode === "takeover" && L.state().mine && L.ownsKeyboard() ? true : null;'), 8000, 100));
  await P.click(sid, 200, 140); await sleep(300);
  // (e)'s second browser is started NOW so it is up by the time (a)–(d) are done: under the full run five chromiums already run and a
  // fresh profile's launch took over 40 s (measured: `two: null` in the full run, up at once alone)
  // …and the machine-wide ceiling (keeper-limits CONCURRENT_CAP 6) is freed first: under the full run the ② kinds' and ⑥'s browsers are
  // still up and the 7th start is refused — every OTHER profile's browser is stopped the way the panel's Stop does it (an owner act)
  let pid2 = null; if (!only) { const lst = (await W.api('GET', '/api/browser/profiles')).json || {}; o.capBefore = lst.cap || null; for (const id of Object.keys(lst.browsers || {})) if (id !== pid) await W.api('POST', `/api/browser/profiles/${id}/stop`); o.capAfter = ((await W.api('GET', '/api/browser/profiles')).json || {}).cap || null; const nr = await S.vb(['new', tag + 'bwork']); o.secondNew = (nr.stdout + nr.stderr).slice(-200); pid2 = (/\((bp-[0-9a-f]{8})\)/.exec(nr.stdout + nr.stderr) || [])[1] || null; await S.vb(['use', tag + 'bwork']); await S.vb(['open', W.innerUrl(tag + 'b')]); }
  // the probes: a select, a colour input, 300 focusable rows — below both windows (the rule is by element kind)
  await q(`const box = document.createElement('div'); box.id = 'r4box'; box.style.cssText = 'position:fixed;left:20px;top:760px;z-index:5;background:#fff;color:#000;padding:8px;display:flex;gap:10px;flex-wrap:wrap;width:1800px';
    box.innerHTML = '<select id=r4sel><option>alpha<option>beta<option>gamma<option>delta</select><input id=r4color type=color value="#ff0000"><div id=r4rows style="display:flex;flex-wrap:wrap;gap:2px;width:1700px"></div>';
    document.body.appendChild(box); const rows = box.querySelector('#r4rows'); for (let i = 0; i < 300; i++) { const d = document.createElement('div'); d.tabIndex = -1; d.className = 'r4row'; d.textContent = String(i); d.style.cssText = 'width:16px;height:14px;font:10px monospace'; rows.appendChild(d); } return 1;`);
  const el = (id) => `return document.getElementById(${JSON.stringify(id)});`;
  const st = (id) => q(`const e = document.getElementById(${JSON.stringify(id)}); let open = null; try { open = e.matches(':open'); } catch (x) { open = 'n/a'; } return { focused: document.activeElement === e, open, value: e.value, owns: L.ownsKeyboard(), active: String(document.activeElement.id || document.activeElement.className) };`);
  const K = (key, code, vk) => P.key(key, { code, vk });
  if (!only) {
    // (a) the select
    const kd0 = kd().length;
    o.selPress = await P.clickEl(el('r4sel')); await sleep(200); o.selOpen = await st('r4sel');
    await K('ArrowDown', 'ArrowDown', 40); await sleep(150); o.selArrow = await st('r4sel');
    await K('Enter', 'Enter', 13); await sleep(400); o.selEnter = await st('r4sel');
    o.selKeysToPage = kd().length - kd0; o.selPageB = page();
    o.selPress2 = await P.clickEl(el('r4sel')); await sleep(200); o.selOpen2 = await st('r4sel'); await P.type('d'); await sleep(300); o.selType = await st('r4sel'); await K('Escape', 'Escape', 27); await sleep(300); o.selEsc = await st('r4sel');
    o.selKeysToPage2 = kd().length - kd0 - o.selKeysToPage;
    await P.click(sid, 200, 140); await sleep(300);
    // (b) the colour input
    o.colorPress = await P.clickEl(el('r4color')); await sleep(80); o.color80 = await st('r4color'); await sleep(250); o.color330 = await st('r4color'); await K('Escape', 'Escape', 27); await sleep(200);
    await P.click(sid, 200, 140); await sleep(300);
  }
  // (c) the storm
  o.composerPress = await P.clickEl(`${C} return ta;`); await sleep(250); o.yielded = await view();
  o.storm = await q(`const chip = L.el().querySelector('.browser-live-kbd-chip'); let writes = 0; const mo = new MutationObserver((rs) => { writes += rs.length; }); mo.observe(chip, { childList: true, characterData: true, subtree: true, attributes: true }); const rows = [...document.querySelectorAll('.r4row')]; const t0 = performance.now(); return new Promise((res) => { let i = 0; const step = () => { if (i >= rows.length) { setTimeout(() => { mo.disconnect(); res({ n: rows.length, ms: Math.round(performance.now() - t0), writes, active: String(document.activeElement.className), where: L.state().yieldWhere, chip: chip.textContent, yielded: L.state().kbdYielded, owns: L.ownsKeyboard() }); }, 50); return; } rows[i++].focus(); setTimeout(step, 0); }; step(); });`);
  if (only === 'storm') { await q(`${LQ} L.send({ type: 'handback' }); return 1;`); await sleep(500); return o; }
  o.composerPress2 = await P.clickEl(`${C} return ta;`); await sleep(250); o.afterStorm = await view();
  // (d) the socket closes while yielded
  await q('ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); return 1;'); // (the composer keeps a draft from the r3 legs)
  await P.type('y1'); await sleep(200);
  await q('L.ws().close(); return 1;'); await sleep(400); o.afterClose = await view();
  await P.type('y2'); await sleep(200); o.closeTyped = await view();
  o.reconnected = !!(await until(() => q('return L.state().connected ? true : null;'), 20000, 200)); await sleep(800); o.afterReconnect = await view();
  o.take2 = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-mode-btn');`); o.took2 = !!(await until(() => q('return L.state().mode === "takeover" && L.state().mine && L.ownsKeyboard() ? true : null;'), 8000, 100));
  await P.click(sid, 200, 140); await sleep(300); const b0 = page(); await P.type('zz'); await sleep(500); o.retake = { b0, b: page() };
  // (e) two views driving: the second profile (started above), popped out
  o.secondUp = !!(await W.innerUntil(tag + 'b', () => true, 60000));
  await q(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(sid)}, profileId: ${JSON.stringify(pid2)}, popOut: true }); return true;`);
  const L2Q = `const ws2 = [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)}); const w2 = ws2.find((x) => x !== w); const L2 = w2 && w2._browserLive;`;
  const q2 = (js) => P.ev(`(() => { ${C} ${LQ} ${L2Q} ${js} })()`).catch((e) => ({ error: String(e && e.message) }));
  o.two = await until(() => q2('return ws2.length === 2 && L2 && L2.state().frames >= 1 ? { n: ws2.length, p1: L.state().profileRef, p2: L2.state().profileRef } : null;'), 60000, 300);
  await q2(`${place('w2', 20, 20, 440, 700)}; ${place('w', 470, 20, 440, 700)}; return 1;`); await sleep(800);
  const v2 = () => q2('const chipOf = (X) => { const c = X.el().querySelector(".browser-live-kbd-chip"); return c.style.display !== "none" ? c.textContent : null; }; return { L1: { mode: L.state().mode, owns: L.ownsKeyboard(), yielded: L.state().kbdYielded, chip: chipOf(L) }, L2: { mode: L2.state().mode, owns: L2.ownsKeyboard(), yielded: L2.state().kbdYielded, chip: chipOf(L2) }, owned: window.app.takeoverOwnsKeyboard(), line: cv._chatInput._kbdLine.hidden ? null : cv._chatInput._kbdLine.textContent, active: document.activeElement === ta ? "composer" : document.activeElement === L.kbd() ? "sink1" : document.activeElement === L2.kbd() ? "sink2" : String(document.activeElement.className) };');
  o.take3 = await P.clickEl(`${LQ} ${L2Q} return L2 && L2.el().querySelector('.browser-live-mode-btn');`); await until(() => q2('return L2.state().mode === "takeover" && L2.state().mine ? true : null;'), 8000, 100);
  o.bothDriving = await v2();
  o.composerPress3 = await P.clickEl(`${C} return ta;`); await sleep(300); o.bothYielded = await v2();
  o.hand2 = await P.clickEl(`${LQ} ${L2Q} return L2 && L2.el().querySelector('.browser-live-handback');`); await until(() => q2('return L2.state().mode !== "takeover" ? true : null;'), 8000, 100); await sleep(300); o.afterHand2 = await v2();
  o.hand1 = await P.clickEl(`${LQ} return L && L.el().querySelector('.browser-live-handback');`); await until(() => q('return L.state().mode !== "takeover" ? true : null;'), 8000, 100); await sleep(300); o.afterBoth = await v2();
  o.chatFocus = await q('cv.focus(); return document.activeElement === ta;');
  await q2('window.app.wm.closeWindow(w2.id); window.app.wm.closeWindow(w.id); window.app.wm.closeWindow(cw.id); return 1;'); await sleep(400);
  return o;
}
if (want('split')) {
  console.log('— ⑥ the split layout (userW inc-mum339id-1zsb): your OWN press on the chat composer gets the keyboard while you drive; a script\'s focus never does');
  const s = await splitLegs(wd);
  ok(s.pageUp && s.ready && s.chat && s.live, `userW's world: the agent's page is up, the viewer page is ready, the chat window is attached and its live view shows the page (${JSON.stringify({ pageUp: s.pageUp, ready: s.ready, chat: s.chat, live: s.live })})`);
  ok(s.layout && s.layout.split && /tab-split-pane/.test(s.layout.pane) && s.layout.vw === 2327 && s.layout.vh === 1229 && Math.abs(parseFloat(s.layout.zoom) - 0.9) < 0.001 && s.layout.liveLeft < s.layout.chatLeft, `userW's layout: the live view LEFT of the chat in ONE split group, a 2327×1229 viewer at UI scale 0.9 (${JSON.stringify(s.layout)})`);
  ok(s.take.ok && s.took, `a real press on Take over — this view drives and owns the keyboard (${JSON.stringify(s.take.at)})`);
  ok(s.pageField && s.pageFirst, 'a real press in the picture focuses the page\'s field and "pg" typed there lands in the page');
  ok(s.pressComposer.ok && s.afterPress.active === 'composer', `a real press on the chat composer KEEPS the caret there (focus: ${s.afterPress.active}) — before the fix it was pulled back into the view's hidden sink`, JSON.stringify({ press: s.pressComposer, after: s.afterPress }));
  ok(s.typed.composer === 'hello agent' && s.pageAfterTyping === 'pg', `"hello agent" typed after that press lands in the COMPOSER (${JSON.stringify(s.typed.composer)}) and nothing reaches the page (its field still ${JSON.stringify(s.pageAfterTyping)}) — userW's report`, JSON.stringify(s.typed));
  ok(s.typed.mode === 'takeover' && s.typed.mine && !s.typed.owns, `…the takeover itself continues (mode ${s.typed.mode}, mine ${s.typed.mine}) while the view does not own the keys (owns ${s.typed.owns})`);
  ok(!s.agentRefused.ok && s.agentRefused.paused, `…and the agent is still refused: its \`press Tab\` answers browser_paused (${JSON.stringify(s.agentRefused.tail)})`);
  ok(s.typed.chip === 'Keyboard is in the chat box — click the picture to keep using the page' && s.typed.line === 'You are typing to the agent (you still drive the browser)', `both sides SAY where the keyboard is: the bar "${s.typed.chip}", above the composer "${s.typed.line}"`, JSON.stringify(s.typed));
  ok(s.sent && s.afterSend.composer === '', `Enter sends the chat message: the agent's stdin received "hello agent", the composer is empty again (${JSON.stringify(s.afterSend.composer)})`);
  ok(s.afterPicture.owns && s.afterPicture.active === 'sink' && s.afterPicture.line === null && /^Typing (goes|is sent) to the browser$/.test(String(s.afterPicture.chip)), `a real press on the picture gives the keyboard back to the page (owns ${s.afterPicture.owns}, focus ${s.afterPicture.active}, the bar "${s.afterPicture.chip}", no line above the composer)`, JSON.stringify(s.afterPicture));
  ok(s.pageAfterPicture && s.afterPictureTyped.composer === '', `"xyz" typed then lands in the PAGE (its field "pgxyz"), the composer stays ${JSON.stringify(s.afterPictureTyped.composer)}`, JSON.stringify(s.afterPictureTyped));
  ok(s.afterScript.active === 'sink' && s.afterScript.owns && s.afterScript.reclaims >= 1, `THE PASSWORD GUARD: the attach's chatView.focus() and a raw composer.focus() — no press — are reclaimed at once (focus ${s.afterScript.active}, ${s.afterScript.reclaims} reclaim(s))`, JSON.stringify({ script: s.script, after: s.afterScript }));
  ok(s.pageGuard && s.guard.composer === '', `…"tomsmith" typed after the script's focus reaches the PAGE ("pgxyztomsmith"), the composer holds ${JSON.stringify(s.guard.composer)} — nothing typed while you drive reaches a chat box by a focus you did not make`, JSON.stringify(s.guard));
  ok(s.afterPressThenScript.active === 'sink' && s.afterPressThenScript.owns, `a script's composer focus right after a press on the PICTURE is still reclaimed (focus ${s.afterPressThenScript.active}) — only a press ON the composer yields`, JSON.stringify(s.afterPressThenScript));
  ok(s.held && s.held.press && s.held.view.active === 'composer' && s.held.shiftDown === 1 && s.held.altDown === 1 && s.held.shiftUp === 1 && s.held.altUp === 1 && JSON.stringify(s.held.kuTail.slice(-2)) === '["Alt","Shift"]',
    `verify r1 (K4): Shift + Alt HELD in the page across a real press on the composer are RELEASED in the page (keyups ${JSON.stringify(s.held && s.held.kuTail)}) — before, their keyups went to the composer and the page kept them down`, JSON.stringify(s.held));
  { const all = s.barContrast ? Object.values(s.barContrast).flatMap((r) => Object.values(r)) : [];
    ok(all.length === 30 && all.every((c) => typeof c === 'number' && c >= 4.5),
      `verify r2 (H4): every word the bar says about the keys reads at ≥ 4.5 : 1 in all six themes — the takeover badge, Hand back, the owning / failing / yielded chip (${JSON.stringify(s.barContrast)})`, JSON.stringify(s.barContrast)); }
  ok(s.chipContrast && s.chipContrast.yielded && Object.keys(s.chipContrast.out).length === 6 && Object.values(s.chipContrast.out).every((r) => r >= 4.5),
    `verify r1: the yielded chip's words read at ≥ 4.5 : 1 in all six themes (${JSON.stringify(s.chipContrast && s.chipContrast.out)}) — the amber text was 1.93 : 1 on the light theme`, JSON.stringify(s.chipContrast));
  ok(s.tabPress && s.tabPress.ok && s.afterTab.owns && s.afterTab.active === 'sink' && s.afterTab.line === null && s.tabPage && s.afterTabTyped.view.composer === '',
    `verify r1 (K3): yielded, a real press on the live view's OWN TAB in the split strip takes the keys back — the sink holds the caret (${s.afterTab && s.afterTab.active}), "kk" reaches the PAGE, the composer stays empty`, JSON.stringify({ press: s.tabPress, after: s.afterTab, typed: s.afterTabTyped }));
  ok(s.termUp && s.termOpened.active !== 'xterm-helper-textarea' && s.termOpened.owns, `a TERMINAL window opened while you drive: its own focus() stands down — the view still owns the keys (focus ${s.termOpened && s.termOpened.active})`, JSON.stringify({ termUp: s.termUp, opened: s.termOpened }));
  ok(s.pressTerm && s.pressTerm.ok && /xterm-helper-textarea/.test(String(s.termActive)) && !s.afterTermPress.owns && s.afterTermPress.mode === 'takeover' && s.afterTermPress.chip === 'Keyboard is in the terminal — click the picture to keep using the page', `a real press on the terminal's screen YIELDS to it (xterm's helper textarea holds the focus; the bar: "${s.afterTermPress && s.afterTermPress.chip}"; the takeover continues)`, JSON.stringify({ press: s.pressTerm, active: s.termActive, after: s.afterTermPress }));
  ok(s.termGot && s.pageAfterTerm === 'pgxyztomsmith' && s.afterTermPicture.owns && s.afterTermPicture.active === 'sink', `"echo tkbdtyped" reaches the SHELL (its buffer shows it), the page keeps ${JSON.stringify(s.pageAfterTerm)}; a press on the picture takes the keys back`, JSON.stringify({ got: s.termGot, buf: s.termBuf, page: s.pageAfterTerm, after: s.afterTermPicture }) + ' · journal: ' + wd.journal().split('\n').filter((l) => /shell|terminal|dtach|create/i.test(l)).slice(-6).join(' | '));
  ok(s.handPress.ok && s.handed && s.afterHandback.chip === null && s.afterHandback.line === null && !s.afterHandback.owns, `a real press on Hand back ends the takeover; the bar and the composer say nothing any more (${JSON.stringify(s.afterHandback)})`);
  await wd.closePage(s.P); // verify r2: END the page — a loaded one stays a live client (it took the desktop app's one active seat)
  // verify r1: the standalone windows on another client
  const t = await standaloneLegs(wd, { S: s.S, pid: s.pid, tag: 'split' });
  ok(t.ready && t.chat && t.live && t.alone === true && t.took && t.pressComposer.ok && t.yielded.active === 'composer' && !t.yielded.owns, `verify r1 standalone world: another client, the chat and the live view as two windows (no group), a real Take over, a real press on the composer yields (${JSON.stringify({ ready: t.ready, chat: t.chat, live: t.live, alone: t.alone, took: t.took, press: t.pressComposer, yielded: t.yielded })})`);
  ok(t.titlePress.ok && t.afterTitle.owns && t.afterTitle.active === 'sink' && t.titlePage && t.afterTitleTyped.view.composer === '' && t.handed,
    `verify r1 (K3): yielded, a real press on the live window's OWN TITLE BAR takes the keys back — the sink holds the caret (${t.afterTitle && t.afterTitle.active}), "tt" reaches the PAGE, the composer stays empty`, JSON.stringify({ press: t.titlePress, after: t.afterTitle, typed: t.afterTitleTyped }));
  ok(t.pressHidden.ok && t.hiddenTyped.composer === 'c1' && !t.restored.owns && t.restored.yielded && t.restored.active === 'composer' && t.restored.chip === 'Keyboard is in the chat box — click the picture to keep using the page' && t.restored.line === 'You are typing to the agent (you still drive the browser)'
    && t.restoredTyped.view.composer === 'c1c2' && t.restoredTyped.page === t.b1 && t.restoredTyped.view.strayKeys === 0,
    `verify r2 (H1): minimized → a real press on the composer → restored: the view does NOT take the keys back — at the restore, before any key, the caret is the composer's and both sides say so ("${t.restored && t.restored.chip}" / "${t.restored && t.restored.line}"); "c2" lands in the composer, the page keeps ${JSON.stringify(t.b1)}`, JSON.stringify({ hidden: t.pressHidden, hiddenTyped: t.hiddenTyped, restored: t.restored, typed: t.restoredTyped, b1: t.b1 }));
  ok(!h1bPreFix(t.deskBack, t.deskBackTyped), `verify r4 (attack 6): the H1b' control's predicate ("the yield outlives its home") REJECTS the fixed tree's own reading — it is still a control, whichever chip wording it accepts (${JSON.stringify({ yielded: t.deskBack && t.deskBack.yielded, owns: t.deskBack && t.deskBack.owns, active: t.deskBack && t.deskBack.active })})`);
  ok(t.deskPressComposer && t.deskPressComposer.ok && t.deskYielded.yielded && t.deskYielded.composer === 'k1' && t.deskBack.owns && !t.deskBack.yielded && t.deskBack.active === 'sink' && /^Typing (goes|is sent) to the browser$/.test(String(t.deskBack.chip)) && t.deskBackTyped.page === t.deskBackTyped.b + 'k2' && t.deskBackTyped.view.composer === 'k1',
    `verify r2 (H1b'): the chat pressed on ANOTHER desktop (a yield), back on the view's desktop — its home gone, the yield ends: before any key the caret is in the sink ("${t.deskBack && t.deskBack.chip}"), "k2" reaches the page, the chat box keeps "k1"`, JSON.stringify({ desks: t.desks, press: t.deskPressComposer, yielded: t.deskYielded, back: t.deskBack, typed: t.deskBackTyped }));
  ok(t.expandPress && t.expandPress.ok && t.q1.view.active === 'sink' && t.q1.view.owns && t.q1.cues === 1 && /Typing still goes to the browser — click the text box itself to type there/.test(t.q1.toast) && t.q1Press.ok && t.q1Typed.yielded && t.q1Typed.composer === 'ok',
    `verify r2 (Q1): the composer's expand button (a press of his that focuses the box) is still reclaimed — and SAID once ("${t.q1 && t.q1.toast}"); following the advice (a press on the box itself) yields, "ok" lands in the composer`, JSON.stringify({ press: t.expandPress, q1: t.q1, press2: t.q1Press, typed: t.q1Typed }));
  ok(t.wvUp && t.wvPress && t.wvPress.ok && t.wv.view.active === 'sink' && t.wv.view.owns && t.wv.frames >= 1 && /Typing still goes to the browser — to type in another page, hand back first/.test(t.wv.toast) && t.wvTyped.page === t.wvTyped.b + 'wv' && t.wvTyped.field === '',
    `verify r2 (H5): a real press INTO a Web view page's field while you drive is taken back (the frame's press is indistinguishable from its own script) and SAID ("${t.wv && t.wv.toast}"); "wv" reaches the agent's page as the chip says`, JSON.stringify({ up: t.wvUp, press: t.wvPress, wv: t.wv, typed: t.wvTyped }));
  ok(t.deskUp && t.deskPress && t.deskPress.ok && t.deskAfter.active === true && t.deskAfter.view.yielded && !t.deskAfter.view.owns && t.deskAfter.view.chip === 'Keyboard is outside the browser — click the picture to keep using the page' && t.deskTyped.page === t.deskTyped.b,
    `verify r2 (N1): the DESKTOP (a real noVNC over this world's Xvnc) — a real press on its picture while you drive YIELDS to its canvas ("${t.deskAfter && t.deskAfter.view.chip}"), "vn" never reaches the page (${JSON.stringify(t.deskTyped && t.deskTyped.page)})`, JSON.stringify({ up: t.deskUp, press: t.deskPress, after: t.deskAfter, typed: t.deskTyped }));
  ok(t.appId && t.appUp && t.appPress && t.appPress.ok && /xpra-ime/.test(String(t.appAfter.active)) && t.appAfter.view.yielded && !t.appAfter.view.owns && t.appTyped.app === 'xp\n' && t.appTyped.page === t.appTyped.b,
    `verify r2 (N1): a DESKTOP APP (a real xterm under xpra) — a real press on its picture yields to its IME; "xp" + Enter reach the APP (its shell wrote ${JSON.stringify(t.appTyped && t.appTyped.app)}), nothing reaches the page`, JSON.stringify({ id: t.appId, up: t.appUp, press: t.appPress, after: t.appAfter, typed: t.appTyped, diag: t.appDiag }));
  ok(t.heldHide.down && t.heldHide.ku === 'Shift' && Array.isArray(t.heldHide.pressed) && t.heldHide.pressed.length === 0 && t.hand.ok && t.handed && t.heldHandback.down && t.heldHandback.ku === 'Shift',
    `verify r2 (H3): Shift HELD in the page when the window is minimized, and across a real press on Hand back, is let go IN THE PAGE (keydown / keyup: ${JSON.stringify(t.heldHide)} · ${JSON.stringify(t.heldHandback)}) — before, the page kept it down`, JSON.stringify({ hide: t.heldHide, hand: t.hand, handed: t.handed, handback: t.heldHandback }));
  ok(t.scriptFocus === true && t.restoredB.owns && t.restoredB.active === 'sink' && t.restoredB.caretMoves >= 1 && /^Typing (goes|is sent) to the browser$/.test(String(t.restoredB.chip)) && t.restoredB.line === null
    && t.restoredBTyped.view.composer === 'd1' && t.restoredBTyped.page === t.b2 + 'd2' && t.restoredBTyped.view.strayKeys === 0,
    `verify r2 (H1): the password guard across the return — a SCRIPT's caret in the composer while minimized is MOVED to the sink at the restore (before any key: ${t.restoredB && t.restoredB.active}, "${t.restoredB && t.restoredB.chip}"), "d2" reaches the page, the composer keeps "d1"`, JSON.stringify({ script: t.scriptFocus, restored: t.restoredB, typed: t.restoredBTyped, b2: t.b2 }));
  await wd.closePage(t.P);
}
// verify r3: the input-surface census's chrome asserts + the round's findings (its own session and client)
if (want('r3')) {
  console.log('— ⑦ verify r3: the input-surface census in chrome (the code editor, the channel composer) and the round\'s findings');
  const nb = await newBrowserSession(wd, 'r3m');
  const r = await r3Legs(wd, { S: nb.S, pid: nb.pid, tag: 'r3m' });
  ok(nb.pageUp && r.ready && r.chat && r.live && r.take.ok && r.took, `r3's world: the agent's page, a client with the chat and its live view as two windows, a real Take over (${JSON.stringify({ pageUp: nb.pageUp, ready: r.ready, chat: r.chat, live: r.live, took: r.took })})`);
  ok(r.cmUp && r.cmOpened.owns && r.cmPress.ok && r.cm.active === 'cm-content' && r.cm.yielded && !r.cm.owns && r.cm.chip === 'Keyboard is outside the browser — click the picture to keep using the page' && r.cmTyped.doc.startsWith('line one/line twozz/') && r.cmTyped.page === r.cmTyped.b0,
    `the census (text row): THE CODE EDITOR opened while you drive keeps the keys the page's; a real press on a line YIELDS to CodeMirror's .cm-content ("${r.cm && r.cm.chip}"), "zz" lands in the document (${JSON.stringify(r.cmTyped && r.cmTyped.doc)}), the page keeps ${JSON.stringify(r.cmTyped && r.cmTyped.b0)}`, JSON.stringify({ up: r.cmUp, opened: r.cmOpened, press: r.cmPress, after: r.cm, typed: r.cmTyped }));
  ok(r.selPress && r.selPress.ok && r.sel.focused === true && r.sel.open === true && r.sel.owns,
    `verify r3 (F1): the editor's language <select>, pressed while you drive, is focused and OPEN 150 ms later (its list the pointer's; the view still owns the keys) — before, the sink took the focus back and the list closed at once`, JSON.stringify({ press: r.selPress, sel: r.sel }));
  ok(r.exUp && r.copyPress && r.copyPress.ok && r.copy.reclaims >= 1 && r.copy.cues === 0 && !/click the text box itself/.test(r.copy.toasts) && r.copy.active === 'sink' && r.copy.owns,
    `verify r3 (F2): "Copy Path" on the plain-http viewer — copyText's scratch box taken back (${r.copy && r.copy.reclaims} reclaim), and NOTHING says "click the text box itself" (toasts: ${JSON.stringify(r.copy && r.copy.toasts)})`, JSON.stringify({ up: r.exUp, press: r.copyPress, copy: r.copy }));
  ok(r.delPress && r.delPress.ok && r.dialog.open && r.dialog.cues === 1 && /Typing still goes to the browser — click the dialog’s buttons to answer it/.test(r.dialog.toasts) && r.dialog.active === 'sink' && r.dialogEnter.page === r.dialogEnter.b + '\n' && r.dialogEnter.stillOpen && r.dialogEnter.kept && r.cancelPress.ok && !r.dialogClosed.open && r.dialogClosed.cues === 1 && r.dialogClosed.kept,
    `verify r3 (F4): Delete → the confirm dialog while you drive: taken back and SAID once ("${(String(r.dialog && r.dialog.toasts).match(/Typing still goes to the browser — click the dialog’s buttons to answer it/) || ['—'])[0]}"); Enter is still the PAGE's (declared: a dialog never takes the keys by itself — the file kept), a real press on Cancel answers it, silently`, JSON.stringify({ press: r.delPress, dialog: r.dialog, enter: r.dialogEnter, cancel: r.cancelPress, closed: r.dialogClosed }));
  ok(r.chanUp && r.chanPress && r.chanPress.ok && r.chan.active === true && r.chan.view.yielded && !r.chan.view.owns && r.chanTyped.value === 'ch' && r.chanTyped.page === r.chanTyped.b0,
    `the census (text row): THE CHANNEL COMPOSER (fake-poll · Ops) — a real press YIELDS to it ("${r.chan && r.chan.view.chip}"), "ch" lands there, the page keeps ${JSON.stringify(r.chanTyped && r.chanTyped.b0)}`, JSON.stringify({ up: r.chanUp, press: r.chanPress, chan: r.chan, typed: r.chanTyped }));
  ok(r.listComposer.ok && r.listYielded.yielded && r.listYielded.composer === 'l1' && r.listPress.ok && r.list.yielded && r.list.where === 'none' && r.list.chip === 'Keyboard is not in a text box — click one to type there, or the picture to use the page' && r.listTyped.view.composer === 'l1' && r.listTyped.page === r.listTyped.b,
    `verify r3 (r2's held): yielded to the composer, a real press on the chat's MESSAGE LIST — the yield stays and the bar says "${r.list && r.list.chip}"; "nn" reaches neither the composer nor the page`, JSON.stringify({ composer: r.listComposer, yielded: r.listYielded, press: r.listPress, after: r.list, typed: r.listTyped }));
  ok(r.handPress.ok && r.handed, 'r3\'s legs end with a real Hand back');
  await wd.closePage(r.P);
  // ── verify r4: the round's chrome legs (same session, its own client) ──
  const r4 = await r4Legs(wd, { S: nb.S, pid: nb.pid, tag: 'r3m' });
  ok(r4.ready && r4.chat && r4.live && r4.take.ok && r4.took, `r4's world: the chat and the live view as two windows, a real Take over (${JSON.stringify({ ready: r4.ready, chat: r4.chat, live: r4.live, took: r4.took })})`);
  ok(r4.selPress && r4.selPress.ok && r4.selOpen.focused && r4.selOpen.open === true && r4.selArrow.open === true && r4.selEnter.value === 'beta' && r4.selEnter.open === false && r4.selEnter.active === 'browser-live-kbd' && r4.selKeysToPage === 0 && r4.selOpen2.open === true && r4.selType.open === true && r4.selEsc.open === false && r4.selEsc.active === 'browser-live-kbd' && r4.selKeysToPage2 === 0 && r4.selEsc.owns,
    `verify r4 (attack 1, measured): a <select> pressed while you drive opens its list; on the OPEN list ArrowDown / Enter / type-ahead / Escape are the list's (Enter commits "${r4.selEnter && r4.selEnter.value}", ${r4.selKeysToPage + r4.selKeysToPage2} of them reached the page) and the closing key's keyup hands the caret to the sink — the next keys are the page's`, JSON.stringify({ open: r4.selOpen, arrow: r4.selArrow, enter: r4.selEnter, type: r4.selType, esc: r4.selEsc, toPage: [r4.selKeysToPage, r4.selKeysToPage2] }));
  ok(r4.colorPress && r4.colorPress.ok && r4.color80.open === true && r4.color80.active === 'browser-live-kbd' && r4.color330.open === true && r4.color330.owns,
    `verify r4 (attack 1, measured): an <input type=color> pressed while you drive keeps its picker OPEN across the sink's take-back (:open at 80 ms and 330 ms with the caret in the sink) — the colour pickers of the theme editor and a Task Group are not dead`, JSON.stringify({ c80: r4.color80, c330: r4.color330 }));
  ok(r4.yielded.yielded && r4.storm && r4.storm.n === 300 && r4.storm.writes <= 2 && r4.storm.active === 'r4row' && r4.storm.where === 'none' && /not in a text box/.test(String(r4.storm.chip)) && r4.storm.yielded && !r4.storm.owns && r4.afterStorm.where === 'chat' && r4.afterStorm.active === 'composer',
    `verify r4 (attack 3): 300 focus moves over a list while yielded — the chip is written ${r4.storm && r4.storm.writes} time(s): the one change of words at the first move ("${r4.storm && r4.storm.chip}"), never again; the focus stays where the script put it, ${r4.storm && r4.storm.ms} ms; a press back on the composer says "chat"`, JSON.stringify({ yielded: r4.yielded, storm: r4.storm, after: r4.afterStorm }));
  ok(r4.afterClose.mode === 'watch' && !r4.afterClose.yielded && r4.afterClose.chip === null && r4.afterClose.line === null && r4.afterClose.active === 'composer' && !r4.afterClose.owned && r4.closeTyped.composer === 'y1y2' && r4.reconnected && r4.afterReconnect.mode === 'watch' && !r4.afterReconnect.owned && r4.took2 && r4.retake.b === r4.retake.b0 + 'zz',
    `verify r4 (attack 7): the socket closes while yielded — the takeover ends as the server ends it (watch), the yield with it (chip and line gone), the caret stays in the composer ("y2" lands there), the reconnect leaves nothing claimed, a new Take over works ("zz" to the page)`, JSON.stringify({ close: r4.afterClose, typed: r4.closeTyped, reconnected: r4.reconnected, after: r4.afterReconnect, retake: r4.retake }));
  console.log('  · r4 two views: ' + JSON.stringify({ cap: [r4.capBefore, r4.capAfter], secondUp: r4.secondUp, two: r4.two, driving: r4.bothDriving, yielded: r4.bothYielded, hand2: r4.afterHand2, both: r4.afterBoth, chatFocus: r4.chatFocus })); // (whole — the ok line's detail is cut at 900 chars)
  ok(r4.two && r4.two.n === 2 && r4.bothDriving.L2.owns && !r4.bothDriving.L1.owns && r4.bothDriving.owned && r4.bothYielded.L1.yielded && r4.bothYielded.L2.yielded && !r4.bothYielded.owned && r4.bothYielded.active === 'composer' && r4.bothYielded.line && r4.afterHand2.L1.yielded && r4.afterHand2.L2.mode === 'watch' && !r4.afterHand2.owned && /not in a text box|in the chat box/.test(String(r4.afterHand2.L1.chip)) && !r4.afterBoth.L1.yielded && !r4.afterBoth.owned && r4.afterBoth.line === null && r4.chatFocus === true,
    `verify r4 (attack 7): two views driving (the last claim owns), one press yields BOTH (the line on), a Hand back on the second leaves the first yielded and its chip honest ("${r4.afterHand2 && r4.afterHand2.L1.chip}"), the other Hand back leaves no claim and the composer focuses as always`, JSON.stringify({ cap: [r4.capBefore, r4.capAfter], secondNew: r4.secondNew, secondUp: r4.secondUp, two: r4.two, driving: r4.bothDriving, yielded: r4.bothYielded, hand2: r4.afterHand2, both: r4.afterBoth, chatFocus: r4.chatFocus }));
  await wd.closePage(r4.P);
}
await wd.close();

// ═══ ⑤ CONTROLS — the pre-fix behaviours, each red ═══════════════════════════
console.log('— ⑤ CONTROLS: a server built from a patched copy of the tree (the bundle rebuilt in it)');
if (want('controls')) {
  const P = (name, file, from, to) => ({ name, file, from, to });
  const patches = [
    P('the pre-fix record: a paste in ONE char', 'src/server/browser-stream.js', '    const r = S.textRecords(text);', '    const r = S.textRecords(text, { units: 400 });'),
    P('no ⌘ table', 'src/browser-takeover.js', '  if (!viewerMac || remoteMac) return f;', '  return f;'),
    P('every keyup forwarded', 'src/lib/browser-live-window.js', "      const was = st.pressed.get(e.code || e.key);\n      if (was) {", "      const was = st.pressed.get(e.code || e.key) || { key: e.key, code: e.code, keyCode: e.keyCode };\n      if (was) {"),
    P('a drag without its button', 'src/lib/browser-live-window.js', "modifiers: modifiersOf(e), held: st.buttonsDown ? st.heldButton : null });", "modifiers: modifiersOf(e) });"),
    P('no copy-out door', 'src/server/browser-stream.js', '    const g = T.copyDeliverVerdict(relay.copyArm, t);', "    const g = { deliver: true, gesture: 'chord', arm: null };"),
    P('no copy-out door (the viewer\'s half)', 'src/lib/browser-live-window.js', '    const chordAge = st.copyAt ? Date.now() - st.copyAt : null;', '    const chordAge = 100;'),
  ];
  const wc = await makeWorld('c', { patches });
  ok(wc.rebuilt === true && wc.booted, `the control tree: ${patches.length} patches, its bundle rebuilt, its server booted`, String(wc.rebuilt));
  if (wc.booted) {
    const Ec = await wc.page({ lang: 'en' });
    const C1 = await wc.createSession('ctl-chat');
    const cn = await C1.vb(['new', 'shopping']); await C1.vb(['use', 'shopping']);
    const cid = (/\((bp-[0-9a-f]{8})\)/.exec(cn.stdout + cn.stderr) || [])[1] || null;
    await C1.vb(['open', wc.innerUrl('ctl')]); await wc.innerUntil('ctl', () => true, 20000);
    await Ec.openLive(C1.sessionId, { profileId: cid });
    await Ec.takeover(C1.sessionId);
    await Ec.click(C1.sessionId, 200, 140); await wc.innerUntil('ctl', (r) => r.act === 'b', 5000);
    await wc.setClipboard('hello world'); await Ec.chord('v'); await sleep(1500);
    const pasted = (wc.inner('ctl') || {}).b || '';
    ok(pasted === '', `NEGATIVE CONTROL (the pre-fix record): Ctrl+V of "hello world" lands ${JSON.stringify(pasted)} — nothing, the owner's report`);
    await Ec.ime('我想买这个'); await sleep(800);
    const ku = ((wc.inner('ctl') || {}).ku || []).filter((k) => k === 'Enter').length;
    ok(ku >= 1, `NEGATIVE CONTROL (every keyup forwarded): the IME's commit key reaches the page as a lone Enter keyup (${ku})`);
    await Ec.drag(C1.sessionId, [22, 232], [330, 232]); await sleep(900);
    const dsel = (wc.inner('ctl') || {}).sel || '';
    ok(!/SELECT-ME selectable/.test(dsel), `NEGATIVE CONTROL (a drag without its button): the drag selects ${JSON.stringify(dsel)} — nothing to copy`);
    await Ec.handback(C1.sessionId);
    const Mc = await wc.page({ mac: true, lang: 'en' });
    await Mc.openLive(C1.sessionId, { profileId: cid });
    await Mc.takeover(C1.sessionId);
    await Mc.click(C1.sessionId, 200, 140); await wc.innerUntil('ctl', (r) => r.act === 'b', 5000);
    const before = (wc.inner('ctl') || {}).b || '';
    await Mc.chord('a', { meta: true }); await sleep(900);
    const after = (wc.inner('ctl') || {}).b || '';
    ok(after === before + 'a', `NEGATIVE CONTROL (no ⌘ table): ⌘A TYPES "a" into the page (${JSON.stringify(before.slice(-8))} → ${JSON.stringify(after.slice(-8))})`);
    await Mc.handback(C1.sessionId);
    await Mc.q(C1.sessionId, 'window.app.wm.closeWindow?.(w.id); return true;');
    // the door (verify): without it the hostile page's synthetic copy lands on the viewer's clipboard after one click
    await C1.vb(['open', wc.innerUrl('ctlh', '&hostile=1')]); await wc.innerUntil('ctlh', () => true, 20000);
    await Ec.q(C1.sessionId, 'window.app.wm.revealWindow(w.id); return true;');
    await Ec.takeover(C1.sessionId);
    await wc.setClipboard('(untouched)');
    await Ec.click(C1.sessionId, 200, 140); await sleep(1800);
    const hij = await wc.readClipboard();
    ok(/^HIJACK-\d+$/.test(String(hij)), `NEGATIVE CONTROL (no copy-out door): the page's own synthetic copy is written to the viewer's clipboard after one plain click — ${JSON.stringify(hij)} (the real-stack hijack the door closes)`);
    await Ec.handback(C1.sessionId);
  }
  await wc.close();
}
// ⑥ CONTROL — the pre-fix verdict on a patched tree (the bundle rebuilt in it): a user's press reclaimed like a script's
// focus ⇒ userW's bug, measured by the same leg
if (want('split')) {
  console.log('— ⑥ CONTROL: the pre-fix focus verdict (the user\'s press reclaimed like a script\'s focus) on a patched tree');
  const wk = await makeWorld('k', { patches: [{ name: 'the pre-fix focus verdict: no yield', file: 'src/browser-takeover.js', from: "  return byUserPress ? 'yield' : 'reclaim';", to: "  return 'reclaim';" }] });
  ok(wk.rebuilt === true && wk.booted, `the control tree: the pre-fix focus verdict, its bundle rebuilt, its server booted (${String(wk.rebuilt)})`);
  if (wk.booted) {
    const c = await splitLegs(wk, { tag: 'splitc', upTo: 'typed' });
    ok(c.live && c.took && c.pressComposer.ok && c.afterPress.active === 'sink' && c.typed.composer === '' && c.pageAfterTyping === 'pghello agent' && c.typed.line === null,
      `NEGATIVE CONTROL (the pre-fix verdict): the same real press on the composer leaves the caret in the view's hidden sink and "hello agent" lands in the PAGE (${JSON.stringify(c.pageAfterTyping)}) while the composer holds ${JSON.stringify(c.typed.composer)} — userW's report, said by nothing`, JSON.stringify({ live: c.live, took: c.took, press: c.pressComposer, after: c.afterPress, typed: c.typed, page: c.pageAfterTyping }));
    c.P.close();
  }
  await wk.close();
  // verify r1 CONTROL — the same legs on a tree with the pre-fix code of each verify-r1 finding (the bundle rebuilt in it)
  console.log('— ⑥ CONTROL (verify r1): the pre-fix code of each verify-r1 finding on a patched tree');
  const wv = await makeWorld('v', { patches: [
    { name: 'K4 pre-fix: a yield forgets the held keys', file: 'src/lib/browser-live-window.js', from: "    if (v === 'yield') { releaseHeld(); renderKbd(); keyboardChanged(); return; }", to: "    if (v === 'yield') { st.pressed.clear(); renderKbd(); keyboardChanged(); return; }" },
    { name: 'K3 pre-fix: only the view\'s root is the view', file: 'src/lib/keyboard-yield.js', from: 'const namesView = (el) => { if (inView(el)) return true; try { return !!el && !!ownChrome(el); } catch { return false; } };', to: 'const namesView = (el) => inView(el);' },
    { name: 'H4 pre-fix: the takeover badge in amber text', file: 'public/style.css', from: '.browser-live-mode.takeover { color: var(--text); background: color-mix(in srgb, var(--yellow, #e5c07b) 20%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--yellow, #e5c07b) 65%, transparent); }', to: '.browser-live-mode.takeover { color: var(--yellow, #e5c07b); background: color-mix(in srgb, var(--yellow, #e5c07b) 14%, transparent); }' },
    { name: 'H4 pre-fix: Hand back in amber text', file: 'public/style.css', from: '.file-tool-btn.browser-live-handback { color: var(--text); border-color: var(--yellow, #e5c07b); background: color-mix(in srgb, var(--yellow, #e5c07b) 14%, transparent); width: auto; height: 22px; padding: 0 8px; font-size: 10px; }', to: '.file-tool-btn.browser-live-handback { color: var(--yellow, #e5c07b); border-color: var(--yellow, #e5c07b); width: auto; height: 22px; padding: 0 8px; font-size: 10px; }' },
    { name: 'H4 pre-fix: the owning chip in accent text', file: 'public/style.css', from: 'white-space: nowrap; color: var(--text); background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent); }', to: 'white-space: nowrap; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }' },
    { name: 'pre-fix: the yielded chip in amber text', file: 'public/style.css', from: '.browser-live-kbd-chip.yielded { color: var(--text); background: color-mix(in srgb, var(--yellow, #e5c07b) 20%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--yellow, #e5c07b) 65%, transparent); cursor: pointer; }', to: '.browser-live-kbd-chip.yielded { color: var(--yellow, #e5c07b); background: color-mix(in srgb, var(--yellow, #e5c07b) 14%, transparent); cursor: pointer; }' },
    { name: 'pre-fix: a press on the focused composer is never judged', file: 'src/lib/browser-live-window.js', from: "    if (r === 'noted') { if (st.claimed && !st.copying && ky.onPressFocused(document.activeElement) === 'yield') { releaseHeld(); renderKbd(); keyboardChanged(); } return; }", to: "    if (r === 'noted') return;" },
    // verify r2 (H1): the pre-fix reverse direction — a press while the view does not drive is not judged; a return to the page moves no caret
    { name: 'H1 pre-fix: a press while not driving is ignored', file: 'src/lib/keyboard-yield.js', from: '      if (!driving() && !isMine()) { s.press = null; return null; }', to: '      if (!driving()) { s.press = null; return null; }' },
    { name: 'H1 pre-fix: the return merely routes the keys', file: 'src/lib/keyboard-yield.js', from: 'const r = keyboardTransition({ was: s.last, now: { owns, yielded }, caretOutside: caretOutside(active) });', to: 'const r = keyboardTransition({ was: s.last, now: { owns, yielded }, caretOutside: false });' },
    // verify r2 (Q1): the pre-fix reclaim of a focus the user's own press elsewhere caused — said by nothing
    { name: 'Q1 pre-fix: a reclaim is never said', file: 'src/lib/keyboard-yield.js', from: '    takeCue(el) { const c = !!el && s.cue === el && el.isConnected !== false; if (s.cue === el) s.cue = null; if (c) s.lastCueAt = now(); return c; },', to: '    takeCue() { return false; },' },
    // verify r2 (H5): the pre-fix frame reclaim — said by nothing
    { name: 'H5 pre-fix: a focus taken back from a frame is silent', file: 'src/lib/browser-live-window.js', from: '      if (frame) {\n        st.frameReclaims++;', to: '      if (false) {\n        st.frameReclaims++;' },
    // verify r2 (N1): the pre-fix picture — xterm's screen the only input host, noVNC's canvas not a place keys go
    { name: 'N1 pre-fix: a desktop app\'s picture is not one input with its IME', file: 'src/lib/keyboard-yield.js', from: "const INPUT_HOSTS = '.xterm, .picture-shell';", to: "const INPUT_HOSTS = '.xterm';" },
    { name: 'N1 pre-fix: noVNC\'s canvas is not a keyboard surface', file: 'src/lib/keyboard-yield.js', from: "  try { return !!el && el.nodeType === 1 && el.tagName === 'CANVAS' && typeof el.closest === 'function' && !!el.closest('.picture-shell'); } catch { return false; }", to: '  return false;' },
    // verify r2 (H3): the pre-fix transitions and Hand back forget the keys held in the page
    { name: 'H3 pre-fix: a transition away from the page keeps its held keys down', file: 'src/lib/browser-live-window.js', from: '      if (r.release) releaseHeld(); // verify r2 (H3)', to: '      if (false) releaseHeld(); // verify r2 (H3)' },
    // 2.369.198: the anchor is the HEAD of the line up to the clause the patch removes — never the whole line (the .197
    // integration appended `expectWakes` to the same handler and the whole-line anchor stopped matching: the .197 heavy red)
    { name: 'H3 pre-fix: Hand back without letting go', file: 'src/lib/browser-live-window.js', from: "  handBtn.onclick = () => { if (st.claimed) releaseHeld(); send({ type: 'handback'", to: "  handBtn.onclick = () => { send({ type: 'handback'" },
  ] });
  ok(wv.rebuilt === true && wv.booted, `the verify-r1 control tree: its bundle rebuilt, its server booted (${String(wv.rebuilt)})`);
  if (wv.booted) {
    const c = await splitLegs(wv, { tag: 'splitv', upTo: 'verify-r1' });
    ok(c.held && c.held.press && c.held.view.active === 'composer' && c.held.shiftDown === 1 && c.held.altDown === 1 && c.held.shiftUp === 0 && c.held.altUp === 0,
      `NEGATIVE CONTROL (K4 pre-fix): Shift + Alt held across the press reach the page as keydowns and NEVER as keyups (${JSON.stringify(c.held && { kd: c.held.kdTail, ku: c.held.kuTail })})`, JSON.stringify(c.held));
    ok(c.barContrast && c.barContrast.light.badge < 4.5 && c.barContrast.solarized.badge < 4.5 && c.barContrast.solarized.own < 4.5 && c.barContrast.nord.own < 4.5 && c.barContrast.light.handback < 4.5,
      `NEGATIVE CONTROL (H4 pre-fix css): the amber badge and the accent chip measure ${c.barContrast && c.barContrast.light.badge} (badge, light) / ${c.barContrast && c.barContrast.solarized.own} (chip, solarized) : 1 — the measurement sees them`, JSON.stringify(c.barContrast));
    ok(c.chipContrast && c.chipContrast.yielded && c.chipContrast.out.light < 4.5,
      `NEGATIVE CONTROL (pre-fix css): the amber chip text measures ${c.chipContrast && c.chipContrast.out.light} : 1 on the light theme — the measurement sees it`, JSON.stringify(c.chipContrast));
    ok(c.tabPress && c.tabPress.ok && c.afterTab.active === 'composer' && !c.afterTab.owns && !c.tabPage && c.afterTabTyped.view.composer === 'kk',
      `NEGATIVE CONTROL (K3 pre-fix): a press on the live view's own TAB leaves the caret in the composer and "kk" meant for the page lands in the CHAT box (${JSON.stringify(c.afterTabTyped && c.afterTabTyped.view.composer)})`, JSON.stringify({ press: c.tabPress, after: c.afterTab, typed: c.afterTabTyped }));
    await wv.closePage(c.P); // verify r2: END the page (see above)
    const ct = await standaloneLegs(wv, { S: c.S, pid: c.pid, tag: 'splitv' });
    ok(ct.took && ct.alone === true && ct.titlePress.ok && ct.afterTitle.active === 'composer' && !ct.titlePage && ct.afterTitleTyped.view.composer === 'tt',
      `NEGATIVE CONTROL (K3 pre-fix): a press on the standalone live window's own TITLE BAR leaves the caret in the composer and "tt" lands in the CHAT box (${JSON.stringify(ct.afterTitleTyped && ct.afterTitleTyped.view.composer)})`, JSON.stringify({ took: ct.took, press: ct.titlePress, after: ct.afterTitle, typed: ct.afterTitleTyped }));
    ok(ct.pressHidden && ct.pressHidden.ok && ct.restored && ct.restored.owns && ct.restored.active === 'composer' && ct.restoredTyped && ct.restoredTyped.page !== ct.b1 && ct.restoredTyped.view.composer === 'c1',
      `NEGATIVE CONTROL (H1 pre-fix): minimized → a real press on the composer → restored — the view takes the keys with the caret left in the composer and "c2" never reaches the composer (the page: ${JSON.stringify(ct.restoredTyped && ct.restoredTyped.page)})`, JSON.stringify({ hidden: ct.pressHidden, restored: ct.restored, typed: ct.restoredTyped, b1: ct.b1 }));
    ok(ct.expandPress && ct.expandPress.ok && ct.q1 && ct.q1.view.active === 'sink' && ct.q1.cues === 0 && !/Typing still goes to the browser/.test(ct.q1.toast),
      `NEGATIVE CONTROL (Q1 pre-fix): the expand button's box is reclaimed and nothing says so (toasts: ${JSON.stringify(ct.q1 && ct.q1.toast)})`, JSON.stringify({ press: ct.expandPress, q1: ct.q1 }));
    ok(ct.wvUp && ct.wv && ct.wv.view.active === 'sink' && ct.wv.frames === 0 && !/to type in another page/.test(ct.wv.toast),
      `NEGATIVE CONTROL (H5 pre-fix): a press into the Web view page's field is taken back and nothing says so (toasts: ${JSON.stringify(ct.wv && ct.wv.toast)})`, JSON.stringify({ up: ct.wvUp, wv: ct.wv }));
    ok(ct.deskUp && ct.deskAfter && ct.deskAfter.active === false && ct.deskAfter.view.owns && ct.deskTyped && ct.deskTyped.page === ct.deskTyped.b + 'vn',
      `NEGATIVE CONTROL (N1 pre-fix): a real press on the Desktop's picture is reclaimed — "vn" goes to the agent's PAGE (${JSON.stringify(ct.deskTyped && ct.deskTyped.page)})`, JSON.stringify({ up: ct.deskUp, after: ct.deskAfter, typed: ct.deskTyped }));
    ok(ct.appUp && ct.appAfter && ct.appAfter.view.owns && ct.appTyped && ct.appTyped.page === ct.appTyped.b + 'xp\n' && !ct.appTyped.app,
      `NEGATIVE CONTROL (N1 pre-fix): a real press on the xterm app's picture is reclaimed — "xp" goes to the agent's PAGE (${JSON.stringify(ct.appTyped && ct.appTyped.page)}), the app gets nothing`, JSON.stringify({ up: ct.appUp, after: ct.appAfter, typed: ct.appTyped }));
    ok(ct.heldHide && ct.heldHide.down && ct.heldHide.ku === 'm' && ct.heldHandback && ct.heldHandback.down && ct.heldHandback.ku === 'n',
      `NEGATIVE CONTROL (H3 pre-fix): Shift held across the minimize and across Hand back reaches the page as a keydown and NEVER as a keyup (${JSON.stringify(ct.heldHide)} · ${JSON.stringify(ct.heldHandback)})`, JSON.stringify({ hide: ct.heldHide, handback: ct.heldHandback }));
    ok(ct.restoredB && ct.restoredB.owns && ct.restoredB.active === 'composer' && ct.restoredB.caretMoves === 0,
      `NEGATIVE CONTROL (H1 pre-fix): a script's caret in the composer while minimized is NOT moved at the restore (${ct.restoredB && ct.restoredB.active}) — the keys would merely be routed past it`, JSON.stringify({ restored: ct.restoredB, typed: ct.restoredBTyped }));
    await wv.closePage(ct.P);
  }
  await wv.close();
  // verify r2 (H1b') CONTROL — its OWN tree (the v tree reverts H1's press-while-hidden yield, so the state cannot arise there):
  // only the yield's home rule off, everything else as shipped
  console.log('— ⑥ CONTROL (verify r2 H1b\'): a yield that outlives its home, on a patched tree');
  const wh = await makeWorld('h', { patches: [
    { name: 'H1b\' pre-fix: a yield outlives its home', file: 'src/lib/keyboard-yield.js', from: '      const v = yieldHomeVerdict({ yielded: s.yielded, drivesNow: !!drives, drovePrev, homeVisible });', to: "      const v = 'keep';" },
  ] });
  ok(wh.rebuilt === true && wh.booted, `the control tree: the H1b' pre-fix patch, its bundle rebuilt, its server booted (${String(wh.rebuilt)})`);
  if (wh.booted) {
    const c = await splitLegs(wh, { tag: 'splith', upTo: 'typed' });
    await wh.closePage(c.P);
    const ct = await standaloneLegs(wh, { S: c.S, pid: c.pid, tag: 'splith' });
    ok(h1bPreFix(ct.deskBack, ct.deskBackTyped), // (verify r3, r2's held: the caret fell to <body> — the chip now says "not in a text box"; the yield outliving its home is the red; verify r4: the ONE predicate, rejected on the fixed tree above)
      `NEGATIVE CONTROL (H1b' pre-fix): back on the view's desktop the yield outlives its home — the chip says "${ct.deskBack && ct.deskBack.chip}" while the caret is on ${ct.deskBack && ct.deskBack.active} and "k2" goes nowhere`, JSON.stringify({ back: ct.deskBack, typed: ct.deskBackTyped }));
    await wh.closePage(ct.P);
  }
  await wh.close();
}
// verify r3 CONTROL — the round's four pre-fix rules on a patched tree (the bundle rebuilt in it), the same r3 legs
if (want('r3')) {
  console.log('— ⑦ CONTROL (verify r3): the pre-fix rule of each r3 finding on a patched tree');
  const w3 = await makeWorld('r3c', { patches: [
    { name: 'F1 pre-fix: a <select> is taken back like any other focus', file: 'src/lib/keyboard-yield.js', from: "  if (isEditable(a) || isChoiceControl(a)) return 'keep';", to: "  if (isEditable(a)) return 'keep';" },
    { name: 'F2 pre-fix: a box already gone is announced', file: 'src/lib/keyboard-yield.js', from: '    takeCue(el) { const c = !!el && s.cue === el && el.isConnected !== false; if (s.cue === el) s.cue = null; if (c) s.lastCueAt = now(); return c; },', to: '    takeCue() { const c = !!s.cue; s.cue = null; if (c) s.lastCueAt = now(); return c; },' },
    { name: 'r2 held pre-fix: the chip names the box the keys were given to', file: 'src/lib/keyboard-yield.js', from: "      if (active && active !== sink && !inView(active)) { if (takesKeys(active)) return yieldKindOf(active); if (isFrame(active)) return 'other'; }\n      return 'none';", to: '      return s.kind;' },
    { name: 'F4 pre-fix: a dialog the user opened is taken back silently', file: 'src/lib/keyboard-yield.js', from: '    dialogCue(a) {\n', to: '    dialogCue(a) { return false;\n' },
    { name: 'r4 pre-fix: the chip written on every re-read', file: 'src/lib/browser-live-window.js', from: '    if (kbdText.textContent !== text) kbdText.textContent = text;\n    if (kbdChip.title !== title) kbdChip.title = title;', to: '    kbdText.textContent = text;\n    kbdChip.title = title;' },
  ] });
  ok(w3.rebuilt === true && w3.booted, `the r3 control tree: 5 patches, its bundle rebuilt, its server booted (${String(w3.rebuilt)})`);
  if (w3.booted) {
    const nb = await newBrowserSession(w3, 'r3c');
    const c = await r3Legs(w3, { S: nb.S, pid: nb.pid, tag: 'r3c' });
    ok(c.selPress && c.selPress.ok && !(c.sel.focused === true && c.sel.open === true),
      `NEGATIVE CONTROL (F1 pre-fix): the editor's language <select> pressed while driving is not open 150 ms later (${JSON.stringify(c.sel)}) — every dropdown dead`, JSON.stringify({ press: c.selPress, sel: c.sel }));
    ok(c.copyPress && c.copyPress.ok && c.copy.cues === 1 && /click the text box itself/.test(c.copy.toasts),
      `NEGATIVE CONTROL (F2 pre-fix): "Copy Path" says "click the text box itself to type there" — about a box that no longer exists (${JSON.stringify(c.copy && c.copy.toasts)})`, JSON.stringify(c.copy));
    ok(c.list && c.list.yielded && c.list.chip === 'Keyboard is in the chat box — click the picture to keep using the page' && c.listTyped.view.composer === 'l1' && c.listTyped.page === c.listTyped.b,
      `NEGATIVE CONTROL (r2's held pre-fix): after the press on the message list the chip still says "${c.list && c.list.chip}" while "nn" goes nowhere`, JSON.stringify({ after: c.list, typed: c.listTyped }));
    ok(c.dialog && c.dialog.open && c.dialog.cues === 0 && !/click the dialog’s buttons/.test(c.dialog.toasts) && c.dialogEnter.page === c.dialogEnter.b + '\n',
      `NEGATIVE CONTROL (F4 pre-fix): the confirm dialog is taken back and nothing says so — the Enter meant for it reaches the page (${JSON.stringify(c.dialogEnter && c.dialogEnter.page.slice(-6))})`, JSON.stringify({ dialog: c.dialog, enter: c.dialogEnter }));
    await w3.closePage(c.P);
    const c4 = await r4Legs(w3, { S: nb.S, pid: nb.pid, tag: 'r3c', only: 'storm' });
    ok(c4.yielded && c4.yielded.yielded && c4.storm && c4.storm.n === 300 && c4.storm.writes >= 600 && c4.storm.active === 'r4row', `NEGATIVE CONTROL (r4 pre-fix): 300 focus moves while yielded write the chip ${c4.storm && c4.storm.writes} times for words that never change (the measurement sees them)`, JSON.stringify({ yielded: c4.yielded, storm: c4.storm }));
    await w3.closePage(c4.P);
  }
  await w3.close();
}
for (const c of copiesCensus(M.files.filter((f) => f.startsWith(M.dir + path.sep)), M.dir, REPO, { minCopies: 1, label: 'live-input heavy controls: ' })) ok(c.pass, c.name, c.detail);
await done();
