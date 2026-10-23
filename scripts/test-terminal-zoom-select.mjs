#!/usr/bin/env node
// TERMINAL SELECTION UNDER BODY ZOOM — the real thing (2.369.118, userW
// inc-mu92zsgw-6c9y "the login terminal copies the wrong lines"). Headless
// chrome loads the SAME xterm build VibeSpace bundles (node_modules/@xterm) on
// a standalone page, applies `document.body.style.zoom` exactly like
// applyUiPrefs(), and drags the mouse through CDP (real input events, not
// synthetic DOM events — xterm's mouse path is what is under test):
//   • the PRE-FIX page (no counter-zoom): a drag at the visual row 20 selects
//     row 25 at zoom 1.25 and row 16 at zoom 0.8 — the incident;
//   • the FIXED page (container zoom 1/scale + font × scale, what
//     TerminalSession does): row 20 at every zoom, and the visual size of the
//     screen is unchanged.
// SKIPs (exit 0, with its reason) when no chrome is installed.
// Run: node scripts/test-terminal-zoom-select.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const [CDP_PORT] = await freePorts(1);
const dir = scratch('term-zoom');
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + JSON.stringify(e) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const X = path.join(repo, 'node_modules/@xterm/xterm');
const utils = fs.readFileSync(path.join(repo, 'src/lib/utils.js'), 'utf8');
const COUNTER_ZOOM = (utils.match(/export const COUNTER_ZOOM = '([^']+)';/) || [])[1];
check('utils.js exports the counter-zoom rule', COUNTER_ZOOM === 'calc(1 / var(--ui-scale, 1))', COUNTER_ZOOM);
fs.writeFileSync(path.join(dir, 'page.html'), `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${X}/css/xterm.css"><script src="file://${X}/lib/xterm.js"></script>
<style>body{margin:0;background:#111} #t{position:absolute;left:40px;top:60px}</style></head><body><div id="t"></div>
<script>
const term = new Terminal({rows:30, cols:80, lineHeight:1.15, fontSize:14, allowProposedApi:true, fontFamily:'monospace'});
term.open(document.getElementById('t'));
for (let i=0;i<30;i++) term.write('row'+String(i).padStart(2,'0')+' '+'x'.repeat(60)+(i<29?'\\r\\n':''));
// mode 'raw' = today's page under body zoom; 'fixed' = what TerminalSession does since 2.369.118
window.setup = (zoom, mode) => {
  document.body.style.zoom = zoom === 1 ? '' : String(zoom);
  document.documentElement.style.setProperty('--ui-scale', String(zoom));
  const c = document.getElementById('t');
  c.style.zoom = mode === 'fixed' ? ${JSON.stringify(COUNTER_ZOOM)} : '';
  term.options.fontSize = mode === 'fixed' ? Math.round(14 * zoom * 100) / 100 : 14;
  term.clearSelection();
  return new Promise((r) => setTimeout(() => {
    const s = document.querySelector('.xterm-screen').getBoundingClientRect();
    const cw = s.width / 80, ch = s.height / 30;
    r(JSON.stringify({ screen: [s.width, s.height], x0: s.left + cw * 5.5, y: s.top + ch * 20.5, x1: s.left + cw * 15.5 }));
  }, 150));
};
window.result = () => JSON.stringify({ pos: term.getSelectionPosition() || null, text: term.getSelection() });
</script></body></html>`);

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1600,1200', `--user-data-dir=${path.join(dir, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); target = list.find((t) => t.type === 'page'); } catch { await sleep(250); } }
if (!target) { console.log('SKIP: chrome exposed no page target'); process.exit(0); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const mouse = async (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const drag = async (zoom, mode) => {
  const g = JSON.parse(await evalJs(`setup(${zoom}, ${JSON.stringify(mode)})`));
  await mouse('mouseMoved', g.x0, g.y);
  await mouse('mousePressed', g.x0, g.y, { buttons: 1 });
  await mouse('mouseMoved', g.x1, g.y, { buttons: 1 });
  await mouse('mouseReleased', g.x1, g.y);
  await sleep(60);
  const r = JSON.parse(await evalJs('result()'));
  return { screen: g.screen.map((v) => Math.round(v)), row: r.pos ? r.pos.start.y : null, col: r.pos ? r.pos.start.x : null, text: r.text };
};

try {
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false }); // the 1.25 page is 843×675 from (50,75): the headless default 800×600 clipped it
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: 'file://' + path.join(dir, 'page.html') });
  await sleep(1200);
  await evalJs('typeof term === "object" && term.rows === 30 ? true : Promise.reject(new Error("no terminal"))');
  const base = await drag(1, 'raw');
  check('zoom 1 (control): a drag at the visual row 20 selects row 20', base.row === 20, base);
  for (const z of [1.25, 0.8]) {
    const raw = await drag(z, 'raw');
    check(`zoom ${z}, PRE-FIX page: the selection lands on row ${Math.round(20.5 * z)} — the incident, not row 20`, raw.row !== 20 && Math.abs(raw.row - 20.5 * z) <= 1, raw);
    const fixed = await drag(z, 'fixed');
    check(`zoom ${z}, FIXED page (counter-zoom + font × scale): the selection lands on row 20`, fixed.row === 20 && /^ ?x{9,11}$/.test(fixed.text), fixed);
    check(`zoom ${z}: the fixed screen is the same visual size as the raw one (±3 %)`, Math.abs(fixed.screen[0] - raw.screen[0]) / raw.screen[0] < 0.03 && Math.abs(fixed.screen[1] - raw.screen[1]) / raw.screen[1] < 0.03, { raw: raw.screen, fixed: fixed.screen });
  }

  // lane door-signin-card (D3 / C2) + lane signin-card-real-screen: the terminal's links open through the product in a
  // NEW TAB, never xterm's default native "WARNING: This link could potentially be dangerous" confirm. door-signin-card
  // gave the WebLinksAddon (plain-text links) a handler — but the CLI's sign-in URL is an OSC-8 HYPERLINK, which goes
  // through xterm's OWN `linkHandler` option (its default IS that confirm): the naive testers still met it on 2.369.344
  // in the «Log in to Claude Code» terminal. ONE opener (src/lib/terminal-links.js) for both roads, run here for real.
  {
    // THE CENSUS: every xterm the client builds passes the opener on both roads
    const libDir = path.join(repo, 'src/lib');
    const sites = { term: [], addon: [] };
    for (const f of fs.readdirSync(libDir).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(libDir, f), 'utf8').replace(/^\s*\/\/.*$/gm, ''); // code, not the comments naming the rule
      for (const m of src.matchAll(/new Terminal\(\{[\s\S]*?\}\);/g)) sites.term.push({ f, ok: /linkHandler: TERMINAL_LINK_HANDLER\b/.test(m[0]) });
      for (const m of src.matchAll(/new WebLinksAddon\(([^\n]*)/g)) sites.addon.push({ f, ok: /^\(event, uri\) => openTerminalLink\(uri\)\)/.test(m[1]) });
    }
    check(`census: every \`new Terminal(\` in src/lib passes linkHandler: TERMINAL_LINK_HANDLER (${sites.term.map((x) => x.f).join(', ')})`, sites.term.length >= 2 && sites.term.every((x) => x.ok) && sites.term.some((x) => x.f === 'terminal.js') && sites.term.some((x) => x.f === 'raw-screen.js'), sites.term);
    check(`census: every \`new WebLinksAddon(\` in src/lib passes openTerminalLink (${sites.addon.map((x) => x.f).join(', ')})`, sites.addon.length >= 2 && sites.addon.every((x) => x.ok), sites.addon);
    const linksSrc = fs.readFileSync(path.join(libDir, 'terminal-links.js'), 'utf8');
    const openerSrc = (linksSrc.match(/export function openTerminalLink\(uri\) \{[\s\S]*?\n\}/) || [])[0];
    check('terminal-links.js: openTerminalLink window.open()s http(s) in a new tab, noopener', !!openerSrc && /window\.open\(u, '_blank', 'noopener,noreferrer'\)/.test(openerSrc) && /https\?/.test(openerSrc), openerSrc);
    const opener = openerSrc.replace('export function', 'function');
    const WL = path.join(repo, 'node_modules/@xterm/addon-web-links/lib/addon-web-links.js');
    await evalJs(`new Promise((res,rej)=>{const s=document.createElement('script');s.src=${JSON.stringify('file://' + WL)};s.onload=()=>res(true);s.onerror=()=>rej(new Error('addon load failed'));document.head.appendChild(s);})`);
    await evalJs('setup(1, "raw")');
    const R = JSON.parse(await evalJs(`(() => {
      ${opener}
      const W = window.WebLinksAddon && (window.WebLinksAddon.WebLinksAddon || window.WebLinksAddon);
      window.__opens = []; window.__confirms = 0;
      window.open = (...a) => { window.__opens.push(a); return { opener: null, location: {} }; };
      window.confirm = () => { window.__confirms++; return false; };
      const H = (event, uri) => openTerminalLink(uri);
      const host = document.createElement('div'); document.body.appendChild(host);
      const term2 = new Terminal({ rows: 4, cols: 80 }); term2.open(host);
      let ctorOk = true; try { term2.loadAddon(new W(H)); } catch (e) { ctorOk = false; }
      H({ preventDefault(){} }, 'https://claude.com/oauth/authorize?code=true');
      H({ preventDefault(){} }, 'ftp://evil.example/x');
      const out = JSON.stringify({ ctorOk, opens: window.__opens.slice(), confirms: window.__confirms });
      term2.dispose(); host.remove(); window.__opens = [];
      return out;
    })()`));
    check('the real WebLinksAddon accepts the product opener', R.ctorOk, R);
    check('a plain-text http(s) link opens in a NEW TAB via window.open, with no native confirm', R.opens.length === 1 && R.opens[0][0] === 'https://claude.com/oauth/authorize?code=true' && R.opens[0][1] === '_blank' && /noopener/.test(R.opens[0][2] || '') && R.confirms === 0, R);
    check('a non-http(s) link is ignored (never auto-opened)', R.opens.length === 1, R);
    // THE OSC-8 ROAD, clicked for real (CDP mouse): the CLI's own hyperlink — with the product's linkHandler, and the
    // CONTROL without it (xterm's default = the native confirm the testers met)
    const OSC_URL = 'https://claude.com/cai/oauth/authorize?code=true&state=osc8';
    const clickOsc = async (withHandler) => {
      const g = JSON.parse(await evalJs(`(() => {
        ${opener}
        window.__opens = []; window.__confirms = 0;
        const host = document.createElement('div'); host.id = 'osc'; host.style.cssText = 'position:absolute;left:40px;top:700px'; document.body.appendChild(host);
        const t3 = new Terminal(Object.assign({ rows: 3, cols: 80, fontSize: 14, fontFamily: 'monospace' }, ${withHandler} ? { linkHandler: { activate: (e, uri) => openTerminalLink(uri), allowNonHttpProtocols: false } } : {}));
        t3.open(host); window.__t3 = t3;
        t3.write('visit: \\x1b]8;;${OSC_URL}\\x07CLICKME-LINK-TEXT\\x1b]8;;\\x07\\r\\n');
        return new Promise((r) => setTimeout(() => { const s = host.querySelector('.xterm-screen').getBoundingClientRect(); const cw = s.width / 80, ch = s.height / 3; r(JSON.stringify({ x: s.left + cw * 12.5, y: s.top + ch * 0.5 })); }, 200));
      })()`));
      await mouse('mouseMoved', g.x - 2, g.y); await sleep(80);
      await mouse('mouseMoved', g.x, g.y); await sleep(120);
      await mouse('mousePressed', g.x, g.y, { buttons: 1 }); await mouse('mouseReleased', g.x, g.y); await sleep(150);
      return JSON.parse(await evalJs(`(() => { const o = JSON.stringify({ opens: window.__opens.slice(), confirms: window.__confirms }); window.__t3.dispose(); document.getElementById('osc').remove(); return o; })()`));
    };
    const ctl = await clickOsc(false);
    check('CONTROL (the 2.369.344 terminal): an OSC-8 link clicked with no linkHandler → xterm\'s native «dangerous link» confirm', ctl.confirms === 1 && ctl.opens.length === 0, ctl);
    const fixed = await clickOsc(true);
    check('an OSC-8 link (the CLI\'s sign-in URL) clicked with the product\'s linkHandler → a NEW TAB, no native confirm', fixed.confirms === 0 && fixed.opens.length === 1 && fixed.opens[0][0] === OSC_URL && fixed.opens[0][1] === '_blank' && /noopener/.test(fixed.opens[0][2] || ''), fixed);
  }
} catch (e) { failed++; console.error('  ✗ harness error: ' + e.message); }
ws.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
