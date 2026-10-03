// THE QUESTIONS SHEET + THE HAND-OFF PROMPT (lane design-ask — design 003 §2 S1 + S3; mounted by design-window.js).
//
//   · ASK FIRST: the agent's `vibespace-design ask` puts ≤ 8 questions on its design (the hub validates them —
//     src/design-model.js validateQuestions — and pushes `design-ask {host, dir, ask}` to every client; a window that
//     opens later reads `GET /api/design/ask`). The sheet covers the canvas: each question as pills, every one ending
//     in "Decide for me" and (unless the agent turned it off) "Other…"; "Skip — decide everything for me"; "Later"
//     folds it to a pill in the corner. Continue → `POST /api/design/answers {host, dir, askId, answers}` — an option
//     is sent as its INDEX (its words are the agent's, never the wire's); the hub spells ONE `[Design answers] …` line,
//     belts it and sends it through the comment's own sender to the conversation that asked. Delivered ⇒ the hub
//     clears the questions on every client (`ask: null`). A refusal is said in the sheet; the picks stay.
//   · Every string the agent wrote (a question, its help, an option) is drawn with textContent — text, never markup.
//   · THE HAND-OFF PROMPT (⋯ "Copy hand-off prompt"): the words another agent needs to build the design from the
//     folder and its HANDOFF.md (the craft rule: the agent writes that file when the user hands the design over).
import { fetchJson, showToast, copyText } from './utils.js';
import { t } from './i18n.js';
import { foldPath } from './file-changed.js';
import { ASK_LIMITS } from '../design-model.js';

const hostKey = (h) => (!h || h === 'local' ? '' : String(h));
const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const words = (v, max) => String(v == null ? '' : v).slice(0, max);

/** The pending questions as read off the wire (the hub's validated shape; bounded again here) — null when unusable. */
export function readAsk(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !Array.isArray(a.questions) || !a.questions.length) return null;
  const questions = a.questions.slice(0, ASK_LIMITS.questions).filter((q) => q && typeof q.id === 'string' && typeof q.q === 'string').map((q) => ({
    id: words(q.id, 40), q: words(q.q, ASK_LIMITS.question), help: words(q.help, ASK_LIMITS.help),
    kind: q.kind === 'many' ? 'many' : 'one', other: q.other !== false,
    options: (Array.isArray(q.options) ? q.options : []).slice(0, ASK_LIMITS.optionCount).map((o) => words(o, ASK_LIMITS.option)),
  }));
  return questions.length ? { id: words(a.id, 40), questions } : null;
}
/** One question's state → its answer on the wire (`undefined` = left to the agent). */
export function answerOf(st) {
  if (!st || st.decide) return st && st.decide ? { decide: true } : undefined;
  const picks = [...st.picks].sort((a, b) => a - b);
  const other = st.other == null ? '' : String(st.other).trim();
  if (!picks.length && !other) return undefined;
  return { ...(picks.length ? { picks } : {}), ...(other ? { other: other.slice(0, ASK_LIMITS.other) } : {}) };
}
/** The words a refusal of the answers is said in. */
export function answersRefusalText(r) {
  if (!r) return t('Could not send the answers — the server did not answer');
  return r.error ? t('The answers were not sent: {why}', { why: String(r.error).slice(0, 300) }) : t('The answers were not sent');
}
/** The words a delivered answer is confirmed in (the hub says HOW: typed now / queued behind the turn / waiting). */
export function answersSentText(r) {
  const how = String((r && (r.delivered || r.via)) || '');
  if (/stash|wait|held/i.test(how)) return t('The conversation is not running — your answers wait above its composer');
  if (/queue/i.test(how)) return t('Answers queued — the agent reads them after its current turn');
  return t('Answers sent to the agent');
}
/** The hand-off prompt (agent-facing words, English): what another agent needs to build this design. */
export function handoffPrompt({ host = '', dir = '', title = '' } = {}) {
  const where = (hostKey(host) ? `${hostKey(host)}:` : '') + dir;
  return `Build the design${title ? ` "${title}"` : ''} in ${where} — a VibeSpace design folder: plain-HTML artboards, one complete page per screen, images beside them.`
    + ` Read ${dir.replace(/\/+$/, '')}/HANDOFF.md first if the folder has one (reading order, the decisions, the design tokens, what is static and what is interactive),`
    + ' then open every artboard in a browser and match it exactly in the product\'s own code and components. Ask me where the folder leaves something open.';
}

/** Mount the sheet on one Design window. → the handle the heavy suite reads (`winInfo._designAsk`). */
export function mountDesignAsk({ app, win, stage, host = '', dir = '', signal, phone = false } = {}) {
  const h = hostKey(host);
  const d = String(dir || '');
  const L = { signal };
  const q = () => { const p = new URLSearchParams(); if (h) p.set('host', h); p.set('dir', d); return p.toString(); };
  let ask = null;                // the pending {id, questions}
  let state = new Map();         // question id → {picks:Set<index>, other:string|null (null = not chosen), decide:bool}
  let folded = false, sending = false;

  const sheet = mk('div', 'design-ask' + (phone ? ' design-ask-phone' : ''));
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', t('Questions from the agent'));
  sheet.style.display = 'none';
  const card = mk('div', 'design-ask-card');
  sheet.appendChild(card);
  const reopen = mk('button', 'design-ask-reopen');
  reopen.type = 'button';
  reopen.title = t('Show the questions');
  reopen.style.display = 'none';
  stage.append(sheet, reopen);
  reopen.addEventListener('click', () => { folded = false; show(); }, L);
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); fold(); } }, L);

  const stOf = (id) => { if (!state.has(id)) state.set(id, { picks: new Set(), other: null, decide: false }); return state.get(id); };
  function show() {
    sheet.style.display = ask && !folded ? '' : 'none';
    reopen.style.display = ask && folded ? '' : 'none';
    if (ask) reopen.textContent = t('{n} question(s) waiting', { n: ask.questions.length });
  }
  function fold() { if (!ask) return; folded = true; show(); }
  let errEl = null;
  const sayErr = (text, { note = false } = {}) => { if (errEl) { errEl.textContent = text || ''; errEl.classList.toggle('design-ask-note', note); errEl.style.display = text ? '' : 'none'; } };

  function pill(label, pressed, onClick, extra = '') {
    const b = mk('button', 'design-ask-pill' + extra);
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', onClick, L);
    return b;
  }
  function drawQuestion(box, qq) {
    const st = stOf(qq.id);
    box.replaceChildren();
    const head = mk('div', 'design-ask-q');
    head.textContent = qq.q;                                 // the agent's words — text, never markup
    if (qq.kind === 'many') { const k = mk('span', 'design-ask-kind'); k.textContent = t('pick any'); head.append(' ', k); }
    box.appendChild(head);
    if (qq.help) { const hp = mk('div', 'design-ask-help'); hp.textContent = qq.help; box.appendChild(hp); }
    const row = mk('div', 'design-ask-pills');
    row.setAttribute('role', qq.kind === 'many' ? 'group' : 'radiogroup');
    row.setAttribute('aria-label', qq.q);
    const redraw = () => drawQuestion(box, qq);
    qq.options.forEach((o, i) => row.appendChild(pill(o, st.picks.has(i), () => {
      if (qq.kind === 'many') { if (st.picks.has(i)) st.picks.delete(i); else st.picks.add(i); }
      else { const had = st.picks.has(i); st.picks.clear(); st.other = null; if (!had) st.picks.add(i); }
      st.decide = false; redraw();
    })));
    row.appendChild(pill(t('Decide for me'), st.decide, () => { st.decide = !st.decide; if (st.decide) { st.picks.clear(); st.other = null; } redraw(); }, ' design-ask-decide'));
    if (qq.other) row.appendChild(pill(t('Other…'), st.other != null, () => {
      if (st.other != null) st.other = null; else { st.other = ''; st.decide = false; if (qq.kind === 'one') st.picks.clear(); }
      redraw();
      if (st.other != null) setTimeout(() => box.querySelector('.design-ask-other')?.focus(), 0);
    }, ' design-ask-other-pill'));
    box.appendChild(row);
    if (st.other != null) {
      const inp = mk('input', 'design-ask-other dialog-input');
      inp.type = 'text';
      inp.maxLength = ASK_LIMITS.other;
      inp.value = st.other;
      inp.placeholder = t('Your answer');
      inp.setAttribute('aria-label', t('Your answer'));
      inp.addEventListener('input', () => { st.other = inp.value; }, L);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(false); } }, L);
      box.appendChild(inp);
    }
  }
  function draw() {
    card.replaceChildren();
    if (!ask) { show(); return; }
    const head = mk('div', 'design-ask-head');
    const title = mk('div', 'design-ask-title'); title.textContent = t('The agent has a few questions');
    const sub = mk('div', 'design-ask-sub'); sub.textContent = t('Answer what you know — whatever you leave open, the agent decides.');
    head.append(title, sub);
    const list = mk('div', 'design-ask-list');
    for (const qq of ask.questions) { const box = mk('div', 'design-ask-item'); box.dataset.q = qq.id; drawQuestion(box, qq); list.appendChild(box); }
    errEl = mk('div', 'design-ask-error');
    errEl.setAttribute('role', 'alert');
    errEl.style.display = 'none';
    const foot = mk('div', 'design-ask-foot');
    const skip = mk('button', 'design-ask-skip'); skip.type = 'button'; skip.textContent = t('Skip — decide everything for me');
    const later = mk('button', 'btn-cancel design-ask-later'); later.type = 'button'; later.textContent = t('Later');
    const go = mk('button', 'btn-create design-ask-go'); go.type = 'button'; go.textContent = t('Continue');
    skip.addEventListener('click', () => send(true), L);
    later.addEventListener('click', () => fold(), L);
    go.addEventListener('click', () => send(false), L);
    foot.append(skip, later, go);
    card.append(head, list, errEl, foot);
    show();
  }
  function setAsk(raw) {
    const a = readAsk(raw);
    if (!a) { ask = null; state = new Map(); card.replaceChildren(); show(); return; }
    if (ask && ask.id === a.id) return;                     // the same questions (a re-read): the picks stay
    const replaced = !!ask;
    ask = a; state = new Map(); folded = false;
    draw();
    if (replaced) sayErr(t('The agent asked new questions — here they are'), { note: true });
  }
  function body(skip) {
    const answers = {};
    if (!skip) for (const qq of ask.questions) { const v = answerOf(state.get(qq.id)); if (v !== undefined) answers[qq.id] = v; }
    return { host: h, dir: d, askId: ask.id, ...(skip ? { skip: true } : { answers }) };
  }
  async function send(skip) {
    if (!ask || sending) return null;
    sending = true;
    const go = card.querySelector('.design-ask-go');
    if (go) go.textContent = t('Sending…');
    const r = await fetchJson('/api/design/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(skip)) });
    sending = false;
    if (signal.aborted) return r;
    if (go) go.textContent = t('Continue');
    if (r && r.ok && !r.error) { ask = null; state = new Map(); card.replaceChildren(); show(); showToast(answersSentText(r)); return r; }
    if (r && r.code === 'no_questions') { ask = null; card.replaceChildren(); show(); showToast(t('These questions were already answered')); return r; }
    if (r && r.code === 'stale') { await refresh(); return r; }
    sayErr(answersRefusalText(r));                           // the picks stay
    return r;
  }
  async function refresh() {
    const r = await fetchJson('/api/design/ask?' + q());
    if (signal.aborted || !r || r.error || r.ok === false) return;
    setAsk(r.ask || null);
  }
  const off = app.ws?.onGlobal?.((m) => {
    if (!m || m.type !== 'design-ask' || signal.aborted || hostKey(m.host) !== h || foldPath(String(m.dir || '')) !== foldPath(d)) return;
    setAsk(m.ask || null);
  });
  const onState = (connected) => { if (connected && !signal.aborted) refresh(); };
  app.ws?.onStateChange?.(onState);
  signal.addEventListener('abort', () => { try { off?.(); } catch { /* gone */ } app.ws?.offStateChange?.(onState); }, { once: true });
  // ⋯ "Copy hand-off prompt" (the window's ⋯ builder reads `_designMoreRows`)
  if (win) (win._designMoreRows = win._designMoreRows || []).push(() => ({
    label: t('Copy hand-off prompt'),
    action: () => { copyText(handoffPrompt({ host: h, dir: d })); showToast(t('Hand-off prompt copied — paste it to the agent that builds the design')); },
  }));
  refresh();
  return { refresh, send, fold, state: () => ({ ask, folded, open: !!ask && !folded, body: ask ? body(false) : null }) };
}
