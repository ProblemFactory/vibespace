// THE ARRIVAL RULE of StateSync (lane statesync-last-arrival, B-cede): may a REMOTE op touch this client's copy of a key?
// The clock is the server's store version — monotonic, one per write — never a wall clock. The server answers every set
// with the version it produced (`state-ack`, src/sync-store.js); a client remembers, per key, its last ACKED set and how
// many of its own sets still await their ack (src/lib/utils.js StateSync — the ONE caller, in _applyOp). Before, every
// remote op landed on arrival: two devices setting one key within a round trip each took the OTHER's set last and ended
// crossed (stage-blank verify r4 Z3: two staged devices on different heroes). Per KEY, not per store: another key's op
// is never this client's set's business (the drafts store holds every chat's draft). PURE — imports nothing.

/** Each row: the case, the verdict, why. The suite prints it; the report quotes it. */
const ARRIVAL_TABLE = Object.freeze([
  Object.freeze({ when: 'the op carries no server version (not a positive integer)', verdict: 'apply', why: 'nothing to judge it by — it lands as before the rule' }),
  Object.freeze({ when: 'the op carries `prepended` > 0 (a server put-back: Stop\'s dropped queue, src/queue-putback.js)', verdict: 'apply', why: 'a PREFIX no own set could contain — the client lands it on its live box and re-saves once, so it is never held behind an own set nor dropped under one (lane stop-refills-composer: an autosave already in flight erased it)' }),
  Object.freeze({ when: 'an own set of this key still awaits its ack', verdict: 'queue', why: 'the version the server gives that set is not known yet — the op waits and is judged when the ack lands (or the socket drops)' }),
  Object.freeze({ when: 'no own acked set of this key', verdict: 'apply', why: 'this client never set the key, or a newer remote op already superseded its set' }),
  Object.freeze({ when: 'version ≤ the own acked set\'s version', verdict: 'drop', why: 'the server ordered this op BEFORE the client\'s own set — it would show an older value than the one the server keeps' }),
  Object.freeze({ when: 'version > the own acked set\'s version', verdict: 'apply', why: 'the server ordered it after the client\'s own set — it is the newer value' }),
]);

const isVersion = (v) => Number.isSafeInteger(v) && v > 0;

/** remote: the op as it arrived ({version, from, prepended?}); own: this client's facts for the op's key — ackedVersion (its last
 *  acked set's version, or none) and pending (an own set of the key awaits its ack). → 'apply' | 'drop' | 'queue'. */
function arrivalVerdict({ remote, own } = {}) {
  if (!remote || !isVersion(remote.version)) return 'apply';
  if (Number.isSafeInteger(remote.prepended) && remote.prepended > 0) return 'apply'; // the delta row: a put-back always lands
  if (own && own.pending) return 'queue';
  if (own && isVersion(own.ackedVersion) && remote.version <= own.ackedVersion) return 'drop';
  return 'apply';
}

module.exports = { ARRIVAL_TABLE, arrivalVerdict };
