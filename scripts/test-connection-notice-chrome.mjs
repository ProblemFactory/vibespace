#!/usr/bin/env node
// test-connection-notice-chrome — the real page of lane connection-notice-once: a scratch hub, a real chat over a real transcript,
// headless Chrome at a phone's shape, every byte through a path this suite can slow down.
//   ① THE SOCKET FLAPS 10 TIMES ⇒ one notice, the re-attach ran each time (`attached` frames), the pager and the cards did not
//     move, no toast, the row visible at the live tail. A live message between cycles ⇒ a second notice; a reload ⇒ none.
//     (addendum 1) The Resume dialog, rendered for real: no literal tag in what the person reads.
//   ④ A CYCLE NOBODY COULD HAVE NOTICED (round 2): a CDP freeze of 10 / 40 / 70 s ⇒ no row, no count; a freeze the hub cut with nothing lost ⇒ the same;
//     a hidden tab's cycle ⇒ the same; a freeze that lost frames off the ring ⇒ one row at the resume; an awake drop ⇒ one row; a hub's cut while awake ⇒ counted.
//   ⑤ THE OWNER'S PICTURES: a phone 390 px wide, in Chinese — 10 real flaps ⇒ one row that counts them, its time 24-hour; a hide / show cycle ⇒ none.
// ② (the bytes-taken mark on real sockets) and ③ (the loop, law 5: a client on a slow link) are the SLOW-LINK pick's, on top of this
// one: this pick is the page's half. The proxy stays: ④'s hub cuts need a path that can go silent.
// WHY NOT Network.emulateNetworkConditions: it does not throttle a websocket's reads (test-reconnect-storm's (j) measured the queue
// at 0 under it), so the slow link is a proxy in front of the hub: one token bucket for hub → browser, and a WAN-sized TCP window
// on its upstream socket (TCP_MAXSEG 1300, SO_RCVBUF 8 KB) so backpressure reaches the hub's own queue. Measured: at SO_RCVBUF 64 KB
// the hub's kernel still swallowed the whole 1.2 MB frame, the queue never filled and the leg judged loopback's buffers, not a link.
// RED: `REPO=<a git archive of the release (fd4acdc61, 2.369.397) + node_modules + src/lib/build-version.js> node scripts/test-connection-notice-chrome.mjs`
// — ① (20 rows for 10 flaps), ④ and ⑤ red by name and by behaviour; `VS_CNO_SHOTS` then writes the BEFORE pictures. CONTROL for ④: `REPO=<a git archive of round 1, 08aebf78e …>`: every cycle counted.
// `VS_CNO_SHOTS=<dir>` saves the shots. SKIPs without chrome.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { writeHugeTranscript } from './huge-transcript-fixture.mjs';
const REPO = path.resolve(process.env.REPO || new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
const WebSocket = require('ws');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = process.env.VS_CNO_SHOTS || null;
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const FLAPS = 10;
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 200) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { } await sleep(step); } return false; };
const procs = new Set(), dirs = new Set();
let root = null;
const cleanup = () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  if (root) { try { endRootedProcesses(root); } catch { } } // dtach, the wrapper and the stub CLI outlive the hub
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

// the REAL home's project list before anything runs — the census at the end proves no fixture landed there
const REAL_PROJECTS = path.join(process.env.HOME || '', '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = require(path.join(REPO, 'src/fixture-guard.js'));

// ── the slow link ──
const THROTTLE = String.raw`
import select, socket, sys, threading, time
listen_port, up_port, ctl, log = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
lock = threading.Lock(); tokens = 0.0; last = time.time(); rate = 0.0
def read_rate():
    global rate
    while True:
        try: rate = float(open(ctl).read().strip() or 0)
        except Exception: pass
        time.sleep(0.1)
threading.Thread(target=read_rate, daemon=True).start()
logf = open(log, 'a', buffering=1)
def take(n):
    global tokens, last
    while True:
        r = rate
        if r < 0:
            time.sleep(0.05); continue # a path gone silent: nothing reaches the page, so no ping does and no pong comes back
        if r == 0: return n
        with lock:
            now = time.time(); tokens = min(r / 4, tokens + (now - last) * r); last = now
            if tokens >= min(n, 1300): # a segment at a time, as a link delivers: a grant of whatever trickled in fed a same-process ws reader ~a million tiny chunks and its O(n²) consume held this suite's loop for minutes
                g = int(min(n, tokens)); tokens -= g
                return g
        time.sleep(0.02)
def end(*socks):
    for s in socks:
        try: s.shutdown(socket.SHUT_RDWR)
        except OSError: pass
def down(u, c):
    try:
        while True:
            if not select.select([u], [], [], 0.1)[0]: continue # never parked inside a recv: a path gone silent stops the very next frame, the ping included
            d = u.recv(take(4096))
            if not d: break
            c.sendall(d)
    except OSError: pass
    end(u, c)
def up(c, u, n):
    try:
        first = True
        while True:
            d = c.recv(65536)
            if not d: break
            if first:
                first = False
                if d.startswith(b'GET /ws'): logf.write(f"{time.time():.3f} wsopen {n} port {u.getsockname()[1]}\n")
            u.sendall(d)
    except OSError: pass
    end(u, c)
srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); srv.bind(('127.0.0.1', listen_port)); backlog = 128; srv.listen(backlog)
n = 0
while True:
    c, _ = srv.accept(); n += 1
    c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    u = socket.socket()
    u.setsockopt(socket.IPPROTO_TCP, socket.TCP_MAXSEG, 1300)
    u.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 8192)
    u.connect(('127.0.0.1', up_port)); u.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    threading.Thread(target=down, args=(u, c), daemon=True).start()
    threading.Thread(target=up, args=(c, u, n), daemon=True).start()
`;

// ── the hub ──
const wt = scratch('cno-hub'); root = wt; dirs.add(wt); fs.mkdirSync(wt, { recursive: true });
execSync(`tar -C ${REPO} --exclude=./node_modules --exclude=./.git --exclude=./docs --exclude=./release --exclude=./data/ci-heavy -cf - . | tar -C ${wt} -xf -`);
fs.symlinkSync(fs.realpathSync(path.join(REPO, 'node_modules')), path.join(wt, 'node_modules'), 'dir');
if (!fs.existsSync(path.join(wt, 'src/lib/build-version.js'))) throw new Error('src/lib/build-version.js is missing — run `npm run build` first');
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' }); // what is about to ship
const fakeHome = scratchHome('cno-hub-home', fs); dirs.add(fakeHome);
const cwd = scratch('cno-hub-cwd'); dirs.add(cwd); fs.mkdirSync(cwd, { recursive: true });
const proj = path.join(fakeHome, '.claude', 'projects', cwd.replace(/[/._]/g, '-')); fs.mkdirSync(proj, { recursive: true });
const sid = fixtureSid('5c01');
await writeHugeTranscript({ file: path.join(proj, `${sid}.jsonl`), sid, cwd, targetBytes: 3 * 1048576 });
const stub = scratch('cno-hub-claude'); dirs.add(stub);
// the stub CLI: its init for the resumed id, then idles on stdin. VS_BIG n=<n> answers with n tool results of 400 KB; VS_ONE with one line of text.
fs.writeFileSync(stub, `#!/bin/sh
SID=""; prev=""
for a in "$@"; do case "$a" in --version) echo "2.1.274 (Claude Code) stub"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac; [ "$prev" = "--resume" ] && SID="$a"; prev="$a"; done
printf '%s\\n' "{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"session_id\\":\\"$SID\\",\\"model\\":\\"claude-fable-5\\",\\"cwd\\":\\"$PWD\\",\\"tools\\":[],\\"permissionMode\\":\\"default\\"}"
R=0
while IFS= read -r line; do
  R=$((R+1))
  case "$line" in
    *VS_ONE*) printf '{"type":"assistant","parent_tool_use_id":null,"session_id":"%s","message":{"id":"msg_one_%s","role":"assistant","model":"claude-fable-5","content":[{"type":"text","text":"one line"}]}}\\n' "$SID" "$R" ;;
    *VS_BIG*) N=$(printf '%s' "$line" | sed -n 's/.*VS_BIG n=\\([0-9][0-9]*\\).*/\\1/p'); i=0
      while [ $i -lt $N ]; do i=$((i+1))
        printf '{"type":"assistant","parent_tool_use_id":null,"session_id":"%s","message":{"id":"msg_big_%s_%s","role":"assistant","model":"claude-fable-5","content":[{"type":"tool_use","id":"toolu_big_%s_%s","name":"Read","input":{"file_path":"notes.txt"}}]}}\\n' "$SID" "$R" "$i" "$R" "$i"
        printf '{"type":"user","parent_tool_use_id":null,"session_id":"%s","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_big_%s_%s","content":"' "$SID" "$R" "$i"
        head -c 400000 /dev/zero | tr '\\0' b
        printf '"}]}}\\n'
      done ;;
    *) continue ;;
  esac
  printf '{"type":"result","subtype":"success","session_id":"%s","duration_ms":1,"total_cost_usd":0,"is_error":false}\\n' "$SID"
done
`, { mode: 0o755 });
const [PORT, PROXY, CDP] = await freePorts(3);
const rateFile = scratch('cno-rate'), proxyLog = scratch('cno-proxy-log'), proxySrc = scratch('cno-proxy') + '.py'; dirs.add(rateFile); dirs.add(proxyLog); dirs.add(proxySrc);
fs.writeFileSync(rateFile, '0\n'); fs.writeFileSync(proxyLog, ''); fs.writeFileSync(proxySrc, THROTTLE);
const VNC_ENV = await vncEnv();
let journal = '';
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' } });
procs.add(srv);
const onOut = (d) => { journal = (journal + d).slice(-200000); };
srv.stdout.on('data', onOut); srv.stderr.on('data', onOut);
const proxy = spawn('python3', [proxySrc, String(PROXY), String(PORT), rateFile, proxyLog], { stdio: 'ignore' }); procs.add(proxy);
const chromeDir = scratch('cno-chrome'); dirs.add(chromeDir);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=500,1000', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
procs.add(chrome);
if (!await until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000)) { console.error(journal.slice(-1500)); throw new Error('the scratch hub never answered'); }

const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { maxPayload: 1 << 30 });
const frames = []; ctl.on('message', (d) => { if (d.length > 65536) return; try { frames.push(JSON.parse(String(d))); } catch { } });
await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
ctl.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd, resume: true, resumeId: sid, reqId: 'c0', name: 'notice', cols: 80, rows: 24 }));
await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c0'), 30000, 100);
const created = frames.find((m) => m.type === 'created' && m.reqId === 'c0');
if (!created) throw new Error('create failed: ' + JSON.stringify(frames.slice(-2)).slice(0, 400));
const id = created.sessionId;
const sayToStub = (text) => ctl.send(JSON.stringify({ type: 'chat-input', sessionId: id, text, msgId: 'm-' + Date.now() + Math.random() }));
const serverTotal = () => fetch(`http://127.0.0.1:${PORT}/api/session-messages?backend=claude&backendSessionId=${sid}&cwd=${encodeURIComponent(cwd)}&offset=0&limit=1`).then((r) => r.json()).then((j) => j.total);

// ── CDP ──
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) throw new Error('chrome never exposed a page target');
const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 1 << 28 });
await new Promise((r) => cdpWs.on('open', r));
let seq = 0; const pend = new Map();
cdpWs.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res) => { const i = ++seq; pend.set(i, res); cdpWs.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64')); };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA, platform: 'Android' });
await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
const boot = async () => {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PROXY}/?cb=${Date.now()}` });
  if (!await until(() => ev('!!(window.app && window.app.ready)'), 60000)) throw new Error('the app never booted');
  await ev('window.app.ready.then(() => true)');
};
await boot();
const INSTALL = `(() => {
  const S = window.__cn = { flips: [], attached: [], toasts: 0 };
  const app = window.app, sid = ${JSON.stringify(id)};
  app.ws._stateListeners.unshift((c) => S.flips.push({ c, t: Date.now() }));
  S.life = []; for (const k of ['freeze', 'resume', 'visibilitychange']) document.addEventListener(k, () => S.life.push(k === 'visibilitychange' ? document.visibilityState : k));
  app.ws._stateListeners.unshift((c) => S.life.push(c ? 'up' : 'down'));
  S.toastWords = [];
  app.ws.globalHandlers.unshift((m) => { if (m.type === 'attached' && m.sessionId === sid) S.attached.push({ t: Date.now(), held: m.slab === 'held', replay: Array.isArray(m.replay) ? m.replay.length : 0 }); });
  new MutationObserver((recs) => { for (const r of recs) for (const n of r.addedNodes) if (n.classList?.contains('global-toast') || n.querySelector?.('.global-toast')) { S.toasts++; S.toastWords.push(String(n.textContent).slice(0, 120)); } }).observe(document.body, { childList: true, subtree: true });
  window.__view = () => [...app.sessions.values()].find((v) => v && v.sessionId === sid);
  window.__rows = () => [...document.querySelectorAll('.chat-msg-system .chat-system')].filter((e) => /Disconnected from server|Reconnected|Connection unstable|已与服务器断开|已重新连接|连接不稳定/.test(e.textContent)).map((e) => e.textContent);
  window.__facts = () => { const v = window.__view(); return { start: v._windowStart, end: v._windowEnd, total: v._total, cards: v._messageList.querySelectorAll(':scope > .chat-msg:not(.chat-gap-msg)').length, rows: window.__rows(), attached: S.attached.length, toasts: S.toasts, flips: S.flips.length, n: v._connNotice?.state?.n ?? 0, lastHeld: S.attached.at(-1)?.held ?? null, toastWords: S.toastWords }; };
  return true;
})()`;
await ev(INSTALL);
await ev(`(async () => { const w = window.app.attachSession(${JSON.stringify(id)}, 'notice', ${JSON.stringify(cwd)}, { mode: 'chat', backend: 'claude' }); const t0 = Date.now(); while (Date.now() - t0 < 60000) { const v = window.__view(); if (v && v._total > 0 && v._messages?.length) return true; await new Promise((r) => setTimeout(r, 150)); } return false; })()`);
await sleep(1500);

// ── ④ first, on a page that has said nothing: the silence is absolute here ──
const hubCuts = () => (journal.match(/heartbeat terminating/g) || []).length;
const freeze = (state) => cdp('Page.setWebLifecycleState', { state });
// CDP's freeze makes the page hidden first, and neither `active` nor bringToFront alone makes it visible again (measured: «hidden freeze resume down up»,
// no «visible»). Another tab in front and this one brought back does. That is the person's return.
const front = async () => {
  const other = await cdp('Target.createTarget', { url: 'about:blank' });
  await cdp('Page.bringToFront');
  if (other.result?.targetId) await cdp('Target.closeTarget', { targetId: other.result.targetId });
  return until(() => ev('document.visibilityState === "visible"'), 5000, 50);
};
const wake = async () => { await freeze('active'); return front(); };
const cycleLanded = (flips, attached) => until(() => ev(`window.app.ws.connected && window.__cn.flips.length >= ${flips + 2} && window.__cn.attached.length > ${attached}`), 30000, 100);
/** The path goes silent until the hub has judged the socket; returns when it did. The proxy's upstream then reads the cut and closes the page's side. */
const silenceUntilCut = async () => { const c0 = hubCuts(); fs.writeFileSync(rateFile, '-1\n'); const cut = await until(() => hubCuts() > c0, 75000, 250); return cut; };
const speakAgain = () => fs.writeFileSync(rateFile, '0\n');
console.log('④ a frozen page: the cycle nobody could have noticed');
await sleep(1000);
for (const secs of [10, 40, 70]) {
  const b = await ev('window.__facts()'), c0 = hubCuts();
  await ev('(window.__cn.life.length = 0, true)');
  await freeze('frozen'); await sleep(secs * 1000); await wake();
  const back = await cycleLanded(b.flips, b.attached);
  const a = await ev('window.__facts()'), life = await ev('window.__cn.life.join(" ")');
  console.log(`    ${secs} s: the page heard «${life}»; ${a.flips - b.flips} flips; last attach held: ${a.lastHeld}; hub cuts ${hubCuts() - c0}`);
  ok(`frozen ${secs} s: the socket really cycled and the re-attach ran`, back && a.flips - b.flips === 2 && a.attached - b.attached === 1, { back, flips: a.flips - b.flips, attached: a.attached - b.attached });
  ok(`frozen ${secs} s: it resumed by seq`, a.lastHeld === true, a.lastHeld);
  ok(`frozen ${secs} s: NO row`, a.rows.length === 0, a.rows);
  ok(`frozen ${secs} s: NO count`, a.n === 0, a.n);
  // the one toast a long sleep has: client.js's page-suspend detector (2.321.0, a 5 s timer gapped > 45 s). It answers the sleep, not the socket, and this lane leaves it alone
  ok(`frozen ${secs} s: no connection toast`, a.toastWords.slice(b.toastWords.length).every((w) => /^Browser suspended this page for \d+s/.test(w)), a.toastWords.slice(b.toastWords.length));
  ok(`frozen ${secs} s: the page is awake again (the leg's closing fact)`, await ev('document.visibilityState === "visible"'), await ev('document.visibilityState'));
}
await shot('frozen-no-row.png');
console.log('④ a frozen page the hub cut, nothing lost');
{
  const b = await ev('window.__facts()');
  await freeze('frozen');
  const cut = await silenceUntilCut();
  speakAgain(); await wake();
  const back = await cycleLanded(b.flips, b.attached);
  const a = await ev('window.__facts()');
  ok('the heartbeat really cut it', cut, hubCuts());
  ok('it resumed by seq, nothing lost', back && a.lastHeld === true, { back, held: a.lastHeld });
  ok('a hub\'s cut of a sleeping page is NOT a miss: no row, no count (a radio that sleeps answers no ping, so this is any long lock; the retry window is past by now too)', a.rows.length === 0 && a.n === 0, a.rows);
}
console.log('④ a hidden page');
{
  const b0 = await ev('window.__facts()');
  await freeze('frozen'); await sleep(500); await freeze('active'); // hidden, not frozen: this is how this Chrome hides a page it can then run (the leg's own cycle comes next)
  await cycleLanded(b0.flips, b0.attached);
  const hidden = await ev('document.visibilityState === "hidden"');
  ok('the page really is hidden and running (the leg\'s starting fact)', hidden, await ev('document.visibilityState'));
  const b = await ev('window.__facts()');
  await ev('(window.app.ws.ws.close(), true)');
  const back = await cycleLanded(b.flips, b.attached);
  const a = await ev('window.__facts()');
  ok('the page came back to the front (the leg\'s closing fact)', await front());
  ok('a hidden page\'s cycle ran, resumed by seq', back && a.lastHeld === true, { back, held: a.lastHeld });
  ok('…no row, no count', a.rows.length === 0 && a.n === 0, a.rows);
  ok('…no toast', a.toasts === b.toasts, a.toastWords);
}
await sleep(6000); // past the grace: from here on the page is awake

// ── ① the socket flaps ──
console.log(`① the socket flaps ${FLAPS} times`);
const flap = () => ev(`(async () => { const S = window.__cn, sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const a = S.attached.length, ups = S.flips.filter((f) => f.c).length; window.app.ws.ws.close(); const t0 = Date.now(); while (Date.now() - t0 < 20000) { if (S.flips.filter((f) => f.c).length > ups && S.attached.length > a) return true; await sleep(30); } return false; })()`);
const f0 = await ev('window.__facts()');
ok('the chat is open at its live tail (the leg\'s starting facts)', f0.total > 0 && f0.end === f0.total && f0.rows.length === 0, f0);
let flapsDone = 0;
if (await flap()) flapsDone++;
const f01 = await ev('window.__facts()');
ok('④ one awake outage ⇒ one row, counted', f01.rows.length === 1 && f01.n === 1 && /^Reconnected · down /.test(f01.rows[0] || ''), f01.rows);
await shot('awake-one-row.png');
for (let i = 1; i < FLAPS; i++) if (await flap()) flapsDone++;
const f1 = await ev('window.__facts()');
ok(`${FLAPS} real cycles happened`, flapsDone === FLAPS && f1.flips - f0.flips === 2 * FLAPS, { flapsDone, flips: f1.flips - f0.flips });
ok('ONE notice in the transcript', f1.rows.length === 1, `${f1.rows.length} rows`);
ok('…and it counts them', new RegExp(`dropped ${FLAPS} times, last reconnected`).test(f1.rows[0] || ''), f1.rows[0]);
ok('the re-attach ran on every reconnect (one `attached` frame per cycle)', f1.attached - f0.attached === FLAPS, f1.attached - f0.attached);
ok('the pager\'s numbers did not move', f1.start === f0.start && f1.end === f0.end && f1.total === f0.total, { f0, f1 });
ok('the window\'s cards did not change', f1.cards === f0.cards, { before: f0.cards, after: f1.cards });
ok('no toast storm: no toast at all', f1.toasts === f0.toasts, f1.toastWords);
const look = await ev(`(() => { const v = window.__view(), n = document.querySelector('.chat-conn-notice'); if (!n) return null; const nr = n.getBoundingClientRect(), lr = v._messageList.getBoundingClientRect(); return { cls: n.className, inView: nr.top >= lr.top - 1 && nr.bottom <= lr.bottom + 1, h: Math.round(nr.height), w: Math.round(nr.width), lw: Math.round(lr.width), pinned: !!v._pinned }; })()`);
ok('the row is on screen at the live tail, not under the fold', !!look?.inView, look);
await shot('flap-10-phone.png');

console.log('① a message between two cycles');
sayToStub('VS_ONE');
const totalBefore = f1.total;
ok('a live message lands', await until(() => ev(`window.__view()._total > ${totalBefore}`), 15000));
await flap();
const f2 = await ev('window.__facts()');
ok('the next cycle starts a second notice', f2.rows.length === 2, f2.rows);
ok('…the first keeps its last words', f2.rows[0] === f1.rows[0], f2.rows);
await flap();
const f3 = await ev('window.__facts()');
ok('…and the one after that patches the second', f3.rows.length === 2 && /dropped 2 times/.test(f3.rows[1] || ''), f3.rows);
const look2 = await ev(`(() => { const v = window.__view(), all = document.querySelectorAll('.chat-conn-notice'), n = all[all.length - 1]; if (!n) return null; const nr = n.getBoundingClientRect(), lr = v._messageList.getBoundingClientRect(); return { inView: nr.top >= lr.top - 1 && nr.bottom <= lr.bottom + 1, top: Math.round(nr.top), bottom: Math.round(nr.bottom), listBottom: Math.round(lr.bottom), pinned: !!v._pinned }; })()`);
ok('…and the row is whole on screen, not cut off under the composer (a pinned view follows it)', !!look2?.inView, look2);
await shot('flap-message-between.png');

// BEFORE any reload: a reload leaves a stray socket, a silent path gets it cut as well, and that read as this leg's cut (with a reload ahead
// of it, one cut by a port neither the page's socket nor the control's; none without the reload — probably the old document's socket, not chased here).
console.log('④ a hub\'s cut while awake');
{
  const b = await ev('window.__facts()'), c0 = hubCuts();
  const cut = await silenceUntilCut();
  speakAgain();
  const back = await cycleLanded(b.flips, b.attached);
  const a = await ev('window.__facts()');
  ok('the heartbeat really cut it, once', cut && hubCuts() - c0 === 1, hubCuts() - c0);
  ok('the page\'s socket is the one it cut: only that closes it here', back && a.flips - b.flips === 2, { back, flips: a.flips - b.flips });
  ok('counted: an awake drop is the notice, whoever cut it', a.n === b.n + 1 && a.rows.length === b.rows.length, { before: b.n, after: a.n, rows: a.rows });
  await shot('awake-hub-cut.png');
}


console.log('① a status row never moves the window');
// paged up past the soft bound (the rows are at the tail, a viewport and more below), then a real trim of that tail
const trim = await ev(`(async () => { const v = window.__view(), list = v._messageList, cardsNow = () => list.querySelectorAll(':scope > .chat-msg:not(.chat-gap-msg)').length; const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const before = { start: v._windowStart, end: v._windowEnd, recs: v._messages.length, cards: cardsNow() }; const t0 = Date.now(); let ext = 0; while (cardsNow() <= 170 && v._windowStart > 0 && Date.now() - t0 < 20000) { list.scrollTop = 0; await v._extendTop(); ext++; await sleep(60); } list.scrollTop = 0; await sleep(100); const n = v._trimEdge('bottom'); await sleep(50); return { n, ext, before, start: v._windowStart, end: v._windowEnd, recs: v._messages.length, cards: cardsNow(), rowsLeft: window.__rows().length }; })()`);
ok('the leg trims for real (paged past the soft bound, the tail cut)', trim.n > 0, trim);
ok('the window\'s bounds still equal the records it holds (the old rows moved `_windowEnd` by rows the trim dropped: a pager that lied)', trim.end - trim.start === trim.recs, trim);
const reopen = async () => {
  await boot();
  await ev(INSTALL);
  await ev(`(async () => { if (!window.__view()) window.app.attachSession(${JSON.stringify(id)}, 'notice', ${JSON.stringify(cwd)}, { mode: 'chat', backend: 'claude' }); const t0 = Date.now(); while (Date.now() - t0 < 60000) { const v = window.__view(); if (v && v._total > 0 && v._messages?.length) return true; await new Promise((r) => setTimeout(r, 150)); } return false; })()`);
};
await reopen();
await sleep(1000);
const f3b = await ev('window.__facts()');
ok('a reload: the notices are gone, the messages are all there', f3b.rows.length === 0 && f3b.total === await serverTotal(), { rows: f3b.rows, total: f3b.total });

console.log('④ a frozen page that lost frames off the ring');
{
  const b = await ev('window.__facts()');
  await freeze('frozen');
  sayToStub('VS_BIG n=13'); // ≈ 5.2 MB: past the ring's 4 MiB, so the seq this page holds has fallen off it
  let owed = 0; await until(async () => { const t = await serverTotal(); if (t === owed && t > b.total) return true; owed = t; return false; }, 30000, 1500);
  await sleep(9000); // a sleep longer than the socket's own 2–3 s, so the row's length can tell which clock it read
  await wake();
  const back = await cycleLanded(b.flips, b.attached);
  const whole = await until(() => ev(`window.__view()._total === ${owed} && window.__view()._windowEnd === ${owed}`), 30000, 200);
  const a = await ev('window.__facts()');
  console.log(`    the page heard «${await ev('window.__cn.life.join(" ")')}»; owed ${owed - b.total} records; last attach held: ${a.lastHeld}; rows ${JSON.stringify(a.rows)}`);
  ok('the ring could not hold it: the re-attach came back with a slab', back && a.lastHeld === false, { back, held: a.lastHeld });
  ok('ONE row, at the resume', a.rows.length === 1, a.rows);
  ok('…counted once, awake-class', a.n === 1, a.n);
  ok('…in the words of a finished outage, as long as the sleep', /^Reconnected · down (9|[1-9]\d)s$/.test(a.rows[0] || ''), a.rows);
  ok('the transcript is whole', whole && a.total === owed, { total: a.total, owed, whole });
  await shot('frozen-missed-one-row.png');
  await sleep(6000);
}

await flap(); await flap();

console.log('① search');
const hl = await ev(`(() => { const s = window.__view()._search; if (!s?.applyHighlightLayer) return { skipped: true }; const q0 = s._highlightQuery; s._highlightQuery = 'connection unstable'; s.applyHighlightLayer(); const hits = (s._highlightRanges || []).filter((r) => r.startContainer.parentElement?.closest('.chat-msg-system')).length; s._highlightQuery = q0; s.applyHighlightLayer(); return { hits }; })()`);
ok('the search highlight never lights a notice\'s words', hl?.hits === 0, hl);

console.log('① the Resume dialog (addendum 1): what the person reads');
const resumeText = await ev(`(async () => { const fake = (k) => ({ sessionId: 'x' + k, opts: { backend: 'claude', backendSessionId: 'x' + k } }); const p = window.app.layoutManager._offerResumeAll([fake(1), fake(2), fake(3)]); const t0 = Date.now(); let d = null; while (Date.now() - t0 < 5000 && !d) { d = [...document.querySelectorAll('.dialog')].find((x) => /Resume interrupted sessions/.test(x.textContent)); await new Promise((r) => setTimeout(r, 30)); } const text = d ? d.querySelector('.dialog-hint')?.textContent : null; const html = d ? d.querySelector('.dialog-hint')?.innerHTML : null; [...(d?.querySelectorAll('button') || [])].find((b) => /Cancel/.test(b.textContent))?.click(); await p; return { text, html }; })()`);
ok('the dialog opened', !!resumeText?.text, resumeText);
ok('no literal tag on the page', !!resumeText?.text && !/<\/?\w|&lt;/.test(resumeText.text) && !/&lt;/.test(resumeText.html), resumeText);
ok('…it says how many', /^3 sessions were interrupted/.test(resumeText?.text || ''), resumeText);

// ── ⑤ the owner's pictures: a phone 390 px wide, in Chinese, through 10 real flaps and through a hide / show cycle ──
// Each from a fresh load (a reload takes every notice away), so each picture shows what its own cycles left. On the release
// (fd4acdc61) the same leg writes the BEFORE pictures: two rows a cycle.
console.log('⑤ the owner\'s pictures: 390 px wide, zh');
{
  await ev(`(localStorage.setItem('vibespace.lang', 'zh'), true)`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await reopen(); await sleep(1500);
  const zh = (rows) => rows.every((r) => /[一-鿿]/.test(r));
  const z0 = await ev('window.__facts()');
  ok('zh: a fresh load at 390 px, at the live tail, no notice (the leg\'s starting facts)', await ev(`localStorage.getItem('vibespace.lang') === 'zh' && innerWidth === 390`) && z0.rows.length === 0 && z0.end === z0.total, { rows: z0.rows, end: z0.end, total: z0.total });
  let done = 0; for (let i = 0; i < FLAPS; i++) if (await flap()) done++;
  const z1 = await ev('window.__facts()');
  console.log(`    ${done} flaps; rows ${JSON.stringify(z1.rows.slice(-3))} (${z1.rows.length} in all)`);
  ok(`zh, ${FLAPS} real flaps: the socket cycled ${FLAPS} times and the re-attach ran each time`, done === FLAPS && z1.attached - z0.attached === FLAPS, { done, attached: z1.attached - z0.attached });
  ok(`zh, ${FLAPS} real flaps: ONE notice, in Chinese, that counts them`, z1.rows.length === 1 && zh(z1.rows) && new RegExp(`断开 ${FLAPS} 次`).test(z1.rows[0] || ''), z1.rows);
  ok('zh: its time is the owner\'s clock, 24-hour (no AM / PM)', /最近 \d{2}:\d{2}( \S+)? 已重连/.test(z1.rows[0] || '') && !/AM|PM|上午|下午/.test(z1.rows[0] || ''), z1.rows[0]);
  await shot('zh-390-flap-10.png');
  await reopen(); await sleep(1500);
  const h0 = await ev('window.__facts()');
  await ev('(window.__cn.life.length = 0, true)');
  await freeze('frozen'); await sleep(10000); await wake(); // the person locks the phone ten seconds and comes back: hidden, frozen, resumed, shown
  const back = await cycleLanded(h0.flips, h0.attached);
  await sleep(1500);
  const h1 = await ev('window.__facts()'), life = await ev('window.__cn.life.join(" ")');
  console.log(`    hide / show: the page heard «${life}»; rows ${JSON.stringify(h1.rows)}`);
  ok('zh, a hide / show cycle: the page was hidden and shown again, and its socket really cycled', back && /hidden/.test(life) && /visible/.test(life) && h1.flips - h0.flips === 2 && await ev('document.visibilityState === "visible"'), { back, life, flips: h1.flips - h0.flips });
  ok('zh, a hide / show cycle: no row, no count', h1.rows.length === 0 && h1.n === 0, h1.rows);
  await shot('zh-390-hide-show.png');
  await ev(`(localStorage.removeItem('vibespace.lang'), true)`);
}

console.log('the real home');
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name)).map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, lit.offenders.slice(0, 3));
}

console.log(fail ? `\nFAILED: ${fail} failed, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
