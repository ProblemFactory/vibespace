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
 *     author:      { id, name, isSelf, isBot, alt?, external? },   // alt / external: lane lark-threads (src/channel-authors.js)
 *     text,                        // ALWAYS plain text — the only thing v1 renders
 *     mentions:    [{ id, name }], // RESOLVED names, never raw @_user_N placeholders
 *                                  // + `pos` [[start, end]…] — an agent group's places of each @ in text (B-ff04)
 *     attachments: [{ id, name, bytes, mime, placeholder?, cid?, role? }],
 *     replyTo, threadKey,          // the record's PLACE: what it answers, which thread it is in
 *     raw:         { bounded, adapter-specific, NEVER rendered },
 *     blocks?:     [ the TYPED render tree — OPTIONAL, see below ],
 *     root?:       the thread's ROOT message id when the vendor names one (2026-09-28),
 *     facts?:      [{k, v, more?, cut?}] — the message's own per-message facts (B-f066, see below) }
 *
 * Reactions and a vendor's thread stats are NOT on this line: they are facts
 * about a message that change after it was written, so they live in the
 * conversation's append-only SIDE log and are folded at read time — their
 * schema (`validateReactions`, `validateSide`, `sideKey`) and bounds are here,
 * the fold in src/channel-reactions.js, the thread arithmetic in
 * src/channel-thread.js (lane channel-threads).
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
 * A MESSAGE'S FACTS (lane message-facts, B-f066 — design 007: "gmail thread 展示的时候缺乏细节（收件人，cc，reply-to）…
 * 不同 provider 可能针对消息都有类似的独特机制，怎么制定统一方案处理"): `facts` is a CLOSED, typed list beside `blocks` —
 * the envelope (To / Cc / Reply-To …) and each provider's own per-message facts, from ONE declared vocabulary. Its SCHEMA
 * lives here: `FACT_TYPES` (seven value types — the only thing the renderer and the agent's printer know), `FACT_SCHEMA`
 * (each kind's type and, for a `level`, its own closed words) and `validateFacts()` (the bounds, every string through the
 * name door). The words, the fold and the summary are src/channel-facts.js. An invalid fact is dropped BY NAME and the
 * record survives; a record without facts is byte-identical to one stored before them. A fact learned LATER is a side
 * record (`fx`, below). Unlike `blocks`, facts reach the agent — through the engine's belt door `agentFacts`.
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
/** The OPTIONAL fields, after the declared ones, present only when set (§25;
 *  `root` since lane channel-threads, 2026-09-28 — the ROOT MESSAGE of the
 *  record's thread / reply chain when the vendor names one and it is not this
 *  record). A record stored before either field existed carries neither, and
 *  every reader treats absence as "not said". */
const OPTIONAL_FIELDS = ['blocks', 'root', 'facts', 'kind', 'systemKind'];   // + `facts` (lane message-facts, B-f066); + `kind` / `systemKind` (lane lark-system-records)

/** Bounds. A vendor body is peer-controlled and is synced to every client. */
const MAX_TEXT = 64 * 1024;
const MAX_MENTIONS = 256;
/** design 012 D21: WHO a mention names — a person (the default, no field), a BROADCAST (`@here` / `@channel` /
 *  `@everyone`) or a GROUP (a user group) — stored with its own id, which never equals a person's, so a broadcast or
 *  a group never reads as "mentions me". CLOSED. */
const MENTION_KINDS = Object.freeze(['person', 'broadcast', 'group']);
/** lane lark-system-records (owner's DM 2026-10-08: a Lark recall notice with no sender reached an agent "from unknown"):
 *  a VENDOR SYSTEM NOTICE — Lark `msg_type: system` (a recall, a join, a rename), Slack's `channel_join` & co. — is the
 *  vendor talking ABOUT the chat, never a message from anybody. Such a record says so: `kind: 'system'`, an author with
 *  no id and no name (`isSystem: true` — never self, never a bot), `systemKind` one of SYSTEM_KINDS (CLOSED; the client
 *  words an empty notice by it), `text` the vendor's own words ('' when it gave none — never a blank). No rule matches it
 *  (src/channel-filter.js), it is never unread (src/channel-focus.js `systemRead`), the window draws one dim line. A
 *  record without `kind` is a message (every record stored before). */
const RECORD_KINDS = Object.freeze(['system']);
const SYSTEM_KINDS = Object.freeze(['recall', 'join', 'leave', 'rename', 'other']);
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
  'local-command-stdout', 'command-name', 'command-message', 'command-args',
  'cross-session-message' /* apps-joint r1 F7: the CLI's own peer-message envelope — a vendor's .desktop Name spelled it to an agent */];
// LINEAR (verify round 3, 2026-09-27): the tail used to be `(\s[^<>]*)?\s*>` — `[^<>]*` and `\s*` both eat a
// whitespace run, so `<system-reminder` + 64 KiB of spaces cost 1.7 s (quadratic: every split of the run tried
// before the `>` failed) — at INGEST and again at every READ of the page that holds it (the judge runs per page,
// per broadcast, in every client: a page of 50 such records was ~90 s on the event loop). `[^<>]*` already
// covers the whitespace, so the trailing `\s*` matched nothing the shorter form does not.
//
// THE FOLDER (lane lark-search-poll verify r3 — r2's frame-inert TEXT gap): the characters a frame match LOOKS THROUGH.
// A tag split by a character nobody sees — an invisible one (zero-width space / joiner / non-joiner, word joiner, BOM,
// soft hyphen, a variation selector, a tag character, a filler: every Default_Ignorable_Code_Point, which holds the
// bidi embeddings / overrides / isolates / marks too), a control (a NUL, an ESC, a C1 control) or a line / paragraph
// separator — is a LIVE tag to any reader that drops or ignores it. So a run of them may sit between any two characters
// of a tag (and around its `<`, `/` and before its `>`), and the neutered name carries none of them. The ASCII
// whitespace controls (tab, LF, VT, FF, CR) stay whitespace. ONE folder for names and text: `peerName` removes its
// display set and then takes `peerText` — this same check. Only a MATCHED tag changes: a body keeps its own bidi,
// joiners and layout everywhere else. After a name the run may not also be whitespace (U+FEFF, U+2028, U+2029 are
// both): the attribute run's `\s` takes those, so no two quantifiers share a character (linear — the lesson above).
const FRAME_FOLD = '\\p{Default_Ignorable_Code_Point}\\x00-\\x08\\x0E-\\x1F\\x7F-\\x9F\\u{2028}\\u{2029}';
const FOLD = `[${FRAME_FOLD}]`;
const FOLD_G = new RegExp(FOLD, 'gu');
const lookThrough = (name) => [...name].join(`${FOLD}*`);
const FRAME_NAMES = `${FRAME_TAGS.map(lookThrough).join('|')}|${lookThrough('vibespace-')}${FOLD}*[a-z0-9-](?:${FOLD}*[a-z0-9-])*`;
const FRAME_HEAD = `<(?:${FOLD}*\\/)?[\\s${FRAME_FOLD}]*`;
const FRAME_TAIL = `(?:(?!\\s)${FOLD})*`;
const FRAME_TAG_RE = new RegExp(`${FRAME_HEAD}(${FRAME_NAMES})${FRAME_TAIL}(\\s[^<>]*)?>`, 'giu');
// THE FIXED POINT (lane belt-nested-opener, B-2103 — lane lark-unknown-tags' finding, 2026-10-09). ONE pass judged every
// tag against the ORIGINAL text: of `<system-reminder <system-reminder>>` it inerted the inner tag, and the outer opener
// (whose attribute run the inner `<` had stopped) was RE-ASSEMBLED by the pass itself: `<system-reminder
// [system-reminder]>` is live by this module's own predicate, at every door. Each pass peels ONE level of nesting, so the
// fold repeats until the text stops changing. It is BOUNDED at 4 passes so the walk stays linear: ≤ 4 walks of a text
// whose bound came first, never a loop a crafted input can stretch. No one's own text nests our frame names, and 4 levels
// is the Lark fence's own bound from before it took this function. A nest deeper than that is a forgery: it is WITHHELD
// whole, as a said placeholder, and never passed through live. ONE function, three callers: inertFrames here, the Lark
// fence's `‹…›` (src/channels/lark/blocks.js quoteTags) and the page-dialog copy (src/browser-stuck.js, pinned equal).
const FRAME_PASSES = 4;
const FRAME_LIVE_RE = new RegExp(FRAME_TAG_RE.source, 'iu');
const FRAME_WITHHELD = '[peer text withheld: a nested frame could not be inerted]';
function foldFrames(t, fold) {
  for (let i = 0; i < FRAME_PASSES; i++) {
    const n = t.replace(FRAME_TAG_RE, fold);
    if (n === t) return t;   // (a match always changes: it starts with `<`, a fold never does)
    t = n;
  }
  return FRAME_LIVE_RE.test(t) ? FRAME_WITHHELD : t;
}

/** `<system-reminder>` becomes `[system-reminder]`. The words stay; the frame goes — to the fixed point above. */
function inertFrames(text) {
  if (typeof text !== 'string' || !text) return '';
  return foldFrames(text, (m, name) => '[' + String(name).replace(FOLD_G, '').trim() + ']');
}

/** Does this text still carry a LIVE frame marker? (the suite's own predicate,
 *  so "inert" is checked by the same rule that produces it) */
function carriesFrame(text) {
  if (typeof text !== 'string') return false;
  return new RegExp(FRAME_TAG_RE.source, 'iu').test(text);
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
const FRAME_OPEN_RE = new RegExp(`<(${FRAME_HEAD.slice(1)}(?:${FRAME_NAMES}))(?=${FRAME_TAIL}(?:\\s|$))`, 'iuy');
/** THE DANGLING OPENERS of ONE line whose complete tags are already inert — judged RIGHT TO LEFT (lane peer-census verify r6
 *  F1): one `replace` from the left judged every opener's lookahead against the ORIGINAL line, so of `x <system-reminder
 *  </system-reminder` only the second (dangling) opener was neutered and the first was LEFT dangling behind it —
 *  `<system-reminder [/system-reminder` — for the next line's `>` (a quote mark, a list bullet) to complete, by this
 *  module's own predicate, at every door (the belt's line and block forms, a name, a label, a page's words). An opener can
 *  only dangle AFTER the line's last `>` (before it, that `>` or the `<` of a later tag ends the run a join could
 *  continue; a complete tag is inert already), so the walk starts at the last `<` and moves left: each opener is judged
 *  with every opener after it ALREADY neutered, and the first `<` that is no opener blocks every one before it (its run
 *  can never reach a later `>`). One sticky match per `<`, the edits applied in one pass: linear. Idempotent. */
function inertOpeners(t) {
  const g = t.lastIndexOf('>');
  let i = t.lastIndexOf('<');
  if (i <= g) return t;
  const edits = [];
  for (; i > g; i = i > 0 ? t.lastIndexOf('<', i - 1) : -1) {   // (a negative fromIndex is read as 0: the walk ends at the line's first character)
    FRAME_OPEN_RE.lastIndex = i;
    const m = FRAME_OPEN_RE.exec(t);
    if (!m) break;
    edits.push([i, i + m[0].length, '[' + m[1].replace(FOLD_G, '')]);
  }
  if (!edits.length) return t;
  let out = '', at = 0;
  for (const [s, e, r] of edits.reverse()) { out += t.slice(at, s) + r; at = e; }
  return out + t.slice(at);
}
function inertFrameLine(line) {
  if (typeof line !== 'string' || !line) return '';
  return inertOpeners(inertFrames(line));
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
 * THE ONE DOOR FOR A NAME (lane lark-search-poll verify r2, item 3 — it was the channel registry's `peerName`, written
 * by verify r1 for a described single chat's name alone). Every NAME or TITLE a vendor or a stranger chose — an author's
 * display name, a mention, an attachment's file name, a conversation's title and its participants, a reactor, a
 * reaction's label — reaches the agent's list / read answers and every surface the owner reads, so it takes rule 3
 * AND the display hygiene a name needs: bound first; bidi overrides / embeddings / isolates and the invisible characters
 * (zero-width space, word joiner, BOM, soft hyphen) REMOVED — an RLO reverses the words drawn after it
 * (`invoice\u202Efdp.exe` reads as a PDF), an all-invisible name reads as nobody — BEFORE the frame check (an invisible
 * character splitting a tag can never hide it from `peerText`); controls and line breaks folded to spaces (a terminal
 * escape, a NUL, a forged log line); `peerText`; whitespace collapsed, trimmed, bounded; nothing visible left ⇒ null.
 * ZWJ / ZWNJ (emoji sequences, Persian and Indic names) and the LRM / RLM marks stay. A number is a name too (a vendor
 * that sends one); anything else is none. Message TEXT never goes through here (a body keeps its own bidi and layout).
 */
const NAME_INVISIBLE_RE = /[\u202A-\u202E\u2066-\u2069\u200B\u2060\uFEFF\u00AD]/g;
const NAME_CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;
// THE LINE RULE TOO (lane peer-census verify r1, F2): a name is always ONE INLINE PIECE that a surface writes more
// after — the agent's read answer prints `attachment: <name> (mime), N bytes` and then the NEXT record's line, the list
// prints a title and then the next row, a wake block writes ` at <time>` ⏎ `> …` after an author. `peerText` neuters
// COMPLETE tags only, so an attachment named `report <system-reminder` reached the agent's tool result intact and the
// next record's `> quoted …` completed it (reproduced over the real engine). A dangling opener at a name's end loses
// its `<` here, AFTER the bound (the cut can leave one too), so no surface can complete one — the same rule every
// other inline piece takes through the belt (src/peer-text.js). Idempotent: judged at ingest and again on the way out.
function peerName(v, max) {
  const s0 = typeof v === 'string' ? v : (typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
  if (s0 === null) return null;
  const t = peerText(s0.slice(0, max * 4).replace(NAME_CONTROL_RE, ' ').replace(NAME_INVISIBLE_RE, ''), max * 4).replace(/\s+/g, ' ').trim();
  // verify r3 F7 (lane peer-census): the bound never splits a surrogate pair — a lone surrogate at the cut is a name the
  // CLI's stdout re-encodes as U+FFFD (the name the agent sees is not the name the store holds)
  const s = inertFrameLine(peerText(t.slice(0, nameCutAt(t, max)).trim()));
  // lane lark-threads verify r2 (⑥): a name with NO visible character is no name — the joiners (U+200C / U+200D) are kept
  // for the words that need them, so a name of joiners alone used to pass every belt as a non-empty INVISIBLE string
  // (a blank author head, a blank alias, a blank nickname instead of the id)
  if (!/[^\u200c\u200d\s]/.test(s)) return null;
  return s || null;
}
/** the largest cut ≤ n that does not split a surrogate pair (src/peer-text.js cutText's rule; this module imports nothing) */
const nameCutAt = (s, n) => (n > 0 && /[\uD800-\uDBFF]/.test(s.charAt(n - 1)) ? n - 1 : n);

// ── THE BLOCK SCHEMA (design §25) ─────────────────────────────────────────
/** Block kinds — CLOSED. p = a paragraph of inline runs; quote / sig = foldable
 *  (their own inner blocks); banner = one dim system line from the sender's
 *  tool ("Please reply above this line"); code = preformatted text; img / file
 *  = an attachment BY ID (the bytes only ever through our route); card = a
 *  vendor card (title + lines); sys = a system record's sentence. */
const BLOCK_KINDS = Object.freeze(['p', 'quote', 'sig', 'banner', 'code', 'img', 'file', 'card', 'sys', 'hr']);
/** Inline run kinds — CLOSED. t = text, a = a link {href, text}, at = a
 *  mention {id, name}, code = inline code, b = bold, i = italic (lane
 *  channel-rich, 2026-09-28: a Lark `<i>` / `*x*` / an italic post style is a
 *  run, never the literal markup). `hr` (above) is a rule between blocks — a
 *  Lark card's / post's `hr`. A `card` may carry inner `blocks` (its elements
 *  as paragraphs, notes and rules) beside the older `lines`. */
const RUN_KINDS = Object.freeze(['t', 'a', 'at', 'code', 'b', 'i']);
/** What an attachment IS to the message (lane channel-rich): `body` = the
 *  message's own formatted body (a mail's text/html part) — the window draws
 *  it in the sandboxed mail frame, never as a file chip, and an agent never
 *  sees it. Absent = an ordinary attachment. CLOSED. */
const ATTACHMENT_ROLES = Object.freeze(['body']);
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

// ── THE FACTS SCHEMA (lane message-facts, B-f066 — design 007 §2) ─────────
/** The VALUE TYPES — CLOSED. `parties` [{id, name, self?}] (≤ FACT_LIMITS.parties kept, then `more: n`; `cut: true` =
 *  the source was over its bound and nothing was parsed) · `party` {id, name, self?} · `time` (epoch ms) · `line` (one
 *  peer line) · `level` (one word of the kind's own declared set) · `count` (an integer) · `flag` (true). A new kind is
 *  a row of `FACT_SCHEMA` with one of these — never a new type, never renderer code. */
const FACT_TYPES = Object.freeze(['parties', 'party', 'time', 'line', 'level', 'count', 'flag']);
/** THE KINDS — CLOSED: each kind's value type (and a `level`'s words). Only kinds an adapter EMITS are declared (the
 *  dead-row rule); src/channel-facts.js words each one (`FACT_KINDS`) and the suite holds the two tables equal. */
const FACT_SCHEMA = Object.freeze({
  to: Object.freeze({ type: 'parties' }),
  cc: Object.freeze({ type: 'parties' }),
  bcc: Object.freeze({ type: 'parties' }),
  'reply-to': Object.freeze({ type: 'parties' }),
  sender: Object.freeze({ type: 'party' }),
  list: Object.freeze({ type: 'line' }),
  'delivered-to': Object.freeze({ type: 'party' }),
  subject: Object.freeze({ type: 'line' }),
  importance: Object.freeze({ type: 'level', levels: Object.freeze(['low', 'high', 'urgent']) }),
  automated: Object.freeze({ type: 'level', levels: Object.freeze(['auto-reply', 'bulk', 'notification']) }),
  // lane message-facts-lark (B-f066 part 2): Lark's own — the app a message came through, a merged forward, an edit, a
  // recall. `nameless: true` = the vendor may say THAT a party is there without naming it (Lark's merged forward names no
  // original sender): `v: {}` is that fact; a named party is judged as any other
  via: Object.freeze({ type: 'party' }),
  'forwarded-from': Object.freeze({ type: 'party', nameless: true }),
  edited: Object.freeze({ type: 'time' }),
  recalled: Object.freeze({ type: 'flag' }),
});
const FACT_KIND_NAMES = Object.freeze(Object.keys(FACT_SCHEMA));
/** The bounds: facts are peer-derived and sync to every client. `bytes` = a record's whole list after JSON.stringify —
 *  past it the longest party list gives up its tail (`more` grows), never the record. */
const FACT_LIMITS = Object.freeze({ facts: 32, parties: 50, idChars: 320, nameChars: 200, lineChars: 200, count: 1e9, bytes: 16 * 1024 });
/** ONE party through the name door — its address (`id`) too: a stranger spells both (a bidi override, a split frame tag,
 *  a line break that would start a second line of the agent's read are all judged here, at ingest). */
function factParty(p) {
  if (!p || typeof p !== 'object') return null;
  const id = peerName(typeof p.id === 'string' ? p.id : '', FACT_LIMITS.idChars) || '';
  const name = peerName(typeof p.name === 'string' ? p.name : '', FACT_LIMITS.nameChars) || '';
  if (!id && !name) return null;
  return { id, name, ...(p.self === true ? { self: true } : {}) };
}
/** The longest party list gives up its last party (`more` + 1) until the list fits `max` bytes; false when none can. */
function fitFacts(facts, max) {
  let json = JSON.stringify(facts);
  while (json.length > max) {
    let big = null;
    for (const f of facts) if (Array.isArray(f.v) && f.v.length && (!big || f.v.length > big.v.length)) big = f;
    if (!big) return false;
    big.v.pop();
    big.more = (Number(big.more) || 0) + 1;
    json = JSON.stringify(facts);
  }
  return true;
}
/**
 * VALIDATE (and clean) a fact list. Answers `{ok:true, facts, refused:[{index, k, code}]}` — a NEW list holding only the
 * declared fields, in `FACT_KIND_NAMES` order, every string through the name door — or `{ok:false, code:'not-an-array'}`.
 * A fact that breaks a rule is REFUSED BY NAME and left out (the rest survive): `unknown-kind`, `bad-value` (the value is
 * not its kind's type, an empty party list that says neither `more` nor `cut`, a level outside the kind's words),
 * `duplicate-kind` (the first one wins), `too-many` (past FACT_LIMITS.facts). Every bound is judged BEFORE a string is
 * read (a 1 MB "name" is cut to its bound first).
 */
function validateFacts(list) {
  if (!Array.isArray(list)) return { ok: false, code: 'not-an-array', error: 'facts must be an array', facts: [], refused: [] };
  const byKind = new Map();
  const refused = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const k = f && typeof f === 'object' && typeof f.k === 'string' ? f.k : null;
    const no = (code) => refused.push({ index: i, k: k && k.length <= 40 ? k : null, code });
    if (i >= FACT_LIMITS.facts) { no('too-many'); continue; }
    if (!k || !Object.prototype.hasOwnProperty.call(FACT_SCHEMA, k)) { no('unknown-kind'); continue; }
    if (byKind.has(k)) { no('duplicate-kind'); continue; }
    const sch = FACT_SCHEMA[k];
    let out = null;
    if (sch.type === 'parties') {
      const raw = Array.isArray(f.v) ? f.v : null;
      if (!raw) { no('bad-value'); continue; }
      const v = raw.slice(0, FACT_LIMITS.parties).map(factParty).filter(Boolean);
      const dropped = raw.length - Math.min(raw.length, FACT_LIMITS.parties);
      const more = Math.min(FACT_LIMITS.count, (Number.isInteger(f.more) && f.more > 0 ? f.more : 0) + dropped);
      const cut = f.cut === true;
      if (!v.length && !more && !cut) { no('bad-value'); continue; }
      out = { k, v };
      if (more) out.more = more;
      if (cut) out.cut = true;
    } else if (sch.type === 'party') {
      const v = factParty(f.v) || (sch.nameless === true && f.v && typeof f.v === 'object' && !Array.isArray(f.v) && !f.v.id && !f.v.name ? {} : null);   // lane message-facts-lark: a party the vendor does not name
      if (!v) { no('bad-value'); continue; }
      out = { k, v };
    } else if (sch.type === 'time') {
      const n = Number(f.v);
      if (typeof f.v !== 'number' || !Number.isFinite(n) || n <= 0) { no('bad-value'); continue; }
      out = { k, v: n };
    } else if (sch.type === 'line') {
      const v = typeof f.v === 'string' ? peerName(f.v, FACT_LIMITS.lineChars) : null;
      if (!v) { no('bad-value'); continue; }
      out = { k, v };
    } else if (sch.type === 'level') {
      if (typeof f.v !== 'string' || !sch.levels.includes(f.v)) { no('bad-value'); continue; }
      out = { k, v: f.v };
    } else if (sch.type === 'count') {
      if (!Number.isInteger(f.v) || f.v < 0) { no('bad-value'); continue; }
      out = { k, v: Math.min(FACT_LIMITS.count, f.v) };
    } else if (sch.type === 'flag') {
      if (f.v !== true) { no('bad-value'); continue; }
      out = { k, v: true };
    }
    byKind.set(k, out);
  }
  const facts = FACT_KIND_NAMES.filter((k) => byKind.has(k)).map((k) => byKind.get(k));
  fitFacts(facts, FACT_LIMITS.bytes);
  return { ok: true, facts, refused };
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
      } else if (r.k === 'at') out.push({ k: 'at', id: s(r.id, 'at.id').slice(0, 256), name: peerName(s(r.name, 'at.name'), 200) || '' });
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
          const o = { k: 'card', title: s(b.title, 'card.title').slice(0, 400), lines: lines.map((x) => s(x, 'card.line')) };
          // lane channel-rich: a card's ELEMENTS as inner blocks (a nested tree, bounded like a quote's)
          if (b.blocks !== undefined && b.blocks !== null) o.blocks = walk(b.blocks, depth + 1);
          out.push(o); break;
        }
        case 'hr': out.push({ k: 'hr' }); break;
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

/** A mention's places in `text` (B-ff04): `[[start, end]…]`, each on an '@' and inside the text; null when none is. */
const MAX_MENTION_POS = 32;
function mentionPos(pos, text) {
  if (!Array.isArray(pos)) return null;
  const out = [];
  for (const p of pos.slice(0, MAX_MENTION_POS)) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const [s, e] = p;
    if (Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e > s + 1 && e <= text.length && text[s] === '@') out.push([s, e]);
  }
  return out.length ? out : null;
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
  const author = { id: peerText(a.id, 256), name: peerName(a.name, 200) || '', isSelf: !!a.isSelf, isBot: !!a.isBot };
  // lane lark-threads (B1/B4/B5, 2026-10-01): OPTIONAL — the person's profile alternatives as the vendor names them
  // (`alt`: enName / nickname / jobTitle / department, each a bounded name, only the non-empty ones) and `external` (the
  // sender's organization is not the account's); the vendor `name` stays the name (src/channel-authors.js N3)
  if (a.alt && typeof a.alt === 'object') { const x = {}; for (const k of ['enName', 'nickname', 'jobTitle', 'department']) { const v = peerName(a.alt[k], 200); if (v) x[k] = v; } if (Object.keys(x).length) author.alt = x; }
  if (a.external === true) author.external = true;
  // lane lark-system-records: a SYSTEM notice has nobody behind it — an author id is a contradiction (refused), the rest of
  // the author is cleared to the one system shape
  const system = r.kind === 'system';
  if (r.kind !== undefined && r.kind !== null && !system) throw new Error(`channel-record: kind must be one of ${RECORD_KINDS.join('|')} or absent`);
  if (system && author.id) throw new Error('channel-record: a system record names no author (the vendor said it, nobody wrote it)');
  if (system) { delete author.alt; delete author.external; author.name = ''; author.isSelf = false; author.isBot = false; author.isSystem = true; }

  const mentions = (Array.isArray(r.mentions) ? r.mentions : []).slice(0, MAX_MENTIONS)
    .map((m) => ({ id: peerText(m && m.id, 256), name: peerName(m && m.name, 200) || '', ...(m && MENTION_KINDS.includes(m.kind) && m.kind !== 'person' ? { kind: m.kind } : {}) }));
  const attachments = (Array.isArray(r.attachments) ? r.attachments : []).slice(0, MAX_ATTACHMENTS)
    .map((x) => {
      const out = { id: peerText(x && x.id, 256), name: peerName(x && x.name, 256) || '', bytes: Number.isFinite(Number(x && x.bytes)) ? Number(x.bytes) : null, mime: peerText(x && x.mime, 128) };
      // R3 (2026-09-26): the token the adapter wrote into `text` FOR this
      // attachment (Lark's "[image]") — the window drops one occurrence once
      // the picture is drawn; `text` itself never changes. Present only when
      // the adapter declared one (every older record keeps the 4-field shape).
      const ph = peerText(x && x.placeholder, 32);
      if (ph) out.placeholder = ph;
      // lane channel-rich (2026-09-28): a mail part's Content-ID (a `cid:` picture
      // the formatted body names) and its ROLE (`body` = the message's own
      // text/html) — present only when the adapter declared them
      const cid = peerText(x && x.cid, 256).replace(/[\s<>"']/g, '');
      if (cid) out.cid = cid;
      if (x && ATTACHMENT_ROLES.includes(x.role)) out.role = x.role;
      return out;
    });

  // `text` resolves its ordinals FIRST (rule 2) and is neutered after, so a
  // mention name cannot smuggle a frame in through the substitution either.
  let text = str(r.text, MAX_TEXT);
  if (opts.resolveMentions !== false) text = resolveMentions(text, mentions);
  text = inertFrames(text);
  // B-ff04: an agent-group message's @ is STRUCTURED — `pos` = the [start, end) places in `text` the mention names,
  // written by the groups engine at send time; kept only where each still sits on an '@' of the FINAL text
  (Array.isArray(r.mentions) ? r.mentions : []).slice(0, MAX_MENTIONS).forEach((m, i) => { const p = mentionPos(m && m.pos, text); if (p) mentions[i].pos = p; });

  const raw = boundRaw(r.raw);
  if ('synthetic' in raw && typeof raw.synthetic !== 'boolean') throw new Error('channel-record: raw.synthetic must be a boolean (declare a minted key, or omit it)');

  // THE RECORD'S PLACE (lane channel-threads, 2026-09-28): `replyTo` = the
  // message this one ANSWERS, `threadKey` = the THREAD it belongs to, `root` =
  // the thread's root message when the vendor names one. All three are IDS
  // (never prose — `str`, not `peerText`) and bounded like `vendorId`.
  //  R1 a self-reference is dropped (a scraped or replayed page cannot make a
  //     record its own parent or its own root);
  //  R2 a `root` with neither a thread nor a parent is a contradiction — dropped.
  let replyTo = str(r.replyTo, 512) || null;
  if (replyTo === vendorId) replyTo = null;
  const threadKey = str(r.threadKey, 512) || null;
  let root = str(r.root, 512) || null;
  if (root === vendorId || (!threadKey && !replyTo)) root = null;
  if (system && (replyTo || threadKey || root)) throw new Error('channel-record: a system record has no reply marker (it answers nothing and sits in no thread)');
  if (system) text = text.replace(/\s+/g, ' ').trim();   // never a blank: '' = the client words the kind
  const out = {
    id: str(r.id, 256) || `${adapterId}:${convId}:${vendorId}`,
    convId, adapterId, vendorId, at,
    author, text, mentions, attachments,
    replyTo,
    threadKey,
    raw,
  };
  // THE RENDER TREE (§25) — optional, validated here; an invalid one is left
  // off (the refusal's code is the rungs' suite's business) and the record
  // renders through the generic rung from `text` like any older record.
  if (r.blocks !== undefined && r.blocks !== null) {
    const v = validateBlocks(r.blocks);
    if (v.ok && v.blocks.length) out.blocks = v.blocks;
  }
  if (root) out.root = root;
  // A MESSAGE'S FACTS (B-f066) — optional, validated here; an invalid fact is dropped by name, an empty list is no field
  if (r.facts !== undefined && r.facts !== null) {
    const v = validateFacts(r.facts);
    if (v.ok && v.facts.length) out.facts = v.facts;
  }
  if (system) { out.kind = 'system'; out.systemKind = SYSTEM_KINDS.includes(r.systemKind) ? r.systemKind : 'other'; }
  return out;
}

/** lane lark-system-records: is this record a vendor SYSTEM notice (nobody's message)? */
const isSystemRecord = (r) => !!r && typeof r === 'object' && r.kind === 'system';
/** THE READ-SIDE RE-JUDGE (no migration): a record STORED before `kind` existed in the system shape — an author with
 *  neither id nor name and the vendor's own word for it in `raw` (Lark `msg_type: 'system'`) — is served as the system
 *  notice it was (systemKind `other`, a blank text emptied). Every other record comes back as ITSELF (the same object). */
function asSystemRecord(r) {
  if (!r || typeof r !== 'object' || r.kind !== undefined) return r;
  const a = r.author;
  if (!a || typeof a !== 'object' || a.id || a.name || !r.raw || typeof r.raw !== 'object' || r.raw.msg_type !== 'system') return r;
  const words = typeof r.text === 'string' ? r.text.replace(/\s+/g, ' ').trim() : '';
  const author = { id: '' };
  author.name = '';   // the one system author (makeRecord's shape), built field by field like makeRecord's
  Object.assign(author, { isSelf: false, isBot: false, isSystem: true });
  return { ...r, author, text: words, kind: 'system', systemKind: 'other' };
}

// ── REACTIONS + SIDE RECORDS (lane channel-threads, 2026-09-28) ─────────────
// A reaction is a MUTABLE fact about an IMMUTABLE message: the message line is
// never rewritten, the facts land in the conversation's append-only SIDE log
// (src/channel-store.js `appendSide`) and are FOLDED at read time
// (src/channel-reactions.js `foldReactions`). Both shapes are peer-written —
// an emoji name, a custom emoji id, an actor's display name all come from a
// stranger — so their schema and their BOUNDS live here, beside the record,
// and every bound is judged BEFORE anything is looked up (a 64 KiB "emoji
// name" from a hostile event is refused by its length, never regex-searched).

/** At most this many reactions (distinct keys) on one message. */
const REACTIONS_MAX = 64;
/** At most this many reactors kept per key (`by`); the rest is a count. */
const REACTION_BY_MAX = 20;
/** A reaction KEY: a vendor emoji NAME (Lark `THUMBSUP`, Slack
 *  `thumbsup::skin-tone-6`) or our own id for a unicode glyph — an
 *  IDENTIFIER, never prose. One character class, a bounded quantifier, anchored
 *  (linear by construction; the verify-r3 lesson above FRAME_TAG_RE). */
const REACTION_KEY_MAX = 64;
const REACTION_KEY_RE = /^[A-Za-z0-9_+\-:.]{1,64}$/;
/** A glyph is ONE emoji cluster drawn as TEXT: ≤ 16 UTF-16 units, only the
 *  Emoji / Emoji_Component classes + ZWJ + VS16 (+ the keycap mark), and at
 *  least one character past ASCII (a run of digits is a number, not a glyph). */
const REACTION_GLYPH_MAX = 16;
const REACTION_GLYPH_RE = /^[\p{Emoji}\p{Emoji_Component}\u200d️⃣]{1,16}$/u;
const REACTION_LABEL_MAX = 40;
const REACTION_COUNT_MAX = 1e6;
/** A custom emoji picture is served by OUR route and named by our key — a
 *  vendor URL is refused by the alphabet (no `/`, no scheme). */
const CUSTOM_IMAGE_MAX = 128;
const CUSTOM_IMAGE_RE = /^emoji:[A-Za-z0-9_+\-:.]{1,64}$/;
/** The side log's closed schema: `rx` = a reaction fact, `th` = a vendor's
 *  thread stats. `edit` is the NAMED next occupant (vendor-flagged edits ride
 *  the same log later) — nobody invents a second mechanism. */
// lane lark-threads (A1, 2026-10-01): `pl` = a PLACE PATCH — a later vendor copy of a stored message named the thread
// (or root) the first copy did not carry; widen-only (src/channel-thread.js `widenPlace`), folded at read
// lane message-facts (B-f066): `fx` = a message's FACTS learned after it was stored (design 007 — the "edit" occupant named
// above: a backfilled envelope, a vendor-flagged edit) — `facts` judged by `validateFacts`, folded at read by
// src/channel-facts.js `foldFacts` (per kind the later one wins; a flag never un-happens); an empty list = "asked, none"
const SIDE_KINDS = Object.freeze(['rx', 'th', 'pl', 'fx']);
const SIDE_FORMS = Object.freeze(['delta', 'snapshot']);
const SIDE_OPS = Object.freeze(['add', 'remove']);
// lane lark-threads: + `walk` (a thread walk's repeated root), `byid` (a message read by its id), `recheck` (the
// recent-roots re-list) — where a place patch came from
const SIDE_SOURCES = Object.freeze(['event', 'list', 'history', 'self', 'agent', 'walk', 'byid', 'recheck']);
/** One side line, after JSON.stringify. A snapshot past it is TRUNCATED to
 *  the bounds (`truncated: true`), never refused — a vendor answer is still
 *  the truth for the counts. */
const SIDE_LINE_MAX_BYTES = 8 * 1024;
const SIDE_ID_MAX = 256;

/** Is `k` a reaction key? Length FIRST (a 64 KiB key never reaches the regex). */
function isReactionKey(k) { return typeof k === 'string' && k.length > 0 && k.length <= REACTION_KEY_MAX && REACTION_KEY_RE.test(k); }
/** Is `g` a drawable glyph (text, one emoji cluster)? */
function isReactionGlyph(g) {
  if (typeof g !== 'string' || !g || g.length > REACTION_GLYPH_MAX) return false;
  if (!REACTION_GLYPH_RE.test(g)) return false;
  for (let i = 0; i < g.length; i++) if (g.charCodeAt(i) > 0x7f) return true;
  return false;
}
const intIn = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : null; };
const idOf = (v) => (v === null || v === undefined ? '' : str(v, SIDE_ID_MAX));

/**
 * VALIDATE (and clean) a message's READ-SHAPE reaction list — the list the
 * engine attaches at read time (never stored on the message line):
 * `[{key, glyph, label, count, mine, by:[{id, name}], byTruncated, customImage}]`.
 * An entry that breaks a rule is REFUSED BY NAME and left out (never drawn):
 * `bad-key` (outside the alphabet / too long), `bad-glyph` (not one emoji
 * cluster — a glyph that is prose), `bad-image` (a custom image that is not
 * OUR route's key), `bad-entry`, `too-many` (past REACTIONS_MAX).
 * `byTruncated` is RECOMPUTED (`count − by.length`), never trusted.
 * → `{ok:true, reactions, refused:[{index, code}]}` | `{ok:false, code:'not-an-array'}`.
 */
function validateReactions(list) {
  if (!Array.isArray(list)) return { ok: false, code: 'not-an-array', error: 'reactions must be an array', reactions: [], refused: [] };
  const out = [];
  const refused = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    if (out.length >= REACTIONS_MAX) { refused.push({ index: i, code: 'too-many' }); continue; }
    if (!x || typeof x !== 'object') { refused.push({ index: i, code: 'bad-entry' }); continue; }
    if (!isReactionKey(x.key)) { refused.push({ index: i, code: 'bad-key' }); continue; }
    if (seen.has(x.key)) { refused.push({ index: i, code: 'bad-entry' }); continue; }
    let glyph = null;
    if (x.glyph !== null && x.glyph !== undefined && x.glyph !== '') {
      if (!isReactionGlyph(x.glyph)) { refused.push({ index: i, code: 'bad-glyph' }); continue; }
      glyph = x.glyph;
    }
    let customImage = null;
    if (x.customImage !== null && x.customImage !== undefined && x.customImage !== '') {
      if (typeof x.customImage !== 'string' || x.customImage.length > CUSTOM_IMAGE_MAX || !CUSTOM_IMAGE_RE.test(x.customImage)) { refused.push({ index: i, code: 'bad-image' }); continue; }
      customImage = x.customImage;
    }
    // `self: true` marks the ACCOUNT OWNER's own entry (the fold knows the token's id) — the who-list says "you", never the id
    const by = (Array.isArray(x.by) ? x.by : []).slice(0, REACTION_BY_MAX).map((b) => ({ id: peerText(b && b.id, SIDE_ID_MAX), name: peerName(b && b.name, 200) || '', ...(b && b.self === true ? { self: true } : {}) })).filter((b) => b.id || b.name);
    const count = Math.max(by.length, intIn(x.count, 0, REACTION_COUNT_MAX) || 0);
    seen.add(x.key);
    out.push({ key: x.key, glyph, label: peerName(x.label === undefined || x.label === null ? x.key : x.label, REACTION_LABEL_MAX) || x.key, count, mine: x.mine === true, by, byTruncated: Math.max(0, count - by.length), customImage });
  }
  return { ok: true, reactions: out, refused };
}

/**
 * VALIDATE (and bound) ONE SIDE RECORD before it is appended — every
 * peer-written field judged by its LENGTH before anything reads it:
 *   {k:'rx', msg, at, form:'delta', op, key, actor:{id, name}, rid?, src}
 *   {k:'rx', msg, at, form:'snapshot', src, list:[{key, count, by:[ids], rids:[ids]}], truncated?}
 *   {k:'th', msg, at, src, count, lastAt, replyUsers:[ids]}
 *   {k:'pl', msg, at, src, threadKey|null, root|null}   (lane lark-threads: a place patch — at least one id, ≤ 512 each,
 *                                                        no control character; a root equal to `msg` is no root)
 *   {k:'fx', msg, at, src, facts:[…]}                    (lane message-facts: `validateFacts`; a list past the line bound
 *                                                        gives up party tails (`more`), never the record; `bad-facts`)
 * A snapshot past the bounds (> REACTIONS_MAX keys, > REACTION_BY_MAX ids per
 * key, a line past SIDE_LINE_MAX_BYTES) is TRUNCATED with `truncated: true`;
 * anything else broken is REFUSED by name (`bad-kind`, `bad-msg`, `bad-at`, `bad-place`,
 * `bad-form`, `bad-op`, `bad-key`, `bad-source`, `bad-actor`, `too-large`).
 * → `{ok:true, side}` (a NEW object holding only the declared fields) | `{ok:false, code, error}`.
 */
function validateSide(input) {
  const s = input && typeof input === 'object' ? input : {};
  const no = (code, error) => ({ ok: false, code, error });
  if (!SIDE_KINDS.includes(s.k)) return no('bad-kind', `side kind must be one of ${SIDE_KINDS.join('|')}`);
  if (typeof s.msg !== 'string' || !s.msg || s.msg.length > 512) return no('bad-msg', 'a side record names its message (≤ 512 characters)');
  const at = Number(s.at);
  if (!Number.isFinite(at) || at <= 0) return no('bad-at', 'at must be an epoch ms');
  if (!SIDE_SOURCES.includes(s.src)) return no('bad-source', `src must be one of ${SIDE_SOURCES.join('|')}`);
  let out;
  if (s.k === 'fx') {
    const v = validateFacts(s.facts);
    if (!v.ok) return no('bad-facts', 'an fx side record carries a facts list');
    out = { k: 'fx', msg: s.msg, at, src: s.src, facts: v.facts };
    if (!fitFacts(out.facts, SIDE_LINE_MAX_BYTES - 1100)) return no('too-large', `a side line is at most ${SIDE_LINE_MAX_BYTES} bytes`);
  } else if (s.k === 'pl') {
    const pid = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 512 && !/[\u0000-\u001f\u007f]/.test(v) ? v : null);
    const threadKey = pid(s.threadKey);
    const root = pid(s.root) === s.msg ? null : pid(s.root);
    if (!threadKey && !root) return no('bad-place', 'a place patch names a thread key or a root (an id ≤ 512 characters)');
    out = { k: 'pl', msg: s.msg, at, src: s.src, threadKey, root };
  } else if (s.k === 'th') {
    const users = (Array.isArray(s.replyUsers) ? s.replyUsers : []).slice(0, REACTION_BY_MAX).map(idOf).filter(Boolean);
    const lastAt = Number(s.lastAt);
    out = { k: 'th', msg: s.msg, at, src: s.src, count: intIn(s.count, 0, REACTION_COUNT_MAX) || 0, lastAt: Number.isFinite(lastAt) && lastAt > 0 ? lastAt : null, replyUsers: users };
  } else if (s.form === 'delta') {
    if (!SIDE_OPS.includes(s.op)) return no('bad-op', `op must be ${SIDE_OPS.join('|')}`);
    if (!isReactionKey(s.key)) return no('bad-key', `a reaction key is at most ${REACTION_KEY_MAX} characters of [A-Za-z0-9_+-:.]`);
    const a = s.actor && typeof s.actor === 'object' ? s.actor : null;
    const actor = a ? { id: peerText(a.id, SIDE_ID_MAX), name: peerName(a.name, 200) || '' } : null;
    if (!actor || !actor.id) return no('bad-actor', 'a reaction delta names its actor');
    out = { k: 'rx', msg: s.msg, at, form: 'delta', op: s.op, key: s.key, actor, src: s.src };
    if (s.rid !== undefined && s.rid !== null && s.rid !== '') out.rid = idOf(s.rid);
  } else if (s.form === 'snapshot') {
    const raw = Array.isArray(s.list) ? s.list : [];
    let truncated = s.truncated === true || raw.length > REACTIONS_MAX;
    const list = [];
    const seen = new Set();
    for (const x of raw.slice(0, REACTIONS_MAX)) {
      if (!x || typeof x !== 'object' || !isReactionKey(x.key) || seen.has(x.key)) continue;   // a key outside the alphabet is never kept (refused, never drawn)
      seen.add(x.key);
      const byAll = Array.isArray(x.by) ? x.by : [];
      if (byAll.length > REACTION_BY_MAX) truncated = true;
      const by = byAll.slice(0, REACTION_BY_MAX).map(idOf).filter(Boolean);
      const ridsAll = Array.isArray(x.rids) ? x.rids : [];
      const rids = ridsAll.slice(0, REACTION_BY_MAX).map((v) => (v === null || v === undefined ? '' : idOf(v)));
      list.push({ key: x.key, count: Math.max(by.length, intIn(x.count, 0, REACTION_COUNT_MAX) || 0), by, rids });
    }
    out = { k: 'rx', msg: s.msg, at, form: 'snapshot', src: s.src, list };
    if (truncated) out.truncated = true;
  } else return no('bad-form', `an rx side record is a ${SIDE_FORMS.join(' or a ')}`);
  // THE LINE BOUND: a snapshot is cut (keys, then ids) until it fits; any other form past it is refused
  let json = JSON.stringify(out);
  if (json.length > SIDE_LINE_MAX_BYTES && out.form === 'snapshot') {
    out.truncated = true;
    for (const x of out.list) { x.rids = []; }
    json = JSON.stringify(out);
    while (json.length > SIDE_LINE_MAX_BYTES && out.list.length) { out.list.pop(); json = JSON.stringify(out); }
  }
  if (json.length > SIDE_LINE_MAX_BYTES) return no('too-large', `a side line is at most ${SIDE_LINE_MAX_BYTES} bytes`);
  return { ok: true, side: out };
}

/**
 * THE DEDUP IDENTITY of a side record (invariant 2's twin for the side log):
 * `rx:delta:<rid>` when the vendor issued a reaction id, else
 * `rx:delta:<msg>:<key>:<actor>:<op>:<at>`; `rx:snapshot:<msg>:<at>`;
 * `th:<msg>:<at>`. A replayed event (the vendor's at-least-once redelivery) is
 * a no-op by this key.
 */
function sideKey(s) {
  const x = s || {};
  if (x.k === 'th') return ['th', x.msg, x.at].join(':');
  if (x.k === 'pl') return ['pl', x.msg, x.threadKey || '', x.root || ''].join(':');   // a replayed widening is a no-op, whenever it came
  if (x.k === 'fx') return ['fx', x.msg, x.at, x.src].join(':');   // lane message-facts: one learning per instant and source
  if (x.form === 'snapshot') return ['rx', 'snapshot', x.msg, x.at].join(':');
  if (x.rid) return ['rx', 'delta', x.rid].join(':');
  return ['rx', 'delta', x.msg, x.key, (x.actor && x.actor.id) || '', x.op, x.at].join(':');
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
    title: peerName(c.title, 300) || '',
    kind: ['dm', 'group', 'thread'].includes(c.kind) ? c.kind : 'group',
    participants: peerName(c.participants, 300) || '',
    lastAt: Number.isFinite(Number(c.lastAt)) ? Number(c.lastAt) : null,
    // design 012 (Slack S1): THE OTHER SIDE IS AN APP (a DM with a bot / an integration) — present only when true, so
    // every other adapter's conversation keeps its shape; an app's DM is never a "Direct" tag (src/channel-focus.js)
    ...(c.app === true ? { app: true } : {}),
    // lane gmail-quota-share: WHERE THE TITLE CAME FROM — `false` = a naming read (the row is NAMED from now on), `true` = a
    // stand-in (a snippet) the engine never writes over a stored name; absent = the adapter always names its rows
    ...(typeof c.standIn === 'boolean' ? { standIn: c.standIn } : {}),
  };
}

module.exports = {
  RECORD_KINDS, SYSTEM_KINDS, isSystemRecord, asSystemRecord,   // lane lark-system-records
  RECORD_FIELDS, OPTIONAL_FIELDS, MAX_TEXT, MAX_RAW_BYTES, FRAME_TAG_RE, FRAME_TAGS, FRAME_PASSES, FRAME_WITHHELD, foldFrames, MENTION_KINDS,
  BLOCK_KINDS, RUN_KINDS, ATTACHMENT_ROLES, SYS_WHATS, BLOCK_LIMITS, LINK_SCHEMES,
  makeRecord, makeConversation, resolveMentions, inertFrames, inertFrameLine, inertOpeners, peerText, peerName, carriesFrame, recordKey, isSynthetic,
  safeHref, validateBlocks,
  // lane channel-threads (2026-09-28): reactions + the side log's schema and bounds
  REACTIONS_MAX, REACTION_BY_MAX, REACTION_KEY_MAX, REACTION_KEY_RE, REACTION_GLYPH_MAX, REACTION_LABEL_MAX, REACTION_COUNT_MAX,
  CUSTOM_IMAGE_MAX, SIDE_KINDS, SIDE_FORMS, SIDE_OPS, SIDE_SOURCES, SIDE_LINE_MAX_BYTES,
  isReactionKey, isReactionGlyph, validateReactions, validateSide, sideKey,
  // lane message-facts (B-f066): a message's facts — the closed types, the kinds' schema, the bounds, the validator
  FACT_TYPES, FACT_SCHEMA, FACT_KIND_NAMES, FACT_LIMITS, validateFacts,
};
