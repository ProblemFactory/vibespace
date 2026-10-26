'use strict';
/**
 * THE MAC SCREEN SOURCE — a paired Mac's whole display or ONE of its windows as the stream's picture (DEVICE: inside agentd;
 * design q-041 r3 §1/§3 P3m, lane stream-p3m-build; every number: lane stream-p3m-probe's report). createScreen's darwin
 * branch (src/agentd/stream-screen.js) IS this file — the same `{ facts, source }` and the same source interface:
 *   { kind: 'screen', origin, fps, start(onAccessUnit, onEnd), stop(), requestKeyframe(), setTargetKbps(kbps), stats(), inputTarget() }
 * What runs is decided by src/stream-plan.js planMacScreen (PURE); this file keeps THE HELPER and spawns it.
 *
 * THE HELPER (tools/vibespace-screen/vibespace-screen.swift; its text rides this bundle — src/agentd/mac-helper-source.js):
 *   one binary at a FIXED path, ~/.vibespace/helpers/vibespace-screen (+ .version, .state.json — SP.macHelperPaths). It is
 *   spawned DISCLAIMED (SP.macHelperSpawn: its own `--disclaim` re-spawn) so macOS keys Screen Recording / Accessibility on
 *   IT — never on this agent's node (a plain child of the agent is node BY PATH: measured). ensure(): the version file says the
 *   shipped VERSION ⇒ ready. Else, in order: the hub's prebuilt pushed beside it (`vibespace-screen-<VERSION>` — src/server/
 *   desktop-webrtc.js pushes it over the device link when a stream finds no helper) · built HERE when a compiler exists (both
 *   slices at once, lipo, one ad-hoc signature — SP.macBuildPlan; the compiler is found by FILE under `xcode-select -p`, never
 *   by running the /usr/bin trampoline first, which opens the "install the developer tools" dialog on the owner's screen) ·
 *   else `no_helper` naming both recipes. A REPLACED helper whose old version held its Screen Recording grant is a NEW TCC
 *   client (an ad-hoc grant = path + cdhash: measured), so its state says `regrant` until the facts see the grant again — the
 *   plan then refuses `helper_changed_regrant`, never a bare screen_permission.
 *   THE IDENTITY (lane apple-signing — docs/design-apple-signing.zh.md §2–§3): a pushed prebuilt is JUDGED before it is put at the
 *   fixed path (= before any exec; src/mac-helper-identity.js: `codesign --verify --strict` + `-dv --verbose=4` → developer-id /
 *   adhoc / other / unsigned → swapVerdict against HELPER_TEAM_IDS): refused BY NAME `helper_unsigned` (the file removed, the state
 *   says so, the local build stays the fallback — ad-hoc by construction, never pushed); a Developer ID build by a pinned team is
 *   taken even over an installed ad-hoc build of the SAME version — the LAST re-grant (`helper_signed_regrant`): tccd keys a
 *   Developer ID helper on its requirement (identifier + Team ID), so every later version keeps the grant (regrantVerdict). The
 *   facts carry `helper.identity` + `helper.wantSigned`; the offer answer carries them too and the hub pushes its signed prebuilt
 *   once (src/server/desktop-webrtc.js). The fast path (version file + binary, nothing pushed) still runs NOTHING.
 * FACTS (`stream-facts` on a Mac): the helper's own (run disclaimed, so its TCC answer is ITS grant) — displays, windows, TCC,
 *   the lock, its version — and the helper's state; kept FACTS_MS (a window source re-reads once when its window is not in them).
 *   THE GRANT'S EVENTS (lane stream-mac-ax-respawn): the helper keeps the last tcc a facts read saw; every read, and the
 *   Accessibility door (openSettings — then ONE forced re-read), reach whoever listens through ONE hook, `helper.onTcc(fn)` —
 *   THE injector (src/input-inject.js macRespawn: a grant that changed under its resident input child replaces that child).
 * THE PICKER (`stream-windows` on a Mac — int304: the one picker of both platforms): the facts' windows in src/stream-window.js's
 *   shape (SP.macWindowRows); `restore` is Windows' only (a Mac's stream of a minimized window ends): restore_unsupported.
 * THE WINDOW LOOK + THE SCREEN TABLE of src/machine-window.js (`window-track`, `display-facts` — lane mac-window-list-helper:
 *   on a Mac NOTHING under node reads the screen): `look()` = fresh facts, refused BY NAME without the helper's Screen Recording
 *   (the window list needs it — never a node-attributed read instead); `look({ windows: false })` = the table (no grant needed,
 *   the facts kept FACTS_MS); `starts(pids)` = each process's start (`ps -o lstart=` — a process read).
 * THE SOURCE: `vibespace-screen --disclaim capture …` → FLV on stdout (SP.flvReader — no new parser), `key` / `bps <n>` on
 *   stdin (a key on the SAME frame; the bitrate LIVE — no encoder restart), JSON lines on stderr (started
 *   → the input's target, frame → a window that moved, stats once a second, end {code}). ENDINGS BY NAME: the helper's end code
 *   (window_minimized, window_gone, display_gone, screen_permission, encoder_failed, capture_failed); an exit without one =
 *   capture_exited (its last stderr line logged). GONE MEANS GONE (lane stream-fallback-never-silent — incident
 *   inc-mvf7z2a3-9sxi): the helper names EVERY SCStream stop display_gone / window_gone (measured: -3805 «application connection
 *   interrupted» the moment a sibling capture ended), so that word is believed only when two facts reads 1 s apart lack the
 *   display / window (SP.judgeGone); else the SAME session captures again in place — a new helper, the same sid, the rate it had
 *   reached — twice a minute at most (SP.captureRestart), then it ends capture_interrupted.
 * THE RATE (lane stream-mac-rate — 「mac画面有了但是压缩的厉害」: the owner's 1440p60 went 8000 → 300 kbps 2.2 s in and stayed —
 *   werift's estimate obeyed, which counts ~one packet a picture: THE ESTIMATE): src/stream-plan.js THE RATE, the window road's rule —
 *   SP.rateFollower with MAC_RATE_RULE: never under the picture's floor (plan.floor — kbpsFloor of its pixels × its rate), an
 *   echo changes nothing, a shortfall held 2 s steps down (`bps`, live), 10 s without one climbs 25 % back toward the cap.
 * THE SOUND (lane speaker-passthrough-v1, backlog B-aec9 — lane stream-audio-probe legs 2a–2d): `source.audio(onPacket, {onEnd})` = the
 *   strip's 「声音」 on THIS session's helper — `audio on` on its stdin turns capturesAudio on in the SAME SCStream (no new TCC class:
 *   it rides Screen Recording, 「屏幕与系统录音」), AudioToolbox encodes Opus, the packets come back as FLV audio tags beside the
 *   pictures (SP.flvReader `audio`) → onPacket. A live switch the helper refuses (its `audio` line names the error) is answered ONCE
 *   by the same capture started again IN PLACE with `--audio` (the picture freezes a moment); `audio off` stops the encoding at
 *   once. A helper started again in place (GONE MEANS GONE) gets the sound back. A NEW HELPER VERSION = the owner switches Screen
 *   Recording on once more for it (helper_changed_regrant — the Machines card says so).
 */
const SP = require('../stream-plan.js');
const SRC = require('./mac-helper-source.js');
const MI = require('../mac-helper-identity.js'); // lane apple-signing: who signed a pushed helper, and whether it goes to the fixed path
const SND = require('../sound-model.js'); // lane speaker-passthrough-v1: the sound's limits + the Opus packet's samples
const MW = require('../machine-window.js');

const FACTS_MS = 30000;
const RUN_MS = 20000;          // one facts run
const BUILD_MS = 120000;       // one swiftc slice at most (measured ≈ 4–6 s a slice on an M4 Pro)
const TAIL = 3;
const named = (code, error, extra) => ({ ok: false, code, error, ...(extra || {}) });
const RECIPE = 'on the Mac: `xcode-select --install` (the Command Line Tools — the agent then builds its screen helper itself), or put the release\'s prebuilt helper in the hub\'s data/bin/helpers/';

/** THE HELPER of this Mac: its fixed place, version, build / prebuilt, TCC memory. */
function createMacHelper({ execFile, fs, home, log = () => { }, now = Date.now, version = SRC.VERSION, source = SRC.SOURCE, env = process.env, teamIds = MI.HELPER_TEAM_IDS, codesign = MI.MAC_CODESIGN } = {}) {
  const P = SP.macHelperPaths(home);
  let building = null;
  const run = (file, args, timeout = RUN_MS, more = null) => new Promise((resolve) => {
    try { execFile(file, args, { env: more ? { ...env, ...more } : env, timeout, maxBuffer: 4 << 20, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })); } catch (e) { resolve({ err: e, stdout: '', stderr: '' }); }
  });
  const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  const installed = () => { try { return fs.readFileSync(P.version, 'utf8').trim() || null; } catch { return null; } };
  const readState = () => { try { const o = JSON.parse(fs.readFileSync(P.state, 'utf8')); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
  const writeState = (o) => { try { fs.mkdirSync(P.dir, { recursive: true }); fs.writeFileSync(P.state + '.tmp', JSON.stringify(o)); fs.renameSync(P.state + '.tmp', P.state); } catch (e) { log(`[stream] mac helper state not written (${e && e.code})`); } };
  /** A compiler on this Mac — by FILE (the Command Line Tools or Xcode under `xcode-select -p`). → '/usr/bin/swiftc' | null */
  async function compiler() {
    const r = await run('/usr/bin/xcode-select', ['-p'], 5000);
    const dirs = [...new Set([r.err ? '' : r.stdout.trim(), '/Library/Developer/CommandLineTools'].filter(Boolean))];
    for (const d of dirs) for (const f of [`${d}/usr/bin/swiftc`, `${d}/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc`]) if (isFile(f)) return '/usr/bin/swiftc'; // statSync follows the CLT's swiftc → swift-frontend link
    return null;
  }
  /** Who signed a file (lane apple-signing): the strict verification, then the facts — both through codesign ON THE MAC. → identityVerdict's */
  async function identityOf(file) {
    const [vf, dv] = MI.verifyPlan(file, codesign);
    const v = await run(vf.file, vf.args, 30000);
    if (v.err) return { kind: 'unsigned', teamId: null, identifier: null, cdhash: null, authority: [], why: `codesign --verify refused it (${(v.stderr.trim().split('\n').pop() || v.err.message || '').slice(0, 160)})` };
    const d = await run(dv.file, dv.args, 30000);
    return MI.identityVerdict(MI.parseCodesignInfo(d.stderr || d.stdout), { teamIds });
  }
  async function build(swiftc) {
    const dir = `${P.dir}/.build-${process.pid}`, src = `${dir}/vibespace-screen.swift`, out = `${dir}/vibespace-screen`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(src, SP.macHelperSourceFile(version, source));
      const plan = SP.macBuildPlan({ swiftc, src, dir, out });
      const t0 = now();
      const slices = await Promise.all(plan.slices.map((s) => run(s.file, s.args, BUILD_MS)));
      const bad = slices.find((r) => r.err);
      if (bad) return named('no_helper', `the screen helper did not build here (${(bad.stderr.trim().split('\n').find((l) => /error/.test(l)) || (bad.err && bad.err.message) || '').slice(0, 200)}) — ${RECIPE}`);
      for (const s of plan.after) { const r = await run(s.file, s.args, 30000); if (r.err) return named('no_helper', `the screen helper did not build here (${s.file}: ${(r.stderr.trim() || r.err.message).slice(0, 160)})`); }
      fs.chmodSync(out, 0o755);
      fs.renameSync(out, P.bin);
      return { ok: true, ms: now() - t0 };
    } catch (e) { return named('no_helper', `the screen helper did not build here (${(e && (e.code || e.message)) || e})`); }
    finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
  function view(extra = {}) {
    const st = readState();
    const identity = st.identity && typeof st.identity === 'object' ? st.identity : null;
    return { state: 'ready', bin: P.bin, dir: P.dir, version, have: installed(), how: st.how || null, buildMs: st.buildMs == null ? null : st.buildMs, regrant: !!st.regrant, granted: !!st.granted, identity, wantSigned: MI.wantSigned(identity, teamIds), refused: st.refused || null, ...extra };
  }
  /** → { state: 'ready', bin, … } | { state: 'missing', code: 'no_helper' | 'helper_unsigned', error, dir, version, have, canBuild } */
  function ensure() {
    const have = installed();
    const pushed = P.incoming(version);
    const hasPushed = isFile(pushed);
    if (have === version && isFile(P.bin) && !hasPushed) return Promise.resolve(view());
    if (building) return building;
    building = (async () => {
      const st = readState();
      const wasGranted = !!(have && st.version === have && (st.granted || st.regrant));
      const from = have && st.version === have && st.identity && typeof st.identity === 'object' ? st.identity : null;
      let how = null, ms = null, why = null, identity = null, refused = !hasPushed && st.refused && typeof st.refused === 'object' ? st.refused : null; // a refusal stands until a push is judged again
      try { fs.mkdirSync(P.dir, { recursive: true }); } catch { /* the build says it */ }
      if (hasPushed) { // lane apple-signing: JUDGED before it is put in place — never exec'd first
        const v = await identityOf(pushed);
        const sv = MI.swapVerdict({ installed: have ? { version: have, identity: from } : null, incoming: { version, identity: v }, teamIds });
        if (sv.take) {
          try { fs.chmodSync(pushed, 0o755); fs.renameSync(pushed, P.bin); how = 'prebuilt'; identity = v.kind === 'developer-id' ? { ...v, requirement: MI.designatedRequirement({ teamId: v.teamId, identifier: v.identifier }) } : v; } catch (e) { why = `the pushed helper could not be put in place (${e && e.code})`; } // the requirement tccd keys the grant on rides the state (what the facts show)
        } else {
          try { fs.unlinkSync(pushed); } catch { /* gone already */ }
          if (sv.code) { refused = { code: sv.code, why: sv.why, at: now() }; log(`[stream] mac screen helper ${version}: a pushed helper was refused (${sv.code} — ${sv.why})`); }
        }
      }
      if (!how && have === version && isFile(P.bin)) { if (refused) writeState({ ...st, refused }); return view(); } // the installed one stays (nothing to swap, or the swap was refused)
      const swiftc = how ? null : await compiler();
      if (!how && swiftc) { const b = await build(swiftc); if (b.ok) { how = 'built'; ms = b.ms; identity = { kind: 'adhoc', teamId: null, identifier: null, cdhash: null, authority: [], why: 'built here (codesign -s -)' }; } else why = b.error; }
      if (!how) {
        if (refused) { if (hasPushed) writeState({ ...st, refused }); return { state: 'missing', code: 'helper_unsigned', error: `${SP.MAC_WHY.helper_unsigned} (${refused.why})`, dir: P.dir, version, have, canBuild: !!swiftc, archs: SP.MAC_HELPER.archs, refused }; }
        return { state: 'missing', code: 'no_helper', error: why || `the Mac has no screen helper ${version} and no compiler to build it — ${RECIPE}`, dir: P.dir, version, have, canBuild: !!swiftc, archs: SP.MAC_HELPER.archs };
      }
      try { fs.writeFileSync(P.version + '.tmp', version); fs.renameSync(P.version + '.tmp', P.version); } catch (e) { return { state: 'missing', code: 'no_helper', error: `the helper's version could not be written (${e && e.code})`, dir: P.dir, version, have, canBuild: !!swiftc }; }
      const regrant = MI.regrantVerdict({ wasGranted, from, to: identity });
      writeState({ version, how, buildMs: ms, at: now(), granted: false, regrant, rowAsked: null, identity, ...(refused ? { refused } : {}) });
      const replaced = have ? ` (replaces ${have}${have === version ? ', the ad-hoc build of the same version' : ''}${regrant ? (identity && identity.kind === 'developer-id' ? ' — its Screen Recording grant does not carry over ONE LAST time: helper_signed_regrant (a Developer ID helper keeps it from now on)' : ' — its Screen Recording grant does not carry over: helper_changed_regrant') : wasGranted ? ' — the same Developer ID identity: the grant carries over' : ''})` : '';
      log(`[stream] mac screen helper ${version} ${how}${ms != null ? ` in ${ms} ms` : ''}${identity ? ` [${identity.kind}${identity.teamId ? ` by team ${identity.teamId}` : ''}]` : ''}${replaced}`);
      return view();
    })().finally(() => { building = null; });
    return building;
  }
  /** What the facts saw (their tcc — or its Screen Recording word alone): the grant under THIS version (a grant seen clears
   *  regrant); the tcc is KEPT and told to every listener (lane stream-mac-ax-respawn: { t: 'facts', to: <accessibility> }). */
  // the state is about the INSTALLED helper: a state file that names no version (a helper put there by hand) is that one's
  const current = () => { const st = readState(); return st.version === version || (!st.version && installed() === version) ? { ...st, version } : null; };
  let tcc = null;
  const tccSubs = new Set();
  const tell = (e) => { for (const fn of [...tccSubs]) { try { fn(e); } catch (err) { log(`[stream] a tcc listener threw (${err && err.message})`); } } };
  function sawTcc(seen) {
    const screen = seen && typeof seen === 'object' ? seen.screen : seen;
    const st = current();
    if (st && screen === 'granted' && (!st.granted || st.regrant)) writeState({ ...st, granted: true, regrant: false });
    if (seen && typeof seen === 'object') { tcc = { screen: seen.screen, accessibility: seen.accessibility }; tell({ t: 'facts', to: tcc.accessibility }); }
  }
  /** The Accessibility door was opened (「打开系统设置」 → that pane): the owner is about to change the grant. */
  function sawDoor(pane) { if (pane === 'accessibility') tell({ t: 'door' }); }
  /** ONE hook: fn hears every facts read ({ t: 'facts', to }) and the door ({ t: 'door' }) — the kept tcc at once. → unsubscribe */
  function onTcc(fn) { tccSubs.add(fn); if (tcc) fn({ t: 'facts', to: tcc.accessibility }); return () => { tccSubs.delete(fn); }; }
  /** Ask the helper once per version to add its (off) row in Settings — the owner then only toggles it. */
  function rowAsked() { const st = current(); if (!st || st.rowAsked === version) return true; writeState({ ...st, rowAsked: version }); return false; }
  const spawnPlan = (cmd, args = []) => SP.macHelperSpawn(P.bin, cmd, args);
  return { paths: P, version, ensure, sawTcc, sawDoor, onTcc, rowAsked, spawnPlan, installed, run };
}

function createMacScreen({ spawn, execFile, env = process.env, fs = require('fs'), log = () => { }, now = Date.now, home = null, helper = null, codesign = MI.MAC_CODESIGN } = {}) {
  const H = helper || createMacHelper({ execFile, fs, home: home || (env && env.HOME) || require('os').homedir(), log, now, env, codesign });
  let memo = null, inflight = null;
  async function readFacts() {
    const h = await H.ensure();
    const base = { ok: true, platform: 'darwin', at: now(), helper: h };
    if (h.state !== 'ready') return { ...base, tcc: { screen: 'unknown', accessibility: 'unknown' }, displays: [], windows: [], primary: { code: h.code, error: h.error } };
    const sp = H.spawnPlan('facts');
    const r = await H.run(sp.file, sp.args, RUN_MS);
    const d = SP.parseMacFacts(r.stdout);
    if (!d.ok) return { ...base, tcc: { screen: 'unknown', accessibility: 'unknown' }, displays: [], windows: [], displaysError: (r.stderr.trim().split('\n').pop() || (r.err && r.err.message) || d.error).slice(0, 200), primary: { code: 'facts_failed', error: d.error } };
    H.sawTcc(d.tcc);
    const facts = { ...base, helper: { ...h, ...(d.tcc.screen === 'granted' ? { regrant: false, granted: true } : {}), reports: d.version, disclaimed: d.disclaimed }, tcc: d.tcc, locked: d.locked, front: d.front, os: d.os, arch: d.arch, displays: d.displays, windows: d.windows };
    const p = SP.planScreen(facts);
    facts.primary = p.ok ? { mode: p.mode, encoder: p.encoder.label, display: p.display.id, w: p.w, h: p.h, fps: p.fps, rung: p.rung } : { code: p.code, error: p.error };
    return facts;
  }
  function facts({ force = false } = {}) {
    if (!force && memo && now() - memo.at < FACTS_MS) return Promise.resolve(memo);
    if (!inflight) inflight = readFacts().then((f) => { memo = f.ok && f.helper && f.helper.state === 'ready' ? f : null; inflight = null; return f; }, (e) => { inflight = null; return named('facts_failed', String((e && e.message) || e)); });
    return inflight;
  }
  /** A session's source: the plan from fresh-enough facts, or its refusal by name (no_helper carries what the hub needs to push one). */
  async function source(msg = {}, { maxKbps = 8000 } = {}) {
    const want = msg.sourceKind === 'window' ? { window: msg.sourceId == null ? '' : String(msg.sourceId) } : { display: msg.sourceId || null };
    let f = await facts();
    let plan = f.ok ? SP.planScreen(f, { ...want, kbps: maxKbps }) : f;
    if (!plan.ok && f.ok) { f = await facts({ force: true }); plan = f.ok ? SP.planScreen(f, { ...want, kbps: maxKbps }) : f; } // a refusal re-reads once (a window opened a second ago, a grant just given)
    if (!plan.ok) {
      if (plan.code === 'no_helper' && f.helper) return { ...plan, helper: { dir: f.helper.dir, version: f.helper.version, archs: SP.MAC_HELPER.archs } };
      if ((plan.code === 'screen_permission' || plan.code === 'helper_changed_regrant' || plan.code === 'helper_signed_regrant') && !H.rowAsked()) registerRow(f);
      return plan;
    }
    return macSource(plan, maxKbps, f);
  }
  /** THE PICKER's list (the agent's `stream-windows` op — int304: the one picker of both platforms): the helper's fresh facts'
   *  windows in THE shape (SP.macWindowRows), or the refusal that keeps them (no helper, Screen Recording off — titles need it). */
  async function windows() {
    const f = await facts({ force: true });
    if (!f.ok) return f;
    const h = f.helper || {};
    if (h.state !== 'ready') return named(h.code || 'no_helper', h.error || SP.MAC_WHY.no_helper);
    if (!f.tcc || f.tcc.screen !== 'granted') { const rc = h.regrant ? SP.macRegrantCode(h) : 'screen_permission'; return named(rc, SP.MAC_WHY[rc], { settings: SP.MAC_SETTINGS.screen }); }
    return { ok: true, platform: 'darwin', helper: { bin: h.bin, version: h.version }, windows: SP.macWindowRows(f) };
  }
  /** THE WINDOW LOOK of src/machine-window.js (window-track: `look()`, fresh) and the screen table (display-facts: `look({ force:
   *  false, windows: false })` — displays need no grant): the helper's facts, or the refusal BY NAME that keeps them — no helper,
   *  or Screen Recording off for vibespace-screen (other apps' windows and titles need it). Never a read under node instead. */
  async function look({ force = true, windows = true } = {}) {
    const f = await facts({ force });
    if (!f.ok) return f;
    const h = f.helper || {};
    if (h.state !== 'ready') return named(h.code || 'no_helper', h.error || SP.MAC_WHY.no_helper);
    if (windows && (!f.tcc || f.tcc.screen !== 'granted')) { const rc = h.regrant ? SP.macRegrantCode(h) : 'screen_permission'; return named(rc, SP.MAC_WHY[rc], { settings: SP.MAC_SETTINGS.screen }); }
    return f;
  }
  /** Each process's start (epoch ms; a pid that does not run is absent) — `ps -o pid= -o lstart=` in the C locale: a PROCESS read
   *  (macOS `open -a` hands the launch to launchd, so the look finds the launched app by its start). */
  async function starts(pids) {
    const list = [...new Set((pids || []).map(Number).filter((p) => Number.isInteger(p) && p > 0))].slice(0, 200);
    if (!list.length) return new Map();
    const r = await H.run('/bin/ps', ['-o', 'pid=', '-o', 'lstart=', '-p', list.join(',')], 5000, { LC_ALL: 'C', LANG: 'C' });
    return MW.psStarts(r.stdout); // ps exits 1 when one pid is gone and still prints the others
  }
  /** 「打开系统设置」 ON the Mac (lane stream-mac-stall — the agent's `settings-open` op): `/usr/bin/open <the pane's deep link>`,
   *  LaunchServices shows System Settings at that pane in the owner's session (measured on the owner's Mac: exit 0 in 77 ms, no
   *  TCC request — `open` needs no grant). The pane BY NAME from SP.MAC_SETTINGS — no text from the hub reaches argv. → { ok, pane }
   *  Lane stream-mac-ax-respawn: the Accessibility pane's door is told to the helper's listeners, and once `open` answers the
   *  facts are re-read (forced) — THE injector replaces an input child born before the door when that read returns. */
  function openSettings(pane) {
    const url = Object.prototype.hasOwnProperty.call(SP.MAC_SETTINGS, pane) ? SP.MAC_SETTINGS[pane] : null;
    if (!url) return Promise.resolve(named('bad_pane', `no Settings pane named ${JSON.stringify(String(pane).slice(0, 20))}`));
    H.sawDoor(pane);
    return new Promise((resolve) => {
      try { execFile('/usr/bin/open', [url], { env, timeout: 10000 }, (err) => resolve(err ? named('open_failed', `open did not show it (${err.code || err.message})`) : { ok: true, pane })); } catch (e) { resolve(named('open_failed', `open did not show it (${(e && e.code) || e})`)); }
    }).then((r) => { if (pane === 'accessibility') facts({ force: true }); return r; });
  }
  /** 「还原它」 is Windows' (a Mac's stream of a minimized window ENDS window_minimized — SCK sends no picture): refused by name. */
  async function restore() { return named('restore_unsupported', 'a minimized Mac window is restored on the Mac itself (its stream ends while it is minimized)'); }
  /** ONE capture that only adds the helper's (off) Screen Recording row — the owner then toggles it; it ends at once. */
  function registerRow(f) {
    const d = (f.displays || []).find((x) => x.main) || (f.displays || [])[0];
    const sp = H.spawnPlan('capture', ['--display', d ? d.id : '1', '--register-row']);
    try { const c = spawn(sp.file, sp.args, { env, stdio: ['ignore', 'ignore', 'ignore'] }); c.on('error', () => { }); } catch { /* the next refusal asks again */ }
  }

  function macSource(plan, maxKbps, f = {}) {
    const st = { aus: 0, keyWaitMs: null, keysAnswered: 0, rateChanges: 0, helper: null, captureRestarts: 0 };
    const rate = SP.rateFollower({ kbps: plan.kbps, cap: maxKbps, floor: plan.floor || 0, rule: SP.MAC_RATE_RULE }); // THE RATE (src/stream-plan.js)
    let child = null, onAu = null, onEnd = null, stopped = false, keyAskedAt = null, t0 = 0, lastTs = -1, started = null, target = null, ended = null;
    let aud = null, withAudio = false; // lane speaker-passthrough-v1: THE SOUND's capture (source.audio) · the helper runs with --audio
    const restartsAt = []; // GONE MEANS GONE: when the capture was started again in place
    const tail = [];
    const say = (line) => { if (child && child.stdin && !child.stdin.destroyed) { try { child.stdin.write(line + '\n'); } catch { /* its exit says it */ } } };
    function finish(code, why) {
      if (stopped) return;
      stopped = true;
      if (child && child.exitCode == null) { try { child.kill(); } catch { /* gone */ } }
      log(`[stream] mac screen source ended: ${code}${why ? ` (${why})` : ''}`);
      try { onEnd && onEnd(code); } catch { /* the host's */ }
    }
    function onLine(l) {
      let o = null;
      try { o = JSON.parse(l); } catch { tail.push(l.slice(0, 200)); if (tail.length > TAIL) tail.shift(); return; }
      if (!o || typeof o !== 'object') return;
      if (o.t === 'started') { started = o; target = SP.macInputTarget(o); if (aud && aud.waiter && o.audio === true) aud.waiter({ on: true }); }
      else if (o.t === 'audio') { if (aud && aud.waiter) aud.waiter(o); else if (aud && aud.state === 'live' && o.on === false && o.error) audioEnded('capture_failed', String(o.error).slice(0, 200)); }
      else if (o.t === 'frame' && started) { started = { ...started, frame: o.frame }; target = SP.macInputTarget(started); }
      else if (o.t === 'stats') st.helper = o;
      else if (o.t === 'end') ended = { code: String(o.code || 'capture_failed').slice(0, 40), error: String(o.error || '').slice(0, 200) };
    }
    function startHelper() {
      const sp = H.spawnPlan(plan.args[0], [...plan.args.slice(1), ...(withAudio ? ['--audio'] : [])]); // lane speaker-passthrough-v1: --audio = the sound from the start (the way back)
      const c = child = spawn(sp.file, sp.args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
      c.on('error', (e) => { if (c === child) finish('capture_failed', `the screen helper: ${e && (e.code || e.message)}`); });
      // its end line may trail the exit: judged once its stderr closed (200 ms at most)
      c.on('exit', (code, sig) => { if (stopped || c !== child) return; let once = false; const go = () => { if (!once) { once = true; died(c, code, sig); } }; if (c.stderr.readableEnded) go(); else { c.stderr.once('close', go); setTimeout(go, 200).unref?.(); } });
      if (c.stdin) c.stdin.on('error', () => { /* its exit says it */ });
      let buf = '';
      c.stderr.setEncoding('utf8');
      c.stderr.on('data', (d) => { if (c !== child) return; buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) onLine(l); } if (buf.length > 65536) buf = ''; });
      const r = SP.flvReader();
      c.stdout.on('data', (d) => {
        if (stopped || c !== child) return;
        for (const ev of r.push(d)) {
          if (ev.type === 'bad') { finish('encoder_failed', ev.error); return; }
          if (ev.type === 'audio') { onAudio(ev); continue; } // lane speaker-passthrough-v1: the sound's packet
          const ts = Math.max(lastTs + 1, Math.round((Math.max(now(), t0) - t0) * 90));
          lastTs = ts;
          st.aus++;
          rate.sent(ev.nalus.reduce((n, x) => n + x.length, 0), now());
          if (ev.key && keyAskedAt != null) { st.keyWaitMs = now() - keyAskedAt; st.keysAnswered++; keyAskedAt = null; }
          try { onAu({ nalus: ev.nalus.filter((n) => (n[0] & 0x1f) !== 9).map((n) => Buffer.from(n.buffer, n.byteOffset, n.length)), key: ev.key, ts90k: ts >>> 0 }); } catch { /* the host's */ }
        }
      });
    }
    /** The helper ended by itself: by its own name — but its display_gone / window_gone only when THE FACTS agree (GONE MEANS
     *  GONE, above); a word the facts refute starts the capture again in this same session (the picture freezes a moment). */
    function died(c, code, sig) {
      if (stopped || c !== child) return;
      const said = ended, gone = plan.kind === 'window' ? 'window_gone' : 'display_gone';
      if (!said || said.code !== gone) { finish(said ? said.code : 'capture_exited', said ? said.error : `the screen helper exit ${code == null ? sig : code}${tail.length ? ': ' + tail[tail.length - 1] : ''}`); return; }
      const want = plan.kind === 'window' ? { window: plan.window.id } : { display: plan.display.id };
      const what = plan.kind === 'window' ? `window ${plan.window.id}` : `display ${plan.display.id}`;
      SP.judgeGone(() => facts({ force: true }), want, (ms) => new Promise((r) => { setTimeout(r, ms); })).then((v) => {
        if (stopped || c !== child) return;
        if (v === 'gone') { finish(said.code, said.error); return; }
        const seen = v === 'present' ? 'still list' : 'could not be read for';
        if (!SP.captureRestart(restartsAt, now())) { finish('capture_interrupted', `the helper said ${said.code} again while the facts ${seen} ${what} (${said.error})`); return; }
        restartsAt.push(now()); st.captureRestarts++; ended = null;
        log(`[stream] mac screen source: the helper said ${said.code} (${said.error}) but the facts ${seen} ${what} — capturing it again in place (${st.captureRestarts})`);
        if (keyAskedAt == null) keyAskedAt = now(); // the new helper's first picture is a key frame
        try { startHelper(); } catch (e) { finish('capture_failed', String((e && e.message) || e)); return; }
        if (rate.kbps !== plan.kbps) say(`bps ${rate.kbps * 1000}`); // the rate the session had reached, not the plan's
        if (aud && aud.state === 'live') { aud.fresh = true; if (!withAudio) say('audio on'); } // lane speaker-passthrough-v1: the sound comes back with it
      });
    }
    // ── THE SOUND (lane speaker-passthrough-v1) ──
    function onAudio(ev) {
      if (!aud || (aud.state !== 'live' && aud.state !== 'starting')) return; // off: the helper's last packets in flight are dropped
      const payload = Buffer.from(ev.payload.buffer, ev.payload.byteOffset, ev.payload.length);
      aud.packets++; aud.bytes += payload.length;
      const fresh = aud.fresh; aud.fresh = false;
      try { aud.onPacket({ payload, samples: SND.opusSamples(payload) || SND.SOUND.samples, fresh, at: now() }); } catch { /* the host's */ }
    }
    function audioEnded(code, error) {
      const a = aud; if (!a) return;
      a.state = 'failed'; a.code = code; a.error = error; a.ended = { why: code, at: now() };
      log(`[stream] mac sound ended: ${code}${error ? ` (${error})` : ''}`);
      try { a.onEnd(code, error); } catch { /* the host's */ }
    }
    /** The same capture again IN PLACE with --audio (a live switch the helper refused): a new helper, the same session. */
    function relaunchWithAudio() {
      const old = child;
      withAudio = true;
      if (keyAskedAt == null) keyAskedAt = now(); // its first picture is a key frame
      try { startHelper(); } catch (e) { return false; }
      if (rate.kbps !== plan.kbps) say(`bps ${rate.kbps * 1000}`);
      if (old) { try { old.stdin.write('quit\n'); } catch { /* gone */ } setTimeout(() => { if (old.exitCode == null) { try { old.kill(); } catch { /* gone */ } } }, 1000).unref?.(); }
      return true;
    }
    function audioCapture(onPacket, { onEnd: onAudioEnd = () => { } } = {}) {
      const a = { state: 'off', road: 'sck', packets: 0, bytes: 0, runs: 0, relaunched: false, startedAt: null, ended: null, code: null, error: null, onPacket, onEnd: onAudioEnd, fresh: true, waiter: null, mark: { at: now(), bytes: 0 } };
      return {
        start() {
          if (stopped) return Promise.resolve(named('not_found', 'the picture ended'));
          aud = a; a.state = 'starting'; a.runs++; a.startedAt = now(); a.fresh = true; a.code = null; a.error = null; a.ended = null;
          return new Promise((resolve) => {
            const done = (v) => { clearTimeout(timer); a.waiter = null; if (v.ok) { a.state = 'live'; log(`[stream] mac sound on (SCK capturesAudio${a.relaunched ? ', the capture started again with --audio' : ''})`); } else { a.state = 'failed'; a.code = v.code; a.error = v.error; } resolve(v); };
            const timer = setTimeout(() => done(named('capture_failed', `the Mac's sound did not start within ${SND.SOUND_LIMITS.startMs / 1000} s`)), SND.SOUND_LIMITS.startMs);
            timer.unref?.();
            a.waiter = (o) => {
              if (o.on === true) { done({ ok: true }); return; }
              const why = String(o.error || 'refused').slice(0, 200);
              if (!a.relaunched && relaunchWithAudio()) { a.relaunched = true; log(`[stream] mac sound: the live switch was refused (${why}) — the capture again with --audio`); return; } // the started line answers
              done(named(/permission|-3801|not authorized/i.test(why) ? 'screen_permission' : 'capture_failed', `the Mac's sound could not start (${why})`));
            };
            if (child) say('audio on'); // a helper started with --audio answers it at once (its stream has the sound already)
            else a.deferred = true; // asked before the picture started (a remembered 「声音」 at the answer): told when the helper starts
          });
        },
        stop(why = 'off') { if (aud === a) aud = null; if (a.state !== 'failed') a.state = 'off'; a.ended = a.ended || { why: String(why).slice(0, 40), at: now() }; a.waiter = null; say('audio off'); },
        stats() {
          const t = now(), dt = Math.max(1, t - a.mark.at) / 1000, kbps = Math.round(((a.bytes - a.mark.bytes) * 8) / dt / 1000);
          a.mark = { at: t, bytes: a.bytes };
          const h = st.helper && st.helper.audio && typeof st.helper.audio === 'object' ? st.helper.audio : null;
          return { state: a.state, road: a.road, packets: a.packets, bytes: a.bytes, kbps, runs: a.runs, relaunched: a.relaunched, startedAt: a.startedAt, ended: a.ended && { ...a.ended }, code: a.code, error: a.error, helper: h ? { packets: Number(h.packets) || 0, buffers: Number(h.buffers) || 0, peakDb: Number.isFinite(Number(h.peakDb)) ? Number(h.peakDb) : null } : null };
        },
      };
    }
    return {
      ok: true, kind: 'screen', origin: plan.origin, fps: plan.fps, mode: plan.mode, encoder: plan.encoder.label, window: plan.window,
      audio: audioCapture, // lane speaker-passthrough-v1: THE SOUND on this session's own SCStream
      // lane stream-mac-stall: THE SWITCHER's rows — the display streamed + the Mac's displays (the helper's facts this plan read; a
      // pick restarts the stream with `source: {kind: 'display', id}`): the strip showed none, so one display was all there was
      // (lane desktop-display-modes: + primary, HDR and the real pixels pw × ph — the Windows rows' shape; x/y/w/h stay points)
      ...(f.tcc ? { tcc: { accessibility: f.tcc.accessibility } } : {}), // lane desktop-display-modes commit 2: the page's Accessibility banner goes when a start's facts say granted
      ...(plan.kind === 'display' && plan.display ? { display: plan.display.id, displays: (f.displays || []).map((d) => ({ id: d.id, main: !!d.main, primary: !!d.main, x: d.x, y: d.y, w: d.w, h: d.h, pw: d.pw, ph: d.ph, hdr: !!d.hdr, name: d.name || null })) } : {}),
      start(onAccessUnit, onEnded) {
        if (onAu || stopped) return;
        onAu = onAccessUnit; onEnd = onEnded || null; t0 = now(); rate.begin(t0);
        if (keyAskedAt == null) keyAskedAt = t0; // the helper's first picture is a key frame
        try { startHelper(); } catch (e) { finish('capture_failed', String((e && e.message) || e)); }
        if (aud && aud.deferred) { aud.deferred = false; say('audio on'); } // lane speaker-passthrough-v1: the sound asked before the picture started
        log(`[stream] mac screen source: ${plan.kind} ${plan.kind === 'window' ? plan.window.id : plan.display.id} ${plan.w}×${plan.h} @ ${plan.fps} fps (${plan.rung}), VideoToolbox ${rate.kbps} kbps (floor ${rate.floor})`);
      },
      stop() { if (stopped) return; stopped = true; say('quit'); const c = child; if (c) setTimeout(() => { if (c.exitCode == null) { try { c.kill(); } catch { /* gone */ } } }, 1000).unref?.(); },
      requestKeyframe() { if (keyAskedAt == null) keyAskedAt = now(); say('key'); },
      setTargetKbps(want) {
        if (!onAu || stopped) return;
        const d = rate.estimate(want, now());
        if (!d.change) return;
        st.rateChanges++;
        say(`bps ${rate.kbps * 1000}`);
        log(`[stream] mac screen source: ${rate.kbps} kbps (${d.why}: the estimate's median ${Math.round(d.median)} kbps, floor ${rate.floor})`);
      },
      stats() {
        const h = st.helper || {};
        return { mode: plan.mode, encoder: plan.encoder.label, encoderId: plan.encoder.id, note: plan.note, kind: plan.kind, display: plan.display ? plan.display.id : null, window: plan.window, w: plan.w, h: plan.h, rung: plan.rung, white: null, kbps: rate.kbps, floor: rate.floor, rate: rate.last,
          encodeMs: h.encMs == null ? null : h.encMs, captureMs: h.capMs == null ? null : h.capMs, timing: 'helper', lowLatency: h.lowLatency == null ? null : h.lowLatency,
          captured: h.captured || 0, idle: h.idle || 0, repeats: h.repeats || 0, aus: st.aus, dropped: h.dropped || 0, restarts: 0, captureRestarts: st.captureRestarts, rateChanges: st.rateChanges, keyWaitMs: st.keyWaitMs, keysAnswered: st.keysAnswered,
          ecoqos: 'n/a' }; // lane stream-sdr-ecoqos: Windows' power throttling (EcoQoS) is not a Mac's — nothing opted out here, no details row
      },
      /** Where the picture sits on the Mac (the helper's started / frame lines) — the injector maps picture pixels with it. */
      inputTarget() { return target; },
      // lane apple-signing: the helper's identity facts ride the offer answer — the hub pushes its SIGNED prebuilt once when `wantSigned`
      helper: { dir: H.paths.dir, version: H.version, identity: (f.helper && f.helper.identity) || null, wantSigned: !!(f.helper && f.helper.wantSigned) },
      // lane desktop-handover: ONE still (`desktop-grab`) is the helper's to take, and the helper has no still verb yet — a new verb
      // is a new helper VERSION, and a new version asks the owner to switch Screen Recording on again: it rides the helper's next
      // version, refused by name until then (the hand-over's input works: the session's own sink above)
      still: () => Promise.resolve({ ok: false, code: 'mac_still_pending', error: 'the Mac\'s screen helper takes no still picture yet — click / type / key / scroll work now; the screenshot comes with the helper\'s next version (the owner then switches Screen Recording on again for it)' }),
    };
  }

  return { facts, source, windows, restore, look, starts, openSettings, helper: H };
}

module.exports = { createMacScreen, createMacHelper, FACTS_MS, RECIPE };
