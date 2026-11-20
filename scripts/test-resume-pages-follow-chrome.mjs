#!/usr/bin/env node
// THE PAGES FOLLOW A RESUME NOBODY PRESSED, SEEN (the manager design's piece 4, 主开发 2026-11-17 — the heavy leg the design names).
// A worktree server of this tree (esbuild bundle) boots on two desktops — Desk 1 (a files window) and Desk 2 (one ENDED conversation's
// window, row e-1, at its box; its transcript on disk) — with a stub claude behind the real chat wrapper (it echoes --resume's id).
// A coordinator conversation holds an automation key with conversations.resume (reach: this instance). Headless chrome over raw CDP:
// page A (1440×900) stays on Desk 1, page B (1440×900) visits Desk 2 (e-1 built as a read-only view of the ended conversation).
//   ① CONTROL — the follow OFF on page B (`app._followResumed` answers 0): the key resumes the conversation (the hub lists it live)
//      and B's window stays on «Session is read-only.»; the key ends it again
//   ② the follow ON: the key resumes it — B's window e-1 is LIVE under the same row id and box on Desk 2, B did not switch, ONE window
//      of the conversation on B; QUIET (the cure round's must 3): B's focused element, its active window (the person works in f-2,
//      above e-1) and its stacking order are the SAME before and after; a THIRD page C, which built e-1 on Desk 2 and went back to
//      Desk 1, follows too (live there, hidden, one window, no switch); A did not switch and made no window. THE FRAMES END AND
//      NOTHING IS LOST (place-14, 2.369.413's proof run: B and C follow one broadcast and write from one base; when the writes tie the
//      hub keeps one and refuses the other as stale, and the refused page adopts and sends once more): THE TIE IS MADE — B's and C's
//      first frames held and released together — and judged by followLaw (exactly one stale refusal, one frame more from the refused
//      page, none after the settle, none from A, the record's windows kept, no «disagree» toast, the journal's line N → N), with two
//      CONTROLS that are red (a page sending on and on; a window lost at the refusal)
//   ②b THE UNTIED CASE IS MADE TOO: ended again; at the next resume C hears of it only after the hub kept B's record and C saw it —
//      NO refusal; the same law. B follows live; C (its read-only e-1 closed by the product's re-key when it saw the record) holds no
//      read-only view and stays on Desk 1, and a visit to Desk 2 builds e-1 LIVE in its row from the record (one window)
//   ③ page A reloads and visits Desk 2: e-1 is live in place (the hub's record carries the live session — the last resume's)
//   the journal: no refusal but stale ones of Desk 2, each N → N — one in the made tie, none in the untied pass
// dtach missing is a RED, never a green skip (the socket tool is what the sessions run in).
// Screenshots go to $RPF_SHOTS_DIR when set, else nowhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, ONBOARDED_SOURCE, vncEnv, stillPresser, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (§57c, B-cdb2): the tree, the home, the stub and Chrome's profile live in its root
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const J = JSON.stringify;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// ONE minted root (hub-boot rules 1, 9), before anything of the suite exists: at exit — or at a signal — the helper ends the hub and
// everything rooted here (the CLIs, the chat wrapper's dtach sessions and Chrome all carry the root's HOME), removes the worktree
// through git, then the root
const ROOT = mintRoot('rpf-ui');
const SHOTS = process.env.RPF_SHOTS_DIR ? path.resolve(process.env.RPF_SHOTS_DIR) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const procs = new Set(); let fakeHome = null, hub = null; const sockets = new Set();
// the conversations' folder: OUTSIDE /tmp/vs-* — session discovery skips every scratch() cwd and every minted root (src/fixture-guard.js),
// and a resume needs its folder to exist. It is not a root the helper ends (rule 2: what runs in it carries the root's HOME — the
// hub's CLIs are ended by it); the suite removes it itself, after the helper's end. (B-cdb2's second shape: nothing bent.) A resume
// needs its folder to exist
const CONV = fs.mkdtempSync(path.join(os.tmpdir(), 'rpf-conv-'));
/** the suite's own end, registered AFTER the mint (so it runs after the helper's end, at exit and at a signal alike — no signal line of
 *  this suite's own, hub-boot rule 3): its sockets, Chrome by its handle (a no-op by then), the hub by its identity, and the
 *  conversations' folder outside the root */
function cleanup() {
  for (const s of sockets) { try { s.close(); } catch { } }
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  if (hub) { try { hub.stop(); } catch { } }
  try { fs.rmSync(CONV, { recursive: true, force: true }); } catch { }
}
process.on('exit', cleanup);

// ── the record (invented words and ids) ──
const CID = 'c0ffee31-0000-4000-8000-000000000031';
const GB = { left: 0.3, top: 0.2, width: 0.4, height: 0.5 };
const META = [{ id: 'desk-1', name: 'Desk 1' }, { id: 'desk-2', name: 'Desk 2' }];
const SECOND = 'pages follow leg second password';

// THE FOLLOWERS' LAW (主开发 2026-11-20 07:55Z, place-14 — 2.369.413's proof run: one broadcast reaches B and C together, each follower
// owes Desk 2 its own record from the same base, and when the two writes tie the hub's staleness gate keeps the first and refuses the
// second «from an older base»; the refused page adopts and sends once more, then nothing — a person sees nothing). The frames END and
// nothing is lost. PURE: one pass's facts → { ok, why: [each broken rule, by name] }. `made` = 'tie' (B's and C's first frames held and
// released together: exactly ONE stale refusal) | 'untied' (C hears of the resume only after the hub kept B's record and C saw it: none).
// `pages` = { B, C } each { sends, refused: [reason, …], sendsLater, refusedLater } (later = after the settle); `A` = A's sends;
// `rec0` / `rec1` = the hub's Desk 2 record before / after ({ n, e1Session }); `session` = the resumed session; `toasts` = the pages'
// «disagree» toasts; `journal` = the hub's REFUSED lines of this pass.
const STALE_LINE = /\[layout-sync\] REFUSED a (?:phone |desktop )?record of desktop "Desk 2" \(desk-2\): written from an older base \([^)]*\) — (\d+) → (\d+) windows; the sender adopts the record kept/;
const followLaw = ({ made, pages, A, rec0, rec1, session, toasts, journal, settled }) => {
  const why = [];
  const stale = (pg) => pg.refused.filter((r) => r === 'stale').length;
  if (A !== 0) why.push(`page A sent ${A} frame(s) — it holds no row of the conversation`);
  if (settled === false) why.push('the frames never went quiet for 2.5 s within 25 s — they did not end');
  for (const [k, pg] of Object.entries(pages)) {
    if (pg.tapped === false) why.push(`page ${k}'s socket was replaced (a reconnect) — its refusals were no longer counted`);
    if (pg.refused.some((r) => r !== 'stale')) why.push(`page ${k} was refused for another reason: ${pg.refused.filter((r) => r !== 'stale').join(', ')}`);
    if (pg.refused.length > 1) why.push(`page ${k} was refused ${pg.refused.length} times in one resume — a second refusal of the same record (the breaker's «disagree»)`);
    if (pg.sends > 1 + stale(pg)) why.push(`page ${k} sent ${pg.sends} frames for ${stale(pg)} stale refusal(s) — at most one, plus one more per stale refusal it received`);
    if (pg.sendsLater !== pg.sends) why.push(`page ${k} sent ${pg.sendsLater - pg.sends} frame(s) after the settle — the frames never ended (a ping-pong)`);
    if (pg.refusedLater !== pg.refused.length) why.push(`page ${k} was refused after the settle`);
  }
  const total = Object.values(pages).reduce((n, pg) => n + stale(pg), 0);
  if (made === 'tie') {
    if (total !== 1) why.push(`the made tie gave ${total} stale refusal(s) — exactly ONE is owed (two writes from one base: the second is refused)`);
    const refused = Object.entries(pages).filter(([, pg]) => stale(pg) === 1);
    if (refused.length === 1 && refused[0][1].sends !== 2) why.push(`the refused page ${refused[0][0]} sent ${refused[0][1].sends} frame(s) — its first and ONE more from the record it adopted`);
    for (const [k, pg] of Object.entries(pages)) if (!stale(pg) && pg.sends !== 1) why.push(`the kept page ${k} sent ${pg.sends} frame(s) — exactly its one`);
  } else if (total !== 0) why.push(`the untied pass gave ${total} stale refusal(s) — none is owed when a page writes after it saw the other's record`);
  if (!rec0 || !rec1 || rec1.n !== rec0.n) why.push(`the hub's record of Desk 2 went from ${rec0 && rec0.n} to ${rec1 && rec1.n} windows — a window lost`);
  if (!rec1 || rec1.e1Session !== session) why.push(`the hub's record of Desk 2 holds e-1 on ${rec1 && rec1.e1Session}, not the resumed session ${session}`);
  for (const [k, n] of Object.entries(toasts || {})) if (n) why.push(`page ${k} shows a «disagree» toast`);
  const lines = journal || [];
  for (const l of lines) { const m = STALE_LINE.exec(l); if (!m) why.push(`the journal holds a refusal that is not a stale one of Desk 2: ${l.slice(0, 200)}`); else if (m[1] !== m[2]) why.push(`the journal's stale line reads ${m[1]} → ${m[2]} windows — a window lost at the refusal`); }
  if (lines.length !== total) why.push(`the journal holds ${lines.length} refusal line(s) for ${total} stale refusal(s) the pages received`);
  return { ok: why.length === 0, why };
};

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) ok(false, 'dtach is NOT installed — this suite cannot run its sessions here: a red, never a green skip');
else await (async () => {
  fakeHome = path.join(ROOT, 'home'); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });   // the HOME in the root (rules 2, 9)
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'), STUB = path.join(ROOT, 'stub'); for (const d of [BIN, STUB]) fs.mkdirSync(d, { recursive: true });
  // a stub claude behind the real chat wrapper: it announces ITS conversation id (a resumed run echoes --resume's id), records its
  // token, and logs every stdin line by id (the resume sends it nothing — test-conversation-resume proves that in process)
  // THE STAND-IN STATES A VERSION THE VERDICT CAN JUDGE (主开发 2026-11-20 03:16Z — 2.369.413's second hosted run: every end by the
  // grant answered subject_busy): a CLI below the measured span (src/conversation-facts.js LEVEL_MEASURED_FROM…LEVEL_MEASURED_TO) has
  // unknown background tasks and is not ended without force — the product is right. The stand-in states the span's own TOP, READ from
  // the module, never typed, so the next move of the floor cannot strand it (its --version answer and its init record alike).
  const CLI_V = require(path.join(repo, 'src/conversation-facts.js')).LEVEL_MEASURED_TO;
  fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log(${J(CLI_V)} + ' (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const sid = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : require('crypto').randomUUID();
fs.writeFileSync(${J(STUB)} + '/env-' + process.pid + '.json', JSON.stringify({ sid, args, token: process.env.VIBESPACE_SESSION_TOKEN || null }));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: sid, model: 'claude-fable-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: ${J(CLI_V)} }) + '\\n');
let b = ''; process.stdin.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) >= 0) { const l = b.slice(0, i); b = b.slice(i + 1); if (l.trim()) fs.appendFileSync(${J(STUB)} + '/stdin-' + sid + '.ndjson', l + '\\n'); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });   // the root's ONE worktree (rule 1; the helper removes it through git)
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const version = JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(version)};\n`);
  const esbuild = require('esbuild');
  await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent' });
  ok(fs.statSync(path.join(wt, 'public/bundle.js')).size > 500000, 'the worktree built its own bundle (esbuild JS API)');

  // the ENDED conversation: its transcript under the scratch HOME (discovery lists it stopped), its row e-1 on Desk 2
  const cwd = path.join(CONV, 'atlas'), coordCwd = path.join(CONV, 'coord');
  for (const d of [cwd, coordCwd]) fs.mkdirSync(d, { recursive: true });
  const proj = path.join(fakeHome, '.claude', 'projects', cwd.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, CID + '.jsonl'), [
    J({ type: 'user', cwd, sessionId: CID, uuid: 'u0000031-0000-4000-8000-000000000001', timestamp: '2026-11-16T10:00:00.000Z', message: { role: 'user', content: 'Atlas notes' } }),
    J({ type: 'assistant', cwd, sessionId: CID, uuid: 'a0000031-0000-4000-8000-000000000001', parentUuid: 'u0000031-0000-4000-8000-000000000001', timestamp: '2026-11-16T10:00:05.000Z', message: { id: 'msg_31', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'noted' }], usage: { input_tokens: 1, output_tokens: 1 } } }),
  ].join('\n') + '\n');
  const filesDir = path.join(ROOT, 'files'); fs.mkdirSync(filesDir, { recursive: true });
  const layouts = { current: null, autoSave: null, saved: {}, customGrids: [], desktopMeta: META.map((m) => ({ ...m })), desktops: {
    'desk-1': { autoSave: { windows: [{ winId: 'f-1', title: 'files', type: 'files', isMinimized: false, isMaximized: false, gridBounds: { left: 0.05, top: 0.05, width: 0.4, height: 0.4 }, zIndex: 50, openSpec: { action: 'openFileExplorer', path: filesDir }, explorerPath: filesDir }], grid: null, updatedAt: 1000 } },
    'desk-2': { autoSave: { windows: [{ winId: 'e-1', title: `Atlas notes — ${cwd}`, type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB, zIndex: 100, backend: 'claude', backendSessionId: CID, claudeSessionId: CID, cwd, serverSessionId: 'sess-1-31000' },
      { winId: 'f-2', title: 'files 2', type: 'files', isMinimized: false, isMaximized: false, gridBounds: { left: 0.5, top: 0.3, width: 0.45, height: 0.5 }, zIndex: 150, openSpec: { action: 'openFileExplorer', path: filesDir }, explorerPath: filesDir }], grid: null, updatedAt: 1000 } } } };
  fs.rmSync(path.join(wt, 'data'), { recursive: true, force: true }); fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  execFileSync('cp', ['-r', path.join(repo, 'data', 'bin'), path.join(wt, 'data', 'bin')]); // the tracked wrappers — without them every session dies at birth
  fs.writeFileSync(path.join(wt, 'data', 'layouts.json'), J(layouts, null, 1));
  // the hub's journal = its log through the helper (hub.log(): what THIS start wrote, stdout and stderr in one file, as the pipes held it)
  hub = startHub({ root: ROOT, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1', VIBESPACE_PASSWORD: '' } });
  const journal = () => hub.log();
  if (!ok(await until(() => journal().includes('Ready.'), 60000, 100), 'the worktree server booted', journal().slice(-800))) return;

  /** ONE request — a PERSON on the page (Sec-Fetch-Site same-origin) */
  const req = (method, p, body) => new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(J(body));
    const r = http.request(`${BASE}${p}`, { method, headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', Origin: BASE, ...(data ? { 'Content-Length': data.length } : {}) } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, json: j }); }); });
    r.on('error', (e) => resolve({ status: 0, json: { error: e.message } }));
    if (data) r.write(data); r.end();
  });
  const cli = (args, token) => new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-api'), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: BASE, VIBESPACE_SESSION_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => { let json = null; try { json = JSON.parse(out); } catch { } resolve({ code, out, err, json }); });
  });
  const stubs = () => fs.readdirSync(STUB).filter((x) => x.startsWith('env-')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(STUB, f), 'utf8')); } catch { return null; } }).filter(Boolean);
  const liveOf = async () => (((await req('GET', '/api/active')).json || {}).sessions || []).filter((s) => s.backendSessionId === CID || s.claudeSessionId === CID);

  // ── the coordinator: a live conversation through the real create path, the vault, a key with resume + end, reach: this instance ──
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); sockets.add(ws);
  await new Promise((r) => ws.on('open', r));
  const frames = []; ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  ws.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: coordCwd, reqId: 'rpf-coord', sessionName: 'coordinator' }));
  await until(() => frames.some((m) => m && m.type === 'created' && m.reqId === 'rpf-coord'), 20000, 200);
  let coord = null; await until(() => { coord = stubs().find((x) => x.token && x.sid !== CID) || null; return !!coord; }, 20000, 200);
  const su = await req('POST', '/api/vault/setup', { password: SECOND });
  const mk = await req('POST', '/api/automation/keys', { name: 'manager', scopes: ['conversations.resume', 'conversations.end'] });
  const KEY = mk.json && mk.json.key && mk.json.key.id;
  const gt = KEY && coord && await req('POST', `/api/automation/keys/${KEY}/grants`, { subjects: [`session:${coord.sid}`] });
  const list = (await req('GET', '/api/automation/keys')).json;
  const grant = list && KEY && list.keys.find((k) => k.id === KEY).grants.find((g) => coord && g.subject === `session:${coord.sid}`);
  const widen = grant && await req('POST', `/api/automation/grants/${grant.id}/reach`, { reach: 'instance' });
  if (!ok(!!coord && su.status === 200 && /^ak-/.test(String(KEY)) && gt && gt.status === 200 && widen && widen.status === 200, 'the coordinator is live with its own token; the vault set up; a key with conversations.resume + end granted to it, reach: this instance', { coord: !!coord, su: su.status, KEY, gt: gt && gt.status, widen: widen && widen.status })) return;

  // ── headless chrome over raw CDP ──
  const CDP = await freePort();
  const xdg = fs.mkdtempSync(path.join(ROOT, 'xdg-')); fs.chmodSync(xdg, 0o700);
  const ch = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--password-store=basic', '--window-size=1440,900', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore', env: { PATH: process.env.PATH, HOME: fakeHome, XDG_RUNTIME_DIR: xdg } });
  procs.add(ch);
  const pages = async () => { try { return (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter((t) => t.type === 'page'); } catch { return []; } };
  let first = null; for (let i = 0; i < 120 && !first; i++) { first = (await pages())[0]; if (!first) await sleep(250); }
  if (!ok(!!first, 'chrome exposed a CDP page target')) return;
  const client = async (wsUrl) => {
    const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 }); sockets.add(sock);
    await new Promise((r, e) => { sock.on('open', r); sock.on('error', e); });
    let seq = 0; const pend = new Map();
    sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(J({ id, method, params })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); } catch {}` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const X = { send, ev };
    X.boot = async (nav = true) => {
      if (nav) await send('Page.navigate', { url: `${BASE}/` });
      const up = await until(async () => { try { return await ev('!!(window.app && window.app.desktopManager && window.app.desktopManager.activeDesktopId)'); } catch { return false; } }, 30000, 200);
      if (up) await ev('window.app.ready');
      // every layout-sync this page sends, counted (its desktop, when)
      // (+ place-14: the tie and the untied case are MADE, never waited for — `__holdOut` = a desktop whose FIRST frame this page holds until
      // `__releaseOut()`; `__holdIn` = this page's live list (`active-sessions`) held until `__releaseIn()`: it hears of a resume later; every
      // refusal it RECEIVES is counted beside its sends — [desktop, reason, when, the kept record's windows])
      if (up) await ev(`(() => { window.__syncs = []; window.__refused = []; window.__holdOut = null; window.__heldOut = []; window.__holdIn = false; window.__heldIn = [];
        const ws = app.ws, s = ws.send.bind(ws);
        ws.send = function (m) { if (m && m.type === 'layout-sync') { if (window.__holdOut && m.desktopId === window.__holdOut && !window.__heldOut.length) { window.__heldOut.push(m); return; } window.__syncs.push([m.desktopId || null, Date.now()]); } return s(m); };
        window.__releaseOut = () => { const q = window.__heldOut.splice(0); window.__holdOut = null; for (const m of q) { window.__syncs.push([m.desktopId || null, Date.now()]); s(m); } return q.length; };
        const raw = ws.ws, on = raw.onmessage; raw.__vsTapped = true;
        raw.onmessage = function (e) { let d = null; try { d = JSON.parse(e.data); } catch { } if (d && d.type === 'layout-sync-refused') window.__refused.push([d.desktopId || null, d.reason || null, Date.now(), d.state && Array.isArray(d.state.windows) ? d.state.windows.length : null]); if (d && d.type === 'active-sessions' && window.__holdIn) { window.__heldIn.push(e); return; } return on.call(this, e); };
        window.__releaseIn = () => { window.__holdIn = false; const q = window.__heldIn.splice(0); for (const e of q) on.call(raw, e); return q.length; };
        return true; })()`);
      return up;
    };
    X.shot = async (name) => { if (!SHOTS) return null; await sleep(300); const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(SHOTS, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
    // every press through THE still door (scripts/scratch.mjs stillPresser — test-still-press): pressed only where the target stands still and is the element under the point
    const still = stillPresser({ evalJs: ev, cdp: send });
    X.click = (expr) => still(`JS:${expr}`, { click: 'any' });
    return X;
  };
  const newPage = async () => { const { targetId } = await PB.send('Target.createTarget', { url: 'about:blank', newWindow: true }); let pt = null; for (let i = 0; i < 40 && !pt; i++) { pt = (await pages()).find((t) => t.id === targetId); if (!pt) await sleep(150); } return pt ? client(pt.webSocketDebuggerUrl) : null; };
  const PB = await client(first.webSocketDebuggerUrl);
  const VIEW = `(() => { const w = app.wm.windows.get('e-1'), v = app.sessions.get('e-1'); return w ? { id: w.id, desk: w._desktopId, gb: w.gridBounds ? JSON.stringify(w.gridBounds) : null, readOnly: !!(v && v._readOnly), live: !!(v && v.sessionId && !v._readOnly), sid: (v && v.sessionId) || null, note: /Session is read-only\\./.test(w.element.textContent) } : null; })()`;
  const OF_CONV = `[...app.wm.windows.values()].filter((w) => (w._openSpec && w._openSpec.backendSessionId === ${J(CID)}) || (w._conversation && w._conversation.backendSessionId === ${J(CID)})).map((w) => w.id)`;
  // what a person sees and feels on a page: the focused element, the active window, the stacking order of the active desktop's windows
  const FEEL = `(() => { const ae = document.activeElement; const win = ae && ae.closest && ae.closest('.window'); const desk = app.desktopManager.activeDesktopId; return { ae: ae ? ae.tagName + '.' + String(ae.className || '').split(' ')[0] + '@' + (win ? win.dataset.winId || win.id : '-') : null, active: app.wm.activeWindowId, order: [...app.wm.windows.values()].filter((w) => w._desktopId === desk && w.element).sort((a, b) => Number(a.element.style.zIndex || 0) - Number(b.element.style.zIndex || 0)).map((w) => w.id) }; })()`;
  const goto = async (X, d) => { await X.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="${d}"]')`); await sleep(1800); };
  const declineOffer = async (X) => { const b = `(() => { const d = [...document.querySelectorAll('.dialog')].find((x) => /Resume interrupted sessions/.test(x.textContent)); return d ? [...d.querySelectorAll('button')].find((x) => !/Resume all/.test(x.textContent)) || null : null; })()`; if (await X.ev(`!!${b}`)) { await X.click(b); await sleep(300); } };
  let PA = null;
  try {
    ok(await PB.boot(), 'page B (1440×900) booted');
    await declineOffer(PB);
    await goto(PB, 'desk-2');
    await until(async () => !!(await PB.ev(VIEW))?.readOnly, 15000, 200);
    const b0 = await PB.ev(VIEW);
    ok(!!b0 && b0.readOnly && b0.note && b0.desk === 'desk-2' && b0.gb === J(GB) && (await PB.ev('app.desktopManager.activeDesktopId')) === 'desk-2', 'page B visits Desk 2: e-1 is built as a READ-ONLY view of the ended conversation («Session is read-only.»), at its box', b0);
    PA = await newPage();
    ok(!!PA && await PA.boot(), 'page A (1440×900) booted');
    await declineOffer(PA);
    if ((await PA.ev('app.desktopManager.activeDesktopId')) !== 'desk-1') await goto(PA, 'desk-1');
    ok((await PA.ev('app.desktopManager.activeDesktopId')) === 'desk-1' && (await PA.ev(OF_CONV)).length === 0, 'page A stays on Desk 1 (no window of the conversation there)');
    await PB.shot('b-before');

    // ① CONTROL — the follow off on B: the conversation runs again on the hub, B's window stays on its history
    await PB.ev('app._followResumed = () => 0, true');
    const r1 = await cli(['conversations', 'resume', `claude:${CID}`], coord.token);
    const up1 = await until(async () => (await liveOf()).length === 1, 20000, 250);
    await sleep(4000);
    const c1 = await PB.ev(VIEW);
    ok(r1.code === 0 && up1 && !!c1 && c1.readOnly && c1.note && !c1.live, '① CONTROL: the follow OFF — the key resumed it (the hub lists it live) and B\'s window stays on «Session is read-only.»', { r1: r1.json || r1.err, up1, c1 });
    await PB.shot('b-control');
    const e1 = await cli(['conversations', 'end', `claude:${CID}`], coord.token);
    ok(e1.code === 0 && await until(async () => (await liveOf()).length === 0, 20000, 250), '① …and the key ends it again', e1.json || e1.err);
    await PB.ev('delete app._followResumed, true');   // the follow back on (the prototype's)
    // a THIRD page C builds e-1 on Desk 2 (read-only, ended) and goes back to Desk 1: its window of the conversation is on a desktop it is not showing
    const PC = await newPage();
    ok(!!PC && await PC.boot(), 'page C (1440×900) booted');
    await declineOffer(PC);
    await goto(PC, 'desk-2');
    await until(async () => !!(await PC.ev(VIEW))?.readOnly, 15000, 200);
    await goto(PC, 'desk-1');
    ok((await PC.ev('app.desktopManager.activeDesktopId')) === 'desk-1' && !!(await PC.ev(VIEW))?.readOnly, 'page C holds e-1 read-only on Desk 2 and shows Desk 1');
    // the person on page B works in f-2 (above e-1): its window is the active one
    await PB.ev(`app.wm.focusWindow('f-2'), true`);
    await sleep(6000);   // the sidebar's live list has spoken at least once since (its poll: 5 s)
    const feel0 = await PB.ev(FEEL), feelC0 = await PC.ev(FEEL);

    // ② the follow on: the key resumes it; B's ended window turns live IN ITS ROW, quietly; A is untouched
    const aDesk0 = await PA.ev('app.desktopManager.activeDesktopId');
    // the facts the followers' law judges (followLaw, above): the hub's Desk 2 record; each page's Desk 2 frames and the refusals it
    // received since a pass began, at a first look and again 3 s later (the settle); the «disagree» toasts; the hub's REFUSED lines
    const deskRec = async () => { const l = (await req('GET', '/api/layouts')).json || {}; const a = ((l.desktops || {})['desk-2'] || {}).autoSave || {}; const wins = Array.isArray(a.windows) ? a.windows : []; const e1 = wins.find((w) => w && w.winId === 'e-1') || null; return { n: wins.length, at: a.updatedAt || null, e1Session: e1 ? e1.serverSessionId || null : null }; };
    const factsOf = async (X, from) => ({ sends: (await X.ev('window.__syncs')).filter(([d, at]) => d === 'desk-2' && at >= from).length, refused: (await X.ev('window.__refused')).filter(([d, , at]) => d === 'desk-2' && at >= from).map((r) => r[1]), tapped: await X.ev('!!(app.ws.ws && app.ws.ws.__vsTapped)') });
    // THE SETTLE, MEASURED (the read: never a fixed sleep): B's and C's Desk 2 frames and refusals since `from` unchanged for `still` ms
    const quiet = async (from, still = 2500, ms = 25000) => {
      const t0q = Date.now(); let last = -1, since = Date.now();
      while (Date.now() - t0q < ms) { const f = [await factsOf(PB, from), await factsOf(PC, from)]; const n = f.reduce((a, x) => a + x.sends + x.refused.length, 0); if (n !== last) { last = n; since = Date.now(); } else if (Date.now() - since >= still) return true; await sleep(200); }
      return false;
    };
    const sendsOfA = async (from) => (await PA.ev('window.__syncs')).filter(([, at]) => at >= from).length;
    // a pass's facts: the first look once the frames have gone QUIET (bounded; a page that never goes quiet is said), a second 3 s later
    const passFacts = async (from) => {
      const settled = await quiet(from);
      const B1 = await factsOf(PB, from), C1 = await factsOf(PC, from);
      await sleep(3000);
      const B2 = await factsOf(PB, from), C2 = await factsOf(PC, from);
      return { settled, pages: { B: { sends: B1.sends, refused: B1.refused, sendsLater: B2.sends, refusedLater: B2.refused.length, tapped: B2.tapped }, C: { sends: C1.sends, refused: C1.refused, sendsLater: C2.sends, refusedLater: C2.refused.length, tapped: C2.tapped } }, A: await sendsOfA(from) };
    };
    const disagree = async () => { const n = (X) => X.ev(`[...document.querySelectorAll('#global-toasts .global-toast')].filter((t) => /disagree about desktop/.test(t.textContent)).length`); return { A: await n(PA), B: await n(PB), C: await n(PC) }; };
    const refusedLines = (from) => journal().slice(from).split('\n').filter((l) => /REFUSED/.test(l));
    // THE TIE IS MADE (place-14 — never left to luck): B's and C's FIRST frame for Desk 2 are held, then released in one step; both were
    // written on the same broadcast from the same base, so the hub keeps one and refuses the other, always
    const rec0 = await deskRec();
    await PB.ev(`(window.__holdOut = 'desk-2', true)`); await PC.ev(`(window.__holdOut = 'desk-2', true)`);
    const jTie = journal().length;
    const t0 = Date.now();
    const r2 = await cli(['conversations', 'resume', `claude:${CID}`], coord.token);
    ok(r2.code === 0 && r2.json && /^sess-/.test(String(r2.json.sessionId)) && r2.json.desktop && r2.json.desktop.id === 'desk-2' && r2.json.desktop.name === 'Desk 2' && /nothing was sent to it/.test(String(r2.json.note)), '② the key resumes it: exit 0, its sessionId, the desktop of its row (Desk 2), the note', r2.json || r2.err);
    const heldBoth = await until(async () => (await PB.ev('window.__heldOut.length')) === 1 && (await PC.ev('window.__heldOut.length')) === 1, 20000, 100);
    const heldBases = [await PB.ev('window.__heldOut[0] ? window.__heldOut[0].base ?? null : null'), await PC.ev('window.__heldOut[0] ? window.__heldOut[0].base ?? null : null')];
    const released = await Promise.all([PB.ev('window.__releaseOut()'), PC.ev('window.__releaseOut()')]);
    ok(!!heldBoth && released[0] === 1 && released[1] === 1, '② THE TIE IS MADE: B and C each wrote Desk 2\'s record on the same broadcast — each page\'s FIRST frame held, both released in one step', { heldBoth: !!heldBoth, released, heldBases });
    const live2 = await until(async () => !!(await PB.ev(VIEW))?.live, 20000, 250);
    const b2 = await PB.ev(VIEW);
    ok(live2 && b2.id === 'e-1' && b2.desk === 'desk-2' && b2.gb === J(GB) && !b2.note && b2.sid === r2.json.sessionId, '② page B: e-1 is LIVE — the same row id, its box, on Desk 2, showing the resumed session', b2);
    ok((await PB.ev('app.desktopManager.activeDesktopId')) === 'desk-2' && J(await PB.ev(OF_CONV)) === J(['e-1']), '② …B did not switch desktops; ONE window of the conversation', { desk: await PB.ev('app.desktopManager.activeDesktopId'), wins: await PB.ev(OF_CONV) });
    ok((await PA.ev('app.desktopManager.activeDesktopId')) === aDesk0 && aDesk0 === 'desk-1' && (await PA.ev(OF_CONV)).length === 0, '② page A did not switch and made no window (no row on its desktop)');
    await sleep(3000);
    const feel1 = await PB.ev(FEEL);
    ok(feel0.ae === feel1.ae && feel0.active === 'f-2' && feel1.active === 'f-2' && JSON.stringify(feel0.order) === JSON.stringify(feel1.order) && feel1.order.indexOf('e-1') < feel1.order.indexOf('f-2'),
      '② QUIET on B: the focused element, the active window (f-2) and the stacking order are the SAME before and after — e-1 came back live UNDER f-2, never raised, never focused', { feel0, feel1 });
    const liveC = await until(async () => !!(await PC.ev(VIEW))?.live, 20000, 250);
    const feelC1 = await PC.ev(FEEL);
    ok(liveC && (await PC.ev('app.desktopManager.activeDesktopId')) === 'desk-1' && J(await PC.ev(OF_CONV)) === J(['e-1']) && feelC0.ae === feelC1.ae && feelC0.active === feelC1.active && J(feelC0.order) === J(feelC1.order),
      '② page C follows too: its e-1 on Desk 2 is live (C still shows Desk 1 — no switch), one window; C\'s focused element, active window and stacking order the same', { feelC0, feelC1 });
    // THE FOLLOWERS' LAW over the made tie (followLaw, above): exactly ONE stale refusal; the refused page ONE frame more, accepted; the
    // kept page its one; none after the settle (a ping-pong stays red); A none; the hub's Desk 2 keeps its windows, e-1 on the resumed
    // session; no «disagree» toast; the journal's one stale line N → N
    const F2 = await passFacts(t0), rec1 = await deskRec(), sess2 = r2.json && r2.json.sessionId, toasts2 = await disagree(), lines2 = refusedLines(jTie);
    const L2 = followLaw({ made: 'tie', ...F2, rec0, rec1, session: sess2, toasts: toasts2, journal: lines2 });
    ok(L2.ok, '② the frames END and nothing is lost — THE TIE MADE: exactly ONE stale refusal, the refused page one frame more (accepted), the kept page its one, none after the settle, none from A; the hub\'s Desk 2 keeps its windows with e-1 on the resumed session; no «disagree» toast; the journal\'s one stale line reads N → N', { why: L2.why, F2, rec0, rec1, lines2 });
    // CONTROLS — the law goes red where the harm is (a copy of these very facts): the refused page sending on and on (no settle); a
    // window lost at the refusal (the record one short, the journal's line N → N-1)
    const refusedK = Object.keys(F2.pages).find((k) => F2.pages[k].refused.length) || 'B';
    const cPing = followLaw({ made: 'tie', ...F2, pages: { ...F2.pages, [refusedK]: { ...F2.pages[refusedK], sendsLater: F2.pages[refusedK].sends + 3 } }, rec0, rec1, session: sess2, toasts: {}, journal: lines2 });
    const cLost = followLaw({ made: 'tie', ...F2, rec0, rec1: { ...rec1, n: rec1.n - 1 }, session: sess2, toasts: {}, journal: lines2 });
    const cLine = followLaw({ made: 'tie', ...F2, rec0, rec1, session: sess2, toasts: {}, journal: lines2.map((l) => l.replace(/— (\d+) → \d+ windows/, (m0, a) => `— ${a} → ${Number(a) - 1} windows`)) });
    ok(!cPing.ok && cPing.why.some((w) => /after the settle/.test(w)), '② CONTROL: a copy in which the refused page sends on and on (no settle) is RED, by name', cPing.why);
    ok(!cLost.ok && cLost.why.some((w) => /went from \d+ to \d+ windows — a window lost/.test(w)), '② CONTROL: a copy that loses a window at the refusal (the hub\'s record one short) is RED, by name', cLost.why);
    ok(lines2.length >= 1 && !cLine.ok && cLine.why.some((w) => /stale line reads \d+ → \d+ windows — a window lost/.test(w)), '② CONTROL: a copy whose journal line reads N → N-1 windows is RED, by name (the made tie\'s line, mutated)', cLine.why);
    await PB.shot('b-after');
    let rLive = sess2;   // the conversation's live session for ③: the last resume's, read where the hub states it

    // ②b THE UNTIED CASE IS MADE TOO (place-14): the key ends it; at the next resume page C hears of it only AFTER the hub kept B's
    // record and C saw it (C's live list held, then released) — C writes from that record's base: NO refusal is owed
    const eU = await cli(['conversations', 'end', `claude:${CID}`], coord.token);
    const endedU = eU.code === 0 && await until(async () => (await liveOf()).length === 0, 20000, 250) && await until(async () => !!(await PB.ev(VIEW))?.readOnly && !!(await PC.ev(VIEW))?.readOnly, 20000, 250);
    ok(!!endedU, '②b the key ends it again: B\'s and C\'s e-1 are ended (read-only) again', eU.json || eU.err);
    const tEnd = Date.now();
    ok(await quiet(tEnd - 20000), '②b …what the end itself wrote has gone quiet before the pass (the journal leg below judges every line)');
    const recU0 = await deskRec();
    await PC.ev('(window.__holdIn = true, true)');
    const jU = journal().length, tU = Date.now();
    const rU = await cli(['conversations', 'resume', `claude:${CID}`], coord.token);
    let liveU = null; await until(async () => (liveU = (await liveOf())[0] || null), 20000, 250);   // its session READ from the live list, never assumed from the answer (until answers only true / false: the row is kept here)
    const sessU = liveU ? liveU.id : null;
    ok(rU.code === 0 && !!sessU, '②b the key resumes it once more: exit 0, live again (its session read from the live list)', rU.json || rU.err);
    let keptU = null; if (sessU) await until(async () => { const r = await deskRec(); return (keptU = r.e1Session === sessU && r.at ? r : null); }, 20000, 250);
    const seenU = !!keptU && await until(async () => Number(await PC.ev(`app.desktopManager.stampOf('desk-2') || 0`)) >= Number(keptU.at), 10000, 100);
    const heardLate = await PC.ev('window.__releaseIn()');
    ok(!!keptU && !!seenU, '②b THE UNTIED CASE IS MADE: the hub KEPT B\'s record of Desk 2 (e-1 on the resumed session) and page C SAW it before C heard of the resume (its live list held, then released)', { kept: keptU || null, seen: !!seenU, heldLiveLists: heardLate });
    // WHAT EACH PAGE HOLDS after the untied resume, PRINTED every run (the pre-run of 9093a91d4: «B and C both follow» was red with no
    // facts). C saw B's record of Desk 2 BEFORE it heard of the resume, and the product's re-key rule closes C's hidden read-only e-1
    // (src/lib/desktop-manager.js cacheRemoteState: «a DEAD view this page holds there (hidden) of a row whose record now names another
    // session goes as the row's re-opening …, and the next switch builds the row from the record»); C's follow then finds no ended window
    // (session-lifecycle _reopenRowOf endedOnly). So C is judged on THAT law: no read-only view of the running conversation, its own
    // record of Desk 2 naming e-1 on the resumed session — and, after the pass's law below, a person who visits Desk 2 on C gets e-1 LIVE
    const PAGE_FACTS = `(() => { const w = app.wm.windows.get('e-1'), v = app.sessions.get('e-1'); const held = app.desktopManager._savedStates && app.desktopManager._savedStates.get('desk-2'); const row = held && Array.isArray(held.windows) ? held.windows.find((r) => r && r.winId === 'e-1') : null;
      const mine = [...app.wm.windows.values()].filter((x) => (x._openSpec && x._openSpec.backendSessionId === ${J(CID)}) || (x._conversation && x._conversation.backendSessionId === ${J(CID)})).map((x) => { const vv = app.sessions.get(x.id); return { id: x.id, desk: x._desktopId, readOnly: !!(vv && vv._readOnly), sid: (vv && vv.sessionId) || null }; });
      return { desk: app.desktopManager.activeDesktopId, e1: !!w, view: v ? { sid: v.sessionId || null, readOnly: !!v._readOnly } : null, recordRow: row ? (row.serverSessionId || null) : null, heard: !!(app._liveConvKeys && app._liveConvKeys.has(${J('claude:' + CID)})), windows: mine, frames: (window.__syncs || []).filter(([d, at]) => d === 'desk-2' && at >= ${tU}).length }; })()`;
    const liveBU = await until(async () => !!(await PB.ev(VIEW))?.live, 20000, 250);
    const factsBU = await PB.ev(PAGE_FACTS), factsCU = await PC.ev(PAGE_FACTS);
    console.log(`    [②b what each page holds] B ${J(factsBU)} · C ${J(factsCU)} · the resumed session ${sessU}`);
    ok(!!liveBU, '②b page B follows: e-1 is LIVE on B (it heard of the resume at once)', factsBU);
    let factsC2 = factsCU; const cHolds = await until(async () => { factsC2 = await PC.ev(PAGE_FACTS); return factsC2.recordRow === sessU && factsC2.windows.every((x) => !x.readOnly) && factsC2.desk === 'desk-1'; }, 10000, 250);
    ok(!!cHolds, '②b page C (it saw B\'s record first) holds NO read-only view of the running conversation, stays on Desk 1 (QUIET: no switch), and its own record of Desk 2 names e-1 on the resumed session (the product\'s re-key: the row is built from that record at the next switch)', factsC2);
    const FU = await passFacts(tU), recU1 = await deskRec(), toastsU = await disagree(), linesU = refusedLines(jU);
    const LU = followLaw({ made: 'untied', ...FU, rec0: recU0, rec1: recU1, session: sessU, toasts: toastsU, journal: linesU });
    ok(LU.ok, '②b the frames END and nothing is lost — THE UNTIED CASE MADE: NO refusal, each page one frame at most, none after the settle, none from A; the hub\'s Desk 2 keeps its windows with e-1 on the resumed session; no «disagree» toast; no journal line', { why: LU.why, FU, recU0, recU1, linesU });
    if (sessU) rLive = sessU;
    // …and THE PERSON'S ROAD on C: a visit to Desk 2 (a real click on its preview) builds e-1 from the record — LIVE in its row
    await goto(PC, 'desk-2');
    let viewCU = null; const liveCU = await until(async () => { viewCU = await PC.ev(VIEW); return !!viewCU && viewCU.live && viewCU.desk === 'desk-2' && viewCU.gb === J(GB) && viewCU.sid === sessU; }, 20000, 250);
    const ofConvCU = await PC.ev(OF_CONV);
    ok(!!liveCU && J(ofConvCU) === J(['e-1']), '②b …and a person who visits Desk 2 on page C gets e-1 LIVE in its row (the same id, its box, the resumed session) — ONE window of the conversation', { view: viewCU, windows: ofConvCU, facts: await PC.ev(PAGE_FACTS) });

    // ③ page A reloads and visits Desk 2: the conversation is live in place
    // the reload is PROVEN (the read: Page.reload answers before the new page loads — boot() alone passed on the OLD document): a marker
    // set before it is gone in the page that answers after it
    // what A will READ at its reload is the hub's record as B / C's follow left it (the read: a check after the reload can be A's own save)
    const layPre = (await req('GET', '/api/layouts')).json || {};
    const e1pre = ((((layPre.desktops || {})['desk-2'] || {}).autoSave || {}).windows || []).find((w) => w && w.winId === 'e-1') || null;
    ok(!!e1pre && !!rLive && e1pre.serverSessionId === rLive, '③ BEFORE A reloads, the hub\'s record of Desk 2 already holds e-1 on the RESUMED session (written by B / C\'s follow)', { serverSessionId: e1pre && e1pre.serverSessionId, resumed: rLive });
    await PA.ev('(window.__preReload = 1, 1)');
    await PA.send('Page.reload', {});
    const fresh = await until(async () => { try { return await PA.ev('!window.__preReload'); } catch { return false; } }, 20000, 100);
    ok(!!fresh && await PA.boot(false), '③ page A reloaded — a NEW document (the old one\'s marker gone), its app booted');
    await declineOffer(PA);
    await goto(PA, 'desk-2');
    const live3 = await until(async () => !!(await PA.ev(VIEW))?.live, 20000, 250);
    const a3 = await PA.ev(VIEW);
    ok(live3 && a3.desk === 'desk-2' && a3.gb === J(GB) && J(await PA.ev(OF_CONV)) === J(['e-1']), '③ …and visits Desk 2: e-1 is live in place (same id, its box), one window', a3);
    // …and what it read was the LIVE record, not a stale one (the read: the leg above passes on either): the hub's own Desk 2 holds e-1 on
    // the RESUMED session
    const lay = (await req('GET', '/api/layouts')).json || {};
    const e1rec = ((((lay.desktops || {})['desk-2'] || {}).autoSave || {}).windows || []).find((w) => w && w.winId === 'e-1') || null;
    ok(!!e1rec && !!rLive && e1rec.serverSessionId === rLive, '③ the HUB\'s record of Desk 2 holds e-1 on the RESUMED session (its serverSessionId = the resume\'s sessionId)', { serverSessionId: e1rec && e1rec.serverSessionId, resumed: rLive });
    await PA.shot('a-after-reload');
    // THE JOURNAL (place-14's law): no refusal of any kind but «stale», each reading N → N windows; the made tie's ONE (judged in its pass
    // above), the untied pass's none; and none anywhere else, unless it is a lawful stale one of Desk 2 (an end's own records may tie)
    const allRefused = journal().split('\n').filter((l) => /REFUSED/.test(l));
    const badLines = allRefused.filter((l) => { const m = STALE_LINE.exec(l); return !m || m[1] !== m[2]; });
    ok(badLines.length === 0 && lines2.length === 1 && linesU.length === 0, 'the journal holds no refusal but STALE ones of Desk 2, each N → N windows: ONE in the made tie, NONE in the untied pass', { total: allRefused.length, bad: badLines.slice(0, 3), tie: lines2.length, untied: linesU.length });
  } catch (e) {
    ok(false, 'the suite threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
  }
})();

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
