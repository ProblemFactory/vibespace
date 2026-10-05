'use strict';
/**
 * A PERSON'S REAL PICTURE ON EVERY CHANNEL SURFACE (lane channel-avatars, B-5fe1 — the owner, 2026-10-04: "你还得看看
 * 那个头像获取相关功能是否正常，我怎么还是看不到每个人的头像"). docs/design-communication-panel.zh.md §23 R3b.
 *
 * PURE — imports NOTHING (CJS: the engine requires it, the bundle imports it, the suites load it). The engine asks
 * HERE, and nowhere else:
 *   memoFacts(memo, now)   what the account's on-disk memo (data/channels/<account>/avatars/) says for ONE author:
 *                          `cached` (a picture younger than REFRESH_MS — served whatever the budget says), `stale`
 *                          (an older picture: served meanwhile, asked again), `remembered` (a refusal still inside
 *                          its TTL — "no picture", a refused scope, a vendor refusal: no vendor call). The facts go
 *                          straight into channel-attachments' ONE order (`fetchVerdict`) — never a second spelling.
 *   refusalTtlMs(code, why)   how long a refusal is remembered: the person has NO picture → NONE_TTL_MS; the token's
 *                          scope refused the profile → SCOPE_TTL_MS (a re-authorization clears the memo sooner);
 *                          anything else → channel-attachments' negativeTtlMs (0 = never remembered).
 *   sniffImage(bytes)      the content type FROM THE BYTES (png / jpeg / gif / webp), never the vendor's header;
 *                          anything else (svg is script) is no picture.
 *   warmList(authors, known)   the authors a surface asks for when it opens: deduped, the ones already known
 *                          dropped, at most WARM_MAX — never a whole-account sweep.
 *   memoKey(kind, id) / keyOf(key)   lane channels-list-polish: ONE picture is (account, kind, id) — `person` keeps its
 *                          bare id (the memo on disk since lane channel-avatars), a group chat is `chat~<id>`, a bot
 *                          `bot~<id>`; the route's `author` IS this key.
 *   selfOf / stampSelf / peerOf   lane channels-list-polish (the owner, 2026-10-04: "这个是我的头像，却展示在 Bob 私聊里"):
 *                          a direct chat's PEER is the author that is not the account's identity, and the identity is a
 *                          RESOLVED fact (the adapter's own id, or an author a record marked `isSelf`) — never a guess:
 *                          unknown ⇒ no peer (initials), never the owner's face.
 *   nameLadder(facts) / reaskDue(memo, now)   an author with an EMPTY name is named by the chat's member list, then the
 *                          name a message carries for the sender, then the contact profile — the id only when all three
 *                          said nothing; a nameless one is asked again on a schedule (a refusal kept with its reason).
 * The picture is served by OUR route only (`GET /api/channels/avatar?account=&author=`, ≤ AVATAR_MAX_BYTES); a vendor
 * URL (it may carry a token) never reaches the DOM. An avatar is paint: the initials stay for an author with no picture.
 */
const AVATAR_MAX_BYTES = 256 * 1024;
const REFRESH_MS = 30 * 24 * 3600e3;
const NONE_TTL_MS = 7 * 24 * 3600e3;
const SCOPE_TTL_MS = 6 * 3600e3;
const WARM_MAX = 40;
const AUTHOR_MAX = 128;
const AVATAR_KINDS = Object.freeze(['person', 'chat', 'bot']);
const REASK_MS = 6 * 3600e3;

/** An author key the route accepts: 1…AUTHOR_MAX printable characters, no path segment. */
function authorOk(id) {
  const s = typeof id === 'string' ? id : '';
  return s.length > 0 && s.length <= AUTHOR_MAX && !/[\u0000-\u001f\u007f/\\]/.test(s) && s !== '.' && s !== '..';
}

/** `memo` = `{meta:{at, mime, bytes}}` (a picture) or `{meta:{code, error, until}}` (a refusal) or null. */
function memoFacts(memo, now) {
  const m = memo && memo.meta && typeof memo.meta === 'object' ? memo.meta : null;
  if (!m) return { cached: false, stale: false, remembered: null };
  if (m.code) {
    const until = Number(m.until) || 0;
    return { cached: false, stale: false, remembered: until > now ? { code: String(m.code), error: String(m.error || ''), until } : null };
  }
  const at = Number(m.at) || 0;
  const fresh = now - at < REFRESH_MS && at <= now + 60e3;
  return { cached: fresh, stale: !fresh, remembered: null };
}

/** How long ONE refusal answered by a vendor fetch is remembered (0 = not at all). `negativeTtlMs` = the
 *  attachments' rule (channel-attachments.js), handed in so this module stays import-free. */
function refusalTtlMs(code, why, negativeTtlMs, opts = {}) {
  if (code === 'not-found' && why === 'no-picture') return NONE_TTL_MS;
  if (code === 'forbidden' && why === 'scope') return SCOPE_TTL_MS;
  return typeof negativeTtlMs === 'function' ? negativeTtlMs(code, opts) : 0;
}

/** The raster type the bytes ARE, or null. */
function sniffImage(b) {
  if (!b || typeof b.length !== 'number' || b.length < 12) return null;
  const at = (i) => b[i];
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38 && (at(4) === 0x37 || at(4) === 0x39) && at(5) === 0x61) return 'image/gif';
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'image/webp';
  return null;
}

/** The authors a surface warms: `authors` = [{account, author}] in draw order; `known(key)` = already answered. */
function warmList(authors, known = () => false) {
  const out = [], seen = new Set();
  for (const a of Array.isArray(authors) ? authors : []) {
    if (out.length >= WARM_MAX) break;
    if (!a || !a.account || !authorOk(a.author)) continue;
    const k = `${a.account}\n${a.author}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (known(k)) continue;
    out.push({ account: String(a.account), author: a.author });
  }
  return out;
}

/** The capability row as a surface reads it: `{fetch, why, kinds, kindsWhy}` (`why` = the adapter's `avatarsWhy` when it
 *  is null; `kinds` = which pictures it fetches — `caps.avatarKinds`, a person's only when unsaid; `kindsWhy` = the
 *  adapter's sentence for the kinds it cannot fetch, e.g. a bot's picture no user sign-in reads). */
function avatarRow(caps) {
  const c = caps || {};
  if (c.avatars !== 'fetch') return { fetch: false, why: String(c.avatarsWhy || 'no-avatars'), kinds: [], kindsWhy: null };
  const kinds = Array.isArray(c.avatarKinds) ? AVATAR_KINDS.filter((k) => c.avatarKinds.includes(k)) : ['person'];
  return { fetch: true, why: null, kinds, kindsWhy: typeof c.avatarKindsWhy === 'string' && c.avatarKindsWhy ? c.avatarKindsWhy : null };
}

/** The memo / flight / route key of ONE picture (account-scoped by the caller). */
function memoKey(kind, id) {
  const k = AVATAR_KINDS.includes(kind) ? kind : 'person';
  return k === 'person' ? String(id || '') : `${k}~${String(id || '')}`;
}
/** The (kind, id) a route key names; a person's key is its bare id. */
function keyOf(key) {
  const s = String(key || '');
  const m = /^(chat|bot)~(.+)$/.exec(s);
  return m ? { kind: m[1], id: m[2] } : { kind: 'person', id: s };
}

/** THE ACCOUNT'S OWN ID as a resolved fact: `self` (the adapter's), else an author a record marked `isSelf`; else null. */
function selfOf(authors, self = null) {
  if (typeof self === 'string' && self) return self;
  const a = (Array.isArray(authors) ? authors : []).find((x) => x && x.isSelf && x.id);
  return a ? String(a.id) : null;
}
/** Every author of the account's own id wears `isSelf` — at index time AND at read time (an old index heals unrebuilt).
 *  The same array when nothing changed. */
function stampSelf(authors, self) {
  const list = Array.isArray(authors) ? authors : [];
  if (typeof self !== 'string' || !self) return list;
  let changed = false;
  const out = list.map((a) => { if (a && String(a.id || '') === self && !a.isSelf) { changed = true; return { ...a, isSelf: true }; } return a; });
  return changed ? out : list;
}
/** A DIRECT CHAT'S OTHER PERSON: the first author that is not the account's identity; null when the identity is not
 *  known (no picture — initials — never the owner's own face). */
function peerOf(authors, self = null) {
  const me = selfOf(authors, self);
  if (!me) return null;
  const p = (Array.isArray(authors) ? authors : []).find((a) => a && a.id && !a.isSelf && String(a.id) !== me);
  return p && authorOk(String(p.id)) ? String(p.id) : null;
}

/** THE NAME RE-ASK LADDER: `{name, member, sender, profile, id}` → `{name, from}` — the record's own name, the chat's
 *  member list, the sender name a message carries, the contact profile, and the id only when nothing else is known. */
function nameLadder(f = {}) {
  for (const from of ['name', 'member', 'sender', 'profile']) {
    const v = typeof f[from] === 'string' ? f[from].replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
    if (v) return { name: v.slice(0, 200), from };
  }
  return { name: String(f.id || '').slice(0, AUTHOR_MAX), from: 'id' };
}
/** Is a NAMELESS author asked again now? `memo` = `{at}` (asked, nothing named) or `{at, until, why}` (a refusal kept
 *  with its reason) or null (never asked) — on a schedule, never on every draw. */
function reaskDue(memo, now) {
  if (!memo || typeof memo !== 'object') return true;
  if (Number(memo.until) > 0) return now >= Number(memo.until);
  return now - (Number(memo.at) || 0) >= REASK_MS;
}

module.exports = { AVATAR_MAX_BYTES, REFRESH_MS, NONE_TTL_MS, SCOPE_TTL_MS, WARM_MAX, AUTHOR_MAX, AVATAR_KINDS, REASK_MS, authorOk, memoFacts, refusalTtlMs, sniffImage, warmList, avatarRow, memoKey, keyOf, selfOf, stampSelf, peerOf, nameLadder, reaskDue };
