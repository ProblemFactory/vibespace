#!/usr/bin/env node
// THE XPRA WINDOW, END TO END (docs/design-desktop-apps.zh.md §7 P8-2 chunk
// x2, 2026-09-22; D21 (c) (b) — the window is OURS): headless chrome against
// a worktree server on the DEFAULT ladder (xpra first when installed, DA1)
// with a REAL xpra 6.5.3 + its Xvfb + a real xterm. The chunk's exit
// conditions, MEASURED and printed:
// (a part of the test-desktop-xpra-window family — lane xpra-window-split, design q-038 ②: the giant split by § so the
// self-hosted desktop batch's floor is its longest part; every § keeps its number; the other parts are named below)
// The family: -open (§1–§4, §5, Stop, §8, §9, §13, §18) · -hidpi (§6, §11) · -hidpi-r2 (§7) · -close (§10) ·
// -scale (§14, §15, §16) · -seamless (§12, §17).
// THIS PART — the window opens: §1–§4 (below) + §5 x5 one active viewer (two pages, Resume here, an agent's lease) + Stop,
// then §8 a browser as an app, §9 the gesture copy (it needs §2's one-time HTTPS hint on this origin, so it rides here),
// §13 an app on a paired machine and §18 an app's second top-level:
//   • the app window fills the pane at TWO sizes — the main canvas covers the
//     pane (xterm snaps to its character cell; the leftover is under one cell
//     each way) and a screenshot of the pane counts ZERO black pixels outside
//     the app window (the pane is a theme colour, never a root);
//   • the VibeSpace title bar shows the app window's OWN title, equal to what
//     the X server reports for it (GET …/windows);
//   • a string typed through CDP's trusted key events is read back from the
//     app's own state (xterm runs `cat > file`), and IME text (CDP insertText
//     → the textarea's input event → the published U<hex> keycodes) too;
//   • the clipboard both ways at the X level: a paste event in the browser
//     is what `xclip -o` reads on the app's display; a copy on the display
//     (`xclip -i`) lands in navigator.clipboard on the SECURE page
//     (loopback) and, on a PLAIN-HTTP page by hostname (NOT loopback —
//     isSecureContext is asserted false), as the "Copied in the app — click
//     to copy" chip whose trusted click copies (read back from the secure
//     page: one browser, one clipboard);
//   • on the plain-http page, browser → app with REAL pastes (CDP's native
//     `paste` editing command — the browser's own clipboard, no async API):
//     Ctrl+V on the pane, and the Paste chip's PASTE BOX (the shell's; the
//     page cannot read the clipboard, so the box is the route) then Send —
//     each read back with `xclip -o` on the app's display;
//   • a second top-level of the same app (xterm's Ctrl+Button1 menu, an
//     override-redirect popup) is drawn INSIDE the pane;
//   • under the UI scale (vibespace.uiScale 125 ⇒ body zoom 1.25) at a THIRD
//     size: the canvas sits at NET zoom 1 (on-screen px == canvas px), the
//     session's screen is the pane's on-screen size, zero black pixels
//     outside the app window, and a pointer move lands on the SAME X
//     coordinate (`xdotool getmouselocation` on the display);
//   • Stop ⇒ the window closes itself (round 3 A2), nothing left running.
//   • §8 (B-bfe6) a BROWSER as an app, from the dialog's Browsers section with an
//     Open URL: the real chromium-family / firefox binary (each SKIPPED with its
//     reason when absent or unreachable — a snap is refused by name), the window
//     maps, our own http server sees the browser's GET and the title bar carries
//     the page title xpra reports, the argv / the process / the files name the
//     keeper's OWN 0700 profile (never under $HOME), Stop removes it.
//   • §9 (round 3, A1 — docs/design-desktop-apps-seamless §3.1) THE PLAIN-HTTP
//     GESTURE WINDOW on a hostname page with GNOME Calculator: the user's own
//     Ctrl+C ⇒ the calculator's copy lands in the browser clipboard with NO
//     click (read back from the secure page); a token 5.5 s after the chord,
//     or after a plain key (activation but no copy chord) ⇒ the chip; the
//     one-time HTTPS hint (§2's first chip shows it, §9's does not repeat it).
//   • §13 (lane C2 — docs/design-desktop-apps-seamless §3.5) THE MAIN LEGS AGAIN WITH host=<a paired device>: a
//     scratch daemon from the BUILT bundle under its own HOME is PAIRED to this server as a person pairs one
//     (POST /api/device/dial-pair, the daemon dials /api/device-dial), the machine picker offers it, ITS ladder
//     answers, the launch runs on it (the record the device's, never this machine's store), the window connects
//     through the hub forward, the pane covers the app, the title names the machine, typed keys land in the app's
//     file on the device, the dialog's picker re-reads its catalog, Stop closes the window, no marker left.
//   • §18 (design 016 S1 + S2, lanes app-guest-window + app-satellite-windows — the owner: 「对于这种app又打开一个窗口的情况你似乎
//     没有处理好」, then YES to a window per top-level) scripts/fixtures/two-windows.py (GTK 3, ONE process; a resizable main,
//     a second NORMAL top-level with a minimum taller than the pane, sized from the measured workspace; key logs per window,
//     a right-click menu in the second, re-open / third / drop-main triggers): the second opens its OWN window (a satellite
//     of the same session — one viewer socket) titled "{main} · {second}" with its own taskbar entry, drawn there and not in
//     the main pane, in its own slot of the root (X agrees), the pane holding it 1:1; typing reaches ITS window (and the
//     main's, the main); its menu is drawn in it; a reload REPLAYS the same satellite and re-binds it by wid; an agent's lease
//     (Watch) is ONE scaled picture in the main window, a window opened meanwhile opens no satellite until the agent
//     detaches; a 390 px phone shows one window at a time; the satellite's ✕ closes only its window ("… closed" toast);
//     S1 where a window has no satellite (its satellite closed while it lives): back in the main pane, "{main} · {second}",
//     grown to its minimum, the main ✕ = ask-front; the app dropping its main ⇒ the main window ADOPTS the second. The
//     pre-fix CONTROLS are test-xpra-client §9 / §10's patched copies. SKIPPED without python3 + GTK 3 (gi).
// The boot (the worktree server on the real xpra rung, headless chrome, §5's fake claude, the private runtime dir) and the
// teardown are scripts/xpra-window-boot.mjs's, ONCE for this part; the measures the §§ share live there too.
// Run: node scripts/test-desktop-xpra-window-open.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome } from './scratch.mjs';
import { bootXpraWindow } from './xpra-window-boot.mjs';

const require = createRequire(import.meta.url);
const { agentTokens, bin, bootedCopy, CDP_PORT, check, crashed, ctlServers, D, devHomes, devProcs, dropPage, ensureActive, FAKE_CLAUDE, fakeHome,
  finish, HOSTNAME, hostResolves, keyOf, launchOn, measurePane, mkPage, newPage, openPage, page, PORT, R2, readyOn, repo, RUNTIME, SEAT,
  SETTLE_DEADLINE_MS, sizeWinOn, skip, sleep, spawnCopy, srvEnv, srvLog, target, threw, TITLE_DEADLINE_MS, trustedClickAt, typedFile, until, VNC_ENV,
  WebSocket, WIN, worktrees, wt, XAGREE_DEADLINE_MS, XCLIP, xclipKids, XDOTOOL, xenvFor, XTERM } = await bootXpraWindow('test-desktop-xpra-window-open');
let p1 = await page(target);
let appId = null, rec = null;
try {
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  check('the loopback page is a SECURE context (the API branch can be proven here)', await p1.evalJs('window.isSecureContext === true'));
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check(`the default ladder picks xpra on this box (${JSON.stringify(av.availability)})`, av.availability?.backend === 'xpra' && av.availability?.stream === 'xpra', av.availability);

  // ── launch: xterm titled by us, running `cat > file` so typed text is read back from the app's own state ──
  const launch = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: XTERM, args: ['-T', 'vs-xpra-title', '-geometry', '80x24', '-e', 'sh', '-c', `cat > ${typedFile}`], label: 'xterm' }))} }).then((r) => r.json())`);
  appId = launch && launch.id;
  check('POST /api/desktop/apps launches on the xpra rung', !!appId && launch.backend === 'xpra' && launch.stream === 'xpra', launch);
  rec = await until(() => p1.evalJs(`fetch('/api/desktop/apps/${appId}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 30000);
  check(`the record reaches ready (${rec && rec.display}, port ${rec && rec.port})`, !!rec && rec.state === 'ready', rec && rec.lastError);
  const xenv = { ...process.env, DISPLAY: rec.display, XAUTHORITY: path.join(wt, 'data', 'desktop-apps', appId, 'Xauthority') };

  // ── the window, drawn by us ──
  await p1.evalJs(`app.openDesktopApp(${JSON.stringify(appId)}); true`);
  const t0 = Date.now();
  const connected = await until(async () => { const s = await p1.evalJs(WIN(appId)); return s && s.status === 'Connected' && s.windows.length ? s : null; }, 30000, 250);
  console.log(`  first window drawn ${Date.now() - t0} ms after open`);
  check('the window connects through OUR client (status Connected, a window in the session)', !!connected, connected || p1.logs.slice(-10));
  check('the picture is the xpra view (a pane, not an RFB canvas, not an iframe)', !!connected && connected.kind === 'xpra' && await p1.evalJs(`!document.querySelector('.window iframe')`));
  // let the first full paint land
  await until(async () => { const m = await measurePane(p1, appId); return m && m.inBrightFrac > 0.5 ? m : null; }, 15000, 500);

  // ── (1) the app window IS the picture: two sizes, pixels measured ──
  const sizes = [[640, 480], [900, 620]]; // small first; the popup leg below runs at the larger size, where xterm's 446 px menu fits the pane
  for (const [W, H] of sizes) {
    await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; if (w.onResize) w.onResize(); return true; })()`);
    // the session re-fits (display-configure + configure-window), xterm accepts a cell-snapped size, the server confirms
    const settled = await until(async () => { const s = await p1.evalJs(WIN(appId)); const m = s && s.windows.find((w) => w.kind === 'main'); return m && s.pane.w - m.w < 16 && s.pane.h - m.h < 24 && m.x === 0 && m.y === 0 ? s : null; }, 15000, 300);
    await sleep(1500); // the repaint after the resize
    const m = await measurePane(p1, appId);
    console.log(`  ${W}×${H}: pane ${m.pane.w}×${m.pane.h}, main window ${m.main && `${m.main.w}×${m.main.h} at ${m.main.x},${m.main.y}`}, coverage ${(m.coverage * 100).toFixed(1)} %, ${m.blackOut} black px of ${m.out} outside the window, ${(m.inBrightFrac * 100).toFixed(1)} % of the window non-black`);
    check(`${W}×${H}: the app window sits at 0,0 and covers the pane up to one xterm cell (${m.main && m.main.w}×${m.main && m.main.h} of ${m.pane.w}×${m.pane.h})`, !!settled && !!m.main && m.main.x === 0 && m.main.y === 0 && m.pane.w - m.main.w < 16 && m.pane.h - m.main.h < 24, m.main);
    check(`${W}×${H}: ZERO black pixels outside the app window (${m.blackOut} of ${m.out})`, m.blackOut === 0 && m.out >= 0);
    check(`${W}×${H}: the app window itself is painted (${(m.inBrightFrac * 100).toFixed(0)} % non-black — xterm's white page)`, m.inBrightFrac > 0.5);
    // the X server's own geometry for the window (xterm rounds a request to its cell grid; xpra reports the result)
    const xw = await until(async () => { const r = await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`); const x = r.windows && r.windows[0]; return x && m.pane.w - x.w < 16 && m.pane.h - x.h < 24 ? x : null; }, 8000, 500);
    const constraints = await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const c = w._desktopAppView.client; const m = c.windows.get(c.mainWid); return m ? m.meta['size-constraints'] || null : null; })()`);
    console.log(`  ${W}×${H}: X says ${xw ? `${xw.w}×${xw.h}` : 'no window within a cell of the pane'}; the client's size hints ${JSON.stringify(constraints)}`);
    check(`${W}×${H}: the X server agrees the window follows the pane (${xw ? `${xw.w}×${xw.h}` : '?'} vs pane ${m.pane.w}×${m.pane.h}, within one cell) and our canvas matches X within 8 px`, !!xw && Math.abs(xw.w - m.main.w) <= 8 && Math.abs(xw.h - m.main.h) <= 8, { x: xw, local: m.main });
  }

  // ── the title: the app window's own, and equal to what X reports ──
  const xw = await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`);
  const st = await p1.evalJs(WIN(appId));
  check(`the VibeSpace title bar shows the app window's own title ("${st.title}") and it equals the X window's ("${xw.windows && xw.windows[0] && xw.windows[0].title}")`, st.title === 'vs-xpra-title' && xw.windows && xw.windows[0] && xw.windows[0].title === st.title, { title: st.title, x: xw.windows });

  // ── typed text, read back from the app's own state ──
  const s1 = await p1.evalJs(WIN(appId));
  await trustedClickAt(p1, s1.pane.x + s1.pane.w / 2, s1.pane.y + s1.pane.h / 2);
  await sleep(300);
  for (const ch of 'hi xpra 42') { const k = keyOf(ch); await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); }
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const typed = await until(() => { try { const s = fs.readFileSync(typedFile, 'utf8'); return s.includes('hi xpra 42\n') ? s : null; } catch { return null; } }, 15000, 200);
  check('a string typed through trusted key events is echoed by the app: xterm\'s `cat` wrote it to the file', !!typed, typed === null ? (fs.existsSync(typedFile) ? JSON.stringify(fs.readFileSync(typedFile, 'utf8')) : 'no file') : undefined);
  // IME text: CDP insertText fires the textarea's input event (inputType insertText) — the published U<hex> keycodes carry it
  await p1.cdp('Input.insertText', { text: 'é中文' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const ime = await until(() => { try { const s = fs.readFileSync(typedFile, 'utf8'); return s.includes('é中文\n') ? s : null; } catch { return null; } }, 15000, 200);
  check('IME / inserted text reaches the app: é and 中文 through PUBLISHED keycodes on the native keymap (the server reprograms the X keymap before the presses)', !!ime, ime === null ? { file: JSON.stringify(fs.readFileSync(typedFile, 'utf8')), xpraLog: (() => { try { return fs.readFileSync(path.join(wt, 'data', 'desktop-apps', appId, 'app.log'), 'utf8').split('\n').filter((l) => /key|keysym|keymap|xkb|modmap|Warning|Error/i.test(l)).slice(-25); } catch (e) { return String(e.message); } })() } : undefined);
  // a physical key the US layout lacks: AltGr+e = é on many layouts — the same publish-then-press path from keyDown
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'é', code: 'KeyE', windowsVirtualKeyCode: 69, text: 'é', unmodifiedText: 'e' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'é', code: 'KeyE', windowsVirtualKeyCode: 69 });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const altgr = await until(() => { try { const s = fs.readFileSync(typedFile, 'utf8'); return /é中文\né\n/.test(s) ? s : null; } catch { return null; } }, 10000, 200);
  check('a key the US keymap lacks (é as a key event) reaches the app the same way', !!altgr, altgr === null ? JSON.stringify(fs.readFileSync(typedFile, 'utf8')) : undefined);

  // ── the clipboard, both ways, at the X level ──
  if (!XCLIP) skip('clipboard at the X level', 'xclip not on PATH');
  else {
    // browser → app: a paste EVENT (what Ctrl+V fires; no async API needed) — the X selection then reads it
    await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const v = w._desktopAppView; const dt = new DataTransfer(); dt.setData('text/plain', 'from-the-browser'); v.ime.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
    const xsel = await until(() => { try { const s = execFileSync(XCLIP, ['-o', '-selection', 'clipboard'], { env: xenv, encoding: 'utf8', timeout: 4000 }); return s === 'from-the-browser' ? s : null; } catch { return null; } }, 10000, 400);
    check('browser → app: the paste event\'s text is what `xclip -o` reads on the app\'s display', xsel === 'from-the-browser', xsel);
    // app → browser on the SECURE page: a copy on the display lands in navigator.clipboard
    const holder = spawn('sh', ['-c', `printf 'from-the-app' | ${XCLIP} -i -selection clipboard`], { env: xenv, stdio: 'ignore', detached: true }); xclipKids.push(holder);
    const gotSecure = await until(() => p1.evalJs(`navigator.clipboard.readText().then((t) => (t === 'from-the-app' ? t : null)).catch(() => null)`), 10000, 400);
    check('app → browser (secure context): a copy inside the app (xclip -i on its display) lands in navigator.clipboard', gotSecure === 'from-the-app', { got: gotSecure, chip: (await p1.evalJs(WIN(appId))).chip, logs: p1.logs.slice(-5) });
    // app → browser on the PLAIN-HTTP page: the chip, then a trusted click copies — read back from the secure page
    if (!hostResolves) skip('the plain-http branch', `${HOSTNAME} does not resolve`);
    else {
      const t2 = await (async () => { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }); return r.json(); })();
      const p2 = await page(t2);
      await openPage(p2, `http://${HOSTNAME}:${PORT}`);
      const insecure = await p2.evalJs('window.isSecureContext === false');
      if (!insecure) skip('the plain-http branch', `http://${HOSTNAME}:${PORT} is a secure context in this chrome`);
      else {
        check(`the hostname page (http://<hostname>:${PORT}) is NOT a secure context — the chip branch can be proven here`, insecure);
        // layout sync replays the window on the second client by itself (the openSpec); opening a second one would make a duplicate
        const replayed = await until(() => p2.evalJs(`!!${WIN(appId)}`), 15000, 250);
        if (!replayed) await p2.evalJs(`app.openDesktopApp(${JSON.stringify(appId)}); true`);
        // x5: the first page is the ACTIVE viewer — the second one opens BLOCKED and takes over with Resume here
        const blocked2 = await until(async () => { const s = await p2.evalJs(SEAT(appId)); return s && s.mode === 'blocked' && s.overlay && s.overlay.shown && s.overlay.btn && s.overlay.btn.w > 0 ? s : null; }, 15000, 250);
        check('x5: the second viewer opens BLOCKED behind the "Active on another client" overlay', !!blocked2, await p2.evalJs(SEAT(appId)));
        if (blocked2) { await p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); app.wm.focusWindow(w.id); return true; })()`); const b2 = await p2.evalJs(SEAT(appId)); await trustedClickAt(p2, b2.overlay.btn.x + b2.overlay.btn.w / 2, b2.overlay.btn.y + b2.overlay.btn.h / 2); }
        const c2 = await until(async () => { const s = await p2.evalJs(WIN(appId)); return s && s.status === 'Connected' && s.windows.length ? s : null; }, 30000, 250);
        check(`the same app shows on the plain-http page after Resume here (${replayed ? 'replayed by layout sync' : 'opened'}; xpra --sharing=yes)`, !!c2, c2 || p2.logs.slice(-6));
        // MEASURED xpra rule (server/subsystem/clipboard.py): the clipboard belongs to ONE client — the first, then
        // whoever becomes the "ui driver" (the last to send input); a viewer that never touched the app gets no
        // copies. The click below is what a human does before copying anyway.
        await trustedClickAt(p2, c2.pane.x + c2.pane.w / 2, c2.pane.y + c2.pane.h / 2);
        await sleep(400);
        for (const k of xclipKids.splice(0)) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} }
        const holder2 = spawn('sh', ['-c', `printf 'from-the-app-2' | ${XCLIP} -i -selection clipboard`], { env: xenv, stdio: 'ignore', detached: true }); xclipKids.push(holder2);
        const chipSt = await until(async () => { const s = await p2.evalJs(WIN(appId)); return s && s.chip && s.chip.shown && s.chip.text === 'from-the-app-2' ? s : null; }, 10000, 300);
        check('on plain http the copy becomes the "Copied in the app — click to copy" chip holding the text (never a silent no-op)', !!chipSt, chipSt || (await p2.evalJs(WIN(appId))).chip);
        // round 3, A1: the FIRST chip on this plain-http device carries the one-time "Enable HTTPS for seamless copy" hint + the docs link
        const hint2 = await p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const h = w._desktopAppView.copyHint; const a = h && h.querySelector('a'); const r = h && h.getBoundingClientRect(); return h ? { shown: getComputedStyle(h).display !== 'none' && r.width > 0, text: h.textContent, href: a && a.href, stored: localStorage.getItem('vibespace.desktopCopyHintShown') } : null; })()`);
        check('A1: the first chip on this plain-http device shows the one-time hint "Enable HTTPS for seamless copy" with the docs link, and the device remembers it (localStorage)', !!hint2 && hint2.shown && /Enable HTTPS for seamless copy/.test(hint2.text) && /docs\/getting-started\.md#https-for-seamless-copy$/.test(hint2.href || '') && !!hint2.stored, hint2);
        if (chipSt) {
          await trustedClickAt(p2, chipSt.chip.rect.x + chipSt.chip.rect.w / 2, chipSt.chip.rect.y + chipSt.chip.rect.h / 2);
          const gone = await until(async () => { const s = await p2.evalJs(WIN(appId)); return s && s.chip && !s.chip.shown ? true : null; }, 5000, 200);
          check('a trusted click on the chip copies through the user gesture and the chip goes away', !!gone);
          // the secure page must be the FOCUSED page again for readText (Chrome's rule); p2 was the active target
          await p1.cdp('Page.bringToFront');
          const readBack = await until(() => p1.evalJs(`navigator.clipboard.readText().then((t) => (t === 'from-the-app-2' ? t : null)).catch((e) => null)`), 8000, 300);
          check('…and the SECURE page reads that text from the browser clipboard (one browser, one clipboard)', readBack === 'from-the-app-2', { readBack, err: await p1.evalJs(`navigator.clipboard.readText().then((t) => 'ok:' + t).catch((e) => 'err:' + e.message)`) });
        }
        // ── browser → app on PLAIN HTTP with REAL pastes: the browser's own clipboard is filled from the secure page (one
        // browser, one clipboard), then CDP's native `paste` editing command pastes it on the hostname page — no async API ──
        const setBrowserClipboard = async (text) => { await p1.cdp('Page.bringToFront'); const r = await p1.evalJs(`navigator.clipboard.writeText(${JSON.stringify(text)}).then(() => 'ok').catch((e) => 'err:' + e.message)`); await p2.cdp('Page.bringToFront'); return r; };
        const nativePaste = async () => { await p2.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2, commands: ['paste'] }); await p2.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2 }); };
        const xselIs = (want) => until(() => { try { const s = execFileSync(XCLIP, ['-o', '-selection', 'clipboard'], { env: xenv, encoding: 'utf8', timeout: 4000 }); return s === want ? s : null; } catch { return null; } }, 10000, 400);
        const wrote1 = await setBrowserClipboard('from-a-real-paste');
        const c3 = await p2.evalJs(WIN(appId));
        await trustedClickAt(p2, c3.pane.x + c3.pane.w / 2, c3.pane.y + c3.pane.h / 2); // focus the pane (its IME textarea)
        await sleep(300);
        await nativePaste();
        const xsel2 = await xselIs('from-a-real-paste');
        check(`plain http, Ctrl+V on the pane: the browser's real paste event carries the text into the app (xclip -o reads "${xsel2}"; clipboard filled: ${wrote1})`, xsel2 === 'from-a-real-paste', { wrote1, xsel: xsel2, logs: p2.logs.slice(-5) });
        const wrote2 = await setBrowserClipboard('from-the-paste-box');
        const pasteRect = await p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const b = w._desktopAppView.bar.querySelector('.desktop-paste'); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
        await trustedClickAt(p2, pasteRect.x + pasteRect.w / 2, pasteRect.y + pasteRect.h / 2);
        const box = await until(() => p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const v = w._desktopAppView; const b = v.container.querySelector('.vnc-paste-box'); if (!v.pasteOpen || !b) return null; const s = b.querySelector('.vnc-paste-send').getBoundingClientRect(); return { note: b.querySelector('.vnc-paste-note').textContent, focused: document.activeElement === b.querySelector('textarea'), send: { x: s.x, y: s.y, w: s.width, h: s.height } }; })()`), 6000, 200);
        check('plain http, the Paste chip: the page cannot read the clipboard, so the shell\'s PASTE BOX opens naming HTTPS, its textarea focused (never "press Ctrl+V" into nothing)', !!box && /not served over HTTPS/.test(box.note) && box.focused, box);
        if (box) {
          await nativePaste();
          const inBox = await until(() => p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const b = w._desktopAppView.container.querySelector('.vnc-paste-box textarea'); return b && b.value === 'from-the-paste-box' ? b.value : null; })()`), 5000, 200);
          check(`…a real paste lands in the box (the textarea's native paste — plain http, no API; clipboard filled: ${wrote2})`, inBox === 'from-the-paste-box', inBox);
          await trustedClickAt(p2, box.send.x + box.send.w / 2, box.send.y + box.send.h / 2);
          const xsel3 = await xselIs('from-the-paste-box');
          const after = await p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const v = w._desktopAppView; return { open: v.pasteOpen, imeFocused: document.activeElement === v.ime }; })()`);
          check(`…Send puts it into the app (xclip -o reads "${xsel3}"), closes the box and hands the focus back to the app`, xsel3 === 'from-the-paste-box' && !after.open && after.imeFocused, { xsel: xsel3, after });
        }
      }
      // close p2's TARGET (never its window: layout sync would close the window on every client); its viewer leaving hands the ui driver back to p1
      p2.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`);
      await sleep(800);
      await p1.cdp('Page.bringToFront');
    }
  }

  // ── a second top-level of the same app: xterm's Ctrl+Button1 menu (an override-redirect popup) inside the pane ──
  const ensureWin = async () => { let s = await p1.evalJs(WIN(appId)); if (s && s.status === 'Connected' && s.windows.length) return s; await p1.evalJs(`app.openDesktopApp(${JSON.stringify(appId)}); true`); s = await until(async () => { const x = await p1.evalJs(WIN(appId)); return x && x.status === 'Connected' && x.windows.length ? x : null; }, 30000, 250); return s; };
  const s2 = await ensureWin();
  check('the first page still shows the window (or re-opens it) after the second viewer left', !!s2, s2);
  const cx = s2.pane.x + s2.pane.w / 2, cy = s2.pane.y + s2.pane.h / 2;
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, modifiers: 2 });
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1, modifiers: 2 });
  const popup = await until(async () => { const s = await p1.evalJs(WIN(appId)); const p = s && s.windows.find((w) => w.kind === 'popup'); return p ? { p, pane: s.pane, els: s.els } : null; }, 8000, 200);
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1, modifiers: 2 });
  check('Ctrl+Button1 in xterm opens its menu: a SECOND top-level (override-redirect popup) of the same app is drawn', !!popup, popup || (await p1.evalJs(WIN(appId))).windows);
  if (popup) {
    // MEASURED: X places a popup itself (override-redirect — no WM, no client may move it) and Xt positions it against
    // the screen size it cached at connect (the recipe's large initial Xvfb), so xterm's 446 px menu opened at the pointer
    // hangs below a 553 px root; the X server clips it there and XTest cannot move a pointer beyond the root, so a
    // display-shift would show items no click could reach. The window is drawn where X put it, at the pointer, its
    // origin inside the pane, clipped by the pane exactly as X clips it at the root — never hidden, never moved.
    const originInside = popup.p.x >= 0 && popup.p.y >= 0 && popup.p.x < popup.pane.w && popup.p.y < popup.pane.h;
    const overflow = Math.max(0, popup.p.x + popup.p.w - popup.pane.w) + Math.max(0, popup.p.y + popup.p.h - popup.pane.h);
    console.log(`  popup ${popup.p.w}×${popup.p.h} at ${popup.p.x},${popup.p.y} in a ${popup.pane.w}×${popup.pane.h} pane (${overflow} px beyond the root — X's own clipping)`);
    check(`…drawn at the pointer with its origin INSIDE the pane (${popup.p.w}×${popup.p.h} at ${popup.p.x},${popup.p.y} in ${popup.pane.w}×${popup.pane.h}; ${overflow} px hang below the root as in X itself), not lost`, originInside, popup.p);
    const popupEl = popup.els.find((e) => String(e.wid) === String(popup.p.wid));
    check('…as its own canvas element on top of the app window', !!popupEl && popupEl.w === popup.p.w);
  }
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await trustedClickAt(p1, cx, cy);
  await until(async () => { const s = await p1.evalJs(WIN(appId)); return s && !s.windows.some((w) => w.kind === 'popup') ? true : null; }, 6000, 200);

  // ── (3) under the UI scale, at a THIRD size: net zoom 1, the pane's own px, pixels + the X pointer ──
  await p1.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`);
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  check(`the page boots under the UI scale (body zoom ${await p1.evalJs('document.body.style.zoom')})`, await p1.evalJs(`document.body.style.zoom === '1.25'`));
  const s3 = await ensureWin();
  check('the window is back (layout replay or re-open) under the UI scale', !!s3, s3);
  const [W3, H3] = [560, 460]; // layout px — 700×575 on screen at 1.25: a THIRD pane size, unlike the two above
  await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); w.element.style.left = '40px'; w.element.style.top = '20px'; w.element.style.width = '${W3}px'; w.element.style.height = '${H3}px'; if (w.onResize) w.onResize(); return true; })()`);
  const settled3 = await until(async () => { const s = await p1.evalJs(WIN(appId)); const m = s && s.windows.find((w) => w.kind === 'main'); return m && s.pane.w - m.w < 16 && s.pane.h - m.h < 24 && m.x === 0 && m.y === 0 ? s : null; }, 15000, 300);
  await sleep(1500);
  const zoom = await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const v = w._desktopAppView; const c = v.client; const el = v.pane.querySelector('.xpra-win-main canvas') || v.pane.querySelector('.xpra-win canvas'); const r = el.getBoundingClientRect(); const pr = v.pane.getBoundingClientRect(); return { canvas: { w: el.width, h: el.height }, onScreen: { w: r.width, h: r.height }, pane: { w: pr.width, h: pr.height, cw: v.pane.clientWidth, ch: v.pane.clientHeight }, screen: c.pane || null, uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() }; })()`);
  const m3 = await measurePane(p1, appId);
  console.log(`  UI scale ${zoom.uiScale}, window ${W3}×${H3} layout px: pane ${m3.pane.w}×${m3.pane.h} on screen (clientWidth ${zoom.pane.cw}×${zoom.pane.ch}), session screen ${JSON.stringify(zoom.screen)}, main canvas ${zoom.canvas.w}×${zoom.canvas.h} drawn ${zoom.onScreen.w.toFixed(1)}×${zoom.onScreen.h.toFixed(1)} on screen, ${m3.blackOut} black px of ${m3.out} outside the window, ${(m3.inBrightFrac * 100).toFixed(1)} % of the window non-black`);
  check(`UI scale: the pane is ${W3}×… layout px ⇒ ~1.25× on screen, and its own px ARE screen px (clientWidth ${zoom.pane.cw} == rect ${zoom.pane.w.toFixed(1)}) — the shell's counter-zoom`, zoom.uiScale === '1.25' && m3.pane.w > W3 * 1.1 && Math.abs(zoom.pane.cw - zoom.pane.w) <= 1 && Math.abs(zoom.pane.ch - zoom.pane.h) <= 1, zoom);
  check(`UI scale: the canvas sits at NET zoom 1 — ${zoom.canvas.w}×${zoom.canvas.h} canvas px drawn on ${zoom.onScreen.w.toFixed(1)}×${zoom.onScreen.h.toFixed(1)} screen px`, Math.abs(zoom.canvas.w - zoom.onScreen.w) <= 1 && Math.abs(zoom.canvas.h - zoom.onScreen.h) <= 1, zoom);
  check(`UI scale: the app window fills the pane at this third size (${m3.main && `${m3.main.w}×${m3.main.h}`} of ${m3.pane.w}×${m3.pane.h}) with ZERO black pixels outside it (${m3.blackOut} of ${m3.out})`, !!settled3 && !!m3.main && m3.main.x === 0 && m3.main.y === 0 && m3.pane.w - m3.main.w < 16 && m3.pane.h - m3.main.h < 24 && m3.blackOut === 0 && m3.inBrightFrac > 0.5, m3.main);
  const xw3 = await until(async () => { const r = await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`); const x = r.windows && r.windows[0]; return x && m3.pane.w - x.w < 16 && m3.pane.h - x.h < 24 ? x : null; }, 8000, 500);
  check(`UI scale: the X server's window follows the on-screen pane (X ${xw3 ? `${xw3.w}×${xw3.h}` : '?'} vs pane ${m3.pane.w}×${m3.pane.h})`, !!xw3, xw3);
  if (!XDOTOOL) skip('the X pointer under the UI scale', 'xdotool not on PATH');
  else {
    const st3 = await p1.evalJs(WIN(appId));
    const targets = [[137, 91], [Math.round(st3.pane.w * 0.8), Math.round(st3.pane.h * 0.7)]];
    for (const [px, py] of targets) {
      await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: st3.pane.x + px, y: st3.pane.y + py });
      const loc = await until(() => { try { const o = execFileSync(XDOTOOL, ['getmouselocation'], { env: xenv, encoding: 'utf8', timeout: 4000 }); const m = /x:(\d+) y:(\d+)/.exec(o); if (!m) return null; const x = Number(m[1]), y = Number(m[2]); return Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1 ? { x, y } : null; } catch { return null; } }, 5000, 150);
      let last = null; try { last = execFileSync(XDOTOOL, ['getmouselocation'], { env: xenv, encoding: 'utf8', timeout: 4000 }).trim(); } catch {}
      console.log(`  pointer at pane (${px}, ${py}) screen px ⇒ X says ${last}`);
      check(`UI scale: a pointer at pane (${px}, ${py}) lands on X (${px}, ${py}) — never scaled by the zoom`, !!loc, last);
    }
  }

  // ── (4) THE BELT (2026-09-22, the verifier's 04-selfresize / 02-chrome / 05-calc): the APP resizing or moving its own
  // window is undone by the client (a bounded configure-window from the server's own geometry packets), and a second
  // top-level the app puts far off the screen is placed INSIDE the pane — the app stays the picture ──
  const mainNow = async () => { const s = await p1.evalJs(WIN(appId)); return s ? { s, m: s.windows.find((w) => w.kind === 'main') } : null; };
  const fitsPane = (x) => x && x.m && x.m.x === 0 && x.m.y === 0 && x.s.pane.w - x.m.w < 16 && x.s.pane.h - x.m.h < 24;
  if (!XDOTOOL) skip('the app resizing / moving itself', 'xdotool not on PATH');
  else {
    const xid = ((await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`)).windows || [])[0];
    const xOf = async (id) => { const ws = (await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`)).windows || []; return ws.find((w) => w.id === id) || null; };
    const xFits = async (pane) => { const w = await xOf(xid.id); return w && w.x === 0 && w.y === 0 && pane.w - w.w < 16 && pane.h - w.h < 24 ? w : null; };
    execFileSync(XDOTOOL, ['windowsize', String(xid.id), '300', '200'], { env: xenv, timeout: 5000 });
    const t4 = Date.now();
    const back = await until(async () => { const x = await mainNow(); return fitsPane(x) && (await xFits(x.s.pane)) ? x : null; }, 8000, 200);
    const xNow = await xOf(xid.id);
    console.log(`  the app resized itself to 300×200 ⇒ ${back ? `re-fitted in ${Date.now() - t4} ms: ${back.m.w}×${back.m.h} of ${back.s.pane.w}×${back.s.pane.h}` : 'NOT re-fitted'}; X says ${xNow && `${xNow.w}×${xNow.h}+${xNow.x}+${xNow.y}`}`);
    check('the app resizing ITSELF (xdotool windowsize 300×200 — it used to stay at 8 % of the pane) is fitted back to the pane, and X agrees', !!back, { client: (await mainNow())?.m, x: xNow });
    await sleep(700); // past the belt's 500 ms gap: a fresh correction
    execFileSync(XDOTOOL, ['windowmove', String(xid.id), '400', '300'], { env: xenv, timeout: 5000 });
    const atOrigin = await until(async () => { const x = await mainNow(); return fitsPane(x) && (await xFits(x.s.pane)) ? x : null; }, 8000, 200);
    const xm = await xOf(xid.id);
    check(`the app MOVING itself (xdotool windowmove 400,300 — the client used to follow it off the pane) is put back at 0,0 (X: ${xm && `${xm.x},${xm.y}`})`, !!atOrigin && xm && xm.x === 0 && xm.y === 0, { atOrigin: atOrigin && atOrigin.m, x: xm });
    // a second top-level of the app's own display far off the screen — design 016 S2 (lane app-satellite-windows): it opens its
    // OWN VibeSpace window (a satellite of the same session) and lies in its slot of the root beside the main (S1 placed it inside)
    const second = spawn(XTERM, ['-T', 'vs-second-top', '-geometry', '40x10+2000+1500'], { env: xenv, stdio: 'ignore', detached: true }); xclipKids.push(second);
    const SATS = `[...app.wm.windows.values()].filter((w) => w._desktopAppId === ${JSON.stringify(appId)} && w._desktopSatelliteWid).map((w) => ({ title: w.title, wid: w._desktopSatelliteWid, bound: !!(w._desktopSatellite && w._desktopSatellite.bound), slot: [...app.wm.windows.values()].find((m) => m._desktopAppId === ${JSON.stringify(appId)} && !m._desktopSatelliteWid)._desktopAppView.client.slotOf(w._desktopSatelliteWid) }))`;
    const own = await until(async () => { const s = await p1.evalJs(WIN(appId)); const w = s && s.windows.find((x) => x.title === 'vs-second-top'); const sats = await p1.evalJs(SATS); const main = s && s.windows.find((x) => x.title === 'vs-xpra-title'); return w && main && sats.length === 1 && sats[0].bound && sats[0].wid === w.wid && sats[0].slot && w.x === sats[0].slot.x && w.y === sats[0].slot.y ? { w, main, sat: sats[0] } : null; }, 12000, 250);
    // X reports the corral's place only after the window's first paint (a read before it says 0,0 / an in-flight spot —
    // a race, never the bug; lane quiet-box-flakes B-c820). The pre-fix read X right after `own` — the client's
    // OPTIMISTIC slot position, FROZEN — on a flat 6 s budget, so a quiet box reached the read before xpra moved the
    // corral and §S2 went red while a loaded box (slower than xpra) passed. Wait for the EFFECT: poll X until the corral
    // lands where the client NOW has the window (re-read live each pass — a relayout moves it, never a frozen target),
    // bounded by the configure round-trip XAGREE_DEADLINE_MS (the §18 legs wait the same over the GTK fixture).
    const xSecond = own && await until(async () => { const s = await p1.evalJs(WIN(appId)); const cw = s && s.windows.find((x) => x.title === 'vs-second-top'); const xw = ((await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`)).windows || []).find((x) => x.title === 'vs-second-top'); return cw && xw && Math.abs(xw.x - cw.x) <= 2 && Math.abs(xw.y - cw.y) <= 2 ? xw : null; }, XAGREE_DEADLINE_MS, 250);
    console.log(`  a second top-level at +2000+1500 ⇒ ${own ? `its own window "${own.sat.title}", ${own.w.w}×${own.w.h} at ${own.w.x},${own.w.y} (slot ${JSON.stringify(own.sat.slot)}, the main ${own.main.w}×${own.main.h})` : 'NO satellite'}; X says ${xSecond ? `+${xSecond.x}+${xSecond.y}` : 'elsewhere'}`);
    check('a second top-level the app opened at +2000+1500 (kind main, not transient) opens its OWN window (design 016 S2: titled "vs-xpra-title · vs-second-top") and lies in its slot of the root beside the main, and X agrees', !!own && own.sat.title === 'vs-xpra-title · vs-second-top' && own.w.x >= own.main.w && !!xSecond, { own, x: xSecond });
    const m4 = await mainNow();
    check('…the first window stays the main and the picture, titled "vs-xpra-title" — the second is in front in its own window, not named here (S1c is for a window with no satellite: §18)', fitsPane(m4) && m4.s.title === 'vs-xpra-title', m4 && { m: m4.m, title: m4.s.title });
    try { process.kill(-second.pid, 'SIGKILL'); } catch {}
    const back4 = await until(async () => { const s = await p1.evalJs(WIN(appId)); return s && s.title === 'vs-xpra-title' && !(await p1.evalJs(SATS)).length ? s : null; }, 8000, 200);
    check('…and with the second top-level gone its own window closes and the title is the main\'s alone', !!back4);
    await until(async () => { const s = await p1.evalJs(WIN(appId)); return s && !s.windows.some((x) => x.title === 'vs-second-top') ? true : null; }, 6000, 200);
  }
  // GNOME Calculator resizes its OWN window on a mode switch (measured by the verifier: 898×616 ⇒ 700×616 ⇒ 370×616, 40 % of
  // the pane, until the VibeSpace window was resized) — the belt must keep it the picture
  const CALC = bin('gnome-calculator');
  if (!CALC) skip('GNOME Calculator\'s mode switch', 'gnome-calculator not on PATH');
  else {
    const lc = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: CALC, args: [], label: 'vs-calc' }))} }).then((r) => r.json())`);
    const calcId = lc && lc.id;
    const crec = calcId && await until(() => p1.evalJs(`fetch('/api/desktop/apps/${calcId}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 30000);
    await p1.evalJs(`app.openDesktopApp(${JSON.stringify(calcId)}); true`);
    const cc = crec && await until(async () => { const s = await p1.evalJs(WIN(calcId)); return s && s.status === 'Connected' && s.windows.some((w) => w.kind === 'main') ? s : null; }, 40000, 300);
    check('a GNOME Calculator session connects on the xpra rung', !!cc, cc || (crec && crec.lastError));
    if (cc) {
      await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(calcId)}); w.element.style.left = '60px'; w.element.style.top = '30px'; w.element.style.width = '720px'; w.element.style.height = '560px'; if (w.onResize) w.onResize(); return true; })()`);
      // coverage of the PANE by the main window, and the main never larger than the pane (a window bigger than the pane is cut, not "covering")
      const cov = async () => { const s = await p1.evalJs(WIN(calcId)); const m = s && s.windows.find((w) => w.kind === 'main'); return s && m ? { s, m, c: (m.w * m.h) / (s.pane.w * s.pane.h), within: m.w <= s.pane.w && m.h <= s.pane.h } : null; };
      const fitted = await until(async () => { const x = await cov(); return x && x.within && x.c >= 0.95 && x.m.x === 0 && x.m.y === 0 ? x : null; }, 15000, 300);
      check(`the calculator fills the pane (${fitted ? `${fitted.m.w}×${fitted.m.h} = ${(fitted.c * 100).toFixed(1)} %` : '?'} of ${fitted && `${fitted.s.pane.w}×${fitted.s.pane.h}`})`, !!fitted, (await cov()) && { m: (await cov()).m, pane: (await cov()).s.pane });
      const cs = await p1.evalJs(WIN(calcId));
      await trustedClickAt(p1, cs.pane.x + cs.pane.w / 2, cs.pane.y + 12);
      await sleep(400);
      for (const [key, code, vk] of [['a', 'KeyA', 65], ['b', 'KeyB', 66]]) {
        await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers: 3 });
        await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: 3 });
        await sleep(2500);
        const x = await until(async () => { const v = await cov(); return v && v.within && v.c >= 0.95 && v.m.x === 0 && v.m.y === 0 ? v : null; }, 6000, 250);
        const last = x || await cov();
        const cws = (await p1.evalJs(`fetch('/api/desktop/apps/${calcId}/windows').then((r) => r.json())`)).windows || [];
        const xw = (last && cws.find((w) => w.id === last.m.wid)) || cws.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
        console.log(`  Ctrl+Alt+${key.toUpperCase()} (the calculator's mode switch): main ${last && `${last.m.w}×${last.m.h}+${last.m.x}+${last.m.y}`} = ${last ? (last.c * 100).toFixed(1) : '?'} % of the pane; X says ${xw && `${xw.w}×${xw.h}+${xw.x}+${xw.y}`}`);
        check(`after Ctrl+Alt+${key.toUpperCase()} the calculator still covers ≥ 95 % of the pane and X agrees (it used to drop to 75.9 % then 40.1 %)`, !!x && !!xw && Math.abs(xw.w - x.m.w) <= 8 && Math.abs(xw.h - x.m.h) <= 8, { client: last && last.m, x: xw, all: cws.map((w) => [w.id, w.title, `${w.w}x${w.h}+${w.x}+${w.y}`]) });
      }
    }
    if (calcId) await p1.evalJs(`fetch('/api/desktop/apps/${calcId}/stop', { method: 'POST' }).then((r) => r.status)`);
  }

  // ── (5) x5 — ONE ACTIVE VIEWER (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"; the owner's ruling
  // "直接block掉非active客户端的app界面…" + "仿照terminal…可以手动take over"): two headless pages with DIFFERENT pane sizes on
  // one xpra app — the first is active and its pane IS the app's geometry; the second shows the overlay, its resize and its
  // keys reach nothing; Resume here moves the app to the second pane within 2 s and blocks the first; the survivor stays
  // active when the other closes; an agent's lease makes everybody Watch (picture scaled to fit, typing refused) ──
  console.log('§5 x5 — one active viewer, two pages of different sizes on one xpra app');
  await p1.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`);
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  const x5File = path.join(fakeHome, 'x5.txt');
  // LOW-2 (2.369.156): the app's OWN title is HOSTILE — markup and quotes, which the overlay must show as TEXT, never as the launch label
  const X5_TITLE = 'vs-x5 <b>"t"</b> & <i>x</i>';
  const l5 = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: XTERM, args: ['-T', X5_TITLE, '-geometry', '80x24', '-e', 'sh', '-c', `cat > ${x5File}`], label: 'vs-x5' }))} }).then((r) => r.json())`);
  const id5 = l5 && l5.id;
  const r5 = id5 && await until(() => p1.evalJs(`fetch('/api/desktop/apps/${id5}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 30000);
  check('a second xterm session for the x5 legs reaches ready on the xpra rung', !!r5 && r5.backend === 'xpra', r5 || l5);
  const xMain5 = async (p) => { const ws = (await p.evalJs(`fetch('/api/desktop/apps/${id5}/windows').then((r) => r.json())`)).windows || []; return ws.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null; };
  const fitsX = (x, pane) => !!x && !!pane && x.w <= pane.w + 1 && x.h <= pane.h + 1 && pane.w - x.w < 16 && pane.h - x.h < 24;
  const typeOn = async (p, text) => { for (const ch of text) { const k = keyOf(ch); await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); } await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
  const fileHas = (s) => { try { return fs.readFileSync(x5File, 'utf8').includes(s); } catch { return false; } };
  const sizeWin = (p, W, H) => p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id5)}); app.wm.focusWindow(w.id); w.element.style.left = '30px'; w.element.style.top = '20px'; w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; if (w.onResize) w.onResize(); return true; })()`);
  const focusPane = async (p) => { const s = await p.evalJs(SEAT(id5)); await trustedClickAt(p, s.pane.x + s.pane.w / 2, s.pane.y + s.pane.h / 2); await sleep(250); return s; };
  const closePage = async (x) => { x.p.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${x.t.id}`); };
  const replayed = async (p) => { const has = await until(() => p.evalJs(`!!${SEAT(id5)}`), 15000, 250); if (!has) await p.evalJs(`app.openDesktopApp(${JSON.stringify(id5)}); true`); return until(() => p.evalJs(SEAT(id5)), 10000, 200); };
  if (r5) {
    await p1.evalJs(`app.openDesktopApp(${JSON.stringify(id5)}); true`);
    await sizeWin(p1, 700, 500);
    const a1 = await until(async () => { const s = await p1.evalJs(SEAT(id5)); return s && s.status === 'Connected' && s.mode === 'active' && s.windows.length ? s : null; }, 30000, 250);
    const xA = a1 && await until(async () => { const x = await xMain5(p1); return fitsX(x, a1.pane) ? x : null; }, 10000, 300);
    check(`A (first to attach) is ACTIVE and the app follows A's pane (X ${xA && `${xA.w}×${xA.h}`} in pane ${a1 && `${a1.pane.w}×${a1.pane.h}`})`, !!a1 && !!xA && a1.seats && a1.seats.active === a1.paneKey, a1 && { seats: a1.seats, x: await xMain5(p1) });
    await focusPane(p1); await typeOn(p1, 'a1');
    check('A types and the app gets it (xterm\'s cat wrote "a1")', !!(await until(() => fileHas('a1\n'), 8000, 200)));
    // B: a second page, a DIFFERENT pane size
    const B = await newPage();
    const b0 = await replayed(B.p);
    const bFirst = await until(async () => { const s = await B.p.evalJs(SEAT(id5)); return s && s.mode === 'blocked' && s.overlay && s.overlay.shown ? s : null; }, 15000, 250);
    // …and B RESIZES its window while blocked (a real change after it attached: 820×560, neither A's size nor the default)
    if (bFirst) await sizeWin(B.p, 820, 560);
    const bBlocked = bFirst && await until(async () => { const s = await B.p.evalJs(SEAT(id5)); return s && s.mode === 'blocked' && s.overlay && s.overlay.shown && Math.abs(s.pane.w - bFirst.pane.w) > 20 ? s : null; }, 5000, 200);
    check(`B attaches while A is active ⇒ B shows the overlay: "${bBlocked && bBlocked.overlay.msg}" + "${bBlocked && bBlocked.overlay.title}" + Resume here, and NO picture (${bBlocked ? bBlocked.windows.length : '?'} windows, ${bBlocked ? bBlocked.stageEls.length : '?'} canvases)`, !!bBlocked && bBlocked.overlay.msg === 'Active on another client' && bBlocked.overlay.title === bBlocked.title.replace(/ — agent window$/, '') && bBlocked.overlay.btn && bBlocked.overlay.btn.w > 0 && bBlocked.windows.length === 0 && bBlocked.stageEls.length === 0, bBlocked || (await B.p.evalJs(SEAT(id5))) || b0);
    const bTitled = await until(async () => { const s = await B.p.evalJs(SEAT(id5)); return s && s.overlay && s.overlay.title === X5_TITLE ? s : null; }, 5000, 200);
    check(`LOW-2: the blocked overlay names the APP'S OWN title (${JSON.stringify(bTitled ? bTitled.overlay.title : (await B.p.evalJs(SEAT(id5)))?.overlay?.title)}), never the launch label "vs-x5" — as TEXT (${bTitled ? bTitled.overlay.titleKids : '?'} child elements for its <b>/<i>), the title bar the same`, !!bTitled && bTitled.overlay.titleKids === 0 && bTitled.title === X5_TITLE, bTitled || (await B.p.evalJs(SEAT(id5))));
    await sleep(2500);
    const xAfterB = await xMain5(p1);
    const aNow = await p1.evalJs(SEAT(id5));
    check(`B's pane (${bBlocked && `${bBlocked.pane.w}×${bBlocked.pane.h}`}) changes NOTHING: X stays on A's pane (${xAfterB && `${xAfterB.w}×${xAfterB.h}`} in ${aNow.pane.w}×${aNow.pane.h}) 2.5 s after B attached and resized`, fitsX(xAfterB, aNow.pane) && aNow.mode === 'active', { x: xAfterB, a: aNow.pane, b: bBlocked && bBlocked.pane });
    await B.p.cdp('Page.bringToFront');
    await trustedClickAt(B.p, bBlocked.pane.x + bBlocked.pane.w / 2, bBlocked.pane.y + bBlocked.pane.h / 3);
    await typeOn(B.p, 'zz');
    await sleep(1500);
    check('B\'s keys never reach the app ("zz" is not in the app\'s file)', !fileHas('zz'), fs.existsSync(x5File) ? JSON.stringify(fs.readFileSync(x5File, 'utf8')) : 'no file');
    // Resume here on B (a trusted click on the button)
    await B.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id5)}); app.wm.focusWindow(w.id); return true; })()`);
    const bs = await B.p.evalJs(SEAT(id5));
    const tR = Date.now();
    await trustedClickAt(B.p, bs.overlay.btn.x + bs.overlay.btn.w / 2, bs.overlay.btn.y + bs.overlay.btn.h / 2);
    const bActive = await until(async () => { const s = await B.p.evalJs(SEAT(id5)); const x = await xMain5(B.p); return s && s.mode === 'active' && fitsX(x, s.pane) ? { s, x } : null; }, 5000, 100);
    const resumeMs = Date.now() - tR;
    console.log(`  Resume here on B ⇒ ${bActive ? `X ${bActive.x.w}×${bActive.x.h} in B's pane ${bActive.s.pane.w}×${bActive.s.pane.h} after ${resumeMs} ms` : 'X never followed B'}`);
    check(`Resume here on B ⇒ the app's geometry is B's pane within 2 s (${resumeMs} ms; X ${bActive && `${bActive.x.w}×${bActive.x.h}`})`, !!bActive && resumeMs <= 2000, { b: await B.p.evalJs(SEAT(id5)), x: await xMain5(B.p) });
    const aBlocked = await until(async () => { const s = await p1.evalJs(SEAT(id5)); return s && s.mode === 'blocked' && s.overlay && s.overlay.shown && !s.windows.length && !s.stageEls.length ? s : null; }, 5000, 200);
    check('…and A now shows the overlay (blocked, no picture: its cut session is gone, no window, no canvas)', !!aBlocked, aBlocked || (await p1.evalJs(SEAT(id5))));
    check(`LOW-2: A's overlay after the cut names the app's own title too (${JSON.stringify(aBlocked && aBlocked.overlay.title)}), as text`, !!aBlocked && aBlocked.overlay.title === X5_TITLE && aBlocked.overlay.titleKids === 0, aBlocked && aBlocked.overlay);
    await until(async () => { const s = await B.p.evalJs(SEAT(id5)); return s && s.status === 'Connected' && s.windows.length ? s : null; }, 8000, 200);
    await focusPane(B.p); await typeOn(B.p, 'b2');
    check('B types now and the app gets it ("b2")', !!(await until(() => fileHas('b2\n'), 8000, 200)));
    // A closes ⇒ B stays active
    const A1 = { p: p1, t: target };
    await closePage(A1);
    await sleep(1500);
    const bStill = await B.p.evalJs(SEAT(id5));
    check('A closes ⇒ B STAYS active (its pane key is the active one, still connected)', bStill && bStill.mode === 'active' && bStill.seats && bStill.seats.active === bStill.paneKey && bStill.status === 'Connected', bStill);
    // B closes, A reopens ⇒ A active
    await closePage(B);
    await sleep(800);
    const A2 = await newPage();
    await replayed(A2.p);
    const a2 = await until(async () => { const s = await A2.p.evalJs(SEAT(id5)); return s && s.mode === 'active' && s.status === 'Connected' && s.windows.length ? s : null; }, 20000, 250);
    check('B closes, A reopens ⇒ A is active again (the only viewer) and connected', !!a2 && a2.seats && a2.seats.active === a2.paneKey, a2 || (await A2.p.evalJs(SEAT(id5))));
    p1 = A2.p; // the suite's page from here on
    // an AGENT holds the window (the engine's lease, through the agent API of a live fake-claude session): everybody Watch
    let token = null;
    if (!fs.existsSync(FAKE_CLAUDE)) skip('the agent-held legs', 'no fake claude');
    else {
      const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
      await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
      wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: fakeHome, cols: 80, rows: 24, reqId: 'x5a', name: 'x5-agent' }));
      const created = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'x5a'), 20000, 100);
      token = created && await until(() => { for (const f of fs.readdirSync(path.join(wt, 'data', 'session-meta'))) { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', f), 'utf8')); if (j.agentToken && j.webuiSessionId === created.sessionId) return j.agentToken; } catch {} } return null; }, 10000, 200);
      agentTokens.push(token);
      check('a live agent session (fake claude) with its vsst_ token', !!created && !!token && /^vsst_/.test(token), created);
      wsMain.close();
      const agent = (verb, body) => fetch(`http://127.0.0.1:${PORT}/api/agent/window/${verb}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
      // desktop lane E (D1): a window is hidden from every agent until the user shares it — the user shares it first
      if (token) await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${id5}/reach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal: { kind: 'session', id: created.sessionId } }) });
      const at = token ? await agent('attach', { handle: id5 }) : null;
      check(`the agent attaches to the window (lease ${at && at.j && at.j.lease && at.j.lease.input})`, !!at && at.status === 200 && at.j.lease && at.j.lease.input === 'agent', at);
      const D = await newPage();
      await replayed(D.p);
      await sizeWin(D.p, 520, 380);
      await sizeWin(p1, 1080, 700); // LARGER than the app (INFO b, 2.369.156): the Watch picture must stay 1:1 there, centred — never blown up
      const both = await until(async () => { const a = await p1.evalJs(SEAT(id5)); const d = await D.p.evalJs(SEAT(id5)); return a && d && a.mode === 'watch' && d.mode === 'watch' && a.windows.length && d.windows.length && a.stageEls.length && d.stageEls.length ? { a, d } : null; }, 20000, 250);
      check('an agent DRIVES the window ⇒ BOTH pages are Watch with the picture (no overlay, the windows drawn)', !!both && !both.a.overlay.shown && !both.d.overlay.shown, both || { a: await p1.evalJs(SEAT(id5)), d: await D.p.evalJs(SEAT(id5)) });
      if (both) {
        await sleep(1500);
        const xW = await xMain5(p1);
        const d = await D.p.evalJs(SEAT(id5));
        const want = Math.min(d.pane.w / Math.max(...d.windows.filter((w) => w.kind !== 'popup').map((w) => w.x + w.w)), d.pane.h / Math.max(...d.windows.filter((w) => w.kind !== 'popup').map((w) => w.y + w.h)));
        const el = d.stageEls[0];
        console.log(`  Watch on D: X ${xW && `${xW.w}×${xW.h}`}, D's pane ${d.pane.w}×${d.pane.h}, stage scale ${d.scale.toFixed(3)} (fit ${want.toFixed(3)}), the canvas drawn ${el.w.toFixed(0)}×${el.h.toFixed(0)} at ${(el.x - d.pane.x).toFixed(0)},${(el.y - d.pane.y).toFixed(0)}`);
        check(`Watch: the picture is SCALED to fit D's pane (scale ${d.scale.toFixed(3)} = the fit ${want.toFixed(3)}), never cropped: the canvas (${el.w.toFixed(0)}×${el.h.toFixed(0)}) lies inside the pane and fills it one way`, Math.abs(d.scale - want) < 0.01 && d.scale < 1 && el.x >= d.pane.x - 1 && el.y >= d.pane.y - 1 && el.x + el.w <= d.pane.x + d.pane.w + 1 && el.y + el.h <= d.pane.y + d.pane.h + 1 && (Math.abs(el.w - d.pane.w) <= 2 || Math.abs(el.h - d.pane.h) <= 2), { d, want });
        const md = await measurePane(D.p, id5);
        check(`Watch: the picture is VISIBLE on D (${(md.inBrightFrac * 100).toFixed(0)} % of the drawn window non-black — xterm's white page)`, md.inBrightFrac > 0.5, md);
        check(`Watch: D's smaller pane and A's resize to 1080×700 change nothing — X stays ${xA && `${xA.w}×${xA.h}`}-sized (${xW && `${xW.w}×${xW.h}`}, the geometry A2 set before the agent attached)`, !!xW && !!a2 && fitsX(xW, a2.pane), { x: xW, a2: a2.pane });
        // A's page is a BACKGROUND tab here (D opened last): chrome runs no rendering steps there, so the view's ResizeObserver
        // (the stage's re-fit after the 1080×700 resize) waits for the tab to be shown — bring it to front, then read
        await p1.cdp('Page.bringToFront');
        const centred = (s) => { const e = s && s.stageEls[0]; return !!e && Math.abs((e.x - s.pane.x) - (s.pane.x + s.pane.w - (e.x + e.w))) <= 2; };
        const a = (await until(async () => { const s = await p1.evalJs(SEAT(id5)); return centred(s) ? s : null; }, 5000, 200)) || (await p1.evalJs(SEAT(id5)));
        const ae = a && a.stageEls[0];
        const gapL = ae ? ae.x - a.pane.x : NaN, gapR = ae ? a.pane.x + a.pane.w - (ae.x + ae.w) : NaN, gapT = ae ? ae.y - a.pane.y : NaN, gapB = ae ? a.pane.y + a.pane.h - (ae.y + ae.h) : NaN;
        console.log(`  Watch on A (pane ${a && `${a.pane.w}×${a.pane.h}`} > X ${xW && `${xW.w}×${xW.h}`}): stage scale ${a && a.scale}, the canvas ${ae && `${ae.w.toFixed(0)}×${ae.h.toFixed(0)}`}, gaps L${gapL.toFixed(0)} R${gapR.toFixed(0)} T${gapT.toFixed(0)} B${gapB.toFixed(0)}`);
        const mw = a && a.windows.find((w) => w.kind !== 'popup');
        check(`INFO b: on a pane LARGER than the app the Watch picture is NOT upscaled (scale ${a && a.scale}; the uncapped fit would be ${a && mw ? Math.min(a.pane.w / mw.w, a.pane.h / mw.h).toFixed(3) : '?'}) — the canvas is the window's own size ${mw && `${mw.w}×${mw.h}`}, 1:1 (X ${xW && `${xW.w}×${xW.h}`}), centred (gaps L/R ${gapL.toFixed(0)}/${gapR.toFixed(0)}, T/B ${gapT.toFixed(0)}/${gapB.toFixed(0)})`, !!a && !!ae && !!mw && a.scale === 1 && Math.min(a.pane.w / mw.w, a.pane.h / mw.h) > 1 && Math.abs(ae.w - mw.w) <= 1 && Math.abs(ae.h - mw.h) <= 1 && Math.abs(gapL - gapR) <= 2 && Math.abs(gapT - gapB) <= 2 && gapL > 20, { a, xW });
        for (const P2 of [p1, D.p]) { await P2.cdp('Page.bringToFront'); await focusPane(P2); await typeOn(P2, 'ww'); }
        await sleep(1500);
        check('Watch: typing on EITHER page is refused ("ww" never reaches the app)', !fileHas('ww'), JSON.stringify(fs.readFileSync(x5File, 'utf8')));
      }
      const dt = await agent('detach', { handle: id5 });
      check('the agent detaches (the lease ends)', dt.status === 200, dt);
      await closePage(D);
    }
    // CONTROL — THE PRE-x5 SERVER: a scratch copy of this worktree whose window-live wiring hands the bridge NO seats (the
    // bridge then relays every socket and nobody is ever elected, so every pane reads itself active — the code before x5).
    // Two pages of different sizes on one xterm there: the second page's pane takes the app away from the first.
    const wtc = scratch('deskxpra-x5ctl');
    try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
    execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
    for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
    fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
    const wiring = fs.readFileSync(path.join(wtc, 'src/server/window-live-wiring.js'), 'utf8');
    const seatsAt = '    viewerSeats: { // x5:';
    check('CONTROL: the wiring hands the bridge its seats exactly once (the control removes exactly that)', wiring.split(seatsAt).length === 2);
    fs.writeFileSync(path.join(wtc, 'src/server/window-live-wiring.js'), wiring.replace(seatsAt, '    viewerSeatsPreX5: { // pre-x5 CONTROL:'));
    const [PORTC] = await freePorts(1);
    const homeC = scratchHome('deskxpra-x5ctl-home', fs);
    const sc = spawnCopy('the pre-x5 copy', wtc, { ...srvEnv, ...VNC_ENV, PORT: String(PORTC), HOME: homeC }); ctlServers.push(sc);
    let upC = await bootedCopy(sc, PORTC);
    check('CONTROL: the pre-x5 copy boots', upC, sc.bootWhy);
    if (upC) {
      const ctlPage = async () => { const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); const p = await page(t); await openPage(p, `http://127.0.0.1:${PORTC}`); return { p, t }; };
      const CA = await ctlPage();
      const lc = await CA.p.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: XTERM, args: ['-T', 'vs-x5-ctl', '-geometry', '80x24'], label: 'vs-x5-ctl' }))} }).then((r) => r.json())`);
      const idc = lc && lc.id;
      const rc = idc && await until(() => CA.p.evalJs(`fetch('/api/desktop/apps/${idc}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), SETTLE_DEADLINE_MS);
      const xMainC = async () => { const ws = (await CA.p.evalJs(`fetch('/api/desktop/apps/${idc}/windows').then((r) => r.json())`)).windows || []; return ws.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null; };
      const sizeC = (p, W, H) => p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(idc)}); app.wm.focusWindow(w.id); w.element.style.left = '30px'; w.element.style.top = '20px'; w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; if (w.onResize) w.onResize(); return true; })()`);
      if (rc) {
        await CA.p.evalJs(`app.openDesktopApp(${JSON.stringify(idc)}); true`);
        await sizeC(CA.p, 700, 500);
        const ca = await until(async () => { const s = await CA.p.evalJs(SEAT(idc)); const x = await xMainC(); return s && s.status === 'Connected' && fitsX(x, s.pane) ? s : null; }, SETTLE_DEADLINE_MS, 300);
        const CB = await ctlPage();
        const hasB = await until(() => CB.p.evalJs(`!!${SEAT(idc)}`), 15000, 250); if (!hasB) await CB.p.evalJs(`app.openDesktopApp(${JSON.stringify(idc)}); true`);
        await until(async () => { const s = await CB.p.evalJs(SEAT(idc)); return s && s.status === 'Connected' ? s : null; }, 20000, 250);
        await sizeC(CB.p, 820, 560); // the same real change as the x5 leg's B
        // evidence, never a nap: wait for what the control is about — B unblocked and X no longer fitting A's pane — until
        // SETTLE_DEADLINE_MS; a pre-x5 copy that never takes the app away fails there (the last read is what is judged)
        let xc = null, cb = null; const tB = Date.now();
        await until(async () => { xc = await xMainC(); cb = await CB.p.evalJs(SEAT(idc)); return !!ca && !!cb && cb.overlay && !cb.overlay.shown && !fitsX(xc, ca.pane); }, SETTLE_DEADLINE_MS, 300);
        console.log(`  CONTROL (pre-x5): A's pane ${ca && `${ca.pane.w}×${ca.pane.h}`}, B's pane ${cb && cb.pane && `${cb.pane.w}×${cb.pane.h}`}, X ${xc && `${xc.w}×${xc.h}`} ${Date.now() - tB} ms after B resized; B's mode ${cb && cb.mode}, overlay ${cb && cb.overlay && cb.overlay.shown}`);
        check('CONTROL: through the pre-x5 server the second page is NOT blocked and its pane TAKES the app away from the first (X no longer fits A\'s pane — the leg "B\'s pane changes nothing" fails there)', !!ca && !!cb && cb.overlay && !cb.overlay.shown && !fitsX(xc, ca.pane), { a: ca && ca.pane, b: cb && cb.pane, x: xc });
        await closePage(CB);
        await CA.p.evalJs(`fetch('/api/desktop/apps/${idc}/stop', { method: 'POST' }).then((r) => r.status)`);
      } else check('CONTROL: an xterm reaches ready on the pre-x5 copy', false, lc);
      await closePage(CA);
    }
    try { sc.kill('SIGKILL'); } catch {}
  }

  await p1.cdp('Page.bringToFront').catch(() => {});

  if (typeof id5 === 'string' && id5) await p1.evalJs(`fetch('/api/desktop/apps/${id5}/stop', { method: 'POST' }).then((r) => r.status)`);
  check('the first app\'s window is on the current page again (layout replay after §5\'s page swap)', !!(await ensureWin()));
  // ── Stop from the window ──
  await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); w.content.querySelector('.desktop-app-stop').click(); return true; })()`);
  // round 3 A2: a Stop closes the window itself (every client, from the broadcast) with a toast — never a dead "Stopped" shell
  const ended = await until(async () => { const s = await p1.evalJs(WIN(appId)); return s === null ? true : null; }, 15000);
  const stopToasts = await p1.evalJs(`[...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent)`);
  check('Stop ⇒ the window closes itself with the "<app> stopped" toast (round 3 A2)', !!ended && stopToasts.some((x) => /^vs-xpra-title stopped/.test(x)), { ended, stopToasts });
  await sleep(600);
  check('Stop leaves no xpra / Xvfb / xterm behind (every recorded pid gone)', [rec.pids.x, rec.pids.server, rec.pids.app].every((p) => !D.pidAlive(p)));

  // ── §8 B-bfe6: a BROWSER as a desktop app — launched from the dialog's Browsers section with an Open URL, on the
  // xpra rung like every app: the window maps, the URL argument landed (our own http server sees the browser's GET and
  // the title bar carries the page title xpra reports), the profile is the keeper's (the argv names it, the browser
  // wrote into it, 0700, never under $HOME), Stop removes it. Every browser row on this box is judged; one that cannot
  // launch here is SKIPPED with its reason (a snap's private /tmp cannot reach this run's scratch data dir — the
  // refusal itself is asserted by name) ──
  {
    const same2 = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    const M_LIMITS = require('../src/keeper-limits.js');
    const trustedClick = async (p, sel) => { const r = await p.evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`); if (r) await trustedClickAt(p, r.x, r.y); return !!r; };
    const hits = [];
    const PAGE_TITLE = `vs-bfe6 ${process.pid}`;
    // the page (lane xpra-ime-mac): a text box for the keys legs, its key events and value reported back to this server (/vs-bfe6-k —
    // what the browser IN the app saw: key, code, keyCode; lane xpra-mac-modifiers: + ctrlKey / metaKey, and the box's selection
    // 60 ms after each keydown, once its default action ran), and a long text below for the scroll leg
    const KEYS_PAGE = `<textarea id="t" autofocus style="position:fixed;left:0;top:0;width:100%;height:45vh;font-size:18px;z-index:1"></textarea><div style="height:45vh"></div><div style="font:16px monospace">${Array.from({ length: 400 }, (_, i) => `line ${i} of the scroll leg`).join('<br>')}</div><script>let n=0;const send=(o)=>fetch('/vs-bfe6-k?e='+encodeURIComponent(JSON.stringify(o))).catch(()=>{});const sel=()=>{const t=document.getElementById('t');return{ss:t.selectionStart,se:t.selectionEnd,len:t.value.length};};for(const ty of ['keydown','keyup'])document.addEventListener(ty,(e)=>{send({n:n++,ty,key:e.key,code:e.code,kc:e.keyCode,rep:e.repeat,ctrl:e.ctrlKey,meta:e.metaKey});if(ty==='keydown')setTimeout(()=>send({n:n++,ty:'sel',...sel()}),60);},true);document.getElementById('t').addEventListener('input',(e)=>send({n:n++,ty:'value',v:e.target.value}));</script>`;
    const web = http.createServer((q, s) => { hits.push({ url: q.url, ua: String(q.headers['user-agent'] || '') }); s.writeHead(q.url.startsWith('/vs-bfe6') ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(q.url.startsWith('/vs-bfe6') ? `<!doctype html><title>${PAGE_TITLE}</title><body style="background:#fff"><h1>${PAGE_TITLE}</h1>${KEYS_PAGE}` : ''); });
    const keyLog = () => hits.filter((h) => h.url.startsWith('/vs-bfe6-k?e=')).map((h) => { try { return JSON.parse(decodeURIComponent(h.url.slice('/vs-bfe6-k?e='.length))); } catch { return null; } }).filter(Boolean).sort((a, b) => a.n - b.n);
    const [WEB_PORT] = await freePorts(1);
    await new Promise((r) => web.listen(WEB_PORT, '127.0.0.1', r));
    try {
      // the CATALOG's browser rows (lane app-launch-singleton: an installed / witnessed browser of a known family is served with
      // `browser` too, `browserBy: 'exec'` — e.g. this box's seen.d.google-chrome, filed under the witnessed section, not here)
      const regB = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((d) => d.registry.filter((r) => r.browser && r.browserBy !== 'exec'))`);
      console.log(`  browser rows: ${regB.map((r) => `${r.id} → ${r.available ? `${r.exec} ${r.path}${r.confinement ? ' [' + r.confinement + ']' : ''}` : `UNAVAILABLE (${r.reason})`}`).join('; ')}`);
      check('the catalog serves the two browser families (chromium, firefox), each available or dimmed WITH a reason', same2(regB.map((r) => r.id).sort(), ['chromium', 'firefox']) && regB.every((r) => r.available || !!r.reason), regB);
      for (const row of regB) {
        if (!row.available) {
          if (/is a snap/.test(row.reason || '')) {
            const rr = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: ${JSON.stringify(row.id)} }) }).then(async (r) => ({ status: r.status, body: await r.json() }))`);
            check(`${row.id}: this box's ${row.id} is a SNAP — the launch is refused by name (409 snap-profile-unreachable), never a profile the snap would silently swap for its own`, rr.status === 409 && rr.body.code === 'snap-profile-unreachable', rr);
          }
          skip(`${row.id} window leg`, row.reason || 'not available');
          continue;
        }
        const url = `http://127.0.0.1:${WEB_PORT}/vs-bfe6-${row.id}`;
        const before = new Set((await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((d) => d.apps.map((a) => a.id))`)));
        // the dialog: open it, type the URL into the Browsers section's field, click the family's card
        await p1.evalJs(`(() => { document.getElementById('desktop-launch-dialog')?.remove(); document.getElementById('btn-desktop-apps').click(); return true; })()`);
        const card = await until(() => p1.evalJs(`(() => { const c = document.querySelector('#desktop-launch-dialog .desktop-launch-browsers .desktop-launch-card[data-app-id=${JSON.stringify(row.id)}]'); return c && !c.disabled ? { title: c.title, inBrowsers: !!c.closest('.desktop-launch-browsers-sec'), note: document.querySelector('#desktop-launch-dialog .desktop-launch-browser-note')?.textContent || '' } : null; })()`), 10000, 150);
        check(`${row.id}: its card sits under the dialog's Browsers heading and its tooltip carries the "your own browser window … the Agent browser is separate" note`, !!card && card.inBrowsers && /your own browser window \(an app\); the Agent browser is separate/.test(card.title) && card.note === 'This is your own browser window (an app); the Agent browser is separate', card);
        if (!card) continue;
        // a bad URL is refused IN the dialog, by the same pure function the server runs — nothing launched
        await p1.evalJs(`(() => { const i = document.querySelector('#desktop-launch-dialog .desktop-launch-url'); i.value = 'javascript:alert(1)'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
        await trustedClick(p1, `#desktop-launch-dialog .desktop-launch-browsers .desktop-launch-card[data-app-id="${row.id}"]`);
        await sleep(600);
        const afterBad = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((d) => d.apps.filter((a) => a.state === 'launching' || a.state === 'ready').map((a) => a.id))`);
        check(`${row.id}: a javascript: URL in the dialog is refused before any request (the dialog stays open, no session started)`, await p1.evalJs(`!!document.getElementById('desktop-launch-dialog')`) && afterBad.every((id) => before.has(id)), afterBad);
        await p1.evalJs(`(() => { const i = document.querySelector('#desktop-launch-dialog .desktop-launch-url'); i.value = ${JSON.stringify(url)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
        await trustedClick(p1, `#desktop-launch-dialog .desktop-launch-browsers .desktop-launch-card[data-app-id="${row.id}"]`);
        const recB = await until(() => p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((d) => d.apps.find((a) => a.appId === ${JSON.stringify(row.id)} && !${JSON.stringify([...before])}.includes(a.id) && (a.state === 'ready' || a.state === 'failed')) || null)`), 45000, 300);
        check(`${row.id}: the launch from the dialog reaches ready on the xpra rung (${recB && recB.backend})`, !!recB && recB.state === 'ready' && recB.backend === 'xpra', recB && { state: recB.state, lastError: recB.lastError });
        if (!recB || recB.state !== 'ready') continue;
        const profWant = path.join(wt, 'data', 'desktop-apps', recB.id, 'profile');
        check(`${row.id}: the record names the keeper's OWN profile dir (data/desktop-apps/<id>/profile) and the URL as the LAST argv item, after the profile flags`, recB.profileDir === profWant && recB.url === url && recB.args[recB.args.length - 1] === url && recB.args.findIndex((a) => a === profWant || a === `--user-data-dir=${profWant}`) >= 0 && recB.args.findIndex((a) => a === profWant || a === `--user-data-dir=${profWant}`) < recB.args.length - 1, { profileDir: recB.profileDir, args: recB.args });
        // Chrome rewrites its own /proc cmdline into ONE space-joined string (measured: `/opt/google/chrome/chrome --user-data-dir=… …`) — tokenised back here
        const cmd = (() => { try { return fs.readFileSync(`/proc/${recB.pids.app}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ').split(' ').filter(Boolean); } catch { return []; } })();
        check(`${row.id}: the RUNNING browser process (pid ${recB.pids.app}) carries that profile and that URL in its argv — and no automation flag`, cmd.some((a) => a === `--user-data-dir=${profWant}` || a === profWant) && cmd.includes(url) && !cmd.some((a) => /^--?(remote-debugging|enable-automation|headless|marionette)/.test(a)), cmd);
        // the window maps (our xpra client draws it) and the title bar carries the PAGE title xpra reports
        const winB = await until(async () => { const s = await p1.evalJs(WIN(recB.id)); return s && s.status === 'Connected' && s.windows.length && s.title && s.title.includes(PAGE_TITLE) ? s : null; }, TITLE_DEADLINE_MS, 400);
        const winAny = winB || await p1.evalJs(WIN(recB.id));
        check(`${row.id}: the window maps in VibeSpace (status Connected, ${winAny && winAny.windows.length} window(s) in the session)`, !!winAny && winAny.status === 'Connected' && winAny.windows.length > 0, winAny && { status: winAny.status, windows: winAny.windows.length });
        check(`${row.id}: the VibeSpace title bar carries the page title xpra reports ("${winAny && winAny.title}")`, !!winB, winAny && winAny.title);
        const xs = await p1.evalJs(`fetch('/api/desktop/apps/${recB.id}/windows').then((r) => r.json())`);
        check(`${row.id}: X agrees — a mapped browser window titled with the page (${(xs.windows || []).map((w) => JSON.stringify(w.title)).join(', ')})`, (xs.windows || []).some((w) => (w.title || '').includes(PAGE_TITLE)), xs);
        const got = hits.filter((h) => h.url.startsWith(`/vs-bfe6-${row.id}`));
        check(`${row.id}: the URL argument LANDED — our http server served ${got.length} GET(s) of ${new URL(url).pathname} (UA ${got[0] ? got[0].ua.slice(0, 60) : 'none'})`, got.length > 0, hits.slice(-5));
        // ── lane xpra-ime-mac (inc-mvaddc4m-6m0t: in a Google Docs window w = End, s = Left, x = Down): the keys as the BROWSER IN THE
        // APP sees them. Chrome started on the stock evdev map, THEN our client programmed its own (the owner's order). A real
        // Chrome names a key by its X keycode — `code` — so every key must reach X on its stock keycode: w on 25 = KeyW, never on
        // 87 = Numpad1 (Docs acts on a numpad code with NumLock off). Then an IME commit (insertText ⇒ typeText ⇒ the published
        // rows on stock-NoSymbol keycodes) lands as its characters; the CONTROL re-programs the pre-lane browser-keyCode map in
        // this very session and presses w on 87 ⇒ Numpad1. Then the scroll leg: wheel over a long page ⇒ no lost scroll frame. ──
        if (row.id === 'chromium') {
          const wk = await p1.evalJs(WIN(recB.id));
          await trustedClickAt(p1, wk.pane.x + wk.pane.w / 2, wk.pane.y + wk.pane.h * 0.3); // the text box: the page's top 45 % under Chrome's own bar
          await sleep(500);
          const before = keyLog().length;
          for (const ch of 'wsxd') { const k = keyOf(ch); await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); await sleep(60); }
          const downs = await until(() => { const d = keyLog().slice(before).filter((e) => e.ty === 'keydown'); return d.length >= 4 ? d : null; }, 10000, 200) || keyLog().slice(before).filter((e) => e.ty === 'keydown');
          check(`${row.id}: w s x d typed through the window reach the browser in the app as KeyW KeyS KeyX KeyD with keys w s x d — never a numpad / function key (${downs.map((e) => `${e.key}/${e.code}`).join(' ')})`, same2(downs.map((e) => [e.key, e.code]), [['w', 'KeyW'], ['s', 'KeyS'], ['x', 'KeyX'], ['d', 'KeyD']]), downs);
          const v1 = await until(() => { const v = keyLog().filter((e) => e.ty === 'value').pop(); return v && v.v === 'wsxd' ? v.v : null; }, 8000, 200);
          check(`${row.id}: …and the text box holds "wsxd" (${JSON.stringify(v1)})`, v1 === 'wsxd', keyLog().filter((e) => e.ty === 'value').slice(-3));
          await p1.cdp('Input.insertText', { text: '中文输入' });
          const v2 = await until(() => { const v = keyLog().filter((e) => e.ty === 'value').pop(); return v && v.v === 'wsxd中文输入' ? v.v : null; }, 10000, 200);
          check(`${row.id}: an IME commit (中文输入) lands as its characters after them — the published rows on stock-NoSymbol keycodes (${JSON.stringify(v2 || (keyLog().filter((e) => e.ty === 'value').pop() || {}).v)})`, v2 === 'wsxd中文输入', keyLog().filter((e) => e.ty === 'value').slice(-3));
          // the scroll leg (UPSTREAM bug, xpra 6.5.4: a scroll-encoded frame is lost — the client offers no scroll encoding)
          const appLog = path.join(wt, 'data', 'desktop-apps', recB.id, 'app.log');
          const lost = () => { try { return (fs.readFileSync(appLog, 'utf8').match(/queue_damage_packet\(\) missing 1 required positional argument/g) || []).length; } catch { return -1; } };
          const lost0 = lost();
          for (let i = 0; i < 12; i++) { await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wk.pane.x + wk.pane.w / 2, y: wk.pane.y + wk.pane.h * 0.7, deltaX: 0, deltaY: i < 8 ? 240 : -240 }); await sleep(150); }
          await sleep(2000);
          check(`${row.id}: a wheel scroll over a long page loses NO frame to xpra's scroll encoder (${lost() - lost0} "queue_damage_packet() missing" in app.log)`, lost0 >= 0 && lost() - lost0 === 0, { lost0, lost: lost() });
          // ── lane xpra-mac-modifiers (the owner 2026-10-16: 「根据 host+client 两边自动判断」): a MAC viewer's ⌘+a is the app's Ctrl+a —
          // the browser in the app selects all of its text box and sees ctrlKey (and the ⌘ key itself as Control). CONTROL: a LINUX
          // viewer sending the same keys — Super+a: metaKey, nothing selected. The viewer page names its platform where the view
          // reads it (navigator.userAgentData.platform); a Mac sends no keyup for a key pressed under ⌘, so none is sent here. ──
          const asViewer = (plat) => p1.evalJs(plat ? `(() => { Object.defineProperty(navigator, 'userAgentData', { value: { platform: ${JSON.stringify(plat)} }, configurable: true }); return navigator.userAgentData.platform; })()` : `(() => { delete navigator.userAgentData; return navigator.userAgentData ? navigator.userAgentData.platform : navigator.platform; })()`);
          const cmdA = async ({ mac }) => {
            const from = keyLog().length ? keyLog().slice(-1)[0].n + 1 : 0;
            await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, location: 1, modifiers: 4 });
            await sleep(80);
            await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4 });
            await sleep(80);
            if (!mac) await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4 });
            await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, location: 1, modifiers: 0 });
            // the a's keydown, the selection after it, and the modifier key's keydown — as the browser IN the app saw them
            const got = await until(() => { const l = keyLog().filter((e) => e.n >= from); const a = l.find((e) => e.ty === 'keydown' && e.key === 'a'); const se = a && l.find((e) => e.ty === 'sel' && e.n > a.n); return se && l.some((e) => e.ty === 'keyup' && e.n > a.n && e.key !== 'a') ? { a, sel: se, mod: l.find((e) => e.ty === 'keydown' && e.key !== 'a') || null, log: l } : null; }, 10000, 200);
            await sleep(400);
            return got || { a: null, sel: null, mod: null, log: keyLog().filter((e) => e.n >= from) };
          };
          const said = (r) => r && r.a ? `${r.mod ? `${r.mod.key}/${r.mod.code} then ` : ''}a ctrl=${r.a.ctrl} meta=${r.a.meta}; selection ${r.sel.ss}–${r.sel.se} of ${r.sel.len}` : `nothing (${JSON.stringify(r && r.log ? r.log.slice(-6) : null)})`;
          await trustedClickAt(p1, wk.pane.x + wk.pane.w / 2, wk.pane.y + wk.pane.h * 0.3); // the caret into the text box: nothing selected
          await sleep(600);
          const vMac = await asViewer('macOS');
          const mA = await cmdA({ mac: true });
          console.log(`  ${row.id}: a Mac viewer (${vMac}) ⌘+a ⇒ the browser in the app saw: ${said(mA)}`);
          check(`${row.id}: a MAC viewer's ⌘+a is the app's Ctrl+a — the browser in the app saw ctrlKey (not metaKey) and selected ALL of its text box (${said(mA)})`, vMac === 'macOS' && !!mA.a && mA.a.ctrl === true && mA.a.meta === false && mA.sel.len > 0 && mA.sel.ss === 0 && mA.sel.se === mA.sel.len, mA);
          check(`${row.id}: …the ⌘ key itself reached it as Control (${mA.mod ? `${mA.mod.key}/${mA.mod.code}` : 'none'})`, !!mA.mod && mA.mod.key === 'Control' && mA.mod.code === 'ControlLeft', mA.mod);
          const vLinux = await asViewer(null);
          await trustedClickAt(p1, wk.pane.x + wk.pane.w / 2, wk.pane.y + wk.pane.h * 0.3); // collapse the selection again
          await sleep(600);
          const lA = await cmdA({ mac: false });
          console.log(`  ${row.id}: a Linux viewer (${vLinux}) ⌘/Super+a ⇒ the browser in the app saw: ${said(lA)}`);
          check(`${row.id}: CONTROL — a LINUX viewer (${vLinux}) sending the same keys: Super+a — the browser in the app saw metaKey, not ctrlKey, and selected nothing (${said(lA)})`, /linux/i.test(String(vLinux)) && !!lA.a && lA.a.meta === true && lA.a.ctrl === false && lA.sel.ss === lA.sel.se, lA);
          // CONTROL in the same session: the pre-lane map (browser keyCodes) programmed by a keyboard-config, w pressed on 87
          const pre = [[8, ['BackSpace']], [13, ['Return']], [32, ['space']], [16, ['Shift_L']], [17, ['Control_L']], [18, ['Alt_L']], ...[...'0123456789'].map((d) => [48 + Number(d), [d]]), ...[...'abcdefghijklmnopqrstuvwxyz'].map((c, i) => [65 + i, [c, c.toUpperCase()]])];
          const before2 = keyLog().length;
          const sent = await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(recB.id)}); const c = w._desktopAppView.client; const pre = ${JSON.stringify(pre)}; c.send(['keyboard-config', { layout: 'us', keycodes: pre.map(([kc, n]) => [kc, n[0], kc, 0, 0]), x11_keycodes: new Map(pre), query_struct: { rules: 'evdev', model: 'pc105', layout: 'us', variant: '', options: '' }, variant: '', options: '', force: true }]); setTimeout(() => { c.send(['key-action', c.mainWid, 'w', true, [], 119, 'w', 87, 0]); c.send(['key-action', c.mainWid, 'w', false, [], 119, 'w', 87, 0]); }, 400); return true; })()`);
          const preDown = await until(() => keyLog().slice(before2).find((e) => e.ty === 'keydown') || null, 8000, 200);
          check(`${row.id}: CONTROL — the pre-lane map (browser keyCodes) in this session: w pressed on X keycode 87 reaches the browser as ${preDown ? `${preDown.key}/${preDown.code}` : 'nothing'} (the numpad key Docs moves the caret with)`, !!sent && !!preDown && preDown.code === 'Numpad1', preDown);
        }
        // the profile is the keeper's — the browser wrote into it; 0700; not under $HOME; the apps' $HOME has no profile of that browser
        const profEntries = (() => { try { return fs.readdirSync(profWant); } catch { return null; } })();
        // A PROFILE of that browser under $HOME = anything but Chrome's crashpad database: Chrome creates
        // `~/.config/<channel>/Crash Reports` (settings.dat + four empty dirs) whatever --user-data-dir says — measured with
        // strace on google-chrome 2026-09-23 — and opens the user's shared NSS store ~/.local/share/pki/nssdb; neither holds
        // a cookie, a history or a login. Everything else of the profile must be in the keeper's dir.
        const realRoots = ['.config/google-chrome', '.config/chromium', '.config/chromium-browser', '.mozilla'].flatMap((r) => { try { return fs.readdirSync(path.join(fakeHome, r)).filter((e) => e !== 'Crash Reports').map((e) => `${r}/${e}`); } catch { return []; } });
        check(`${row.id}: the browser wrote its profile INTO the keeper's dir (${profEntries ? profEntries.slice(0, 6).join(', ') : 'missing'}), mode ${profEntries ? (fs.statSync(profWant).mode & 0o777).toString(8) : '?'}`, !!profEntries && profEntries.length > 0 && (fs.statSync(profWant).mode & 0o777) === 0o700);
        check(`${row.id}: the profile is not under $HOME (${fakeHome}) and no ${row.id} profile appeared under $HOME (${realRoots.join(', ') || 'none'}; Chrome's crashpad dir aside)`, !profWant.startsWith(fakeHome + path.sep) && !realRoots.length, realRoots);
        const liveB = await p1.evalJs(`fetch('/api/desktop/apps/${recB.id}').then((r) => r.json())`);
        // 2026-09-25: the keeper's resource sample is a REPORT (never a stop): memBytes in its metric (PSS), rssBytes a deprecated fact
        if (liveB.live) console.log(`  ${row.id}: the keeper's last resource sample — ${(liveB.live.memBytes / 1048576).toFixed(0)} MB ${liveB.live.memMetric} (ΣVmRSS ${(liveB.live.rssBytes / 1048576).toFixed(0)} MB) over ${liveB.live.pids} process(es), ${liveB.live.cpuPct == null ? '?' : liveB.live.cpuPct.toFixed(0)} % CPU (reporting threshold ${M_LIMITS.GUARD_MEM_BYTES / 2 ** 30} GiB; over: ${liveB.live.over || 'no'})`);
        // Stop from the window ⇒ Stopped, nothing left, the profile removed
        await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(recB.id)}); w.content.querySelector('.desktop-app-stop').click(); return true; })()`);
        const endB = await until(async () => { const r = await p1.evalJs(`fetch('/api/desktop/apps/${recB.id}').then((r) => r.json())`); return r.state === 'exited' && r.profileRemovedAt ? r : null; }, 30000, 300);
        check(`${row.id}: Stop ⇒ exited, every recorded pid gone, THEN the profile removed (${endB && endB.profileRemovedAt ? 'profileRemovedAt set' : 'not removed'})`, !!endB && [recB.pids.x, recB.pids.server, recB.pids.app].every((p) => !D.pidAlive(p)) && !fs.existsSync(profWant), endB && { state: endB.state, profileError: endB.profileError, exists: fs.existsSync(profWant) });
        await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(recB.id)}); if (w) app.wm.closeWindow ? app.wm.closeWindow(w.id) : null; return true; })()`).catch(() => {});
      }
    } finally { web.close(); }
  }

  // ── §9 ROUND 3, LANE A1 (docs/design-desktop-apps-seamless §3.1): THE PLAIN-HTTP GESTURE WINDOW on the real rung. A page by
  // HOSTNAME (never loopback — loopback is a secure context and proves nothing), GNOME Calculator on xpra: the user's own
  // trusted Ctrl+C in the pane ⇒ the calculator copies ⇒ its token is written to the browser clipboard with NO click (read
  // back from the secure loopback page: one browser, one clipboard); a token 5.5 s after the chord ⇒ the chip; a token
  // after a trusted key that is NOT a copy chord (fresh activation, no stamp) ⇒ the chip; the hint does not repeat ──
  console.log('§9 A1 — the plain-http gesture window: Ctrl+C in the app ⇒ the local clipboard with no click; late / chord-less ⇒ the chip');
  const CALC9 = bin('gnome-calculator');
  if (!hostResolves) skip('§9 the gesture window', `${HOSTNAME} does not resolve`);
  else if (!CALC9) skip('§9 the gesture window', 'gnome-calculator not on PATH');
  else if (!XCLIP) skip('§9 the gesture window', 'xclip not on PATH');
  else {
    // the READER is the secure loopback page (one browser, one clipboard): p1 is §5's replacement page by now — grant it the
    // clipboard again and emulate its focus (readText needs a focused document; the §2 grant was made through another page)
    await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    const H9 = await mkPage(`http://${HOSTNAME}:${PORT}`, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
    let id9 = null;
    const kids9 = [];
    try {
      check(`§9: the hostname page (http://<hostname>:${PORT}) is NOT a secure context and has no clipboard API`, await H9.p.evalJs('window.isSecureContext === false && typeof navigator.clipboard === "undefined"'));
      const lc = await launchOn(H9.p, { exec: CALC9, args: [], label: 'vs-calc-a1' });
      const rc = lc && lc.id && await readyOn(H9.p, lc.id);
      check('§9: GNOME Calculator reaches ready on the xpra rung', !!rc && rc.backend === 'xpra', lc);
      if (rc) {
        id9 = rc.id;
        const xe9 = xenvFor(wt, rc);
        await H9.p.evalJs(`app.openDesktopApp(${JSON.stringify(id9)}); true`);
        await ensureActive(H9.p, id9);
        await sizeWinOn(H9.p, id9, 560, 760);
        const up9 = await until(async () => { const v = await H9.p.evalJs(R2(id9)); return v && v.status === 'Connected' && v.main && v.main.h > 100 ? v : null; }, 40000, 300);
        check('§9: the calculator window is connected on the hostname page', !!up9, await H9.p.evalJs(R2(id9)));
        await sleep(1500);
        // the pane's keyboard: focus its IME textarea by SCRIPT (no click — a click would be a gesture of its own)
        await H9.p.cdp('Page.bringToFront');
        await H9.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id9)}); app.wm.focusWindow(w.id); w._desktopAppView.focus(); return document.activeElement === w._desktopAppView.ime; })()`);
        const A9 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const v = w._desktopAppView; const h = v.copyHint; return { chip: v.chip.style.display !== 'none', chipText: v.chipText, hint: !!h && getComputedStyle(h).display !== 'none', last: v.client && v.client.lastReceived, toasts: [...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent) }; })()`;
        const type9 = async (chars) => { for (const ch of chars) { const k = keyOf(ch); await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); await sleep(120); } };
        const ctrlC9 = async () => {
          await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
          await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
          await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
          await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
        };
        const readClip = async () => { await p1.cdp('Page.bringToFront'); const r = await p1.evalJs(`navigator.clipboard.readText().then((t) => t).catch((e) => 'err:' + e.message)`); await H9.p.cdp('Page.bringToFront'); return r; };
        const setClip = async (text) => { await p1.cdp('Page.bringToFront'); const r = await p1.evalJs(`navigator.clipboard.writeText(${JSON.stringify(text)}).then(() => 'ok').catch((e) => 'err:' + e.message)`); await H9.p.cdp('Page.bringToFront'); return r; };
        const hold9 = (text) => { const k = spawn('sh', ['-c', `printf '%s' ${JSON.stringify(text)} | ${XCLIP} -i -selection clipboard`], { env: xe9, stdio: 'ignore', detached: true }); kids9.push(k); xclipKids.push(k); };
        // (a) type 1 2 3 4 into the calculator, then the user's own Ctrl+C: the calculator copies "1234", the token is written — no click
        const wrote0 = await setClip('vs-a1-sentinel');
        await H9.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id9)}); w._desktopAppView.focus(); return true; })()`);
        await type9('1234');
        await sleep(600);
        const t0 = Date.now();
        await ctrlC9();
        const got = await until(async () => { const v = await H9.p.evalJs(A9(id9)); return v && v.last === '1234' ? { v, ms: Date.now() - t0 } : null; }, 5000, 25);
        await sleep(300);
        const after = await H9.p.evalJs(A9(id9));
        const clipA = await readClip();
        console.log(`  §9 (a): the calculator's token observed ${got ? got.ms : '?'} ms after the trusted Ctrl+C (poll 25 ms; the browser's window is 5000 ms); clipboard sentinel written: ${wrote0}; the browser clipboard now reads ${JSON.stringify(clipA)}; chip ${after.chip ? 'SHOWN' : 'hidden'}`);
        check(`§9 A1: the user's own Ctrl+C in the pane ⇒ the calculator copies "1234" and it LANDS in the browser clipboard with NO click (read back from the secure page: ${JSON.stringify(clipA)}), no chip, a "Copied to your clipboard" toast`, !!got && clipA === '1234' && !after.chip && after.toasts.some((x) => /Copied to your clipboard/.test(x)), { got, after, clipA });
        // (a2) desktop A r1: the gesture write's temporary textarea took the focus and dropped it to <body> — every key after
        // the copy was swallowed. The pane's IME holds the focus again, with NO script refocus (the legs below type without one)
        const focusA2 = await H9.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id9)}); const a = document.activeElement; return { ime: a === w._desktopAppView.ime, tag: a ? a.tagName : null }; })()`);
        check(`§9 A1 r1: after the gesture copy the keyboard focus is back on the pane's IME (activeElement ${focusA2.tag}) — the next keys reach the app`, focusA2.ime === true, focusA2);
        // (b) the stamp outlives nothing: a Ctrl+C whose token arrives 5.5 s later ⇒ the chip. The calculator's re-copy of the same
        // "1234" is DEDUPED by the client (no delivery, the stamp stays), so the only token after it is xclip's at +5.5 s
        await ctrlC9();
        await sleep(5500);
        hold9('vs-a1-late');
        const late = await until(async () => { const v = await H9.p.evalJs(A9(id9)); return v && v.chip && v.chipText === 'vs-a1-late' ? v : null; }, 8000, 150);
        const clipB = await readClip();
        check(`§9 A1: a token 5.5 s after the Ctrl+C (outside Chrome's activation window) ⇒ the "Copied in the app — click to copy" chip, and the browser clipboard is untouched (${JSON.stringify(clipB)})`, !!late && clipB === '1234', { late: late || await H9.p.evalJs(A9(id9)), clipB });
        check('§9 A1: the HTTPS hint is one-time per device — §2 showed it on this origin, this chip comes without it', !!late && !late.hint && await H9.p.evalJs(`!!localStorage.getItem('vibespace.desktopCopyHintShown')`), late);
        // (c) a FRESH trusted key that is not a copy chord (the page has activation, no stamp) + a copy nobody made here ⇒ the chip.
        // NO script refocus here (desktop A r1): the '5' must reach the calculator on the focus the gesture copy handed back — (d)
        // reading "12345" is the proof (before r1 the key went to <body> and (d) read "1234" again)
        await type9('5');
        const t1 = Date.now();
        hold9('vs-a1-agent-copy');
        const agentCopy = await until(async () => { const v = await H9.p.evalJs(A9(id9)); return v && v.chip && v.chipText === 'vs-a1-agent-copy' ? { v, ms: Date.now() - t1 } : null; }, 8000, 100);
        const clipC = await readClip();
        check(`§9 A1 CONTROL: a copy the user did not make (xclip on the app's display ${agentCopy ? agentCopy.ms : '?'} ms after a plain digit key — the page HAS activation, no copy chord) ⇒ the chip, never written behind the user's back (clipboard still ${JSON.stringify(clipC)})`, !!agentCopy && clipC === '1234', { agentCopy, clipC });
        // (d) and a second real Ctrl+C right after writes again (the calculator now shows 12345 — a fresh chord, a fresh token)
        const t2 = Date.now();
        await ctrlC9();
        const got2 = await until(async () => { const v = await H9.p.evalJs(A9(id9)); return v && v.last === '12345' ? { v, ms: Date.now() - t2 } : null; }, 5000, 25);
        await sleep(300);
        const clipD = await readClip();
        const afterD = await H9.p.evalJs(A9(id9));
        console.log(`  §9 (d): the second Ctrl+C's token observed ${got2 ? got2.ms : '?'} ms after the chord; clipboard ${JSON.stringify(clipD)}; chip ${afterD.chip ? `SHOWN (${JSON.stringify(afterD.chipText)})` : 'hidden'}`);
        check(`§9 A1: a second Ctrl+C writes the calculator's new value (${JSON.stringify(clipD)}) with no click, and the pending chip goes away (the clipboard now holds the newer copy)`, !!got2 && clipD === '12345' && !afterD.chip, { got2, clipD, afterD });
        check('§9 A1 r1: …and after the second gesture copy the pane\'s IME holds the focus again', await H9.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id9)}); return document.activeElement === w._desktopAppView.ime; })()`));
      }
    } catch (e) { threw('§9', e); }
    finally {
      for (const k of kids9) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} }
      if (id9) await H9.p.evalJs(`fetch('/api/desktop/apps/${id9}/stop', { method: 'POST' }).then((r) => r.status)`).catch(() => {});
      await dropPage(H9);
      await p1.cdp('Page.bringToFront').catch(() => {});
    }
  }

  // ── §13 (lane C2 — docs/design-desktop-apps-seamless §3.5): THE MAIN LEGS AGAIN FOR AN APP ON A PAIRED MACHINE — a
  // scratch daemon (the BUILT bundle, its own HOME) PAIRED to this server the way a person pairs one (POST
  // /api/device/dial-pair, the daemon dials /api/device-dial with the token), then: the machine picker offers it, ITS
  // ladder answers (GET /api/desktop/apps?host=), the launch runs THERE (the record is the device's, the hub
  // re-labels it), the window connects through the hub forward (the bridge's streamEndpointFor), the pane covers the
  // app, the title names the machine, typed keys land in the app's file on the device, Stop closes the window. ──
  {
    console.log('§13 lane C2: the main legs with host=<a paired device> (a scratch daemon dialed in to this server)');
    const devHome = scratchHome('deskxpra-dev-home', fs, ['.vibespace']);
    const devRoot = path.join(devHome, 'agentd-root');
    fs.mkdirSync(path.join(devRoot, 'state'), { recursive: true, mode: 0o700 });
    devHomes.push(devHome);
    const devTyped = path.join(devHome, 'typed-remote.txt');
    // its OWN page (the earlier sections navigated / replaced the suite's page): a fresh tab on this server
    const t12 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const p12 = await page(t12);
    await openPage(p12, `http://127.0.0.1:${PORT}`);
    let devId = null;
    const devName = `vs-deskxpra-dev-${process.pid}`;
    try {
      // the .197 integration (lane pairing, address choice): a pairing names the address the device DIALS — the route
      // refuses a mint without one (`bad_base`, never a guess); this scratch device dials this server's loopback
      const pair = await p12.evalJs(`fetch('/api/device/dial-pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: ${JSON.stringify(devName)}, base: ${JSON.stringify(`http://127.0.0.1:${PORT}`)} }) }).then((r) => r.json())`);
      check('§13: the server mints a pairing (dial token + host token) for the scratch device', !!(pair && pair.dialToken && pair.hostToken && pair.deviceId), pair);
      fs.writeFileSync(path.join(devRoot, 'state', 'token'), pair.hostToken, { mode: 0o600 });
      const dev = spawn(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace-agentd.js'), '--dial', `ws://127.0.0.1:${PORT}/api/device-dial?device=${pair.deviceId}`, '--dial-token', pair.dialToken], { cwd: devHome, env: { ...process.env, HOME: devHome, VIBESPACE_AGENTD_ROOT: devRoot }, stdio: 'ignore', detached: true });
      devProcs.push(dev); dev.unref();
      const row = await until(async () => { const r = await p12.evalJs(`fetch('/api/desktop/machines').then((r) => r.json())`); const m = r && r.machines && r.machines.find((x) => x.label === devName); return m && m.code === 'ready' ? m : null; }, 30000, 500);
      check(`§13: the paired device dialed in and the machine picker offers it (${row && row.hostId}: ${row && row.code}, platform ${row && row.platform})`, !!row && row.selectable === true, row);
      devId = row && row.hostId;
      if (devId) {
        const av = await p12.evalJs(`fetch('/api/desktop/apps?host=${encodeURIComponent(devId)}').then((r) => r.json())`);
        check(`§13: THE DEVICE's ladder answers (GET /api/desktop/apps?host=): ${av && av.availability && av.availability.backend}, ${av && av.registry && av.registry.length} catalog rows`, av && av.availability && av.availability.backend === 'xpra' && av.host && av.host.hostId === devId, av && (av.error || av.availability));
        const L = await p12.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ host: devId, exec: XTERM, args: ['-T', 'vs-remote-title', '-geometry', '80x24', '-e', 'sh', '-c', `cat > ${devTyped}`], label: 'remote xterm' }))} }).then((r) => r.json())`);
        const rid = L && L.id;
        check(`§13: POST /api/desktop/apps with host ⇒ launched ON THE DEVICE (hostId ${L && L.hostId}, backend ${L && L.backend})`, !!rid && L.hostId === devId && L.backend === 'xpra', L);
        const rr = rid && await until(() => p12.evalJs(`fetch('/api/desktop/apps/${rid}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 40000, 300);
        check(`§13: the record reaches ready on the device (port ${rr && rr.port}, the hub label ${rr && rr.hostLabel})`, !!rr && rr.hostId === devId && !!rr.hostLabel, rr);
        const onDev = (() => { try { return JSON.parse(fs.readFileSync(path.join(devHome, '.vibespace', 'desktop-apps.json'), 'utf8')).apps[rid]; } catch { return null; } })();
        const onHub = (() => { try { return JSON.parse(fs.readFileSync(path.join(wt, 'data', 'desktop-apps.json'), 'utf8')).apps[rid]; } catch { return null; } })();
        check('§13: the record is the DEVICE\'s (its ~/.vibespace/desktop-apps.json), never in this machine\'s store (D8)', !!onDev && !onHub);
        if (rr) {
          await p12.evalJs(`app.openDesktopApp(${JSON.stringify(rid)}); true`);
          const t0 = Date.now();
          const conn = await until(async () => { const s = await p12.evalJs(WIN(rid)); return s && s.status === 'Connected' && s.windows.length ? s : null; }, 30000, 250);
          check(`§13: the window connects through the hub forward (Connected ${conn ? Date.now() - t0 : '—'} ms after open, the xpra view)`, !!conn && conn.kind === 'xpra', conn || p12.logs.slice(-8));
          const srvSaw = srvLog.join('').includes(`${rid}: upstream on ${devId}:${rr.port} through the hub forward`);
          check('§13: the bridge resolved the upstream to the hub forward (its log line names the device and the port)', srvSaw);
          await p12.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(rid)}); w.element.style.width = '900px'; w.element.style.height = '620px'; if (w.onResize) w.onResize(); return true; })()`);
          const settled = await until(async () => { const s = await p12.evalJs(WIN(rid)); const m = s && s.windows.find((w) => w.kind === 'main'); return m && s.pane.w - m.w < 16 && s.pane.h - m.h < 24 && m.x === 0 && m.y === 0 ? s : null; }, 15000, 300);
          await sleep(1200);
          const m = await measurePane(p12, rid);
          check(`§13: the device's app window covers the pane up to one xterm cell (${m && m.main && `${m.main.w}×${m.main.h}`} of ${m && `${m.pane.w}×${m.pane.h}`}), ${m && m.blackOut} black px outside it`, !!settled && !!m && !!m.main && m.blackOut === 0 && m.inBrightFrac > 0.5, m && { main: m.main, blackOut: m.blackOut });
          const tt = await until(async () => { const s = await p12.evalJs(WIN(rid)); return s && /vs-remote-title/.test(s.title) && s.title.includes(rr.hostLabel) ? s.title : null; }, 10000, 250);
          check(`§13: the title bar carries the app's own title AND the machine's name ("${tt}")`, !!tt);
          const s1 = await p12.evalJs(WIN(rid));
          await trustedClickAt(p12, s1.pane.x + s1.pane.w / 2, s1.pane.y + s1.pane.h / 2);
          await sleep(300);
          const keyOf = (ch) => ({ key: ch, code: ch === ' ' ? 'Space' : /[a-z]/.test(ch) ? 'Key' + ch.toUpperCase() : /[0-9]/.test(ch) ? 'Digit' + ch : '', windowsVirtualKeyCode: ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0), text: ch, unmodifiedText: ch });
          const tk = Date.now();
          for (const ch of 'on the device 7') { const k = keyOf(ch); await p12.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await p12.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); }
          await p12.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
          await p12.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
          const typed = await until(() => { try { const s = fs.readFileSync(devTyped, 'utf8'); return s.includes('on the device 7\n') ? s : null; } catch { return null; } }, 15000, 50);
          check(`§13: trusted key events typed in the page land in the app's file ON THE DEVICE (${typed ? Date.now() - tk : '—'} ms for 16 keys through page → hub bridge → forward → the device's xpra)`, !!typed, (() => { try { return JSON.stringify(fs.readFileSync(devTyped, 'utf8')); } catch { return 'no file'; } })());
          // the launch dialog: the machine picker shows the device, selectable (our own controls' structure)
          await p12.evalJs(`document.getElementById('btn-desktop-apps') ? (document.getElementById('btn-desktop-apps').click(), true) : false`);
          const pick = await until(() => p12.evalJs(`(() => { const b = document.querySelector('#desktop-launch-dialog .desktop-launch-machine[data-host=${JSON.stringify(devId)}]'); return b ? { disabled: b.disabled, n: document.querySelectorAll('#desktop-launch-dialog .desktop-launch-machine').length } : null; })()`), 10000, 250);
          check(`§13: the launch dialog's machine picker has a row for the device, enabled (${pick && pick.n} machines)`, !!pick && pick.disabled === false && pick.n >= 2, pick);
          await p12.evalJs(`(() => { const b = document.querySelector('#desktop-launch-dialog .desktop-launch-machine[data-host=${JSON.stringify(devId)}]'); if (b) b.click(); return true; })()`);
          const cat = await until(() => p12.evalJs(`(() => { const b = document.querySelector('#desktop-launch-dialog .desktop-launch-machine[data-host=${JSON.stringify(devId)}]'); const cards = document.querySelectorAll('#desktop-launch-dialog .desktop-launch-registry .desktop-launch-card'); return b && b.getAttribute('aria-pressed') === 'true' && cards.length ? { cards: cards.length } : null; })()`), 10000, 250);
          check('§13: choosing the device re-reads ITS catalog (the cards are the device\'s)', !!cat, cat);
          await p12.evalJs(`(() => { const o = document.getElementById('desktop-launch-dialog'); if (o) o.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
          await sleep(300);
          // Stop ⇒ the device verifies every part gone; the window closes itself
          const sp = await p12.evalJs(`fetch('/api/desktop/apps/${rid}/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json())`);
          check(`§13: Stop through the route ⇒ the device answers exited (${sp && sp.state}, ${sp && sp.stoppedBy})`, sp && sp.state === 'exited' && sp.stoppedBy === 'user', sp);
          const closed = await until(() => p12.evalJs(`!${WIN(rid)}`), 10000, 250);
          check('§13: the window closes itself when the device\'s app ended (A2 over the paired machine)', !!closed);
          await sleep(500);
          const left = []; for (const d of fs.readdirSync('/proc')) { if (/^\d+$/.test(d) && D.environHas(Number(d), `VIBESPACE_DESKTOP_APP=${rid}`)) left.push(Number(d)); }
          check(`§13: nothing on the device still carries the session marker (${left.length})`, left.length === 0, left);
        }
      }
    } catch (e) { threw('§13', e); }
    finally { p12.close(); try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t12.id}`); } catch {} }
  }
  // ── §18 design 016 S1 + S2 (lanes app-guest-window + app-satellite-windows, 2026-10-03 — WeChat's Moments drawn over its
  // main window, cut at the bottom; then the owner's YES to a window per top-level). scripts/fixtures/two-windows.py maps a
  // resizable main, then — on the trigger file — a second NORMAL window (no transient-for) whose minimum is taller than the
  // default pane. S2: it opens its OWN VibeSpace window (a SATELLITE of the same session) titled "{app} · {window}", the X
  // window's size, its keys and its menu in it, its ✕ closing only it; a reload re-binds it by wid; an agent's Watch is ONE
  // picture and opens no satellite; a phone shows one window at a time; the main lost ⇒ the main window adopts the second.
  // S1 still holds where a window has no satellite (its satellite closed while it lives): the main window grows to its
  // minimum, names it, and its ✕ closes it first. The pre-fix CONTROLS are test-xpra-client §9 / §10's patched copies. ──
  console.log('§18 design 016 S1 + S2 — an app\'s second top-level opens its own window (a satellite of the same session): title, size, keys, menu, ✕, reload, Watch, phone, adopt; S1 where it has none');
  const PY18 = bin('python3');
  const gtk18 = (() => { if (!PY18) return false; try { execFileSync(PY18, ['-c', "import gi; gi.require_version('Gtk', '3.0'); from gi.repository import Gtk"], { stdio: 'ignore', timeout: 20000, env: { ...process.env, XDG_RUNTIME_DIR: RUNTIME, GDK_BACKEND: 'x11' } }); return true; } catch { return false; } })();
  if (!gtk18) skip('§18 the second-window legs', 'python3 + GTK 3 (gi) not available');
  else {
    const G = await newPage();
    const trig18 = path.join(fakeHome, 'two-trigger'), closed18 = path.join(fakeHome, 'two-closed');
    const keysOf = (k) => { try { return fs.readFileSync(`${closed18}.${k}-keys`, 'utf8'); } catch { return ''; } };
    const poke = (name) => fs.writeFileSync(trig18 + name, '1\n');
    const MIN18 = [420, 0], T1 = 'vs-two-main', T2 = 'vs-two-second', T3 = 'vs-two-third', BOTH = `${T1} · ${T2}`; // the height: from the workspace, below
    let id18 = null;
    try {
      const l = await G.p.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: PY18, args: [path.join(repo, 'scripts/fixtures/two-windows.py'), trig18, closed18, T1, T2], label: 'two-windows' }))} }).then((r) => r.json())`);
      id18 = l && l.id;
      const r18 = id18 ? await until(() => G.p.evalJs(`fetch('/api/desktop/apps/${id18}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 30000) : null;
      check('§18 the two-windows fixture reaches ready on the xpra rung', !!r18 && r18.stream === 'xpra', l);
      if (r18) {
        await G.p.evalJs(`app.openDesktopApp(${JSON.stringify(id18)}); true`);
        // the app's windows as the page holds them: the main window (its view, its client) and every SATELLITE (its pane handle)
        const S18 = `(() => { const ws = [...app.wm.windows.values()].filter((w) => w._desktopAppId === ${JSON.stringify(id18)}); const m = ws.find((w) => !w._desktopSatelliteWid); if (!m) return null; const v = m._desktopAppView, c = v && v.client; const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }; const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; const kids = (st) => [...st.children].map((e) => ({ wid: +e.dataset.wid, popup: e.classList.contains('xpra-win-popup') })); const px = (st) => { const cv = st && st.querySelector('.xpra-win-main canvas'); if (!cv || !cv.width) return null; const d = cv.getContext('2d').getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data; return [d[0], d[1], d[2]]; }; return { title: m.title, status: v.status.textContent, mode: v.mode, ratio: v.ratio, stageScale: v.stageScale, minPane: m._desktopMinPane || null, verdict: m._desktopCloseVerdict || null, viewers: m._desktopSeats ? m._desktopSeats.viewers.length : null, mainWid: c ? c.mainWid : 0, display: c ? c.display : null, slots: c ? [...c.slots].map(([wid, r]) => ({ wid, ...r })) : [], wins: c ? [...c.windows.values()].filter((x) => x.kind !== 'popup').map((x) => ({ wid: x.wid, kind: x.kind, x: x.x, y: x.y, w: x.w, h: x.h, title: x.title })) : [], mainStage: kids(v.stage), pane: box(v.pane), close: box(m.element.querySelector('.win-close')), shown: shown(m.element), taskbar: [...document.querySelectorAll('[title]')].filter((e) => !e.closest('.window')).map((e) => e.title), sats: ws.filter((w) => w._desktopSatelliteWid).map((w) => { const h = w._desktopSatellite; return { id: w.id, wid: w._desktopSatelliteWid, title: w.title, bound: !!(h && h.bound), stage: h ? kids(h.stage) : [], px: h ? px(h.stage) : null, pane: h ? box(h.pane) : null, note: h && h.note.style.display !== 'none' ? h.note.textContent : '', close: box(w.element.querySelector('.win-close')), shown: shown(w.element) }; }) }; })()`;
        const st = () => G.p.evalJs(S18).catch(() => null);
        const toasts18 = () => G.p.evalJs(`[...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent)`);
        const typeIn = async (text) => { for (const ch of text) { const k = keyOf(ch); await G.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await G.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); } };
        const s0 = await until(async () => { const s = await st(); return s && s.status === 'Connected' && s.wins.length === 1 ? s : null; }, 30000, 250);
        check(`§18 the main window connects (${s0 && s0.wins.map((x) => `${x.title} ${x.w}×${x.h}`)}), titled "${s0 && s0.title}"`, !!s0 && s0.title === T1, s0);
        if (s0) {
          // the second's minimum: taller than this pane, and a pane the WORKSPACE can hold (setMinSize caps a window's minimum there)
          const cap = await G.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id18)}); const ws = app.wm._workspaceBox(); return { ws, chrome: w.element.offsetHeight - w._desktopAppView.pane.clientHeight }; })()`);
          MIN18[1] = Math.floor(Math.min(s0.pane.h + 120, cap.ws.h - cap.chrome - 12) * s0.ratio);
          console.log(`  workspace ${JSON.stringify(cap.ws)}, chrome ${cap.chrome} CSS px ⇒ the second's minimum ${MIN18.join('×')} device px`);
          check(`§18 the default pane is SHORTER than the second's minimum (${s0.pane.h} CSS px < ${MIN18[1]} device px at ratio ${s0.ratio}) — the sizes below are not vacuous`, s0.pane.h * s0.ratio + 20 < MIN18[1], { pane: s0.pane, cap });
          fs.writeFileSync(trig18 + '.tmp', `${MIN18[0]} ${MIN18[1]}\n`); fs.renameSync(trig18 + '.tmp', trig18);
          // ── S2: its OWN window ──
          // (bound, titled, and its first picture painted — the canvas centre is no longer transparent)
          const s1 = await until(async () => { const s = await st(); return s && s.sats.length === 1 && s.sats[0].bound && s.sats[0].title === BOTH && s.sats[0].stage.length && s.sats[0].px && s.sats[0].px.some((v) => v > 0) ? s : null; }, 20000, 250) || await st();
          const sec = s1.wins.find((x) => x.wid !== s1.mainWid && x.kind === 'main'), sat = s1.sats[0], slot = sec && s1.slots.find((x) => x.wid === sec.wid);
          console.log(`  second ${JSON.stringify(sec)} in slot ${JSON.stringify(slot)}; root ${JSON.stringify(s1.display)}; satellite "${sat && sat.title}" pane ${sat && sat.pane && `${sat.pane.w}×${sat.pane.h}`} at ratio ${s1.ratio}; pixel ${JSON.stringify(sat && sat.px)}; main "${s1.title}"`);
          check(`§18 S2: the second top-level opens its OWN VibeSpace window titled "${sat && sat.title}" with its own taskbar entry; the main window keeps "${s1.title}"`, !!sat && sat.title === BOTH && s1.title === T1 && s1.taskbar.includes(BOTH) && s1.taskbar.includes(T1), { sats: s1.sats, taskbar: s1.taskbar });
          check('§18 S2: the satellite draws the second (its own colour at its centre) and the main pane does not', !!sec && sat.stage.some((x) => x.wid === sec.wid) && !s1.mainStage.some((x) => x.wid === sec.wid) && s1.mainStage.some((x) => x.wid === s1.mainWid) && !!sat.px && Math.abs(sat.px[0] - 242) <= 14 && Math.abs(sat.px[1] - 214) <= 14 && Math.abs(sat.px[2] - 214) <= 14, { sat, mainStage: s1.mainStage });
          check(`§18 S2: the second lies in its own SLOT of the root, to the right of the main (x ${sec && sec.x} ≥ ${s1.wins.find((x) => x.wid === s1.mainWid).w}), and the root holds both (${JSON.stringify(s1.display)})`, !!sec && !!slot && sec.x === slot.x && sec.y === slot.y && sec.x >= s1.wins.find((x) => x.wid === s1.mainWid).w && s1.display.width >= sec.x + sec.w, { sec, slot });
          { // the X root itself, read on the app's display (xwininfo with its Xauthority): the size the slots asked, the corrals
            const xenv18 = { ...process.env, DISPLAY: r18.display, XAUTHORITY: path.join(wt, 'data', 'desktop-apps', id18, 'Xauthority') };
            let root = '', tree = '';
            try { root = (execFileSync('xwininfo', ['-root'], { env: xenv18, encoding: 'utf8', timeout: 5000 }).match(/-geometry\s+(\S+)/) || [])[1] || ''; } catch (e) { root = 'xwininfo failed: ' + e.message; }
            try { tree = execFileSync('xwininfo', ['-root', '-tree'], { env: xenv18, encoding: 'utf8', timeout: 5000 }).split('\n').filter((x) => /vs-two|Corral/.test(x)).map((x) => x.trim().replace(/\s+/g, ' ')).join(' | '); } catch {}
            console.log(`  X root ${root}; ${tree}`);
          }
          // X reports the corral's place only after the window's first paint (a read before it says 0,0 — a race, never the bug):
          // wait for the agreement until XAGREE_DEADLINE_MS; a slot X never takes fails there (the last read is what is judged)
          let xs = null;
          await until(async () => { const xw18 = await G.p.evalJs(`fetch('/api/desktop/apps/${id18}/windows').then((r) => r.json())`).catch(() => null); xs = xw18 && Array.isArray(xw18.windows) ? xw18.windows.find((x) => x.title === T2) : null; return !!xs && Math.abs(xs.x - sec.x) <= 2 && Math.abs(xs.y - sec.y) <= 2; }, XAGREE_DEADLINE_MS, 200);
          if (xs && Number.isFinite(xs.x)) check(`§18 S2: …and the X server agrees (${xs.x},${xs.y})`, Math.abs(xs.x - sec.x) <= 2 && Math.abs(xs.y - sec.y) <= 2, { xs, sec });
          check(`§18 S2: the satellite holds the X window 1:1 (pane ${sat.pane.w}×${sat.pane.h} CSS × ${s1.ratio} = ${sec.w}×${sec.h} ± 2 device px, never below the minimum ${MIN18[1]})`, Math.abs(sat.pane.w * s1.ratio - sec.w) <= 2 && Math.abs(sat.pane.h * s1.ratio - sec.h) <= 2 && sec.h >= MIN18[1], { pane: sat.pane, sec });
          check(`§18 S2: ONE connection — the app still has one viewer socket from this page (${s1.viewers})`, s1.viewers === 1, s1.viewers);
          // ── typing reaches ITS window ──
          await trustedClickAt(G.p, sat.pane.x + sat.pane.w / 2, sat.pane.y + sat.pane.h / 2);
          await sleep(400);
          await typeIn('s2');
          const typed2 = await until(() => keysOf('second').includes('s2'), 8000, 200);
          check(`§18 S2: typing in the satellite reaches ITS window (the second logged ${JSON.stringify(keysOf('second'))}, the main ${JSON.stringify(keysOf('main'))})`, !!typed2 && !keysOf('main').includes('s'));
          await trustedClickAt(G.p, s1.pane.x + 20, s1.pane.y + 40);
          await sleep(400);
          await typeIn('m1');
          const typed1 = await until(() => keysOf('main').includes('m1'), 8000, 200);
          check(`§18 S2: …and typing in the main window reaches the main again (${JSON.stringify(keysOf('main'))}; the second ${JSON.stringify(keysOf('second'))})`, !!typed1 && !keysOf('second').includes('m'));
          // ── a menu opened in it is drawn in it ──
          const menuUp = async () => { const s = await st(); return s && s.sats[0] && s.sats[0].stage.some((x) => x.popup) ? s : null; };
          await trustedClickAt(G.p, sat.pane.x + 60, sat.pane.y + 60, 0, 'right');
          let m2 = await until(menuUp, 5000, 200);
          if (!m2) { console.log('  (no menu 5 s after the first right-click — pressed once more)'); await trustedClickAt(G.p, sat.pane.x + 70, sat.pane.y + 70, 0, 'right'); m2 = await until(menuUp, 6000, 200); }
          m2 = m2 || await st();
          check(`§18 S2: the app's menu opened in the satellite (a right-click popup) is drawn IN it, not in the main pane (${JSON.stringify(m2 && m2.sats[0] && m2.sats[0].stage)})`, !!m2 && m2.sats[0].stage.some((x) => x.popup) && !m2.mainStage.some((x) => x.popup), m2 && { sat: m2.sats[0].stage, main: m2.mainStage });
          await G.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await G.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await until(async () => { const s = await st(); return s && s.sats[0] && !s.sats[0].stage.some((x) => x.popup) ? s : null; }, 5000, 200);
          // ── a reload re-binds it by wid ──
          await sleep(3000); // the layout autosave carries the satellite
          await openPage(G.p, `http://127.0.0.1:${PORT}`);
          const r3 = await until(async () => { const s = await st(); return s && s.status === 'Connected' && s.sats.length === 1 && s.sats[0].bound && s.sats[0].stage.length ? s : null; }, 30000, 300) || await st();
          check(`§18 S2: a reload REPLAYS the satellite from the layout (the same window ${sat.id}) and re-binds it by wid ${sec.wid} — one window for the second, bound, titled, drawing it`, !!r3 && r3.sats.length === 1 && r3.sats[0].id === sat.id && r3.sats[0].wid === sec.wid && r3.sats[0].bound && r3.sats[0].title === BOTH && r3.sats[0].stage.some((x) => x.wid === sec.wid), r3 && r3.sats);
          // ── an AGENT drives: Watch is ONE picture, and opens no satellite ──
          if (!fs.existsSync(FAKE_CLAUDE)) skip('§18 the Watch leg', 'no fake claude');
          else {
            const wsA = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
            const msgs = []; wsA.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
            await new Promise((r, e) => { wsA.on('open', r); wsA.on('error', e); });
            wsA.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: fakeHome, cols: 80, rows: 24, reqId: 'x18', name: 'x18-agent' }));
            const created = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'x18'), 20000, 100);
            const token = created && await until(() => { for (const f of fs.readdirSync(path.join(wt, 'data', 'session-meta'))) { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', f), 'utf8')); if (j.agentToken && j.webuiSessionId === created.sessionId) return j.agentToken; } catch {} } return null; }, 10000, 200);
            if (token) agentTokens.push(token);
            wsA.close();
            const agent = (verb, body) => fetch(`http://127.0.0.1:${PORT}/api/agent/window/${verb}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
            if (token) await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${id18}/reach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal: { kind: 'session', id: created.sessionId } }) });
            const at = token ? await agent('attach', { handle: id18 }) : null;
            check(`§18 the agent attaches to the app (lease ${at && at.j && at.j.lease && at.j.lease.input})`, !!at && at.status === 200 && at.j.lease && at.j.lease.input === 'agent', at);
            const w5 = await until(async () => { const s = await st(); return s && s.mode === 'watch' && s.mainStage.some((x) => x.wid === sec.wid) ? s : null; }, 15000, 250) || await st();
            check(`§18 S2: an agent drives ⇒ Watch is ONE picture — the main pane draws both windows, scaled to fit (${w5 && w5.stageScale}), the satellite says where its window went ("${w5 && w5.sats[0] && w5.sats[0].note}")`, !!w5 && w5.mode === 'watch' && w5.mainStage.some((x) => x.wid === sec.wid) && w5.mainStage.some((x) => x.wid === w5.mainWid) && w5.stageScale < 1 && !w5.sats[0].stage.length && /main window while an agent drives/.test(w5.sats[0].note), w5);
            poke('.third');
            await until(async () => { const s = await st(); return s && s.wins.some((x) => x.title === T3) ? s : null; }, 10000, 200);
            await sleep(1500);
            const w6 = await st();
            const third = w6 && w6.wins.find((x) => x.title === T3);
            check(`§18 S2: a window the app opens during Watch opens NO satellite — it is drawn in the one picture (${w6 && w6.sats.length} satellite(s))`, !!third && w6.sats.length === 1 && w6.mainStage.some((x) => x.wid === third.wid), w6);
            const dt = token ? await agent('detach', { handle: id18 }) : null;
            const w7 = await until(async () => { const s = await st(); return s && s.mode === 'active' && s.sats.length === 2 && s.sats.every((x) => x.bound && x.stage.length) ? s : null; }, 15000, 250) || await st();
            check(`§18 S2: the agent detaches (${dt && dt.status}) ⇒ active again — the second back in its satellite, and the third (opened during Watch) gets its own now`, !!w7 && w7.mode === 'active' && w7.sats.length === 2 && !!third && w7.sats.some((x) => x.wid === third.wid && x.title === `${T1} · ${T3}`) && w7.sats.some((x) => x.wid === sec.wid && x.stage.some((y) => y.wid === sec.wid)), w7 && w7.sats);
            const s3sat = w7 && w7.sats.find((x) => third && x.wid === third.wid);
            if (s3sat) {
              await trustedClickAt(G.p, s3sat.close.x + s3sat.close.w / 2, s3sat.close.y + s3sat.close.h / 2);
              const w8 = await until(async () => { const s = await st(); return s && s.sats.length === 1 && !s.wins.some((x) => x.title === T3) ? s : null; }, 10000, 200) || await st();
              check('§18 S2: the third\'s ✕ closes the third alone (its X window gone, its satellite gone; the second and the main stay)', !!w8 && w8.sats.length === 1 && w8.sats[0].wid === sec.wid && !w8.wins.some((x) => x.title === T3), w8 && { sats: w8.sats, wins: w8.wins });
            }
          }
          // ── a phone (390 px): one window at a time ──
          await G.p.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await sleep(1000);
          const satId = (await st()).sats[0].id, mainId = await G.p.evalJs(`[...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id18)} && !w._desktopSatelliteWid).id`);
          await G.p.evalJs(`app.wm.revealWindow(${JSON.stringify(satId)}); true`);
          const ph1 = await until(async () => { const s = await st(); return s && s.sats[0] && s.sats[0].shown && !s.shown ? s : null; }, 5000, 200) || await st();
          await G.p.evalJs(`app.wm.revealWindow(${JSON.stringify(mainId)}); true`);
          const ph2 = await until(async () => { const s = await st(); return s && s.shown && s.sats[0] && !s.sats[0].shown ? s : null; }, 5000, 200) || await st();
          check(`§18 S2: a phone (390 px) shows ONE window at a time — the satellite alone (${ph1 && ph1.sats[0] && ph1.sats[0].shown}/${ph1 && ph1.shown}), then the main alone (${ph2 && ph2.shown}/${ph2 && ph2.sats[0] && ph2.sats[0].shown})`, !!ph1 && ph1.sats[0].shown && !ph1.shown && !!ph2 && ph2.shown && !ph2.sats[0].shown, { ph1: ph1 && { main: ph1.shown, sat: ph1.sats[0] && ph1.sats[0].shown }, ph2: ph2 && { main: ph2.shown, sat: ph2.sats[0] && ph2.sats[0].shown } });
          await G.p.cdp('Emulation.clearDeviceMetricsOverride', {});
          await sleep(1500);
          // ── its ✕ closes only it ──
          const c8 = await until(async () => { const s = await st(); return s && s.sats.length === 1 && s.sats[0].bound && s.sats[0].close && s.sats[0].close.w > 0 ? s : null; }, 8000, 200) || await st();
          const s8 = c8.sats[0];
          await G.p.evalJs(`(() => { window.__v18 = []; const w = app.wm.windows.get(${JSON.stringify(s8.id)}); const orig = w.onCloseRequest; w.onCloseRequest = () => { const r = orig(); window.__v18.push(w._desktopCloseVerdict); return r; }; app.wm.focusWindow(w.id); return true; })()`);
          await trustedClickAt(G.p, s8.close.x + s8.close.w / 2, s8.close.y + s8.close.h / 2);
          const gone8 = await until(() => fs.existsSync(closed18), 10000, 200);
          const c9 = await until(async () => { const s = await st(); return s && s.sats.length === 0 && s.wins.length === 1 ? s : null; }, 10000, 200) || await st();
          const v8 = await G.p.evalJs('window.__v18 || []'), rec9 = await G.p.evalJs(`fetch('/api/desktop/apps/${id18}').then((r) => r.json())`), t9 = await toasts18();
          check(`§18 S2: the satellite's ✕ asks the app to close THAT window (${JSON.stringify(v8)}) — it closes (CLOSED ${!!gone8}), its window goes, "${T2} closed" said (it was in front); the main window and the app stay (${rec9 && rec9.state})`, !!gone8 && v8.some((v) => v && v.act === 'ask-window') && !!c9 && c9.sats.length === 0 && c9.title === T1 && rec9.state === 'ready' && t9.some((x) => x.includes(`${T2} closed`)), { v8, c9: c9 && { sats: c9.sats, title: c9.title }, t9 });
          // ── S1 where a window has NO satellite: its satellite closed while it lives (a layout removal) ──
          fs.rmSync(closed18, { force: true });
          poke('.again');
          const c10 = await until(async () => { const s = await st(); return s && s.sats.length === 1 && s.sats[0].bound && s.sats[0].stage.length ? s : null; }, 15000, 250) || await st();
          check('§18 S2: the app opening its second window again opens a new satellite', !!c10 && c10.sats.length === 1 && c10.sats[0].bound, c10 && c10.sats);
          const sec2 = c10 && c10.wins.find((x) => x.wid !== c10.mainWid);
          if (c10 && c10.sats.length === 1 && sec2) {
            await G.p.evalJs(`app.wm.closeWindow(${JSON.stringify(c10.sats[0].id)}); true`);
            const c11 = await until(async () => { const s = await st(); return s && s.sats.length === 0 && s.mainStage.some((x) => x.wid === sec2.wid) && s.title === BOTH && s.minPane && s.minPane.h * s.ratio >= MIN18[1] ? s : null; }, 10000, 200) || await st();
            check(`§18 S1 where a window has no satellite: back in the main pane (${JSON.stringify(c11 && c11.mainStage)}), the main window titled "${c11 && c11.title}" (S1c) and grown to hold its minimum (${JSON.stringify(c11 && c11.minPane)}, S1a)`, !!c11 && c11.sats.length === 0 && c11.mainStage.some((x) => x.wid === sec2.wid) && c11.title === BOTH && !!c11.minPane && c11.minPane.h * c11.ratio >= MIN18[1], c11);
            await trustedClickAt(G.p, c11.close.x + c11.close.w / 2, c11.close.y + c11.close.h / 2);
            const gone11 = await until(() => fs.existsSync(closed18), 10000, 200);
            const c12 = await until(async () => { const s = await st(); return s && s.wins.length === 1 && s.title === T1 ? s : null; }, 10000, 200) || await st();
            check(`§18 S1d: …and the main window's ✕ with it in front decides ask-front (${JSON.stringify(c12 && c12.verdict)}) — only that window closes (CLOSED ${!!gone11}), the main window stays`, !!c12 && !!c12.verdict && c12.verdict.act === 'ask-front' && !!gone11 && c12.title === T1, c12);
          }
          // ── the main lost: the main window ADOPTS the second ──
          fs.rmSync(closed18, { force: true });
          poke('.again');
          const c13 = await until(async () => { const s = await st(); return s && s.sats.length === 1 && s.sats[0].bound ? s : null; }, 15000, 250) || await st();
          const sec3 = c13 && c13.wins.find((x) => x.wid !== c13.mainWid);
          poke('.dropmain');
          const c14 = await until(async () => { const s = await st(); return s && s.sats.length === 0 && s.wins.length === 1 && s.title === T2 ? s : null; }, 15000, 200) || await st();
          const rec14 = await G.p.evalJs(`fetch('/api/desktop/apps/${id18}').then((r) => r.json())`);
          check(`§18 S2: the app drops its MAIN window ⇒ the main VibeSpace window ADOPTS the second (titled "${c14 && c14.title}", drawing it), its satellite closes, the app keeps running (${rec14 && rec14.state})`, !!c14 && !!sec3 && c14.sats.length === 0 && c14.mainWid === sec3.wid && c14.mainStage.some((x) => x.wid === sec3.wid) && c14.title === T2 && rec14.state === 'ready', c14);
        }
      }
    } catch (e) { threw('§18', e); }
    finally {
      if (id18) await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${id18}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) }).catch(() => {});
      await dropPage(G);
    }
  }
} catch (e) {
  crashed(e, p1);
} finally {
  p1.close();
}
finish();
