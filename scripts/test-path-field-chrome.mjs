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
//   ⑯ (B-5736's follow) the REAL mounts dialog's Save while a field is edited: B's text held (only it), A edited meanwhile — the Save
//      asks A again once and saves what A's box shows (RED: the tip before the follow, 3ee1ed432, saved A's earlier folder)
//   ⑰ (B-f3a1, ruled r1279) THE PAGE'S ONE GATE drawn: twelve fields set at once, every check held — the doors never hold more than
//      three; the person's Enter reaches the machine at once (the kept slot); never more than four (RED: the release had no gate)
//   ⑱ (r1633 / r1636) THE LATE FACTS DRAWN, on this hub AND on a paired machine (a REAL agent of this tree collecting there): a kid's
//      own fact lands 300 ms after the page's ONE quiet re-ask arrives — marked late, it waits for it and the badge is drawn (RED: the
//      same re-ask unmarked answers at once, no badge); past the bound, no third ask, and the fact kept there comes with the next ask
//   ⑮ 0 page errors
// Run: node scripts/test-path-field-chrome.mjs   (SKIPs without chrome)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, ONBOARDED_SOURCE, CHROME_QUIET, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';   // r4927: ⑪'s red — the files router without the folder-made drop
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
// ⑰ (B-f3a1): the page's folder checks AS THE MACHINE SEES THEM — how many are in flight at once (the most), and the order they arrive
const DIRQ = { on: false, now: 0, max: 0, order: [] };
app.use((req, res, next) => { if (DIRQ.on && req.path === '/api/dir-complete') { DIRQ.now++; DIRQ.max = Math.max(DIRQ.max, DIRQ.now); DIRQ.order.push(String(req.query.path || '')); res.on('close', () => { DIRQ.now--; }); } next(); });
const partialFor = { path: '', left: 0, failLeft: 0 };   // ⑨d: this path's next dir-complete replies are PARTIAL (the machine's budget ran out, nothing listed), then FAILED (a 500, no listing)
app.use((req, res, next) => {
  if (req.path === '/api/dir-complete' && partialFor.left > 0 && String(req.query.path || '') === partialFor.path) { partialFor.left--; res.json({ listing: { home: HOME, machine: null, dirs: {}, links: {}, localized: {}, mounts: [], nondirs: {} }, partial: true, took: 0 }); return; }
  if (req.path === '/api/dir-complete' && partialFor.failLeft > 0 && String(req.query.path || '') === partialFor.path) { partialFor.failLeft--; res.status(500).json({ error: 'the listing failed (the leg\'s plant)' }); return; }
  if (req.path === '/api/home' && homeFailsLeft > 0) { homeFailsLeft--; res.status(500).json({ error: 'the home read failed (the leg\'s plant)' }); return; }
  const h = HOLD.get(req.path);
  if (h && (h.text == null || String(req.query.path || '') === h.text)) { h.p.then(() => next()); return; }   // ⑯: a hold may name ONE text
  next();
});
// ⑱ (r4197): the asks the hub has OPEN, counted at the door, and a leg's OWN ordinary ask held there until its road is settled (the
// leg's placement: nothing else out at its kid's facts call) — BEFORE the late hook, which strips a red's late mark on the way
const OPEN = { n: 0 }, ASK_DOOR = new Map();
app.use((req, res, next) => {
  if (!/dir-complete$/.test(req.path)) return next();
  OPEN.n++; let done = false; const end = () => { if (!done) { done = true; OPEN.n--; } }; res.on('finish', end); res.on('close', end);
  const w = req.query.late !== '1' && ASK_DOOR.get(String(req.query.path || ''));
  if (w) { w(req).then(() => next(), () => next()); return; }
  next();
});
// ⑱ (r1633): the page's QUIET re-ask as the machine sees it — a leg hangs a hook on its arrival (its fact lands a set time after), or
// STRIPS its late mark on the way (the RED: the same re-ask unmarked, as the release sent it)
const LATE_HOOK = { on: new Map(), strip: false };
app.use((req, res, next) => { if (/dir-complete$/.test(req.path) && req.query.late === '1') { const k = String(req.query.path || ''), cb = LATE_HOOK.on.get(k); if (cb) { LATE_HOOK.on.delete(k); cb(req, res); } if (LATE_HOOK.strip) delete req.query.late; } next(); });
const holdPath = (p, text = null) => { let open = null; const h = { p: new Promise((r) => { open = r; }), text }; h.open = () => { HOLD.delete(p); open(); }; HOLD.set(p, h); return h; };
app.get('/api/hosts/:id/dir-complete', async (req, res) => { const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); }); try { res.json(await hm.dirSlice(req.params.id, { text: String(req.query.path || ''), bases: jsonList(req.query.bases), probe: jsonList(req.query.probe), q: String(req.query.q || ''), kind: String(req.query.kind || 'folder'), press: req.query.press === '1', late: req.query.late === '1' }, { signal: ac.signal })); } catch (e) { res.json({ suggestions: [], error: e.message }); } });
const NOW = Date.now();
app.get('/api/hosts/:id/recent-cwds', (req, res) => res.json({ cwds: [], recent: PC.recentCounts([{ cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 3 * 86400 }, { cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 4 * 86400 }, { cwd: MAC + '/Projects/website', mtime: NOW / 1000 - 5 * 86400 }, { cwd: MAC + '/Downloads', mtime: NOW / 1000 - 7 * 86400 }]) }));
app.locals.getRemoteFs = () => ({ dirSlice: (id, o) => hm.dirSlice(id, o), mkdir: async (id, p) => { fs.mkdirSync(String(p).replace(/^~/, MAC), { recursive: true }); return { success: true }; } });
// B-3b03 (lane hub-loop-stalls): the files router never runs an op in-main — a REAL one-worker pool, as server.js wires one
process.env.VIBESPACE_DIROPS_TEST = '1';   // r4143: ⑱ this hub's PLACED reads — the dir-ops dead-path stand-in (a vs-dead folder's read HELD in the worker until the suite's .go); set before the pool's worker starts
app.locals.safeFs = new (require('../src/safe-fs.js').SafeFs)({ poolSize: 1, name: 'test-path-field-chrome' });
// r4927 (⑪): THIS hub's folder-field collector is made HERE (the route takes the one it finds, src/routes/files.js dirSliceOf) with a
// PLACEABLE clock — null = the real one; leg ⑪ freezes it from the parent's listing to the press, so the parent's re-list after a
// make-folder sits inside LIST_FRESH_MS whatever the runner's speed (the hosted red: that gap fell either side of the 2 s)
let DIR_CLOCK = null;
app.locals._dirSlice = require('../src/server/dir-slice.js').create({ call: (op, payload, opts) => app.locals.safeFs.call(op, payload, opts), now: () => (DIR_CLOCK != null ? DIR_CLOCK : Date.now()) });
// …and the files router behind a switch: ⑪'s red runs a patched copy (the route without the drop), every other leg the real one
const FILES_REAL = require('../src/routes/files.js');
let FILES = FILES_REAL;
app.use((req, res, next) => FILES(req, res, next));
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
import { mountsDialog } from ${JSON.stringify(path.join(REPO, 'src/lib/mounts-dialog.js'))};
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
// ⑯ (B-5736's follow, 主开发 r1218 5): the REAL mounts dialog with two folder fields on this machine; its Save hands what it took here
window.mkMounts = () => { window.__saved = null; mountsDialog('B-5736', [{ key: 'a', label: 'A', autocomplete: 'local' }, { key: 'b', label: 'B', autocomplete: 'local' }], 'Save', async (vals) => { window.__saved = vals; }, { id: 'b5736-dlg', key: 'b5736' }); return true; };
// ⑰ (B-f3a1): a page that builds many folder fields at once
window.mkMany = (n) => { const box = document.createElement('div'); box.id = 'many'; document.getElementById('dlg').appendChild(box); window.many = []; for (let k = 0; k < n; k++) { const i = document.createElement('input'); i.id = 'many-' + k; i.type = 'text'; box.appendChild(i); window.many.push(pathField(i, { kind: 'folder', id: 'many-' + k })); } return true; };
window.__ready = true;
`);
try { execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [path.join(TMP, 'entry.js'), '--bundle', `--outfile=${path.join(D, 'b.js')}`, '--format=iife', '--platform=browser', '--target=es2020', '--log-level=error'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { ok('the harness bundle builds (a fresh worktree: `npm run build` once — src/lib/build-version.js is generated)', false, String(e.stderr || e.message).slice(0, 600)); process.exit(1); }
fs.writeFileSync(path.join(D, 't.html'), '<!doctype html><html data-theme="dark" lang="zh"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><script src="/static/b.js"></script></body></html>');
// ⑱'s PAGE RED (主开发 r4184): the same harness over the component with its rows memo keyed as at the train's tip — on the folders' COUNT
// and the recents' count — the plant made through THE one door for a control's edit (a moved line throws by name)
const PF_FILE = path.join(REPO, 'src/lib/path-field.js'), PF_SRC = fs.readFileSync(PF_FILE, 'utf8');
const PF_TIP = anchored(PF_SRC, 'W.rev || 0, inp.listing.home, inp.recent.map((r) => [r.path, r.count, r.when])', 'Object.keys(inp.listing.dirs).length, inp.recent.length', 'the rows memo keyed on the folders\' count');   // stale-pins: kept — the plant restores the tip's own memo key (the page's red)
ok('CONTROL setup: the plant is where it claims — the rows memo of the copy keys on the folders\' count, its revision gone', PF_TIP !== PF_SRC && PF_TIP.includes('inp.bases.map((b) => b.path), Object.keys(inp.listing.dirs).length, inp.recent.length, !!inp.self, dead]') && !PF_TIP.includes('W.rev || 0, inp.listing.home'));   // stale-pins: kept — the copy holds the tip's key
await require(path.join(REPO, 'node_modules/esbuild')).build({ entryPoints: [path.join(TMP, 'entry.js')], bundle: true, outfile: path.join(D, 'b-tip.js'), format: 'iife', platform: 'browser', target: 'es2020', logLevel: 'error',
  plugins: [{ name: 'memo-at-tip', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]path-field\.js$/ }, () => ({ contents: PF_TIP, loader: 'js', resolveDir: path.dirname(PF_FILE) })); } }] });
fs.writeFileSync(path.join(D, 't-tip.html'), '<!doctype html><html data-theme="dark" lang="zh"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><script src="/static/b-tip.js"></script></body></html>');
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
  // r4927 (主开发): THE PRESS BEFORE THE MADE FOLDER's OWN LISTING LANDS — that listing is HELD at the hub's door (ASK_DOOR) until the
  // press is done, and the hub's collector clock is FROZEN from the parent's listing to the press (both inside LIST_FRESH_MS): the
  // remembered folder must be the one made (the make-folder route drops the parent's kept listing — src/dir-collect.js folderMade)
  const gateFor = (p) => { const g = { arrived: 0 }; g.p = new Promise((r) => { g.open = () => { ASK_DOOR.delete(p); r(); }; }); ASK_DOOR.set(p, () => { g.arrived++; return g.p; }); return g; };
  DIR_CLOCK = Date.now();
  const g11 = gateFor('~/work/payments/季度对账/');
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
  const held11 = await until(() => (g11.arrived ? true : null), 4000);   // the made folder's own listing asked, and HELD at the door
  ok('r4927 ⑪ placed: the made folder\'s own listing is asked and HELD at the hub\'s door before the press (the collector\'s clock frozen since the parent\'s listing)', !!held11, { arrived: g11.arrived });
  await ev(`document.querySelector('.pf-pk-foot [data-act="go"]').click(); true`);
  g11.open(); DIR_CLOCK = null;
  const c = await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000);
  ok('「选这个文件夹」 fills the ~/ form and commits (how picker)', (await cwd()) === '~/work/payments/季度对账' && c && c.how === 'picker' && c.path === HOME + '/work/payments/季度对账' && !(await ev(`!!document.querySelector('.dialog.pf-picker')`)), [await cwd(), c]);
  await reset();
  await press('.path-field .pf-pick');
  ok('reopened, it remembers its node', await until(`document.querySelector('.pf-pk-foot b')?.textContent === '~/work/payments/季度对账'`, 4000), await ev(`document.querySelector('.pf-pk-foot b')?.textContent`));
  await ev(`document.querySelector('.pf-pk-foot [data-act="cancel"]').click(); true`);
  await reset();
  // r4927 ⑪ RED CONTROL: the same press, placed the same way, through the files route WITHOUT the drop (the release's, a patched
  // copy): the parent's re-list is the kept one, the made folder is unknown to the page at the press — the PARENT is remembered
  {
    const MUT11 = mutantCopies('path-field-11', REPO);
    const SRC_FILES = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
    FILES = require(MUT11.write('src/routes/files.js', anchored(SRC_FILES, "    if (ds && typeof ds.folderMade === 'function') { try { ds.folderMade(made); } catch { /* the listing ages out in its 2 s */ } }\n", '    // (the release: no drop)\n', 'test-path-field-chrome ⑪ the route without the drop'), 'no-drop'));
    try {
      await press('.path-field .pf-pick');
      await until(`!!document.querySelector('.dialog.pf-picker')`, 4000);
      await until(`[...document.querySelectorAll('.pf-pk-tree [data-sel]')].some((x) => x.dataset.sel === '~/work/payments')`, 4000);
      DIR_CLOCK = Date.now();
      const g2 = gateFor('~/work/payments/季度对账-二/');
      await ev(`[...document.querySelectorAll('.pf-pk-tree [data-sel]')].find((x) => x.dataset.sel === '~/work/payments').click(); true`);
      await until(async () => (/付款审批-10月\.xlsx/.test(await ev(`document.querySelector('.pf-pk-right').innerText`)) ? true : null), 4000);
      await ev(`document.querySelector('.pf-pk-right [data-act="mk"]').click(); true`);
      await until(`!!document.querySelector('.pf-mk-name')`, 2000);
      await ev(`document.querySelector('.pf-mk-name').focus(); true`);
      await type('季度对账-二');
      await key('Enter');
      const made2 = !!(await until(() => fs.existsSync(path.join(HOME, 'work/payments/季度对账-二')), 4000)) && !!(await until(`document.querySelector('.pf-pk-foot b')?.textContent === '~/work/payments/季度对账-二'`, 4000)) && !!(await until(() => (g2.arrived ? true : null), 4000));
      await ev(`document.querySelector('.pf-pk-foot [data-act="go"]').click(); true`);
      g2.open(); DIR_CLOCK = null;
      await until(async () => (await log()).find((x) => x.ev === 'commit'), 4000);
      await reset();
      await press('.path-field .pf-pick');
      const remembered2 = await until(`document.querySelector('.pf-pk-foot b')?.textContent || null`, 4000);
      ok('r4927 ⑪ RED CONTROL (the route without the drop, the release\'s): the same placed press REMEMBERS THE PARENT, one level up', made2 && remembered2 === '~/work/payments', { made2, remembered2 });
      await ev(`document.querySelector('.pf-pk-foot [data-act="cancel"]').click(); true`);
      await reset();
    } finally { FILES = FILES_REAL; DIR_CLOCK = null; ASK_DOOR.delete('~/work/payments/季度对账-二/'); }
  }
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

console.log('\n── ⑯ the mounts dialog\'s Save while a field is edited (B-5736\'s follow) ──');
{
  // THE SCENE (r1218 5): Save commits the fields one after another; field B's answer is HELD (a stall placed in the listing's reply),
  // ONLY B's text (A's asks answered), and while it is held the person edits field A to another folder. A's box no longer shows the path its press took: its value is
  // nothing (B-5736), so the Save asks A again, once, and saves what A's box shows. (RED: the tip before the follow, 3ee1ed432 — no
  // re-check: A saved its OLD folder under the new text)
  await load();
  await ev('window.mkMounts()');
  const inA = `document.querySelectorAll('#b5736-dlg .path-field input')[0]`, inB = `document.querySelectorAll('#b5736-dlg .path-field input')[1]`;
  const fieldsSeen = await until(`document.querySelectorAll('#b5736-dlg .path-field input').length === 2`, 5000);
  ok('⑯ the real mounts dialog draws its two folder fields (the field at the door)', !!fieldsSeen, await ev(`document.querySelectorAll('#b5736-dlg .path-field input').length`));
  const focusType = async (which, text) => { await ev(`(() => { const i = ${which}; i.focus(); i.select(); return true; })()`); await type(text); };
  await focusType(inA, '~/work/payments');
  await ev(`(() => { ${inB}.focus(); return true; })()`);   // A left: its blur commits ~/work/payments (answered)
  const aTook = await until(`(() => { const v = ${inA}._pathField.value(); return v && v.path === ${JSON.stringify(path.join(HOME, 'work/payments'))} ? v.path : null; })()`, 8000);
  ok('⑯ A took ~/work/payments on its blur (its value is that folder)', !!aTook, aTook);
  const held = holdPath('/api/dir-complete', '~/work/contracts');   // ONLY B's text is held: A's own asks are answered
  await focusType(inB, '~/work/contracts');
  await ev(`(() => { document.querySelector('#b5736-dlg .btn-create').click(); return true; })()`);   // Save: A judged, then B's press waits on its held answer
  const aJudged = await until(`(() => { const v = ${inA}._pathField.value(); return v && v.path === ${JSON.stringify(path.join(HOME, 'work/payments'))} && document.querySelector('#b5736-dlg .btn-create').disabled ? true : null; })()`, 8000);
  ok('⑯ the Save took A and now waits on B (B\'s text held, the Save still running)', !!aJudged, await ev(`({ a: ${inA}._pathField.verdict(), busy: document.querySelector('#b5736-dlg .btn-create').disabled })`));
  await focusType(inA, '~/work/compute-deal');   // the person edits A while B's answer is held (A's own ask is answered)
  const aShows = await until(`(() => { const v = ${inA}._pathField.verdict(); return v.status === 'ok' && v.path === ${JSON.stringify(path.join(HOME, 'work/compute-deal'))} ? v.path : null; })()`, 8000);
  ok('⑯ A\'s line shows the folder its box now holds (~/work/compute-deal), while B is still held', !!aShows, await ev(`${inA}._pathField.verdict()`));
  held.open();
  const saved = await until('window.__saved', 10000);
  console.log('  · ⑯ the Save (the facts judged): ' + JSON.stringify({ saved, boxA: await ev(`${inA}.value`), err: await ev(`document.querySelector('#b5736-dlg .cfg-err')?.textContent || ''`) }));
  ok('⑯ the Save saves what A\'s box SHOWS when it took (~/work/compute-deal, asked again once), never the folder of A\'s earlier press', !!saved && saved.a === path.join(HOME, 'work/compute-deal') && saved.b === path.join(HOME, 'work/contracts'), saved);
  await ev(`document.getElementById('b5736-dlg')?.remove(); true`);
}

console.log('\n── ⑰ the page\'s one gate: twelve folder fields set at once (B-f3a1, ruled r1279) ──');
{
  // A page builds twelve folder fields and a DOOR sets all twelve at once; every check the machine gets is HELD (a stall placed in the
  // listing's reply — a machine that does not reply). The page's ONE gate (four in flight, one kept for a person's asks): the machine
  // never has more than THREE of the doors' checks; the PERSON then types in the twelfth field (its door ask still queued) and that
  // check reaches the machine AT ONCE, while the three are still held; released, the doors' follow, never more than four at once.
  // (RED: the release before this unit — no gate: the browser's own six at once, the person's behind them)
  await load();
  await ev('window.mkMany(12)');
  DIRQ.on = true; DIRQ.now = 0; DIRQ.max = 0; DIRQ.order.length = 0;
  const held = holdPath('/api/dir-complete');
  await ev(`(() => { window.many.forEach((pf, k) => pf.set('~/work/door-' + k, { commit: false })); return true; })()`);   // a door sets all twelve
  const three = await until(() => (DIRQ.order.length >= 3 ? DIRQ.order.slice() : null), 8000);
  await ev(`(() => { const i = document.getElementById('many-11'); i.focus(); i.select(); return true; })()`);
  await type('~/work/payments');   // the PERSON types: the debounced ask is the person's — it takes the kept slot (no press: nothing aborted and sent again)
  const personArrived = await until(() => (DIRQ.order.includes('~/work/payments') ? DIRQ.order.slice() : null), 8000);
  const whileHeld = { arrived: DIRQ.order.length, now: DIRQ.now, max: DIRQ.max };
  held.open();
  const all = await until(() => (DIRQ.order.length >= 12 && DIRQ.now === 0 ? DIRQ.order.slice() : null), 15000);
  DIRQ.on = false;
  console.log('  · ⑰ the machine\'s view (the facts judged): ' + JSON.stringify({ firstThree: three, whileHeld, max: DIRQ.max, order: all || DIRQ.order.slice() }));
  ok(`⑰ the doors never have more than THREE checks in flight — the fourth slot is kept for a person (held: ${three ? three.length : 0} arrived, none more)`, !!three && !!personArrived && personArrived.indexOf('~/work/payments') === 3 && personArrived.slice(0, 3).every((t) => t.startsWith('~/work/door-')), { three, personArrived });
  ok(`⑰ the PERSON's check reaches the machine AT ONCE, while the doors' three are still held (4th arrival; in flight then: ${whileHeld.now})`, !!personArrived && whileHeld.arrived === 4 && whileHeld.now === 4, whileHeld);
  ok(`⑰ the page never has more than four checks in flight (most at once: ${DIRQ.max}); field 11's door ask, superseded by the person's, never reaches the machine`, DIRQ.max === 4 && !!all && all.filter((t) => t === '~/work/door-11').length === 0, { max: DIRQ.max, all });
  await ev(`document.getElementById('many')?.remove(); true`);
}

console.log('\n── ⑱ THE LATE FACTS DRAWN (主开发 r1633 / r1636, both roads): a kid\'s own fact lands after the answer — ONE quiet re-ask, marked late, brings it ──');
{
  // the machine's road: the REAL agent of this tree (the built bundle) collects the facts THERE; this hub shapes them (hosts.dirSlice)
  const { DeviceManager } = require('../src/agentd/client.js');
  const { endDaemonsAndWait } = await import('./scratch.mjs');
  process.env.VIBESPACE_AGENTD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pf-agentd-'));
  const dmP = new DeviceManager({ dataDir: path.join(TMP, 'pair-data'), bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  process.on('exit', () => { try { endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT); } catch { } });
  let paired = null; try { await dmP.connect(); paired = dmP; } catch (e) { ok('⑱ the paired machine\'s agent starts (this tree\'s bundle)', false, String(e.message || e)); }
  hm._devices = new Map([...(hm._devices || []), ['h-pair', paired]]);
  const asksOf = (dir) => ev(`performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.includes('dir-complete') && decodeURIComponent(u).includes('path=~/${dir}/'))`);
  const start = async (hostVal, dir) => {
    await reset();
    await ev(`(() => { const s = document.getElementById('host'); if (![...s.options].some((o) => o.value === 'h-pair')) s.add(new Option('paired', 'h-pair')); s.value = ${JSON.stringify(hostVal)}; window.pf.refresh(); performance.clearResourceTimings(); document.getElementById('cwd').focus(); return true; })()`);
    await type(`~/${dir}/`);
  };
  // ⑱ (主开发 r4197) EVERY LEG STANDS ON ITS OWN FACTS, on both roads. Every folder of the section is made HERE, once, so the home's time
  // never moves inside the section (a new home folder makes every home folder's own «self» fact owed again, src/dir-collect.js selfOf,
  // and those calls take the suite's ONE worker at a leg's kid's facts call: refused, late at once, not kept — the cold case). Each leg
  // has its own folder and kid that no other leg lists or reads. The kid is the suite's dead-path stand-in (src/dir-ops.js deadStandIn;
  // VIBESPACE_DIROPS_TEST=1 above the hub's pool and in the device agent's kept environment): its facts read is HELD in the worker that
  // reads it — `.held` once it began, `.left` once it returned — and only its own leg's `.go` lets it go, so «not returned when the
  // re-ask arrived» and «returned before its reply went out» are facts of the placement. Before each leg's ask the road's facts are
  // placed by the suite's own direct asks of the home until the road's own reply says nothing is owed (its `factsLate` false), and the
  // leg's own ask waits at the door until the road is settled (the hub: its pool idle, its counters idle; both: no other ask open). On
  // this hub the collector's own count of refused calls is read across the road. Every red control first proves its road happened. No
  // bound raised, no retry, no sleep that guesses
  const deadKid = (dir, name = 'vs-dead-kid') => { const k = path.join(HOME, dir, name); fs.mkdirSync(path.join(k, '.git'), { recursive: true }); const old = (Date.now() - 3600e3) / 1000; fs.utimesSync(k, old, old); fs.utimesSync(path.join(HOME, dir), old, old); return k; };
  const KIDS = {}; for (const d of ['lateh', 'tiph', 'redh', 'pasth', 'latep', 'redp', 'pastp', 'rcpth', 'rcptp']) KIDS[d] = deadKid(d);
  const kB = deadKid('busyh', 'vs-dead-a'), kZ = deadKid('busyh', 'vs-dead-zz');
  const began = (k) => fs.existsSync(path.join(k, '.held')), hasLeft = (k) => fs.existsSync(path.join(k, '.left'));
  const isHeld = (k) => began(k) && !hasLeft(k), letGo = (k) => fs.writeFileSync(path.join(k, '.go'), '');
  const idleNow = () => (app.locals.safeFs.stats().inflight === 0 ? true : null);
  const hubSlice = () => app.locals._dirSlice;
  const refusedNow = () => hubSlice().stats().noIdle.refused;
  const countersIdle = () => Object.values(hubSlice()._counters).every((c) => c.busy === 0 && c.q.length === 0);
  // the road settled: no other ask open at the hub (`own` = the leg's own ask held at the door), and on this hub its pool and counters idle
  const settled = (hostVal, own = 0) => (OPEN.n <= own && (hostVal || (idleNow() && countersIdle())) ? true : null);
  const homeAsk = (hostVal) => `${BASE}${hostVal ? `/api/hosts/${hostVal}/dir-complete` : '/api/dir-complete'}?path=${encodeURIComponent('~/')}&bases=${encodeURIComponent('["~"]')}&probe=${encodeURIComponent('[]')}&q=&kind=folder`;
  // the road's facts PLACED (never a leg's judged ask): the home asked directly until the road's own reply owes nothing, the road settled
  const warmUp = async (hostVal) => {
    for (let i = 0; i < 40; i++) {
      await until(() => settled(hostVal), 5000);
      const d = await fetch(homeAsk(hostVal)).then((r) => r.json(), () => null);
      if (d && d.listing && !d.factsLate && settled(hostVal)) return true;
    }
    return false;
  };
  // THE HELD ASK's OWN PROBES placed (r4234 — row 794: a leg's probe stats, kept 30 s from landing, had expired by its turn; stated
  // again on the one worker beside its listing, refused and re-asked past the reply's budget, they were still out at the kid's facts
  // call): the home asked directly with EXACTLY that ask's probe list until its reply says none late, none failed and nothing owed
  const probeAsk = (hostVal, probe) => `${BASE}${hostVal ? `/api/hosts/${hostVal}/dir-complete` : '/api/dir-complete'}?path=${encodeURIComponent('~/')}&bases=${encodeURIComponent('["~"]')}&probe=${encodeURIComponent(probe)}&q=&kind=folder`;
  const warmProbes = async (hostVal, probe) => {
    for (let i = 0; i < 40; i++) {
      await until(() => settled(hostVal, 1), 5000);
      const d = await fetch(probeAsk(hostVal, probe)).then((r) => r.json(), () => null);
      if (d && d.listing && !d.partial && !d.factsLate && !d.rowsLate && !(d.probesLate || []).length && !(d.probesFailed || []).length && settled(hostVal, 1)) return true;
    }
    return false;
  };
  // the door of a leg's own ask: its probes placed, then the road settled (its listing is the one call it makes before the kid's)
  const doorFor = (hostVal) => async (req) => { await warmProbes(hostVal, String(req.query.probe || '[]')); return until(() => settled(hostVal, 1), 5000); };
  const drawnAs = (dir, name) => ev(`(() => { const r = [...document.querySelectorAll('.pf-list .pf-item')].find((x) => x.querySelector('.pf-path').textContent.replace(/^\\u200e/, '') === '~/${dir}/${name}'); return r ? (r.querySelector('.pf-chip[title="git"]') ? 'git' : 'row') : 'none'; })()`);
  // what a reply carried for the kid (its listing's own entry), read as the route sends it
  // …and, printed, what the page makes of it by the page model's own word (src/path-field-model.js replyKind): its kind, whether it
  // carried a listing at all, its error words (r4235: a late reply the page does not merge — what it carried, and whether any is dropped)
  const PFM18 = require('../src/path-field-model.js');
  // …and the MOMENT it is handed to the route's json, before it is sent (`sentAt`, with `atSend` read then): the page cannot take a reply
  // before that moment, so every receipt is read against it — never against the route's `finish`, which Node emits only once its loop
  // turns after the bytes are out (r4345: the mirror's paired control read «not received» on a reply the page had taken before it)
  const readOut = (res, dir, name, into, atSend = null) => { const send = res.json.bind(res); res.json = (b) => { const e = b && b.listing && b.listing.dirs && b.listing.dirs[`~/${dir}/${name}`]; into.carried = !!(e && e.git); into.reply = { kind: PFM18.replyKind(b), listing: !!(b && b.listing), kid: !!e, partial: !!(b && b.partial), error: String((b && b.error) || '').slice(0, 160) }; if (!into.sentAt) { if (atSend) atSend(); into.sentAt = Date.now(); } return send(b); }; };
  // the page's own word that it TOOK a reply handed over at or after `sentAt` (the same machine's clock) as the field's current one —
  // merged, the model told and the rows painted in that same step (src/lib/path-field.js sliceAsk: trace, then fire → paint)
  const taken = async (sentAt) => (await ev(`window.pf.trace().some((x) => x.at >= ${sentAt} && x.how === 'current' && x.listing)`));
  // …and its word that it RECEIVED a reply handed over at or after `sentAt`, whatever it made of it (past the bound: a late reply that is not a
  // complete listing is not merged — r1636 — and is still the reply the leg reads the badge after; row 794's paired leg)
  const received = async (sentAt) => (await ev(`window.pf.trace().some((x) => x.at >= ${sentAt})`));
  const letGoWhenHeld = (k) => { until(() => (isHeld(k) ? true : null), 3000).then(() => setImmediate(() => letGo(k))); };   // inside the re-ask's wait
  const letGoAtReply = (k, res) => res.on('finish', () => letGo(k));   // only once the re-ask's reply is out
  // ONE LEG's ROAD: its own kid, the road warmed, its own ask held at the door until the road is settled; the quiet re-ask's arrival
  // hooked, its reply read on its way out and taken by the page; the hub's refused calls counted across it
  // (`holdFinish`: the route's `finish` HELD until the page has received the reply — the receipt leg's placement, below)
  const road = async (hostVal, dir, onLate, { strip = false, holdFinish = false } = {}) => {
    const k = KIDS[dir], S = { lateAt: false, leftAtArrival: null, leftAtReply: null, sentAt: 0, outAt: 0, carried: null, refused: null, took: false, got: false };
    const warm = await warmUp(hostVal), r0 = hostVal ? 0 : refusedNow();
    ASK_DOOR.set(`~/${dir}/`, doorFor(hostVal));
    LATE_HOOK.strip = strip;
    LATE_HOOK.on.set(`~/${dir}/`, (req, res) => {
      S.lateAt = true; S.leftAtArrival = hasLeft(k); readOut(res, dir, 'vs-dead-kid', S, () => { S.leftAtReply = hasLeft(k); });
      if (holdFinish) { const emit = res.emit.bind(res); res.emit = (ev, ...a) => { if (ev !== 'finish') return emit(ev, ...a); until(async () => (S.sentAt && (await received(S.sentAt)) ? true : null), 6000).then(() => emit(ev, ...a)); return true; }; }
      res.on('finish', () => { S.outAt = Date.now(); }); onLate(k, res);
    });
    await start(hostVal, dir);
    S.got = !!(await until(async () => (S.sentAt && (await received(S.sentAt)) ? true : null), 6000));
    if (!S.got) console.log(`  ⑱ HARNESS: the page's receipt of ~/${dir}/'s re-ask reply did not come within 6 s (handed to the route: ${!!S.sentAt})`);
    S.took = !!(S.got && (await taken(S.sentAt)));
    LATE_HOOK.strip = false;
    S.refused = hostVal ? 0 : refusedNow() - r0;
    return { k, S, warm };
  };
  // (r4237, row 796: the count of refused calls on a road includes the placement's OWN asks, which the one worker refuses and re-asks
  // by design — it is PRINTED; the road is proved by the seam's own files: the kid's read began, and returned before or after the reply)
  const joined = (S) => !!(S.lateAt && S.leftAtArrival === false && S.leftAtReply === true && S.carried === true && S.took);
  const roadLegs = async (name, hostVal, tag) => {
    // (a) DRAWN FROM THE QUIET RE-ASK's ONE REPLY: the kid's facts call out when the re-ask arrives (it joins it), let go inside its wait
    const a = await road(hostVal, `late${tag}`, letGoWhenHeld);
    const drawnA = await until(async () => ((await drawnAs(`late${tag}`, 'vs-dead-kid')) === 'git' ? true : null), 6000);
    const asksA = await asksOf(`late${tag}`);
    ok(`⑱ ${name}: the kid's git badge is DRAWN from the quiet re-ask's one reply — the road warmed (nothing owed: ${a.warm}), the kid's facts read out there when the re-ask arrived (returned: ${a.S.leftAtArrival}) and let go inside its wait (the reply after it returned: ${a.S.leftAtReply}, carrying the git: ${a.S.carried}; refused calls on the road, the placement's own included, printed: ${a.S.refused}) — ${asksA.length} asks, the second marked late=1, no third`,
      !!(a.warm && joined(a.S) && drawnA && asksA.length === 2 && !asksA[0].includes('late=1') && asksA[1].includes('late=1')), { asks: asksA, S: a.S, drawn: await drawnAs(`late${tag}`, 'vs-dead-kid') });
    await key('Escape'); ASK_DOOR.delete(`~/late${tag}/`);
    if (!hostVal) {
      // THE PAGE's RED (主开发 r4184): the SAME road on the component built with its rows memo keyed as at the train's tip (the folders'
      // count, the recents' count; a fresh page, a world of its own): its road first PROVED (the reply carried the git, the page took
      // it as current) — then the row drawn WITHOUT the badge. (On this hub the late reply only adds the git to a folder already listed)
      await load(false, 't-tip.html');
      const r = await road('', 'tiph', letGoWhenHeld);
      const tip = { warm: r.warm, ...r.S, drawn: await drawnAs('tiph', 'vs-dead-kid'), asks: (await asksOf('tiph')).length, trace: await ev('window.pf.trace().slice(-3)') };
      await key('Escape'); ASK_DOOR.delete('~/tiph/'); await load(false, 't.html');
      ok(`⑱ this hub RED CONTROL (the page's law): the same road on the component with its rows memo keyed on the folders' COUNT — its road happened (the re-ask's reply carried the kid's git: ${tip.carried}, after the read returned: ${tip.leftAtReply}; refused: ${tip.refused}; the page took it as current: ${tip.took}) — and the row was drawn WITHOUT the badge (${tip.drawn}), ${tip.asks} asks`,
        !!(tip.warm && joined(tip) && tip.drawn === 'row' && tip.asks === 2), tip);
    }
    // THE HUB's WAIT, ITS RED: the SAME road with the re-ask's late mark stripped on the way (the release's road), the read let go only
    // once that reply is out — its road proved (the read out at the arrival AND at the reply, and back once let go): the reply goes
    // out without the git, no badge, and the page asks no third time
    const R = await road(hostVal, `red${tag}`, letGoAtReply, { strip: true });
    const backR = await until(() => (hasLeft(R.k) ? true : null), 3000);
    const red = { warm: R.warm, ...R.S, back: !!backR, drawn: await drawnAs(`red${tag}`, 'vs-dead-kid'), asks: (await asksOf(`red${tag}`)).length };
    ok(`⑱ ${name} RED CONTROL (the hub's wait): the same quiet re-ask UNMARKED goes out before the kid's read returned (${red.leftAtReply}) and without the git (${red.carried}) — the read out there all along (back once let go: ${red.back}; refused: ${red.refused}) — no badge (${red.drawn}), ${red.asks} asks, none more`,
      !!(red.warm && red.lateAt && red.leftAtArrival === false && red.leftAtReply === false && red.carried === false && red.back && red.took && red.drawn === 'row' && red.asks === 2), red);
    await key('Escape'); ASK_DOOR.delete(`~/red${tag}/`);
    // PAST THE BOUND: the MARKED re-ask waits its own bound (LATE_WAIT_MS) and says the rest is late — the read let go only once that
    // reply is out: no git in it, no badge, NO third ask. The read comes back and its fact is kept there (a call that returns is kept,
    // whatever its asker's wait: src/dir-collect.js askFacts) — the next ask of the text (held at the door until the road is settled)
    // brings the badge
    const P = await road(hostVal, `past${tag}`, letGoAtReply);
    const backP = await until(() => (hasLeft(P.k) ? true : null), 3000);
    const mid = { warm: P.warm, ...P.S, back: !!backP, asks: await asksOf(`past${tag}`), drawn: await drawnAs(`past${tag}`, 'vs-dead-kid'), trace: await ev('window.pf.trace().slice(-3)') };
    await ev(`window.pf.refresh(); true`);
    const later = await until(async () => ((await drawnAs(`past${tag}`, 'vs-dead-kid')) === 'git' ? true : null), 6000);
    ok(`⑱ ${name}: past the bound the re-ask says the rest is late — its reply out before the read returned (${mid.leftAtReply}) and without the git (${mid.carried}), no badge (${mid.drawn}) once the page received it (${mid.got}; the reply's kind «${mid.reply && mid.reply.kind}», a listing: ${!!(mid.reply && mid.reply.listing)}${mid.reply && mid.reply.error ? `, its words «${mid.reply.error}»` : ''}; the page filed it «${((mid.trace || []).find((x) => x.at >= mid.sentAt) || {}).how}», a listing: ${!!((mid.trace || []).find((x) => x.at >= mid.sentAt) || {}).listing}), NO third ask (${mid.asks.length} asks); the read came back (${mid.back}; refused: ${mid.refused}) — the next ask brings the badge (${!!later})`,
      !!(mid.warm && mid.lateAt && mid.leftAtArrival === false && mid.leftAtReply === false && mid.carried === false && mid.back && mid.got && mid.drawn === 'row' && mid.asks.length === 2 && later), { mid, later: await drawnAs(`past${tag}`, 'vs-dead-kid') });
    await key('Escape'); await reset(); ASK_DOOR.delete(`~/past${tag}/`);
  };
  const busyLegs = async () => {
    // (b) NO IDLE WORKER AT THE KID's FACTS CALL (the box's shape, a leg of its own — this hub's pool; the agent's handle queues its
    // reads, it refuses none): the folder's FIRST kid (by name) is a vs-dead folder whose facts read takes the one worker and is held;
    // the next kid's facts call finds no idle worker: REFUSED — late at once, not kept (its read never began; the collector's own
    // count moves) — and the quiet re-ask starts none: no git in its reply, no badge, NO third ask. THE NEXT ASK (the premise put right):
    // a FRESH ask STARTS the refused kid's call behind its answer and earns ONE more quiet re-ask (r1399 (4)), which joins that call —
    // that read let go once held, inside the second re-ask's wait — and that reply, which only adds the git to a folder listed, draws it
    const busyDir = 'busyh', B = { lateAt: false, aLeftAtReply: null, zzBegan: null, carried: null, sentAt: 0, outAt: 0 }, B2 = { lateAt: false, leftAtArrival: null, leftAtReply: null, carried: null, sentAt: 0, outAt: 0 };
    const warmB = await warmUp(''), r0 = refusedNow();
    ASK_DOOR.set(`~/${busyDir}/`, doorFor(''));
    LATE_HOOK.on.set(`~/${busyDir}/`, (req, res) => { B.lateAt = true; readOut(res, busyDir, 'vs-dead-zz', B, () => { B.aLeftAtReply = hasLeft(kB); B.zzBegan = began(kZ); }); res.on('finish', () => { B.outAt = Date.now(); letGo(kB); }); });
    await start('', busyDir);
    const tookB = await until(async () => (B.sentAt && (await taken(B.sentAt)) ? true : null), 6000);
    if (!tookB) console.log(`  ⑱ HARNESS: the page's taking of ~/${busyDir}/'s re-ask reply did not come within 6 s (handed to the route: ${!!B.sentAt})`);
    const backB = await until(() => (hasLeft(kB) ? true : null), 3000);
    const atAsk = { warm: warmB, ...B, refused: refusedNow() - r0, took: !!tookB, back: !!backB, asks: (await asksOf(busyDir)).length, drawn: await drawnAs(busyDir, 'vs-dead-zz') };
    ok(`⑱ this hub, NO IDLE WORKER (the box's shape, a leg of its own): the one worker held by the folder's first kid's read (not returned at the re-ask's reply: ${atAsk.aLeftAtReply === false}; back once let go: ${atAsk.back}) — the next kid's call REFUSED: its read never begun (${atAsk.zzBegan === false}), no git in the re-ask's reply (${atAsk.carried}), no badge (${atAsk.drawn}), NO third ask (${atAsk.asks} asks)`,
      !!(atAsk.warm && atAsk.lateAt && atAsk.aLeftAtReply === false && atAsk.back && atAsk.zzBegan === false && atAsk.carried === false && atAsk.took && atAsk.drawn === 'row' && atAsk.asks === 2), atAsk);
    const r1 = refusedNow();
    LATE_HOOK.on.set(`~/${busyDir}/`, (req, res) => { B2.lateAt = true; B2.leftAtArrival = hasLeft(kZ); readOut(res, busyDir, 'vs-dead-zz', B2, () => { B2.leftAtReply = hasLeft(kZ); }); res.on('finish', () => { B2.outAt = Date.now(); }); letGoWhenHeld(kZ); });
    await ev(`window.pf.refresh(); true`);
    const nextDrawn = await until(async () => ((await drawnAs(busyDir, 'vs-dead-zz')) === 'git' ? true : null), 6000);
    const asksB = await asksOf(busyDir), next = { ...B2, refused: refusedNow() - r1, took: !!(B2.sentAt && (await taken(B2.sentAt))) };
    ok(`⑱ this hub, NO IDLE WORKER, THE NEXT ASK: a fresh ask (held at the door until the hub is settled) starts the refused kid's call and earns one more quiet re-ask, which arrives with that read out there (returned: ${next.leftAtArrival}) and lets it go inside its wait (the reply after it returned: ${next.leftAtReply}, carrying the git: ${next.carried}; refused: ${next.refused}) — the badge drawn (${!!nextDrawn}), ${asksB.length} asks, the fourth marked late=1`,
      !!(joined(next) && nextDrawn && asksB.length === 4 && !asksB[2].includes('late=1') && asksB[3].includes('late=1')), { next, asks: asksB, drawn: await drawnAs(busyDir, 'vs-dead-zz') });
    await key('Escape'); await reset(); ASK_DOOR.delete(`~/${busyDir}/`);
  };
  await roadLegs('this hub', '', 'h');   // r4143 / r4197: this hub's road, placed
  await busyLegs();
  if (paired) await roadLegs('the paired machine', 'h-pair', 'p');   // r4197: the paired machine's road, the same seam and the same legs
  // THE RECEIPT's OWN CLOCK (主开发 r4345 — the mirror's red-then-green row: the paired machine's hub's-wait control read «not received»
  // and «not taken» on a reply that WAS a complete listing): the legs read the page's receipt against the route's `finish`, which Node
  // emits only once its loop turns after the bytes are out — under load the page takes the reply BEFORE it. PLACED, RED AT WILL: the
  // same control's road (the re-ask unmarked, the read let go once its reply is out) with the route's `finish` HELD until the page has
  // received the reply: read against `finish` (the old reading) the page received nothing; read against the moment the reply was handed
  // to the route's json (the reading every leg now uses: the page cannot take it before) it received it
  {
    const [name, hostVal, dir] = paired ? ['the paired machine', 'h-pair', 'rcptp'] : ['this hub', '', 'rcpth'];
    const R = await road(hostVal, dir, letGoAtReply, { strip: true, holdFinish: true });
    const out = await until(() => (R.S.outAt ? true : null), 8000);
    const back = await until(() => (hasLeft(R.k) ? true : null), 3000);
    const oldRule = await received(R.S.outAt), newRule = await received(R.S.sentAt);
    ok(`⑱ ${name}, THE RECEIPT's OWN CLOCK (the hub's-wait control's road, the route's finish HELD until the page received the reply): read against the route's finish the page received nothing (received: ${oldRule}) — RED AT WILL, the mirror's row — and read against the moment the reply was handed to the route it received it (${newRule}); the reply a ${R.S.reply && R.S.reply.kind} without the git (${R.S.carried}), the read back once let go (${!!back})`,
      !!(R.warm && R.S.lateAt && R.S.sentAt && out && R.S.outAt > R.S.sentAt && oldRule === false && newRule === true && R.S.got && R.S.carried === false && back), { S: R.S, oldRule, newRule, back: !!back });
    await key('Escape'); await reset(); ASK_DOOR.delete(`~/${dir}/`);
  }
  for (const k of [...Object.values(KIDS), kB, kZ]) letGo(k);   // nothing of these left held in a worker
  try { endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT); } catch { }
}

ok(`⑮ 0 page errors`, errors.length === 0, errors);
ws.close(); server.close();
console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''}`);
process.exit(bad ? 1 : 0);
