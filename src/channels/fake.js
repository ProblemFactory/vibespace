'use strict';
/**
 * THE FAKE ADAPTER — the P0 conformance driver
 * (docs/design-communication-panel.zh.md §19's P0 entry).
 *
 * It TALKS TO NOTHING. Its traffic is generated deterministically from a
 * fixed seed, so the panel, the window, a restart and a second client all see
 * the same conversations, and so the parity claims have a leg from day one
 * rather than from the first real vendor.
 *
 * IT REALLY RUNS ALL THREE RECEIVE MODES, because the two axes are the thing
 * P0 is proving:
 *
 *   fake-poll   receive:'poll'  · sendAs:['user'] · the ordinary lane
 *   fake-push   receive:'push'  · sendAs:[]       · a live lane with a real
 *                 `live.start()` that emits on a timer and heartbeats, so
 *                 `laneState`'s liveness/demotion precedence has something
 *                 to resolve — AND a READ-ONLY adapter, which is how the P0
 *                 exit condition "a read-only conversation renders NO send
 *                 control at all" is observable at all
 *   fake-scan   receive:'scan' · BOTH sources, per platform:
 *                 darwin → 'store' (a real client id ⇒ historyBySource
 *                          'since', `raw.synthetic` false)
 *                 linux/win32 → 'ui' (no stable id ⇒ a DECLARED synthetic
 *                          key ⇒ historyBySource 'page')
 *
 * WHICH SOURCE A history() CALL READS IS HANDED DOWN by the engine as
 * `opts.source` (the answer of `scanState()`, the ONE resolver); this module
 * never re-derives it — see the note inside `create()` (r3).
 *
 * THE SYNTHETIC KEY IS THE POINT OF THE `'ui'` HALF (design §5 invariant 2):
 * the invariant wants A key, not a vendor-issued one — but an UNDECLARED
 * synthetic key turns every re-scan into a batch of duplicates, so this
 * adapter mints one DETERMINISTICALLY from the message's own content and
 * instant and marks it `raw.synthetic: true`. Scanning the same screen twice
 * is then a no-op by construction, and the same day's traffic read through
 * `'store'` and through `'ui'` yields the same message CONTENT with the key
 * provenance as the only difference.
 *
 * ENABLING IT IS AN EXPLICIT, NAMED SEAM: `VIBESPACE_CHANNELS_FAKE=1` (read by
 * src/server/channels-engine.js). With it unset the product registers the
 * adapters — so the contract suite can drive them — and creates NO records, so
 * a user's panel is empty rather than full of invented conversations.
 */
const { makeRecord, makeConversation } = require('../channel-record.js');
const fs = require('node:fs');
const path = require('node:path');

/** A tiny deterministic PRNG — the same traffic on every boot, every client. */
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** A stable 8-hex digest — the synthetic key's minting rule. */
function digest(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const PEOPLE = [
  { id: 'u-ada', name: 'Ada' },
  { id: 'u-brook', name: 'Brook' },
  { id: 'u-cass', name: 'Cass' },
];
const LINES = [
  'the deploy finished, logs look clean',
  'can someone look at the staging box?',
  'moved the meeting to 3pm',
  'that ticket is ready for review',
  'heads up: the nightly job was slow again',
  'thanks — merged',
];

/** A tiny valid PNG (8×8, one colour per room) — what an image attachment
 *  of the fake world FETCHES (2026-09-26: the aggregated IM's image
 *  thumbnails are driven end to end through our own route). */
function fixturePng(seed) {
  const zlib = require('zlib');
  const r = rng(`png:${seed}`);
  const [R, G, B] = [Math.floor(r() * 200) + 30, Math.floor(r() * 200) + 30, Math.floor(r() * 200) + 30];
  const w = 8, h = 8;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = R; raw[o + 1] = G; raw[o + 2] = B; } }
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * LANE CHANNEL-RICH (D2, 2026-09-28): the fake world's MAIL ROOM — HTML mails
 * in the Gmail record's shape (a `role: 'body'` text/html attachment, a `cid:`
 * picture), so the window's sandboxed mail frame is driven end to end over OUR
 * route with ZERO vendor calls. Behind the NAMED seams
 * `VIBESPACE_CHANNELS_FAKE_MAIL=<n>` (n bulk mails + the special ones, on the
 * read-only push fake only — the poll fake's room count is other suites'
 * fixture) and `VIBESPACE_CHANNELS_FAKE_BEACON=<origin>` (a suite's own http
 * server every HOSTILE mail tries to reach — it must never be hit).
 */
function fixtureMailHtml(id, beacon = 'http://127.0.0.1:9') {
  const B = String(beacon || 'http://127.0.0.1:9').replace(/\/+$/, '');
  if (/-hostile$/.test(id)) {
    return [
      '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=' + B + '/refresh"><base href="' + B + '/base/">',
      '<link rel="stylesheet" href="' + B + '/link.css"><style>@import url(' + B + '/import.css); body { background: url(' + B + '/css-bg) } .x { background-image: image-set("' + B + '/imageset" 1x) }</style>',
      '<script>fetch("' + B + '/script")</script></head><body>',
      '<p id="hostile-marker">Hostile mail</p>',
      '<img src="x" onerror="fetch(\'' + B + '/onerror\')"><svg onload="fetch(\'' + B + '/svg\')"><circle r="4"/></svg>',
      '<math><mtext><table><mglyph><style><img src=x onerror="fetch(\'' + B + '/mxss\')"></style></mglyph></table></mtext></math>',
      '<form action="' + B + '/form"><input name="q" value="1"><button type="submit">Send</button></form>',
      '<iframe src="' + B + '/iframe"></iframe><object data="' + B + '/object"></object><embed src="' + B + '/embed"><video poster="' + B + '/poster"></video>',
      '<a id="hostile-js" href="javascript:fetch(\'' + B + '/js\')" target="_top">click</a> <a href="data:text/html,<script>fetch(\'' + B + '/data\')</script>">data</a>',
      '<div style="background:url(' + B + '/inline-css)">styled</div><img srcset="' + B + '/srcset 1x"><img src="' + B + '/plain-http.png">',
      '<iframe srcdoc="<script>parent.fetch(\'' + B + '/srcdoc\')</script>"></iframe></iframe><script>fetch("' + B + '/breakout")</script>',
      '<a href="jav&#x61;script:fetch(\'' + B + '/entity\')">entity</a>',
      '</body></html>',
    ].join('');
  }
  if (/-pictures$/.test(id)) {
    return '<html><body><h2 id="pictures-marker">Newsletter</h2><p>A <b>formatted</b> mail with a <a href="https://docs.example/read">link</a>.</p>'
      + '<p><img alt="remote" src="https://img.example.invalid/pic.png" width="40" height="40"></p>'
      + '<p><img alt="logo" src="cid:logo@fake" width="8" height="8"></p>'
      + '<p><img alt="tracker" src="' + B + '/tracker.gif" width="1" height="1"></p>'
      + '<table border="1"><tr><td>cell a</td><td>cell b</td></tr></table></body></html>';
  }
  // naive-user verify (2026-09-28): a WIDE newsletter (a 900 px table + a 900 px picture — the phone's frame is
  // ~300 px: fit-to-width, never cut) and a Gmail-shaped REPLY whose quoted history is folded
  if (/-wide$/.test(id)) {
    return '<html><body style="margin:0"><table width="900" cellpadding="0" cellspacing="0" style="background:#fff"><tr><td style="background:#1f6feb;color:#fff;padding:12px 20px;font-size:20px" id="wide-marker">Wide newsletter</td></tr>'
      + '<tr><td><img alt="banner" src="cid:banner@fake" width="900" height="8" style="display:block;width:900px;height:8px"></td></tr>'
      + '<tr><td style="padding:12px 20px;white-space:nowrap">A line that is exactly as wide as the table wants it to be, and then some more words after it.</td></tr></table></body></html>';
  }
  if (/-quoted$/.test(id)) {
    return '<div dir="ltr"><p id="quoted-new">Sounds good — shipping it.</p></div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Mon, 28 Sep 2026 at 09:10, Ada wrote:<br></div>'
      + '<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex"><p id="quoted-old">Can we ship the fix today?</p>'
      + '<div class="gmail_quote"><blockquote class="gmail_quote"><p>An older mail, quoted inside the quote.</p></blockquote></div></blockquote></div>';
  }
  return `<html><body><div style="font-family: sans-serif"><h3>Mail ${id.replace(/^.*-m/, '')}</h3><p>Hello <b>team</b>, this is a <i>formatted</i> message.</p><ul><li>one</li><li>two</li></ul></div></body></html>`;
}
/**
 * SECURITY VERIFY r2 (2026-09-28): THE ATTACK CORPUS SEAM — `VIBESPACE_CHANNELS_FAKE_MAIL_DIR=<dir>`: every
 * `<name>.html` in it is ONE mail of the ATTACK room (`<kind>-attack`, message `<kind>-attack-x-<name>`, from mallory@evil.example), its
 * formatted body the file's bytes verbatim, so a suite renders ANY hostile mail through the product's own path
 * (the route, the sanitizer, DOMPurify, the frame) in a real browser. A name holding `cid` also declares the
 * pictures mail's `logo@fake` part (a cid: the body may name). Read once, ≤ 200 files, ≤ 4 MB each.
 */
function corpusMails(dir) {
  if (!dir) return [];
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /^[A-Za-z0-9_-]{1,64}\.html$/.test(f)).sort().slice(0, 200); } catch { return []; }
  const out = [];
  for (const f of names) {
    let data;
    try { data = fs.readFileSync(path.join(dir, f)); } catch { continue; }
    if (data.length > 4 * 1024 * 1024) continue;
    out.push({ name: f.replace(/\.html$/, ''), data });
  }
  return out;
}
/** The corpus's OWN room (`<kind>-attack`): the mail room's fixture legs keep their first-ingest page. */
function attackRoom(kind, { now, span, corpus }) {
  const base = Math.floor(now / span) * span;
  const id = `${kind}-attack`;
  const body = (vid) => ({ id: `${vid}-body`, name: 'message.html', bytes: null, mime: 'text/html', role: 'body' });
  let t = base + span / 2;
  const records = corpus.map((c) => {
    const vid = `${id}-x-${c.name}`;
    const atts = [body(vid)];
    if (/cid/.test(c.name)) atts.push({ id: `${vid}-logo`, name: 'logo.png', bytes: null, mime: 'image/png', cid: 'logo@fake' });
    return { vendorId: vid, at: t += 60e3, author: { id: 'mallory@evil.example', name: 'Mallory' }, text: `Corpus mail ${c.name}`, attachments: atts };
  });
  return { meta: { id, title: 'Attack corpus', kind: 'group', participants: 'Mallory', readable: true, sendable: false, why: 'read-only-mailbox' }, records };
}
function mailRoom(kind, { now, n, span }) {
  const base = Math.floor(now / span) * span;
  const id = `${kind}-mail`;
  const records = [];
  const at0 = base + span / 4;
  const body = (vid) => ({ id: `${vid}-body`, name: 'message.html', bytes: null, mime: 'text/html', role: 'body' });
  for (let i = 0; i < n; i++) {
    const vid = `${id}-m${i}`;
    records.push({ vendorId: vid, at: at0 + i * 60e3, author: PEOPLE[i % PEOPLE.length], text: `Mail ${i}\nHello team, this is a formatted message.\n• one\n• two`, attachments: [body(vid)] });
  }
  let t = at0 + n * 60e3;
  const plainVid = `${id}-plain`;
  records.push({ vendorId: plainVid, at: t += 60e3, author: PEOPLE[1], text: 'A plain-text mail: <td>markup in the plain part</td> stays words.', attachments: [] });
  const picVid = `${id}-pictures`;
  records.push({ vendorId: picVid, at: t += 60e3, author: { id: 'news@letters.example', name: 'Letters' }, text: 'Newsletter\nA formatted mail with a link.', attachments: [body(picVid), { id: `${picVid}-logo`, name: 'logo.png', bytes: null, mime: 'image/png', cid: 'logo@fake' }] });
  const hostVid = `${id}-hostile`;
  records.push({ vendorId: hostVid, at: t += 60e3, author: { id: 'mallory@evil.example', name: 'Mallory' }, text: 'Hostile mail', attachments: [body(hostVid)] });
  const wideVid = `${id}-wide`;
  records.push({ vendorId: wideVid, at: t += 60e3, author: { id: 'news@letters.example', name: 'Letters' }, text: 'Wide newsletter\nA line that is exactly as wide as the table wants it to be.', attachments: [body(wideVid), { id: `${wideVid}-banner`, name: 'banner.png', bytes: null, mime: 'image/png', cid: 'banner@fake' }] });
  const quotedVid = `${id}-quoted`;
  records.push({ vendorId: quotedVid, at: t += 60e3, author: PEOPLE[0], text: 'Sounds good — shipping it.\n\nOn Mon, 28 Sep 2026 at 09:10, Ada wrote:\n> Can we ship the fix today?', attachments: [body(quotedVid)] });
  records.push({ vendorId: `${id}-bot`, at: t += 60e3, author: { id: 'cli_fake_bot_5ed0', name: 'Build Bot', isBot: true }, text: 'build 42 is green', attachments: [] });
  return { meta: { id, title: 'Mail room', kind: 'group', participants: 'Ada, Letters', readable: true, sendable: false, why: 'read-only-mailbox' }, records };
}

/** The conversations this adapter shows, per kind. Deterministic.
 *  `convs` (2026-09-26, the NAMED seam `VIBESPACE_CHANNELS_FAKE_CONVS=<n>`,
 *  read by `create()` below and nowhere else) adds n synthetic rooms after
 *  the two base ones — every third record of a synthetic room carries an
 *  attachment (an image or a text file), so the reader surface (thumbnails,
 *  downloads) has something real to fetch; the base rooms are unchanged. */
function worldFor(kind, { now = Date.now(), days = 1, convs: extra = 0, mail = 0, mailDir = '', big = 0 } = {}) {
  const convs = [
    { id: `${kind}-ops`, title: 'Ops room', kind: 'group', participants: 'Ada, Brook, Cass', readable: true, sendable: true },
    { id: `${kind}-announce`, title: 'Announcements', kind: 'group', participants: 'Ada', readable: true, sendable: false, why: 'read-only-mailbox' },
  ];
  const n = Math.max(0, Math.min(5000, Math.floor(Number(extra) || 0)));
  for (let i = 1; i <= n; i++) convs.push({ id: `${kind}-room-${i}`, title: `Room ${i}`, kind: i % 5 === 0 ? 'dm' : 'group', participants: 'Ada, Cass', readable: true, sendable: true, synthetic: true });
  const out = new Map();
  for (const c of convs) {
    const r = rng(`${kind}:${c.id}`);
    const records = [];
    const span = days * 86400e3;
    const count = 6 + Math.floor(r() * 6);
    for (let i = 0; i < count; i++) {
      const who = PEOPLE[Math.floor(r() * PEOPLE.length)];
      // Instants are derived from the seed and pinned to a DAY boundary, so a
      // restart reproduces them exactly (the window must come back identical).
      // They are spread over TWO spans from that boundary, never one: the
      // engine's markRead contract (and its suite) rely on this adapter
      // ALWAYS holding a future-dated record — a vendor's clock skew, modelled
      // — and a one-span spread left the last 1/(count+1) of every UTC day
      // (2.4 h for a 9-record room) with nothing ahead of the clock, so the
      // mandatory gate went red on any push in that window (2026-09-14
      // 21:44Z, measured). With two spans the newest instant is at least
      // span + span/(count+1) past the boundary, i.e. past any `now` inside it.
      const base = Math.floor(now / span) * span;
      const at = base + Math.floor((i + 1) * ((2 * span) / (count + 1)));
      const m = { vendorId: `${c.id}-m${i}`, at, author: who, text: LINES[Math.floor(r() * LINES.length)] };
      if (c.synthetic && i % 3 === 0) m.attachments = [i % 2 === 0 ? { id: `${c.id}-img${i}`, name: `photo-${i}.png`, bytes: null, mime: 'image/png' } : { id: `${c.id}-file${i}`, name: `notes-${i}.txt`, bytes: null, mime: 'text/plain' }];
      // R3 (§23): a synthetic room's FIRST message is a picture in LARK'S shape — the text is the
      // placeholder "[image]", the attachment a generic `image/*` named "image" that says so
      if (c.synthetic && i === 0) { m.text = '[image]'; m.attachments = [{ id: `${c.id}-img0`, name: null, bytes: null, mime: 'image/*', placeholder: '[image]' }]; }
      records.push(m);
    }
    // R3 (§23): room 2 ends with two pictures the fake VENDOR refuses — one for good (`-gone`: forbidden)
    // and one only the first time (`-flaky`: rate-limited, then served) — the window's named chip and its
    // own retry, driven end to end
    if (c.synthetic && /-room-2$/.test(c.id)) {
      const last = records.length ? records[records.length - 1].at : Math.floor(now / span) * span;
      records.push({ vendorId: `${c.id}-m-pics`, at: last + 1000, author: PEOPLE[0], text: '[image]\n[image]', attachments: [{ id: `${c.id}-gone`, name: null, bytes: null, mime: 'image/*', placeholder: '[image]' }, { id: `${c.id}-flaky`, name: null, bytes: null, mime: 'image/*', placeholder: '[image]' }] });
    }
    records.sort((a, b) => a.at - b.at);
    seedThreads(kind, c.id, records);
    out.set(c.id, { meta: c, records, reactions: seedReactions(kind, c.id, records) });
  }
  // lane channel-threads: THE BIG ROOM (the NAMED seam `VIBESPACE_CHANNELS_FAKE_BIG=<n>`, read by `create()`):
  // one extra conversation of n messages, seeded like the others — the reaction trickle's scroll storm needs
  // more rows than a window shows
  const nb = Math.max(0, Math.min(2000, Math.floor(Number(big) || 0)));
  if (nb) {
    const c = { id: `${kind}-big`, title: 'Big room', kind: 'group', participants: 'Ada, Brook, Cass', readable: true, sendable: true, synthetic: true };
    const r = rng(`${kind}:${c.id}`);
    // spread over the TWO DAYS BEFORE the clock (never ahead of it — unlike the small rooms' modelled vendor skew):
    // a message sent into the big room now is its newest, as in any live conversation
    const span = days * 86400e3;
    const base = now - 2 * span;
    const records = [];
    for (let i = 0; i < nb; i++) records.push({ vendorId: `${c.id}-m${String(i).padStart(4, '0')}`, at: base + Math.floor((i + 1) * ((2 * span - 60e3) / (nb + 1))), author: PEOPLE[Math.floor(r() * PEOPLE.length)], text: LINES[Math.floor(r() * LINES.length)] });
    seedThreads(kind, c.id, records);
    out.set(c.id, { meta: c, records, reactions: seedReactions(kind, c.id, records) });
  }
  const nMail = Math.max(0, Math.min(200, Math.floor(Number(mail) || 0)));
  if (nMail && kind === 'fake-push') {
    const room = mailRoom(kind, { now, n: nMail, span: days * 86400e3 });
    out.set(room.meta.id, room);
    const corpus = corpusMails(mailDir);
    if (corpus.length) { const atk = attackRoom(kind, { now, span: days * 86400e3, corpus }); out.set(atk.meta.id, atk); }
  }
  return out;
}

/** THE SEEDED THREAD SHAPE (lane channel-threads, spec §7.2) — replacing the old `threadKey: convId` on every
 *  record, a shape no vendor produces. A SEPARATE generator (seed `threads:<kind>:<conv>`), so the rooms' existing
 *  instants and words are byte-identical: about 40 % of messages top-level, 30 % of those a ROOT with 1–6 planned
 *  replies; a reply answers the root or a previous reply of its thread. `fake-push` threads are VENDOR threads
 *  (a minted `fthr_…` key — TOPICS), `fake-scan` threads are reply CHAINS keyed by the root's id (QUOTES), and
 *  `fake-poll` holds BOTH (quote-vs-topic, owner 2026-09-28 — the vendor-free leg of "a quote is a quote, a topic is a
 *  topic", the Lark group shape): its roots alternate topic / quote chain by their order (no extra draw from the
 *  generator — every room's replies and parents are the ones they were). */
function seedThreads(kind, convId, records) {
  const r = rng(`threads:${kind}:${convId}`);
  const open = [];   // {root, key, left, members: [vendorId]}
  for (const m of records) {
    const live = open.filter((t) => t.left > 0);
    if (live.length && r() < 0.6) {
      const t = live[Math.floor(r() * live.length)];
      const parent = t.members.length && r() < 0.35 ? t.members[Math.floor(r() * t.members.length)] : t.root;
      m.replyTo = parent; m.threadKey = t.key; m.root = t.root;
      t.members.push(m.vendorId); t.left--;
      continue;
    }
    if (r() < 0.3) {
      const topic = kind === 'fake-push' || (kind === 'fake-poll' && open.length % 2 === 0);
      const key = topic ? `fthr_${digest(`${convId}|${m.vendorId}`)}` : m.vendorId;
      open.push({ root: m.vendorId, key, left: 1 + Math.floor(r() * 6), members: [] });
      if (topic) m.threadKey = key;   // a topic's root carries the thread id (a Lark topic head)
    }
  }
}

/** The fake vocabulary: 40 keys with glyphs + 2 CUSTOM keys drawn as a picture through OUR route (emojiImage). */
const FAKE_EMOJI = Object.freeze([
  ['thumbsup', '👍', 'thumbs up'], ['heart', '❤️', 'heart'], ['tada', '🎉', 'party'], ['fire', '🔥', 'fire'], ['eyes', '👀', 'eyes'],
  ['ok', '👌', 'ok'], ['pray', '🙏', 'thanks'], ['laugh', '😄', 'laugh'], ['joy', '😂', 'joy'], ['thinking', '🤔', 'thinking'],
  ['clap', '👏', 'clap'], ['rocket', '🚀', 'rocket'], ['check', '✅', 'done'], ['x', '❌', 'no'], ['wave', '👋', 'wave'],
  ['muscle', '💪', 'muscle'], ['star', '⭐', 'star'], ['100', '💯', 'hundred'], ['cry', '😢', 'cry'], ['wow', '😮', 'wow'],
  ['sun', '☀️', 'sun'], ['coffee', '☕', 'coffee'], ['beer', '🍺', 'beer'], ['cake', '🎂', 'cake'], ['gift', '🎁', 'gift'],
  ['bulb', '💡', 'idea'], ['pin', '📌', 'pin'], ['bell', '🔔', 'bell'], ['lock', '🔒', 'lock'], ['key', '🔑', 'key'],
  ['bug', '🐛', 'bug'], ['zap', '⚡', 'zap'], ['snail', '🐌', 'snail'], ['tea', '🍵', 'tea'], ['moon', '🌙', 'moon'],
  ['cool', '😎', 'cool'], ['shrug', '🤷', 'shrug'], ['facepalm', '🤦', 'facepalm'], ['thumbsdown', '👎', 'thumbs down'], ['hourglass', '⏳', 'waiting'],
  ['party_parrot', null, 'party parrot', true], ['shipit', null, 'ship it', true],
].map(([key, glyph, label, custom]) => Object.freeze({ key, glyph, label, custom: custom === true })));
/** The fake account's own user id — `mine` is judged against it (the Lark adapter answers the token's open id). */
const FAKE_SELF = 'u-me';
const FAKE_REACTORS = ['u-ada', 'u-brook', 'u-cass', 'u-dee', 'u-eli', 'u-fox', 'u-gus', 'u-hal', 'u-ivy'];
/** Seeded reactions on 25 % of messages: 2–4 keys, 1–9 reactors each; every fifth reacted message carries one of
 *  OURS. State = Map<vendorId, Map<key, [{actor, rid}]>> — `reactions()` serves it as a snapshot. */
function seedReactions(kind, convId, records) {
  const r = rng(`reactions:${kind}:${convId}`);
  const state = new Map();
  let n = 0;
  for (const m of records) {
    if (r() >= 0.25) continue;
    n++;
    const keys = new Map();
    const k = 2 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) {
      const e = FAKE_EMOJI[Math.floor(r() * 12)];
      if (keys.has(e.key)) continue;
      const cnt = 1 + Math.floor(r() * 9);
      const who = [];
      for (let j = 0; j < cnt; j++) who.push({ actor: FAKE_REACTORS[j % FAKE_REACTORS.length], rid: `frx-${digest(`${convId}|${m.vendorId}|${e.key}|${j}`)}` });
      keys.set(e.key, who);
    }
    if (n % 5 === 0 && keys.size) { const first = keys.keys().next().value; keys.get(first).unshift({ actor: FAKE_SELF, rid: `frx-${digest(`${convId}|${m.vendorId}|${first}|me`)}` }); }
    state.set(m.vendorId, keys);
  }
  return state;
}
/** A 1×1 PNG — what a CUSTOM fake emoji's picture fetches (through OUR route). */
const ONE_PX_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** `'ui'` has no stable id, so it DECLARES one derived from the content. */
const syntheticKey = (adapterId, convId, m) => `syn-${digest(`${adapterId}|${convId}|${m.at}|${m.author.id}|${m.text}`)}`;

function toRecord(adapterId, convId, m, { synthetic = false } = {}) {
  return makeRecord({
    adapterId, convId,
    vendorId: synthetic ? syntheticKey(adapterId, convId, m) : m.vendorId,
    at: m.at,
    author: { id: m.author.id, name: m.author.name, isSelf: false, isBot: !!m.author.isBot },
    text: m.text,
    mentions: [], attachments: Array.isArray(m.attachments) ? m.attachments : [],
    // lane channel-threads: the seeded place (spec §7.2) — a reply's parent, its thread, its root
    // (a SCRAPED screen shows no message ids — its minted keys cannot name a parent: no place on the 'ui' source)
    replyTo: synthetic ? null : (m.replyTo || null), threadKey: synthetic ? null : (m.threadKey || null), root: synthetic ? null : (m.root || null),
    raw: synthetic ? { synthetic: true, source: 'ui' } : { synthetic: false, source: 'store' },
  });
}

/**
 * Build one fake adapter MODULE. `receive` picks the axis-1 behaviour; the
 * caps are otherwise the same declaration a real adapter would make.
 */
/** LANE R5's FIXTURE SEAMS (test-channels-e2e ⑰ boots a server with them;
 *  nothing else sets them), read ONCE at module load because a declaration
 *  is static — the POLL fake only:
 *   VIBESPACE_CHANNELS_FAKE_PACE=<n>   declares `caps.pace` at n requests a
 *                                       second (drain rule 18 shapes its reads)
 *   VIBESPACE_CHANNELS_FAKE_VENDOR=<s> declares `caps.vendorName` (the card
 *                                       says "<s> is limiting the rate")
 *  and, per adapter at create(), VIBESPACE_CHANNELS_FAKE_RATE_LIMIT=<n>[:<s>]
 *  = the first n history() calls refuse like Gmail's per-user minute quota,
 *  carrying Retry-After s. */
function fakeR5Caps(receive, env = process.env) {
  if (receive !== 'poll') return {};
  const out = {};
  const r = Number(env.VIBESPACE_CHANNELS_FAKE_PACE) || 0;
  if (r > 0) out.pace = { unitsPerSec: r, settingKey: null, cost: { fetch: 1, discover: 1 } };   // (an unpriced action costs 1)
  const v = String(env.VIBESPACE_CHANNELS_FAKE_VENDOR || '').trim();
  if (v) out.vendorName = v.slice(0, 40);
  return out;
}

/** lane lark-search-poll: the fake's CHANGE FEED declaration (the conformance driver implements it from its seeded
 *  traffic — a SEARCH over every conversation's records, newest first, 30 a page, plus three HIDDEN single chats the
 *  listing never names, exactly Lark's shape). Declared only when asked (`feed: true`, or the NAMED seam
 *  `VIBESPACE_CHANNELS_FAKE_FEED=1` for fake-poll, read once at module load like the R5 seams): every existing suite
 *  that drives fake-poll through the engine keeps its arithmetic. */
const FAKE_FEED = Object.freeze({ via: 'search', scope: null, option: null, pageSize: 30, pagesPerPass: 5, perMin: 10, maxWindowSec: 3600, catchUp: Object.freeze({ chatType: 'p2p', pagesMax: 20 }), describes: true, timeUnit: 'ms' });
const FAKE_DMS = Object.freeze([{ id: 'dm-ada', peer: PEOPLE[0] }, { id: 'dm-brook', peer: PEOPLE[1] }, { id: 'dm-cass', peer: PEOPLE[2] }]);

function makeFakeAdapter({ kind, receive, sendAs = ['user'], now = () => Date.now(), feed = false }) {
  const caps = {
    receive,
    pushTransport: receive === 'push' ? 'ws-long-conn' : null,
    pushAckBudgetMs: receive === 'push' ? 3000 : null,
    pollInterval: { hot: 30, cold: 300, floor: 10 },
    scanSources: receive === 'scan' ? { darwin: 'store', win32: 'ui', linux: 'ui' } : null,
    scanLatency: receive === 'scan' ? { store: 15, ui: 300 } : null,
    history: receive === 'scan' ? null : 'page',
    historyBySource: receive === 'scan' ? { store: 'since', ui: 'page' } : null,
    listConversations: true,
    sendAs,
    identityMarking: sendAs.length ? 'unknown' : 'none',
    identityMarkingWhere: null,
    identityMarkingText: null,
    tosRisk: 'none',
    idempotency: 'key',
    threading: 'thread-id',
    editSent: false,
    readReceipts: false,
    // 2026-09-26 (the aggregated IM): a fake attachment is FETCHED (a fixture
    // PNG / a text body), history pages back past the local log, and every
    // call is metered one request against a generous fixture budget
    attachments: receive === 'scan' ? 'metadata' : 'fetch',
    olderHistory: receive === 'scan' ? 'none' : 'page',
    budget: { unit: 'request', default: 600, settingKey: null, metered: true },
    // R4 (B-6acc): the poll fake can start a NEW conversation (`compose`) —
    // the suites drive the compose verb through it; the push fake is read-only
    compose: receive === 'poll' && sendAs.length > 0,
    ...fakeR5Caps(receive),
    ...(feed ? { changeFeed: FAKE_FEED } : {}),
    // lane channel-threads (spec §2.2 / §7.2): the conformance driver implements EVERY row so the chrome legs and
    // the contract suite have a vendor-free leg — vendor threads whose replies ride the listing (`inline`), a reply
    // INTO a thread where the adapter can send (fake-push is read-only: validateCaps refuses replyInto there), a
    // per-message reaction list, add / remove our own, both vocabularies + two custom pictures; fake-scan is a
    // reply CHAIN only, no reactions
    // 2026-09-28 (reply PLACEMENTS): the sending poll fake declares ALL FOUR (the vendor-free leg of every placement —
    // `thread+chat` lands in the thread and is echoed into the chat, Slack's reply_broadcast); the scan fake a chat + a
    // quote (a reply chain); the push fake is read-only and places nothing
    threads: receive === 'scan'
      ? { read: 'chain', replyInto: false, listing: 'none', placements: sendAs.length ? ['chat', 'quote'] : [], rootReply: sendAs.length ? 'quote' : null }
      : { read: 'vendor', replyInto: sendAs.length > 0, listing: 'inline', placements: sendAs.length ? ['chat', 'quote', 'thread', 'thread+chat'] : [], rootReply: sendAs.length ? 'quote' : null },
    reactions: receive === 'scan' ? { read: 'none', add: false, remove: 'none', vocabulary: 'names', custom: 'none', perMessageMax: null } : { read: 'list', add: true, remove: 'own', vocabulary: 'both', custom: 'image', perMessageMax: null },
  };

  function create(record = {}, deps = {}) {
    const adapterId = record.id || kind;
    const clock = deps.now || now;
    // the NAMED seam, read HERE only: how many synthetic rooms to add
    const extraConvs = Number((deps.env || process.env).VIBESPACE_CHANNELS_FAKE_CONVS) || 0;
    // lane channel-rich: the mail room's seams (see fixtureMailHtml)
    const mailN = Number((deps.env || process.env).VIBESPACE_CHANNELS_FAKE_MAIL) || 0;
    const beacon = String((deps.env || process.env).VIBESPACE_CHANNELS_FAKE_BEACON || '');
    const mailDir = String((deps.env || process.env).VIBESPACE_CHANNELS_FAKE_MAIL_DIR || '');
    // lane channel-threads: the NAMED big-room seam (read HERE only) — one room of n messages
    const bigRoom = Number((deps.env || process.env).VIBESPACE_CHANNELS_FAKE_BIG) || 0;
    let world = null;
    const getWorld = () => {
      if (world) return world;
      world = worldFor(kind, { now: clock(), convs: extraConvs, mail: mailN, mailDir, big: bigRoom });
      // lane lark-search-poll: a feed-declaring fake also holds three single chats the LISTING never names (Lark's
      // `im/v1/chats` lists groups only) — only its change feed finds them
      if (caps.changeFeed) for (const d of FAKE_DMS) {
        const id = `${kind}-${d.id}`;
        const r = rng(`${kind}:${id}`);
        const base = clock() - 3 * 86400e3;
        const records = [];
        for (let i = 0; i < 4; i++) records.push({ vendorId: `${id}-m${i}`, at: base + Math.floor((i + 1) * (3 * 86400e3 - 60e3) / 5), author: i % 2 ? { id: FAKE_SELF, name: 'Me' } : d.peer, text: LINES[Math.floor(r() * LINES.length)] });
        world.set(id, { meta: { id, title: d.peer.name, kind: 'dm', participants: d.peer.name, readable: true, sendable: true, hidden: true, peer: d.peer }, records, reactions: new Map() });
      }
      return world;
    };
    /** lane lark-search-poll: a message the fake vendor received NOW (the feed's and the push lane's test traffic). */
    const deliverNow = (convId, m) => { const c = getWorld().get(convId); if (c) { c.records.push(m); c.records.sort((a, b) => a.at - b.at); } return !!c; };

    const meter = typeof deps.meter === 'function' ? deps.meter : () => {};
    const refusedOnce = new Set();   // R3: the `-flaky` pictures refused once already
    // lane R5's rate seam (see fakeR5Caps): the first n history() calls refuse with the vendor's per-minute words
    const rateSeam = receive === 'poll' ? String((deps.env || process.env).VIBESPACE_CHANNELS_FAKE_RATE_LIMIT || '') : '';
    let rateLeft = Number(rateSeam.split(':')[0]) || 0;
    const rateAfter = Number(rateSeam.split(':')[1]);
    // THE SCAN SOURCE ARRIVES AS `opts.source` ON EVERY history() CALL — the
    // engine resolves it with `scanState()` and hands it down, and the registry
    // refuses a scan-adapter page that carries none. This module used to keep
    // a `source()` closure that fell back to `caps.scanSources[process.platform]`
    // (r3): a second resolver, two lines under a comment saying there was
    // none, and the reason the engine could ingest through a lane the real
    // resolver had just called unavailable. There is deliberately nothing
    // here that reads `caps.scanSources` or `process.platform` except
    // `scanHost()`, whose whole job is to REPORT the platform.

    // THE §14 CREDENTIAL QUESTION IS ASKED OF THE ONE RESOLVER, never of
    // process.env: `deps.resolveIntegration('fake')` is the fake row's live
    // consumer (the registry census requires exactly this call in exactly
    // this file). With no resolver handed in (the contract suite creates
    // adapters bare) the fake answers as it always did; with one, a row that
    // resolves to `none` with a required field missing is `needs-credentials`
    // — the Adapters row flips, not only the Integrations card (§14.3).
    const resolveIntegration = typeof deps.resolveIntegration === 'function' ? deps.resolveIntegration : null;

    return {
      auth: {
        async state() {
          if (resolveIntegration) {
            let r = null;
            try { r = resolveIntegration('fake'); } catch (e) { return { state: 'unknown', expiresAt: null, scopes: [], why: `integration lookup failed: ${(e && e.message) || e}` }; }
            if (r && r.source === 'none' && Array.isArray(r.missing) && r.missing.length) {
              // the store's `whyCode`/`whyParams` ride beside its sentence, so the panel words the CODE (a3 i18n)
              return { state: 'needs-credentials', expiresAt: null, scopes: [], why: r.why || 'no-credentials', whyCode: r.whyCode || null, whyParams: r.whyParams || null, missing: r.missing.slice(), credentialSource: 'none' };
            }
            return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null, credentialSource: r ? r.source : null };
          }
          return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null };
        },
      },

      async listConversations() {
        meter(1);
        const list = [...getWorld().values()].filter((c) => !c.meta.hidden).map((c) => makeConversation({
          id: c.meta.id, vendorId: c.meta.id, title: c.meta.title, kind: c.meta.kind,
          participants: c.meta.participants, lastAt: c.records.length ? c.records[c.records.length - 1].at : null,
        }));
        return { conversations: list, cursor: null, complete: true };
      },

      /** Per-conversation, three-valued, and NEVER wider than `caps` (the
       *  registry enforces that too — this one narrows honestly). */
      async convCaps(convId) {
        meter(1);
        const c = getWorld().get(convId);
        const rxRow = caps.reactions.read === 'none' ? null : (ok, why) => ({ read: true, add: ok && caps.reactions.add, why: ok ? null : why });
        const thRow = (ok, why) => ({ replyInto: ok && caps.threads.replyInto, mode: caps.threads.read === 'none' ? null : 'thread', why: ok && caps.threads.replyInto ? null : (why || 'thread-reply-not-declared') });
        if (!c) return { read: 'no', sendAs: [], why: 'not-a-member', at: clock(), threads: { replyInto: false, mode: null, why: 'not-a-member' }, ...(rxRow ? { reactions: { read: false, add: false, why: 'not-a-member' } } : {}) };
        if (!c.meta.sendable) return { read: 'yes', sendAs: [], why: c.meta.why || 'read-only-mailbox', at: clock(), threads: thRow(false, c.meta.why || 'read-only-mailbox'), ...(rxRow ? { reactions: rxRow(false, c.meta.why || 'read-only-mailbox') } : {}) };
        return { read: 'yes', sendAs: caps.sendAs.slice(), why: null, at: clock(), threads: thRow(caps.sendAs.length > 0, null), ...(rxRow ? { reactions: rxRow(true, null) } : {}) };
      },
      /** The account's own user id (the fold's `mine`). */
      selfId() { return FAKE_SELF; },

      /**
       * Pages BACKWARD from the newest toward `anchor`, returning at most
       * `limit` and saying HONESTLY whether it got there. It advances nothing:
       * the cursor belongs to the store.
       */
      async history(convId, { anchor = null, limit = 50, source = null, initialMax = null } = {}) {
        meter(1);
        if (rateLeft > 0) { rateLeft--; const { ChannelError } = require('./index.js'); throw new ChannelError('rate-limited', "fake: Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user' (403)", { retryable: true, detail: { status: 403, reason: 'rateLimitExceeded', retryAfterSec: Number.isFinite(rateAfter) && rateAfter > 0 ? rateAfter : null } }); }
        const c = getWorld().get(convId);
        if (!c) return { records: [], anchor: null, reachedAnchor: true, complete: true };
        // `source` is the RESOLVED one the engine handed down (see above).
        const synthetic = receive === 'scan' && source === 'ui';
        const all = c.records.map((m) => toRecord(adapterId, convId, m, { synthetic }));
        let idx = 0;
        if (anchor) {
          const at = all.findIndex((r) => r.vendorId === anchor);
          idx = at >= 0 ? at + 1 : 0;
        } else if (Number(initialMax) > 0 && receive !== 'scan') {
          // a FIRST ingest takes the newest page only; `older()` has the rest
          idx = Math.max(0, all.length - Number(initialMax));
        }
        const anchorFound = !anchor || idx > 0;
        const pending = all.slice(idx);
        const page = pending.slice(0, limit);
        const drained = page.length === pending.length;
        return {
          records: page,
          anchor: page.length ? page[page.length - 1].vendorId : anchor,
          // Honest on BOTH halves: we reached the stored anchor only if we
          // found it AND drained everything after it. An anchor we could not
          // find is an INCOMPLETE pass — `complete:false` says "do not
          // advance", which is design §5 invariant 4's whole point: a pass
          // that skipped is worse than a pass that re-reads.
          reachedAnchor: anchorFound && drained,
          complete: anchorFound && drained,
        };
      },

      /** HISTORY ON DEMAND: the newest `limit` records strictly before
       *  `before` ({at, vendorId}); `exhausted` once nothing older is left. */
      older: receive === 'scan' ? undefined : async (convId, { before = null, limit = 50 } = {}) => {
        meter(1);
        const c = getWorld().get(convId);
        if (!c) return { records: [], exhausted: true };
        const all = c.records.map((m) => toRecord(adapterId, convId, m));
        const olderThan = before ? all.filter((r) => r.at < Number(before.at) || (r.at === Number(before.at) && before.vendorId && r.vendorId < before.vendorId)) : all;
        const page = olderThan.slice(-Math.max(1, Number(limit) || 50));
        return { records: page, exhausted: page.length === olderThan.length };
      },
      /** ONE attachment's bytes: a fixture PNG for an image, a text body
       *  otherwise — only for an id a record of this conversation names. */
      fetchAttachment: receive === 'scan' ? undefined : async (convId, { messageId, attachmentId } = {}) => {
        meter(1);
        const c = getWorld().get(convId);
        const m = c && c.records.find((x) => x.vendorId === messageId);
        const a = m && Array.isArray(m.attachments) ? m.attachments.find((x) => x.id === attachmentId) : null;
        if (!a) { const { ChannelError } = require('./index.js'); throw new ChannelError('not-found', `fake: no attachment ${attachmentId} on ${messageId}`, { retryable: false }); }
        // R3 (§23): the fake vendor's two refusals — for good, and only the first time
        if (/-gone$/.test(a.id)) { const { ChannelError } = require('./index.js'); throw new ChannelError('forbidden', `fake: the vendor refuses ${a.id}`, { retryable: false }); }
        if (/-flaky$/.test(a.id) && !refusedOnce.has(a.id)) { refusedOnce.add(a.id); const { ChannelError } = require('./index.js'); throw new ChannelError('rate-limited', `fake: rate limited on ${a.id}`, { retryable: true, detail: { retryAfterSec: 2 } }); }
        if (/^image\//.test(a.mime || '')) return { data: fixturePng(a.id), mime: 'image/png', name: a.name };
        if (a.role === 'body') {
          // the attack corpus (security verify r2): the file's bytes verbatim
          const cx = /-x-([A-Za-z0-9_-]+)$/.exec(String(messageId));
          const hit = cx ? corpusMails(mailDir).find((c) => c.name === cx[1]) : null;
          if (hit) return { data: hit.data, mime: 'text/html', name: a.name };
          return { data: Buffer.from(fixtureMailHtml(messageId, beacon), 'utf-8'), mime: 'text/html', name: a.name };
        }
        return { data: Buffer.from(`fixture attachment ${a.id} of ${messageId}\n`, 'utf-8'), mime: 'text/plain', name: a.name };
      },

      // ── lane channel-threads: the reaction list / acts / vocabulary / custom picture ──
      /** ONE message's reactions as the vendor would list them (a snapshot's shape). */
      reactions: caps.reactions.read === 'list' ? async (convId, { messageId } = {}) => {
        meter(1);
        const c = getWorld().get(convId);
        if (!c || !c.records.some((x) => x.vendorId === messageId)) { const { ChannelError } = require('./index.js'); throw new ChannelError('not-found', `fake: no message ${messageId}`, { retryable: false }); }
        const keys = c.reactions.get(messageId) || new Map();
        return { list: [...keys].map(([key, who]) => ({ key, count: who.length, by: who.slice(0, 20).map((w) => w.actor), rids: who.slice(0, 20).map((w) => w.rid) })), truncated: false, at: clock() };
      } : undefined,
      /** ADD our reaction: a key the set does not list is `bad-emoji`, one we already hold `already-reacted`
       *  (Slack's word — the fake speaks every vendor's refusal), a missing message `not-reactable`. */
      react: caps.reactions.add ? async (convId, { messageId, key } = {}) => {
        meter(1);
        const { ChannelError } = require('./index.js');
        const c = getWorld().get(convId);
        const msg = c && c.records.find((x) => x.vendorId === messageId);
        if (!msg) throw new ChannelError('not-found', `fake: ${messageId} cannot take a reaction`, { retryable: false, detail: { why: 'not-reactable' } });
        if (!FAKE_EMOJI.some((e) => e.key === key)) throw new ChannelError('vendor-error', `fake: '${String(key).slice(0, 64)}' is not an emoji this channel allows`, { retryable: false, detail: { why: 'bad-emoji' } });
        if (!c.reactions.has(messageId)) c.reactions.set(messageId, new Map());
        const keys = c.reactions.get(messageId);
        const who = keys.get(key) || [];
        if (who.some((w) => w.actor === FAKE_SELF)) throw new ChannelError('vendor-error', 'fake: already_reacted', { retryable: false, detail: { why: 'already-reacted' } });
        const rid = `frx-${digest(`${convId}|${messageId}|${key}|me|${clock()}`)}`;
        who.unshift({ actor: FAKE_SELF, rid });
        keys.set(key, who);
        return { ok: true, reactionId: rid, at: clock(), actor: FAKE_SELF };
      } : undefined,
      /** REMOVE our reaction (own only). */
      unreact: caps.reactions.remove === 'own' ? async (convId, { messageId, key, reactionId } = {}) => {
        meter(1);
        const { ChannelError } = require('./index.js');
        const c = getWorld().get(convId);
        const who = c && c.reactions.get(messageId) && c.reactions.get(messageId).get(key);
        const i = who ? who.findIndex((w) => w.actor === FAKE_SELF && (!reactionId || w.rid === reactionId)) : -1;
        if (i < 0) throw new ChannelError('forbidden', 'fake: only a reaction you added can be removed', { retryable: false, detail: { why: 'reaction-not-mine' } });
        who.splice(i, 1);
        if (!who.length) c.reactions.get(messageId).delete(key);
        return { ok: true, at: clock() };
      } : undefined,
      /** The picker's vocabulary: 40 glyph keys + 2 custom pictures; a quick row of 12. */
      reactionSet: caps.reactions.add ? async () => ({ keys: FAKE_EMOJI.map((e) => ({ key: e.key, glyph: e.glyph, label: e.label, custom: e.custom })), quick: FAKE_EMOJI.slice(0, 12).map((e) => e.key), custom: true, at: clock() }) : undefined,
      /** A CUSTOM emoji's picture — only for a key the set lists as custom (a 1×1 PNG). */
      emojiImage: caps.reactions.custom === 'image' ? async (key) => {
        meter(1);
        const e = FAKE_EMOJI.find((x) => x.key === key && x.custom);
        if (!e) { const { ChannelError } = require('./index.js'); throw new ChannelError('not-found', `fake: no custom emoji '${String(key).slice(0, 64)}'`, { retryable: false }); }
        return { data: ONE_PX_PNG, mime: 'image/png' };
      } : undefined,
      // ── lane lark-search-poll: THE CHANGE FEED over the seeded traffic ──
      /** ONE page of "what changed in [from, to]" — every record whose instant lies in the window, newest first, the
       *  declared page size, an offset token; `chatType: 'p2p'` = the single chats only. A MARK per message (no text). */
      changes: caps.changeFeed ? async ({ from = 0, to = clock(), pageToken = null, chatType = null, pageSize = caps.changeFeed.pageSize } = {}) => {
        meter(1);
        const size = Math.min(caps.changeFeed.pageSize, Math.max(1, Number(pageSize) || caps.changeFeed.pageSize));
        const all = [];
        for (const c of getWorld().values()) {
          const p2p = c.meta.kind === 'dm';
          if (chatType === 'p2p' && !p2p) continue;
          if (chatType === 'group' && p2p) continue;
          for (const m of c.records) if (m.at >= Number(from) && m.at <= Number(to)) all.push({ convId: c.meta.id, vendorId: m.vendorId, at: m.at, updatedAt: null, threadKey: m.threadKey || null, isP2p: p2p, fromId: (m.author && m.author.id) || null });
        }
        all.sort((a, b) => b.at - a.at || (a.vendorId < b.vendorId ? 1 : -1));
        const off = /^fk:\d+$/.test(String(pageToken || '')) ? Number(String(pageToken).slice(3)) : 0;
        const hits = all.slice(off, off + size);
        const next = off + size < all.length ? `fk:${off + size}` : null;
        return { hits, more: !!next, pageToken: next, total: all.length, malformed: 0 };
      } : undefined,
      /** A conversation the feed found, NAMED (the fake knows its own world — no vendor call). */
      describe: caps.changeFeed && caps.changeFeed.describes ? async (convId) => {
        const c = getWorld().get(convId);
        if (!c) return { title: null, kind: null, peers: [] };
        return { title: c.meta.title || null, kind: c.meta.kind === 'dm' ? 'dm' : 'group', peers: c.meta.peer ? [{ id: c.meta.peer.id, name: c.meta.peer.name }] : [] };
      } : undefined,
      /** A suite's hand on the fake vendor's world (lane lark-search-poll): a message that arrived NOW. */
      _deliver: caps.changeFeed ? deliverNow : undefined,
      // ── receive:'push' — a REAL live lane (a timer, not a promise) ────────
      live: receive === 'push' ? {
        start({ onEvent, onState } = {}) {
          let stopped = false;
          onState && onState({ state: 'live', at: clock() });
          const rr = rng(`live-reactions:${kind}:${adapterId}`);
          const t = setInterval(() => {
            if (stopped) return;
            // A heartbeat is what makes `laneState`'s liveness POSITIVE
            // evidence; a lane that only claims to be live is the
            // `opencode-events` round-4 lesson.
            onState && onState({ state: 'live', at: clock() });
            onEvent && onEvent({ kind: 'cursor-kick', at: clock() });
            // lane channel-threads (spec §7.2): somebody reacts — ONE delta per beat, as the vendor's event would
            // carry it (the fake names the conversation; Lark's event does not and the engine finds it)
            const rooms = [...getWorld().values()].filter((c) => c.reactions && c.reactions.size);
            if (rooms.length && onEvent) {
              const c = rooms[Math.floor(rr() * rooms.length)];
              const ids = [...c.reactions.keys()];
              const msg = ids[Math.floor(rr() * ids.length)];
              const key = FAKE_EMOJI[Math.floor(rr() * 12)].key;
              const actor = FAKE_REACTORS[Math.floor(rr() * FAKE_REACTORS.length)];
              const keys = c.reactions.get(msg);
              const who = keys.get(key) || [];
              const had = who.findIndex((w) => w.actor === actor);
              const op = had >= 0 ? 'remove' : 'add';
              if (had >= 0) who.splice(had, 1); else who.push({ actor, rid: `frx-${digest(`${c.meta.id}|${msg}|${key}|${actor}|${clock()}`)}` });
              if (who.length) keys.set(key, who); else keys.delete(key);
              const at = clock();
              onEvent({ kind: 'side', eventId: `fake-rx:${c.meta.id}:${msg}:${key}:${actor}:${op}:${at}`, convId: c.meta.id, messageId: msg, side: { k: 'rx', msg, at, form: 'delta', op, key, actor: { id: actor, name: '' }, src: 'event' }, at });
            }
          }, 5000);
          if (t.unref) t.unref();
          return { stop() { stopped = true; clearInterval(t); onState && onState({ state: 'stopped', at: clock() }); } };
        },
      } : undefined,

      // ── receive:'scan' — facts about ONE machine; hostId is a PARAMETER ──
      scanHost: receive === 'scan' ? async (hostId) => ({
        hostId: hostId || null,
        platform: process.platform,
        clientInstalled: true,
        storePath: process.platform === 'darwin' ? '/fake/ChatStorage.sqlite' : null,
        grant: process.platform === 'darwin' ? 'granted' : null,
        why: null,
        at: clock(),
      }) : undefined,

      // `sendAs: []` adapters get NO send at all — the registry refuses it with
      // the typed `send-not-available` before this is ever reached.
      //
      // P4: the outcome is STEERED BY MARKERS IN THE TEXT, so a suite (and the
      // e2e run, from a real browser) can drive every §9.4 shape through the
      // real engine without a vendor: `[[fake:throw]]` = the adapter died
      // mid-send (a bare throw ⇒ `unknown`), `[[fake:lost]]` = the request
      // left and the answer never came (typed transport + `detail.lost` ⇒
      // `unknown`), `[[fake:refuse]]` = a typed refusal (⇒ `failed`),
      // `[[fake:as-bot]]` = the platform sent it as a bot whatever was asked
      // (the vendor's `sentAs` is the truth the receipt carries). The vendor
      // id is a function of (conversation, idempotency key, text) — a second
      // send with the same key is the same message, as the key promises.
      send: sendAs.length ? async (convId, { text, idemKey, as, replyTo = null, inThread = false, placement = null }) => {
        const s = String(text == null ? '' : text);
        if (/\[\[fake:throw\]\]/.test(s)) throw new Error('fake: socket hung up mid-send');
        if (/\[\[fake:lost\]\]/.test(s)) return { ok: false, code: 'transport', retryable: true, detail: { lost: true, message: 'fake: the request left and the answer never came' } };
        if (/\[\[fake:refuse\]\]/.test(s)) return { ok: false, code: 'forbidden', retryable: false, detail: { reason: 'fake: the fixture refused the send' } };
        if (inThread && /\[\[fake:topic-forbidden\]\]/.test(s)) return { ok: false, code: 'forbidden', retryable: false, detail: { reason: 'fake: this group does not allow replies in threads', why: 'topic-forbidden' } };
        const sentAs = /\[\[fake:as-bot\]\]/.test(s) ? 'bot' : (as || sendAs[0]);
        const vendorMessageId = `sent-${digest(`${convId}|${idemKey}|${s}`)}`;
        const at = clock();
        // lane channel-threads: a reply INTO a thread lands in the parent's TOPIC — ECHOED into the world, so the next
        // page lists it the way the vendor would. quote-vs-topic (2026-09-28): a parent outside any topic (a plain
        // message, a quote) gets a NEW topic minted ON it (Lark `reply_in_thread`: the vendor mints a thread id, the
        // message answered is its root) — never the parent's reply chain, which is a quote, not a thread
        let threadKey = null;
        if (inThread && replyTo) {
          const c = getWorld().get(convId);
          const parent = c && c.records.find((x) => x.vendorId === replyTo);
          const inTopic = !!(parent && typeof parent.threadKey === 'string' && parent.threadKey.startsWith('fthr_'));
          threadKey = inTopic ? parent.threadKey : `fthr_${digest(`${convId}|${replyTo}`)}`;
          const root = inTopic ? (parent.root || parent.vendorId) : replyTo;
          if (c && !c.records.some((x) => x.vendorId === vendorMessageId)) c.records.push({ vendorId: vendorMessageId, at, author: { id: FAKE_SELF, name: 'Me' }, text: s, replyTo, threadKey, root });
        }
        // 2026-09-28: the PLACEMENT the registry handed down rides back as the vendor's word (a `thread+chat` reply is
        // the thread reply above, which a Slack-like vendor also shows in the channel — `alsoInChat`)
        return { ok: true, vendorMessageId, at, sentAs, observed: { senderType: sentAs === 'bot' ? 'app' : 'user', ...(threadKey ? { threadKey } : {}), ...(placement ? { placement } : {}), ...(placement === 'thread+chat' ? { alsoInChat: true } : {}) } };
      } : undefined,
      // R4 (B-6acc): a NEW conversation — the same markers as `send`, the
      // vendor answers with the new thread's id (a function of the key, so a
      // re-send with the same key is the same thread). `record.fakeNoSendScope`
      // = the account holds no send permission (Gmail without a sending scope).
      compose: caps.compose ? async ({ to = [], subject = '', text, idemKey, as } = {}) => {
        const s = String(text == null ? '' : text);
        if (/\[\[fake:throw\]\]/.test(s)) throw new Error('fake: socket hung up mid-send');
        if (/\[\[fake:lost\]\]/.test(s)) return { ok: false, code: 'transport', retryable: true, detail: { lost: true, message: 'fake: the request left and the answer never came' } };
        if (/\[\[fake:refuse\]\]/.test(s)) return { ok: false, code: 'forbidden', retryable: false, detail: { reason: 'fake: the fixture refused the send' } };
        const sentAs = as || sendAs[0];
        const threadId = `new-${digest(`${(to || []).join(',')}|${subject}|${idemKey}`)}`;
        return { ok: true, vendorMessageId: `sent-${digest(`${threadId}|${idemKey}|${s}`)}`, threadId, at: clock(), sentAs, observed: { senderType: 'user' } };
      } : undefined,
      composeCaps: caps.compose ? async () => (record && record.fakeNoSendScope ? { sendAs: [], why: 'send-scope-not-granted', at: clock() } : { sendAs: caps.sendAs.slice(), why: null, at: clock() }) : undefined,
      // `[[fake:landed]]` / `[[fake:not-landed]]` steer the reconcile answer;
      // anything else is honestly `unknown` (the default a real vendor gives
      // when it holds no evidence either way).
      reconcile: sendAs.length ? async (convId, { idemKey, text } = {}) => {
        const s = String(text == null ? '' : text);
        if (/\[\[fake:landed\]\]/.test(s)) return { landed: true, vendorMessageId: `sent-${digest(`${convId}|${idemKey}|${s}`)}`, at: clock(), detail: { how: 'fake-landed' } };
        if (/\[\[fake:not-landed\]\]/.test(s)) return { landed: false, reason: 'fake: the platform holds no such message', detail: { how: 'fake-not-landed' } };
        return { unknown: true, reason: 'fake: no evidence either way', detail: { how: 'fake-unknown' } };
      } : undefined,
    };
  }

  return { kind, caps, create };
}

/** The three modules P0 registers. `fake-push` is deliberately READ-ONLY. */
const fakePoll = makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'], feed: String(process.env.VIBESPACE_CHANNELS_FAKE_FEED || '') === '1' });
const fakePush = makeFakeAdapter({ kind: 'fake-push', receive: 'push', sendAs: [] });
const fakeScan = makeFakeAdapter({ kind: 'fake-scan', receive: 'scan', sendAs: ['user'] });

/**
 * The fake row's Test RUNNER (design §14.3 constraint 1: the consumer owns
 * the runner; the store only dispatches). `shape-only`: zero network. It
 * succeeds or fails on a FIXTURE SWITCH — a key containing "fail" fails —
 * so a failed Test has a leg on a card that ships in P0, with the vendor's
 * words (here: ours) reaching the card escaped.
 */
async function integrationTest({ resolved } = {}) {
  const r = resolved || {};
  if (r.source === 'none') return { ok: false, error: `no key resolved: ${r.why || 'nothing configured'}` };
  const key = String((r.values && r.values.apiKey) || '');
  if (key.length < 4) return { ok: false, error: 'the resolved key is shorter than 4 characters' };
  if (/fail/i.test(key)) return { ok: false, error: `the fixture switch: the resolved key contains "fail" (source: ${r.source})` };
  return { ok: true, detail: { source: r.source, region: (r.values && r.values.region) || null } };
}

module.exports = { makeFakeAdapter, fakePoll, fakePush, fakeScan, worldFor, syntheticKey, toRecord, integrationTest, fixturePng, fixtureMailHtml, FAKE_KINDS: ['fake-poll', 'fake-push', 'fake-scan'], FAKE_EMOJI, FAKE_SELF, seedThreads, seedReactions, FAKE_FEED, FAKE_DMS };
