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
import { escHtml, fetchJson, showContextMenu, showInputDialog, showToast } from './utils.js';
import { t } from './i18n.js';

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
/** "New persistent profile from this session's current browser" has TWO honest
 *  spellings (§3.2.5): under the per-session-directory rung (C) the login is
 *  KEPT (the directory is moved); on every other rung there is no directory to
 *  adopt, so the item says it creates an EMPTY profile and reopens the browser. */
export function adoptLabel(browserVariant) {
  return browserVariant === 'C'
    ? t('New persistent profile from this session’s browser…')
    : t('New empty persistent profile (reopens the browser)…');
}
/** Does the picker exist for this session row? Live, local, keyed, and the
 *  client holds a digest (the feature is on and the server answered). */
export function canPinBrowser(app, s) {
  return !!(app && app._browserProfiles && Array.isArray(app._browserProfiles.profiles) && s && s.status === 'live' && s.webuiId && !s.host);
}
/** The picker's rows, DOM-free: current pin ✓, "Unpinned", every profile, then
 *  the adopt item. `pinnedId` is the session row's `browserProfileId`. */
export function pickerItems({ profiles = [], pinnedId = null, browserVariant = null, chips = {}, onSwitch = null, onPin, onAdopt }) {
  const items = [];
  // the ticked row is where the pin already is: choosing it again changes nothing, so it asks the server nothing (lane J — it used to queue a "ephemeral → ephemeral" notice)
  items.push({ label: (pinnedId ? '  ' : '✓ ') + t('Unpinned (ephemeral)'), action: () => { if (pinnedId) onPin(null); } });
  // P6: a mediated (instance-shared) profile is attached through its scoped url, never pinned — a pin would hand the next launch its directory
  for (const p of profiles.filter((x) => !x.mediated)) {
    items.push({ label: (p.id === pinnedId ? '✓ ' : '  ') + p.label + (p.legacy ? ' ' + t('(legacy shared)') : '') + (chips && chips[p.id] ? ' · ' + chips[p.id] : ''), action: () => { if (p.id !== pinnedId) onPin(p.id); } });
  }
  // P4 (§7.4): the pinned profile's BACKEND CHIP as an item, opening the switcher (the second of the chip's two homes)
  if (pinnedId && typeof onSwitch === 'function') { items.push({ separator: true }); items.push({ label: t('Backend: {chip} — switch…', { chip: (chips && chips[pinnedId]) || '?' }), action: () => onSwitch(pinnedId) }); }
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
      try { this._browserProfilesHook?.(); } catch { }
      return this._browserProfiles;
    }).catch(() => this._browserProfiles);
  };
  App.prototype._onBrowserProfilesUpdated = function (msg) {
    if (!msg || !Array.isArray(msg.profiles)) return;
    const { type, ...digest } = msg;
    const prev = this._browserProfiles;
    this._browserProfiles = digest;
    try { this._browserProfilesHook?.(); } catch { }
    try { this.onBrowserDigestChanged?.(prev, digest); } catch (e) { console.warn('[browser] digest hook failed', e); } // P7 (§4.6): auto-bind on a NEW lease
  };
  /** `{value, label}` rows for a <select>: the first is "None (ephemeral)". */
  App.prototype.browserProfileOptions = function () {
    const list = this._browserProfiles?.profiles || [];
    return [{ value: '', label: t('None (ephemeral)') }, ...list.filter((p) => !p.mediated).map((p) => ({ value: p.id, label: p.label + (p.legacy ? ' ' + t('(legacy shared)') : '') }))];
  };
  /** ONE pin write for every surface; the answer says when it applies. */
  App.prototype.pinBrowserProfile = async function (s, profileId) {
    if (!s?.webuiId) return null;
    const r = await fetchJson('/api/browser/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.webuiId, profile: profileId || null }) });
    if (!r || r.error) { showToast(r?.error || t('server unreachable'), { type: 'error' }); return null; }
    showToast(r.pin ? t('Pinned to {name} — {when}', { name: r.pin.label, when: r.appliesFrom }) : t('Unpinned — ephemeral from the next launch'), { duration: 7000 });
    if (r.repoint && r.repoint.ok === false) showToast(r.repoint.why, { type: 'warn', duration: 9000 });
    return r;
  };
  App.prototype.adoptBrowserProfile = async function (s) {
    if (!s?.webuiId) return null;
    const label = await showInputDialog({ title: adoptLabel(s.browserVariant), label: t('Profile label'), placeholder: t('e.g. Work account') });
    if (!label) return null;
    const r = await fetchJson('/api/browser/adopt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.webuiId, label }) });
    if (!r || r.error) { showToast(r?.error || t('server unreachable'), { type: 'error' }); return null; }
    showToast(`${r.profile.label}: ${r.note}`, { duration: 12000 });
    return r;
  };
  /** The picker: a context menu at the pointer (the card's right-click) or an
   *  anchor (Session Properties / the live-view title). */
  App.prototype.showBrowserProfilePicker = function (s, { x = 0, y = 0 } = {}) {
    if (!canPinBrowser(this, s)) { showToast(t('Browser profiles are not available for this session'), { type: 'warn' }); return; }
    const items = pickerItems({
      profiles: this._browserProfiles.profiles, pinnedId: s.browserProfileId || null, browserVariant: s.browserVariant || null,
      chips: this._browserProfiles.chips || {},
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
    const show = !!(d && Array.isArray(d.profiles) && backend !== 'shell');
    row.style.display = show ? '' : 'none'; // no global .hidden in this repo — display is the honest switch
    if (!show) { sel.value = ''; sel.dataset.origin = ''; return; }
    sel.innerHTML = '';
    for (const o of this.browserProfileOptions()) { const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); }
    const byRef = (ref) => { const r = String(ref || '').trim(); if (!r) return ''; const hit = d.profiles.find((p) => p.id === r) || d.profiles.filter((p) => String(p.label || '').toLowerCase() === r.toLowerCase()); return Array.isArray(hit) ? (hit.length === 1 ? hit[0].id : '') : hit.id; };
    const group = taskId ? this.sidebar?._taskById?.(taskId) : null;
    let value = '', origin = '';
    if (group && group.browserProfileId && byRef(group.browserProfileId)) { value = byRef(group.browserProfileId); origin = 'task-group'; }
    else { const inst = byRef(this.settings?.get?.('browser.defaultProfile')); if (inst) { value = inst; origin = 'instance'; } }
    sel.value = value; sel.dataset.origin = origin;
    sel.onchange = () => { sel.dataset.origin = 'chosen'; };
  };
  /** Session Properties' explaining rows: the pin, its origin, how many
   *  sessions share it (from the digest's leases) — HTML-escaped. */
  App.prototype.browserPinSummaryHtml = function (s) {
    const d = this._browserProfiles;
    if (!d) return '';
    const p = s.browserProfileId ? (d.profiles || []).find((x) => x.id === s.browserProfileId) : null;
    const name = p ? p.label : (s.browserProfileId || t('ephemeral (no profile)'));
    const origin = pinOriginLabel(s.browserPinOrigin || 'harness');
    const attached = p ? (d.leases || []).filter((l) => l.profileId === p.id).length : 0;
    const chip = p && d.chips && d.chips[p.id] ? ` <span class="chat-status-dim browser-chip">${escHtml(d.chips[p.id])}</span>` : ''; // P4: the backend chip
    return `${escHtml(name)}${chip} <span class="chat-status-dim">${escHtml('(' + origin + ')')}</span>${p ? ` <span class="chat-status-dim">${escHtml('· ' + t('{n} session(s) attached', { n: attached }))}</span>` : ''}`;
  };
}
