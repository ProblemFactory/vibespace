#!/usr/bin/env node
// THE HOSTED RUNNER'S CLAUDE CODE (B-28b1, lane bl-ci, the coordinator's r238, 2026-11-20 — Known K44 of the last releases). The
// registry's newest moves almost daily, so a pin that waits for the runner to meet it is proven only by luck: run 44748179665 installed
// 2.1.329 the day the tree pinned 2.1.328, and test-record-shape ran LENIENT. THE LAWS:
//   1. ci.yml installs THE TREE'S PINNED BUILD — `pin` prints it, read from the tree's own constant (src/record-shape.js
//      SCHEMA_CLI_VERSION, which requires nothing: it runs before `npm ci`). The version is never typed a second time in the workflow,
//      so the record oracle is STRICT on every hosted run, on a build the tree has registered.
//   2. THE NEWEST IS A LOOK-AHEAD — `look-ahead` dumps the registry's newest, installed BESIDE the pin (its own npm prefix): the tree's
//      --auto road (scripts/claude-cli-dump.mjs autoDraft — strings, never run), its dump + draft kept as the run's artifact (the next
//      registration's input), and ONE line saying how far ahead it is, into the run's summary. It never gates (exit 0 always; the step
//      is continue-on-error too) and never runs a turn.
//   3. The one real turn of a hosted run stays ONE, on the pinned build (nothing here changes test-chat-e2e's road).
//   4. Nothing registers itself: a registration stays a unit of its own, read from the artifact by a person.
// Its legs: scripts/test-cli-registration.mjs ⑤ (the wiring, the pin's one reader, the line's words, red controls).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** The tree's pinned Claude Code build — the newest build src/record-shape.js was verified against. */
export const pinnedBuild = () => require(path.join(HERE, '..', 'src', 'record-shape.js')).SCHEMA_CLI_VERSION;

const vcmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

/** PURE: the look-ahead's ONE line, from the pinned build and the dump road's answer ({version, registered, file, changes} | {error}). */
export function lookAheadLine(pinned, r) {
  if (!r || r.error) return `claude look-ahead: the registry's newest could not be read — ${r && r.error ? r.error : 'no answer'}. The gate ran on the pinned ${pinned}; nothing gates on this line.`;
  if (r.version === pinned) return `claude look-ahead: the registry's newest IS the pinned ${pinned} — nothing ahead.`;
  if (vcmp(r.version, pinned) < 0) return `claude look-ahead: the registry's newest ${r.version} is OLDER than the pinned ${pinned} — nothing ahead.`;
  const changes = typeof r.changes === 'number' ? `${r.changes} change(s) to the record table against ${pinned}` : 'its changes not counted';
  return `claude look-ahead: the registry's newest is ${r.version}, ahead of the pinned ${pinned}${r.registered ? ' (already registered)' : ''} — ${changes}. Its dump and draft are this run's artifact claude-cli-dump-<sha> (${path.basename(r.file || '?')}); a registration reads it — nothing registers itself.`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...a] = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (cmd === 'pin') { process.stdout.write(pinnedBuild() + '\n'); process.exit(0); }
  if (cmd === 'look-ahead') {
    const pinned = pinnedBuild();
    let r;
    try { const { autoDraft } = await import('./claude-cli-dump.mjs'); r = autoDraft({ bin: opt('--bin'), dataDir: opt('--data'), force: true }); } catch (e) { r = { error: String((e && e.message) || e).slice(0, 300) }; }
    const line = lookAheadLine(pinned, r);
    console.log(line);
    const summary = opt('--summary') || process.env.GITHUB_STEP_SUMMARY;
    if (summary) { try { fs.appendFileSync(summary, '### ' + line + '\n'); } catch { } }
    if (process.env.GITHUB_ACTIONS) console.log(`::notice title=claude-look-ahead::${line}`);
    process.exit(0);   // never a gate (law 2)
  }
  console.error('usage: node scripts/ci-claude.mjs pin | look-ahead --bin <claude> --data <dir> [--summary <file>]');
  process.exit(2);
}
