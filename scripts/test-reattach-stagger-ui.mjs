#!/usr/bin/env node
// THE STAGGER WINDOW ON A REAL PAGE (B-63f1 ②, lane S1 verify r2, 2026-09-26).
// A page NOT reloaded across a server SIGKILL + restart re-attaches on the ws
// reconnect; its `attached` frame carries a NEW epoch and the view defers the
// slab swap by 0–500 ms (the 2.338.0 stagger). Every record the server emitted
// inside that window used to be applied to the list the slab then REPLACED —
// measured on this shape: 9 of 12 restarts lost the probe's records on the lane
// build, 4 of 6 on master. Now the ops of the window are HELD and drained after
// the slab (src/lib/chat-view.js `_armViewReset` / `_holdResetOp` /
// `_drainResetQueue`; the fast gate is test-reattach-stagger).
//
// A worktree server, a stub `claude` behind the REAL chat-wrapper (ping → pong),
// headless chrome over raw CDP. The view's jitter seam is pinned to its MAXIMUM
// (`_resetJitterMs = () => 500`, never a sleep guess) and the probe is typed BY
// THE PAGE at the instant its `attached` frame lands, so its create op is
// provably inside the window (the frame log stamps both).
//   ① twelve restarts on the fix: every probe record (the typed line + the
//      stub's pong) is on screen 8 s later, ids unique, DOM = list = total, the
//      seq watermark = the last frame applied in the new epoch; six of the runs
//      inject a `lagged` frame 200 ms into the window (a second attached of the
//      same rebuild supersedes) — still whole
//   ② CONTROL (a pre-fix chat-view built into a second scratch worktree — the
//      `_onOp` hold removed): the same runs LOSE the probe (the rule can go red)
// Requires google-chrome + dtach (SKIP without). ~5 min. Run: node scripts/test-reattach-stagger-ui.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore', shell: '/bin/bash' }); } catch { console.log('SKIP: dtach is not installed — a chat session cannot be created here'); process.exit(0); }

const RUNS = Number(process.env.STAGGER_RUNS || 12);
const CONTROL_RUNS = Number(process.env.STAGGER_CONTROL_RUNS || 6);
const [PORT, CPORT, CDP_PORT] = await freePorts(3);
const wt = scratch('stagger-wt');
const cwt = scratch('stagger-ctl');
const fakeHome = scratchHome('stagger-home', fs);
const stubDir = scratch('stagger-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: init, then every user line `ping-N` is answered `pong-N` ──
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = '0e1a51a0-0000-4000-8000-' + String(process.pid).padStart(12, '0');
const out = (o) => process.stdout.write(JSON.stringify({ ...o, session_id: SID }) + '\\n');
let n = 0; const U = () => 'u-' + (++n);
const usage = { input_tokens: 1, output_tokens: 1 };
out({ type: 'system', subtype: 'init', model: 'claude-sonnet-5', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', uuid: U() });
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    const k = (JSON.stringify(m.message).match(/ping-([0-9a-z-]+)/) || [])[1];
    if (!k) continue;
    out({ type: 'assistant', message: { id: 'msg_' + U(), type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: 'pong-' + k }], stop_reason: null, usage }, parent_tool_use_id: null, uuid: U() });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 5, num_turns: 1, result: 'pong-' + k, total_cost_usd: 0, usage, uuid: U() });
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── throwaway servers in scratch worktrees (the working src/ + built public/ overlaid) ──
const mkWorktree = (dir) => {
  try { execSync(`git worktree remove --force ${dir}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  execSync(`git worktree add --detach ${dir} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${dir}/${f} && mkdir -p ${path.dirname(`${dir}/${f}`)} && cp -r ${repo}/${f} ${dir}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
};
mkWorktree(wt);
const servers = new Map(); // dir → child
const logOf = (dir) => path.join(stubDir, path.basename(dir) + '.server.log');
const startServer = (dir, port) => { const fd = fs.openSync(logOf(dir), 'a'); const srv = spawn(process.execPath, ['server.js'], { cwd: dir, env: { ...process.env, ...VNC_ENV, PORT: String(port), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); servers.set(dir, srv); return srv; };
const waitServer = async (port) => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${port}/api/home`); return true; } catch { await sleep(250); } } return false; };
startServer(wt, PORT);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  for (const srv of servers.values()) { try { srv.kill('SIGKILL'); } catch {} }
  // every process this suite caused carries one of these scratch paths (dtach, the wrapper, the stub, the device daemon)
  for (const pat of [wt, cwt, fakeHome, stubDir]) { try { execSync(`pkill -9 -f ${JSON.stringify(pat)}`, { stdio: 'ignore' }); } catch {} }
  for (const d of [wt, cwt]) { try { execSync(`git worktree remove --force ${d}`, { cwd: repo, stdio: 'ignore' }); } catch {} }
  for (const d of [wt, cwt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
check('the worktree server answered', await waitServer(PORT));

// ── raw CDP ─────────────────────────────────────────────────────────────────
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');

const VIEW = (sid) => `[...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(sid)})`;
const LIST = (sid) => `(${VIEW(sid)})?._messageList`;

let liveWs = null; const frames = [];
const openWs = async (port) => { liveWs = new WebSocket(`ws://127.0.0.1:${port}/ws`); await new Promise((r) => liveWs.on('open', r)); liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} }); };
const create = async (reqId) => {
  const before = frames.filter((m) => m?.type === 'created').length;
  liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId }));
  for (let i = 0; i < 80; i++) { const made = frames.filter((m) => m?.type === 'created'); if (made.length > before) return made[made.length - 1].sessionId; await sleep(250); }
  return null;
};
const attach = async (sid, name) => {
  await evalJs(`app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(name)}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  return waitFor(`!!(${VIEW(sid)})?._messageList`, 20000);
};

/** The page's own frame log + the probe: at every `attached` of a NEW epoch the page types
 *  `ping-<tag>` on its OWN ws at once (the earliest instant inside the window); every op frame
 *  of the session is logged with its seq and the ms since that attached. The jitter seam is
 *  pinned to the maximum on the view. `lagged` runs inject a real-shaped `lagged` frame into
 *  ws.js's own dispatcher 200 ms into the window. */
const armPage = (sid) => evalJs(`(() => {
  const sid = ${JSON.stringify(sid)};
  const v = ${VIEW(sid)};
  v._resetJitterMs = () => 500;
  window.__st = { runs: [], epoch: v._normEpoch || null, tag: null, lagged: false };
  app.ws.onGlobal((m) => {
    if (!m || m.sessionId !== sid) return;
    const st = window.__st; const now = performance.now();
    if (m.type === 'attached') {
      const changed = !!m.normEpoch && m.normEpoch !== st.epoch;
      st.epoch = m.normEpoch || st.epoch;
      st.runs.push({ t: now, type: 'attached', epoch: m.normEpoch, opSeq: m.opSeq, n: (m.messages || []).length, total: m.totalCount, slab: m.slab || 'slab', changed });
      if (changed && st.tag) {
        st.attachedAt = now;
        app.ws.send({ type: 'chat-input', sessionId: sid, text: 'ping-' + st.tag });
        if (st.lagged) setTimeout(() => { try { app.ws.ws.onmessage({ data: JSON.stringify({ type: 'lagged', sessionId: sid, normEpoch: m.normEpoch, seq: m.opSeq }) }); st.runs.push({ t: performance.now(), type: 'lagged-injected' }); } catch (e) { st.runs.push({ t: performance.now(), type: 'lagged-failed', err: String(e) }); } }, 200);
      }
    } else if (m.type === 'msg') {
      st.runs.push({ t: now, type: 'op', op: m.op, seq: m.seq, id: m.op === 'create' ? m.message && m.message.id : m.id, text: m.op === 'create' ? String((m.message && m.message.content && m.message.content[0] && m.message.content[0].text) || '').slice(0, 24) : undefined });
    } else if (m.type === 'lagged' || m.type === 'exited' || m.type === 'error') st.runs.push({ t: now, type: m.type });
  });
  return true;
})()`);

const inventory = (sid) => evalJs(`(() => { const v = (${VIEW(sid)}); const ids = (v?._messages || []).map((m) => m.id); const texts = (v?._messages || []).map((m) => String((m.content && m.content[0] && m.content[0].text) || '')); return { n: ids.length, unique: new Set(ids).size, total: v?._total, start: v?._windowStart, end: v?._windowEnd, epoch: v?._normEpoch, seqEpoch: v?._seqEpoch, lastSeq: v?._lastSeq, serverOpSeq: v?._serverOpSeq, poisoned: !!v?._seqPoisoned, pending: !!v?._resetPending, queued: (v?._resetQueue || []).length, dom: (${LIST(sid)})?.querySelectorAll('.chat-msg').length, pings: texts.filter((x) => /^ping-/.test(x)), pongs: texts.filter((x) => /^pong-/.test(x)), domTexts: [...((${LIST(sid)})?.querySelectorAll('.chat-msg') || [])].map((e) => e.textContent).filter((x) => /p(i|o)ng-/.test(x)).length }; })()`);

/** One restart run: SIGKILL + restart the server, the page NOT reloaded, the probe typed by the
 *  page at its attached; judged at +8 s. `lagged` adds the injected lagged frame. */
async function restartRun(dir, port, sid, tag, { lagged = false } = {}) {
  await evalJs(`(() => { window.__st.tag = ${JSON.stringify(tag)}; window.__st.lagged = ${lagged}; window.__st.runs.length = 0; window.__st.attachedAt = null; return true; })()`);
  const pre = await inventory(sid);
  const srv = servers.get(dir);
  try { srv.kill('SIGKILL'); } catch {}
  await sleep(600);
  startServer(dir, port);
  const up = await waitServer(port);
  try { liveWs.close(); } catch {}
  const reattached = await waitFor(`(() => { const e = (${VIEW(sid)})?._normEpoch || 0; return !!e && e !== ${JSON.stringify(pre.epoch)}; })()`, 45000);
  await sleep(8000);
  const inv = await inventory(sid);
  const log = await evalJs('window.__st.runs.slice()');
  const at = log.find((r) => r.type === 'attached' && r.changed);
  const t0 = at ? at.t : null;
  const ops = log.filter((r) => r.type === 'op');
  const probeCreates = ops.filter((r) => r.op === 'create' && r.text && (r.text === 'ping-' + tag || r.text === 'pong-' + tag));
  const pingAt = probeCreates.find((r) => r.text === 'ping-' + tag);
  const inWindow = !!(t0 != null && pingAt && pingAt.t - t0 < 500);
  const maxSeq = ops.reduce((m, r) => (typeof r.seq === 'number' && r.seq > m ? r.seq : m), -1);
  const attacheds = log.filter((r) => r.type === 'attached');
  const kept = inv.pings.includes('ping-' + tag) && inv.pongs.includes('pong-' + tag);
  const whole = inv.n === inv.unique && inv.n === inv.total && inv.dom === inv.n && !inv.pending && inv.queued === 0;
  const watermark = inv.seqEpoch === inv.epoch && (maxSeq < 0 || inv.lastSeq === maxSeq) && !inv.poisoned;
  return { tag, lagged, up, reattached, kept, inWindow, whole, watermark, pingMs: pingAt && t0 != null ? Math.round(pingAt.t - t0) : null, pongMs: (() => { const p = probeCreates.find((r) => r.text === 'pong-' + tag); return p && t0 != null ? Math.round(p.t - t0) : null; })(), attacheds: attacheds.map((a) => `${a.slab}:${a.opSeq}@${t0 != null ? Math.round(a.t - t0) : '?'}`), laggedInjected: log.some((r) => r.type === 'lagged-injected'), maxSeq, inv: { n: inv.n, total: inv.total, dom: inv.dom, lastSeq: inv.lastSeq, seqEpoch: inv.seqEpoch, epoch: inv.epoch, domTexts: inv.domTexts } };
}

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp(); await sleep(500);
  await openWs(PORT);
  const sid = await create('stagger');
  check('a chat session on the fix', !!sid && await attach(sid, 'stagger'));
  await armPage(sid);
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'ping-0' }));
  check('the stub answers (ping-0 → pong-0 on screen)', await waitFor(`[...((${LIST(sid)})?.querySelectorAll('.chat-msg') || [])].some((m) => /pong-0/.test(m.textContent))`, 10000));

  // ═══ ① the fix: RUNS restarts, half of them with a lagged frame inside the window ═══
  console.log(`① ${RUNS} restarts on the fix (jitter pinned to 500 ms; the probe typed at the attached frame; every other run injects a lagged frame at +200 ms)`);
  const runs = [];
  for (let k = 1; k <= RUNS; k++) {
    const r = await restartRun(wt, PORT, sid, `f${k}`, { lagged: k % 2 === 0 });
    runs.push(r);
    console.log(`  run ${k}${r.lagged ? ' (lagged)' : ''}: kept=${r.kept} inWindow=${r.inWindow} (ping +${r.pingMs} ms, pong +${r.pongMs} ms) whole=${r.whole} watermark=${r.watermark} attacheds=${r.attacheds.join(' ')}${r.lagged ? ' injected=' + r.laggedInjected : ''} n=${r.inv.n}/${r.inv.total} dom=${r.inv.dom} lastSeq=${r.inv.lastSeq}/${r.maxSeq}`);
  }
  check(`① every run re-attached on a new epoch and the probe's create op landed INSIDE the stagger window (< 500 ms after the attached frame) — ${runs.filter((r) => r.inWindow).length}/${RUNS}`, runs.every((r) => r.up && r.reattached && r.inWindow), runs.map((r) => [r.tag, r.reattached, r.pingMs]));
  check(`① THE FIX: the probe's records (the typed line + the pong) are on screen 8 s later in EVERY run — 0 losses in ${RUNS}`, runs.every((r) => r.kept), runs.filter((r) => !r.kept).map((r) => [r.tag, r.inv]));
  check('① …and the view is WHOLE after each rebuild: ids unique, list = total = DOM, nothing pending or queued', runs.every((r) => r.whole), runs.filter((r) => !r.whole).map((r) => [r.tag, r.inv]));
  check('① …and the seq watermark is consistent: _seqEpoch = the new epoch, _lastSeq = the last frame applied, never poisoned', runs.every((r) => r.watermark), runs.filter((r) => !r.watermark).map((r) => [r.tag, r.inv, r.maxSeq]));
  const lag = runs.filter((r) => r.lagged);
  check(`① the lagged runs (${lag.length}) really injected the frame inside the window and saw a SECOND attached of the same epoch (the newer snapshot) — still whole, still kept`, lag.length >= 1 && lag.every((r) => r.laggedInjected && r.attacheds.length >= 2 && r.kept && r.whole), lag.map((r) => [r.tag, r.laggedInjected, r.attacheds]));
  check('① no page error', pageErrors.length === 0, pageErrors);
  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid })); } catch {}
  await sleep(500);

  // ═══ ② CONTROL: the pre-fix chat-view (the hold removed) in a second scratch worktree ═══
  console.log(`② CONTROL: ${CONTROL_RUNS} restarts on the pre-fix chat-view (the _onOp hold removed, bundle rebuilt)`);
  mkWorktree(cwt);
  const cvPath = path.join(cwt, 'src/lib/chat-view.js');
  const src = fs.readFileSync(cvPath, 'utf8');
  const needle = '    if (this._resetPending) { this._holdResetOp(op); return; }\n';
  check('control setup: the patch anchor exists exactly once in the fix (a control that cannot be built proves nothing)', src.split(needle).length === 2);
  fs.writeFileSync(cvPath, src.replace(needle, ''));
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: cwt, stdio: 'ignore' });
  startServer(cwt, CPORT);
  check('control: the patched copy\'s server answered', await waitServer(CPORT));
  await cdp('Page.navigate', { url: `http://127.0.0.1:${CPORT}/` });
  await waitApp(); await sleep(500);
  try { liveWs.close(); } catch {}
  await openWs(CPORT);
  const csid = await create('stagger-ctl');
  check('control: a chat session on the pre-fix build', !!csid && await attach(csid, 'stagger-ctl'));
  await armPage(csid);
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: csid, text: 'ping-c0' }));
  check('control: the stub answers', await waitFor(`[...((${LIST(csid)})?.querySelectorAll('.chat-msg') || [])].some((m) => /pong-c0/.test(m.textContent))`, 10000));
  const ctl = [];
  for (let k = 1; k <= CONTROL_RUNS; k++) {
    const r = await restartRun(cwt, CPORT, csid, `c${k}`, { lagged: false });
    ctl.push(r);
    console.log(`  control run ${k}: kept=${r.kept} inWindow=${r.inWindow} (ping +${r.pingMs} ms) n=${r.inv.n}/${r.inv.total} dom=${r.inv.dom} lastSeq=${r.inv.lastSeq}/${r.maxSeq}`);
  }
  const lost = ctl.filter((r) => r.inWindow && !r.kept);
  check(`② CONTROL: the pre-fix copy LOSES the probe's records in ${lost.length}/${CONTROL_RUNS} runs (the measured class: the ops ran into the list the slab replaced; the watermark says applied) — the ① rule can go red`, lost.length >= 1, ctl.map((r) => [r.tag, r.inWindow, r.kept, r.inv]));
  check('② CONTROL: …and in every lost run the watermark still claims the lost frames (lastSeq = the last frame seen) — the resume by seq could never bring them back', lost.every((r) => r.inv.lastSeq === r.maxSeq), lost.map((r) => [r.tag, r.inv.lastSeq, r.maxSeq]));
  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: csid })); } catch {}
} catch (e) {
  failed++;
  console.error('✗ suite threw: ' + (e && e.stack || e));
}
if (failed && process.env.STAGGER_KEEP_LOG) { try { for (const d of [wt, cwt]) if (fs.existsSync(logOf(d))) fs.copyFileSync(logOf(d), process.env.STAGGER_KEEP_LOG + '.' + path.basename(d)); } catch {} }
console.log(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
cleanup();
process.exit(failed ? 1 : 0);
