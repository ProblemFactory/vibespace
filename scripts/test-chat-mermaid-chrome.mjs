#!/usr/bin/env node
// A MERMAID DIAGRAM DRAWS, WITH A REAL CHROME (lane chat-mermaid, 2.369.351 — the owner, about an Antigravity reply that
// carried a flowchart: 「能不能展示 flowchart？」). HEAVY: a scratch worktree hub (private HOME) + headless Chrome over raw
// CDP, zh, OUTBOUND BLOCKED (--host-resolver-rules: no name resolves but the hub's) and every request the page makes LOGGED.
//   ① a reply in a conversation's history with a 6-node flowchart ⇒ a `.chat-diagram` card INSIDE the message: an <svg> of
//     ≥ 6 node groups, its labels as text, no foreignObject / on* / foreign id, every CSS rule under the picture's scope;
//     the toolbar says 图 · 源码 · 复制 · 放大 · the first-render time measured
//   ② 源码 shows the source (the picture hidden), 图 brings it back · ③ 复制 copies the SOURCE · ④ 放大 opens a viewer
//     window over the picture (an <img> of it, zoom + pan) whose openSpec carries the source
//   ⑤ a broken diagram ⇒ the card shows the source BY ITSELF, 「渲染失败 · 第 3 行」 + mermaid's words, line 3 marked
//   ⑥ streaming: an OPEN fence stays a code block; the frame its fence closes draws it; the finished message keeps it;
//     an EDIT re-draws it
//   ⑦ THE XSS PROBE — a label `<img src=x onerror=…>`, click directives (javascript:, call), a javascript: link label and a
//     `%%{init}%%` turning HTML labels on: no on* attribute, no javascript:, no <a>, no foreignObject, no handler ran (a
//     window flag). CONTROLS: (a) the same label through marked.parse + raw insertion (a blank tab) carries the
//     attribute and RUNS; (b) the same diagram through mermaid WITHOUT the secure keys draws foreignObject; (c) a hostile
//     SVG through the real sanitizer vs DOMPurify's plain SVG profile (a blank tab): what each keeps
//   ⑧ the editor's Markdown preview of a .md with the same flowchart draws it · ⑨ the file viewer's markdown (by URL) too
//   ⑩ the light theme re-draws the cards light · ⑪ a diagram naming a picture on another host is NOT drawn and fetches
//     nothing · ⑫ every request the page made went to the hub (mermaid.js once, stamped ?v=) · zero CSP reports (scratch.mjs) but
//     ⑦'s own: a browser that reports a dropped inline handler (Chrome ≥ 156) files the probe's — expected by its payload,
//     and THE HUB'S VERDICT on it is the sanitizer's parse (kind sanitizer-parse, no notice, For you empty, Diagnostics'
//     sanitizer count +1); an older one files none
// PNGs: $VIBESPACE_CMM_PNG_DIR/{chat-dark,chat-source,chat-failed,chat-light,editor-preview,zoom-window}.png
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, evalInBlankTab, CSP_REPORTS_FILE, takeProbeCspReport, probeVerdictFault } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules', 'ws'));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome for the client'); process.exit(0); }
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1400) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };
const PNG_DIR = process.env.VIBESPACE_CMM_PNG_DIR || null;
const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv();
const wt = scratch('cmm-chrome');
const fakeHome = scratchHome('cmm-home', fs);
const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);
const { fixtureLitter } = require(path.join(repo, 'src/fixture-guard.js'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const NOW = Date.now(), DAY = 86400e3;
const SID = fixtureSid('c0a001');
const ORIGIN = `http://127.0.0.1:${PORT}`;

const FLOW = 'flowchart TD\n  A[Start] --> B{Is it?}\n  B -->|Yes| C[OK]\n  C --> D[Rethink]\n  D --> B\n  B ---->|No| E[End]\n  E --> F((Done))';
const LABELS = ['Start', 'Is it?', 'OK', 'Rethink', 'End', 'Done'];
const BAD = 'flowchart TD\n  A --> B\n  B --> [oops\n  C --> D';
const PROBE = '%%{init: {"flowchart": {"htmlLabels": true}, "htmlLabels": true, "securityLevel": "loose", "themeCSS": "body{display:none}"}}%%\nflowchart LR\n  A["<img src=x onerror=window.__pwned=1>"] --> B[b]\n  B --> C["<a href=\'javascript:window.__pwned=2\'>c</a>"]\n  click A "javascript:window.__pwned=3"\n  click B call alert(1)\n  click C href "javascript:window.__pwned=4"';
const PROBE_HANDLER = /onerror=([^>"]+)>/.exec(PROBE)[1]; // the label's handler — what a browser that reports a dropped one samples (⑫)
const PICTURE = 'flowchart LR\n  A@{ img: "https://pictures.example.invalid/x.png", label: "pic", pos: "t", w: 60, h: 60 } --> B[next]';
const fence = (code, lead = 'Here is the flow:') => `${lead}\n\n\`\`\`mermaid\n${code}\n\`\`\`\n\nThat is all.`;

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'scripts', 'docs']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const tBuild = Date.now();
try { execSync('npm run build', { cwd: wt, stdio: 'pipe' }); } catch (e) { console.error(String(e.stdout || '').split('\n').filter((l) => /✗|FAIL|rror/.test(l)).slice(0, 8).join('\n')); throw e; }
const MERMAID_JS = path.join(wt, 'public', 'mermaid.js');
check(`the build made public/mermaid.js (${Math.round((Date.now() - tBuild) / 1000)} s build)`, fs.existsSync(MERMAID_JS));
const rawBytes = fs.statSync(MERMAID_JS).size, gzBytes = require('node:zlib').gzipSync(fs.readFileSync(MERMAID_JS), { level: 9 }).length;
console.log(`  · public/mermaid.js ${rawBytes} bytes raw · ${gzBytes} bytes gzip -9 · public/bundle.js ${fs.statSync(path.join(wt, 'public', 'bundle.js')).size} bytes`);
fs.writeFileSync(path.join(wt, 'public', 'vs-cmm-flow.md'), '# Flow\n\n' + fence(FLOW) + '\n');

// the conversation: a reply that carries the flowchart (the owner's Antigravity case, as a transcript)
const CWD = path.join(fakeHome, 'work', 'diagrams'); fs.mkdirSync(CWD, { recursive: true });
fs.writeFileSync(path.join(CWD, 'flow.md'), '# Flow\n\n' + fence(FLOW) + '\n');
const projDir = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-')); fs.mkdirSync(projDir, { recursive: true });
const rec = (i, role, text) => JSON.stringify(role === 'user'
  ? { type: 'user', uuid: `u-cmm-${i}`, timestamp: new Date(NOW - DAY + i * 60000).toISOString(), sessionId: SID, cwd: CWD, message: { role: 'user', content: [{ type: 'text', text }] } }
  : { type: 'assistant', uuid: `a-cmm-${i}`, timestamp: new Date(NOW - DAY + i * 60000).toISOString(), sessionId: SID, cwd: CWD, message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 } } });
fs.writeFileSync(path.join(projDir, SID + '.jsonl'), [rec(1, 'user', 'Can you show the review flow as a flowchart?'), rec(2, 'assistant', fence(FLOW))].join('\n') + '\n');

const baseEnv = { ...process.env }; delete baseEnv.DISPLAY; delete baseEnv.WAYLAND_DISPLAY; delete baseEnv.DBUS_SESSION_BUS_ADDRESS; delete baseEnv.ANTHROPIC_API_KEY;
const srvEnv = { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d)));
// OUTBOUND BLOCKED: no host name resolves but the hub's own address (a diagram that reaches out fails, never leaks)
const client = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1280,900', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1', `--user-data-dir=${scratch('cmm-client')}`, 'about:blank'], { stdio: 'ignore', detached: true });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { process.kill(-client.pid, 'SIGKILL'); } catch { }
  try { process.kill(-srv.pid, 'SIGKILL'); } catch { }
  for (const root of [wt, fakeHome]) { try { endRootedProcesses(root); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// in-page helpers: the card's facts, the drawn-event log, the clipboard spy, the XSS flag stays unset
const PAGE = `(() => {
  window.__drawn = []; document.addEventListener('diagram-drawn', (e) => window.__drawn.push({ t: performance.now(), ok: e.detail.ok, ms: e.detail.ms }), true);
  try { const c = navigator.clipboard; if (c) c.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; } catch {}
  window.__cardFacts = (card) => {
    if (!card) return null;
    const svg = card.querySelector('.chat-diagram-figure > svg'); const all = svg ? [svg, ...svg.querySelectorAll('*')] : []; const scope = svg ? svg.id : '';
    const rules = svg ? [...svg.querySelectorAll('style')].flatMap((s) => [...(s.sheet ? s.sheet.cssRules : [])]) : [];
    const r = card.getBoundingClientRect(), sr = svg ? svg.getBoundingClientRect() : null;
    const lines = [...card.querySelectorAll('.chat-diagram-line')].map((e) => e.textContent);
    return { state: card.dataset.diagram, view: card.dataset.view, theme: card.dataset.theme || '', svg: !!svg, scope,
      nodes: svg ? svg.querySelectorAll('g.mmd-node').length : 0, labels: svg ? [...svg.querySelectorAll('text')].map((t) => t.textContent.trim()).filter(Boolean) : [],
      fo: svg ? svg.querySelectorAll('foreignObject').length : 0, anchors: svg ? svg.querySelectorAll('a').length : 0,
      onAttrs: all.flatMap((e) => [...e.attributes].filter((a) => /^on/i.test(a.name)).map((a) => e.tagName + ' ' + a.name)),
      jsAttrs: all.flatMap((e) => [...e.attributes].filter((a) => /javascript:/i.test(a.value)).map((a) => e.tagName + ' ' + a.name)),
      idsOff: all.filter((e) => e.id && e.id !== scope && !e.id.startsWith(scope + '-') && !e.id.startsWith(scope + '_')).map((e) => e.id).slice(0, 5),
      rules: rules.length, rulesOff: rules.filter((x) => x.type !== 1 || !String(x.selectorText).startsWith('#' + scope)).map((x) => String(x.selectorText || x.cssText).slice(0, 60)).slice(0, 5),
      classesOff: all.flatMap((e) => [...e.classList].filter((c) => !c.startsWith('mmd-'))).slice(0, 5),
      figVisible: !!card.querySelector('.chat-diagram-figure').offsetParent, srcVisible: !!card.querySelector('pre.chat-diagram-source').offsetParent,
      lines, err: card.querySelector('.chat-diagram-error').hidden ? '' : card.querySelector('.chat-diagram-error').textContent,
      bad: [...card.querySelectorAll('.chat-diagram-line-bad')].map((e) => e.textContent),
      btns: [...card.querySelectorAll('.chat-diagram-bar button')].map((b) => b.textContent),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, svgSize: sr ? { w: Math.round(sr.width), h: Math.round(sr.height) } : null };
  };
})();`;

try {
  const up = await until(async () => { if (srv.exitCode !== null) return 'dead'; await fetch(`${ORIGIN}/api/home`); return 'up'; }, 120000, 250);
  check('the scratch hub answers (private HOME)', up === 'up', srvLog.join('').slice(-600));
  if (up !== 'up') throw new Error('no server');
  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  const cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map(); const pageErrors = []; const requests = [];
  cdp.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400));
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const tg = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const at = await send('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true });
  const sess = at.result.sessionId; const S = (m, p) => send(m, p, sess);
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await S('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await S('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); localStorage.setItem('theme', 'dark'); } catch {}` });
  await S('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
  await S('Page.navigate', { url: `${ORIGIN}/` });
  const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 500) }; return r.result && r.result.result ? r.result.result.value : undefined; };
  const ready = await until(() => ev("!!(window.app && window.app.wm && app.ws && app.sidebar) && !document.getElementById('loading-screen')"), 60000, 300);
  check('the app is up (zh, dark)', !!ready);
  const shot = async (f, clip) => { if (!PNG_DIR) return null; const r = await S('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { x: Math.max(0, clip.x - 8), y: Math.max(0, clip.y - 8), width: clip.w + 16, height: clip.h + 16, scale: 1 } } : {}) }); if (!r.result) return null; fs.mkdirSync(PNG_DIR, { recursive: true }); const out = path.join(PNG_DIR, f); fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')); return out; };
  const press = async (sel) => {
    const r = await ev(`(() => { const e = ${sel}; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    if (!r || r.__err) return false;
    for (const type of ['mousePressed', 'mouseReleased']) await S('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return true;
  };
  const WIN = `[...app.wm.windows.values()].find((w) => w._openSpec && w._openSpec.backendSessionId === ${JSON.stringify(SID)} && w._openSpec.action === 'viewSession')`;
  const VIEW = `app.sessions.get((${WIN}).id)`;
  const cardIn = (msgSel) => `(() => { const w = ${WIN}; const m = w && w.element.querySelector(${JSON.stringify(msgSel)}); return m ? m.querySelector('.chat-diagram') : null; })()`;
  const facts = (cardExpr) => ev(`window.__cardFacts(${cardExpr})`);
  const liveMsg = (id, text, status = 'complete') => `(${VIEW}._onCreateMessage({ id: ${JSON.stringify(id)}, role: 'assistant', status: ${JSON.stringify(status)}, content: [{ type: 'text', text: ${JSON.stringify(text)} }], ts: Date.now() }), true)`;
  const msgSel = (id) => `[data-msg-id="${id}"]`;

  // ════ ① the history ════
  console.log('── ① a reply in the history carries the flowchart ──');
  await ev(`(app.wm.windows.forEach((w) => app.wm.closeWindow(w.id)), window.__t0 = performance.now(), app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(CWD)}, 'Diagrams', { backend: 'claude', backendSessionId: ${JSON.stringify(SID)} }), true)`);
  await until(() => ev(`!!(${WIN})`), 20000);
  await ev(`(() => { const w = ${WIN}; if (w && !w.isMaximized) app.wm.toggleMaximize(w.id); return true; })()`);
  const HIST = `(() => { const w = ${WIN}; return w ? [...w.element.querySelectorAll('.chat-msg .chat-text .chat-diagram')][0] || null : null; })()`;
  const f1 = await until(async () => { const f = await facts(HIST); return f && f.state === 'ok' ? f : null; }, 60000);
  check('the reply\'s fence is a .chat-diagram card INSIDE the message (.chat-msg .chat-text), drawn', !!f1, await facts(HIST));
  check(`an <svg> of ≥ 6 node groups (${f1 && f1.nodes}) with every label as text`, !!f1 && f1.nodes >= 6 && LABELS.every((l) => f1.labels.includes(l)), f1 && { nodes: f1.nodes, labels: f1.labels });
  check('no foreignObject, no on* attribute, no javascript:, no <a> in the picture', !!f1 && f1.fo === 0 && !f1.onAttrs.length && !f1.jsAttrs.length && f1.anchors === 0, f1);
  check(`every id is the picture's own scope (${f1 && f1.scope}), every class mmd-, every CSS rule (${f1 && f1.rules}) starts at #scope`, !!f1 && /^vsd/.test(f1.scope) && !f1.idsOff.length && !f1.classesOff.length && f1.rules > 10 && !f1.rulesOff.length, f1 && { idsOff: f1.idsOff, classesOff: f1.classesOff, rulesOff: f1.rulesOff, rules: f1.rules });
  check('the toolbar says 图 · 源码 · 复制 · 放大, the picture is shown and the source hidden', !!f1 && JSON.stringify(f1.btns) === '["图","源码","复制","放大"]' && f1.view === 'diagram' && f1.figVisible && !f1.srcVisible, f1 && { btns: f1.btns, view: f1.view });
  check('the dark page draws the dark diagram, at a readable size', !!f1 && f1.theme === 'dark' && f1.svgSize && f1.svgSize.w >= 200 && f1.svgSize.h >= 400, f1 && { theme: f1.theme, svgSize: f1.svgSize });
  const timing = await ev(`(() => { const d = window.__drawn[0]; const res = performance.getEntriesByType('resource').filter((e) => /\\/mermaid\\.js/.test(e.name)); return { first: d ? Math.round(d.t - window.__t0) : null, renderMs: d ? d.ms : null, res: res.map((e) => ({ name: e.name.replace(location.origin, ''), ms: Math.round(e.duration), transfer: e.transferSize, body: e.encodedBodySize, decoded: e.decodedBodySize })) }; })()`);
  console.log(`  · first render: ${timing && timing.first} ms from opening the conversation to the drawn card (mermaid.js fetch ${timing && timing.res[0] && timing.res[0].ms} ms, its first render ${timing && timing.renderMs} ms incl. initialize) · ${JSON.stringify(timing && timing.res)}`);
  check('the library came from THIS origin, stamped ?v=<mtime> (index.html\'s link), once', !!timing && timing.res.length === 1 && /^\/mermaid\.js\?v=\d+$/.test(timing.res[0].name), timing);
  if (f1) await shot('chat-dark.png', f1.rect);

  // ════ ② 源码 / 图 ════
  console.log('── ② 源码 shows the source ──');
  await press(`${HIST}.querySelector('[data-v="source"]')`);
  const f2 = await until(async () => { const f = await facts(HIST); return f && f.view === 'source' ? f : null; }, 5000);
  check('源码: the source shows, the picture hides', !!f2 && f2.srcVisible && !f2.figVisible, f2);
  check('the source shown is the diagram as written', !!f2 && f2.lines.join('\n') === FLOW, f2 && f2.lines);
  if (f2) await shot('chat-source.png', f2.rect);
  await press(`${HIST}.querySelector('[data-v="diagram"]')`);
  const f2b = await until(async () => { const f = await facts(HIST); return f && f.view === 'diagram' ? f : null; }, 5000);
  check('图 brings the picture back', !!f2b && f2b.figVisible && !f2b.srcVisible, f2b);

  // ════ ③ 复制 ════
  console.log('── ③ 复制 copies the source ──');
  await press(`${HIST}.querySelector('.chat-diagram-copy')`);
  const copied = await until(() => ev('window.__copied || null'), 5000);
  check('复制 put the diagram\'s SOURCE on the clipboard', copied === FLOW, copied);
  const copiedWord = await until(() => ev(`(() => { const b = ${HIST}.querySelector('.chat-diagram-copy'); return b && b.textContent === '已复制' ? b.textContent : null; })()`), 3000, 100);
  check('the button says 已复制 for a moment', copiedWord === '已复制', copiedWord);

  // ════ ④ 放大 ════
  console.log('── ④ 放大 opens the picture at full size ──');
  await press(`${HIST}.querySelector('.chat-diagram-zoom')`);
  const ZW = `[...app.wm.windows.values()].find((w) => w._openSpec && w._openSpec.action === 'openDiagram')`;
  const zoom = await until(() => ev(`(() => { const w = ${ZW}; const img = w && w.element.querySelector('.file-viewer-diagram img.media-image'); if (!img || !img.complete || !img.naturalWidth) return null;
    return { type: w.type, code: w._openSpec.code, src: img.src.slice(0, 5), nw: img.naturalWidth, nh: img.naturalHeight, tools: [...w.element.querySelectorAll('.media-toolbar button')].map((b) => b.textContent), rect: (() => { const r = w.element.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() }; })()`), 20000);
  check('a viewer window shows the picture as an image (blob:, natural size ≥ the drawn one) with zoom + pan tools', !!zoom && zoom.type === 'viewer' && zoom.src === 'blob:' && zoom.nw >= 230 && zoom.nh >= 600 && zoom.tools.includes('+') && zoom.tools.includes('1:1'), zoom);
  check('its openSpec carries the SOURCE (a reload / another client re-draws it through the one door)', !!zoom && zoom.code === FLOW);
  if (zoom) await shot('zoom-window.png', zoom.rect);
  await ev(`(() => { const w = ${ZW}; if (w) app.wm.closeWindow(w.id); return true; })()`);

  // ════ ⑤ the failure ════
  console.log('── ⑤ a broken diagram shows its source and the line ──');
  await ev(liveMsg('cmm-bad', fence(BAD, 'This one is broken:')));
  const f5 = await until(async () => { const f = await facts(cardIn(msgSel('cmm-bad'))); return f && f.state === 'failed' ? f : null; }, 30000);
  check('the card did not draw — it shows the SOURCE by itself (no picture, no bomb)', !!f5 && f5.view === 'source' && f5.srcVisible && !f5.figVisible && !f5.svg, f5);
  check('it says 「渲染失败 · 第 3 行」 + mermaid\'s own words', !!f5 && /^渲染失败 · 第 3 行 — Parse error on line 3/.test(f5.err) && /Expecting/.test(f5.err), f5 && f5.err);
  check('line 3 of the source is the marked one', !!f5 && JSON.stringify(f5.bad) === JSON.stringify(['  B --> [oops']) && f5.lines.join('\n') === BAD, f5 && f5.bad);
  if (f5) await shot('chat-failed.png', f5.rect);

  // ════ ⑥ streaming + edit ════
  console.log('── ⑥ streaming: an open fence stays code; the frame it closes draws it; an edit re-draws ──');
  const OPEN = 'Drawing it now:\n\n```mermaid\nflowchart LR\n  A[Plan] --> B[Build]';
  await ev(liveMsg('cmm-stream', OPEN, 'streaming'));
  await ev(`(${VIEW}._onEditMessage('cmm-stream', { content: [{ type: 'text', text: ${JSON.stringify(OPEN + '\n  B --> C[Ship]')} }] }), true)`);
  const open6 = await until(() => ev(`(() => { const w = ${WIN}; const m = w && w.element.querySelector('${msgSel('cmm-stream')}'); if (!m) return null; const pre = m.querySelector('pre[data-fence-open]'); return pre && /Ship/.test(pre.textContent) ? { card: !!m.querySelector('.chat-diagram'), pre: true } : null; })()`), 5000, 100);
  check('mid-stream, the OPEN fence is a code block (marked data-fence-open), no card', !!open6 && open6.pre && !open6.card, open6);
  const CLOSED = OPEN + '\n  B --> C[Ship]\n```\n\nStill typing';
  await ev(`(${VIEW}._onEditMessage('cmm-stream', { content: [{ type: 'text', text: ${JSON.stringify(CLOSED)} }] }), true)`);
  const f6 = await until(async () => { const f = await facts(cardIn(msgSel('cmm-stream'))); return f && f.state === 'ok' ? f : null; }, 30000);
  check('the frame the fence closes in draws it — while the reply is still streaming', !!f6 && ['Plan', 'Build', 'Ship'].every((l) => f6.labels.includes(l)) && (await ev(`${VIEW}._messages.find((m) => m.id === 'cmm-stream').status`)) === 'streaming', f6);
  await ev(`(${VIEW}._onEditMessage('cmm-stream', { status: 'complete', content: [{ type: 'text', text: ${JSON.stringify(CLOSED.replace('Still typing', 'Done.'))} }] }), true)`);
  const f6b = await until(async () => { const f = await facts(cardIn(msgSel('cmm-stream'))); return f && f.state === 'ok' && f.labels.includes('Ship') ? f : null; }, 15000);
  check('the finished message keeps the diagram', !!f6b);
  await ev(`(${VIEW}._onEditMessage('cmm-stream', { status: 'complete', content: [{ type: 'text', text: ${JSON.stringify(CLOSED.replace('C[Ship]', 'C[Release]').replace('Still typing', 'Edited.'))} }] }), true)`);
  const f6c = await until(async () => { const f = await facts(cardIn(msgSel('cmm-stream'))); return f && f.state === 'ok' && f.labels.includes('Release') ? f : null; }, 15000);
  check('an EDIT of the message re-draws the diagram (Ship → Release)', !!f6c && !f6c.labels.includes('Ship'), f6c || await facts(cardIn(msgSel('cmm-stream'))));

  // ════ ⑦ the XSS probe ════
  console.log('── ⑦ the XSS probe ──');
  await ev('(window.__pwned = undefined, true)');
  const cspBefore = await ev("fetch('/api/csp-reports').then((r) => r.json())"); // the count Diagnostics shows, before the probe (⑫)
  await ev(liveMsg('cmm-xss', fence(PROBE, 'A hostile one:')));
  const f7 = await until(async () => { const f = await facts(cardIn(msgSel('cmm-xss'))); return f && f.state !== 'loading' ? f : null; }, 30000);
  await sleep(800);
  const pwned = await ev('window.__pwned === undefined ? null : window.__pwned');
  check('the probe draws (3 nodes) and its hostile label survives as TEXT (mermaid\'s strict pass already shows `<img src="x">` without its handler; no element of it exists)', !!f7 && f7.state === 'ok' && f7.nodes === 3 && f7.labels.some((l) => /^<img src="x">$/.test(l)) && (await ev(`!${cardIn(msgSel('cmm-xss'))}.querySelector('img, foreignObject, a, script')`)) === true, f7);
  check('no on* attribute, no javascript: value, no <a>, no foreignObject (the %%{init}%% htmlLabels door stayed shut)', !!f7 && !f7.onAttrs.length && !f7.jsAttrs.length && f7.anchors === 0 && f7.fo === 0, f7);
  check('no handler ran (window.__pwned never set) and the page is still visible (themeCSS body{display:none} refused)', pwned === null && (await ev('getComputedStyle(document.body).display')) !== 'none', pwned);
  // CONTROL (a): the same label through marked.parse + RAW insertion carries the attribute and runs (a blank tab — no app CSP)
  const { marked } = require(path.join(repo, 'node_modules', 'marked'));
  const rawHtml = marked.parse('<img src=x onerror="window.__pwned=1"> and <a href="javascript:window.__pwned=2">c</a>');
  const ctlA = await evalInBlankTab(CDP_PORT, `(async () => { const d = document.createElement('div'); d.innerHTML = ${JSON.stringify(rawHtml)}; document.body.appendChild(d); await new Promise((r) => setTimeout(r, 400)); return { onerror: d.querySelectorAll('[onerror]').length, js: d.querySelectorAll('a[href^="javascript:"]').length, ran: window.__pwned === 1 }; })()`);
  check('CONTROL (a): the same label through marked.parse + raw insertion CARRIES onerror + a javascript: link, and the handler RAN — the test can see it', !!ctlA && ctlA.onerror === 1 && ctlA.js === 1 && ctlA.ran === true, ctlA);
  // CONTROL (b): mermaid WITHOUT the secure keys lets the diagram's own directive turn HTML labels on
  const ctlB = await ev(`(async () => { const m = (await import(new URL(document.querySelector('link[rel="vs-lazy-bundle"]').getAttribute('href'), location.origin).href)).default;
    m.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false }, suppressErrorRendering: true });
    const r = await m.render('vsdcontrolb1', ${JSON.stringify(PROBE)}); return { fo: (r.svg.match(/<foreignObject/g) || []).length }; })()`);
  check('CONTROL (b): the same diagram through mermaid WITHOUT the secure keys draws foreignObject (HTML labels) — the secure list is what shut it', !!ctlB && ctlB.fo >= 1, ctlB);
  // CONTROL (c): a hostile SVG through the REAL sanitizer (safe-html.js, bundled here) vs DOMPurify's plain SVG profile
  const esbuild = require(path.join(repo, 'node_modules', 'esbuild'));
  const SAFE_JS = esbuild.buildSync({ stdin: { contents: "export { sanitizeDiagramSvg } from './src/lib/safe-html.js'; export { default as DOMPurify } from 'dompurify';", resolveDir: wt, loader: 'js' }, bundle: true, format: 'iife', globalName: '__SAFE', platform: 'browser', write: false, logLevel: 'error' }).outputFiles[0].text;
  const SC = 'vsdfixture01';
  const HOSTILE = `<svg id="${SC}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="window.__pwned=10"><style>#${SC} .node rect{fill:#333;stroke:#999} body{display:none} #${SC} ~ *{color:red} @font-face{font-family:x;src:url(https://example.invalid/f.woff)} #${SC} .a{fill:url(https://example.invalid/p.svg#g)} #${SC} .b{fill:url(#grad)} @keyframes spin{to{opacity:0}}</style>`
    + '<defs><linearGradient id="grad"><stop offset="0" stop-color="#fff"/></linearGradient><marker id="' + SC + '_arrow"/></defs>'
    + '<g class="node chat-agent-view-btn" id="actor0" data-id="x" tabindex="0" onclick="window.__pwned=11"><rect width="10" height="10" style="fill:#f00;background:url(https://example.invalid/s.png)"/><text>Start label</text></g>'
    + '<a href="javascript:window.__pwned=12"><text>link label</text></a>'
    + '<foreignObject width="50" height="20"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.__pwned=13"/>html label</div></foreignObject>'
    + '<image href="https://example.invalid/i.png" width="10" height="10"/><use href="https://example.invalid/u.svg#a"/><animate attributeName="href" to="javascript:window.__pwned=14"/><set attributeName="onclick" to="window.__pwned=15"/>'
    + `<path d="M0 0L10 10" marker-end="url(#${SC}_arrow)" stroke="url(#grad)"/><script>window.__pwned=16</script></svg>`;
  const ctlC = await evalInBlankTab(CDP_PORT, `(async () => { ${SAFE_JS}
    const judge = (html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); const svg = d.querySelector('svg'); const all = svg ? [svg, ...svg.querySelectorAll('*')] : [];
      const style = svg && svg.querySelector('style') ? svg.querySelector('style').textContent : '';
      const out = { tags: [...new Set(all.map((e) => e.tagName))].sort(), on: all.flatMap((e) => [...e.attributes].filter((a) => /^on/i.test(a.name)).map((a) => a.name)), js: /javascript:/i.test(d.innerHTML), external: /example\\.invalid/.test(d.innerHTML),
        bodyRule: /body\\s*\\{/.test(style), sibling: /~/.test(style), fontFace: /@font-face/.test(style), keyframes: /@keyframes/.test(style), ruleKept: style.includes('#${SC} .mmd-node rect'), gradRef: style.includes('url(#${SC}-grad)'),
        ids: all.map((e) => e.id).filter(Boolean), cls: (svg && svg.querySelector('g') || {}).className && svg.querySelector('g').className.baseVal, dataId: !!(svg && svg.querySelector('[data-id]')), tab: !!(svg && svg.querySelector('[tabindex]')),
        rectStyle: (svg && svg.querySelector('rect') || { getAttribute: () => '' }).getAttribute('style'), stroke: (svg && svg.querySelector('path') || { getAttribute: () => '' }).getAttribute('stroke'), marker: (svg && svg.querySelector('path') || { getAttribute: () => '' }).getAttribute('marker-end'),
        texts: svg ? [...svg.querySelectorAll('text')].map((t) => t.textContent) : [], html: /html label/.test(d.textContent) };
      d.remove(); return out; };
    const mine = judge(__SAFE.sanitizeDiagramSvg(${JSON.stringify(HOSTILE)}, '${SC}'));
    const plain = judge(__SAFE.DOMPurify(window).sanitize(${JSON.stringify(HOSTILE)}, { USE_PROFILES: { svg: true, svgFilters: true } }));
    await new Promise((r) => setTimeout(r, 300));
    return { mine, plain, ran: window.__pwned === undefined ? null : window.__pwned }; })()`);
  const mine = ctlC && ctlC.mine, plain = ctlC && ctlC.plain;
  check('the wall keeps the picture: its labels as text, the scoped rule (classes mmd-), the gradient and marker references re-pointed', !!mine && JSON.stringify(mine.texts) === '["Start label","link label"]' && mine.ruleKept && mine.gradRef && mine.stroke === `url(#${SC}-grad)` && mine.marker === `url(#${SC}_arrow)` && mine.cls === 'mmd-node mmd-chat-agent-view-btn', mine);
  check('…and drops every door: no on*, no javascript:, nothing from example.invalid, no foreignObject / a / image / use / animate / set / script, no data-id, no tabindex', !!mine && !mine.on.length && !mine.js && !mine.external && !mine.tags.some((x) => /^(foreignObject|a|image|use|animate|set|script)$/i.test(x)) && !mine.dataId && !mine.tab && !mine.html, mine);
  check('…its CSS: no body rule, no sibling selector, no @font-face / @keyframes; ids scoped (actor0 → scope-actor0, grad → scope-grad); style= keeps fill, loses the url()', !!mine && !mine.bodyRule && !mine.sibling && !mine.fontFace && !mine.keyframes && mine.ids.includes(`${SC}-actor0`) && mine.ids.includes(`${SC}-grad`) && mine.ids.includes(SC) && /fill/.test(mine.rectStyle || '') && !/url/.test(mine.rectStyle || ''), mine);
  check('CONTROL (c): DOMPurify\'s plain SVG profile KEEPS the body rule, the off-picture url()s, the product class and the bare ids — the hooks and the config are the wall', !!plain && plain.bodyRule && plain.external && /chat-agent-view-btn/.test(plain.cls || '') && plain.ids.includes('actor0') && plain.dataId, plain);
  check('no handler ran in the control tab either (the sanitizers parse inertly)', !!ctlC && ctlC.ran === null, ctlC && ctlC.ran);

  // ════ ⑧ the editor's preview ════
  console.log('── ⑧ the editor\'s Markdown preview ──');
  await ev(`(app.openEditor(${JSON.stringify(path.join(CWD, 'flow.md'))}, 'flow.md'), true)`);
  const EW = `[...app.wm.windows.values()].find((w) => w.type === 'editor' && w._filePath === ${JSON.stringify(path.join(CWD, 'flow.md'))})`;
  const prevBtn = await until(() => ev(`(() => { const w = ${EW}; const b = w && [...w.element.querySelectorAll('button')].find((x) => x.textContent === 'Preview' && x.style.display !== 'none'); return !!b; })()`), 20000);
  check('the editor opened the .md with its Preview button', !!prevBtn);
  await press(`[...(${EW}).element.querySelectorAll('button')].find((x) => x.textContent === 'Preview')`);
  const EC = `(() => { const w = ${EW}; return w ? w.element.querySelector('.markdown-preview .chat-diagram') : null; })()`;
  const f8 = await until(async () => { const f = await facts(EC); return f && f.state === 'ok' ? f : null; }, 30000);
  check('the preview draws the same flowchart (≥ 6 nodes, every label) through the one door — no CDN script', !!f8 && f8.nodes >= 6 && LABELS.every((l) => f8.labels.includes(l)) && !f8.onAttrs.length && f8.fo === 0, f8 || await facts(EC));
  if (f8) await shot('editor-preview.png', await ev(`(() => { const r = (${EW}).element.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`));
  await ev(`(() => { const w = ${EW}; if (w) app.wm.closeWindow(w.id); return true; })()`);

  // ════ ⑨ the file viewer ════
  console.log('── ⑨ the file viewer\'s markdown ──');
  await ev(`(app.openFile({ rawUrl: '/vs-cmm-flow.md', fileName: 'flow.md', title: 'flow.md' }), true)`);
  const FC = `(() => { const c = document.querySelector('.file-viewer-md .chat-diagram'); return c || null; })()`;
  const f9 = await until(async () => { const f = await facts(FC); return f && f.state === 'ok' ? f : null; }, 30000);
  check('the file viewer\'s markdown (a file served by URL) draws it too', !!f9 && f9.nodes >= 6, f9 || await facts(FC));
  await ev(`(() => { for (const w of [...app.wm.windows.values()]) if (w._openSpec && w._openSpec.action === 'openFile') app.wm.closeWindow(w.id); return true; })()`);

  // ════ ⑩ the light theme ════
  console.log('── ⑩ the light theme ──');
  await ev(`(app.themeManager.apply('light'), true)`);
  const f10 = await until(async () => { const f = await facts(HIST); return f && f.state === 'ok' && f.theme === 'default' ? f : null; }, 20000);
  check('a theme change re-draws the drawn cards in the light theme (mermaid default)', !!f10 && f10.nodes >= 6, f10 || await facts(HIST));
  if (f10) { await ev(`(${HIST}.scrollIntoView({ block: 'start' }), true)`); await shot('chat-light.png', (await facts(HIST)).rect); }
  await ev(`(app.themeManager.apply('dark'), true)`);

  // ════ ⑪ a picture from elsewhere ════
  console.log('── ⑪ a diagram naming a picture on another host ──');
  const before = requests.length;
  await ev(liveMsg('cmm-pic', fence(PICTURE, 'With a picture:')));
  const f11 = await until(async () => { const f = await facts(cardIn(msgSel('cmm-pic'))); return f && f.state === 'failed' ? f : null; }, 20000);
  await sleep(500);
  check('it is NOT drawn: the source shows with the reason (VibeSpace draws nothing from outside)', !!f11 && f11.view === 'source' && /pictures\.example\.invalid/.test(f11.err) && /不从外部加载/.test(f11.err), f11);
  check('…and nothing was requested for it', !requests.slice(before).some((u) => /example\.invalid/.test(u)), requests.slice(before));

  // ════ ⑫ the network ════
  console.log('── ⑫ every request went to the hub ──');
  const off = requests.filter((u) => !(u.startsWith(ORIGIN + '/') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('ws://127.0.0.1:' + PORT)));
  const mjs = requests.filter((u) => /\/mermaid\.js(\?|$)/.test(u));
  check(`all ${requests.length} requests the page made went to the scratch hub (data:/blob: aside)`, off.length === 0, off.slice(0, 8));
  check('mermaid.js was requested ONCE, at its stamped address', mjs.length === 1 && /\/mermaid\.js\?v=\d+$/.test(mjs[0]), mjs);
  // ⑦'S OWN PROBE IS NOT THE APP'S (lane ci-mirror-hygiene, 2.369.362 — the mirror's Chrome 156 ran this suite red on
  // 2.369.361, both tries): mermaid's sanitizer parses the probe's label in an inert document, and since Chrome 156 the
  // handler it drops is reported when its attribute is SET — nothing ran (⑦ «no handler ran»). That ONE report is
  // expected, keyed by the probe's payload (scripts/scratch.mjs takeProbeCspReport): Chrome 154 files none, 156 exactly
  // it; any other line stays for the next leg and the teardown, red by name. THE HUB'S VERDICT on it (lane
  // csp-mermaid-sites r2 — the take alone passed a NOTICED line too): it is mermaid's own DOMPurify's parse, so the
  // sanitizer's — kind sanitizer-parse, no notice, no page-security notice in For you, Diagnostics' sanitizer count +1
  // and the app page's +0 (scratch.mjs probeVerdictFault); a browser that reports none counts none.
  const browser = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json()).then((v) => v.Browser, () => 'this browser');
  const major = Number((/\/(\d+)\./.exec(browser) || [])[1]) || 0;
  const cspAfter = await ev("fetch('/api/csp-reports').then((r) => r.json())");
  const forYou = await ev("fetch('/api/user-todos').then((r) => r.json()).then((j) => ((j.todos && j.todos.open) || []).filter((x) => x.sessionKey === 'csp-report').map((x) => ({ text: x.text, status: x.status })))"); // the sink's NOTICE_KEY
  const probe = await takeProbeCspReport({ directive: 'script-src-attr', blocked: 'inline', sample: PROBE_HANDLER.slice(0, 40), source: `${ORIGIN}/mermaid.js`, document: `${ORIGIN}/` });
  const p0 = probe.taken[0];
  const fault = probeVerdictFault(probe, { major, forYou: Array.isArray(forYou) ? forYou : [{ text: `For you unread: ${JSON.stringify(forYou).slice(0, 200)}` }], count: { before: cspBefore, after: cspAfter } });
  check(`⑦'s own probe: ${browser} ${p0 ? `reported its dropped handler — EXPECTED, taken (script-src-attr inline «${p0.sample}», set by ${p0.source} at ${p0.line}:${p0.column}); THE HUB'S VERDICT: ${probe.kind ? `kind ${probe.kind}` : 'the app page\'s'}, ${probe.noticed ? 'filed as a notice' : 'no notice'}, For you ${forYou && forYou.length ? `${forYou.length} page-security notice(s)` : 'empty'}, Diagnostics' sanitizer count +${(cspAfter?.sanitizer?.lines ?? NaN) - (cspBefore?.sanitizer?.lines ?? NaN)}` : `reported nothing for it (it reports no dropped handler; Diagnostics' sanitizer count +${(cspAfter?.sanitizer?.lines ?? NaN) - (cspBefore?.sanitizer?.lines ?? NaN)})`}`, probe.ok && !fault, fault || probe.taken);
  let csp = []; try { csp = fs.readFileSync(CSP_REPORTS_FILE, 'utf8').split('\n').filter(Boolean); } catch { }
  check('the app page reported nothing ELSE to its CSP (script-src \'self\': every script came from this origin)', csp.length === 0, csp.slice(0, 4));
  check('no uncaught page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
}
cleanup();
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name)).map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
