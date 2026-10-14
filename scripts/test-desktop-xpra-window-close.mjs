#!/usr/bin/env node
// THE XPRA WINDOW CLOSES WITH ITS APP — §10 (round 3, A2), on the real rung against a worktree server
// (a part of the test-desktop-xpra-window family — lane xpra-window-split, design q-038 ②: the giant split by § so the
// self-hosted desktop batch's floor is its longest part; every § keeps its number; the other parts are named below)
// The family: -open (§1–§4, §5, Stop, §8, §9, §13, §18) · -hidpi (§6, §11) · -hidpi-r2 (§7) · -close (§10) ·
// -scale (§14, §15, §16) · -seamless (§12, §17).
//   • §10 (round 3, A2 — §3.2) THE CLOSE: the calculator's own ✕ ⇒ the VibeSpace
//     window gone on TWO clients with a toast, ON the keeper's exited broadcast
//     (≤ EXIT_CENSUS_MS after the app's exit — lane exit-close-cadence); the outer ✕ ⇒
//     close-window ⇒ the app process gone; an app that answers with its own
//     dialog keeps everything, a second ✕ within 5 s = Stop; a blocked pane's ✕
//     never asks the app; a dead record replayed from the layout never paints;
//     CONTROL = a copy whose window never closes itself (the dead picture).
// The boot (the worktree server on the real xpra rung, headless chrome, §5's fake claude, the private runtime dir) and the
// teardown are scripts/xpra-window-boot.mjs's, ONCE for this part; the measures the §§ share live there too.
// Run: node scripts/test-desktop-xpra-window-close.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { freePorts, scratch, scratchHome } from './scratch.mjs';
import { bootXpraWindow } from './xpra-window-boot.mjs';

const { bin, bootedCopy, CDP_PORT, check, crashed, ctlServers, D, dropPage, ensureActive, fakeHome, finish, launchOn, mkPage, openPage, page, PORT,
  R2, reach7, readyOn, rebaseline, repo, revealBars, SEAT, sizeWinOn, skip, sleep, spawnCopy, srvEnv, target, threw, trustedClickAt, until, VNC_ENV,
  WIN, worktrees, wt, XTERM } = await bootXpraWindow('test-desktop-xpra-window-close');
let p1 = await page(target);
try {
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  check('the loopback page is a SECURE context (the API branch can be proven here)', await p1.evalJs('window.isSecureContext === true'));
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check(`the default ladder picks xpra on this box (${JSON.stringify(av.availability)})`, av.availability?.backend === 'xpra' && av.availability?.stream === 'xpra', av.availability);

  // ── §10 ROUND 3, LANE A2 (docs/design-desktop-apps-seamless §3.2): THE APP'S EXIT CLOSES THE WINDOW; THE OUTER ✕ IS THE
  // APP'S OWN CLOSE. Two clients on the real rung (GNOME Calculator on xpra): the calculator's OWN ✕ (its CSD header bar,
  // clicked through the pane) ⇒ the VibeSpace window is gone on BOTH pages, each with a "<app> exited" toast — on the EVENT
  // chain (lane exit-close-cadence, B-8778): the app process gone → the keeper's exited broadcast on each page within
  // EXIT_CENSUS_MS (its census the only wait — it used to wait out the teardown: 4 s when GLib had autolaunched a bus) →
  // each window closed ON that broadcast;
  // the OUTER ✕ (the title bar's, a trusted click) ⇒ close-window to the app ⇒ the calculator process is gone and both
  // windows with it; a Tk app that answers WM_DELETE_WINDOW with its own "Save?" dialog ⇒ the window STAYS (a dialog is
  // not the app), the dialog closing is not the app exiting, a SECOND ✕ within 5 s ⇒ Stop ⇒ gone on both; a dead record
  // replayed from the layout opens NO window (never painted); CONTROL = a copy of this tree whose window never closes
  // itself — the same ✕ leaves the dead picture (M3c's measurement, today's behaviour before A2) ──
  console.log('§10 A2 — the app exiting closes the window on every client; the outer ✕ asks the app; twice = Stop; a dead record opens nothing');
  const CALC10 = bin('gnome-calculator'), WISH10 = bin('wish');
  if (!CALC10) skip('§10 the close legs', 'gnome-calculator not on PATH');
  else {
    // p1 (and every page before) steps aside: the replay leg needs a moment with NO client, and a third client would only race the layout
    await p1.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
    const O10 = `http://127.0.0.1:${PORT}`;
    const A = await mkPage(O10, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
    const B = await mkPage(O10, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
    const has = (P, id) => P.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`);
    const toasts = (P) => P.evalJs(`[...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent)`);
    const verdictOf = (P, id, k) => P.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); return w ? w[${JSON.stringify(k)}] || null : 'gone'; })()`);
    /** both pages hold the app's window; A is the active viewer, B is blocked (x5) */
    const openOnBoth = async (id) => {
      await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
      await ensureActive(A.p, id);
      await sizeWinOn(A.p, id, 560, 760);
      const up = await until(async () => { const v = await A.p.evalJs(R2(id)); return v && v.status === 'Connected' && v.main && v.main.h > 100 ? v : null; }, 40000, 300);
      const onB = await until(() => has(B.p, id), 15000, 250); if (!onB) await B.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
      await until(() => has(B.p, id), 5000, 100);
      return up;
    };
    /** poll BOTH pages every 25 ms from `t0` until the window is gone on each; ms per page (null = still there at the deadline) */
    const goneTimes = async (id, t0, ms = 6000) => {
      const out = { a: null, b: null };
      const end = t0 + ms;
      while (Date.now() < end && (out.a === null || out.b === null)) {
        if (out.a === null && !(await has(A.p, id))) out.a = Date.now() - t0;
        if (out.b === null && !(await has(B.p, id))) out.b = Date.now() - t0;
        await sleep(25);
      }
      return out;
    };
    // lane exit-close-cadence (B-8778): the EVENT chain of an app's exit, never an absolute bound — each page stamps the
    // FIRST desktop-apps-updated carrying the record exited (the keeper's commit) and whether its window was still there one
    // task later; this process stamps the app process gone (the keeper's exit event: the server reaps its child)
    const { EXIT_CENSUS_MS } = (await import('../src/desktop-serve.js')).default;
    const armExitCast = (P, id) => P.evalJs(`(() => { const id = ${JSON.stringify(id)}; const seen = (window.__vsExitCast = window.__vsExitCast || {}); const off = app.ws.onGlobal((m) => { const r = m.type === 'desktop-apps-updated' && (m.apps || []).find((a) => a.id === id); if (!r || r.state !== 'exited' || seen[id]) return; seen[id] = { at: Date.now() }; off(); setTimeout(() => { seen[id].leftAfter = !![...app.wm.windows.values()].find((w) => w._desktopAppId === id); }, 0); }); return true; })()`);
    const pidGoneAt = (pid, ms = 6000) => until(() => (!D.pidAlive(pid) ? Date.now() : null), ms, 10);
    const exitChain = async (id, exitAt) => {
      const [a, b] = [await A.p.evalJs(`(window.__vsExitCast || {})[${JSON.stringify(id)}] || null`), await B.p.evalJs(`(window.__vsExitCast || {})[${JSON.stringify(id)}] || null`)];
      const ms = (c) => (c && exitAt ? c.at - exitAt : null);
      return { ok: !!exitAt && !!a && !!b && ms(a) <= EXIT_CENSUS_MS && ms(b) <= EXIT_CENSUS_MS && a.leftAfter === false && b.leftAfter === false, castA: ms(a), castB: ms(b), leftA: a && a.leftAfter, leftB: b && b.leftAfter, EXIT_CENSUS_MS };
    };
    const chainSay = (c) => `the exited broadcast on A ${c.castA} ms / B ${c.castB} ms after the app's exit (≤ EXIT_CENSUS_MS ${c.EXIT_CENSUS_MS}), each window closed ON it (still there one task later: A ${c.leftA}, B ${c.leftB})`;
    const titleClose = async (P, id) => { await revealBars(P, id); const r = await P.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.focusWindow(w.id); const b = w.element.querySelector('.win-close').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`); await trustedClickAt(P, r.x, r.y); };
    const ids10 = [];
    try {
      // (1) the calculator's OWN ✕ — clicked on its CSD header bar through the pane (M3c: top-right, 22 px in)
      const l1 = await launchOn(A.p, { exec: CALC10, args: [], label: 'vs-calc-a2' });
      const r1 = l1 && l1.id && await readyOn(A.p, l1.id);
      check('§10: GNOME Calculator reaches ready on the xpra rung', !!r1 && r1.backend === 'xpra', l1);
      if (r1) {
        ids10.push(r1.id);
        const up = await openOnBoth(r1.id);
        check('§10 (1): the calculator is drawn on page A (active) and its window replayed on page B', !!up && await has(B.p, r1.id), up);
        await sleep(1200);
        const v = await A.p.evalJs(R2(r1.id));
        const cx = v.pane.x + (v.main.x + v.main.w) / v.ratio - 22, cy = v.pane.y + v.main.y / v.ratio + 22;
        await armExitCast(A.p, r1.id); await armExitCast(B.p, r1.id);
        const t0 = Date.now();
        const exitP = pidGoneAt(r1.pids.app);
        await trustedClickAt(A.p, cx, cy);
        const [g, exitAt] = await Promise.all([goneTimes(r1.id, t0), exitP]);
        const ch1 = await exitChain(r1.id, exitAt);
        const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r1.id}').then((r) => r.json())`);
        const tA = await toasts(A.p), tB = await toasts(B.p);
        console.log(`  §10 (1): the calculator's own ✕ ⇒ the app process gone after ${exitAt ? exitAt - t0 : null} ms; ${chainSay(ch1)}; the VibeSpace window gone on A after ${g.a} ms, on B after ${g.b} ms; record ${recEnd.state} (code ${recEnd.exitCode}, windowsAtExit ${recEnd.windowsAtExit}); toasts A ${JSON.stringify(tA)} B ${JSON.stringify(tB)}`);
        check(`§10 (1): the calculator's OWN ✕ ⇒ the record exited with no window left (windowsAtExit ${recEnd.windowsAtExit}) and the VibeSpace window is GONE on BOTH clients (A ${g.a} ms, B ${g.b} ms)`, recEnd.state === 'exited' && recEnd.windowsAtExit === 0 && g.a !== null && g.b !== null, { g, recEnd: { state: recEnd.state, windowsAtExit: recEnd.windowsAtExit, lastError: recEnd.lastError } });
        check(`§10 (1): …on the EVENT chain — ${chainSay(ch1)}`, ch1.ok, ch1);
        check('§10 (1): …each client said why in a toast ("Calculator exited")', tA.some((x) => /Calculator exited/.test(x)) && tB.some((x) => /Calculator exited/.test(x)), { tA, tB });
      }
      // (2) the OUTER ✕ (the title bar's, a trusted click on the ACTIVE pane) ⇒ close-window ⇒ the calculator quits ⇒ gone on both
      const l2 = await launchOn(A.p, { exec: CALC10, args: [], label: 'vs-calc-a2-outer' });
      const r2 = l2 && l2.id && await readyOn(A.p, l2.id);
      if (r2) {
        ids10.push(r2.id);
        await openOnBoth(r2.id);
        await sleep(1200);
        await revealBars(A.p, r2.id); // lane B: the calculator is seamless — the ✕ is revealed first; the clock starts at the click
        await armExitCast(A.p, r2.id); await armExitCast(B.p, r2.id);
        const t0 = Date.now();
        const exitP = pidGoneAt(r2.pids.app);
        await titleClose(A.p, r2.id);
        const vd = await verdictOf(A.p, r2.id, '_desktopCloseVerdict');
        const [g, exitAt] = await Promise.all([goneTimes(r2.id, t0), exitP]);
        const appGone = exitAt ? exitAt - t0 : null;
        const ch2 = await exitChain(r2.id, exitAt);
        const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r2.id}').then((r) => r.json())`);
        console.log(`  §10 (2): the outer ✕ ⇒ verdict ${JSON.stringify(vd)}; the calculator process (pid ${r2.pids.app}) gone after ${appGone} ms; ${chainSay(ch2)}; the window gone on A after ${g.a} ms, on B after ${g.b} ms; record ${recEnd.state}, stoppedBy ${recEnd.stoppedBy || '-'}`);
        check(`§10 (2): the OUTER ✕ on the active pane ASKS the app (verdict ask-app, the window did not close itself at the click) and the calculator PROCESS is gone (${appGone} ms) — an app exit, not a Stop (stoppedBy ${recEnd.stoppedBy || 'none'})`, (vd === 'gone' || (vd && vd.act === 'ask-app')) && appGone !== null && recEnd.state === 'exited' && !recEnd.stoppedBy && recEnd.windowsAtExit === 0, { vd, recEnd: { state: recEnd.state, stoppedBy: recEnd.stoppedBy, windowsAtExit: recEnd.windowsAtExit } });
        check(`§10 (2): …and the window is gone on BOTH clients (A ${g.a} ms, B ${g.b} ms after the ✕) on the EVENT chain — ${chainSay(ch2)}`, g.a !== null && g.b !== null && ch2.ok, { g, ch2 });
      }
      // (3) an app that answers WM_DELETE_WINDOW with its OWN dialog (Tk: `wm protocol . WM_DELETE_WINDOW` opens "Save?",
      // which closes itself after 1 s): the first ✕ keeps everything, the dialog closing is not the app exiting, a second ✕
      // within 5 s is the Stop
      if (!WISH10) skip('§10 (3) the second ✕', 'wish (Tk) not on PATH');
      else {
        const tk = path.join(fakeHome, 'vs-a2-save.tcl');
        fs.writeFileSync(tk, 'wm title . "vs-a2-tk"\nwm geometry . 420x300\nlabel .l -text "unsaved work"\npack .l -expand 1\nwm protocol . WM_DELETE_WINDOW {\n  if {![winfo exists .d]} { toplevel .d; wm title .d "Save?"; label .d.l -text "Save changes?"; pack .d.l -padx 20 -pady 20; wm transient .d .; after 1000 {destroy .d} }\n}\n');
        const l3 = await launchOn(A.p, { exec: WISH10, args: [tk], label: 'vs-a2-tk' });
        const r3 = l3 && l3.id && await readyOn(A.p, l3.id);
        check('§10 (3): the Tk stand-in (answers WM_DELETE_WINDOW with its own "Save?" dialog) reaches ready', !!r3, l3);
        if (r3) {
          ids10.push(r3.id);
          await openOnBoth(r3.id);
          await sleep(1000);
          const firstAt = Date.now();
          await titleClose(A.p, r3.id);
          const dlg = await until(async () => { const v = await A.p.evalJs(WIN(r3.id)); return v && v.windows.some((w) => w.kind === 'dialog' || /Save\?/.test(w.title || '')) ? v : null; }, 4000, 50);
          const tA = await toasts(A.p);
          check('§10 (3): the first ✕ ⇒ the APP answers with its own "Save?" dialog (drawn in the pane) and the VibeSpace window stays on both pages, with the toast naming the second ✕', !!dlg && await has(A.p, r3.id) && await has(B.p, r3.id) && tA.some((x) => /press ✕ again within 5 s to stop it/.test(x)), { dlg: dlg && dlg.windows, tA });
          // the dialog closes by itself (after 1 s): a lost DIALOG is not the app exiting
          const dlgGone = await until(async () => { const v = await A.p.evalJs(WIN(r3.id)); return v && !v.windows.some((w) => /Save\?/.test(w.title || '') || w.kind === 'dialog') ? v : null; }, 4000, 50);
          await sleep(300);
          const mid = await A.p.evalJs(`fetch('/api/desktop/apps/${r3.id}').then((r) => r.json())`);
          check('§10 (3): the dialog closing is NOT the app exiting — the record stays ready, the window stays on both pages', !!dlgGone && mid.state === 'ready' && await has(A.p, r3.id) && await has(B.p, r3.id), { mid: mid.state, dlgGone: !!dlgGone });
          // the SECOND ✕ within 5 s of the first ⇒ Stop ⇒ gone on both
          const t0 = Date.now();
          await titleClose(A.p, r3.id);
          const g = await goneTimes(r3.id, t0, 8000);
          const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r3.id}').then((r) => r.json())`);
          const tA2 = await toasts(A.p), tB2 = await toasts(B.p);
          console.log(`  §10 (3): the second ✕ ${t0 - firstAt} ms after the first ⇒ record ${recEnd.state} stoppedBy ${recEnd.stoppedBy}; gone on A after ${g.a} ms, on B after ${g.b} ms; toasts A ${JSON.stringify(tA2)} B ${JSON.stringify(tB2)}`);
          check(`§10 (3): a SECOND ✕ ${t0 - firstAt} ms after the first (within 5 s) ⇒ Stop (stoppedBy ${recEnd.stoppedBy}) ⇒ the window gone on BOTH clients (A ${g.a} ms, B ${g.b} ms) with "vs-a2-tk stopped"`, t0 - firstAt < 5000 && recEnd.state === 'exited' && recEnd.stoppedBy === 'user' && g.a !== null && g.b !== null && tA2.some((x) => /vs-a2-tk stopped/.test(x)) && tB2.some((x) => /vs-a2-tk stopped/.test(x)), { g, recEnd: { state: recEnd.state, stoppedBy: recEnd.stoppedBy }, tA2, tB2 });
          check('§10 (3): Stop left nothing of the Tk app running', [r3.pids.x, r3.pids.server, r3.pids.app].every((p) => !D.pidAlive(p)));
        }
      }
      // (3b) desktop A r1 — xterm, an app with NO client-side decorations, on the OUTER ✕ (the verifier's attack). xterm honours
      // WM_DELETE_WINDOW by HANGING UP its child (SIGHUP to the shell) and exits when the child does. Measured 2026-09-24: an
      // interactive bash exits on the hangup ⇒ the first ✕ ends xterm; a child that survives SIGHUP keeps xterm running, and
      // the second ✕ within 5 s (the toast names it) is the Stop. The verifier's plain `xterm` ran $SHELL = zsh in a HOME with no
      // .zshrc — zsh's first-run menu survives SIGHUP (by hand on Xvfb: the same xterm exits once the HOME has an empty .zshrc);
      // it was never xterm ignoring the ✕. The stand-in here is DETERMINISTIC: a shell loop with SIGHUP ignored.
      const BASH10 = bin('bash'), SH10 = bin('sh');
      if (!XTERM || !BASH10) skip('§10 (3b) the xterm legs', 'xterm / bash not on PATH');
      else {
        const l5 = await launchOn(A.p, { exec: XTERM, args: ['-T', 'vs-a2-xterm-bash', '-geometry', '60x10', '-e', BASH10, '--norc', '-i'], label: 'vs-a2-xterm-bash' });
        const r5 = l5 && l5.id && await readyOn(A.p, l5.id);
        check('§10 (3b): xterm running an interactive bash reaches ready', !!r5, l5);
        if (r5) {
          ids10.push(r5.id);
          await openOnBoth(r5.id);
          await sleep(1000);
          const t0 = Date.now();
          await titleClose(A.p, r5.id);
          const vd = await verdictOf(A.p, r5.id, '_desktopCloseVerdict');
          const g = await goneTimes(r5.id, t0, 6000);
          const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r5.id}').then((r) => r.json())`);
          console.log(`  §10 (3b): xterm + interactive bash, the outer ✕ ⇒ verdict ${JSON.stringify(vd)}; record ${recEnd.state} stoppedBy ${recEnd.stoppedBy || '-'}; gone on A after ${g.a} ms, on B after ${g.b} ms`);
          check(`§10 (3b): the OUTER ✕ ends an xterm with an interactive bash by itself (ask-app ⇒ xterm hangs up its shell ⇒ exits: ${recEnd.state}, not a Stop) and the window is gone on BOTH clients within 3 s (A ${g.a} ms, B ${g.b} ms)`, (vd === 'gone' || (vd && vd.act === 'ask-app')) && recEnd.state === 'exited' && !recEnd.stoppedBy && g.a !== null && g.b !== null && g.a <= 3000 && g.b <= 3000 && !D.pidAlive(r5.pids.app), { vd, recEnd: { state: recEnd.state, stoppedBy: recEnd.stoppedBy }, g });
        }
        if (!SH10) skip('§10 (3b) the hangup-proof leg', 'sh not on PATH');
        else {
          const l6 = await launchOn(A.p, { exec: XTERM, args: ['-T', 'vs-a2-xterm-nohup', '-geometry', '60x10', '-e', SH10, '-c', 'trap "" HUP; while :; do sleep 1; done'], label: 'vs-a2-xterm-nohup' });
          const r6 = l6 && l6.id && await readyOn(A.p, l6.id);
          check('§10 (3b): xterm running a child that ignores SIGHUP (the stand-in for zsh\'s first-run menu) reaches ready', !!r6, l6);
          if (r6) {
            ids10.push(r6.id);
            await openOnBoth(r6.id);
            await sleep(1500);
            const firstAt = Date.now();
            await titleClose(A.p, r6.id);
            const vd = await verdictOf(A.p, r6.id, '_desktopCloseVerdict');
            await sleep(2000);
            const mid = await A.p.evalJs(`fetch('/api/desktop/apps/${r6.id}').then((r) => r.json())`);
            const tA = await toasts(A.p);
            const stays = vd && vd.act === 'ask-app' && mid.state === 'ready' && D.pidAlive(r6.pids.app) && await has(A.p, r6.id) && await has(B.p, r6.id);
            check(`§10 (3b): the first ✕ ASKS (verdict ${JSON.stringify(vd)}) and a child that survives xterm's hangup keeps it running — record ${mid.state} 2 s later, the window on both pages, and the toast names the second ✕ (never silent)`, stays && tA.some((x) => /Asked .* to close — press ✕ again within 5 s to stop it/.test(x)), { vd, mid: mid.state, tA });
            if (stays) {
            const t0 = Date.now();
            await titleClose(A.p, r6.id);
            const g = await goneTimes(r6.id, t0, 8000);
            const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r6.id}').then((r) => r.json())`);
            console.log(`  §10 (3b): xterm + a hangup-proof child, the second ✕ ${t0 - firstAt} ms after the first ⇒ record ${recEnd.state} stoppedBy ${recEnd.stoppedBy}; gone on A after ${g.a} ms, on B after ${g.b} ms`);
            check(`§10 (3b): …the second ✕ ${t0 - firstAt} ms after the first ⇒ Stop (stoppedBy ${recEnd.stoppedBy}) ⇒ the window gone on BOTH clients and nothing of the xterm left`, t0 - firstAt < 5000 && recEnd.state === 'exited' && recEnd.stoppedBy === 'user' && g.a !== null && g.b !== null && [r6.pids.x, r6.pids.server, r6.pids.app].every((p) => !D.pidAlive(p)), { g, recEnd: { state: recEnd.state, stoppedBy: recEnd.stoppedBy } });
            }
          }
        }
      }
      // (4) a BLOCKED pane's ✕ does not ask the app (it cannot drive it): the window closes as it always did (the layout is
      // shared — every client's copy goes with it) and the app keeps running
      const l4 = await launchOn(A.p, { exec: XTERM, args: ['-T', 'vs-a2-blocked', '-geometry', '60x10'], label: 'vs-a2-blocked' });
      const r4 = l4 && l4.id && await readyOn(A.p, l4.id);
      if (r4) {
        ids10.push(r4.id);
        await openOnBoth(r4.id);
        await until(async () => { const s = await B.p.evalJs(SEAT(r4.id)); return s && s.mode === 'blocked' ? s : null; }, 10000, 200);
        await titleClose(B.p, r4.id);
        await sleep(800);
        const recMid = await A.p.evalJs(`fetch('/api/desktop/apps/${r4.id}').then((r) => r.json())`);
        check('§10 (4): a BLOCKED pane\'s ✕ (verdict not-active) closes its window without asking the app — the app keeps running', !(await has(B.p, r4.id)) && recMid.state === 'ready' && D.pidAlive(r4.pids.app), { state: recMid.state });
        // the layout is shared: B's close takes A's copy too — WAIT for it (2.369.199 integration: B's save now leaves after the
        // act holds of lanes desktop-move / stage-blank, ~1.6 s, past the 0.8 s this leg used to look at; the copy then vanished
        // AFTER the re-open check and the replay leg below met no window at all), then open it again for (5) as the USER's act
        // (a real key first: a scripted open with no input since the apply is no save of the user's — §6b guard 1)
        await until(async () => !(await has(A.p, r4.id)), 8000, 100);
        await A.p.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
        await A.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
        if (!(await has(A.p, r4.id))) await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(r4.id)}); true`);
        await until(() => has(A.p, r4.id), 5000, 100);
        // (5) the replay of a DEAD record opens NO window: the window is in the saved layout, NO client is connected when the app
        // ends (so nobody closes it), and a fresh page's layout restore meets `exited` at its first GET — never painted
        // the layout autosave holds A's window — waited on the stored layout itself (the debounce + a gate's deferral), never a nap
        const saved = !!(await until(() => A.p.evalJs(`fetch('/api/layouts').then((r) => r.json()).then((l) => JSON.stringify(l).includes(${JSON.stringify(r4.id)}))`), 8000, 250));
        await dropPage(A); await dropPage(B);
        await sleep(500);
        const st = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${r4.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
        const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
        const C = { p: await page(t), t };
        await C.p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
        // every desktop-app window this page ever creates is watched from the first script: was it ever shown (the pending class removed while attached)?
        await C.p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__a2 = { born: 0, revealed: 0, toasts: [] }; new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'childList') for (const n of m.addedNodes) { if (n.classList && n.classList.contains('desktop-app-pending')) window.__a2.born++; if (n.classList && n.classList.contains('global-toast')) setTimeout(() => window.__a2.toasts.push(n.textContent), 0); } else if (m.type === 'attributes' && m.target.classList && m.target.classList.contains('window') && m.oldValue && m.oldValue.includes('desktop-app-pending') && !m.target.classList.contains('desktop-app-pending') && m.target.isConnected) window.__a2.revealed++; } }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });` });
        await openPage(C.p, O10);
        await sleep(1500);
        const a2 = await C.p.evalJs('window.__a2');
        const tC = a2.toasts || []; // every toast the page showed since its first script (a 3.5 s toast is gone by the time the restore settles)
        check(`§10 (5): a dead record replayed from the layout opens NO window — the layout held it (${saved}), it was stopped with no client (${st.state}), the fresh page created it pending (${a2.born}) and closed it before it ever showed (revealed ${a2.revealed}), with the "stopped" toast`, saved && st.state === 'exited' && a2.born >= 1 && a2.revealed === 0 && !(await has(C.p, r4.id)) && tC.some((x) => /^vs-a2-blocked stopped/.test(x)), { saved, st: st.state, a2, tC });
        await dropPage(C);
      }
      // (6) CONTROL — the pre-A2 window: a copy of this tree whose window never closes itself (the verdict's close line pulled
      // back) — the calculator's own ✕ leaves the VibeSpace window standing as a dead picture (M3c, 2026-09-23)
      const wtc = scratch('deskxpra-a2ctl');
      try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
      for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
      fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
      const winSrc = fs.readFileSync(path.join(wtc, 'src/lib/desktop-app-window.js'), 'utf8');
      const closeLine = '    if (!v.close) return false;';
      check('CONTROL: the window\'s close decision is spelled exactly once (the control pulls exactly it back)', winSrc.split(closeLine).length === 2);
      fs.writeFileSync(path.join(wtc, 'src/lib/desktop-app-window.js'), winSrc.replace(closeLine, '    return false; // pre-A2 CONTROL: the window never closes itself'));
      rebaseline(wtc); execSync('npm run build', { cwd: wtc, stdio: 'ignore' });
      const [PORTA] = await freePorts(1);
      const homeA = scratchHome('deskxpra-a2ctl-home', fs);
      const sa = spawnCopy('the pre-A2 copy', wtc, { ...srvEnv, ...VNC_ENV, PORT: String(PORTA), HOME: homeA }); ctlServers.push(sa);
      let upA = await bootedCopy(sa, PORTA);
      check('CONTROL: the pre-A2 copy boots', upA, sa.bootWhy);
      if (upA) {
        const CT = await mkPage(`http://127.0.0.1:${PORTA}`, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
        try {
          const lc = await launchOn(CT.p, { exec: CALC10, args: [], label: 'vs-calc-a2-ctl' });
          const rc = lc && lc.id && await readyOn(CT.p, lc.id);
          if (rc) {
            await CT.p.evalJs(`app.openDesktopApp(${JSON.stringify(rc.id)}); true`);
            await sizeWinOn(CT.p, rc.id, 560, 760);
            const vc = await until(async () => { const v = await CT.p.evalJs(R2(rc.id)); return v && v.status === 'Connected' && v.main && v.main.h > 100 ? v : null; }, 40000, 300);
            await sleep(1200);
            // THE ✕ PRESS IS THIS CONTROL'S SETUP, judged by its effect (lane xpra-suite-evidence): a press GTK's relayout after the
            // resize swallowed (the 1200 ms nap stands for that relayout — no paint ack to read) left the app running (`ex` null, l3 of
            // this lane's loaded runs); so a press without an exit within 6 s is pressed again, at most 3 presses, each only once the
            // ✕'s point hits the pane (a pointer resting at the top reveals OUR folded bars there), the pointer parked mid-pane between
            let ex = null, presses = 0;
            for (let k = 0; vc && !ex && k < 3; k++) {
              const v = (await CT.p.evalJs(R2(rc.id))) || vc;
              const x = v.pane.x + (v.main.x + v.main.w) / v.ratio - 22, y = v.pane.y + v.main.y / v.ratio + 22;
              await reach7(CT.p, rc.id, { x, y });
              await trustedClickAt(CT.p, x, y); presses++;
              await CT.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: v.pane.x + v.pane.w / 2, y: v.pane.y + v.pane.h / 2 });
              ex = await until(() => CT.p.evalJs(`fetch('/api/desktop/apps/${rc.id}').then((r) => r.json()).then((r) => (r.state === 'exited' ? r : null))`), 6000, 100);
            }
            if (presses > 1) console.log(`  CONTROL pre-A2: the app's ✕ took ${presses} presses (${ex ? 'exited' : 'still running'})`);
            await sleep(2000);
            const still = await CT.p.evalJs(WIN(rc.id));
            check(`CONTROL: on the pre-A2 copy the same ✕ ends the app (${ex && ex.state}) and the VibeSpace window STAYS as a dead picture 2 s later (status ${JSON.stringify(still && still.status)}) — the leg above is the fix, not a coincidence`, !!ex && !!still, { ex: ex && ex.state, still });
          } else check('CONTROL: the calculator reaches ready on the pre-A2 copy', false, lc);
        } finally { await dropPage(CT); }
      }
      try { sa.kill('SIGKILL'); } catch {}
    } catch (e) { threw('§10', e); }
    finally {
      for (const id of ids10) await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      await dropPage(A); await dropPage(B);
    }
  }
} catch (e) {
  crashed(e, p1);
} finally {
  p1.close();
}
finish();
