'use strict';
// THE THIRD-PARTY PROVIDER SPAWN ROAD (lane lg-providers, B-d578 U2 — design q-045 §2.2–§2.3 + q-053 Train 2). ORCH: an
// account id `pv-<id>` (a provider record, not an account) on a harness → the spawn account ws-create consumes —
// { id, name, kind: 'provider', localEnv, argv, secret, plainEnv } — the SAME shape accounts.resolveForSpawn answers for a
// key account, so the ONE line both session roads read (ws-create's r6Base env + src/spawn/line.js; dtach and the device
// pipe session alike) carries it with no branch of its own. It decides nothing: which harness a provider serves is PURE
// src/model-providers.js fitsHarness; what the CLI reads is the descriptor's PURE creds.providerSpawn; the key comes from
// the provider store's ONE reader (keyOf — the vault). Every refusal is BY NAME, before anything spawns: unknown / not
// for this harness / no address / another machine (U3) / the vault locked or the key unreadable — never a spawn without
// its key, never a fall back onto the machine's own login.
// THE HOME (make the other case impossible, not unlikely): each provider × harness gets a directory of its own under
// data/provider-homes/<id>/<harness> (0700) — claude's secret store (CLAUDE_SECURESTORAGE_CONFIG_DIR: empty, so the
// machine's subscription login is not in it), codex's whole home (seeded like an account's: sessions + config.toml shared,
// no auth.json). A login file found there (the harness's creds.authFile) is removed before every spawn.
const fs = require('fs');
const path = require('path');
const MP = require('../model-providers.js');

const named = (code, message) => Object.assign(new Error(message), { code });
const PROBE_ROADS = Object.freeze(['opencode']);   // the harnesses `probeRoads` may open — by name (r1159), nothing else
// A PLAN'S FILE (B-d578 P1-a: OpenCode's one config, src/opencode-provider-config.js): under the provider's own home only,
// 0600, written whole (tmp + rename); the plan puts no value in it (the key's NAME only — its value rides the env)
function writePlanFile(home, f) {
  const rel = String((f && f.rel) || '');
  const root = path.resolve(home), abs = path.resolve(root, rel);
  if (!rel || path.isAbsolute(rel) || !abs.startsWith(root + path.sep)) throw named('plan-file-outside', `a spawn plan named a file outside its provider home (${rel || 'no name'})`);
  fs.mkdirSync(path.dirname(abs), { recursive: true, mode: 0o700 });
  const tmp = `${abs}.tmp-${process.pid}`;
  try { fs.writeFileSync(tmp, String((f && f.text) || ''), { mode: 0o600 }); fs.renameSync(tmp, abs); }
  catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { } throw named('plan-file-unwritten', `the provider's file ${rel} could not be written (${(e && e.code) || e}) — nothing was started`); }   // a failed write leaves no temp behind (r1159)
}
const homeOf = (dataDir, id, backend) => path.join(dataDir, 'provider-homes', id, backend);
// `probeRoads` (B-d578 P1-a, the coordinator's rulings r1126 / r1159): THE ONE SWITCH of the road the published pages carry but
// no probe has measured — { opencode: plan }, OpenCode BY NAME (PROBE_ROADS) and only while model-providers marks it «later»
// (not offered: no picker row). The product's one create (src/server/account-usage-routes.js) hands none; no probe exists yet —
// today only test-harness-spawn's «P1-a OpenCode» leg hands it.
function create({ providers, dataDir, harnessOf = (id) => require('../harnesses').get(id), probeRoads = null } = {}) {
  /** → the spawn account | throws a named Error (code: provider-unknown · provider-unfit · provider-remote ·
   *  provider-no-address · vault_locked · vault_not_set_up · key-unreadable · no-key) */
  return function providerSpawnFor(id, backend, opts = {}) {
    if (typeof providers.unread === 'function' && providers.unread()) throw named('providers_unread', `VibeSpace cannot read its list of model providers right now, so this conversation on ${id} waits — nothing was started; try again in a few minutes (it reads the list again by itself)`);   // (B-f276 family, r3000) providers.json HELD: the provider is unread, never «removed» — refused BY NAME, never started on another one nor on no provider's settings
    const p = providers.thirdParty().find((r) => r.id === id) || null;
    if (!p && typeof providers.damaged === 'function' && providers.damaged()) throw named('providers_damaged', `the list of model providers was damaged (VibeSpace kept its damaged bytes aside) and this conversation's provider is not in it any more — nothing was started; add the provider again in the account dialog, then pick it for this conversation`);   // (r3106 (2)) never «it was removed»
    if (!p) throw named('provider-unknown', `unknown model provider ${id} — it was removed; pick another account for this conversation`);
    let h = null;
    try { h = harnessOf(backend); } catch { h = null; }
    const label = (h && h.label) || backend;
    const probe = probeRoads && PROBE_ROADS.includes(backend) && typeof probeRoads[backend] === 'function' && (MP.fits(p)[backend] || {}).code === 'later' ? probeRoads[backend] : null;
    if (!probe && (!MP.fitsHarness(p, backend) || !h || !h.creds || typeof h.creds.providerSpawn !== 'function')) throw named('provider-unfit', `${p.label} does not offer what ${label} needs`);
    if (opts.remote) throw named('provider-remote', `${p.label} runs on this machine only for now — start the conversation on this machine`);
    if (!p.baseUrl) throw named('provider-no-address', `${p.label} has no address — set it in Manage agents`);
    const k = providers.keyOf(p.id);
    if (!k.ok) {
      if (k.code === 'vault_locked') throw named('vault_locked', `the vault is locked — unlock it to start a conversation on ${p.label} (its key is kept there)`);
      if (k.code === 'vault_not_set_up') throw named('vault_not_set_up', `the vault is not set up — ${p.label}'s key is kept there`);
      throw named(k.code || 'key-unreadable', `${p.label}'s key could not be read from the vault (${k.code}) — paste it again in Manage agents`);
    }
    const home = homeOf(dataDir, p.id, backend);
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    const creds = (h && h.creds) || {};
    if (creds.authFile) { try { fs.rmSync(path.join(home, creds.authFile), { force: true }); } catch { } }
    // seeded ONCE, when the home is new: seedDir replaces `sessions` with the shared link, and a real sessions folder found
    // here (a link that failed once) holds transcripts — never removed by a later spawn (adversarial read r1)
    if (creds.spawnForm === 'isolated-home' && typeof creds.seedDir === 'function') { let fresh = true; try { fs.lstatSync(path.join(home, 'sessions')); fresh = false; } catch { } if (fresh) h.creds.seedDir(home); }
    const sp = (probe || creds.providerSpawn)({ provider: p, key: k.value, home });   // (named `sp`: test-architecture §69c reserves its word for the desktop install plans)
    for (const f of sp.files || []) writePlanFile(home, f);
    return { id: p.id, name: p.label, kind: 'provider', provider: { id: p.id, kind: p.kind, label: p.label }, localEnv: sp.localEnv, argv: sp.argv || [], secret: sp.secret, plainEnv: sp.plainEnv || {} };
  };
}

/** THE MODEL a provider session starts with (adversarial read r1, MAJOR 2): the request re-resolved against the PROVIDER's
 *  rows — an alias onto its row, nothing ⇒ its default; one it does not serve (a ChatGPT / claude-* id a resume carried, the
 *  instance default) or no row at all ⇒ refused by name — never another vendor's id, never nothing, at a third party.
 *  A harness the provider does not serve (a hand-made create on OpenCode / ACP, which have no spawn road) is refused here too
 *  (U2 cure) — never its row id on the machine's own login.
 *  → null (not a provider id) | { ok, model } | { ok: false, code, message } */
function modelFor(providers, id, model, backend = null, harnessOf = (b) => require('../harnesses').get(b)) {
  if (typeof providers.unread === 'function' && providers.unread()) return { ok: false, code: 'providers_unread', message: `VibeSpace cannot read its list of model providers right now, so this conversation on ${id} waits — nothing was started; try again in a few minutes (it reads the list again by itself)` };   // (B-f276 family) held: unread, never «removed»
  const p = providers.thirdParty().find((r) => r.id === id) || null;
  if (!p && typeof providers.damaged === 'function' && providers.damaged()) return { ok: false, code: 'providers_damaged', message: `the list of model providers was damaged (VibeSpace kept its damaged bytes aside) and this conversation's provider is not in it any more — nothing was started; add the provider again in the account dialog, then pick it for this conversation` };   // (r3106 (2))
  if (!p) return { ok: false, code: 'provider-unknown', message: `unknown model provider ${id} — it was removed; pick another account for this conversation` };
  if (backend && !MP.fitsHarness(p, backend)) { let label = backend; try { label = (harnessOf(backend) || {}).label || backend; } catch { } return { ok: false, code: 'provider-unfit', message: `${p.label} does not offer what ${label} needs` }; }
  const want = typeof model === 'string' ? model.trim() : '';
  const m = MP.resolveModel(p, want);
  if (m) return { ok: true, model: m };
  if (!MP.modelsOf(p).length) return { ok: false, code: 'model-none', message: `${p.label} has no model yet — pick one in Manage agents (its Models…)` };
  return { ok: false, code: 'model-not-served', message: `${p.label} does not serve the model “${want}” — pick one of its models` };
}

// THE PLAN'S NAMES NEVER RIDE INTO ANOTHER START (lane lg-providers U2 cure — the coordinator's must): a hub (re)started from
// inside a provider conversation inherits that conversation's environment — the third party's address, its key, its model
// names — and every later start would carry them (a subscription conversation sending its turns to the third party on the
// provider's key while its badge names its own account). The names are asked of each harness's OWN plan (creds.providerSpawn,
// a stand-in record under every key header), so a name the plan learns joins by construction: the ones it sets to a VALUE are
// its payload (the switches it only empties are not); a HOME variable (its value the plan's directory) is the machine's too
// and counts only when it points into a provider's home. Two doors read them: server.js's start sanitiser (inside a
// conversation) and the one spawn line of ws-create (every start: none is inherited; a provider start's own plan is laid after).
const PLAN_HOME = '/vs-plan-home-probe';
const planProbe = (auth) => ({ id: 'pv-plan-names', kind: 'self-hosted', label: 'probe', preset: 'other', baseUrl: 'https://plan.invalid/v1', auth, wire: 'anthropic-messages', models: [{ id: 'm' }], defaultModel: 'm', aliases: {} });
function planNamesOf(desc) {
  const c = desc && desc.creds;
  const names = new Set(), homes = new Set();
  if (c && typeof c.providerSpawn === 'function') {
    for (const auth of MP.AUTHS) {
      let sp = null;
      try { sp = c.providerSpawn({ provider: planProbe(auth), key: 'plan-probe-key', home: PLAN_HOME }); } catch { sp = null; }
      for (const [k, v] of Object.entries((sp && sp.localEnv) || {})) { if (v === PLAN_HOME) homes.add(k); else if (v !== '') names.add(k); }
    }
  }
  return { names: [...names].sort(), homes: [...homes].sort() };
}
const inProviderHome = (v) => String(v || '').split(path.sep).includes('provider-homes');
/** the names of `env` a start of `backend` must not inherit: its harness's plan — ONLY when the environment carries that plan's
 *  FINGERPRINT (its home variable pointing into a provider's home: the plan always sets one). A variable a person set on the hub
 *  itself (their own ANTHROPIC_BASE_URL gateway, a model name) carries no fingerprint and keeps reaching a start, as in the
 *  release (the coordinator, 10:28Z). */
function ambientPlanNames(backend, env, harnessOf = (id) => require('../harnesses').get(id), hubEnv = null) {
  let d = null;
  try { d = harnessOf(backend); } catch { d = null; }
  const e = env || {};
  const { names, homes } = planNamesOf(d);
  // the fingerprint is read from the start's env AND the hub's own (`hubEnv`): the agent door already drops claude's secret-store
  // variable from the first (it is claude's declared spawnEnvVar), so on the real road only the hub's env still shows it (R1)
  if (!homes.some((n) => inProviderHome(e[n]) || (hubEnv && inProviderHome(hubEnv[n])))) return [];
  return [...names.filter((n) => Object.prototype.hasOwnProperty.call(e, n)), ...homes.filter((n) => inProviderHome(e[n]))];
}
/** the hub's own environment at its start (server.js's sanitiser): every harness's plan — ONLY when the environment carries
 *  that harness's plan's fingerprint (its home variable pointing into a provider's home: the plan always sets one). A person's own gateway
 *  (ANTHROPIC_BASE_URL + a token they set) or an OpenCode agent's own login is no plan, and a hub started from a plain
 *  conversation keeps it — as before (adversarial read of this cure, F3). A codex provider conversation's shell carries no
 *  CLAUDECODE: server.js asks this outside that test too (F1). */
function inheritedPlanNames(env, descriptors = require('../harnesses').list()) {
  const e = env || {};
  const out = new Set();
  for (const d of descriptors || []) for (const n of ambientPlanNames(d && d.id, e, () => d)) out.add(n);   // each plan only with its own fingerprint
  return [...out].sort();
}

module.exports = { create, homeOf, modelFor, planNamesOf, ambientPlanNames, inheritedPlanNames };
