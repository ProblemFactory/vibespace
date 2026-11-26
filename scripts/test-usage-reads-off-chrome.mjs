#!/usr/bin/env node
// THE CONVERSATION'S «READS OFF» MARK, PICTURED (B-5279, 主开发 r4942: the conversation's strip WITH THE NEW MARK, the whole strip
// in the frame, in English and in Chinese, at a desktop width and at a phone's width, for both reasons — the reads are off; the
// settings could not be read — and the same mark after a press on it: what opens). The REAL src/lib/chat-status-bar.js and the
// REAL Settings window (src/lib/settings-ui.js over the REAL client settings store, src/lib/settings.js) bundled by esbuild into
// one page with the REAL public/style.css + chat.css, in a real headless Chrome. The page's GET /api/settings is answered by the
// REAL persistence router (src/routes/persistence.js, its own handler): over a settings.json holding the person's Off (the reads
// are off), or over a TORN one (the settings could not be read — the router's own 503 store_unread with its hold). Both reasons ×
// en / zh × 1200 px (a desk's chat window) / 390 px (a phone: mobile emulation):
//   ① THE MARK: drawn on the stopped conversation's strip in the language's words for its reason, the long sentence its title, its
//      whole face the door (data-reads-off-door on the chip and on its words)
//   ② WHOLE: the mark inside the bar, the bar inside the picture's frame, nothing behind «⋯», and its WORDS SHOWN WHOLE (never cut to
//      «…» — the first pictures at 390 px showed the icon and «…», both reasons alike); on the two rows the mark is a row of its own
//   ③ THE PRESS (a real press through THE still door, scratch.mjs stillPresser: the mark stood still, the press landed on it): Off ⇒ the Settings window opens on the row's own search, the row
//      (accounts.onDemandQuotaRefresh) drawn with its stored value, Off; held ⇒ the Settings window says the settings cannot be
//      read (the page's own held words, no row drawn: the hub's copy could not be read, nothing is offered to change)
//   RED CONTROLS: the bar built without its door (the click's door line taken out, anchored) ⇒ a press opens nothing — ③ red;
//   the bar without the mark's own row (its _arranged line taken out) ⇒ at 390 px its words are cut — ② red.
// PICTURES: USAGE_READS_OFF_PNG_DIR (default: the scratch dir) readsoff-<off|held>-<lang>-<width>.png (the strip) and
// …-pressed.png (the strip and what opened below it); each is ALSO printed into the suite's output as base64 lines
// («PICTURE <name> <i>/<n> <chunk>»), so they come back wherever the whole output is kept (the test machine's heavy part).
// No hub, no network, no sign-in, no vendor program: a stub app around the real modules; every other /api read answers {}.
// SKIPs with evidence without chrome. Scratch: the suite's own scratch root only.
import './scratch.mjs';   // FIRST (§113): the persistence routers below write data dirs — the re-home comes before any of this suite's code
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE, CHROME_QUIET, anchored, stillPresser } from './scratch.mjs';
import { checker } from './lib/check.mjs';   // THE ONE assertion helper (B-1747): the condition FIRST, a boolean; a swap throws
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome on this machine'); process.exit(0); }
const ROOT = scratch('usage-reads-off-chrome'); fs.mkdirSync(ROOT, { recursive: true });
const PNG_DIR = process.env.USAGE_READS_OFF_PNG_DIR || path.join(ROOT, 'png'); fs.mkdirSync(PNG_DIR, { recursive: true });
const ROW = 'accounts.onDemandQuotaRefresh';
const REASONS = [{ code: 'refresh-off', tag: 'off' }, { code: 'refresh-held', tag: 'held' }];
const LANGS = ['en', 'zh'];
const SIZES = [{ w: 1200, phone: false, vw: 1300, vh: 900, dsf: 1, winW: 760, winH: 600 }, { w: 390, phone: true, vw: 390, vh: 844, dsf: 2, winW: 390, winH: 660 }];
// the mark's words (src/lib/chat-status-bar.js): [its face, its title]
const WORDS = {
  'refresh-off': ['Usage reads are off', 'Usage reads are off, so this conversation continues when you resume it — press to open the setting.'],
  'refresh-held': ['Settings could not be read', 'The settings could not be read, so usage is not read and this conversation continues when you resume it — press to open Settings.'],
};
const quiet = () => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; return { done() { console.log = o; console.warn = w; } }; };

// ── the hub's two answers to GET /api/settings: the REAL persistence router's own handler over each data dir ──
const PERSIST = path.join(REPO, 'src/routes/persistence.js');
function settingsGetOf(tag, bytes) {
  const D = path.join(ROOT, 'data-' + tag); fs.mkdirSync(D, { recursive: true });
  fs.writeFileSync(path.join(D, 'settings.json'), bytes);
  delete require.cache[PERSIST];
  const P = require(PERSIST);
  const q = quiet();
  try { P.setup({ dataDir: D, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => null, getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } }); } finally { q.done(); }
  const layer = P.router.stack.find((l) => l.route && l.route.path === '/api/settings' && l.route.methods.get);
  return layer ? layer.route.stack[0].handle : null;
}
const GET_SETTINGS = {
  'refresh-off': settingsGetOf('off', J({ [ROW]: 'off' })),
  'refresh-held': settingsGetOf('held', '{"' + ROW + '": "off", "ui.th'),   // TORN: a stored Off nobody can read
};
ok(typeof GET_SETTINGS['refresh-off'] === 'function' && typeof GET_SETTINGS['refresh-held'] === 'function', 'the real persistence router hands its own GET /api/settings handler for both hubs (a stored Off; a torn file)');

// ── the page: the bar, the Settings window, the client settings store — the real modules, one bundle (and its red copy) ──
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const BAR = path.join(REPO, 'src/lib/chat-status-bar.js');
const BAR_SRC = fs.readFileSync(BAR, 'utf8');
const DOOR_LINE = "    const roDoor = e.target.closest('[data-reads-off-door]');\n";
const entry = `import { ChatStatusBar } from ${J(BAR)};
import { SettingsUI } from ${J(path.join(REPO, 'src/lib/settings-ui.js'))};
import { SettingsManager } from ${J(path.join(REPO, 'src/lib/settings.js'))};
import { SETTINGS_SCHEMA } from ${J(path.join(REPO, 'src/lib/settings-schema.js'))};
import { t } from ${J(path.join(REPO, 'src/lib/i18n.js'))};
const ROW = ${J(ROW)};
window.T = t; window.ROW_LABEL = String(SETTINGS_SCHEMA[ROW].label);
window.boot = async (reason, width) => {
  const settings = new SettingsManager();
  await settings.load();   // the page's own read of the hub's settings (GET /api/settings — the real router's answer)
  const win = document.getElementById('win');
  const app = { settings, isMobile: innerWidth <= 768, ws: { onGlobal: () => () => {}, offGlobal() {}, onStateChange() {}, offStateChange() {} },
    wm: { windows: new Map(), createWindow: () => { win.hidden = false; return { id: 'settings-1', content: win }; }, revealWindow() {} } };
  app._settingsUI = new SettingsUI(app);
  const host = document.getElementById('host'); host.innerHTML = ''; host.style.width = width + 'px';
  const ws = { send() {}, onGlobal() {}, offGlobal() {}, on() {}, off() {} };
  const sb = new ChatStatusBar(ws, 'sid-readsoff', { backend: 'claude', app, getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {}, onDesignRequest: () => {}, onJumpToAsk: () => {} });
  host.appendChild(sb.element); sb.popupContainer = host;
  // a conversation stopped at a usage wall, nothing armed (no reset known), the door refused: auto-resume's status as statusFor gives it
  sb.applyStatus({ model: 'claude-fable-5-1', contextWindow: 200000, lastUsage: { input_tokens: 76000 }, permissionMode: 'default', effort: 'high' });
  sb.setTurnState('idle');
  sb.setAutoResume({ enabled: true, armed: false, readsOff: reason });
  sb.render();
  window.sb = sb; window.app = app; return true;
};
window.mark = () => {
  const bar = window.sb.element, br = bar.getBoundingClientRect(), hr = document.getElementById('host').getBoundingClientRect();
  const chip = bar.querySelector('[data-chip="readsoff"]'), r = chip ? chip.getBoundingClientRect() : null;
  return { chip: !!chip, shown: !!r && r.width > 0 && r.height > 0, words: chip ? chip.textContent.replace(/\\s+/g, ' ').trim() : '', title: chip ? (chip.getAttribute('title') || '') : '',
    door: !!chip && chip.getAttribute('data-reads-off-door') === '1', innerDoor: !!chip && !!chip.querySelector('[data-reads-off-door]'),
    inBar: !!r && r.left >= br.left - 0.5 && r.right <= br.right + 0.5 && r.top >= br.top - 0.5 && r.bottom <= br.bottom + 0.5,
    barInHost: br.left >= hr.left - 0.5 && br.right <= hr.right + 0.5, more: !!bar.querySelector('.chat-status-more'), folded: !!(chip && chip.closest('.chat-status-folded')),
    mid: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null, bar: { x: br.left, y: br.top, w: br.width, h: br.height }, barRows: Math.round(br.height),
    wordsWhole: (() => { const w = chip ? chip.querySelector('.chat-status-words') : null; return !!w && w.scrollWidth <= w.clientWidth + 1 && w.getBoundingClientRect().right <= r.right + 0.5; })(),
    twoRows: bar.classList.contains('chat-status-two-rows'),
    ownRow: !!r && [...bar.children].filter((c) => c !== chip && c.getAttribute('data-chip') && !c.classList.contains('chat-status-rowbreak') && !c.classList.contains('chat-status-classline') && c.getBoundingClientRect().width > 0).every((c) => { const q = c.getBoundingClientRect(); return q.top >= r.bottom - 0.5 || q.bottom <= r.top + 0.5; }) };
};
window.opened = () => {
  const win = document.getElementById('win'), wr = win.getBoundingClientRect();
  const content = win.querySelector('.settings-content');
  const rows = [...win.querySelectorAll('.settings-row')].filter((x) => x.getBoundingClientRect().width > 0);
  const row = rows.find((x) => (x.querySelector('.settings-row-path')?.textContent || '').trim() === ROW || (x.querySelector('.settings-row-label')?.textContent || '').trim() === window.ROW_LABEL);
  const rr = row ? row.getBoundingClientRect() : null, sel = row ? row.querySelector('select') : null;
  const ctl = row ? row.querySelector('.settings-row-control') : null;
  const heldP = win.querySelector('.settings-held'), search = win.querySelector('.settings-search');
  return { open: !win.hidden && !!content, rows: rows.length, row: !!row, rowInWindow: !!rr && rr.top >= wr.top - 1 && rr.bottom <= wr.bottom + 1 && rr.left >= wr.left - 1 && rr.right <= wr.right + 1,
    value: sel ? sel.value : null, shown: sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : (ctl ? ctl.textContent.replace(/\\s+/g, ' ').trim() : ''),
    held: heldP ? heldP.textContent.trim() : '', search: search ? search.value : null };
};
window.__ready = true;`;
const build = (name, plugins = []) => esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(ROOT, name + '.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
await build('page');
// THE RED COPY: the bar without its door — the click's door line taken out (anchored: the line exists once, or this throws)
const noDoor = { name: 'no-door', setup(b) { b.onLoad({ filter: /chat-status-bar\.js$/ }, () => ({ contents: anchored(BAR_SRC, DOOR_LINE, '    const roDoor = null;   // RED CONTROL: the bar without its door\n', 'the bar without its door'), loader: 'js', resolveDir: path.dirname(BAR) })); } };
await build('nodoor', [noDoor]);
const OWN_ROW_LINE = "    if (!one) { const iRo = ordered.findIndex((c) => c.key === 'readsoff'); if (iRo >= 0) { const [ro] = ordered.splice(iRo, 1); ordered.unshift(ro, mark('row-break-readsoff', 'chat-status-rowbreak')); } }\n";
const noOwnRow = { name: 'no-own-row', setup(b) { b.onLoad({ filter: /chat-status-bar\.js$/ }, () => ({ contents: anchored(BAR_SRC, OWN_ROW_LINE, '', 'the bar without the mark\'s own row'), loader: 'js', resolveDir: path.dirname(BAR) })); } };
await build('noownrow', [noOwnRow]);

// ── the page servers: one per reason (its GET /api/settings = that hub's router), the bundles, the real stylesheets ──
const express = require(path.join(REPO, 'node_modules/express'));
const CSS0 = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8'), CSS1 = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8');
const servers = [];
async function pageServer(reason) {
  const web = express();
  web.get('/s0.css', (req, res) => res.type('css').send(CSS0));
  web.get('/s1.css', (req, res) => res.type('css').send(CSS1));
  web.get('/:b.js', (req, res) => (/^(page|nodoor|noownrow)$/.test(req.params.b) ? res.type('js').send(fs.readFileSync(path.join(ROOT, req.params.b + '.js'))) : res.status(404).end()));
  web.get('/api/settings', GET_SETTINGS[reason]);
  web.all(/^\/api\//, (req, res) => res.json({}));   // every other read of the page: nothing known (hides nothing)
  web.get('/', (req, res) => {
    const lang = req.query.lang === 'zh' ? 'zh' : 'en', phone = req.query.phone === '1', w = Number(req.query.w) || 1200, pad = phone ? 0 : 12;
    const winW = Number(req.query.ww) || 760, winH = Number(req.query.wh) || 600, bundle = ['nodoor', 'noownrow'].includes(req.query.b) ? req.query.b : 'page';
    res.type('html').send(`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}</script>
<link rel="stylesheet" href="/s0.css"><link rel="stylesheet" href="/s1.css">
<style>body{margin:0;background:var(--bg-root)} #stage{padding:${pad}px;width:${w + 2 * pad}px;box-sizing:border-box} #win{margin-top:12px;background:var(--bg-window);width:${winW}px;height:${winH}px;overflow:hidden;position:relative}</style>
</head><body><div id="stage"><div class="chat-view" style="display:block;position:relative;height:auto"><div id="host" style="position:relative"></div></div><div id="win" hidden></div></div><script src="/${bundle}.js"></script></body></html>`);
  });
  const port = await freePort();
  servers.push(await new Promise((r) => { const s = web.listen(port, '127.0.0.1', () => r(s)); }));
  return port;
}
const PORTS = {};
for (const R of REASONS) PORTS[R.code] = await pageServer(R.code);

// ── Chrome: its own scratch profile, no keyring, no bus, no display ──
const CDP = await freePort();
const chrome = spawn(CHROME, ['--headless=new', ...CHROME_QUIET, `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--password-store=basic', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'], detached: true, env: { ...process.env, HOME: ROOT, XDG_RUNTIME_DIR: ROOT, DISPLAY: '', DBUS_SESSION_BUS_ADDRESS: '' } });
const done = async () => {
  for (const s of servers) { try { s.close(); } catch { } }
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { }
  if (chrome.exitCode === null && chrome.signalCode === null) await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 5000); });
  for (let i = 0; i < 200; i++) { try { process.kill(-chrome.pid, 0); } catch { break; } await sleep(25); }
};
let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('SKIP: chrome exposed no CDP page target'); await done(); process.exit(0); }
const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
let seq = 0; const pend = new Map(); const pageErrors = [];
cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '?'); });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { threw: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text || '?').slice(0, 400) }; return r.result && r.result.result ? r.result.result.value : undefined; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: every chrome suite pre-sets vs-onboarded (this page is not the app, but the rule is a census)
// THE WAIT IS ON THE FACT, bounded; its expiry is a NAMED line, never a quiet false
const until = async (js, what, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await ev(js); if (v === true) return true; await sleep(50); } console.log(`    (the wait for ${what} ran out after ${ms} ms)`); return false; };
/** one page: the reason's hub, the language, the size; booted (the settings read, the bar drawn) */
async function open(reason, lang, S, bundle = 'page') {
  await send('Emulation.setDeviceMetricsOverride', { width: S.vw, height: S.vh, deviceScaleFactor: S.dsf, mobile: S.phone });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORTS[reason]}/?lang=${lang}&w=${S.w}&ww=${S.winW}&wh=${S.winH}${S.phone ? '&phone=1' : ''}&b=${bundle}` });
  if (!(await until('window.__ready === true && document.readyState === "complete"', `the page (${reason} ${lang} ${S.w})`))) return false;
  const b = await ev(`window.boot(${J(reason)}, ${S.w})`);
  if (b !== true) { console.log('    the page did not boot:', J(b)); return false; }
  await ev('document.fonts.ready.then(() => true)'); await sleep(150);
  return true;
}
const press = stillPresser({ evalJs: ev, cdp: send });   // THE still door (test-still-press ⑤): the mark measured, still, pressed, its landing checked
const MARK = '[data-chip="readsoff"]';
const pictures = [];
const shot = async (name, clip) => {
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
  const d = s.result && s.result.data;
  if (!d) { console.log(`    (no picture for ${name})`); return false; }
  const f = path.join(PNG_DIR, name); fs.writeFileSync(f, Buffer.from(d, 'base64')); pictures.push(f);
  const n = Math.ceil(d.length / 4000); for (let i = 0; i < n; i++) console.log(`    PICTURE ${name} ${i + 1}/${n} ${d.slice(i * 4000, (i + 1) * 4000)}`);
  return true;
};
const frameOf = (sel, m = 6) => ev(`(() => { const r = document.querySelector(${J(sel)}).getBoundingClientRect(); return { x: Math.max(0, r.left - ${m}), y: Math.max(0, r.top - ${m}), width: Math.min(innerWidth, r.width + ${2 * m}), height: r.height + ${2 * m} }; })()`);

try {
  for (const R of REASONS) {
    for (const lang of LANGS) {
      for (const S of SIZES) {
        const at = `${R.tag} ${lang} ${S.w} px`;
        if (!ok(await open(R.code, lang, S), `${at}: the page booted (the real bar, the real Settings window and settings store, the real stylesheets; the hub's settings read through the real router)`)) continue;
        const want = await ev(`[T(${J(WORDS[R.code][0])}), T(${J(WORDS[R.code][1])})]`);
        const m = await ev('window.mark()');
        ok(!!m && m.chip && m.shown && m.words === want[0] && m.title === want[1] && m.door && m.innerDoor && (lang === 'en' || want[0] !== WORDS[R.code][0]),
          `① ${at}: the mark is drawn in the language's words for its reason («${m && m.words}»), the long sentence its title, its whole face the door`, { m, want });
        ok(!!m && m.inBar && m.barInHost && !m.more && !m.folded && m.wordsWhole && (!m.twoRows || m.ownRow), `② ${at}: the mark inside the bar, the bar inside the frame, nothing behind «⋯», its words shown WHOLE${m && m.twoRows ? ' on a row of its own' : ''}`, m);
        const file = `readsoff-${R.tag}-${lang}-${S.w}`;
        ok(await shot(file + '.png', await frameOf('#host')), `${at}: the strip pictured whole (${file}.png)`);
        if (!m || !m.mid) continue;
        if (!ok(await press(MARK), `${at}: a real press on the mark through the still door (it stood still; the press landed on it)`, press.last)) continue;
        const opened = await until('(() => { const o = window.opened(); return o.open && (o.row || !!o.held); })()', `the Settings window after the press (${at})`);
        const o = await ev('window.opened()');
        const label = await ev('window.ROW_LABEL'), offWords = await ev(`T(${J('Off (never contact Anthropic)')})`);
        if (R.code === 'refresh-off') {
          ok(opened && o.open && o.row && o.rowInWindow && o.value === 'off' && o.shown.includes(offWords) && o.search === label,
            `③ ${at}: the press opens Settings on the row's own search («${o.search}»), the row drawn in the window with its stored value, Off («${o.shown}»)`, o);
        } else {
          ok(opened && o.open && !!o.held && o.rows === 0, `③ ${at}: the press opens Settings, which says the settings cannot be read («${o.held}») — no row drawn, nothing offered to change`, o);
        }
        ok(await shot(file + '-pressed.png', await frameOf('#stage', 0)), `${at}: the press pictured — the strip and what opened (${file}-pressed.png)`);
      }
    }
  }
  // RED CONTROL — the bar without its door: a press on the same mark opens nothing; the real bar (above) opened it
  const S = SIZES[0];
  if (await open('refresh-off', 'en', S, 'nodoor')) {
    const m = await ev('window.mark()');
    const landed = !!m && !!m.mid && (await press(MARK));
    await sleep(800);
    const o = await ev('window.opened()');
    ok(landed && !!m && m.chip && !o.open && !o.row, 'RED CONTROL: the bar built without its door (the click\'s door line taken out) — a press that LANDED on the same mark opens nothing, so ③ goes red', { m: m && m.words, landed, o });
  } else ok(false, 'the red control\'s page booted');
  // RED CONTROL — the bar without the mark's own row (its _arranged line taken out): at 390 px its words are cut again
  if (await open('refresh-off', 'en', SIZES[1], 'noownrow')) {
    const m = await ev('window.mark()');
    ok(!!m && m.chip && m.twoRows && (!m.wordsWhole || !m.ownRow), 'RED CONTROL: the bar without the mark\'s own row (its _arranged line taken out) — at 390 px the words are cut or share a row, so ② goes red', m);
  } else ok(false, 'the own-row red control\'s page booted');
  ok(pageErrors.length === 0, `no page error on the way (${pageErrors.length})`, pageErrors.slice(0, 3));
  console.log(`  pictures: ${PNG_DIR} (${pictures.length} PNGs)`);
} finally { try { cdp.close(); } catch { } await done(); }
report();
