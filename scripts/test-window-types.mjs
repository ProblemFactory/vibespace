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
const CORE_TYPES = ['browser', 'chat', 'desktop', 'editor', 'files', 'hex-viewer', 'job-interact', 'jobs',
  'settings', 'stage-placeholder', 'task', 'terminal', 'usage', 'viewer', 'workflow'];
const CORE_ACTIONS = ['attachSession', 'openFileExplorer', 'openFile', 'openEditor', 'openBrowser', 'openDesktop',
  'openTaskDetail', 'openTaskLog', 'openJobs', 'openJobInteract', 'openUsage', 'openSettings', 'openSessionProps',
  'openWorkflowDetail', 'attachTmuxSession', 'viewSession', 'viewSubagent'];
// layout.js's former `TRANSIENT_WINDOW_TYPES = new Set(['chat', 'terminal', 'stage-placeholder'])`
const CORE_TRANSIENT = ['chat', 'terminal', 'stage-placeholder'];
// kinds whose opener focuses an existing window of the kind instead of opening a second
const CORE_SINGLETONS = ['desktop', 'jobs', 'settings', 'usage'];

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
    regs.push({ file, fn: m[1], type, actions, persistFalse: /\bpersist:\s*false\b/.test(body), singleton: /\bsingleton:\s*true\b/.test(body) });
  }
}
const typeRegs = regs.filter((r) => r.fn === 'registerWindowType');
const regTypes = typeRegs.map((r) => r.type);
const regActions = regs.flatMap((r) => r.actions);
ok(same(regTypes, CORE_TYPES), `core registers exactly the 15 pre-Ph1 window kinds (${regTypes.length}: ${regTypes.sort().join(' ')})`,
  'missing: ' + CORE_TYPES.filter((t) => !regTypes.includes(t)).join(',') + ' extra: ' + regTypes.filter((t) => !CORE_TYPES.includes(t)).join(','));
ok(new Set(regTypes).size === regTypes.length, 'each kind is registered exactly once');
ok(same(regActions, CORE_ACTIONS), `core registers exactly the 17 former switch cases (${regActions.length})`,
  'missing: ' + CORE_ACTIONS.filter((a) => !regActions.includes(a)).join(',') + ' extra: ' + regActions.filter((a) => !CORE_ACTIONS.includes(a)).join(','));
ok(new Set(regActions).size === regActions.length, 'each action is registered exactly once');
ok(regs.every((r) => r.type && regTypes.includes(r.type)), 'every action registration names a registered kind (registerOpenAction type ∈ kinds)');
ok(same(typeRegs.filter((r) => r.persistFalse).map((r) => r.type), CORE_TRANSIENT), "persist:false set == layout.js's former TRANSIENT_WINDOW_TYPES {chat, terminal, stage-placeholder}");
ok(same(typeRegs.filter((r) => r.singleton).map((r) => r.type), CORE_SINGLETONS), 'singleton set == the kinds whose opener focuses an existing window {desktop, jobs, settings, usage}');

// ownership: each kind registered in the module that opens it
const owner = Object.fromEntries(typeRegs.map((r) => [r.type, r.file]));
const EXPECTED_OWNER = { chat: 'session-lifecycle.js', terminal: 'session-lifecycle.js', files: 'app.js', editor: 'app.js',
  viewer: 'file-viewer.js', 'hex-viewer': 'file-viewer.js', browser: 'browser-window.js', desktop: 'desktop-window.js',
  task: 'task-detail.js', jobs: 'jobs-panel.js', 'job-interact': 'jobs-panel.js', usage: 'usage-window.js',
  settings: 'settings-ui.js', workflow: 'workflow-detail.js', 'stage-placeholder': 'stage-manager.js' };
ok(Object.entries(EXPECTED_OWNER).every(([t, f]) => owner[t] === f), 'each kind registers in its owning module',
  Object.entries(EXPECTED_OWNER).filter(([t, f]) => owner[t] !== f).map(([t, f]) => `${t}: ${owner[t]} (expected ${f})`).join('; '));
ok(regs.some((r) => r.file === 'task-log.js' && r.fn === 'registerOpenAction' && r.actions.includes('openTaskLog') && r.type === 'task')
  && regs.some((r) => r.file === 'session-props.js' && r.fn === 'registerOpenAction' && r.actions.includes('openSessionProps') && r.type === 'task'),
  "task-log / session-props attach their actions to the shared 'task' kind via registerOpenAction");
ok([...new Set(regs.map((r) => r.file))].every((f) => /from '\.\/window-types\.js'/.test(src[f])), 'every registering module imports window-types.js (a bare call is the 2.330.1 free-variable class)');

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

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
// telemetry-client armed a 15s flush timer on the unknown-action event — exit explicitly
process.exit(fail ? 1 : 0);
