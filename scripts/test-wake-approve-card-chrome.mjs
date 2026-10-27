#!/usr/bin/env node
// A WAKE REQUEST IN THE CHAT THAT RAISED IT, DECIDED BY A CLICK AT EITHER DOOR, IN A REAL CHROME (lane wake-approve-card — the
// owner's ruling 2026-10-27 on userW's report: an agent asked to be WOKEN by a chat and the Approve sat only in the For-you
// tray; «the chat that raised it ALSO shows the Approve / Deny card; the approval is still ONLY a click»). The card is lane
// chat-needs-you-card's ONE renderer; this suite drives the delta end to end over a throwaway server (this tree's src/ +
// built public/, the fake channel adapters on) and ONE stub `claude` conversation behind the real chat-wrapper whose turns
// RUN THE REAL CLIs as Bash tool calls. The RUNNER'S SHAPE: Chrome under the runner's fontconfig (DejaVu, Liberation, Noto CJK)
// and a 2× CPU throttle on every page; a press is measured and pressed as ONE act (realClick); no wall-clock bound asserted.
//   ⓪ RED CONTROL FIRST — userW's chat (a bundle without the needs cards): ONE agent turn files two wake requests; the chat
//     shows NO card, the tray alone holds the Approve (the «before» shot)
//   ① ONE TURN, TWO WAKE REQUESTS of the same words (two chats titled «Ops room» — Lark-like and Slack-like): TWO cards in
//     the tool cards that ran them, on two pages; each Approve / Deny an icon + its word, ≥ 24 px at a desk, ≥ 44 px on a
//     phone (375 touch); the For-you tray counts each ONCE and keeps its own Approve (R4, the control)
//   ② A CLICK IS THE ONLY APPROVAL on the real hub: the agent's own vsst_ (its real token), a job's jbt_, an automation key,
//     a bare write ⇒ refused by name; no agent-side route decides; the AGENT itself trying (its Bash POSTs with its token and
//     its text says «approve») ⇒ refused; the owner typing «approve» to the agent ⇒ nothing decided — both still open
//   ③ THE FALSE BRANCH (no role has it today — the registry's deferred viewer row): a page whose role may not decide reads
//     «waiting for the owner — …» with NO buttons; the owner's role back ⇒ the buttons back
//   ④ APPROVE ON THE CARD (page A) ⇒ the hub approves exactly that request — the agent's own watch list now holds the wake
//     watch (the wake proceeds); page B's card says «approved by you · HH:MM»; page A's For-you window says the same
//   ⑤ DENY IN THE TRAY (page A's For-you window, the other request) ⇒ the card for it in the chat under the window — folded in
//     the accordion — PATCHED IN PLACE (the same element; no record of the transcript re-drawn) to «denied by you · HH:MM»;
//     page B says it too
//   ⑥ A RELOAD re-derives both records from the store (never stored twice: the store holds each item once, the page's storage
//     holds none); the agent never saw the card (nothing of it reached the conversation: its stdin, the hub's frames). RED
//     CONTROL: the base's record words (a bundle without the stamp) — «approved · …», neither who nor when
// ACCEPTANCE ROUND 2 (主开发): ⓪b EVERY WRITER OF A WAKE WATCH ASKS THE PERSON VERDICT — on the real hub, the agent's own vsst_
//     on the watchers doors (a conversation, the account, a rule, an assignment) with a wake row ⇒ 403 human_only, a bare write
//     ⇒ 403 cross_site; its non-wake write (a next-turn row) and its own CLI road (`watch --mode next-turn --keyword`) as they
//     were; this page ⇒ written · ① the PHONE leg: a decision row's verbs are Approve ✓ / Deny ✕ and nothing that closes it
//     · ①c NO OTHER CLOSER: no ✓ to press on the phone (on the base: pressed, it DENIED the request and the record read «✓
//     done»), «Mark all seen» on the tray passes both by («2 decisions left for you»), a scripted close is refused by name ·
//     ④/⑤ a decision has no Undo · ⑤b A DECISION IS FINAL: a reopen is refused by name, the decided rows carry no ↺ / Reopen
//   SHOTS: before (no card), the two cards (desk + phone), the waiting-owner branch, the decided records; round 2: the phone's
//     decision row (r2-phone-decision-row-375.png), the tray's decision rows (r2-tray-decision-rows-1280.png), after the phone
//     press (r2-phone-after-press-375.png).
// ACCEPTANCE ROUND 4 (主开发): ⑦d THE VAULT'S GRANT REQUEST IS A DECISION ROW — the agent's request for a STORED secret is a card in
//     the asking chat with its own three verbs (Allow once / For 8 hours / Deny) and NO ✓ / ✕; For 8 hours (the second password
//     first) records «allowed by you for 8 h · HH:MM» (RED on bec3e3f8: ✓ / ✕ drawn — ✓ «Mark done» denied the request silently)
// ACCEPTANCE ROUND 3 (主开发 + the owner's items 3–4): ⑦a A POINTER HIDES — the agent's access request (rq-) is a card in the
//     asking chat with ONE closer, ✕ Hide (on the base: ✓ Mark done / ✕ Dismiss — the ✓ pressed recorded «✓ done» with the request
//     open); the press records «hidden — nothing was decided», the request stays open in the Reach dialog, the toast has no Undo;
//     the agent's re-ask brings it back · ⑦b a new wake ask's card says «expires in 7 d», the agent told when it ends · ⑦c THE
//     VAULT'S TWO ASKS IN THE ASKING CHAT: the paste request's FORM card (the masked field, Save to vault / Refuse, «Wrong name or
//     kind? Refuse — …», no ✓ / ✕) pasted and saved IN the card (the tray's route; «stored · HH:MM», the value nowhere on the
//     page), then the run the agent makes with it — its card with Allow once / Deny and no ✓ / ✕ (desk + phone), Deny ⇒ «denied by
//     you · HH:MM» and the run refused; THE WIRE (主开发's pin): the value is in no WebSocket frame a page saw (both ways), no hub
//     broadcast, not the server log, not what reached the agent (its stdin, tool output, next turn) — a control proves the frames
//     carry the request; «ALWAYS» in the chat whenever the tray offers it (a known tool naming a host: chat = tray = once / always
//     / deny; an interpreter: once / deny on both). SHOTS r3-chat-pointer(-hidden)-1280, r3-chat-vault-always-1280, r3-chat-vault-request / -cards / -records-1280,
//     r3-phone-vault-cards-375. (The hub-act ask needs a paired machine: test-hub-act-ask drives the real asker — its `about`.)
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-wake-approve-card-chrome.mjs [--shots <dir>]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import * as SCR from './scratch.mjs';   // the runner's fontconfig helpers where this tree has them (2.369.358+)
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('wake-card-wt');
const fakeHome = scratchHome('wake-card-home', fs);
const chromeDir = scratch('wake-card-chrome');
const stubDir = scratch('wake-card-stub');
const fontDir = scratch('wake-card-fonts');
const MUT = scratch('wake-card-mut');
const MUT2 = scratch('wake-card-mut2');
const WORK = path.join(stubDir, 'work', 'ops');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('wake-card-shots');
for (const d of [stubDir, WORK, SHOTS, fontDir]) fs.mkdirSync(d, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLL = 'fake-poll/fake-poll-ops', PUSH = 'fake-push/fake-push-ops';   // both titled «Ops room»: the SAME words

// ── THE RUNNER'S FACE: scratch.mjs's runnerFontEnv where this tree has it (2.369.358+), else the same fontconfig here ──
const RUNNER_FONT_DIRS = SCR.RUNNER_FONT_DIRS || ['/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/truetype/liberation', '/usr/share/fonts/opentype/noto'];
function runnerFontEnv(dir) {
  if (typeof SCR.runnerFontEnv === 'function') return SCR.runnerFontEnv(dir);
  const file = path.join(dir, 'fonts.conf');
  fs.writeFileSync(file, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${RUNNER_FONT_DIRS.map((d) => `  <dir>${d}</dir>\n`).join('')}  <cachedir>${path.join(dir, 'cache')}</cachedir>\n  <include ignore_missing="yes">/etc/fonts/conf.d</include>\n</fontconfig>\n`);
  return { FONTCONFIG_FILE: file };
}
const FONT_ENV = fs.existsSync(path.join(RUNNER_FONT_DIRS[0], 'DejaVuSans.ttf')) ? runnerFontEnv(fontDir) : {};
console.log(FONT_ENV.FONTCONFIG_FILE ? '  (Chrome under the runner\'s fontconfig: DejaVu / Liberation / Noto CJK)' : '  (no DejaVu on this box — this box\'s own face)');

// ── the stub CLI: each user line = ONE turn; a line naming a verb RUNS the real CLIs as Bash tool calls ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
const { spawnSync } = require('child_process');
const fs = require('fs');
const SID = 'wk-' + process.pid;
const DIR = ${JSON.stringify(stubDir)};
const BIN = ${JSON.stringify(path.join(wt, 'data', 'bin'))};
fs.writeFileSync(DIR + '/env.json', JSON.stringify({ sid: SID, token: process.env.VIBESPACE_SESSION_TOKEN || null, api: process.env.VIBESPACE_API || null }));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.308' });
const watch = (conv) => ['vibespace-channels', ['watch', conv, '--mode', 'wake', '--why', 'wake me on outages in ' + conv + ' so I can open an incident']];
// the AGENT trying to approve its own request: its own token on the person's route and on an agent-side twin of it
const SELF = 'const id = require("fs").readFileSync(' + JSON.stringify(DIR + '/wr-id') + ', "utf8").trim(); const H = { Authorization: "Bearer " + process.env.VIBESPACE_SESSION_TOKEN, "Content-Type": "application/json" };'
  + ' (async () => { for (const p of ["/api/channels/reach-requests/" + id + "/approve", "/api/agent/channels/reach-requests/" + id + "/approve"]) { const r = await fetch(' + JSON.stringify(${JSON.stringify(ORIGIN)}) + ' + p, { method: "POST", headers: H, body: "{}" }); let j = null; try { j = await r.json(); } catch {} console.log(p.split("/")[2] + " " + r.status + " " + ((j && j.code) || "-")); } })();';
// round 3: the agent runs a command with the entry the owner pasted (its ref read off \`vibespace-vault list\`) — a NEW shape: a card
const VRUN = 'const { spawnSync } = require("child_process"); const B = ' + JSON.stringify(BIN) + ';'
  + ' const l = spawnSync(process.execPath, [B + "/vibespace-vault", "list"], { env: process.env, encoding: "utf8" }); const ref = String(l.stdout).split(" ").find((w) => w.startsWith("vault://"));'
  + ' if (!ref) { console.log("vibespace-vault list: " + l.stdout + l.stderr); process.exit(3); }'
  + ' const r = spawnSync(process.execPath, [B + "/vibespace-vault", "run", "--env", "PW=" + ref, "--", process.execPath, "-e", "console.log(process.env.PW ? 1 : 0)"], { env: process.env, encoding: "utf8", timeout: 90000 });'
  + ' console.log("vibespace-vault run: rc=" + r.status + " " + String(r.stdout) + String(r.stderr)); process.exit(r.status || 0);';
// round 4: the agent asks the owner for a STORED entry (its reference the suite wrote to grant-ref) — the vault's third card
const VGRANT = 'const { spawnSync } = require("child_process"); const B = ' + JSON.stringify(BIN) + '; const ref = require("fs").readFileSync(' + JSON.stringify(DIR + '/grant-ref') + ', "utf8").trim();'
  + ' const r = spawnSync(process.execPath, [B + "/vibespace-vault", "request", ref, "--for", "upload the nightly backup to the bucket"], { env: process.env, encoding: "utf8", timeout: 30000 });'
  + ' console.log("vibespace-vault request: rc=" + r.status + " " + String(r.stdout) + String(r.stderr)); process.exit(r.status || 0);';
const VERBS = {
  watch2: [watch(${JSON.stringify(POLL)}), watch(${JSON.stringify(PUSH)})],
  watchnt: [['vibespace-channels', ['watch', ${JSON.stringify(POLL)}, '--mode', 'next-turn', '--keyword', 'outage', '--why', 'tell me about outages on my next turn']]],   // round 2: the agent's own NON-wake road
  unwatchnt: [['vibespace-channels', ['unwatch', ${JSON.stringify(POLL)}]]],
  selfapprove: [['node', ['-e', SELF]]],
  // round 3: an access request (a POINTER to the Reach dialog), a wake ask on one chat, the vault's paste request and its run
  request: [['vibespace-channels', ['request', 'fake-poll/fake-poll-announce', 'to read the incident thread before I open an incident']]],
  watchpoll: [watch(${JSON.stringify(POLL)})], watchpush: [watch(${JSON.stringify(PUSH)})],
  vreq: [['vibespace-vault', ['request', 'UniFi UCG-Fiber local admin', '--purpose', 'log in to the controller to read the WAN state', '--kind', 'password', '--name', 'UniFi UCG-Fiber local admin (agent-ops)']]],
  vrun: [['node', ['-e', VRUN]]],
  vrunall: [['node', ['-e', VRUN.replace('process.execPath, "-e", "console.log(process.env.PW ? 1 : 0)"', '"curl", "-s", "https://api.example.com/v1/items"')]]],   // round 3: a known tool naming a host — «Always» offered
  vgrant: [['node', ['-e', VGRANT]]],   // round 4: the agent asks for a STORED entry (the vault's grant request — Allow once / For 8 hours / Deny)
};
let n = 0, buf = '';
const turn = (line) => {
  const k = ++n;
  fs.appendFileSync(DIR + '/seen.log', line + '\\n');   // what the AGENT reads — never the card
  const verb = Object.keys(VERBS).find((v) => line.includes('do:' + v + ' ') || line.endsWith('do:' + v));
  const calls = verb ? VERBS[verb] : [];
  calls.forEach(([cli, argv], j) => {
    const tid = 'toolu_wk' + k + '_' + j;
    const command = cli + ' ' + argv.map((a) => (/^[\\w./:-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');
    out({ type: 'assistant', session_id: SID, uuid: 'a-t' + k + '-' + j, message: { id: 'mt' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command, description: 'run ' + cli } }] } });
    const r = cli === 'node' ? spawnSync(process.execPath, argv, { env: process.env, encoding: 'utf8', timeout: 60000 }) : spawnSync(process.execPath, [BIN + '/' + cli, ...argv], { env: process.env, encoding: 'utf8', timeout: 60000 });
    const text = String(r.stdout || '') + (r.stderr ? String(r.stderr) : '');
    fs.appendFileSync(DIR + '/cli.log', '### ' + (verb || '?') + ' ' + j + ' rc=' + r.status + '\\n' + text + '\\n');
    out({ type: 'user', session_id: SID, uuid: 'u-t' + k + '-' + j, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: text || '(no output)', is_error: r.status !== 0 }] } });
  });
  const said = verb === 'selfapprove' ? 'approve — I approve my own wake request.' : calls.length ? 'Filed it for you — it waits on your click.' : 'ok';
  out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: said }] } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 200, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 12 } });
};
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const c = m.message && m.message.content; const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && x.type === 'text' ? x.text : '')).join('') : ''; turn(text); } });
process.stdin.on('end', () => setTimeout(() => process.exit(0), 300));
`, { mode: 0o755 });

// ── RED CONTROL bundles: THIS source with one cut each (a missing anchor = a named red) ──
function mutantBundle(dir, cuts) {
  fs.mkdirSync(dir, { recursive: true });
  execSync(`cp -r ${repo}/src ${dir}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'));
  for (const [rel, from, to] of cuts) { const f = path.join(dir, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant anchor ${rel}: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, to)); }
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: dir });
  return fs.readFileSync(path.join(dir, 'bundle-mut.js'));
}
let NO_CARD = null, NO_CARD_ERR = '', NO_STAMP = null, NO_STAMP_ERR = '';
try { NO_CARD = mutantBundle(MUT, [['src/lib/chat-view.js', '    this._needsCards = new NeedsCards(this);\n    this._needsCards.start(winInfo?._listenerCtl?.signal);\n', '']]); } catch (e) { NO_CARD_ERR = String(e && e.message || e).split('\n')[0]; }
try { NO_STAMP = mutantBundle(MUT2, [['src/lib/chat-needs-card.js', 'const stamp = decidedStamp(e.item, { t });', 'const stamp = null;'], ['src/lib/user-todos-row.js', 'const stamp = item ? decidedStamp(item, { t }) : null;', 'const stamp = null;']]); } catch (e) { NO_STAMP_ERR = String(e && e.message || e).split('\n')[0]; }

// ── throwaway server in a worktree (the tree's src/ + built public/ + data/bin — the CLIs the stub runs) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1' }, stdio: ['ignore', srvLog, srvLog] });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, ...FONT_ENV } });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  for (const root of [wt, fakeHome, stubDir, chromeDir]) { try { endRootedProcesses(root); } catch { } } // the server, dtach, the wrapper, the stub, Chrome (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [chromeDir, fakeHome, stubDir, fontDir, MUT, MUT2]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 480e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
for (let i = 0; i < 120; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP, one connection per page (+ a RED control's bundle through the Fetch domain) ──
const WebSocket = require('ws');
let seq = 0; let mutant = null;
const pageErrors = [];
const WS_SEEN = [];   // round 3: every WebSocket frame a page saw, received AND sent (the wire assert of a pasted value)
async function connect(target) {
  const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  const pend = new Map();
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; }
    if (m.method === 'Network.webSocketFrameReceived' || m.method === 'Network.webSocketFrameSent') WS_SEEN.push(String((m.params.response && m.params.response.payloadData) || ''));
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
    if (m.method === 'Fetch.requestPaused') {
      const p = m.params, u = new URL(p.request.url);
      if (mutant?.bundle && u.pathname === '/bundle.js') sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.fulfillRequest', params: { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: mutant.bundle.toString('base64') } }));
      else sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.continueRequest', params: { requestId: p.requestId } }));
    }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    sock.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(120); } try { return await evalJs(expr); } catch { return false; } };
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
  await cdp('Emulation.setCPUThrottlingRate', { rate: 2 }); // the runner's slower CPU
  const device = async (w, h, { mouse = false } = {}) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mouse ? 1 : 2, mobile: !mouse });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: !mouse, maxTouchPoints: mouse ? 1 : 5 });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: mouse ? 'hover' : 'none' }, { name: 'pointer', value: mouse ? 'fine' : 'coarse' }] });
  };
  const load = async () => {
    await cdp('Page.navigate', { url: ORIGIN + '/' });
    await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)');
    await waitFor(`!document.getElementById('loading-screen')`, 15000); await sleep(900);
  };
  const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
  // A REAL PRESS = measure and press as ONE act (scratch.mjs realClicker's shape — 2.369.358): the target measured WHERE IT
  // STANDS (scrolled only when it is not wholly in view — a press that scrolls its own target moves it under the pointer, and
  // the press arm rightly refuses that: measured here, a second 'center' scroll moved a centred Approve by 40 px), the pointer
  // moved there, what is UNDER it asked, pressed only if it is the target (one re-aim when it moved between the two)
  const realClick = async (sel) => {
    const MEASURE = `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; let q = e.getBoundingClientRect(); if (q.top < 0 || q.bottom > innerHeight || q.left < 0 || q.right > innerWidth) { e.scrollIntoView({ block: 'center' }); q = e.getBoundingClientRect(); } return q.width && q.height ? { x: q.left + q.width / 2, y: q.top + q.height / 2 } : null; })()`;
    for (let aim = 0; aim < 2; aim++) {
      const r = await evalJs(MEASURE); if (!r) return false;
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      const hits = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}), h = document.elementFromPoint(${r.x}, ${r.y}); return !!e && !!h && (h === e || e.contains(h)); })()`);
      if (!hits) continue;
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      return true;
    }
    return false;
  };
  /** THE PERSON'S PRESS: the target brought into view, a rest past the press arm's ARM_MS (a button that just MOVED under the
   *  pointer answers nothing — the arm's law), then ONE real press where it stands → {pressed, toast, miss} */
  const restThenPress = async (sel) => {
    await evalJs(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'center' }); true`); await sleep(1500);
    const ARM = `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; return { since: b._armSince == null ? null : Math.round(performance.now() - b._armSince), armTop: b._armTop == null ? null : Math.round(b._armTop * 10) / 10, top: Math.round(b.getBoundingClientRect().top * 10) / 10, scroll: Math.round((b.closest('.chat-message-list') || document.scrollingElement).scrollTop) }; })()`;
    const before = await evalJs(ARM);
    const pressed = await realClick(sel);
    const after = await evalJs(ARM);
    const miss = pressed ? null : await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'gone'; const q = e.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { w: q.width, h: q.height, top: q.top, hit: h ? h.tagName + '.' + String(h.className).slice(0, 60) : null }; })()`);
    await sleep(700);
    const toast = await evalJs(`[...document.querySelectorAll('.global-toast, .toast')].map((x) => x.textContent).join(' | ')`);
    return { pressed, toast, miss, before, after };
  };
  return { cdp, evalJs, waitFor, device, load, shot, realClick, restThenPress, front: () => cdp('Page.bringToFront'), close: () => { try { sock.close(); } catch { } } };
}

const targets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).filter((x) => x.type === 'page');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await targets())[0]; } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const A = await connect(target);

// ── the conversation (a stub claude behind the real chat-wrapper) and its turns ──
const hubWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const frames = [];
await new Promise((r) => hubWs.on('open', r)); hubWs.on('message', (d) => { try { frames.push(String(d)); } catch { } });
hubWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: WORK, reqId: 'wk-ops' }));
let SID = null; for (let i = 0; i < 100 && !SID; i++) { const f = frames.map((x) => { try { return JSON.parse(x); } catch { return null; } }).find((m) => m?.type === 'created' && m.reqId === 'wk-ops'); if (f) SID = f.sessionId; else await sleep(150); }
const say = (text) => hubWs.send(JSON.stringify({ type: 'chat-input', sessionId: SID, text }));
const api = async () => (await (await fetch(`${ORIGIN}/api/user-todos`)).json()).todos;
const wakeItems = async () => { const t = await api(); return { open: t.open.filter((i) => i.action && i.action.type === 'channel-watch-request'), resolved: t.resolved.filter((i) => i.action && i.action.type === 'channel-watch-request') }; };
const cliLog = () => { try { return fs.readFileSync(path.join(stubDir, 'cli.log'), 'utf8'); } catch { return ''; } };
const logHas = async (re, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(cliLog())) return true; await sleep(150); } return re.test(cliLog()); };
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(150); } return fn(); };
const CHAT = (sid) => `[...app.wm.windows.values()].find((w) => w.type === 'chat' && app.sessions.get(w.id)?.sessionId === ${JSON.stringify(sid)})`;
const VIEW = `(() => { for (const v of app.sessions?.values?.() || []) if (v && v._needsCards && v._messageList?.isConnected) return v; return null; })()`;
const openChat = (P) => P.evalJs(`(() => { if (!${CHAT(SID)}) app.attachSession(${JSON.stringify(SID)}, 'ops watch', ${JSON.stringify(WORK)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
/** the card of item `id` in a page: where it sits, its state, its verbs (word + icon + size), its record line */
const CARD = (id) => `(() => { const c = document.querySelector('.cn-card[data-item="${id}"]'); if (!c) return null; const host = c.closest('.chat-msg'); const raw = host && host._rawMsg;
  const btn = (sel) => { const b = c.querySelector(sel); if (!b || !b.offsetParent) return null; const r = b.getBoundingClientRect(); return { word: (b.textContent || '').trim(), icon: !!b.querySelector('.ut-decide-ico svg'), w: Math.round(r.width), h: Math.round(r.height) }; };
  return { open: c.classList.contains('cn-open'), done: c.classList.contains('cn-done'), fold: c.classList.contains('cn-fold'), wait: c.classList.contains('cn-wait'), tag: c.__wkTag || null,
    hostCmd: raw && raw.content && raw.content[0] && raw.content[0].input ? String(raw.content[0].input.command || '') : '', text: (c.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300),
    approve: btn('.ut-action-proposal[data-answer="approve"]'), deny: btn('.ut-action-proposal[data-answer="reject"]'), buttons: [...c.querySelectorAll('button')].filter((x) => x.offsetParent && !x.classList.contains('cn-line')).length,
    verbs: [...c.querySelectorAll('button')].filter((x) => x.offsetParent && !x.classList.contains('cn-line')).map((x) => ((x.textContent || '').trim() + (x.dataset.label ? ' ' + x.dataset.label : '')).trim().slice(0, 24)),
    closers: [...c.querySelectorAll('.ut-done, .ut-dismiss, .ut-reopen')].filter((x) => x.offsetParent).length,
    line: (c.querySelector('.cn-line')?.textContent || '').trim() }; })()`;
/** the clock words a decision at `ts` reads on THIS page (its timezone): «09:41» */
const hm = (P, ts) => P.evalJs(`(() => { const d = new Date(${Number(ts) || 0}); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); })()`);
const T0 = Date.now();
let Bp = null;
const lap = async (what) => { const bw = Bp ? await Bp.evalJs(`document.visibilityState + ' · ' + [...app.wm.windows.values()].length + ' windows'`).catch(() => '?') : '-'; console.log(`  (${what} at ${((Date.now() - T0) / 1000).toFixed(1)} s · page B ${bw})`); };

try {
  // setup: the owner lets the agent SEE both «Ops room» chats (the Reach dialog's own route — a visible row each)
  await sleep(600); say('hello');
  const env = await until(() => { try { return JSON.parse(fs.readFileSync(path.join(stubDir, 'env.json'), 'utf8')); } catch { return null; } });
  await A.device(1280, 800, { mouse: true }); await A.load();
  for (const conv of [POLL, PUSH]) {
    let r = null;
    for (let i = 0; i < 80 && !(r && r.status === 200); i++) { r = await A.evalJs(`fetch('/api/channels/${conv}/reach', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal: { kind: 'agent', id: ${JSON.stringify(env && env.sid)} }, level: 'visible' }) }).then((r) => ({ status: r.status }))`); if (!r || r.status !== 200) await sleep(250); }
    if (!r || r.status !== 200) console.log(`  (setup: the reach write for ${conv} answered ${JSON.stringify(r)})`);
  }
  check('setup: the stub conversation runs behind the real wrapper with its own session token (vsst_) — the agent the hub knows', !!env && /^vsst_/.test(String(env.token || '')) && !!SID, env && { sid: env.sid, token: String(env.token || '').slice(0, 5) });

  console.log('⓪b EVERY WRITER OF A WAKE WATCH ASKS THE PERSON VERDICT (round 2) — the watchers doors on the real hub');
  try {
    const V = { Authorization: 'Bearer ' + (env && env.token) };
    const me = { kind: 'agent', id: env && env.sid };
    const WAKE = { principal: me, notify: 'wake', delivery: 'wake', mode: 'all', dailyWakeCap: 3 };
    const NEXT = { principal: me, notify: 'wake', delivery: 'next-turn', mode: 'all' };   // (no origin 'agent': clearing it must not leave the user's removal mark)
    const send = async (method, p, body, headers = {}) => { const r = await fetch(ORIGIN + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, code: j && j.code, id: j && j.grain && j.grain.id }; };
    const undo = async (r, method, p, body) => { if (r.status === 200) await send(method, p, body, { 'Sec-Fetch-Site': 'same-origin' }); };   // the base wrote it: take it back at once (a wake row wakes)
    const w = {};
    w.conv = await send('PUT', `/api/channels/${POLL}/watchers`, { watchers: [WAKE] }, V); await undo(w.conv, 'PUT', `/api/channels/${POLL}/watchers`, { watchers: [] });
    w.bare = await send('PUT', `/api/channels/${POLL}/watchers`, { watchers: [WAKE] }); await undo(w.bare, 'PUT', `/api/channels/${POLL}/watchers`, { watchers: [] });
    w.acct = await send('PUT', '/api/channels/adapters/fake-poll/watchers', { watchers: [WAKE] }, V); await undo(w.acct, 'PUT', '/api/channels/adapters/fake-poll/watchers', { watchers: [] });
    w.assign = await send('PUT', `/api/channels/${POLL}/assignment`, { assignment: { principal: me, authority: 'draft' } }, V); await undo(w.assign, 'PUT', `/api/channels/${POLL}/assignment`, { assignment: null });
    w.rule = await send('POST', '/api/channels/adapters/fake-poll/patterns', { pattern: { match: 'any', rules: [{ kind: 'title', value: 'Ops' }] }, access: [], watchers: [WAKE] }, V);
    if (w.rule.status === 200 && w.rule.id) await fetch(`${ORIGIN}/api/channels/adapters/fake-poll/patterns/${w.rule.id}`, { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'same-origin' } });
    console.log('  (the doors answered: ' + JSON.stringify(w) + ')');
    check('a WAKE row from the agent\'s own vsst_ (its real token) on the watchers doors — a conversation, the account, a rule written with its lists, a pre-split assignment ⇒ 403 human_only; a bare write ⇒ 403 cross_site (on the base: written, a billed wake with no click)', w.conv.status === 403 && w.conv.code === 'human_only' && w.acct.code === 'human_only' && w.rule.code === 'human_only' && w.assign.code === 'human_only' && w.bare.status === 403 && w.bare.code === 'cross_site', w);
    const nt = await send('PUT', `/api/channels/${POLL}/watchers`, { watchers: [NEXT] }, V);
    const cleared = await send('PUT', `/api/channels/${POLL}/watchers`, { watchers: [] }, V);
    say('now do:watchnt'); await logHas(/### watchnt 0 rc=/);
    const ntOut = (cliLog().split('### watchnt 0')[1] || '').split('###')[0];
    const mine = await (await fetch(ORIGIN + '/api/agent/channels/watches', { headers: V })).json().catch(() => null);
    say('now do:unwatchnt'); await logHas(/### unwatchnt 0 rc=/);
    check(`…an agent's NON-wake write stays as it is: a next-turn row on the same door ⇒ ${nt.status} (a removal ⇒ ${cleared.status}); its own CLI road (\`watch --mode next-turn --keyword outage\`) sets it at once`, nt.status === 200 && cleared.status === 200 && / rc=0/.test(cliLog().split('### watchnt 0')[1] || '') && /next turn|next-turn/.test(JSON.stringify(mine)), { nt, cleared, ntOut: ntOut.trim().slice(0, 200), mine: JSON.stringify(mine).slice(0, 300) });
    const page = await A.evalJs(`(async () => { const p = '/api/channels/${POLL}/watchers'; const put = (rows) => fetch(p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watchers: rows }) }).then((r) => r.status); const a = await put([${JSON.stringify(WAKE)}]); const b = await put([]); return { wrote: a, cleared: b }; })()`);
    check(`…this instance's own page (the owner's Notify…) writes the wake (${page.wrote}) and takes it back (${page.cleared})`, page.wrote === 200 && page.cleared === 200, page);
  } catch (e) { fail++; console.log('  ✗ ⓪b threw: ' + (e?.message || e)); }
  await lap('⓪b done');

  if (!NO_CARD) check('⓪ the RED CONTROL bundle builds from this source (its anchor is the chain\'s line)', false, NO_CARD_ERR);
  else try {
    console.log('⓪ RED CONTROL FIRST — userW\'s chat (no needs cards): the agent files its wake request, the chat says nothing');
    mutant = { bundle: NO_CARD };
    await A.load(); await openChat(A);
    say('now do:watch2');   // ONE turn, two wake requests (both chats titled «Ops room»)
    await logHas(/### watch2 1 rc=/);
    await until(async () => (await wakeItems()).open.length === 2);
    await A.waitFor(`!!${CHAT(SID)} && document.querySelectorAll('.chat-msg-tool-result').length >= 2`, 15000); await sleep(1500);
    const r = await A.evalJs(`({ cards: document.querySelectorAll('.cn-card').length, approveInChat: !!document.querySelector('.chat-message-list .ut-action-proposal'), open: (app._inboxModel?.todos.open || []).filter((i) => i.action && i.action.type === 'channel-watch-request').length })`);
    await A.shot('before-no-card-1280.png');
    check('RED CONTROL: the base\'s chat — the wake requests are open in the tray, the chat that raised them shows NO card and NO Approve (userW\'s report)', r.cards === 0 && !r.approveInChat && r.open === 2, r);
  } catch (e) { fail++; console.log('  ✗ ⓪ threw: ' + (e?.message || e)); } finally { mutant = null; }
  await lap('⓪ done');

  console.log('① ONE TURN, TWO WAKE REQUESTS of the same words — two cards, two pages; the tray counts each once and keeps its Approve');
  if (!/### watch2 1 rc=/.test(cliLog())) { say('now do:watch2'); await logHas(/### watch2 1 rc=/); }   // ⓪ did not run (its bundle failed)
  const two = await until(async () => { const w = await wakeItems(); return w.open.length === 2 ? w.open : null; });
  // which request is which: the id each `vibespace-channels watch` call printed (its «Filed for you: … (wr-…)» line)
  const printed = (j) => ((/### watch2 \d rc=/.test(cliLog()) ? cliLog().split('### watch2 ' + j + ' rc=')[1] || '' : '').split('###')[0].match(/\((wr-[^)]+)\)/) || [])[1] || null;
  const wrPoll = (two || []).find((i) => i.action.id === printed(0)), wrPush = (two || []).find((i) => i.action.id === printed(1));
  check(`two open wake requests with the SAME words («${two && two[0] && two[0].text}») — two items, one per request (identity 'id')`, !!two && two.length === 2 && two[0].text === two[1].text && two[0].id !== two[1].id && !!wrPoll && !!wrPush && wrPoll.id !== wrPush.id, (two || []).map((i) => [i.id, i.action.id, i.text]));
  fs.writeFileSync(path.join(stubDir, 'wr-id'), wrPoll ? wrPoll.action.id : '');
  await A.load(); await openChat(A);
  await A.cdp('Target.createTarget', { url: 'about:blank' }).catch(() => null);
  let tB = null; for (let i = 0; i < 40 && !tB; i++) { tB = (await targets()).find((x) => x.id !== target.id); if (!tB) await sleep(150); }
  const B = await connect(tB); Bp = B;
  await B.device(1280, 800, { mouse: true }); await B.load(); await openChat(B);
  for (const P of [A, B]) await P.waitFor(`document.querySelectorAll('.cn-card[data-item="${wrPoll && wrPoll.id}"], .cn-card[data-item="${wrPush && wrPush.id}"]').length === 2`, 15000);
  const cA = { poll: await A.evalJs(CARD(wrPoll && wrPoll.id)), push: await A.evalJs(CARD(wrPush && wrPush.id)) };
  const cB = { poll: await B.evalJs(CARD(wrPoll && wrPoll.id)), push: await B.evalJs(CARD(wrPush && wrPush.id)) };
  check('…TWO cards in the asking chat on BOTH pages, each in the tool card that ran ITS `vibespace-channels watch` (never one merged card)', !!cA.poll && !!cA.push && !!cB.poll && !!cB.push && /vibespace-channels watch fake-poll/.test(cA.poll.hostCmd) && /vibespace-channels watch fake-push/.test(cA.push.hostCmd), { cA, cB });
  check('…the newest open (its Approve / Deny), the older a folded row of the accordion — both their own card', !!cA.push && cA.push.open && !cA.push.fold && !!cA.poll && cA.poll.fold, { push: cA.push && { open: cA.push.open, fold: cA.push.fold }, poll: cA.poll && { fold: cA.poll.fold } });
  check(`…Approve ✓ / Deny ✕ — an icon AND its word, ≥ 24 px at a desk (Approve ${cA.push?.approve?.w}×${cA.push?.approve?.h}, Deny ${cA.push?.deny?.w}×${cA.push?.deny?.h})`, !!cA.push?.approve && !!cA.push?.deny && cA.push.approve.icon && cA.push.deny.icon && cA.push.approve.word === 'Approve' && cA.push.deny.word === 'Deny' && cA.push.approve.w >= 24 && cA.push.approve.h >= 24 && cA.push.deny.w >= 24 && cA.push.deny.h >= 24, cA.push);
  check('…the card says who asks and what Approve writes: «… asks to be woken by Ops room» + a billed turn + the agent\'s reason', !!cA.push && /asks to be woken by Ops room/.test(cA.push.text) && /a billed turn/.test(cA.push.text) && /so I can open an incident/.test(cA.push.text), cA.push && cA.push.text);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${wrPush && wrPush.id}"]').scrollIntoView({ block: 'center' })`); await sleep(400);
  await A.shot('after-two-cards-1280.png');
  // R4 — THE TRAY UNCHANGED: each request counted ONCE, its row keeps its own Approve (the mini tray / the For-you window)
  const tray = await A.evalJs(`(() => { const open = (app._inboxModel?.todos.open || []); const ids = open.map((i) => i.id); return { n: open.length, poll: ids.filter((x) => x === ${JSON.stringify(wrPoll && wrPoll.id)}).length, push: ids.filter((x) => x === ${JSON.stringify(wrPush && wrPush.id)}).length, chip: (document.querySelector('.chat-status-foryou')?.textContent || '').trim() }; })()`);
  check(`R4 (the control): the For-you store the tray counts holds each request ONCE (${tray.poll} + ${tray.push} of ${tray.n} open); the chat's chip «${tray.chip}»`, tray.poll === 1 && tray.push === 1 && tray.n === 2 && tray.chip === 'waiting for you · 2 approvals', tray);
  await B.evalJs(`app.openInbox({ itemId: ${JSON.stringify(wrPoll && wrPoll.id)} }); true`);
  await B.waitFor(`!!document.querySelector('.iw-item .iw-act[data-act="proposal-approve"]')`, 10000);
  const win = await B.evalJs(`(() => { const a = document.querySelector('.iw-item .iw-act[data-act="proposal-approve"]'), d = document.querySelector('.iw-item .iw-act[data-act="proposal-reject"]'); return { approve: !!a && a.offsetParent !== null, deny: !!d && d.offsetParent !== null, denyWord: d ? (d.textContent || '').trim() : null, acts: [...document.querySelectorAll('.iw-item .iw-act')].filter((x) => x.offsetParent).map((x) => x.dataset.act), title: (document.querySelector('.iw-item .iw-title')?.textContent || '').trim() }; })()`);
  check('R4: the For-you window\'s row for the same request keeps its own Approve — the tray door is unchanged', win.approve && win.deny && /asks to be woken by Ops room/.test(win.title), win);
  check(`round 2: …and there too a decision row has TWO verbs — Approve / «${win.denyWord}», no Mark done / Dismiss (${JSON.stringify(win.acts)})`, win.denyWord === 'Deny' && !win.acts.includes('done') && !win.acts.includes('dismiss'), win);
  await B.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return true; })()`); await sleep(400);
  // …and on a phone (B at 375 touch for one look — then back to its desk)
  await B.device(375, 812); await B.load();
  await B.waitFor(`document.documentElement.dataset.vc === 'compact'`, 8000);
  await B.evalJs(`app.phoneHome?.hide?.(); true`).catch(() => null); await openChat(B);
  await B.waitFor(`!!document.querySelector('.cn-card[data-item="${wrPush && wrPush.id}"] .ut-action-proposal[data-answer="approve"]')`, 12000);
  await B.evalJs(`document.querySelector('.cn-card[data-item="${wrPush && wrPush.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(500);
  const ph = await B.evalJs(CARD(wrPush && wrPush.id));
  await B.shot('after-card-phone-375.png'); await B.shot('r2-phone-decision-row-375.png');
  check(`…on a phone (375 touch): Approve ${ph?.approve?.w}×${ph?.approve?.h}, Deny ${ph?.deny?.w}×${ph?.deny?.h} — every target ≥ 44 × 44`, !!ph?.approve && !!ph?.deny && ph.approve.w >= 44 && ph.approve.h >= 44 && ph.deny.w >= 44 && ph.deny.h >= 44, ph);
  // ROUND 2: A DECISION ROW HAS TWO VERBS — what ends it is Approve / Deny and nothing else (no ✓ Mark done / ✕ Dismiss)
  const NOT_AN_END = /^(⤢|↗)/;   // a door that opens it elsewhere (the For-you window) — never closes it
  check(`round 2, the PHONE: the decision row's verbs are ${JSON.stringify(ph?.verbs)} — the two that end it are Approve / Deny, nothing else (${ph?.closers} ✓ / ✕ drawn)`, !!ph && ph.closers === 0 && ph.verbs.filter((v) => !NOT_AN_END.test(v)).join('|') === 'Approve|Deny', ph && { verbs: ph.verbs, closers: ph.closers });
  // ①c — NO OTHER CLOSER. The phone first, while it is a phone: a ✓ beside Approve / Deny, if one is drawn, is PRESSED — what it
  // does is the finding (on the base it was a silent Deny: the request denied, the record «✓ done»)
  console.log('①c A DECISION ROW HAS NO OTHER CLOSER (round 2) — the phone\'s ✓, the tray\'s «Mark all seen», a scripted close');
  const tick = `.cn-card[data-item="${wrPush && wrPush.id}"] .ut-done`;
  await B.front();
  const hasTick = await B.evalJs(`(() => { const b = document.querySelector(${JSON.stringify(tick)}); return !!b && !!b.offsetParent; })()`);
  const tickPress = hasTick ? await B.restThenPress(tick) : null;
  await sleep(hasTick ? 1200 : 200);
  const afterTick = { item: ((await api()).resolved.find((i) => i.id === (wrPush && wrPush.id)) || null), card: await B.evalJs(CARD(wrPush && wrPush.id)) };
  afterTick.open = (await wakeItems()).open.some((i) => i.id === (wrPush && wrPush.id));
  await B.shot('r2-phone-after-press-375.png');
  check(`the phone: no ✓ Mark done to press beside Approve / Deny — the request is still open, its card still has its two verbs${hasTick ? ` (the base: the press ${tickPress && tickPress.pressed ? 'resolved it «' + (afterTick.item && afterTick.item.resolvedBy) + '» — the record reads «' + (afterTick.card && afterTick.card.line) + '», toast «' + (tickPress && tickPress.toast) + '»' : 'missed'})` : ''}`, !hasTick && afterTick.open && !!afterTick.card && !!afterTick.card.approve, { hasTick, tickPress, item: afterTick.item && { status: afterTick.item.status, by: afterTick.item.resolvedBy }, line: afterTick.card && afterTick.card.line });
  await B.device(1280, 800, { mouse: true }); await B.load(); await openChat(B);
  await B.waitFor(`!!document.querySelector('.cn-card[data-item="${wrPush && wrPush.id}"]')`, 12000);
  // the tray (page A's For-you popup): both rows Approve / Deny only; «Mark all seen» on their band passes both by
  await A.front();
  await A.evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); document.getElementById('taskbar-user-todos').click(); return true; })()`);
  await A.waitFor(`!!document.querySelector('#user-todos-popup .ut-item[data-id="${wrPoll && wrPoll.id}"]')`, 8000);
  const ROWV = (id) => `(() => { const r = document.querySelector('#user-todos-popup .ut-item[data-id="${id}"]'); if (!r) return null; return { answers: [...r.querySelectorAll('.ut-action-proposal')].filter((x) => x.offsetParent).map((x) => (x.textContent || '').trim()), closers: [...r.querySelectorAll('.ut-done, .ut-dismiss, .ut-reopen')].filter((x) => x.offsetParent).length }; })()`;
  const tr = { poll: await A.evalJs(ROWV(wrPoll && wrPoll.id)), push: await A.evalJs(ROWV(wrPush && wrPush.id)) };
  await A.shot('r2-tray-decision-rows-1280.png');
  const trOk = (x) => !!x && x.closers === 0 && x.answers.join('|') === 'Approve|Deny';
  check(`the tray: each decision row's verbs are Approve / Deny and no ✓ / ✕ (${JSON.stringify(tr)})`, trOk(tr.poll) && (!tr.push || trOk(tr.push)), tr);
  const seenSel = `#user-todos-popup .ut-band:has(.ut-item[data-id="${wrPoll && wrPoll.id}"]) > .ut-band-bar > .ut-seen-all`;
  const hasSeen = await A.evalJs(`(() => { const b = document.querySelector(${JSON.stringify(seenSel)}); return !!b && !!b.offsetParent; })()`);
  let seenToast = '', seenHow = 'the band\'s «Mark all seen»';
  if (hasSeen) { await A.realClick(seenSel); await sleep(1200); seenToast = await A.evalJs(`[...document.querySelectorAll('.global-toast, .toast')].map((x) => x.textContent).join(' | ')`); }
  else { seenHow = 'its route (the band drew no «Mark all seen»)'; const r = await A.evalJs(`fetch('/api/user-todos/resolve-many', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [${JSON.stringify(wrPoll && wrPoll.id)}, ${JSON.stringify(wrPush && wrPush.id)}], status: 'dismissed' }) }).then((r) => r.json())`); seenToast = JSON.stringify(r); }
  const afterSeen = await wakeItems();
  check(`«Mark all seen» (${seenHow}) passes the decision rows by — «${seenToast.slice(0, 80)}» — they stay until decided (${afterSeen.open.length} open)`, afterSeen.open.length === (afterTick.open ? 2 : 1) && /decisions? left for you/.test(seenToast), { seenToast, open: afterSeen.open.map((i) => i.id) });
  const scripted = await A.evalJs(`fetch('/api/user-todos/${wrPoll && wrPoll.id}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }))`);
  check(`a scripted close of a decision row (the old ✓'s own route) ⇒ ${scripted.status} ${scripted.code} — said by name, the request still open`, scripted.status === 409 && scripted.code === 'decision_row' && (await wakeItems()).open.some((i) => i.id === (wrPoll && wrPoll.id)), scripted);
  await A.evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`); await sleep(300);
  await lap('① done');

  console.log('② A CLICK IS THE ONLY APPROVAL — on the real hub: tokens, a bare write, the agent itself, a typed «approve»');
  const post = async (headers, p = `/api/channels/reach-requests/${wrPoll && wrPoll.action.id}/approve`) => { const r = await fetch(ORIGIN + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, code: j && j.code }; };
  const refusals = {
    vsst: await post({ Authorization: 'Bearer ' + (env && env.token) }),
    jbt: await post({ Authorization: 'Bearer jbt_0123456789abcdef' }),
    vsak: await post({ Authorization: 'Bearer vsak_' + 'A'.repeat(43) }),
    bare: await post({}),
    agentRoute: await post({ Authorization: 'Bearer ' + (env && env.token) }, `/api/agent/channels/reach-requests/${wrPoll && wrPoll.action.id}/approve`),
  };
  check('the agent\'s own vsst_ (its real token), a job\'s jbt_, an automation key\'s vsak_ ⇒ 403 human_only; a bare write (no browser) ⇒ 403 cross_site; an agent-side twin of the route ⇒ no such door', refusals.vsst.status === 403 && refusals.vsst.code === 'human_only' && refusals.jbt.code === 'human_only' && refusals.vsak.code === 'human_only' && refusals.bare.status === 403 && refusals.bare.code === 'cross_site' && refusals.agentRoute.status >= 400 && refusals.agentRoute.status !== 200, refusals);
  say('now do:selfapprove');
  await logHas(/### selfapprove 0 rc=/);
  const self = (cliLog().split('### selfapprove 0')[1] || '').split('###')[0];
  check('the AGENT itself — its Bash POSTs the approve with its own token, its text says «approve» ⇒ the person\'s route answers 403 human_only, the agent-side twin is no door', /channels 403 human_only/.test(self) && /agent [45]\d\d/.test(self), self.trim());
  say('approve');   // the OWNER typing «approve» to the agent — words, never a decision
  await sleep(2500);
  const still = await wakeItems();
  check('…and the owner typing «approve» in the chat decides nothing — both requests still open, both cards still with their buttons', still.open.length === 2 && !!(await A.evalJs(CARD(wrPush && wrPush.id)))?.approve, still.open.map((i) => i.id));
  await lap('② done');

  console.log('③ THE FALSE BRANCH — a page whose role may not decide (no role has it today: the registry\'s deferred viewer row)');
  const wait = await A.evalJs(`(async () => { const v = ${VIEW}; v._needsCards._role = () => 'viewer'; v._needsCards.render(); await new Promise((r) => setTimeout(r, 300)); return null; })()`).then(() => A.evalJs(CARD(wrPush && wrPush.id)));
  await A.shot('waiting-owner-1280.png');
  check('the card reads «waiting for the owner — answer it in the conversation or in For you» with NO button', !!wait && wait.wait && wait.buttons === 0 && /waiting for the owner — answer it in the conversation or in For you/.test(wait.text), wait);
  const back = await A.evalJs(`(async () => { const v = ${VIEW}; v._needsCards._role = () => 'owner'; v._needsCards.render(); await new Promise((r) => setTimeout(r, 300)); return null; })()`).then(() => A.evalJs(CARD(wrPush && wrPush.id)));
  check('…the owner\'s role back ⇒ Approve / Deny back (the owner decides from every view they open)', !!back && !back.wait && !!back.approve && !!back.deny, back);
  await lap('③ done');

  console.log('④ APPROVE ON THE CARD (page A) ⇒ the hub approves exactly that request; page B\'s card patched in place');
  await A.front();
  const pr = await A.restThenPress(`.cn-card[data-item="${wrPush && wrPush.id}"] .ut-action-proposal[data-answer="approve"]`);
  const pressed = pr.pressed;
  const pushDone = await until(async () => (await wakeItems()).resolved.find((i) => i.id === (wrPush && wrPush.id)));
  check('a real click on the card\'s Approve ⇒ the hub resolved THAT request `allowed` (the other still open)', pressed && !!pushDone && pushDone.resolvedBy === 'allowed' && (await wakeItems()).open.some((i) => i.id === (wrPoll && wrPoll.id)), { pr, pushDone: pushDone && { by: pushDone.resolvedBy } });
  check(`round 2: a decision is final — its toast offers no Undo («${pr.toast}»); the record carries the person verdict's mark`, !/Undo/.test(pr.toast || '') && !!pushDone && !!pushDone.resolvedFact && pushDone.resolvedFact.decidedBy === 'person', { toast: pr.toast, fact: pushDone && pushDone.resolvedFact });
  const watches = await (await fetch(ORIGIN + '/api/agent/channels/watches', { headers: { Authorization: 'Bearer ' + (env && env.token) } })).json().catch(() => null);
  const wake = ((watches && watches.watches) || []).find((w) => /fake-push-ops/.test(JSON.stringify(w)));
  check('…the wake proceeds: the agent\'s own watch list now holds exactly what the card said — a WAKE on the Slack-like «Ops room» (and nothing on the other)', !!wake && /wake/.test(JSON.stringify(wake)) && !((watches && watches.watches) || []).some((w) => /fake-poll-ops/.test(JSON.stringify(w))), watches);
  const stampPush = 'approved by you · ' + (await hm(B, pushDone && pushDone.resolvedAt));
  // B (the other client) is READ where it stands, in the back: its For-you store took the decision live (the broadcast — what
  // its tray row and its cards are drawn from). Its windows are not asserted here: a CDP page sent to the back drops its
  // window layout (measured: no window left — the chain's «never assert identity across a front/back switch»); the
  // in-place identity is ⑤'s, on ONE page that never switched
  const bModel = await B.waitFor(`(app._inboxModel?.todos.resolved || []).some((i) => i.id === ${JSON.stringify(wrPush && wrPush.id)} && i.resolvedBy === 'allowed')`, 10000);
  const bRec = await B.evalJs(CARD(wrPush && wrPush.id));
  if (!bRec) console.log('  (page B: ' + JSON.stringify(await B.evalJs(`({ vis: document.visibilityState, wins: [...app.wm.windows.values()].map((w) => w.type + ':' + (app.sessions.get(w.id)?.sessionId || '') + (w.minimized ? ':min' : '')), cards: [...document.querySelectorAll('.cn-card')].map((c) => c.dataset.item + (c.classList.contains('cn-done') ? ':done' : '')), msgs: document.querySelectorAll('.chat-message-list .chat-msg').length, resolved: (app._inboxModel?.todos.resolved || []).map((i) => i.id).slice(0, 5) })`)) + ')');
  check(`page B (the other client, in the back): its For-you store took the decision live — the item resolved \`allowed\` (what its tray row and its card are drawn from)${bRec ? `; its card reads «${bRec.line.slice(0, 40)}»` : ''}`, !!bModel && (!bRec || (bRec.done && bRec.line.includes(stampPush))), bRec);
  await A.evalJs(`app.openInbox({ itemId: ${JSON.stringify(wrPush && wrPush.id)} }); true`);
  const aWin = await A.waitFor(`[...document.querySelectorAll('.iw-item .iw-meta, .iw-row')].some((e) => (e.textContent || '').includes(${JSON.stringify(stampPush)}))`, 10000);
  check(`page A's For-you window (the tray door) says the same «${stampPush}»`, !!aWin);
  await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return true; })()`); await sleep(400);
  await lap('④ done');

  console.log('⑤ DENY IN THE TRAY (page A\'s For-you window) ⇒ its card in the chat under it — folded — patched in place');
  await A.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${wrPoll && wrPoll.id}"]'); if (c) c.__wkTag = 'A-poll'; window.__wkRecsA = [...document.querySelectorAll('.chat-message-list .chat-msg')]; return !!c; })()`);
  await A.evalJs(`app.openInbox({ itemId: ${JSON.stringify(wrPoll && wrPoll.id)} }); true`);
  const winUp = await A.waitFor(`!!document.querySelector('.iw-item .iw-act[data-act="proposal-reject"]')`, 10000);
  await A.shot('tray-deny-before-1280.png');
  if (!winUp) console.log('  (the window: ' + JSON.stringify(await A.evalJs(`({ wins: [...app.wm.windows.values()].map((w) => w.type + (w.minimized ? ':min' : '')), items: document.querySelectorAll('.iw-item').length, acts: [...document.querySelectorAll('.iw-act')].map((b) => b.dataset.act) })`)) + ')');
  const dr = await A.restThenPress('.iw-item .iw-act[data-act="proposal-reject"]');
  const denied = dr.pressed;
  const pollDone = await until(async () => (await wakeItems()).resolved.find((i) => i.id === (wrPoll && wrPoll.id)));
  check('a real click on Deny in the For-you window ⇒ the hub resolved that request `denied` — no Undo offered', denied && !!pollDone && pollDone.resolvedBy === 'denied' && !/Undo/.test(dr.toast || ''), { dr, pollDone: pollDone && pollDone.resolvedBy });
  const stampPoll = 'denied by you · ' + (await hm(A, pollDone && pollDone.resolvedAt));
  await A.waitFor(`document.querySelector('.cn-card[data-item="${wrPoll && wrPoll.id}"]')?.classList.contains('cn-done')`, 10000);
  const aRec = await A.evalJs(CARD(wrPoll && wrPoll.id));
  const keptA = await A.evalJs(`(window.__wkRecsA || []).filter((e) => e.isConnected).length + '/' + (window.__wkRecsA || []).length`);
  const bPoll = await B.evalJs(CARD(wrPoll && wrPoll.id));   // the other page, in the back, follows too
  await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return true; })()`); await sleep(400);
  check(`page A: the SAME card element now reads «${stampPoll}» (✕) in the tool card that ran its watch; the transcript was not re-drawn (${keptA} records the same nodes)`, !!aRec && aRec.done && aRec.tag === 'A-poll' && aRec.line.includes(stampPoll) && /^✕/.test(aRec.line) && /vibespace-channels watch fake-poll/.test(aRec.hostCmd) && /^(\d+)\/\1$/.test(keptA), { aRec, keptA });
  check(`…and page B (the other client) says «${stampPoll}» too`, !!bPoll && bPoll.done && bPoll.line.includes(stampPoll), bPoll);
  // the shot: the run that holds both records opened (decided cards fold with their run, like any record)
  await A.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${wrPoll && wrPoll.id}"]'); const h = c && [...document.querySelectorAll('.chat-run-header')].find((x) => x.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); h?.click(); return !!h; })()`); await sleep(600);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${wrPoll && wrPoll.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(300);
  await A.shot('after-decided-records-1280.png');
  await lap('⑤ done');

  console.log('⑤b A DECISION IS FINAL (round 2) — a reopen refused by name; the decided rows carry no ↺ / Reopen');
  const reo = await A.evalJs(`Promise.all([${JSON.stringify(wrPoll && wrPoll.id)}, ${JSON.stringify(wrPush && wrPush.id)}].map((id) => fetch('/api/user-todos/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) }).then(async (r) => ({ status: r.status, code: (await r.json().catch(() => ({}))).code }))))`);
  const stillDone = (await wakeItems()).resolved.filter((i) => i.id === (wrPoll && wrPoll.id) || i.id === (wrPush && wrPush.id)).map((i) => i.resolvedBy).sort().join(',');
  check(`reopening a decided request (the old ↺ / the 6 s Undo) ⇒ ${reo.map((x) => x.status + ' ' + x.code).join(', ')} — both records keep «${stillDone}»`, reo.every((x) => x.status === 409 && x.code === 'decision_final') && stillDone === 'allowed,denied', { reo, stillDone });
  await A.evalJs(`app.openInbox({ itemId: ${JSON.stringify(wrPush && wrPush.id)} }); true`);
  await A.waitFor(`!!document.querySelector('.iw-item')`, 8000); await sleep(400);
  const finalActs = await A.evalJs(`[...document.querySelectorAll('.iw-item .iw-act')].filter((x) => x.offsetParent).map((x) => x.dataset.act)`);
  await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return true; })()`); await sleep(300);
  check(`the For-you window on a decided request: ${JSON.stringify(finalActs)} — no Reopen`, Array.isArray(finalActs) && !finalActs.includes('reopen') && !finalActs.includes('done'), finalActs);
  await lap('⑤b done');

  console.log('⑥ A RELOAD re-derives both records from the store; never stored twice; the agent never saw the card');
  await A.load(); await openChat(A);
  await A.waitFor(`document.querySelectorAll('.cn-card.cn-done[data-item="${wrPoll && wrPoll.id}"], .cn-card.cn-done[data-item="${wrPush && wrPush.id}"]').length === 2`, 15000);
  const rl = { poll: await A.evalJs(CARD(wrPoll && wrPoll.id)), push: await A.evalJs(CARD(wrPush && wrPush.id)) };
  check('after a reload both records stand where they were filed, with their stamps', !!rl.poll && !!rl.push && rl.poll.line.includes(stampPoll) && rl.push.line.includes(stampPush) && /fake-poll/.test(rl.poll.hostCmd) && /fake-push/.test(rl.push.hostCmd), rl);
  const t = await api(); const all = [...t.open, ...t.resolved];
  const stored = await A.evalJs(`(() => { let hit = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), v = localStorage.getItem(k) || ''; if (v.includes(${JSON.stringify(wrPoll && wrPoll.id)}) || v.includes(${JSON.stringify(wrPush && wrPush.id)}) || /approved by you|denied by you/.test(v)) hit.push(k); } return hit; })()`);
  check(`never stored twice: the store holds each item once (${all.filter((i) => i.id === (wrPoll && wrPoll.id)).length}, ${all.filter((i) => i.id === (wrPush && wrPush.id)).length}); the page's storage holds no card (${stored.length} keys)`, all.filter((i) => i.id === (wrPoll && wrPoll.id)).length === 1 && all.filter((i) => i.id === (wrPush && wrPush.id)).length === 1 && stored.length === 0, stored);
  const seen = fs.readFileSync(path.join(stubDir, 'seen.log'), 'utf8');
  const leaked = frames.filter((f) => /approved by you|denied by you|Waiting for you —|waiting for the owner/.test(f));
  check('the agent never saw the card: what reached the conversation holds none of its words (its stdin: the owner\'s own lines only), and no hub frame carried them', !/approved by you|denied by you|Waiting for you|Approve|Deny/.test(seen) && leaked.length === 0, { seen: seen.trim().split('\n'), leaked: leaked.length });
  if (!NO_STAMP) check('⑥ the stamp\'s RED CONTROL bundle builds (its anchors are this lane\'s lines)', false, NO_STAMP_ERR);
  else try {
    mutant = { bundle: NO_STAMP };
    await B.front(); await B.load(); await openChat(B);
    await B.waitFor(`document.querySelectorAll('.cn-card.cn-done').length >= 2`, 15000);
    const red = await B.evalJs(CARD(wrPush && wrPush.id));
    check(`RED CONTROL: the base's record words — «${red && red.line.slice(0, 60)}»: neither who decided nor when`, !!red && red.done && /approved · /.test(red.line) && !/by you/.test(red.line), red);
  } catch (e) { fail++; console.log('  ✗ ⑥ RED threw: ' + (e?.message || e)); } finally { mutant = null; }
  await lap('⑥ done');

  console.log('⑦ ROUND 3 — a pointer hides; a wake ask says its end; the vault\'s request and its run are cards in the asking chat');
  await A.front(); await A.load(); await openChat(A);
  const J3 = (x) => JSON.stringify(x);
  // ⑦a A POINTER HIDES, NEVER DECIDES — the agent's access request (rq-): its card offers ✕ Hide only; the press hides it, the
  // request stays open in the Reach dialog; the agent asking again brings it back. (Whatever closer is drawn is PRESSED — on the
  // base its ✓: what it records is the finding.)
  const ANN = 'fake-poll/fake-poll-announce';
  await A.evalJs(`fetch('/api/channels/${ANN}/reach', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal: { kind: 'agent', id: ${J3(env && env.sid)} }, level: 'requestable' }) }).then((r) => r.status)`);
  say('now do:request'); await logHas(/### request 0 rc=/);
  const rqItem = await until(async () => (await api()).open.find((i) => i.action && i.action.type === 'open-channel' && i.action.convId === 'fake-poll-announce') || null);
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${rqItem && rqItem.id}"]')`, 15000);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${rqItem && rqItem.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(400);
  const hideSel = `.cn-card[data-item="${rqItem && rqItem.id}"] .ut-hide`, tickSel = `.cn-card[data-item="${rqItem && rqItem.id}"] .ut-done`;
  const has = await A.evalJs(`({ hide: !!document.querySelector(${J3(hideSel)})?.offsetParent, tick: !!document.querySelector(${J3(tickSel)})?.offsetParent })`);
  const rc0 = await A.evalJs(CARD(rqItem && rqItem.id));
  await A.shot('r3-chat-pointer-1280.png');
  check(`r3 ⑦a: the access request's card in the asking chat offers ONE closer, ✕ Hide — no ✓ Mark done (${J3(rc0 && rc0.verbs)})`, !!rqItem && has.hide && !has.tick, { has, verbs: rc0 && rc0.verbs });
  const rqPress = (has.hide || has.tick) ? await A.restThenPress(has.hide ? hideSel : tickSel) : null;
  await sleep(900);
  const rqAfter = ((await api()).resolved || []).find((i) => i.id === (rqItem && rqItem.id)) || null;
  const annView = await (await fetch(`${ORIGIN}/api/channels/${ANN}`)).json().catch(() => ({}));
  const rqReq = ((((annView && annView.conversation) || {}).reach || {}).requests || []).find((r) => r.todoId === (rqItem && rqItem.id)) || null;   // the Reach dialog's own read
  const rc1 = await A.evalJs(CARD(rqItem && rqItem.id));
  await A.shot('r3-chat-pointer-hidden-1280.png');
  check(`…its press HIDES it: the record «${rc1 && rc1.line}» (${rqAfter && rqAfter.resolvedBy}) says nothing about a decision; the request is still ${rqReq && rqReq.status} in the Reach dialog; the toast «${rqPress && rqPress.toast}» offers no Undo`, !!rqAfter && rqAfter.resolvedBy === 'hidden' && !!rc1 && /hidden — nothing was decided/.test(rc1.line) && !!rqReq && rqReq.status === 'open' && /Hidden — nothing was decided/.test((rqPress && rqPress.toast) || '') && !/Undo/.test((rqPress && rqPress.toast) || ''), { pressed: has.hide ? 'hide' : 'tick', by: rqAfter && rqAfter.resolvedBy, status: rqAfter && rqAfter.status, line: rc1 && rc1.line, request: rqReq && rqReq.status, toast: rqPress && rqPress.toast });
  say('now do:request'); await logHas(/### request 0 rc=[\s\S]*### request 0 rc=/);
  const rqBack = await until(async () => (await api()).open.find((i) => i.id === (rqItem && rqItem.id)) || null, 8000);
  const reaskOut = cliLog().split('### request 0 rc=').pop();
  check('…the agent asks again while it is open ⇒ the SAME request, its pointer back in the tray and the chat (the CLI says so)', !!rqBack && /already open/.test(reaskOut) && /it is back in their For-you tray/.test(reaskOut), reaskOut.slice(0, 300));
  await lap('⑦a done');
  // ⑦b A WAKE ASK SAYS ITS END — a new ask on the chat whose earlier ask was denied: «expires in 7 d» on its card; the agent told when
  const pollBy = ((await api()).resolved.find((i) => i.id === (wrPoll && wrPoll.id)) || {}).resolvedBy;
  const wv3 = pollBy === 'denied' ? 'watchpoll' : 'watchpush';
  say('now do:' + wv3); await logHas(new RegExp('### ' + wv3 + ' 0 rc='));
  const nw = await until(async () => (await wakeItems()).open[0] || null);
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${nw && nw.id}"]')`, 15000);
  const nc = await A.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${nw && nw.id}"]'); const m = c && c.querySelector('.ut-meta'); return c ? { text: (m ? m.textContent : '').trim(), metaShown: !!(m && m.offsetParent) } : null; })()`);   // the card's meta line (its age · its end)
  const nwOut = cliLog().split('### ' + wv3 + ' 0 rc=').pop();
  check(`r3 ⑦b: a new wake ask's card says its end — «${((nc && nc.text) || '').match(/expires in [^·]*/) || '—'}» (its meta line: «${nc && nc.text}»)`, !!nc && nc.metaShown && /expires in 7 d/.test(nc.text), nc);
  check('…and the agent was told it: «Unanswered, it expires <when> UTC — then you can ask again.»', /Unanswered, it expires \d{4}-\d\d-\d\d \d\d:\d\d UTC — then you can ask again\./.test(nwOut), nwOut.slice(0, 400));
  if (nw) await A.evalJs(`fetch('/api/channels/reach-requests/${nw.action.id}/deny', { method: 'POST' }).then((r) => r.status)`);   // a wake row wakes — never left standing
  await lap('⑦b done');
  // ⑦c THE VAULT'S TWO ASKS IN THE ASKING CHAT (the owner: «他的索要和使用请求都不在聊天里») — the paste request's FORM card, answered
  // there through the tray's own route; then the run the agent makes with it: its card, its own verbs, no ✓ / ✕
  const SECOND = 'wake card second password 7';
  const VALUE = ['paste', 'leg', 'admin', 'pw', Date.now().toString(36)].join('-');
  const su = await A.evalJs(`fetch('/api/vault/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${J3(SECOND)} }) }).then(async (r) => ({ status: r.status, state: (await r.json().catch(() => ({}))).state }))`);
  check('setup: the vault\'s second password set from the page (unlocked)', su && su.state === 'unlocked', su);
  say('now do:vreq'); await logHas(/### vreq 0 rc=/);
  const sr = await until(async () => (await api()).open.find((i) => i.action && i.action.type === 'secret-request') || null);
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${sr && sr.id}"] input.ut-secret-input')`, 15000);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${sr && sr.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(400);
  const sc = await A.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${sr && sr.id}"]'); if (!c) return null; const i = c.querySelector('input.ut-secret-input'); return { type: i && i.type, save: (c.querySelector('.ut-secret-save')?.textContent || '').trim(), deny: (c.querySelector('.ut-secret-deny')?.textContent || '').trim(), note: (c.querySelector('.ut-secret-note')?.textContent || '').trim(), closers: [...c.querySelectorAll('.ut-done, .ut-dismiss, .ut-reopen')].filter((x) => x.offsetParent).length, text: (c.textContent || '').slice(0, 220) }; })()`);
  await A.shot('r3-chat-vault-request-1280.png');
  check(`r3 ⑦c: the vault's REQUEST is a card in the asking chat — the masked field (${sc && sc.type}), «${sc && sc.save}» / «${sc && sc.deny}», the note «${sc && sc.note}», no ✓ / ✕ (${sc && sc.closers})`, !!sc && sc.type === 'password' && sc.save === 'Save to vault' && /Wrong name or kind\? Refuse/.test(sc.note) && sc.closers === 0 && /UniFi UCG-Fiber local admin/.test(sc.text), sc);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${sr && sr.id}"] input.ut-secret-input').focus(); true`);
  await A.cdp('Input.insertText', { text: VALUE });
  const svPress = await A.restThenPress(`.cn-card[data-item="${sr && sr.id}"] .ut-secret-save`);
  const srDone = await until(async () => (await api()).resolved.find((i) => i.id === (sr && sr.id)) || null, 10000);
  const stampSr = 'stored · ' + await hm(A, srDone && srDone.resolvedFact && srDone.resolvedFact.decidedAt);
  await A.waitFor(`(document.querySelector('.cn-card[data-item="${sr && sr.id}"] .cn-line')?.textContent || '').includes(${J3(stampSr)})`, 8000);
  const srCard = await A.evalJs(CARD(sr && sr.id));
  const leakPage = await A.evalJs(`(document.documentElement.outerHTML + (document.body ? document.body.innerText : '') + [...document.querySelectorAll('input, textarea')].map((i) => i.value).join('')).includes(${J3(VALUE)})`);
  check(`…pasted and saved IN THE CHAT CARD (the tray's own route): the card reads «${srCard && srCard.line}», its tray row resolved with it (${srDone && srDone.resolvedBy}); the value is nowhere on the page`, !!srDone && srDone.resolvedBy === 'stored' && !!srCard && srCard.line.includes(stampSr) && !leakPage && !!svPress && svPress.pressed, { by: srDone && srDone.resolvedBy, fact: srDone && srDone.resolvedFact, line: srCard && srCard.line, leakPage, toast: svPress && svPress.toast });
  // 主开发's pin — A WIRE ASSERT, not a DOM one: the pasted value (raw, hex, base64, base64url) is in NO frame any page saw
  // (both directions), no hub broadcast, not the server's log, not what reached the agent (its stdin, its tool output, its
  // next-turn context); the field stayed masked (type password, no autocomplete)
  const forms = (v) => [v, Buffer.from(v).toString('hex'), Buffer.from(v).toString('base64'), Buffer.from(v).toString('base64url')];
  const hits = (text) => forms(VALUE).filter((f) => String(text).includes(f)).length;
  const ctxTurn = await fetch(`${ORIGIN}/api/agent/prompt-context`, { headers: { Authorization: 'Bearer ' + (env && env.token) } }).then((r) => r.json()).then((j) => String(j.context || '')).catch(() => '');
  const wire = { pageFrames: WS_SEEN.length, pageHits: hits(WS_SEEN.join('\n')), hubFrames: frames.length, hubHits: hits(frames.join('\n')), serverLog: hits(fs.readFileSync(path.join(SHOTS, 'server.log'), 'utf8')),
    agentStdin: hits(fs.readFileSync(path.join(stubDir, 'seen.log'), 'utf8')), agentTools: hits(cliLog()), nextTurn: hits(ctxTurn), receipt: /STORED/.test(ctxTurn), masked: sc && sc.type === 'password',
    seesTheRequest: !!sr && WS_SEEN.join('\n').includes(sr.action.requestId) && frames.join('\n').includes(sr.action.requestId) };   // CONTROL: the frames DO carry the request (its sr- id) — a 0 is a real absence
  check(`…THE WIRE: the pasted value is in none of ${wire.pageFrames} page WebSocket frames (both ways) nor ${wire.hubFrames} hub broadcasts, not the server log, not the agent's stdin / tool output / next turn (which says STORED); the field stayed masked`, wire.pageFrames > 0 && wire.hubFrames > 0 && wire.pageHits === 0 && wire.hubHits === 0 && wire.serverLog === 0 && wire.agentStdin === 0 && wire.agentTools === 0 && wire.nextTurn === 0 && wire.receipt && wire.masked && wire.seesTheRequest, wire);
  // 主开发's pin — the run card shows «Always» in the chat WHENEVER the tray offers it (one verdict: the item's `action.always`)
  const rungs = async (id) => {
    const chat = await A.evalJs(`[...document.querySelectorAll('.cn-card[data-item="${id}"] [data-answer]')].filter((b) => b.offsetParent).map((b) => b.dataset.answer)`);
    await A.evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (!p || p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`);
    await A.waitFor(`!!document.querySelector('#user-todos-popup .ut-item[data-id="${id}"]')`, 8000);
    const tray = await A.evalJs(`[...document.querySelectorAll('#user-todos-popup .ut-item[data-id="${id}"] [data-answer]')].filter((b) => b.offsetParent).map((b) => b.dataset.answer)`);
    await A.evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`); await sleep(300);
    return { chat, tray };
  };
  say('now do:vrunall');
  const rAll = await until(async () => (await api()).open.find((i) => i.action && i.action.type === 'vault-run-ask') || null, 30000);
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${rAll && rAll.id}"] [data-answer="deny"]')`, 15000);
  const rgAll = await rungs(rAll && rAll.id);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${rAll && rAll.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(400);
  await A.shot('r3-chat-vault-always-1280.png');
  check(`…the run card shows «Always» in the chat when the tray offers it (a known tool naming a host — action.always ${rAll && rAll.action.always}): chat ${J3(rgAll.chat)} = tray ${J3(rgAll.tray)}`, !!rAll && rAll.action.always === true && rgAll.chat.includes('always') && J3(rgAll.chat) === J3(rgAll.tray), { always: rAll && rAll.action.always, ...rgAll });
  await A.restThenPress(`.cn-card[data-item="${rAll && rAll.id}"] [data-answer="deny"]`);
  await until(async () => (await api()).resolved.find((i) => i.id === (rAll && rAll.id)) || null, 10000);
  await logHas(/### vrunall 0 rc=/, 30000);
  say('now do:vrun');
  const ra = await until(async () => (await api()).open.find((i) => i.action && i.action.type === 'vault-run-ask') || null, 30000);
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${ra && ra.id}"] [data-answer="deny"]')`, 15000);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${ra && ra.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(500);
  const rcRun = await A.evalJs(CARD(ra && ra.id));
  await A.shot('r3-chat-vault-cards-1280.png');
  check(`r3 ⑦c: …then the RUN the agent makes with it is a card in the same chat — its own verbs ${J3(rcRun && rcRun.verbs)}, no ✓ / ✕ (${rcRun && rcRun.closers})`, !!rcRun && rcRun.closers === 0 && rcRun.verbs.some((v) => /^Allow once/.test(v)) && rcRun.verbs.some((v) => /^Deny/.test(v)), rcRun);
  const rgNo = await rungs(ra && ra.id);
  check(`…and NO «Always» in the chat when the tray offers none (an interpreter — action.always ${ra && ra.action.always}): chat ${J3(rgNo.chat)} = tray ${J3(rgNo.tray)}`, !!ra && ra.action.always === false && !rgNo.chat.includes('always') && J3(rgNo.chat) === J3(rgNo.tray), { always: ra && ra.action.always, ...rgNo });
  await B.front(); await B.device(375, 812); await B.load();
  await B.waitFor(`document.documentElement.dataset.vc === 'compact'`, 8000);
  await B.evalJs(`app.phoneHome?.hide?.(); true`).catch(() => null); await openChat(B);
  await B.waitFor(`!!document.querySelector('.cn-card[data-item="${ra && ra.id}"] [data-answer="deny"]')`, 12000);
  await B.evalJs(`document.querySelector('.cn-card[data-item="${ra && ra.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(500);
  const phRun = await B.evalJs(CARD(ra && ra.id));
  await B.shot('r3-phone-vault-cards-375.png');
  check(`…on a phone (375 touch) the run card stands in the chat with its own verbs and no ✓ / ✕ (${J3(phRun && phRun.verbs)})`, !!phRun && phRun.closers === 0 && phRun.verbs.some((v) => /^Deny/.test(v)), phRun);
  await B.device(1280, 800, { mouse: true }); await B.load();
  await A.front();
  const dPress = await A.restThenPress(`.cn-card[data-item="${ra && ra.id}"] [data-answer="deny"]`);
  const raDone = await until(async () => (await api()).resolved.find((i) => i.id === (ra && ra.id)) || null, 10000);
  const stampRa = 'denied by you · ' + await hm(A, raDone && raDone.resolvedFact && raDone.resolvedFact.decidedAt);
  await A.waitFor(`(document.querySelector('.cn-card[data-item="${ra && ra.id}"] .cn-line')?.textContent || '').includes(${J3(stampRa)})`, 8000);
  const raCard = await A.evalJs(CARD(ra && ra.id));
  const ranOut = await logHas(/### vrun 0 rc=/, 30000) ? cliLog().split('### vrun 0 rc=').pop().slice(0, 300) : '';
  check(`…Deny on the card: the record «${raCard && raCard.line}» (the person verdict's mark); the agent's run refused (${(ranOut.match(/ask_denied|denied|refused/) || ['?'])[0]})`, !!raDone && raDone.resolvedBy === 'denied' && !!raCard && raCard.line.includes(stampRa) && /ask_denied|denied/.test(ranOut) && !!dPress && dPress.pressed, { by: raDone && raDone.resolvedBy, line: raCard && raCard.line, ranOut });
  await A.evalJs(`document.querySelector('.cn-card[data-item="${sr && sr.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(400);
  await A.shot('r3-chat-vault-records-1280.png');
  const wireEnd = { pageFrames: WS_SEEN.length, hits: hits(WS_SEEN.join('\n')) + hits(frames.join('\n')) + hits(fs.readFileSync(path.join(SHOTS, 'server.log'), 'utf8')) + hits(fs.readFileSync(path.join(stubDir, 'seen.log'), 'utf8')) + hits(cliLog()) };
  check(`…and after both runs: still 0 hits of the value over ${wireEnd.pageFrames} page frames, every hub broadcast, the server log and all the agent saw`, wireEnd.hits === 0, wireEnd);
  await lap('⑦c done');
  // ⑦d r4 — THE VAULT'S GRANT REQUEST (the third vault card in the same chat: Allow once / For 8 hours / Deny) IS A DECISION ROW:
  // its own three verbs and no ✓ / ✕; For 8 hours (验证是你 first) records «allowed by you for 8 h · HH:MM». On bec3e3f8 the card
  // drew ✓ / ✕ and ✓ «Mark done» DENIED the request silently, its toast offering an Undo that could not bring it back
  const VALUE2 = ['grant', 'leg', 'bucket', 'key', Date.now().toString(36)].join('-');
  const ne = await A.evalJs(`fetch('/api/vault/secrets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Backup bucket key', kind: 'secret', value: ${J3(VALUE2)} }) }).then((r) => r.json())`);
  fs.writeFileSync(path.join(stubDir, 'grant-ref'), String((ne && ne.ref) || ''));
  say('now do:vgrant'); await logHas(/### vgrant 0 rc=/);
  const ga = await until(async () => (await api()).open.find((i) => i.action && i.action.type === 'vault-grant-ask') || null, 15000);
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${ga && ga.id}"] [data-answer="deny"]')`, 15000);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${ga && ga.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(500);
  const gc = await A.evalJs(CARD(ga && ga.id));
  const gAns = await A.evalJs(`[...document.querySelectorAll('.cn-card[data-item="${ga && ga.id}"] [data-answer]')].filter((b) => b.offsetParent).map((b) => b.dataset.answer)`);
  await A.shot('r4-chat-vault-grant-1280.png');
  check(`r4 ⑦d: the agent's request for a STORED secret is a card in the asking chat — its own verbs ${J3(gAns)} (${J3(gc && gc.verbs)}), no ✓ / ✕ (${gc && gc.closers})`, !!ne && !!ne.ref && !!gc && gc.closers === 0 && J3(gAns) === J3(['once', '8h', 'deny']), { ref: ne && ne.ref, verbs: gc && gc.verbs, answers: gAns, closers: gc && gc.closers });
  if (gc && gc.closers > 0) {
    // the base: its ✓ «Mark done» — the press the owner made — closes the card and DENIES the request; the toast offers Undo
    const tick = await A.restThenPress(`.cn-card[data-item="${ga.id}"] .ut-done`);
    const gAfter = await until(async () => (await api()).resolved.find((i) => i.id === ga.id) || null, 8000);
    const again = await A.evalJs(`fetch('/api/vault/request/asks/${ga.action.askId}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: 'deny' }) }).then((r) => r.json())`);
    check(`RED (this tree): ✓ on the grant card closed it «${gAfter && gAfter.resolvedBy}» and the request is over (a late answer: ${again && again.code}) — the toast «${tick && tick.toast}»`, false, { by: gAfter && gAfter.resolvedBy, status: gAfter && gAfter.status, late: again && again.code, toast: tick && tick.toast });
  } else {
    const p8 = await A.restThenPress(`.cn-card[data-item="${ga && ga.id}"] [data-answer="8h"]`);
    await A.waitFor(`!!document.getElementById('vault-reveal-pw')`, 8000);
    await A.evalJs(`document.getElementById('vault-reveal-pw').focus(); true`);
    await A.cdp('Input.insertText', { text: SECOND });
    await A.evalJs(`document.querySelector('.vault-reveal-go').click(); true`);
    const gDone = await until(async () => (await api()).resolved.find((i) => i.id === (ga && ga.id)) || null, 10000);
    const stampG = 'allowed by you for 8 h · ' + await hm(A, gDone && gDone.resolvedFact && gDone.resolvedFact.decidedAt);
    await A.waitFor(`(document.querySelector('.cn-card[data-item="${ga && ga.id}"] .cn-line')?.textContent || '').includes(${J3(stampG)})`, 8000);
    const gCard = await A.evalJs(CARD(ga && ga.id));
    const toast8 = await A.evalJs(`[...document.querySelectorAll('.global-toast, .toast')].map((x) => x.textContent).join(' | ')`);
    // the shot: the run that holds the decided card opened (a decided card folds with its run, like any record)
    await A.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${ga && ga.id}"]'); const h = c && [...document.querySelectorAll('.chat-run-header')].filter((x) => x.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING).pop(); if (h && !c.offsetParent) h.click(); return !!h; })()`); await sleep(600);
    await A.evalJs(`document.querySelector('.cn-card[data-item="${ga && ga.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(400);
    await A.shot('r4-chat-vault-grant-allowed-1280.png');
    // r6: For 8 hours records `granted` (the value every reader names) + {grantedFor: '8h', until} (a pre-.360 `granted` with no
    // duration reads «allowed»); the toast reads the answer's `grantedFor`
    check(`…For 8 hours on the card (the second password first): the record «${gCard && gCard.line}» (${gDone && gDone.resolvedBy} + ${gDone && gDone.resolvedFact && gDone.resolvedFact.grantedFor}, the person verdict's mark), the toast «${toast8}»`, !!p8 && p8.pressed && !!gDone && gDone.resolvedBy === 'granted' && /Granted for 8 hours/.test(toast8 || '') && !!gDone.resolvedFact && gDone.resolvedFact.decidedBy === 'person' && gDone.resolvedFact.grantedFor === '8h' && Number(gDone.resolvedFact.until) > 0 && !!gCard && gCard.line.includes(stampG) && gCard.closers === 0, { by: gDone && gDone.resolvedBy, fact: gDone && gDone.resolvedFact, line: gCard && gCard.line, toast: toast8 });
  }
  await lap('⑦d done');
  check('no page threw', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ threw: ' + (e?.stack || e)); }

console.log(`  shots: ${SHOTS}`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
