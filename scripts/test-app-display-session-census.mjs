#!/usr/bin/env node
// AN APP'S DISPLAY IS A COMPLETE PRIVATE SESSION — the notifications sink + THE RED CENSUS of its session bus (lane
// app-display-notify-sink, 2026-10-12, B-4a59 piece 2; the owner's path 1). An app on its own display with its own bus
// (lane app-display-portal, 2.369.256) asked org.freedesktop.Notifications and nobody answered. MEASURED before the fix
// on a scratch bus with the .256 services dir: libnotify / GApplication → ServiceUnknown (silently dropped), the portal's
// Notification answered () and its gtk backend dropped it, Ubuntu's notify-send (AppArmor profile `notify-send`: the
// user-bus paths only) → "Could not connect: Permission denied" in 8 ms.
//   ① PURE — portalPlan's sink rows (the service file, the bus env, what it says when python3-gi / the file is missing
//      or the setting is off), notifyRecord's bounds, notifyVerdict, SESSION_BUS_NAMES' shape.
//   ② THE SINK on a scratch dbus-run-session (an abstract /tmp/dbus-* socket — the one notify-send's profile allows):
//      notify-send -u critical ⇒ ONE journal record; GetCapabilities = [body]; GetServerInformation; CloseNotification ⇒
//      NotificationClosed + a closed line. RED CONTROL: the same bus without the sink ⇒ notify-send fails within 3 s.
//   ③ THE REAL PLAN BUS (D.startPortalBus, its path socket): ListActivatableNames names the sink; an in-process Notify
//      (what libnotify does) ⇒ a journal record; notify-send's AppArmor refusal there is a measured FACT, printed.
//   ④ THE CENSUS — the universe (printed): every SESSION_BUS_NAMES row ∪ every name of the box's dbus-1/services dir a
//      GUI app commonly asks (CENSUS_NAMES — the brief's list + the names this lane SAW apps ask). Each is PROVIDED (the
//      started bus activates it) or ABSENT-AND-SAID (what the app sees + the piece); anything else is RED. CONTROLS: a
//      table without the Notifications row, and a bus without the sink, are both RED.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const M = require('../src/desktop-apps.js');
const D = require('../src/desktop-display.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('① PURE — the sink in the plan, the record, the verdict, the table');
const bins = { 'dbus-daemon': '/usr/bin/dbus-daemon', 'xdg-desktop-portal': '/usr/libexec/xdg-desktop-portal', 'xdg-desktop-portal-gtk': '/usr/libexec/xdg-desktop-portal-gtk' };
const sinkOn = M.notifySinkOf({ python: '/usr/bin/python3', sink: '/r/src/notify-sink.py' });
const pl = M.portalPlan({ dir: '/d/da-1', display: ':7', bins, why: 'flatpak', notify: sinkOn });
const svc = pl.files.find((f) => f.file === '/d/da-1/portal/services/org.freedesktop.Notifications.service');
ok(pl.ok && pl.notify === 'on' && svc && svc.text === '[D-BUS Service]\nName=org.freedesktop.Notifications\nExec=/usr/bin/python3 /r/src/notify-sink.py\n', 'portalPlan + the sink: ONE activatable service file — the interpreter + the sink file, no shell, no argv secret');
ok(pl.journal === '/d/da-1/portal/notify.jsonl' && pl.env.VS_NOTIFY_JOURNAL === pl.journal && !('VS_NOTIFY_JOURNAL' in pl.appEnv), 'the journal path rides the BUS env (every activated service inherits it), never the app\'s');
const said = (n) => M.portalPlan({ dir: '/d', display: ':1', bins, notify: n });
ok(said(null).notify === 'off' && said(M.notifySinkOf({ mode: 'off', python: '/p', sink: '/s' })).notify === 'off' && !said(null).files.some((f) => /Notifications/.test(f.file)), 'no sink facts / desktop.appNotifications = off ⇒ notify \'off\', no service file');
ok(said(M.notifySinkOf({ python: null, sink: '/s' })).notify === 'unavailable: python3 not found on this machine' && said(M.notifySinkOf({ python: '/p', gi: false, sink: '/s' })).notify === 'unavailable: python3 has no GObject introspection (python3-gi) on this machine' && said(M.notifySinkOf({ python: '/p', sink: null })).notify === 'unavailable: the notifications sink is not installed on this machine', 'a machine without python3 / python3-gi / the sink file ⇒ `unavailable: <why>` (the app still launches)');
ok(said({ python: '/p q/python3', sink: '/s' }).notify.startsWith('unavailable: the sink path has a space'), 'a path with a space ⇒ unavailable (an Exec= line splits on it)');
ok(M.appNotificationsMode('bogus') === 'on' && M.APP_NOTIFICATIONS_DEFAULT === 'on' && M.appNotificationsMode('off') === 'off', 'desktop.appNotifications: on | off, default on (the owner\'s path-1 ruling)');
const nr = M.notifyRecord(JSON.stringify({ nid: 3, app: 'JASP', summary: 'Export finished', body: 'x'.repeat(5000), urgency: 'critical', at: 9 }));
ok(nr && nr.nid === 3 && nr.app === 'JASP' && nr.urgency === 'critical' && nr.body.length === M.NOTIFY_BODY_MAX && nr.at === 9, `notifyRecord: a sink line → the record, the body capped at ${M.NOTIFY_BODY_MAX}`);
ok(M.notifyRecord('{"nid":0,"summary":"a"}') === null && M.notifyRecord('not json') === null && M.notifyRecord('{"nid":2,"summary":"","body":" "}') === null && M.notifyRecord('{"nid":2,"summary":"a","urgency":"loud"}').urgency === 'normal' && M.notifyRecord('{"nid":2,"closed":true,"at":4}').closed === true, 'notifyRecord: a bad id / broken JSON / nothing to say ⇒ null; an unknown urgency ⇒ normal; a closed line kept');
ok(M.notifyRecord(JSON.stringify({ nid: 1, summary: 'a\u0007b\u001bc', body: '' })).summary === 'abc', 'notifyRecord: control characters are dropped from the words');
const vd = (u, visible) => M.notifyVerdict({ note: { urgency: u }, visible });
ok(vd('normal', true).toast && !vd('normal', true).forYou && vd('normal', false).forYou && vd('critical', true).forYou && !M.notifyVerdict({ note: { closed: true }, visible: false }).toast, 'notifyVerdict: always a toast in the window; For you when critical OR no pane shows the window');
const absentRows = M.SESSION_BUS_NAMES.filter((r) => r.absent);
ok(M.SESSION_BUS_NAMES.every((r) => /^[a-zA-Z][\w.]+$/.test(r.name) && !!r.provided !== !!r.absent) && absentRows.every((r) => r.absent.sees.length > 20 && /piece|never|not planned/.test(r.absent.piece)), `SESSION_BUS_NAMES: ${M.SESSION_BUS_NAMES.length} rows, each provided XOR absent with what the app sees + the piece`);
ok(['org.freedesktop.PolicyKit1.AuthenticationAgent'].map((n) => M.SESSION_BUS_NAMES.find((r) => r.name === n)).every((r, i) => r && r.absent && [/^never/][i].test(r.absent.piece)) && /piece 3/.test((M.SESSION_BUS_NAMES.find((r) => r.name === 'org.a11y.Bus') || {}).provided), 'the later pieces are named: a11y → provided (piece 3), secrets → piece 4, polkit → never');

const facts = await D.notifySinkFacts({ env: process.env });
const need = ['dbus-daemon', 'dbus-run-session', 'gdbus', 'notify-send'].filter((b) => !D.binOnPath(b, { env: process.env }));
const skip = !facts.python ? `the sink: ${facts.why || 'off'}` : need.length ? `${need.join(', ')} not on PATH` : null;
const S = scratchDir('vs-adns-census');
const RT = path.join(S, 'xrt'); fs.mkdirSync(RT, { recursive: true, mode: 0o700 });
const baseEnv = { PATH: process.env.PATH, HOME: S, LANG: 'C.UTF-8', XDG_RUNTIME_DIR: RT }; // §76: a private runtime dir — never the owner's
const secretFacts = await D.appSecretsFacts({ env: process.env, mode: 'on', dataDir: S, id: 'census' }); // lane app-display-secrets: the Secret Service rides the same plan bus
const journalOf = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
/** A plan's files under `dir` (the bus's own dirs), returned with the plan. */
const writePlan = (dir, notify) => {
  const p = M.portalPlan({ dir, display: ':0', bins: D.portalBins({ env: process.env }), why: 'row', notify });
  const ss = M.secretServicePlan({ plan: p, facts: secretFacts }); if (ss.files.length) p.files.push(...ss.files); // lane app-display-secrets + display-secret-fd: the service file AND its one-shot key file, nothing over the env (desktop-serve lays it the same way)
  for (const d of p.dirs) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  for (const f of p.files) { fs.mkdirSync(path.dirname(f.file), { recursive: true }); fs.writeFileSync(f.file, f.text, { mode: 0o600 }); }
  return p;
};
/** Run `script` (bash) inside a dbus-run-session over `plan`'s services, listening where notify-send may connect. */
const inSession = (plan, script) => {
  const conf = path.join(path.dirname(plan.journal || path.join(S, 'x')), 'run-session.conf');
  fs.writeFileSync(conf, plan.files[0].text.replace(/<listen>[^<]*<\/listen>/, '<listen>unix:tmpdir=/tmp</listen>'));
  const t0 = Date.now();
  const r = spawnSync('dbus-run-session', [`--config-file=${conf}`, '--', 'bash', '-c', script], { env: { ...baseEnv, ...plan.env, XDG_RUNTIME_DIR: RT, DISPLAY: '' }, encoding: 'utf8', timeout: 20000 });
  return { out: `${r.stdout || ''}${r.stderr || ''}`, ms: Date.now() - t0, status: r.status };
};
let activatable = [];
if (skip) console.log(`  SKIP ②③ — ${skip}`);
else {
  console.log(`② the sink on a scratch dbus-run-session (python ${facts.python}, ${path.relative(process.cwd(), facts.sink)})`);
  const pOn = writePlan(path.join(S, 'on'), facts);
  const r = inSession(pOn, [
    'notify-send -u critical -a JASP "Export finished" "results.omv saved"; echo "send-rc=$?"',
    'gdbus call --session -d org.freedesktop.Notifications -o /org/freedesktop/Notifications -m org.freedesktop.Notifications.GetCapabilities',
    'gdbus call --session -d org.freedesktop.Notifications -o /org/freedesktop/Notifications -m org.freedesktop.Notifications.GetServerInformation',
    `python3 -c '
from gi.repository import Gio, GLib
b = Gio.bus_get_sync(Gio.BusType.SESSION)
got = []
b.signal_subscribe(None, "org.freedesktop.Notifications", "NotificationClosed", "/org/freedesktop/Notifications", None, 0, lambda *a: got.append(a[5].unpack()))
nid = b.call_sync("org.freedesktop.Notifications", "/org/freedesktop/Notifications", "org.freedesktop.Notifications", "Notify", GLib.Variant("(susssasa{sv}i)", ("JASP", 0, "", "second", "", [], {}, -1)), None, 0, 3000, None).unpack()[0]
b.call_sync("org.freedesktop.Notifications", "/org/freedesktop/Notifications", "org.freedesktop.Notifications", "CloseNotification", GLib.Variant("(u)", (nid,)), None, 0, 3000, None)
ctx = GLib.MainContext.default()
for _ in range(100):
    ctx.iteration(False)
    if got: break
    GLib.usleep(10000)
print("closed-signal", got)'`,
  ].join('\n'));
  const j = journalOf(pOn.journal);
  const first = j[0] || {};
  ok(/send-rc=0/.test(r.out) && first.app === 'JASP' && first.summary === 'Export finished' && first.body === 'results.omv saved' && first.urgency === 'critical' && Number.isInteger(first.nid), `notify-send -u critical ⇒ ONE forwarded record {app, summary, body, urgency: critical} (${r.ms} ms for the whole session)`);
  ok(/\(\['body'\],\)/.test(r.out), 'GetCapabilities = [\'body\'] (P0: no actions, no icons)');
  ok(/\('VibeSpace', 'VibeSpace', '[^']*', '1\.2'\)/.test(r.out), 'GetServerInformation = (VibeSpace, VibeSpace, <version>, 1.2)');
  const closedLine = j.find((x) => x.closed === true);
  ok(/closed-signal \[\(\d+, 3\)\]/.test(r.out) && closedLine && j.filter((x) => !x.closed).length === 2, 'CloseNotification ⇒ NotificationClosed(id, 3) on the bus + a closed line in the journal');
  const pOff = writePlan(path.join(S, 'off'), null);
  const c = inSession(pOff, 'timeout 3 notify-send -u critical -a JASP "Export finished" body; echo "send-rc=$?"');
  // the failure is the BUS's answer, not the `timeout 3` cut (lane wall-clock-ratchet-down: `c.ms < 5000` judged the
  // machine): notify-send exits non-zero with ServiceUnknown — a cut would exit 124
  const cRc = Number((c.out.match(/send-rc=(\d+)/) || [])[1]);
  ok(cRc > 0 && cRc !== 124 && /not provided by any \.service files|ServiceUnknown/.test(c.out), `RED CONTROL: the same bus WITHOUT the sink ⇒ notify-send fails, exit ${cRc} (${(c.out.match(/[^\n]*(?:ServiceUnknown|not provided)[^\n]*/) || [''])[0].slice(0, 110)}) in ${c.ms} ms`);

  console.log('③ the REAL plan bus (D.startPortalBus — its path socket in the app\'s 0700 dir)');
  const pr = writePlan(path.join(S, 'real'), facts);
  let child = null;
  try {
    child = await D.startPortalBus({ plan: pr, env: baseEnv });
    const g = (args) => spawnSync('gdbus', ['call', '--session', ...args], { env: { ...baseEnv, DBUS_SESSION_BUS_ADDRESS: pr.address }, encoding: 'utf8', timeout: 10000 });
    const ln = g(['-d', 'org.freedesktop.DBus', '-o', '/org/freedesktop/DBus', '-m', 'org.freedesktop.DBus.ListActivatableNames']);
    activatable = (ln.stdout.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
    ok(activatable.includes('org.freedesktop.Notifications') && activatable.includes('org.freedesktop.portal.Desktop'), `ListActivatableNames on the plan's bus: ${activatable.filter((n) => n !== 'org.freedesktop.DBus').join(', ')}`);
    const n = g(['-d', 'org.freedesktop.Notifications', '-o', '/org/freedesktop/Notifications', '-m', 'org.freedesktop.Notifications.Notify', 'JASP', '0', '', 'Export finished', 'on the real bus', '[]', '{"urgency": <byte 2>}', '5000']);
    await sleep(50);
    const rj = journalOf(pr.journal);
    ok(n.status === 0 && rj.length === 1 && rj[0].urgency === 'critical' && rj[0].body === 'on the real bus', 'an in-process Notify (libnotify\'s call) on the app\'s real bus ⇒ one journal record');
    const ns = spawnSync('notify-send', ['probe'], { env: { ...baseEnv, DBUS_SESSION_BUS_ADDRESS: pr.address }, encoding: 'utf8', timeout: 5000 });
    console.log(`    FACT: notify-send (the CLI) on the plan's path socket → rc ${ns.status}: ${(ns.stderr || '').trim().slice(0, 100) || 'ok'}${fs.existsSync('/etc/apparmor.d/notify-send') ? ' (AppArmor profile notify-send: /run/user/<uid>/bus + /tmp/dbus-* only — an app calling libnotify in-process is not confined)' : ''}`);
  } catch (e) { ok(false, `the plan's bus started: ${e.message}`); }
  finally { try { child?.kill('SIGTERM'); } catch { /* gone */ } }
}

console.log('④ THE CENSUS — every GUI-bearing session-bus name: provided, or absent and said');
// the names a GUI app commonly asks its SESSION bus (the brief's list + what this lane SAW: x-d-p-gtk asked org.a11y.Bus,
// a GApplication asked org.freedesktop.Notifications) — the universe is these ∪ the table, intersected with nothing: a
// name in this list the table forgets is RED whether or not this box ships it
const CENSUS_NAMES = ['org.freedesktop.portal.Desktop', 'org.freedesktop.portal.Documents', 'org.freedesktop.impl.portal.PermissionStore', 'org.freedesktop.Notifications', 'org.a11y.Bus', 'org.freedesktop.secrets', 'org.freedesktop.ScreenSaver', 'org.freedesktop.PowerManagement.Inhibit', 'org.kde.StatusNotifierWatcher', 'org.gtk.vfs.Daemon', 'ca.desrt.dconf'];
let boxNames = [];
try { boxNames = fs.readdirSync('/usr/share/dbus-1/services').filter((f) => f.endsWith('.service')).map((f) => f.slice(0, -8)); } catch { /* no services dir */ }
const universe = [...new Set([...CENSUS_NAMES, ...M.SESSION_BUS_NAMES.map((r) => r.name)])];
console.log(`    universe (${universe.length}): ${universe.join(', ')}`);
console.log(`    on this box's /usr/share/dbus-1/services (${boxNames.length} files): ${universe.filter((n) => boxNames.includes(n)).join(', ') || 'none of them'}`);
const act = skip ? M.SESSION_BUS_NAMES.filter((r) => r.provided).map((r) => r.name) : activatable;
const rows = M.sessionBusCensus({ universe, activatable: act });
for (const r of rows) console.log(`    ${r.verdict === 'RED' ? '✗' : '·'} ${r.name} — ${r.verdict}: ${r.why.slice(0, 150)}`);
const optional = new Map(M.PORTAL_SERVICES.slice(2)); // "when installed" (PORTAL_SERVICES' optional rows: name → binary — the document portal, the permission store, the a11y launcher)
ok(rows.every((r) => r.verdict !== 'RED' || (optional.has(r.name) && !D.portalBins({ env: process.env })[optional.get(r.name)])), `every name is provided or absent-and-said (${rows.filter((r) => r.verdict === 'provided').length} provided, ${rows.filter((r) => r.verdict === 'absent-said').length} said absent)${skip ? ' — provided judged from the table (no bus: ' + skip + ')' : ''}`);
const red1 = M.sessionBusCensus({ universe, activatable: act, table: M.SESSION_BUS_NAMES.filter((r) => r.name !== 'org.freedesktop.Notifications') }).filter((r) => r.verdict === 'RED').map((r) => r.name);
ok(red1.join() === 'org.freedesktop.Notifications', `RED CONTROL: a table that forgets org.freedesktop.Notifications ⇒ RED on exactly it (${red1.join(', ')})`);
const red2 = M.sessionBusCensus({ universe, activatable: act.filter((n) => n !== 'org.freedesktop.Notifications') }).filter((r) => r.verdict === 'RED').map((r) => r.name);
ok(red2.join() === 'org.freedesktop.Notifications', 'RED CONTROL: a bus that does not activate the sink (the .256 plan) ⇒ RED on org.freedesktop.Notifications');
const red4 = M.sessionBusCensus({ universe, activatable: act.filter((n) => n !== 'org.a11y.Bus') }).filter((r) => r.verdict === 'RED').map((r) => r.name);
ok(red4.join() === 'org.a11y.Bus', 'RED CONTROL: a bus that does not activate the a11y launcher (the .261 plan) ⇒ RED on org.a11y.Bus (lane app-display-a11y-bus)');
const red5 = M.sessionBusCensus({ universe, activatable: act.filter((n) => n !== 'org.freedesktop.secrets') }).filter((r) => r.verdict === 'RED').map((r) => r.name);
ok(red5.join() === 'org.freedesktop.secrets', 'RED CONTROL: a bus that does not activate the Secret Service (the .262 plan) ⇒ RED on org.freedesktop.secrets (lane app-display-secrets)');
const red3 = M.sessionBusCensus({ universe: [...universe, 'org.gnome.Mutter.IdleMonitor'], activatable: act }).filter((r) => r.verdict === 'RED').map((r) => r.name);
ok(red3.join() === 'org.gnome.Mutter.IdleMonitor', 'RED CONTROL: a name apps ask that the table never heard of ⇒ RED');

try { fs.rmSync(S, { recursive: true, force: true }); } catch { /* a document-portal FUSE mount is not made here */ }
console.log(`\ntest-app-display-session-census: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
