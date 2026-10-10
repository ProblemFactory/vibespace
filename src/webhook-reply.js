'use strict';
/**
 * WHO A WEBHOOK REPLY GOES TO — PURE (imports channel-policy for the recipient ceiling + webhook-record for the author
 * reader; lane webhook-l1-server, docs/design-webhook.zh.md §7). The owner is the ONLY identity on this side: an agent's
 * reply goes out as the owner, to a caller the reply's own anchor names — never to a caller the text names.
 *
 *   reply … --to <record id>     ⇒ that record's author caller (a record of another path / none ⇒ `not-found`
 *                                  `reply-anchor-elsewhere`; a revoked caller ⇒ `send-not-available`, naming the live ones)
 *   reply … (no --to)            ⇒ the path's one caller; several ⇒ `ambiguous-caller` listing them (nothing is sent)
 *   compose --caller <id>[,<id>]|all ⇒ ONE proposal per caller (`all` = every live caller that can receive; a named
 *                                  caller whose delivery is `none` is refused by name), at most COMPOSE_MAX_RECIPIENTS
 */
const { COMPOSE_MAX_RECIPIENTS } = require('./channel-policy.js');
const { callerOfRecord } = require('./webhook-record.js');

const DELIVERY_MODES = Object.freeze(['none', 'reply-url', 'poll']);
const live = (callers) => (Array.isArray(callers) ? callers : []).filter((c) => c && typeof c.id === 'string' && !c.revokedAt);
const view = (c) => ({ id: c.id, name: String(c.name || c.id).slice(0, 80), delivery: DELIVERY_MODES.includes(c.delivery && c.delivery.mode) ? c.delivery.mode : 'none' });
const no = (code, why, error, extra = {}) => ({ ok: false, code, why, error, ...extra });
const names = (list) => list.map((c) => `${c.name} (${c.id})`).join(', ');

/** `{ok:true, caller}` | `{ok:false, code, why, error, callers?}` for a reply on `convId`. `anchor` = the stored record the
 *  reply answers (null = none found); `implicit` = the engine chose the newest record (no `--to`). */
function replyTarget({ anchor = null, anchorId = null, convId = '', callers = [], implicit = false } = {}) {
  const alive = live(callers).map(view);
  if (!implicit) {
    if (!anchor || String(anchor.convId) !== String(convId)) return no('not-found', 'reply-anchor-elsewhere', `${String(anchorId || '').slice(0, 80) || 'that record'} is not a call on this path`);
    const id = callerOfRecord(anchor);
    const hit = id ? alive.find((c) => c.id === id) : null;
    if (!hit) return no('send-not-available', 'caller-revoked', `the caller that sent that record is no longer registered on this path${alive.length ? ` — the live callers: ${names(alive)}` : ''}`, { callers: alive });
    if (hit.delivery === 'none') return no('send-not-available', 'delivery-none', `${names([hit])} takes no replies (its delivery is none)`, { callers: alive });
    return { ok: true, caller: hit };
  }
  if (!alive.length) return no('send-not-available', 'no-caller', 'this path has no registered caller to reply to', { callers: [] });
  if (alive.length > 1) return no('bad-proposal', 'ambiguous-caller', `this path has ${alive.length} callers — reply to one of their records with --to <record id>, or compose --caller <id>|all: ${names(alive)}`, { callers: alive });
  if (alive[0].delivery === 'none') return no('send-not-available', 'delivery-none', `${names(alive.slice(0, 1))} takes no replies (its delivery is none)`, { callers: alive });
  return { ok: true, caller: alive[0] };
}

/** `compose --caller` → `{ok:true, callers, skipped}` (one proposal each) | a refusal naming the caller. */
function composeTargets({ spec, callers = [] } = {}) {
  const alive = live(callers).map(view);
  const all = new Map((Array.isArray(callers) ? callers : []).filter((c) => c && typeof c.id === 'string').map((c) => [c.id, c]));
  const raw = Array.isArray(spec) ? spec.map(String) : String(spec == null ? '' : spec).split(',');
  const want = [...new Set(raw.map((x) => x.trim()).filter(Boolean))];
  if (!want.length) return no('bad-proposal', 'caller-required', 'name the caller(s) to send to: --caller <id>[,<id>] or --caller all');
  let out = [], skipped = [];
  if (want.length === 1 && want[0] === 'all') {
    out = alive.filter((c) => c.delivery !== 'none');
    skipped = alive.filter((c) => c.delivery === 'none');
    if (!out.length) return no('send-not-available', alive.length ? 'delivery-none' : 'no-caller', alive.length ? `no caller on this path takes replies (${names(skipped)} — delivery none)` : 'this path has no registered caller', { callers: alive });
  } else {
    for (const id of want) {
      const c = all.get(id);
      if (!c) return no('not-found', 'unknown-caller', `${id.slice(0, 40)} is not a caller of this path${alive.length ? ` — the live callers: ${names(alive)}` : ''}`, { callers: alive });
      if (c.revokedAt) return no('send-not-available', 'caller-revoked', `${names([view(c)])} was revoked`, { callers: alive });
      if (view(c).delivery === 'none') return no('send-not-available', 'delivery-none', `${names([view(c)])} takes no replies (its delivery is none)`, { callers: alive });
      out.push(view(c));
    }
  }
  if (out.length > COMPOSE_MAX_RECIPIENTS) return no('bad-proposal', 'too-many', `at most ${COMPOSE_MAX_RECIPIENTS} callers in one compose (${out.length} named)`);
  return { ok: true, callers: out, skipped };
}

/** THE ENVELOPE a webhook reply carries (stored on the proposal, handed back verbatim to `send`): `to` = the caller id,
 *  `inReplyTo` = the answered record's vendorId (null for a composed message) — the wire carries the caller's own
 *  receipt id, never this. */
function envelopeOf({ anchorId = '', callerId, recordVendorId = null }) {
  return { anchorId: String(anchorId || ''), to: String(callerId), subject: '', inReplyTo: recordVendorId ? String(recordVendorId) : null };
}

module.exports = { DELIVERY_MODES, replyTarget, composeTargets, envelopeOf };
