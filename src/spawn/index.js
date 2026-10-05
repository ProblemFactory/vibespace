/**
 * THE SPAWN-LADDER REGISTRY (decoupling wave 2b, lane dc-seams-server, 2026-10-05;
 * docs/design-cs-unification.md "Remaining 2": the decisions AROUND the spawn line — tool
 * shipping, account placement, adopt-vs-spawn — were per-transport control flow inside
 * ws-create's one 2 400-line create). A machine transport = src/spawn/<id>.js exporting
 * `{ id, terminal(c), chat(c) }` + ONE line in TRANSPORTS below; ws-create asks
 * `spawnFor(host)[sessionMode](c)` and never names a transport. Declared rows, checked here at
 * load (a missing or doubled one throws, never a silent fallback):
 *   hostless    — exactly one member: the ladder of a create that names no host (this machine);
 *   hostDefault — exactly one member: the ladder of a host record that names no `transport`
 *                 (ssh hosts predate the field — exit-proxy's `h.transport || 'ssh'`).
 * A host whose transport no member declares falls to the hostDefault member, exactly as the
 * old `if (h.transport === 'dial') … else …` sent it to ssh.
 */
const TRANSPORTS = [
  require('./local'),
  require('./ssh'),
  require('./dial'),
];

function check(list) {
  const ids = new Set();
  for (const m of list) {
    if (!m || typeof m.id !== 'string' || !m.id) throw new Error('spawn ladder: a member without an id');
    if (ids.has(m.id)) throw new Error(`spawn ladder: duplicate member "${m.id}"`);
    ids.add(m.id);
    for (const k of ['terminal', 'chat']) if (typeof m[k] !== 'function') throw new Error(`spawn ladder "${m.id}": ${k}(c) missing`);
  }
  for (const row of ['hostless', 'hostDefault']) {
    const n = list.filter(m => m[row] === true).length;
    if (n !== 1) throw new Error(`spawn ladder: exactly one member must declare ${row} (found ${n})`);
  }
  return list;
}
check(TRANSPORTS);

/** The ladder for `host` (a hosts.get() record), or this machine's for null. */
function spawnFor(host) {
  if (!host) return TRANSPORTS.find(m => m.hostless);
  return TRANSPORTS.find(m => !m.hostless && m.id === host.transport) || TRANSPORTS.find(m => m.hostDefault);
}

module.exports = { spawnFor, TRANSPORTS, check };
