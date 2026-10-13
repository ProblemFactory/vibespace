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

/** the Connect machine: `start({origin})` → {ok, url, flowId, via} | {ok:false, why:'needs-https'}; `landing()` = the door */
function create({ client, flows, integrations = () => null, instanceUrl = () => '', tokens, now = Date.now, log = console }) {
  const key = crypto.randomBytes(32);   // this boot's state key: a state from another boot (or another kind) is refused
  const sign = (clear) => crypto.createHmac('sha256', key).update(clear).digest('base64url');
  const store = () => { try { return integrations() || null; } catch { return null; } };
  /** the deployment's client: the row's own clientId/relayUrl, else the cluster preset's (presetsFor) */
  function clientCfg() {
    const st = store();
    let own = {}, preset = {};
    try { const r = st && st.resolveIntegration(KIND); own = (r && r.values) || {}; } catch { }
    try { const ps = st && typeof st.presetsFor === 'function' ? st.presetsFor(KIND) : []; preset = (Array.isArray(ps) && ps[0] && ps[0].values) || {}; } catch { }
    const clientId = String(own.clientId || preset.clientId || '').trim();
    const relayUrl = String(own.relayUrl || preset.relayUrl || '').trim();
    return { clientId, relayUrl, preset: !!preset.clientId && !own.clientId };
  }
  const httpsBase = () => { const u = String((typeof instanceUrl === 'function' ? instanceUrl() : '') || '').replace(/\/+$/, ''); return /^https:\/\/[^/]+$/.test(u) ? u : ''; };
  /** where the vendor sends the browser back: a preset's relay › the hub's own https › the row's relay › none */
  function callbackPlan() {
    const c = clientCfg();
    if (c.preset && c.relayUrl) return { redirectUri: c.relayUrl, via: 'relay', ...c };
    const own = httpsBase();
    if (own) return { redirectUri: own + CALLBACK_PATH, via: 'own-https', ...c };
    if (/^https:\/\//.test(c.relayUrl)) return { redirectUri: c.relayUrl, via: 'relay', ...c };
    return { redirectUri: null, via: null, ...c };
  }
  async function start({ origin = '' } = {}) {
    const plan = callbackPlan();
    if (!plan.redirectUri) return { ok: false, why: 'needs-https' };
    let clientId = plan.clientId;
    const reg = (tokens.read() || {}).registeredFor || null;
    if (!clientId || (!plan.preset && reg && reg !== plan.redirectUri)) {
      clientId = (await client.register({ redirectUri: plan.redirectUri })).clientId;
      const st = store();
      if (st && typeof st.setIntegration === 'function') st.setIntegration(KIND, { clientId });
      tokens.write({ ...(tokens.read() || {}), registeredFor: plan.redirectUri });
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
  return { start, landing, page: landingHtml, callbackPlan, sign, flowStatus: (id) => flows.status(id) };
}

module.exports = { create, pkcePair, stateOf, stateVerdict, tokenFile, landingHtml, CALLBACK_PATH, KIND, STATE_TTL_MS };
