#!/usr/bin/env node
// test-app-register-ui — APP REGISTRATION, the launcher half, in a real browser (lane app-register-ui, owner 2026-10-11:
// an agent-installed JASP sat under "Installed outside VibeSpace"; one press should make it VibeSpace's own, with its
// launch options and how to remove it). A THROWAWAY server in a git worktree + headless chrome over raw CDP; the
// desktop-apps routes answer THE CONTRACT from an in-page stub (the server half is the sibling lane app-register-model —
// rows `registered/launch/removable/source/exec/args`, adopt-prefill, adopt, remove), so no xpra / flatpak is touched:
//   ① desk 1100: a registered row with 2 variants — its chip + command line; its "…" lists the default by its label ("Open") + "Open · Safe mode" above
//      Remove… / Show command; "Open · Safe mode" POSTs {appId, variant:'safe'}
//   ② the witnessed JASP card's "Add…" opens the adopt dialog PREFILLED (label, the variant's command + its words as
//      chips, the remove / reinstall recipes, the witness line)
//   ③ a bad_args answer lands under the variants field (the dialog stays); Add then moves the card: JASP leaves the
//      outside group and is in Apps ONCE (no duplicate), the toast says so
//   ④ Remove… shows the recipe verbatim; ok ⇒ the row leaves Apps, the toast says "Removed"
//   ⑤ phone 390: no "Add…" button; a LONG PRESS on the witnessed card opens its menu → Add to VibeSpace… → the adopt
//      dialog is a full-height sheet, nothing wider than the screen
// PNGs desk (no menu over the cards) / desk-menu / adopt / phone (VS_SHOT_DIR); "Add…" is measured whole in its cell. SKIPs by name: no chrome. ~25 s.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
let passed = 0, failed = 0, skipped = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const done = () => { console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASS'} (${passed}${skipped ? `, ${skipped} skipped` : ''}) in ${Math.round((Date.now() - T0) / 1000)} s`); process.exit(failed ? 1 : 0); };
if (!CHROME) { skipped++; console.log('  ⊘ SKIP no chrome on this machine'); done(); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.error('✗ public/bundle.js is not built (npm run build)'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('app-register-ui-wt');
const fakeHome = scratchHome('app-register-ui-home', fs);
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const LOG = path.join(fakeHome, 'server.log');
const fd = fs.openSync(LOG, 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd], detached: true });
fs.closeSync(fd);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { process.kill(-srv.pid, 'SIGKILL'); } catch {}
  for (const root of [wt, fakeHome]) { try { endRootedProcesses(root); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
let up = false; for (let i = 0; i < 160 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); up = true; } catch { await sleep(250); } }
check('the worktree server answered', up, fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').slice(-2000) : '');

// ── THE CONTRACT, stubbed in the page (window.fetch): the sibling's fixture JSON when it exists, else these rows ──
const FIX = '/var/tmp/vibespace-lanes/app-register-model/fixtures';
const readFix = (n) => { try { return JSON.parse(fs.readFileSync(path.join(FIX, n), 'utf8')); } catch { return null; } };
const REG = { id: 'reg.jasp-tools', label: 'JASP Tools', registered: true, removable: true, source: 'agent', available: true, category: 'utility', exec: '/opt/jasp-tools/bin/jasp-tools', args: ['--profile', 'main'],
  launch: [{ id: 'open', label: 'Open' }, { id: 'safe', label: 'Safe mode' }], remove: { exec: '/opt/jasp-tools/uninstall', args: ['--yes'] }, by: { who: 'agent', at: 1791743734821 } };
const SEEN = { id: 'seen.f.org.jaspstats.jasp', label: 'JASP', witnessed: true, source: 'flatpak-user', available: true, category: 'utility', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'] };
const SIB = readFix('adopt-prefill.json'); // the sibling's recorded {request, answer: {row, prefill}} — checked for the contract's keys below
const PREFILL = { label: 'JASP', launch: [{ id: 'open', label: 'Open', exec: 'flatpak', args: ['run', 'org.jaspstats.JASP'] }],
  remove: { exec: 'flatpak', args: ['uninstall', '--user', '-y', 'org.jaspstats.JASP'] }, reinstall: { exec: 'flatpak', args: ['install', '--user', '-y', 'org.jaspstats.JASP'] }, witness: { source: 'flatpak-user', appId: 'org.jaspstats.JASP' } };
const STUB = `(() => {
  const S = window.__reg = { rows: ${JSON.stringify([REG, SEEN])}, posts: [], prefill: ${JSON.stringify(PREFILL)} };
  const f0 = window.fetch;
  const ans = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  window.fetch = function (u, o) {
    const url = String(u), m = (o && o.method) || 'GET', p = url.split('?')[0];
    if (!p.startsWith('/api/desktop/apps')) return f0.apply(this, arguments);
    const body = o && o.body ? JSON.parse(o.body) : null;
    if (m === 'POST') S.posts.push({ p, body });
    if (p === '/api/desktop/apps' && m === 'GET') return ans({ apps: [], registry: S.rows, availability: { backend: 'xpra', caps: {} }, cap: { used: 0, cap: 6 }, hostName: 'stub' });
    if (p === '/api/desktop/apps/adopt-prefill') return ans(S.prefill);
    if (p === '/api/desktop/apps/adopt') {
      if (JSON.stringify(body.launch).includes('BAD')) return ans({ ok: false, code: 'bad_args', error: 'stub: a variant\\'s arguments were refused' });
      const row = { id: 'reg.jasp', label: body.label, registered: true, removable: !!body.remove, remove: body.remove, source: 'flatpak-user', available: true, category: 'utility', exec: body.launch[0].exec, args: body.launch[0].args, launch: body.launch.map((v) => ({ id: v.id, label: v.label })), by: { who: 'user', at: Date.now() } };
      S.rows = S.rows.filter((r) => r.id !== body.seenId).concat([row]);
      return ans({ ok: true, row });
    }
    const rm = /^\\/api\\/desktop\\/apps\\/([^/]+)\\/(remove|forget)$/.exec(p);
    if (rm) { S.rows = S.rows.filter((r) => r.id !== decodeURIComponent(rm[1])); return ans({ ok: true, output: 'Uninstalling org.jaspstats.JASP\\nDone' }); }
    if (p === '/api/desktop/apps' && m === 'POST') return ans({ error: 'stub: the launch was recorded' });
    return f0.apply(this, arguments);
  };
})();`;

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const centerOf = (sel) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const h = document.elementFromPoint(x, y); return { x, y, hits: !!h && (h === e || e.contains(h)) }; })()`);
const realClick = async (sel) => {
  const r = await centerOf(sel); if (!r || !r.hits) return r || false;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y }); await sleep(100);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
};
const clickMenu = (label) => evalJs(`(() => { const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent.trim() === ${JSON.stringify(label)}); if (!it) return false; it.click(); return true; })()`);
const menuRows = () => evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((e) => e.textContent.trim())`);
const shot = async (name) => { const dir = process.env.VS_SHOT_DIR; if (!dir) return; try { const img = await cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64')); } catch {} };
const D = '#desktop-launch-dialog', A = '#desktop-adopt-dialog';
const cards = `(() => { const d = document.querySelector('${D}'); if (!d) return null; const of = (sel) => [...d.querySelectorAll(sel + ' .desktop-launch-card')].map((b) => ({ id: b.dataset.appId, label: b.querySelector('.desktop-launch-card-label')?.textContent, sub: b.querySelector('.desktop-launch-card-sub')?.textContent, chip: b.querySelector('.desktop-launch-chip')?.textContent })); return { apps: of('.desktop-launch-registry'), seen: of('.desktop-launch-seen'), notes: [...d.querySelectorAll('.desktop-launch-catalog-note, .desktop-launch-seen-note')].map((p) => p.textContent) }; })()`;
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
const boot = async (w, h, mobile) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cdp('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  await waitFor(`!!window.app && !!app._desktopAppsAvailable && !!document.getElementById('btn-desktop-apps') && !document.getElementById('loading-screen')`, 20000);
  await evalJs(`document.getElementById('btn-desktop-apps').click(); true`);
  return waitFor(`(${cards})?.seen?.length > 0`, 15000);
};
try {

  console.log('① desk 1100: a registered row with 2 variants');
  check('the Apps dialog lists both groups', await boot(1100, 800, false), await evalJs(cards).catch((e) => String(e)));
  await sleep(300); await shot('desk'); // both groups, no menu over them (desk-menu.png shows the menu)
  let c = await evalJs(cards);
  const reg = c.apps.find((x) => x.id === REG.id);
  check('the registered card: chip "Registered by an agent" + its command, never hidden', !!reg && reg.chip === 'Registered by an agent' && reg.sub.includes('/opt/jasp-tools/bin/jasp-tools --profile main'), c.apps);
  check('each group head explains itself in one line', c.notes.length === 2 && /^Installed through VibeSpace or registered with it/.test(c.notes[0]) && /^Found on this machine but not registered: Add to VibeSpace…/.test(c.notes[1]), c.notes);
  check('the registered card has its "…" (no scale rung here)', await realClick(`${D} .desktop-launch-card[data-app-id="${REG.id}"] ~ .desktop-launch-card-menu`) === true);
  await waitFor(`!!document.querySelector('.context-menu')`, 3000);
  const rows = await menuRows();
  check('its menu: the default variant ("Open") + "Open · Safe mode" above Remove… / Show command', rows.join('|') === 'Open|Open · Safe mode|Remove…|Show command', rows);
  await shot('desk-menu');
  check('"Open · Safe mode" launches the second variant', await clickMenu('Open · Safe mode'));
  await waitFor(`window.__reg.posts.some((x) => x.p === '/api/desktop/apps')`, 5000);
  const launchPost = (await evalJs('window.__reg.posts')).find((x) => x.p === '/api/desktop/apps');
  check('…POST /api/desktop/apps {appId, variant: "safe"}', !!launchPost && launchPost.body.appId === REG.id && launchPost.body.variant === 'safe', launchPost);

  console.log('② the witnessed JASP card → Add to VibeSpace… (prefilled)');
  const addGeo = await evalJs(`(() => { const b = document.querySelector('${D} .desktop-launch-card[data-app-id="${SEEN.id}"] ~ .desktop-launch-card-adopt'); const w = b.parentElement, cell = w.getBoundingClientRect(), q = b.getBoundingClientRect(), cs = getComputedStyle(b); return { text: b.textContent, sw: b.scrollWidth, cw: b.clientWidth, right: q.right, wrapRight: cell.right, w: q.width, wrapW: cell.width, cols: getComputedStyle(w.parentElement).gridTemplateColumns, font: cs.fontSize, pad: cs.padding, minw: cs.minWidth, maxw: cs.maxWidth, flex: cs.flex, ov: cs.overflow }; })()`);
  check('"Add…" shows its whole word beside the card (never clipped, inside its grid cell)', addGeo.text === 'Add…' && addGeo.sw <= addGeo.cw + 1 && addGeo.right <= addGeo.wrapRight + 0.5 && addGeo.w >= 30, addGeo);
  check('the witnessed card carries "Add…" at desk width', await realClick(`${D} .desktop-launch-card[data-app-id="${SEEN.id}"] ~ .desktop-launch-card-adopt`) === true);
  check('the adopt dialog opens', await waitFor(`!!document.querySelector('${A} .desktop-adopt-vcmd') && !document.querySelector('${A} .desktop-adopt-go').disabled`, 8000));
  const pre = await evalJs(`(() => { const d = document.querySelector('${A}'); return { label: d.querySelector('.desktop-adopt-label').value, cmds: [...d.querySelectorAll('.desktop-adopt-vcmd')].map((i) => i.value), chips: [...d.querySelectorAll('.desktop-adopt-variant .desktop-adopt-chip')].map((s) => s.textContent), remove: d.querySelector('.desktop-adopt-remove').value, reinstall: d.querySelector('.desktop-adopt-reinstall').value, witness: d.querySelector('.desktop-adopt-witness').textContent }; })()`);
  check('prefilled: label, the variant\'s command + its words as chips, both recipes, the witness line', pre.label === 'JASP' && pre.cmds.join() === 'flatpak run org.jaspstats.JASP' && pre.chips.join('|') === 'flatpak|run|org.jaspstats.JASP' && pre.remove === 'flatpak uninstall --user -y org.jaspstats.JASP' && pre.reinstall === 'flatpak install --user -y org.jaspstats.JASP' && pre.witness === 'found as Flatpak · yours: org.jaspstats.JASP', pre);
  await shot('adopt');
  const sp = SIB && SIB.answer && SIB.answer.prefill;
  if (sp) check('the sibling\'s recorded prefill has the keys this dialog reads (label, launch[].exec/args, remove)', typeof sp.label === 'string' && Array.isArray(sp.launch) && sp.launch.every((v) => v.exec && Array.isArray(v.args)) && !!sp.remove && Array.isArray(sp.remove.args), sp);
  else { skipped++; console.log('  ⊘ SKIP the sibling\'s fixture prefill is not recorded yet'); }

  console.log('③ a bad_args answer lands under the variants; Add moves the card');
  await evalJs(`document.querySelector('${A} .desktop-adopt-add-variant').click(); true`);
  await evalJs(`(() => { const r = [...document.querySelectorAll('${A} .desktop-adopt-variant')].pop(); r.querySelector('.desktop-adopt-vlabel').value = 'Debug'; const i = r.querySelector('.desktop-adopt-vcmd'); i.value = 'flatpak run --command=BAD org.jaspstats.JASP'; i.dispatchEvent(new Event('input')); return true; })()`);
  await realClick(`${A} .desktop-adopt-go`);
  check('the refusal is said under "Launch variants" (the dialog stays)', await waitFor(`document.querySelector('${A} [data-field="launch"] > .desktop-adopt-err')?.textContent === "stub: a variant's arguments were refused"`, 5000), await evalJs(`document.querySelector('${A}')?.innerText`).catch(() => null));
  await evalJs(`(() => { const i = [...document.querySelectorAll('${A} .desktop-adopt-vcmd')].pop(); i.value = "flatpak run --command='jasp --debug' org.jaspstats.JASP"; i.dispatchEvent(new Event('input')); return true; })()`);
  const chips2 = await evalJs(`[...[...document.querySelectorAll('${A} .desktop-adopt-variant')].pop().querySelectorAll('.desktop-adopt-chip')].map((s) => s.textContent)`);
  check('a quoted argument is ONE word (its chip)', chips2.join('|') === 'flatpak|run|--command=jasp --debug|org.jaspstats.JASP', chips2);
  await realClick(`${A} .desktop-adopt-go`);
  check('Add closes the dialog', await waitFor(`!document.querySelector('${A}')`, 5000));
  check('JASP leaves the outside group and is in Apps ONCE', await waitFor(`(() => { const c = (${cards}); return !c.seen.some((x) => x.label === 'JASP') && c.apps.filter((x) => x.label === 'JASP').length === 1; })()`, 5000), await evalJs(cards));
  const adoptPost = (await evalJs('window.__reg.posts')).filter((x) => x.p === '/api/desktop/apps/adopt').pop();
  check('the adopt POST carried the seenId, both variants as argv and the recipes', !!adoptPost && adoptPost.body.seenId === SEEN.id && adoptPost.body.launch.length === 2 && adoptPost.body.launch[1].args.join('|') === 'run|--command=jasp --debug|org.jaspstats.JASP' && adoptPost.body.remove.args.join(' ') === 'uninstall --user -y org.jaspstats.JASP', adoptPost);
  check('the toast says so', await waitFor(`[...document.querySelectorAll('.toast, [class*="toast"]')].some((e) => e.textContent.includes('JASP is now in your Apps'))`, 4000));

  console.log('④ Remove… shows the recipe; ok ⇒ the row leaves');
  await realClick(`${D} .desktop-launch-card[data-app-id="reg.jasp"] ~ .desktop-launch-card-menu`);
  await waitFor(`!!document.querySelector('.context-menu')`, 3000);
  check('the adopted card\'s menu: its 2 variants + Remove…', (await menuRows()).join('|') === 'Open|Open · Debug|Remove…|Show command', await menuRows());
  await clickMenu('Remove…');
  check('the confirm shows the recipe verbatim', await waitFor(`[...document.querySelectorAll('.dialog-overlay')].some((o) => o.textContent.includes('This runs as you: flatpak uninstall --user -y org.jaspstats.JASP'))`, 4000));
  await evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay')].pop(); o.querySelector('.btn-create').click(); return true; })()`);
  check('ok ⇒ the row leaves Apps; the toast says "Removed"', await waitFor(`!(${cards}).apps.some((x) => x.id === 'reg.jasp') && [...document.querySelectorAll('.toast, [class*="toast"]')].some((e) => e.textContent.trim().endsWith('Removed') || e.textContent.includes('Removed'))`, 5000), await evalJs(cards));

  console.log('⑤ phone 390: the long-press menu + the adopt sheet');
  check('the phone dialog lists the witnessed group', await boot(390, 844, true));
  check('no "Add…" button on a phone (the long press has it)', await evalJs(`(() => { const b = document.querySelector('${D} .desktop-launch-card-adopt'); return !!b && getComputedStyle(b).display === 'none'; })()`));
  const at = await centerOf(`${D} .desktop-launch-card[data-app-id="${SEEN.id}"]`);
  await cdp('Input.synthesizeTapGesture', { x: Math.round(at.x), y: Math.round(at.y), duration: 1200, tapCount: 1, gestureSourceType: 'touch' });
  check('a long press opens the card\'s menu with Add to VibeSpace…', await waitFor(`[...document.querySelectorAll('.context-menu .context-menu-item')].some((e) => e.textContent.trim() === 'Add to VibeSpace…')`, 4000), await menuRows());
  await clickMenu('Add to VibeSpace…');
  await waitFor(`!!document.querySelector('${A} .desktop-adopt-vcmd') && !document.querySelector('${A} .desktop-adopt-go').disabled`, 8000);
  const sheet = await evalJs(`(() => { const d = document.querySelector('${A} .dialog'); const q = d.getBoundingClientRect(); const wide = [...document.querySelectorAll('${A} *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className); return { w: q.width, h: q.height, top: q.top, vw: innerWidth, vh: innerHeight, wide }; })()`);
  check('the adopt dialog is a full-height sheet, nothing wider than the screen', Math.abs(sheet.w - sheet.vw) <= 2 && sheet.h >= sheet.vh - 2 && sheet.top <= 1 && !sheet.wide.length, sheet);
  await shot('phone');
  check('no page errors', !pageErrors.length, pageErrors);
} catch (e) { check('the suite ran to its end', false, String(e && e.stack || e)); }
done();
