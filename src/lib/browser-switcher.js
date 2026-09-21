// THE BACKEND SWITCHER, THE AGENT'S BLOCKED CLAIM AND PER-SITE MEMORY — the
// client half (agent browser P4 second half, docs/design-agent-browser-v2.md
// §7.4 UX / §7.5 the source chip / §7.6 rule 2 / D33). Nothing is decided
// here: the dialog draws `GET /api/browser/switcher` (the keeper's own view)
// and asks `POST /api/browser/switch`.
//
//   · the CHIP (`chromium 146` / `cloak 146 (free)`) rides the profile digest
//     (`app._browserProfiles.chips`) — the one thing a user wants to know at
//     the moment they are blocked — and this dialog is what opens behind it;
//   · every backend is a ROW, enabled or DISABLED WITH ITS REASON (no row is
//     hidden); a key-bearing row carries the SOURCE chip from the MASKED view
//     (`Your own key` / `Cluster default` / `Not configured`) and a
//     not-configured row's action is `app.openIntegration(id)` — "no key" is
//     said BEFORE the click, the typed `backend_no_key` refusal is the last net;
//   · SEATS IN THREE STATES (known-fresh / known-stale / unknown) are composed
//     HERE from the server's structure — the server sends `{state, total,
//     used, age}`, the device's own `t()` says the words (the channels r2 rule);
//   · the fingerprint sentence for the selected target comes from the FACT
//     (`fingerprintChange`: gains / loses / nothing);
//   · a downgrade the ladder cannot judge asks for ONE explicit confirmation;
//   · the agent's `blocked` CLAIMS for this profile say WHO claimed it (never
//     "we detected") with the one-click "Open with CloakBrowser" — that click
//     is the USER's act (it preselects the cloak row; the seats and the
//     fingerprint sentence are shown before anything moves) — and Dismiss;
//   · per-site memory: `{host, backend|tier, by, why}` rows, each deletable;
//     adding one is a USER claim (`by:'user'`).
// Multi-client: re-rendered from the `browser-profiles-updated` broadcast while
// open; the ws handler is removed BY NAME on close (channels r2 ⑤). XSS: every
// server string goes through textContent. Theme vars only, SVG/text only.
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

/** A short age for the seat line: `40 s` / `3 min` / `5 h` / `9 d`. */
export function ageText(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 90) return t('{n} s', { n: s });
  if (s < 5400) return t('{n} min', { n: Math.round(s / 60) });
  if (s < 172800) return t('{n} h', { n: Math.round(s / 3600) });
  return t('{n} d', { n: Math.round(s / 86400) });
}
/** The SOURCE chip's words — the Integrations card's three, from the MASKED view (never a value). */
export function sourceChipText(source, clusterLabel = null) {
  if (source === 'user') return t('Your own key');
  if (source === 'cluster') return clusterLabel ? t('Cluster default · {label} (seats shared with other users)', { label: clusterLabel }) : t('Cluster default (seats shared with other users)');
  return t('Not configured');
}
function sourceChipEl(row) {
  const chip = el('span', 'integ-chip ' + (row.source === 'user' ? 'integ-chip-user' : row.source === 'cluster' ? 'integ-chip-cluster' : 'integ-chip-none'), sourceChipText(row.source, row.clusterLabel || null));
  return chip;
}
/** The seat line in its THREE states (§7.4's table), from the server's structure — an unknown total is never a number. */
export function seatLine(seats, used = null) {
  if (!seats) return '';
  const u = Number.isFinite(used) ? used : null;
  const onInstance = u == null ? '' : ' · ' + t('{used} used on this instance', { used: u });
  if (seats.state === 'known-fresh') return t('{used} used / {total} seats · {after} after this switch (tier read from a launch {age} ago)', { used: u == null ? '?' : u, total: seats.total, after: (u || 0) + 1, age: ageText(seats.age) });
  if (seats.state === 'known-stale') return t('seat limit unknown — the last reading ({n} seats, {age} ago) no longer constrains; it is re-read at the next launch', { n: seats.lastTotal, age: ageText(seats.age) }) + onInstance;
  return t('seat limit unknown — it becomes known the first time this key launches a browser') + onInstance;
}
/** The dialog's one honest sentence about the fingerprint, from the FACT. */
export function fingerprintSentence(change) {
  if (change === 'gains') return t('This profile had no stable fingerprint before: after the switch, sites may ask you to log in again. Cookies cross untouched — a site that binds its session to the fingerprint sees a new device.');
  if (change === 'loses') return t('This profile leaves its stable fingerprint behind: sites that bound your login to it will see a new device and may ask you to log in again. Cookies cross untouched.');
  return '';
}
/** WHO claimed it, never "we detected". */
export function blockedSentence(b) {
  let s = t('The agent says this page is blocked: {host}', { host: String(b.host || '') });
  if (b.why) s += ` (${String(b.why)})`;
  s += ' — ' + t('it suggests tier {tier}', { tier: b.tier });
  if (b.evidence) s += ` · ${String(b.evidence)}`;
  return s;
}
/** A site hint's one line: host → what it needs, by whom. */
export function siteHintSentence(h) {
  const need = h.backend ? String(h.backend) : t('tier {tier}', { tier: h.tier });
  const who = h.by === 'user' ? t('by you') : t('by the agent');
  return `${String(h.host || '')} → ${need} (${who}${h.why ? ': ' + String(h.why) : ''})`;
}

/** A user-action call: fetchJson never throws, so the `{error}` body IS the failure and must reach the user. */
async function call(url, init, what) {
  const r = await fetchJson(url, init);
  if (!r || r.error) { showToast(t('{what} — {reason}', { what, reason: (r && r.error) || t('server unreachable') }), { type: 'error', duration: 9000 }); return null; }
  return r;
}

/** Open the switcher for ONE profile. `preselect` names a backend row to select (the blocked banner's one click = 'cloak'). */
export function openBrowserSwitcher(app, { profileId, sessionId = null, preselect = null } = {}) {
  if (!profileId) { showToast(t('This browser has no profile — a backend is a property of a profile'), { type: 'warn' }); return null; }
  const st = { view: null, selected: preselect || null, confirm: false, makeDefault: false, busy: false, closed: false };
  const shell = createModalShell({ id: 'browser-switcher-dialog', title: t('Browser backend'), dialogClass: 'browser-switcher', minWidth: '420px', escapeToClose: true, onClose: () => { st.closed = true; off?.(); } });
  const { body, close } = shell;
  const off = app.ws?.onGlobal?.((m) => { if (m && m.type === 'browser-profiles-updated' && !st.closed && !st.busy) refresh(); });

  async function refresh() {
    const v = await fetchJson(`/api/browser/switcher?profile=${encodeURIComponent(profileId)}`);
    if (st.closed) return;
    if (!v || v.error) { body.replaceChildren(el('div', 'browser-switcher-error', (v && v.error) || t('server unreachable'))); return; }
    st.view = v;
    render();
  }
  function selectedRow() { return (st.view?.rows || []).find((r) => r.id === st.selected) || null; }
  function render() {
    const v = st.view;
    body.replaceChildren();
    // ── head: the profile and its chip ──
    const head = el('div', 'browser-switcher-head');
    head.append(el('span', 'browser-switcher-label', String(v.profile?.label || profileId)), el('span', 'browser-switcher-chip', String(v.chip || '')));
    if (v.switching) head.appendChild(el('span', 'chat-status-dim', t('switching…')));
    body.appendChild(head);
    // ── the agent's blocked claims (who said it) ──
    const claims = Array.isArray(v.blocked) ? v.blocked : [];
    if (claims.length) {
      const sec = el('div', 'browser-switcher-blocked');
      for (const b of claims) {
        const row = el('div', 'browser-switcher-blocked-row');
        row.appendChild(el('span', 'browser-switcher-blocked-text', blockedSentence(b)));
        const cloak = (v.rows || []).find((r) => r.id === 'cloak');
        const open = el('button', 'file-tool-btn', t('Open with CloakBrowser'));
        open.disabled = !(cloak && cloak.enabled);
        open.title = cloak && !cloak.enabled ? String(cloak.reason || '') : t('Select the cloak backend below (the switch is your act)');
        open.onclick = () => { st.selected = 'cloak'; render(); };
        const dismiss = el('button', 'file-tool-btn', t('Dismiss'));
        dismiss.onclick = async () => { const r = await call(`/api/browser/blocked/${encodeURIComponent(b.id)}`, { method: 'DELETE' }, t('Dismiss')); if (r) refresh(); };
        row.append(open, dismiss);
        sec.appendChild(row);
      }
      body.appendChild(sec);
    }
    // ── every backend as a row, enabled or disabled WITH its reason ──
    const list = el('div', 'browser-switcher-rows');
    for (const r of v.rows || []) {
      const lab = el('label', 'dialog-check-row browser-switcher-row' + (r.enabled ? '' : ' disabled') + (r.current ? ' current' : ''));
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'browser-switcher-backend'; input.value = r.id;
      input.disabled = !r.enabled || !!r.current; input.checked = st.selected === r.id;
      input.onchange = () => { if (input.checked) { st.selected = r.id; st.confirm = false; render(); } };
      const box = el('div', 'browser-switcher-rowbody');
      const line1 = el('div', 'browser-switcher-line');
      line1.append(el('span', 'browser-switcher-rowlabel', String(r.label || r.id)), el('span', 'browser-switcher-chip', String(r.chip || '')), el('span', 'chat-status-dim', t('tier {tier}', { tier: r.tier })));
      if (r.current) line1.appendChild(el('span', 'integ-chip', t('current')));
      if (r.integrationId) line1.appendChild(sourceChipEl(r));
      box.appendChild(line1);
      if (r.integrationId) { const used = v.seats && v.seats[r.integrationId] ? v.seats[r.integrationId].used : null; box.appendChild(el('div', 'chat-status-dim browser-switcher-seats', seatLine(r.seats, used))); }
      if (!r.enabled && !r.current) box.appendChild(el('div', 'browser-switcher-reason', String(r.reason || '')));
      if (r.action && r.action.openIntegration) {
        const b = el('button', 'file-tool-btn browser-switcher-integ', t('Open Integrations'));
        b.title = t('⚙ → Integrations & keys — paste your own key, or pick the cluster default');
        b.onclick = (e) => { e.preventDefault(); app.openIntegration?.(r.action.openIntegration); };
        box.appendChild(b);
      }
      // §7.4 failure form (1): the binary is not installed ⇒ the INSTALL control, disabled WITH the
      // verdict's reason ("measure first, then install"); enabled only when the server's verdict is ok.
      if (r.id === 'cloak' && !r.enabled && !r.current && r.code === 'backend_unavailable' && v.install && typeof v.install.ok === 'boolean') {
        const iv = v.install;
        const running = !!(iv.state && iv.state.running);
        const b = el('button', 'file-tool-btn browser-switcher-install', running ? t('Installing CloakBrowser…') : t('Install CloakBrowser…'));
        b.disabled = !iv.ok || running;
        b.title = iv.ok ? t('npm install {spec} into the VibeSpace data directory — a user act, after the §7.2.1 egress measurement', { spec: String(iv.spec || '') }) : String(iv.error || '');
        b.onclick = async (e) => {
          e.preventDefault();
          const r2 = await call('/api/browser/install', { method: 'POST' }, t('Install CloakBrowser…'));
          if (r2) { showToast(t('Installing {spec} — the row updates when it finishes', { spec: String(r2.spec || '') })); refresh(); }
        };
        box.appendChild(b);
        if (!iv.ok && !running) box.appendChild(el('div', 'chat-status-dim browser-switcher-reason', String(iv.error || '')));
      }
      lab.append(input, box);
      list.appendChild(lab);
    }
    body.appendChild(list);
    // ── what the selected switch means ──
    const sel = selectedRow();
    if (sel && sel.enabled) {
      const fp = fingerprintSentence(sel.fingerprintChange);
      if (fp) body.appendChild(el('div', 'browser-switcher-note', fp));
      if (sel.needsConfirm) {
        const c = el('label', 'dialog-check-row');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = st.confirm; cb.onchange = () => { st.confirm = cb.checked; };
        c.append(cb, el('span', null, t('Switch anyway — nothing recorded which Chromium version wrote this directory; Chromium refuses a downgrade one-way')));
        body.appendChild(c);
      }
      const d = el('label', 'dialog-check-row');
      const dcb = document.createElement('input'); dcb.type = 'checkbox'; dcb.checked = st.makeDefault; dcb.onchange = () => { st.makeDefault = dcb.checked; };
      d.append(dcb, el('span', null, t('Make this the profile’s default backend')));
      body.appendChild(d);
    }
    body.appendChild(el('div', 'chat-status-dim browser-switcher-note', t('A switch stops this profile’s browser and restarts it on the new backend; every attached session’s tab is re-opened at its last URL and its lease survives. While somebody drives this browser, a switch becomes a proposal.')));
    // ── actions ──
    const actions = el('div', 'dialog-actions');
    const cancel = el('button', 'file-tool-btn', t('Cancel')); cancel.onclick = close;
    const go = el('button', 'file-tool-btn browser-switcher-go', t('Switch'));
    go.disabled = !(sel && sel.enabled) || st.busy || !!v.switching || (sel && sel.needsConfirm && !st.confirm);
    go.onclick = () => doSwitch(sel);
    actions.append(cancel, go);
    body.appendChild(actions);
    // ── per-site memory ──
    const hints = Array.isArray(v.siteHints) ? v.siteHints : [];
    const hs = el('div', 'browser-switcher-hints');
    hs.appendChild(el('div', 'browser-switcher-subhead', t('Per-site memory (claims, never an automatic switch)')));
    for (const h of hints) {
      const row = el('div', 'browser-switcher-hint');
      row.appendChild(el('span', null, siteHintSentence(h)));
      const del = el('button', 'file-tool-btn', t('Remove'));
      del.onclick = async () => { const r = await call(`/api/browser/site-hints/${encodeURIComponent(h.host)}`, { method: 'DELETE' }, t('Remove')); if (r) refresh(); };
      row.appendChild(del);
      hs.appendChild(row);
    }
    const add = el('div', 'browser-switcher-hint-add');
    const host = document.createElement('input'); host.placeholder = t('exact host, e.g. portal.example'); host.className = 'browser-switcher-host';
    const need = document.createElement('select');
    for (const r of v.rows || []) { const o = document.createElement('option'); o.value = 'b:' + r.id; o.textContent = String(r.id); need.appendChild(o); }
    for (const tier of [2, 3]) { const o = document.createElement('option'); o.value = 't:' + tier; o.textContent = t('tier {tier}', { tier }); need.appendChild(o); }
    const why = document.createElement('input'); why.placeholder = t('why (optional)');
    const addBtn = el('button', 'file-tool-btn', t('Remember'));
    addBtn.onclick = async () => {
      const h = host.value.trim(); if (!h) { showToast(t('A site hint names an exact host'), { type: 'warn' }); return; }
      const [kind, val] = need.value.split(':');
      const r = await call('/api/browser/site-hints', json('POST', { site: h, ...(kind === 'b' ? { backend: val } : { tier: Number(val) }), why: why.value.trim() }), t('Remember')); // `site`: `host` names a MACHINE on every browser route
      if (r) { host.value = ''; why.value = ''; refresh(); }
    };
    add.append(host, need, why, addBtn);
    hs.appendChild(add);
    body.appendChild(hs);
  }
  async function doSwitch(row) {
    if (!row || st.busy) return;
    st.busy = true; render();
    const r = await fetchJson('/api/browser/switch', json('POST', { profile: profileId, provider: row.id, sessionId: sessionId || undefined, confirmDowngrade: st.confirm, makeDefault: st.makeDefault }));
    st.busy = false;
    if (st.closed) return;
    if (!r || r.error) {
      showToast(t('Switch refused — {reason}', { reason: (r && r.error) || t('server unreachable') }), { type: 'error', duration: 12000 });
      if (r && r.action && r.action.openIntegration) app.openIntegration?.(r.action.openIntegration);
      refresh();
      return;
    }
    if (r.mode === 'proposal') {
      showToast(t('Not switched: {reason}. {filed}', { reason: String(r.reason || ''), filed: r.filed ? t('A proposal was filed to the inbox.') : t('Nobody was filed to — nothing happened.') }), { type: 'warn', duration: 12000 });
      refresh();
      return;
    }
    const n = Array.isArray(r.reopened) ? r.reopened.length : 0;
    const bad = Array.isArray(r.reopened) ? r.reopened.filter((x) => !x.ok).length : 0;
    showToast(t('Switched {label} from {from} to {to} — {n} tab(s) re-opened at their last URL', { label: String(r.profile?.label || profileId), from: String(r.from || ''), to: String(r.to || ''), n }) + (bad ? ' · ' + t('{n} could not be re-opened', { n: bad }) : ''), { duration: 9000 });
    const fp = fingerprintSentence(r.fingerprintChange);
    if (fp) showToast(fp, { type: 'warn', duration: 12000 });
    st.selected = null; st.confirm = false;
    refresh();
  }
  body.appendChild(el('div', 'chat-status-dim', t('Loading…')));
  refresh();
  return { ...shell, refresh, state: () => ({ ...st }) };
}

export function installBrowserSwitcher(App) {
  /** THE switcher, one per profile: `{profileId, sessionId?, preselect?}`. */
  App.prototype.openBrowserSwitcher = function (opts) { return openBrowserSwitcher(this, opts || {}); };
  /** The chip for a profile from the digest (`chips` rides `browser-profiles-updated`); null when unknown. */
  App.prototype.browserChipFor = function (profileId) { const d = this._browserProfiles; return d && d.chips && profileId ? (d.chips[profileId] || null) : null; };
  /** The agent's blocked claims about a profile or a session, from the digest. */
  App.prototype.browserBlockedFor = function ({ profileId = null, sessionId = null } = {}) {
    const d = this._browserProfiles;
    if (!d || !Array.isArray(d.blocked)) return [];
    return d.blocked.filter((b) => (profileId && b.profileId === profileId) || (sessionId && b.sessionId === sessionId));
  };
}
