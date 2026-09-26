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
//   takeover r2: a desktop-app BROWSER is the human's by row, exec name,
//      launcher program or running exe — the measured fixture
//      scripts/fixtures/window-targets/browser-execs.json, this box's installed
//      browsers, a shell copy named `chrome` behind an unknown wrapper; gedit /
//      chromium-thumbnailer / infobrowser stay attachable; the r1 rule in a
//      patched engine copy is the negative control.
//   LANE E (docs/design-desktop-apps-seamless §3.6, the owner's D1–D7): §4 now starts HIDDEN — `list` shows
//      nothing, attach / snapshot / act / screenshot / watch / detach answer not_exposed until the user shares
//      the window; the T6 browser legs keep the CLASSIFICATION pins and now expect not_exposed (unshared) and an
//      attach that works once shared (D4); §5 LANE E over the fake keeper + the real fixture: a revoke mid-lease
//      drops the lease (next verb not_exposed, audited by:user), a Task Group joined LATER reaches, the opener's
//      self-open row, the mode table at the engine (pixels refuses the tree, auto resolves by a probe, a switch
//      audited mode-changed), the pixel road on the fixture's own window (screenshot in window coordinates, a
//      point click mapped through the origin landing on the canvas), the scroll verb's refusals, the request
//      producer over a stub ladder (free = the stash, wake = deliverToConversation under window-share-request, a
//      spend refusal / a paced wake falling to the stash with the reason, endHold), and the HUMAN routes of
//      src/routes/desktop-apps.js (GET/POST/DELETE reach, PUT mode, POST request, the launch's `share`; an agent
//      token 403 agent_forbidden, a paired machine's window 400 share_local_only); the STATUS census covers
//      src/window-reach.js's refusals too. LANE E VERIFY: a revoke / a group left / a takeover landing WHILE a verb
//      awaits (a delayed fake wt) stops it — click --at, click @ref behind an auto probe, snapshot, attachWithMode,
//      key, type, screenshot (its image deleted) — with a patched engine copy without the re-check as the control.
//   LANE E VERIFY R2 (2026-09-25): the races are DETERMINISTIC (the user's act fires at the start of a named await) and
//      the re-check is pinned PER SITE (M1): every `held()` / `heldOrUnlink(` / `stillHeld(` call in the engine is
//      grep-derived and printed, a patched copy with only that call replaced by the unchecked lease must turn ≥ 1 leg
//      red (new legs: scroll, pixel-mode type, type @ref into a state-editable field, the window-plan screenshot, the
//      tier-3 screenshot with the switch going off), a `// no-await-before` site is listed as redundant by construction
//      (its claim checked in the code). L4: a THROWING Task Group store ⇒ reach_unreadable by name, the lease kept,
//      audited by:store (control: the old fold-to-[] copy). L5 (§2b + §5 + §3): an injection is the lease's
//      cancellable child — a takeover / a revoke 100 ms into a running type / scroll cancels it (window_paused /
//      not_exposed + did.partial; control: cancelActs neutered), the primitive kills THE child by its handle (a
//      same-named decoy survives) and releases what it held (on the real fixture display: a type cancelled mid-key
//      leaves exactly one character; control: no release ⇒ the key autorepeats), TYPE_MAX × delay fits the timeout
//      (control: the old 4000 / 20 s pair); the route carries `did` and the CLI says "stopped part-way".
//   LANE E VERIFY R3 (2026-09-26): F1 a running act belongs to the WINDOW HANDLE — two §5 legs re-attach (the same
//      session detaches + attaches / the user revokes + shares again + the agent attaches) while the input probe awaits,
//      then take over 100 ms into the type ⇒ window_paused + did.partial + the child killed + the lease kept (CONTROL = the
//      r2 lease-OBJECT-keyed act rebuilt as two edits ⇒ the type runs to its end through the takeover); F2 a type killed
//      by its TIMEOUT (the real primitive, a forced 150 ms limit) answers `did` {partial, released} on the refusal, the
//      audit line, the route and the CLI (CONTROL: fromHelper without `did`); F3 (§2b + §3) a non-ASCII text typed as keys
//      runs under the UTF-8 rule — on the real Xvfb with LANG / LC_* stripped "ab中文é" lands whole (CONTROL: no rule ⇒
//      xdotool fails, the entry holds "ab"), and with no UTF-8 locale it is refused no_utf8_locale naming the character
//      BEFORE anything lands; F4 `list` re-asks reach after its last await — a §5 leg + the census's 15th site
//      (`stillListed`, neutered = the rows decided before the await); F5 the launch audit counts a group row a throwing
//      store could not decide as `undecided`, never `unmatched` (CONTROL: the r2 fold).
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
const RE = require('../src/window-reach.js');
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
console.log('§2b the cancellable injection (lane E verify r2, L5): killed by ITS handle, then what it held released');
{
  // L5's budget: a max-length type must be able to FINISH inside its own timeout (the old 4000 × 12 ms against a fixed
  // 20 s never could — killed after ~1,600 characters); the timeout scales with the text, twice the nominal rate
  const typeBudgetOk = (W) => W.TYPE_MAX * W.TYPE_DELAY_MS * 2 <= W.typeTimeoutMs(W.TYPE_MAX) && W.TYPE_MAX * 12.5 < W.typeTimeoutMs(W.TYPE_MAX);
  ok(WT.TYPE_MAX === 1500 && typeBudgetOk(WT), `TYPE_MAX × delay ≤ the timeout: ${WT.TYPE_MAX} × ${WT.TYPE_DELAY_MS} ms (measured 12.5 ms a character) fits typeTimeoutMs = ${WT.typeTimeoutMs(WT.TYPE_MAX)} ms with a 2× margin`);
  ok(/const tmo = Number\(timeout\) > 0 \? Number\(timeout\) : typeTimeoutMs\(s\.length\)/.test(fs.readFileSync(require.resolve('../src/window-targets.js'), 'utf8')), 'injectType\'s default timeout IS typeTimeoutMs(text length) (source pin)');
  const tooLong = await WT.injectType({ bins: { xdotool: '/bin/true' }, xenv: {}, text: 'x'.repeat(WT.TYPE_MAX + 1) });
  ok(tooLong.code === 'bad-request' && /at most 1500 characters/.test(tooLong.why) && /split/.test(tooLong.why), 'a longer text is refused by name, telling the agent to split it');
  const srcW = fs.readFileSync(require.resolve('../src/window-targets.js'), 'utf8');
  const oldBudget = srcW.replace('const TYPE_MAX = 1500;', 'const TYPE_MAX = 4000;').replace('const typeTimeoutMs = (n) => 5000 + 2 * TYPE_DELAY_MS * Math.max(0, Number(n) || 0);', 'const typeTimeoutMs = () => 20000;');
  ok(oldBudget !== srcW && !typeBudgetOk(MUTW.load('src/window-targets.js', oldBudget, 'oldbudget')), 'control: the pre-r2 pair (4000 characters, a fixed 20 s) FAILS the budget pin');
  // a fake xdotool: an injection (type / key / click) sleeps like a long one; the release fallback (keyup / mouseup) is recorded
  const log = path.join(dir, 'xdo-cancel.log');
  const fake = path.join(dir, 'xdo-cancel.sh');
  fs.writeFileSync(fake, `#!/bin/sh\necho "$$ $*" >> ${JSON.stringify(log)}\ncase " $* " in *" keyup "*|*" mouseup "*) exit 0;; esac\nexec sleep 5\n`);
  fs.chmodSync(fake, 0o755);
  // a DECOY with the same program name, running the same way — a kill by NAME would take it too
  const decoy = spawn(fake, ['type', '--', 'decoy'], { stdio: 'ignore' }); children.add(decoy);
  await sleep(100);
  const xenv0 = { PATH: process.env.PATH }; // no DISPLAY: the XTEST release cannot open one ⇒ the xdotool fallback runs (recorded)
  const ac = new AbortController();
  setTimeout(() => ac.abort('takeover (test)'), 150);
  const t0 = Date.now();
  const r = await WT.injectType({ bins: { xdotool: fake }, xenv: xenv0, text: 'hello World\n', signal: ac.signal });
  const ms = Date.now() - t0;
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  const typeLine = lines.find((l) => / type --clearmodifiers /.test(l));
  const typePid = typeLine ? Number(typeLine.split(' ')[0]) : 0;
  let typeAlive = true; try { process.kill(typePid, 0); } catch { typeAlive = false; }
  let decoyAlive = true; try { process.kill(decoy.pid, 0); } catch { decoyAlive = false; }
  ok(!r.ok && r.code === 'inject_failed' && r.cancelled === true && r.partial === true && ms < 1500, `an aborted type answers at once (${ms} ms, not the child's 5 s): inject_failed {cancelled, partial}`, r);
  ok(typePid > 0 && !typeAlive && decoyAlive, `the cancel killed THE child the lease owned (pid ${typePid} gone) and nothing else — the same-named decoy (pid ${decoy.pid}) still runs`);
  const keyup = lines.find((l) => / keyup /.test(l)) || '';
  ok(r.released && r.released.via === 'xdotool' && /\bU0068\b/.test(keyup) && /\bU0057\b/.test(keyup) && /\bReturn\b/.test(keyup) && /\bShift_L\b/.test(keyup), `…then the release pass: no display for XTEST here, so \`xdotool keyup\` of every key the text could hold (${keyup.split(' ').slice(2, 9).join(' ')} …)`);
  try { process.kill(decoy.pid, 'SIGKILL'); } catch { }
  // the TIMEOUT kill releases too (the old fixed timeout killed a long type mid-text and left the key held)
  fs.writeFileSync(log, '');
  const k = await WT.injectKey({ bins: { xdotool: fake }, xenv: xenv0, chord: WT.parseChord('ctrl+s'), timeout: 200 });
  const kl = fs.readFileSync(log, 'utf8');
  ok(k.code === 'inject_failed' && /did not finish within 200 ms/.test(k.why) && !k.cancelled && k.released && /keyup Control_L Control_R s/.test(kl), 'a chord killed by its TIMEOUT releases ctrl and s (the keys a kill mid-chord leaves down)', { k, kl });
  fs.writeFileSync(log, '');
  const ac2 = new AbortController(); setTimeout(() => ac2.abort('revoke (test)'), 100);
  const c = await WT.injectClick({ bins: { xdotool: fake }, xenv: xenv0, x: 1, y: 1, button: 3, signal: ac2.signal });
  ok(c.cancelled && /mouseup 3/.test(fs.readFileSync(log, 'utf8')), 'a cancelled click releases its button (mouseup 3)');
  ok(!/\bpkill\b|\bkillall\b|process\.kill\(-/.test(srcW), 'window-targets.js never kills by name or by group (grep pin: no pkill / killall / negative-pid kill)');
  // LANE E VERIFY R3 (F3): xdotool decodes a typed text through the LOCALE — measured: with no UTF-8 locale it refuses
  // "Invalid multi-byte sequence encountered", and a mixed text LANDED its ASCII part first, then failed. So a text
  // holding a non-ASCII character runs under desktop-display.js's UTF-8 rule (LC_ALL=C.UTF-8, xwininfo's since
  // 2026-09-22) when `locale charmap` says that locale loads, else the env's own UTF-8 locale; when neither loads the
  // type is refused BY NAME before anything is typed. (The real-display leg is §3's; these run without a display.)
  {
    const xlog = path.join(dir, 'xdo-locale.log');
    const recXdo = path.join(dir, 'xdo-locale.sh');
    fs.writeFileSync(recXdo, `#!/bin/sh\necho "LC_ALL=$LC_ALL LANG=$LANG $*" >> ${JSON.stringify(xlog)}\n`); fs.chmodSync(recXdo, 0o755);
    const mkLocale = (name, body) => { const f = path.join(dir, `locale-${name}.sh`); fs.writeFileSync(f, `#!/bin/sh\n${body}\n`); fs.chmodSync(f, 0o755); return f; };
    const noUtf8 = mkLocale('none', 'echo "locale: Cannot set LC_CTYPE to default locale: No such file or directory" >&2\necho ANSI_X3.4-1968');
    const cUtf8 = mkLocale('c', 'case "$LC_ALL" in C.UTF-8) echo UTF-8;; *) echo ANSI_X3.4-1968;; esac');
    const enOnly = mkLocale('en', 'case "${LC_ALL:-$LANG}" in en_US.UTF-8) echo UTF-8;; *) echo ANSI_X3.4-1968;; esac');
    const bare = { PATH: process.env.PATH }; // a fleet pod's env: no LANG, no LC_*
    fs.writeFileSync(xlog, '');
    const refusedU = await WT.injectType({ bins: { xdotool: recXdo, locale: noUtf8 }, xenv: bare, text: 'ab中文' });
    ok(refusedU.code === 'no_utf8_locale' && refusedU.why.includes('"中"') && /U\+4E2D/.test(refusedU.why) && /character 3\b/.test(refusedU.why) && /nothing was typed/.test(refusedU.why) && fs.readFileSync(xlog, 'utf8') === '', `r3 F3: no UTF-8 locale loads ⇒ \`type "ab中文"\` is refused no_utf8_locale naming the first non-ASCII character BEFORE anything is typed — not even "ab" (${refusedU.code}: ${String(refusedU.why).slice(0, 140)})`);
    ok(WT.REFUSALS.includes('no_utf8_locale'), 'r3 F3: no_utf8_locale is a closed refusal code (the route census gives it a status)');
    fs.writeFileSync(xlog, '');
    const asciiU = await WT.injectType({ bins: { xdotool: recXdo, locale: noUtf8 }, xenv: bare, text: 'plain ASCII\n' });
    ok(asciiU.ok === true && /^LC_ALL= LANG= /.test(fs.readFileSync(xlog, 'utf8')), 'r3 F3: an ASCII text is never refused and its env is untouched (C carries ASCII)');
    fs.writeFileSync(xlog, '');
    const cU = await WT.injectType({ bins: { xdotool: recXdo, locale: cUtf8 }, xenv: bare, text: 'ab中文' });
    ok(cU.ok === true && /^LC_ALL=C\.UTF-8 LANG= /.test(fs.readFileSync(xlog, 'utf8')), `r3 F3: with no locale in the env, the text runs under LC_ALL=C.UTF-8 (xwininfo's rule) (${fs.readFileSync(xlog, 'utf8').trim().slice(0, 60)})`);
    fs.writeFileSync(xlog, '');
    const enU = await WT.injectType({ bins: { xdotool: recXdo, locale: enOnly }, xenv: { ...bare, LANG: 'en_US.UTF-8' }, text: 'é' });
    ok(enU.ok === true && /^LC_ALL= LANG=en_US\.UTF-8 /.test(fs.readFileSync(xlog, 'utf8')), 'r3 F3: a machine without C.UTF-8 but with the env\'s own UTF-8 locale types under that one');
    fs.writeFileSync(xlog, '');
    const enNo = await WT.injectType({ bins: { xdotool: recXdo, locale: enOnly }, xenv: bare, text: 'é' });
    ok(enNo.code === 'no_utf8_locale' && /"é" \(U\+00E9, character 1\)/.test(enNo.why) && fs.readFileSync(xlog, 'utf8') === '', 'r3 F3: …the same machine with no locale in the env refuses by name (Latin-1 is non-ASCII too), nothing typed');
  }
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
          // L5 (lane E verify r2) ON THIS REAL DISPLAY: a type CANCELLED between a key's press and its release. Measured:
          // a bare SIGKILL there leaves the key HELD and the X server autorepeats it into the window the user just took
          // over; the release pass lets go of it. xdotool at a 3 s per-character delay presses "q" at ~0.05 s and would
          // release it at ~1.5 s — the cancel lands at 0.4 s, inside the press; the entry's own echo is the witness.
          const cancelType = async (W) => {
            await WT.actOnNode({ entry, verb: 'set_text', text: '', env: base });
            await WT.focusNode({ entry, env: base });
            await sleep(150);
            const acx = new AbortController();
            setTimeout(() => acx.abort('takeover (test)'), 400);
            const r = await W.injectType({ bins: { xdotool: probe.injection.bin }, xenv, text: 'qwerty', focus: centre, delay: 3000, signal: acx.signal });
            await sleep(1600); // past the server's autorepeat delay (660 ms) — a held key has typed ~20 more by now
            const a = await WT.snapshotTarget({ pids: [pid], env: base });
            return { r, text: a.ok ? labelText(a, 'entry ') : null };
          };
          const rel = await cancelType(WT);
          ok(rel.r.cancelled === true && rel.r.released && rel.r.released.ok && rel.text === "entry 'q'", `a type cancelled mid-key on the real display: the pressed key was RELEASED (${rel.r.released && rel.r.released.via}) — the entry holds exactly ${JSON.stringify(rel.text)}, no autorepeat`, rel.r);
          const noRel = fs.readFileSync(require.resolve('../src/window-targets.js'), 'utf8').replace('function releaseHeld({', "function releaseHeld() { return Promise.resolve({ ok: false, via: null, why: 'CONTROL: no release' }); }\nfunction releaseHeldUnused({");
          const Wn = MUTW.load('src/window-targets.js', noRel, 'norelease');
          const ctl = await cancelType(Wn);
          ok(/^entry 'q{4,}'$/.test(ctl.text || ''), `control: the cancel WITHOUT the release pass leaves "q" held and the server autorepeats it into the window (${JSON.stringify((ctl.text || '').slice(0, 40))}…)`);
          await WT.releaseHeld({ bins: { xdotool: probe.injection.bin }, xenv, keysyms: WT.keysymsOfText('qwerty') }); // un-stick the control's key
          await WT.actOnNode({ entry, verb: 'set_text', text: '', env: base });
          // LANE E VERIFY R3 (F3) ON THIS REAL DISPLAY, with LANG / LANGUAGE / LC_* stripped — a fleet pod's env (the
          // Dockerfile sets no locale): a mixed text typed as keys lands WHOLE (the injection runs under LC_ALL=C.UTF-8);
          // CONTROL = a copy without the locale rule ⇒ xdotool fails on the first multi-byte character (the verifier's
          // "Invalid multi-byte sequence encountered") and the text does NOT land whole; and when no UTF-8 locale
          // loads, NOTHING lands — the type is refused by name before xdotool runs
          const bareX = Object.fromEntries(Object.entries(xenv).filter(([k]) => !/^(LANG|LANGUAGE|LC_[A-Z_]+)$/.test(k)));
          const typeInto = async (W, text, bins = { xdotool: probe.injection.bin }) => {
            await WT.actOnNode({ entry, verb: 'set_text', text: '', env: base });
            await WT.focusNode({ entry, env: base });
            await sleep(150);
            const r = await W.injectType({ bins, xenv: bareX, text, focus: centre });
            let echo = null;
            for (let i = 0; i < 12; i++) { const a = await WT.snapshotTarget({ pids: [pid], env: base }); echo = a.ok ? labelText(a, 'entry ') : null; if (echo === `entry '${text}'`) break; await sleep(150); }
            return { r, echo };
          };
          const mixed = 'ab中文é';
          const u8 = await typeInto(WT, mixed);
          ok(!Object.keys(bareX).some((k) => /^(LANG|LC_)/.test(k)) && u8.r.ok && u8.echo === `entry '${mixed}'`, `r3 F3: with NO LANG / LC_* in the env a mixed text lands WHOLE on the real display (${JSON.stringify(u8.echo)})`, u8.r);
          const srcW3 = fs.readFileSync(require.resolve('../src/window-targets.js'), 'utf8');
          const noRule = srcW3.replace('await display.utf8LocaleEnv(xenv, { bins })', '{ ok: true, env: xenv }');
          ok(noRule !== srcW3, 'control (F3): the patch applies (no locale rule — the display env as the keeper built it)');
          const u8c = await typeInto(MUTW.load('src/window-targets.js', noRule, 'nolocale'), mixed);
          ok(!u8c.r.ok && u8c.r.code === 'inject_failed' && u8c.echo !== `entry '${mixed}'`, `control (F3): WITHOUT the rule xdotool fails on the multi-byte text and it does not land whole (${u8c.r.code}: ${String(u8c.r.why || '').slice(0, 110)}; the entry reads ${JSON.stringify(u8c.echo)})`);
          ok(u8c.r.partial === true, 'r3 F3: …and a type xdotool gave up on AFTER it started says `partial` (the characters before the failure may have landed)', u8c.r);
          const noLoc3 = path.join(dir, 'locale-none-real.sh'); fs.writeFileSync(noLoc3, '#!/bin/sh\necho ANSI_X3.4-1968\n'); fs.chmodSync(noLoc3, 0o755);
          const u8r = await typeInto(WT, mixed, { xdotool: probe.injection.bin, locale: noLoc3 });
          await sleep(300);
          const after3 = await WT.snapshotTarget({ pids: [pid], env: base });
          ok(u8r.r.code === 'no_utf8_locale' && u8r.r.why.includes('"中"') && after3.ok && labelText(after3, 'entry ') === "entry ''", `r3 F3: when no UTF-8 locale loads the type is refused BY NAME and NOTHING lands — not even "ab" (${u8r.r.code}; the entry reads ${JSON.stringify(after3.ok && labelText(after3, 'entry '))})`);
          await WT.actOnNode({ entry, verb: 'set_text', text: '', env: base });
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
  // takeover r2: the engine reads the RUNNING app's own executable — only for pids this suite owns (a fake
  // record's pid 4242 may be anybody's process on the box, a browser included)
  const ownedPids = new Set(real ? [real.pid] : []);
  const procExeOwned = (pid) => { if (!ownedPids.has(pid)) return null; try { return fs.readlinkSync(`/proc/${pid}/exe`); } catch { return null; } };
  const engine = ENGINE.create({ keeper, dataDir: dir, env: () => base, activeSessions: sessions, wt, bins: real ? real.bins : { xdotool: null, gdbus: null }, log: { warn() { } }, procExe: procExeOwned });
  const f1 = engine.factsForToken('vsst_aaaa'), f2 = engine.factsForToken('vsst_bbbb');
  ok(f1 && f1.sessionId === 's1' && f1.browserKey === 'bk-11111111' && engine.factsForToken('vsst_zzzz') === null && engine.factsForToken('cookie') === null, 'a vsst_ token resolves to its session; anything else to nothing');
  const err = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  // LANE E (D1): every window is HIDDEN until the user shares it — nothing listed, every verb refused by name, no lease
  {
    const hidden = await engine.list(f1);
    ok(hidden.targets.length === 0 && /no window is shared with you/.test(hidden.note) && hidden.scope === 'shared with you', 'D1: `list` shows NOTHING the user did not share (the note says where sharing happens)', hidden.note);
    const codes = [await err(() => engine.attach('da-one', f1)), await err(() => engine.snapshot('da-one', f1)), await err(() => engine.act('da-one', f1, { verb: 'click', ref: '@e1' })), await err(() => engine.screenshot('da-one', f1)), await err(() => engine.watch('da-one', f1)), await err(() => engine.detach('da-one', f1))].map((e) => e && e.code);
    ok(codes.every((c) => c === 'not_exposed') && !engine.leaseOf('da-one'), `attach / snapshot / act / screenshot / watch / detach on an UNSHARED window ⇒ not_exposed by name, no lease taken (${codes.join(', ')})`);
    const ne = await err(() => engine.attach('da-one', f1));
    ok(/not shared with this session/.test(ne.message) && ne.message.includes(RE.NOT_EXPOSED_SENTENCE), 'the refusal names the remedy (the user shares it from the window\'s ⋯ menu)');
    const g = engine.grantReach('da-one', { kind: 'session', id: 's1' });
    engine.grantReach('da-one', { kind: 'session', id: 's2' });
    ok(g.rows.length === 1 && g.rows[0].principal.id === 'webui:s1' && g.rows[0].by === 'user' && g.granted.changed === true, 'the user shares it with a live session BY ITS ID — stored under its durable key (webui:<id> before a conversation exists)');
    const stored = JSON.parse(fs.readFileSync(engine.reachFile, 'utf8'));
    ok(stored.v === 1 && stored.windows['da-one'].rows.length === 2 && (fs.statSync(engine.reachFile).mode & 0o777) === 0o600, 'the share is PERSISTED (data/window-reach.json, v1, 0600)');
  }
  const list = await engine.list(f1);
  ok(list.targets.length === 1 && list.targets[0].handle === 'da-one' && list.targets[0].lease === null && list.targets[0].via === 'session' && list.targets[0].mode === 'auto' && list.scope === 'shared with you' && list.verbs && typeof list.a11y.ok === 'boolean', 'shared: list = the live record with no lease, how it reaches me (session) and its mode, the scope named, the verbs and the a11y probe beside it');
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
  ok(engine.reachOf('da-new').rows.length === 1 && engine.reachOf('da-new').rows[0].by === 'self-open' && engine.reachOf('da-new').rows[0].principal.id === 'webui:s2' && (await err(() => engine.attach('da-new', f1))).code === 'not_exposed', 'D1\'s ONE exception: the window an agent opened is shared with ITS session (self-open) — and with nobody else');
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
      const prevNew = records.get('da-new');   // the fake keeper mints ONE id — the control's launch overwrites the gedit record
      const o2 = await e2.open({ appId: 'chromium', url: 'https://agent.example/' }, f2);
      ok(o2 && o2.handle && launched === 3, 'negative control: without the refusal the agent route LAUNCHES the browser row (and drops its url) — the leg above is what stops it');
      records.set('da-new', prevNew);   // the browser the control launched is not a fixture of the legs below (a launched browser is the human's: T6 omits it from `list`)
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
    noBins.grantReach('da-one', { kind: 'session', id: 's2' }); // lane E: its own data dir holds no share — the user shares it here
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

  // takeover C3 (T6, design-browser-takeover §8) → LANE E (D4): a desktop-app BROWSER window is CLASSIFIED (the mark),
  // hidden like every window until the user shares it, and — shared — a target like any app
  records.set('da-web', mk('da-web', { label: 'Firefox (yours)', browser: true }));            // lane-desk's record shape
  records.set('da-web2', mk('da-web2', { label: 'Chromium app', appId: 'chromium-app' }));    // the registry-row shape
  keeper.registry = () => [{ id: 'chromium-app', label: 'Chromium', browser: true, available: true }, { id: 'gedit', label: 'Text editor', available: true }];
  ok(engine.isHumanBrowser(records.get('da-web')) && engine.isHumanBrowser(records.get('da-web2')) && !engine.isHumanBrowser(records.get('da-one')), 'isHumanBrowser holds for BOTH shapes (a record carrying `browser`, a record whose registry row carries it) and not for an ordinary app');
  const hb = await err(() => engine.attach('da-web', f1));
  ok(hb && hb.code === 'not_exposed' && !engine.leaseOf('da-web'), 'attach on an UNSHARED desktop-app browser ⇒ not_exposed (D1: hidden like every window) — no lease taken', hb && hb.message);
  ok((await err(() => engine.attach('da-web2', f1))).code === 'not_exposed', '…and the registry-row shape the same');
  ok((await err(() => engine.snapshot('da-web', f1))).code === 'not_exposed' && (await err(() => engine.act('da-web2', f1, { verb: 'click', ref: '@e1' }))).code === 'not_exposed' && (await err(() => engine.screenshot('da-web', f1))).code === 'not_exposed' && (await err(() => engine.watch('da-web', f1))).code === 'not_exposed', 'snapshot / act / screenshot / watch on a guessed handle refuse the same (before any lease check)');
  const lw = await engine.list(f1);
  ok(!lw.targets.some((r) => r.handle === 'da-web' || r.handle === 'da-web2') && lw.targets.some((r) => r.handle === 'da-one') && !lw.apps.some((a) => a.id === 'chromium-app') && lw.apps.some((a) => a.id === 'gedit'), '`list` omits them (not shared), and a browser registry row is not an id an agent may open (the user starts their own browser)');
  // D4 (the owner: "浏览器窗口不是也应该能给agent操作吗？"): SHARED, the user's browser is a target like any app — marked
  engine.grantReach('da-web', { kind: 'session', id: 's1' });
  const sw = engine.attach('da-web', f1);
  ok(sw.handle === 'da-web' && sw.browser === true && /vibespace-browser/.test(sw.browserNote) && engine.leaseOf('da-web').sessionId === 's1', 'D4: once SHARED, the user\'s desktop-app browser attaches like any app — marked `browser`, with the note that the agent\'s own web work is `vibespace-browser`');
  const lw2 = await engine.list(f1);
  ok(lw2.targets.some((r) => r.handle === 'da-web' && r.browser === true && /the user's own browser/.test(r.note)) && !lw2.targets.some((r) => r.handle === 'da-web2'), '…and `list` shows it (marked) while the unshared one stays out');
  engine.detach('da-web', f1);
  ok(engine.attach('da-one', f1).handle === 'da-one', 'CONTROL: the same engine attaches an ordinary shared app (no `browser`) as before');
  // r1 (finding 3): the REAL registry — spread the way desktop-app-keeper.registry() spreads it, records
  // stamped `appId: row.id` exactly as the keeper's launch stamps them (the fixture-from-real-data rule:
  // never a hand-written row). The lane's tree marked its browser rows by `category: 'browser'` ONLY (r1's
  // miss: the engine tested `browser`); B-bfe6 (2.369.166) added the `browser` kind beside it. The leg runs
  // on BOTH shapes — the real rows as they are, and the same rows with `browser` stripped (the r1 shape)
  const REAL0 = require('../src/desktop-apps.js').DEFAULT_REGISTRY;
  const withKind = REAL0.filter((r) => r.category === 'browser' && r.browser);
  ok(withKind.length >= 2, `the real registry marks its browsers by category AND kind (${withKind.map((r) => r.id + ':' + r.browser).join(', ')}) — the B-bfe6 shape`);
  for (const [shape, REAL] of [['real rows', REAL0], ['category only (the r1 shape)', REAL0.map(({ browser, ...r }) => r)]]) {
    const saved = keeper.registry;
    keeper.registry = () => REAL.map((row) => ({ ...row, args: [...row.args], available: true, path: '/usr/bin/' + row.exec, reason: null, parkedUntil: null }));
    const browserRows = REAL.filter((r) => r.category === 'browser').map((r) => r.id);
    ok(browserRows.length >= 2 && (shape === 'real rows' || REAL.every((r) => !('browser' in r))), `[${shape}] the leg's registry has its browser rows (${browserRows.join(', ')}) in the shape it names`);
    for (const id of browserRows) records.set('da-real-' + id, mk('da-real-' + id, { label: REAL.find((r) => r.id === id).label, appId: id, exec: REAL.find((r) => r.id === id).exec }));
    records.set('da-real-gedit', mk('da-real-gedit', { label: 'gedit', appId: 'gedit', exec: 'gedit' }));
    records.set('da-real-adhoc', mk('da-real-adhoc', { label: 'chromium (ad hoc)', exec: '/usr/bin/chromium' }));
    for (const id of browserRows) {
      const e = await err(() => engine.attach('da-real-' + id, f1));
      ok(engine.isHumanBrowser(records.get('da-real-' + id)) && e && e.code === 'not_exposed' && !engine.leaseOf('da-real-' + id), `[${shape}] the real \`${id}\` row's launch record is classified a browser — and, unshared, not_exposed, no lease taken`, e && (e.code + ' ' + e.message));
    }
    ok(engine.isHumanBrowser(records.get('da-real-adhoc')), `[${shape}] an AD-HOC launch of a registry browser's executable is the human's too (the exec names it)`);
    engine.grantReach('da-real-gedit', { kind: 'session', id: 's1' });
    const lr = await engine.list(f1);
    ok(!lr.targets.some((r) => /^da-real-(?!gedit)/.test(r.handle)) && lr.targets.some((r) => r.handle === 'da-real-gedit') && !lr.apps.some((a) => browserRows.includes(a.id)) && lr.apps.some((a) => a.id === 'gedit'), `[${shape}] \`list\` omits them and \`open\` is never offered a browser row of the real registry`, JSON.stringify({ t: lr.targets.map((r) => r.handle), a: lr.apps.map((a) => a.id) }));
    ok(!engine.isHumanBrowser(records.get('da-real-gedit')) && engine.attach('da-real-gedit', f1).handle === 'da-real-gedit', `[${shape}] CONTROL: the real \`gedit\` row, shared, attaches as before (and is not classified a browser)`);
    engine.detach('da-real-gedit', f1);
    for (const id of [...browserRows.map((x) => 'da-real-' + x), 'da-real-gedit', 'da-real-adhoc']) records.delete(id);
    keeper.registry = saved;
  }

  // r2 (finding 3): a HUMAN's dialog-launched browser that is NOT one of the registry's two rows — Chrome,
  // Edge, Brave, a flatpak / snap Chromium, a wrapper that execs into one — is the human's too. The fixture
  // is measured (scripts/fixtures/window-targets/browser-execs.json: the dev box's present browsers + the
  // executables the verifier launched), the registry is the REAL one, controls are real non-browsers
  {
    const REAL = require('../src/desktop-apps.js').DEFAULT_REGISTRY;
    const saved = keeper.registry;
    keeper.registry = () => REAL.map((row) => ({ ...row, args: [...row.args], available: true, path: '/usr/bin/' + row.exec, reason: null, parkedUntil: null }));
    const FX = JSON.parse(fs.readFileSync(path.join(new URL('..', import.meta.url).pathname, 'scripts/fixtures/window-targets/browser-execs.json'), 'utf8'));
    const adhoc = (exec, args = []) => mk('da-r2', { label: String(exec).split('/').pop(), exec, args, pids: { app: 4242, x: null, server: null, wm: null } });
    const execs = [...new Set([...FX.present.map((r) => r.exec), ...FX.named])];
    const missed = execs.filter((e) => !engine.isHumanBrowser(adhoc(e)));
    ok(execs.length >= 20 && missed.length === 0, `r2: every measured browser executable launched ad hoc is the human's (${execs.length}; allowed: ${missed.join(', ') || 'none'})`);
    const missedL = FX.launchers.filter((l) => !engine.isHumanBrowser(adhoc(l.exec, l.args)));
    ok(FX.launchers.length >= 5 && missedL.length === 0, `r2: …through a launcher too — flatpak run / snap run / env (allowed: ${missedL.map((l) => [l.exec, ...l.args].join(' ')).join('; ') || 'none'})`);
    const exes = [...new Set(FX.present.map((r) => r.exe).filter(Boolean))];
    ok(exes.length >= 3 && exes.every((x) => require('../src/desktop-apps.js').browserLaunchVerdict({ exec: '/home/u/bin/web', exe: x }).by === 'process'), `r2: the RUNNING binaries a wrapper execs into are browsers by process (${exes.map((x) => x.split('/').pop()).join(', ')})`);
    const wrong = FX.controls.filter((c) => engine.isHumanBrowser(adhoc(c.exec, c.args)));
    ok(FX.controls.length >= 10 && wrong.length === 0, `r2 CONTROL: real non-browsers stay attachable — gedit, xterm, chromium-thumbnailer, infobrowser (GNU info), flatpak Thunderbird… (refused: ${wrong.map((c) => c.exec).join(', ') || 'none'})`);
    // r3 (browser finding 4): the verifier's ~80-shape sweep found niche bare-exec browsers and `env` with a
    // VALUE-taking option (`env -u FOO google-chrome` read `FOO` as the program) treated as attachable
    {
      const DA = require('../src/desktop-apps.js');
      const niche = ['surf', 'luakit', 'nyxt', 'dillo', 'netsurf', 'netsurf-gtk3', 'min', 'otter-browser', 'basilisk', 'icecat', 'cromite', 'zen', 'zen-bin', '/opt/zen/zen-bin', 'start-tor-browser', '/usr/lib/firefox/firefox.real'];
      const missedN = niche.filter((e) => !engine.isHumanBrowser(adhoc(e)));
      ok(missedN.length === 0, `r3: the niche browsers the verifier's sweep let through are the human's (${niche.length}; allowed: ${missedN.join(', ') || 'none'})`);
      const envs = [['-u', 'FOO', 'google-chrome'], ['--unset', 'FOO', 'google-chrome'], ['--unset=FOO', 'brave-browser'], ['-C', '/tmp', 'chromium'], ['--chdir', '/tmp', 'firefox'], ['-a', 'web', 'microsoft-edge'], ['-S', 'A=1 google-chrome --incognito'], ['--split-string=chromium --x'], ['-i', 'PATH=/x', '--', 'chromium']];
      const missedE = envs.filter((a) => !engine.isHumanBrowser(adhoc('env', a)));
      ok(missedE.length === 0, `r3: \`env\` with a value-taking option (-u / --unset / -C / --chdir / -a / -S / --split-string) still names the browser it runs (allowed: ${missedE.map((a) => a.join(' ')).join('; ') || 'none'})`);
      const ctl = [['env', ['-u', 'google-chrome', 'gedit']], ['env', ['-C', '/opt/google/chrome', 'xterm']], ['arc', []], ['minidlna', []], ['surfraw', []], ['netsurfer', []], ['chromium-thumbnailer', []], ['infobrowser', []]];
      const wrongC = ctl.filter(([e, a]) => engine.isHumanBrowser(adhoc(e, a)));
      ok(wrongC.length === 0 && DA.launchedProgram('env', ['-u', 'google-chrome', 'gedit']) === 'gedit', `r3 CONTROL: a browser NAME as an option's value is not the program (\`env -u google-chrome gedit\` runs gedit); \`arc\` (on Linux an archiver — the Arc browser has no Linux build), surfraw, chromium-thumbnailer stay attachable (refused: ${wrongC.map(([e, a]) => [e, ...a].join(' ')).join('; ') || 'none'})`);
      // NEGATIVE CONTROL: the r2 env parse (every `-x` skipped alone) in a patched copy reads `FOO` as the program
      const dsrc = fs.readFileSync(require.resolve('../src/desktop-apps.js'), 'utf8');
      const r2d = dsrc.replace("if (b === 'env') return envProgram(a);", "if (b === 'env') { for (let i = 0; i < a.length; i++) { if (a[i].startsWith('-')) continue; if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a[i])) continue; return a[i]; } return null; }");
      const dm = { exports: {} }; new Function('module', 'exports', 'require', r2d)(dm, dm.exports, require('module').createRequire(require.resolve('../src/desktop-apps.js')));
      ok(r2d !== dsrc && dm.exports.launchedProgram('env', ['-u', 'FOO', 'google-chrome']) === 'FOO' && !dm.exports.browserLaunchVerdict({ exec: 'env', args: ['-u', 'FOO', 'google-chrome'] }).browser, 'r3 NEGATIVE CONTROL: the r2 `env` parse (patched copy) takes the -u value FOO for the program — the verifier\'s shape passed');
    }
    // the machine's own present browsers, live (SKIP with evidence where the box has none of them)
    const here = FX.present.filter((r) => r.exec.startsWith('/usr/') || r.exec.startsWith('/opt/') || r.exec.startsWith('/snap/')).filter((r) => fs.existsSync(r.exec));
    if (!here.length) skip(`r2: none of the fixture's browsers is installed here (${FX.present.map((r) => r.exec).join(', ')})`);
    else ok(here.every((r) => engine.isHumanBrowser(adhoc(r.exec))), `r2: this machine's installed browsers (${here.map((r) => r.exec).join(', ')}) are refused by the exec the human would type`);
    // the verifier's first repro, end to end — lane E: unshared it is refused and unlisted; shared it is a MARKED target
    records.set('da-r2-chrome', mk('da-r2-chrome', { label: 'google-chrome', exec: '/usr/bin/google-chrome', pids: { app: 4242, x: null, server: null, wm: null } }));
    const ec = await err(() => engine.attach('da-r2-chrome', f1));
    const lc = await engine.list(f1);
    ok(ec && ec.code === 'not_exposed' && !engine.leaseOf('da-r2-chrome') && !lc.targets.some((r) => r.handle === 'da-r2-chrome'), 'r2: `vibespace-window attach` on an unshared dialog-launched google-chrome ⇒ not_exposed, no lease, not listed', ec && ec.message);
    engine.grantReach('da-r2-chrome', { kind: 'session', id: 's1' });
    const lc2 = await engine.list(f1);
    ok(lc2.targets.some((r) => r.handle === 'da-r2-chrome' && r.browser === true) && engine.attach('da-r2-chrome', f1).browser === true, 'r2 → D4: shared, the same google-chrome is listed and attached, marked as the user\'s browser (the classification decides the MARK now)');
    engine.detach('da-r2-chrome', f1);
    // the RUNNING process decides a wrapper nobody can name: a copy of the system shell named `chrome` (what
    // /opt/google/chrome/google-chrome execs into) behind an exec called `my-web` — and `gedit` the control.
    // A SHELL copy blocked in its `read` builtin: one process, no child to orphan (a multicall coreutils
    // `sleep` refuses to run under another name — measured on this box)
    const PD = path.join(dir, 'r2-proc'); fs.mkdirSync(PD, { recursive: true });
    const shBin = fs.realpathSync('/bin/sh');
    const kids = [];
    const runAs = (name) => { const b = path.join(PD, name); fs.copyFileSync(shBin, b); fs.chmodSync(b, 0o755); const c = require('child_process').spawn(b, ['-c', 'read x'], { stdio: ['pipe', 'ignore', 'ignore'] }); kids.push(c); ownedPids.add(c.pid); return c.pid; };
    try {
      const chromePid = runAs('chrome'), geditPid = runAs('gedit');
      for (let i = 0; i < 40 && !((procExeOwned(chromePid) || '').endsWith('/chrome') && (procExeOwned(geditPid) || '').endsWith('/gedit')); i++) await new Promise((r) => setTimeout(r, 25));
      ok((procExeOwned(chromePid) || '').endsWith('/r2-proc/chrome'), 'r2: (the fixture process runs, /proc/<pid>/exe names it `chrome`)', procExeOwned(chromePid));
      records.set('da-r2-wrap', mk('da-r2-wrap', { label: 'my-web', exec: path.join(PD, 'my-web'), args: ['--profile', 'mine'], pids: { app: chromePid, x: null, server: null, wm: null } }));
      records.set('da-r2-sh', mk('da-r2-sh', { label: 'sh', exec: 'sh', args: ['-c', `exec ${path.join(PD, 'chrome')} 600`], pids: { app: chromePid, x: null, server: null, wm: null } }));
      records.set('da-r2-ctl', mk('da-r2-ctl', { label: 'my-editor', exec: path.join(PD, 'my-editor'), pids: { app: geditPid, x: null, server: null, wm: null } }));
      ok(engine.isHumanBrowser(records.get('da-r2-wrap')) && engine.isHumanBrowser(records.get('da-r2-sh')), 'r2: a wrapper the human typed (`my-web`, `sh -c "exec …/chrome"`) is classified by the binary its RUNNING app process is (/proc/<pid>/exe)');
      engine.grantReach('da-r2-ctl', { kind: 'session', id: 's1' });
      ok(!engine.isHumanBrowser(records.get('da-r2-ctl')) && engine.attach('da-r2-ctl', f1).handle === 'da-r2-ctl', 'r2 CONTROL: the same wrapper shape running a non-browser (`gedit`) is not classified a browser (and, shared, attaches)');
      engine.detach('da-r2-ctl', f1);
    } finally { for (const c of kids) { try { c.kill('SIGKILL'); } catch { /* gone */ } } }
    // NEGATIVE CONTROL: the r1 engine (patched copy: no name / process verdict) lets the human's Chrome through
    {
      const ep = require.resolve('../src/server/window-targets-engine.js');
      const src = fs.readFileSync(ep, 'utf8');
      const r1src = src.replace('return M.browserLaunchVerdict({ exec: rec.exec, args: rec.args, exe: appExe(rec) }).browser;', 'return false;');
      const m = { exports: {} };
      new Function('module', 'exports', 'require', '__dirname', '__filename', r1src)(m, m.exports, require('module').createRequire(ep), path.dirname(ep), ep);
      const e1 = m.exports.create({ keeper, dataDir: path.join(dir, 'r1-engine'), env: () => base, activeSessions: sessions, wt, bins: { xdotool: null, gdbus: null }, log: { warn() { } }, procExe: () => null });
      ok(r1src !== src && !e1.isHumanBrowser(adhoc('/usr/bin/google-chrome')) && !e1.isHumanBrowser(adhoc('flatpak', ['run', 'org.chromium.Chromium'])) && e1.isHumanBrowser(adhoc('/usr/bin/chromium')), 'r2 NEGATIVE CONTROL: the r1 rule (patched copy) allows google-chrome and a flatpak Chromium — only a registry row\'s own exec was caught');
    }
    for (const id of ['da-r2-chrome', 'da-r2-wrap', 'da-r2-sh', 'da-r2-ctl']) records.delete(id);
    keeper.registry = saved;
  }

  const express = require('express');
  // ── §5 LANE E: reach, the mode, the pixel road, the request, the human routes ──
  console.log('§5 LANE E — reach + the share mode + the pixel road + the request + the human routes');
  {
    const groupsOfMap = { s1: [], s2: [] };
    const sess5 = new Map([['s1', { agentToken: 'vsst_aaaa', _browserKey: 'bk-11111111', name: 'alpha', backend: 'claude', backendSessionId: 'conv-a' }], ['s2', { agentToken: 'vsst_bbbb', _browserKey: 'bk-22222222', name: 'beta', backend: 'codex', backendSessionId: 'conv-b' }], ['s3', { agentToken: 'vsst_cccc', name: 'fresh' }], ['sh', { name: 'a shell', backend: 'shell' }]]);
    const bc5 = [];
    const e5 = ENGINE.create({ keeper, dataDir: path.join(dir, 'lane-e'), env: () => base, activeSessions: sess5, wt, bins: real ? real.bins : { xdotool: null, gdbus: null }, log: { warn() { }, log() { } }, procExe: procExeOwned, groupsOf: (s, id) => groupsOfMap[id] || [], broadcast: (m) => bc5.push(m), modeProbeMs: 400 });
    const a = e5.factsForToken('vsst_aaaa'), b = e5.factsForToken('vsst_bbbb');
    records.set('da-e1', mk('da-e1', { label: 'Notes E', startedAt: 1 }));
    records.set('da-e2', mk('da-e2', { label: 'Other E', pids: { app: 4243, x: null, server: null, wm: null }, startedAt: 1 }));
    // a Task Group joined LATER reaches the window (membership is asked at every verb — D2)
    e5.grantReach('da-e1', { kind: 'group', id: 'task-ops', name: 'Ops' });
    ok((await err(() => e5.attach('da-e1', b))).code === 'not_exposed', 'a group row: a session NOT in the group is refused not_exposed');
    groupsOfMap.s2 = ['task-ops'];
    const lb = await e5.list(b);
    ok(lb.targets.some((r) => r.handle === 'da-e1' && r.via === 'group') && e5.attach('da-e1', b).handle === 'da-e1', 'the moment the session joins the group it lists (via group) and attaches — "every session of the group, live now or later"');
    ok(bc5.some((m) => m.type === 'window-reach-updated' && m.reach.some((v) => v.handle === 'da-e1' && v.rows[0].principal.kind === 'group')), 'every share change is broadcast (window-reach-updated) — the multi-client law');
    // revoke mid-lease: the holder loses its lease NOW, its next verb is not_exposed, the audit names it
    groupsOfMap.s2 = [];
    ok((await err(() => e5.snapshot('da-e1', b))).code === 'not_exposed' && !e5.leaseOf('da-e1'), 'leaving the group mid-lease: the next verb answers not_exposed and the lease is dropped there');
    e5.grantReach('da-e1', { kind: 'session', id: 's2' });
    e5.attach('da-e1', b);
    const rv = e5.revokeReach('da-e1', { kind: 'session', id: 'codex:conv-b' });
    ok(rv.revoked.changed && rv.revoked.leaseDropped === true && !e5.leaseOf('da-e1') && rv.rows.length === 1 && rv.rows[0].principal.kind === 'group', 'REVOKE while it holds the lease: its row goes, its lease goes AT ONCE (the group row stays — only its own row)');
    const afterRevoke = await err(() => e5.act('da-e1', b, { verb: 'key', chord: 'Return' }));
    ok(afterRevoke && afterRevoke.code === 'not_exposed', 'the holder\'s next verb: not_exposed');
    const aud5 = () => fs.readFileSync(e5.auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    ok(aud5().some((l) => l.verb === 'lease-dropped' && l.by === 'user' && /revoked/.test(l.why)) && aud5().some((l) => l.verb === 'reach-revoke' && l.by === 'user'), 'the audit names the revoke and the dropped lease (by:user)');
    // the opener exception in the engine, D6 in the engine: two sessions, two windows, both acting, a cross act refused
    e5.grantReach('da-e1', { kind: 'session', id: 's1' });
    e5.grantReach('da-e2', { kind: 'session', id: 's2' });
    e5.grantReach('da-e1', { kind: 'session', id: 's2' }); e5.grantReach('da-e2', { kind: 'session', id: 's1' }); // both agents reach both windows — the LEASE is what separates them
    e5.attach('da-e1', a); e5.attach('da-e2', b);
    const cross = await err(() => e5.act('da-e1', b, { verb: 'click', at: '1,1' }));
    ok(cross && cross.code === 'not_attached' && e5.leaseOf('da-e1').sessionId === 's1' && e5.leaseOf('da-e2').sessionId === 's2', 'D6: two agents hold two windows at once; one acting on the OTHER\'s window is not_attached (one holder per window)');
    // THE MODE TABLE at the engine (D7)
    e5.setShareMode('da-e1', 'pixels');
    const snapPx = await err(() => e5.snapshot('da-e1', a));
    const refPx = await err(() => e5.act('da-e1', a, { verb: 'click', ref: '@e1' }));
    const typePx = await err(() => e5.act('da-e1', a, { verb: 'type', ref: '@e1', text: 'x' }));
    ok(snapPx.code === 'mode_pixels' && snapPx.message === RE.PIXELS_SENTENCE && refPx.code === 'mode_pixels' && typePx.code === 'mode_pixels', 'a PIXEL share refuses snapshot / click @ref / type @ref by the owner\'s sentence — before any helper call');
    const keyPx = await err(() => e5.act('da-e1', a, { verb: 'key', chord: 'Return' }));
    ok(keyPx === null || keyPx.code !== 'mode_pixels', `…while the pixel verbs pass the mode gate (key: ${keyPx ? keyPx.code : 'ok'})`);
    ok(aud5().some((l) => l.verb === 'mode-changed' && l.from === 'auto' && l.to === 'pixels' && l.by === 'user' && l.sessionId === 's1'), 'the switch took effect at the holder\'s NEXT verb, audited mode-changed auto → pixels (by:user)');
    e5.setShareMode('da-e1', 'auto');
    const am = await e5.attachWithMode('da-e2', b);
    const e2resolved = am.mode.resolved;
    ok(am.mode.mode === 'auto' && (real ? true : e2resolved === 'pixels' && /no accessibility tree|unreachable/.test(am.mode.why)), `attach resolves AUTO by a probe of the app's tree and says why (${e2resolved}: ${am.mode.why})`);
    if (!real) ok((await err(() => e5.snapshot('da-e2', b))).code === 'mode_pixels', 'an auto window with no tree: the snapshot (the probe) is refused mode_pixels naming why');
    // the scroll verb's refusals (no backend here, or a bad direction)
    const sc = await err(() => e5.act('da-e2', b, { verb: 'scroll', direction: 'sideways' }));
    ok(sc && ['bad-request', 'no_injection_backend'].includes(sc.code), `scroll: a bad direction / no backend is refused by name (${sc && sc.code})`);
    ok(WT.injectClick({ bins: { xdotool: '/bin/true' }, xenv: {}, x: 1, y: 1, button: 4 }).then((r) => r.code === 'bad-request' && /the wheel is/.test(r.why)), 'click --button 4 is refused by name (M8: a coerced wheel button became a LEFT click)');
    ok((await WT.injectClick({ bins: { xdotool: '/bin/true' }, xenv: {}, x: 1, y: 1, button: 4 })).code === 'bad-request' && (await WT.injectScroll({ bins: { xdotool: '/bin/true' }, xenv: {}, direction: 'down', by: 99 })).code === 'bad-request' && (await WT.injectType({ bins: { xdotool: '/bin/true' }, xenv: {}, text: '' })).code === 'bad-request', 'the pixel road refuses a wheel button on click, > 20 notches, an empty type — by name');
    const stubArgs = [];
    const fakeBin = path.join(dir, 'fake-xdotool.sh'); fs.writeFileSync(fakeBin, `#!/bin/sh\nprintf '%s\\n' "$@" >> ${JSON.stringify(path.join(dir, 'xdotool.args'))}\n`); fs.chmodSync(fakeBin, 0o755);
    await WT.injectClick({ bins: { xdotool: fakeBin }, xenv: {}, x: 5, y: 6 }); await WT.injectKey({ bins: { xdotool: fakeBin }, xenv: {}, chord: WT.parseChord('Return'), focus: { x: 1, y: 2 } }); await WT.injectType({ bins: { xdotool: fakeBin }, xenv: {}, text: '--help me', replace: true }); await WT.injectScroll({ bins: { xdotool: fakeBin }, xenv: {}, x: 3, y: 4, direction: 'down', by: 2 });
    const argv = fs.readFileSync(path.join(dir, 'xdotool.args'), 'utf8').split('\n');
    stubArgs.push(...argv);
    ok(!argv.includes('--sync') && argv.join(' ').includes('mousemove 5 6 click 1') && argv.join(' ').includes('mousemove 1 2 key --clearmodifiers Return'), 'M9: no `--sync` on any pointer move (a move to the CURRENT point waited 7 s, and the second key in a row failed)');
    ok(argv.join(' ').includes('key --clearmodifiers ctrl+a type --clearmodifiers --delay 12 -- --help me') && argv.join(' ').includes('mousemove 3 4 click --repeat 2 --delay 20 5'), 'type is ONE argv item after `--` (never read as an option), --replace selects first; scroll = button 5 × N at the point');
    // the pixel road on the REAL fixture window: a keeper that names its windows ⇒ screenshot in WINDOW coordinates, --at mapped
    if (!real) skip('the pixel-road legs on a real window need §3\'s fixture display');
    else {
      const DD = require('../src/desktop-display.js');
      const kWin = { ...keeper, windows: async (id) => { const x = keeper.x11EnvFor(id); const r = await DD.enumerateWindows({ display: x.DISPLAY, authFile: x.XAUTHORITY, env: x }); return { ok: r.ok, windows: (r.windows || []).filter((w) => w.mapped !== false && w.w > 1 && w.h > 1).map((w) => ({ id: w.id, title: w.name, cls: w.cls, instance: w.instance, x: w.x, y: w.y, w: w.w, h: w.h, mapped: w.mapped, depth: w.depth })) }; } };
      const ePx = ENGINE.create({ keeper: kWin, dataDir: path.join(dir, 'lane-e-px'), env: () => base, activeSessions: sess5, wt, bins: real.bins, log: { warn() { }, log() { } }, procExe: procExeOwned });
      ePx.grantReach('da-one', { kind: 'session', id: 's1' });
      ePx.setShareMode('da-one', 'pixels');
      ePx.attach('da-one', a);
      const shot = await ePx.screenshot('da-one', a);
      const plan = RE.pixelPlan((await kWin.windows('da-one')).windows);
      ok(shot.coords === 'window' && shot.w === plan.w && shot.h === plan.h && shot.originX === plan.origin.x && shot.blank === false && fs.readFileSync(shot.file).slice(0, 8).toString('hex') === '89504e470d0a1a0a', `screenshot = the fixture window's OWN pixels, ${shot.w}x${shot.h} at origin ${shot.originX},${shot.originY}, window coordinates, not blank`);
      try { fs.unlinkSync(shot.file); } catch { }
      if (!real.hasInjection) skip('xdotool absent — the mapped point click cannot run here');
      else {
        const tree = await WT.snapshotTarget({ pids: [real.pid], env: base });
        const canvas = tree.ok && tree.snapshot.nodes.find((n) => n.role === 'drawing area');
        const labelOf = (sn) => (sn.snapshot.nodes.find((n) => n.role === 'label' && /^canvas/.test(n.name || '')) || {}).name;
        const before = labelOf(tree);
        if (!canvas || !canvas.bounds) skip('the fixture canvas has no bounds in this GTK\'s tree');
        else {
          const at = `${Math.round(canvas.bounds.x + canvas.bounds.w / 2 - plan.origin.x)},${Math.round(canvas.bounds.y + canvas.bounds.h / 2 - plan.origin.y)}`;
          const pc = await ePx.act('da-one', a, { verb: 'click', at });
          let after = before;
          for (let i = 0; i < 20 && after === before; i++) { await sleep(150); const s2 = await WT.snapshotTarget({ pids: [real.pid], env: base }); after = s2.ok ? labelOf(s2) : after; }
          ok(pc.did.coords === 'window' && after !== before && /^canvas click \d+ at/.test(after || ''), `a PIXEL-mode click --at ${at} (a pixel of the screenshot) is mapped through the origin and lands on the canvas (${before} → ${after})`);
        }
        const out = await err(() => ePx.act('da-one', a, { verb: 'click', at: `${plan.w + 5},1` }));
        ok(out && out.code === 'outside_window', 'a point outside the window\'s image ⇒ outside_window (never clamped)');
      }
      ePx.shutdown();
    }
    // a Scale ▸ relaunch mints a NEW id (`replacedBy` on the old record): the share FOLLOWS the successor, then the old one is pruned
    records.set('da-rel1', mk('da-rel1', { label: 'Relaunched', startedAt: 1 }));
    e5.grantReach('da-rel1', { kind: 'session', id: 's1' });
    e5.setShareMode('da-rel1', 'pixels');
    records.set('da-rel1', { ...records.get('da-rel1'), state: 'exited', replacedBy: 'da-rel2' });
    records.set('da-rel2', mk('da-rel2', { label: 'Relaunched', startedAt: 2 }));
    const carried = e5.reachOf('da-rel2');
    ok(carried && carried.mode === 'pixels' && carried.rows.length === 1 && carried.rows[0].principal.id === 'claude:conv-a' && aud5().some((l) => l.verb === 'reach-carried' && l.from === 'da-rel1' && l.handle === 'da-rel2'), 'a relaunched window KEEPS its share: the record follows `replacedBy` to the successor (mode and rows), audited reach-carried');
    records.set('da-rel3', mk('da-rel3', { label: 'Gone' })); e5.grantReach('da-rel3', { kind: 'session', id: 's1' }); records.set('da-rel3', { ...records.get('da-rel3'), state: 'exited' });
    const rc = e5.reconcile({ graceMs: 60000 });
    ok(rc.pruned >= 1 && !JSON.parse(fs.readFileSync(e5.reachFile, 'utf8')).windows['da-rel3'] && JSON.parse(fs.readFileSync(e5.reachFile, 'utf8')).windows['da-rel2'], 'a share lives as long as its window: reconcile prunes the ended one (the carried one stays)');
    for (const id of ['da-rel1', 'da-rel2', 'da-rel3']) records.delete(id);
    // LANE E VERIFY (2026-09-25, the verifier's minor — a reach leak across an await) + VERIFY R2 (2026-09-25, M1 / L4 /
    // L5): a revoke / a group left / a takeover / the tier-3 switch going off that lands WHILE a verb awaits (a probe, the
    // helper, the backend probe, the grab) stops it — nothing is injected, no tree or image is handed over, no "attached"
    // answered with the lease gone; an injection ALREADY RUNNING is cancelled by the takeover / the dropped lease (L5).
    // DETERMINISTIC: the fake wt fires the user's act at the START of a named await (`at`), never on a timer race.
    // M1 (r2): the re-check is pinned PER SITE — every `held()` / `heldOrUnlink(` / `stillHeld(` call in the engine is
    // grep-derived (printed), and a patched copy with only THAT call removed must turn at least one leg red (a site
    // annotated `// no-await-before` is redundant by construction and listed as such, its claim checked in the source).
    {
      const STEP_MS = 2;
      const acts = [], killed = [];
      let trigger = null, injectMs = 2, a11yUp = true, deskOn = true, injectMode = null;
      const arm = (name) => { if (trigger && !trigger.fired && trigger.at === name) { trigger.fired = true; if (trigger.delayMs) setTimeout(trigger.fire, trigger.delayMs); else trigger.fire(); } };
      const step = async (name) => { arm(name); await sleep(STEP_MS); };
      const snapD = { apps: [], nodes: [{ ref: '@e1', pid: 4242, path: [0], role: 'push button', name: 'Go', actions: ['click'], editable: false, states: [] }, { ref: '@e2', pid: 4242, path: [1], role: 'entry', name: 'Field', actions: [], editable: true, states: ['editable'] }, { ref: '@e3', pid: 4242, path: [2], role: 'entry', name: 'Web field', actions: [], editable: false, states: ['editable'] }], census: { nodes: 3 }, unreadable: [], truncated: false, budget: 400, callTimeoutMs: 1, ms: 1, nodesPerSec: 1 };
      /** an injection that runs `injectMs` unless the lease cancels it (L5) — it records that it STARTED and that it was killed */
      // r3 F2: `injectMode = 'timeout'` hands a type to the REAL primitive with a fake xdotool that sleeps past a forced
      // 150 ms limit — the timeout kill + the release pass are the shipped ones, the answer is afterKill's own shape
      const sleepXdo = path.join(dir, 'xdo-sleep-timeout.sh');
      fs.writeFileSync(sleepXdo, '#!/bin/sh\ncase " $* " in *" keyup "*) exit 0;; esac\nexec sleep 5\n'); fs.chmodSync(sleepXdo, 0o755);
      const injection = (tag) => (o) => { acts.push(tag); arm(tag);
        if (injectMode === 'timeout' && tag === 'type-keys') return WT.injectType({ bins: { xdotool: sleepXdo, locale: null }, xenv: { PATH: process.env.PATH }, text: o.text, timeout: 150, signal: o.signal });
        return new Promise((res) => { const tm = setTimeout(() => res({ ok: true, did: { verb: tag, backend: 'xtest' } }), injectMs); if (o && o.signal) o.signal.addEventListener('abort', () => { clearTimeout(tm); killed.push(tag); res({ ok: false, code: 'inject_failed', why: 'cancelled (test)', cancelled: true, partial: true, released: { ok: true, via: 'test' } }); }, { once: true }); }); };
      const sleeper = spawn('sleep', ['120'], { stdio: 'ignore' }); children.add(sleeper); // a live pid for the tier-3 row
      const wtD = { ...WT,
        probeA11y: async () => { await step('probeA11y'); return a11yUp ? { ok: true, apps: 1 } : { ok: false, apps: 0, why: 'the bus is down (test)' }; },
        runHelper: async () => ({ ok: true, apps: [{ pid: sleeper.pid, name: 'Race desk app', children: 1 }] }),
        snapshotTarget: async () => { await step('snapshotTarget'); return { ok: true, snapshot: snapD, refs: WT.refTableOf(snapD) }; },
        focusedNode: async () => { await step('focusedNode'); return { ok: true, node: snapD.nodes[1] }; },
        probeInputBackends: async () => { await step('probeInputBackends'); return { rows: [], injection: { backend: 'xtest' }, ours: true }; },
        displayGeometry: async () => ({ ok: false }),
        screenshotDisplay: async ({ out }) => { await step('screenshotDisplay'); fs.writeFileSync(out, 'png'); return { ok: true, w: 10, h: 10, x: 0, y: 0, bytes: 3 }; },
        windowShot: async ({ out }) => { await step('windowShot'); fs.writeFileSync(out, 'png'); return { ok: true, w: 10, h: 10, lit: 7, bytes: 3 }; },
        probeScreenCastPortal: async () => { await step('probeScreenCastPortal'); return { ok: false, screenCast: false }; },
        injectClick: injection('click-at'), injectKey: injection('key'), injectType: injection('type-keys'), injectScroll: injection('scroll'),
        focusNode: async () => { acts.push('focus'); await step('focusNode'); return { ok: true, did: {} }; },
        actOnNode: async (o) => { acts.push(o.verb); return { ok: true, did: { action: 'click' }, ms: 1 }; },
      };
      const recD = { id: 'da-race', label: 'Race', exec: 'x', state: 'ready', display: ':98', pids: { app: 4242 }, backend: 'vnc-display', startedAt: Date.now(), readyAt: Date.now() };
      const keeperD = { listApps: () => [recD], get: (id) => (id === recD.id ? recD : null), sessionPids: () => [4242], x11EnvFor: () => ({ DISPLAY: ':98' }) };
      // the app's own windows (the plan the screenshot composes — the xpra rung's road; the grab is the delayed windowShot)
      const keeperW = { ...keeperD, windows: async () => ({ ok: true, windows: [{ id: 7, title: 'Race', cls: 'race', x: 0, y: 0, w: 10, h: 10, mapped: true }] }) };
      const sessD = new Map([['s1', { agentToken: 'vsst_race', name: 'alpha', backend: 'claude', backendSessionId: 'conv-race' }]]);
      const groupsD = { s1: [] };
      let groupsThrow = false;
      const fakeXdoD = path.join(dir, 'fake-xdotool-desk.sh'); fs.writeFileSync(fakeXdoD, '#!/bin/sh\ncase "$1" in search) echo 4242;; getwindowgeometry) printf "WIDTH=10\\nHEIGHT=10\\n";; esac\n'); fs.chmodSync(fakeXdoD, 0o755);
      const fakeFf = path.join(dir, 'fake-ffmpeg.sh'); fs.writeFileSync(fakeFf, '#!/bin/sh\nfor a; do last="$a"; done\nprintf png > "$last"\n'); fs.chmodSync(fakeFf, 0o755);
      const DESKM = require('../src/window-desktop.js');
      let subSeq = 0;
      const mkD = (M, sub, extra = {}) => M.create({ keeper: keeperD, dataDir: path.join(dir, sub), env: () => ({}), activeSessions: sessD, wt: wtD, bins: { xdotool: '/bin/true' }, log: { warn() { }, log() { } }, groupsOf: (s0, id) => { if (groupsThrow) throw new Error('EIO task-groups.json (test)'); return groupsD[id] || []; }, modeProbeMs: 400, ...extra });
      /** the three engines a module is judged with: this machine's windows, one whose keeper names its windows, the tier-3 class */
      const enginesOf = (M, tag) => {
        const sub = `race-${tag}-${++subSeq}`;
        return { sub, plain: mkD(M, sub), win: mkD(M, sub + '-w', { keeper: keeperW }), desk: mkD(M, sub + '-d', { serverSetting: (k) => (k === DESKM.SETTING_KEY ? deskOn : undefined), userEnv: () => ({ PATH: process.env.PATH, DISPLAY: ':1', XDG_SESSION_TYPE: 'x11' }), bins: { xdotool: fakeXdoD, ffmpeg: fakeFf, gdbus: null } }) };
      };
      const fD = { sessionId: 's1', session: sessD.get('s1'), browserKey: null, name: 'alpha' };
      const P = { kind: 'session', id: 's1' }, PG = { kind: 'group', id: 'task-race' };
      const shotsIn = (E) => { const d = path.join(path.dirname(E.auditFile), 'window-shots'); return fs.existsSync(d) ? fs.readdirSync(d).length : 0; };
      /** bring an engine to a known state: the share (session or group row), the mode, the lease, refs from a tree snapshot */
      async function prep(E, { mode = 'auto', via = 'session', refs = false } = {}) {
        trigger = null; a11yUp = true; injectMs = 2; groupsThrow = false; injectMode = null;
        E.handback({ handle: 'da-race', viewerId: 'v-race', cause: 'explicit' });
        groupsD.s1 = via === 'group' ? ['task-race'] : [];
        E.grantReach('da-race', via === 'group' ? PG : P);
        E.revokeReach('da-race', via === 'group' ? P : PG);
        if (refs) { E.setShareMode('da-race', 'tree'); E.attach('da-race', fD); await E.snapshot('da-race', fD); }
        E.setShareMode('da-race', mode);
        E.attach('da-race', fD);
        acts.length = 0; killed.length = 0;
      }
      const USER = {
        revoke: (E) => () => E.revokeReach('da-race', P),
        'group-left': () => () => { groupsD.s1 = []; },
        takeover: (E) => () => E.takeover({ handle: 'da-race', viewerId: 'v-race', holderAlive: true }),
        'switch-off': () => () => { deskOn = false; },
        // r3 F1: the SAME session gives the window up and takes it back while the verb awaits (a NEW lease object), then
        // the user takes over 100 ms into the injection that follows
        'reattach+takeover': (E) => () => { E.detach('da-race', fD); E.attach('da-race', fD); trigger = { at: 'type-keys', fire: USER.takeover(E), delayMs: 100, fired: false }; },
        // r3 F1: the USER changes their mind (revoke, share again) and the agent re-attaches while the verb awaits, then takes over
        'reshare+takeover': (E) => () => { E.revokeReach('da-race', P); E.grantReach('da-race', P); E.attach('da-race', fD); trigger = { at: 'type-keys', fire: USER.takeover(E), delayMs: 100, fired: false }; },
        none: () => () => { },
      };
      /** THE LEGS — each names the await its user act lands in and what must hold after */
      const LEGS = [
        { name: 'click --at: a revoke while the input probe awaits ⇒ not_exposed, nothing injected', prep: { mode: 'pixels' }, at: 'probeInputBackends', user: 'revoke', run: (E) => E.act('da-race', fD, { verb: 'click', at: '1,1' }), want: (o, E) => o.code === 'not_exposed' && o.acts.length === 0 && !E.leaseOf('da-race') },
        { name: 'click @ref behind an auto probe that resolves TREE: a revoke during the probe ⇒ not_exposed, no do_action', prep: { mode: 'auto', refs: true }, at: 'probeA11y', user: 'revoke', run: (E) => E.act('da-race', fD, { verb: 'click', ref: '@e1' }), want: (o) => o.code === 'not_exposed' && !o.acts.includes('do_action') },
        { name: 'click @ref behind an auto probe that resolves PIXELS: a revoke during the probe ⇒ not_exposed (never the mode, nor why, to a revoked session)', prep: { mode: 'auto', refs: true }, a11yDown: true, at: 'probeA11y', user: 'revoke', run: (E) => E.act('da-race', fD, { verb: 'click', ref: '@e1' }), want: (o) => o.code === 'not_exposed' },
        { name: 'snapshot: a revoke during the traversal ⇒ not_exposed, the tree never handed over', prep: { mode: 'tree' }, at: 'snapshotTarget', user: 'revoke', run: (E) => E.snapshot('da-race', fD), want: (o) => o.code === 'not_exposed' && !o.answered },
        { name: 'attachWithMode: a revoke during its mode probe ⇒ not_exposed, never "attached" with the lease gone', prep: { mode: 'auto' }, at: 'probeA11y', user: 'revoke', run: async (E) => { E.detach('da-race', fD); return E.attachWithMode('da-race', fD); }, want: (o, E) => o.code === 'not_exposed' && !E.leaseOf('da-race') },
        { name: 'key: the Task Group LEFT while the input probe awaits ⇒ not_exposed, no key', prep: { mode: 'pixels', via: 'group' }, at: 'probeInputBackends', user: 'group-left', run: (E) => E.act('da-race', fD, { verb: 'key', chord: 'Return' }), want: (o) => o.code === 'not_exposed' && o.acts.length === 0 },
        { name: 'type (tree, the focused node): a takeover while the focused node is read ⇒ window_paused, nothing typed', prep: { mode: 'tree' }, at: 'focusedNode', user: 'takeover', run: (E) => E.act('da-race', fD, { verb: 'type', text: 'hello' }), want: (o) => o.code === 'window_paused' && o.acts.length === 0 },
        { name: 'scroll (pixels): a revoke while the input probe awaits ⇒ not_exposed, no wheel (r2 M1)', prep: { mode: 'pixels' }, at: 'probeInputBackends', user: 'revoke', run: (E) => E.act('da-race', fD, { verb: 'scroll', direction: 'down' }), want: (o) => o.code === 'not_exposed' && o.acts.length === 0 },
        { name: 'type with no ref under a PIXEL share (keys): a revoke while the input probe awaits ⇒ not_exposed, no keys (r2 M1)', prep: { mode: 'pixels' }, at: 'probeInputBackends', user: 'revoke', run: (E) => E.act('da-race', fD, { verb: 'type', text: 'hello' }), want: (o) => o.code === 'not_exposed' && o.acts.length === 0 },
        { name: 'type @ref into a field editable by STATE (focus through the tree, then keys): a revoke during the input probe ⇒ not_exposed, the field never focused (r2 M1)', prep: { mode: 'tree', refs: true }, at: 'probeInputBackends', user: 'revoke', run: (E) => E.act('da-race', fD, { verb: 'type', ref: '@e3', text: 'hello' }), want: (o) => o.code === 'not_exposed' && o.acts.length === 0 },
        { name: '…a revoke DURING the focus ⇒ not_exposed, no keys after it (r2 M1)', prep: { mode: 'tree', refs: true }, at: 'focusNode', user: 'revoke', run: (E) => E.act('da-race', fD, { verb: 'type', ref: '@e3', text: 'hello' }), want: (o) => o.code === 'not_exposed' && !o.acts.includes('type-keys') },
        { name: 'screenshot (the display grab): a revoke during the grab ⇒ not_exposed, the image DELETED', prep: { mode: 'pixels' }, at: 'screenshotDisplay', user: 'revoke', run: (E) => E.screenshot('da-race', fD), want: (o) => o.code === 'not_exposed' && o.shotsAfter === o.shotsBefore },
        { name: 'screenshot (the app\'s own windows, a keeper that names them): a revoke during the window grab ⇒ not_exposed, the image DELETED (r2 M1)', engine: 'win', prep: { mode: 'pixels' }, at: 'windowShot', user: 'revoke', run: (E) => E.screenshot('da-race', fD), want: (o) => o.code === 'not_exposed' && o.shotsAfter === o.shotsBefore },
        { name: 'screenshot on the user\'s OWN desktop (tier 3): the switch going off during the capture ⇒ desktop_consent_off, the image DELETED (r2 M1)', engine: 'desk', at: 'probeScreenCastPortal', user: 'switch-off', run: (E) => E.screenshot(`dw-${sleeper.pid}`, fD), want: (o) => o.code === 'desktop_consent_off' && o.shotsAfter === o.shotsBefore },
        { name: 'L5: a TAKEOVER 100 ms into a running type CANCELS it — window_paused, did.partial, the child killed, the lease kept', prep: { mode: 'pixels' }, injectMs: 400, at: 'type-keys', delayMs: 100, user: 'takeover', run: (E) => E.act('da-race', fD, { verb: 'type', text: 'a long text the agent is typing' }), want: (o, E) => o.code === 'window_paused' && o.did && o.did.partial === true && o.killed.join() === 'type-keys' && o.acts.join() === 'type-keys' && o.ms < 350 && !!E.leaseOf('da-race') },
        { name: 'L5: a REVOKE 100 ms into a running scroll cancels it — not_exposed, did.partial, the child killed, the lease gone', prep: { mode: 'pixels' }, injectMs: 400, at: 'scroll', delayMs: 100, user: 'revoke', run: (E) => E.act('da-race', fD, { verb: 'scroll', direction: 'down', by: 20 }), want: (o, E) => o.code === 'not_exposed' && o.did && o.did.partial === true && o.killed.join() === 'scroll' && o.ms < 350 && !E.leaseOf('da-race') },
        { name: 'r3 F1: the same session DETACHES + RE-ATTACHES while the input probe awaits, then a TAKEOVER 100 ms into the running type ⇒ window_paused, did.partial, the child killed, the lease kept (the act is the WINDOW\'s, not the old lease object\'s)', prep: { mode: 'pixels' }, injectMs: 400, at: 'probeInputBackends', user: 'reattach+takeover', run: (E) => E.act('da-race', fD, { verb: 'type', text: 'a long text the agent is typing' }), want: (o, E) => o.code === 'window_paused' && o.did && o.did.partial === true && o.killed.join() === 'type-keys' && o.acts.join() === 'type-keys' && o.ms < 350 && !!E.leaseOf('da-race') },
        { name: 'r3 F1: the user REVOKES + SHARES AGAIN and the agent RE-ATTACHES while the input probe awaits, then a TAKEOVER 100 ms into the running type ⇒ window_paused, did.partial, the child killed, the lease kept', prep: { mode: 'pixels' }, injectMs: 400, at: 'probeInputBackends', user: 'reshare+takeover', run: (E) => E.act('da-race', fD, { verb: 'type', text: 'a long text the agent is typing' }), want: (o, E) => o.code === 'window_paused' && o.did && o.did.partial === true && o.killed.join() === 'type-keys' && o.acts.join() === 'type-keys' && o.ms < 350 && !!E.leaseOf('da-race') },
        { name: 'r3 F4: `list` — a revoke while its input-backend probe awaits ⇒ the window is NOT in the answer (the row is never handed over one await late)', prep: { mode: 'pixels' }, at: 'probeInputBackends', user: 'revoke', run: (E) => E.list(fD), want: (o) => o.code === null && !!o.answered && Array.isArray(o.answered.targets) && !o.answered.targets.some((r) => r.handle === 'da-race') },
      ];
      async function runLeg(Es, leg) {
        const E = Es[leg.engine || 'plain'];
        if (leg.engine === 'desk') { trigger = null; deskOn = true; await E.list(fD); try { E.attach(`dw-${sleeper.pid}`, fD); } catch { } acts.length = 0; killed.length = 0; }
        else await prep(E, leg.prep || {});
        if (leg.a11yDown) a11yUp = false;
        if (leg.injectMs) injectMs = leg.injectMs;
        if (leg.injectMode) injectMode = leg.injectMode;
        const shotsBefore = shotsIn(E);
        trigger = { at: leg.at, fire: USER[leg.user](E), delayMs: leg.delayMs || 0, fired: false };
        const t0 = Date.now();
        let code = null, answered = null, did = null, threw = null;
        try { answered = await leg.run(E); } catch (e) { code = e.code || null; did = e.did || null; threw = e; }
        const out = { code, answered, did, acts: [...acts], killed: [...killed], ms: Date.now() - t0, fired: !!(trigger && trigger.fired), shotsBefore, shotsAfter: shotsIn(E), threw: threw && !threw.code ? String(threw.message || threw) : null };
        trigger = null;
        return { ...out, pass: out.fired && !!leg.want(out, E) };
      }
      // the REAL engine: every leg green
      const Er = enginesOf(ENGINE, 'real');
      for (const leg of LEGS) { const o = await runLeg(Er, leg); ok(o.pass, leg.name, { code: o.code, acts: o.acts, killed: o.killed, did: o.did, ms: o.ms, fired: o.fired, shots: [o.shotsBefore, o.shotsAfter], threw: o.threw }); }
      const aud = fs.readFileSync(Er.plain.auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      ok(aud.filter((l) => l.code === 'not_exposed' && l.by === 'reach').length >= 8, 'every stopped verb is audited by:reach not_exposed');
      ok(aud.some((l) => l.cancelled === true && l.partial === true && l.by === 'inject' && l.code === 'window_paused') && aud.some((l) => l.cancelled === true && l.partial === true && l.code === 'not_exposed'), 'L5: a cancelled injection is audited by:inject {cancelled, partial} with the refusal that stopped it');
      // the linearization's other side: a revoke AFTER the act started lets it finish (it ran before the revoke)
      await prep(Er.plain, { mode: 'tree', refs: true });
      const pre = Er.plain.act('da-race', fD, { verb: 'click', ref: '@e1' }); Er.plain.revokeReach('da-race', P);
      const preR = await pre.then((r) => r, (e) => ({ code: e.code }));
      ok(preR.ok === true && acts.includes('do_action') && !Er.plain.leaseOf('da-race'), 'a revoke AFTER the act was issued: that act stands (it was first) and the lease is gone for the next verb');
      // L4 (r2): the Task Group store THROWS while a group row holds the window — the verb is refused BY NAME, the lease is KEPT
      const l4 = async (E) => {
        await prep(E, { mode: 'tree', via: 'group' });
        const from = fs.readFileSync(E.auditFile, 'utf8').trim().split('\n').length; // judge only this leg's audit lines
        groupsThrow = true;
        let code = null; try { await E.snapshot('da-race', fD); } catch (e) { code = e.code; }
        const kept = !!E.leaseOf('da-race');
        E.grantReach('da-race', { kind: 'session', id: 'codex:someone-else' });
        const rv = E.revokeReach('da-race', { kind: 'session', id: 'codex:someone-else' });
        const a = fs.readFileSync(E.auditFile, 'utf8').trim().split('\n').slice(from).map((l) => JSON.parse(l));
        groupsThrow = false;
        return { code, kept, keptAfterRevoke: !!E.leaseOf('da-race') && rv.revoked.leaseDropped === false, byStore: a.some((l) => l.code === 'reach_unreadable' && l.by === 'store'), byUser: a.some((l) => l.verb === 'lease-dropped' && l.by === 'user' && /revoked/.test(l.why)) };
      };
      const u = await l4(Er.plain);
      ok(u.code === 'reach_unreadable' && u.kept && u.byStore && !u.byUser, `L4: a THROWING group store ⇒ the verb refused reach_unreadable (by name), the lease KEPT, audited by:store — never "exposure revoked by the user" (${JSON.stringify(u)})`);
      ok(u.keptAfterRevoke, 'L4: a revoke of an UNRELATED principal during the fault leaves the group-held lease alone');
      await prep(Er.plain, { mode: 'tree', via: 'group' });
      groupsThrow = true;
      const lst = await Er.plain.list(fD);
      groupsThrow = false;
      ok(lst.reachUnreadable === 1 && /could not be read/.test(lst.note) && !lst.targets.some((r) => r.handle === 'da-race'), `L4: \`list\` during the fault counts the undecidable window and says so, never lists it (${lst.reachUnreadable}; ${lst.note.slice(0, 90)}…)`);
      let det = null; groupsThrow = true; try { det = Er.plain.detach('da-race', fD); } catch (e) { det = { code: e.code }; } groupsThrow = false;
      ok(det && det.detached === true, 'L4: giving a window up (detach) never waits on the store');
      // r3 F2: an injection its own TIMEOUT killed carries its progress like a cancelled one — `did` {partial, released}
      // on the thrown refusal AND on the audit line (the route / CLI read `did`); forced through the REAL primitive
      const lastAudit = (E) => { const ls = fs.readFileSync(E.auditFile, 'utf8').trim().split('\n'); return JSON.parse(ls[ls.length - 1]); };
      const F2LEG = { name: 'r3 F2: an injection killed by its TIMEOUT (the real primitive, a forced 150 ms limit) answers inject_failed WITH did {partial, released} and the audit line says partial — never a bare error', prep: { mode: 'pixels' }, injectMode: 'timeout', at: 'type-keys', user: 'none', run: (E) => E.act('da-race', fD, { verb: 'type', text: 'a text its limit cuts short' }),
        want: (o, E) => { const l = lastAudit(E); return o.code === 'inject_failed' && !!o.did && o.did.partial === true && !o.did.cancelled && o.did.verb === 'type' && !!o.did.released && o.did.released.ok === true && l.by === 'inject' && l.code === 'inject_failed' && l.partial === true && !!l.released && l.released.ok === true; } };
      { const o = await runLeg(Er, F2LEG); ok(o.pass, F2LEG.name, { code: o.code, did: o.did, ms: o.ms, last: lastAudit(Er.plain) }); }
      // r3 F5: the launch audit during a store fault — a Task Group row nobody was FOUND in while a membership read threw is
      // UNDECIDED, never "unmatched" (the r2 fold counted the very group the store could not read as nobody's)
      const f5 = async (E) => {
        await prep(E, { mode: 'tree' });
        const launchOf = () => fs.readFileSync(E.auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.verb === 'reach-launch').pop();
        const share = { principals: [PG, { kind: 'session', id: 'claude:conv-ended', name: 'gone' }], mode: 'auto' };
        groupsThrow = true;
        let view = null; try { view = E.shareAtLaunch('da-race', share); } finally { groupsThrow = false; }
        const during = launchOf();
        E.shareAtLaunch('da-race', share);
        const clear = launchOf();
        const gRow = view && view.rows.find((r) => r.principal.kind === 'group');
        return { during: { unmatched: during.unmatched, undecided: during.undecided }, clear: { unmatched: clear.unmatched, undecided: clear.undecided }, groupRowUndecided: !!(gRow && gRow.undecided) };
      };
      const f5r = await f5(Er.plain);
      ok(f5r.during.unmatched === 1 && f5r.during.undecided === 1 && f5r.groupRowUndecided && f5r.clear.unmatched === 2 && f5r.clear.undecided === 0, `r3 F5: during a store fault the launch audit counts the group row UNDECIDED (1) and only the ended session unmatched (1); the share view marks the row undecided; with the store back the same (empty) group is unmatched (${JSON.stringify(f5r)})`);
      // THROUGH THE ROUTE AND THE CLI (r2): a cancelled act answers its refusal WITH `did.partial` and the CLI says it
      // stopped part-way; reach_unreadable is a 503 and the CLI's wording table has its line
      {
        const appR = express(); appR.use(express.json()); ROUTES.setup({ engine: Er.plain }); appR.use(ROUTES.router);
        const srvR = await new Promise((res) => { const s0 = appR.listen(0, '127.0.0.1', () => res(s0)); });
        const base0 = `http://127.0.0.1:${srvR.address().port}`;
        const CLIW = path.join(repo, 'data/bin/vibespace-window');
        const cliR = (...a) => new Promise((resolve) => execFile(process.execPath, [CLIW, ...a], { env: { PATH: process.env.PATH, HOME: dir, VIBESPACE_API: base0, VIBESPACE_SESSION_TOKEN: 'vsst_race' }, encoding: 'utf8', timeout: 20000 }, (e, stdout, stderr) => resolve({ status: e ? e.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
        await prep(Er.plain, { mode: 'pixels' }); injectMs = 400;
        trigger = { at: 'type-keys', fire: USER.takeover(Er.plain), delayMs: 100, fired: false };
        const raw = await fetch(`${base0}/api/agent/window/act`, { method: 'POST', headers: { Authorization: 'Bearer vsst_race', 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'da-race', verb: 'type', text: 'a long text' }) });
        const rj = await raw.json();
        ok(raw.status === 409 && rj.code === 'window_paused' && rj.did && rj.did.partial === true && rj.did.verb === 'type', `the route answers a cancelled type 409 window_paused WITH did.partial (${raw.status} ${JSON.stringify(rj.did)})`);
        await prep(Er.plain, { mode: 'pixels' }); injectMs = 400;
        trigger = { at: 'type-keys', fire: USER.takeover(Er.plain), delayMs: 100, fired: false };
        const c1 = await cliR('type', 'da-race', 'a long text');
        ok(c1.status === 1 && /\[window_paused\]/.test(c1.stderr) && /STOPPED PART-WAY/.test(c1.stderr) && /after the handback/.test(c1.stderr), '`vibespace-window type` cut short by a takeover prints [window_paused] and that it STOPPED PART-WAY (look again after the handback)', c1.stderr);
        trigger = null; injectMs = 2;
        // r3 F2 through the route and the CLI: a type its TIMEOUT killed answers 502 inject_failed WITH did.partial
        await prep(Er.plain, { mode: 'pixels' }); injectMode = 'timeout';
        const rawT = await fetch(`${base0}/api/agent/window/act`, { method: 'POST', headers: { Authorization: 'Bearer vsst_race', 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'da-race', verb: 'type', text: 'a text its limit cuts short' }) });
        const rjT = await rawT.json();
        ok(rawT.status === 502 && rjT.code === 'inject_failed' && rjT.did && rjT.did.partial === true && !rjT.did.cancelled && rjT.did.released && rjT.did.released.ok === true, `r3 F2: the route answers a TIMEOUT-killed type 502 inject_failed WITH did {partial, released} (${rawT.status} ${JSON.stringify(rjT.did)})`);
        await prep(Er.plain, { mode: 'pixels' }); injectMode = 'timeout';
        const c3 = await cliR('type', 'da-race', 'a text its limit cuts short');
        ok(c3.status === 1 && /\[inject_failed\]/.test(c3.stderr) && /STOPPED PART-WAY/.test(c3.stderr) && /keys it held were released/.test(c3.stderr), '`vibespace-window type` killed by its time limit prints [inject_failed] and that it STOPPED PART-WAY (the keys it held released)', c3.stderr);
        injectMode = null;
        await prep(Er.plain, { mode: 'tree', via: 'group' });
        groupsThrow = true;
        const u503 = await fetch(`${base0}/api/agent/window/snapshot`, { method: 'POST', headers: { Authorization: 'Bearer vsst_race', 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'da-race' }) });
        const uj = await u503.json();
        const c2 = await cliR('snapshot', 'da-race');
        groupsThrow = false;
        ok(u503.status === 503 && uj.code === 'reach_unreadable' && uj.error.includes(RE.REACH_UNREADABLE_SENTENCE) && !!Er.plain.leaseOf('da-race'), `reach_unreadable through the route: 503, the sentence, the lease kept (${u503.status} ${uj.code})`);
        ok(c2.status === 1 && /\[reach_unreadable\]/.test(c2.stderr) && /could not be read — try again in a moment; nothing was done and your lease \(if you hold one\) is kept/.test(c2.stderr), '`vibespace-window snapshot` prints [reach_unreadable] and its remedy line', c2.stderr);
        srvR.close();
      }
      for (const E of [Er.plain, Er.win, Er.desk]) E.shutdown();
      // THE PER-SITE CENSUS (r2 M1): every re-check site in the engine, grep-derived
      const srcE = fs.readFileSync(require.resolve('../src/server/window-targets-engine.js'), 'utf8');
      // r3 F4: `list`'s re-check after its last await is a site too — neutered, its answer is the rows decided BEFORE the await (`first`)
      const SITE_KINDS = [
        { re: /\bheld\(\)|\bheldOrUnlink\(rec, facts, [^()]*\)|\bstillHeld\(rec, facts, [^()]*\)/g, neuter: 'leases.get(rec.id)' },
        { re: /\bstillListed\(facts, [^()]*\)/g, neuter: 'first' },
      ];
      const lineAt = (i) => srcE.slice(0, i).split('\n').length;
      const lineText = (i) => srcE.slice(srcE.lastIndexOf('\n', i) + 1, srcE.indexOf('\n', i));
      const sites = [], defs = [];
      for (const kind of SITE_KINDS) for (let m; (m = kind.re.exec(srcE));) {
        const before = srcE.slice(Math.max(0, m.index - 12), m.index);
        const lt = lineText(m.index);
        if (/function $/.test(before) || /return $/.test(before) || /const held = \(\) => /.test(lt)) { defs.push(`L${lineAt(m.index)}`); continue; }
        sites.push({ index: m.index, text: m[0], line: lineAt(m.index), neuter: kind.neuter, annotated: /\/\/ no-await-before\b/.test(lt) });
      }
      sites.sort((x, y) => x.index - y.index);
      console.log(`    re-check sites in the engine (grep-derived): ${sites.map((s0) => `L${s0.line} ${s0.text.replace(/rec, facts, /, '…')}${s0.annotated ? ' [no-await-before]' : ''}`).join(' · ')}; definitions skipped: ${defs.join(', ')}`);
      ok(sites.length >= 15 && sites.some((x) => x.neuter === 'first'), `the census found the re-check sites (${sites.length}, list's own among them — r3 F4) — a census that finds none judges nothing`);
      for (const s0 of sites.filter((x) => x.annotated)) {
        // the claim: no `await` between the nearest preceding re-check and this one (definitions do not count)
        const prev = sites.filter((x) => x.index < s0.index).pop();
        const between = prev ? srcE.slice(prev.index + prev.text.length, s0.index).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') : ''; // code only — a comment saying "no await" is not an await
        ok(!!prev && !/\bawait\b/.test(between), `L${s0.line} ${s0.text} is REDUNDANT BY CONSTRUCTION (no await since the re-check at L${prev ? prev.line : '?'}) — listed, not mutated`);
      }
      for (const s0 of sites.filter((x) => !x.annotated)) {
        const patched = srcE.slice(0, s0.index) + s0.neuter + srcE.slice(s0.index + s0.text.length);
        const Mx = require(MUTW.write('src/server/window-targets-engine.js', patched, `site-L${s0.line}`));
        const Ex = enginesOf(Mx, `L${s0.line}`);
        let red = null;
        for (const leg of LEGS) { const o = await runLeg(Ex, leg); if (!o.pass) { red = leg.name; break; } }
        for (const E of [Ex.plain, Ex.win, Ex.desk]) E.shutdown();
        ok(!!red, `control L${s0.line} (${s0.text} removed ⇒ ${s0.neuter === 'first' ? 'the rows decided before the await' : 'the unchecked lease'}): a race leg goes RED${red ? ` — "${red.slice(0, 90)}"` : ' — NO leg noticed: this site is unpinned'}`);
      }
      // L4 control: the pre-r2 fold (a throwing store read as "no groups")
      const fold = srcE.replace("catch (e) { unreadable = true; log.warn?.(", "catch (e) { log.warn?.(");
      ok(fold !== srcE, 'control (L4): the patch applies (a store fault folded into "no groups")');
      const Mf = require(MUTW.write('src/server/window-targets-engine.js', fold, 'foldgroups'));
      const Ef = enginesOf(Mf, 'fold');
      const uf = await l4(Ef.plain);
      ok(!(uf.code === 'reach_unreadable' && uf.kept && uf.byStore && !uf.byUser), `control (L4) FAILS the leg: the fault read as the user's revoke (${uf.code}, lease ${uf.kept ? 'kept' : 'DROPPED'}, by:user ${uf.byUser})`);
      for (const E of [Ef.plain, Ef.win, Ef.desk]) E.shutdown();
      // L5 control: the takeover / the dropped lease no longer cancel what runs
      const noCancel = srcE.replace('  function cancelActs(handle, why) {\n    let n = 0;', '  function cancelActs(handle, why) {\n    let n = 0; return n; // CONTROL: nothing cancelled');
      ok(noCancel !== srcE, 'control (L5): the patch applies (cancelActs does nothing)');
      const Mc = require(MUTW.write('src/server/window-targets-engine.js', noCancel, 'nocancel'));
      const Ec = enginesOf(Mc, 'nocancel');
      const cl = await runLeg(Ec, LEGS.find((l) => /TAKEOVER 100 ms into a running type/.test(l.name)));
      ok(!cl.pass && cl.code === null && cl.killed.length === 0 && cl.ms >= 380, `control (L5) FAILS: without the cancel the type runs to its end through the takeover (answered ${cl.code || 'ok'} after ${cl.ms} ms, killed ${cl.killed.length})`);
      for (const E of [Ec.plain, Ec.win, Ec.desk]) E.shutdown();
      // r3 F1 control = THE SHIPPED (9375991f) SEMANTICS, rebuilt as two edits of this source: the running act registered
      // on the lease object `requireLease` returned at the top of act(), the cancel looking at the CURRENT lease object's set
      const objKeyed = srcE.replace('const running = actsOn(rec.id);', 'const running = lease.acting || (lease.acting = new Set());')
        .replace("const running = acting.get(String(handle || ''));", "const l0 = leases.get(String(handle || '')); const running = l0 && l0.acting;");
      ok(objKeyed !== srcE && !objKeyed.includes('actsOn(rec.id)') && !objKeyed.includes("acting.get(String(handle || ''))"), 'control (F1): both edits apply (the lease-OBJECT-keyed act, as shipped in r2)');
      const Mo = require(MUTW.write('src/server/window-targets-engine.js', objKeyed, 'objkeyed'));
      const Eo = enginesOf(Mo, 'objkeyed');
      for (const leg of LEGS.filter((l) => /^r3 F1/.test(l.name))) {
        const co = await runLeg(Eo, leg);
        ok(!co.pass && co.code === null && co.killed.length === 0 && co.ms >= 380, `control (F1) FAILS "${leg.name.slice(0, 70)}…": the object-keyed act runs to its end through the takeover (answered ${co.code || 'ok'} after ${co.ms} ms, killed ${co.killed.length})`);
      }
      const co0 = await runLeg(Eo, LEGS.find((l) => /TAKEOVER 100 ms into a running type/.test(l.name)));
      ok(co0.pass, 'control (F1): …while the r2 leg without a re-attach still passes on it (the control differs ONLY in which object holds the act)');
      for (const E of [Eo.plain, Eo.win, Eo.desk]) E.shutdown();
      // r3 F2 control: the pre-r3 fromHelper (a helper refusal thrown WITHOUT `did`)
      const noDid = srcE.replace('const cut = cutOf(r);', 'const cut = null;');
      ok(noDid !== srcE, 'control (F2): the patch applies (fromHelper drops what the injection said about its progress)');
      const Md = require(MUTW.write('src/server/window-targets-engine.js', noDid, 'nodid'));
      const Ed = enginesOf(Md, 'nodid');
      const cd = await runLeg(Ed, F2LEG);
      ok(!cd.pass && cd.code === 'inject_failed' && !cd.did, `control (F2) FAILS the timeout leg: inject_failed with did ${JSON.stringify(cd.did)} — the partial never reaches the caller`);
      for (const E of [Ed.plain, Ed.win, Ed.desk]) E.shutdown();
      // r3 F5 control: the r2 fold — a membership read that threw counted as "not in the group"
      const foldU = srcE.replace('if (c.unreadable) { unreadable++; continue; }', 'if (c.unreadable) { continue; }');
      ok(foldU !== srcE, 'control (F5): the patch applies (an unreadable membership read folded into "no groups")');
      const Mu = require(MUTW.write('src/server/window-targets-engine.js', foldU, 'foldundecided'));
      const Eu = enginesOf(Mu, 'foldundecided');
      const cu = await f5(Eu.plain);
      ok(!(cu.during.unmatched === 1 && cu.during.undecided === 1 && cu.groupRowUndecided), `control (F5) FAILS: the fault is counted as nobody (${JSON.stringify(cu.during)})`);
      for (const E of [Eu.plain, Eu.win, Eu.desk]) E.shutdown();
      try { process.kill(sleeper.pid, 'SIGKILL'); } catch { }
      for (const r of copiesCensus(MUTW.files, MUTW.dir, repo, { minCopies: 1 + sites.filter((x) => !x.annotated).length + 5 })) ok(r.pass, '§5 tree: ' + r.name, r.pass ? undefined : r.detail);
    }
    // THE REQUEST (D3) over a stub ladder
    const REQ = require('../src/server/window-request.js');
    const stash = [], delivered = [];
    let ladder = async (cid, text, opts) => { delivered.push({ cid, text, opts }); return { ok: true, lane: 'cli-inbox' }; };
    const deliver = { stashFor: (cid, env) => stash.push({ cid, ...env }), deliverToConversation: (...x) => ladder(...x) };
    let clock = 1_000_000;
    const rq = REQ.create({ engine: e5, deliver, activeSessions: sess5, now: () => clock, log: { log() { } } });
    records.set('da-e3', mk('da-e3', { label: 'Calculator E', startedAt: 1 }));
    const free = await rq.request({ handle: 'da-e3', sessionId: 's1', note: 'add 7 and 8' });
    ok(free.delivered === 'next-turn' && free.granted && stash.length === 1 && stash[0].cid === 'conv-a' && stash[0].source === 'window-request' && stash[0].fromName === REQ.FROM_NAME && /handle da-e3/.test(stash[0].text) && /"add 7 and 8"/.test(stash[0].text) && delivered.length === 0, 'FREE (default): the request GRANTS the window to that agent (by:request) and rides its NEXT turn — the stash, nothing delivered, nothing billed');
    ok(e5.reachOf('da-e3').rows.some((r) => r.by === 'request' && r.principal.id === 'claude:conv-a'), '…the grant is written with its origin (the dialog says "you asked it to take control")');
    const woke = await rq.request({ handle: 'da-e3', sessionId: 's1', wake: true });
    ok(woke.delivered === 'woken' && delivered.length === 1 && delivered[0].opts.spendReason === 'window-share-request' && delivered[0].opts.kind === 'peer' && delivered[0].opts.fromName === REQ.FROM_NAME, 'WAKE: through the gated ladder under the declared reason window-share-request, kind peer (the user\'s words)');
    const paced = await rq.request({ handle: 'da-e3', sessionId: 's1', wake: true });
    ok(paced.delivered === 'next-turn' && paced.whyCode === 'wake_paced' && delivered.length === 1 && stash.length === 2, 'a second wake inside the 30 s floor rides the next turn instead, said by name (wake_paced)');
    clock += 31000;
    ladder = async () => ({ ok: false, refused: 'spend', why: 'hour-cap', reason: 'spend budget: hour-cap' });
    const spent = await rq.request({ handle: 'da-e3', sessionId: 's1', wake: true });
    ok(spent.delivered === 'next-turn' && spent.whyCode === 'spend' && /budget/.test(spent.why) && stash.length === 3, 'the spend ceiling refused the wake (fail closed): the words ride the next turn and the answer says why');
    ok((await err(() => rq.request({ handle: 'da-e3', sessionId: 'nobody' }))).code === 'not_live' && (await err(() => rq.request({ handle: 'da-e3', sessionId: 's3' }))).code === 'no_conversation' && (await err(() => rq.request({ handle: 'da-e3', sessionId: 'sh' }))).code === 'not_live' && (await err(() => rq.request({ handle: 'da-gone', sessionId: 's1' }))).code === 'not-found', 'refused by name: a session that is gone (not_live), one with no conversation yet (no_conversation), a shell terminal (no agent), a window that is not live');
    ladder = async (cid, text, opts) => { delivered.push({ cid, text, opts }); return { ok: true }; };
    e5.grantReach('da-e3', { kind: 'session', id: 's2' });
    e5.attach('da-e3', b);
    const ended = await rq.request({ handle: 'da-e3', sessionId: 's1', endHold: true });
    ok(ended.endedHold === true && !e5.leaseOf('da-e3') && aud5().some((l) => l.verb === 'lease-dropped' && l.handle === 'da-e3' && /asked alpha to take control/.test(l.why)), 'endHold: the other agent\'s hold ENDS (by:user, audited "the user asked alpha to take control") so the asked agent can attach');
    // THE HUMAN ROUTES (src/routes/desktop-apps.js)
    const DROUTES = require('../src/routes/desktop-apps.js');
    records.set('da-remote', mk('da-remote', { label: 'On the box', hostId: 'box', hostLabel: 'Box' }));
    const hubKeeper = { get: (id) => records.get(id) || null, launch: async (body, opts) => { hubLaunches.push({ body, opts }); const rec = mk('da-launched', { label: 'Launched' }); records.set(rec.id, rec); return rec; } };
    const hubLaunches = [];
    const eR = { ...e5, addressable: (id) => id !== 'da-remote' && e5.addressable(id) };
    DROUTES.setup({ keeper: hubKeeper, windowEngine: eR, windowRequest: rq });
    const app2 = express();
    app2.use(express.json());
    app2.use(DROUTES.router);
    const srv2 = await new Promise((res) => { const s = app2.listen(0, '127.0.0.1', () => res(s)); });
    const hapi = async (method, p, body, token = null) => { const r = await fetch(`http://127.0.0.1:${srv2.address().port}${p}`, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; };
    const g0 = await hapi('GET', '/api/desktop/apps/da-e3/reach');
    ok(g0.status === 200 && g0.j.handle === 'da-e3' && Array.isArray(g0.j.rows) && g0.j.rows.every((r) => Array.isArray(r.live)) && g0.j.modeInfo && 'lease' in g0.j, 'GET …/reach answers the rows (with who each reaches NOW), the mode, the lease');
    const post = await hapi('POST', '/api/desktop/apps/da-e3/reach', { principal: { kind: 'group', id: 'task-ops', name: 'Ops' } });
    ok(post.status === 200 && post.j.rows.some((r) => r.principal.kind === 'group' && r.by === 'user'), 'POST …/reach grants (a Task Group by its id)');
    const del = await hapi('DELETE', '/api/desktop/apps/da-e3/reach', { principal: { kind: 'group', id: 'task-ops' } });
    ok(del.status === 200 && !del.j.rows.some((r) => r.principal.kind === 'group'), 'DELETE …/reach revokes that principal\'s row');
    const put = await hapi('PUT', '/api/desktop/apps/da-e3/reach/mode', { mode: 'pixels' });
    ok(put.status === 200 && put.j.mode === 'pixels' && (await hapi('PUT', '/api/desktop/apps/da-e3/reach/mode', { mode: 'fast' })).j.code === 'bad_mode' && (await hapi('POST', '/api/desktop/apps/da-e3/reach', { principal: { kind: 'robot', id: 'x' } })).status === 400, 'PUT …/reach/mode sets the mode; a bad mode / a bad principal ⇒ 400 by name');
    const req2 = await hapi('POST', '/api/desktop/apps/da-e3/reach/request', { sessionId: 's1', note: 'please' });
    ok(req2.status === 200 && req2.j.delivered === 'next-turn', 'POST …/reach/request asks the agent (free: its next turn)');
    ok((await hapi('POST', '/api/desktop/apps/da-e3/reach/request', { sessionId: 'nobody' })).status === 404 && (await hapi('POST', '/api/desktop/apps/da-e3/reach/request', { sessionId: 's3' })).j.code === 'no_conversation' && (await hapi('POST', '/api/desktop/apps/da-e3/reach/request', {})).status === 400, 'the request\'s refusals by status: not_live 404, no_conversation 409, no sessionId 400');
    const agentCodes = await Promise.all([['GET', '/api/desktop/apps/da-e3/reach'], ['POST', '/api/desktop/apps/da-e3/reach', { principal: { kind: 'session', id: 's1' } }], ['DELETE', '/api/desktop/apps/da-e3/reach', { principal: { kind: 'session', id: 's1' } }], ['PUT', '/api/desktop/apps/da-e3/reach/mode', { mode: 'tree' }], ['POST', '/api/desktop/apps/da-e3/reach/request', { sessionId: 's1' }], ['POST', '/api/desktop/apps', { appId: 'gedit', share: { principals: [{ kind: 'session', id: 'claude:conv-a' }] } }]].map(([m, p, bd]) => hapi(m, p, bd, 'vsst_aaaa')));
    ok(agentCodes.every((r) => r.status === 403 && r.j.code === 'agent_forbidden'), `HUMAN-ONLY: every share route (and a launch carrying a share) refuses an agent's session token 403 agent_forbidden (${agentCodes.map((r) => r.status).join(',')})`);
    ok((await hapi('GET', '/api/desktop/apps/da-e3/reach', null, 'jbt_x')).j.code === 'agent_forbidden', '…a job token too');
    const rem = await hapi('GET', '/api/desktop/apps/da-remote/reach');
    ok(rem.status === 400 && rem.j.code === 'share_local_only' && /Box/.test(rem.j.error), 'a window on a PAIRED machine ⇒ 400 share_local_only (agents address this machine\'s windows only)');
    ok((await hapi('GET', '/api/desktop/apps/da-nope/reach')).status === 404, 'an unknown window ⇒ 404');
    const lnch = await hapi('POST', '/api/desktop/apps', { appId: 'gedit', share: { principals: [{ kind: 'session', id: 'codex:conv-b', name: 'beta' }], mode: 'tree' } });
    if (lnch.status !== 200 || !lnch.j.reach) console.log('    launch answered', lnch.status, JSON.stringify(lnch.j).slice(0, 400));
    ok(lnch.status === 200 && lnch.j.id === 'da-launched' && !('share' in hubLaunches[0].body) && lnch.j.reach && lnch.j.reach.mode === 'tree' && lnch.j.reach.rows.some((r) => r.principal.id === 'codex:conv-b'), 'D2 before launch: the launch\'s share is stripped from the keeper\'s body and applied to the NEW window (mode tree, beta by its key)');
    const launchAud = () => aud5().filter((l) => l.verb === 'reach-launch').pop();
    ok(launchAud() && launchAud().unmatched === 0, 'r2 (M2): the launch\'s audit counts the rows nobody answers to now — 0 for a live agent');
    const lnchGone = await hapi('POST', '/api/desktop/apps', { appId: 'gedit', share: { principals: [{ kind: 'session', id: 'claude:conv-ended', name: 'gone' }, { kind: 'group', id: 'task-deleted', name: 'Old group' }], mode: 'pixels' } });
    ok(lnchGone.status === 200 && launchAud().unmatched === 2 && launchAud().principals === 2, `…and ${launchAud() && launchAud().unmatched} for a remembered session that ended + a Task Group nobody is in (the rows are still written — the launcher said so in words)`);
    const lr = await hapi('POST', '/api/desktop/apps', { appId: 'gedit', host: 'box', share: { principals: [{ kind: 'session', id: 's2' }] } });
    ok(lr.status === 400 && lr.j.code === 'share_local_only' && hubLaunches.length === 2, 'a share on a launch to a PAIRED machine ⇒ 400 share_local_only BEFORE anything starts');
    ok((await hapi('POST', '/api/desktop/apps', { appId: 'gedit', share: { principals: [{ kind: 'nope' }] } })).j.code === 'bad_principal' && hubLaunches.length === 2, 'a bad share ⇒ 400 bad_principal before the launch');
    srv2.close();
    e5.shutdown();
    for (const id of ['da-e1', 'da-e2', 'da-e3', 'da-remote', 'da-launched']) records.delete(id);
  }

  // the routes
  const app = express();
  app.use(express.json());
  ROUTES.setup({ engine });
  app.use(ROUTES.router);
  const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = srv.address().port;
  const api = async (method, p, body, token = 'vsst_aaaa') => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; };
  ok((await api('GET', '/api/agent/window/targets', null, null)).status === 401 && (await api('GET', '/api/agent/window/targets', null, 'vsst_nope')).status === 401, 'no / unknown token ⇒ 401');
  const t = await api('GET', '/api/agent/window/targets');
  ok(t.status === 200 && t.j.targets.length === 2 && t.j.targets.some((r) => r.handle === 'da-one') && t.j.targets.some((r) => r.handle === 'da-web' && r.browser === true), 'GET targets answers the rows SHARED with me (da-one, the shared browser da-web — marked)', JSON.stringify((t.j.targets || []).map((r) => r.handle)));
  ok((await api('GET', '/api/agent/window/targets?host=other')).status === 400 && (await api('POST', '/api/agent/window/attach', { handle: 'da-one', host: 'box' })).j.code === 'unsupported-host', 'a non-local host is refused by name');
  ok((await api('POST', '/api/agent/window/attach', { handle: 'nope' })).status === 404 && (await api('POST', '/api/agent/window/attach', {})).status === 400, 'attach: unknown ⇒ 404, no handle ⇒ 400');
  ok((await api('POST', '/api/agent/window/act', { handle: 'da-one', verb: 'key', chord: 'x;y' })).status === 400, 'a bad chord ⇒ 400');
  const at2 = await api('POST', '/api/agent/window/attach', { handle: 'da-one' }, 'vsst_bbbb');
  ok(at2.status === 409 && at2.j.code === 'window_leased' && at2.j.holder === 's1', 'window_leased ⇒ 409 with the holder');
  ok((await api('POST', '/api/agent/window/detach', { handle: 'da-one' }, 'vsst_bbbb')).status === 404, 'not_attached ⇒ 404');
  const ww = await api('POST', '/api/agent/window/watch', { handle: 'da-one' });
  ok(ww.status === 200 && ww.j.openSpec.id === 'da-one', 'watch answers');
  const hr = await api('POST', '/api/agent/window/attach', { handle: 'da-web2' });
  ok(hr.status === 403 && hr.j.code === 'not_exposed' && hr.j.handle === 'da-web2', 'the route maps not_exposed to 403 (an unshared window)');
  ok((await api('POST', '/api/agent/window/snapshot', { handle: 'da-web2' })).j.code === 'not_exposed', '…snapshot through the route too');
  const hs = await api('POST', '/api/agent/window/attach', { handle: 'da-web' });
  ok(hs.status === 200 && hs.j.browser === true && hs.j.mode && hs.j.mode.mode === 'auto' && typeof hs.j.mode.why === 'string', 'the route\'s attach answers the share\'s MODE (auto resolved at attach, why) — a shared browser attaches (D4)');
  await api('POST', '/api/agent/window/detach', { handle: 'da-web' });
  ok(ROUTES.STATUS.browser_is_human === 403 && (await api('POST', '/api/agent/window/open', { appId: 'chromium-app' })).j.code === 'browser_is_human', '`open` of a browser row stays browser_is_human (403) — the user starts their own browser');
  { // the shipped CLI prints the refusal and its remedy line
    const { execFile } = await import('node:child_process');
    const CLI = path.join(new URL('..', import.meta.url).pathname, 'data/bin/vibespace-window');
    const cli = (...a) => new Promise((resolve) => execFile(process.execPath, [CLI, ...a], { env: { PATH: process.env.PATH, HOME: dir, VIBESPACE_API: `http://127.0.0.1:${port}`, VIBESPACE_SESSION_TOKEN: 'vsst_aaaa' }, encoding: 'utf8', timeout: 20000 }, (e, stdout, stderr) => resolve({ status: e ? e.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
    const r = await cli('attach', 'da-web2');
    ok(r.status === 1 && /\[not_exposed\]/.test(r.stderr) && r.stderr.includes('the user has not shared this window with you — ask them (they can share it from the window\'s ⋯ menu)'), '`vibespace-window attach <unshared window>` prints [not_exposed] and the remedy line', r.stderr);
    const ro = await cli('open', 'chromium-app');
    ok(ro.status === 1 && /\[browser_is_human\]/.test(ro.stderr) && /the user starts their own browser and can share it with you/.test(ro.stderr), '`vibespace-window open <browser row>` prints [browser_is_human] — "the user starts their own browser and can share it with you"', ro.stderr);
    const rl = await cli('list');
    ok(rl.status === 0 && /mode: auto/.test(rl.stdout) && /\[the user's browser\]/.test(rl.stdout) && /only windows the user shared with you/.test(rl.stdout), '`list` prints each row\'s mode and marks the user\'s shared browser', rl.stdout.slice(0, 600));
  }
  const uncovered = [...WT.REFUSALS, ...RE.REFUSALS].filter((c) => !(c in ROUTES.STATUS));
  ok(uncovered.length === 0, `every typed refusal has a status (${uncovered.join(', ') || 'none uncovered'}) — a 500 for a typed refusal would be a silent failure`);
  ok(!Object.values(ROUTES.STATUS).includes(500), 'no typed code maps to 500');
  srv.close();
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
cleanup();
process.exit(fail ? 1 : 0);
