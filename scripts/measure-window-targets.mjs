#!/usr/bin/env node
// MEASURE — the four things docs/design-agent-browser-v2 §10's P9 row says to
// measure FIRST (§12.29 / §12.30 / §12.33 + the do_action latency), so the
// numbers recorded in docs/kb-file-structure.md (src/window-targets.js) can be
// re-taken on another desktop. Prints; asserts nothing. Read-only on the
// user's desktop: it walks trees that are already on the accessibility bus and
// only ACTS on a GTK fixture it starts on its own Xvfb.
//
//   node scripts/measure-window-targets.mjs              everything that can run here
//   node scripts/measure-window-targets.mjs --portal     ① the RemoteDesktop portal, from THIS context
//   node scripts/measure-window-targets.mjs --portal --systemd   ① from a `systemd-run --user` transient unit
//   node scripts/measure-window-targets.mjs --census [--pid N]   ② the interface census (every app on the bus, or one)
//   node scripts/measure-window-targets.mjs --latency   ③ do_action → tree-visible change on the GTK fixture
//   node scripts/measure-window-targets.mjs --cost      ④ per-node cost: libatspi (the helper) vs raw D-Bus (Gio, no cache) + the fork tax
//
// ① raises the desktop's consent dialog for `--wait` seconds (default 3) and
// closes the session — nobody clicks it; what is measured is whether the D-Bus
// path is OPEN from a background unit, not whether a grant is obtained.
import fs from 'node:fs';
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
const all = !['--portal', '--census', '--latency', '--cost'].some(has);
const run = (bin, a, env = process.env, timeout = 60000) => new Promise((res) => execFile(bin, a, { env, timeout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));
const dir = scratch('measure-wt');
fs.mkdirSync(dir, { recursive: true });
const children = new Set();
const cleanup = () => { for (const c of children) { try { process.kill(c.pid, 'SIGTERM'); } catch { } } try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const PORTAL_PY = String.raw`
import os, sys, time, secrets
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
WAIT = float(sys.argv[1])
print('context: invocation=%s DBUS=%s' % (os.environ.get('INVOCATION_ID', '-')[:8], bool(os.environ.get('DBUS_SESSION_BUS_ADDRESS'))))
try: bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
except Exception as e: print('SESSION BUS UNREACHABLE:', e); sys.exit(0)
sender = bus.get_unique_name()[1:].replace('.', '_'); loop = GLib.MainLoop()
def request(method, build):
    token = 'vs' + secrets.token_hex(4); req = '/org/freedesktop/portal/desktop/request/%s/%s' % (sender, token); out = {}
    def on_resp(c, s, p, i, sig, params): out['code'], out['results'] = params.unpack(); loop.quit()
    sub = bus.signal_subscribe('org.freedesktop.portal.Desktop', 'org.freedesktop.portal.Request', 'Response', req, None, 0, on_resp)
    t0 = time.perf_counter()
    try: bus.call_sync('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop', 'org.freedesktop.portal.RemoteDesktop', method, build(token), None, 0, 5000, None)
    except Exception as e: bus.signal_unsubscribe(sub); return {'error': str(e)}
    GLib.timeout_add(int(WAIT * 1000) if method == 'Start' else 5000, loop.quit); loop.run(); bus.signal_unsubscribe(sub)
    out['ms'] = round((time.perf_counter() - t0) * 1000, 1); return out
r1 = request('CreateSession', lambda t: GLib.Variant('(a{sv})', ({'handle_token': GLib.Variant('s', t), 'session_handle_token': GLib.Variant('s', 'vs' + secrets.token_hex(4))},)))
print('CreateSession:', r1)
if r1.get('code') != 0: sys.exit(0)
session = r1['results']['session_handle']
print('SelectDevices(types=7, persist_mode=2):', request('SelectDevices', lambda t: GLib.Variant('(oa{sv})', (session, {'handle_token': GLib.Variant('s', t), 'types': GLib.Variant('u', 7), 'persist_mode': GLib.Variant('u', 2)}))))
r3 = request('Start', lambda t: GLib.Variant('(osa{sv})', (session, '', {'handle_token': GLib.Variant('s', t)})))
print('Start (waited %.1fs):' % WAIT, r3 if ('code' in r3 or 'error' in r3) else {'pending': 'no Response within the wait — the consent dialog is up (nobody clicks it here)'})
try: bus.call_sync('org.freedesktop.portal.Desktop', session, 'org.freedesktop.portal.Session', 'Close', None, None, 0, 3000, None); print('session Closed')
except Exception as e: print('Close:', e)
`;

const RAWDBUS_PY = String.raw`
import sys, time
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
pid = int(sys.argv[1]); budget = int(sys.argv[2])
sess = Gio.bus_get_sync(Gio.BusType.SESSION, None)
addr = sess.call_sync('org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress', None, GLib.VariantType('(s)'), 0, 2000, None).unpack()[0]
bus = Gio.DBusConnection.new_for_address_sync(addr, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
A = 'org.a11y.atspi.Accessible'
def call(dest, p, iface, m, a=None, rt=None): return bus.call_sync(dest, p, iface, m, a, GLib.VariantType(rt) if rt else None, 0, 800, None).unpack()
def prop(dest, p, iface, n): return call(dest, p, 'org.freedesktop.DBus.Properties', 'Get', GLib.Variant('(ss)', (iface, n)), '(v)')[0]
kids = call('org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root', A, 'GetChildren', None, '(a(so))')[0]
app = None
for (dest, p) in kids:
    try: upid = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetConnectionUnixProcessID', GLib.Variant('(s)', (dest,)), GLib.VariantType('(u)'), 0, 2000, None).unpack()[0]
    except Exception: upid = None
    if upid == pid: app = (dest, p); break
if not app: print('app not found on the a11y bus by pid'); sys.exit(0)
t0 = time.perf_counter(); n = 0; calls = 0; q = [app]
while q and n < budget:
    dest, p = q.pop(0)
    try:
        call(dest, p, A, 'GetRoleName', None, '(s)'); prop(dest, p, A, 'Name'); ifaces = call(dest, p, A, 'GetInterfaces', None, '(as)')[0]; calls += 3
        if 'org.a11y.atspi.Component' in ifaces: call(dest, p, 'org.a11y.atspi.Component', 'GetExtents', GLib.Variant('(u)', (0,)), '((iiii))'); calls += 1
        if 'org.a11y.atspi.Action' in ifaces: call(dest, p, 'org.a11y.atspi.Action', 'GetActions', None, '(a(sss))'); calls += 1
        q.extend(call(dest, p, A, 'GetChildren', None, '(a(so))')[0]); calls += 1
    except Exception: pass
    n += 1
dt = time.perf_counter() - t0
print('raw D-Bus (Gio, no libatspi cache): %d nodes, %d calls, %.1f ms, %.0f nodes/s, %.2f ms/node' % (n, calls, dt * 1000, n / dt, dt * 1000 / n))
`;

const LATENCY_PY = String.raw`
import sys, time, statistics, warnings
warnings.simplefilter('ignore')
import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi
pid = int(sys.argv[1]); N = int(sys.argv[2])
Atspi.set_timeout(800, 3000)
d = Atspi.get_desktop(0); app = None
for i in range(d.get_child_count()):
    a = d.get_child_at_index(i)
    if a.get_process_id() == pid: app = a; break
def find(acc, roles, prefix):
    if acc.get_role_name() in roles and (acc.get_name() or '').startswith(prefix): return acc
    for i in range(acc.get_child_count()):
        r = find(acc.get_child_at_index(i), roles, prefix)
        if r: return r
btn = find(app, ('button', 'push button'), 'Count'); lbl = find(app, ('label',), 'count ')
act = btn.get_action_iface(); names = [Atspi.Action.get_action_name(act, i) for i in range(Atspi.Action.get_n_actions(act))]
idx = names.index('click') if 'click' in names else 0
lat = []; call = []
for k in range(N):
    before = lbl.get_name(); t0 = time.perf_counter(); Atspi.Action.do_action(act, idx); t1 = time.perf_counter()
    while lbl.get_name() == before and time.perf_counter() - t0 < 5: pass
    t2 = time.perf_counter(); call.append((t1 - t0) * 1000); lat.append((t2 - t0) * 1000); time.sleep(0.02)
lat.sort(); call.sort(); p = lambda a, q: a[min(len(a) - 1, int(len(a) * q))]
print('do_action call: median %.2f ms, p95 %.2f ms' % (statistics.median(call), p(call, 0.95)))
print('do_action -> tree-visible change: median %.2f ms, p95 %.2f ms, max %.2f ms (N=%d, actions=%s)' % (statistics.median(lat), p(lat, 0.95), lat[-1], N, names))
`;

async function fixture() {
  // our own Xvfb + the GTK witness app, registered on the session's a11y bus
  const xvfb = D.binOnPath('Xvfb', { env: process.env });
  if (!xvfb) return { why: 'Xvfb not on PATH' };
  const authFile = path.join(dir, 'Xauthority'); const cookie = D.newCookie();
  D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }]);
  const xv = spawn(xvfb, ['-displayfd', '3', '-screen', '0', '800x600x24', '-nolisten', 'tcp', '-auth', authFile], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  children.add(xv);
  const display = await new Promise((res) => { let s = ''; xv.stdio[3].on('data', (d) => { s += d; if (/\n/.test(s)) res(':' + s.trim()); }); setTimeout(() => res(null), 10000); });
  if (!display) return { why: 'Xvfb did not answer -displayfd' };
  D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }, { display, cookieHex: cookie }]);
  const xenv = D.x11Env(process.env, { display, authFile });
  const app = spawn('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'window-target-app.py')], { env: xenv, stdio: ['ignore', 'pipe', 'inherit'] });
  children.add(app);
  const pid = await new Promise((res) => { let s = ''; app.stdout.on('data', (d) => { s += d; const m = /READY (\d+)/.exec(s); if (m) res(Number(m[1])); }); setTimeout(() => res(null), 15000); });
  if (!pid) return { why: 'the GTK fixture did not map' };
  for (let i = 0; i < 40; i++) { const r = await WT.runHelper({ op: 'apps' }, { wallMs: 8000 }); if (r.ok && (r.apps || []).some((a) => a.pid === pid)) return { pid, display, xenv }; await new Promise((r2) => setTimeout(r2, 250)); }
  return { why: 'the fixture never appeared on the a11y bus' };
}

if (all || has('--portal')) {
  console.log('\n① RemoteDesktop portal — CreateSession / SelectDevices / Start (bounded), then Close');
  const py = path.join(dir, 'portal.py'); fs.writeFileSync(py, PORTAL_PY);
  const wait = flag('--wait', '3');
  const r = has('--systemd')
    ? await run('systemd-run', ['--user', '--wait', '--pipe', '--collect', '--quiet', '-p', 'TimeoutStartSec=40', 'python3', py, wait])
    : await run('python3', [py, wait]);
  console.log((has('--systemd') ? '  [systemd --user transient unit]\n' : '  [this shell\'s context]\n') + (r.stdout || r.stderr).trim().split('\n').map((l) => '  ' + l).join('\n'));
  if (all) { const r2 = await run('systemd-run', ['--user', '--wait', '--pipe', '--collect', '--quiet', '-p', 'TimeoutStartSec=40', 'python3', py, wait]); console.log('  [systemd --user transient unit]\n' + (r2.stdout || r2.stderr || (r2.err && r2.err.message) || '').trim().split('\n').map((l) => '  ' + l).join('\n')); }
}

if (all || has('--census')) {
  console.log('\n② interface census through the helper (libatspi) — per application on the bus');
  const probe = await WT.probeA11y({ wallMs: 10000 });
  if (!probe.ok) console.log('  a11y unreachable:', probe.why);
  else {
    const apps = (await WT.runHelper({ op: 'apps' }, { wallMs: 8000 })).apps || [];
    const want = flag('--pid') ? apps.filter((a) => a.pid === Number(flag('--pid'))) : apps;
    for (const a of want) {
      const s = await WT.snapshotTarget({ pids: [a.pid], budget: Number(flag('--budget', 600)), text: false });
      if (!s.ok) { console.log(`  ${a.name} (pid ${a.pid}): ${s.code} — ${s.why}`); continue; }
      const c = s.snapshot.census;
      console.log(`  ${a.name} (pid ${a.pid}): ${c.nodes} nodes in ${s.snapshot.ms} ms (${s.snapshot.nodesPerSec} nodes/s)${s.snapshot.truncated ? ' [truncated]' : ''} — Component ${c.component}, Action ${c.action}, EditableText ${c.editableText}, Text ${c.text}, buttons with Action ${c.buttonsWithAction}/${c.buttons}, unreadable ${s.snapshot.unreadable.length}; actions ${JSON.stringify(c.actionNames)}`);
    }
  }
}

if (all || has('--latency') || has('--cost')) {
  const f = await fixture();
  if (f.why) console.log(`\n③/④ need the GTK fixture on our own Xvfb: ${f.why}`);
  else {
    if (all || has('--latency')) {
      console.log(`\n③ do_action → tree-visible change (GTK fixture pid ${f.pid} on ${f.display})`);
      const py = path.join(dir, 'latency.py'); fs.writeFileSync(py, LATENCY_PY);
      const r = await run('python3', [py, String(f.pid), flag('--n', '30')]);
      console.log((r.stdout || r.stderr).trim().split('\n').map((l) => '  ' + l).join('\n'));
    }
    if (all || has('--cost')) {
      console.log('\n④ per-node cost: the helper (libatspi via GI) vs raw D-Bus (Gio, no cache) — the fixture and the biggest tree on the bus');
      const apps = (await WT.runHelper({ op: 'apps' }, { wallMs: 8000 })).apps || [];
      // the biggest tree on the bus = the app whose bounded walk returns the most nodes (a child count says nothing about depth)
      let big = null;
      for (const a of apps.filter((x) => x.pid !== f.pid)) { const s = await WT.snapshotTarget({ pids: [a.pid], budget: 600, text: false }); if (s.ok && (!big || s.snapshot.census.nodes > big.nodes)) big = { ...a, nodes: s.snapshot.census.nodes }; }
      const py = path.join(dir, 'raw.py'); fs.writeFileSync(py, RAWDBUS_PY);
      for (const a of [{ pid: f.pid, name: 'fixture' }, ...(big ? [big] : [])]) {
        for (let i = 0; i < 2; i++) { const s = await WT.snapshotTarget({ pids: [a.pid], budget: 600, text: false }); if (s.ok) console.log(`  helper  ${a.name}: ${s.snapshot.census.nodes} nodes in ${s.snapshot.ms} ms (${s.snapshot.nodesPerSec} nodes/s)`); }
        const r = await run('python3', [py, String(a.pid), '600']); console.log(`  rawdbus ${a.name}: ${(r.stdout || r.stderr).trim()}`);
      }
      const t = [];
      for (let i = 0; i < 5; i++) { const t0 = Date.now(); await WT.runHelper({ op: 'probe' }, { wallMs: 10000 }); t.push(Date.now() - t0); }
      console.log(`  fork tax: helper spawn → probe reply ${t.join(' / ')} ms (this process RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB — a bigger parent pays more, §1.6)`);
    }
  }
}
cleanup();
