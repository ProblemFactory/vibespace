// THE CHANNELS PANEL (docs/design-communication-panel.zh.md §10; the a4 UI
// design docs/design-communication-panel-ui.md §4 — direction A, the Folders /
// Tasks idiom).
//
// The sidebar rail's `channels` panel: a bar (summary + the Outbox button
// carrying the awaiting count), one collapsible `folder-header` section per
// adapter (chevron · kind glyph · name · a 6px STATE DOT · tracked/total · ⋯),
// a status line ONLY when the adapter has something to say beyond
// "connected" (not connected / needs re-authorization / a re-authorization
// due within 7 days / disabled / failing / a withdrawn push claim), and the
// conversations as bordered `session-item-card` rows on ONE grid: line 1 =
// title + ONE freshness pill, line 2 = participants + the needs-you badges
// (awaiting outline pill, unread accent count), line 3 only when assigned.
// Every adapter VERB lives in the ⋯ menu (a `channel-adapter` contribution
// menu) — the a1 audit measured the verbs at 47–59 % of the panel's height.
//
// ON EVERY TRACKED ROW A FRESHNESS CHIP. That chip is not decoration — it is
// this feature's honesty contract. A row says how long ago its evidence was
// gathered ("live" / "within 30s" / "scanned 4m ago" / "not polling"),
// because that is the one number a user needs before handing something to a
// lane. An UNTRACKED row carries no pill at all (design §4.3): nothing is
// fetched for it, so there is no evidence to claim, and its line-2 `not
// tracked` text already says so — a pill there was the one that truncated
// (ja's ポーリングしていません lost its negation to the ellipsis at the
// default rail: "…polling" when the truth was "not polling"). The CLAIM
// comes from the server's `freshnessClaim`, which resolves
// from the lane ACTUALLY carrying the row (`laneState` / `scanState`) — never
// from the adapter's static declaration, so a demoted or dead push lane draws
// the poll cadence it is really on (the `opencode-events` round-4 lesson: a
// lane that lies about being active is worse than no lane, because it turns
// the fallback off) — and the SENTENCE is composed here, in the language of
// the device reading it.
//
// ONE COLOUR PER MEANING (design §4.3): accent = needs you (unread fill,
// awaiting outline), green = live evidence, a neutral tint = an age, amber
// (`--warn-text`) = a warning, red = failed. Every glyph is an SVG from
// src/lib/icons.js (§17) — never a text symbol.
//
// XSS LAW: every string here is vendor- or peer-controlled and syncs to every
// client, so EVERYTHING renders through textContent. The only innerHTML is the
// icon library's own static SVG (`icon()`), never a string from the wire.
//
// THE MENUS AND THE GEAR ROW ARE CONTRIBUTIONS (src/lib/contributions.js), the
// same shape core's session-card / window / gear menus use — registered by the
// module that OWNS the feature, so gear-menu.js stays byte-identical to its
// pinned legacy row list.
import { fetchJson, showContextMenu, showToast, createModalShell, showConfirmDialog, copyText, escHtml } from './utils.js';
import { t, deviceLocale } from './i18n.js';
import { registerMenuItem, menuItems } from './contributions.js';
import { registerWindowType } from './window-types.js';
import { UI_ICONS } from './icons.js';
// the shared chrome primitives (one SVG helper, one textContent element, one house button)
import { icon, btn, noteLine } from './channel-chrome.js';
// PURE, bundled directly (the task-color-seq / quota-model pattern). THE
// SENTENCE IS COMPOSED HERE (r2): `freshnessClaim` used to build it server
// side with no translator, so the chip this feature calls its honesty
// contract shipped ENGLISH-ONLY to a zh/ja UI — and the server cannot fix
// that, because the digest is broadcast to every client at once while the
// language is per DEVICE (localStorage).
import * as chanCaps from '../channel-caps.js';
// PURE, bundled: the credential `whyCode` → words (a3 i18n; the registry is
// already in the bundle for the Integrations window).
import * as R from '../integration-registry.js';
// a3 i18n: a route failure is worded by its CODE here, never by the engine's sentence.
import { routeErrorText, groupErrorText } from './channel-words.js';
// g3 (design §22): the IM-first list's arithmetic and the group dialogs.
import { groupListRows, foldsFrom, GROUP_ADAPTER_ID } from './channel-groups-view.js';
import { showGroupMembersDialog, showGroupDetail, renameGroup, archiveGroup } from './channel-group-dialogs.js';
// P2: the Assign & filter editor and the one-line summary a row draws.
import { showAssignFilterDialog, assignmentSummary } from './channel-filter-editor.js';
// P3: the reach/policy dialog (row menu) and the Outbox window (header button).
import { showReachDialog } from './channel-reach-editor.js';
import './channel-outbox.js';

/** A short, honest freshness chip. The server sends `{kind, state, seconds}`
 *  and `freshnessText` turns it into words: a claim whose `state` we do not
 *  recognise says `unknown` rather than inventing a number. ONE neutral pill
 *  for every age; green only for positive live evidence; dimmer when nothing
 *  is being gathered (`off` / `never`). */
function chip(freshness) {
  const el = document.createElement('span');
  const f = freshness || {};
  el.className = 'chan-chip' + (f.kind === 'live' ? ' chan-chip-live' : (f.state === 'off' || f.state === 'never') ? ' chan-chip-off' : '');
  el.textContent = chanCaps.freshnessText(f, { t }) || t('unknown');
  el.title = t('How fresh this row is — the lane actually carrying it, not the one the adapter declares.');
  return el;
}

/** The section head's lane note — the lane's CODES in words (a3 i18n): a scan
 *  lane names its source, or the reason it has none, never the raw code.
 *  Since a4 it is the state dot's TOOLTIP (a1 D5: the raw lane code was the
 *  loudest thing on the head). */
function laneNote(lane) {
  if (!lane) return '';
  if (lane.via === 'scan') return lane.source ? `${t('scan')} · ${chanCaps.scanSourceText(lane.source, { t })}` : `${t('scan')} · ${chanCaps.laneWhyText(lane.why || 'no-source', { t })}`;
  if (lane.via === 'push') return t('push');
  return t('poll');
}

async function api(pathname, init) {
  const r = await fetchJson(pathname, init);
  if (!r || r.error) { showToast(routeErrorText(r), { type: 'error' }); return null; }
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
const REAUTH_SOON_MS = 7 * 86400e3;

/** A compact "re-authorize in …" countdown; the CLOCK is an argument. */
export function reauthEta(expiresAt, now = Date.now()) {
  const ms = Number(expiresAt) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return t('expired');
  if (ms < 2 * 3600e3) return t('{n}m', { n: Math.max(1, Math.round(ms / 60e3)) });
  if (ms < 72 * 3600e3) return t('{n}h', { n: Math.round(ms / 3600e3) });
  return t('{n}d', { n: Math.round(ms / 86400e3) });
}

function chanLine(cls, text) { const el = document.createElement('div'); el.className = cls; el.textContent = text; return el; }

/** The glyph a section carries: the built-in row is the robot; a channel whose
 *  rows are mail threads / mailboxes is mail; anything else is a chat. Read
 *  from the DIGEST'S FACTS (`builtin`, the rows' record `kind`), never an id. */
function kindGlyph(a, convs) {
  if (a && a.builtin) return 'robot';
  const kinds = (convs || []).map((c) => c.kind).filter(Boolean);
  if (kinds.length && kinds.every((k) => k === 'thread' || k === 'mailbox')) return 'mail';
  return 'chat';
}
/** The glyph an AVAILABLE kind carries: from its capability facts (`receive`
 *  names a mailbox-style source), never its id. */
function availableGlyph(av) {
  const rec = Array.isArray(av && av.receive) ? av.receive : [];
  return rec.includes('mailbox') || rec.includes('mail') ? 'mail' : 'chat';
}

/** THE CONNECT WIZARD'S THREE COPY PATHS (§10.1): the credential facts decide
 *  what the button SAYS and what it DOES. `none` opens the Integrations card
 *  first — sending the user into a consent page that will fail is the
 *  failure the design names; `cluster` says so under the button; `user`
 *  says nothing more. One full-width `mounts-btn` per kind, the note under it. */
function connectRow(app, av) {
  const frag = document.createDocumentFragment();
  const cred = av.credential || { source: 'unknown' };
  const label = av.label || av.kind;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mounts-btn chan-connect-btn';
  b.appendChild(icon(availableGlyph(av), 13));
  const txt = document.createElement('span');
  txt.className = 'chan-connect-label';
  b.appendChild(txt);
  b.dataset.connectKind = av.kind;
  if (cred.source === 'none') {
    txt.textContent = t('Set up {label} credentials…', { label });
    b.onclick = () => app.openIntegration(av.integration);
    frag.appendChild(b);
    frag.appendChild(noteLine('chan-connect-note', t('Not configured — set up the application credential first'), { warn: true }));
  } else {
    txt.textContent = t('Connect {label}', { label });
    b.onclick = () => startConnect(app, av);
    frag.appendChild(b);
    if (cred.source === 'cluster') frag.appendChild(chanLine('chan-connect-note', cred.clusterLabel ? t('Provided by the cluster · {label}', { label: cred.clusterLabel }) : t('Provided by the cluster')));
    else if (cred.source === 'unknown') frag.appendChild(chanLine('chan-connect-note', R.credentialWhyText(cred, { t }) || t('credential state unknown')));
  }
  return frag;
}

// ── THE ACCOUNT MODEL (2026-09-22, the owner's mounts analogy) ────────────
// A kind holds N ACCOUNTS, each bound at connect to the credential it was
// minted under. The wizard MINTS (`newAccount: true`, never the P1a re-point
// of the first record); an existing account re-authorizes ITSELF by id.
// Every fact below is read off the digest: `credentials` = what the
// integration offers a NEW account right now, `credentialDefault` = the row's
// own pick (pre-picked, never forced), `credentialKey` / `credentialLabel` =
// what THIS account is bound to.

/** The wizard's SPEC for a kind, read off an `available[]` entry OR an
 *  existing account's row (both carry the same three facts). */
function wizardSpec(x) {
  return {
    kind: x.kind, integration: x.integration || null, label: x.label || x.kind,
    credentials: Array.isArray(x.credentials) ? x.credentials.filter((c) => c && c.key) : [],
    credentialDefault: x.credentialDefault || null,
  };
}
/** The credential's words: a cluster preset by its env label (data — never
 *  translated), `own` by ours; a bare key when no label is known. */
function credentialText(key, label) {
  if (key === 'own') return t('Own client');
  return label || String(key || '').replace(/^cluster:/, '');
}
/** The name a section carries: the account the token names (an e-mail, a
 *  tenant user) when known, else the kind's label — NUMBERED only when the
 *  kind holds more than one account, so a lone "Gmail" stays "Gmail". The
 *  built-in row's login is this instance, never a named user (`auth.self`). */
function accountName(a, siblings = 1, n = 1) {
  const user = a.auth && !a.auth.self && a.auth.user ? String(a.auth.user) : '';
  if (user) return user;
  const label = a.label || a.id;
  return siblings > 1 ? t('{label} account {n}', { label, n }) : label;
}

/** THE WIZARD'S ENTRY — every Connect / "Add account…" lands here. Step 1
 *  (Credential) is DRAWN only when the integration offers MORE THAN ONE
 *  credential right now; exactly one ⇒ it is sent as the account's key and
 *  the step is skipped silently (no empty step, no extra click); none ⇒ the
 *  server stamps the row's pick. The consent step follows in the SAME dialog. */
async function startConnect(app, spec) {
  const s = wizardSpec(spec);
  // the step is drawn whenever ANYTHING is offered (2.369.147 r3, owner: "lark 为啥没有这个选择 oauth client 的菜单") —
  // the presets and the user's own client, the latter marked when its fields are missing
  if (s.credentials.length >= 1) return showCredentialStep(app, s);
  const body = { newAccount: true };
  const r = await postConnect(app, s, body);
  if (r) showFlowDialog(app, r.adapter && r.adapter.id ? r.adapter.id : s.kind, s.label, r.flow);
}
async function postConnect(app, s, body) {
  const r = await fetchJson(`/api/channels/adapters/${encodeURIComponent(s.kind)}/connect`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body || {}) });
  if (!r || r.error) {
    // A missing application credential is not a failed consent — it is the
    // card the user has not filled in yet (§10.1): open it, and say why.
    // The toast words the CODE (a3 i18n); the engine's sentence is the contract.
    showToast(routeErrorText(r), { type: 'error' });
    if (r && r.code === 'needs-credentials') app.openIntegration(s.integration);
    return null;
  }
  return r;
}
/** RE-AUTHORIZE one ACCOUNT by its id — never by kind: a further account's
 *  consent runs under ITS credential (`POST /adapters/:id/reauthorize`).
 *  A TOKEN-LESS account (`auth.tokenHeld` false: never authenticated, or
 *  disconnected) has nothing minted under its key, so the consent it begins
 *  may RE-BIND it — the wizard's credential step runs first when more than
 *  one credential is offered (the account's OWN key pre-picked, never the
 *  row's default over it), exactly one rides the body (the same silent rule
 *  as a new account); a HELD token binds the account, so nothing about the
 *  key is sent — the server refuses a different one by name
 *  (`credential-bound`; the remedy is Disconnect, then Connect). */
async function reauthorize(app, a) {
  const s = wizardSpec(a);
  const held = !!(a.auth && a.auth.tokenHeld);
  if (!held && s.credentials.length >= 1) {
    const own = s.credentials.some((c) => c.key === a.credentialKey) ? a.credentialKey : s.credentialDefault;
    return showCredentialStep(app, { ...s, credentialDefault: own }, { submit: (credentialKey) => postReauthorize(app, a, { credentialKey }) });
  }
  const body = !held && s.credentials.length === 1 ? { credentialKey: s.credentials[0].key } : {};
  const r = await postReauthorize(app, a, body);
  if (r) showFlowDialog(app, a.id, a.label || a.id, r.flow);
}
async function postReauthorize(app, a, body) {
  const r = await fetchJson(`/api/channels/adapters/${encodeURIComponent(a.id)}/reauthorize`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body || {}) });
  if (!r || r.error) {
    showToast(routeErrorText(r), { type: 'error' });
    if (r && r.code === 'needs-credentials' && a.integration) app.openIntegration(a.integration);
    return null;
  }
  return r;
}
/** STEP 1 — THE CREDENTIAL: one radio per offered credential (a preset by
 *  its label, `own` in our words), `s.credentialDefault` pre-picked (the
 *  row's default for a NEW account; a token-less account's own key when it
 *  re-binds); Continue hands the chosen key to `submit` — by default
 *  `{credentialKey, newAccount: true}` to the kind's connect; the re-bind
 *  path posts it to the account's own `/reauthorize` — and the SAME dialog
 *  moves on to the consent step. Cancel here mints nothing (the record is
 *  created by the server only after the credential resolved — the r2 ④ rule). */
function showCredentialStep(app, s, { submit = (credentialKey) => postConnect(app, s, { credentialKey, newAccount: true }) } = {}) {
  const shell = createModalShell({ id: 'chan-flow-dialog', title: t('Connect {label}', { label: s.label }), dialogClass: 'chan-dialog chan-flow', escapeToClose: true });
  const { body, close } = shell;
  body.appendChild(stepper(0));
  body.appendChild(chanLine('chan-flow-intro', t('Choose the application credential this account is authorized under. It stays bound to the account — the pick on the Integrations card is only the default for new accounts.')));
  const list = document.createElement('div');
  list.className = 'chan-cred-list';
  const usable = s.credentials.filter((c) => c.available !== false);
  const picked = usable.some((c) => c.key === s.credentialDefault) ? s.credentialDefault : (usable[0] || s.credentials[0]).key;
  for (const c of s.credentials) {
    const lab = document.createElement('label');
    lab.className = 'dialog-check-row chan-cred-item';
    const r = document.createElement('input');
    r.type = 'radio'; r.name = 'chan-cred'; r.value = c.key; r.checked = c.key === picked;
    const name = document.createElement('span');
    name.className = 'chan-cred-label';
    name.textContent = credentialText(c.key, c.label);
    const hint = document.createElement('span');
    hint.className = 'dialog-check-hint';
    hint.textContent = c.key === 'own' ? (c.available === false ? t('Not filled in yet — Continue opens the Integrations card to enter the client id and secret') : t('The keys saved on the Integrations card')) : t('Provided by the cluster');
    if (c.available === false) lab.classList.add('chan-cred-unavailable');
    lab.append(r, name, hint);
    list.appendChild(lab);
  }
  body.appendChild(list);
  const actions = document.createElement('div');
  actions.className = 'chan-flow-actions';
  const status = chanLine('chan-flow-status', '');
  const next = btn(t('Continue'), async () => {
    const chosen = list.querySelector('input[name="chan-cred"]:checked');
    const credentialKey = chosen ? chosen.value : picked;
    const pick = s.credentials.find((c) => c.key === credentialKey);
    if (pick && pick.available === false) { close(); app.openIntegration(s.integration); return; } // fill the own client in first — one 'Add account…' away
    next.disabled = true;
    const r = await submit(credentialKey);
    next.disabled = false;
    if (!r) return;
    showFlowDialog(app, r.adapter && r.adapter.id ? r.adapter.id : s.kind, s.label, r.flow, shell);
  }, 'mounts-btn-primary');
  actions.append(btn(t('Cancel'), close), next);
  body.append(actions, status);
}

/** The wizard's step strip: keys (done) → consent (current) → track. */
function stepper(current) {
  const wrap = document.createElement('div');
  wrap.className = 'chan-steps';
  const names = [t('Credential'), t('Consent'), t('Track')];
  names.forEach((name, i) => {
    if (i) { const sep = document.createElement('span'); sep.className = 'chan-step-sep'; wrap.appendChild(sep); }
    const st = document.createElement('span');
    st.className = 'chan-step' + (i < current ? ' chan-step-done' : i === current ? ' chan-step-on' : '');
    const n = document.createElement('span');
    n.className = 'chan-step-n';
    if (i < current) n.appendChild(icon('check', 9)); else n.textContent = String(i + 1);
    const lab = document.createElement('span');
    lab.textContent = name;
    st.append(n, lab);
    wrap.appendChild(st);
  });
  return wrap;
}

/** The running consent flow as a STEPPER (design (e)): the consent page as a
 *  LINK the user opens (a window opened after an await is popup-blocked; a
 *  click on a link is not) beside a COPY-LINK affordance (a remote browser
 *  takes the URL by hand), the named port-busy refusal as an amber line, and
 *  PASTE-BACK — the path a remote browser takes anyway (§12.4) — as a
 *  collapsed step that opens itself when nothing is listening. The dialog
 *  follows the adapter's broadcast: a finished flow moves to the Track step. */
function showFlowDialog(app, adapterId, label, flow, shell = null) {
  // `shell` = the wizard's own dialog when the credential step ran first (ONE dialog, three steps)
  const { body, close } = shell || createModalShell({ id: 'chan-flow-dialog', title: t('Connect {label}', { label }), dialogClass: 'chan-dialog chan-flow', escapeToClose: true });
  body.textContent = '';
  body.appendChild(stepper(1));
  body.appendChild(chanLine('chan-flow-intro', t('Open the consent page in your browser and approve the access. When it lands on a page this VibeSpace cannot see, paste that page\'s URL back here.')));
  const refused = !!(flow && flow.refusal);
  if (flow && flow.consentUrl) {
    const row = document.createElement('div');
    row.className = 'chan-flow-primary';
    const a = document.createElement('a');
    a.className = 'mounts-btn mounts-btn-primary';
    a.href = flow.consentUrl; a.target = '_blank'; a.rel = 'noopener';
    a.append(icon('external', 12), document.createTextNode(t('Open the consent page')));
    const cp = btn(t('Copy link'), async () => { await copyText(flow.consentUrl); showToast(t('Copied')); });
    cp.prepend(icon('copy', 11));
    row.append(a, cp);
    body.appendChild(row);
  }
  if (refused) {
    const line = document.createElement('div');
    line.className = 'chan-flow-refusal chan-warn';
    line.appendChild(icon('alert', 12));
    const s = document.createElement('span');
    s.textContent = flow.refusal.code === 'port-busy'
      ? t('Another VibeSpace or tool holds port {port} — finish or cancel it there, or paste the redirect URL back here.', { port: flow.port })
      : (flow.refusal.message || flow.refusal.code || t('refused'));
    line.appendChild(s);
    body.appendChild(line);
  } else if (flow && flow.listening) {
    const w = document.createElement('div');
    w.className = 'chan-flow-wait';
    const spin = document.createElement('span'); spin.className = 'chan-flow-spin';
    const s = document.createElement('span'); s.textContent = t('Waiting for the vendor to redirect back to port {port}…', { port: flow.port });
    w.append(spin, s);
    body.appendChild(w);
  }
  // paste-back: collapsed while the loopback listens, open when it cannot
  const paste = document.createElement('details');
  paste.className = 'chan-flow-paste';
  paste.open = refused || !(flow && flow.listening);
  const sum = document.createElement('summary');
  sum.textContent = t('Didn\'t come back? Paste the URL your browser landed on');
  paste.appendChild(sum);
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'chan-flow-input'; input.placeholder = 'http://127.0.0.1:…/?code=…&state=…';
  input.spellcheck = false;
  const prow = document.createElement('div');
  prow.className = 'chan-flow-paste-row';
  const status = chanLine('chan-flow-status', '');
  const finish = btn(t('Finish'), async () => {
    const url = input.value.trim();
    if (!url) { status.className = 'chan-flow-status chan-warn'; status.textContent = t('Paste the URL first.'); return; }
    finish.disabled = true;
    const r = await fetchJson(`/api/channels/adapters/${encodeURIComponent(adapterId)}/auth/finish`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ url }) });
    finish.disabled = false;
    if (!r || r.error) { status.className = 'chan-flow-status chan-warn'; status.textContent = t('The consent flow ended: {error}', { error: (r && r.error) || t('no answer') }); return; }
    done();
  }, 'mounts-btn-primary');
  prow.append(input, finish);
  paste.append(prow);
  body.appendChild(paste);
  const actions = document.createElement('div');
  actions.className = 'chan-flow-actions';
  const cancel = btn(t('Cancel'), async () => { off(); await post(`/api/channels/adapters/${encodeURIComponent(adapterId)}/auth/cancel`, {}); close(); });
  actions.append(cancel);
  body.append(actions, status);
  // STEP 3 — connected: the Track picker for this adapter, in the same dialog
  // (nothing is fetched until a conversation is ticked, §5 invariant 6).
  let finished = false;
  const done = async () => {
    if (finished) return;
    finished = true;
    off();
    status.className = 'chan-flow-status chan-ok'; status.textContent = t('Connected.');
    const d = await fetchJson('/api/channels');
    const convs = (d && Array.isArray(d.conversations)) ? d.conversations.filter((c) => c.adapterId === adapterId) : [];
    const a = (d && Array.isArray(d.adapters) ? d.adapters : []).find((x) => x.id === adapterId) || { id: adapterId, label };
    body.textContent = '';
    body.appendChild(stepper(2));
    body.appendChild(chanLine('chan-flow-status chan-ok', t('Connected.')));
    body.appendChild(chanLine('chan-flow-note', t('Nothing is fetched for a conversation until you track it.')));
    body.appendChild(trackList(a, convs));
    if (!convs.length) body.appendChild(chanLine('chan-flow-note', t('Conversations appear after the first pass — you can also track them later from the panel.')));
    const acts = document.createElement('div');
    acts.className = 'chan-flow-actions';
    acts.appendChild(btn(t('Done'), close, 'mounts-btn-primary'));
    body.appendChild(acts);
  };
  // The loopback path needs no paste: the adapter's broadcast says the flow is done.
  const onBroadcast = (msg) => {
    if (msg.type !== 'channels-updated' || !msg.digest) return;
    const a = (msg.digest.adapters || []).find((x) => x.id === adapterId);
    if (!a) return;
    if (a.flow && a.flow.done && a.flow.ok) done();
    else if (a.flow && a.flow.done && a.flow.error) { status.className = 'chan-flow-status chan-warn'; status.textContent = t('The consent flow ended: {error}', { error: a.flow.error }); }
    else if (!a.flow && a.lastAuthError) { status.className = 'chan-flow-status chan-warn'; status.textContent = t('The consent flow ended: {error}', { error: a.lastAuthError }); }
    else if (!a.flow && a.auth && a.auth.state === 'connected') done();
  };
  const off = () => { try { app.ws.offGlobal(onBroadcast); } catch {} };
  app.ws.onGlobal(onBroadcast);
  setTimeout(() => { if (paste.open) input.focus({ preventScroll: true }); }, 0);
}

/** The list of one adapter's conversations with a Track checkbox each — the
 *  house `dialog-check-row` grid (a1 O1: the generic `.dialog-body label`
 *  rule used to stack the box above the title). Shared by the Track picker
 *  and the wizard's third step. */
function trackList(a, convs) {
  const list = document.createElement('div');
  list.className = 'chan-track-list';
  if (!convs.length) { const e = chanLine('empty-hint empty-hint-inline', t('No conversations discovered yet.')); list.appendChild(e); }
  for (const c of convs) {
    const lab = document.createElement('label');
    lab.className = 'dialog-check-row chan-track-item';
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
  return list;
}

/** THE TRACKED PICKER: tracked is OPT-IN (§5 invariant 6) — nothing is fetched
 *  for a conversation until the user ticks it here or in the row menu. */
function showTrackPicker(app, a, convs) {
  const { body, close } = createModalShell({ id: 'chan-track-dialog', title: t('Track conversations — {label}', { label: a.label || a.id }), dialogClass: 'chan-dialog chan-track', escapeToClose: true });
  body.appendChild(chanLine('chan-flow-note', t('Nothing is fetched for a conversation until you track it.')));
  body.appendChild(trackList(a, convs));
  const actions = document.createElement('div');
  actions.className = 'chan-flow-actions';
  actions.appendChild(btn(t('Done'), close, 'mounts-btn-primary'));
  body.appendChild(actions);
}

/** THE OPTIONS EDITOR: the adapter's DECLARED options only (a select for a
 *  `choices` option, a text input otherwise); `''` restores the default. */
function showOptionsDialog(app, a) {
  const { body, close } = createModalShell({ id: 'chan-options-dialog', title: t('Options — {label}', { label: a.label || a.id }), dialogClass: 'chan-dialog chan-options', escapeToClose: true });
  const fields = [];
  for (const o of a.optionsSchema || []) {
    const wrap = document.createElement('div');
    wrap.className = 'chan-opt';
    // an adapter DECLARES keys (a3 i18n); the words are the device's
    const lab = chanLine('chan-opt-label', o.label ? t(o.label) : o.key);
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
    if (o.help) wrap.appendChild(chanLine('chan-opt-help', t(o.help)));
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
    status.className = 'chan-flow-status chan-ok'; status.textContent = t('Saved.');
    setTimeout(close, 400);
  }, 'mounts-btn-primary');
  actions.append(btn(t('Cancel'), close), save);
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
  const { body, close } = createModalShell({ id: 'chan-push-dialog', title: t('Push lane — {label}', { label: a.label || a.id }), dialogClass: 'chan-dialog chan-options', escapeToClose: true });
  body.appendChild(chanLine('chan-flow-intro', chanCaps.pushLaneText(p, a.lane, { t, now: Date.now() })));
  if (p.demotedAt) body.appendChild(noteLine('chan-flow-note', t('The claim was withdrawn by measurement. Re-declaring it clears the counters and retries the lane once.'), { warn: true }));
  let enabledBox = null;
  if (p.optIn) {
    const lab = document.createElement('label');
    lab.className = 'dialog-check-row';
    enabledBox = document.createElement('input');
    enabledBox.type = 'checkbox'; enabledBox.checked = !!p.enabled;
    const txt = document.createElement('span');
    txt.textContent = t('Push enabled');
    const hint = document.createElement('span');
    hint.className = 'dialog-check-hint';
    hint.textContent = t('Off by default — needs the Pub/Sub topic + subscription options and a re-authorize.');
    lab.append(enabledBox, txt, hint);
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
    status.className = 'chan-flow-status chan-ok'; status.textContent = t('Saved.');
    setTimeout(close, 400);
  }, 'mounts-btn-primary');
  actions.append(btn(t('Cancel'), close), save);
  body.append(actions, status);
}

/** The adapter's STATE for the head's dot: `ok` connected, `warn` needs the
 *  user (expired / no credential / failing), `attn` a consent flow is running,
 *  `idle` disabled or never connected. */
function adapterDot(a) {
  const auth = a.auth || { state: 'unknown' };
  if (a.enabled === false) return 'idle';
  if (a.flow && a.flow.running) return 'attn';
  if (a.consecutiveFailures >= 3) return 'warn';
  if (auth.state === 'connected') return 'ok';
  if (auth.state === 'expired' || auth.state === 'needs-credentials') return 'warn';
  return 'idle';
}

/** The STATUS LINES under a head — only when the adapter has something to say
 *  beyond "connected" (a1 D1/D6, design §4.2): each is a wrapping 10px
 *  sentence carrying its ONE verb, amber when it needs the user. Returns
 *  zero or more `.chan-sec-note` elements. */
function adapterNotes(app, a) {
  const notes = [];
  const auth = a.auth || { state: 'unknown' };
  const reconnect = () => reauthorize(app, a);   // by id — a further account re-authorizes ITSELF, never the kind's first
  const line = (text, { warn = false, verbs = [] } = {}) => {
    const n = noteLine('chan-sec-note', text, { warn });
    for (const v of verbs) { v.classList.add('chan-sec-verb'); n.appendChild(v); }
    notes.push(n);
  };
  if (a.enabled === false) {
    line(t('disabled'), { verbs: [btn(t('Enable'), () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { enabled: true }))] });
  } else if (a.flow && a.flow.running) {
    line(t('Connecting…'), { verbs: [btn(t('Resume the consent flow'), () => showFlowDialog(app, a.id, a.label || a.id, a.flow)), btn(t('Cancel'), () => post(`/api/channels/adapters/${encodeURIComponent(a.id)}/auth/cancel`, {}))] });
  } else if (auth.state === 'connected') {
    // the built-in row's login IS this instance (`auth.self`), never a named user
    const eta = auth.expiresAt ? reauthEta(auth.expiresAt) : null;
    const soon = auth.expiresAt && (Number(auth.expiresAt) - Date.now()) < REAUTH_SOON_MS;
    if (soon && eta) {
      const who = auth.self ? t('connected — this instance') : auth.user ? t('connected as {user}', { user: auth.user }) : t('connected');
      line(`${who} · ${t('re-authorize in {eta}', { eta })}`, { warn: Number(auth.expiresAt) - Date.now() <= 0, verbs: a.connectable ? [btn(t('Re-authorize'), reconnect)] : [] });
    }
  } else if (auth.state === 'expired') {
    // `auth.why` is a CODE (token-expired / refresh-refused / …) — worded here (a3 i18n)
    line(t('needs re-authorization ({why})', { why: chanCaps.authWhyText(auth.why || 'token-expired', { t }) }), { warn: true, verbs: a.connectable ? [btn(t('Re-authorize'), reconnect, 'mounts-btn-primary')] : [] });
  } else if (auth.state === 'needs-credentials') {
    // the credential facts carry the store's `whyCode` (a real adapter's
    // module names its integration); an adapter that resolves its own
    // credential (the fake fixtures) carries the same code on `auth.whyCode`.
    // NEVER the raw `why` sentence — that is the store's English contract.
    const cred = a.credential || {};
    const why = R.credentialWhyText({ whyCode: cred.whyCode || auth.whyCode || null, whyParams: cred.whyParams || auth.whyParams || null }, { t }) || chanCaps.authWhyText('no-credentials', { t });
    line(t('application credential missing ({why})', { why }), { warn: true, verbs: a.integration ? [btn(t('Open Integrations'), () => app.openIntegration(a.integration), 'mounts-btn-primary')] : [] });
  } else if (a.connectable) {
    // an adapter that cannot connect (the fake fixtures, a scan-only source)
    // has nothing to say here — "not connected" would be a claim about a
    // control that does not exist
    line(t('not connected'), { verbs: [btn(t('Connect'), reconnect, 'mounts-btn-primary')] });
  }
  if (a.lastAuthError) line(t('Last connect failed: {error}', { error: a.lastAuthError }), { warn: true });
  if (a.consecutiveFailures >= 3 && a.lastPass) {
    const s = t('{n} failed passes ({code})', { n: a.consecutiveFailures, code: chanCaps.errorCodeText((a.lastPass && a.lastPass.code) || 'failed', { t }) });
    line(s + (a.lastPass.error ? ` — ${a.lastPass.error}` : '') + (a.failureItem ? ` — ${t('a "For you" item was filed')}` : ''), { warn: true });
  }
  // P1b: THE PUSH LANE'S SENTENCE when the product has WITHDRAWN the claim or
  // the lane is unavailable — drawn WITH its numbers and the "re-declare to
  // retry" verb beside it: a demotion is cleared by the party that made the
  // claim, never by the counters. A healthy push lane says nothing here (the
  // rows' `live` chips are its evidence; the sentence lives in Push…).
  if (a.push && (a.push.demotedAt || a.push.state === 'unavailable')) {
    line(chanCaps.pushLaneText(a.push, a.lane, { t, now: Date.now() }), { warn: true, verbs: a.push.demotedAt ? [btn(t('Re-declare exclusive and retry'), () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { push: { claimedExclusive: 'exclusive' } }))] : [] });
  }
  return notes;
}

/** The state dot's tooltip: the lane in words + the §21-item-3 proof line
 *  (a real send's observed sender_type), data a user reads on demand. */
function dotTitle(a) {
  const bits = [laneNote(a.lane)];
  if (a.identityObserved) {
    const o = a.identityObserved;
    let s = t('Last real send was attributed by the platform to {who} ({when})', { who: o.senderType === 'user' ? t('the user') : t('an app / bot'), when: new Date(o.at).toLocaleString(deviceLocale()) });
    if (o.declared === 'unknown') s += ' — ' + t('this channel\'s identity declaration is still unverified in code; this measurement is what settles it');
    bits.push(s);
  }
  return bits.filter(Boolean).join('\n');
}

/** The `channel-adapter` ⋯ menu — every verb the section used to spread above
 *  its rows (a1 D1/D2/Z5), state-driven: only the verbs that exist for THIS
 *  row. ctx = { app, adapter, convs }. */
export function registerChannelAdapterMenu() {
  const M = 'channel-adapter';
  const A = (c) => c.adapter;
  registerMenuItem({ menu: M, group: '1_rows', order: 10, label: () => t('Track…'), run: (c) => showTrackPicker(c.app, A(c), c.convs || []) });
  registerMenuItem({ menu: M, group: '1_rows', order: 20, when: (c) => (A(c).optionsSchema || []).length > 0, label: () => t('Options'), run: (c) => showOptionsDialog(c.app, A(c)) });
  registerMenuItem({ menu: M, group: '1_rows', order: 30, when: (c) => !!A(c).push, label: () => t('Push…'), run: (c) => showPushDialog(c.app, A(c)) });
  // P4: THE SENDER HONESTY SWITCH (§9.5) — per channel, OFF by default, drawn
  // only where the capability row allows sending (the digest hands `null`
  // for a read-only adapter). The row's check glyph says the state; the
  // label says whether the instance default is what applies.
  registerMenuItem({ menu: M, group: '2_send', order: 0, separator: true, when: (c) => !!A(c).senderHonestyLine });
  registerMenuItem({
    menu: M, group: '2_send', order: 10,
    when: (c) => !!A(c).senderHonestyLine,
    label: (c) => { const h = A(c).senderHonestyLine; return t('Sender line: {v}', { v: h.effective ? t('on') : t('off') }) + (h.record === null ? ' ' + t('(instance default)') : ''); },
    labelHtml: (c) => { const h = A(c).senderHonestyLine; const label = t('Sender line: {v}', { v: h.effective ? t('on') : t('off') }) + (h.record === null ? ' ' + t('(instance default)') : ''); return `<span class="chan-menu-check${h.effective ? ' chan-menu-check-on' : ''}" data-honesty-line="${h.effective ? 'on' : 'off'}">${h.effective ? UI_ICONS.check : ''}</span>${escHtml(label)}`; },
    tooltip: () => t('When on, a message an AGENT drafted goes out with one trailing line naming the agent. Your own drafts never get one. The approval card says who the recipient will see either way.'),
    run: (c) => put(`/api/channels/adapters/${encodeURIComponent(A(c).id)}`, { senderHonestyLine: !A(c).senderHonestyLine.effective }),
  });
  registerMenuItem({ menu: M, group: '2_send', order: 20, when: (c) => !!A(c).senderHonestyLine && A(c).senderHonestyLine.record !== null, label: () => t('Use instance default'), run: (c) => put(`/api/channels/adapters/${encodeURIComponent(A(c).id)}`, { senderHonestyLine: null }) });
  registerMenuItem({ menu: M, group: '3_auth', order: 0, separator: true, when: (c) => !!A(c).connectable });
  registerMenuItem({ menu: M, group: '3_auth', order: 10, when: (c) => !!A(c).connectable && !(A(c).flow && A(c).flow.running), label: (c) => ((A(c).auth || {}).state === 'connected' ? t('Re-authorize') : t('Connect')), run: (c) => reauthorize(c.app, A(c)) });
  // THE ACCOUNT MODEL: another account of this kind, through the wizard
  // (its own credential step when more than one is offered) — never a
  // re-point of this one
  registerMenuItem({ menu: M, group: '3_auth', order: 15, when: (c) => !!A(c).connectable, label: () => t('Add account…'), tooltip: (c) => t('Another {label} account, under its own credential', { label: A(c).label || A(c).id }), run: (c) => startConnect(c.app, A(c)) });
  registerMenuItem({
    menu: M, group: '3_auth', order: 20,
    when: (c) => !!A(c).connectable && (A(c).auth || {}).state !== 'unknown',
    label: () => t('Disconnect'),
    run: async (c) => {
      const a = A(c);
      const yes = await showConfirmDialog({ title: t('Disconnect'), message: t('Disconnect {label}? The token is dropped; conversations stay.', { label: a.label || a.id }), confirmText: t('Disconnect'), danger: true });
      if (yes) await post(`/api/channels/adapters/${encodeURIComponent(a.id)}/disconnect`, {});
    },
  });
  registerMenuItem({ menu: M, group: '4_state', order: 0, separator: true });
  registerMenuItem({ menu: M, group: '4_state', order: 10, label: (c) => (A(c).enabled === false ? t('Enable') : t('Disable')), run: (c) => put(`/api/channels/adapters/${encodeURIComponent(A(c).id)}`, { enabled: A(c).enabled === false }) });
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

/** Sections a user folded — per page session (the panel is rebuilt on every
 *  engine pass; a fold must survive the rebuild, not the reload). */
const COLLAPSED = new Set();
/** Sections a user EXPLICITLY OPENED (overrides a default fold). */
const EXPANDED = new Set();
/** The archived-groups fold (per page session — a list the user asked to see). */
let ARCHIVED_OPEN = false;

// ── THE SECONDARY SECTIONS' FOLDS (g3): persisted in user state
// (`channelsPanelFolds`, PATCH merge-only, the jobsPanelFolds pattern) —
// loaded ONCE per page, kept in step with other clients by the
// `user-state-updated` broadcast. ──
let FOLDS = null;
let foldsWired = false;
/** Every live panel's `{c, draw}` — a fold another client made repaints them
 *  all; a panel no longer in the document is pruned at the next dispatch. */
const FOLD_LISTENERS = new Set();
async function loadFolds(app) {
  if (!foldsWired) {
    foldsWired = true;
    app.ws.onGlobal((msg) => { if (msg.type === 'user-state-updated' && msg.state && msg.state.channelsPanelFolds) { FOLDS = foldsFrom(msg.state); for (const l of [...FOLD_LISTENERS]) { if (!l.c.isConnected) { FOLD_LISTENERS.delete(l); continue; } try { l.draw(); } catch {} } } });
  }
  if (FOLDS) return FOLDS;
  const st = await fetchJson('/api/user-state');
  FOLDS = foldsFrom(st && !st.error ? st : {});
  return FOLDS;
}
function setFold(part, folded) {
  FOLDS = { ...(FOLDS || {}), [part]: !!folded };
  fetch('/api/user-state', { method: 'PATCH', headers: JSON_HDR, body: JSON.stringify({ channelsPanelFolds: FOLDS }) }).catch(() => {});
}

/** A row's time: HH:MM today, "Yesterday", else the date in the DEVICE's language. */
function rowTime(ms, now = Date.now()) {
  if (!ms) return '';
  const d = new Date(ms), n = new Date(now);
  if (d.toDateString() === n.toDateString()) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === new Date(now - 86400e3).toDateString()) return t('Yesterday');
  try { return d.toLocaleDateString(deviceLocale(), { month: 'short', day: 'numeric' }); } catch { return ''; }
}

/** THE GROUP ROW's menu (a group, not a channel conversation — its verbs are
 *  the group's own; a channel row keeps the `channel-row` contributions). */
function groupMenu(app, g) {
  const items = [{ label: t('Open'), action: () => app.openChannel(GROUP_ADAPTER_ID, g.id) }];
  items.push({ label: t('Members & notifications…'), action: () => showGroupDetail(app, g) });
  if (!g.archivedAt) {
    if (!(g.pair && g.pair.length)) items.push({ label: t('Invite…'), action: () => showGroupMembersDialog(app, { group: g }) });
    items.push({ separator: true });
    items.push({ label: t('Rename…'), action: () => renameGroup(g) });
    items.push({ label: t('Archive'), action: () => archiveGroup(g) });
  }
  return items;
}

/**
 * Render the rail panel into `c`. THE FIRST SCREEN IS THE GROUP LIST (design
 * §22, the owner's IM model): every agent group and every TRACKED conversation
 * of a connected account in ONE list sorted by last activity — row = glyph +
 * name + time / source chip + last line + unread. The accounts (connect,
 * re-authorize, the per-account conversation rows with Track / Assign /
 * Reach) and the MESSAGE WATCHER (the built-in agents-as-sources section) are
 * SECONDARY sections below, each folded by the user and the fold persisted.
 *
 * Renders ONCE per tab entry (the rail's renders-once guard) and repaints IN
 * PLACE from the two broadcasts — `channels-updated` carries the recomputed
 * digest, `channel-groups-updated` the recomputed group list — so a repaint
 * costs no fetch (the cache-invalidation law: one dirty signal, one computation).
 */
export function renderChannelsPanel(app, c) {
  const bar = document.createElement('div');
  bar.className = 'chan-bar';
  const summary = document.createElement('div');
  summary.className = 'chan-summary';
  bar.appendChild(summary);
  // g3: "New group" — the owner's explicit act (D1: a group exists only by an action)
  const newBtn = btn('', () => showGroupMembersDialog(app), 'chan-newgroup-btn');
  newBtn.dataset.newGroup = '1';
  newBtn.title = t('New group — pick live agent sessions to talk with');
  const newLabel = document.createElement('span');
  newLabel.className = 'chan-newgroup-label';
  newLabel.textContent = t('New group');
  newBtn.append(icon('plus', 12), newLabel);
  bar.appendChild(newBtn);
  // P3: the Outbox entry point, with the awaiting count from the digest.
  const outboxBtn = btn('', () => app.openChannelOutbox(), 'chan-outbox-btn');
  outboxBtn.dataset.outboxButton = '1';
  const outboxLabel = document.createElement('span');
  outboxLabel.className = 'chan-outbox-label';
  outboxLabel.textContent = t('Outbox');
  const outboxCount = document.createElement('span');
  outboxCount.className = 'chan-outbox-count';
  // the glyph carries the button where the label cannot fit (MEASURED: the
  // 260px sidebar leaves 172px for the bar; the summary + the word do not both fit)
  outboxBtn.append(icon('outbox', 12), outboxLabel);
  bar.appendChild(outboxBtn);
  const root = document.createElement('div');
  root.className = 'chan-list';
  c.append(bar, root);

  /** The two inputs the list is drawn from — each replaced whole by its own broadcast. */
  let digest = null, groups = null;

  /** The nearest scroll container above the list (the rail's `#all-sessions-list`,
   *  a window's content) — the thing whose scrollTop a repaint must not move. */
  function scrollerOf() {
    for (let n = root.parentElement; n; n = n.parentElement) {
      if (n === document.body) return null;
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return null;
  }

  /** REPAINT IN PLACE (a1 D12): the new tree is built into a fragment and
   *  swapped in with ONE `replaceChildren` — the scroller never sees an empty
   *  list, so its scrollTop is restored exactly where the user left it, the
   *  module-level fold sets keep every collapsed section, and nothing is
   *  fetched (the digest / the group list on the broadcast IS the computation). */
  function draw() {
    if (!c.isConnected) return;
    const scroller = scrollerOf();
    const keep = scroller ? scroller.scrollTop : 0;
    const frag = document.createDocumentFragment();
    build(frag, digest || {});
    root.replaceChildren(frag);
    if (scroller && scroller.scrollTop !== keep) scroller.scrollTop = keep;
  }

  /** A SECONDARY section (Accounts / Message watcher): a fold head + a body;
   *  the fold is the user's, persisted (`channelsPanelFolds`). */
  function part(key, label, countText, fill) {
    const p = document.createElement('div');
    const folded = !!(FOLDS && FOLDS[key]);
    p.className = 'chan-part' + (folded ? ' chan-part-collapsed' : '');
    p.dataset.part = key;
    const h = document.createElement('div');
    h.className = 'chan-part-head';
    h.appendChild(icon('chevronDown', 10, 'chan-part-chev'));
    const nm = document.createElement('span');
    nm.className = 'chan-part-name';
    nm.textContent = label;
    h.appendChild(nm);
    if (countText) { const n = document.createElement('span'); n.className = 'chan-part-count'; n.textContent = countText; h.appendChild(n); }
    h.onclick = () => { const now = !p.classList.contains('chan-part-collapsed'); p.classList.toggle('chan-part-collapsed', now); setFold(key, now); };
    p.appendChild(h);
    const b = document.createElement('div');
    b.className = 'chan-part-body';
    fill(b);
    p.appendChild(b);
    return p;
  }

  function build(into, d) {
    const adapters = (d && d.adapters) || [];
    const convs = (d && d.conversations) || [];
    const available = (d && d.available) || [];
    const { rows, archived } = groupListRows({ groups: groups || [], conversations: convs, adapters });
    const unreadTotal = rows.reduce((s, r) => s + (r.unread || 0), 0);
    summary.textContent = rows.length ? t('{n} groups · {k} unread', { n: rows.length, k: unreadTotal }) : t('No groups yet');
    const awaiting = Number(d && d.awaitingTotal) || 0;
    outboxCount.textContent = String(awaiting);
    if (awaiting) { if (!outboxCount.isConnected) outboxBtn.appendChild(outboxCount); } else outboxCount.remove();
    outboxBtn.classList.toggle('chan-outbox-attn', awaiting > 0);
    outboxBtn.title = awaiting ? t('Outbox ({n} awaiting)', { n: awaiting }) : t('Outbox');

    // r3: a store file set aside (or BLOCKED) at boot is said HERE, on the
    // first screen — accounts that vanished with an unreadable adapters.json
    // were otherwise unexplained unless the For-you inbox was opened
    for (const q of (d && d.quarantined) || []) {
      const text = q.blocked
        ? t('{file} could not be read and could NOT be set aside — changes to it are refused until it is fixed or moved', { file: q.file })
        : q.file === 'adapters.json'
          ? t('{file} could not be read — set aside as {to}; your accounts were reset, reconnect them', { file: q.file, to: q.to })
          : t('{file} could not be read — set aside as {to}; that store started empty', { file: q.file, to: q.to });
      into.appendChild(noteLine('chan-quarantine-note', text, { warn: true }));
    }

    // ── THE FIRST SCREEN: the group list ──
    const list = document.createElement('div');
    list.className = 'chan-groups';
    if (!rows.length) {
      list.appendChild(chanLine('empty-hint chan-groups-empty', t('No groups yet. "New group" starts one with live agent sessions; an agent can too (vibespace-msg group create). A conversation you track in an account below appears here as well.')));
    }
    for (const r of rows) list.appendChild(groupRow(r));
    if (archived.length) {
      const tog = document.createElement('div');
      tog.className = 'chan-archived-toggle' + (ARCHIVED_OPEN ? ' chan-archived-open' : '');
      tog.appendChild(icon('chevronDown', 9, 'chan-part-chev'));
      tog.appendChild(chanLine('chan-archived-label', t('Archived groups ({n})', { n: archived.length })));
      tog.onclick = () => { ARCHIVED_OPEN = !ARCHIVED_OPEN; draw(); };
      list.appendChild(tog);
      if (ARCHIVED_OPEN) for (const r of archived) list.appendChild(groupRow(r));
    }
    into.appendChild(list);

    // ── SECONDARY: the accounts (every non-built-in adapter + Connect) ──
    const accounts = adapters.filter((a) => !a.builtin);
    const watcher = adapters.filter((a) => a.builtin);
    // THE ACCOUNT MODEL: how many accounts each kind holds (a lone one keeps
    // the kind's label; further ones are numbered in record order until the
    // token names them) and which is the n-th
    const siblings = new Map();
    const ordinal = new Map();
    for (const a of adapters) { const n = (siblings.get(a.kind) || 0) + 1; siblings.set(a.kind, n); ordinal.set(a.id, n); }
    into.appendChild(part('accounts', t('Accounts'), accounts.length ? String(accounts.length) : '', (b) => {
      if (!accounts.length && !available.length) b.appendChild(chanLine('empty-hint empty-hint-inline', t('No account connected.')));
      for (const a of accounts) b.appendChild(section(a, convs.filter((x) => x.adapterId === a.id), siblings, ordinal));
      // The kinds a user may still CONNECT — one full-width button each, worded
      // by the credential facts the digest carries (§10.1's three copy paths).
      if (available.length) {
        const blk = document.createElement('div');
        blk.className = 'chan-sec chan-connect';
        const h = document.createElement('div');
        h.className = 'chan-sec-head';
        const nm = document.createElement('span');
        nm.className = 'chan-sec-name';
        nm.textContent = t('Connect');
        h.appendChild(nm);
        blk.appendChild(h);
        for (const av of available) blk.appendChild(connectRow(app, av));
        b.appendChild(blk);
      }
    }));
    // ── SECONDARY: the message watcher (agents as SOURCES: track / assign / filter) ──
    if (watcher.length) {
      into.appendChild(part('watcher', t('Message watcher'), '', (b) => {
        b.appendChild(chanLine('chan-part-note', t('Follow a live agent session as a source: track it, then assign or filter it for another agent. To talk WITH agents, use a group.')));
        for (const a of watcher) b.appendChild(section(a, convs.filter((x) => x.adapterId === a.id), siblings, ordinal));
      }));
    }
  }

  /** ONE row of the first screen: an agent group or a tracked conversation. */
  function groupRow(r) {
    const el = document.createElement('div');
    el.className = 'chan-grow' + (r.unread ? ' chan-grow-unread-on' : '') + (r.archived ? ' chan-grow-archived' : '');
    el.dataset.grow = r.key;
    el.dataset.at = String(r.lastAt || 0);   // the activity instant the list is ordered by
    if (r.kind === 'group') el.dataset.group = r.id;
    const line = document.createElement('div');
    line.className = 'chan-grow-line';
    line.appendChild(icon(r.kind === 'group' ? 'users' : r.mail ? 'mail' : 'chat', 12, 'chan-grow-ic'));
    const title = document.createElement('span');
    title.className = 'chan-grow-title';
    title.textContent = r.title;
    title.title = r.title;
    line.appendChild(title);
    const at = document.createElement('span');
    at.className = 'chan-grow-at';
    at.textContent = rowTime(r.lastAt);
    if (r.lastAt) at.title = new Date(r.lastAt).toLocaleString(deviceLocale());
    line.appendChild(at);
    el.appendChild(line);
    const sub = document.createElement('div');
    sub.className = 'chan-grow-sub';
    const src = document.createElement('span');
    src.className = 'chan-src-chip';
    src.textContent = r.kind === 'group' ? (r.pair ? t('Direct') : t('Agents')) : r.sourceLabel;
    src.title = r.kind === 'group' ? (r.pair ? t('A direct conversation between two agents') : t('An agent group · {n} members', { n: r.memberCount })) : t('From your {label} account', { label: r.sourceLabel });
    sub.appendChild(src);
    const last = document.createElement('span');
    last.className = 'chan-grow-last';
    last.textContent = r.lastText || '';
    sub.appendChild(last);
    if (r.unread) {
      const u = document.createElement('span');
      u.className = 'chan-grow-unread';
      u.textContent = String(r.unread);
      u.title = t('{n} unread', { n: r.unread });
      sub.appendChild(u);
    }
    el.appendChild(sub);
    el.onclick = () => app.openChannel(r.adapterId, r.id);
    el.oncontextmenu = (ev) => {
      ev.preventDefault();
      if (r.kind === 'group') showContextMenu(ev.clientX, ev.clientY, groupMenu(app, r.group));
      else showContextMenu(ev.clientX, ev.clientY, menuItems('channel-row', rowMenuCtx(app, r.conv)));
    };
    return el;
  }

  /** One ADAPTER section (an account, or the built-in agents source). */
  function section(a, mine, siblings, ordinal) {
    const sec = document.createElement('div');
    sec.dataset.adapter = a.id;
    // The built-in Agents adapter lists every live session on this instance —
    // a list the sidebar already shows. Until one of them is tracked it is
    // folded by default (owner 2026-09-21: "展示一堆agents意义不明"), and a
    // caption says what tracking means; an explicit open/close survives repaints.
    const builtinAgents = !!a.builtin;
    const nothingTracked = mine.length > 0 && !mine.some((x) => x.tracked);
    const folded = EXPANDED.has(a.id) ? false : (COLLAPSED.has(a.id) || (builtinAgents && nothingTracked));
    sec.className = 'chan-sec' + (folded ? ' chan-collapsed' : '');
    const h = document.createElement('div');
    h.className = 'chan-sec-head folder-header';
    h.appendChild(icon('chevronDown', 10, 'chan-sec-chev'));
    h.appendChild(icon(kindGlyph(a, mine), 13, 'chan-sec-kind'));
    const nm = document.createElement('b');
    nm.className = 'chan-sec-name';
    const kindCount = siblings.get(a.kind) || 1;
    const name = accountName(a, kindCount, ordinal.get(a.id) || 1);
    nm.textContent = name;
    // under a 180px container the name hides and the glyph + count stand for it; the tooltip keeps the kind beside the account
    h.title = name === (a.label || a.id) ? name : `${a.label || a.id} · ${name}`;
    h.appendChild(nm);
    // the credential chip: WHICH application credential this account is
    // bound to — drawn only where it disambiguates (the kind holds several
    // accounts, or the integration offers several credentials)
    if (a.credentialKey && (kindCount > 1 || (Array.isArray(a.credentials) && a.credentials.length > 1))) {
      const cc = document.createElement('span');
      cc.className = 'chan-chip chan-cred-chip';
      cc.textContent = credentialText(a.credentialKey, a.credentialLabel);
      cc.title = t('Authorized under this application credential — it stays bound to this account.');
      h.appendChild(cc);
    }
    const dot = document.createElement('span');
    dot.className = 'chan-dot chan-dot-' + adapterDot(a);
    dot.title = dotTitle(a);
    h.appendChild(dot);
    const cnt = document.createElement('span');
    cnt.className = 'chan-sec-count';
    cnt.textContent = `${mine.filter((x) => x.tracked).length}/${mine.length}`;
    cnt.title = t('{k} tracked of {n}', { k: mine.filter((x) => x.tracked).length, n: mine.length });
    h.appendChild(cnt);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'icon-btn chan-sec-more';
    more.title = t('More actions');
    more.appendChild(icon('more', 13));
    const openMenu = (x, y) => showContextMenu(x, y, menuItems('channel-adapter', { app, adapter: a, convs: mine }));
    more.onclick = (ev) => { ev.stopPropagation(); const r = more.getBoundingClientRect(); openMenu(r.left, r.bottom + 2); };
    h.appendChild(more);
    h.onclick = () => {
      const nowFolded = !sec.classList.contains('chan-collapsed');
      sec.classList.toggle('chan-collapsed', nowFolded);
      if (nowFolded) { COLLAPSED.add(a.id); EXPANDED.delete(a.id); } else { COLLAPSED.delete(a.id); EXPANDED.add(a.id); }
    };
    h.oncontextmenu = (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY); };
    sec.appendChild(h);
    if (builtinAgents) {
      const note = document.createElement('div');
      note.className = 'chan-sec-note';
      note.textContent = nothingTracked
        ? t('Your live agent sessions on this instance — the same list as the sidebar. Track one to follow its messages here; an untracked row fetches nothing.')
        : t('Your live agent sessions on this instance. Tracked ones are followed here; an untracked row fetches nothing.');
      sec.appendChild(note);
    }
    // the status line(s) — only when there is something to say (a1 D1/D6)
    for (const n of adapterNotes(app, a)) sec.appendChild(n);
    const rows = document.createElement('div');
    rows.className = 'chan-rows';
    if (!mine.length) {
      const e = document.createElement('div');
      e.className = 'empty-hint empty-hint-inline chan-sec-empty';
      e.textContent = t('No conversations discovered yet.');
      rows.appendChild(e);
    }
    for (const conv of mine) rows.appendChild(row(conv));
    sec.appendChild(rows);
    return sec;
  }

  function row(conv) {
    const el = document.createElement('div');
    el.className = 'chan-row session-item-card' + (conv.tracked ? ' chan-tracked' : '');
    el.dataset.conv = `${conv.adapterId}/${conv.id}`;
    // line 1: the title + ONE freshness pill (the honesty contract)
    const line = document.createElement('div');
    line.className = 'chan-row-line';
    const title = document.createElement('span');
    title.className = 'chan-row-title';
    title.textContent = conv.title || conv.id;
    // the 172px default rail truncates a long title; the tooltip keeps it readable — and
    // carries the freshness sentence, which the ≤180px container hides as a pill
    const fresh = conv.tracked ? (chanCaps.freshnessText(conv.freshness || {}, { t }) || t('unknown')) : '';
    title.title = fresh ? `${conv.title || conv.id} — ${fresh}` : (conv.title || conv.id);
    line.appendChild(title);
    // the ONE freshness pill, on a TRACKED row only (§4.3: an untracked row has
    // no evidence to claim; its `not tracked` text is the claim)
    if (conv.tracked) line.appendChild(chip(conv.freshness));
    el.appendChild(line);
    // line 2: participants + the needs-you badges (right)
    const sub = document.createElement('div');
    sub.className = 'chan-row-sub';
    const who = document.createElement('span');
    who.className = 'chan-row-who';
    who.textContent = conv.participants || '';
    sub.appendChild(who);
    const awaiting = conv.tracked && conv.outbox && conv.outbox.awaiting ? Number(conv.outbox.awaiting) : 0;
    const unread = conv.tracked && conv.unread ? Number(conv.unread) : 0;
    if (!conv.tracked) {
      const u = document.createElement('span');
      u.className = 'chan-untracked';
      u.textContent = t('not tracked');
      u.title = t('Nothing is fetched for this conversation until you track it.');
      sub.appendChild(u);
    }
    // P3: proposals awaiting approval on this row — the badge the pointer
    // degrades to when the inbox refuses the item (§9.2).
    if (awaiting) {
      const o = document.createElement('span');
      o.className = 'chan-awaiting';
      o.appendChild(icon('check', 9));
      const n = document.createElement('span');
      n.textContent = String(awaiting);
      o.appendChild(n);
      o.title = t('{n} to approve', { n: awaiting }) + ' — ' + t('Proposals awaiting your approval — open the conversation or the Outbox.');
      sub.appendChild(o);
    }
    if (unread) {
      const b = document.createElement('span');
      b.className = 'chan-unread';
      b.textContent = String(unread);
      b.title = t('{n} unread', { n: unread });
      sub.appendChild(b);
    }
    if (awaiting || unread) {
      // the narrow rail's ONE pill (the container query flips it in)
      const needs = document.createElement('span');
      needs.className = 'chan-row-needs';
      needs.textContent = String(awaiting + unread);
      needs.title = [awaiting ? t('{n} to approve', { n: awaiting }) : '', unread ? t('{n} unread', { n: unread }) : ''].filter(Boolean).join(' · ');
      sub.appendChild(needs);
    }
    el.appendChild(sub);
    // line 3 (P2): the assignment as it READS (authority clamped) + the
    // measurement beside it; a held/stashed last wake says so in amber.
    if (conv.assignment) {
      const asg = document.createElement('div');
      const held = !!(conv.stats && conv.stats.lastWake && conv.stats.lastWake.ok === false);
      asg.className = 'chan-row-assign' + (held ? ' chan-warn' : '');
      asg.appendChild(icon('filter', 10));   // the glyph is an SVG (§17) — the sentence used to start with a '→'
      const asgText = document.createElement('span');
      asgText.textContent = assignmentSummary(conv) + (held ? ' · ' + t('last wake held') : '');
      asg.appendChild(asgText);
      // the held wake's `refused` is a CODE (worded); its `why` is the ladder's own sentence (the fallback)
      asg.title = held ? t('Last wake was held or stashed: {why}', { why: chanCaps.wakeRefusalText(conv.stats.lastWake.refused, { t }) || conv.stats.lastWake.why || '' }) : assignmentSummary(conv);
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
    const [d, g] = await Promise.all([fetchJson('/api/channels'), fetchJson('/api/channel-groups'), loadFolds(app)]);
    if (!c.isConnected) return;
    if (d && d.error) { root.textContent = ''; const e = document.createElement('div'); e.className = 'empty-hint'; e.textContent = d.error; root.appendChild(e); return; }
    digest = d;
    // a refused group list is an EMPTY list plus a toast — the channel half still draws
    if (g && !g.error) groups = Array.isArray(g.groups) ? g.groups : [];
    else { groups = []; if (g && g.code !== 'unavailable') showToast(groupErrorText(g), { type: 'error' }); }
    draw();
  }

  // THE HANDLER IS HELD IN A NAMED CONST AND REMOVED BY NAME (r2) — see the
  // same note in channel-window.js, including the measurement: the
  // load-bearing half is `onGlobal` returning its own unsubscribe, and this
  // form is the belt. `off?.()` on the result of `onGlobal` was a no-op while
  // that method returned undefined, so every rail repaint left another live
  // handler behind.
  //
  // TWO BROADCASTS, EACH CARRYING ITS OWN RECOMPUTED HALF (g3): the digest on
  // `channels-updated`, the group list on `channel-groups-updated` — neither
  // repaint fetches (test-channels-e2e ⑬ counts the /api/channels fetches).
  const onBroadcast = (msg) => {
    if (!c.isConnected) return;
    if (msg.type === 'channel-groups-updated') {
      if (!Array.isArray(msg.groups) || digest === null) return;   // the first paint is refresh()'s
      groups = msg.groups;
      draw();
      return;
    }
    if (msg.type !== 'channels-updated') return;
    if (msg.digest) { digest = msg.digest; if (groups !== null) draw(); } else refresh().catch(() => {});
  };
  app.ws.onGlobal(onBroadcast);
  const foldListener = { c, draw };
  FOLD_LISTENERS.add(foldListener);
  refresh().catch(() => {});
  return () => { FOLD_LISTENERS.delete(foldListener); try { app.ws.offGlobal(onBroadcast); } catch {} };
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
registerChannelAdapterMenu();
registerChannelsGearRow();
