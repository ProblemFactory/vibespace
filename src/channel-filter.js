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
 *  · ACCESS AND NOTIFICATION — TWO OPERATIONS, ACCESS FIRST (§7.3 R4, owner
 *    2026-09-27: "你之前的交互的问题是把'让agent能访问对话'和'让agent会被通知'
 *    耦合在一起了" / "这实际上应该是两种不同的操作，前者是后者的前提"). Every
 *    grain (account / pattern / conversation) holds TWO lists:
 *      ACCESS   `[{principal, authority}]` — who may SEE and ACT (list, read,
 *               search, refresh, reply / compose through the outbox with
 *               that authority). Access alone wakes nobody: no pace ledger,
 *               no digest, nothing billed on its behalf.
 *      WATCHERS `[{principal, notify, mode, filterId, digestMinutes,
 *               dailyWakeCap, receiptWake}]` — who is WOKEN and on what.
 *               A watcher REQUIRES an access row for the same principal at
 *               the same grain (`validateWatchers` refuses one without it,
 *               `watcher-needs-access`; removing the access removes it).
 *    `authority:'send'` (on the ACCESS row) is capped by TWO things
 *    separately — channel policy (review ⇒ not selectable, and a stored
 *    value is CLAMPED AT READ TIME so a value the policy forbids can never
 *    silently become a permission when the policy is later relaxed) and
 *    capability (`offers(...)` false ⇒ the option is not drawn, with the
 *    reason `caps` gives). Both only narrow, so their order is irrelevant.
 *    The pre-split single ASSIGNMENT (`validateAssignment`) survives as the
 *    compatibility write: `splitAssignment` turns it into one access row +
 *    one watcher row, and `grainOf` reads a record written before the split
 *    the same way (MERGED with any lists present, never a fallback).
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
 * per-watcher daily wake cap (`paceVerdict`, one ledger per (principal,
 * scope)) is PACING; the delivery
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
/** THE THREE GRAINS (owner ruling 2026-09-26: a linked account is an
 *  aggregated IM, and the owner gives the whole ACCOUNT, the conversations a
 *  PATTERN matches, or ONE conversation). R4 (2026-09-27): each grain holds
 *  an ACCESS list and a WATCHERS list; PER PRINCIPAL the finest grain that
 *  names it decides (`effectiveGrants` below). */
const ASSIGN_SCOPES = Object.freeze(['conversation', 'pattern', 'account']);
/** The CLOSED `why` codes a `validateAssignment` refusal carries (hotfix
 *  2026-09-26) — the client words each one (src/lib/channel-words.js), never
 *  the English contract sentence. */
const ASSIGN_REFUSALS = Object.freeze(['not-an-object', 'principal', 'mode', 'filter-missing', 'notify', 'digest', 'authority', 'wake-cap', 'scope', 'digest-cap-zero']);
/** R4: the CLOSED route codes an access / watchers refusal carries (the
 *  field inside rides `why`, from ASSIGN_REFUSALS) — channel-words says each. */
const GRANT_REFUSALS = Object.freeze(['bad-access', 'bad-watcher', 'duplicate-principal', 'watcher-needs-access', 'too-many-rows', 'authority-capped']);
/** At most this many rows per list per grain (a refusal names it). */
const MAX_ACCESS_ROWS = 16;
const MAX_WATCHER_ROWS = 16;
/** The CONVERSATION-level rule set a pattern is made of — a closed set APART
 *  from the message-level `RULE_KINDS` (a pattern chooses conversations, a
 *  filter chooses messages inside them). `participant` covers "the chats X
 *  is in" (the participants line or an author seen in the log), `from-address`
 *  an author's address / id (`@domain` = the whole domain), `kind` dm | group
 *  | thread, `title` a keyword in the title. */
const CONV_RULE_KINDS = Object.freeze(['participant', 'title', 'from-address', 'kind']);
const CONV_KINDS = Object.freeze(['dm', 'group', 'thread']);

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

const MAX_RULES = 50;

/** A refusal: the English `error` is the ROUTE'S CONTRACT (the agent CLI
 *  prints it verbatim, test-channel-filter pins its words); the `code` (+
 *  `kind` / `max`) is the same fact as STRUCTURE, which the editor words in
 *  the device's language through `filterProblemText` (a3 i18n — the
 *  validator's sentence used to reach a zh/ja screen on every "Add rule"). */
const refuse = (code, error, extra) => ({ ok: false, code, error, ...(extra || {}) });

/**
 * Validate ONE rule. Returns `{ok:true, rule}` (normalized) or `{ok:false,
 * code, error, kind?}` naming the field — refused at the editor and at the
 * route, never discovered at match time.
 */
function validateRule(rule) {
  const r = rule && typeof rule === 'object' ? rule : null;
  if (!r) return refuse('not-an-object', 'a rule must be an object');
  if (!RULE_KINDS.includes(r.kind)) return refuse('bad-kind', `rule kind must be one of ${RULE_KINDS.join('|')} (got ${JSON.stringify(r.kind)})`, { kind: r.kind });
  const out = { kind: r.kind };
  switch (r.kind) {
    case 'mention': {
      const v = str(r.value).trim().replace(/^@/, '');
      if (!v) return refuse('value-required', 'mention: value (a name or id, with or without @) is required', { kind: r.kind });
      out.value = v.slice(0, 200); break;
    }
    case 'keyword': case 'not-contains': case 'from-address': case 'subject': {
      const v = str(r.value).trim();
      if (!v) return refuse('value-required', `${r.kind}: value is required`, { kind: r.kind });
      out.value = v.slice(0, 500); break;
    }
    case 'sender-in-group': {
      const members = (Array.isArray(r.members) ? r.members : str(r.value).split(',')).map((x) => str(x).trim()).filter(Boolean);
      if (!members.length) return refuse('members-required', 'sender-in-group: members (ids or names) are required', { kind: r.kind });
      out.members = members.slice(0, 200).map((m) => m.slice(0, 200));
      out.label = str(r.label).trim().slice(0, 100) || null;
      break;
    }
    case 'has-attachment': break;
    case 'time-window': {
      const from = hhmm(r.from), to = hhmm(r.to);
      if (from === null || to === null) return refuse('time-format', 'time-window: from and to must be HH:MM', { kind: r.kind });
      const off = r.tzOffsetMinutes === undefined || r.tzOffsetMinutes === null || r.tzOffsetMinutes === '' ? 0 : Number(r.tzOffsetMinutes);
      if (!Number.isFinite(off) || Math.abs(off) > 14 * 60) return refuse('tz-range', 'time-window: tzOffsetMinutes must be a number within ±840', { kind: r.kind });
      out.from = str(r.from).trim(); out.to = str(r.to).trim(); out.tzOffsetMinutes = off;
      break;
    }
    default: return refuse('bad-kind', `unhandled rule kind ${r.kind}`, { kind: r.kind });
  }
  return { ok: true, rule: out };
}

/** Validate a whole filter `{name?, match, rules[]}`. */
function validateFilter(filter) {
  const f = filter && typeof filter === 'object' ? filter : null;
  if (!f) return refuse('not-an-object', 'a filter must be an object');
  const match = f.match === undefined ? 'any' : f.match;
  if (!MATCH_MODES.includes(match)) return refuse('bad-match', `match must be ${MATCH_MODES.join('|')}`);
  if (!Array.isArray(f.rules) || !f.rules.length) return refuse('no-rules', 'a filter needs at least one rule');
  if (f.rules.length > MAX_RULES) return refuse('too-many-rules', `a filter may hold at most ${MAX_RULES} rules`, { max: MAX_RULES });
  const rules = [];
  for (const r of f.rules) {
    const v = validateRule(r);
    if (!v.ok) return v;
    rules.push(v.rule);
  }
  return { ok: true, filter: { name: str(f.name).trim().slice(0, 100) || null, match, rules } };
}

/** A validateRule / validateFilter refusal in WORDS, with the device's `t`
 *  (the a3 rule: the sentence stays the route's contract, the code is what a
 *  screen says). `ruleLabel(kind)` is the editor's own label for a kind, so
 *  the sentence names the rule the way the row does; a code the table does
 *  not know falls back to the contract sentence rather than hiding it. */
function filterProblemText(v, { t = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s)), ruleLabel = (k) => String(k) } = {}) {
  if (!v || v.ok) return '';
  const kind = v.kind ? ruleLabel(v.kind) : '';
  switch (String(v.code || '')) {
    case 'value-required': return t('the rule "{kind}" needs a value', { kind });
    case 'members-required': return t('the rule "{kind}" needs at least one member (ids or names)', { kind });
    case 'time-format': return t('the time window needs both times as HH:MM');
    case 'tz-range': return t('the time-zone offset must be within ±840 minutes');
    case 'no-rules': return t('add at least one rule');
    case 'kind-value': return t('the rule "{kind}" is one of: direct message, group, mail thread', { kind });
    case 'too-many-rules': return t('a filter may hold at most {n} rules', { n: v.max || MAX_RULES });
    default: return String(v.error || v.code || '');
  }
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
 *
 * Every other refusal carries `why` — a code from the CLOSED `ASSIGN_REFUSALS`
 * (hotfix 2026-09-26): the client words the code (channel-words), the English
 * `error` stays the contract. `filter-missing` is a filtered assignment with
 * no filter id — a caller that carries its filter INLINE threads the id it
 * will store it under BEFORE calling this (channels-engine's scope grains).
 */
function validateAssignment(input, caps = {}) {
  const no = (why, error) => ({ ok: false, error, why });
  const a = input && typeof input === 'object' ? input : null;
  if (!a) return no('not-an-object', 'an assignment must be an object');
  const p = a.principal && typeof a.principal === 'object' ? a.principal : null;
  if (!p || !PRINCIPAL_KINDS.includes(p.kind)) return no('principal', `principal.kind must be ${PRINCIPAL_KINDS.join('|')}`);
  const pid = str(p.id).trim();
  if (!pid) return no('principal', 'principal.id is required');
  const mode = a.mode === undefined ? 'all' : a.mode;
  if (!ASSIGN_MODES.includes(mode)) return no('mode', `mode must be ${ASSIGN_MODES.join('|')}`);
  const filterId = a.filterId === undefined || a.filterId === null ? null : str(a.filterId).trim() || null;
  if (mode === 'filtered' && !filterId) return no('filter-missing', "mode 'filtered' needs a filterId");
  const notify = a.notify === undefined ? 'wake' : a.notify;
  if (!NOTIFY_MODES.includes(notify)) return no('notify', `notify must be ${NOTIFY_MODES.join('|')}`);
  let digestMinutes = a.digestMinutes === undefined || a.digestMinutes === null || a.digestMinutes === '' ? DEFAULT_DIGEST_MINUTES : Number(a.digestMinutes);
  if (!Number.isFinite(digestMinutes)) return no('digest', 'digestMinutes must be a number');
  digestMinutes = Math.min(MAX_DIGEST_MINUTES, Math.max(MIN_DIGEST_MINUTES, Math.round(digestMinutes)));
  const authority = a.authority === undefined ? 'draft' : a.authority;
  if (!AUTHORITIES.includes(authority)) return no('authority', `authority must be ${AUTHORITIES.join('|')}`);
  if (authority === 'send') {
    const cap = authorityCap(caps);
    if (cap) return { ok: false, error: `authority 'send' is not available here: ${cap}`, code: 'authority-capped', why: cap };
  }
  let dailyWakeCap = a.dailyWakeCap === undefined || a.dailyWakeCap === null || a.dailyWakeCap === '' ? DEFAULT_DAILY_WAKE_CAP : Number(a.dailyWakeCap);
  if (!Number.isFinite(dailyWakeCap) || dailyWakeCap < 0) return no('wake-cap', 'dailyWakeCap must be a number ≥ 0');
  dailyWakeCap = Math.min(MAX_DAILY_WAKE_CAP, Math.round(dailyWakeCap));
  // R4 verify r5: a digest IS a paced wake — a cap of 0 would never deliver.
  if (notify === 'digest' && dailyWakeCap === 0) return no('digest-cap-zero', 'a digest is a paced wake — set the daily cap to at least 1, or remove the notification');
  // P3 (design §9.3, decision 8): an outbox RECEIPT never wakes the agent by
  // default (it rides the next turn); an assignment may opt in — a billed
  // turn per approval, said out loud in the editor.
  const receiptWake = a.receiptWake === true;
  // 2026-09-26: the GRAIN this assignment was written at (`{kind, id}` —
  // conversation `<adapterId>/<convId>`, account `<adapterId>`, pattern `<id>`).
  // Optional (a pre-grain conversation record has none); an unknown kind is refused.
  let scope = null;
  if (a.scope !== undefined && a.scope !== null) {
    const sc = a.scope && typeof a.scope === 'object' ? a.scope : null;
    if (!sc || !ASSIGN_SCOPES.includes(sc.kind)) return no('scope', `scope.kind must be ${ASSIGN_SCOPES.join('|')}`);
    const sid = str(sc.id).trim();
    if (!sid) return no('scope', 'scope.id is required');
    scope = { kind: sc.kind, id: sid.slice(0, 512) };
  }
  return {
    ok: true,
    assignment: { principal: { kind: p.kind, id: pid.slice(0, 256), name: str(p.name).trim().slice(0, 200) || null }, mode, filterId, notify, digestMinutes, authority, dailyWakeCap, receiptWake, ...(scope ? { scope } : {}) },
  };
}

/** Why `authority:'send'` is capped RIGHT NOW (null = not capped). Policy is
 *  checked first only because its sentence is the more actionable one; both
 *  caps only narrow, so the order cannot change the answer. */
function authorityCap({ offersSend = false, sendWhy = null, policyRequiresReview = true } = {}) {
  const c = authorityCapCode({ offersSend, sendWhy, policyRequiresReview });
  return c ? authorityCapText(c) : null;
}
/** The same cap as STRUCTURE (a3 i18n): `{code:'policy-review'}` or
 *  `{code:'send-not-offered', sendWhy}` — the client words it with its own
 *  `t` (+ channel-caps' `sendWhyText` for the reason); the route's `error`
 *  and the stored `authorityWhy` keep the English sentence as the contract. */
function authorityCapCode({ offersSend = false, sendWhy = null, policyRequiresReview = true } = {}) {
  if (policyRequiresReview) return { code: 'policy-review', sendWhy: null };
  if (!offersSend) return { code: 'send-not-offered', sendWhy: sendWhy || 'unknown' };
  return null;
}
function authorityCapText(cap, { t = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s)), sendWhyText = (w) => String(w || 'unknown') } = {}) {
  if (!cap) return '';
  if (cap.code === 'policy-review') return t('this channel requires review before anything is sent');
  if (cap.code === 'send-not-offered') return t('sending is not offered on this conversation ({why})', { why: sendWhyText(cap.sendWhy || 'unknown', { t }) });
  return String(cap.code || '');
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
  const cap = authorityCapCode(caps);
  if (cap) return { authority: 'draft', clamped: true, why: authorityCapText(cap), whyCap: cap };
  return { authority: 'send', clamped: false, why: null };
}

// ── R4: ACCESS and WATCHERS — two lists per grain, access first ─────────

/** `kind:id` — the ONE identity of a principal inside a grain's lists. */
function principalKey(p) {
  return p && typeof p === 'object' && PRINCIPAL_KINDS.includes(p.kind) && str(p.id).trim() ? `${p.kind}:${str(p.id).trim()}` : null;
}
function cleanPrincipal(p0) {
  const p = p0 && typeof p0 === 'object' ? p0 : null;
  if (!p || !PRINCIPAL_KINDS.includes(p.kind)) return refuse('bad-principal', `principal.kind must be ${PRINCIPAL_KINDS.join('|')}`);
  const pid = str(p.id).trim();
  if (!pid) return refuse('bad-principal', 'principal.id is required');
  return { ok: true, principal: { kind: p.kind, id: pid.slice(0, 256), name: str(p.name).trim().slice(0, 200) || null } };
}
const principalWords = (p) => `${p.kind} ${p.name || p.id}`;

/**
 * ONE ACCESS row `{principal, authority}` — who may see and act. `caps` are
 * the authority cap's two facts (see `authorityCap`); `authority:'send'` is
 * refused where they say no (`authority-capped`, the reason named).
 */
function validateAccessRow(input, caps = {}) {
  const a = input && typeof input === 'object' ? input : null;
  if (!a) return refuse('bad-access', 'an access row must be an object {principal, authority}', { why: 'not-an-object' });
  const pv = cleanPrincipal(a.principal);
  if (!pv.ok) return { ...pv, code: 'bad-access', why: 'principal' };
  const authority = a.authority === undefined || a.authority === null ? 'draft' : a.authority;
  if (!AUTHORITIES.includes(authority)) return refuse('bad-access', `authority must be ${AUTHORITIES.join('|')}`, { why: 'authority' });
  if (authority === 'send') {
    const cap = authorityCap(caps);
    if (cap) return { ok: false, code: 'authority-capped', error: `authority 'send' is not available here: ${cap}`, why: cap, principal: pv.principal };
  }
  return { ok: true, row: { principal: pv.principal, authority } };
}
/** A grain's whole ACCESS list: one row per principal, at most MAX_ACCESS_ROWS. */
function validateAccess(list, caps = {}) {
  if (!Array.isArray(list)) return refuse('bad-access', 'access must be a list of {principal, authority}', { why: 'not-an-object' });
  if (list.length > MAX_ACCESS_ROWS) return refuse('too-many-rows', `a grain holds at most ${MAX_ACCESS_ROWS} access rows`, { max: MAX_ACCESS_ROWS });
  const rows = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const v = validateAccessRow(list[i], caps);
    if (!v.ok) return { ...v, index: i };
    const k = principalKey(v.row.principal);
    if (seen.has(k)) return refuse('duplicate-principal', `${principalWords(v.row.principal)} is listed twice — one access row per agent or group`, { index: i, principal: v.row.principal });
    seen.add(k);
    rows.push(v.row);
  }
  return { ok: true, access: rows };
}

/**
 * ONE WATCHER row — who is WOKEN and on what: `{principal, notify:'wake'|
 * 'digest', mode:'all'|'filtered', filterId, digestMinutes, dailyWakeCap,
 * receiptWake}`. It carries NO authority (that is the access row's). The
 * defaults are the design's numbers.
 */
function validateWatcher(input) {
  const a = input && typeof input === 'object' ? input : null;
  if (!a) return refuse('bad-watcher', 'a watcher must be an object', { why: 'not-an-object' });
  const pv = cleanPrincipal(a.principal);
  if (!pv.ok) return { ...pv, code: 'bad-watcher', why: 'principal' };
  const mode = a.mode === undefined ? 'all' : a.mode;
  if (!ASSIGN_MODES.includes(mode)) return refuse('bad-watcher', `mode must be ${ASSIGN_MODES.join('|')}`, { why: 'mode' });
  const filterId = a.filterId === undefined || a.filterId === null ? null : str(a.filterId).trim() || null;
  if (mode === 'filtered' && !filterId) return refuse('bad-watcher', "mode 'filtered' needs a filterId", { why: 'filter-missing' });
  const notify = a.notify === undefined ? 'wake' : a.notify;
  if (!NOTIFY_MODES.includes(notify)) return refuse('bad-watcher', `notify must be ${NOTIFY_MODES.join('|')}`, { why: 'notify' });
  let digestMinutes = a.digestMinutes === undefined || a.digestMinutes === null || a.digestMinutes === '' ? DEFAULT_DIGEST_MINUTES : Number(a.digestMinutes);
  if (!Number.isFinite(digestMinutes)) return refuse('bad-watcher', 'digestMinutes must be a number', { why: 'digest' });
  digestMinutes = Math.min(MAX_DIGEST_MINUTES, Math.max(MIN_DIGEST_MINUTES, Math.round(digestMinutes)));
  let dailyWakeCap = a.dailyWakeCap === undefined || a.dailyWakeCap === null || a.dailyWakeCap === '' ? DEFAULT_DAILY_WAKE_CAP : Number(a.dailyWakeCap);
  if (!Number.isFinite(dailyWakeCap) || dailyWakeCap < 0) return refuse('bad-watcher', 'dailyWakeCap must be a number ≥ 0', { why: 'wake-cap' });
  dailyWakeCap = Math.min(MAX_DAILY_WAKE_CAP, Math.round(dailyWakeCap));
  // R4 verify r5: a digest IS a paced wake — a cap of 0 would never deliver.
  if (notify === 'digest' && dailyWakeCap === 0) return refuse('bad-watcher', 'a digest is a paced wake — set the daily cap to at least 1, or remove the notification', { why: 'digest-cap-zero' });
  return { ok: true, watcher: { principal: pv.principal, notify, mode, filterId, digestMinutes, dailyWakeCap, receiptWake: a.receiptWake === true } };
}
/**
 * A grain's whole WATCHERS list against ITS OWN access list: one row per
 * principal, and EVERY watcher's principal must hold access at this grain —
 * a watcher without access is refused BY NAME (`watcher-needs-access`):
 * notification is the second operation, access is its prerequisite.
 */
function validateWatchers(list, access = []) {
  if (!Array.isArray(list)) return refuse('bad-watcher', 'watchers must be a list', { why: 'not-an-object' });
  if (list.length > MAX_WATCHER_ROWS) return refuse('too-many-rows', `a grain holds at most ${MAX_WATCHER_ROWS} watchers`, { max: MAX_WATCHER_ROWS });
  const granted = new Set((Array.isArray(access) ? access : []).map((r) => principalKey(r && r.principal)).filter(Boolean));
  const rows = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const v = validateWatcher(list[i]);
    if (!v.ok) return { ...v, index: i };
    const k = principalKey(v.watcher.principal);
    if (seen.has(k)) return refuse('duplicate-principal', `${principalWords(v.watcher.principal)} is listed twice — one notification per agent or group`, { index: i, principal: v.watcher.principal });
    if (!granted.has(k)) return refuse('watcher-needs-access', `${principalWords(v.watcher.principal)} has no access here — grant access first (a notification needs access at the same grain)`, { index: i, principal: v.watcher.principal });
    seen.add(k);
    rows.push(v.watcher);
  }
  return { ok: true, watchers: rows };
}

/**
 * THE COMPATIBILITY WRITE: a pre-split single assignment → ONE access row +
 * ONE watcher row for its principal (the stored extras — timestamps, the
 * estimate, the watcher's own pace ledger — ride along). PURE.
 */
function splitAssignment(a0) {
  const a = a0 && typeof a0 === 'object' ? a0 : null;
  if (!a || !principalKey(a.principal)) return null;
  const principal = { kind: a.principal.kind, id: str(a.principal.id).trim(), name: a.principal.name || null };
  const stamp = { ...(a.createdAt ? { createdAt: a.createdAt } : {}), ...(a.updatedAt ? { updatedAt: a.updatedAt } : {}), ...(a.createdBy ? { createdBy: a.createdBy } : {}) };
  const access = { principal, authority: a.authority === 'send' ? 'send' : 'draft', ...stamp };
  const watcher = {
    principal, notify: NOTIFY_MODES.includes(a.notify) ? a.notify : 'wake', mode: ASSIGN_MODES.includes(a.mode) ? a.mode : 'all', filterId: a.filterId || null,
    digestMinutes: Number.isFinite(Number(a.digestMinutes)) ? Number(a.digestMinutes) : DEFAULT_DIGEST_MINUTES,
    dailyWakeCap: Number.isFinite(Number(a.dailyWakeCap)) ? Number(a.dailyWakeCap) : DEFAULT_DAILY_WAKE_CAP,
    receiptWake: a.receiptWake === true, ...stamp,
    ...(a.estimateAtSet ? { estimateAtSet: a.estimateAtSet } : {}),
    stats: a.stats && typeof a.stats === 'object' ? a.stats : { wakes: [], hits: [] },
  };
  return { access, watcher };
}

/**
 * THE ONE READER of a grain's two lists. A record written before the split
 * (a top-level `principal` on an account / pattern record; `legacy` = a
 * conversation's `assignment`) reads as one access row + one watcher row for
 * its principal — MERGED with the lists already present (a principal the
 * list names is never doubled), never a fallback that hides one of them.
 * Rows without a valid principal are dropped.
 */
function grainOf(rec, legacy = undefined) {
  const r = rec && typeof rec === 'object' ? rec : {};
  const ok = (x) => x && typeof x === 'object' && !!principalKey(x.principal);
  const access = Array.isArray(r.access) ? r.access.filter(ok) : [];
  const watchers = Array.isArray(r.watchers) ? r.watchers.filter(ok) : [];
  const old = legacy !== undefined ? legacy : (r.principal ? r : null);
  const sp = old ? splitAssignment(old) : null;
  if (sp) {
    const k = principalKey(sp.access.principal);
    if (!access.some((x) => principalKey(x.principal) === k)) access.push(sp.access);
    if (!watchers.some((x) => principalKey(x.principal) === k)) watchers.push(sp.watcher);
  }
  // R4 verify r2 (2026-09-27): THE INVARIANT HOLDS AT READ, NOT ONLY AT WRITE.
  // A notification row whose principal holds no access row at this grain (a
  // hand-edited store, a copy from another version — every product write
  // keeps the two lists in ONE update) is INERT: never woken, never listed,
  // never a ledger. `validateWatchers` refuses it by name at write time; the
  // engine's boot census names the rows this drops.
  const granted = new Set(access.map((x) => principalKey(x.principal)));
  return { access, watchers: watchers.filter((w) => granted.has(principalKey(w.principal))) };
}

/** The fields of a pre-split single assignment on an account / pattern
 *  record — what `liftGrainRecord` moves into the two lists. */
const LEGACY_ASSIGNMENT_FIELDS = Object.freeze(['principal', 'mode', 'filterId', 'notify', 'digestMinutes', 'authority', 'dailyWakeCap', 'receiptWake', 'stats', 'estimateAtSet', 'createdBy']);
/**
 * THE MIGRATION'S ROW TRANSFORM for an account / pattern record (PURE): a
 * record carrying a top-level `principal` (the pre-split shape) becomes
 * `{…the grain's own fields, access:[…], watchers:[…]}` — its principal as
 * one access row + one watcher row (the pace ledger rides on the watcher).
 * Anything else is returned unchanged (`changed:false`) — idempotent.
 */
function liftGrainRecord(rec) {
  if (!rec || typeof rec !== 'object' || !rec.principal) return { changed: false, rec };
  const g = grainOf(rec);
  const out = {};
  for (const [k, v] of Object.entries(rec)) if (!LEGACY_ASSIGNMENT_FIELDS.includes(k)) out[k] = v;
  out.access = g.access;
  out.watchers = g.watchers;
  return { changed: true, rec: out };
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
 * NO billed turn at all — a digest window under it is refused like a wake
 * (the Notify dialog's estimate reads 0 wakes/day for it; R4 verify r3).
 * Refused hits are held PENDING, not dropped.
 */
/** THE READ-TIME CAP for a watcher (R4 verify r5): a `notify:'digest'` watcher
 *  with `dailyWakeCap: 0` is now refused at write, but a row stored BEFORE that
 *  refusal existed would never deliver (a digest IS a paced wake — cap 0 means
 *  no billed turn ever, so the window arms and the flush is refused for good).
 *  Such a legacy row is read as cap 1 so it delivers once per window; the store
 *  is NOT rewritten (the engine's boot census names them; the owner sets a real
 *  cap). Every other watcher reads its own cap unchanged. */
function digestCap(w) {
  const cap = w && Number.isFinite(Number(w.dailyWakeCap)) ? Number(w.dailyWakeCap) : DEFAULT_DAILY_WAKE_CAP;
  return (w && w.notify === 'digest' && cap === 0) ? 1 : cap;
}
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

// ── conversation PATTERNS + the effective assignment (2026-09-26) ─────────

/** One pattern rule, validated (a refusal names the field, `code` for the
 *  client's words — the `filterProblemText` shape). */
function validateConvRule(rule) {
  const r = rule && typeof rule === 'object' ? rule : null;
  if (!r) return refuse('bad-rule', 'a rule must be an object');
  if (!CONV_RULE_KINDS.includes(r.kind)) return refuse('bad-kind', `pattern rule kind must be one of ${CONV_RULE_KINDS.join(', ')} (got ${JSON.stringify(r.kind)})`, { kind: r.kind });
  const value = str(r.value).trim();
  if (!value) return refuse('value-required', `a '${r.kind}' rule needs a value`, { kind: r.kind });
  if (r.kind === 'kind' && !CONV_KINDS.includes(value)) return refuse('kind-value', `a 'kind' rule is one of ${CONV_KINDS.join(', ')}`, { kind: r.kind });
  return { ok: true, rule: { kind: r.kind, value: value.slice(0, 200) } };
}
/** A PATTERN: `{match:'any'|'every', rules:[…]}` over conversation facts. An
 *  empty pattern is refused — it would silently hand everything (or nothing)
 *  to an agent, and a wake is money. */
function validatePattern(pattern) {
  const p = pattern && typeof pattern === 'object' ? pattern : null;
  if (!p) return refuse('bad-pattern', 'a pattern must be an object');
  const match = p.match === undefined ? 'any' : p.match;
  if (!MATCH_MODES.includes(match)) return refuse('bad-match', `match must be ${MATCH_MODES.join('|')}`);
  const list = Array.isArray(p.rules) ? p.rules : [];
  if (!list.length) return refuse('no-rules', 'a pattern needs at least one rule');
  if (list.length > MAX_RULES) return refuse('too-many-rules', `at most ${MAX_RULES} rules`);
  const rules = [];
  for (const r of list) { const v = validateConvRule(r); if (!v.ok) return v; rules.push(v.rule); }
  return { ok: true, pattern: { match, rules } };
}
/** Does ONE pattern rule hold for these conversation FACTS
 *  `{title, participants, kind, authors:[{id, name}]}`? → the why string or null. */
function convRuleHit(rule, facts) {
  const f = facts || {};
  const v = lower(rule.value);
  const authors = Array.isArray(f.authors) ? f.authors : [];
  switch (rule.kind) {
    case 'title': return lower(f.title).includes(v) ? `title contains "${rule.value}"` : null;
    case 'participant': return (lower(f.participants).includes(v) || authors.some((a) => lower(a && a.name).includes(v))) ? `participant "${rule.value}"` : null;
    case 'from-address': {
      const hit = v.startsWith('@') ? authors.some((a) => lower(a && a.id).endsWith(v)) : authors.some((a) => lower(a && a.id) === v || lower(a && a.id).includes(v));
      return hit ? `from ${rule.value}` : null;
    }
    case 'kind': return lower(f.kind) === v ? `a ${rule.value} conversation` : null;
    default: return null;
  }
}
function matchConversation(pattern, facts) {
  const p = pattern && Array.isArray(pattern.rules) ? pattern : null;
  if (!p || !p.rules.length) return { hit: false, why: [] };
  const why = [];
  let all = true;
  for (const r of p.rules) { const w = convRuleHit(r, facts); if (w) why.push(w); else all = false; }
  const hit = p.match === 'every' ? all : why.length > 0;
  return { hit, why: hit ? why : [] };
}
/** The chip / block line for a pattern: `title contains "gpu"; from @corp`. */
function patternSummary(pattern) {
  const p = pattern && Array.isArray(pattern.rules) ? pattern : { rules: [] };
  const parts = p.rules.map((r) => (r.kind === 'title' ? `title contains "${r.value}"` : r.kind === 'participant' ? `with ${r.value}` : r.kind === 'from-address' ? `from ${r.value}` : r.kind === 'kind' ? `${r.value} conversations` : `${r.kind} ${r.value}`));
  return parts.join(p.match === 'every' ? ' and ' : '; ');
}
/**
 * THE ONE ANSWER (R4, 2026-09-27): WHO has access to a conversation and WHO
 * watches it. `{conversation, patterns, account}` are the three grains'
 * records (each read through `grainOf`, so a record from before the split
 * counts; `patterns` in any order — ranked by `createdAt`, then id); `facts`
 * the conversation's own facts for the patterns.
 *
 * PER PRINCIPAL, the finest grain that names it decides — separately for the
 * two lists: A's access row on a conversation (say `draft`) wins over A's
 * account row (say `send`) for that conversation only; A's watcher on a rule
 * (its own filter) replaces A's account-wide watcher on the conversations
 * the rule matches. Another principal's rows never mask A's: giving B access
 * to one conversation does not silence A's account-wide notification there.
 *
 * Returns null (nobody) or `{access:[{row, source, patternId, why}],
 * watchers:[{watcher, source, patternId, why}], source, patternId, why}` —
 * `source` = the finest grain holding any row (the row chip's "(account)" /
 * "(rule)").
 */
function effectiveGrants({ conversation = null, patterns = [], account = null } = {}, facts = {}) {
  /* PRECEDENCE: conversation > pattern > account */
  const grains = [];
  grains.push({ source: 'conversation', patternId: null, why: [], g: grainOf(conversation) });
  const ranked = (Array.isArray(patterns) ? patterns : []).filter((x) => x && x.pattern)
    .slice().sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || String(a.id).localeCompare(String(b.id)));
  for (const pa of ranked) {
    const m = matchConversation(pa.pattern, facts);
    if (m.hit) grains.push({ source: 'pattern', patternId: pa.id || null, why: m.why, g: grainOf(pa) });
  }
  grains.push({ source: 'account', patternId: null, why: [], g: grainOf(account) });
  const access = [], watchers = [];
  const seenA = new Set(), seenW = new Set();
  let first = null;
  for (const gr of grains) {
    if (!first && (gr.g.access.length || gr.g.watchers.length)) first = gr;
    for (const row of gr.g.access) {
      const k = principalKey(row.principal);
      if (seenA.has(k)) continue;
      seenA.add(k);
      access.push({ row, source: gr.source, patternId: gr.patternId, why: gr.why });
    }
    for (const w of gr.g.watchers) {
      const k = principalKey(w.principal);
      if (seenW.has(k)) continue;
      seenW.add(k);
      watchers.push({ watcher: w, source: gr.source, patternId: gr.patternId, why: gr.why });
    }
  }
  if (!first) return null;
  return { access, watchers, source: first.source, patternId: first.patternId, why: first.why };
}
/** Who may see / act (the `access` half of `effectiveGrants`). */
function effectiveAccess(input, facts) { const e = effectiveGrants(input, facts); return e ? e.access : []; }
/** Who is woken (the `watchers` half of `effectiveGrants`). */
function effectiveWatchers(input, facts) { const e = effectiveGrants(input, facts); return e ? e.watchers : []; }
/** Is THIS principal (an agent ctx `{kind:'agent', id, groups}`) named by a
 *  row — itself, or one of its groups? */
function rowNames(row, ctx) {
  const p = row && row.principal;
  if (!p || !ctx) return false;
  if (p.kind === 'agent') return ctx.kind === 'agent' && ctx.id === p.id;
  if (p.kind === 'group') return Array.isArray(ctx.groups) && ctx.groups.includes(p.id);
  return false;
}
/** What the editor shows BEFORE saving (§7.3): wakes per day at most, the
 *  pacing cap and the digest windows folded in. `matchedPerDay` is the honest
 *  estimate over the scope. */
function expectedWakesPerDay({ notify = 'wake', digestMinutes = DEFAULT_DIGEST_MINUTES, matchedPerDay = 0, dailyWakeCap = DEFAULT_DAILY_WAKE_CAP } = {}) {
  const cap = Number.isFinite(Number(dailyWakeCap)) ? Math.max(0, Number(dailyWakeCap)) : DEFAULT_DAILY_WAKE_CAP;
  const matched = Math.max(0, Number(matchedPerDay) || 0);
  if (notify === 'digest') {
    const windows = (24 * 60) / Math.max(MIN_DIGEST_MINUTES, Number(digestMinutes) || DEFAULT_DIGEST_MINUTES);
    return Math.min(cap, windows, matched > 0 ? windows : 0);
  }
  if (notify !== 'wake') return 0;   // nothing but a watcher is ever woken
  return Math.min(cap, matched);
}
/** The Notify dialog's total: every watcher row's own ceiling, summed —
 *  each has its own ledger, so N watchers of one grain are N budgets. */
function expectedWakesTotal(rows) {
  let n = 0;
  for (const r of Array.isArray(rows) ? rows : []) n += expectedWakesPerDay(r || {});
  return Math.round(n * 10) / 10;
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
function renderWakeBlock({ adapterLabel = 'channel', title = '', convId = '', hits = [], elided = 0, coalesced = null, replyHint = true, inherited = null, others = null } = {}, { maxRecords = BLOCK_MAX_RECORDS, maxChars = BLOCK_MAX_CHARS, budget = BLOCK_MAX_BYTES } = {}) {
  const list = (Array.isArray(hits) ? hits : []).filter((h) => h && h.record);
  const shown = list.slice(-maxRecords);
  const dropped = list.length - shown.length + (Number(elided) || 0);
  const whys = [...new Set(shown.flatMap((h) => (Array.isArray(h.why) ? h.why : [])))];
  const head = `### Channel message — ${safeInline(adapterLabel, 60)} · ${safeInline(title || convId, 120)}${inheritedNote(inherited)}`;
  const lines = [head];
  const meta = [];
  if (whys.length) meta.push(`matched: ${whys.map((w) => safeInline(w, 120)).join(', ')}`);
  if (coalesced && Number(coalesced.n) > 1) meta.push(`${coalesced.n} messages in ${Math.round(Number(coalesced.seconds) || 0)} s, one wake`);
  if (meta.length) lines.push(meta.join(' · '));
  const ol = othersLine(others);
  if (ol) lines.push(ol);
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

/** Why an INHERITED watcher's block is in this agent's context (§7.5):
 *  the head says the grain — the whole account, or the rule by its summary. */
function inheritedNote(inherited) {
  if (!inherited || !inherited.kind) return '';
  if (inherited.kind === 'account') return ' (you are watching the whole account)';
  if (inherited.kind === 'pattern') return ` (you are watching by a rule: ${safeInline(inherited.label || 'a pattern', 120)})`;
  return '';
}
/** R4: the OTHER principals on this conversation, so two woken agents never
 *  both answer blind — `others` = `[{name, notify?, authority}]` (a watcher
 *  names its delivery; access alone says so). Null / empty ⇒ no line (a
 *  single watcher's block is byte-identical to before). */
function othersLine(others) {
  const list = (Array.isArray(others) ? others : []).filter((o) => o && (o.name || o.id)).slice(0, 8);
  if (!list.length) return '';
  const words = list.map((o) => `${safeInline(o.name || o.id, 60)} (${o.notify ? `${o.notify === 'digest' ? 'digest' : 'woken'}, ` : 'access only, '}${o.authority === 'send' ? 'may send' : 'drafts'})`);
  return `also on this conversation: ${words.join(', ')}`;
}

/**
 * THE SCOPE DIGEST (2026-09-26): an inherited assignment in digest mode
 * delivers ONCE per window — every conversation of its scope that had hits,
 * one short section each (title + at most 3 records), inside the same byte
 * budget; what does not fit is COUNTED, never silently dropped.
 * `groups` = `[{title, convId, hits:[{record, why}], elided?}]`.
 */
function renderScopeDigestBlock({ adapterLabel = 'channel', scopeLabel = '', groups = [], windowMinutes = DEFAULT_DIGEST_MINUTES, elidedConversations = 0, others = null } = {}, { perConversation = 3, maxChars = 200, budget = BLOCK_MAX_BYTES } = {}) {
  const list = (Array.isArray(groups) ? groups : []).filter((g) => g && Array.isArray(g.hits) && g.hits.length);
  const msgs = list.reduce((n, g) => n + g.hits.length + (Number(g.elided) || 0), 0);
  const convs = list.length + (Number(elidedConversations) || 0);
  const head = `### Channel digest — ${safeInline(adapterLabel, 60)} · ${convs} conversation${convs === 1 ? '' : 's'}, ${msgs} message${msgs === 1 ? '' : 's'} in the last ${Math.round(Number(windowMinutes) || 0)} min`;
  const lines = [head];
  if (scopeLabel) lines.push(`you are watching ${safeInline(scopeLabel, 160)}`);
  const ol = othersLine(others);
  if (ol) lines.push(ol.replace('also on this conversation', 'also on these conversations'));
  const tail = 'Read more: vibespace-channels read <conv>   ·   reply: vibespace-channels reply <conv> "…" (this PROPOSES)';
  let out = lines.join('\n');
  let shown = 0;
  for (const g of list) {
    const recs = g.hits.slice(-perConversation);
    const more = g.hits.length - recs.length + (Number(g.elided) || 0);
    const sec = [`#### ${safeInline(g.title || g.convId, 120)} — ${safeInline(g.convId, 200)}`]
      .concat(recs.map((h) => `from ${safeInline((h.record.author && (h.record.author.name || h.record.author.id)) || 'unknown', 80)} at ${stamp(h.record.at)}\n${safeLine(h.record.text, maxChars)}`));
    if (more > 0) sec.push(`(${more} more in this conversation)`);
    const next = out + '\n' + sec.join('\n');
    const rest = list.length - shown - 1 + (Number(elidedConversations) || 0);
    const closing = (rest > 0 ? `\n(${rest} more conversations elided — vibespace-channels list)` : '') + '\n' + tail;
    if (bytes(next + closing) > budget) break;
    out = next;
    shown++;
  }
  const rest = list.length - shown + (Number(elidedConversations) || 0);
  if (rest > 0) out += `\n(${rest} more conversations elided — vibespace-channels list)`;
  return out + '\n' + tail;
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
  validateRule, validateFilter, filterProblemText, MAX_RULES, ruleWhy, matchRecord, estimate,
  validateAssignment, ASSIGN_REFUSALS, GRANT_REFUSALS, authorityCap, authorityCapCode, authorityCapText, effectiveAuthority, pickRoundRobin, paceVerdict, digestCap, pruneLedger, countSince,
  renderWakeBlock, renderDigestBlock, whyText,
  // 2026-09-26: the three grains + conversation patterns + the scope digest
  ASSIGN_SCOPES, CONV_RULE_KINDS, CONV_KINDS, validatePattern, matchConversation, patternSummary, expectedWakesPerDay, renderScopeDigestBlock,
  // R4 (2026-09-27): access and notification — two lists per grain, access first
  MAX_ACCESS_ROWS, MAX_WATCHER_ROWS, principalKey, validateAccessRow, validateAccess, validateWatcher, validateWatchers,
  splitAssignment, grainOf, liftGrainRecord, LEGACY_ASSIGNMENT_FIELDS, effectiveGrants, effectiveAccess, effectiveWatchers, rowNames, expectedWakesTotal, othersLine,
};
