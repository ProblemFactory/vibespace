#!/usr/bin/env node
// THE XPRA WINDOW AT A DEVICE PIXEL RATIO — §6 + §11, on the real rung against a worktree server
// (a part of the test-desktop-xpra-window family — lane xpra-window-split, design q-038 ②: the giant split by § so the
// self-hosted desktop batch's floor is its longest part; every § keeps its number; the other parts are named below)
// The family: -open (§1–§4, §5, Stop, §8, §9, §13, §18) · -hidpi (§6, §11) · -hidpi-r2 (§7) · -close (§10) ·
// -scale (§14, §15, §16) · -seamless (§12, §17).
//   • §6 (2.369.158, docs/design-desktop-apps.zh.md §7.6) HiDPI + THE APP'S MINIMUM: a deviceScaleFactor-2 page, xterm +
//     GNOME Calculator — the canvas IS the screen pixel for pixel, the app's minimum clamps the window, phones — our
//     server vs a CONTROL copy carrying the pre-fix behaviour (the leg list is the § comment below);
//   • §11 (round 3, A3 — §3.4) THE SCALE: a DPR-2 page at UI scale 125 % launches GNOME
//     Calculator from the launcher's card ⇒ 2.5× (GDK_SCALE 2 in the app's environ, Xft.dpi
//     120 in its display, the chip "2.5× · auto"); ⋯ → Scale ▸ 1.5× → the confirm ⇒ the SAME
//     window on two clients shows the successor at 1.5× (GDK_SCALE 1, 144 dpi), the old one
//     stopped; CONTROL = a copy whose keeper ignores the UI scale (2× / 96).
// The boot (the worktree server on the real xpra rung, headless chrome, §5's fake claude, the private runtime dir) and the
// teardown are scripts/xpra-window-boot.mjs's, ONCE for this part; the measures the §§ share live there too.
// Run: node scripts/test-desktop-xpra-window-hidpi.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { freePorts, scratch, scratchHome, gtkRow } from './scratch.mjs';
import { bootXpraWindow } from './xpra-window-boot.mjs';

const { bin, bootedCopy, CALC6, check, crashed, ctlServers, D, dropPage, ensureActive, fakeHome, finish, identity7, launchOn, mkPage, openPage, page,
  PORT, readyOn, rebaseline, repo, revealBars, sizeWinOn, skip, sleep, spawnCopy, srvEnv, target, threw, trustedClickAt, until, VNC_ENV, worktrees,
  wt, XDOTOOL, xenvFor, xq, XTERM } = await bootXpraWindow('test-desktop-xpra-window-hidpi');
let p1 = await page(target);
try {
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  check('the loopback page is a SECURE context (the API branch can be proven here)', await p1.evalJs('window.isSecureContext === true'));
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check(`the default ladder picks xpra on this box (${JSON.stringify(av.availability)})`, av.availability?.backend === 'xpra' && av.availability?.stream === 'xpra', av.availability);

  // ── (6) HiDPI + THE APP'S MINIMUM (2.369.158, docs/design-desktop-apps.zh.md §7.6; the owner on a devicePixelRatio-2
  // screen with GNOME Calculator: "the DPI is way too low", the keypad's lower rows cut off, "this still looks like VNC"):
  // a headless page at deviceScaleFactor 2 on OUR server, and the SAME legs on a CONTROL copy of this tree carrying the
  // pre-fix behaviour (the view's ratio pinned to 1, the app's scale pinned to 1, `size-constraints` not asked for) ──
  console.log('§6 HiDPI + the app\'s minimum — a deviceScaleFactor-2 page, xterm + GNOME Calculator, our server vs the pre-fix control');
  // THE BOX'S GTK ROW (B-4260 — scripts/fixtures/gtk-rows.json, measured inside xpra at provision): the calculator's minimum
  // at 2× is 720×1232 on the hub's GTK 4.22, 694×980 on AIDev's 4.14 (which first announces 694×1004) — never the hub's pixels
  const G6 = CALC6 ? gtkRow() : null;
  const HI = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; if (!v || !v.pane) return null; const pr = v.pane.getBoundingClientRect(); const c = v.client; const main = c && c.windows.get(c.mainWid); const cv = v.pane.querySelector('.xpra-win-main canvas'); const cr = cv ? cv.getBoundingClientRect() : null; const er = w.element.getBoundingClientRect(); const chip = w.content.querySelector('.desktop-app-chip-scale'); return { dpr: devicePixelRatio, status: v.status.textContent, pane: { x: pr.x, y: pr.y, w: pr.width, h: pr.height }, main: main ? { x: main.x, y: main.y, w: main.w, h: main.h } : null, constraints: c ? c.mainConstraints : null, ratio: v.ratio, minSize: v.minSize, scale: v.stageScale, offset: v.stageOffset, badge: v.fitBadge ? { shown: v.fitBadge.style.display !== 'none', text: v.fitBadge.textContent } : null, canvas: cv ? { w: cv.width, h: cv.height, rw: cr.width, rh: cr.height, rx: cr.x, ry: cr.y } : null, win: { w: er.width, h: er.height, minW: w.minWidth, minH: w.minHeight }, chip: chip ? { shown: chip.style.display !== 'none', text: chip.textContent, title: chip.title } : null, backendTitle: (w.content.querySelector('.desktop-app-chip-backend') || {}).title || '' }; })()`;
  /** REDUNDANCY of the app's main canvas as SHOWN (a screenshot at the device scale): a 96-dpi picture the browser blows up
   *  2× carries one source pixel per 2 device pixels — along each axis one PHASE of pixels is (nearly) predictable from its
   *  neighbours (bilinear: the in-between pixel is their average) or equal to its partner (nearest). A picture rendered AT
   *  the device resolution has no such phase. Per axis: B = 1 − min(err₀, err₁) / max(err₀, err₁) over the second difference
   *  |2p − p₋ − p₊| of each phase, A = |eq₀ − eq₁| over "equal to the next pixel" per phase; score = max over both axes of
   *  max(A, B), computed on INK pixels only (|p − background| > 24 somewhere in the triple). ~0 = native, → 1 = upscaled. */
  const sharpness = async (p, id) => {
    const s = await p.evalJs(HI(id));
    if (!s || !s.canvas) return null;
    const clip = { x: Math.round(s.canvas.rx) + 2, y: Math.round(s.canvas.ry) + 2, width: Math.floor(Math.min(s.canvas.rw, s.pane.w)) - 4, height: Math.floor(Math.min(s.canvas.rh, s.pane.h)) - 4, scale: 1 };
    const shot = await p.cdp('Page.captureScreenshot', { format: 'png', clip });
    return p.evalJs(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const W = img.naturalWidth, H = img.naturalHeight; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, W, H).data; const g = new Float32Array(W * H); const hist = new Uint32Array(256); for (let i = 0; i < W * H; i++) { const v = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; g[i] = v; hist[Math.round(v)]++; } let bg = 0; for (let v = 1; v < 256; v++) if (hist[v] > hist[bg]) bg = v; const axis = (dx, dy) => { const err = [0, 0], cnt = [0, 0], eq = [0, 0]; for (let y = dy; y < H - dy; y++) for (let xx = dx; xx < W - dx; xx++) { const i = y * W + xx, a = g[i - dy * W - dx], b = g[i], cc = g[i + dy * W + dx]; if (Math.abs(a - bg) <= 24 && Math.abs(b - bg) <= 24 && Math.abs(cc - bg) <= 24) continue; const ph = (dx ? xx : y) & 1; err[ph] += Math.abs(2 * b - a - cc); cnt[ph]++; if (Math.abs(b - cc) <= 3) eq[ph]++; } const e0 = err[0] / (cnt[0] || 1), e1 = err[1] / (cnt[1] || 1); const B = Math.max(e0, e1) ? 1 - Math.min(e0, e1) / Math.max(e0, e1) : 0; const A = Math.abs(eq[0] / (cnt[0] || 1) - eq[1] / (cnt[1] || 1)); return { A, B, n: cnt[0] + cnt[1] }; }; const hx = axis(1, 0), vy = axis(0, 1); return { w: W, hh: H, bg, hx, vy, score: Math.max(hx.A, hx.B, vy.A, vy.B) }; })()`);
  };
  /** drag the window's SE resize handle by (dx, dy) with REAL mouse events; returns the pane and the window after */
  const dragSE = async (p, id, dx, dy) => {
    const h = await p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const r = w.element.querySelector('.resize-se').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: h.x, y: h.y });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: h.x, y: h.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) { await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: h.x + (dx * i) / 8, y: h.y + (dy * i) / 8, button: 'left', buttons: 1 }); await sleep(40); }
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: h.x + dx, y: h.y + dy, button: 'left', clickCount: 1 });
    await sleep(1500);
    return p.evalJs(HI(id));
  };
  /** one full run of the HiDPI legs against the server at `origin` (worktree `w`); returns what it measured */
  const runHi = async (origin, w, tag) => {
    const out = { tag };
    const H = await mkPage(origin, { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false });
    out.dpr = await H.p.evalJs('devicePixelRatio');
    const seqFile = path.join(fakeHome, `hidpi-${tag}.txt`);
    const lx = await launchOn(H.p, { exec: XTERM, args: ['-T', `vs-hidpi-${tag}`, '-geometry', '80x24', '-e', 'sh', '-c', `seq 1 900 | tr '\\n' ' '; cat > ${seqFile}`], label: `vs-hidpi-${tag}` });
    const rx = lx && lx.id && await readyOn(H.p, lx.id);
    out.xterm = rx ? { id: rx.id, scale: rx.scale, dpi: rx.dpi } : { error: (lx && (lx.error || lx.lastError)) || 'no record' };
    if (rx) {
      await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(rx.id)}); true`);
      await ensureActive(H.p, rx.id);
      await sizeWinOn(H.p, rx.id, 700, 500);
      const s = await until(async () => { const v = await H.p.evalJs(HI(rx.id)); return v && v.status === 'Connected' && v.main && v.canvas && v.canvas.w > 1 ? v : null; }, 30000, 300);
      await sleep(2500); // the repaint after the fit
      out.x = await H.p.evalJs(HI(rx.id));
      const xe = xenvFor(w, rx);
      out.xdpy = (xq(xe, 'xdpyinfo', []).match(/resolution:\s+(\S+)/) || [])[1] || null;
      const xr = xq(xe, 'xrdb', ['-query']);
      out.xftDpi = Number((xr.match(/^Xft\.dpi:\s+(\d+)/m) || [])[1]) || null;
      out.xtermFace = (xr.match(/^XTerm\*faceSize:\s+(\d+)/m) || [])[1] || null;
      const xw = ((await H.p.evalJs(`fetch('/api/desktop/apps/${rx.id}/windows').then((r) => r.json())`)).windows || []).slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
      out.xwin = xw && { w: xw.w, h: xw.h };
      out.sharp = await sharpness(H.p, rx.id);
      out.ident = await identity7(H.p, rx.id, 2); // r2: the canvas IS the screen, pixel for pixel (the redundancy score is printed, not judged — see below)
      // the pointer at DPR 2: a CSS point on the pane lands on X at twice it (through xdotool's own reading)
      if (XDOTOOL && s) {
        out.pointer = [];
        for (const [px, py] of [[101, 57], [Math.round(s.pane.w * 0.7), Math.round(s.pane.h * 0.6)]]) {
          await H.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.pane.x + px, y: s.pane.y + py });
          await sleep(400);
          const m = /x:(\d+) y:(\d+)/.exec(xq(xe, XDOTOOL, ['getmouselocation']) || '');
          out.pointer.push({ css: [px, py], x: m ? [Number(m[1]), Number(m[2])] : null });
        }
      }
      await H.p.evalJs(`fetch('/api/desktop/apps/${rx.id}/stop', { method: 'POST' }).then((r) => r.status)`);
    }
    if (CALC6) {
      const lc = await launchOn(H.p, { exec: CALC6, args: [], label: `vs-calc-${tag}` });
      const rc = lc && lc.id && await readyOn(H.p, lc.id);
      if (rc) {
        out.calcId = rc.id; out.calcRec = { scale: rc.scale, dpi: rc.dpi };
        await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(rc.id)}); true`);
        await ensureActive(H.p, rc.id);
        await sizeWinOn(H.p, rc.id, 900, 800);
        out.c0 = await until(async () => { const v = await H.p.evalJs(HI(rc.id)); return v && v.status === 'Connected' && v.main && v.main.h > 100 ? v : null; }, 40000, 300);
        // a calculator whose minimum may SETTLE after its first map (the row's calcMinFirst2x → calcMin2x — measured on
        // AIDev's 46: sometimes 694×1004 held, sometimes 694×980 ~0.2 s later) is given 3 s to settle, then read as it is
        out.c0 = (await until(async () => { const v = await H.p.evalJs(HI(rc.id)); const m = v && v.constraints && v.constraints['minimum-size']; return m && m[0] === G6.calcMin2x[0] && m[1] === G6.calcMin2x[1] ? v : null; }, 3000, 200)) || await H.p.evalJs(HI(rc.id)) || out.c0;
        await sleep(1500);
        out.c1 = await dragSE(H.p, rc.id, -700, -700); // far below any minimum
        await sleep(1500);
        out.c1 = await H.p.evalJs(HI(rc.id));
        out.c1x = ((await H.p.evalJs(`fetch('/api/desktop/apps/${rc.id}/windows').then((r) => r.json())`)).windows || []).slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
        // the '7' key: GNOME Calculator 50's basic keypad is bottom-anchored — at its minimum (720x1232 device px at 2x) '7'
        // sits at 12 % of the width and 357 device px above the bottom (measured on a GDK_SCALE=2 capture of the window)
        const c = out.c1;
        if (c && c.main) {
          const k = c.ratio, sc = c.scale, off = c.offset || { x: 0, y: 0 };
          const tx = c.pane.x + off.x + ((c.main.w * 0.12) / k) * sc, ty = c.pane.y + off.y + ((c.main.h - 357) / k) * sc;
          await trustedClickAt(H.p, tx, ty); await sleep(500); await trustedClickAt(H.p, tx, ty); await sleep(700);
          // read back through the product's own clipboard lane: Ctrl+C on the pane goes to the app, the app's copy comes back
          // as xpra's clipboard-token and the client surfaces its text (`client.lastReceived`)
          await H.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
          await H.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
          await H.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
          await H.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
          out.seven = (await until(() => H.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(rc.id)}); const c = w && w._desktopAppView && w._desktopAppView.client; return c && c.lastReceived ? c.lastReceived : null; })()`), 6000, 200)) || '';
          out.sevenAt = { tx, ty };
          if (process.env.VS_HIDPI_SHOTS) { const sh = await H.p.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.VS_HIDPI_SHOTS, `seven-${tag}.png`), Buffer.from(sh.data, 'base64')); }
        }
      }
    }
    return { out, H };
  };

  if (!CALC6) skip('§6 GNOME Calculator legs', 'gnome-calculator not on PATH');
  const A6 = await runHi(`http://127.0.0.1:${PORT}`, wt, 'ours');
  const o = A6.out;
  console.log(`  ours: DPR ${o.dpr}; xterm record scale ${o.xterm.scale} dpi ${o.xterm.dpi}; xdpyinfo ${o.xdpy}, Xft.dpi ${o.xftDpi}; pane ${o.x && `${o.x.pane.w}×${o.x.pane.h}`} CSS, X window ${o.xwin && `${o.xwin.w}×${o.xwin.h}`}, the client's main ${o.x && o.x.main && `${o.x.main.w}×${o.x.main.h}`}, increment ${o.x && JSON.stringify(o.x.constraints && o.x.constraints.increment)}; canvas ${o.x && o.x.canvas && `${o.x.canvas.w}×${o.x.canvas.h} backing in ${o.x.canvas.rw.toFixed(1)}×${o.x.canvas.rh.toFixed(1)} CSS`}; upscale redundancy ${o.sharp && `${o.sharp.score.toFixed(3)} (${JSON.stringify(o.sharp)})`}; pointer ${JSON.stringify(o.pointer)}`);
  check(`the page runs at devicePixelRatio 2 (${o.dpr})`, o.dpr === 2);
  check(`the launch carried the page's dpr and desktop.appScale auto made the app 2× — the record says scale ${o.xterm.scale}, the display's font dpi ${o.xterm.dpi}`, o.xterm.scale === 2 && o.xterm.dpi === 96, o.xterm);
  check(`the display's font dpi is 96 at GDK_SCALE=2 (Xft.dpi ${o.xftDpi}, xdpyinfo ${o.xdpy} — the client sends the SAME dpi; 192 there would double the app's text on top of GDK_SCALE, measured)`, o.xftDpi === 96 && o.xdpy === '96x96', { xft: o.xftDpi, xdpy: o.xdpy });
  const inc = (o.x && o.x.constraints && o.x.constraints.increment) || [1, 1];
  check(`the app window's X geometry is the pane × 2 (X ${o.xwin && `${o.xwin.w}×${o.xwin.h}`} vs pane ${o.x && `${o.x.pane.w}×${o.x.pane.h}`} CSS ⇒ ${o.x && `${Math.round(o.x.pane.w * 2)}×${Math.round(o.x.pane.h * 2)}`} device, within one ${inc.join('×')} cell)`, !!o.xwin && !!o.x && o.xwin.w <= Math.round(o.x.pane.w * 2) + 1 && Math.round(o.x.pane.w * 2) - o.xwin.w < inc[0] + 1 && o.xwin.h <= Math.round(o.x.pane.h * 2) + 1 && Math.round(o.x.pane.h * 2) - o.xwin.h < inc[1] + 1, { x: o.xwin, pane: o.x && o.x.pane, inc });
  check(`the canvas backing store is 2× its CSS size (${o.x && o.x.canvas && `${o.x.canvas.w}×${o.x.canvas.h} in ${o.x.canvas.rw.toFixed(1)}×${o.x.canvas.rh.toFixed(1)}`}) — one app pixel per screen pixel`, !!o.x && !!o.x.canvas && Math.abs(o.x.canvas.w - o.x.canvas.rw * 2) <= 2 && Math.abs(o.x.canvas.h - o.x.canvas.rh * 2) <= 2, o.x && o.x.canvas);
  check(`xterm's character cell is ${inc[0]}×${inc[1]} DEVICE px (the X resources gave it an Xft face at 2× before it started; its 6×13 bitmap at 1× — the text is drawn at the screen's resolution, not blown up)`, inc[0] >= 12 && inc[1] >= 26, inc);
  check(`the pointer at DPR 2 lands on X at TWICE the CSS point (${JSON.stringify(o.pointer)})`, !XDOTOOL || (Array.isArray(o.pointer) && o.pointer.length === 2 && o.pointer.every((q) => q.x && Math.abs(q.x[0] - 2 * q.css[0]) <= 2 && Math.abs(q.x[1] - 2 * q.css[1]) <= 2)), o.pointer);
  check('design 009 §B2: an AUTOMATIC scale puts no chip on the strip (it lives under ⋯; the hidden chip keeps its tooltip, ending "Click to change the scale") and the (never shown) backend chip still carries what xpra is', !!o.x && !!o.x.chip && !o.x.chip.shown && o.x.chip.text === '' && /Click to change the scale$/.test(o.x.chip.title) && /streams each app window as pixels/.test(o.x.backendTitle), o.x && { chip: o.x.chip, backend: o.x.backendTitle });
  if (CALC6) {
    console.log(`  ours calculator: record ${JSON.stringify(o.calcRec)}, constraints ${JSON.stringify(o.c0 && o.c0.constraints)}, min pane ${JSON.stringify(o.c1 && o.c1.minSize)}; window min ${o.c1 && `${o.c1.win.minW}×${o.c1.win.minH}`} layout px; after a drag 700 px past it: window ${o.c1 && `${o.c1.win.w.toFixed(0)}×${o.c1.win.h.toFixed(0)}`}, pane ${o.c1 && `${o.c1.pane.w}×${o.c1.pane.h}`}, main ${o.c1 && o.c1.main && `${o.c1.main.w}×${o.c1.main.h}`} device, stage ${o.c1 && o.c1.scale}; '7' clicked twice ⇒ the calculator copies "${o.seven}"`);
    const cmin = (o.c0 && o.c0.constraints && o.c0.constraints['minimum-size']) || [0, 0];
    const H2 = [...new Set([G6.calcMinFirst2x[1], G6.calcMin2x[1]])]; // the box's measured 2× minimum heights (first announced / settled)
    check(`GNOME Calculator at 2× announces its minimum (${JSON.stringify(o.c0 && o.c0.constraints)}) — the height exactly one the box measured at 2× (${H2.join(' or ')}: calculator ${G6.calculator}, GTK ${G6.gtk}; 2 × 616 on the hub), and the font dpi did not double it again`, H2.includes(cmin[1]) && cmin[0] >= G6.calcMin2x[0] - 20 && cmin[0] < G6.calcMin2x[0] + 80, o.c0 && o.c0.constraints);
    // "follows the app": against the app's minimum AT THE SAME MOMENT as the pane's (c1's own constraints)
    const cNow = (o.c1 && o.c1.constraints && o.c1.constraints['minimum-size']) || cmin;
    const wantMin = { w: Math.ceil(cNow[0] / 2), h: Math.ceil(cNow[1] / 2) };
    check(`the VibeSpace window's minimum follows the app: pane ≥ ${wantMin.w}×${wantMin.h} CSS (${o.c1 && JSON.stringify(o.c1.minSize)}); a resize DRAG 700 px past it stops there — the pane ${o.c1 && `${o.c1.pane.w}×${o.c1.pane.h}`} still holds the app`, !!o.c1 && !!o.c1.minSize && o.c1.minSize.w === wantMin.w && o.c1.minSize.h === wantMin.h && o.c1.pane.w >= wantMin.w - 0.5 && o.c1.pane.h >= wantMin.h - 0.5 && o.c1.win.w < 800, o.c1);
    check(`…and nothing is cropped: the main window (${o.c1 && o.c1.main && `${o.c1.main.w}×${o.c1.main.h}`} device) fits the pane at ratio 2, the picture unscaled (${o.c1 && o.c1.scale})`, !!o.c1 && !!o.c1.main && o.c1.main.w / 2 <= o.c1.pane.w + 1 && o.c1.main.h / 2 <= o.c1.pane.h + 1 && o.c1.scale === 1, o.c1);
    check(`a click on the '7' key at DPR 2 registers (the calculator copies "${o.seven}")`, /^77$/.test(o.seven || ''), o.seven);
  }
  // the UI scale on top of DPR 2: the counter-zoom keeps the canvas at net zoom 1 AND the device mapping
  if (CALC6 && o.calcId) {
    await A6.H.p.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`);
    await openPage(A6.H.p, `http://127.0.0.1:${PORT}`);
    const has = await until(() => A6.H.p.evalJs(`!!${HI(o.calcId)}`), 15000, 250); if (!has) await A6.H.p.evalJs(`app.openDesktopApp(${JSON.stringify(o.calcId)}); true`);
    await ensureActive(A6.H.p, o.calcId);
    const u = await until(async () => { const v = await A6.H.p.evalJs(HI(o.calcId)); return v && v.status === 'Connected' && v.canvas && v.canvas.w > 1 ? v : null; }, 30000, 300);
    await sleep(1500);
    const u2 = await A6.H.p.evalJs(HI(o.calcId));
    console.log(`  UI scale 1.25 at DPR 2: canvas ${u2 && u2.canvas && `${u2.canvas.w}×${u2.canvas.h} backing in ${u2.canvas.rw.toFixed(1)}×${u2.canvas.rh.toFixed(1)} CSS`}, pane ${u2 && `${u2.pane.w}×${u2.pane.h}`}, window min ${u2 && `${u2.win.minW}×${u2.win.minH}`} layout px, window ${u2 && `${u2.win.w.toFixed(0)}×${u2.win.h.toFixed(0)}`} on screen`);
    check('UI scale 1.25 on the 2× page: the canvas is still 2× its on-screen CSS box (net zoom 1 under the counter-zoom) and the pane still holds the app\'s minimum', !!u && !!u2 && !!u2.canvas && Math.abs(u2.canvas.w - u2.canvas.rw * 2) <= 2 && u2.pane.h >= G6.calcMin2x[1] / 2 - 0.5 && u2.pane.w >= G6.calcMin2x[0] / 2 - 0.5, u2);
    await A6.H.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`);
  }
  // the phone: the window IS the screen, the pane smaller than the app's minimum ⇒ the picture SCALED to fit, never cropped
  if (CALC6 && o.calcId) {
    await dropPage(A6.H); // the phone page is then the calculator's only (hence active) viewer
    for (const [PW, PH] of [[390, 844], [320, 568]]) {
      const Ph = await mkPage(`http://127.0.0.1:${PORT}`, { width: PW, height: PH, deviceScaleFactor: 2, mobile: true });
      const has = await until(() => Ph.p.evalJs(`!!${HI(o.calcId)}`), 15000, 250); if (!has) await Ph.p.evalJs(`app.openDesktopApp(${JSON.stringify(o.calcId)}); true`);
      await Ph.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(o.calcId)}); app.wm.focusWindow(w.id); return true; })()`);
      await ensureActive(Ph.p, o.calcId);
      const ph = await until(async () => { const v = await Ph.p.evalJs(HI(o.calcId)); return v && v.status === 'Connected' && v.main && v.canvas && v.pane.w > 0 ? v : null; }, 30000, 300);
      await sleep(2000);
      const v = await Ph.p.evalJs(HI(o.calcId));
      const shown = v && v.main ? { w: (v.main.w / v.ratio) * v.scale, h: (v.main.h / v.ratio) * v.scale } : null;
      const needsScale = v && v.minSize && (v.pane.w < v.minSize.w - 0.5 || v.pane.h < v.minSize.h - 0.5);
      console.log(`  phone ${PW}×${PH} @2: pane ${v && `${v.pane.w}×${v.pane.h}`}, app minimum pane ${v && JSON.stringify(v.minSize)}, stage ${v && v.scale}, the app shown ${shown && `${shown.w.toFixed(1)}×${shown.h.toFixed(1)}`} CSS, badge ${v && JSON.stringify(v.badge)}`);
      check(`phone ${PW}×${PH}: the app is shown WHOLE inside the pane (${shown && `${shown.w.toFixed(1)}×${shown.h.toFixed(1)}`} in ${v && `${v.pane.w}×${v.pane.h}`}) — never cropped${needsScale ? ', scaled to fit with the badge "' + (v.badge && v.badge.text) + '"' : ' (the pane holds its minimum: unscaled, no badge)'}`, !!ph && !!v && !!shown && shown.w <= v.pane.w + 1 && shown.h <= v.pane.h + 1 && (needsScale ? v.scale < 1 && v.badge.shown && v.badge.text === `Scaled to fit — the app needs at least ${v.minSize.w}×${v.minSize.h}` : v.scale === 1 && !v.badge.shown), v);
      if (PW === 320) check('the small phone really is below the app\'s minimum (the scaled leg ran, not the unscaled one)', !!needsScale, v);
      await dropPage(Ph);
    }
    await fetch(`http://127.0.0.1:${PORT}/api/home`).catch(() => {});
  }
  if (o.calcId) await p1.evalJs(`fetch('/api/desktop/apps/${o.calcId}/stop', { method: 'POST' }).then((r) => r.status)`);
  await dropPage(A6.H);

  // CONTROL — THE PRE-FIX BEHAVIOUR: a scratch copy of this tree with the three levers of this change pulled back (the view's
  // ratio pinned to 1 — CSS px are X px; the app's scale pinned to 1; `size-constraints` not asked for — the v21 list)
  {
    const wtc = scratch('deskxpra-hidpictl');
    try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
    execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
    for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
    fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
    const patches = [
      ['src/lib/xpra-view.js', "  const screenRatio = () => pixelRatioOf(typeof pixelRatio === 'function' ? pixelRatio() : pixelRatio);", '  const screenRatio = () => 1; // pre-fix CONTROL'], // lane D (a) respelled the lever (the ratio is screen ÷ pictureScale)
      ['src/desktop-serve.js', "const knobs = rungScales ? M.scaleKnobs(pick.scale, { rule: M.scaleRuleOf(row) }) : M.scaleKnobs(1);", 'const knobs = M.scaleKnobs(1); // pre-fix CONTROL'], // round 3 A3 + lane D (a) respelled the lever (the pick is scalePick's, the rule the row's)
      ['src/lib/xpra-proto.js', "'title', 'size-hints', 'size-constraints', 'class-instance'", "'title', 'size-hints', 'class-instance'"],
    ];
    let allOnce = true;
    for (const [f, from, to] of patches) { const src = fs.readFileSync(path.join(wtc, f), 'utf8'); if (src.split(from).length !== 2) allOnce = false; fs.writeFileSync(path.join(wtc, f), src.replace(from, to)); }
    check('CONTROL: each pre-fix lever is spelled exactly once in the tree (the control patches exactly those)', allOnce);
    rebaseline(wtc); execSync('npm run build', { cwd: wtc, stdio: 'ignore' });
    const [PORTH] = await freePorts(1);
    const homeH = scratchHome('deskxpra-hidpictl-home', fs);
    const sh = spawnCopy('the pre-fix copy', wtc, { ...srvEnv, ...VNC_ENV, PORT: String(PORTH), HOME: homeH }); ctlServers.push(sh);
    let upH = await bootedCopy(sh, PORTH);
    check('CONTROL: the pre-fix copy boots', upH, sh.bootWhy);
    if (upH) {
      const B6 = await runHi(`http://127.0.0.1:${PORTH}`, wtc, 'ctl');
      const q = B6.out;
      console.log(`  CONTROL: record scale ${q.xterm.scale}; X window ${q.xwin && `${q.xwin.w}×${q.xwin.h}`} for pane ${q.x && `${q.x.pane.w}×${q.x.pane.h}`}; canvas ${q.x && q.x.canvas && `${q.x.canvas.w}×${q.x.canvas.h} backing in ${q.x.canvas.rw.toFixed(1)}×${q.x.canvas.rh.toFixed(1)} CSS`}; sharpness ${q.sharp && q.sharp.score.toFixed(3)} vs ours ${o.sharp && o.sharp.score.toFixed(3)}; calculator after the drag: pane ${q.c1 && `${q.c1.pane.w}×${q.c1.pane.h}`}, main ${q.c1 && q.c1.main && `${q.c1.main.w}×${q.c1.main.h}`}, stage ${q.c1 && q.c1.scale}`);
      check(`CONTROL: pre-fix, the canvas backing store is its CSS size (${q.x && q.x.canvas && `${q.x.canvas.w}×${q.x.canvas.h} in ${q.x.canvas.rw.toFixed(1)}×${q.x.canvas.rh.toFixed(1)}`}) and X is the pane in CSS px — a 96-dpi bitmap the 2× screen blows up (the "2× backing store" leg fails there)`, !!q.x && !!q.x.canvas && Math.abs(q.x.canvas.w - q.x.canvas.rw) <= 2 && !!q.xwin && q.xwin.w <= q.x.pane.w + 1, q.x && q.x.canvas);
      // r2: the redundancy score is PRINTED, no longer judged — with the race fixed xterm's cell is 13×26 (EVEN), and text rows on an even
      // period give one row parity more "equal to the next pixel" (vy.A 0.12 on a native picture); the judged fact is the identity below
      console.log(`  upscale redundancy (informational): ours ${o.sharp && o.sharp.score.toFixed(3)} ${JSON.stringify(o.sharp && { hx: o.sharp.hx, vy: o.sharp.vy })}, pre-fix ${q.sharp && q.sharp.score.toFixed(3)}`);
      check(`the picture carries a pixel per DEVICE pixel — the xterm canvas IS the screen (${o.ident && `${o.ident.diff} of ${o.ident.n} stable px off`}) where the pre-fix canvas is blown up by the browser (${q.ident && `${(100 * q.ident.frac).toFixed(1)} % off at the same device origin`}) — the owner's "looks like VNC" was the 96-dpi bitmap blown up 2×`, !!o.ident && !!q.ident && o.ident.n > 100000 && o.ident.frac < 0.001 && q.ident.frac > 0.05, { ours: o.ident, ctl: q.ident });
      if (CALC6) check(`CONTROL: pre-fix, the same drag takes the calculator's pane below its minimum and the app is CROPPED (X keeps it ${q.c1x && `${q.c1x.w}×${q.c1x.h}`} in a ${q.c1 && `${q.c1.pane.w}×${q.c1.pane.h}`} pane, unscaled) — the owner's screenshot`, !!q.c1 && !!q.c1x && q.c1x.h > q.c1.pane.h + 1 && q.c1.scale === 1, { c1: q.c1, x: q.c1x });
      if (q.calcId) await B6.H.p.evalJs(`fetch('/api/desktop/apps/${q.calcId}/stop', { method: 'POST' }).then((r) => r.status)`);
      await dropPage(B6.H);
    }
    try { sh.kill('SIGKILL'); } catch {}
  }
  // ── (11) round 3 A3 (docs/design-desktop-apps-seamless §3.4) — THE SCALE DERIVED FROM VIBESPACE'S OWN SCALE, PER WINDOW:
  // a DPR-2 page at UI scale 125 % launches GNOME Calculator from the LAUNCHER (its catalog card — the product's own POST):
  // auto ⇒ 2.5× = (lane D (a)) GDK_SCALE 3 in the app's environ + Xft.dpi 96, the picture shown at 0.8333, the chip "2.5× · auto";
  // then ⋯ → Scale ▸ 1.5× → the confirm → the SAME VibeSpace window on BOTH clients now shows the successor at 1.5× (GDK_SCALE 2, 96 dpi, ×0.75),
  // the old session gone; CONTROL = a copy whose keeper ignores the UI scale (the pre-A3 pick): the same page gets 2× / 96 ──
  console.log('§11 A3 — the scale derived from dpr × UI scale (DPR 2 + 125 % ⇒ 2.5×: lane D (a) GDK_SCALE 3 + Xft.dpi 96 shown at 0.8333, measured in the app\'s display); the ⋯ Scale ▸ relaunch on two clients');
  const CALC11 = bin('gnome-calculator'), XRDB11 = bin('xrdb');
  const G11 = CALC11 ? gtkRow() : null; // the box's measured 2× minimum (B-4260): the 3× floor is 1.5 × it
  if (!CALC11 || !XRDB11) skip('§11 the scale legs', `${!CALC11 ? 'gnome-calculator' : 'xrdb'} not on PATH`);
  else {
    const O11 = `http://127.0.0.1:${PORT}`;
    const ids11 = [];
    const envOf = (pid) => { try { return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'latin1').split('\0').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } };
    const inside = (w, r) => { const xe = xenvFor(w, r); return { gdk: envOf(r.pids.app).GDK_SCALE || null, xft: Number((xq(xe, 'xrdb', ['-query']).match(/^Xft\.dpi:\s+(\d+)/m) || [])[1]) || null, xdpy: (xq(xe, 'xdpyinfo', []).match(/resolution:\s+(\S+)/) || [])[1] || null }; };
    const trustedClick = async (p, sel) => { const r = await p.evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`); if (r) await trustedClickAt(p, r.x, r.y); return !!r; };
    const S11 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; const c = v && v.client; const chip = w.content.querySelector('.desktop-app-chip-scale'); const more = w.content.querySelector('.desktop-app-more'); return { wmId: w.id, appId: w._desktopAppId, spec: w._openSpec, status: v ? v.status.textContent : null, constraints: c ? c.mainConstraints : null, main: c && c.windows.get(c.mainWid) ? { w: c.windows.get(c.mainWid).w, h: c.windows.get(c.mainWid).h } : null, chip: chip ? { shown: chip.style.display !== 'none', text: chip.textContent, title: chip.title } : null, more: more ? { shown: more.style.display !== 'none', svg: !!more.querySelector('svg') } : null, menu: w._desktopScaleMenu ? w._desktopScaleMenu() : null, n: [...app.wm.windows.values()].filter((x) => x.type === 'desktop-app').length }; })()`;
    let A = null, B = null;
    try {
      await p1.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
      A = await mkPage(O11, { width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false });
      await A.p.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`);
      await openPage(A.p, O11);
      const aScale = await A.p.evalJs(`[devicePixelRatio, getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim()]`);
      check(`§11: the page runs at devicePixelRatio ${aScale[0]} and UI scale ${aScale[1]}`, aScale[0] === 2 && aScale[1] === '1.25', aScale);
      // (1) the LAUNCHER's own POST: the catalog card (dpr + uiScale are the launcher's, never this suite's)
      const before = new Set((await A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => l.apps.map((a) => a.id))`)) || []);
      await A.p.evalJs(`(() => { document.getElementById('desktop-launch-dialog')?.remove(); document.getElementById('btn-desktop-apps').click(); return true; })()`);
      const card = await until(() => A.p.evalJs(`(() => { const c = document.querySelector('#desktop-launch-dialog .desktop-launch-card[data-app-id="gnome-calculator"]'); return c && !c.disabled ? true : null; })()`), 10000, 150);
      check('§11 (1): the launcher offers GNOME Calculator as a catalog card', !!card);
      await trustedClick(A.p, '#desktop-launch-dialog .desktop-launch-card[data-app-id="gnome-calculator"]');
      const id0 = await until(() => A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => (l.apps.find((a) => !${JSON.stringify([...before])}.includes(a.id) && a.appId === 'gnome-calculator') || {}).id || null)`), 15000, 200);
      if (id0) ids11.push(id0);
      const r0 = id0 && await readyOn(A.p, id0);
      check('§11 (1): the calculator reaches ready', !!r0, id0);
      if (r0) {
        await ensureActive(A.p, id0);
        await sizeWinOn(A.p, id0, 700, 900);
        const s0 = await until(async () => { const v = await A.p.evalJs(S11(id0)); return v && v.status === 'Connected' && v.constraints && v.constraints['minimum-size'] ? v : null; }, 40000, 300);
        const in0 = inside(wt, r0);
        const min0 = (s0 && s0.constraints && s0.constraints['minimum-size']) || [0, 0];
        console.log(`  §11 (1): record scale ${r0.scale} dpi ${r0.dpi} origin ${r0.scaleOrigin} from ${JSON.stringify(r0.scaleFrom)}; inside the display: GDK_SCALE=${in0.gdk}, Xft.dpi ${in0.xft}, xdpyinfo ${in0.xdpy}; the calculator's minimum ${JSON.stringify(min0)} device px (2× alone: 720x1232); chip ${JSON.stringify(s0 && s0.chip && s0.chip.text)}`);
        check(`§11 (1): DPR 2 × UI 1.25 through the launcher ⇒ the record says 2.5× — lane D (a): drawn at GDK_SCALE ${r0.gdkScale} (${r0.dpi} dpi), shown at ${r0.pictureScale} — origin auto, from {dpr 2, uiScale 1.25}`, r0.scale === 2.5 && r0.dpi === 96 && r0.gdkScale === 3 && r0.pictureScale === 0.8333 && r0.scaleOrigin === 'auto' && r0.scaleFrom && r0.scaleFrom.dpr === 2 && r0.scaleFrom.uiScale === 1.25, { scale: r0.scale, dpi: r0.dpi, gdk: r0.gdkScale, pic: r0.pictureScale, origin: r0.scaleOrigin, from: r0.scaleFrom });
        check(`§11 (1): MEASURED inside the app's display — GDK_SCALE=${in0.gdk} in the calculator's environ, Xft.dpi ${in0.xft} in its resource database`, in0.gdk === '3' && in0.xft === 96, in0);
        // GNOME Calculator 50's minimum is BUTTON-bound (measured: 720x1232 at 2.5× / 120 dpi exactly as at 2× / 96 — its 120-dpi
        // text fits inside the 2× buttons; and 360x616 at 1.5× / 144): the widgets half is asserted here, the TEXT half is
        // measured where a text-bound window exists — test-desktop-app-keeper §20 (a) (xterm's 40×10 cells, 1.25× at 120 dpi)
        const F3x = [Math.floor(1.5 * G11.calcMin2x[0] * 0.99), Math.floor(1.5 * G11.calcMin2x[1] * 0.99)]; // 1 %: GTK rounds a scaled minimum
        check(`§11 (1): the calculator draws its widgets at 3× — its minimum ${JSON.stringify(min0)} is at the 3× floor ${F3x.join('x')} (the box's 2× minimum ${G11.calcMin2x.join('x')} × 1.5; 1080x1848 on the hub), shown at 0.8333 = 2.5×`, min0[0] >= F3x[0] && min0[1] >= F3x[1], min0);
        check(`§11 (1): an automatic 2.5× puts no chip on the strip (design 009 §B2 — ${JSON.stringify(s0 && s0.chip)}), its numbers stay the hidden chip's tooltip, and the ⋯ button is there (an SVG)`, !!s0 && !!s0.chip && !s0.chip.shown && s0.chip.text === '' && /devicePixelRatio 2 × UI scale 125%/.test(s0.chip.title) && /widgets 2\.5×, text at 96 dpi/.test(s0.chip.title) && /Drawn at 3× and shown at 83\.3%/.test(s0.chip.title) && !!s0.more && s0.more.shown && s0.more.svg, s0 && { chip: s0.chip, more: s0.more });
        // (2) a second client (DPR 1) holds the same window (the layout sync), blocked — its menu is disabled with the reason
        B = await mkPage(O11, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
        const onB = await until(() => B.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)})`), 15000, 250); if (!onB) await B.p.evalJs(`app.openDesktopApp(${JSON.stringify(id0)}); true`);
        const bm = await until(async () => { const v = await B.p.evalJs(S11(id0)); return v && v.menu && v.menu.why ? v : null; }, 10000, 250);
        // (page B shares the origin's localStorage, so its UI scale is A's 125 %: at DPR 1 its auto would derive 1 × 1.25 = 1.25)
        check(`§11 (2): on the second client (not the active viewer) Scale ▸ is disabled with the reason (${bm && bm.menu && bm.menu.why}); auto there would derive ${bm && bm.menu && bm.menu.rows[0].scale}× (DPR 1 × its 125 %)`, !!bm && bm.menu.why === 'seat' && bm.menu.rows.every((r) => r.disabled) && bm.menu.rows[0].scale === 1.25, bm && bm.menu);
        const wmA = s0 && s0.wmId, wmB = bm && bm.wmId;
        // (3) ⋯ → Scale ▸ → 1.5× → the confirm → Relaunch — real clicks
        await revealBars(A.p, id0); // lane B: the calculator is seamless — its strip (and the ⋯) folded until revealed
        const mb = await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)}); const r = w.content.querySelector('.desktop-app-more').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        await trustedClickAt(A.p, mb.x, mb.y); await sleep(300);
        const par = await A.p.evalJs(`(() => { const el = [...document.querySelectorAll('.context-menu > .context-menu-item')].find((e) => /^Scale/.test(e.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + 12, y: r.y + r.height / 2, rows: [...el.querySelectorAll('.context-menu .context-menu-item')].map((c) => ({ text: c.textContent, disabled: c.classList.contains('disabled') })) }; })()`);
        check(`§11 (3): ⋯ opens the window's menu with Scale ▸ Auto / 1× / 1.5× / 2× / 2.5× / 3× (${JSON.stringify(par && par.rows)}) — auto is current and not offered again; no app default stored ⇒ no default rows`, !!par && par.rows.length === 6 && /Auto \(2\.5×\)/.test(par.rows[0].text) && par.rows[0].text.startsWith('✓') && par.rows[0].disabled && par.rows.slice(1).every((r) => !r.disabled), par);
        if (par) {
          await A.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: par.x, y: par.y }); await sleep(300);
          const kid = await A.p.evalJs(`(() => { const el = [...document.querySelectorAll('.context-menu .context-menu .context-menu-item')].find((e) => /1\.5×/.test(e.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
          if (kid) { await A.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: kid.x, y: kid.y }); await sleep(150); await trustedClickAt(A.p, kid.x, kid.y); }
          const dlg = await until(() => A.p.evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay, .modal-overlay')].pop(); const b = o && o.querySelector('.btn-create'); return b ? { text: o.textContent, ok: b.textContent } : null; })()`), 5000, 100);
          check(`§11 (3): the pick asks first, saying the app restarts and unsaved work is lost (${JSON.stringify(dlg)})`, !!dlg && /restarts at the new scale; unsaved work in it is lost/.test(dlg.text) && dlg.ok === 'Relaunch', dlg);
          const t0 = Date.now();
          await A.p.evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay, .modal-overlay')].pop(); o.querySelector('.btn-create').click(); return true; })()`);
          // (4) the SAME window on both clients follows the successor
          const follow = async (P, wmId) => until(async () => { const v = await P.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(wmId)}); return w && w._desktopAppId !== ${JSON.stringify(id0)} ? { appId: w._desktopAppId, spec: w._openSpec } : null; })()`); return v; }, 20000, 100);
          const fa = await follow(A.p, wmA); const faMs = Date.now() - t0;
          const fb = await follow(B.p, wmB); const fbMs = Date.now() - t0;
          const id1 = fa && fa.appId;
          if (id1) ids11.push(id1);
          const r1 = id1 && await readyOn(A.p, id1);
          const readyMs = Date.now() - t0;
          check(`§11 (4): the SAME VibeSpace window (${wmA}) now shows the successor ${id1} (${faMs} ms, openSpec ${JSON.stringify(fa && fa.spec)}) — and on the second client too (${wmB} → ${fb && fb.appId}, ${fbMs} ms)`, !!fa && !!fb && fb.appId === id1 && fa.spec && fa.spec.id === id1 && fb.spec && fb.spec.id === id1, { fa, fb });
          if (r1) {
            const s1 = await until(async () => { const v = await A.p.evalJs(S11(id1)); return v && v.status === 'Connected' && v.constraints && v.constraints['minimum-size'] ? v : null; }, 40000, 300);
            const in1 = inside(wt, r1);
            const min1 = (s1 && s1.constraints && s1.constraints['minimum-size']) || [0, 0];
            const old = await (await fetch(`${O11}/api/desktop/apps/${id0}`)).json();
            const nB = await B.p.evalJs(S11(id1));
            console.log(`  §11 (4): relaunch → ready ${readyMs} ms; successor scale ${r1.scale} dpi ${r1.dpi} origin ${r1.scaleOrigin}; inside: GDK_SCALE=${in1.gdk}, Xft.dpi ${in1.xft}; minimum ${JSON.stringify(min1)}; chip ${JSON.stringify(s1 && s1.chip && s1.chip.text)}; old ${old.state} stoppedBy ${old.stoppedBy} replacedBy ${old.replacedBy}, its app pid ${r0.pids.app} alive ${D.pidAlive(r0.pids.app)}; desktop-app windows: A ${s1 && s1.n}, B ${nB && nB.n}`);
            check(`§11 (4): the successor runs at the CHOSEN 1.5× — the record (${r1.scale}×, ${r1.dpi} dpi, GDK_SCALE ${r1.gdkScale} × ${r1.pictureScale}, ${r1.scaleOrigin}) and MEASURED inside its display (GDK_SCALE=${in1.gdk}, Xft.dpi ${in1.xft}: lane D (a) — widgets AND text 1.5×)`, r1.scale === 1.5 && r1.dpi === 96 && r1.gdkScale === 2 && r1.pictureScale === 0.75 && r1.scaleOrigin === 'chosen' && in1.gdk === '2' && in1.xft === 96, { r1: { scale: r1.scale, dpi: r1.dpi, gdk: r1.gdkScale, pic: r1.pictureScale, origin: r1.scaleOrigin }, in1 });
            check(`§11 (4): the picture reconnected to the successor (${s1 && s1.status}) and its widgets are drawn at 2× (minimum ${JSON.stringify(min1)}: the 2× floor ${G11.calcMin2x.join('x')}, under the 3× one) and shown at 0.75`, !!s1 && s1.status === 'Connected' && min1[0] >= G11.calcMin2x[0] && min1[0] < 1.5 * G11.calcMin2x[0] && min1[1] >= G11.calcMin2x[1] && min1[1] < 1.5 * G11.calcMin2x[1], min1);
            check(`§11 (4): a chosen 1.5× is on the strip in words, "Larger 1.5×" (design 009 §B2 — ${JSON.stringify(s1 && s1.chip && s1.chip.text)})`, !!s1 && !!s1.chip && s1.chip.text === 'Larger 1.5×', s1 && s1.chip);
            // desktop A r1: the seat is CARRIED — the client that chose the scale (A) holds the successor's seat with no Resume,
            // the other one (B, blocked before) is blocked again, whichever retargeted first (the verifier saw B win the race)
            const SEAT11 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const s = w._desktopSeats || {}; const ov = w.content.querySelector('.desktop-app-blocked'); return { pane: w._desktopPaneKey, active: s.active || null, known: !!s.known, mode: w._desktopAppView && w._desktopAppView.mode, overlay: !!ov && getComputedStyle(ov).display !== 'none' }; })()`;
            const seatA = await until(async () => { const v = await A.p.evalJs(SEAT11(id1)); return v && v.known && v.active ? v : null; }, 8000, 150);
            const seatB = await B.p.evalJs(SEAT11(id1));
            check(`§11 (4) A r1: the client that chose the scale is ACTIVE on the successor with no Resume (seat ${seatA && seatA.active}, its pane ${seatA && seatA.pane}, mode ${seatA && seatA.mode}, overlay ${seatA && seatA.overlay}); the other client is blocked (${seatB && seatB.pane})`, !!seatA && seatA.active === seatA.pane && seatA.mode === 'active' && !seatA.overlay && !!seatB && seatB.pane !== seatA.pane && seatB.active === seatA.pane, { seatA, seatB });
            check(`§11 (4): the old session stopped for the relaunch and names its successor (${old.state}, ${old.stoppedBy}, ${old.replacedBy}); its calculator is gone`, old.state === 'exited' && old.stoppedBy === 'relaunch' && old.replacedBy === id1 && !D.pidAlive(r0.pids.app), { state: old.state, stoppedBy: old.stoppedBy, replacedBy: old.replacedBy });
            check(`§11 (4): one window per client, never a duplicate or a closed one (A ${s1 && s1.n}, B ${nB && nB.n}); nobody still names the old id`, !!s1 && s1.n === 1 && !!nB && nB.n === 1 && !(await A.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)})`)) && !(await B.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)})`)));
          }
        }
      }
      // (5) CONTROL — the pre-A3 keeper (the setting + dpr only; the UI scale never reaches the pick) on a copy of this tree:
      // the SAME page (DPR 2, 125 %) gets 2× at 96 dpi — the (1) leg is the derivation, not a coincidence
      const wtc = scratch('deskxpra-a3ctl');
      try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
      for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
      fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
      const kSrc = fs.readFileSync(path.join(wtc, 'src/desktop-serve.js'), 'utf8'); // lane C1: the launch is the machine half's
      const pickLine = "const pick = M.scalePick({ choice: opts.scaleChoice, appDefault: v.launch.scaleChoice, setting: serverSetting('desktop.appScale'), dpr: v.launch.dpr, uiScale: v.launch.uiScale });";
      check('CONTROL: the keeper\'s scale pick is spelled exactly once (the control replaces exactly it)', kSrc.split(pickLine).length === 2);
      fs.writeFileSync(path.join(wtc, 'src/desktop-serve.js'), kSrc.replace(pickLine, "const pick = { scale: M.appScaleFor(serverSetting('desktop.appScale'), v.launch.dpr), origin: null, from: null }; // pre-A3 CONTROL: dpr only"));
      const [PORTC] = await freePorts(1);
      const homeC = scratchHome('deskxpra-a3ctl-home', fs);
      const sc = spawnCopy('the pre-A3 copy', wtc, { ...srvEnv, ...VNC_ENV, PORT: String(PORTC), HOME: homeC }); ctlServers.push(sc);
      let upC = await bootedCopy(sc, PORTC);
      check('CONTROL: the pre-A3 copy boots', upC, sc.bootWhy);
      if (upC) {
        await A.p.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
        await openPage(A.p, `http://127.0.0.1:${PORTC}`); // the same page: DPR 2, localStorage uiScale 125 is per origin — set it here too
        await A.p.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`); await openPage(A.p, `http://127.0.0.1:${PORTC}`);
        const lc = await A.p.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'gnome-calculator', dpr: devicePixelRatio, uiScale: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) }) }).then((r) => r.json())`);
        const rc = lc && lc.id && await readyOn(A.p, lc.id);
        const inC = rc ? inside(wtc, rc) : null;
        check(`CONTROL: on the pre-A3 copy the same DPR-2 / 125 % client gets ${rc && rc.scale}× with Xft.dpi ${inC && inC.xft} — the UI scale never reached the app`, !!rc && rc.scale === 2 && inC && inC.xft === 96 && inC.gdk === '2', { rc: rc && { scale: rc.scale, dpi: rc.dpi }, inC });
        if (lc && lc.id) await fetch(`http://127.0.0.1:${PORTC}/api/desktop/apps/${lc.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      }
      try { sc.kill('SIGKILL'); } catch {}
    } catch (e) { threw('§11', e); }
    finally {
      for (const id of ids11) await fetch(`${O11}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      if (A) await A.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`).catch(() => {});
      await dropPage(A); await dropPage(B);
    }
  }

} catch (e) {
  crashed(e, p1);
} finally {
  p1.close();
}
finish();
