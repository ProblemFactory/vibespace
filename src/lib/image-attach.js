// THE PICTURE DOOR'S ONE READER (B-c9ed, B-51dd) — every door that takes a picture from a person (the chat composer's
// paste / gallery / camera, the For-you reply box's button / paste / drop) hands its files HERE, and each file is judged
// by THE rule (PURE src/image-attach-rule.js — the type from its first bytes, HEIC by name, no empty file, the size as
// the API measures it, the sides, the message's total) BEFORE it is read whole: a refused file becomes no chip, and the
// person is told at once, in one toast naming each file and why. A picture read here carries the type its BYTES say.
//
// Imports only the PURE rule, so a node suite drives it over real Blob / File objects (no FileReader: Blob.arrayBuffer).
//
// createImageDoor({ held, onAdd, onRefused }) → { add(files) → Promise<{added, refused}> }
//   held()            = the base64 the message already carries (its pictures' lengths) — the reads of this door still in
//                       flight are counted on top, so two quick hand-overs cannot pass the total together
//   onAdd(picture)    = one read picture {base64, mediaType, dataUrl, name} — called as each one is read, in order
//   onRefused(list)   = the refused files of ONE hand-over [{name, code, size, width?, height?}] — once, after the last
// refusalText(list, t) = the toast's words (THE one spelling for both doors)
import { judgeImage, refusalVars, REFUSAL_WORDS, HEAD_BYTES } from '../image-attach-rule.js';

/** base64 of an ArrayBuffer, chunked (no argument-count limit on a large picture) */
export function base64Of(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function createImageDoor({ held = () => 0, onAdd = () => {}, onRefused = () => {} } = {}) {
  let inFlight = 0;   // base64 of pictures judged and being read (not yet in the message)
  const add = async (files) => {
    const added = [], refused = [];
    for (const file of Array.from(files || [])) {
      const name = (file && file.name) || '';
      let head = null;
      try { head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer()); } catch { head = null; }
      if (!head) { refused.push({ name, code: 'unreadable', size: (file && file.size) || 0 }); continue; }
      // judged and RESERVED in the same task: a hand-over started meanwhile counts this one's bytes
      const v = judgeImage({ size: file && file.size, head }, { total: (Number(held()) || 0) + inFlight });
      if (!v.ok) { refused.push({ name, ...v }); continue; }
      inFlight += v.b64;
      let picture = null;
      try {
        const base64 = base64Of(await file.arrayBuffer());
        picture = { base64, mediaType: v.mediaType, dataUrl: `data:${v.mediaType};base64,${base64}`, name: name || 'image' };
      } catch { refused.push({ name, code: 'unreadable', size: (file && file.size) || 0 }); }
      inFlight -= v.b64;
      if (picture) { added.push(picture); onAdd(picture); }
    }
    if (refused.length) onRefused(refused.map(({ name, code, size, width, height }) => ({ name, code, size, ...(width ? { width, height } : {}) })));
    return { added, refused };
  };
  return { add };
}

/** the base64 a list of pictures carries — what `held` answers */
export const heldOf = (list) => (list || []).reduce((n, p) => n + ((p && p.base64 && p.base64.length) || 0), 0);

/** One toast for one hand-over: «Picture not added: a.heic — HEIC pictures cannot be sent — …» (several files: each
 *  one named, « · » between). A pasted picture has no name: it is «the pasted picture». */
export function refusalText(list, t) {
  const why = (r) => t(REFUSAL_WORDS[r.code] || REFUSAL_WORDS.unreadable, refusalVars(r));
  const lines = (list || []).map((r) => t('{name} — {why}', { name: r.name || t('the pasted picture'), why: why(r) }));
  return lines.length === 1 ? t('Picture not added: {line}', { line: lines[0] }) : t('{n} pictures not added: {lines}', { n: lines.length, lines: lines.join(' · ') });
}
