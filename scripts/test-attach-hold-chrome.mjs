#!/usr/bin/env node
// THE ATTACH HOLD ON A REAL PAGE (B-a26e, 主开发 r3447 / r3506): a living conversation's window never turns «Session is
// read-only» because the hub was slow to answer its re-attach. A fleet person's report on 2.369.404: ~110 windows on a busy hub
// said read-only with Resume while every conversation's process was alive. The ladder (src/lib/chat-view.js `_reattach`) used to
// end after ~2 minutes with the view-only rescue («no longer running») or a sentence and `_setReadOnly()`. Now its end HOLDS:
// one line, the composer held (its typed text kept), one attach a minute through the reconnect queue's `join`; only the
// server's explicit words end it.
// HEAVY: a scratch hub (hub-boot.mjs) with a stand-in `claude` (init for the resumed id, then idle — no vendor, VS_NO_REAL_CLI),
// headless Chrome over raw CDP. A HELD HUB is placed in the page: the socket drops and comes back, and the page swallows the
// hub's `attached`, `attach-ack` and live `msg` frames for that one session — what a socket the hub has not attached yet gets
// (ws-handler.js holds a session's frames back from it): the hub never answers it, and a send's own echo never comes. THE LADDER's CLOCK is shortened in the page
// (its 20 s / 25 s rungs and the hold's 60 s ask run at 1/100) — the same code, a short clock.
//   ① THE HOLD: past the whole ladder the window is NOT read-only, shows the hold's ONE bar (never a line added to the chat), its
//      composer is held with the text typed before the drop still in it, and it TAKES TYPING while held; a press of Send while
//      held sends nothing and says the hold's own words (主开发 r4529 (a)); it asks again on the clock (one attach a short
//      minute, judged by the gaps between its asks), and starts nothing (no create); when the hub answers, the attach lands: the
//      bar goes, the composer is free with all the text kept, and ONE press sends it ONCE.
//   ② THE SERVER's WORD ENDS IT: held, the conversation ends on the hub (a kill) — the window says the hub's own words and goes
//      read-only WITH RESUME, as the release; the hold's bar is gone (never both).
//   ③ THE PACE: held, while a FRESH ack keeps coming (the hub working on it) the window asks nothing; once the acks stop it asks
//      again, at most one attach a short minute.
//   ④ RESUME WHILE HELD is harmless: the conversation's card resume sends no create (the window is live, not read-only) and the
//      stand-in keeps its one process (B-a26e item 2's measure: run 427f425cf-20261124150245-box).
//   ⑤ A SEND IN THE FREE WINDOW BEFORE THE HOLD (the release's own order: its 30 s safety frees the composer long before the
//      ~2 minute ladder ends): the send goes to the hub; when the hold comes, the box is NOT given the message back («Connection
//      lost …») and, after the landing, a press sends nothing a second time. Its CONTROL blinds the hold's reason (the
//      composer's dead-link road runs): the message comes back into the box — the leg can go red.
//   CONTROL (①): the hold blinded (the ladder's end as the release: the sentence and read-only) ⇒ ① reads read-only — the leg can go red.
// EVERY WAIT IS ON THE FACT IT JUDGES (主开发 r4340 law 1): its bound is generous and its expiry is a named harness line. The
// only spans are two ABSENCES (③: no ask while a fresh ack stands; ④: no create after a resume press), each said where it is.
// THE SHORT CLOCK runs only from a leg's drop to its hold (living() turns it off), and it scales the release's 30 s safety too,
// so every leg runs in the release's own order: the safety frees the composer before the ladder ends.
// Run: node scripts/test-attach-hold-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, fixtureSid, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules', 'ws'));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let passed = 0, failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check(${n}): the condition must be a boolean`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1400) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (what, fn, ms = 30000, step = 200) => { const v = await until(fn, ms, step); if (v == null) { failed++; console.error(`  ✗ HARNESS: the wait for ${what} expired after ${Math.round(ms / 1000)} s`); } return v; };   // r4340 law 1
const until = async (fn, ms = 30000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };
const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv();
const root = mintRoot('attach-hold'), wt = path.join(root, 't');
const fakeHome = path.join(root, 'home'); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });
const chromeRoot = scratch('attach-hold-chrome');
const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);
const NOW = Date.now(), DAY = 86400e3;
const { fixtureLitter } = require(path.join(repo, 'src/fixture-guard.js'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const SIDS = { a: fixtureSid('a26e11'), b: fixtureSid('a26e12'), c: fixtureSid('a26e13'), d: fixtureSid('a26e14'), x: fixtureSid('a26e15'), e: fixtureSid('a26e16'), y: fixtureSid('a26e17') };

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'package.json', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

// THE STAND-IN CLAUDE: one log line per spawn (the id it resumes, its pid — exec keeps it), init with that id, then idles
const FAKE_BIN = path.join(fakeHome, 'fake-bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const FAKE_CLAUDE = path.join(FAKE_BIN, 'claude');
const FAKE_LOG = path.join(fakeHome, 'fake-claude.log');
fs.writeFileSync(FAKE_CLAUDE, `#!/bin/sh
sid=""; prev=""
for a in "$@"; do [ "$prev" = "--resume" ] && sid="$a"; prev="$a"; done
printf '%s|%s\\n' "$sid" "$$" >> ${JSON.stringify(FAKE_LOG)}
case " $* " in *" --output-format "*) sleep 1; printf '{"type":"system","subtype":"init","session_id":"%s","cwd":"%s","model":"claude-fable-5","apiKeySource":"none","tools":[],"mcp_servers":[]}\\n' "$sid" "$PWD";; esac
exec sleep 900
`, { mode: 0o755 });
const spawnsOf = (sid) => (fs.existsSync(FAKE_LOG) ? fs.readFileSync(FAKE_LOG, 'utf8') : '').split('\n').filter((l) => l.startsWith(sid + '|')).map((l) => Number(l.split('|')[1]));
const alive = (pid) => { try { return /sleep/.test(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')); } catch { return false; } };

const CWD = path.join(fakeHome, 'work', 'planning'); fs.mkdirSync(CWD, { recursive: true });
const projDir = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-')); fs.mkdirSync(projDir, { recursive: true });
const rec = (sid, i, role, text) => JSON.stringify(role === 'user'
  ? { type: 'user', uuid: `u-${sid.slice(-4)}-${i}`, timestamp: new Date(NOW - DAY + i * 60000).toISOString(), sessionId: sid, cwd: CWD, message: { role: 'user', content: [{ type: 'text', text }] } }
  : { type: 'assistant', uuid: `a-${sid.slice(-4)}-${i}`, timestamp: new Date(NOW - DAY + i * 60000).toISOString(), sessionId: sid, cwd: CWD, message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }] } });
for (const sid of Object.values(SIDS)) fs.writeFileSync(path.join(projDir, sid + '.jsonl'), [1, 2, 3, 4].map((i) => rec(sid, i, i % 2 ? 'user' : 'assistant', i % 2 ? `Question ${i} about the plan` : `Answer ${i}: the next part of the outline.`)).join('\n') + '\n');

const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1', VIBESPACE_PASSWORD: '', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') } });
const client = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1100,800', `--user-data-dir=${chromeRoot}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
process.on('exit', () => { try { client.kill('SIGKILL'); } catch { } try { fs.rmSync(chromeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } });

// THE PAGE's WITNESSES AND THE HELD HUB: every create and attach the page sends; while window.__hold names a server session, its
// `attached` and `attach-ack` frames are swallowed before any handler hears them (the hub never answers that session)
const SPY = `(() => { window.__creates = []; window.__attachesOut = []; window.__chatOut = []; window.__hold = null;
  const iv = setInterval(() => { if (!window.app || !app.ws || !app.ws.send || app.ws.__spied) return; app.ws.__spied = true; clearInterval(iv);
    const s = app.ws.send.bind(app.ws); app.ws.send = (m) => { try { const o = typeof m === 'string' ? JSON.parse(m) : m; if (o && o.type === 'create') window.__creates.push({ at: Date.now(), resumeId: o.resumeId || null, reqId: o.reqId || null }); if (o && o.type === 'attach') window.__attachesOut.push({ at: Date.now(), sid: o.sessionId }); if (o && o.type === 'chat-input') window.__chatOut.push({ at: Date.now(), sid: o.sessionId, text: String(o.text != null ? o.text : (o.content != null ? o.content : '')) }); } catch {} return s(m); };
    const h = app.ws.heard.bind(app.ws); app.ws.heard = (d, how) => { if (window.__hold && d && (d.type === 'attached' || d.type === 'attach-ack' || d.type === 'msg') && d.sessionId === window.__hold) return; return h(d, how); };
    window.__answers = []; app.ws.onGlobal((m) => { if (m && (m.type === 'created' || m.type === 'error') && m.reqId) window.__answers.push({ type: m.type, code: m.code || null, reqId: m.reqId, sessionId: m.sessionId || null }); }); }, 20);
  // THE SHORT CLOCK: the ladder's rungs (20 s, 25 s), the release's safety (30 s) and the hold's ask (60 s) at 1/100 — only those
  // four delays; 'safety' scales the 30 s safety alone (⑤: the free window stays open while the leg sends)
  const st = window.setTimeout.bind(window); window.__shortClock = false; window.setTimeout = (fn, ms, ...a) => st(fn, (window.__shortClock === true && (ms === 20000 || ms === 25000 || ms === 30000 || ms === 60000)) || (window.__shortClock === 'safety' && ms === 30000) ? ms / 100 : ms, ...a); })();`;

const BLIND_HOLD = `(() => { const CV = Object.getPrototypeOf([...app.sessions.values()].find((v) => v && v._reattach)); CV._holdAttach = function () { this._renderers.appendSystem('the release: did not answer the re-attach'); this._setReadOnly(); }; return 1; })()`;

let cdp = null; const pend = new Map(); let seq = 0;
const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
async function newPage() {
  const tg = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const a = await send('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true });
  const sess = a.result.sessionId; const S = (m, p) => send(m, p, sess);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  await S('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await S('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); } catch {}` });
  await S('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 500) }; return r.result ? r.result.result.value : undefined; };
  const ready = await until(() => ev("!!(window.app && window.app.wm && app.ws && app.ws.__spied && app.ws.connected) && !document.getElementById('loading-screen')"), 60000, 300);
  return { S, ev, ready };
}
// a living conversation: started through the page's own resume road; its view live, its stand-in idle
async function living(P, sid) {
  await P.ev(`(window.__shortClock = false, window.__creates.length = 0, app.resumeSession(${JSON.stringify(sid)}, ${JSON.stringify(CWD)}, 'Plan', { mode: 'chat', backend: 'claude', backendSessionId: ${JSON.stringify(sid)} }), true)`);
  const made = await until(() => P.ev(`(() => { const c = window.__creates.find((x) => x.resumeId === ${JSON.stringify(sid)}); const a = c && window.__answers.find((x) => x.reqId === c.reqId); return a || null; })()`), 30000);
  const S0 = made && made.sessionId;
  const live = S0 && await until(() => P.ev(`(() => { const v = [...app.sessions.values()].find((x) => x && x.sessionId === ${JSON.stringify(S0)}); return v && !v._readOnly && v._chatInput ? true : null; })()`), 30000);
  await until(() => spawnsOf(sid).length >= 1 ? true : null, 15000);
  return live ? S0 : null;
}
const VIEW = (S0) => `[...app.sessions.values()].find((x) => x && x.sessionId === ${JSON.stringify(S0)})`;
const facts = (P, S0) => P.ev(`(() => { const v = ${VIEW(S0)}; if (!v) return null; const box = v._container; const hold = box && box.querySelector('.chat-attach-hold'); const ta = v._chatInput && v._chatInput._element && v._chatInput._element.querySelector('textarea');
  const el = v._chatInput && v._chatInput._element;
  return { readOnly: !!v._readOnly, greyed: !!(el && el.classList.contains('chat-input-disconnected')), lastSys: [...(box ? box.querySelectorAll('.chat-system') : [])].map((n) => n.textContent).slice(-1)[0] || null, hold: !!hold && hold.isConnected, bars: box ? box.querySelectorAll('.chat-attach-hold').length : 0, resume: !!(box && box.querySelector('.chat-resume-btn')), holdLines: [...(box ? box.querySelectorAll('.chat-system') : [])].filter((n) => /Still attaching/.test(n.textContent)).length, line: hold ? hold.textContent.trim() : null, held: !!(v._chatInput && v._chatInput._disconnected), text: ta ? ta.value : null,
    sentence: [...(box ? box.querySelectorAll('.chat-system') : [])].map((n) => n.textContent).filter((x) => /re-attach|no longer running|read-only/i.test(x)).slice(-1)[0] || null, rescued: !!v._viewOnly }; })()`);
const holdOn = async (P, S0, typed) => {
  if (typed) await P.ev(`(() => { const v = ${VIEW(S0)}; const ta = v._chatInput._element.querySelector('textarea'); ta.value = ${JSON.stringify(typed)}; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await P.ev(`(window.__shortClock = true, window.__hold = ${JSON.stringify(S0)}, window.__attachesOut.length = 0, window.__creates.length = 0, app.ws.ws.close(), true)`);   // the creates counted FROM THE DROP (the adversarial read: living()'s own resume is one)   // the socket drops; the hub then never answers this session
  return waitFor('the ladder to end (the hold or read-only)', async () => { const f = await facts(P, S0); return f && (f.hold || f.readOnly) ? f : null; }, 30000, 100);
};
const askTimes = (P, S0, sinceMs) => P.ev(`window.__attachesOut.filter((x) => x.sid === ${JSON.stringify(S0)} && x.at >= ${sinceMs}).map((x) => x.at)`);
const chatOutOf = (P, S0) => P.ev(`window.__chatOut.filter((x) => x.sid === ${JSON.stringify(S0)})`);
const pressSend = (P, S0) => P.ev(`(() => { const v = ${VIEW(S0)}; const b = v && v._chatInput && v._chatInput._element.querySelector('.chat-send-btn'); if (!b) return false; b.click(); return true; })()`);
const toastSays = (P, re) => P.ev(`[...document.querySelectorAll('.global-toast-body')].map((n) => n.textContent).filter((x) => ${re}.test(x)).length`);
const asksOf = (P, S0, sinceMs) => P.ev(`window.__attachesOut.filter((x) => x.sid === ${JSON.stringify(S0)} && x.at >= ${sinceMs}).length`);

try {
  const up = await hub.ready({ ms: 120000 });
  check('the scratch hub answers', !!up, String(hub.log() || '').slice(-600));
  if (!up) throw new Error('no hub');
  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const P = await newPage();
  check('the page is up', !!P.ready);

  // ① THE HOLD, then the attach landing
  console.log('── ① the hold ──');
  const Sa = await living(P, SIDS.a);
  check('① a living conversation: its window live, one stand-in process', !!Sa && spawnsOf(SIDS.a).length === 1, { Sa, spawns: spawnsOf(SIDS.a) });
  const typed = 'a draft typed before the drop';
  const f1 = Sa && await holdOn(P, Sa, typed);
  const t1 = await P.ev('Date.now()');
  check(`① past the whole ladder the window is NOT read-only: it holds — its one line «${f1?.line}»`, !!f1 && !f1.readOnly && f1.hold && f1.line === 'Still attaching — the hub has not answered yet; this window reconnects by itself. Your message waits here and can be sent once it is back.' && !f1.rescued, f1);
  check('① …its composer is held (sending blocked) with the text typed before the drop still in it, NOT greyed (a live press answered in words: the owner\'s rule), and no read-only sentence was said', !!f1 && f1.held && !f1.greyed && f1.text === typed && !f1.sentence, f1);
  // IT TAKES TYPING WHILE HELD (主开发 r4529 (a)): the composer's own road for a link that is down keeps the box editable
  const more = ' — and more typed while held';
  await P.ev(`(() => { const v = ${VIEW(Sa)}; const ta = v._chatInput._element.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return 1; })()`);
  await P.S('Input.insertText', { text: more });   // a real keystroke road (CDP's own text input), not a value set
  const fT = await waitFor('the typed text in the held box', async () => { const f = await facts(P, Sa); return f && f.text === typed + more ? f : null; }, 10000, 100);
  check('① the held box TAKES TYPING: the text typed while held is in it, after the text typed before the drop', !!fT && fT.held && fT.text === typed + more, fT);
  // A PRESS OF SEND WHILE HELD sends nothing and says the hold's own words, never «Disconnected»
  const out0 = (await chatOutOf(P, Sa)).length, DISC = "/^Disconnected — reconnecting… your draft is kept/", wrong0 = await toastSays(P, DISC);   // the composer's link-down words (the connection notice's own «Disconnected from server» is not this press's)
  const pressed = await pressSend(P, Sa);
  const said = await waitFor('the held Send press\'s words', async () => (await toastSays(P, '/Still attaching — your draft is kept here/')) > 0 ? true : null, 10000, 100);
  const out1 = (await chatOutOf(P, Sa)).length, wrong = (await toastSays(P, DISC)) - wrong0;
  check(`① a press of Send while held sends NOTHING (${out1 - out0} chat send(s)) and says why it waits in the hold's own words (never «Disconnected»: ${wrong})`, pressed === true && !!said && out1 === out0 && wrong === 0, { pressed, out0, out1, wrong });
  // THE PACE, by the gaps between its asks (the short clock: the hold's minute is 600 ms; the queue's slot, 1.5 s, is unscaled)
  const times = await waitFor('two asks of the hold', async () => { const a = await askTimes(P, Sa, t1); return a.length >= 2 ? a : null; }, 30000, 100);
  const gaps = (times || []).slice(1).map((x, i) => x - times[i]);
  check(`① it asks again on the clock, at most one a short minute: ${times ? times.length : 0} asks, the shortest gap ${gaps.length ? Math.min(...gaps) : '—'} ms (≥ 600)`, !!times && gaps.length >= 1 && Math.min(...gaps) >= 600, { times, gaps });
  const fB = await facts(P, Sa), creates1 = await P.ev('window.__creates.length');
  check(`① ONE bar throughout (${fB?.bars}), never a line added to the chat (${fB?.holdLines}), and the hold started nothing (${creates1} create(s))`, !!fB && fB.bars === 1 && fB.holdLines === 0 && creates1 === 0, { fB, creates1 });
  await P.ev('(window.__hold = null, true)');   // the hub answers again (the short clock still runs: the next ask lands)
  const back = await waitFor('the attach to land (the bar gone, the composer free)', async () => { const f = await facts(P, Sa); return f && !f.hold && !f.held ? f : null; }, 15000, 100);
  check('① the attach lands: the bar goes, the composer is free with all the text kept (before the drop and while held), the window is live', !!back && !back.readOnly && back.bars === 0 && back.text === typed + more, back);
  // ONE PRESS SENDS IT ONCE: nothing was sent while held, so the first send is this press's; a second press on the emptied box sends nothing
  const before = (await chatOutOf(P, Sa)).length;
  await pressSend(P, Sa);
  const sent = await waitFor('the one send after the landing', async () => { const o = await chatOutOf(P, Sa); return o.length > before ? o : null; }, 10000, 100);
  await waitFor('the composer to empty after the send', async () => { const f = await facts(P, Sa); return f && f.text === '' ? true : null; }, 10000, 100);
  await pressSend(P, Sa);
  const after = await chatOutOf(P, Sa);
  check(`① after the landing ONE press sends the kept text ONCE (${after.length - before} send(s): «${(sent && sent[sent.length - 1].text || '').slice(0, 60)}»)`, !!sent && after.length - before === 1 && after[after.length - 1].text === typed + more, { before, after });
  check('① …and the conversation kept its one process throughout', spawnsOf(SIDS.a).length === 1 && alive(spawnsOf(SIDS.a)[0]), spawnsOf(SIDS.a));

  // ② THE SERVER's WORD ENDS IT
  console.log('── ② the server\'s word ──');
  const Sb = await living(P, SIDS.b);
  const f2 = Sb && await holdOn(P, Sb, null);
  check('② held (the same placed scene)', !!f2 && f2.hold && !f2.readOnly, f2);
  await P.ev(`(app.ws.send({ type: 'kill', sessionId: ${JSON.stringify(Sb)} }), true)`);   // the conversation ends on the hub
  const ended = await waitFor('the server\'s word (read-only)', async () => { const f = await facts(P, Sb); return f && f.readOnly ? f : null; }, 20000, 100);
  check('② the conversation ended on the hub ⇒ the window says the hub\'s own words and goes read-only WITH RESUME, as the release; the hold\'s bar is gone (never both)', !!ended && ended.readOnly && !ended.hold && ended.resume === true && /Session ended/.test(ended.lastSys || ''), ended);

  // ③ THE PACE: a fresh ack means the hub works on it — no ask
  console.log('── ③ the pace ──');
  const Sc = await living(P, SIDS.c);
  const f3 = Sc && await holdOn(P, Sc, null);
  check('③ held', !!f3 && f3.hold, f3);
  await P.ev(`(window.__acks = setInterval(() => { const v = ${VIEW(Sc)}; if (v) v._lastAttachAckAt = Date.now(); }, 100), true)`);   // a FRESH ack keeps coming (the page's own stamp, as the hub's re-ack sets it)
  await waitFor('the fresh acks to flow', () => P.ev(`(() => { const v = ${VIEW(Sc)}; return v && Date.now() - (v._lastAttachAckAt || 0) < 300 ? true : null; })()`), 5000, 50);
  const t3 = await P.ev('Date.now()');   // from here no ask may go: an ask is checked against the fresh ack when it GOES (a slot joined before the acks began asks nothing)
  await sleep(2400);   // THE ABSENCE's SPAN, the one span here: four short minutes (4 × 600 ms) in which the hold would have asked had the ack not been fresh
  const asks3 = await asksOf(P, Sc, t3);
  await P.ev(`(clearInterval(window.__acks), ${VIEW(Sc)}._lastAttachAckAt = Date.now() - 31000, true)`);   // the acks stop; the last one ages out
  const t3b = await P.ev('Date.now()');
  const ts3b = await waitFor('two asks once the acks stop', async () => { const a = await askTimes(P, Sc, t3b); return a.length >= 2 ? a : null; }, 30000, 100);
  const asks3b = (ts3b || []).length, gap3b = ts3b ? Math.min(...ts3b.slice(1).map((x, i) => x - ts3b[i])) : null;
  check(`③ while a fresh ack keeps coming the window asks nothing (${asks3}); once it stops it asks again, at most one a short minute (${asks3b} asks, the shortest gap ${gap3b} ms ≥ 600)`, asks3 === 0 && asks3b >= 2 && gap3b >= 600, { asks3, ts3b });
  await P.ev('(window.__hold = null, true)');

  // ④ RESUME WHILE HELD is harmless
  console.log('── ④ resume while held ──');
  const Sd = await living(P, SIDS.d);
  const f4 = Sd && await holdOn(P, Sd, null);
  check('④ held', !!f4 && f4.hold, f4);
  await P.ev(`(window.__creates.length = 0, app.resumeSession(${JSON.stringify(SIDS.d)}, ${JSON.stringify(CWD)}, 'Plan', { mode: 'chat', backend: 'claude', backendSessionId: ${JSON.stringify(SIDS.d)} }), true)`);
  await sleep(3000);   // THE ABSENCE's SPAN (④): a resume press answers by a create within a round trip; three seconds see none
  const creates4 = await P.ev('window.__creates.length');
  check(`④ the card's resume on a held window sends no create (the window is live, not read-only: ${creates4} create(s)) and the stand-in keeps its one process`, creates4 === 0 && spawnsOf(SIDS.d).length === 1 && alive(spawnsOf(SIDS.d)[0]), { creates4, spawns: spawnsOf(SIDS.d) });
  await P.ev('(window.__hold = null, true)');

  // ⑤ A SEND IN THE FREE WINDOW BEFORE THE HOLD: never given back, never sent twice (the adversarial read's must on 911cd6fc4)
  const freeWindowSend = async (sid, label, blindWhy) => {
    const S0 = await living(P, sid);
    if (blindWhy) await P.ev(`(() => { const ci = ${VIEW(S0)}._chatInput; const CI = Object.getPrototypeOf(ci); if (!CI.__blind) { CI.__orig = CI.setDisconnected; CI.setDisconnected = function (d) { return CI.__orig.call(this, d); }; CI.__blind = true; } return 1; })()`);
    const msg = `${label}: sent in the free window before the hold`;
    await P.ev(`(window.__shortClock = 'safety', window.__hold = ${JSON.stringify(S0)}, window.__attachesOut.length = 0, window.__creates.length = 0, app.ws.ws.close(), true)`);   // the ladder at its full length, the safety short
    await waitFor(`${label}: the drop seen (the composer held)`, async () => { const f = await facts(P, S0); return f && f.held ? true : null; }, 15000, 50);
    const free = await waitFor(`${label}: the release's 30 s safety freeing the composer before the hold`, async () => { const f = await facts(P, S0); return f && !f.held && !f.hold && !f.readOnly ? f : null; }, 15000, 50);
    await P.ev(`(() => { const ta = ${VIEW(S0)}._chatInput._element.querySelector('textarea'); ta.focus(); return 1; })()`);
    await P.S('Input.insertText', { text: msg });
    const n0 = (await chatOutOf(P, S0)).length, lost0 = await toastSays(P, '/Connection lost/');
    await pressSend(P, S0);
    const went = await waitFor(`${label}: the send in the free window`, async () => { const o = await chatOutOf(P, S0); return o.length > n0 ? o : null; }, 10000, 50);
    await P.ev('(window.__shortClock = true, true)');   // the ladder's next rungs short: the hold comes
    const fh = await waitFor(`${label}: the hold after the send`, async () => { const f = await facts(P, S0); return f && (f.hold || f.readOnly) ? f : null; }, 60000, 100);
    const lost = (await toastSays(P, '/Connection lost/')) - lost0;
    await P.ev('(window.__hold = null, true)');
    const back5 = await waitFor(`${label}: the landing`, async () => { const f = await facts(P, S0); return f && !f.hold && !f.held ? f : null; }, 15000, 100);
    const before5 = (await chatOutOf(P, S0)).filter((x) => x.text === msg).length;
    await pressSend(P, S0);
    await sleep(0);
    const after5 = await waitFor(`${label}: the press after the landing answered`, async () => { const f = await facts(P, S0); const o = await chatOutOf(P, S0); return f && (f.text === '' || o.filter((x) => x.text === msg).length > before5) ? o : null; }, 10000, 100);
    return { went: !!went && went[went.length - 1].text === msg, free: !!free, fh, lost, back: !!back5, sends: (after5 || []).filter((x) => x.text === msg).length };
  };
  console.log('── ⑤ a send in the free window before the hold ──');
  const r5 = await freeWindowSend(SIDS.e, '⑤', false);
  check(`⑤ a send in the release's free window (after its 30 s safety, before the hold) went to the hub; when the hold came the box was NOT given it back (${JSON.stringify(r5.fh?.text)}, «Connection lost» ${r5.lost}) and after the landing it was sent ONCE in all (${r5.sends})`, r5.free && r5.went && !!r5.fh && r5.fh.hold && r5.fh.text === '' && r5.lost === 0 && r5.back && r5.sends === 1, r5);
  console.log('── control ⑤: the hold\'s reason blinded ──');
  const r5x = await freeWindowSend(SIDS.y, 'CONTROL ⑤', true);
  check(`CONTROL ⑤: with the hold's reason blinded the composer's dead-link road runs — the message comes back into the box (${JSON.stringify(r5x.fh?.text?.slice(0, 40))}) — the leg can go red`, !!r5x.fh && /sent in the free window/.test(r5x.fh.text || '') && r5x.lost >= 1, r5x);
  await P.ev(`(() => { const v = [...app.sessions.values()].find((x) => x && x._chatInput); const CI = v && Object.getPrototypeOf(v._chatInput); if (CI && CI.__blind) { CI.setDisconnected = CI.__orig; delete CI.__orig; delete CI.__blind; } return 1; })()`);   // the blind goes: the prototype's own method is put back

  // CONTROL: the hold blinded (the ladder's end as the release) ⇒ ① reads read-only
  console.log('── control: the release\'s ladder end ──');
  const Sx = await living(P, SIDS.x);
  await P.ev(BLIND_HOLD);
  const fx = Sx && await holdOn(P, Sx, null);
  check('CONTROL: with the hold blinded the same scene ends read-only with a sentence — the leg can go red', !!fx && fx.readOnly && !fx.hold, fx);
} catch (e) {
  failed++; console.error('  ✗ the suite threw: ' + String(e && e.stack || e).slice(0, 800));
}
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name)).map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
}
if (failed) console.error(String(hub.log() || '').slice(-1500));
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
