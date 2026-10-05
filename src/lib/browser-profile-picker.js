// THE PIN'S ONE ENTRY POINT ON THE CLIENT (agent browser P1, design §3.2.5):
// `session.pinBrowser` is one command with four surfaces — the session-card
// right-click menu (the ACTING surface), Session Properties (the EXPLAINING
// one), the live-view window's title (P2 — it calls `showBrowserProfilePicker`
// when it exists) and the New Session dialog (which sends an EXPLICIT value +
// the origin it computed as `spawnOriginHint.browserProfile`). This mixin owns
// the client-side digest of data/browser-profiles.json (fetched at boot,
// refreshed by the `browser-profiles-updated` broadcast — the multi-client
// law) and the picker itself. No pure model is imported here: the client only
// lists what the server's digest says and asks the server to decide.
import { escHtml, fetchJson, showContextMenu, showToast } from './utils.js';
import { t } from './i18n.js';
import { learnBackendRows } from './browser-switcher-model.js';
import { browserFactWords } from '../browser-fact.js'; // lane S2: THE browser fact — the pin, the browser in use, why they differ
import { openNewProfileDialog } from './browser-new-profile.js'; // lane browser-admin: the picker's adopt rows open THE New profile… dialog

/** The label of a pin's ORIGIN, the same five words Session Properties uses
 *  for model/effort (the two-site vocabulary, test-browser-pin ①). */
export function pinOriginLabel(origin) {
  switch (origin) {
    case 'chosen': return t('your choice for this session');
    case 'conversation': return t('this conversation’s own value');
    case 'task-group': return t('Task-Group default');
    case 'instance': return t('instance default');
    default: return t('harness default — the agent’s own config decides');
  }
}
/** The picker's "New persistent profile…" row. verify r2 (H3): the row claims NOTHING about keep vs empty — the rung alone
 *  cannot say it (rung D keeps its directory too since lane browser-resume, and the row said "New empty persistent profile
 *  (reopens the browser)…" over a browser whose logins the dialog then kept); the SERVER's plan (GET /api/browser/adopt)
 *  decides, and the dialog says which in plain words. `browserVariant` is kept for callers. */
export function adoptLabel(browserVariant) { // eslint-disable-line no-unused-vars
  return t('New persistent profile from this conversation…');
}
/** Does the picker exist for this session row? Live, local, keyed, and the
 *  client holds a digest (the feature is on and the server answered). */
export function canPinBrowser(app, s) {
  return !!(app && app._browserProfiles && Array.isArray(app._browserProfiles.profiles) && s && s.status === 'live' && s.webuiId && !s.host);
}
/** Owner ruling A: a profile's name as every pin surface spells it — "(only some conversations)" when the user kept it
 *  to a list of conversations / Task Groups (picking it here ADDS this conversation to that list — the pick writes the
 *  list), "(legacy shared)" for the migration's record. The list itself is drawn in ONE place, the Agent browser panel. */
export function profilePickLabel(p) {
  if (!p) return '';
  if (p.legacy) return p.label + ' ' + t('(legacy shared)');
  if (p.scope === 'only') return p.label + ' ' + t('(only some conversations)');
  return String(p.label || '');
}
/** The picker's rows, DOM-free: current pin ✓, "No profile (temporary browser)", every profile, then
 *  the adopt item. `pinnedId` is the session's browser FACT's pin (`browserFact.pinned.id`, lane S2). Owner
 *  ruling A: EVERY named profile is offered — a mediated one too (a pin is a default attachment now, never a
 *  directory handed to the next launch). */
export function pickerItems({ profiles = [], pinnedId = null, browserVariant = null, chips = {}, onSwitch = null, onPin, onAdopt, choicesOf = () => [] }) {
  const items = [];
  // the ticked row is where the pin already is: choosing it again changes nothing, so it asks the server nothing (lane J — it used to queue a "ephemeral → ephemeral" notice)
  items.push({ label: (pinnedId ? '  ' : '✓ ') + t('No profile (temporary browser)'), action: () => { if (pinnedId) onPin(null); } }); // lane S2: plain words, never "ephemeral"
  for (const p of profiles) {
    items.push({ label: (p.id === pinnedId ? '✓ ' : '  ') + profilePickLabel(p) + (chips && chips[p.id] ? ' · ' + chips[p.id] : ''), action: () => { if (p.id !== pinnedId) onPin(p.id); } });
  }
  // P4 (§7.4) → the rebuilt switch dialog: the pinned profile's browser as an item opening the dialog — ONLY when another
  // browser is available for it (`choicesOf(profileId)`, the digest's switch choices); otherwise there is nothing to switch to
  const choices = pinnedId && typeof choicesOf === 'function' ? (choicesOf(pinnedId) || []) : [];
  if (pinnedId && typeof onSwitch === 'function' && choices.length) { items.push({ separator: true }); items.push({ label: t('Switch browser (now {name})…', { name: (chips && chips[pinnedId]) || t('unknown browser') }), action: () => onSwitch(pinnedId) }); } // says what it does (2026-09-28)
  items.push({ separator: true });
  items.push({ label: adoptLabel(browserVariant), action: () => onAdopt() });
  return items;
}

export function installBrowserProfilePicker(App) {
  /** Boot fetch of the digest; a 503 (feature unavailable) leaves it null so
   *  every surface hides itself honestly. */
  App.prototype.refreshBrowserProfiles = function () {
    return fetchJson('/api/browser/profiles').then((d) => {
      this._browserProfiles = d && !d.error && Array.isArray(d.profiles) ? d : null;
      learnBackendRows(this._browserProfiles && this._browserProfiles.providers); // lane dc-browser-backends (F5): the rows' words
      try { this._browserProfilesHook?.(); } catch { }
      return this._browserProfiles;
    }).catch(() => this._browserProfiles);
  };
  App.prototype._onBrowserProfilesUpdated = function (msg) {
    if (!msg || !Array.isArray(msg.profiles)) return;
    const { type, ...digest } = msg;
    const prev = this._browserProfiles;
    this._browserProfiles = digest;
    learnBackendRows(digest && digest.providers); // lane dc-browser-backends (F5): the rows' words
    try { this._browserProfilesHook?.(); } catch { }
    try { this.onBrowserDigestChanged?.(prev, digest); } catch (e) { console.warn('[browser] digest hook failed', e); } // P7 (§4.6): auto-bind on a NEW lease
    try { this._refillBrowserProfileRow?.(); } catch (e) { console.warn('[browser] new-session profile row not re-filled', e); } // lane S2: an open New Session dialog follows the registry
  };
  /** A conversation's name from this client's own session rows (a browser key → its webui name). */
  App.prototype.conversationNameOf = function (browserKey) {
    const s = (this.sidebar?._allSessions || []).find((x) => x && x.browserKey === browserKey);
    return s ? String(s.webuiName || s.name || '') : '';
  };
  /** `{value, label}` rows for a <select>: the first is "No profile (temporary browser)" (lane S2: plain words). Owner
   *  ruling A: EVERY named profile of the registry the panel reads — a mediated one too (lane S2, naive study 2, T4: the
   *  dialog lost the recreated shared "work" while the panel listed it). `includeShared` is accepted and moot: since the
   *  ruling a pin is a default ATTACHMENT, so the Task Group default lists every profile as the New Session dialog does. */
  App.prototype.browserProfileOptions = function ({ includeShared = true } = {}) {
    const list = this._browserProfiles?.profiles || [];
    return [{ value: '', label: t('No profile (temporary browser)') }, ...list.map((p) => ({ value: p.id, label: profilePickLabel(p) }))];
  };
  /** ONE pin write for every surface; the answer says when it applies. */
  App.prototype.pinBrowserProfile = async function (s, profileId) {
    if (!s?.webuiId) return null;
    const r = await fetchJson('/api/browser/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.webuiId, profile: profileId || null }) });
    if (!r || r.error) { showToast(r?.error || t('server unreachable'), { type: 'error' }); return null; }
    // owner ruling A: the words say what the user will SEE — never a command line (`appliesFrom` is the agent's sentence)
    // "Who can use it" is a list: a pick of a profile kept to some conversations ADDS this one to them — said, never silent
    showToast(r.pin ? t('Pinned to {name} — the agent’s next browser command opens it', { name: r.pin.label }) + (r.added ? t(' · this conversation was added to the ones that can use it') : '') : t('Unpinned — the agent’s next browser command uses a temporary browser'), { duration: 7000 });
    if (r.repoint && r.repoint.ok === false) showToast(r.repoint.why, { type: 'warn', duration: 9000 });
    return r;
  };
  /** lane browser-admin: the picker's "New persistent profile…" rows open THE New profile… dialog (the Agent browser
   *  panel's), the conversation's name prefilled — its POST goes to the adopt route (the conversation's own browser,
   *  and on rung C its logins, become the profile; the conversation is pinned to it). Resolves with the dialog's answer. */
  App.prototype.adoptBrowserProfile = function (s) {
    if (!s?.webuiId) return Promise.resolve(null);
    const name = String(s.webuiName || s.name || '').trim().slice(0, 60);
    // verify r1 (F7): the SERVER says whether this conversation's browser is kept (its logins become the profile, as it is)
    // or a new empty one is made — the dialog draws that form (rung D keeps too; the rung alone guessed "empty" and drew a
    // browser / machine / build the keep then dropped). An unanswered ask falls back to the rung; the POST refuses by name.
    // a dialog closed without a create resolves null (never a hanging await)
    return fetchJson('/api/browser/adopt?sessionId=' + encodeURIComponent(s.webuiId)).then((plan) => new Promise((resolve) => {
      const fromSession = plan && !plan.error && typeof plan.keep === 'boolean' ? { ...s, adoptKeeps: plan.keep } : s;
      openNewProfileDialog(this, { label: name, fromSession, onCreated: (p, r) => resolve(r || null), onDismissed: () => resolve(null) });
    }));
  };
  /** The picker: a context menu at the pointer (the card's right-click) or an
   *  anchor (Session Properties / the live-view title). */
  App.prototype.showBrowserProfilePicker = function (s, { x = 0, y = 0 } = {}) {
    if (!canPinBrowser(this, s)) { showToast(t('Browser profiles are not available for this session'), { type: 'warn' }); return; }
    const fact = s.browserFact && typeof s.browserFact === 'object' ? s.browserFact : null; // lane S2: the pin comes from THE fact
    const items = pickerItems({
      profiles: this._browserProfiles.profiles, pinnedId: fact && fact.pinned ? fact.pinned.id : null, browserVariant: s.browserVariant || null,
      chips: Object.fromEntries((this._browserProfiles.profiles || []).map((p) => [p.id, this.browserChipFor ? this.browserChipFor(p.id) : null]).filter(([, c]) => c)), // the browser's NAME in words (never `chromium 151`)
      choicesOf: (id) => (this.browserChoicesFor ? this.browserChoicesFor(id) : []),
      onSwitch: (id) => this.openBrowserSwitcher?.({ profileId: id, sessionId: s.webuiId }),
      onPin: (id) => this.pinBrowserProfile(s, id),
      onAdopt: () => this.adoptBrowserProfile(s),
    });
    showContextMenu(x, y, items);
  };
  /** The New Session dialog's row (§3.2.5's fourth surface): defaults to the
   *  Task Group's default profile, else the instance default, else none — and
   *  REMEMBERS which of those filled it (`dataset.origin`) so the wire can say
   *  it (B-6b6d r3: what the client filled in on the user's behalf must say so).
   *  A pick by the user is 'chosen'. Hidden when there is no digest or the
   *  backend is a plain shell. */
  App.prototype._fillBrowserProfileRow = function (taskId) {
    const row = document.getElementById('row-browser-profile');
    const sel = document.getElementById('input-browser-profile');
    if (!row || !sel) return;
    const backend = document.getElementById('input-backend')?.value || 'claude';
    const d = this._browserProfiles;
    // identity verify r3 (2026-09-28, round 2's finding 6): a session on ANOTHER machine (a host picked) can never open a
    // profile here — the row is not offered for it (the server records nothing but an inert pin for such a pick)
    const onHost = !!document.getElementById('input-host')?.value;
    const show = !!(d && Array.isArray(d.profiles) && backend !== 'shell' && !onHost);
    row.style.display = show ? '' : 'none'; // no global .hidden in this repo — display is the honest switch
    if (!show) { sel.value = ''; sel.dataset.origin = ''; return; }
    this._browserProfileRowTask = taskId || null; // lane S2: the digest broadcast re-fills an OPEN dialog with the same facts
    sel.innerHTML = '';
    for (const o of this.browserProfileOptions({ includeShared: true })) { const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); }
    const byRef = (ref) => { const r = String(ref || '').trim(); if (!r) return ''; const hit = d.profiles.find((p) => p.id === r) || d.profiles.filter((p) => String(p.label || '').toLowerCase() === r.toLowerCase()); return Array.isArray(hit) ? (hit.length === 1 ? hit[0].id : '') : hit.id; };
    const group = taskId ? this.sidebar?._taskById?.(taskId) : null;
    let value = '', origin = '';
    if (group && group.browserProfileId && byRef(group.browserProfileId)) { value = byRef(group.browserProfileId); origin = 'task-group'; }
    else { const inst = byRef(this.settings?.get?.('browser.defaultProfile')); if (inst) { value = inst; origin = 'instance'; } }
    sel.value = value; sel.dataset.origin = origin;
    sel.onchange = () => { sel.dataset.origin = 'chosen'; };
  };
  /** lane S2 (naive study 2, T4): the `browser-profiles-updated` broadcast re-fills the dialog's list while it is
   *  OPEN — the list is the registry's, never the one cached at first open; a user's pick survives (a pick of a
   *  profile that is gone falls back to the default rung, said by the value itself). */
  App.prototype._refillBrowserProfileRow = function () {
    const dlg = document.getElementById('dialog-new-session');
    const sel = document.getElementById('input-browser-profile');
    if (!dlg || !sel || !dlg.offsetParent) return false;
    const picked = sel.dataset.origin === 'chosen' ? sel.value : null;
    this._fillBrowserProfileRow(this._browserProfileRowTask || null);
    if (picked !== null && [...sel.options].some((o) => o.value === picked)) { sel.value = picked; sel.dataset.origin = 'chosen'; }
    return true;
  };
  /** Session Properties' explaining rows (lane S2): THE browser fact's line — the browser this conversation uses
   *  now, and both names when the pin says otherwise — then the pin's origin and how many sessions share it
   *  (from the digest's leases). HTML-escaped; never a raw id where a name exists (ids ride the title). */
  App.prototype.browserPinSummaryHtml = function (s) {
    const d = this._browserProfiles;
    const fact = s && s.browserFact && typeof s.browserFact === 'object' ? s.browserFact : null;
    if (!d || !fact) return '';
    const w = browserFactWords(fact, t);
    const p = fact.pinned ? (d.profiles || []).find((x) => x.id === fact.pinned.id) : null;
    const origin = fact.pinned ? pinOriginLabel(fact.pinned.origin || 'chosen') : '';
    const attached = p ? (d.leases || []).filter((l) => l.profileId === p.id).length : 0;
    const chipText = p && this.browserChipFor ? this.browserChipFor(p.id) : null;
    const chip = chipText ? ` <span class="chat-status-dim browser-chip">${escHtml(chipText)}</span>` : ''; // P4: the browser's name in words (escaped: it syncs to every client)
    // owner ruling A: who may use it — every conversation (the default), or only some (the list in the Agent browser panel)
    const scope = p ? (p.scope === 'only' ? t('only some conversations') : t('every conversation can use it')) : '';
    return `<span class="session-props-browser-line${w.amber ? ' amber' : ''}" title="${escHtml(w.tooltip)}">${escHtml(w.line)}</span>${chip}${origin ? ` <span class="chat-status-dim">${escHtml('(' + t('pinned') + ': ' + origin + ')')}</span>` : ''}${p ? ` <span class="chat-status-dim">${escHtml('· ' + scope + ' · ' + t('{n} conversation(s) using it now', { n: attached }))}</span>` : ''}`;
  };
}
