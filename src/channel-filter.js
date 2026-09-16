'use strict';
/**
 * THE FILTER, THE ASSIGNMENT MODEL, AND WHAT AN AGENT IS HANDED
 * (docs/design-communication-panel.zh.md §7 — PURE; imports only the PURE
 * record module for its frame neutering).
 *
 * Three things live here and nothing else, because everything after
 * `store.append` is PURE except the two ORCH calls at the end (§6.1), so the
 * whole money-adjacent decision chain is unit-testable without a server:
 *
 *  · `matchRecord(filter, record, ctx)` → `{ hit, why[] }`. The rule kinds are
 *    a CLOSED set (`RULE_KINDS`); adding one is one row here and one truth
 *    table in scripts/test-channel-filter.mjs. **`why` IS A CONTRACT, NOT
 *    PROSE**: the wake an agent receives names the rule that fired and the
 *    panel shows the same string — a wake that cannot say why is a wake
 *    nobody can tune (the same law as the approval card's "why" and
 *    auto-resume's named refusal).
 *  · `estimate(filter, records, opts)` is HONEST ABOUT ITS WINDOW: when the
 *    reader stopped at its cap before reaching the window's start it says
 *    `sampled`; when the corpus is shorter than the window it says
 *    `truncated` and rates over the span it actually saw. An estimate that
 *    quietly read 200 of 2,000 records is worse than none, because the user
 *    is about to authorize a PAID RATE on the strength of it (§7.1).
 *  · The ASSIGNMENT (§7.3): `{principal, mode, filterId, notify,
 *    digestMinutes, authority, dailyWakeCap}`. `authority:'send'` is capped
 *    by TWO things separately — channel policy (review ⇒ not selectable, and
 *    a stored value is CLAMPED AT READ TIME so a value the policy forbids can
 *    never silently become a permission when the policy is later relaxed)
 *    and capability (`offers(...)` false ⇒ the option is not drawn, with the
 *    reason `caps` gives). Both only narrow, so their order is irrelevant.
 *  · `renderWakeBlock` / `renderDigestBlock` (§7.5): the text an agent is
 *    handed, BUDGETED (the injection channel wraps at 10 KiB and this product
 *    has lost that fight once) and FRAME-INERT — a vendor string is neutered
 *    through `inertFrames` before it is embedded, and every vendor line is
 *    QUOTED so it can never start one of this block's own headings. An
 *    outsider can type `<system-reminder>`; they must never forge a frame in
 *    an agent's context. This is the XSS rule's prompt-injection twin and it
 *    belongs in the PURE renderer, where a unit test can prove it.
 *
 * THREE LAYERS, THREE JOBS (§7.4, written here so nobody folds them): the
 * per-assignment daily wake cap (`paceVerdict`) is PACING; the delivery
 * ladder's per-conversation floor is FLOOD CONTROL; the spend authorizer is
 * THE MONEY BOUND. Only the last is per credential slot and only the last
 * survives a restart. This module owns the first and knows nothing of the
 * other two.
 */
const { inertFrames } = require('./channel-record.js');

/** The CLOSED rule set. A kind outside it is refused by `validateFilter`. */
const RULE_KINDS = Object.freeze(['mention', 'keyword', 'sender-in-group', 'from-address', 'subject', 'has-attachment', 'not-contains', 'time-window']);
const MATCH_MODES = Object.freeze(['any', 'every']);
const PRINCIPAL_KINDS = Object.freeze(['agent', 'group']);
const ASSIGN_MODES = Object.freeze(['all', 'filtered']);
const NOTIFY_MODES = Object.freeze(['wake', 'digest']);
const AUTHORITIES = Object.freeze(['draft', 'send']);

/** Defaults the model owns (the design's numbers, one home). */
const DEFAULT_DIGEST_MINUTES = 30;
const MIN_DIGEST_MINUTES = 5;
const MAX_DIGEST_MINUTES = 24 * 60;
const DEFAULT_DAILY_WAKE_CAP = 40;
const MAX_DAILY_WAKE_CAP = 1000;
const DAY_MS = 24 * 3600 * 1000;

/** §7.5's budget: records per block, chars per record, and the whole block's
 *  byte ceiling (comfortably under the hook channel's 10 KiB wrap, leaving
 *  room for the task context that rides the same injection). */
const BLOCK_MAX_RECORDS = 6;
const BLOCK_MAX_CHARS = 400;
const BLOCK_MAX_BYTES = 4096;

const lower = (v) => String(v === null || v === undefined ? '' : v).toLowerCase();
const str = (v) => (v === null || v === undefined ? '' : String(v));

// ── rules ──────────────────────────────────────────────────────────────────

/** `HH:MM` → minutes since midnight, or null. */
function hhmm(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(v).trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Validate ONE rule. Returns `{ok:true, rule}` (normalized) or `{ok:false,
 * error}` naming the field — refused at the editor and at the route, never
 * discovered at match time.
 */
function validateRule(rule) {
  const r = rule && typeof rule === 'object' ? rule : null;
  if (!r) return { ok: false, error: 'a rule must be an object' };
  if (!RULE_KINDS.includes(r.kind)) return { ok: false, error: `rule kind must be one of ${RULE_KINDS.join('|')} (got ${JSON.stringify(r.kind)})` };
  const out = { kind: r.kind };
  switch (r.kind) {
    case 'mention': {
      const v = str(r.value).trim().replace(/^@/, '');
      if (!v) return { ok: false, error: 'mention: value (a name or id, with or without @) is required' };
      out.value = v.slice(0, 200); break;
    }
    case 'keyword': case 'not-contains': case 'from-address': case 'subject': {
      const v = str(r.value).trim();
      if (!v) return { ok: false, error: `${r.kind}: value is required` };
      out.value = v.slice(0, 500); break;
    }
    case 'sender-in-group': {
      const members = (Array.isArray(r.members) ? r.members : str(r.value).split(',')).map((x) => str(x).trim()).filter(Boolean);
      if (!members.length) return { ok: false, error: 'sender-in-group: members (ids or names) are required' };
      out.members = members.slice(0, 200).map((m) => m.slice(0, 200));
      out.label = str(r.label).trim().slice(0, 100) || null;
      break;
    }
    case 'has-attachment': break;
    case 'time-window': {
      const from = hhmm(r.from), to = hhmm(r.to);
      if (from === null || to === null) return { ok: false, error: 'time-window: from and to must be HH:MM' };
      const off = r.tzOffsetMinutes === undefined || r.tzOffsetMinutes === null || r.tzOffsetMinutes === '' ? 0 : Number(r.tzOffsetMinutes);
      if (!Number.isFinite(off) || Math.abs(off) > 14 * 60) return { ok: false, error: 'time-window: tzOffsetMinutes must be a number within ±840' };
      out.from = str(r.from).trim(); out.to = str(r.to).trim(); out.tzOffsetMinutes = off;
      break;
    }
    default: return { ok: false, error: `unhandled rule kind ${r.kind}` };
  }
  return { ok: true, rule: out };
}

/** Validate a whole filter `{name?, match, rules[]}`. */
function validateFilter(filter) {
  const f = filter && typeof filter === 'object' ? filter : null;
  if (!f) return { ok: false, error: 'a filter must be an object' };
  const match = f.match === undefined ? 'any' : f.match;
  if (!MATCH_MODES.includes(match)) return { ok: false, error: `match must be ${MATCH_MODES.join('|')}` };
  if (!Array.isArray(f.rules) || !f.rules.length) return { ok: false, error: 'a filter needs at least one rule' };
  if (f.rules.length > 50) return { ok: false, error: 'a filter may hold at most 50 rules' };
  const rules = [];
  for (const r of f.rules) {
    const v = validateRule(r);
    if (!v.ok) return v;
    rules.push(v.rule);
  }
  return { ok: true, filter: { name: str(f.name).trim().slice(0, 100) || null, match, rules } };
}

/** The `why` string ONE rule produces — the contract the wake and the panel share. */
function ruleWhy(rule) {
  switch (rule.kind) {
    case 'mention': return `mention @${rule.value}`;
    case 'keyword': return `keyword "${rule.value}"`;
    case 'sender-in-group': return `sender in ${rule.label || 'group'}`;
    case 'from-address': return `from ${rule.value}`;
    case 'subject': return `subject "${rule.value}"`;
    case 'has-attachment': return 'has attachment';
    case 'not-contains': return `does not contain "${rule.value}"`;
    case 'time-window': return `within ${rule.from}-${rule.to}`;
    default: return rule.kind;
  }
}

/** Does ONE rule hit ONE record. `ctx.now` is unused today but every rule
 *  takes the same signature so a new kind never grows a second one. */
function ruleHits(rule, record, ctx) {
  const rec = record || {};
  const author = rec.author || {};
  const text = lower(rec.text);
  switch (rule.kind) {
    case 'mention': {
      const want = lower(rule.value);
      const ms = Array.isArray(rec.mentions) ? rec.mentions : [];
      if (ms.some((m) => m && (lower(m.id) === want || lower(m.name) === want))) return true;
      // a self-mention the adapter resolved into the text (`@name`) counts too
      const selfIds = Array.isArray(ctx && ctx.selfIds) ? ctx.selfIds.map(lower) : [];
      if (selfIds.includes(want) && ms.some((m) => m && (selfIds.includes(lower(m.id)) || selfIds.includes(lower(m.name))))) return true;
      return text.includes('@' + want);
    }
    case 'keyword': return text.includes(lower(rule.value));
    case 'not-contains': return !text.includes(lower(rule.value));
    case 'sender-in-group': {
      const id = lower(author.id), name = lower(author.name);
      return rule.members.some((m) => { const w = lower(m); return w && (w === id || w === name); });
    }
    case 'from-address': {
      const want = lower(rule.value);
      return !!want && (lower(author.id).includes(want) || lower(author.name).includes(want));
    }
    case 'subject': {
      const s = lower(rec.raw && rec.raw.subject);
      return !!s && s.includes(lower(rule.value));
    }
    case 'has-attachment': return Array.isArray(rec.attachments) && rec.attachments.length > 0;
    case 'time-window': {
      const at = Number(rec.at);
      if (!Number.isFinite(at)) return false;
      const local = at + (rule.tzOffsetMinutes || 0) * 60000;
      const minutes = Math.floor((local % DAY_MS + DAY_MS) % DAY_MS / 60000);
      const from = hhmm(rule.from), to = hhmm(rule.to);
      if (from === null || to === null) return false;
      return from <= to ? (minutes >= from && minutes < to) : (minutes >= from || minutes < to);   // a window past midnight wraps
    }
    default: return false;
  }
}

/**
 * THE MATCHER. `{ hit, why[] }` — `why` lists the rule strings that fired
 * (for `every`, all of them; for `any`, the ones that hit). A filter that is
 * null/invalid never hits: fail closed, a wake is money.
 */
function matchRecord(filter, record, ctx = {}) {
  const f = filter && typeof filter === 'object' && Array.isArray(filter.rules) ? filter : null;
  if (!f || !f.rules.length) return { hit: false, why: [] };
  const match = MATCH_MODES.includes(f.match) ? f.match : 'any';
  const why = [];
  let hits = 0;
  for (const rule of f.rules) {
    if (!rule || !RULE_KINDS.includes(rule.kind)) continue;
    if (ruleHits(rule, record, ctx)) { hits++; why.push(ruleWhy(rule)); }
    else if (match === 'every') return { hit: false, why: [] };
  }
  const hit = match === 'every' ? hits === f.rules.length && hits > 0 : hits > 0;
  return { hit, why: hit ? why : [] };
}

// ── the estimate ───────────────────────────────────────────────────────────

/**
 * How many of `records` (the stored history the caller read, any order)
 * the filter would have matched over the last `days`.
 *
 *   sampled    the caller's reader stopped at its cap BEFORE reaching the
 *              window's start (`opts.capHit`) — older records exist unread
 *   truncated  the corpus is shorter than the window: the oldest record is
 *              younger than `now - days`, so the rate is over `windowDays`
 *              (the span actually covered), never over a window we did not see
 *
 * A filter of `null` estimates `mode:'all'` — every record matches.
 */
function estimate(filter, records, { days = 7, now = Date.now(), capHit = false, ctx = {} } = {}) {
  const win = Math.max(1, Number(days) || 7);
  const since = now - win * DAY_MS;
  const list = (Array.isArray(records) ? records : []).filter((r) => r && Number.isFinite(Number(r.at)) && Number(r.at) >= since && Number(r.at) <= now);
  let oldest = null;
  let matched = 0;
  for (const r of list) {
    const at = Number(r.at);
    if (oldest === null || at < oldest) oldest = at;
    if (!filter || matchRecord(filter, r, ctx).hit) matched++;
  }
  const total = list.length;
  // Honest span: a corpus younger than the window rates over what it covers.
  // `truncated` is a claim about the DATA, so it needs at least one record —
  // an empty corpus is "no evidence", and the reader's `capHit` is what says
  // whether more exists.
  const spanDays = oldest === null ? win : Math.max(1 / 24, (now - oldest) / DAY_MS);
  const truncated = oldest !== null && !capHit && spanDays < win * 0.98;
  const windowDays = truncated ? Math.round(spanDays * 100) / 100 : win;
  const per = (n) => Math.round((n / windowDays) * 10) / 10;
  return { matched, total, matchedPerDay: per(matched), totalPerDay: per(total), windowDays, sampled: !!capHit, truncated };
}

// ── the assignment ─────────────────────────────────────────────────────────

/**
 * Validate + normalize an assignment. `caps` are the two READ-TIME facts the
 * authority cap needs: `{ offersSend: boolean, sendWhy, policyRequiresReview:
 * boolean }`. `authority:'send'` is REFUSED when either cap says no — the
 * editor never drew it, so a request carrying it is a stale client or a
 * hand-built call, and both get the named reason back.
 */
function validateAssignment(input, caps = {}) {
  const a = input && typeof input === 'object' ? input : null;
  if (!a) return { ok: false, error: 'an assignment must be an object' };
  const p = a.principal && typeof a.principal === 'object' ? a.principal : null;
  if (!p || !PRINCIPAL_KINDS.includes(p.kind)) return { ok: false, error: `principal.kind must be ${PRINCIPAL_KINDS.join('|')}` };
  const pid = str(p.id).trim();
  if (!pid) return { ok: false, error: 'principal.id is required' };
  const mode = a.mode === undefined ? 'all' : a.mode;
  if (!ASSIGN_MODES.includes(mode)) return { ok: false, error: `mode must be ${ASSIGN_MODES.join('|')}` };
  const filterId = a.filterId === undefined || a.filterId === null ? null : str(a.filterId).trim() || null;
  if (mode === 'filtered' && !filterId) return { ok: false, error: "mode 'filtered' needs a filterId" };
  const notify = a.notify === undefined ? 'wake' : a.notify;
  if (!NOTIFY_MODES.includes(notify)) return { ok: false, error: `notify must be ${NOTIFY_MODES.join('|')}` };
  let digestMinutes = a.digestMinutes === undefined || a.digestMinutes === null || a.digestMinutes === '' ? DEFAULT_DIGEST_MINUTES : Number(a.digestMinutes);
  if (!Number.isFinite(digestMinutes)) return { ok: false, error: 'digestMinutes must be a number' };
  digestMinutes = Math.min(MAX_DIGEST_MINUTES, Math.max(MIN_DIGEST_MINUTES, Math.round(digestMinutes)));
  const authority = a.authority === undefined ? 'draft' : a.authority;
  if (!AUTHORITIES.includes(authority)) return { ok: false, error: `authority must be ${AUTHORITIES.join('|')}` };
  if (authority === 'send') {
    const cap = authorityCap(caps);
    if (cap) return { ok: false, error: `authority 'send' is not available here: ${cap}`, code: 'authority-capped', why: cap };
  }
  let dailyWakeCap = a.dailyWakeCap === undefined || a.dailyWakeCap === null || a.dailyWakeCap === '' ? DEFAULT_DAILY_WAKE_CAP : Number(a.dailyWakeCap);
  if (!Number.isFinite(dailyWakeCap) || dailyWakeCap < 0) return { ok: false, error: 'dailyWakeCap must be a number ≥ 0' };
  dailyWakeCap = Math.min(MAX_DAILY_WAKE_CAP, Math.round(dailyWakeCap));
  // P3 (design §9.3, decision 8): an outbox RECEIPT never wakes the agent by
  // default (it rides the next turn); an assignment may opt in — a billed
  // turn per approval, said out loud in the editor.
  const receiptWake = a.receiptWake === true;
  return {
    ok: true,
    assignment: { principal: { kind: p.kind, id: pid.slice(0, 256), name: str(p.name).trim().slice(0, 200) || null }, mode, filterId, notify, digestMinutes, authority, dailyWakeCap, receiptWake },
  };
}

/** Why `authority:'send'` is capped RIGHT NOW (null = not capped). Policy is
 *  checked first only because its sentence is the more actionable one; both
 *  caps only narrow, so the order cannot change the answer. */
function authorityCap({ offersSend = false, sendWhy = null, policyRequiresReview = true } = {}) {
  if (policyRequiresReview) return 'this channel requires review before anything is sent';
  if (!offersSend) return `sending is not offered on this conversation (${sendWhy || 'unknown'})`;
  return null;
}

/**
 * THE READ-TIME CLAMP (§7.3 (a)). A stored `authority:'send'` the current
 * policy or capability forbids reads as `draft` WITH the reason; the stored
 * bytes are untouched, so relaxing the policy later does not silently mint a
 * permission — the user re-chooses.
 */
function effectiveAuthority(assignment, caps = {}) {
  const a = assignment && typeof assignment === 'object' ? assignment : null;
  if (!a) return { authority: 'draft', clamped: false, why: null };
  if (a.authority !== 'send') return { authority: 'draft', clamped: false, why: null };
  const cap = authorityCap(caps);
  if (cap) return { authority: 'draft', clamped: true, why: cap };
  return { authority: 'send', clamped: false, why: null };
}

/**
 * Round-robin over a group's LIVE members. `cursor` is the index state kept
 * in the index (§7.3); a member list that shrank wraps. No members ⇒ null:
 * the caller STASHES for the next turn, never wakes everybody.
 */
function pickRoundRobin(members, cursor = 0) {
  const list = (Array.isArray(members) ? members : []).filter(Boolean);
  if (!list.length) return { id: null, cursor: Number.isFinite(cursor) ? cursor : 0 };
  const i = ((Number.isFinite(cursor) ? Math.floor(cursor) : 0) % list.length + list.length) % list.length;
  return { id: list[i], cursor: i + 1 };
}

/**
 * PACING (§7.4, layer one): may this assignment wake again now? `wakes` are
 * the recorded wake instants; the cap is per rolling 24 h. A cap of 0 means
 * "digest only, never wake". Refused hits are STASHED, not dropped.
 */
function paceVerdict(wakes, now, cap = DEFAULT_DAILY_WAKE_CAP) {
  const limit = Number.isFinite(Number(cap)) ? Math.max(0, Number(cap)) : DEFAULT_DAILY_WAKE_CAP;
  const since = now - DAY_MS;
  // Only a wake that HAPPENED counts (`ok !== false`): a held or stashed
  // attempt opened no turn, so it must not eat the day's allowance.
  const used = (Array.isArray(wakes) ? wakes : []).filter((w) => w && Number(w.at) > since && w.ok !== false).length;
  if (used >= limit) return { ok: false, why: `daily wake cap reached (${used} of ${limit} in 24 h)`, used, limit };
  return { ok: true, why: null, used, limit };
}

/** Prune a wake/hit ledger to the last 7 days (the panel's measurement
 *  window) and a hard length, so an index row never grows without bound. */
function pruneLedger(list, now, { days = 7, max = 2000 } = {}) {
  const since = now - days * DAY_MS;
  const kept = (Array.isArray(list) ? list : []).filter((w) => Number(w && w.at) > since);
  return kept.length > max ? kept.slice(kept.length - max) : kept;
}

/** Hits in the last `days` from a ledger of `{at, n}`. */
function countSince(list, now, days = 7) {
  const since = now - days * DAY_MS;
  let n = 0;
  for (const w of Array.isArray(list) ? list : []) if (Number(w && w.at) > since) n += Number.isFinite(Number(w.n)) ? Number(w.n) : 1;
  return n;
}

// ── what the agent receives (§7.5) ─────────────────────────────────────────

const bytes = (s) => Buffer.byteLength(String(s), 'utf8');
const clip = (s, n) => { const v = str(s); return v.length > n ? v.slice(0, n - 1) + '…' : v; };
const stamp = (at) => { const d = new Date(Number(at)); return Number.isFinite(d.getTime()) ? d.toISOString().slice(5, 16).replace('T', ' ') + 'Z' : '?'; };

/** ONE vendor line, safe to embed: neutered frames, no leading heading /
 *  list / quote marker of its own (every line is quoted), single-line. */
function safeLine(text, max) {
  const t = inertFrames(clip(str(text).replace(/\r/g, ''), max));
  return t.split('\n').map((l) => '> ' + l).join('\n');
}

function safeInline(text, max) {
  return inertFrames(clip(str(text).replace(/[\r\n\t]+/g, ' '), max));
}

/**
 * The block for ONE wake. `hits` are `[{record, why[]}]` newest-last;
 * `elided` is how many older hits the caller already dropped; `coalesced`
 * (`{n, seconds}`) says "N in this window" when the push lane's window
 * folded a burst (fence 12). Budgeted and frame-inert (see the header).
 */
function renderWakeBlock({ adapterLabel = 'channel', title = '', convId = '', hits = [], elided = 0, coalesced = null, replyHint = true } = {}, { maxRecords = BLOCK_MAX_RECORDS, maxChars = BLOCK_MAX_CHARS, budget = BLOCK_MAX_BYTES } = {}) {
  const list = (Array.isArray(hits) ? hits : []).filter((h) => h && h.record);
  const shown = list.slice(-maxRecords);
  const dropped = list.length - shown.length + (Number(elided) || 0);
  const whys = [...new Set(shown.flatMap((h) => (Array.isArray(h.why) ? h.why : [])))];
  const head = `### Channel message — ${safeInline(adapterLabel, 60)} · ${safeInline(title || convId, 120)}`;
  const lines = [head];
  const meta = [];
  if (whys.length) meta.push(`matched: ${whys.map((w) => safeInline(w, 120)).join(', ')}`);
  if (coalesced && Number(coalesced.n) > 1) meta.push(`${coalesced.n} messages in ${Math.round(Number(coalesced.seconds) || 0)} s, one wake`);
  if (meta.length) lines.push(meta.join(' · '));
  let body = shown.map((h) => {
    const r = h.record;
    const who = safeInline((r.author && (r.author.name || r.author.id)) || 'unknown', 80);
    return `from ${who} at ${stamp(r.at)}\n${safeLine(r.text, maxChars)}`;
  });
  if (dropped > 0) body.push(`(${dropped} older elided)`);
  if (replyHint) body.push(`Reply with: vibespace-channels reply ${safeInline(convId, 200)} "…"   (this PROPOSES; the user approves)`);
  let out = [...lines, ...body].join('\n');
  // Byte budget: drop the OLDEST shown record until it fits (the newest and
  // the hint survive). A block that overflowed the hook's wrap once is why
  // this loop exists.
  let n = shown.length;
  while (bytes(out) > budget && n > 1) {
    n--;
    const cut = shown.slice(shown.length - n);
    const drop2 = list.length - cut.length + (Number(elided) || 0);
    body = cut.map((h) => `from ${safeInline((h.record.author && (h.record.author.name || h.record.author.id)) || 'unknown', 80)} at ${stamp(h.record.at)}\n${safeLine(h.record.text, Math.max(80, Math.floor(maxChars / 2)))}`);
    if (drop2 > 0) body.push(`(${drop2} older elided)`);
    if (replyHint) body.push(`Reply with: vibespace-channels reply ${safeInline(convId, 200)} "…"   (this PROPOSES; the user approves)`);
    out = [...lines, ...body].join('\n');
  }
  return out;
}

/** The digest: many hits, ONE turn. Same budget, same neutering. */
function renderDigestBlock({ adapterLabel = 'channel', title = '', convId = '', hits = [], elided = 0, windowMinutes = DEFAULT_DIGEST_MINUTES } = {}, opts = {}) {
  const list = (Array.isArray(hits) ? hits : []).filter((h) => h && h.record);
  const total = list.length + (Number(elided) || 0);
  const head = `### Channel digest — ${safeInline(adapterLabel, 60)} · ${safeInline(title || convId, 120)} — ${total} message${total === 1 ? '' : 's'} in the last ${Math.round(Number(windowMinutes) || 0)} min`;
  const inner = renderWakeBlock({ adapterLabel, title, convId, hits: list, elided, coalesced: null, replyHint: true }, opts);
  return head + '\n' + inner.split('\n').slice(1).join('\n');
}

/** The "why" sentence the panel and the log share: `matched: a, b`. */
function whyText(why) {
  const w = (Array.isArray(why) ? why : []).filter(Boolean);
  return w.length ? `matched: ${w.join(', ')}` : 'matched: all messages';
}

module.exports = {
  RULE_KINDS, MATCH_MODES, PRINCIPAL_KINDS, ASSIGN_MODES, NOTIFY_MODES, AUTHORITIES,
  DEFAULT_DIGEST_MINUTES, MIN_DIGEST_MINUTES, MAX_DIGEST_MINUTES, DEFAULT_DAILY_WAKE_CAP, MAX_DAILY_WAKE_CAP,
  BLOCK_MAX_RECORDS, BLOCK_MAX_CHARS, BLOCK_MAX_BYTES,
  validateRule, validateFilter, ruleWhy, matchRecord, estimate,
  validateAssignment, authorityCap, effectiveAuthority, pickRoundRobin, paceVerdict, pruneLedger, countSince,
  renderWakeBlock, renderDigestBlock, whyText,
};
