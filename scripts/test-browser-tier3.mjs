#!/usr/bin/env node
// BROWSER TIER 3 — agent browser P10 (docs/design-agent-browser-v2 §7.6 /
// §7.1's `local-window` row / §4.9 columns 1-2 / §6.6 / D27 (b) / D31; the §9
// `test-browser-tier3` row, fast half; 2026-09-21).
//   §1 PURE src/window-desktop.js: the closed refusal set, the D27 (b)
//      consent verdict (anything but `true` is OFF), the desktop rows (the bus
//      minus OUR pids and this process, every row marked), the per-verb law on
//      the class (key / click --at refused BY NAME, watch no_live_view, the
//      tree verbs by a11y), the capture verdict matrix (§4.9 columns 1/2 per
//      window), the MEASUREMENT RECORD under the local-oracles discipline with
//      negative controls (a rung wired without its ok cell goes red; a column
//      ok without detail; a tier refused without a name), and `hintAction`,
//      which never answers `auto` and never a switch.
//   §2 PURE registry + switch: the tier is DERIVED from the row (every
//      provider on exactly one of 1/2/3; a profile RECORD carries no `tier`
//      field), the `local-window` row wired behind `provider_needs_consent`,
//      the exact refusal for every capability it lacks (cdp / allowed-domains
//      / pin-tab / live-view / start / switch / sweep / remote — and null on
//      chromium), a tier-3 PROFILE refused `tier3_is_a_window_target`, the
//      site-hint rule (tier legal only while backend === null, the both-at-once
//      negative control), the blocked claim carrying WHO said it and a tier-3
//      sentence that says "your act" and never "detected", the 403/429 hint.
//   §3 THE ENGINE over a fake keeper + a fake helper + the routes: the switch
//      OFF lists nothing of the class and refuses attach `desktop_consent_off`
//      (403, naming the setting); ON lists the bus minus ours, marked; one
//      holder per window; snapshot / click @ref / type @ref reach the helper
//      with the desktop pid; `key` and `click --at` are refused
//      desktop_injection_refused BEFORE any helper call (the fake's log has no
//      entry — and xdotool is "present", so the rule is about the CLASS);
//      watch no_live_view; screenshot capture_unavailable without a DISPLAY;
//      the user's pause through the cookie route ⇒ window_paused for the
//      agent, resume ⇒ verbs again; every audit line of the class carries
//      origin:'desktop'; the lease PERSISTS across an engine rebuild with its
//      origin and the agent's next verb works; the switch OFF drops it at the
//      next verb (audit by:'consent') and at boot; the STATUS map covers every
//      code of the class; the shipped CLI prints the marker and spells the
//      refusals.
// No fixed port, no fixed /tmp name (scripts/scratch.mjs), no real browser,
// no display. Run: node scripts/test-browser-tier3.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DESK = require('../src/window-desktop.js');
const B = require('../src/browser-profiles.js');
const SW = require('../src/browser-switch.js');
const WT = require('../src/window-targets.js');
const ENGINE = require('../src/server/window-targets-engine.js');
const ROUTES = require('../src/routes/window-targets.js');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = scratch('browser-tier3');
fs.mkdirSync(dir, { recursive: true });
const children = new Set();
const cleanup = () => { for (const c of children) { try { c.kill('SIGKILL'); } catch { } } try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// ─────────────────────────────────────────────────────────────────────────────
console.log('§1 PURE src/window-desktop.js');
{
  let threw = null; try { DESK.refuse('nope', 'x'); } catch (e) { threw = e; }
  ok(threw && /unknown refusal code/.test(threw.message), 'the refusal set is CLOSED');
  ok(DESK.isDesktopHandle('dw-123') && !DESK.isDesktopHandle('da-123') && !DESK.isDesktopHandle('dw-') && DESK.pidOfHandle('dw-42') === 42 && DESK.pidOfHandle('x') === null && DESK.desktopHandle(7) === 'dw-7', 'desktop handles are dw-<pid>, nothing else');
  ok(DESK.consentVerdict({ enabled: true }).ok, 'the switch reading true opens the class');
  for (const v of [false, undefined, null, 'true', 1, 'on']) { const r = DESK.consentVerdict({ enabled: v }); ok(!r.ok && r.code === 'desktop_consent_off' && /Settings/.test(r.why) && r.why.includes(DESK.SETTING_LABEL), `anything but true is OFF (${JSON.stringify(v)}) and the refusal names the switch`); }
  const apps = [{ pid: 300, name: 'Zed', children: 2 }, { pid: 100, name: 'Chrome', children: 1 }, { pid: 200, name: 'ours', children: 1 }, { pid: process.pid, name: 'self' }, { pid: null, name: 'nopid' }, { pid: 400, name: '', children: 0 }];
  const rows = DESK.desktopRows(apps, { ourPids: [200], selfPid: process.pid });
  ok(rows.length === 3 && rows.map((r) => r.handle).join() === 'dw-100,dw-400,dw-300' && rows.every((r) => r.origin === 'desktop' && r.yourDesktop === true && r.display === 'your desktop'), `the rows are the bus minus OUR pids and this process, sorted by LABEL (Chrome, pid 400, Zed), every one marked origin:desktop + yourDesktop (${rows.map((r) => r.handle).join(', ')})`);
  ok(rows.find((r) => r.handle === 'dw-400').label === 'pid 400' && rows[0].a11y.pid === 100 && rows[0].pids[0] === 100, 'a nameless app is labelled by pid; the a11y facts ride the row');
  const rec = DESK.desktopRecord(rows[0]);
  ok(rec.id === 'dw-100' && rec.origin === 'desktop' && rec.pids[0] === 100 && rec.exec === null, 'the record a handle resolves to carries the id, the pid and the class');
  const vv = DESK.desktopVerbVerdicts({ a11y: { ok: true } });
  ok(!vv.key.ok && vv.key.code === 'desktop_injection_refused' && !vv['click-at'].ok && vv['click-at'].code === 'desktop_injection_refused' && /typing in/.test(vv.key.why), 'key and click --at are refused BY NAME on the class (the why says whose window it could be)');
  ok(vv.snapshot.ok && vv.click.ok && vv.type.ok && vv.click.note.includes('never degraded'), 'the tree verbs are the road');
  ok(!vv.watch.ok && vv.watch.code === 'no_live_view', 'watch: no live pane for the user\'s own desktop');
  const vv2 = DESK.desktopVerbVerdicts({ a11y: { ok: false, why: 'no bus' } });
  ok(!vv2.snapshot.ok && !vv2.click.ok && /no bus/.test(vv2.type.why) && vv2.key.code === 'desktop_injection_refused', 'no tree ⇒ the tree verbs refuse; the injection refusal is independent');
  ok(DESK.desktopVerbVerdicts({ capture: { ok: true, via: 'x11grab' } }).screenshot.ok && !DESK.desktopVerbVerdicts({ capture: { ok: false, code: 'capture_needs_portal', why: 'w' } }).screenshot.ok, 'screenshot follows the capture verdict');
  ok(DESK.desktopActGate({ verb: 'key' }).code === 'desktop_injection_refused' && DESK.desktopActGate({ verb: 'click', at: '1,2' }).code === 'desktop_injection_refused' && DESK.desktopActGate({ verb: 'click' }).ok && DESK.desktopActGate({ verb: 'type' }).ok, 'the act gate: key / click --at refused, click @ref / type pass');
  // the capture matrix (§4.9 columns 1/2 per window)
  const cv = DESK.captureVerdict;
  ok(cv({ display: null, xWindow: '1', ffmpeg: '/f' }).code === 'capture_unavailable' && /no DISPLAY/.test(cv({ display: null }).why), 'no DISPLAY in the server\'s env ⇒ capture_unavailable naming it');
  ok(cv({ display: ':1', xWindow: '0x10', ffmpeg: '/usr/bin/ffmpeg' }).ok && cv({ display: ':1', xWindow: '0x10', ffmpeg: '/usr/bin/ffmpeg' }).via === 'x11grab', 'an X window + ffmpeg ⇒ x11grab of the window\'s own pixmap');
  ok(cv({ display: ':1', xWindow: '0x10', ffmpeg: null }).code === 'capture_unavailable' && /ffmpeg/.test(cv({ display: ':1', xWindow: '0x10', ffmpeg: null }).why), 'an X window without ffmpeg ⇒ capture_unavailable naming ffmpeg');
  const wl = cv({ display: ':1', sessionType: 'wayland', xWindow: null, ffmpeg: '/f', portal: { screenCast: true, version: 5, windowSources: true } });
  ok(!wl.ok && wl.code === 'capture_needs_portal' && /consent click/.test(wl.why) && /not wired/.test(wl.why) && /v5/.test(wl.why), 'a native Wayland window with the portal present ⇒ capture_needs_portal naming the consent click and that it is not wired');
  ok(cv({ display: ':1', sessionType: 'wayland', xWindow: null, ffmpeg: '/f', portal: { screenCast: false } }).code === 'capture_needs_portal' && cv({ display: ':0', sessionType: 'x11', xWindow: null, ffmpeg: '/f' }).code === 'capture_unavailable', 'no portal ⇒ still named; an X11 session with no window for the pid ⇒ capture_unavailable');
  // the measurement record under the discipline
  const M = DESK.TIER3_MEASUREMENTS;
  ok(DESK.measurementVerdict().ok, 'the shipped record passes the discipline');
  ok(M.columns.captureX11Window.status === 'ok' && M.columns.captureX11Root.status === 'failed' && M.columns.nativeWaylandOnX11.status === 'failed' && M.columns.portalScreenCast.status === 'consent' && M.columns.gnomeIntrospect.status === 'failed' && M.columns.enumerateX11.status === 'partial', 'every §4.9 column carries its named outcome on this box (window pixmap ok, root black, native Wayland invisible to X11, the portal = consent, GNOME Introspect denied)');
  ok(M.sites.tier1.runs.length === 3 && M.sites.tier2.refusal === 'binary_absent' && M.sites.tier3.refusal === 'needs_user' && M.sites.banks.refusal === 'owner_act', '§12.36: three tier-1 readings, and tier 2 / tier 3 / banks each a refusal BY NAME');
  ok(Number.isFinite(M.latency.userXwayland.medianMs) && M.latency.userXwayland.n >= 10 && Number.isFinite(M.latency.ourXvfb.p95Ms), '§12.39: do_action → pixel latency has numbers on the user\'s own Xwayland');
  ok(DESK.WIRED.x11grabWindow === true && DESK.WIRED.portalScreenCast === false && DESK.WIRED.injection === false, 'the WIRED claims: the window pixmap rung, not the portal, not injection');
  const v1 = DESK.measurementVerdict(M, { ...DESK.WIRED, portalScreenCast: true });
  ok(!v1.ok && /wired without its measurement/.test(v1.error) && /portalScreenCast/.test(v1.error), 'NEGATIVE CONTROL: wiring the portal rung without an ok cell goes red');
  const v2 = DESK.measurementVerdict(M, { ...DESK.WIRED, injection: true });
  ok(!v2.ok && /injection/.test(v2.error), 'NEGATIVE CONTROL: wiring injection on the class (never measured) goes red');
  ok(!DESK.measurementVerdict({ ...M, columns: { ...M.columns, captureX11Window: { status: 'ok' } } }).ok, 'NEGATIVE CONTROL: a column claiming ok without its detail goes red');
  ok(!DESK.measurementVerdict({ ...M, sites: { ...M.sites, banks: { status: 'refused' } } }).ok && !DESK.measurementVerdict({ ...M, columns: { ...M.columns, x: { status: 'failed' } } }).ok, 'NEGATIVE CONTROL: a refusal without a name / a failed column without a why goes red');
  // hintAction — never auto, never a switch
  const rowOf = B.providerRow;
  const h3 = DESK.hintAction({ tier: 3, by: 'agent' }, { rowOf });
  ok(h3 && h3.kind === 'suggestion' && h3.tier === 3 && h3.auto === false && h3.act === 'open-window-target' && /no profile is created or re-pointed/.test(h3.text), 'a tier-3 suggestion acts by OPENING A WINDOW TARGET, never automatically');
  ok(DESK.hintAction({ tier: 2 }, { rowOf }).act === 'switch-by-user' && DESK.hintAction({ tier: 1 }, { rowOf }).act === 'none', 'tier 2 = the user\'s switch; tier 1 needs nothing');
  const hb = DESK.hintAction({ backend: 'cloak', by: 'user' }, { rowOf });
  ok(hb.kind === 'preference' && hb.tier === 2 && hb.auto === false && hb.act === 'switch-by-user', 'a backend hint DERIVES its tier from the row and still asks the user');
  ok(DESK.hintAction({ backend: 'local-window' }, { rowOf }).act === 'open-window-target' && DESK.hintAction({ backend: 'local-window' }, { rowOf }).tier === 3, 'a local-window backend hint opens a window target (tier 3 derived)');
  ok(DESK.hintAction(null) === null && DESK.hintAction({ tier: 9 }) === null && [1, 2, 3].every((t) => DESK.hintAction({ tier: t }).auto === false), 'garbage ⇒ null; no shape ever answers auto:true');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§2 PURE: the row, the tier derived from it, the refusals it produces, the site-hint rule');
{
  const lw = B.providerRow('local-window');
  ok(lw.wired === true && lw.tier === 3 && lw.leaseKind === 'window-target' && lw.canSwitchTo === 'no' && lw.ownsDir === false && lw.cdp === false && lw.allowedDomains === false && lw.pinTab === false && lw.consent === DESK.SETTING_KEY, 'the local-window row: WIRED (P10), tier 3, the three "no"s, no cdp / fence / pin-tab, names its consent setting');
  ok(B.providerIds().every((id) => [1, 2, 3].includes(B.providerRow(id).tier)) && B.providerRow('chromium').tier === 1 && B.providerRow('cloud:kernel').tier === 2, 'every provider sits on exactly one tier of 1/2/3 — the tier is a property of the ROW');
  const rec = B.newProfileRecord({ id: 'bp-0000000c', label: 'T', dir: '/x' });
  ok(!('tier' in rec) && !('tier' in B.publicProfileView(rec)), 'a profile RECORD carries no tier field (derived from provider, never stored twice — §3.3)');
  ok(B.providerIds().every((id) => ['cdp', 'allowedDomains', 'pinTab', 'consent'].every((c) => c in B.providerRow(id))), 'every row carries the three new capability cells and the consent cell');
  // the control
  const c0 = B.providerControl('local-window');
  ok(!c0.ok && c0.code === 'provider_needs_consent' && c0.consent === DESK.SETTING_KEY && /Settings/.test(c0.error), 'without the consent reading true ⇒ provider_needs_consent naming the setting');
  ok(B.providerControl('local-window', { desktopConsent: true }).ok && B.providerControl('local-window', { desktopConsent: 'true' }).code === 'provider_needs_consent', 'consent === true admits it; a string does not');
  ok(B.providerControl('local-window', { host: 'dev-1', desktopConsent: true }).code === 'provider_local_only', 'on a host the STRUCTURAL refusal wins (provider_local_only) even with consent');
  ok(B.providerControl('chromium').ok && B.providerControl('cdp', { desktopConsent: false }).ok, 'rows without a consent cell are untouched by the argument');
  // the exact refusal per capability it lacks
  for (const cap of ['cdp', 'allowed-domains', 'pin-tab', 'live-view', 'start', 'switch', 'sweep', 'remote']) { const r = B.capabilityRefusal('local-window', cap); ok(r && r.code === 'provider_lacks_capability' && r.capability === cap && r.error.includes(`cannot ${cap}`), `local-window lacks ${cap} — typed, naming the cell`); }
  ok(/vibespace-window/.test(B.capabilityRefusal('local-window', 'cdp').error) && /no url/.test(B.capabilityRefusal('local-window', 'cdp').error), 'the cdp refusal points at vibespace-window and says there is no url to print');
  ok(/handle/.test(B.capabilityRefusal('local-window', 'pin-tab').error) && /whatever the user opened/.test(B.capabilityRefusal('local-window', 'allowed-domains').error) && /WINDOW TARGET/.test(B.capabilityRefusal('local-window', 'switch').error), 'pin-tab / allowed-domains / switch each say what the class has instead');
  ok(['cdp', 'allowed-domains', 'pin-tab', 'live-view'].every((cap) => B.capabilityRefusal('chromium', cap) === null) && B.capabilityRefusal('cdp', 'cdp') === null && B.capabilityRefusal('cloud:kernel', 'pin-tab') === null, 'CONTROL: the tab-lease rows have every one of those capabilities (null)');
  // a tier-3 PROFILE is refused by name
  const withConsent = (id, o) => B.providerControl(id, { ...o, desktopConsent: true });
  const p1 = B.validateProfileInput({ label: 'Bank', provider: 'local-window' }, { control: withConsent });
  ok(!p1.ok && p1.code === 'tier3_is_a_window_target' && /vibespace-window/.test(p1.error) && /rule 3/.test(p1.error), 'with consent, a local-window PROFILE is refused tier3_is_a_window_target (no record, no re-pointing)');
  ok(B.validateProfileInput({ label: 'Bank', provider: 'local-window' }).code === 'provider_needs_consent' && B.validateProfileInput({ label: 'Bank', provider: 'local-window', host: 'dev-1' }).code === 'provider_local_only', 'without consent ⇒ provider_needs_consent; on a host ⇒ provider_local_only (the structural rung first)');
  const rows = B.providerRows({ desktopConsent: true });
  ok(rows.find((r) => r.id === 'local-window').control.ok === true && B.providerRows().find((r) => r.id === 'local-window').control.code === 'provider_needs_consent', 'providerRows carries the consent verdict per call');
  // the switch to tier 3 is refused as a switch and names the act
  const prof = { id: 'bp-1', label: 'Portal', provider: 'chromium', dir: '/p', owner: { kind: 'instance' } };
  const sv = SW.switchVerdict({ profile: prof, target: 'local-window', rowOf: B.providerRow, controlOf: withConsent, capabilityRefusalOf: B.capabilityRefusal });
  ok(!sv.ok && sv.code === 'switch_refused' && /window target/i.test(sv.error), 'switching a profile TO local-window is switch_refused naming the window target (§7.6 rule 3: no re-pointing)');
  const rows2 = SW.switcherRows({ profile: prof, providerIds: B.providerIds(), rowOf: B.providerRow, controlOf: withConsent, capabilityRefusalOf: B.capabilityRefusal });
  const lwRow = rows2.find((r) => r.id === 'local-window');
  ok(lwRow && lwRow.enabled === false && lwRow.code === 'switch_refused' && lwRow.tier === 3, 'the switcher shows the tier-3 row disabled WITH its reason, never hidden');
  // the site-hint rule
  const hOk = SW.siteHintVerdict({ host: 'bank.example', tier: 3, by: 'agent', providerIds: B.providerIds() });
  ok(hOk.ok && hOk.value.tier === 3 && hOk.value.backend === null, 'a tier-3 hint before any backend is legal (backend null)');
  const hBoth = SW.siteHintVerdict({ host: 'bank.example', tier: 3, backend: 'local-window', by: 'user', providerIds: B.providerIds() });
  ok(!hBoth.ok && hBoth.code === 'hint_tier_with_backend', 'NEGATIVE CONTROL: a hint carrying BOTH a tier and a backend is refused');
  const hLw = SW.siteHintVerdict({ host: 'bank.example', backend: 'local-window', by: 'user', providerIds: B.providerIds() });
  ok(hLw.ok && hLw.value.tier === null && DESK.hintAction(hLw.value, { rowOf: B.providerRow }).tier === 3, 'a local-window backend hint stores NO tier; the tier is derived (3) when read');
  const bc = SW.blockedClaim({ url: 'https://bank.example/login', why: 'step-up', tier: 3, browserKey: 'bk-1', at: 1 });
  ok(bc.ok && bc.value.by === 'agent' && bc.value.tier === 3 && /the agent says/.test(SW.blockedText(bc.value)) && /your act/.test(SW.blockedText(bc.value)) && /nothing escalates by itself/.test(SW.blockedText(bc.value)) && !/detect/i.test(SW.blockedText(bc.value)), 'a tier-3 blocked claim carries WHO said it; the sentence says "your act" and "nothing escalates by itself", never "detected"');
  ok(!SW.blockedClaim({ url: 'https://x.example', by: 'server', tier: 3 }).ok, 'CONTROL: the server never manufactures a claim');
  ok(SW.navHint(403).tier === 2 && /not a detection/.test(SW.navHint(403).text) && SW.navHint(200) === null, 'the 403/429 hint is typed and worded as a hint');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§3 THE ENGINE over a fake keeper + a fake helper + the routes, and the shipped CLI');
{
  // two live processes: one "foreign" (an app on the user's desktop), one "ours" (a keeper record)
  const foreign = spawn('sleep', ['300'], { stdio: 'ignore' }); children.add(foreign);
  const oursProc = spawn('sleep', ['300'], { stdio: 'ignore' }); children.add(oursProc);
  const FOREIGN = foreign.pid, OURS = oursProc.pid, DEAD = 4194300; // a pid no process holds (PID_MAX-ish) — listed by the bus, not alive
  const logFile = path.join(dir, 'helper.log');
  const helper = path.join(dir, 'fake-helper.js');
  fs.writeFileSync(helper, `
    const fs = require('fs');
    let s = ''; process.stdin.on('data', (d) => { s += d; }); process.stdin.on('end', () => {
      const req = JSON.parse(s); fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(req) + '\\n');
      const apps = [{ pid: ${FOREIGN}, name: 'Fake Browser', children: 1 }, { pid: ${OURS}, name: 'Ours', children: 1 }, { pid: ${DEAD}, name: 'Ghost', children: 0 }];
      const node = (ref, pid, p, role, name, extra) => ({ ref, pid, path: p, role, name, depth: p.length, ...extra });
      let out;
      if (req.op === 'probe') out = { ok: true, apps: apps.length, sessionBus: true };
      else if (req.op === 'apps') out = { ok: true, apps };
      else if (req.op === 'snapshot') { const pid = req.pids[0]; const nodes = [node('@e1', pid, [], 'application', 'Fake Browser', {}), node('@e2', pid, [0], 'frame', 'Bank — Chrome', { parent: '@e1', bounds: { x: 0, y: 0, w: 400, h: 300 }, text: 'balance 12.34' }), node('@e3', pid, [0, 0], 'button', 'Log in', { parent: '@e2', actions: ['press'], bounds: { x: 10, y: 10, w: 80, h: 20 } }), node('@e4', pid, [0, 1], 'entry', 'user', { parent: '@e2', editable: true })];
        out = { ok: true, apps: [{ pid, name: 'Fake Browser' }], nodes, census: { nodes: 4, component: 3, action: 1, editableText: 1, text: 1, buttons: 1, buttonsWithAction: 1, byRole: {}, actionNames: { press: 1 } }, unreadable: [], truncated: false, budget: req.budget, callTimeoutMs: req.callTimeoutMs, ms: 1 }; }
      else if (req.op === 'act') out = { ok: true, did: { verb: req.verb, index: req.action, action: 'press', role: req.expect.role, name: req.expect.name } };
      else if (req.op === 'focused') out = { ok: true, node: { ref: '@e4', pid: req.pids[0], path: [0, 1], role: 'entry', name: 'user', editable: true } };
      else out = { ok: false, code: 'bad-request', why: 'unknown op' };
      process.stdout.write(JSON.stringify(out) + '\\n');
    });`);
  const helperLog = () => fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const records = new Map([['da-ours', { id: 'da-ours', label: 'Ours', state: 'ready', display: ':77', pids: { app: OURS }, exec: 'ours', backend: 'vnc-display', startedAt: 1 }]]);
  const keeper = { listApps: () => [...records.values()], get: (id) => records.get(id) || null, sessionPids: (rec) => Object.values(rec.pids).filter(Boolean), x11EnvFor: (id) => (records.get(id) ? { DISPLAY: ':77' } : null), launch: async () => { throw new Error('not in this suite'); } };
  const sessions = new Map([['sess-a', { agentToken: 'vsst_a', name: 'Alpha', _browserKey: 'bk-a' }], ['sess-b', { agentToken: 'vsst_b', name: 'Beta', _browserKey: 'bk-b' }]]);
  const settings = {};
  const broadcasts = [];
  const dataDir = path.join(dir, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const bins = { xdotool: '/usr/bin/xdotool-present-but-never-used', gdbus: null, ffmpeg: null };
  const mk = () => ENGINE.create({ keeper, dataDir, env: () => ({ PATH: process.env.PATH }), activeSessions: sessions, wt: WT, python: process.execPath, helper, bins, serverSetting: (k) => settings[k], broadcast: (m) => broadcasts.push(m), userEnv: () => ({ PATH: process.env.PATH }), selfPid: process.pid, log: { log() { }, warn() { } } });
  let engine = mk();
  const A = { sessionId: 'sess-a', browserKey: 'bk-a', name: 'Alpha' }, Bf = { sessionId: 'sess-b', browserKey: 'bk-b', name: 'Beta' };
  // desktop lane E (D1): a VibeSpace-started window is hidden until the user shares it — share `da-ours` with both
  // sessions (the tier-3 class below never reads a share: D5, its own switch — the legs below pin that too)
  for (const sid of ['sess-a', 'sess-b']) engine.grantReach('da-ours', { kind: 'session', id: sid });
  const caught = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, code: e.code, message: e.message, e }; } };
  const H = `dw-${FOREIGN}`;

  // the switch OFF
  let l = await engine.list(A);
  ok(l.desktop.enabled === false && l.verbsDesktop === null && !l.targets.some((t) => t.origin === 'desktop') && l.targets.some((t) => t.handle === 'da-ours') && /never enumerated/.test(l.note), 'switch OFF: no desktop rows, no desktop verbs, the (shared) vibespace row still listed');
  let r = await caught(() => engine.attach(H, A));
  ok(!r.ok && r.code === 'desktop_consent_off' && r.e.setting === DESK.SETTING_KEY && /Settings/.test(r.message), 'switch OFF: attach on a desktop handle ⇒ desktop_consent_off naming the setting (consent is asked BEFORE existence)');
  r = await caught(() => engine.attach('dw-1', A));
  ok(!r.ok && r.code === 'desktop_consent_off', '…and for a handle nobody listed too');
  // the switch ON
  settings[DESK.SETTING_KEY] = true;
  l = await engine.list(A);
  const drows = l.targets.filter((t) => t.origin === 'desktop');
  ok(l.desktop.enabled === true && l.desktop.count === 2 && drows.length === 2 && drows.every((t) => t.yourDesktop === true) && drows.some((t) => t.handle === H && t.label === 'Fake Browser') && drows.some((t) => t.handle === `dw-${DEAD}`), 'switch ON: the bus minus ours (the keeper\'s pid is NOT a desktop row), every row marked yourDesktop');
  ok(!drows.some((t) => t.pid === OURS) && l.targets.find((t) => t.handle === 'da-ours').origin === 'vibespace', 'CONTROL: the keeper-launched app stays a vibespace row, never a desktop row');
  ok(l.verbsDesktop && l.verbsDesktop.key.code === 'desktop_injection_refused' && !l.verbsDesktop.watch.ok && /YOUR DESKTOP/.test(l.desktop.note), 'the list carries the class\'s verb law and the marker note');
  r = await caught(() => engine.attach(`dw-${DEAD}`, A));
  ok(!r.ok && r.code === 'desktop_window_gone', 'a row the bus named whose pid is not alive ⇒ desktop_window_gone');
  r = await caught(() => engine.attach('dw-777', A));
  ok(!r.ok && r.code === 'not-found' && /list/.test(r.message), 'a handle nobody listed ⇒ not-found pointing at list');
  r = await caught(() => engine.attach(H, A));
  ok(r.ok && r.value.origin === 'desktop' && r.value.yourDesktop === true && /USER'S OWN DESKTOP/.test(r.value.note) && /refused on this class/.test(r.value.note) && r.value.lease.origin === 'desktop', 'attach on the desktop class: ok, the lease is origin:desktop, the answer carries the §6.6 note');
  r = await caught(() => engine.attach(H, Bf));
  ok(!r.ok && r.code === 'window_leased' && r.e.holder === 'sess-a', 'one holder per window on this class too');
  // the tree verbs reach the helper with the desktop pid
  fs.writeFileSync(logFile, '');
  r = await caught(() => engine.snapshot(H, A));
  ok(r.ok && r.value.yourDesktop === true && r.value.origin === 'desktop' && r.value.nodes.length === 4 && helperLog().some((q) => q.op === 'snapshot' && q.pids[0] === FOREIGN), 'snapshot walks the desktop application (the helper got its pid) and is marked');
  r = await caught(() => engine.act(H, A, { verb: 'click', ref: '@e3' }));
  ok(r.ok && r.value.did.by === 'node' && r.value.did.action === 'press' && helperLog().some((q) => q.op === 'act' && q.verb === 'do_action' && q.pid === FOREIGN), 'click @ref = do_action on the node through the helper');
  r = await caught(() => engine.act(H, A, { verb: 'click', ref: '@e2' }));
  ok(!r.ok && r.code === 'node_has_no_action', 'a node without Action is still refused (never a coordinate click)');
  r = await caught(() => engine.act(H, A, { verb: 'type', ref: '@e4', text: 'alice' }));
  ok(r.ok && r.value.did.chars === 5 && helperLog().some((q) => q.op === 'act' && q.verb === 'insert_text'), 'type @ref = EditableText through the helper');
  // the injection verbs never reach anything
  const before = helperLog().length;
  r = await caught(() => engine.act(H, A, { verb: 'key', chord: 'ctrl+s' }));
  ok(!r.ok && r.code === 'desktop_injection_refused' && r.e.verb === 'key' && /typing in/.test(r.message) && helperLog().length === before, 'key ⇒ desktop_injection_refused BEFORE any helper call (xdotool "present" — the rule is about the class, not the probe)');
  r = await caught(() => engine.act(H, A, { verb: 'click', at: '10,10' }));
  ok(!r.ok && r.code === 'desktop_injection_refused' && r.e.verb === 'click-at' && helperLog().length === before, 'click --at ⇒ desktop_injection_refused, nothing injected, nothing probed');
  r = await caught(() => engine.watch(H, A));
  ok(!r.ok && r.code === 'no_live_view' && r.e.yourDesktop === true && /own desktop/.test(r.message), 'watch ⇒ no_live_view (the user is looking at it)');
  r = await caught(() => engine.screenshot(H, A));
  ok(!r.ok && r.code === 'capture_unavailable' && /no DISPLAY/.test(r.message), 'screenshot without a DISPLAY in the server\'s env ⇒ capture_unavailable naming it (no helper, no ffmpeg)');
  // the user's pause always wins
  let t = engine.takeover({ handle: H, viewerId: 'user', holderAlive: true });
  ok(t.ok && t.lease.input === 'user' && t.lease.origin === 'desktop', 'the user pauses the agent on a desktop window (the SAME takeover verdict as a tab)');
  const before2 = helperLog().length;
  r = await caught(() => engine.act(H, A, { verb: 'click', ref: '@e3' }));
  ok(!r.ok && r.code === 'window_paused' && helperLog().length === before2, 'while paused every verb is window_paused and the helper is never called');
  ok(engine.desktopLeases().length === 1 && engine.desktopLeases()[0].input === 'user' && engine.desktopLeases()[0].label === 'Fake Browser', 'desktopLeases() = the class\'s leases with their input state and label');
  t = engine.handback({ handle: H, viewerId: null, cause: 'explicit' });
  ok(t.ok && (await caught(() => engine.act(H, A, { verb: 'click', ref: '@e3' }))).ok, 'resume ⇒ the agent\'s verbs run again');
  // the audit
  const audit = fs.readFileSync(engine.auditFile, 'utf8').trim().split('\n').map((x) => JSON.parse(x)).filter((x) => x.handle === H);
  ok(audit.length >= 8 && audit.every((x) => x.origin === 'desktop') && ['attach', 'snapshot', 'click', 'type', 'key', 'click-at', 'takeover', 'handback'].every((v) => audit.some((x) => x.verb === v)), `every audit line of the class carries origin:desktop (${audit.length} lines: ${[...new Set(audit.map((x) => x.verb))].join(', ')})`);
  ok(!audit.some((x) => JSON.stringify(x).includes('alice')), 'typed text is never in the audit');
  // the routes
  const express = require('express');
  const app = express(); app.use(express.json());
  ROUTES.setup({ engine }); app.use(ROUTES.router);
  const srv = http.createServer(app); await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port; const API = `http://127.0.0.1:${port}`;
  const j = async (method, p, body, headers = {}) => { const res = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const bearer = { Authorization: 'Bearer vsst_a' };
  let q = await j('GET', '/api/window/desktop');
  ok(q.status === 200 && q.json.enabled === true && q.json.leases.length === 1 && q.json.leases[0].handle === H && q.json.setting === DESK.SETTING_KEY, 'GET /api/window/desktop (the user\'s side): the switch, the class\'s leases');
  q = await j('POST', `/api/window/desktop/${H}/pause`, { viewerId: 'user' });
  ok(q.status === 200 && q.json.lease.input === 'user', 'POST …/pause ⇒ the takeover');
  q = await j('POST', '/api/agent/window/act', { handle: H, verb: 'click', ref: '@e3' }, bearer);
  ok(q.status === 409 && q.json.code === 'window_paused', 'the agent\'s click over the route ⇒ 409 window_paused');
  q = await j('POST', `/api/window/desktop/${H}/resume`, {});
  ok(q.status === 200 && q.json.cause === 'explicit', 'POST …/resume ⇒ the handback');
  q = await j('POST', '/api/window/desktop/da-ours/pause', {});
  ok(q.status === 400 && q.json.code === 'bad-request', 'the user route takes desktop handles only');
  q = await j('POST', '/api/agent/window/act', { handle: H, verb: 'key', chord: 'ctrl+s' }, bearer);
  ok(q.status === 409 && q.json.code === 'desktop_injection_refused' && q.json.class === 'desktop' && q.json.verb === 'key', 'over the route: 409 desktop_injection_refused with the class and the verb');
  q = await j('POST', '/api/agent/window/watch', { handle: H }, bearer);
  ok(q.status === 409 && q.json.code === 'no_live_view' && q.json.yourDesktop === true, 'over the route: 409 no_live_view');
  q = await j('GET', `/api/agent/window/screenshot?handle=${H}`, undefined, bearer);
  ok(q.status === 503 && q.json.code === 'capture_unavailable', 'over the route: 503 capture_unavailable');
  ok(DESK.REFUSALS.every((c) => Number.isInteger(ROUTES.STATUS[c])) && ROUTES.STATUS.desktop_consent_off === 403 && ROUTES.STATUS.no_lease === 409, 'the STATUS map covers every code of the class (census over DESK.REFUSALS)');
  // the shipped CLI
  const cliEnv = { ...process.env, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_a' };
  const cli = (args) => new Promise((res) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-window'), ...args], { env: cliEnv, timeout: 15000, encoding: 'utf8' }, (err, stdout, stderr) => res({ code: err ? err.code : 0, stdout, stderr })));
  let c = await cli(['list']);
  ok(c.code === 0 && /YOUR DESKTOP \(the user's own window\)/.test(c.stdout) && /Fake Browser/.test(c.stdout) && /real desktop: ON — 2 application/.test(c.stdout) && /on YOUR DESKTOP rows:/.test(c.stdout) && /key\s+refused via inject/.test(c.stdout), 'the CLI list marks the rows YOUR DESKTOP, prints the switch line and the class\'s verb law');
  c = await cli(['key', H, 'ctrl+s']);
  ok(c.code === 1 && /desktop_injection_refused/.test(c.stderr) && /nothing is injected/.test(c.stderr), 'the CLI spells the injection refusal');
  c = await cli(['watch', H]);
  ok(c.code === 1 && /no_live_view/.test(c.stderr) && /no live pane/.test(c.stderr), 'the CLI spells no_live_view');
  // persistence across a rebuild, then the switch OFF
  const engine2 = mk();
  ok(engine2.leases().some((v) => v.handle === H && v.origin === 'desktop' && v.sessionId === 'sess-a'), 'a second engine over the same data dir still holds the desktop lease with its origin');
  r = await caught(() => engine2.snapshot(H, A));
  ok(r.ok && r.value.yourDesktop === true, 'the agent\'s next verb works after the rebuild without re-attaching (the persisted lease trusts its own pid)');
  settings[DESK.SETTING_KEY] = false;
  r = await caught(() => engine2.snapshot(H, A));
  ok(!r.ok && r.code === 'desktop_consent_off' && !engine2.leases().some((v) => v.handle === H), 'the switch OFF: the next verb is desktop_consent_off AND the lease is gone');
  const audit2 = fs.readFileSync(engine2.auditFile, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  ok(audit2.some((x) => x.handle === H && x.verb === 'lease-dropped' && x.by === 'consent' && x.origin === 'desktop'), 'the drop is audited by:consent with the class');
  q = await j('GET', '/api/window/desktop');
  ok(q.status === 200 && q.json.enabled === false && q.json.leases.length === 0 && /Settings/.test(q.json.note), 'the user route says the switch is off and lists nothing');
  ok(engine2.leases().some((v) => v.handle === 'da-ours') === false, 'CONTROL: nothing else was touched (no vibespace lease existed)');
  // boot with the switch OFF and a persisted desktop lease ⇒ dropped at boot
  settings[DESK.SETTING_KEY] = true;
  await engine2.list(A); await caught(() => engine2.attach(H, A));
  ok(engine2.leases().some((v) => v.handle === H), 're-attached with the switch on');
  settings[DESK.SETTING_KEY] = false;
  const engine3 = mk();
  const b = engine3.boot();
  ok(!engine3.leases().some((v) => v.handle === H) && b.leases === 0, 'boot with the switch OFF drops the persisted desktop lease before anything else');
  engine.shutdown(); engine2.shutdown(); engine3.shutdown();
  srv.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
cleanup();
process.exit(fail ? 1 : 0);
