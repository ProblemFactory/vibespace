#!/usr/bin/env node
// test-app-register-ui — APP REGISTRATION, the launcher half, in a real browser AGAINST THE REAL ROUTES (lane app-register-ui;
// re-pointed by rel254-verify-fixes r2 — in .254 this suite answered adopt-prefill / remove / forget from its own in-page
// stub, so Remove… / Forget shipped dead: a contract between lanes is a census, never a stub). A THROWAWAY server in a git
// worktree, its HOME a scratch one holding the fixtures (a stub `flatpak` listing JASP for the user and uninstalling it, a
// `dpkg` that does not answer, a remove recipe that writes what it ran, a user .desktop "Tool", a seeded manifest with a
// two-variant registered app — its second variant carries env — and one changed outside VibeSpace: a sudo recipe). Only
// the LAUNCH POST is captured in the page (no app is started); every desktop-apps route the launcher calls is the server's:
//   ① desk 1100: the registered card + its command; "…" = Open | Open · Safe mode | Remove… | Show command; the variant's
//      tooltip shows its env (rel254 verify F3); "Open · Safe mode" POSTs {appId, variant:'safe'}
//   ② JASP's "Add…" → the adopt dialog PREFILLED from the REAL GET …/adopt-prefill (command + chips, both recipes, witness)
//   ③ a command the machine cannot run ⇒ the server's bad_exec under "Launch variants"; Add ⇒ JASP leaves the outside group
//      and is in Apps ONCE (the real POST …/adopt)
//   ④ Remove… shows the recipe; ok ⇒ the REAL POST …/:id/remove ran the stub recipe as the user and the card leaves
//   ⑤ Tool added without a recipe ⇒ its menu offers Forget; Forget ⇒ the entry leaves, the program stays — the witness
//      lists Tool outside VibeSpace again
//   ⑥ the changed-outside row: a DISABLED card saying why; its remove refused by name (needs_root), nothing ran
//   ⑦ phone 390: a long press on the outside card → Add to VibeSpace… → a full-height sheet, nothing wider than the screen
// PNGs desk / remove / phone (+ desk-menu, adopt) in VS_SHOT_DIR. SKIPs by name: no chrome. ~40 s.
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
// ── THE FIXTURES, in the scratch HOME (before the server starts): no real flatpak / dpkg ever runs ──
const AM = require(path.join(repo, 'src/app-manifest.js'));
const FBIN = path.join(fakeHome, 'bin'), OPT = path.join(fakeHome, 'opt');
for (const d of [FBIN, OPT, path.join(fakeHome, '.local/share/applications'), path.join(fakeHome, '.local/share/flatpak/app/org.jaspstats.JASP'), path.join(fakeHome, AM.APPS_REL)]) fs.mkdirSync(d, { recursive: true });
const sh = (f, body) => fs.writeFileSync(f, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
sh(path.join(FBIN, 'flatpak'), 'case "$1" in\n list) case "$*" in *--user*) [ -d "$HOME/.local/share/flatpak/app/org.jaspstats.JASP" ] && printf "org.jaspstats.JASP\\tJASP\\t0.19\\n";; esac; exit 0;;\n uninstall) printf "%s|%s\\n" "$*" "$PWD" > "$HOME/uninstall-ran"; rm -r "$HOME/.local/share/flatpak/app/org.jaspstats.JASP"; echo "Uninstalling org.jaspstats.JASP"; echo Done; exit 0;;\nesac\nexit 0');
sh(path.join(FBIN, 'dpkg'), 'exit 2'); // dpkg does not answer ⇒ no system entry is read as "unowned" (the distro's stay hidden)
const TOOLS = path.join(OPT, 'jasp-tools'), TOOL = path.join(OPT, 'tool');
sh(TOOLS, 'exit 0'); sh(TOOL, 'exit 0');
fs.writeFileSync(path.join(fakeHome, '.local/share/applications/tool.desktop'), `[Desktop Entry]\nType=Application\nName=Tool\nExec=${TOOL}\n`);
const ENTRY = (o) => ({ kind: 'registered', packages: [], rows: [], services: [], addedAt: 1791743734821, approvedAt: 1791743734821, by: { kind: 'agent', conversation: 'c-ui' }, witness: null, registered: { session: null, at: 1791743734821 }, ...o });
fs.writeFileSync(path.join(fakeHome, AM.APPS_REL, 'manifest.json'), JSON.stringify({ ...AM.emptyManifest(), entries: [
  ENTRY({ id: 'jasp-tools', label: 'JASP Tools', launch: [{ id: 'default', label: 'Open', exec: TOOLS, args: ['--profile', 'main'] }, { id: 'safe', label: 'Safe mode', exec: TOOLS, args: ['--safe'], env: { JASP_SAFE: '1' } }], remove: { exec: 'flatpak', args: ['uninstall', '--user', '-y', 'org.example.Tools'] } }),
  ENTRY({ id: 'broken', label: 'Broken', launch: [{ id: 'default', label: 'Open', exec: TOOLS, args: [] }], remove: { exec: 'sudo', args: ['rm', '-rf', '/'] } }), // changed outside VibeSpace
] }));
const LOG = path.join(fakeHome, 'server.log');
const fd = fs.openSync(LOG, 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: `${FBIN}:${process.env.PATH}`, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd], detached: true });
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

// ── ONLY the launch is captured in the page (no app starts here); every other desktop-apps route is the REAL server's ──
const REG = { id: 'app.jasp-tools' }, SEEN = { id: 'seen.f.org.jaspstats.jasp' };
const STUB = `(() => {
  const S = window.__reg = { launches: [] };
  const f0 = window.fetch;
  window.fetch = function (u, o) {
    const p = String(u).split('?')[0], m = (o && o.method) || 'GET';
    if (p === '/api/desktop/apps' && m === 'POST') { S.launches.push(JSON.parse(o.body)); return Promise.resolve(new Response(JSON.stringify({ error: 'the launch was recorded (this suite starts no app)' }), { status: 200, headers: { 'Content-Type': 'application/json' } })); }
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
  const toast = (t) => `[...document.querySelectorAll('.toast, [class*="toast"]')].some((e) => e.textContent.includes(${JSON.stringify(t)}))`;
  const confirmOk = () => evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay')].pop(); o.querySelector('.btn-create').click(); return true; })()`);
  // a runnable row's "…" is its scale control (its own rows merged below the default-scale rows); a dimmed one has the plain "…"
  const openMenu = async (id) => { const card = `${D} .desktop-launch-card[data-app-id="${id}"]`; const sel = (await evalJs(`!!document.querySelector('${card} ~ .desktop-launch-card-scale')`)) ? `${card} ~ .desktop-launch-card-scale` : `${card} ~ .desktop-launch-card-menu`; await realClick(sel); return waitFor(`!!document.querySelector('.context-menu')`, 3000); };
  const ownRows = async () => (await menuRows()).filter((r) => /^(Open|Open · .+|Remove…|Forget|Show command|Add to VibeSpace…)$/.test(r)); // the card's own rows (not the scale rungs)
  const manifest = () => JSON.parse(fs.readFileSync(path.join(fakeHome, AM.APPS_REL, 'manifest.json'), 'utf8'));

  console.log('① desk 1100: a registered row with 2 variants (the seeded manifest, the real catalog)');
  check('the Apps dialog lists both groups', await boot(1100, 800, false), await evalJs(cards).catch((e) => String(e)));
  check('the outside group lists JASP (the stub flatpak) and Tool (the user .desktop)', await waitFor(`(() => { const c = (${cards}); return c.seen.some((x) => x.id === '${SEEN.id}') && c.seen.some((x) => x.label === 'Tool'); })()`, 15000), await evalJs(cards));
  await sleep(300); await shot('desk');
  let c = await evalJs(cards);
  const reg = c.apps.find((x) => x.id === REG.id);
  check('the registered card shows its command, never hidden', !!reg && !!reg.chip && reg.sub.includes(`${TOOLS} --profile main`), c.apps);
  check('the registered card has its "…"', await openMenu(REG.id));
  const rows = await ownRows();
  check('its menu: "Open" + "Open · Safe mode" above Remove… / Show command', rows.join('|') === 'Open|Open · Safe mode|Remove…|Show command', rows);
  const tip = await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].find((e) => e.textContent.trim() === 'Open · Safe mode')?.title || ''`);
  check('rel254 verify F3: the variant row shows its env (what it RUNS)', tip === `env JASP_SAFE=1 ${TOOLS} --safe`, tip);
  await shot('desk-menu');
  check('"Open · Safe mode" launches the second variant', await clickMenu('Open · Safe mode'));
  await waitFor(`window.__reg.launches.length > 0`, 5000);
  const launchPost = (await evalJs('window.__reg.launches'))[0];
  check('…POST /api/desktop/apps {appId, variant: "safe"}', !!launchPost && launchPost.appId === REG.id && launchPost.variant === 'safe', launchPost);

  console.log('② JASP → Add to VibeSpace… (prefilled by the REAL GET /api/desktop/apps/adopt-prefill)');
  const addGeo = await evalJs(`(() => { const b = document.querySelector('${D} .desktop-launch-card[data-app-id="${SEEN.id}"] ~ .desktop-launch-card-adopt'); const w = b.parentElement, cell = w.getBoundingClientRect(), q = b.getBoundingClientRect(); return { text: b.textContent, sw: b.scrollWidth, cw: b.clientWidth, right: q.right, wrapRight: cell.right, w: q.width }; })()`);
  check('"Add…" shows its whole word beside the card (never clipped, inside its grid cell)', addGeo.text === 'Add…' && addGeo.sw <= addGeo.cw + 1 && addGeo.right <= addGeo.wrapRight + 0.5 && addGeo.w >= 30, addGeo);
  check('the witnessed card carries "Add…" at desk width', await realClick(`${D} .desktop-launch-card[data-app-id="${SEEN.id}"] ~ .desktop-launch-card-adopt`) === true);
  check('the adopt dialog opens', await waitFor(`!!document.querySelector('${A} .desktop-adopt-vcmd') && !document.querySelector('${A} .desktop-adopt-go').disabled`, 8000));
  const pre = await evalJs(`(() => { const d = document.querySelector('${A}'); return { label: d.querySelector('.desktop-adopt-label').value, cmds: [...d.querySelectorAll('.desktop-adopt-vcmd')].map((i) => i.value), chips: [...d.querySelectorAll('.desktop-adopt-variant .desktop-adopt-chip')].map((s) => s.textContent), remove: d.querySelector('.desktop-adopt-remove').value, reinstall: d.querySelector('.desktop-adopt-reinstall').value, witness: d.querySelector('.desktop-adopt-witness').textContent, bad: d.querySelector('.desktop-adopt-witness').classList.contains('is-bad') }; })()`);
  check('prefilled by the server: label, the command + its words as chips, both recipes, the witness line', !pre.bad && pre.label === 'JASP' && pre.cmds.join() === 'flatpak run org.jaspstats.JASP' && pre.chips.join('|') === 'flatpak|run|org.jaspstats.JASP' && pre.remove === 'flatpak uninstall --user -y org.jaspstats.JASP' && /^flatpak install --user -y .*org\.jaspstats\.JASP$/.test(pre.reinstall) && pre.witness === 'flatpak:org.jaspstats.JASP', pre);
  await shot('adopt');

  console.log('③ the server\'s refusal lands under the variants; Add (the REAL POST …/adopt) moves the card');
  await evalJs(`document.querySelector('${A} .desktop-adopt-add-variant').click(); true`);
  await evalJs(`(() => { const r = [...document.querySelectorAll('${A} .desktop-adopt-variant')].pop(); r.querySelector('.desktop-adopt-vlabel').value = 'Debug'; const i = r.querySelector('.desktop-adopt-vcmd'); i.value = 'nosuchprog-vs-ui --debug'; i.dispatchEvent(new Event('input')); return true; })()`);
  await realClick(`${A} .desktop-adopt-go`);
  check('the server\'s bad_exec is said under "Launch variants" (the dialog stays)', await waitFor(`/nosuchprog-vs-ui does not resolve/.test(document.querySelector('${A} [data-field="launch"] > .desktop-adopt-err')?.textContent || '')`, 8000), await evalJs(`document.querySelector('${A}')?.innerText`).catch(() => null));
  await evalJs(`(() => { const i = [...document.querySelectorAll('${A} .desktop-adopt-vcmd')].pop(); i.value = "flatpak run --command='jasp --debug' org.jaspstats.JASP"; i.dispatchEvent(new Event('input')); return true; })()`);
  const chips2 = await evalJs(`[...[...document.querySelectorAll('${A} .desktop-adopt-variant')].pop().querySelectorAll('.desktop-adopt-chip')].map((s) => s.textContent)`);
  check('a quoted argument is ONE word (its chip)', chips2.join('|') === 'flatpak|run|--command=jasp --debug|org.jaspstats.JASP', chips2);
  await realClick(`${A} .desktop-adopt-go`);
  check('Add closes the dialog', await waitFor(`!document.querySelector('${A}')`, 8000));
  check('JASP leaves the outside group and is in Apps ONCE', await waitFor(`(() => { const c = (${cards}); return !c.seen.some((x) => x.label === 'JASP') && c.apps.filter((x) => x.label === 'JASP').length === 1; })()`, 15000), await evalJs(cards));
  const ej = manifest().entries.find((e) => e.id === 'jasp');
  check('the server recorded both variants as argv and the recipes', !!ej && ej.launch.length === 2 && ej.launch[1].args.join('|') === 'run|--command=jasp --debug|org.jaspstats.JASP' && ej.remove.args.join(' ') === 'uninstall --user -y org.jaspstats.JASP', ej);
  check('the toast says so', await waitFor(toast('JASP is now in your Apps'), 4000));

  console.log('④ Remove… shows the recipe; ok ⇒ the REAL POST …/:id/remove ran it as the user, the card leaves');
  await openMenu('app.jasp');
  check('the adopted card\'s menu: its 2 variants + Remove…', (await ownRows()).join('|') === 'Open|Open · Debug|Remove…|Show command', await ownRows());
  await clickMenu('Remove…');
  check('the confirm shows the recipe verbatim', await waitFor(`[...document.querySelectorAll('.dialog-overlay')].some((o) => o.textContent.includes('This runs as you: flatpak uninstall --user -y org.jaspstats.JASP'))`, 4000));
  await shot('remove');
  await confirmOk();
  check('ok ⇒ the card leaves Apps', await waitFor(`!(${cards}).apps.some((x) => x.id === 'app.jasp')`, 10000), await evalJs(cards));
  const ran = fs.existsSync(path.join(fakeHome, 'uninstall-ran')) ? fs.readFileSync(path.join(fakeHome, 'uninstall-ran'), 'utf8').trim() : '';
  check('the stub recipe RAN as the user, in the home (the real door)', ran === `uninstall --user -y org.jaspstats.JASP|${fakeHome}` && !fs.existsSync(path.join(fakeHome, '.local/share/flatpak/app/org.jaspstats.JASP')) && !manifest().entries.some((e) => e.id === 'jasp'), ran);
  check('the toast names the outcome', await waitFor(`${toast('Removed')} || ${toast('Forgotten')}`, 5000));

  console.log('⑤ Tool added WITHOUT a recipe ⇒ Forget; the program stays and is listed outside again');
  const toolSeen = (await evalJs(cards)).seen.find((x) => x.label === 'Tool');
  await realClick(`${D} .desktop-launch-card[data-app-id="${toolSeen.id}"] ~ .desktop-launch-card-adopt`);
  await waitFor(`!!document.querySelector('${A} .desktop-adopt-vcmd') && !document.querySelector('${A} .desktop-adopt-go').disabled`, 8000);
  check('Tool\'s prefill: its Exec, no recipe', await evalJs(`(() => { const d = document.querySelector('${A}'); return d.querySelector('.desktop-adopt-vcmd').value === ${JSON.stringify(TOOL)} && d.querySelector('.desktop-adopt-remove').value === ''; })()`));
  await realClick(`${A} .desktop-adopt-go`);
  check('Tool is in Apps', await waitFor(`!document.querySelector('${A}') && (${cards}).apps.some((x) => x.id === 'app.tool')`, 15000), await evalJs(cards));
  await openMenu('app.tool');
  check('a row without a recipe offers Forget (not Remove…)', (await ownRows()).join('|') === 'Forget|Show command', await ownRows());
  await clickMenu('Forget');
  await waitFor(`[...document.querySelectorAll('.dialog-overlay')].some((o) => o.textContent.includes('the program stays on this machine'))`, 4000);
  await confirmOk();
  check('Forget ⇒ Tool leaves Apps and the witness lists it outside VibeSpace again; the program stays', await waitFor(`(() => { const c = (${cards}); return !c.apps.some((x) => x.id === 'app.tool') && c.seen.some((x) => x.label === 'Tool'); })()`, 15000) && fs.existsSync(TOOL) && !manifest().entries.some((e) => e.id === 'tool'), await evalJs(cards));

  console.log('⑥ the row changed outside VibeSpace: disabled, its reason said, its remove refused by name');
  const broken = await evalJs(`(() => { const b = document.querySelector('${D} .desktop-launch-card[data-app-id="app.broken"]'); return b && { dis: b.classList.contains('is-unavailable'), sub: b.querySelector('.desktop-launch-card-sub')?.textContent }; })()`);
  check('a DISABLED card: "This entry was changed outside VibeSpace and is not runnable: …"', !!broken && broken.dis && /This entry was changed outside VibeSpace and is not runnable: .*names sudo/.test(broken.sub), broken);
  await openMenu('app.broken');
  check('its menu offers Forget only (no Remove…, no variant)', (await ownRows()).join('|') === 'Forget|Show command', await ownRows());
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
  const rr = await evalJs(`fetch('/api/desktop/apps/app.broken/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(async (r) => ({ s: r.status, j: await r.json() }))`);
  check('its remove is refused by name (needs_root), the entry stays, nothing ran', rr.s === 400 && rr.j.code === 'needs_root' && manifest().entries.some((e) => e.id === 'broken'), rr);

  console.log('⑦ phone 390: the long-press menu + the adopt sheet');
  check('the phone dialog lists the outside group', await boot(390, 844, true));
  check('no "Add…" button on a phone (the long press has it)', await evalJs(`(() => { const b = document.querySelector('${D} .desktop-launch-card-adopt'); return !!b && getComputedStyle(b).display === 'none'; })()`));
  const toolId = (await evalJs(cards)).seen.find((x) => x.label === 'Tool').id;
  const at = await centerOf(`${D} .desktop-launch-card[data-app-id="${toolId}"]`);
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
