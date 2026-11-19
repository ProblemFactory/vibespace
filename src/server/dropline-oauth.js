'use strict';
// Dropline voice input P1 — THE OAUTH TIER of the `dropline` row (design q-029 D4; lane voice-p1-oauth-teach).
// ONE client per deployment: the cluster preset's `clientId` (+ `relayUrl`), else ONE self-registration on the first
// Connect (the vendor module's register(); the client_id lands in the row). The callback = the hub's own https address
// (`instanceUrl` when https) + CALLBACK_PATH, else the relay page, else no Connect (`needs-https`: the card says how).
// The consent is an oauth-loopback `public` flow: the PKCE verifier lives in the flow record's exchange closure (the
// browser never sees it); the state is `v1.<b64url {u, f, t, k:'dropline'}>.<this boot's HMAC>` — the relay page reads
// `u` + `k` and sends the browser to <u>/api/channels/oauth/cb/dropline, where `landing()` judges the state, then the
// flow exchanges the code ONCE. The pair lives in data/dropline-oauth.json (0600; a temp file renamed into place).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KIND = 'dropline';
const { relayPick, relayPageOf } = require('../consent-road.js');   // B-1e9a cure: a preset's relay page by THE OWNING RULE (its own › the fleet's › none; a bad address is none)
const CONNECT_WHYS = require('../integration-registry.js').rowById(KIND).connect.whys; // lane dropline-connect-door: a refusal's words (PURE)
const CALLBACK_PATH = `/api/channels/oauth/cb/${KIND}`;
const STATE_TTL_MS = 30 * 60e3;
const STATE_MAX = 1200;
const b64u = (b) => Buffer.from(b).toString('base64url');

/** PKCE (S256): the verifier stays in the hub; only the challenge rides the authorize URL */
function pkcePair() {
  const verifier = b64u(crypto.randomBytes(32));
  return { verifier, challenge: b64u(crypto.createHash('sha256').update(verifier).digest()) };
}
function originOf(o) {
  try { const u = new URL(String(o || '')); return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password ? u.origin : ''; } catch { return ''; }
}
function stateOf({ origin = '', flowId, issuedAt, kind = KIND }, sign) {
  const clear = `v1.${b64u(JSON.stringify({ u: originOf(origin), f: String(flowId), t: Math.floor(Number(issuedAt) / 1000), k: kind }))}`;
  return `${clear}.${sign(clear)}`;
}
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
/** {ok, why: bad-shape|bad-hmac|wrong-kind|expired, parts} — the shape, THIS boot's HMAC, the kind, the age */
function stateVerdict(s, { sign, now = Date.now(), ttlMs = STATE_TTL_MS, kind = KIND } = {}) {
  const m = typeof s === 'string' && s.length <= STATE_MAX ? /^v1\.([A-Za-z0-9_-]{8,800})\.([A-Za-z0-9_-]{16,128})$/.exec(s) : null;
  if (!m) return { ok: false, why: 'bad-shape', parts: null };
  let j = null;
  try { j = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { }
  if (!j || typeof j !== 'object' || typeof j.f !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(j.f) || !Number.isInteger(j.t)) return { ok: false, why: 'bad-shape', parts: null };
  if (!sameText(String(sign(`v1.${m[1]}`)), m[2])) return { ok: false, why: 'bad-hmac', parts: null };
  if (j.k !== kind) return { ok: false, why: 'wrong-kind', parts: null };
  if (!(now - j.t * 1000 <= ttlMs) || j.t * 1000 - now > 60e3) return { ok: false, why: 'expired', parts: null };
  return { ok: true, why: null, parts: { flowId: j.f, origin: j.u || null } };
}

/** the pair's file: read once (cached), written to a temp file then renamed into place (0600), cleared on Disconnect */
function tokenFile(file, { fsImpl = fs } = {}) {
  let cache;
  return {
    read() {
      if (cache !== undefined) return cache;
      try { cache = JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch { cache = null; }
      return cache;
    },
    write(pair) {
      const tmp = `${file}.${process.pid}.tmp`;
      fsImpl.mkdirSync(path.dirname(file), { recursive: true });
      fsImpl.writeFileSync(tmp, JSON.stringify(pair), { mode: 0o600 });
      fsImpl.renameSync(tmp, file);
      cache = pair;
    },
    clear() {
      try { fsImpl.unlinkSync(file); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
      cache = null;
    },
  };
}

const LANDING_WORDS = {
  ok: ['VibeSpace: Dropline is connected — you can close this tab.', 'VibeSpace：Dropline 已连接——可以关闭这个标签页。', 'VibeSpace：Dropline に接続しました — このタブは閉じてかまいません。'],
  denied: ['VibeSpace: the Dropline sign-in was declined — nothing was connected.', 'VibeSpace：Dropline 登录被拒绝——什么也没连接。', 'VibeSpace：Dropline のサインインは拒否されました — 何も接続していません。'],
  failed: ['VibeSpace: this Dropline sign-in did not finish — press Connect again in VibeSpace.', 'VibeSpace：这次 Dropline 登录没完成——回到 VibeSpace 再按一次连接。', 'VibeSpace：この Dropline サインインは完了しませんでした — VibeSpace でもう一度「接続」を押してください。'],
};
function landingHtml(r) {
  const w = LANDING_WORDS[r && r.ok ? 'ok' : r && r.why === 'denied' ? 'denied' : 'failed'];
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VibeSpace · Dropline</title><body style="font:16px/1.5 system-ui,sans-serif;margin:3em auto;max-width:34em;padding:0 1em">${w.map((l) => `<p id="${r && r.ok ? 'connected' : 'not-connected'}">${esc(l)}</p>`).join('')}</body>`;
}

/** WHY there is no Connect here (lane dropline-connect-door, a fleet user's report 2026-10-18) — the status answer's
 *  `connectWhy`, by WHO can give this instance an https address: null = Connect runs; `operator` = the address is the
 *  operator's (VIBESPACE_PUBLIC_URL set, not https) or a cluster deploy has none (its person cannot run Tailscale on a
 *  pod) ⇒ ask the person who runs it; `self-hosted` = the person runs the hub ⇒ Tailscale HTTPS; `preset-no-relay` (B-1e9a)
 *  = the fleet's client has no relay page ⇒ the operator gives its preset a relayUrl (or the fleet a relay page). The words:
 *  the registry row's `connect.whys`. The start refusal's own code: `needs-https`, or `preset-no-relay` for that case. */
function connectWhyOf({ via = null, source = null, cluster = false, presetNoRelay = false } = {}) {
  if (presetNoRelay) return 'preset-no-relay';   // B-1e9a: the fleet's client has no relay page (neither its preset's relayUrl nor the fleet's) — the operator's to mend: a fleet client cannot carry every pod's own callback
  if (via) return null;
  return source === 'env' || cluster ? 'operator' : 'self-hosted';
}

/** the Connect machine: `start({origin})` → {ok, url, flowId, via} | {ok:false, why:'needs-https'|'preset-no-relay'|'vault-locked', connectWhy}; `landing()` = the door.
 *  `instanceSource()` = instance-url's effective().source; `clusterDeploy()` = a fleet pod (VIBESPACE_INSTANCE_NAME / presets dir). */
function create({ client, flows, integrations = () => null, instanceUrl = () => '', instanceSource = () => null, clusterDeploy = () => false, tokens, now = Date.now, log = console }) {
  const key = crypto.randomBytes(32);   // this boot's state key: a state from another boot (or another kind) is refused
  const sign = (clear) => crypto.createHmac('sha256', key).update(clear).digest('base64url');
  const store = () => { try { return integrations() || null; } catch { return null; } };
  const safeCall = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
  // B-1e9a cure: the tokens record read for the kept registration — a LOCKED vault is said (`locked`), never read as «none» in silence
  const readKept = () => { try { return { rec: tokens && typeof tokens.read === 'function' ? tokens.read() : null, locked: false }; } catch (e) { return { rec: null, locked: !!(e && e.code === 'vault_locked') }; } };
  /** the deployment's client: the row's own clientId/relayUrl, else the cluster preset's. B-e0d1: presetsFor answers the
   *  WIRE shape (key + label, never a value), so `presetsFor(KIND)[0].values` was always {}, and «own» was the EFFECTIVE values
   *  (the preset folded in) — `preset` never said true. Now the store's OWN resolution is read by its source: its pick (a
   *  saved preset key, the one default, the user's values outranking it — never a pair mixed across sources) is `preset`
   *  when it came from the cluster, `own` when it is the user's. */
  function clientCfg() {
    const st = store();
    let own = {}, preset = {}, source = null;
    try {
      const r = st && st.resolveIntegration(KIND);
      source = (r && r.source) || null;
      if (r && r.source === 'cluster') preset = r.values || {};
      else if (r && r.source === 'user') own = r.values || {};
    } catch { }
    // B-1e9a: a cluster preset carrying no client (an apiKey-only one) keeps the hub's OWN registration beside its tokens,
    // never as the person's row (that row would outrank the WHOLE preset — its apiKey lost after the first Connect)
    const keptRead = source === 'cluster' && !preset.clientId ? readKept() : { rec: null, locked: false };
    const kept = String((keptRead.rec || {}).registeredClientId || '').trim();
    const clientId = String(own.clientId || preset.clientId || kept || '').trim();
    // B-1e9a cure (主开发's must): a fleet client's relay page is picked by THE OWNING RULE — consent-road relayPick({fleet, preset}):
    // the preset's own page › the fleet's (fleet.json relayUrl) › none; a bad address (plain http, a query, a loopback host) is
    // none, so the Connect refuses by name instead of handing it to the vendor
    const fleetClient = !!preset.clientId && !own.clientId;
    const relayUrl = fleetClient
      ? relayPick({ fleet: String(safeCall(() => (st && typeof st.fleetRelayUrl === 'function' ? st.fleetRelayUrl() : ''), '') || ''), preset: String(preset.relayUrl || '') }).url
      : String(own.relayUrl || '').trim() || relayPageOf(preset.relayUrl);   // a cluster preset's page by the same rule's address check (relayPageOf)
    return { clientId, relayUrl, preset: fleetClient, source };
  }
  const httpsBase = () => { const u = String((typeof instanceUrl === 'function' ? instanceUrl() : '') || '').replace(/\/+$/, ''); return /^https:\/\/[^/]+$/.test(u) ? u : ''; };
  /** where the vendor sends the browser back: a preset's relay (its own, else the fleet's) › none for a preset with neither
   *  (B-1e9a) › the hub's own https › the row's relay › none */
  function callbackPlan() {
    const c = clientCfg();
    if (c.preset && c.relayUrl) return { redirectUri: c.relayUrl, via: 'relay', ...c };
    // B-1e9a: a fleet client with NO relay page (neither its preset's nor the fleet's) would send the vendor to this pod's own https —
    // a callback that client was never registered for (the vendor refuses it): no Connect, and the card names why (said once)
    if (c.preset && !c.relayUrl) return { redirectUri: null, via: null, presetNoRelay: true, ...c };
    const own = httpsBase();
    if (own) return { redirectUri: own + CALLBACK_PATH, via: 'own-https', ...c };
    if (/^https:\/\//.test(c.relayUrl)) return { redirectUri: c.relayUrl, via: 'relay', ...c };
    return { redirectUri: null, via: null, ...c };
  }
  const safe = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
  const connectWhy = () => { const p = callbackPlan(); return connectWhyOf({ via: p.via, presetNoRelay: !!p.presetNoRelay, source: safe(instanceSource, null), cluster: !!safe(clusterDeploy, false) }); };
  async function start({ origin = '' } = {}) {
    const plan = callbackPlan();
    if (!plan.redirectUri) { const cw = connectWhy(); return { ok: false, why: cw === 'preset-no-relay' ? 'preset-no-relay' : 'needs-https', connectWhy: cw, message: CONNECT_WHYS[cw] }; }   // B-1e9a cure: its own code — «needs-https» would not be true
    // B-1e9a cure: the sealed tokens file is read (and written) here — a LOCKED vault refuses BY NAME on every road (it answered an
    // unnamed 500 with the store's raw sentence); with no file at all a locked vault reads as empty, so the write after a registration
    // is the one that meets the lock — refused by name too (that one registration is spent: the vendor's, not a sealed secret)
    const locked = (e) => !!(e && e.code === 'vault_locked');
    const LOCKED = { ok: false, why: 'vault-locked', message: 'the vault is locked — the Dropline sign-in opens after the owner unlocks it on this instance\'s page; the owner has already been told (For you names what is waiting on it)' };
    let rec;
    try { rec = tokens.read() || {}; } catch (e) { if (locked(e)) return LOCKED; throw e; }
    let clientId = plan.clientId;
    const reg = rec.registeredFor || null;
    if (!clientId || (!plan.preset && reg && reg !== plan.redirectUri)) {
      clientId = (await client.register({ redirectUri: plan.redirectUri })).clientId;
      const st = store();
      try {
        if (plan.source === 'cluster') tokens.write({ ...rec, registeredFor: plan.redirectUri, registeredClientId: clientId });   // B-1e9a: over a preset, beside the tokens — never the person's row
        else {
          if (st && typeof st.setIntegration === 'function') st.setIntegration(KIND, { clientId });
          tokens.write({ ...rec, registeredFor: plan.redirectUri });
        }
      } catch (e) { if (locked(e)) return LOCKED; throw e; }
      log.log?.(`[voice] registered this deployment's Dropline client (callback via ${plan.via})`);
    }
    const { verifier, challenge } = pkcePair();
    const st = await flows.begin({
      id: KIND, mode: 'public', label: 'Dropline', redirectUri: plan.redirectUri,
      stateFor: ({ flowId, issuedAt }) => stateOf({ origin: origin || httpsBase(), flowId, issuedAt }, sign),
      buildConsentUrl: ({ redirectUri, state }) => client.authorizeUrl({ clientId, redirectUri, state, challenge }),
      exchange: ({ code, redirectUri }) => client.connectWith({ clientId, code, verifier, redirectUri }),
    });
    return { ok: true, flowId: st.flowId, url: st.consentUrl, via: plan.via };
  }
  /** THE LANDING DOOR (oauth-doors): this kind's state first, then the running flow by its whole state, once */
  async function landing({ code = null, state = null, error = null } = {}) {
    const v = stateVerdict(state, { sign, now: now() });
    if (!v.ok) { log.warn?.(`[voice] a Dropline consent landing was refused (${v.why})`); return { ok: false, why: v.why, user: null, error: null }; }
    const r = await flows.finishByState(state, code, { error });
    return { ok: !!r.ok, why: r.ok ? null : (r.why || 'failed'), user: r.ok && r.result ? r.result.user || null : null, error: r.ok ? null : (r.error || null) };
  }
  /** B-1e9a cure: an instance that Connected over an apiKey-only preset BEFORE the fix keeps the person's row {clientId} — it
   *  hides the whole preset (its key unused). This names it (the row's id, for the card's one press: «use the cluster's
   *  settings» = PUT /api/integrations/<id> {use:'cluster'}); a person's row holding anything more is their own choice. */
  function presetShadowed() {
    const st = store();
    try {
      const r = st && st.resolveIntegration(KIND);
      const own = r && r.source === 'user' ? Object.keys(r.values || {}).filter((k) => String(r.values[k] || '').trim()) : [];
      return own.length === 1 && own[0] === 'clientId' && typeof st.presetsFor === 'function' && st.presetsFor(KIND).length > 0 ? KIND : null;
    } catch { return null; }
  }
  return { start, landing, page: landingHtml, callbackPlan, connectWhy, presetShadowed, sign, flowStatus: (id) => flows.status(id) };
}

module.exports = { create, connectWhyOf, pkcePair, stateOf, stateVerdict, tokenFile, landingHtml, CALLBACK_PATH, KIND, STATE_TTL_MS };
