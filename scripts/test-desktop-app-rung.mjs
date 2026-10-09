#!/usr/bin/env node
// THE DESKTOP-APP RUNG (lane e2a, docs/design-agent-browser-v2 §E2, B-830d) — the agent's own desktop browser as the
// browser ladder's lowest rung: ONE door (`vibespace-browser new <label> --backend desktop-app [--url] [--keep-profile]`),
// launched by the desktop-app keeper with origin 'agent-browser', the opener granted + window-target-leased, no CDP,
// opened beside the chat only on the client showing it.
//   ① the row + the door (PURE): the cells, the ladder order, canSwitchTo no (a FENCED profile cannot switch in), not a
//      profile, desktopAppNewVerdict's table (--size = the pin since lane e2b, on another row desktop_app_only; --mode auto|tree|pixels since lane e2c; url scheme; flags of another row)
//   ② the REAL window-targets engine over a fake keeper: the launch's origin + opener, the chromium family first, the
//      opener grant, the lease (origin agent-browser, mode reserved null (the pin is the record's)), the broadcast, the audit line, the
//      persisted lease keeps its origin, the A2 re-ask after the launch's await, `open chromium` still browser_is_human
//      with the door in its words, the CDP lookup answers only for the holder's own key
//   ③ the route + keeper seams (source): the door and the resolve refusal sit behind the agent belt; the keeper stamps the
//      origin only from the engine's opts (never the device op's body)
//   ④ the CLI (data/bin/vibespace-browser + vibespace-window) against a stub server: the door's body + words, the
//      no_cdp_on_this_backend refusal printed with its remedy, the vibespace-window usage names the door
//   ⑤ the placement model (PURE): showing ⇒ beside (lane F's split door), not showing ⇒ nothing, phone ⇒ own window
//   CONTROLS (patched copies): the human row admitted by `open` ⇒ RED; a CDP lookup that answers nothing on this backend
//      ⇒ RED; a client not showing the chat opening the window ⇒ RED
// Fast: in-process, scratch dirs only, no browser, no display, no vendor call.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const B = require(path.join(REPO, 'src/browser-profiles.js'));
const S = require(path.join(REPO, 'src/browser-switch.js'));
const ENGINE_REL = 'src/server/window-targets-engine.js', PLACE_REL = 'src/lib/desktop-app-placement.js';
const MUT = mutantCopies('desktop-app-rung', REPO);
const assert1 = (c, what) => { if (!c) throw new Error(`${what}: the patch no longer applies — re-anchor the control`); };

console.log('① the row + the door (PURE)');
{
  const ids = B.providerIds();
  ok(ids.indexOf('desktop-app') >= 0 && ids.indexOf('desktop-app') === ids.indexOf('local-window') - 1 && ids.indexOf('desktop-app') > ids.indexOf('cdp'), `the row sits BEFORE local-window in the ladder (${ids.join(', ')})`);
  const r = B.providerRow('desktop-app');
  const want = { tier: 3, wired: true, keyScope: 'none', canSwitchTo: 'no', ownsDir: true, leaseKind: 'window-target', remote: null, starts: true, headed: true, binary: null, cdp: false, allowedDomains: false, pinTab: false, consent: null, egressProxy: false };
  const bad = Object.entries(want).filter(([k, v]) => r[k] !== v);
  ok(!bad.length, 'the row\'s cells (§E2.1): tier 3, window-target lease, no CDP, no domain fence, no egress proxy, canSwitchTo no', bad);
  ok(B.providerControl('desktop-app').ok === true && B.providerControl('desktop-app', { host: 'box-2' }).ok === false, 'usable on this machine; a paired machine refused (remote null — v1)');
  const fenced = { id: 'p1', provider: 'chromium', allowedDomains: ['example.com'] };
  const sv = S.switchVerdict({ profile: fenced, target: 'desktop-app', rowOf: B.providerRow, controlOf: (id) => B.providerControl(id), capabilityRefusalOf: B.capabilityRefusal });
  ok(!sv.ok && sv.code === 'switch_refused' && /no profile, fenced or not, switches into it/.test(sv.error) && /--backend desktop-app/.test(sv.error), 'a FENCED profile cannot switch into the rung — refused by the row, the words name the door', sv);
  ok(S.switchChoices({ profile: { id: 'p1', provider: 'chromium' }, providerIds: ids, rowOf: B.providerRow, controlOf: (id) => B.providerControl(id) }).every((c) => (c.id || c.provider || c) !== 'desktop-app'), 'the switcher never offers it');
  const vp = B.validateProfileInput({ label: 'x', provider: 'desktop-app' }, []);
  ok(!vp.ok && vp.code === 'desktop_app_not_a_profile' && /--backend desktop-app/.test(vp.error), 'not a profile: createProfile refuses it by name with the door', vp);
  ok(B.capabilityRefusal('desktop-app', 'cdp') && B.capabilityRefusal('desktop-app', 'cdp').code === 'provider_lacks_capability' && B.capabilityRefusal('desktop-app', 'allowed-domains'), 'cdp / allowed-domains: the row lacks them by name');
  const V = (x) => B.desktopAppNewVerdict(x);
  const table = [
    [{ label: 'site', backend: 'desktop-app', url: 'https://example.com/a' }, (v) => v.ok && v.door === 'desktop-app' && v.url === 'https://example.com/a' && v.keepProfile === false, 'the door: label + url'],
    [{ label: 'site', provider: 'desktop-app', keepProfile: true }, (v) => v.ok && v.door === 'desktop-app' && v.keepProfile === true, '--provider desktop-app is the same door; --keep-profile carried'],
    [{ label: 'site', backend: 'desktop-app', size: '1920x1080' }, (v) => v.ok && v.pin && v.pin.w === 1920 && v.pin.h === 1080, 'lane e2b: --size 1920x1080 is the pin (no longer not_yet)'],
    [{ label: 'site', backend: 'desktop-app', mode: 'pixels' }, (v) => v.ok && v.mode === 'pixels' && v.pin && v.pin.w === 1920, 'lane e2c: --mode pixels is accepted (the 1920×1080 default pin; no longer not_yet)'],
    [{ label: 'site', size: '1920x1080' }, (v) => !v.ok && v.code === 'desktop_app_only' && /--size/.test(v.error), 'lane e2b: --size on a profile row is refused desktop_app_only (never silently taken)'],
    [{ label: 'site', backend: 'desktop-app', url: 'file:///etc/passwd' }, (v) => !v.ok && v.code === 'bad-url' && /file:/.test(v.error), 'a file: url refused (localSchemeOf)'],
    [{ label: 'site', backend: 'desktop-app', url: 'chrome://settings' }, (v) => !v.ok && v.code === 'bad-url', 'a chrome: url refused'],
    [{ label: 'site', backend: 'desktop-app', url: 'ftp://x.y/' }, (v) => !v.ok && v.code === 'bad-url', 'not http(s) refused (the launch dialog\'s verdict)'],
    [{ label: 'site', url: 'https://x.y/' }, (v) => !v.ok && v.code === 'desktop_app_only', '--url on a profile row refused by name'],
    [{ label: 'site', keepProfile: true }, (v) => !v.ok && v.code === 'desktop_app_only', '--keep-profile on a profile row refused by name'],
    [{ label: 'site', backend: 'desktop-app', provider: 'chromium' }, (v) => !v.ok && v.code === 'backend_conflict', 'two different rows refused'],
    [{ label: 'site', backend: 'nope' }, (v) => !v.ok && v.code === 'provider_unknown', 'an unknown backend refused with the list'],
    [{ label: 'site', backend: 'desktop-app', host: 'box-2' }, (v) => !v.ok && v.code === 'provider_local_only', 'a --host refused (this machine only)'],
    [{ label: '', backend: 'desktop-app' }, (v) => !v.ok && v.code === 'bad-request', 'a label is required'],
    [{ label: 'site', backend: 'chromium' }, (v) => v.ok && v.door === 'profile', 'another row stays createProfile\'s'],
  ];
  for (const [inp, pred, name] of table) { const v = V(inp); ok(pred(v), `desktopAppNewVerdict: ${name}`, v); }
}

console.log('② the REAL engine over a fake keeper');
const SESS_A = { agentToken: 'vsst_A', _browserKey: 'bk-0000000a', claudeSessionId: 'aaaaaaaa-1111-4000-8000-0000000000a1', backendSessionId: 'aaaaaaaa-1111-4000-8000-0000000000a1', backend: 'claude', name: 'A', mode: 'chat' };
const SESS_B = { agentToken: 'vsst_B', _browserKey: 'bk-0000000b', claudeSessionId: 'bbbbbbbb-2222-4000-8000-0000000000b2', backendSessionId: 'bbbbbbbb-2222-4000-8000-0000000000b2', backend: 'claude', name: 'B', mode: 'chat' };
const REGISTRY = [
  { id: 'firefox', label: 'Firefox', exec: 'firefox', browser: 'firefox', category: 'browser', available: true },
  { id: 'chromium', label: 'Chromium', exec: 'chromium', browser: 'chromium', category: 'browser', available: true },
  { id: 'gedit', label: 'gedit', exec: 'gedit', available: true },
];
function world(ENG, sub, { onLaunch = null, clock = null, profileFails = false, dataDir = null, wt = null } = {}) {
  const dir = scratch('da-rung-' + sub); fs.mkdirSync(dir, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
  const sessions = new Map([['w-A', SESS_A], ['w-B', SESS_B]]);
  const records = new Map(); const launches = []; const stops = []; const sent = []; const inputs = [];
  let n = 0;
  const keeper = {
    listApps: () => [...records.values()], get: (id) => records.get(id) || null, sessionPids: (rec) => Object.values(rec.pids).filter(Boolean),
    x11EnvFor: () => null, registry: () => REGISTRY,
    // the desktop-serve shape: a browser row's record carries the origin + opener ONLY from the caller's opts
    launch: async (body, opts = {}) => {
      launches.push({ body, opts });
      if (onLaunch) await onLaunch(sessions);
      await new Promise((r) => setTimeout(r, 5)); // the real keeper awaits (facts, catalog, bring-up) before the record exists
      const row = REGISTRY.find((r) => r.id === body.appId);
      // the REAL record shape (src/desktop-serve.js launch): a registry row's label is the row's; only the agent door's
      // opts (origin + by + label) stamp the agent's rung — exactly where desktop-serve stamps them
      const rec = { id: opts.id || `da-${++n}`, label: row.label, exec: row.exec, appId: row.id, browser: row.browser || undefined, state: 'launching', display: ':77', pids: { app: 4242, x: null, server: null, wm: null }, starts: { app: 9 }, backend: 'xpra', startedAt: 1, url: body.url || null, keepProfile: body.keepProfile === true };
      if (row.browser && opts.origin === 'agent-browser') { rec.origin = 'agent-browser'; rec.by = { sessionId: opts.by.sessionId, ...(opts.by.name ? { name: opts.by.name } : {}) }; if (opts.label) rec.label = opts.label; }
      records.set(rec.id, rec); return rec;
    },
    stop: async (id, o) => { stops.push({ id, o }); const r = records.get(id); if (!r) return r; const v = { ...r, state: 'exited', stoppedBy: o && o.why, ...(r.keepProfile ? { profileKept: true, profileKeptWhy: 'the user chose "keep profile"' } : profileFails ? { profileError: 'not removed: a process of the session survived its teardown' } : { profileRemovedAt: 1 }) }; records.set(id, v); return v; },
    noteInput: (id) => { inputs.push(id); },
    // the Scale ▸ relaunch as src/desktop-serve.js runs it: the successor first (the agent's rung carried in its opts), the old exited + replacedBy
    relaunch: async (id) => { const old = records.get(id); const next = await keeper.launch({ appId: old.appId, url: old.url || undefined, keepProfile: old.keepProfile }, old.origin === 'agent-browser' ? { origin: old.origin, by: old.by, label: old.label, id: `${id}-r` } : { id: `${id}-r` }); records.set(id, { ...records.get(id), state: 'exited', stoppedBy: 'relaunch', replacedBy: next.id }); return { app: next }; },
  };
  const engine = ENG.create({ keeper, dataDir: dataDir || path.join(dir, 'data'), env: () => ({}), activeSessions: sessions, broadcast: (m) => sent.push(m), bins: { xdotool: null, gdbus: null }, log: { warn() { }, log() { } }, procExe: () => null, ...(clock ? { now: () => clock.t } : {}), ...(wt ? { wt } : {}) });
  return { dir, sessions, records, launches, stops, sent, inputs, engine, keeper, fA: engine.factsForToken('vsst_A'), fB: engine.factsForToken('vsst_B') };
}
let retireOk = null; // the D6 retire table (defined in ②, re-run on a patched copy in the controls)
const doorOf = (x) => B.desktopAppNewVerdict({ label: 'Site login', backend: 'desktop-app', url: 'https://example.com/', ...x });
/** The checks a control re-runs: → {humanRefused, cdpFound} */
async function engineChecks(ENG, sub) {
  const W = world(ENG, sub);
  let human = null; try { await W.engine.open({ appId: 'chromium' }, W.fA); } catch (e) { human = e; }
  const r = await W.engine.openAgentBrowser(doorOf(), W.fA);
  return { W, r, human, humanRefused: !!(human && human.code === 'browser_is_human'), cdpFound: !!W.engine.agentBrowserFor(r.handle, W.fA.browserKey) };
}
const ENGINE = require(path.join(REPO, ENGINE_REL));
{
  const { W, r, human, humanRefused, cdpFound } = await engineChecks(ENGINE, 'real');
  const L = W.launches[0];
  ok(W.launches.length === 1 && L.body.appId === 'chromium' && L.body.url === 'https://example.com/' && !('keepProfile' in L.body) && L.opts.label === 'Site login', 'the keeper launches the registry\'s CHROMIUM row (the chromium family before firefox) with the url; the agent\'s label rides the opts', L && L);
  ok(W.records.get('da-1').label === 'Site login' && W.records.get('da-1').by.name === 'A', 'r3 (#11): the record carries the agent\'s label and the opener\'s name (the chip says whose)', W.records.get('da-1'));
  ok(L.opts.origin === 'agent-browser' && L.opts.by && L.opts.by.sessionId === 'w-A', 'the launch carries origin agent-browser + the opener session (the keeper stamps the record from it)', L && L.opts);
  ok(r.handle === 'da-1' && r.attached === true && r.origin === 'agent-browser' && r.next === 'vibespace-window snapshot da-1', 'the answer: the handle, attached, the next window verb', r);
  ok(r.lease && r.lease.origin === 'agent-browser' && r.lease.sessionId === 'w-A', 'the lease is the opener\'s, origin agent-browser (visible in the API)', r.lease);
  const st = JSON.parse(fs.readFileSync(W.engine.reachFile, 'utf8'));
  const rows = (st.windows['da-1'] || { rows: [] }).rows;
  ok(rows.length === 1 && rows[0].by === 'self-open' && /w-A|aaaaaaaa/.test(String(rows[0].principal.id)), 'the opener grant: ONE reach row, by self-open, the opener\'s own key', rows);
  const bc = W.sent.filter((m) => m.type === 'desktop-app-opened');
  ok(bc.length === 1 && bc[0].sessionId === 'w-A' && bc[0].appId === 'da-1' && bc[0].origin === 'agent-browser' && Object.keys(bc[0]).sort().join() === 'appId,origin,sessionId,type', 'the broadcast desktop-app-opened {sessionId, appId, origin} — nothing else rides it', bc);
  const audit = fs.readFileSync(path.join(W.dir, 'data', ENGINE.AUDIT_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.verb === 'open' && l.ok);
  ok(audit.length === 1 && audit[0].origin === 'agent-browser' && audit[0].backend === 'desktop-app' && audit[0].handle === 'da-1' && audit[0].reach === 'self-open', 'the audit row (this rung\'s action trace): origin agent-browser, backend desktop-app, self-open', audit);
  ok(humanRefused && /--backend desktop-app/.test(human.message), '`vibespace-window open chromium` stays browser_is_human — and its words point at the new door', human && human.message);
  let urlH = null; try { await W.engine.open({ appId: 'gedit', url: 'https://x.y/' }, W.fA); } catch (e) { urlH = e; }
  ok(urlH && urlH.code === 'browser_is_human' && /--backend desktop-app/.test(urlH.message), '`open` with a url stays browser_is_human (the door named)');
  ok(cdpFound && !W.engine.agentBrowserFor('da-1', W.fB.browserKey) && !W.engine.agentBrowserFor('da-1', null) && !W.engine.agentBrowserFor('da-nope', W.fA.browserKey), 'the CDP lookup answers ONLY for the holder\'s own key (another conversation\'s window is never confirmed)');
  let held = null; try { W.engine.attach('da-1', W.fB); } catch (e) { held = e.code; }
  ok(held === 'not_exposed' || held === 'window_leased', `another conversation cannot take it (one window, one holder; not shared) — ${held}`);
  const att = W.engine.attach('da-1', W.fA);
  ok(att.resumed === true && !att.browser && !att.browserNote, 'the opener re-attaches; the answer never calls it the user\'s browser', att);
  const lf = JSON.parse(fs.readFileSync(path.join(W.dir, 'data', ENGINE.LEASE_FILE), 'utf8'));
  ok(lf.leases['da-1'] && lf.leases['da-1'].origin === 'agent-browser', 'the persisted lease keeps origin agent-browser', lf.leases['da-1']);
  const W2e = ENGINE.create({ keeper: W.keeper, dataDir: path.join(W.dir, 'data'), env: () => ({}), activeSessions: W.sessions, broadcast: () => { }, bins: { xdotool: null, gdbus: null }, log: { warn() { }, log() { } }, procExe: () => null });
  ok(!!W2e.agentBrowserFor('da-1', W.fA.browserKey), 'after a restart (a second engine over the same files) the lease is still the agent-browser one');
  // mode reserved on the lease record (E2c), never set here; the pin is the RECORD's fact (lane e2b), never the lease's
  const src = read(ENGINE_REL);
  ok(/E2b's pin is the RECORD's fact[^*]*\*\/, mode: null \/\* E2c/.test(src) && !/pin: null/.test(src), 'the lease record reserves `mode` (E2c) as null; E2b\'s pin lives on the record, not the lease');
  // keepProfile reaches the keeper only when asked
  const W3 = world(ENGINE, 'keep');
  await W3.engine.openAgentBrowser(doorOf({ keepProfile: true, url: undefined }), W3.fA);
  ok(W3.launches[0].body.keepProfile === true && !('url' in W3.launches[0].body), '--keep-profile reaches the keeper; no url ⇒ none sent');
  // A2: the opener ended while the browser started ⇒ stopped, refused by name, no lease, no grant, no broadcast
  const W4 = world(ENGINE, 'gone', { onLaunch: async (sessions) => { sessions.delete('w-A'); } });
  let gone = null; try { await W4.engine.openAgentBrowser(doorOf(), W4.fA); } catch (e) { gone = e.code; }
  ok(gone === 'not_live' && W4.stops.length === 1 && W4.stops[0].id === 'da-1' && !W4.engine.agentBrowserFor('da-1', W4.fA.browserKey) && !W4.sent.some((m) => m.type === 'desktop-app-opened'), 'A2: reach re-asked after the launch\'s await — the opener gone ⇒ the window stopped, not_live, no lease, no broadcast', { gone, stops: W4.stops });
  // D6: the opener's conversation ends ⇒ its desktop browser is stopped (why opener-ended); a human-shared window is not
  const W6 = world(ENGINE, 'end');
  const r6 = await W6.engine.openAgentBrowser(doorOf(), W6.fA);
  W6.sessions.delete('w-A');
  const rc = W6.engine.reconcile({ graceMs: 0 });
  await new Promise((r) => setTimeout(r, 20));
  ok(rc.dropped.some((d) => d.handle === r6.handle) && W6.stops.length === 1 && W6.stops[0].id === r6.handle && W6.stops[0].o.why === 'opener-ended', 'D6: the opener\'s conversation ended ⇒ the lease dropped AND the desktop browser stopped (why opener-ended)', { rc, stops: W6.stops });
  const DA = require(path.join(REPO, 'src/desktop-apps.js'));
  retireOk = (DAm) => { const base = { profileDir: '/x/p', state: 'exited', pids: { app: 1 } }; const ag = { ...base, origin: 'agent-browser' }; return DAm.profileRetireVerdict({ ...ag, stoppedBy: 'opener-ended' }).remove === true && DAm.profileRetireVerdict({ ...ag, stoppedBy: 'idle' }).remove === true && DAm.profileRetireVerdict({ ...ag, stoppedBy: 'opener-stopped' }).remove === true && DAm.profileRetireVerdict({ ...ag, stoppedBy: 'idle', keepProfile: true }).remove === false && DAm.profileRetireVerdict({ ...base, stoppedBy: 'idle' }).remove === false; };
  ok(retireOk(DA), 'D6 + r3 (#7): an agent browser\'s profile is removed on EVERY ending (its conversation, idle, its own stop) unless --keep-profile; a person\'s browser idle-stopped keeps its profile');
  // an app nobody launched through the door (a human's launch) is never an agent-browser one
  const W5 = world(ENGINE, 'human');
  await W5.keeper.launch({ appId: 'chromium' }, {});
  ok(!W5.engine.agentBrowserFor('da-1', W5.fA.browserKey) && W5.engine.isHumanBrowser(W5.records.get('da-1')) === true, 'a browser launched without the door stays the user\'s (isHumanBrowser)');
}

console.log('③ the route + keeper seams (source)');
{
  const rs = read('src/routes/browser.js');
  const newRoute = rs.slice(rs.indexOf("router.post('/api/agent/browser/new', (req, res) => {"));
  const iFacts = newRoute.indexOf('agentFacts(req, res)'), iDoor = newRoute.indexOf('B.desktopAppNewVerdict(req.body || {})'), iRemote = newRoute.indexOf('if (f.remote)');
  ok(iFacts > 0 && iRemote > iFacts && iDoor > iRemote && iDoor < newRoute.indexOf('k.createProfile('), 'the door sits in /api/agent/browser/new AFTER the belt\'s facts and the remote-session refusal, before createProfile');
  const res = rs.slice(rs.indexOf("router.post('/api/agent/browser/resolve'"));
  ok(res.indexOf("code: 'no_cdp_on_this_backend'") > res.indexOf('agentFacts(req, res)') && res.indexOf("code: 'no_cdp_on_this_backend'") < res.indexOf('auditVerbOf'), 'resolve: a handle naming the caller\'s desktop-app browser answers no_cdp_on_this_backend before any verb runs');
  ok(/windowEngine\.agentBrowserFor\(String\(req\.body\.handle\), f\.browserKey\)/.test(rs), 'resolve asks the engine with the CALLER\'s browser key');
  const ds = read('src/desktop-serve.js');
  ok(/if \(browser && opts\.origin === AGENT_BROWSER_ORIGIN\) \{\n\s+rec\.origin = AGENT_BROWSER_ORIGIN;/.test(ds) && !/body\.origin|p\.body\.origin/.test(ds), 'the keeper stamps the origin only from the engine\'s opts (a launch body / the device op never carries it)');
  ok(/const lopts = \{ scaleChoice: rv\.choice, replacing: id, \.\.\.\(rec\.origin === AGENT_BROWSER_ORIGIN \? \{ origin: rec\.origin, by: rec\.by, label: rec\.label \} : \{\}\), \.\.\.\(pinOf\(rec\.pin\) \? \{ pin: rec\.pin \} : \{\}\) \};/.test(ds), 'r3 (#2/#6): a Scale ▸ relaunch carries the agent\'s rung (origin + opener + label) to the successor (the real keeper: the heavy suite)');
  ok(/'opener-ended': 'closed with the conversation that opened it'/.test(ds) && /rec\.lastError = AGENT_BROWSER_ENDING_WORDS\[why\] \|\| why;/.test(ds) && /rec\.stoppedBy === 'opener-ended' \|\| rec\.stoppedBy === 'opener-gone'\) return t\('\{app\} closed with the conversation that opened it'/.test(read('src/lib/desktop-app-window.js')), 'r3 (#12): the endings in words — rec.lastError + the exit toast\'s own sentence');
  const rsrc = read('src/routes/browser.js'); const nr = rsrc.slice(rsrc.indexOf("router.post('/api/agent/browser/new'"));
  ok(nr.indexOf('B.desktopAppNewVerdict(req.body || {})') > 0 && nr.indexOf('B.desktopAppNewVerdict(req.body || {})') < nr.indexOf("const adoptDir = req.body?.adoptDir"), 'r3 (#4): the door\'s verdict runs BEFORE the adopt block (`--adopt` never pre-empts it)');
  ok(/require\('\.\.\/routes\/browser'\)\.setWindowEngine\(engine\)/.test(read('src/server/window-live-wiring.js')), 'the wiring hands the engine to the browser routes');
  const wr = read('src/routes/window-targets.js');
  ok(!/openAgentBrowser/.test(wr), '/api/agent/window/* never reaches openAgentBrowser (the ONE door is the browser tool\'s)');
}

console.log('④ the CLI against a stub server');
{
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const j = body ? JSON.parse(body) : {}; seen.push({ url: req.url, j });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/agent/browser/new' && j.size) return res.end(JSON.stringify({ desktopApp: { handle: 'da-8', label: j.label, state: 'launching', url: null, keepProfile: false, origin: 'agent-browser', pin: { w: 1920, h: 1080 } }, lease: { handle: 'da-8' }, next: 'vibespace-window snapshot da-8' })); // lane e2b
      if (req.url === '/api/agent/browser/new') return res.end(JSON.stringify({ desktopApp: { handle: 'da-7', label: j.label, state: 'launching', url: j.url || null, keepProfile: !!j.keepProfile, origin: 'agent-browser' }, lease: { handle: 'da-7' }, next: 'vibespace-window snapshot da-7' }));
      if (req.url === '/api/agent/browser/resolve') { res.statusCode = 409; return res.end(JSON.stringify({ error: 'da-7 is your desktop-app browser (Chromium): it has no CDP, so browser page verbs do not run there', code: 'no_cdp_on_this_backend', handle: 'da-7', remedy: 'vibespace-window snapshot da-7' })); }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${srv.address().port}`;
  const home = scratch('da-rung-home'); fs.mkdirSync(home, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { } });
    const BIN = path.join(home, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  fs.writeFileSync(path.join(BIN, 'agent-browser'), '#!/bin/sh\ncase "$1" in --version) echo "agent-browser 0.38.1";; *) echo "the fake browser CLI was run: $*" >&2; exit 9;; esac\n', { mode: 0o755 });
  const run = (bin, args) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin', bin), ...args], { env: { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_' + 't'.repeat(24), VIBESPACE_SESSION_CWD: home, LANG: 'C.UTF-8' }, cwd: home, timeout: 20000 }, (e, out, err) => resolve({ code: e ? (e.code ?? 1) : 0, out, err })));
  const a = await run('vibespace-browser', ['new', 'Site login', '--backend', 'desktop-app', '--url', 'https://example.com/', '--keep-profile']);
  const sent = seen.find((x) => x.url === '/api/agent/browser/new');
  ok(a.code === 0 && sent && sent.j.backend === 'desktop-app' && sent.j.url === 'https://example.com/' && sent.j.keepProfile === true && sent.j.label === 'Site login', 'new --backend desktop-app sends the door\'s fields', { a, sent: sent && sent.j });
  ok(/handle da-7/.test(a.out) && /beside your chat/.test(a.out) && /vibespace-window snapshot da-7/.test(a.out) && /no_cdp_on_this_backend/.test(a.out) && /no egress policy/.test(a.out) && /kept: --keep-profile/.test(a.out), 'the answer names the handle, beside the chat, the window verbs, no CDP, no egress policy, the kept profile', a.out);
  const b = await run('vibespace-browser', ['new', 'Site login', '--backend', 'desktop-app', '--size', '1920x1080']);
  ok(b.code === 0 && seen.some((x) => x.url === '/api/agent/browser/new' && x.j.size === '1920x1080') && /pinned 1920×1080/.test(b.out), 'lane e2b: --size reaches the server (never dropped) and the answer says pinned', b);
  const c = await run('vibespace-browser', ['--profile', 'da-7', 'get', 'url']);
  ok(c.code === 1 && /no_cdp_on_this_backend/.test(c.err) && /vibespace-window snapshot da-7/.test(c.err) && !/fake browser CLI was run/.test(c.err), '`--profile <handle> get url` prints no_cdp_on_this_backend with the window recipe', c);
  const u = await run('vibespace-browser', ['help']);
  ok(/new <label> --backend desktop-app \[--url <https:\/\/…>\] \[--keep-profile\]/.test(u.out), 'the usage teaches the door', u.out.slice(0, 200));
  const w = await run('vibespace-window', ['help']);
  ok(/browser_is_human/.test(w.out + w.err) && /--backend desktop-app/.test(w.out + w.err), 'vibespace-window\'s usage: a browser row is the user\'s, the agent\'s own is the new door', (w.out + w.err).slice(0, 300));
  srv.close();
  const R = require(path.join(REPO, 'src/browser-recipes.js'));
  ok(R.RECIPE_POINTER.includes(R.DESKTOP_APP_POINTER) && R.FIRST_VERB_NEXT.includes(R.DESKTOP_APP_POINTER) && /--backend desktop-app/.test(R.DESKTOP_APP_POINTER) && !R.REMOTE_POINTER.includes('desktop-app'), 'the `status` pointer and the first-verb pointer name the door (browser-recipes) — never for a conversation on another machine');
}

console.log('⑤ the placement model (PURE)');
async function placementChecks(modPath) {
  const { agentBrowserPlacement: P } = await import(modPath);
  const msg = { type: 'desktop-app-opened', sessionId: 'w-A', appId: 'da-1', origin: 'agent-browser' };
  const chatA = { winId: 'win-1', sessionId: 'w-A', minimized: false, hidden: false };
  const others = [{ winId: 'win-2', sessionId: 'w-B', minimized: false, hidden: false }];
  return {
    showing: P({ msg, chats: [...others, chatA] }),
    notShowing: P({ msg, chats: others }),
    minimized: P({ msg, chats: [...others, { ...chatA, minimized: true }] }),
    otherDesk: P({ msg, chats: [{ ...chatA, hidden: true }] }),
    phone: P({ msg, chats: [chatA], phone: true }),
    hiddenPage: P({ msg, chats: [chatA], visible: false }),
    human: P({ msg: { ...msg, origin: undefined }, chats: [chatA] }),
  };
}
const placeGreen = (p) => p.showing.act === 'beside' && p.showing.fromWin === 'win-1' && p.notShowing.act === 'none' && p.minimized.act === 'none' && p.otherDesk.act === 'none' && p.phone.act === 'own' && p.hiddenPage.act === 'none' && p.human.act === 'none';
{
  const p = await placementChecks(path.join(REPO, PLACE_REL));
  ok(p.showing.act === 'beside' && p.showing.fromWin === 'win-1', 'the client SHOWING the chat ⇒ beside that chat window', p.showing);
  ok(p.notShowing.act === 'none' && p.minimized.act === 'none' && p.otherDesk.act === 'none' && p.hiddenPage.act === 'none', 'not showing (no window / minimized / another desktop / the page hidden) ⇒ nothing opens');
  ok(p.phone.act === 'own', 'a phone showing the chat ⇒ its own window (R6)');
  ok(p.human.act === 'none', 'a launch without the agent-browser origin opens nothing here');
  ok(placeGreen(p), 'the placement table is green');
  const app = read('src/lib/app.js');
  ok(/if \(p\.act === 'beside'\) this\.openDesktopApp\(msg\.appId, \{ intoChain: this\.linkPlacement\(p\.fromWin\) \}\);/.test(app), 'app.js opens it through lane F\'s split door (linkPlacement) — no new placement path');
  ok(/openSpec: \{ action: 'openDesktopApp', id \}, \.\.\.\(intoChain \? \{ intoChain \} : \{\}\)/.test(read('src/lib/desktop-app-window.js')), 'openDesktopApp hands intoChain to createWindow');
}

console.log('r3 — the verify r1 findings (each leg re-run on a patched copy below)');
const NOW0 = 1_000_000;
/** #0 / #1 / the door — D6 keyed on the RECORD's opener. → {detachedStopped, nonOpenerSpared, doorOk, doorRefused} */
async function d6Checks(ENG, sub) {
  const W1 = world(ENG, sub + '-det');
  const r1 = await W1.engine.openAgentBrowser(doorOf(), W1.fA);
  W1.engine.detach(r1.handle, W1.fA); W1.sessions.delete('w-A'); W1.engine.reconcile({ graceMs: 0 });
  await new Promise((r) => setTimeout(r, 10));
  const detachedStopped = W1.stops.some((x) => x.id === r1.handle && x.o.why === 'opener-ended');
  const W2 = world(ENG, sub + '-non');
  const r2 = await W2.engine.openAgentBrowser(doorOf(), W2.fA);
  W2.engine.grantReach(r2.handle, { kind: 'session', id: 'claude:' + SESS_B.claudeSessionId }, { by: 'user' });
  W2.engine.detach(r2.handle, W2.fA); W2.engine.attach(r2.handle, W2.fB); W2.sessions.delete('w-B'); W2.engine.reconcile({ graceMs: 0 });
  await new Promise((r) => setTimeout(r, 10));
  const nonOpenerSpared = W2.stops.length === 0 && W2.sessions.has('w-A');
  const W3 = world(ENG, sub + '-door');
  const r3 = await W3.engine.openAgentBrowser(doorOf(), W3.fA);
  let refused = null; try { await W3.engine.stopOwn(r3.handle, W3.fB); } catch (e) { refused = e.code; }
  const own = await W3.engine.stopOwn(r3.handle, W3.fA).catch((e) => ({ err: e.code }));
  return { detachedStopped, nonOpenerSpared, doorRefused: refused === 'not_your_browser', doorOk: own.stopped === true && W3.stops.some((x) => x.id === r3.handle && x.o.why === 'opener-stopped') };
}
/** #2 / #6 — a Scale ▸ relaunch keeps the agent's rung; the lease follows replacedBy; D6 still fires on the successor. */
async function relaunchChecks(ENG, sub) {
  const W = world(ENG, sub);
  const r = await W.engine.openAgentBrowser(doorOf(), W.fA);
  const { app: next } = await W.keeper.relaunch(r.handle);
  W.engine.reconcile({ graceMs: 0 });
  const carried = !!W.engine.agentBrowserFor(next.id, W.fA.browserKey) && W.engine.isHumanBrowser(W.records.get(next.id)) === false;
  W.sessions.delete('w-A'); W.engine.reconcile({ graceMs: 0 });
  await new Promise((rr) => setTimeout(rr, 10));
  return { carried, origin: W.records.get(next.id).origin === 'agent-browser', stopped: W.stops.some((x) => x.id === next.id && x.o.why === 'opener-ended') };
}
/** #3 / #10 — the user drives it (a takeover) or a viewer has it open ⇒ the stop waits (said once), at most one grace more. */
async function busyChecks(ENG, sub) {
  const clock = { t: NOW0 };
  const W = world(ENG, sub, { clock });
  const r = await W.engine.openAgentBrowser(doorOf(), W.fA);
  W.engine.takeover({ handle: r.handle, viewerId: 'viewer-1' });
  W.sessions.delete('w-A');
  W.engine.reconcile({ graceMs: 0 });
  await new Promise((rr) => setTimeout(rr, 10));
  const waited = W.stops.length === 0 && W.sent.filter((m) => m.type === 'desktop-app-ending' && m.appId === r.handle).length === 1;
  clock.t += 30_000; W.engine.reconcile({ graceMs: 0 });
  const toldOnce = W.sent.filter((m) => m.type === 'desktop-app-ending').length === 1 && W.stops.length === 0;
  clock.t += ENG.LEASE_DROP_GRACE_MS; W.engine.reconcile({ graceMs: 0 });
  await new Promise((rr) => setTimeout(rr, 10));
  const boundedStop = W.stops.some((x) => x.id === r.handle && x.o.why === 'opener-ended');
  const V = world(ENG, sub + '-viewer', { clock: { t: NOW0 } });
  const rv = await V.engine.openAgentBrowser(doorOf(), V.fA);
  V.engine.setViewerCount((h) => (h === rv.handle ? 1 : 0));
  V.sessions.delete('w-A'); V.engine.reconcile({ graceMs: 0 });
  await new Promise((rr) => setTimeout(rr, 10));
  return { waited, toldOnce, boundedStop, viewerWaits: V.stops.length === 0 };
}
/** #5 / #9 — two per conversation; another conversation is not counted against it. */
async function capChecks(ENG, sub) {
  const W = world(ENG, sub);
  await W.engine.openAgentBrowser(doorOf(), W.fA); await W.engine.openAgentBrowser(doorOf(), W.fA);
  let third = null; try { await W.engine.openAgentBrowser(doorOf(), W.fA); } catch (e) { third = e; }
  const other = await W.engine.openAgentBrowser(doorOf(), W.fB).catch((e) => ({ err: e.code }));
  return { capped: !!third && third.code === 'desktop_app_cap' && /da-1, da-2/.test(third.message) && /vibespace-window stop/.test(third.message), otherOk: !!other.handle };
}
/** #7 — an agent driving its own browser credits the idle clock. */
async function idleChecks(ENG, sub) {
  const W = world(ENG, sub);
  const r = await W.engine.openAgentBrowser(doorOf(), W.fA);
  try { await W.engine.act(r.handle, W.fA, { verb: 'key', chord: 'Return' }); } catch { /* no X here — the credit comes first */ }
  return { credited: W.inputs.includes(r.handle) };
}
{
  const d = await d6Checks(ENGINE, 'r3');
  ok(d.detachedStopped, 'r3 #0: a DETACHED agent browser still ends with its conversation (keyed on the record\'s opener, why opener-ended)');
  ok(d.nonOpenerSpared, 'r3 #1: a NON-opener holder\'s end only drops ITS lease — the opener\'s browser keeps running');
  ok(d.doorRefused && d.doorOk, 'r3 #0 door: `vibespace-window stop <h>` stops the opener\'s own browser (opener-stopped); another conversation is refused not_your_browser');
  const rl = await relaunchChecks(ENGINE, 'r3-rl');
  ok(rl.carried && rl.origin, 'r3 #2/#6: after a Scale ▸ relaunch the successor is still the agent\'s (origin, not a human\'s browser); an ORPHANED lease is carried along replacedBy (r4 #6: the route refuses a relaunch while a lease exists — the door path is detach → relaunch → re-attach, the r4 #6 leg)', rl);
  ok(rl.stopped, 'r3 #2/#6: D6 still stops the successor when the conversation ends');
  const b = await busyChecks(ENGINE, 'r3-busy');
  ok(b.waited && b.toldOnce, 'r3 #3/#10: the user driving it (a takeover) ⇒ the stop WAITS, said once (audit + desktop-app-ending)', b);
  ok(b.boundedStop, 'r3 #3/#10: …at most one grace more — then it closes (the conversation is gone)');
  ok(b.viewerWaits, 'r3 #3/#10: a viewer with it open ⇒ the stop waits too');
  const c = await capChecks(ENGINE, 'r3-cap');
  ok(c.capped && c.otherOk, 'r3 #5/#9: a third desktop browser of ONE conversation is refused desktop_app_cap naming its handles + the stop verb; another conversation still opens', c);
  const i = await idleChecks(ENGINE, 'r3-idle');
  ok(i.credited, 'r3 #7: a window verb on the agent\'s own browser credits the keeper\'s idle clock (an agent mid-task is not idle-stopped)');
  const V = (x) => B.desktopAppNewVerdict(x);
  const cred = V({ label: 'S', backend: 'desktop-app', url: 'https://alice:pw@example.com/' });
  ok(!cred.ok && cred.code === 'bad-url' && /credentials never ride a command line/.test(cred.error) && !require(path.join(REPO, 'src/desktop-browser-app.js')).validateBrowserUrl('https://u@example.com/').ok, 'r3 #8: a url with a user name / password is refused BY NAME (the door and the human dialog\'s verdict)', cred);
  const lacks = ['proxy', 'sharing', 'cdpPort', 'notes', 'adoptDir'].map((k) => V({ label: 'S', backend: 'desktop-app', [k]: k === 'cdpPort' ? 9222 : 'x' }));
  ok(lacks.every((v) => !v.ok && v.code === 'desktop_app_lacks' && /no egress policy/.test(v.error)), 'r3 #4: --proxy / --sharing / --cdp-port / --notes / --adopt are refused BY NAME on the desktop-app door', lacks.map((v) => v.code));
}

console.log('r4 — the verify r2 findings');
/** #4/#9 — dropSession (the kill path) ends the agent browsers itself. */
async function dropChecks(ENG, sub) { const W = world(ENG, sub); const r = await W.engine.openAgentBrowser(doorOf(), W.fA); W.sessions.delete('w-A'); W.engine.dropSession('w-A'); await new Promise((rr) => setTimeout(rr, 10)); return { stopped: W.stops.some((x) => x.id === r.handle && x.o.why === 'opener-ended') }; }
/** #5 — a relaunch in flight (old + successor live) counts once; #1/#7 — concurrent `new` calls cannot pass the ceiling together. */
async function capR4Checks(ENG, sub) {
  const W = world(ENG, sub);
  const r = await W.engine.openAgentBrowser(doorOf(), W.fA);
  const old = W.records.get(r.handle); W.records.set(r.handle, { ...old, state: 'ready', replacedBy: `${r.handle}-r` }); W.records.set(`${r.handle}-r`, { ...old, id: `${r.handle}-r`, state: 'launching' });
  const second = await W.engine.openAgentBrowser(doorOf(), W.fA).catch((e) => ({ err: e.code }));
  const C = world(ENG, sub + '-conc');
  await C.engine.openAgentBrowser(doorOf(), C.fA);
  const many = await Promise.all([1, 2, 3].map(() => C.engine.openAgentBrowser(doorOf(), C.fA).then(() => 'ok', (e) => e.code)));
  const live = [...C.records.values()].filter((x) => x.origin === 'agent-browser' && ['launching', 'ready'].includes(x.state)).length;
  return { relaunchCountsOnce: !!second.handle, live, refused: many.filter((x) => x === 'desktop_app_cap').length };
}
/** #0/#8 — the opener's own stop under the user's takeover WAITS (lease kept, told once), then closes (one grace / handback). */
async function ownStopChecks(ENG, sub) {
  const clock = { t: NOW0 };
  const W = world(ENG, sub, { clock });
  const r = await W.engine.openAgentBrowser(doorOf(), W.fA);
  W.engine.takeover({ handle: r.handle, viewerId: 'viewer-1' });
  const a = await W.engine.stopOwn(r.handle, W.fA);
  await new Promise((rr) => setTimeout(rr, 10));
  const waited = a.deferred === true && W.stops.length === 0 && !!W.engine.agentBrowserFor(r.handle, W.fA.browserKey) && W.sent.filter((m) => m.type === 'desktop-app-ending' && m.why === 'opener-stopped').length === 1;
  clock.t += ENG.LEASE_DROP_GRACE_MS + 1; W.engine.reconcile({ graceMs: ENG.LEASE_DROP_GRACE_MS });
  await new Promise((rr) => setTimeout(rr, 10));
  return { waited, closed: W.stops.some((x) => x.id === r.handle && x.o.why === 'opener-stopped') };
}
/** #2 — a pending end survives a restart: the booted engine waits one grace (no viewer has re-joined yet), then closes. */
async function restartChecks(ENG, sub) {
  const clock = { t: NOW0 };
  const W = world(ENG, sub, { clock });
  const r = await W.engine.openAgentBrowser(doorOf(), W.fA);
  W.engine.takeover({ handle: r.handle, viewerId: 'viewer-1' });
  W.sessions.delete('w-A');
  W.engine.reconcile({ graceMs: ENG.LEASE_DROP_GRACE_MS }); clock.t += ENG.LEASE_DROP_GRACE_MS + 1; W.engine.reconcile({ graceMs: ENG.LEASE_DROP_GRACE_MS });
  const toldBefore = W.sent.filter((m) => m.type === 'desktop-app-ending').length;
  clock.t += 30_000;
  const E2 = ENG.create({ keeper: W.keeper, dataDir: path.join(W.dir, 'data'), env: () => ({}), activeSessions: W.sessions, broadcast: () => { }, bins: { xdotool: null, gdbus: null }, log: { warn() { }, log() { } }, procExe: () => null, now: () => clock.t });
  E2.boot();
  await new Promise((rr) => setTimeout(rr, 10));
  const keptAtBoot = W.stops.length === 0;
  clock.t += ENG.LEASE_DROP_GRACE_MS + 1; E2.reconcile({ graceMs: ENG.LEASE_DROP_GRACE_MS });
  await new Promise((rr) => setTimeout(rr, 10));
  return { toldBefore, keptAtBoot, closedAfter: W.stops.some((x) => x.id === r.handle && x.o.why === 'opener-ended') };
}
/** #3 — stopOwn answers the keeper's own profile view; #6 — the old handle points at its successor; #10 — detach's words. */
async function wordsChecks(ENG, sub) {
  const W1 = world(ENG, sub + '-ok'); const a1 = await W1.engine.openAgentBrowser(doorOf(), W1.fA); const s1 = await W1.engine.stopOwn(a1.handle, W1.fA);
  const W2 = world(ENG, sub + '-fail', { profileFails: true }); const a2 = await W2.engine.openAgentBrowser(doorOf(), W2.fA); const s2 = await W2.engine.stopOwn(a2.handle, W2.fA);
  const W3 = world(ENG, sub + '-keep'); const a3 = await W3.engine.openAgentBrowser(doorOf({ keepProfile: true }), W3.fA); const s3 = await W3.engine.stopOwn(a3.handle, W3.fA);
  const W4 = world(ENG, sub + '-rl'); const a4 = await W4.engine.openAgentBrowser(doorOf(), W4.fA); const d4 = W4.engine.detach(a4.handle, W4.fA); await W4.keeper.relaunch(a4.handle);
  let nf = null; try { await W4.engine.stopOwn(a4.handle, W4.fA); } catch (e) { nf = e; }
  const att = W4.engine.attach(`${a4.handle}-r`, W4.fA);
  return { profileTrue: s1.profile === 'removed with it' && /^NOT removed: /.test(s2.profile) && /^kept /.test(s3.profile), pointer: !!nf && nf.code === 'not-found' && nf.message.includes(`was relaunched as ${a4.handle}-r`), reattach: !!att && att.handle === `${a4.handle}-r` && !!W4.engine.agentBrowserFor(`${a4.handle}-r`, W4.fA.browserKey), detachNote: /until your conversation ends/.test(d4.note) && /vibespace-window stop/.test(d4.note) };
}
{
  const d = await dropChecks(ENGINE, 'r4-drop');
  ok(d.stopped, 'r4 #4/#9 (MUST_FIX): dropSession — the kill path — ends the agent\'s desktop browsers itself (opener-ended), not only the tick');
  const c = await capR4Checks(ENGINE, 'r4-cap');
  ok(c.relaunchCountsOnce, 'r4 #5: a relaunch in flight (old + successor both live) is counted ONCE — a second browser still opens');
  ok(c.live === 2 && c.refused === 2, `r4 #1/#7: 1 open + 3 CONCURRENT \`new\` ⇒ exactly 2 live, 2 refused desktop_app_cap (the ceiling reserved before the keeper's await) — ${c.live} live`, c);
  const o = await ownStopChecks(ENGINE, 'r4-own');
  ok(o.waited, 'r4 #0/#8: `vibespace-window stop` while the user drives it WAITS — the lease kept, told once (desktop-app-ending opener-stopped), nothing stopped', o);
  ok(o.closed, 'r4 #0/#8: …and closes after at most one grace (opener-stopped)');
  const rs = await restartChecks(ENGINE, 'r4-boot');
  ok(rs.toldBefore === 1 && rs.keptAtBoot, 'r4 #2: the pending end survives a restart — the booted engine does NOT stop it (no viewer has re-joined yet)', rs);
  ok(rs.closedAfter, 'r4 #2: …it closes one grace after the boot');
  const w = await wordsChecks(ENGINE, 'r4-words');
  ok(w.profileTrue, 'r4 #3: stopOwn answers the keeper\'s own profile view — removed / NOT removed: <why> / kept (why)', w);
  ok(w.pointer && w.reattach, 'r4 #6: after a relaunch the old handle points at its successor; the opener re-attaches to it (the grant followed — the door path: detach first)', w);
  ok(w.detachNote, 'r4 #10: detach tells the agent its own browser runs until its conversation ends, and names stop / attach');
}

// ── ⑩ lane e2c (design q-022 §E2.3, B-830d ③): THE LAUNCH MODE — the agent decides tree | pixels | auto ──
const RE = require(path.join(REPO, 'src/window-reach.js'));
const WTM = require(path.join(REPO, 'src/window-targets.js'));
const reachSent = (W, h) => { for (let i = W.sent.length - 1; i >= 0; i--) { const m = W.sent[i]; if (m && m.type === 'window-reach-updated') { const v = (m.reach || []).find((x) => x && x.handle === h); if (v) return v; } } return null; };
const codeOf = async (p) => { try { await p; return null; } catch (e) { return { code: e && e.code, msg: String(e && e.message) }; } };
/** The checks a control re-runs: the door, the engine at launch, the verb. → booleans */
async function e2cChecks(ENG, Bm, sub) {
  const out = {};
  const door = (x) => Bm.desktopAppNewVerdict({ label: 'Site login', backend: 'desktop-app', url: 'https://example.com/', ...x });
  const dp = door({ mode: 'pixels' }), dt = door({ mode: 'tree' }), dx = door({ mode: 'sideways' }), ds = door({ mode: 'pixels', size: '1280x720' }), dprof = Bm.desktopAppNewVerdict({ label: 'site', mode: 'tree' });
  out.doorSeen = { dp: dp.code || dp.mode, dt: dt.code || dt.mode, dx: dx.code, ds: ds.code || (ds.pin && ds.pin.w), dprof: dprof.code };
  out.door = !!(dp.ok && dp.mode === 'pixels' && dp.pin && dp.pin.w === 1920 && dp.pin.h === 1080 && dt.ok && dt.mode === 'tree' && dt.pin === null
    && !dx.ok && dx.code === 'bad_mode' && ds.ok && ds.size && ds.size.w === 1280 && ds.pin.w === 1280 && !dprof.ok && dprof.code === 'desktop_app_only' && /--mode/.test(dprof.error));
  if (!out.door) return out;
  let probes = 0;
  const W = world(ENG, sub, { wt: { ...WTM, probeA11y: async () => { probes++; return { ok: false, why: 'no AT-SPI bus (fake)' }; } } });
  const pinOf = (i) => (W.launches[i] && W.launches[i].opts.pin) || null;
  const r1 = await W.engine.openAgentBrowser(dp, W.fA);           // chromium (its switch measured), pixels as asked
  const r2 = await W.engine.openAgentBrowser(dt, W.fA);           // chromium, tree as asked
  const ch = REGISTRY.find((r) => r.id === 'chromium'); ch.available = false;
  let r3, r4; try { r3 = await W.engine.openAgentBrowser(door({}), W.fB); r4 = await W.engine.openAgentBrowser(door({ mode: 'tree', size: '1280x720' }), W.fB); } finally { ch.available = true; }
  out.launchSeen = { p1: pinOf(0), m1: (reachSent(W, r1.handle) || {}).mode, p2: pinOf(1), m2: (reachSent(W, r2.handle) || {}).mode, p3: pinOf(2), m3: (reachSent(W, r3.handle) || {}).mode, w3: r3.modeWhy, p4: pinOf(3), w4: r4.modeWhy };
  out.launchPixels = !!(pinOf(0) && pinOf(0).w === 1920 && pinOf(0).h === 1080 && out.launchSeen.m1 === 'pixels' && /^pixel mode as asked/.test(r1.modeWhy) && /^vibespace-window screenshot /.test(r1.next));
  out.launchTree = !pinOf(1) && out.launchSeen.m2 === 'tree' && /^tree mode as asked/.test(r2.modeWhy) && /^vibespace-window snapshot /.test(r2.next);
  out.firefoxPinned = !!(pinOf(2) && pinOf(2).w === 1920 && pinOf(2).h === 1080 && out.launchSeen.m3 === 'pixels' && /^firefox has no accessibility tree here \(auto was asked\) — pixel mode, pinned to 1920x1080/.test(r3.modeWhy));
  out.sizeWins = !!(pinOf(3) && pinOf(3).w === 1280 && pinOf(3).h === 720 && /\(tree was asked\)/.test(r4.modeWhy));
  // the verb: the opener on its own window; another conversation's ⇒ not_your_window; a window the user shared ⇒ theirs
  const nB = await codeOf(W.engine.setLaunchMode(r2.handle, 'pixels', W.fB));
  W.records.set('da-user', { id: 'da-user', label: 'Chromium', exec: 'chromium', appId: 'chromium', browser: 'chromium', state: 'launching', display: ':77', pids: { app: 4343, x: null, server: null, wm: null }, starts: { app: 9 }, origin: 'desktop' });
  const nU = await codeOf(W.engine.setLaunchMode('da-user', 'tree', W.fA));
  out.nonOpenerRefused = !!(nB && nB.code === 'not_your_window' && /only its opener sets its mode/.test(nB.msg));
  out.userRefused = !!(nU && nU.code === 'not_your_window' && /the user's to set from the window's menu/.test(nU.msg));
  const n0 = W.sent.length;
  const sp = await W.engine.setLaunchMode(r2.handle, 'pixels', W.fA);
  out.verbSets = sp.mode.mode === 'pixels' && sp.changed === true && /^pixel mode as asked/.test(sp.why) && W.sent.slice(n0).some((m) => m.type === 'window-reach-updated' && (m.reach || []).some((x) => x.handle === r2.handle && x.mode === 'pixels')) && !W.records.get(r2.handle).pin;
  const p0 = probes;
  const sa = await W.engine.setLaunchMode(r2.handle, 'auto', W.fA);
  out.autoReprobes = probes === p0 + 1 && sa.mode.mode === 'auto' && sa.mode.resolved === 'pixels' && /unreachable here \(no AT-SPI bus \(fake\)\)/.test(sa.why);
  const bad = await codeOf(W.engine.setLaunchMode(r2.handle, 'sideways', W.fA));
  out.badMode = !!(bad && bad.code === 'bad_mode');
  const ff = await W.engine.setLaunchMode(r3.handle, 'tree', W.fB);
  out.firefoxStays = ff.mode.mode === 'pixels' && /^firefox has no accessibility tree here \(tree was asked\)/.test(ff.why);
  out.verbSeen = { nB, nU, sp: sp.why, sa: sa.why, bad, ff: ff.why, probes };
  return out;
}
console.log('⑩ lane e2c: the launch mode (--mode auto | tree | pixels, vibespace-window mode)');
{
  // the PURE verdict, every cell: family × accessibility × asked
  const cells = [];
  for (const kind of ['chromium', 'firefox', null]) for (const a11y of [true, false]) for (const asked of [undefined, 'auto', 'tree', 'pixels', 'sideways']) {
    const v = RE.launchModeVerdict({ browserKind: kind, a11y, asked });
    const want = asked === 'sideways' ? { ok: false, mode: null, pin: null } : !a11y || asked === 'pixels' ? { ok: true, mode: 'pixels', pin: '1920x1080' } : { ok: true, mode: asked || 'auto', pin: null };
    const got = { ok: v.ok, mode: v.mode, pin: v.pin ? `${v.pin.w}x${v.pin.h}` : null };
    const whyOk = !v.ok ? v.code === 'bad_mode' && /auto \| tree \| pixels/.test(v.why) : !a11y ? new RegExp(`^${kind || 'this browser'} has no accessibility tree here`).test(v.why) && /pinned to 1920x1080 unless --size/.test(v.why) : typeof v.why === 'string' && v.why.length > 20;
    cells.push({ kind, a11y, asked, pass: JSON.stringify(got) === JSON.stringify(want) && whyOk, got, why: v.why });
  }
  const bad = cells.filter((c) => !c.pass);
  ok(cells.length === 30 && !bad.length, `launchModeVerdict: all ${cells.length} cells (chromium / firefox / unknown × a11y yes / no × unset / auto / tree / pixels / bogus) — no tree ⇒ pixels + 1920×1080 whatever was asked, else as asked; the why names it`, bad.slice(0, 3));
  ok(RE.MODES.join() === 'auto,tree,pixels' && B.NOT_YET_FLAGS && !('mode' in B.NOT_YET_FLAGS) && /\[--mode auto\|tree\|pixels\]/.test(B.DESKTOP_APP_DOOR), 'the door\'s words name --mode auto|tree|pixels; --mode is no longer not_yet');
  const x = await e2cChecks(ENGINE, B, 'e2c');
  ok(x.door, 'the door: --mode pixels ⇒ the 1920×1080 default pin; tree ⇒ no pin; a bogus mode ⇒ bad_mode; --size beats the default; --mode on a profile row ⇒ desktop_app_only', x.doorSeen);
  ok(x.launchPixels, 'launch --mode pixels on chromium: the keeper launches it pinned 1920×1080, the reach record says pixels (broadcast), why = "pixel mode as asked…", next = screenshot', x.launchSeen);
  ok(x.launchTree, 'launch --mode tree on chromium: no pin, the reach record says tree, next = snapshot', x.launchSeen);
  ok(x.firefoxPinned, 'a firefox (its switch unmeasured here) is pixels-only: pinned 1920×1080 with no --size, the record says pixels, why names firefox + what was asked', x.launchSeen);
  ok(x.sizeWins, 'pixels-only with an explicit --size 1280x720: --size wins over the default pin; why says tree was asked', x.launchSeen);
  ok(x.nonOpenerRefused && x.userRefused, 'vibespace-window mode: another conversation ⇒ not_your_window; a window the user shared ⇒ not_your_window naming the window menu', x.verbSeen);
  ok(x.verbSets, 'the opener switches tree → pixels: the reach record changes and is broadcast; E2b\'s pin untouched', x.verbSeen);
  ok(x.autoReprobes && x.badMode, 'mode auto re-runs the probe now (its answer + why recorded: the bus is down ⇒ pixels); a bogus mode ⇒ bad_mode', x.verbSeen);
  ok(x.firefoxStays, 'mode tree on the firefox stays pixels and says why', x.verbSeen);
}

console.log('CONTROLS (patched copies)');
{
  const src = read(ENGINE_REL);
  const human = src.replace("if (bRow) throw namedError('browser_is_human',", "if (false && bRow) throw namedError('browser_is_human',");
  ok(human !== src, 'control (a) planted: open() admits the human browser row');
  const H = MUT.load(ENGINE_REL, human, 'human-row');
  const h = await engineChecks(H, 'mut-human');
  ok(!h.humanRefused, 'CONTROL (a): the human row allowed ⇒ the "open chromium stays browser_is_human" leg goes RED');
  const cdp = src.replace("if (!l || l.origin !== AGENT_BROWSER_ORIGIN || !browserKey || l.browserKey !== browserKey) return null;", 'return null;');
  ok(cdp !== src, 'control (b) planted: the CDP lookup answers nothing on this backend');
  const C = MUT.load(ENGINE_REL, cdp, 'cdp-answers');
  const c = await engineChecks(C, 'mut-cdp');
  ok(!c.cdpFound, 'CONTROL (b): a CDP verb answering on this backend (no refusal found) ⇒ the "resolve refuses no_cdp_on_this_backend" leg goes RED');
  const ps = read(PLACE_REL);
  const any = ps.replace("c.sessionId === msg.sessionId && !c.minimized && !c.hidden", 'true');
  ok(any !== ps, 'control (c) planted: a client opens it whatever it shows');
  const p = await placementChecks(MUT.write(PLACE_REL, any, 'any-client', { esm: true }));
  ok(!placeGreen(p) && p.notShowing.act !== 'none', 'CONTROL (c): a client not showing the chat opening the window ⇒ the placement leg goes RED', p.notShowing);
  // r3 controls: each fix reverted in a copy ⇒ its leg goes RED
  const mutE = (tag, from, to) => { assert1(src.includes(from), `r3 control ${tag} planted`); return MUT.load(ENGINE_REL, src.replace(from, to), tag); };
  { const M0 = mutE('d6-lease', "    const ended = endAgentBrowsers({ graceMs }); // lane e2a r3: D6 on the RECORD's opener\n", '    const ended = [];\n'); const d = await d6Checks(M0, 'mut-d6'); ok(!d.detachedStopped, 'CONTROL r3 #0: D6 back on the lease (no record walk) ⇒ the detached browser is never stopped — RED'); }
  { const M1 = mutE('d6-any', "      if (!own && (endedId ? opener !== endedId : sessionLive(opener))) {", "      if (false) {"); const d = await d6Checks(M1, 'mut-any'); ok(!d.nonOpenerSpared, 'CONTROL r3 #1: the opener not compared ⇒ a non-opener\'s end stops the opener\'s browser — RED'); }
  { const M2 = mutE('door', "    if (rec.origin !== AGENT_BROWSER_ORIGIN || !rec.by || rec.by.sessionId !== facts.sessionId) throw", "    if (false) throw"); const d = await d6Checks(M2, 'mut-door'); ok(!d.doorRefused, 'CONTROL r3 door: the opener check removed ⇒ another conversation stops it — RED'); }
  { const M3 = mutE('carry', "        const next = l.origin === AGENT_BROWSER_ORIGIN ? successorOf(h) : null;", "        const next = null;"); const r = await relaunchChecks(M3, 'mut-carry'); ok(!r.carried, 'CONTROL r3 #2/#6: the lease not carried along replacedBy ⇒ the successor is not the opener\'s — RED'); }
  { const M4 = mutE('busy', "      const busy = userBusy(rec.id);", "      const busy = null;"); const b = await busyChecks(M4, 'mut-busy'); ok(!b.waited && !b.viewerWaits, 'CONTROL r3 #3/#10: no wait while the user drives / views ⇒ closed under them — RED'); }
  { const M5 = mutE('cap', "const AGENT_BROWSER_CAP = 2;", "const AGENT_BROWSER_CAP = 99;"); const c = await capChecks(M5, 'mut-cap'); ok(!c.capped, 'CONTROL r3 #5/#9: no per-conversation ceiling ⇒ a third browser opens — RED'); }
  { const M6 = mutE('idle', "    if (rec.origin === AGENT_BROWSER_ORIGIN) { try { keeper.noteInput?.(rec.id); } catch { /* the idle clock only */ } }", ''); const i = await idleChecks(M6, 'mut-idle'); ok(!i.credited, 'CONTROL r3 #7: no idle credit ⇒ an agent mid-task is idle-stopped — RED'); }
  { const M7 = mutE('label', ", label: v.label, ...(pin", ", ...(pin"); const W = world(M7, 'mut-label'); await W.engine.openAgentBrowser(doorOf(), W.fA); ok(W.records.get('da-1').label !== 'Site login', 'CONTROL r3 #11: the label not handed to the keeper ⇒ the record says the row\'s label — RED'); }
  { const das = read('src/desktop-apps.js'); const line = "  if (rec.origin === AGENT_BROWSER_ORIGIN) return { remove: true, why: `the agent's own throwaway profile (${rec.stoppedBy || rec.state})` };\n"; assert1(das.includes(line), 'r3 control #7 retire planted'); const DM = MUT.load('src/desktop-apps.js', das.replace(line, ''), 'retire'); ok(!retireOk(DM), 'CONTROL r3 #7: the agent-browser retire rule removed ⇒ an idle-stopped agent profile is kept — RED'); }
  { const dba = read('src/desktop-browser-app.js'); const line = "  if (u.username || u.password) return { ok: false, url: null, code: 'bad-url',"; assert1(dba.includes(line), 'r3 control #8 planted'); const mp = MUT.write('src/desktop-browser-app.js', dba.replace(line, '  if (false) return { ok: false, url: null, code: \'bad-url\','), 'creds'); const bp = read('src/browser-profiles.js'); const BP = MUT.load('src/browser-profiles.js', bp.replace("require('./desktop-browser-app.js')", `require(${JSON.stringify(mp)})`), 'creds-bp'); ok(BP.desktopAppNewVerdict({ label: 'S', backend: 'desktop-app', url: 'https://alice:pw@example.com/' }).ok === true, 'CONTROL r3 #8: the userinfo check removed ⇒ credentials pass the door — RED'); }
  { const bp = read('src/browser-profiles.js'); const line = "  for (const [k, f] of DESKTOP_APP_LACKS) if (given(s[k]))"; assert1(bp.includes(line), 'r3 control #4 planted'); const BP = MUT.load('src/browser-profiles.js', bp.replace(line, '  for (const [k, f] of []) if (given(s[k]))'), 'lacks'); ok(BP.desktopAppNewVerdict({ label: 'S', backend: 'desktop-app', proxy: 'http://proxy.example' }).ok === true, 'CONTROL r3 #4: the lacks loop removed ⇒ --proxy silently dropped — RED'); }
  // r4 controls
  { const M = mutE('r4-drop', "endAgentBrowsers({ endedId: sessionId }); // r4", "void 0; // r4"); ok(!(await dropChecks(M, 'mut-r4-drop')).stopped, 'CONTROL r4 #4: dropSession without the record walk ⇒ the browser survives the kill path — RED'); }
  { const M = mutE('r4-relaunch', "facts.sessionId && !r.replacedBy);", "facts.sessionId);"); ok(!(await capR4Checks(M, 'mut-r4-rl')).relaunchCountsOnce, 'CONTROL r4 #5: a relaunch in flight counted twice ⇒ the second browser refused — RED'); }
  { const M = mutE('r4-reserve', "    const pending = launching.get(facts.sessionId) || 0;", "    const pending = 0;"); const c = await capR4Checks(M, 'mut-r4-conc'); ok(c.live > 2, `CONTROL r4 #1/#7: no reservation before the await ⇒ concurrent calls open ${c.live} — RED`); }
  { const M = mutE('r4-own', "    const busy = userBusy(rec.id);\n    if (busy) {\n      if (!openerLost.has", "    const busy = null;\n    if (busy) {\n      if (!openerLost.has"); ok(!(await ownStopChecks(M, 'mut-r4-own')).waited, 'CONTROL r4 #0/#8: stopOwn ignoring the user ⇒ closed under their hands — RED'); }
  { const M = mutE('r4-boot', "      if (st.restored && bootAt != null && t - bootAt < LEASE_DROP_GRACE_MS) continue;\n", ''); ok(!(await restartChecks(M, 'mut-r4-boot')).keptAtBoot, 'CONTROL r4 #2: no boot grace ⇒ the restart stops it at once — RED'); }
  { const M = mutE('r4-profile', "    const profile = after.keepProfile ?", "    const profile = true ? 'removed with it' : after.keepProfile ?"); ok(!(await wordsChecks(M, 'mut-r4-prof')).profileTrue, 'CONTROL r4 #3: an unconditional profile answer ⇒ RED'); }
  { const M = mutE('r4-pointer', "return nx && liveRecord(nx) ? ` — ${handle} was relaunched as ${nx}: use that handle` : ''; };", "return ''; };"); ok(!(await wordsChecks(M, 'mut-r4-ptr')).pointer, 'CONTROL r4 #6: no successor pointer ⇒ a bare not-found — RED'); }
  { const M = mutE('r4-detach', "note: ownBrowser ?", "note: false ?"); ok(!(await wordsChecks(M, 'mut-r4-det')).detachNote, 'CONTROL r4 #10: the stale detach words ⇒ RED'); }
  // lane e2c controls: pixels-only without the default pin; a non-opener allowed to set the mode; --mode still not_yet
  { const M = mutE('e2c-nopin', " || mv.pin || null;", " || null;"); ok(!(await e2cChecks(M, B, 'mut-e2c-nopin')).firefoxPinned, 'CONTROL e2c (a): pixels-only without E2b\'s default pin ⇒ the firefox-pinned leg goes RED'); }
  { const M = mutE('e2c-anyone', "    if (!rec.by || rec.by.sessionId !== facts.sessionId) throw namedError('not_your_window',", "    if (false) throw namedError('not_your_window',"); ok(!(await e2cChecks(M, B, 'mut-e2c-anyone')).nonOpenerRefused, 'CONTROL e2c (b): a non-opener allowed to set the mode ⇒ the verb\'s permission leg goes RED'); }
  { const bp = read('src/browser-profiles.js'); const line = "const NOT_YET_FLAGS = Object.freeze({});"; assert1(bp.includes(line), 'e2c control (c) planted'); const Bm = MUT.load('src/browser-profiles.js', bp.replace(line, "const NOT_YET_FLAGS = Object.freeze({ mode: 'E2c (the interaction mode)' });"), 'e2c-not-yet'); ok(!(await e2cChecks(ENGINE, Bm, 'mut-e2c-notyet')).door, 'CONTROL e2c (c): --mode still refused not_yet ⇒ the door leg goes RED'); }
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 22, label: 'desktop-app-rung' })) ok(x.pass, x.name, x.detail);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
