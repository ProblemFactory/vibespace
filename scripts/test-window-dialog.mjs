#!/usr/bin/env node
// AN APP'S DIALOG IS PART OF ITS WINDOW (lane window-dialog-member; the owner 2026-10-11: his helper drove JASP on the xpra
// rung and "遇到了弹窗无法操作的问题" — the Open dialog was in the accessibility tree, not in the screenshot; window-audit
// said `screenshot … windows: 1`). HEAVY, on a scratch xpra 6.5.4 display of its own (private HOME / XDG_RUNTIME_DIR /
// dbus-run-session, the display number from xpra's -displayfd) with xpra's own python client as the viewer:
//   ① zenity --file-selection (its ONLY window is the dialog), viewer attached: the plan holds it, lit; the snapshot's
//     head names it.
//   ② the GTK fixture (scripts/fixtures/dialog-app.py), the viewer DETACHED (the owner's shape — the main window stays
//     mapped, a NEW top-level is not): "Save as…" opened THROUGH THE TREE ⇒ MEASURED first: the plan has 1 member, the
//     dialog's corral is unmapped (CONTROL = the pre-fix read); showWindows maps it ⇒ 2 members, the dialog composed LAST
//     (the image differs from the old top-first order's); the snapshot's head names it, its focused field;
//     `type` without a ref (typeTarget) lands in the dialog's Name entry — read back through the tree; `key Escape` into
//     the dialog's X window (windowfocus) closes it — the tree no longer holds it.
// Load rule: run at 1 lane (it owns one xpra + two Xvfb + GTK). SKIPs with the reason without xpra / Xvfb / xdotool /
// python3 gi / dbus-run-session.
// Run: node scripts/test-window-dialog.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const D = require('../src/desktop-display.js'), WT = require('../src/window-targets.js'), R = require('../src/window-reach.js'), M = require('../src/desktop-apps.js');
const HERE = path.dirname(new URL(import.meta.url).pathname);
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  - SKIP ${why}`); };
const done = () => { console.log(`${fail ? `\n${fail} FAILED (${pass} passed` : `\nALL PASS (${pass}`}${skipped ? `, ${skipped} skipped` : ''})`); process.exit(fail ? 1 : 0); };
const bin = (n) => D.binOnPath(n, { env: process.env });
const need = ['xpra', 'Xvfb', 'xdotool', 'xwininfo', 'xauth', 'dbus-run-session', 'python3'].filter((b) => !bin(b));
if (need.length) { skip(`not on PATH: ${need.join(', ')}`); done(); }
const gi = spawnSync('python3', ['-c', "import gi; gi.require_version('Atspi','2.0'); gi.require_version('Gtk','3.0'); from gi.repository import Atspi, Gtk"], { encoding: 'utf8' });
if (gi.status !== 0) { skip(`python3 gi Atspi/Gtk not importable: ${(gi.stderr || '').trim().split('\n').pop()}`); done(); }

// ONE private bus for the whole suite: re-run ourselves under dbus-run-session with a PRIVATE runtime dir (test-architecture §76)
const S = process.env.VS_WDLG_DIR || scratch('wdlg');
if (!process.env.VS_WDLG_BUS) {
  fs.mkdirSync(path.join(S, 'run'), { recursive: true }); fs.chmodSync(path.join(S, 'run'), 0o700); fs.mkdirSync(path.join(S, 'home'), { recursive: true });
  const r = spawnSync(bin('dbus-run-session'), ['--', process.execPath, new URL(import.meta.url).pathname], { stdio: 'inherit', env: { ...process.env, HOME: path.join(S, 'home'), XDG_RUNTIME_DIR: path.join(S, 'run'), VS_WDLG_BUS: '1', VS_WDLG_DIR: S, GIO_USE_VFS: 'local', GVFS_DISABLE_FUSE: '1' } }); // no gvfsd (a file chooser activates it): its FUSE mount outlived the bus (measured)
  // the bus's activated helpers and the xpra client write into run/ while they wind down: remove, wait, remove again
  for (let i = 0; i < 3; i++) { try { fs.rmSync(S, { recursive: true, force: true }); } catch { } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700); }
  process.exit(r.status == null ? 1 : r.status);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (b, a, env, timeout = 10000) => new Promise((res) => execFile(b, a, { env, timeout, encoding: 'utf8' }, (err, stdout, stderr) => res({ err, out: String(stdout || ''), errOut: String(stderr || '') })));
const kids = new Set();
// xpra's own Xvfb outlives a killed xpra: every process whose argv names this scratch dir is ours by evidence
const sweep = () => { for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d) || Number(d) === process.pid) continue; let c = ''; try { c = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; } if (c.includes(S + '/')) { try { process.kill(Number(d), 'SIGKILL'); } catch { } } } };
const cleanup = () => { for (const c of kids) { try { process.kill(-c.pid, 'SIGKILL'); } catch { try { c.kill('SIGKILL'); } catch { } } } sweep(); };
process.on('exit', cleanup); for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { cleanup(); process.exit(1); });
fs.mkdirSync(path.join(S, 'xpra'), { recursive: true });
const authFile = path.join(S, 'Xauthority'); const cookie = D.newCookie();
D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }]);
const port = await D.freePort();
const env0 = { ...process.env, XAUTHORITY: authFile }; delete env0.DISPLAY;
const x = await D.startXpra({ binPath: bin('xpra'), port, dir: S, env: env0, logFd: fs.openSync(path.join(S, 'xpra.log'), 'a') }).catch((e) => ({ error: e.message }));
if (x.error) { skip(`xpra did not start: ${x.error}`); done(); }
kids.add(x.child);
await D.waitForListen('http', port, { deadlineMs: 15000 });
const xenv = D.x11Env(process.env, { display: x.display, authFile });
const bins = { xdotool: bin('xdotool') };
console.log(`scratch xpra ${x.display} (port ${port}) — run at 1 lane`);
let viewer = null, viewerDisplay = null, viewerAuth = null;
async function attachViewer() {
  const cauth = path.join(S, 'Xauthority-client'); D.writeXauthority(cauth, [{ display: '0', cookieHex: cookie }]);
  const xv = spawn(bin('Xvfb'), ['-displayfd', '3', '-screen', '0', '1600x1000x24', '-nolisten', 'tcp', '-auth', cauth], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'], detached: true });
  kids.add(xv);
  const cd = await new Promise((res) => { let s = ''; xv.stdio[3].on('data', (d) => { s += d; if (/\n/.test(s)) res(':' + s.trim()); }); setTimeout(() => res(null), 10000); });
  D.writeXauthority(cauth, [{ display: cd.slice(1), cookieHex: cookie }]);
  viewerDisplay = cd; viewerAuth = cauth;
  const log = fs.openSync(path.join(S, 'client.log'), 'a');
  viewer = spawn(bin('xpra'), ['attach', `tcp://127.0.0.1:${port}/`, '--opengl=no', '--splash=no', '--notifications=no', '--tray=no', '--system-tray=no', '--audio=no', '--speaker=no', '--microphone=no', '--webcam=no', '--clipboard=no', '--mdns=no', '--dbus=no', '--bell=no', '--file-transfer=no', '--printing=no', '--headerbar=no'], { env: D.x11Env(process.env, { display: cd, authFile: cauth }), stdio: ['ignore', log, log], detached: true });
  kids.add(viewer);
  await sleep(2500);
}
const detachViewer = async () => { try { process.kill(-viewer.pid, 'SIGTERM'); } catch { } await sleep(2500); };
/** the keeper's windows(id) on this display (desktop-serve: enumerate → seamlessWindows → the row shape) */
async function windowsNow() {
  const r = await D.enumerateWindows({ display: x.display, authFile, env: xenv });
  return D.seamlessWindows(r.windows).map((w) => ({ id: w.id, title: w.name, cls: w.cls, instance: w.instance, x: w.x, y: w.y, w: w.w, h: w.h, mapped: w.mapped, depth: w.depth, ...(w.frame ? { frame: w.frame } : {}) }));
}
// a window mapped a moment ago may not have drawn yet — the engine's own second look (screenshot: lit 0 ⇒ 600 ms ⇒ again)
const shot = async (plan, tag) => { let r = null; for (let i = 0; i < 6; i++) { r = await WT.windowShot({ xenv, out: path.join(S, `${tag}.png`), plan, wallMs: 20000 }); if (!r.ok || r.lit > 0) break; await sleep(600); } return r; };
const snap = async (pid) => { const s = await WT.snapshotTarget({ pids: [pid], env: process.env, wallMs: 20000 }); return s.ok ? { ...s, d: WT.dialogFirst(s.snapshot.nodes) } : s; };
const lineOf = (child, re, ms = 15000) => new Promise((res) => { let s = ''; const on = (d) => { s += d; const m = re.exec(s); if (m) { child.stdout.off('data', on); res(m); } }; child.stdout.on('data', on); setTimeout(() => res(null), ms); });
const onBus = async (pid) => { for (let i = 0; i < 40; i++) { const r = await WT.runHelper({ op: 'apps' }, { env: process.env, wallMs: 8000 }); if (r.ok && (r.apps || []).some((a) => a.pid === pid)) return true; await sleep(250); } return false; };

await attachViewer();
// ① zenity: the dialog IS the app's window
console.log('① zenity --file-selection, viewer attached');
if (!bin('zenity')) skip('① zenity not on PATH');
else {
  const z = spawn(bin('zenity'), ['--file-selection', '--title=Open'], { env: xenv, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  kids.add(z);
  let rows = [];
  for (let i = 0; i < 40 && !rows.some((w) => w.title === 'Open' && w.mapped); i++) { await sleep(250); rows = await windowsNow(); }
  const plan = R.pixelPlan(rows);
  const sh = plan.ok ? await shot(plan, 'zenity') : { ok: false };
  ok(plan.ok && plan.members.length === 1 && sh.ok && sh.lit > 0, `① the plan holds zenity's dialog (${plan.w}x${plan.h}), its image lit (${sh.lit}/${sh.sampled})`, { plan, sh });
  const s = (await onBus(z.pid)) ? await snap(z.pid) : { ok: false, why: 'never on the bus' };
  ok(s.ok && s.d.dialog && s.d.dialog.name === 'Open' && /^a dialog is up: "Open"/.test(WT.dialogHead(s.d.dialog)), '① the snapshot\'s head names it: ' + (s.ok ? WT.dialogHead(s.d.dialog) : s.why));
  try { process.kill(-z.pid, 'SIGTERM'); } catch { }
  await sleep(800);
}

// ② the GTK fixture, the viewer DETACHED after the main window mapped
console.log('② GTK "Save as…" opened through the tree with NO viewer attached (the owner\'s shape)');
const app = spawn('python3', [path.join(HERE, 'fixtures', 'dialog-app.py')], { env: { ...xenv, VS_DLG_TITLE: 'vs dialog fixture' }, stdio: ['pipe', 'pipe', 'ignore'], detached: true });
kids.add(app);
const ready = await lineOf(app, /READY (\d+) (\d+)/);
if (!ready) { ok(false, '② the GTK fixture never mapped'); done(); }
const pid = Number(ready[1]);
await sleep(1000);
await detachViewer();
ok(await onBus(pid), `② the fixture (pid ${pid}) is on the private bus`);
const s0 = await snap(pid);
const btn = s0.ok && [...s0.refs.values()].find((e) => /button/.test(e.role) && e.name === 'Save as…');
if (!btn) { ok(false, '② no "Save as…" button in the tree', s0.why); done(); }
const pick = WT.pickAction(btn.actions || []);
const clicked = await WT.actOnNode({ entry: btn, verb: 'do_action', action: pick && pick.index, env: process.env });
const dl = await lineOf(app, /DIALOG save (\d+)/);
ok(clicked.ok && dl, '② "Save as…" clicked THROUGH THE TREE ⇒ the dialog mapped app-side (GTK says so)', clicked);
const dxid = dl ? Number(dl[1]) : 0;
await sleep(1200);
const before = await windowsNow();
const p0 = R.pixelPlan(before);
const dRow = before.find((w) => w.id === dxid);
ok(p0.ok && p0.visible === true && p0.members.length === 1 && dRow && dRow.mapped === false && Number.isInteger(dRow.frame), `② MEASURED (the pre-fix read): the main stays mapped, the dialog 0x${dxid.toString(16)} sits in an UNMAPPED corral — the plan has ${p0.members.length} member (the owner's windows: 1)`, { members: p0.members, dRow });
const sh0 = await shot(p0, 'gtk-before');
const frames = R.unshownFrames(before);
ok(frames.length === 1 && frames[0] === (dRow && dRow.frame), '② unshownFrames names exactly that corral', frames);
const m = await WT.showWindows({ bins, xenv, frames });
await sleep(800);
const after = await windowsNow();
const p1 = R.pixelPlan(after);
const sh1 = await shot(p1, 'gtk-after');
const oldOrder = { ...p1, members: [...p1.members].reverse() };
const sh1old = await shot(oldOrder, 'gtk-old-order');
ok(m.ok && p1.members.length === 2 && p1.members[p1.members.length - 1].id === dxid && sh1.ok && sh1.bytes !== sh0.bytes && (sh1.windows || []).every((w) => w.ok), `② showWindows maps it ⇒ 2 members, the dialog LAST (on top); the image changed (${sh0.bytes} → ${sh1.bytes} B), every member grabbed`, { m, members: p1.members, sh1 });
ok(sh1old.ok && sh1old.bytes !== sh1.bytes, `② the old top-first order draws the main window over its dialog — a different image (${sh1old.bytes} B vs ${sh1.bytes} B)`);
const s1 = await snap(pid);
const field = s1.ok && s1.d.dialog && s1.d.dialog.field;
ok(s1.ok && s1.d.dialog && s1.d.dialog.name === 'Save as' && field && s1.d.nodes[0].ref === s1.d.dialog.ref, '② the snapshot\'s head: ' + (s1.ok ? WT.dialogHead(s1.d.dialog) : s1.why));
// type WITHOUT a ref: the engine's rule (focused editable, else the dialog's field) through the real helper
const foc = await WT.focusedNode({ pids: [pid], env: process.env });
const tt = WT.typeTarget({ focused: foc.ok ? foc.node : null, dialog: s1.ok ? s1.d.dialog : null });
const entry = s1.ok ? s1.refs.get(tt.ref) : null;
const typed = entry ? await WT.actOnNode({ entry, verb: 'set_text', text: 'vs-dialog-typed.txt', env: process.env }) : { ok: false };
await sleep(400);
const s2 = await snap(pid);
const back = s2.ok ? s2.snapshot.nodes.find((n) => n.ref === tt.ref) : null;
ok(typed.ok && back && back.text === 'vs-dialog-typed.txt', `② type without a ref → ${tt.use} ${tt.ref} → the dialog's Name entry reads back "${back && back.text}"`, { tt, typed });
// key Escape into the dialog's OWN X window (windowOfNode → windowfocus), the pointer inside it
const dw = R.windowOfNode(s2.ok && s2.d.dialog, p1.members);
const answered = lineOf(app, /ANSWER save (-?\d+) (\S*)/, 5000); // listening BEFORE the key (GTK answers within the await)
const k = await WT.injectKey({ bins, xenv, chord: WT.parseChord('Escape'), focus: dw ? { x: dw.x + dw.w / 2, y: dw.y + dw.h / 2 } : null, window: dw ? dw.id : null });
const ans = await answered;
await sleep(600);
const s3 = await snap(pid);
ok(dw && dw.id === dxid && k.ok && ans && s3.ok && s3.d.dialog === null, `② key Escape into the dialog's window 0x${dw ? dw.id.toString(16) : '?'} closed it (GTK answered ${ans && ans[1]}, its Name field held "${ans && ans[2]}"); the tree no longer holds it`, { k, s3d: s3.ok && s3.d.dialog });
try { process.kill(-app.pid, 'SIGTERM'); } catch { }

// ③ lane app-display-portal: a dialog drawn by the desktop PORTAL (another process) — the owner's JASP on xpra :4 drew its
// Browse chooser on his main desktop :2 (the session bus's portal lives there). DECOY = a second Xvfb standing for that main
// desktop, with xdg-desktop-portal(-gtk) on THIS suite's session bus. Control: the fixture (FileChooserNative, GTK_USE_PORTAL=1)
// on the session bus ⇒ the chooser maps on the DECOY. Fix: the app's own bus + portal (M.portalPlan → D.startPortalBus) ⇒ it
// maps on the app's display, the plan composes it, the pane shows it (PNG), the tree names it, the path reaches the app.
console.log('③ a portal FileChooser: the session\'s portal (decoy main desktop) vs the app\'s own portal on its display');
const pb = D.portalBins({ env: process.env });
const pmiss = M.PORTAL_REQUIRED.filter((n) => !pb[n]);
if (pmiss.length) { skip(`③ ${pmiss.join(', ')} not on this machine`); done(); }
const dauth = path.join(S, 'Xauthority-decoy'); D.writeXauthority(dauth, [{ display: '0', cookieHex: cookie }]);
const dx = spawn(bin('Xvfb'), ['-displayfd', '3', '-screen', '0', '1280x800x24', '-nolisten', 'tcp', '-auth', dauth], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'], detached: true });
kids.add(dx);
const decoy = await new Promise((res) => { let s = ''; dx.stdio[3].on('data', (d) => { s += d; if (/\n/.test(s)) res(':' + s.trim()); }); setTimeout(() => res(null), 10000); });
D.writeXauthority(dauth, [{ display: decoy.slice(1), cookieHex: cookie }]);
fs.mkdirSync(path.join(S, 'decoy-config', 'xdg-desktop-portal'), { recursive: true });
fs.writeFileSync(path.join(S, 'decoy-config', 'xdg-desktop-portal', 'portals.conf'), '[preferred]\ndefault=gtk\n');
const denv = { ...D.x11Env(process.env, { display: decoy, authFile: dauth }), XDG_CONFIG_HOME: path.join(S, 'decoy-config'), XDG_CURRENT_DESKTOP: 'GNOME', GTK_USE_PORTAL: '0' };
// the suite's bus may already have ACTIVATED a portal (display-less) for an earlier leg: end it, then every activation on this bus
// starts with the decoy's display (the owner's shape: the session's portals on the main desktop)
for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; let c = '', e = ''; try { c = fs.readFileSync(`/proc/${d}/comm`, 'utf8'); e = fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { continue; } if (/^xdg-desktop-por/.test(c) && e.includes(`DBUS_SESSION_BUS_ADDRESS=${process.env.DBUS_SESSION_BUS_ADDRESS}\0`)) { try { process.kill(Number(d), 'SIGTERM'); } catch { } } }
await sleep(800);
await run(bin('dbus-update-activation-environment'), Object.entries({ DISPLAY: decoy, XAUTHORITY: dauth, XDG_CONFIG_HOME: denv.XDG_CONFIG_HOME, XDG_CURRENT_DESKTOP: 'GNOME', GTK_USE_PORTAL: '0', GIO_USE_VFS: 'local', GVFS_DISABLE_FUSE: '1' }).map(([k, v]) => `${k}=${v}`), process.env);
await attachViewer(); // the pane: xpra's client maps what the app's display shows (② left it detached)
const tree = async (disp, auth) => { const r = await run(bin('xwininfo'), ['-root', '-tree'], { ...process.env, DISPLAY: disp, XAUTHORITY: auth }); return r.out; };
const onDisp = async (disp, auth) => /"Open": \("xdg-desktop-portal-gtk"/.test(await tree(disp, auth));
const chooserOn = async (disp, auth) => (/"(?!xdg-desktop-portal-gtk")([^"]+)": \("xdg-desktop-portal-gtk"/.exec(await tree(disp, auth)) || [])[1] || null;
// r2 (owner 2026-10-12: a desktop-app Chrome on xpra :6 sent the Turnitin upload's chooser to :2 — Chromium PREFERS the portal
// FileChooser whenever one answers on its bus): a REAL google-chrome with the rung's own argv (M.browserArgv), a page with a file
// input, the input pressed THROUGH THE TREE ⇒ where does the chooser map?
const CHROME = ['/opt/google/chrome/chrome'].find((p) => fs.existsSync(p)) || bin('google-chrome');
const page = path.join(S, 'upload.html'); fs.writeFileSync(page, '<!doctype html><title>vs upload</title><input type="file" aria-label="Pick a file" style="position:fixed;inset:0;width:100%;height:100%">');
async function chromeLeg(env, tag) {
  const av = M.browserArgv({ browser: 'chromium', exec: CHROME, args: ['--disable-features=ChromeWhatsNewUI'] }, { profileDir: path.join(S, `chrome-${tag}`), url: 'file://' + page });
  const c = spawn(CHROME, av.argv, { env: { ...env, ...(av.env || {}) }, stdio: 'ignore', detached: true });
  kids.add(c);
  let input = null;
  let terms = false, last = null; // a fresh Chrome-stable profile opens its "Additional Terms of Service" window first: Accept it THROUGH THE TREE, as an agent would
  for (let i = 0; i < 40 && !input; i++) {
    await sleep(250);
    const s = await WT.snapshotTarget({ pids: [c.pid], env: process.env, wallMs: 8000 });
    last = s;
    const all = s.ok ? [...s.refs.values()] : [];
    input = all.find((e) => e.name === 'Pick a file') || null;
    if (!input && !terms && (await windowsNow()).some((w) => /Additional Terms of Service/.test(w.title || '') && w.mapped)) { // its own views tree is empty to AT-SPI here (measured: 0 nodes) — its focused Accept takes Return
      terms = !(await run(bin('xdotool'), ['search', '--name', 'Additional Terms of Service', 'windowfocus', '--sync', '%1', 'key', 'Return'], { ...xenv, LC_ALL: 'C.UTF-8' })).err;
      await sleep(1500);
    }
  }
  const pick = input ? WT.pickAction(input.actions || []) : null;
  let pressed = input ? { ...(await WT.actOnNode({ entry: input, verb: 'do_action', action: pick && pick.index, env: process.env })), by: 'the tree' } : null;
  if (!pressed) { // MEASURED on this box: Chrome 154 on a scratch bus registers on the a11y bus with an EMPTY tree (0 nodes) — the press goes by pointer
    const ke = { ...xenv, LC_ALL: 'C.UTF-8' };
    let w = null;
    for (let i = 0; i < 60 && !w; i++) { w = (await windowsNow()).find((r) => /Google Chrome$/.test(r.title || '') && r.mapped); if (!w) await sleep(250); } // after Accept the browser window comes seconds later
    if (w && !/^vs upload/.test(w.title)) { // a fresh profile opens "What's New" over the URL — load the page through the address bar
      await run(bin('xdotool'), ['windowfocus', '--sync', String(w.id)], ke);
      await run(bin('xdotool'), ['key', 'ctrl+l'], ke); await sleep(300);
      await run(bin('xdotool'), ['type', '--delay', '5', 'file://' + page], ke); await run(bin('xdotool'), ['key', 'Return'], ke);
      for (let i = 0; i < 20 && !(w && /^vs upload/.test(w.title)); i++) { await sleep(250); w = (await windowsNow()).find((r) => /Google Chrome$/.test(r.title || '') && r.mapped); }
      await sleep(800);
    }
    const k = w && /^vs upload/.test(w.title) ? await run(bin('xdotool'), ['mousemove', '--sync', String(w.x + Math.round(w.w / 2)), String(w.y + Math.round(w.h * 0.6)), 'click', '1'], ke) : { err: 'no "vs upload" window' };
    pressed = { ok: !k.err, by: 'xdotool click (the tree had ' + (last && last.ok ? last.refs.size : 0) + ' nodes)', terms, ...(k.err ? { windows: (await windowsNow()).filter((r) => r.mapped).map((r) => r.title) } : {}) };
  }
  let onApp = null, onDecoy = null;
  for (let i = 0; i < 32 && !onApp && !onDecoy; i++) { await sleep(250); onApp = await chooserOn(x.display, authFile); onDecoy = await chooserOn(decoy, dauth); }
  await sleep(600);
  return { c, pid: c.pid, pressed, onApp, onDecoy };
}
const endChrome = async (r) => { try { process.kill(-r.c.pid, 'SIGTERM'); } catch { } await sleep(1000); };
async function fixture(env) {
  const c = spawn('python3', [path.join(HERE, 'fixtures', 'dialog-app.py')], { env: { ...env, VS_DLG_TITLE: 'vs portal fixture', VS_DLG_NATIVE: '1', GTK_USE_PORTAL: '1' }, stdio: ['pipe', 'pipe', 'ignore'], detached: true });
  kids.add(c);
  const r = await lineOf(c, /READY (\d+) (\d+)/);
  await sleep(800);
  return { c, pid: r ? Number(r[1]) : 0 };
}
const pressOpen = async (f) => { const asked = lineOf(f.c, /NATIVE open/, 5000); f.c.stdin.write('open\n'); await asked; for (let i = 0; i < 24; i++) { await sleep(250); if ((await onDisp(x.display, authFile)) || (await onDisp(decoy, dauth))) break; } await sleep(600); };
// the control: the app on the session bus (today's shape)
const f0 = await fixture(xenv);
await pressOpen(f0);
const c0App = await onDisp(x.display, authFile), c0Decoy = await onDisp(decoy, dauth);
ok(f0.pid && c0Decoy && !c0App, `③ CONTROL (today): the session bus's portal draws the chooser on the DECOY main desktop ${decoy} (${c0Decoy}), not on the app's ${x.display} (${c0App})`);
try { process.kill(-f0.c.pid, 'SIGTERM'); } catch { }
await run(bin('xdotool'), ['key', 'Escape'], { ...process.env, DISPLAY: decoy, XAUTHORITY: dauth });
await sleep(800);
if (CHROME) { // a warm-up launch takes Chrome's ONE-TIME first-run windows in this HOME (terms, then a bare "Google Chrome" first-run window) — the control and the fix then start alike
  const wu = await chromeLeg(xenv, 'warmup');
  await endChrome(wu);
  await run(bin('xdotool'), ['key', 'Escape'], { ...process.env, DISPLAY: decoy, XAUTHORITY: dauth });
  await sleep(600);
}
const ch0 = CHROME ? await chromeLeg(xenv, 'control') : null;
if (!ch0) skip('③ no google-chrome on this machine (the browser legs)');
else {
  ok(ch0.pressed.ok && ch0.onDecoy && !ch0.onApp, `③ CONTROL (the owner's Chrome): the file input pressed (${ch0.pressed.by}) ⇒ the session's portal maps "${ch0.onDecoy}" on the DECOY main desktop, nothing on the app display`, ch0.pressed);
  await endChrome(ch0);
  await run(bin('xdotool'), ['key', 'Escape'], { ...process.env, DISPLAY: decoy, XAUTHORITY: dauth });
  await sleep(600);
}
// the fix: the app's own bus + portal on its display
const a11y = await D.a11yBusAddress({ env: process.env });
const plan = M.portalPlan({ dir: path.join(S, 'app1'), display: x.display, authFile, bins: pb, a11y, why: 'row' });
const pc = plan.ok ? await D.startPortalBus({ plan, env: xenv, logFd: fs.openSync(path.join(S, 'portal.log'), 'a') }).catch((e) => ({ error: e.message })) : { error: plan.why };
ok(pc && pc.pid && !pc.error, `③ the companion bus listens at ${plan.address} (a11y ${a11y ? 'the suite\'s' : 'unknown'})`, pc && pc.error);
if (!pc || pc.error) done();
kids.add(pc);
const f1 = await fixture({ ...xenv, ...plan.appEnv });
await pressOpen(f1);
const c1App = await onDisp(x.display, authFile), c1Decoy = await onDisp(decoy, dauth);
ok(c1App && !c1Decoy, `③ FIX: the app's own portal draws the chooser ON THE APP'S DISPLAY ${x.display} (${c1App}), the decoy has none (${c1Decoy})`);
const rows = await windowsNow();
const p3 = R.pixelPlan(rows);
const chooser = rows.find((w) => w.title === 'Open' && w.mapped);
ok(p3.ok && chooser && p3.members.some((m) => m.id === chooser.id) && p3.members[p3.members.length - 1].id === chooser.id, `③ the screenshot plan composes the portal's chooser, on top (${p3.members.length} members)`, rows.map((w) => `${w.title}:${w.mapped}`));
const sh3 = p3.ok ? await shot(p3, 'portal-plan') : { ok: false };
ok(sh3.ok && sh3.lit > 0, `③ its image is lit (${sh3.lit}/${sh3.sampled})`);
if (process.env.VS_PORTAL_PNG_DIR && viewerDisplay) {
  const out = path.join(process.env.VS_PORTAL_PNG_DIR, 'pane-dialog.png');
  const g = await run('python3', ['-c', "import sys,gi; gi.require_version('Gdk','3.0'); from gi.repository import Gdk; w=Gdk.get_default_root_window(); p=Gdk.pixbuf_get_from_window(w,0,0,w.get_width(),w.get_height()); p.savev(sys.argv[1],'png',[],[])", out], { ...process.env, DISPLAY: viewerDisplay, XAUTHORITY: viewerAuth });
  console.log(`  (pane PNG: the xpra client's own display ${viewerDisplay} → ${out} ${g.err ? 'FAILED ' + g.errOut.trim().split('\n').pop() : 'written'})`);
}
const census = () => { D.refreshSessions(); return D.sessionCensus([pc.pid], { fresh: true }); };
const members = census();
const comm = (p) => { try { return fs.readFileSync(`/proc/${p}/comm`, 'utf8').trim(); } catch { return '?'; } };
const portalPids = members.filter((p) => /^xdg-desktop-por/.test(comm(p)));
ok(portalPids.length >= 2, `③ the bus ACTIVATED the portal + its gtk backend IN ITS OWN SESSION: ${members.map((p) => comm(p)).join(', ')}`);
const s4 = await WT.snapshotTarget({ pids: [f1.pid, ...members], env: process.env, wallMs: 20000 });
const d3 = s4.ok ? WT.dialogFirst(s4.snapshot.nodes) : null;
ok(s4.ok && d3 && d3.dialog && d3.dialog.name === 'Open', '③ the tree (app + companion pids, the user\'s a11y bus) names it: ' + (s4.ok ? WT.dialogHead(d3.dialog) : s4.why));
const picked = path.join(S, 'home', 'picked-by-portal.txt'); fs.writeFileSync(picked, 'x\n');
const answered3 = lineOf(f1.c, /ANSWER open (-?\d+) (\S*)/, 8000);
const kenv = { ...xenv, LC_ALL: 'C.UTF-8' };
await run(bin('xdotool'), ['search', '--name', '^Open$', 'windowfocus', '--sync'], kenv);
await run(bin('xdotool'), ['key', 'ctrl+l'], kenv); await sleep(300);
await run(bin('xdotool'), ['type', '--delay', '5', picked], kenv); await sleep(300);
await run(bin('xdotool'), ['key', 'Return'], kenv);
const ans3 = await answered3;
ok(ans3 && Number(ans3[1]) === -3 && ans3[2] === picked, `③ the path typed into the app-display chooser reached the app (GTK answered ${ans3 && ans3[1]} "${ans3 && ans3[2]}")`);
if (CHROME) {
  const ch1 = await chromeLeg({ ...xenv, ...plan.appEnv }, 'fix');
  const crow = await windowsNow();
  const cplan = R.pixelPlan(crow);
  ok(ch1.pressed.ok && ch1.onApp && !ch1.onDecoy && cplan.ok && cplan.members.length >= 2, `③ FIX (Chrome on its own portal, pressed by ${ch1.pressed.by}): the chooser "${ch1.onApp}" maps ON THE APP'S DISPLAY, the decoy has none; the plan holds ${cplan.members.length} windows`, { pressed: ch1.pressed, rows: crow.map((w) => `${w.title}:${w.mapped}`) });
  const cm = census();
  const cs = await WT.snapshotTarget({ pids: [ch1.pid, ...cm], env: process.env, wallMs: 20000 });
  const cd = cs.ok ? WT.dialogFirst(cs.snapshot.nodes) : null;
  ok(cs.ok && cd && cd.dialog && cd.dialog.name === ch1.onApp && cd.nodes[0].ref === cd.dialog.ref, '③ the tree names Chrome\'s chooser FIRST: ' + (cs.ok && cd && cd.dialog ? WT.dialogHead(cd.dialog) : cs.why || 'no dialog'));
  if (process.env.VS_PORTAL_PNG_DIR && viewerDisplay) {
    const out = path.join(process.env.VS_PORTAL_PNG_DIR, 'pane-chrome.png');
    const g = await run('python3', ['-c', "import sys,gi; gi.require_version('Gdk','3.0'); from gi.repository import Gdk; w=Gdk.get_default_root_window(); p=Gdk.pixbuf_get_from_window(w,0,0,w.get_width(),w.get_height()); p.savev(sys.argv[1],'png',[],[])", out], { ...process.env, DISPLAY: viewerDisplay, XAUTHORITY: viewerAuth });
    console.log(`  (Chrome pane PNG → ${out} ${g.err ? 'FAILED' : 'written'})`);
  }
  await run(bin('xdotool'), ['key', 'Escape'], kenv);
  await endChrome(ch1);
}
// the keeper's teardown shape: the bus leader's session, signalled — then nothing of the companion is left
try { process.kill(-pc.pid, 'SIGTERM'); } catch { }
for (const p of members) { try { process.kill(p, 'SIGTERM'); } catch { } }
await sleep(1500);
const alive = members.filter((p) => D.pidAlive(p) && comm(p) !== 'zombie');
const um = await D.unmountUnder(path.join(S, 'app1', 'portal'));
ok(alive.length === 0, `③ the companion dies with its session (${members.length} pids, ${alive.length} alive; FUSE mounts unmounted: ${um.length})`, alive.map((p) => `${p}:${comm(p)}`));
try { process.kill(-f1.c.pid, 'SIGTERM'); } catch { }
done();
