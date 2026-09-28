#!/usr/bin/env node
// OPEN WITH LIBREOFFICE, END TO END (docs/design-desktop-apps.zh.md §7.9; the owner's ruling 2026-09-27 ②: a Word
// file is EDITED in LibreOffice running as a VibeSpace desktop app — the xpra rung). A REAL worktree server, the
// REAL xpra rung and a REAL LibreOffice Writer on this box, a headless Chrome driving the product like a person:
//   §1 the verdict route — GET /api/desktop/open-with: a .docx ⇒ ok / libreoffice-writer; a relative path, a .txt,
//      a display string ("host: /path") ⇒ refused by name, no machine asked;
//   §2 the launch route's machine rule BEFORE any machine is asked — the file on another machine ⇒ 409
//      machine-mismatch, a non-office app ⇒ 400 not-office-app, a typed command + file ⇒ not-office-app; nothing
//      recorded;
//   §3 THE EXPLORER ROW → THE DOOR → THE WINDOW: a file explorer on the fixture folder, a right-click on the .docx
//      shows "Open with LibreOffice" (screenshot), a trusted click opens a desktop-app window; the record's argv is
//      `--writer`, `--nologo`, the session's OWN profile (-env:UserInstallation inside data/desktop-apps/<id>/), and
//      THE PATH LAST as one item (the running process's /proc cmdline agrees), the label is the basename, the rung
//      is xpra; the VibeSpace window's title carries the basename (LibreOffice's own title through the xpra
//      protocol) and its picture is painted (screenshot);
//   §4 after editing: the fixture's mtime bumped while the app runs, Stop through the keeper ⇒ exited, every
//      recorded pid gone, the profile removed (a person's ending), the record says fileChanged, and ONE
//      `file-changed {host: null, path, mtime}` reached a ws client AND the page's window event; CONTROL: a second
//      session on the same file stopped with the file untouched ⇒ fileChanged false, no signal;
//   §5 the code editor honours the signal: an editor on a text file, the file rewritten on disk, a signal naming
//      ANOTHER file changes nothing (CONTROL), the signal naming it reloads the editor at once (never the 15 s poll);
//   §6 A MACHINE WITHOUT LIBREOFFICE (the server rebooted on a scratch PATH that hides libreoffice + soffice — nothing
//      is uninstalled): the verdict route answers app-absent with the install remedy; the explorer's menu says, in
//      one plain sentence, that LibreOffice Writer is not installed on this machine and offers "Install LibreOffice
//      on this machine…" (no greyed row — screenshot); clicking it shows the PLAN first (libreoffice-writer + the
//      Carlito / Caladea faces, nothing run — screenshot); the door answers with the launch dialog in FILE MODE
//      (the sentence + the install offer — screenshot).
// SKIPs with evidence without LibreOffice Writer (none of libreoffice/soffice on PATH, or its libswlo.so absent),
// xpra / xauth / Xvfb, python3 + python-docx (the fixture), or chrome. Worktree-isolated (own data/, scratch HOME,
// VIBESPACE_SKIP_AGENT_HOOKS=1, per-run singleton-Desktop names — vncEnv, never :7/5901); every app this run starts
// is stopped through the product and the exit sweep reaps by EVIDENCE (the session marker in a process's environ).
// Screenshots go to $VS_OFFICE_SHOTS when set. Run: node scripts/test-office-desktop.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, vncEnv, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const O = require('../src/office-open.js');
const WebSocket = require('ws');
const bin = (n) => D.binOnPath(n, { env: process.env });
const XPRA = bin('xpra'), XAUTH = bin('xauth'), XVFB = bin('Xvfb'), PY = bin('python3');
const facts = await D.hostFacts({});
const office = facts.office || {};
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
let pyDocx = false;
if (PY) { try { execFileSync(PY, ['-c', 'import docx'], { stdio: 'ignore', timeout: 10000 }); pyDocx = true; } catch { pyDocx = false; } }
const skipWhy = !office.path ? `LibreOffice is not on PATH (none of ${O.OFFICE_EXECS.join(', ')})` : office.modules && !office.modules.writer ? `LibreOffice Writer is not installed (${path.join(office.program || '?', O.OFFICE_MODULES.writer.lib)} absent)` : !XPRA ? 'xpra not on PATH' : !XAUTH ? 'xauth not on PATH' : !XVFB ? 'Xvfb not on PATH' : !pyDocx ? 'python3 with python-docx is not available (the .docx fixture is made with it)' : !CHROME ? 'no chrome/chromium' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
let loVersion = '';
try { loVersion = execFileSync(office.path, ['--version'], { encoding: 'utf8', timeout: 20000 }).trim(); } catch { loVersion = '?'; }
console.log(`box: ${loVersion} at ${office.path} (modules ${JSON.stringify(office.modules)}), xpra ${XPRA}, chrome ${CHROME}`);

const VNC_ENV = await vncEnv();
const SHOTS = process.env.VS_OFFICE_SHOTS ? path.resolve(process.env.VS_OFFICE_SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('office-desk-srv');
const home = scratchHome('office-desk-home', fs);
const docs = scratch('office-desk-docs');
const chromeDir = scratch('office-desk-chrome');
const nolo = scratch('office-desk-nolo-bin');
fs.mkdirSync(docs, { recursive: true });
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };
const T0 = Date.now();

// ── the fixture: a real .docx (python-docx 1.2.0 on this box), a space in its name (the path is ONE argv item) ──
const DOCX = path.join(docs, `Quarterly report ${process.pid}.docx`);
execFileSync(PY, ['-c', `import docx,sys\nd=docx.Document()\nd.add_heading('VibeSpace office fixture',1)\nd.add_paragraph('Opened by test-office-desktop — the LibreOffice desktop app.')\nt=d.add_table(rows=2,cols=2)\nt.cell(0,0).text='a';t.cell(0,1).text='b';t.cell(1,0).text='c';t.cell(1,1).text='d'\nd.save(sys.argv[1])`, DOCX], { timeout: 20000 });
const NOTES = path.join(docs, `notes ${process.pid}.txt`);
fs.writeFileSync(NOTES, 'first line\n');
check('the fixture .docx exists (python-docx)', fs.statSync(DOCX).size > 1000, fs.statSync(DOCX).size);

// ── the worktree server ──
const srvEnvBase = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
let srv = null;
const srvLog = [];
const bootServer = (extra = {}) => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...srvEnvBase, ...extra, ...VNC_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }); srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d))); return srv; };
const ORIGIN = `http://127.0.0.1:${PORT}`;
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { const r = await fetch(`${ORIGIN}/api/home`); if (r.ok || r.status) return true; } catch { await sleep(250); } } return false; };
const j = async (method, p, body) => { const r = await fetch(`${ORIGIN}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; };
const recordedApps = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps); } catch { return []; } };
const recordedPids = () => recordedApps().flatMap((a) => Object.values(a.pids || {})).filter(Boolean);
const appDir = (id) => path.join(wt, 'data', 'desktop-apps', id);
const markerHits = () => {
  const ids = recordedApps().map((a) => a.id).filter(Boolean);
  const needles = [...ids.map((id) => `VIBESPACE_DESKTOP_APP=${id}`), ...ids.map((id) => `XAUTHORITY=${path.join(appDir(id), 'Xauthority')}`)];
  const hit = [];
  if (!needles.length) return hit;
  for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d) || Number(d) === process.pid) continue; if (needles.some((n) => D.environHas(Number(d), n))) hit.push(Number(d)); }
  return hit;
};
let chrome = null;
const sockets = [];
const cleanup = () => {
  for (const s of sockets) { try { s.close(); } catch {} }
  try { chrome?.kill('SIGKILL'); } catch {}
  try { srv?.kill('SIGKILL'); } catch {}
  for (const p of recordedPids()) { try { process.kill(p, 'SIGKILL'); } catch {} }
  const swept = markerHits();
  for (const p of swept) { try { process.kill(p, 'SIGKILL'); } catch {} }
  if (swept.length) console.log(`  (exit sweep reaped ${swept.length} process(es) still carrying this run's marker: ${swept.join(', ')})`);
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [home, docs, chromeDir, nolo]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) { execSync(`rm -rf '${wt}/${f}' && cp -r '${repo}/${f}' '${wt}/${f}'`); }
fs.symlinkSync(fs.realpathSync(path.join(repo, 'node_modules')), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
try { execSync('npm run build', { cwd: wt, stdio: 'pipe' }); } catch (e) { console.error(String(e.stdout || '').split('\n').filter((l) => /✗|Error/.test(l)).slice(0, 20).join('\n')); throw e; }

bootServer();
check('worktree server boots', await waitServer());
// a ws client of our own: every broadcast this run causes
const wsMsgs = [];
const wsc = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); sockets.push(wsc);
wsc.on('message', (d) => { try { const m = JSON.parse(d); if (m && m.type === 'file-changed') wsMsgs.push({ ...m, at: Date.now() }); } catch {} });
await new Promise((r) => { wsc.once('open', r); wsc.once('error', r); });

// ── chrome ──
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cdpTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
async function page(tg) {
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  sockets.push(ws);
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
  await cdp('Page.enable');
  return { ws, cdp, evalJs };
}
const openPage = async (p) => { await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await p.cdp('Page.navigate', { url: `${ORIGIN}/` }); await sleep(1000); await p.evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 30000) return rej(new Error("no app after 30s")); setTimeout(w, 200); })(); })'); await until(() => p.evalJs('app.layoutManager && app.layoutManager._restoring === false'), 12000, 250); };
const shot = async (p, name) => { if (!SHOTS) return; const r = await p.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); console.log(`    (screenshot ${path.join(SHOTS, name)})`); };
const trustedClick = async (p, sel) => {
  const r = await p.evalJs(`(() => { const el = ${sel}; if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
  if (!r) throw new Error(`trustedClick: nothing clickable for ${sel}`);
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return r;
};
/** Open a file explorer on the fixture folder and right-click `name` (a real contextmenu at the row's centre). */
const explorerMenuOn = async (p, name) => {
  // a scratch page: every window a layout replay restored goes (programmatic closes), then ONE explorer on the fixture
  // folder, and the row is found INSIDE that window, at a point the page itself says is the row (never another window)
  await p.evalJs(`(() => { document.querySelectorAll('.context-menu').forEach((m) => m.remove()); for (const id of [...app.wm.windows.keys()]) { try { app.wm.closeWindow(id); } catch {} } window.__exp = app.openFileExplorer(${JSON.stringify(docs)}).id; return true; })()`);
  const at = await until(() => p.evalJs(`(() => { const w = app.wm.windows.get(window.__exp); if (!w) return null; const el = [...w.element.querySelectorAll('.file-item')].find((e) => e.dataset.name === ${JSON.stringify(name)}); if (!el) return null; const r = el.getBoundingClientRect(); if (!(r.width > 0)) return null; const x = r.x + 30, y = r.y + r.height / 2; const hit = document.elementFromPoint(x, y); return hit && el.contains(hit) ? { x, y } : null; })()`), 15000, 200);
  if (!at) return null;
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'right', clickCount: 1 });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'right', clickCount: 1 });
  return until(() => p.evalJs(`(() => { const m = document.querySelector('.context-menu'); if (!m) return null; return [...m.children].map((e) => ({ cls: e.className, key: e.dataset.key || null, text: e.textContent })); })()`), 5000, 100);
};
const MENU_ROWS = `(() => { const m = document.querySelector('.context-menu'); if (!m) return null; return [...m.children].map((e) => ({ cls: e.className, key: e.dataset.key || null, text: e.textContent })); })()`;
const WIN = (appId) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); if (!w) return null; const v = w._desktopAppView; const cv = v && v.pane ? [...v.pane.querySelectorAll('canvas')].find((c) => c.width > 200 && c.height > 200) : null; let bright = 0, n = 0; if (cv) { try { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 0; i < d.length; i += 400) { n++; if (d[i] + d[i + 1] + d[i + 2] > 60) bright++; } } catch {} } return { title: w.title || (w.el && w.el.querySelector('.window-title')?.textContent) || '', status: v && v.status ? v.status.textContent : null, canvas: cv ? { w: cv.width, h: cv.height, brightFrac: n ? bright / n : 0 } : null }; })()`;

const target = await until(async () => (await cdpTargets()).find((t) => t.type === 'page'), 20000, 250);
const p1 = await page(target);
await openPage(p1);
await p1.evalJs(`(() => { window.__fc = []; window.addEventListener('vibespace:file-changed', (e) => window.__fc.push(e.detail)); return true; })()`);

console.log('§1 the verdict route (GET /api/desktop/open-with)');
{
  const ok1 = await j('GET', `/api/desktop/open-with?path=${encodeURIComponent(DOCX)}`);
  check('a .docx on this machine ⇒ ok, the Writer row, the basename as its label', ok1.status === 200 && ok1.body && ok1.body.ok === true && ok1.body.catalogId === 'libreoffice-writer' && ok1.body.module === 'writer' && ok1.body.label === path.basename(DOCX) && ok1.body.file === DOCX, ok1.body);
  const rel = await j('GET', `/api/desktop/open-with?path=${encodeURIComponent('report.docx')}`);
  const disp = await j('GET', `/api/desktop/open-with?path=${encodeURIComponent(`devbox: ${DOCX}`)}`);
  const txt = await j('GET', `/api/desktop/open-with?path=${encodeURIComponent(NOTES)}`);
  check('refused by name, answered 200 (a question): a relative path and a host-labelled display string ⇒ relative-path, a .txt ⇒ not-office-file', rel.body?.code === 'relative-path' && disp.body?.code === 'relative-path' && txt.body?.code === 'not-office-file' && [rel, disp, txt].every((r) => r.status === 200 && r.body.ok === false), [rel.body, disp.body, txt.body].map((b) => b && b.code));
}

console.log('§2 the launch route\'s machine rule — before any machine is asked');
{
  const before = recordedApps().length;
  const mm = await j('POST', '/api/desktop/apps', { file: DOCX, fileHost: 'otherbox' });
  const na = await j('POST', '/api/desktop/apps', { appId: 'xterm', file: DOCX });
  const typed = await j('POST', '/api/desktop/apps', { exec: '/usr/bin/libreoffice', file: DOCX });
  check('the file on another machine ⇒ 409 machine-mismatch (the app runs where the file is)', mm.status === 409 && mm.body?.code === 'machine-mismatch', mm);
  check('a non-office catalog app with a file ⇒ 400 not-office-app; a typed command with a file ⇒ not-office-app', na.status === 400 && na.body?.code === 'not-office-app' && typed.status === 400 && typed.body?.code === 'not-office-app', [na.body, typed.body]);
  check('nothing was recorded by the refused requests', recordedApps().length === before, recordedApps().length);
}

console.log('§3 the explorer row → the door → the window');
let recId = null;
{
  const rows = await explorerMenuOn(p1, path.basename(DOCX));
  const openRow = rows && rows.find((r) => r.key === 'office-open');
  check('the context menu of the .docx carries "Open with LibreOffice" (one row, keyed, a real item — not a note)', !!openRow && /context-menu-item/.test(openRow.cls) && openRow.text === 'Open with LibreOffice' && rows.filter((r) => (r.key || '').startsWith('office')).length === 1, rows && rows.map((r) => r.text));
  await sleep(600); // the verdict answered meanwhile: the row stays (Writer is here)
  const rows2 = await p1.evalJs(MENU_ROWS);
  check('the verdict arrived and the row is still "Open with LibreOffice" (Writer is installed here)', !!rows2 && rows2.some((r) => r.key === 'office-open'), rows2 && rows2.map((r) => r.text));
  await shot(p1, 'explorer-row.png');
  const t0 = Date.now();
  await trustedClick(p1, `[...document.querySelectorAll('.context-menu [data-key="office-open"]')][0]`);
  const rec = await until(() => recordedApps().find((a) => a.file === DOCX), 15000, 150);
  recId = rec && rec.id;
  check('a trusted click on the row launched a desktop app recording THE FILE', !!rec, recordedApps().map((a) => [a.id, a.label]));
  if (rec) {
    const args = rec.args || [];
    const prof = args.find((a) => a.startsWith('-env:UserInstallation='));
    check('the argv: --writer first, --nologo, the session\'s OWN profile, THE PATH LAST as one item', args[0] === '--writer' && args.includes('--nologo') && args[args.length - 1] === DOCX && args.filter((a) => a === DOCX).length === 1 && !!prof, args);
    check('the profile is the session\'s own dir (data/desktop-apps/<id>/profile, a file URL, percent-encoded)', prof === O.userInstallationArg(path.join(appDir(rec.id), 'profile')) && rec.profileDir === path.join(appDir(rec.id), 'profile'), { prof, profileDir: rec.profileDir });
    check('the label is the file\'s basename; the rung is xpra; appId = the Writer row; office = writer', rec.label === path.basename(DOCX) && rec.backend === 'xpra' && rec.appId === 'libreoffice-writer' && rec.office === 'writer' && Number.isFinite(rec.fileMtimeAtLaunch), { label: rec.label, backend: rec.backend, appId: rec.appId, office: rec.office });
    check('no display string reaches the argv (every item is the flag set, the profile URL or the real path)', args.every((a) => a.startsWith('-') || a === DOCX), args);
    const ready = await until(async () => { const r = (await j('GET', `/api/desktop/apps/${rec.id}`)).body; if (r && (r.state === 'failed' || r.state === 'exited')) throw new Error(`${rec.id} ${r.state}: ${r.lastError}`); return r && r.state === 'ready' ? r : null; }, 45000, 250);
    check(`ready on the xpra rung (${ready ? Date.now() - t0 : '—'} ms from the click)`, !!ready, (await j('GET', `/api/desktop/apps/${rec.id}`)).body);
    const pid = ready && ready.pids && ready.pids.app;
    let cmd = [];
    try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean); } catch {}
    check('the RUNNING process\'s argv ends with the path as ONE item (LibreOffice\'s own launcher, /proc)', cmd.length > 1 && cmd[cmd.length - 1] === DOCX, cmd);
    // LibreOffice's window through the xpra protocol: the VibeSpace window's title carries the file's basename
    const w = await until(async () => { const x = await p1.evalJs(WIN(rec.id)); return x && x.title && x.title.includes(path.basename(DOCX)) && x.canvas && x.canvas.brightFrac > 0.3 ? x : null; }, 60000, 500);
    check('the VibeSpace window shows LibreOffice\'s own title with the basename, its picture painted', !!w, await p1.evalJs(WIN(rec.id)));
    await sleep(1500);
    await shot(p1, 'writer-window.png');
    // the app's own display agrees (xdotool reads COMPOUND_TEXT titles as well)
    const xenv = { ...process.env, DISPLAY: ready && ready.display, XAUTHORITY: path.join(appDir(rec.id), 'Xauthority') };
    let xw = '';
    try { xw = execFileSync(bin('xdotool') || 'xdotool', ['search', '--name', path.basename(DOCX)], { env: xenv, encoding: 'utf8', timeout: 10000 }).trim(); } catch (e) { xw = ''; }
    check('on the app\'s own display a window is named after the file (xdotool search --name)', !!xw, xw || '(none)');
  }
}

console.log('§4 after editing: the file-changed signal');
{
  const rec = recordedApps().find((a) => a.id === recId);
  if (!rec) check('the §3 session exists', false);
  else {
    const t = Date.now() / 1000 + 5;
    fs.utimesSync(DOCX, t, t);
    const bumped = fs.statSync(DOCX).mtimeMs;
    const stopAt = Date.now();
    const st = await j('POST', `/api/desktop/apps/${rec.id}/stop`, {});
    check('Stop through the keeper ⇒ exited, stoppedBy user', st.status === 200 && st.body?.state === 'exited' && st.body?.stoppedBy === 'user', st.body && { state: st.body.state, stoppedBy: st.body.stoppedBy, lastError: st.body.lastError });
    const after = await until(() => { const r = recordedApps().find((a) => a.id === rec.id); return r && r.fileSignalledAt ? r : null; }, 10000, 150) || recordedApps().find((a) => a.id === rec.id);
    check('the machine recorded the file changed (mtime at the end ≠ at launch)', after && after.fileChanged === true && after.fileMtimeAtEnd === bumped, after && { fileChanged: after.fileChanged, fileMtimeAtEnd: after.fileMtimeAtEnd, bumped, fileEndError: after.fileEndError });
    const msg = await until(() => wsMsgs.find((m) => m.appId === rec.id), 8000, 100);
    check(`ONE file-changed {host: null, path, mtime} reached a ws client (${msg ? msg.at - stopAt : '—'} ms after Stop)`, !!msg && msg.host === null && msg.path === DOCX && msg.mtime === bumped && msg.by === 'desktop-app' && wsMsgs.filter((m) => m.appId === rec.id).length === 1, wsMsgs);
    const fc = await until(() => p1.evalJs(`window.__fc.filter((d) => d.appId === ${JSON.stringify(rec.id)})`).then((x) => (x && x.length ? x : null)), 5000, 100);
    check('…and the page\'s window event (the relay: vibespace:file-changed)', !!fc && fc.length === 1 && fc[0].path === DOCX && fc[0].host === null, fc);
    const gone = await until(() => Object.values(rec.pids || {}).filter(Boolean).every((p) => { try { process.kill(p, 0); return false; } catch { return true; } }), 10000, 200);
    check('every recorded pid of the session is gone', !!gone, rec.pids);
    const retired = await until(() => { const r = recordedApps().find((a) => a.id === rec.id); return r && (r.profileRemovedAt || r.profileKept) ? r : null; }, 10000, 200);
    check('the session\'s LibreOffice profile is removed (a person\'s ending)', !!retired && !!retired.profileRemovedAt && !fs.existsSync(rec.profileDir), retired && { removed: retired.profileRemovedAt, kept: retired.profileKeptWhy, err: retired.profileError });
    // LibreOffice ended by a signal leaves `.~lock.<name>#` (measured: SIGTERM, ~130 ms, the lock stays) — the machine
    // removes it after the clean teardown ONLY because it names this session's own profile (the witness)
    const lock = O.lockFileOf(DOCX);
    const recL = recordedApps().find((a) => a.id === rec.id);
    check('no stale LibreOffice lock file is left beside the document (the next open is not "in use") — removed by its witness', !fs.existsSync(lock) && recL && !!recL.fileLockRemovedAt, { exists: fs.existsSync(lock), removedAt: recL && recL.fileLockRemovedAt, kept: recL && recL.fileLockKept });
    // CONTROL: the same file opened again and stopped UNTOUCHED ⇒ no signal
    const r2 = await j('POST', '/api/desktop/apps', { file: DOCX, fileHost: 'local' });
    const id2 = r2.body && r2.body.id;
    const ready2 = id2 && await until(async () => { const r = (await j('GET', `/api/desktop/apps/${id2}`)).body; return r && r.state === 'ready' ? r : null; }, 45000, 250);
    const lockUp = await until(() => (fs.existsSync(lock) ? fs.readFileSync(lock, 'utf8') : null), 20000, 200); // LibreOffice has the document open (it never writes an unmodified one)
    const ownUrl = O.userInstallationArg(path.join(appDir(id2), 'profile')).slice('-env:UserInstallation='.length);
    check('the running session\'s lock names ITS OWN profile (the witness the machine reads)', !!lockUp && lockUp.trim().endsWith(`,${ownUrl};`), lockUp);
    // CONTROL for the lock rule: the lock rewritten to name ANOTHER LibreOffice (the user's own, say) is KEPT and said
    const foreign = ',someone,elsewhere,27.09.2026 12:00,file:///home/someone/.config/libreoffice/4;\n';
    if (lockUp) fs.writeFileSync(lock, foreign);
    const s2 = id2 && await j('POST', `/api/desktop/apps/${id2}/stop`, {});
    await sleep(2500);
    const rec2 = recordedApps().find((a) => a.id === id2);
    check('CONTROL: a session stopped with its file untouched ⇒ fileChanged false and NO file-changed', !!ready2 && s2 && s2.status === 200 && rec2 && rec2.fileChanged === false && !wsMsgs.some((m) => m.appId === id2), { ready: !!ready2, fileChanged: rec2 && rec2.fileChanged, msgs: wsMsgs.filter((m) => m.appId === id2) });
    check('CONTROL: a lock naming another LibreOffice is KEPT (never removed on a guess) and the record says why', fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === foreign && rec2 && !rec2.fileLockRemovedAt && /another LibreOffice/.test(rec2.fileLockKept || ''), { exists: fs.existsSync(lock), kept: rec2 && rec2.fileLockKept });
    try { fs.unlinkSync(lock); } catch {}
  }
}

console.log('§5 the code editor honours the signal (never waits for its 15 s poll)');
{
  await p1.evalJs(`(() => { document.querySelectorAll('.context-menu').forEach((m) => m.remove()); app.openEditor(${JSON.stringify(NOTES)}, ${JSON.stringify(path.basename(NOTES))}); return true; })()`);
  const DOCTEXT = `(() => { const w = [...document.querySelectorAll('.window')].find((w) => w.querySelector('.cm-content') && (w.textContent || '').includes(${JSON.stringify(path.basename(NOTES))})); const c = w && w.querySelector('.cm-content'); return c ? c.textContent : null; })()`;
  const loaded = await until(() => p1.evalJs(DOCTEXT).then((x) => (x && x.includes('first line') ? x : null)), 15000, 200);
  check('the editor loaded the text file', !!loaded, loaded);
  await sleep(1200); // its disk baseline taken
  const t = Date.now() / 1000 + 7;
  fs.writeFileSync(NOTES, 'second line\n'); fs.utimesSync(NOTES, t, t);
  const t0 = Date.now();
  await p1.evalJs(`(() => { window.dispatchEvent(new CustomEvent('vibespace:file-changed', { detail: { host: null, path: ${JSON.stringify(NOTES + '.other')}, mtime: 1 } })); return true; })()`);
  await sleep(1500);
  const still = await p1.evalJs(DOCTEXT);
  check('CONTROL: a signal naming ANOTHER file changes nothing', still && still.includes('first line') && !still.includes('second line'), still);
  await p1.evalJs(`(() => { window.dispatchEvent(new CustomEvent('vibespace:file-changed', { detail: { host: null, path: ${JSON.stringify('/' + NOTES)}, mtime: 1 } })); return true; })()`); // `//…` — the explorer's own spelling at the root folds to the same file
  const re = await until(() => p1.evalJs(DOCTEXT).then((x) => (x && x.includes('second line') ? x : null)), 5000, 100);
  check(`the signal naming it reloads the clean editor at once (${re ? Date.now() - t0 : '—'} ms after the rewrite, well inside the 15 s poll)`, !!re && Date.now() - t0 < 10000, re);
}

console.log('§6 a machine WITHOUT LibreOffice (a scratch PATH hides libreoffice + soffice — nothing uninstalled)');
{
  // the scratch PATH: every command of the real PATH linked into one dir, EXCEPT LibreOffice's two names
  fs.mkdirSync(nolo, { recursive: true });
  const hidden = new Set(O.OFFICE_EXECS);
  let linked = 0;
  for (const dir of String(process.env.PATH || '').split(':')) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (hidden.has(n) || fs.existsSync(path.join(nolo, n))) continue;
      try { fs.symlinkSync(path.join(dir, n), path.join(nolo, n)); linked++; } catch { /* a name twice */ }
    }
  }
  const envNo = { ...srvEnvBase, PATH: nolo };
  check(`the scratch PATH has ${linked} commands and neither of ${O.OFFICE_EXECS.join(', ')}`, linked > 100 && O.OFFICE_EXECS.every((e) => !fs.existsSync(path.join(nolo, e))) && !!D.binOnPath('xpra', { env: envNo, now: () => Date.now() + 3600e3 }));
  try { srv.kill('SIGTERM'); } catch {}
  await until(() => srv.exitCode !== null || srv.signalCode !== null, 10000, 100);
  bootServer({ PATH: nolo });
  check('the server rebooted on that PATH', await waitServer());
  const v = await j('GET', `/api/desktop/open-with?path=${encodeURIComponent(DOCX)}`);
  check('the verdict route: app-absent with the install remedy (libreoffice-writer + the Carlito / Caladea faces)', v.body && v.body.ok === false && v.body.code === 'app-absent' && v.body.remedy && v.body.remedy.what === 'libreoffice-writer' && v.body.remedy.packages.includes('libreoffice-writer') && v.body.remedy.packages.includes('fonts-crosextra-carlito'), v.body);
  await openPage(p1);
  const rows = await explorerMenuOn(p1, path.basename(DOCX));
  const patched = await until(() => p1.evalJs(MENU_ROWS).then((r) => (r && r.some((x) => x.key === 'office-install') ? r : null)), 8000, 100);
  if (!patched) console.log('    (debug) verdict in page:', await p1.evalJs(`app.officeVerdictFor(null, ${JSON.stringify(DOCX)}).promise.then((v) => JSON.stringify(v))`), await p1.evalJs(MENU_ROWS).then((r) => JSON.stringify(r && r.map((x) => x.key))));
  const note = patched && patched.find((r) => r.key === 'office-note');
  const inst = patched && patched.find((r) => r.key === 'office-install');
  check('the menu says it in ONE plain sentence (a note, not a greyed control) and offers "Install LibreOffice on this machine…"', !!note && /context-menu-note/.test(note.cls) && note.text === 'LibreOffice Writer is not installed on this machine' && !!inst && /context-menu-item/.test(inst.cls) && inst.text === 'Install LibreOffice on this machine…' && !patched.some((r) => r.key === 'office-open'), { first: rows && rows.map((r) => r.text), patched: patched && patched.map((r) => [r.key, r.text]) });
  const noteStyle = await p1.evalJs(`(() => { const n = document.querySelector('.context-menu [data-key="office-note"]'); if (!n) return null; const s = getComputedStyle(n); return { opacity: s.opacity, cursor: s.cursor, color: s.color, pointer: s.pointerEvents }; })()`);
  check('the note is not greyed out (full opacity, the text colour) and not a control (no pointer cursor)', noteStyle && Number(noteStyle.opacity) === 1 && noteStyle.cursor !== 'pointer', noteStyle);
  await shot(p1, 'absent-machine-menu.png');
  await trustedClick(p1, `document.querySelector('.context-menu [data-key="office-install"]')`);
  const plan = await until(() => p1.evalJs(`(() => { const d = document.getElementById('desktop-install-dialog'); if (!d) return null; const pre = d.querySelector('.desktop-install-pre'); const go = [...d.querySelectorAll('button')].find((b) => b.textContent === 'Install'); return pre && pre.textContent ? { title: d.querySelector('.dialog-header h3')?.textContent, commands: pre.textContent, note: d.querySelector('.desktop-install-note')?.textContent, go: !!go } : null; })()`), 15000, 200);
  check('"Install LibreOffice on this machine…" shows the PLAN first — the packages, nothing run', !!plan && /Install LibreOffice on this machine/.test(plan.title || '') && /apt-get .*install -y libreoffice-writer fonts-crosextra-carlito fonts-crosextra-caladea/.test(plan.commands) && plan.go, plan);
  await shot(p1, 'absent-machine-install-plan.png');
  await p1.evalJs(`(() => { document.getElementById('desktop-install-dialog')?.remove(); return true; })()`);
  // the door itself: refused ⇒ the launch dialog in FILE MODE, the sentence + the install offer
  const before = recordedApps().length;
  await p1.evalJs(`(() => { app.openWithDesktopApp({ file: ${JSON.stringify(DOCX)}, host: null }); return true; })()`);
  const dlg = await until(() => p1.evalJs(`(() => { const d = document.getElementById('desktop-launch-dialog'); if (!d) return null; const box = d.querySelector('.desktop-launch-office-absent'); if (!box) return null; return { intro: d.querySelector('.desktop-launch-intro')?.textContent, said: box.querySelector('.desktop-launch-office-absent-text')?.textContent, btn: box.querySelector('.desktop-launch-office-install')?.textContent, advHidden: getComputedStyle(d.querySelector('.desktop-launch-adv')).display === 'none', browsersHidden: getComputedStyle(d.querySelector('.desktop-launch-browsers-sec')).display === 'none' }; })()`), 15000, 200);
  check('the door answers with the launch dialog in FILE MODE: the document named, the sentence, "Install LibreOffice on this machine…", no browsers / Advanced', !!dlg && dlg.intro.includes(path.basename(DOCX)) && dlg.said === 'LibreOffice Writer is not installed on this machine' && dlg.btn === 'Install LibreOffice on this machine…' && dlg.advHidden && dlg.browsersHidden, dlg);
  check('…and nothing was launched', recordedApps().length === before, recordedApps().length);
  await shot(p1, 'absent-machine-file-mode.png');
}

// the run's own apps are all stopped through the product; the exit sweep is the belt
for (const a of recordedApps()) if (a.state === 'ready' || a.state === 'launching') { try { await j('POST', `/api/desktop/apps/${a.id}/stop`, {}); } catch {} }
const left = markerHits();
check('nothing of this run\'s sessions is left running (the marker census)', left.length === 0, left);
console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASS'} (${Math.round((Date.now() - T0) / 1000)} s)`);
if (failed) console.log(srvLog.join('').split('\n').filter((l) => /desktop|office|LibreOffice/i.test(l)).slice(-40).join('\n'));
process.exit(failed ? 1 : 0);
