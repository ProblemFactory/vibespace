// THE WEBHOOK OWNER SURFACE'S WORDS AND MODELS (lane webhook-l2-ui, docs/design-webhook.zh.md §12 L2) — DOM-free, so the
// fast suite runs them in node (test-webhook-ui). The dialogs live in channel-webhook.js.
//
// - The slug is judged by the SERVER'S OWN PURE rule (src/webhook-auth.js `slugProblem`): one rule, two doors.
// - A caller row never carries a token: the register / rotate answer hands its token to showTokenOnce ALONE.
// - Gated on the capability row (`pushTransport: 'http-inbound'`), never on an adapter's kind.
import { t as tDevice, deviceLocale } from './i18n.js';
import * as WA from '../webhook-auth.js';

/** An account whose capability row declares an inbound door offers paths and callers. */
export const offersPaths = (a) => !!(a && a.pushTransport === 'http-inbound');
/** lane webhook-section-place (the owner, 2026-10-12: "webhook应该保持在列表最后或者顶部，因为不是自由添加的"): THE ACCOUNT
 *  SECTIONS' ORDER — the person's own accounts first, in the order they arrive; then every account whose capability row
 *  is an inbound door (built in: no sign-in, not removable, never freely added), in theirs. The ONE place the Accounts
 *  part orders its sections (the agents watcher keeps its own part). */
export function accountSectionOrder(accounts) {
  const list = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
  return [...list.filter((a) => !offersPaths(a)), ...list.filter(offersPaths)];
}
export const AUTH_MODES = Object.freeze(['hmac', 'bearer']);   // HMAC first: the default
export const DELIVERY_MODES = Object.freeze(['none', 'reply-url', 'poll']);
export const WAKES_DEFAULT = 6;
export const RATE_DEFAULT = WA.RATE_DEFAULT;

/** The wizard's live slug words: `null` for a good slug, else why it is refused (the create route refuses the same). */
export function slugText(slug, { t = tDevice } = {}) {
  const p = WA.slugProblem(slug);
  if (!p) return null;
  if (p === 'reserved') return t('"{slug}" is reserved — pick another name', { slug: String(slug) });
  return String(slug || '') ? t('Use 1–63 of a-z, 0-9 and - (starting with a letter or digit)') : t('Name the path — it becomes the address /hook/<name>');
}

export function authText(auth, { t = tDevice } = {}) { return auth === 'bearer' ? t('Bearer token') : t('HMAC-signed'); }
/** verify r1 #3 (int248 r2): a Bearer caller's two LIMITS — said beside the Signing picker and in its token-once dialog. */
export function bearerLimitsText({ t = tDevice } = {}) { return [t('Bearer has no replay protection: a captured call can be sent again under a new Idempotency-Key — use HMAC for a system that can sign, and for a path that wakes an agent.'), t('Replies to its reply URL are signed X-Webhook-Signature v1=HMAC-SHA256(sha256(token), timestamp + ".POST.<reply path>." + body).')]; }
/** verify r1 #14 (int248 r2): the owner's card names a call whose body was cut at 8 KiB (design §5) — '' for any other. */
export function rawCutText(raw, { t = tDevice } = {}) { return raw && typeof raw === 'object' && raw.cut === true ? t('raw cut at 8 KiB ({n} bytes received)', { n: Number(raw.bytes) || 0 }) : ''; }
export function deliveryText(d, { t = tDevice } = {}) {
  const m = d && d.mode;
  if (m === 'reply-url') return t('Replies are POSTed to {url}', { url: String(d.replyUrl || '') });
  if (m === 'poll') return t('Replies wait for it to fetch them');
  return t('Takes no replies');
}
const when = (at, t) => (Number(at) > 0 ? new Date(Number(at)).toLocaleString(deviceLocale()) : t('never'));

/** One caller as the panel lists it — named fields only (a `token` handed in is never read). */
export function callerRow(c, { t = tDevice } = {}) {
  const d = (c && c.delivery) || { mode: 'none' };
  return {
    id: String(c.id), name: String(c.name || c.id), kind: c.kind === 'peer' ? 'peer' : 'system',
    auth: authText(c.auth, { t }), delivery: deliveryText(d, { t }), mode: DELIVERY_MODES.includes(d.mode) ? d.mode : 'none', replyUrl: d.replyUrl || '',
    revoked: !!c.revokedAt,
    facts: [
      t('registered {at}', { at: when(c.registeredAt, t) }),
      ...(c.rotatedAt ? [t('rotated {at}', { at: when(c.rotatedAt, t) })] : []),
      t('last call {at}', { at: when(c.lastCallAt, t) }),
      ...(c.revokedAt ? [t('revoked {at}', { at: when(c.revokedAt, t) })] : []),
    ],
  };
}

/** "Send a message…"'s caller picker: every live caller; one whose delivery is none is DISABLED WITH ITS REASON. */
export function pickerRows(callers, { t = tDevice } = {}) {
  return (Array.isArray(callers) ? callers : []).filter((c) => c && !c.revokedAt).map((c) => {
    const none = !c.delivery || c.delivery.mode === 'none' || !DELIVERY_MODES.includes(c.delivery.mode);
    return { id: String(c.id), name: String(c.name || c.id), disabled: none, why: none ? t('takes no replies (its delivery is none) — change it in Callers…') : null };
  });
}

/** The budget line (Notify dialog) — `wakeBudget` = the conversation view's `{used, lim}`. */
export function budgetText(slug, b, { t = tDevice } = {}) {
  if (!b || !(Number(b.lim) > 0)) return null;
  return t('path {slug}: {n} / {m} wakes this hour', { slug: String(slug), n: Number(b.used) || 0, m: Number(b.lim) });
}

/** Under the reply box: who the reply goes to — the quoted call's caller, the path's one caller, or how to choose. */
export function replyToText({ quoteWho = '', kind = '', participants = '' } = {}, { t = tDevice } = {}) {
  if (quoteWho) return t('to {name} (caller)', { name: quoteWho });
  if (kind !== 'group' && participants) return t('to {name} (caller)', { name: participants });
  return t('Quote a call to answer its caller — or Send a message… to pick callers');
}

/** "Send a message…"'s outcome, one line per caller: sent / queued for poll / failed with the server's words. */
export function sendOutcomes(r, callers, { t = tDevice } = {}) {
  const by = new Map((Array.isArray(callers) ? callers : []).map((c) => [c.id, c]));
  if (!r || !Array.isArray(r.proposals)) return [{ type: 'error', text: (r && r.error) || t('The send failed') }];
  return r.proposals.map((p) => {
    const c = by.get(p.recipient) || { name: p.recipient };
    const st = p.proposal && p.proposal.state;
    if (st === 'sent') return c.delivery && c.delivery.mode === 'poll' ? { type: 'info', text: t('Queued for {name} to fetch', { name: c.name }) } : { type: 'info', text: t('Sent to {name}', { name: c.name }) };
    if (st === 'awaiting-approval') return { type: 'info', text: t('{name}: held in the outbox for your approval', { name: c.name }) };
    return { type: 'error', text: t('{name}: {why}', { name: c.name, why: (p.proposal && p.proposal.reason) || p.error || st || '?' }) };
  });
}

/* ── lane webhook-pair-join (B-5ee0 a): THE PAIRING DOORS' WORDS — the join box's read of a code (the route's `check`), each
 *  refusal BY NAME (the route's code worded here, so zh / ja say it too), what a finished pairing did, and the shown-once
 *  code's clock. Card grammar: who + verb + what; the caller id and the hook URL stay under Technical details. ── */
const fromOf = (from, t) => String(from || '').trim() || t('The other side');
/** what the paste box says once the server read the code (`check: true`): who offers it, their path, how long it lives */
export function joinPreviewText(ck, { t = tDevice, now = Date.now() } = {}) {
  const n = Math.max(1, Math.ceil((Number(ck && ck.expiresAt) - now) / 60000));
  return t('{from} offers its path {path} ({host}) — this code works once, for {n} more min', { from: fromOf(ck && ck.from, t), path: String((ck && ck.theirPath) || ''), host: String((ck && ck.host) || ''), n });
}
/** what joining does to the path here (made / joined / renewed) */
export function joinPathText(ck, slug, { t = tDevice } = {}) {
  const from = fromOf(ck && ck.from, t), path = String(slug || '');
  if (ck && ck.repair) return t('You are already paired with {from} on {path} — this code renews that pairing', { from, path });
  if (ck && ck.exists) return t('{path} already exists here — {from} joins it as one more caller', { from, path });
  return t('A new path {path} is made here for {from}\'s calls', { from, path });
}
/** THE NAMED REFUSALS — the route's `code` → one sentence (an unknown code: the server's own words) */
export const PAIR_REFUSALS = Object.freeze(['bad-code', 'caller-token', 'expired', 'https-required', 'bad-url', 'no-instance-url', 'code-used', 'code-unknown', 'rate-limited', 'pair-wake-held', 'pair-refused']);
export function joinWhyText(r, { from = '', t = tDevice } = {}) {
  const who = fromOf(from, t);
  switch (r && r.code) {
    case 'bad-code': return t('That is not a VibeSpace pairing code — copy the whole code again (it starts vswp_)');
    case 'caller-token': return t('That is a caller token, not a pairing code — ask the other side for a pairing code (it starts vswp_)');
    case 'expired': return t('This code has expired — a code lives 10 minutes; ask for a new one');
    case 'https-required': return t('The code points at a plain http address — pairing needs https (or allow private reply URLs in Settings)');
    case 'bad-url': return t('The code carries an address VibeSpace cannot use — ask for a new code');
    case 'no-instance-url': return t('This VibeSpace has no public address yet — the other side needs one to call back; set the instance URL first');
    case 'code-used': return t('{from} says this code was already used — ask {from} for a new one', { from: who });
    case 'code-unknown': return t('{from} does not know this code — it expired there, a newer code replaced it, or it was altered; ask for a new one', { from: who });
    case 'rate-limited': return t('{from} is refusing calls from this address for now — try again in a few minutes', { from: who });
    case 'pair-wake-held': return t('{from}\'s path now wakes an agent — a code not made on its owner\'s page is refused there; ask {from} for a new code from their page', { from: who });   // lane wake-approve-card r6: the gate judges at completion
    default: return t('The pairing did not complete: {why}', { why: (r && r.error) || t('no answer') });
  }
}
/** the mint door's refusal (no instance URL, an http one…): a named code worded, else the server's own words */
export function mintWhyText(r, { t = tDevice } = {}) { return PAIR_REFUSALS.includes(r && r.code) ? joinWhyText(r, { t }) : String((r && r.error) || t('no answer')); }
/** what a finished join did — the path, who calls it, where replies go */
export function joinDoneText(r, { from = '', t = tDevice } = {}) {
  const who = fromOf(from, t), path = String((r && r.path && r.path.slug) || '');
  return r && r.repaired ? t('Pairing with {from} renewed on path {path} — the old tokens no longer work', { from: who, path })
    : t('Paired with {from} — its calls land in path {path}, and your replies go back to it', { from: who, path });
}
/** the shown-once code's clock: "Works once · expires in 9:41", then "Expired — make a new code" (null) */
export function codeClockText(expiresAt, { t = tDevice, now = Date.now() } = {}) {
  const left = Math.ceil((Number(expiresAt) - now) / 1000);
  if (!(left > 0)) return null;
  return t('Works once · expires in {time}', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` });
}
