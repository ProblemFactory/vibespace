'use strict';
/**
 * THE DEVICE AGENT'S NODE RUNTIME (lane device-node-version, 2026-10-22). The Node.js security releases of 2026-10-21
 * (4 HIGH — CVE-2026-111497 the Brotli decoder's out-of-bounds write, CVE-2026-105482 dns.resolve's NUL truncation,
 * CVE-2026-105483 + CVE-2026-106069 TLS hostname-check bypasses; fixed in 22.23.4 / 24.22.1 / 26.12.1). A paired
 * machine's agent runs the node its installer PROVISIONED (<root>/node — the installer's pin) or FOUND (a system node
 * ≥ 18); its hello-ack always said `nodeVersion`, and the hub kept none of it. PURE (imports only the PURE floor table; the hub judges,
 * the Machines card says it):
 *   NODE_FLOORS     THE FACT TABLE — per supported major line, the first release carrying every fix of the advisory
 *                   that set it (ADVISORIES names it): src/runtime-floor.js's, re-exported (lane runtime-floor). A future
 *                   advisory lands THERE (the rows it moves + its entry), never in a vendor call.
 *   runtimeOf       a hello-ack's statement, bounded → {node, openssl, own, platform} (a malformed field ⇒ null: not said)
 *   runtimeVerdict  → {state, node, major, floor, advisory, fix}: `old` = below its line's floor (the card's chip),
 *                   `ok` = at or above it, `unlisted` = a major the table names no floor for (no chip), `unknown` = the
 *                   agent never said (no chip). `fix` of an `old` one: `reinstall` (the installer's own node, or not
 *                   said — running the pairing command again re-provisions it; the agent's self-upgrade, landBundle,
 *                   never changes node) | `system` (a node the machine had — the installer never replaces it)
 *   upgradeLineOf   a system node's upgrade line on that platform (words the person runs on the machine, never an op)
 *   runtimeRow      a host record → the /api/hosts row's `runtime`
 */
// THE FLOOR TABLE is src/runtime-floor.js (lane runtime-floor: ONE table — the hub's own runtime, the updater and this card
// read the same rows; a future advisory moves THAT file). Re-exported here under the names this module always had.
const { ADVISORIES, NODE_FLOORS } = require('./runtime-floor');
const STATES = Object.freeze(['old', 'ok', 'unlisted', 'unknown']);
// the vendor's own upgrade of a node the machine already had (its unit keeps the path; the agent restarts on it when the
// pairing command runs again). A platform not listed ⇒ null: the card says the floor without a line.
const UPGRADE_LINES = Object.freeze({
  darwin: 'brew upgrade node',
  linux: 'sudo apt-get install --only-upgrade nodejs   (dnf: sudo dnf upgrade nodejs · apk: apk upgrade nodejs)',
  win32: 'winget upgrade OpenJS.NodeJS.LTS',
});
const NODE_RE = /^v(\d{1,3})\.(\d{1,4})\.(\d{1,4})$/;
const OPENSSL_RE = /^[0-9A-Za-z.+-]{1,40}$/;
const tripleOf = (v) => { const m = NODE_RE.exec(String(v)); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const below = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** A hello-ack's (or a stored record's) runtime statement → `{node, openssl, own, platform}`, each null when not said. */
function runtimeOf(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    node: typeof r.node === 'string' && NODE_RE.test(r.node) ? r.node : null,
    openssl: typeof r.openssl === 'string' && OPENSSL_RE.test(r.openssl) ? r.openssl : null,
    own: typeof r.own === 'boolean' ? r.own : null,
    platform: typeof r.platform === 'string' && has(UPGRADE_LINES, r.platform) ? r.platform : null,
  };
}

/** `{node, own}` (+ a floor table — NODE_FLOORS by default) → the verdict. */
function runtimeVerdict({ node = null, own = null } = {}, floors = NODE_FLOORS) {
  const t = node ? tripleOf(node) : null;
  if (!t) return { state: 'unknown', node: null, major: null, floor: null, advisory: null, fix: null };
  const row = has(floors, t[0]) ? floors[t[0]] : null;
  if (!row) return { state: 'unlisted', node, major: t[0], floor: null, advisory: null, fix: null };
  const old = below(t, tripleOf('v' + row.floor));
  return { state: old ? 'old' : 'ok', node, major: t[0], floor: row.floor, advisory: row.advisory, fix: old ? (own === false ? 'system' : 'reinstall') : null };
}

const upgradeLineOf = (platform) => (has(UPGRADE_LINES, platform) ? UPGRADE_LINES[platform] : null);

/** A host record → the row's `runtime`: the verdict + what the agent said (`deviceRuntime`, kept by hosts.noteRuntime) +
 *  the advisory's date and ids + a system node's upgrade line. A record whose agent never said ⇒ `unknown`. */
function runtimeRow(h) {
  const rt = runtimeOf(h && h.deviceRuntime);
  const v = runtimeVerdict(rt);
  const adv = v.advisory && has(ADVISORIES, v.advisory) ? ADVISORIES[v.advisory] : null;
  const at = h && h.deviceRuntime && Number.isFinite(Number(h.deviceRuntime.at)) ? Number(h.deviceRuntime.at) : null;
  return { ...v, openssl: rt.openssl, own: rt.own, at, date: adv ? adv.date : null, cves: adv ? adv.cves.slice() : null, line: v.fix === 'system' ? upgradeLineOf(rt.platform) : null };
}

module.exports = { ADVISORIES, NODE_FLOORS, STATES, UPGRADE_LINES, runtimeOf, runtimeVerdict, upgradeLineOf, runtimeRow };
