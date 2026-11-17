// THE MEASURED-RECORD FIXTURE, READ AS IT STOOD (B-5e52, lane bl-tests-e, 2026-11-17). scripts/fixtures/oat-in-file.json holds
// one record per Claude Code build the measurement ran (scripts/measure-claude-cred-read.mjs --write-fixture; the writer's
// rule is src/cli-caps.js withMeasured). A suite's RED CONTROL replays a hub whose fixture had not yet measured build v — it
// used to spell every LATER build by hand (`const { '2.1.307': _a, '2.1.308': _b, …, ...two } = FX.versions`), so each new
// build edited about nine such lines in four suites, and a line that missed one kept the newer record in a fixture named for
// an older one (test-account-verdicts' «fx-to-2.1.308» still held 2.1.321). Now a new build edits NONE of them.
//   versionsBefore(versions, v) → the records of every build OLDER than v (the fixture the day before v was measured)
//   RECORD_SHA256              → the sha-256 of every measured record, by build — the ONE row a new build adds
//                                 (test-cli-caps pins the fixture to it: a record edited by hand, or added without its row, is red)
//   recordSha(record)          → that hash: sha-256 of JSON.stringify(record) (the file's own key order)
import crypto from 'node:crypto';

export const byVersion = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
export function versionsBefore(versions, v) {
  return Object.fromEntries(Object.entries(versions || {}).filter(([k]) => byVersion(k, v) < 0));
}
export const recordSha = (record) => crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
// THE PIN of every measured record (the six that test-cli-caps pinned one leg each since 2.1.296 + 2.1.308 and 2.1.321, which no
// leg had pinned). A new build = ONE row here — test-cli-caps' «every record has its pin» red prints the exact row (rowsToAdd).
// What still names a build by hand: that build's own verdict legs (what it measured) and LOOPBACK_RECS' rule (≥ 2.1.312 = the
// loopback rung — a later build measured on the namespace rung would need that rule widened).
export const RECORD_SHA256 = Object.freeze({
  '2.1.296': 'd7389f7a2edb1d1038cd0ab389d7ec11e5a009586fac78dceca407a732dcbaa5', // 2026-10-14, the namespace rung
  '2.1.306': '327b0236b65ef44eba484dca383b5c9fa53efdabd1ee8b296db8d075248b5a0b', // 2026-10-21, the namespace rung
  '2.1.307': '7a42e65e6160cb724485e7f126902b6ae33789a9e81d51848e7565a59e33659e', // 2026-10-22, the namespace rung
  '2.1.308': 'b3b1544f9c497df267b132d91597c53c4d767c6afc06458f42d5f6ee0c8ac8b9', // 2026-10-22, the namespace rung (first pinned here)
  '2.1.312': '51f77e3ff0c35e347922b02c064cdc5971d8425857f05e14aba1c26ed5acf121', // 2026-10-28, loopback-real
  '2.1.314': '036f62ba9d7b4a4b604a8a5578ae31ebbed231e012bea8d5766d14939dc0149b', // 2026-10-30, loopback-real
  '2.1.319': '79b0fb3dc44e0ee9480dbad0ecee5b8d37b0848f3600837d828d94919441bab6', // 2026-11-07, loopback-real
  '2.1.321': 'd84bc0d71b184d81887bec8d313065ba64042849d6f981db0b0ee0e3050ac3bd', // 2026-11-09, loopback-real (first pinned here)
});
// a destructuring that spells a build's key off a versions map — the shape versionsBefore replaces (test-cli-caps' census)
export const SPELLED_BUILDS_RE = /\b(?:const|let|var)\s*\{[^}=]*?['"]\d+\.\d+\.\d+['"]\s*:/;

