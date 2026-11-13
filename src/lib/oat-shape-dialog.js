// THE GUIDED DOOR (lane oat-add-door, 2.369.399 — the owner, 2026-11-13): an account added by its long-lived token, whose token
// states no subscription type, gets one in one of two ways —
//   ① 登录一次（推荐） — the ordinary sign-in on the row (the vendor states the type; the sign-in may end later and the pool keeps the
//      token; while it lives the usage panel can be refreshed — a token file alone gets no usage read, measured);
//   ② 我自己选 — the names a person reads (src/plan-names.js, dated) mapped to the values the installed Claude Code reads (its own
//      bytes, src/claude-plan-catalog.js), plus «不确定 — 先不选» LAST (the mint's scopes and no type: Sonnet by default).
// The server decides what is offered (GET /api/accounts/:id/oat-shape) and writes the choice (POST, a person's door). A type a
// SIGN-IN stated is shown, never re-chosen here (a sign-in again states it). Never «re-login» as the only word.
import { t } from './i18n.js';
import { createModalShell, escHtml, fetchJson, showToast } from './utils.js';

/** the words a choice is read by: «Ultra (formerly Max 20x)», «Pro», a type no row names by its own id, «Not sure — choose later» */
export function choiceLabel(c) {
  if (!c || c.choice === 'unsure') return t('Not sure — choose later');
  if (c.formerly) return t('{name} (formerly {old})', { name: c.name, old: c.formerly });
  return String(c.name || c.type || '');
}
/** the row's shape in words: «Ultra (formerly Max 20x)», «team», or the typeless line */
export function shapeLabel(shape, choices = []) {
  if (!shape) return '';
  if (shape.typeless) return t('no subscription type — Sonnet by default');
  const c = (choices || []).find((x) => x.type === shape.type && (x.tier || null) === (shape.tier || null));
  return c ? choiceLabel(c) : String(shape.type || '');
}
const WHY = {
  'mint-unmeasured': () => t('This Claude Code version has not been checked for this yet, so only a sign-in can state the type.'),
  platform: () => t('On this machine only a sign-in can state the type.'),
};
const whyText = (why) => (WHY[why] ? WHY[why]() : t('VibeSpace could not read the subscription types from this Claude Code, so only a sign-in can state the type.'));

/** Open the guide for account `id`. `onSignIn()` = the row's own sign-in (way ①); `refresh()` after a save. `fresh` = right after the
 *  token was saved (the words say why the dialog came up). → resolves when the dialog closes. */
export async function openOatShapeDialog({ id, name = '', onSignIn = null, refresh = null, fresh = false } = {}) {
  const enc = encodeURIComponent(id);
  const offer = await fetchJson(`/api/accounts/${enc}/oat-shape`).catch(() => null);
  if (!offer || offer.error) { showToast(offer?.error || t('Could not read the subscription types — server unreachable'), { type: 'error' }); return; }
  const choices = Array.isArray(offer.choices) ? offer.choices : [];
  const shape = offer.shape || null;
  const fromLogin = !!shape && shape.source === 'login';
  // not the subject: name — the account record `id` names (its name); fresh — only the lead's words of the same subject
  // a choice changed and not saved ⇒ ✕ / Esc / the backdrop ask (the unsaved-guard census); a sign-in's type is not a form here
  const picked = () => body.querySelector('input[name="oat-shape"]:checked')?.value || '';
  const { body, close, raised } = createModalShell({ kind: 'form', id: 'oat-shape-dialog', key: id, title: t('Subscription type — {name}', { name }), minWidth: 'min(460px, 92vw)', escapeToClose: true,
    unsaved: { isDirty: () => !!body.querySelector('#oat-shape-save') && picked() !== (current || ''), save: () => doSave() } });
  if (raised) return;   // raised: the same subject's form, as it was
  const lead = fresh ? t('The token is saved. It does not say which subscription it belongs to, and Claude Code needs that before it can use it.')
    : fromLogin ? t('A sign-in stated this account’s subscription type: {type}. Signing in again updates it.', { type: shapeLabel(shape, choices) })
    : shape ? t('Subscription type now: {type} (chosen here).', { type: shapeLabel(shape, choices) })
    : t('This account’s long-lived token does not say which subscription it belongs to, and Claude Code needs that before it can use it.');
  const replaced = offer.replaced ? `<div class="usage-note oat-shape-replaced">${escHtml(t('A sign-in stated the type and replaced the one chosen here ({was}).', { was: shapeLabel(offer.replaced, choices) }))}</div>` : '';
  const pick = !fromLogin && choices.length;
  const current = shape && !fromLogin ? (shape.typeless ? 'unsure' : (choices.find((c) => c.type === shape.type && (c.tier || null) === (shape.tier || null)) || {}).choice) : null;
  body.innerHTML = `
    <div class="usage-note">${escHtml(lead)}</div>${replaced}
    <div class="oat-shape-way">
      <div class="oat-row"><button class="btn-create" id="oat-shape-signin">${escHtml(t('Sign in once (recommended)'))}</button></div>
      <div class="usage-note">${escHtml(t('The sign-in states the type. It may end later — the pool keeps using the token; while it lasts, the usage can also be refreshed (⟳).'))}</div>
    </div>
    ${fromLogin ? '' : pick ? `
    <div class="oat-shape-way" id="oat-shape-pick">
      <div class="oat-shape-head">${escHtml(t('Choose it myself'))}</div>
      <div class="usage-note">${escHtml(t('The subscription type decides which model Claude Code uses when none is picked, and which features Claude Code opens for that subscription; a wrong choice can be changed on this row.'))}</div>
      ${choices.map((c) => `<label class="oat-shape-choice"><input type="radio" name="oat-shape" value="${escHtml(c.choice)}"${c.choice === current ? ' checked' : ''}> ${escHtml(choiceLabel(c))}${c.choice === 'unsure' ? ` <span class="usage-note">${escHtml(t('Sonnet by default until a type is chosen or a sign-in states it'))}</span>` : ''}</label>`).join('')}
      <div class="oat-row"><button class="btn-create" id="oat-shape-save">${escHtml(t('Save'))}</button></div>
    </div>` : `<div class="usage-note oat-shape-none">${escHtml(whyText(offer.why))}</div>`}`;
  body.querySelector('#oat-shape-signin').onclick = () => { close(); if (typeof onSignIn === 'function') onSignIn(); };
  const save = body.querySelector('#oat-shape-save');
  async function doSave() {
    const v = picked();
    if (!v) { showToast(t('Pick a type first'), { type: 'error' }); return false; }
    if (save) save.disabled = true;
    const r = await fetchJson(`/api/accounts/${enc}/oat-shape`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice: v }) }).catch(() => null);
    if (!r?.success) { if (save) save.disabled = false; showToast(r?.error || t('Save failed'), { type: 'error' }); return false; }
    const c = choices.find((x) => x.choice === v);
    showToast(v === 'unsure' ? t('Saved for “{name}”: no type chosen — Sonnet by default', { name }) : t('Saved: “{name}” is {type}', { name, type: choiceLabel(c) }));
    close();
    if (typeof refresh === 'function') refresh();
    return true;
  }
  if (save) save.onclick = () => { doSave(); };
}
