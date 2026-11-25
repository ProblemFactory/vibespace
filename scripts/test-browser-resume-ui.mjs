#!/usr/bin/env node
// LANE BROWSER-RESUME, CHUNK B — THE RESUME BUTTON AND THE HAND-BACK CARD, SEEN (heavy; docs/design-agent-browser-v2.zh.md
// §3.9, the owner's ruling 2: "给我一个 resume 按钮").
// Scene: a worktree server (its own scratch HOME, data/, a free port), a fake `claude` whose environment the suite reads
// (the agent's own token + its browser pairs), a fake `agent-browser` that KEEPS TABS (CDP target ids; `open` / `tab new`
// answer them, a `tab new` makes the new tab the active one — the shapes measured on 0.38.1), a fake stream server per
// browser that mirrors those tabs, the SHIPPED `vibespace-browser` CLI, and headless Chrome (1280×900) driving the app
// with REAL clicks and keys. Assertions read the app's own objects (winInfo._browserLive.state(), the chat view's
// messages, the session rows) — never text scraped from the DOM; geometry is a rect census.
//   ① the agent opens three pages through the shipped CLI (open / tab new / tab t2) — the live view draws them
//   ② the user's Stop: the live view keeps its last frame, its status says what is KEPT, and Reconnect is RESUME in place
//      (the play glyph + its word, whole); a REAL click resumes — the fake browser reopened the three pages IN ORDER and
//      switched back to the second BY ITS TARGET ID; the view reconnected by itself and draws again
//      (lane heavy3-flake-races, the rel276 flake now named: the view reconnects BY ITSELF the moment the relaunched browser
//      holds again — MID-resume — so "connected with three tabs" is no sign the resume ended; the leg waits for the Resume's
//      own answer (resumedHere, the POST answered after its last step); RED CONTROL: the switch back HELD in the fake — the
//      old wait passes while the Resume has not answered and the tab on show is NOT YET the one the Resume switches back to;
//      which earlier reopened tab the fake shows then is the fake's own pace and is not asserted)
//   ③ "Hand back with a note…" (until 2.369.367 "Hand back and continue…") is offered after the Resume; a REAL Take over,
//      a REAL click on it: the note box takes the typed keys (not one reached the page); the dialog SAYS what the press does
//      (its title: when the agent reads it, whole in the title bar; its label: nothing is sent now + how to continue right
//      away); a REAL click on Hand back: the takeover ended, ONE card in the chat, the stash holds "a browser handback" and
//      the strip above the composer offers it with "Hand over now · starts a turn" (lane handback-words), NO billed turn (the spend ledger has no row, the journal says "nothing
//      delivered"), and the agent's next command (the shipped CLI) prints [browser_resumed] naming the current tab
//   ④ zh + ja: Resume and "Hand back with a note…" in the device's language, whole in a 360 px wide window (Resume never
//      folds; the hand-back is WHOLE ON THE BAR — lane handback-words: ja «メモを添えて戻す…» folded into the ⋯ row there,
//      so ja says «メモで戻す…»; a ⋯ row no longer passes)
//   PNGs where VIBESPACE_TABS_PNG_DIR names a directory: ⑧'s tab row + pane, and (lane handback-words) the hand-back
//   dialog, the strip after it, and the zh / ja bar at 360 px; ⑨'s row at a 390 and a 1280 px viewport (B-e674 unit 1)
//   ⑨ zh (B-e674 unit 1): a tab that is not this conversation's in FRONT of its window — its own chip says «在此窗口最前面»,
//      its tip whose it is; CONTROL without the hub's verdict nothing is marked; a blank nobody holds in front is drawn; at 390
//      and 1280 px the row is JUDGED (r608): the front's chip whole, or the fold naming it in words — never folded unsaid; the
//      wait is for the state its feed asks for, and no part of this view's own chip is clipped (r618: only its title gives way)
//   ⑤ the agent's own `detach` retires its browser's record: a freshly loaded view (no browser remembered) still offers
//      Resume off THE fact; a REAL click brings the three tabs back on a new record
//   ⑥ (lane browser-resume C, the owner's ruling 3) THE TAB ROW: one chip per tab, "The agent's"; while the agent drives no
//      control is drawn (the Take over toggle names what taking over adds); a REAL Take over draws switch + ✕; a REAL
//      click switches the agent's tab (its next input is forwarded — the anchor moved with HIS switch); a REAL ✕ closes one;
//      ✕ on the tab on show moves the agent to a neighbour first; the last tab has no ✕; a refused close names why; the
//      handback carries his acts (the journal); "Close all…" asks by the browser's name (cancelled: nothing stopped); zh +
//      ja: the row whole at 360 px, the tab on show never folded
//   ⑦ (lane live-watch-polish, design 006 G1–G4) zh at 360 px: a FOLDED tab watched from the ▾+N menu ("查看 — …", no greyed
//      row), the line names both tabs, the watched chip kept on the row, the agent's tab untouched; the view's socket dropped ⇒
//      the watch re-sent (one truth). A fake CDP page endpoint (cdp.json → the fake's cdp-url) answers the capture.
// SKIPs with evidence without chrome / dtach. Free ports, scratch dirs only; ZERO vendor calls (a stub CLI).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET, relayBroadcastJs } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0, skipped = 0;
// r1100 (1): A WAIT THAT NEVER SAW ITS STATE SAYS SO BY NAME — `until` keeps every wait of the current group that timed out (a
// group = the waits since the last judge), and a RED judge after them says «the state never came in N s»: the read a wait fell
// through to is never read as the product's verdict (the 2.369.414 mirror's red in test-browser-resume-ui §9 was one)
const waits = { missed: [], judged: false };
const missNote = () => waits.missed.length ? ` — THE STATE NEVER CAME: the wait before this judge timed out (${waits.missed.map((ms) => `${ms / 1000} s`).join(', ')}), so this red is that, not a verdict on the product` : '';
const ok = (c, n, extra) => { const note = c ? '' : missNote(); waits.judged = true; if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + note + (extra ? '\n    ' + String(extra).slice(0, 1400) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 80) => { if (waits.judged) { waits.missed = []; waits.judged = false; } const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await pred()) return true; } catch { } await sleep(every); } let r = false; try { r = !!(await pred()); } catch { } if (!r) waits.missed.push(ms); return r; };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;
const ROOT = scratch('browser-resume-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { for (const pid of fs.readFileSync(path.join(ROOT, 'ab-state', 'pids'), 'utf8').split('\n').filter(Boolean)) { try { process.kill(Number(pid), 'SIGKILL'); } catch { } } } catch { }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`); process.exit(fail ? 1 : 0); };

/** The fake agent-browser: a daemon is a real `sleep`; the tabs live in <state>/<ns>.json (0.38.1's shapes: `open` and
 *  `tab new` answer `data.targetId`, a `tab new` makes the new tab active, a target id / t<N> / a label is a tab ref); every
 *  command is logged (cmds.log); `stream status` names ports.json[ns]. */
const FAKE_AB = () => `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const write = (s) => { fs.writeFileSync(f + '.part', JSON.stringify(s)); fs.renameSync(f + '.part', f); };
const readJ = (n) => { try { return JSON.parse(fs.readFileSync(path.join(st, n), 'utf8')); } catch { return {}; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const tid = () => Array.from({ length: 32 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ ns, argv }) + '\\n');
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.1' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, n: 1, tabs: [{ tabId: 't1', targetId: tid(), url: 'about:blank', title: '', active: true }] }; fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); }
  const act = s.tabs.find((t) => t.active) || s.tabs[0]; act.url = b; act.title = 'Page ' + String(b).replace(/^https?:\\/\\//, ''); write(s); out({ success: true, data: { targetId: act.targetId, url: b } }); process.exit(0); }
if (a === 'tab' && b && !['new', 'list', 'close'].includes(b) && fs.existsSync(path.join(st, 'hold-switch'))) { const w = new Int32Array(new SharedArrayBuffer(4)); while (fs.existsSync(path.join(st, 'hold-switch'))) Atomics.wait(w, 0, 0, 20); } // lane heavy3-flake-races: a switch waits while the suite holds it
if (a === 'tab') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); }
  const rest = argv.slice(1);
  if (rest[0] === 'new') { const url = rest[1] || 'about:blank'; s.n = (s.n || 1) + 1; for (const t of s.tabs) t.active = false; const t = { tabId: 't' + s.n, targetId: tid(), url, title: 'Page ' + url.replace(/^https?:\\/\\//, ''), active: true }; s.tabs.push(t); write(s); out({ success: true, data: { tabId: t.tabId, targetId: t.targetId, url, total: s.tabs.length } }); process.exit(0); }
  if (!rest.length || rest[0] === 'list') { out({ success: true, data: { tabs: s.tabs } }); process.exit(0); }
  if (rest[0] === 'close') { if (fs.existsSync(path.join(st, 'fail-close'))) { out({ success: false, error: 'fake: the browser refused to close it' }); process.exit(1); } const t = rest[1] ? s.tabs.find((x) => x.tabId === rest[1] || x.targetId === rest[1]) : s.tabs.find((x) => x.active); if (!t) { out({ success: false, error: 'fake: no tab ' + rest[1] }); process.exit(1); } s.tabs = s.tabs.filter((x) => x !== t); write(s); out({ success: true, data: { closed: true, tabId: t.tabId, targetId: t.targetId } }); process.exit(0); } // lane browser-resume C: ⑥ the tab row closes a tab (0.38.1: any tab, by target id)
  const t = s.tabs.find((x) => x.tabId === rest[0] || x.targetId === rest[0]); if (!t) { out({ success: false, error: 'fake: no tab ' + rest[0] }); process.exit(1); }
  for (const x of s.tabs) x.active = x === t; write(s); out({ success: true, data: { tabId: t.tabId, targetId: t.targetId } }); process.exit(0); }
if (a === 'get' && b === 'url') { const s = read(); const act = s && (s.tabs.find((t) => t.active) || s.tabs[0]); out({ success: true, data: { url: act ? act.url : '' } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:' + (readJ('cdp.json')[ns] || 1) + '/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const port = readJ('ports.json')[ns] || null; if (!port) { out({ success: false, data: null, error: 'fake: no stream for ' + ns }); process.exit(1); } out({ success: true, data: { connected: true, enabled: true, port, screencasting: false } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'set' && b === 'viewport') { out({ success: true, data: {} }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`;

/** A fake stream server for ONE browser namespace: status, frames, and a `tabs` record mirroring the fake's tab file
 *  (sent when it changes, and to every new viewer); `inputs` records every input the bridge forwarded; `drop()` ends
 *  every connection (the daemon's stream server dying with its daemon). */
async function fakeUpstream(stateDir, ns, { fps = 4 } = {}) {
  const port = await freePort();
  const clients = new Set(); let connections = 0; const inputs = [];
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  const tabsNow = () => { try { const s = JSON.parse(fs.readFileSync(path.join(stateDir, ns + '.json'), 'utf8')); return (s.tabs || []).map((t) => ({ active: !!t.active, label: null, tabId: t.tabId, targetId: t.targetId, title: t.title || t.url, type: 'page', url: t.url })); } catch { return null; } };
  let lastTabs = '';
  const tabsRec = (tabs) => JSON.stringify({ type: 'tabs', tabs, timestamp: Date.now() });
  wss.on('connection', (ws) => {
    connections++; clients.add(ws);
    ws.send(JSON.stringify(FIX.server_to_client.status));
    const t = tabsNow(); if (t) ws.send(tabsRec(t));
    ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } if (/^input_/.test(m.type)) inputs.push(m); });
    ws.on('close', () => clients.delete(ws)); ws.on('error', () => { });
  });
  const timer = setInterval(() => {
    const t = tabsNow(); const sig = JSON.stringify(t);
    for (const c of clients) if (c.readyState === 1) { c.send(JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } })); if (t && sig !== lastTabs) c.send(tabsRec(t)); }
    lastTabs = sig;
  }, 1000 / fps);
  return { port, inputs, get connections() { return connections; }, drop() { for (const c of clients) { try { c.terminate(); } catch { } } }, close() { clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  { // r1100 CONTROL: the mark can be read — a wait that times out is named by the next red judge
    await until(() => false, 30, 10); const note = missNote(); waits.missed = []; waits.judged = false;
    ok(/THE STATE NEVER CAME/.test(note) && note.includes('0.03 s'), 'r1100 CONTROL: a wait that times out is NAMED by the next red judge («the state never came in N s»), never read as the product\'s verdict', note);
  }
  fakeHome = scratchHome('browser-resume-ui-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB, { recursive: true });
  fs.writeFileSync(path.join(AB, 'ports.json'), '{}');
  const SIDC = crypto.randomUUID();
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SIDC, hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SIDC, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  // the fake claude: the real CLI's first two lines, then its ENV to a file (the suite runs the agent's CLI with it)
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --version "*) echo '2.1.281 (Claude Code)'; exit 0;; esac\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nenv > "$FAKE_AB_STATE/claude-env-$$"\nexec sleep 600\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(BIN, 'agent-browser'), FAKE_AB(), { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin/vibespace-browser']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_BROWSER_') || /^(ANTHROPIC|OPENAI|CODEX)_/.test(k)) delete env[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), 'the worktree server booted', journal.slice(-800))) return;
  const j = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'r1', name: 'Resume chat' }));
  await until(() => msgs.some((m) => m.type === 'created' && m.reqId === 'r1'), 15000);
  const SID = msgs.find((m) => m.type === 'created' && m.reqId === 'r1')?.sessionId || null;
  const ups = []; let chromeProc = null; let cdp = null;
  try {
    if (!ok(!!SID, 'a chat session was created on the fake claude', journal.slice(-600))) return;
    // the agent's environment, off the fake claude (its AGENT_BROWSER_SESSION names this conversation's browser key)
    let agentEnv = null;
    await until(() => {
      for (const n of fs.readdirSync(AB).filter((x) => x.startsWith('claude-env-'))) {
        const t = fs.readFileSync(path.join(AB, n), 'utf8');
        if (/^AGENT_BROWSER_SESSION=vs-bk-/m.test(t) && t.includes('VIBESPACE_SESSION_TOKEN=')) { agentEnv = {}; for (const line of t.split('\n')) { const i = line.indexOf('='); if (i > 0) agentEnv[line.slice(0, i)] = line.slice(i + 1); } return true; }
      }
      return false;
    }, 15000, 100);
    if (!ok(!!agentEnv, 'the session was spawned with its own browser pairs and token (the agent\'s environment)')) return;
    const bk = agentEnv.AGENT_BROWSER_SESSION.slice(3), ns = agentEnv.AGENT_BROWSER_NAMESPACE || ('vs-' + bk);
    const up = await fakeUpstream(AB, ns); ups.push(up);
    fs.writeFileSync(path.join(AB, 'ports.json'), JSON.stringify({ [ns]: up.port }));
    const cli = (args) => new Promise((resolve) => execFile(process.execPath, [path.join(wt, 'data/bin/vibespace-browser'), ...args], { env: agentEnv, cwd: ROOT, encoding: 'utf8', timeout: 60000 }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
    const tabsOf = () => { try { return JSON.parse(fs.readFileSync(path.join(AB, ns + '.json'), 'utf8')).tabs || []; } catch { return []; } };
    const cmds = () => { try { return fs.readFileSync(path.join(AB, 'cmds.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.ns === ns).map((c) => c.argv.join(' ')); } catch { return []; } };

    // ── ① the agent opens three pages through the SHIPPED CLI ──
    console.log('— ① the agent opens three pages (the shipped vibespace-browser: open / tab new / tab t2)');
    const c1 = await cli(['open', 'https://a.test/']); const c2 = await cli(['tab', 'new', 'https://b.test/']); const c3 = await cli(['tab', 'new', 'https://c.test/']); const c4 = await cli(['tab', 't2']);
    const t1 = tabsOf();
    ok([c1, c2, c3, c4].every((c) => c.code === 0) && t1.map((t) => t.url).join() === 'https://a.test/,https://b.test/,https://c.test/' && t1.find((t) => t.active).url === 'https://b.test/', 'the agent\'s browser runs three pages, the second on show', JSON.stringify({ codes: [c1, c2, c3, c4].map((c) => c.code), err: [c1, c2, c3, c4].map((c) => c.stderr.slice(0, 200)), tabs: t1 }));

    chromeProc = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
    procs.add(chromeProc);
    let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!ok(!!target, 'chrome exposed a CDP page target')) return;
    cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const S = JSON.stringify;
    const ev = async (js) => {
      const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }; const sidOf = (id) => (app.sessions.get(id) || {}).sessionId || null; const chatWin = () => [...wm.windows.values()].find((w) => w.type === 'chat' && sidOf(w.id) === ${S(SID)}) || null; const live = () => wm.windows.get('win-blive-' + ${S(SID)}) || [...wm.windows.values()].find((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === ${S(SID)}) || null; const L = () => { const w = live(); return w ? w._browserLive : null; }; const row = () => (app.sidebar._allSessions || []).find((x) => x.webuiId === ${S(SID)}) || null; ${js} })()`, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
      return r.result?.result?.value;
    };
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const click = async (pt) => { await mouse('mouseMoved', pt.x, pt.y); await mouse('mousePressed', pt.x, pt.y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', pt.x, pt.y, { button: 'left', clickCount: 1 }); await sleep(250); };
    const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const PNG_DIR = process.env.VIBESPACE_TABS_PNG_DIR || '';   // the suite's PNG dir (⑧'s tab row; lane handback-words' dialog, strip, bar)
    const png = async (name, r) => { const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.left, y: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height), scale: 1 } }); if (shot.result?.data) { fs.writeFileSync(path.join(PNG_DIR, name), Buffer.from(shot.result.data, 'base64')); console.log(`    PNG ${path.join(PNG_DIR, name)}`); } };
    let onboarded = false;
    const boot = async () => {
      if (!onboarded) { onboarded = true; await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); } // §47: before every navigate
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      return until(async () => ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);'), 40000, 250);
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    if (!ok(await boot(), 'the app booted in headless chrome (1280×900)')) return;
    await sleep(800);
    await ev(`await app.refreshBrowserProfiles(); app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev('return !!chatWin();'), 10000);
    await ev(`app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
    const drawn = await until(() => ev('const l = L(); return !!(l && l.state().frames >= 2 && l.state().connected && l.state().tabs.length === 3);'), 15000);
    ok(drawn, 'the live view draws the agent\'s browser and lists its three tabs', S(await ev('const l = L(); return l ? { frames: l.state().frames, tabs: l.state().tabs.map((t) => t.url), error: l.state().error } : null;')));

    // ── ② the user's Stop ⇒ RESUME in place of Reconnect; a REAL click resumes with the three tabs ──
    console.log('— ② Stop: the live view offers Resume in place; a REAL click reopens the three tabs, the view follows');
    let r = await j('POST', `/api/browser/session/${SID}/stop`, { ref: '~ephemeral' });
    ok(r.status === 200, 'the user stops the conversation\'s browser (a deliberate stop: its logins and tabs are kept)', S(r.json).slice(0, 300));
    up.drop(); // its stream server dies with its daemon
    const kept = await until(async () => { const k = (await j('GET', '/api/browser/kept')).json; const e = k && (k.kept || []).find((x) => x.browserKey === bk); return !!(e && e.tabs.length === 3 && e.stoppedWhy === 'user'); }, 8000);
    ok(kept, 'the kept store holds its three tabs (stopped by the user)', S((await j('GET', '/api/browser/kept')).json).slice(0, 600));
    const offered = await until(() => ev('const l = L(); const s = l && l.state(); return !!(s && s.stopped && s.resumeOffer && s.resumeText);'), 12000, 150);
    const s2 = await ev('const l = L(); const s = l.state(); const b = l.el().querySelector(".browser-live-reconnect"); return { stopped: s.stopped, frames: s.frames, resumeOffer: s.resumeOffer, resumeText: s.resumeText, statusText: s.statusText, btn: b && b.style.display !== "none" ? { rect: rect(b), sw: b.scrollWidth, cw: b.clientWidth, right: rect(b).left + rect(b).width, barRight: (rect(l.el().querySelector(".browser-live-bar")).left + rect(l.el().querySelector(".browser-live-bar")).width), svg: !!b.querySelector("svg"), mode: b.dataset.mode } : null, fact: row() && row().browserFact && row().browserFact.own };');
    ok(offered && s2.resumeText === 'Resume' && s2.btn && s2.btn.mode === 'resume' && s2.btn.svg && s2.btn.sw <= s2.btn.cw + 1 && s2.btn.right <= s2.btn.barRight + 1, 'the stopped view keeps its last frame and offers RESUME in place of Reconnect — the play glyph + its word, whole and INSIDE the bar (no greyed control)', S(s2));
    ok(/3 tab\(s\) and its logins are kept/.test(s2.statusText || '') && s2.fact && s2.fact.kept && s2.fact.kept.tabs === 3, 'its status line says what is kept ("… 3 tab(s) and its logins are kept …") — THE fact\'s own.kept', S({ status: s2.statusText, own: s2.fact }));
    const nBefore = cmds().length;
    fs.writeFileSync(path.join(AB, 'hold-switch'), ''); // the Resume's LAST step (the switch back to the tab on show) waits in the fake
    if (s2.btn) await click(centre(s2.btn.rect));
    // the OLD wait: connected with three tabs — the view reconnects by itself as soon as the relaunched browser holds again
    const oldSaid = await until(() => ev('const s = L().state(); return !!(s.connected && !s.stopped && s.frames >= 1 && s.tabs.length === 3);'), 20000, 150);
    const midTabs = tabsOf();
    const mid = { view: await ev('const s = L().state(); return { resuming: s.resuming, resumedHere: s.resumedHere };'), onShow: ((midTabs.find((t) => t.active)) || {}).url || null, fakeTabs: midTabs.length };
    // what the old wait PROVES, and only that: the Resume has not answered and the switch back has not happened — the tab on
    // show is not yet the kept one the Resume switches back to (b.test). In the fake a «tab new» makes its own tab active, so
    // b.test is on show for a moment by its OWN reopen (two tabs); with all three reopened it is on show only by the switch
    // back. WHICH earlier reopened tab the fake shows at the old wait's instant (a.test after its first open, b.test between
    // its reopen and c.test's, c.test after the last «tab new», none before the relaunch writes its file) is the fake's own
    // pace against the view's count of three, and is not asserted (2.369.405's release mirror read a.test).
    const switchedBack = mid.fakeTabs === 3 && mid.onShow === 'https://b.test/';
    ok(oldSaid && mid.view.resuming && !mid.view.resumedHere && !switchedBack,
      'RED CONTROL (the old wait): with the switch back held, the view is already connected with three tabs while the Resume has not answered — the tab on show is not yet the one the Resume switches back to (the mirror\'s red read here)', S(mid));
    fs.unlinkSync(path.join(AB, 'hold-switch'));
    // the Resume's own answer: the POST came back after its last step (resumedHere, resuming over)
    const resumed = await until(() => ev('const s = L().state(); return !!(s.resumedHere && !s.resuming && s.connected && !s.stopped && s.frames >= 1 && s.tabs.length === 3);'), 20000, 150);
    const after = cmds().slice(nBefore);
    const t2 = tabsOf();
    const bId = t2[1] && t2[1].targetId;
    ok(resumed, 'the view reconnected BY ITSELF and draws the resumed browser with its three tabs', S(await ev('const s = L().state(); return { connected: s.connected, stopped: s.stopped, frames: s.frames, tabs: s.tabs.map((t) => t.url), error: s.error };')));
    const seqNeed = ['open about:blank', 'open https://a.test/', 'tab new https://b.test/', 'tab new https://c.test/', `tab ${bId}`];
    ok(seqNeed.every((x) => after.includes(x)) && after.indexOf('open https://a.test/') < after.indexOf('tab new https://b.test/') && after.indexOf('tab new https://c.test/') < after.indexOf(`tab ${bId}`) && !after.some((x) => x.startsWith('tab close')), 'the fake browser was relaunched and reopened the pages IN ORDER, the first into its launch tab, then switched back to the second BY ITS TARGET ID — never a tab close', S(after));
    ok(t2.map((t) => t.url).join() === 'https://a.test/,https://b.test/,https://c.test/' && t2.find((t) => t.active).url === 'https://b.test/', 'the resumed browser shows the SAME three tabs, the SAME one on show', S(t2));

    // ── ③ "Hand back with a note…" — the note box, its words, the card, the stash + the strip, no billed turn, the agent's next command ──
    console.log('— ③ Hand back with a note: a REAL Take over, the note box takes the keys and says what the press does, the card in the chat, nothing billed');
    const contOffered = await until(() => ev('return !!L().state().contShown;'), 6000);
    ok(contOffered, '"Hand back with a note…" is offered after the Resume (the view resumed it — never greyed)', S(await ev('const s = L().state(); return { contShown: s.contShown, fact: row().browserFact && row().browserFact.own };')));
    await ev('const w = live(); app.goToWinId ? app.goToWinId(w.id) : wm.focusWindow(w.id); return true;');
    await sleep(300);
    const tk = await ev('const b = L().el().querySelector(".browser-live-mode-btn"); return b && b.offsetParent ? rect(b) : null;');
    if (tk) await click(centre(tk));
    const driving = await until(() => ev('const s = L().state(); return s.mode === "takeover" && s.mine && s.ownsKeyboard;'), 6000);
    ok(driving, 'a REAL click on Take over: the user drives and the view owns the keyboard');
    const cb = await ev('const b = L().el().querySelector(".browser-live-continue"); return b && b.offsetParent ? rect(b) : null;');
    ok(!!cb, 'while driving, "Hand back with a note…" is on the bar', S(await ev('return L().state().folded;')));
    const inputs0 = up.inputs.length;
    if (cb) await click(centre(cb));
    // the note box = the input of the dialog that holds the focus (index.html keeps static dialogs of the same class); lane dialog-yield r2:
    // showInputDialog is a FORM — its root is .dialog-form in its window (it holds the keys of the takeover like the overlay did)
    const dlg = await until(() => ev('const a = document.activeElement; return !!(a && a.tagName === "INPUT" && a.closest(".dialog-overlay, .dialog-form"));'), 5000);
    ok(dlg && (await ev('return L().state().noteOpen && !L().state().ownsKeyboard;')), 'the note box opens WITH the keyboard (the view let the keys go first — a dialog never types into the page)', S(await ev('const a = document.activeElement; return { active: a && a.tagName, cls: a && a.className, st: L().state().noteOpen, owns: L().state().ownsKeyboard };')));
    // lane handback-words (the owner, 2026-10-31: «继续» read as «continue now»): the dialog SAYS what the press does — its title
    // when the agent reads it, its label that nothing is sent now and the recipe for continuing right away (the strip's Hand over
    // now, checked below; or a message). A form window hides the dialog's own header: the title is the window's, and it must be
    // WHOLE in that bar — the zh / ja titles (never opened here) are read from the dictionaries and measured in the bar's own
    // font against the same width (the first, longer titles measured 467 / 319 / 418 px in a 316 px bar: cut in all three)
    const dictWord = (lang, key) => { const l = fs.readFileSync(path.join(repo, `src/lib/i18n-${lang}.js`), 'utf8').split('\n').find((x) => x.startsWith('  ' + JSON.stringify(key) + ': ')); return l ? JSON.parse(l.slice(l.indexOf(': ') + 2).replace(/,\s*$/, '')) : null; };
    const TITLE_EN = 'Hand back — the agent reads it when its next turn starts';
    const TITLES = { en: TITLE_EN, zh: dictWord('zh', TITLE_EN), ja: dictWord('ja', TITLE_EN) };
    const dw = await ev(`const a = document.activeElement; const o = a && a.closest('.dialog-overlay, .dialog-form'); const lab = a && a.closest('label'); const fw = o && o.closest('.window'); const tt = fw ? fw.querySelector('.window-titlebar .window-title') : (o && o.querySelector('.dialog-header h3')); const cx = document.createElement('canvas').getContext('2d'); if (tt) cx.font = getComputedStyle(tt).font; const mw = (x) => Math.ceil(cx.measureText(x).width); const tb = tt && tt.closest('.window-titlebar, .dialog-header'); return { title: tt && tt.textContent, sw: tt && tt.scrollWidth, cw: tt && tt.clientWidth, right: tt ? rect(tt).left + rect(tt).width : null, barRight: tb ? rect(tb).left + rect(tb).width : null, font: tt && getComputedStyle(tt).font, label: lab && lab.textContent.trim(), ok: o && (o.querySelector('button.btn-create') || {}).textContent, w: Object.fromEntries(Object.entries(${S(TITLES)}).map(([k, x]) => [k, mw(x)])), box: fw ? rect(fw) : (o ? rect(o) : null) };`);
    ok(dw && dw.title === TITLES.en && dw.sw <= dw.cw + 1 && dw.barRight !== null && dw.right <= dw.barRight + 1, '…the dialog\'s title says when the agent reads it, whole and inside its window\'s title bar: "' + TITLES.en + '"', S(dw && { title: dw.title, sw: dw.sw, cw: dw.cw, right: dw.right, barRight: dw.barRight }));
    ok(dw && TITLES.zh && TITLES.ja && dw.w.zh <= dw.cw + 1 && dw.w.ja <= dw.cw + 1, '…and the zh / ja titles fit the same bar in its font (' + S(dw && dw.w) + ' ≤ ' + (dw && dw.cw) + ' px)', S(dw && { w: dw.w, cw: dw.cw, font: dw.font }));
    ok(dw && dw.label === 'A note for the agent (optional). Nothing is sent now. To have the agent continue right away: hand back, then press “Hand over now” on the strip above the composer (it starts a turn), or send it a message.' && dw.ok === 'Hand back', '…its label says that nothing is sent now and how to make the agent continue right away (the strip\'s Hand over now, or a message); the confirm says Hand back', S(dw && { label: dw.label, ok: dw.ok }));
    if (PNG_DIR && dw && dw.box) await png('handback-dialog-en.png', dw.box);
    const NOTE = 'I logged in — continue from the cart';
    await send('Input.insertText', { text: NOTE });
    for (const k of [['End', 'End', 35]]) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k[0], code: k[1], windowsVirtualKeyCode: k[2] }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], code: k[1], windowsVirtualKeyCode: k[2] }); }
    await sleep(300);
    const typed = await ev('const a = document.activeElement; return a && a.closest(".dialog-overlay, .dialog-form") ? a.value : null;');
    ok(typed === NOTE && up.inputs.length === inputs0, 'the note is typed INTO the box and not one key reached the page (the stream server got no input)', S({ typed, inputs: up.inputs.slice(inputs0).map((m) => m.type) }));
    const okBtn = await ev('const a = document.activeElement; const o = a && a.closest(".dialog-overlay, .dialog-form"); const b = o && o.querySelector("button.btn-create"); return b && b.textContent.trim() === "Hand back" ? rect(b) : null;');
    if (okBtn) await click(centre(okBtn));
    const handed = await until(() => ev('const s = L().state(); return s.mode === "watch" && !s.mine && !s.ownsKeyboard;'), 8000);
    ok(handed, 'a REAL click on Hand back: the takeover ended (the view is in watch mode, the keyboard released)', S(await ev('const s = L().state(); return { mode: s.mode, mine: s.mine, owns: s.ownsKeyboard, cont: s.contShown };')));
    const card = await until(() => ev('const w = chatWin(); const v = w && app.sessions.get(w.id); const m = v && (v._messages || []).find((x) => x.peerFrom === "VibeSpace browser" && x.peerVia === "notification" && /handed the browser back for the agent/.test((x.content && x.content[0] && x.content[0].text) || "")); return !!m;'), 8000);
    const cardMsg = await ev('const v = app.sessions.get(chatWin().id); const m = (v._messages || []).find((x) => x.peerFrom === "VibeSpace browser" && /handed the browser back/.test(x.content[0].text || "")); return m ? { text: m.content[0].text, n: (v._messages || []).filter((x) => x.peerFrom === "VibeSpace browser" && /handed the browser back/.test(x.content[0].text || "")).length, el: !!(v._elements && v._elements.get(m.id)) } : null;');
    ok(card && cardMsg && cardMsg.n === 1 && cardMsg.text.includes(NOTE) && /nothing was sent now/.test(cardMsg.text) && /on show: Page b\.test\//.test(cardMsg.text) && cardMsg.el, 'ONE card in the chat, drawn: "You handed the browser back for the agent\'s next turn: “…” — 3 tab(s); on show: Page b.test/ … nothing was sent now"', S(cardMsg));
    const stash = await until(() => ev('const r = row(); return !!(r && r.stash && (r.stash.items || []).some((i) => i.kind === "handback"));'), 8000);
    ok(stash, 'the conversation\'s stash holds it: "a browser handback" (the strip above the composer — its next turn reads it)', S(await ev('return row() && row().stash;')));
    // lane handback-words: the dialog's recipe is TRUE — the strip above the composer offers THIS hand-back with its Hand over now
    // ("· starts a turn": the agent is idle). Not pressed: the ledger check below proves nothing was billed
    const STRIP = 'app.sessions.get(chatWin().id)._chatInput._stashStrip.el';
    const stripUp = await until(() => ev(`const el = ${STRIP}; const go = el && el.querySelector('.chat-stash-go'); return !!(el && !el.hidden && go && !go.disabled && go.querySelector('.chat-stash-go-label').textContent === 'Hand over now');`), 8000);
    const strip = await ev(`const el = ${STRIP}; const go = el.querySelector('.chat-stash-go'); return { hidden: el.hidden, go: go.textContent, disabled: go.disabled, shown: !!go.offsetParent, parts: el.querySelector('.chat-stash-parts').textContent, box: rect(el) };`);
    ok(stripUp && strip.shown && strip.go === 'Hand over now · starts a turn' && /a browser handback/.test(strip.parts), 'the strip above the composer offers it: "Hand over now · starts a turn" with "a browser handback" waiting — the dialog\'s recipe holds', S(strip));
    if (PNG_DIR && strip.box && strip.box.width) { await ev('const w = chatWin(); app.goToWinId ? app.goToWinId(w.id) : wm.focusWindow(w.id); return true;'); await sleep(300); await png('handback-strip-en.png', await ev(`return rect(${STRIP});`)); await ev('const w = live(); app.goToWinId ? app.goToWinId(w.id) : wm.focusWindow(w.id); return true;'); await sleep(300); }   // the live view on top again, as ③ left it (④'s REAL clicks land on its bar)
    const ledger = (() => { try { return fs.readFileSync(path.join(wt, 'data', 'spend-budget.json'), 'utf8'); } catch { return ''; } })();
    ok(!/browser-handback/.test(ledger) && /handed back for the next turn — stashed/.test(journal) && !/announced into the conversation/.test(journal), 'NOTHING was billed: no spend-ledger row for a browser handback, the journal says "stashed" and never "announced into the conversation"', S({ ledger: ledger.slice(0, 300), tail: journal.split('\n').filter((l) => /handed back|handback/.test(l)).slice(-4) }));
    const next = await cli(['get', 'url']);
    ok(/\[browser_resumed\]/.test(next.stderr) && /handed it back/.test(next.stderr) && /current: Page b\.test\/ — https:\/\/b\.test\//.test(next.stderr) && !next.stderr.includes(NOTE), 'the agent\'s next command (the shipped CLI) is told once: "[browser_resumed] … handed it back … current: Page b.test/ — https://b.test/" (the note came with its turn, never twice)', S(next.stderr.slice(0, 600)));
    const next2 = await cli(['get', 'url']);
    ok(!/\[browser_resumed\]/.test(next2.stderr), '…and the command after it is told nothing', S(next2.stderr.slice(0, 300)));

    // ── ④ zh + ja: the two new controls in the device's language, whole in a 360 px window ──
    console.log('— ④ zh + ja: Resume and "Hand back with a note…" in the device\'s language, whole at 360 px');
    for (const [lang, resumeWord, contWord] of [['zh', '恢复', '交还并留言…'], ['ja', '再開', 'メモで戻す…']]) {
      await send('Runtime.evaluate', { expression: `localStorage.setItem('vibespace.lang', ${S(lang)}); true` });
      if (!ok(await boot(), `${lang}: the app booted again in ${lang}`)) continue;
      await sleep(600);
      await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
      await until(() => ev('return !!chatWin();'), 10000);
      await ev(`if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
      await until(() => ev('const l = L(); return !!(l && l.state().connected && l.state().frames >= 1);'), 12000);
      r = await j('POST', `/api/browser/session/${SID}/stop`, { ref: '~ephemeral' });
      up.drop();
      await ev('const w = live(); const el = w.element; wm.setMinSize && wm.setMinSize(w.id, null); el.style.width = "360px"; el.style.height = "560px"; window.dispatchEvent(new Event("resize")); return true;');
      const offer = await until(() => ev('const s = L().state(); return !!(s.stopped && s.resumeOffer && s.resumeText);'), 12000, 150);
      await sleep(400);
      const z = await ev('const l = L(); l.layoutBar && l.layoutBar(); const s = l.state(); const b = l.el().querySelector(".browser-live-reconnect"); return { resumeText: s.resumeText, folded: s.folded, btn: b && b.style.display !== "none" ? { sw: b.scrollWidth, cw: b.clientWidth, w: rect(b).width, h: rect(b).height, right: rect(b).left + rect(b).width, barRight: rect(l.el().querySelector(".browser-live-bar")).left + rect(l.el().querySelector(".browser-live-bar")).width } : null, width: rect(live().element).width };');
      ok(offer && z.resumeText === resumeWord && z.btn && z.btn.sw <= z.btn.cw + 1 && z.btn.right <= z.btn.barRight + 1 && !z.folded.includes('reconnect'), `${lang}: Resume says "${resumeWord}", whole and inside the bar of a ${Math.round(z.width)} px window (it never folds)`, S(z));
      const b2 = await ev('const b = L().el().querySelector(".browser-live-reconnect"); return rect(b);');
      await click(centre(b2));
      await until(() => ev('const s = L().state(); return s.connected && !s.stopped && s.contShown;'), 20000, 150);
      await sleep(400);
      const zc = await ev('const l = L(); l.layoutBar && l.layoutBar(); const s = l.state(); const c = l.el().querySelector(".browser-live-continue"); const onBar = c && c.style.display !== "none" && !s.folded.includes("continue"); return { contShown: s.contShown, contText: s.contText, onBar, fit: onBar ? c.scrollWidth <= c.clientWidth + 1 && rect(c).left + rect(c).width <= (rect(l.el().querySelector(".browser-live-bar")).left + rect(l.el().querySelector(".browser-live-bar")).width) + 1 : null, row: s.foldedRows.find((x) => x.label === s.contText) || null, folded: s.folded };');
      ok(zc.contShown && zc.contText === contWord && zc.onBar && zc.fit, `${lang}: "${contWord}" is offered after the Resume — WHOLE ON THE BAR of the 360 px window (never folded into the ⋯ row)`, S(zc));
      if (PNG_DIR) await png(`handback-bar-${lang}.png`, await ev('return rect(L().el().querySelector(".browser-live-bar"));'));
    }
    await send('Runtime.evaluate', { expression: `localStorage.removeItem('vibespace.lang'); true` });

    // ── ⑤ the agent's own `detach` RETIRES its browser's record — a fresh page's view still offers Resume (THE fact) ──
    console.log('— ⑤ the agent detached (its record retired): a freshly loaded view still offers Resume; a click brings the tabs back');
    const det = await cli(['detach']);
    up.drop();
    const retired = await until(async () => { const st5 = (await j('GET', `/api/browser/session/${SID}`)).json; return !!(st5 && !st5.ephemeral); }, 10000);
    ok(det.code === 0 && retired, 'the agent\'s `vibespace-browser detach`: its browser stopped and its record retired (the kept entry stays)', S({ det: det.stdout.slice(0, 200) + det.stderr.slice(0, 200) }));
    if (!ok(await boot(), 'the app booted again (a fresh page: the view has no browser of its own to remember)')) return;
    await sleep(600);
    await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
    const off5 = await until(() => ev('const l = L(); const s = l && l.state(); return !!(s && s.resumeOffer && s.resumeText);'), 15000, 150);
    const s5 = await ev('const s = L().state(); return { resumeOffer: s.resumeOffer, resumeText: s.resumeText, statusText: s.statusText, target: s.target, notStarted: s.notStarted, own: row() && row().browserFact && row().browserFact.own };');
    ok(off5 && /3 tab\(s\) and its logins are kept/.test(s5.statusText || ''), 'a view that never saw this browser (its record retired) offers Resume — read off THE fact (the conversation uses its own browser, kept, not running)', S(s5));
    const n5 = cmds().length;
    const b5 = await ev('const b = L().el().querySelector(".browser-live-reconnect"); return b && b.style.display !== "none" ? rect(b) : null;');
    if (b5) await click(centre(b5));
    const back5 = await until(() => ev('const s = L().state(); return !!(s.connected && !s.stopped && s.frames >= 1 && s.tabs.length === 3);'), 20000, 150);
    const after5 = cmds().slice(n5);
    ok(back5 && after5.includes('open https://a.test/') && after5.filter((x) => x.startsWith('tab new ')).length === 2, 'a REAL click: a new record, the three kept tabs reopened, the view connected by itself', S({ after5, st: await ev('const s = L().state(); return { connected: s.connected, tabs: s.tabs.length, error: s.error };') }));

    // ── ⑥ lane browser-resume C: THE TAB ROW ──
    console.log('— ⑥ the tab row: owners, no control while the agent drives, REAL switch / ✕ while you drive, the last tab, the handback, Close all…');
    const row6 = () => ev('const s = L().state(); return s.tabRow;');
    const rowOk = await until(async () => { const r6 = await row6(); return !!(r6 && r6.shown && r6.rows.length === 3 && r6.rows.every((x) => x.owner === 'agent')); }, 10000, 150);
    let R6 = await row6();
    ok(rowOk && R6.rows.every((x) => !x.canSwitch && !x.canClose) && R6.rows.filter((x) => x.active).length === 1 && R6.quit, 'the TAB ROW: one chip per tab of the agent\'s browser, each "The agent’s" (the bridge\'s `tab-owners`); while the agent drives NOTHING is drawn on them; "Close all…" at the row\'s end', S(R6));
    const takeTip = await ev('const b = L().el().querySelector(".browser-live-mode-btn"); return b ? b.title : null;');
    ok(/Take over to switch or close the agent’s tabs/.test(takeTip || ''), 'the Take over toggle (a WORKING control) names what taking over adds: "Take over to switch or close the agent’s tabs"', takeTip);
    const tk6 = await ev('const b = L().el().querySelector(".browser-live-mode-btn"); return b && b.offsetParent ? rect(b) : null;');
    if (tk6) await click(centre(tk6));
    const drawn6 = await until(async () => { const r6 = await row6(); return !!(r6 && r6.rows.length === 3 && r6.rows.every((x) => x.canClose) && r6.rows.filter((x) => x.canSwitch).length === 2); }, 8000, 120);
    R6 = await row6();
    ok(drawn6, 'a REAL Take over: every chip gets its ✕, every chip but the one on show is a switch', S(R6));
    const tabs6 = tabsOf();
    const cur6 = tabs6.find((x) => x.active), other6 = tabs6.find((x) => !x.active && x.url === 'https://c.test/') || tabs6.find((x) => !x.active);
    const chipRect = (id) => ev(`const el = L().el().querySelector('.browser-live-tabchip[data-target="' + ${S(id)}.toUpperCase() + '"]'); return el && el.offsetParent ? rect(el) : null;`);
    const closeRect = (id) => ev(`const el = L().el().querySelector('.browser-live-tabchip[data-target="' + ${S(id)}.toUpperCase() + '"] .browser-live-tabchip-close'); return el && el.offsetParent ? rect(el) : null;`);
    const n6 = cmds().length;
    const cr6 = await chipRect(other6.targetId);
    if (cr6) await click({ x: cr6.left + 14, y: cr6.top + cr6.height / 2 });
    const sw6 = await until(() => tabsOf().find((x) => x.active)?.targetId === other6.targetId, 8000, 100);
    ok(sw6 && cmds().slice(n6).includes(`tab ${other6.targetId.toUpperCase()}`), `a REAL click on a chip SWITCHES the agent's tab (under its own session, by target id): ${other6.url} is on show`, S({ after: cmds().slice(n6), active: tabsOf().find((x) => x.active) }));
    await until(async () => (await row6()).rows.find((x) => x.active)?.targetId === other6.targetId.toUpperCase(), 5000, 100);
    await sleep(3400); // past the takeover anchor's grace: an AGENT's switch would now refuse his input tab_switched
    const inp6 = up.inputs.length;
    const cv6 = await ev('const c = L().el().querySelector(".browser-live-canvas"); return rect(c);');
    await click({ x: cv6.left + 40, y: cv6.top + 40 });
    const fwd6 = await until(() => up.inputs.length > inp6, 4000, 80);
    const rcpt6 = await ev('const s = L().state(); return s.receipts || s.lastReceipt || null;');
    ok(fwd6, 'HIS switch moved the takeover\'s anchor: his next click on the picture reaches the page (never `tab_switched`)', S({ inputs: up.inputs.slice(inp6).map((m) => m.type), rcpt6 }));
    // ✕ on a tab that is NOT on show
    const rest6 = tabsOf().filter((x) => x.targetId !== other6.targetId);
    const victim = rest6.find((x) => !x.active);
    const n7 = cmds().length;
    const xr = await closeRect(victim.targetId);
    if (xr) await click(centre(xr));
    const gone6 = await until(() => !tabsOf().some((x) => x.targetId === victim.targetId), 8000, 100);
    ok(gone6 && cmds().slice(n7).includes(`tab close ${victim.targetId.toUpperCase()}`) && tabsOf().find((x) => x.active)?.targetId === other6.targetId, `a REAL ✕ closes the agent's tab ${victim.url} under its own session — the tab on show stays`, S({ after: cmds().slice(n7), tabs: tabsOf() }));
    await until(async () => (await row6()).rows.length === 2, 5000, 100);
    // a refused close names why (the browser refuses it: the keeper's `tab_failed`)
    fs.writeFileSync(path.join(AB, 'fail-close'), '1');
    const keepOne = tabsOf().find((x) => x.targetId !== other6.targetId);
    const xr2 = await closeRect(keepOne.targetId);
    if (xr2) await click(centre(xr2));
    const err6 = await until(async () => { const r6 = await row6(); return !!(r6.error && r6.error.act === 'close'); }, 6000, 100);
    fs.unlinkSync(path.join(AB, 'fail-close'));
    ok(err6 && tabsOf().some((x) => x.targetId === keepOne.targetId), 'a close the browser refuses is SAID (the toast\'s words: "Could not close the tab: …") — never silence; the tab stays', S({ error: (await row6()).error, xr2, row: await row6(), cmds: cmds().slice(-6), tail: journal.split('\n').filter((l) => /tab /.test(l)).slice(-4) }));
    // ✕ on the tab ON SHOW: the agent moves to its neighbour first, then the tab closes; the last tab has no ✕
    const n8 = cmds().length;
    const xr3 = await closeRect(other6.targetId);
    if (xr3) await click(centre(xr3));
    const gone7 = await until(() => !tabsOf().some((x) => x.targetId === other6.targetId), 8000, 100);
    const a8 = cmds().slice(n8);
    ok(gone7 && a8.indexOf(`tab ${keepOne.targetId.toUpperCase()}`) >= 0 && a8.indexOf(`tab ${keepOne.targetId.toUpperCase()}`) < a8.indexOf(`tab close ${other6.targetId.toUpperCase()}`) && tabsOf().length === 1 && tabsOf()[0].active, '✕ on the tab ON SHOW: the agent\'s session moves to its neighbour FIRST, then the tab closes (the view keeps a picture)', S({ a8, tabs: tabsOf() }));
    const last6 = await until(async () => { const r6 = await row6(); return r6.rows.length === 1 && !r6.rows[0].canClose; }, 5000, 100);
    ok(last6, 'the agent\'s LAST tab carries no ✕ (Close all… is the way to end it)', S(await row6()));
    // the handback carries his acts (said to the agent in the handback's own words — test-browser-tabs ② pins the sentence)
    const hb6 = await ev('const b = L().el().querySelector(".browser-live-handback"); return b && b.offsetParent ? rect(b) : null;');
    if (hb6) await click(centre(hb6));
    // verify F3: each act is recorded at its own exec's check, so the list is in the order they RAN — the ✕ on the tab on
    // show is its neighbour move (tab-switch) THEN its close
    const said6 = await until(() => /the user's tab acts while driving \(said to the agent\): tab-switch, tab-close, tab-switch, tab-close/.test(journal), 8000, 100);
    ok(said6, 'the handback carries what he did to the agent\'s tabs, in the order it ran (the keeper: "the user\'s tab acts while driving (said to the agent): tab-switch, tab-close, tab-switch, tab-close")', journal.split('\n').filter((l) => /handed back to the agent/.test(l)).slice(-2).join('\n'));
    const watch6 = await until(async () => { const r6 = await row6(); return r6.rows.every((x) => !x.canClose && !x.canSwitch); }, 5000, 100);
    ok(watch6, 'handed back: the row draws no control again');
    // "Close all…" asks BY THE BROWSER'S NAME; cancelled ⇒ nothing stopped
    const n9 = cmds().length;
    await until(async () => (await row6()).quit, 8000, 120); // the row's end follows the conversation's browser rows (a handback re-reads them)
    const q6 = await ev('const b = L().el().querySelector(".browser-live-tabrow-quit"); return b && b.offsetParent ? rect(b) : null;');
    if (q6) await click(centre(q6));
    const asked = await until(async () => { const r6 = await row6(); return !!r6.quitAsked; }, 4000, 100);
    const qa = (await row6()).quitAsked || {};
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(600);
    ok(asked && /^Close all tabs of “.+”\?$/.test(qa.title) && /every tab of it closes/.test(qa.message) && !cmds().slice(n9).some((c) => /^close/.test(c)) && (await ev('return L().state().connected && !L().state().stopped;')), '"Close all…" asks ONCE, naming the browser ("Close all tabs of “…”?"); cancelled ⇒ nothing stopped', S({ qa, q6, after: cmds().slice(n9), row: await row6() }));
    // zh + ja: the row at 360 px — whole, the tab on show never folded
    await cli(['tab', 'new', 'https://d.test/a-long-page-title-that-goes-on']); await cli(['tab', 'new', 'https://e.test/']);
    for (const [lang, mark, quitWord] of [['zh', 'agent 的', '全部关闭…'], ['ja', 'エージェントの', 'すべて閉じる…']]) {
      await send('Runtime.evaluate', { expression: `localStorage.setItem('vibespace.lang', ${S(lang)}); true` });
      if (!ok(await boot(), `${lang}: the app booted again in ${lang}`)) continue;
      await sleep(600);
      await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
      await until(async () => { const l = await ev('const l = L(); return !!(l && l.state().tabRow.shown && l.state().tabRow.rows.length === 3);'); return l; }, 12000, 150);
      await ev('const w = live(); const el = w.element; wm.setMinSize && wm.setMinSize(w.id, null); el.style.width = "360px"; el.style.height = "560px"; window.dispatchEvent(new Event("resize")); return true;');
      await sleep(700);
      const z6 = await ev('const l = L(); const s = l.state(); const r = l.el().querySelector(".browser-live-tabrow"); const q = l.el().querySelector(".browser-live-tabrow-quit"); const act = s.tabRow.rows.find((x) => x.active); const actEl = act ? l.el().querySelector(\'.browser-live-tabchip[data-target="\' + act.targetId + \'"]\') : null; return { rows: s.tabRow.rows.map((x) => x.mark), folded: s.tabRow.folded, activeFolded: act ? s.tabRow.folded.includes(act.targetId) : null, row: rect(r), sw: r.scrollWidth, cw: r.clientWidth, quit: q && q.offsetParent ? { text: s.tabRow.quitText, sw: q.scrollWidth, cw: q.clientWidth, right: rect(q).left + rect(q).width } : null, actRect: actEl && actEl.offsetParent ? rect(actEl) : null };');
      ok(z6.rows.every((x) => x === mark) && z6.quit && z6.quit.text === quitWord && z6.quit.sw <= z6.quit.cw + 1 && z6.quit.right <= z6.row.left + z6.row.width + 1 && z6.activeFolded === false && z6.actRect && z6.actRect.left + z6.actRect.width <= z6.row.left + z6.row.width + 1 && z6.sw <= z6.cw + 1,
        `${lang}: the row in the device's words ("${mark}", "${quitWord}"), whole in a 360 px window — nothing overflows, the tab on show never folds (${z6.folded.length} folded into ▾+N)`, S(z6));
    }
    // ⑦ lane live-watch-polish (B-93d7, design 006 G1–G4): WATCH A FOLDED TAB in zh at 360 px — the "▾+N" menu's entry says
    //    "查看 — …" (never a greyed row), the line names BOTH tabs, the watched chip is kept on the row, the agent's tab is
    //    untouched; the view's socket dropped ⇒ the reconnected view re-sends its watch (one truth). A fake CDP page endpoint
    //    (the fake agent-browser's cdp-url names it) answers the capture: no screencast frame ⇒ polled, as a background tab is.
    console.log('— ⑦ zh: a folded tab watched from the ▾+N menu; the line names both tabs; a reconnect keeps one truth');
    {
      const CDPF = await freePort(); const pages = [];
      const cdpSrv = new WebSocketServer({ port: CDPF, host: '127.0.0.1' }); await new Promise((r) => cdpSrv.on('listening', r));
      cdpSrv.on('connection', (ws, req) => {
        const m = /^\/devtools\/page\/([0-9A-Fa-f]{16,64})$/.exec(req.url || ''); if (!m) { ws.terminate(); return; }
        pages.push({ id: m[1].toUpperCase(), ws });
        ws.on('message', (d) => { let q = null; try { q = JSON.parse(d); } catch { return; } const result = q.method === 'Page.captureScreenshot' ? { data: FRAME.data } : q.method === 'Page.getLayoutMetrics' ? { cssLayoutViewport: { clientWidth: 800, clientHeight: 600, pageX: 0, pageY: 0 } } : {}; try { ws.send(JSON.stringify({ id: q.id, result })); } catch { } });
        ws.on('error', () => { });
      });
      const opened = (id) => pages.filter((p) => p.id === id).length;
      try {
        fs.writeFileSync(path.join(AB, 'cdp.json'), JSON.stringify({ [ns]: CDPF }));
        await cli(['tab', 'new', 'https://f.test/']); await cli(['tab', 'new', 'https://g.test/']);
        await send('Runtime.evaluate', { expression: `localStorage.setItem('vibespace.lang', 'zh'); true` });
        if (ok(await boot(), 'zh: the app booted again for the watch leg')) {
          await sleep(600);
          await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
          await until(async () => !!(await ev('const l = L(); return !!(l && l.state().connected && l.state().tabRow.shown && l.state().tabRow.rows.length === 5);')), 12000, 150);
          await ev('const w = live(); const el = w.element; wm.setMinSize && wm.setMinSize(w.id, null); el.style.width = "360px"; el.style.height = "560px"; window.dispatchEvent(new Event("resize")); return true;');
          await sleep(900);
          const agentTab0 = (tabsOf().find((x) => x.active) || {}).targetId || null;
          const s0 = await ev('const s = L().state(); return { rows: s.tabRow.rows, folded: s.tabRow.folded, mode: s.mode };');
          const pick = s0.rows.find((x) => s0.folded.includes(x.targetId) && !x.active && x.owner === 'agent') || null;
          const more = await ev('const b = L().el().querySelector(".browser-live-tabrow-more"); return b && b.offsetParent ? rect(b) : null;');
          if (more) await click(centre(more));
          await sleep(300);
          const menu = await ev('return [...document.querySelectorAll(".context-menu .context-menu-item")].map((el) => ({ text: el.textContent, disabled: el.classList.contains("disabled"), r: rect(el) }));');
          const entry = pick ? menu.find((x) => x.text.startsWith('查看 — ') && x.text.includes(pick.title)) : null;
          ok(!!pick && menu.length > 0 && !menu.some((x) => x.disabled) && !!entry, `G1 zh: the "▾+N" menu (${s0.folded.length} folded) lists a folded agent tab as "查看 — ${pick ? pick.title : '?'}" — no greyed row`, S({ s0, menu }));
          if (entry) await click(centre(entry.r));
          const watched = !!pick && await until(async () => { const t = await ev('return L().state().tabRow;'); return !!(t.watch && t.watch.targetId === pick.targetId && !t.watch.pending && /^正在查看“/.test(t.watchLine)); }, 8000, 150);
          const t1 = await ev('return L().state().tabRow;');
          const cur = t1.rows.find((x) => x.active) || {};
          ok(watched && t1.watchLine.includes('“' + pick.title + '”') && t1.watchLine.includes('agent 在“' + cur.title + '”上') && !t1.folded.includes(pick.targetId) && opened(pick.targetId) > 0 && (tabsOf().find((x) => x.active) || {}).targetId === agentTab0,
            'G2/G3 zh: the view watches the folded tab — the line names BOTH tabs ("正在查看“…” — …agent 在“…”上"), the watched chip is kept on the row, the capture opened on it, the agent\'s tab untouched', S({ t1, pages: pages.map((p) => p.id), agentTab0 }));
          // G4: the view's socket drops — the reconnected view re-sends its watch; the line and the picture tell ONE truth
          const p0 = pick ? opened(pick.targetId) : 0;
          await ev('const ws = L().ws(); if (ws) ws.close(); return true;');
          const again = !!pick && await until(async () => { const t = await ev('const s = L().state(); return { c: s.connected, w: s.tabRow.watch, line: s.tabRow.watchLine };'); return !!(t.c && opened(pick.targetId) > p0 && t.w && t.w.targetId === pick.targetId && !t.w.pending && t.line.includes('“' + pick.title + '”')); }, 15000, 200);
          ok(again, 'G4 zh: the socket dropped and reopened — the view re-sent its watch (a new capture on the watched tab) and its line still names it: one truth', S(await ev('const s = L().state(); return { c: s.connected, tr: s.tabRow };')));
        }
      } finally {
        try { fs.unlinkSync(path.join(AB, 'cdp.json')); } catch { }
        for (const p of pages) { try { p.ws.terminate(); } catch { } }
        await new Promise((r) => cdpSrv.close(() => r()));
      }
    }
    // ⑧ lane browser-tabs-by-window (the owner, 2026-10-08 — two agents read as one window): THE TABS BY WINDOW, zh. The
    //    owner's scene (profile hanabi-work: this conversation's window, 企业助手's window, each with its blank anchor) fed
    //    through the live view's OWN socket handler in the shapes the real bridge sends (`tabs` + `tab-owners` with
    //    `windows` / `leases` — test-browser-share ③c proves those facts on the real binary): the row = this window's chip
    //    first, a divider naming 企业助手's window, its chip; the pane = two heads (本窗口 / 企业助手 的窗口, each "+1 个空白页"),
    //    indented rows, "标签页 (2 · +2 个空白页)"; no window number in any word. PNGs where VIBESPACE_TABS_PNG_DIR names a dir.
    console.log('— ⑧ zh: the tabs BY WINDOW — this window first, 企业助手 的窗口 next, the blank anchors folded');
    {
      const A = 'A'.repeat(32), B = 'B'.repeat(32), C = 'C'.repeat(32), D = 'D'.repeat(32), WA = 896114259, WB = 896114295;
      const tabs = [{ tabId: 't1', targetId: A, title: 'Enterprise | Find a supplier', url: 'https://enterprise.example/find', active: true }, { tabId: 't2', targetId: B, title: 'Read - Meeting Report', url: 'https://read.example/meeting-report' }, { tabId: 't3', targetId: C, title: 'about:blank', url: 'about:blank' }, { tabId: 't4', targetId: D, title: 'about:blank', url: 'about:blank' }];
      const rec = { type: 'tab-owners', owners: { [A]: 'agent', [B]: 'other', [C]: 'orphan', [D]: 'orphan' }, titles: {}, names: { [B]: { sessionId: null, name: '企业助手' } }, windows: { [A]: WA, [B]: WB, [C]: WA, [D]: WB }, leases: [{ windowId: WA, word: 'agent', sessionId: null, name: null }, { windowId: WB, word: 'other', sessionId: null, name: '企业助手' }], mediated: false, adoptable: false };
      await ev('const w = live(); const el = w.element; el.style.width = "900px"; el.style.height = "620px"; window.dispatchEvent(new Event("resize")); return true;');
      const feed = `const w = L().ws(); w.onmessage({ data: ${S(S({ type: 'tabs', tabs }))} }); w.onmessage({ data: ${S(S(rec))} });`;
      const read = `const root = L().el(); const pane = root.querySelector('.browser-live-tabs'); const btn = root.querySelector('.browser-live-side-btn[data-pane="tabs"]'); if (pane.style.display === 'none') btn.click();
        const t0 = Date.now(); while (Date.now() - t0 <= 3000 && !(root.querySelectorAll('.browser-live-tabrow-list > .browser-live-tabchip').length >= 2 && pane.querySelector('.browser-live-tabgroup'))) await new Promise((r) => setTimeout(r, 25));
        const waitedMs = Date.now() - t0, timedOut = waitedMs > 3000;
        const kids = [...root.querySelectorAll('.browser-live-tabrow-list > *')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.target ? 'chip:' + e.dataset.target.slice(0, 1) : 'div:' + e.textContent);
        const pk = [...pane.children].map((e) => e.classList.contains('browser-live-tabgroup') ? 'head:' + e.textContent : 'tab:' + String(e.dataset.key || '').slice(2, 3) + (e.classList.contains('in-group') ? '>' : ''));
        const words = [...root.querySelectorAll('.browser-live-tabrow-divider, .browser-live-tabgroup')].map((e) => e.textContent + ' ' + e.title).join(' | ') + ' | ' + btn.textContent;
        return { kids, pk, btn: btn.textContent, words, waitedMs, timedOut, row: rect(root.querySelector('.browser-live-tabrow')), pane: rect(pane) };`;
      // r1100 (4), the same class outside §9: the read WAITS for the row's chips and the pane's heads (bounded 3 s, was a fixed
      // 400 ms) and says when they never came — that red is «the state never came», not the product's verdict
      const g8 = await ev(feed + read);
      const never8 = g8.timedOut ? ' — THE STATE NEVER CAME in 3 s (no two chips and a window head were drawn): this red is that, not a verdict on the product' : '';
      ok(!g8.timedOut && S(g8.kids) === S(['chip:A', 'div:企业助手 的窗口', 'chip:B']), '⑧ zh ROW: this window\'s chip first, a divider naming 企业助手\'s window, then its chip (the blank anchors are no chips)' + never8, S(g8));
      ok(S(g8.pk) === S(['head:本窗口 · +1 个空白页', 'tab:A>', 'head:企业助手 的窗口 · +1 个空白页', 'tab:B>']) && g8.btn === '标签页 (2 · +2 个空白页)', '⑧ zh PANE: 本窗口 then 企业助手 的窗口, each head folding its blank ("+1 个空白页"), the rows indented; the count says "标签页 (2 · +2 个空白页)"' + never8, S(g8));
      ok(!/\d{6,}/.test(g8.words), '⑧ no window number in any word of the row or the pane', g8.words);
      // KEYED (R4): a second identical record patches in place — the pane's first node is the same node
      const k8 = await ev('const pane = L().el().querySelector(".browser-live-tabs"); const a = pane.firstChild, b = pane.children[1]; ' + feed + ' await new Promise((r) => setTimeout(r, 200)); return pane.firstChild === a && pane.children[1] === b;');
      ok(k8 === true, '⑧ the pane is KEYED: the same record again moves no node (never an innerHTML rebuild under the pointer)');
      const dir = process.env.VIBESPACE_TABS_PNG_DIR;
      if (dir) {
        await ev(feed + 'return true;'); await sleep(300);
        const g9 = await ev(read);
        for (const [name, r] of [['after-row-zh.png', g9.row], ['after-pane-zh.png', { left: g9.pane.left, top: g9.pane.top, width: g9.pane.width, height: Math.min(g9.pane.height, 260) }]]) {
          const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.left, y: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height), scale: 1 } });
          if (shot.result?.data) { fs.writeFileSync(path.join(dir, name), Buffer.from(shot.result.data, 'base64')); console.log(`    PNG ${path.join(dir, name)}`); }
        }
      }
    }
    // ⑨ B-e674 unit 1 (the coordinator's r548 / r562): A TAB THAT IS NOT THIS CONVERSATION'S IN FRONT OF ITS WINDOW, zh. The
    //    hub's verdict (`tab-owners.front` — test-browser-front-tab proves the keeper's read and the bridge) fed through the live
    //    view's OWN socket handler: THAT chip says «在此窗口最前面», its tip whose it is; CONTROL the same record without the
    //    verdict marks nothing (and a blank nobody holds stays hidden); a blank nobody holds in front is drawn and marked. PNGs
    //    of the row at a 390 px and a 1280 px viewport where VIBESPACE_TABS_PNG_DIR names a dir.
    console.log('— ⑨ zh: a tab that is not this conversation\'s in front of its window — marked on its own chip');
    {
      const A = 'A'.repeat(32), E = 'E'.repeat(32), N = '9'.repeat(32), WA = 896114259;
      const tabs = [{ tabId: 't1', targetId: A, title: 'Enterprise | Find a supplier', url: 'https://enterprise.example/find', active: true }, { tabId: 't5', targetId: E, title: 'Read - Meeting Report', url: 'https://read.example/meeting-report' }, { tabId: 't6', targetId: N, title: 'about:blank', url: 'about:blank' }];
      const base = { type: 'tab-owners', owners: { [A]: 'agent', [E]: 'other', [N]: 'orphan' }, titles: {}, names: { [E]: { sessionId: null, name: '企业助手' } }, windows: { [A]: WA, [E]: WA, [N]: WA }, leases: [{ windowId: WA, word: 'agent', sessionId: null, name: null }], mediated: false, adoptable: false };
      const frontE = { state: 'foreign', windowId: WA, targetId: E, owner: 'other' }, frontN = { state: 'foreign', windowId: WA, targetId: N, owner: 'orphan' };
      const feedOf = (rec) => `const w = L().ws(); w.onmessage({ data: ${S(S({ type: 'tabs', tabs }))} }); w.onmessage({ data: ${S(S(rec))} });`;
      // r1100 + r1111 (the 2.369.414 release mirror's red, placed to its mechanism by the coordinator's probe runs on the box: the
      // r943 CONTROL judged a fit that RAN at the end button's OLD width — that button's .file-tool-btn rule animates every property,
      // so the planted spacing was grown into over 0.15 s after the fit, and nothing refitted when it had grown; the first hosted run
      // that passed, 74 of 74, passed only because its frame came late): (2) a leg that judges the fit PROVES A FIT RAN — after a
      // feed or a plant it waits for real frames (bounded) and prints whether one came and the page's visibility; the feed's own
      // result or exception is READ; a planted face is judged only AFTER IT SETTLED (settledJs, bounded, red by name when it does
      // not). (1) A wait that never sees its state SAYS SO: it returns {r, timedOut, ms}; its judge is red «the state never came in
      // N s», never the product's.
      const FRAMES = (ms) => `const fr = await new Promise((res) => { let n = 0; const t = setTimeout(() => res(n), ${ms}); const tick = () => { n++; if (n >= 2) { clearTimeout(t); res(n); } else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });`;
      const feedRun = (rec, ms = 3000) => ev(`let fed = true, error = null; try { ${feedOf(rec)} } catch (e) { fed = false; error = String((e && e.message) || e); } ${FRAMES(ms)} return { fed, error, frames: fr, visibility: document.visibilityState };`);
      // r1111 B: WHAT WAS PLANTED HAS SETTLED — the end button's box the same over two frames with no animation running (bounded)
      const settledJs = (ms) => `const q = L().el().querySelector('.browser-live-tabrow-quit'); const frame = () => new Promise((r) => { const t = setTimeout(r, 100); requestAnimationFrame(() => { clearTimeout(t); r(); }); }); const t0 = Date.now(); let last = null, same = 0; for (;;) { await frame(); const w = q && q.offsetParent ? Math.round(q.getBoundingClientRect().width * 10) / 10 : null; const anim = q && q.getAnimations ? q.getAnimations().length : 0; if (w === last && !anim) { if (++same >= 2) return { settled: true, ms: Date.now() - t0, w, anim }; } else same = 0; last = w; if (Date.now() - t0 > ${ms}) return { settled: false, ms: Date.now() - t0, w, anim }; }`;
      const untilJs = (readerBody, cond, ms) => `const read = () => { ${readerBody} }; const t0 = Date.now(); for (;;) { const r = read(); const a = r; if (${cond}) return { r, timedOut: false, ms: Date.now() - t0 }; if (Date.now() - t0 > ${ms}) return { r, timedOut: true, ms: Date.now() - t0 }; await new Promise((q) => setTimeout(q, 25)); }`;
      const judged = (w, fr, name, judge, ms, sd = null) => {
        if (sd && !sd.settled) return ok(false, `${name} — WHAT IT PLANTED NEVER SETTLED in ${sd.ms / 1000} s (the end button still changing: ${sd.w} px, ${sd.anim} animation(s) running): the row is judged only after it settles, so this is no verdict on the product`, S(w && w.r));
        const noFit = !!fr && (!fr.fed || !fr.frames);
        if (!w || w.timedOut || noFit) return ok(false, `${name} — THE STATE NEVER CAME in ${ms / 1000} s (the feed ${fr ? (fr.fed ? 'ran' : 'threw ' + fr.error) : '?'}; frames after it ${fr ? fr.frames : '?'}; the page ${fr ? fr.visibility : '?'}): ${noFit ? 'no fit ran to be judged' : 'the last read below is the wait\'s'}, so this is no verdict on the product`, S(w && w.r));
        return ok(!!judge(w.r), name, S(w.r));
      };
      // B-e674 unit 2 (its round's should 5): no fixed sleep — the read WAITS for the chips it expects (≤ 2 s), then says what it saw
      const chipsUntil = (cond) => `const readA = () => [...L().el().querySelectorAll('.browser-live-tabrow-list > .browser-live-tabchip')].filter((e) => e.style.display !== 'none').map((e) => ({ id: e.dataset.target.slice(0, 1), front: e.classList.contains('front-foreign'), here: (e.querySelector('.browser-live-tabchip-here') || {}).textContent || '', tip: e.title }));
        const t0 = Date.now(); for (;;) { const a = readA(); if (${cond}) return { r: a, timedOut: false, ms: Date.now() - t0 }; if (Date.now() - t0 > 2000) return { r: a, timedOut: true, ms: Date.now() - t0 }; await new Promise((r) => setTimeout(r, 25)); }`; // r1100 (1): a timed-out mark
      await ev('const w = live(); const el = w.element; el.style.width = "900px"; el.style.height = "620px"; window.dispatchEvent(new Event("resize")); return true;');
      const fr1 = await feedRun({ ...base, front: frontE });
      const w1 = await ev(chipsUntil("a.some((x) => x.id === 'E' && x.front)"));
      judged(w1, fr1, '⑨ zh: 企业助手\'s tab in front of this window — ITS chip says «在此窗口最前面», its tip whose it is and that nothing is moved or closed',
        (f1) => { const cE = (f1 || []).find((x) => x.id === 'E'); return !!cE && cE.front && cE.here === '在此窗口最前面' && cE.tip.includes('企业助手 的标签页在此窗口最前面') && cE.tip.includes('不会为它移动或关闭任何标签页') && f1.filter((x) => x.front).length === 1; }, 2000);
      const fr0 = await feedRun(base);
      const w0 = await ev(chipsUntil('!a.some((x) => x.front)'));
      judged(w0, fr0, '⑨ CONTROL: the same record without the verdict marks no chip, and the blank nobody holds stays hidden', (f0) => Array.isArray(f0) && !f0.some((x) => x.front) && !f0.some((x) => x.id === '9'), 2000);
      const fr2 = await feedRun({ ...base, front: frontN });
      const w2 = await ev(chipsUntil("a.some((x) => x.id === '9' && x.front)"));
      judged(w2, fr2, '⑨ zh: a blank NOBODY holds in front of this window is drawn and marked', (f2) => { const cN = (f2 || []).find((x) => x.id === '9'); return !!cN && cN.front && cN.tip.includes('无人持有的标签页在此窗口最前面'); }, 2000);
      // B-e674 (the coordinator's r608): THE ROW AT 390 AND 1280 px, JUDGED — not only pictured. Line 97's 390 picture folded
      // the front chip into «▾+1» with nothing said: the law is its chip whole (this view's own chip cuts first), else the fold
      // names it IN WORDS («▾+N · 最前面», the front's words in its tip). Then the picture (where VIBESPACE_TABS_PNG_DIR names a dir).
      // r1100 (3): a chip's «whole» = it ends INSIDE the row's list and nothing of it is clipped (shown is not whole)
      const rowAt = `const root = L().el(); const vis = (e) => !!e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0; const fc = root.querySelector('.browser-live-tabchip.front-foreign'); const more = root.querySelector('.browser-live-tabrow-more'); const own = root.querySelector('.browser-live-tabchip.active');
        const list = root.querySelector('.browser-live-tabrow-list'); const listRight = list ? Math.round(list.getBoundingClientRect().right) : 0;
        return { chip: vis(fc) ? { id: String(fc.dataset.target || '').slice(0, 1), here: (fc.querySelector('.browser-live-tabchip-here') || {}).textContent || '', w: Math.round(fc.getBoundingClientRect().width), right: Math.round(fc.getBoundingClientRect().right), whole: Math.round(fc.getBoundingClientRect().right) <= listRight + 1 && fc.scrollWidth <= fc.clientWidth + 1 } : null, more: vis(more) ? { text: more.textContent, marked: more.classList.contains('front-foreign'), tip: more.title } : null,
          own: own ? { w: Math.round(own.getBoundingClientRect().width), cut: own.style.maxWidth || '', bare: own.classList.contains('bare'), scroll: own.scrollWidth, client: own.clientWidth, right: Math.round(own.getBoundingClientRect().right), parts: [...own.querySelectorAll('.browser-live-tabchip-here, .browser-live-tabchip-mark')].filter((e) => vis(e) && getComputedStyle(e).display !== 'none').map((e) => ({ s: e.scrollWidth, c: e.clientWidth, right: Math.round(e.getBoundingClientRect().right) })) } : null, listRight, row: rect(root.querySelector('.browser-live-tabrow')) };`;
      for (const wpx of [390, 1280]) {
        await send('Emulation.setDeviceMetricsOverride', { width: wpx, height: 900, deviceScaleFactor: 1, mobile: false });
        await ev(`const w = live(); const el = w.element; el.style.left = "0px"; el.style.width = "${wpx - 10}px"; el.style.height = "520px"; window.dispatchEvent(new Event("resize")); return true;`);
        const frW = await feedRun({ ...base, front: frontE }); // r1100 (2): the feed's own result, and whether a frame came after it
        // line 100's cure (r618): the wait is for THE STATE THIS FEED ASKS FOR — 企业助手's own chip, or a fold whose tip names 企业助手 —
        // never «any marked fold» (the scene before left one behind); bounded, and the judge below is red by name when it never comes
        // r943 (the 2.369.414 candidate's hosted red, twice): at 1280 px the read was the 390 px SCENE's row — the own chip still cut
        // to 186 px and bare, the front still folded, with 1141 px of list free — because «a fold whose tip names 企业助手» is also
        // what 390 left behind: on the runner's slower draw the wait ended on it before the 1280 fit. Where there is room the wait
        // asks for THAT width's state (the front's chip whole), bounded 5 s; the judge below is red by name when it never comes
        const wantChip = wpx === 1280;
        // r1100 (1): the wait returns its mark — a timed-out read is red as «the state never came», never judged as the product
        const ww = await ev(untilJs(rowAt, `(r.chip && r.chip.id === 'E' && r.chip.here && r.chip.whole) || (${wantChip ? 'false' : 'true'} && r.more && r.more.marked && r.more.tip.includes('企业助手 的标签页'))`, 5000));
        const seen = ww && ww.r;
        console.log(`    ⑨ the row at ${wpx} px (the feed ${frW.fed ? 'ran' : 'threw ' + frW.error}; frames after it ${frW.frames}; the page ${frW.visibility}; waited ${ww && ww.ms} ms${ww && ww.timedOut ? ', TIMED OUT' : ''}): ${S(seen)}`);
        judged(ww, frW, `⑨ zh at ${wpx} px: the foreign front is SAID — its chip whole inside the list («在此窗口最前面»), or the fold names it in words (r608: never folded unsaid)`, (r) => !!((r.chip && r.chip.here === '在此窗口最前面' && r.chip.whole) || (r.more && r.more.marked && r.more.text.includes('最前面') && r.more.tip.includes('企业助手 的标签页在此窗口最前面'))), 5000);
        if (wpx === 1280) judged(ww, frW, '⑨ zh at 1280 px: there is room — the front\'s own chip, whole inside the list', (r) => !!(r.chip && r.chip.here === '在此窗口最前面' && r.chip.whole), 5000);
        if (wpx === 1280) {
          // r943 THE LAW, whatever face the machine draws zh with: a PLANTED WIDE FACE (every CJK glyph a quarter wider, by the row's
          // own letter-spacing) — the fit measures the text as drawn, so where there is room the front's chip is still whole; CONTROL:
          // the same face with NO ROOM, made by a planted end-button width it reads back (r1571, below) — the chip cannot be whole there
          // (the fold says it), so this judge can go red
          const plant = async (em) => ev(`let st = document.getElementById('r943-face'); if (!st) { st = document.createElement('style'); st.id = 'r943-face'; document.head.appendChild(st); } st.textContent = ${JSON.stringify('')} + (${em} ? '.browser-live-tabrow, .browser-live-tabrow * { letter-spacing: ${em}em !important; }' : ''); window.dispatchEvent(new Event('resize')); return true;`);
          // r1100 + r1111: each plant is fed and proves a frame came after it, then WAITS FOR WHAT IT PLANTED TO SETTLE (the end button
          // grows into a new spacing over its 0.15 s transition), then asks for ITS face's state (bounded 5 s) with a mark: the
          // 2.369.414 mirror's red was the CONTROL judging the row of a fit run at the button's old width, nothing refitting after
          const facePlace = (fr, w, sd) => `the feed ${fr.fed ? 'ran' : 'threw ' + fr.error}; frames after it ${fr.frames}; the page ${fr.visibility}; ${sd.settled ? 'settled' : 'NOT SETTLED'} in ${sd.ms} ms (the end button ${sd.w} px); waited ${w && w.ms} ms${w && w.timedOut ? ', TIMED OUT' : ''}`;
          await plant(0.25); const frA = await feedRun({ ...base, front: frontE }); const sdA = await ev(settledJs(3000));
          const wA = await ev(untilJs(rowAt, "r.chip && r.chip.id === 'E' && r.chip.here && r.chip.whole", 5000));
          const wide = wA && wA.r;
          console.log(`    ⑨ the row at 1280 px under a planted WIDE face (letter-spacing 0.25em; ${facePlace(frA, wA, sdA)}): ${S(wide)}`);
          judged(wA, frA, 'r943: under a planted WIDER zh face (0.25em more per glyph) at 1280 px there is still room — the front\'s own chip, whole inside the list, and this view\'s own chip unclipped (the fit measures the text as drawn)', (r) => !!(r.chip && r.chip.here === '在此窗口最前面' && r.chip.whole && r.own && r.own.scroll <= r.own.client + 1), 5000, sdA);
          // r1571 (the side run 44953729818's hosted red, twice — heavy 3/7): «no room» was made by a FACE (letter-spacing 6em), so by a
          // font's metrics. Every chip is capped at 240 px (style.css .browser-live-tabchip max-width) and the fit measures each by its
          // offsetWidth, so a wide face takes the room only where the end button and the other chips grow enough on that machine's
          // fonts: on the runner they did not (the front's chip 240 px and whole, nothing folded; this view's own chip scrolled 1185
          // over 238), and the CONTROL was red with no fault in the product. NOW «no room» is A FACT IT SETS AND READS BACK: under the
          // same 0.25em face it measures the row (its width, the dividers, the end button) and the front's own chip, plants the end
          // button's width (the fit reads it as endPx) so the room left is 40 px less than that chip, and reads the room back BEFORE it
          // judges. A premise that did not form is red BY NAME as the premise — the fold is then not judged at all.
          const roomOf = `const rw = L().el().querySelector('.browser-live-tabrow'), list = rw && rw.querySelector('.browser-live-tabrow-list'), q = rw && rw.querySelector('.browser-live-tabrow-quit'), fc = rw && rw.querySelector('.browser-live-tabchip.front-foreign');
            const divPx = list ? [...list.children].filter((c) => !c.dataset.target && c.offsetParent).reduce((a, c) => a + c.offsetWidth + 3, 0) : 0, endPx = q && q.offsetParent ? q.offsetWidth + 6 : 0;
            return { rowW: rw ? rw.clientWidth : null, divPx, endW: q && q.offsetParent ? q.offsetWidth : null, frontW: fc && fc.offsetParent ? fc.offsetWidth + 3 : null, room: rw ? rw.clientWidth - 12 - divPx - endPx : null };`;
          const noRoom = async (px) => ev(`let st = document.getElementById('r943-room'); if (!st) { st = document.createElement('style'); st.id = 'r943-room'; document.head.appendChild(st); } st.textContent = ${px ? JSON.stringify(`.browser-live-tabrow > .browser-live-tabrow-quit { min-width: ${px}px !important; transition: none !important; }`) : "''"}; ${FRAMES(3000)} const room = (() => { ${roomOf} })(); return { ...room, fed: true, error: null, frames: fr, visibility: document.visibilityState };`);
          const r0 = await ev(roomOf);
          const endMin = r0 && r0.rowW != null && r0.frontW != null && r0.endW != null ? Math.max(r0.endW + 1, Math.round(r0.rowW - 12 - r0.divPx - 6 - (r0.frontW - 40))) : null;
          const frB = endMin != null ? await noRoom(endMin) : { fed: false, error: 'the row, its end button or the front\'s chip was not drawn to measure', frames: 0, visibility: null };
          const sdB = await ev(settledJs(3000));
          const premise = !!(frB.fed && r0.frontW && frB.room != null && frB.room < r0.frontW && Math.abs(frB.rowW - r0.rowW) <= 1);
          ok(premise, `r943 CONTROL's PREMISE — no room, by a fact it set and read back: the end button planted at ${endMin} px (it was ${r0 && r0.endW}) leaves ${frB.room} px of the row for the front's chip of ${r0 && r0.frontW} px (the row ${r0 && r0.rowW} → ${frB.rowW} px)${premise ? '' : ' — THE PREMISE DID NOT FORM: the control below is not judged, so this is no verdict on the fold'}`, S({ r0, after: frB }));
          const wB = await ev(untilJs(rowAt, "r.more && r.more.marked && !(r.chip && r.chip.whole)", 5000));
          const huge = wB && wB.r;
          console.log(`    ⑨ the row at 1280 px with NO ROOM (the end button planted at ${endMin} px, ${frB.room} px left for a ${r0 && r0.frontW} px chip; ${facePlace(frB, wB, sdB)}): ${S(huge)}`);
          if (premise) judged(wB, frB, 'r943 CONTROL: no room (a fact set and read back) — the front\'s chip is not whole inside the list (the judge above would read red) and the fold names it in words', (r) => !(r.chip && r.chip.whole) && !!(r.more && r.more.marked && r.more.tip.includes('企业助手 的标签页在此窗口最前面')), 5000, sdB);
          await noRoom(0);
          await plant(0); const frR = await feedRun({ ...base, front: frontE }); const sdR = await ev(settledJs(3000));
          const wR = await ev(untilJs(rowAt, "r.chip && r.chip.id === 'E' && r.chip.here && r.chip.whole", 5000));
          judged(wR, frR, 'r1111: the face put back, the row is fitted back — the front\'s own chip whole inside the list', (r) => !!(r.chip && r.chip.here === '在此窗口最前面' && r.chip.whole), 5000, sdR);
          // r1111 A: THE ROW IS FITTED TO WHAT IS DRAWN, WHENEVER WHAT IT MEASURED CHANGES. Fitted with the front's chip whole, the END
          // BUTTON ALONE grows (a planted min-width with no transition: no feed, no resize, the row's own box unchanged) — the row is
          // fitted again: the front no longer fits whole and the fold says it. RED on the release (its observer watched the row's own
          // box only): nothing refits and the chip stays as it was. Then the button back to its size: fitted again, the chip whole.
          // (the page prelude declares app, wm, rect, sidOf, chatWin, live, L and row: a page string here declares none of them)
          const endOf = `const rw = L().el().querySelector('.browser-live-tabrow'), q = L().el().querySelector('.browser-live-tabrow-quit'); return { frames: typeof fr === 'number' ? fr : null, visibility: document.visibilityState, row: rect(rw), endW: q && q.offsetParent ? Math.round(q.getBoundingClientRect().width) : null };`;
          const grow = async (px) => ev(`let st = document.getElementById('r1111-end'); if (!st) { st = document.createElement('style'); st.id = 'r1111-end'; document.head.appendChild(st); } st.textContent = ${px ? JSON.stringify(`.browser-live-tabrow > .browser-live-tabrow-quit { min-width: ${px}px !important; transition: none !important; }`) : "''"}; ${FRAMES(3000)} ${endOf}`);
          const before = await ev(`const fr = null; ${endOf}`);
          const g = await grow(Math.max(200, Math.round((before.row && before.row.width) || 0) - 160));
          const wG = await ev(untilJs(rowAt, "r.more && r.more.marked && !(r.chip && r.chip.whole)", 3000));
          const boxSame = !!(g.row && before.row && Math.abs(g.row.width - before.row.width) <= 1 && Math.abs(g.row.height - before.row.height) <= 1);
          console.log(`    ⑨ r1111: the end button alone grown ${before.endW} → ${g.endW} px, the row's box ${S(before.row)} → ${S(g.row)} (frames after it ${g.frames}; the page ${g.visibility}; waited ${wG && wG.ms} ms${wG && wG.timedOut ? ', TIMED OUT' : ''}): ${S(wG && wG.r)}`);
          ok(!!(before.endW && g.endW > before.endW + 100 && boxSame && g.frames), 'r1111 the leg\'s own ground: the end button alone grew after the fit (no feed, no resize) and the row\'s own box did not change', S({ before, g }));
          ok(!!(wG && !wG.timedOut && wG.r.more && wG.r.more.marked && wG.r.more.tip.includes('企业助手 的标签页在此窗口最前面') && !(wG.r.chip && wG.r.chip.whole)), 'r1111: the end button grew after the fit with the row\'s box the same — THE ROW IS FITTED AGAIN: the front no longer fits whole and the fold says it in words (red on the release: nothing refits)' + (wG && wG.timedOut ? ' — NOT FITTED AGAIN in 3 s: the row stayed as it was' : ''), S(wG && wG.r));
          await grow(0);
          const wS = await ev(untilJs(rowAt, "r.chip && r.chip.id === 'E' && r.chip.here && r.chip.whole", 3000));
          ok(!!(wS && !wS.timedOut && wS.r.chip && wS.r.chip.whole), 'r1111: …and the end button back to its size, the row is fitted again — the front\'s own chip whole inside the list' + (wS && wS.timedOut ? ' — NOT FITTED AGAIN in 3 s' : ''), S(wS && wS.r));
          // …and a CHIP alone grows (the front's chip, a planted min-width: no feed, no resize, the row's box the same): fitted again,
          // the fold says it. (A folded chip is not drawn, so its own change alone is not seen; a face or font change also changes
          // the pill, which is — so the way back is a feed here.) RED on the release: nothing watched the chip.
          const growChip = async (px) => ev(`let st = document.getElementById('r1111-chip'); if (!st) { st = document.createElement('style'); st.id = 'r1111-chip'; document.head.appendChild(st); } st.textContent = ${px ? JSON.stringify(`.browser-live-tabchip.front-foreign { min-width: ${px}px !important; }`) : "''"}; ${FRAMES(3000)} ${endOf}`);
          const gc = await growChip(Math.max(300, Math.round((before.row && before.row.width) || 0) - 100));
          const wC = await ev(untilJs(rowAt, "r.more && r.more.marked && !(r.chip && r.chip.whole)", 3000));
          console.log(`    ⑨ r1111: the front's chip alone grown, the row's box ${S(gc.row)} (frames after it ${gc.frames}; waited ${wC && wC.ms} ms${wC && wC.timedOut ? ', TIMED OUT' : ''}): ${S(wC && wC.r)}`);
          ok(!!(gc.row && before.row && Math.abs(gc.row.width - before.row.width) <= 1 && gc.frames && wC && !wC.timedOut && wC.r.more && wC.r.more.marked && wC.r.more.tip.includes('企业助手 的标签页在此窗口最前面')), 'r1111: a chip grew after the fit with the row\'s box the same — THE ROW IS FITTED AGAIN: the front folded and said in words (red on the release: nothing watched the chip)' + (wC && wC.timedOut ? ' — NOT FITTED AGAIN in 3 s: the row stayed as it was' : ''), S({ row: gc.row, read: wC && wC.r }));
          await growChip(0); await feedRun({ ...base, front: frontE });
        }
        // line 100's cure (r618): NO PART of this view's own chip is clipped — only its title gives way; its «here» words and owner's mark
        // are whole (or not shown at all: bare), and the chip ends inside the row's list
        const o9 = seen && seen.own;
        judged(ww, frW, `⑨ zh at ${wpx} px: no part of this view's own chip is clipped (its scroll width ${o9 && o9.scroll} ≤ its width ${o9 && o9.client}; it ends at ${o9 && o9.right} ≤ the list's ${seen && seen.listRight}${o9 && o9.bare ? '; bare — its parts shown not at all' : ''})`, (r) => { const o = r.own; return !!(o && o.scroll <= o.client + 1 && o.right <= r.listRight + 1 && o.parts.every((q) => q.s <= q.c + 1 && q.right <= r.listRight + 1)); }, 5000);
        if (PNG_DIR) {
          const r = seen && seen.row;
          const shot = r && r.width > 0 ? await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.max(1, Math.min(r.width, wpx)), height: Math.max(1, r.height), scale: 1 } }) : null;
          if (shot && shot.result?.data) { const f = path.join(PNG_DIR, `after-front-${wpx}-zh.png`); fs.writeFileSync(f, Buffer.from(shot.result.data, 'base64')); console.log(`    PNG ${f} (the row at a ${wpx} px viewport)`); }
          else console.log(`    PNG at ${wpx} px NOT written: the row has no box (${S(r)})`);
        }
      }
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    }
    // ── ⑩ B-346d (the coordinator's r1228): THE TWO BANNERS — en and zh, at desk width (1280) and at 390 — judged, then pictured ──
    //    (1) a browser that runs OUT OF SIGHT: a quiet MARK on the bar (a state, never a door), its line said ONCE a browser run
    //    (DISPLAY_SAY_MS, 20 s) then the mark alone; (2) the sign-in prompts line says what to do, its button's word naming the
    //    moment («Watch again now» / «Connect again now»), none for another machine's browser. The digest and the bridge's passkey
    //    fact are planted in the page (the hub's own words are proved by test-browser-display / test-browser-passkey); PNGs where
    //    VIBESPACE_TABS_PNG_DIR names a dir.
    //    r1505: (3) a press that changed nothing is answered under the line (the bridge's ack planted); the mark is quiet text;
    //    the two pictures asked for (the reply state, en 1280 / zh 390) are also printed as base64 «PICTURE» lines.
    console.log('— ⑩ B-346d: the out-of-sight mark (its line once a run) and the sign-in prompts line with its button — en + zh, 1280 + 390');
    {
      const D10 = require(path.join(repo, 'src/browser-display.js'));
      const PK10 = require(path.join(repo, 'src/browser-passkey.js'));
      const hidFact = D10.displayFact({ display: { ...D10.displayVerdict({}), xvfb: true }, wanted: { headed: true, args: '--no-sandbox' } });
      const WORDS = { en: { mark: 'Hidden window', watch: 'Watch again now', connect: 'Connect again now', prompts: /sign-in prompts/ }, zh: { mark: '隐藏窗口', watch: '现在重新监看', connect: '现在重新连接', prompts: /登录提示/ } };
      const sizeTo = async (wpx) => { await send('Emulation.setDeviceMetricsOverride', { width: wpx, height: 900, deviceScaleFactor: 1, mobile: false }); await ev(`const w = live(); const el = w.element; wm.setMinSize && wm.setMinSize(w.id, null); el.style.left = "0px"; el.style.width = "${wpx - 10}px"; el.style.height = "560px"; window.dispatchEvent(new Event("resize")); const l = L(); l.layoutBar && l.layoutBar(); return true;`); await sleep(300); };
      // planted on EVERY browser record of the digest (the view reads the shown one by its strip row's profile), again before every read
      // (the hub's own digest push would put the real fact back)
      const plantRun = (run) => ev(`const s = L().state(); const d = JSON.parse(JSON.stringify(app._browserProfiles || { profiles: [] })); d.browsers = d.browsers || {}; const ids = new Set(Object.keys(d.browsers)); if (s.target && s.target.profileId) ids.add(s.target.profileId); for (const id of ids) d.browsers[id] = { ...(d.browsers[id] || {}), display: ${S(hidFact)}, startedAt: ${Number(run)} }; const m = { type: 'browser-profiles-updated', ...d }; app._onBrowserProfilesUpdated(m); ${relayBroadcastJs('m')} return [...ids];`); // the page's handlers through the ONE relay (scratch.mjs)
      const feedPk = (why) => ev(`const s = L().state(); const pid = s.target && s.target.profileId; const fact = ${why ? `{ state: 'passkey', passkey: ${S(null)}, headed: false, since: 0, profileId: pid }` : 'null'}; if (fact) fact.passkey = ${why ? S(PK10.passkeyBlock({ state: 'unknown', why })) : 'null'}; L().ws().onmessage({ data: JSON.stringify({ type: 'passkey', fact, profileId: pid }) }); return !!pid;`);
      const bars = () => ev(`const root = L().el(); const vis = (e) => !!e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0; const bar = root.querySelector('.browser-live-bar'); const mk = root.querySelector('.browser-live-hidden-mark'); const note = root.querySelector('.browser-live-display-note:not(.browser-live-reset-note)'); const db = root.querySelector('.browser-live-dialog'); const line = root.querySelector('.browser-live-passkey-unknown'); const btn = root.querySelector('.browser-live-passkey-retry');
        const s = L().state(); const br = rect(bar); const boxes = [bar, vis(note) ? note : null, vis(db) ? db : null].filter(Boolean).map(rect);
        return { mark: vis(mk) ? { text: mk.textContent, title: mk.title, right: rect(mk).left + rect(mk).width, barRight: br.left + br.width, tag: mk.tagName } : null, folded: (s.folded || []).includes('hidden'), note: vis(note) ? note.textContent : '', line: vis(line) ? line.textContent : '', btn: vis(btn) ? { text: btn.textContent, right: rect(btn).left + rect(btn).width, dbRight: db ? rect(db).left + rect(db).width : 0 } : null,
          clip: boxes.length ? { left: Math.min(...boxes.map((b) => b.left)), top: Math.min(...boxes.map((b) => b.top)), right: Math.max(...boxes.map((b) => b.left + b.width)), bottom: Math.max(...boxes.map((b) => b.top + b.height)) } : null };`);
      // r1505: the two pictures the coordinator looks at (the bar with its mark and the sign-in line's reply, en at 1280 and zh
      // at 390) are ALSO printed into the suite's own output as base64 lines («PICTURE <name> <i>/<n> <chunk>»), so they come back
      // wherever the whole output is kept (the test machine's one-row part) with no picture folder; elsewhere a green suite's
      // output is not kept and the lines cost nothing
      const ASKED = new Set(['b346d-reply-gave-up-en-1280.png', 'b346d-reply-gave-up-zh-390.png']);
      const shoot = async (name, b, wpx) => {
        if ((!PNG_DIR && !ASKED.has(name)) || !b || !b.clip) return;
        const c = b.clip, shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, c.left), y: Math.max(0, c.top), width: Math.max(1, Math.min(c.right - c.left, wpx)), height: Math.max(1, c.bottom - c.top), scale: 1 } });
        if (!shot.result?.data) return;
        if (PNG_DIR) { const f = path.join(PNG_DIR, name); fs.writeFileSync(f, Buffer.from(shot.result.data, 'base64')); console.log(`    PNG ${f}`); }
        if (ASKED.has(name)) { const d = shot.result.data, n = Math.ceil(d.length / 4000); for (let i = 0; i < n; i++) console.log(`    PICTURE ${name} ${i + 1}/${n} ${d.slice(i * 4000, (i + 1) * 4000)}`); }
      };
      const markOk = (b, w) => !!b && ((b.mark && b.mark.text === w.mark && b.mark.tag === 'SPAN' && b.mark.right <= b.mark.barRight + 1) || (!b.mark && b.folded)) && (!b.mark || b.mark.title.length > 20);
      // B-346d (主开发 r4191; card-door-in-chat's deciding read, page-r4169-deciding.md): the one red try of (3) was THIS LEG's race — a
      // push of the browsers' digest from the hub itself (the keeper's 5 s tick: tick, commit, notify) fell 15 ms before the read at 390,
      // after the leg's plant, and the page drew the hub's fact over the planted one. THE SUITE's GATE PLACES THE PUSH: the socket's
      // frames reach the page through app.ws.heard (src/lib/ws.js) while the plants call the handlers themselves, so while a read is
      // planted and made (and pictured) the hub's digest frames are HELD at heard, and delivered when the read is done — the page never
      // loses one. Never a longer sleep, never a read asked again
      const gateJs = `if (!app.ws.__b346dGate) { const ws = app.ws, own = ws.heard.bind(ws); ws.__b346dGate = { on: false, held: [], total: 0 }; ws.__b346dOwn = own; ws.heard = (d, how) => { const g = ws.__b346dGate; if (g.on && d && d.type === 'browser-profiles-updated') { g.held.push([d, how]); g.total += 1; return; } return own(d, how); }; } return true;`;
      const hold = (on) => ev(`const g = app.ws.__b346dGate; if (!g) return -1; g.on = ${on ? 'true' : 'false'}; const n = g.held.length; if (!g.on) for (const [d, how] of g.held.splice(0)) app.ws.__b346dOwn(d, how); return n;`);
      const readHeld = async (fn) => { await hold(true); try { return await fn(); } finally { await hold(false); } };
      // the red, placed on purpose: the hub's OWN digest (fetched from it now) pushed down the socket's road, between a plant and its read
      const placeHubPush = () => ev(`const d = await (await fetch('/api/browser/profiles')).json(); if (!d || !Array.isArray(d.profiles)) return false; app.ws.heard({ type: 'browser-profiles-updated', ...d }); return true;`);
      for (const lang of ['en', 'zh']) {
        const w = WORDS[lang];
        await send('Runtime.evaluate', { expression: `localStorage.setItem('vibespace.lang', ${S(lang)}); true` });
        if (!ok(await boot(), `⑩ ${lang}: the app booted again in ${lang}`)) continue;
        await sleep(600);
        await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
        await until(() => ev('return !!chatWin();'), 10000);
        await ev(`if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
        await until(() => ev('const l = L(); return !!(l && l.state().connected && l.state().target && l.state().target.profileId);'), 12000);
        await ev(gateJs);   // B-346d: the suite's gate on this page load's socket road
        // (1) THE MARK — a new run: its line said, beside the mark (at 1280, then 390 within the same 20 s)
        await sizeTo(1280);
        const runA = Date.now();
        const pids = await plantRun(runA);
        await sleep(300);
        const first = {};
        for (const wpx of [1280, 390]) { await sizeTo(wpx); await readHeld(async () => { await plantRun(runA); await sleep(150); first[wpx] = await bars(); await shoot(`b346d-mark-first-${lang}-${wpx}.png`, first[wpx], wpx); }); }
        ok(Array.isArray(pids) && pids.length > 0 && [1280, 390].every((x) => markOk(first[x], w) && first[x].note.length > 20) && first[1280].mark && first[1280].note === first[1280].mark.title,
          `⑩ ${lang}: a browser in a hidden window — the bar's quiet MARK «${w.mark}» (a span, its tip the full sentence; inside the bar, or folded into ⋯ at 390) and its line said, at 1280 and 390`, S(first));
        // …then the mark alone, once the run's 20 s have passed
        await sleep(20600);
        const later = {};
        for (const wpx of [390, 1280]) { await sizeTo(wpx); await readHeld(async () => { await plantRun(runA); await sleep(150); later[wpx] = await bars(); await shoot(`b346d-mark-later-${lang}-${wpx}.png`, later[wpx], wpx); }); }
        ok([1280, 390].every((x) => markOk(later[x], w) && later[x].note === ''), `⑩ ${lang}: the line is said ONCE a browser run — after its 20 s the mark alone stays, at 1280 and 390`, S(later));
        // (2) THE SIGN-IN PROMPTS LINE: what to do, a button whose word names the moment (none for another machine's browser)
        for (const [why, btnWord] of [['not-watched', w.watch], ['gave-up', w.connect], ['remote', null]]) {
          await feedPk(why); await sleep(200);
          const got = {};
          for (const wpx of [1280, 390]) { await sizeTo(wpx); await readHeld(async () => { await plantRun(runA); await feedPk(why); await sleep(150); got[wpx] = await bars(); await shoot(`b346d-signin-${why}-${lang}-${wpx}.png`, got[wpx], wpx); }); }
          ok([1280, 390].every((x) => w.prompts.test(got[x].line) && (btnWord ? !!got[x].btn && got[x].btn.text === btnWord && got[x].btn.right <= got[x].btn.dbRight + 1 : !got[x].btn)),
            `⑩ ${lang}: «${why}» — the line speaks of sign-in prompts and says what to do; ${btnWord ? `its button «${btnWord}», whole inside the bar` : 'no button (another machine: close the tab there)'}, at 1280 and 390`, S(got));
        }
        // (3) r1505: A PRESS ALWAYS GETS ITS REPLY — «Connect again now» pressed, the bridge's answer planted as the fact is (the
        // present fact unchanged, then the ack: not ok, nothing moved): the words say so under the line, with the press's time
        const feedAck = () => ev(`L().state().pkRetryAt = Date.now(); L().ws().onmessage({ data: JSON.stringify({ type: 'passkey-retry-ack', ok: false, changed: false, error: 'the watch did not open' }) }); return true;`);
        const REPLY = { en: /^Tried again at .+: still cannot watch this browser \(no watch could open\)\.$/, zh: /已重试：仍然无法监看这个浏览器（无法开始监看）。$/ }; // the arm failed: said in the person's words (the first zh picture had the arm's English error inside)
        const said = {};
        const replyOf = () => ev(`const e = L().el().querySelector('.browser-live-passkey-retry-said'); return e && e.style.display !== 'none' ? e.textContent : '';`);
        for (const wpx of [1280, 390]) { await sizeTo(wpx); await readHeld(async () => { await plantRun(runA); await feedPk('gave-up'); await feedAck(); await sleep(150); said[wpx] = await bars(); said[wpx].reply = await replyOf(); await shoot(`b346d-reply-gave-up-${lang}-${wpx}.png`, said[wpx], wpx); }); }
        ok([1280, 390].every((x) => REPLY[lang].test(said[x].reply) && markOk(said[x], w) && !!said[x].btn && said[x].btn.text === w.connect),
          `⑩ ${lang}: a press that changed nothing is ANSWERED under the line («${said[1280].reply}»), the mark quiet beside it, at 1280 and 390`, S(said));
        if (lang === 'en') {
          // B-346d, THE RED MADE ON PURPOSE (once, en at 390 — where the box's red try fell): the hub's own digest pushed down the
          // socket's road between the plant and the read. Held by the gate, the read is the plant's; the leg as it stood (no gate)
          // reads the hub's fact drawn over the plant — the mark gone
          const placed = async (gated) => { await sizeTo(390); const run = async () => { await plantRun(runA); await feedPk('gave-up'); await feedAck(); const pushed = await placeHubPush(); await sleep(150); const b = await bars(); return { pushed, ok: markOk(b, w), mark: b.mark, folded: b.folded }; }; return gated ? readHeld(run) : run(); };
          const pg = await placed(true), pr = await placed(false);
          ok(pg.pushed && pg.ok, '⑩ en: B-346d — a push of the hub\'s own digest placed between the plant and the read is HELD by the suite\'s gate: the read is the plant\'s (the mark quiet at 390)', S(pg));
          ok(pr.pushed && !pr.ok, 'CONTROL (the leg as it stood, no gate): the same placed push lands before the read — the hub\'s fact drawn over the plant, the mark gone at 390 (the one red try) — RED', S(pr));
        }
        console.log(`    ⑩ ${lang}: the gate held ${await ev('const g = app.ws.__b346dGate; return g ? g.total : -1;')} push(es) of the hub's digest during the reads`);
        await feedPk(null);
      }
      // ⑪ B-bcf8 (主开发 r4256): A STILL PICTURE OF THE LIVE VIEW IS TOLD TO THE PERSON — the digest's `paint` (the keeper's codes by
      // target id, src/server/browser-keeper.js paintOf) planted on the shown browser's record: the view's OWN display line says the
      // shown tab's code in the person's words WHILE it stands (it takes the line; the hidden-window MARK stays on the bar), says
      // nothing for another tab's code, and is gone when it clears. The pictures the owner accepts (each line, en at 1280 and zh at 390)
      // are printed as PICTURE lines, as ⑩'s are
      console.log('— ⑪ B-bcf8: a still picture of the live view, told on its display line — en + zh, 1280 + 390');
      const PAINT_WORDS = {
        en: { 'thaw-unread': 'This page is not drawing: it did not answer when it was woken. VibeSpace keeps asking while you watch.', 'show-owed': 'This page has not come back to the front yet. VibeSpace tries again shortly.', 'show-left': 'VibeSpace could not bring this page back to the front. Take over, then click its tab above to bring it forward.' },
        zh: { 'thaw-unread': '此页面没有在绘制：唤醒时它没有回应。你观看时 VibeSpace 会继续唤醒它。', 'show-owed': '此页面还没有回到前台，VibeSpace 稍后会再试。', 'show-left': 'VibeSpace 无法把此页面带回前台。先接管，再点击上方它的标签即可将其带到前面。' },
      };
      // r4297 (the round's must): as a person who only WATCHES sees them (the third line names Take over first: the chip is no button
      // then), and the third line once more as a person who DRIVES sees it (the chip brings the tab forward): eight pictures
      const DRIVE_WORDS = { en: 'VibeSpace could not bring this page back to the front. Click its tab above to bring it forward.', zh: 'VibeSpace 无法把此页面带回前台。点击上方它的标签即可将其带到前面。' };
      for (const code of Object.keys(PAINT_WORDS.en)) { ASKED.add(`bcf8-still-${code}-en-1280.png`); ASKED.add(`bcf8-still-${code}-zh-390.png`); }
      ASKED.add('bcf8-still-show-left-driving-en-1280.png'); ASKED.add('bcf8-still-show-left-driving-zh-390.png');
      const chipOf = (id) => ev(`const root = L().el(); const el = [...root.querySelectorAll('.browser-live-tabchip')].find((e) => String(e.dataset.target || '').toUpperCase() === String(${S(id)} || '').toUpperCase()); const bar = root.querySelector('.browser-live-bar'), trow = root.querySelector('.browser-live-tabrow'), take = root.querySelector('.browser-live-mode-btn'); const vis = (e) => !!e && e.style.display !== 'none' && !!e.offsetParent && e.getBoundingClientRect().width > 0; const r = el && vis(el) ? rect(el) : null, b = rect(bar), rr = vis(trow) ? rect(trow) : null; return { role: el ? el.getAttribute('role') : null, drawn: !!r, above: !!r && r.top + r.height <= b.top + 1 && r.left >= 0 && r.left + r.width <= innerWidth + 1, rect: r, row: rr, take: vis(take) ? rect(take) : null };`);
      // r4334: the pictures carry the door the line names IN THE SAME FRAME — the tab row above the bar joins the clip
      const framed = async (b) => { const f = await ev(`const e = L().el().querySelector('.browser-live-tabrow'); return e && e.style.display !== 'none' && e.offsetParent ? rect(e) : null;`); if (!b || !b.clip || !f) return b; const c = b.clip; return { ...b, clip: { left: Math.min(c.left, f.left), top: Math.min(c.top, f.top), right: Math.max(c.right, f.left + f.width), bottom: Math.max(c.bottom, f.top + f.height) } }; };
      // `whose`: 'shown' = the tab the view shows (its row marked active), 'other' = a tab it does not show, null = no paint (it cleared)
      const plantPaint = (code, whose) => ev(`const s = L().state(); const rows = (s.tabRow && s.tabRow.rows) || []; const shown = (rows.find((r) => r.active) || {}).targetId || null; const d = JSON.parse(JSON.stringify(app._browserProfiles || { profiles: [] })); d.browsers = d.browsers || {}; const ids = new Set(Object.keys(d.browsers)); if (s.target && s.target.profileId) ids.add(s.target.profileId); const key = ${S(whose)} === 'shown' ? shown : 'F'.repeat(32); const paint = ${S(whose)} && key ? { [key]: ${S(code)} } : null; for (const id of ids) d.browsers[id] = { ...(d.browsers[id] || {}), display: ${S(hidFact)}, startedAt: 1, paint }; const m = { type: 'browser-profiles-updated', ...d }; app._onBrowserProfilesUpdated(m); ${relayBroadcastJs('m')} return { shown, ids: [...ids] };`);
      for (const lang of ['en', 'zh']) {
        const w = WORDS[lang], PW = PAINT_WORDS[lang], said = Object.values(PW);
        await send('Runtime.evaluate', { expression: `localStorage.setItem('vibespace.lang', ${S(lang)}); true` });
        if (!ok(await boot(), `⑪ ${lang}: the app booted again in ${lang}`)) continue;
        await sleep(600);
        await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
        await until(() => ev('return !!chatWin();'), 10000);
        await ev(`if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
        await until(() => ev('const l = L(); return !!(l && l.state().connected && l.state().target && l.state().target.profileId && (l.state().tabRow.rows || []).some((r) => r.active));'), 60000);   // the tabs record reaches a rebooted page when the bridge replays it (a late viewer) or the stream sends it: measured past 12 s at the base run and past 30 s in both tries at d580629bd — r4340 law 1: the wait is on the fact the leg judges, its bound generous, its expiry NAMED by the next red judge
        await ev(gateJs);   // the suite's gate on this page load's socket road (⑩): the hub's own digest held while a read is planted and made
        const got = {};
        for (const code of Object.keys(PW)) {
          got[code] = {};
          for (const wpx of [1280, 390]) { await sizeTo(wpx); await readHeld(async () => { got[code].at = await plantPaint(code, 'shown'); await sleep(150); got[code][wpx] = await bars(); got[code]['door' + wpx] = got[code].at && got[code].at.shown ? await chipOf(got[code].at.shown) : null; await shoot(`bcf8-still-${code}-${lang}-${wpx}.png`, await framed(got[code][wpx]), wpx); }); }
          ok(!!got[code].at && !!got[code].at.shown && [1280, 390].every((x) => got[code][x].note === PW[code] && markOk(got[code][x], w)),
            `⑪ ${lang}: «${code}» on the tab the view shows — its line said on the display line («${PW[code]}»), the hidden-window mark still on the bar, at 1280 and 390`, S(got[code]));
        }
        const other = {}, gone = {};
        for (const wpx of [1280, 390]) {
          await sizeTo(wpx);
          await readHeld(async () => { await plantPaint('show-left', 'other'); await sleep(150); other[wpx] = await bars(); });
          await readHeld(async () => { await plantPaint('show-left', 'shown'); await sleep(150); await plantPaint('show-left', null); await sleep(150); gone[wpx] = await bars(); });
        }
        ok([1280, 390].every((x) => !said.includes(other[x].note) && markOk(other[x], w)), `⑪ ${lang}: a code on ANOTHER tab (one this view does not show) — no line of it here`, S(other));
        ok([1280, 390].every((x) => !said.includes(gone[x].note) && markOk(gone[x], w)), `⑪ ${lang}: the code cleared — its line gone with it (said while it stands, never after)`, S(gone));
        // r4297: the watcher's third line names Take over first BECAUSE the shown tab's chip is no button for a watcher
        await sizeTo(1280); const shownW = got['show-left'].at && got['show-left'].at.shown; const chipW = shownW ? await chipOf(shownW) : null;
        ok(!!chipW && chipW.role !== 'button', `⑪ ${lang}: a person who only watches — the shown tab's chip is no button, and the third line says Take over first («${PW['show-left']}»)`, S(chipW));
        ok([1280, 390].every((x) => { const dr = got['show-left']['door' + x]; return !!dr && dr.drawn && dr.above && !!dr.take; }), `⑪ ${lang}: r4334 — BOTH doors the watcher's line names are DRAWN, at 1280 and 390: Take over on the bar, and the shown tab's chip in the tab row ABOVE the bar (never folded)`, S({ 1280: got['show-left'].door1280, 390: got['show-left'].door390 }));
        // …then as a person who DRIVES: Take over, the same code — «Click its tab above», the chip a button
        // r4334: the watcher follows the line — a REAL click on the bar's Take over (the first door it names)
        const tkR = await ev('const b = L().el().querySelector(".browser-live-mode-btn"); return b && b.offsetParent ? rect(b) : null;'); if (tkR) await click(centre(tkR)); else await ev('L().takeOver(); return true;');
        const drivingN = await until(() => ev('const s = L().state(); return s.mode === "takeover" && s.mine;'), 12000);
        const drv = {};
        for (const wpx of [1280, 390]) { await sizeTo(wpx); await readHeld(async () => { drv.at = await plantPaint('show-left', 'shown'); await sleep(150); drv[wpx] = await bars(); drv['chip' + wpx] = drv.at && drv.at.shown ? await chipOf(drv.at.shown) : null; await shoot(`bcf8-still-show-left-driving-${lang}-${wpx}.png`, await framed(drv[wpx]), wpx); }); }
        ok(drivingN && [1280, 390].every((x) => drv[x].note === DRIVE_WORDS[lang]) && !!drv.chip1280 && drv.chip1280.role === 'button',
          `⑪ ${lang}: a person who DRIVES — the third line «${DRIVE_WORDS[lang]}», and the shown tab's chip IS a button (it brings the tab forward), at 1280 and 390`, S(drv));
        // r4334: the driver's door is drawn where the line says (the chip in the row ABOVE the bar) and a REAL press on it reaches the tab:
        // the switch runs under the agent's own session, by the tab's id (the fake agent-browser's command log)
        await sizeTo(1280); const dChip = drv.at && drv.at.shown ? await chipOf(drv.at.shown) : null; const nCmd = cmds().length;
        if (dChip && dChip.rect) await click(centre(dChip.rect));
        const pressed = !!(drv.at && drv.at.shown) && await until(() => cmds().slice(nCmd).includes(`tab ${String(drv.at.shown).toUpperCase()}`), 8000, 100);
        ok(!!dChip && dChip.drawn && dChip.above && dChip.role === 'button' && pressed, `⑪ ${lang}: r4334 — the driver's door is DRAWN where the line says (the chip in the tab row above the bar) and a REAL press on it reaches the tab (the switch to it, under the agent's own session)`, S({ chip: dChip, cmds: cmds().slice(nCmd) }));
        await readHeld(async () => { await plantPaint('show-left', null); });
        await ev('L().send({ type: "handback" }); return true;');
        await until(() => ev('const s = L().state(); return s.mode === "watch" && !s.mine;'), 10000);
        await readHeld(async () => { await plantPaint('show-left', null); });
      }
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    }
    await send('Runtime.evaluate', { expression: `localStorage.removeItem('vibespace.lang'); true` });
  } finally {
    try { cdp?.close?.(); } catch { }
    for (const u of ups) { try { await u.close(); } catch { } }
    if (SID) { try { wsMain.send(JSON.stringify({ type: 'kill', sessionId: SID })); } catch { } }
    await sleep(500);
    try { wsMain.close(); } catch { }
    try { srv.kill('SIGTERM'); } catch { }
    await sleep(500);
  }
})().catch((e) => ok(false, 'the suite threw', e && (e.stack || e.message)));
done();
