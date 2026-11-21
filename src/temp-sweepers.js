'use strict';
/**
 * THE TEMP-ROOT SWEEPERS (主开发 r1213 — A SWEEP REMOVES ONLY WHAT IT CAN PROVE IS ITS OWN DEAD THING): every product file that
 * REMOVES folders under the shared temp root (os.tmpdir(), or a run root that falls back to it) by a NAME PREFIX is a ROW here,
 * with how it proves a folder is its own dead thing. PURE (no require): scripts/scratch.mjs reads it, so a suite's scratch never
 * wears a row's prefix (a hub another suite boots sweeps that root), and test-vault-run ⑥b's census holds the src sweeps it can
 * SEE to a row: a src file that tests names with `.startsWith(<a vs-<word>- prefix>)` — a literal, or a const of its own — and
 * removes something. It does not see a regex or indexOf test, an imported prefix, a shell glob handed to find / rm, a removal in
 * another file, or code outside src/ — such a sweeper is a row by hand. `export` is the file's own exported prefix constant
 * (the census reads it: the table and the file cannot drift).
 *
 * NOT ROWS, said: the browser profiles' `vs-bk-*` backups are swept inside $HOME/.vibespace/browser-profiles on the machine that
 * runs them (src/browser-profiles.js, by age and Chrome's own SingletonLock) — not the temp root; a prefix a file only MAKES
 * under the temp root and never sweeps (vs-agentd-stage-, vs-hostkey-, vs-tok-, vs-key-, vs-pvtest-) removes only its own
 * folder by the path it holds; src/mounts.js prunes its own cached rclone copies (files) in ~/.cache/vibespace.
 */
const ROWS = Object.freeze([
  Object.freeze({ file: 'src/server/vault-run-door.js', export: 'RUN_DIR_PREFIX', prefix: 'vs-vault-run-', proof: 'the run folder\'s first file is the door\'s owner mark (its pid and start; the write checked); the start sweep shreds only a marked folder whose owner is proven gone, the mark last and only once nothing else is left (its own shredDir)' }),
  Object.freeze({ file: 'src/server/claude-signin.js', export: 'SCRATCH_PREFIX', prefix: 'vs-signin-', proof: 'src/owner-mark.js: the scratch folder\'s first file is the hub\'s owner mark; the start sweep removes a marked folder whose owner is proven gone, or an older release\'s unmarked one taken by its opener\'s exact bytes — past its age bar; the opener second to last, the mark last' }),
  Object.freeze({ file: 'src/server/oat-mint.js', export: 'SCRATCH_PREFIX', prefix: 'vs-oat-mint-', proof: 'src/owner-mark.js: the scratch folder\'s first file is the hub\'s owner mark; the start sweep removes a marked folder whose owner is proven gone, or an older release\'s unmarked one taken by its opener\'s exact bytes — past its age bar; the opener second to last, the mark last' }),
]);

/** The row whose prefix a folder named `name` (its whole basename) would wear, or null. */
const rowOfName = (name, rows = ROWS) => rows.find((r) => String(name).startsWith(r.prefix)) || null;

module.exports = { ROWS, rowOfName };
