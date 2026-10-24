// THE ONE SANITIZER FOR HTML SOMEBODY ELSE WROTE (verify-r6, lane-pairing, 2026-09-28 — "what you approve is what runs").
//
// Assistant text, peer messages, agent reports, a Background Work panel's md block, a previewed markdown file and a
// For-you item are markdown written by an agent, a peer or a file, rendered with innerHTML and synced to every client.
// DOMPurify's DEFAULT config keeps <style>, style= and class=, so one message could restyle EVERY approval surface in
// the page — `<style>.ut-exit-cmd{font-size:0}.ut-exit-cmd::before{content:"echo hello"}</style>` changed the command
// shown above Allow while the real one ran — cover the page (a style= of position:fixed, or a product class that is
// fixed), or navigate the app from a <form><button>. The rule: what somebody else writes may format ITS OWN text; it
// never styles, positions or wires anything of ours:
//   · no CSS at all — <style> / <link> and every style= are refused;
//   · class= keeps only `language-<name>` on <pre> / <code> (a code fence's language — the code preview's mermaid pass
//     reads it); any other class value is dropped (a product class borrows the product's look and position);
//   · no forms, controls or top layer — form / button / textarea / select / dialog / template / frames / objects, the
//     popover* / command* attributes, <label> and for= (a click on their element never reaches one of ours); a GFM
//     task-list <input> survives, always as a DISABLED checkbox;
//   · id / name are namespaced `user-content-` (SANITIZE_NAMED_PROPS: never one of our ids, never document.<name>);
//   · no data-* (our delegated click handlers read data-path / data-href / data-rel on OUR .chat-link spans);
//   · a link opens beside the workspace (target=_blank, rel=noopener noreferrer), never in place of the app;
//   · HTML only (USE_PROFILES html): no inline SVG / MathML — an <svg overflow="visible"> with a transform paints
//     outside its own box, over the card above it. Markdown never emits either.
// What the callers add AFTER sanitizing (linkify's .chat-link spans, _wrapTables, the mermaid div, link targets) is
// ours and untouched. ONE dedicated DOMPurify instance, so these hooks never reach another DOMPurify user; created on
// first use; without a working DOM it THROWS — fail closed (DOMPurify itself hands the input back unsanitized when it
// cannot run). Gate: scripts/test-approval-census.mjs §2 (every sanitize in src/ goes through here, the config, the
// hooks, the four call sites; controls on patched copies).
// The SECOND instance below (`sanitizeDiagramSvg`, lane chat-mermaid) is the diagram picture's: SVG only, its own config
// and hooks — never this one's.
import DOMPurify from 'dompurify';

const frozen = (a) => Object.freeze(a.slice());

export const FORBID_TAGS = frozen([
  'style', 'link', 'meta', 'base', 'script', 'noscript',
  'form', 'button', 'textarea', 'select', 'option', 'optgroup', 'datalist', 'label', 'fieldset', 'legend', 'output',
  'dialog', 'template', 'slot', 'iframe', 'frame', 'frameset', 'object', 'embed', 'portal',
  'svg', 'math',
]);
export const FORBID_ATTR = frozen([
  'style', 'action', 'formaction', 'form', 'for',
  'popover', 'popovertarget', 'popovertargetaction', 'command', 'commandfor',
  'usemap', 'accesskey', 'autofocus', 'srcdoc',
]);
export const SAFE_HTML_CONFIG = Object.freeze({
  USE_PROFILES: Object.freeze({ html: true }),
  FORBID_TAGS,
  FORBID_ATTR,
  ALLOW_DATA_ATTR: false,
  SANITIZE_NAMED_PROPS: true,
});

// the one class a markdown renderer writes: marked's `language-<info>` on a fenced code block
const CLASS_TAGS = new Set(['code', 'pre']);
const CLASS_TOKEN = /^language-[A-Za-z0-9_+#.-]{1,40}$/;

/** The class value an element keeps ('' = drop the attribute). */
export function keptClass(tag, value) {
  if (!CLASS_TAGS.has(String(tag || '').toLowerCase())) return '';
  return String(value || '').split(/\s+/).filter((c) => CLASS_TOKEN.test(c)).join(' ');
}

/** DOMPurify `uponSanitizeAttribute` hook: class= filtered to keptClass. */
export function onAttribute(node, data) {
  if (!data || data.attrName !== 'class') return;
  const kept = keptClass(node && node.nodeName, data.attrValue);
  if (kept) data.attrValue = kept;
  else data.keepAttr = false;
}

/** DOMPurify `afterSanitizeAttributes` hook: an <input> that survived is a task-list box — a disabled checkbox; a
 *  link (not an in-page #fragment) opens beside the workspace, never in place of it. */
export function afterAttributes(node) {
  const tag = String((node && node.nodeName) || '').toUpperCase();
  if (tag === 'INPUT') { node.setAttribute('type', 'checkbox'); node.setAttribute('disabled', ''); return; }
  if ((tag === 'A' || tag === 'AREA') && typeof node.getAttribute === 'function') {
    const href = node.getAttribute('href');
    if (href && !href.startsWith('#')) { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
  }
}

let purifier = null;
function safeHtmlPurifier() {
  if (purifier) return purifier;
  const p = DOMPurify(typeof window === 'undefined' ? undefined : window);
  if (!p || p.isSupported !== true || typeof p.sanitize !== 'function') throw new Error('safe-html: no DOM to sanitize with — refusing to pass HTML through unsanitized');
  p.addHook('uponSanitizeAttribute', onAttribute);
  p.addHook('afterSanitizeAttributes', afterAttributes);
  p.setConfig(SAFE_HTML_CONFIG);
  purifier = p;
  return p;
}

/** Sanitize HTML somebody else wrote (marked's output of agent / peer / file text) for innerHTML. */
export function sanitizeHtml(html) {
  return safeHtmlPurifier().sanitize(String(html ?? ''));
}

// ── THE DIAGRAM PICTURE (lane chat-mermaid, 2.369.351 — the owner: 「能不能展示 flowchart？」) ──
// A Mermaid diagram somebody else wrote (an agent's reply, a peer's message, a file) is drawn by the self-hosted
// public/mermaid.js (src/lib/mermaid-render.js) into an SVG string — the library's output over THEIR text — and reaches
// our document only through this SECOND dedicated instance, SVG only (the HTML instance above refuses every <svg>).
// The rule, decided by test (scripts/test-mermaid-render.mjs + the probes of scripts/test-chat-mermaid-chrome.mjs):
//   · SVG + SVG filters only (USE_PROFILES svg / svgFilters): no HTML element survives. No <foreignObject> — an HTML
//     label, the door a `%%{init}%%` directive opens (mermaid-render keeps htmlLabels off AND secure; this is the wall
//     behind it); no <a> (a click directive's link — its label survives: DOMPurify keeps a removed element's content);
//     no <image> / <feImage> / <use> (a picture or a reference fetched from anywhere); no animation element (<animate>
//     / <set> rewrite an attribute after it was judged); no <script>; no data-* and no tabindex.
//   · every id is the render's own: the root <svg> is `scope`, the rest `scope-…` / `scope_…` (mermaid prefixes most;
//     sequence / sankey / architecture write bare `actor0`, `node-1`, `b`) — a bare id is renamed `scope-<id>` and every
//     in-picture reference (url(#x), href="#x") follows the same rule, so a diagram id is never one of ours and two
//     pictures never share one (`scope` is random per render — nobody can write it in advance).
//   · every class is the picture's own: each token is prefixed `mmd-` (a node's `class X foo` picks ANY name — ours too:
//     a product class is a selector our code queries and a click handler our delegation reads); its CSS follows.
//   · a reference stays inside the picture: href / xlink:href only `#…`; an attribute or a declaration whose url()
//     points anywhere but `#…` is dropped, as is image-set() / image() / cross-fade() / element() / a backslash escape.
//   · the <style> mermaid writes (its theme) is re-read through the BROWSER'S OWN CSS parser (CSSStyleSheet — never a
//     second tokenizer that could disagree with it): only plain style rules whose EVERY selector starts at `#scope`
//     with no sibling combinator (+ ~ ||) — they match the picture and nothing outside it — and no at-rule at all
//     (@import, @font-face, @media; @keyframes names are page-global). A style= attribute passes the same judge.
//   · the box holding the picture is `contain: paint` (style.css .chat-diagram-figure): nothing paints outside it.
// No DOM ⇒ it THROWS (fail closed), like sanitizeHtml.
export const DIAGRAM_CLASS_PREFIX = 'mmd-';
export const SVG_FORBID_TAGS = frozen([
  'foreignObject', 'a', 'image', 'feImage', 'use', 'script',
  'animate', 'animateMotion', 'animateTransform', 'animateColor', 'set', 'mpath', 'discard',
  'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'link', 'meta', 'base', 'html', 'body',
]);
export const SVG_FORBID_ATTR = frozen(['tabindex', 'autofocus', 'accesskey', 'attributename', 'begin', 'onbegin', 'requiredextensions']);
export const SAFE_SVG_CONFIG = Object.freeze({
  USE_PROFILES: Object.freeze({ svg: true, svgFilters: true }),
  FORBID_TAGS: SVG_FORBID_TAGS,
  FORBID_ATTR: SVG_FORBID_ATTR,
  ALLOW_DATA_ATTR: false,
});

const ID_TAIL = /^[-_]/;
/** The id an element of the picture keeps: the root svg is `scope`; an id already under `scope-` / `scope_` stays; any
 *  other (the root's id on an inner element too) becomes `scope-<id>`. */
export function scopedId(id, scope, { root = false } = {}) {
  const v = String(id ?? '');
  if (root) return scope;
  if (v.startsWith(scope) && ID_TAIL.test(v.slice(scope.length))) return v;
  return `${scope}-${v}`;
}
const URL_FN = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
const BAD_FN = /(?:^|[^\w-])(?:-webkit-)?(?:image-set|image|cross-fade|element|paint|expression|src)\s*\(/i;
/** A CSS value or an attribute value of the picture: url(#x) → url(#scope-x); null = drop it (a url() that leaves the
 *  picture, an image function, a backslash escape — an escape could spell any of them). */
export function diagramValue(value, scope) {
  const v = String(value ?? '');
  if (v.includes('\\') || BAD_FN.test(v)) return null;
  let off = false;
  const out = v.replace(URL_FN, (m, q, target) => {
    const t = target.trim();
    if (!t.startsWith('#') || t.length < 2) { off = true; return m; }
    return `url(#${scopedId(t.slice(1), scope)})`;
  });
  if (off || /url\(/i.test(out.replace(URL_FN, ''))) return null;
  return out;
}
/** A class attribute: every token prefixed (`mmd-node`), a token that is not an identifier dropped. */
export function diagramClass(value) {
  return String(value ?? '').split(/\s+/).filter((c) => /^-?[_A-Za-z][\w-]*$/.test(c)).map((c) => DIAGRAM_CLASS_PREFIX + c).join(' ');
}
/** One selector of the picture's CSS (no commas): it must START at `#scope` (the scope then a non-identifier char)
 *  and hold no sibling combinator / escape / nesting mark, so it matches the picture and nothing outside it; its class
 *  tokens take the prefix (outside quotes and [attribute] brackets). null = drop it. */
export function diagramSelector(sel, scope) {
  const s = String(sel ?? '').trim();
  const head = '#' + scope;
  if (!s.startsWith(head) || /^[\w-]/.test(s.slice(head.length))) return null;
  if (/[~+\\&]|\|\||:root|:host|::part|::slotted/i.test(s)) return null;
  let out = '', quote = '', bracket = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { out += c; if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    if (c === '[') bracket++;
    else if (c === ']') bracket = Math.max(0, bracket - 1);
    if (c === '.' && !bracket && /[-_A-Za-z]/.test(s[i + 1] || '')) { out += '.' + DIAGRAM_CLASS_PREFIX; continue; }
    out += c;
  }
  return quote || bracket ? null : out;
}
/** A selector list split on its top-level commas (parens / brackets / quotes respected). */
export function splitSelectors(text) {
  const parts = []; let cur = '', depth = 0, quote = '';
  for (const c of String(text ?? '')) {
    if (quote) { cur += c; if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === ',' && !depth) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}
/** Declarations (a CSSStyleDeclaration — the browser's parse) re-written: `prop:value[ !important]` joined by `;`. */
function diagramDecls(style, scope) {
  const out = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style[i], v = diagramValue(style.getPropertyValue(prop), scope);
    if (v == null || v === '') continue;
    out.push(`${prop}:${v}${style.getPropertyPriority(prop) ? ' !important' : ''}`);
  }
  return out.join(';');
}
/** The picture's <style> text re-read by the browser's CSS parser: plain style rules whose every selector passes
 *  diagramSelector, their declarations through diagramValue; every at-rule and every nested rule dropped. */
export function scopeDiagramCss(css, scope) {
  if (typeof CSSStyleSheet !== 'function') throw new Error('safe-html: no CSS parser — refusing a diagram\'s style unread');
  const sheet = new CSSStyleSheet();
  try { sheet.replaceSync(String(css ?? '')); } catch { return ''; }
  const out = [];
  for (const rule of sheet.cssRules) {
    if (rule.type !== 1 || typeof rule.selectorText !== 'string') continue; // CSSRule.STYLE_RULE only
    const sels = splitSelectors(rule.selectorText).map((x) => diagramSelector(x, scope));
    if (!sels.length || sels.some((x) => x == null)) continue;
    const decls = diagramDecls(rule.style, scope);
    if (decls) out.push(`${sels.join(',')}{${decls}}`);
  }
  return out.join('');
}
let declProbe = null;
/** A style= attribute through the same judge (parsed by a detached element's CSSStyleDeclaration). */
export function scopeDiagramStyleAttr(value, scope) {
  if (!declProbe) declProbe = document.createElement('div');
  declProbe.style.cssText = String(value ?? '');
  const out = diagramDecls(declProbe.style, scope);
  declProbe.style.cssText = '';
  return out;
}

let svgScope = '';
const SVG_NS = 'http://www.w3.org/2000/svg';
const isRootSvg = (node) => String(node?.nodeName || '').toLowerCase() === 'svg' && node.parentNode?.namespaceURI !== SVG_NS;
/** The picture's element judge (DOMPurify `uponSanitizeElement`): a <style>'s text re-read through scopeDiagramCss. */
export function diagramElement(node, data, scope) {
  if (data && data.tagName === 'style' && node) node.textContent = scopeDiagramCss(node.textContent, scope);
}
/** The picture's attribute judge (DOMPurify `uponSanitizeAttribute`): ids / references / classes / values under the
 *  scope rule (PURE but for a style= value, which the browser's CSS parser reads). */
export function diagramAttribute(node, data, scope) {
  if (!data) return;
  const name = String(data.attrName || '').toLowerCase(), value = String(data.attrValue ?? '');
  if (name === 'id') { data.attrValue = scopedId(value, scope, { root: isRootSvg(node) }); return; }
  if (name === 'class') { const c = diagramClass(value); if (c) data.attrValue = c; else data.keepAttr = false; return; }
  if (name === 'href' || name === 'xlink:href') {
    if (value.startsWith('#') && value.length > 1) data.attrValue = '#' + scopedId(value.slice(1), scope);
    else data.keepAttr = false;
    return;
  }
  if (name === 'style') { const v = scopeDiagramStyleAttr(value, scope); if (v) data.attrValue = v; else data.keepAttr = false; return; }
  if (/url\(|\\|\(/i.test(value)) { const v = diagramValue(value, scope); if (v == null) data.keepAttr = false; else data.attrValue = v; }
}
const onSvgElement = (node, data) => diagramElement(node, data, svgScope);
const onSvgAttribute = (node, data) => diagramAttribute(node, data, svgScope);

let svgPurifier = null;
function safeSvgPurifier() {
  if (svgPurifier) return svgPurifier;
  const p = DOMPurify(typeof window === 'undefined' ? undefined : window);
  if (!p || p.isSupported !== true || typeof p.sanitize !== 'function') throw new Error('safe-html: no DOM to sanitize with — refusing a diagram unsanitized');
  p.addHook('uponSanitizeElement', onSvgElement);
  p.addHook('uponSanitizeAttribute', onSvgAttribute);
  p.setConfig(SAFE_SVG_CONFIG);
  svgPurifier = p;
  return p;
}

/** Sanitize the SVG a diagram library drew from somebody else's text, for innerHTML; `scope` = the render's own id. */
export function sanitizeDiagramSvg(svg, scope) {
  if (!/^[A-Za-z][\w-]{5,}$/.test(String(scope || ''))) throw new Error('safe-html: a diagram needs its own scope id');
  const p = safeSvgPurifier();
  svgScope = scope;
  try { return p.sanitize(String(svg ?? '')); } finally { svgScope = ''; }
}
