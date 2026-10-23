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
// lane voice-teach-skips (the owner 2026-10-22: every terms write since the feature shipped added 0 — «如果加入会跳过为啥还让我
// 加入»): EVERY terms write goes through `afterTerms` — the journal row keeps the words + the vendor's skipped entries and
// reasons, the skipped words are remembered 30 days (never proposed meanwhile), the added ones are known at once, the
// dictionary read is cached per ACCOUNT for a day and read again after each write; five writes in a row that added nothing
// file ONE low For-you item naming the reasons (停止发词 = teach off; a later add closes it). A folder set to automatic (and
// its subfolders) asks nothing: its words go within the caps, the rest wait in `pending` — the next dictation or the tick
// (`tickMs`, the wiring's) sends them.
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

function create({ client, plugin, userTodos = null, now = Date.now, log = console, model = T, ledgerFile = null, tickMs = 0 }) {
  let vocab = { at: 0, terms: [], who: null, stale: false };
  const learned = new Map();      // lane voice-teach-skips: lower case → {term, at} — words the vendor ADDED (known before a read shows them)
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
  /** the dictionary (a read) — proposals never repeat a word it already holds. Lane voice-teach-skips: cached per ACCOUNT
   *  (another sign-in reads again), for a day, and read again after each write (`stale`); + the words the vendor added */
  const whoOf = () => { try { const a = typeof client.account === 'function' ? client.account() : null; return a ? [a.tier, a.name, a.team].join('|') : ''; } catch { return ''; } };
  async function known() {
    const who = whoOf(), at = now();
    if (vocab.who !== null && vocab.who !== who) learned.clear();
    if (!(vocab.at && vocab.who === who && !vocab.stale && at - vocab.at < model.TEACH_LIMITS.vocabEveryMs)) {
      try { vocab = { at, terms: await client.vocabulary(), who, stale: false }; } catch (e) { vocab = { at, terms: vocab.who === who ? vocab.terms : [], who, stale: false }; log.warn?.(`[voice] the Dropline vocabulary was not read: ${e && e.message}`); }
    }
    for (const [k, x] of learned) if (!(at - x.at < model.TEACH_LIMITS.vocabEveryMs)) learned.delete(k);
    return [...vocab.terms, ...[...learned.values()].map((x) => x.term)];
  }
  // the words the vendor ADDED are KNOWN at once (a read right after a write may not show them yet)
  const learnKnown = (terms) => { for (const t of terms) learned.set(String(t).toLowerCase(), { term: String(t), at: now() }); };
  function closeItem(p, by = 'user') {
    if (!p || !p.itemId || !userTodos) return;
    try { const it = typeof userTodos.get === 'function' ? userTodos.get(p.itemId) : null; if (!it || it.status === 'open') userTodos.setStatus(p.itemId, 'done', by); } catch (e) { log.warn?.(`[voice] the proposal's For-you item was not closed: ${e && e.message}`); }
  }
  // lane voice-dictionary-nag: filed `low` — a plugin's low reminder waits in band 5 with the other asks, never pinned
  // under urgent, no badge, no toast (src/attention-model.js bandOfRow). Lane voice-teach-skips: the ONE filing door of the
  // plugin's items (the proposal's and the skip streak's)
  function fileTodo(words, open, what) {
    if (!userTodos) return null;
    try {
      const r = userTodos.add(ITEM_KEY, { ...words, origin: 'plugin', plugin: ITEM_KEY, open, kind: 'action', urgency: 'low', by: 'agent', sessionName: 'Voice input · Dropline' });
      return (r && r.id) || null;
    } catch (e) { log.warn?.(`[voice] the ${what} For-you item was not filed: ${e && e.message}`); return null; }
  }
  const fileItem = (p) => fileTodo({ text: model.teachWords(p.lang, 'proposal', { terms: p.pick.join(', ') }), detail: model.teachWords(p.lang, 'detail'), options: [model.teachWords(p.lang, 'add'), model.teachWords(p.lang, 'ignore')] }, openOf(p), "proposal's");
  /** lane voice-teach-skips: the skip streak's ONE item — the reasons in words, 停止发词 / 知道了, the teach panel its door */
  const fileStreak = (k, lang) => fileTodo({ text: model.teachWords(lang, 'streak', { n: k.writes, reasons: model.reasonsWords(lang, k.reasons) }), detail: model.teachWords(lang, 'streakDetail'), options: [model.teachWords(lang, 'streakOff'), model.teachWords(lang, 'streakOk')] }, openOf(null), 'skip streak\'s');
  /** EVERY terms write lands here (lane voice-teach-skips): the call counted, the journal row with the words + the vendor's
   *  skipped entries + reasons, the skips remembered 30 d, the added words known, the read made stale, the answered words
   *  off every card and out of the queue; the streak filed once (five writes, nothing added) or closed by an add */
  function afterTerms(st, words, r, { auto = false, folder = null, title = '', at }) {
    const skips = Array.isArray(r.skips) ? r.skips : (Array.isArray(r.skipped) ? r.skipped : []).map((term) => ({ term: String(term), reason: null }));
    st = model.recordCall(st, 'terms', at);
    if (auto) st = model.recordAuto(st, words.length, at);
    st = model.journalAdd(st, { at, kind: 'terms', title, chars: words.join(', ').length, added: r.added.length, skipped: skips.length, auto, words, skips, folder });
    st = model.rememberSkips(st, skips, at);
    learnKnown(r.added); vocab.stale = true;
    const gone = new Set([...r.added, ...skips.map((x) => x.term)].map((w) => String(w).toLowerCase()));
    const off = (x) => !gone.has(String(x).toLowerCase());
    st.proposals = st.proposals.map((p) => ({ ...p, terms: p.terms.filter(off), pick: (p.pick || []).filter(off) })).filter((p) => p.terms.length);
    st.pending = st.pending.filter((x) => off(x.term));
    if (r.added.length) { if (st.streak && st.streak.itemId) closeItem({ itemId: st.streak.itemId }, 'voice-input'); st.streak = null; }
    else if (!st.streak) { const k = model.skipStreak(st); if (k) st.streak = { at, itemId: fileStreak(k, st.lang || 'en') }; }
    return st;
  }
  /** the next tick (lane voice-teach-skips): the automatic folders' waiting words that may go now — ONE /v1/terms */
  let flushing = false;
  async function flushPending(st, at, kn) {
    if (flushing || !st.pending.length) return st;
    const d = model.pendingDue(st, { now: at, settings: settings(), known: kn });
    st.pending = d.keep;
    if (!d.send.length) return st;
    const words = d.send.map((x) => x.term);
    const folder = d.send.every((x) => x.folder === d.send[0].folder) ? d.send[0].folder : null;
    flushing = true;
    try { return afterTerms(st, words, await client.terms(words), { auto: true, folder, at }); } catch (e) { log.warn?.(`[voice] the waiting words were not sent: ${e && e.message}`); st.pending = [...d.send, ...d.keep]; return st; } finally { flushing = false; }
  }
  /** the tick's own door: teach on, signed in, words waiting ⇒ flushPending, saved */
  async function flush() {
    if (!settings().teach || !client.connected() || !state().pending.length) return null;
    const kn = await known();
    const st = await flushPending(state(), now(), kn);
    save(st);
    return { waiting: st.pending.length };
  }
  /** THE ONE open suggestion item: the plugin's open item in the store (the newest, when an older instance left two) — never
   *  the skip streak's item (the same plugin files it; a batch merged into it would re-word it into a suggestion) */
  const openItem = () => {
    if (!userTodos || typeof userTodos.openItems !== 'function') return null;
    const streakId = (state().streak || {}).itemId || null;
    return userTodos.openItems().filter((i) => i.sessionKey === ITEM_KEY && i.id !== streakId).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
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
    const out = { proposal: null, auto: null, queued: null, preview: null, context: null };
    conv = String(conv || '').slice(0, 120);
    if ((!set.teach && !set.context) || !conv || !client.connected()) return out;
    let st = state();
    const at = now();
    st.lang = ['zh', 'ja'].includes(uiLang) ? uiLang : 'en';
    if (set.teach) {
      const kn = await known();
      const terms = VM.termsOf({ messages, files, cwd, groupName, known: kn });            // the per-project tier's input
      // the card's: words a person says — minus what the vendor knows AND the evidence a dismissal consumed (rule 1)
      const candidates = VM.proposalCandidates({ messages, files, cwd, groupName, known: kn, ledger: readLedger() });
      st = await flushPending(st, at, kn);   // lane voice-teach-skips: the words an automatic folder left waiting go first
      const v = model.proposalVerdict(st, { conv, cwd, terms, candidates, now: at, settings: set, kindOf: VM.termKind, autoFrom: VM.autoSourcesOf({ messages, files, cwd }) });
      if (v.auto.length) {
        try {
          const r = await client.terms(v.auto);
          st = afterTerms(st, v.auto, r, { auto: true, folder: v.folder, title, at });
          out.auto = { terms: v.auto, added: r.added, skipped: r.skipped, skips: r.skips || [], folder: v.folder };
        } catch (e) { log.warn?.(`[voice] the automatic folder's words were not sent: ${e && e.message}`); st = model.queueWords(st, v.auto, v.folder, at); }
      }
      // lane voice-teach-skips: over this hour's room ⇒ no ask — the words wait, the next tick sends them (the toast says so)
      if (v.queued.length) {
        const before = st.pending.length;
        st = model.queueWords(st, v.queued, v.folder, at);
        out.queued = { n: st.pending.length - before, waiting: st.pending.length, folder: v.folder };
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
          vocab.stale = true;   // lane voice-teach-skips: Dropline adds the words it gets wrong from a context — read again
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
    vocab.stale = true;
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
    st = afterTerms(state(), pick, r, { title: p.title, at });
    st.proposals = st.proposals.filter((x) => x.id !== p.id);
    // lane voice-dictionary-nag: the sent words are KNOWN (they leave the ledger and the open item)
    writeLedger(VM.ledgerAdded(readLedger(), pick));   // afterTerms knows the ADDED ones and remembers the skipped (lane voice-teach-skips)
    const sh = p.itemId && st.item && st.item.id === p.itemId ? shrinkItem(st, p.terms) : { st, close: p.itemId }; // the card's words leave the item (its unticked ones were looked at)
    save(sh.st);
    if (sh.close) closeItem({ itemId: sh.close }, 'voice-input'); // the producer closes it — no answer of the person's
    return { added: r.added, skipped: r.skipped, skips: r.skips || [] };   // lane voice-teach-skips: the toast names each reason
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
    st = afterTerms(state(), words, r, { title: p.title || '', at });
    st.proposals = st.proposals.filter((x) => x.itemId !== itemId);
    if (st.item && st.item.id === itemId) st.item = null;
    save(st);
    writeLedger(VM.ledgerAdded(readLedger(), words));
    return { added: r.added, skipped: r.skipped, skips: r.skips || [] };
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
    let st = state(), result = null;
    const has = (x) => String(x).toLowerCase() === t;
    const word = t && (st.proposals.flatMap((p) => p.terms).find(has) || (st.item ? st.item.terms.find(has) : null));
    if (!word) throw httpErr(404, 'no-candidate', 'that word is not suggested now');
    if (verb === 'add') {
      if (!settings().teach) throw httpErr(409, 'teach-off', 'teaching Dropline is turned off');
      if (!capOk('terms')) throw httpErr(429, 'teach-cap', 'this instance sent its terms 6 times this hour — try later');
      const r = await client.terms([word]);
      const at = now();
      st = afterTerms(state(), [word], r, { at });
      writeLedger(VM.ledgerAdded(readLedger(), [word]));
      result = { added: r.added, skipped: r.skipped, skips: r.skips || [] };
    } else writeLedger(VM.ledgerDismissed(readLedger(), [word], now()));
    st.proposals = st.proposals.map((p) => ({ ...p, terms: p.terms.filter((x) => !has(x)), pick: (p.pick || []).filter((x) => !has(x)) })).filter((p) => p.terms.length);
    const sh = shrinkItem(st, [word]);
    save(sh.st);
    if (sh.close) closeItem({ itemId: sh.close }, 'voice-input'); // the producer closes it — no answer of the person's
    return result ? { ...view(), result } : view();   // lane voice-teach-skips: 加入's outcome (the list's toast says a skip and why)
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
  // lane voice-teach-skips: a card's folder rule — the automatic folder covering its cwd (null = not covered: the card's
  // toggle names the folder it would cover, `cwd`, and offers its `parent`); the waiting words with their folder
  function view() {
    const st = state(), set = settings();
    const cover = (cwd) => (cwd ? { folder: model.folderOf(set.autoProjects, cwd), parent: model.parentOf(cwd) } : null);
    return { settings: set, proposals: st.proposals.map(({ id, conv, cwd, title, terms, pick, why, at }) => ({ id, conv, cwd, title, terms, pick: pick || [], why: why || {}, at, cover: cover(cwd) })), journal: st.journal.slice().reverse(), caps: { terms: model.capLeft(st, 'terms', now()), context: model.capLeft(st, 'context', now()) }, candidates: candidatesOf(st), pending: st.pending.map(({ term, folder, at }) => ({ term, folder, at })) };
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
      // lane voice-teach-skips: the skip streak's item — 停止发词 turns teaching off (the context switch stays); 知道了 / × change nothing
      if (st.streak && st.streak.itemId === it.id) { if (reply && reply === model.teachWords(st.lang || 'en', 'streakOff')) { try { plugin.writeSettings({ teach: false }); } catch (e) { log.warn?.(`[voice] teaching was not turned off: ${e && e.message}`); } } return; }
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
  // lane voice-teach-skips: THE TICK — the automatic folders' waiting words go once the hour's room is back (unref'd)
  if (tickMs > 0) { const t = setInterval(() => { flush().catch((e) => log.warn?.(`[voice] the waiting words were not sent: ${e && e.message}`)); }, tickMs); if (t.unref) t.unref(); }
  return { seen, answerPreview, confirm, ignore, addItem, dismissItem, answerWord, setSettings, view, capOk, flush };
}

module.exports = { create, ITEM_KEY, DONE_KEY };
