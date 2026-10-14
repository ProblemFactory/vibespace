#!/usr/bin/env node
// THE XPRA WINDOW AT A DEVICE PIXEL RATIO, r2 — §7, the verifier's five findings on the real rung
// (a part of the test-desktop-xpra-window family — lane xpra-window-split, design q-038 ②: the giant split by § so the
// self-hosted desktop batch's floor is its longest part; every § keeps its number; the other parts are named below)
// The family: -open (§1–§4, §5, Stop, §8, §9, §13, §18) · -hidpi (§6, §11) · -hidpi-r2 (§7) · -close (§10) ·
// -scale (§14, §15, §16) · -seamless (§12, §17).
//   • §7 HiDPI r2: DPR 1.5 drawn 1:1, a phone pane below the app's minimum with every digit and the corner reachable, a
//     DPR-1 takeover of a 2× app, xterm at 1.5× after xpra's resource write — ours vs a CONTROL copy carrying the r1 code
//     (the leg list is the § comment below; the measures it shares with §6 live in scripts/xpra-window-boot.mjs).
// The boot (the worktree server on the real xpra rung, headless chrome, §5's fake claude, the private runtime dir) and the
// teardown are scripts/xpra-window-boot.mjs's, ONCE for this part; the measures the §§ share live there too.
// Run: node scripts/test-desktop-xpra-window-hidpi-r2.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { freePorts, scratch, scratchHome } from './scratch.mjs';
import { bootXpraWindow } from './xpra-window-boot.mjs';

const { allDigits7, bootedCopy, CALC6, check, crashed, ctlServers, dropPage, ensureActive, finish, identity7, launchOn, mkPage, openPage, page, PORT,
  R2, readyOn, rebaseline, repo, sizeWinOn, sleep, spawnCopy, srvEnv, target, until, VNC_ENV, worktrees, wt, XDOTOOL, xenvFor, xq, XTERM } = await bootXpraWindow('test-desktop-xpra-window-hidpi-r2');
let p1 = await page(target);
try {
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  check('the loopback page is a SECURE context (the API branch can be proven here)', await p1.evalJs('window.isSecureContext === true'));
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check(`the default ladder picks xpra on this box (${JSON.stringify(av.availability)})`, av.availability?.backend === 'xpra' && av.availability?.stream === 'xpra', av.availability);

  // ── (7) HiDPI r2 — THE VERIFIER'S FIVE FINDINGS, on the real rung, ours vs a CONTROL copy carrying the r1 code (every
  // r2 lever pulled back, each spelled exactly once): (a) a FRACTIONAL ratio (DPR 1.5) draws the app 1:1 — no sub-1 stage
  // transform, no badge, the canvas's pixels ARE the screen's (a full screenshot, only pixels stable across the capture
  // counted); (b) a phone pane smaller than the app's minimum: every digit AND the app's bottom-right corner reachable —
  // the X display contains the window; (c) a DPR-1 client taking over a 2× app: the window stays on the workspace,
  // scaled to fit with the badge, and the digits land; (d) xterm at 1.5×: the keeper waited for xpra's resource write —
  // the cell is the 144-dpi face (10×19), the merged XTerm* resources survive a client connecting; auto from DPR 1.5 = 2 ──
  console.log('§7 HiDPI r2 — a fractional ratio 1:1, the phone\'s lower rows, a DPR-1 takeover, the xterm face at 1.5×; ours vs the r1 control');
  const setScaleOn = (p, value) => p.evalJs(`fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'desktop.appScale': ${JSON.stringify(value)} }) }).then((r) => r.status)`);
  const runR2 = async (origin, w, tag) => {
    const out = { tag };
    const stopOn = (p, id) => p.evalJs(`fetch('/api/desktop/apps/${id}/stop', { method: 'POST' }).then((r) => r.status)`);
    // (a) DPR 1.5 — a calculator in a pane that holds it
    if (CALC6) {
      const A = await mkPage(origin, { width: 1400, height: 1100, deviceScaleFactor: 1.5, mobile: false });
      const l = await launchOn(A.p, { exec: CALC6, args: [], label: `vs-r2a-${tag}` });
      const r = l && l.id && await readyOn(A.p, l.id);
      if (r) {
        out.aRec = { scale: r.scale, dpi: r.dpi };
        await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(r.id)}); true`);
        await ensureActive(A.p, r.id);
        out.a = [];
        for (const [W, H] of [[900, 950], [901, 951]]) {
          await sizeWinOn(A.p, r.id, W, H);
          await until(async () => { const v = await A.p.evalJs(R2(r.id)); return v && v.status === 'Connected' && v.main && v.canvas && v.main.h > 100 ? v : null; }, 30000, 300);
          await sleep(4000); // xpra's lossless refresh after the fit
          out.a.push({ W, H, ...(await identity7(A.p, r.id, 1.5)) });
        }
        await stopOn(A.p, r.id);
      }
      await dropPage(A);
    }
    // (b) the phone — the calculator launched from a DPR-2 page (2×: minimum 720x1232 device px), then a 320x568 @2 phone takes it
    if (CALC6) {
      const L = await mkPage(origin, { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false });
      const l = await launchOn(L.p, { exec: CALC6, args: [], label: `vs-r2b-${tag}` });
      const r = l && l.id && await readyOn(L.p, l.id);
      await dropPage(L);
      if (r) {
        out.bId = r.id;
        const Ph = await mkPage(origin, { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
        const has = await until(() => Ph.p.evalJs(`!!${R2(r.id)}`), 15000, 250); if (!has) await Ph.p.evalJs(`app.openDesktopApp(${JSON.stringify(r.id)}); true`);
        await Ph.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(r.id)}); app.wm.focusWindow(w.id); return true; })()`);
        await ensureActive(Ph.p, r.id);
        await until(async () => { const v = await Ph.p.evalJs(R2(r.id)); return v && v.status === 'Connected' && v.main && v.canvas && v.main.h > 100 ? v : null; }, 30000, 300);
        await sleep(3000);
        const v = await Ph.p.evalJs(R2(r.id));
        const xe = xenvFor(w, r);
        out.bView = { pane: v.pane, scale: v.scale, badge: v.badge, main: v.main, display: v.display };
        out.bXdpy = (xq(xe, 'xdpyinfo', []).match(/dimensions:\s+(\d+)x(\d+)/) || []).slice(1).map(Number);
        out.bDigits = await allDigits7(Ph.p, r.id);
        if (XDOTOOL && v.main) { // the app's bottom-right corner (the '=' column's last row), 40 device px in
          const tx = v.pane.x + v.offset.x + ((v.main.w - 40) / v.ratio) * v.scale, ty = v.pane.y + v.offset.y + ((v.main.h - 40) / v.ratio) * v.scale;
          await Ph.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty }); await sleep(500);
          const m = /x:(\d+) y:(\d+)/.exec(xq(xe, XDOTOOL, ['getmouselocation']) || '');
          out.bCorner = { want: [v.main.w - 40, v.main.h - 40], got: m ? [Number(m[1]), Number(m[2])] : null };
        }
        await dropPage(Ph);
        // (c) the same 2× app taken over by a DPR-1 page (1400x900): the window must stay on the workspace
        const One = await mkPage(origin, { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
        const has1 = await until(() => One.p.evalJs(`!!${R2(r.id)}`), 15000, 250); if (!has1) await One.p.evalJs(`app.openDesktopApp(${JSON.stringify(r.id)}); true`);
        await ensureActive(One.p, r.id);
        await until(async () => { const q = await One.p.evalJs(R2(r.id)); return q && q.status === 'Connected' && q.main && q.canvas && q.main.h > 100 ? q : null; }, 30000, 300);
        await sleep(3000);
        out.c = await One.p.evalJs(R2(r.id));
        out.cDigits = await allDigits7(One.p, r.id);
        await stopOn(One.p, r.id);
        await dropPage(One);
      }
    }
    // (d) xterm at desktop.appScale 1.5: the keeper's own xterm cell and the merged resources after a client connected
    {
      const X = await mkPage(origin, { width: 1400, height: 900, deviceScaleFactor: 1.5, mobile: false });
      await setScaleOn(X.p, '1.5');
      const l = await launchOn(X.p, { exec: XTERM, args: ['-T', `vs-r2d-${tag}`, '-geometry', '80x24', '-e', 'sh', '-c', 'sleep 600'], label: `vs-r2d-${tag}` });
      const r = l && l.id && await readyOn(X.p, l.id);
      await setScaleOn(X.p, null);
      if (r) {
        await X.p.evalJs(`app.openDesktopApp(${JSON.stringify(r.id)}); true`);
        await ensureActive(X.p, r.id);
        const v = await until(async () => { const q = await X.p.evalJs(R2(r.id)); return q && q.status === 'Connected' && q.constraints ? q : null; }, 30000, 300);
        await sleep(1500);
        out.dRec = { scale: r.scale, dpi: r.dpi };
        out.dCell = v && v.constraints && v.constraints.increment;
        out.dRes = xq(xenvFor(w, r), 'xrdb', ['-query']);
        await stopOn(X.p, r.id);
      }
      await dropPage(X);
    }
    return out;
  };
  const r2Report = (o) => console.log(`  ${o.tag}: (a) record ${JSON.stringify(o.aRec)} ${JSON.stringify((o.a || []).map((x) => ({ W: x.W, H: x.H, t: x.transform, scale: x.scale, badge: x.badge, off: `${x.diff}/${x.n}`, box: x.box, backing: x.backing })))}; (b) pane ${o.bView && `${o.bView.pane.w}×${o.bView.pane.h}`} stage ${o.bView && o.bView.scale.toFixed(3)} X display ${o.bXdpy && o.bXdpy.join('×')} main ${o.bView && o.bView.main && `${o.bView.main.w}×${o.bView.main.h}`} digits ${JSON.stringify(o.bDigits)} corner ${JSON.stringify(o.bCorner)}; (c) window ${o.c && `${o.c.win.x.toFixed(0)},${o.c.win.y.toFixed(0)} ${o.c.win.w.toFixed(0)}×${o.c.win.h.toFixed(0)}`} workspace ${o.c && `${o.c.workspace.y.toFixed(0)}+${o.c.workspace.h.toFixed(0)}`} stage ${o.c && o.c.scale.toFixed(3)} badge ${o.c && JSON.stringify(o.c.badge)} digits ${JSON.stringify(o.cDigits)}; (d) record ${JSON.stringify(o.dRec)} cell ${JSON.stringify(o.dCell)}`);
  const O7 = await runR2(`http://127.0.0.1:${PORT}`, wt, 'ours');
  r2Report(O7);
  const aOk = (o) => Array.isArray(o.a) && o.a.length === 2 && o.a.every((x) => x.scale === 1 && !x.badge && !/scale/.test(x.transform) && x.n > 100000 && x.frac < 0.001);
  const bOk = (o) => !!o.bDigits && o.bDigits.got === '7894561230';
  const cornerOk = (o) => !!o.bCorner && !!o.bCorner.got && Math.abs(o.bCorner.got[0] - o.bCorner.want[0]) <= 4 && Math.abs(o.bCorner.got[1] - o.bCorner.want[1]) <= 4;
  const cOk = (o) => !!o.c && o.c.win.y + o.c.win.h <= o.c.workspace.y + o.c.workspace.h + 1 && o.c.win.x + o.c.win.w <= o.c.workspace.x + o.c.workspace.w + 1;
  // lane D (a): at 1.5× the xterm face is 16 (8 × GDK_SCALE 2) at 96 dpi — a cell the race's 100-dpi read cannot tell apart by size
  // (13×27 vs 13×26), so the race's fact is the merged face WIPED from the display's resources; the cell still has to be a face's
  const dOk = (o) => Array.isArray(o.dCell) && o.dCell[0] >= 9 && o.dCell[1] >= 18 && /XTerm\*faceSize/.test(o.dRes || '');
  if (CALC6) {
    check(`(a) DPR 1.5: auto made the calculator 2× (a DPR ≥ 1.5 screen never gets the text-only 1.5×): record ${JSON.stringify(O7.aRec)}`, !!O7.aRec && O7.aRec.scale === 2 && O7.aRec.dpi === 96, O7.aRec);
    check(`(a) DPR 1.5, a pane that holds the app at two sizes: the stage is identity (no sub-1 transform, no badge) and the canvas IS the screen — ${(O7.a || []).map((x) => `${x.diff} of ${x.n} stable px off (${(100 * x.frac).toFixed(3)} %)`).join(', ')}`, aOk(O7), O7.a);
    check(`(b) the phone 320×568 @2: the X display CONTAINS the app (${O7.bXdpy && O7.bXdpy.join('×')} ⊇ ${O7.bView && O7.bView.main && `${O7.bView.main.w}×${O7.bView.main.h}`}) and the picture is scaled to fit (${O7.bView && O7.bView.scale.toFixed(3)})`, !!O7.bXdpy && !!O7.bView && !!O7.bView.main && O7.bXdpy[0] >= O7.bView.main.w && O7.bXdpy[1] >= O7.bView.main.h && O7.bView.scale < 1 && O7.bView.badge.shown, { x: O7.bXdpy, v: O7.bView });
    check(`(b) …every digit key lands, the lower rows included (clicked ${O7.bDigits && O7.bDigits.want}, the calculator copies "${O7.bDigits && O7.bDigits.got}")`, bOk(O7), O7.bDigits);
    check(`(b) …and the pointer reaches the app's bottom-right corner (X reads ${JSON.stringify(O7.bCorner && O7.bCorner.got)}, wanted ${JSON.stringify(O7.bCorner && O7.bCorner.want)}) — the '=' column is operable`, !XDOTOOL || cornerOk(O7), O7.bCorner);
    check(`(c) a DPR-1 page takes over the 2× calculator: the window stays ON the workspace (${O7.c && `top ${O7.c.win.y.toFixed(0)} + ${O7.c.win.h.toFixed(0)} ≤ ${(O7.c.workspace.y + O7.c.workspace.h).toFixed(0)}`}), the picture scaled to fit (${O7.c && O7.c.scale.toFixed(3)}) with the badge "${O7.c && O7.c.badge.text}"`, cOk(O7) && O7.c.scale < 1 && O7.c.badge.shown, O7.c);
    check(`(c) …and its digits land (the calculator copies "${O7.cDigits && O7.cDigits.got}")`, !!O7.cDigits && O7.cDigits.got === '7894561230', O7.cDigits);
  }
  check(`(d) xterm at desktop.appScale 1.5: the keeper waited for xpra's resource write — the cell is ${JSON.stringify(O7.dCell)} (lane D (a): the 1.5× face is 16 = 8 × GDK_SCALE 2 at 96 dpi, shown at 0.75; 7×14 = the bitmap default, the race) and the merged XTerm* face is still in the display's resources after a client connected`, dOk(O7) && /XTerm\*faceSize:\s*16/.test(O7.dRes || '') && /Xft\.dpi:\s*96/.test(O7.dRes || ''), { cell: O7.dCell, res: O7.dRes });
  // CONTROL — the r1 code: a scratch copy of this tree with every r2 lever pulled back (each spelled exactly once)
  {
    const wtr = scratch('deskxpra-r2ctl');
    try { execSync(`git worktree remove --force ${wtr}`, { cwd: repo, stdio: 'ignore' }); } catch {}
    execSync(`git worktree add --detach ${wtr} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtr);
    for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wtr}/${f} && cp -r ${wt}/${f} ${wtr}/${f}`);
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtr, 'node_modules'));
    fs.mkdirSync(path.join(wtr, 'data'), { recursive: true });
    const levers = [
      ['src/lib/xpra-proto.js', '  const round = cover ? (v) => Math.ceil(v - 1e-6) : (v) => Math.floor(v + 1e-6);', '  const round = (v) => Math.round(v); // r1 CONTROL: to the nearest'], // lane D (a) respelled the lever (the cover rounding)
      ['src/lib/xpra-view.js', '    let bw = backingSize(win.w, r), bh = backingSize(win.h, r);', '    let bw = win.w, bh = win.h;'],
      ['src/lib/xpra-view.js', '    const g = gridNudge(ox, oy); ox += g.x; oy += g.y;', '    const g = { x: 0, y: 0 };'],
      ['src/lib/xpra-view.js', '  const FIT_SLACK_CSS = 1;', '  const FIT_SLACK_CSS = 0;'],
      ['src/lib/xpra-view.js', "      else if (mode === 'watch') {\n        for (const w of client.windows.values())", "      else if (true) {\n        for (const w of client.windows.values())"], // int243: lane e2b's pin fit went first (a pinned stage), the watch branch is its else
      ['src/lib/xpra-client.js', '    return { width: Math.max(ft.paneW, g ? g.x + g.w : 0), height: Math.max(ft.paneH, g ? g.y + g.h : 0) };', '    return { width: ft.paneW, height: ft.paneH };'], // int243: lane e2b's fitTarget (the pin's size when pinned, else the pane) respelled the lever
      ['src/lib/window.js', '  _ownMinOf(win) { return minOf(win, this._workspaceBox()); }', '  _ownMinOf(win) { return minOf(win); }'],
      ['src/desktop-serve.js', "      if (own && M.capsOf(rec, backends).crispText) {\n        const xd = await display.waitForXftDpi(", "      if (false) {\n        const xd = await display.waitForXftDpi("],
      ['src/desktop-fit.js', '  if (eff < Math.SQRT2) return eff;', '  return Math.min(2, Math.max(1, Math.round(normalizeDpr(dpr) * 2) / 2)); // r1 CONTROL (round 3 A3 respelled the auto rule: the lever is its first line)'],
    ];
    let once = true;
    for (const [f, from, to] of levers) { const src = fs.readFileSync(path.join(wtr, f), 'utf8'); if (src.split(from).length !== 2) { once = false; console.error(`    lever not spelled once in ${f}: ${from.slice(0, 70)}`); } fs.writeFileSync(path.join(wtr, f), src.replace(from, to)); }
    check('CONTROL (r1): each of the nine r2 levers is spelled exactly once in the tree (the control pulls back exactly those)', once);
    rebaseline(wtr); execSync('npm run build', { cwd: wtr, stdio: 'ignore' });
    const [PORTR] = await freePorts(1);
    const homeR = scratchHome('deskxpra-r2ctl-home', fs);
    const sr = spawnCopy('the r1 copy', wtr, { ...srvEnv, ...VNC_ENV, PORT: String(PORTR), HOME: homeR }); ctlServers.push(sr);
    let upR = await bootedCopy(sr, PORTR);
    check('CONTROL (r1): the r1 copy boots', upR, sr.bootWhy);
    if (upR) {
      const Q = await runR2(`http://127.0.0.1:${PORTR}`, wtr, 'r1-ctl');
      r2Report(Q);
      if (CALC6) {
        check(`CONTROL (r1): at DPR 1.5 the r1 code is NOT 1:1 — ${(Q.a || []).map((x) => `${x.transform || 'no transform'}, badge ${x.badge}, ${(100 * x.frac).toFixed(2)} % off`).join('; ')} (the verifier's 0.9995 transform / 4 %)`, !aOk(Q), Q.a);
        check(`CONTROL (r1): on the phone the r1 display is the pane (${Q.bXdpy && Q.bXdpy.join('×')}) — the lower rows / the corner are out of X's reach (copies "${Q.bDigits && Q.bDigits.got}", corner ${JSON.stringify(Q.bCorner && Q.bCorner.got)})`, !bOk(Q) || (XDOTOOL && !cornerOk(Q)), { d: Q.bDigits, c: Q.bCorner, x: Q.bXdpy });
        check(`CONTROL (r1): the r1 DPR-1 takeover puts the window past the workspace (${Q.c && `top ${Q.c.win.y.toFixed(0)} + ${Q.c.win.h.toFixed(0)} > ${(Q.c.workspace.y + Q.c.workspace.h).toFixed(0)}`})`, !cOk(Q), Q.c && { win: Q.c.win, ws: Q.c.workspace });
      }
      check(`CONTROL (r1): the r1 keeper starts xterm before xpra's resource write — cell ${JSON.stringify(Q.dCell)} (read at Xvfb's 100 dpi), the merged face WIPED from the display's resources (${/XTerm\*faceSize/.test(Q.dRes || '') ? 'still there' : 'gone'})`, !dOk(Q), { cell: Q.dCell, res: Q.dRes });
    }
    try { sr.kill('SIGKILL'); } catch {}
  }
  await p1.cdp('Page.bringToFront').catch(() => {});
} catch (e) {
  crashed(e, p1);
} finally {
  p1.close();
}
finish();
