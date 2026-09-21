#!/usr/bin/env node
// MEASURE — what docs/design-agent-browser-v2 §10's P10 row says to measure
// FIRST, so the record in src/window-desktop.js (TIER3_MEASUREMENTS) and the
// numbers in docs/kb-file-structure.md can be re-taken on another desktop.
// Prints; asserts nothing. The only things it ACTS on are a GTK fixture it
// starts itself (on its own Xvfb, or — with --real-window / --real — mapped
// for a few seconds on the USER'S OWN display, because §4.9's columns 1/2 can
// only be re-verified there) and a scratch agent-browser daemon of its own.
//
//   node scripts/measure-tier3.mjs                     every leg that can run here
//   node scripts/measure-tier3.mjs --sites [--site <url>…] [--executable <chrome>] [--no-sandbox]
//        §12.36: which tier NAMED sites fail on — tier 1 = the installed agent-browser with a
//        STOCK launch (scratch HOME: the user's config.json and its AutomationControlled flag are
//        not read), against public bot-detection demo pages; tier 2 (cloak) and tier 3 are
//        recorded as the refusals they are (binary absent / needs the user's own window). No bank.
//   node scripts/measure-tier3.mjs --capture [--no-real-window] [--wait 2] [--systemd]
//        §4.9 columns 1 and 2 on the user's own session: X11 enumeration + x11grab of the root and
//        of an Xwayland client's own window (the fixture, mapped ≤ 4 s), a NATIVE Wayland client's
//        invisibility to X11 while it is on the a11y bus, the ScreenCast portal's
//        CreateSession / SelectSources(window) / Start (the consent dialog is up for --wait
//        seconds and the session is Closed — nobody clicks it), GNOME's Introspect / ScreenshotWindow.
//   node scripts/measure-tier3.mjs --latency [--real] [--n 10]
//        §12.39: one `do_action` → a visible PIXEL change (XGetImage of the window), on our Xvfb
//        and, with --real, on the user's Xwayland (the fixture mapped there for the run).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const WT = require('../src/window-targets.js');
const D = require('../src/desktop-display.js');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const flag = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const flags = (f) => args.map((a, i) => (a === f ? args[i + 1] : null)).filter(Boolean);
const all = !['--sites', '--capture', '--latency'].some(has);
const run = (bin, a, env = process.env, timeout = 60000) => new Promise((res) => execFile(bin, a, { env, timeout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = scratch('measure-t3');
fs.mkdirSync(dir, { recursive: true });
const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'window-target-app.py');
const children = new Set();
const cleanup = () => { for (const c of children) { try { process.kill(c.pid, 'SIGTERM'); } catch { } } try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const indent = (s) => String(s || '').trim().split('\n').map((l) => '  ' + l).join('\n');

// ── the fixture, on a display of the caller's choosing ─────────────────────
async function mapFixture(env, { label }) {
  const app = spawn('python3', [FIXTURE], { env: { ...env, VS_WT_TITLE: label }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(app);
  let err = '';
  app.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  const pid = await new Promise((res) => { let s = ''; app.stdout.on('data', (d) => { s += d; const m = /READY (\d+)/.exec(s); if (m) res(Number(m[1])); }); app.on('exit', () => res(null)); setTimeout(() => res(null), 15000); });
  if (!pid) { children.delete(app); return { why: `the GTK fixture did not map (${err.trim().split('\n').pop() || 'no stderr'})` }; }
  let onBus = false;
  for (let i = 0; i < 40 && !onBus; i++) { const r = await WT.runHelper({ op: 'apps' }, { wallMs: 8000 }); onBus = r.ok && (r.apps || []).some((a) => a.pid === pid); if (!onBus) await sleep(250); }
  return { pid, app, onBus, kill: () => { try { app.kill('SIGTERM'); } catch { } children.delete(app); } };
}
async function ownXvfb() {
  const xvfb = D.binOnPath('Xvfb', { env: process.env });
  if (!xvfb) return { why: 'Xvfb not on PATH' };
  const authFile = path.join(dir, 'Xauthority'); const cookie = D.newCookie();
  D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }]);
  const xv = spawn(xvfb, ['-displayfd', '3', '-screen', '0', '800x600x24', '-nolisten', 'tcp', '-auth', authFile], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  children.add(xv);
  const display = await new Promise((res) => { let s = ''; xv.stdio[3].on('data', (d) => { s += d; if (/\n/.test(s)) res(':' + s.trim()); }); setTimeout(() => res(null), 10000); });
  if (!display) return { why: 'Xvfb did not answer -displayfd' };
  D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }, { display, cookieHex: cookie }]);
  return { display, xenv: D.x11Env(process.env, { display, authFile }) };
}
async function xidByPid(pid, xenv, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const r = await run('xdotool', ['search', '--pid', String(pid), '--onlyvisible'], xenv, 5000);
    const ids = r.stdout.trim().split('\n').filter(Boolean);
    if (ids.length) return ids[ids.length - 1];
    await sleep(250);
  }
  return null;
}
async function grabNonZero(xenv, extra) {
  const raw = path.join(dir, `grab-${Date.now()}.raw`);
  const r = await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', ...extra, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', raw], xenv, 15000);
  if (r.err) return { ok: false, why: (r.stderr || r.err.message).trim().split('\n').pop() };
  const b = fs.readFileSync(raw); let nz = 0; for (const x of b) if (x) nz++;
  try { fs.unlinkSync(raw); } catch { }
  return { ok: true, bytes: b.length, nonZero: nz };
}

// ── python legs ────────────────────────────────────────────────────────────
const PIXLAT_PY = String.raw`
import sys, time, hashlib, statistics, warnings
warnings.simplefilter('ignore')
import gi
gi.require_version('Atspi', '2.0'); gi.require_version('Gdk', '3.0'); gi.require_version('GdkX11', '3.0')
from gi.repository import Atspi, Gdk, GdkX11
pid = int(sys.argv[1]); xid = int(sys.argv[2], 0); N = int(sys.argv[3])
Atspi.set_timeout(800, 3000)
d = Atspi.get_desktop(0); app = None
for i in range(d.get_child_count()):
    a = d.get_child_at_index(i)
    if a.get_process_id() == pid: app = a; break
if app is None: print('fixture not on the a11y bus'); sys.exit(0)
def find(acc, roles, prefix):
    if acc.get_role_name() in roles and (acc.get_name() or '').startswith(prefix): return acc
    for i in range(acc.get_child_count()):
        r = find(acc.get_child_at_index(i), roles, prefix)
        if r: return r
btn = find(app, ('button', 'push button'), 'Count'); lbl = find(app, ('label',), 'count ')
act = btn.get_action_iface(); names = [Atspi.Action.get_action_name(act, i) for i in range(Atspi.Action.get_n_actions(act))]
idx = names.index('click') if 'click' in names else 0
disp = GdkX11.X11Display.get_default()
win = GdkX11.X11Window.foreign_new_for_display(disp, xid)
w, h = win.get_width(), win.get_height()
def grab():
    pb = Gdk.pixbuf_get_from_window(win, 0, 0, w, h)
    return None if pb is None else pb.get_pixels()
px = grab()
if px is None: print('PIXELS UNREADABLE: XGetImage of 0x%x (%dx%d) gave nothing' % (xid, w, h)); sys.exit(0)
nz = sum(1 for b in px[:300000] if b)
print('window 0x%x %dx%d: %d of the first %d pixel bytes non-zero (%s)' % (xid, w, h, nz, min(len(px), 300000), 'pixels readable' if nz else 'ALL BLACK — the read is not the window'))
if nz == 0: sys.exit(0)
t0 = time.perf_counter(); grab(); gcost = (time.perf_counter() - t0) * 1000
lat = []; tree = []
for k in range(N):
    before = hashlib.md5(grab()).hexdigest(); bname = lbl.get_name(); tt = None
    t0 = time.perf_counter(); Atspi.Action.do_action(act, idx)
    while time.perf_counter() - t0 < 3:
        if tt is None and lbl.get_name() != bname: tt = time.perf_counter()
        if hashlib.md5(grab()).hexdigest() != before: break
    t1 = time.perf_counter(); lat.append((t1 - t0) * 1000); tree.append(((tt or t1) - t0) * 1000); time.sleep(0.05)
lat.sort(); tree.sort(); p = lambda a, q: a[min(len(a) - 1, int(len(a) * q))]
print('one XGetImage of the window: %.1f ms (the poll resolution)' % gcost)
print('do_action -> PIXEL change: median %.1f ms, p95 %.1f ms, max %.1f ms (N=%d); tree-visible change median %.2f ms' % (statistics.median(lat), p(lat, 0.95), lat[-1], N, statistics.median(tree)))
`;

const SCREENCAST_PY = String.raw`
import os, sys, time, secrets
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
WAIT = float(sys.argv[1])
print('context: invocation=%s DBUS=%s' % (os.environ.get('INVOCATION_ID', '-')[:8], bool(os.environ.get('DBUS_SESSION_BUS_ADDRESS'))))
try: bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
except Exception as e: print('SESSION BUS UNREACHABLE:', e); sys.exit(0)
sender = bus.get_unique_name()[1:].replace('.', '_'); loop = GLib.MainLoop()
P = 'org.freedesktop.portal.Desktop'; O = '/org/freedesktop/portal/desktop'
try:
    v = bus.call_sync(P, O, 'org.freedesktop.DBus.Properties', 'Get', GLib.Variant('(ss)', ('org.freedesktop.portal.ScreenCast', 'version')), None, 0, 3000, None).unpack()[0]
    st = bus.call_sync(P, O, 'org.freedesktop.DBus.Properties', 'Get', GLib.Variant('(ss)', ('org.freedesktop.portal.ScreenCast', 'AvailableSourceTypes')), None, 0, 3000, None).unpack()[0]
    print('ScreenCast: version %s, AvailableSourceTypes %s (1 monitor, 2 window, 4 virtual)' % (v, st))
except Exception as e: print('ScreenCast interface not answering:', e); sys.exit(0)
def request(method, build):
    token = 'vs' + secrets.token_hex(4); req = '/org/freedesktop/portal/desktop/request/%s/%s' % (sender, token); out = {}
    def on_resp(c, s, p, i, sig, params): out['code'], out['results'] = params.unpack(); loop.quit()
    sub = bus.signal_subscribe(P, 'org.freedesktop.portal.Request', 'Response', req, None, 0, on_resp)
    t0 = time.perf_counter()
    try: bus.call_sync(P, O, 'org.freedesktop.portal.ScreenCast', method, build(token), None, 0, 5000, None)
    except Exception as e: bus.signal_unsubscribe(sub); return {'error': str(e)}
    GLib.timeout_add(int(WAIT * 1000) if method == 'Start' else 5000, loop.quit); loop.run(); bus.signal_unsubscribe(sub)
    out['ms'] = round((time.perf_counter() - t0) * 1000, 1); return out
r1 = request('CreateSession', lambda t: GLib.Variant('(a{sv})', ({'handle_token': GLib.Variant('s', t), 'session_handle_token': GLib.Variant('s', 'vs' + secrets.token_hex(4))},)))
print('CreateSession:', r1)
if r1.get('code') != 0: sys.exit(0)
session = r1['results']['session_handle']
print('SelectSources(types=2 window, persist_mode=2, cursor_mode=1):', request('SelectSources', lambda t: GLib.Variant('(oa{sv})', (session, {'handle_token': GLib.Variant('s', t), 'types': GLib.Variant('u', 2), 'persist_mode': GLib.Variant('u', 2), 'cursor_mode': GLib.Variant('u', 1)}))))
r3 = request('Start', lambda t: GLib.Variant('(osa{sv})', (session, '', {'handle_token': GLib.Variant('s', t)})))
print('Start (waited %.1fs):' % WAIT, r3 if ('code' in r3 or 'error' in r3) else {'pending': 'no Response within the wait — the consent dialog is up (nobody clicks it here)'})
try: bus.call_sync(P, session, 'org.freedesktop.portal.Session', 'Close', None, None, 0, 3000, None); print('session Closed')
except Exception as e: print('Close:', e)
`;

// ── §12.36 — which tier named sites fail on ────────────────────────────────
const DEFAULT_SITES = ['https://bot.sannysoft.com/', 'https://nowsecure.nl/', 'https://www.browserscan.net/bot-detection'];
function readSite(url, title, text) {
  const t = String(text || ''); const lower = t.toLowerCase();
  if (/sannysoft/.test(url)) {
    const failed = (t.match(/\(failed\)|failed/gi) || []).length, passed = (t.match(/\(passed\)|passed/gi) || []).length;
    const wd = /webdriver[^\n]*\n?[^\n]*(present|missing)[^\n]*/i.exec(t);
    return `fingerprint table: ${passed} passed / ${failed} failed cells${wd ? `; WebDriver: ${wd[1]}` : ''}`;
  }
  if (/nowsecure/.test(url)) return /just a moment/i.test(title) || /checking your browser|verify you are human|cf-chl/i.test(lower) ? 'Cloudflare CHALLENGE (title "Just a moment…" / a human check) — not passed within the wait' : /oh yeah|you passed/i.test(lower) ? 'Cloudflare passed ("OH YEAH, you passed")' : `no challenge marker (title ${JSON.stringify(title)})`;
  if (/browserscan/.test(url)) { const m = /test results?[^\n]*\n?\s*([^\n]{0,60})/i.exec(t); return `${/robot|bot detected|abnormal/i.test(lower) ? 'FLAGGED (robot / abnormal marker present)' : /normal/i.test(lower) ? '"Normal" marker present' : 'no verdict marker'}${m ? ` — "${m[1].trim()}"` : ''}`; }
  return `title ${JSON.stringify(title)}, ${t.length} chars`;
}
async function sitesLeg() {
  console.log('\n§12.36 — which tier a NAMED site fails on');
  const sites = flags('--site').length ? flags('--site') : DEFAULT_SITES;
  const realHome = os.homedir();
  let exe = flag('--executable', null);
  if (!exe) { try { const b = path.join(realHome, '.agent-browser', 'browsers'); exe = fs.readdirSync(b).filter((n) => /^chrome-\d/.test(n)).sort().reverse().map((n) => path.join(b, n, 'chrome')).find((p) => fs.existsSync(p)) || null; } catch { exe = null; } }
  const ab = D.binOnPath('agent-browser', { env: process.env });
  if (!ab) { console.log('  tier 1: agent-browser not on PATH — nothing measured'); return; }
  if (!exe) { console.log('  tier 1: no installed Chromium found under ~/.agent-browser/browsers (pass --executable <chrome>) — a scratch HOME would download one, which is not a measurement'); return; }
  const home = path.join(dir, 'home'); fs.mkdirSync(home, { recursive: true });
  const env = { ...process.env, HOME: home, AGENT_BROWSER_EXECUTABLE_PATH: exe, AGENT_BROWSER_SESSION: `vst3-${process.pid}`, AGENT_BROWSER_NAMESPACE: `vst3-${process.pid}`, AGENT_BROWSER_SOCKET_DIR: path.join(dir, 'sock'), AGENT_BROWSER_HEADED: '' };
  delete env.AGENT_BROWSER_PROFILE; delete env.AGENT_BROWSER_CDP; delete env.AGENT_BROWSER_ARGS;
  // --no-sandbox is a LAUNCH precondition on some Linux boxes (the CLI's own hint names it), not a detection flag — recorded when used
  if (has('--no-sandbox')) env.AGENT_BROWSER_ARGS = '--no-sandbox';
  fs.mkdirSync(path.join(dir, 'sock'), { recursive: true, mode: 0o700 });
  const ver = await run(ab, ['--version'], env, 15000);
  console.log(`  tier 1 = ${ver.stdout.trim() || 'agent-browser'} with ${exe} — STOCK launch (scratch HOME, no config.json, ${has('--no-sandbox') ? 'the one launch arg --no-sandbox (a launch precondition here, not a detection flag)' : 'no --args'}, headless)`);
  for (const url of sites) {
    const t0 = Date.now();
    const o = await run(ab, ['open', url], env, 60000);
    if (o.err) { console.log(`  · ${url}: open failed — ${(o.stderr || o.err.message).trim().split('\n').pop()}`); continue; }
    await run(ab, ['wait', '6000'], env, 20000);
    const title = (await run(ab, ['get', 'title'], env, 15000)).stdout.trim();
    const text = (await run(ab, ['get', 'text', 'body'], env, 20000)).stdout;
    console.log(`  · ${url} (${Date.now() - t0} ms): ${readSite(url, title, text)}`);
  }
  await run(ab, ['close', '--all'], env, 15000);
  console.log('  tier 2 (cloak / cloud:*): NOT measured — the cloakbrowser binary is absent on this box (src/browser-profiles CLOAK_EGRESS_PROOF: binary_absent) and no cloud key is configured; the reading is the refusal.');
  console.log('  tier 3 (local-window): NOT measured by this script — it is the user\'s own browser window, addressed only after the D27 (b) switch is on; a script driving it would be the user\'s act, not a measurement.');
  console.log('  banks: NOT attempted — a real login page driven by an automated browser from the owner\'s address is the owner\'s act (D31 "measure first" stands as owed to the owner, with the public demo pages above as the only tier-1 reading this round).');
}

// ── §4.9 columns 1/2 on the user's own session ─────────────────────────────
async function captureLeg() {
  console.log('\n§4.9 columns 1 and 2 — re-verified on THIS session');
  const display = process.env.DISPLAY || null;
  console.log(`  session: XDG_SESSION_TYPE=${process.env.XDG_SESSION_TYPE || '-'} DISPLAY=${display || '-'} WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY || '-'} desktop=${process.env.XDG_CURRENT_DESKTOP || '-'}`);
  if (!display) console.log('  column 1: no DISPLAY in the environment — X11 enumeration and x11grab cannot even be asked');
  else {
    const xenv = { ...process.env };
    const cl = await run('xprop', ['-root', '_NET_CLIENT_LIST'], xenv, 5000);
    const ids = (cl.stdout.match(/0x[0-9a-f]+/gi) || []);
    const tree = await run('xwininfo', ['-root', '-children'], xenv, 5000);
    const tops = (tree.stdout.match(/^\s+0x[0-9a-f]+/gim) || []).length;
    const wm = await run('wmctrl', ['-lp'], xenv, 5000);
    console.log(`  column 1 enumerate: _NET_CLIENT_LIST names ${ids.length} managed X11 client window(s); xwininfo sees ${tops} X toplevels (helpers included); wmctrl -lp prints ${wm.stdout.trim().split('\n').filter(Boolean).length} line(s)${cl.err ? ` (xprop: ${cl.err.message.split('\n')[0]})` : ''}`);
    const root = await grabNonZero(xenv, ['-video_size', '64x64', '-i', `${display}+0,0`]);
    console.log(`  column 1 x11grab of the ROOT (64x64 at 0,0): ${root.ok ? `${root.nonZero} of ${root.bytes} bytes non-zero${root.nonZero ? '' : ' — ALL BLACK: the Xwayland root is not the screen'}` : 'failed — ' + root.why}`);
    if (!has('--no-real-window')) {
      for (const backend of ['x11', 'wayland']) {
        const f = await mapFixture({ ...xenv, GDK_BACKEND: backend }, { label: `vibespace measure (${backend})` });
        if (f.why) { console.log(`  ${backend} client: ${f.why}`); continue; }
        const xid = await xidByPid(f.pid, xenv, backend === 'x11' ? 16 : 6);
        const cl2 = (await run('xprop', ['-root', '_NET_CLIENT_LIST'], xenv, 5000)).stdout.match(/0x[0-9a-f]+/gi) || [];
        const wm2 = (await run('wmctrl', ['-lp'], xenv, 5000)).stdout.trim().split('\n').filter(Boolean).length;
        let line = `  ${backend === 'x11' ? 'an Xwayland client' : 'a NATIVE Wayland client'} (the fixture, pid ${f.pid}, mapped for the run): on the a11y bus ${f.onBus ? 'YES' : 'NO'}; xdotool search --pid → ${xid || 'NOTHING (no X window)'}; _NET_CLIENT_LIST now ${cl2.length}; wmctrl -lp ${wm2} line(s)`;
        if (xid) {
          const pidProp = (await run('xprop', ['-id', xid, '_NET_WM_PID'], xenv, 5000)).stdout.trim();
          const win = await grabNonZero(xenv, ['-window_id', String(parseInt(xid, 10)), '-i', display]);
          line += `; ${pidProp || '(no _NET_WM_PID)'}; x11grab -window_id: ${win.ok ? `${win.nonZero} of ${win.bytes} bytes non-zero${win.nonZero ? ' (the window\'s own pixels ARE readable)' : ' — ALL BLACK'}` : 'failed — ' + win.why}`;
        }
        console.log(line);
        f.kill(); await sleep(300);
      }
    }
  }
  // column 2: the portal and the shell
  const py = path.join(dir, 'screencast.py'); fs.writeFileSync(py, SCREENCAST_PY);
  const wait = flag('--wait', '2');
  console.log('  column 2 ScreenCast portal — CreateSession / SelectSources(window) / Start (bounded), then Close [this shell\'s context]');
  console.log(indent((await run('python3', [py, wait], process.env, 40000)).stdout || '(no output)'));
  if (has('--systemd') || all) {
    const r2 = await run('systemd-run', ['--user', '--wait', '--pipe', '--collect', '--quiet', '-p', 'TimeoutStartSec=40', 'python3', py, wait], process.env, 60000);
    console.log('  column 2 ScreenCast portal [systemd --user transient unit — the server\'s own context]');
    console.log(indent(r2.stdout || r2.stderr || (r2.err && r2.err.message) || '(no output)'));
  }
  for (const [what, a] of [['GNOME Shell Introspect.GetWindows', ['call', '--session', '--dest', 'org.gnome.Shell', '--object-path', '/org/gnome/Shell/Introspect', '--method', 'org.gnome.Shell.Introspect.GetWindows']], ['GNOME Shell Screenshot.ScreenshotWindow', ['call', '--session', '--dest', 'org.gnome.Shell.Screenshot', '--object-path', '/org/gnome/Shell/Screenshot', '--method', 'org.gnome.Shell.Screenshot.ScreenshotWindow', 'true', 'false', 'false', path.join(dir, 'never-written.png')]]]) {
    const r = await run('gdbus', a, process.env, 8000);
    console.log(`  ${what}: ${r.err ? (r.stderr || r.err.message).trim().split('\n')[0] : 'ANSWERED — ' + r.stdout.trim().slice(0, 120)}`);
  }
}

// ── §12.39 — do_action → a visible pixel change ────────────────────────────
async function latencyLeg() {
  console.log('\n§12.39 — one do_action → a visible PIXEL change (XGetImage of the fixture\'s own window)');
  const py = path.join(dir, 'pixlat.py'); fs.writeFileSync(py, PIXLAT_PY);
  const n = flag('--n', '10');
  const targets = [];
  const xv = await ownXvfb();
  if (xv.why) console.log(`  our own Xvfb: ${xv.why}`); else targets.push({ label: `our own Xvfb ${xv.display}`, env: xv.xenv });
  if (has('--real') || all) { if (process.env.DISPLAY) targets.push({ label: `the user's own display ${process.env.DISPLAY} (Xwayland, GDK_BACKEND=x11)`, env: { ...process.env, GDK_BACKEND: 'x11' } }); else console.log('  --real: no DISPLAY in the environment'); }
  for (const t of targets) {
    const f = await mapFixture(t.env, { label: 'vibespace measure (latency)' });
    if (f.why) { console.log(`  ${t.label}: ${f.why}`); continue; }
    const xid = await xidByPid(f.pid, t.env);
    if (!xid) { console.log(`  ${t.label}: the fixture has no X window (xdotool search --pid found nothing)`); f.kill(); continue; }
    const r = await run('python3', [py, String(f.pid), xid, n], t.env, 60000);
    console.log(`  ${t.label}: fixture pid ${f.pid}, xid ${xid}\n${indent(r.stdout || r.stderr)}`);
    f.kill(); await sleep(300);
  }
}

if (all || has('--sites')) await sitesLeg();
if (all || has('--capture')) await captureLeg();
if (all || has('--latency')) await latencyLeg();
cleanup();
