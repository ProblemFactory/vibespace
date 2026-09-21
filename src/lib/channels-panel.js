// THE CHANNELS PANEL (docs/design-communication-panel.zh.md §10).
//
// The sidebar rail's `channels` panel: adapters, their conversations, and on
// EVERY ROW A FRESHNESS CHIP. That chip is not decoration — it is this
// feature's honesty contract. A row says how long ago its evidence was
// gathered ("live" / "within 30s" / "scanned 4m ago"), because that is the one
// number a user needs before handing something to a lane. The CLAIM comes
// from the server's `freshnessClaim`, which resolves from the lane ACTUALLY
// carrying the row (`laneState` / `scanState`) — never from the adapter's
// static declaration, so a demoted or dead push lane draws the poll cadence it
// is really on (the `opencode-events` round-4 lesson: a lane that lies about
// being active is worse than no lane, because it turns the fallback off) — and
// the SENTENCE is composed here, in the language of the device reading it.
//
// XSS LAW: every string here is vendor- or peer-controlled and syncs to every
// client, so EVERYTHING renders through textContent. No innerHTML on any path.
//
// THE MENU AND THE GEAR ROW ARE CONTRIBUTIONS (src/lib/contributions.js), the
// same shape core's session-card / window / gear menus use — registered by the
// module that OWNS the feature, so gear-menu.js stays byte-identical to its
// pinned legacy row list.
import { fetchJson, showContextMenu, showToast, createModalShell, showConfirmDialog } from './utils.js';
import { t } from './i18n.js';
import { registerMenuItem, menuItems } from './contributions.js';
import { registerWindowType } from './window-types.js';
// PURE, bundled directly (the task-color-seq / quota-model pattern). THE
// SENTENCE IS COMPOSED HERE (r2): `freshnessClaim` used to build it server
// side with no translator, so the chip this feature calls its honesty
// contract shipped ENGLISH-ONLY to a zh/ja UI — and the server cannot fix
// that, because the digest is broadcast to every client at once while the
// language is per DEVICE (localStorage).
import * as chanCaps from '../channel-caps.js';
// P2: the Assign & filter editor and the one-line summary a row draws.
import { showAssignFilterDialog, assignmentSummary } from './channel-filter-editor.js';
// P3: the reach/policy dialog (row menu) and the Outbox window (header button).
import { showReachDialog } from './channel-reach-editor.js';
import './channel-outbox.js';

const CHIP_CLASS = { live: 'chan-chip-live', within: 'chan-chip-within', scanned: 'chan-chip-scan' };

/** A short, honest freshness chip. The server sends `{kind, state, seconds}`
 *  and `freshnessText` turns it into words: a claim whose `state` we do not
 *  recognise says `unknown` rather than inventing a number. */
function chip(freshness) {
  const el = document.createElement('span');
  el.className = 'chan-chip ' + (CHIP_CLASS[freshness && freshness.kind] || 'chan-chip-within');
  el.textContent = chanCaps.freshnessText(freshness, { t }) || t('unknown');
  el.title = t('How fresh this row is — the lane actually carrying it, not the one the adapter declares.');
  return el;
}

function laneNote(lane) {
  if (!lane) return '';
  if (lane.via === 'scan') return lane.source ? `${t('scan')} · ${lane.source}` : `${t('scan')} · ${lane.why || t('no source')}`;
  if (lane.via === 'push') return t('push');
  return t('poll');
}

async function api(pathname, init) {
  const r = await fetchJson(pathname, init);
  if (r && r.error) { showToast(r.error, { type: 'error' }); return null; }
  return r;
}

function rowMenuCtx(app, conv) { return { app, conv }; }

// ── P1a: the adapter's own controls (design §10.1, §13, §14.5) ────────────
// Connect / re-authorize / paste-back / tracked picker / options. Every
// control reads a FACT the digest carries (`available[]`, `adapter.auth`,
// `adapter.credential`, `adapter.flow`, `adapter.optionsSchema`) — nothing
// here branches on an adapter's kind (the contract suite's census), and
// every string a vendor or a peer could influence goes through textContent.

const JSON_HDR = { 'Content-Type': 'application/json' };
const post = (url, body) => api(url, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body || {}) });
const put = (url, body) => api(url, { method: 'PUT', headers: JSON_HDR, body: JSON.stringify(body || {}) });

/** A compact "re-authorize in …" countdown; the CLOCK is an argument. */
export function reauthEta(expiresAt, now = Date.now()) {
  const ms = Number(expiresAt) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return t('expired');
  if (ms < 2 * 3600e3) return t('{n}m', { n: Math.max(1, Math.round(ms / 60e3)) });
  if (ms < 72 * 3600e3) return t('{n}h', { n: Math.round(ms / 3600e3) });
  return t('{n}d', { n: Math.round(ms / 86400e3) });
}

function btn(label, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chan-btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  b.onclick = (ev) => { ev.stopPropagation(); onClick(ev); };
  return b;
}
function chanLine(cls, text) { const el = document.createElement('div'); el.className = cls; el.textContent = text; return el; }

/** THE CONNECT WIZARD'S THREE COPY PATHS (§10.1): the credential facts decide
 *  what the button SAYS and what it DOES. `none` opens the Integrations card
 *  first — sending the user into a consent page that will fail is the
 *  failure the design names; `cluster` says so beside the button; `user`
 *  says nothing more. */
function connectRow(app, av) {
  const row = document.createElement('div');
  row.className = 'chan-connect-row';
  const cred = av.credential || { source: 'unknown' };
  const name = document.createElement('b');
  name.textContent = av.label || av.kind;
  row.appendChild(name);
  if (cred.source === 'none') {
    row.appendChild(chanLine('chan-connect-note chan-warn', t('Not configured — set up the application credential first')));
    row.appendChild(btn(t('Set up {label} credentials…', { label: av.label || av.kind }), () => app.openIntegration(av.integration)));
  } else {
    if (cred.source === 'cluster') row.appendChild(chanLine('chan-connect-note', cred.clusterLabel ? t('Provided by the cluster · {label}', { label: cred.clusterLabel }) : t('Provided by the cluster')));
    else if (cred.source === 'unknown') row.appendChild(chanLine('chan-connect-note', cred.why || t('credential state unknown')));
    row.appendChild(btn(t('Connect {label}', { label: av.label || av.kind }), () => startConnect(app, av.kind, av.integration, av.label || av.kind)));
  }
  return row;
}

async function startConnect(app, kind, integration, label) {
  const r = await fetchJson(`/api/channels/adapters/${encodeURIComponent(kind)}/connect`, { method: 'POST', headers: JSON_HDR, body: '{}' });
  if (!r) { showToast(t('Could not reach the server'), { type: 'error' }); return; }
  if (r.error) {
    // A missing application credential is not a failed consent — it is the
    // card the user has not filled in yet (§10.1): open it, and say why.
    if (r.code === 'needs-credentials') { showToast(r.error, { type: 'error' }); app.openIntegration(integration); return; }
    showToast(r.error, { type: 'error' });
    return;
  }
  showFlowDialog(app, r.adapter && r.adapter.id ? r.adapter.id : kind, label, r.flow);
}

/** The running consent flow: the consent page as a LINK the user opens (a
 *  window opened after an await is popup-blocked; a click on a link is not),
 *  the named port-busy refusal when there is one, and PASTE-BACK — the path a
 *  remote browser takes anyway (§12.4). The dialog follows the adapter's
 *  broadcast: a finished flow closes it and says so. */
function showFlowDialog(app, adapterId, label, flow) {
  const { body, close } = createModalShell({ id: 'chan-flow-dialog', title: t('Connect {label}', { label }), dialogClass: 'chan-flow', escapeToClose: true });
  const intro = chanLine('chan-flow-intro', t('Open the consent page in your browser and approve the access. When it lands on a page this VibeSpace cannot see, paste that page\'s URL back here.'));
  body.appendChild(intro);
  if (flow && flow.consentUrl) {
    const a = document.createElement('a');
    a.className = 'chan-btn chan-btn-primary';
    a.href = flow.consentUrl; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = t('Open the consent page');
    body.appendChild(a);
  }
  if (flow && flow.refusal) {
    body.appendChild(chanLine('chan-flow-refusal chan-warn', flow.refusal.code === 'port-busy'
      ? t('Another VibeSpace or tool holds port {port} — finish or cancel it there, or paste the redirect URL back here.', { port: flow.port })
      : (flow.refusal.message || flow.refusal.code || t('refused'))));
  } else if (flow && flow.listening) {
    body.appendChild(chanLine('chan-flow-note', t('Waiting for the vendor to redirect back to port {port}…', { port: flow.port })));
  }
  const pasteLabel = chanLine('chan-flow-label', t('Paste the URL your browser landed on'));
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'chan-flow-input'; input.placeholder = 'http://127.0.0.1:…/?code=…&state=…';
  input.spellcheck = false;
  const actions = document.createElement('div');
  actions.className = 'chan-flow-actions';
  const status = chanLine('chan-flow-status', '');
  const finish = btn(t('Finish'), async () => {
    const url = input.value.trim();
    if (!url) { status.textContent = t('Paste the URL first.'); return; }
    finish.disabled = true;
    const r = await fetchJson(`/api/channels/adapters/${encodeURIComponent(adapterId)}/auth/finish`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ url }) });
    finish.disabled = false;
    if (!r || r.error) { status.textContent = t('The consent flow ended: {error}', { error: (r && r.error) || t('no answer') }); return; }
    status.textContent = t('Connected.');
    setTimeout(() => { off(); close(); }, 600);
  }, 'chan-btn-primary');
  const cancel = btn(t('Cancel'), async () => { off(); await post(`/api/channels/adapters/${encodeURIComponent(adapterId)}/auth/cancel`, {}); close(); });
  actions.append(finish, cancel);
  body.append(pasteLabel, input, actions, status);
  // The loopback path needs no paste: the adapter's broadcast says the flow is done.
  const onBroadcast = (msg) => {
    if (msg.type !== 'channels-updated' || !msg.digest) return;
    const a = (msg.digest.adapters || []).find((x) => x.id === adapterId);
    if (!a) return;
    if (a.flow && a.flow.done && a.flow.ok) { status.textContent = t('Connected.'); setTimeout(() => { off(); close(); }, 600); }
    else if (a.flow && a.flow.done && a.flow.error) status.textContent = t('The consent flow ended: {error}', { error: a.flow.error });
    else if (!a.flow && a.lastAuthError) status.textContent = t('The consent flow ended: {error}', { error: a.lastAuthError });
    else if (!a.flow && a.auth && a.auth.state === 'connected') { status.textContent = t('Connected.'); setTimeout(() => { off(); close(); }, 600); }
  };
  const off = () => { try { app.ws.offGlobal(onBroadcast); } catch {} };
  app.ws.onGlobal(onBroadcast);
  setTimeout(() => input.focus({ preventScroll: true }), 0);
}

/** THE TRACKED PICKER: tracked is OPT-IN (§5 invariant 6) — nothing is fetched
 *  for a conversation until the user ticks it here or in the row menu. */
function showTrackPicker(app, a, convs) {
  const { body } = createModalShell({ id: 'chan-track-dialog', title: t('Track conversations — {label}', { label: a.label || a.id }), dialogClass: 'chan-track', escapeToClose: true });
  body.appendChild(chanLine('chan-flow-note', t('Nothing is fetched for a conversation until you track it.')));
  const list = document.createElement('div');
  list.className = 'chan-track-list';
  if (!convs.length) list.appendChild(chanLine('chan-empty', t('No conversations discovered yet.')));
  for (const c of convs) {
    const lab = document.createElement('label');
    lab.className = 'chan-track-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!c.tracked;
    cb.onchange = async () => {
      cb.disabled = true;
      const r = await post(`/api/channels/${encodeURIComponent(c.adapterId)}/${encodeURIComponent(c.id)}/track`, { tracked: cb.checked });
      cb.disabled = false;
      if (!r) cb.checked = !cb.checked;   // refused: the toast said why, the box says the truth
    };
    const title = document.createElement('span');
    title.className = 'chan-track-title';
    title.textContent = c.title || c.id;
    const sub = document.createElement('span');
    sub.className = 'chan-track-sub';
    sub.textContent = c.participants || '';
    lab.append(cb, title, sub);
    list.appendChild(lab);
  }
  body.appendChild(list);
}

/** THE OPTIONS EDITOR: the adapter's DECLARED options only (a select for a
 *  `choices` option, a text input otherwise); `''` restores the default. */
function showOptionsDialog(app, a) {
  const { body, close } = createModalShell({ id: 'chan-options-dialog', title: t('Options — {label}', { label: a.label || a.id }), dialogClass: 'chan-options', escapeToClose: true });
  const fields = [];
  for (const o of a.optionsSchema || []) {
    const wrap = document.createElement('div');
    wrap.className = 'chan-opt';
    const lab = chanLine('chan-opt-label', o.label || o.key);
    let input;
    if (Array.isArray(o.choices) && o.choices.length) {
      input = document.createElement('select');
      for (const ch of o.choices) { const opt = document.createElement('option'); opt.value = ch; opt.textContent = ch; input.appendChild(opt); }
      input.value = (a.options && a.options[o.key]) || o.default || o.choices[0];
    } else {
      input = document.createElement('input');
      input.type = 'text'; input.placeholder = o.placeholder || o.default || '';
      input.value = (a.options && a.options[o.key] !== undefined) ? String(a.options[o.key]) : String(o.default || '');
      input.spellcheck = false;
    }
    input.className = 'chan-opt-input';
    wrap.append(lab, input);
    if (o.help) wrap.appendChild(chanLine('chan-opt-help', o.help));
    body.appendChild(wrap);
    fields.push([o.key, input]);
  }
  const actions = document.createElement('div');
  actions.className = 'chan-flow-actions';
  const status = chanLine('chan-flow-status', '');
  const save = btn(t('Save'), async () => {
    const options = {};
    for (const [k, input] of fields) options[k] = input.value;
    save.disabled = true;
    const r = await put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { options });
    save.disabled = false;
    if (!r) return;
    status.textContent = t('Saved.');
    setTimeout(close, 400);
  }, 'chan-btn-primary');
  actions.append(save, btn(t('Cancel'), close));
  body.append(actions, status);
}

/** THE PUSH DIALOG (P1b, design §6.4 / decision 18): the exclusivity
 *  DECLARATION — a per-deployment fact the operator asserts, the product
 *  measures and withdraws — and, on an opt-in lane (Gmail's Pub/Sub pull,
 *  decision 20), the switch itself. Saving a claim is a RE-DECLARATION: it
 *  clears a demotion's counters and retries the lane once, so the claim is
 *  sent only when it changed or the lane is demoted. */
function showPushDialog(app, a) {
  const p = a.push || {};
  const { body, close } = createModalShell({ id: 'chan-push-dialog', title: t('Push lane — {label}', { label: a.label || a.id }), dialogClass: 'chan-options', escapeToClose: true });
  body.appendChild(chanLine('chan-flow-note', chanCaps.pushLaneText(p, a.lane, { t, now: Date.now() })));
  if (p.demotedAt) body.appendChild(chanLine('chan-flow-note chan-warn', t('The claim was withdrawn by measurement. Re-declaring it clears the counters and retries the lane once.')));
  let enabledBox = null;
  if (p.optIn) {
    const lab = document.createElement('label');
    lab.className = 'chan-track-item';
    enabledBox = document.createElement('input');
    enabledBox.type = 'checkbox'; enabledBox.checked = !!p.enabled;
    const txt = document.createElement('span');
    txt.className = 'chan-track-title';
    txt.textContent = t('Push enabled (off by default — needs the Pub/Sub topic + subscription options and a re-authorize)');
    lab.append(enabledBox, txt);
    body.appendChild(lab);
  }
  const wrap = document.createElement('div');
  wrap.className = 'chan-opt';
  wrap.appendChild(chanLine('chan-opt-label', t('Exclusivity declaration')));
  const sel = document.createElement('select');
  sel.className = 'chan-opt-input';
  for (const [v, label] of [
    ['unknown', t('unknown — declare nothing: push only kicks the cursor (default)')],
    ['shared', t('shared — other clients use this app: push only kicks the cursor')],
    ['exclusive', t('exclusive — this instance is the only client: push carries messages, the poll reconciles every 15 min')],
  ]) { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); }
  const current = chanCaps.PUSH_CLAIMS.includes(p.claimedExclusive) ? p.claimedExclusive : 'unknown';
  sel.value = current;
  wrap.appendChild(sel);
  wrap.appendChild(chanLine('chan-opt-help', t('The platform does not say how many clients share the app, so exclusivity is asserted here and MEASURED by the product: records the reconciliation poll sees before push do not happen on an exclusive lane. Past 2% over 20 records the lane demotes itself to cursor kicks and says so.')));
  body.appendChild(wrap);
  const actions = document.createElement('div');
  actions.className = 'chan-flow-actions';
  const status = chanLine('chan-flow-status', '');
  const save = btn(t('Save'), async () => {
    const push = {};
    if (enabledBox) push.enabled = enabledBox.checked;
    if (sel.value !== current || p.demotedAt) push.claimedExclusive = sel.value;
    save.disabled = true;
    const r = await put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { push });
    save.disabled = false;
    if (!r) return;
    status.textContent = t('Saved.');
    setTimeout(close, 400);
  }, 'chan-btn-primary');
  actions.append(save, btn(t('Cancel'), close));
  body.append(actions, status);
}

/** The adapter's status line + action row — the honest four-valued auth
 *  (§13) with its countdown, the spoken last connect failure, the filed
 *  failure item, and the verbs that exist for THIS row. */
function adapterControls(app, a, convs) {
  const box = document.createElement('div');
  box.className = 'chan-adapter-ctl';
  const auth = a.auth || { state: 'unknown' };
  const st = chanLine('chan-auth', '');
  const actions = document.createElement('div');
  actions.className = 'chan-actions';
  const reconnect = () => startConnect(app, a.kind, a.integration, a.label || a.id);
  if (a.flow && a.flow.running) {
    st.textContent = t('Connecting…');
    actions.appendChild(btn(t('Resume the consent flow'), () => showFlowDialog(app, a.id, a.label || a.id, a.flow)));
    actions.appendChild(btn(t('Cancel'), () => post(`/api/channels/adapters/${encodeURIComponent(a.id)}/auth/cancel`, {})));
  } else if (auth.state === 'connected') {
    st.textContent = auth.user ? t('connected as {user}', { user: auth.user }) : t('connected');
    const eta = auth.expiresAt ? reauthEta(auth.expiresAt) : null;
    if (eta) { const c = document.createElement('span'); c.className = 'chan-eta'; c.textContent = t('re-authorize in {eta}', { eta }); c.title = new Date(auth.expiresAt).toLocaleString(); st.append(' · ', c); }
    if (a.connectable) actions.appendChild(btn(t('Re-authorize'), reconnect));
  } else if (auth.state === 'expired') {
    st.textContent = t('needs re-authorization ({why})', { why: auth.why || 'expired' });
    st.classList.add('chan-warn');
    if (a.connectable) actions.appendChild(btn(t('Re-authorize'), reconnect, 'chan-btn-primary'));
  } else if (auth.state === 'needs-credentials') {
    st.textContent = t('application credential missing ({why})', { why: auth.why || 'none' });
    st.classList.add('chan-warn');
    if (a.integration) actions.appendChild(btn(t('Open Integrations'), () => app.openIntegration(a.integration), 'chan-btn-primary'));
  } else {
    st.textContent = t('not connected');
    if (a.connectable) actions.appendChild(btn(t('Connect'), reconnect, 'chan-btn-primary'));
  }
  box.appendChild(st);
  if (a.lastAuthError) box.appendChild(chanLine('chan-auth-err chan-warn', t('Last connect failed: {error}', { error: a.lastAuthError })));
  if (a.consecutiveFailures >= 3 && a.lastPass && a.lastPass.error) {
    const f = chanLine('chan-auth-err chan-warn', a.lastPass.error);
    if (a.failureItem) f.textContent += ' — ' + t('a "For you" item was filed');
    box.appendChild(f);
  }
  // P1b: THE PUSH LANE'S SENTENCE + its verbs (§6.4) — gated on the digest's
  // `push` (the capability ROW's answer), never on a kind. When the product
  // has withdrawn the claim, the reason is drawn WITH its numbers and the
  // "re-declare to retry" entry beside it: a demotion is cleared by the party
  // that made the claim, never by the counters.
  if (a.push) {
    const line = chanLine('chan-push', chanCaps.pushLaneText(a.push, a.lane, { t, now: Date.now() }));
    if (a.push.demotedAt || a.push.state === 'unavailable') line.classList.add('chan-warn');
    box.appendChild(line);
    if (a.push.demotedAt) actions.appendChild(btn(t('Re-declare exclusive and retry'), () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { push: { claimedExclusive: 'exclusive' } }), 'chan-btn-primary'));
    actions.appendChild(btn(t('Push…'), () => showPushDialog(app, a)));
  }
  // P4: THE SENDER HONESTY SWITCH (§9.5) — per channel, OFF by default, drawn
  // only where the capability row allows sending (the digest hands `null`
  // for a read-only adapter); and the §21-item-3 PROOF line once a real send
  // has been observed — the measurement that settles an `unknown` marking.
  if (a.senderHonestyLine) {
    const h = a.senderHonestyLine;
    const label = t('Sender line: {v}', { v: h.effective ? t('on') : t('off') }) + (h.record === null ? ' ' + t('(instance default)') : '');
    const sw = btn(label, () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { senderHonestyLine: !h.effective }));
    sw.dataset.honestyLine = h.effective ? 'on' : 'off';
    sw.title = t('When on, a message an AGENT drafted goes out with one trailing line naming the agent. Your own drafts never get one. The approval card says who the recipient will see either way.');
    actions.appendChild(sw);
    if (h.record !== null) actions.appendChild(btn(t('Use instance default'), () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { senderHonestyLine: null })));
  }
  if (a.identityObserved) {
    const o = a.identityObserved;
    const line = chanLine('chan-identity-observed', t('Last real send was attributed by the platform to {who} ({when})', { who: o.senderType === 'user' ? t('the user') : t('an app / bot'), when: new Date(o.at).toLocaleString() }));
    if (o.declared === 'unknown') line.textContent += ' — ' + t('this channel\'s identity declaration is still unverified in code; this measurement is what settles it');
    box.appendChild(line);
  }
  actions.appendChild(btn(t('Track…'), () => showTrackPicker(app, a, convs)));
  if ((a.optionsSchema || []).length) actions.appendChild(btn(t('Options'), () => showOptionsDialog(app, a)));
  if (a.connectable && auth.state !== 'unknown') {
    actions.appendChild(btn(t('Disconnect'), async () => {
      const yes = await showConfirmDialog({ title: t('Disconnect'), message: t('Disconnect {label}? The token is dropped; conversations stay.', { label: a.label || a.id }), confirmText: t('Disconnect'), danger: true });
      if (yes) await post(`/api/channels/adapters/${encodeURIComponent(a.id)}/disconnect`, {});
    }));
  }
  actions.appendChild(btn(a.enabled === false ? t('Enable') : t('Disable'), () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { enabled: a.enabled === false })));
  box.appendChild(actions);
  return box;
}

/** The `channel-row` menu. P0a contributes only the verbs that DO something;
 *  assign / filter / reach belong to later phases and a menu row that opens
 *  nothing is the declared-but-inert slot this design argues against. */
export function registerChannelsMenus() {
  const M = 'channel-row';
  registerMenuItem({
    menu: M, group: '1_open', order: 10,
    label: () => t('Open'),
    run: (c) => c.app.openChannel(c.conv.adapterId, c.conv.id),
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 0, separator: true,
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 10,
    when: (c) => !c.conv.tracked,
    label: () => t('Track this conversation'),
    run: (c) => api(`/api/channels/${encodeURIComponent(c.conv.adapterId)}/${encodeURIComponent(c.conv.id)}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracked: true }) }),
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 20,
    when: (c) => !!c.conv.tracked,
    label: () => t('Stop tracking'),
    run: (c) => api(`/api/channels/${encodeURIComponent(c.conv.adapterId)}/${encodeURIComponent(c.conv.id)}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracked: false }) }),
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 30,
    when: (c) => !!c.conv.tracked && c.conv.unread > 0,
    label: () => t('Mark read'),
    run: (c) => api(`/api/channels/${encodeURIComponent(c.conv.adapterId)}/${encodeURIComponent(c.conv.id)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  });
  // P2: assign + filter (design §7). Only a TRACKED conversation can wake
  // anybody — nothing is fetched for an untracked one (§5 invariant 6).
  registerMenuItem({
    menu: M, group: '3_assign', order: 10, separator: true,
  });
  registerMenuItem({
    menu: M, group: '3_assign', order: 20,
    when: (c) => !!c.conv.tracked,
    label: (c) => (c.conv.assignment ? t('Assign & filter…') : t('Assign to an agent…')),
    run: (c) => showAssignFilterDialog(c.app, c.conv),
  });
  // P3: who may see this conversation (with each grant's origin) + its
  // sending policy — one dialog (design §8, §9.1).
  registerMenuItem({
    menu: M, group: '3_assign', order: 30,
    label: () => t('Reach & policy…'),
    run: (c) => showReachDialog(c.app, c.conv),
  });
}

/** The ⚙ gear row — registered HERE, by the module that owns the feature
 *  (gear-menu.js never learns its name); since 2.369.124 it files itself
 *  under the Communication ▸ head with `parent:'comm'` (the tree fixture in
 *  scripts/test-contributions.mjs reads this spec off the source). No `when`
 *  gate any more (2.369.125, docs/design-mobile-gaps.md #2): the row used to
 *  hide itself wherever the rail did not exist, which on a phone — where the
 *  rail is never built — meant the whole Communication panel had NO entry
 *  point. focusChannelsPanel carries jobs-panel's ladder: rail when it
 *  exists, a window otherwise. */
export function registerChannelsGearRow() {
  registerMenuItem({
    menu: 'gear', parent: 'comm', order: 10, // under Communication ▸ (gear-menu.js head 'comm'; this 10 · Outbox 20 · Integrations 30)
    icon: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
    label: () => t('Channels…'),
    run: (c) => c.app.openChannels(),
  });
}

/**
 * Render the rail panel into `c`. Renders ONCE per tab entry (the rail's
 * renders-once guard) and re-renders on the engine's `channels-updated`
 * broadcast, which carries the recomputed digest — so a repaint costs no
 * fetch (the cache-invalidation law: one dirty signal, one computation).
 */
export function renderChannelsPanel(app, c) {
  const head = document.createElement('div');
  head.className = 'chan-head';
  const summary = document.createElement('div');
  summary.className = 'chan-summary';
  head.appendChild(summary);
  // P3: the Outbox entry point, with the awaiting count from the digest.
  const outboxBtn = btn(t('Outbox'), () => app.openChannelOutbox(), 'chan-outbox-btn');
  outboxBtn.dataset.outboxButton = '1';
  head.appendChild(outboxBtn);
  const root = document.createElement('div');
  root.className = 'chan-list';
  c.append(head, root);

  function draw(d) {
    root.textContent = '';
    const adapters = (d && d.adapters) || [];
    const convs = (d && d.conversations) || [];
    const available = (d && d.available) || [];
    const tracked = convs.filter((x) => x.tracked).length;
    summary.textContent = adapters.length
      ? t('{a} adapters · {n} conversations · {k} tracked', { a: adapters.length, n: convs.length, k: tracked })
      : t('No channel adapters are connected.');
    const awaiting = Number(d && d.awaitingTotal) || 0;
    outboxBtn.textContent = awaiting ? t('Outbox ({n} awaiting)', { n: awaiting }) : t('Outbox');
    outboxBtn.classList.toggle('chan-btn-primary', awaiting > 0);
    if (!adapters.length && !available.length) {
      const e = document.createElement('div');
      e.className = 'chan-empty';
      e.textContent = t('Nothing is fetched until you connect an adapter and track a conversation.');
      root.appendChild(e);
      return;
    }
    for (const a of adapters) {
      const sec = document.createElement('div');
      sec.className = 'chan-sec';
      const h = document.createElement('div');
      h.className = 'chan-sec-head';
      const nm = document.createElement('b');
      nm.textContent = a.label || a.id;
      const st = document.createElement('span');
      st.className = 'chan-sec-state' + (a.consecutiveFailures >= 3 ? ' chan-warn' : '');
      // A disabled adapter SAYS so on its section (r3): its rows' chips say
      // "not polling" and this is the reason beside them.
      st.textContent = a.enabled === false ? t('disabled')
        : a.consecutiveFailures >= 3
          ? t('{n} failed passes ({code})', { n: a.consecutiveFailures, code: (a.lastPass && a.lastPass.code) || '?' })
          : laneNote(a.lane);
      h.append(nm, st);
      sec.appendChild(h);
      const mine = convs.filter((x) => x.adapterId === a.id);
      // P1a: the adapter's own status + verbs (connect / re-authorize /
      // track… / options / disconnect / enable) live on the section, above
      // its rows — every fact from the digest, no fetch on repaint.
      sec.appendChild(adapterControls(app, a, mine));
      if (!mine.length) {
        const e = document.createElement('div');
        e.className = 'chan-empty';
        e.textContent = t('No conversations discovered yet.');
        sec.appendChild(e);
      }
      for (const conv of mine) sec.appendChild(row(conv));
      root.appendChild(sec);
    }
    // The kinds a user may still CONNECT — one row each, worded by the
    // credential facts the digest carries (§10.1's three copy paths).
    if (available.length) {
      const blk = document.createElement('div');
      blk.className = 'chan-connect';
      blk.appendChild(chanLine('chan-sec-head', t('Connect')));
      for (const av of available) blk.appendChild(connectRow(app, av));
      root.appendChild(blk);
    }
  }

  function row(conv) {
    const el = document.createElement('div');
    el.className = 'chan-row' + (conv.tracked ? ' chan-tracked' : '');
    el.dataset.conv = `${conv.adapterId}/${conv.id}`;
    const line = document.createElement('div');
    line.className = 'chan-row-line';
    const title = document.createElement('span');
    title.className = 'chan-row-title';
    title.textContent = conv.title || conv.id;
    line.appendChild(title);
    if (conv.tracked && conv.unread) {
      const b = document.createElement('span');
      b.className = 'chan-unread';
      b.textContent = String(conv.unread);
      line.appendChild(b);
    }
    // P3: proposals awaiting approval on this row — the badge the pointer
    // degrades to when the inbox refuses the item (§9.2).
    if (conv.outbox && conv.outbox.awaiting) {
      const o = document.createElement('span');
      o.className = 'chan-awaiting';
      o.textContent = t('{n} to approve', { n: conv.outbox.awaiting });
      o.title = t('Proposals awaiting your approval — open the conversation or the Outbox.');
      line.appendChild(o);
    }
    line.appendChild(chip(conv.freshness));
    if (!conv.tracked) {
      const u = document.createElement('span');
      u.className = 'chan-untracked';
      u.textContent = t('not tracked');
      u.title = t('Nothing is fetched for this conversation until you track it.');
      line.appendChild(u);
    }
    el.appendChild(line);
    const sub = document.createElement('div');
    sub.className = 'chan-row-sub';
    sub.textContent = conv.participants || '';
    el.appendChild(sub);
    // P2: the assignment as it READS (authority clamped) + the measurement
    // beside it; a held/stashed last wake says so in amber.
    if (conv.assignment) {
      const asg = document.createElement('div');
      asg.className = 'chan-row-sub chan-row-assign' + (conv.stats && conv.stats.lastWake && conv.stats.lastWake.ok === false ? ' chan-warn' : '');
      asg.textContent = assignmentSummary(conv);
      asg.title = conv.stats && conv.stats.lastWake && conv.stats.lastWake.ok === false ? t('Last wake was held or stashed: {why}', { why: conv.stats.lastWake.why || '' }) : '';
      el.appendChild(asg);
    }
    el.onclick = () => app.openChannel(conv.adapterId, conv.id);
    el.oncontextmenu = (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, menuItems('channel-row', rowMenuCtx(app, conv)));
    };
    return el;
  }

  async function refresh() {
    const d = await fetchJson('/api/channels');
    if (!c.isConnected) return;
    if (d && d.error) { root.textContent = ''; const e = document.createElement('div'); e.className = 'chan-empty'; e.textContent = d.error; root.appendChild(e); return; }
    draw(d);
  }

  // THE HANDLER IS HELD IN A NAMED CONST AND REMOVED BY NAME (r2) — see the
  // same note in channel-window.js, including the measurement: the
  // load-bearing half is `onGlobal` returning its own unsubscribe, and this
  // form is the belt. `off?.()` on the result of `onGlobal` was a no-op while
  // that method returned undefined, so every rail repaint left another live
  // handler behind.
  const onBroadcast = (msg) => {
    if (msg.type !== 'channels-updated' || !c.isConnected) return;
    if (msg.digest) draw(msg.digest); else refresh().catch(() => {});
  };
  app.ws.onGlobal(onBroadcast);
  refresh().catch(() => {});
  return () => { try { app.ws.offGlobal(onBroadcast); } catch {} };
}

/** Focus the rail's Channels panel (the ⚙ row and any deep link) — or, where
 *  no rail exists (mobile, `sidebar.activityRail` off), the SAME panel in a
 *  window: openJobsWindow's ladder (2.357.0), mirrored (design-mobile-gaps #2).
 *  Returns the rail truthy / the window record, like app.openJobs. */
export function focusChannelsPanel(app, opts = {}) {
  const sb = app.sidebar;
  if (!opts.forceWindow && sb && sb._railEl && sb.listEl) {
    if (sb._activeTab !== 'channels') sb._railGo('channels');
    else {
      if (!sb.isOpen) sb.toggle(true);
      sb.listEl.querySelector('.rail-panel-channels')?.remove();
      sb._renderRailPanel();
    }
    return true;
  }
  return openChannelsWindow(app, opts);
}

/** The window fallback: one singleton 'channels' window hosting the very same
 *  renderChannelsPanel (its broadcast unsubscribe is tied to the window's
 *  listener controller, so a closed window stops repainting). */
export function openChannelsWindow(app, { syncId } = {}) {
  for (const [, w] of app.wm.windows) if (w.type === 'channels') { app.wm.focusWindow(w.id); return w; }
  app._hideWelcome?.();
  const winInfo = app.wm.createWindow({ title: t('Channels'), type: 'channels', syncId, openSpec: { action: 'openChannels' }, width: 520, height: 600 });
  const c = document.createElement('div');
  c.className = 'rail-panel rail-panel-channels chan-window';
  winInfo.content.appendChild(c);
  const dispose = renderChannelsPanel(app, c);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { dispose?.(); } catch {} });
  return winInfo;
}

registerWindowType({
  type: 'channels', label: 'Channels', singleton: true, icon: '',
  // forceWindow: a REPLAY produces the window it names, never the rail panel (verifier r2, see sidebar-rail.js)
  action: 'openChannels', replay: (app, spec, { syncId } = {}) => app.openChannels({ syncId, forceWindow: true }),
});

registerChannelsMenus();
registerChannelsGearRow();
