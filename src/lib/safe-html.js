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
