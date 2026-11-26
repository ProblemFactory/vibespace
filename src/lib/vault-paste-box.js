// THE PASTE BOX (lane vault-paste-request — the owner 2026-10-23: 「应该允许你给我弹一个保险库输入框让我直接 paste 进去，省得我还
// 得手动去保险库搞」). An agent's request for a secret (the For-you action `secret-request`, src/server/vault-paste-door.js) is
// answered where it appears: a MASKED field (a password input — a phone keyboard's paste works, nothing autocompletes, no
// password manager offers or keeps it), 「存入保险库」 and 「拒绝」. The tray row draws it INLINE (src/lib/user-todos-row.js
// keeps the box across every repaint, as it keeps a reply box); the For-you window and the Vault window's 「需要你」 open the
// same box as a dialog. The value goes in through `.value` only, rides ONE POST body to the owner's cookie door
// (POST /api/vault/secret-requests/:id/answer) and leaves the field the moment the answer lands — never a toast, a log line, an
// attribute or text. A LOCKED vault is said by name with 解锁… inline (THE unlock dialog); a vault not set up with
// 设置第二密码… (a free entry needs it; an Integrations field does not).
// Also 「其他密钥或密码…」 (the Vault window's 添加 menu — the owner the same morning: 「我压根没法添加啊」): a FREE entry the owner
// adds — a name, a kind, the value (the same masked field), a note — POST /api/vault/secrets.
// lane login-request-card (B-a681): an agent's ask for a WEBSITE LOGIN (`--kind login --host <site>`) draws the Vault window's own
// add-a-website-login fields here (src/lib/vault-login-row.js loginFields — the site fixed by the ask), the answer rides the same
// door with the password as `loginPassword` (taken off the body), and lands ONE web-login entry through the add door's writer.
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast, latestRender } from './utils.js';
import { vaultFacts, showUnlock, showSetup } from './vault-unlock.js';
import { loginFields, loginRefusalWords } from './vault-login-row.js';   // lane login-request-card: THE add door's fields and words
import { useLoginWords } from './use-login-words.js';   // lane login-request-card: one login, several sites — the words before «Use a login you already saved…»
import { fieldWhole } from '../inbox-origin.js';   // B-76dc: the ONE answer to «is this field the agent's own whole words» (the tray row's)
import { linkedHtml, maskedLinkNote } from './foryou-links.js';   // lane login-request-card r3: THE item's words renderer in the dialog (a masked link = its words + THE note)
import { escHtml } from './utils.js';
import { showTotpAddDialog, totpFields } from './vault-totp-row.js';   // lane login-request-card: «Two-step code…» = THE 两步验证… dialog · lane totp-request-card: its field set (THE two-step card)

export const SECRET_ACTION = 'secret-request';
/** Is this For-you item an agent's request for a secret (still answerable — it names its request)? */
export const isSecretAsk = (i) => !!(i && i.action && i.action.type === SECRET_ACTION && /^sr-[0-9a-f]{12}$/.test(String(i.action.requestId || '')));
/** lane login-request-card: …for a WEBSITE LOGIN (the request's `kind` — src/vault-paste.js LOGIN_KIND)? */
export const isLoginAsk = (i) => isSecretAsk(i) && i.action.kind === 'login';
/** lane totp-request-card: …for a TWO-STEP CODE (src/vault-paste.js TOTP_KIND)? */
export const isTotpAsk = (i) => isSecretAsk(i) && i.action.kind === 'totp';
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (label, cls) => { const b = mk('button', cls, label); b.type = 'button'; return b; };

/** THE MASKED FIELD — the vault dialogs' own field (class vault-pw): a password input that never autocompletes, never
 *  spell-checks, is never offered to a password manager; Enter is «done». */
export function secretInput(placeholder) {
  const i = mk('input', 'vault-pw vault-secret-input');
  i.type = 'password'; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = placeholder;
  i.setAttribute('aria-label', placeholder);
  for (const [k, v] of [['autocapitalize', 'off'], ['autocorrect', 'off'], ['enterkeyhint', 'done'], ['data-lpignore', 'true'], ['data-1p-ignore', 'true'], ['data-bwignore', 'true'], ['data-form-type', 'other']]) i.setAttribute(k, v);
  return i;
}

/** lane vault-entry-description: a refusal of an entry's WORDS (its name, its description) → what the page says. */
export function wordsRefusalWords(code, r) {
  if (code === 'name_required') return t('Give it a name');
  if (code === 'name_too_long') return t('The name is at most 80 characters');
  if (code === 'note_too_long') return t('The description is at most 400 characters');
  if (code === 'note_lines') return t('The description is one paragraph — no line breaks');
  if (code === 'note_secret' || code === 'name_secret') return t('A name or a description may not contain a secret — say what it is for, never its value');
  if (code === 'hidden_chars') return t('It holds a hidden or direction character — type it again');
  if (code === 'vault_locked') return t('The vault is locked (vault_locked) — unlock it, then save');
  if (code === 'words_not_here') return t('This kind of entry has no name or description of its own');
  if (code === 'todos-unread') return t('For you cannot read its saved list right now — nothing was saved. Try again once it reads.');   // B-44f3: the press while held (503) — in the page's own words, never the hub's English
  return (r && r.error) || t('server unreachable');
}
/** The proposed words of a NEW entry, read back from the request's own lines (the item is the record — src/vault-paste.js cardOf). */
const lineParam = (item, key, name) => { const l = ((item && item.i18n && Array.isArray(item.i18n.detail)) ? item.i18n.detail : []).find((x) => x && x.key === key); const v = l && l.params && l.params[name]; return typeof v === 'string' ? v : ''; };
const ENTRY_KEY = 'Where it goes: a new vault entry «{label}» ({kind})', NOTE_KEY = 'Its description, in the agent\'s words: {note}';

/** THE BOX for one request (DOM nodes — every word textContent): the field + 存入保险库 + 拒绝, and its state line below
 *  (the vault locked / not set up — each with its door — or the last refusal's words). lane vault-entry-description: a NEW
 *  entry's name and description as the agent proposed them, above the field — the owner's to edit before saving (the owner's words win). */
export function secretBoxEl(item) {
  if (isTotpAsk(item)) return totpBoxEl(item);   // lane totp-request-card
  if (isLoginAsk(item)) return awayBoxEl(item) || (item.action && item.action.update ? loginUpdateBoxEl(item) : loginBoxEl(item));   // B-ab6c: an update ask's card   // lane login-request-card (r3: one answerable box — a moved card stands in its own window)
  const box = mk('div', 'ut-secret');
  box.dataset.req = String(item.action.requestId);
  box.dataset.target = item.action.into ? 'field' : 'entry';
  if (box.dataset.target === 'entry') {
    const meta = mk('div', 'ut-secret-meta');
    const name = mk('input', 'vault-pw ut-secret-name'); name.type = 'text'; name.maxLength = 80; name.autocomplete = 'off'; name.spellcheck = false; name.value = name.dataset.was = lineParam(item, ENTRY_KEY, 'label'); name.setAttribute('aria-label', t('Name'));   // data-was: r3 (law C) — the agent's words, no typing of the owner's
    const desc = mk('textarea', 'vault-pw ut-secret-desc'); desc.rows = 2; desc.maxLength = 400; desc.value = desc.dataset.was = lineParam(item, NOTE_KEY, 'note'); desc.setAttribute('aria-label', t('Description'));
    desc.placeholder = t('What it is for — which system, which account, what it may do (agents that may use it read this)');
    const lab = (w, c) => { const l = mk('label', 'ut-secret-field'); l.append(mk('span', 'ut-secret-label', w), c); return l; };
    meta.append(lab(t('Name'), name), lab(t('Description'), desc));
    box.append(meta);
  }
  const row = mk('div', 'ut-secret-row');
  const input = secretInput(t('Paste it here'));
  input.classList.add('ut-secret-input');
  input.setAttribute('aria-label', t('What to store'));
  const save = btn(t('Save to vault'), 'ut-act ut-secret-save');
  const deny = btn(t('Refuse'), 'ut-act ut-secret-deny');
  // lane ui-plain-words (vault-8): the field says what it is — a visible label above the paste box, never a bare box at the end
  box.append(mk('div', 'ut-secret-label ut-secret-paste-label', t('What to store')));
  row.append(input, save, deny);
  // lane wake-approve-card r3 (主开发: a FORM card — «wrong label — ask again»): the request names a place the AGENT chose; a wrong
  // one is refused here and the agent asks again with the right one (the refusal reaches it on its next turn)
  const note = mk('div', 'ut-secret-note', t('Wrong name or kind? Refuse — the agent can ask again with the right one.'));
  const state = stateEl();
  box.append(row, note, state);
  applySecretBox(box);
  return box;
}
/** r3 (law B): the card already stands in its own form window (moved there with what was typed) ⇒ the surface that redraws its
 *  row draws THIS line instead of a second, empty box — «Show it» brings that window up, or draws the box again here when that
 *  window was closed unanswered. → the line | null (no moved card). */
function awayBoxEl(item) {
  const id = String(item.action.requestId);
  const moved = () => [...document.querySelectorAll('.vault-paste-dialog .ut-secret')].find((b) => b.dataset.req === id && b.isConnected) || null;
  if (!moved()) return null;
  const line = mk('div', 'ut-secret ut-secret-away');
  line.dataset.req = id; line.dataset.target = 'away';
  const show = btn(t('Show it'), 'ut-secret-show');
  show.addEventListener('click', () => { const m = moved(); if (m) { m.scrollIntoView({ block: 'nearest' }); const f = m.querySelector('input.vault-login-user'); if (f) f.focus(); } else line.replaceWith(secretBoxEl(item)); });
  line.append(mk('span', 'ut-secret-note', t('This login card is open in its own window')), show);
  return line;
}
/** r3 (law B): the card's own answer road when it stands in its own form, whatever surface drew it — the model's ONE verb for a
 *  secret-request is postSecretAnswer (src/lib/user-todos-actions.js), so the form needs no surface's model. */
const SELF = Object.freeze({ runAction: (it, answer, extra = {}) => postSecretAnswer(it, answer === 'store' ? 'store' : 'deny', extra) });
/** r3 (law B): THIS box — every field typed into it — into its own form window: the row's first line and its plan (the same
 *  nodes' rendering, a copy) above it. → the dialog | null (the same request's form already open: raised). */
function detachLoginBox(box, item) {
  const row = box.closest('.ut-item');
  const head = row && row.querySelector('.ut-text'), plan = row && row.querySelector('.ut-secret-plan');
  return showSecretPasteDialog(SELF, item, { words: head ? head.textContent : String(item.text || ''), plan: plan ? plan.cloneNode(true) : null, detail: plan ? '' : String(item.detail || ''), box });
}
/** r3 (law C): did the person type anything into this box? — a login's user name, password or two-step name; a pasted value;
 *  a new entry's name or description changed from the agent's (`data-was`). The read-only site and the tick are no typing. */
function boxTyped(box) {
  return [...box.querySelectorAll('input, textarea')].some((i) => !i.readOnly && i.type !== 'checkbox' && i.type !== 'hidden' && i.value !== (i.dataset.was ?? ''));
}
/** The box's state line (the vault locked / not set up — each with its door — or the last refusal's words). */
function stateEl() {
  const state = mk('div', 'ut-secret-state');
  state.setAttribute('role', 'status');
  const words = mk('span', 'ut-secret-words');
  const unlock = btn(t('Unlock…'), 'ut-secret-unlock');
  const setup = btn(t('Set a second password…'), 'ut-secret-setup');
  state.append(words, unlock, setup);
  return state;
}
/** A word of the card's FIRST line, read back from the item (the item is the record — src/vault-paste.js loginCardOf). */
const headParam = (item, name) => { const p = item && item.i18n && item.i18n.text && item.i18n.text.params; const v = p && p[name]; return typeof v === 'string' ? v : ''; };
/** lane login-request-card: THE LOGIN CARD's box — the add door's OWN fields (loginFields: the site the ask fixed, read-only; the
 *  user name, with the name the vault will keep when it differs — lower-cased, what the fill uses; the password; a two-step
 *  code's NAME + «Two-step code…», which opens THE 两步验证… dialog and fills the field with the name it saved), «Let <who> sign
 *  in to <site> with it» — ticked when the ask said so (`vault.requestGrantsRequester`) — whose words say what it grants
 *  (standing: master's grant has no time limit) while the button names the moment (Save and allow / Save only), and 拒绝. The
 *  tray keeps this box across every repaint (src/lib/user-todos-row.js). r3 (law B — what the owner typed is never lost by
 *  opening the helper, on EVERY surface that draws this card: the tray, the mini inbox, the chat's card, the phone's page):
 *  «Two-step code…» first moves THIS box — every field typed into it — into its own form window (unless it is in one already),
 *  then opens the 两步验证… dialog beside it; a surface that closes under a press in that dialog closes on nothing typed. The
 *  surfaces are a census (scripts/test-vault-paste.mjs ⑬), each with its Chrome leg (scripts/test-vault-paste-chrome.mjs ⑨). */
/** B-ab6c (the owner 2026-11-26; 主开发 r5023): THE UPDATE CARD — an agent's claim that a stored login no longer signs in. The add door's
 *  fields with the site AND the user name fixed (the ask's own: the login it named), ONE field «New password», the two-step code;
 *  Save = «Change password» (an update: the old one kept as previous), the Deny = «It still works» (the agent is told so). No grant
 *  tick: the conversation may use this login already (the door asked). It asks an unlocked vault, nothing more. */
function loginUpdateBoxEl(item) {
  const box = mk('div', 'ut-secret ut-secret-login ut-secret-login-update');
  box.dataset.req = String(item.action.requestId);
  box.dataset.target = 'login';
  box.dataset.expect = 'update';
  const name = String(item.action.update || ''), hash = name.lastIndexOf('#');
  const site = headParam(item, 'site') || String(item.action.hosts || ''), user = headParam(item, 'user') || (hash > 0 ? name.slice(hash + 1) : '');
  box.dataset.expectUser = user;
  const f = loginFields({ site, fixed: true, user, fixedUser: true, change: true });
  f.pw.classList.add('ut-secret-input');   // Enter in the password is Save (the tray's own key handler)
  const kept = mk('div', 'ut-secret-note ut-login-kept', t('The current password is kept as the previous one.'));
  const row = mk('div', 'ut-secret-row');
  const save = btn(t('Change password'), 'ut-act ut-secret-save'), deny = btn(t('It still works'), 'ut-act ut-secret-deny');
  row.append(save, deny);
  box.append(f.fields[0], f.fields[1], f.fields[2], kept, f.hint, row, stateEl());   // r5200: the new password only — the two-step binding is the row's own door (no field here to empty)
  applySecretBox(box);
  return box;
}
function loginBoxEl(item) {
  const box = mk('div', 'ut-secret ut-secret-login');
  box.dataset.req = String(item.action.requestId);
  box.dataset.target = 'login';
  const site = headParam(item, 'site') || String(item.action.hosts || ''), who = headParam(item, 'who') || t('The conversation that asked');
  const f = loginFields({ site, fixed: true, addCode: () => addCode.click() });   // lane vault-2fa-pick: an empty vault's list offers THIS card's «Two-step code…» (it moves the box first)
  f.pw.classList.add('ut-secret-input');   // Enter in the password is Save (the tray's own key handler); the dialog's draft field
  const kept = mk('div', 'ut-secret-note ut-login-kept');
  const sayKept = () => { const typed = f.user.value.trim(), low = typed.toLowerCase(); kept.textContent = typed && low !== typed ? t('Saved as «{user}» — the vault keeps user names in lower case', { user: low }) : ''; kept.style.display = kept.textContent ? '' : 'none'; };
  f.user.addEventListener('input', sayKept); sayKept();
  const addCode = btn(t('Two-step code…'), 'ut-secret-totp');
  addCode.addEventListener('click', () => { if (!box.closest('.vault-paste-dialog') && !detachLoginBox(box, item)) return; showTotpAddDialog({ refresh: (r) => { const n = r && typeof r.name === 'string' ? r.name : ''; if (!n) return; f.otpPick.added(n); } }); });
  const otpRow = mk('div', 'ut-login-otp');
  otpRow.append(f.fields[3], addCode);
  const allow = mk('input', 'ut-login-allow-box'); allow.type = 'checkbox'; allow.checked = item.action.grant === true;
  const allowLab = mk('label', 'ut-login-allow dialog-check-row'); // the house check row: the box, then its words (lane ui-phone-and-fit M6)
  const allowText = mk('span', null, t('Let {who} sign in to {site} with it', { who, site }));
  allowLab.append(allow, allowText);
  const allowSays = mk('div', 'ut-secret-note ut-login-says');
  const allowFence = mk('div', 'ut-secret-note ut-login-fence');
  const row = mk('div', 'ut-secret-row');
  const save = btn('', 'ut-act ut-secret-save'), deny = btn(t('Refuse'), 'ut-act ut-secret-deny');
  const sayAllow = () => {
    const using = !!box.dataset.use;   // one login, several sites: the grant follows the LOGIN — every site of it
    allowSays.textContent = allow.checked && using ? t('{who} can sign in with it on every site of this login until you remove it in Vault ▸ Web logins ▸ Use for… — there is no time limit.', { who })
      : allow.checked ? t('{who} can sign in as you on {site} with it until you remove it in Vault ▸ Web logins ▸ Use for… — there is no time limit.', { who, site }) : t('{who} cannot sign in with it until you allow it in Vault ▸ Web logins ▸ Use for….', { who });
    allowFence.textContent = allow.checked ? t('VibeSpace never hands the password to the agent and types it only on {site} into a password or code field; our fence stops accidental reads and wrong sites, and we do not promise to stop an agent that deliberately digs into a page it controls.', { site }) : '';
    allowFence.style.display = allowFence.textContent ? '' : 'none';
    save.textContent = using ? (allow.checked ? t('Add the site and allow') : t('Add the site only')) : (allow.checked ? t('Save and allow') : t('Save only'));
  };
  allow.addEventListener('change', sayAllow); sayAllow();
  row.append(save, deny);
  const note = mk('div', 'ut-secret-note', t('Wrong site? Refuse — the agent can ask again with the right one.'));
  const use = useSavedLoginEl({ box, site, who, origin: String(item.action.hosts || ''), user: f.user, typed: [f.fields[2], otpRow, f.otpList, f.hint], allowText, sayAllow });
  box.append(f.fields[0], use.button, use.pane, f.fields[1], kept, f.fields[2], otpRow, f.otpList, f.hint, allowLab, allowSays, allowFence, row, note, stateEl());
  applySecretBox(box);
  return box;
}

/** ONE LOGIN, SEVERAL SITES (lane login-request-card, step F's last part): «Use a login you already saved…» on the login card. The
 *  person picks one of the vault's web logins (site · user — never a value); the box then sends no password: the hub ADDS the
 *  request's site to that login (logins.addSite, the person's act). The user field becomes the name it signs in under there (the
 *  login's own by default); the words before the press (useLoginWords over the hub's site-words) say the exact address, its ASCII
 *  form, a look-alike, and by name who may then have it filled there; «Let … sign in» names every site of the login (the grant
 *  follows the login). «Type a new login instead» puts the card back as it was. `box.dataset.use` = the picked login's name. */
const USE_TYPING_MS = 250;   // the pause after a keystroke before the words before the press are drawn again for the typed name
function useSavedLoginEl({ box, site, who, origin, user, typed, allowText, sayAllow }) {
  const button = btn(t('Use a login you already saved…'), 'ut-login-use');
  const pane = mk('div', 'ut-login-use-pane'); pane.hidden = true;
  const pick = mk('select', 'ut-login-use-pick vault-pw');   // the card's own input look
  const says = mk('div', 'ut-secret-note ut-login-use-says');
  const unlock = btn(t('Unlock the vault'), 'ut-login-use-unlock'); unlock.hidden = true;   // a locked vault's own door, on the card
  const back = btn(t('Type a new login instead'), 'ut-login-use-back');
  pane.append(pick, says, unlock, back);
  let typedUser = '';
  // the name the login signs in under on the REQUEST's site when it holds that site already (else its own): the card starts from
  // it, so an unchanged card never asks a site the login has of another name (主开发 12:17Z, small)
  const userOn = (e) => { const s = e.origin === origin ? { user: e.user } : (e.sites || []).find((x) => x && x.origin === origin); return (s && s.user) || e.user; };
  const mode = (entry, sites) => {
    if (entry) box.dataset.use = entry.name; else delete box.dataset.use;
    for (const n of typed) if (n) n.hidden = !!entry;
    if (entry) { if (!box.dataset.useUser) typedUser = user.value; user.value = userOn(entry); box.dataset.useUser = '1'; }
    else if (box.dataset.useUser) { user.value = typedUser; delete box.dataset.useUser; }
    allowText.textContent = entry ? t('Let {who} sign in with it on every site of this login ({sites})', { who, sites }) : t('Let {who} sign in to {site} with it', { who, site });
    sayAllow();
  };
  // ONE LATEST RENDER (utils.js latestRender): two presses close together never draw the list twice
  let built = { list: [], state: null, failed: false };
  const drawPick = latestRender(pick, async (out) => {
    const r = await fetchJson('/api/vault/web-logins');
    built = { list: r && r.ok && Array.isArray(r.entries) ? r.entries : [], state: r && r.ok ? r.state || null : null, failed: !(r && r.ok) };
    if (!built.list.length) return;
    const none = mk('option', null, t('Pick the saved login')); none.value = ''; out.append(none);
    for (const e of built.list) { const o = mk('option', null, `${e.origin} · ${e.user}`); o.value = e.name; out.append(o); }
  });
  // an empty list is said for what it is: a LOCKED vault (its door here), a read that failed, or truly none saved
  const draw = async () => {
    says.textContent = ''; unlock.hidden = true;
    if (!(await drawPick())) return;   // a newer draw since (it says), or the card is gone
    pick._list = built.list;
    pick.hidden = !built.list.length;
    if (built.list.length) return;
    if (built.state === 'locked') { says.textContent = t('The vault is locked — unlock it to pick one of its saved logins.'); unlock.hidden = false; }
    else says.textContent = built.failed ? t('The saved logins could not be read — try again, or type this one below.') : t('No website login is saved yet — type this one below.');
  };
  button.addEventListener('click', async () => { button.hidden = true; pane.hidden = false; await draw(); });
  unlock.addEventListener('click', () => showUnlock({ then: () => { if (pane.isConnected && !pane.hidden) draw(); } }));
  // the words before the press — for the name typed on the card (sent; the hub says it back), drawn again when that name changes
  let wordsSeq = 0;
  const sayWords = async (e) => {
    const mine = ++wordsSeq;
    const w = await fetchJson(`/api/vault/web-logins/site-words?name=${encodeURIComponent(e.name)}&site=${encodeURIComponent(origin)}&user=${encodeURIComponent(String(user.value || '').trim())}`);
    if (mine !== wordsSeq || box.dataset.use !== e.name) return;   // another pick, or another name, since
    says.textContent = useLoginWords(w, { site, login: `${e.origin} · ${e.user}`, t }).join(' ');
  };
  pick.addEventListener('change', async () => {
    const e = (pick._list || []).find((x) => x.name === pick.value) || null;
    if (!e) { mode(null); says.textContent = ''; return; }
    const sites = [...new Set([e.origin, ...((e.sites || []).map((x) => x.origin)), origin].filter(Boolean))].join(', ');
    mode(e, sites);
    await sayWords(e);
  });
  // the name it signs in under there, edited after the pick: the words say THAT name — drawn again as it is TYPED (主开发 13:02Z (4),
  // a short pause first), and at once when the field is left
  let typing = null;
  const redraw = () => { const e = (pick._list || []).find((x) => x.name === box.dataset.use); if (e) sayWords(e); };
  user.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(redraw, USE_TYPING_MS); });
  user.addEventListener('change', () => { clearTimeout(typing); redraw(); });
  back.addEventListener('click', () => { mode(null); pane.hidden = true; button.hidden = false; pick.value = ''; says.textContent = ''; unlock.hidden = true; });
  return { button, pane };
}

/** lane totp-request-card (fb-251bb41646): THE TWO-STEP CARD's box — THE 两步验证… dialog's own field set (totpFields: the two
 *  ways, the name — the agent's proposal pre-filled, the person's edit wins — the hub's preview, the words), «Let <who> read its
 *  current code — never the seed — while it runs» (ticked when the ask said so: vault.requestGrantsRequester), whose words say
 *  what it gives (THE door: the entry's «Use for…», held for that conversation's current run), the button naming the moment
 *  (Save and allow / Save only — drawn once a preview worked, as the dialog's Save is), and Refuse. Save sends the request's
 *  answer (the link / the seed taken off the body by the route); `exists` and every other refusal say the dialog's own words. */
function totpBoxEl(item) {
  const box = mk('div', 'ut-secret ut-secret-totp-ask');
  box.dataset.req = String(item.action.requestId);
  box.dataset.target = 'totp';
  const who = headParam(item, 'who') || t('The conversation that asked');
  const allow = mk('input', 'ut-login-allow-box'); allow.type = 'checkbox'; allow.checked = item.action.grant === true;
  const allowLab = mk('label', 'ut-login-allow dialog-check-row'); // the house check row: the box, then its words (lane ui-phone-and-fit M6)
  allowLab.append(allow, mk('span', null, t('Let {who} read its current code — never the seed — while it runs', { who })));
  const allowSays = mk('div', 'ut-secret-note ut-login-says');
  const row = mk('div', 'ut-secret-row');
  const save = btn('', 'ut-act ut-secret-save'), deny = btn(t('Refuse'), 'ut-act ut-secret-deny');
  save.hidden = true;   // drawn once a preview worked (the dialog's rule — never a greyed button)
  const word = () => (allow.checked ? t('Save and allow') : t('Save only'));
  const sayAllow = () => {
    allowSays.textContent = allow.checked
      ? t('{who} can read its current code (never the seed) while it runs — a restart of that conversation ends it; give it again in Vault ▸ Two-step codes ▸ Use for….', { who })
      : t('{who} cannot read its code until you give it in Vault ▸ Two-step codes ▸ Use for….', { who });
    if (!box.dataset.saving) save.textContent = word();
  };
  const f = totpFields({
    name: typeof item.action.totpName === 'string' ? item.action.totpName : '', autofocus: false,
    onReady: (on) => { save.hidden = !on; },
    onSaving: (on) => { if (on) box.dataset.saving = '1'; else delete box.dataset.saving; save.textContent = on ? t('Saving…') : word(); },
    onSaved: () => { f.wipe(); },
  });
  box._totp = { fields: f, allow };
  allow.addEventListener('change', sayAllow); sayAllow();
  row.append(save, deny);
  const note = mk('div', 'ut-secret-note', t('Wrong code, or not yours to give? Refuse — the agent can ask again.'));
  box.append(...f.nodes, allowLab, allowSays, row, note, stateEl());
  applySecretBox(box);
  return box;
}

/** The box's state from the vault's facts (vault-unlock.js — kept live by the `vault-state` broadcast): LOCKED ⇒ the words
 *  + 解锁…; NOT SET UP and a new entry ⇒ the words + 设置第二密码…; else the last refusal (`error`) or nothing. */
export function applySecretBox(box, { error } = {}) {
  if (!box) return;
  if (error !== undefined) box.dataset.error = error || '';
  const f = vaultFacts() || {}, st = f.state || '';
  const entry = box.dataset.target === 'entry' || box.dataset.target === 'login' || box.dataset.target === 'totp';   // a free entry, a website login or a two-step code needs the vault set up
  const locked = st === 'locked', notSetUp = st === 'not_set_up' && entry;
  const say = locked ? t('The vault is locked (vault_locked) — unlock it, then save') : notSetUp ? t('The vault is not set up yet — set its second password, then save') : (box.dataset.error || '');
  const words = box.querySelector(':scope > .ut-secret-state > .ut-secret-words');
  if (words && words.textContent !== say) words.textContent = say;
  const unlock = box.querySelector(':scope > .ut-secret-state > .ut-secret-unlock'), setup = box.querySelector(':scope > .ut-secret-state > .ut-secret-setup');
  if (unlock) unlock.style.display = locked ? '' : 'none';
  if (setup) setup.style.display = notSetUp ? '' : 'none';
  const state = box.querySelector(':scope > .ut-secret-state');
  if (state) state.style.display = say ? '' : 'none';
  box.dataset.state = locked ? 'locked' : notSetUp ? 'not_set_up' : 'ready';
}

/** A refusal's code → the words the box says (never the value — the server's own words name the rule). */
function refusalSay(code, r) {
  if (code === 'vault_locked') return t('The vault is locked (vault_locked) — unlock it, then save');
  if (code === 'vault_not_set_up') return t('The vault is not set up yet — set its second password, then save');
  if (code === 'invalid_value') return t('Not saved — {why}', { why: r && r.why ? t(String(r.why)) : t('the field does not accept that value') });
  if (code === 'value_required') return t('Paste it first');
  if (code === 'value_too_long') return t('That is too long to be a secret (at most 8192 characters)');
  if (code === 'ask_settled') return t('Already answered');
  if (code === 'ask_unknown') return t('That request is gone');
  return wordsRefusalWords(code, r);   // lane vault-entry-description: the name / description the owner edited
}

/** THE PRESS (the tray's box, the dialog's): 存入保险库 sends the field's value through the model's ONE verb (the cookie
 *  door) and clears the field the moment it is stored; 拒绝 refuses (the field is cleared too). A refusal is said in the
 *  box (and a toast), the value kept in the field so the owner can unlock and press again. → true when answered. */
export async function submitSecretBox(model, item, box, answer) {
  if (!model || !item || !box || box.dataset.busy === '1') return false;
  if (box.dataset.target === 'login') return submitLoginBox(model, item, box, answer);   // lane login-request-card
  if (box.dataset.target === 'totp' && answer === 'store') return submitTotpBox(model, item, box);   // lane totp-request-card
  const input = box.querySelector('input.ut-secret-input');
  const value = answer === 'store' && input ? input.value : null;
  const nameEl = box.querySelector('input.ut-secret-name'), descEl = box.querySelector('textarea.ut-secret-desc');   // lane vault-entry-description: the owner's words (a new entry only)
  const words = answer === 'store' && nameEl ? { name: nameEl.value, note: descEl ? descEl.value.replace(/\s*[\r\n]+\s*/g, ' ') : undefined } : {};
  if (answer === 'store' && !String(value || '').trim()) { applySecretBox(box, { error: t('Paste it first') }); if (input) input.focus(); return false; }
  box.dataset.busy = '1';
  box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  let done = false;
  try {
    done = await model.runAction(item, answer, { value, ...words, onRefusal: (code, r) => applySecretBox(box, { error: refusalSay(code, r) }) });
  } finally {
    delete box.dataset.busy;
    box.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
  if (done && input) input.value = '';
  if (answer === 'deny' && input) input.value = '';
  return !!done;
}

/** A login answer's refusal in words — THE SAME sentence in the box and in its toast (the toast had said the hub's own English
 *  word for the code, in any language — lane login-request-card, the use door's follow-up). */
const loginSay = (code, r) => (['vault_not_set_up', 'ask_settled', 'ask_unknown', 'todos-unread'].includes(code) ? refusalSay(code, r) : loginRefusalWords(code, r));   // B-44f3: a held For you — the page's own words
/** lane login-request-card: the login box's press — its fields through the model's ONE verb (the same door); the password field
 *  is emptied once answered, every other field kept on a refusal (said in the box by the add door's own words). */
/** B-ab6c: the card's save would change a login already in the vault (the server named it: login_would_update) — the box says so,
 *  its Save reads «Change its password», and the next press is the update; another user name typed meanwhile is a new login again. */
function loginWouldUpdate(box, user) {
  const sb = box.querySelector('.ut-secret-save');
  if (sb && !box.dataset.saveWords) box.dataset.saveWords = sb.textContent;
  box.dataset.expect = 'update'; box.dataset.expectUser = user.value.trim();
  if (sb) sb.textContent = t('Change its password');
  user.addEventListener('input', () => { if (user.value.trim() !== box.dataset.expectUser) { delete box.dataset.expect; if (sb && box.dataset.saveWords) sb.textContent = box.dataset.saveWords; } }, { once: true });
}
async function submitLoginBox(model, item, box, answer) {
  const q = (s) => box.querySelector(s);
  const user = q('input.vault-login-user'), pw = q('input.vault-login-pass'), otp = q('input.vault-login-otp'), allow = q('input.ut-login-allow-box');
  const using = box.dataset.use || '';   // one login, several sites: the picked login — no password on this road
  const login = answer !== 'store' ? null : using ? { useLogin: using, username: user ? user.value.trim() : '', allow: !!(allow && allow.checked) }
    : { username: user ? user.value.trim() : '', loginPassword: pw ? pw.value : '', ...(otp && otp.value.trim() ? { totpName: otp.value.trim() } : {}), allow: !!(allow && allow.checked), expect: box.dataset.expect === 'update' && box.dataset.expectUser === (user ? user.value.trim() : '') ? 'update' : 'new' };   // B-ab6c: the card says it before it saves over a login already here
  const say = loginSay;
  box.dataset.busy = '1';
  box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  let done = false;
  try { done = await model.runAction(item, answer, { login, onRefusal: (code, r) => { if (code === 'login_would_update' && user) loginWouldUpdate(box, user); applySecretBox(box, { error: say(code, r) }); } }); }   // B-ab6c: the second press is the update
  finally { delete box.dataset.busy; box.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  if ((done || answer === 'deny') && pw) pw.value = '';
  return !!done;
}

/** lane totp-request-card: the two-step box's Save — THE field set's own save (what its preview showed; a click while an ask is
 *  on the wire waits, said on the button) through the model's ONE verb (the same door). A refusal comes back to the field set,
 *  which says it in the dialog's own words («exists»: pick another name); the fields are wiped once it is stored. */
async function submitTotpBox(model, item, box) {
  const h = box._totp;
  if (!h) return false;
  box.dataset.busy = '1';
  try {
    return !!(await h.fields.doSave(async (body) => {
      let refused = null;
      const ok = await model.runAction(item, 'store', { totp: { ...body, allow: !!h.allow.checked }, onRefusal: (code, r) => { refused = { ...(r || {}), ok: false, code }; } });
      return ok ? { ok: true } : (refused || { ok: false, code: 'failed' });
    }));
  } finally { delete box.dataset.busy; }
}

/** The answer's toast + the box's refusal (the model's runAction hands the refusal back through `onRefusal`). */
export async function postSecretAnswer(item, answer, { value = null, name, note, login = null, totp = null, onRefusal = null } = {}) {   // totp: lane totp-request-card — the two-step field set's body + the tick
  const body = answer === 'store' ? (totp ? { answer, totpLink: totp.uri, totpSeed: totp.seed, totp: { name: totp.name, digits: totp.digits, period: totp.period, algorithm: totp.algorithm }, allow: totp.allow === true } : login ? { answer, ...login } : { answer, value, ...(typeof name === 'string' ? { name } : {}), ...(typeof note === 'string' ? { note } : {}) }) : { answer };   // name / note: lane vault-entry-description · login: lane login-request-card (its password as `loginPassword` — the route takes it off the body)
  const r = await fetchJson(`/api/vault/secret-requests/${encodeURIComponent(item.action.requestId)}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r && r.ok && totp && r.outcome === 'stored') { showToast(r.allowed ? t('Saved «{name}» — the agent may read its current code while it runs; it never sees the seed', { name: r.name }) : totp.allow ? (r.whyNot && r.whyNot !== 'not_running' ? t('Saved «{name}», but its code was not given — give it in Vault ▸ Two-step codes ▸ Use for…', { name: r.name }) : t('Saved «{name}», but its code was not given — that conversation was not running; give it in Vault ▸ Two-step codes ▸ Use for…', { name: r.name })) : t('Saved «{name}» — the agent cannot read its code until you give it', { name: r.name }), totp.allow && !r.allowed ? { type: 'error' } : undefined); return true; }   // lane totp-request-card
  if (r && r.ok && login && r.outcome === 'stored' && r.joined) {   // one login, several sites: the use road's answer
    // a tick whose grant could not be written is an ERROR, as on the typed road (主开发 12:17Z); a site the login held already is said
    if (login.allow && !r.allowed) showToast(t('The site is on the saved login, but the permission could not be written — allow it in Vault ▸ Web logins ▸ Use for…'), { type: 'error' });
    else if (r.already) showToast(r.allowed ? t('That site was on the saved login already — the agent may now sign in with it there; VibeSpace never hands it the password') : t('That site was on the saved login already — nothing was changed'));
    else showToast(r.allowed ? t('Added the site to the saved login — the agent may sign in with it there; VibeSpace never hands it the password') : t('Added the site to the saved login — the agent may not sign in with it until you allow it in Vault ▸ Web logins ▸ Use for…'));
    return true;
  }
  if (r && r.ok && login && r.outcome === 'stored') { showToast(r.allowed ? t('Saved to the vault — the agent may sign in with it on that site; VibeSpace never hands it the password') : login.allow ? t('Saved to the vault, but the permission could not be written — allow it in Vault ▸ Web logins ▸ Use for…') : t('Saved to the vault — the agent cannot sign in with it until you allow it'), login.allow && !r.allowed ? { type: 'error' } : undefined); return true; }   // lane login-request-card
  if (r && r.ok) { showToast(r.outcome === 'stored' ? t('Saved to the vault — the agent is told it is there, never the value') : t('Refused — the agent is told on its next turn')); return true; }
  const code = r && r.code;
  if (typeof onRefusal === 'function') { try { onRefusal(code, r); } catch { } }
  showToast(login ? loginSay(code, r) : refusalSay(code, r), { type: 'error' });   // a login's refusal: the box's own sentence
  return false;
}

/** B-ef1b: THE RETIRED JOB-SECRETS NOTICE'S TWO BUTTONS (src/foryou-actions.js `job-secrets-retired` — a person's press over
 *  POST /api/vault/job-secrets/:answer, src/server/job-secrets-door.js). «Move into the vault» while the vault is locked asks the
 *  unlock FIRST and runs at the unlock (unlockThen — a close without one moves nothing); with no vault yet it asks the SETUP
 *  (the read, r1); «Delete the file» asks a confirm (the values go with the file). The server settles the notice; every refusal
 *  is said in words (the value it stopped at by its name when the name is safe to show). → true when it was answered. */
export async function answerJobSecrets(answer) {
  if (answer === 'delete') {
    const { showConfirmDialog } = await import('./utils.js');
    if (!(await showConfirmDialog({ title: t('Delete the file?'), message: t('The file and every value in it are deleted. Nothing is moved into the vault.'), confirmText: t('Delete'), danger: true }))) return false;
  } else if (vaultFacts()?.state === 'not_set_up') {
    showSetup();
    return false;
  } else if (vaultFacts()?.state !== 'unlocked') {
    const { unlockThen } = await import('./vault-unlock.js');
    await new Promise((done) => unlockThen(done));
    if (vaultFacts()?.state !== 'unlocked') return false;
  }
  const r = await fetchJson(`/api/vault/job-secrets/${encodeURIComponent(answer)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (r && r.ok) {
    const n = (r.moved || []).length, skipped = Number(r.skipped) || 0;
    showToast(answer === 'move' ? (skipped ? t('{n} secret(s) moved into the vault, {m} empty one(s) left out — the file is deleted', { n, m: skipped }) : t('{n} secret(s) moved into the vault — the file is deleted', { n })) : t('The file is deleted'));
    return true;
  }
  // the vault shut between the press and the answer: its own door opens (never a sentence without the way to it — test-vault-words)
  if (r && r.code === 'vault_locked') { showUnlock(); if (Number(r.leftover) > 0) showToast(t('{n} copy(ies) it made are left in the vault — For you names them', { n: Number(r.leftover) }), { type: 'error' }); return false; }
  if (r && r.code === 'vault_not_set_up') { showSetup(); return false; }
  // bl-vault B-ef1b: a refusal whose undo could not remove every copy it made says so (For you names them)
  const left = r && r.code !== 'job_secrets_leftover' ? Number(r.leftover) || 0 : 0;
  showToast(jobSecretsRefusal(r, answer) + (left ? ` — ${t('{n} copy(ies) it made are left in the vault — For you names them', { n: left })}` : ''), { type: 'error' });
  return false;
}
function jobSecretsRefusal(r, answer) {
  const c = (r && r.code) || '';
  const which = r && r.name ? `${r.name}: ` : r && r.at ? `${t('Value {n}', { n: r.at })}: ` : '';   // the value it stopped at — by its name when that name is safe to show (the door sends none otherwise)
  const W = {
    job_secrets_gone: () => t('The file is not there any more'),
    job_secrets_not_a_file: () => t('data/job-secrets.retired.json is a link, a folder or a file with a second name — nothing was read or deleted. A link: put the file it points to in its place. A second name: delete that other name. A folder: move it out of the way. Then press again'),
    job_secrets_unreadable: () => t('The file could not be read as names and values — nothing was moved'),
    job_secrets_nothing: () => t('The file holds no value to move — delete it instead'),
    job_secrets_undeletable: () => (answer === 'delete' ? t('The file could not be deleted') : t('The file could not be deleted — nothing was moved')),
    job_secrets_value_shape: () => which + t('not a plain text, number or true/false (or text with spaces around it) — nothing was moved; the file is kept: correct that value in data/job-secrets.retired.json, then press again'),
    job_secrets_changed: () => t('The file changed while it was being moved — nothing was moved; press again'),
    job_secrets_leftover: () => t('Copies an earlier try made are still in the vault and cannot be removed now — nothing was moved; For you names them'),
    job_secrets_record_unreadable: () => t('The record of the copies a move left could not be read — it is kept as {file}; nothing was moved. Delete the copies you do not want in the Vault window, then delete that file and press again', { file: (r && r.file) || 'data/job-secrets.leftover.json' }),
    job_secrets_record_unwritable: () => t('The record of the copies a move makes could not be written — nothing was moved; press again later'),
    job_secrets_record_held: () => t('The record of the copies a move left could not be read just now — nothing was moved; press again in a moment'),
    job_secrets_busy: () => t('The file is being moved — try again in a moment'),
    job_secrets_answer: () => t('That answer is not offered'),
    value_too_long: () => which + t('too long for the vault — nothing was moved; the file is kept'),
  };
  if (W[c]) return W[c]();
  return answer === 'delete' ? t('Could not delete the file — {reason}', { reason: c || t('server unreachable') }) : t('Could not move the secrets — {reason}', { reason: c || t('server unreachable') });
}

/** THE SAME BOX AS A DIALOG (the For-you window's pane, the Vault window's 「需要你」): the request's words above the box. */
export function showSecretPasteDialog(model, item, { words = '', detail = '', plan = null, box: kept = null } = {}) {   // box: lane login-request-card — a box moved out of a surface, its typed fields kept · plan: that row's plan (its rendering)
  if (!isSecretAsk(item)) return null;
  const box = kept || secretBoxEl(item);
  const press = async (answer) => { if (await submitSecretBox(model, item, box, answer)) close(); };
  const fieldOf = () => box.querySelector('input.ut-secret-input');
  // r3 (law C): the unsaved question covers EVERYTHING a person typed into the box (boxTyped), not the password alone
  const { dialog, body, close, raised } = createModalShell({ id: 'vault-paste-dialog', key: item && item.id, beside: true, title: isLoginAsk(item) ? t('A website login for the vault') : t('Paste a secret into the vault'), dialogClass: 'vault-paste-dialog', escapeToClose: true,
    unsaved: { isDirty: () => boxTyped(box), save: () => press('store'), discard: () => { const f = fieldOf(); if (f) f.value = ''; } }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was   // a pasted value never vanishes without a word — nor stays in a closed dialog
  const planEl = plan || mk('div', null);
  if (!plan) planEl.innerHTML = linkedHtml(String(detail || ''), { escape: escHtml, note: (g) => maskedLinkNote(g, t), whole: fieldWhole(item, 'detail', detail) });   // r3: THE item's words renderer (the tray's wordsHtml) — a masked link = its words + THE note, inline in the prose
  planEl.className = 'ut-proposal-plan vault-paste-plan';
  body.append(mk('div', 'vault-paste-words', words), planEl, box);
  box.addEventListener('click', (e) => {
    if (e.target.closest('.ut-secret-unlock')) { showUnlock({ then: () => applySecretBox(box) }); return; }
    if (e.target.closest('.ut-secret-setup')) { showSetup(); return; }
    if (e.target.closest('.ut-secret-save')) press('store');
    else if (e.target.closest('.ut-secret-deny')) press('deny');
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && e.target.matches('input.ut-secret-input')) { e.preventDefault(); press('store'); } });
  const input = fieldOf();
  if (input) setTimeout(() => input.focus(), 0);
  return { dialog, close, box };
}

/** lane vault-entry-description: Edit… — the OWNER's own name and description of an entry (a row of a kind that carries words):
 *  the ONE writer (POST /api/vault/entry-words — a person on this page), no card. `refresh()` redraws the window's list. */
export function showWordsEditDialog({ row, refresh = () => {} } = {}) {
  if (!row || !row.entry) return null;
  let saveNow = () => {};
  const name = mk('input', 'vault-pw vault-words-name'); name.type = 'text'; name.maxLength = 80; name.autocomplete = 'off'; name.value = String(row.label || '');
  const note = mk('textarea', 'vault-pw vault-words-note'); note.rows = 3; note.maxLength = 400; note.value = String(row.note || ''); note.placeholder = t('What it is for — which system, which account, what it may do');
  // one subject: one entry's words
  const { dialog, body, close, raised, ready } = createModalShell({ id: 'vault-words-edit', key: row.id, title: t('Name and description'), dialogClass: 'vault-secret-add-dialog vault-words-dialog', escapeToClose: true,
    unsaved: { isDirty: () => name.value !== String(row.label || '') || note.value !== String(row.note || ''), save: () => saveNow(), discard: () => {} }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const field = (label, control) => { const l = mk('label', 'vault-secret-field'); l.append(mk('span', 'vault-secret-label', label), control); return l; };
  const err = mk('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  const foot = mk('div', 'dialog-footer');
  const cancel = btn(t('Cancel'), 'btn-cancel'), save = btn(t('Save'), 'btn-create');
  foot.append(cancel, save);
  body.append(mk('div', 'vault-words-help', t('Every agent that may use it reads its name and description in its list — say what it is for, never the secret itself.')), field(t('Name'), name), field(t('Description'), note), err);
  dialog.append(foot);
  cancel.onclick = () => close();
  save.onclick = saveNow = async () => {
    save.disabled = true;
    const r = await fetchJson('/api/vault/entry-words', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry: row.entry, name: name.value, note: note.value.replace(/\s*[\r\n]+\s*/g, ' ') }) });   // one paragraph: a line break folds
    save.disabled = false;
    if (r && r.ok) { close(); showToast(t('Saved: {name}', { name: r.name || name.value })); try { refresh(); } catch { } return; }
    err.textContent = wordsRefusalWords(r && r.code, r);
  };
  ready.then((s) => { if (s) setTimeout(() => name.focus({ preventScroll: true }), 0); });   // once it opens (a keyed form may wait behind the open one's ask)
  return { dialog, close };
}

/** 「其他密钥或密码…」 — the Vault window's free entry: a name, a kind, the value (the masked field), a note → POST
 *  /api/vault/secrets (a person on this page; unlocked only). `refresh()` redraws the window's list on success. */
export function showSecretAddDialog({ refresh = () => {} } = {}) {
  let saveNow = () => {};
  // one subject: one key or password being added
  const { dialog, body, close, raised } = createModalShell({ id: 'vault-secret-add', title: t('Add another key or password'), dialogClass: 'vault-secret-add-dialog', escapeToClose: true,
    unsaved: { isDirty: () => !!(name.value || value.value || note.value), save: () => saveNow(), discard: () => { value.value = ''; } }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const field = (label, control) => { const l = mk('label', 'vault-secret-field'); l.append(mk('span', 'vault-secret-label', label), control); return l; };
  const name = mk('input', 'vault-pw vault-secret-name'); name.type = 'text'; name.maxLength = 80; name.autocomplete = 'off'; name.placeholder = t('What it is — e.g. Router admin password');
  const kind = mk('select', 'vault-secret-kind');
  for (const [v, w] of [['password', t('Password')], ['api-key', t('API key')], ['secret', t('Secret')]]) { const o = mk('option', null, w); o.value = v; kind.append(o); }
  const value = secretInput(t('Paste or type the value'));
  const note = mk('textarea', 'vault-pw vault-secret-note'); note.rows = 2; note.maxLength = 400; note.placeholder = t('What it is for — which system, which account, what it may do (agents that may use it read this)');   // lane vault-entry-description: was «a note for yourself — never shown to an agent»
  const err = mk('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  const foot = mk('div', 'dialog-footer');
  const cancel = btn(t('Cancel'), 'btn-cancel');
  const save = btn(t('Save to vault'), 'btn-create');
  foot.append(cancel, save);
  body.append(field(t('Name'), name), field(t('Kind'), kind), field(t('Value'), value), field(t('Description'), note), err);
  dialog.append(foot);
  cancel.onclick = () => { value.value = ''; close(); };
  save.onclick = saveNow = async () => {
    save.disabled = true;
    const r = await fetchJson('/api/vault/secrets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: name.value, kind: kind.value, note: note.value.replace(/\s*[\r\n]+\s*/g, ' '), value: value.value }) });   // one paragraph: a line break folds (lane vault-entry-description)
    save.disabled = false;
    if (r && r.ok) { value.value = ''; close(); showToast(t('Saved to the vault: {name}', { name: r.label || name.value })); try { refresh(); } catch { } return; }
    const code = r && r.code;
    err.textContent = code === 'name_required' ? t('Give it a name') : code === 'value_required' ? t('Paste or type the value') : code === 'vault_locked' ? t('The vault is locked (vault_locked) — unlock it, then save') : wordsRefusalWords(code, r);   // lane vault-entry-description: THE words rule's refusals
  };
  value.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); save.onclick(); } });
  setTimeout(() => name.focus(), 0);
  return { dialog, close };
}
