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
 *     attachments: [{ id, name, bytes, mime, placeholder? }],
 *     replyTo, threadKey,
 *     raw:         { bounded, adapter-specific, NEVER rendered },
 *     blocks?:     [ the TYPED render tree — OPTIONAL, see below ] }
 *
 * THE RENDER TREE (design §25, 2026-09-27 — the owner: "设计一个不同 connector
 * 的 raw message to HTML 的接口"): `blocks` is a CLOSED, typed tree an adapter
 * produces at ingest (src/channel-blocks.js holds the rungs) and ONE client
 * renderer turns into DOM with createElement/textContent — never HTML from an
 * adapter. Its SCHEMA lives HERE, beside the record it belongs to, because
 * this module imports nothing and the record's shape is fixed in one place:
 * `validateBlocks()` enforces the closed kind sets, the bounds, runs
 * `inertFrames` over EVERY string (link text, attribution, card lines,
 * mention names — rule 3 again) and demotes a link whose href is not
 * http(s):/mailto: to plain text. An invalid tree is REFUSED BY NAME (a
 * `code`), and the record simply carries no `blocks` — `text` stays the
 * agent-facing string on every path; blocks are for the eye only.
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
/** The OPTIONAL fields, after the declared ones, present only when set (§25). */
const OPTIONAL_FIELDS = ['blocks'];

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
// LINEAR (verify round 3, 2026-09-27): the tail used to be `(\s[^<>]*)?\s*>` — `[^<>]*` and `\s*` both eat a
// whitespace run, so `<system-reminder` + 64 KiB of spaces cost 1.7 s (quadratic: every split of the run tried
// before the `>` failed) — at INGEST and again at every READ of the page that holds it (the judge runs per page,
// per broadcast, in every client: a page of 50 such records was ~90 s on the event loop). `[^<>]*` already
// covers the whitespace, so the trailing `\s*` matched nothing the shorter form does not.
const FRAME_TAG_RE = new RegExp(`<\\/?\\s*(${FRAME_TAGS.join('|')}|vibespace-[a-z0-9-]+)(\\s[^<>]*)?>`, 'gi');

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

/** ONE LINE of a text that is neutered LINE BY LINE and joined again (lane
 *  channel-withdraw verify r3, 2026-09-27: the receipt's line DIFF). A frame
 *  opener left DANGLING at the end of a line — `<system-reminder` with no `>`
 *  on its line — is inert alone, but the `>` of a LATER line completes it once
 *  the lines are joined: FRAME_TAG_RE's attribute run `\s[^<>]*` crosses a
 *  newline, so a tag split over two lines of one text, or assembled from the
 *  `-` line of one text and the `+` line of another, was a LIVE frame by this
 *  module's own predicate. The complete tags go first (`inertFrames`), then a
 *  dangling opener loses its `<` (`[system-reminder`): no line can leave an
 *  opener behind, so no join can complete one. */
const FRAME_OPEN_RE = new RegExp(`<(\\/?\\s*(?:${FRAME_TAGS.join('|')}|vibespace-[a-z0-9-]+))(?=(?:\\s[^<>]*)?$)`, 'gi');
function inertFrameLine(line) {
  if (typeof line !== 'string' || !line) return '';
  return inertFrames(line).replace(FRAME_OPEN_RE, (m, name) => '[' + name);
}

const str = (v, max) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  return max && s.length > max ? s.slice(0, max) : s;
};

/** THE ONE DOOR for a peer-controlled string: bounded AND frame-inert (rule
 *  3). Every field a vendor or a stranger fills goes through this, not `str`. */
const peerText = (v, max) => inertFrames(str(v, max));

// ── THE BLOCK SCHEMA (design §25) ─────────────────────────────────────────
/** Block kinds — CLOSED. p = a paragraph of inline runs; quote / sig = foldable
 *  (their own inner blocks); banner = one dim system line from the sender's
 *  tool ("Please reply above this line"); code = preformatted text; img / file
 *  = an attachment BY ID (the bytes only ever through our route); card = a
 *  vendor card (title + lines); sys = a system record's sentence. */
const BLOCK_KINDS = Object.freeze(['p', 'quote', 'sig', 'banner', 'code', 'img', 'file', 'card', 'sys']);
/** Inline run kinds — CLOSED. t = text, a = a link {href, text}, at = a
 *  mention {id, name}, code = inline code, b = bold. */
const RUN_KINDS = Object.freeze(['t', 'a', 'at', 'code', 'b']);
/** What a `sys` block is ABOUT — a closed vocabulary the client words in the
 *  device's language (the block's own `text` is the fallback). */
const SYS_WHATS = Object.freeze(['system', 'sticker', 'share-chat', 'share-user', 'forward', 'deleted', 'location', 'call', 'calendar', 'todo', 'card', 'unknown']);
/** The bounds: a tree is peer-derived and syncs to every client. `text` is
 *  the sum of every visible string (hrefs are bounded one by one). */
const BLOCK_LIMITS = Object.freeze({ blocks: 400, text: 64 * 1024, depth: 6, runs: 4000, cardLines: 60, href: 2048 });
/** The ONLY schemes a link may carry. Anything else is plain text. */
const LINK_SCHEMES = Object.freeze(['http:', 'https:', 'mailto:']);

/**
 * A link target, or null. Accepted ONLY when it parses as a URL whose scheme
 * is http(s): (with a host, no user:password@ — the "trusted.com@evil.com"
 * shape) or mailto: (ONE address and nothing else). `javascript:`, `data:`,
 * `vbscript:`, `file:`, a relative path, a control character — all null, so
 * the caller keeps the words as TEXT. Runs in the adapter AND again at render
 * time.
 *
 * A MAILTO IS AN ADDRESS, NOT A COMPOSE FORM (verify round, 2026-09-27): RFC
 * 6068 hfields (`?bcc=…&body=…`) are percent-DECODED by the mail client, so
 * `mailto:you@x?bcc=evil%40y` passed the old "one @" regex and opened a
 * compose window with a hidden recipient. The only accepted form is
 * `mailto:<local>@<host>` with the e-mail rung's own alphabet — no `?`, no
 * `#`, no percent-escapes.
 */
const MAILTO_RE = /^mailto:[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}$/i;
function safeHref(href) {
  if (typeof href !== 'string') return null;
  const s = href.trim();
  if (!s || s.length > BLOCK_LIMITS.href) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(s)) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!LINK_SCHEMES.includes(u.protocol)) return null;
  if (u.protocol === 'mailto:') return MAILTO_RE.test(s) ? s : null;
  if (!u.hostname || u.username || u.password) return null;
  return u.href;
}

/**
 * VALIDATE (and clean) a block tree. Answers `{ok:true, blocks}` — a NEW tree
 * holding only the declared fields, every string through `inertFrames`, every
 * unsafe link demoted to a text run — or `{ok:false, code, error}` naming the
 * rule broken: `not-an-array`, `unknown-kind`, `unknown-run`, `bad-field`,
 * `too-many-blocks`, `too-many-runs`, `too-deep`, `too-much-text`.
 */
function validateBlocks(blocks) {
  if (!Array.isArray(blocks)) return { ok: false, code: 'not-an-array', error: 'blocks must be an array' };
  let nBlocks = 0, nRuns = 0, text = 0;
  const refuse = (code, error) => { const e = new Error(error); e.code = code; throw e; };
  const s = (v, what) => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') refuse('bad-field', `${what} must be a string`);
    text += v.length;
    if (text > BLOCK_LIMITS.text) refuse('too-much-text', `the tree's text passes ${BLOCK_LIMITS.text} characters`);
    return inertFrames(v);
  };
  const runs = (list) => {
    if (!Array.isArray(list)) refuse('bad-field', 'p.runs must be an array');
    const out = [];
    for (const r of list) {
      if (++nRuns > BLOCK_LIMITS.runs) refuse('too-many-runs', `more than ${BLOCK_LIMITS.runs} inline runs`);
      if (!r || typeof r !== 'object' || !RUN_KINDS.includes(r.k)) refuse('unknown-run', `unknown inline run ${JSON.stringify(r && r.k)}`);
      if (r.k === 'a') {
        const txt = s(r.text, 'a.text');
        const href = safeHref(r.href);
        // a label-less link SHOWS its href, so the href is the text it counts (verify round 3: 4 000 empty-label
        // links × 2 048-char hrefs passed the 64 KiB text bound as 0 characters — a 16 MB tree per record)
        if (href && !txt) s(href, 'a.href');
        // A link whose target is not http(s)/mailto is WORDS, never a link.
        out.push(href ? { k: 'a', href, text: txt || href } : { k: 't', text: txt || s(typeof r.href === 'string' ? r.href : '', 'a.href') });
      } else if (r.k === 'at') out.push({ k: 'at', id: s(r.id, 'at.id').slice(0, 256), name: s(r.name, 'at.name').slice(0, 200) });
      else out.push({ k: r.k, text: s(r.text, `${r.k}.text`) });
    }
    return out;
  };
  const walk = (list, depth) => {
    if (depth > BLOCK_LIMITS.depth) refuse('too-deep', `blocks nest deeper than ${BLOCK_LIMITS.depth}`);
    if (!Array.isArray(list)) refuse('bad-field', 'inner blocks must be an array');
    const out = [];
    for (const b of list) {
      if (++nBlocks > BLOCK_LIMITS.blocks) refuse('too-many-blocks', `more than ${BLOCK_LIMITS.blocks} blocks`);
      if (!b || typeof b !== 'object' || !BLOCK_KINDS.includes(b.k)) refuse('unknown-kind', `unknown block kind ${JSON.stringify(b && b.k)}`);
      switch (b.k) {
        case 'p': out.push({ k: 'p', runs: runs(b.runs) }); break;
        case 'quote': case 'sig': {
          const o = { k: b.k, blocks: walk(b.blocks, depth + 1), lines: Math.max(0, Math.min(1e6, Math.floor(Number(b.lines) || 0))) };
          if (b.k === 'quote' && b.attribution) o.attribution = s(b.attribution, 'quote.attribution').slice(0, 400);
          if (b.k === 'quote' && b.forwarded === true) o.forwarded = true;
          out.push(o); break;
        }
        case 'banner': out.push({ k: 'banner', text: s(b.text, 'banner.text').slice(0, 400) }); break;
        case 'code': { const o = { k: 'code', text: s(b.text, 'code.text') }; if (b.lang) o.lang = s(b.lang, 'code.lang').slice(0, 40); out.push(o); break; }
        case 'img': case 'file': {
          if (typeof b.attachmentId !== 'string' || !b.attachmentId) refuse('bad-field', `${b.k}.attachmentId is required`);
          out.push({ k: b.k, attachmentId: s(b.attachmentId, `${b.k}.attachmentId`).slice(0, 256) }); break;
        }
        case 'card': {
          const lines = Array.isArray(b.lines) ? b.lines : [];
          if (lines.length > BLOCK_LIMITS.cardLines) refuse('bad-field', `a card carries at most ${BLOCK_LIMITS.cardLines} lines`);
          out.push({ k: 'card', title: s(b.title, 'card.title').slice(0, 400), lines: lines.map((x) => s(x, 'card.line')) }); break;
        }
        case 'sys': { const o = { k: 'sys', text: s(b.text, 'sys.text').slice(0, 2000) }; if (b.what) { if (!SYS_WHATS.includes(b.what)) refuse('bad-field', `unknown sys.what ${JSON.stringify(b.what)}`); o.what = b.what; } out.push(o); break; }
        default: refuse('unknown-kind', `unknown block kind ${JSON.stringify(b.k)}`);
      }
    }
    return out;
  };
  try { return { ok: true, blocks: walk(blocks, 1) }; } catch (e) { return { ok: false, code: e.code || 'bad-field', error: String(e.message || e) }; }
}

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
    .map((x) => {
      const out = { id: peerText(x && x.id, 256), name: peerText(x && x.name, 256), bytes: Number.isFinite(Number(x && x.bytes)) ? Number(x.bytes) : null, mime: peerText(x && x.mime, 128) };
      // R3 (2026-09-26): the token the adapter wrote into `text` FOR this
      // attachment (Lark's "[image]") — the window drops one occurrence once
      // the picture is drawn; `text` itself never changes. Present only when
      // the adapter declared one (every older record keeps the 4-field shape).
      const ph = peerText(x && x.placeholder, 32);
      if (ph) out.placeholder = ph;
      return out;
    });

  // `text` resolves its ordinals FIRST (rule 2) and is neutered after, so a
  // mention name cannot smuggle a frame in through the substitution either.
  let text = str(r.text, MAX_TEXT);
  if (opts.resolveMentions !== false) text = resolveMentions(text, mentions);
  text = inertFrames(text);

  const raw = boundRaw(r.raw);
  if ('synthetic' in raw && typeof raw.synthetic !== 'boolean') throw new Error('channel-record: raw.synthetic must be a boolean (declare a minted key, or omit it)');

  const out = {
    id: str(r.id, 256) || `${adapterId}:${convId}:${vendorId}`,
    convId, adapterId, vendorId, at,
    author, text, mentions, attachments,
    replyTo: str(r.replyTo, 512) || null,
    threadKey: str(r.threadKey, 512) || null,
    raw,
  };
  // THE RENDER TREE (§25) — optional, validated here; an invalid one is left
  // off (the refusal's code is the rungs' suite's business) and the record
  // renders through the generic rung from `text` like any older record.
  if (r.blocks !== undefined && r.blocks !== null) {
    const v = validateBlocks(r.blocks);
    if (v.ok && v.blocks.length) out.blocks = v.blocks;
  }
  return out;
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
  RECORD_FIELDS, OPTIONAL_FIELDS, MAX_TEXT, MAX_RAW_BYTES, FRAME_TAG_RE, FRAME_TAGS,
  BLOCK_KINDS, RUN_KINDS, SYS_WHATS, BLOCK_LIMITS, LINK_SCHEMES,
  makeRecord, makeConversation, resolveMentions, inertFrames, inertFrameLine, peerText, carriesFrame, recordKey, isSynthetic,
  safeHref, validateBlocks,
};
