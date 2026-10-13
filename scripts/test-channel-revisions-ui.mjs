#!/usr/bin/env node
// A RECALL AND AN EDIT OF A STORED MESSAGE, IN A REAL BROWSER (lane channel-record-revisions, owner 2026-10-13: "userW刚才把
// 那个消息撤回了，我们系统怎么完全没标记…应该标记撤回+折叠，包括消息编辑也提供一个展开编辑历史的方法"; heavy tier — a worktree
// server + headless chrome, zero vendor calls). The FAKE adapter (`VIBESPACE_CHANNELS_FAKE=1`) with the NAMED seam
// `VIBESPACE_CHANNELS_FAKE_REVISIONS=<file>`: fake-poll answers a stored message BY ID from the file — the suite writes it
// mid-run (a message recalled, another edited, after both windows drew them). Legs:
//   (r) the owner's Refresh: the recheck learns the recall — the row folds to "{name} 撤回了一条消息 · {time}" IN PLACE in
//       BOTH tabs (the same spot, no reload), ▸ 展开 shows the KEPT content dimmed; the list row's preview says 撤回
//   (e) the edit — the newest body on the row, "已编辑 · {time} ▸ 查看 2 个版本" lists the original and the edit
//   (p) phone 390: the same words; PNGs recalled / edit-history / phone (CRV_PNG_DIR, else the scratch dir)
// Scratch: ONE dir /tmp/vs-crv-<pid>. Run: node scripts/test-channel-revisions-ui.mjs (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const PORT = await freePort(), CDP_PORT = await freePort();
const ROOT = scratch('crv');
try { execSync(`git worktree remove --force ${path.join(ROOT, 'wt')}`, { cwd: repo, stdio: 'ignore' }); } catch {}
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const wt = path.join(ROOT, 'wt'), chromeDir = path.join(ROOT, 'chrome'), fakeHome = path.join(ROOT, 'home'), REVS = path.join(ROOT, 'revisions.json');
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
fs.writeFileSync(REVS, JSON.stringify({ revisions: {} }));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

const srvLog = fs.openSync(path.join(ROOT, 'server.log'), 'a');
const srv = spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: ['ignore', srvLog, srvLog],
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_CHANNELS_FAKE_REVISIONS: REVS },
});
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { endRootedProcesses(wt); } catch {}   // whatever the server started under the scratch tree
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const waitServer = async () => { for (let i = 0; i < 240; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted (the fake accounts; fake-poll answers a stored message by id)');
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
const C = 'fake-poll-ops';
let recs = [];
for (let i = 0; i < 160; i++) { const r = await api('GET', `/api/channels/fake-poll/${C}/messages?limit=50`); recs = (r.json.records || r.json || []); if (r.status === 200 && Array.isArray(recs) && recs.length >= 5) break; await sleep(250); }
ok(Array.isArray(recs) && recs.length >= 5, `the ops room was ingested (${recs.length} records)`);

const WebSocket = require('ws');
async function newPage({ lang = 'zh', width = 1100, height = 900, mobile = false } = {}) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) throw new Error('no value from page: ' + JSON.stringify(r2).slice(0, 600));
    return r2.result.result.value;
  };
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message)));" });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  let ready = false;
  for (let i = 0; i < 200; i++) { try { if (await evaljs("!!(window.app && window.app.wm && window.app.openChannel) && !document.getElementById('loading-screen')")) { ready = true; break; } } catch {} await sleep(250); }
  if (ready) await evaljs('window.__noReload = 1; true');
  return { cdp, evaljs, ready, close: () => { try { ws.close(); } catch {} } };
}
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
const now0 = Date.now();
const plain = recs.filter((r) => r && r.vendorId && r.kind !== 'system' && !r.replyTo && !r.threadKey && r.author && r.author.id && typeof r.text === 'string' && r.text.trim() && Number(r.at) > now0 - 20 * 3600e3);
const newest = recs.slice().sort((a, b) => Number(b.at) - Number(a.at))[0];
const gone = newest && newest.kind !== 'system' && typeof newest.text === 'string' && newest.text.trim() ? newest : plain[plain.length - 1];
const edit = plain.filter((r) => r !== gone).slice(-2)[0];
ok(!!gone && !!edit, `two stored messages to change (recall ${gone && gone.vendorId}, edit ${edit && edit.vendorId}; the recalled one is the room's newest: ${gone === newest})`);
const PNG_DIR = process.env.CRV_PNG_DIR || ROOT;
const shot = async (p, file) => { const r = await p.cdp('Page.captureScreenshot', { format: 'png' }); const b = r.result && r.result.data; if (b) fs.writeFileSync(path.join(PNG_DIR, file), Buffer.from(b, 'base64')); return !!b; };
const OPEN = (tag) => `(async () => {
  const w = window.app.openChannel('fake-poll', ${J(C)});
  try { window.app.wm.toggleMaximize(w.id); } catch {}
  for (let i = 0; i < 200; i++) { if (w.content.querySelector('.chanmsg[data-vid=${J(String(gone.vendorId))}]') && w.content.querySelector('.chanmsg[data-vid=${J(String(edit.vendorId))}]')) break; await new Promise((r) => setTimeout(r, 100)); }
  window.__w = window.__w || {}; window.__w[${J(tag)}] = w;
  const a = w.content.querySelector('.chanmsg[data-vid=${J(String(gone.vendorId))}]'), b = w.content.querySelector('.chanmsg[data-vid=${J(String(edit.vendorId))}]');
  return { found: !!(a && b), recalled: !!(a && a.classList.contains('chanmsg-recalled')), versions: !!(b && b.querySelector('.chanmsg-versions')), text: b ? b.textContent : '' };
})()`;
const STATE = (tag) => `(() => {
  const w = window.__w[${J(tag)}];
  const a = w.content.querySelector('.chanmsg[data-vid=${J(String(gone.vendorId))}]'), b = w.content.querySelector('.chanmsg[data-vid=${J(String(edit.vendorId))}]');
  const line = a && a.querySelector('.chanmsg-recall-line'), kept = a && a.querySelector('.chanmsg-kept');
  const vt = b && b.querySelector('.chanmsg-versions-tog'), vl = b && b.querySelector('.chanmsg-versions-list');
  return { noReload: window.__noReload === 1, recalled: !!(a && a.classList.contains('chanmsg-recalled')), line: line ? line.textContent : '', keptHidden: kept ? kept.hidden : null, kept: kept ? kept.textContent : '',
    body: b ? (b.querySelector('.chanmsg-body') || {}).textContent || '' : '', tog: vt ? vt.textContent : '', listHidden: vl ? vl.hidden : null, items: vl ? [...vl.querySelectorAll('li')].map((li) => li.textContent) : [],
    rows: w.content.querySelectorAll('.chanmsg[data-vid=${J(String(gone.vendorId))}]').length };
})()`;
const p1 = await newPage({ lang: 'zh' }), p2 = await newPage({ lang: 'zh' });
ok(p1.ready && p2.ready, 'two desk tabs (1100) loaded the app');
const o1 = await p1.evaljs(OPEN('a')), o2 = await p2.evaljs(OPEN('b'));
ok(o1.found && o2.found && !o1.recalled && !o1.versions && !o2.recalled, 'both rows are drawn plain in both tabs (nothing learned yet)', J([o1, o2]));
console.log('(r) a stored message recalled — the recheck by id');
const EDITED = 'the second words — edited after it was stored';
fs.writeFileSync(REVS, JSON.stringify({ revisions: { [gone.vendorId]: { state: 'recalled' }, [edit.vendorId]: { state: 'edited', editedAt: Date.now() - 1000, text: EDITED } } }));
const press = await api('POST', `/api/channels/fake-poll/${encodeURIComponent(C)}/refresh`, {});
let s1 = null, s2 = null;
// a message the boot passes re-read seconds ago keeps its slot (RECHECK_FORCED_MS): the owner presses again, as a person would
for (let i = 0; i < 240; i++) { s1 = await p1.evaljs(STATE('a')); s2 = await p2.evaljs(STATE('b')); if (s1.recalled && s2.recalled && s1.tog && s2.tog) break; if (i % 24 === 23) await api('POST', `/api/channels/fake-poll/${encodeURIComponent(C)}/refresh`, {}); await sleep(250); }
const who = (gone.author.display || gone.author.name || gone.author.id);
if (!s1.recalled) { try { console.log(fs.readFileSync(path.join(ROOT, 'server.log'), 'utf8').split('\n').filter((l) => /recheck|revision/i.test(l)).slice(-12).join('\n')); } catch {} }
ok(press.status === 200 && s1.recalled && s2.recalled && s1.noReload && s2.noReload && s1.rows === 1, `the OWNER's Refresh rechecks by id: the row folds IN PLACE in BOTH tabs (no reload, one row)`, J({ press: press.status, s1, s2 }));
ok(s1.line.includes(`${who} 撤回了一条消息`) && s1.line.includes('展开') && s1.keptHidden === true, `the folded line: "${s1.line}" (▸ 展开, the content hidden)`);
ok(await shot(p1, 'recalled.png'), 'recalled.png (desk 1100, folded)');
const ex = await p1.evaljs(`(() => { const a = window.__w.a.content.querySelector('.chanmsg[data-vid=${J(String(gone.vendorId))}] .chanmsg-recall-tog'); a.click(); return true; })()`);
const s3 = await p1.evaljs(STATE('a'));
ok(ex && s3.keptHidden === false && s3.kept.includes(String(gone.text).trim().split('\n')[0].slice(0, 20)) && s3.kept.includes('撤回于') && s3.line.includes('折叠'), '▸ 展开 shows the KEPT content (never erased) under "撤回于 …"; the toggle says 折叠', J(s3));
const lst = await api('GET', '/api/channels');
const convRow = JSON.stringify(lst.json).includes('"lastRecalled":true');
const pre = await p1.evaljs(`(async () => { const b = document.querySelector('[data-rail="channels"], [data-tab="channels"]'); if (b) b.click(); for (let i = 0; i < 60; i++) { const r = document.querySelector('.chan-row[data-conv="fake-poll/${C}"] .chan-row-last'); if (r) return r.textContent; await new Promise((x) => setTimeout(x, 100)); } return null; })()`);
ok(gone === newest && convRow && typeof pre === 'string' && pre.includes('撤回了一条消息'), `the conversation list's preview says 撤回 when the newest message is recalled ("${pre}")`, J({ convRow, newest: newest && newest.vendorId }));
console.log('(e) a stored message edited — its versions');
if (!s1.tog) { const g = await api('GET', `/api/channels/fake-poll/${encodeURIComponent(C)}/messages?limit=50`); console.log('API edit row:', J((g.json.records || []).find((r) => r.vendorId === edit.vendorId)).slice(0, 600)); console.log('page errors:', J(await p1.evaljs('window.__errs || []'))); } if (!s1.tog) { try { console.log(fs.readFileSync(path.join(ROOT, 'server.log'), 'utf8').split('\n').filter((l) => /recheck|revis|refused|side record/i.test(l)).slice(-12).join('\n')); } catch {} }
ok(s1.body.includes(EDITED) && s2.body.includes(EDITED) && /已编辑 · .*查看 2 个版本/.test(s1.tog) && s1.listHidden === true, `the row shows the NEWEST body in both tabs and "${s1.tog}" (the list closed)`, J({ body: s1.body, tog: s1.tog }));
await p1.evaljs(`(() => { window.__w.a.content.querySelector('.chanmsg[data-vid=${J(String(edit.vendorId))}] .chanmsg-versions-tog').click(); return true; })()`);
const s4 = await p1.evaljs(STATE('a'));
ok(s4.listHidden === false && s4.items.length === 2 && s4.items[0].includes('原始版本') && s4.items[0].includes(String(edit.text).trim().split('\n')[0].slice(0, 20)) && s4.items[1].includes(EDITED) && s4.tog.includes('收起版本'), 'the expander lists 2 versions with their times — the original first, the edit last', J(s4.items));
ok(await shot(p1, 'edit-history.png'), 'edit-history.png (desk 1100, the versions open)');
console.log('(p) phone 390');
const p3 = await newPage({ lang: 'zh', width: 390, height: 844, mobile: true });
const o3 = p3.ready ? await p3.evaljs(OPEN('c')) : {};
const s5 = o3.found ? await p3.evaljs(STATE('c')) : {};
ok(p3.ready && o3.found && s5.recalled && s5.line.includes('撤回了一条消息') && /查看 2 个版本/.test(s5.tog), 'phone 390: the folded recall and the versions expander, same words', J(s5));
await p3.evaljs(`(() => { const c = window.__w.c.content; c.querySelector('.chanmsg[data-vid=${J(String(gone.vendorId))}] .chanmsg-recall-tog').click(); c.querySelector('.chanmsg[data-vid=${J(String(edit.vendorId))}] .chanmsg-versions-tog').click(); c.querySelector('.chanmsg[data-vid=${J(String(gone.vendorId))}]').scrollIntoView({ block: 'start' }); return true; })()`);
await sleep(300);
ok(await shot(p3, 'phone.png'), 'phone.png (390, both open)');
// the recheck is done for a recalled message: a second Refresh asks nothing more of it, and the record still holds its words
const again = await api('GET', `/api/channels/fake-poll/${encodeURIComponent(C)}/messages?limit=50`);
const kept = (again.json.records || []).find((r) => r.vendorId === gone.vendorId);
ok(kept && kept.recalledAt > 0 && kept.text === gone.text, 'the stored copy keeps its words after the recall (recalledAt set, text unchanged)', J(kept && { recalledAt: kept.recalledAt, text: kept.text }));
for (const p of [p1, p2, p3]) p.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
