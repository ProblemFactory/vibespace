#!/usr/bin/env node
// THE SEAMLESS XPRA WINDOW — §12 (round 3, lane B) seamless, §17 (lane M) a press into the picture closes our floating
// menus, on the real rung against a worktree server
// (a part of the test-desktop-xpra-window family — lane xpra-window-split, design q-038 ②: the giant split by § so the
// self-hosted desktop batch's floor is its longest part; every § keeps its number; the other parts are named below)
// The family: -open (§1–§4, §5, Stop, §8, §9, §13, §18) · -hidpi (§6, §11) · -hidpi-r2 (§7) · -close (§10) ·
// -scale (§14, §15, §16) · -seamless (§12, §17).
//   • §12 (round 3, lane B — §3.3) SEAMLESS: GNOME Calculator (decorations 0) ⇒ .window.seamless, the title bar
//     and the status strip 0 high; a trusted drag of the app's OWN header bar by 120×64 moves the VibeSpace window
//     by 120/64 (±2) while the X main window stays at 0,0 (client AND X server); the app's own minimize / maximize /
//     restore buttons (MEASURED: GTK 4.22 paints them under xpra 6.5.3) map to ours and our restore re-maps the
//     app; a crossing of the top edge reveals nothing, a 250 ms hover and Alt reveal both bars (overlaying, the pane
//     never resized), the 1.5 s linger, leave = fold; a click into the picture activates the window; the pauses
//     (a tab chain, a 700 px viewport, an agent lease, a blocked second client) show the bars; the taskbar menu's
//     Show window frame ▸ On (user state, heard by the second client) and Settings off bring the frame back; the
//     plain-http copy chip floats at the pane's BOTTOM-right and hides after 10 s; the idle stop's last minute is a
//     toast; xterm is never seamless. CONTROL = a copy whose verdict is forced false (the bars everywhere).
//     Verifier r1 (each with a LIVE control in the same page): (3b) a header-bar drag off a MAXIMIZED window tells
//     the app (X meta maximized false; one click maximizes again — control: onResize muted ⇒ X stays maximized);
//     (4) revealed, the top edge is still the resize band (control: the title bar back at z-index 25 hits it);
//     (9) the chip and hint clear the header bar's ─ □ ✕ (control: the top placement covers them).
//   • §17 (lane M, inc-muhms5kt-0ejl — "vibespace中的悬浮菜单，不相应在app画面里的点击自动隐藏") A PRESS INTO THE PICTURE
//     CLOSES OUR FLOATING MENUS: on a live GNOME Calculator the ⚙ menu with its Appearance flyout, the title bar's window
//     menu, the ⋯ menu with Scale ▸ open, the taskbar window list and the For-you popup each close on ONE trusted click
//     into the picture while the calculator takes the digit (its own copy reads the digits back); the mechanism measured
//     on the pane (the document sees pointerdown and click, never mousedown); a finger drag across the picture is not a
//     tap (the menu stays), a finger tap closes it. CONTROL = a copy whose onOutsidePress is the pre-lane closer (a
//     bubble-phase document mousedown): every surface stays open over the same clicks, the digits still land.
// The boot (the worktree server on the real xpra rung, headless chrome, §5's fake claude, the private runtime dir) and the
// teardown are scripts/xpra-window-boot.mjs's, ONCE for this part; the measures the §§ share live there too.
// Run: node scripts/test-desktop-xpra-window-seamless.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { freePorts, scratch, scratchHome } from './scratch.mjs';
import { bootXpraWindow } from './xpra-window-boot.mjs';

const { agentTokens, bin, bootedCopy, check, copyBack7, crashed, ctlServers, DIGITS7, dropPage, ensureActive, FAKE_CLAUDE, fakeHome, finish, HOSTNAME,
  hostResolves, keySeen7, launchOn, measurePane, mkPage, openPage, page, PORT, R2, reach7, readyOn, repo, sizeWinOn, skip, sleep, spawnCopy, srvEnv,
  target, threw, trustedClickAt, until, VNC_ENV, WebSocket, worktrees, wt, XCLIP, xclipKids, xenvFor, XTERM } = await bootXpraWindow('test-desktop-xpra-window-seamless');
let p1 = await page(target);
try {
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  check('the loopback page is a SECURE context (the API branch can be proven here)', await p1.evalJs('window.isSecureContext === true'));
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check(`the default ladder picks xpra on this box (${JSON.stringify(av.availability)})`, av.availability?.backend === 'xpra' && av.availability?.stream === 'xpra', av.availability);

  // ── §12 ROUND 3, LANE B (docs/design-desktop-apps-seamless §3.3; D3 decided as recommended 2026-09-25): SEAMLESS. GNOME
  // Calculator (client-side decorations: xpra says `decorations: 0`) ⇒ `.window.seamless` — NO VibeSpace title bar or status
  // strip over the app (both 0 high); a TRUSTED drag of the app's OWN header bar by 120×64 moves the VibeSpace window by
  // exactly that while the X main window stays at 0,0 (xpra's initiate-moveresize → WindowManager.beginDragFromPointer); the
  // app's own ─ □ buttons (MEASURED: GTK 4.22 paints all three under xpra 6.5.3) minimize / maximize / restore OUR window,
  // and our restore re-maps the app; a 250 ms hover of the top edge and Alt reveal both bars (a crossing does not; they
  // linger 1.5 s after the pointer returns into the app; leaving folds); the pauses — an agent lease, a tab chain, a phone
  // viewport, a blocked (not connected) pane — show the bars; the escape hatches — the taskbar menu's Show window frame ▸
  // On (per app, synced to a second client), the global setting off; the plain-http copy chip FLOATS over the folded strip
  // and hides after 10 s; the idle stop's last minute is a toast; a click into the picture activates the window; xterm
  // (no header bar) is never seamless. CONTROL = a copy of this tree whose verdict is forced false (the pre-lane look):
  // the bars everywhere ──
  console.log('§12 lane B — seamless: a CSD app loses our chrome, its header bar drags our window, hover / Alt reveal, the pauses and the hatches');
  const CALC12 = bin('gnome-calculator');
  if (!CALC12) skip('§12 the seamless legs', 'gnome-calculator not on PATH');
  else {
    const O12 = `http://127.0.0.1:${PORT}`;
    const ids12 = [];
    let A = null, B = null, H = null;
    const SM = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; const c = v && v.client; const main = c && c.windows.get(c.mainWid); const er = w.element.getBoundingClientRect(); const pr = v && v.pane ? v.pane.getBoundingClientRect() : null; const vis = (el) => !!el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0; const ov = w.content.querySelector('.desktop-app-blocked'); const probe = document.createElement('div'); probe.style.color = 'var(--border-active)'; document.body.appendChild(probe); const activeColor = getComputedStyle(probe).color; probe.remove(); return { wmId: w.id, seamless: w.element.classList.contains('seamless'), revealed: w.element.classList.contains('seamless-revealed'), v: w._desktopSeamless || null, tbH: w.titleBar.offsetHeight, barH: v && v.bar ? v.bar.offsetHeight : null, statusVisible: vis(v && v.status), moreVisible: vis(w.content.querySelector('.desktop-app-more')), win: { x: er.x, y: er.y, w: er.width, h: er.height }, left: parseFloat(w.element.style.left), top: parseFloat(w.element.style.top), pane: pr && { x: pr.x, y: pr.y, w: pr.width, h: pr.height }, main: main ? { x: main.x, y: main.y, w: main.w, h: main.h, decorations: main.meta.decorations, iconic: main.meta.iconic, xMax: main.meta.maximized } : null, status: v ? v.status.textContent : null, mr: w._desktopMoveResizeLog || [], st: w._desktopStateLog || [], maximized: !!w.isMaximized, minimized: !!w.isMinimized, active: app.wm.activeWindowId === w.id, border: getComputedStyle(w.element).borderTopWidth, borderColor: getComputedStyle(w.element).borderTopColor, activeColor, overlay: !!ov && getComputedStyle(ov).display !== 'none', chip: v && v.chip ? { shown: vis(v.chip), rect: (() => { const r = v.chip.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() } : null, idleWarned: w._desktopIdleWarned || null, chain: !!w._tabChain }; })()`;
    const mouse = async (P, type, x, y, extra = {}) => P.cdp('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const xTop = async (id) => { const r = await A.p.evalJs(`fetch('/api/desktop/apps/${id}/windows').then((r) => r.json())`); const rows = (r && r.windows) || []; return rows.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null; };
    try {
      await p1.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
      A = await mkPage(O12, { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
      // UI scale 100 % for the pixel legs (an earlier section's page left the origin's vibespace.uiScale behind — the drag is
      // judged in viewport px anyway, the window's own rect)
      await A.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`); await openPage(A.p, O12);
      check('§12: the page runs at UI scale 100 %', (await A.p.evalJs(`getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || '1'`)) === '1');
      await A.p.cdp('Page.bringToFront');
      const lc = await launchOn(A.p, { appId: 'gnome-calculator' });
      if (lc && lc.id) ids12.push(lc.id);
      const rc = lc && lc.id && await readyOn(A.p, lc.id);
      check('§12: GNOME Calculator reaches ready on the xpra rung', !!rc && rc.stream === 'xpra', lc);
      if (rc) {
        const id = rc.id;
        await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
        await ensureActive(A.p, id);
        await sizeWinOn(A.p, id, 900, 680);
        const s0 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.status === 'Connected' && v.main && v.seamless ? v : null; }, 40000, 250);
        await sleep(1200);
        const s1 = await A.p.evalJs(SM(id));
        console.log(`  §12 (1): verdict ${JSON.stringify(s1.v)}, title bar ${s1.tbH} px, status strip ${s1.barH} px, pane ${s1.pane && `${s1.pane.w}×${s1.pane.h}`} (the window ${s1.win.w}×${s1.win.h}), X main ${JSON.stringify(s1.main)}`);
        check(`§12 (1) CSD: the calculator's main window says decorations 0 ⇒ .window.seamless (${JSON.stringify(s1.v)})`, !!s0 && s1.seamless && s1.v.seamless && s1.v.why === 'csd' && s1.main.decorations === 0, s1.v);
        check(`§12 (1): the VibeSpace title bar is 0 high (offsetHeight ${s1.tbH}) and the status strip too (${s1.barH}) — the status words not visible; the pane is the whole window inside its 1 px frame`, s1.tbH === 0 && s1.barH === 0 && !s1.statusVisible && Math.abs(s1.pane.h - (s1.win.h - 2)) <= 1 && Math.abs(s1.pane.w - (s1.win.w - 2)) <= 1, s1);
        check(`§12 (1) the honest list — focus = the 1 px border: the active seamless window keeps a ${s1.border} frame in --border-active (${s1.borderColor})`, s1.active && s1.border === '1px' && s1.borderColor === s1.activeColor, { border: s1.border, color: s1.borderColor, want: s1.activeColor });
        // (2) THE HEADER-BAR DRAG: a trusted press on the app's own header bar, 20 moves to +120/+64, release
        const hx = s1.pane.x + 150, hy = s1.pane.y + 22;
        await mouse(A.p, 'mouseMoved', hx, hy);
        await mouse(A.p, 'mousePressed', hx, hy, { button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 20; i++) { await mouse(A.p, 'mouseMoved', hx + 6 * i, hy + 3.2 * i, { button: 'left', buttons: 1 }); await sleep(30); }
        await sleep(300);
        await mouse(A.p, 'mouseReleased', hx + 120, hy + 64, { button: 'left', buttons: 0, clickCount: 1 });
        await sleep(1200);
        const s2 = await A.p.evalJs(SM(id));
        const x2 = await xTop(id);
        const dl = Math.round((s2.win.x - s1.win.x) * 10) / 10, dt = Math.round((s2.win.y - s1.win.y) * 10) / 10; // viewport px (the rect) — what the pointer moved
        console.log(`  §12 (2): the window moved ${dl}/${dt} px on screen (style left/top ${s1.left},${s1.top} → ${s2.left},${s2.top}); moveresize log ${JSON.stringify(s2.mr.map((m) => [m.direction, m.op, m.started]))}; X main (client) ${s2.main && `${s2.main.x},${s2.main.y}`}, X server ${x2 && `${x2.x},${x2.y} ${x2.w}×${x2.h}`}`);
        check(`§12 (2): a drag of the app's OWN header bar by 120×64 moves the VibeSpace window by ${dl}/${dt} (±2) — through the window manager's own drag (initiate-moveresize direction 8, started)`, Math.abs(dl - 120) <= 2 && Math.abs(dt - 64) <= 2 && s2.mr.length >= 1 && s2.mr[0].direction === 8 && s2.mr[0].started === true, s2.mr);
        check(`§12 (2): the X main window stays at 0,0 (the client's ${s2.main && `${s2.main.x},${s2.main.y}`}, the X server's ${x2 && `${x2.x},${x2.y}`}) — the belt never moves; still seamless`, !!s2.main && s2.main.x === 0 && s2.main.y === 0 && !!x2 && x2.x === 0 && x2.y === 0 && s2.seamless, { main: s2.main, x2 });
        check(`§12 (2) MEASURED: GTK4 answers the release with a MOVERESIZE_CANCEL (direction 11) AFTER the drop — a no-op (the log: ${JSON.stringify(s2.mr.map((m) => [m.direction, m.started]))})`, s2.mr.some((m) => m.direction === 11 && m.started === false) && Math.abs(dl - 120) <= 2, s2.mr);
        // (3) THE APP'S OWN ─ □ BUTTONS (measured: GTK 4.22 under xpra 6.5.3 paints minimize, maximize, close at the right of its header bar)
        const ink = await A.p.evalJs(`(async () => { const r = ${JSON.stringify(s2.pane)}; return true; })()`);
        void ink;
        const shot = await A.p.cdp('Page.captureScreenshot', { format: 'png', clip: { x: s2.pane.x + s2.pane.w - 120, y: s2.pane.y + 4, width: 120, height: 36, scale: 1 } });
        const blobs = await A.p.evalJs(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const bg = [d[0], d[1], d[2]]; const box = (cx) => { let n = 0; for (let y = 8; y < 28; y++) for (let xx = cx - 9; xx < cx + 9; xx++) { const i = (y * c.width + xx) * 4; if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) n++; } return n; }; return { min: box(120 - 98), max: box(120 - 61), close: box(120 - 24), gap: box(120 - 80) }; })()`);
        console.log(`  §12 (3) MEASURED the header bar's right end (ink pixels per 18×20 box): minimize ${blobs.min}, maximize ${blobs.max}, close ${blobs.close}, the gap between ${blobs.gap}`);
        check(`§12 (3) MEASURED: GTK4 under xpra 6.5.3 PAINTS minimize / maximize / close in the calculator's header bar (ink ${blobs.min} / ${blobs.max} / ${blobs.close}; the gap between ${blobs.gap})`, blobs.min > 20 && blobs.max > 20 && blobs.close > 20 && blobs.gap < Math.min(blobs.min, blobs.max) / 2, blobs);
        await trustedClickAt(A.p, s2.pane.x + s2.pane.w - 61, s2.pane.y + 22);
        const s3 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.maximized && v.main && v.main.w > s2.main.w ? v : null; }, 8000, 150);
        check(`§12 (3): the app's OWN maximize button ⇒ window-metadata {maximized:true} ⇒ OUR window maximized (${JSON.stringify(s3 && s3.st)}) and the app re-fitted to the whole workspace (${s3 && s3.main && `${s3.main.w}×${s3.main.h}`})`, !!s3 && s3.st.some((e) => e.act === 'maximize') && s3.main.w > s2.main.w, s3 && { st: s3.st, main: s3.main });
        await sleep(800);
        const s3b = await A.p.evalJs(SM(id));
        await trustedClickAt(A.p, s3b.pane.x + s3b.pane.w - 61, s3b.pane.y + 22);
        const s4 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.maximized && v.st.some((e) => e.act === 'restore') ? v : null; }, 5000, 150);
        check(`§12 (3): its restore button ⇒ {maximized:false} ⇒ ours restored to where it was (${s4 && `${s4.left},${s4.top}`} = ${s2.left},${s2.top})`, !!s4 && s4.left === s2.left && s4.top === s2.top, s4 && { left: s4.left, top: s4.top, st: s4.st });
        // (3b) FIX r1 — A DRAG OFF A MAXIMIZED WINDOW tells the app it is no longer maximized (window.js's un-maximize says
        // onResize ⇒ setAppState): the app's own button shows maximize again and ONE click maximizes. LIVE CONTROL first: the
        // same drag with this window's onResize muted (the pre-fix silence) leaves the app believing it is maximized — the
        // verifier's repro (its restore glyph stays; its next click is dead)
        const WQ = `[...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`;
        const maxByApp = async () => { const v0 = await A.p.evalJs(SM(id)); await trustedClickAt(A.p, v0.pane.x + v0.pane.w - 61, v0.pane.y + 22); const v = await until(async () => { const x = await A.p.evalJs(SM(id)); return x && x.maximized && x.main && x.main.xMax === true ? x : null; }, 6000, 150); await sleep(900); return v; };
        const dragHeader = async (v) => { const x0 = v.pane.x + 300, y0 = v.pane.y + 22; await mouse(A.p, 'mouseMoved', x0, y0); await mouse(A.p, 'mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 }); for (let i = 1; i <= 20; i++) { await mouse(A.p, 'mouseMoved', x0 + 6 * i, y0 + 3.2 * i, { button: 'left', buttons: 1 }); await sleep(30); } await sleep(300); await mouse(A.p, 'mouseReleased', x0 + 120, y0 + 64, { button: 'left', buttons: 0, clickCount: 1 }); };
        await sleep(800);
        const mc = await maxByApp();
        await A.p.evalJs(`(() => { const w = ${WQ}; w._vsRealOnResize = w.onResize; w.onResize = () => {}; return true; })()`);
        if (mc) await dragHeader(mc);
        await sleep(1500);
        const mcD = await A.p.evalJs(SM(id));
        await A.p.evalJs(`(() => { const w = ${WQ}; w.onResize = w._vsRealOnResize; delete w._vsRealOnResize; w.onResize(); return true; })()`);
        const mcSync = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.main && v.main.xMax === false ? v : null; }, 5000, 150);
        check(`§12 (3b) CONTROL: with the un-maximize unsaid (onResize muted) the same drag leaves ours ${mcD && (mcD.maximized ? 'maximized' : 'restored')} while the app still believes it is MAXIMIZED (X meta ${mcD && mcD.main && mcD.main.xMax}) — the verifier's dead-click state; saying it afterwards re-syncs (${mcSync && mcSync.main.xMax})`, !!mc && !!mcD && !mcD.maximized && mcD.main.xMax === true && !!mcSync, { mc: !!mc, ours: mcD && mcD.maximized, x: mcD && mcD.main && mcD.main.xMax });
        await sleep(600);
        const mf = await maxByApp();
        if (mf) await dragHeader(mf);
        const mfD = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.maximized && v.main && v.main.xMax === false ? v : null; }, 4000, 150);
        const mfD2 = mfD || await A.p.evalJs(SM(id));
        check(`§12 (3b): the app's header-bar drag off its MAXIMIZED window restores ours AND tells the app (X meta maximized ${mfD2 && mfD2.main && mfD2.main.xMax}) — its button is maximize again`, !!mf && !!mfD, { ours: mfD2 && mfD2.maximized, x: mfD2 && mfD2.main && mfD2.main.xMax });
        await sleep(900);
        const mfA = await A.p.evalJs(SM(id));
        await A.p.evalJs(`(() => { const w = ${WQ}; w._desktopStateLog = []; return true; })()`);
        await trustedClickAt(A.p, mfA.pane.x + mfA.pane.w - 61, mfA.pane.y + 22);
        const mfM = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.maximized ? v : null; }, 4000, 150);
        check(`§12 (3b): …and the app's maximize button maximizes ours in ONE click (${JSON.stringify(mfM ? mfM.st : (await A.p.evalJs(SM(id))).st)})`, !!mfM && mfM.st.some((e) => e.act === 'maximize'));
        await sleep(900);
        if (mfM) { const r = await A.p.evalJs(SM(id)); await trustedClickAt(A.p, r.pane.x + r.pane.w - 61, r.pane.y + 22); await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.maximized ? v : null; }, 5000, 150); }
        await sleep(800);
        const s4b = await A.p.evalJs(SM(id));
        await trustedClickAt(A.p, s4b.pane.x + s4b.pane.w - 98, s4b.pane.y + 22);
        const s5 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.minimized ? v : null; }, 5000, 150);
        check('§12 (3): its minimize button ⇒ {iconic:true} ⇒ OUR window minimized', !!s5 && s5.st.some((e) => e.act === 'minimize'), s5 && s5.st);
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.restore(w.id); return true; })()`);
        const s6 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.minimized && v.main && v.main.iconic === false ? v : null; }, 6000, 150);
        await sleep(1200);
        const m6 = await measurePane(A.p, id);
        check(`§12 (3): restoring OUR window tells the display (the app is un-iconified — its metadata ${s6 && JSON.stringify(s6.main && { iconic: s6.main.iconic })}) and the app draws again (${m6 && (m6.inBrightFrac * 100).toFixed(0)} % of the window painted)`, !!s6 && !!m6 && m6.inBrightFrac > 0.5, { s6: s6 && s6.main, m6: m6 && m6.inBrightFrac });
        // (4) THE HOT ZONE: a crossing does not reveal; 250 ms of hover does; back into the app lingers 1.5 s; leaving folds
        const s7 = await A.p.evalJs(SM(id));
        const tx = s7.win.x + 300, ty = s7.win.y + 2, cx = s7.pane.x + s7.pane.w / 2, cy = s7.pane.y + s7.pane.h / 2;
        await mouse(A.p, 'mouseMoved', cx, cy); await sleep(100);
        await mouse(A.p, 'mouseMoved', tx, ty); await sleep(110);
        await mouse(A.p, 'mouseMoved', cx, cy); await sleep(400);
        const cross = await A.p.evalJs(SM(id));
        check('§12 (4): a pointer CROSSING the top edge (110 ms) reveals nothing', !cross.revealed && cross.tbH === 0, cross.reveal);
        await mouse(A.p, 'mouseMoved', tx, ty); await sleep(120);
        const early = await A.p.evalJs(SM(id));
        await sleep(330);
        const hov = await A.p.evalJs(SM(id));
        console.log(`  §12 (4): hover of the top edge: at 120 ms revealed=${early.revealed}, at 450 ms revealed=${hov.revealed} (title bar ${hov.tbH} px, status strip ${hov.barH} px, ⋯ visible ${hov.moreVisible})`);
        check(`§12 (4): a 250 ms hover of the top edge reveals BOTH bars (not at 120 ms; at 450 ms the title bar is ${hov.tbH} px, the strip ${hov.barH} px with its status and the ⋯)`, !early.revealed && hov.revealed && hov.tbH >= 20 && hov.barH >= 16 && hov.statusVisible && hov.moreVisible, { early: early.tbH, hov });
        check(`§12 (4): a reveal never resizes the pane (the bars OVERLAY the app: ${hov.pane.w}×${hov.pane.h} = ${s7.pane.w}×${s7.pane.h})`, hov.pane.h === s7.pane.h && hov.pane.w === s7.pane.w);
        // FIX r1 — while the bars show, the top edge's handle band is still a RESIZE (the bars sit under the handles); LIVE
        // CONTROL: the same probe with the lane's first z-index (25) put back hits the title bar there — a press would drag
        const HIT = `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const r = w.element.getBoundingClientRect(); const at = (x, y) => { const e = document.elementFromPoint(x, y); return e ? String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) : ''; }; return { rev: w.element.classList.contains('seamless-revealed'), n: at(r.x + 300, r.y + 2), nw: at(r.x + 3, r.y + 3), ne: at(r.right - 3, r.y + 3), bar: at(r.x + 300, r.y + 16) }; })()`;
        const hit = await A.p.evalJs(HIT);
        const hitC = await A.p.evalJs(`(() => { const st = document.createElement('style'); st.id = 'vs-ctl-z25'; st.textContent = '.window.seamless > .window-titlebar { z-index: 25 !important; }'; document.head.appendChild(st); const h = ${HIT}; st.remove(); return h; })()`);
        console.log(`  §12 (4) revealed hit test: ${JSON.stringify(hit)}; CONTROL (z 25): ${JSON.stringify(hitC)}`);
        check(`§12 (4): revealed, the top edge is still the RESIZE band — top+2 ${hit.n}, the corners ${hit.nw} / ${hit.ne}; 16 px down is the title bar (${hit.bar})`, hit.rev && /\bresize-n\b/.test(hit.n) && /resize-nw/.test(hit.nw) && /resize-ne/.test(hit.ne) && /window-title/.test(hit.bar), hit);
        check(`§12 (4) CONTROL: with the title bar back at z-index 25 the same points hit the title bar (${hitC.n}, ${hitC.nw}) — a press there would DRAG`, hitC.rev && /window-title/.test(hitC.n) && /window-title/.test(hitC.nw), hitC);
        await mouse(A.p, 'mouseMoved', cx, cy); await sleep(700);
        const linger = await A.p.evalJs(SM(id));
        await sleep(1300);
        const folded = await A.p.evalJs(SM(id));
        check(`§12 (4): back into the app the bars linger (at 0.7 s revealed=${linger.revealed}) and fold after 1.5 s (at 2.0 s revealed=${folded.revealed}, title bar ${folded.tbH} px)`, linger.revealed && !folded.revealed && folded.tbH === 0, { linger: linger.reveal, folded: folded.reveal });
        await mouse(A.p, 'mouseMoved', tx, ty); await sleep(450);
        await mouse(A.p, 'mouseMoved', s7.win.x + s7.win.w + 60, s7.win.y + 200); await sleep(250);
        const left12 = await A.p.evalJs(SM(id));
        check('§12 (4): leaving the WINDOW folds at once (leave = fold)', !left12.revealed && left12.tbH === 0, left12.reveal);
        // (5) ALT: held ⇒ both bars at once; released ⇒ the linger, then fold
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.focusWindow(w.id); w._desktopAppView.focus(); return true; })()`);
        await A.p.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 });
        await sleep(120);
        const alt = await A.p.evalJs(SM(id));
        await A.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 0 });
        await sleep(2000);
        const altUp = await A.p.evalJs(SM(id));
        check(`§12 (5): Alt held reveals both bars AT ONCE (title bar ${alt.tbH} px, strip ${alt.barH} px); released, they fold after the linger (${altUp.tbH} px)`, alt.revealed && alt.tbH >= 20 && alt.barH >= 16 && !altUp.revealed && altUp.tbH === 0, { alt: alt.reveal, altUp: altUp.reveal });
        // (6) A CLICK INTO THE PICTURE ACTIVATES THE WINDOW (the pane cancels its pointerdown — no mousedown ever focused it; measured before the fix)
        const probeId = await A.p.evalJs(`(() => { const w = app.wm.createWindow({ title: 'vs-seam-probe', type: 'terminal', x: 1000, y: 600, width: 320, height: 200 }); app.wm.focusWindow(w.id); return w.id; })()`);
        const sA = await A.p.evalJs(SM(id));
        await trustedClickAt(A.p, sA.pane.x + 200, sA.pane.y + Math.min(300, sA.pane.h / 2));
        await sleep(300);
        check('§12 (6): a click into the app\'s picture makes its VibeSpace window the ACTIVE one (another window held the focus)', !sA.active && (await A.p.evalJs(SM(id))).active);
        // (7) THE PAUSES — a tab chain: the tab bar lives in the title bar ⇒ the bars show; leaving the chain ⇒ seamless again
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.createTabChain(w, app.wm.windows.get(${JSON.stringify(probeId)})); app.wm.switchTab ? app.wm.switchTab(w._tabChain, 0) : 0; return true; })()`);
        const ch = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.chain && !v.seamless ? v : null; }, 4000, 100);
        check(`§12 (7) PAUSE chain: in a tab group the window is NOT seamless (why ${ch && ch.v.why}) and its title bar — the tab bar — shows (${ch && ch.tbH} px)`, !!ch && ch.v.why === 'chain' && ch.v.paused && ch.tbH >= 20, ch && ch.v);
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.removeFromTabChain(w._tabChain, ${JSON.stringify(probeId)}); return true; })()`);
        const unch = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.chain && v.seamless && v.tbH === 0 ? v : null; }, 4000, 100);
        check('§12 (7): leaving the chain ⇒ seamless again (the title bar folds)', !!unch && unch.tbH === 0, unch && unch.v);
        await A.p.evalJs(`(() => { app.wm.closeWindow(${JSON.stringify(probeId)}); return true; })()`);
        // — a phone viewport (≤ 768): the title bar is a phone's only way back
        await A.p.cdp('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
        const ph = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.v && v.v.why === 'phone' ? v : null; }, 4000, 100);
        check(`§12 (7) PAUSE phone: a 700 px viewport ⇒ not seamless (why ${ph && ph.v.why}) — the phone layout's own chrome, never folded`, !!ph && !ph.seamless && ph.v.paused, ph && ph.v);
        await A.p.cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
        await sizeWinOn(A.p, id, 900, 680);
        const back = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.seamless ? v : null; }, 6000, 150);
        check('§12 (7): back to 1400 px ⇒ seamless again', !!back);
        // — an AGENT LEASE: the user must SEE an agent is driving ⇒ the bars (with the mode badge) show while it holds the app
        if (!fs.existsSync(FAKE_CLAUDE)) skip('§12 (7) the lease pause', 'no fake claude');
        else {
          const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
          const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
          await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
          wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: fakeHome, cols: 80, rows: 24, reqId: 'seam12', name: 'seam-agent' }));
          const created = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'seam12'), 20000, 100);
          const token = created && await until(() => { for (const f of fs.readdirSync(path.join(wt, 'data', 'session-meta'))) { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', f), 'utf8')); if (j.agentToken && j.webuiSessionId === created.sessionId) return j.agentToken; } catch {} } return null; }, 10000, 200);
          agentTokens.push(token);
          wsMain.close();
          const agent = (verb, body) => fetch(`${O12}/api/agent/window/${verb}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
          if (token) await fetch(`${O12}/api/desktop/apps/${id}/reach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal: { kind: 'session', id: created.sessionId } }) }); // lane E (D1): shared first
          const at = token ? await agent('attach', { handle: id }) : null;
          const le = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.v && v.v.why === 'lease' ? v : null; }, 8000, 150);
          check(`§12 (7) PAUSE lease: an agent attaches (lease ${at && at.j && at.j.lease && at.j.lease.input}) ⇒ not seamless (why ${le && le.v.why}) — the title bar (${le && le.tbH} px) and the strip with the mode badge (${le && le.barH} px) SHOW`, !!le && !le.seamless && le.tbH >= 20 && le.barH >= 16 && (await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const b = w.content.querySelector('.browser-live-mode'); return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0; })()`)), le && le.v);
          const dt2 = token ? await agent('detach', { handle: id }) : null;
          const free = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.seamless ? v : null; }, 8000, 150);
          check(`§12 (7): the agent detaches (${dt2 && dt2.status}) ⇒ seamless again`, !!free);
        }
        // (8) THE ESCAPE HATCHES — a second client (B, blocked: the x5 overlay, not connected ⇒ its bars show) + the taskbar
        // menu's Show window frame ▸ On on A: frame shown on A, the choice in user state, and B hears it from the broadcast
        B = await mkPage(O12, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
        const onB = await until(() => B.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`), 15000, 250); if (!onB) await B.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
        const bS = await until(async () => { const v = await B.p.evalJs(SM(id)); return v && v.overlay ? v : null; }, 15000, 250);
        check(`§12 (8) the honest list — x5: the second client's pane is BLOCKED (the overlay, "Resume here") and not seamless — it has no picture to learn the app's frame from (why ${bS && bS.v && bS.v.why}): its title bar shows (${bS && bS.tbH} px) above the overlay`, !!bS && !bS.seamless && (bS.v.why === 'ssd' || bS.v.why === 'disconnected') && bS.tbH >= 20, bS && bS.v);
        await A.p.cdp('Page.bringToFront');
        const it = await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const el = document.querySelector('.taskbar-item[data-win-id="' + w.id + '"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (!it) check('§12 (8): the calculator has a taskbar item', false);
        else {
          await mouse(A.p, 'mouseMoved', it.x, it.y);
          await mouse(A.p, 'mousePressed', it.x, it.y, { button: 'right', buttons: 2, clickCount: 1 });
          await mouse(A.p, 'mouseReleased', it.x, it.y, { button: 'right', buttons: 0, clickCount: 1 });
          await sleep(300);
          const rows = await A.p.evalJs(`[...document.querySelectorAll('.taskbar-context-menu > .taskbar-context-menu-item')].map((e) => e.childNodes[0] ? e.childNodes[0].textContent.trim() : e.textContent.trim())`);
          check(`§12 (8) the escape hatch: the taskbar menu carries Show window frame ▸, Scale ▸, Keep running?/Stop app (${JSON.stringify(rows)})`, rows.some((r) => /^Show window frame/.test(r)) && rows.some((r) => /^Scale/.test(r)) && rows.some((r) => /^Stop app/.test(r)), rows);
          const par = await A.p.evalJs(`(() => { const el = [...document.querySelectorAll('.taskbar-context-menu > .taskbar-context-menu-item')].find((e) => /^Show window frame/.test(e.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + 12, y: r.y + r.height / 2, kids: [...el.querySelectorAll('.taskbar-context-menu .taskbar-context-menu-item')].map((c) => ({ text: c.textContent, disabled: c.classList.contains('disabled') })) }; })()`);
          check(`§12 (8): Show window frame ▸ says why and offers Auto (current) / On / Off (${JSON.stringify(par && par.kids)})`, !!par && par.kids.length === 4 && /the app draws its own title bar/.test(par.kids[0].text) && par.kids[0].disabled && /Auto/.test(par.kids[1].text) && par.kids[1].disabled && /On/.test(par.kids[2].text) && !par.kids[2].disabled, par && par.kids);
          if (par) {
            await mouse(A.p, 'mouseMoved', par.x, par.y); await sleep(250);
            const kid = await A.p.evalJs(`(() => { const el = [...document.querySelectorAll('.taskbar-context-menu .taskbar-context-menu .taskbar-context-menu-item')].find((e) => /On$/.test(e.textContent.trim())); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
            if (kid) { await mouse(A.p, 'mouseMoved', kid.x, kid.y); await sleep(120); await trustedClickAt(A.p, kid.x, kid.y); }
            const on = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.seamless && v.v.why === 'user' ? v : null; }, 4000, 100);
            // the view is local-first; the server's copy lands a GET + a PATCH later (lane D verify: a save is an edit of the
            // server's current map) — wait for it, never a single read racing the write
            const us = await until(async () => { const v = await A.p.evalJs(`fetch('/api/user-state').then((r) => r.json()).then((s) => s.desktopAppFrame || null)`); return v && v['gnome-calculator'] === 'on' ? v : null; }, 4000, 100);
            const onBv = await until(async () => { const v = await B.p.evalJs(SM(id)); return v && v.v && v.v.frame === 'on' ? v : null; }, 5000, 150);
            check(`§12 (8): Show window frame ▸ On ⇒ the frame shows on A (why ${on && on.v.why}, title bar ${on && on.tbH} px), remembered PER APP in user state (${JSON.stringify(us)}) and heard by the second client from the broadcast (B's choice ${onBv && onBv.v.frame})`, !!on && on.tbH >= 20 && !!us && us['gnome-calculator'] === 'on' && !!onBv, { on: on && on.v, us, b: onBv && onBv.v });
            await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const it = w._desktopAppFrameItems().find((r) => /Auto/.test(r.label)); it.action(); return true; })()`);
            const autoBack = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.seamless ? v : null; }, 4000, 100);
            const us2 = await until(async () => { const v = await A.p.evalJs(`fetch('/api/user-state').then((r) => r.json()).then((s) => s.desktopAppFrame || null)`); return v && !('gnome-calculator' in v) ? v : null; }, 4000, 100);
            check(`§12 (8): back to Auto ⇒ seamless again and the key REMOVED (${JSON.stringify(us2)})`, !!autoBack && !!us2 && !('gnome-calculator' in us2), us2);
          }
        }
        // — the global switch: desktop.seamless = off ⇒ today's look for every app, live
        await A.p.evalJs(`app.settings.set('desktop.seamless', 'off'); true`);
        const off = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.seamless && v.v.why === 'setting-off' ? v : null; }, 4000, 100);
        check(`§12 (8): Settings → Seamless desktop app windows = Off ⇒ the frame is back at once (why ${off && off.v.why}, title bar ${off && off.tbH} px)`, !!off && off.tbH >= 20);
        await A.p.evalJs(`app.settings.set('desktop.seamless', 'auto'); true`);
        check('§12 (8): …and Auto again ⇒ seamless', !!(await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.seamless ? v : null; }, 4000, 100)));
        await dropPage(B); B = null;
        // (9) THE FLOATING COPY CHIP on a plain-http hostname page: a copy nobody made here floats at the pane's top-right while
        // the strip is folded, and hides itself after 10 s
        if (!hostResolves) skip('§12 (9) the floating chip', `${HOSTNAME} does not resolve`);
        else if (!XCLIP) skip('§12 (9) the floating chip', 'xclip not on PATH');
        else {
          H = await mkPage(`http://${HOSTNAME}:${PORT}`, { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
          await H.p.cdp('Page.bringToFront');
          const onH = await until(() => H.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`), 15000, 250); if (!onH) await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
          await ensureActive(H.p, id);
          const hs = await until(async () => { const v = await H.p.evalJs(SM(id)); return v && v.seamless && v.status === 'Connected' ? v : null; }, 20000, 250);
          check('§12 (9): the calculator is seamless on the hostname page too (plain http, isSecureContext false)', !!hs && await H.p.evalJs('window.isSecureContext === false'));
          if (hs) {
            const xe = xenvFor(wt, rc);
            const k = spawn('sh', ['-c', `printf '%s' 'vs-seam-float' | ${XCLIP} -i -selection clipboard`], { env: xe, stdio: 'ignore', detached: true }); xclipKids.push(k);
            const fl = await until(async () => { const v = await H.p.evalJs(SM(id)); return v && v.chip && v.chip.shown ? v : null; }, 8000, 150);
            const t0 = Date.now();
            // FIX r1: at the pane's BOTTOM-right — the top-right is where the app's own ─ □ ✕ are (§12 (3) measured them at
            // pane right −98 / −61 / −24, 22 px down); neither the chip nor the one-time hint may cover the header bar
            const HINT = `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const h = w.content.querySelector('.desktop-copy-hint'); const c = w._desktopAppView.chip; const rr = (e) => { if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }; return { chip: rr(c), hint: rr(h) }; })()`;
            const inter = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            const btnBoxes = (pn) => [98, 61, 24].map((dx) => ({ x: pn.x + pn.w - dx - 9, y: pn.y + 12, w: 18, h: 20 }));
            const header = (pn) => ({ x: pn.x, y: pn.y, w: pn.w, h: 46 });
            const clear = (r, pn) => !!r && !!r.chip && !btnBoxes(pn).some((b) => inter(b, r.chip)) && !inter(header(pn), r.chip) && !inter(header(pn), r.hint);
            const fr = fl && await H.p.evalJs(HINT);
            const inBR = fl && fr && fr.chip && fl.pane.y + fl.pane.h - (fr.chip.y + fr.chip.h) >= 0 && fl.pane.y + fl.pane.h - (fr.chip.y + fr.chip.h) <= 24 && fl.pane.x + fl.pane.w - (fr.chip.x + fr.chip.w) >= 0 && fl.pane.x + fl.pane.w - (fr.chip.x + fr.chip.w) <= 24;
            // LIVE CONTROL: the lane's first placement (the folded bar at the pane's top, the chip 8 / the hint 36 px down) put back
            // over the same chip covers the app's buttons
            const frC = fl && await H.p.evalJs(`(() => { const st = document.createElement('style'); st.textContent = '.window.seamless:not(.seamless-revealed) .picture-shell-floating-chip > .desktop-bar { top: 0 !important; bottom: auto !important; } .window.seamless:not(.seamless-revealed) .picture-shell-floating-chip > .desktop-bar > .desktop-copied-chip { top: 8px !important; bottom: auto !important; } .window.seamless:not(.seamless-revealed) .picture-shell-floating-chip > .desktop-bar > .desktop-copy-hint { top: 36px !important; bottom: auto !important; }'; document.head.appendChild(st); const r = ${HINT}; st.remove(); return r; })()`);
            console.log(`  §12 (9): the chip ${fl ? `shown at ${Math.round(fl.chip.rect.x - fl.pane.x)},${Math.round(fl.chip.rect.y - fl.pane.y)} in a ${fl.pane.w}×${fl.pane.h} pane, ${fl.chip.rect.w.toFixed(0)}×${fl.chip.rect.h.toFixed(0)}; the hint ${JSON.stringify(fr && fr.hint)}; the title bar ${fl.tbH} px; CONTROL (top placement) chip ${JSON.stringify(frC && frC.chip)}` : 'never shown'}`);
            check('§12 (9) the honest list: a copy the page cannot write without a click ⇒ the chip FLOATS at the pane\'s BOTTOM-right while the strip stays folded (title bar 0 px)', !!fl && inBR && fl.tbH === 0 && fl.seamless, fl && { chip: fl.chip, pane: fl.pane });
            check('§12 (9): neither the chip nor the HTTPS hint covers the app\'s header bar or its ─ □ ✕ (the boxes §12 (3) measured)', !!fl && clear(fr, fl.pane), fr);
            check('§12 (9) CONTROL: the lane\'s first placement (top-right) over the same chip covers the app\'s own buttons — the leg above can fail', !!fl && !!frC && !clear(frC, fl.pane) && btnBoxes(fl.pane).some((b) => inter(b, frC.chip)), frC);
            const gone = await until(async () => { const v = await H.p.evalJs(SM(id)); return v && !v.chip.shown ? v : null; }, 13000, 250);
            check(`§12 (9): …and hides itself after 10 s (${gone ? ((Date.now() - t0) / 1000).toFixed(1) + ' s' : 'still shown'})`, !!gone && Date.now() - t0 >= 9000);
            try { process.kill(-k.pid, 'SIGKILL'); } catch {}
          }
          await dropPage(H); H = null;
          await A.p.cdp('Page.bringToFront');
          await ensureActive(A.p, id);
        }
        // (10) XTERM — no header bar of its own (no `decorations` key) ⇒ never seamless, our title bar stays
        const lx = await launchOn(A.p, { exec: XTERM, args: ['-T', 'vs-seam-xterm', '-geometry', '60x16'], label: 'xterm' });
        if (lx && lx.id) ids12.push(lx.id);
        const rx = lx && lx.id && await readyOn(A.p, lx.id);
        if (rx) {
          await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(rx.id)}); true`);
          await ensureActive(A.p, rx.id);
          const xs = await until(async () => { const v = await A.p.evalJs(SM(rx.id)); return v && v.status === 'Connected' && v.main ? v : null; }, 30000, 250);
          await sleep(800);
          const xs2 = await A.p.evalJs(SM(rx.id));
          check(`§12 (10) SSD: xterm (no decorations key: ${JSON.stringify(xs2 && xs2.main && xs2.main.decorations)}) is NOT seamless (why ${xs2 && xs2.v && xs2.v.why}) — its VibeSpace title bar (${xs2 && xs2.tbH} px) and strip (${xs2 && xs2.barH} px) are there`, !!xs && !xs2.seamless && xs2.v.why === 'ssd' && xs2.main.decorations === undefined && xs2.tbH >= 20 && xs2.barH >= 16, xs2 && { v: xs2.v, main: xs2.main });
        } else check('§12 (10): xterm reaches ready', false, lx);
        // (11) THE IDLE STOP'S LAST MINUTE IS A TOAST (the idle chip is folded away): a calculator launched under a 1-minute idle timeout
        await A.p.evalJs(`app.settings.set('desktop.idleTimeoutMin', 1); true`);
        await sleep(1200);
        const li = await launchOn(A.p, { appId: 'gnome-calculator' });
        if (li && li.id) ids12.push(li.id);
        const ri = li && li.id && await readyOn(A.p, li.id);
        if (ri) {
          check(`§12 (11): the second calculator carries the 1-minute idle timeout (${ri.idleTimeoutMs} ms)`, ri.idleTimeoutMs === 60000, ri.idleTimeoutMs);
          await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(ri.id)}); true`);
          await ensureActive(A.p, ri.id);
          const iw = await until(async () => { const v = await A.p.evalJs(SM(ri.id)); return v && v.seamless && v.idleWarned ? v : null; }, 20000, 250);
          const toasts = await A.p.evalJs(`[...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent)`);
          check(`§12 (11) the honest list: seamless (the idle chip folded), the last minute before the idle stop is a TOAST naming the hatch (${JSON.stringify(toasts.filter((x) => /under a minute/.test(x)))})`, !!iw && toasts.some((x) => /stops in under a minute without input — Keep running is in the window menu/.test(x)), toasts);
        } else check('§12 (11): the idle calculator reaches ready', false, li);
        await A.p.evalJs(`app.settings.set('desktop.idleTimeoutMin', 0); true`);
        await sleep(800);
      }
      // (12) CONTROL — THE PRE-LANE LOOK: a copy of this tree whose verdict is forced false (bundle rebuilt): the same
      // calculator keeps our title bar and status strip — the bars everywhere, as before this lane
      const wtc = scratch('deskxpra-seamctl');
      try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
      for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
      fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
      const vSrc = fs.readFileSync(path.join(wtc, 'src/lib/desktop-seamless.js'), 'utf8');
      const vLine = "  return { seamless: true, why: wantWhy };";
      check('CONTROL: the verdict\'s one seamless answer is spelled exactly once (the control replaces exactly it)', vSrc.split(vLine).length === 2);
      fs.writeFileSync(path.join(wtc, 'src/lib/desktop-seamless.js'), vSrc.replace(vLine, "  return { seamless: false, why: 'ssd' }; // CONTROL: the pre-lane look"));
      execFileSync(path.join(repo, 'node_modules/.bin/esbuild'), ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wtc, stdio: 'ignore' });
      const [PORTC] = await freePorts(1);
      const homeC = scratchHome('deskxpra-seamctl-home', fs);
      const sc = spawnCopy('the forced-false copy', wtc, { ...srvEnv, ...VNC_ENV, PORT: String(PORTC), HOME: homeC }); ctlServers.push(sc);
      let upC = await bootedCopy(sc, PORTC);
      check('CONTROL: the forced-false copy boots', upC, sc.bootWhy);
      if (upC) {
        await A.p.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
        await openPage(A.p, `http://127.0.0.1:${PORTC}`);
        const lcC = await launchOn(A.p, { appId: 'gnome-calculator' });
        const rcC = lcC && lcC.id && await readyOn(A.p, lcC.id);
        if (rcC) {
          await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(rcC.id)}); true`);
          await ensureActive(A.p, rcC.id);
          await sizeWinOn(A.p, rcC.id, 900, 680);
          const cs = await until(async () => { const v = await A.p.evalJs(SM(rcC.id)); return v && v.status === 'Connected' && v.main ? v : null; }, 40000, 250);
          await sleep(1000);
          const cs2 = await A.p.evalJs(SM(rcC.id));
          check(`CONTROL: on the forced-false copy the SAME calculator (decorations ${cs2 && cs2.main && cs2.main.decorations}) keeps the bars — title bar ${cs2 && cs2.tbH} px, strip ${cs2 && cs2.barH} px, no .seamless: the §12 (1) fold is the verdict's doing`, !!cs && !cs2.seamless && cs2.main.decorations === 0 && cs2.tbH >= 20 && cs2.barH >= 16 && cs2.statusVisible, cs2 && { v: cs2.v, tbH: cs2.tbH, barH: cs2.barH });
          await fetch(`http://127.0.0.1:${PORTC}/api/desktop/apps/${rcC.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        } else check('CONTROL: the calculator reaches ready on the copy', false, lcC);
      }
      try { sc.kill('SIGKILL'); } catch {}
    } catch (e) { threw('§12', e); }
    finally {
      for (const id of ids12) await fetch(`${O12}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      await dropPage(A); await dropPage(B); await dropPage(H);
    }
  }

  // ── §17 LANE M — A PRESS INTO THE PICTURE CLOSES OUR FLOATING MENUS (inc-muhms5kt-0ejl, the owner: "vibespace中的悬浮菜单，
  // 不相应在app画面里的点击自动隐藏"). The xpra pane cancels its pointerdown (the app gets the press, the browser neither
  // selects nor drags) and a cancelled pointerdown has no compatibility mousedown — every closer listened for one. On a
  // live GNOME Calculator: the ⚙ menu (a createPopover, its Appearance flyout open when hover is emulated), the title
  // bar's window menu (showContextMenu), the ⋯ menu with Scale ▸ open, the taskbar window list (a createPopover) and the
  // For-you popup (persistent) — each open, then ONE trusted click on a calculator digit key: the surface is GONE and the
  // calculator took the digit (its own Ctrl+C copy reads the digits back). The mechanism measured on the real pane (the
  // document saw pointerdown and click, never mousedown). CONTROL = a copy of this tree whose onOutsidePress is patched
  // back to the pre-lane closer (a bubble-phase document mousedown): every surface stays OPEN over the same clicks while
  // the digits still land ──
  console.log('§17 lane M — a press into the picture closes the ⚙ menu, the window menu, ⋯ Scale ▸, the window list and the For-you popup; the app still gets it');
  const CALC13 = bin('gnome-calculator');
  if (!CALC13) skip('§17 the outside-press legs', 'gnome-calculator not on PATH');
  else {
    const O13 = `http://127.0.0.1:${PORT}`;
    const ids13 = [];
    let A = null;
    // the five surfaces: how each opens (trusted input) and how the page says it is open
    const SURF = {
      gear: { open: `#btn-global-settings`, shown: `!!document.querySelector('.global-settings-popover')` },
      winmenu: { shown: `!!document.querySelector('.taskbar-context-menu')` },
      scale: { open: `.desktop-app-more`, shown: `!!document.querySelector('.context-menu')` },
      winlist: { open: `#taskbar-status`, shown: `!!document.querySelector('.overlap-switcher')` },
      foryou: { open: `#taskbar-user-todos`, shown: `(() => { const p = document.getElementById('user-todos-popup'); return !!p && !p.classList.contains('hidden'); })()` },
    };
    const centerOf = async (P, sel) => P.evalJs(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    /** open one surface with trusted input; returns what the page shows (and, for the gear, whether the flyout opened) */
    const openSurface = async (P, id, which) => {
      if (which === 'winmenu') {
        // right of the title's middle (the window menu then opens away from the keypad), left of the ─ □ ✕ controls
        const tb = await P.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const r = w.titleBar.getBoundingClientRect(); return { x: r.x + r.width * 0.7, y: r.y + r.height / 2, h: r.height }; })()`);
        await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tb.x, y: tb.y });
        await P.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: tb.x, y: tb.y, button: 'right', buttons: 2, clickCount: 1 });
        await P.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tb.x, y: tb.y, button: 'right', buttons: 0, clickCount: 1 });
      } else {
        const c = await centerOf(P, SURF[which].open);
        if (!c) return { shown: false, why: `${SURF[which].open} not visible` };
        await trustedClickAt(P, c.x, c.y);
      }
      const shown = await until(() => P.evalJs(SURF[which].shown), 4000, 100);
      let extra = null;
      if (shown && which === 'gear') {
        // the Appearance head's flyout (desktop mode) — or the accordion (hover: none) — opened by hovering / clicking the head
        const head = await P.evalJs(`(() => { const h = [...document.querySelectorAll('.global-settings-popover .gs-menu-item.has-sub')][0]; if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (head) { await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: head.x, y: head.y }); await sleep(300); }
        extra = await P.evalJs(`({ flyout: !!document.querySelector('.gs-flyout.open'), accordion: !!document.querySelector('.global-settings-popover .gs-acc-open, .global-settings-popover .gs-sub.open') })`);
      }
      if (shown && which === 'scale') {
        const row = await P.evalJs(`(() => { const r = [...document.querySelectorAll('.context-menu > .context-menu-item')].find((e) => /^Scale/.test(e.textContent)); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x + 20, y: b.y + b.height / 2 }; })()`);
        if (row) { await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: row.x, y: row.y }); await sleep(250); }
        extra = await P.evalJs(`({ scaleSub: [...document.querySelectorAll('.context-menu .context-menu')].some((s) => s.style.display !== 'none' && s.getBoundingClientRect().height > 0) })`);
      }
      return { shown: !!shown, extra };
    };
    /** the calculator's digit keys, as page points (R2 + DIGITS7 — §6/§7's own finder, the canvas backing read) */
    const digitPoints = async (P, id) => {
      const s = await P.evalJs(R2(id));
      const rows = await P.evalJs(DIGITS7(id));
      const order = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0']];
      const at = {};
      if (rows.length === 4) for (let i = 0; i < 4; i++) for (let j = 0; j < order[i].length; j++) { const q = rows[i][j]; if (q) at[order[i][j]] = { x: s.pane.x + s.offset.x + (q.cx / s.ratio) * s.scale, y: s.pane.y + s.offset.y + (q.cy / s.ratio) * s.scale }; }
      return at;
    };
    /** the owner's ⚙ menu is the desktop FLYOUT (the ring: .gs-flyout.open) — headless chrome answers hover: none, and
     *  CDP cannot emulate the hover media feature (test-gear-menu launches chrome with --blink-settings instead): THIS page
     *  answers the one query gearMenuMode asks with a hover-capable device; nothing else changes, nothing is persisted */
    const flyoutMode = (P) => P.evalJs(`(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q === '(hover: none)' ? Object.assign(mm('(max-width: 0px)'), {}) : mm(q)); return window.matchMedia('(hover: none)').matches === false; })()`);
    /** one calculator in the given page: launched, opened, active, sized, seamless OFF (the title bar + ⋯ visible), painted */
    const calcIn = async (P, origin) => {
      const lc = await launchOn(P, { appId: 'gnome-calculator' });
      const rc = lc && lc.id && await readyOn(P, lc.id);
      if (!rc) return { err: lc };
      await flyoutMode(P);
      await P.evalJs(`app.openDesktopApp(${JSON.stringify(rc.id)}); true`);
      await ensureActive(P, rc.id);
      await sizeWinOn(P, rc.id, 760, 640);
      const up = await until(async () => { const v = await P.evalJs(R2(rc.id)); return v && v.status === 'Connected' && v.main ? v : null; }, 40000, 250);
      await sleep(1500); // the first full paint
      const pts = up ? await until(async () => { const d = await digitPoints(P, rc.id); return Object.keys(d).length === 10 ? d : null; }, 15000, 500) : null;
      void origin;
      return { id: rc.id, up: !!up, pts };
    };
    /** the five legs on one page: open → one trusted click on a digit key → is the surface still shown? digits read back */
    const legs = async (P, id, pts, { tag, closeAfter }) => {
      const out = [];
      const order = ['gear', 'winmenu', 'scale', 'winlist', 'foryou'];
      const digits = ['7', '8', '9', '4', '5'];
      // a re-entry after the control's Escape cleared the calculator: each key SEEN in its copy before the next (allDigits7's rule)
      const park17 = { x: pts['7'].x, y: pts['7'].y - 2.4 * (pts['4'].y - pts['7'].y) };
      const reenter17 = async (keys) => {
        let seen = '';
        for (const x of keys) {
          const h = await reach7(P, id, pts[x]);
          if (h.off) { console.log(`  §17 ${tag} re-entry: '${x}' MISSED (its point is off the page)`); continue; }
          await trustedClickAt(P, pts[x].x, pts[x].y);
          await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: park17.x, y: park17.y });
          const r = await keySeen7(P, id, seen + x);
          if (r.seen) seen += x;
          else { console.log(`  §17 ${tag} re-entry: '${x}' MISSED (the readout showed ${JSON.stringify(r.readout)} after ${r.ms} ms${h.ok ? '' : `; its point was under ${h.cover}`})`); if (typeof r.readout === 'string' && /^\d*$/.test(r.readout)) seen = r.readout; }
        }
      };
      // start from a clean display (Escape = the calculator's clear; the pane has focus after a click)
      const first = pts['1'];
      await trustedClickAt(P, first.x, first.y); await sleep(300);
      await P.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await P.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(300);
      for (let i = 0; i < order.length; i++) {
        const which = order[i], d = digits[i];
        const o = await openSurface(P, id, which);
        // the mechanism, on the real pane: what the document sees of the ONE click (capture listeners — nothing can hide them)
        await P.evalJs(`(() => { window.__m13 = { pointerdown: 0, mousedown: 0, click: 0 }; if (!window.__m13armed) { window.__m13armed = true; for (const k of ['pointerdown', 'mousedown', 'click']) document.addEventListener(k, () => { window.__m13[k]++; }, true); } return true; })()`);
        await trustedClickAt(P, pts[d].x, pts[d].y);
        await sleep(600);
        const still = await P.evalJs(SURF[which].shown);
        const seen = await P.evalJs('window.__m13');
        out.push({ which, digit: d, opened: o.shown, extra: o.extra, still, seen });
        console.log(`  §17 ${tag} ${which}: opened ${o.shown}${o.extra ? ' ' + JSON.stringify(o.extra) : ''}${o.why ? ' (' + o.why + ')' : ''}; after one click on the '${d}' key: ${still ? 'STILL OPEN' : 'closed'}; the document saw ${JSON.stringify(seen)}`);
        if (still && closeAfter) {
          // the control: close it by hand (Escape = the [data-popover] protocol / the For-you popup's own Esc) before the next leg
          await P.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await P.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await sleep(200);
          if (await P.evalJs(SURF[which].shown)) { const far = await P.evalJs(`(() => { const r = document.getElementById('toolbar').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await trustedClickAt(P, far.x, far.y); await sleep(200); }
          // Escape went to the app too (the pane had focus): it cleared the calculator — re-enter the digits so far
          await reenter17(digits.slice(0, i + 1));
        }
      }
      // TOUCH on the real pane (the helper judges a finger only as a TAP): the ⚙ menu open, a finger DRAG across the
      // picture (90 px, the pane is touch-action: none — the app's drag, not a scroll) is not a tap: the menu STAYS; then
      // a TAP on the '6' key: closed, and the app took the 6
      const typed = [...digits];
      const touchLeg = { opened: (await openSurface(P, id, 'gear')).shown };
      const t0 = pts['1'];
      await P.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t0.x, y: t0.y }] });
      for (let k = 1; k <= 9; k++) { await P.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t0.x + 10 * k, y: t0.y }] }); await sleep(20); }
      await P.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(500);
      touchLeg.afterDrag = await P.evalJs(SURF.gear.shown);
      await P.evalJs(`(() => { window.__m13 = { pointerdown: 0, mousedown: 0, click: 0 }; window.__m13type = ''; if (!window.__m13t) { window.__m13t = true; document.addEventListener('pointerdown', (e) => { window.__m13type = e.pointerType; }, true); } return true; })()`);
      const t6 = pts['6'];
      await P.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t6.x, y: t6.y }] });
      await sleep(60);
      await P.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(600);
      touchLeg.afterTap = await P.evalJs(SURF.gear.shown);
      touchLeg.seen = await P.evalJs('({ ...window.__m13, pointerType: window.__m13type })');
      typed.push('6');
      console.log(`  §17 ${tag} touch: the ⚙ menu opened ${touchLeg.opened}; after a 90 px finger drag across the picture: ${touchLeg.afterDrag ? 'still open' : 'CLOSED'}; after a finger TAP on the '6' key: ${touchLeg.afterTap ? 'STILL OPEN' : 'closed'}; the document saw ${JSON.stringify(touchLeg.seen)}`);
      if (touchLeg.afterTap && closeAfter) {
        await P.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await P.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await sleep(200);
        await reenter17(typed);
      }
      const prev = (await P.evalJs(R2(id))).lastReceived;
      const got = (await copyBack7(P, id, prev)) || (prev === typed.join('') ? prev : ''); // unchanged = the client drops it: a re-entry's copy already read it
      return { out, touch: touchLeg, got, want: typed.join('') };
    };
    try {
      await p1.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
      A = await mkPage(O13, { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
      await A.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`); await openPage(A.p, O13);
      await A.p.cdp('Page.bringToFront');
      await A.p.evalJs(`app.settings.set('desktop.seamless', 'off'); true`); // the title bar + the ⋯ are the surfaces under test
      const C = await calcIn(A.p, O13);
      if (C.id) ids13.push(C.id);
      check('§17: GNOME Calculator reaches ready, connects and its ten digit keys are found in the picture', !!C.id && C.up && !!C.pts, C.err || { up: C.up, pts: C.pts });
      if (C.id && C.pts) {
        const R = await legs(A.p, C.id, C.pts, { tag: 'ours', closeAfter: true });
        const byW = Object.fromEntries(R.out.map((r) => [r.which, r]));
        check(`§17 (1) the ⚙ menu opened with its Appearance FLYOUT open (${JSON.stringify(byW.gear.extra)} — the owner's desktop mode) and ONE click on a calculator key CLOSED both`, byW.gear.opened && !!(byW.gear.extra && byW.gear.extra.flyout) && !byW.gear.still && !(await A.p.evalJs(`!!document.querySelector('.gs-flyout')`)), byW.gear);
        check('§17 (2) the title bar\'s window menu (showContextMenu) opened and the click into the picture CLOSED it', byW.winmenu.opened && !byW.winmenu.still, byW.winmenu);
        check(`§17 (3) the ⋯ menu opened with Scale ▸ expanded (${JSON.stringify(byW.scale.extra)}) and the click CLOSED it`, byW.scale.opened && !!(byW.scale.extra && byW.scale.extra.scaleSub) && !byW.scale.still, byW.scale);
        check('§17 (4) the taskbar window list (a createPopover) opened and the click CLOSED it', byW.winlist.opened && !byW.winlist.still, byW.winlist);
        check('§17 (5) the For-you popup (a persistent element) opened and the click HID it', byW.foryou.opened && !byW.foryou.still, byW.foryou);
        check(`§17 (6) the app still got every press: the calculator's own copy reads "${R.got}" (want "${R.want}") — the closer never cancels or stops the press`, R.got === R.want, R);
        const m = R.out.map((r) => r.seen);
        check(`§17 (7) THE MECHANISM on the real pane: each click into the picture reached the document as pointerdown ×1 and click ×1 and NEVER as mousedown (${JSON.stringify(m)})`, m.every((s) => s.pointerdown === 1 && s.click === 1 && s.mousedown === 0), m);
        check(`§17 (8) TOUCH: a 90 px finger drag across the picture is not a tap — the ⚙ menu stays open (${R.touch.afterDrag}); a finger TAP on the '6' key closes it (${!R.touch.afterTap}) as a ${R.touch.seen && R.touch.seen.pointerType} pointer, and the app took the 6 (the read-back above)`, R.touch.opened && R.touch.afterDrag === true && R.touch.afterTap === false && R.touch.seen && R.touch.seen.pointerType === 'touch', R.touch);
      }
      // (8) CONTROL — the pre-lane closer: a copy of this tree whose onOutsidePress listens for a BUBBLE-phase document
      // mousedown (the shape every closer had before the lane), bundle rebuilt, its own server + calculator
      const wtm = scratch('deskxpra-mctl');
      try { execSync(`git worktree remove --force ${wtm}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      execSync(`git worktree add --detach ${wtm} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtm);
      for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) execSync(`rm -rf ${wtm}/${f} && cp -r ${wt}/${f} ${wtm}/${f}`);
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtm, 'node_modules'));
      fs.mkdirSync(path.join(wtm, 'data'), { recursive: true });
      const uSrc = fs.readFileSync(path.join(wtm, 'src/lib/utils.js'), 'utf8');
      const EV = "document.addEventListener('pointerdown', (e) => {\n    const opening = began(e) === 'before';";
      const OPTS = 'const o = { capture: true, passive: true, signal: ctl.signal };';
      check('CONTROL: the helper\'s event and phase are each spelled exactly once (the control replaces exactly them)', uSrc.split(EV).length === 2 && uSrc.split(OPTS).length === 2);
      fs.writeFileSync(path.join(wtm, 'src/lib/utils.js'), uSrc.replace(EV, EV.replace("'pointerdown'", "'mousedown'")).replace(OPTS, 'const o = { capture: false, passive: true, signal: ctl.signal }; // CONTROL: the pre-lane closer'));
      execFileSync(path.join(repo, 'node_modules/.bin/esbuild'), ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wtm, stdio: 'ignore' });
      const [PORTM] = await freePorts(1);
      const homeM = scratchHome('deskxpra-mctl-home', fs);
      const sm = spawnCopy('the pre-lane-closer copy', wtm, { ...srvEnv, PORT: String(PORTM), HOME: homeM }); ctlServers.push(sm);
      let upM = await bootedCopy(sm, PORTM);
      check('CONTROL: the pre-lane-closer copy boots', upM, sm.bootWhy);
      if (upM) {
        const OM = `http://127.0.0.1:${PORTM}`;
        await A.p.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
        await A.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`).catch(() => {});
        await openPage(A.p, OM);
        await A.p.evalJs(`app.settings.set('desktop.seamless', 'off'); true`);
        const CM = await calcIn(A.p, OM);
        if (CM.id && CM.pts) {
          const RM = await legs(A.p, CM.id, CM.pts, { tag: 'CONTROL', closeAfter: true });
          const openAll = RM.out.filter((r) => r.opened && r.still).map((r) => r.which);
          check(`CONTROL: on the pre-lane closer EVERY surface stays OPEN after the click into the picture (${openAll.join(', ')} of ${RM.out.map((r) => r.which).join(', ')}) — the owner's report, on the real rung`, openAll.length === RM.out.length, RM.out);
          check(`CONTROL: …and a finger TAP into the picture leaves the ⚙ menu open too (${RM.touch.afterTap})`, RM.touch.opened && RM.touch.afterTap === true, RM.touch);
          check(`CONTROL: …while the calculator took the digits there too ("${RM.got}")`, RM.got === RM.want, RM);
          await fetch(`${OM}/api/desktop/apps/${CM.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        } else check('CONTROL: the calculator reaches ready on the copy and its digit keys are found', false, CM.err || { up: CM.up });
      }
      try { sm.kill('SIGKILL'); } catch {}
    } catch (e) { threw('§17', e); }
    finally {
      for (const id of ids13) await fetch(`${O13}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      await A?.p?.evalJs?.(`app.settings.set('desktop.seamless', 'auto'); true`).catch(() => {});
      await dropPage(A);
    }
  }
} catch (e) {
  crashed(e, p1);
} finally {
  p1.close();
}
finish();
