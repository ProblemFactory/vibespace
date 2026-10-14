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
// (scripts/fixtures/oat-in-file.json: {cliVersion, measuredAt, variants: {name: {verdict, note}}}).

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

/** true only when `fixture` measured EXACTLY this CLI version string (a build suffix is another
 *  version) and named every gate variant PASS (an own property, verdict exactly 'PASS'). */
function oatInFile(version, fixture) {
  const v = cliVersionOf(version);
  if (!v || !fixture || typeof fixture !== 'object') return false;
  if (cliVersionOf(fixture.cliVersion) !== v) return false;
  const vs = fixture.variants;
  if (!vs || typeof vs !== 'object' || Array.isArray(vs)) return false;
  return OAT_IN_FILE_GATE.every((name) => Object.prototype.hasOwnProperty.call(vs, name) && !!vs[name] && vs[name].verdict === 'PASS');
}

module.exports = { oatInFile, cliVersionOf, OAT_VARIANTS, OAT_IN_FILE_GATE };
