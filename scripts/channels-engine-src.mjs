// THE CHANNELS ENGINE AS ONE TEXT (lane dc-channels-seams, 2026-10-05 — rv-channels-core C11). The engine's `create()`
// composes three family files (src/server/channels-access.js, channels-outbound.js, channels-auth.js) over ONE context
// object. A suite that pins the engine's SOURCE, or loads a patched copy of it, reads `engineSource(repo)`: the engine
// with each family's require line replaced by a call of a hoisted function holding that family's own bytes, appended
// after the engine's text (the engine's own lines keep their numbers; a function census never runs a family into the
// engine's module header). A needle that moved into a family is found — and patched — where it now lives, and the copy
// (scripts/mutant-copy.mjs rebinds `require` to the real engine path; the families sit in the same folder) loads as ONE
// closed world. A control that swaps a dependency's
// require line must use replaceAll: each family requires its own dependencies.
// NOT a test-*.mjs on purpose (the tier census would demand a tier) — like mutant-copy.mjs.
import fs from 'node:fs';
import path from 'node:path';

export const ENGINE = 'src/server/channels-engine.js';
export const FAMILIES = Object.freeze({
  ChannelsAccess: 'src/server/channels-access.js',
  ChannelsOutbound: 'src/server/channels-outbound.js',
  ChannelsAuth: 'src/server/channels-auth.js',
});

/** The engine's text with every family inlined (throws when a family's require line is not found exactly once). */
export function engineSource(repo) {
  let src = fs.readFileSync(path.join(repo, ENGINE), 'utf-8');
  const tail = [];
  for (const [name, rel] of Object.entries(FAMILIES)) {
    const line = `const ${name} = require('./${path.basename(rel)}');`;
    if (src.split(line).length !== 2) throw new Error(`engineSource: ${line} is not in ${ENGINE} exactly once`);
    const body = fs.readFileSync(path.join(repo, rel), 'utf-8');
    src = src.replace(line, () => `const ${name} = channelsFamily${name}({ exports: {} });`);
    tail.push(`function channelsFamily${name}(module) {${body}\nreturn module.exports; }`);
  }
  return src + '\n' + tail.join('\n') + '\n';
}

/** The four files' own texts, keyed by repo-relative path (a census that names the file a line lives in). */
export function familyFiles(repo) {
  return Object.fromEntries([ENGINE, ...Object.values(FAMILIES)].map((rel) => [rel, fs.readFileSync(path.join(repo, rel), 'utf-8')]));
}
