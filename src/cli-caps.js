'use strict';
// CLI CAPABILITIES A MEASUREMENT GRANTS PER VERSION (lane pool-oat-measure, design q-035).
//
// oatInFile — may a pool member's LONG-LIVED token sit in its credential FILE
// (`claudeAiOauth.accessToken = <oat>`, a far `expiresAt`, NO refreshToken) and be
// spent by the CLI like a login? Only on a CLI version that
// scripts/measure-claude-cred-read.mjs (`--variant oat --write-fixture`, the
// loopback mock + fake tokens) measured green on the three variants the design
// leans on (§5 gate 5):
//   oat-file         every request's bearer is the file's oat; nothing refreshes; nothing writes the file
//   oat-file-401     a 401 never makes the CLI rewrite, blank or delete the file (invariant 4)
//   oat-file-switch  the pool's link moves login member → oat member → back; each next turn carries the
//                    member the link names; neither file is written
// Any other version — a newer one too — is false: the pool keeps escaping oat-only
// members (today's behavior) until someone measures that CLI.
//
// PURE: imports nothing, reads nothing — the caller hands in the parsed fixture
// (scripts/fixtures/oat-in-file.json). ONE RECORD PER MEASURED VERSION (lane oat-in-file-2-1-306,
// 2026-10-21: 2.1.296 + 2.1.306), keyed by the exact version:
//   {versions: {'2.1.296': {cliVersion, measuredAt, script, netns, variants: {name: {verdict, note}}}, '2.1.306': {…}}}
// The measurement ADDS its version's record and keeps every other one (withMeasured, the writer's
// one rule). A bare record — the one-version shape the file had until then — reads as a fixture
// of that one version.

// the six the measurement runs, in its order (the script imports this list — one spelling)
const OAT_VARIANTS = Object.freeze(['oat-file', 'oat-env', 'oat-file-401', 'oat-file-near', 'oat-file-switch', 'oat-file-scopes']);
// the three that must be PASS
const OAT_IN_FILE_GATE = Object.freeze(['oat-file', 'oat-file-401', 'oat-file-switch']);

/** '2.1.296 (Claude Code)' / 'v2.1.296' / '2.1.296' → '2.1.296'. A pre-release / build suffix is KEPT
 *  ('2.1.296-dev.1' is another build, never the measured release — pool-oat-materialize verify r1 F9);
 *  anything else → null. */
function cliVersionOf(v) {
  const m = /^\s*v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?)(?=\s|$)/.exec(String(v == null ? '' : v));
  return m ? m[1] : null;
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isRecord = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const byVersion = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/** the fixture's record of EXACTLY version `v` (cliVersionOf's spelling), or null: {versions} ⇒ its own
 *  entry keyed by `v`; a bare record ⇒ itself (oatInFile still checks its cliVersion). */
function recordOf(fixture, v) {
  if (!isRecord(fixture)) return null;
  if (!own(fixture, 'versions')) return fixture;
  const vs = fixture.versions;
  return isRecord(vs) && own(vs, v) && isRecord(vs[v]) ? vs[v] : null;
}

/** true only when `fixture` measured EXACTLY this CLI version string (a build suffix is another
 *  version) and named every gate variant PASS (an own property, verdict exactly 'PASS'). */
function oatInFile(version, fixture) {
  const v = cliVersionOf(version);
  if (!v) return false;
  const rec = recordOf(fixture, v);
  if (!rec || cliVersionOf(rec.cliVersion) !== v) return false;
  const vs = rec.variants;
  if (!vs || typeof vs !== 'object' || Array.isArray(vs)) return false;
  return OAT_IN_FILE_GATE.every((name) => Object.prototype.hasOwnProperty.call(vs, name) && !!vs[name] && vs[name].verdict === 'PASS');
}

/** the versions `fixture` holds a record of (each keyed by its own cliVersion), oldest first —
 *  the words "fixture: 2.1.296, 2.1.306" the store's log says beside an unmeasured CLI. */
function measuredVersions(fixture) {
  if (!isRecord(fixture)) return [];
  if (!own(fixture, 'versions')) { const v = cliVersionOf(fixture.cliVersion); return v ? [v] : []; }
  const vs = fixture.versions;
  return isRecord(vs) ? Object.keys(vs).filter((k) => isRecord(vs[k]) && cliVersionOf(vs[k].cliVersion) === k).sort(byVersion) : [];
}

/** THE WRITER'S ONE RULE (scripts/measure-claude-cred-read.mjs --write-fixture): the fixture with
 *  `record` under its exact version and EVERY other entry kept as it was — a run adds a version and
 *  never drops one; re-measuring a version replaces that version's record only. `fixture` null = no
 *  file yet; a bare record becomes the map's first entry. A new object: the input is not touched.
 *  Throws (the writer refuses before it measures, and again before it writes) on a record that names
 *  no exact version, or a fixture that is neither shape (rewriting it could drop what it holds). */
function withMeasured(fixture, record) {
  const v = isRecord(record) ? cliVersionOf(record.cliVersion) : null;
  if (!v || v !== record.cliVersion) throw new Error(`the record names no exact CLI version (${JSON.stringify(isRecord(record) ? record.cliVersion : record)})`);
  let base = {}, versions = {};
  if (fixture != null) {
    if (!isRecord(fixture)) throw new Error('the fixture is not a JSON object');
    if (own(fixture, 'versions')) {
      if (!isRecord(fixture.versions)) throw new Error('the fixture\'s versions is not a map');
      ({ versions, ...base } = fixture);
    } else {
      const k = cliVersionOf(fixture.cliVersion);
      if (!k) throw new Error(`the fixture is a record of no CLI version (${JSON.stringify(fixture.cliVersion)})`);
      versions = { [k]: fixture };
    }
  }
  const all = { ...versions, [v]: record };
  return { ...base, versions: Object.fromEntries(Object.keys(all).sort(byVersion).map((k) => [k, all[k]])) };
}

// THE UNMEASURED CLI'S ONE FOR-YOU ITEM (lane pool-silent-members R1, inc-mvsjhna7): the hub's claude auto-updated to a
// version this fixture never measured and the pool lost the members it can only reach through their token file — on
// 10-27 that was one journal line and six silent members for 17 h. The words name the version, how many accounts and
// which, and the two ways out; `i18n` carries the same sentences as {key, params} for zh / ja (the dict: src/lib/i18n-*.js).
const i18nKey = (s) => s;
function cliUnmeasuredItem({ cli, names = [] } = {}) {
  const v = cliVersionOf(cli) || String(cli || '?').slice(0, 40);
  const list = (Array.isArray(names) ? names : []).map((n) => String(n || '').slice(0, 80)).filter(Boolean);
  const n = list.length;
  const head = n === 1
    ? { text: `The Claude CLI updated to ${v}; 1 account cannot be placed by the pool until this version is measured — its login is kept`, key: i18nKey('The Claude CLI updated to {v}; 1 account cannot be placed by the pool until this version is measured — its login is kept'), params: { v } }
    : { text: `The Claude CLI updated to ${v}; ${n} accounts cannot be placed by the pool until this version is measured — their logins are kept`, key: i18nKey('The Claude CLI updated to {v}; {n} accounts cannot be placed by the pool until this version is measured — their logins are kept'), params: { v, n } };
  const lines = [], rows = [];
  const say = (text, key, params) => { lines.push(text); rows.push(params ? { key, params } : { key }); };
  say(`Accounts: ${list.join(', ')}.`, i18nKey('Accounts: {names}.'), { names: list.join(', ') });
  say('Each keeps its long-lived token in its folder, and a conversation started on it directly keeps working; the pool names it in its notices with this reason.', i18nKey('Each keeps its long-lived token in its folder, and a conversation started on it directly keeps working; the pool names it in its notices with this reason.'));
  say(`To use one in the pool now, re-login it in Manage Agents. This item resolves itself once CLI ${v} is measured.`, i18nKey('To use one in the pool now, re-login it in Manage Agents. This item resolves itself once CLI {v} is measured.'), { v });
  return { text: head.text, detail: lines.join('\n'), i18n: { text: { key: head.key, params: head.params }, detail: rows } };
}
/** the prefix every such item's text starts with, for version `v` (the sweep finds its own item by it) */
const cliUnmeasuredPrefix = (v) => `The Claude CLI updated to ${cliVersionOf(v) || String(v || '?').slice(0, 40)}; `;

module.exports = { oatInFile, cliVersionOf, measuredVersions, withMeasured, cliUnmeasuredItem, cliUnmeasuredPrefix, OAT_VARIANTS, OAT_IN_FILE_GATE };
