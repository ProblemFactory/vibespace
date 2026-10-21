'use strict';
// THE TEACH ENGINE of Dropline voice input (design q-029 §4 + §8 owner rulings; lane voice-p1-oauth-teach). The schedule
// is PURE (src/voice-teach.js); this file holds its state in the plugin record (`rec.teach`), files the proposal's
// For-you item, and calls the ONE vendor module (src/server/dropline-client.js) — terms() only after the person's
// press (the card's 加入词库 or the For-you chip) or for a project they opted in; context() only after the first-time
// preview's 发送. A dictation with teach + context OFF reaches nothing here (`seen` returns before any read).
// lane voice-dictionary-nag (a fleet user 2026-10-21: 「一天到晚有这个 Dropline 让我发信息的消息, 站在我的 inbox 里」): the
// proposals' preselected words wait in ONE For-you item (a later batch merges into it IN PLACE — same id), filed `low`
// (never pinned under urgent); 「词典建议」 (`suggest`) off ⇒ nothing is proposed; voice.suggestions.mode `settings-only` ⇒
// never a For-you item (the list in All Settings). ✕ / 忽略 / 全部标为已看 / a word's 忽略 CONSUME the words' evidence in
// voice-model's EVIDENCE LEDGER (the plugin's own store file, data/voice-suggestions.json, writeJsonAtomic 0600): a word
// comes back only from a NEW dictation; a new item waits a day after a dismissal (suggestionPace).
const crypto = require('crypto');
const fs = require('fs');
const { writeJsonAtomic } = require('../channel-store.js'); // the ONE atomic data/*.json writer
const T = require('../voice-teach.js');
const VM = require('../voice-model.js');

const ITEM_KEY = require('../plugins/voice-input.js').id;   // the For-you items' key = THE PLUGIN'S ID (a plugin files its reminders under its own id — src/user-todos.js)
const i18nKey = (s) => s; // the extraction marker (scripts/i18n-extract.mjs): a t() key the client words per device
// lane foryou-plugin-notices: what the row's ✓ does on a suggestion (its title) — ONE ✓ by the owner adds the preselected words
const DONE_KEY = i18nKey('Add these words to your Dropline dictionary');
/** the item's DOOR: the plugin's sheet on the teach panel, this proposal's card chosen with its preselected words */
const openOf = (p) => (p ? { kind: 'plugin-settings', plugin: ITEM_KEY, panel: 'teach', prefill: { proposal: p.id, terms: (p.pick || []).slice(0, 32) }, done: DONE_KEY } : { kind: 'plugin-settings', plugin: ITEM_KEY, panel: 'teach' });

function create({ client, plugin, userTodos = null, now = Date.now, log = console, model = T, ledgerFile = null }) {
  let vocab = { at: 0, terms: [] };
  const previews = new Map();     // preview id → {conv, title, source, text, hash} (the exact text the dialog showed)
  const settings = () => model.settingsOf(typeof plugin.settings === 'function' ? plugin.settings() : {}); // the settings rows (src/plugin-settings.js voice-input), never rec.config
  const state = () => model.prune((plugin.peek() || {}).teach, now());
  const save = (st) => plugin.update((rec) => { rec.teach = st; });
  const httpErr = (status, code, message) => Object.assign(new Error(message), { status, code });
  const capOk = (kind) => model.capLeft(state(), kind, now()) > 0;
  // THE SUGGESTION LEDGER (lane voice-dictionary-nag): read once from the plugin's own store file, written whole on each
  // change (no file named — a test — ⇒ in memory)
  let ledger = null;
  const readLedger = () => {
    if (ledger) return ledger;
    let raw = null;
    if (ledgerFile) { try { raw = JSON.parse(fs.readFileSync(ledgerFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') log.warn?.(`[voice] the suggestion ledger was not read: ${e && e.message}`); } }
    return (ledger = VM.ledgerOf(raw));
  };
  const writeLedger = (L) => {
    ledger = VM.ledgerOf(L);
    if (ledgerFile) { try { writeJsonAtomic(ledgerFile, { v: 1, words: ledger.words }, { mode: 0o600 }); } catch (e) { log.warn?.(`[voice] the suggestion ledger was not written: ${e && e.message}`); } }
    return ledger;
  };
  /** the dictionary (a read, cached an hour) — proposals never repeat a word it already holds */
  async function known() {
    if (vocab.at && now() - vocab.at < 3600e3) return vocab.terms;
    try { vocab = { at: now(), terms: await client.vocabulary() }; } catch (e) { vocab = { at: now(), terms: vocab.terms }; log.warn?.(`[voice] the Dropline vocabulary was not read: ${e && e.message}`); }
    return vocab.terms;
  }
  // 加入 ⇒ the words sent are KNOWN at once (the hour's cached read would offer them again)
  const learnKnown = (terms) => { vocab = { at: vocab.at, terms: [...vocab.terms, ...terms] }; };
  function closeItem(p, by = 'user') {
    if (!p || !p.itemId || !userTodos) return;
    try { const it = typeof userTodos.get === 'function' ? userTodos.get(p.itemId) : null; if (!it || it.status === 'open') userTodos.setStatus(p.itemId, 'done', by); } catch (e) { log.warn?.(`[voice] the proposal's For-you item was not closed: ${e && e.message}`); }
  }
  // lane voice-dictionary-nag: filed `low` — a plugin's low reminder waits in band 5 with the other asks, never pinned
  // under urgent, no badge, no toast (src/attention-model.js bandOfRow)
  function fileItem(p) {
    if (!userTodos) return null;
    try {
      const r = userTodos.add(ITEM_KEY, { text: model.teachWords(p.lang, 'proposal', { terms: p.pick.join(', ') }), detail: model.teachWords(p.lang, 'detail'), options: [model.teachWords(p.lang, 'add'), model.teachWords(p.lang, 'ignore')], origin: 'plugin', plugin: ITEM_KEY, open: openOf(p), kind: 'action', urgency: 'low', by: 'agent', sessionName: 'Voice input · Dropline' });
      return (r && r.id) || null;
    } catch (e) { log.warn?.(`[voice] the proposal's For-you item was not filed: ${e && e.message}`); return null; }
  }
  /** THE ONE open suggestion item: the plugin's open item in the store (the newest, when an older instance left two) */
  const openItem = () => {
    if (!userTodos || typeof userTodos.openItems !== 'function') return null;
    return userTodos.openItems().filter((i) => i.sessionKey === ITEM_KEY).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  };
  /** an item's words: the engine's own record of it, or (an item filed before this lane) its proposal's preselection */
  const itemWords = (id, st) => (st.item && st.item.id === id ? st.item.terms : ((st.proposals.find((x) => x.itemId === id) || {}).pick || []));
  /** the open item re-worded IN PLACE (the store's reshaping door: one save + one broadcast, the id kept — the tray patches
   *  its keyed row); its door = the newest card of the batch */
  function reword(id, terms, lang, p) {
    if (!userTodos || typeof userTodos.reshapeItems !== 'function') return false;
    const text = model.teachWords(lang, 'proposal', { terms: terms.join(', ') });
    try {
      return userTodos.reshapeItems((it) => {
        if (it.id !== id || it.status !== 'open') return false;
        it.text = text; it.open = openOf(p); it.urgency = 'low';
        delete it.judged; // new words, no old verdict (the store's F2 rule)
        return true;
      }) > 0;
    } catch (e) { log.warn?.(`[voice] the suggestion's For-you item was not re-worded: ${e && e.message}`); return false; }
  }
  /** a card on the sheet answered `words`: they leave the open item — re-worded in place, or (none left) closed once the
   *  caller saved (→ the id to close) */
  function shrinkItem(st, words) {
    if (!st.item) return { st, close: null };
    const gone = new Set(words.map((w) => String(w).toLowerCase()));
    const left = st.item.terms.filter((t) => !gone.has(t.toLowerCase()));
    if (left.length === st.item.terms.length) return { st, close: null };
    if (!left.length) return { st: { ...st, item: null }, close: st.item.id };
    const p = st.proposals.filter((x) => x.itemId === st.item.id).slice(-1)[0] || null;
    reword(st.item.id, left, st.item.lang, p);
    return { st: { ...st, item: { ...st.item, terms: left } }, close: null };
  }
  /** a dictation landed in conversation `conv`: maybe a proposal (card + For-you), maybe the project's auto terms,
   *  maybe the context — the first one a PREVIEW the browser shows before anything leaves */
  async function seen({ conv, title = '', cwd = '', messages = [], files = [], groupName = '', uiLang = 'en' } = {}) {
    const set = settings();
    const out = { proposal: null, auto: null, preview: null, context: null };
    conv = String(conv || '').slice(0, 120);
    if ((!set.teach && !set.context) || !conv || !client.connected()) return out;
    let st = state();
    const at = now();
    if (set.teach) {
      const kn = await known();
      const terms = VM.termsOf({ messages, files, cwd, groupName, known: kn });            // the per-project tier's input
      // the card's: words a person says — minus what the vendor knows AND the evidence a dismissal consumed (rule 1)
      const candidates = VM.proposalCandidates({ messages, files, cwd, groupName, known: kn, ledger: readLedger() });
      const v = model.proposalVerdict(st, { conv, cwd, terms, candidates, now: at, settings: set, kindOf: VM.termKind, autoFrom: VM.autoSourcesOf({ messages, files, cwd }) });
      if (v.auto.length) {
        try {
          const r = await client.terms(v.auto);
          st = model.journalAdd(model.recordAuto(model.recordCall(st, 'terms', at), v.auto.length, at), { at, kind: 'terms', title, chars: v.auto.join(', ').length, added: r.added.length, skipped: r.skipped.length, auto: true });
          out.auto = { terms: v.auto, added: r.added, skipped: r.skipped };
        } catch (e) { log.warn?.(`[voice] the project's terms were not sent: ${e && e.message}`); }
      }
      // THE PACE (lane voice-dictionary-nag, PURE voice-model suggestionPace): an open item ⇒ the words merge into it; a
      // dismissal less than a day ago ⇒ no For-you item (the card waits on the sheet); mode settings-only or nothing
      // preselected ⇒ only the card (and the settings list); 「词典建议」 off ⇒ nothing is proposed
      const toItem = v.propose.length > 0 && v.pick.length > 0 && set.mode === 'item';
      const pace = toItem ? VM.suggestionPace({ open: !!openItem(), ledger: readLedger(), now: at }) : { act: 'card' };
      if (v.propose.length && set.suggest) {
        const why = Object.fromEntries(candidates.filter((c) => v.propose.includes(c.term)).map((c) => [c.term, { why: c.why, seen: c.seen, byPerson: c.byPerson }]));
        const p = { id: 'vp' + crypto.randomBytes(5).toString('hex'), conv, cwd, title: String(title).slice(0, 200), terms: v.propose, pick: v.pick, why, at, lang: ['zh', 'ja'].includes(uiLang) ? uiLang : 'en' };
        p.itemId = null;   // the For-you chip adds the preselected words — none ⇒ only the card
        if (pace.act === 'update') {
          const open = openItem();
          const merged = VM.mergeTerms(itemWords(open.id, st), v.pick);
          if (reword(open.id, merged, p.lang, p)) { p.itemId = open.id; st.item = { id: open.id, terms: merged, lang: p.lang }; }
        } else if (pace.act === 'file') {
          p.itemId = fileItem(p);
          if (p.itemId) st.item = { id: p.itemId, terms: v.pick.slice(), lang: p.lang };
        }
        writeLedger(VM.ledgerSuggested(readLedger(), candidates.filter((c) => v.propose.includes(c.term)), at)); // their occurrences = the evidence a dismissal consumes
        st = model.hold(st, conv, v.below, v.propose);
        st.proposals = [...st.proposals.filter((x) => x.conv !== conv), p].slice(-model.TEACH_LIMITS.proposalsMax);
        st.lastProposal[conv] = at;
        out.proposal = p;
      }
    }
    if (set.context) {
      const c = VM.teachContextOf({ title, messages, cwd, files });
      const hash = crypto.createHash('sha256').update(c.text).digest('hex').slice(0, 16);
      const v = c.text ? model.contextVerdict(st, { conv, hash, now: at, settings: set }) : { act: 'none' };
      if (v.act === 'preview') {
        const id = 'cx' + crypto.randomBytes(5).toString('hex');
        for (const [k, x] of previews) if (x.conv === conv) previews.delete(k);
        previews.set(id, { conv, ...c, hash });
        out.preview = { id, ...c };
      } else if (v.act === 'send') {
        try {
          await client.context({ title: c.title, text: c.text });
          st = model.journalAdd(model.recordCall(st, 'context', at), { at, kind: 'context', title: c.title, chars: c.text.length });
          st.ctxSent[conv] = { at, hash };
          out.context = { sent: true, chars: c.text.length };
        } catch (e) { log.warn?.(`[voice] the context was not sent: ${e && e.message}`); }
      }
    }
    save(st);
    return out;
  }
  /** the preview's answer: 发送 ⇒ ONE /v1/context with exactly the previewed text; 不发 ⇒ nothing leaves */
  async function answerPreview(id, send) {
    const p = previews.get(String(id || ''));
    if (!p) throw httpErr(404, 'no-preview', 'that preview is gone — dictate again to see a new one');
    previews.delete(String(id));
    const at = now();
    let st = state();
    if (!send) { st.ctxSent[p.conv] = { at, hash: p.hash, declined: true }; save(st); return { sent: false }; }
    if (!settings().context) throw httpErr(409, 'context-off', 'sending context is turned off');
    if (!capOk('context')) throw httpErr(429, 'teach-cap', 'this instance sent its context 6 times this hour — try later');
    await client.context({ title: p.title, text: p.text });
    st = model.journalAdd(model.recordCall(state(), 'context', at), { at, kind: 'context', title: p.title, chars: p.text.length });
    st.ctxSent[p.conv] = { at, hash: p.hash };
    save(st);
    return { sent: true, chars: p.text.length };
  }
  /** 加入词库: exactly the ticked terms of THIS proposal (∩ its terms) — ONE POST /v1/terms */
  async function confirm(proposalId, terms) {
    let st = state();
    const p = st.proposals.find((x) => x.id === proposalId);
    if (!p) throw httpErr(404, 'no-proposal', 'that suggestion is gone');
    const pick = [...new Set((Array.isArray(terms) ? terms : []).filter((t) => p.terms.includes(t)))];
    if (!pick.length) throw httpErr(400, 'no-terms', 'tick at least one word');
    if (!settings().teach) throw httpErr(409, 'teach-off', 'teaching Dropline is turned off');
    if (!capOk('terms')) throw httpErr(429, 'teach-cap', 'this instance sent its terms 6 times this hour — try later');
    const r = await client.terms(pick);
    const at = now();
    st = model.journalAdd(model.recordCall(state(), 'terms', at), { at, kind: 'terms', title: p.title, chars: pick.join(', ').length, added: r.added.length, skipped: r.skipped.length });
    st.proposals = st.proposals.filter((x) => x.id !== p.id);
    // lane voice-dictionary-nag: the sent words are KNOWN (they leave the ledger and the open item)
    writeLedger(VM.ledgerAdded(readLedger(), pick)); learnKnown(pick);
    const sh = p.itemId && st.item && st.item.id === p.itemId ? shrinkItem(st, p.terms) : { st, close: p.itemId }; // the card's words leave the item (its unticked ones were looked at)
    save(sh.st);
    if (sh.close) closeItem({ itemId: sh.close }, 'voice-input'); // the producer closes it — no answer of the person's
    return { added: r.added, skipped: r.skipped };
  }
  /** 忽略: the proposal's terms are not offered again for 30 days; nothing leaves */
  function ignore(proposalId) {
    let st = state();
    const p = st.proposals.find((x) => x.id === proposalId);
    if (!p) throw httpErr(404, 'no-proposal', 'that suggestion is gone');
    st = model.ignore(st, p.terms, now());
    st.proposals = st.proposals.filter((x) => x.id !== p.id);
    writeLedger(VM.ledgerDismissed(readLedger(), p.terms, now())); // lane voice-dictionary-nag: a dismissal, counted like ✕
    const sh = p.itemId && st.item && st.item.id === p.itemId ? shrinkItem(st, p.terms) : { st, close: p.itemId };
    save(sh.st);
    if (sh.close) closeItem({ itemId: sh.close }, 'voice-input'); // the producer closes it — no answer of the person's
    return { ignored: p.terms.length };
  }
  /** THE ITEM'S ANSWERS (lane voice-dictionary-nag) — 加入 / ✓: exactly the item's words, ONE POST /v1/terms; they become
   *  known. The batch's cards leave the sheet. */
  async function addItem(itemId) {
    let st = state();
    const words = itemWords(itemId, st);
    if (!words.length) return { added: [], skipped: [] };
    if (!settings().teach) throw httpErr(409, 'teach-off', 'teaching Dropline is turned off');
    if (!capOk('terms')) throw httpErr(429, 'teach-cap', 'this instance sent its terms 6 times this hour — try later');
    const r = await client.terms(words);
    const at = now();
    const p = st.proposals.filter((x) => x.itemId === itemId).slice(-1)[0] || {};
    st = model.journalAdd(model.recordCall(state(), 'terms', at), { at, kind: 'terms', title: p.title || '', chars: words.join(', ').length, added: r.added.length, skipped: r.skipped.length });
    st.proposals = st.proposals.filter((x) => x.itemId !== itemId);
    if (st.item && st.item.id === itemId) st.item = null;
    save(st);
    writeLedger(VM.ledgerAdded(readLedger(), words)); learnKnown(words);
    return { added: r.added, skipped: r.skipped };
  }
  /** ✕ / 忽略 / 全部标为已看: «not now» — the item's words' evidence is CONSUMED (they come back only from a new dictation); nothing leaves.
   *  The batch's cards leave the sheet. */
  function dismissItem(itemId) {
    let st = state();
    const words = itemWords(itemId, st);
    writeLedger(VM.ledgerDismissed(readLedger(), words, now()));
    st.proposals = st.proposals.filter((x) => x.itemId !== itemId);
    if (st.item && st.item.id === itemId) st.item = null;
    save(st);
    return { dismissed: words.length };
  }
  /** THE SETTINGS LIST's per-word answers (All Settings › Voice input › 「词典建议」 — rule 3, the refusal's door): 加入 ⇒
   *  ONE POST /v1/terms with that word (known at once); 忽略 ⇒ its evidence is consumed (a dismissal — it comes back only
   *  from a new dictation). Either way the word leaves the cards and the open item (re-worded in place, or closed). */
  async function answerWord(term, verb) {
    if (verb !== 'add' && verb !== 'ignore') throw httpErr(400, 'bad-request', 'verb must be add or ignore');
    const t = String(term || '').trim().toLowerCase();
    let st = state();
    const has = (x) => String(x).toLowerCase() === t;
    const word = t && (st.proposals.flatMap((p) => p.terms).find(has) || (st.item ? st.item.terms.find(has) : null));
    if (!word) throw httpErr(404, 'no-candidate', 'that word is not suggested now');
    if (verb === 'add') {
      if (!settings().teach) throw httpErr(409, 'teach-off', 'teaching Dropline is turned off');
      if (!capOk('terms')) throw httpErr(429, 'teach-cap', 'this instance sent its terms 6 times this hour — try later');
      const r = await client.terms([word]);
      const at = now();
      st = model.journalAdd(model.recordCall(state(), 'terms', at), { at, kind: 'terms', title: '', chars: word.length, added: r.added.length, skipped: r.skipped.length });
      writeLedger(VM.ledgerAdded(readLedger(), [word])); learnKnown([word]);
    } else writeLedger(VM.ledgerDismissed(readLedger(), [word], now()));
    st.proposals = st.proposals.map((p) => ({ ...p, terms: p.terms.filter((x) => !has(x)), pick: (p.pick || []).filter((x) => !has(x)) })).filter((p) => p.terms.length);
    const sh = shrinkItem(st, [word]);
    save(sh.st);
    if (sh.close) closeItem({ itemId: sh.close }, 'voice-input'); // the producer closes it — no answer of the person's
    return view();
  }
  /** every word suggested now (the sheet's cards, newest first, then the open item's) — the settings list */
  const candidatesOf = (st) => {
    const out = [];
    const put = (term, why) => { if (!out.some((x) => x.term.toLowerCase() === term.toLowerCase())) out.push({ term, why: why || null }); };
    for (const p of st.proposals.slice().reverse()) for (const term of p.terms) put(term, p.why && p.why[term] ? p.why[term].why : null);
    if (st.item) for (const term of st.item.terms) put(term, null);
    return out;
  };
  /** the switches: teach, context, and a project's auto tier ({autoProject: {cwd, on}}) */
  function setSettings(patch = {}) {
    const w = {};
    if (typeof patch.teach === 'boolean') w.teach = patch.teach;
    if (typeof patch.context === 'boolean') w.context = patch.context;
    if (typeof patch.suggest === 'boolean') w.suggest = patch.suggest; // lane voice-dictionary-nag: 「词典建议」
    if (patch.suggestionsMode === 'item' || patch.suggestionsMode === 'settings-only') w.suggestionsMode = patch.suggestionsMode; // voice.suggestions.mode
    const ap = patch.autoProject;
    if (ap && typeof ap.cwd === 'string' && ap.cwd.startsWith('/')) {
      const cur = settings().autoProjects.filter((c) => c !== ap.cwd);
      w.autoProjects = ap.on ? [...cur, ap.cwd.slice(0, 4096)].slice(-model.TEACH_LIMITS.projectsMax) : cur;
    }
    if (Object.keys(w).length) plugin.writeSettings(w); // through the ONE settings writer (settings-updated reaches every tab)
    return view();
  }
  function view() {
    const st = state();
    return { settings: settings(), proposals: st.proposals.map(({ id, conv, cwd, title, terms, pick, why, at }) => ({ id, conv, cwd, title, terms, pick: pick || [], why: why || {}, at })), journal: st.journal.slice().reverse(), caps: { terms: model.capLeft(st, 'terms', now()), context: model.capLeft(st, 'context', now()) }, candidates: candidatesOf(st) };
  }
  // the For-you chip IS the press: 加入词库 adds the item's words, 忽略 is «not now»
  // lane foryou-plugin-notices: and so is the row's ✓ (its title says so — the door's `done`): ONE ✓ by the owner adds the
  // words; a ✓ that could not add (teach turned off, the hour's cap) REOPENS the row — the words were not sent, so the
  // reminder stays. Lane voice-dictionary-nag: × (dismissed) and 「全部标为已看」 (a batch) are «not now» too — the ledger
  // remembers them (the fleet user's 18 dismissals were forgotten: the same words came back the same day); the expiry and
  // a reopen do nothing
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, ev = {}) => {
      if (!it || it.sessionKey !== ITEM_KEY) return;
      const reply = it.reply && it.reply.text;
      const st = state();
      const lang = st.item && st.item.id === it.id ? st.item.lang : (st.proposals.find((x) => x.itemId === it.id) || {}).lang || 'en';
      if (!(st.item && st.item.id === it.id) && !st.proposals.some((x) => x.itemId === it.id)) return;
      const byUser = ev.by === 'user';
      const tick = !reply && ev.status === 'done' && byUser && !ev.batch;
      const add = tick || (!!reply && reply === model.teachWords(lang, 'add'));
      const notNow = (!!reply && reply === model.teachWords(lang, 'ignore')) || (!reply && byUser && (ev.status === 'dismissed' || (ev.status === 'done' && ev.batch === true)));
      if (add) {
        addItem(it.id).catch((e) => {
          log.warn?.(`[voice] the For-you ✓ did not add the words: ${e && e.message}`);
          if (tick) { try { if (userTodos.get(it.id)?.status === 'done') userTodos.setStatus(it.id, 'open', 'voice-input'); } catch { } }
        });
      } else if (notNow) { try { dismissItem(it.id); } catch (e) { log.warn?.(`[voice] the dismissal was not remembered: ${e && e.message}`); } }
    });
  }
  // lane foryou-plugin-notices: the items filed BEFORE the door existed (origin 'server', no `open`) take the plugin's origin
  // and their door once, at boot (the store's reshaping door) — the owner's open rows jump and pin too, not only new ones
  if (userTodos && typeof userTodos.reshapeItems === 'function') {
    try {
      const byItem = new Map(state().proposals.filter((p) => p.itemId).map((p) => [p.itemId, p]));
      userTodos.reshapeItems((it) => {
        if (it.sessionKey !== ITEM_KEY || it.status !== 'open') return false;
        let changed = false;
        if (it.origin !== 'plugin') { it.origin = 'plugin'; it.plugin = ITEM_KEY; it.open = openOf(byItem.get(it.id)); changed = true; }
        if (it.urgency !== 'low' && it.urgency !== 'urgent') { it.urgency = 'low'; changed = true; } // lane voice-dictionary-nag: an open suggestion unpins too
        return changed;
      });
    } catch (e) { log.warn?.(`[voice] the older For-you items were not given their door: ${e && e.message}`); }
  }
  return { seen, answerPreview, confirm, ignore, addItem, dismissItem, answerWord, setSettings, view, capOk };
}

module.exports = { create, ITEM_KEY, DONE_KEY };
