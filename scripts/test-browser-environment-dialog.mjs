#!/usr/bin/env node
// B-9584 U3 — A PROFILE's ENVIRONMENT, SET BY THE PERSON (lane cli-update-needs-nothing; 主开发 r2311 / r2497 / r2595): the keeper's ONE
// door (setEnvironment) and its person-only route, before any page makes the place's road reachable. Stand-ins only: a scratch data
// folder, no browser launched, no address called, made-up places.
//   ① THE DOOR (src/server/browser-keeper.js setEnvironment): a place with its sites kept canonical; the same save again changes
//      nothing; a running browser takes it at its next start (restartNeeded); every refusal by its own name — the verdict's, sites
//      beside anything but a place, a place or «blocked» on a paired machine's profile (r2172 (a): where it is set), sites on an
//      engine's profile (r2311); all «this machine's» keeps nothing. RED: the door without the paired refusal.
//   ② THE ROUTE (src/routes/browser.js): a person's cookie door only — the agent's token refused before anything; its status table.
//   ③ THE FORM (src/lib/browser-environment-form.js, PURE): a kept environment round-trips through the fields; «this machine's» or
//      «Blocked» drops the list of sites (r2497 (5)); the page's own check is U1's verdict; «Automatic» said from the kept exit.
//   ④ THE WORDS (src/lib/browser-environment-words.js): every code the verdict and the door can answer has the page's sentence.
//   ⑥ r2767 MUST — AN AGENT's VIEW OF A PROFILE IS MADE FROM WHAT AN AGENT MAY SEE: a record carrying every field the code writes goes
//      through the view; every key out is a ROW of AGENT_VIEW_ROWS with its reason; the place and its sites never out. REDs: the view
//      as the record spread (the place handed back), a planted field passed with no row. r2932: (1) the two resolve answers that built
//      their own shape (a conversation's own browser, a helper's) hand the agent's view — BY A REQUEST, RED on a router copy that sends
//      the public view; (2) ONE LEVEL DOWN — an object row by its named sub-fields, RED on a view that passes it whole; (3) the
//      harvest's own rule printed.
//   ⑧ r2911 / r2916 THE OWNER's DECISION ON THE PLACE HOLE: the kernel's probe field (geolocationIsolated, top-level true only) read by
//      the verdict and copied by the engines view (two REDs); the dialog's one sentence under the location (PURE model + words, zh/ja).
//   ⑦ r2767 (a): ONE PLAN WHILE A BROWSER RUNS — after a save place → this machine's while it runs, the gates still judge a place;
//      r2932 (5) the other direction: started with nothing set, a place saved while it runs is judged by the SAVED place (stricter).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const J = JSON.stringify;
const ROOT = scratch('envdialog');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
const K = require('../src/server/browser-keeper.js');
const quiet = { log() { }, warn() { }, error() { } };
let nK = 0;
const mkK = (mod = K) => { const dataDir = path.join(ROOT, `data-${++nK}`); fs.mkdirSync(dataDir, { recursive: true }); return mod.create({ dataDir, homeDir: HOME, env: () => ({ PATH: '/usr/bin:/bin', HOME }), serverSetting: () => undefined, install: false, tickMs: 3600e3, log: quiet, hostKnown: () => false }); };
const recOf = (k, id) => k._reg().profiles.find((x) => x && x.id === id);
const PLACE = { mode: 'value', value: { latitude: 12.5, longitude: 45.25 } };   // a round made-up pair (no person's, no city's)

console.log('— ① the door: the person\'s save, judged whole, kept canonical; every refusal by its own name');
{
  const k = mkK();
  const p = k.createProfile({ label: 'Env' });
  const r1 = await k.setEnvironment(p.id, { environment: { timezone: { mode: 'value', value: 'Europe/Paris' }, location: { ...PLACE, sites: ['https://B.example/x', 'https://a.example', 'https://b.example/'] } } });
  const kept = recOf(k, p.id).environment;
  ok(r1.ok && r1.changed === true && r1.restartNeeded === false && J(kept.location.sites) === J(['https://a.example', 'https://b.example']) && kept.location.mode === 'value' && kept.timezone.value === 'Europe/Paris'
    && !!r1.profile && J(r1.profile.environment) === J(kept), '① a place with its sites: kept canonical (the sites exact origins, sorted, once each), the answer carries the profile, nothing to restart (no browser runs)', { r1, kept });
  const r2 = await k.setEnvironment(p.id, { environment: kept });
  ok(r2.ok && r2.changed === false && r2.restartNeeded === false, '① the same save again changes nothing', r2);
  k._reg().browsers[p.id] = { profileId: p.id, state: 'ready' };   // a running browser (its record only — nothing is launched here)
  const r3 = await k.setEnvironment(p.id, { environment: { ...kept, language: { mode: 'value', value: 'fr-FR' } } });
  ok(r3.ok && r3.changed === true && r3.restartNeeded === true, '① a running browser takes the change at its NEXT start: restartNeeded (decision 5a — the dialog offers the restart)', r3);
  delete k._reg().browsers[p.id];
  const before = J(recOf(k, p.id).environment);
  const bad = await k.setEnvironment(p.id, { environment: { location: { mode: 'value', value: { latitude: 95, longitude: 0 } } } });
  const unoffered = await k.setEnvironment(p.id, { environment: { location: { mode: 'machine', sites: ['https://a.example'] } } });
  const blockSites = await k.setEnvironment(p.id, { environment: { location: { mode: 'block', sites: ['https://a.example'] } } });
  const missing = await k.setEnvironment(p.id, {}), unknown = await k.setEnvironment('bp-0000dead', { environment: null });
  ok(!bad.ok && /^env_/.test(String(bad.code)) && !unoffered.ok && unoffered.code === 'env_sites_unoffered' && !blockSites.ok && blockSites.code === 'env_sites_unoffered'
    && !missing.ok && missing.code === 'env_invalid' && !unknown.ok && unknown.code === 'not-found' && J(recOf(k, p.id).environment) === before,
    '① refused by name, nothing written: a place out of range (the verdict\'s own code), sites beside «this machine\'s» or «blocked», no environment, no profile', { bad, unoffered, blockSites, missing, unknown });
  const pa = k.createProfile({ label: 'Paired' }); recOf(k, pa.id).host = 'paired-stand-in';
  const paPlace = await k.setEnvironment(pa.id, { environment: { location: PLACE } }), paBlock = await k.setEnvironment(pa.id, { environment: { location: { mode: 'block' } } });
  const paTz = await k.setEnvironment(pa.id, { environment: { timezone: { mode: 'value', value: 'Europe/Paris' } } });
  ok(!paPlace.ok && paPlace.code === 'browser_place_unsupported' && /a paired machine/.test(paPlace.error) && !/12\.5|45\.25/.test(J(paPlace)) && !paBlock.ok && paBlock.code === 'browser_place_unsupported' && paTz.ok && paTz.changed,
    '① r2172 (a) WHERE IT IS SET: a place or «blocked» on a paired machine\'s profile refused by name (no value in the words) — its time zone is kept', { paPlace, paBlock, paTz });
  const pe = k.createProfile({ label: 'Engine' }); recOf(k, pe.id).browser = { kind: 'plugin', pluginId: 'stand-in', engine: 'stand-in' };
  const peSites = await k.setEnvironment(pe.id, { environment: { location: { ...PLACE, sites: ['https://a.example'] } } }), pePlace = await k.setEnvironment(pe.id, { environment: { location: PLACE } });
  ok(!peSites.ok && peSites.code === 'env_sites_engine' && pePlace.ok, '① r2311: sites on an ENGINE\'s profile refused by name (its kernel gives the place to every site) — the place alone is kept', { peSites, pePlace });
  const cleared = await k.setEnvironment(p.id, { environment: { timezone: { mode: 'machine' }, location: null } });
  ok(cleared.ok && cleared.changed && !('environment' in recOf(k, p.id)), '① all «this machine\'s»: nothing kept (the key gone)', cleared);
  // RED — the door without the paired refusal: a paired machine's profile takes a place (its sites would read that machine's position)
  const MUT = mutantCopies('env-dialog', REPO);
  const src = read('src/server/browser-keeper.js');
  const A = "      if (g && !engine && (isEph(p) || p.host)) return { ok: false, code: 'browser_place_unsupported',";
  const Kn = MUT.load('src/server/browser-keeper.js', anchored(src, A, "      if (false) return { ok: false, code: 'browser_place_unsupported',", 'env door RED no paired refusal'), 'no-paired-refusal');   // anchored(): the line found ONCE, else it throws by name
  const kn = mkK(Kn), pn = kn.createProfile({ label: 'Paired' }); recOf(kn, pn.id).host = 'paired-stand-in';
  const rn = await kn.setEnvironment(pn.id, { environment: { location: PLACE } });
  ok(rn.ok === true, '① RED — the door without the paired refusal: a paired machine\'s profile takes a place', rn);
  for (const c of copiesCensus(MUT.files, MUT.dir, REPO, { label: '① controls: ' })) ok(c.pass, c.name, c.detail);
  k.shutdown?.(); kn.shutdown?.();
}

console.log('— ② the route: a person\'s cookie door only');
{
  const RB = read('src/routes/browser.js');
  ok(/router\.post\('\/api\/browser\/profiles\/:id\/environment', async \(req, res\) => \{\n  if \(refuseHost\(req, res\)\) return;\n  if \(refuseAgentBearer\(req, res, ENV_IS_USERS\)\) return;\n  const k = keeperOr503\(res\); if \(!k\) return;\n  if \(!ID_RE\.test\(req\.params\.id\)\) return/.test(RB),
    '② the route refuses an agent\'s token before anything (its host check first, then the bearer), then the keeper and the id');
  const table = (/const ENV_STATUS = Object\.freeze\(\{([^}]*)\}\)/.exec(RB) || [])[1] || '';
  ok(/browser_place_unsupported: 409/.test(table) && /env_sites_engine: 409/.test(table) && /env_sites_unoffered: 409/.test(table) && /'not-found': 404/.test(table) && /ENV_STATUS\[r\.code\] \|\| 400/.test(RB),
    '② its status table: the refusals of where it is set 409, no profile 404, the verdict\'s own codes 400', table);
  // r2767 (c): SHOWN BY A REQUEST — the real router on a loopback port, a stand-in keeper; a made-up sign-in of each kind (a
  // conversation's, a job's, an automation key's) gets the refusal by name and never reaches the keeper; the person's cookie door does
  const express = require('express'), RBm = require('../src/routes/browser.js'), calls = [];
  RBm.setup({ keeper: { setEnvironment: (id) => { calls.push(id); return { ok: true, changed: false, restartNeeded: false }; } } });
  const app = express(); app.use(express.json()); app.use(RBm.router);
  const srv = await new Promise((res) => { const sv = app.listen(0, '127.0.0.1', () => res(sv)); });
  const post = (auth) => fetch(`http://127.0.0.1:${srv.address().port}/api/browser/profiles/bp-000000e1/environment`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: J({ environment: null }) })
    .then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
  const asked = [];
  for (const kind of ['vsst_', 'jbt_', 'vsak_']) asked.push(await post(['Bearer ', kind, 'stand-in-0000'].join('')));   // made up at run time, never a token literal
  const person = await post(null);
  await new Promise((res) => srv.close(res));
  ok(asked.length === 3 && asked.every((x) => x.status === 403 && x.body && x.body.code === 'agent_forbidden') && person.status === 200 && J(calls) === J(['bp-000000e1']),
    '② r2767 (c) BY A REQUEST: a conversation\'s, a job\'s and an automation key\'s sign-in each get 403 agent_forbidden and never reach the keeper; the person\'s request does', { asked, person, calls });
}

console.log('— ③ the form: the fields round-trip, the list dropped beside «this machine\'s» or «Blocked», Automatic said from the kept exit');
{
  const F = await import(new URL('../src/lib/browser-environment-form.js', import.meta.url).href);
  const ENVm = require('../src/browser-environment.js');
  const kept = { timezone: { mode: 'value', value: 'Europe/Paris' }, language: { mode: 'auto' }, location: { mode: 'value', value: { latitude: 12.5, longitude: 45.25 }, sites: ['https://a.example', 'https://b.example'] } };
  const r = { id: 'bp-000000e1', label: 'Env', environment: kept };
  const f = F.fieldsOf(r), back = F.bodyOf(f), v = ENVm.environmentVerdict(back.environment);
  ok(f.timezone.mode === 'value' && f.language.mode === 'auto' && f.location.mode === 'value' && f.location.sites === 'https://a.example\nhttps://b.example' && v.ok && J(v.value.location.sites) === J(kept.location.sites)
    && v.value.timezone.value === 'Europe/Paris' && v.value.language.mode === 'auto' && !F.changedFrom(r, f), '③ a kept environment round-trips: fields from it, the body back, U1\'s verdict keeps the same; nothing changed', { f, back, v });
  const machine = F.bodyOf({ ...f, location: { ...f.location, mode: 'machine' } }), blocked = F.bodyOf({ ...f, location: { ...f.location, mode: 'block' } });
  ok(machine.environment.location === null && J(blocked.environment.location) === J({ mode: 'block' }) && F.changedFrom(r, { ...f, location: { ...f.location, mode: 'block' } }),
    '③ r2497 (5): location «this machine\'s» or «Blocked» DROPS the list of sites from the body (never a silent keep, never a refused save)', { machine, blocked });
  const badZone = F.checkOf({ ...f, timezone: { mode: 'value', value: 'Mars/Olympus' } }), badSite = F.checkOf({ ...f, location: { ...f.location, sites: '*.example.com' } });
  ok(!badZone.ok && badZone.code === 'env_timezone_invalid' && !badSite.ok && /^env_site/.test(badSite.code), '③ the page\'s own check is U1\'s verdict on the very body it would send (a zone it does not know, a wildcard site)', { badZone, badSite });
  ok(J(F.sitesOf(' https://a.example ,\n\nhttps://b.example\n')) === J(['https://a.example', 'https://b.example']) && F.SITES_LIMIT === ENVm.SITES_MAX, '③ one site a line (a comma too), blanks dropped; the limit is U1\'s');
  const withExit = { ...r, egress: { publicIp: '203.0.113.9', country: 'FR', timezone: 'Europe/Paris', checkedAt: 1, source: 'measured' } };
  const aE = F.autoSaidOf(withExit), aN = F.autoSaidOf(r);
  ok(aE.timezone.from === 'exit' && aE.timezone.value === 'Europe/Paris' && aE.language.from === 'exit' && !!aE.language.value && aN.timezone.value === null && aN.timezone.said === 'no_exit' && aN.language.value === null,
    '③ «Automatic» said RIGHT NOW from the kept exit (U1\'s resolver: its zone, its country\'s language); none kept ⇒ nothing to follow, said', { aE, aN });
}

console.log('— ④ the words: every code the verdict and the door can answer has the page\'s sentence');
{
  const Wd = await import(new URL('../src/lib/browser-environment-words.js', import.meta.url).href);
  const T = (k, v) => String(k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] !== undefined ? String(v[n]) : `{${n}}`));
  const ENVsrc = read('src/browser-environment.js'), KS = read('src/server/browser-keeper.js');
  const door = (() => { const i = KS.indexOf('  function setEnvironment(profileId'); const j = KS.indexOf('\n  }\n', i); return i < 0 ? '' : KS.slice(i, j); })();
  const codes = new Set([...ENVsrc.matchAll(/refuse\('(env_[a-z_]+)'/g)].map((m) => m[1]).concat([...door.matchAll(/code: '([a-z_-]+)'/g)].map((m) => m[1]), ['agent_forbidden']));
  const missing = [...codes].filter((c) => !Wd.envWords(c, T).known);
  ok(codes.size >= 12 && missing.length === 0 && Wd.envWords('zzz_new', T).known === false && /zzz_new/.test(Wd.envWords('zzz_new', T).text), `④ every code (${codes.size}) the verdict and the door answer has the page's sentence; an unknown code is named by its code`, { codes: [...codes], missing });
  ok(/Automatic now: Europe\/Paris/.test(Wd.autoWords({ value: 'Europe/Paris', from: 'exit' }, T)) && /none is kept yet/.test(Wd.autoWords({ value: null, said: 'no_exit' }, T)), '④ Automatic\'s line: its value now and whence, or that nothing is kept');
  const DLG = read('src/lib/browser-environment-dialog.js');
  ok(/`\/api\/browser\/profiles\/\$\{encodeURIComponent\(r\.id\)\}\/environment`, \{ method: 'POST'/.test(DLG) && /const f = read\(\), v = checkOf\(f\);\n      if \(!v\.ok\) \{ sayCode\(v\.code\); return; \}/.test(DLG) && !/\.disabled = true;(?![^\n]*busy)/.test(DLG.replace('busy = true; save.disabled = true;', '')),
    '④ the dialog posts to the keeper\'s one door after the page\'s own check; no control greyed but the save while it is sent', null);
}

console.log('— ⑤ r2311 (i): the dialog watch\'s reset and its leaving ask the place hold to grant again');
{
  const DS = read('src/server/browser-dialogs.js'), KS = read('src/server/browser-keeper.js'), GS = read('src/server/browser-geo-hold.js');
  ok(DS.includes("    for (const k of ctxs) await call(w, 'Browser.resetPermissions', k ? { browserContextId: k } : {});\n    if (ctxs.length) regrantPlace(w.profileId);")
    && DS.includes("    ws.on('close', () => { down(w, SOCKET_CLOSED); regrantPlace(w.profileId); });")
    && /function regrantPlace\(pid\) \{ try \{ if \(keeper && typeof keeper\.geoRegrant === 'function'\) Promise\.resolve\(keeper\.geoRegrant\(String\(pid \|\| ''\)\)\)\.catch/.test(DS)
    && /geoRegrant: \(profileId\) => \(geoHoldOwn \? geoHoldOwn\.regrant\(String\(profileId \|\| ''\)\)\.catch\(\(\) => false\) : Promise\.resolve\(false\)\)/.test(KS)
    && /return \{ arm, disarm, heldOf, factOf, rearmNow, regrant, dispose,/.test(GS),
    '⑤ PIN: after the watch resets the browser\'s permissions (a takeover) and when its socket closes, the keeper asks the place hold to grant again (the hold\'s own regrant: legs and REDs in test-browser-geo-hold; the real browser in test-browser-geo-hold-chrome)');
}

console.log('— ⑥ r2767 MUST: an agent\'s view of a profile is made from what an agent may see — every key out is a row with its reason');
{
  const B = require('../src/browser-profiles.js');
  // the fields the HARVEST finds on a profile record (r2932 (3): its rule printed in the leg's name): the new record's own keys + every
  // `p.<field> =` (p, pr, prof, profile) of the keeper, the profiles module, the engines, the routes, the builds keeper and the
  // migrations — each planted on one record, the person's place and an exit among them
  const SRCF = ['src/server/browser-keeper.js', 'src/browser-profiles.js', 'src/server/browser-engines.js', 'src/routes/browser.js', 'src/server/browser-builds-keeper.js', 'src/server/migrations.js'];
  const SRC = SRCF.map(read).join('\n');
  const HARVEST_RULE = `every «p|pr|prof|profile.<field> =» in ${SRCF.join(', ')}, plus the new record's own keys; a field set under another name, by Object.assign, a spread or a computed key is not found, and the view, a kept list, drops such a field, never passes it`;
  const written = new Set();
  for (const m of SRC.matchAll(/\b(?:p|pr|prof|profile)\.([a-zA-Z_]\w*)\s*=(?!=)/g)) written.add(m[1]);
  const base = B.newProfileRecord({ id: 'bp-000000e7', label: 'Census', dir: path.join(ROOT, 'census'), now: 1 });
  for (const k of Object.keys(base)) written.add(k);
  const recordOf = () => { const r = { ...base }; for (const k of written) if (!(k in r)) r[k] = { planted: k }; r.environment = { location: { ...PLACE, sites: ['https://listed.example'] } }; r.egress = { publicIp: '203.0.113.9', country: 'FR', timezone: 'Europe/Paris', checkedAt: 1, source: 'measured' }; return r; };
  const censusOf = (Bm) => { const v = Bm.agentProfileView(recordOf(), { browserKey: 'bk-000000e7' }, { mediated: true }); const rows = B.AGENT_VIEW_ROWS; return { v, noRow: Object.keys(v).filter((k) => !Object.prototype.hasOwnProperty.call(rows, k) || typeof rows[k] !== 'string' || rows[k].length < 8) }; };
  const c0 = censusOf(B);
  ok(written.size >= 25 && c0.noRow.length === 0 && !('environment' in c0.v) && !('egress' in c0.v) && !/12\.5|45\.25|listed\.example|203\.0\.113/.test(J(c0.v)) && c0.v.id === 'bp-000000e7' && 'use' in c0.v && 'scope' in c0.v,
    `⑥ the agent's view of a record carrying all ${written.size} fields the harvest finds (its rule: ${HARVEST_RULE}): every key out (${Object.keys(c0.v).length}) is a row with its reason; the place, its sites and the kept exit never out`, { noRow: c0.noRow, keys: Object.keys(c0.v) });
  const MUT6 = mutantCopies('env-dialog-view', REPO), bsrc = read('src/browser-profiles.js');
  const spread = MUT6.load('src/browser-profiles.js', anchored(bsrc, '  for (const k of Object.keys(AGENT_VIEW_ROWS)) {', '  Object.assign(out, pub, ex); for (const k of []) {', 'view RED the record spread'), 'view-spread');
  const r1 = censusOf(spread);
  ok(r1.noRow.includes('environment') && r1.noRow.includes('egress'), '⑥ RED — the view as the record spread (the old shape): the place and the kept exit come out with no row', r1.noRow);
  const planted = MUT6.load('src/browser-profiles.js', anchored(bsrc, '  out.scope = scopeOf(p);', '  out.plantedField = 1; out.scope = scopeOf(p);', 'view RED a planted field'), 'view-planted');
  const r2 = censusOf(planted);
  ok(J(r2.noRow) === J(['plantedField']), '⑥ RED — a field the view passes with no row of its own is red by its name', r2.noRow);
  // r2932 (2): ONE LEVEL DOWN — each object row fed its real shape and a planted sub-field (and a plain row an object): only the
  // sub-fields its shape names come out. RED: a view whose rows pass an object whole
  const SUB = 'plantedSub', AK = { browserKey: 'bk-000000e7' };
  const objRec = { ...base, browser: { kind: 'build', version: '1.2.3.4', [SUB]: 1 }, buildMissing: { kind: 'path', what: '/opt/named/chrome', code: 'browser_path_missing', at: 5, filed: true, [SUB]: 1 }, renamedFrom: { host: 'old-machine', at: 6, [SUB]: 1 }, allowedDomains: ['a.example', { [SUB]: 1 }], kernelLive: { engine: 'pub.engine', version: '150', why: 'standard', probe: null, live: [], at: 7, filed: true, [SUB]: 1 }, notes: { [SUB]: 1 } };
  const kindsOf = (Bm) => ['build', 'path', 'plugin', 'default'].map((kind) => Bm.agentProfileView({ ...base, browser: { kind, version: '1.2.3.4', id: 'pub.engine', path: '/opt/named/chrome', [SUB]: 1 } }, AK, {}).browser);
  const s0 = B.agentProfileView(objRec, AK, {}), k0 = kindsOf(B);
  ok(!J([s0, k0]).includes(SUB) && !J([s0, k0]).includes('/opt/named') && !('notes' in s0)
      && J(s0.browser) === J({ kind: 'build', version: '1.2.3.4' }) && J(s0.buildMissing) === J({ kind: 'path', what: null, code: 'browser_path_missing', at: 5 }) && J(s0.renamedFrom) === J({ host: 'old-machine', at: 6 })
      && J(s0.allowedDomains) === J(['a.example']) && J(s0.kernelLive) === J({ engine: 'pub.engine', version: '150', why: 'standard', probe: null, live: [] })
      && J(k0) === J([{ kind: 'build', version: '1.2.3.4' }, { kind: 'path' }, { kind: 'plugin', id: 'pub.engine' }, { kind: 'default' }]),
    '⑥ r2932 (2) ONE LEVEL DOWN: an object row leaves by the sub-fields its shape names (the build by its kind, a named file never by its path; a missing build; the machine it was renamed from; the sites it is limited to; the kernel\'s fact): a planted sub-field never comes out, nor an object on a plain row', { s0, k0 });
  const whole = MUT6.load('src/browser-profiles.js', anchored(bsrc, '  return shape ? shape(v) : undefined;', '  return v;', 'view RED an object row whole'), 'view-whole');
  const s1 = whole.agentProfileView(objRec, AK, {});
  ok(J(s1.browser).includes(SUB) && J(s1.renamedFrom).includes(SUB) && 'notes' in s1, '⑥ RED — a view whose rows pass an object whole: the planted sub-field comes out', { browser: s1.browser, renamedFrom: s1.renamedFrom, notes: s1.notes });
  // r2932 (1): THE TWO DOORS THAT BUILT THEIR OWN SHAPE — the resolve answers for a conversation's own browser and a helper's (the
  // profile ensureEphemeral hands, src/routes/browser.js) go through the same view: shown BY A REQUEST on the real router, a stand-in
  // keeper whose record carries a time zone setting, the kept exit, a planted field and a planted sub-field. RED: a router copy that
  // sends the record's public view (the two answers as they were)
  const express = require('express');
  const KEY = 'bk-0000e7d1', TOKEN = ['vsst', '_', 'envdialog', '_1'].join(''), CFG = path.join(ROOT, 'agent-browser.json');   // made up at run time, never a token literal
  const doorRec = (bk) => ({ ...B.newProfileRecord({ id: bk.includes('.') ? 'bp-000000e9' : 'bp-000000e8', label: '(ephemeral) Chat', dir: null, ephemeral: true, owner: { kind: 'conversation', id: bk }, now: 1 }),
    environment: { timezone: { mode: 'value', value: 'Europe/Paris' } }, egress: { publicIp: '203.0.113.9', country: 'FR', checkedAt: 1, source: 'measured' }, plantedField: 'planted-top', browser: { kind: 'build', version: '1.2.3.4', [SUB]: 'planted-sub' } });
  const doorsOf = async (RBmod) => {
    const asked = [];
    const stand = {
      resolveFor: ({ handle }) => (handle ? { ok: true, kind: 'child', handle: String(handle), handles: [] } : { ok: true, kind: 'none', handles: [] }),
      ensureEphemeral: async ({ browserKey }) => { asked.push(browserKey); return { profile: B.publicProfileView(doorRec(browserKey)), browser: { state: 'ready' }, lease: {}, created: false }; },
      socketRootOf: () => ({ socketDir: path.join(ROOT, 'sock'), runtimeDir: null }), configFileFor: () => CFG, clock: () => Date.now(),
      profile: () => null, profileByRef: () => null, setFor: () => ({ attachments: [], handles: [] }), audit() { }, noteLeaseUrl() { },
      leasesFor: () => [], inputStateFor: () => ({ input: 'agent', takenAt: 0 }), ephemeralFor: () => null, onLease: () => () => { },
    };
    const sessions = new Map([['sess-e7', { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', _browserEnv: [`AGENT_BROWSER_SESSION=vs-${KEY}`, `AGENT_BROWSER_NAMESPACE=vs-${KEY}`, `AGENT_BROWSER_CONFIG=${CFG}`], name: 'Chat', cwd: ROOT }]]);
    RBmod.setup({ keeper: stand, activeSessions: sessions, tasksForSession: () => [] });
    const app = express(); app.use(express.json()); app.use(RBmod.router);
    const srv = await new Promise((res) => { const sv = app.listen(0, '127.0.0.1', () => res(sv)); });
    const post = (handle) => fetch(`http://127.0.0.1:${srv.address().port}/api/agent/browser/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: ['Bearer ', TOKEN].join('') }, body: J({ handle, argv: ['open', 'https://site.example'] }) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    try { return { own: await post(''), child: await post(`${KEY}.1`), asked }; } finally { await new Promise((res) => srv.close(res)); }
  };
  const viewed = (r) => !!(r && r.status === 200 && r.body && r.body.profile) && !('environment' in r.body.profile) && !('egress' in r.body.profile) && !('owner' in r.body.profile) && !('plantedField' in r.body.profile)
    && !/planted-sub|Europe\/Paris|203\.0\.113/.test(J(r.body.profile)) && !!r.body.profile.use && r.body.profile.use.you === true && J(r.body.profile.browser) === J({ kind: 'build', version: '1.2.3.4' });
  const d0 = await doorsOf(require('../src/routes/browser.js'));
  ok(!!d0.own.body && d0.own.body.kind === 'ephemeral' && !!d0.child.body && d0.child.body.kind === 'child' && viewed(d0.own) && viewed(d0.child) && J(d0.asked) === J([KEY, `${KEY}.1`]),
    '⑥ r2932 (1) BY A REQUEST: the resolve answers for a conversation\'s own browser (kind ephemeral) and a helper\'s (kind child) hand the agent\'s view: no time zone setting, no kept exit, no owner row, no planted field or sub-field; «use» says it is the asker\'s own', { own: d0.own, child: d0.child, asked: d0.asked });
  const AVIEW = 'profile: B.agentProfileView(e.profile, agentFactsOf(f), { mediated: !!(e.profile && e.profile.mediated) })';
  const d1 = await doorsOf(MUT6.load('src/routes/browser.js', anchored(read('src/routes/browser.js'), AVIEW, 'profile: e.profile', 'door RED the public view', { count: 2 }), 'door-public'));
  ok(!viewed(d1.own) && !viewed(d1.child) && 'plantedField' in (((d1.own || {}).body || {}).profile || {}) && 'plantedField' in (((d1.child || {}).body || {}).profile || {}),
    '⑥ RED — the two answers as they were (the record\'s public view): the planted field reaches the agent through both', { own: d1.own && d1.own.body && d1.own.body.profile, child: d1.child && d1.child.body && d1.child.body.profile });
  for (const c of copiesCensus(MUT6.files, MUT6.dir, REPO, { label: '⑥ controls: ' })) ok(c.pass, c.name, c.detail);
}

console.log('— ⑦ r2767 (a): one plan while a browser runs — the gates judge by what it was started with until its restart');
{
  const k = mkK(), p = k.createProfile({ label: 'Running' });
  await k.setEnvironment(p.id, { environment: { location: PLACE } });
  k._reg().browsers[p.id] = { profileId: p.id, state: 'ready', environment: { applied: { location: 'fixed' } } };   // started with the place (its record only)
  const r = await k.setEnvironment(p.id, { environment: { location: null } });   // the person saves «this machine's» while it runs
  const whileRuns = { kind: k.placeKindFor(p.id), held: k.geoHeldFor(p.id) };
  delete k._reg().browsers[p.id];   // its restart (no running record)
  const after = { kind: k.placeKindFor(p.id), held: k.geoHeldFor(p.id) };
  ok(r.ok && r.restartNeeded === true && whileRuns.kind === 'place' && !!whileRuns.held && whileRuns.held.kind === 'place' && after.kind === null && after.held === null,
    '⑦ a save from a place to «this machine\'s» while the browser runs: the mediator\'s and the dialog watch\'s gates still judge a place until its restart; after it, the saved setting', { r, whileRuns, after });
  k.shutdown?.();
  // r2932 (5): THE OTHER DIRECTION — a browser started with nothing set (its running record carries no environment), then a place
  // saved while it runs: judged by the SAVED place until its restart — stricter, it fails closed (the keeper's kb essay says so)
  const k2 = mkK(), p2 = k2.createProfile({ label: 'Running bare' });
  k2._reg().browsers[p2.id] = { profileId: p2.id, state: 'ready' };   // started with nothing set (its record only)
  const before2 = k2.placeKindFor(p2.id);
  const r2 = await k2.setEnvironment(p2.id, { environment: { location: PLACE } });
  const while2 = { kind: k2.placeKindFor(p2.id), held: k2.geoHeldFor(p2.id) };
  ok(before2 === null && r2.ok && r2.restartNeeded === true && while2.kind === 'place' && !!while2.held && while2.held.kind === 'place',
    '⑦ r2932 (5) the other direction: a browser started with nothing set, then a place saved while it runs, is judged by the SAVED place until its restart (stricter: the gates refuse a place\'s acts at once)', { before2, ok: r2.ok, restartNeeded: r2.restartNeeded, kind: while2.kind, held: while2.held && while2.held.kind });
  k2.shutdown?.();
}
console.log('— ⑧ the owner\'s decision on the place hole (r2911 / r2916): the kernel\'s probe field read; one plain sentence under the location');
{
  const ENGN = require('../src/browser-engines.js');
  const P0 = { installed: true, executable: true, version: null, protocol: ENGN.PROTOCOL, kinds: [], features: [] };
  const isoOf = (E, body) => { const v = E.engineAnswerVerdict('probe', { status: 200, body }, { id: 'acme.engine', label: 'Acme' }); return v.ok ? v.fact.geolocationIsolated : `refused ${v.code}`; };
  const ROWS8 = [['true', { ...P0, geolocationIsolated: true }, true], ['false', { ...P0, geolocationIsolated: false }, false], ['absent (an older plugin)', P0, false],
    ['a string', { ...P0, geolocationIsolated: 'true' }, false], ['null', { ...P0, geolocationIsolated: null }, false], ['only the capabilities mirror', { ...P0, capabilities: { geolocationIsolated: true } }, false]];
  const probeRead = (E) => ROWS8.map(([n, b]) => [n, isoOf(E, b)]);
  const g0 = probeRead(ENGN);
  ok(J(g0.map(([, v]) => v)) === J(ROWS8.map(([, , w]) => w)),
    '⑧ (b) THE PROBE\'s FIELD: geolocationIsolated is true only for a stated top-level true; false, absent (an older plugin), another shape or the capabilities mirror alone read as false — a fact, never a refusal', g0);
  const MUT8 = mutantCopies('env-dialog-decision', REPO);
  const esrc = read('src/browser-engines.js');
  const Eno = MUT8.load('src/browser-engines.js', anchored(esrc, '      geolocationIsolated: body.geolocationIsolated === true } };', '      } };', 'decision RED the verdict drops the field'), 'probe-no-field');
  ok(J(probeRead(Eno).map(([, v]) => v)) !== J(ROWS8.map(([, , w]) => w)), '⑧ RED — the verdict without the field: a patched kernel reads as nothing at all', probeRead(Eno));
  // the engines table the dialog reads: a stand-in registry whose probe answers through the REAL verdict (a patched kernel and one without)
  const engStand = (E) => ({
    rows: () => [{ id: 'acme.engine', label: 'Acme', family: 'manifest', version: '1.0.0' }, { id: 'old.engine', label: 'Old', family: 'manifest', version: '0.9.0' }],
    probe: async (id) => E.engineAnswerVerdict('probe', { status: 200, body: id === 'acme.engine' ? { ...P0, geolocationIsolated: true } : P0 }, { id, label: id }),
  });
  const mkKE = (mod) => { const dataDir = path.join(ROOT, `data-${++nK}`); fs.mkdirSync(dataDir, { recursive: true }); return mod.create({ dataDir, homeDir: HOME, env: () => ({ PATH: '/usr/bin:/bin', HOME }), serverSetting: () => undefined, install: false, tickMs: 3600e3, log: quiet, hostKnown: () => false, engines: engStand(ENGN) }); };
  const viewOf = async (mod) => { const k = mkKE(mod); try { const v = await k.engineRowsView(); return Object.fromEntries(v.map((r) => [r.id, r.geolocationIsolated])); } finally { k.shutdown?.(); } };
  const v0 = await viewOf(K);
  ok(J(v0) === J({ 'acme.engine': true, 'old.engine': false }), '⑧ (b) the engines table (GET /api/browser/engines) carries each kernel\'s place fact: the patched one true, the one without false', v0);
  const ksrc = read('src/server/browser-keeper.js');
  const Kno = MUT8.load('src/server/browser-keeper.js', anchored(ksrc, 'geolocationIsolated: f.geolocationIsolated === true, live: liveOfEngine(row.id)', 'live: liveOfEngine(row.id)', 'decision RED the view drops the copy'), 'view-no-copy');
  const v1 = await viewOf(Kno);
  ok(v1['acme.engine'] !== true, '⑧ RED — the engines view without its copy: the dialog would never hear a kernel is patched', v1);
  // the dialog's model and words (PURE)
  const F8 = await import(new URL('../src/lib/browser-environment-form.js', import.meta.url).href);
  const W8 = await import(new URL('../src/lib/browser-environment-words.js', import.meta.url).href);
  const ENG_ROWS = [{ id: 'acme.engine', geolocationIsolated: true }, { id: 'old.engine', geolocationIsolated: false }];
  const CASES = [['stock Chrome (no choice)', {}, ENG_ROWS, false], ['a Chrome build', { browser: { kind: 'build', version: '1.2.3.4' } }, ENG_ROWS, false], ['a named chrome file', { browser: { kind: 'path' } }, ENG_ROWS, false],
    ['a patched kernel', { browser: { kind: 'plugin', id: 'acme.engine' } }, ENG_ROWS, true], ['a kernel without the patch', { browser: { kind: 'plugin', id: 'old.engine' } }, ENG_ROWS, false],
    ['an engine not in the table', { browser: { kind: 'plugin', id: 'gone.engine' } }, ENG_ROWS, false], ['the table not read', { browser: { kind: 'plugin', id: 'acme.engine' } }, null, false]];
  const gF = CASES.map(([n, r, e]) => [n, F8.placeIsolatedOf(r, e)]);
  ok(J(gF.map(([, v]) => v)) === J(CASES.map(([, , , w]) => w)),
    '⑧ (b) whose place cannot leak: only an engine profile whose kernel\'s probe says so — stock Chrome, a Chrome build or file, a kernel without the patch, an engine not listed or a table not read do not', gF);
  const idt = (s) => s;
  const wIso = W8.placeLeakWords(true, idt), wNot = W8.placeLeakWords(false, idt);
  ok(wIso !== wNot && /cannot leak/.test(wIso) && /allow a site your location in this browser.s own settings/.test(wNot) && /real location whenever VibeSpace is not holding a place/.test(wNot) && W8.placeLeakWords(undefined, idt) === wNot,
    '⑧ (a) the two sentences: stock Chrome or a kernel without the patch — a site the person allows in the browser\'s own settings reads the real location whenever no hold of VibeSpace\'s stands; a patched kernel — its place cannot leak; anything unsaid reads as stock', { wIso, wNot });
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  ok([wIso, wNot].every((s) => ZH.includes(J(s) + ':') && JA.includes(J(s) + ':')), '⑧ both sentences have their zh and ja rows');
  const DS = read('src/lib/browser-environment-dialog.js');
  ok(DS.includes('leak.textContent = placeLeakWords(placeIsolatedOf(r, engines), t);') && DS.includes("if (r && r.browser && r.browser.kind === 'plugin') shell.ready.then((s) => { if (s) Promise.resolve(fetchJson('/api/browser/engines'))") && DS.includes('else sayLeak(null);') && DS.includes('lrow.append(lsel, place, blocked, leak);') && !/leak\.(disabled|setAttribute\('disabled)/.test(DS),
    '⑧ PIN: the dialog says the sentence under the location — an engine profile asks the engines table once the form opens (§103 r4), anything else says the stock sentence at once; nothing greyed, nothing refused');
  for (const c of copiesCensus(MUT8.files, MUT8.dir, REPO, { label: '⑧ controls: ' })) ok(c.pass, c.name, c.detail);
}
report();
