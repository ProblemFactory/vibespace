'use strict';
// THE TEACH ENGINE of Dropline voice input (design q-029 §4 + §8 owner rulings; lane voice-p1-oauth-teach). The schedule
// is PURE (src/voice-teach.js); this file holds its state in the plugin record (`rec.teach`), files the proposal's
// For-you item, and calls the ONE vendor module (src/server/dropline-client.js) — terms() only after the person's
// press (the card's 加入词库 or the For-you chip) or for a project they opted in; context() only after the first-time
// preview's 发送. A dictation with teach + context OFF reaches nothing here (`seen` returns before any read).
const crypto = require('crypto');
const T = require('../voice-teach.js');
const VM = require('../voice-model.js');

const ITEM_KEY = require('../plugins/voice-input.js').id;   // the For-you items' key = THE PLUGIN'S ID (a plugin files its reminders under its own id — src/user-todos.js)
const i18nKey = (s) => s; // the extraction marker (scripts/i18n-extract.mjs): a t() key the client words per device
// lane foryou-plugin-notices: what the row's ✓ does on a suggestion (its title) — ONE ✓ by the owner adds the preselected words
const DONE_KEY = i18nKey('Add these words to your Dropline dictionary');
/** the item's DOOR: the plugin's sheet on the teach panel, this proposal's card chosen with its preselected words */
const openOf = (p) => (p ? { kind: 'plugin-settings', plugin: ITEM_KEY, panel: 'teach', prefill: { proposal: p.id, terms: (p.pick || []).slice(0, 32) }, done: DONE_KEY } : { kind: 'plugin-settings', plugin: ITEM_KEY, panel: 'teach' });

function create({ client, plugin, userTodos = null, now = Date.now, log = console, model = T }) {
  let vocab = { at: 0, terms: [] };
  const previews = new Map();     // preview id → {conv, title, source, text, hash} (the exact text the dialog showed)
  const settings = () => model.settingsOf(typeof plugin.settings === 'function' ? plugin.settings() : {}); // the settings rows (src/plugin-settings.js voice-input), never rec.config
  const state = () => model.prune((plugin.peek() || {}).teach, now());
  const save = (st) => plugin.update((rec) => { rec.teach = st; });
  const httpErr = (status, code, message) => Object.assign(new Error(message), { status, code });
  const capOk = (kind) => model.capLeft(state(), kind, now()) > 0;
  /** the dictionary (a read, cached an hour) — proposals never repeat a word it already holds */
  async function known() {
    if (vocab.at && now() - vocab.at < 3600e3) return vocab.terms;
    try { vocab = { at: now(), terms: await client.vocabulary() }; } catch (e) { vocab = { at: now(), terms: vocab.terms }; log.warn?.(`[voice] the Dropline vocabulary was not read: ${e && e.message}`); }
    return vocab.terms;
  }
  function closeItem(p, by = 'user') {
    if (!p || !p.itemId || !userTodos) return;
    try { const it = typeof userTodos.get === 'function' ? userTodos.get(p.itemId) : null; if (!it || it.status === 'open') userTodos.setStatus(p.itemId, 'done', by); } catch (e) { log.warn?.(`[voice] the proposal's For-you item was not closed: ${e && e.message}`); }
  }
  function fileItem(p) {
    if (!userTodos) return null;
    try {
      const r = userTodos.add(ITEM_KEY, { text: model.teachWords(p.lang, 'proposal', { terms: p.pick.join(', ') }), detail: model.teachWords(p.lang, 'detail'), options: [model.teachWords(p.lang, 'add'), model.teachWords(p.lang, 'ignore')], origin: 'plugin', plugin: ITEM_KEY, open: openOf(p), kind: 'action', urgency: 'normal', by: 'agent', sessionName: 'Voice input · Dropline' });
      return (r && r.id) || null;
    } catch (e) { log.warn?.(`[voice] the proposal's For-you item was not filed: ${e && e.message}`); return null; }
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
      const candidates = VM.proposalCandidates({ messages, files, cwd, groupName, known: kn }); // the card's: words a person says
      const v = model.proposalVerdict(st, { conv, cwd, terms, candidates, now: at, settings: set, kindOf: VM.termKind, autoFrom: VM.autoSourcesOf({ messages, files, cwd }) });
      if (v.auto.length) {
        try {
          const r = await client.terms(v.auto);
          st = model.journalAdd(model.recordAuto(model.recordCall(st, 'terms', at), v.auto.length, at), { at, kind: 'terms', title, chars: v.auto.join(', ').length, added: r.added.length, skipped: r.skipped.length, auto: true });
          out.auto = { terms: v.auto, added: r.added, skipped: r.skipped };
        } catch (e) { log.warn?.(`[voice] the project's terms were not sent: ${e && e.message}`); }
      }
      if (v.propose.length) {
        const why = Object.fromEntries(candidates.filter((c) => v.propose.includes(c.term)).map((c) => [c.term, { why: c.why, seen: c.seen, byPerson: c.byPerson }]));
        const p = { id: 'vp' + crypto.randomBytes(5).toString('hex'), conv, cwd, title: String(title).slice(0, 200), terms: v.propose, pick: v.pick, why, at, lang: ['zh', 'ja'].includes(uiLang) ? uiLang : 'en' };
        p.itemId = v.pick.length ? fileItem(p) : null;   // the For-you chip adds the preselected words — none ⇒ only the card
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
    save(st);
    closeItem(p);
    return { added: r.added, skipped: r.skipped };
  }
  /** 忽略: the proposal's terms are not offered again for 30 days; nothing leaves */
  function ignore(proposalId) {
    let st = state();
    const p = st.proposals.find((x) => x.id === proposalId);
    if (!p) throw httpErr(404, 'no-proposal', 'that suggestion is gone');
    st = model.ignore(st, p.terms, now());
    st.proposals = st.proposals.filter((x) => x.id !== p.id);
    save(st);
    closeItem(p);
    return { ignored: p.terms.length };
  }
  /** the switches: teach, context, and a project's auto tier ({autoProject: {cwd, on}}) */
  function setSettings(patch = {}) {
    const w = {};
    if (typeof patch.teach === 'boolean') w.teach = patch.teach;
    if (typeof patch.context === 'boolean') w.context = patch.context;
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
    return { settings: settings(), proposals: st.proposals.map(({ id, conv, cwd, title, terms, pick, why, at }) => ({ id, conv, cwd, title, terms, pick: pick || [], why: why || {}, at })), journal: st.journal.slice().reverse(), caps: { terms: model.capLeft(st, 'terms', now()), context: model.capLeft(st, 'context', now()) } };
  }
  // the For-you chip IS the press: 加入词库 adds the preselected words it shows, 忽略 ignores the batch
  // lane foryou-plugin-notices: and so is the row's ✓ (its title says so — the door's `done`): ONE ✓ by the owner adds the
  // preselected words; 「全部标为已看」 (a batch), the expiry, × and a reopen send nothing. A ✓ that could not add (teach
  // turned off, the hour's cap) REOPENS the row — the words were not sent, so the reminder stays
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, ev = {}) => {
      if (!it || it.sessionKey !== ITEM_KEY) return;
      const reply = it.reply && it.reply.text;
      const tick = !reply && ev.status === 'done' && ev.by === 'user' && !ev.batch;
      if (!reply && !tick) return;
      const p = state().proposals.find((x) => x.itemId === it.id);
      if (!p) return;
      if (tick) {
        confirm(p.id, p.pick || p.terms).catch((e) => {
          log.warn?.(`[voice] the For-you ✓ did not add the words: ${e && e.message}`);
          try { if (userTodos.get(it.id)?.status === 'done') userTodos.setStatus(it.id, 'open', 'voice-input'); } catch { }
        });
      } else if (reply === model.teachWords(p.lang, 'add')) confirm(p.id, p.pick || p.terms).catch((e) => log.warn?.(`[voice] the For-you 加入词库 failed: ${e && e.message}`));
      else if (reply === model.teachWords(p.lang, 'ignore')) { try { ignore(p.id); } catch { } }
    });
  }
  // lane foryou-plugin-notices: the items filed BEFORE the door existed (origin 'server', no `open`) take the plugin's origin
  // and their door once, at boot (the store's reshaping door) — the owner's open rows jump and pin too, not only new ones
  if (userTodos && typeof userTodos.reshapeItems === 'function') {
    try {
      const byItem = new Map(state().proposals.filter((p) => p.itemId).map((p) => [p.itemId, p]));
      userTodos.reshapeItems((it) => {
        if (it.sessionKey !== ITEM_KEY || it.status !== 'open' || it.origin === 'plugin') return false;
        it.origin = 'plugin'; it.plugin = ITEM_KEY; it.open = openOf(byItem.get(it.id));
        return true;
      });
    } catch (e) { log.warn?.(`[voice] the older For-you items were not given their door: ${e && e.message}`); }
  }
  return { seen, answerPreview, confirm, ignore, setSettings, view, capOk };
}

module.exports = { create, ITEM_KEY, DONE_KEY };
