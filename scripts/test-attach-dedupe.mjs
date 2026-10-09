#!/usr/bin/env node
// ONE ATTACH PER DOUBLE-CLICK (B-0cc8, lane pages-chip-groups). A double-click on a sidebar row whose conversation is not
// open called the ONE door (src/lib/session-lifecycle.js attachSession) twice: two windows, two `attach` frames, the
// second a wasted rebuild + a second answer. Now the door asks ws `_attachInFlight` (set at send, cleared at the
// `attached` / `error` answer, 15 s): an attach of that session still in flight whose window is open ⇒ the second call
// raises that window and sends NOTHING. The REAL module through esbuild (its app-level imports stubbed), a fake ws + wm:
//   ① two calls within 15 s ⇒ ONE attach frame, ONE window; the second raised the first's window
//   ② after the answer (`attached` clears the in-flight entry) and the window closed, a new call sends again; an entry
//     older than 15 s no longer holds a call back
//   ③ a session whose window already exists ⇒ focus, no frame (as before)
//   ④ CONTROL — a copy without the guard sends TWO frames (① can fail)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(REPO, 'src/lib');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + JSON.stringify(e) : '')); } };
const esbuild = (await import(pathToFileURL(path.join(REPO, 'node_modules/esbuild/lib/main.js')).href)).default;
const SRC = fs.readFileSync(path.join(LIB, 'session-lifecycle.js'), 'utf8');

// every relative import of the module → a stub exporting the names it imports (functions that do nothing)
function stubsFor(src) {
  const map = {};
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';/gm)) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    (map[m[2]] = map[m[2]] || new Set());
    for (const n of names) map[m[2]].add(n);
  }
  const out = {};
  for (const [p, names] of Object.entries(map)) out[p] = [...names].map((n) => n === 't' ? 'export const t = (s) => s;' : n === 'stripCwdHostLabel' ? 'export const stripCwdHostLabel = (c) => c;' : n === 'attachSlab' ? "export const attachSlab = () => 'floor';" : `export const ${n} = function () { return null; };`).join('\n') + '\nexport class ChatView {}\nexport class TerminalSession {}';
  return out;
}
let gen = 0;
async function load(src) {
  const STUBS = stubsFor(src);
  const r = await esbuild.build({
    stdin: { contents: `export { installSessionLifecycle } from './session-lifecycle.js'; // ${gen++}`, resolveDir: LIB, sourcefile: 'entry.js', loader: 'js' },
    bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^\.\.?\// }, (a) => (a.importer.endsWith('session-lifecycle.js') && STUBS[a.path] ? { path: a.path, namespace: 'stub' } : null));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path].replace(/export class (ChatView|TerminalSession) \{\}/g, (m, n) => (new RegExp(`export const ${n} =`).test(STUBS[a.path]) ? '' : m)), loader: 'js' }));
      b.onLoad({ filter: /session-lifecycle\.js$/ }, () => ({ contents: src, loader: 'js', resolveDir: LIB }));
    } }],
  });
  const dir = scratchDir('attach-dedupe'), f = path.join(dir, `bundle-${gen}.mjs`);
  fs.writeFileSync(f, r.outputFiles[0].text);
  try { return await import(pathToFileURL(f).href); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

globalThis.window = { innerWidth: 1200 };
globalThis.document = { createElement: () => ({ style: {}, remove() {}, set textContent(v) { this._t = v; } }) };
function rig(installSessionLifecycle) {
  class App {}
  installSessionLifecycle(App);
  const app = new App();
  const frames = [], raised = [];
  let wid = 0;
  app.ws = { _attachInFlight: new Map(), request(msg) { frames.push(msg); if (msg.type === 'attach') this._attachInFlight.set(msg.sessionId, Date.now()); return () => {}; }, attachesInFlight() { return this._attachInFlight.size; } };
  app.wm = { windows: new Map(), createWindow(o) { const w = { id: 'w' + (++wid), content: { appendChild() {} }, ...o }; this.windows.set(w.id, w); return w; }, revealWindow(id) { raised.push(id); }, restore() {} };
  app.sessions = new Map();
  app.sidebar = { isOpen: false, toggle() {} };
  app.settings = { get: () => null };
  app._hideWelcome = () => {}; app._buildTitleMeta = () => ({}); app._hostLabel = () => '';
  return { app, frames, raised };
}
const attach = (app) => app.attachSession('sess-1', 'Writer', '/home/u', { mode: 'chat', backend: 'claude', backendSessionId: 'c-1' });

console.log('— ① a double-click sends ONE attach');
const { installSessionLifecycle } = await load(SRC);
{
  const { app, frames, raised } = rig(installSessionLifecycle);
  attach(app); attach(app);
  const attaches = frames.filter((m) => m.type === 'attach');
  ok(attaches.length === 1 && app.wm.windows.size === 1, `① two calls within 15 s ⇒ ONE attach frame, ONE window (frames ${attaches.length}, windows ${app.wm.windows.size})`);
  ok(raised.length === 1 && raised[0] === [...app.wm.windows.keys()][0], '① the second call raised the window the first attach waits in', raised);

  console.log('— ② the answer ends the hold');
  app.ws._attachInFlight.delete('sess-1'); // ws.js: `attached` / `error` clears it
  app.wm.windows.clear(); // the user closed it before the view was built
  attach(app);
  ok(frames.filter((m) => m.type === 'attach').length === 2, '② after the answer and a closed window, a new call sends again');
  app.ws._attachInFlight.set('sess-1', Date.now() - 16000); // an entry older than 15 s
  attach(app);
  ok(frames.filter((m) => m.type === 'attach').length === 3, '② an in-flight entry older than 15 s holds nothing back');

  console.log('— ③ an open window is focused, as before');
  const focused = [];
  app.sessions.set('w9', { sessionId: 'sess-2', focus() { focused.push('sess-2'); } });
  const before = frames.length;
  const r = app.attachSession('sess-2', 'Other', '/home/u', { mode: 'chat' });
  ok(r === null && frames.length === before && focused.length === 1 && raised.at(-1) === 'w9', '③ a session whose window exists ⇒ focus, no frame');
}

console.log('— ④ CONTROL: the door without the guard');
{
  const guard = "    if (this._focusPendingAttach(serverId)) return null; // B-0cc8: the attach in flight IS the answer — no second frame\n";
  ok(SRC.includes(guard), '④ control anchor: the guard line is in attachSession');
  const { installSessionLifecycle: Unguarded } = await load(SRC.replace(guard, '\n'));
  const { app, frames } = rig(Unguarded);
  attach(app); attach(app);
  ok(frames.filter((m) => m.type === 'attach').length === 2 && app.wm.windows.size === 2, '④ without the guard a double-click sends TWO attach frames and builds two windows (① can fail)');
  ok(/\{ name: 'test-attach-dedupe', tier: 'fast'/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8')), '④ ci.mjs carries test-attach-dedupe in the fast tier');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
