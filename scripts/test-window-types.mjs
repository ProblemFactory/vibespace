#!/usr/bin/env node
// WINDOW-TYPE REGISTRY gate (Plugin Ph1 — docs/design-harness-plugins.md §3.2
// `windows[]`: "TYPE_ICONS + replayOpenSpec: switch → 注册表, 加 default 响亮").
//
// Two halves:
//   FUNCTIONAL — src/lib/window-types.js imported in plain node (it must be
//   DOM-free at import): register a fake kind, assert replay dispatch + the
//   opts pass-through, the LOUD unknown-action path (console.warn + return
//   null; the switch it replaced had no default and dropped the spec
//   silently), duplicate/malformed registrations throw, TYPE_ICONS is a live
//   view over the registry.
//   PINS — the registry is only a registry if core actually registers through
//   it: the exact set of 15 window kinds and 17 openSpec actions that the
//   former switch/TYPE_ICONS literal carried (listed by reading the pre-Ph1
//   source, pinned verbatim), each registered exactly once in its owning
//   module; every `createWindow({ type: '…' })` literal is a registered kind;
//   every openSpec literal's action is a registered action; the switch,
//   the TYPE_ICONS literal and layout.js's TRANSIENT_WINDOW_TYPES set are
//   gone (a kind added to one of them again would be invisible to the
//   registry — the 2.355.0 UNSTAGED-WIRING class); ci.mjs carries this suite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// The registry imports telemetry-client → build-version.js, which `npm run
// build` GENERATES (gitignored). Same prerequisite test-resume-all-desktops
// has through layout.js; ci.mjs builds before any suite runs.
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) {
  console.error('src/lib/build-version.js is missing — run `npm run build` first (it is a generated file)');
  process.exit(1);
}

// ── THE PINNED CORE SETS (from the pre-Ph1 source: tab-group.js TYPE_ICONS
//    keys + every `type:` literal handed to wm.createWindow; the 17 `case`
//    strings of session-lifecycle's replayOpenSpec switch) ──
// The 15 pre-Ph1 kinds, plus every kind registered since — each named with
// the feature that owns it, so an UNREGISTERED new kind (which `replayOpenSpec`
// would drop silently on every other client) is still what this pin catches.
//   browser-live — the agent browser's live view (docs/design-agent-browser-v2.md §4.4, P2)
//   channel — ONE external conversation (docs/design-communication-panel.zh.md §10.1)
//   desktop-app — one local desktop application on its own display (docs/design-desktop-apps §2, 2026-09-13)
//   integrations — ⚙ → Integrations & keys, one card per registry row (docs/design-communication-panel.zh.md §14.5, P0b)
//   channel-outbox — THE approval outbox, a singleton (docs/design-communication-panel.zh.md §9.2 / §10.1, P3)
//   channels / system / ports — the rail-panel WINDOW FALLBACKS (docs/design-mobile-gaps.md #2/#9, 2026-09-20): the very same panel
//     renderer in a singleton window wherever the rail is not built (a phone, sidebar.activityRail off)
//   inbox — THE For-you window, a singleton (docs/design-user-inbox-reply.md §9, 2026-09-27): the inbox as a mail client
//   browser-replay — a conversation's (or a profile's) browser SESSIONS and their replay, one window per target (2026-09-27)
//   design — the Design window: a conversation's designs/<slug>/ artboards live on a canvas, one window per (host, dir) (lane design-window, 2026-10-02)
//   doc — the Doc window: a markdown file read, edited and commented in one rendered view, one window per (host, path) (lane doc-window, 2026-10-05)
const CORE_TYPES = ['artifacts', 'browser', 'browser-live', 'browser-profiles', 'browser-replay', 'channel', 'channel-outbox', 'channels', 'chat', 'design', 'desktop', 'doc', 'desktop-app', 'editor', 'files', 'hex-viewer', 'inbox', 'integrations', 'job-interact', 'jobs',
  'machine-app', 'machine-desktop', 'ports', 'search', 'settings', 'stage-placeholder', 'system', 'task', 'terminal', 'usage', 'vault', 'viewer', 'workflow', 'form']; // + search (lane global-search); + vault (lane vault-contents-window); + form (lane dialog-yield: createModalShell's kind 'form' — a small window that yields)
const CORE_ACTIONS = ['attachSession', 'openFileExplorer', 'openFile', 'openEditor', 'openBrowser', 'openBrowserLive', 'openBrowserProfiles', 'openDesktop', 'openDesktopApp',
  'openTaskDetail', 'openTaskLog', 'openJobs', 'openJobInteract', 'openUsage', 'openSettings', 'openSessionProps',
  'openWorkflowDetail', 'attachTmuxSession', 'viewSession', 'viewSubagent', 'openChannel', 'openChannelOutbox', 'openIntegrations', 'openChannels', 'openSystem', 'openPorts', 'openInbox', 'openBrowserReplay', 'openDesign', 'openDoc', 'openSearch', 'openArtifacts', 'openMachineDesktop', 'openVault', 'openDiagram']; // + lane desktop-display-modes: a machine's desktop window is restored by its openSpec (mode + display)
// layout.js's former `TRANSIENT_WINDOW_TYPES = new Set(['chat', 'terminal', 'stage-placeholder'])`
const CORE_TRANSIENT = ['chat', 'terminal', 'stage-placeholder', 'machine-app', 'vault', 'form']; // + lane dialog-yield: a FORM is this client's own (no openSpec; captureWin never records it) // + lane machine-app-crop: one app of a machine is never re-opened by a reload (it asks the sign-in); lane desktop-display-modes: a machine's whole desktop now IS (its openSpec — the mode + display are the window's): a replay streams, never asks the sign-in by itself; + lane vault-contents-window: the Vault window is never restored by a reload nor synced to another client (showing a value is one page's act behind the second password)
// kinds whose opener focuses an existing window of the kind instead of opening a second
const CORE_SINGLETONS = ['browser-profiles', 'channel-outbox', 'channels', 'desktop', 'inbox', 'integrations', 'jobs', 'ports', 'search', 'settings', 'system', 'usage', 'vault'];

console.log('window-type registry — functional (node, DOM-free)');
ok(typeof document === 'undefined' && typeof window === 'undefined', 'harness has no DOM (the import below must not need one)');
const wt = await import('../src/lib/window-types.js');
ok(typeof wt.registerWindowType === 'function' && typeof wt.registerOpenAction === 'function'
  && typeof wt.getWindowType === 'function' && typeof wt.windowTypeIcon === 'function'
  && typeof wt.replayOpenSpec === 'function' && typeof wt.isTransientWindowType === 'function'
  && wt.TYPE_ICONS && typeof wt.TYPE_ICONS === 'object', 'module exports the registry API + the TYPE_ICONS view');
ok(wt.listWindowTypes().length === 0 && wt.listOpenActions().length === 0, 'a bare import registers nothing (core kinds register in their owning modules, not here)');

// register a fake kind + dispatch
const calls = [];
const fakeWin = { id: 'win-fake' };
const rec = wt.registerWindowType({
  type: 'fake-kind', icon: '<svg data-fake="1"/>', label: 'Fake kind',
  action: 'openFakeKind', replay: (app, spec, opts) => { calls.push({ app, spec, opts }); return fakeWin; },
});
ok(rec && rec.type === 'fake-kind' && rec.icon === '<svg data-fake="1"/>' && rec.label === 'Fake kind'
  && rec.persist === true && rec.singleton === false && same(rec.actions, ['openFakeKind']),
  'registerWindowType returns the record (persist defaults true, singleton false, actions derived)');
ok(wt.windowTypeIcon('fake-kind') === '<svg data-fake="1"/>' && wt.TYPE_ICONS['fake-kind'] === '<svg data-fake="1"/>',
  'windowTypeIcon + TYPE_ICONS view both read the registered icon');
ok(wt.windowTypeIcon('never-registered') === '' && (wt.TYPE_ICONS['never-registered'] || '') === '',
  "unregistered kind → '' from both readers (the value the old `TYPE_ICONS[type] || \\'\\'` produced)");
ok(wt.TYPE_ICONS['constructor'] === undefined, 'TYPE_ICONS is null-prototype (no Object.prototype member leaks as an icon)');
const app = { name: 'fake-app' };
const spec = { action: 'openFakeKind', path: '/x' };
const r = wt.replayOpenSpec(app, spec, { syncId: 'win-sync-1' });
ok(r === fakeWin, 'replayOpenSpec returns the replay\'s result (winInfo)');
ok(calls.length === 1 && calls[0].app === app && calls[0].spec === spec && calls[0].opts.syncId === 'win-sync-1',
  'replay received (app, spec, { syncId }) — the same spec object, not a copy');
ok(wt.getOpenAction('openFakeKind')?.type === 'fake-kind', 'getOpenAction resolves action → owning kind');

// undefined-returning replay → null (never `undefined`, so callers can `?? `/`===null` uniformly)
wt.registerWindowType({ type: 'fake-void', icon: '', action: 'openFakeVoid', replay: () => {} });
ok(wt.replayOpenSpec(app, { action: 'openFakeVoid' }) === null, 'a replay returning undefined → null');
ok(wt.windowTypeIcon('fake-void') === '' && Object.keys(wt.TYPE_ICONS).includes('fake-void'), "icon '' is a legal registration (usage/jobs kinds have no icon today) and still keys the view");

// a second module adds an action onto a kind it does not own (task-log/session-props → 'task')
wt.registerOpenAction({ action: 'openFakeSecond', type: 'fake-kind', replay: () => ({ id: 'w2' }) });
ok(same(wt.getWindowType('fake-kind').actions, ['openFakeKind', 'openFakeSecond']), 'registerOpenAction attaches a further action to an existing kind');
ok(wt.replayOpenSpec(app, { action: 'openFakeSecond' })?.id === 'w2', 'dispatch reaches the standalone action');

// multi-action form + persist/singleton flags
wt.registerWindowType({ type: 'fake-multi', icon: '', persist: false, singleton: true,
  actions: { openFakeA: () => 'A', openFakeB: () => 'B' } });
ok(wt.replayOpenSpec(app, { action: 'openFakeA' }) === 'A' && wt.replayOpenSpec(app, { action: 'openFakeB' }) === 'B', 'multi-action form dispatches each action');
ok(wt.isTransientWindowType('fake-multi') === true && wt.isTransientWindowType('fake-kind') === false && wt.isTransientWindowType('nope') === false,
  'isTransientWindowType = persist:false only (unregistered kinds are NOT transient — the breadcrumb still fires for them)');
ok(wt.getWindowType('fake-multi').singleton === true, 'singleton flag is recorded');
ok(wt.getWindowType('nope') === null && wt.getOpenAction('nope') === null, 'lookups of unknown kind/action return null');

// TYPE_ICONS keys == registry keys (live view)
ok(same(Object.keys(wt.TYPE_ICONS), wt.listWindowTypes()), 'TYPE_ICONS keys == registered kinds (live view, not a snapshot)');

// LOUD unknown action: console.warn + return null (no throw — a poisoned
// layout record must not abort the whole restore loop)
const warns = [];
const origWarn = console.warn;
console.warn = (...a) => warns.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
let unknownResult, threw = false;
try { unknownResult = wt.replayOpenSpec(app, { action: 'openSomethingNobodyRegistered', x: 1 }, { syncId: 'w9' }); } catch { threw = true; }
const nullResult = wt.replayOpenSpec(app, null);
const noActionResult = wt.replayOpenSpec(app, { path: '/x' });
console.warn = origWarn;
ok(!threw && unknownResult === null, 'unknown action → null, no throw');
ok(warns.length === 3, `every unregistered/missing action warns (${warns.length}/3)`);
ok(/openSomethingNobodyRegistered/.test(warns[0]) && /window not replayed/.test(warns[0]) && /openFakeKind/.test(warns[0]),
  'the warning names the action, says the window was not replayed, and lists what IS registered');
ok(nullResult === null && noActionResult === null && /\(missing\)/.test(warns[1]) && /\(missing\)/.test(warns[2]), 'null spec / spec without action → null + "(missing)" warning');

// duplicates + malformed registrations throw at registration time (module load), never later
const throws = (fn) => { try { fn(); return false; } catch (e) { return String(e.message || e); } };
ok(/duplicate window type 'fake-kind'/.test(throws(() => wt.registerWindowType({ type: 'fake-kind', icon: '' }))), 'duplicate kind throws');
ok(/duplicate openSpec action 'openFakeKind'/.test(throws(() => wt.registerOpenAction({ action: 'openFakeKind', type: 'fake-kind', replay: () => {} }))), 'duplicate action throws');
ok(/type/.test(throws(() => wt.registerWindowType({ icon: '' }))), 'missing type throws');
ok(/icon/.test(throws(() => wt.registerWindowType({ type: 'fake-bad-icon', icon: 42 }))), 'non-string icon throws');
ok(/replay/.test(throws(() => wt.registerWindowType({ type: 'fake-bad-replay', action: 'openBad' }))), 'action without replay throws');
ok(/action/.test(throws(() => wt.registerWindowType({ type: 'fake-bad-action', replay: () => {} }))), 'replay without action throws');
ok(!wt.listWindowTypes().includes('fake-bad-replay') && !wt.listWindowTypes().includes('fake-bad-action'), 'a rejected registration leaves no half-registered kind');
ok(/replay/.test(throws(() => wt.registerOpenAction({ action: 'openBad2', type: 'fake-kind', replay: 'nope' }))), 'registerOpenAction with a non-function replay throws');
{
  const before = wt.listWindowTypes().length;
  const msg = throws(() => wt.registerWindowType({ type: 'fake-atomic', icon: '', actions: { openFakeKind: () => {} } }));
  ok(/duplicate openSpec action/.test(msg) && wt.listWindowTypes().length === before && !wt.getWindowType('fake-atomic'),
    'a kind whose action list collides is rolled back atomically (no kind, no partial action)');
}

// ── PINS ──
console.log('window-type registry — wiring pins');
const lib = 'src/lib';
const libFiles = fs.readdirSync(path.join(repo, lib)).filter((f) => f.endsWith('.js') && f !== 'build-version.js');
const src = Object.fromEntries(libFiles.map((f) => [f, read(path.join(lib, f))]));

// scan an object literal starting at src[i] === '{' → index of its matching '}' (string-aware)
function matchBrace(s, i) {
  let depth = 0, q = null;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') { depth--; if (depth === 0) return j; }
  }
  return -1;
}
// every registerWindowType({...}) / registerOpenAction({...}) call in src/lib, parsed
const regs = [];
for (const [file, s] of Object.entries(src)) {
  if (file === 'window-types.js') continue; // the registry's own internal calls
  const re = /\b(registerWindowType|registerOpenAction)\(\{/g;
  let m;
  while ((m = re.exec(s))) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(s, open);
    const body = s.slice(open, close + 1);
    const type = body.match(/\btype:\s*'([a-z-]+)'/)?.[1];
    if (!type && !/\btype:\s*'/.test(body)) continue; // DYNAMIC registration (plugin-contributed kinds, src/lib/plugin-client.js) — not a core kind
    const actions = [];
    const single = body.match(/\baction:\s*'([A-Za-z]+)'/)?.[1];
    if (single) actions.push(single);
    const multi = body.match(/\bactions:\s*\{([^}]*)\}/)?.[1];
    if (multi) for (const k of multi.matchAll(/\b([A-Za-z]+)\s*:/g)) actions.push(k[1]);
    const replay = body.match(/\breplay:\s*\([^)]*\)\s*=>\s*([^\n]*)/)?.[1] || '';
    const label = body.match(/\blabel:\s*'([^']*)'/)?.[1] ?? null;
    const iconExpr = body.match(/\bicon:\s*([^\n,]+(?:\([^\n]*\))?)/)?.[1] || '';
    regs.push({ file, fn: m[1], type, actions, persistFalse: /\bpersist:\s*false\b/.test(body), singleton: /\bsingleton:\s*true\b/.test(body), replay, label, iconExpr });
  }
}
const typeRegs = regs.filter((r) => r.fn === 'registerWindowType');
const regTypes = typeRegs.map((r) => r.type);
const regActions = regs.flatMap((r) => r.actions);
ok(same(regTypes, CORE_TYPES), `core registers exactly the declared window kinds (${regTypes.length}: ${regTypes.sort().join(' ')})`,
  'missing: ' + CORE_TYPES.filter((t) => !regTypes.includes(t)).join(',') + ' extra: ' + regTypes.filter((t) => !CORE_TYPES.includes(t)).join(','));
ok(new Set(regTypes).size === regTypes.length, 'each kind is registered exactly once');
ok(same(regActions, CORE_ACTIONS), `core registers exactly the declared openSpec actions (${regActions.length})`,
  'missing: ' + CORE_ACTIONS.filter((a) => !regActions.includes(a)).join(',') + ' extra: ' + regActions.filter((a) => !CORE_ACTIONS.includes(a)).join(','));
ok(new Set(regActions).size === regActions.length, 'each action is registered exactly once');
ok(regs.every((r) => r.type && regTypes.includes(r.type)), 'every action registration names a registered kind (registerOpenAction type ∈ kinds)');
ok(same(typeRegs.filter((r) => r.persistFalse).map((r) => r.type), CORE_TRANSIENT), "persist:false set == layout.js's former TRANSIENT_WINDOW_TYPES {chat, terminal, stage-placeholder} + machine-app (lane machine-app-crop) — machine-desktop restored by its openSpec since lane desktop-display-modes");
ok(same(typeRegs.filter((r) => r.singleton).map((r) => r.type), CORE_SINGLETONS), 'singleton set == the kinds whose opener focuses an existing window {desktop, integrations, jobs, settings, usage}');

// A REPLAY MUST PRODUCE THE WINDOW IT NAMES (2.369.125 r2, verifier finding on
// docs/design-mobile-gaps.md #2/#9): four openers run a rail-first ladder for
// the human ⚙ click (rail panel where the rail exists, else a window). A
// layout-sync replay carries a syncId = a WINDOW another client holds; routed
// through the ladder without `forceWindow` it opened the desktop's rail panel
// instead (its sidebar opened by itself), no window with that id existed, and
// the desktop's next save closed the phone's window. Census: every replay
// closure that calls a ladder opener passes forceWindow: true.
const RAIL_LADDER_OPENERS = ['openRailPanel(', 'app.openChannels(', 'app.openJobs(', 'app.openJobInteract('];
const replaysViaLadder = (r) => RAIL_LADDER_OPENERS.some((o) => r.replay.includes(o));
const replayForcesWindow = (r) => /\bforceWindow:\s*true\b/.test(r.replay);
const ladderReplays = typeRegs.filter(replaysViaLadder);
ok(same(ladderReplays.map((r) => r.type), ['channels', 'job-interact', 'jobs', 'ports', 'system']), `the rail-ladder replays are exactly {channels, job-interact, jobs, ports, system} (${ladderReplays.map((r) => r.type).sort().join(' ')})`);
ok(ladderReplays.every(replayForcesWindow), 'every replay that routes through a rail-first ladder passes forceWindow: true (a replay produces the window it names)',
  ladderReplays.filter((r) => !replayForcesWindow(r)).map((r) => `${r.type}: ${r.replay}`).join('; '));
ok(ladderReplays.every((r) => r.replay.trim().length > 0), 'the replay text was actually captured (an empty capture would pass the predicate vacuously)');
// negative control: the r1 closure text (no forceWindow) fails the same predicate
ok(!replayForcesWindow({ replay: "openRailPanel(app, 'system', { syncId }) });" }) && replayForcesWindow({ replay: "openRailPanel(app, 'system', { syncId, forceWindow: true }) });" }), 'negative control: the pre-fix closure text fails the predicate, the fixed one passes');

// THE THREE BROWSER FACES (docs/design-browser-faces.zh.md direction B, owner
// 2026-09-24 "那就选B吧"): the window kinds keep their ids (layout replay reads
// ids) and carry the names that say WHO drives each one — the web view is the
// user's iframe, the agent browser is the agent's. The globe belongs to the web
// view alone; the agent's two kinds wear the window-with-a-dot glyph defined
// ONCE in icons.js (UI_ICONS.browserLive).
{
  const lab = Object.fromEntries(typeRegs.map((r) => [r.type, r.label]));
  ok(lab.browser === 'Web view' && lab['browser-live'] === 'Agent browser (live)' && lab['browser-profiles'] === 'Agent browser',
    `the browser faces' kind labels: browser → 'Web view', browser-live → 'Agent browser (live)', browser-profiles → 'Agent browser' (${JSON.stringify([lab.browser, lab['browser-live'], lab['browser-profiles']])})`);
  const ic = Object.fromEntries(typeRegs.map((r) => [r.type, r.iconExpr]));
  ok(/^UI_ICONS\.browserLive\b/.test(ic['browser-live'] || ''), `the live view's kind icon IS UI_ICONS.browserLive, not a local copy of the path (${ic['browser-live']})`);
  ok(/svgIcon16\('<circle cx="8" cy="8" r="6"\/>/.test(ic.browser || ''), 'the web view keeps the globe (the one meaning the globe has left)');
  ok(/import \{[^}]*\bUI_ICONS\b[^}]*\} from '\.\/icons\.js'/.test(src['browser-live-window.js']), 'browser-live-window.js imports UI_ICONS (the icon comes from the one definition)');
  ok(lab['browser-replay'] === 'Browser replay' && /^UI_ICONS\.browserReplay\b/.test(ic['browser-replay'] || ''), `the replay window's kind: labelled 'Browser replay', its icon UI_ICONS.browserReplay from icons.js (${ic['browser-replay']})`);
}

// ownership: each kind registered in the module that opens it
const owner = Object.fromEntries(typeRegs.map((r) => [r.type, r.file]));
const EXPECTED_OWNER = { chat: 'session-lifecycle.js', terminal: 'session-lifecycle.js', files: 'app.js', editor: 'app.js',
  viewer: 'file-viewer.js', 'hex-viewer': 'file-viewer.js', browser: 'browser-window.js', 'browser-live': 'browser-live-window.js', 'browser-profiles': 'browser-trace-view.js', desktop: 'desktop-window.js', 'desktop-app': 'desktop-app-window.js',
  'machine-desktop': 'machine-desktop.js', // design 014 D1
  'machine-app': 'machine-app.js', // lane machine-app-crop
  vault: 'vault-window.js', // lane vault-contents-window
  task: 'task-detail.js', jobs: 'jobs-panel.js', 'job-interact': 'jobs-panel.js', usage: 'usage-window.js',
  settings: 'settings-ui.js', workflow: 'workflow-detail.js', 'stage-placeholder': 'stage-manager.js', integrations: 'integrations-window.js',
  channels: 'channels-panel.js', system: 'sidebar-rail.js', ports: 'sidebar-rail.js', inbox: 'inbox-window.js', 'browser-replay': 'browser-replay-window.js', design: 'design-window.js', doc: 'doc-window.js', artifacts: 'artifacts-window.js' };
ok(Object.entries(EXPECTED_OWNER).every(([t, f]) => owner[t] === f), 'each kind registers in its owning module',
  Object.entries(EXPECTED_OWNER).filter(([t, f]) => owner[t] !== f).map(([t, f]) => `${t}: ${owner[t]} (expected ${f})`).join('; '));
ok(regs.some((r) => r.file === 'task-log.js' && r.fn === 'registerOpenAction' && r.actions.includes('openTaskLog') && r.type === 'task')
  && regs.some((r) => r.file === 'session-props.js' && r.fn === 'registerOpenAction' && r.actions.includes('openSessionProps') && r.type === 'task'),
  "task-log / session-props attach their actions to the shared 'task' kind via registerOpenAction");
ok([...new Set(regs.map((r) => r.file))].every((f) => /from '\.\/window-types\.js'/.test(src[f])), 'every registering module imports window-types.js (a bare call is the 2.330.1 free-variable class)');

// THE DESIGN WINDOW WITH NO FOLDER IS THE HOME (lane design-systems-home, design 003 §2 S6): the same kind and the
// same action — no new window kind — so layout restore, cross-client sync and the phone replay a home like any
// Design window; the replay passes `dir` through as is ('' = the home).
{
  const dw = src['design-window.js'], dh = src['design-home.js'] || '';
  const HOME_PIN = /if \(!d\) return openDesignHome\(app, \{ syncId \}\);/;
  ok(HOME_PIN.test(dw) && !/No design folder was named/.test(dw), 'openDesign with no folder opens the home (the old "no folder" refusal toast is gone)');
  ok(/import \{ openDesignHome \} from '\.\/design-home\.js'/.test(dw), 'design-window.js takes the home from its own module (design-home.js)');
  const reg = typeRegs.find((r) => r.type === 'design');
  ok(!!reg && /dir: spec\.dir\b/.test(reg.replay), `the design replay passes spec.dir through as is ('' = the home): ${reg && reg.replay}`);
  ok(/createWindow\(\{[^}]*type: 'design'[^}]*openSpec[^}]*\}\)/.test(dh) && /const openSpec = \{ action: 'openDesign', host: '', dir: '', sessionId: '' \};/.test(dh), "the home is a 'design' window whose openSpec is openDesign with dir '' (no new kind, no new action)");
  ok(/w\._designHome\)/.test(dh) && /revealWindow\(existing\.id, \{ replay: !!syncId \}\)/.test(dh), 'one home per client: an open one is revealed (a replay only raises)');
  ok(!HOME_PIN.test("  if (!d) { showToast(t('No design folder was named'), { type: 'error' }); return null; }"), 'negative control: the pre-lane no-folder line fails the home pin');
}

// THE DOC WINDOW (lane doc-window): app.openFile routes a markdown file to it (a `:line` link, hex and a derived temp file
// keep the editor's door); the replay carries host + path + from; one window per (host, path) — an open one is revealed.
{
  const dd = src['doc-window.js'] || '', ap = src['app.js'] || '';
  const ROUTE = /if \(\/\\\.\(md\|markdown\)\$\/i\.test\(fileName \|\| filePath\) && !opts\.line && !opts\.hex && !opts\._tempFile && !opts\.via\) \{/;
  ok(ROUTE.test(ap) && /return this\.openDoc\(\{ host: opts\.host \|\| '', path: filePath, from:/.test(ap), 'openFile routes .md / .markdown to the Doc window (a :line link / hex / a temp file keep the editor)');
  const reg = typeRegs.find((r) => r.type === 'doc');
  ok(!!reg && /path: spec\.path\b/.test(reg.replay) && /from: spec\.from/.test(reg.replay) && /host: spec\.host/.test(reg.replay), `the doc replay carries host, path and from: ${reg && reg.replay}`);
  ok(/const openSpec = \{ action: 'openDoc', host: h, path: p, from: from \|\| '' \};/.test(dd) && /w\._filePath !== p \|\| \(w\._docHost \|\| ''\) !== h/.test(dd) && /app\.wm\.revealWindow\(w\.id, \{ replay: !!syncId \}\)/.test(dd), 'one Doc window per (host, path): an open one is revealed (a replay only raises)');
  ok(/import\(new URL\('\/doc-editor\.js', location\.origin\)\.href\)/.test(dd) && !/from 'prosemirror/.test(dd), 'the editor is the LAZY public/doc-editor.js — the door imports no prosemirror module');
  ok(!ROUTE.test("    if (/\\.(md|markdown)$/i.test(fileName || filePath)) {"), 'negative control: a route without the :line / hex / temp-file exits fails the pin');
}

// census: every `createWindow({ ... type: '<lit>' })` literal in src/lib is a registered kind
const censusTypes = new Set();
for (const [file, s] of Object.entries(src)) {
  const re = /createWindow\(\{/g;
  let m;
  while ((m = re.exec(s))) {
    const open = m.index + m[0].length - 1;
    const body = s.slice(open, matchBrace(s, open) + 1);
    const lit = body.match(/\btype:\s*'([a-z-]+)'/)?.[1];
    if (lit) censusTypes.add(lit);
    const cond = body.match(/\btype:\s*[^,]*?\?\s*'([a-z-]+)'\s*:\s*'([a-z-]+)'/);
    if (cond) { censusTypes.add(cond[1]); censusTypes.add(cond[2]); }
    void file;
  }
}
ok([...censusTypes].every((t) => regTypes.includes(t)), `every createWindow type literal is a registered kind (${[...censusTypes].sort().join(' ')})`,
  'unregistered: ' + [...censusTypes].filter((t) => !regTypes.includes(t)).join(','));
// census: every openSpec literal's action is a registered action
const specActions = new Set();
for (const s of Object.values(src)) for (const m of s.matchAll(/\{\s*action:\s*'([A-Za-z]+)'/g)) specActions.add(m[1]);
ok(specActions.size >= 15 && [...specActions].every((a) => regActions.includes(a)), `every openSpec literal's action is registered (${specActions.size} literals)`,
  'unregistered: ' + [...specActions].filter((a) => !regActions.includes(a)).join(','));

// the three former literal homes are gone; the readers go through the registry
const sl = src['session-lifecycle.js'];
ok(!/switch\s*\(\s*spec\.action\s*\)/.test(sl), 'session-lifecycle: no `switch (spec.action)` left');
ok(!CORE_ACTIONS.some((a) => new RegExp(`case '${a}'`).test(sl)), 'session-lifecycle: no former `case` string survives');
ok(/replayOpenSpec\(spec, syncId\) \{\s*return replayOpenSpecViaRegistry\(this, spec, \{ syncId \}\);/.test(sl), 'app.replayOpenSpec delegates to the registry (callers keep their entry point)');
const tg = src['tab-group.js'];
ok(!/export const TYPE_ICONS\s*=/.test(tg) && /export \{ TYPE_ICONS \} from '\.\/window-types\.js'/.test(tg), 'tab-group: TYPE_ICONS literal gone, re-exported as the registry view');
ok(!/TYPE_ICONS\[/.test(src['window.js']) && (src['window.js'].match(/windowTypeIcon\(type\)/g) || []).length === 2, 'window.js reads icons through windowTypeIcon() (title-bar span + _typeIcon)');
const lay = src['layout.js'];
ok(!/TRANSIENT_WINDOW_TYPES/.test(lay.replace(/\/\/[^\n]*/g, '')) && /!isTransientWindowType\(win\.type\)/.test(lay), 'layout.js: TRANSIENT_WINDOW_TYPES set gone, breadcrumb exemption reads the registry');
const wtSrc = src['window-types.js'];
ok(/track\('event', 'openspec-unknown', what\)/.test(wtSrc) && /console\.warn\(/.test(wtSrc), "unknown action is LOUD: console.warn + telemetry 'openspec-unknown'");
const wtImports = [...wtSrc.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
ok(same(wtImports, ['./telemetry-client.js']), `window-types.js imports only telemetry-client (DOM-free at import) — got ${wtImports.join(',')}`);
ok(/'test-window-types'/.test(read('scripts/ci.mjs')), 'ci.mjs SUITES carries this suite');

// ── THE MANAGER OWNS TITLES (channels r3) ──
// `winInfo` is a plain literal (window.js) with NO `setTitle` member, so
// `winInfo.setTitle?.(…)` is a PERMANENT no-op — every channel window read
// "Channel" and two open conversations were indistinguishable; jobs-panel had
// the identical call. The silent-optional-call shape `off?.()` on `onGlobal`'s
// undefined return was the r2 instance. A census, comments blanked, so the
// idiom cannot come back under a new window type.
{
  const w = src['window.js'];
  const literal = /const winInfo = \{[\s\S]*?_listenerCtl: new AbortController\(\) \};/.exec(w)?.[0] || '';
  ok(literal && !/\bsetTitle\b/.test(literal) && !/winInfo\.setTitle\s*=/.test(w) && /^\s*setTitle\(id, t\) \{/m.test(w),
    'window.js: the winInfo literal has no setTitle member and none is ever assigned — titles belong to WindowManager.setTitle(id, t)');
  const NOOP = /\bwinInfo\.setTitle\s*\??\.?\(/;
  const blank = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const strays = Object.entries(src).filter(([, s]) => NOOP.test(blank(s))).map(([f]) => f);
  ok(!strays.length, 'no module in src/lib calls the no-op `winInfo.setTitle?.(…)` — a title set that way is never drawn', strays.join(', '));
  ok(NOOP.test("    winInfo.setTitle?.(c.title || convId);") && NOOP.test("winInfo.setTitle(x)"), 'POSITIVE CONTROL: the census matches the retired spelling (both forms)');
  ok(!NOOP.test("    app.wm.setTitle(winInfo.id, c.title || convId);"), 'NEGATIVE CONTROL: …and not the manager call that replaced it');
  ok(/app\.wm\.setTitle\(winInfo\.id, /.test(src['channel-window.js']) && /app\.wm\.setTitle\(winInfo\.id, /.test(src['jobs-panel.js']),
    'channel-window.js and jobs-panel.js set their titles through the manager');
}

// ── THE HARNESS MARK IN EVERY PICK LIST (lane phone-take-photo, the owner 2026-11-09, phone: «手机上对话列表的图标也match一下harness»)
// Every list a person picks a window from draws its row's mark through ONE call — agent-meta windowListMark, the call the
// title bar's slot makes — so an agent conversation wears its harness's mark there; the type glyph is drawn raw only where a
// window has no harness mark (the taskbar tile's and the tab's fallbacks behind `backendIconSlot?.children.length`).
console.log('the harness mark in every pick list (lane phone-take-photo)');
{
  const bodyOf = (s, head) => { const i = s.indexOf(head); if (i < 0) return ''; const j = s.indexOf('\n}\n', i); const k = s.indexOf('\n  }\n', i); return s.slice(i, head.startsWith('  ') ? k : j); };
  const judgeMarks = (S) => {
    const am = S['agent-meta.js'], wj = S['window.js'], tb = S['taskbar.js'], mn = S['mobile-nav.js'], wc = S['warmth-chrome.js'];
    const lm = bodyOf(am, 'export function windowListMark(');
    const overlap = (() => { const i = wj.indexOf("pop.className = 'overlap-switcher';"); return i < 0 ? '' : wj.slice(i, wj.indexOf('document.body.appendChild(pop);', i)); })();
    const lists = {
      'mobile-nav.js _buildWindowItem (the phone list)': bodyOf(mn, '  _buildWindowItem(win, wm, close, rerender) {'),
      'taskbar.js showHiddenTiles (the «+N» list)': bodyOf(tb, 'function showHiddenTiles(app, chip) {'),
      'taskbar.js showWindowList (the ⧉ list)': bodyOf(tb, 'export function showWindowList(app, anchor, opts = {}) {'),
      'taskbar.js renderEveryDesktop (the warmth list)': bodyOf(tb, 'function renderEveryDesktop(app, pop, place) {'),
      'window.js overlap switcher': overlap,
    };
    // ONE builder per listed site (the acceptance): windowListMark, and no second builder call beside it
    const listed = Object.fromEntries(Object.entries(lists).map(([k, b]) => [k, !!b && /windowListMark\(/.test(b) && !/_typeIcon|\.icon\b/.test(b) && !/create(?:Mode)?BackendIcon(?:Html)?\(/.test(b)]));
    const raw = Object.entries(S).flatMap(([f, s]) => [...s.matchAll(/innerHTML = (\w+)\._typeIcon/g)].map((m) => ({ f, at: m.index, guarded: /backendIconSlot\?\.children\.length/.test(s.slice(Math.max(0, m.index - 420), m.index)) })));
    return {
      builder: /if \(backend\) el = type === 'chat' \|\| type === 'terminal' \? createModeBackendIcon\(backend, type, \{ className \}\) : createBackendIcon\(backend, \{ className \}\);/.test(lm)
        && /el\.innerHTML = \(win && win\._typeIcon\) \|\| '';/.test(lm) && /el\.dataset\.listMark = String\(win\.id\)/.test(lm),
      titleBar: /win\.backendIconSlot\.appendChild\(windowListMark\(win, \{ className: 'window-backend-icon', listed: false \}\)\);/.test(wj) && !/createModeBackendIcon\(|createBackendIcon\(/.test(wj),
      follows: /followListMarks\(win\);/.test(bodyOf(wj, '  _applyTitleMeta(win) {')) && /old\.replaceWith\(windowListMark\(win, /.test(bodyOf(am, 'export function followListMarks(')),
      warmth: /mark: \{ id: win\.id, type: win\.type, titleMeta: \{ backend:/.test(wc) && /mark: \{ type: h\.type, titleMeta: \{ backend: h\.backend \|\| null \}/.test(wc)
        // …and a HELD row's harness is its record's (heldOf captures it), by OWN key of the record
        && /type: ws\.type, backend: ws\.backend \|\| \(ws\.openSpec && ws\.openSpec\.backend\) \|\| null \}\);/.test(wc),
      ownKey: /Object\.prototype\.hasOwnProperty\.call\(BACKEND_META, raw\)/.test(lm) && /: 'unknown';/.test(lm),
      listed, raw,
    };
  };
  const jm = judgeMarks(src);
  ok(jm.builder, 'agent-meta windowListMark: a chat / terminal = the mode mark, another window with a harness = the plain one, else the type glyph; a listed mark carries its window id');
  ok(jm.titleBar, "window.js: the title bar's slot is drawn by the SAME call (listed: false) — no second builder call in window.js");
  ok(jm.follows, '_applyTitleMeta → followListMarks: an open list re-draws a mark whose harness became known');
  for (const [k, v] of Object.entries(jm.listed)) ok(v, `${k} draws its rows' marks through windowListMark (no raw type glyph)`);
  ok(jm.warmth, 'the warmth rows carry what their mark is drawn from — a built row its window\'s facts, a held row its record\'s harness');
  ok(jm.raw.length === 3 && jm.raw.every((r) => r.guarded), `a raw type glyph is drawn only behind a harness check (the tile, the tab stack, the tab bar): ${jm.raw.map((r) => r.f + (r.guarded ? '' : ' UNGUARDED')).join(', ')}`);
  // RED controls (planted copies): each list site and each half of the law, reverted alone
  const plant = (f, from, to) => { const c = { ...src }; if (!c[f].includes(from)) return null; c[f] = c[f].replace(from, to); return judgeMarks(c); };
  const pPhone = plant('mobile-nav.js', 'icon.appendChild(windowListMark(win));', "icon.innerHTML = win._typeIcon || '';");
  ok(pPhone && !pPhone.listed['mobile-nav.js _buildWindowItem (the phone list)'] && !(pPhone.raw.length === 3 && pPhone.raw.every((r) => r.guarded)), 'RED: the phone list back on the type glyph');
  const pList = plant('taskbar.js', "export function showWindowList(app, anchor, opts = {}) {", "export function showWindowList(app, anchor, opts = {}) { const _r = (w) => w._typeIcon;");
  ok(pList && !pList.listed['taskbar.js showWindowList (the ⧉ list)'], 'RED: the ⧉ list reading the type glyph');
  const pFollow = plant('window.js', '    followListMarks(win); // a list open', '    // a list open');
  ok(pFollow && !pFollow.follows, 'RED: a late harness not followed in an open list');
  const pTitle = plant('window.js', "windowListMark(win, { className: 'window-backend-icon', listed: false })", "createModeBackendIcon(backend, win.type, { className: 'window-backend-icon' })");
  ok(pTitle && !pTitle.titleBar, 'RED: the title bar drawing its own mark (a second builder call)');
  const pSecond = plant('mobile-nav.js', 'icon.appendChild(windowListMark(win));', "icon.appendChild(windowListMark(win)); icon.appendChild(createBackendIcon('claude'));");
  ok(pSecond && !pSecond.listed['mobile-nav.js _buildWindowItem (the phone list)'], 'RED: a listed site calling a SECOND builder beside windowListMark (the acceptance)');
  const pHeld = plant('warmth-chrome.js', "type: ws.type, backend: ws.backend || (ws.openSpec && ws.openSpec.backend) || null });", 'type: ws.type });');
  ok(pHeld && !pHeld.warmth, 'RED: a held warmth row that forgets its record\'s harness');
  ok(jm.ownKey, 'windowListMark looks the harness up by OWN key; anything else draws the generic mark (the acceptance)');
  // BEHAVIOUR over the ids that broke the old lookup: the real module in Node over a minimal DOM (createElement only)
  {
    const fakeEl = () => { const e = { className: '', dataset: {}, title: '', textContent: '', innerHTML: '', children: [], attrs: {}, style: { setProperty() {} },
      setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; } };
      e.classList = { add: (...c) => { e.className = (e.className + ' ' + c.join(' ')).trim(); } }; return e; };
    const had = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
    globalThis.document = { createElement: fakeEl }; globalThis.requestAnimationFrame = () => 0;
    try {
      const AM = await import(new URL('../src/lib/agent-meta.js', import.meta.url).href);
      const odd = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 5, { x: 1 }, ['claude'], true];
      const drawn = odd.map((id) => { try { const el = AM.windowListMark({ id: 'w-odd', type: 'chat', titleMeta: { backend: id } }); return { id: String(id), cls: el.className, text: el.textContent, kids: el.children.length }; } catch (e) { return { id: String(id), threw: e.message }; } });
      ok(drawn.every((d) => !d.threw && /\bbackend-icon-generic\b/.test(d.cls) && !/undefined/.test(d.cls) && (d.text || d.kids)), `an inherited name or a non-string harness id draws the GENERIC mark — no throw, no empty box (${drawn.map((d) => d.id + ':' + (d.threw ? 'THREW' : d.cls.includes('generic') ? 'generic' : d.cls)).join(' ')})`, JSON.stringify(drawn));
      const real = AM.windowListMark({ id: 'w-c', type: 'chat', titleMeta: { backend: 'claude' } }), plain = AM.windowListMark({ id: 'w-m', type: 'chat', titleMeta: { backend: 'mystery-cli' } });
      ok(/\bbackend-icon-claude\b/.test(real.className) && /\bmode-backend-icon\b/.test(real.className) && /\bbackend-icon-generic\b/.test(plain.className) && plain.title === 'mystery-cli Chat', 'a registered harness keeps its own mark; a plain unknown name keeps its label on the generic mark', [real.className, plain.className, plain.title]);
      // RED control: the unguarded road (getBackendMeta straight) on the same ids — an empty box and a throw
      let threw = false; try { AM.getBackendMeta(5); } catch { threw = true; }
      ok(AM.getBackendMeta('constructor').iconClass === undefined && threw, 'RED control: getBackendMeta straight draws «backend-icon undefined» for an inherited name and THROWS on a number — what the own-key lookup keeps out of every list');
    } finally { globalThis.document = had.document; globalThis.requestAnimationFrame = had.raf; }
  }
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
// telemetry-client armed a 15s flush timer on the unknown-action event — exit explicitly
process.exit(fail ? 1 : 0);
