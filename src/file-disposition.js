'use strict';
/**
 * PURE (imports nothing; CJS) — THE ONE spelling of a Content-Disposition that NAMES a file
 * (lane raw-filename, userW 2026-09-28: "我从vibespace预览里下载文件，文件名都叫raw").
 *
 * Every element a preview draws streams through `/api/file/raw?path=…` — the viewer's <img>,
 * <video>, <audio> and PDF <iframe>, the chat's image thumbs and their overlay, the Background
 * Work panel's pictures. A response WITHOUT a Content-Disposition is named by the browser after
 * the URL's last path segment, so "Save image as…", the PDF viewer's download button, a video's
 * download control and a drag to the desktop all saved a file called `raw`. The header is what
 * names the file; `inline` keeps the preview a preview (never `attachment` on a preview URL).
 *
 * The two forms (RFC 6266 §4.3 + RFC 8187, the successor of RFC 5987), always both:
 *   filename="…"         the ASCII FALLBACK — printable ASCII only: `"` and `\` dropped (the
 *                         quoted-string's delimiter and escape), every other character `_`
 *   filename*=UTF-8''…   the real name, percent-encoded to attr-char (`'()*` too — the grammar
 *                         forbids them and encodeURIComponent leaves them alone)
 * Chrome, Firefox and Safari take `filename*` over `filename`, so a CJK name survives whole.
 * Control characters (CR, LF, TAB, …) are dropped from BOTH forms: no browser writes one into a
 * saved name, and a raw CR/LF — or any character above U+00FF — in a header value makes Node's
 * setHeader THROW (ERR_INVALID_CHAR), i.e. a route that never answers. A lone surrogate becomes
 * U+FFFD (encodeURIComponent throws on one). The whole value is printable ASCII by construction.
 */

/** The last segment of a POSIX path (trailing slashes ignored) — local paths on this server and
 *  remote paths on an ssh host / paired device alike are POSIX. `''` for a root or an empty path. */
function fileNameOf(p) {
  const s = String(p == null ? '' : p).replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i < 0 ? s : s.slice(i + 1);
}

/** The name as it may appear in a header at all: well-formed UTF-16, no control characters. */
function cleanName(name) {
  return String(name == null ? '' : name)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
    .replace(/[\u0000-\u001f\u007f]/g, '');
}

/** `filename="…"`'s value: printable ASCII, no quote, no backslash; never empty. */
function asciiFallback(name) {
  const a = cleanName(name).replace(/["\\]/g, '').replace(/[^\x20-\x7e]/g, '_');
  return a || 'file';
}

/** `filename*=UTF-8''…`'s value (RFC 8187 ext-value, attr-char only). */
function extValue(name) {
  return encodeURIComponent(cleanName(name)).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** The header value naming `name`, or null when there is no name to give (an empty basename —
 *  the caller then sends no Content-Disposition, exactly as before). `type` is `inline` unless
 *  `attachment` is asked for by name. */
function contentDisposition(name, type = 'inline') {
  const clean = cleanName(name);
  if (!clean) return null;
  const t = type === 'attachment' ? 'attachment' : 'inline';
  return `${t}; filename="${asciiFallback(clean)}"; filename*=UTF-8''${extValue(clean)}`;
}

module.exports = { fileNameOf, cleanName, asciiFallback, extValue, contentDisposition };
