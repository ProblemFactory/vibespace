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
//   · lane voice-dictionary-nag: a proposal's preselected words wait in ONE For-you item at a time (`state.item` —
//     {id, terms, lang}; a later batch merges into it in place), filed `low` (never pinned under urgent); `suggest`
//     (「词典建议」, default ON) off ⇒ no proposal; `mode` (voice.suggestions.mode: item | settings-only) settings-only ⇒
//     never a For-you item; what the person dismissed is voice-model's EVIDENCE LEDGER.
//   · lane voice-teach-skips (the owner 2026-10-22: 「最近几次 dropline 添加都是跳过，如果加入会跳过为啥还让我加入，而且不能设置成自动
//     加入不用我确认吗？我不是开了那几个目录自动嘛？」 — 50 journal rows, every terms write added 0): AN ASK IS FILED ONLY FOR AN
//     ACT THAT CAN SUCCEED. A word the vendor skipped is remembered WITH ITS REASON 30 days (`skipped`; Dropline's documented
//     reasons: `review` = it did not need the word, it already writes it right; `refused` = the person deleted it before or
//     the dictionary is full) and never proposed in that time; no proposal while this hour's terms calls are spent; a folder
//     set to automatic covers its SUBFOLDERS (`folderOf`, a prefix rule) and asks NOTHING there — every proposable word goes,
//     within the caps, the rest waits in `pending` for the next tick; the journal row keeps the words and the vendor's skipped
//     entries (`skips`, every field) and their `reasons` counted; five writes in a row that added nothing ⇒ `skipStreak`.
// The engine (src/server/voice-teach-engine.js) holds the state in the plugin record and calls the vendor module.
const TEACH_LIMITS = Object.freeze({
  proposalEveryMs: 3600e3, ignoreMs: 30 * 24 * 3600e3, contextEveryMs: 600e3, hourMs: 3600e3,
  termsPerHour: 6, contextPerHour: 6, autoTermsPerHour: 50, termsPerCall: 50, proposePerCard: 12, journalMax: 50, proposalsMax: 20, projectsMax: 50, convsMax: 300,
  skipMs: 30 * 24 * 3600e3, skippedMax: 1000, pendingMax: 50, pendingMs: 7 * 24 * 3600e3, rowWords: 24, streakWrites: 5, vocabEveryMs: 24 * 3600e3,
});
const AUTO_KINDS = Object.freeze(['file', 'ident']);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);

/** the plugin record's config → the teach switches (both default OFF) + the per-project opt-ins */
function settingsOf(config) {
  const c = obj(config);
  return { teach: c.teach === true, context: c.context === true, suggest: c.suggest !== false, mode: c.suggestionsMode === 'settings-only' ? 'settings-only' : 'item', autoProjects: arr(c.autoProjects).filter((p) => typeof p === 'string' && p.startsWith('/')).slice(0, TEACH_LIMITS.projectsMax) };
}
/** THE ONE open suggestion item's facts (lane voice-dictionary-nag): {id, terms, lang} or null */
const itemOf = (x) => (x && typeof x.id === 'string' && x.id && Array.isArray(x.terms) ? { id: x.id, terms: x.terms.filter((t) => typeof t === 'string' && t).slice(0, 24), lang: ['zh', 'ja'].includes(x.lang) ? x.lang : 'en' } : null);
const keyOf = (t) => String(t).toLowerCase();
function stateOf(raw) {
  const r = obj(raw);
  const calls = obj(r.calls);
  const streak = obj(r.streak);
  return {
    ignored: { ...obj(r.ignored) }, lastProposal: { ...obj(r.lastProposal) }, ctxSent: { ...obj(r.ctxSent) }, held: { ...obj(r.held) },
    calls: { terms: arr(calls.terms).filter(Number.isFinite), context: arr(calls.context).filter(Number.isFinite) },
    autoSent: arr(r.autoSent).filter((x) => x && Number.isFinite(x.at) && Number.isFinite(x.n)),
    journal: arr(r.journal).slice(-TEACH_LIMITS.journalMax), proposals: arr(r.proposals).slice(-TEACH_LIMITS.proposalsMax),
    item: itemOf(r.item),
    // lane voice-teach-skips: the vendor's skips (lower-case key → {term, reason, at}), the auto folders' words over the cap
    skipped: Object.fromEntries(Object.entries(obj(r.skipped)).filter(([, x]) => x && typeof x.term === 'string' && Number.isFinite(x.at))),
    pending: arr(r.pending).filter((x) => x && typeof x.term === 'string' && x.term && typeof x.folder === 'string' && Number.isFinite(x.at)).slice(-TEACH_LIMITS.pendingMax),
    streak: Number.isFinite(streak.at) ? { at: streak.at, itemId: typeof streak.itemId === 'string' ? streak.itemId : null } : null,
    lang: ['zh', 'ja', 'en'].includes(r.lang) ? r.lang : null,   // the person's UI language at the last dictation (the streak item's words)
  };
}
/** drop what has run out: ignores past 30 d, skips past 30 d, calls / auto counts past the hour, the oldest conversations' marks */
function prune(state, now) {
  const s = stateOf(state);
  for (const [t, until] of Object.entries(s.ignored)) if (!(until > now)) delete s.ignored[t];
  for (const [k, x] of Object.entries(s.skipped)) if (!(now - x.at < TEACH_LIMITS.skipMs)) delete s.skipped[k];
  s.pending = s.pending.filter((x) => now - x.at < TEACH_LIMITS.pendingMs);
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
/** lane voice-teach-skips: the vendor skipped this word less than 30 days ago (its reason kept) — never proposed meanwhile */
const skippedNow = (state, term, now) => { const x = obj(obj(state).skipped)[keyOf(term)]; return !!x && now - x.at < TEACH_LIMITS.skipMs; };
const uniq = (words) => { const seen = new Set(); return words.filter((w) => { const k = keyOf(w); if (seen.has(k)) return false; seen.add(k); return true; }); };

// ── THE FOLDER RULE (lane voice-teach-skips): «automatic» for a folder means the folder AND its subfolders ──
const trimSlash = (p) => String(p).replace(/\/+$/, '') || '/';
/** `folder` covers `cwd`: the same folder or one under it (a `..` segment is never covered) */
function covers(folder, cwd) {
  if (typeof folder !== 'string' || typeof cwd !== 'string' || !folder.startsWith('/') || !cwd.startsWith('/') || cwd.split('/').includes('..')) return false;
  const f = trimSlash(folder), c = trimSlash(cwd);
  return c === f || c.startsWith(f === '/' ? '/' : f + '/');
}
/** the automatic folder covering `cwd` (the deepest of the person's list), or null */
function folderOf(autoProjects, cwd) {
  let best = null;
  for (const p of arr(autoProjects)) if (covers(p, cwd) && (!best || trimSlash(p).length > trimSlash(best).length)) best = p;
  return best;
}
/** the parent a card offers beside the folder itself — never shallower than three segments (/home/<user> would cover everything) */
function parentOf(cwd) {
  if (typeof cwd !== 'string' || !cwd.startsWith('/') || cwd.split('/').includes('..')) return null;
  const parts = trimSlash(cwd).split('/').filter(Boolean);
  return parts.length >= 4 ? '/' + parts.slice(0, -1).join('/') : null;
}

/** a conversation's fresh terms → `{auto, queued, propose, pick, below, folder, why}`. Teach OFF ⇒ all empty. Words
 *  the person ignored (30 d) or the vendor SKIPPED (30 d, lane voice-teach-skips) are never here.
 *  · in a folder set to AUTOMATIC (`folderOf` — the folder or any subfolder of it): NOTHING is asked — `auto` = every
 *    proposable word (the per-project tier's file names + identifiers that `autoFrom` names, voice-model's autoSourcesOf,
 *    and every word of `candidates`), within this hour's room (a terms call left, ≤ 50 words); `queued` = the rest (the
 *    engine keeps them in `pending`, the next tick sends them); no card.
 *  · elsewhere `propose` = a card's terms (once an hour per conversation, and only while a terms call is left this hour —
 *    an ask is filed only for an act that can succeed): the top `proposePerCard` of `candidates` (voice-model's
 *    proposalCandidates, ranked — lane voice-teach-candidates), `pick` = the preselected ones, `below` = [term, seen] cut
 *    under the line: held, offered again only when seen more often (`hold`). `kindOf(term)` = voice-model's termKind. */
function proposalVerdict(state, { conv, cwd = '', terms = [], candidates = null, now, settings, kindOf, autoFrom = [] }) {
  const set = settingsOf(settings);
  const none = { auto: [], queued: [], propose: [], pick: [], below: [], folder: null };
  if (!settings || settings.teach !== true) return { ...none, why: 'teach-off' };
  const gone = (t) => ignoredNow(state, t, now) || skippedNow(state, t, now);
  const fresh = arr(terms).filter((t) => typeof t === 'string' && t && !gone(t));
  const cands = (candidates ? arr(candidates) : fresh.map((t) => ({ term: t, seen: 1, pick: true })))
    .filter((c) => c && typeof c.term === 'string' && c.term && !gone(c.term));
  if (!fresh.length && !cands.length) return { ...none, why: 'nothing-new' };
  const folder = cwd ? folderOf(set.autoProjects, cwd) : null;
  if (folder) {
    const from = new Set(arr(autoFrom));
    const words = uniq([...fresh.filter((t) => AUTO_KINDS.includes(kindOf(t)) && from.has(t)), ...cands.map((c) => c.term)]);
    const room = capLeft(state, 'terms', now) > 0 ? Math.min(autoRoom(state, now), TEACH_LIMITS.termsPerCall) : 0;
    return { ...none, folder, auto: words.slice(0, room), queued: words.slice(room), why: !words.length ? 'nothing-new' : room ? null : 'cap' };
  }
  const held = obj(obj(obj(state).held)[conv]);
  const rest = cands.filter((c) => !(held[c.term] >= (Number(c.seen) || 0)));
  const last = obj(obj(state).lastProposal)[conv];
  if (!rest.length) return { ...none, why: 'nothing-new' };
  if (Number.isFinite(last) && now - last < TEACH_LIMITS.proposalEveryMs) return { ...none, why: 'hourly' };
  if (capLeft(state, 'terms', now) <= 0) return { ...none, why: 'cap' };
  const top = rest.slice(0, TEACH_LIMITS.proposePerCard);
  return { ...none, propose: top.map((c) => c.term), pick: top.filter((c) => c.pick).map((c) => c.term), below: rest.slice(top.length).map((c) => [c.term, Number(c.seen) || 0]), why: null };
}
/** lane voice-teach-skips: an automatic folder's words over this hour's room wait here (deduped, ≤ 50, a week at most) */
function queueWords(state, words, folder, now) {
  const s = stateOf(state);
  const have = new Set(s.pending.map((x) => keyOf(x.term)));
  for (const t of arr(words)) if (typeof t === 'string' && t && !have.has(keyOf(t))) { have.add(keyOf(t)); s.pending.push({ term: t, folder, at: now }); }
  s.pending = s.pending.slice(-TEACH_LIMITS.pendingMax);
  return s;
}
/** the next tick: the waiting words that may go now — still under an automatic folder, not skipped / known since, within
 *  this hour's room → {send, keep} (`keep` = the queue after this send; the words that lost their folder leave it) */
function pendingDue(state, { now, settings, known = [] }) {
  const s = stateOf(state);
  const set = settingsOf(settings);
  const have = new Set(arr(known).map(keyOf));
  const live = s.pending.filter((x) => set.autoProjects.includes(x.folder) && !skippedNow(s, x.term, now) && !ignoredNow(s, x.term, now) && !have.has(keyOf(x.term)));
  const room = settings && settings.teach === true && capLeft(s, 'terms', now) > 0 ? Math.min(autoRoom(s, now), TEACH_LIMITS.termsPerCall) : 0;
  return { send: live.slice(0, room), keep: live.slice(room) };
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

// ── THE VENDOR'S REASON (lane voice-teach-skips): kept, never counted away ──
/** a skipped entry's reason word: Dropline's documented `review` / `refused`, another word VERBATIM (≤ 40 chars), or `unstated` */
const reasonOf = (x) => { const r = obj(x).reason; return typeof r === 'string' && r.trim() ? r.trim().slice(0, 40) : 'unstated'; };
/** the vendor's skipped entries → {reason: n} (insertion order = first seen) */
function reasonCounts(skips) { const out = {}; for (const x of arr(skips)) { const r = reasonOf(x); out[r] = (out[r] || 0) + 1; } return out; }
/** a skipped entry as the journal keeps it: the term, the reason, every other field the vendor sent (bounded) */
const skipRow = (x) => { const o = obj(x); return { term: String(o.term || '').slice(0, 120), reason: reasonOf(o), ...(o.fields && typeof o.fields === 'object' ? { fields: o.fields } : {}) }; };
/** the skipped words are remembered with their reason — 30 days unproposed (the least recent out past 1 000) */
function rememberSkips(state, skips, now) {
  const s = stateOf(state);
  for (const x of arr(skips)) { const r = skipRow(x); if (r.term) s.skipped[keyOf(r.term)] = { term: r.term, reason: r.reason, at: now }; }
  const keys = Object.keys(s.skipped);
  if (keys.length > TEACH_LIMITS.skippedMax) for (const k of keys.sort((a, b) => s.skipped[a].at - s.skipped[b].at).slice(0, keys.length - TEACH_LIMITS.skippedMax)) delete s.skipped[k];
  return s;
}
/** a journal row: time, kind (terms | context), title, chars, added / skipped (+ auto = the per-project tier) — lane
 *  voice-teach-skips: + the words sent (`words`), the vendor's skipped entries (`skips`, every field) and `reasons` counted,
 *  the automatic folder that sent them (`folder`) */
function journalAdd(state, { at, kind, title = '', chars = 0, added = 0, skipped = 0, auto = false, words = null, skips = null, folder = null }) {
  const s = stateOf(state);
  const sk = arr(skips).map(skipRow).filter((x) => x.term);
  const row = { at, kind, title: String(title).slice(0, 200), chars, added, skipped, ...(auto ? { auto: true } : {}), ...(folder ? { folder: String(folder).slice(0, 4096) } : {}),
    ...(Array.isArray(words) && words.length ? { words: words.slice(0, TEACH_LIMITS.rowWords).map((w) => String(w).slice(0, 120)) } : {}),
    ...(sk.length ? { skips: sk.slice(0, TEACH_LIMITS.rowWords), reasons: reasonCounts(sk) } : {}) };
  s.journal = [...s.journal, row].slice(-TEACH_LIMITS.journalMax);
  return s;
}
/** five terms writes in a row that added NOTHING (the owner's journal: 50 of 50) ⇒ {writes, skipped, reasons} — the ONE low
 *  For-you item names it; a row written before this lane (counts only) counts its skips as `unstated`. Else null. */
function skipStreak(state) {
  const rows = arr(obj(state).journal).filter((r) => r && r.kind === 'terms').slice(-TEACH_LIMITS.streakWrites);
  if (rows.length < TEACH_LIMITS.streakWrites || rows.some((r) => !(Number(r.skipped) > 0) || Number(r.added) > 0)) return null;
  const reasons = {};
  let skipped = 0;
  for (const r of rows) {
    skipped += Number(r.skipped);
    const counted = r.reasons && typeof r.reasons === 'object' ? r.reasons : { unstated: Number(r.skipped) };
    for (const [k, n] of Object.entries(counted)) reasons[k] = (reasons[k] || 0) + (Number(n) || 0);
  }
  return { writes: rows.length, skipped, reasons };
}

// the For-you item's words (the hub files it; the person's UI language picked by the browser that saw the terms)
// lane voice-teach-skips: + the skip streak's ONE item (its reasons in words; 停止发词 = the teach switch off, the context stays)
const TEACH_WORDS = Object.freeze({
  en: { proposal: 'Dropline suggests adding to your dictionary: {terms}', add: 'Add to dictionary', ignore: 'Ignore', detail: '✓ sends exactly these words to your Dropline (Fish Audio). Click this item to untick some first. ✕ = not now: these words come back only when you say them again.',
    streak: 'Dropline keeps skipping the words we send: the last {n} sends added none ({reasons})', streakDetail: 'Dropline adds only words it would otherwise get wrong — "already written right" means it needs no dictionary entry; "refused" means you deleted the word before or the dictionary is full. A skipped word is not suggested again for 30 days. While "Send the conversation to Dropline\'s two-week memory" is on, Dropline picks the words it gets wrong from that text itself.', streakOff: 'Stop sending words', streakOk: 'Got it',
    review: 'already written right', refused: 'refused by the dictionary', unstated: 'no reason given' },
  zh: { proposal: 'Dropline 建议加入词库：{terms}', add: '加入词库', ignore: '忽略', detail: '✓ = 把这些词发给你的 Dropline（Fish Audio）。想先去掉个别词，点这一条。✕ = 先不要：这些词只有你再次说到时才会再建议。',
    streak: 'Dropline 一直跳过我们发的词：最近 {n} 次一个也没加入（{reasons}）', streakDetail: 'Dropline 只收它会写错的词——「已能写对」= 不需要进词库；「词典不收」= 你删过这个词，或词典已满。跳过的词 30 天内不再建议。开着「把对话发给 Dropline 的两周记忆」时，Dropline 会自己从那段文字里挑它会写错的词。', streakOff: '停止发词', streakOk: '知道了',
    review: '已能写对', refused: '词典不收', unstated: '没给理由' },
  ja: { proposal: 'Dropline の辞書への追加候補：{terms}', add: '辞書に追加', ignore: '無視', detail: '✓ でこれらの語をあなたの Dropline（Fish Audio）に送ります。語を外すには、この項目をクリック。✕ = 今はしない：これらの語は、もう一度話したときにだけ再び提案されます。',
    streak: 'Dropline が送った語をスキップし続けています：直近 {n} 回、1 語も追加されていません（{reasons}）', streakDetail: 'Dropline は、そのままでは誤認識する語だけを追加します。「既に正しく書ける」= 辞書は不要、「辞書が拒否」= 以前に削除した語か、辞書が満杯です。スキップされた語は 30 日間提案しません。「会話を Dropline の 2 週間メモリーに送る」がオンの間は、Dropline がその本文から誤認識する語を自分で選びます。', streakOff: '語の送信をやめる', streakOk: 'わかった',
    review: '既に正しく書ける', refused: '辞書が拒否', unstated: '理由なし' },
});
function teachWords(lang, key, params = {}) {
  const L = TEACH_WORDS[lang] || TEACH_WORDS.en;
  return String(L[key] || TEACH_WORDS.en[key] || '').replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : String(params[k])));
}
/** the reasons in words: «已能写对 9 · 词典不收 2» — a reason the table does not know is the vendor's own word */
function reasonsWords(lang, reasons) {
  const L = TEACH_WORDS[lang] || TEACH_WORDS.en;
  return Object.entries(obj(reasons)).map(([k, n]) => `${['review', 'refused', 'unstated'].includes(k) ? L[k] : k} ${n}`).join(' · ');
}

module.exports = { TEACH_LIMITS, AUTO_KINDS, TEACH_WORDS, settingsOf, stateOf, prune, capLeft, proposalVerdict, hold, contextVerdict, recordCall, recordAuto, ignore, journalAdd, teachWords,
  covers, folderOf, parentOf, skippedNow, rememberSkips, reasonCounts, reasonsWords, skipStreak, queueWords, pendingDue };
