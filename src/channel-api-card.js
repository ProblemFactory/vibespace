'use strict';
/**
 * ONE RAW-API PROPOSAL = ONE CARD (B-2198 part 2, docs/design-channel-raw-api.md §7; the house grammar of
 * docs/design-communication-panel.zh.md §9 — "answerable where it appears", keyed rows patched in place).
 *
 * PURE (no DOM, no I/O): the chat card at the agent's call row, the Outbox row + its card, the For-you item and the
 * receipt the agent reads on its next turn are all drawn from ONE record (src/server/channel-api-cards.js `records()`,
 * the orchestrator's proposal + its frozen headers / body sha256 / tier / shape) — so a decision on one surface is
 * the same words on the other two. Words are i18n keys + params (the caller's `t` renders them; zh/ja in i18n-*.js).
 */

const TTL_MS = 24 * 60 * 60 * 1000;     // a pending proposal expires after 24 h unanswered (said on the card and to the agent)
const BODY_SHOWN = 400;                 // the card shows the body's first 400 chars, its size and its sha256
const FATES = Object.freeze(['pending', 'running', 'ran', 'failed', 'rejected', 'expired', 'withdrawn']);
/** `decidedBy` words the sweeper stamps through the orchestrator's own reject (status stays `rejected`, the fate is named). */
const SWEEP_BY = Object.freeze({ expired: 'expired', withdrawn: 'withdrawn' });

function fateOf(p) {
  if (!p) return null;
  if (p.status === 'rejected' && p.decidedBy === SWEEP_BY.expired) return 'expired';
  if (p.status === 'rejected' && p.decidedBy === SWEEP_BY.withdrawn) return 'withdrawn';
  return FATES.includes(p.status) ? p.status : 'failed';
}
function sizeText(n) {
  const b = Math.max(0, Number(n) || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
const whoOf = (p) => (p && p.principal && (p.principal.name || p.principal.id)) || '';

/** The outcome line — the SAME words on the card, the Outbox row, the resolved For-you row. `{key, params}`. */
function outcomeOf(p, { now = Date.now() } = {}) {
  const f = fateOf(p);
  const r = (p && p.result) || {};
  if (f === 'pending') return { key: 'Waiting for you · expires in {h} h', params: { h: Math.max(1, Math.ceil(((p.at || 0) + TTL_MS - now) / 3600000)) } };
  if (f === 'running') return { key: 'Running…', params: {} };
  if (f === 'ran') return { key: 'Ran · {status} · {size}', params: { status: r.status || 0, size: sizeText(r.bytes) } };
  if (f === 'rejected') return p.decidedBy === 'user' || !p.decidedBy ? { key: 'Rejected by you', params: {} } : { key: 'Rejected by {who}', params: { who: String(p.decidedBy) } };
  if (f === 'expired') return { key: 'Expired — unanswered for 24 h, nothing ran', params: {} };
  if (f === 'withdrawn') return { key: 'Withdrawn — {reason}', params: { reason: p.reason || '' } };
  return { key: 'Not run — {reason}', params: { reason: (r && r.error) || p.reason || '' } };
}

/** THE CARD MODEL — everything a surface draws; `sig` changes iff a drawn word changes (the keyed patch's test). */
function cardModel(p, { now = Date.now() } = {}) {
  const fate = fateOf(p);
  const q = (p.query || []).map(([k, v]) => `${k}=${v}`).join('&');
  const body = p.body == null ? null : String(p.body).slice(0, BODY_SHOWN);
  const m = {
    id: p.id, fate, actionable: fate === 'pending', conv: p.conv || null,
    head: { key: '{name} wants to call {cred} · {call}', params: { name: whoOf(p), cred: p.credLabel || p.cred, call: `${p.method} ${p.path}` } },
    request: { method: p.method, host: p.host, path: p.path, query: q },
    headers: Object.entries(p.headers || {}).map(([k, v]) => `${k}: ${v}`),
    body, bodyMore: p.body != null && String(p.body).length > BODY_SHOWN, bodyBytes: Number(p.bodyBytes) || 0, bodySha: p.bodySha || null,
    tier: p.tier || null,
    sensitive: p.sensitive ? { key: 'Sensitive — always asks ({why})', params: { why: p.sensitive } } : null,
    // D2: "always allow" only for a non-sensitive write — and its words NAME the shape it will allow
    always: p.offersAlways && !p.sensitive && p.shape ? { key: 'Run and always allow {shape}', params: { shape: p.shape } } : null,
    expiresAt: (p.at || 0) + TTL_MS,
    outcome: outcomeOf(p, { now }),
  };
  m.sig = JSON.stringify([m.fate, m.head, m.request, m.headers, m.body, m.bodyBytes, m.bodySha, m.tier, m.sensitive, m.always, m.outcome]);
  return m;
}

/** THE FOR-YOU ITEM (origin `channels`) — one per proposal (ACTION_IDENTITY `id`); its Approve names the frozen digest. */
function forYouOf(p) {
  const who = whoOf(p), call = `${p.method} ${p.host}${p.path}`, cred = p.credLabel || p.cred;
  return {
    origin: 'channels', urgency: 'normal', by: 'agent', sessionName: 'Channels',
    text: `${who} wants to call ${cred}'s API: ${p.method} ${p.path}`,
    detail: `${call}${p.bodyBytes ? ` · body ${sizeText(p.bodyBytes)}` : ''}${p.sensitive ? ` · sensitive: ${p.sensitive}` : ''} — expires 24 h after it was asked`,
    i18n: {
      text: { key: "{name} wants to call {cred}'s API: {call}", params: { name: who, cred, call: `${p.method} ${p.path}` } },
      detail: [{ key: '{call} — expires 24 h after it was asked', params: { call } }],
      source: { key: 'Channels' },
    },
    action: { type: 'channel-api-proposal', id: String(p.id), shown: p.digest || null },
  };
}

/** The resolved For-you row's fact (user-todos resolveAnswered) — the outcome, not "done". */
function resolvedFactOf(p) { const o = outcomeOf(p); return { apiOutcome: { key: o.key, params: o.params } }; }

/** THE RECEIPT the agent reads on its next turn (the outbox receipts' stash) — `api wait` is a convenience, not the only way. */
function receiptText(p) {
  const f = fateOf(p), r = p.result || {};
  const what = `API proposal ${p.id} (${p.method} ${p.host}${p.path} on ${p.credLabel || p.cred})`;
  const tail = `\`vibespace-channels api wait ${p.id}\` prints the full answer`;
  if (f === 'ran') return `${what}: the user approved it and it RAN — HTTP ${r.status || 0}, ${sizeText(r.bytes)}. ${tail}.`;
  if (f === 'rejected') return `${what}: REJECTED by ${p.decidedBy && p.decidedBy !== 'user' ? p.decidedBy : 'the user'}${p.reason ? ` — "${String(p.reason).slice(0, 300)}"` : ''}. Nothing ran.`;
  if (f === 'expired') return `${what}: EXPIRED — unanswered for 24 h. Nothing ran; ask again if it is still needed.`;
  if (f === 'withdrawn') return `${what}: WITHDRAWN — ${p.reason || 'access ended'}. Nothing ran.`;
  if (f === 'failed') return `${what}: approved but NOT run — ${(r && r.error) || p.reason || 'failed'}.`;
  return null;   // pending / running: nothing to tell yet
}

/** THE SWEEP'S VERDICTS (PURE): which pending proposals end now, and how. `live(p)` → null | a reason the access ended. */
function sweepVerdicts(list, { now = Date.now(), live = () => null } = {}) {
  const out = [];
  for (const p of list || []) {
    if (!p || p.status !== 'pending') continue;
    const gone = live(p);
    if (gone) out.push({ id: p.id, by: SWEEP_BY.withdrawn, reason: String(gone) });
    else if (now - (Number(p.at) || 0) >= TTL_MS) out.push({ id: p.id, by: SWEEP_BY.expired, reason: 'unanswered for 24 h' });
  }
  return out;
}

module.exports = { TTL_MS, BODY_SHOWN, FATES, SWEEP_BY, fateOf, sizeText, outcomeOf, cardModel, forYouOf, resolvedFactOf, receiptText, sweepVerdicts };
