// THE OUTBOX (docs/design-communication-panel.zh.md §9.2, §9.5, §10.1; P3;
// the a4 UI design docs/design-communication-panel-ui.md §4.2 / §4.3).
//
// ONE RECORD, THREE PLACES: the approval card below is rendered INLINE in the
// conversation window (context lives there), in this Outbox window (the
// queue lives there) and — lane chat-proposal-card — in the AGENT'S CHAT at
// the call row that filed it (where it was made; `chatProposalCards`, at the
// end) — all from the same server store, so they cannot disagree. Every
// fact on the card is the digest's STRUCTURE and the words
// are composed here in the device's language (the identity warning through
// `chanCaps.identityWarningText`, exactly as the composer does).
//
// THE CARD IS FIVE LINES (a1 C1): head (state pill · drafter · age) → the
// text → ONE meta line (why · needs approval · will send as · expires ·
// the sender line) → the identity warning ONCE, only when it warns → actions
// right-aligned with ONE primary (Approve). The outcome sentence and the
// reconcile / receipt facts are a quiet footer. State colour = meaning (C2):
// awaiting accent, sent green, failed red, UNKNOWN AMBER (the one state §9.4
// says is not a failure), rejected neutral.
//
// THE IDENTITY ROW (§9.5): "Will send as <user>" on every card; when the
// adapter's `identityMarking` is not `none` a WARNING beside it, showing the
// adapter's own verbatim sentence (or saying the attribution is unverified —
// `unknown` warns as loudly as `marked`). Honesty is owed to the one pressing
// Approve, never pushed into the recipient's message.
//
// THE OUTBOX WINDOW is a toolbar (summary + an Awaiting | All segment) over
// ONE scrolling list: Awaiting = the queue; All = every proposal newest first
// with its state pill (lane outbox-window-scroll-filter — the per-state heads
// of direction B gave way to the census's sections; see below).
//
// Every vendor / agent string is textContent (fence 5): a proposal's text is
// an agent's, the reason is an adapter's, the why is a label — none of it
// reaches innerHTML.
//
// 2026-09-27: WITHDRAWN — the drafting agent took its proposal back: a dim,
// settled card ("Withdrawn by <agent> · <why>"), no buttons. THE DELIVERY
// CHOICE ON THE ACTION (owner ruling): an agent's draft is decided with a
// SPLIT button — "Approve ▾" / "Reject ▾" — whose primary is this device's
// last-used choice ("tell the agent with your next message", free, or "wake
// the agent now", a started turn) and whose menu offers both (+ "Approve with
// edits…"). THE FATE LINE says whether the agent knows yet ("Handed to <agent>
// at 14:02" / "Waiting for <agent>'s next message" / "<agent> is gone —
// receipt kept"). CARDS ARE KEYED (`data-proposal` + a signature): a
// broadcast re-renders only a card whose record changed, a fate-only change
// patches the fate line in place, and a card the user is editing is left
// alone while its record stands.
//
// r6 verify (2026-09-28, "what you approve is what runs"): the ENVELOPE is one
// fact per wrapping line (where · To · Cc · Subject — never a clipped
// ellipsis), a reply says WHAT it answers ("In reply to <author> — <excerpt>")
// and, for mail, WHO receives it (resolved when it was proposed, sent
// verbatim); an invisible direction / zero-width character in the text is a
// visible mark; a card that just appeared or MOVED is inert for `P.ARM_MS`
// (`placeArmed`) and Approve posts `shown` = the PURE digest of the record the
// card showed — the engine refuses anything else (`changed-since-shown`).
//
// B-f467 (userW, 2026-10-03: the cards have "no visual centre of gravity —
// some things I want to see at a glance"; he pointed at the channel list):
// THE OUTBOX WINDOW LISTS ONE ROW PER PROPOSAL in the channel list's row
// grammar — the conversation's avatar wearing its account badge · WHO
// receives it and WHERE (+ the account at ≥ 2 of a vendor) · the time /
// the state pill · the first line of the text · the primary ("Approve…" on
// an awaiting one). The FULL CARD — this same renderer, the one
// implementation — opens under its row on click or Enter. "Approve…" opens
// the card and focuses ITS Approve: a decision is taken where the whole text,
// the identity warning and the delivery choice are drawn (§9.5, verify r3 —
// the approval rules are unchanged). The inline section keeps cards.
//
// lane channel-window-tidy (the owner, 2026-10-03: "这个已经处理过的提案堆在最下面有点浪费空间和交互起来很麻烦"):
// in the CONVERSATION WINDOW a proposal that still waits keeps its full card; a DECIDED one (sent / rejected /
// withdrawn / expired / failed / unknown) is ONE LINE — the state chip · who drafted it · when · its recipients in
// a few words ("Reply all · 7 people") · the first words — and a click opens the full card IN PLACE (the line is
// the card's own first row; the open state lives in the window's `ui`, so a redraw keeps it). A sent one's card
// offers "Jump to this message" (it is a message of the thread now). More than `INLINE_FOLD_OVER` decided ⇒ the
// settled ones sit under ONE folded line "Handled proposals (N)" that opens in place; an unknown / failed outcome
// is never folded away (it still asks something of the owner). The Outbox window is unchanged.
//
// lane outbox-window-scroll-filter (the owner, 2026-10-22, the Outbox window: «1 条待我审批 这一条在哪呢？» and «这个窗口里不能滚动，只能拉长
// 窗口才能看到下面那个要发的消息»): the API calls' section sat OUTSIDE the list, so its 20 rows squeezed the list — the one waiting
// message in it — to 0 px, and it ignored the filter. Now THE LIST IS THE WINDOW'S ONE SCROLL CONTAINER and every section (the
// message proposals, the API calls) lives inside it; ONE PURE census (src/outbox-census.js) counts the head and the sections
// and decides the view: 「待审批」 = ONLY what waits, the sections holding it first, a section with nothing waiting FOLDED to its
// summary line (「在「全部」里看」); 「全部」 = everything newest first with its outcome (the per-state heads are gone). An API row
// is the card law's «actor · action · named object» + the policy chip + a short status, identical consecutive rows ONE row ×n;
// its ids, HTTP status and size sit in the card's 技术细节 fold.
import { fetchJson, showToast, showContextMenu, showImageOverlay } from './utils.js';
import { urlViewerKind } from './file-types.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerCommand, registerMenuItem } from './contributions.js';
import { icon, el, btn, convAvatar } from './channel-chrome.js';
import { autosizeEditor } from './channel-editor-size.js';   // lane channel-edit-autosize: every message editor opens at its text's size
import { accountBadges } from './channel-avatar.js';   // B-f467: the row's avatar wears its account badge (B-5fe1)
import * as chanCaps from '../channel-caps.js';
// PURE, bundled (a3 i18n): the proposal's OUTCOME as structure → words here.
import * as P from '../channel-policy.js';
// a3 i18n: a route failure is worded by its CODE, never by the engine's sentence.
import { routeErrorText } from './channel-words.js';
import { apiOutboxSection, outboxSecHead, paintSecHead } from './channel-api-card-view.js';   // B-2198 part 2: one row per raw-API proposal, its card under it
import { fateOf as apiFate } from '../channel-api-card.js';
import { outboxCensus, outboxView } from '../outbox-census.js';   // lane outbox-window-scroll-filter: ONE count, ONE filter
import { attachDictation, voiceField } from './voice-input.js'; // lane voice-everywhere: the microphone on every message box
import { enterSubmits } from './chat-enter-keys.js';

const ICON = svgIcon16('<path d="M2.5 4.5h11v8h-11z"/><path d="M2.5 4.5l5.5 4 5.5-4"/><path d="M8 2v3"/>');
const JSON_HDR = { 'Content-Type': 'application/json' };
/** The Outbox's All view: the order states are grouped in (attention first). */
/** This device's last-used receipt delivery (the split buttons' primary). */
const DELIVER_KEY = 'vibespace.channels.receiptDeliver';
export function rememberedDelivery() { try { return localStorage.getItem(DELIVER_KEY) === 'wake-now' ? 'wake-now' : 'next-turn'; } catch { return 'next-turn'; } }
function rememberDelivery(v) { try { localStorage.setItem(DELIVER_KEY, v === 'wake-now' ? 'wake-now' : 'next-turn'); } catch { } }
/** THE PRESS DOES WHAT THE BUTTON SAYS (verify r3, 2026-09-27): a primary
 *  Approve's delivery is read off the button's OWN `data-deliver` — the one
 *  fact its label was worded from — never off the remembered choice at click
 *  time. Reproduced: "Reject with a reason and wake now" picked on card A
 *  (the box opens, nothing is posted, no broadcast), then card B's primary
 *  still reading "Approve — tell the agent with your next message" posted
 *  `deliver: wake-now, expectWakes: 1` — a billed turn the words said was
 *  free. The remembered choice reaches every visible primary through
 *  `relabelPrimaries` the moment it moves. */
export function pressedDelivery(button) { return button && button.dataset && button.dataset.deliver === 'wake-now' ? 'wake-now' : 'next-turn'; }
/** Every visible agent-draft primary on this page follows the remembered choice, words and fact together. */
export function relabelPrimaries(want = rememberedDelivery(), root = document) {
  for (const b of root.querySelectorAll('.chan-prop button[data-approve][data-deliver]')) {
    if (b.dataset.deliverFixed || b.dataset.deliver === want) continue;   // a reaction / recall: always next-turn
    b.dataset.deliver = want;
    const card = b.closest('.chan-prop');
    b.textContent = approveLabel(want, { edited: !!(card && card.querySelector('.chan-prop-edit')) });
  }
}
/** The Approve words for a delivery choice — the COST in plain language. */
export function approveLabel(deliver, { edited = false } = {}) {
  if (deliver === 'wake-now') return edited ? t('Approve edited and wake the agent now (starts a turn)') : t('Approve and wake the agent now (starts a turn)');
  return edited ? t('Approve edited — tell the agent with your next message') : t('Approve — tell the agent with your next message');
}
/** The Reject menu's words and the reject box's button. */
export function rejectLabel(deliver, { box = false } = {}) {
  if (deliver === 'wake-now') return box ? t('Reject and wake now') : t('Reject with a reason and wake now');
  return box ? t('Reject') : t('Reject — tell on its next message');
}
/** lane channel-window-tidy: the decided proposals the inline section lists as lines (the newest N — the rest are
 *  counted into its Outbox link), and how many it shows before the settled ones fold under one line. */
const INLINE_DECIDED = 20;
const INLINE_FOLD_OVER = 3;

/** O1 (r6 verify, 2026-09-28): `s` into `node` as text, each invisible direction / zero-width character drawn as a
 *  visible mark (`U+202E`) — never the character itself, so the line reads in the order it is SENT. Returns the
 *  marks' names (distinct). textContent only. */
function revealInto(node, s) {
  const names = [];
  for (const seg of P.revealSegments(s)) {
    if (seg.hidden) {
      const m = el('span', 'chan-prop-hidden', seg.hidden);
      m.title = t('An invisible character that changes how the text reads — it is sent as it is');
      node.appendChild(m);
      if (!names.includes(seg.hidden)) names.push(seg.hidden);
    } else node.appendChild(document.createTextNode(seg.text));
  }
  return names;
}
/** lane outbox-attachment-preview: what a click on an attachment does — 'overlay' (a raster picture: THE image overlay),
 *  'viewer' (a type the viewer draws from a URL: a `viewer` window) or 'download' (nothing to preview). PURE. */
export function attachmentOpenKind(name, mime) {
  if (P.INLINE_RASTER.includes(String(mime || '').toLowerCase())) return 'overlay';
  return urlViewerKind(name, mime) === 'none' ? 'download' : 'viewer';
}
/** THE ONE open door for an attachment served by URL (a draft's row here, a message's file chip in the channel
 *  window): the picture into showImageOverlay, a document into `app.openFile({rawUrl})`; returns what it did. */
export function openAttachment(app, { url, name, mime }) {
  const kind = attachmentOpenKind(name, mime);
  const a = app || globalThis.app;
  if (kind === 'overlay') { showImageOverlay(P.attachmentUrlFor(url, { inline: true })); return kind; }   // a blob: URL (a reply-box file) takes no ?inline=1
  if (kind === 'viewer' && a && typeof a.openFile === 'function') { a.openFile({ rawUrl: url, fileName: name, mime }); return kind; }
  return 'download';
}
/** lane compose-chip-open (owner 2026-10-09 "上传上去的文件不能查看预览"): a file still in the owner's reply box opens
 *  through THE ONE door from its local File — a blob URL minted on the first open (a picture reuses its thumb's), held
 *  on the pick (`p.url`) and revoked by the composer with the chip; `p.mime` = the File's type, else the sniffed one. */
export function openComposePick(app, p) {
  if (!p.url && p.file) p.url = URL.createObjectURL(p.file);
  return p.url ? openAttachment(app, { url: p.url, name: p.name, mime: p.mime }) : 'download';
}
/** card grammar (lane card-grammar-exceptions): a file's KIND in the reader's words (P.attachmentKind) — the row's size
 *  chip reads 「图片 · 2 KB」; the FORMAT a sniffed type is called by (the name / type mismatch chip) — never a mime literal. */
const KIND_WORDS = { image: () => t('Image'), pdf: () => 'PDF', document: () => t('Document'), spreadsheet: () => t('Spreadsheet'), slides: () => t('Presentation'), text: () => t('Text'), page: () => t('Web page'), archive: () => t('Compressed file'), audio: () => t('Audio'), video: () => t('Video') };
const kindWord = (a) => (KIND_WORDS[P.attachmentKind(a.name, a.mime)] || (() => t('File')))();
const formatWord = (mime) => P.attachmentFormat(mime) || (mime === 'text/plain' ? t('plain text') : t('unknown data'));
/** design 005 §2.B: the attachment rows (keyed by the card — a changed record redraws the card). lane
 *  outbox-attachment-preview: a click on the thumb or the name OPENS (openAttachment); the ⤓ beside it downloads. */
function appendAttachments(card, p, app = null) {
  const files = P.storedAttachments(p);
  if (!files.length) return;
  const gone = !!p.attachmentsGoneAt;
  // lane lark-upload-preflight (userW inc-muxsy69b-mjg1): files this account cannot carry never LOOK attached — each row
  // says it will not be sent, one warning names the way out, and the Approve below reads "Send without the file"
  const blocked = !gone && p.state === 'awaiting-approval' && !!p.filesBlocked;
  const box = el('div', blocked ? 'chan-prop-files chan-prop-files-blocked' : 'chan-prop-files');
  for (const a of files) {
    const row = el('div', 'chan-prop-file');
    const url = `/api/channels/outbox/${encodeURIComponent(p.id)}/attachment/${encodeURIComponent(String(a.n))}`;
    if (!gone && P.INLINE_RASTER.includes(a.mime)) {
      const img = document.createElement('img');
      img.className = 'chan-prop-file-thumb';
      img.alt = '';
      img.loading = 'lazy';
      img.src = `${url}?inline=1`;
      img.title = t('Open {name}', { name: a.name });
      img.onclick = () => openAttachment(app, { url, name: a.name, mime: a.mime });
      row.appendChild(img);
    }
    let name;
    if (gone) name = el('span', 'chan-prop-file-name');
    else {
      name = document.createElement('a'); name.className = 'chan-prop-file-name'; name.href = url;
      const kind = attachmentOpenKind(a.name, a.mime);
      if (kind === 'download') name.setAttribute('download', '');
      else {
        name.classList.add('chan-prop-file-open'); name.dataset.open = kind;
        name.title = t('Open {name}', { name: a.name });
        name.onclick = (ev) => { ev.preventDefault(); openAttachment(app, { url, name: a.name, mime: a.mime }); };   // Enter on the focused name = a click
      }
    }
    revealInto(name, a.name);
    row.appendChild(name);
    const meta = el('span', 'chan-prop-file-meta', `${kindWord(a)} · ${P.attachmentSize(a.bytes)}`);   // card grammar: the kind + the size, a size chip
    meta.dataset.chip = 'size';
    row.appendChild(meta);
    if (!gone) {
      const dl = document.createElement('a');
      dl.className = 'chan-prop-file-dl'; dl.href = url; dl.setAttribute('download', '');
      dl.title = t('Download {name}', { name: a.name }); dl.setAttribute('aria-label', dl.title);
      dl.appendChild(icon('download', 12));
      row.appendChild(dl);
    }
    if (blocked) { row.classList.add('chan-prop-file-blocked'); row.appendChild(el('span', 'chan-prop-file-chip chan-warn', t('will NOT be sent'))); }
    const mm = P.nameTypeMismatch(a.name, a.mime);
    if (mm) row.appendChild(el('span', 'chan-prop-file-chip chan-warn', t('named .{ext}, but its bytes are {type}', { ext: mm.ext, type: formatWord(a.mime) })));
    box.appendChild(row);
  }
  if (blocked) {
    const w = el('div', 'chan-prop-file-note chan-warn', t('This account’s sign-in ({account}) cannot send files — re-authorize it, or send without the file.', { account: p.adapterLabel || p.adapterId }));
    w.dataset.filesBlocked = (p.filesBlocked.requiredScopes || []).join(' ');
    if (w.dataset.filesBlocked) w.title = t('Needs one of: {scopes}', { scopes: (p.filesBlocked.requiredScopes || []).join(', ') });
    box.appendChild(w);
  } else box.appendChild(el('div', 'chan-prop-file-note', gone ? t('The files are no longer kept — the card keeps their names, sizes and checksums.') : t('Exactly these bytes are sent; if a file changes, the send is refused.')));
  // card grammar ④: the raw facts of every file — the type its bytes sniffed as, the exact byte count, the whole sha256
  // (what "exactly these bytes" is checked against) — under ONE collapsed 技术细节 fold, never on the row
  const tech = el('details', 'chan-prop-files-tech');
  tech.dataset.fold = 'tech';
  tech.appendChild(el('summary', '', t('Technical details')));
  for (const a of files) tech.appendChild(el('div', 'chan-prop-files-tech-line', `${a.name} · ${a.mime} · ${Number(a.bytes) || 0} B · sha256 ${a.sha256}`));
  box.appendChild(tech);
  card.appendChild(box);
}
/** F4 (r6 verify): ONE envelope fact per line — its label, then its value, wrapping, never clipped. */
function envRow(cls, label, value) {
  const row = el('div', `chan-prop-env ${cls}`);
  row.appendChild(el('span', 'chan-prop-env-k', label));
  const v = el('span', 'chan-prop-env-v');
  revealInto(v, value);
  row.appendChild(v);
  return row;
}
/** F1 / F3 (r6 verify): what the reply ANSWERS (its author + an excerpt of the stored message) and, where the
 *  adapter derives them from it, WHO RECEIVES it — the recipients resolved when it was proposed, sent verbatim. */
function appendReplyTarget(card, p) {
  const a = p.replyAnchor;
  if (a && a.vendorId) {
    const au = a.author || {};
    const who = au.isSelf ? t('you') : (au.name || au.id || '');
    const row = el('div', 'chan-prop-env chan-prop-anchor');
    row.appendChild(el('span', 'chan-prop-env-k', t('In reply to')));
    const v = el('span', 'chan-prop-env-v');
    if (who) { const w = el('span', 'chan-prop-anchor-who'); revealInto(w, who); v.appendChild(w); v.appendChild(document.createTextNode(' — ')); }
    revealInto(v, a.excerpt || '');
    row.appendChild(v);
    row.title = t('message {id}', { id: a.vendorId });
    card.appendChild(row);
  }
  const e = p.replyEnvelope;
  if (e && e.to) {
    // B-a085: EVERY recipient before Approve — a reply-all's To and Cc in full, and apart the addresses the DRAFTER
    // added (`reply --cc`) beside the thread's own people
    const toRow = envRow('chan-prop-to', e.all ? t('To (reply all)') : t('To'), e.to);
    if (e.all) toRow.dataset.replyAll = '1';
    card.appendChild(toRow);
    if (e.cc) card.appendChild(envRow('chan-prop-cc', t('Cc'), e.cc));
    if (Array.isArray(e.added) && e.added.length) card.appendChild(envRow('chan-prop-added', t('Cc added by the drafter'), e.added.join(', ')));
    if (e.subject) card.appendChild(envRow('chan-prop-subject', t('Subject'), e.subject));
  }
  // design 012 (Slack S1, D20 / D21): WHO WILL SEE IT and WHO IT NOTIFIES — both decided when it was proposed (the ids
  // sent are the ones decided then); an @name that matched nobody is said, it goes out as plain words
  if (p.audience && p.audience.kind) card.appendChild(envRow('chan-prop-audience', t('Seen by'), audienceText(p.audience)));
  const pr = p.prepared;
  if (pr && typeof pr === 'object') {
    card.appendChild(envRow('chan-prop-notifies', t('Notifies'), Array.isArray(pr.notifies) && pr.notifies.length ? pr.notifies.join(', ') : t('nobody (no @name here was resolved)')));
    if (Array.isArray(pr.plain) && pr.plain.length) card.appendChild(envRow('chan-prop-plain', t('Not a member here'), t('{names} — sent as plain words, nobody is notified', { names: pr.plain.map((n) => '@' + n).join(', ') })));
  }
}
/** design 012 D20: the audience in words — a DM, a private conversation's members, the whole workspace, or a
 *  conversation shared with other organizations (named). */
function audienceText(a) {
  const orgs = Array.isArray(a.orgs) ? a.orgs : [];
  const title = a.title ? `${a.title} · ` : '';
  if (a.kind === 'dm') return t('only the person in this direct message');
  if (a.kind === 'private') return title + (Number.isInteger(a.members) ? t('its {n} members', { n: a.members }) : t('its members'));
  if (a.kind === 'external') return title + t('everyone in it — includes people from {orgs}', { orgs: orgs.slice(1).join(', ') || t('another organization') });
  return title + (orgs[0] ? t('everyone in {org}', { org: orgs[0] }) : t('everyone in the workspace')) + (Number.isInteger(a.members) ? ` (${a.members})` : '');
}
/** F6 (r6 verify): a card that just appeared or moved takes no decision for `P.ARM_MS` — it LOOKS inert
 *  (`chan-prop-arming`) and a person's click on it does nothing but say so; the verdict is PURE (`P.armVerdict`). */
const ARMING_TITLE = () => t('Just appeared or moved — read it first, then decide');
function armCard(card, at = Date.now()) {
  card.dataset.armedAt = String(at + P.ARM_MS);
  card.classList.add('chan-prop-arming');
  const act = card.querySelector(':scope > .chan-prop-actions');
  if (act) act.title = ARMING_TITLE();
  clearTimeout(card._armTimer);
  card._armTimer = setTimeout(() => {
    if ((Number(card.dataset.armedAt) || 0) > Date.now()) return;
    card.classList.remove('chan-prop-arming');
    if (act && act.title === ARMING_TITLE()) act.title = '';
  }, P.ARM_MS + 30);
}
/** May THIS event decide on `card` now? A held click nudges the card (the look says why) and does nothing else. */
export function cardArmed(card, ev) {
  const v = P.armVerdict({ armedAt: Number(card && card.dataset && card.dataset.armedAt) || 0, now: Date.now(), trusted: !(ev && ev.isTrusted === false) });
  if (!v.armed && card) {
    card.classList.add('chan-prop-arming-nudge');
    setTimeout(() => card.classList.remove('chan-prop-arming-nudge'), 400);
  }
  return v.armed;
}

const stamp = (ms) => {
  if (!ms) return '';
  const d = new Date(Number(ms));
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The state chip's words. */
/** lane lark-upload-preflight (userW inc-muxsy69b-mjg1): a SENT proposal a part of which did not land is "partly sent" —
 *  never a plain "sent" (the owner learned of the dropped file from the recipient). */
const partlySent = (p) => !!(p && p.state === 'sent' && p.result && Array.isArray(p.result.parts) && p.result.parts.some((x) => x && !x.ok));
function stateChip(p) { return el('span', `chan-prop-state chan-prop-state-${partlySent(p) ? 'partly' : p.state}`, partlySent(p) ? t('partly sent') : stateLabel(p.state)); }
export function stateLabel(state) {
  switch (state) {
    case 'awaiting-approval': return t('awaiting your approval');
    case 'sending': return t('sending…');
    case 'sent': return t('sent');
    case 'failed': return t('failed');
    case 'unknown': return t('outcome unknown');
    case 'rejected': return t('rejected');
    case 'expired': return t('expired');
    case 'withdrawn': return t('withdrawn');
    case 'proposed': return t('proposed');
    default: return String(state || '');
  }
}
/** Why the policy sent this to review — the closed reason set, in words. */
export function reasonLabel(r) {
  switch (r) {
    case 'channel-policy': return t('this channel requires review');
    case 'links': return t('the text carries a link');
    case 'attachments': return t('it carries an attachment');
    case 'off-hours': return t('outside working hours');
    case 'authority': return t('the drafter holds draft authority only');
    case 'reaction-policy': return t('agent reactions need your approval on this account');
    case 'recall': return t('taking back your message always needs your approval');   // lane channels-proposals-recall
    default: return String(r || '');
  }
}
/** The drafter, in words. */
function drafterLabel(p) {
  const d = p.draftedBy || {};
  if (d.kind === 'agent') return t('drafted by {who}', { who: d.name || d.id || t('an agent') });
  return t('drafted by you');
}

async function post(pathname, body) {
  const r = await fetchJson(pathname, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body || {}) });
  if (!r || r.error) { showToast(routeErrorText(r), { type: 'error' }); return null; }
  return r;
}
/** THE ONE APPROVE (lane reaction-approve-shown — the owner's hub, 2026-10-28: an agent's proposed 👍 was refused on
 *  every press since 2.369.197, «shown is required … reload the page»): every road that approves a proposal — a text,
 *  a reaction, a recall, with edits, without the files — posts HERE, and every approval carries `shown` = the PURE
 *  digest of the record the card was drawn from (r6 verify F6). The reaction / recall road had its own POST without it:
 *  two roads, one drifted. test-channel-outbox's census holds every outbox approve POST in the client tree to this one. */
function approveProposal(p, body) {
  return post(`/api/channels/outbox/${encodeURIComponent(p.id)}/approve`, { ...body, shown: P.shownDigest(p) });
}

/**
 * ONE approval card for ONE proposal. `opts.compact` = the inline form
 * (no adapter/conversation line — the window it sits in IS the
 * conversation). Decisions POST and let the broadcast repaint; nothing here
 * waits for the echo (the multi-client law).
 */
export function renderProposalCard(app, p, { compact = false, line = false, onLine = null, onJump = null } = {}) {
  const card = el('div', `chan-prop chan-prop-${p.state}`);
  card.dataset.proposal = p.id;
  // lane channel-window-tidy: a decided proposal in a conversation window is its LINE first; the rest of the card shows
  // only while it is open (`setLineOpen`) — the line stands in for the head
  if (line) { card.classList.add('chan-prop-lined', 'chan-prop-shut'); card.appendChild(proposalLine(p, onLine)); }
  // ── head: state pill · drafter · age ──
  const head = el('div', 'chan-prop-head');
  head.appendChild(stateChip(p));
  head.appendChild(el('span', 'chan-prop-who', drafterLabel(p)));
  head.appendChild(el('span', 'chan-prop-when', stamp(p.updatedAt || p.at)));
  card.appendChild(head);
  // F4 (r6 verify, 2026-09-28): the envelope is ONE FACT PER LINE — where, then To / Cc / Subject (a compose)
  // or what it answers + its recipients (a reply) — each wrapping, nothing clipped (a 70-character subject used
  // to push the Cc out of a one-line ellipsis with no tooltip)
  if (!compact) {
    const where = el('div', 'chan-prop-where');
    if (p.compose) {
      // R4 (B-6acc): a NEW message — its envelope, and a link only once the vendor named its thread
      // B-f216 (userW pressed it 17 times): the envelope is WORDS — no link look without a target
      where.appendChild(el('span', 'chan-prop-env', `${p.adapterLabel || p.adapterId} · ${t('New message')}`));
      if (p.convId) { const link = el('a', 'chan-prop-link', t('Open the conversation')); link.href = '#'; link.onclick = (ev) => { ev.preventDefault(); app.openChannel(p.adapterId, p.convId); }; where.appendChild(document.createTextNode(' · ')); where.appendChild(link); }
    } else {
      const link = el('a', 'chan-prop-link', `${p.adapterLabel || p.adapterId} · ${p.title || p.convId}`);
      link.href = '#';
      link.onclick = (ev) => { ev.preventDefault(); app.openChannel(p.adapterId, p.convId); };
      where.appendChild(link);
    }
    card.appendChild(where);
  }
  if (p.compose) {
    card.appendChild(envRow('chan-prop-to', t('To'), (p.compose.to || []).join(', ')));
    if ((p.compose.cc || []).length) card.appendChild(envRow('chan-prop-cc', t('Cc'), p.compose.cc.join(', ')));
    card.appendChild(envRow('chan-prop-subject', t('Subject'), p.compose.subject || ''));
  } else appendReplyTarget(card, p);
  // lane channel-threads (spec §5.2) + 2026-09-28 THE PLACEMENT: a reply says WHERE it lands, above its text — a
  // quote shown in the chat, a reply in the thread, a thread reply also shown in the chat (PURE `placementText`
  // over the placement read through its alias — a proposal stored before the enum says `inThread`); a plain message
  // says nothing. ONE QUOTE (the .197 integration, pairing r6 × threads): the "In reply to" row above quotes the
  // answered message with every hidden character marked, so the placement line then names only WHERE — its own quote
  // is drawn only for a proposal with no anchor row (one stored before the anchor existed)
  const placement = P.placementOf(p);
  const anchored = !!(p.replyAnchor && p.replyAnchor.vendorId);
  const placeLine = P.placementText(placement, { t, quote: anchored ? null : (p.replyQuote || p.threadQuote || null) });
  if (placeLine) {
    const pe = el('div', 'chan-prop-thread chan-prop-place', placeLine);
    pe.dataset.placement = placement;
    card.appendChild(pe);
  }
  // ── THE BODY — an agent's text, plain (or the editor while editing); O1: every invisible direction / zero-width
  // character is a visible mark, and the card says so once; a REACTION's sentence (spec §5.3) ──
  const reaction = p.kind === 'reaction' && p.reaction ? p.reaction : null;
  // lane channels-proposals-recall: a RECALL's sentence quotes the user's own message it takes back (textContent — the
  // quote is the stored record's words, one line, frames neutered by the PURE quote)
  const recall = p.kind === 'recall' && p.recall ? p.recall : null;
  const body = el('div', 'chan-prop-text' + (reaction ? ' chan-prop-reaction' : recall ? ' chan-prop-reaction chan-prop-recall' : ''));
  let hiddenMarks = [];
  if (reaction) body.textContent = reactionCardText(p);
  else if (recall) body.textContent = recallCardText(p);
  else hiddenMarks = revealInto(body, p.text || '');
  // lane composer-file-only-send (B-dce6): a proposal that is ONLY its files draws no empty text line — the file rows
  // below are the message; the node stays (hidden) for the Edit to replace
  if (!reaction && !recall && !String(p.text || '').trim() && P.storedAttachments(p).length) { body.hidden = true; body.dataset.fileOnly = '1'; }
  card.appendChild(body);
  if (hiddenMarks.length) {
    const hw = el('div', 'chan-prop-idwarn chan-prop-hiddenwarn');
    hw.appendChild(icon('alert', 11));
    hw.appendChild(el('span', '', t('The text carries invisible characters that change how it reads ({list}) — each is shown as a mark and is sent as it is', { list: hiddenMarks.join(', ') })));
    card.appendChild(hw);
  }
  if (p.edited && p.originalText && p.originalText !== p.text) {
    const orig = el('details', 'chan-prop-orig');
    orig.appendChild(el('summary', '', t('Original text (before your edit)')));
    const origText = el('div', 'chan-prop-text chan-prop-text-orig');
    revealInto(origText, p.originalText);
    orig.appendChild(origText);
    card.appendChild(orig);
  }
  // ── design 005 §2.B (B-fd1f): WHAT LEAVES WITH IT — one row per attachment: a thumbnail for a picture the server
  //    SNIFFED as one of the four raster types (served by the owner-only route; anything else is never drawn), the name,
  //    its kind + size (a chip when the name's extension says another type); the raw facts in ONE fold; a row downloads ──
  appendAttachments(card, p, app);
  // ── ONE meta line: why · the policy verdict · the identity · expiry · the sender line ──
  const meta = el('div', 'chan-prop-meta');
  // WHY — a structured reference the panel can link, never an agent's sentence.
  if (p.why && (p.why.label || p.why.id)) {
    const why = el('span', 'chan-prop-why', t('Why: {ref}', { ref: p.why.label || p.why.id }));
    if (p.why.kind === 'record' && p.why.id) why.title = t('message {id}', { id: p.why.id });
    meta.appendChild(why);
  }
  // THE POLICY VERDICT — why it waits, or that it went directly.
  if (p.policy) {
    const pol = el('span', 'chan-prop-policy');
    if (p.policy.mode === 'direct') pol.textContent = t('Sent directly: the channel policy is "direct" and no guard applied.');
    else pol.textContent = t('Needs approval: {why}', { why: (p.policy.reasons || []).map(reasonLabel).join('; ') || t('review') });
    // lane guards-door: a GUARD held it — say where the owner switches it, from the place he hits it
    if (p.policy.mode !== 'direct' && (p.policy.reasons || []).some((r) => P.GUARD_REASONS.includes(r))) pol.textContent += ' ' + t('(a guard — change it in the policy row)');
    if (p.policy.detail && p.policy.detail.unknownPolicy) pol.textContent += ' ' + t('(the stored policy value was not understood — review, fail closed)');
    if (p.policy.detail && p.policy.detail.guardsUnparseable) pol.textContent += ' ' + t('(a guard setting could not be read: {why} — review, fail closed)', { why: p.policy.detail.guardsUnparseable });
    meta.appendChild(pol);
  }
  // THE IDENTITY ROW (§9.5): the fact on the meta line; the warning below, once.
  const asWho = p.sendAs === 'bot' ? t('the bot') : t('you');
  meta.appendChild(el('span', 'chan-prop-identity', reaction ? t('Reacts as you') : recall ? t('Takes it back as you') : t('Will send as {who}', { who: asWho })));
  // r3: approving a send that starts a turn WAKES the agent — the cost, said before the click
  if (p.wakes && p.state === 'awaiting-approval') meta.appendChild(el('span', 'chan-prop-wakes chan-warn', t('Approving wakes this agent: 1 billed turn')));
  if (p.state === 'awaiting-approval' && p.ttlAt) meta.appendChild(el('span', 'chan-prop-ttl', t('Expires unapproved at {when}', { when: stamp(p.ttlAt) })));
  // THE SENDER HONESTY LINE (§9.5, P4): said BEFORE the approval when the
  // channel's switch is on, and recorded after the send. The line itself is
  // the adapter-neutral sentence the engine will append, shown verbatim.
  if (p.honestyLine) {
    const hl = el('span', 'chan-prop-honesty');
    hl.appendChild(el('span', '', (p.state === 'sent' ? t('A sender line was appended:') : t('A sender line will be appended (this channel\'s option is on):')) + ' '));
    hl.appendChild(el('code', 'chan-prop-honesty-line', p.honestyLine));
    meta.appendChild(hl);
  }
  card.appendChild(meta);
  // honesty is owed to the one pressing Approve (§9.5): the warning is drawn on the card that
  // still HAS an Approve — a decided card keeps its identity fact on the meta line and stops
  // repeating the warning (a1 C1: five cards, five amber walls; a2 §3: ONE warning in the Outbox)
  const deciding = p.state === 'awaiting-approval' || p.state === 'sending';
  const warnText = deciding && p.identityWarning ? chanCaps.identityWarningText(p.identityWarning, { t }) : null;
  if (warnText) {
    const w = el('div', 'chan-prop-idwarn');
    w.appendChild(icon('alert', 11));
    w.appendChild(el('span', '', warnText));
    card.appendChild(w);
  }
  // ── OUTCOME — the server's STRUCTURE worded here (a3 i18n): the sentence is
  // the device's, the adapter's / user's verbatim rides inside it, never as a
  // second English line. A digest from an older server (no `outcome`) still
  // shows its contract string rather than nothing. ──
  const outcome = p.outcome || P.outcomeOf(p);
  const outcomeLine = outcome ? P.outcomeText(outcome, { t, errorCodeText: chanCaps.errorCodeText, sendWhyText: chanCaps.sendWhyText }) : (p.reason || '');
  if (outcomeLine) card.appendChild(el('div', `chan-prop-reason${p.state === 'unknown' || partlySent(p) ? ' chan-warn' : ''}`, outcomeLine));
  if (p.state === 'unknown') card.appendChild(el('div', 'chan-prop-reason chan-warn', t('This send is never retried automatically. Check the conversation on the platform before proposing it again.')));
  // ── the quiet footer: reconcile facts, the receipt ──
  // RECONCILE (§9.4, P4): what the last check answered, and the control —
  // offered only when the adapter's declared idempotency can answer at all.
  if (p.reconcile && p.reconcile.n) {
    const ans = p.reconcile.lastAnswer === 'landed' ? t('it landed') : p.reconcile.lastAnswer === 'not-landed' ? t('it did not land') : p.reconcile.lastAnswer === 'not-available' ? t('this channel cannot be checked by the machine') : t('still unknown');
    card.appendChild(el('div', 'chan-prop-foot chan-prop-reconcile', t('Checked {n}× — last answer: {answer} ({when})', { n: p.reconcile.n, answer: ans, when: stamp(p.reconcile.lastAt) }) + (p.reconcile.lastWhy ? ` — ${p.reconcile.lastWhy}` : '')));
  }
  if (p.state === 'unknown' && !p.canReconcile && (p.reconcileWhy || p.reconcileWhyCode)) {
    // the refusal is a CODE (worded); the sentence beside it is the fallback
    card.appendChild(el('div', 'chan-prop-foot chan-prop-reason', t('Cannot be checked by the machine: {why}', { why: P.reconcileWhyText(p.reconcileWhyCode, { t }) || p.reconcileWhy })));
  }
  // THE FATE LINE (2026-09-27): does the drafting agent know yet? Its own
  // element, patched in place when only the fate moved (patchFate)
  const fateText = fateLineText(p);
  if (fateText) {
    const f = el('div', 'chan-prop-foot chan-prop-receipt chan-prop-fate', fateText);
    f.dataset.fate = (P.receiptFateOf(p) || {}).kind || '';
    card.appendChild(f);
  }
  // ── actions: right-aligned, ONE primary ──
  if (p.state === 'unknown' && p.canReconcile) {
    const act = el('div', 'chan-prop-actions');
    const chk = btn(t('Check outcome'), null);
    chk.dataset.reconcile = '1';
    chk.onclick = async () => {
      chk.disabled = true;
      const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reconcile`, {});
      if (!r) { chk.disabled = false; return; }
      showToast(r.resolved ? (r.state === 'sent' ? t('It landed — marked as sent') : t('It never landed — marked as failed')) : t('Still unknown: {why}', { why: r.reason || t('no evidence either way') }), { type: r.resolved ? 'info' : 'warn' });
    };
    act.appendChild(chk);
    card.appendChild(act);
  }
  // lane channel-window-tidy: a SENT proposal is a message of the thread now — its card takes the reader there
  const sentVid = p.state === 'sent' && p.result && p.result.vendorMessageId ? String(p.result.vendorMessageId) : '';
  if (sentVid && typeof onJump === 'function') {
    const act = el('div', 'chan-prop-actions');
    const go = btn(t('Jump to this message'), () => onJump(sentVid, Number(p.result.at) || Number(p.updatedAt) || 0));
    go.dataset.jump = '1';
    act.appendChild(go);
    card.appendChild(act);
  }
  // DECISIONS — only while awaiting. An AGENT's draft is decided with the
  // split buttons (how it hears of the decision is chosen right here); a
  // user's own draft has nobody to tell — plain Approve / Reject….
  if (p.state === 'awaiting-approval') {
    const act = el('div', 'chan-prop-actions');
    const toAgent = !!(p.draftedBy && p.draftedBy.kind === 'agent');
    let editor = null;
    const reject = btn(t('Reject…'), null);
    reject.dataset.reject = '1';
    const edit = btn(t('Edit…'), null);
    edit.dataset.edit = '1';
    // a reaction has no text to edit and never wakes anyone (spec §5.3): plain Reject / Approve, the receipt rides the next turn
    // (lane channels-proposals-recall: a recall the same — Approve takes the message back, Reject keeps it)
    if (reaction || recall) {
      const approveR = btn(toAgent ? approveLabel('next-turn') : t('Approve'), null, 'mounts-btn-primary');
      approveR.dataset.approve = '1';
      approveR.dataset.deliver = 'next-turn';
      // lane reaction-approve-shown: its receipt ALWAYS rides the next turn (the engine never wakes for one), so its words
      // never follow this device's remembered «wake now» — `relabelPrimaries` and a kept card's patch skip it (the owner's
      // reaction card read «批准并立即唤醒 agent» while its press posted next-turn)
      approveR.dataset.deliverFixed = '1';
      approveR.onclick = async (ev) => {
        if (!cardArmed(card, ev)) return;   // r6 F6: armed only, like every Approve
        for (const b of act.querySelectorAll('button')) b.disabled = true;
        const r = await approveProposal(p, { expectWakes: 0, ...(toAgent ? { deliver: 'next-turn' } : {}) });
        if (!r) { for (const b of act.querySelectorAll('button')) b.disabled = false; return; }
        const sent = !!(r.proposal && r.proposal.state === 'sent');
        const o = r.proposal ? (r.proposal.outcome || P.outcomeOf(r.proposal)) : null;
        showToast(sent ? (recall ? t('Message taken back') : t('Reaction added')) : t('Not sent: {why}', { why: (o && P.outcomeText(o, { t, errorCodeText: chanCaps.errorCodeText })) || routeErrorText(r) }), { type: sent ? 'info' : 'error' });
      };
      reject.onclick = () => {
        const old = card.querySelector('.chan-prop-rejectbox');
        if (old) old.remove();
        const box = el('div', 'chan-prop-rejectbox');
        const inp = el('input', 'chan-opt-input');
        inp.type = 'text'; inp.placeholder = t('Reason (the agent reads it)');
        const go = btn(t('Reject'), null, 'mounts-btn-primary');
        go.onclick = async () => {
          go.disabled = true;
          const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reject`, { reason: inp.value, ...(toAgent ? { deliver: 'next-turn', expectWakes: 0 } : {}) });
          if (!r) { go.disabled = false; return; }
          showToast(t('Rejected'));
        };
        inp.addEventListener('keydown', (e) => { if (enterSubmits(e)) go.click(); });   // an input method's committing Enter is its own (inc-mv7mdv6b-emxq)
        box.append(inp, go);
        act.after(box);
        inp.focus();
      };
      act.append(reject, approveR);
      card.appendChild(act);
      armCard(card);
      return card;
    }
    const approve = btn(toAgent ? approveLabel(rememberedDelivery()) : t('Approve'), null, 'mounts-btn-primary');
    approve.dataset.approve = '1';
    if (toAgent) approve.dataset.deliver = rememberedDelivery();
    // lane lark-upload-preflight: the owner never approves a card that lies — files this account cannot carry make the
    // Approve "Send without the file" (a proposal that is ONLY its files offers no send at all)
    const noFile = !!p.filesBlocked;
    if (noFile) { approve.textContent = t('Send without the file'); approve.dataset.withoutFiles = '1'; if (!String(p.text || '').trim()) approve.disabled = true; }
    const lock = (on) => { for (const b of act.querySelectorAll('button')) b.disabled = on; };
    const doApprove = async (deliver) => {
      lock(true);
      const text = editor ? editor.value : null;
      // r3: a send that starts a turn echoes the count the card SAID (`expectWakes`) — and a receipt woken now is one more
      const woke = toAgent && deliver === 'wake-now' ? 1 : 0;
      // r6 verify F6: `shown` (approveProposal adds it) = the digest of the record THIS card was drawn from — the engine
      // refuses the approval (409 changed-since-shown, nothing sent) when the proposal is no longer that record
      const r = await approveProposal(p, { ...(text !== null && text !== p.text ? { text } : {}), expectWakes: (Number(p.wakes) || 0) + woke, ...(toAgent ? { deliver } : {}), ...(noFile ? { withoutFiles: true } : {}) });
      if (!r) { lock(false); return; }
      const sent = !!(r.proposal && r.proposal.state === 'sent');
      const o = r.proposal ? (r.proposal.outcome || P.outcomeOf(r.proposal)) : null;
      // lane lark-send-hold: a send waiting the vendor's reset is approved — the toast says when it goes, never "Not sent"
      if (!sent && o && o.kind === 'held') showToast(P.outcomeText(o, { t }), { type: 'info' });
      else showToast(sent ? t('Sent') : t('Not sent: {why}', { why: (o && P.outcomeText(o, { t, errorCodeText: chanCaps.errorCodeText, sendWhyText: chanCaps.sendWhyText })) || routeErrorText(r) }), { type: sent ? 'info' : 'error' });
      if (woke && r.proposal && r.proposal.receiptChoicePaced) showToast(t('The agent was not woken (paced: {why}) — it hears with its next message', { why: r.proposal.receiptChoicePaced }), { type: 'warn' });
    };
    approve.onclick = (ev) => { if (cardArmed(card, ev)) doApprove(toAgent ? pressedDelivery(approve) : null); };   // verify r3: what the button SAYS; r6 F6: armed only
    edit.onclick = () => {
      if (editor) return;
      editor = el('textarea', 'chan-prop-edit');
      editor.value = p.text || '';
      body.replaceWith(voiceField(editor, attachDictation(editor)));
      autosizeEditor(editor);   // the agent's draft opens at its size (min 4 rows, max ~60 % of the pane)
      approve.textContent = noFile ? t('Send without the file') : toAgent ? approveLabel(pressedDelivery(approve), { edited: true }) : t('Approve edited');
      edit.disabled = true;
      editor.focus();
    };
    const openReject = (deliver) => {
      const old = card.querySelector('.chan-prop-rejectbox');
      if (old) old.remove();
      const box = el('div', 'chan-prop-rejectbox');
      const inp = el('input', 'chan-opt-input');
      inp.type = 'text'; inp.placeholder = t('Reason (the agent reads it)');
      const go = btn(toAgent ? rejectLabel(deliver, { box: true }) : t('Reject'), null, 'mounts-btn-primary');
      if (toAgent) go.dataset.deliver = deliver;
      go.onclick = async (ev) => {
        if (!cardArmed(card, ev)) return;
        go.disabled = true;
        const woke = toAgent && deliver === 'wake-now' ? 1 : 0;
        const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reject`, { reason: inp.value, ...(toAgent ? { deliver, expectWakes: woke } : {}) });
        if (!r) { go.disabled = false; return; }
        showToast(t('Rejected'));
        if (woke && r.proposal && r.proposal.receiptChoicePaced) showToast(t('The agent was not woken (paced: {why}) — it hears with its next message', { why: r.proposal.receiptChoicePaced }), { type: 'warn' });
      };
      inp.addEventListener('keydown', (e) => { if (enterSubmits(e)) go.click(); });   // an input method's committing Enter is its own (inc-mv7mdv6b-emxq)
      box.append(inp, go);
      act.after(box);
      inp.focus();
    };
    reject.onclick = (ev) => { if (cardArmed(card, ev)) openReject(toAgent ? rememberedDelivery() : null); };
    /** THE ▾ HALF of a split button: the menu of delivery choices. */
    const chevron = (kind, items) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'mounts-btn chan-split-more' + (kind === 'approve' ? ' mounts-btn-primary' : '');
      c.dataset.more = kind;
      c.title = kind === 'approve' ? t('More ways to approve') : t('More ways to reject');
      c.setAttribute('aria-label', c.title);
      c.appendChild(icon('chevronDown', 11));
      c.onclick = (ev) => {
        ev.stopPropagation();
        if (!cardArmed(card, ev)) return;
        const r = c.getBoundingClientRect();
        // ONE class name (the item class is derived from it); the modifier after
        const menu = showContextMenu(r.left, r.bottom + 2, items());
        if (menu) { menu.classList.add('chan-split-menu'); menu.dataset.menu = kind; }
      };
      return c;
    };
    if (toAgent) {
      // a pick is remembered AND said on every primary on this page at once (verify r3)
      const pick = (v) => { rememberDelivery(v); relabelPrimaries(v); };
      const approveItems = () => [
        { label: approveLabel('next-turn', { edited: !!editor }), action: () => { pick('next-turn'); doApprove('next-turn'); } },
        { label: approveLabel('wake-now', { edited: !!editor }), action: () => { pick('wake-now'); doApprove('wake-now'); } },
        ...(editor ? [] : [{ separator: true }, { label: t('Approve with edits…'), action: () => edit.onclick() }]),
      ];
      const rejectItems = () => [
        { label: rejectLabel('next-turn'), action: () => { pick('next-turn'); openReject('next-turn'); } },
        { label: rejectLabel('wake-now'), action: () => { pick('wake-now'); openReject('wake-now'); } },
      ];
      const rs = el('span', 'chan-split'); rs.append(reject, chevron('reject', rejectItems));
      const as = el('span', 'chan-split'); as.append(approve, chevron('approve', approveItems));
      act.append(rs, edit, as);
    } else act.append(reject, edit, approve);
    card.appendChild(act);
    armCard(card);
  }
  return card;
}

/** A reaction proposal's sentence (spec §5.3): "{agent} wants to react {glyph} to {author}: "{quote}"" — the glyph is
 *  CONTENT (text emoji, or `:key:` when the vocabulary has no glyph), every part textContent. */
export function reactionCardText(p) {
  const x = (p && p.reaction) || {};
  const d = (p && p.draftedBy) || {};
  const agent = d.kind === 'agent' ? (d.name || d.id || t('an agent')) : t('you');
  const glyph = x.glyph || `:${x.key || '?'}:`;
  const q = x.quote || {};
  return x.op === 'remove'
    ? t('{agent} wants to remove the reaction {glyph} from {author}: "{quote}"', { agent, glyph, author: q.author || '?', quote: q.text || '' })
    : t('{agent} wants to react {glyph} to {author}: "{quote}"', { agent, glyph, author: q.author || '?', quote: q.text || '' });
}
/** lane channels-proposals-recall: a recall proposal's sentence — "{agent} wants to take back your message: "{quote}"" —
 *  every part textContent; the quote is the stored message's own words (one line, ≤ 120, frames neutered). */
export function recallCardText(p) {
  const d = (p && p.draftedBy) || {};
  const agent = d.kind === 'agent' ? (d.name || d.id || t('an agent')) : t('you');
  const q = ((p && p.recall) || {}).quote || {};
  return t('{agent} wants to take back your message: "{quote}"', { agent, quote: q.text || '' });
}
/** The fate line's words for one proposal ('' = none). */
function fateLineText(p) {
  const f = P.receiptFateOf(p);
  return f ? P.receiptFateText(f, { t, stamp: fateStamp, refusalText: (c) => chanCaps.wakeRefusalText(c, { t }) }) : '';
}
/** "14:02" today, "09-26 14:02" on another day (the owner's own example). */
function fateStamp(ms) {
  const d = new Date(Number(ms)), n = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === n.toDateString() ? hm : `${stamp(ms)}`;
}
/** lane channel-window-tidy: WHO receives a decided proposal, in a few words — "Reply all · 7 people", "Reply · Ada",
 *  "New message · 3 people"; '' for a reply whose recipients are the conversation itself (a chat). */
export function lineGist(p) {
  const g = gistOf(p);
  if (!g) return '';
  const verb = g.verb === 'compose' ? t('New message') : g.verb === 'reply-all' ? t('Reply all') : t('Reply');
  return g.who ? `${verb} · ${g.who}` : verb;
}
/** The FIRST mailbox of an address header as a card names a person — its display name, else its address (a comma
 *  inside a quoted name is the name's). */
function firstMailbox(v) {
  const s = String(v || '');
  let q = false, cut = s.length;
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (q && c === '\\') { i++; continue; } if (c === '"') q = !q; else if (c === ',' && !q) { cut = i; break; } }
  const one = s.slice(0, cut).trim();
  const nm = /^\s*"?((?:[^"\\<]|\\.)*?)"?\s*<([^<>]*)>\s*$/.exec(one);
  return nm ? (nm[1].trim() || nm[2].trim()) : one;
}
/** WHO receives it, as parts — `{verb: compose | reply-all | reply, who, first, n}` (who = one display name / address,
 *  or "N people"; first = the first one's name, To before Cc; n = how many); null for a reply whose recipients are the
 *  conversation itself. lineGist and the chat's chip say them. */
function gistOf(p) {
  const e = p && p.replyEnvelope && typeof p.replyEnvelope === 'object' ? p.replyEnvelope : null;
  const cp = p && p.compose && typeof p.compose === 'object' ? p.compose : null;
  if (!e && !cp) return null;
  const heads = cp ? [...(cp.to || []), ...(cp.cc || [])].map(String) : [e.to, e.cc].filter(Boolean).map(String);
  const n = P.envelopeAddresses(heads.join(', ')).size;
  const one = heads.find((h) => P.envelopeAddresses(h).size) || heads[0] || '';
  const nm = /^\s*"?((?:[^"\\<]|\\.)*?)"?\s*<([^<>]*)>\s*$/.exec(one);   // one mailbox: its display name, else the address
  const first = firstMailbox(one);
  const who = n > 1 ? t('{n} people', { n }) : nm ? (nm[1].trim() || nm[2].trim()) : one.trim();
  return { verb: cp ? 'compose' : e.all ? 'reply-all' : 'reply', who, first, n };
}
/** lane channel-window-tidy: THE LINE of a decided proposal — chip · drafter · when · recipients · first words; a click
 *  (or Enter / Space) asks the window to open / close the card (`onLine(id)`). Every string textContent. */
function proposalLine(p, onLine) {
  const row = el('div', 'chan-prop-line');
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.setAttribute('aria-expanded', 'false');
  row.appendChild(icon('chevronRight', 10, 'chan-prop-line-chev'));
  row.appendChild(stateChip(p));
  const d = p.draftedBy || {};
  row.appendChild(el('span', 'chan-prop-line-who', d.kind === 'agent' ? (d.name || d.id || t('an agent')) : t('You')));
  row.appendChild(el('span', 'chan-prop-line-at', fateStamp(p.updatedAt || p.at)));
  const gist = lineGist(p);
  if (gist) row.appendChild(el('span', 'chan-prop-line-to', gist));
  const text = el('span', 'chan-prop-line-text');
  revealInto(text, rowFirstLine(p).slice(0, 200));
  row.appendChild(text);
  row.onclick = () => { if (onLine) onLine(p.id); };
  row.onkeydown = (ev) => { if (ev.target !== row || (ev.key !== 'Enter' && ev.key !== ' ')) return; ev.preventDefault(); if (onLine) onLine(p.id); };
  return row;
}
/** lane channel-window-tidy: what an opened line / fold revealed is brought into view (the section sits at the bottom of
 *  the list, so it opens BELOW the fold of the screen) — its last part, then the line pressed (kept on screen first). */
function reveal(last, keep) {
  if (last && typeof last.scrollIntoView === 'function') last.scrollIntoView({ block: 'nearest' });
  if (keep && typeof keep.scrollIntoView === 'function') keep.scrollIntoView({ block: 'nearest' });
}
/** A lined card's open state, patched IN PLACE (the element and its focus stay). */
function setLineOpen(card, open) {
  card.classList.toggle('chan-prop-shut', !open);
  const line = card.querySelector(':scope > .chan-prop-line');
  if (line) line.setAttribute('aria-expanded', open ? 'true' : 'false');
}
/** A card's signature WITHOUT its fate (a fate-only change patches the line). */
function cardSig(p, compact, line = false) {
  const q = { ...p };
  delete q.receiptDelivery; delete q.receiptDrainedAt; delete q.receiptDrainedHow; delete q.receiptEvictedAt; delete q.receiptEvictedHeld;
  return JSON.stringify([q, !!compact, rememberedDelivery(), !!line]);
}
const fateSig = (p) => JSON.stringify([p.receiptDelivery || null, p.receiptDrainedAt || null, p.receiptDrainedHow || null, p.receiptEvictedAt || null]);
/** Is the user in the middle of deciding on this card (an editor or a reject box open)? */
const inUse = (card) => !!card.querySelector('.chan-prop-edit, .chan-prop-rejectbox');
/**
 * THE KEYED CARD FOR ONE PROPOSAL: the existing element when its record did
 * not change (its fate line patched in place when only the fate moved; left
 * alone while the user edits it and it still awaits), else a fresh one.
 */
function keyedCard(app, p, prev, { compact = false, line = false, onLine = null, onJump = null } = {}) {
  const sig = cardSig(p, compact, line);
  if (prev && (prev.dataset.sig === sig || (inUse(prev) && p.state === 'awaiting-approval' && prev.dataset.state === 'awaiting-approval'))) {
    if (prev.dataset.fateSig !== fateSig(p)) {
      const text = fateLineText(p);
      let line = prev.querySelector(':scope > .chan-prop-fate');
      if (text) {
        if (!line) { line = el('div', 'chan-prop-foot chan-prop-receipt chan-prop-fate'); const act = prev.querySelector(':scope > .chan-prop-actions'); if (act) prev.insertBefore(line, act); else prev.appendChild(line); }
        if (line.textContent !== text) line.textContent = text;
        line.dataset.fate = (P.receiptFateOf(p) || {}).kind || '';
      } else if (line) line.remove();
      prev.dataset.fateSig = fateSig(p);
    }
    // verify r2 (round 1 LOW 5): a card left alone while the user edits it keeps
    // its primary Approve; when this device's remembered choice moved meanwhile
    // (another card's menu), the label followed the OLD choice while the click
    // does the new one — patch the words in place, the editor untouched
    const want = rememberedDelivery();
    const approveBtn = prev.querySelector(':scope > .chan-prop-actions button[data-approve]');
    if (approveBtn && !approveBtn.dataset.deliverFixed && p.draftedBy && p.draftedBy.kind === 'agent' && approveBtn.dataset.deliver !== want) {
      approveBtn.dataset.deliver = want;
      approveBtn.textContent = approveLabel(want, { edited: !!prev.querySelector('.chan-prop-edit') });
    }
    return prev;
  }
  const card = renderProposalCard(app, p, { compact, line, onLine, onJump });
  card.dataset.sig = sig;
  card.dataset.fateSig = fateSig(p);
  card.dataset.state = p.state;
  return card;
}
/** Put `nodes` into `container` in order, moving a node only when it is out of place. */
function placeNodes(container, nodes) {
  const want = new Set(nodes);
  for (const c of [...container.children]) if (!want.has(c)) c.remove();
  nodes.forEach((n, i) => { if (container.children[i] !== n) container.insertBefore(n, container.children[i] || null); });
}
/** F6 (r6 verify): `placeNodes`, then every awaiting card that is NEW here or whose top MOVED (a card inserted or
 *  grown above it — the newest-first order puts a new or replacing proposal on top) is ARMED again: it was not where
 *  the pointer found it. The verdict is PURE (`P.rearmVerdict`). */
function placeArmed(container, nodes) {
  const isCard = (n) => n && n.classList && n.classList.contains('chan-prop');
  const before = new Map();
  for (const c of container.children) if (isCard(c)) before.set(c, c.getBoundingClientRect().top);
  placeNodes(container, nodes);
  const at = Date.now();
  for (const n of nodes) {
    if (!isCard(n) || !n.querySelector(':scope > .chan-prop-actions button[data-approve]')) continue;
    if (P.rearmVerdict({ isNew: !before.has(n), prevTop: before.get(n), top: n.getBoundingClientRect().top })) armCard(n, at);
  }
}

/** B-f467: a proposal's conversation, by the ladder name proposalView put on it NOW (③ the id only when nothing is known). */
const convNameOf = (p) => p.title || p.convId || '';
/** B-f467: WHO receives a proposal and WHERE it lands — `{who, where}` (either may be ''). A compose: its recipients,
 *  then its subject (or "New message"); a reply: the recipients the adapter resolved (mail), then the conversation. */
export function rowWhoWhere(p) {
  if (p && p.compose) return { who: (p.compose.to || []).join(', '), where: p.compose.subject || t('New message') };
  const e = (p && p.replyEnvelope) || null;
  return { who: e && e.to ? String(e.to) : '', where: convNameOf(p || {}) };
}
/** B-f467: the first line of what would be sent (a reaction: its sentence; a file sent by itself: its names). */
export function rowFirstLine(p) {
  if (p && p.kind === 'reaction' && p.reaction) return reactionCardText(p);
  if (p && p.kind === 'recall' && p.recall) return recallCardText(p);   // lane channels-proposals-recall
  return String((p && p.text) || '').split('\n').map((s) => s.trim()).find(Boolean) || (p ? P.storedAttachments(p).map((a) => String(a.name || '')).filter(Boolean).join(', ') : '');
}
/**
 * B-f467: ONE ROW FOR ONE PROPOSAL (the Outbox window). `badge` = its account's (channel-avatar.js accountBadges);
 * `open` = its full card is drawn under it; `onToggle(id)` / `onReview(id)` = the window's (a kept row's handlers
 * call them with the id, never a stale record). Every string is textContent; the text's hidden characters are marks.
 */
export function renderProposalRow(app, p, { badge = null, open = false, onToggle = null, onReview = null } = {}) {
  const row = el('div', `chan-orow chan-orow-${p.state}`);
  row.dataset.orow = p.id;
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  const { who, where } = rowWhoWhere(p);
  row.appendChild(convAvatar({ key: p.convId ? `${p.adapterId}/${p.convId}` : `${p.adapterId}/compose`, title: who || where, kind: p.compose ? 'thread' : (p.convKind || ''), badge }, null, 'chan-orow-av'));
  const line = el('div', 'chan-orow-line');
  const title = el('span', 'chan-orow-title');
  if (who) title.appendChild(el('span', 'chan-orow-who', who));
  if (where) title.appendChild(el('span', 'chan-orow-where', who ? ` · ${where}` : where));
  title.title = [who, where].filter(Boolean).join(' · ');
  line.appendChild(title);
  if (badge && badge.multi) { const ac = el('span', 'chan-orow-acct', badge.label); ac.title = t('From your {label} account', { label: badge.label }); line.appendChild(ac); }
  line.appendChild(el('span', 'chan-orow-at', stamp(p.updatedAt || p.at)));
  line.appendChild(icon('chevronRight', 10, 'chan-orow-chev'));
  row.appendChild(line);
  const sub = el('div', 'chan-orow-sub');
  sub.appendChild(stateChip(p));
  const text = el('span', 'chan-orow-text');
  revealInto(text, rowFirstLine(p).slice(0, 300));
  sub.appendChild(text);
  row.appendChild(sub);
  if (p.state === 'awaiting-approval') {
    const act = el('div', 'chan-orow-act');
    const rv = btn(t('Approve…'), () => { if (onReview) onReview(p.id); }, 'mounts-btn-primary');
    rv.dataset.review = '1';
    rv.title = t('Open the proposal to approve it');
    act.appendChild(rv);
    row.appendChild(act);
  }
  row.onclick = (ev) => { if (ev && ev.target && ev.target.closest && ev.target.closest('button')) return; if (onToggle) onToggle(p.id); };
  row.onkeydown = (ev) => { if (ev.target !== row || (ev.key !== 'Enter' && ev.key !== ' ')) return; ev.preventDefault(); if (onToggle) onToggle(p.id); };
  setRowOpen(row, open);
  return row;
}
/** A row's open state, patched IN PLACE (the row keeps its focus across a toggle). */
function setRowOpen(row, open) {
  row.classList.toggle('chan-orow-open', !!open);
  row.setAttribute('aria-expanded', open ? 'true' : 'false');
}
/** The signature of what a row PRINTS (its open state is patched, never rebuilt). */
function rowSig(p, badge) {
  return JSON.stringify([p.state, p.adapterId, p.convId || null, p.title || null, p.convKind || null, p.compose || null, p.replyEnvelope ? p.replyEnvelope.to || null : null, p.audience ? p.audience.kind : null, p.prepared ? (p.prepared.notifies || []).join() : null, p.kind || null, p.reaction || null, p.text || '', p.updatedAt || p.at || 0, badge]);
}
function keyedRow(app, p, prev, opts) {
  const sig = rowSig(p, opts.badge);
  if (prev && prev.dataset.sig === sig) { setRowOpen(prev, opts.open); return prev; }
  const row = renderProposalRow(app, p, opts);
  row.dataset.sig = sig;
  return row;
}
/**
 * B-f467 THE OUTBOX LIST'S NODES for one store answer `ob` (`{proposals, accounts}`) and the API cards `apiCards` — in
 * the order of THE CENSUS's view (lane outbox-window-scroll-filter, src/outbox-census.js): each section's head (its
 * waiting / total, from the census), then its rows — a message proposal's row followed by its FULL CARD when `open`
 * holds its id; the API section is `apiSection` (channel-api-card-view.js), drawn from the same census section.
 * 「待审批」 ('awaiting') lists only what waits, the sections holding it first, a section with nothing waiting folded to
 * its head (its 「在「全部」里看」 calls `onAll(key)`); 「全部」 ('all') every proposal newest first. `list` = the container
 * whose kept rows / cards / heads are reused (keyed). Returns `{nodes, view, census, awaiting, proposals}` (the last two
 * = the message section's); the caller places them (`placeArmed`).
 */
export function outboxNodes(app, list, ob, { view = null, open = new Set(), onToggle = null, onReview = null, apiCards = [], apiSection = null, onAll = null } = {}) {
  const census = outboxCensus({ proposals: (ob && ob.proposals) || [], apiCards: apiCards || [], apiFate });
  const vw = outboxView(census, view);
  const msgs = census.sections.find((x) => x.key === 'messages');
  const badges = accountBadges((ob && ob.accounts) || []);
  const kids = list ? [...list.children] : [];
  const cards = new Map(kids.filter((c) => c.classList.contains('chan-prop')).map((c) => [c.dataset.proposal, c]));
  const rows = new Map(kids.filter((c) => c.classList.contains('chan-orow')).map((c) => [c.dataset.orow, c]));
  const heads = new Map(kids.filter((c) => c.classList.contains('chan-outbox-sec')).map((h) => [h.dataset.sec, h]));
  const nodes = [];
  const push = (p) => {
    const isOpen = open.has(p.id);
    nodes.push(keyedRow(app, p, rows.get(p.id) || null, { badge: badges.get(p.adapterId) || null, open: isOpen, onToggle, onReview }));
    if (isOpen) nodes.push(keyedCard(app, p, cards.get(p.id) || null));
  };
  if (!census.total) nodes.push(el('div', 'empty-hint', t('When an agent proposes a reply with vibespace-channels, it waits here for you to approve, edit or reject it.')));
  else if (vw.view === 'awaiting' && !census.waiting) nodes.push(el('div', 'empty-hint', t('Nothing is waiting for your approval.')));
  for (const sec of census.total ? vw.sections : []) {
    if (sec.key === 'messages') {
      nodes.push(paintSecHead(heads.get('messages') || outboxSecHead('messages'), sec, t('Message proposals · {a} awaiting you · {n}', { a: sec.waiting, n: sec.total }), onAll));
      for (const p of sec.items) push(p);
    } else if (sec.key === 'api' && apiSection) {
      apiSection.draw(sec);
      nodes.push(apiSection.el);
    }
  }
  return { nodes, view: vw.view, census, awaiting: msgs.waitingItems, proposals: msgs.items };
}

/** The section a conversation window draws above its composer (design C4): the cards that still wait (awaiting /
 *  sending) in full, then — lane channel-window-tidy — every DECIDED one as its line (the newest `INLINE_DECIDED`;
 *  the rest counted into the Outbox link): an unknown / failed outcome first, then the settled ones, which fold under
 *  ONE line "Handled proposals (N)" when more than `INLINE_FOLD_OVER` are decided. `ui` = `{open: Set, fold}` — the
 *  window's, kept across redraws (default: the section's own); `onJump(vid, at)` = the window's jump to a message.
 *  Empty ⇒ nothing. */
export function renderInlineProposals(app, proposals, prev = null, { ui = null, onJump = null } = {}) {
  const all = (proposals || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!all.length) return null;
  const awaiting = all.filter((p) => p.state === 'awaiting-approval' || p.state === 'sending');
  const decided = all.filter((p) => !awaiting.includes(p)).slice(0, INLINE_DECIDED);
  const attention = decided.filter((p) => p.state === 'unknown' || p.state === 'failed');
  const settled = decided.filter((p) => !attention.includes(p));
  const folding = decided.length > INLINE_FOLD_OVER && settled.length > 0;
  const hidden = all.length - awaiting.length - decided.length;
  // KEYED (2026-09-27): the section a previous render drew is patched — its
  // head re-worded, each card kept unless its record changed
  const sec = prev && prev.classList && prev.classList.contains('chanwin-outbox') ? prev : el('div', 'chanwin-outbox');
  const st = ui || sec._ui || (sec._ui = { open: new Set(), fold: false });
  let head = sec.querySelector(':scope > .chanwin-outbox-head');
  if (!head) {
    head = el('div', 'chanwin-outbox-head');
    head.appendChild(el('span', 'chanwin-outbox-title'));
    const link = el('a', 'chan-prop-link');
    link.href = '#';
    link.onclick = (ev) => { ev.preventDefault(); app.openChannelOutbox(); };
    head.appendChild(link);
  }
  const title = awaiting.length ? `${t('Awaiting your approval')} · ${awaiting.length}` : t('Proposals for this conversation');
  const linkText = hidden > 0 ? t('{n} more in the Outbox', { n: hidden }) : t('Open the Outbox');
  if (head.firstElementChild.textContent !== title) head.firstElementChild.textContent = title;
  if (head.lastElementChild.textContent !== linkText) head.lastElementChild.textContent = linkText;
  const byId = new Map([...sec.querySelectorAll(':scope > .chan-prop')].map((c) => [c.dataset.proposal, c]));
  // a line's click: its card opens / closes in place (found by id — a kept card's handler never holds a stale record)
  const onLine = (id) => {
    if (st.open.has(id)) st.open.delete(id); else st.open.add(id);
    const card = sec.children && [...sec.children].find((c) => c.dataset && c.dataset.proposal === id);
    if (card) setLineOpen(card, st.open.has(id));
    if (card && st.open.has(id)) reveal(card, card.querySelector(':scope > .chan-prop-line'));
  };
  const lineOf = (p, infold) => {
    const c = keyedCard(app, p, byId.get(p.id) || null, { compact: true, line: true, onLine, onJump });
    setLineOpen(c, st.open.has(p.id));
    c.classList.toggle('chan-prop-infold', !!infold);
    return c;
  };
  let fold = folding ? sec.querySelector(':scope > .chanwin-outbox-fold') : null;
  if (folding && !fold) {
    fold = el('div', 'chanwin-outbox-fold');
    fold.tabIndex = 0;
    fold.setAttribute('role', 'button');
    fold.appendChild(icon('chevronRight', 10, 'chan-prop-line-chev'));
    fold.appendChild(el('span', 'chanwin-outbox-fold-text'));
    const flip = () => {
      st.fold = !st.fold;
      sec.classList.toggle('chanwin-outbox-foldopen', st.fold);
      fold.setAttribute('aria-expanded', st.fold ? 'true' : 'false');
      if (st.fold) reveal([...sec.children].filter((c) => c.classList.contains('chan-prop-infold')).pop(), fold);
    };
    fold.onclick = flip;
    fold.onkeydown = (ev) => { if (ev.target !== fold || (ev.key !== 'Enter' && ev.key !== ' ')) return; ev.preventDefault(); flip(); };
  }
  if (fold) {
    const words = t('Handled proposals ({n})', { n: settled.length });
    if (fold.lastElementChild.textContent !== words) fold.lastElementChild.textContent = words;
    fold.setAttribute('aria-expanded', st.fold ? 'true' : 'false');
  }
  sec.classList.toggle('chanwin-outbox-foldopen', !!(folding && st.fold));
  placeArmed(sec, [
    head,
    ...awaiting.map((p) => keyedCard(app, p, byId.get(p.id) || null, { compact: true })),
    ...attention.map((p) => lineOf(p, false)),
    ...(fold ? [fold] : []),
    ...settled.map((p) => lineOf(p, folding)),
  ]);
  return sec;
}

// ── lane chat-proposal-card: THE THIRD PLACE — the agent's chat, at the call row that filed it ──
// The owner (2026-10-23, reading his agent's chat): 「最下面那个是 outbox 请求吗？我视觉上完全看不出来啊」 — the agent ran
// `vibespace-channels reply` and said «Channels 里放了一条 reply-all 提案»; nothing in the chat WAS the proposal. Now the
// call row that filed it (the §26 witness binds the reply / compose / react / recall touch — its `proposalId` — to that
// row; PURE src/channel-touch.js `filedProposals`) carries:
//  · a CHIP on the conversation's row — «提案 · 回复 Ada · 待批准»; once decided, the OUTCOME in words
//    («已发送 · 12:14» / «你拒绝了» / «已过期»), so a chat read later still says what became of it;
//  · THE CARD — `renderProposalCard`, the one implementation — in ONE keyed box after the row's conversation rows (the
//    raw-API card's place, B-2198 part 2: the call row's expanded body, which the run fold keeps on screen): while it
//    waits the whole card (Approve / Edit / Reject exactly as in the Outbox — the same routes, the same arming, the same
//    `shown` digest); decided, its ONE line (the conversation window's rule above), which opens the card in place.
// The records are the SAME store's — `GET /api/channels/outbox?ids=…`, each only while its drafter still sees where it
// was filed (a conversation whose agent is no longer admitted never draws the card) — re-read on a
// `channel-outbox-updated` naming one of them; cards are keyed by proposal id and patched in place, never re-appended.
const CHAT_REFETCH_MS = 60;
const chatProps = { recs: new Map(), asked: new Set(), boxes: new Set(), timer: null, inflight: null, again: false, wired: false };
const waitsOn = (p) => !!p && (p.state === 'awaiting-approval' || p.state === 'proposed' || p.state === 'sending');
/** The chip's words: «Proposal · <what> · <state>» — what = who receives it (gistOf), the state the outcome in words. */
export function proposalChipText(p) {
  return `${t('Proposal')} · ${chipWhat(p)} · ${chipState(p)}`;
}
function chipWhat(p) {
  if (p.kind === 'reaction') return t('a reaction');
  if (p.kind === 'recall') return t('taking back your message');
  const g = gistOf(p);
  const who = g && g.first ? (g.n > 1 ? `${g.first} +${g.n - 1}` : g.first) : '';   // «Ada +2» — the card lists them all
  if (g && g.verb === 'compose') return who ? t('New message to {who}', { who }) : t('New message');
  if (who) return g.verb === 'reply-all' ? t('Reply all to {who}', { who }) : t('Reply to {who}', { who });
  return t('Reply in {conv}', { conv: convNameOf(p) || p.adapterLabel || p.adapterId || '' });
}
function chipState(p) {
  if (p.state === 'awaiting-approval' || p.state === 'proposed') return t('awaiting approval');
  if (p.state === 'sent') return partlySent(p) ? t('partly sent') : t('sent · {time}', { time: fateStamp((p.result && p.result.at) || p.updatedAt || p.at) });
  if (p.state === 'rejected') return t('you rejected it');
  return stateLabel(p.state);
}
function chatWanted() {
  const ids = new Set();
  for (const b of [...chatProps.boxes]) {
    if (b.isConnected) b._seen = true;
    else if (b._seen) { chatProps.boxes.delete(b); continue; }
    for (const id of b._ids || []) ids.add(id);
  }
  return ids;
}
function chatFetchSoon() {
  if (chatProps.timer) return;
  chatProps.timer = setTimeout(() => { chatProps.timer = null; chatFetch(); }, CHAT_REFETCH_MS);
}
function chatFetch() {
  if (chatProps.inflight) { chatProps.again = true; return chatProps.inflight; }
  const ids = [...chatWanted()];
  if (!ids.length) return Promise.resolve();
  for (const id of ids) chatProps.asked.add(id);
  chatProps.inflight = fetchJson(`/api/channels/outbox?ids=${encodeURIComponent(ids.join(','))}`).then((r) => {
    if (!r || r.error || !Array.isArray(r.proposals)) return;
    const got = new Map(r.proposals.map((p) => [p.id, p]));
    for (const id of ids) { if (got.has(id)) chatProps.recs.set(id, got.get(id)); else chatProps.recs.delete(id); }
    for (const b of [...chatProps.boxes]) paintChatBox(b);
  }).catch(() => {}).finally(() => { chatProps.inflight = null; if (chatProps.again) { chatProps.again = false; chatFetchSoon(); } });
  return chatProps.inflight;
}
function wireChat(app) {
  if (chatProps.wired || !app || !app.ws || typeof app.ws.onGlobal !== 'function') return;
  chatProps.wired = true;
  app.ws.onGlobal((msg) => {
    if (!msg || msg.type !== 'channel-outbox-updated' || !chatProps.boxes.size) return;
    const ch = Array.isArray(msg.changed) ? msg.changed.map(String) : [];
    if (ch.length && !ch.some((id) => [...chatProps.boxes].some((b) => (b._ids || []).includes(id)))) return;   // an account-wide change names none: re-read
    chatFetchSoon();
  });
}
/** A reconnect / restarted server: every chat card's record is read again (the store is the server's). */
export function refreshChatProposals() { chatProps.asked.clear(); if (chatProps.boxes.size) chatFetchSoon(); }
/** The row's chip, keyed by proposal id inside the conversation row it was filed on (textContent; patched in place). */
function paintChips(box) {
  const card = box._cardEl;
  if (!card) return;
  const rows = [...card.querySelectorAll('.chat-channel-touches > .chat-channel-touch')];
  const want = new Map();
  for (const f of box._filed || []) { const p = chatProps.recs.get(f.id); if (p) want.set(f.key, p); }   // the newest filed on a row wins
  for (const row of rows) {
    const p = want.get(row.dataset.key) || null;
    let chip = row.querySelector(':scope > .cct-prop');
    if (!p) { if (chip) chip.remove(); row.classList.remove('has-prop'); continue; }
    if (!chip) { chip = el('span', 'cct-prop'); row.insertBefore(chip, row.querySelector(':scope > .cct-time')); }
    const text = proposalChipText(p);
    if (chip.textContent !== text) chip.textContent = text;
    chip.dataset.proposal = p.id;
    chip.dataset.state = partlySent(p) ? 'partly' : p.state;
    row.classList.add('has-prop');
  }
}
function paintChatBox(box) {
  if (!box || !box._ids) return;
  const app = box._app;
  const recs = box._ids.map((id) => chatProps.recs.get(id)).filter(Boolean);
  paintChips(box);
  const have = new Map([...box.children].filter((c) => c.dataset && c.dataset.proposal).map((c) => [c.dataset.proposal, c]));
  const open = box._open;
  const onLine = (id) => {
    if (open.has(id)) open.delete(id); else open.add(id);
    const c = [...box.children].find((x) => x.dataset && x.dataset.proposal === id);
    if (c) setLineOpen(c, open.has(id));
    if (c && open.has(id)) reveal(c, c.querySelector(':scope > .chan-prop-line'));
  };
  const nodes = recs.map((p) => {
    const line = !waitsOn(p);
    const onJump = (vid) => { if (app && typeof app.openChannel === 'function' && p.convId) app.openChannel(p.adapterId, p.convId, { jump: { vid } }); };
    const c = keyedCard(app, p, have.get(p.id) || null, { line, onLine, onJump });
    if (line) setLineOpen(c, open.has(p.id));
    return c;
  });
  placeArmed(box, nodes);
  box.hidden = !nodes.length;
  const n = String(recs.length), w = String(recs.filter(waitsOn).length);
  if (box.dataset.n !== n || box.dataset.awaiting !== w) {
    box.dataset.n = n; box.dataset.awaiting = w;
    if (typeof box._onCount === 'function') box._onCount();   // the run fold's head counts them («· 1 条提案待批准»)
  }
}
/**
 * THE CHAT'S CARDS for ONE call row: `filed` = [{id, key}] (PURE `filedProposals` over the touches bound to the row) —
 * ONE keyed `.chat-chan-props` box after the row's conversation rows (and its API cards), the chips on those rows.
 * `onCount()` = the row's count of proposals / waiting ones moved (the ChatView re-words its run fold).
 */
export function chatProposalCards(app, cardEl, filed, { onCount = null } = {}) {
  if (!cardEl) return;
  let box = cardEl.querySelector('.chat-chan-props');
  const list = (Array.isArray(filed) ? filed : []).filter((f) => f && f.id);
  if (!list.length) {
    for (const c of cardEl.querySelectorAll('.chat-channel-touch > .cct-prop')) { c.parentNode.classList.remove('has-prop'); c.remove(); }
    if (box) { chatProps.boxes.delete(box); box.remove(); if (typeof onCount === 'function') onCount(); }
    return;
  }
  if (!box) {
    box = el('div', 'chat-chan-props');
    box.setAttribute('aria-label', t('Proposals this call filed'));
    box.hidden = true;
    box.dataset.n = '0'; box.dataset.awaiting = '0';   // born empty: only a record moves the count (the fold re-words)
    box._open = new Set();
    const after = cardEl.querySelector('.chat-api-cards') || cardEl.querySelector('.chat-channel-touches');
    if (after) after.after(box); else (cardEl.querySelector('.chat-tool-use') || cardEl).appendChild(box);
  }
  box._app = app; box._cardEl = cardEl; box._filed = list; box._ids = list.map((f) => String(f.id)); box._onCount = onCount;
  chatProps.boxes.add(box);
  wireChat(app);
  paintChatBox(box);
  if (box._ids.some((id) => !chatProps.asked.has(id))) chatFetchSoon();
}

/** Open (or focus) THE Outbox window — a singleton kind. */
export function openChannelOutbox(app, opts = {}) {
  for (const [id, w] of app.wm.windows || []) if (w && w.type === 'channel-outbox') { app.wm.revealWindow(id, { replay: !!opts.syncId }); return w; }
  const winInfo = app.wm.createWindow({ title: t('Outbox'), type: 'channel-outbox', syncId: opts.syncId, openSpec: { action: 'openChannelOutbox' }, width: 560, height: 600 });
  const root = el('div', 'chanwin chan-outbox');
  winInfo.content.appendChild(root);
  const bar = el('div', 'jobs-toolbar');
  const summary = el('span', 'jobs-summary');
  bar.appendChild(summary);
  // the Awaiting | All segment (a1 C5): Awaiting = only what waits for you (every section); All = everything newest first
  const seg = el('div', 'chan-seg');
  const segAwait = el('button', 'jobs-btn', t('Awaiting'));
  segAwait.type = 'button'; segAwait.dataset.view = 'awaiting';
  const segAll = el('button', 'jobs-btn', t('All'));
  segAll.type = 'button'; segAll.dataset.view = 'all';
  seg.append(segAwait, segAll);
  bar.appendChild(seg);
  // lane outbox-window-scroll-filter: THE list is the window's ONE scroll container — the API calls' section is a node
  // INSIDE it (it sat beside it and squeezed it to 0 px), placed where the census's view puts it
  const list = el('div', 'chanwin-list chan-outbox-list');
  root.append(bar, list);
  /** `null` until the user picks — the census decides the first view. */
  let view = null;
  let last = null;
  let apiCards = [];
  /** B-f467: the proposals whose full card is open under their row (pruned as proposals leave). */
  const open = new Set();
  const onToggle = (id) => { if (open.has(id)) open.delete(id); else open.add(id); draw(last); };
  const onReview = (id) => {
    open.add(id);
    draw(last);
    const card = [...list.children].find((c) => c.classList.contains('chan-prop') && c.dataset.proposal === id);
    const primary = card && card.querySelector(':scope > .chan-prop-actions button[data-approve]');
    if (primary) primary.focus();
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
  };
  /** A folded section's 「在「全部」里看」: the All view, that section's head at the top of the list. */
  const onAll = (key) => {
    view = 'all';
    draw(last);
    const h = [...list.querySelectorAll('.chan-outbox-sec')].find((x) => x.dataset.sec === key);
    if (h && h.scrollIntoView) h.scrollIntoView({ block: 'start' });
  };
  const apiSec = apiOutboxSection(app, { onRecords: (recs) => { apiCards = recs; draw(last); }, onAll });

  // KEYED (2026-09-27): a broadcast re-renders only the rows / cards whose record
  // changed; a card the user is editing is left alone; section heads are
  // re-worded in place (B-f467: the nodes are outboxNodes' — a row per proposal)
  function draw(ob) {
    last = ob;
    const r = outboxNodes(app, list, ob, { view, open, onToggle, onReview, apiCards, apiSection: apiSec, onAll });
    for (const id of [...open]) if (!r.proposals.some((p) => p.id === id)) open.delete(id);
    segAwait.classList.toggle('chan-seg-on', r.view === 'awaiting');
    segAll.classList.toggle('chan-seg-on', r.view === 'all');
    summary.textContent = r.census.total ? t('{a} awaiting your approval · {n} proposals', { a: r.census.waiting, n: r.census.total }) : t('No proposals yet');
    const nodes = r.nodes;
    placeArmed(list, nodes);
  }
  segAwait.onclick = () => { view = 'awaiting'; draw(last); };
  segAll.onclick = () => { view = 'all'; draw(last); };
  async function refresh() {
    const r = await fetchJson('/api/channels/outbox');
    if (!r || r.error) { summary.textContent = (r && r.error) || t('The outbox is not available.'); return; }
    draw(r);
  }
  const onBroadcast = (msg) => { if (msg.type === 'channel-outbox-updated' && msg.outbox) draw(msg.outbox); };
  app.ws.onGlobal(onBroadcast);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { app.ws.offGlobal(onBroadcast); } catch {} apiSec.stop(); });
  refresh().catch(() => {});
  return winInfo;
}

registerWindowType({
  type: 'channel-outbox', label: t('Outbox'), icon: ICON, singleton: true,
  action: 'openChannelOutbox',
  replay: (app, spec, { syncId } = {}) => app.openChannelOutbox({ syncId }),
});
registerCommand({ id: 'channels.openOutbox', title: () => t('Outbox…'), run: (c) => c.app.openChannelOutbox() });
/** The ⚙ row beside "Channels…" — registered by the owning module. */
registerMenuItem({
  menu: 'gear', parent: 'comm', order: 20, // under Communication ▸ (gear-menu.js head 'comm'; For you 5 · Channels 10 · this 20)
  icon: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11v8h-11z"/><path d="M2.5 4.5l5.5 4 5.5-4"/></svg>',
  label: () => t('Outbox…'),
  run: (c) => c.app.openChannelOutbox(),
});
