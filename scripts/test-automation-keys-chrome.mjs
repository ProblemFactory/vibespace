#!/usr/bin/env node
// VIBESPACE'S OWN AUTOMATION KEYS ON A REAL HUB (heavy: a worktree hub, a stub claude behind the real chat wrapper, headless
// Chrome — design q-046 L1, lane automation-keys-core). The whole chain, end to end:
//   ① the vault set up from the page · ② a LIVE conversation through the real spawn (its own vsst_ in the stub's env)
//   ③ the Vault window's «自动化 key»: 铸造… (a name + 给对话改名) ⇒ the row: its name, its verb, 「显示」's help says why (lane vault-window-v2: never a line beside it),
//      no grant yet — and no value anywhere in the page
//   ④ THE FIRST USE: the conversation runs the REAL `vibespace-api call conversations.rename` with no grant ⇒ ONE urgent card
//      in For you; the person presses 「一直（授权给这个会话）」 in the tray ⇒ the waiting call renames the conversation (the
//      session list's broadcast says so) and the CLI prints ok
//   ⑤ THE AUDIT: exactly two lines for that conversation (the grant, the rename — asked: always), names only; `vibespace-api
//      audit` prints them
//   ⑥ 授权给… (the picker, multi-select): unchecked ⇒ the grant goes; checked ⇒ it is back
//   ⑦ 显示 ⇒ 验证是你 ⇒ the value (vsak_…) in ITS row only, nothing said beside it as a state; the vault's audit has the reveal
//   ⑧ THE LOCK ⇒ the door answers 423 vault_locked and the CLI exits 3 saying so; the unlock ⇒ it works again
//   ⑨ 撤销 ⇒ the row goes, the CLI's `keys` says nothing is granted · ⑩ the words in Japanese (自動化キー / 発行…)
//   ⑨b THE LIMITS (lane automation-open-limits — the q-048 verify's M2): 铸造… with 开一个对话 ticked shows the limits (absent
//      until then): a folder picked in the hub's file tree (type a path, open a subfolder, ↑, 加入这个文件夹), the CLI's own
//      login, 跳过确认 beside CLI 自己的设置 ⇒ the row's limits line and the hub's record; 编辑… edits them (another folder, 终端);
//      a key minted before limits reads as folderless 「未设边界」 (refuses every open) and its first 编辑… sets them; the CLI's open outside ⇒ refused naming the
//      — q-049 M2 (lane automation-open-permission-resolve): the picker's `default` row says 「CLI 自己的设置（现在是 X）」 — 铸造… resolved for the
//      hub's own folder (内置默认), 编辑… for the key's first folder (its project settings say acceptEdits ⇒ 自动接受编辑, the file as its title)
//      limits; 审计… lists that refused open with its code
//   THE GRANT'S REACH (lane key-instance-scope — the owner 2026-10-20 「key 应该可以被授权在整个 vibe space 上工作」): ④ the card offers
//      作用范围 beside its answers — 只有它开的会话 (checked) · 整个 VibeSpace (red, its title says it reaches your own conversations
//      too; no Task Group row for a conversation in none); ⑥ the key row's 授权给 chip carries the reach as a chip — a click opens
//      the reach dialog, 整个 VibeSpace + 保存 ⇒ the chip is red with its title and the hub's grant row says instance; a grant the
//      picker adds reads 只有它开的会话; ⑩ the chip's Japanese word
//   ⑥b 编辑… (lane key-folder-picker-all — the owner 2026-10-21): the key's row edits its VERBS — the mint's 9 checkboxes, its own
//      ticked; 把 agent 的反馈标为已处理 + 读 agent 未处理的反馈 added ⇒ the row says them, the REAL `vibespace-api call feedback.list`
//      runs at once on the existing grant (no card: its audit line was never asked); taken away ⇒ the next call refused by
//      name (verb_not_in_scope) · ⑨c 「所有路径」: 铸造… offers it above the browser (red, its title says your home is in it) ⇒
//      the record holds exactly ['/'], the row says 「文件夹: 所有路径」, the first-use card says 所有路径; 编辑… round-trips it
//      (一个文件夹 及子文件夹 ⇔ 所有路径); a folder chip and the row say 及子文件夹
//   ⑪ MANY GRANTS (lane vault-key-row-compact — the owner 2026-10-21 05:4xZ: 「授权很多的时候，这个界面需要优化一下」): a key holding every
//      verb and unrestricted limits, granted to 2 then 12 (8 Task Groups, the live conversation, 3 ended conversations) — the row
//      does not grow (measured desk / phone, 2 vs 12), folded ≤ 120 px, never names the permission modes (任何, the names in the title),
//      the head counts (「9 个动作」 · 「授权给 12 个」; two lines in the 980-px window, ONE maximized), the limits in ONE line; the list
//      opens in place (groups › running › ended, dim 已结束, a kept name), scrolls inside the row (≤ 400 px opened), a filter past
//      eight, 清理已结束的授权 takes EXACTLY the 3 (one audit line), stays open; the verbs popover by family + 编辑…; the 需要你 band's
//      head «<who> 用 key「Fleet」做「归档一个对话」被拒» over its cause (the count under ONE fold) and the tray's same head; phones 390×844
//      and 375×812: two head lines, every door ≥ 36 px on screen, the list scrolls inside the row. RED CONTROL: this leg on the base
//      tree (the lane's base.sh) — 818 px, the modes named, every grant drawn
// Run: node scripts/test-automation-keys-chrome.mjs   (AK_SHOTS=<dir> keeps the 1280×800 screenshots; SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const BASE = `http://127.0.0.1:${PORT}`;
const wt = scratch('ak-chrome-wt'), stubDir = scratch('ak-chrome-stub'), fakeHome = scratch('ak-chrome-home'), CWD = scratch('ak-chrome-cwd');
const SHOTS = process.env.AK_SHOTS ? path.resolve(process.env.AK_SHOTS) : '';
for (const d of [stubDir, fakeHome, CWD, ...(SHOTS ? [SHOTS] : [])]) fs.mkdirSync(d, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECOND = 'automation leg second password';
const LIVE_SID = crypto.randomUUID();

// ── a throwaway hub: the committed tree + this tree's src / public / data/bin (the CLI ships there) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
execSync(`rm -rf ${wt}/data/bin && mkdir -p ${wt}/data && cp -r ${repo}/data/bin ${wt}/data/bin`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify(process.env));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: ${JSON.stringify(LIVE_SID)}, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' }) + '\\n');
process.stdin.on('data', () => {});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 80; i++) { try { await fetch(`${BASE}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map();
sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, ms = 15000) => { const t0 = Date.now(); let v = null; while (Date.now() - t0 < ms) { try { v = await evalJs(expr); } catch { v = null; } if (v) return v; await sleep(150); } return v; };
const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;
const click = (sel) => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
const clickWait = (sel, ms = 10000) => until(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`, ms); // poll until the target exists, then click (the dialog renders late under load)
const typeInto = (sel, text) => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; i.focus(); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const textOf = (sel) => evalJs(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
const api = (method, p, body) => evalJs(`fetch(${JSON.stringify(p)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))`);
const pageText = () => evalJs(`document.documentElement.outerHTML + '\\n' + [...document.querySelectorAll('input, textarea')].map((i) => i.value).join('\\n')`);
const shot = async (name) => { if (!SHOTS) return; const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); };
const load = async (lang) => {
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `${BASE}/` });
  await until(`!!(window.app && window.app.ready)`, 30000);
  await evalJs('app.ready');
  await until(`!document.getElementById('loading-screen')`, 30000);
  void lang;
};
const ROW = '.vw-row[data-store="automation"]';
// lane vault-window-v2: the window groups by PURPOSE and 全部 draws a purpose only when it holds a row — the rail's «自动化 key» opens
// the purpose itself (its head with 铸造… even while it is empty)
const openWindow = async () => { await evalJs(`app.replayOpenSpec({ action: 'openVault' })`); if (!(await until(visible('.vw-rail-item[data-purpose="automation"]'), 15000))) return false; await click('.vw-rail-item[data-purpose="automation"]'); return until(visible('.vw-group[data-purpose="automation"]'), 15000); };
// lane vault-window-v2: wait until the old window has LEFT the page — openWindow then reads the new one's rail and head (a
// closing window's rail answered the click and its rows the next read: the new window had not drawn yet)
const closeWindows = async () => { await evalJs(`(() => { for (const [id, w] of app.wm.windows) if (w && w.type === 'vault') app.wm.closeWindow(id); return true; })()`); return until(`!document.querySelector('.vw')`, 5000); };
const cli = (args, { token }) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-api'), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: BASE, VIBESPACE_SESSION_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => resolve({ code, out, err }));
});

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!localStorage.getItem('ak-lang-set')) { localStorage.setItem('vibespace.lang', 'zh'); localStorage.setItem('ak-lang-set', '1'); } } catch {}` });
  await load();

  console.log('① the vault set up from the page');
  const su = await api('POST', '/api/vault/setup', { password: SECOND });
  check('the second password set ⇒ the vault is unlocked', su && su.status === 200 && su.json && su.json.state === 'unlocked', su);

  console.log('② a LIVE conversation through the real spawn path');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws.on('open', r));
  const frames = [];
  ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'ak1' }));
  let wid = null;
  for (let i = 0; i < 80 && !wid; i++) { const f = frames.find((m) => m && m.type === 'created'); if (f) wid = f.sessionId; else await sleep(250); }
  let token = null;
  for (let i = 0; i < 80 && !token; i++) { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) token = e.VIBESPACE_SESSION_TOKEN; } catch {} } if (!token) await sleep(250); }
  const live = async () => { for (let i = 0; i < 80; i++) { const s = [...frames].reverse().find((m) => m && m.type === 'active-sessions'); const me = s && (s.sessions || []).find((x) => x && (x.backendSessionId === LIVE_SID || x.claudeSessionId === LIVE_SID)); if (me) return me; await sleep(250); } return null; };
  check('a live claude chat session (stub CLI behind the real wrapper), its own vsst_ in its env, its conversation id known', !!wid && !!token && token.startsWith('vsst_') && !!(await live()), { wid, token: !!token });

  console.log('③ the Vault window: 铸造… an automation key');
  check('the window opens on «自动化 key» (a group head with 铸造…)', !!(await openWindow()) && (await textOf('.vw-group[data-purpose="automation"] .vw-group-name')) === '自动化 key' && (await textOf('.vw-ak-mint')) === '铸造…');
  await click('.vw-ak-mint');
  check('铸造… opens its dialog: a name and the closed table of verbs (开一个对话 says it bills)', !!(await until(visible('#vault-ak-mint'), 5000)) && /（会开始一个计费回合）/.test(await textOf('#vault-ak-mint')) && (await evalJs(`document.querySelectorAll('#vault-ak-mint .vw-ak-verbs .vw-ak-pick input[type=checkbox]').length`)) === 9 && !(await evalJs(visible('#vault-ak-mint .vw-ak-limwrap')))); // lane automation-verbs: + conversations.status (a read); lane feedback-handled-verb: + feedback.handled, feedback.list; lane conversations-archive-verb: + conversations.archive (re-pinned by lane key-instance-scope)
  await typeInto('#vault-ak-mint .vw-ak-name', 'Lane dispatch');
  await evalJs(`(() => { const c = document.querySelector('#vault-ak-mint input[value="conversations.rename"]'); c.checked = true; return true; })()`);
  await click('.vw-ak-mint-go');
  const row = await until(`(() => { const r = document.querySelector(${JSON.stringify(ROW)}); return r ? { label: r.querySelector('.vw-label').textContent, why: (r.querySelector('.vw-show') || {}).title, line: r.querySelectorAll('.vw-ak-why').length, none: (r.querySelector('.vw-ak-none') || {}).textContent, scopes: (r.querySelector('.vw-ak-verbs-chip') || {}).textContent } : null; })()`, 15000);
  check('the row: the key\'s name, its verbs COUNTED in the head (「1 个动作」 — lane vault-key-row-compact), the reason as 「显示」\'s HELP (lane vault-window-v2 — the owner read the old line beside it as the key\'s state), no grant yet', row && row.label === 'Lane dispatch' && row.why === '显示密钥值——只在要交给外部系统时；内部 agent 按授权使用，不需要看到值' && row.line === 0 && row.scopes === '1 个动作' && row.none === '还没有授权给任何会话或任务组', row);
  check('no value anywhere in the page (markup + every input)', !/vsak_/.test(await pageText()));
  await evalJs(`(() => { document.querySelector('.vw-group[data-purpose="automation"]').scrollIntoView({ block: 'start' }); return true; })()`);
  await shot('ak-1-window.png');

  console.log('④ THE FIRST USE — the real CLI, no grant ⇒ the card ⇒ 一直');
  const call = cli(['call', 'conversations.rename', '--name', '自动改名'], { token });
  await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`);
  const card = await until(`(() => { const b = document.querySelector('#user-todos-popup .ut-item .ut-hub-always'); if (!b) return null; const it = b.closest('.ut-item'); return { always: b.textContent, once: (it.querySelector('.ut-hub-once') || {}).textContent, deny: (it.querySelector('.ut-hub-deny') || {}).textContent, text: (it.querySelector('.ut-text') || {}).textContent,
    lbl: (it.querySelector('.ut-ak-reach-lbl') || {}).textContent, reach: [...it.querySelectorAll('.ut-ak-reach label')].map((l) => ({ text: l.textContent.trim(), value: l.querySelector('input').value, checked: l.querySelector('input').checked, red: l.classList.contains('ut-ak-reach-instance'), title: l.title })) }; })()`, 20000);
  const early = card ? null : await Promise.race([call, sleep(3000).then(() => 'still waiting')]);
  check('ONE urgent card in For you — 「允许一次 / 一直（授权给这个会话） / 拒绝」, naming the key and the verb', card && card.always === '一直（授权给这个会话）' && card.once === '允许一次' && card.deny === '拒绝' && /Lane dispatch/.test(card.text) && /conversations\.rename/.test(card.text), card || { cli: early, items: await api('GET', '/api/user-todos') });
  check('the card offers the REACH beside its answers (lane key-instance-scope): 作用范围 — 只有它开的会话 (checked) · 整个 VibeSpace (red; its title says it reaches your own conversations too); no Task Group row for a conversation in none',
    card && card.lbl === '作用范围' && card.reach.length === 2 && card.reach[0].text === '只有它开的会话' && card.reach[0].value === 'opened' && card.reach[0].checked && !card.reach[0].red && card.reach[1].text === '整个 VibeSpace' && card.reach[1].value === 'instance' && card.reach[1].red && card.reach[1].title === '这把 key 可以对这里的每一个会话动手，包括你自己的', card && { lbl: card.lbl, reach: card.reach });
  if (!card) throw new Error('no card — the legs below need it');
  await shot('ak-2-card.png');
  await sleep(1100);   // the press-arm: an Allow shown less than 700 ms ago is not the one the person read
  await evalJs(`(() => { const b = document.querySelector('#user-todos-popup .ut-item .ut-hub-always'); b.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(300);
  const at = await evalJs(`(() => { const r = document.querySelector('#user-todos-popup .ut-item .ut-hub-always').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  const res = await Promise.race([call, sleep(30000).then(() => ({ code: 'timeout' }))]);
  check('the waiting call ran: the CLI prints ok (exit 0)', res.code === 0 && /ok — conversations\.rename with key "Lane dispatch": now "自动改名"/.test(res.out), res);
  const me = await until(`true`, 100) && (await (async () => { for (let i = 0; i < 40; i++) { const s = [...frames].reverse().find((m) => m && m.type === 'active-sessions'); const x = s && (s.sessions || []).find((y) => y && (y.backendSessionId === LIVE_SID || y.claudeSessionId === LIVE_SID)); if (x && x.name === '自动改名') return x; await sleep(250); } return null; })());
  check('the conversation IS renamed — the session list\'s broadcast says 自动改名', !!me && me.name === '自动改名', me && me.name);

  console.log('⑤ THE AUDIT');
  const lines = fs.readFileSync(path.join(wt, 'data', 'automation-audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.subject === `session:${LIVE_SID}`);
  check('exactly two lines for that conversation: the grant (by the person) and the rename (ok, asked: always) — names only', lines.length === 2 && lines[0].verb === 'key.grant' && lines[1].verb === 'conversations.rename' && lines[1].ok && lines[1].ask === 'always' && lines[1].args.name === '自动改名' && !JSON.stringify(lines).includes('vsak_'), lines);
  const au = await cli(['audit'], { token });
  check('`vibespace-api audit` prints them (its own lines)', au.code === 0 && au.out.trim().split('\n').length === 2 && /conversations\.rename/.test(au.out), au);
  const ks = await cli(['keys'], { token });
  check('`vibespace-api keys` names the key and how it is held — never a value', ks.code === 0 && /Lane dispatch .* conversations\.rename — via session:/.test(ks.out) && !/vsak_/.test(ks.out), ks);

  console.log('⑥ 授权给… — the picker');
  await closeWindows(); await openWindow();
  // lane vault-key-row-compact: the head says 「授权给 1 个」; a press opens the grants list in place (one row per grant)
  check('the head counts the grant (「授权给 1 个」) and opens the list in place: the conversation\'s name', !!(await until(`(() => { const b = document.querySelector(${JSON.stringify(ROW + ' .vw-ak-grants-chip')}); if (!b || b.textContent !== '授权给 1 个') return false; const f = document.querySelector(${JSON.stringify(ROW + ' .vw-ak-gfold')}); if (f.hidden) b.click(); const c = document.querySelector(${JSON.stringify(ROW + ' .vw-ak-g')}); return !f.hidden && c && /自动改名/.test(c.textContent); })()`, 10000)));
  // lane key-instance-scope: the grant's REACH chip on the 授权给 chip — a click opens the reach dialog; 整个 VibeSpace is red and says what it means
  const chip0 = await evalJs(`(() => { const c = document.querySelector(${JSON.stringify(ROW + ' .vw-ak-g .vw-ak-reach')}); return c ? { text: c.textContent, reach: c.dataset.reach, red: c.classList.contains('vw-ak-reach-instance') } : null; })()`);
  check('…and its REACH chip: 只有它开的会话 (the card\'s default)', chip0 && chip0.text === '只有它开的会话' && chip0.reach === 'opened' && !chip0.red, chip0);
  await click(ROW + ' .vw-ak-g .vw-ak-reach');
  const dlgRows = (await until(visible('#vault-ak-reach'), 5000)) ? await evalJs(`[...document.querySelectorAll('#vault-ak-reach .vw-ak-reach-row')].map((r) => r.querySelector('span').textContent + ':' + r.querySelector('input').checked + ':' + r.classList.contains('vw-ak-reach-instance')).join('|')`) : null;
  check('the chip opens the reach dialog: 只有它开的会话 checked · 整个 VibeSpace red (no Task Group row — there is no Task Group here)', dlgRows === '只有它开的会话:true:false|整个 VibeSpace:false:true', dlgRows);
  await evalJs(`document.querySelector('#vault-ak-reach input[value="instance"]').click()`);
  await shot('ak-3b-reach-dialog.png');
  await click('.vw-ak-reach-save');
  const chip1 = await until(`(() => { const c = document.querySelector(${JSON.stringify(ROW + ' .vw-ak-g .vw-ak-reach-instance')}); return c ? { text: c.textContent, title: c.title, reach: c.dataset.reach } : null; })()`, 10000);
  const grantNow = (((await api('GET', '/api/automation/keys')).json || {}).keys || []).find((k) => k.name === 'Lane dispatch');
  check('整个 VibeSpace + 保存 ⇒ the chip is RED and its title says what it means; the hub\'s grant row holds reach: instance', chip1 && chip1.text === '整个 VibeSpace' && chip1.reach === 'instance' && chip1.title === '这把 key 可以对这里的每一个会话动手，包括你自己的' && grantNow && grantNow.grants[0] && grantNow.grants[0].reach === 'instance', { chip1, grants: grantNow && grantNow.grants });
  await shot('ak-3c-reach-chip.png');
  await click(ROW + ' .vw-ak-grant');
  const sel = `#vault-ak-grant input[value="session:${LIVE_SID}"]`;
  check('the picker lists the live conversation, checked', !!(await until(`(() => { const c = document.querySelector(${JSON.stringify(sel)}); return c && c.checked; })()`, 8000)));
  await shot('ak-3-picker.png');
  await evalJs(`(() => { document.querySelector(${JSON.stringify(sel)}).checked = false; return true; })()`);
  await click('.vw-ak-save');
  check('unchecked + 保存 ⇒ the grant goes (no chip)', !!(await until(`!document.querySelector(${JSON.stringify(ROW + ' .vw-ak-g')}) && !!document.querySelector(${JSON.stringify(ROW + ' .vw-ak-none')})`, 10000)));
  await click(ROW + ' .vw-ak-grant');
  await until(visible(sel), 8000);
  await evalJs(`(() => { document.querySelector(${JSON.stringify(sel)}).checked = true; return true; })()`);
  await click('.vw-ak-save');
  check('checked + 保存 ⇒ it is back', !!(await until(`!!document.querySelector(${JSON.stringify(ROW + ' .vw-ak-g')})`, 10000)));
  check('…a grant the picker adds reads 只有它开的会话 (the picker\'s default reach — lane key-instance-scope)', !!(await until(`(() => { const c = document.querySelector(${JSON.stringify(ROW + ' .vw-ak-g .vw-ak-reach')}); return c && c.dataset.reach === 'opened' && c.textContent === '只有它开的会话'; })()`, 10000)));

  console.log('⑥b 编辑… — the key\'s verbs after minting (lane key-folder-picker-all: a verb a later release added, given to a key already granted)');
  const auditLines = () => fs.readFileSync(path.join(wt, 'data', 'automation-audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  await clickWait(ROW + ' .vw-ak-edit');
  const editBoxes = await until(`(() => { const d = document.querySelector('#vault-ak-edit'); if (!d) return null; const cbs = [...d.querySelectorAll('.vw-ak-verbs input[type=checkbox]')]; const l = d.querySelector('.vw-ak-limwrap'); const r = l && l.getBoundingClientRect(); return cbs.length ? { n: cbs.length, on: cbs.filter((c) => c.checked).map((c) => c.value).join(), hint: (d.querySelector('.vw-ak-grant-hint') || {}).textContent, title: (d.querySelector('h3') || {}).textContent, lim: !!(r && r.width && r.height) } : null; })()`, 8000);
  check('编辑… opens on the key\'s own verbs — the same 9 checkboxes as 铸造… (its own ticked, the others unticked), the grant hint, no limits (it does not open)',
    editBoxes && editBoxes.n === 9 && editBoxes.on === 'conversations.rename' && /授权是按「key × 会话」给的/.test(editBoxes.hint || '') && editBoxes.title === '编辑「Lane dispatch」' && !editBoxes.lim, editBoxes);
  await evalJs(`(() => { for (const v of ['feedback.handled', 'feedback.list']) document.querySelector('#vault-ak-edit input[value="' + v + '"]').click(); return true; })()`);
  await shot('ak-3b-edit-verbs.png');
  await clickWait('.vw-ak-edit-save');
  // lane vault-key-row-compact: the head counts them (「3 个动作」); the chip's popover lists them by family
  const scopesNow = await until(`(() => { const r = document.querySelector(${JSON.stringify(ROW)}); const x = r && r.querySelector('.vw-ak-verbs-chip'); if (!x || x.textContent !== '3 个动作') return null; if (!document.querySelector('.vw-ak-verbs-pop')) x.click(); const p = document.querySelector('.vw-ak-verbs-pop'); return p ? [...p.querySelectorAll('.vw-ak-vrow')].map((v) => v.textContent).join(' · ') : null; })()`, 10000);
  check('保存 ⇒ the row says the new verbs (「3 个动作」; its popover lists them)', scopesNow === '给对话改名 · 把 agent 的反馈标为已处理 · 读 agent 未处理的反馈', scopesNow);
  await evalJs(`(() => { const p = document.querySelector('.vw-ak-verbs-pop'); if (p) p.remove(); return true; })()`);
  const fl = await cli(['call', 'feedback.list'], { token });
  const flLines = auditLines().filter((l) => l.verb === 'feedback.list');
  check('a call with a verb ADDED runs at once on the existing grant: the real CLI prints ok — NO first-use card (its audit line was never asked)', fl.code === 0 && /^ok — feedback\.list with key "Lane dispatch"/.test(fl.out) && flLines.length === 1 && flLines[0].ok && !flLines[0].ask, { fl, flLines });
  const scl = auditLines().filter((l) => l.verb === 'key.scopes');
  check('the key\'s audit line says what changed: «scopes changed by the owner: +feedback.handled +feedback.list»', scl.length === 1 && scl[0].note === 'scopes changed by the owner: +feedback.handled +feedback.list' && scl[0].subject === 'owner', scl);
  await clickWait(ROW + ' .vw-ak-edit');
  check('编辑… again: the added verbs are ticked now', (await until(`(() => { const d = document.querySelector('#vault-ak-edit'); return d ? [...d.querySelectorAll('.vw-ak-verbs input')].filter((c) => c.checked).map((c) => c.value).join() : null; })()`, 8000)) === 'conversations.rename,feedback.handled,feedback.list');
  await evalJs(`(() => { document.querySelector('#vault-ak-edit input[value="feedback.list"]').click(); return true; })()`);
  await clickWait('.vw-ak-edit-save');
  await until(`(() => { const r = document.querySelector(${JSON.stringify(ROW)}); const x = r && r.querySelector('.vw-ak-verbs-chip'); return !!x && x.textContent === '2 个动作'; })()`, 10000);
  const fl2 = await cli(['call', 'feedback.list'], { token });
  check('a verb taken away ⇒ the NEXT call is refused by name: exit 1, verb_not_in_scope, the key named', fl2.code === 1 && /\(verb_not_in_scope\)/.test(fl2.err) && /\(Lane dispatch\) does not hold feedback\.list/.test(fl2.err), fl2);

  console.log('⑦ 显示 ⇒ 验证是你 ⇒ the value, only to hand to an outside party');
  await click(ROW + ' .vw-show');
  check('「显示」 asks 验证是你', (await until(`document.querySelector('#vault-reveal-dialog h3')?.textContent`, 8000)) === '验证是你');
  await typeInto('#vault-reveal-pw', SECOND); await click('.vault-reveal-go');
  const plain = await until(`document.querySelector(${JSON.stringify(ROW + ' .vw-plain')})?.value`, 10000);
  check('the value appears in ITS row (vsak_ + 43); no sentence beside it reads as a state (lane vault-window-v2)', /^vsak_[A-Za-z0-9_-]{43}$/.test(plain || '') && (await evalJs(`document.querySelectorAll(${JSON.stringify(ROW + ' .vw-ak-why')}).length`)) === 0, plain && plain.slice(0, 5));
  await shot('ak-4-revealed.png');
  const va = fs.readFileSync(path.join(wt, 'data', 'vault-audit.jsonl'), 'utf8');
  check('the vault\'s audit has the reveal (store automation) — never the value', /"event":"vault-reveal".*"store":"automation"/.test(va) && !va.includes(plain), null);
  await click(ROW + ' .vw-show');

  console.log('⑧ THE LOCK ⇒ 423; the unlock ⇒ it works again');
  await api('POST', '/api/vault/lock');
  const door = await fetch(`${BASE}/api/agent/automation/conversations.rename`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'x' }) });
  const doorBody = await door.json().catch(() => ({}));
  const lk = await cli(['call', 'conversations.rename', '--name', 'locked'], { token });
  check('LOCKED: the door answers 423 vault_locked; the CLI exits 3 and says so', door.status === 423 && doorBody.code === 'vault_locked' && lk.code === 3 && /vault_locked/.test(lk.err), { status: door.status, cli: lk });
  await load();
  const un = await api('POST', '/api/vault/unlock', { password: SECOND });
  const again = await cli(['call', 'conversations.rename', '--name', '又一次'], { token });
  check('the person unlocks ⇒ the same call runs again (nothing cached across the lock)', un && un.status === 200 && again.code === 0, { un: un && un.status, again });

  console.log('⑨ 撤销');
  await closeWindows(); await openWindow();
  await until(visible(ROW + ' .vw-ak-revoke'), 8000);
  await click(ROW + ' .vw-ak-revoke');
  await until(visible('.dialog-footer .btn-create.danger'), 5000);
  await click('.dialog-footer .btn-create.danger');
  check('撤销 (confirmed) ⇒ the row leaves the window', !!(await until(`!document.querySelector(${JSON.stringify(ROW)})`, 10000)));
  const ks2 = await cli(['keys'], { token });
  const gone = await cli(['call', 'conversations.rename', '--name', 'x'], { token });
  check('the CLI\'s keys says nothing is granted; a call is refused (not_granted)', /no key is granted/.test(ks2.out) && gone.code === 1 && /not_granted/.test(gone.err), { ks2, gone });

  console.log('⑨b THE LIMITS — mint with limits, 编辑…, 「未设边界」 (q-049 M1 fail closed), the refused open in 审计…');
  const SUB = path.join(CWD, 'lane-sub');
  fs.mkdirSync(SUB, { recursive: true });
  // q-049 M2: the conversation folder's own project settings say acceptEdits — what a key's `default` IS there
  fs.mkdirSync(path.join(CWD, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(CWD, '.claude/settings.json'), JSON.stringify({ permissions: { defaultMode: 'acceptEdits' } }));
  await closeWindows(); await openWindow();
  await click('.vw-ak-mint');
  await until(visible('#vault-ak-mint'), 5000);
  await typeInto('#vault-ak-mint .vw-ak-name', 'Opener');
  await evalJs(`document.querySelector('#vault-ak-mint input[value="conversations.open"]').click()`);
  const mintDefaultRow = await until(`(() => { const i = document.querySelector('#vault-ak-mint .vw-ak-perms input[value="default"]'); return i ? { words: i.parentNode.textContent, title: i.parentNode.title, now: i.parentNode.dataset.now } : null; })()`, 5000);
  check('铸造…: the `default` row says what the CLI\'s own setting is NOW for the hub\'s own folder — no settings file there ⇒ 「CLI 自己的设置（现在是 内置默认）」', mintDefaultRow && mintDefaultRow.words === 'CLI 自己的设置（现在是 内置默认）' && mintDefaultRow.now === 'default' && /没有设置文件/.test(mintDefaultRow.title), mintDefaultRow);
  check('ticking 开一个对话 shows the limits (folders · accounts · permission modes · models · modes) — absent before',
    !!(await until(visible('#vault-ak-mint .vw-ak-limwrap'), 3000)) && (await textOf('#vault-ak-mint .vw-ak-limwrap')).includes('它开的对话能用什么') && (await evalJs(`[...document.querySelectorAll('#vault-ak-mint .vw-ak-limits .vw-ak-sec')].map((e) => e.textContent).join('|')`)) === '文件夹|账号|权限模式|模型|模式');
  // lane key-folder-picker-all: two choices above the browser — 所有路径 (red, its title) / 只有这些文件夹（含子文件夹） (checked: a fresh key picks)
  const seg = await evalJs(`(() => { const d = document.querySelector('#vault-ak-mint'); const all = d.querySelector('.vw-ak-seg .vw-ak-allpaths'), some = d.querySelector('.vw-ak-seg .vw-ak-somepaths'); return all && some ? { all: all.textContent, allOn: all.querySelector('input').checked, title: all.title, red: (() => { const probe = document.createElement('span'); probe.style.color = 'var(--bad-text)'; d.append(probe); const want = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(all).color === want && want !== getComputedStyle(some).color; })(), some: some.textContent, someOn: some.querySelector('input').checked, add: d.querySelector('.vw-ak-add-root').textContent } : null; })()`);
  check('铸造…\'s folders: 「所有路径」 (red-tinted, its title «这台 VibeSpace 上的任何文件夹，包括你的主目录») above 「只有这些文件夹（含子文件夹）」 (picked — a fresh key has no folder); the add button says 「加入这个文件夹及其子文件夹」',
    seg && seg.all === '所有路径' && !seg.allOn && seg.title === '这台 VibeSpace 上的任何文件夹，包括你的主目录' && seg.red && seg.some === '只有这些文件夹（含子文件夹）' && seg.someOn && seg.add === '加入这个文件夹及其子文件夹', seg);
  // the folder picker over the hub's file tree: type a path ⇒ its subfolders; open one; ↑ back; 加入这个文件夹及其子文件夹
  await evalJs(`(() => { const i = document.querySelector('#vault-ak-mint .vw-ak-path'); i.value = ${JSON.stringify(CWD)}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  const subBtn = `#vault-ak-mint .vw-ak-dir[data-path="${SUB}"]`;
  check('a typed path lists its subfolders (the hub\'s file tree)', !!(await until(visible(subBtn), 8000)));
  await click(subBtn);
  check('a subfolder opens', (await until(`document.querySelector('#vault-ak-mint .vw-ak-path').value === ${JSON.stringify(SUB)}`, 8000)) === true);
  await click('#vault-ak-mint .vw-ak-up');
  check('↑ goes back up', (await until(`document.querySelector('#vault-ak-mint .vw-ak-path').value === ${JSON.stringify(CWD)}`, 8000)) === true);
  await click('#vault-ak-mint .vw-ak-add-root');
  check('加入这个文件夹及其子文件夹 ⇒ a folder chip that says 「… 及子文件夹」', (await until(`(document.querySelector('#vault-ak-mint .vw-ak-root[data-root="${CWD}"]') || {}).textContent`, 3000)) === `${CWD}及子文件夹✕`);
  check('a fresh key: no account picked, 默认 the only permission mode, any model, chat',
    (await evalJs(`(() => { const d = document.querySelector('#vault-ak-mint'); const on = (sel) => [...d.querySelectorAll(sel)].filter((c) => c.checked).map((c) => c.value).join(); return [on('.vw-ak-accts input'), d.querySelector('.vw-ak-acct-any input').checked, on('.vw-ak-perms input'), d.querySelector('.vw-ak-model-any input').checked, on('.vw-ak-modes input')].join('|'); })()`)) === '|false|default|true|chat');
  await evalJs(`document.querySelector('#vault-ak-mint .vw-ak-accts input[value="subscription"]').click()`);
  await evalJs(`document.querySelector('#vault-ak-mint .vw-ak-perms input[value="bypassPermissions"]').click()`);
  await evalJs(`(() => { const b = document.querySelector('#vault-ak-mint .vw-ak-dialog .dialog-body, #vault-ak-mint .dialog-body'); if (b) b.scrollTop = 0; return true; })()`);
  await shot('ak-6-mint-limits.png');
  await evalJs(`(() => { const b = document.querySelector('#vault-ak-mint .dialog-body'); if (b) b.scrollTop = b.scrollHeight; return true; })()`);
  await shot('ak-6b-mint-limits-lower.png');
  await click('.vw-ak-mint-go');
  const OPENER = `${ROW}:has(.vw-ak-limits-line)`;   // the one live key that opens (Lane dispatch was revoked in ⑨)
  const line = await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => x.querySelector('.vw-label').textContent === 'Opener'); return r && r.querySelector('.vw-ak-limits-line') ? [...r.querySelectorAll('.vw-ak-limits-line .vw-ak-lim')].map((e) => e.textContent).join(' · ') : null; })()`, 10000);
  check('the row says what its conversations may use (one line per field): the folder, the CLI\'s own login, CLI 自己的设置 + 跳过确认, any model, chat', line === `文件夹: ${CWD} 及子文件夹 · 账号: CLI 自己的登录 · 权限模式: CLI 自己的设置, 跳过确认 · 模型: 任何 · 模式: 聊天`, line);
  const keysNow = async () => ((await api('GET', '/api/automation/keys')).json || {}).keys || [];
  const opener = (await keysNow()).find((k) => k.name === 'Opener');
  check('…and the hub\'s record holds exactly that pick', opener && JSON.stringify(opener.limits) === JSON.stringify({ cwdRoots: [CWD], accounts: ['subscription'], permissionModes: ['default', 'bypassPermissions'], models: 'any', modes: ['chat'] }), opener && opener.limits);
  await until(`(() => { const r = document.querySelector(${JSON.stringify(OPENER)}); if (!r) return false; r.scrollIntoView({ block: 'center' }); return true; })()`);
  await shot('ak-7-row-limits.png');
  // 编辑… (lane key-folder-picker-all; was 边界…) — another folder, terminal too
  await click(OPENER + ' .vw-ak-edit');
  check('编辑… opens on the key\'s own limits (its folder chip, its checks)', !!(await until(`!!document.querySelector('#vault-ak-edit .vw-ak-root[data-root="${CWD}"]') && document.querySelector('#vault-ak-edit .vw-ak-perms input[value="bypassPermissions"]').checked`, 5000)));
  const editDefaultRow = await until(`(() => { const i = document.querySelector('#vault-ak-edit .vw-ak-perms input[value="default"]'); return i ? { words: i.parentNode.textContent, title: i.parentNode.title, now: i.parentNode.dataset.now } : null; })()`, 5000);
  check('编辑…: the `default` row is resolved for the key\'s FIRST folder — its project settings say acceptEdits ⇒ 「CLI 自己的设置（现在是 自动接受编辑）」, the file as its title', editDefaultRow && editDefaultRow.words === 'CLI 自己的设置（现在是 自动接受编辑）' && editDefaultRow.now === 'acceptEdits' && editDefaultRow.title === `设在 ${CWD}/.claude/settings.json`, editDefaultRow);
  await clickWait(`#vault-ak-edit .vw-ak-root[data-root="${CWD}"] .vw-ak-x`); await until(`!document.querySelector('#vault-ak-edit .vw-ak-root[data-root="${CWD}"]')`);
  await evalJs(`(() => { const i = document.querySelector('#vault-ak-edit .vw-ak-path'); i.value = ${JSON.stringify(SUB)}; return true; })()`);
  await clickWait('#vault-ak-edit .vw-ak-add-root'); await until(`!!document.querySelector('#vault-ak-edit .vw-ak-root[data-root="${SUB}"]')`);
  await clickWait('#vault-ak-edit .vw-ak-modes input[value="terminal"]');
  await clickWait('.vw-ak-edit-save');
  const edited = await (async () => { for (let i = 0; i < 40; i++) { const k = (await keysNow()).find((x) => x.name === 'Opener'); if (k && k.limits && k.limits.cwdRoots[0] === SUB) return k.limits; await sleep(250); } return null; })();
  check('保存 ⇒ the hub holds the edit (the other folder, chat + terminal)', edited && edited.cwdRoots.join() === SUB && edited.modes.join() === 'chat,terminal', edited);
  // q-049 M1: a key minted BEFORE limits (record has no `limits` field) reads as folderless ⇒ 「未设边界」 (refuses every open); its first 编辑… sets them
  const legacy = await api('POST', '/api/automation/keys', { name: 'Legacy', scopes: ['conversations.open'], limits: { cwdRoots: [CWD], accounts: 'any' } });
  const store = path.join(wt, 'data', 'automation-keys.json');
  const st = JSON.parse(fs.readFileSync(store, 'utf8'));
  delete st.keys.find((k) => k.id === legacy.json.key.id).limits;   // the shape 2.369.323 wrote
  fs.writeFileSync(store, JSON.stringify(st), { mode: 0o600 });
  await closeWindows(); await openWindow();
  const chip = await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => x.querySelector('.vw-label').textContent === 'Legacy'); const c = r && r.querySelector('.vw-ak-unbounded'); return c ? { text: c.textContent, title: c.title, line: !!r.querySelector('.vw-ak-limits-line .vw-ak-lim') } : null; })()`, 10000);
  check('a key minted before limits shows 「未设边界」 (its title says every open is refused) and no limits line', chip && chip.text === '未设边界' && /会被拒/.test(chip.title) && !chip.line, chip);
  // the window re-renders on store broadcasts — re-find the ROW each poll and act only once it exists (wait for the EFFECT, never a sleep; the pre-fix bare .find().scrollIntoView() was RED under 4-lane load, int325 heavy)
  await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Legacy'); if (!r) return false; r.scrollIntoView({ block: 'center' }); return true; })()`);
  await shot('ak-8-unbounded.png');
  await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Legacy'); const b = r && r.querySelector('.vw-ak-edit'); if (!b) return false; b.click(); return true; })()`);
  const legacyLim = ((await keysNow()).find((k) => k.name === 'Legacy') || {}).limits;
  check('its 编辑… says these will be its FIRST limits (nothing changes until 保存)', !!(await until(visible('#vault-ak-edit .vw-ak-first'), 5000)) && legacyLim && legacyLim.cwdRoots.length === 0);
  await evalJs(`(() => { const i = document.querySelector('#vault-ak-edit .vw-ak-path'); i.value = ${JSON.stringify(CWD)}; return true; })()`);
  await clickWait('#vault-ak-edit .vw-ak-add-root'); await until(`!!document.querySelector('#vault-ak-edit .vw-ak-root[data-root="${CWD}"]')`);
  await clickWait('#vault-ak-edit .vw-ak-acct-any input');
  await clickWait('.vw-ak-edit-save');
  const firstSet = await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => x.querySelector('.vw-label').textContent === 'Legacy'); return r && !r.querySelector('.vw-ak-unbounded') && r.querySelector('.vw-ak-limits-line') ? [...r.querySelectorAll('.vw-ak-limits-line .vw-ak-lim')].map((e) => e.textContent).join(' · ') : null; })()`, 10000);
  check('…its first 保存 sets them: the chip gives way to the limits line', firstSet === `文件夹: ${CWD} 及子文件夹 · 账号: 任何 · 权限模式: CLI 自己的设置 · 模型: 任何 · 模式: 聊天`, firstSet);
  // the CLI's open outside the limits ⇒ refused naming them; 审计… lists it with its code
  await api('POST', `/api/automation/keys/${opener.id}/grants`, { subjects: [`session:${LIVE_SID}`] });
  const outside = await cli(['conversations', 'open', '--key', 'Opener', '--cwd', '/etc', '--name', 'nope'], { token });
  check('the conversation\'s open outside the key\'s folder ⇒ exit 1, cwd_outside_roots, the key\'s limits printed by name (chat + terminal = every mode ⇒ «modes any» — lane vault-key-row-compact)', outside.code === 1 && /\(cwd_outside_roots\)/.test(outside.err) && outside.err.includes(`this key's limits: folders ${SUB} (with subfolders) · accounts subscription · permission modes default, bypassPermissions · models any · modes any`), outside);
  await closeWindows(); await openWindow();
  await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Opener'); const b = r && r.querySelector('.vw-ak-audit'); if (!b) return false; b.click(); return true; })()`);
  const refusedLine = await until(`(() => { const l = document.querySelector('#vault-ak-audit .vw-ak-audit-line.vw-ak-refused[data-code="cwd_outside_roots"]'); return l ? { outcome: l.querySelector('.vw-ak-outcome').textContent, verb: l.querySelector('.vw-ak-verb').textContent, arg: (l.querySelector('.vw-ak-arg') || {}).textContent } : null; })()`, 8000);
  check('审计… lists the refused open: 开一个对话 · cwd_outside_roots · /etc', refusedLine && refusedLine.outcome === 'cwd_outside_roots' && refusedLine.verb === '开一个对话' && refusedLine.arg === '/etc', refusedLine);
  await shot('ak-9-audit.png');
  await evalJs(`(() => { const b = document.querySelector('#vault-ak-audit .btn-cancel'); if (b) b.click(); return true; })()`);

  console.log('⑨c 「所有路径」 (lane key-folder-picker-all) — mint it, the record, the row, the first-use card, 编辑… round trip');
  await closeWindows(); await openWindow();
  await clickWait('.vw-ak-mint');
  await until(visible('#vault-ak-mint'), 5000);
  await typeInto('#vault-ak-mint .vw-ak-name', 'Anywhere');
  await evalJs(`document.querySelector('#vault-ak-mint input[value="conversations.open"]').click()`);
  await until(visible('#vault-ak-mint .vw-ak-limwrap'), 3000);
  await evalJs(`document.querySelector('#vault-ak-mint .vw-ak-allpaths input').click()`);
  check('所有路径 picked ⇒ the folder browser is gone (absent, never greyed)', !(await evalJs(visible('#vault-ak-mint .vw-ak-some'))) && !(await evalJs(visible('#vault-ak-mint .vw-ak-add-root'))));
  await evalJs(`document.querySelector('#vault-ak-mint .vw-ak-acct-any input').click()`);
  await evalJs(`document.querySelector('#vault-ak-mint .vw-ak-perms input[value="acceptEdits"]').click()`);   // the folder's own setting (acceptEdits) — so the card is asked, not refused
  await shot('ak-10-mint-allpaths.png');
  await click('.vw-ak-mint-go');
  const anyRow = await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Anywhere'); const f = r && r.querySelector('.vw-ak-limits-line .vw-ak-lim'); return f ? { text: f.textContent, red: f.classList.contains('vw-ak-allpaths'), title: f.title } : null; })()`, 10000);
  const anyKey = (await keysNow()).find((k) => k.name === 'Anywhere');
  check('所有路径 ⇒ the hub\'s record holds exactly ["/"]', anyKey && JSON.stringify(anyKey.limits.cwdRoots) === '["/"]', anyKey && anyKey.limits);
  check('…and the row says 「文件夹: 所有路径」 (red, its title) — never a bare /', anyRow && anyRow.text === '文件夹: 所有路径' && anyRow.red && anyRow.title === '这台 VibeSpace 上的任何文件夹，包括你的主目录', anyRow);
  await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Anywhere'); if (!r) return false; r.scrollIntoView({ block: 'center' }); return true; })()`);
  await shot('ak-11-row-allpaths.png');
  // the first-use card says 所有路径 (the conversation asks to open with the key — no grant yet)
  const anyCall = cli(['conversations', 'open', '--key', 'Anywhere', '--cwd', CWD, '--name', 'anywhere probe'], { token });
  await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`);
  const anyCard = await until(`(() => { const it = [...document.querySelectorAll('#user-todos-popup .ut-item')].find((x) => x.querySelector('.ut-hub-deny') && /Anywhere/.test((x.querySelector('.ut-text') || {}).textContent || '')); return it ? { text: it.querySelector('.ut-text').textContent, plan: (it.querySelector('.ut-proposal-plan') || {}).textContent || '' } : null; })()`, 20000);
  check('the first-use card of an all-paths key says 「这把 key 的文件夹：所有路径」', anyCard && anyCard.plan.includes('这把 key 的文件夹：所有路径——这台 VibeSpace 上的任何文件夹。') && anyCard.plan.includes(`这次调用会在 ${CWD} 开一个叫「anywhere probe」的对话。`), anyCard);
  await shot('ak-12-card-allpaths.png');
  await sleep(1100);   // the press-arm
  const denyAt = await evalJs(`(() => { const it = [...document.querySelectorAll('#user-todos-popup .ut-item')].find((x) => x.querySelector('.ut-hub-deny') && /Anywhere/.test((x.querySelector('.ut-text') || {}).textContent || '')); const b = it && it.querySelector('.ut-hub-deny'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (denyAt) { await sleep(300); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: denyAt.x, y: denyAt.y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: denyAt.x, y: denyAt.y, button: 'left', clickCount: 1 }); }
  const anyRes = await Promise.race([anyCall, sleep(70000).then(() => ({ code: 'timeout' }))]);
  check('拒绝 ⇒ the open is refused (ask_denied) — nothing opened', anyRes.code === 1 && /\((ask_denied|ask_expired)\)/.test(anyRes.err), anyRes);
  // 编辑… round trip: 所有路径 ⇒ one folder 及子文件夹 ⇒ 所有路径
  const anyEdit = async () => { await closeWindows(); await openWindow(); return until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Anywhere'); const b = r && r.querySelector('.vw-ak-edit'); if (!b) return false; b.click(); return true; })()`, 10000); };
  await anyEdit();
  const e1 = await until(`(() => { const d = document.querySelector('#vault-ak-edit'); const a = d && d.querySelector('.vw-ak-allpaths input'); return a ? { all: a.checked, browser: (() => { const x = d.querySelector('.vw-ak-some'); const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })() } : null; })()`, 8000);
  check('编辑… opens on 所有路径 (picked, no browser)', e1 && e1.all && !e1.browser, e1);
  await evalJs(`document.querySelector('#vault-ak-edit .vw-ak-somepaths input').click()`);
  await evalJs(`(() => { const i = document.querySelector('#vault-ak-edit .vw-ak-path'); i.value = ${JSON.stringify(SUB)}; return true; })()`);
  await clickWait('#vault-ak-edit .vw-ak-add-root'); await until(`!!document.querySelector('#vault-ak-edit .vw-ak-root[data-root="${SUB}"]')`);
  await clickWait('.vw-ak-edit-save');
  const toSome = await (async () => { for (let i = 0; i < 40; i++) { const k = (await keysNow()).find((x) => x.name === 'Anywhere'); if (k && k.limits.cwdRoots[0] === SUB) return k.limits.cwdRoots; await sleep(250); } return null; })();
  const someLine = await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Anywhere'); const f = r && r.querySelector('.vw-ak-limits-line .vw-ak-lim'); return f && f.textContent !== '文件夹: 所有路径' ? { text: f.textContent, red: f.classList.contains('vw-ak-allpaths') } : null; })()`, 10000);
  check('只有这些文件夹 + one folder ⇒ the record holds exactly it; the row says 「… 及子文件夹」 (not red)', JSON.stringify(toSome) === JSON.stringify([SUB]) && someLine && someLine.text === `文件夹: ${SUB} 及子文件夹` && !someLine.red, { toSome, someLine });
  await anyEdit();
  check('编辑… again: 只有这些文件夹 picked, its folder chip there', !!(await until(`(() => { const d = document.querySelector('#vault-ak-edit'); return !!d && d.querySelector('.vw-ak-somepaths input').checked && !!d.querySelector('.vw-ak-root[data-root="${SUB}"]'); })()`, 8000)));
  await evalJs(`document.querySelector('#vault-ak-edit .vw-ak-allpaths input').click()`);
  await clickWait('.vw-ak-edit-save');
  const backAll = await (async () => { for (let i = 0; i < 40; i++) { const k = (await keysNow()).find((x) => x.name === 'Anywhere'); if (k && k.limits.cwdRoots[0] === '/') return k.limits.cwdRoots; await sleep(250); } return null; })();
  check('…所有路径 again ⇒ exactly ["/"] (the round trip)', JSON.stringify(backAll) === '["/"]', backAll);
  check('no greyed control anywhere in the automation section or its dialogs', (await evalJs(`document.querySelectorAll('.vw-row[data-store="automation"] [disabled], .vw-ak [disabled], .vw-ak-dialog [disabled]').length`)) === 0);

  console.log('⑪ MANY GRANTS — the row stays short (lane vault-key-row-compact — the owner 2026-10-21 05:4xZ: 「授权很多的时候，这个界面需要优化一下」)');
  // THE CAPS (1280×800): the row with its grants FOLDED — one head line + the limits line + 技术细节; OPENED — + the bounded list
  // (about five rows, a filter, the cleanup door). The base row with the same twelve grants stacks a chip per grant and lists every
  // permission mode: taller than the folded cap (the RED control runs this leg on the base tree)
  const CAP_FOLDED = 120, CAP_OPEN = 400;
  await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); for (const t of document.querySelectorAll('.toast')) t.remove(); return true; })()`);
  const kc = ((await api('GET', '/api/automation/keys')).json || {}).limitChoices || {};
  const ALL_PERMS = [...new Set((kc.permissionModes || []).map((r) => r.value))];
  const ALL_VERBS = ['conversations.open', 'conversations.rename', 'conversations.bind', 'conversations.end', 'groups.invite', 'conversations.status', 'conversations.archive', 'feedback.handled', 'feedback.list'];
  const fleet = await api('POST', '/api/automation/keys', { name: 'Fleet', scopes: ALL_VERBS, limits: { cwdRoots: ['/'], accounts: 'any', permissionModes: ALL_PERMS, models: 'any', modes: ['chat', 'terminal'] } });
  const FLEET = fleet.json && fleet.json.key && fleet.json.key.id;
  const GROUP_NAMES = ['ops', 'web', 'data', 'infra', 'docs', 'qa', 'ml', 'sec'].map((x, i) => `岗位 ${String(i + 1).padStart(2, '0')} ${x}`);
  const groupIds = [];
  for (const title of GROUP_NAMES) { const r = await api('POST', '/api/tasks', { title }); if (r.json && r.json.task) groupIds.push(r.json.task.id); }
  const ENDED = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const us = ((await api('GET', '/api/user-state')).json) || {};
  await api('PATCH', '/api/user-state', { customNames: { ...(us.customNames || {}), [`claude:${ENDED[0]}`]: '旧车道 alpha' } });   // the sidebar kept one ended conversation's name
  const FROW = `[...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Fleet')`;
  // THE MEASURES (the report's before / after — this leg runs on the base tree too): the row's height with its grants as the
  // window first draws them, in the default 980-px window (1280×800) and on a phone (390×844), with 2 grants and then with 12
  const rowH = `(() => { const r = ${FROW}; if (!r) return null; r.scrollIntoView({ block: 'start' }); return Math.round(r.getBoundingClientRect().height); })()`;
  const measure = async () => {
    await closeWindows(); await openWindow();
    const desk = await until(rowH, 10000);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await load(); await openWindow();
    const phone = await until(rowH, 10000);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await load(); await openWindow();
    return { desk, phone };
  };
  const gr2 = await api('POST', `/api/automation/keys/${FLEET}/grants`, { subjects: [`group:${groupIds[0]}`, `session:${LIVE_SID}`] });
  const H2 = await measure();
  const gr = await api('POST', `/api/automation/keys/${FLEET}/grants`, { subjects: [...groupIds.slice(1).map((g) => `group:${g}`), ...ENDED.map((c) => `session:${c}`)] });
  const H12 = await measure();
  console.log(`  · measured: the row with 2 grants — ${H2.desk} px (980-px window) / ${H2.phone} px (phone 390×844); with 12 grants — ${H12.desk} px / ${H12.phone} px`);
  check('the fixture: a key holding every verb and every limit unrestricted (all paths, any account, EVERY permission mode, any model, chat + terminal) granted to 2, then to 12 — 8 Task Groups, the live conversation, 3 conversations that ended',
    !!FLEET && ALL_PERMS.length >= 5 && groupIds.length === 8 && gr2.json && gr2.json.added && gr2.json.added.length === 2 && gr.json && gr.json.added && gr.json.added.length === 10, { FLEET, perms: ALL_PERMS.length, groups: groupIds.length, gr: gr.json });
  check(`the row does not grow with its grants: 12 grants draw it no taller than 2 (desk ${H2.desk} → ${H12.desk} px, phone ${H2.phone} → ${H12.phone} px)`, !!H2.desk && H12.desk === H2.desk && !!H2.phone && H12.phone === H2.phone, { H2, H12 });
  await closeWindows(); await openWindow();
  const m0 = await until(`(() => { const r = ${FROW}; if (!r) return null; r.scrollIntoView({ block: 'start' }); const txt = r.innerText; return { h: Math.round(r.getBoundingClientRect().height), enumerated: ['跳过确认', '规划模式', '自动接受编辑', '只读'].filter((w) => txt.includes(w)), grantsShown: [...r.querySelectorAll('[data-subject]')].filter((x) => x.getBoundingClientRect().height > 0).length }; })()`, 10000);
  await shot('ak-13-many-folded.png');
  check(`THE ROW WITH 12 GRANTS IS SHORT: folded, ≤ ${CAP_FOLDED} px tall at 1280×800 (no grant drawn until 「授权给 12 个」 opens them)`, !!m0 && m0.h <= CAP_FOLDED && m0.grantsShown === 0, m0);
  check('…and it never enumerates the permission modes (every mode allowed ⇒ 任何; the names only in the title)', !!m0 && m0.enumerated.length === 0, m0 && m0.enumerated);
  const head = await evalJs(`(() => { const r = ${FROW}; if (!r) return null; const l = r.querySelector('.vw-ak-limits-line'); const perm = l && l.querySelector('[data-field="permissionModes"]'); return { verbs: (r.querySelector('.vw-ak-verbs-chip') || {}).textContent || null, grants: (r.querySelector('.vw-ak-grants-chip') || {}).textContent || null, line: l ? l.innerText.replace(/\\s+/g, ' ').trim() : null, lineH: l ? Math.round(l.getBoundingClientRect().height) : 0, permTitle: perm ? perm.title : null, meta: !!r.querySelector('.vw-meta'), used: (r.querySelector('.vw-used') || {}).textContent, scopesLine: !!r.querySelector('.vw-ak-scopes') }; })()`);
  check('THE HEAD counts: 「9 个动作」 · 「授权给 12 个」 · 从未使用 — no run-on verbs line, no meta line (the kind is the chip)', !!head && head.verbs === '9 个动作' && head.grants === '授权给 12 个' && head.used === '从未使用' && !head.meta && !head.scopesLine, head);
  check('THE LIMITS in ONE line of words: 「文件夹: 所有路径 · 账号: 任何 · 权限模式: 任何 · 模型: 任何 · 模式: 任何」 (one visual line); 权限模式\'s title names every mode', !!head && head.line === '文件夹: 所有路径 · 账号: 任何 · 权限模式: 任何 · 模型: 任何 · 模式: 任何' && head.lineH <= 22 && /CLI 自己的设置/.test(head.permTitle || '') && /跳过确认/.test(head.permTitle || ''), head);
  // the head in lines: the distinct rows the name, the chips, the last use and the doors sit on (the default 980-px window: two — name · chips · last use, then the doors; maximized: ONE)
  const headLines = `(() => { const r = ${FROW}; const items = [r.querySelector('.vw-label'), ...r.querySelectorAll('.vw-chips > *'), r.querySelector('.vw-used'), ...r.querySelectorAll('.vw-act .vw-btn:not([hidden])')].filter(Boolean); const mids = items.map((e) => { const q = e.getBoundingClientRect(); return Math.round(q.top + q.height / 2); }).sort((a, b) => a - b); return { lines: mids.filter((m, i) => i === 0 || m - mids[i - 1] > 12).length, h: Math.round(r.getBoundingClientRect().height), w: Math.round(r.getBoundingClientRect().width) }; })()`;
  const hl980 = await evalJs(headLines);
  await evalJs(`(() => { for (const [id, w] of app.wm.windows) if (w && w.type === 'vault' && !w.isMaximized) app.wm.toggleMaximize(id); return true; })()`);
  await sleep(400);
  const hlMax = await until(`(() => { const x = ${headLines}; return x && x.w > 900 ? x : null; })()`, 5000);
  await shot('ak-13b-many-maximized.png');
  await evalJs(`(() => { for (const [id, w] of app.wm.windows) if (w && w.type === 'vault' && w.isMaximized) app.wm.toggleMaximize(id); return true; })()`);
  await sleep(400);
  console.log(`  · measured: the head — ${hl980 && hl980.lines} line(s), the row ${hl980 && hl980.h} px (980-px window); maximized ${hlMax && hlMax.lines} line(s), ${hlMax && hlMax.h} px`);
  check('THE HEAD: two lines in the default 980-px window (name · kind · 9 个动作 · 授权给 12 个 · last use, then 显示 and the doors); ONE line in a maximized window', !!hl980 && hl980.lines === 2 && !!hlMax && hlMax.lines === 1 && hlMax.h <= CAP_FOLDED, { hl980, hlMax });
  if (!(head && head.grants)) check('the head has its 「授权给 N 个」 chip (the legs below need it)', false);
  else {
    await evalJs(`(() => { const r = ${FROW}; const open = r.querySelector('.vw-ak-gfold'); if (open && open.hidden) r.querySelector('.vw-ak-grants-chip').click(); return true; })()`);
    const g1 = await until(`(() => { const r = ${FROW}; const f = r && r.querySelector('.vw-ak-gfold'); if (!f || f.hidden) return null; const l = f.querySelector('.vw-ak-glist'); const rows = [...l.querySelectorAll('.vw-ak-g')]; return { expanded: r.querySelector('.vw-ak-grants-chip').getAttribute('aria-expanded'), order: rows.map((x) => x.dataset.subject), names: rows.map((x) => x.querySelector('.vw-ak-gname').textContent), states: rows.map((x) => (x.querySelector('.vw-ak-gstate') || {}).textContent || ''), ended: rows.filter((x) => x.classList.contains('vw-ak-g-ended')).length, ch: l.clientHeight, sh: l.scrollHeight, rowH: Math.round(rows[0].getBoundingClientRect().height), filter: !!f.querySelector('.vw-ak-gfilter'), n: (f.querySelector('.vw-ak-ended-n') || {}).textContent, prune: (f.querySelector('.vw-ak-prune') || {}).textContent, h: Math.round(r.getBoundingClientRect().height) }; })()`, 8000);
    await shot('ak-14-many-open.png');
    console.log(`  · measured: the row with its 12 grants OPENED — ${g1 && g1.h} px (the list ${g1 && g1.ch} px of ${g1 && g1.sh} px, rows ${g1 && g1.rowH} px)`);
    const ord = g1 && g1.order;
    check('「授权给 12 个」 opens the grants IN PLACE (aria-expanded): one row per grant — the 8 Task Groups by name, then the live conversation (运行中), then the 3 ended ones (dim, 已结束) — each by name',
      !!g1 && g1.expanded === 'true' && ord.length === 12 && ord.slice(0, 8).every((x) => x.startsWith('group:')) && g1.names.slice(0, 8).join('|') === GROUP_NAMES.join('|') && ord[8] === `session:${LIVE_SID}` && g1.states[8] === '运行中' && ENDED.every((c) => ord.slice(9).includes(`session:${c}`)) && g1.ended === 3 && g1.states.slice(9).every((x) => x === '已结束'), g1);
    check('an ended conversation is named by what the sidebar kept (旧车道 alpha), else its id shortened to 8 characters — never a raw id', !!g1 && g1.names.includes('旧车道 alpha') && ENDED.slice(1).every((c) => g1.names.includes(`${c.slice(0, 8)}…`)), g1 && g1.names);
    check(`THE LIST IS BOUNDED: about five rows show and the rest SCROLL inside the row (client ${g1 && g1.ch} px < content ${g1 && g1.sh} px); the opened row stays ≤ ${CAP_OPEN} px`, !!g1 && g1.ch <= g1.rowH * 5.5 && g1.sh > g1.ch + g1.rowH && g1.h <= CAP_OPEN, g1);
    check('past eight grants a filter box appears; the ended ones get ONE door 「清理已结束的授权」 with their count (3) beside it', !!g1 && g1.filter && g1.prune === '清理已结束的授权' && g1.n === '3', g1);
    const filt = async (q) => { await evalJs(`(() => { const i = ${FROW}.querySelector('.vw-ak-gfilter'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); return evalJs(`(() => { const f = ${FROW}.querySelector('.vw-ak-gfold'); const none = f.querySelector('.vw-ak-gnone'); return { shown: [...f.querySelectorAll('.vw-ak-g')].filter((x) => !x.hidden).map((x) => x.querySelector('.vw-ak-gname').textContent), none: none.hidden ? null : none.textContent }; })()`); };
    const fa = await filt('岗位 03'), fb = await filt('zzz'), fc = await filt('已结束'), fd = await filt('');
    check('the filter narrows the list by name (岗位 03 ⇒ one Task Group), says when nothing matches, finds the ended ones by 已结束; cleared ⇒ all 12', fa.shown.join() === GROUP_NAMES[2] && fb.shown.length === 0 && fb.none === '没有匹配「zzz」的授权' && fc.shown.length === 3 && fd.shown.length === 12 && fd.none === null, { fa, fb, fc, fd });
    await evalJs(`${FROW}.querySelector('.vw-ak-prune').click()`);
    const after = await (async () => { for (let i = 0; i < 40; i++) { const k = (await keysNow()).find((x) => x.id === FLEET); if (k && k.grants.length === 9) return k; await sleep(250); } return null; })();
    const pruned = auditLines().filter((l) => l.verb === 'key.prune' && l.key === FLEET);
    check('清理已结束的授权 takes back EXACTLY the 3 ended grants — the 8 Task Groups and the live conversation stay; ONE audit line names what went', !!after && after.grants.every((g) => !ENDED.some((c) => g.subject === `session:${c}`)) && after.grants.some((g) => g.subject === `session:${LIVE_SID}`) && after.grants.filter((g) => g.subject.startsWith('group:')).length === 8
      && pruned.length === 1 && ENDED.every((c) => pruned[0].note.includes(c)) && /^took back 3 grants to ended conversations: /.test(pruned[0].note), { after: after && after.grants.map((g) => g.subject), pruned });
    const g2 = await until(`(() => { const r = ${FROW}; const f = r && r.querySelector('.vw-ak-gfold'); const c = r && r.querySelector('.vw-ak-grants-chip'); return c && c.textContent === '授权给 9 个' ? { open: !f.hidden, expanded: c.getAttribute('aria-expanded'), prune: !!f.querySelector('.vw-ak-prune'), rows: f.querySelectorAll('.vw-ak-g').length, filter: !!f.querySelector('.vw-ak-gfilter') } : null; })()`, 10000);
    check('…the row says 「授权给 9 个」, the cleanup door is gone, and the list STAYS open (remembered per key for this page)', !!g2 && g2.open && g2.expanded === 'true' && !g2.prune && g2.rows === 9 && g2.filter, g2);
    // the verbs: 「9 个动作」 ⇒ a popover grouped by family, 编辑… beside
    await evalJs(`${FROW}.querySelector('.vw-ak-verbs-chip').click()`);
    const vp = await until(`(() => { const p = document.querySelector('.vw-ak-verbs-pop'); if (!p || !p.getBoundingClientRect().height) return null; return { fams: [...p.querySelectorAll('.vw-ak-vfam')].map((f) => f.querySelector('.vw-ak-vfam-name').textContent + ':' + f.querySelectorAll('.vw-ak-vrow').length).join('|'), first: (p.querySelector('.vw-ak-vrow') || {}).textContent, edit: (p.querySelector('.vw-ak-vedit') || {}).textContent }; })()`, 5000);
    await shot('ak-15-verbs.png');
    check('「9 个动作」 opens the verbs as a popover grouped by family — 对话 6 · Agent 群组 1 · 反馈 2 (a billed verb says so) — with 编辑… beside', !!vp && vp.fams === '对话:6|Agent 群组:1|反馈:2' && vp.first === '开一个对话 （会开始一个计费回合）' && vp.edit === '编辑…', vp);
    await evalJs(`document.querySelector('.vw-ak-verbs-pop .vw-ak-vedit').click()`);
    check('…its 编辑… opens the key\'s edit dialog (the popover closes)', !!(await until(`!!document.querySelector('#vault-ak-edit') && !document.querySelector('.vw-ak-verbs-pop')`, 5000)) && (await textOf('#vault-ak-edit h3')) === '编辑「Fleet」');
    await evalJs(`(() => { const b = document.querySelector('#vault-ak-edit .btn-cancel'); if (b) b.click(); return true; })()`);
    // THE NOTICE HEAD SPEAKS: the live conversation archives a conversation the key never opened ⇒ refused (the grant reaches only what it opened)
    const who = ((await live()) || {}).name;
    const ar = await cli(['conversations', 'archive', 'lane-zz', '--key', 'Fleet'], { token });
    const band = await until(`(() => { const r = [...document.querySelectorAll('.vw-band-row[data-type="vault-use-failed"]')].find((x) => /Fleet/.test(x.querySelector('.vw-band-txt').textContent)); if (!r) return null; const more = r.querySelector('.vw-band-more'); return { head: r.querySelector('.vw-band-txt').textContent, cause: (r.querySelector('.vw-band-cause') || {}).textContent, foldOpen: more ? more.open : null, fold: more ? more.querySelector('.vw-band-more-body').textContent : null, summary: more ? more.querySelector('summary').textContent : null, doors: [...r.querySelectorAll('[data-door]')].map((b) => b.dataset.door).join() }; })()`, 15000);
    await evalJs(`(() => { const b = document.querySelector('.vw-band'); if (b) b.scrollIntoView({ block: 'start' }); return true; })()`);
    await shot('ak-16-band.png');
    check(`THE 需要你 NOTICE'S HEAD SPEAKS: «${who} 用 key「Fleet」做「归档一个对话」被拒» (actor · the key · the verb in the table's words) — the CLI was refused not_granted`, ar.code === 1 && /\(not_granted\)/.test(ar.err) && !!band && band.head === `${who} 用 key「Fleet」做「归档一个对话」被拒`, { ar, band, who });
    check('…the cause is its SECOND line (the reach it has + the door); the count and the rest under ONE closed fold (详情); 打开行 / 知道了 stay', !!band && band.cause === '这把 key 没有开过 lane-zz，而授权只触及它开的会话——在保险库窗口该 key 的行里扩大作用范围（这些岗位的会话 / 整个 VibeSpace），或把 key 授权给那个会话' && band.foldOpen === false && band.summary === '详情' && /1/.test(band.fold || '') && band.doors === 'open,ack', band);
    await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`);
    const tray = await until(`(() => { const it = [...document.querySelectorAll('#user-todos-popup .ut-item')].find((x) => /Fleet/.test((x.querySelector('.ut-text') || {}).textContent || '')); return it ? it.querySelector('.ut-text').textContent : null; })()`, 10000);
    check('…and For you\'s row says the same head (the same item, the verb a param that IS words)', tray === `${who} 用 key「Fleet」做「归档一个对话」被拒`, tray);
    await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`);
    // THE PHONE (390×844 · 375×812): the head wraps to two lines, every door reachable, the grants list scrolls inside the row
    for (const [W, H] of [[390, 844], [375, 812]]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
      await load();
      await openWindow();
      await until(`(() => { const r = ${FROW}; if (!r) return false; const c = r.querySelector('.vw-ak-grants-chip'); const f = r.querySelector('.vw-ak-gfold'); if (f && f.hidden) c.click(); r.scrollIntoView({ block: 'start' }); return true; })()`, 10000);
      const ph = await until(`(() => { const r = ${FROW}; const f = r && r.querySelector('.vw-ak-gfold'); if (!f || f.hidden) return null; const rr = r.getBoundingClientRect(); const items = [r.querySelector('.vw-label'), ...r.querySelectorAll('.vw-chips > *'), r.querySelector('.vw-used'), ...r.querySelectorAll('.vw-act .vw-btn:not([hidden])')].filter(Boolean); const tops = [...new Set(items.map((e) => Math.round(e.getBoundingClientRect().top)))].sort((a, b) => a - b); const lines = tops.filter((t, i) => i === 0 || t - tops[i - 1] > 12).length; const doors = [...r.querySelectorAll('.vw-show, .vw-ak-grant, .vw-ak-edit, .vw-ak-audit, .vw-ak-revoke')].map((b) => { const q = b.getBoundingClientRect(); return { cls: b.className.split(' ').pop(), l: Math.round(q.left), r: Math.round(q.right), h: Math.round(q.height) }; }); const l = f.querySelector('.vw-ak-glist'); return { rowW: Math.round(rr.width), right: Math.round(rr.right), lines, items: items.map((e) => { const q = e.getBoundingClientRect(); return [e.className.split(' ').pop(), Math.round(q.left), Math.round(q.width), Math.round(q.top), e.textContent.slice(0, 20), getComputedStyle(e).flexBasis, getComputedStyle(e).display]; }), doors, ch: l.clientHeight, sh: l.scrollHeight, pageScroll: document.documentElement.scrollWidth }; })()`, 10000);
      await evalJs(`(() => { const r = ${FROW}; r.scrollIntoView({ block: 'start' }); return true; })()`);
      await shot(`ak-17-phone-${W}.png`);
      console.log(`  · measured: phone ${W}×${H} — the head ${ph && ph.lines} line(s), the grants list ${ph && ph.ch} px of ${ph && ph.sh} px, the row ${ph && ph.rowW} px wide`);
      check(`PHONE ${W}×${H}: the head wraps to TWO lines (name + chips · the doors); every door reachable (inside the screen, ≥ 36 px); the grants list scrolls INSIDE the row; nothing runs off the side`,
        !!ph && ph.lines <= 2 && ph.doors.length === 5 && ph.doors.every((d) => d.l >= 0 && d.r <= W && d.h >= 36) && ph.sh > ph.ch && ph.right <= W && ph.pageScroll <= W, ph);
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  }

  console.log('⑩ the words in Japanese');
  await evalJs(`(() => { localStorage.setItem('vibespace.lang', 'ja'); return true; })()`);
  await load();
  await openWindow();
  check('「自動化キー」 + 「発行…」', (await textOf('.vw-group[data-purpose="automation"] .vw-group-name')) === '自動化キー' && (await textOf('.vw-ak-mint')) === '発行…');
  check('「編集…」 + 「監査ログ…」 on every key (lane key-folder-picker-all: 編集… holds the limits); the all-paths key says 「すべてのパス」', !!(await until(`[...document.querySelectorAll('.vw-ak-edit')].some((b) => b.textContent === '編集…') && [...document.querySelectorAll('.vw-ak-audit')].some((b) => b.textContent === '監査ログ…') && [...document.querySelectorAll('.vw-ak-lim.vw-ak-allpaths')].some((x) => x.textContent === 'フォルダ: すべてのパス')`, 8000)));
  check('the reach chip in Japanese: 「この鍵が開いた会話だけ」 (lane key-instance-scope)', !!(await until(`[...document.querySelectorAll('.vw-ak-reach')].some((b) => b.textContent === 'この鍵が開いた会話だけ')`, 8000)));
  await shot('ak-5-ja.png');
} catch (e) {
  failed++;
  console.error('✗ threw: ' + (e && e.stack || e));
}
console.log(failed ? `\nFAILED (${failed} failed, ${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
