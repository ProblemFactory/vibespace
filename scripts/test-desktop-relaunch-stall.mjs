#!/usr/bin/env node
// B-92aa — THE RACE PLACED, ITS OWN SUITE (the coordinator's r1486: «its own heavy suite with its own budget, a row of the desktop
// class»; it ran inside test-desktop-xpra-window-scale, whose 568 s budget ended the box run of 026e8423d before its copy booted).
// test-desktop-xpra-window-scale §15 F3 («every connect maps the main window at its FINAL size») reds ~1 in 3 on a loaded box.
// The relaunch's order is retarget (the NEW connection starts) → fitAfterRelaunch (the window takes its new size). THE STALL: a
// copy of this tree whose fitAfterRelaunch is HELD until the new connection's main window is mapped (its client's mainWid,
// bounded 8 s), so the fit lands after the map — the order a slow box can give; then F3 is MEASURED on it with §15's own steps
// (runScale14, the same walk at DPR 1): a relaunch mapped at a size other than its settled main and refit by the client NAMES
// the order (the cure is that order, one unit); every map final anyway ⇒ the order is not the cause (the row's flake half closes
// as not reproduced). Printed whole — «B-92aa VERDICT: …». It runs at every gate that runs its class (never behind a flag).
// r1635: row 104 NAMED the order (3 of 5 relaunches mapped stale); the cure hands the fit's plan to the new connection's first
// map, so this suite is now THE PROOF: with the hold in place, a stale map is a red check, not a verdict.
// B-a52d (主开发 r4884) — THE SECOND ORDER: the hub broadcasts the successor BEFORE it answers the press, and the window follows the
// broadcast at once. The same copy also HOLDS THE PRESS's ANSWER until the successor's main window is mapped (bounded 8 s), so the
// window's new connection maps before the answer — at the release every relaunch that changes the size mapped stale and was refit
// (the placed stall 823b4235e-20261126093305-box, DPR 1 and 2). Each walk picks its hold (the page's __vsStallMode: 'fit' | 'reply');
// the answer's order is walked at DPR 1 and DPR 2 (tonight's reds at both), the fit's at DPR 1 as before.
// The boot (the worktree server on the real xpra rung, headless chrome, the private runtime dir) and the teardown are
// scripts/xpra-window-boot.mjs's (the xpra window family's helper; this suite is no part of that family: it holds none of the
// giant's §§, test-ci-gate-tiers §8d). §15's walk (runScale14 and what it reads) is copied from test-desktop-xpra-window-scale,
// which keeps its own and its time.
// Run: node scripts/test-desktop-relaunch-stall.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, gtkRow } from './scratch.mjs';
import { bootXpraWindow } from './xpra-window-boot.mjs';

const require = createRequire(import.meta.url);
const { bin, bootedCopy, check, copyLeft, crashed, ctlServers, endCopy, ensureActive, finish, launchOn, mkPage, openPage, page, PORT, readyOn,
  repo, sizeWinOn, skip, dropPage, sleep, spawnCopy, srvEnv, target, threw, until, worktrees, wt } = await bootXpraWindow('test-desktop-relaunch-stall');
let p1 = await page(target);
try {
  console.log('B-92aa — the relaunch fit held past the new connection\'s map (a placed stall on a copy), F3 measured on §15\'s own walk at DPR 1');
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
      margins: mr && { l: mr.x - pr.x, t: mr.y - pr.y, r: pr.right - mr.right, b: pr.bottom - mr.bottom }, col, fit: w._desktopRelaunchFit || null, max: !!w.isMaximized, holds: (w._desktopStallHolds || []).slice(), replyHolds: (w._desktopReplyHolds || []).slice() }; })()`;
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
      set onmessage(fn) { super.onmessage = (e) => { try { const m = e.data; if (m && m.c === 'p' && Array.isArray(m.p)) { const ty = nm(m.p[0]); const md = ty === 'new-window' ? m.p[6] : ty === 'window-metadata' ? m.p[2] : null; const sc = md && (md['size-constraints'] || md['size-hints']) ? JSON.stringify(md['size-constraints'] || md['size-hints']) : null; if (ty === 'new-window' || ty === 'window-move-resize') window.__d14.push({ at: Math.round(performance.now()), d: 'in', ty, g: m.p.slice(1, 6), sc }); else if (ty === 'window-resized') window.__d14.push({ at: Math.round(performance.now()), d: 'in', ty, g: [m.p[1], null, null, m.p[2], m.p[3]], sc: null }); else if (ty === 'window-metadata' && sc) window.__d14.push({ at: Math.round(performance.now()), d: 'in', ty, g: [m.p[1]], sc }); } } catch {} return fn(e); }; } get onmessage() { return super.onmessage; } }
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
  let runScale14 = null; // B-92aa: the placed-stall leg below runs it on its own copy
  if (!CALC14) skip('§15 the scale-geometry legs', 'gnome-calculator not on PATH');
  else {
    runScale14 = async (origin, dpr, wtree, tag, mode = null) => {
      const H = await mkPage(origin, { width: 1400, height: 1000, deviceScaleFactor: dpr, mobile: false });
      const out = { steps: [], dpr, tag };
      try {
        await H.p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: TAP14 });
        await H.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`); await openPage(H.p, origin);
        if (mode) await H.p.evalJs(`globalThis.__vsStallMode = ${JSON.stringify(mode)}; true`); // B-a52d: the copy's hold for this walk (none outside the copy)
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
  }
  // B-92aa (the coordinator's r992): THE RACE PLACED, never by load. §15 F3 reds ~1 in 3 on a loaded box (the 11-18 red at load
  // 31: a 1.5× relaunch mapped 1634×1232, then the client refit at +152 ms and +1.4 s to 1818×1232), green 3/3 at a normal
  // load. The relaunch's order is retarget (the NEW connection starts) → fitAfterRelaunch (the window takes its new size).
  // THE STALL: a copy whose fitAfterRelaunch is HELD until the new connection's main window is mapped (its client's mainWid),
  // so the fit lands after the map — the order a slow box can give. Then F3 is MEASURED on it: if a relaunch maps at a size
  // other than its settled main and the client refits it, the order is NAMED (the cure is that order, one unit); if every
  // map is final anyway, the order is not the cause and the row's flake half closes as not reproduced. Printed whole.
  if (CALC14 && runScale14) {
    const wts = scratch('deskxpra-stall');
    try { execSync(`git worktree remove --force ${wts}`, { cwd: repo, stdio: 'ignore' }); } catch {}
    execSync(`git worktree add --detach ${wts} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wts);
    for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wts}/${f} && cp -r ${wt}/${f} ${wts}/${f}`);
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wts, 'node_modules'));
    fs.mkdirSync(path.join(wts, 'data'), { recursive: true });
    const FROM = "    fitAfterRelaunch(geo, next, plan); // lane D (a) F2: the window keeps the app's size at the new scale — the SAME plan";
    const TO = "    if (globalThis.__vsStallMode !== 'fit') fitAfterRelaunch(geo, next, plan); else { const g9 = geo, a9 = next, p9 = plan, t9 = Date.now(); const held = () => { const c9 = view && view.client; if ((c9 && c9.mainWid) || Date.now() - t9 > 8000) { (winInfo._desktopStallHolds = winInfo._desktopStallHolds || []).push(Date.now() - t9); fitAfterRelaunch(g9, a9, p9); } else setTimeout(held, 20); }; setTimeout(held, 20); } // B-92aa PLACED STALL: the relaunch fit held until the new connection's main window is mapped";
    const FROM2 = "    let r = await post(false);";
    const TO2 = "    const id9 = id; let r = await post(false); if (globalThis.__vsStallMode === 'reply') await new Promise((res9) => { const t9 = Date.now(); const held = () => { const c9 = view && view.client; const mapped = id !== id9 && !!(c9 && c9.mainWid); if (mapped || Date.now() - t9 > 8000) { (winInfo._desktopReplyHolds = winInfo._desktopReplyHolds || []).push({ ms: Date.now() - t9, mapped }); res9(); } else setTimeout(held, 20); }; held(); }); // B-a52d PLACED STALL: the press's answer held until the successor's main window is mapped";
    const wf = path.join(wts, 'src/lib/desktop-app-window.js'); const src9 = fs.readFileSync(wf, 'utf8');
    check('B-92aa stall: the relaunch fit\'s call is spelled exactly once (the copy holds exactly it)', src9.split(FROM).length === 2);
    check('B-a52d stall: the press\'s answer is read exactly once (the copy holds exactly it)', src9.split(FROM2).length === 2);
    fs.writeFileSync(wf, src9.replace(FROM, TO).replace(FROM2, TO2));
    execSync('npm run build:bundles', { cwd: wts, stdio: 'ignore' });
    const [PORTS] = await freePorts(1);
    const homeS = scratchHome('deskxpra-stall-home', fs);
    const ss = spawnCopy('the stalled-fit copy', wts, { ...srvEnv, PORT: String(PORTS), HOME: homeS }); ctlServers.push(ss);
    const upS = await bootedCopy(ss, PORTS);
    check('B-92aa stall: the stalled-fit copy boots', upS, ss.bootWhy);
    if (upS) {
      const OS = `http://127.0.0.1:${PORTS}`;
      try {
        const o = await runScale14(OS, 1, wts, 'stall', 'fit');
        const rows = o.steps.filter((st) => st.tap && st.tap.some((e) => e.ty === 'new-window')).map((st) => {
          const nw = st.tap.find((e) => e.ty === 'new-window');
          const map = st.tap.find((e) => e.ty === 'map-window' && nw && e.g[0] === nw.g[0]);
          const refits = map ? st.tap.filter((e) => e.ty === 'configure-window' && e.g[0] === nw.g[0] && e.at > map.at).map((e) => [e.at - map.at, e.g.slice(3, 5)]) : [];
          return { label: st.label, map: map && map.g.slice(3, 5), main: st.g && st.g.main && [st.g.main.w, st.g.main.h], refits };
        });
        const stale = rows.filter((x) => x.map && x.main && (x.map[0] !== x.main[0] || x.map[1] !== x.main[1]) && x.refits.length);
        // the stall's own proof: each relaunch fit the copy HELD, its held ms (the window keeps the list across its retargets)
        const holds = ([...o.steps].reverse().find((st) => st.g && Array.isArray(st.g.holds)) || { g: { holds: [] } }).g.holds;
        console.log(`    MEASURE B-92aa (not a proof): the stalled fit at DPR 1 — ${rows.map((x) => `${x.label} map ${x.map} = main ${x.main}${x.refits.length ? ` (the client refit ${JSON.stringify(x.refits)})` : ''}`).join('; ')}`);
        console.log(`    B-92aa VERDICT: ${!holds.length ? 'NONE — the copy held no relaunch fit (the stall never ran: no measure)' : stale.length ? `the ORDER still MAPS STALE — ${stale.length} relaunch(es) mapped at a stale size and the client refit them (${stale.map((x) => `${x.label} ${x.map} → ${x.main}`).join(', ')})` : 'THE CURE HOLDS — with the relaunch fit held past the map, every relaunch mapped at its final size (the first map took the fit\'s plan)'}`);
        check(`B-92aa THE CURE (r1635): with the relaunch fit HELD past the new connection's map, every relaunch maps at its FINAL size — the first map takes the fit's plan (row 104 at 0cc12963d: 3 of 5 mapped stale)`, holds.length >= 1 && stale.length === 0, rows);
        check(`B-92aa stall: the copy HELD the relaunch fit past the map (${holds.length} held: ${holds.join(', ')} ms)`, holds.length >= 1, o.steps.map((x) => x.label));
        check(`B-92aa stall: the stalled-fit copy ran its transitions (${rows.length} connects measured)`, rows.length >= 4, o.steps.map((x) => x.label + (x.err ? ':' + JSON.stringify(x.err) : '')));
        for (const [o2, id] of ids14.splice(0)) await fetch(`${o2}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        await dropPage(o.H); await sleep(1500);
        // B-a52d (主开发 r4884): THE ANSWER HELD past the successor's map — the window followed the hub's broadcast, its new connection
        // mapped, THEN the answer came. At the release every relaunch that changes the size mapped stale and was refit (DPR 1: 3 of 3,
        // DPR 2: 4 of 4 — 823b4235e-20261126093305-box); the cure plans and fits at the FIRST of the two events
        for (const dpr of [1, 2]) {
          const oR = await runScale14(OS, dpr, wts, 'stall-reply', 'reply');
          const rowsR = oR.steps.filter((st) => st.tap && st.tap.some((e) => e.ty === 'new-window')).map((st) => {
            const nw = st.tap.find((e) => e.ty === 'new-window');
            const map = st.tap.find((e) => e.ty === 'map-window' && nw && e.g[0] === nw.g[0]);
            const refits = map ? st.tap.filter((e) => e.ty === 'configure-window' && e.g[0] === nw.g[0] && e.at > map.at).map((e) => [e.at - map.at, e.g.slice(3, 5)]) : [];
            return { label: st.label, map: map && map.g.slice(3, 5), main: st.g && st.g.main && [st.g.main.w, st.g.main.h], refits };
          });
          const staleR = rowsR.filter((x) => x.map && x.main && (x.map[0] !== x.main[0] || x.map[1] !== x.main[1]) && x.refits.length);
          const holdsR = ([...oR.steps].reverse().find((st) => st.g && Array.isArray(st.g.replyHolds)) || { g: { replyHolds: [] } }).g.replyHolds;
          const pastMap = holdsR.filter((h) => h && h.mapped);
          console.log(`    MEASURE B-a52d (not a proof): the answer held at DPR ${dpr} — holds ${JSON.stringify(holdsR)}; ${rowsR.map((x) => `${x.label} map ${x.map} = main ${x.main}${x.refits.length ? ` (the client refit ${JSON.stringify(x.refits)})` : ''}`).join('; ')}`);
          // r5135 law 1: the CURE is judged only when the plant was IN FORCE — an answer held past a successor's map (its witness: the
          // copy's own hold list); a walk whose answer was never held past a map is a NAMED SKIP, counted, never a red or a green
          if (!pastMap.length) skip(`B-a52d THE CURE, DPR ${dpr}`, `the answer was never held past a successor's map (${holdsR.length} hold(s), none on a map): the plant was not in force — not judged`);
          else check(`B-a52d THE CURE (主开发 r4884), DPR ${dpr}: with the press's answer HELD past the successor's map (the window followed the hub's broadcast first), every relaunch maps at its FINAL size — the plan and the fit are made at the first of the two events (the release: every relaunch that changes the size mapped stale)`, pastMap.length >= 1 && staleR.length === 0, rowsR);
          if (pastMap.length) console.log(`    B-a52d stall DPR ${dpr}: the plant's witness — the copy HELD the answer past a successor's map (${pastMap.length} of ${holdsR.length}: ${holdsR.map((h) => `${h.ms} ms${h.mapped ? '' : ' (bound)'}`).join(', ')})`);
          check(`B-a52d stall DPR ${dpr}: the answer's walk ran its transitions (${rowsR.length} connects measured)`, rowsR.length >= 4, oR.steps.map((x) => x.label + (x.err ? ':' + JSON.stringify(x.err) : '')));
          for (const [o2, id] of ids14.splice(0)) await fetch(`${o2}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
          await dropPage(oR.H); await sleep(1500);
        }
      } catch (e) { threw('B-92aa stall', e); }
      finally { for (const [o2, id] of ids14.splice(0)) await fetch(`${o2}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); await sleep(1500); }
    }
    const endedS = endCopy(ss), leftS = await until(() => { endCopy(ss); return copyLeft(ss).length ? null : 'none'; }, 5000, 100);
    check(`B-92aa stall copy ends with it: ${endedS.length} process(es) rooted in its tree or HOME ended, none left`, leftS === 'none', { ended: endedS, left: copyLeft(ss), roots: ss.roots });
  }
} catch (e) {
  crashed(e, p1);
} finally {
  p1.close();
}
finish();
