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
  Object.assign(env, { PATH: `${BIN}:${path.dirname(REAL_AB)}:${path.dirname(process.execPath)}:/usr/bin:/bin`, CLAUDE_CMD: path.join(BIN, 'claude'), HOME, XDG_RUNTIME_DIR: XDG, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AT_BRIDGE: '1', MESA_SHADER_CACHE_DISABLE: 'true', DBUS_SESSION_BUS_ADDRESS: 'disabled:' }); // no accessibility bridge (its socket dir came back under the scratch XDG root after the removal), no session bus, no shader cache written under the scratch roots
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
    return { sessionId: created.sessionId, vb };
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
  const tab2Id = await W.newWindow(`http://127.0.0.1:${PORT}/api/version`);
  const clip = await cdpPage(outer.port, (x) => x.id === tab2Id);
  await clip.call('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: `http://127.0.0.1:${PORT}` });
  await clip.call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await sleep(300);
  W.clipLog = [];
  W.setClipboard = async (text) => { const r = await clip.call('Runtime.evaluate', { expression: `navigator.clipboard.writeText(${JSON.stringify(text)}).then(() => navigator.clipboard.readText()).then((t) => ({ t }), (e) => ({ err: String(e && e.message) }))`, awaitPromise: true, returnByValue: true, userGesture: true }); const v = r.result && r.result.result ? r.result.result.value : r; if (!(v && v.t === text)) W.clipLog.push({ set: text.slice(0, 20), v: JSON.stringify(v).slice(0, 200) }); return !!(v && v.t === text); };
  W.readClipboard = async () => { const r = await clip.call('Runtime.evaluate', { expression: 'navigator.clipboard.readText().then((t) => ({ t }), (e) => ({ err: String(e && e.message) }))', awaitPromise: true, returnByValue: true, userGesture: true }); const v = r.result && r.result.result ? r.result.result.value : null; if (!v || v.err !== undefined) { W.clipLog.push({ read: JSON.stringify(v || r).slice(0, 200) }); return null; } return v.t; };
  /** A viewer PAGE of the app (its own target in its own window): `mac` emulates a Mac viewer; `lang` its language. */
  W.page = async ({ mac = false, lang = 'en', size = [1920, 963], app = W.APP } = {}) => {
    const createdId = await W.newWindow('about:blank');
    const P = await cdpPage(outer.port, (x) => x.id === createdId);
    await P.call('Page.enable'); await P.call('Runtime.enable');
    if (mac) await P.call('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', platform: 'MacIntel', userAgentMetadata: { brands: [{ brand: 'Google Chrome', version: '152' }], fullVersion: '152.0.0.0', platform: 'macOS', platformVersion: '14.0.0', architecture: 'arm', model: '', mobile: false } });
    await P.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await P.call('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await P.call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
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
const S2 = await wd.createSession('eph-chat');
await S2.vb(['open', wd.innerUrl('eph')]);
await wd.innerUntil('eph', () => true, 25000);
if (want('eph')) kinds.push({ label: 'the conversation\'s own browser', S: S2, n: 'eph', profileId: null });
const S3 = await wd.createSession('med-chat');
const medNew = await S3.vb(['new', 'medshop', '--sharing', 'instance']); await S3.vb(['use', 'medshop']);
const medId = (/\((bp-[0-9a-f]{8})\)/.exec(medNew.stdout + medNew.stderr) || [])[1] || null;
const medOpen = await S3.vb(['open', wd.innerUrl('med')]);
const medUp = !!(await wd.innerUntil('med', () => true, 45000));
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
  Es.close();
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
for (const c of copiesCensus(M.files.filter((f) => f.startsWith(M.dir + path.sep)), M.dir, REPO, { minCopies: 1, label: 'live-input heavy controls: ' })) ok(c.pass, c.name, c.detail);
await done();
