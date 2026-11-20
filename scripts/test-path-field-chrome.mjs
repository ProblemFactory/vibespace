#!/usr/bin/env node
// THE PATH FIELD IN A REAL PAGE (lane path-field — L1 of the New Session train, POC v2.2). Real Chrome over CDP, real
// keys / presses / IME composition, the REAL component (src/lib/path-field.js bundled from this tree, public/style.css)
// against the REAL routes (src/routes/files.js in this process over a temp HOME shaped like the POC's machine) and a
// FAKE Mac behind the host rung (the real HostManager, its ssh rung run here under the Mac's HOME, uname Darwin, mdls).
// The page speaks zh (the owner's language). Legs:
//   ① the list never pops by itself (a programmatic focus on open); a press, typing, ↓ and a Tab INTO the field open it
//   ② fuzzy over the whole path: `ir q3` → Q3-董事会材料 first with its rule chip; ↓ Enter picks it → the ~/ form, the
//      commit (how 'pick', the absolute path)
//   ③ Tab completes INTO a folder (~/work/pa → ~/work/payments/ and what is inside it)
//   ④ Esc with the list open closes it and is defaultPrevented (a dialog's own Esc stays); closed, Esc is not touched
//   ⑤ BLUR COMMITS a relative path (resolved against the selected Task Group's folder, the line says which base)
//   ⑥ 「未生效：…」 — a few letters with no path, left: the text stays, the reason is said; 「用第一名」 commits the best
//   ⑦ the commit waits past pointer-up: a press on another button — ITS click lands first, then the commit
//   ⑧ «不存在 — 创建？»: a missing folder says so and is NOT taken until ticked; ticked ⇒ committed, ensure() makes it on
//      disk; its parent missing ⇒ said AND its tick offered, the create makes both levels (read back from the disk)
//   ⑧c THE TICK BELONGS TO THE PATH IT WAS GIVEN FOR (B-f3a1; the law and its RED CONTROLS: test-path-field-model ④): a tick given to
//      one missing folder is GONE when the text moves — a set from outside (a commit then takes nothing), typing more and back, a
//      refresh after a Task Group change (a relative text, other bases), a chip that is not «new» (committed, no create)
//   ⑨ two Task Groups + a name ⇒ ② = one <group folder>/<name> per group in selection order + ~/<name>; the chips row too
//   ⑨b setDerived with a STALL PLACED in the listing's reply (B-ckpt61 LAW 1): while held, «正在问这台机器…» — no 不存在, no
//      raw path, no tick; released, the folder with its facts · ⑨c the home's first read fails once (LAW 2): never «missing»,
//      and a later ask reads the home again
//   ⑩ a remote machine (my-mac) gets the same recommendations computed for it: the IR folder probed there, the one
//      declared for it, compute-deal greyed «在 my-mac 上不存在 · 新建？», its recents with counts
//   ⑪ THE PICKER: the folder button opens a dialog over the dialog — the groups' folders pinned with badges, home's tree
//      (never ~/vibespace), a preview with files / sizes, «新建文件夹» inline (made on disk), «选这个文件夹» fills the ~/
//      form and commits (how 'picker'); reopened it remembers its node; opened on a search it uses it
//   ⑫ IME: a composing Enter (keyCode 229) never picks; the composed word (合同) finds ~/work/contracts by its link alias
//   ⑬ never offered unasked: ~/ lists no ~/vibespace (the checkout) and no dot-folder; typed, it resolves
//   ⑭ the phone: the list sits in the flow (not floating)
//   ⑮ 0 page errors
// Run: node scripts/test-path-field-chrome.mjs   (SKIPs without chrome)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, ONBOARDED_SOURCE, CHROME_QUIET } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
let bad = 0, n = 0;
const ok = (name, cond, got) => { n++; if (!cond) bad++; console.log(`${cond ? 'ok ' : 'BAD'} ${name}${cond ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 700)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-path-field-'));
const PROFILE = path.join(TMP, 'chrome-profile');
let chrome = null;
const cleanup = () => { try { chrome?.kill('SIGKILL'); } catch { } try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

/* ── the machine (here): the POC's shape on a real disk ── */
const HOME = path.join(TMP, 'home', 'me');
const mk = (root, rel, files = 0) => { const d = path.join(root, rel); fs.mkdirSync(d, { recursive: true }); for (let i = 0; i < files; i++) fs.writeFileSync(path.join(d, `file-${i}.md`), 'x'.repeat(100 * (i + 1))); return d; };
for (const [d, f] of [['work/investor-relations/Q3-董事会材料', 5], ['work/investor-relations/会议纪要', 3], ['work/investor-relations/草稿', 2], ['work/investor-relations/共享资料', 4], ['work/compute-deal/条款版本', 2], ['work/contracts', 6], ['work/payments/发票', 2], ['work/payments/2026-10', 1], ['work/weekly-admin', 3], ['work/草稿', 2], ['Downloads', 3], ['.config/x', 1]]) mk(HOME, d, f);
fs.writeFileSync(path.join(HOME, 'work/payments/付款审批-10月.xlsx'), 'x'.repeat(27000));
fs.symlinkSync(path.join(HOME, 'work/contracts'), path.join(HOME, '合同'));
mk(HOME, 'vibespace/src', 40); fs.writeFileSync(path.join(HOME, 'vibespace/package.json'), JSON.stringify({ name: 'vibespace' }));
/* the Mac */
const MAC = path.join(TMP, 'mac', 'Users', 'me');
for (const d of ['Projects/website/content', 'work/investor-relations/共享资料', 'Documents/算力合同', 'Downloads', 'Desktop']) mk(MAC, d, 1);
const BIN = path.join(TMP, 'fakebin'); fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'uname'), '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'mdls'), '#!/bin/sh\nfor a; do p="$a"; done\ncase "${p##*/}" in Documents) echo 文稿;; Downloads) echo 下载;; *) echo "${p##*/}";; esac\n', { mode: 0o755 });
process.env.HOME = HOME;

/* ── the hub: the real files router + the host rung's two routes (exit-routes' shape) over the fake Mac ── */
const PC = require('../src/path-candidates.js');
const express = require('express');
const { HostManager } = require('../src/hosts.js');
const hm = new HostManager({ dataDir: path.join(TMP, 'hub-data') });
hm._state.hosts.push({ id: 'h-mac', name: 'my-mac', host: 'mac.example.test', user: 'me', port: 22, transport: 'ssh' });
hm._ssh = (h, cmd) => new Promise((resolve, reject) => execFile('sh', ['-c', cmd], { env: { HOME: MAC, PATH: `${BIN}:/usr/bin:/bin` }, timeout: 8000, maxBuffer: 8 << 20 }, (e, out) => (e ? reject(e) : resolve(out))));
const jsonList = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const app = express();
app.use(express.json());
// B-ckpt61 (lane bl-tests-a): the suite's OWN server can HOLD a reply on a path until the leg releases it (a stall PLACED in the
// listing's reply — never load), and can FAIL the home's next read (a 500 with no home)
const HOLD = new Map();
let homeFailsLeft = 0;
const partialFor = { path: '', left: 0, failLeft: 0 };   // ⑨d: this path's next dir-complete replies are PARTIAL (the machine's budget ran out, nothing listed), then FAILED (a 500, no listing)
app.use((req, res, next) => {
  if (req.path === '/api/dir-complete' && partialFor.left > 0 && String(req.query.path || '') === partialFor.path) { partialFor.left--; res.json({ listing: { home: HOME, machine: null, dirs: {}, links: {}, localized: {}, mounts: [], nondirs: {} }, partial: true, took: 0 }); return; }
  if (req.path === '/api/dir-complete' && partialFor.failLeft > 0 && String(req.query.path || '') === partialFor.path) { partialFor.failLeft--; res.status(500).json({ error: 'the listing failed (the leg\'s plant)' }); return; }
  if (req.path === '/api/home' && homeFailsLeft > 0) { homeFailsLeft--; res.status(500).json({ error: 'the home read failed (the leg\'s plant)' }); return; }
  const h = HOLD.get(req.path);
  if (h) { h.p.then(() => next()); return; }
  next();
});
const holdPath = (p) => { let open = null; const h = { p: new Promise((r) => { open = r; }) }; h.open = () => { HOLD.delete(p); open(); }; HOLD.set(p, h); return h; };
app.get('/api/hosts/:id/dir-complete', async (req, res) => { try { res.json(await hm.dirSlice(req.params.id, { text: String(req.query.path || ''), bases: jsonList(req.query.bases), probe: jsonList(req.query.probe), q: String(req.query.q || ''), kind: String(req.query.kind || 'folder') })); } catch (e) { res.json({ suggestions: [], error: e.message }); } });
const NOW = Date.now();
app.get('/api/hosts/:id/recent-cwds', (req, res) => res.json({ cwds: [], recent: PC.recentCounts([{ cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 3 * 86400 }, { cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 4 * 86400 }, { cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 5 * 86400 }, { cwd: MAC + '/Downloads', mtime: NOW / 1000 - 7 * 86400 }]) }));
app.locals.getRemoteFs = () => ({ dirSlice: (id, o) => hm.dirSlice(id, o), mkdir: async (id, p) => { fs.mkdirSync(String(p).replace(/^~/, MAC), { recursive: true }); return { success: true }; } });
// B-3b03 (lane hub-loop-stalls): the files router never runs an op in-main — a REAL one-worker pool, as server.js wires one
app.locals.safeFs = new (require('../src/safe-fs.js').SafeFs)({ poolSize: 1, name: 'test-path-field-chrome' });
app.use(require('../src/routes/files.js'));
const D = path.join(TMP, 'www'); fs.mkdirSync(D);
app.use('/static', express.static(D));
app.get('/style.css', (req, res) => res.sendFile(path.join(REPO, 'public/style.css')));
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ── the page: the component + a New-Session-shaped harness ── */
const G = {
  ir: { id: 'g-ir', title: '投资者关系', color: '#2dd4bf', folders: [HOME + '/work/investor-relations'], contextDir: HOME + '/work/investor-relations/共享资料' },
  cd: { id: 'g-cd', title: '算力合同谈判', color: '#f59e0b', folders: [HOME + '/work/compute-deal', 'h-mac::' + MAC + '/Documents/算力合同'], contextDir: null },
  wk: { id: 'g-wk', title: '周报与行政', color: '#3b82f6', folders: [HOME + '/work/weekly-admin'], contextDir: null },
};
const SESS = [];
for (let i = 0; i < 6; i++) SESS.push({ cwd: HOME + '/work/investor-relations', startedAt: NOW - 2 * 3600e3 - i });
for (let i = 0; i < 3; i++) SESS.push({ cwd: HOME + '/work/weekly-admin', startedAt: NOW - 5 * 3600e3 - i });
SESS.push({ cwd: HOME + '/work/payments', startedAt: NOW - 7 * 86400e3 });
fs.writeFileSync(path.join(TMP, 'entry.js'), `
import { pathField, appGroups } from ${JSON.stringify(path.join(REPO, 'src/lib/path-field.js'))};
const G = ${JSON.stringify(G)};
window.__log = [];
window.app = { isMobile: !!window.__phone, sidebar: { _allSessions: ${JSON.stringify(SESS)}, _taskBoardOrder: () => Object.values(G), getTaskColor: (g) => g.color, _folderPaths: (g) => g.folders } };
document.body.innerHTML = '<div class="dialog" id="dlg" style="position:relative;width:640px;margin:20px;padding:16px;display:flex;flex-direction:column;gap:10px">'
  + '<button id="other" type="button">other</button>'
  + '<label><span>主机</span><select id="host"><option value="">本机</option><option value="h-mac">my-mac</option></select></label>'
  + '<label><span>会话名称</span><input id="name" type="text"></label>'
  + '<label><span>工作目录</span><div class="autocomplete-wrapper"><input id="cwd" type="text"></div><div id="cwd-recent" class="cwd-recent"></div></label>'
  + '</div>';
window.sel = [];
const host = document.getElementById('host'), name = document.getElementById('name');
window.pf = pathField(document.getElementById('cwd'), {
  groupsOf: () => appGroups(window.sel), host: () => host.value || null, name: () => name.value, kind: 'folder', chips: true, id: 'harness-cwd',
  createWhen: '创建会话时新建这个文件夹',
  onCommit: (i) => { window.__log.push({ ev: 'commit', path: i.path, display: i.display, how: i.how, create: i.create, exists: i.exists, base: i.via.base }); window.__tl.push({ t: Math.round(performance.now()), ev: 'commit', how: i.how, display: i.display }); },
});
host.onchange = () => window.pf.refresh();
name.addEventListener('input', () => window.pf.refresh());
document.getElementById('other').addEventListener('click', () => window.__log.push({ ev: 'click-other' }));
// (B-d833, the lane's heavy run at aa84c835c) a TIMELINE the ⑨b chip leg prints, green or red: where focus went, the pointer, the commits
window.__tl = []; const tlOf = (n) => (n && n.nodeType === 1 ? (n.id ? '#' + n.id : String(n.className || n.tagName).split(' ')[0]) : String(n));
for (const t of ['focusin', 'focusout', 'pointerdown', 'pointerup', 'click']) document.addEventListener(t, (e) => window.__tl.push({ t: Math.round(performance.now()), ev: t, at: tlOf(e.target), to: t === 'focusout' || t === 'focusin' ? tlOf(e.relatedTarget) : undefined }), true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__log.push({ ev: 'esc', prevented: e.defaultPrevented }); });
// ⑨e (A1): a field BUILT over a saved text before it is attached (a form queued behind a dirty one), attached later
window.mkQueued = (v) => { const box = document.createElement('div'); box.id = 'qbox'; const i = document.createElement('input'); i.id = 'queued'; i.type = 'text'; i.value = v; box.appendChild(i); window.qf = pathField(i, { kind: 'folder', id: 'harness-queued' }); window.qbox = box; return true; };
window.attachQueued = () => { document.getElementById('dlg').appendChild(window.qbox); return true; };
window.__ready = true;
`);
try { execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [path.join(TMP, 'entry.js'), '--bundle', `--outfile=${path.join(D, 'b.js')}`, '--format=iife', '--platform=browser', '--target=es2020', '--log-level=error'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { ok('the harness bundle builds (a fresh worktree: `npm run build` once — src/lib/build-version.js is generated)', false, String(e.stderr || e.message).slice(0, 600)); process.exit(1); }
fs.writeFileSync(path.join(D, 't.html'), '<!doctype html><html data-theme="dark" lang="zh"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><script src="/static/b.js"></script></body></html>');
// B-08d5: the field's laws and their RED CONTROLS are the PURE model's (src/path-field-model.js, scripts/test-path-field-model.mjs — its
// table and its seeded law); this suite's legs prove the field is WIRED to it (the events it sends, the effects it performs)

/* ── chrome ── */
const CDP_PORT = await freePort();
chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1100,900', '--password-store=basic', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: '' } });
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { ok('chrome answered on its debugging port', false); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 << 20 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map(); const errors = [];
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const until = async (expr, ms = 5000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { try { v = typeof expr === 'function' ? await expr() : await ev(expr); if (v) return v; } catch { } await sleep(60); } return v; };
await cdp('Page.enable'); await cdp('Runtime.enable');
// the §47 idiom (no app boots here — the page is a bare bundle — but one rule for every chrome suite) + the owner's language
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
const load = async (phone = false, page = 't.html') => {
  await cdp('Emulation.setDeviceMetricsOverride', phone ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/static/' + page + (phone ? '#phone' : '') });
  await until('window.__ready === true', 8000);
  if (phone) await ev('window.app.isMobile = true');
};
const center = async (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }; })()`);
const press = async (sel) => { const { x, y } = await center(sel); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(30); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
const KEYS = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38 };
const key = async (k, extra = {}) => { const vk = KEYS[k]; await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...extra }); if (k === 'Enter') await cdp('Input.dispatchKeyEvent', { type: 'char', key: k, text: '\r', windowsVirtualKeyCode: 13, ...extra }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...extra }); };
const type = async (text) => { await cdp('Input.insertText', { text }); };
const listOpen = () => ev(`(() => { const l = document.querySelector('.pf-list'); return !!l && !l.hidden && l.getBoundingClientRect().height > 0; })()`);
const rows = () => ev(`[...document.querySelectorAll('.pf-list .pf-item')].map((r) => ({ path: r.querySelector('.pf-path').textContent.replace(/^\\u200e/, ''), chips: [...r.querySelectorAll('.pf-chip')].map((c) => c.textContent), absent: r.classList.contains('absent'), active: r.classList.contains('active') }))`);
const secs = () => ev(`[...document.querySelectorAll('.pf-list .pf-sec')].map((s) => s.textContent)`);
const under = () => ev(`document.querySelector('.pf-under').innerText`);
const cwd = () => ev(`document.getElementById('cwd').value`);
const log = () => ev('window.__log');
const reset = async () => { await ev(`window.__log.length = 0; window.sel = []; document.getElementById('host').value = ''; document.getElementById('name').value = ''; window.pf.set('', { commit: false }); window.pf.close(); document.getElementById('other').focus(); true`); await sleep(80); };
const clear = async () => { await ev(`(() => { const i = document.getElementById('cwd'); i.focus(); i.select(); return true; })()`); await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); };
const SHOTS = process.env.PF_SHOT_DIR || null;
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const s = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(s.data, 'base64')); };

await load();

console.log('── ① the list never pops by itself ──');
{
  await ev(`document.getElementById('cwd').focus(); true`);
  await sleep(400);
  ok('a programmatic focus (a dialog opening) does NOT open the list', !(await listOpen()), null);
  await press('#cwd');
  ok('a press on the field opens it', await until(listOpen, 3000), null);
  await key('Escape'); await reset();
  await ev(`document.getElementById('name').focus(); true`);
  await key('Tab');
  ok('a Tab INTO the field opens it', (await until(`document.activeElement.id === 'cwd'`, 2000)) && (await until(listOpen, 3000)), await ev('document.activeElement.id'));
  await key('Escape'); await reset();
  await ev(`document.getElementById('cwd').focus(); true`); await sleep(150);
  await key('ArrowDown');
  ok('↓ opens it', await until(listOpen, 3000), null);
  const s = await until(async () => { const x = await secs(); return x.length ? x : null; }, 4000);
  ok('…empty: ① the groups\' folders, ③ recent (with counts), in zh', Array.isArray(s) && s[0] === '① 任务组文件夹' && s.some((t) => t.startsWith('③ 最近')), s);
  const r = await rows();
  ok('…the recent ~/work/investor-relations says «6 个会话 · 2 小时前»… ① first as a Task Group folder', r.some((x) => x.path === '~/work/investor-relations' && x.chips.some((c) => /任务组 · 投资者关系/.test(c))), r.slice(0, 6));
  await shot('01-empty-open');
  await key('Escape'); await reset();
  await ev(`document.getElementById('cwd').focus(); true`);
  await type('w');
  ok('typing opens it', await until(listOpen, 3000), null);
  await key('Escape'); await reset();
}

console.log('\n── ② fuzzy over the whole path + ↓ Enter picks ──');
{
  await ev(`document.getElementById('cwd').focus(); true`);
  await type('ir q3');
  const top = await until(async () => { const r = await rows(); return r.length && r[0].path === '~/work/investor-relations/Q3-董事会材料' ? r : null; }, 5000);
  ok('`ir q3` → ~/work/investor-relations/Q3-董事会材料 first, with its rule chip 片段前缀', !!top && top[0].chips.includes('片段前缀'), top || (await rows()));
  await shot('02-fuzzy');
  await key('ArrowDown'); await key('Enter');
  const c = await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000);
  ok('↓ Enter picks it: the field shows the ~/ form, the commit carries the absolute path (how pick)', (await cwd()) === '~/work/investor-relations/Q3-董事会材料' && c && c.path === HOME + '/work/investor-relations/Q3-董事会材料' && c.how === 'pick', [await cwd(), c]);
  ok('…and the list closed', !(await listOpen()), null);
  await reset();
}

console.log('\n── ③ Tab completes INTO a folder ──');
{
  await ev(`document.getElementById('cwd').focus(); true`);
  await type('~/work/pa');
  await until(async () => (await rows()).some((r) => r.path === '~/work/payments'), 4000);
  await key('Tab');
  ok('Tab: ~/work/pa → ~/work/payments/ (the focus stays)', (await until(async () => (await cwd()) === '~/work/payments/', 3000)) && (await ev(`document.activeElement.id`)) === 'cwd', await cwd());
  const inside = await until(async () => { const r = await rows(); return r.some((x) => x.path === '~/work/payments/发票') ? r : null; }, 4000);
  ok('…and the list shows what is inside it', !!inside, inside || (await rows()));
  await key('Escape'); await reset();
}

console.log('\n── ④ Esc ──');
{
  await press('#cwd'); await until(listOpen, 3000);
  await key('Escape');
  const l = await log();
  ok('Esc with the list open closes it and is defaultPrevented (the dialog\'s own Esc stays)', !(await listOpen()) && l.some((x) => x.ev === 'esc' && x.prevented === true), l);
  await ev('window.__log.length = 0');
  await key('Escape');
  ok('the list closed, Esc is not touched', (await log()).some((x) => x.ev === 'esc' && x.prevented === false), await log());
  await reset();
}

console.log('\n── ⑤ BLUR COMMITS (a relative path, the selected group\'s folder first) ──');
{
  await ev(`window.sel = ['g-ir']; window.pf.refresh(); true`);
  await press('#cwd');
  await type('Q3-董事会材料');
  await until(async () => /投资者关系/.test(await under()), 4000);
  const line = await under();
  ok('the line: = ~/work/investor-relations/Q3-董事会材料 · 相对任务组「投资者关系」', /= ~\/work\/investor-relations\/Q3-董事会材料/.test(line) && /相对任务组「投资者关系」/.test(line), line);
  await press('#other');
  const c = await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000);
  ok('leaving the field commits it (how blur), the text kept as typed', c && c.how === 'blur' && c.path === HOME + '/work/investor-relations/Q3-董事会材料' && (await cwd()) === 'Q3-董事会材料', [c, await cwd()]);
  await reset();
}

console.log('\n── ⑥ 「未生效：…」 ──');
{
  await press('#cwd');
  await type('zzq qqz');
  await sleep(400);
  await press('#other');
  const u = await until(async () => { const t = await under(); return /未生效/.test(t) ? t : null; }, 4000);
  ok('a few letters with no path, left: 「未生效：…」 said, the text stays, nothing committed', !!u && /不是一个路径/.test(u) && (await cwd()) === 'zzq qqz' && !(await log()).some((x) => x.ev === 'commit') && (await ev('window.pf.verdict().status')) === 'unresolved', [u, await cwd(), await log()]);
  await shot('06-unresolved');
  await clear(); await type('ir q3'); await sleep(500);
  await press('#other');
  await until(async () => /未生效/.test(await under()), 4000);
  ok('`ir q3` left: 未生效 + 「用第一名 …」', await ev(`!!document.querySelector('.pf-under .pf-best')`), await under());
  await press('.pf-under .pf-best');
  const c = await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000);
  ok('「用第一名」 commits the best one', c && c.path === HOME + '/work/investor-relations/Q3-董事会材料', c);
  await reset();
}

console.log('\n── ⑦ the commit waits past pointer-up ──');
{
  await press('#cwd');
  await type('~/work/contracts');
  await sleep(350);
  await press('#other');
  await until(async () => (await log()).some((x) => x.ev === 'commit'), 4000);
  const order = (await log()).map((x) => x.ev);
  ok('a press on another button: ITS click lands first, then the commit', order.indexOf('click-other') >= 0 && order.indexOf('click-other') < order.indexOf('commit'), order);
  await reset();
}

console.log('\n── ⑧ «不存在 — 创建？» ──');
{
  await press('#cwd');
  await type('~/work/新项目');
  await until(async () => /不存在 — 创建？/.test(await under()), 4000);
  await press('#other');
  const u = await until(async () => { const t = await under(); return /未生效/.test(t) ? t : null; }, 4000);
  ok('a missing folder, left without the tick: not taken, 未生效 says tick 「创建会话时新建这个文件夹」', !!u && /勾上「创建会话时新建这个文件夹」/.test(u) && !(await log()).some((x) => x.ev === 'commit'), u);
  await press('.pf-under input[data-act="tick"]');
  const c = await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000);
  ok('ticked ⇒ committed with create (exists false)', c && c.create === true && c.exists === false && c.path === HOME + '/work/新项目', c);
  ok('ensure() makes it on disk', (await ev('window.pf.ensure()')) === true && fs.existsSync(path.join(HOME, 'work/新项目')), fs.existsSync(path.join(HOME, 'work/新项目')));
  await reset();
  // B-ckpt61 (leg 8 as ruled — the ui-needs-a-button chain gave a missing PARENT its create tick, b2f2399c7): the missing parent is
  // SAID and the tick is OFFERED, and the create then makes BOTH levels (read back from the disk); the line waited for, never a sleep.
  // Typed as a person types: a letter that is no path first, then the path (before B-f3a1 the field kept the first half's tick across
  // set(''): this letter ended it — ⑧c below now proves the tick never carries)
  await press('#cwd'); await type('x'); await clear(); await type('~/nope/x');
  const u2 = await until(async () => { const t = await under(); return /上一级 ~\/nope 也不存在/.test(t) ? t : null; }, 4000);
  ok('its parent missing ⇒ said, AND the create tick offered (not ticked)', !!u2 && (await ev(`!!document.querySelector('.pf-under input[data-act="tick"]') && !document.querySelector('.pf-under input[data-act="tick"]').checked`)), u2 || (await under()));
  ok('before the tick neither level is on the disk (the read-back below is the create\'s own)', !fs.existsSync(path.join(HOME, 'nope')), fs.existsSync(path.join(HOME, 'nope')));
  await press('#other');
  const un = await until(async () => { const t = await under(); return /未生效/.test(t) ? t : null; }, 4000);
  ok('left without the tick: not taken (未生效), nothing committed', !!un && !(await log()).some((x) => x.ev === 'commit'), un || (await under()));
  await press('.pf-under input[data-act="tick"]');
  const cn = await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000);
  const madeBoth = !!cn && cn.create === true && cn.path === HOME + '/nope/x' && (await ev('window.pf.ensure()')) === true && fs.existsSync(path.join(HOME, 'nope', 'x')) && fs.statSync(path.join(HOME, 'nope')).isDirectory();
  ok('ticked ⇒ committed with create, and ensure() makes BOTH levels on the disk (read back)', madeBoth, { cn, nope: fs.existsSync(path.join(HOME, 'nope')), x: fs.existsSync(path.join(HOME, 'nope', 'x')) });
  await reset();
}

console.log('\n── ⑧c THE TICK BELONGS TO THE PATH IT WAS GIVEN FOR (B-f3a1): a road that moves the path drops it — the person is asked again ──');
{
  const BOX = `(() => { const b = document.querySelector('.pf-under input[data-act="tick"]'); return b ? (b.checked ? 'checked' : 'unchecked') : 'none'; })()`;
  // the scene's own start, as ⑧ proves it: a missing folder typed, left (未生效), its «create» TICKED — committed with create (the
  // tick TAKEN); the log cleared after, so a road's own commit is the only one read
  const tickOn = async (text, sel = []) => {
    await reset(); await ev(`window.sel = ${JSON.stringify(sel)}; window.pf.refresh(); true`);
    await press('#cwd'); await type(text);
    const said = await until(async () => /不存在 — 创建？/.test(await under()), 4000);
    await press('#other');
    await until(async () => /未生效/.test(await under()), 4000);
    await press('.pf-under input[data-act="tick"]');
    const taken = await until(async () => (await log()).find((x) => x.ev === 'commit' && x.create === true), 4000);
    await ev('window.__log.length = 0; true');
    return !!said && !!taken;
  };
  const boxOnce = async (re) => { await until(async () => re.test(await under()) && (await ev(BOX)) !== 'none', 4000); return { box: await ev(BOX), line: await under() }; };
  const takes = () => ev(`window.pf.commit().then((i) => (i ? { create: !!i.create, display: i.display } : null))`);
  // road 1 — a set from outside to another missing path: the box unchecked, and a commit takes nothing (the tick did not carry)
  const g1 = await tickOn('~/work/勾选甲');
  await ev(`window.pf.set('~/work/另一个乙', { commit: false }); true`);
  const r1 = await boxOnce(/另一个乙/), c1 = await takes();
  ok('⑧c a set from outside to another missing path: the tick given for «勾选甲» is GONE — the box unchecked, a commit takes nothing', g1 && r1.box === 'unchecked' && c1 === null, { g1, r1, c1 });
  // road 2 — typing more, then back to the SAME text: gone for good (asked again), never brought back
  const g2 = await tickOn('~/work/勾选丙');
  await ev(`(() => { const i = document.getElementById('cwd'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); return true; })()`);
  await type('丁');
  const r2a = await boxOnce(/勾选丙丁/);
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await until(async () => (await ev(`document.getElementById('cwd').value`)) === '~/work/勾选丙', 3000);
  const r2b = await boxOnce(/勾选丙(?!丁)/);
  ok('⑧c typing another text drops the tick, and typing back to the ticked text does NOT bring it back — the person is asked again', g2 && r2a.box === 'unchecked' && r2b.box === 'unchecked', { g2, r2a, r2b });
  // road 3 — a RELATIVE text, then a Task Group change and the door's refresh: the same words, another folder — the tick is gone
  const g3 = await tickOn('./勾选新文件夹', ['g-ir']);
  await ev(`window.sel = ['g-wk']; window.pf.refresh(); true`);
  const r3 = await boxOnce(/weekly-admin|周报与行政/);
  ok('⑧c a relative text ticked under «投资者关系», then the Task Group changed (a refresh): another folder under the same words — the tick is GONE', g3 && r3.box === 'unchecked', { g3, r3 });
  // road 3b — an ABSOLUTE text ticked, then a Task Group picked: the SAME folder — the tick STAYS (New Session J5's shape)
  const g3b = await tickOn('~/work/勾选己');
  await ev(`window.sel = ['g-ir']; window.pf.refresh(); true`);
  const r3b = await boxOnce(/勾选己/), c3b = await takes();
  ok('⑧c an absolute («~») text ticked, then a Task Group picked: the same folder — the tick STAYS and a commit takes it with create', g3b && r3b.box === 'checked' && !!c3b && c3b.create === true, { g3b, r3b, c3b });
  // road 4 — a chip that is not «new» (an existing folder): committed as itself, never with the create the other path was given
  const g4 = await tickOn('~/work/勾选戊', ['g-ir']);
  const chip = await ev(`(() => { const c = [...document.querySelectorAll('#cwd-recent button.cwd-recent-chip')].find((b) => !b.dataset.new && !b.classList.contains('cwd-name-chip')); if (!c) return null; c.id = 'f3a1-chip'; return c.dataset.path || c.textContent; })()`);
  if (chip) await press('#f3a1-chip');
  const c4 = chip ? await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000) : null;
  ok('⑧c a chip that is not «new» picked after the tick: committed as that folder with NO create (the tick was another path\'s)', g4 && !!chip && !!c4 && c4.create !== true && (await ev(BOX)) !== 'checked', { g4, chip, c4 });
  await reset();
}

console.log('\n── ⑧b the door refreshes a closed field (the name typed, the machine changed): its answer stands (B-ckpt61 MUST) ──');
{
  // the coordinator's scene: a folder that does not exist, ticked, then the session's NAME typed — the door calls refresh() on every
  // keystroke with the field closed. THE LAW: the pending words only while an ask is really out — the missing line and its tick
  // stand; a machine change asks again and the answer lands (the model's refresh rows; their controls are the model's)
  const scene = async (page) => {
    await load(false, page);
    await press('#cwd'); await type('~/work/新项目3');
    // (2.369.413's hosted red, placed: the tick was pressed while the list was OPEN and a reply could still repaint the line — it never
    // TOOK. THE LAW: press only on a SETTLED line, the list closed — as ⑧ does — and start from a tick PROVEN taken)
    const said = await until(async () => /不存在 — 创建？/.test(await under()) && !(await ev(`!!document.querySelector('.path-field')?.dataset.pending`)), 6000);
    await press('#other');   // left: the list closes (the commit refused without the tick: «未生效»), the line settles
    await until(async () => /未生效/.test(await under()), 6000);
    const tickOn = () => ev(`!!document.querySelector('.pf-under input[data-act="tick"]')?.checked`);
    await press('.pf-under input[data-act="tick"]');
    const taken = await until(async () => (await tickOn()) && (await log()).some((x) => x.ev === 'commit' && x.create === true), 6000);
    await press('#name');
    for (const ch of ['周', '报', '3']) { await type(ch); await sleep(60); }
    const stands = await until(async () => /不存在 — 创建？/.test(await under()) && (await tickOn()), 5000);
    const after = { line: await under(), tick: await tickOn(), status: await ev('window.pf.verdict().status') };
    const remote0 = await ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/hosts/h-mac/dir-complete')).length`);
    await ev(`(() => { const h = document.getElementById('host'); h.value = 'h-mac'; h.dispatchEvent(new Event('change')); return true; })()`);
    const machine = await until(async () => (await ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/hosts/h-mac/dir-complete')).length`)) > remote0 && !/正在问这台机器/.test(await under()), 8000);
    const onMac = await under();
    await ev(`(() => { const h = document.getElementById('host'); h.value = ''; h.dispatchEvent(new Event('change')); return true; })()`);
    return { said: !!said, taken: !!taken, stands: !!stands, after, machine: !!machine, onMac };
  };
  const now = await scene('t.html');
  ok('⑧b the scene\'s own start: the tick TAKEN — the box reads checked and the commit with create is in the log — before the name is typed (else the legs below prove nothing)', now.said && now.taken, now);
  ok('⑧b a missing folder ticked, then the name typed (refresh() per keystroke, the field closed): the line still says «不存在 — 创建？» with its tick checked, never «正在问这台机器…» (the coordinator\'s MUST)', now.said && now.stands && now.after.status === 'missing' && !/正在问这台机器/.test(now.after.line), now);
  ok('⑧b …the machine changed (refresh() with the field closed): the field ASKS that machine and its answer lands — the pending words never stay with no ask out', now.machine && !/正在问这台机器/.test(now.onMac), now);
  // THE WIRING (主开发's MUST 1 on 9daebd507 — the page never sent the model «closed», so after one touch it held the list open for good
  // and every refresh asked at once): typed, then LEFT (the blur closes the list: the model hears «closed»), then the door's refresh
  // with the list closed asks NOTHING — the answer stands. Its control is the model suite's event census (the wiring without «closed»)
  {
    await load();
    const T8 = '~/work/新项目5';
    const asks8 = () => ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/dir-complete?path=' + encodeURIComponent(${JSON.stringify(T8)}) + '&')).length`);
    await press('#cwd'); await type(T8);
    const answered = await until(async () => /不存在/.test(await under()), 6000);
    await press('#other');   // left: the list closes, the commit is judged (no tick: «未生效»)
    await until(async () => /未生效/.test(await under()), 6000);
    const n0 = await asks8();
    for (let i = 0; i < 3; i++) { await ev('window.pf.refresh(); true'); await sleep(200); }
    await sleep(800);
    const n1 = await asks8();
    ok('⑧b WIRED: typed, left (the list closed), then three refreshes with the list closed — NOTHING asked (the answer stands)', !!answered && n0 >= 1 && n1 === n0, { answered, n0, n1, line: await under() });
  }
  // (2.369.413's hosted red, placed: the fresh page this scene leaves had NO HOME read yet — every group row showed a raw absolute path and
  // the legs after it, which find rows by their ~ form, found nothing. THE LAW: a scene that reloads the page restores what the later legs
  // stand on — the home read by one answered ask, then the field reset)
  await load();
  await ev(`window.pf.set(${JSON.stringify(HOME + '/work')}, { commit: false }); true`);
  const homed = await until(async () => /= ~\/work/.test(await under()), 6000);
  await reset();
  ok('⑧b …the page it reloads is left as the legs after it stand on: the home read (the line says «= ~/work»), the field reset', !!homed, await under());
}

console.log('\n── ⑨ two Task Groups + a name ⇒ one 新建 per group ──');
{
  await ev(`window.sel = ['g-ir', 'g-cd']; document.getElementById('name').value = 'payments'; window.pf.refresh(); true`);
  await ev(`document.getElementById('cwd').focus(); true`); await key('ArrowDown');
  const r2 = await until(async () => { const r = await rows(); const i = r.findIndex((x) => x.path === '~/payments'); return i > 0 ? r : null; }, 5000);
  const seq2 = (r2 || []).map((x) => x.path);
  const a = seq2.indexOf('~/work/payments'), b = seq2.indexOf('~/work/investor-relations/payments'), c = seq2.indexOf('~/work/compute-deal/payments'), d = seq2.indexOf('~/payments');
  ok('② = the same-name folder, <IR>/payments, <算力>/payments, ~/payments — selection order', a >= 0 && a < b && b < c && c < d, seq2);
  ok('…the 新建 rows say 新建 + 任务组「X」', (r2 || []).find((x) => x.path === '~/work/compute-deal/payments')?.chips.join('|').includes('新建') && (r2 || []).find((x) => x.path === '~/work/compute-deal/payments')?.chips.some((t) => t.includes('任务组「算力合同谈判」')), r2);
  const chips = await ev(`[...document.querySelectorAll('#cwd-recent .cwd-name-chip')].map((c) => c.textContent)`);
  ok('the chips row under the field: one name chip per selected group + home', chips.length === 3 && /investor-relations\/payments/.test(chips[0]) && /compute-deal\/payments/.test(chips[1]) && /~\/payments/.test(chips[2]), chips);
  await shot('09-two-groups');
  await key('Escape'); await reset();
}

console.log('\n── ⑨b setDerived + the live 由名字 chips (lane new-session-group-folder-link) ──');
{
  await load();
  const homeFolders = () => ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/home-folders')).length`);
  ok('a field built while the page boots asks nothing for its chips row (it paints on refresh())', (await homeFolders()) === 0, await homeFolders());
  await ev('window.pf.refresh(); true');
  ok('CONTROL: refresh() paints it (the home\'s folders asked once)', await until(async () => (await homeFolders()) >= 1, 3000), await homeFolders());
  const IR = HOME + '/work/investor-relations';
  // B-ckpt61 (the block's hosted red, both tries): THE STALL PLACED in the listing's reply (the suite's own server holds
  // /api/dir-complete) — while the machine has not answered for the text, the line says the pending words (LAW 1): no «不存在», no
  // raw absolute path, no create tick. Then THE LEG'S LAW: it waits for the machine's FULL reply (a dir-complete reply landed after
  // the set, the field no longer pending) before it judges, and prints the field's state when it fails
  const dirReplies = () => ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/dir-complete')).length`);
  const pfState = () => ev(`(() => { const w = document.querySelector('.path-field'); return { line: document.querySelector('.pf-under').innerText, pending: !!(w && w.dataset.pending), state: w && w.dataset.state, verdict: window.pf.verdict(), dirReplies: performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/dir-complete')).length }; })()`);
  const held = holdPath('/api/dir-complete'), before = await dirReplies();
  await ev(`window.sel = ['g-ir']; window.pf.refresh(); window.pf.setDerived(${JSON.stringify(IR)}, { note: '（来自任务组「投资者关系」）' }); true`);
  const askedOut = await until(() => ev(`!!document.querySelector('.path-field')?.dataset.pending`), 8000);   // the field's ask is out — held
  const during = await pfState(), tickDuring = await ev(`!!document.querySelector('.pf-under input[data-act="tick"]')`);
  ok('⑨b HELD (the stall placed in the listing\'s reply): the line says «正在问这台机器…» — no «不存在», no raw absolute path, no create tick (LAW 1)', !!askedOut && /正在问这台机器/.test(during.line) && !/不存在/.test(during.line) && !during.line.includes(HOME) && !tickDuring, { askedOut, during, tickDuring });
  held.open();
  const landed = await until(async () => (await dirReplies()) > before && !(await ev(`!!document.querySelector('.path-field')?.dataset.pending`)), 30000);
  const u1 = await under();
  ok('setDerived fills the field and its line says «= ~/work/investor-relations（来自任务组「投资者关系」）» with its facts — judged once the machine answered', (await cwd()) === IR && !!landed && u1.includes('= ~/work/investor-relations（来自任务组「投资者关系」）') && u1.includes('个文件'), { line: u1, landed: !!landed, state: await pfState() });   // (B-d833: the field's state printed whole, green or red)
  ok('…the list did not pop, nothing was committed', !(await listOpen()) && !(await log()).some((x) => x.ev === 'commit'), await log());
  const c1 = await ev('window.pf.commit().then((i) => i && { path: i.path, derived: i.derived, how: i.how })');
  ok('a commit of that untouched text says derived: true', !!c1 && c1.derived === true && c1.path === IR, c1);
  await press('#cwd'); await ev(`(() => { const i = document.getElementById('cwd'); i.setSelectionRange(i.value.length, i.value.length); return true; })()`);
  await type('/草稿'); await sleep(450);
  const u2 = await under();
  const c2 = await ev('window.pf.commit().then((i) => i && { path: i.path, derived: i.derived })');
  ok('the person types on ⇒ the note is gone and the commit is theirs (derived: false)', !u2.includes('来自任务组') && !!c2 && c2.derived === false && c2.path === IR + '/草稿', { u2, c2 });
  await key('Escape');
  await ev(`window.pf.setDerived(${JSON.stringify(IR)}, { note: 'n' }); window.pf.set(${JSON.stringify(IR)}, { commit: false }); true`);
  const c3 = await ev('window.pf.commit().then((i) => i && i.derived)');
  ok('set() from outside (a chip, a restore) ends it too — the same text, now the person\'s', c3 === false, c3);
  // the 由名字 chips under the field follow the name as it is typed
  const nameChips = () => ev(`[...document.querySelectorAll('#cwd-recent .cwd-name-chip')].map((c) => ({ path: c.dataset.path, isNew: c.dataset.new === '1', text: c.textContent }))`);
  ok('the name empty ⇒ no 由名字 chip', (await nameChips()).length === 0, await nameChips());
  await ev(`window.__tl.length = 0; window.__tl.push({ t: Math.round(performance.now()), ev: 'mark', what: 'the name field takes focus', box: document.getElementById('cwd').value, active: document.activeElement && (document.activeElement.id || document.activeElement.className) }); document.getElementById('name').focus(); true`);
  await type('测');
  const k1 = await until(async () => { const c = await nameChips(); return c.length === 2 && c[0].path === IR + '/测' ? c : null; }, 3000);
  ok('one keystroke of the name ⇒ the chips under the field: <IR>/测, ~/测 (no list opened)', !!k1 && k1[1].path === HOME + '/测' && !(await listOpen()), k1 || (await nameChips()));
  await type('试');
  const k2 = await until(async () => { const c = await nameChips(); return c.length === 2 && c[0].path === IR + '/测试' && c.every((x) => x.isNew) ? c : null; }, 4000);
  ok('the next keystroke ⇒ they follow (<IR>/测试) and, once the machine said so, read 新建', !!k2 && /^新建/.test(k2[0].text), k2 || (await nameChips()));
  ok('…the field\'s own line never moved while the name was typed (no «asking the machine»)', !(await under()).includes('正在问这台机器'), await under());   // (B-ckpt61: the zh words — «询问» never matched them)
  await ev(`(() => { const n = document.getElementById('name'); n.value = '草稿'; n.dispatchEvent(new Event('input')); return true; })()`);
  const k3 = await until(async () => { const c = await nameChips(); return c.length === 2 && c[0].path === IR + '/草稿' && c[1].isNew && !c[0].isNew ? c : null; }, 4000);
  ok('a folder that is there (<IR>/草稿) is no 新建; ~/草稿 is', !!k3, k3 || (await nameChips()));
  await ev(`(() => { const n = document.getElementById('name'); n.value = '测试'; n.dispatchEvent(new Event('input')); return true; })()`);
  await until(async () => { const c = await nameChips(); return c.length === 2 && c[0].path === IR + '/测试' && c[0].isNew; }, 4000);
  {
    await ev(`window.__log.length = 0; window.pf.setDerived(${JSON.stringify(IR)}, { note: 'n' }); true`);
    // (B-d833, the box pre-run r156: the press is on what a PERSON sees — the field's ask landed and the chips row still for two reads; what
    // lies under the click point is printed and must be the chip: a press read from a row still being redrawn landed on another chip)
    await until(async () => !(await ev(`!!document.querySelector('.path-field')?.dataset.pending`)), 8000);
    const chipAt = () => ev(`(() => { const e = document.querySelector('#cwd-recent .cwd-name-chip'); if (!e) return null; const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y); return { x: Math.round(x), y: Math.round(y), path: e.dataset.path, under: hit ? (String(hit.className || hit.tagName) + ' ' + ((hit.closest && hit.closest('[data-path]') || {}).dataset || {}).path) : null, same: !!hit && (hit === e || e.contains(hit)) }; })()`);
    const steady = await until(async () => { const a = await chipAt(); await sleep(80); const b = await chipAt(); return a && b && a.x === b.x && a.y === b.y && a.same && b.same ? b : null; }, 5000);
    console.log(`  · ⑨b the 新建 chip at the press: ${JSON.stringify(steady || (await chipAt()))}`);
    const before = (await log()).filter((x) => x.ev === 'commit');   // commits logged since setDerived, BEFORE the press (not the press's)
    await ev(`window.__tl.push({ t: Math.round(performance.now()), ev: 'mark', what: 'the press', active: document.activeElement && (document.activeElement.id || document.activeElement.className) }); true`);
    await press('#cwd-recent .cwd-name-chip');
    const got = await until(async () => { const l = (await log()).filter((x) => x.ev === 'commit'); return l.length > before.length ? l[before.length] : null; }, 4000);
    await sleep(300);   // (a blur's commit waits 150 ms after its focusout: time for one to show)
    console.log(`  · ⑨b the timeline from the name field's focus (ms; focus, pointer, commits): ${JSON.stringify(await ev('window.__tl'))}`);
    console.log(`  · ⑨b commits before the press: ${JSON.stringify(before)}`);
    const commits = (await log()).filter((x) => x.ev === 'commit').slice(before.length), tickOn = await ev(`!!document.querySelector('.pf-under input[data-act="tick"]')?.checked`);
    ok('a press on the 新建 chip fills the field and commits it as a pick with the tick (made at use — create: true)', !!got && got.how === 'pick' && got.create === true && got.path === IR + '/测试' && (await cwd()) === '~/work/investor-relations/测试', { got, cwd: await cwd(), log: await log(), verdict: await ev('window.pf.verdict()'), line: await under() });
    ok('…the PRESS makes ONE commit, the chip\'s own pick (no blur-commit of the box\'s old text at the press), and the line\'s create tick CHECKED (made at use)', commits.length === 1 && commits[0].how === 'pick' && tickOn, { commits, tickOn, line: await under() });
    ok('…it made nothing yet', !fs.existsSync(IR + '/测试'));
  }
  await shot('09b-derived-and-name-chips');
  await reset();
}

console.log('\n── ⑨d a PARTIAL reply is asked again, BOUNDED (B-ckpt61, the coordinator 21:24Z) ──');
{
  // the suite's server answers this path PARTIAL (its budget ran out, nothing listed) as often as the leg says — a hung mount's shape
  const T = HOME + '/work/payments';
  const asksFor = () => ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/dir-complete?path=' + encodeURIComponent(${JSON.stringify(T)}) + '&')).length`);
  await load();
  partialFor.path = T; partialFor.left = 1000;
  await ev(`window.pf.set(${JSON.stringify(T)}, { commit: false }); true`);
  const seen = [];
  const said = await until(async () => { const u = await under(); seen.push(u); return /这台机器没有回答/.test(u) ? u : null; }, 10000);
  await sleep(1500);   // a fourth ask would be out 450 ms after the third reply
  const n1 = await asksFor();
  ok('⑨d every reply partial: the field asks THREE times, then its line says «这台机器没有回答» and asks no fourth time — never «不存在» on the way', !!said && n1 === 3 && !seen.some((l) => /不存在/.test(l)), { n1, said, seen: [...new Set(seen)].slice(0, 4) });
  const c0 = await ev('window.pf.commit().then((i) => (i ? i.path : null))');
  const ended = await until(async () => { const u = await under(); return /未生效/.test(u) && /这台机器没有回答/.test(u) ? u : null; }, 10000);
  await sleep(1500);
  const n2 = await asksFor();
  ok('⑨d …a commit asks again (a new run of three) and, the replies still partial, ENDS with those words — never «正在问这台机器…» for good', c0 === null && !!ended && n2 === 6 && !/正在问这台机器/.test(ended), { c0, ended, n2 });
  await ev('window.__log.length = 0; true');
  partialFor.left = 1;   // one partial reply, then a complete one
  const c1 = await ev('window.pf.commit().then((i) => (i ? i.path : null))');
  const served = await until(async () => (await log()).find((x) => x.ev === 'commit') || null, 6000);
  await sleep(600);   // a second commit would be out by now
  const u1 = await under(), commits = (await log()).filter((x) => x.ev === 'commit').length;
  ok('⑨d a commit whose reply was partial waits as owed (its door heard «nothing yet») and is judged AGAIN when the complete answer lands INSIDE its run: committed ONCE, the line says the folder', c1 === null && !!served && served.path === T && commits === 1 && /= ~\/work\/payments/.test(u1) && !/未生效/.test(u1), { c1, served, commits, u1 });
  // THE RULING (主开发 21:45Z): an owed commit ENDS WITH ITS RUN — a partial reply, then a PLAIN failure: dropped, the line says it was
  // not applied, and a complete reply that lands later repaints the line only: nothing is committed
  await load();   // a fresh page: the listing does not show the folder yet (a commit on a text it shows commits at once)
  await ev('window.__log.length = 0; true');
  partialFor.left = 1; partialFor.failLeft = 1;
  const c2 = await ev(`window.pf.set(${JSON.stringify(T)}, { commit: true }).then((i) => (i ? i.path : null))`);
  const dropped = await until(async () => { const u = await under(); return /未生效/.test(u) && /这台机器没有回答/.test(u) ? u : null; }, 6000);
  ok('⑨d a partial reply then a plain FAILURE: the owed commit is dropped — «未生效：这台机器没有回答…», never «正在问这台机器…» for good, nothing committed', c2 === null && !!dropped && !/正在问这台机器/.test(dropped) && !(await log()).some((x) => x.ev === 'commit'), { c2, dropped, log: await log() });
  await ev('window.pf.open(); true');   // a person reopens it: asked again, the complete answer lands
  const later = await until(async () => { const u = await under(); return /= ~\/work\/payments/.test(u) ? u : null; }, 6000);
  await sleep(600);
  ok('⑨d …a complete reply that lands later repaints the line (the folder, the run\'s «did not answer» words gone) and commits NOTHING (the run ended)', !!later && !/未生效/.test(later) && !(await log()).some((x) => x.ev === 'commit'), { later, log: await log() });
  await key('Escape');
  // a field destroyed while its re-ask waits asks nothing more
  await load();
  partialFor.left = 1000;
  await ev(`window.pf.set(${JSON.stringify(T)}, { commit: false }); true`);
  const first = await until(async () => ((await asksFor()) >= 1 ? true : null), 6000);
  await ev('window.pf.destroy(); true');
  await sleep(1500);
  const n3 = await asksFor();
  ok('⑨d a field destroyed while its re-ask waits asks nothing more (its timer is cleared)', !!first && n3 === 1, { first, n3 });
  // AN OWED COMMIT ENDS WHEN ITS RUN MOVES ON (the ruling): (1) the door rewrites the box without set() (the Files bar's Up): the run's
  // re-ask declines and drops what was owed — its «正在问这台机器…» never stands; (2) the machine changes while a commit is owed: the
  // old run ends — the commit is never served on the other machine (the model's rows; their controls are the model's)
  const owedScene = async (page, move) => {
    await load(false, page);
    await ev('window.__log.length = 0; true');
    partialFor.path = T; partialFor.left = 1;   // ONE partial reply (the commit judges pending: owed) …
    await ev(`window.pf.set(${JSON.stringify(T)}, { commit: true }); true`);
    const owed = await until(async () => { const u = await under(); return /未生效/.test(u) && /正在问这台机器/.test(u) ? u : null; }, 6000);
    const held = holdPath('/api/dir-complete');   // … then THIS machine's listing held (a placed stall): its run neither answers nor stops
    await ev(move);
    await sleep(3000);
    const line = await under();
    await ev(`(() => { const h = document.getElementById('host'); if (h.value) { h.value = ''; h.dispatchEvent(new Event('change')); } return true; })()`);
    held.open(); partialFor.left = 0;
    return { owed: !!owed, line, commits: (await log()).filter((x) => x.ev === 'commit') };
  };
  const REWRITE = `document.getElementById('cwd').value = ${JSON.stringify(HOME + '/work')}; true`;   // the door's own write: no input event
  const MOVE = `(() => { const h = document.getElementById('host'); h.value = 'h-mac'; h.dispatchEvent(new Event('change')); return true; })()`;
  const rw = await owedScene('t.html', REWRITE);
  ok('⑨d the door rewrote the box mid-run (no input event): the re-ask declines and ENDS what was owed — no «正在问这台机器…» left standing, nothing committed', rw.owed && !/正在问这台机器/.test(rw.line) && rw.commits.length === 0, rw);
  const mv = await owedScene('t.html', MOVE);
  ok('⑨d the machine changed while a commit was owed: the old run ENDS — the commit is never judged on my-mac (nothing committed, no «未生效» there), no «正在问这台机器…» left once my-mac answered', mv.owed && mv.commits.length === 0 && !/未生效/.test(mv.line) && !/正在问这台机器/.test(mv.line), mv);
  partialFor.left = 0; partialFor.failLeft = 0;
  await load();
}

console.log('\n── ⑨e A1: a field BUILT over a saved text before it is shown (a queued form) asks nothing until touched (B-ckpt61, 主开发 21:51Z) ──');
{
  const Q = HOME + '/work/weekly-admin';
  const asksQ = () => ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/dir-complete?path=' + encodeURIComponent(${JSON.stringify(Q)}) + '&')).length`);
  const qLine = () => ev(`document.querySelector('#qbox .pf-under').innerText`);
  const scene = async (page) => {
    await load(false, page);
    await ev(`window.mkQueued(${JSON.stringify(Q)})`);
    await sleep(400);   // past the field's debounce: an ask at its build would be out by now
    await ev('window.attachQueued()');
    await sleep(600);
    const line = await qLine(), status = await ev('window.qf.verdict().status'), asked = await asksQ();
    await press('#queued');   // a person touches it
    const touched = await until(async () => { const t = await qLine(); return /= ~\/work\/weekly-admin/.test(t) ? t : null; }, 8000);
    return { line, status, asked, touched, after: await asksQ() };
  };
  const now = await scene('t.html');
  ok('⑨e a field built over a saved text before it is shown asks NOTHING, and shown its line is QUIET — no «正在问这台机器…» with nothing asked, no «不存在», no tick; its status still pending (a form refuses)', now.asked === 0 && !/正在问这台机器|不存在/.test(now.line) && now.status === 'pending', now);
  ok('⑨e …a person touches it: it asks, and the line names the folder with its facts', !!now.touched && now.after >= 1, now);
  await load();
}

console.log('\n── ⑨c the home\'s first read FAILS once (B-ckpt61 LAW 2) ──');
{
  // a fresh page (the field's own home unknown, no app answer for it); the suite's server answers the home's NEXT read with a 500.
  // The line never says «missing» on the way, the machine's reply still names the folder (its listing carries the home), and the
  // next ask (a new text — the same text within 2 s is not asked again) reads the home AGAIN: a failed read is never kept. The
  // control is the old code by construction (its kept promise answered '' for the page — the re-read never left the page)
  const IR = HOME + '/work/investor-relations';
  const dirReplies = () => ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/dir-complete')).length`);
  const homeReads = () => ev(`performance.getEntriesByType('resource').filter((e) => /\\/api\\/home(\\?|$)/.test(e.name)).length`);
  const pending = () => ev(`!!document.querySelector('.path-field')?.dataset.pending`);
  await load();
  homeFailsLeft = 1;
  const b2 = await dirReplies();
  await ev(`window.sel = ['g-ir']; window.pf.setDerived(${JSON.stringify(IR)}, { note: '（来自任务组「投资者关系」）' }); true`);
  const sawLines = [];
  const landed = await until(async () => { sawLines.push(await under()); return (await dirReplies()) > b2 && !(await pending()); }, 30000);
  const u3 = await under();
  ok('⑨c the home\'s first read answered 500: the field still asked the machine, and its line names the folder with its facts — never «不存在» on the way', homeFailsLeft === 0 && !!landed && u3.includes('= ~/work/investor-relations') && u3.includes('个文件') && !sawLines.some((l) => /不存在/.test(l)), { homeFailsLeft, u3, sawLines: [...new Set(sawLines)].slice(0, 4), reads: await homeReads() });
  const reads1 = await homeReads();
  await ev(`window.pf.set(${JSON.stringify(HOME + '/work')}, { commit: false }); true`);
  const reread = await until(async () => ((await homeReads()) >= 2 ? true : null), 8000);   // (a partial re-ask may have read it already)
  ok('…and a later ask reads the home AGAIN (LAW 2: a failed read is never kept — the old kept promise read it once for the page)', !!reread, { reads1, now: await homeReads() });
  homeFailsLeft = 0;
  await reset();   // the same page: the home it read again is ⑩'s too (⑩ asks only the remote machine)
}

console.log('\n── ⑩ a remote machine (my-mac): the same recommendations, computed for it ──');
{
  // (B-d833, r156: my-mac's own replies are RECORDED — status, its listing's home, how many folders, an error, partial — so the rows are
  // read again once a listing with its home has landed, and both moments are printed)
  await ev(`(() => { if (!window.__macTap) { window.__macTap = []; const f0 = window.fetch; window.fetch = function (...a) { const p = f0.apply(this, a); try { const u = String((a[0] && a[0].url) || a[0] || ''); if (u.includes('/api/hosts/h-mac/dir-complete')) p.then((r) => r.clone().json().then((j) => window.__macTap.push({ status: r.status, home: (j && j.listing && j.listing.home) || null, dirs: j && j.listing ? Object.keys(j.listing.dirs || {}).length : null, error: (j && j.error) || null, partial: !!(j && j.partial), unreachable: !!(j && j.unreachable) }))).catch((e) => window.__macTap.push({ failed: String(e && e.message || e) })); } catch { } return p; }; } window.__macTap.length = 0; return true; })()`);
  await ev(`window.sel = ['g-ir', 'g-cd']; document.getElementById('host').value = 'h-mac'; window.pf.refresh(); true`);
  const macAsks = () => ev(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/hosts/h-mac/dir-complete')).length`), mac0 = await macAsks();
  await ev(`document.getElementById('cwd').focus(); true`); await key('ArrowDown');
  const r = await until(async () => { const x = await rows(); return x.some((y) => y.path === '~/work/compute-deal' && y.absent) && x.some((y) => y.path === '~/Documents/算力合同') ? x : null; }, 8000);
  // (B-d833, the coordinator's r146: how many asks the field made to my-mac until its first full rows — printed, green or red)
  console.log(`  · ⑩ my-mac's first open: ${(await macAsks()) - mac0} ask(s) after the list opened (the field's and its chips'; the chips' first is before it) until its rows${r ? '' : ' — NEVER'}; the line «${(await under()).slice(0, 80)}»`);
  console.log(`  · ⑩ my-mac's replies: ${JSON.stringify(await ev('window.__macTap'))}`);
  console.log(`  · ⑩ the field's own trace of its replies (number / current, how taken, the world after): ${JSON.stringify(await ev('window.pf.trace()'))}`);
  const homed = await until(async () => ((await ev('window.__macTap')) || []).some((x) => x.home) ? true : null, 5000);
  console.log(`  · ⑩ the rows ${homed ? 'once a listing WITH its home had landed' : '— no listing with its home ever landed'}: ${JSON.stringify((await rows()).map((x) => [x.path, x.chips.join(' | '), x.absent]))}`);
  const g1 = (r || []).filter((x) => /任务组 · /.test(x.chips.join(' ')) || x.absent);
  ok('① on my-mac: the IR folder (my-mac 上有), 算力 declared (为 my-mac 声明), compute-deal greyed «在 my-mac 上不存在 · 新建？»', !!r && r.find((x) => x.path === '~/work/investor-relations')?.chips.some((c) => c.includes('my-mac 上') || c.includes('在 my-mac')) && r.find((x) => x.path === '~/Documents/算力合同')?.chips.some((c) => c.includes('为 my-mac 声明')) && r.find((x) => x.path === '~/work/compute-deal')?.chips.some((c) => c.includes('在 my-mac 上不存在 · 新建？')), r ? g1 : { rows: await rows(), verdict: await ev('window.pf.verdict()') });   // (when it never came: what the list showed, and the field's own verdict)
  ok('③ that machine\'s recents with counts (3 个会话)', (r || []).some((x) => x.path === '~/Projects/website' && x.chips.some((c) => /^3 个会话/.test(c))), r || { rows: await rows(), verdict: await ev('window.pf.verdict()') });
  // (B-d833, r169: the PLACE of the rows' state — a SECOND open of the same list, printed: if that open's reply settles the rows, the first
  // reply was received but never merged into the world the rows read; if not, the rows stay so after any reply)
  await key('Escape'); await ev(`window.pf.refresh(); true`); await ev(`document.getElementById('cwd').focus(); true`); await key('ArrowDown');
  const tap1 = ((await ev('window.__macTap')) || []).length;
  await until(async () => (((await ev('window.__macTap')) || []).length > tap1 ? true : null), 5000); await sleep(300);
  console.log(`  · ⑩ a SECOND open: my-mac's replies ${JSON.stringify(await ev('window.__macTap'))}; the field's trace ${JSON.stringify(await ev('window.pf.trace()'))}; the rows ${JSON.stringify((await rows()).map((x) => [x.path, x.chips.join(' | '), x.absent]))}`);
  await shot('10-remote');
  await key('Escape'); await reset();
}

console.log('\n── ⑪ THE PICKER ──');
{
  await ev(`window.sel = ['g-ir']; window.pf.refresh(); true`);
  await press('.path-field .pf-pick');
  ok('the folder button opens a dialog over the dialog', await until(`!!document.querySelector('.dialog.pf-picker')`, 4000), null);
  await until(`document.querySelectorAll('.pf-pk-tree .pf-tn').length > 5`, 5000);
  const tree = await ev(`({ pins: [...document.querySelectorAll('.pf-pk-tree .pf-tn.pin')].map((n) => n.textContent), names: [...document.querySelectorAll('.pf-pk-tree .pf-tn:not(.pin) .pf-tnm')].map((n) => n.textContent) })`);
  ok('the groups\' folders pinned with their badge; the home\'s tree without ~/vibespace or a dot-folder', tree.pins.some((t) => t.includes('~/work/investor-relations') && t.includes('投资者关系')) && tree.names.includes('work') && !tree.names.includes('vibespace') && !tree.names.some((t) => t.startsWith('.')), tree);
  await ev(`(() => { const n = [...document.querySelectorAll('.pf-pk-tree [data-sel]')].find((x) => x.dataset.sel === '~/work'); n.click(); return true; })()`);
  await until(`[...document.querySelectorAll('.pf-pk-tree [data-sel]')].some((x) => x.dataset.sel === '~/work/payments')`, 4000);
  await ev(`[...document.querySelectorAll('.pf-pk-tree [data-sel]')].find((x) => x.dataset.sel === '~/work/payments').click(); true`);
  const pv = await until(async () => { const t = await ev(`document.querySelector('.pf-pk-right').innerText`); return /付款审批-10月\.xlsx/.test(t) ? t : null; }, 4000);
  ok('the preview: its folders + files with sizes and dates', !!pv && /发票/.test(pv) && /26\.4 KB|27 KB|26 KB/.test(pv), pv);
  await shot('11-picker');
  await ev(`document.querySelector('.pf-pk-right [data-act="mk"]').click(); true`);
  await until(`!!document.querySelector('.pf-mk-name')`, 2000);
  await ev(`document.querySelector('.pf-mk-name').focus(); true`);
  await type('季度对账');
  await key('Enter');
  ok('「新建文件夹」 inline makes it on disk and selects it', (await until(() => fs.existsSync(path.join(HOME, 'work/payments/季度对账')), 4000)) && (await until(`document.querySelector('.pf-pk-foot b')?.textContent === '~/work/payments/季度对账'`, 4000)), await ev(`document.querySelector('.pf-pk-foot').innerText`));
  await ev(`document.querySelector('.pf-pk-foot [data-act="go"]').click(); true`);
  const c = await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000);
  ok('「选这个文件夹」 fills the ~/ form and commits (how picker)', (await cwd()) === '~/work/payments/季度对账' && c && c.how === 'picker' && c.path === HOME + '/work/payments/季度对账' && !(await ev(`!!document.querySelector('.dialog.pf-picker')`)), [await cwd(), c]);
  await reset();
  await press('.path-field .pf-pick');
  ok('reopened, it remembers its node', await until(`document.querySelector('.pf-pk-foot b')?.textContent === '~/work/payments/季度对账'`, 4000), await ev(`document.querySelector('.pf-pk-foot b')?.textContent`));
  await ev(`document.querySelector('.pf-pk-foot [data-act="cancel"]').click(); true`);
  await reset();
  await press('#cwd'); await type('ir q3'); await sleep(450); await key('Escape');
  await press('.path-field .pf-pick');
  const q = await until(async () => { const v = await ev(`({ q: document.querySelector('.pf-pk-q')?.value, sel: document.querySelector('.pf-pk-foot b')?.textContent })`); return v.q === 'ir q3' && v.sel ? v : null; }, 4000);
  ok('opened on a search: the search box holds it and its best hit is chosen', q && q.sel === '~/work/investor-relations/Q3-董事会材料', q);
  await ev(`document.querySelector('.pf-pk-foot [data-act="cancel"]').click(); true`);
  await reset();
}

console.log('\n── ⑫ IME ──');
{
  await press('#cwd');
  await cdp('Input.imeSetComposition', { text: 'he', selectionStart: 2, selectionEnd: 2 });
  await sleep(200);
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229 });
  ok('a composing Enter (keyCode 229) never picks / commits', !(await log()).some((x) => x.ev === 'commit'), await log());
  await cdp('Input.insertText', { text: '合同' });
  const r = await until(async () => { const x = await rows(); return x.length && x[0].path === '~/work/contracts' ? x : null; }, 5000);
  ok('the composed word (合同) finds ~/work/contracts by its link alias ~/合同', !!r && r[0].chips.some((c) => /别名「合同」/.test(c)), r || (await rows()));
  await key('Escape'); await reset();
}

console.log('\n── ⑬ never offered unasked ──');
{
  await press('#cwd'); await type('~/');
  const r = await until(async () => { const x = await rows(); return x.some((y) => y.path === '~/work') ? x : null; }, 5000);
  ok('~/ lists the home without ~/vibespace (the checkout) or ~/.config', !!r && !r.some((x) => x.path === '~/vibespace' || x.path === '~/.config'), r);
  await clear(); await type('~/vibespace');
  const vv = await until(async () => { const v = await ev('window.pf.verdict()'); return v && v.status === 'ok' ? v : null; }, 5000) || await ev('window.pf.verdict()');   // (B-ckpt61: the machine's answer waited for, never a 450 ms sleep)
  ok('typed explicitly, it resolves', vv.status === 'ok' && vv.path === HOME + '/vibespace', vv);
  await key('Escape'); await reset();
}

console.log('\n── ⑭ the phone ──');
{
  await load(true);
  await press('#cwd'); await type('pay');
  await until(listOpen, 4000);
  const inFlow = await ev(`(() => { const l = document.querySelector('.pf-list'); return !!l && !l.classList.contains('pf-float') && !!l.closest('.path-field'); })()`);
  ok('on the phone the list sits in the flow under the field (not floating)', inFlow, null);
  await shot('14-phone');
}

ok(`⑮ 0 page errors`, errors.length === 0, errors);
ws.close(); server.close();
console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''}`);
process.exit(bad ? 1 : 0);
