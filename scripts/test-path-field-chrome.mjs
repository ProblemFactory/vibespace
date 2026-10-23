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
//      disk; its parent missing ⇒ said, no tick
//   ⑨ two Task Groups + a name ⇒ ② = one <group folder>/<name> per group in selection order + ~/<name>; the chips row too
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
import { freePort, ONBOARDED_SOURCE } from './scratch.mjs';
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
app.get('/api/hosts/:id/dir-complete', async (req, res) => { try { res.json(await hm.dirSlice(req.params.id, { text: String(req.query.path || ''), bases: jsonList(req.query.bases), probe: jsonList(req.query.probe), q: String(req.query.q || ''), kind: String(req.query.kind || 'folder') })); } catch (e) { res.json({ suggestions: [], error: e.message }); } });
const NOW = Date.now();
app.get('/api/hosts/:id/recent-cwds', (req, res) => res.json({ cwds: [], recent: PC.recentCounts([{ cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 3 * 86400 }, { cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 4 * 86400 }, { cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 5 * 86400 }, { cwd: MAC + '/Downloads', mtime: NOW / 1000 - 7 * 86400 }]) }));
app.locals.getRemoteFs = () => ({ dirSlice: (id, o) => hm.dirSlice(id, o), mkdir: async (id, p) => { fs.mkdirSync(String(p).replace(/^~/, MAC), { recursive: true }); return { success: true }; } });
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
  onCommit: (i) => window.__log.push({ ev: 'commit', path: i.path, display: i.display, how: i.how, create: i.create, exists: i.exists, base: i.via.base }),
});
host.onchange = () => window.pf.refresh();
name.addEventListener('input', () => window.pf.refresh());
document.getElementById('other').addEventListener('click', () => window.__log.push({ ev: 'click-other' }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__log.push({ ev: 'esc', prevented: e.defaultPrevented }); });
window.__ready = true;
`);
try { execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [path.join(TMP, 'entry.js'), '--bundle', `--outfile=${path.join(D, 'b.js')}`, '--format=iife', '--platform=browser', '--target=es2020', '--log-level=error'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { ok(false, 'the harness bundle builds (a fresh worktree: `npm run build` once — src/lib/build-version.js is generated)', String(e.stderr || e.message).slice(0, 600)); process.exit(1); }
fs.writeFileSync(path.join(D, 't.html'), '<!doctype html><html data-theme="dark" lang="zh"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><script src="/static/b.js"></script></body></html>');

/* ── chrome ── */
const CDP_PORT = await freePort();
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1100,900', '--password-store=basic', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: '' } });
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { ok(false, 'chrome answered on its debugging port'); process.exit(1); }
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
const load = async (phone = false) => {
  await cdp('Emulation.setDeviceMetricsOverride', phone ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/static/t.html' + (phone ? '#phone' : '') });
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
  await press('#cwd'); await type('~/nope/x'); await sleep(450);
  const u2 = await under();
  ok('its parent missing ⇒ said, no tick to give', /上一级 ~\/nope 也不存在/.test(u2) && !(await ev(`!!document.querySelector('.pf-under input[data-act="tick"]')`)), u2);
  await reset();
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

console.log('\n── ⑩ a remote machine (my-mac): the same recommendations, computed for it ──');
{
  await ev(`window.sel = ['g-ir', 'g-cd']; document.getElementById('host').value = 'h-mac'; window.pf.refresh(); true`);
  await ev(`document.getElementById('cwd').focus(); true`); await key('ArrowDown');
  const r = await until(async () => { const x = await rows(); return x.some((y) => y.path === '~/work/compute-deal' && y.absent) && x.some((y) => y.path === '~/Documents/算力合同') ? x : null; }, 8000);
  const g1 = (r || []).filter((x) => /任务组 · /.test(x.chips.join(' ')) || x.absent);
  ok('① on my-mac: the IR folder (my-mac 上有), 算力 declared (为 my-mac 声明), compute-deal greyed «在 my-mac 上不存在 · 新建？»', !!r && r.find((x) => x.path === '~/work/investor-relations')?.chips.some((c) => c.includes('my-mac 上') || c.includes('在 my-mac')) && r.find((x) => x.path === '~/Documents/算力合同')?.chips.some((c) => c.includes('为 my-mac 声明')) && r.find((x) => x.path === '~/work/compute-deal')?.chips.some((c) => c.includes('在 my-mac 上不存在 · 新建？')), g1);
  ok('③ that machine\'s recents with counts (3 个会话)', (r || []).some((x) => x.path === '~/Projects/website' && x.chips.some((c) => /^3 个会话/.test(c))), r);
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
  await clear(); await type('~/vibespace'); await sleep(450);
  const vv = await ev('window.pf.verdict()');
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
