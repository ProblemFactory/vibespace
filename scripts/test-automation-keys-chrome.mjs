#!/usr/bin/env node
// VIBESPACE'S OWN AUTOMATION KEYS ON A REAL HUB (heavy: a worktree hub, a stub claude behind the real chat wrapper, headless
// Chrome — design q-046 L1, lane automation-keys-core). The whole chain, end to end:
//   ① the vault set up from the page · ② a LIVE conversation through the real spawn (its own vsst_ in the stub's env)
//   ③ the Vault window's «自动化 key»: 铸造… (a name + 给对话改名) ⇒ the row: its name, its verb, 「只为交给外界」 beside 显示,
//      no grant yet — and no value anywhere in the page
//   ④ THE FIRST USE: the conversation runs the REAL `vibespace-api call conversations.rename` with no grant ⇒ ONE urgent card
//      in For you; the person presses 「一直（授权给这个会话）」 in the tray ⇒ the waiting call renames the conversation (the
//      session list's broadcast says so) and the CLI prints ok
//   ⑤ THE AUDIT: exactly two lines for that conversation (the grant, the rename — asked: always), names only; `vibespace-api
//      audit` prints them
//   ⑥ 授权给… (the picker, multi-select): unchecked ⇒ the grant goes; checked ⇒ it is back
//   ⑦ 显示 ⇒ 验证是你 ⇒ the value (vsak_…) in ITS row only, 「只为交给外界」 beside it; the vault's audit has the reveal
//   ⑧ THE LOCK ⇒ the door answers 423 vault_locked and the CLI exits 3 saying so; the unlock ⇒ it works again
//   ⑨ 撤销 ⇒ the row goes, the CLI's `keys` says nothing is granted · ⑩ the words in Japanese (自動化キー / 発行…)
//   ⑨b THE LIMITS (lane automation-open-limits — the q-048 verify's M2): 铸造… with 开一个对话 ticked shows the limits (absent
//      until then): a folder picked in the hub's file tree (type a path, open a subfolder, ↑, 加入这个文件夹), the CLI's own
//      login, 跳过确认 beside CLI 自己的设置 ⇒ the row's limits line and the hub's record; 边界… edits them (another folder, 终端);
//      a key minted before limits reads as folderless 「未设边界」 (refuses every open) and its first 边界… sets them; the CLI's open outside ⇒ refused naming the
//      limits; 审计… lists that refused open with its code
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
const openWindow = async () => { await evalJs(`app.replayOpenSpec({ action: 'openVault' })`); return until(visible('.vw-group[data-store="automation"]'), 15000); };
const closeWindows = () => evalJs(`(() => { for (const [id, w] of app.wm.windows) if (w && w.type === 'vault') app.wm.closeWindow(id); return true; })()`);
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
  check('the window opens on «自动化 key» (a group head with 铸造…)', !!(await openWindow()) && (await textOf('.vw-group[data-store="automation"] .vw-group-name')) === '自动化 key' && (await textOf('.vw-ak-mint')) === '铸造…');
  await click('.vw-ak-mint');
  check('铸造… opens its dialog: a name and the closed table of verbs (开一个对话 says it bills)', !!(await until(visible('#vault-ak-mint'), 5000)) && /（会开始一个计费回合）/.test(await textOf('#vault-ak-mint')) && (await evalJs(`document.querySelectorAll('#vault-ak-mint .vw-ak-verbs .vw-ak-pick input[type=checkbox]').length`)) === 6 && !(await evalJs(visible('#vault-ak-mint .vw-ak-limwrap')))); // lane automation-verbs: + conversations.status (a read)
  await typeInto('#vault-ak-mint .vw-ak-name', 'Lane dispatch');
  await evalJs(`(() => { const c = document.querySelector('#vault-ak-mint input[value="conversations.rename"]'); c.checked = true; return true; })()`);
  await click('.vw-ak-mint-go');
  const row = await until(`(() => { const r = document.querySelector(${JSON.stringify(ROW)}); return r ? { label: r.querySelector('.vw-label').textContent, why: (r.querySelector('.vw-ak-why') || {}).textContent, none: (r.querySelector('.vw-ak-none') || {}).textContent, scopes: (r.querySelector('.vw-ak-scopes') || {}).textContent } : null; })()`, 15000);
  check('the row: the key\'s name, its verb, 「只为交给外界」 beside 显示, no grant yet', row && row.label === 'Lane dispatch' && row.why === '只为交给外界' && row.scopes === '给对话改名' && row.none === '还没有授权给任何会话或任务组', row);
  check('no value anywhere in the page (markup + every input)', !/vsak_/.test(await pageText()));
  await evalJs(`(() => { document.querySelector('.vw-group[data-store="automation"]').scrollIntoView({ block: 'start' }); return true; })()`);
  await shot('ak-1-window.png');

  console.log('④ THE FIRST USE — the real CLI, no grant ⇒ the card ⇒ 一直');
  const call = cli(['call', 'conversations.rename', '--name', '自动改名'], { token });
  await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`);
  const card = await until(`(() => { const b = document.querySelector('#user-todos-popup .ut-item .ut-hub-always'); if (!b) return null; const it = b.closest('.ut-item'); return { always: b.textContent, once: (it.querySelector('.ut-hub-once') || {}).textContent, deny: (it.querySelector('.ut-hub-deny') || {}).textContent, text: (it.querySelector('.ut-text') || {}).textContent }; })()`, 20000);
  const early = card ? null : await Promise.race([call, sleep(3000).then(() => 'still waiting')]);
  check('ONE urgent card in For you — 「允许一次 / 一直（授权给这个会话） / 拒绝」, naming the key and the verb', card && card.always === '一直（授权给这个会话）' && card.once === '允许一次' && card.deny === '拒绝' && /Lane dispatch/.test(card.text) && /conversations\.rename/.test(card.text), card || { cli: early, items: await api('GET', '/api/user-todos') });
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
  check('the row lists the grant: 授权给： + the conversation\'s name', !!(await until(`(() => { const c = document.querySelector(${JSON.stringify(ROW + ' .vw-ak-chip')}); return c && /自动改名/.test(c.textContent); })()`, 10000)));
  await click(ROW + ' .vw-ak-grant');
  const sel = `#vault-ak-grant input[value="session:${LIVE_SID}"]`;
  check('the picker lists the live conversation, checked', !!(await until(`(() => { const c = document.querySelector(${JSON.stringify(sel)}); return c && c.checked; })()`, 8000)));
  await shot('ak-3-picker.png');
  await evalJs(`(() => { document.querySelector(${JSON.stringify(sel)}).checked = false; return true; })()`);
  await click('.vw-ak-save');
  check('unchecked + 保存 ⇒ the grant goes (no chip)', !!(await until(`!document.querySelector(${JSON.stringify(ROW + ' .vw-ak-chip')}) && !!document.querySelector(${JSON.stringify(ROW + ' .vw-ak-none')})`, 10000)));
  await click(ROW + ' .vw-ak-grant');
  await until(visible(sel), 8000);
  await evalJs(`(() => { document.querySelector(${JSON.stringify(sel)}).checked = true; return true; })()`);
  await click('.vw-ak-save');
  check('checked + 保存 ⇒ it is back', !!(await until(`!!document.querySelector(${JSON.stringify(ROW + ' .vw-ak-chip')})`, 10000)));

  console.log('⑦ 显示 ⇒ 验证是你 ⇒ the value, only to hand to an outside party');
  await click(ROW + ' .vw-show');
  check('「显示」 asks 验证是你', (await until(`document.querySelector('#vault-reveal-dialog h3')?.textContent`, 8000)) === '验证是你');
  await typeInto('#vault-reveal-pw', SECOND); await click('.vault-reveal-go');
  const plain = await until(`document.querySelector(${JSON.stringify(ROW + ' .vw-plain')})?.value`, 10000);
  check('the value appears in ITS row (vsak_ + 43), 「只为交给外界」 beside it', /^vsak_[A-Za-z0-9_-]{43}$/.test(plain || '') && (await textOf(ROW + ' .vw-ak-why')) === '只为交给外界', plain && plain.slice(0, 5));
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

  console.log('⑨b THE LIMITS — mint with limits, 边界…, 「未设边界」 (q-049 M1 fail closed), the refused open in 审计…');
  const SUB = path.join(CWD, 'lane-sub');
  fs.mkdirSync(SUB, { recursive: true });
  await closeWindows(); await openWindow();
  await click('.vw-ak-mint');
  await until(visible('#vault-ak-mint'), 5000);
  await typeInto('#vault-ak-mint .vw-ak-name', 'Opener');
  await evalJs(`document.querySelector('#vault-ak-mint input[value="conversations.open"]').click()`);
  check('ticking 开一个对话 shows the limits (folders · accounts · permission modes · models · modes) — absent before',
    !!(await until(visible('#vault-ak-mint .vw-ak-limwrap'), 3000)) && (await textOf('#vault-ak-mint .vw-ak-limwrap')).includes('它开的对话能用什么') && (await evalJs(`[...document.querySelectorAll('#vault-ak-mint .vw-ak-limits .vw-ak-sec')].map((e) => e.textContent).join('|')`)) === '文件夹|账号|权限模式|模型|模式');
  // the folder picker over the hub's file tree: type a path ⇒ its subfolders; open one; ↑ back; 加入这个文件夹
  await evalJs(`(() => { const i = document.querySelector('#vault-ak-mint .vw-ak-path'); i.value = ${JSON.stringify(CWD)}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  const subBtn = `#vault-ak-mint .vw-ak-dir[data-path="${SUB}"]`;
  check('a typed path lists its subfolders (the hub\'s file tree)', !!(await until(visible(subBtn), 8000)));
  await click(subBtn);
  check('a subfolder opens', (await until(`document.querySelector('#vault-ak-mint .vw-ak-path').value === ${JSON.stringify(SUB)}`, 8000)) === true);
  await click('#vault-ak-mint .vw-ak-up');
  check('↑ goes back up', (await until(`document.querySelector('#vault-ak-mint .vw-ak-path').value === ${JSON.stringify(CWD)}`, 8000)) === true);
  await click('#vault-ak-mint .vw-ak-add-root');
  check('加入这个文件夹 ⇒ a folder chip', !!(await until(`!!document.querySelector('#vault-ak-mint .vw-ak-root[data-root="${CWD}"]')`, 3000)));
  check('a fresh key: no account picked, 默认 the only permission mode, any model, chat',
    (await evalJs(`(() => { const d = document.querySelector('#vault-ak-mint'); const on = (sel) => [...d.querySelectorAll(sel)].filter((c) => c.checked).map((c) => c.value).join(); return [on('.vw-ak-accts input'), d.querySelector('.vw-ak-acct-any input').checked, on('.vw-ak-perms input'), d.querySelector('.vw-ak-model-any input').checked, on('.vw-ak-modes input')].join('|'); })()`)) === '|false|default|true|chat');
  await evalJs(`document.querySelector('#vault-ak-mint .vw-ak-accts input[value="subscription"]').click()`);
  await evalJs(`document.querySelector('#vault-ak-mint .vw-ak-perms input[value="bypassPermissions"]').click()`);
  await evalJs(`(() => { const b = document.querySelector('#vault-ak-mint .vw-ak-dialog .dialog-body, #vault-ak-mint .dialog-body'); if (b) b.scrollTop = 0; return true; })()`);
  await shot('ak-6-mint-limits.png');
  await evalJs(`(() => { const b = document.querySelector('#vault-ak-mint .dialog-body'); if (b) b.scrollTop = b.scrollHeight; return true; })()`);
  await shot('ak-6b-mint-limits-lower.png');
  await click('.vw-ak-mint-go');
  const OPENER = `${ROW}:has(.vw-ak-limits-edit)`;
  const line = await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => x.querySelector('.vw-label').textContent === 'Opener'); return r && r.querySelector('.vw-ak-limits-line') ? [...r.querySelectorAll('.vw-ak-limits-line .vw-ak-lim')].map((e) => e.textContent).join(' · ') : null; })()`, 10000);
  check('the row says what its conversations may use (one line per field): the folder, the CLI\'s own login, CLI 自己的设置 + 跳过确认, any model, chat', line === `文件夹: ${CWD} · 账号: CLI 自己的登录 · 权限模式: CLI 自己的设置, 跳过确认 · 模型: 任何 · 模式: 聊天`, line);
  const keysNow = async () => ((await api('GET', '/api/automation/keys')).json || {}).keys || [];
  const opener = (await keysNow()).find((k) => k.name === 'Opener');
  check('…and the hub\'s record holds exactly that pick', opener && JSON.stringify(opener.limits) === JSON.stringify({ cwdRoots: [CWD], accounts: ['subscription'], permissionModes: ['default', 'bypassPermissions'], models: 'any', modes: ['chat'] }), opener && opener.limits);
  await until(`(() => { const r = document.querySelector(${JSON.stringify(OPENER)}); if (!r) return false; r.scrollIntoView({ block: 'center' }); return true; })()`);
  await shot('ak-7-row-limits.png');
  // 边界… — another folder, terminal too
  await click(OPENER + ' .vw-ak-limits-edit');
  check('边界… opens on the key\'s own limits (its folder chip, its checks)', !!(await until(`!!document.querySelector('#vault-ak-limits .vw-ak-root[data-root="${CWD}"]') && document.querySelector('#vault-ak-limits .vw-ak-perms input[value="bypassPermissions"]').checked`, 5000)));
  await clickWait(`#vault-ak-limits .vw-ak-root[data-root="${CWD}"] .vw-ak-x`); await until(`!document.querySelector('#vault-ak-limits .vw-ak-root[data-root="${CWD}"]')`);
  await evalJs(`(() => { const i = document.querySelector('#vault-ak-limits .vw-ak-path'); i.value = ${JSON.stringify(SUB)}; return true; })()`);
  await clickWait('#vault-ak-limits .vw-ak-add-root'); await until(`!!document.querySelector('#vault-ak-limits .vw-ak-root[data-root="${SUB}"]')`);
  await clickWait('#vault-ak-limits .vw-ak-modes input[value="terminal"]');
  await clickWait('.vw-ak-limits-save');
  const edited = await (async () => { for (let i = 0; i < 40; i++) { const k = (await keysNow()).find((x) => x.name === 'Opener'); if (k && k.limits && k.limits.cwdRoots[0] === SUB) return k.limits; await sleep(250); } return null; })();
  check('保存 ⇒ the hub holds the edit (the other folder, chat + terminal)', edited && edited.cwdRoots.join() === SUB && edited.modes.join() === 'chat,terminal', edited);
  // q-049 M1: a key minted BEFORE limits (record has no `limits` field) reads as folderless ⇒ 「未设边界」 (refuses every open); its first 边界… sets them
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
  await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Legacy'); const b = r && r.querySelector('.vw-ak-limits-edit'); if (!b) return false; b.click(); return true; })()`);
  const legacyLim = ((await keysNow()).find((k) => k.name === 'Legacy') || {}).limits;
  check('its 边界… says these will be its FIRST limits (nothing changes until 保存)', !!(await until(visible('#vault-ak-limits .vw-ak-first'), 5000)) && legacyLim && legacyLim.cwdRoots.length === 0);
  await evalJs(`(() => { const i = document.querySelector('#vault-ak-limits .vw-ak-path'); i.value = ${JSON.stringify(CWD)}; return true; })()`);
  await clickWait('#vault-ak-limits .vw-ak-add-root'); await until(`!!document.querySelector('#vault-ak-limits .vw-ak-root[data-root="${CWD}"]')`);
  await clickWait('#vault-ak-limits .vw-ak-acct-any input');
  await clickWait('.vw-ak-limits-save');
  const firstSet = await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => x.querySelector('.vw-label').textContent === 'Legacy'); return r && !r.querySelector('.vw-ak-unbounded') && r.querySelector('.vw-ak-limits-line') ? [...r.querySelectorAll('.vw-ak-limits-line .vw-ak-lim')].map((e) => e.textContent).join(' · ') : null; })()`, 10000);
  check('…its first 保存 sets them: the chip gives way to the limits line', firstSet === `文件夹: ${CWD} · 账号: 任何 · 权限模式: CLI 自己的设置 · 模型: 任何 · 模式: 聊天`, firstSet);
  // the CLI's open outside the limits ⇒ refused naming them; 审计… lists it with its code
  await api('POST', `/api/automation/keys/${opener.id}/grants`, { subjects: [`session:${LIVE_SID}`] });
  const outside = await cli(['conversations', 'open', '--key', 'Opener', '--cwd', '/etc', '--name', 'nope'], { token });
  check('the conversation\'s open outside the key\'s folder ⇒ exit 1, cwd_outside_roots, the key\'s limits printed by name', outside.code === 1 && /\(cwd_outside_roots\)/.test(outside.err) && outside.err.includes(`this key's limits: folders ${SUB} · accounts subscription · permission modes default, bypassPermissions · models any · modes chat, terminal`), outside);
  await closeWindows(); await openWindow();
  await until(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(ROW)})].find((x) => (x.querySelector('.vw-label') || {}).textContent === 'Opener'); const b = r && r.querySelector('.vw-ak-audit'); if (!b) return false; b.click(); return true; })()`);
  const refusedLine = await until(`(() => { const l = document.querySelector('#vault-ak-audit .vw-ak-audit-line.vw-ak-refused[data-code="cwd_outside_roots"]'); return l ? { outcome: l.querySelector('.vw-ak-outcome').textContent, verb: l.querySelector('.vw-ak-verb').textContent, arg: (l.querySelector('.vw-ak-arg') || {}).textContent } : null; })()`, 8000);
  check('审计… lists the refused open: 开一个对话 · cwd_outside_roots · /etc', refusedLine && refusedLine.outcome === 'cwd_outside_roots' && refusedLine.verb === '开一个对话' && refusedLine.arg === '/etc', refusedLine);
  await shot('ak-9-audit.png');
  await evalJs(`(() => { const b = document.querySelector('#vault-ak-audit .btn-cancel'); if (b) b.click(); return true; })()`);
  check('no greyed control anywhere in the automation section or its dialogs', (await evalJs(`document.querySelectorAll('.vw-row[data-store="automation"] [disabled], .vw-ak [disabled], .vw-ak-dialog [disabled]').length`)) === 0);

  console.log('⑩ the words in Japanese');
  await evalJs(`(() => { localStorage.setItem('vibespace.lang', 'ja'); return true; })()`);
  await load();
  await openWindow();
  check('「自動化キー」 + 「発行…」', (await textOf('.vw-group[data-store="automation"] .vw-group-name')) === '自動化キー' && (await textOf('.vw-ak-mint')) === '発行…');
  check('「制限…」 + 「監査ログ…」 on a key that opens (lane automation-open-limits)', !!(await until(`[...document.querySelectorAll('.vw-ak-limits-edit')].some((b) => b.textContent === '制限…') && [...document.querySelectorAll('.vw-ak-audit')].some((b) => b.textContent === '監査ログ…')`, 8000)));
  await shot('ak-5-ja.png');
} catch (e) {
  failed++;
  console.error('✗ threw: ' + (e && e.stack || e));
}
console.log(failed ? `\nFAILED (${failed} failed, ${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
