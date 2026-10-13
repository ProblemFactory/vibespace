'use strict';
// THE TEACH ENGINE of Dropline voice input (design q-029 §4 + §8 owner rulings; lane voice-p1-oauth-teach). The schedule
// is PURE (src/voice-teach.js); this file holds its state in the plugin record (`rec.teach`), files the proposal's
// For-you item, and calls the ONE vendor module (src/server/dropline-client.js) — terms() only after the person's
// press (the card's 加入词库 or the For-you chip) or for a project they opted in; context() only after the first-time
// preview's 发送. A dictation with teach + context OFF reaches nothing here (`seen` returns before any read).
const crypto = require('crypto');
const T = require('../voice-teach.js');
const VM = require('../voice-model.js');

const ITEM_KEY = 'voice-input';   // the For-you items' session key (one producer, like 'browser')

function create({ client, plugin, userTodos = null, now = Date.now, log = console, model = T }) {
  let vocab = { at: 0, terms: [] };
  const previews = new Map();     // preview id → {conv, title, source, text, hash} (the exact text the dialog showed)
  const settings = () => model.settingsOf(((plugin.peek() || {}).config) || {});
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
      const r = userTodos.add(ITEM_KEY, { text: model.teachWords(p.lang, 'proposal', { terms: p.terms.join(', ') }), detail: model.teachWords(p.lang, 'detail'), options: [model.teachWords(p.lang, 'add'), model.teachWords(p.lang, 'ignore')], origin: 'server', kind: 'action', urgency: 'normal', by: 'agent', sessionName: 'Voice input · Dropline' });
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
      const terms = VM.termsOf({ messages, files, cwd, groupName, known: await known() });
      const v = model.proposalVerdict(st, { conv, cwd, terms, now: at, settings: set, kindOf: VM.termKind, autoFrom: VM.autoSourcesOf({ messages, files, cwd }) });
      if (v.auto.length) {
        try {
          const r = await client.terms(v.auto);
          st = model.journalAdd(model.recordAuto(model.recordCall(st, 'terms', at), v.auto.length, at), { at, kind: 'terms', title, chars: v.auto.join(', ').length, added: r.added.length, skipped: r.skipped.length, auto: true });
          out.auto = { terms: v.auto, added: r.added, skipped: r.skipped };
        } catch (e) { log.warn?.(`[voice] the project's terms were not sent: ${e && e.message}`); }
      }
      if (v.propose.length) {
        const p = { id: 'vp' + crypto.randomBytes(5).toString('hex'), conv, cwd, title: String(title).slice(0, 200), terms: v.propose, at, lang: ['zh', 'ja'].includes(uiLang) ? uiLang : 'en' };
        p.itemId = fileItem(p);
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
    plugin.update((rec) => {
      rec.config = rec.config || {};
      if (typeof patch.teach === 'boolean') rec.config.teach = patch.teach;
      if (typeof patch.context === 'boolean') rec.config.context = patch.context;
      const ap = patch.autoProject;
      if (ap && typeof ap.cwd === 'string' && ap.cwd.startsWith('/')) {
        const cur = model.settingsOf(rec.config).autoProjects.filter((c) => c !== ap.cwd);
        rec.config.autoProjects = ap.on ? [...cur, ap.cwd.slice(0, 4096)].slice(-model.TEACH_LIMITS.projectsMax) : cur;
      }
    });
    return view();
  }
  function view() {
    const st = state();
    return { settings: settings(), proposals: st.proposals.map(({ id, conv, cwd, title, terms, at }) => ({ id, conv, cwd, title, terms, at })), journal: st.journal.slice().reverse(), caps: { terms: model.capLeft(st, 'terms', now()), context: model.capLeft(st, 'context', now()) } };
  }
  // the For-you chip IS the press: 加入词库 adds the whole shown list, 忽略 ignores it
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it) => {
      const reply = it && it.reply && it.reply.text;
      if (!reply || it.sessionKey !== ITEM_KEY) return;
      const p = state().proposals.find((x) => x.itemId === it.id);
      if (!p) return;
      if (reply === model.teachWords(p.lang, 'add')) confirm(p.id, p.terms).catch((e) => log.warn?.(`[voice] the For-you 加入词库 failed: ${e && e.message}`));
      else if (reply === model.teachWords(p.lang, 'ignore')) { try { ignore(p.id); } catch { } }
    });
  }
  return { seen, answerPreview, confirm, ignore, setSettings, view, capOk };
}

module.exports = { create, ITEM_KEY };
