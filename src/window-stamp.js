'use strict';
// THE `.window-<key>` SIDECAR'S OWNER (lane oat-identity-fix-r3, verify r3 F-R2) — the account's ESTABLISHED weekly window:
// the anchor the reading guard files by (src/server/usage-pool-engine.js establishedWindows) and the stamp a long-lived
// token's identity is judged against (src/oat-identity-model.js identityOf). ONE writer, ONE reader, here. The standing
// identity repair wrote this file through its own atomic write with no producer, and the census that pinned a hand-listed
// set of writers never saw it: every token row lost its identity within the hour. The NAME stays PURE in reading-lag
// (windowSidecarName — suites and probes spell fixtures with it); in src/ nothing but this file may say it, and no other
// file may build a `.window-` literal (test-oat-identity §6: a GREP-DERIVED census, every occurrence is a row, a row
// outside this file's writer and reader is RED — a planted second writer is the control).
//
// THE PRODUCER IS MANDATORY — WHO produced the window the stamp states:
//   'login'           the row's own sign-in (its ⟳ panel, a K-run of its readings, the login proving a window)
//   'oat:<gen>'       a generation of its long-lived token ('oat:?' = one we cannot name)
//   'repair:<source>' the standing identity repair re-wrote a stamp it AGREED with — <source> = that stamp's producer
//                     (login · oat:<gen> · legacy · unknown · repair)
//   null              nobody can tell (a conversation whose road is unknown, a repair whose evidence names no producer)
// A missing one THROWS; a malformed one THROWS. A stamp the login did not write CARRIES the row's identity it replaces
// (`login` — PURE identityCarry over the stamp on disk NOW, never a memo: verify r3 L-R3), so no writer ever demotes a
// row's proven identity; a login stamp carries nothing.
const path = require('path');
const { windowSidecarName } = require('./reading-lag.js');
const { identityCarry } = require('./oat-identity-model.js');

const PRODUCER = /^(login|oat:(\d+|\?)|repair:(login|oat:(\d+|\?)|legacy|unknown|repair))$/;
/** a producer the ONE writer accepts: login · oat:<gen> · repair:<source> · null (unknown) */
function isWindowProducer(p) { return p === null || (typeof p === 'string' && PRODUCER.test(p)); }

/** THE ONE READER: the account's `.window-` stamp, or null (absent, unreadable, not an object) */
function readWindowStamp(cacheDir, key) {
  // through the cache module's reader (lane lg-store-writes, B-0248 U6.3), required here as the writer below is (no cycle at load)
  // MG1 (r2929): inside a migration's run a stamp there and unread (or torn) throws — not run; every other reader keeps «null»
  try { const j = require('./usage-cache-write.js').readCacheJson(path.join(cacheDir, windowSidecarName(key))); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch (e) { require('./migration-reads.js').absentOr(e, windowSidecarName(key)); return null; }
}

/** THE ONE WRITER. `producer` is mandatory (see above; undefined or malformed ⇒ throws). The stamp's own `producer` /
 *  `login` fields are never trusted: the producer is the argument, the carry is computed here. → true when written. */
function writeWindowStamp(cacheDir, key, stamp, producer) {
  if (producer === undefined) throw new Error('a .window- stamp names its producer: login | oat:<gen> | repair:<source> | null (nobody can tell)');
  if (!isWindowProducer(producer)) throw new Error('not a .window- producer: ' + String(JSON.stringify(producer)).slice(0, 60));
  if (!key || !stamp || typeof stamp !== 'object' || Array.isArray(stamp)) throw new Error('a .window- stamp is an object on a key');
  const { producer: _p, login: _l, ...rest } = stamp;
  const carried = producer === 'login' ? null : identityCarry(readWindowStamp(cacheDir, key));
  const written = { ...rest, producer, ...(carried ? { login: carried } : {}) };
  const ok = require('./usage-cache-write.js').writeSidecar(cacheDir, windowSidecarName(key), written);
  if (ok) for (const fn of _hearers) { try { fn(cacheDir, key, written); } catch { } }
  return ok;
}

/** WHO KEEPS A STAMP IN MEMORY HEARS EVERY WRITE (B-6a92 r5, 主开发 r677): the engine holds a roster account's stamp it read
 *  once (no cache file yet) and renews it here — `fn(cacheDir, key, stamp as written)` after each landed write, never before.
 *  Bounded: the oldest hearer is dropped past 64 (each engine instance registers one). */
const _hearers = [];
function onStampWritten(fn) { if (typeof fn === 'function' && !_hearers.includes(fn)) { _hearers.push(fn); if (_hearers.length > 64) _hearers.shift(); } }

module.exports = { readWindowStamp, writeWindowStamp, isWindowProducer, onStampWritten };
