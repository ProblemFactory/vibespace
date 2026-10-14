// THE BLOCK DRAFTER'S CARD (lane rule-learning, design q-037 P0 — owner 2026-10-14). The 「我关心什么」 row's draft button
// becomes 「从我的判定起草」 only when the Decision API row is OpenRouter with a key and the plugin is on (GET
// /api/channels/decision/learn answers 200; a 404 = the drafter does not exist ⇒ the catalogue draft stays, nothing else is
// drawn — never a grey button). A press asks for ONE proposal (POST: the text model sees only the digests the judge already
// saw + the block) and draws a card UNDER the box: the proposed lines (editable, ticked; an `unsupported` line says 「无依据」
// and is NOT ticked), each with its kind and its evidence chip (which judgments), then the lines it would remove with the
// reasons (a line the answer never mentioned stays ticked), the model + price + the zero-data-retention sentence, the
// model's note under ONE 技术细节 fold (data-fold="tech"). 「保存」 writes the block through the caller's settings door (the
// memo re-judges as today), 「放弃」 drops the card. Card grammar: the head says WHO (the model) did WHAT (read n of your
// decisions) to WHICH thing (m lines proposed) — no raw JSON, no id, no URL.
// lane rule-learning-fix: the card COUNTS what 保存 would write (the ticked rows + the kept lines) — over 1 500 characters
// it says so and 保存 waits (F3; the row's door refuses an over-length value by name, never a slice); a block that would
// save EMPTY is said, and the button reads 「清空并保存」 (F2); every `why` the route can answer has its words here — anything
// else is 「没有起草——服务端出错」 with the raw text only under ONE 技术细节 fold (L5); 409 `busy` = a draft in flight (L4).
// lane rule-learning-fix-r2: an edit / new line over 120 characters comes CUT (no marker) and unticked — the chip says
// 「太长——已截短」, the model's whole text sits under that row's own 技术细节 fold (F4); the block's other lines sit under
// ONE header per kind — 「提议删掉的行」 over the named removals only, 「保留的原文」 over the lines that stay (F5); a stored
// block already over 1 500 is said at the top, its tail kept as rows (F6); ticking a rewording that was not pre-ticked
// unticks the line it rewords, and that line says so (verify r2's G7).
// lane learn-card-untick (verify r3): ONE rule for every rewording — pre-ticked, unproven or cut — ticked ⇒ it replaces the
// person's line, unticked ⇒ that line is kept (R3-F1: unticking a PRE-ticked rewording dropped the line, unsaid). The line
// keeps a row of its own under 「保留的原文」 and both rows say which, in either state (「已勾选：这一行将被改写」 /
// 「…要留原文就取消上面的勾」); the person's own tick on that line is theirs for the card's life — the rewording's tick never
// moves it again (R3-F6); the stored-block notice follows the count — never «over» beside an enabled 保存 (R3-F5).
import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { blockFrom, blockFit } from '../rule-learning.js';
import { moneyText } from '../decision-model.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const opWord = (op) => ({ keep: t('kept as is'), edit: t('reworded'), add: t('new line') })[op] || op;
const LINE_BOX_MAX = 300;   // a proposed line's box; a kept line is the person's own and may be longer
/** Every `why` the learn route can answer, in the owner's words (test-rule-learning derives the route's whys from their
 *  sources — the text client, learnDraft, the route, the PURE drafter, the budget verdict — and needs a key here for each). */
const REFUSALS = () => ({
  'no-zdr': t('the model has no zero-data-retention endpoint — pick the other model in “Model that drafts” below'),
  'use-budget': t('today\'s drafts used their $0.10 — try again tomorrow'),
  'daily-budget': t('the Decision API\'s daily limit is spent — try again tomorrow'),
  'no-examples': t('answer ✓ and ✗ on a few judged rows first'),
  reconnect: t('OpenRouter refused the key — check it in Integrations & keys'),
  plan: t('OpenRouter says the plan does not allow this model'),
  shape: t('the model gave no usable proposal — try again'),
  'bad-answer': t('the model gave no usable proposal — try again'),
  'vendor-busy': t('OpenRouter did not answer — try again in a minute'),
  'no-answer': t('OpenRouter did not answer — try again in a minute'),
  redirect: t('OpenRouter answered with a redirect, which is never followed — try again later'),
  busy: t('a draft is already being made — wait for it'),
  'not-openrouter': t('the drafter needs an OpenRouter key on the Decision API row'), 'no-key': t('the drafter needs an OpenRouter key on the Decision API row'),
  'plugin-off': t('the Decision API plugin is off'),
});
/** A refusal's words (the POST's `why`) — null for a why the card has no words for (a server error). */
export function learnRefusal(why) {
  const m = REFUSALS();
  return typeof why === 'string' && Object.hasOwn(m, why) ? m[why] : null;
}
/** A server error (a 500's message, a why without words): the sentence; the raw text only under ONE closed 技术细节 fold. */
function refusedCard(r) {
  const card = el('div', 'learn-card learn-refused');
  card.dataset.learnRefused = '1';
  card.appendChild(el('div', 'learn-card-head', t('No draft — {why}', { why: t('server error') })));
  const tech = el('details', 'learn-tech'); tech.dataset.fold = 'tech';
  tech.appendChild(el('summary', null, t('Technical details')));
  tech.appendChild(el('div', 'learn-note', String((r && (r.error || r.why)) || '').slice(0, 300)));
  card.appendChild(tech);
  const acts = el('div', 'learn-actions');
  const x = el('button', 'settings-link-btn learn-discard', t('Dismiss'));
  x.onclick = () => card.remove();
  acts.appendChild(x);
  card.appendChild(acts);
  return card;
}

/** The card for a POST answer `r` ({table, examples, label, usd, read, counts, note}). `onSave(text)` writes the block
 *  (false = the door refused it: the card stays); `onDiscard()` drops the card. Exported for the suites. */
export function renderLearnCard(r, { onSave = () => { }, onDiscard = () => { } } = {}) {
  const table = r.table || { rows: [], removed: [] };
  const ex = new Map((r.examples || []).map((x) => [x.n, x]));
  const card = el('div', 'learn-card');
  card.dataset.learnCard = '1';
  card.appendChild(el('div', 'learn-card-head', t('{model} read {n} of your decisions and proposes {m} lines', { model: r.label || r.model || '', n: r.read || 0, m: table.rows.length })));
  const c = r.counts || {};
  card.appendChild(el('div', 'learn-card-sub', [t('{own} yours · {inferred} inferred', { own: c.own || 0, inferred: c.inferred || 0 }), t('digests went through OpenRouter to a zero-data-retention endpoint'), moneyText(r.usd, true, { fine: true })].join(' · ')));
  const st = table.stored;
  let stored = null;
  if (st && st.over) {   // F6: the block as stored is over the bound — said before anything else, never cut unsaid (its words: recount)
    stored = el('div', 'learn-stored'); stored.setAttribute('role', 'status');
    card.appendChild(stored);
  }
  const rows = el('div', 'learn-rows');
  const live = [];   // [row of the table, its tick, its text box, its state line (a rewording's: what its tick does)]
  for (const x of table.rows) {
    const row = el('div', 'learn-row');
    row.dataset.op = x.op;
    if (x.unsupported) row.dataset.unsupported = '1';
    const tick = el('input', 'learn-tick'); tick.type = 'checkbox'; tick.checked = !!x.tick;
    tick.setAttribute('aria-label', t('use this line'));
    const box = el('input', 'learn-text'); box.type = 'text'; box.value = x.text; box.maxLength = Math.max(LINE_BOX_MAX, String(x.text || '').length);
    const main = el('div', 'learn-row-main');
    main.append(tick, box, el('span', 'learn-chip', opWord(x.op)));
    if (x.long) { row.dataset.long = '1'; main.appendChild(el('span', 'learn-none learn-long', t('too long — shortened'))); }
    if (x.unsupported) main.appendChild(el('span', 'learn-none', t('no evidence')));
    else if (x.from.length) {
      const chip = el('span', 'learn-evidence', t('based on {list}', { list: x.from.map((n) => `#${n}`).join(' ') }));
      chip.title = x.from.map((n) => { const e = ex.get(n); return e ? `#${n} ${e.verdict === 'needs' ? '✓' : '✗'}${e.inferred ? ` (${t('inferred')})` : ''} ${e.snippet}` : `#${n}`; }).join('\n');
      main.appendChild(chip);
    }
    row.appendChild(main);
    const why = [x.was ? t('was: {text}', { text: x.was }) : '', x.evidence].filter(Boolean).join(' — ');
    if (why) row.appendChild(el('div', 'learn-why', why));
    const state = x.op === 'edit' && x.line ? row.appendChild(el('div', 'learn-why learn-state')) : null;
    if (x.long && x.full) {   // F4: the model's whole text — only here, under the row's own closed fold
      const tech = el('details', 'learn-tech learn-row-tech'); tech.dataset.fold = 'tech';
      tech.appendChild(el('summary', null, t('Technical details')));
      tech.appendChild(el('div', 'learn-note', x.full));
      row.appendChild(tech);
    }
    rows.appendChild(row);
    live.push([x, tick, box, state]);
  }
  card.appendChild(rows);
  const gone = [];   // [row of the table, its tick, its why, {mine: the person's own tick on it — null until they touch it}]
  const keptWhy = (x) => (x.op === 'unmentioned' ? t('the proposal did not mention this line — kept')
    : x.op === 'replaced' ? t('its rewording above is not ticked — this line stays')
    : x.op === 'unproven' ? t('its rewording above has no evidence — this line stays')
      : x.op === 'shortened' ? t('its rewording above was too long and was cut — this line stays') : x.reason || t('no reason given'));
  // F5: ONE header per kind — the named removals, then the person's lines that stay
  for (const [named, head] of [[true, t('Lines it would remove')], [false, t('Your lines it keeps')]]) {
    const xs = table.removed.filter((x) => (x.op === 'remove') === named);
    if (!xs.length) continue;
    const h = el('div', 'learn-removed-head', head); h.dataset.list = named ? 'remove' : 'kept';
    const list = el('div', 'learn-rows learn-removed'); list.dataset.list = h.dataset.list;
    for (const x of xs) {
      const row = el('div', 'learn-row');
      row.dataset.op = x.op;
      const tick = el('input', 'learn-tick'); tick.type = 'checkbox'; tick.checked = !!x.tick;
      tick.setAttribute('aria-label', t('keep this line'));
      const main = el('div', 'learn-row-main');
      main.append(tick, el('span', 'learn-old', x.text));
      row.appendChild(main);
      const why = el('div', 'learn-why', keptWhy(x));
      row.appendChild(why);
      list.appendChild(row);
      gone.push([x, tick, why, { mine: null }]);
    }
    card.append(h, list);
  }
  if (r.note) {
    const tech = el('details', 'learn-tech'); tech.dataset.fold = 'tech';
    tech.appendChild(el('summary', null, t('Technical details')));
    tech.appendChild(el('div', 'learn-note', r.note));
    card.appendChild(tech);
  }
  const fit = el('div', 'learn-fit');
  fit.setAttribute('role', 'status');
  const acts = el('div', 'learn-actions');
  const save = el('button', 'settings-link-btn learn-save', t('Save'));
  const drop = el('button', 'settings-link-btn learn-discard', t('Discard'));
  const textNow = () => blockFrom({ rows: live.map(([x, tick, box]) => ({ ...x, text: box.value, tick: tick.checked })), removed: gone.map(([x, tick]) => ({ ...x, tick: tick.checked })) });
  /** THE COUNT: what 保存 would write against the block's 1 500 — over ⇒ said and 保存 waits; empty ⇒ said, 「清空并保存」. */
  const recount = () => {
    const text = textNow(), f = blockFit(text);
    fit.dataset.state = f.over ? 'over' : f.empty ? 'empty' : 'fits';
    fit.textContent = f.over ? t('Over 1,500 characters ({n}) — remove a few lines or shorten them, then save', { n: f.chars }) : f.empty ? t('After saving, this block will be empty') : '';
    fit.hidden = !f.over && !f.empty;
    save.disabled = f.over;
    save.textContent = f.empty ? t('Clear and save') : t('Save');
    if (stored) {   // R3-F5: the stored block's notice says what must STILL go, and goes once 保存 fits — never both
      stored.hidden = !f.over; stored.dataset.state = f.over ? 'over' : 'fits';
      stored.textContent = f.over ? t('The block as stored is already over 1,500 characters ({chars}) — {n} must go before it can be saved', { chars: st.chars, n: f.chars - st.max }) : '';
    }
    return { text, f };
  };
  for (const [, tick] of gone) tick.onchange = recount;
  for (const [x, tick, box, state] of live) {
    box.oninput = recount;
    // ONE rule for every rewording (R3-F1; verify r2's G7 for all three kinds): its tick replaces the line it rewords — that
    // line's row unticked — or keeps it, and both rows say which; once the person ticks / unticks that line THEMSELVES,
    // the rewording's tick never moves it again (R3-F6)
    const own = state ? gone.find(([g]) => g.line === x.line && (g.op === 'replaced' || g.op === 'unproven' || g.op === 'shortened')) : null;
    if (!own) { tick.onchange = recount; continue; }
    const [g, gTick, gWhy, mem] = own;
    const say = () => {
      state.textContent = !tick.checked ? t('Not ticked: your original line is not rewritten') : gTick.checked ? t('Ticked: saved beside your original line') : t('Ticked: this line will be rewritten');
      gWhy.textContent = tick.checked ? (gTick.checked ? t('kept beside its rewording above — both are saved') : t('replaced by the rewording above — untick that to keep this line'))
        : gTick.checked ? keptWhy(g) : t('unticked — this line is not saved');
    };
    tick.onchange = () => { if (mem.mine === null) gTick.checked = !tick.checked; say(); recount(); };
    gTick.onchange = () => { mem.mine = gTick.checked; say(); recount(); };
    say();
  }
  save.onclick = () => {
    const { text, f } = recount();
    if (f.over) return;
    if (onSave(text) === false) return;   // the door refused it by name: the card stays
    card.remove();
  };
  drop.onclick = () => { onDiscard(); card.remove(); };
  acts.append(drop, save);
  card.append(fit, acts);
  recount();
  return card;
}

/** Wire the 「我关心什么」 row: the catalogue button `catalogue` gives way to the drafter's when the drafter exists.
 *  `ta` = the row's box, `apply(text)` = the row's own write door (→ {ok} | {ok: false, why: 'too-long', chars, max}). */
export function mountLearnDraft(wrap, { catalogue, ta, apply } = {}) {
  return Promise.resolve(fetchJson('/api/channels/decision/learn')).then((a) => {
    if (!a || a.ok !== true || !a.exists || !catalogue || !catalogue.isConnected) return false;   // 404 / unreachable ⇒ the catalogue draft stays
    const b = el('button', 'settings-link-btn', t('Draft from my verdicts'));
    b.dataset.draft = 'learn';
    b.title = t('Asks {model} to rewrite this block from your ✓ / ✗ answers — it proposes, you save', { model: a.label });
    b.onclick = async () => {
      b.disabled = true; b.textContent = t('Drafting…');
      const r = await fetchJson('/api/channels/decision/learn', { method: 'POST' });
      b.disabled = false; b.textContent = t('Draft from my verdicts');
      for (const old of wrap.querySelectorAll('[data-learn-refused]')) old.remove();
      if (!r || r.ok !== true || !r.table) {
        const said = r ? learnRefusal(r.why) : t('server unreachable');
        if (said) showToast(t('No draft — {why}', { why: said }), { type: 'error' });
        else wrap.appendChild(refusedCard(r));   // a server error: never raw in a toast
        return;
      }
      for (const old of wrap.querySelectorAll('[data-learn-card]')) old.remove();
      const card = renderLearnCard(r, {
        onSave: (text) => {
          const w = apply ? apply(text) : null;
          if (w && w.ok === false) { showToast(t('Not saved — {n} characters, at most {max}', { n: w.chars, max: w.max }), { type: 'error' }); return false; }
          if (ta && ta.value !== text) ta.value = text;
          showToast(t('Saved — the judge reads the new block from the next message'));
          return true;
        },
      });
      wrap.appendChild(card);
      const first = card.querySelector('.learn-text');
      if (first) { first.focus(); if (first.setSelectionRange) first.setSelectionRange(0, 0); first.scrollLeft = 0; }   // a long kept line shows its START
    };
    catalogue.replaceWith(b);
    return true;
  }).catch(() => false);
}
