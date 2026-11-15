'use strict';
// THE SOURCES WHOSE PAIRS THE ESTIMATOR LEARNS (lane usage-predict, the look of 2026-11-15 — a said limit): Claude's, codex's
// and Antigravity's identities carry the anchors' calib pairs the verdict walks. ANY OTHER SOURCE READS OFF (src/usage-predict.js
// knownSource) — never Claude's verdict by default, never a band nobody has checked. Held here, with the harnesses: a member
// id is never branched on outside them (test-architecture §78).
const LEARNED = Object.freeze({ claude: true, codex: true, antigravity: true });
const knownSource = (src) => Object.prototype.hasOwnProperty.call(LEARNED, String(src));
module.exports = { LEARNED, knownSource };
