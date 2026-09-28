#!/usr/bin/env node
// A CLOSED SPLIT VIEWER CAME BACK AS A WINDOW AFTER TWO DESKTOP SWITCHES — inc-mukeyzpt-lpou (the owner,
// 2026-09-27 22:52Z, client 2.369.193): "刚才用ctrl+点击，并排模式打开了个文件查看，切换桌面-回到桌面-关闭这个并排的
// 文件查看器-重新切换桌面-回到桌面-刚才关掉的查看器变成了独立窗口". The bundle's own window id (win-mukexu05-37lz,
// minted 22:51:36.869 = the Ctrl+click) was the resurrected window's id: the desktop switch REPLAYED the record
// of a window the strip's ✕ had closed — that ✕ reached removeFromTabChain directly and skipped the purge every
// other close path runs, so switchTo's merge-preserve carried the stale record forward and the return replayed it.
//
// Heavy (headless chrome on a worktree server with a fake claude; SKIPs with evidence without chrome / dtach):
//   1  THE OWNER'S SEQUENCE, twice, with the measured timings: a split chat group [Alpha | Bravo] on desktop One,
//      a REAL Ctrl+click on a path in Alpha's chat ⇒ the editor is born beside it; a real click on desktop Two's
//      preview, back after ~0.9 s (the queued-switch drain the bundle recorded twice 127 ms apart); the editor's
//      tab ✕ in its strip half; Two ~0.8 s later, back ~1 s later ⇒ NO editor window anywhere, no record of it in
//      any cached desktop state, the group still [Alpha | Bravo]; the same again (the owner did it twice)
//   1c CONTROL: the pre-fix tab ✕ (removeFromTabChain without the retirement) re-installed on the live page ⇒
//      the same sequence brings the editor back as a FREE window with the SAME id — the leg sees the incident
//   2  THE ECHO: a layout-sync carrying the pre-close state (captured before the ✕, sent by a second socket
//      50 ms after it — inside this client's autosave debounce) never resurrects the editor, and this client's
//      close still reaches the disk and the other clients (the held close is re-sent once)
//   2c CONTROL: the held-close ledger neutered ⇒ the same echo brings the editor back
//   3  A SECOND PAGE parked on desktop Two while the close happens on One: the record it caches for One drops
//      the editor the last record on the wire listed ⇒ its hidden copy is closed then; back on One (a real click)
//      it shows no editor and its next ordinary save writes none back to the first page or the disk
//   3c CONTROL: no wire base (the pre-fix cache) ⇒ the parked page shows the editor again and writes it back
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('split-close');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  fakeHome = scratchHome('split-close-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: '%s', hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: '%s', cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\nSID="e2e00000-0000-4000-8000-$(printf '%012d' $$)"\ncase " $* " in *" --output-format "*) sleep 1; printf '${hookLine}\\n${initLine}\\n' "$SID" "$SID";; esac\nexec sleep 600\n`, { mode: 0o755 });
  const NOTES = path.join(ROOT, 'pandy-notes.txt');
  fs.writeFileSync(NOTES, 'client id: none\nsecret: none\n');
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const layoutsPath = path.join(wt, 'data', 'layouts.json');
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), 'the worktree server booted', journal.slice(-800))) return;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const create = async (reqId, name) => { ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, name })); await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000); return msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId; };
  const sidA = await create('a', 'Alpha'), sidB = await create('b', 'Bravo');
  const killSessions = async () => {
    for (const sid of [sidA, sidB].filter(Boolean)) ws.send(JSON.stringify({ type: 'kill', sessionId: sid }));
    await until(() => [sidA, sidB].filter(Boolean).every((sid) => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid)), 8000);
  };
  let chrome = null, P1 = null;
  try {
    if (!ok(sidA && sidB, 'two chat sessions (Alpha, Bravo) were created on the fake claude', journal.slice(-600))) return;
    await sleep(1200);
    chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1600,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    procs.add(chrome);
    let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!ok(!!target, 'chrome exposed a CDP page target')) return;
    const client = async (wsUrl) => {
      const cdp = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
      await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
      let seq = 0; const pend = new Map();
      cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
      const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
      const ev = async (js) => {
        const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm, dm = app.desktopManager; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }; const chats = () => [...wm.windows.values()].filter((w) => w.type === 'chat'); const sidOf = (id) => (app.sessions.get(id) || {}).sessionId || null; const bySid = (sid) => chats().find((w) => sidOf(w.id) === sid) || null; const editors = () => [...wm.windows.values()].filter((w) => w.type === 'editor'); ${js} })()`, returnByValue: true, awaitPromise: true });
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
        return r.result?.result?.value;
      };
      await send('Page.enable'); await send('Runtime.enable');
      const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
      const click = async (pt, modifiers = 0) => { await mouse('mouseMoved', pt.x, pt.y, { modifiers }); await mouse('mousePressed', pt.x, pt.y, { button: 'left', clickCount: 1, modifiers }); await mouse('mouseReleased', pt.x, pt.y, { button: 'left', clickCount: 1, modifiers }); };
      return { send, ev, click, close: () => { try { cdp.close(); } catch { } } };
    };
    const bootOk = async (X) => { for (let i = 0; i < 120; i++) { try { if (await X.ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);')) return true; } catch { } await sleep(250); } return false; };
    const S = JSON.stringify;
    const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    P1 = await client(target.webSocketDebuggerUrl);
    await P1.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await P1.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await P1.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    if (!ok(await bootOk(P1), 'the app booted in headless chrome (desktop, 1600×1000)')) return;
    await sleep(1500);
    const ev = P1.ev;

    // ── two desktops (One = the boot desktop, Two made here) ──
    const desks = await ev(`if (!dm) return null; if (dm.desktops.length < 2) dm.createDesktop('Two'); await new Promise((r) => setTimeout(r, 300)); return dm.desktops.map((d) => ({ id: d.id, name: d.name }));`);
    if (!ok(desks && desks.length === 2, 'two virtual desktops exist', S(desks))) return;
    const ONE = desks[0].id, TWO = desks[1].id;
    await ev(`if (dm.activeDesktopId !== ${S(ONE)}) await dm.switchTo(${S(ONE)}); return true;`);
    await until(() => ev('return dm._restoring === false;'), 5000);

    /** A real click on a desktop's preview in the taskbar (the owner's own switch). */
    const previewOf = (X, id) => X.ev(`const i = dm.desktops.findIndex((d) => d.id === ${S(id)}); const w = [...document.querySelectorAll('#desktop-previews .desktop-preview-wrapper:not(.stage-preview-wrapper)')][i]; if (!w) return null; const r = rect(w); return r.width > 0 && r.height > 0 ? r : null;`);
    const switchBy = async (X, id) => { const r = await previewOf(X, id); if (!r) return false; await X.click(centre(r)); return true; };

    /** The scene: every window closed, Alpha + Bravo on desktop One as a SPLIT group (the bundle's
     *  div.window.tab-wrap-mode with the chat in a .tab-split-pane). */
    const scene = async (X = P1) => {
      await X.ev(`if (dm.activeDesktopId !== ${S(ONE)}) await dm.switchTo(${S(ONE)}); return true;`);
      await until(() => X.ev('return dm._restoring === false;'), 5000);
      await X.ev(`for (const w of [...wm.windows.values()]) wm.closeWindow(w.id); return true;`);
      await until(() => X.ev('return wm.windows.size === 0;'), 5000);
      await X.ev(`app.attachSession(${S(sidA)}, 'Alpha', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
      await until(() => X.ev(`return !!bySid(${S(sidA)});`), 10000);
      await X.ev(`app.attachSession(${S(sidB)}, 'Bravo', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
      await until(() => X.ev(`return !!bySid(${S(sidB)});`), 10000);
      await X.ev(`const A = bySid(${S(sidA)}), B = bySid(${S(sidB)}); A.element.style.left = '40px'; A.element.style.top = '40px'; A.element.style.width = '1200px'; A.element.style.height = '700px'; wm._captureGridBounds(A); wm.bindSplit(A, B, { side: 'right', focus: 'anchor' }); return true;`);
      await sleep(600);
      return X.ev(`const A = bySid(${S(sidA)}), B = bySid(${S(sidB)}); const ch = A._tabChain; return { A: A.id, B: B.id, layout: ch && ch.layout, split: !!(ch && ch === B._tabChain) };`);
    };
    /** A REAL Ctrl+click on a path link in Alpha's chat (the owner's gesture: the link span the renderer draws). */
    const ctrlClickPath = async (X, file) => {
      const r = await X.ev(`const A = bySid(${S(sidA)}); const cv = app.sessions.get(A.id); const list = cv._messageList; list.querySelector('.vs-test-link')?.remove(); const p = document.createElement('p'); p.className = 'vs-test-link'; p.style.cssText = 'padding:12px;margin:0'; const s = document.createElement('span'); s.className = 'chat-link chat-link-path'; s.dataset.path = ${S(file)}; s.textContent = ${S(file)}; p.appendChild(s); list.prepend(p); s.scrollIntoView({ block: 'center' }); await new Promise((res) => setTimeout(res, 150)); const q = rect(s); const hit = document.elementFromPoint(q.left + Math.min(20, q.width / 2), q.top + q.height / 2); return hit === s ? { left: q.left, top: q.top, width: Math.min(40, q.width), height: q.height } : { miss: true, hit: hit && hit.className };`);
      if (!r || r.miss) return { ok: false, r };
      await X.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
      await X.click(centre(r), 2);
      await X.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
      return { ok: true };
    };
    /** The editor's tab ✕ inside its strip half (the owner's close). */
    const closeTabOf = async (X, winId) => {
      const r = await X.ev(`const w = wm.windows.get(${S(winId)}); if (!w || !w._tabChain) return null; const host = wm.windows.get(w._tabChain.tabs[0]); const b = host.titleBar.querySelector('.tab-item[data-win-id="${winId}"] .tab-close'); if (!b) return null; const inHalf = !!b.closest('.tab-strip-half'); const q = rect(b); return q.width > 0 ? { ...q, inHalf } : null;`);
      if (!r) return null;
      await X.click(centre(r));
      return r;
    };
    const edState = (X, edId) => X.ev(`const e = wm.windows.get(${S(edId)}); const A = bySid(${S(sidA)}); const ch = A && A._tabChain; const inRec = [...dm._savedStates.entries()].filter(([, st]) => (st?.windows || []).some((w) => (w.winId || w.id) === ${S(edId)})).map(([k]) => k); return { live: !!e, free: !!(e && !e._tabChain), desk: e ? e._desktopId : null, shown: !!(e && (e._tabChain ? (() => { const h = wm.windows.get(e._tabChain.tabs[0]); return !!(h && !h._hiddenByDesktop && getComputedStyle(h.element).display !== 'none' && e._tabChain.layout === 'split' && e._tabChain.split.pair.includes(e.id)); })() : (!e._hiddenByDesktop && getComputedStyle(e.element).display !== 'none'))), editors: editors().length, inRec, chain: ch ? ch.tabs.map((id) => wm.windows.get(id)?.type || '?') : null, layout: ch ? ch.layout : null, active: dm.activeDesktopId };`);

    /** The owner's cycle with the bundle's timings: open beside, Two, back (0.9 s — the drain), ✕, Two, back. */
    const ownerCycle = async (X, label) => {
      const c = await ctrlClickPath(X, NOTES);
      if (!ok(c.ok, `${label} the path link in Alpha's chat is hit by the pointer`, S(c))) return null;
      const born = await until(() => X.ev(`const e = editors()[0]; return !!(e && e._tabChain && e._tabChain === bySid(${S(sidA)})._tabChain);`), 8000);
      const edId = await X.ev('const e = editors()[0]; return e ? e.id : null;');
      const b = await X.ev(`const e = wm.windows.get(${S(edId)}); const ch = e && e._tabChain; return ch ? { layout: ch.layout, n: ch.tabs.length, shown: ch.split && ch.split.pair.includes(e.id) } : null;`);
      ok(born && b && b.layout === 'split' && b.n === 3 && b.shown, `${label} the Ctrl+click opened the editor BESIDE Alpha, in its split group (shown)`, S(b));
      await sleep(1100);
      ok(await switchBy(X, TWO), `${label} a real click on desktop Two's preview`);
      await sleep(900);
      await switchBy(X, ONE); // lands inside the 1 s switch gate ⇒ QUEUED, drained at its end (the bundle's twin desktop event)
      await until(() => X.ev(`return dm.activeDesktopId === ${S(ONE)} && dm._restoring === false;`), 4000);
      await sleep(700);
      const back1 = await edState(X, edId);
      ok(back1.live && back1.shown && !back1.free && back1.active === ONE, `${label} back on One: the editor is still beside Alpha`, S(back1));
      const cl = await closeTabOf(X, edId);
      ok(cl && cl.inHalf, `${label} a real click on the editor tab's ✕ inside its strip half`, S(cl));
      await sleep(250);
      const closed = await edState(X, edId);
      ok(!closed.live && closed.editors === 0, `${label} the ✕ closed the editor`, S(closed));
      await sleep(600);
      await switchBy(X, TWO);
      await sleep(1060);
      await switchBy(X, ONE);
      await until(() => X.ev(`return dm.activeDesktopId === ${S(ONE)} && dm._restoring === false;`), 4000);
      await sleep(1800); // past the lazy replay's async file-info fetch + its 500 ms placement timer
      return { edId, after: await edState(X, edId) };
    };

    // ── 1 · the owner's sequence, twice ──
    console.log('— 1 · the owner\'s sequence (Ctrl+click beside → Two → One → ✕ → Two → One), twice');
    const s1 = await scene();
    ok(s1.split && s1.layout === 'split', 'Alpha and Bravo form a split group on desktop One', S(s1));
    for (const n of [1, 2]) {
      const r = await ownerCycle(P1, `1.${n}`);
      if (!r) continue;
      ok(!r.after.live && r.after.editors === 0, `1.${n} after the second round trip NO editor window exists (the incident: it came back as a free window with its old id)`, S(r.after));
      ok(r.after.inRec.length === 0, `1.${n} no cached desktop record still lists the closed editor`, S(r.after.inRec));
      ok(r.after.layout === 'split' && S(r.after.chain) === S(['chat', 'chat']), `1.${n} the group is [Alpha | Bravo] again, split`, S(r.after));
      await P1.ev(`for (const e of editors()) wm.closeWindow(e.id); return true;`); // a failed cycle never covers the next one's link
      await sleep(1200);
    }
    await sleep(1500);
    const diskHasEditor = () => { try { const d = JSON.parse(fs.readFileSync(layoutsPath, 'utf8')); return Object.values(d.desktops || {}).some((x) => ((x.autoSave && x.autoSave.windows) || []).some((w) => w.type === 'editor')); } catch { return null; } };
    ok(diskHasEditor() === false, '1 data/layouts.json lists no editor on any desktop', S(diskHasEditor()));

    // ── 1c · CONTROL: the pre-fix tab ✕ ──
    console.log('— 1c · CONTROL: the pre-fix ✕ (removeFromTabChain without the retirement) on the live page');
    {
      await P1.ev(`wm.__rftc = wm.removeFromTabChain; wm.removeFromTabChain = function (chain, winId) { const win = this.windows.get(winId); if (!win) return; win._listenerCtl?.abort(); this._detachFromChain(chain, winId); if (win.onClose) win.onClose(); win.element.remove(); this.windows.delete(winId); this._notify(); this._scheduleOverlapUpdate(); if (this.activeWindowId === winId) { this.activeWindowId = null; const next = chain.tabs[chain.active] ?? chain.tabs[0]; if (next && this.windows.has(next)) this.focusWindow(next); } }; return true;`);
      await scene();
      const r = await ownerCycle(P1, '1c');
      await P1.ev(`wm.removeFromTabChain = wm.__rftc; delete wm.__rftc; return true;`);
      ok(r && r.after.live && r.after.free && r.after.desk === ONE, '1c CONTROL: with the pre-fix ✕ the closed editor comes back on One as a FREE window with its old id — the incident, reproduced by this leg', S(r && r.after));
      await P1.ev(`for (const e of editors()) wm.closeWindow(e.id); return true;`);
    }

    // ── 2 · the echo ──
    console.log('— 2 · a layout-sync carrying the pre-close state, 50 ms after the ✕ (inside the autosave debounce)');
    const echoLeg = async (label, neuter) => {
      await scene();
      await sleep(1200); // the scene's own saves settle
      const c = await ctrlClickPath(P1, NOTES);
      if (!ok(c.ok, `${label} Ctrl+click hit the link`, S(c))) return null;
      await until(() => ev(`const e = editors()[0]; return !!(e && e._tabChain);`), 8000);
      await sleep(1500);
      const edId = await ev('return editors()[0]?.id || null;');
      const stale = await ev(`return app.layoutManager.captureState();`);
      if (neuter) await ev(`const lm = app.layoutManager; lm.__nc = lm.noteClosed; lm.noteClosed = () => {}; return true;`);
      await closeTabOf(P1, edId);
      await sleep(50);
      ws.send(JSON.stringify({ type: 'layout-sync', state: stale, desktopId: ONE }));
      await sleep(3500); // the apply's 1 s gate + the held close's re-send + the server's disk write
      const st = await edState(P1, edId);
      if (neuter) await ev(`const lm = app.layoutManager; lm.noteClosed = lm.__nc; delete lm.__nc; return true;`);
      return { edId, st, disk: diskHasEditor() };
    };
    {
      const r = await echoLeg('2', false);
      if (r) {
        ok(!r.st.live && r.st.editors === 0, '2 the echoed pre-close state did NOT bring the editor back', S(r.st));
        ok(r.st.layout === 'split' && S(r.st.chain) === S(['chat', 'chat']), '2 the group stays [Alpha | Bravo]', S(r.st));
        ok(r.disk === false, '2 the close still reached the disk (the held close was re-sent after the echo)', S(r.disk));
      }
      const c2 = await echoLeg('2c', true);
      ok(c2 && c2.st.live, '2c CONTROL: with the held-close ledger neutered the same echo re-creates the closed editor', S(c2 && c2.st));
      await ev(`for (const e of editors()) wm.closeWindow(e.id); return true;`);
    }

    // ── 3 · a second page parked on desktop Two ──
    console.log('— 3 · a second page parked on Two while the close happens on One');
    const newPage = async () => {
      const created = await P1.send('Target.createTarget', { url: 'about:blank', newWindow: true });
      let pt = null; for (let i = 0; i < 40 && !pt; i++) { try { pt = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page' && t.id === created.result.targetId); } catch { } if (!pt) await sleep(150); }
      return pt ? { X: await client(pt.webSocketDebuggerUrl), targetId: created.result.targetId } : null;
    };
    const parkedLeg = async (label, neuter) => {
      await scene();
      await sleep(800);
      const c = await ctrlClickPath(P1, NOTES);
      if (!ok(c.ok, `${label} Ctrl+click hit the link`, S(c))) return null;
      await until(() => ev(`const e = editors()[0]; return !!(e && e._tabChain);`), 8000);
      const edId = await ev('return editors()[0]?.id || null;');
      await ev(`const lm = app.layoutManager; lm._userDirty = true; lm._lastUserInputAt = Date.now(); lm._lastSentJson = null; await lm._doAutoSave(); return true;`);
      await until(() => diskHasEditor() === true, 6000);
      const p2 = await newPage();
      if (!ok(!!p2, `${label} a second desktop page`)) return null;
      const Q = p2.X;
      await Q.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
      await Q.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
      await Q.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      ok(await bootOk(Q), `${label} the second page booted`);
      await Q.ev(`if (dm.activeDesktopId !== ${S(ONE)}) await dm.switchTo(${S(ONE)}); return true;`);
      const seen = await until(() => Q.ev(`const e = wm.windows.get(${S(edId)}); return !!(e && e._tabChain);`), 15000, 200);
      ok(seen, `${label} the second page shows the editor in the group on One`);
      await until(() => Q.ev('return app.layoutManager._restoring === false && dm._restoring === false;'), 8000);
      await sleep(1100);
      await Q.ev(`await dm.switchTo(${S(TWO)}); return true;`); // parked on Two, its DOM still holds One's editor (hidden)
      await until(() => Q.ev('return dm._restoring === false;'), 4000);
      if (neuter) await Q.ev(`dm.__wi = dm._wireIds; dm._wireIds = { get: () => undefined, set() {}, has: () => false }; return true;`); // no base ⇒ the pre-fix cache: the record replaced, the stale window kept
      await P1.send('Page.bringToFront');
      await closeTabOf(P1, edId);
      await sleep(2500); // P1's close save → the server → the parked page caches it
      ok(diskHasEditor() === false, `${label} the close reached the disk`);
      await Q.send('Page.bringToFront');
      await switchBy(Q, ONE); // a REAL click (a real input: the page is user-dirty after it)
      await until(() => Q.ev(`return dm.activeDesktopId === ${S(ONE)} && dm._restoring === false;`), 4000);
      await sleep(1300); // past the switch's 1 s gate
      // the parked page's NEXT ordinary act (a real click on Bravo's pane, then its save) — what wrote a stale window back
      const bp = await Q.ev(`const B = bySid(${S(sidB)}); return B ? rect(B.content) : null;`);
      if (bp) await Q.click(centre(bp));
      await Q.ev('app.layoutManager.scheduleAutoSave(); return true;');
      await sleep(2500);
      const q = await edState(Q, edId);
      const p = await edState(P1, edId);
      const disk = diskHasEditor();
      if (neuter) await Q.ev(`dm._wireIds = dm.__wi; delete dm.__wi; return true;`);
      Q.close(); await P1.send('Target.closeTarget', { targetId: p2.targetId });
      await P1.send('Page.bringToFront');
      return { q, p, disk };
    };
    {
      const r = await parkedLeg('3', false);
      if (r) {
        ok(!r.q.live && r.q.editors === 0, '3 the parked page, back on One, shows NO editor (its hidden copy was closed when One\'s newer record arrived)', S(r.q));
        ok(!r.p.live && r.disk === false, '3 …and its next ordinary save wrote nothing back: the first page and the disk stay without the editor', S({ p: r.p, disk: r.disk }));
      }
      const c3 = await parkedLeg('3c', true);
      ok(c3 && c3.q.live && (c3.p.live || c3.disk === true), '3c CONTROL: with no wire base (the pre-fix cache) the parked page shows the closed editor again and its next save writes it back to the first page / the disk', S(c3));
      await ev(`for (const e of editors()) wm.closeWindow(e.id); return true;`);
    }
  } finally {
    if (P1) P1.close();
    try { if (chrome) chrome.kill('SIGKILL'); } catch { }
    await killSessions();
    try { ws.close(); } catch { }
    srv.kill('SIGKILL');
  }
})().catch((e) => ok(false, 'the chrome leg threw', e && (e.stack || e.message)));

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
