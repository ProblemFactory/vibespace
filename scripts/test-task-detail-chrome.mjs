#!/usr/bin/env node
// THE TASK GROUP WINDOW WITH A REAL CHROME (lane task-group-context — the POC v2.2 Group board + the owner's fourth level,
// 2026-10-23). HEAVY: a scratch worktree server (private HOME, a data/task-groups.json from BEFORE the Context table so
// the boot runs the one migration through the live store) + headless Chrome over raw CDP, real mouse / keyboard.
//   boot   · the legacy group's folders[] + contextDir came back as Context rows (GET /api/tasks), the old fields kept in
//            the file one release
//   desk 1100 (zh) · tabs 设置 · Backlog (N) · 活动记录 · 成员 (N); 设置 = 名称 → 说明 / 常驻指令 → Context 表 → 新对话会收到 →
//            更多选项 (value chips), footer 改动即时保存 + 归档; the preview IS GET /api/tasks/:id/context's text; a press on
//            「文件名」 re-tells the row (the preview follows); the budget bar + a stepped row's words; blur commits — a
//            relative path that resolves becomes a row on blur (its text kept as typed), one that does not keeps its text
//            and says 未生效 (a later repaint keeps both); an existing row's path edited to nowhere keeps the old path;
//            ＋ 引用另一个任务组… ⇒ the reference row, the other group's shared row told last in the preview; the
//            objective's blur saves it and the preview says it verbatim; Backlog / 活动记录 are the full viewers with their
//            boxes saving on blur / Enter; 成员 lists the members, ★ marks, 「在这里开始对话」 opens New Session for the group;
//            a fold chip opens 更多选项 on its row
//   desk · Session Properties (lane session-props-scroll) — the OTHER window on the .task-detail root class: at 440 × 620 in
//            the owner's shape (every Task Group, config overrides, a browser block, a history) its sections sit in ONE
//            .task-detail-body that scrolls (scrollTop and a real wheel), inside the padding (label, «更改…», 任务组 boxes),
//            ≥ 8 px between sections, one 72 px label column; a broadcast re-render keeps the reader's place; a control
//            with the body class off (the 2.369.348 shape) fails the same measures
//   phone 390 (zh) · the same window: one card per Context row, nothing wider than the viewport
// PNGs: $VIBESPACE_TGC_PNG_DIR/{desk-settings,desk-stepped,desk-ref,desk-backlog,desk-members,desk-session-props,phone}.png
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules', 'ws'));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome for the client'); process.exit(0); }
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1600) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };
const PNG_DIR = process.env.VIBESPACE_TGC_PNG_DIR || null;
const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv();
const wt = scratch('tgc-chrome');
const fakeHome = scratchHome('tgc-home', fs);
const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);

// the world: an IR desk (key files, a shared-notes folder, a handbook), a big folder (past the walk cap), a company group
const H = (rel) => path.join(fakeHome, rel);
const mk = (rel, body) => { fs.mkdirSync(path.dirname(H(rel)), { recursive: true }); fs.writeFileSync(H(rel), body); };
mk('work/ir/CLAUDE.md', '# IR desk\nAlways cite the figures table.\n');
mk('work/ir/README.md', 'IR readme.\n');
mk('work/ir/draft-q3.txt', 'draft');
mk('work/ir/共享资料/handbook.md', '# 手册\n联系人：CFO。\n');
mk('work/ir/共享资料/进度.md', 'progress');
mk('work/company/术语表.md', '# 术语\nARR = 年度经常性收入。\n');
for (let i = 0; i < 450; i++) mk(`work/drive/f${String(i).padStart(3, '0')}.txt`, 'x');
fs.mkdirSync(H('work/legacy/notes'), { recursive: true });

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'data/bin', 'scripts', 'docs']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(path.join(wt, f))} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execSync('npm run build', { cwd: wt, stdio: 'ignore' });   // its own copies of the tree under test (the build's gates read scripts/ + docs/)
// a store from BEFORE the Context table: the boot's one migration turns its old fields into rows (through the live store)
const T0 = Date.now() - 3600e3;
fs.writeFileSync(path.join(wt, 'data', 'task-groups.json'), JSON.stringify({ version: 1, tasks: {
  'T-261001-legacy': { id: 'T-261001-legacy', title: '旧组', kind: 'task', archived: false, attention: null, objective: '', backlog: [], progress: [], sessions: [], folders: [{ path: H('work/legacy'), recursive: true }], contextDir: H('work/legacy/notes'), color: null, createdAt: T0, updatedAt: T0, contentUpdatedAt: T0, injectContext: true },
} }, null, 2));

const baseEnv = { ...process.env }; delete baseEnv.DISPLAY; delete baseEnv.WAYLAND_DISPLAY; delete baseEnv.DBUS_SESSION_BUS_ADDRESS; delete baseEnv.ANTHROPIC_API_KEY;
const srvEnv = { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: '/bin/false' };
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d)));
const client = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic', '--window-size=1100,900', `--user-data-dir=${scratch('tgc-client')}`, 'about:blank'], { stdio: 'ignore', detached: true, env: baseEnv });
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
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return r.json(); };
const groupOf = async (id) => ((await api('GET', '/api/tasks')).tasks || []).find((g) => g.id === id);

try {
  const up = await until(async () => { if (srv.exitCode !== null) return 'dead'; await fetch(`http://127.0.0.1:${PORT}/api/home`); return 'up'; }, 120000, 250);
  check('the scratch server answers (private HOME)', up === 'up', srvLog.join('').slice(-800));
  if (up !== 'up') throw new Error('no server');

  // ── boot: the one migration ran through the live store ──
  console.log('── boot ──');
  const leg = await groupOf('T-261001-legacy');
  check('the legacy group\'s folders[] + contextDir came back as Context rows (文件名 · 自动发现会话 / 记笔记)', !!leg && JSON.stringify(leg.ctx.map((r) => [r.path, r.tell, r.tags])) === JSON.stringify([[H('work/legacy'), 'names', ['discover']], [H('work/legacy/notes'), 'names', ['notes']]]) && leg.contextDir === H('work/legacy/notes'), leg && leg.ctx);
  const disk = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'task-groups.json'), 'utf8')).tasks['T-261001-legacy'];
  const ledger = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'migrations.json'), 'utf8'));
  check('the file keeps the old fields one release beside the rows; the ledger records the run once', Array.isArray(disk.ctx) && disk.folders.length === 1 && disk.contextDir === H('work/legacy/notes') && !!ledger.applied['2026-10-task-group-context-rows'], { disk, ledger: Object.keys(ledger.applied || {}).slice(-3) });

  // the groups the window edits
  const co = (await api('POST', '/api/tasks', { title: '公司', ctx: [{ path: '~/work/company/术语表.md', note: '术语表（谁都可以补）', share: 'rw' }] })).task;
  const ir = (await api('POST', '/api/tasks', { title: '投资者关系', objective: '负责投资人沟通。\n对外一律不提供应商名和价格。', ctx: [
    { path: '~/work/ir', note: '工作文件：材料、草稿', tags: ['discover'] },
    { path: '共享资料', note: '共享笔记', tags: ['notes'], tell: 'names' },
    { path: 'handbook.md', note: '规则和联系人' },
    { path: '~/work/drive', note: '公司云盘', tell: 'names' },
  ] })).task;
  await api('POST', `/api/tasks/${ir.id}/bind`, { sessionKey: 'claude:aaaaaaaa-1111-4000-8000-000000000001' });
  await api('PATCH', `/api/tasks/${ir.id}`, { backlog: [{ text: '季度会前对齐数字口径', status: 'open', addedBy: 'user', addedAt: Date.now() }] });
  check('setup: two groups through the API (the IR group with four rows, the company group sharing one row read-write)', !!ir && !!co && ir.ctx.length === 4);

  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  const cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  const pageErrors = [];
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') pageErrors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400)); });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const SPY = `(() => { window.__toasts = []; window.__toastTexts = () => [...window.__toasts.map((n) => n.textContent || ''), ...[...document.querySelectorAll('.global-toast')].map((n) => n.textContent || '')];
    const mo = new MutationObserver((ms) => { for (const r of ms) for (const n of r.addedNodes) if (n.nodeType === 1 && /toast/.test(n.className || '')) window.__toasts.push(n); });
    const go = () => (document.documentElement ? mo.observe(document.documentElement, { childList: true, subtree: true }) : setTimeout(go, 10)); go(); })();`;
  async function newPage(w, h, mobile) {
    const tg = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const a = await send('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true });
    const s = a.result.sessionId; const S = (m, p) => send(m, p, s);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (mobile) await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 500) }; return r.result && r.result.result ? r.result.result.value : undefined; };
    const ready = await until(() => ev("!!(window.app && window.app.wm && app.ws && app.sidebar && app.sidebar._tasksLoaded) && !document.getElementById('loading-screen')"), 60000, 300);
    return { S, ev, ready };
  }
  const shot = async (S, f) => { if (!PNG_DIR) return null; const r = await S('Page.captureScreenshot', { format: 'png' }); if (!r.result) return null; fs.mkdirSync(PNG_DIR, { recursive: true }); const out = path.join(PNG_DIR, f); fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')); return out; };
  const centre = (ev, sel) => ev(`(() => { const e = ${sel.startsWith('JS:') ? sel.slice(3) : `document.querySelector(${JSON.stringify(sel)})`}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width, h: q.height }; })()`);
  const press = async (P, sel) => { const r = await centre(P.ev, sel); if (!r || r.__err) return false; for (const type of ['mousePressed', 'mouseReleased']) await P.S('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 }); return true; };
  const typeInto = async (P, sel, text, { clear = true } = {}) => {
    if (!(await press(P, sel))) return false;
    if (clear) { await P.S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await P.S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await P.S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await P.S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); }
    await P.S('Input.insertText', { text });
    return true;
  };
  const enter = async (P) => { await P.S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await P.S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
  const W = (id) => `[...app.wm.windows.values()].find((w) => w._taskDetailId === ${JSON.stringify(id)})`;
  const IN = (id, sel) => `JS:(${W(id)}).element.querySelector(${JSON.stringify(sel)})`;
  const blurAway = (P, id) => press(P, IN(id, '.task-detail-settings .task-detail-label'));   // a press on the 名称 label: the box loses the focus
  const preview = (P, id) => P.ev(`(() => { const w = ${W(id)}; const p = w && w.element.querySelector('.task-detail-preview'); return p ? p.textContent : null; })()`);

  // ════ desk 1100 ════
  console.log('── desk 1100 (zh) ──');
  const D = await newPage(1100, 900, false);
  check('desk: the app is up, the Task Groups loaded', !!D.ready);
  await D.ev(`(app.openTaskDetail(${JSON.stringify(ir.id)}), true)`);
  const shape = await until(() => D.ev(`(() => { const w = ${W(ir.id)}; if (!w) return null; const el = w.element;
    const tabs = [...el.querySelectorAll('.task-detail-tabs .sidebar-subtab')].map((b) => ({ t: b.textContent.trim(), on: b.classList.contains('active') }));
    const labels = [...el.querySelectorAll('.task-detail-settings > .task-detail-section > .task-detail-label')].map((l) => l.firstChild && l.firstChild.textContent.trim());
    const more = el.querySelector('.task-detail-more > summary'); const foot = el.querySelector('.task-detail-footer');
    const pre = el.querySelector('.task-detail-preview');
    return pre && !/^加载/.test(pre.textContent) && labels.length >= 4 ? { tabs, labels, more: more ? [...more.querySelectorAll('.ctx-chip')].map((c) => c.textContent.replace(/\\s+/g, ' ').trim()) : null, foot: foot ? foot.textContent.replace(/\\s+/g, ' ').trim() : null, rows: el.querySelectorAll('.ctx-row:not(.ctx-headrow)').length } : null; })()`), 20000);
  check('the tabs: 设置 · Backlog (1) · 活动记录 · 成员 (1), 设置 open', !!shape && JSON.stringify(shape.tabs.map((x) => x.t)) === JSON.stringify(['设置', 'Backlog（搁置区） (1)', '活动记录', '成员 (1)']) && shape.tabs[0].on, shape && shape.tabs);
  check('设置, top to bottom: 名称 → 说明 / 常驻指令 → Context 表 → 新对话会收到 → 更多选项', !!shape && JSON.stringify(shape.labels) === JSON.stringify(['名称', '说明 / 常驻指令', 'Context 表', '新对话会收到']) && !!shape.more, shape && shape.labels);
  check('更多选项 carries its values on the chips (通知 继承 · 外部 封闭 · 浏览器配置 默认 · 颜色 自动 · 导出 / 导入)', !!shape && shape.more && JSON.stringify(shape.more) === JSON.stringify(['通知 继承', '外部 封闭', '浏览器配置 默认', '颜色 自动', '导出 / 导入']), shape && shape.more);
  check('the footer: 改动即时保存 + 归档', !!shape && /改动即时保存（路径行离开字段就生效，回车也行）/.test(shape.foot) && /归档/.test(shape.foot), shape && shape.foot);
  check('the Context table: four rows', !!shape && shape.rows === 4, shape && shape.rows);
  const rowFacts = await D.ev(`(() => [...(${W(ir.id)}).element.querySelectorAll('.ctx-row:not(.ctx-headrow)')].map((r) => ({ path: (r.querySelector('.ctx-path-input') || {}).value, note: (r.querySelector('.ctx-note-input') || {}).value, tell: [...r.querySelectorAll('.ctx-tell .ctx-seg-btn')].map((b) => b.textContent + (b.classList.contains('active') ? '*' : '')).join('|'), tags: [...r.querySelectorAll('.ctx-tag.on')].map((b) => b.textContent).join('|'), res: (r.querySelector('.ctx-res') || {}).textContent, plan: (r.querySelector('.ctx-plan') || {}).textContent })))()`);
  check('a folder row offers the FOUR levels (its default 文件名 + 关键文件内容), a file row three (its default 内容)', rowFacts[0].tell === '只说明|文件名|文件名 + 关键文件内容*|内容' && rowFacts[2].tell === '只说明|文件名|内容*', rowFacts.map((r) => r.tell));
  check('the verbs are words on the row (自动发现会话 · agent 在这里记笔记)', rowFacts[0].tags === '自动发现会话' && rowFacts[1].tags === 'agent 在这里记笔记', rowFacts.map((r) => r.tags));
  check('a relative row keeps its text as typed and says where it resolved (按本表上一行解析)', rowFacts[1].path === '共享资料' && rowFacts[1].res.includes('= ~/work/ir/共享资料') && rowFacts[1].res.includes('按本表上一行解析'), rowFacts[1]);
  const ctx0 = await api('GET', `/api/tasks/${ir.id}/context`);
  const pv0 = await preview(D, ir.id);
  check('「新对话会收到」 IS the renderer\'s output (GET /api/tasks/:id/context block, byte for byte)', pv0 === ctx0.block && pv0.includes('负责投资人沟通。\n对外一律不提供应商名和价格。') && pv0.includes('Always cite the figures table.'), { pv0: (pv0 || '').slice(0, 300) });
  check('the big folder steps down and SAYS so — on its row (超出…退到「只说明」) and in the budget bar', /只说明/.test(rowFacts[3].plan) && /太大|超出注入预算/.test(rowFacts[3].plan) && await D.ev(`!!(${W(ir.id)}).element.querySelector('.ctx-budget-warn:not([hidden])')`), rowFacts[3]);
  const budgetWords = await D.ev(`(${W(ir.id)}).element.querySelector('.ctx-budget-words').textContent`);
  check(`the budget bar names what was used of what (${budgetWords})`, /^注入预算 [\d.]+ (KB|B) \/ [\d.]+ KB/.test(budgetWords || ''), budgetWords);
  await shot(D.S, 'desk-settings.png');

  // 告诉 agent: a real press on 文件名 for the IR folder ⇒ the preview lists, no key file contents
  await press(D, `JS:(${W(ir.id)}).element.querySelectorAll('.ctx-row:not(.ctx-headrow)')[0].querySelector('.ctx-seg-btn[data-tell="names"]')`);
  const pvNames = await until(async () => { const p = await preview(D, ir.id); return p && !p.includes('Always cite the figures table.') && p.includes('draft-q3.txt') ? p : null; }, 10000);
  check('a press on 「文件名」 re-tells the row: the preview lists its files and drops the key files\' contents', !!pvNames && (await groupOf(ir.id)).ctx[0].tell === 'names', (await preview(D, ir.id) || '').slice(0, 600));

  // blur commits — the add box: a relative path that resolves
  await typeInto(D, IN(ir.id, '.ctx-add-input'), '共享资料/进度.md');
  await blurAway(D, ir.id);
  const added = await until(async () => { const g = await groupOf(ir.id); return g.ctx.length === 5 ? g.ctx[4] : null; }, 10000);
  check('a relative path typed into ＋ 添加路径… takes effect on BLUR: a row, its text as typed (a file: 内容, no auto-join)', !!added && added.path === '共享资料/进度.md' && added.tags.length === 0, added);
  const toastAdd = await until(() => D.ev("window.__toastTexts().find((x) => /已添加第 5 行/.test(x)) || null"), 5000);
  check(`…and the toast says what it became (${toastAdd})`, !!toastAdd && /告诉 agent「内容」/.test(toastAdd), toastAdd);
  // …one that does not resolve: keeps its text, says 未生效, adds nothing
  await typeInto(D, IN(ir.id, '.ctx-add-input'), 'nowhere-zz');
  await blurAway(D, ir.id);
  const unres = await until(() => D.ev(`(() => { const el = (${W(ir.id)}).element; const i = el.querySelector('.ctx-add-input'); const pf = i && i.closest('.path-field'); const said = el.querySelector('.ctx-add') ? el.querySelector('.ctx-add').textContent : ''; return i && i.value === 'nowhere-zz' && /未生效/.test(said) ? { value: i.value, state: pf && pf.dataset.state, said } : null; })()`), 10000);
  check('an unresolvable path keeps its text and says 「未生效：…」; no row is added', !!unres && (await groupOf(ir.id)).ctx.length === 5, unres || await D.ev(`(${W(ir.id)}).element.querySelector('.ctx-add').textContent`));
  // a repaint (another client's edit) keeps the typed text and its words
  await api('PATCH', `/api/tasks/${ir.id}`, { color: '#61afef' });
  await sleep(800);
  const kept = await D.ev(`(() => { const el = (${W(ir.id)}).element; const i = el.querySelector('.ctx-add-input'); return { v: i && i.value, said: el.querySelector('.ctx-add').textContent }; })()`);
  check('…a repaint from a broadcast keeps the typed text and the 未生效 words', kept.v === 'nowhere-zz' && /未生效/.test(kept.said), kept);
  // an existing row's path edited to nowhere: the row keeps its old path
  await typeInto(D, `JS:(${W(ir.id)}).element.querySelectorAll('.ctx-row:not(.ctx-headrow)')[2].querySelector('.ctx-path-input')`, 'gone-zz.md');
  await blurAway(D, ir.id);
  await sleep(1200);
  const g2 = await groupOf(ir.id);
  const rowSaid = await D.ev(`(() => { const r = (${W(ir.id)}).element.querySelectorAll('.ctx-row:not(.ctx-headrow)')[2]; return { v: r.querySelector('.ctx-path-input').value, said: r.textContent }; })()`);
  check('an existing row edited to a path that does not resolve keeps its old path (未生效), the typed text stays', g2.ctx[2].path === 'handbook.md' && rowSaid.v === 'gone-zz.md' && /未生效/.test(rowSaid.said), { stored: g2.ctx[2].path, rowSaid });

  // the objective: blur saves; the preview says it verbatim
  await typeInto(D, IN(ir.id, '.task-detail-objective'), '负责投资人沟通。\n周五前把 Q3 材料发给董事会。');
  await blurAway(D, ir.id);
  const pvObj = await until(async () => { const p = await preview(D, ir.id); return p && p.includes('周五前把 Q3 材料发给董事会。') ? p : null; }, 10000);
  check('说明 / 常驻指令 saves on blur and the preview tells it verbatim', !!pvObj && (await groupOf(ir.id)).objective.includes('周五前把 Q3 材料发给董事会。'));

  // ＋ 引用另一个任务组…
  await press(D, IN(ir.id, '.ctx-ref-add'));
  const menu = await until(() => D.ev("(() => { const m = [...document.querySelectorAll('.context-menu')].pop(); return m ? [...m.querySelectorAll('.context-menu-item')].map((n) => n.textContent.trim()) : null; })()"), 5000);
  check('＋ 引用另一个任务组… lists the other groups with what they share', !!menu && menu.some((x) => /^公司 — 1 行可引用$/.test(x)), menu);
  await press(D, "JS:[...[...document.querySelectorAll('.context-menu')].pop().querySelectorAll('.context-menu-item')].find((n) => /^公司/.test(n.textContent.trim()))");
  const pvRef = await until(async () => { const p = await preview(D, ir.id); return p && p.includes('公司') && p.includes('ARR = 年度经常性收入。') ? p : null; }, 10000);
  check('the reference row is added; the preview tells the company\'s shared row LAST, editable here (shared 可写)', !!pvRef && pvRef.lastIndexOf('ARR = 年度经常性收入。') > pvRef.indexOf('共享笔记') && /you may edit it/.test(pvRef) && (await groupOf(ir.id)).ctx.some((r) => r.ref === co.id), (await preview(D, ir.id) || '').slice(-700));
  await shot(D.S, 'desk-ref.png');

  // a fold chip opens 更多选项 on its row
  await press(D, `JS:(${W(ir.id)}).element.querySelector('.task-detail-more .ctx-chip[data-more="visibility"]')`);
  const foldOpen = await until(() => D.ev(`(() => { const f = (${W(ir.id)}).element.querySelector('.task-detail-more'); const row = f && f.querySelector('[data-more-row="visibility"]'); return f && f.open && row && row.getBoundingClientRect().height > 0 ? true : null; })()`), 5000);
  check('a chip on the fold opens 更多选项 on its row', !!foldOpen);

  // Backlog — the full viewer, its box saves on blur
  await press(D, IN(ir.id, '.task-detail-tabs .sidebar-subtab[data-tab="backlog"]'));
  const blView = await until(() => D.ev(`(() => { const el = (${W(ir.id)}).element; const v = el.querySelector('.task-log-embedded'); return v && v.querySelector('.task-log-add') && /季度会前对齐数字口径/.test(v.textContent) ? { tabs: !!v.querySelector('.task-log-tabs'), search: !!v.querySelector('.task-log-search') } : null; })()`), 10000);
  check('the Backlog tab IS the full viewer (its search + list), without a second tab strip', !!blView && blView.search && !blView.tabs, blView);
  await typeInto(D, `JS:(${W(ir.id)}).element.querySelector('.task-log-embedded .task-log-add')`, '下周补投资人名单');
  await press(D, `JS:(${W(ir.id)}).element.querySelector('.task-log-embedded .task-log-search')`);
  const blSaved = await until(async () => ((await groupOf(ir.id)).backlog || []).some((b) => b.text === '下周补投资人名单'), 10000);
  const blToast = await until(() => D.ev("window.__toastTexts().find((x) => /离开输入框就保存了/.test(x)) || null"), 5000);
  check('its box saves when LEFT (no Enter), and says so', !!blSaved && !!blToast, { blSaved, blToast });
  await shot(D.S, 'desk-backlog.png');
  // 活动记录 — the viewer, its note box (Enter)
  await press(D, IN(ir.id, '.task-detail-tabs .sidebar-subtab[data-tab="activity"]'));
  await until(() => D.ev(`!!(${W(ir.id)}).element.querySelector('.task-log-embedded .task-log-progadd')`), 5000);
  await typeInto(D, `JS:(${W(ir.id)}).element.querySelector('.task-log-embedded .task-log-progadd')`, '对齐了 Q3 口径');
  await enter(D);
  const prSaved = await until(async () => ((await groupOf(ir.id)).progress || []).some((p) => p.note === '对齐了 Q3 口径'), 10000);
  const prShown = await until(() => D.ev(`/对齐了 Q3 口径/.test((${W(ir.id)}).element.querySelector('.task-log-embedded .task-log-body').textContent)`), 10000);
  check('the 活动记录 tab is the viewer: a note typed + Enter is filed and drawn', !!prSaved && !!prShown);

  // 成员
  await D.ev(`(() => { window.__nsd = null; const o = app.showNewSessionDialog.bind(app); app.showNewSessionDialog = (a) => { window.__nsd = a || {}; }; return true; })()`);
  await press(D, IN(ir.id, '.task-detail-tabs .sidebar-subtab[data-tab="members"]'));
  const mem = await until(() => D.ev(`(() => { const el = (${W(ir.id)}).element; const rows = [...el.querySelectorAll('.task-detail-member')]; return rows.length ? rows.map((r) => ({ key: r.dataset.key, buttons: [...r.querySelectorAll('button')].map((b) => b.textContent + (b.disabled ? '(off)' : '')) })) : null; })()`), 5000);
  check('成员 lists the member with ★ 标常驻 and 移出', !!mem && mem.length === 1 && mem[0].key === 'claude:aaaaaaaa-1111-4000-8000-000000000001' && mem[0].buttons.some((b) => /标常驻/.test(b)) && mem[0].buttons.some((b) => /^移出/.test(b)), mem);
  await press(D, IN(ir.id, '.task-detail-member-start .task-detail-primary'));
  const nsd = await until(() => D.ev('window.__nsd'), 5000);
  check('「在这里开始对话」 opens New Session for this group, its first folder as the folder', !!nsd && nsd.taskId === ir.id && nsd.cwd === H('work/ir'), nsd);
  await shot(D.S, 'desk-members.png');
  await press(D, `JS:(${W(ir.id)}).element.querySelector('.task-detail-member .task-detail-unbind')`);
  const unbound = await until(async () => !(await groupOf(ir.id)).sessions.length, 10000);
  check('移出 unbinds the member', !!unbound);

  // ════ desk: Session Properties — the OTHER window on the .task-detail root class, the same body ════
  // (lane session-props-scroll, the owner on 2.369.348: 「这个界面目前也不能滚动了，而且 margin 很奇怪」 — int346 moved the root's
  // padding / gap / scroll into .task-detail-body and this window kept its sections on the bare root)
  console.log('── desk: Session Properties on the shared body (440 × 620, the owner\'s shape) ──');
  for (const title of ['学校', '家庭事务']) await api('POST', '/api/tasks', { title });
  const sp = await D.ev(`(async () => {
    const sb = app.sidebar;
    const s = { backend: 'claude', sessionId: 'aaaaaaaa-3333-4000-8000-000000000003', backendSessionId: 'aaaaaaaa-3333-4000-8000-000000000003', cwd: ${JSON.stringify(H('work/ir'))},
      name: '属性窗口', status: 'live', webuiId: 'sess-props-1', webuiMode: 'chat', startedAt: Date.now() - 3600e3, pid: 4242, auth: { source: 'subscription' },
      model: 'claude-opus-4-1', effort: 'high', modelOrigin: 'chosen', effortOrigin: 'chosen', browserCap: 3,
      browserFact: { using: { kind: 'profile', label: '工作', state: 'running' }, pinned: { id: 'bp-1234abcd', label: '工作', origin: 'chosen' } } };
    const key = sb._getSessionStateKey(s);
    if (!app._browserProfiles) app._browserProfiles = { profiles: [{ id: 'bp-1234abcd', label: '工作', scope: 'all' }], leases: [] };
    sb.setSessionConfig(s, { ...(sb.getSessionConfig(s) || {}), model: 'opus', effort: 'high', permission: 'acceptEdits' });
    const gs = ((await (await fetch('/api/tasks')).json()).tasks || []).filter((g) => !g.archived);
    for (const g of gs) await fetch('/api/tasks/' + g.id + '/bind', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionKey: key }) });
    for (const [state, reason] of [['working', '读简报'], ['blocked', '等回复'], ['working', '量尺寸'], ['review', '等验证'], ['working', '修 body'], ['done', '已提交']])
      await fetch('/api/session-status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionKey: key, state, reason }) });
    window.__spw = app.openSessionProps(s);
    return { groups: gs.length, win: !!window.__spw };
  })()`);
  check('setup: a live session in every Task Group (≥ 4), config overrides, a browser block and a status history', !!sp && sp.win && sp.groups >= 4, sp);
  const SPB = `window.__spw.content.querySelector('.session-props > .task-detail-body')`;
  await until(() => D.ev(`(() => { const b = ${SPB}; return !!b && b.querySelectorAll('.session-history-item').length >= 3 && b.querySelectorAll('.session-props-group input:checked').length >= 4 && !!b.querySelector('.session-props-browser'); })()`), 15000);
  await sleep(600);
  const spGeo = () => D.ev(`(() => { const w = window.__spw; const root = w.content.querySelector('.session-props'); const b = root.querySelector(':scope > .task-detail-body');
    const c = w.content.getBoundingClientRect(); const e = w.element.getBoundingClientRect();
    const sc = b || root; const secs = [...root.querySelectorAll('.task-detail-section')].map((n) => n.getBoundingClientRect());
    const head = root.querySelector('.task-detail-label').getBoundingClientRect();
    const chg = [...root.querySelectorAll('.task-detail-btn')].find((n) => /更改/.test(n.textContent));
    const cbs = [...root.querySelectorAll('.session-props-group input')].map((n) => Math.round(n.getBoundingClientRect().left - c.left));
    const labels = [...root.querySelectorAll('.session-detail-label')].map((n) => Math.round(n.getBoundingClientRect().width));
    const values = [...root.querySelectorAll('.session-detail-row > .session-detail-value')].map((n) => Math.round(n.getBoundingClientRect().left - c.left));
    return { win: [Math.round(e.width), Math.round(e.height)], onBody: b ? b.querySelectorAll(':scope > .task-detail-section').length : 0, onRoot: root.querySelectorAll(':scope > .task-detail-section').length,
      sH: sc.scrollHeight, cH: sc.clientHeight, cw: Math.round(c.width), headL: Math.round(head.left - c.left), headT: Math.round(head.top - c.top),
      chgR: chg ? Math.round(c.right - chg.getBoundingClientRect().right) : null, cbs, gaps: secs.slice(1).map((r, i) => Math.round(r.top - secs[i].bottom)),
      labels: [...new Set(labels)], values: [...new Set(values)] }; })()`);
  const g0 = await spGeo();
  check('Session Properties opens at 440 × 620 with EVERY section in ONE .task-detail-body under the .task-detail root (none on the root)', !!g0 && g0.win[0] === 440 && g0.win[1] === 620 && g0.onBody >= 8 && g0.onRoot === 0, g0);
  check(`the owner's shape is taller than the window and the body scrolls (scrollHeight ${g0 && g0.sH} > clientHeight ${g0 && g0.cH})`, !!g0 && g0.sH > g0.cH + 200, g0);
  check(`the first section label sits inside the padding (${g0 && g0.headL} px from the content's left edge, ${g0 && g0.headT} px from its top; ≥ 10 / ≥ 8)`, !!g0 && g0.headL >= 10 && g0.headT >= 8, g0);
  check(`«更改…» ends inside the padding (${g0 && g0.chgR} px from the content's right edge, ≥ 10) and the 任务组 checkboxes start ≥ 10 px in (${g0 && g0.cbs.join(',')})`, !!g0 && g0.chgR >= 10 && g0.cbs.length >= 4 && g0.cbs.every((x) => x >= 10), g0);
  check(`consecutive sections are ≥ 8 px apart (${g0 && g0.gaps.join(',')})`, !!g0 && g0.gaps.length >= 7 && g0.gaps.every((x) => x >= 8), g0);
  check(`the label column is ONE declared width (${g0 && g0.labels.join(',')} px) and every value starts on one line x (${g0 && g0.values.join(',')})`, !!g0 && g0.labels.length === 1 && g0.labels[0] === 72 && g0.values.length === 1, g0);
  const st400 = await D.ev(`(() => { const b = ${SPB}; b.scrollTop = 400; return b.scrollTop; })()`);
  check(`setting scrollTop = 400 moves it (${st400})`, st400 === 400, st400);
  // a REAL wheel over the body (the pointer moved there first)
  const wpt = await D.ev(`(() => { const b = ${SPB}; b.scrollTop = 0; const r = b.getBoundingClientRect(); const x = r.left + 40, y = r.bottom - 60; const hit = document.elementFromPoint(x, y); return { x, y, inside: !!hit && b.contains(hit) }; })()`);
  await D.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wpt.x, y: wpt.y });
  await D.S('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wpt.x, y: wpt.y, deltaX: 0, deltaY: 300 });
  const wheeled = await until(() => D.ev(`${SPB}.scrollTop > 0 ? ${SPB}.scrollTop : null`), 3000, 100);
  check(`a real mouse wheel over the body scrolls it (scrollTop ${wheeled})`, wpt.inside && wheeled >= 100, { wpt, wheeled });
  await shot(D.S, 'desk-session-props.png');
  // the window re-renders on every broadcast (a working session ⇒ every few seconds): the reader keeps their place
  const spKept = await D.ev(`(async () => { const b = ${SPB}; b.scrollTop = 400; const i = document.createElement('i'); i.id = 'sp-body-sentinel'; b.appendChild(i);
    [...app.ws.globalHandlers].forEach((h) => { try { h({ type: 'tasks-updated' }); } catch { } });
    await new Promise((r) => setTimeout(r, 900));
    const at = b.scrollTop; await new Promise((r) => setTimeout(r, 1200));
    return { rebuilt: !document.getElementById('sp-body-sentinel'), at, later: b.scrollTop, same: b === ${SPB} }; })()`);
  check(`a broadcast re-render rebuilds the body (the sentinel is gone) and keeps the reader at 400 (${spKept && spKept.at} → ${spKept && spKept.later})`, !!spKept && spKept.rebuilt && spKept.same && Math.abs(spKept.at - 400) <= 1 && Math.abs(spKept.later - 400) <= 1, spKept);
  // …and when the history answers SLOWLY (the rebuilt window is laid out before the list refills — on .345 the list shrank to
  // «Loading history…» at that moment and the view under it jumped by the list's height, 160 px in ja): the old height is held
  const spSlow = await D.ev(`(async () => {
    const b = ${SPB}; const realFetch = window.fetch; let slowed = 0;
    window.fetch = function (u) { if (String(u).includes('/api/session-status/history')) { slowed++; const args = arguments, self = this; return new Promise((r) => setTimeout(r, 700)).then(() => realFetch.apply(self, args)); } return realFetch.apply(this, arguments); };
    const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const mark = () => { const n = [...b.querySelectorAll('.task-detail-section > .task-detail-label')].find((l) => /任务组|Task Groups|タスクグループ/.test(l.textContent)); return Math.round(n.getBoundingClientRect().top - b.getBoundingClientRect().top); };
    const histH = () => { const h = b.querySelector('.session-history-list'); return h ? Math.round(h.getBoundingClientRect().height) : null; };
    try {
      b.scrollTop = 400; await frames();
      const before = mark(), h0 = histH();
      [...app.ws.globalHandlers].forEach((h) => { try { h({ type: 'tasks-updated' }); } catch { } });
      await new Promise((r) => setTimeout(r, 650)); await frames();
      const mid = mark(), hMid = histH(), loading = /Loading|加载|読み込み/.test(b.querySelector('.session-history-list').textContent);
      await new Promise((r) => setTimeout(r, 1200)); await frames();
      return { slowed, before, mid, after: mark(), top: b.scrollTop, h0, hMid, loading, held: (b.querySelector('.session-history-list').style.minHeight || '') };
    } finally { window.fetch = realFetch; }
  })()`);
  check(`a re-render whose history answers 700 ms late keeps the view still (the 任务组 header ${spSlow && spSlow.before} → ${spSlow && spSlow.mid} → ${spSlow && spSlow.after} px): the refilling list holds its old height (${spSlow && spSlow.h0} → ${spSlow && spSlow.hMid}) and lets go once it paints`,
    !!spSlow && spSlow.slowed >= 1 && spSlow.loading && spSlow.mid === spSlow.before && Math.abs(spSlow.after - spSlow.before) <= 1 && spSlow.hMid === spSlow.h0 && spSlow.held === '', spSlow);
  // NEGATIVE CONTROL: the same window with the body's class taken off — the 2.369.348 shape — fails the same measures
  const ctl = await D.ev(`(async () => { const b = ${SPB}; b.className = ''; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const root = window.__spw.content.querySelector('.session-props'); const c = window.__spw.content.getBoundingClientRect();
    b.scrollTop = 400; root.scrollTop = 400; const out = { bodyTop: b.scrollTop, rootTop: root.scrollTop, headL: Math.round(root.querySelector('.task-detail-label').getBoundingClientRect().left - c.left) };
    b.className = 'task-detail-body'; return out; })()`);
  check(`NEGATIVE CONTROL: without the body class (the 2.369.348 shape) nothing scrolls and the first label touches the edge (${JSON.stringify(ctl)})`, !!ctl && ctl.bodyTop === 0 && ctl.rootTop === 0 && ctl.headL < 10, ctl);
  await D.ev(`(app.wm.closeWindow(window.__spw.id), true)`);

  // ════ phone 390 ════
  console.log('── phone 390 (zh) ──');
  const P = await newPage(390, 844, true);
  check('phone: the app is up', !!P.ready);
  await P.ev(`(app.openTaskDetail(${JSON.stringify(ir.id)}), true)`);
  // the desk left its window on 成员 and the layout sync carried it here: open 设置 with a tap
  await until(() => P.ev(`!!(${W(ir.id)})`), 10000);
  const tapTab = await centre(P.ev, IN(ir.id, '.task-detail-tabs .sidebar-subtab[data-tab="settings"]'));
  if (tapTab) { await P.S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tapTab.x, y: tapTab.y }] }); await P.S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  const phone = await until(() => P.ev(`(() => { const w = ${W(ir.id)}; if (!w) return null; const el = w.element.querySelector('.task-detail'); const rows = [...el.querySelectorAll('.ctx-row:not(.ctx-headrow)')]; if (!rows.length) return null;
    const over = [...el.querySelectorAll('.ctx-row, .ctx-cell, .task-detail-preview, .ctx-add-input')].filter((n) => n.getBoundingClientRect().right > innerWidth + 1).length;
    return { narrow: el.classList.contains('narrow'), head: getComputedStyle(el.querySelector('.ctx-headrow')).display, cols: getComputedStyle(rows[0]).gridTemplateColumns.split(' ').length, over, vw: innerWidth }; })()`), 20000);
  check('phone: one card per Context row (the narrow layout, no column header), nothing wider than the viewport', !!phone && phone.narrow && phone.head === 'none' && phone.cols === 2 && phone.over === 0, phone);
  await shot(P.S, 'phone.png');

  check('no page error on either client', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
} finally {
  if (failed) console.error(srvLog.join('').slice(-1500));
  cleanup();
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
