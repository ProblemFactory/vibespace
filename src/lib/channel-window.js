// THE CHANNEL CONVERSATION WINDOW (docs/design-communication-panel.zh.md
// §10.1, §10.3; the a4 UI design docs/design-communication-panel-ui.md §4.2).
// A registered WINDOW TYPE, so layout restore, cross-client sync, virtual
// desktops, tab groups and the taskbar all work for free and `replayOpenSpec`
// cannot silently drop it (the registry has a loud default).
//
// THE BAR IS THREE TIERS WITH A RHYTHM (a1 W2): title 13/600 + ONE ⋯ button
// (the `channel-row` contribution menu — Mark read / Refresh now / Refresh
// every ▸ / Assign & filter… / Reach & policy… — with the same ctx the
// panel's row menu uses), the meta line 11 dim (adapter label · participants
// · freshness), and the assignment IN EFFECT as an accent-tint CHIP that
// opens the editor (inherited from the account or a rule: dim + labelled).
// No verbs at title weight.
//
// THE AGGREGATED IM (2026-09-26, design §6.5): the window is a READER — it
// beats a `watch` heartbeat while open (the conversation is hot, a stale one
// is fetched at once), scrolls up into the vendor's older history on demand
// (`/older`, prepended to the log), and draws each message's ATTACHMENTS:
// an image as a thumbnail loaded through OUR route (`img.src`, `?inline=1`
// — raster only, the route refuses anything else inline) that opens the
// shared image overlay, every other file as a chip with its name, size and
// a download link (the route answers `Content-Disposition: attachment` +
// nosniff: never executed, never rendered in our origin).
//
// THE LIST reads like a chat, not a form (a1 W4): a day separator when the
// day changes, consecutive lines by the same author within 5 minutes grouped
// under one head, an agent's name in the accent text tone.
//
// TWO RULES GOVERN WHAT IT DRAWS:
//
// 1. EVERY VENDOR STRING IS HOSTILE INPUT (fence 5). A Lark body and a Gmail
//    part are peer-controlled and sync to every client, so EVERY string is
//    textContent — no innerHTML on any path, no HTML from an adapter, no
//    markdown parse in the browser. Since §25 (2026-09-27) a body is the
//    record's TYPED TREE (`record.blocks`, else the generic rung over `text`)
//    drawn by ONE renderer (src/lib/channel-blocks-view.js): links and
//    pictures are built from VALIDATED fields (an http(s)/mailto href, an
//    attachment id loaded through our route), quoted history and signatures
//    fold, a mention is a chip — and the rule above holds on every node.
//
// 2. THE SEND CONTROL EXISTS ONLY IF `offers()` SAYS SO. That answer is the
//    server's, resolved from BOTH the adapter's static `caps` and this
//    conversation's own `convCaps` — and `unknown` renders as "not offered +
//    the reason", never as "allowed". On a read-only conversation there is NO
//    composer element at all: a disabled control the user can see but not use
//    invites the question "why?", and the honest answer belongs in the
//    footer beside the conversation it is about.
//
// THE OWNER'S OWN MESSAGE GOES OUT DIRECTLY (design §22.2 ①, g3 — "an IM,
// not a feed"): where the conversation offers `sendAsUser` the composer is a
// SEND, as you, at once (`POST …/send`: no policy, no approval card — those
// are for AGENT drafts, which keep the inline outbox cards). Where only the
// bot identity is offered, a message would not be the owner speaking, so the
// composer PROPOSES (P3) and says why sending as you is not offered here. The
// identity warning lives ON THE CARD (once, only when it warns), never as a
// standing line under the composer (a1 W1). An AGENT GROUP (the same window
// type, `adapterId` = the group namespace) is drawn by `openGroupWindow`
// below: its composer sends as You, @name wakes.
import { fetchJson, showToast, showContextMenu, showImageOverlay } from './utils.js';
import { t, deviceLocale } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { menuItems } from './contributions.js';
import { icon, el, btn, avatar, convAvatar, fileIcon } from './channel-chrome.js';
// P2: the Assign & filter editor and the one-line summary the bar draws.
import { showAssignFilterDialog, assignmentSummary } from './channel-filter-editor.js';
// P3: the inline approval cards (the SAME renderer the Outbox window uses —
// one store, two places, §9.2).
import { renderInlineProposals, reasonLabel } from './channel-outbox.js';
// a3 i18n: a route failure is worded by its CODE, never by the engine's sentence.
import { routeErrorText, attachmentReasonText } from './channel-words.js';
// R3 (§23): a picture's next step (retry / the named chip) and the text line its placeholder leaves — PURE, shared with the engine
import * as Att from '../channel-attachments.js';
import { track } from './telemetry-client.js';
// §25: THE ONE body path — the record's typed tree (or the generic rung over its
// text) through the ONE renderer; the pictures a tree places are drawn IN PLACE
import { renderBlocks, placedAttachments, blocksOfRecord } from './channel-blocks-view.js';
// verify round 3: THE UPWARD PAGE'S VERDICT — a scroll event is displacement; the person's input is intent (PURE)
import { pageUpVerdict, isGutterPress, isUpKey, isTypingTarget, wheelTowardOlder, nestedScrollTop, holdUntilAfter, atTail, PULL_PX } from './channel-paging.js';
// §25: the read-only footer's Re-authorize is the account's own re-auth dialog
import { showReauthAccountDialog } from './channel-account-dialogs.js';
// PURE, bundled directly (the task-color-seq / quota-model pattern): the
// server sends STRUCTURE and the sentence is composed HERE, because the
// digest is broadcast to every client while the language is per DEVICE.
import * as chanCaps from '../channel-caps.js';
// g3 (design §22): the composer's mode by conversation kind, the @-autocomplete,
// the wake preview, and the group dialogs + words.
import { composerMode, isGroupConv, mentionQuery, mentionCandidates, insertMention, wakePreview, OWNER, GROUP_ADAPTER_ID } from './channel-groups-view.js';
import { showGroupDetail, showGroupMembersDialog, renameGroup, archiveGroup } from './channel-group-dialogs.js';
import { groupErrorText, wakeEchoText } from './channel-words.js';
import { touchedByRow } from './channel-touch-view.js'; // §26 (B-099e): "Drafted by <agent>" — the reverse link to the chat

const ICON = svgIcon16('<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>');

const PAGE = 50;
/** Consecutive lines by the same author within this window share one head. */
const GROUP_MS = 5 * 60e3;

const stamp = (ms) => {
  const d = new Date(Number(ms) || 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** The local calendar day of an instant — the separator's key. */
const dayKey = (ms) => {
  const d = new Date(Number(ms) || 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** The separator's words: today / yesterday / the date in the DEVICE's language
 *  (`deviceLocale()` — the app's language choice, never the browser's: a zh/ja
 *  device on an en browser drew "Sep 22" between zh messages; the census caught it). */
function dayLabel(ms, now = Date.now()) {
  const k = dayKey(ms);
  if (k === dayKey(now)) return t('Today');
  if (k === dayKey(now - 86400e3)) return t('Yesterday');
  try { return new Date(Number(ms) || 0).toLocaleDateString(deviceLocale(), { month: 'short', day: 'numeric' }); } catch { return k; }
}
const authorKey = (rec) => (rec.author && (rec.author.id || rec.author.name)) || '';
/** A message's full instant in the DEVICE's language (a time's tooltip). */
function fullStamp(ms) {
  try { return new Date(Number(ms) || 0).toLocaleString(deviceLocale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return stamp(ms); }
}

/** A byte count in a chip's words. */
function sizeText(n) {
  const b = Number(n);
  if (!Number.isFinite(b) || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;
}
/** A message's ATTACHMENTS (2026-09-26): an image is a thumbnail through OUR
 *  route (never a vendor URL, never innerHTML — `img.src` only), the rest a
 *  chip with name · size and a download link.
 *
 *  R3 (2026-09-26, the owner: "lark图像不能预览吗？" — he saw "[image]" and a
 *  bare "image ⬇" chip): A THUMBNAIL THAT DID NOT DRAW SAYS WHY. The route's
 *  answer is asked again ONCE (a remembered refusal costs no vendor call) and
 *  PURE `thumbVerdict` decides: a wait fixes it (the minute's budget, the
 *  vendor's back-off / rate limit) ⇒ a "retrying in N s" chip and the picture
 *  loads itself again (twice at most, only while the window shows it); it
 *  does not ⇒ the chip NAMES the reason (budget spent / not found / not
 *  cached / vendor error …, the whole sentence in its title) with a Retry that
 *  asks past the remembered refusal. A file that is there but is no raster
 *  picture (HEIC …) becomes the download chip, said as "no preview".
 *
 *  §25 (2026-09-27): a picture the record's TREE places (an `img` / `file`
 *  block — a Lark image, a picture inside a rich text, a placeholder line of
 *  the generic rung) is drawn IN PLACE by `attachmentNode`, so the "[image]"
 *  words never reach the body at all; `renderAttachments` draws the REST in
 *  the strip under the message, exactly as before. */
function attachmentNode(rec, a, base) {
  const url = `${base}/attachment/${encodeURIComponent(a.id)}?msg=${encodeURIComponent(rec.vendorId || '')}`;
  const chipOf = () => {
    const c = document.createElement('a');
    c.className = 'chanmsg-att chanmsg-file';
    c.href = url;
    c.setAttribute('download', a.name || 'attachment');
    c.rel = 'noopener';
    c.dataset.channelAttachment = a.id;
    // THE LOOK (channel-polish): a file is a small card — its type glyph, its name, its size
    c.appendChild(fileIcon(a.name, 16, 'chanmsg-att-type'));
    const words = el('span', 'chanmsg-att-words');
    words.appendChild(el('span', 'chanmsg-att-name', a.name || t('attachment')));
    const sz = sizeText(a.bytes);
    if (sz) words.appendChild(el('span', 'chanmsg-att-size', sz));
    c.appendChild(words);
    c.appendChild(icon('download', 12, 'chanmsg-att-dl'));
    c.title = t('Download {name} — it is saved, never opened here', { name: a.name || t('attachment') });
    return c;
  };
  if (!Att.isImage(a)) return chipOf();
  // A PICTURE is a rounded card; its name (when the vendor gave one) is a caption on hover —
  // `data-caption` read by CSS as plain text, never markup. A refusal chip replaces the <img>
  // INSIDE the card, so the card never outlives its picture as an empty frame.
  const card = el('span', 'chanmsg-pic');
  const named = a.name && !/^image$/i.test(String(a.name));
  if (named) card.dataset.caption = [a.name, sizeText(a.bytes)].filter(Boolean).join(' · ');
  card.appendChild(thumbOf(a, url, { attempt: 0, chipOf }));
  return card;
}
function renderAttachments(rec, base, { skip = null } = {}) {
  const list = Array.isArray(rec.attachments) ? rec.attachments.filter((a) => a && a.id && !(skip && skip.has(a.id))) : [];
  if (!list.length || !base) return null;
  const box = el('div', 'chanmsg-atts');
  for (const a of list) box.appendChild(attachmentNode(rec, a, base));
  return box;
}

/** ONE picture: the thumbnail, its retry, its named refusal (see above). */
function thumbOf(a, url, { attempt = 0, retry = false, chipOf, onDrawn }) {
  const img = document.createElement('img');
  img.className = 'chanmsg-thumb';
  img.alt = a.name || t('image');
  img.loading = 'lazy';
  img.dataset.channelImage = a.id;
  img.onload = () => { if (img.naturalWidth > 0) { img.dataset.drawn = '1'; onDrawn && onDrawn(); } };
  img.onerror = () => { thumbFailed(img, a, url, attempt, { chipOf, onDrawn }).catch(() => {}); };
  img.onclick = () => showImageOverlay(img.src);
  img.title = t('Open the image');
  // OUR route, as a property — never markup; a retry is a NEW url (a refusal is `no-store`, but a
  // browser that kept it must not replay it) and the person's Retry asks past a remembered refusal
  img.src = `${url}&inline=1${attempt || retry ? `&n=${attempt}${retry ? '&retry=1' : ''}` : ''}`;
  return img;
}
async function thumbFailed(img, a, url, attempt, ctx) {
  if (!img.isConnected) return;
  let answer = null;
  try {
    const res = await fetch(`${url}&inline=1&n=${attempt}q`, { headers: { Accept: 'application/json' } });
    if (res.ok) { answer = { ok: true, mime: (res.headers.get('content-type') || '').split(';')[0].trim() }; try { await res.body?.cancel(); } catch {} }
    else { let j = {}; try { j = await res.json(); } catch {} answer = { ok: false, code: j.code || (res.status === 429 ? 'vendor-budget' : 'vendor-error'), retryAfterSec: j.retryAfterSec || Number(res.headers.get('retry-after')) || null, error: j.error || null, raw: j }; }
  } catch { answer = null; }
  if (!img.isConnected) return;
  const v = Att.thumbVerdict(answer, attempt);
  if (v.kind === 'retry') {
    const wait = waitChip(a, v.afterSec);
    img.replaceWith(wait);
    setTimeout(() => { if (wait.isConnected) wait.replaceWith(thumbOf(a, url, { ...ctx, attempt: attempt + 1 })); }, v.afterSec * 1000);
    return;
  }
  const chip = v.download ? ctx.chipOf() : refusedChip(a, url, v.code, answer, ctx);
  if (v.download) { chip.classList.add('chanmsg-att-nopreview'); chip.appendChild(el('span', 'chanmsg-att-why', attachmentReasonText('no-preview'))); }
  chip.dataset.refused = v.code;
  img.replaceWith(chip);
  // a picture that did not draw is REPORTED, never only drawn as a chip (the no-silent-failures law)
  try { track('event', 'chan-attachment-failed', { code: v.code }); } catch {}
}
/** "Loading the image — retrying in N s": the wait a budget / a back-off needs, said. */
function waitChip(a, sec) {
  const c = el('span', 'chanmsg-att chanmsg-att-wait');
  c.dataset.channelImage = a.id;
  c.appendChild(icon('hourglass', 11));
  c.appendChild(el('span', 'chanmsg-att-name', a.name || t('image')));
  c.appendChild(el('span', 'chanmsg-att-why', t('retrying in {s} s', { s: sec })));
  c.title = t('Loading the image — retrying in {s} s', { s: sec });
  return c;
}
/** The picture could not be fetched: its name, the reason in one word, the
 *  whole sentence in the title, and a Retry that asks past the remembered refusal. */
function refusedChip(a, url, code, answer, ctx) {
  const c = el('span', 'chanmsg-att chanmsg-att-failed');
  c.dataset.channelImage = a.id;
  c.appendChild(icon('image', 11));
  c.appendChild(el('span', 'chanmsg-att-name', a.name || t('image')));
  c.appendChild(el('span', 'chanmsg-att-why', attachmentReasonText(code)));
  const why = answer && !answer.ok ? routeErrorText({ code, error: answer.error, retryAfterSec: answer.retryAfterSec }) : attachmentReasonText(code);
  c.title = t('The image could not be loaded: {why}', { why });
  const again = el('button', 'chanmsg-att-retry', t('Retry'));
  again.type = 'button';
  again.dataset.channelRetry = a.id;
  again.onclick = (ev) => { ev.stopPropagation(); c.replaceWith(thumbOf(a, url, { ...ctx, attempt: 0, retry: true })); };
  c.appendChild(again);
  return c;
}

/** A SYSTEM LINE (a vendor's "X added Y to the group"): a record whose whole
 *  tree is `sys` blocks of the `system` kind. It is drawn as a centred dim line
 *  with its time — no avatar, no author head (the author did not SAY it) — and
 *  it never starts or continues an author's run. A seam row carries the flag. */
function isSysRow(rec) {
  if (!rec) return false;
  if (rec.sys === true) return true;
  const blocks = blocksOfRecord(rec);
  return Array.isArray(blocks) && blocks.length > 0 && blocks.every((b) => b && b.k === 'sys' && b.what === 'system');
}
/** The author's avatar (THE LOOK, channel-polish): initials on the author's
 *  stable hue — the self author in the accent; paint, the name is the head. */
function authorAvatar(rec) {
  const a = rec.author || {};
  return avatar({ name: a.name || a.id || '', key: authorKey(rec), self: !!a.isSelf }, null, 'chanmsg-av');
}

/** ONE row. EVERYTHING is textContent — see rule 1. `cont` = a continuation
 *  of the previous author's run (no avatar, no head, tighter; its time shows
 *  on hover in the avatar's gutter). `base` = the conversation's route prefix
 *  (its attachments load through it). `folds` = the window's memory of which
 *  quotes the person opened. */
function renderRecord(rec, { cont = false, base = null, folds = null } = {}) {
  const sys = isSysRow(rec);
  const self = !!(rec.author && rec.author.isSelf);
  const row = el('div', 'chanmsg' + (sys ? ' chanmsg-sysrow' : cont ? ' chanmsg-cont' : '') + (rec.author && rec.author.isBot ? ' chanmsg-agent' : '') + (self && !sys ? ' chanmsg-self' : ''));
  row.dataset.at = String(rec.at || 0);
  row.dataset.author = sys ? '' : authorKey(rec);
  row.dataset.vid = rec.vendorId || '';
  const full = fullStamp(rec.at);
  if (sys) {
    const body = renderBlocks(blocksOfRecord(rec), { t, folds, foldKey: rec.vendorId || rec.id || '', fallbackText: rec.text || '' });
    row.appendChild(body);
    const when = el('span', 'chanmsg-at', stamp(rec.at));
    when.title = full;
    row.appendChild(when);
    return row;
  }
  if (!cont) {
    row.appendChild(authorAvatar(rec));
    const head = el('div', 'chanmsg-head');
    const who = el('b', '', (rec.author && rec.author.name) || (rec.author && rec.author.id) || t('unknown'));
    const when = el('span', 'chanmsg-at', stamp(rec.at));
    when.title = full;
    head.append(who, when);
    if (rec.raw && rec.raw.synthetic) {
      // A scraped source mints its own key. Saying so on the row is the same
      // honesty the freshness chip owes: the reader should know which evidence
      // this line came from.
      const s = el('span', 'chanmsg-syn', t('scanned'));
      s.title = t('This message has no vendor id — the adapter minted a stable key from its content.');
      head.appendChild(s);
    }
    row.appendChild(head);
  } else {
    // a continuation line's own time, shown on hover (the run's head says the first)
    const when = el('span', 'chanmsg-at chanmsg-at-hover', stamp(rec.at));
    when.title = full;
    row.appendChild(when);
  }
  // THE BODY: the record's typed tree (else the generic rung over its text)
  // through the ONE renderer — a picture the tree places is drawn in place
  const blocks = blocksOfRecord(rec);
  const atts = Array.isArray(rec.attachments) ? rec.attachments.filter((a) => a && a.id) : [];
  const placed = new Set();
  const body = renderBlocks(blocks, {
    t, folds, foldKey: rec.vendorId || rec.id || '', fallbackText: rec.text || '',
    attachment: (id) => {
      const a = base ? atts.find((x) => x.id === id) : null;
      if (!a) return null;
      placed.add(id);
      return attachmentNode(rec, a, base);
    },
  });
  row.appendChild(body);
  // what the tree did not place (a mail's attachments, a fixture's files) goes in the strip below
  for (const id of placedAttachments(blocks)) if (atts.some((a) => a.id === id)) placed.add(id);
  const rest = renderAttachments(rec, base, { skip: placed });
  if (rest) row.appendChild(rest);
  return row;
}
/** A day separator: a centred pill on a hairline. */
function daySeparator(ms) {
  const d = el('div', 'chanmsg-day');
  d.appendChild(el('span', 'chanmsg-day-label', dayLabel(ms)));
  d.dataset.day = dayKey(ms);
  return d;
}

/**
 * Open (or focus) the window for ONE conversation. Singleton PER CONVERSATION
 * — the registry's `singleton` flag is per KIND, which is not what we want:
 * two different conversations are two windows, the same one twice is not.
 */
export function openChannelWindow(app, adapterId, convId, opts = {}) {
  // `_openSpec` is where WindowManager.createWindow parks it (window.js:125) —
  // the underscore is the storage, not a private we are reaching around.
  const key = `${adapterId}/${convId}`;
  for (const [id, w] of app.wm.windows || []) {
    const spec = w && w._openSpec;
    if (spec && spec.action === 'openChannel' && `${spec.adapterId}/${spec.convId}` === key) {
      app.wm.revealWindow(id, { replay: !!opts.syncId });
      return w;
    }
  }
  const winInfo = app.wm.createWindow({
    title: t('Channel'), type: 'channel', syncId: opts.syncId,
    openSpec: { action: 'openChannel', adapterId, convId },
    width: 520, height: 560,
  });

  const root = el('div', 'chanwin');
  winInfo.content.appendChild(root);

  const bar = el('div', 'chanwin-bar');
  const list = el('div', 'chanwin-list');
  // FOCUSABLE, LIKE THE CHAT VIEW'S LIST (verify round 4): a click on a row lands the keyboard's scrolling here,
  // so PageUp / Home / ArrowUp reach the list's own keydown — without a tabIndex the keys scrolled the list from
  // `body` and its keydown listener never fired: a keyboard reader who reached the top never paged (never in the
  // tab order: -1)
  list.tabIndex = -1;
  const foot = el('div', 'chanwin-foot');
  root.append(bar, list, foot);
  // an agent GROUP is a different object behind the same window type (g3)
  if (isGroupConv(adapterId)) { root.classList.add('chanwin-group'); return openGroupWindow(app, winInfo, convId, { bar, list, foot }); }

  // THE PAGE BOUNDARY IS A RECORD, NOT AN INSTANT (r2). `at` is not unique —
  // a Lark burst shares a millisecond, Gmail's `internalDate` is
  // second-derived — so paging on the timestamp alone made every record of
  // such a group at or after a boundary permanently unreachable.
  let oldest = null, oldestId = null;
  /** The conversation summary the last render drew — the ONLY thing the
   *  pointer handler consults, so it never POSTs about a stale unread. */
  let lastConv = null;
  /** §25: THE WINDOW'S MEMORY — which quotes / signatures the person opened
   *  (per record, re-applied on every repaint) and which records are drawn
   *  (a broadcast APPENDS the new ones; it never rebuilds a row the person
   *  is reading). */
  const folds = new Map();
  const drawn = new Set();
  /** §25 (verify round): the composer's text across a footer rebuild — a
   *  disconnect flips the footer to the read-only line; the words the person
   *  typed come back with the composer after the re-authorization. */
  let heldDraft = '';

  async function renderBar() {
    const r = await fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}`);
    bar.textContent = '';
    if (!r || r.error) {
      bar.appendChild(el('div', 'chanwin-err', (r && r.error) || t('This conversation is not available.')));
      lastConv = null;
      return null;
    }
    const c = r.conversation;
    lastConv = c;
    // The MANAGER owns titles (`wm.setTitle` updates the bar, the taskbar
    // and a tab label). `winInfo.setTitle?.(…)` was a permanent no-op (r3):
    // the winInfo literal has no such member, so every channel window read
    // "Channel" and two open conversations were indistinguishable — the same
    // silent-optional-call shape as the `off?.()` r2 removed.
    app.wm.setTitle(winInfo.id, c.title || convId);
    // THE LOOK (channel-polish): the conversation's avatar, then ONE column —
    // the title row (title · the access chip · ⋯) over the meta line; on a
    // phone the bar is one line (the avatar and the meta line hidden by CSS)
    bar.appendChild(convAvatar({ key: `${adapterId}/${convId}`, title: c.title || convId, kind: c.kind }, null, 'chanwin-av'));
    const headCol = el('div', 'chanwin-head');
    bar.appendChild(headCol);
    const titleRow = el('div', 'chanwin-title-row');
    titleRow.appendChild(el('b', '', c.title || convId));
    // the ONE control at title height: the row menu (the panel's contribution
    // menu, same ctx) — Mark read / Refresh now / Refresh every ▸ / Assign & filter… / Reach & policy…
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'icon-btn';
    more.title = t('More actions');
    more.appendChild(icon('more', 13));
    more.onclick = (ev) => { ev.stopPropagation(); const rr = more.getBoundingClientRect(); showContextMenu(rr.left, rr.bottom + 2, menuItems('channel-row', { app, conv: c, inWindow: true })); };
    titleRow.appendChild(more);
    headCol.appendChild(titleRow);
    const bits = [c.adapterLabel || c.adapterId];   // the adapter's LABEL, never its id (a3 i18n)
    if (c.participants) bits.push(c.participants);
    const fresh = chanCaps.freshnessText(c.freshness, { t });
    if (fresh) bits.push(fresh);
    // the owner's override, said where it applies (2026-09-26)
    if (c.refresh && c.refresh.every !== 'paused') bits.push(t('refresh set to every {age}', { age: chanCaps.humanAge(c.refresh.every) }));
    const meta = el('div', 'chanwin-meta', bits.join(' · '));
    meta.title = t('How fresh this row is — the lane actually carrying it, not the one the adapter declares.');
    headCol.appendChild(meta);
    headCol.appendChild(touchedByRow(app, winInfo, adapterId, convId));   // §26: ONE node per window (created once, re-appended by every repaint) — under the meta line, in the head column (the .195 merge: channel-render moved the meta into it)
    // P2: the assignment IN EFFECT as a CHIP (every conversation is fetched
    // since 2026-09-26, so every one can wake somebody); inherited from the
    // account or a rule it is dim and says so; it opens the editor.
    {
      const held = !!(c.stats && c.stats.lastWake && c.stats.lastWake.ok === false);
      const inherited = !!(c.assignment && c.assignment.source && c.assignment.source !== 'conversation');
      const chipEl = document.createElement('button');
      chipEl.type = 'button';
      chipEl.className = 'chan-assign-chip' + (c.assignment ? (held ? ' chan-warn' : '') : ' chan-assign-none') + (inherited ? ' chan-assign-inherited' : '');
      chipEl.dataset.channelAssign = '1';
      chipEl.appendChild(icon(c.assignment ? 'filter' : 'plus', 10));
      // unassigned: the chip is the VERB (short); the fact rides its tooltip
      chipEl.appendChild(el('span', '', c.assignment ? assignmentSummary(c) + (held ? ' · ' + t('last wake held') : '') : t('Grant access…')));
      chipEl.title = held ? t('Last wake was held or stashed: {why}', { why: chanCaps.wakeRefusalText(c.stats.lastWake.refused, { t }) || c.stats.lastWake.why || '' }) : (c.assignment ? `${assignmentSummary(c)} — ${t('Grant access… / Notify…')}` : t('No agent has access here — nobody sees it, nobody is woken.'));
      chipEl.onclick = () => showAssignFilterDialog(app, c);
      if (!c.assignment) chipEl.setAttribute('aria-label', t('Grant access…'));
      // aligned on the title row, before ⋯ (the title keeps its share; the chip ellipsizes, its whole text in the tooltip)
      titleRow.insertBefore(chipEl, more);
    }

    // The send half by the capability row (g3): DIRECT as you, the proposal
    // path when only the bot identity is offered, or NOT offered WITH its
    // reason (never silence).
    const cm = composerMode({ conv: c });
    // §25: THE FOOTER IS KEYED BY WHAT IT SAYS — a repaint whose composer mode,
    // words and fix are unchanged leaves it alone (a draft being typed survives
    // every broadcast); a change (a re-authorization, a disconnect) rebuilds it
    // and carries the typed text over into the new composer
    const ad0 = r.adapter || {};
    const footKey = JSON.stringify([cm.mode, cm.why || null, (c.offers && c.offers.sendAsUser && c.offers.sendAsUser.why) || null, !!ad0.sendStartsTurn, ad0.sendForm || null, !!ad0.connectable, ad0.id || null, ad0.sendGrant ? ad0.sendGrant.missing : null, c.policy ? c.policy.mode : null]);
    if (foot.dataset.footKey === footKey && foot.firstChild) return c;
    // a draft being typed is HELD across every rebuild — including the flip to the
    // read-only line (a disconnect mid-sentence) — and restored when the composer returns
    const typed = (foot.querySelector('textarea') || {}).value || heldDraft;
    heldDraft = typed;
    foot.dataset.footKey = footKey;
    if (cm.mode === 'direct' || cm.mode === 'propose') {
      const direct = cm.mode === 'direct';
      // r3: a send that STARTS A TURN (the adapter declares `sendStartsTurn` —
      // the built-in Agents adapter's send wakes that agent) says its cost
      // before the click and echoes it with the Send (`expectWakes`)
      const wakes = r.adapter && r.adapter.sendStartsTurn ? 1 : 0;
      const comp = el('div', 'chanwin-composer');
      comp.dataset.channelSend = '1';
      const ta = document.createElement('textarea');
      ta.placeholder = direct ? t('Write a message — it is sent at once, as you') : t('Write a reply…');
      ta.rows = 2;
      ta.value = typed;
      const row = el('div', 'chanwin-composer-row');
      // §25 (the owner: the footer was "a long sentence"): ONE SHORT LINE — how
      // this send goes out, by the adapter's declared form (`sendForm`, never
      // its id) — and the policy sentence behind the ⓘ beside it. A send that
      // WAKES an agent keeps its cost in the line itself (money is never hidden).
      const sendForm = (r.adapter && r.adapter.sendForm) || 'direct';
      const pol = direct
        ? (wakes ? t('Sent at once, as you — it wakes this agent: 1 billed turn.') : sendForm === 'draft' ? t('Drafted and sent as you') : t('Sent at once, as you'))
        : t('Proposed — sending as you is not offered here');
      const polWhy = direct
        ? t('Sent at once, as you — no policy, no approval. The outbox holds only replies an agent drafts.')
        : `${t('Sending as you is not offered here ({why})', { why: chanCaps.sendWhyText(cm.why, { t }) })} — ${c.policy && c.policy.mode === 'direct' ? t('Policy: direct — your reply is sent at once unless a guard (link, attachment, off-hours) sends it to the outbox for approval.') : t('Policy: review — your reply waits in the outbox for your approval.')}`;
      const note = el('div', 'chanwin-note' + (wakes && direct ? ' chan-warn' : ''));
      note.appendChild(el('span', 'chanwin-note-text', pol));
      if (!wakes) {
        const info = el('span', 'chanwin-note-info');
        info.appendChild(icon('info', 11));
        info.title = polWhy;
        info.tabIndex = 0;
        info.setAttribute('aria-label', polWhy);
        note.appendChild(info);
      }
      note.title = polWhy;
      const sendBtn = btn(direct ? t('Send') : t('Propose'), null, 'mounts-btn-primary');
      if (direct) { sendBtn.dataset.channelDirect = '1'; sendBtn.prepend(icon('send', 11)); } else sendBtn.dataset.channelPropose = '1';
      sendBtn.onclick = async () => {
        const text = ta.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        const r2 = await fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}/${direct ? 'send' : 'propose'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, expectWakes: wakes }) });
        sendBtn.disabled = false;
        if (!r2 || r2.error) { showToast(routeErrorText(r2), { type: 'error' }); return; }
        ta.value = '';
        heldDraft = '';
        const st = r2.proposal && r2.proposal.state;
        // the policy's reasons are an ENUM — worded through the card's own `reasonLabel` (a3 i18n)
        if (st === 'failed') showToast(t('The channel refused the send: {error}', { error: (r2.proposal && r2.proposal.reason) || '' }), { type: 'error' });
        else if (st === 'unknown') showToast(t('The send left but its answer was lost — check the conversation on the platform'), { type: 'warn' });
        else showToast(st === 'sent' ? t('Sent') : st === 'awaiting-approval' ? t('Held in the outbox for your approval ({why})', { why: ((r2.decision && r2.decision.reasons) || []).map(reasonLabel).join('; ') }) : t('Proposal {state}', { state: st || '?' }));
      };
      ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });
      row.append(note, sendBtn);
      comp.append(ta, row);
      foot.textContent = '';
      foot.appendChild(comp);
    } else {
      // NO composer element at all — the P0 exit condition.
      foot.textContent = '';
      const ro = el('div', 'chanwin-readonly');
      if (heldDraft) ro.dataset.channelDraftHeld = '1';   // the typed words are kept for the composer's return
      const why = (c.offers && c.offers.sendAsUser.why) || 'unknown';
      const a = r.adapter || null;
      if (why === 'send-scope-not-granted' && a && a.connectable) {
        // §25 (the owner's screenshot: a paragraph where one line belongs): the
        // account's sign-in lacks the send permission — ONE short sentence and
        // the fix RIGHT THERE (the account's own re-authorize dialog)
        ro.dataset.channelReadonly = 'reauth';
        ro.appendChild(el('span', '', t('Read-only — this account needs a re-authorization to reply')));
        const fix = btn(t('Re-authorize'), async () => {
          const d = await fetchJson('/api/channels');
          if (!d || d.error) { showToast(routeErrorText(d), { type: 'error' }); return; }
          const acct = (d.adapters || []).find((x) => x.id === a.id) || a;
          showReauthAccountDialog(app, acct, { kinds: d.kinds || [] });
        }, 'mounts-btn-primary');
        fix.dataset.channelReauth = a.id;
        ro.appendChild(fix);
        // the app-console step, ONLY where the account's adapter DECLARES one
        // (Lark: a scope the app itself lacks cannot be granted by a consent)
        // and only for the scopes this account does not hold
        const g = a.sendGrant;
        if (g && g.console && Array.isArray(g.missing) && g.missing.length) {
          const step = el('div', 'chanwin-readonly-step', t('First enable {scopes} in the {vendor} app and publish a version.', { scopes: g.missing.join(' + '), vendor: a.vendor ? t(a.vendor) : (a.label || a.kind) }));
          step.dataset.channelConsoleStep = '1';
          ro.appendChild(step);
        }
      } else {
        // P4: the reason in words, never a bare code
        ro.appendChild(el('span', '', t('Read-only here ({why})', { why: chanCaps.sendWhyText(why, { t }) })));
      }
      foot.appendChild(ro);
    }
    return c;
  }

  /** The beginning of the conversation, said once at the top. */
  function markStart(noOlderAtVendor) {
    if (list.querySelector('.chanwin-start')) return;
    const m = el('div', 'chanwin-start', noOlderAtVendor ? t('Beginning of what this channel keeps') : t('Beginning of the conversation'));
    list.insertBefore(m, list.firstChild);
  }
  /** Drop a day separator that repeats the one before it (a prepended page
   *  can end on the day the existing list began). */
  function dedupeDays() {
    let prev = null;
    for (const node of [...list.querySelectorAll('.chanmsg-day')]) {
      if (prev && prev.dataset.day === node.dataset.day) node.remove(); else prev = node;
    }
  }

  const base = `/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}`;
  /** Past the local log's start: nothing older here AND the vendor said so. */
  let historyExhausted = false;
  let olderInFlight = false;
  // ONE LIST, ONE WRITER (mirror-193, measured on a starved box; the .195 merge kept ONE mechanism): render() is
  // re-entered by the open, by every broadcast naming this conversation (the watch beat's fetch and the open's
  // mark-read each send one) and by a reconnect; each cleared the list and then awaited its page, so two renders in
  // flight BOTH appended — every message twice or three times. mirror-193 fixed it with a render GENERATION; lane
  // channel-render (built on the same base) with a SERIAL QUEUE (`serial` below: every list mutation — a render, a
  // patch, an upward page — runs one after another, so no two ever interleave). The queue is the one writer by
  // construction; mirror-193's other rule — the clear's own scroll event never asks for the page above the boundary
  // the clear reset — is `listReady` (false from the clear to the last row), read by PURE `pageUpVerdict`.
  async function loadPage({ prepend = false } = {}) {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (prepend && oldest !== null) {
      q.set('before', String(oldest));
      // BOTH halves of the boundary — the store orders by (at, vendorId).
      if (oldestId) q.set('beforeId', String(oldestId));
    }
    let r = await fetchJson(`${base}/messages?${q}`);
    if (!r || r.error) return 0;
    let recs = r.records || [];
    // HISTORY ON DEMAND (2026-09-26): the local log ran out while scrolling up
    // ⇒ ask the vendor for the page before it (prepended to the log server-side)
    if (prepend && !recs.length && !historyExhausted && !olderInFlight) {
      olderInFlight = true;
      const o = await fetchJson(`${base}/older`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ before: oldest, beforeId: oldestId, limit: PAGE }) });
      olderInFlight = false;
      if (o && !o.error) {
        recs = o.records || [];
        if (o.exhausted && !recs.length) { historyExhausted = true; markStart(o.vendorHasNoOlder); }
        // verify round 6: a REFUSAL (the server's per-conversation floor, the minute's budget) or a page that landed
        // NOTHING holds the window (PURE `holdUntilAfter`) — the reader is still at the top and every further event
        // would ask again; the refusal is said ONCE per hold, in plain words (the engine's sentence is the agent's)
        const h = holdUntilAfter({ now: Date.now(), refused: o.refused || null, retryAfterMs: o.retryAfterMs, retryAfterSec: o.retryAfterSec, landed: recs.length, exhausted: !!o.exhausted });
        if (h) { holdUntil = h; if (o.refused && !recs.length) showToast(t('Loading older messages is paused for a moment'), { type: 'warn' }); }   // (a refusal that still carries rows — a joiner's short page — shows the rows, not a pause)
      } else if (o && o.error) showToast(routeErrorText(o), { type: 'error' });
    }
    if (!recs.length) return 0;
    // The page arrives oldest-first in the SAME order the store pages by, so
    // its first element IS the boundary for the next page up.
    const head = recs[0];
    oldest = Number(head.at) || 0;
    oldestId = head.vendorId || null;
    list.insertBefore(rowsOf(recs, null), prepend ? list.firstChild : (outboxSec.isConnected ? outboxSec : null));
    dedupeDays();
    return recs.length;
  }
  /** Rows for records oldest-first; `prev` = the record the first one follows
   *  (its author run and day continue across the seam). */
  function rowsOf(recs, prev) {
    const frag = document.createDocumentFragment();
    for (const rec of recs) {
      if (rec && rec.vendorId) drawn.add(rec.vendorId);
      if (!prev || dayKey(prev.at) !== dayKey(rec.at)) frag.appendChild(daySeparator(rec.at));
      const cont = !!prev && dayKey(prev.at) === dayKey(rec.at) && authorKey(prev) === authorKey(rec) && (Number(rec.at) - Number(prev.at)) < GROUP_MS && !(rec.raw && rec.raw.synthetic) && !(prev.raw && prev.raw.synthetic) && !isSysRow(prev) && !isSysRow(rec);
      frag.appendChild(renderRecord(rec, { cont, base, folds }));
      prev = rec;
    }
    return frag;
  }
  /** The newest drawn row as a record-shaped seam for the next append. */
  function tailSeam() {
    const rows = list.querySelectorAll('.chanmsg');
    const last = rows.length ? rows[rows.length - 1] : null;
    return last ? { at: Number(last.dataset.at) || 0, vendorId: last.dataset.vid || '', author: { id: last.dataset.author || '' }, raw: {}, sys: last.classList.contains('chanmsg-sysrow') } : null;
  }
  /** ONE QUEUE for every list mutation (§25): a first render, a broadcast's
   *  patch, a reconnect's re-read and an upward page run one after another —
   *  two interleaved renders both cleared the list and both appended their
   *  page (every row twice: the open's own watch beat broadcasts while the
   *  first render is still loading). */
  let queue = Promise.resolve();
  const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  function patch() { return serial(patchNow); }
  /** A REBUILD THAT IS ONLY WAITING IN THE QUEUE IS ONE REBUILD (verify round 2, 2026-09-27): a rebuild asked
   *  while another still waits joins it — three reconnects behind a page in flight emptied and redrew the list
   *  three times. One that already STARTED is not joined (what it read may be older than the asker's reason). */
  let queuedRender = null;
  function render(opts) {
    if (queuedRender) return queuedRender;
    const run = serial(() => { queuedRender = null; return renderNow(opts); });
    queuedRender = run;
    return run;
  }
  /** THE LIST IS READY = no rebuild is in flight (master's mirror-193 name for the same fact). A rebuild's own
   *  clear drops scrollTop to 0 and the browser dispatches a scroll event for it: NOBODY SCROLLED. Unguarded,
   *  that event read the page above the boundary — and on a room shorter than a page it fell through to
   *  `POST …/older`: a metered vendor request a repaint caused, which also marked the beginning reached, so the
   *  person's own scroll to the top never asked again. */
  let listReady = false;
  /**
   * A BROADCAST NAMING THIS CONVERSATION (§25 — keyed rows patched in place):
   * the bar repaints; the newest page is read and only the records not yet
   * drawn are APPENDED below the last one. Rows already on screen are never
   * rebuilt, so an opened quote stays open and the reader is never yanked;
   * the list sticks to the bottom only when it was there. A record that lands
   * BETWEEN drawn ones (a vendor's late delivery) is the one case that
   * redraws the page — the scroll position kept.
   */
  async function patchNow() {
    const c = await renderBar();
    if (!c) return;
    if (!drawn.size) return renderNow();
    const r = await fetchJson(`${base}/messages?${new URLSearchParams({ limit: String(PAGE) })}`);
    if (!r || r.error) return;
    const fresh = (r.records || []).filter((x) => x && x.vendorId && !drawn.has(x.vendorId));
    if (!fresh.length) return;
    const seam = tailSeam();
    const after = (x) => !seam || Number(x.at) > seam.at || (Number(x.at) === seam.at && String(x.vendorId) > seam.vendorId);
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (!fresh.every(after)) {
      const top = list.scrollTop;
      await renderNow({ keepScroll: stick ? null : top });
      return;
    }
    list.querySelector('.chanwin-empty')?.remove();
    list.insertBefore(rowsOf(fresh, seam), outboxSec.isConnected ? outboxSec : null);
    dedupeDays();
    if (stick) list.scrollTop = list.scrollHeight;
  }

  /**
   * MARKING READ IS A USER ACTION, NOT A REPAINT SIDE EFFECT (r2).
   *
   * This POST used to live at the end of `render()`, which the broadcast
   * handler calls — so the engine's own notify re-rendered the window, the
   * render POSTed /read, the POST notified, and the cycle ran at ~490
   * requests a second for ever with the user touching nothing, rewriting
   * `readAt` ~500 times a second and destroying the very mark it set.
   * It is called when the window OPENS and when it is FOCUSED, both of which
   * are things the user did.
   */
  let readInFlight = false;
  function markRead() {
    if (readInFlight) return;
    readInFlight = true;
    fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .catch(() => {}).finally(() => { readInFlight = false; });
  }

  // P3: this conversation's proposals, rendered INLINE from the same store
  // the Outbox window reads (§9.2). Re-read on `channel-outbox-updated`.
  const outboxSec = el('div', 'chanwin-outbox-slot');
  async function renderOutbox() {
    const r = await fetchJson(`/api/channels/outbox?conv=${encodeURIComponent(`${adapterId}/${convId}`)}`);
    if (!r || r.error) { outboxSec.textContent = ''; return; }
    // KEYED (2026-09-27): the section the last render drew is patched in place
    const prev = outboxSec.firstElementChild;
    const sec = renderInlineProposals(app, r.proposals || [], prev);
    if (!sec) { outboxSec.textContent = ''; return; }
    if (sec !== prev) outboxSec.replaceChildren(sec);
  }

  async function renderNow({ read = false, keepScroll = null } = {}) {
    const c = await renderBar();
    if (!c) return;
    listReady = false;   // from the clear to the last row: a scroll event in between is the rebuild's own
    try {
      list.textContent = '';
      drawn.clear();
      oldest = null; oldestId = null;
      historyExhausted = false;
      const n = await loadPage({});
      if (!n) list.appendChild(el('div', 'chanwin-empty', t('No messages yet.')));
      list.appendChild(outboxSec);
      await renderOutbox();
      list.scrollTop = keepScroll === null ? list.scrollHeight : keepScroll;
    } finally { listReady = true; }
    if (read && c.unread) markRead();
  }

  // Paging upward: one page per top-scroll, oldest-first (the same shape the
  // panel and the chat view use — a window never loads a 90-day log whole).
  //
  // A SCROLL EVENT IS DISPLACEMENT; THE PERSON'S INPUT IS INTENT (verify round 3, 2026-09-27 — the chat view's
  // 2.307.0 rule). Round 2's `listReady` knows the rebuild's own clear; a MAXIMIZE whose pane outgrows the
  // content (any resize: the sidebar, a rotation, another client's layout sync), a fold of a quote, a day
  // pill's dedupe and a refused picture shrinking to a chip all CLAMP scrollTop to 0 and the browser dispatches
  // the same event — reproduced: a maximize read `?before=` and POSTed `/older`, a metered vendor request from a
  // window button. So the page is asked of PURE `pageUpVerdict`: a scroll event pages only with the person's
  // positioning input on record (a wheel, a touch move, a keyboard scroll, a held press on the scrollbar
  // gutter — never a press on a row: the fold toggle's own click is the clamp this guards); a wheel up / a
  // finger pulled down while ALREADY at the top asks directly (a room that fits its pane fires no scroll event
  // at all — it had no way to ask for older history before). `historyExhausted` refuses a wheel held at the top
  // from becoming a local fetch per event.
  let prepending = false;   // one upward page queued at a time (a scroll at the top fires many events)
  // THE INPUT ON RECORD IS TOWARD OLDER AND REMEMBERS THE ROOM IT SAW (verify round 4): round 3 recorded every
  // wheel, and a wheel DOWN at the bottom + a maximize 200 ms later paged — and POSTed /older — on the maximize's
  // own clamp. Only a wheel up, a finger moving DOWN, an up key and a gutter press are input; each records the
  // room (scrollHeight − clientHeight) it saw, and a scroll event on a SMALLER room is a clamp (the browser clamps
  // scrollTop only when the room shrinks; a scroll, a prepend and an append never shrink it) — refused by name.
  let inputAt = 0, roomAtInput = null, gutterDrag = false, touchY = null, touchPrevY = null;
  // verify round 6: quiet until this instant after a page that landed nothing or a refusal (PURE `holdUntilAfter`)
  let holdUntil = 0;
  const roomOf = () => list.scrollHeight - list.clientHeight;
  const noteInput = () => { inputAt = Date.now(); roomAtInput = roomOf(); };
  const facts = (cause) => ({ cause, scrollTop: list.scrollTop, prepending, listReady, historyExhausted, inputAt, now: Date.now(), gutterDrag, room: roomOf(), roomAtInput, holdUntil });
  // verify round 6: THE SCROLLERS BETWEEN AN EVENT'S TARGET AND THE LIST (a code block over its max-height, an edit box)
  // — one that can still scroll UP owns a wheel up / a finger down / an up key made inside it (the browser scrolls IT,
  // not the list); at its top the input chains to the list and is the list's (PURE `nestedScrollTop`)
  const innerScrollTop = (target) => {
    const boxes = [];
    for (let el = target; el && el !== list && el.nodeType === 1; el = el.parentElement) boxes.push({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
    return nestedScrollTop(boxes);
  };
  function pageUp(cause) {
    if (!pageUpVerdict(facts(cause)).page) return;
    prepending = true;
    // the height is read INSIDE the queued job (the list may have grown — a patch's append — between this
    // event and the job's turn), so the reader's row stays where it was whatever ran in between
    serial(async () => { const before = list.scrollHeight; const n = await loadPage({ prepend: true }); if (n) list.scrollTop = list.scrollHeight - before; }).catch(() => {}).finally(() => { prepending = false; });
  }
  // a wheel is input toward older only as a PLAIN vertical wheel up (round 6: Ctrl = the browser's zoom / a pinch,
  // Shift = a horizontal scroll — neither moves the list, both POSTed /older at the top) made on the list itself, not
  // inside a nested scroller that can still scroll up (a code block over 360 px: 4/4 POSTs on a fitting room)
  list.addEventListener('wheel', (e) => { if (wheelTowardOlder({ deltaY: e.deltaY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, innerScrollTop: innerScrollTop(e.target) })) { noteInput(); pageUp('wheel'); } }, { passive: true });
  list.addEventListener('touchstart', (e) => { touchY = touchPrevY = e.touches && e.touches[0] ? e.touches[0].clientY : null; }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : null;
    if (innerScrollTop(e.target) > 0) { touchPrevY = y; return; }   // round 6: the finger is scrolling a nested scroller (a code block), not the list
    if (y !== null && touchPrevY !== null && y > touchPrevY) noteInput();   // the finger moving DOWN = toward older
    touchPrevY = y;
    if (touchY !== null && y !== null && y - touchY >= PULL_PX) { touchY = y; pageUp('pull'); }
  }, { passive: true });
  // an up key: on record for the scroll it makes; at the top already (no scroll event can come) it asks directly —
  // unless it was TYPED in a text field inside the list (verify round 5: the inline proposal card's Reject reason
  // box / Edit textarea; a caret key there bubbled here and, on a room that fits its pane, POSTed /older) or pressed
  // with the focus in a nested scroller that can still scroll up (round 6: a focused code block — Chrome focuses an
  // overflow:auto element — ArrowUp / PageUp there scroll the block and POSTed /older)
  list.addEventListener('keydown', (e) => { if (isUpKey(e.key) && !isTypingTarget({ tagName: e.target && e.target.tagName, type: e.target && e.target.type, editable: !!(e.target && e.target.isContentEditable) }) && !(innerScrollTop(e.target) > 0)) { noteInput(); pageUp('key'); } });
  list.addEventListener('pointerdown', (e) => {
    const r = list.getBoundingClientRect();
    if (isGutterPress({ clientX: e.clientX, left: r.left, clientWidth: list.clientWidth })) { gutterDrag = true; noteInput(); }
  }, { passive: true });
  // the press ends wherever the pointer is released (a gutter drag routinely leaves the list) — bound to the
  // window's controller like every other document-level listener here
  const endDrag = () => { if (gutterDrag) { gutterDrag = false; noteInput(); } };
  window.addEventListener('pointerup', endDrag, { signal: winInfo._listenerCtl?.signal });
  window.addEventListener('pointercancel', endDrag, { signal: winInfo._listenerCtl?.signal });
  /** The reader is at the newest (the last scroll event's fact; a fresh window is) — a resize keeps them there. */
  let tail = true;
  list.addEventListener('scroll', () => { tail = atTail(list); pageUp('scroll'); });
  // A RESIZE KEEPS THE READER AT THE NEWEST (round 3): a maximize that lets the content fit clamps the offset to
  // 0, and the un-maximize after it left the reader at the OLDEST row of the page (the browser has nothing to
  // restore); a phone's keyboard shrinking the pane is the same. The list's own box is observed; the re-tail is
  // a scroll SET, which the verdict above never pages on.
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { if (tail && listReady && list.clientHeight > 0) list.scrollTop = list.scrollHeight; });
    ro.observe(list);
    winInfo._listenerCtl?.signal.addEventListener('abort', () => ro.disconnect());
  }

  // Multi-client: the engine broadcasts ONE recomputed digest per pass, and a
  // window re-reads its own tail when its id is named (§10.4). It never marks
  // read from here — see markRead().
  //
  // THE HANDLER IS HELD IN A NAMED CONST AND REMOVED BY NAME (r2). `off?.()`
  // on the result of `onGlobal` was a silent no-op for as long as that method
  // returned undefined, so a CLOSED window kept re-rendering, kept fetching
  // and kept POSTing /read over the user's mark — plus its whole detached DOM
  // subtree.
  //
  // THE LOAD-BEARING HALF IS `onGlobal` RETURNING ITS OWN UNSUBSCRIBE (src/lib/ws.js)
  // — MEASURED: with that restored and this spelled `off?.()` again the e2e
  // leg is ALL PASS, so this form is a BELT, not a second protection. It is
  // here because a teardown that silently depends on a return value nobody
  // asserts is exactly how the class came back the first time; the contract
  // itself is pinned by test-channels-e2e ⑧, which goes red on that layer
  // alone.
  const onBroadcast = (msg) => {
    if (msg.type === 'channel-outbox-updated') {
      // the proposal store changed: re-read ONLY this conversation's cards
      // (the digest broadcast that follows repaints the bar)
      if (msg.outbox && Array.isArray(msg.outbox.proposals) && !msg.outbox.proposals.some((p) => p.adapterId === adapterId && p.convId === convId) && !outboxSec.firstChild) return;
      renderOutbox().catch(() => {});
      return;
    }
    if (msg.type !== 'channels-updated') return;
    // 2026-09-26: a PARTIAL broadcast names its rows by KEY — a pass that
    // changed nothing (or changed other conversations) repaints nothing here;
    // a WHOLE digest (an account-level change) repaints every window
    const key = `${adapterId}/${convId}`;
    if (msg.partial) { if (!Array.isArray(msg.changedKeys) || !msg.changedKeys.includes(key)) return; }
    else if (Array.isArray(msg.changed) && msg.changed.length && !msg.changed.includes(convId)) return;
    // §25: an in-place PATCH (new rows appended, drawn rows untouched), never a rebuild
    patch().catch(() => {});
  };
  app.ws.onGlobal(onBroadcast);
  // a broadcast naming THIS conversation sent while the socket was down never
  // arrives (lane R2 verify r3): re-read the tail on every reconnect
  const onState = (up) => { if (up && lastConv) render().catch(() => {}); };
  app.ws.onStateChange?.(onState);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { app.ws.offGlobal(onBroadcast); } catch {} try { app.ws.offStateChange?.(onState); } catch {} });

  // Touching the window is a USER action, so it may mark read; a repaint may
  // not. Bounded by construction: once the mark lands the next digest says
  // `unread: 0` and every later click is a no-op.
  winInfo.element?.addEventListener('pointerdown', () => {
    if (lastConv && lastConv.unread) markRead();
  }, { signal: winInfo._listenerCtl?.signal });

  // THE WATCH HEARTBEAT (2026-09-26, design §6.2 "hot = open in a window"):
  // one beat now (a stale conversation is fetched at once) and one a minute
  // while the window lives; the server lets a beat lapse after 90 s.
  const beat = () => fetchJson(`${base}/watch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  beat();
  const beatTimer = setInterval(beat, 60e3);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => clearInterval(beatTimer));

  render({ read: true }).catch((e) => showToast(String(e && e.message ? e.message : e), { type: 'error' }));
  return winInfo;
}

// ── THE AGENT-GROUP WINDOW (design §22.5, chunk g3) ───────────────────────
// The same window type and openSpec (`{action:'openChannel', adapterId:
// GROUP_ADAPTER_ID, convId:<groupId>}`), so layout restore, sync, tabs and
// the taskbar work unchanged. What differs is the OBJECT: a group's log is
// read from `/api/channel-groups/:id/messages`, its system records (create /
// invite / leave / kick / rename / archive) are worded HERE by kind with the
// device's `t` (the record's own `text` is the agent-facing English), and the
// composer SENDS DIRECTLY AS YOU — no proposal, no outbox: the owner's own
// words go out at once (§22.2 ①), @<member> wakes that member (a billed turn
// through the spend authorizer on the server; the toast says the count), and
// a preview under the box says who THIS text would wake before the click.
// Every name, message and invite context is agent-controlled ⇒ textContent.

/** A system record in the device's words; the agent-facing `text` is the fallback. */
function groupSysText(rec, nameOf) {
  const raw = rec.raw || {};
  const by = nameOf(raw.by || (rec.author && rec.author.id));
  const member = raw.member ? nameOf(raw.member) : '';
  switch (raw.kind) {
    case 'create': return t('{by} created the group', { by });
    case 'invite': return t('{by} added {member}', { by, member });
    case 'leave': return raw.archived ? t('{member} left — the group is archived', { member }) : t('{member} left', { member });
    case 'kick': return raw.archived ? t('{by} removed {member} — the group is archived', { by, member }) : t('{by} removed {member}', { by, member });
    case 'rename': return raw.from ? t('{by} renamed the group (was "{from}")', { by, from: raw.from }) : t('{by} renamed the group', { by });
    case 'archive': return t('{by} archived the group — the log is kept', { by });
    default: return rec.text || '';
  }
}

function openGroupWindow(app, winInfo, groupId, { bar, list, foot }) {
  let group = null;
  let oldest = null;
  const seen = new Set();   // vendorIds already drawn — a broadcast's record may be one we appended from the send answer
  const nameOf = (id) => {
    if (id === OWNER) return t('You');
    const m = group && (group.members || []).find((x) => x.member === id);
    return (m && m.name) || String(id || '').slice(0, 8) || t('unknown');
  };

  function renderGroupRecord(rec, { cont = false } = {}) {
    const raw = rec.raw || {};
    if (raw.kind && raw.kind !== 'message') {
      const row = el('div', 'chanmsg chanmsg-sys');
      row.dataset.at = String(rec.at || 0);
      row.dataset.vid = rec.vendorId || '';
      row.appendChild(el('div', 'chanmsg-sys-line', `${groupSysText(rec, nameOf)} · ${stamp(rec.at)}`));
      if (raw.kind === 'invite' && raw.context) row.appendChild(el('div', 'chanmsg-ctx', raw.context));
      return row;
    }
    const self = !!(rec.author && (rec.author.isSelf || rec.author.id === OWNER));
    const row = el('div', 'chanmsg' + (cont ? ' chanmsg-cont' : '') + (self ? ' chanmsg-self' : ' chanmsg-agent'));
    row.dataset.at = String(rec.at || 0);
    row.dataset.author = authorKey(rec);
    row.dataset.vid = rec.vendorId || '';
    const who = self ? t('You') : nameOf(rec.author && rec.author.id) || (rec.author && rec.author.name) || t('unknown');
    if (!cont) {
      // THE LOOK (channel-polish): the same author circle the channel window draws (the owner in the accent)
      row.appendChild(avatar({ name: who, key: authorKey(rec), self }, null, 'chanmsg-av'));
      const head = el('div', 'chanmsg-head');
      head.append(el('b', '', who), el('span', 'chanmsg-at', stamp(rec.at)));
      row.appendChild(head);
    } else {
      const when = el('span', 'chanmsg-at chanmsg-at-hover', stamp(rec.at));
      when.title = fullStamp(rec.at);
      row.appendChild(when);
    }
    row.appendChild(el('div', 'chanmsg-body', rec.text || ''));
    return row;
  }

  /** Append records (oldest-first) at the bottom or prepend a page at the top. */
  function place(recs, { prepend = false } = {}) {
    const fresh = recs.filter((r) => r && !seen.has(r.vendorId));
    if (!fresh.length) return 0;
    for (const r of fresh) seen.add(r.vendorId);
    const frag = document.createDocumentFragment();
    let prev = null;
    if (!prepend) { const tail = [...list.querySelectorAll('.chanmsg')].pop(); if (tail) prev = { at: Number(tail.dataset.at), author: { id: tail.dataset.author }, raw: { kind: tail.classList.contains('chanmsg-sys') ? 'sys' : 'message' } }; }
    for (const rec of fresh) {
      if (!prev || dayKey(prev.at) !== dayKey(rec.at)) frag.appendChild(daySeparator(rec.at));
      const isMsg = !(rec.raw && rec.raw.kind && rec.raw.kind !== 'message');
      const prevMsg = prev && !(prev.raw && prev.raw.kind && prev.raw.kind !== 'message');
      const cont = isMsg && prevMsg && dayKey(prev.at) === dayKey(rec.at) && authorKey(prev) === authorKey(rec) && (Number(rec.at) - Number(prev.at)) < GROUP_MS;
      frag.appendChild(renderGroupRecord(rec, { cont }));
      prev = rec;
    }
    list.querySelector('.chanwin-empty')?.remove();
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (prepend) list.insertBefore(frag, list.firstChild); else list.appendChild(frag);
    dedupeDaysIn(list);
    if (!prepend && stick) list.scrollTop = list.scrollHeight;
    return fresh.length;
  }

  async function loadPage({ prepend = false } = {}) {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (prepend && oldest !== null) q.set('before', String(oldest));
    const r = await fetchJson(`/api/channel-groups/${encodeURIComponent(groupId)}/messages?${q}`);
    if (!r || r.error) return { error: r || {} };
    if (r.group) group = r.group;
    const recs = r.records || [];
    if (recs.length) oldest = Number(recs[0].at) || 0;
    return { n: place(recs, { prepend }) };
  }

  function drawBar() {
    bar.textContent = '';
    app.wm.setTitle(winInfo.id, group.name || groupId);
    bar.appendChild(avatar({ name: group.name || groupId, key: `${GROUP_ADAPTER_ID}/${groupId}`, glyph: 'users' }, null, 'chanwin-av'));
    const headCol = el('div', 'chanwin-head');
    bar.appendChild(headCol);
    const titleRow = el('div', 'chanwin-title-row');
    titleRow.appendChild(el('b', '', group.name || groupId));
    const chipB = document.createElement('button');
    chipB.type = 'button';
    chipB.className = 'chan-members-chip';
    chipB.dataset.groupMembers = '1';
    chipB.appendChild(icon('users', 11));
    chipB.appendChild(el('span', '', t('{n} members', { n: (group.members || []).length })));
    chipB.title = t('Members & notifications…');
    chipB.onclick = () => showGroupDetail(app, group);
    titleRow.appendChild(chipB);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'icon-btn';
    more.title = t('More actions');
    more.appendChild(icon('more', 13));
    more.onclick = (ev) => {
      ev.stopPropagation();
      const rr = more.getBoundingClientRect();
      const items = [{ label: t('Members & notifications…'), action: () => showGroupDetail(app, group) }];
      if (!group.archivedAt) {
        if (!(group.pair && group.pair.length)) items.push({ label: t('Invite…'), action: () => showGroupMembersDialog(app, { group }) });
        items.push({ separator: true }, { label: t('Rename…'), action: () => renameGroup(group) }, { label: t('Archive'), action: () => archiveGroup(group) });
      }
      showContextMenu(rr.left, rr.bottom + 2, items);
    };
    titleRow.appendChild(more);
    headCol.appendChild(titleRow);
    const names = (group.members || []).map((m) => m.name || String(m.member).slice(0, 8));
    const kind = group.pair && group.pair.length ? t('Direct conversation') : t('Agent group');
    const meta = el('div', 'chanwin-meta', [kind, t('You (observer)'), ...names].join(' · ') + (group.archivedAt ? ' · ' + t('Archived') : ''));
    meta.title = t('You see every message; each agent is woken only by its own notify mode or an @mention.');
    headCol.appendChild(meta);
  }

  function drawFoot() {
    foot.textContent = '';
    const mode = composerMode({ group });
    if (mode.mode === 'archived') {
      const ro = el('div', 'chanwin-readonly');
      ro.appendChild(el('span', '', t('Archived — the log is kept, nothing new can be posted.')));
      foot.appendChild(ro);
      return;
    }
    const comp = el('div', 'chanwin-composer chan-group-composer');
    comp.dataset.groupComposer = '1';
    const ta = document.createElement('textarea');
    ta.placeholder = t('Message the group as You — @name wakes that agent');
    ta.rows = 2;
    const pop = el('div', 'chan-mention-pop');
    pop.style.display = 'none';
    const row = el('div', 'chanwin-composer-row');
    const note = el('div', 'chanwin-note', '');
    const sendBtn = btn(t('Send'), null, 'mounts-btn-primary');
    sendBtn.dataset.groupSend = '1';
    sendBtn.prepend(icon('send', 11));
    row.append(note, sendBtn);
    comp.append(pop, ta, row);
    foot.appendChild(comp);
    // the preview: who THIS text would wake — said before the click
    const preview = () => {
      const w = wakePreview(group, ta.value);
      note.classList.toggle('chan-warn', w.length > 0);
      note.textContent = w.length
        ? t('Will wake {names} — {n} billed turn(s)', { names: w.map((x) => x.name).join(', '), n: w.length })
        : t('Sent as You. Members on "next turn" read it in their next report — nobody is woken.');
    };
    // the @-autocomplete over the member list
    let q = null, cands = [], sel = 0;
    const closePop = () => { pop.style.display = 'none'; q = null; cands = []; };
    const drawPop = () => {
      pop.textContent = '';
      if (!q || !cands.length) { pop.style.display = 'none'; return; }
      cands.forEach((c, i) => {
        const it = el('div', 'chan-mention-item' + (i === sel ? ' chan-mention-on' : ''), c.name);
        it.dataset.member = c.member;
        it.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(i); });
        pop.appendChild(it);
      });
      pop.style.display = '';
    };
    const pick = (i) => {
      const c = cands[i];
      if (!c || !q) return;
      const r = insertMention(ta.value, q, c.name);
      ta.value = r.text;
      ta.setSelectionRange(r.caret, r.caret);
      closePop();
      preview();
      ta.focus();
    };
    const update = () => {
      q = mentionQuery(ta.value, ta.selectionStart);
      cands = q ? mentionCandidates(group.members || [], q.query) : [];
      sel = 0;
      drawPop();
      preview();
    };
    ta.addEventListener('input', update);
    ta.addEventListener('click', update);
    ta.addEventListener('blur', () => setTimeout(closePop, 120));
    ta.addEventListener('keydown', (e) => {
      if (pop.style.display !== 'none' && cands.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % cands.length; drawPop(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + cands.length) % cands.length; drawPop(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(sel); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendBtn.click(); }
    });
    sendBtn.onclick = async () => {
      const text = ta.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      // the count the preview SAID travels with the send (r2): the server refuses
      // `wake-count-mismatch` if the act would wake a different number
      const r = await fetchJson(`/api/channel-groups/${encodeURIComponent(groupId)}/post`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, expectWakes: wakePreview(group, text).length }) });
      sendBtn.disabled = false;
      if (!r || r.error) {
        // r3: a `wake-count-mismatch` CARRIES the view the server counted
        // against (live names — a member renamed since this window drew them):
        // repaint from it, so the preview, the @-autocomplete and the next
        // click count against the same names the server does
        if (r && r.code === 'wake-count-mismatch' && r.group && r.group.id === groupId) { group = { ...group, ...r.group }; drawBar(); preview(); }
        showToast(groupErrorText(r), { type: 'error' });
        return;
      }
      ta.value = '';
      preview();
      // the send answers with its record — drawn NOW, never waiting for the broadcast echo
      if (r.message) place([r.message]);
      if (r.group) { group = { ...group, ...r.group }; }
      showToast(`${t('Sent')} — ${wakeEchoText(r)}`);
    };
    preview();
  }

  let readInFlight = false;
  function markRead() {
    if (readInFlight) return;
    readInFlight = true;
    fetchJson(`/api/channel-groups/${encodeURIComponent(groupId)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .catch(() => {}).finally(() => { readInFlight = false; });
  }

  async function render() {
    list.textContent = '';
    seen.clear(); oldest = null;
    const r = await loadPage({});
    if (r.error || !group) {
      bar.textContent = '';
      bar.appendChild(el('div', 'chanwin-err', groupErrorText(r.error && r.error.code ? r.error : { code: 'not-found' })));
      foot.textContent = '';
      return;
    }
    if (!r.n) list.appendChild(el('div', 'chanwin-empty', t('No messages yet.')));
    drawBar();
    drawFoot();
    list.scrollTop = list.scrollHeight;
    markRead();   // opening the window is a USER act
  }

  list.addEventListener('scroll', () => {
    if (list.scrollTop > 4 || oldest === null) return;
    const before = list.scrollHeight;
    loadPage({ prepend: true }).then((x) => { if (x && x.n) list.scrollTop = list.scrollHeight - before; }).catch(() => {});
  });

  // THE BROADCAST CARRIES BOTH HALVES: the recomputed list (the bar repaints
  // from its entry) and the new records (appended, deduplicated by vendorId —
  // the send answer may have drawn one already). No full re-render per event.
  const onBroadcast = (msg) => {
    if (msg.type !== 'channel-groups-updated' || !group) return;
    const g = Array.isArray(msg.groups) ? msg.groups.find((x) => x.id === groupId) : null;
    const wasArchived = !!group.archivedAt;
    if (g) { group = g; drawBar(); }
    if (Array.isArray(msg.messages)) place(msg.messages.filter((m) => m && m.convId === groupId));
    if (g && !!g.archivedAt !== wasArchived) drawFoot();
  };
  app.ws.onGlobal(onBroadcast);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { app.ws.offGlobal(onBroadcast); } catch {} });
  winInfo.element?.addEventListener('pointerdown', () => { if (group && group.unread) markRead(); }, { signal: winInfo._listenerCtl?.signal });
  render().catch((e) => showToast(String(e && e.message ? e.message : e), { type: 'error' }));
  return winInfo;
}

/** Drop a day separator that repeats the one before it. */
function dedupeDaysIn(list) {
  let prev = null;
  for (const node of [...list.querySelectorAll('.chanmsg-day')]) {
    if (prev && prev.dataset.day === node.dataset.day) node.remove(); else prev = node;
  }
}

registerWindowType({
  type: 'channel', label: t('Channel'), icon: ICON,
  action: 'openChannel',
  replay: (app, spec, { syncId } = {}) => app.openChannel(spec.adapterId, spec.convId, { syncId }),
});
