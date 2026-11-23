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
const keeps = (id) => anyUnreadable() || namedByTorn(id);
module.exports = { UNREAD, unreadMeta, isUnread, mark, clear, isMarked, factsOf, anyUnreadable, namedByTorn, keeps };
