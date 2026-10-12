#!/usr/bin/env node
// test-apps-witness-ui — THE APPS LAUNCHER LISTS WHAT IS INSTALLED OUTSIDE VIBESPACE (lane apps-launcher-witness, owner
// 2026-10-11: an agent's `flatpak install --user org.jaspstats.JASP` never appeared). A THROWAWAY server in a git
// worktree (own data/, a scratch HOME holding two user .desktop entries — one whose program is gone) with a STUB
// `flatpak` first on PATH (`list --user` answers JASP's real row; `run <id>` writes its argv + DISPLAY to a marker and
// waits) + headless chrome over raw CDP:
//   ① desk 1100 px: Apps → the group "Installed outside VibeSpace (n)" under the engine's rows — JASP (Flatpak · yours),
//      the user's tool (Desktop entry · yours), the gone one says so (disabled, never hidden); no witnessed card inside
//      the engine's grid
//   ② the filter box finds JASP (and hides the rest); clearing it restores both groups
//   ③ a press on JASP launches THROUGH THE DOOR: POST /api/desktop/apps {appId: seen.f.org.jaspstats.jasp} → the stub
//      `flatpak run org.jaspstats.JASP` runs on the session's private display (its marker)
//   ④ phone 390 px: the group fits (nothing wider than the screen) — PNGs desk.png / phone.png (VS_SHOT_DIR)
//   ⑤ CONTROL — the runner's shape (rel252 mirror red: the GitHub runner has no xpra/Xvnc, so EVERY card is dimmed and
//      a leg that wanted the user's tool pressable went red there, green here): the same server restarted with every
//      display-backend binary (named by the product's own DISPLAY_BACKENDS ladder) off PATH — the user's tool still
//      listed with its own command, dimmed like every card, the launcher saying why. Skipped as redundant when this
//      machine has no backend (① already ran on that shape). ① judges pressable == "a display backend answers".
//   ⓪ lane apps-dialog-fast (owner 2026-10-11: "打开App界面很卡"): the walk is SLOW (the stub's `list` sleeps 3 s) and due
//      (a new entry in the user's directory) — the catalog paints ≤ 300 ms after the press, the group says "listing…",
//      then the rows arrive by the broadcast and patch in place (the same card nodes, the filter kept)
//   ⑥ the distro's own entries (a stub `dpkg` owns every one of them — int255: a system entry dpkg owns NOTHING of is hand-copied
//      and LISTED since rel254 verify F6, so the old "owns none" stub made ⑥ skip silently) are not listed — "n system entries not shown — Show
//      them" reveals them, remembered in the user state
// SKIPs by name: no chrome / no dtach / no xpra (③ only); ⑥ with no system .desktop entry on this machine. ~40 s.
import { execSync, spawn, spawnSync } from 'node:child_process';
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
if (spawnSync('sh', ['-c', 'command -v dtach'], { encoding: 'utf8' }).status !== 0) { skipped++; console.log('  ⊘ SKIP no dtach on this machine'); done(); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.error('✗ public/bundle.js is not built (npm run build)'); process.exit(1); }
const XPRA = spawnSync('sh', ['-c', 'command -v xpra'], { encoding: 'utf8' }).status === 0;

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('apps-witness-wt');
const fakeHome = scratchHome('apps-witness-home', fs);
const stubDir = scratch('apps-witness-stub');
fs.rmSync(stubDir, { recursive: true, force: true }); fs.mkdirSync(stubDir, { recursive: true });
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

// ── the fixture: a stub `flatpak` (JASP as a user flatpak) + two user desktop entries ──
const MARK = path.join(stubDir, 'flatpak-run.json');
fs.writeFileSync(path.join(stubDir, 'flatpak'), `#!/bin/sh
case "$1" in
  list) [ -f ${JSON.stringify(path.join(stubDir, 'slow'))} ] && sleep "$(cat ${JSON.stringify(path.join(stubDir, 'slow'))})"; case " $* " in *" --user "*) printf 'org.jaspstats.JASP\\tJASP\\t0.98.1\\n' ;; esac; exit 0 ;;
  run) printf '{"argv":"%s","display":"%s"}' "$*" "$DISPLAY" > ${JSON.stringify(MARK)}; exec sleep 60 ;;
esac
exit 1
`, { mode: 0o755 });
fs.writeFileSync(path.join(stubDir, 'mytool'), '#!/bin/sh\nexec sleep 60\n', { mode: 0o755 });
// ⑥: `dpkg -S <path>…` — a distro package owns every system entry asked about (the real dpkg is never asked); no drift is known
// in this HOME, so each one is the distro's (int255: "owns none" now means hand-copied ⇒ listed, rel254 verify F6)
fs.writeFileSync(path.join(stubDir, 'dpkg'), '#!/bin/sh\n[ "$1" = -S ] || exit 1\nshift\nfor p in "$@"; do echo "distro-desktop: $p"; done\n', { mode: 0o755 });
fs.writeFileSync(path.join(stubDir, 'slow'), '3'); // ⓪: every `flatpak list` takes 3 s
const apps = path.join(fakeHome, '.local', 'share', 'applications'); fs.mkdirSync(apps, { recursive: true });
fs.writeFileSync(path.join(apps, 'my-tool.desktop'), `[Desktop Entry]\nType=Application\nName=My Witness Tool\nExec=${path.join(stubDir, 'mytool')} %F\nCategories=Utility;\n`);
fs.writeFileSync(path.join(apps, 'gone-app.desktop'), '[Desktop Entry]\nType=Application\nName=Gone Witness App\nExec=/opt/vs-witness-gone/bin/gone\n');
fs.writeFileSync(path.join(apps, 'hidden.desktop'), '[Desktop Entry]\nType=Application\nName=Hidden Witness\nNoDisplay=true\nExec=true\n');

// ⑤'s PATH: every PATH dir holding a display-backend binary becomes a symlink farm without those binaries — the
// binaries come from the product's own ladder (a census of what the server looks for, never a hand list)
const BACKEND_BINS = [...new Set(require(path.join(repo, 'src', 'desktop-apps.js')).DISPLAY_BACKENDS.flatMap((r) => r.needs.flat()).filter((b) => !b.includes(':')))];
const noBackendPath = () => process.env.PATH.split(':').filter(Boolean).map((dir, i) => {
  let names; try { names = fs.readdirSync(dir); } catch { return dir; }
  if (!names.some((n) => BACKEND_BINS.includes(n))) return dir;
  const farm = path.join(stubDir, `path-${i}`); fs.mkdirSync(farm, { recursive: true });
  for (const n of names) if (!BACKEND_BINS.includes(n)) { try { fs.symlinkSync(path.join(dir, n), path.join(farm, n)); } catch {} }
  return farm;
}).join(':');

let srv = null;
const LOG = path.join(stubDir, 'server.log');
const startServer = (pathTail) => {
  const fd = fs.openSync(LOG, 'a');
  const p = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: `${stubDir}:${pathTail}`, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd], detached: true });
  fs.closeSync(fd);
  return p;
};
srv = startServer(process.env.PATH);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore', detached: true });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && process.kill(-srv.pid, 'SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} } // every process this suite caused carries one of these roots (the server, xpra, the stub flatpak)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const serverUp = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
const backendNow = async () => { try { return ((await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps`)).json()).availability || {}).backend || null; } catch { return null; } };
const up = await serverUp();
check('the worktree server answered', up, fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').slice(-2000) : '');

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const realClick = async (sel) => {
  const r = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === e || e.contains(hit)), hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 60) : null }; })()`);
  if (!r || !r.hits) return r || false;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await sleep(120);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
};
const typeInto = async (sel, text) => { await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ''; return true; })()`); await cdp('Input.insertText', { text }); };

const shot = async (name) => { const dir = process.env.VS_SHOT_DIR; if (!dir) return; try { const img = await cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64')); } catch (e) { console.log(`  (screenshot ${name} failed: ${e.message})`); } };
const D = '#desktop-launch-dialog';
const groupState = `(() => { const d = document.querySelector('${D}'); if (!d) return null; const sec = d.querySelector('.desktop-launch-seen-sec'); const cards = [...d.querySelectorAll('.desktop-launch-seen .desktop-launch-card-wrap')].filter((w) => !w.hidden).map((w) => { const b = w.querySelector('.desktop-launch-card'); return { id: b.dataset.appId, label: b.querySelector('.desktop-launch-card-label')?.textContent, chip: b.querySelector('.desktop-launch-chip')?.textContent || null, sub: (b.querySelector('.desktop-launch-card-sub')?.textContent || '').replace(b.querySelector('.desktop-launch-chip')?.textContent || '\u0000', '').trim(), subRect: (() => { const s = b.querySelector('.desktop-launch-card-sub'), l = b.querySelector('.desktop-launch-card-label'); if (!s || !l) return null; const a = s.getBoundingClientRect(), c = l.getBoundingClientRect(); return { subLeft: Math.round(a.left), labelLeft: Math.round(c.left), subW: Math.round(a.width) }; })(), disabled: b.disabled }; }); const eng = [...d.querySelectorAll('.desktop-launch-registry .desktop-launch-card-wrap')].filter((w) => !w.hidden).map((w) => w.querySelector('.desktop-launch-card').dataset.appId); return { shown: !!sec && !sec.classList.contains('is-empty') && getComputedStyle(sec).display !== 'none', title: d.querySelector('.desktop-launch-seen-title')?.textContent, cards, eng }; })()`;
try {
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const f0 = window.fetch; window.__launches = []; window.fetch = function (u, o) { try { if (String(u).startsWith('/api/desktop/apps') && o && o.method === 'POST') window.__launches.push(JSON.parse(o.body)); } catch {} return f0.apply(this, arguments); }; })();` });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  await waitFor(`!!window.app && !!app._desktopAppsAvailable && !!document.getElementById('btn-desktop-apps') && !document.getElementById('loading-screen')`, 20000);

  console.log('⓪ the open never waits for a slow walk');
  const WFILE = path.join(wt, 'data', 'desktop-apps-witness.json');
  for (let i = 0; i < 100 && !fs.existsSync(WFILE); i++) await sleep(100); // the startup probe's walk landed
  fs.writeFileSync(path.join(apps, 'late-tool.desktop'), `[Desktop Entry]\nType=Application\nName=Late Witness Tool\nExec=${path.join(stubDir, 'mytool')}\n`);
  await sleep(30);
  const fp = await evalJs(`new Promise((res) => { const t0 = performance.now(); document.getElementById('btn-desktop-apps').click(); (function w() { const d = document.querySelector('${D}'); const n = d ? d.querySelectorAll('.desktop-launch-registry .desktop-launch-card').length : 0; const st = d && d.querySelector('.desktop-launch-seen-state'); if (n && st && !st.hidden) return res({ ms: Math.round(performance.now() - t0), n, state: st.textContent.trim() }); if (performance.now() - t0 > 8000) return res({ ms: -1, n, hidden: st ? st.hidden : null }); requestAnimationFrame(w); })(); })`);
  console.log(`  · time to first card with a due 3 s walk: ${fp.ms} ms`);
  check(`the catalog paints ${fp.ms} ms after the press (≤ 300) while the 3 s walk runs — the group says "listing…"`, fp.ms >= 0 && fp.ms <= 300 && fp.state === 'listing…', fp);
  const g0 = await evalJs(groupState);
  check('the last list is shown meanwhile (JASP), the new entry not yet', (g0.cards || []).some((c) => c.label === 'JASP') && !(g0.cards || []).some((c) => c.label === 'Late Witness Tool'), g0.cards);
  await typeInto(`${D} .desktop-launch-filter`, 'witness'); // (typing re-renders the dialog — the mark below is set after it)
  await evalJs(`(() => { const w = [...document.querySelectorAll('${D} .desktop-launch-seen .desktop-launch-card-wrap')].find((x) => x.textContent.includes('JASP')); if (w) w.__keep = 1; return !!w; })()`);
  check('the rows arrive by the broadcast and patch in — the new entry listed, "listing…" over, the filter kept (JASP filtered out)', await waitFor(`(() => { const s = ${groupState}; return s.cards.some((c) => c.label === 'Late Witness Tool') && !s.cards.some((c) => c.label === 'JASP') && document.querySelector('${D} .desktop-launch-seen-state').hidden && document.querySelector('${D} .desktop-launch-filter').value === 'witness'; })()`, 8000), await evalJs(groupState));
  check('in place: the JASP card is the same node (keyed rows, never a rebuild)', await evalJs(`(() => { const w = [...document.querySelectorAll('${D} .desktop-launch-seen .desktop-launch-card-wrap')].find((x) => x.textContent.includes('JASP')); return !!(w && w.__keep); })()`));
  await evalJs(`(() => { const e = document.querySelector('${D} .desktop-launch-filter'); e.value = ''; e.dispatchEvent(new Event('input')); return true; })()`);
  fs.rmSync(path.join(stubDir, 'slow'));

  console.log('① desk: the group under the engine\'s rows');
  check('the group "Installed outside VibeSpace (n)" appears', await waitFor(`(${groupState})?.shown === true`, 15000), await evalJs(groupState));
  const g = await evalJs(groupState);
  const by = (l) => (g.cards || []).find((c) => c.label === l);
  const BACKEND = await backendNow(); // the launcher dims EVERY card when this machine has no display backend (the runner's shape)
  const mineListed = (m) => !!m && m.chip === 'Desktop entry · yours' && m.sub === path.join(stubDir, 'mytool');
  check('JASP is listed — Flatpak · yours, its command shown', !!by('JASP') && by('JASP').chip === 'Flatpak · yours' && by('JASP').sub === 'flatpak run org.jaspstats.JASP' && by('JASP').id === 'seen.f.org.jaspstats.jasp', g.cards);
  check('the user\'s tool is listed — Desktop entry · yours, its own command shown (never "gone")', mineListed(by('My Witness Tool')), g.cards);
  check(`the user's tool is pressable exactly when a display backend answers (here: ${BACKEND || 'none'})`, !!by('My Witness Tool') && by('My Witness Tool').disabled === !BACKEND, { backend: BACKEND, mine: by('My Witness Tool') });
  check('a gone program stays listed and says so (disabled, never hidden)', !!by('Gone Witness App') && by('Gone Witness App').disabled && /Its program is gone: \/opt\/vs-witness-gone\/bin\/gone/.test(by('Gone Witness App').sub), by('Gone Witness App'));
  check('a NoDisplay entry is not listed', !by('Hidden Witness'));
  check(`the title counts the group (${g.title})`, new RegExp(`^Installed outside VibeSpace \\(${g.cards.length}\\)$`).test(g.title || ''), g.title);
  check('no witnessed card sits in the engine\'s grid', (g.eng || []).every((id) => !id.startsWith('seen.')), g.eng);
  check('the user\'s own rows come first (JASP leads)', g.cards[0] && g.cards[0].chip && /yours/.test(g.cards[0].chip) && g.cards.findIndex((c) => /system/.test(c.chip || '')) !== 0, g.cards.slice(0, 4));
  check('every card\'s command line sits under its name (the chip leads it — never squeezed into the icon column)', g.cards.every((c) => c.subRect && c.subRect.subLeft === c.subRect.labelLeft && c.subRect.subW > 60), g.cards.filter((c) => !(c.subRect && c.subRect.subLeft === c.subRect.labelLeft && c.subRect.subW > 60)).slice(0, 3));
  console.log('⑥ the distro\'s own entries wait behind "Show them"');
  const sysN = await evalJs(`(async () => { const r = await (await fetch('/api/desktop/apps')).json(); return (r.registry || []).filter((x) => x.witnessed && x.distro).length; })()`);
  const more = `(() => { const d = document.querySelector('${D}'); return { shown: !d.querySelector('.desktop-launch-seen-more').hidden, text: d.querySelector('.desktop-launch-seen-more-text').textContent, btn: d.querySelector('.desktop-launch-seen-show').textContent, n: d.querySelectorAll('.desktop-launch-seen .desktop-launch-card-wrap').length, sys: [...d.querySelectorAll('.desktop-launch-seen .desktop-launch-chip')].filter((c) => /system/i.test(c.textContent)).length }; })()`;
  // int255: never vacuous — a machine whose system entries are LISTED but none waits behind the line is a red, not a skip
  const sysListed = await evalJs(`(async () => { const r = await (await fetch('/api/desktop/apps')).json(); return (r.registry || []).filter((x) => x.witnessed && x.source === 'desktop-system' && !x.distro).length; })()`);
  check(`the stub dpkg owns every system entry, so none is listed as hand-copied (${sysListed} listed, ${sysN} hidden)`, sysListed === 0, sysListed);
  if (!sysN) { skipped++; console.log('  ⊘ SKIP no system .desktop entry on this machine'); } else {
    const m0 = await evalJs(more);
    check(`no system entry is listed; the head says "${sysN} system entries not shown — Show them"`, m0.shown && m0.sys === 0 && m0.text === `${sysN} system entries not shown` && m0.btn === 'Show them', m0);
    await realClick(`${D} .desktop-launch-seen-show`);
    check(`Show them reveals the ${sysN} (the line says shown, the button Hide them)`, await waitFor(`(() => { const m = ${more}; return m.n === ${m0.n + sysN} && m.text === '${sysN} system entries shown' && m.btn === 'Hide them'; })()`, 5000), await evalJs(more));
    check('remembered in the user state', await evalJs(`(async () => (await (await fetch('/api/user-state')).json()).desktopAppsShowSystem === true)()`));
    await realClick(`${D} .desktop-launch-seen-show`);
    check('Hide them puts them back behind the line', await waitFor(`(${more}).n === ${m0.n}`, 5000), await evalJs(more));
  }
  await evalJs(`document.querySelector('${D} .desktop-launch-seen-sec').scrollIntoView({ block: 'start' }); true`);
  await sleep(250);
  await shot('desk');

  console.log('② the filter box');
  await typeInto(`${D} .desktop-launch-filter`, 'jasp');
  check('the filter finds JASP and hides the rest (both groups)', await waitFor(`(() => { const s = ${groupState}; return s.cards.length === 1 && s.cards[0].label === 'JASP' && s.eng.length === 0; })()`, 5000), await evalJs(groupState));
  await evalJs(`(() => { const e = document.querySelector('${D} .desktop-launch-filter'); e.value = ''; e.dispatchEvent(new Event('input')); return true; })()`);
  check('clearing it restores both groups', await waitFor(`(() => { const s = ${groupState}; return s.cards.length === ${g.cards.length} && s.eng.length === ${g.eng.length}; })()`, 5000));

  console.log('③ a press launches through the door');
  if (!XPRA) { skipped++; console.log('  ⊘ SKIP no xpra — the launch leg'); }
  else {
    const can = await evalJs(`!document.querySelector('${D} .desktop-launch-card[data-app-id="seen.f.org.jaspstats.jasp"]')?.disabled`);
    check('the JASP card is pressable (a display backend answers)', can, await evalJs(`document.querySelector('${D} .desktop-launch-avail')?.textContent || ''`));
    if (can) {
      check('a real click on JASP', await realClick(`${D} .desktop-launch-card[data-app-id="seen.f.org.jaspstats.jasp"]`) === true);
      check('the press POSTs {appId: seen.f.org.jaspstats.jasp} to the launch door', await waitFor(`(window.__launches || []).some((b) => b.appId === 'seen.f.org.jaspstats.jasp')`, 5000), await evalJs('window.__launches'));
      const ran = await (async () => { for (let i = 0; i < 120; i++) { if (fs.existsSync(MARK)) return JSON.parse(fs.readFileSync(MARK, 'utf8')); await sleep(250); } return null; })();
      check('the stub ran `flatpak run org.jaspstats.JASP` on the session\'s private display', !!ran && ran.argv === 'run org.jaspstats.JASP' && /^:\d+$/.test(ran.display), ran || fs.readFileSync(LOG, 'utf8').slice(-1500));
      const recs = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps`)).json();
      check('the keeper records the session under the witnessed row', (recs.apps || []).some((a) => a.appId === 'seen.f.org.jaspstats.jasp'), (recs.apps || []).map((a) => ({ id: a.id, appId: a.appId, state: a.state })));
      for (const a of recs.apps || []) { try { await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${a.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) }); } catch {} }
    }
  }

  console.log('④ phone 390');
  await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  await evalJs(`document.getElementById('btn-desktop-apps').click(); true`);
  check('the group appears on the phone', await waitFor(`(${groupState})?.shown === true`, 15000));
  await evalJs(`document.querySelector('${D} .desktop-launch-seen-sec').scrollIntoView({ block: 'start' }); true`);
  await sleep(300);
  const wide = await evalJs(`[...document.querySelectorAll('${D} .desktop-launch-seen-sec, ${D} .desktop-launch-seen-sec *, ${D} .desktop-launch-filter')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5); }).map((e) => e.className + ' ' + Math.round(e.getBoundingClientRect().right))`);
  check('nothing in the group (or the filter) is wider than the screen', wide.length === 0, wide);
  const btn = await evalJs(`(() => { const b = document.querySelector('${D} .desktop-launch-seen-recheck'); return b ? { sw: b.scrollWidth, cw: b.clientWidth } : null; })()`);
  check('Check again is never narrower than its words', !!btn && btn.sw <= btn.cw, btn);
  await shot('phone');
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log('⑤ control — the runner\'s shape: no display backend');
  if (!BACKEND) console.log('  (① already ran without a display backend — this machine IS that shape)');
  else {
    await cdp('Page.navigate', { url: 'about:blank' }); await sleep(200);
    try { process.kill(-srv.pid, 'SIGKILL'); } catch {}
    for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); await sleep(100); } catch { break; } }
    srv = startServer(noBackendPath());
    const up5 = await serverUp(); const b5 = up5 ? await backendNow() : 'down';
    check(`the server came back with ${BACKEND_BINS.join('/')} off PATH and no display backend`, up5 && b5 === null, { up5, backend: b5 });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    pageErrors.length = 0;
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await waitFor(`!!window.app && !!app._desktopAppsAvailable && !!document.getElementById('btn-desktop-apps') && !document.getElementById('loading-screen')`, 20000);
    await evalJs(`document.getElementById('btn-desktop-apps').click(); true`);
    check('the group appears without a display backend', await waitFor(`(${groupState})?.shown === true`, 15000), await evalJs(groupState));
    const g5 = await evalJs(groupState);
    const mine5 = (g5.cards || []).find((c) => c.label === 'My Witness Tool');
    const avail5 = await evalJs(`document.querySelector('${D} .desktop-launch-avail')?.textContent || ''`);
    check('the user\'s tool is still listed — Desktop entry · yours, its own command shown (never hidden, never "gone")', mineListed(mine5), g5.cards);
    check('…dimmed like every card, the launcher saying why (No display backend)', !!mine5 && mine5.disabled === true && g5.cards.every((c) => c.disabled) && /No display backend/.test(avail5), { avail5, cards: g5.cards.map((c) => ({ id: c.id, disabled: c.disabled })) });
    check('no page error without a display backend', pageErrors.length === 0, pageErrors.slice(0, 3));
  }
} catch (e) { check('the suite ran to its end', false, e.stack || String(e)); }
done();
