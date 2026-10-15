'use strict';
// THE HOOK INJECTION'S SEEN MARKS SURVIVE A RESTART (B-86d3 ①, lane hook-seen-marks). PURE — no requires.
// The per-session "already delivered this" marks of src/agent-routes.js (`_groupSeenAt` / `_ctxSig` / `_preambleSeen` /
// `_toolsIntroSeen` / `_mgrIntroSeen` / `_jobsEventsSeenTs`) lived on the in-memory session object only, so every
// VibeSpace restart forgot them: the first prompt of each live conversation re-sent the preamble, the intros and the FULL
// context of every Task Group it belongs to (≈ 108 KB ≈ 30–40k tokens across 13 sessions, measured by channel-jump
// verify r8) although the conversation had all of it. Now the route writes them to the session meta (`seenMarks`) when an
// injection is SENT, and boot-restore's sessionFromMeta (the one meta→session spelling of all three restore paths) puts
// them back. What a restart then re-sends is what the marks say changed:
//   · a group whose content instant AND context-folder signature are unchanged → not repeated (one pointer line);
//   · a group that changed → its DIFF, as without a restart: the diff snapshot `_groupSnap` is persisted LITE — the
//     store's snapshot carries every backlog item's text (26–187 KB per real group), but the diff only ever speaks of
//     the items THIS session parked or claimed, so the lite one keeps those (≤ 24, ≤ 8 KB, else none: that group is
//     re-sent whole once, the "was UPDATED" path). Measured on 13 sessions × 3 real-shape groups with the busy group
//     moved: marks alone re-sent 121 KB (each changed group whole, its newest activity cut by the cap); with the lite
//     snapshot the diff;
//   · the tools intro / manager intro → their mark is the BUILD VERSION that delivered them: a new build teaches once;
//   · the user's preamble → its mark is already the hash of its text (a new build does not change what the agent saw).
// The folder signature (path:size:mtime of up to 200 files, ~7 KB) is persisted as a DIGEST; the route trades a held
// digest for the live signature when they match (`liveSig`) and treats a mismatch as a changed folder (re-sent whole:
// the file-level diff needs the old signature itself).
// A meta with no marks (written before this lane) restores nothing: that session behaves as before — everything once.

const MARKS_VERSION = 1;
const MAX_GROUPS = 64;          // a session's mark maps keep at most this many groups (the newest by seen instant)
const SNAP_MAX_ITEMS = 24;      // a lite snapshot keeps at most this many of the session's own backlog items…
const SNAP_MAX_BYTES = 8192;    // …in at most this many bytes — past either, no snapshot (that group is re-sent whole once)
const DIGEST_RE = /^#[0-9a-f]{14}$/;

/** 53-bit digest of a string (two 32-bit multiply-xor lanes, cyrb53) as `#` + 14 hex — the persisted form of a
 *  context-folder signature. Equality is all it is ever asked for. */
function sigDigest(str) {
  const s = String(str == null ? '' : str);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return '#' + n.toString(16).padStart(14, '0');
}
const isSigDigest = (v) => typeof v === 'string' && DIGEST_RE.test(v);

/** The signature the route should hold for a group: a restored DIGEST becomes the live signature when it matches
 *  (unchanged folder), and stays a digest when it does not (≠ any live signature ⇒ the folder reads as changed). */
function liveSig(held, sig) {
  return isSigDigest(held) && held === sigDigest(sig) ? sig : held;
}

/** The diff snapshot (task-groups snapshotForDiff) cut to what diffChanges can say to THIS session (`key`): its backlog
 *  lines are only ever about items the session parked or claimed (`relevant`), so the others are dropped; null when
 *  even that is too big (or no snapshot / no key). */
function liteSnap(snap, key) {
  if (!key || !snap || typeof snap !== 'object' || typeof snap.objHash !== 'string') return null;
  const mine = (Array.isArray(snap.backlog) ? snap.backlog : []).filter((b) => b && (b.addedBy === key || (Array.isArray(b.claimedBy) && b.claimedBy.includes(key))));
  if (mine.length > SNAP_MAX_ITEMS) return null;
  const out = { title: typeof snap.title === 'string' ? snap.title : '', objHash: snap.objHash, contextDir: snap.contextDir || null, backlog: mine, lastProgressAt: Number(snap.lastProgressAt) || 0, of: key };
  return JSON.stringify(out).length <= SNAP_MAX_BYTES ? out : null;
}
const snapOk = (v) => !!v && typeof v === 'object' && typeof v.objHash === 'string' && typeof v.title === 'string' && Array.isArray(v.backlog) && v.backlog.length <= SNAP_MAX_ITEMS
  && typeof v.lastProgressAt === 'number' && typeof v.of === 'string' && JSON.stringify(v).length <= SNAP_MAX_BYTES;

const finiteOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const shortStr = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const isGroupId = (k) => typeof k === 'string' && k.length > 0 && k.length <= 120;

/** The marks to persist, read off a live session. `version` = the running build (package.json), `key` = the session's
 *  status key (the lite snapshots are cut for it). Deterministic for the same session state, so the route writes only
 *  when it differs from the last write. */
function marksOf(s, version, key) {
  const seen = (s && s._groupSeenAt && typeof s._groupSeenAt === 'object') ? s._groupSeenAt : {};
  const sigs = (s && s._ctxSig && typeof s._ctxSig === 'object') ? s._ctxSig : {};
  const ids = Object.keys(seen).filter((k) => isGroupId(k) && finiteOrNull(seen[k]) !== null)
    .sort((a, b) => seen[b] - seen[a] || (a < b ? -1 : 1)).slice(0, MAX_GROUPS).sort();
  const snaps = (s && s._groupSnap && typeof s._groupSnap === 'object') ? s._groupSnap : {};
  const groupSeenAt = {}, ctxSig = {}, snap = {};
  for (const k of ids) {
    groupSeenAt[k] = seen[k];
    if (typeof sigs[k] === 'string') ctxSig[k] = sigs[k] === '' || isSigDigest(sigs[k]) ? sigs[k] : sigDigest(sigs[k]);
    const lite = snaps[k] && snaps[k].of === key && snapOk(snaps[k]) ? snaps[k] : liteSnap(snaps[k], key);   // a restored lite one is already cut
    if (lite) snap[k] = lite;
  }
  return {
    v: MARKS_VERSION,
    groupSeenAt,
    ctxSig,
    snap,
    preamble: shortStr(s && s._preambleSeen, 64),
    toolsIntro: s && s._toolsIntroSeen ? String(version || '') : null,
    mgrIntro: s && s._mgrIntroSeen ? String(version || '') : null,
    jobsTs: finiteOrNull(s && s._jobsEventsSeenTs),
  };
}

/** The session fields a persisted `seenMarks` restores under the running build `version` — {} for no / foreign marks
 *  (that session then behaves as before: everything once). `_marksRestored` lets the first prompt name the groups it
 *  does not repeat. */
function restoreMarks(raw, version) {
  if (!raw || typeof raw !== 'object' || raw.v !== MARKS_VERSION) return {};
  const groupSeenAt = {}, ctxSig = {}, groupSnap = {};
  const seen = raw.groupSeenAt && typeof raw.groupSeenAt === 'object' ? raw.groupSeenAt : {};
  const sigs = raw.ctxSig && typeof raw.ctxSig === 'object' ? raw.ctxSig : {};
  const snaps = raw.snap && typeof raw.snap === 'object' ? raw.snap : {};
  for (const k of Object.keys(seen).slice(0, MAX_GROUPS)) {
    if (!isGroupId(k) || finiteOrNull(seen[k]) === null) continue;
    groupSeenAt[k] = seen[k];
    if (sigs[k] === '' || isSigDigest(sigs[k])) ctxSig[k] = sigs[k];
    if (snapOk(snaps[k])) groupSnap[k] = snaps[k];
  }
  const v = String(version || '');
  const out = {
    _groupSeenAt: groupSeenAt,
    _ctxSig: ctxSig,
    _groupSnap: groupSnap,
    _preambleSeen: shortStr(raw.preamble, 64) || undefined,
    _toolsIntroSeen: !!v && raw.toolsIntro === v,
    _mgrIntroSeen: !!v && raw.mgrIntro === v,
    _jobsEventsSeenTs: finiteOrNull(raw.jobsTs) || undefined,
    _marksRestored: Object.keys(groupSeenAt).length > 0,
  };
  return out;
}

module.exports = { MARKS_VERSION, MAX_GROUPS, SNAP_MAX_ITEMS, SNAP_MAX_BYTES, sigDigest, isSigDigest, liveSig, liteSnap, marksOf, restoreMarks };
