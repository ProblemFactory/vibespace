'use strict';
/**
 * THE NODE RUNTIME FLOOR — ONE table (lane runtime-floor, 2026-10-22; the owner on the Node.js security release:
 * «每次有漏洞都要更新 pod 也太麻烦了吧 有没有更好的解决方案？»). Per supported major line, the first release that carries
 * every fix of the advisory that set it. EVERY reader asks HERE: the hub's boot line and its Diagnostics row, the updater
 * (scripts/runtime-check.mjs — below the floor ⇒ the product provisions the fixed version for itself,
 * src/node-runtime.js), and a paired machine's Machines-card chip (src/device-runtime.js re-exports this table — lane
 * device-node-version wrote it first; moved here so there is one). A Node security release = ONE commit that moves the
 * rows below (+ its ADVISORIES entry) and the product's own update — never an image rebuild or a pod rollout.
 * PURE: imports nothing.
 *   ADVISORIES   id → {date, url, cves}
 *   NODE_FLOORS  major → {floor, advisory}   (the shape device-runtime's verdict reads)
 *   ARCHIVES     'v<floor>' → the SHASUMS256.txt lines of its six archives (linux / darwin × x64 / arm64 tar.gz, win
 *                x64 / arm64 zip) — the hash lives in this repo; archiveSha(version, file) reads one
 *   verdict(v)   'v22.20.0' → {state: 'ok' | 'below-floor' | 'unknown-major' | 'unknown', version, major, floor,
 *                wanted (the fixed release to provision — below-floor only), advisory}
 */
const ADVISORIES = Object.freeze({
  'nodejs-2026-10-21': Object.freeze({
    date: '2026-10-21',
    url: 'https://nodejs.org/en/blog/vulnerability/october-2026-security-releases',
    cves: Object.freeze(['CVE-2026-111497', 'CVE-2026-105482', 'CVE-2026-105483', 'CVE-2026-106069']),
  }),
});
const NODE_FLOORS = Object.freeze({
  22: Object.freeze({ floor: '22.23.4', advisory: 'nodejs-2026-10-21' }),
  24: Object.freeze({ floor: '24.22.1', advisory: 'nodejs-2026-10-21' }),
  26: Object.freeze({ floor: '26.12.1', advisory: 'nodejs-2026-10-21' }),
});
// THE ARCHIVES — per floor version, the sha256 of each release archive the provisioner downloads (node-v<ver>-<os>-<arch>
// .tar.gz; win: .zip), lines COPIED from nodejs.org/dist/<v>/SHASUMS256.txt: v22.23.4 + v24.22.1 by 主开发 2026-10-22 02:0xZ
// (cross-checked against the hub's independently verified download of 24.22.1), v26.12.1 by lane runtime-floor
// 2026-10-22 06:39Z (fetched once over HTTPS). The hash lives in THIS repo: src/node-runtime.js checks an archive against
// these lines FIRST and the mirror's SHASUMS256.txt second, and a version / platform with no line here is NEVER
// provisioned — VIBESPACE_NODE_MIRROR can serve only the bytes this file names. A security release adds its six lines.
const ARCHIVES = Object.freeze({
  'v22.23.4': Object.freeze([
    'b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406  node-v22.23.4-linux-x64.tar.gz',
    'f7a1e486dbc8b286847815b477d4fb5e9fb963ed4489c3e1588853d685f589f9  node-v22.23.4-linux-arm64.tar.gz',
    'c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428  node-v22.23.4-darwin-arm64.tar.gz',
    'efcc2b0db6f94bf53eddb038fe2b370277a042bd29e4f19b8f8e23598795b819  node-v22.23.4-darwin-x64.tar.gz',
    'cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20  node-v22.23.4-win-x64.zip',
    'a8b8cd79cbbb3062435f449591d98dd63730bbbf30ce2d7cc3a6376c236cb111  node-v22.23.4-win-arm64.zip',
  ]),
  'v24.22.1': Object.freeze([
    'eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c  node-v24.22.1-linux-x64.tar.gz',
    '33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3  node-v24.22.1-linux-arm64.tar.gz',
    '89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7  node-v24.22.1-darwin-arm64.tar.gz',
    'd132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035  node-v24.22.1-darwin-x64.tar.gz',
    'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5  node-v24.22.1-win-x64.zip',
    'a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171  node-v24.22.1-win-arm64.zip',
  ]),
  'v26.12.1': Object.freeze([
    '0fd1eb7770598f52a21995edf6ed35fc690400fa437c2386af329519e9143132  node-v26.12.1-linux-x64.tar.gz',
    'a6c01af459dd8972ab3fb08ee5da81244d26ba8c4944a62d5bbba8c597ae154f  node-v26.12.1-linux-arm64.tar.gz',
    '1901d539912c02afa10d1cc126943a8855a7eedebe830119463470db5e6c59e8  node-v26.12.1-darwin-arm64.tar.gz',
    'b85c2ea4420ad0bc4abf2dc6cf1f55130ed681f1cabf60cf3f526e4c9e2712ff  node-v26.12.1-darwin-x64.tar.gz',
    'b3efd5c70cba3308ed46e7e699a9b8aac075bbc6b027fcb39c84c31acc25e2b4  node-v26.12.1-win-x64.zip',
    '34567581ee63967b37afb6b7a0cc63a2d550a43d5d838adb75982d7e356f2e2c  node-v26.12.1-win-arm64.zip',
  ]),
});
const VERSION_RE = /^v?(\d{1,3})\.(\d{1,4})\.(\d{1,4})$/;
const tripleOf = (v) => { const m = VERSION_RE.exec(String(v == null ? '' : v).trim()); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
/** a < b (both triples). */
const below = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
/** Compare two version strings: -1 | 0 | 1 (null when either is not a version). */
function compare(a, b) { const x = tripleOf(a), y = tripleOf(b); if (!x || !y) return null; return below(x, y) ? -1 : below(y, x) ? 1 : 0; }
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** A node version (process.version) against the table. */
function verdict(version, floors = NODE_FLOORS) {
  const t = tripleOf(version);
  if (!t) return { state: 'unknown', version: null, major: null, floor: null, wanted: null, advisory: null };
  const v = `v${t.join('.')}`;
  const row = has(floors, t[0]) ? floors[t[0]] : null;
  if (!row) return { state: 'unknown-major', version: v, major: t[0], floor: null, wanted: null, advisory: null };
  const low = below(t, tripleOf(row.floor));
  return { state: low ? 'below-floor' : 'ok', version: v, major: t[0], floor: `v${row.floor}`, wanted: low ? `v${row.floor}` : null, advisory: row.advisory };
}
/** The sha256 THIS repo names for a floor version's archive `file` (e.g. node-v24.22.1-linux-x64.tar.gz) → hex | null
 *  (no line ⇒ the provisioner refuses before any download). `archives` = the table (a suite hands its fixture rows). */
function archiveSha(version, file, archives = ARCHIVES) {
  const rows = archives && Object.prototype.hasOwnProperty.call(archives, version) ? archives[version] : null;
  if (!Array.isArray(rows)) return null;
  for (const line of rows) { const m = /^([0-9a-f]{64})  (\S+)$/.exec(String(line)); if (m && m[2] === file) return m[1]; }
  return null;
}
/** The advisory a verdict names → {id, date, url, cves} | null. */
function advisoryOf(id) { return id && has(ADVISORIES, id) ? { id, ...ADVISORIES[id], cves: ADVISORIES[id].cves.slice() } : null; }

module.exports = { ADVISORIES, NODE_FLOORS, ARCHIVES, VERSION_RE, verdict, archiveSha, advisoryOf, compare, tripleOf };
