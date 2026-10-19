'use strict';
// PURE: the TEACH schedule of Dropline voice input (design q-029 §4 + §8 OWNER RULINGS 2026-10-12; lane
// voice-p1-oauth-teach). Nothing is ever written to the person's Dropline without their press:
//   · `teach` (default OFF) ⇒ PROPOSALS only — per conversation at most once an hour, ≤ 12 words a person would say
//     (lane voice-teach-candidates); a proposal's terms go to POST /v1/terms only when the person presses 加入所选
//     (exactly the selected ones); 忽略这批 remembers them 30 days.
//   · the per-PROJECT tier (an explicit opt-in per working directory) sends that project's file names + identifiers
//     without a card — still ≤ 50 terms an hour, still journaled.
//   · `context` (/v1/context, its OWN switch, default OFF): the FIRST send per conversation is a PREVIEW the person
//     answers (发送 / 不发); later sends go at most once per 10 minutes and only when the text changed.
//   · per instance: terms 6 calls/h, context 6 calls/h. The journal keeps the last 50 sends.
// The engine (src/server/voice-teach-engine.js) holds the state in the plugin record and calls the vendor module.
const TEACH_LIMITS = Object.freeze({
  proposalEveryMs: 3600e3, ignoreMs: 30 * 24 * 3600e3, contextEveryMs: 600e3, hourMs: 3600e3,
  termsPerHour: 6, contextPerHour: 6, autoTermsPerHour: 50, termsPerCall: 50, proposePerCard: 12, journalMax: 50, proposalsMax: 20, projectsMax: 50, convsMax: 300,
});
const AUTO_KINDS = Object.freeze(['file', 'ident']);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);

/** the plugin record's config → the teach switches (both default OFF) + the per-project opt-ins */
function settingsOf(config) {
  const c = obj(config);
  return { teach: c.teach === true, context: c.context === true, autoProjects: arr(c.autoProjects).filter((p) => typeof p === 'string' && p.startsWith('/')).slice(0, TEACH_LIMITS.projectsMax) };
}
function stateOf(raw) {
  const r = obj(raw);
  const calls = obj(r.calls);
  return {
    ignored: { ...obj(r.ignored) }, lastProposal: { ...obj(r.lastProposal) }, ctxSent: { ...obj(r.ctxSent) }, held: { ...obj(r.held) },
    calls: { terms: arr(calls.terms).filter(Number.isFinite), context: arr(calls.context).filter(Number.isFinite) },
    autoSent: arr(r.autoSent).filter((x) => x && Number.isFinite(x.at) && Number.isFinite(x.n)),
    journal: arr(r.journal).slice(-TEACH_LIMITS.journalMax), proposals: arr(r.proposals).slice(-TEACH_LIMITS.proposalsMax),
  };
}
/** drop what has run out: ignores past 30 d, calls / auto counts past the hour, the oldest conversations' marks */
function prune(state, now) {
  const s = stateOf(state);
  for (const [t, until] of Object.entries(s.ignored)) if (!(until > now)) delete s.ignored[t];
  s.calls.terms = s.calls.terms.filter((at) => now - at < TEACH_LIMITS.hourMs);
  s.calls.context = s.calls.context.filter((at) => now - at < TEACH_LIMITS.hourMs);
  s.autoSent = s.autoSent.filter((x) => now - x.at < TEACH_LIMITS.hourMs);
  for (const k of ['lastProposal', 'ctxSent', 'held']) {
    const keys = Object.keys(s[k]);
    if (keys.length > TEACH_LIMITS.convsMax) for (const c of keys.slice(0, keys.length - TEACH_LIMITS.convsMax)) delete s[k][c];
  }
  return s;
}
/** calls left this hour for `kind` ('terms' | 'context') */
function capLeft(state, kind, now) {
  const per = kind === 'context' ? TEACH_LIMITS.contextPerHour : TEACH_LIMITS.termsPerHour;
  return Math.max(0, per - arr(obj(obj(state).calls)[kind]).filter((at) => now - at < TEACH_LIMITS.hourMs).length);
}
const autoRoom = (state, now) => Math.max(0, TEACH_LIMITS.autoTermsPerHour - arr(obj(state).autoSent).filter((x) => now - x.at < TEACH_LIMITS.hourMs).reduce((n, x) => n + x.n, 0));
const ignoredNow = (state, term, now) => obj(obj(state).ignored)[term] > now;

/** a conversation's fresh terms → `{auto, propose, why}`: `auto` = the project's file names + identifiers (only when
 *  the person opted this cwd in; ≤ 50/h and a terms call left) that `autoFrom` names — voice-model's autoSourcesOf:
 *  project files, agent-named paths, agent code-span identifiers, never the person's own words (voice-verify F2) —
 *  `propose` = a card's terms (once an hour per conversation): the top `proposePerCard` of `candidates` (voice-model's
 *  proposalCandidates, ranked — lane voice-teach-candidates), `pick` = the preselected ones, `below` = [term, seen] cut
 *  under the line: held, offered again only when seen more often (`hold`). `kindOf(term)` = voice-model's termKind.
 *  Teach OFF ⇒ all empty. */
function proposalVerdict(state, { conv, cwd = '', terms = [], candidates = null, now, settings, kindOf, autoFrom = [] }) {
  const set = settingsOf(settings);
  const none = { auto: [], propose: [], pick: [], below: [] };
  if (!settings || settings.teach !== true) return { ...none, why: 'teach-off' };
  const fresh = arr(terms).filter((t) => typeof t === 'string' && t && !ignoredNow(state, t, now));
  const cands = (candidates ? arr(candidates) : fresh.map((t) => ({ term: t, seen: 1, pick: true })))
    .filter((c) => c && typeof c.term === 'string' && c.term && !ignoredNow(state, c.term, now));
  if (!fresh.length && !cands.length) return { ...none, why: 'nothing-new' };
  const projectOn = !!cwd && arr(settings.autoProjects).includes(cwd) && set.autoProjects.includes(cwd);
  let auto = [], eligible = [];
  if (projectOn) {
    const from = new Set(arr(autoFrom));
    eligible = fresh.filter((t) => AUTO_KINDS.includes(kindOf(t)) && from.has(t));
    if (capLeft(state, 'terms', now) > 0) auto = eligible.slice(0, Math.min(autoRoom(state, now), TEACH_LIMITS.termsPerCall));
  }
  const held = obj(obj(obj(state).held)[conv]);
  const rest = cands.filter((c) => !eligible.includes(c.term) && !(held[c.term] >= (Number(c.seen) || 0)));
  const last = obj(obj(state).lastProposal)[conv];
  if (!rest.length) return { ...none, auto, why: auto.length ? null : 'nothing-new' };
  if (Number.isFinite(last) && now - last < TEACH_LIMITS.proposalEveryMs) return { ...none, auto, why: 'hourly' };
  const top = rest.slice(0, TEACH_LIMITS.proposePerCard);
  return { auto, propose: top.map((c) => c.term), pick: top.filter((c) => c.pick).map((c) => c.term), below: rest.slice(top.length).map((c) => [c.term, Number(c.seen) || 0]), why: null };
}
/** a card was filed in `conv`: its terms leave the held list, the words cut under its line wait there with their count */
function hold(state, conv, below, proposed = []) {
  const s = stateOf(state);
  const h = { ...obj(s.held[conv]) };
  for (const t of arr(proposed)) delete h[t];
  for (const [t, n] of arr(below)) h[t] = n;
  s.held[conv] = Object.fromEntries(Object.entries(h).slice(-200));
  return s;
}
/** the context verdict for a conversation: `preview` (its FIRST send, or after a 不发) | `send` | `none` (+ why) */
function contextVerdict(state, { conv, hash, now, settings }) {
  if (!settings || settings.context !== true) return { act: 'none', why: 'context-off' };
  const last = obj(obj(state).ctxSent)[conv];
  if (last && now - last.at < TEACH_LIMITS.contextEveryMs) return { act: 'none', why: 'cadence' };
  if (!last || last.declined) return { act: 'preview', why: null };
  if (last.hash === hash) return { act: 'none', why: 'same' };
  if (capLeft(state, 'context', now) <= 0) return { act: 'none', why: 'cap' };
  return { act: 'send', why: null };
}
function recordCall(state, kind, now) { const s = stateOf(state); s.calls[kind] = [...s.calls[kind], now]; return s; }
function recordAuto(state, n, now) { const s = stateOf(state); s.autoSent = [...s.autoSent, { at: now, n }]; return s; }
function ignore(state, terms, now) { const s = stateOf(state); for (const t of arr(terms)) s.ignored[t] = now + TEACH_LIMITS.ignoreMs; return s; }
/** a journal row: time, kind (terms | context), title, chars, added / skipped (+ auto = the per-project tier) */
function journalAdd(state, { at, kind, title = '', chars = 0, added = 0, skipped = 0, auto = false }) {
  const s = stateOf(state);
  s.journal = [...s.journal, { at, kind, title: String(title).slice(0, 200), chars, added, skipped, ...(auto ? { auto: true } : {}) }].slice(-TEACH_LIMITS.journalMax);
  return s;
}

// the For-you item's words (the hub files it; the person's UI language picked by the browser that saw the terms)
const TEACH_WORDS = Object.freeze({
  en: { proposal: 'Dropline suggests adding to your dictionary: {terms}', add: 'Add to dictionary', ignore: 'Ignore', detail: '✓ sends exactly these words to your Dropline (Fish Audio). Click this item to untick some first.' },
  zh: { proposal: 'Dropline 建议加入词库：{terms}', add: '加入词库', ignore: '忽略', detail: '✓ = 把这些词发给你的 Dropline（Fish Audio）。想先去掉个别词，点这一条。' },
  ja: { proposal: 'Dropline の辞書への追加候補：{terms}', add: '辞書に追加', ignore: '無視', detail: '✓ でこれらの語をあなたの Dropline（Fish Audio）に送ります。語を外すには、この項目をクリック。' },
});
function teachWords(lang, key, params = {}) {
  const L = TEACH_WORDS[lang] || TEACH_WORDS.en;
  return String(L[key] || TEACH_WORDS.en[key] || '').replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : String(params[k])));
}

module.exports = { TEACH_LIMITS, AUTO_KINDS, TEACH_WORDS, settingsOf, stateOf, prune, capLeft, proposalVerdict, hold, contextVerdict, recordCall, recordAuto, ignore, journalAdd, teachWords };
