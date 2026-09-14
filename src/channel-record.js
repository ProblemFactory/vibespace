'use strict';
/**
 * THE ONE normalized message record (docs/design-communication-panel.zh.md §4).
 *
 * PURE — imports NOTHING. Every adapter produces this shape and nothing
 * downstream (store, filter, panel, agent injection) ever sees a vendor
 * payload again. The shape is fixed here so that "what a message is" cannot
 * become a per-adapter fact:
 *
 *   { id, convId, adapterId, vendorId, at,
 *     author:      { id, name, isSelf, isBot },
 *     text,                        // ALWAYS plain text — the only thing v1 renders
 *     mentions:    [{ id, name }], // RESOLVED names, never raw @_user_N placeholders
 *     attachments: [{ id, name, bytes, mime }],
 *     replyTo, threadKey,
 *     raw:         { bounded, adapter-specific, NEVER rendered } }
 *
 * THREE RULES THIS FILE EXISTS TO ENFORCE, each one somebody's incident:
 *
 * 1. `vendorId` IS THE DEDUP KEY (design §5 invariant 2). A replayed page —
 *    which Lark's anchor semantics guarantee at a boundary, and which a Gmail
 *    history replay produces too — must be a NO-OP, never a duplicate row.
 *    When an adapter scrapes a SCREEN and the client exposes no stable id it
 *    must DECLARE a synthetic key (`raw.synthetic: true`): the invariant wants
 *    A key, not a vendor-issued one — but an UNDECLARED synthetic key turns
 *    every re-scan into a batch of duplicates, so a record may not carry a
 *    non-boolean `raw.synthetic`, and a record with no `vendorId` at all is
 *    refused rather than given one here.
 *
 * 2. `@_user_N` PLACEHOLDERS ARE PER-MESSAGE ORDINALS, NOT IDENTITIES. Lark's
 *    payload numbers the mentions inside ONE message; resolving them against
 *    anything but that message's own `mentions` array attributes a message to
 *    the wrong person — which has already happened in an ops tool. The
 *    resolution is the ADAPTER's job and this module gives it the one
 *    implementation; an ordinal with no mention behind it is left VERBATIM,
 *    because inventing a name for it is that same mis-attribution.
 *
 * 3. AN EXTERNAL BODY MAY NOT CARRY OUR OWN FRAME SYNTAX (fence 5 / design
 *    §7.5). Every peer-controlled string reaches an agent prompt eventually,
 *    and the injection frames this product speaks (`<system-reminder>`,
 *    `<vibespace-*>`, `<task-notification>`, `<persisted-output>`,
 *    `<local-command-stdout>`, `<command-name>`, `<command-args>`) are plain
 *    text markers — a stranger who types one into a Lark group would otherwise
 *    be writing into the agent's instruction channel. `inertFrames()` NEUTERS
 *    them (`<system-reminder>` becomes `[system-reminder]`): the sender's
 *    words survive verbatim and the frame does not. It runs at NORMALIZATION,
 *    not at injection, because the record is the one shape every consumer
 *    reads and a guard applied at one consumer is a guard the next consumer
 *    does not get.
 *
 *    AND IT RUNS OVER *EVERY* PEER-CONTROLLED STRING THE RECORD CARRIES (r2),
 *    not just `text`. It used to run on `text` alone, so `author.name`,
 *    `mentions[].name` and `attachments[].name` — all peer-controlled, all
 *    part of the same record — came out of `makeRecord` with LIVE frames,
 *    which made the claim above false at source. The design's own §7.5 agent
 *    block renders `from <author>`, so the author name is squarely on the path
 *    this rule exists for, and `makeConversation` was already doing it for
 *    `title` and `participants` — the omission was an oversight, not a
 *    decision. `peerText()` is the ONE door every such field goes through.
 *
 *    The `vibespace-*` half is a NAMESPACE (a stripper that enumerates is a
 *    stripper that misses the fourteenth); the rest is a fixed list, and
 *    `test-channel-record`'s FRAME CENSUS derives every hyphenated tag name
 *    the tree writes and fails on one that is neither covered here nor
 *    classified as prose. `<channel source="…">` is deliberately NOT listed:
 *    `channel` is an ordinary English word with no hyphen, so neutering it
 *    would mangle a stranger's code paste — and unlike the names above, we
 *    never inject it (the CLI composes it from its own socket).
 */

/** Every field a ChannelRecord carries, in its declared order. */
const RECORD_FIELDS = ['id', 'convId', 'adapterId', 'vendorId', 'at', 'author', 'text', 'mentions', 'attachments', 'replyTo', 'threadKey', 'raw'];

/** Bounds. A vendor body is peer-controlled and is synced to every client. */
const MAX_TEXT = 64 * 1024;
const MAX_MENTIONS = 256;
const MAX_ATTACHMENTS = 64;
const MAX_RAW_BYTES = 8 * 1024;

/**
 * OUR OWN frame markers (rule 3) — the `vibespace-*` NAMESPACE plus the fixed
 * names the harness injection paths speak, measured from the tree and pinned
 * by `test-channel-record`'s frame census.
 *
 * ATTRIBUTES ARE MATCHED TOO (r2): the old pattern required `<name>` exactly,
 * so `<system-reminder x>` walked straight through a rule whose entire job is
 * to stop a stranger from spelling one of these.
 */
const FRAME_TAGS = ['system-reminder', 'persisted-output', 'task-notification',
  'local-command-stdout', 'command-name', 'command-message', 'command-args'];
const FRAME_TAG_RE = new RegExp(`<\\/?\\s*(${FRAME_TAGS.join('|')}|vibespace-[a-z0-9-]+)(\\s[^<>]*)?\\s*>`, 'gi');

/** `<system-reminder>` becomes `[system-reminder]`. The words stay; the frame goes. */
function inertFrames(text) {
  if (typeof text !== 'string' || !text) return '';
  return text.replace(FRAME_TAG_RE, (m, name) => '[' + String(name).trim() + ']');
}

/** Does this text still carry a LIVE frame marker? (the suite's own predicate,
 *  so "inert" is checked by the same rule that produces it) */
function carriesFrame(text) {
  if (typeof text !== 'string') return false;
  return new RegExp(FRAME_TAG_RE.source, 'i').test(text);
}

const str = (v, max) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  return max && s.length > max ? s.slice(0, max) : s;
};

/** THE ONE DOOR for a peer-controlled string: bounded AND frame-inert (rule
 *  3). Every field a vendor or a stranger fills goes through this, not `str`. */
const peerText = (v, max) => inertFrames(str(v, max));

/**
 * Resolve `@_user_N` placeholders against THIS message's own mentions array.
 * `mentions` is positional: `@_user_1` is mentions[0]. An index with no
 * mention behind it is left VERBATIM (rule 2).
 */
function resolveMentions(text, mentions) {
  if (typeof text !== 'string' || !text) return '';
  const list = Array.isArray(mentions) ? mentions : [];
  return text.replace(/@_user_(\d+)/g, (whole, n) => {
    const m = list[Number(n) - 1];
    const name = m && typeof m === 'object' ? str(m.name, 200) : '';
    return name ? '@' + name : whole;
  });
}

/** The key separator, spelled as an ESCAPE. A literal NUL byte here would
 *  make this module invisible to grep / file(1) / ripgrep and to every source
 *  census in the tree — byte-identical at runtime, unreadable to every text
 *  tool the team owns. NUL is the right separator (no vendor id can contain
 *  one, so the identity is never ambiguous); writing it raw is the defect. */
const SEP = '\u0000';

/** THE dedup identity of a record (design §5 invariant 2). */
function recordKey(r) {
  return [str(r && r.adapterId), str(r && r.convId), str(r && r.vendorId)].join(SEP);
}

/** Was this record's key MINTED by an adapter rather than issued by the vendor? */
function isSynthetic(r) { return !!(r && r.raw && r.raw.synthetic === true); }

function boundRaw(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  let json;
  try { json = JSON.stringify(raw); } catch { return { truncated: true }; }
  if (json === undefined) return {};
  if (json.length > MAX_RAW_BYTES) return { truncated: true, synthetic: raw.synthetic === true };
  return JSON.parse(json);
}

/**
 * Build ONE normalized record. THROWS (never returns a half-record) when the
 * adapter broke the shape — a typed record nobody validated is a vendor
 * payload with better manners.
 *
 * `opts.resolveMentions` (default true) runs rule 2 over `text`; an adapter
 * that already resolved them passes false.
 */
function makeRecord(input, opts = {}) {
  const r = input && typeof input === 'object' ? input : {};
  const adapterId = str(r.adapterId, 128);
  const convId = str(r.convId, 256);
  const vendorId = str(r.vendorId, 512);
  if (!adapterId) throw new Error('channel-record: adapterId is required');
  if (!convId) throw new Error('channel-record: convId is required');
  if (!vendorId) throw new Error('channel-record: vendorId is required (it is the dedup key — a scraped source DECLARES a synthetic one)');
  const at = Number(r.at);
  if (!Number.isFinite(at) || at <= 0) throw new Error(`channel-record: at must be an epoch ms (got ${JSON.stringify(r.at)})`);

  // EVERY one of these is peer-controlled and every one reaches an agent
  // prompt (§7.5 renders `from <author>`), so every one takes rule 3.
  const a = r.author && typeof r.author === 'object' ? r.author : {};
  const author = { id: peerText(a.id, 256), name: peerText(a.name, 200), isSelf: !!a.isSelf, isBot: !!a.isBot };

  const mentions = (Array.isArray(r.mentions) ? r.mentions : []).slice(0, MAX_MENTIONS)
    .map((m) => ({ id: peerText(m && m.id, 256), name: peerText(m && m.name, 200) }));
  const attachments = (Array.isArray(r.attachments) ? r.attachments : []).slice(0, MAX_ATTACHMENTS)
    .map((x) => ({ id: peerText(x && x.id, 256), name: peerText(x && x.name, 256), bytes: Number.isFinite(Number(x && x.bytes)) ? Number(x.bytes) : null, mime: peerText(x && x.mime, 128) }));

  // `text` resolves its ordinals FIRST (rule 2) and is neutered after, so a
  // mention name cannot smuggle a frame in through the substitution either.
  let text = str(r.text, MAX_TEXT);
  if (opts.resolveMentions !== false) text = resolveMentions(text, mentions);
  text = inertFrames(text);

  const raw = boundRaw(r.raw);
  if ('synthetic' in raw && typeof raw.synthetic !== 'boolean') throw new Error('channel-record: raw.synthetic must be a boolean (declare a minted key, or omit it)');

  return {
    id: str(r.id, 256) || `${adapterId}:${convId}:${vendorId}`,
    convId, adapterId, vendorId, at,
    author, text, mentions, attachments,
    replyTo: str(r.replyTo, 512) || null,
    threadKey: str(r.threadKey, 512) || null,
    raw,
  };
}

/** The conversation shape `listConversations()` returns (design §4). Its title
 *  is peer-controlled too, so it takes rule 3 as well. */
function makeConversation(input) {
  const c = input && typeof input === 'object' ? input : {};
  const id = str(c.id, 256);
  if (!id) throw new Error('channel-conversation: id is required');
  return {
    id,
    vendorId: str(c.vendorId, 512) || id,
    title: peerText(c.title, 300),
    kind: ['dm', 'group', 'thread'].includes(c.kind) ? c.kind : 'group',
    participants: peerText(c.participants, 300),
    lastAt: Number.isFinite(Number(c.lastAt)) ? Number(c.lastAt) : null,
  };
}

module.exports = {
  RECORD_FIELDS, MAX_TEXT, MAX_RAW_BYTES, FRAME_TAG_RE, FRAME_TAGS,
  makeRecord, makeConversation, resolveMentions, inertFrames, peerText, carriesFrame, recordKey, isSynthetic,
};
