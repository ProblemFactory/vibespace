/**
 * path-linkify.js — PURE (imports nothing; CJS so the browser bundle and any
 * node test share ONE definition): where a file path ENDS in prose.
 *
 * The chat linkifier used to stop a path only at ASCII punctuation, so Chinese
 * prose glued its fullwidth punctuation onto the link (owner screenshot,
 * 2026-09-10: `…/SharedContext/designs/（浏览器` — the "（" that opens the
 * parenthetical became part of the path and the click opened nothing).
 * CJK filenames are common and stay linkable; only PUNCTUATION ends a path:
 *   U+3000–303F  CJK symbols and punctuation (　、。「」『』【】《》〈〉…)
 *   U+FF01–FF0F, FF1A–FF20, FF3B–FF40, FF5B–FF65  fullwidth ASCII punctuation
 *                (（）！？，．：；～ — the fullwidth DIGITS and LETTERS in between stay)
 *   U+2018–201F  curly quotes “ ” ‘ ’ · U+2026 … · U+2013/2014 – —
 */
'use strict';

const CJK_PUNCT = '\\u3000-\\u303F\\uFF01-\\uFF0F\\uFF1A-\\uFF20\\uFF3B-\\uFF40\\uFF5B-\\uFF65\\u2018-\\u201F\\u2026\\u2013\\u2014';
// One character of a path segment: never whitespace, never a shell/markup
// delimiter, never the punctuation above. (`:` is excluded from segments and
// re-admitted only as the trailing `:line[:col]` suffix.)
const SEG = '[^\\0<>?\\s!`&*()\'":;\\\\' + CJK_PUNCT + ']';
const PATH_SRC = '(?<![="\'\\w/])((?:~|\\.\\.?)?\\/' + SEG + SEG + '*(?:\\/' + SEG + '+)+(?::\\d+(?::\\d+)?)?)';

/** A fresh global regex each call (a shared `g` regex carries lastIndex state). */
function pathRe() { return new RegExp(PATH_SRC, 'g'); }

const TRAILING = new RegExp('[`\'".,;:!?)}\\]' + CJK_PUNCT + ']+$');
/** Strip trailing punctuation from a matched path or URL — ASCII and CJK alike. */
function cleanPath(p) { return String(p).replace(TRAILING, ''); }

/** A RELATIVE reference (kb-features 2.75.0 — moved here from the chat renderer, lane foryou-attachments, so the For-you
 *  links read the SAME rule): a code span that IS a relative path or a bare filename (`B2BTasks/x/final/`, `SCRIPTS.md`,
 *  `generate.py`) — never digits/dots/slashes only (versions, IPs, CIDR ranges 10.0.0.0/8), never a digit-dot stem
 *  (192.0.2.10), never a sentence end, never a URL. */
function looksRelPath(s) {
  const txt = String(s || '');
  return /^[\w@%+=.\-][^\s<>"'`|]*$/.test(txt) && txt.length >= 3 && txt.length <= 200
    && (txt.includes('/') || /\.[A-Za-z0-9]{1,8}$/.test(txt))
    && !/^[\d./]+$/.test(txt) && !/^[\d.]+$/.test(txt.replace(/\.[A-Za-z0-9]+$/, ''))
    && !txt.endsWith('.') && !txt.includes('//');
}
/** Where a relative reference may live, in the order a click probes them (existence-probed at CLICK time, no render IO):
 *  `~/…` as written (the session's host expands it); else <cwd>/<rel>, the cwd's own segment overlap (`repo/docs/x`
 *  asked from inside `…/repo/sub`), the cwd's parent. */
function relCandidates(rel, cwd) {
  const r = String(rel || '');
  const norm = r.replace(/\/+$/, '');
  const cands = [];
  if (r.startsWith('~/')) cands.push(r);
  else if (cwd) {
    cands.push(cwd + '/' + norm);
    const cwdSegs = String(cwd).split('/'), relSegs = norm.split('/');
    const at = cwdSegs.lastIndexOf(relSegs[0]);
    if (at >= 0) cands.push([...cwdSegs.slice(0, at), ...relSegs].join('/'));
    cands.push(cwdSegs.slice(0, -1).join('/') + '/' + norm);
  }
  return [...new Set(cands.filter(Boolean))];
}

module.exports = { pathRe, cleanPath, looksRelPath, relCandidates, PATH_SRC, CJK_PUNCT };
