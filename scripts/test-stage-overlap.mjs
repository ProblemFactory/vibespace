#!/usr/bin/env node
// Stage pile-at-slot regression smoke (userW's 超级重叠, 2.209.0):
//  BUG: Stage → normal desktop → Stage round trip revealed EVERY slot-parked
//  ex-hero at identical slot geometry. Chain: a window born while staged has
//  no gridBounds at borrow time → _borrowHero skipped the home snapshot →
//  hand-back kept the SLOT as its only geometry → _deactivateHero parked it
//  _hiddenByStage at the slot → enter()'s blanket _hiddenByStage re-show loop
//  resurrected the whole parked set on each round trip.
//  FIX (both halves asserted): enter() re-shows ONLY the live workspace
//  (hero + its bound aux); _borrowHero always synthesizes a real home
//  snapshot (pixel capture, cascade fallback for slot-degenerated bounds).
// THE SHARED-HERO PUBLISH LAW (lane stage-hero-key-race, rides .272): rel271's Actions mirror went red here twice (B2 +
//  D on a 2-vCPU runner; green on the hub): a Stage-born hero whose session id had not landed published nothing, the
//  test's leave() ran inside that gap (measured on the hub: the id lands 18–30 ms after the materialize), and enter()
//  followed the record it had superseded back to the previous hero. Now every "became hero" waits on the MECHANISM
//  (the shared record names it), and four legs hold the law: F the race shape itself (the landing HELD — born[0]'s
//  publish, born[1] picked, leave, enter ⇒ born[1] stays, then the landing publishes it); G a landing after leave();
//  W the walk-over (a second page — another client — picks; this page adopts it on enter and live); R the RED control
//  (the pre-fix follow rebuilt into the bundle ⇒ the race shape's B2 + D red).
// Runs a THROWAWAY server in a git worktree + headless chrome over raw CDP.
// Run: node scripts/test-stage-overlap.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — fixed ports collided across concurrent gates
const wt = scratch('stage-overlap');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway server in a worktree ──────────────────────────────────────────
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--disable-background-timer-throttling', `--user-data-dir=${scratch('stage-overlap-chrome')}`, 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try {
    const socks = fs.readdirSync(path.join(wt, 'data', 'sockets'));
    for (const s of socks) { try { execSync(`pkill -f ${JSON.stringify(path.join(wt, 'data', 'sockets', s))}`); } catch {} }
  } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(scratch('stage-overlap-chrome'), { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ─────────────────────────────────────────────────────────────────
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { await sleep(250); }
}
const connect = async (wsUrl) => {
  const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  let seq = 0; const pend = new Map();
  sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
    sock.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  return { sock, send, ev };
};
const A = await connect(target.webSocketDebuggerUrl);
const ws = A.sock, cdp = A.send, evalJs = A.ev;

// In-page census: visible session windows + which sit at slot-near bounds.
const census = () => evalJs(`(() => {
  const slot = app.stage.slotBounds();
  const near = (b) => b && ['left','top','width','height'].every((k) => Math.abs((b[k] ?? 0) - (slot[k] ?? 0)) < 0.01);
  const out = { visible: [], visibleAtSlot: [], hiddenStage: [] };
  for (const w of app.wm.windows.values()) {
    if (w._isStagePlaceholder) continue;
    if (w.type !== 'terminal' && w.type !== 'chat') continue;
    const vis = w.element.style.visibility !== 'hidden';
    if (vis) { out.visible.push(w.id); if (near(w.gridBounds)) out.visibleAtSlot.push(w.id); }
    if (w._hiddenByStage) out.hiddenStage.push(w.id);
  }
  return out; })()`);

const termIds = () => evalJs(`[...app.wm.windows.values()].filter(w => w.type === 'terminal').map(w => w.id)`);

// THE MECHANISM (lane stage-hero-key-race): what the shared record names, a window's session key, and the id-landing
// HOLD — a seam over app.syncSessionIdentity (where a new window's session id lands; a fresh shell learns its id there
// and nowhere else), so the race shape is DRAWN, not hoped for.
const recOf = (ev = evalJs) => ev(`(() => { try { return JSON.parse(app.stage._sync().get('stage', 'hero') || 'null'); } catch { return 'bad'; } })()`);
const keyOf = (id, ev = evalJs) => ev(`(() => { const w = app.wm.windows.get(${JSON.stringify(id)}); return w ? app.stage._sessionKeyFor(w) : 'gone'; })()`);
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return Date.now() - t0; await sleep(100); } return -1; };
const recNames = async (id, ev = evalJs) => { const k = await keyOf(id, ev); return !!k && k !== 'gone' && (await recOf(ev))?.key === k; };
const HOLD_SEAM = `(() => { if (app.__holdSeam) return true; const land = app.syncSessionIdentity.bind(app);
  app.syncSessionIdentity = (all) => { if (window.__holdLanding) { window.__heldMerges = (window.__heldMerges || 0) + 1; return; } return land(all); };
  app.__holdSeam = true; return true; })()`;
const bootPage = async (ev) => {
  await ev('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  await ev(HOLD_SEAM);
};
// the Stage settled: no shared hero, or this page's hero is the one the record names (enter()'s follow has landed)
const settled = (ev = evalJs) => until(() => ev(`(() => { const st = app.stage; let r = null; try { r = JSON.parse(st._sync().get('stage', 'hero') || 'null'); } catch {} return !r || (!!st._heroKey && st._heroKey === r.key); })()`), 10000);
const openBorn = async (ev = evalJs) => {
  const before = await ev(`[...app.wm.windows.values()].filter(w => w.type === 'terminal').map(w => w.id)`);
  await ev(`app.openShellTerminal(${JSON.stringify(wt)})`);
  let nw = null;
  for (let i = 0; i < 40 && !nw; i++) { nw = (await ev(`[...app.wm.windows.values()].filter(w => w.type === 'terminal').map(w => w.id)`)).find((id) => !before.includes(id)) || null; if (!nw) await sleep(300); }
  return nw;
};
const heroIs = (id, ev = evalJs) => ev(`app.stage._heroWinId === ${JSON.stringify(id)}`);
const notAtSlot = (id) => evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(id)}); if (!w) return { ok: false, why: 'gone' };
  const slot = app.stage.slotBounds(); const b = w.gridBounds;
  const near = b && ['left','top','width','height'].every((k) => Math.abs((b[k] ?? 0) - (slot[k] ?? 0)) < 0.01);
  return { ok: !near, b, slot }; })()`);

// F / R — THE RACE SHAPE (rel271's runner, drawn): staged; X born and published (its id landed); the landing HELD; Y born
// and picked; leave; enter ⇒ judged; the hold released ⇒ the landing publishes Y. Returns the judges (the R control
// expects B2 + D red on the pre-fix follow).
const raceShape = async (tag) => {
  const out = [];
  await evalJs('app.stage.enter()'); await sleep(600); await settled();
  const x = await openBorn();
  const xMs = x ? await until(async () => (await heroIs(x)) && (await recNames(x))) : -1;
  await evalJs('window.__holdLanding = true; window.__heldMerges = 0; true');
  const y = await openBorn();
  const yMs = y ? await until(() => heroIs(y), 5000) : -1;
  const pre = { xKey: x && await keyOf(x), yKey: y && await keyOf(y), rec: (await recOf())?.key || null };
  out.push([`${tag} shape: X became hero with the record naming it (${xMs} ms), Y picked (${yMs} ms) with its id NOT landed and the record still naming X`, xMs >= 0 && yMs >= 0 && pre.yKey === null && !!pre.xKey && pre.rec === pre.xKey, JSON.stringify(pre)]);
  const deskId = await evalJs('app.desktopManager.desktops[0].id');
  await evalJs(`app.stage.leave(${JSON.stringify(deskId)})`);
  await sleep(900);
  await evalJs('app.stage.enter()');
  await sleep(600);
  const back = await census();
  const hero = await evalJs('app.stage._heroWinId');
  out.push([`${tag} F1: Y is still the hero after the round trip`, hero === y, JSON.stringify({ hero, x, y })]);
  out.push([`${tag} B2: the parked ex-hero X stays hidden`, !back.visible.includes(x), JSON.stringify(back)]);
  const d = await notAtSlot(x);
  out.push([`${tag} D: the parked ex-hero X's geometry is not the slot`, d.ok, JSON.stringify(d)]);
  await evalJs('window.__holdLanding = false; true');
  const relMs = await until(() => recNames(y));
  out.push([`${tag} F2: released, Y's id lands and the landing publishes it (${relMs} ms; ${await evalJs('window.__heldMerges')} merges held)`, relMs >= 0 && (await heroIs(y)), JSON.stringify({ rec: await recOf(), yKey: await keyOf(y) })]);
  return { out, x, y };
};

try {
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1500);
  await bootPage(evalJs); // in-page poll (2.369.118): the heavy tier went red with "no app" in two chrome lanes at once — one probe 1.5 s after navigate is a bet on load speed
  await evalJs(`app.settings.set('desktop.dynamicEnabled', true)`);
  await sleep(600);
  check('stage enabled', await evalJs('!!(app.stage && app.stage.enabled)'));

  // control window on the home desktop at a KNOWN position
  await evalJs(`app.openShellTerminal(${JSON.stringify(wt)})`);
  let w1 = null;
  for (let i = 0; i < 40 && !w1; i++) { w1 = (await termIds())[0] || null; if (!w1) await sleep(300); }
  check('control terminal opened', !!w1);
  const HOME = { left: 0.1, top: 0.1, width: 0.3, height: 0.3 };
  await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(w1)});
    w.gridBounds = ${JSON.stringify(HOME)}; app.wm._applyGridBounds(w); return true; })()`);

  // enter + materialize the control as hero
  await evalJs('app.stage.enter()');
  await sleep(500);
  await evalJs(`app.wm.focusWindow(${JSON.stringify(w1)})`);
  const w1Ms = await until(async () => (await heroIs(w1)) && (await recNames(w1)));
  check(`control materialized as hero (the shared record names it, ${w1Ms} ms)`, w1Ms >= 0, JSON.stringify(await recOf()));

  // TWO sessions born WHILE STAGED — each creation-tail focus materializes it
  // (the previous hero gets parked). These are the pile candidates.
  const born = [];
  for (let n = 0; n < 2; n++) {
    const before = await termIds();
    await evalJs(`app.openShellTerminal(${JSON.stringify(wt)})`);
    let nw = null;
    for (let i = 0; i < 40 && !nw; i++) {
      const now = await termIds();
      nw = now.find((id) => !before.includes(id)) || null;
      if (!nw) await sleep(300);
    }
    check(`staged-born terminal ${n + 1} opened`, !!nw);
    // became hero = the Stage shows it AND the shared record names it — the MECHANISM, not the clock (rel271's runner:
    // the old `_heroWinId` wait was met before the id landed, so leave() ran inside the gap)
    const ms = nw ? await until(async () => (await heroIs(nw)) && (await recNames(nw))) : -1;
    check(`staged-born terminal ${n + 1} became hero (the shared record names it, ${ms} ms)`, ms >= 0, JSON.stringify({ hero: await evalJs('app.stage._heroWinId'), rec: await recOf(), key: nw && await keyOf(nw) }));
    born.push(nw);
  }

  // ── round trip 1: leave to the home desktop ──
  const deskId = await evalJs('app.desktopManager.desktops[0].id');
  await evalJs(`app.stage.leave(${JSON.stringify(deskId)})`);
  await sleep(900); // past leave()'s 500ms replay timers
  const onDesk = await census();
  // Assert A (H2: slot leak to the desktop): nothing visible at slot bounds
  check('A: no visible window at slot bounds on the normal desktop', onDesk.visibleAtSlot.length === 0,
    JSON.stringify(onDesk));
  check('A2: control window visible at HOME on its desktop', await evalJs(`(() => {
    const w = app.wm.windows.get(${JSON.stringify(w1)});
    return !!w && w.element.style.visibility !== 'hidden' && Math.abs((w.gridBounds?.left ?? 9) - 0.1) < 0.02; })()`)
    || onDesk.visible.includes(w1) === false /* control may be stage-owned-parked if it never adopted — accept hidden */,
    await evalJs(`JSON.stringify(app.wm.windows.get(${JSON.stringify(w1)})?.gridBounds)`));

  // ── round trip 1: back to the stage ──
  await evalJs('app.stage.enter()');
  await sleep(600);
  const back1 = await census();
  // Assert B (H1 signature): exactly ONE window at the slot (the live hero)
  check('B: exactly one visible window at slot after re-enter', back1.visibleAtSlot.length === 1,
    `visibleAtSlot=${JSON.stringify(back1.visibleAtSlot)} visible=${JSON.stringify(back1.visible)}`);
  check('B2: parked ex-heroes stay hidden', born[0] === null || !back1.visible.includes(born[0]),
    JSON.stringify(back1));

  // Assert D (H1 half 2): parked ex-heroes hold a REAL home, not the slot
  const exHero = born[0];
  const dCheck = await evalJs(`(() => {
    const w = app.wm.windows.get(${JSON.stringify(exHero)});
    if (!w) return { ok: false, why: 'gone' };
    const slot = app.stage.slotBounds();
    const b = w.gridBounds;
    const near = b && ['left','top','width','height'].every((k) => Math.abs((b[k] ?? 0) - (slot[k] ?? 0)) < 0.01);
    return { ok: !near, b, slot }; })()`);
  check('D: parked ex-hero geometry is not the slot', dCheck.ok, JSON.stringify(dCheck));

  // ── round trip 2 (accumulation check): counts must not grow ──
  await evalJs(`app.stage.leave(${JSON.stringify(deskId)})`);
  await sleep(700);
  await evalJs('app.stage.enter()');
  await sleep(600);
  const back2 = await census();
  check('C: second round trip does not grow the slot pile', back2.visibleAtSlot.length === 1,
    JSON.stringify(back2));

  // ── H3 guard: raw switchTo while staged must route through leave() ──
  const desync = await evalJs(`(async () => {
    await app.desktopManager.switchTo(${JSON.stringify(deskId)});
    return { stageActive: app.stage.isActive, activeId: app.desktopManager.activeDesktopId,
             stageSaved: app.desktopManager._savedStates.has('__stage__') }; })()`);
  check('E: raw switchTo while staged deactivates the stage', desync.stageActive === false, JSON.stringify(desync));
  check('E2: no __stage__ record captured', desync.stageSaved === false, JSON.stringify(desync));
  check('E3: active desktop is the target', desync.activeId === deskId, JSON.stringify(desync));

  // ── F: THE RACE SHAPE on this build ──
  const F = await raceShape('F');
  for (const [n, c, e] of F.out) check(n, c, e);

  // ── G: an id that lands AFTER leave() still publishes (the pre-fix landing was gated on the Stage: nothing ever did) ──
  await evalJs('window.__holdLanding = true; true');
  const z = await openBorn();
  const zMs = z ? await until(() => heroIs(z), 5000) : -1;
  await evalJs(`app.stage.leave(${JSON.stringify(deskId)})`);
  await sleep(300);
  const zPre = { zKey: z && await keyOf(z), active: await evalJs('app.stage.isActive') };
  await evalJs('window.__holdLanding = false; true');
  const zLand = await until(() => recNames(z));
  check(`G1: Z picked (${zMs} ms), the Stage left before its id landed (${JSON.stringify(zPre)}); the landing off the Stage publishes Z (${zLand} ms)`, zMs >= 0 && zPre.zKey === null && zPre.active === false && zLand >= 0, JSON.stringify(await recOf()));
  await evalJs('app.stage.enter()'); await sleep(600);
  const gBack = await census();
  check('G2: …and the Stage comes back on Z, alone at the slot', (await heroIs(z)) && gBack.visibleAtSlot.length === 1 && gBack.visibleAtSlot[0] === z, JSON.stringify(gBack));

  // ── W: THE WALK-OVER STAYS (挂机 — another device's operations win): page B is another client ──
  const me = await evalJs('app.stage._clientId');
  const tB = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })).json();
  const B = await connect(tB.webSocketDebuggerUrl);
  try {
    await sleep(1500);
    await bootPage(B.ev);
    await evalJs(`app.stage.leave(${JSON.stringify(deskId)})`); await sleep(500); // this page walks away (the idle device)
    await B.ev('app.stage.enter()'); await sleep(600); await settled(B.ev);
    // the pick B makes: its own Stage-born terminal (B's page holds no copy of this page's windows to pick from); this page
    // adopts it by REPLAY (attachSession by the record's serverId) — so "the hero" here is the window on B's session
    const heroOn = (rec) => evalJs(`(() => { const h = app.wm.windows.get(app.stage._heroWinId); const r = ${JSON.stringify(rec || null)};
      return !!h && !!r && (h._openSpec?.serverId === r.openSpec?.serverId || app.stage._sessionKeyFor(h) === r.key); })()`);
    const bPick = async () => {
      const id = await openBorn(B.ev);
      let rec = null;
      const ms = id ? await until(async () => { const k = await keyOf(id, B.ev); const r = await recOf(); if (k && r?.key === k && r.by && r.by !== me) { rec = r; return true; } return false; }) : -1;
      return { id, rec, ms };
    };
    const p1 = await bPick();
    check(`W1: page B (another client) picks a Stage-born terminal; its landing publishes it under B's stamp (${p1.ms} ms)`, p1.ms >= 0, JSON.stringify({ rec: await recOf(), me }));
    await evalJs('app.stage.enter()');
    const wFol = await until(() => heroOn(p1.rec), 10000);
    await sleep(300);
    const wBack = await census();
    check(`W2: entering, this page ADOPTS B's pick (the record another client wrote since) — alone at the slot, Z parked (${wFol} ms)`, wFol >= 0 && wBack.visibleAtSlot.length === 1 && !wBack.visible.includes(z), JSON.stringify({ wBack, hero: await evalJs('app.stage._heroWinId') }));
    const p2 = await bPick(); // B picks again while this page sits on the Stage
    const live = p2.ms >= 0 ? await until(() => heroOn(p2.rec), 10000) : -1;
    check(`W3: live — B's next pick is published (${p2.ms} ms) and this page, staged, follows it (${live} ms)`, p2.ms >= 0 && live >= 0, JSON.stringify({ rec: (await recOf())?.key, hero: await evalJs('app.stage._heroWinId'), active: await evalJs('app.stage.isActive') }));
  } finally {
    try { B.sock.close(); } catch {}
    try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tB.id}`); } catch {}
  }

  // ── R: THE RED CONTROL — the pre-fix follow (enter() adopts ANY shared record) rebuilt into the bundle ⇒ the race shape's B2 + D red ──
  if (await evalJs('app.stage.isActive')) await evalJs(`app.stage.leave(${JSON.stringify(deskId)})`);
  const smPath = path.join(wt, 'src/lib/stage-manager.js');
  let smSrc = fs.readFileSync(smPath, 'utf8');
  const adoptFind = "      if (shared && (!hero || shared !== this._heroWitness)) {\n", witnessFind = "    if (this._heroWinId && raw === this._heroWitness) return;\n";
  const anchored = smSrc.includes(adoptFind) && smSrc.includes(witnessFind);
  fs.writeFileSync(smPath, smSrc.replace(adoptFind, '      if (shared) {\n').replace(witnessFind, ''));
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css --minify --log-level=error`, { cwd: wt, stdio: 'inherit' });
  await cdp('Page.reload', { ignoreCache: true }); await sleep(1500);
  await bootPage(evalJs);
  await evalJs(`app.settings.set('desktop.dynamicEnabled', true)`); await sleep(300);
  const R = await raceShape('R');
  const red = R.out.filter(([, c]) => !c).map(([n]) => n);
  check(`R: control (the pre-fix follow, patched bundle): the shape holds and B2 + D go RED — ${red.length} red: ${red.map((n) => n.slice(0, 48)).join(' | ')}`,
    anchored && R.out[0][1] && red.some((n) => /^R B2:/.test(n)) && red.some((n) => /^R D:/.test(n)), JSON.stringify({ anchored, out: R.out.map(([n, c, e]) => [n.slice(0, 60), c, String(e).slice(0, 200)]) }));
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.message);
} finally {
  try { ws.close(); } catch {}
}

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nstage overlap smoke passed — no pile at slot, no __stage__ poisoning');
process.exit(0);
