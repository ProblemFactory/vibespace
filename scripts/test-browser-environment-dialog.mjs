#!/usr/bin/env node
// B-9584 U3 — A PROFILE's ENVIRONMENT, SET BY THE PERSON (lane cli-update-needs-nothing; 主开发 r2311 / r2497 / r2595): the keeper's ONE
// door (setEnvironment) and its person-only route, before any page makes the place's road reachable. Stand-ins only: a scratch data
// folder, no browser launched, no address called, made-up places.
//   ① THE DOOR (src/server/browser-keeper.js setEnvironment): a place with its sites kept canonical; the same save again changes
//      nothing; a running browser takes it at its next start (restartNeeded); every refusal by its own name — the verdict's, sites
//      beside anything but a place, a place or «blocked» on a paired machine's profile (r2172 (a): where it is set), sites on an
//      engine's profile (r2311); all «this machine's» keeps nothing. RED: the door without the paired refusal.
//   ② THE ROUTE (src/routes/browser.js): a person's cookie door only — the agent's token refused before anything; its status table.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
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
  const r1 = await k.setEnvironment(p.id, { environment: { timezone: { mode: 'value', value: 'Asia/Kolkata' }, location: { ...PLACE, sites: ['https://B.example/x', 'https://a.example', 'https://b.example/'] } } });
  const kept = recOf(k, p.id).environment;
  ok(r1.ok && r1.changed === true && r1.restartNeeded === false && J(kept.location.sites) === J(['https://a.example', 'https://b.example']) && kept.location.mode === 'value' && kept.timezone.value === 'Asia/Kolkata'
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
  ok(src.split(A).length === 2, '① control setup: the door\'s paired / ephemeral refusal is spelled once');
  const Kn = MUT.load('src/server/browser-keeper.js', src.split(A).join("      if (false) return { ok: false, code: 'browser_place_unsupported',"), 'no-paired-refusal');
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
report();
