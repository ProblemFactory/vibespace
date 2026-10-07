#!/usr/bin/env node
// THE CLI NAMES THE CONVERSATION — the chrome leg (lane session-title-chrome, 2026-10-05; heavy; follow-up of lane
// session-title-record, B-fbef). CLI 2.1.288 emits `{"type":"system","subtype":"session_title_changed","title":…}`;
// the record is known (card-less) and its title is the name ladder's middle rung (src/session-name.js: the user's
// rename › a given name › the CLI's title › the first message › …).
//
// Scene: a worktree server on a free port, a fake `claude` on CLAUDE_CMD (its transcript holds one typed user record,
// "Draft the launch post for <folder>"; a title record is emitted on its stream — and appended to its transcript —
// when the suite drops a file for it), a fake `codex` on CODEX_CMD, a desktop page 1280×900.
//   a  the fake emits the title ⇒ the sidebar row renames LIVE from its first-message name (the page never reloads),
//      the window title and its taskbar item follow, and the page draws no "Unknown event" card
//   d  a codex session on the same server (its fake prints the same title record on stdout) never carries the rung:
//      no `cliTitle` on its live row, its window never reads a title (backend-caps titleRecord null)
//   c  reload ⇒ the title stays (the live fact); a server restart ⇒ it stays (session-meta `cliTitle` → boot-restore,
//      the live row carries it); a restart with `cliTitle` deleted from the meta ⇒ the row AND the window still read it
//      while the live row carries none — the transcript's record (discovery's head/tail read) drew it; a second session
//      titled, killed and its meta deleted ⇒ its discovered row reads the transcript title, never its first message
//   b  a user rename (a real double-click on the row's name → the rename dialog, typed) wins on the row, the window and
//      the taskbar; a SECOND title record afterwards reaches the live row and still loses; a reload keeps the rename
//   e  NEGATIVE CONTROL — a patched copy of src/session-name.js with the cliTitle rung removed, bundled in place of
//      the real module: the killed session's row falls to its first message (c's transcript check is red) and a fresh
//      session's title record reaches its live row while the row keeps its first-message name (a's check is red)
// SKIPs with evidence without chrome / dtach. Free ports, scratch dirs only; no real vendor CLI is ever run.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('session-title-ui');
const MUT = mutantCopies('session-title-ui', repo);
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { } // the dtach-held fakes (cwd under ROOT) outlive the server by design
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const TITLE = 'Aria 3 发布博客', TITLE2 = 'Aria 3 launch blog, second pass', TITLE3 = 'Control run title', TITLE_B = 'Bravo quarterly numbers', RENAME = 'My launch notes';
const FIRST = (folder) => 'Draft the launch post for ' + folder;
// discovery refuses a /tmp/vs-* project dir and the e2e00000 id family (src/fixture-guard.js — a suite's throwaway
// conversation is not one), and THIS suite must be discovered: the fake files its transcript as a conversation of
// CONV/<folder> (a path that never exists — the test-record-clear-ui precedent) under its own non-fixture id, inside
// the scratch HOME only. The live session and its transcript meet on the CLI id, as a real one does.
const CONV = `/opt/session-title-ui-conv-${process.pid}`;

// THE .228 MIRROR's verdict, PURE (src/lib/keyboard-yield.js lateFocusVerdict): a focus that lands on a session window's
// server answer leaves the keys where an open app dialog holds them
{
  const { lateFocusVerdict } = await import(new URL('../src/lib/keyboard-yield.js', import.meta.url).href);
  const ov = (cls, more = {}) => ({ nodeType: 1, className: cls, isConnected: true, ...more });
  ok(lateFocusVerdict([]) === 'take', 'verdict: no dialog open ⇒ the answer takes the focus');
  ok(lateFocusVerdict([ov('dialog-overlay')]) === 'keep', 'verdict: an open dialog ⇒ the focus stays where it is');
  ok(lateFocusVerdict([ov('dialog-overlay hidden')]) === 'take', 'verdict: the static overlay closed by its class ⇒ take');
  ok(lateFocusVerdict([ov('dialog-overlay', { isConnected: false })]) === 'take', 'verdict: a removed shell ⇒ take');
  ok(lateFocusVerdict([ov('dialog-overlay hidden'), ov('dialog-overlay')]) === 'keep', 'verdict: one open among closed ones ⇒ keep');
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  fakeHome = scratchHome('session-title-ui-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'), REG = path.join(ROOT, 'reg'), EMIT = path.join(ROOT, 'emit');
  for (const d of [BIN, REG, EMIT, path.join(ROOT, 'aria'), path.join(ROOT, 'bravo'), path.join(ROOT, 'codex-room'), path.join(ROOT, 'control')]) fs.mkdirSync(d, { recursive: true });
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: '%s', hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: '%s', cwd: '%s', model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  const userLine = JSON.stringify({ type: 'user', cwd: '%s', sessionId: '%s', uuid: 'u0000000-0000-4000-8000-000000000001', timestamp: '2026-10-05T12:00:00.000Z', message: { role: 'user', content: 'Draft the launch post for %s' } });
  // the fake claude: registers its id, writes a transcript with ONE typed user record (the first-message name), prints
  // the hook + init records, then relays every file the suite drops for it to its stream AND its transcript (the CLI
  // writes the title record to both)
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh
SID="5e551000-0000-4000-8000-$(printf '%012d' $$)"
case " $* " in *" --output-format "*) ;; *) exec sleep 600;; esac
F="$(basename "$PWD")"; P="$HOME/.claude/projects/$(printf '%s' "${CONV}/$F" | sed 's#[/._]#-#g')"; mkdir -p "$P"; T="$P/$SID.jsonl"
printf '${userLine}\\n' "${CONV}/$F" "$SID" "$F" >> "$T"
: > "${REG}/$SID"
sleep 1; printf '${hookLine}\\n${initLine}\\n' "$SID" "$SID" "$PWD"
while :; do for f in "${EMIT}/$SID".*.json; do [ -f "$f" ] || continue; cat "$f"; cat "$f" >> "$T"; rm -f "$f"; done; sleep 0.2; done
`, { mode: 0o755 });
  // the fake codex: prints the very record a claude would (a harness without the record must never take it) and idles
  fs.writeFileSync(path.join(BIN, 'codex'), `#!/bin/sh\ncase " $* " in *" --version "*) echo 'codex-cli 0.0.0-fake'; exit 0;; esac\nprintf '%s\\n' '${JSON.stringify({ type: 'system', subtype: 'session_title_changed', title: TITLE, session_id: 'c0dex000-0000-4000-8000-000000000001' })}'\nexec sleep 600\n`, { mode: 0o755 });
  const emitTitle = (cliSid, title, n) => {
    const tmp = path.join(EMIT, `.${cliSid}.${n}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify({ type: 'system', subtype: 'session_title_changed', title, uuid: `t0000000-0000-4000-8000-00000000000${n}`, session_id: cliSid }) + '\n');
    fs.renameSync(tmp, path.join(EMIT, `${cliSid}.${n}.json`));
  };
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  // the WORKING tree is what is judged (a pre-commit run tests what is about to ship)
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const esbuild = require(path.join(repo, 'node_modules', 'esbuild'));
  /** The page bundle from the scratch worktree's sources (the build's own flags); `sessionName` = the file every
   *  `../session-name.js` import resolves to (the real module, or the patched copy for the control). */
  const bundle = async (sessionName, lifecycle = null) => esbuild.build({
    entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent',
    plugins: [
      ...(sessionName ? [{ name: 'session-name', setup(b) { b.onResolve({ filter: /(^|\/)session-name\.js$/ }, () => ({ path: sessionName })); } }] : []),
      ...(lifecycle ? [{ name: 'session-lifecycle', setup(b) { b.onResolve({ filter: /(^|\/)session-lifecycle\.js$/ }, () => ({ path: lifecycle })); } }] : []), // leg f's control
    ],
  });
  await bundle(null);
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), CODEX_CMD: path.join(BIN, 'codex'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '', srv = null, ws = null; const msgs = [];
  const startServer = async (tag) => {
    journal = '';
    srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
    if (!ok(await until(() => journal.includes('Ready.'), 40000), `the worktree server booted (${tag})`, journal.slice(-800))) return false;
    ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
    await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
    return true;
  };
  const stopServer = async () => { try { ws.close(); } catch { } const s = srv; s.kill('SIGTERM'); await until(() => s.exitCode !== null || s.signalCode !== null, 10000); procs.delete(s); };
  if (!(await startServer('first boot'))) return;
  const created = [];
  const create = async (reqId, backend, cwd) => {
    const before = new Set(fs.readdirSync(REG));
    ws.send(JSON.stringify({ type: 'create', backend, mode: 'chat', cwd, cols: 80, rows: 24, reqId }));
    await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000);
    const sid = msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId || null;
    if (sid) created.push(sid);
    let cli = null; if (backend === 'claude') { await until(() => fs.readdirSync(REG).some((f) => !before.has(f)), 10000); cli = fs.readdirSync(REG).find((f) => !before.has(f)) || null; }
    return { sid, cli };
  };
  const A = await create('a', 'claude', path.join(ROOT, 'aria'));
  const B = await create('b', 'claude', path.join(ROOT, 'bravo'));
  const C = await create('c', 'codex', path.join(ROOT, 'codex-room'));
  let chrome = null, cdp = null;
  try {
  if (!ok(A.sid && A.cli, 'a chat session was created on the fake claude (its CLI id registered)', journal.slice(-600))) return;
  ok(!!(B.sid && B.cli), 'a second chat session was created on the fake claude (the transcript leg)', journal.slice(-600));
  ok(!!C.sid, 'a chat session was created on the fake codex', journal.slice(-600));
  await sleep(1500);

  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  procs.add(chrome);
  let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  const pageErrors = [];
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '').slice(0, 300)); });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
  const S = JSON.stringify;
  const ev = async (js) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const chats = () => [...wm.windows.values()].filter((w) => w.type === 'chat'); const sidOf = (id) => (app.sessions.get(id) || {}).sessionId || null; const bySid = (sid) => chats().find((w) => sidOf(w.id) === sid) || null; const cardNames = () => [...document.querySelectorAll('.session-card-name')].map((e) => e.textContent.trim()); const live = (sid) => (app.sidebar._webuiSessions || []).find((r) => r.id === sid) || null; ${js} })()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
    return r.result?.result?.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // a headless page is never focused: the rename dialog's input must really hold the focus
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const boot = async () => {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 120; i++) { try { if (await ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);')) return true; } catch { } await sleep(250); }
    return false;
  };
  const open = async (sess, backend, cwd) => {
    await ev(`if (!bySid(${S(sess.sid)})) app.attachSession(${S(sess.sid)}, '', ${S(cwd)}, { mode: 'chat', backend: ${S(backend)} }); return true;`);
    return until(() => ev(`return !!bySid(${S(sess.sid)});`), 10000);
  };
  /** what the page draws for a session: its sidebar card names, the window title, its taskbar item, any unknown card */
  const view = (sess) => ev(`const w = bySid(${S(sess.sid)}); const tb = w ? [...document.querySelectorAll('.taskbar-item')].find((i) => i.title === w.title) : null; const txt = document.body.innerText;
    return { cards: cardNames(), win: w ? w.title : null, taskbar: tb ? tb.title : null, liveTitle: live(${S(sess.sid)})?.cliTitle ?? null, unknown: /unknown event|session_title_changed/i.test(txt), marker: window.__stMarker || null };`);
  if (!ok(await boot(), 'the app booted in headless chrome (desktop, 1280×900)')) return;
  await sleep(1500);
  ok(await open(A, 'claude', path.join(ROOT, 'aria')), 'the claude session window opened');
  ok(await open(C, 'codex', path.join(ROOT, 'codex-room')), 'the codex session window opened');

  console.log('\na — the CLI\'s title renames the row live');
  ok(await until(async () => (await view(A)).cards.includes(FIRST('aria')), 20000), `before the record the row carries the first-message name "${FIRST('aria')}" (discovery, the transcript)`, S(await view(A)));
  const preWin = String((await view(A)).win || '').split(' — ')[0];
  await ev(`window.__stMarker = 'no-reload'; return true;`);
  emitTitle(A.cli, TITLE, 1);
  const got = await until(async () => (await view(A)).cards.includes(TITLE), 15000);
  let v = await view(A);
  ok(got, `the sidebar row renamed live to "${TITLE}"`, S(v));
  ok(!v.cards.includes(FIRST('aria')), 'the first-message name is gone from the sidebar', S(v.cards));
  ok(preWin !== TITLE && !String(v.win || '').startsWith(preWin + ' — '), `the window left its pre-title name "${preWin}"`, S([preWin, v.win]));
  ok(v.marker === 'no-reload', 'the page never reloaded (the marker survives)', S(v));
  await until(async () => String((await view(A)).win || '').startsWith(TITLE), 8000);
  v = await view(A);
  ok(String(v.win || '').startsWith(TITLE + ' — '), 'the window title follows', S(v.win));
  ok(String(v.taskbar || '').startsWith(TITLE), 'the taskbar item follows', S(v.taskbar));
  ok(v.liveTitle === TITLE, 'the live row carries cliTitle', S(v.liveTitle));
  ok(!v.unknown, 'no "Unknown event" card (and no raw subtype) anywhere on the page', S(v));
  emitTitle(B.cli, TITLE_B, 4);
  ok(await until(async () => (await view(B)).liveTitle === TITLE_B, 15000), 'the second session\'s title reaches its live row too', S(await view(B)));

  console.log('\nd — a codex session never carries the rung');
  const cv = await view(C);
  const cRow = await ev(`const r = live(${S(C.sid)}); return r ? { has: Object.prototype.hasOwnProperty.call(r, 'cliTitle'), v: r.cliTitle ?? null, backend: r.backend } : null;`);
  ok(!!cRow && cRow.backend === 'codex', 'the codex session is on the live list', S(cRow));
  ok(!!cRow && cRow.v === null, 'its live row carries no cliTitle (its fake printed the record on stdout)', S(cRow));
  ok(cv.win !== null && !String(cv.win).startsWith(TITLE) && !String(cv.win).startsWith(TITLE2), 'its window title never reads a title', S(cv.win));
  ok(cv.cards.filter((n) => n === TITLE).length === 1, 'no other sidebar row reads the title (the codex row has none)', S(cv.cards));

  console.log('\nc — the title persists');
  if (!ok(await boot(), 'reload: the app booted again')) return;
  await open(A, 'claude', path.join(ROOT, 'aria'));
  ok(await until(async () => (await view(A)).cards.includes(TITLE), 15000), 'reload ⇒ the row still reads the title (the live fact)', S(await view(A)));
  await stopServer();
  const META = path.join(wt, 'data', 'session-meta');
  const metaWith = (title) => (fs.existsSync(META) ? fs.readdirSync(META) : []).filter((f) => f.endsWith('.json')).map((f) => path.join(META, f)).filter((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).cliTitle === title; } catch { return false; } });
  const metaFiles = metaWith(TITLE);
  ok(metaFiles.length === 1, 'the session-meta carries cliTitle on disk: ' + metaFiles.map((f) => path.relative(ROOT, f)).join(', '));
  if (!(await startServer('restart: meta rung'))) return;
  if (!ok(await boot(), 'restart: the app booted')) return;
  await open(A, 'claude', path.join(ROOT, 'aria'));
  ok(await until(async () => (await view(A)).cards.includes(TITLE), 20000), 'restart ⇒ the row still reads the title', S(await view(A)));
  ok((await view(A)).liveTitle === TITLE, 'restart ⇒ the live row carries cliTitle (boot-restore from the meta)', S(await view(A)));
  await stopServer();
  for (const f of metaFiles) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); delete j.cliTitle; fs.writeFileSync(f, JSON.stringify(j)); }
  if (!(await startServer('restart: meta deleted'))) return;
  if (!ok(await boot(), 'restart with cliTitle deleted from the meta: the app booted')) return;
  await open(A, 'claude', path.join(ROOT, 'aria'));
  ok(await until(async () => (await view(A)).cards.includes(TITLE), 20000), 'meta deleted ⇒ the row still reads the title', S(await view(A)));
  v = await view(A);
  ok(v.liveTitle === null, 'meta deleted ⇒ the live row has no cliTitle, so the transcript\'s record drew it (discovery\'s head/tail read)', S(v));
  await until(async () => String((await view(A)).win || '').startsWith(TITLE), 8000);
  ok(String((await view(A)).win || '').startsWith(TITLE + ' — '), 'meta deleted ⇒ the window title reads the transcript title too', S((await view(A)).win));

  // the transcript rung alone: the second session killed and its meta deleted ⇒ a discovered row, named by the newest
  // title in its transcript (discovery's head/tail read), never its first message
  ws.send(JSON.stringify({ type: 'kill', sessionId: B.sid }));
  ok(await until(() => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === B.sid), 8000), 'the second session was killed');
  await sleep(500); // the kill settles its meta writes
  for (const f of metaWith(TITLE_B)) fs.unlinkSync(f);
  ok(metaWith(TITLE_B).length === 0, 'its session-meta is gone');
  if (!ok(await boot(), 'reload after the kill: the app booted')) return;
  ok(await until(async () => (await view(A)).cards.includes(TITLE_B), 20000), `the killed session's discovered row reads its transcript title "${TITLE_B}"`, S(await view(A)));
  ok(!(await view(A)).cards.includes(FIRST('bravo')), `…not its first message "${FIRST('bravo')}"`, S((await view(A)).cards));

  /** THE .228 MIRROR, made deterministic. A double-click on a row's name ATTACHES its session (an `attach` per click)
   *  and opens the Rename dialog; the attach's answer moved the focus to the chat composer whenever it landed after the
   *  dialog had focused its box — on the slow Actions runner it did, and the new name + its Enter went to the composer
   *  (the rename never happened). Here the page's inbound stream is HELD from the press until the dialog's OWN focus is
   *  on its box (the suite never hand-focuses it), then released in order: the answers land late, on purpose. */
  const renameRace = async (sess, name) => {
    await ev(`app.sidebar.toggle(true); return true;`); // the desktop boots with the sidebar folded to its rail
    await until(() => ev(`const e = [...document.querySelectorAll('.session-card-name')].find((n) => n.textContent.trim() === ${S(name)}); return !!e && e.getBoundingClientRect().width > 0;`), 5000);
    await sleep(400); // the open transition
    const at = await ev(`const e = [...document.querySelectorAll('.session-card-name')].find((n) => n.textContent.trim() === ${S(name)}); if (!e || !e.getBoundingClientRect().width) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    if (!at) return { at };
    await ev(`const raw = app.ws.ws, orig = raw.onmessage, q = []; raw.onmessage = (e) => { q.push(e); };
      window.__vsHold = { release: () => { raw.onmessage = orig; window.__vsHold = null; let attached = 0, errors = 0;
        for (const e of q) { try { const m = JSON.parse(e.data); if (m.type === 'attached' && m.sessionId === ${S(sess.sid)}) attached++; } catch { } try { orig.call(raw, e); } catch { errors++; } }
        return { held: q.length, attached, errors }; } }; return true;`);
    for (const [type, clickCount] of [['mousePressed', 1], ['mouseReleased', 1], ['mousePressed', 2], ['mouseReleased', 2]]) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount });
    const dlg = await until(() => ev(`return [...document.querySelectorAll('input')].some((i) => i.value === ${S(name)} && i.offsetParent);`), 5000);
    const own = dlg && await until(() => ev(`const a = document.activeElement; return !!a && a.tagName === 'INPUT' && a.value === ${S(name)};`), 5000);
    await sleep(300); // the answers the server already sent wait in the hold
    const rel = await ev(`return window.__vsHold ? window.__vsHold.release() : null;`);
    const after = await ev(`const a = document.activeElement; return a ? [a.tagName, String(a.className || '').slice(0, 40), a.value ?? null] : null;`);
    const wins = await ev(`return chats().filter((w) => sidOf(w.id) === ${S(sess.sid)}).length;`);
    return { at, dlg, own, rel, after, wins };
  };

  console.log('\nb — the user\'s rename wins');
  const race = await renameRace(A, TITLE);
  if (!ok(!!race.at, 'the titled row\'s name is on screen')) return;
  if (!ok(race.dlg, 'a double-click on the name opens the rename dialog holding the title', S(race))) return;
  ok(race.own, 'the dialog focused its own box (the suite never hand-focuses it)', S(race));
  ok(race.rel?.attached >= 1 && !race.rel.errors, 'the held inbound stream carried the session\'s attach answer, delivered AFTER the dialog took the keys', S(race.rel));
  ok(race.after?.[0] === 'INPUT' && race.after?.[2] === TITLE, 'THE .228 MIRROR: the late attach answer leaves the keys in the Rename dialog, not the chat composer', S(race.after));
  await send('Input.insertText', { text: RENAME });
  const typed = await ev(`const a = document.activeElement; return a ? [a.tagName, a.value] : null;`);
  ok(Array.isArray(typed) && typed[0] === 'INPUT' && typed[1] === RENAME, 'the new name is typed into the focused dialog input', S(typed));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  ok(await until(async () => (await view(A)).cards.includes(RENAME), 8000), `the rename "${RENAME}" draws on the row`, S(await view(A)));
  ok(await until(async () => String((await view(A)).win || '').startsWith(RENAME + ' — '), 8000), 'the window title follows the rename', S((await view(A)).win));
  emitTitle(A.cli, TITLE2, 2);
  ok(await until(async () => (await view(A)).liveTitle === TITLE2, 15000), 'a second title record reaches the live row', S(await view(A)));
  await sleep(800);
  v = await view(A);
  ok(v.cards.includes(RENAME) && !v.cards.includes(TITLE2) && !v.cards.includes(TITLE), 'the rename still wins on the row after the second title', S(v.cards));
  ok(String(v.win || '').startsWith(RENAME + ' — ') && String(v.taskbar || '').startsWith(RENAME), 'the window title and the taskbar keep the rename', S([v.win, v.taskbar]));
  if (!ok(await boot(), 'reload after the rename: the app booted')) return;
  await open(A, 'claude', path.join(ROOT, 'aria'));
  ok(await until(async () => (await view(A)).cards.includes(RENAME), 15000), 'reload ⇒ the rename stays', S(await view(A)));

  console.log('\ne — NEGATIVE CONTROL: the cliTitle rung removed');
  {
    const src = fs.readFileSync(path.join(repo, 'src/session-name.js'), 'utf8');
    const rung = "return s.cliTitle || '';";
    if (!ok(src.includes(rung), 'the ladder\'s cliTitle rung is where the control cuts')) return;
    // the page bundle takes an ESM rendering of the copy (a CJS copy carries mutant-copy's createRequire prologue — node only)
    const cjsTail = 'module.exports = { sessionDisplayName, sessionGivenName };';
    if (!ok(src.includes(cjsTail), 'the module ends in the export line the ESM rendering swaps')) return;
    const mut = MUT.write(path.join(repo, 'src/session-name.js'), src.replace("'use strict';", '').replace(rung, "return ''; // NEGATIVE CONTROL: no CLI-title rung").replace(cjsTail, 'export { sessionDisplayName, sessionGivenName };'), 'no-cli-title', { esm: true });
    await bundle(mut);
    const K = await create('k', 'claude', path.join(ROOT, 'control'));
    if (!ok(K.sid && K.cli, 'a control session was created on the fake claude')) return;
    pageErrors.length = 0;
    if (!ok(await boot(), 'control: the app booted on the patched bundle', S(pageErrors))) return;
    ok(await until(async () => (await view(A)).cards.includes(FIRST('bravo')), 20000), `CONTROL: the killed session's row falls to its first message "${FIRST('bravo')}" (the transcript check is red)`, S((await view(A)).cards));
    ok(!(await view(A)).cards.includes(TITLE_B), 'CONTROL: …its transcript title is drawn nowhere', S((await view(A)).cards));
    await open(K, 'claude', path.join(ROOT, 'control'));
    await until(async () => (await view(K)).cards.includes(FIRST('control')), 20000);
    emitTitle(K.cli, TITLE3, 3);
    ok(await until(async () => (await view(K)).liveTitle === TITLE3, 15000), 'CONTROL: the title record reaches the live row', S(await view(K)));
    await sleep(1500);
    const kv = await view(K);
    ok(kv.cards.includes(FIRST('control')) && !kv.cards.includes(TITLE3), `CONTROL: the live row keeps its first-message name "${FIRST('control')}" (leg a's check is red)`, S(kv.cards));
    ok(!String(kv.win || '').startsWith(TITLE3), 'CONTROL: …and the window title never reads the title', S(kv.win));
    await bundle(null);
  }

  console.log('\nf — NEGATIVE CONTROL: the answer\'s focus without its dialog guard (THE .228 MIRROR)');
  {
    const src = fs.readFileSync(path.join(repo, 'src/lib/session-lifecycle.js'), 'utf8');
    const guard = "const lateFocus = (view) => { if (lateFocusVerdict(document.querySelectorAll('.dialog-overlay')) === 'take') view.focus(); };";
    if (!ok(src.includes(guard), 'the answer sites\' focus guard is where the control cuts')) return;
    // the copy lives outside the tree: its relative imports name the scratch worktree's modules (the bundle's own sources)
    const cut = src.replace(guard, 'const lateFocus = (view) => view.focus(); // NEGATIVE CONTROL: the answer takes the keys whatever holds them')
      .replace(/from '\.\/([^']+)'/g, (m, f) => `from ${S(path.join(wt, 'src/lib', f))}`).replace(/from '\.\.\/([^']+)'/g, (m, f) => `from ${S(path.join(wt, 'src', f))}`);
    await bundle(null, MUT.write(path.join(repo, 'src/lib/session-lifecycle.js'), cut, 'no-late-focus-guard', { esm: true }));
    pageErrors.length = 0;
    if (!ok(await boot(), 'control: the app booted on the guard-less bundle', S(pageErrors))) return;
    const cr = await renameRace(A, RENAME); // a fresh boot, as leg b's: the double-click's clicks attach the session
    ok(cr.dlg && cr.own && cr.rel?.attached >= 1, 'CONTROL: the same race ran (dialog up and focused, the attach answer held past it)', S(cr));
    ok(cr.after?.[0] === 'TEXTAREA', 'CONTROL: the late answer takes the keys to the chat composer — the mirror\'s red (the new leg b check is red)', S(cr.after));
    await bundle(null);
  }
  } finally {
    try { cdp?.close(); } catch { }
    try { chrome?.kill('SIGKILL'); } catch { }
    for (const sid of created) { try { ws.send(JSON.stringify({ type: 'kill', sessionId: sid })); } catch { } }
    await until(() => created.every((sid) => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid)), 8000);
    try { ws.close(); } catch { }
  }
})();

console.log('\ntree: the patched copy never touches the tree');
if (MUT.files.length) for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`${fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`}`);
cleanup();
process.exit(fail ? 1 : 0);
