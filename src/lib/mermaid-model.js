// THE DIAGRAM RULES (lane chat-mermaid, 2.369.351 — the owner, about an Antigravity reply that carried a flowchart:
// 「能不能展示 flowchart？」). PURE — imports nothing, no DOM: the decisions src/lib/mermaid-render.js (the one door that
// draws a ```mermaid fence) acts on, gated by scripts/test-mermaid-render.mjs.
//   · WHICH FENCE IS A DIAGRAM: a fenced code block whose info word is `mermaid` (``` or ~~~, any case), found in
//     marked's own token tree (`diagramFences`, so lists / quotes / tables match what marked.parse draws, in its order);
//     a fence still OPEN (a reply mid-stream, the closing fence not yet written) stays a code block (`fenceClosed`).
//   · THE LIBRARY'S CONFIG (`mermaidConfig`): securityLevel strict, HTML labels off, error drawing off, and every key a
//     diagram's own `%%{init: …}%%` / front-matter `config:` could use to re-open a door made `secure` (mermaid refuses
//     a directive that names a secure key): htmlLabels (an HTML label is a <foreignObject> — the XSS door), the theme
//     and its CSS / variables / fonts (themeCSS is raw CSS), securityLevel itself, the size caps.
//   · NOTHING FROM THE NETWORK (`pictureRefs`): mermaid fetches a node's picture (`A@{ img: "https://…" }`) WHILE it
//     draws — before any sanitizer sees an attribute — so a diagram naming a picture anywhere but inside itself
//     (data:image/…) is not drawn: its source is shown with the reason.
//   · THE THEME (`mermaidThemeFor`): the live page background's luminance — a dark page (dark / dracula / nord /
//     solarized / monokai / a custom dark one) ⇒ mermaid `dark`, a light page ⇒ `default`.
//   · THE FAILURE (`diagramVerdict`): mermaid's parse error ⇒ { ok:false, line, message } — the card then shows the
//     source itself with that line marked (the driven-screen rule: a failure is never a blank or a bomb icon).

const LANG = /^mermaid$/i;
/** A code block's info word (marked's `lang`, or a `language-<x>` class) is a diagram's. */
export function isMermaidLang(lang) { return LANG.test(String(lang ?? '').trim().split(/\s+/)[0] || ''); }

/** A fenced code token's `raw` (marked) carries its closing fence: the last non-blank line is the opening fence's
 *  character, at least as long, indented ≤ 3 spaces, nothing after it but blanks. An indented block (no fence) ⇒ true. */
export function fenceClosed(raw) {
  const lines = String(raw ?? '').replace(/\r\n?/g, '\n').split('\n');
  const open = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0] || '');
  if (!open) return true;
  const ch = open[1][0], len = open[1].length;
  let i = lines.length - 1;
  while (i > 0 && !lines[i].trim()) i--;
  if (i === 0) return false;
  const m = /^ {0,3}(`+|~+)[ \t]*$/.exec(lines[i]);
  return !!m && m[1][0] === ch && m[1].length >= len;
}

/** Every diagram fence in marked's token tree (marked.lexer), in document order — the same order marked.parse emits
 *  its <pre><code class="language-mermaid"> — each { code, closed }. Walks `tokens` / `items` / table cells. */
export function diagramFences(tokens) {
  const out = [];
  const walk = (list) => {
    for (const tok of list || []) {
      if (!tok || typeof tok !== 'object') continue;
      if (tok.type === 'code') { if (isMermaidLang(tok.lang)) out.push({ code: String(tok.text ?? ''), closed: fenceClosed(tok.raw) }); continue; }
      if (Array.isArray(tok.tokens)) walk(tok.tokens);
      if (Array.isArray(tok.items)) walk(tok.items);
    }
  };
  walk(tokens);
  return out;
}
/** Cheap pre-check before lexing a message twice: does the text hold a mermaid fence opener at all. */
export function mayHoldDiagram(text) { return /(^|\n)[ \t>*+\-\d.]*(```|~~~)[ \t]*mermaid\b/i.test(String(text ?? '')); }

/** The keys a diagram's own directive may NOT set (mermaid's `secure`): its defaults + every door this lane closes. */
export const SECURE_KEYS = Object.freeze(['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering',
  'htmlLabels', 'theme', 'themeCSS', 'themeVariables', 'fontFamily', 'altFontFamily', 'darkMode', 'dompurifyConfig']);
export const MAX_TEXT = 50000;
/** mermaid.initialize's argument for one render. `theme` = 'dark' | 'default'; `fontFamily` = the page's (measured). */
export function mermaidConfig({ theme = 'dark', fontFamily = '' } = {}) {
  const dark = theme === 'dark';
  const font = String(fontFamily || '').replace(/[<>{};]/g, '').slice(0, 300) || 'sans-serif';
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
    state: { htmlLabels: false },
    theme: dark ? 'dark' : 'default',
    darkMode: dark,
    fontFamily: font,
    themeVariables: { darkMode: dark, fontFamily: font },
    maxTextSize: MAX_TEXT,
    maxEdges: 500,
    secure: SECURE_KEYS.slice(),
  };
}

/** The page's mermaid theme from its live background colour (`rgb(r, g, b)` / `#rgb` / `#rrggbb`); unreadable ⇒ dark
 *  (the product's default theme). */
export function mermaidThemeFor(bg) {
  const rgb = parseColor(bg);
  if (!rgb) return 'dark';
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  return L < 0.4 ? 'dark' : 'default';
}
function parseColor(s) {
  const v = String(s ?? '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) { if (m[4] != null && parseFloat(m[4]) === 0) return null; return [m[1], m[2], m[3]].map(Number); }
  return null;
}

/** The pictures a diagram names (`img: …` in a node's `@{ … }`) that are NOT inside it (anything but data:image/…):
 *  mermaid would fetch each while drawing. [] = none. */
export function pictureRefs(code) {
  const out = [];
  for (const m of String(code ?? '').matchAll(/\bimg\s*:\s*(["']?)\s*([^"'\s,}]*)/gi)) {
    const u = m[2] || '';
    if (!/^data:image\//i.test(u)) out.push(u || '(empty)');
  }
  return out;
}

/** A render's failure, shaped for the card: { ok:false, kind, line (1-based | null), message } — `kind` 'parse' (the
 *  source is wrong at `line`), 'picture' (pictureRefs refused it), 'size' (over MAX_TEXT), 'load' (the library did not
 *  load), 'error' (anything else). `message` is mermaid's own text, cut to its useful lines. */
export function diagramVerdict(err, { kind = '' } = {}) {
  const msg = String((err && (err.message || err.str)) || err || '').replace(/\r\n?/g, '\n');
  const loc = err && err.hash && err.hash.loc;
  let line = loc && Number.isFinite(loc.first_line) ? loc.first_line : null;
  if (line == null) { const m = /\bline (\d+)\b/i.exec(msg); if (m) line = Number(m[1]); }
  const k = kind || (/Maximum text size/i.test(msg) ? 'size' : /parse error|lexical error|syntax error|expecting/i.test(msg) ? 'parse' : 'error');
  const lines = msg.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !/^\.\.\.|^-*\^$/.test(l.trim()));
  return { ok: false, kind: k, line: line != null && line > 0 ? line : null, message: lines.slice(0, 3).join('\n').slice(0, 400) };
}
