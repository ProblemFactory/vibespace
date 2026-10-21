// THE STACK A CONSOLE-RING ENTRY KEEPS (lane vault-chip-zone-errors, inc-mvi50qdh-ygmh). Two uncaught errors at every
// start reached the incident bundle as a message and «bundle.js?v=…:1» only: the minified bundle is ONE line, so nothing
// named the code that threw. The recorder (src/lib/incident-recorder.js) now keeps the error's first frames on every
// `uncaught` / `unhandled` entry, and scripts/symbolicate.mjs maps them back to src/ offline (the bundle's source map is
// never served). PURE — imports nothing: the page writes the frames, the offline tool reads them, one format.

export const STACK_FRAMES = 3;
export const STACK_MAX = 400;

/** The first STACK_FRAMES `at …` frames of an error's stack, one per line, the page's own origin cut (the bundle's
 *  `/bundle.js?v=<mtime>:<line>:<column>` kept — in a one-line bundle the column is what names the code), whole frames
 *  only, ≤ STACK_MAX characters — a frame too long for the room left keeps its location and drops its name; '' when the
 *  thing has no stack (a string rejection, the ResizeObserver loop note). */
export function stackHead(err, origin = '') {
  const s = err && typeof err === 'object' && typeof err.stack === 'string' ? err.stack : '';
  const cut = typeof origin === 'string' && origin ? origin : '';
  const out = [];
  let len = 0;
  for (const raw of s.split('\n')) {
    if (out.length >= STACK_FRAMES) break;
    const l = raw.trim();
    if (!l.startsWith('at ')) continue;
    let f = cut ? l.split(cut).join('') : l;
    const room = STACK_MAX - len - (out.length ? 1 : 0);
    if (f.length > room) { const loc = /\(([^()\s]+:\d+:\d+)\)$/.exec(f); if (loc) f = `at ${loc[1]}`; }
    if (f.length > room) break;
    len += f.length + (out.length ? 1 : 0);
    out.push(f);
  }
  return out.join('\n');
}

/** One frame line back into its parts — `at fn (file:line:col)` or `at file:line:col` ⇒ { fn, file, line, col } (fn ''
 *  for an anonymous frame); anything else (`at <anonymous>`, native code) ⇒ null. */
export function frameOf(line) {
  const m = /^at (?:(.+?) \()?([^()\s]+?):(\d+):(\d+)\)?$/.exec(String(line || '').trim());
  return m ? { fn: m[1] || '', file: m[2], line: Number(m[3]), col: Number(m[4]) } : null;
}
