'use strict';
/**
 * A CHANNEL CONVERSATION AS THE HUMAN SEES IT (B-c127; the owner, 2026-10-02, a chat card that read "VibeSpace ·
 * Channels · Lark / 飞书 — oc_e53d5350615a2d77bbfdf83d6075decb: 1 message — matched: keyword "inc-""). PURE (imports
 * only src/hidden-chars.js; CJS so the channels engine, the touches store, the three normalizers, the codex wrapper's marker and the
 * bundle's renderers share ONE spelling).
 *
 * THE NAME LADDER (the owner's ruling, 2026-10-03): ① the conversation's own name — a chat's title, a mail's subject —
 * said beside its account; ② any other description the server holds — a single chat's other party (the engine's
 * `dmTitleOf`), the description / participants the vendor listed, the authors seen in it (`describeOf`); ③ the
 * internal id (oc_…, a Gmail thread id) ONLY when nothing else is known. The agent-facing text keeps the id where a
 * CLI needs it (`vibespace-channels reply <id>`); what the human reads takes the ladder.
 *
 * THE REF   `{adapterId, convId, name, account, vendor}` — what a chat card carries (`peerChannel`) so its name opens
 *           the conversation with ONE click through the ONE door (`app.openChannel`). A card rebuilt from the
 *           transcript (or drawn from a drained stash) carries no ref: `wakeFacts` reads the agent-facing block back —
 *           its head names the account and the conversation, its reply hint the id; `adapterId` is null there and the
 *           click resolves it from the panel's own list.
 *
 * Gate: scripts/test-channel-names.mjs (§1 is the census of every human-visible surface).
 */
const ID_MAX = 300;
const NAME_MAX = 200;
const LABEL_MAX = 80;
const DESC_MAX = 120;
const CTRL_RE = /[\u0000-\u001F\u007F]/g;
// verify r1 F5: THE set of characters not drawn as what they are (src/hidden-chars.js) leaves a name — an all-invisible
// title (invisible operators, tag characters: the name door keeps them) is no name, and the ladder goes on
const { HIDDEN_RE } = require('./hidden-chars.js');
const JOINERS = new Set(['\u200c', '\u200d']);
const HAS_CTRL = /[\u0000-\u001F\u007F]/;
function oneLine(v, max) {
  const s = String(v == null ? '' : v).replace(CTRL_RE, ' ').replace(HIDDEN_RE, (c) => (JOINERS.has(c) ? c : '')).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** ② — what describes a conversation with no name of its own: the description / participants the vendor listed, else
 *  up to three authors seen in it (`selfId` left out). '' when nothing does. */
function describeOf(en, { selfId = null } = {}) {
  if (!en || typeof en !== 'object') return '';
  const p = oneLine(en.participants, DESC_MAX);
  if (p) return p;
  const names = [];
  for (const a of Array.isArray(en.authors) ? en.authors : []) {
    if (!a || !a.name || (selfId && a.id === selfId)) continue;
    const n = oneLine(a.name, 60);
    if (n && !names.includes(n)) names.push(n);
  }
  if (!names.length) return '';
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
}

/** THE LADDER: the first rung that says something (① then ②), else the id (③). */
function nameOf(rungs, id) {
  for (const r of Array.isArray(rungs) ? rungs : [rungs]) { const s = oneLine(r, NAME_MAX); if (s) return s; }
  return oneLine(id, NAME_MAX);
}

const idOf = (v) => (typeof v === 'string' && v && v.length <= ID_MAX && !HAS_CTRL.test(v) ? v : null);
/** A card's ref, sanitized — `{adapterId, convId, name, account, vendor}` or null (never markup: the renderer writes
 *  every string as text). `adapterId` null = a rebuilt card (the click resolves it). */
function refOf(x) {
  if (!x || typeof x !== 'object') return null;
  const convId = idOf(x.convId);
  if (!convId) return null;
  return {
    adapterId: idOf(x.adapterId),
    convId,
    name: nameOf([x.name], convId),
    account: oneLine(x.account, LABEL_MAX) || null,
    vendor: oneLine(x.vendor, 40) || null,
  };
}

/** The card text's leading name (`<name>: 1 message …`) split off, so the renderer draws the name as the link and the
 *  rest as words — null when the text does not open with it. */
function splitLead(text, name) {
  const s = String(text == null ? '' : text);
  const n = String(name || '');
  if (!n || !s.startsWith(n)) return null;
  const rest = s.slice(n.length);
  return rest === '' || /^[:\s—-]/.test(rest) ? { lead: n, rest } : null;
}

// The agent-facing blocks the channels engine writes (src/channel-filter.js renderWakeBlock / renderDigestBlock /
// renderScopeDigestBlock, src/channel-policy.js renderReceiptBlock) — read back for a card that carries no ref.
const WAKE_HEAD_RE = /^#{3} Channel (message|digest) — (.+?) · (.+)$/;
const RECEIPT_HEAD_RE = /^Channel receipt — (.+?) · (.*)$/;
const REPLY_RE = /^Reply with: vibespace-channels reply (\S+) /;
/** A notice body that IS one of those blocks → `{title: {text}, body, ref}` (the card's head words, the agent's words
 *  under the expander, the conversation it names — `ref` null when the block names no ONE conversation: a scope
 *  digest, a receipt), else null. */
function wakeFacts(body) {
  const s = String(body == null ? '' : body);
  const lines = s.split('\n');
  const first = (lines[0] || '').trim();
  const r = RECEIPT_HEAD_RE.exec(first);
  if (r) {
    const account = oneLine(r[1], LABEL_MAX);
    const name = oneLine(r[2], NAME_MAX);
    return { title: { text: name ? `Channels · ${account} — ${name}` : `Channels · ${account}` }, body: s, ref: null };
  }
  const m = WAKE_HEAD_RE.exec(first);
  if (!m) return null;
  const account = oneLine(m[2], LABEL_MAX);
  const ids = [...new Set(lines.map((l) => REPLY_RE.exec(l.trim())).filter(Boolean).map((x) => x[1]))];
  let name = m[3].replace(/ \(you are watching (?:the whole account|by a rule: .*)\)$/, '');
  if (m[1] === 'digest') name = name.replace(/ — \d+ messages? in the last \d+ min$/, '');
  const ref = ids.length === 1 && !/^\d+ conversations?, /.test(name) ? refOf({ adapterId: null, convId: ids[0], name, account }) : null;
  return { title: { text: `Channels · ${account}` }, body: s, ref };
}

module.exports = { ID_MAX, NAME_MAX, LABEL_MAX, describeOf, nameOf, refOf, splitLead, wakeFacts };
