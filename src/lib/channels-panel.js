// THE CHANNELS PANEL (docs/design-communication-panel.zh.md §10; the a4 UI
// design docs/design-communication-panel-ui.md §4 — direction A, the Folders /
// Tasks idiom).
//
// The sidebar rail's `channels` panel: a bar (summary + the Outbox button
// carrying the awaiting count), one collapsible `folder-header` section per
// adapter (chevron · kind glyph · name · a 6px STATE DOT · conversations · ⋯),
// a status line ONLY when the adapter has something to say beyond
// "connected" (not connected / needs re-authorization / a re-authorization
// due within 7 days / disabled / failing / a withdrawn push claim), and the
// conversations as bordered `session-item-card` rows on ONE grid: line 1 =
// title + ONE freshness pill, line 2 = participants + the needs-you badges
// (awaiting outline pill, unread accent count), line 3 only when assigned.
// Every adapter VERB lives in the ⋯ menu (a `channel-adapter` contribution
// menu) — the a1 audit measured the verbs at 47–59 % of the panel's height.
//
// ON EVERY ROW A FRESHNESS CHIP. That chip is not decoration — it is this
// feature's honesty contract. A row says how often its evidence is gathered
// ("live" / "within 30s" / "4m ago" / "paused"), because
// that is the one number a user needs before handing something to a lane.
// Since 2026-09-26 a linked account is an AGGREGATED IM: there is no track
// step, every conversation is fetched on its own cadence (hot / warm / cold
// by activity, or the owner's "Refresh every ▸" override), and the chip IS
// that cadence. The CLAIM comes from the server's `freshnessClaim`, which resolves
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
import { fetchJson, showContextMenu, showToast, createModalShell, showConfirmDialog, escHtml } from './utils.js';
import { t, deviceLocale } from './i18n.js';
import { registerMenuItem, menuItems } from './contributions.js';
import { registerWindowType } from './window-types.js';
import { UI_ICONS } from './icons.js';
// the shared chrome primitives (one SVG helper, one textContent element, one house button)
import { icon, btn, noteLine, el as chanEl, convAvatar, accountBadge, warmAvatars } from './channel-chrome.js';
// lane channels-badges: ONE badge per account — the rows' corner and the account card's icon read the same record
import { accountBadges, INTERNAL_BADGE } from './channel-avatar.js';
// PURE, bundled directly (the task-color-seq / quota-model pattern). THE
// SENTENCE IS COMPOSED HERE (r2): `freshnessClaim` used to build it server
// side with no translator, so the chip this feature calls its honesty
// contract shipped ENGLISH-ONLY to a zh/ja UI — and the server cannot fix
// that, because the digest is broadcast to every client at once while the
// language is per DEVICE (localStorage).
import * as chanCaps from '../channel-caps.js';
import * as SR from '../channel-search.js';   // design 010 (PURE): coverage + the vendor tier's words
import { renderAroundRows } from './channel-window.js';   // design 010: the window's own row renderer, for the around sheet
// PURE, bundled: the credential `whyCode` → words (a3 i18n; the registry is
// already in the bundle for the Integrations window).
import * as R from '../integration-registry.js';
// a3 i18n: a route failure is worded by its CODE here, never by the engine's sentence.
import { routeErrorText, groupErrorText, statusTagParts, viewSwitchText } from './channel-words.js';
// g3 (design §22): the IM-first list's arithmetic and the group dialogs.
import { groupListRows, foldsFrom, GROUP_ADAPTER_ID, firstScreen, statusTag, filterRows, internalBlock } from './channel-groups-view.js';
// design 008 (B-3cf8): the rows this panel HOLDS — the first read + every page read, keyed (PURE)
import { createRowStore, applyFirst, applyPage, applyBroadcast, listRows, focusRowsOf, ensureList, pageQueryOf, accountList } from './channel-rows.js';
import { afterCursor, PAGE_MAX } from '../channel-focus.js';
import { clearedText } from './record-clear-ui.js'; // "Clear content…" (2026-09-28): a group row's cleared last line
import { showGroupMembersDialog, showGroupDetail, renameGroup, archiveGroup } from './channel-group-dialogs.js';
// R4: access and notification — two operations (Grant access… / Notify…),
// the grain menu, and the one-line summary a row draws.
import { showGrantAccessDialog, showNotifyDialog, showGrainMenu, assignmentSummary } from './channel-filter-editor.js';
import { grainSummaryText } from './channel-words.js';
// P3: the reach/policy dialog (row menu) and the Outbox window (header button).
import { showReachDialog } from './channel-reach-editor.js';
import { showApiAccessDialog } from './channel-api-dialog.js';   // B-2198
import './channel-outbox.js';
// r4 (design-integrations-per-account, chunk 3): the account dialogs — every
// one the storage dialog component (src/lib/mounts-dialog.js, D1)
import { showConnectAccountDialog, showReauthAccountDialog, showEditAccountDialog, showDuplicateAccountDialog, removeAccount, accountName, clientChipText, providerOf } from './channel-account-dialogs.js';

/** A short, honest freshness chip. The server sends `{kind, state, seconds}`
 *  and `freshnessText` turns it into words: a claim whose `state` we do not
 *  recognise says `unknown` rather than inventing a number. ONE neutral pill
 *  for every age; green only for positive live evidence; dimmer when nothing
 *  is being gathered (`off` / `never`). */
function chip(freshness) {
  const el = document.createElement('span');
  const f = freshness || {};
  el.className = 'chan-chip' + (f.kind === 'live' ? ' chan-chip-live' : (f.state === 'off' || f.state === 'never') ? ' chan-chip-off' : '');
  el.textContent = chanCaps.freshnessText(f, { t, short: true }) || t('unknown');
  el.title = `${chanCaps.freshnessText(f, { t }) || t('unknown')} — ${t('How fresh this row is — the lane actually carrying it, not the one the adapter declares.')}`;
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
// The account card, the search, options, push. Every control reads a
// FACT the digest carries (`kinds[]`, `adapter.auth`, `adapter.credential`,
// `adapter.flow`, `adapter.presets`, `adapter.optionsSchema`) — nothing here
// branches on an adapter's kind (the contract suite's census), and every
// string a vendor or a peer could influence goes through textContent. The
// connect / re-authorize / edit / duplicate / remove DIALOGS are
// channel-account-dialogs.js (r4: the storage dialog component; the pre-r4
// wizard — its credential step, its stepper, its own flow dialog — is gone).

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
// ── THE ACCOUNT CARD (docs/design-integrations-per-account.zh.md r4 §2.5,
// §8.1 #1 / #3 / #6 / #7 / #10; lane integrations chunk 3). A section whose
// adapter is CONNECTABLE (`connectable` — a Lark / Gmail account, never the
// built-in watcher or a scan-only fixture) is drawn in the storage row's
// grammar, credential-first: the login IS the card — its dot, its client
// chip, a HEALTH line in the storage detail-line grammar (`[Gmail] Connected
// · Inbox · polling · N conversations · M unread · last sync <ago>`), and, when the sign-in died,
// the storage `.mounts-errline` with the mounts' auth-death sentence
// VERBATIM + the channel's why code in brackets (D8) and the primary
// `Re-authorize {provider}…` button. Its CHILDREN are ALL its conversations,
// as ↳ rows (the storage child-row grammar; 2026-09-26: an aggregated IM, no
// Track… step, the newest first and the rest behind "Show all"). Every
// dialog is the storage dialog component (channel-account-dialogs.js).
// Nothing here branches on a kind: the facts are the digest's.

/** The card's dot (§8.1 #1): connected → ok, the sign-in died → bad, no
 *  usable client → warn, never signed in / disabled → idle; a consent in
 *  flight → attn; a connected account failing its passes → warn. (Since
 *  2026-09-26 there is no "login only" state: a connected account fetches
 *  every conversation.) */
function accountDot(a) {
  const auth = a.auth || { state: 'unknown' };
  if (a.enabled === false) return 'idle';
  if (a.flow && a.flow.running) return 'attn';
  if (auth.state === 'connected') return a.consecutiveFailures >= 3 ? 'warn' : 'ok';
  if (auth.state === 'expired') return 'bad';
  if (auth.state === 'needs-credentials') return 'warn';
  return 'idle';
}
/** "{n} min ago" in the device's words (the keys the Usage window reads). */
function agoText(ms, now = Date.now()) {
  const s = Math.max(0, (now - Number(ms)) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 60) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 86400) return t('{n} h ago', { n: Math.round(s / 3600) });
  return t('{n} d ago', { n: Math.round(s / 86400) });
}
/** The HEALTH line (the storage row's detail line): `[type tag] words`. */
function healthLine(a, text, { warn = false, verbs = [] } = {}) {
  const line = document.createElement('div');
  line.className = 'chan-sec-health' + (warn ? ' chan-warn' : '');
  const tag = document.createElement('span');
  tag.className = 'mounts-typetag';
  tag.textContent = providerOf(a);
  const s = document.createElement('span');
  s.className = 'chan-sec-health-text';
  s.textContent = text;
  line.append(tag, s);
  for (const v of verbs) { v.classList.add('chan-sec-verb'); line.appendChild(v); }
  return line;
}
/** The storage error line: `Couldn’t connect: <sentence>` + (auth death) the button. */
function errLine(app, a, sentence, kinds) {
  const err = document.createElement('div');
  err.className = 'mounts-errline';
  err.textContent = t('Couldn’t connect:') + ' ' + sentence;
  err.title = sentence;
  const fix = document.createElement('button');
  fix.type = 'button';
  fix.className = 'mounts-btn mounts-btn-primary mounts-reauth-btn';
  fix.textContent = t('Re-authorize {provider}…', { provider: providerOf(a) });
  fix.onclick = (e) => { e.stopPropagation(); showReauthAccountDialog(app, a, { kinds }); };
  err.appendChild(fix);
  return err;
}
/** THE LINES UNDER AN ACCOUNT'S HEAD — the health line when it is well, the
 *  error line + button when its sign-in died or its client is gone, a
 *  consent in flight, the countdown to a due re-authorization, a failing
 *  lane. Returns zero or more elements. */
function accountLines(app, a, kinds) {
  const out = [];
  const auth = a.auth || { state: 'unknown' };
  const provider = providerOf(a);
  const reauth = () => showReauthAccountDialog(app, a, { kinds });
  if (a.enabled === false) {
    const n = noteLine('chan-sec-note', t('disabled'));
    const v = btn(t('Enable'), () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { enabled: true }));
    v.classList.add('chan-sec-verb'); n.appendChild(v);
    out.push(n);
    return out;
  }
  if (a.flow && a.flow.running) {
    out.push(healthLine(a, t('Signing in…'), { verbs: [btn(t('Cancel'), () => post(`/api/channels/adapters/${encodeURIComponent(a.id)}/auth/cancel`, {}))] }));
  } else if (auth.state === 'connected') {
    // THE AGGREGATED IM's health line (2026-09-26): connected · the mailbox
    // scope (a declared choice's own words) · push or polling · N
    // conversations · M unread · last sync
    const bits = [t('Connected')];
    const f = (a.optionsSchema || [])[0];
    if (f && Array.isArray(f.choices) && f.choiceLabels) { const v = (a.options && a.options[f.key]) || f.default; if (v && f.choiceLabels[v]) bits.push(t(f.choiceLabels[v])); }
    else if (f && !(Array.isArray(f.choices) && f.choices.length)) { const v = (a.options && a.options[f.key]) || f.default; if (v) bits.push(String(v)); }
    const lane = a.lane || {};
    bits.push(lane.via === 'push' && lane.live ? (lane.carryContent ? t('push') : t('push + polling')) : t('polling'));
    const sc = a.scheduler || null;
    if (sc) { bits.push(t('{n} conversations', { n: sc.conversations })); if (sc.unread) bits.push(t('{n} unread', { n: sc.unread })); }
    // lane R5: the FIRST READ, how far and (at the account's per-second pace) how long
    const fr = sc ? chanCaps.firstReadText(sc, { t }) : '';
    if (fr) bits.push(fr);
    // "last sync" = the last GOOD pass; a failure is said on its own line
    // from the FIRST one, with the retry (lane R2 verify, 2026-09-26)
    const ps = chanCaps.passStateText(a, { t, now: Date.now() });
    if (ps.lastOkAt) bits.push(t('last sync {ago}', { ago: agoText(ps.lastOkAt) }));
    const hl = healthLine(a, bits.join(' · '));
    // a refresh token that is RE-ISSUED at every automatic refresh (Lark) needs
    // no countdown while the instance runs — said here, on hover, once
    if (auth.renews) hl.title = t('The sign-in renews itself while this instance runs — re-authorize only if the instance is off for more than {days} days.', { days: Math.round((Number(auth.renewWindowMs) || 7 * 86400e3) / 86400e3) });
    out.push(hl);
    // owner ruling (2026-09-28): the HELD sign-in lacks the reactions read scope — "can be read after one Re-authorize",
    // or (the last consent was narrowed because the vendor refused it) the vendor's refusal BY NAME; one verb.
    // lane lark-search-poll (§5.3): ONE line for EVERY declared grant the sign-in lacks — an account predating both lanes
    // reads "One Re-authorize adds: reading reactions · new-message search and single chats" (a server before the grant
    // list sends only `reactionsGrant` — its own line, as before)
    const vendorW = a.vendor ? t(a.vendor) : (a.label || a.kind);
    const gl = Array.isArray(a.grants) ? chanCaps.grantsText(a.grants, { t, vendor: vendorW }) : { text: chanCaps.reactReadText(a.reactionsGrant, { t, vendor: vendorW }), warn: !!(a.reactionsGrant && a.reactionsGrant.refused && a.reactionsGrant.refused.length) };
    if (gl.text) {
      const n = noteLine('chan-sec-note', gl.text, { warn: gl.warn });
      n.dataset.chanRxRead = a.id;
      n.dataset.chanGrants = a.id;
      const v = btn(t('Re-authorize'), reauth); v.classList.add('chan-sec-verb'); n.appendChild(v);
      out.push(n);
    }
    // lane lark-search-poll: THE CHANGE FEED's line (its state, the measurement, a park by name) + the catch-up's count
    if (a.feed) {
      // lane lark-p2p: a back-off names its END on this device's clock face ("until 03:28")
      const clock = (ms) => { try { return new Date(ms).toLocaleTimeString(deviceLocale(), { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
      const fl = chanCaps.feedText(a.feed, { t, vendor: vendorW, now: Date.now(), clock });
      if (fl) {
        const n = noteLine('chan-sec-note', fl, { warn: a.feed.state === 'refused' || a.feed.state === 'demoted' || (a.feed.state === 'backoff' && a.feed.why === 'failed') });
        n.dataset.chanFeed = a.id;
        // U3's answer, said where it is asked: which message types the search did not find (the measurement's diagnostic)
        const mt = a.feed.counters && a.feed.counters.missedTypes ? Object.entries(a.feed.counters.missedTypes).filter(([, v]) => Number(v) > 0) : [];
        if (mt.length) n.title = t('Not found by the search: {types}', { types: mt.map(([k, v]) => `${k} ×${v}`).join(', ') });
        if (a.feed.state === 'refused' && a.feed.why === 'forbidden') { const v = btn(t('Re-authorize'), reauth); v.classList.add('chan-sec-verb'); n.appendChild(v); }
        out.push(n);
        // lane lark-p2p verify r1: the hits the search returned that this version could not read are SAID on the card, with
        // the fields — its own line below the feed's (it used to be the line's tooltip: invisible on a phone, unread on a
        // desktop, while a feed dropping 89 % of what it finds is a silent failure); the shape park's line says them itself
        const un = a.feed.state === 'refused' && a.feed.why === 'shape' ? '' : chanCaps.feedUnreadableText(a.feed, { t });
        if (un) { const u = noteLine('chan-sec-note', un); u.dataset.chanFeedUnreadable = a.id; out.push(u); }
        // lane lark-threads (A5): the thread measurement — does the search name threads, what the by-id reads found
        const th = chanCaps.feedThreadsText(a.feed, { t });
        if (th) { const u = noteLine('chan-sec-note', th); u.dataset.chanFeedThreads = a.id; out.push(u); }
      }
      const cl = chanCaps.feedCatchUpText(a.feed.catchUp, { t });
      if (cl) { const n = noteLine('chan-sec-note', cl); n.dataset.chanFeedCatchup = a.id; out.push(n); }
    }
    // design 012 (Slack S1): an account whose vendor's terms take the local copy with it says WHERE the copy lives and who
    // reads it (the owner's Q2: agents read what the person can see — the model provider is named); the setup report's
    // facts the person must know: the free plan's hidden history, the distributed-app history cap (an alarm)
    if (a.retention === 'purge-on-remove') { const n = noteLine('chan-sec-note', t('Stored on this server. Messages an agent reads are sent to that agent’s model provider (Anthropic for Claude, OpenAI for Codex) to answer, not for training. Removing the account deletes this copy.')); n.dataset.chanCopy = a.id; out.push(n); }
    const probes = a.setup && a.setup.probes ? a.setup.probes : null;
    if (probes && probes.planLimited === true) { const n = noteLine('chan-sec-note', t('Free plan: {vendor} hides messages older than 90 days.', { vendor: vendorW })); n.dataset.chanPlan = a.id; out.push(n); }
    if (probes && probes.historyTier === 'limited-15') out.push(noteLine('chan-sec-note', t('{vendor} serves this app only 15 messages a minute (the limit for an app shared outside its workspace) — make your own app from the Connect link in this workspace.', { vendor: vendorW }), { warn: true }));
    const left = Number(auth.expiresAt) - Date.now();
    const eta = auth.expiresAt ? reauthEta(auth.expiresAt) : null;
    // a sliding token shows its countdown only once renewals have STOPPED (<1 day left)
    if (eta && left < (auth.renews ? 86400e3 : REAUTH_SOON_MS)) {
      const n = noteLine('chan-sec-note', auth.renews ? t('renewals stopped — re-authorize in {eta}', { eta }) : t('re-authorize in {eta}', { eta }), { warn: left <= (auth.renews ? 86400e3 : 0) });
      const v = btn(t('Re-authorize'), reauth); v.classList.add('chan-sec-verb'); n.appendChild(v);
      out.push(n);
    }
    // the VENDOR BUDGET, said with its numbers while it is spent (§6.2)
    const bt = a.budget ? chanCaps.budgetText(a.budget, { t }) : '';
    if (bt) out.push(noteLine('chan-sec-note', bt, { warn: true }));
    // a failing pass BEFORE the third failure (the "For you" line below takes over from there)
    if (ps.note && !(a.consecutiveFailures >= 3)) out.push(noteLine('chan-sec-note', ps.note, { warn: true }));
  } else if (auth.state === 'expired') {
    // D8: the mounts' auth-death sentence VERBATIM (its nouns the channel's), the channel's why CODE in brackets
    out.push(errLine(app, a, `${t('connected but the sign-in has expired or been revoked — conversations come from cache while every fetch fails; re-authorize to fix')} (${auth.why || 'needs-reauth'})`, kinds));
  } else if (auth.state === 'needs-credentials') {
    const cred = a.credential || {};
    const why = R.credentialWhyText({ whyCode: cred.whyCode || auth.whyCode || null, whyParams: cred.whyParams || auth.whyParams || null }, { t }) || chanCaps.authWhyText('no-credentials', { t });
    out.push(errLine(app, a, `${t('no usable OAuth client')} — ${why}`, kinds));
  } else {
    out.push(healthLine(a, t('Not connected — sign in to fetch its conversations.'), { verbs: [btn(t('Connect'), reauth, 'mounts-btn-primary')] }));
  }
  if (a.lastAuthError && !(a.flow && a.flow.running)) out.push(noteLine('chan-sec-note', t('Last connect failed: {error}', { error: a.lastAuthError }), { warn: true }));
  if (a.consecutiveFailures >= 3 && a.lastPass && auth.state === 'connected') {
    const s = t('{n} failed passes ({code})', { n: a.consecutiveFailures, code: chanCaps.errorCodeText((a.lastPass && a.lastPass.code) || 'failed', { t }) });
    const retry = a.lastPass.ok === false ? chanCaps.passStateText(a, { t, now: Date.now() }).note : '';
    out.push(noteLine('chan-sec-note', s + (a.lastPass.error ? ` — ${a.lastPass.error}` : '') + (retry ? ` — ${retry}` : '') + (a.failureItem ? ` — ${t('a "For you" item was filed')}` : ''), { warn: true }));
  }
  if (a.push && (a.push.demotedAt || a.push.state === 'unavailable')) {
    // the lane's CODE worded as its remedy (2026-09-26: e.g. the Lark SDK is
    // not installed — the exact command, the console steps, "polled meanwhile")
    const n = noteLine('chan-sec-note', chanCaps.pushLaneText(a.push, a.lane, { t, now: Date.now() }), { warn: true });
    if (a.push.demotedAt) { const v = btn(t('Re-declare exclusive and retry'), () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { push: { claimedExclusive: 'exclusive' } })); v.classList.add('chan-sec-verb'); n.appendChild(v); }
    out.push(n);
  }
  return out;
}
/** The ⋯ item "Open conversation window": the account's most recently
 *  active conversation. */
function openConversationOf(app, convs) {
  const list = (convs || []).filter((c) => !c.unlisted).sort((x, y) => (y.lastAt || 0) - (x.lastAt || 0));
  if (list[0]) app.openChannel(list[0].adapterId, list[0].id);
}

/** SEARCH ONE ACCOUNT's messages (2026-09-26, design §6.5): the server reads
 *  the local logs asynchronously with a byte cap; a result opens its
 *  conversation. Every string is vendor text ⇒ textContent only. */
function showSearchDialog(app, a, { q: initial = '', convId = null, convTitle = '', group = false, hits: agentHits = null } = {}) {
  // R3 (§23): the first screen's filter hands its words to EVERY connected account's search (`a` = a list)
  const accounts = Array.isArray(a) ? a.filter(Boolean) : [a];
  // lane channel-search-view (.212): an AGENT'S search row opens here — pre-filled and run, scoped to its conversation
  // (`convId`; "Search all conversations" drops the scope), or unscoped and grouped by conversation (the card's tail)
  let scope = convId ? { convId: String(convId), title: String(convTitle || convId) } : null;
  const titleText = () => (scope ? t('Search: {q} — {conversation}', { q: initial, conversation: scope.title }) : scope === null && (convId || group) ? t('Search: {q}', { q: initial })
    : accounts.length === 1 ? t('Search messages — {label}', { label: accounts[0].label || accounts[0].id }) : t('Search messages…'));
  const { dialog, body, close } = createModalShell({ id: 'chan-search-dialog', title: titleText(), dialogClass: 'chan-dialog chan-search', escapeToClose: true });
  const row = document.createElement('div');
  row.className = 'chan-search-row';
  const input = document.createElement('input');
  input.type = 'search'; input.className = 'chan-opt-input'; input.placeholder = t('Words to find in this account\'s messages');
  input.spellcheck = false;
  const go = btn(t('Search'), null, 'mounts-btn-primary');
  row.append(input, go);
  if (scope) {
    const all = btn(t('Search all conversations'), () => { scope = null; all.remove(); const h = dialog.querySelector('h3'); if (h) h.textContent = titleText(); run(); });
    all.classList.add('chan-search-all');
    row.appendChild(all);
  }
  const status = chanLine('chan-flow-status', '');
  const list = document.createElement('div');
  list.className = 'chan-search-results';
  body.append(row, status, list);
  // design 010 (B-c9be): TWO SECTIONS — the saved copy at once ("Saved messages" + what it covered), then the vendor's
  // own search over its whole history on the SAME press ("Older messages — from Lark's search"), each hit marked "Not
  // saved here"; the end of section two loads its next page on scroll (a sentinel one screen ahead, a skeleton row —
  // the owner's rule: no "Show more"). Section two is built BELOW section one before anything lands: nothing in
  // section one ever moves. A press is the person's intent; typing, opening, the panel's filter box ask nothing.
  let gen = 0, observer = null;
  const aroundCache = new Map();   // the sheet's records, for the dialog's life (never stored)
  const vendorOf = (acc) => (acc.vendor ? t(acc.vendor) : (acc.label || acc.kind || acc.id));
  let curQ = '';
  // .212: the words a hit matched, MARKED — pieces by textContent, the mark a library element (PURE SR.matchParts)
  const markInto = (node, text) => { for (const p of SR.matchParts(text, curQ)) { if (!p.hit) { node.appendChild(document.createTextNode(p.text)); continue; } const m = document.createElement('mark'); m.className = 'chan-search-mark'; m.textContent = p.text; node.appendChild(m); } };
  const hitRow = (acc, head0, who0, text0, extra) => {
    const it = document.createElement('div');
    it.className = 'chan-search-hit';
    const head = document.createElement('div');
    head.className = 'chan-search-head';
    const ti = document.createElement('b'); ti.textContent = head0;
    const who = document.createElement('span'); who.className = 'chan-search-who'; who.textContent = who0;
    if (head0) head.appendChild(ti);   // .212: scoped / grouped — the conversation is said once, a hit is author · time · words
    head.appendChild(who);
    if (extra) head.appendChild(extra);
    const tx = document.createElement('div'); tx.className = 'chan-search-text'; markInto(tx, text0);
    it.append(head, tx);
    return it;
  };
  const section = (cls, words) => {
    const sec = document.createElement('div'); sec.className = 'chan-search-sec ' + cls;
    const h = document.createElement('div'); h.className = 'chan-search-sec-head'; h.textContent = words;
    const note = document.createElement('div'); note.className = 'chan-search-cov';
    const rows = document.createElement('div'); rows.className = 'chan-search-rows';
    sec.append(h, note, rows);
    list.appendChild(sec);
    return { sec, h, note, rows };
  };
  const openAround = async (acc, hit) => {
    const { body: sb, close: sclose } = createModalShell({ id: 'chan-around-sheet', title: t('Around this message'), dialogClass: 'chan-dialog chan-around', escapeToClose: true });
    const note = chanLine('chan-flow-status', t("This is {vendor}'s history — VibeSpace did not save it", { vendor: vendorOf(acc) }));
    // lane around-sheet-fix (the owner's 2026-10-03 screenshot: names cut at the left, the avatar ON the name and the first
    // line, a sideways scrollbar): the rows sit in THE WINDOW'S LIST CLASS — `.chanmsg` lays out against its gutter
    // (`--chan-gutter`, undefined outside it ⇒ the row's padding fell to 0 under a −6 px margin) and its padding (the outbox's way)
    const box = document.createElement('div'); box.className = 'chanwin-list chan-around-list';
    sb.append(note, box);
    if (hit.known) { const open = btn(t('Open the conversation'), () => { sclose(); close(); app.openChannel(acc.id, hit.convId); }, 'mounts-btn-primary'); open.classList.add('chan-around-open'); sb.appendChild(open); }
    const k = `${acc.id}\u0000${hit.convId}\u0000${hit.vendorId}`;
    let x = aroundCache.get(k);
    if (!x) {
      box.appendChild(chanLine('chan-search-cov', t('Loading the messages around it…')));
      x = await fetchJson(`/api/channels/${encodeURIComponent(acc.id)}/${encodeURIComponent(hit.convId)}/around?msg=${encodeURIComponent(hit.vendorId)}&at=${encodeURIComponent(hit.at)}`);
      if (x && x.ok) aroundCache.set(k, x);
    }
    box.textContent = '';
    if (!x || !x.ok) { box.appendChild(chanLine('chan-search-cov', x && x.code ? routeErrorText(x) : t('Could not read the messages around it'))); return; }
    for (const r of renderAroundRows(x.records || [], { focus: hit.vendorId })) box.appendChild(r);
    // the found row CENTRED IN THE LIST, vertically only (`scrollIntoView` also scrolls every ancestor, the page included)
    const f = box.querySelector('.chanmsg-found');
    if (f) { const br = box.getBoundingClientRect(), fr = f.getBoundingClientRect(); box.scrollTop += (fr.top - br.top - box.clientTop) - (box.clientHeight - fr.height) / 2; }
  };
  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) { status.textContent = t('Type at least 2 characters.'); return; }
    if (go.disabled) return;   // a held Enter key: one press at a time (the server's 2 s floor is the belt)
    const my = ++gen;
    const sc = scope;
    curQ = q;
    if (observer) { observer.disconnect(); observer = null; }
    go.disabled = true; status.textContent = t('Searching…');
    list.textContent = '';
    const s1 = section('chan-search-saved', t('Saved messages'));
    const answers = await Promise.all(accounts.map((acc) => fetchJson(`/api/channels/search?adapter=${encodeURIComponent(acc.id)}&q=${encodeURIComponent(q)}${sc ? `&conv=${encodeURIComponent(sc.convId)}` : ''}`).then((x) => ({ acc, x }))));
    if (my !== gen) return;
    go.disabled = false;
    const bad = answers.find(({ x }) => !x || x.error);
    if (bad && answers.every(({ x }) => !x || x.error)) { status.textContent = routeErrorText(bad.x); return; }
    const r = { truncated: answers.some(({ x }) => x && x.truncated), results: [] };
    const cov = { scanned: 0, total: 0, capped: false };
    for (const { acc, x } of answers) {
      for (const hit of (x && x.results) || []) r.results.push({ ...hit, adapterId: acc.id });
      const c = SR.coverageOf(x && x.coverage);
      cov.scanned += c.scanned; cov.total += c.total; cov.capped = cov.capped || c.capped;
    }
    r.results.sort((m, n) => (Number(n.record && n.record.at) || 0) - (Number(m.record && m.record.at) || 0));
    status.textContent = r.results.length ? (r.truncated ? t('{n} results — more exist; narrow the words', { n: r.results.length }) : t('{n} results', { n: r.results.length })) : t('No message matches.');
    // .212: the agent's hits the saved copy no longer holds (a search older than its window) are SAID, never invented
    if (sc && q === initial && Array.isArray(agentHits) && agentHits.length) {
      const have = new Set(r.results.map((h) => String((h.record && h.record.vendorId) || '')));
      const gone = agentHits.filter((h) => h && !have.has(String(h.msgId))).length;
      if (gone) status.textContent += ` — ${t('{n} of the agent’s hits are not in the saved copy', { n: gone })}`;
    }
    s1.note.textContent = SR.coverageText(cov, { t });
    const grouped = group && !sc;
    const ck = (h) => `${h.adapterId}\u0000${h.convId}`;
    let ordered = r.results;
    if (grouped) { const first = new Map(); r.results.forEach((h, i) => { if (!first.has(ck(h))) first.set(ck(h), i); }); ordered = r.results.map((h, i) => [first.get(ck(h)), i, h]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]); }
    let lastKey = null;
    for (const hit of ordered) {
      const name = hit.title || chanCaps.untitledText(null, { t });
      if (grouped && ck(hit) !== lastKey) { const gh = document.createElement('div'); gh.className = 'chan-search-group'; gh.textContent = name; s1.rows.appendChild(gh); }
      lastKey = ck(hit);
      const it = hitRow(null, sc || grouped ? '' : name, `${(hit.record.author && (hit.record.author.name || hit.record.author.id)) || ''} · ${rowTime(hit.record.at)}`, String(hit.record.text || '').slice(0, 300));
      it.dataset.vid = String(hit.record.vendorId || '');
      // .212: a hit opens its conversation AT that message (the window's own jump)
      it.onclick = () => { close(); app.openChannel(hit.adapterId, hit.convId, { jump: { vid: hit.record.vendorId, at: hit.record.at } }); };
      s1.rows.appendChild(it);
    }
    // SECTION TWO — every searched account's own search, on this press
    const asked = answers.filter(({ x }) => x && !x.error);
    if (!asked.length) return;
    const names = [...new Set(asked.filter(({ x }) => x.vendorSearch).map(({ acc }) => vendorOf(acc)))];
    const s2 = section('chan-search-vendor', SR.sectionHead(asked.filter(({ x }) => x.vendorSearch).map(({ x }) => x.vendorSearch.adds), { t, vendor: names.join(' · ') || vendorOf(asked[0].acc) }));
    const shown = new Set(r.results.map((h) => `${h.adapterId}\u0000${h.convId}\u0000${h.record && h.record.vendorId}`));
    const skel = document.createElement('div'); skel.className = 'chan-search-skel'; skel.hidden = true;
    const sentinel = document.createElement('div'); sentinel.className = 'chan-search-sentinel';
    s2.sec.append(skel, sentinel);
    const states = asked.map(({ acc, x }) => {
      const line = document.createElement('div'); line.className = 'chan-search-vstatus'; s2.note.appendChild(line);
      return { acc, line, offered: !!x.vendorSearch, next: null, busy: false, found: 0, match: x.vendorSearch && x.vendorSearch.match, adds: x.vendorSearch && x.vendorSearch.adds, retried: false };
    });
    const say = (st, v) => {
      st.line.textContent = (states.length > 1 ? `${st.acc.label || st.acc.id}: ` : '') + SR.statusText(v, { t, vendor: vendorOf(st.acc) });
      if (v.state === 'refused' && v.code === 'needs-scope' && !st.line.querySelector('button')) { const re = btn(t('Re-authorize'), () => { close(); showReauthAccountDialog(app, st.acc, { kinds: [] }); }); re.classList.add('chan-sec-verb'); st.line.appendChild(re); }
    };
    const busyAny = () => { skel.hidden = !states.some((st) => st.busy); };
    const ask = async (st, page = null) => {
      if (st.busy || my !== gen) return;
      st.busy = true; busyAny();
      if (!page) say(st, { state: 'asking' });
      const x = await fetchJson(`/api/channels/search/full?adapter=${encodeURIComponent(st.acc.id)}&q=${encodeURIComponent(q)}${page ? `&page=${encodeURIComponent(page)}` : ''}`);
      st.busy = false; busyAny();
      if (my !== gen) return;
      if (!x || x.ok === false || x.error) {
        const code = (x && x.code) || 'failed';
        if (['not-supported', 'needs-scope', 'backoff', 'search-floor', 'search-minute', 'vendor-budget'].includes(code)) {
          say(st, { state: 'refused', code, retryAfterSec: x && x.retryAfterSec });
          // the dialog retries by itself ONCE when the wait ends (never a loop)
          if (code !== 'not-supported' && code !== 'needs-scope' && !st.retried && x && x.retryAfterSec) { st.retried = true; setTimeout(() => { if (my === gen && document.body.contains(list)) ask(st, page); }, Number(x.retryAfterSec) * 1000 + 250); }
        } else say(st, { state: 'failed' });
        return;
      }
      st.match = x.match || st.match; st.adds = x.adds || st.adds;
      for (const h of x.hits || []) {
        if (sc && String(h.convId) !== sc.convId) continue;   // .212: scoped to one conversation
        const key = `${st.acc.id}\u0000${h.convId}\u0000${h.vendorId}`;
        if (shown.has(key)) continue;   // a hit section one already holds appears once (V6)
        shown.add(key);
        const chip = document.createElement('span'); chip.className = 'chan-search-chip'; chip.textContent = t('Not saved here');
        const it = hitRow(st.acc, h.known ? (h.title || chanCaps.untitledText(null, { t })) : t('A conversation not yet synced'), `${h.author && h.author.name ? `${h.author.name} · ` : ''}${rowTime(h.at)}`, String(h.snippet || ''), chip);
        it.classList.add('chan-search-vhit');
        it.dataset.vid = h.vendorId;
        it.onclick = () => openAround(st.acc, h);
        s2.rows.appendChild(it);
        st.found++;
      }
      st.next = x.next || null;
      say(st, { state: 'done', found: st.found, match: st.match, adds: st.adds });
    };
    for (const st of states) { if (st.offered) ask(st); else say(st, { state: 'refused', code: 'not-supported' }); }
    // the end of section two, ONE screen ahead: each account's next page, one request each — asked by the person's
    // SCROLL (lane mirror-green-channels, the Actions mirror 2.369.203/.204). An IntersectionObserver speaks only when
    // the end CROSSES into that screen: where the first answer's rows left the end inside it (the runner's 40 px rows:
    // the end at 904 px of a 914 px reach; 944 px with 42 px rows elsewhere) it never crossed again, and a scroll to the
    // very end asked nothing (no "Show more" to press instead); where the observer's first look came after that answer
    // landed, it asked the next page with nobody scrolling (a metered vendor search, charged to the owner). Every scroll
    // of the list now looks where the end is (once a frame), and so does a wheel down at a list too short to scroll;
    // nothing else asks.
    const endNear = () => sentinel.isConnected && sentinel.getBoundingClientRect().top <= list.getBoundingClientRect().bottom + list.clientHeight;
    let looking = false;
    const look = () => {
      if (looking) return;
      looking = true;
      raf(() => { looking = false; if (my === gen && list.isConnected && endNear()) for (const st of states) if (st.next && !st.busy) ask(st, st.next); });
    };
    const onWheel = (e) => { if (e.deltaY > 0 && list.scrollHeight <= list.clientHeight) look(); };
    list.addEventListener('scroll', look, { passive: true });
    list.addEventListener('wheel', onWheel, { passive: true });
    observer = { disconnect() { list.removeEventListener('scroll', look); list.removeEventListener('wheel', onWheel); } };
  };
  go.onclick = run;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) run(); } });
  if (initial) { input.value = initial; run(); }   // the panel's "Search messages for …" — the owner's press on it
  setTimeout(() => input.focus(), 30);
}

/** .212 THE AGENT'S SEARCH, AS RESULTS (`app.openChannelSearch` — the card's search row and its tail; lane
 *  channel-search-view): the accounts the touches name, the search dialog pre-filled and run — scoped to one
 *  conversation, or unscoped and grouped by conversation. */
export async function openSearchResults(app, { adapterIds = [], q = '', convId = null, convTitle = '', group = false, hits = null } = {}) {
  const want = new Set((adapterIds || []).map(String));
  const d = await fetchJson('/api/channels');
  const accounts = (d && Array.isArray(d.adapters) ? d.adapters : []).filter((x) => x && want.has(String(x.id)));
  if (!accounts.length) { showToast(t('That account is no longer connected'), { type: 'warn' }); return; }
  showSearchDialog(app, accounts, { q, convId, convTitle, group, hits });
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
      // a declared choice's WORDS (`choiceLabels`, keys worded here — 2026-09-26)
      for (const ch of o.choices) { const opt = document.createElement('option'); opt.value = ch; opt.textContent = o.choiceLabels && o.choiceLabels[ch] ? t(o.choiceLabels[ch]) : ch; input.appendChild(opt); }
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
    fields.push([o.key, input, o, wrap]);
  }
  // an option USED only for certain values of a sibling (`usedWhen`) is shown
  // only then and restored to its default when hidden (never a stale value)
  const inUse = (o) => !o.usedWhen || Object.entries(o.usedWhen).every(([k, allowed]) => { const f = fields.find((x) => x[0] === k); return f && (Array.isArray(allowed) ? allowed : [allowed]).includes(f[1].value); });
  const sync = () => { for (const [, , o, wrap] of fields) wrap.style.display = inUse(o) ? '' : 'none'; };
  for (const [, input] of fields) input.addEventListener('change', sync);
  sync();
  const actions = document.createElement('div');
  actions.className = 'chan-flow-actions';
  const status = chanLine('chan-flow-status', '');
  const save = btn(t('Save'), async () => {
    const options = {};
    for (const [k, input, o] of fields) options[k] = inUse(o) ? input.value : '';
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
/** WHAT PUSH IS (design §6.4) — the dialog's first line and the menu row's tooltip (ONE spelling, a t() literal the i18n scan sees). */
const pushWhat = () => t('Push = the platform tells VibeSpace about a new message the moment it arrives (seconds); off = polling every few minutes. Gmail needs a Google Cloud Pub/Sub topic + this instance\'s own pull subscription (one re-authorize adds the Pub/Sub permission); Lark uses the app\'s long connection — no public address needed.');
function showPushDialog(app, a) {
  const p = a.push || {};
  const { body, close } = createModalShell({ id: 'chan-push-dialog', title: t('Push lane — {label}', { label: a.label || a.id }), dialogClass: 'chan-dialog chan-options', escapeToClose: true });
  // WHAT PUSH IS, first (the owner: "'推送'按钮是干啥的？我没看明白，是gmail特有的吗") — both vendors' requirements, one line
  body.appendChild(chanLine('chan-flow-intro chan-push-intro', pushWhat()));
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
  wrap.appendChild(chanLine('chan-opt-help chan-push-exclusive-help', t('Exclusive = only this VibeSpace consumes that subscription; shared = another instance also reads it, so push here only advances the cursor and polling stays fast.')));
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

/** The STATUS LINES under a SOURCE's head (a section that is not an account:
 *  the built-in watcher, a scan-only fixture — an account draws
 *  `accountLines`) — only when it has something to say beyond "connected"
 *  (a1 D1/D6, design §4.2): each is a wrapping 10px sentence carrying its ONE
 *  verb, amber when it needs the user. A source has no login of its own, so
 *  none of these carries a consent verb. */
function adapterNotes(app, a) {
  const notes = [];
  const auth = a.auth || { state: 'unknown' };
  const line = (text, { warn = false, verbs = [] } = {}) => {
    const n = noteLine('chan-sec-note', text, { warn });
    for (const v of verbs) { v.classList.add('chan-sec-verb'); n.appendChild(v); }
    notes.push(n);
  };
  if (a.enabled === false) {
    line(t('disabled'), { verbs: [btn(t('Enable'), () => put(`/api/channels/adapters/${encodeURIComponent(a.id)}`, { enabled: true }))] });
  } else if (auth.state === 'connected') {
    // the built-in row's login IS this instance (`auth.self`), never a named user;
    // a sliding token (`renews`) counts down only once renewals have stopped
    const eta = auth.expiresAt ? reauthEta(auth.expiresAt) : null;
    const soon = auth.expiresAt && (Number(auth.expiresAt) - Date.now()) < (auth.renews ? 86400e3 : REAUTH_SOON_MS);
    if (soon && eta) {
      const who = auth.self ? t('connected — this instance') : auth.user ? t('connected as {user}', { user: auth.user }) : t('connected');
      line(`${who} · ${t('re-authorize in {eta}', { eta })}`, { warn: Number(auth.expiresAt) - Date.now() <= 0 });
    }
  } else if (auth.state === 'expired') {
    // `auth.why` is a CODE (token-expired / refresh-refused / …) — worded here (a3 i18n)
    line(t('needs re-authorization ({why})', { why: chanCaps.authWhyText(auth.why || 'token-expired', { t }) }), { warn: true });
  } else if (auth.state === 'needs-credentials') {
    // an adapter that resolves its own credential (the fake fixtures)
    // carries the store's code on `auth.whyCode` — NEVER the raw `why`
    // sentence (the store's English contract)
    const cred = a.credential || {};
    const why = R.credentialWhyText({ whyCode: cred.whyCode || auth.whyCode || null, whyParams: cred.whyParams || auth.whyParams || null }, { t }) || chanCaps.authWhyText('no-credentials', { t });
    line(t('application credential missing ({why})', { why }), { warn: true });
  }
  if (a.lastAuthError) line(t('Last connect failed: {error}', { error: a.lastAuthError }), { warn: true });
  if (a.consecutiveFailures >= 3 && a.lastPass) {
    const s = t('{n} failed passes ({code})', { n: a.consecutiveFailures, code: chanCaps.errorCodeText((a.lastPass && a.lastPass.code) || 'failed', { t }) });
    line(s + (a.lastPass.error ? ` — ${a.lastPass.error}` : '') + (a.failureItem ? ` — ${t('a "For you" item was filed')}` : ''), { warn: true });
  }
  // lane R5: a SOURCE says what an account card says — the pass state (a vendor's RATE wait by its name,
  // a failure's retry, before the third failure takes the line above) and the FIRST READ — whatever its
  // auth line says (a source that passes without a login, the fixtures, still reads)
  if (!a.builtin && a.enabled !== false) {
    const ps = chanCaps.passStateText(a, { t, now: Date.now() });
    if (ps.note && !(a.consecutiveFailures >= 3)) line(ps.note, { warn: true });
    const fr = a.scheduler ? chanCaps.firstReadText(a.scheduler, { t }) : '';
    if (fr) line(fr);
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
 *  row. ctx = { app, adapter, convs, kinds }.
 *
 *  AN ACCOUNT'S ⋯ FOLLOWS THE STORAGE ROW'S ACTION ORDER (r4 §8.1 #6, D6):
 *  Open conversation window (= Browse) → Search messages… → Hand to an
 *  agent… / Conversations matching a rule… (2026-09-26: the account and
 *  pattern grains — there is no Track… any more, every conversation is
 *  fetched) → Options → Push… ‖ Re-authorize / Connect → Duplicate… →
 *  Disconnect → Remove… ‖ Disable. */
export function registerChannelAdapterMenu() {
  const M = 'channel-adapter';
  const A = (c) => c.adapter;
  const acct = (c) => !!A(c).connectable;
  // design 008: an account's rows may not be loaded (its head is the newest 30) — the verbs ask its COUNT (`count`, the
  // kept facts) and the loaded rows only for what they open (the newest, which the head always holds)
  const convCount = (c) => (Number.isFinite(c.count) ? c.count : (c.convs || []).length);
  registerMenuItem({ menu: M, group: '1_rows', order: 5, when: (c) => acct(c) && convCount(c) > 0, label: () => t('Open conversation window'), run: (c) => openConversationOf(c.app, c.convs) });
  registerMenuItem({ menu: M, group: '1_rows', order: 8, when: (c) => !A(c).builtin && convCount(c) > 0, label: () => t('Search messages…'), run: (c) => showSearchDialog(c.app, A(c)) });
  // R4 (2026-09-27, design §7.3): TWO OPERATIONS, ACCESS FIRST — who may see
  // and act on the whole account, then who is woken; a rule's conversations
  // are a grain of their own (a new rule starts with its access)
  registerMenuItem({ menu: M, group: '1_rows', order: 10, when: (c) => !A(c).builtin, label: () => t('Grant access…'), run: (c) => showGrantAccessDialog(c.app, { kind: 'account', adapter: A(c) }) });
  registerMenuItem({ menu: M, group: '1_rows', order: 11, when: (c) => !A(c).builtin, label: () => t('Notify…'), run: (c) => showNotifyDialog(c.app, { kind: 'account', adapter: A(c) }) });
  // B-2198: the RAW API pass-through — who may call this account's vendor API, at which tier (off until granted)
  registerMenuItem({ menu: M, group: '1_rows', order: 11.5, when: (c) => !A(c).builtin && ['lark', 'slack', 'gmail'].includes(A(c).kind), label: () => t('API access…'), run: (c) => showApiAccessDialog(c.app, A(c).id) });
  registerMenuItem({ menu: M, group: '1_rows', order: 12, when: (c) => !A(c).builtin, label: () => t('Conversations matching a rule…'), run: (c) => showGrantAccessDialog(c.app, { kind: 'pattern', adapter: A(c), id: null }) });
  registerMenuItem({ menu: M, group: '1_rows', order: 20, when: (c) => (A(c).optionsSchema || []).length > 0, label: () => t('Options'), run: (c) => showOptionsDialog(c.app, A(c)) });
  registerMenuItem({ menu: M, group: '1_rows', order: 30, when: (c) => !!A(c).push, label: () => t('Push…'), tooltip: () => pushWhat(), run: (c) => showPushDialog(c.app, A(c)) });
  // P4: THE SENDER HONESTY SWITCH (§9.5) — per channel, OFF by default, drawn
  // only where the capability row allows sending (the digest hands `null`
  // for a read-only adapter). The row's check glyph says the state; the
  // label says whether the instance default is what applies. An ACCOUNT
  // carries it in its Edit dialog (D6: the ⋯ is the storage row's order).
  const sender = (c) => !acct(c) && !!A(c).senderHonestyLine;
  registerMenuItem({ menu: M, group: '2_send', order: 0, separator: true, when: sender });
  registerMenuItem({
    menu: M, group: '2_send', order: 10,
    when: sender,
    label: (c) => { const h = A(c).senderHonestyLine; return t('Sender line: {v}', { v: h.effective ? t('on') : t('off') }) + (h.record === null ? ' ' + t('(instance default)') : ''); },
    labelHtml: (c) => { const h = A(c).senderHonestyLine; const label = t('Sender line: {v}', { v: h.effective ? t('on') : t('off') }) + (h.record === null ? ' ' + t('(instance default)') : ''); return `<span class="chan-menu-check${h.effective ? ' chan-menu-check-on' : ''}" data-honesty-line="${h.effective ? 'on' : 'off'}">${h.effective ? UI_ICONS.check : ''}</span>${escHtml(label)}`; },
    tooltip: () => t('When on, a message an AGENT drafted goes out with one trailing line naming the agent. Your own drafts never get one. The approval card says who the recipient will see either way.'),
    run: (c) => put(`/api/channels/adapters/${encodeURIComponent(A(c).id)}`, { senderHonestyLine: !A(c).senderHonestyLine.effective }),
  });
  registerMenuItem({ menu: M, group: '2_send', order: 20, when: (c) => sender(c) && A(c).senderHonestyLine.record !== null, label: () => t('Use instance default'), run: (c) => put(`/api/channels/adapters/${encodeURIComponent(A(c).id)}`, { senderHonestyLine: null }) });
  registerMenuItem({ menu: M, group: '3_auth', order: 0, separator: true, when: acct });
  registerMenuItem({ menu: M, group: '3_auth', order: 10, when: (c) => acct(c) && !(A(c).flow && A(c).flow.running), label: (c) => ((A(c).auth || {}).state === 'connected' ? t('Re-authorize') : t('Connect')), run: (c) => showReauthAccountDialog(c.app, A(c), { kinds: c.kinds }) });
  // r4 §8.1 #2: a SIBLING account — the same type, client, filters and push
  // claim, its OWN sign-in (the token is never copied)
  registerMenuItem({ menu: M, group: '3_auth', order: 15, when: acct, label: () => t('Duplicate…'), run: (c) => showDuplicateAccountDialog(c.app, A(c), { kinds: c.kinds }) });
  registerMenuItem({
    menu: M, group: '3_auth', order: 20,
    when: (c) => acct(c) && ((A(c).auth || {}).tokenHeld || (A(c).auth || {}).state !== 'unknown'),
    label: () => t('Disconnect'),
    run: async (c) => {
      const a = A(c);
      const yes = await showConfirmDialog({ title: t('Disconnect'), message: t('Disconnect {label}? The token is dropped; conversations stay.', { label: accountName(a) }), confirmText: t('Disconnect'), danger: true });
      if (yes) await post(`/api/channels/adapters/${encodeURIComponent(a.id)}/disconnect`, {});
    },
  });
  // r4 §8.1 #5 (D5): refused BY NAME while anything still points at the account
  registerMenuItem({ menu: M, group: '3_auth', order: 30, when: acct, label: () => t('Remove…'), run: (c) => removeAccount(c.app, A(c)) });
  registerMenuItem({ menu: M, group: '4_state', order: 0, separator: true });
  registerMenuItem({ menu: M, group: '4_state', order: 10, label: (c) => (A(c).enabled === false ? t('Enable') : t('Disable')), run: (c) => put(`/api/channels/adapters/${encodeURIComponent(A(c).id)}`, { enabled: A(c).enabled === false }) });
}

/** THE OVERRIDE CHOICES (2026-09-26): Automatic (the activity tier) and the
 *  owner's five — the current one checked; a pick PUTs and the broadcast
 *  repaints every client. */
function refreshChoices(conv) {
  const cur = conv && conv.refresh ? conv.refresh.every : null;
  const put1 = (every) => api(`/api/channels/${encodeURIComponent(conv.adapterId)}/${encodeURIComponent(conv.id)}/refresh`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ every }) });
  const tierWord = conv && conv.cadence && conv.cadence.tier ? (conv.cadence.tier === 'hot' ? t('busy') : conv.cadence.tier === 'warm' ? t('recent') : t('quiet')) : '';
  const rows = [
    [null, cur === null && conv && conv.cadence && conv.cadence.source !== 'override' ? t('Automatic ({tier}, every {age})', { tier: tierWord, age: chanCaps.humanAge(conv.cadence.seconds) }) : t('Automatic (by activity)')],
    [30, t('Every 30 seconds')], [60, t('Every minute')], [300, t('Every 5 minutes')], [900, t('Every 15 minutes')], ['paused', t('Paused')],
  ];
  // the checked row wears the menu's own check (a CSS glyph, the sender-line row's) — never a text symbol
  return rows.map(([v, label]) => ({ label, labelHtml: `<span class="chan-menu-check${cur === v ? ' chan-menu-check-on' : ''}" data-refresh-choice="${escHtml(String(v))}">${cur === v ? UI_ICONS.check : ''}</span>${escHtml(label)}`, action: () => put1(v) }));
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
  // 2026-09-26: no Track / Stop tracking — every conversation of a linked
  // account is fetched; the owner decides HOW OFTEN (the override below)
  registerMenuItem({
    menu: M, group: '2_state', order: 10,
    when: (c) => c.conv.unread > 0,
    label: () => t('Mark read'),
    run: (c) => api(`/api/channels/${encodeURIComponent(c.conv.adapterId)}/${encodeURIComponent(c.conv.id)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 20,
    label: () => t('Refresh now'),
    run: async (c) => {
      const r = await api(`/api/channels/${encodeURIComponent(c.conv.adapterId)}/${encodeURIComponent(c.conv.id)}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      // r5: a refresh the loop has not answered within its bound says so (the window updates when it lands) — never 'Up to date'
      if (r) showToast(r.pending ? t('Refresh still running — the conversation updates when it lands') : r.appended ? t('{n} new message(s)', { n: r.appended }) : t('Up to date'));
    },
  });
  // THE OWNER'S OVERRIDE ("Refresh every ▸", design §6.2): persisted, broadcast,
  // the checked row is the conversation's current choice
  registerMenuItem({
    menu: M, group: '2_state', order: 30,
    label: () => t('Refresh every'),
    children: (c) => refreshChoices(c.conv),
  });
  // P2: assign + filter (design §7) — the CONVERSATION grain; the account
  // and pattern grains live on the account card's ⋯ (§7.3, 2026-09-26)
  registerMenuItem({
    menu: M, group: '3_assign', order: 10, separator: true,
  });
  // R4: the CONVERSATION grain's two operations, access first
  registerMenuItem({
    menu: M, group: '3_assign', order: 20,
    label: () => t('Grant access…'),
    run: (c) => showGrantAccessDialog(c.app, { kind: 'conversation', conv: c.conv }),
  });
  registerMenuItem({
    menu: M, group: '3_assign', order: 22,
    label: () => t('Notify…'),
    run: (c) => showNotifyDialog(c.app, { kind: 'conversation', conv: c.conv }),
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
/** THE LONG LISTS (2026-09-26: an account is an aggregated IM — 873
 *  conversations is a real account): the first screen and each account card
 *  draw the newest rows first and the rest behind "Show all" (per page
 *  session, like the folds). */
//  design 008 (B-3cf8): the rows beyond come from the server, a page as the list's END comes near (60 in All, 200 in an
//  account — src/lib/channel-rows.js; owner 2026-10-03: seamless, no "Show more"); "Show all N" built every row in the
//  DOM and needed every row on the client.
const SEARCH_DEBOUNCE_MS = 250;
// owner 2026-10-03 (seamless lists): a re-read keeps the range a list had — at most this many pages of PAGE_MAX
const REREAD_PAGES = 10;
// a screen the pages do not fill reads on by itself — at most this many pages while the list's end stays in view
const FILL_PAGES = 5;
const raf = (f) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : setTimeout(f, 16));
/** R3 (2026-09-26, design §23 — the owner: "开头不要把所有消息都放进来 … 只放重要
 *  消息/conversation … 并展示一个小tag表示状态"): the first screen is the
 *  ATTENTION list (`focus`, the default) and the whole list is one switch away
 *  (`all`) — per page session, like the folds. */
let VIEW = 'focus';

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

/** THE FIRST SCREEN'S FILTER (R3, design §23.4): one search box over the rows
 *  the panel already holds (title / source / last line) — a query, never an
 *  account field (the oauth-field-parity census names this owner). */
function filterBox(onInput) {
  const row = chanEl('div', 'chan-find');
  const input = document.createElement('input');
  input.type = 'search'; input.className = 'chan-find-input'; input.dataset.channelFilter = '1';
  input.placeholder = t('Filter…');
  input.title = t('Filter conversations');
  input.spellcheck = false;
  input.addEventListener('input', onInput);
  row.appendChild(input);
  return { row, input };
}

/**
 * Render the rail panel into `c`. THE FIRST SCREEN IS THE GROUP LIST (design
 * §22, the owner's IM model): every agent group and every conversation of a
 * connected account (2026-09-26: an aggregated IM — there is no track step)
 * in ONE list sorted by last activity — row = glyph + name + time / source
 * chip + last line + unread. The accounts (connect, re-authorize, search,
 * the account / pattern grains, the per-account conversation rows with
 * Refresh every / Assign / Reach) and the MESSAGE WATCHER (the built-in
 * agents-as-sources section) are SECONDARY sections below, each folded by
 * the user and the fold persisted.
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
  // R3 (§23): THE HEADER IS THE VIEW SWITCH — "{n} need attention" | "All {n}"
  // (a `chan-seg`, the Outbox window's Awaiting | All grammar) in the summary's
  // place; a click redraws from the digest already in hand (no fetch)
  const seg = chanEl('div', 'chan-seg chan-view-seg');
  const segFocus = chanEl('button', 'jobs-btn chan-view-btn');
  segFocus.type = 'button'; segFocus.dataset.view = 'focus';
  const segAll = chanEl('button', 'jobs-btn chan-view-btn');
  segAll.type = 'button'; segAll.dataset.view = 'all';
  for (const b of [segFocus, segAll]) b.onclick = (ev) => { ev.stopPropagation(); VIEW = b.dataset.view; draw(); wantAll(); };
  /** design 008: All draws its OWN list (newest first, read from the server) — read on first view or when stale. */
  function wantAll() {
    if (VIEW !== 'all') return;
    const l = store.lists.get('all');
    if (!l || !l.loaded || l.stale) readList('all').catch(() => {});
  }
  seg.append(segFocus, segAll);
  summary.appendChild(seg);
  // …and the FILTER over the rows the list shows (title / source / last line),
  // outside the repainted list so a broadcast never eats a keystroke
  const { row: find, input: findInput } = filterBox(() => { draw(); queueSearch(); });
  // the second row: the filter, then the two actions (New group, Outbox) — the switch
  // above gets the WHOLE width (measured: beside the two buttons at the 188 px rail it
  // cut "1 需关注" to "1 需…" and "全部 8" to "全…")
  find.append(newBtn, outboxBtn);
  const root = document.createElement('div');
  root.className = 'chan-list';
  c.append(bar, find, root);

  /** The two inputs the list is drawn from — `digest` = the accounts, counts and totals of the last read / broadcast
   *  (design 008: its rows live in `store`, keyed), `groups` the group list (replaced whole by its broadcast). */
  let digest = null, groups = null;
  const store = createRowStore();
  // design 008: A LIST READ FROM THE SERVER — a page (its end came near), a re-read of what a stale list had, the search.
  //  One read per list at a time; a row a broadcast wrote while the page was on its way keeps the broadcast's copy.
  const reading = new Set();
  async function readList(name, { more = false, q = '' } = {}) {
    if (reading.has(name) || !c.isConnected) return;
    if (name === 'search') ensureList(store, 'search', { q });
    const qs = pageQueryOf(store, name, { more });
    const gen = store.gen;
    const l0 = store.lists.get(name);
    // a RE-READ keeps the RANGE the list had (owner 2026-10-03: a reconnect / a whole broadcast never jumps a list back
    //  to its top) — pages of PAGE_MAX until it holds what it held, at most REREAD_PAGES
    const want = more || !l0 ? 0 : Math.max(l0.had || 0, l0.keys.size);
    reading.add(name);
    if (more && digest !== null && groups !== null) draw();   // the skeleton row at the list's end while the page is read
    let landed = false;
    try {
      const url = (x) => '/api/channels/rows?' + new URLSearchParams(x).toString();
      let page = await fetchJson(url(qs));
      if (want > PAGE_MAX && page && !page.error) {
        const acc = [...(page.rows || [])];
        for (let k = 1; k < REREAD_PAGES && page.next && acc.length < want; k++) {
          const nx = await fetchJson(url({ ...qs, limit: String(PAGE_MAX), beforeAt: String(page.next.lastAt), beforeKey: page.next.key }));
          if (!nx || nx.error) break;
          acc.push(...(nx.rows || []));
          page = nx;
        }
        page = { ...page, rows: acc };
      }
      if (!c.isConnected || !page || page.error) return;
      if (name === 'search' && (store.lists.get('search') || {}).q !== q) return;   // the words moved on while it was read
      applyPage(store, name, page, { replace: !more, gen, q });
      landed = true;
    } finally {
      reading.delete(name);
      if (c.isConnected && digest !== null && groups !== null) draw();
      // a screen the new rows do not fill reads on (FILL_PAGES bounds it)
      if (landed) raf(() => { const el = ends.get(name); if (el && el.isConnected && nearEnd(el)) pull(name); });
    }
  }
  // THE LIST'S END LOADS ITSELF (owner 2026-10-03: no "Show more" — seamless): a sentinel after the last row, watched by
  //  an IntersectionObserver ONE SCREEN AHEAD (rootMargin = the scroll box's height), reads the next page; a skeleton row
  //  stands there while it is read; at the end, nothing. A screen the pages do not fill reads on — at most FILL_PAGES
  //  pages while the view does not move down the list, so a maximize / a resize can not chain reads without bound; the
  //  end leaving the view, a scroll further down, or focus reaching it starts a new count. These are our own row pages, not a vendor's metered
  //  list (channel-paging's "a scroll is not intent" rule is about those).
  const ends = new Map();    // list name → its kept end element
  const chain = new Map();   // list name → pages read while its end stayed in view
  const chainTop = new Map();   // list name → the scroll box's scrollTop at its last read
  let io = null, ioRoot = null, scrollAt = null, scrollQueued = false;
  const scrollTopOf = () => (ioRoot ? ioRoot.scrollTop : ((document.scrollingElement || document.documentElement || {}).scrollTop || 0));
  function pull(name) {
    const l = store.lists.get(name);
    if (!l || !l.next || reading.has(name) || !c.isConnected) return;
    // a person scrolling DOWN asks again each time (verify r1: a fling that kept the end in view stopped after
    //  FILL_PAGES) — the bound is for reads the view did not move for; a resize never moves scrollTop down the list
    const top = scrollTopOf();
    if (top > (chainTop.has(name) ? chainTop.get(name) : Infinity)) chain.set(name, 0);
    chainTop.set(name, top);
    const n = chain.get(name) || 0;
    if (n >= FILL_PAGES) return;
    chain.set(name, n + 1);
    readList(name, { more: true, q: name === 'search' ? (findInput.value || '').trim() : '' }).catch(() => {});
  }
  /** The scroll box a list's end is watched in — the one that SCROLLS (`scrollerOf`: an `overflow: auto` box as tall as
   *  its content scrolls nothing; verify r1: watching one made every end "near" and its scrollTop never moved) — else
   *  the viewport (nothing overflows yet: every end is in view, and the fill bound holds). */
  function scrollRootOf() { return scrollerOf(); }
  /** Is the end drawn (a folded card's is not) and within one screen below what its scroll box shows? */
  function nearEnd(el) {
    if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect(), box = ioRoot ? ioRoot.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    return r.bottom >= box.top && r.top <= box.bottom + (box.bottom - box.top);
  }
  function watchEnd(el) {
    if (typeof IntersectionObserver !== 'function') return;
    const r = scrollRootOf();
    if (!io || ioRoot !== r) {
      if (io) io.disconnect();
      ioRoot = r;
      io = new IntersectionObserver((entries) => {
        if (!c.isConnected) { io.disconnect(); return; }
        for (const e of entries) { const name = e.target.dataset.list; if (!e.isIntersecting) chain.set(name, 0); else pull(name); }
      }, { root: r, rootMargin: '0px 0px 100% 0px' });
      if (scrollAt) scrollAt.removeEventListener('scroll', onScroll);
      scrollAt = r || window;
      scrollAt.addEventListener('scroll', onScroll, { passive: true });
      for (const s of ends.values()) if (s.isConnected) io.observe(s);
    }
    io.observe(el);
  }
  /** A scroll with an end still in view (the observer only speaks when it crosses) — once a frame; a panel gone lets go. */
  function onScroll() {
    if (!c.isConnected) { if (scrollAt) scrollAt.removeEventListener('scroll', onScroll); if (io) io.disconnect(); return; }
    if (scrollQueued) return;
    scrollQueued = true;
    raf(() => { scrollQueued = false; for (const [name, el] of ends) if (el.isConnected && nearEnd(el)) pull(name); });
  }
  /** The END of a paged list: while the server has more, the sentinel (a skeleton row while a page is read); else null. */
  function endOfList(name) {
    const l = store.lists.get(name);
    if (!l || !l.next) return null;
    const el = keep('end:' + name, () => {
      const s = document.createElement('div');
      s.className = 'chan-list-end';
      s.dataset.list = name;
      s.tabIndex = 0;   // the keyboard and a screen reader reach the end too — focus there reads the next page
      s.addEventListener('focus', () => { chain.set(name, 0); pull(name); });
      return s;
    });
    const busy = reading.has(name);
    el.classList.toggle('chan-row-skeleton', busy);
    if (busy) { el.setAttribute('role', 'status'); el.setAttribute('aria-busy', 'true'); } else { el.removeAttribute('role'); el.removeAttribute('aria-busy'); }
    el.setAttribute('aria-label', busy ? t('Loading more conversations…') : t('More conversations load here'));
    ends.set(name, el);
    raf(() => { if (el.isConnected) watchEnd(el); });
    return el;
  }
  // focus on the LAST row's own parts (its ⋯ button) reads on too
  root.addEventListener('focusin', (ev) => {
    const row = ev.target && ev.target.closest ? ev.target.closest('.chan-grow, .chan-row') : null;
    const end = row && row.nextElementSibling;
    if (end && end.classList.contains('chan-list-end')) { chain.set(end.dataset.list, 0); pull(end.dataset.list); }
  });
  /** The lists a first read / reconnect / whole broadcast left stale: the one on screen re-reads now, the rest on view. */
  function reread(names) {
    for (const n of names || []) {
      if (n === 'all' && VIEW === 'all') readList('all').catch(() => {});
      else if (n === 'search' && (findInput.value || '').trim()) readList('search', { q: (findInput.value || '').trim() }).catch(() => {});
      else if (n.startsWith('account:')) readList(n).catch(() => {});
    }
  }
  // the filter's SERVER half (design 008): the attention rows filter locally at once; 250 ms after the last keystroke
  //  the server answers how many rows of All match ("{n} more in All") — and the All view pages that answer
  let searchTimer = null;
  function queueSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    const q = (findInput.value || '').trim();
    if (!q) { store.lists.delete('search'); return; }
    searchTimer = setTimeout(() => { searchTimer = null; readList('search', { q }).catch(() => {}); }, SEARCH_DEBOUNCE_MS);
  }

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
    const keepTop = scroller ? scroller.scrollTop : 0;
    // IN PLACE (verify round 4): the top-level nodes, the group list, every part, every account section and its
    // rows box are KEPT across draws and reconciled — a node already where it belongs is never detached, so the
    // 879-row lists are not re-laid out per broadcast and a click in flight on a row survives it
    const top = build(digest || {});
    pruneMemo();
    reconcile(root, top);
    if (scroller && scroller.scrollTop !== keepTop) scroller.scrollTop = keepTop;
  }

  /** A SECONDARY section (Accounts / Message watcher): a fold head + a body;
   *  the fold is the user's, persisted (`channelsPanelFolds`). */
  function part(key, label, countText, fill) {
    const p = keep('part:' + key, () => {
      const el = document.createElement('div');
      el.dataset.part = key;
      const h = document.createElement('div');
      h.className = 'chan-part-head';
      h.appendChild(icon('chevronDown', 10, 'chan-part-chev'));
      const nm = document.createElement('span');
      nm.className = 'chan-part-name';
      h.appendChild(nm);
      const b = document.createElement('div');
      b.className = 'chan-part-body';
      el.append(h, b);
      return el;
    });
    const folded = !!(FOLDS && FOLDS[key]);
    p.className = 'chan-part' + (folded ? ' chan-part-collapsed' : '');
    const h = p.firstChild, b = p.lastChild;
    h.querySelector('.chan-part-name').textContent = label;
    let n = h.querySelector('.chan-part-count');
    if (countText) { if (!n) { n = document.createElement('span'); n.className = 'chan-part-count'; h.appendChild(n); } n.textContent = countText; } else if (n) n.remove();
    h.onclick = () => { const now = !p.classList.contains('chan-part-collapsed'); p.classList.toggle('chan-part-collapsed', now); setFold(key, now); };
    const items = [];
    fill({ appendChild: (x) => { items.push(x); return x; } });
    reconcile(b, items);
    return p;
  }

  function build(d) {
    const top = [];
    const into = { appendChild: (x) => { top.push(x); return x; } };
    const adapters = (d && d.adapters) || [];
    const badges = accountBadges(adapters);   // lane channels-badges: this build's ONE map — the rows and the cards read it
    // design 008: the ATTENTION rows the store holds — the server's list (verify r1: a held row's stale tag never draws
    //  it here); All and each account draw their own lists below
    const convs = focusRowsOf(store, Date.now());
    const { rows, archived } = groupListRows({ groups: groups || [], conversations: convs, adapters, untitled: (kind) => chanCaps.untitledText(kind, { t }) });
    // R3 (§23): the ATTENTION list by default — what matters, one tag each (PURE firstScreen / statusTag)
    const q = findInput.value || '';
    const now = Date.now();
    const fs = firstScreen(rows, { view: VIEW, q, now });
    // design 008: THE COUNTS are the server's (kept facts) — the attention rows past the first read's cut and every row
    //  of All are not on this client; All draws its own paged list (`search` under a query), groups interleaved by
    //  activity down to the list's edge (a group older than the last row read waits for the next page)
    const groupN = rows.filter((r) => r.kind === 'group').length;
    const counts = (d && d.counts) || null;
    const allN = counts ? groupN + (Number(counts.all) || 0) : fs.all;
    const focusN = fs.focus + (Number(store.cut) || 0);
    const allName = q.trim() ? 'search' : 'all';
    const allList = store.lists.get(allName) || null;
    const allReady = !!(allList && allList.loaded);
    if (fs.view === 'all') {
      const listed = groupListRows({ groups: groups || [], conversations: listRows(store, allName), adapters, untitled: (kind) => chanCaps.untitledText(kind, { t }) }).rows;
      fs.shown = filterRows(allList && allList.next ? listed.filter((r) => r.kind !== 'group' || !afterCursor(r, allList.next)) : listed, q);
    } else if (q.trim()) {
      // "{n} more in All": the server's matches over every row, less the attention rows shown
      const sl = store.lists.get('search');
      fs.moreInAll = sl && sl.loaded && sl.q === q.trim() ? Math.max(0, (Number(sl.total) || 0) - fs.shown.filter((r) => r.kind === 'conv').length) : 0;
    }
    const words = viewSwitchText({ focus: focusN, all: allN });
    segFocus.textContent = words.focus; segFocus.title = t('What needs you or an agent: handed to an agent, read by one in the last 24 h, awaiting your approval, a held wake, or a reply of yours in the last 24 h');
    segAll.textContent = words.all; segAll.title = t('Every conversation of every connected account, newest first');
    segFocus.classList.toggle('chan-seg-on', fs.view === 'focus');
    segAll.classList.toggle('chan-seg-on', fs.view === 'all');
    segFocus.setAttribute('aria-pressed', String(fs.view === 'focus'));
    segAll.setAttribute('aria-pressed', String(fs.view === 'all'));
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

    // ── THE FIRST SCREEN: the group list (ONE element across draws, its rows reconciled) ──
    const listEl = keep('groups', () => { const l = document.createElement('div'); l.className = 'chan-groups'; return l; });
    listEl.dataset.view = fs.view;
    const listKids = [];
    const list = { appendChild: (x) => { listKids.push(x); return x; } };
    if (!rows.length) {
      list.appendChild(chanLine('empty-hint chan-groups-empty', t('No groups yet. "New group" starts one with live agent sessions; an agent can too (vibespace-msg group create). Every conversation of an account you connect below appears here as well.')));
    } else if (fs.view === 'focus' && !focusN) {
      list.appendChild(chanLine('empty-hint chan-groups-empty chan-focus-empty', t('Nothing here needs you or an agent yet. A conversation appears here when you hand it to an agent, an agent reads it, a draft waits for your approval, a wake is held, or you reply in it. Every conversation is under All ({n}).', { n: allN })));
    } else if (!fs.shown.length && q.trim() && (fs.view === 'focus' || allReady)) {
      list.appendChild(chanLine('empty-hint chan-groups-empty', t('No conversation matches "{q}".', { q: q.trim() })));
    }
    // the ALL view is the server's pages — its end reads the next one as it comes near (design 008; owner 2026-10-03:
    //  seamless, no button); the attention list is short by construction
    // lane channels-badges: VibeSpace's own talk is ONE block under its head (PURE internalBlock); folded the head alone
    //  stands for it — a row that needs the owner keeps its own row on top. A query searches everything: nothing folds
    //  under it. lane channels-fold: FOLDED BY DEFAULT (foldsFrom) — the user's unfold is user state, synced
    const ib = internalBlock(fs.shown, { folded: (FOLDS || foldsFrom(null)).internal && !q.trim(), now });
    for (const r of ib.rows) list.appendChild(r.kind === 'internal-head' ? internalHead(r.block) : groupRow(r, now));
    // lane channel-avatars: the attention list warms its VISIBLE direct chats' pictures (≤ Av.WARM_MAX — never an account sweep)
    warmAvatars(ib.rows.filter((r) => r && r.conv && r.conv.peer).slice(0, 40).map((r) => ({ account: r.conv.adapterId, author: r.conv.peer, conv: r.conv.id })));
    const allEnd = fs.view === 'all' ? endOfList(allName) : null;
    if (allEnd) list.appendChild(allEnd);
    if (fs.moreInAll > 0) {
      const more = moreToggle(t('{n} more in All', { n: fs.moreInAll }), () => { VIEW = 'all'; draw(); wantAll(); });
      more.dataset.moreInAll = String(fs.moreInAll);
      list.appendChild(more);
    }
    // a query is also a MESSAGE search: every connected account's local logs, the existing search dialog
    const accountsToSearch = adapters.filter((a) => !a.builtin);
    if (q.trim().length >= 2 && accountsToSearch.length) {
      const sm = moreToggle(t('Search messages for "{q}"', { q: q.trim() }), () => showSearchDialog(app, accountsToSearch, { q: q.trim() }));
      sm.dataset.searchMessages = '1';
      list.appendChild(sm);
    }
    if (archived.length) {
      const tog = document.createElement('div');
      tog.className = 'chan-archived-toggle' + (ARCHIVED_OPEN ? ' chan-archived-open' : '');
      tog.appendChild(icon('chevronDown', 9, 'chan-part-chev'));
      tog.appendChild(chanLine('chan-archived-label', t('Archived groups ({n})', { n: archived.length })));
      tog.onclick = () => { ARCHIVED_OPEN = !ARCHIVED_OPEN; draw(); };
      list.appendChild(tog);
      if (ARCHIVED_OPEN) for (const r of archived) list.appendChild(groupRow(r));
    }
    reconcile(listEl, listKids);
    into.appendChild(listEl);

    // ── SECONDARY: the accounts (every non-built-in adapter + Connect) ──
    const accounts = adapters.filter((a) => !a.builtin);
    const watcher = adapters.filter((a) => a.builtin);
    // THE ACCOUNT MODEL: how many accounts each kind holds (a lone one keeps
    // the kind's label; further ones are numbered in record order until the
    // token names them) and which is the n-th
    const siblings = new Map();
    const ordinal = new Map();
    for (const a of adapters) { const n = (siblings.get(a.kind) || 0) + 1; siblings.set(a.kind, n); ordinal.set(a.id, n); }
    const kinds = (d && Array.isArray(d.kinds)) ? d.kinds : [];
    into.appendChild(part('accounts', t('Accounts'), accounts.length ? String(accounts.length) : '', (b) => {
      if (!accounts.length && !kinds.length) b.appendChild(chanLine('empty-hint empty-hint-inline', t('No account connected.')));
      for (const a of accounts) b.appendChild(section(a, listRows(store, accountList(a.id)), siblings, ordinal, badges.get(a.id)));
      // ONE entry at the bottom (r4 §8.1 #6/#11 — the storage footer's
      // "Connect storage"): the type-first dialog serves every type, so the
      // per-kind buttons and "Add account…" are retired
      if (kinds.length) {
        const blk = document.createElement('div');
        blk.className = 'chan-sec chan-connect';
        const cb = document.createElement('button');
        cb.type = 'button';
        cb.className = 'mounts-btn chan-connect-btn';
        cb.dataset.connectAccount = '1';
        const lab = document.createElement('span');
        lab.className = 'chan-connect-label';
        lab.textContent = t('Connect an account ({types})', { types: kinds.map((k) => k.label || k.kind).join(', ') });
        cb.append(icon('plus', 13), lab);
        cb.onclick = () => showConnectAccountDialog(app, kinds);
        blk.appendChild(cb);
        b.appendChild(blk);
      }
    }));
    // ── SECONDARY: the message watcher (agents as SOURCES: track / assign / filter) ──
    if (watcher.length) {
      into.appendChild(part('watcher', t('Message watcher'), '', (b) => {
        b.appendChild(chanLine('chan-part-note', t('Follow a live agent session as a source: assign or filter it for another agent. To talk WITH agents, use a group.')));
        for (const a of watcher) b.appendChild(section(a, listRows(store, accountList(a.id)), siblings, ordinal, badges.get(a.id)));
      }));
    }
    return top;
  }

  /** lane channels-badges: THE HEAD of VibeSpace's own talk — chevron · the VibeSpace badge (the same element its rows
   *  wear) · "VibeSpace internal" · (N) · @-you · unread — a BUTTON: a click (Enter / Space) folds or unfolds the block. A KEPT
   *  node patched in place (the account head's rule): a press in flight survives a broadcast. */
  function internalHead(b) {
    const h = keep('internal-head', () => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'chan-ihead';
      el.dataset.internalHead = '1';
      el.appendChild(icon('chevronDown', 10, 'chan-part-chev'));
      el.appendChild(accountBadge(INTERNAL_BADGE, 'chan-ihead-badge'));
      el.append(chanEl('span', 'chan-ihead-name'), chanEl('span', 'chan-ihead-count'), chanEl('span', 'chan-ihead-at'), chanEl('span', 'chan-grow-unread chan-ihead-unread'));
      return el;
    });
    const [, , nm, cnt, at, un] = h.childNodes;
    h.classList.toggle('chan-ihead-folded', b.folded);
    h.setAttribute('aria-expanded', String(!b.folded));
    nm.textContent = t('VibeSpace internal');
    cnt.textContent = `(${b.n})`;
    at.textContent = b.atYou ? t('@you {n}', { n: b.atYou }) : '';
    at.style.display = b.atYou ? '' : 'none';
    un.textContent = String(b.unread);
    un.style.display = b.unread ? '' : 'none';
    un.title = t('{n} unread', { n: b.unread });
    h.title = b.folded ? t('Show VibeSpace internal talk — your agent groups and agent chats')
      : t('Fold VibeSpace internal talk into this one row — anything that @-mentions you or awaits you keeps its own row');
    const toggle = () => { setFold('internal', !b.folded); draw(); };
    h.onclick = toggle;
    return h;
  }

  /** ONE row of the first screen: an agent group or a conversation of a linked account. */
  // KEYED ROWS, REUSED WHILE THEIR WORDS ARE THE SAME (verify round 4, 2026-09-27): `draw()` rebuilt every row
  //  on every broadcast — with "Show all" open over 879 conversations a PARTIAL digest naming ONE row cost 90–115 ms
  //  of main thread (measured: 37 % of the thread and a 108 ms p95 frame at four broadcasts a second; a 100 ms hitch
  //  per pass during a first ingest). A row is memoised by its key and the SIGNATURE of everything it prints (the
  //  For-you precedent, reconcileKeyed); the handlers read the entry's CURRENT record, never the one they were
  //  built with. A row that left the digest leaves the memo at the next draw.
  const rowMemo = new Map();   // key → { sig, el, r }
  let memoSeen = new Set();
  // A CONTAINER kept across draws by key (the group list, a part, an account section, its rows box) — its
  //  children are reconciled, never replaced. A key not drawn this time leaves the memo.
  const boxes = new Map();
  let boxSeen = new Set();
  function keep(key, make) { boxSeen.add(key); let n = boxes.get(key); if (!n) { n = make(); boxes.set(key, n); } return n; }
  function memoRow(key, sig, r, build) {
    memoSeen.add(key);
    const ent = rowMemo.get(key);
    if (ent && ent.sig === sig) { ent.r = r; return ent.el; }
    const next = { sig, r, el: null };
    rowMemo.set(key, next);
    next.el = build(() => rowMemo.get(key) ? rowMemo.get(key).r : r);
    return next.el;
  }
  function pruneMemo() {
    for (const k of [...rowMemo.keys()]) if (!memoSeen.has(k)) rowMemo.delete(k);
    for (const k of [...boxes.keys()]) if (!boxSeen.has(k)) boxes.delete(k);
    memoSeen = new Set(); boxSeen = new Set();
  }

  function groupRow(r, now = Date.now()) {
    const st = r.kind === 'conv' ? statusTag(r, now) : null;
    const tag = statusTagParts(st, { now });
    const sig = JSON.stringify(['g', r.kind, r.id, r.adapterId, r.title, r.lastAt, r.unread, r.archived, r.pair, r.memberCount, r.sourceLabel, r.lastText, !!(r.group && r.group.lastCleared), r.conv ? r.conv.kind : '', rowTime(r.lastAt), st && st.code, tag, r.account]);   // r.group.lastCleared: the last line drawn as the cleared sentence ("Clear content…", the merge onto master's signature census)
    return memoRow('g:' + r.key, sig, r, (cur) => groupRowBuild(r, now, cur, st, tag));
  }
  function groupRowBuild(r, now, cur, st, tag) {
    const el = document.createElement('div');
    el.className = 'chan-grow' + (r.unread ? ' chan-grow-unread-on' : '') + (r.archived ? ' chan-grow-archived' : '');
    el.dataset.grow = r.key;
    el.dataset.at = String(r.lastAt || 0);   // the activity instant the list is ordered by
    if (r.kind === 'group') el.dataset.group = r.id;
    // THE LOOK (channel-polish): the conversation's avatar — the SAME circle its window's bar wears
    // (an agent group the people glyph, a mail thread the mail glyph, a chat the title's initials)
    // B-5fe1: …wearing its ACCOUNT's badge (the vendor glyph on the account's own hue — two Lark accounts differ)
    el.appendChild(convAvatar({ key: r.key, title: r.title, kind: r.conv ? r.conv.kind : '', group: r.kind === 'group', badge: r.account, pic: r.conv && r.conv.peer ? { account: r.conv.adapterId, author: r.conv.peer } : null }, null, 'chan-grow-av'));
    const line = document.createElement('div');
    line.className = 'chan-grow-line';
    const title = document.createElement('span');
    title.className = 'chan-grow-title';
    title.textContent = r.title;
    title.title = r.title;
    line.appendChild(title);
    // B-5fe1: with ≥ 2 accounts of one kind the title line says WHICH account, in small text (line 2's source chip
    // then stays away — one account name per row)
    const acct = r.account && r.account.multi ? r.account.label : '';
    if (acct) { const ac = chanEl('span', 'chan-grow-acct', acct); ac.title = t('From your {label} account', { label: acct }); line.appendChild(ac); }
    const at = document.createElement('span');
    at.className = 'chan-grow-at';
    at.textContent = rowTime(r.lastAt);
    if (r.lastAt) at.title = new Date(r.lastAt).toLocaleString(deviceLocale());
    line.appendChild(at);
    el.appendChild(line);
    const sub = document.createElement('div');
    sub.className = 'chan-grow-sub';
    const srcTitle = r.kind === 'group' ? (r.pair ? t('A direct conversation between two agents') : t('An agent group · {n} members', { n: r.memberCount })) : t('From your {label} account', { label: r.sourceLabel });
    // R3 (§23): ONE small TAG says why the row matters (statusTag's first match, worded by statusTagParts);
    // it takes the source chip's slot on line 2 — under the title on every width — and the source rides its title
    if (tag) {
      const g = chanEl('span', `chan-grow-tag chan-tag-${tag.tone}`);
      g.dataset.tag = st.code;
      if (tag.icon) g.appendChild(icon(tag.icon, 9));
      if (tag.before) g.appendChild(chanEl('span', 'chan-tag-words', tag.before));
      if (tag.who) g.appendChild(chanEl('span', 'chan-tag-who', tag.who));
      if (tag.after) g.appendChild(chanEl('span', 'chan-tag-words', tag.after));
      g.title = `${tag.title} · ${srcTitle}`;
      sub.appendChild(g);
    } else if (!acct) {
      const src = document.createElement('span');
      src.className = 'chan-src-chip';
      src.textContent = r.kind === 'group' ? (r.pair ? t('Direct') : t('Agents')) : r.sourceLabel;
      src.title = srcTitle;
      sub.appendChild(src);
    }
    const last = document.createElement('span');
    last.className = 'chan-grow-last';
    last.textContent = r.lastText || '';
    // "Clear content…": the newest line was cleared — the sentence in this device's words, dimmed
    if (r.group && r.group.lastCleared) { last.textContent = clearedText(); last.classList.add('rc-cleared'); }
    sub.appendChild(last);
    if (r.unread) {
      const u = document.createElement('span');
      u.className = 'chan-grow-unread';
      u.textContent = String(r.unread);
      u.title = t('{n} unread', { n: r.unread });
      sub.appendChild(u);
    }
    el.appendChild(sub);
    el.onclick = () => { const x = cur(); app.openChannel(x.adapterId, x.id); };
    el.oncontextmenu = (ev) => {
      ev.preventDefault();
      const x = cur();
      if (x.kind === 'group') showContextMenu(ev.clientX, ev.clientY, groupMenu(app, x.group));
      else showContextMenu(ev.clientX, ev.clientY, menuItems('channel-row', rowMenuCtx(app, x.conv)));
    };
    return el;
  }

  /** THE ACCOUNT CARD (r4 §2.5 / §8.1 #1, the mockup `account-card`): head =
   *  chevron · type glyph · name · client chip · dot · conversations · ✎ · ⋯;
   *  under it the health line OR the error line + Re-authorize button, the
   *  account / pattern grains (R4 §7.3: "Access: … · Notify: …", each rule
   *  on its own line), then EVERY conversation as ↳ rows
   *  (newest first, the rest behind "Show all"). */
  function accountCard(a, mine, siblings, ordinal, badge) {
    const kinds = (digest && digest.kinds) || [];
    const listed = mine.filter((x) => !x.unlisted).sort((x, y) => (y.lastAt || 0) - (x.lastAt || 0));
    const secEl = keep('sec:' + a.id, () => { const el = document.createElement('div'); el.dataset.adapter = a.id; return el; });
    const secKids = [];
    const sec = { appendChild: (x) => { secKids.push(x); return x; }, classList: secEl.classList };
    const folded = EXPANDED.has(a.id) ? false : COLLAPSED.has(a.id);
    secEl.className = 'chan-sec chan-account' + (folded ? ' chan-collapsed' : '');
    // THE HEAD IS A KEPT NODE, PATCHED IN PLACE (verify round 6, 2026-09-27): round 5 kept a head rebuilt EQUAL, but
    //  the count's title ("{n} conversations · {k} unread") changes on every message a broadcast brings, so on a busy
    //  account a trusted 300 ms press on ⋯ across one such broadcast was still lost (3/3 reproduced; 10 % of presses at
    //  a message every 3 s, 70 % under the ingest storm). The skeleton is built ONCE per account (`keep`) and every
    //  draw patches its words — the name, the client chip, the dot, the count — on the same elements; the handlers
    //  are re-assigned so they read the current records. A press in flight is never detached.
    const h = keep('head:' + a.id, () => {
      const el = document.createElement('div');
      el.className = 'chan-sec-head folder-header';
      el.appendChild(icon('chevronDown', 10, 'chan-sec-chev'));
      el.appendChild(document.createElement('span'));   // [1] the kind tile (replaced only when the glyph / kind changes)
      const nm0 = document.createElement('b'); nm0.className = 'chan-sec-name'; el.appendChild(nm0);
      const cc0 = document.createElement('span'); cc0.className = 'chan-chip chan-cred-chip'; cc0.style.display = 'none'; el.appendChild(cc0);
      const dot0 = document.createElement('span'); dot0.className = 'chan-dot'; el.appendChild(dot0);
      const cnt0 = document.createElement('span'); cnt0.className = 'chan-sec-count'; el.appendChild(cnt0);
      const edit0 = document.createElement('button'); edit0.type = 'button'; edit0.className = 'mounts-icon-btn chan-sec-edit';
      edit0.appendChild(icon('pencil', 13));   // the library's own static SVG through the ONE icon helper (§17; no innerHTML here — the groups-ui XSS census)
      el.appendChild(edit0);
      const more0 = document.createElement('button'); more0.type = 'button'; more0.className = 'icon-btn chan-sec-more';
      more0.appendChild(icon('more', 13));
      el.appendChild(more0);
      return el;
    });
    const [, tileSlot, nm, cc, dot, cnt, edit, more] = h.childNodes;
    const name = accountName(a, siblings.get(a.kind) || 1, ordinal.get(a.id) || 1);
    // lane channels-badges (the owner: "至少应该在账号下面把图标对应上"): the account's icon IS the badge its conversations
    //  wear — ONE record (accountBadges: the same glyph on the same hue), ONE element (accountBadge), titled by its name
    const tile = accountBadge(badge, 'chan-sec-kind', name);
    if (!tileSlot.isEqualNode(tile)) tileSlot.replaceWith(tile);
    if (nm.textContent !== name) nm.textContent = name;
    if (h.title !== name) h.title = name;
    // the CLIENT chip: the OAuth client this account signs in through (a preset by its label, or its own)
    const chipText = clientChipText(a);
    cc.style.display = chipText ? '' : 'none';   // (an author `display` on .chan-chip would outrank the hidden attribute)
    if (chipText) { if (cc.textContent !== chipText) cc.textContent = chipText; cc.title = t('The OAuth client this account signs in through — switching it means signing in again.'); }
    const dotState = accountDot(a);
    const dotClass = 'chan-dot chan-dot-' + dotState;
    if (dot.className !== dotClass) dot.className = dotClass;
    if (dot.dataset.state !== dotState) dot.dataset.state = dotState;
    const dTitle = dotTitle(a);
    if (dot.title !== dTitle) dot.title = dTitle;
    // design 008: the account's numbers are the kept facts (its rows are the head + the pages read)
    const total = accountCount(a, listed.length);
    const unreadN = a.scheduler && Number.isFinite(a.scheduler.unread) ? a.scheduler.unread : listed.reduce((n, x) => n + (Number(x.unread) || 0), 0);
    const cntText = String(total);
    if (cnt.textContent !== cntText) cnt.textContent = cntText;
    const cntTitle = unreadN ? t('{n} conversations · {k} unread', { n: total, k: unreadN }) : t('{n} conversations', { n: total });
    if (cnt.title !== cntTitle) cnt.title = cntTitle;
    edit.title = t('Edit the account (client, filters, push)');
    edit.setAttribute('aria-label', t('Edit'));
    edit.onclick = (ev) => { ev.stopPropagation(); showEditAccountDialog(app, a, { kinds }); };
    more.title = t('More actions');
    const openMenu = (x, y) => showContextMenu(x, y, menuItems('channel-adapter', { app, adapter: a, convs: mine, count: total, kinds }));
    // `ev.currentTarget`, never `more`: the handler is re-assigned onto the KEPT button every draw
    more.onclick = (ev) => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); openMenu(r.left, r.bottom + 2); };
    h.onclick = () => {
      const nowFolded = !sec.classList.contains('chan-collapsed');
      sec.classList.toggle('chan-collapsed', nowFolded);
      if (nowFolded) { COLLAPSED.add(a.id); EXPANDED.delete(a.id); } else { COLLAPSED.delete(a.id); EXPANDED.add(a.id); }
    };
    h.oncontextmenu = (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY); };
    sec.appendChild(h);
    for (const n of accountLines(app, a, kinds)) sec.appendChild(n);
    // THE ACCOUNT AND PATTERN GRAINS (§7.3): one line each, the editor on click
    for (const n of grainLines(a)) sec.appendChild(n);
    const rowsEl = keep('rows:' + a.id, () => { const el = document.createElement('div'); el.className = 'chan-rows'; return el; });
    const rowKids = [];
    const rows = { appendChild: (x) => { rowKids.push(x); return x; } };
    for (const conv of listed) rows.appendChild(row(conv, { child: true }));
    moreRows(a, rows);
    if (!listed.length && a.enabled !== false && (a.auth || {}).state === 'connected') rows.appendChild(chanLine('empty-hint empty-hint-inline chan-sec-empty', t('No conversations yet — the first pass lists them.')));
    reconcile(rowsEl, rowKids);
    sec.appendChild(rowsEl);
    reconcile(secEl, secKids);
    return secEl;
  }
  /** design 008: an account's list read past its head — its end reads the next page (200) as it comes near (seamless). */
  function moreRows(a, rows) {
    const end = endOfList(accountList(a.id));
    if (end) rows.appendChild(end);
  }
  /** An account's listed conversations — the kept facts (`counts.byAdapter`), else what is held. */
  function accountCount(a, held) {
    const by = digest && digest.counts && digest.counts.byAdapter;
    return by && Number.isFinite(by[a.id]) ? by[a.id] : held;
  }
  /** "{n} more in All" / "Search messages for …" — a quiet text button under a list. */
  function moreToggle(label, onClick) {
    const b = btn(label, onClick, 'chan-more-btn');
    b.dataset.showAll = '1';
    return b;
  }
  /** The account card's grain lines (R4): the WHOLE ACCOUNT's two facts —
   *  "Access: A (may send), Group · 工作 (drafts) · Notify: A wake per batch"
   *  — and one line per rule ("Rule: title contains … → Access: … · Notify:
   *  …"). A click offers the two operations (Grant access… / Notify…). */
  function grainLines(a) {
    const out = [];
    const line = (grain, text, title, target) => {
      const l = document.createElement('div');
      l.className = 'chan-row-assign chan-grain-line';
      l.dataset.grain = grain;
      l.appendChild(icon('filter', 10));
      const tx = document.createElement('span');
      tx.textContent = text;
      l.appendChild(tx);
      l.title = title;
      l.onclick = (ev) => { ev.stopPropagation(); showGrainMenu(app, target, ev.clientX, ev.clientY); };
      return l;
    };
    const g = a.accountGrain;
    if (g && ((g.access || []).length || (g.watchers || []).length)) out.push(line('account', grainSummaryText(g), t('The whole account: who may see and act on every conversation, and who is woken. Click for Grant access… / Notify….'), { kind: 'account', adapter: a }));
    for (const pa of a.patterns || []) out.push(line('pattern', t('Rule: {rule} → {grant}', { rule: pa.patternLabel || '', grant: grainSummaryText(pa) }), t('Conversations matching this rule — now and later. Click for Grant access… / Notify….'), { kind: 'pattern', adapter: a, id: pa.id }));
    return out;
  }

  /** One ADAPTER section: an ACCOUNT (connectable) is the credential-first
   *  card (`accountCard`); a SOURCE — the built-in agents watcher, a
   *  scan-only fixture — lists every conversation it discovered. */
  function section(a, mine, siblings, ordinal, badge) {
    if (a.connectable) return accountCard(a, mine, siblings, ordinal, badge);
    const secEl = keep('sec:' + a.id, () => { const el = document.createElement('div'); el.dataset.adapter = a.id; return el; });
    const secKids = [];
    const sec = { appendChild: (x) => { secKids.push(x); return x; }, classList: secEl.classList };
    // The built-in Agents adapter lists every live session on this instance —
    // a list the sidebar already shows. Until one of them is assigned it is
    // folded by default (owner 2026-09-21: "展示一堆agents意义不明"), and a
    // caption says what assigning does; an explicit open/close survives repaints.
    const builtinAgents = !!a.builtin;
    const nothingAssigned = mine.length > 0 && !mine.some((x) => x.assignment);
    const folded = EXPANDED.has(a.id) ? false : (COLLAPSED.has(a.id) || (builtinAgents && nothingAssigned));
    secEl.className = 'chan-sec' + (folded ? ' chan-collapsed' : '');
    const h = document.createElement('div');
    h.className = 'chan-sec-head folder-header';
    h.appendChild(icon('chevronDown', 10, 'chan-sec-chev'));
    // THE LOOK (channel-polish): the account's kind as a small tile on its hue (paint — the name follows)
    h.appendChild(accountBadge(badge, 'chan-sec-kind', a.label || a.id));   // lane channels-badges: the card's icon = its rows' badge
    const nm = document.createElement('b');
    nm.className = 'chan-sec-name';
    const kindCount = siblings.get(a.kind) || 1;
    const name = accountName(a, kindCount, ordinal.get(a.id) || 1);
    nm.textContent = name;
    // under a 180px container the name hides and the glyph + count stand for it; the tooltip keeps the kind beside the account
    h.title = name === (a.label || a.id) ? name : `${a.label || a.id} · ${name}`;
    h.appendChild(nm);
    const dot = document.createElement('span');
    dot.className = 'chan-dot chan-dot-' + adapterDot(a);
    dot.title = dotTitle(a);
    h.appendChild(dot);
    const cnt = document.createElement('span');
    cnt.className = 'chan-sec-count';
    const total = accountCount(a, mine.length);
    cnt.textContent = String(total);
    cnt.title = t('{n} conversations', { n: total });
    h.appendChild(cnt);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'icon-btn chan-sec-more';
    more.title = t('More actions');
    more.appendChild(icon('more', 13));
    const openMenu = (x, y) => showContextMenu(x, y, menuItems('channel-adapter', { app, adapter: a, convs: mine, count: total, kinds: (digest && digest.kinds) || [] }));
    // `ev.currentTarget`, never `more`: reconcile may adopt this handler onto the KEPT button (round 5) and `more` is then the fresh, detached one
    more.onclick = (ev) => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); openMenu(r.left, r.bottom + 2); };
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
      note.textContent = nothingAssigned
        ? t('Your live agent sessions on this instance — the same list as the sidebar. Assign one to another agent to have its messages followed.')
        : t('Your live agent sessions on this instance. Assigned ones wake the agent they are handed to.');
      sec.appendChild(note);
    }
    // the status line(s) — only when there is something to say (a1 D1/D6)
    for (const n of adapterNotes(app, a)) sec.appendChild(n);
    // a SOURCE that is not built in takes the account and pattern grains too (§7.3)
    if (!builtinAgents) for (const n of grainLines(a)) sec.appendChild(n);
    const rowsEl = keep('rows:' + a.id, () => { const el = document.createElement('div'); el.className = 'chan-rows'; return el; });
    const rowKids = [];
    const rows = { appendChild: (x) => { rowKids.push(x); return x; } };
    const listed = mine.filter((x) => !x.unlisted).sort((x, y) => (y.lastAt || 0) - (x.lastAt || 0));
    if (!listed.length) {
      const e = document.createElement('div');
      e.className = 'empty-hint empty-hint-inline chan-sec-empty';
      e.textContent = t('No conversations discovered yet.');
      rows.appendChild(e);
    }
    for (const conv of listed) rows.appendChild(row(conv));
    moreRows(a, rows);
    reconcile(rowsEl, rowKids);
    sec.appendChild(rowsEl);
    reconcile(secEl, secKids);
    return secEl;
  }

  function row(conv, { child = false } = {}) {
    // THE SIGNATURE NAMES EVERY FACT THE ROW PRINTS (verify round 5, 2026-09-27): line 3 is assignmentSummary(conv)
    //  = the WHOLE `access` and `watchers` lists, while round 4 signed only `assignment` (the FIRST watcher / access
    //  row) — a second principal granted access, or the second watcher's cadence, never reached the row until an
    //  unrelated field moved (reproduced: "Access: Alpha" after "Access: [Alpha, Beta]" was saved). The fast census
    //  (test-channels-groups-ui §3) reads every `conv.<field>` the builder and its helpers touch against this list.
    const sig = JSON.stringify(['r', child, conv.adapterId, conv.id, conv.title, conv.kind, conv.unread, conv.freshness, conv.participants, conv.outbox && conv.outbox.awaiting, conv.assignment, conv.access, conv.watchers, conv.held]);
    return memoRow(`${child ? 'c' : 'r'}:${conv.adapterId}/${conv.id}`, sig, conv, (cur) => rowBuild(conv, child, cur));
  }
  function rowBuild(conv, child, cur) {
    const el = document.createElement('div');
    el.className = 'chan-row session-item-card' + (child ? ' chan-row-child' : '') + (conv.unread ? ' chan-row-unread' : '');
    el.dataset.conv = `${conv.adapterId}/${conv.id}`;
    // line 1: the title + ONE freshness pill (the honesty contract)
    const line = document.createElement('div');
    line.className = 'chan-row-line';
    const title = document.createElement('span');
    title.className = 'chan-row-title';
    title.textContent = conv.title || chanCaps.untitledText(conv.kind, { t });   // lane lark-search-poll: never the raw vendor id
    // the 172px default rail truncates a long title; the tooltip keeps it readable — and
    // carries the freshness sentence, which the ≤180px container hides as a pill
    const fresh = chanCaps.freshnessText(conv.freshness || {}, { t }) || t('unknown');
    title.title = `${conv.title || conv.id} — ${fresh}`;
    // an account's conversation is its CHILD row: the storage child-row arrow
    if (child) { const ar = document.createElement('span'); ar.className = 'mounts-child-arrow'; ar.textContent = '↳'; line.appendChild(ar); }
    line.appendChild(title);
    // the ONE freshness pill — every row is fetched (2026-09-26), so every row has its claim
    line.appendChild(chip(conv.freshness));
    el.appendChild(line);
    // line 2: participants + the needs-you badges (right)
    const sub = document.createElement('div');
    sub.className = 'chan-row-sub';
    const who = document.createElement('span');
    who.className = 'chan-row-who';
    who.textContent = conv.participants || '';
    sub.appendChild(who);
    const awaiting = conv.outbox && conv.outbox.awaiting ? Number(conv.outbox.awaiting) : 0;
    const unread = conv.unread ? Number(conv.unread) : 0;
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
    // line 3 (P2): the assignment IN EFFECT (§7.3: its own, or inherited from
    // the account / a rule — dim, labelled), authority clamped; a held/stashed
    // last wake says so in amber.
    if (conv.assignment) {
      const asg = document.createElement('div');
      const held = !!conv.held;
      const inherited = conv.assignment.source && conv.assignment.source !== 'conversation';
      asg.className = 'chan-row-assign' + (held ? ' chan-warn' : '') + (inherited ? ' chan-row-inherited' : '');
      asg.dataset.grain = conv.assignment.source || 'conversation';
      asg.appendChild(icon('filter', 10));   // the glyph is an SVG (§17) — the sentence used to start with a '→'
      const asgText = document.createElement('span');
      asgText.textContent = assignmentSummary(conv) + (held ? ' · ' + t('last wake held') : '');
      asg.appendChild(asgText);
      asg.title = held ? t('Last wake was held or stashed — open the conversation\'s Assign & filter for the reason') : assignmentSummary(conv);
      el.appendChild(asg);
    }
    el.onclick = () => { const x = cur(); app.openChannel(x.adapterId, x.id); };
    el.oncontextmenu = (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, menuItems('channel-row', rowMenuCtx(app, cur())));
    };
    return el;
  }

  // A LIST FETCHED BEFORE A NEWER BROADCAST NEVER REPLACES IT (lane-redact verify r6 — the r5 ⑧ class, reproduced in
  // chrome): the reconnect refresh's /api/channel-groups, answered before a "Clear content…" of a group's newest message
  // and parsed after the clear's `channel-groups-updated`, drew the cleared words back as the group row's last line. Every
  // group list this panel applies bumps `groupsGen`; a refresh keeps its answer only when none landed while it waited.
  let groupsGen = 0;
  async function refresh() {
    const g0 = groupsGen;
    const [d, g] = await Promise.all([fetchJson('/api/channels'), fetchJson('/api/channel-groups'), loadFolds(app)]);
    if (!c.isConnected) return;
    if (d && d.error) { root.textContent = ''; const e = document.createElement('div'); e.className = 'empty-hint'; e.textContent = d.error; root.appendChild(e); return; }
    // design 008: the FIRST READ (bounded) — a reconnect's too; the lists it leaves stale are re-read below
    const stale = applyFirst(store, d, Date.now());
    digest = store.meta;
    // a refused group list is an EMPTY list plus a toast — the channel half still draws
    if (groupsGen !== g0) { /* a broadcast's list landed while this one was on its way — it is newer */ }
    else if (g && !g.error) groups = Array.isArray(g.groups) ? g.groups : [];
    else { groups = []; if (g && g.code !== 'unavailable') showToast(groupErrorText(g), { type: 'error' }); }
    draw();
    reread(stale);
    wantAll();
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
      if (!Array.isArray(msg.groups)) return;
      groups = msg.groups; groupsGen++;   // kept even before the first paint: the refresh on its way keeps this newer list
      if (digest === null) return;   // the first paint is refresh()'s
      draw();
      return;
    }
    if (msg.type !== 'channels-updated') return;
    // design 008: a partial broadcast patches the held rows by key (the never-loaded rule); a whole one is the FIRST
    //  READ's bounded shape — the list on screen re-reads what it had (≤ 200 rows), never a fetch per partial
    if (msg.digest) { const r = applyBroadcast(store, msg.digest, Date.now()); digest = store.meta; if (groups !== null) draw(); reread(r.refetch); } else refresh().catch(() => {});
  };
  app.ws.onGlobal(onBroadcast);
  // A BROADCAST SENT WHILE THE SOCKET WAS DOWN NEVER ARRIVES (lane R2 verify
  // r3, the desktop-app-prefs / For-you rule): a partial digest missed during
  // a reconnect left a row's unread / freshness / held-hits stale until the
  // next WHOLE digest (an account-level change — passes are partial). Re-read
  // on every reconnect; the first paint is refresh()'s own (`digest === null`).
  const onState = (up) => { if (up && digest !== null && c.isConnected) refresh().catch(() => {}); };
  app.ws.onStateChange?.(onState);
  const foldListener = { c, draw };
  FOLD_LISTENERS.add(foldListener);
  refresh().catch(() => {});
  return () => { FOLD_LISTENERS.delete(foldListener); try { app.ws.offGlobal(onBroadcast); } catch {} try { app.ws.offStateChange?.(onState); } catch {} };
}

// RECONCILE a parent's children with `out` IN PLACE (verify round 4, 2026-09-27): a node not wanted leaves first,
//  then every wanted node is put at its index — a node already there is NEVER touched (a detached row re-laid out
//  879 rows per broadcast and lost the click in flight on it). Exported for the suite.
//
//  A NODE REBUILT THE SAME IS KEPT (verify round 5, 2026-09-27): the rows are memoised, but every other node —
//  an account section's HEAD (the fold, ⋯, ✎, Re-authorize), its grain lines, "Show all", the archived toggle —
//  is built fresh per draw, so a trusted click on ⋯ across a broadcast was lost exactly as round 4's row click
//  (reproduced: the menu never opened, the fold never toggled). A fresh node structurally EQUAL to the one at its
//  place (`isEqualNode`: tag, attributes, text, children) is the same thing said again: the old node stays and
//  only its handler PROPERTIES are refreshed from the new one (the panel wires `onclick` / `oncontextmenu`, never
//  addEventListener, on the nodes it rebuilds — test-channels-groups-ui §3 is the census), so the handlers read
//  the current records. A node that changed is replaced as before.
const HANDLER_PROPS = Object.freeze(['onclick', 'oncontextmenu']);
function adoptHandlers(keptNode, freshNode) {
  for (const k of HANDLER_PROPS) if (keptNode[k] !== freshNode[k]) keptNode[k] = freshNode[k];
  const a = keptNode.childNodes, b = freshNode.childNodes;
  for (let i = 0; i < a.length && i < b.length; i++) if (a[i].nodeType === 1 && b[i].nodeType === 1) adoptHandlers(a[i], b[i]);
}
export function reconcile(parent, out) {
  const want = new Set(out);
  const kids = parent.childNodes;
  // a fresh node equal to the old one at its index is the old one (kept, handlers refreshed)
  for (let i = 0; i < out.length && i < kids.length; i++) {
    const old = kids[i], fresh = out[i];
    if (old === fresh || want.has(old) || !fresh || fresh.isConnected || fresh.nodeType !== 1 || old.nodeType !== 1) continue;
    if (old.isEqualNode(fresh)) { adoptHandlers(old, fresh); out[i] = old; want.add(old); want.delete(fresh); }
  }
  for (const k of [...kids]) if (!want.has(k)) k.remove();
  for (let i = 0; i < out.length; i++) if (kids[i] !== out[i]) parent.insertBefore(out[i], kids[i] || null);
}

// (design 008: `mergeDigest` — the whole list re-sorted on every partial broadcast — is retired; the keyed store's
//  applyBroadcast, src/lib/channel-rows.js, is the rule.)

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
  for (const [, w] of app.wm.windows) if (w.type === 'channels') { app.wm.revealWindow(w.id, { replay: !!syncId }); return w; }
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
