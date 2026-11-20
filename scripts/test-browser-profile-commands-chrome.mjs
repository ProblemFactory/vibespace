#!/usr/bin/env node
// B-acb9 r226 — A RAISED DIALOG TELLS EVERY CALLER THE FORM's WORD, through the REAL shell: one headless Chrome over esbuild bundles
// of the real src/lib/browser-profile-commands.js, the real «Proxy…» / «Check the exit…» dialogs and the real createModalShell
// (utils.js), loopback stand-in routes recording what a save posts. Two callers open the SAME profile's dialog (the second press
// RAISES the live form — the road the fast suite's stand-ins never ran):
//   ① the exit dialog, two callers, the person presses Forget: ONE form drawn, ONE post, BOTH callers hear 'done', once each
//   ② the exit dialog, two callers, the person presses Cancel: nothing posted, BOTH hear 'cancelled'
//   ③ the proxy dialog, two callers, the person presses Save (no proxy): ONE PATCH, BOTH hear 'done'; then two callers + Cancel: both 'cancelled'
//   RED CONTROL (its plant proved first, through anchored()): a bundle whose exit dialog lets a RAISED caller read only its own call
//   (the pre-cure shape) — after the same Forget the second caller hears 'cancelled': ① is red on it
// Every leg prints the facts it judges; every wait is for what happened (the form drawn / gone, the post landed), bounded, red by name.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, anchored, ONBOARDED_SOURCE } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const express = require(path.join(repo, 'node_modules/express'));
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const WebSocket = require(path.join(repo, 'node_modules/ws'));
const CSS = fs.readFileSync(path.join(repo, 'public/style.css'), 'utf8');
const root = scratch('bpc-chrome'), dir = path.join(root, 'web');
fs.mkdirSync(dir, { recursive: true });
const J = (p) => JSON.stringify(path.join(repo, p));
const PID = 'bp-0000abcd';
const ROW = { id: PID, label: 'Shop', proxy: '', egress: { publicIp: '203.0.113.9', country: 'JP', timezone: 'Asia/Tokyo', checkedAt: 1, source: 'typed' } };
const entry = `import { registerBrowserProfileCommands } from ${J('src/lib/browser-profile-commands.js')};
import { runCommand } from ${J('src/lib/contributions.js')};
import { openProxyDialog } from ${J('src/lib/browser-proxy-dialog.js')};
import { openExitDialog } from ${J('src/lib/browser-exit-dialog.js')};
import { fetchJson } from ${J('src/lib/utils.js')};
registerBrowserProfileCommands({ openProxy: openProxyDialog, openExit: openExitDialog, titles: { proxy: () => 'Proxy…', exit: () => 'Check the exit…' },
  rowOf: async (id) => { const d = await fetchJson('/api/browser/profiles'); if (!d || d.error || !Array.isArray(d.profiles)) throw new Error('no reply'); return d.profiles.find((x) => x && x.id === id) || null; },
  notFound: () => { }, noReply: () => { } });
const app = { settings: { get: () => '', serverValue: () => '' } };   // the exit dialog reads the check address from the page's settings
window.__heard = [];
window.__run = (id, tag) => runCommand(id, { profileId: ${JSON.stringify(PID)}, app, onDone: (w) => window.__heard.push([tag, w]) });
window.__ready = true;`;
// THE RED CONTROL's plant: the exit dialog's hook reads the word only for a caller that opened the form itself (a raised caller: its
// own call, never the form's) — the pre-cure shape, through THE one door
const EXIT = path.join(repo, 'src/lib/browser-exit-dialog.js');
const exitSrc = fs.readFileSync(EXIT, 'utf8');
const HOOK = "onClose?.(sh && SAVED.has(sh.overlay) ? 'done' : 'cancelled')";
const exitMut = anchored(exitSrc, HOOK, "onClose?.(sh && !sh.raised && SAVED.has(sh.overlay) ? 'done' : 'cancelled')", 'a raised caller reads only its own call');
ok(exitMut !== exitSrc && !exitMut.includes(HOOK) && exitMut.includes('!sh.raised && SAVED.has(sh.overlay)'), 'CONTROL setup: the plant is where it claims — the form\'s word read by the raised caller is gone from the copy');
const bundle = async (out, mut) => esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, out), loader: { '.css': 'empty' }, logLevel: 'error',
  plugins: mut ? [{ name: 'exit-mutant', setup(b) { b.onLoad({ filter: /browser-exit-dialog\.js$/ }, () => ({ contents: exitMut, loader: 'js', resolveDir: path.dirname(EXIT) })); } }] : [] });
await bundle('ui.js', false); await bundle('ui-mut.js', true);
const posted = [];
const web = express();
web.use(express.json());
web.get('/style.css', (req, res) => res.type('css').send(CSS));
web.get('/ui.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(dir, 'ui.js'))));
web.get('/ui-mut.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(dir, 'ui-mut.js'))));
web.get('/api/browser/profiles', (req, res) => res.json({ profiles: [ROW] }));
web.post('/api/browser/profiles/:id/egress', (req, res) => { posted.push({ url: req.url, body: req.body }); res.json({ ok: true, profile: { ...ROW, egress: null } }); });
web.patch('/api/browser/profiles/:id', (req, res) => { posted.push({ url: req.url, body: req.body, method: 'PATCH' }); res.json({ ok: true, profile: ROW, changed: {} }); });
web.all(/^\/api\//, (req, res) => res.json({}));
web.get('/', (req, res) => res.type('html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><script src="/${req.query.mut ? 'ui-mut' : 'ui'}.js"></script></body></html>`));
const PORT = await freePort();
const srv = await new Promise((r) => { const s = web.listen(PORT, '127.0.0.1', () => r(s)); });
const CDP_PORT = await freePort();
const chromeDir = scratch('bpc-chrome-profile');
const env = { ...process.env }; delete env.DBUS_SESSION_BUS_ADDRESS;   // no keyring ask (a headless Chrome waits on it at every navigation)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--password-store=basic', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { } try { srv.close(); } catch { } for (const d of [chromeDir, root]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(query = '') {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });   // §47: every chrome suite pre-sets vs-onboarded before its navigate
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  // a wait is for WHAT HAPPENED: an expression polled until truthy, bounded; at the bound it is null (the leg is red by its name)
  const until = async (expr, looks = 160) => { for (let i = 0; i < looks; i++) { const v = await ev(expr).catch(() => null); if (v) return v; await sleep(50); } return null; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/${query}` });
  const ready = await until('window.__ready === true');
  return { ev, until, ready, close: () => { try { ws.close(); } catch { } } };
}
const Q = (s) => JSON.stringify(s);
const forms = (cls) => `document.querySelectorAll(${Q('.' + cls)}).length`;
// two callers on ONE profile's dialog: the first draws the form, the second RAISES it — ONE form, never two
async function twoCallers(p, id, cls, tags) {
  // each press's run resolves once ITS open has happened (the row read, the dialog drawn or raised): awaited, never slept on
  const r1 = await p.ev(`window.__run(${Q(id)}, ${Q(tags[0])})`);
  const first = await p.until(`${forms(cls)} === 1`);
  const r2 = await p.ev(`window.__run(${Q(id)}, ${Q(tags[1])})`);
  const n = await p.ev(forms(cls));
  return { opened: [r1, r2], first: !!first, forms: n };
}
const heardOf = (p, tags) => p.ev(`window.__heard.filter(([t]) => ${Q(tags)}.includes(t))`);

console.log('① the exit dialog, two callers, the person presses Forget');
{
  const p = await page();
  ok(p.ready === true, 'the page is ready (the real bundle loaded)');
  const t = await twoCallers(p, 'browser.profileExitCheck', 'bexit-dialog', ['E1', 'E2']);
  const n0 = posted.length;
  await p.ev(`(document.querySelector('.bexit-dialog .bexit-forget').click(), true)`);
  const gone = await p.until(`${forms('bexit-dialog')} === 0 && window.__heard.filter(([t]) => t === 'E1' || t === 'E2').length === 2`);
  const heard = await heardOf(p, ['E1', 'E2']), post = posted.slice(n0);
  ok(t.opened.every((x) => x === true) && t.first && t.forms === 1 && !!gone && post.length === 1 && post[0].body && post[0].body.clear === true && heard.length === 2 && heard.every(([, w]) => w === 'done') && new Set(heard.map(([t]) => t)).size === 2,
    'ONE form for two callers; the person\'s Forget posts ONCE; BOTH callers hear \'done\', once each — the raised second caller included', { twoCallers: t, posted: post, heard });
  p.close();
}

console.log('② the exit dialog, two callers, the person presses Cancel');
{
  const p = await page();
  const t = await twoCallers(p, 'browser.profileExitCheck', 'bexit-dialog', ['C1', 'C2']);
  const n0 = posted.length;
  await p.ev(`(document.querySelector('.bexit-dialog .bnew-cancel').click(), true)`);
  const gone = await p.until(`${forms('bexit-dialog')} === 0 && window.__heard.filter(([t]) => t === 'C1' || t === 'C2').length === 2`);
  const heard = await heardOf(p, ['C1', 'C2']);
  ok(t.forms === 1 && !!gone && posted.length === n0 && heard.length === 2 && heard.every(([, w]) => w === 'cancelled'), 'nothing posted; BOTH callers hear \'cancelled\'', { twoCallers: t, posted: posted.length - n0, heard });
  p.close();
}

console.log('③ the proxy dialog, two callers: Save (no proxy), then Cancel');
{
  const p = await page();
  const t = await twoCallers(p, 'browser.profileProxy', 'bproxy-dialog', ['P1', 'P2']);
  const n0 = posted.length;
  await p.ev(`(document.querySelector('.bproxy-dialog .bproxy-save').click(), true)`);
  const gone = await p.until(`${forms('bproxy-dialog')} === 0 && window.__heard.filter(([t]) => t === 'P1' || t === 'P2').length === 2`);
  const heard = await heardOf(p, ['P1', 'P2']), post = posted.slice(n0);
  ok(t.forms === 1 && !!gone && post.length === 1 && post[0].method === 'PATCH' && heard.length === 2 && heard.every(([, w]) => w === 'done'), 'ONE form; the person\'s Save sends ONE PATCH; BOTH callers hear \'done\'', { twoCallers: t, posted: post, heard });
  const t2 = await twoCallers(p, 'browser.profileProxy', 'bproxy-dialog', ['Q1', 'Q2']);
  await p.ev(`(document.querySelector('.bproxy-dialog .bnew-cancel').click(), true)`);
  const gone2 = await p.until(`${forms('bproxy-dialog')} === 0 && window.__heard.filter(([t]) => t === 'Q1' || t === 'Q2').length === 2`);
  const heard2 = await heardOf(p, ['Q1', 'Q2']);
  ok(t2.forms === 1 && !!gone2 && heard2.length === 2 && heard2.every(([, w]) => w === 'cancelled'), '…and two callers + Cancel: BOTH hear \'cancelled\'', { twoCallers: t2, heard: heard2 });
  p.close();
}

console.log('RED CONTROL — a raised caller that reads only its own call');
{
  const p = await page('?mut=1');
  const t = await twoCallers(p, 'browser.profileExitCheck', 'bexit-dialog', ['M1', 'M2']);
  await p.ev(`(document.querySelector('.bexit-dialog .bexit-forget').click(), true)`);
  await p.until(`${forms('bexit-dialog')} === 0 && window.__heard.filter(([t]) => t === 'M1' || t === 'M2').length === 2`);
  const heard = await heardOf(p, ['M1', 'M2']);
  const word = Object.fromEntries(heard);
  ok(t.forms === 1 && word.M1 === 'done' && word.M2 === 'cancelled', 'CONTROL: that copy tells the RAISED caller \'cancelled\' after the person\'s Forget — ① is red on it', { twoCallers: t, heard });
  p.close();
}
report();
