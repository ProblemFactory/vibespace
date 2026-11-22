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
  ok(/`\/api\/browser\/profiles\/\$\{encodeURIComponent\(r\.id\)\}\/environment`, \{ method: 'POST'/.test(DLG) && /const f = read\(\), v = checkOf\(f\);\n      if \(!v\.ok\) \{ sayCode\(v\.code, v\.error\); return; \}/.test(DLG) && !/\.disabled = true;(?![^\n]*busy)/.test(DLG.replace('busy = true; save.disabled = true;', '')),
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
report();
