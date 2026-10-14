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

const W = require('./api-call-words.js');

const TTL_MS = 24 * 60 * 60 * 1000;     // a pending proposal expires after 24 h unanswered (said on the card and to the agent)
const BODY_SHOWN = 2048;                // the card's 技术细节 fold shows the body (pretty-printed) up to 2 KB, then 「…」
const NOTE_MAX = 200;                   // the agent's own `--why`, quoted under the title
const WHO_MAX = 24;
/** THE POLICY'S WORD as a chip (card grammar ③) — why it always asks, never a sentence. */
const SENSITIVE_CHIP = Object.freeze({ delete: 'Delete · always asks', path: 'Sensitive path · always asks', 'large-body': 'Large body · always asks', upload: 'Upload · always asks' });
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
const prettyBody = (b) => { const s = String(b); try { const j = JSON.parse(s); return j && typeof j === 'object' ? JSON.stringify(j, null, 2) : s; } catch { return s; } };
const noteOf = (p) => { const s = p && typeof p.note === 'string' ? p.note.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : ''; return s ? s.slice(0, NOTE_MAX) : null; };

/** THE TITLE (card grammar ①②): actor + verb + NAMED object — `{name} wants to {what}`, `what` from the PURE words
 *  table (src/api-call-words.js); `object` = the named thing (the record's resolved name / conversation, else the id
 *  shortened to 8 chars). Never the raw path. */
/** The always-allow button's phrase: the title's verb + object, or "call the <vendor> API" (no method, no path). */
function alwaysWhat(p) {
  const w = W.wordsOf(p);
  return w.row ? { key: w.key, params: w.params, text: w.text || null } : { key: 'call the {vendor} API', params: { vendor: w.params.vendor } };
}
function titleOf(p) {
  const w = W.wordsOf(p);
  const who = String(whoOf(p)); const name = who.length > WHO_MAX ? `${who.slice(0, WHO_MAX - 1)}…` : who;
  return { key: '{name} wants to {what}', params: { name }, what: { key: w.key, params: w.params, text: w.text || null }, row: w.row,
    object: W.objectView(w.object, { name: p.objectName || null, conv: p.objectConv || null }) };
}

/** THE TITLE AS PLAIN TEXT — the card's tooltip / Outbox row (src/lib/channel-api-card-view.js titleText), the For-you
 *  row's sentence (src/lib/user-todos-actions.js wordsOf) and the agent's English item text: `{object}` = its name, else
 *  its id shortened. `t` = the surface's translator (the default fills the English key), `lang` picks a generated row's
 *  own phrase. PURE. */
const fill = (s, params = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
function titleWords(h, { t = fill, lang = 'en' } = {}) {
  const o = h.object;
  const what = t(h.what.text ? h.what.text[lang] || h.what.text.en : h.what.key, { ...h.what.params, object: o ? o.name || o.short || '' : '' });
  return t(h.key, { ...h.params, what });
}

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
  const body = p.body == null ? null : String(prettyBody(p.body)).slice(0, BODY_SHOWN);
  const m = {
    id: p.id, fate, actionable: fate === 'pending', conv: p.conv || null,
    head: titleOf(p), note: noteOf(p), cred: p.credLabel || p.cred || null,
    request: { method: p.method, host: p.host, path: p.path, query: q },
    headers: Object.entries(p.headers || {}).map(([k, v]) => `${k}: ${v}`),
    body, bodyMore: p.body != null && String(prettyBody(p.body)).length > BODY_SHOWN, bodyBytes: Number(p.bodyBytes) || 0, bodySha: p.bodySha || null,
    tier: p.tier || null,
    sensitive: p.sensitive ? { key: SENSITIVE_CHIP[p.sensitive] || 'Sensitive · always asks', params: {} } : null,
    // D2: "always allow" only for a non-sensitive write. Its BUTTON says the plain phrase (the words table's, or "call the
    // <vendor> API" for an unknown call); the exact shape it will allow is drawn in the 技术细节 fold (card grammar ④)
    always: p.offersAlways && !p.sensitive && p.shape ? { key: 'Run and never ask again ({what})', params: { shape: p.shape }, what: alwaysWhat(p) } : null,
    expiresAt: (p.at || 0) + TTL_MS,
    outcome: outcomeOf(p, { now }),
  };
  m.sig = JSON.stringify([m.fate, m.head, m.note, m.request, m.headers, m.body, m.bodyBytes, m.bodySha, m.tier, m.sensitive, m.always, m.outcome]);
  return m;
}

/** THE FOR-YOU ITEM (origin `channels`) — one per proposal (ACTION_IDENTITY `id`); its Approve names the frozen digest.
 *  Card grammar (lane card-grammar-exceptions): its sentence is the CARD's title — `card.head`, worded on each device
 *  (titleWords) —, its plan line the account + the expiry, its policy a chip (`card.chip`); the raw call (method + URL,
 *  the body's size + sha256) rides `card.tech`, drawn under ONE collapsed 技术细节 fold. `text` / `detail` are the
 *  agent's English (the store's dedupe key); `i18n.text` the fallback of a device that cannot word the card. */
function forYouOf(p) {
  const call = `${p.method} ${p.host}${p.path}`, cred = p.credLabel || p.cred;
  const head = titleOf(p), m = cardModel(p);
  const url = `${p.method} https://${p.host}${p.path}${m.request.query ? `?${m.request.query}` : ''}`;
  return {
    origin: 'channels', urgency: 'normal', by: 'agent', sessionName: 'Channels',
    text: titleWords(head),
    detail: `${call}${p.bodyBytes ? ` · body ${sizeText(p.bodyBytes)}` : ''}${p.sensitive ? ` · sensitive: ${p.sensitive}` : ''} — expires 24 h after it was asked`,
    i18n: {
      text: { key: head.key, params: { ...head.params, what: titleWords({ ...head, key: '{what}', params: {} }) } },
      detail: [{ key: '{cred} · expires 24 h after it was asked', params: { cred } }],
      source: { key: 'Channels' },
    },
    card: { kind: 'api-call', head, chip: m.sensitive, tech: [url.slice(0, 2000), ...(m.bodyBytes || m.bodySha ? [`body ${sizeText(m.bodyBytes)}${m.bodySha ? ` · sha256 ${m.bodySha}` : ''}`] : [])] },
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

module.exports = { TTL_MS, BODY_SHOWN, NOTE_MAX, SENSITIVE_CHIP, FATES, SWEEP_BY, fateOf, sizeText, outcomeOf, titleOf, titleWords, cardModel, forYouOf, resolvedFactOf, receiptText, sweepVerdicts };
