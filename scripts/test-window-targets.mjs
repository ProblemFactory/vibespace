#!/usr/bin/env node
// WINDOW TARGETS — agent browser P9 first half (docs/design-agent-browser-v2
// §4.9 / §5.1.1 / §6.6, D27 (a) / D28 / D29; 2026-09-21).
//   §1 PURE: the closed chord vocabulary (an argv-bound string never passes
//      through), the action preference (showContextMenu / clickAncestor are
//      never picked unnamed), the per-verb capability law (key / click --at
//      refused WITH the probe rows when no wired injection backend exists;
//      click @ref / type never gated by injection), refs, rows, views.
//   §2 THE BOUNDED SUBPROCESS over fake helpers: a hung helper is SIGKILLed at
//      the wall and answers helper_timeout with the child DEAD; garbage ⇒
//      helper_error; a missing interpreter ⇒ python3_missing; a missing file
//      ⇒ helper_missing; a11y_unavailable passed through; an unknown helper
//      code mapped to helper_error (the closed set holds).
//   §3 REAL: this box's own Xvfb + the GTK fixture through the real helper —
//      refs minted from the real tree (role/name/bounds), the census PRINTED
//      (§12.30: coverage is per desktop), click @ref changing the app's state
//      as read back from ITS OWN tree, the label-drawn "button" refused
//      node_has_no_action, type through EditableText, ref_stale, the budget
//      truncating, ctrl+s and a canvas point click landing (the fixture's own
//      witness labels) and BOTH refused with the probe when xdotool is taken
//      away, a PNG of the frame. SKIPs with evidence without python3-gi /
//      Atspi / Gtk, Xvfb or a session bus.
//   §4 THE ENGINE over a fake keeper + the routes: one holder per window,
//      not_attached / window_leased / resumed, refs per snapshot, the engine
//      refusing a node without Action BEFORE any helper call — and still with
//      an injection backend present (the rule is about the node, not the
//      column) — the audit line without text, the STATUS map covering every
//      typed refusal, 401 / 400 unsupported-host at the routes.
//      B-bfe6 r1: a desktop-app BROWSER row (or url / keepProfile in the body) is
//      refused browser_is_human (403) before the keeper; a patched copy (outside
//      the tree) without the refusal is the negative control (it launches).
// No fixed display, no fixed port, no fixed /tmp name (scripts/scratch.mjs).
// Run: node scripts/test-window-targets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  ⚠ SKIP: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (bin, args, env = process.env, timeout = 8000) => new Promise((res) => execFile(bin, args, { env, timeout, encoding: 'utf8' }, (err, stdout, stderr) => res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));

const WT = require('../src/window-targets.js');
const D = require('../src/desktop-display.js');
const ENGINE = require('../src/server/window-targets-engine.js');
const ROUTES = require('../src/routes/window-targets.js');
const dir = scratch('window-targets');
// §4's negative control (a patched copy of the engine without the browser_is_human refusal) is written OUTSIDE
// the tree (scripts/mutant-copy.mjs, `require` re-bound to the real module's path — B-0220); §4 measures that
// while it exists.
const repo = path.resolve(path.dirname(require.resolve('../package.json')));
const MUTW = mutantCopies('wtargets', repo);
sweepLegacy(repo, ['src/server'], /^vs-wte-mut-(\d+)\.js$/);   // what a pre-fix run stranded (dead PIDs only)
fs.mkdirSync(dir, { recursive: true });
const children = new Set();
const cleanup = () => {
  for (const c of children) { try { process.kill(c.pid, 'SIGTERM'); } catch { } }
  setTimeout(() => { for (const c of children) { try { process.kill(c.pid, 'SIGKILL'); } catch { } } }, 300).unref?.();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// ─────────────────────────────────────────────────────────────────────────────
console.log('§1 PURE verdicts');
{
  let threw = null; try { WT.refuse('nope', 'x'); } catch (e) { threw = e; }
  ok(threw && /unknown refusal code/.test(threw.message), 'the refusal set is CLOSED — an unknown code throws instead of leaking');
}
{
  const c = WT.parseChord('ctrl+s');
  ok(c.ok && c.xdotool === 'ctrl+s' && c.hasModifier && c.key === 's', 'ctrl+s → the xdotool spelling');
  ok(WT.parseChord('Return').ok && WT.parseChord('Return').xdotool === 'Return' && !WT.parseChord('Return').hasModifier, 'a bare named key');
  ok(WT.parseChord('alt+F4').xdotool === 'alt+F4' && WT.parseChord('CTRL+Shift+T').xdotool === 'ctrl+shift+t', 'named keys and case-insensitive modifiers');
  ok(WT.parseChord('ctrl++').xdotool === 'ctrl+plus', '"ctrl++" is ctrl and the plus key');
  ok(WT.parseChord('super+Page_Down').xdotool === 'super+Page_Down' && WT.parseChord('meta+pageup').xdotool === 'meta+Page_Up', 'aliases resolve to one spelling');
  for (const bad of ['', 'ctrl+s; rm -rf /', 'ctrl+', 'hyper+x', 'a+b+c+d+e', 'ctrl+ab', '$(x)', 'ctrl+s\nrm', '+s', '`ls`', 'ctrl+-']) {
    const r = WT.parseChord(bad);
    ok(!r.ok && r.code === 'bad_chord', `refused: ${JSON.stringify(bad)}`, r);
  }
  // negative control: the naive passthrough the vocabulary replaces would hand an argv to xdotool
  const naive = (s) => ({ ok: true, xdotool: String(s) });
  ok(naive('ctrl+s; rm -rf /').ok === true && WT.parseChord('ctrl+s; rm -rf /').ok === false, 'negative control: a passthrough accepts the shell-shaped chord, the vocabulary does not');
}
{
  ok(WT.pickAction(['showContextMenu', 'clickAncestor', 'press']).name === 'press', 'Chromium\'s per-node showContextMenu/clickAncestor are never picked over press');
  const only = WT.pickAction(['showContextMenu']);
  ok(!only.ok && only.code === 'action_unknown' && /--action/.test(only.why), 'a node whose ONLY action is showContextMenu is not clicked by default — the refusal says to name it');
  ok(WT.pickAction(['showContextMenu'], 'showContextMenu').ok && WT.pickAction(['showContextMenu'], 'showContextMenu').index === 0, 'named explicitly ⇒ picked');
  ok(WT.pickAction(['click', 'activate']).name === 'click' && WT.pickAction(['activate', 'click']).name === 'click', 'preference order, not declaration order');
  ok(WT.pickAction(['a', 'b'], '1').name === 'b' && WT.pickAction(['a', 'b'], '5').code === 'action_unknown' && WT.pickAction(['a'], 'zzz').code === 'action_unknown', 'an index or a name; out of range / unknown are named');
  ok(WT.pickAction([]).code === 'node_has_no_action' && WT.pickAction(null).code === 'node_has_no_action', 'no actions ⇒ node_has_no_action');
  ok(WT.pickAction(['', 'weird']).name === 'weird', 'an empty action name (measured: 32 of 66 on this desktop) is skipped for a named one');
}
{
  const none = { rows: [{ backend: 'xtest', available: false, wired: true, why: 'xdotool not on PATH' }, { backend: 'portal', available: 'consent', wired: false, why: 'RemoteDesktop present' }, { backend: 'uinput', available: false, wired: false, why: '/dev/uinput absent' }], injection: null, ours: true };
  const v = WT.verbVerdicts({ a11y: { ok: true }, backends: none });
  ok(!v.key.ok && !v['click-at'].ok && /no injection backend/.test(v.key.why) && /xdotool not on PATH/.test(v.key.why) && /consent/.test(v['click-at'].why), 'key and click --at are refused WITH the probe rows when no wired backend exists');
  ok(v.click.ok && v.type.ok && v.snapshot.ok, 'click @ref / type / snapshot ride the tree — never gated by injection');
  ok(v.click.note && /never degraded/.test(v.click.note), 'the click verdict states the per-node rule');
  const some = { ...none, injection: { backend: 'xtest', available: true, wired: true } };
  const v2 = WT.verbVerdicts({ a11y: { ok: true }, backends: some });
  ok(v2.key.ok && v2.key.backend === 'xtest' && v2['click-at'].ok, 'a wired backend ⇒ both injection verbs allowed and named');
  const v3 = WT.verbVerdicts({ a11y: { ok: false, why: 'no bus' }, backends: some });
  ok(!v3.snapshot.ok && !v3.click.ok && !v3.type.ok && /no bus/.test(v3.click.why) && v3.key.ok, 'no accessibility tree ⇒ the tree verbs refuse; injection verbs are independent of it');
  const v4 = WT.verbVerdicts({ a11y: { ok: true }, backends: { ...some, ours: false } });
  ok(!v4.screenshot.ok && /D27/.test(v4.screenshot.why), 'pixels only from our own display (D27 (a))');
  // a present-but-unwired rung never counts as injection (the consent portal, a writable uinput)
  const unwired = { rows: [{ backend: 'uinput', available: true, wired: false, why: 'not wired' }], injection: null, ours: true };
  ok(!WT.verbVerdicts({ backends: unwired }).key.ok && /present, not wired/.test(WT.verbVerdicts({ backends: unwired }).probe), 'an available-but-unwired rung is spelled "present, not wired" and does not enable a verb');
}
{
  const snap = { nodes: [{ ref: '@e1', pid: 7, path: [], role: 'application', name: 'x', depth: 0 }, { ref: '@e2', pid: 7, path: [0], role: 'frame', name: 'Win', bounds: { x: 0, y: 0, w: 10, h: 10 }, text: 'secret body', depth: 1, parent: '@e1' }, { ref: '@e3', pid: 7, path: [0, 1], role: 'button', name: 'Go', actions: ['click'], depth: 2, states: ['focused', 'enabled', 'weird'] }] };
  const t = WT.refTableOf(snap);
  ok(t.size === 3 && t.get('@e2').pid === 7 && t.get('@e2').path.join() === '0' && t.get('@e2').role === 'frame' && t.get('@e2').text === undefined, 'the ref table is identity only (pid, path, role, name, bounds, actions) — never the text');
  ok(WT.resolveRef(t, '@e3').ok && WT.resolveRef(t, '@e3').entry.actions[0] === 'click', 'a ref resolves to its entry');
  ok(WT.resolveRef(t, '@e99').code === 'ref_unknown' && WT.resolveRef(t, 'e2').code === 'ref_unknown' && WT.resolveRef(null, '@e1').code === 'ref_unknown', 'unknown / malformed / no table ⇒ ref_unknown');
  const v = WT.nodeView(snap.nodes[2]);
  ok(v.ref === '@e3' && v.path === undefined && v.actions[0] === 'click' && v.states.join() === 'focused' && !('text' in v), 'nodeView drops the path, keeps the ref/role/name/actions, filters states to the meaningful ones');
  const v2 = WT.nodeView({ ...snap.nodes[1], text: 'Win' });
  ok(v2.text === undefined && WT.nodeView(snap.nodes[1]).text === 'secret body', 'text equal to the name is not repeated; other text is kept for the agent');
}
{
  const apps = [{ id: 'da-1', label: 'A', state: 'ready', display: ':9', pids: { app: 11, x: 12 }, exec: 'a', backend: 'vnc-display', startedAt: 1 }, { id: 'da-2', label: 'B', state: 'exited', pids: { app: 21 } }, { id: 'da-3', label: 'C', state: 'launching', pids: { app: 31 }, appId: 'gedit' }];
  const rows = WT.targetRows(apps, { a11yApps: [{ pid: 11, name: 'a', children: 1 }, { pid: 99, name: 'other' }] });
  ok(rows.length === 2 && rows[0].handle === 'da-1' && rows[1].handle === 'da-3' && rows.every((r) => r.origin === 'vibespace'), 'rows = the LIVE keeper records, handle = the record id, every row origin:vibespace (D27 (a))');
  ok(rows[0].a11y && rows[0].a11y.pid === 11 && rows[1].a11y === null && rows[1].appId === 'gedit', 'the a11y presence is matched by pid; a launching app without a tree says so');
  const viaSession = WT.targetRows(apps, { a11yApps: [{ pid: 555, name: 'child' }], sessionPids: (rec) => [...Object.values(rec.pids), 555] });
  ok(viaSession[0].a11y && viaSession[0].a11y.pid === 555, 'the session census (a launcher whose work is in a child) is what the tree is matched against');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§2 the bounded subprocess (fake helpers driven by node as the "interpreter")');
{
  const fake = (name, body) => { const p = path.join(dir, name); fs.writeFileSync(p, body); return p; };
  const pidFile = path.join(dir, 'hung.pid');
  const hung = fake('hung.js', `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`);
  const t0 = Date.now();
  const r = await WT.runHelper({ op: 'snapshot' }, { python: process.execPath, helper: hung, wallMs: 1200 });
  const dt = Date.now() - t0;
  ok(!r.ok && r.code === 'helper_timeout' && dt >= 1100 && dt < 4000 && r.ms >= 1100, `a helper that never answers is killed at the wall (${dt} ms) and answers helper_timeout with the elapsed ms`, r);
  const hp = Number(fs.readFileSync(pidFile, 'utf8'));
  await sleep(100);
  let alive = true; try { process.kill(hp, 0); } catch { alive = false; }
  ok(!alive, 'the hung child is DEAD after the refusal (SIGKILL, not a dangling traversal)');
  const garbage = fake('garbage.js', `process.stdout.write('this is not json\\n'); process.stderr.write('boom\\n');`);
  const g = await WT.runHelper({ op: 'probe' }, { python: process.execPath, helper: garbage, wallMs: 3000 });
  ok(!g.ok && g.code === 'helper_error' && /nothing parseable/.test(g.why) && /boom/.test(g.why), 'garbage on stdout ⇒ helper_error carrying the stderr tail', g);
  const unavailable = fake('unavail.js', `process.stdout.write(JSON.stringify({ok:false, code:'a11y_unavailable', why:'no gi'}) + '\\n'); process.exit(3);`);
  const u = await WT.runHelper({ op: 'probe' }, { python: process.execPath, helper: unavailable, wallMs: 3000 });
  ok(!u.ok && u.code === 'a11y_unavailable' && u.why === 'no gi', 'the helper\'s own typed refusal (exit 3) passes through');
  const unknown = fake('unknown.js', `process.stdout.write(JSON.stringify({ok:false, code:'something_new', why:'x'}) + '\\n');`);
  const k = await WT.runHelper({ op: 'probe' }, { python: process.execPath, helper: unknown, wallMs: 3000 });
  ok(!k.ok && k.code === 'helper_error' && k.helperCode === 'something_new', 'a code outside the closed set is mapped to helper_error (with the original beside it) — routes never see an unknown code');
  const echo = fake('echo.js', `let s=''; process.stdin.on('data', d => s += d).on('end', () => process.stdout.write(JSON.stringify({ok:true, got: JSON.parse(s)}) + '\\n'));`);
  const e = await WT.runHelper({ op: 'snapshot', pids: [1, 2], budget: 5 }, { python: process.execPath, helper: echo, wallMs: 3000 });
  ok(e.ok && e.got.op === 'snapshot' && e.got.pids.join() === '1,2' && e.got.budget === 5 && typeof e.wallMs === 'number', 'the request reaches the helper on stdin as one JSON object; the reply carries the wall time');
  const m = await WT.runHelper({ op: 'probe' }, { python: '/nonexistent/python3', helper: echo, wallMs: 3000 });
  ok(!m.ok && m.code === 'python3_missing' && /python3-gi/.test(m.why), 'a missing interpreter ⇒ python3_missing naming the packages');
  const h = await WT.runHelper({ op: 'probe' }, { python: process.execPath, helper: path.join(dir, 'nope.py'), wallMs: 3000 });
  ok(!h.ok && h.code === 'helper_missing', 'a missing helper file ⇒ helper_missing');
  ok(fs.existsSync(WT.HELPER_PATH) && /Atspi\.set_timeout/.test(fs.readFileSync(WT.HELPER_PATH, 'utf8')) && /budget/.test(fs.readFileSync(WT.HELPER_PATH, 'utf8')), 'the shipped helper sets libatspi\'s per-call timeout and walks under a node budget (grep pin)');
  ok(WT.TRAVERSAL_LIMITS.WALL_MS > WT.TRAVERSAL_LIMITS.CALL_TIMEOUT_MS && WT.TRAVERSAL_LIMITS.SNAPSHOT_MAX_BUDGET >= WT.TRAVERSAL_LIMITS.NODE_BUDGET, 'the wall outlives one call; the ceiling is above the default budget');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§3 REAL: this box\'s Xvfb + the GTK fixture through the real helper');
const base = { ...process.env };
const py = await run('python3', ['-c', "import gi; gi.require_version('Atspi','2.0'); gi.require_version('Gtk','3.0'); from gi.repository import Atspi, Gtk; print('ok')"], base, 20000);
const xvfbBin = D.binOnPath('Xvfb', { env: base });
const a11y = py.err ? null : await WT.probeA11y({ env: base, wallMs: 10000 });
let real = null; // { pid, xenv, display, snapshot, refs, bins }
if (py.err) skip(`python3 gi Atspi/Gtk not importable: ${(py.stderr || py.err.message).trim().split('\n').pop()}`);
else if (!xvfbBin) skip('Xvfb not on PATH');
else if (!base.DBUS_SESSION_BUS_ADDRESS && !base.XDG_RUNTIME_DIR) skip('no session bus in this environment (DBUS_SESSION_BUS_ADDRESS / XDG_RUNTIME_DIR unset) — the a11y bus is unreachable');
else if (!a11y || !a11y.ok) skip(`the accessibility bus did not answer: ${a11y && a11y.why}`);
else {
  console.log(`  a11y probe: ${a11y.apps} apps on the bus in ${a11y.ms} ms`);
  // an X server of our own, on a number -displayfd hands us
  const authFile = path.join(dir, 'Xauthority');
  const cookie = D.newCookie();
  D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }]);
  const xv = spawn(xvfbBin, ['-displayfd', '3', '-screen', '0', '800x600x24', '-nolisten', 'tcp', '-auth', authFile], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  children.add(xv);
  const display = await new Promise((res) => { let s = ''; xv.stdio[3].on('data', (d) => { s += d; if (/\n/.test(s)) res(':' + s.trim()); }); setTimeout(() => res(null), 10000); });
  if (!display) skip('Xvfb did not answer -displayfd within 10 s');
  else {
    D.writeXauthority(authFile, [{ display: '0', cookieHex: cookie }, { display, cookieHex: cookie }]);
    const xenv = D.x11Env(base, { display, authFile });
    const app = spawn('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'window-target-app.py')], { env: { ...xenv, VS_WT_TITLE: 'vs window fixture' }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(app);
    let appErr = ''; app.stderr.on('data', (d) => { appErr = (appErr + d).slice(-2000); });
    const pid = await new Promise((res) => { let s = ''; app.stdout.on('data', (d) => { s += d; const m = /READY (\d+)/.exec(s); if (m) res(Number(m[1])); }); setTimeout(() => res(null), 15000); });
    if (!pid) skip(`the GTK fixture did not map within 15 s: ${appErr.trim().split('\n').pop() || 'no stderr'}`);
    else {
      // wait for the app on the a11y bus
      let onBus = false;
      for (let i = 0; i < 40 && !onBus; i++) { const r = await WT.runHelper({ op: 'apps' }, { env: base, wallMs: 8000 }); onBus = !!(r.ok && (r.apps || []).some((a) => a.pid === pid)); if (!onBus) await sleep(250); }
      ok(onBus, `the fixture (pid ${pid}) registered on the session\'s accessibility bus from OUR display ${display} — the bus is per user, not per display`);
      const snapRes = await WT.snapshotTarget({ pids: [pid], env: base });
      ok(snapRes.ok, 'snapshotTarget answers', snapRes);
      if (snapRes.ok) {
        const s = snapRes.snapshot; const refs = snapRes.refs;
        const c = s.census;
        console.log(`  census (this desktop, this app): ${c.nodes} nodes in ${s.ms} ms (${s.nodesPerSec} nodes/s) — Action ${c.action}/${c.nodes}, EditableText ${c.editableText}/${c.nodes}, Text ${c.text}/${c.nodes}, buttons with Action ${c.buttonsWithAction}/${c.buttons}; actions ${JSON.stringify(c.actionNames)}; unreadable ${s.unreadable.length}`);
        const byName = (role, name) => [...refs.values()].find((e) => e.role === role && e.name === name);
        const byRole = (role) => [...refs.values()].find((e) => e.role === role);
        const btn = byName('button', 'Count') || byName('push button', 'Count');
        const frame = byRole('frame');
        const fake = byName('label', 'Fake button (no Action)');
        const entry = [...refs.values()].find((e) => e.editable);
        ok(frame && frame.bounds && frame.bounds.w > 0 && /^@e\d+$/.test(frame.ref), `the frame is a ref with bounds (${frame && frame.ref} ${frame && JSON.stringify(frame.bounds)})`);
        ok(btn && btn.actions && btn.actions.includes('click'), `the Count button declares \`click\` (${btn && btn.ref} ${btn && JSON.stringify(btn.actions)})`);
        ok(fake && (!fake.actions || fake.actions.length === 0) && fake.bounds, 'the label-drawn "button" exports NO Action (the negative-control node)');
        ok(entry && entry.editable, `an editable node exists (${entry && entry.ref} ${entry && entry.role})`);
        ok(c.nodes > 0 && c.action >= 2 && c.editableText >= 1 && s.truncated === false, 'the census counts the interfaces and the walk was not truncated');
        const nodesOf = (snap) => snap.snapshot.nodes;
        const labelText = (snap, prefix) => (nodesOf(snap).find((n) => n.role === 'label' && String(n.name).startsWith(prefix)) || {}).name;
        ok(labelText(snapRes, 'count ') === 'count 0', 'the app states count 0 before any act');
        // click @ref through the tree
        const pick = WT.pickAction(btn.actions);
        const clicked = await WT.actOnNode({ entry: btn, verb: 'do_action', action: pick.index, env: base });
        ok(clicked.ok && clicked.did.action === 'click', `do_action(click) on the Count button answered in ${clicked.ms} ms`, clicked);
        const after = await WT.snapshotTarget({ pids: [pid], env: base });
        ok(after.ok && labelText(after, 'count ') === 'count 1', 'the app\'s OWN tree reports count 1 — the state change is read back from the tree, not from pixels', after.ok && labelText(after, 'count '));
        // the node without Action: the helper refuses, never degrades
        const noact = await WT.actOnNode({ entry: fake, verb: 'do_action', env: base });
        ok(!noact.ok && noact.code === 'node_has_no_action' && /never degraded/.test(noact.why), 'do_action on the label-drawn button is refused node_has_no_action by the helper itself');
        const still = await WT.snapshotTarget({ pids: [pid], env: base });
        ok(still.ok && labelText(still, 'canvas') === 'canvas none' && labelText(still, 'count ') === 'count 1', 'and nothing was clicked at its coordinates (the canvas witness is untouched)');
        // type through EditableText
        const typed = await WT.actOnNode({ entry: entry, verb: 'insert_text', text: 'hello tree', env: base });
        ok(typed.ok && typed.did.chars === 10, 'insert_text into the entry answered', typed);
        const echoed = await WT.snapshotTarget({ pids: [pid], env: base });
        ok(echoed.ok && labelText(echoed, 'entry ') === "entry 'hello tree'", 'the app echoes the typed text (its own tree)', echoed.ok && labelText(echoed, 'entry '));
        const replaced = await WT.actOnNode({ entry: entry, verb: 'set_text', text: 'x', env: base });
        const echoed2 = await WT.snapshotTarget({ pids: [pid], env: base });
        ok(replaced.ok && echoed2.ok && labelText(echoed2, 'entry ') === "entry 'x'", 'set_text replaces the content');
        const notEditable = await WT.actOnNode({ entry: frame, verb: 'insert_text', text: 'no', env: base });
        ok(!notEditable.ok && notEditable.code === 'node_not_editable', 'type on a non-editable node is refused node_not_editable');
        // a stale ref: the recorded identity no longer matches the node at that path
        const stale = await WT.actOnNode({ entry: { ...btn, name: 'Count (renamed)' }, verb: 'do_action', env: base });
        ok(!stale.ok && stale.code === 'ref_stale' && /new snapshot/.test(stale.why), 'a ref whose node changed is ref_stale, never acted on');
        const gone = await WT.actOnNode({ entry: { ...btn, pid: 999999 }, verb: 'do_action', env: base });
        ok(!gone.ok && gone.code === 'app_gone', 'a pid no longer on the bus ⇒ app_gone');
        // the budget truncates
        const tiny = await WT.snapshotTarget({ pids: [pid], budget: 3, env: base });
        ok(tiny.ok && tiny.snapshot.nodes.length === 3 && tiny.snapshot.truncated === true, 'a 3-node budget yields 3 nodes and says TRUNCATED');
        ok((await WT.snapshotTarget({ pids: [pid], budget: 999999, env: base })).snapshot.budget === WT.TRAVERSAL_LIMITS.SNAPSHOT_MAX_BUDGET, 'the budget is clamped to the ceiling');
        // the focused node (whatever it is) is answered, never guessed
        const foc = await WT.focusedNode({ pids: [pid], env: base });
        ok(foc.ok && (foc.node === null || typeof foc.node.ref === 'string'), `focusedNode answers (${foc.node ? foc.node.role + ' ' + JSON.stringify(foc.node.name) : 'nothing focused'})`);
        // injection: the probe, then the two verbs — on OUR display, with and without xdotool
        const probe = await WT.probeInputBackends({ env: xenv, ours: true });
        console.log(`  input-backend probe on ${display}: ${probe.rows.map((r) => `${r.backend}=${r.available}${r.wired ? '' : '(unwired)'}${r.why ? ' [' + r.why + ']' : ''}`).join(' · ')}`);
        ok(probe.rows.length === 3 && probe.rows.map((r) => r.backend).join() === 'xtest,portal,uinput', 'the ladder has its three rungs in order');
        const without = await WT.probeInputBackends({ env: xenv, ours: true, bins: { xdotool: null, gdbus: null } });
        ok(without.injection === null && /xdotool not on PATH/.test(without.rows[0].why), 'without xdotool there is NO wired injection backend (the probe says why)');
        const foreign = await WT.probeInputBackends({ env: xenv, ours: false, bins: { xdotool: '/usr/bin/xdotool', gdbus: null } });
        ok(foreign.injection === null && /D27/.test(foreign.rows[0].why), 'a display that is not ours gets no injection even with xdotool present (D27 (a))');
        const noInj = WT.verbVerdicts({ a11y, backends: without });
        ok(!noInj.key.ok && !noInj['click-at'].ok && /xdotool not on PATH/.test(noInj.key.why), 'key and click --at are refused with that probe');
        const inj = await WT.injectKey({ bins: { xdotool: null }, xenv, chord: WT.parseChord('ctrl+s') });
        ok(!inj.ok && inj.code === 'no_injection_backend', 'injectKey without a backend is a typed refusal, not a spawn');
        if (!probe.injection) skip(`xdotool absent — the live injection legs (ctrl+s, canvas point click) cannot run here (probe: ${probe.rows[0].why})`);
        else {
          const centre = { x: frame.bounds.x + frame.bounds.w / 2, y: frame.bounds.y + 20 };
          const key = await WT.injectKey({ bins: { xdotool: probe.injection.bin }, xenv, chord: WT.parseChord('ctrl+s'), focus: centre });
          ok(key.ok && key.did.chord === 'ctrl+s' && key.did.backend === 'xtest', 'ctrl+s injected through xtest on our display', key);
          let keyLabel = null;
          for (let i = 0; i < 20 && keyLabel !== 'key ctrl+s'; i++) { const k = await WT.snapshotTarget({ pids: [pid], env: base }); keyLabel = k.ok ? labelText(k, 'key ') : null; if (keyLabel !== 'key ctrl+s') await sleep(150); }
          ok(keyLabel === 'key ctrl+s', `the app\'s key witness reads "key ctrl+s" (got ${JSON.stringify(keyLabel)})`);
          const canvas = [...refs.values()].find((e) => e.role === 'drawing area') || null;
          const cb = canvas && canvas.bounds;
          if (!cb) skip(`the canvas is not a node with bounds in this GTK\'s tree (roles: ${[...new Set([...refs.values()].map((e) => e.role))].join(', ')}) — the point-click leg uses the canvas label\'s neighbourhood`);
          const target = cb ? { x: cb.x + cb.w / 2, y: cb.y + cb.h / 2 } : null;
          if (target) {
            const clickAt = await WT.injectClick({ bins: { xdotool: probe.injection.bin }, xenv, x: target.x, y: target.y });
            ok(clickAt.ok && clickAt.did.by === 'point', 'a point click injected through xtest', clickAt);
            let cv = null;
            for (let i = 0; i < 20 && !/^canvas click 1 at/.test(cv || ''); i++) { const k = await WT.snapshotTarget({ pids: [pid], env: base }); cv = k.ok ? labelText(k, 'canvas') : null; if (!/^canvas click 1/.test(cv || '')) await sleep(150); }
            ok(/^canvas click 1 at \d+,\d+$/.test(cv || ''), `the canvas witness reports the click (${JSON.stringify(cv)})`);
          }
        }
        // pixels: the fallback
        const shot = path.join(dir, 'frame.png');
        const sh = await WT.screenshotDisplay({ xenv, out: shot, bounds: frame.bounds });
        if (!sh.ok && sh.code === 'screenshot_unavailable') skip(`screenshot: ${sh.why}`);
        else {
          const magic = sh.ok ? fs.readFileSync(shot).slice(0, 8).toString('hex') : '';
          ok(sh.ok && magic === '89504e470d0a1a0a' && sh.w === frame.bounds.w && sh.h === frame.bounds.h, `a PNG of the frame (${sh.w}x${sh.h}, ${sh.bytes} bytes)`, sh);
        }
        real = { pid, xenv, display, refs, bins: probe.injection ? { xdotool: probe.injection.bin, gdbus: null } : { xdotool: null, gdbus: null }, hasInjection: !!probe.injection };
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§4 the engine over a fake keeper + the routes');
{
  const records = new Map();
  const mk = (id, extra = {}) => ({ id, label: `App ${id}`, exec: 'x', state: 'ready', display: real ? real.display : ':77', pids: { app: real ? real.pid : 4242, x: null, server: null, wm: null }, starts: {}, backend: 'vnc-display', startedAt: 1, ...extra });
  records.set('da-one', mk('da-one'));
  records.set('da-dead', mk('da-dead', { state: 'exited' }));
  let launched = 0;
  const keeper = {
    listApps: () => [...records.values()], get: (id) => records.get(id) || null,
    sessionPids: (rec) => Object.values(rec.pids).filter(Boolean),
    x11EnvFor: (id) => (records.get(id) ? (real ? real.xenv : D.x11Env(base, { display: ':77', authFile: path.join(dir, 'none') })) : null),
    launch: async (body) => { launched++; const rec = mk('da-new', { label: body.label || 'new', exec: body.exec || body.appId }); records.set(rec.id, rec); return rec; },
    // the keeper's catalog shape (B-bfe6): a browser row carries `browser`; the rest are ordinary apps
    registry: () => [{ id: 'gedit', label: 'gedit', exec: 'gedit', args: [], available: true, reason: null }, { id: 'chromium', label: 'Google Chrome', exec: 'google-chrome', args: [], category: 'browser', browser: 'chromium', available: true, reason: null }, { id: 'vs-browser', label: 'Fake browser', exec: 'vs-fake', args: [], category: 'browser', browser: 'firefox', available: true, reason: null }],
  };
  const sessions = new Map([['s1', { agentToken: 'vsst_aaaa', _browserKey: 'bk-11111111', name: 'alpha' }], ['s2', { agentToken: 'vsst_bbbb', _browserKey: 'bk-22222222', name: 'beta' }]]);
  let helperCalls = 0;
  const wt = { ...WT, actOnNode: (o) => { helperCalls++; return WT.actOnNode(o); } };
  const engine = ENGINE.create({ keeper, dataDir: dir, env: () => base, activeSessions: sessions, wt, bins: real ? real.bins : { xdotool: null, gdbus: null }, log: { warn() { } } });
  const f1 = engine.factsForToken('vsst_aaaa'), f2 = engine.factsForToken('vsst_bbbb');
  ok(f1 && f1.sessionId === 's1' && f1.browserKey === 'bk-11111111' && engine.factsForToken('vsst_zzzz') === null && engine.factsForToken('cookie') === null, 'a vsst_ token resolves to its session; anything else to nothing');
  const list = await engine.list(f1);
  ok(list.targets.length === 1 && list.targets[0].handle === 'da-one' && list.targets[0].lease === null && list.scope === 'vibespace-launched' && list.verbs && typeof list.a11y.ok === 'boolean', 'list = the live record with no lease, the scope named, the verbs and the a11y probe beside it');
  const err = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  ok((await err(() => engine.snapshot('da-one', f1))).code === 'not_attached', 'snapshot without a lease ⇒ not_attached');
  ok((await err(() => engine.act('da-one', f1, { verb: 'click', ref: '@e1' }))).code === 'not_attached', 'act without a lease ⇒ not_attached');
  ok((await err(() => engine.attach('da-dead', f1))).code === 'not-found' && (await err(() => engine.attach('nope', f1))).code === 'not-found', 'an exited or unknown record is not-found');
  const a2 = engine.attach('da-one', f2);
  ok(a2.handle === 'da-one' && a2.resumed === false && a2.lease.sessionId === 's2', 'session 2 attaches');
  const leased = await err(() => engine.attach('da-one', f1));
  ok(leased && leased.code === 'window_leased' && leased.holder === 's2' && /beta/.test(leased.message), 'one holder per window: session 1 is refused window_leased naming the holder');
  ok((await err(() => engine.detach('da-one', f1))).code === 'not_attached', 'a non-holder cannot detach');
  ok(engine.detach('da-one', f2).detached === true, 'the holder detaches');
  ok(engine.attach('da-one', f1).resumed === false && engine.attach('da-one', f1).resumed === true, 'attach is idempotent for the holder (resumed)');
  ok(engine.list && (await engine.list(f1)).targets[0].mine === true, 'list marks my lease');
  const opened = await engine.open({ appId: 'gedit', label: 'Notes' }, f2);
  ok(launched === 1 && opened.handle === 'da-new' && opened.attached && opened.lease.sessionId === 's2', 'open launches through the keeper and attaches the opener');
  // AN EXEC IS A HUMAN'S (design-desktop-apps §5 / design §5.1.1; 2026-09-21): refused BY NAME before the keeper is asked
  const ex = await err(() => engine.open({ exec: '/usr/bin/xterm', args: ['-e', 'sh'] }, f2));
  ok(ex && ex.code === 'exec_is_human' && /registry app/i.test(ex.message) && /vibespace-window list/.test(ex.message) && Array.isArray(ex.apps) && launched === 1, 'open with an exec is refused exec_is_human naming the remedy (registry ids via `list`) — the keeper never launched it');
  ok((await err(() => engine.open({ appId: 'gedit', cwd: '/tmp' }, f2))).code === 'exec_is_human' && (await err(() => engine.open({ appId: 'gedit', args: [] }, f2))).code === 'exec_is_human' && launched === 1, '…and so are args / cwd beside an appId (the whole exec triple is the user\'s)');
  ok(Array.isArray((await engine.list(f1)).apps), 'list carries the registry ids an agent may open (the refusal\'s remedy is real)');
  // A BROWSER ROW IS A HUMAN'S (B-bfe6, design-desktop-apps §7.7; the 2026-09-23 verifier's probe1 §E launched a real
  // browser from the agent route with the agent's url/keepProfile silently dropped): refused BY NAME before the keeper
  {
    const br = await err(() => engine.open({ appId: 'chromium' }, f2));
    ok(br && br.code === 'browser_is_human' && /vibespace-browser/.test(br.message) && /Google Chrome/.test(br.message) && launched === 1, 'open {appId:chromium} is refused browser_is_human naming the agent browser (`vibespace-browser`) — the keeper never launched it');
    ok((await err(() => engine.open({ appId: 'vs-browser' }, f2))).code === 'browser_is_human' && (await err(() => engine.open({ app: 'chromium' }, f2))).code === 'browser_is_human' && launched === 1, '…any row carrying `browser` (a custom id too), by either spelling of the id');
    const u = await err(() => engine.open({ appId: 'gedit', url: 'https://agent.example/' }, f2));
    const kp = await err(() => engine.open({ appId: 'gedit', keepProfile: false }, f2));
    ok(u && u.code === 'browser_is_human' && /^url/.test(u.message) && kp && kp.code === 'browser_is_human' && /^keepProfile/.test(kp.message) && launched === 1, '`url` / `keepProfile` in the agent body are refused by name, never silently dropped');
    const apps = (await engine.list(f1)).apps.map((a) => a.id);
    ok(apps.includes('gedit') && !apps.includes('chromium') && !apps.includes('vs-browser'), `list's "apps you may open" leaves the browser rows out (${apps.join(', ')})`);
    const plain = await engine.open({ appId: 'gedit' }, f2);
    ok(plain.handle === 'da-new' && plain.lease.sessionId === 's2' && launched === 2, 'a non-browser registry row still opens through the keeper');
    ok(ROUTES.STATUS.browser_is_human === 403, 'the route maps browser_is_human to 403');
    // negative control: the engine WITHOUT the refusal (a patched copy in this process's scratch dir) launches the browser row
    const src = fs.readFileSync(require.resolve('../src/server/window-targets-engine.js'), 'utf8');
    const patched = src.replace(/\n\s*if \(\(b\.url !== undefined[^\n]*\n/, '\n').replace(/\n\s*if \(bRow\) throw namedError\('browser_is_human'[^\n]*\n/, '\n');
    ok(patched !== src && !/if \(bRow\) throw/.test(patched), 'the control patch removed both refusals');
    const mut = MUTW.write('src/server/window-targets-engine.js', patched, 'nobrowser');
    {
      const M2 = require(mut);
      const e2 = M2.create({ keeper, dataDir: path.join(dir, 'mut'), env: () => base, activeSessions: sessions, wt: WT, bins: { xdotool: null, gdbus: null }, log: { warn() { } } });
      const o2 = await e2.open({ appId: 'chromium', url: 'https://agent.example/' }, f2);
      ok(o2 && o2.handle && launched === 3, 'negative control: without the refusal the agent route LAUNCHES the browser row (and drops its url) — the leg above is what stops it');
    }
    // the tree is never written (B-0220): measured while the copy still exists
    for (const r of copiesCensus(MUTW.files, MUTW.dir, repo, { minCopies: 1 })) ok(r.pass, '§4 tree: ' + r.name, r.pass ? undefined : r.detail);
  }
  ok((await err(() => engine.act('da-one', f1, { verb: 'key', chord: 'ctrl+s; x' }))).code === 'bad_chord', 'a bad chord is refused before any backend is consulted');
  ok((await err(() => engine.act('da-one', f1, { verb: 'click' }))).code === 'bad-request' && (await err(() => engine.act('da-one', f1, { verb: 'dance' }))).code === 'bad-request', 'click without a ref or --at, or an unknown verb ⇒ bad-request');
  ok((await err(() => engine.act('da-one', f1, { verb: 'click', ref: '@e1' }))).code === 'ref_unknown', 'a ref before any snapshot ⇒ ref_unknown (snapshot first)');
  const w = engine.watch('da-one', f1);
  ok(w.openSpec.action === 'openDesktopApp' && w.openSpec.id === 'da-one' && /Desktop-app window/.test(w.note), 'watch names the Desktop-app window (the whole private display) honestly');
  ok(engine.dropSession('s2') === 1 && engine.leases().length === 1, 'the kill path drops a session\'s leases');

  if (!real) skip('no real display/tree — the engine\'s tree legs (snapshot / click / type / injection / audit content) need §3');
  else {
    const snap = await engine.snapshot('da-one', f1);
    ok(snap.nodes.length > 0 && snap.census && snap.nodes.every((n) => n.path === undefined), 'engine.snapshot returns agent views (no paths) with the census');
    const btn = snap.nodes.find((n) => (n.role === 'button' || n.role === 'push button') && n.name === 'Count');
    const fake = snap.nodes.find((n) => n.role === 'label' && n.name === 'Fake button (no Action)');
    const entry = snap.nodes.find((n) => n.editable);
    const before = helperCalls;
    const r = await engine.act('da-one', f1, { verb: 'click', ref: btn.ref });
    ok(r.ok && r.did.by === 'node' && r.did.action === 'click' && helperCalls === before + 1, 'click @ref acts on the node through the helper');
    const noact = await err(() => engine.act('da-one', f1, { verb: 'click', ref: fake.ref }));
    ok(noact && noact.code === 'node_has_no_action' && helperCalls === before + 1 && /never degraded/.test(noact.message) && /--at/.test(noact.message), 'THE LAW: a node without Action is refused by the ENGINE before any helper call — the refusal names the bounds and the audited point path as the agent\'s own decision');
    ok(real.hasInjection ? noact.code === 'node_has_no_action' : true, `negative control: the refusal holds ${real.hasInjection ? 'WITH an injection backend present (xdotool)' : '(no backend here — the rule is about the node, the column is irrelevant)'}`);
    const typed = await engine.act('da-one', f1, { verb: 'type', ref: entry.ref, text: 'engine text' });
    ok(typed.ok && typed.did.chars === 11 && typed.did.ref === entry.ref, 'type @ref inserts through EditableText');
    const bad = await err(() => engine.act('da-one', f1, { verb: 'type', ref: fake.ref, text: 'x' }));
    ok(bad && bad.code === 'node_not_editable', 'type on a non-editable ref is refused');
    const stale = await err(() => engine.act('da-one', f1, { verb: 'click', ref: '@e9999' }));
    ok(stale && stale.code === 'ref_unknown', 'a ref not in the last snapshot ⇒ ref_unknown');
    // injection through the engine: refused without a backend, allowed with one
    // P9b: the lease PERSISTS — a second engine over the SAME data dir is a restart and session 1 still holds da-one
    { const again = ENGINE.create({ keeper, dataDir: dir, env: () => base, activeSessions: sessions, wt: WT, bins: { xdotool: null, gdbus: null }, log: { warn() { } } });
      const l = again.leaseOf('da-one');
      ok(l && l.sessionId === 's1' && l.origin === 'vibespace' && l.input === 'agent', 'a new engine over the same data dir still says session 1 holds da-one (persisted lease, input side fresh = agent)');
      ok((await err(() => again.attach('da-one', f2))).code === 'window_leased', 'and refuses session 2 exactly as before the restart'); }
    const noBins = ENGINE.create({ keeper, dataDir: path.join(dir, 'nobins'), env: () => base, activeSessions: sessions, wt: WT, bins: { xdotool: null, gdbus: null }, log: { warn() { } } });
    noBins.attach('da-one', f2);
    const k = await err(() => noBins.act('da-one', f2, { verb: 'key', chord: 'ctrl+s' }));
    ok(k && k.code === 'no_injection_backend' && Array.isArray(k.backends) && /xdotool not on PATH/.test(k.message), 'key without a wired backend ⇒ no_injection_backend carrying the probe rows');
    const at = await err(() => noBins.act('da-one', f2, { verb: 'click', at: '10,10' }));
    ok(at && at.code === 'no_injection_backend', 'click --at without a wired backend ⇒ the same refusal');
    ok((await err(() => noBins.act('da-one', f2, { verb: 'click', at: 'x,y' }))).code === 'bad-request', '--at wants integers');
    noBins.detach('da-one', f2);
    if (real.hasInjection) {
      const kk = await engine.act('da-one', f1, { verb: 'key', chord: 'ctrl+s' });
      ok(kk.ok && kk.did.backend === 'xtest', 'key through the engine with xdotool present');
      const frame = snap.nodes.find((n) => n.role === 'frame');
      const pt = await engine.act('da-one', f1, { verb: 'click', at: `${frame.bounds.x + 5},${frame.bounds.y + 5}` });
      ok(pt.ok && pt.did.by === 'point', 'a point click through the engine is by:point');
    }
    const shot = await engine.screenshot('da-one', f1);
    ok(shot.file && fs.existsSync(shot.file) && shot.cropped === true && shot.w > 0, 'engine.screenshot writes a PNG of the frame (cropped to the last snapshot\'s frame)');
    try { fs.unlinkSync(shot.file); } catch { }
    // the audit stream
    const lines = fs.readFileSync(engine.auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const clickLine = lines.find((l) => l.verb === 'click' && l.by === 'node' && l.ok);
    const typeLine = lines.find((l) => l.verb === 'type' && l.ok);
    const refusedLine = lines.find((l) => l.verb === 'click' && l.ok === false && l.code === 'node_has_no_action');
    ok(clickLine && clickLine.node.role && clickLine.node.name === 'Count' && clickLine.node.action === 'click' && clickLine.sessionId === 's1' && clickLine.browserKey === 'bk-11111111', 'the audit line for a tree click names the node and its action ("clicked the button named Count")');
    ok(typeLine && typeLine.chars === 11 && !('text' in typeLine) && !JSON.stringify(typeLine).includes('engine text'), 'the audit line for type records the length and NEVER the text');
    ok(refusedLine && refusedLine.node.name === 'Fake button (no Action)', 'a refused act is audited with its code');
    if (real.hasInjection) { const pl = lines.find((l) => l.verb === 'click' && l.by === 'point'); ok(pl && pl.at && typeof pl.at.x === 'number', 'a point click is audited by:point with its coordinates'); }
  }

  // the routes
  const express = require('express');
  const app = express();
  app.use(express.json());
  ROUTES.setup({ engine });
  app.use(ROUTES.router);
  const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = srv.address().port;
  const api = async (method, p, body, token = 'vsst_aaaa') => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; };
  ok((await api('GET', '/api/agent/window/targets', null, null)).status === 401 && (await api('GET', '/api/agent/window/targets', null, 'vsst_nope')).status === 401, 'no / unknown token ⇒ 401');
  const t = await api('GET', '/api/agent/window/targets');
  ok(t.status === 200 && t.j.targets.length === 2 && t.j.targets.some((r) => r.handle === 'da-one'), 'GET targets answers the rows');
  ok((await api('GET', '/api/agent/window/targets?host=other')).status === 400 && (await api('POST', '/api/agent/window/attach', { handle: 'da-one', host: 'box' })).j.code === 'unsupported-host', 'a non-local host is refused by name');
  ok((await api('POST', '/api/agent/window/attach', { handle: 'nope' })).status === 404 && (await api('POST', '/api/agent/window/attach', {})).status === 400, 'attach: unknown ⇒ 404, no handle ⇒ 400');
  ok((await api('POST', '/api/agent/window/act', { handle: 'da-one', verb: 'key', chord: 'x;y' })).status === 400, 'a bad chord ⇒ 400');
  const at2 = await api('POST', '/api/agent/window/attach', { handle: 'da-one' }, 'vsst_bbbb');
  ok(at2.status === 409 && at2.j.code === 'window_leased' && at2.j.holder === 's1', 'window_leased ⇒ 409 with the holder');
  ok((await api('POST', '/api/agent/window/detach', { handle: 'da-one' }, 'vsst_bbbb')).status === 404, 'not_attached ⇒ 404');
  const ww = await api('POST', '/api/agent/window/watch', { handle: 'da-one' });
  ok(ww.status === 200 && ww.j.openSpec.id === 'da-one', 'watch answers');
  const uncovered = WT.REFUSALS.filter((c) => !(c in ROUTES.STATUS));
  ok(uncovered.length === 0, `every typed refusal has a status (${uncovered.join(', ') || 'none uncovered'}) — a 500 for a typed refusal would be a silent failure`);
  ok(!Object.values(ROUTES.STATUS).includes(500), 'no typed code maps to 500');
  srv.close();
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
cleanup();
process.exit(fail ? 1 : 0);
