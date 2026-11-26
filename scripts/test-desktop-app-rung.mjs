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
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  const want = { tier: 3, wired: true, keyScope: 'none', canSwitchTo: 'no', ownsDir: true, leaseKind: 'window-target', remote: null, starts: true, headed: true, binary: null, cdp: false, allowedDomains: false, pinTab: false, consent: null };
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
function world(ENG, sub, { onLaunch = null, clock = null, profileFails = false, dataDir = null, wt = null, helper = null } = {}) {
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
  const engine = ENG.create({ keeper, dataDir: dataDir || path.join(dir, 'data'), env: () => ({}), activeSessions: sessions, broadcast: (m) => sent.push(m), bins: { xdotool: null, gdbus: null }, log: { warn() { }, log() { } }, procExe: () => null, ...(clock ? { now: () => clock.t } : {}), ...(wt ? { wt } : {}), ...(helper ? { helper, python: process.execPath } : {}) });
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
  const rows = W.engine.reachOf('da-1').rows;   // lane grants-unify: the share rows live in the ONE grants store (read back as the record)
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
  W.engine.storesLanded();   // B-574d browser-stores 5/8: the lease handed to the store writer, on disk once it landed
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
  W.engine.storesLanded();   // B-574d browser-stores 5/8: the first engine's writes on disk before the restart reads them
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
  { const das = read('src/desktop-apps.js'); const line = "  if (rec.origin === AGENT_BROWSER_ORIGIN) return { remove: true, why: `the agent's own throwaway profile (${rec.stoppedBy || rec.state})` };\n"; assert1(das.includes(line), 'r3 control #7 retire planted'); const DM = MUT.load('src/desktop-apps.js', editAnchor(das, line, '', "src/desktop-apps.js"), 'retire'); ok(!retireOk(DM), 'CONTROL r3 #7: the agent-browser retire rule removed ⇒ an idle-stopped agent profile is kept — RED'); }
  { const dba = read('src/desktop-browser-app.js'); const line = "  if (u.username || u.password) return { ok: false, url: null, code: 'bad-url',"; assert1(dba.includes(line), 'r3 control #8 planted'); const mp = MUT.write('src/desktop-browser-app.js', editAnchor(dba, line, '  if (false) return { ok: false, url: null, code: \'bad-url\',', "src/desktop-browser-app.js"), 'creds'); const bp = read('src/browser-profiles.js'); const BP = MUT.load('src/browser-profiles.js', editAnchor(bp, "require('./desktop-browser-app.js')", `require(${JSON.stringify(mp)})`, "src/browser-profiles.js"), 'creds-bp'); ok(BP.desktopAppNewVerdict({ label: 'S', backend: 'desktop-app', url: 'https://alice:pw@example.com/' }).ok === true, 'CONTROL r3 #8: the userinfo check removed ⇒ credentials pass the door — RED'); }
  { const bp = read('src/browser-profiles.js'); const line = "  for (const [k, f] of DESKTOP_APP_LACKS) if (given(s[k]))"; assert1(bp.includes(line), 'r3 control #4 planted'); const BP = MUT.load('src/browser-profiles.js', editAnchor(bp, line, '  for (const [k, f] of []) if (given(s[k]))', "src/browser-profiles.js"), 'lacks'); ok(BP.desktopAppNewVerdict({ label: 'S', backend: 'desktop-app', proxy: 'http://proxy.example' }).ok === true, 'CONTROL r3 #4: the lacks loop removed ⇒ --proxy silently dropped — RED'); }
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
  { const bp = read('src/browser-profiles.js'); const line = "const NOT_YET_FLAGS = Object.freeze({});"; assert1(bp.includes(line), 'e2c control (c) planted'); const Bm = MUT.load('src/browser-profiles.js', editAnchor(bp, line, "const NOT_YET_FLAGS = Object.freeze({ mode: 'E2c (the interaction mode)' });", "src/browser-profiles.js"), 'e2c-not-yet'); ok(!(await e2cChecks(ENGINE, Bm, 'mut-e2c-notyet')).door, 'CONTROL e2c (c): --mode still refused not_yet ⇒ the door leg goes RED'); }
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 22, label: 'desktop-app-rung' })) ok(x.pass, x.name, x.detail);
}

// ── ⑨ B-4be3 (主开发 r1165 / r1176 / r1179): a LARGE page read PART BY PART — ONE subtree by its ref, ONE node's WHOLE
// text (byte-bounded, the cut said), and a hidden text never read through the tree. The reporter's scene: a desktop-app
// browser window whose table outgrows the 3000-node budget, an address bar whose address the snapshot cuts.
console.log('⑨ B-4be3: the subtree read, the whole-text read, the hidden-text rule');
{
  const { spawnSync } = require('node:child_process');
  const J = JSON.stringify;
  const dir = scratch('b4be3'); fs.mkdirSync(dir, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
  // (A) THE ENGINE'S DOOR over a stand-in helper (node): it logs every request and answers a small page —
  // a table of rows (no actions), a button (an action: the whole tree resolves to tree mode), an address entry
  const log = path.join(dir, 'helper.log');
  const helper = path.join(dir, 'fake-helper.js');
  fs.writeFileSync(helper, `
    const fs = require('fs');
    let s = ''; process.stdin.on('data', (d) => { s += d; }); process.stdin.on('end', () => {
      const req = JSON.parse(s); fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(req) + '\\n');
      const pid = (req.pids && req.pids[0]) || req.pid || 4242;
      const nd = (ref, p, role, name, extra) => ({ ref, pid, path: p, role, name, depth: p.length, iface: [], ...extra });
      const census = (n) => ({ nodes: n, component: 0, action: 1, editableText: 1, text: 1, buttons: 1, buttonsWithAction: 1, byRole: {}, actionNames: { press: 1 } });
      let out;
      if (req.op === 'snapshot' && req.root) {
        const r = req.root.path;   // ONE subtree: the table and its rows — cells only, nothing to act on
        const nodes = [nd('@e1', r, 'table', 'Expenses'), nd('@e2', r.concat(0), 'table row', 'row 1', { parent: '@e1' }), nd('@e3', r.concat(1), 'table row', 'row 2', { parent: '@e1' }), nd('@e4', r.concat(0, 0), 'table cell', 'Taxi', { parent: '@e2' })];
        out = { ok: true, apps: [{ pid, name: 'Chromium' }], nodes, root: { pid, path: r, role: 'table', name: 'Expenses' }, census: census(4), unreadable: [], truncated: false, budget: req.budget, callTimeoutMs: 800, ms: 1 };
      } else if (req.op === 'snapshot' && fs.existsSync(${JSON.stringify(path.join(dir, 'closed-tree'))})) {
        out = { ok: true, apps: [{ pid, name: 'Chromium' }], nodes: [nd('@e1', [], 'application', 'Chromium'), nd('@e2', [0], 'frame', '', { parent: '@e1' })], census: census(2), unreadable: [], truncated: false, budget: req.budget, callTimeoutMs: 800, ms: 1 };
      } else if (req.op === 'snapshot') {
        const nodes = [nd('@e1', [], 'application', 'Chromium'), nd('@e2', [0], 'frame', 'Reimbursements', { parent: '@e1' }), nd('@e3', [0, 0], 'table', 'Expenses', { parent: '@e2' }),
          nd('@e4', [0, 1], 'push button', 'Submit', { parent: '@e2', actions: ['press'] }), nd('@e5', [0, 2], 'entry', 'Address and search bar', { parent: '@e2', editable: true, text: 'https://example.test/report?id=1' })];
        out = { ok: true, apps: [{ pid, name: 'Chromium' }], nodes, census: census(5), unreadable: [], truncated: false, budget: req.budget, callTimeoutMs: 800, ms: 1 };
      } else if (req.op === 'act' && req.verb === 'text' && req.maxBytes === 4242) {
        // r2: a SLOW read — it says it started, then waits for the test's go (what happened, never a clock) before answering
        fs.writeFileSync(${JSON.stringify(path.join(dir, 'text-started'))}, '1');
        const t0 = Date.now(); while (!fs.existsSync(${JSON.stringify(path.join(dir, 'text-go'))}) && Date.now() - t0 < 6000) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); }
        out = { ok: true, did: { verb: 'text', role: req.expect.role, name: req.expect.name, nameChars: req.expect.name.length, nameCut: false, text: 'the-whole-field-value', chars: 21, bytes: 21, maxBytes: 4242, cut: false }, ms: 1 };
      } else if (req.op === 'act' && req.verb === 'text') {
        const whole = 'https://example.test/report?id=1&' + 'q'.repeat(90000);
        const t = whole.slice(0, req.maxBytes);
        out = { ok: true, did: { verb: 'text', role: req.expect.role, name: req.expect.name, nameChars: req.expect.name.length, nameCut: false, text: t, chars: whole.length, bytes: Buffer.byteLength(t), maxBytes: req.maxBytes, cut: t.length < whole.length }, ms: 1 };
      } else if (req.op === 'act') out = { ok: true, did: { verb: req.verb, role: req.expect.role, name: req.expect.name } };
      else if (req.op === 'probe') out = { ok: true, apps: 1, sessionBus: true };
      else out = { ok: false, code: 'bad-request', why: 'unknown op' };
      process.stdout.write(JSON.stringify(out) + '\\n');
    });`);
  const reqs = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const caught = async (fn) => { try { return { ok: true, v: await fn() }; } catch (e) { return { ok: false, e }; } };
  /** The door's checks, re-run by each control → the facts each leg reads. */
  async function doorChecks(ENG, sub) {
    fs.rmSync(log, { force: true });
    const W = world(ENG, sub, { helper });
    const r0 = await W.engine.openAgentBrowser(doorOf(), W.fA);
    W.engine.setShareMode(r0.handle, 'auto');
    const whole = await W.engine.snapshot(r0.handle, W.fA, {});
    const F = world(ENG, sub + '-fresh', { helper }); const rF = await F.engine.openAgentBrowser(doorOf(), F.fA);
    const noSnapFirst = await caught(() => F.engine.snapshot(rF.handle, F.fA, { under: '@e3' }));
    const sub1 = await caught(() => W.engine.snapshot(r0.handle, W.fA, { under: '@e3' }));
    const subReq = reqs().filter((q) => q.op === 'snapshot' && q.root).pop() || null;
    const old = await caught(() => W.engine.act(r0.handle, W.fA, { verb: 'text', ref: '@e3' }));   // the table's OLD ref (a subtree minted from @e1 would hold an @e3 too)
    const again = await W.engine.snapshot(r0.handle, W.fA, {});
    const tx = await caught(() => W.engine.act(r0.handle, W.fA, { verb: 'text', ref: '@e5' }));
    const txReq = reqs().filter((q) => q.op === 'act' && q.verb === 'text').pop() || null;
    const big = await caught(() => W.engine.act(r0.handle, W.fA, { verb: 'text', ref: '@e5', maxBytes: 999999 }));
    const bigReq = reqs().filter((q) => q.op === 'act' && q.verb === 'text').pop() || null;
    // r2 (THE MUST): the person takes the window over WHILE the helper reads — placed inside the helper's wait
    for (const f of ['text-started', 'text-go']) fs.rmSync(path.join(dir, f), { force: true });
    await W.engine.snapshot(r0.handle, W.fA, {});
    const slow = caught(() => W.engine.act(r0.handle, W.fA, { verb: 'text', ref: '@e5', maxBytes: 4242 }));
    let settled = false; slow.then(() => { settled = true; });   // refused before the helper ran ⇒ the leg ends red by name, never hangs
    while (!settled && !fs.existsSync(path.join(dir, 'text-started'))) await new Promise((res) => setTimeout(res, 5));
    const tk = W.engine.takeover({ handle: r0.handle, viewerId: 'viewer-b4be3', holderAlive: true });
    fs.writeFileSync(path.join(dir, 'text-go'), '1');
    const during = await slow;
    W.engine.handback?.({ handle: r0.handle, viewerId: 'viewer-b4be3' });
    const audit = fs.readFileSync(path.join(W.dir, 'data', ENGINE.AUDIT_FILE), 'utf8');
    // r2 (a small): `auto` resolved to PIXELS (the whole window's tree closed) while the lease still holds refs ⇒ --under refused too
    fs.writeFileSync(path.join(dir, 'closed-tree'), '1');
    const closedWhole = await caught(() => W.engine.snapshot(r0.handle, W.fA, {}));
    const underPx = await caught(() => W.engine.snapshot(r0.handle, W.fA, { under: '@e3' }));
    fs.rmSync(path.join(dir, 'closed-tree'), { force: true });
    W.engine.setShareMode(r0.handle, 'pixels');
    const px = await caught(() => W.engine.act(r0.handle, W.fA, { verb: 'text', ref: '@e5' }));
    return { W, whole, noSnapFirst, sub1, subReq, old, again, tx, txReq, big, bigReq, audit, px, tk, during, closedWhole, underPx };
  }
  const D = await doorChecks(ENGINE, 'b4be3-real');
  const s1 = D.sub1.ok ? D.sub1.v : null;
  ok(D.whole.nodes.length === 5 && !D.whole.subtree, 'SETUP: the whole window\'s snapshot (5 nodes, refs @e1–@e5, no subtree line)', D.whole.nodes.map((n) => n.ref));
  ok(!D.noSnapFirst.ok && D.noSnapFirst.e.code === 'ref_unknown', 'a subtree before any snapshot is refused ref_unknown by name (the refs it is named by do not exist yet)', D.noSnapFirst.e && D.noSnapFirst.e.code);
  ok(!!(D.subReq && D.subReq.root && D.subReq.root.pid === 4242 && J(D.subReq.root.path) === '[0,0]' && D.subReq.root.expect.role === 'table' && D.subReq.root.expect.name === 'Expenses'), 'THE SUBTREE: the helper is handed the ref\'s node — its pid, path, role and name (the same budget, spent below it)', D.subReq && D.subReq.root);
  ok(!!(s1 && s1.subtree && s1.subtree.of === '@e3' && /REPLACE the last snapshot's — every older ref is gone/.test(s1.subtree.note) && /`vibespace-window snapshot da-1` reads the whole window again/.test(s1.subtree.note)), 'THE SUBTREE\'S ANSWER says its refs REPLACE the last snapshot\'s, every older ref is gone, and the one-line road back to the whole window', s1 && s1.subtree);
  ok(!!(s1 && s1.nodes.map((n) => n.ref).join() === '@e6,@e7,@e8,@e9' && s1.subtree.refs === '@e6–@e9'), 'its refs are numbered ABOVE the last table\'s (@e6–@e9), so no older ref can name one of its nodes', s1 && s1.nodes.map((n) => n.ref));
  ok(!D.old.ok && D.old.e.code === 'ref_unknown', 'an OLDER ref (@e3) after a subtree read is gone: refused ref_unknown by name — never a different node', D.old.ok ? D.old.v : D.old.e.code);
  ok(D.sub1.ok, 'THE AUTO MODE IS NOT RE-PROBED by a subtree read (its cells have nothing to act on; the whole window resolved to tree)', D.sub1.ok ? null : D.sub1.e.code);
  ok(D.tx.ok && D.txReq && D.txReq.maxBytes === 65536 && D.tx.v.did.cut === true && D.tx.v.did.bytes === 65536 && D.tx.v.did.chars > 65536, 'THE WHOLE TEXT: one node\'s text through the act door, 64 KiB by default, the cut SAID (bytes, of how many characters)', D.txReq && { maxBytes: D.txReq.maxBytes, did: D.tx.ok && { bytes: D.tx.v.did.bytes, chars: D.tx.v.did.chars, cut: D.tx.v.did.cut } });
  ok(D.big.ok && D.bigReq && D.bigReq.maxBytes === 262144, 'an asked bound past the cap is held to 256 KiB', D.bigReq && D.bigReq.maxBytes);
  ok(!/q{50}/.test(D.audit) && /"verb":"text"[^\n]*"bytes":65536[^\n]*"cut":true/.test(D.audit), 'the audit names the node and the bytes, NEVER the text', D.audit.split('\n').filter((l) => l.includes('"text"')).slice(-1)[0]);
  ok(!D.px.ok && D.px.e.code === 'mode_pixels', 'a pixel share refuses the whole-text read by name (a tree read, the same door as snapshot)', D.px.ok ? 'read' : D.px.e.code);
  ok(D.tk && D.tk.ok !== false && !D.during.ok && D.during.e.code === 'window_paused' && !J(D.during.e).includes('the-whole-field-value') && /"verb":"text"[^\n]*"code":"window_paused"[^\n]*"dropped":true/.test(D.audit), 'r2 THE MUST: the person takes the window over WHILE the helper reads — the text is DROPPED, refused window_paused by name, the audit says dropped (the same re-check after the await as the snapshot\'s)', D.during.ok ? D.during.v.did : { code: D.during.e.code });
  ok(!D.closedWhole.ok && D.closedWhole.e.code === 'mode_pixels' && !D.underPx.ok && D.underPx.e.code === 'mode_pixels', 'r2: once `auto` resolved to pixels, --under over refs that survived is refused mode_pixels too (as text is)', { whole: D.closedWhole.ok || D.closedWhole.e.code, under: D.underPx.ok || D.underPx.e.code });
  ok(/\(verb === 'click' \|\| verb === 'type' \|\| verb === 'text'\) && body\.ref\) refuse\('mode_pixels'/.test(read('src/server/desktop-handover-engine.js')), 'r2: a machine\'s desktop refuses `text @ref` mode_pixels by name, as click / type with a ref (source pin)');
  // CONTROLS (RED): refs minted from @e1 again (no base) — an older ref silently names a subtree node; the subtree re-probing
  // the auto mode — a page's table refused mode_pixels; the audit carrying the text
  const esrc = read(ENGINE_REL);
  const mutEng = (tag, from, to) => { assert1(esrc.includes(from), `B-4be3 control ${tag} planted`); return MUT.load(ENGINE_REL, esrc.replace(from, to), tag); };
  { const D2 = await doorChecks(mutEng('b4be3-nobase', "...(root ? { root, refBase } : {})", "...(root ? { root } : {})"), 'b4be3-nobase'); ok(D2.old.ok && D2.old.v.did.name === 'row 2', 'CONTROL (refs from @e1 again): the older ref @e3 silently reads a node of the subtree (row 2, not the table) — the leg above can fail', D2.old.ok ? D2.old.v.did : D2.old.e.code); }
  { const D3 = await doorChecks(mutEng('b4be3-reprobe', "if (!root && rec.origin !== 'desktop' && reachRecord(rec.id).mode === 'auto') {", "if (rec.origin !== 'desktop' && reachRecord(rec.id).mode === 'auto') {"), 'b4be3-reprobe'); ok(!D3.sub1.ok && D3.sub1.e.code === 'mode_pixels', 'CONTROL (the subtree re-probes the auto mode): a table of cells is refused mode_pixels', D3.sub1.ok ? 'read' : D3.sub1.e.code); }   // stale-pins: kept (the control puts the old text back)
  { const D5 = await doorChecks(mutEng('b4be3-norecheck', "      if (r.ok) { try { stillHeld(rec, facts, 'text'); } catch (err) {", "      if (false) { try { stillHeld(rec, facts, 'text'); } catch (err) {"), 'b4be3-norecheck'); ok(D5.during.ok && D5.during.v.did.text === 'the-whole-field-value', 'CONTROL (no re-check after the await): the text reaches the conversation that lost the window — the leg above can fail', D5.during.ok ? 'handed' : D5.during.e.code); }
  { const D6 = await doorChecks(mutEng('b4be3-underpx', "      if (res0 && res0.mode === 'pixels') {", "      if (false) {"), 'b4be3-underpx'); ok(D6.underPx.ok, 'CONTROL (no pixel check for --under): the subtree reads the tree under a pixel resolution — the leg above can fail', D6.underPx.ok ? 'read' : D6.underPx.e.code); }
  { const D4 = await doorChecks(mutEng('b4be3-audit', "...(r.ok && r.did ? { bytes: r.did.bytes, cut: !!r.did.cut } : {})", "...(r.ok && r.did ? { bytes: r.did.bytes, cut: !!r.did.cut, text: r.did.text } : {})"), 'b4be3-audit'); ok(/q{50}/.test(D4.audit), 'CONTROL (the audit carries the text): the text is in the audit file — the leg above can fail'); }
  { const Rm = MUT.load('src/window-reach.js', read('src/window-reach.js').replace("const TREE_VERBS = Object.freeze(['snapshot', 'text']);", "const TREE_VERBS = Object.freeze(['snapshot']);"), 'b4be3-reach');   // stale-pins: kept (the control puts the old text back)
    const real = require(path.join(REPO, 'src/window-reach.js')).verbGate({ mode: 'pixels', verb: 'text', hasRef: true }), mut = Rm.verbGate({ mode: 'pixels', verb: 'text', hasRef: true });
    ok(!real.ok && real.code === 'mode_pixels' && mut.ok, 'CONTROL (text not a tree verb in the mode table): a pixel share lets the tree read through — the mode table is what refuses it', { real, mut }); }
  // (B) THE REAL HELPER (python) against a stand-in `gi` — the walk from a root path, the byte bound, the hidden-text rule.
  const py = spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf8' });
  ok(py.status === 0, 'SETUP: python3 runs here (the helper is python)', py.error ? String(py.error) : py.stderr);
  const giDir = path.join(dir, 'gi-standin'), repoDir = path.join(giDir, 'gi', 'repository');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(giDir, 'gi', '__init__.py'), 'def require_version(*a, **k):\n    return None\n');
  fs.writeFileSync(path.join(repoDir, '__init__.py'), 'from . import Atspi\n');
  fs.writeFileSync(path.join(repoDir, 'Atspi.py'), [
    'import json, os',
    'TREE = json.load(open(os.environ["VS_FAKE_ATSPI_TREE"]))',
    'class CoordType:', '    SCREEN = 0',
    'def set_timeout(a, b):', '    return None',
    'class _Acc:',
    '    def __init__(self, d): self.d = d',
    '    def get_name(self): return self.d.get("name", "")',
    '    def get_role_name(self):',
    '        if self.d.get("role") == "__raise__": raise RuntimeError("no answer within the call timeout")',
    '        return self.d.get("role", "unknown")',
    '    def get_interfaces(self): return list(self.d.get("ifaces", []))',
    '    def get_child_count(self): return len(self.d.get("children", []))',
    '    def get_child_at_index(self, i): return _Acc(self.d["children"][i])',
    '    def get_process_id(self): return self.d.get("pid")',
    '    def get_text_iface(self): return self if "Text" in self.d.get("ifaces", []) else None',
    '    def get_action_iface(self): return self if "Action" in self.d.get("ifaces", []) else None',
    'class Action:',
    '    @staticmethod',
    '    def get_n_actions(a): return len(a.d.get("actions", []))',
    '    @staticmethod',
    '    def get_action_name(a, i): return a.d["actions"][i]',
    '    @staticmethod',
    '    def do_action(a, i): return True',
    'class Text:',
    '    @staticmethod',
    '    def get_character_count(t): return len(t.d.get("text", ""))',
    '    @staticmethod',
    '    def get_text(t, a, b): return t.d.get("text", "")[a:b]',
    'def get_desktop(i):',
    '    import time',
    '    time.sleep(float(os.environ.get("VS_FAKE_ATSPI_SLOW_S", "0")))   # fb-4d25432476: a busy machine — the walk meets its deadline',
    '    return _Acc({"children": TREE["apps"]})',
  ].join('\n') + '\n');
  const SECRET = ['hun', 'ter', '2-', 'not-a-real-one'].join('');   // invented; built so no literal reads as a credential
  const LONG = 'https://example.test/report?id=1&' + 'é'.repeat(40000);   // 2 bytes a character past the prefix
  const LONGNAME = 'Receipt ' + 'x'.repeat(242);   // 250 characters: a snapshot keeps 200
  const tree = { apps: [{ pid: 4242, name: 'Chromium', role: 'application', children: [
    { role: 'frame', name: 'Reimbursements', children: [
      { role: 'table', name: 'Expenses', children: [1, 2, 3, 4, 5].map((i) => ({ role: 'table row', name: 'row ' + i, children: [{ role: 'table cell', name: 'cell ' + i, ifaces: ['Text'], text: 'amount ' + i }] })) },
      { role: 'entry', name: 'Address and search bar', ifaces: ['Text', 'EditableText'], text: LONG },
      { role: 'password text', name: 'Password', ifaces: ['Text', 'EditableText'], text: SECRET },
      // r2: a link whose name is its 250-character content (past the 200 a snapshot keeps), and a node whose role does not answer
      { role: 'link', name: LONGNAME, ifaces: ['Action', 'Text'], actions: ['jump'], text: 'see the receipt' },
      { role: '__raise__', name: 'unreadable role', ifaces: ['Text'], text: 'what a hidden field could hold' },
      { role: 'panel', name: LONGNAME, children: [{ role: 'label', name: 'inside' }] },
    ] }] }] };
  const treeFile = path.join(dir, 'tree.json'); fs.writeFileSync(treeFile, J(tree));
  const runPy = (helperFile, req0) => { const { _env = {}, ...req } = req0; const r = spawnSync('python3', ['-I', helperFile], { input: J(req), encoding: 'utf8', env: { PATH: process.env.PATH, PYTHONPATH: giDir, VS_FAKE_ATSPI_TREE: treeFile, ..._env } }); try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { ok: false, code: 'unparsed', why: (r.stdout || '') + (r.stderr || '') }; } };
  // the -I flag drops PYTHONPATH, so the stand-in rides a copy of the helper beside a path insert (the helper itself unchanged)
  const asRun = (src, tag) => { const f = path.join(dir, `helper-${tag}.py`); fs.writeFileSync(f, `import sys\nsys.path.insert(0, ${J(giDir)})\n` + src); return f; };
  const HSRC = read('src/window-targets-helper.py');
  /** The helper's checks; a control re-runs only the ones it names (each is one python run). */
  const helperChecks = (src, tag, only = null) => {
    const f = asRun(src, tag);
    const cut = LONGNAME.slice(0, 200);   // r2: the ref carries the name AS THE SNAPSHOT KEPT IT (200 characters)
    const asks = {
      whole: { op: 'snapshot', pids: [4242], budget: 600 },
      sub: { op: 'snapshot', pids: [4242], budget: 4, root: { pid: 4242, path: [0, 0], expect: { role: 'table', name: 'Expenses' } } },
      stale: { op: 'snapshot', pids: [4242], budget: 600, root: { pid: 4242, path: [0, 0], expect: { role: 'table', name: 'Invoices' } } },
      tx: { op: 'act', pid: 4242, path: [0, 1], expect: { role: 'entry', name: 'Address and search bar' }, verb: 'text', maxBytes: 1000 },
      hid: { op: 'act', pid: 4242, path: [0, 2], expect: { role: 'password text', name: 'Password' }, verb: 'text', maxBytes: 1000 },
      rd: { op: 'act', pid: 4242, path: [0, 2], expect: { role: 'password text', name: 'Password' }, verb: 'read' },
      // r2: an act, the text verb and a subtree root on the long-named nodes; the node whose role does not answer
      press: { op: 'act', pid: 4242, path: [0, 3], expect: { role: 'link', name: cut }, verb: 'do_action', action: 'jump' },
      longTx: { op: 'act', pid: 4242, path: [0, 3], expect: { role: 'link', name: cut }, verb: 'text', maxBytes: 1000 },
      longSub: { op: 'snapshot', pids: [4242], budget: 600, root: { pid: 4242, path: [0, 5], expect: { role: 'panel', name: cut } } },
      urTx: { op: 'act', pid: 4242, path: [0, 4], expect: { role: 'unknown', name: 'unreadable role' }, verb: 'text', maxBytes: 1000 },
      urRd: { op: 'act', pid: 4242, path: [0, 4], expect: { role: 'unknown', name: 'unreadable role' }, verb: 'read' },
      // fb-4d25432476: a snapshot cut by the NODE BUDGET, and one cut by the TRAVERSAL DEADLINE (the machine slow past a 1 ms wall)
      bud: { op: 'snapshot', pids: [4242], budget: 3 },
      dl: { op: 'snapshot', pids: [4242], budget: 600, wallMs: 1, _env: { VS_FAKE_ATSPI_SLOW_S: '0.05' } },
    };
    const out = {};
    for (const k of only || Object.keys(asks)) out[k] = runPy(f, asks[k]);
    return out;
  };
  const P = helperChecks(HSRC, 'real');
  const pw = (P.whole.nodes || []).find((n) => n.role === 'password text');
  ok(P.whole.ok && (P.whole.nodes || []).length === 19, 'SETUP: the real helper walks the stand-in tree (19 nodes)', P.whole.ok ? P.whole.nodes.length : P.whole);
  ok(P.sub.ok && P.sub.nodes.length === 4 && J(P.sub.nodes.map((n) => n.path)) === '[[0,0],[0,0,0],[0,0,1],[0,0,2]]' && P.sub.truncated === true && P.sub.root && P.sub.root.role === 'table', 'THE HELPER\'S SUBTREE: the walk starts at the root path, paths stay ABSOLUTE (an act re-resolves them), the budget (4) is spent below that node and the truncation said', P.sub.ok ? P.sub.nodes.map((n) => n.path) : P.sub);
  ok(!P.stale.ok && P.stale.code === 'ref_stale', 'a subtree whose node at that path is no longer the one named is refused ref_stale (as an act is)', P.stale);
  const enc = (P.tx.ok && P.tx.did.text) ? Buffer.byteLength(P.tx.did.text) : -1;
  ok(P.tx.ok && P.tx.did.cut === true && P.tx.did.bytes === enc && enc <= 1000 && enc >= 998 && P.tx.did.chars === LONG.length && P.tx.did.text.startsWith('https://example.test/report?id=1&'), 'THE HELPER\'S WHOLE TEXT: bounded by BYTES (1000 asked; a 2-byte character never split), the characters there were said, the cut said', P.tx.ok ? { bytes: P.tx.did.bytes, chars: P.tx.did.chars, cut: P.tx.did.cut } : P.tx);
  ok(!!pw && pw.textHidden === true && pw.text === undefined && !J(P.whole).includes(SECRET), 'THE HIDDEN-TEXT RULE (ALSO CURED): a password field (the tree\'s hidden-text role) carries NO text in the snapshot, said by textHidden', pw);
  ok(!P.hid.ok && P.hid.code === 'text_hidden' && !J(P.hid).includes(SECRET), '…and the whole-text verb refuses it by name, text_hidden — the value never leaves the helper', P.hid);
  ok(P.rd.ok && P.rd.did.text === null && !J(P.rd).includes(SECRET), '…and the helper\'s read verb answers no text for it either', P.rd);
  const lk = (P.whole.nodes || []).find((n) => n.role === 'link'), ur = (P.whole.nodes || []).find((n) => n.name === 'unreadable role');
  ok(!!lk && lk.name.length === 200, 'SETUP r2: the snapshot keeps 200 characters of the 250-character name', lk && lk.name.length);
  ok(P.press.ok && P.press.did.action === 'jump', 'r2 THE MUST — ALSO CURED ON THE RELEASE\'S ACT: a press on the long-named node (its ref carrying the cut name) is THAT node, never ref_stale for ever', P.press);
  ok(P.longTx.ok && P.longTx.did.nameChars === 250 && P.longTx.did.name.length === 250, 'r2: the whole-text verb on it answers — with its WHOLE name (250 characters)', P.longTx.ok ? P.longTx.did.nameChars : P.longTx);
  ok(P.longSub.ok && P.longSub.root && P.longSub.root.name.length === 200 && P.longSub.nodes.length === 2, 'r2: a subtree rooted at a long-named node is read (its root named as the snapshot names it)', P.longSub.ok ? P.longSub.nodes.length : P.longSub);
  ok(!!ur && ur.role === 'unknown' && ur.text === undefined, 'r2: a node whose role did not answer carries no text in the snapshot (it may be a hidden field: fail closed)', ur);
  ok(!P.urTx.ok && P.urTx.code === 'text_hidden' && P.urRd.ok && P.urRd.did.text === null && !J([P.urTx, P.urRd]).includes('hidden field could hold'), '…and the text verb refuses it text_hidden, the read verb answers no text (the act fails closed the same way)', { text: P.urTx.code || 'read', read: P.urRd.ok && P.urRd.did.text });
  // CONTROLS (RED), each a copy of the helper with ONE edit
  // fb-4d25432476 (主开发 r2243): THE SUMMARY NAMES THE BOUND THAT CUT IT — the helper says which (`truncatedBy`), the ONE sentence
  // (src/window-targets.js truncationSays) words it, the engine hands it on, the CLI prints it
  ok(P.bud.ok && P.bud.truncated === true && J(P.bud.truncatedBy) === J(['budget']) && P.dl.ok && P.dl.truncated === true && J(P.dl.truncatedBy) === J(['deadline']) && P.dl.wallMs === 1 && (P.dl.unreadable || []).some((u) => u.why === 'traversal deadline') && P.whole.truncated === false && J(P.whole.truncatedBy) === '[]',
    'fb-4d25432476: the helper says WHICH bound cut a snapshot — the node budget (3 nodes) or the traversal deadline (a busy machine past its wall), and nothing when nothing cut it', { bud: P.bud.truncatedBy, dl: P.dl.truncatedBy, whole: P.whole.truncatedBy });
  { const WTm = require(path.join(REPO, 'src/window-targets.js')), says = (x) => WTm.truncationSays(x);
    const dlS = says(P.dl), budS = says(P.bud), both = says({ truncated: true, truncatedBy: ['budget', 'deadline'], budget: 600, wallMs: 20000 }), old = says({ truncated: true, budget: 600 });
    ok(/^TRUNCATED at the traversal deadline \(0 s: the machine answered slowly — read one part at a time with --under @ref\)$/.test(dlS) && !/budget/.test(dlS) && budS === 'TRUNCATED at the 3-node budget — --budget N up to 3000' && /traversal deadline \(20 s/.test(both) && /600-node budget/.test(both) && old === 'TRUNCATED at the 600-node budget — --budget N up to 3000' && says({ truncated: false }) === null
      && read('src/server/window-targets-engine.js').split('truncatedSays: WT.truncationSays(s)').length === 2 && read('data/bin/vibespace-window').split('${r.truncatedSays || `TRUNCATED at the ${r.budget}-node budget').length === 2,
      'fb-4d25432476: the summary says «TRUNCATED at the traversal deadline (N s: the machine answered slowly — read one part at a time with --under @ref)» when the deadline cut it and «at the N-node budget» when the budget did (both when both; an older helper\'s reply, naming no cause, keeps the budget\'s words); the engine hands the sentence on and the CLI prints it', { dlS, budS, both, old }); }
  const plantH = (from, to, tag, only) => { assert1(HSRC.includes(from), `B-4be3 helper control ${tag} planted`); return helperChecks(HSRC.replace(from, to), tag, only); };
  { const C = plantH('    queue = [(app, list(base_path or []), 0, None)]', '    queue = [(app, [], 0, None)]', 'relpath', ['sub']); ok(C.sub.ok && J(C.sub.nodes.map((n) => n.path)) !== '[[0,0],[0,0,0],[0,0,1],[0,0,2]]', 'CONTROL (paths relative to the subtree): an act would re-resolve the wrong node — the leg above can fail', C.sub.ok && C.sub.nodes.map((n) => n.path)); }   // stale-pins: kept (the control puts the old text back)
  { const C = plantH('            return b[:cap].decode("utf-8", "ignore"), True', '            return s, True', 'nobound', ['tx']); ok(C.tx.ok && Buffer.byteLength(C.tx.did.text) > 1000, 'CONTROL (the bound not applied): the whole value comes back past the asked bytes'); }
  { const C = plantH('    return expect.get("name") is None or expect["name"] == (name or "")[:NAME_CUT]', '    return expect.get("name") is None or expect["name"] == (name or "")', 'wholename', ['press', 'longTx', 'longSub']); ok(!C.press.ok && C.press.code === 'ref_stale' && !C.longTx.ok && C.longTx.code === 'ref_stale' && !C.longSub.ok && C.longSub.code === 'ref_stale', 'CONTROL (the cut name compared with the WHOLE live name — the release\'s act): the press, the text and the subtree are ref_stale for ever', { press: C.press.code, text: C.longTx.code, sub: C.longSub.code }); }
  { const C = plantH('            if role_raw is None:\n                pass', '            if False:\n                pass', 'roleopen', ['whole']); const u2 = (C.whole.nodes || []).find((n) => n.name === 'unreadable role'); ok(!!u2 && u2.text === 'what a hidden field could hold', 'CONTROL (a role that did not answer read anyway): its text is handed out', u2); }
  { const C = plantH('    hidden = role_raw is None or text_hidden(role)', '    hidden = text_hidden(role)', 'actopen', ['urTx', 'urRd']); ok(C.urTx.ok && C.urRd.ok && C.urRd.did.text === 'what a hidden field could hold', 'CONTROL (the act reads a role that did not answer): the text and read verbs hand its text out', { text: C.urTx.ok ? 'read' : C.urTx.code }); }
  { const C = plantH('        if not same_node(expect, rrole, rname):', '        if False:', 'nostale', ['stale']); ok(C.stale.ok, 'CONTROL (no root check): a subtree whose node moved is read as if it were the one named — the ref_stale leg can fail', C.stale.ok ? 'read' : C.stale.code); }
  { const C = plantH('            cut.add("deadline")\n', '            cut.add("budget")\n', 'deadline-as-budget', ['dl']); ok(C.dl.ok && C.dl.truncated === true && J(C.dl.truncatedBy) === J(['budget']), 'CONTROL (the deadline\'s cut said as the budget\'s, in a copy — the release\'s summary): a busy machine\'s snapshot is told it hit the node budget — the leg above is red on it', C.dl.truncatedBy); }
  { const C = plantH('HIDDEN_TEXT_ROLES = ("password text",)', 'HIDDEN_TEXT_ROLES = ()', 'nohide', ['whole', 'hid', 'rd']); ok(J(C.whole).includes(SECRET) && C.hid.ok && J(C.hid).includes(SECRET) && J(C.rd).includes(SECRET), 'CONTROL (no hidden-text rule — r1179\'s find): the snapshot, the text verb AND the read verb hand the password field\'s value out'); }
}

// ── B-574d «browser-stores» 5/8 (lane nl-migrations, 主开发 r5101): THE WINDOW STORES ON THE STORE WRITER — an agent's act (the open,
// the attach) is handed, never awaited: in memory at once, on disk once landed; a PERSON's share act (the mode) answers AFTER its
// window-reach.json landed, and a landing that fails is the act's REFUSAL (not_saved). RED (anchored copy): the share act answered
// without waiting for its landing — the refused landing answered as saved
console.log('B-574d browser-stores 5/8: the window stores on the store writer');
{
  const shareScene = async (ENGm, sub) => {
    const { W } = await engineChecks(ENGm, sub);
    const reachFile = W.engine.reachFile, leaseNow = !!W.engine.leaseOf('da-1');
    W.engine.storesLanded();
    const out = await W.engine.shareAct(() => W.engine.setShareMode('da-1', 'pixels'));
    let disk = null; try { disk = JSON.parse(fs.readFileSync(reachFile, 'utf8')).windows['da-1'].mode; } catch { disk = null; }   // read right after the answer: landed
    fs.rmSync(reachFile, { force: true }); fs.mkdirSync(reachFile);   // the file's name taken by a folder: its next landing fails
    let refused = null; try { await W.engine.shareAct(() => W.engine.setShareMode('da-1', 'tree')); } catch (e) { refused = (e && e.code) || 'threw'; }
    fs.rmSync(reachFile, { recursive: true, force: true });   // the writer retries over the freed name
    return { leaseNow, mode: out && out.mode, disk, refused };
  };
  const S5 = await shareScene(ENGINE, 'bs5-real');
  ok(S5.leaseNow && S5.mode === 'pixels' && S5.disk === 'pixels' && S5.refused === 'not_saved',
    'B-574d browser-stores 5/8: an agent\'s open and attach are handed (the lease in memory at once); a person\'s share act answers AFTER its landing (the file holds the mode when the answer comes), and a landing that FAILS is the act\'s refusal (not_saved)', S5);
  const src5 = read(ENGINE_REL), WAITS = "    if ((await landingOf(reachFile)) !== true) {";
  const S5x = await shareScene(MUT.load(ENGINE_REL, editAnchor(src5, WAITS, '    if (false) {', ENGINE_REL), 'bs5-unwaited'), 'bs5-red');
  ok(S5x.refused === null, 'RED (anchored copy: the share act answered without waiting for its landing): the refused landing is answered as saved — 5/8 goes red', S5x);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
