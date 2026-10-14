#!/usr/bin/env node
// THE XPRA WINDOW'S SCALE — §14 the per-app default + the clickable chip, §15 the scale geometry, §16 Chrome under
// seamless (§15 and §16 share their measures and ONE control copy), on the real rung against a worktree server
// (a part of the test-desktop-xpra-window family — lane xpra-window-split, design q-038 ②: the giant split by § so the
// self-hosted desktop batch's floor is its longest part; every § keeps its number; the other parts are named below)
// The family: -open (§1–§4, §5, Stop, §8, §9, §13, §18) · -hidpi (§6, §11) · -hidpi-r2 (§7) · -close (§10) ·
// -scale (§14, §15, §16) · -seamless (§12, §17).
//   • §14 (lane D (b), 2026-09-25) THE PER-APP DEFAULT SCALE + THE CLICKABLE CHIP: the launch dialog's xterm card
//     carries a sibling default-scale control whose menu stores 1.5× (user state, heard live by a second client's open
//     dialog) WITHOUT launching — and (1b, lane D verify) a second client whose socket dropped re-reads it on reconnect and
//     its own save keeps it; a click on the card then launches xterm at 1.5× with origin 'app' (lane D (a)'s rule
//     since the merge: GDK_SCALE 2 + Xft.dpi 96 measured in its display, shown at 0.75); the window's chip "1.5× · App default" is role=button — a trusted click and
//     Enter open the same Scale ▸ rows at the chip (the default preselected, "1.5× is this app's default", Forget); a
//     pick relaunches the same window at 2× · chosen; "Make 2× the default for this app" stores 2 without a relaunch.
//     CONTROL = a copy (bundle rebuilt) whose launcher drops the field and whose chip is never a control.
//   • §15 (lane D (a) — docs/design-desktop-apps-seamless §3.4; the owner 2026-09-25: "从2x切换到1.5x之后出现大量白边，你
//     窗口尺寸计算不对") THE SCALE GEOMETRY on GNOME Calculator, at DPR 2 and DPR 1: the window's OWN Scale ▸ rows walk
//     auto → 1 → 1.5 → 2 → auto → 1 in a 900×680 window, then a resize to 1200×800 and back — at every step the picture
//     covers the pane (each edge ≤ 1 CSS px, none of the pane's background in the screenshot), a relaunch resizes the
//     window to PURE relaunchPaneCss (the app's logical size kept, unless the workspace caps it), the calculator's
//     column is ∝ its widgets' TRUE scale (1.5× = 0.75 of 2×), and every connect maps the main at its final size (F3).
//   • §16 (lane D (a) item C) CHROME UNDER SEAMLESS: the keeper seeds the profile's browser.custom_chrome_frame ⇒ Chrome
//     says decorations 0 ⇒ both VibeSpace bars fold (the strip with the title bar), the hover / Alt reveal them, a
//     tab-strip drag moves our window by the gesture, Chrome's own □ / restore / ─ / ✕ act on OUR window. SKIPPED by
//     name without a chromium-family binary. CONTROL (one copy for both) = the floor knobs + no relaunch fit + no
//     seeding: 2× → 1.5× halves the column in a window that kept its size; Chrome stays SSD with both bars stacked.
// The boot (the worktree server on the real xpra rung, headless chrome, §5's fake claude, the private runtime dir) and the
// teardown are scripts/xpra-window-boot.mjs's, ONCE for this part; the measures the §§ share live there too.
// Run: node scripts/test-desktop-xpra-window-scale.mjs
import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, gtkRow } from './scratch.mjs';
import { bootXpraWindow } from './xpra-window-boot.mjs';

const require = createRequire(import.meta.url);
const { bin, bootedCopy, check, crashed, ctlServers, dropPage, ensureActive, finish, launchOn, mkPage, openPage, page, PORT, readyOn, rebaseline,
  repo, sizeWinOn, skip, sleep, spawnCopy, srvEnv, target, threw, trustedClickAt, until, worktrees, wt, xenvFor, xq } = await bootXpraWindow('test-desktop-xpra-window-scale');
let p1 = await page(target);
try {
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  check('the loopback page is a SECURE context (the API branch can be proven here)', await p1.evalJs('window.isSecureContext === true'));
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check(`the default ladder picks xpra on this box (${JSON.stringify(av.availability)})`, av.availability?.backend === 'xpra' && av.availability?.stream === 'xpra', av.availability);

  // ── §14 (lane D (b), 2026-09-25 — the owner: "那个1.5x 已选的提示直接可以点快速切换" + "最好加入可以在app启动前那个app选择界面
  // 调整每个app默认dpi的能力"): THE PER-APP DEFAULT SCALE + THE CLICKABLE CHIP on the real rung, two clients. (1) the launch
  // dialog's xterm card carries a SIBLING default-scale control ("Auto"); its menu (Auto / 1× / 1.5× / 2× / 2.5× / 3×)
  // stores 1.5× in user state WITHOUT launching, and the second client's open dialog hears it; (2) a click on the CARD then
  // launches xterm at 1.5× with origin 'app' — measured inside its display (since the lane-D merge, lane D (a)'s rule: GDK_SCALE 2
  // in its environ, Xft.dpi 96, the record shown at 0.75); (3)
  // the window's chip reads "1.5× · App default", is role=button, and a trusted click (and Enter) opens the Scale ▸ rows
  // at the chip — the default marked, "1.5× is this app's default", Forget; (4) a pick (2×) confirms and relaunches (the
  // same window, the successor at 2× · chosen); (5) "Make 2× the default for this app" stores 2 (no relaunch). CONTROL = a
  // copy of this tree (bundle rebuilt) whose launcher never sends the default and whose chip is never a control: the SAME
  // stored 1.5× launches at auto, and a click on the chip opens nothing. ──
  console.log('§14 lane D (b) — the app\'s default scale from the launch dialog\'s card, the clickable scale chip; ours vs a copy without them');
  {
    const O14 = `http://127.0.0.1:${PORT}`;
    const ids14 = [];
    const XRDB14 = bin('xrdb');
    const envOf14 = (pid) => { try { return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'latin1').split('\0').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } };
    const menuRows = (P) => P.evalJs(`(() => { const m = [...document.querySelectorAll('.context-menu')].filter((x) => x.getBoundingClientRect().width > 0).pop(); return m ? [...m.querySelectorAll(':scope > .context-menu-item')].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent, disabled: e.classList.contains('disabled'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }) : null; })()`);
    const clickRow = async (P, re) => { const rows = await menuRows(P); const row = rows && rows.find((r) => re.test(r.text) && !r.disabled); if (row) { await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: row.x, y: row.y }); await sleep(100); await trustedClickAt(P, row.x, row.y); } return !!row; };
    const escMenu = async (P) => { await P.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await P.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(150); };
    const CARD14 = `(() => { const c = document.querySelector('#desktop-launch-dialog .desktop-launch-card[data-app-id="xterm"]'); const k = document.querySelector('#desktop-launch-dialog .desktop-launch-card-scale[data-scale-for="xterm"]'); if (!c || !k) return null; const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }; const lb = c.querySelector('.desktop-launch-card-label'); return { card: R(c), ctl: R(k), label: R(lb), text: k.textContent, title: k.title, tag: k.tagName, nested: c.contains(k), sameParent: c.parentElement === k.parentElement && c.parentElement.classList.contains('desktop-launch-card-wrap'), haspopup: k.getAttribute('aria-haspopup'), hasDefault: k.classList.contains('has-default'), clipped: k.scrollWidth > k.clientWidth + 1, disabled: c.disabled }; })()`;
    const CHIP14 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const c = w.content.querySelector('.desktop-app-chip-scale'); const r = c.getBoundingClientRect(); return { wmId: w.id, appId: w._desktopAppId, status: w._desktopAppView ? w._desktopAppView.status.textContent : null, text: c.textContent, title: c.title, role: c.getAttribute('role'), tabindex: c.getAttribute('tabindex'), haspopup: c.getAttribute('aria-haspopup'), control: c.classList.contains('is-control'), x: r.x + r.width / 2, y: r.y + r.height / 2, shown: r.width > 0, items: w._desktopAppScaleItems ? w._desktopAppScaleItems().map((i) => ({ label: i.label, disabled: !!i.disabled })) : null, def: w._desktopScaleDefault ? w._desktopScaleDefault() : null }; })()`;
    const stateScale = (P) => P.evalJs(`fetch('/api/user-state').then((r) => r.json()).then((s) => s.desktopAppScale || null)`);
    const openDialog14 = async (P) => { await P.evalJs(`(() => { document.getElementById('desktop-launch-dialog')?.remove(); document.getElementById('btn-desktop-apps').click(); return true; })()`); return until(() => P.evalJs(CARD14), 10000, 150); };
    let A = null, B = null;
    try {
      await p1.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
      A = await mkPage(O14, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
      B = await mkPage(O14, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
      await A.p.evalJs(`fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desktopAppScale: {} }) }).then((r) => r.ok)`);
      // (1) the card's control: a sibling button, "Auto"; its menu stores 1.5× and launches nothing; the other client hears it
      const c0 = await openDialog14(A.p);
      const cB0 = await openDialog14(B.p);
      check(`§14 (1): the xterm card carries a default-scale control BESIDE it (a ${c0 && c0.tag}, a sibling in .desktop-launch-card-wrap — never nested in the card's button), reading "${c0 && c0.text}" (design 009 §B4: the ⋯ glyph, no permanent "Auto"), aria-haspopup=${c0 && c0.haspopup}`, !!c0 && c0.tag === 'BUTTON' && !c0.nested && c0.sameParent && c0.text === '' && c0.haspopup === 'menu' && /^Default scale for xterm: Auto/.test(c0.title) && !!cB0, c0);
      check(`§14 (1) geometry: the control sits right of the card on the same row (card ${c0 && `${c0.card.x.toFixed(0)}..${c0.card.r.toFixed(0)}`}, control ${c0 && `${c0.ctl.x.toFixed(0)}..${c0.ctl.r.toFixed(0)}`}), the label inside the card, the control's text unclipped`, !!c0 && c0.ctl.x >= c0.card.r - 1 && Math.abs(c0.ctl.y - c0.card.y) <= 1 && Math.abs(c0.ctl.b - c0.card.b) <= 1 && c0.label.r <= c0.card.r + 0.5 && c0.label.w > 0 && !c0.clipped, c0 && { card: c0.card, ctl: c0.ctl, label: c0.label });
      const apps0 = (await A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => l.apps.filter((a) => a.state === 'ready' || a.state === 'launching').length)`));
      await trustedClickAt(A.p, c0.ctl.x + c0.ctl.w / 2, c0.ctl.y + c0.ctl.h / 2); await sleep(250);
      const rows1 = await menuRows(A.p);
      check(`§14 (1): the control's menu = a heading + Auto / 1× / 1.5× / 2× / 2.5× / 3× (plain numbers), Auto checked (${rows1 && rows1.map((r) => r.text.trim()).join(' | ')})`, !!rows1 && rows1.length === 7 && rows1[0].disabled && /Default scale for xterm/.test(rows1[0].text) && /^✓ Auto/.test(rows1[1].text) && rows1[1].disabled && /^\s*1\.5×$/.test(rows1[3].text) && /^\s*2\.5×$/.test(rows1[5].text) && /^\s*3×$/.test(rows1[6].text), rows1); // the lane-D merge: plain numbers — a fraction is a real scale (lane D (a))
      await clickRow(A.p, /1\.5×/);
      const st1 = await until(async () => { const v = await stateScale(A.p); return v && v.xterm === 1.5 ? v : null; }, 5000, 100);
      const c1 = await until(async () => { const v = await A.p.evalJs(CARD14); return v && v.text === '1.5×' ? v : null; }, 3000, 100);
      const apps1 = (await A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => l.apps.filter((a) => a.state === 'ready' || a.state === 'launching').length)`));
      const stillOpen = await A.p.evalJs(`!!document.getElementById('desktop-launch-dialog')`);
      check(`§14 (1): picking 1.5× stores it in user state (desktopAppScale ${JSON.stringify(st1)}), the control reads "${c1 && c1.text}" (accented) — and NOTHING launched (${apps0} → ${apps1} live apps), the dialog still open`, !!st1 && !!c1 && c1.hasDefault && apps1 === apps0 && stillOpen, { st1, c1: c1 && c1.text, apps0, apps1 });
      const cB1 = await until(async () => { const v = await B.p.evalJs(CARD14); return v && v.text === '1.5×' ? v : null; }, 5000, 100);
      check(`§14 (1): the SECOND client's open dialog hears it live (its control reads "${cB1 && cB1.text}" — no reopen, no reload)`, !!cB1 && cB1.hasDefault, cB1);
      // (1b) lane D verify (the minor): B's socket drops (WsManager reconnects by itself in 2–3 s); A stores ANOTHER app's
      // default while B is down; B's reopen must re-read it, and B's own save afterwards must keep it (the first build: B's
      // card still "Auto", its save PATCHed its stale copy ⇒ A's choice gone). The fast pin + its controls: test-desktop-app-scale §8.
      {
        const pickDom = (P, forKey, re) => P.evalJs(`(async () => { const c = document.querySelector('#desktop-launch-dialog .desktop-launch-card-scale[data-scale-for=' + JSON.stringify(${JSON.stringify(forKey)}) + ']'); if (!c) return false; c.click(); await new Promise((r) => setTimeout(r, 150)); const m = [...document.querySelectorAll('.context-menu')].filter((x) => x.getBoundingClientRect().width > 0).pop(); const row = m && [...m.querySelectorAll(':scope > .context-menu-item')].find((e) => ${re}.test(e.textContent.trim()) && !e.classList.contains('disabled')); if (!row) { m && m.remove(); return false; } row.click(); return true; })()`);
        const other = await A.p.evalJs(`([...document.querySelectorAll('#desktop-launch-dialog .desktop-launch-card-scale')].map((e) => e.dataset.scaleFor).find((k) => k && k !== 'xterm') || null)`);
        const cardText = (P) => P.evalJs(`((e) => (e ? e.textContent : null))(document.querySelector('#desktop-launch-dialog .desktop-launch-card-scale[data-scale-for=' + JSON.stringify(${JSON.stringify(other)}) + ']'))`);
        await B.p.evalJs('app.ws.ws.close(), true');
        const down = await until(() => B.p.evalJs('app.ws.ws.readyState !== 1'), 3000, 20);
        const pickedA = other && await pickDom(A.p, other, /^2×$/);
        const stA = await until(async () => { const v = await stateScale(A.p); return v && v[other] === 2 ? v : null; }, 3000, 50);
        const bDownAtWrite = await B.p.evalJs('app.ws.ws.readyState !== 1');
        const back = await until(() => B.p.evalJs('app.ws.ws.readyState === 1'), 12000, 100);
        const bSees = await until(async () => { const v = await cardText(B.p); return v === '2×' ? v : null; }, 4000, 100);
        const pickedB = await pickDom(B.p, 'xterm', /^3×$/);
        const stB = await until(async () => { const v = await stateScale(A.p); return v && v.xterm === 3 ? v : null; }, 4000, 100);
        check(`§14 (1b) lane D verify: B's socket down (${!!down}, still down when A wrote: ${bDownAtWrite}) while A stored ${other} 2× (${JSON.stringify(stA)}); B reconnected (${!!back}) and its ${other} card reads "${bSees}" — a reconnect re-reads`, !!other && pickedA && !!stA && !!down && bDownAtWrite && !!back && bSees === '2×', { other, pickedA, stA, down, bDownAtWrite, back, bSees });
        check(`§14 (1b) lane D verify: B's save after the reopen (xterm 3×, picked ${pickedB}) KEEPS A's ${other} 2× — the server holds ${JSON.stringify(stB)}`, pickedB && !!stB && stB.xterm === 3 && stB[other] === 2, stB);
        // put the state back for (2): xterm's default 1.5×, nothing else
        await A.p.evalJs(`fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desktopAppScale: { xterm: 1.5 } }) }).then((r) => r.ok)`);
        await until(async () => { const v = await A.p.evalJs(CARD14); return v && v.text === '1.5×' && (await cardText(A.p)) === 'Auto' ? v : null; }, 5000, 100);
      }
      await dropPage(B); B = null; // its part is done: a second client would only race A for the app's active seat (x5)
      // Esc on the control's open menu closes THE MENU only (the dialog's own Esc would close the whole dialog)
      await trustedClickAt(A.p, c1.ctl.x + c1.ctl.w / 2, c1.ctl.y + c1.ctl.h / 2); await sleep(250);
      const opened = await menuRows(A.p);
      await escMenu(A.p);
      const afterEsc = await A.p.evalJs(`({ menu: [...document.querySelectorAll('.context-menu')].some((x) => x.getBoundingClientRect().width > 0), dialog: !!document.getElementById('desktop-launch-dialog'), focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.scaleFor || null : null })`);
      check(`§14 (1): Esc on the control's open menu (${opened && opened.length} rows) closes the menu only — the dialog stays, the control keeps the keyboard (${JSON.stringify(afterEsc)})`, !!opened && opened.length === 7 && !afterEsc.menu && afterEsc.dialog && afterEsc.focus === 'xterm', afterEsc);
      // (2) the card launches at the stored default — the record says origin 'app', the display says 1.5×
      const before = new Set((await A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => l.apps.map((a) => a.id))`)) || []);
      await trustedClickAt(A.p, c1.card.x + c1.card.w / 2, c1.card.y + c1.card.h / 2);
      const id0 = await until(() => A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => (l.apps.find((a) => !${JSON.stringify([...before])}.includes(a.id) && a.appId === 'xterm') || {}).id || null)`), 15000, 200);
      if (id0) ids14.push(id0);
      const r0 = id0 && await readyOn(A.p, id0);
      check(`§14 (2): a click on the card launches xterm (${id0}) and it reaches ready`, !!r0, id0);
      if (r0) {
        const xe = xenvFor(wt, r0);
        const in0 = { gdk: envOf14(r0.pids.app).GDK_SCALE || null, xft: XRDB14 ? Number((xq(xe, 'xrdb', ['-query']).match(/^Xft\.dpi:\s+(\d+)/m) || [])[1]) || null : null };
        console.log(`  §14 (2): record scale ${r0.scale} dpi ${r0.dpi} origin ${r0.scaleOrigin} from ${JSON.stringify(r0.scaleFrom)}; inside: GDK_SCALE=${in0.gdk}, Xft.dpi ${in0.xft}`);
        check(`§14 (2): the record runs at the app's DEFAULT — ${r0.scale}× (drawn at GDK_SCALE ${r0.gdkScale}, ${r0.dpi} dpi, shown at ${r0.pictureScale} — lane D (a)), origin ${r0.scaleOrigin} (a DPR-1 page's auto would be 1×)`, r0.scale === 1.5 && r0.dpi === 96 && r0.gdkScale === 2 && r0.pictureScale === 0.75 && r0.scaleOrigin === 'app' && r0.scaleFrom === null, { scale: r0.scale, dpi: r0.dpi, gdk: r0.gdkScale, pic: r0.pictureScale, origin: r0.scaleOrigin });
        check(`§14 (2): MEASURED inside the app's display — GDK_SCALE=${in0.gdk} in xterm's environ, Xft.dpi ${in0.xft} (1.5× = drawn at GDK_SCALE 2 + 96 dpi, shown at 0.75 — lane D (a))`, in0.gdk === '2' && (!XRDB14 || in0.xft === 96), in0);
        // (3) the window's chip: "1.5× · App default", a control; a trusted click and Enter open the Scale ▸ rows at the chip
        const onA = await until(() => A.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)})`), 10000, 200);
        if (!onA) await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(id0)}); true`);
        await ensureActive(A.p, id0);
        await sizeWinOn(A.p, id0, 900, 560);
        const k0 = await until(async () => { const v = await A.p.evalJs(CHIP14(id0)); return v && v.status === 'Connected' && v.shown ? v : null; }, 30000, 250);
        check(`§14 (3): the chip reads "${k0 && k0.text}" and says where it came from and what a click does ("${k0 && k0.title}")`, !!k0 && k0.text === 'Larger 1.5×' && /the default you chose for this app/.test(k0.title) && /Click to change the scale$/.test(k0.title), k0 && { text: k0.text, title: k0.title });
        check(`§14 (3): the chip is a CONTROL — role=${k0 && k0.role}, tabindex ${k0 && k0.tabindex}, aria-haspopup ${k0 && k0.haspopup}`, !!k0 && k0.role === 'button' && k0.tabindex === '0' && k0.haspopup === 'menu' && k0.control, k0);
        await ensureActive(A.p, id0);
        const hit3 = await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)}); const c = w.content.querySelector('.desktop-app-chip-scale'); const r = c.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const e = document.elementFromPoint(x, y); return { x, y, hit: e === c, under: e ? (e.className || e.tagName) : null }; })()`);
        await trustedClickAt(A.p, hit3.x, hit3.y); await sleep(250);
        const rows3 = await menuRows(A.p);
        const want = k0.items.map((i) => i.label);
        const at = rows3 && rows3.length ? rows3[0] : null;
        check(`§14 (3): a trusted click on the chip opens the SAME Scale ▸ rows the ⋯ carries, right at the chip (${rows3 && rows3.length} rows: ${rows3 && rows3.map((r) => r.text.trim()).join(' | ')})`, !!rows3 && JSON.stringify(rows3.map((r) => r.text)) === JSON.stringify(want) && !!at && Math.abs(at.y - hit3.y) < 80, { rows3: rows3 && rows3.map((r) => r.text), want, hit3 });
        const cur3 = rows3 && rows3.find((r) => /^✓/.test(r.text));
        check(`§14 (3): the app default is the preselected row ("${cur3 && cur3.text}", disabled) with "1.5× is this app's default" and "Forget this app's default (1.5×)" below; 2.5× and 3× offered`, !!cur3 && /^✓ 1\.5× · App default$/.test(cur3.text) && cur3.disabled && rows3.some((r) => r.text === '1.5× is this app’s default' && r.disabled) && rows3.some((r) => r.text === 'Forget this app’s default (1.5×)' && !r.disabled) && rows3.some((r) => /2\.5×/.test(r.text) && !r.disabled) && rows3.some((r) => /3×$/.test(r.text) && !r.disabled), rows3);
        await escMenu(A.p);
        const gone3 = await A.p.evalJs(`![...document.querySelectorAll('.context-menu')].some((x) => x.getBoundingClientRect().width > 0)`);
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)}); w.content.querySelector('.desktop-app-chip-scale').focus(); return document.activeElement === w.content.querySelector('.desktop-app-chip-scale'); })()`);
        await A.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await A.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(250);
        const rowsK = await menuRows(A.p);
        check(`§14 (3): Esc closes the menu (${gone3}); the chip focused + Enter opens it again (${rowsK && rowsK.length} rows) — a keyboard control`, gone3 && !!rowsK && !!rows3 && rowsK.length === rows3.length, rowsK && rowsK.length);
        // (4) a pick from the chip (2×) asks, then relaunches: the same window follows the successor at 2× · chosen
        await clickRow(A.p, /^ 2×$/);
        const dlg = await until(() => A.p.evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay, .modal-overlay')].pop(); const b = o && o.querySelector('.btn-create'); return b ? { text: o.textContent, ok: b.textContent } : null; })()`), 5000, 100);
        check(`§14 (4): the chip's pick asks first (${JSON.stringify(dlg && dlg.ok)}: "${dlg && dlg.text.slice(0, 80)}")`, !!dlg && dlg.ok === 'Relaunch' && /at 2×/.test(dlg.text), dlg);
        if (dlg) {
          const t0 = Date.now();
          await A.p.evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay, .modal-overlay')].pop(); o.querySelector('.btn-create').click(); return true; })()`);
          const fa = await until(async () => { const v = await A.p.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(k0.wmId)}); return w && w._desktopAppId !== ${JSON.stringify(id0)} ? w._desktopAppId : null; })()`); return v; }, 20000, 100);
          if (fa) ids14.push(fa);
          const r1 = fa && await readyOn(A.p, fa);
          const k1 = r1 && await until(async () => { const v = await A.p.evalJs(CHIP14(fa)); return v && v.status === 'Connected' && v.text === 'Larger 2×' ? v : null; }, 30000, 250);
          check(`§14 (4): the SAME window (${k0.wmId}) now shows the successor ${fa} at ${r1 && r1.scale}× (${r1 && r1.scaleOrigin}), connected, the chip "${k1 && k1.text}" (${Date.now() - t0} ms)`, !!r1 && r1.scale === 2 && r1.scaleOrigin === 'chosen' && !!k1, { r1: r1 && { scale: r1.scale, origin: r1.scaleOrigin }, k1: k1 && k1.text });
          // (5) "Make 2× the default for this app" — stores 2 (every client hears it), nothing relaunches
          if (k1) {
            check(`§14 (5): the model offers Make 2× (the default is still 1.5×): ${JSON.stringify(k1.def)}`, !!k1.def && k1.def.make === 2 && k1.def.def === 1.5 && k1.def.clear, k1.def);
            await ensureActive(A.p, fa);
            const k1b = await A.p.evalJs(CHIP14(fa));
            await trustedClickAt(A.p, k1b.x, k1b.y); await sleep(250);
            const clicked = await clickRow(A.p, /^Make 2× the default for this app$/);
            const st5 = await until(async () => { const v = await stateScale(A.p); return v && v.xterm === 2 ? v : null; }, 5000, 100);
            await sleep(600);
            const k5 = await A.p.evalJs(CHIP14(fa));
            check(`§14 (5): "Make 2× the default for this app" (clicked ${clicked}) stores 2 (${JSON.stringify(st5)}); the window still runs ${k5 && k5.appId} (no relaunch) and now says 2× is its app's default`, clicked && !!st5 && !!k5 && k5.appId === fa && k5.def && k5.def.isDefault && k5.items.some((i) => i.label === '2× is this app’s default'), { st5, k5: k5 && { appId: k5.appId, def: k5.def } });
          }
        }
      }
      // (6) CONTROL — a copy of this tree (bundle rebuilt) whose launcher never sends the default and whose chip is never a
      // control: the SAME stored default launches at auto, and a click on the chip opens nothing
      const wtc = scratch('deskxpra-lanedctl');
      try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
      for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
      fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
      const levers = [
        ['src/lib/desktop-app-launcher.js', '...(scaleChoice != null ? { scaleChoice } : {}), ', ''],
        ['src/lib/desktop-app-window.js', '    const control = !why;', '    const control = false; // CONTROL: the chip is never a control'],
      ];
      const once = levers.every(([f, a]) => fs.readFileSync(path.join(wtc, f), 'utf8').split(a).length === 2);
      check('CONTROL: each lever (the launch field, the chip\'s control verdict) is spelled exactly once (the copy pulls back exactly those)', once);
      for (const [f, a, b] of levers) fs.writeFileSync(path.join(wtc, f), fs.readFileSync(path.join(wtc, f), 'utf8').replace(a, b));
      execFileSync(path.join(repo, 'node_modules/.bin/esbuild'), ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wtc, stdio: 'ignore' });
      const [PORTD] = await freePorts(1);
      const homeD = scratchHome('deskxpra-lanedctl-home', fs);
      const sd = spawnCopy('the lane-D-less copy', wtc, { ...srvEnv, PORT: String(PORTD), HOME: homeD }); ctlServers.push(sd);
      let upD = await bootedCopy(sd, PORTD);
      check('CONTROL: the lane-D-less copy boots', upD, sd.bootWhy);
      if (upD) {
        await A.p.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
        await openPage(A.p, `http://127.0.0.1:${PORTD}`);
        await A.p.evalJs(`fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desktopAppScale: { xterm: 1.5 } }) }).then((r) => r.ok)`);
        const cc = await openDialog14(A.p);
        const beforeC = new Set((await A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => l.apps.map((a) => a.id))`)) || []);
        if (cc) await trustedClickAt(A.p, cc.card.x + cc.card.w / 2, cc.card.y + cc.card.h / 2);
        const idC = await until(() => A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => (l.apps.find((a) => !${JSON.stringify([...beforeC])}.includes(a.id) && a.appId === 'xterm') || {}).id || null)`), 15000, 200);
        const rC = idC && await until(() => A.p.evalJs(`fetch('/api/desktop/apps/${idC}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 40000);
        check(`CONTROL: on the copy the card (control reads "${cc && cc.text}" — the stored 1.5×) launches at ${rC && rC.scale}× origin ${rC && rC.scaleOrigin}: the default never left the page — §14 (2) is the launch field's doing`, !!cc && cc.text === '1.5×' && !!rC && rC.scale === 1 && rC.scaleOrigin === 'auto', rC && { scale: rC.scale, origin: rC.scaleOrigin });
        if (rC) {
          // design 009 §B2: an AUTOMATIC scale puts no chip on the strip, so the chip half of the control needs a window at a
          // CHOSEN scale — launched straight through the route (the copy's launcher no longer sends the default)
          const idK = await A.p.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'xterm', scaleChoice: 1.5, dpr: devicePixelRatio, uiScale: 1 }) }).then((r) => r.json()).then((r) => r.id || null)`);
          const rK = idK && await until(() => A.p.evalJs(`fetch('/api/desktop/apps/${idK}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 40000);
          const onC = rK && await until(() => A.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(idK)})`), 10000, 200);
          if (rK && !onC) await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(idK)}); true`);
          const kc = rK && await until(async () => { const v = await A.p.evalJs(CHIP14(idK)); return v && v.status === 'Connected' && v.shown ? v : null; }, 30000, 250);
          if (kc) { await escMenu(A.p); await trustedClickAt(A.p, kc.x, kc.y); await sleep(400); }
          const rowsC = await menuRows(A.p);
          check(`CONTROL: on the copy the chip (role ${kc && kc.role}) opens NOTHING on a trusted click (${rowsC ? rowsC.length + ' rows' : 'no menu'}) — §14 (3) is the control's doing`, !!kc && kc.role === null && !rowsC, { kc: kc && { role: kc.role, text: kc.text }, rowsC });
          for (const id of [idC, idK].filter(Boolean)) await fetch(`http://127.0.0.1:${PORTD}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        }
      }
      try { sd.kill('SIGKILL'); } catch {}
    } catch (e) { threw('§14', e); }
    finally {
      for (const id of ids14) await fetch(`${O14}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      await fetch(`${O14}/api/user-state`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desktopAppScale: {} }) }).catch(() => {});
      await dropPage(A); await dropPage(B);
    }
  }

  // ── §15 LANE D (a) (docs/design-desktop-apps-seamless §3.4 + docs/design-desktop-apps.zh.md §7.6; the owner 2026-09-25,
  // two screenshots: "从2x切换到1.5x之后出现大量白边，你窗口尺寸计算不对"). MEASURED first (reader 1): our geometry was
  // exact — the white was GNOME Calculator's OWN background: the old floor rule drew a "1.5×" at GDK_SCALE 1 + 144 dpi
  // (widgets 1×) and libadwaita clamps its content column (~676 logical px), so a relaunch from 2× halved every widget in
  // a window that kept its size. Now a fraction is a REAL scale (GDK_SCALE ⌈s⌉, shown at s ÷ ⌈s⌉) and the window keeps
  // the app's logical size across a relaunch. Per DPR (2, then 1), the window's OWN Scale ▸ rows + the confirm, every
  // transition auto → 1 → 1.5 → 2 → auto → 1 in a 900×680 window, then a resize to 1200×800 and back:
  //   · OUR margins: the main window's picture covers the pane (each edge ≤ 1 CSS px — a sub-cell snap), measured on the
  //     element rects AND on the screenshot's pixels (the pane's own background colour found nowhere outside the app);
  //   · the window FOLLOWS the scale: its new pane = PURE relaunchPaneCss (±1.5 px) unless the workspace caps it;
  //   · the app looks the SAME, scaled: its content column (a keypad row's non-background span) ∝ the widgets' true
  //     scale (±3 %), so the proportion of its own background never jumps (the white edges);
  //   · F3: every connect maps the main at its final size (the map-window geometry = the settled main, no bars' band);
  // CONTROL = a copy of this tree with the three levers pulled back (the floor knobs, no relaunch fit): 2× → 1.5× halves
  // the column in a window that kept its size (the owner's screenshot, reproduced). ──
  console.log('§15 lane D (a) — the scale geometry: a fraction is a real scale, the window follows a Scale ▸ relaunch, the picture covers the pane at every transition');
  const CALC14 = bin('gnome-calculator');
  const G15 = CALC14 ? gtkRow() : null; // the box's calculator: BUTTON-bound (50 / GTK 4.22) or TEXT-bound (46 / 4.14) — B-4260
  const ids14 = [];
  const O14 = `http://127.0.0.1:${PORT}`;
  const M14 = require('../src/desktop-apps.js');
  // the page's view of one window: the pane, OUR margins (the main's rendered box vs the pane), the app's own content
  // column (a keypad row near the bottom — the calculator's buttons — non-background span, CSS px), the window rect
  const G14 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; if (!v || !v.pane) return null; const c = v.client; const main = c && c.mainWid ? c.windows.get(c.mainWid) : null;
    const pr = v.pane.getBoundingClientRect(), er = w.element.getBoundingClientRect(); const el = v.pane.querySelector('.xpra-win-main'); const mr = el ? el.getBoundingClientRect() : null;
    let col = null; try { const cv = el && el.querySelector('canvas'); if (cv && main) { const W = Math.min(cv.width, main.w), H = Math.min(cv.height, main.h), y = Math.floor(H * 0.9); const d = cv.getContext('2d').getImageData(0, y, W, 1).data; const b = [d[12], d[13], d[14]]; let lo = -1, hi = -1; for (let i = 0; i < W; i++) { const q = i * 4; if (Math.abs(d[q] - b[0]) + Math.abs(d[q + 1] - b[1]) + Math.abs(d[q + 2] - b[2]) > 12) { if (lo < 0) lo = i; hi = i; } } col = { css: (hi - lo + 1) / v.ratio, left: lo / v.ratio, right: (W - 1 - hi) / v.ratio, bg: b.join(',') }; } } catch (e) { col = String(e); }
    return { wmId: w.id, status: v.status.textContent, seamless: !!(w._desktopSeamless && w._desktopSeamless.seamless), ratio: v.ratio, picture: v.pictureScale, stageScale: v.stageScale, badge: v.fitBadge.style.display !== 'none',
      pane: { x: pr.x, y: pr.y, w: pr.width, h: pr.height }, win: { x: er.x, y: er.y, w: er.width, h: er.height }, main: main && { x: main.x, y: main.y, w: main.w, h: main.h, premap: !!main.premap, hints: main.meta['size-constraints'] || null },
      margins: mr && { l: mr.x - pr.x, t: mr.y - pr.y, r: pr.right - mr.right, b: pr.bottom - mr.bottom }, col, fit: w._desktopRelaunchFit || null, max: !!w.isMaximized }; })()`;
  /** the pane's own pixels (a screenshot at the page's device scale): the fraction whose colour is the PANE's background
   *  (var(--bg-secondary)) — the app never paints it (the calculator's own background is its own rgb) */
  const bare14 = async (P, id) => {
    const g = await P.evalJs(G14(id));
    if (!g) return null;
    const shot = await P.cdp('Page.captureScreenshot', { format: 'png', clip: { x: g.pane.x, y: g.pane.y, width: g.pane.w, height: g.pane.h, scale: 1 } });
    return P.evalJs(`(async () => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const bgs = getComputedStyle(w._desktopAppView.pane).backgroundColor.match(/\\d+/g).slice(0, 3).map(Number); const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, bare = 0, edge = { l: 0, r: 0, t: 0, b: 0 }; const W = c.width, H = c.height; for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const q = (yy * W + xx) * 4; n++; if (Math.abs(d[q] - bgs[0]) + Math.abs(d[q + 1] - bgs[1]) + Math.abs(d[q + 2] - bgs[2]) <= 3) { bare++; if (xx < 3) edge.l++; if (xx >= W - 3) edge.r++; if (yy < 3) edge.t++; if (yy >= H - 3) edge.b++; } } return { bg: bgs.join(','), frac: bare / n, bare, n, edge }; })()`);
  };
  // the Worker tap: every map-window / configure-window the client sends and every new-window it hears (F3) — with the
  // size-constraints each new-window / window-metadata packet carries (B-4260: an app that RE-ANNOUNCES them after the map)
  const TAP14 = `(() => { const R = window.Worker; if (!R || R.__d14) return; window.__d14 = []; const nm = (x) => (typeof x === 'string' ? x : x instanceof Uint8Array ? new TextDecoder().decode(x) : String(x));
    class W extends R { postMessage(m, t) { try { if (m && m.c === 's' && Array.isArray(m.p)) { const ty = nm(m.p[0]); if (ty === 'map-window' || ty === 'configure-window' || ty === 'display-configure') window.__d14.push({ at: Math.round(performance.now()), d: 'out', ty, g: ty === 'display-configure' ? m.p[1]['desktop-size'] : m.p.slice(1, 6) }); } } catch {} return super.postMessage(m, t); }
      set onmessage(fn) { super.onmessage = (e) => { try { const m = e.data; if (m && m.c === 'p' && Array.isArray(m.p)) { const ty = nm(m.p[0]); const md = ty === 'new-window' ? m.p[6] : ty === 'window-metadata' ? m.p[2] : null; const sc = md && (md['size-constraints'] || md['size-hints']) ? JSON.stringify(md['size-constraints'] || md['size-hints']) : null; if (ty === 'new-window') window.__d14.push({ at: Math.round(performance.now()), d: 'in', ty, g: m.p.slice(1, 6), sc }); else if (ty === 'window-metadata' && sc) window.__d14.push({ at: Math.round(performance.now()), d: 'in', ty, g: [m.p[1]], sc }); } } catch {} return fn(e); }; } get onmessage() { return super.onmessage; } }
    W.__d14 = true; window.Worker = W; })();`;
  const pick14 = async (P, id, choice) => {
    const r = await P.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const items = w._desktopAppScaleItems(); const want = ${JSON.stringify(choice)}; const row = items.find((it) => { const l = String(it.label).replace(/^(✓ |\\u2003)/, ''); return want === 'auto' ? /^Auto/.test(l) : l === want + '×'; }); if (!row) return { none: items.map((x) => x.label) }; if (row.disabled) return { disabled: row.label }; row.action(); return { ok: row.label }; })()`);
    if (!r.ok) return r;
    const dlg = await until(() => P.evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay, .modal-overlay')].pop(); const b = o && o.querySelector('.btn-create'); if (!b) return null; b.click(); return true; })()`), 5000, 100);
    return dlg ? r : { noDialog: true };
  };
  const settle14 = async (P, id) => {
    const s = await until(async () => { const g = await P.evalJs(G14(id)); return g && g.status === 'Connected' && g.main && g.main.hints && g.seamless ? g : null; }, 40000, 250);
    if (!s) return null;
    await sleep(2500); // the app's own snap to its size (~650 ms after the map) and the belt's answer, the repaint
    return P.evalJs(G14(id));
  };
  if (!CALC14) skip('§15 the scale-geometry legs', 'gnome-calculator not on PATH');
  else {
    const runScale14 = async (origin, dpr, wtree, tag) => {
      const H = await mkPage(origin, { width: 1400, height: 1000, deviceScaleFactor: dpr, mobile: false });
      const out = { steps: [], dpr, tag };
      try {
        await H.p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: TAP14 });
        await H.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`); await openPage(H.p, origin);
        const l = await launchOn(H.p, { appId: 'gnome-calculator', uiScale: 1 });
        let id = l && l.id;
        if (!id) { out.err = l; return out; }
        ids14.push([origin, id]);
        if (!(await readyOn(H.p, id))) { out.err = 'not ready'; return out; }
        await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
        await ensureActive(H.p, id);
        await sizeWinOn(H.p, id, 900, 680);
        let g = await settle14(H.p, id);
        const rec0 = await (await fetch(`${origin}/api/desktop/apps/${id}`)).json();
        const step = async (label, from, g1, recNow) => ({ label, from, scale: recNow.scale, gdk: recNow.gdkScale, pic: recNow.pictureScale, g: g1, bare: await bare14(H.p, id), tap: await H.p.evalJs('window.__d14.splice(0)') });
        out.steps.push(await step('auto', null, g, rec0));
        let recPrev = rec0;
        for (const choice of [1, 1.5, 2, 'auto', 1]) {
          const before = await H.p.evalJs(G14(id));
          const wmId = before && before.wmId;
          const pk = await pick14(H.p, id, choice);
          if (!pk.ok) { out.steps.push({ label: String(choice), refused: pk }); continue; }
          const next = await until(() => H.p.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(wmId)}); return w && w._desktopAppId !== ${JSON.stringify(id)} ? w._desktopAppId : null; })()`), 30000, 100);
          if (!next) { out.steps.push({ label: String(choice), err: 'never retargeted' }); break; }
          id = next; ids14.push([origin, id]);
          const recN = await readyOn(H.p, id);
          const gN = recN && await settle14(H.p, id);
          if (!gN) { out.steps.push({ label: String(choice), err: 'never connected' }); break; }
          const s = await step(String(choice), recPrev, gN, recN);
          s.before = before;
          s.want = M14.relaunchPaneCss({ pane: { w: before.pane.w, h: before.pane.h }, mainPx: before.stageScale < 1 && before.main ? { w: before.main.w, h: before.main.h } : null, dpr, from: recPrev, to: recN });
          out.steps.push(s);
          recPrev = recN;
        }
        // a resize after it: 1200×800 and back to 900×680 — the fit follows, the picture still covers the pane
        for (const [W, Hh] of [[1200, 800], [900, 680]]) {
          await sizeWinOn(H.p, id, W, Hh);
          await sleep(2200);
          out.steps.push({ label: `resize ${W}×${Hh}`, g: await H.p.evalJs(G14(id)), bare: await bare14(H.p, id) });
        }
        out.lastId = id;
      } catch (e) { out.err = e.stack || e.message; }
      finally { out.H = H; }
      return out;
    };
    const judge14 = (o, { control = false } = {}) => {
      const bad = [];
      for (const s of o.steps) {
        if (s.refused || s.err) { bad.push(`${s.label}: ${JSON.stringify(s.refused || s.err)}`); continue; }
        const m = s.g && s.g.margins;
        const mOk = !!m && Math.max(m.l, m.t, m.r, m.b) <= 1 + 1e-6;
        const pix = s.bare && s.bare.frac <= 0.002;
        if (!mOk || !pix) bad.push(`${s.label}: margins ${JSON.stringify(m && { l: +m.l.toFixed(2), t: +m.t.toFixed(2), r: +m.r.toFixed(2), b: +m.b.toFixed(2) })}, bare pane ${s.bare && (100 * s.bare.frac).toFixed(2)} %`);
      }
      return bad;
    };
    const fmt14 = (o) => o.steps.map((s) => s.refused || s.err ? `${s.label}: ${JSON.stringify(s.refused || s.err)}` : `${s.label}${s.scale ? ` (${s.scale}× = GDK ${s.gdk} × ${s.pic})` : ''}: window ${s.g.win.w.toFixed(1)}×${s.g.win.h.toFixed(1)}, pane ${s.g.pane.w.toFixed(1)}×${s.g.pane.h.toFixed(1)}${s.want ? ` (want ${s.want.w}×${s.want.h})` : ''}, X main ${s.g.main && `${s.g.main.w}×${s.g.main.h}`}, stage ${s.g.stageScale.toFixed(3)}${s.g.badge ? ' +badge' : ''}, margins ${s.g.margins && [s.g.margins.l, s.g.margins.t, s.g.margins.r, s.g.margins.b].map((v) => v.toFixed(2)).join('/')}, bare ${s.bare && (100 * s.bare.frac).toFixed(2)} %, column ${s.g.col && typeof s.g.col === 'object' ? `${s.g.col.css.toFixed(1)} CSS (${(100 * (1 - s.g.col.css / s.g.pane.w)).toFixed(1)} % the app's own background)` : '?'}`).join('\n    ');
    try {
      for (const dpr of [2, 1]) {
        const o = await runScale14(O14, dpr, wt, 'ours');
        console.log(`  §15 DPR ${dpr}: ${o.err ? 'ERR ' + o.err : ''}\n    ${fmt14(o)}`);
        const bad = judge14(o);
        check(`§15 DPR ${dpr}: at EVERY transition (auto → 1 → 1.5 → 2 → auto → 1) and after a resize to 1200×800 and back, the picture covers the pane — each edge ≤ 1 CSS px, none of the pane's own background in the screenshot`, !o.err && o.steps.length === 8 && bad.length === 0, bad);
        const rel = o.steps.filter((s) => s.want && !s.err && !s.refused);
        const wsCap = await o.H.p.evalJs(`(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
        const follows = rel.filter((s) => { const capW = s.g.win.w >= wsCap.w - 2, capH = s.g.win.h >= wsCap.h - 2; const minH = s.g.main && s.g.main.hints && s.g.main.hints['minimum-size'] ? s.g.main.hints['minimum-size'][1] * s.g.picture / dpr : 0; return !((capW || Math.abs(s.g.pane.w - s.want.w) <= 1.5) && (capH || Math.abs(s.g.pane.h - s.want.h) <= 1.5 || s.g.pane.h >= minH - 1)); });
        check(`§15 DPR ${dpr}: a Scale ▸ relaunch RESIZES the window to keep the app's logical size — every new pane is relaunchPaneCss's (±1.5 px) unless the workspace caps it or the new app's minimum raises it (${rel.map((s) => `${s.label}: ${s.g.pane.w.toFixed(1)}×${s.g.pane.h.toFixed(1)} vs ${s.want.w}×${s.want.h}`).join('; ')})`, rel.length === 5 && follows.length === 0, follows.map((s) => ({ label: s.label, pane: s.g.pane, want: s.want, fit: s.g.fit })));
        // the app looks the SAME, scaled: its column ∝ the widgets' true scale (unscaled steps only — a scaled-to-fit picture is the badge's case)
        const cols = o.steps.filter((s) => s.scale && s.g && s.g.col && typeof s.g.col === 'object' && s.g.stageScale === 1).map((s) => ({ label: s.label, per: s.g.col.css / M14.renderOf({ scale: s.scale, gdkScale: s.gdk, pictureScale: s.pic }).widget }));
        const base = cols.length ? cols[0].per : 0;
        const off = cols.filter((c) => Math.abs(c.per / base - 1) > 0.03);
        check(`§15 DPR ${dpr}: the calculator's column is ∝ its widgets' TRUE scale at every unscaled step (${cols.map((c) => `${c.label} ${c.per.toFixed(1)}`).join(', ')} CSS px per 1× — ±3 %): 1.5× is 0.75 of 2×, never the floor rule's 0.5`, cols.length >= 3 && off.length === 0, off);
        // F3: every connect maps the main at its final size (the map-window's geometry = the settled main)
        // …unless the APP re-announced its size constraints after that map (B-4260 — measured: GNOME Calculator 46 / GTK 4.14
        // replaces the minimum it mapped with ~0.2 s later, 694×1004 → 694×980 at 2×; 50 / 4.22 never does): then the map was
        // the fit of what the app had said, and the refit follows the app — named with both constraint sets, never assumed
        const f3 = o.steps.filter((s) => s.tap && s.tap.some((e) => e.ty === 'new-window')).map((s) => {
          // the map of THE NEW WINDOW (its wid) — a step's tap can also hold another window's map-window
          const nw = s.tap.find((e) => e.ty === 'new-window'), firstMap = s.tap.find((e) => e.ty === 'map-window');
          const map = (nw && s.tap.find((e) => e.ty === 'map-window' && e.g[0] === nw.g[0])) || firstMap;
          console.log(`    §15 DPR ${dpr} F3 ${s.label}: new-window wid ${nw && nw.g[0]} at ${nw && nw.at}; first map-window wid ${firstMap && firstMap.g[0]} ${firstMap && firstMap.g.slice(3, 5)} at ${firstMap && firstMap.at}; its own map ${map && map.g.slice(3, 5)}; tap ${s.tap.map((e) => `${e.ty}:${e.g[0]}@${e.at}`).join(' ')}`.slice(0, 900));
          const later = map && nw ? s.tap.filter((e) => e.ty === 'window-metadata' && e.g[0] === nw.g[0] && e.at > map.at && e.sc && e.sc !== nw.sc) : [];
          return { label: s.label, map: map && map.g.slice(3, 5), main: s.g.main && [s.g.main.w, s.g.main.h], reannounced: later.length ? `${nw.sc} → ${later[later.length - 1].sc}` : null };
        });
        const f3ok = (x) => x.map && x.main && ((x.map[0] === x.main[0] && x.map[1] === x.main[1]) || !!x.reannounced);
        check(`§15 DPR ${dpr} F3: every connect maps the main window at its FINAL size (the fold happens before the fit): ${f3.map((x) => `${x.label} map ${x.map} = main ${x.main}${x.reannounced && (x.map[0] !== x.main[0] || x.map[1] !== x.main[1]) ? ` (the app re-announced ${x.reannounced} after the map — the refit follows it)` : ''}`).join('; ')}`, f3.length >= 5 && f3.every(f3ok), f3);
        if (o.lastId) await fetch(`${O14}/api/desktop/apps/${o.lastId}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        await dropPage(o.H);
      }
    } catch (e) { threw('§15', e); }
    finally { for (const [o, id] of ids14.splice(0)) await fetch(`${o}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); }
  }

  // ── §16 LANE D (a) item C — CHROME UNDER SEAMLESS (the owner's second screenshot: "Chrome的顶部标题栏似乎不会自动隐藏？"
  // — two bars stacked). MEASURED (Chrome 153.0.8010.47, xpra 6.5.3): the bar the owner read as Chrome's is OURS (Chrome's
  // X title + icon on our title bar) — Chrome does not know xpra's WM, so "Use system title bar and borders" is its default:
  // `decorations: 1`, no ─ □ ✕ of its own, ⇒ `ssd`. The keeper now seeds the profile's `browser.custom_chrome_frame: true`
  // (once, when absent) before the browser starts ⇒ `decorations: 0` ⇒ seamless like GNOME Calculator. Asserted on the
  // real binary: both VibeSpace bars 0 high (the strip folds WITH the title bar), the top-edge hover and Alt reveal both,
  // a drag of Chrome's tab strip moves OUR window by exactly the gesture (our own press — Chrome's root point is +10,+5
  // off), Chrome's own □ / restore / ─ / ✕ act on OUR window (the ✕ closes it, A2). SKIPPED by name without a chromium-
  // family binary. CONTROL = the same copy with the seeding pulled: decorations 1, `ssd`, both bars shown. ──
  console.log('§16 lane D (a) item C — Chrome draws its own frame: seamless like the Calculator, its own ─ □ ✕ act on our window');
  const reg15 = await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps`).then((r) => r.json()).then((d) => (d.registry || []).find((r) => r.id === 'chromium') || null).catch(() => null); // from node: p1 sits on about:blank since §11
  const CHROME15 = reg15 && reg15.available && /google-chrome|chromium/.test(String(reg15.exec || '')) ? reg15 : null;
  if (!CHROME15) skip('§16 the Chrome seamless legs', reg15 ? `the chromium row is not launchable here (${reg15.reason || reg15.exec})` : 'no chromium row');
  const S15 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; const c = v && v.client; const main = c && c.mainWid ? c.windows.get(c.mainWid) : null;
    const pr = v && v.pane ? v.pane.getBoundingClientRect() : null, er = w.element.getBoundingClientRect();
    return { wmId: w.id, status: v ? v.status.textContent : null, v: w._desktopSeamless || null, cls: w.element.className, revealed: w.element.classList.contains('seamless-revealed'), tbH: w.titleBar.offsetHeight, barH: v && v.bar ? v.bar.getBoundingClientRect().height : null, stripVisible: !!(v && v.bar && [...v.bar.children].some((e) => getComputedStyle(e).visibility === 'visible' && e.getBoundingClientRect().height > 0)),
      max: !!w.isMaximized, min: !!w.isMinimized, st: (w._desktopStateLog || []).map((e) => e.act), mr: (w._desktopMoveResizeLog || []).map((e) => [e.direction, e.op, e.started]),
      main: main && { x: main.x, y: main.y, w: main.w, h: main.h, deco: main.meta.decorations, iconic: !!main.meta.iconic, maximized: !!main.meta.maximized }, pane: pr && { x: pr.x, y: pr.y, w: pr.width, h: pr.height }, win: { x: er.x, y: er.y, w: er.width, h: er.height } }; })()`;
  const runChrome15 = async (origin, wtree, tag) => {
    const H = await mkPage(origin, { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
    const o = { tag };
    try {
      const l = await launchOn(H.p, { appId: 'chromium', uiScale: 1 });
      o.id = l && l.id;
      if (!o.id) { o.err = l; return o; }
      const r = await readyOn(H.p, o.id);
      if (!r) { o.err = 'not ready'; return o; }
      o.rec = r;
      await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(o.id)}); true`);
      await ensureActive(H.p, o.id);
      await sizeWinOn(H.p, o.id, 900, 620);
      o.s0 = await until(async () => { const s = await H.p.evalJs(S15(o.id)); return s && s.status === 'Connected' && s.main && s.main.deco !== undefined ? s : null; }, 45000, 300);
      await sleep(4000); // Chrome's first paint + its startup windows
      o.s1 = await H.p.evalJs(S15(o.id));
      try { o.prefs = JSON.parse(fs.readFileSync(path.join(r.profileDir, 'Default', 'Preferences'), 'utf8')).browser || null; } catch { o.prefs = null; }
      o.marker = fs.existsSync(path.join(r.profileDir, '.vibespace-frame-seeded'));
      o.xprops = xq(xenvFor(wtree, r), 'xprop', ['-root', '_NET_SUPPORTING_WM_CHECK']) ? (() => { const ids = xq(xenvFor(wtree, r), 'xdotool', ['search', '--onlyvisible', '--class', 'google-chrome']).split('\n').filter((x) => /^\d+$/.test(x)); return ids.map((wid) => xq(xenvFor(wtree, r), 'xprop', ['-id', wid, '_MOTIF_WM_HINTS', '_GTK_FRAME_EXTENTS']).replace(/\n/g, ' | ').trim()); })() : [];
    } catch (e) { o.err = e.stack || e.message; }
    o.H = H;
    return o;
  };
  if (CHROME15) {
    const O15 = `http://127.0.0.1:${PORT}`;
    let o = null;
    try {
      o = await runChrome15(O15, wt, 'ours');
      const s1 = o.s1;
      console.log(`  §16: record ${o.rec && o.rec.exec} scale ${o.rec && o.rec.scale}; profile browser prefs ${JSON.stringify(o.prefs)}, marker ${o.marker}; X ${JSON.stringify(o.xprops)}; verdict ${JSON.stringify(s1 && s1.v)}; title bar ${s1 && s1.tbH} px, strip ${s1 && s1.barH} px; main ${s1 && s1.main && JSON.stringify(s1.main)}`);
      check('§16 (1): the keeper seeded the profile BEFORE Chrome started — Default/Preferences says browser.custom_chrome_frame true, the once-marker beside it', !!o.prefs && o.prefs.custom_chrome_frame === true && o.marker, { prefs: o.prefs, marker: o.marker, err: o.err });
      check(`§16 (1): Chrome draws its OWN frame — its main window says decorations 0 (X: ${JSON.stringify(o.xprops)}) ⇒ .window.seamless, why csd`, !!s1 && !!s1.main && s1.main.deco === 0 && !!s1.v && s1.v.seamless === true && s1.v.why === 'csd' && / seamless/.test(s1.cls), s1 && { v: s1.v, main: s1.main });
      check(`§16 (1): BOTH VibeSpace bars fold — the title bar ${s1 && s1.tbH} px and the status strip ${s1 && s1.barH} px high, nothing of the strip visible (it folds WITH the title bar, no rule of its own)`, !!s1 && s1.tbH === 0 && s1.barH === 0 && !s1.stripVisible, s1 && { tbH: s1.tbH, barH: s1.barH, strip: s1.stripVisible });
      const P = o.H.p;
      // (2) the hover of the top edge reveals both, back in the app folds them; Alt reveals both
      const [wx, wy] = [s1.win.x, s1.win.y];
      await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wx + 300, y: wy + 60 }); await sleep(100);
      await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wx + 300, y: wy + 2 }); await sleep(500);
      const hv = await P.evalJs(S15(o.id));
      await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wx + 300, y: wy + 300 }); await sleep(2000);
      const back = await P.evalJs(S15(o.id));
      await P.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 }); await sleep(200);
      const alt = await P.evalJs(S15(o.id));
      await P.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 }); await sleep(2000);
      check(`§16 (2): a 250 ms hover of the top edge reveals BOTH bars (title bar ${hv.tbH} px, strip ${hv.barH.toFixed(0)} px); back in the app they fold (${back.tbH}/${back.barH}); Alt reveals both (${alt.tbH}/${alt.barH.toFixed(0)})`, hv.revealed && hv.tbH >= 20 && hv.barH >= 20 && !back.revealed && back.tbH === 0 && back.barH === 0 && alt.revealed && alt.tbH >= 20 && alt.barH >= 20, { hv: [hv.tbH, hv.barH], back: [back.tbH, back.barH], alt: [alt.tbH, alt.barH] });
      // (3) a drag of Chrome's own tab strip (pane 500,18) by 120×64 moves OUR window by exactly that; X's main stays at 0,0
      const d0 = await P.evalJs(S15(o.id));
      const sx = d0.pane.x + 500, sy = d0.pane.y + 18;
      await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy }); await sleep(100);
      await P.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 12; i++) { await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + 120 * i / 12, y: sy + 64 * i / 12, button: 'left', buttons: 1 }); await sleep(40); }
      await sleep(150);
      await P.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sx + 120, y: sy + 64, button: 'left', clickCount: 1 });
      await sleep(1200);
      const d1 = await P.evalJs(S15(o.id));
      const dx = d1.win.x - d0.win.x, dy = d1.win.y - d0.win.y;
      check(`§16 (3): a drag of Chrome's OWN tab strip by 120×64 moves the VibeSpace window by ${dx.toFixed(1)}/${dy.toFixed(1)} (±2 — our own press, not Chrome's root point: +10,+5 off, measured) through initiate-moveresize 8 (${JSON.stringify(d1.mr.slice(-1))}); X's main stays at 0,0`, Math.abs(dx - 120) <= 2 && Math.abs(dy - 64) <= 2 && d1.mr.some((m) => m[0] === 8 && m[1] === 'move' && m[2]) && d1.main.x === 0 && d1.main.y === 0, { dx, dy, mr: d1.mr });
      // (4) Chrome's OWN caption buttons — a MEASURED fact per Chrome major (the .197 integration: the runner box moved to
      // Chrome 154 on 2026-09-28 and ─ at 153's −102 missed): pane-relative centres from the right edge, y 20. A major
      // with no measured row is a RED check naming the measurement to take — never a click at a guessed place.
      //   153: ✕ −23, □ −63, ─ −102 (40 px apart — the lane-D measurement)
      //   154: ✕ −20, □ −52, ─ −84 (32 px apart — measured 2026-09-29 on 154.0.8037.57: google-chrome under Xvfb, a 900×620
      //        window, custom_chrome_frame seeded like the keeper's; the ink columns' centres −20.5 / −52.5 / −84.5)
      const CAPTIONS = { 153: { close: 23, max: 63, min: 102 }, 154: { close: 20, max: 52, min: 84 } };
      let chromeMajor = null;
      try { chromeMajor = Number((/(\d+)\./.exec(execFileSync(String(CHROME15.path || CHROME15.exec).split(/\s+/)[0], ['--version'], { encoding: 'utf8', timeout: 10000 })) || [])[1]) || null; } catch { chromeMajor = null; }
      const cap = CAPTIONS[chromeMajor] || null;
      check(`§16 (4): Chrome ${chromeMajor}'s caption layout is a MEASURED row (${cap ? `✕ −${cap.close}, □ −${cap.max}, ─ −${cap.min}` : 'none — measure the ─ □ ✕ centres of this Chrome and add its row'})`, !!cap, { chromeMajor, exec: CHROME15.exec, path: CHROME15.path });
      if (!cap) throw new Error(`no measured caption layout for Chrome ${chromeMajor}`);
      const clickPane = async (fromRight, y) => { const s = await P.evalJs(S15(o.id)); await trustedClickAt(P, s.pane.x + s.pane.w - fromRight, s.pane.y + y); };
      await clickPane(cap.max, 20);
      const mx = await until(async () => { const s = await P.evalJs(S15(o.id)); return s && s.max ? s : null; }, 4000, 150);
      check(`§16 (4): Chrome's own □ ⇒ window-metadata {maximized:true} ⇒ OUR window maximized (${JSON.stringify(mx && mx.st)})`, !!mx && mx.st.includes('maximize'), mx && mx.st);
      await sleep(800);
      await clickPane(cap.max, 16);
      const rs = await until(async () => { const s = await P.evalJs(S15(o.id)); return s && !s.max ? s : null; }, 4000, 150);
      check(`§16 (4): its restore ⇒ ours restored (${JSON.stringify(rs && rs.st)})`, !!rs && rs.st.includes('restore'), rs && rs.st);
      await sleep(800);
      await clickPane(cap.min, 20);
      const mn = await until(async () => { const s = await P.evalJs(S15(o.id)); return s && s.min ? s : null; }, 4000, 150);
      check(`§16 (4): its ─ ⇒ {iconic:true} ⇒ OUR window minimized`, !!mn && mn.st.includes('minimize'), mn && mn.st);
      await P.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(o.id)}); app.wm.restore(w.id); return true; })()`);
      const un = await until(async () => { const s = await P.evalJs(S15(o.id)); return s && !s.min && s.main && !s.main.iconic ? s : null; }, 5000, 150);
      check('§16 (4): restoring OUR window tells the display (Chrome un-iconified) and the picture is back', !!un && un.status === 'Connected', un && { main: un.main, status: un.status });
      await sleep(800);
      const wmId = (await P.evalJs(S15(o.id))).wmId;
      await clickPane(cap.close, 20);
      const gone = await until(() => P.evalJs(`!app.wm.windows.has(${JSON.stringify(wmId)})`), 15000, 250);
      const endR = await (await fetch(`${O15}/api/desktop/apps/${o.id}`)).json();
      check(`§16 (4): Chrome's own ✕ ends Chrome (${endR.state}, code ${endR.exitCode}) and OUR window closes itself (A2)`, !!gone && endR.state === 'exited', { state: endR.state, code: endR.exitCode, windowsAtExit: endR.windowsAtExit });
    } catch (e) { threw('§16', e); }
    finally { if (o && o.id) await fetch(`${O15}/api/desktop/apps/${o.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); if (o) await dropPage(o.H); }
  }

  // CONTROL for §15 + §16 — a copy of this tree with the lane-D levers pulled back (the floor knobs, no relaunch fit, no
  // Chrome seeding): 2× → 1.5× halves the calculator's column in a window that kept its size, and Chrome stays SSD
  if (CALC14 || CHROME15) {
    const wtd = scratch('deskxpra-dctl');
    try { execSync(`git worktree remove --force ${wtd}`, { cwd: repo, stdio: 'ignore' }); } catch {}
    execSync(`git worktree add --detach ${wtd} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtd);
    for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wtd}/${f} && cp -r ${wt}/${f} ${wtd}/${f}`);
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtd, 'node_modules'));
    fs.mkdirSync(path.join(wtd, 'data'), { recursive: true });
    const levers = [
      ['src/desktop-fit.js', "  const gdkScale = r === 'dpi' ? Math.max(1, Math.min(SCALE_MAX, Math.floor(s))) : Math.max(1, Math.min(SCALE_MAX, Math.ceil(s - 1e-9)));", '  const gdkScale = Math.max(1, Math.min(SCALE_MAX, Math.floor(s))); // lane D CONTROL: the floor rule'],
      ['src/desktop-fit.js', "  const dpi = r === 'dpi' ? Math.round(96 * s / gdkScale) : 96;", '  const dpi = Math.round(96 * s / gdkScale);'],
      ['src/desktop-fit.js', "  const pictureScale = r === 'dpi' ? 1 : round4(s / gdkScale);", '  const pictureScale = 1;'],
      ['src/lib/desktop-app-window.js', '    fitAfterRelaunch(geo, r.app); // lane D (a) F2: the window keeps the app\'s size at the new scale', '    void geo; // lane D CONTROL: the window keeps its size'],
      ['src/desktop-serve.js', "      if (rec.browser === 'chromium' && rec.profileDir) {", "      if (false) { // lane D CONTROL: Chrome not seeded"],
    ];
    let once = true;
    for (const [f, from, to] of levers) { const src = fs.readFileSync(path.join(wtd, f), 'utf8'); if (src.split(from).length !== 2) { once = false; console.error(`    lever not spelled once in ${f}: ${from.slice(0, 70)}`); } fs.writeFileSync(path.join(wtd, f), src.replace(from, to)); }
    check('§15/§16 CONTROL: each lane-D lever is spelled exactly once (the copy patches exactly those)', once);
    rebaseline(wtd); execSync('npm run build', { cwd: wtd, stdio: 'ignore' });
    const [PORTD] = await freePorts(1);
    const homeD = scratchHome('deskxpra-dctl-home', fs);
    const sd = spawnCopy('the pre-lane-D copy', wtd, { ...srvEnv, PORT: String(PORTD), HOME: homeD }); ctlServers.push(sd);
    let upD = await bootedCopy(sd, PORTD);
    check('§15/§16 CONTROL: the pre-lane-D copy boots', upD, sd.bootWhy);
    if (upD) {
      const OD = `http://127.0.0.1:${PORTD}`;
      try {
        if (CALC14) {
          // the owner's own transition only: DPR 2, auto (2×) → 1.5× on the copy
          const H = await mkPage(OD, { width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false });
          try {
            await H.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`); await openPage(H.p, OD);
            const l = await launchOn(H.p, { appId: 'gnome-calculator', uiScale: 1 });
            let id = l && l.id;
            if (id && await readyOn(H.p, id)) {
              ids14.push([OD, id]);
              await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`); await ensureActive(H.p, id); await sizeWinOn(H.p, id, 900, 680);
              const g0 = await settle14(H.p, id);
              const wmId = g0 && g0.wmId;
              const pk = await pick14(H.p, id, 1.5);
              const next = pk.ok && await until(() => H.p.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(wmId)}); return w && w._desktopAppId !== ${JSON.stringify(id)} ? w._desktopAppId : null; })()`), 30000, 100);
              if (next) { id = next; ids14.push([OD, id]); }
              const g1 = next && await readyOn(H.p, id) && await settle14(H.p, id);
              const ratioC = g0 && g1 && typeof g0.col === 'object' && typeof g1.col === 'object' ? g1.col.css / g0.col.css : null;
              console.log(`  CONTROL §15: 2× column ${g0 && g0.col && g0.col.css && g0.col.css.toFixed(1)} CSS in a ${g0 && g0.pane.w.toFixed(1)} pane → 1.5× column ${g1 && g1.col && g1.col.css && g1.col.css.toFixed(1)} CSS in a ${g1 && g1.pane.w.toFixed(1)} pane (ratio ${ratioC && ratioC.toFixed(3)})`);
              // THE CONTROL'S PREMISE IS A BUTTON-BOUND CALCULATOR (B-4260 — the box's measured row): the pre-lane-D rule
              // (GDK_SCALE 1 + Xft.dpi 144) draws widgets at 1× and only text at 1.5×, which halves a button-bound column
              // (calculator 50 / GTK 4.22, the owner's screenshot); a TEXT-bound one (46 / 4.14 — its minimum grows at
              // Xft.dpi 144: ${G15.calcMin1x} → ${G15.calcMin1xDpi144}) is not halved, so on such a box this leg asserts
              // the row's measured ratio and says the halving control is a button-bound box's — never a skip
              if (G15.calcButtonBound) check(`§15 CONTROL: on the pre-lane-D copy 2× → 1.5× HALVES the calculator's column (ratio ${ratioC && ratioC.toFixed(3)}, not 0.75) in a window that KEPT its size (${g0 && g0.pane.w.toFixed(1)} → ${g1 && g1.pane.w.toFixed(1)}) — the app's own background ${g0 && g1 ? `${(100 * (1 - g0.col.css / g0.pane.w)).toFixed(0)} % → ${(100 * (1 - g1.col.css / g1.pane.w)).toFixed(0)} %` : '?'} of the width: the owner's screenshot`, ratioC != null && Math.abs(ratioC - 0.5) < 0.03 && Math.abs(g1.pane.w - g0.pane.w) <= 1, { g0: g0 && g0.col, g1: g1 && g1.col });
              else check(`§15 CONTROL (a TEXT-bound calculator ${G15.calculator}, GTK ${G15.gtk}: its 1× minimum ${G15.calcMin1x.join('x')} → ${G15.calcMin1xDpi144.join('x')} at Xft.dpi 144): the pre-lane-D copy draws its column at the row's measured ${G15.controlRatio15} of 2× (ratio ${ratioC && ratioC.toFixed(3)}) in a window that KEPT its size — the halving the fix answers is a BUTTON-bound calculator's, judged on a GTK 4.22 box`, ratioC != null && Math.abs(ratioC - G15.controlRatio15) < 0.03 && Math.abs(g1.pane.w - g0.pane.w) <= 1, { g0: g0 && g0.col, g1: g1 && g1.col });
            } else check('§15 CONTROL: the calculator launches on the copy', false, l);
          } finally { await dropPage(H); }
        }
        if (CHROME15) {
          const c = await runChrome15(OD, wtd, 'ctl');
          const s1 = c.s1;
          check(`§16 CONTROL: without the seeding a fresh profile draws NO frame of its own (decorations ${s1 && s1.main && s1.main.deco}, X ${JSON.stringify(c.xprops)}) ⇒ ${JSON.stringify(s1 && s1.v && { seamless: s1.v.seamless, why: s1.v.why })}, OUR title bar ${s1 && s1.tbH} px + strip ${s1 && s1.barH && s1.barH.toFixed(0)} px stacked above Chrome — the owner's screenshot`, !!s1 && !!s1.main && s1.main.deco === 1 && s1.v && s1.v.seamless === false && s1.v.why === 'ssd' && s1.tbH >= 20 && s1.barH >= 20, s1 && { v: s1.v, main: s1.main, tbH: s1.tbH, barH: s1.barH });
          if (c.id) await fetch(`${OD}/api/desktop/apps/${c.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
          await dropPage(c.H);
        }
      } catch (e) { threw('§15/§16 CONTROL', e); }
      finally { for (const [o, id] of ids14.splice(0)) await fetch(`${o}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); await sleep(1500); }
    }
    try { sd.kill('SIGKILL'); } catch {}
  }
} catch (e) {
  crashed(e, p1);
} finally {
  p1.close();
}
finish();
