'use strict';
// SESSION-META UNDER THE STORE-READ LAW (主开发 r3137, lane bl-chat-c — the store census's FORM 3, rank 1). A conversation's record
// (data/session-meta/<sock>.json, one file a conversation: a FAMILY) whose read FAILED or whose bytes do NOT PARSE is UNREAD — never
// the empty record «not there» (ENOENT) is. An unread record is an empty object carrying a symbol mark; a spread
// (`{ ...readSessionMeta(s), field }`, the writers' shape) carries the mark on, so the one door that writes (session-stdout.js
// writeSessionMeta) writes nothing over it, and every remover can tell it from a record that is not there.
// THE FAMILY's REGISTRY (this process): which records are unread now. A sweep that cannot tell which link, file or folder an unread
// record names (the pool-link sweep, the aged attach configs and wrapper files) asks keeps(id): nothing is removed while a record
// could not be read at all, and nothing a kept torn record's bytes name.
// No fs here; node builtins only.
const UNREAD = Symbol.for('vibespace.session-meta.unread');
const unread = new Map();   // sockName → { code, torn, since }
/** an UNREAD record: empty of fields, its facts under the mark */
function unreadMeta(facts) { return { [UNREAD]: Object.freeze({ ...(facts || {}) }) }; }
/** is `m` an unread record (or a spread of one)? */
const isUnread = (m) => !!(m && typeof m === 'object' && m[UNREAD]);
function mark(sock, facts) { if (!unread.has(sock)) unread.set(sock, { ...(facts || {}), since: Date.now() }); return unread.get(sock); }
function clear(sock) { return unread.delete(sock); }
const isMarked = (sock) => unread.has(sock);
const factsOf = (sock) => unread.get(sock) || null;
/** r3141: a TORN record stays unread (kept, with its copy) until a whole record restates it — its torn bytes are kept HERE (from its
 *  own read: no second read) so a sweep can ask whether they name an id */
const anyUnreadable = () => { for (const f of unread.values()) if (!f.torn) return true; return false; };
const namedByTorn = (id) => { const s = String(id || ''); if (!s) return false; for (const f of unread.values()) if (f.torn && typeof f.text === 'string' && f.text.includes(s)) return true; return false; };
/** the sweeps' ONE question (r3137 (2), r3141): keep `id`? — yes while any record could not be read at all (it may name anything),
 *  or when a kept torn record's bytes name it */
// r3199: the ids of records that read again THIS run — a conversation left un-adopted at its start (its record unread then) keeps its
// attach config and its wrapper files from the aged sweeps for the rest of the run
const liftedIds = new Set();
function liftedId(sock, id) { if (id) liftedIds.add(String(id)); if (liftedIds.size > 4096) liftedIds.delete(liftedIds.values().next().value); }
const keeps = (id) => anyUnreadable() || namedByTorn(id) || liftedIds.has(String(id || ''));
/** r3199: the family's ONE notice reads these rows — the record's file by its base name and the conversation's NAME where it is known
 *  (its live session, else its torn bytes), never a path, never content */
function rows() {
  const out = [];
  for (const [sock, f] of unread) {
    let name = f.name || null;
    if (!name && f.torn && typeof f.text === 'string') { const m = /"name"\s*:\s*"([^"\\]{1,120})"/.exec(f.text); if (m) name = m[1]; }
    out.push(Object.freeze({ file: sock + '.json', name, code: f.code || null, since: f.since, torn: !!f.torn, copy: f.copy || null, removalOwed: !!f.removalOwed }));   // removalOwed (r3245): a removal asked meanwhile waits for its read, in this run only
  }
  return Object.freeze(out);
}
module.exports = { UNREAD, unreadMeta, isUnread, mark, clear, isMarked, factsOf, anyUnreadable, namedByTorn, keeps, liftedId, rows };
