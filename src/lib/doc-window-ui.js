// THE DOC WINDOW'S UI (lane doc-window, 2.369.215; the Tiptap v3 core since lane doc-editor-wheel, 2.369.221) — bundled into the LAZY public/doc-editor.js; mounted by the door
// (src/lib/doc-window.js) with the main bundle's helpers in `deps` (t, toasts, dialogs, the file-changed relay, the raw
// CodeEditor). Every rule is src/doc-model.js's; the markdown is src/lib/doc-markdown.js's.
//   · OPEN: read the file → THE FIDELITY RULE (parse → serialize === the source, modulo trailing whitespace) ⇒ the
//     rendered editor; not lossless ⇒ RAW with a chip that says why. Raw is always one press away (the escape hatch).
//   · LIVE + CONFLICT: a 2 s stat poll (this machine) / a check on refocus (a remote host — the code editor's rule) +
//     the `file-changed` relay: the disk moved and no unsaved edits ⇒ repaint in place (scroll kept); with unsaved
//     edits ⇒ the bar "Reload | Keep editing"; after Keep editing the save asks ONCE before overwriting.
//   · COMMENTS: a selection ⇒ a floating Comment button (the house popover, living exactly as long as its selection —
//     commentOffer below) ⇒ a note box; the strip on the right
//     (device-kept per (host, path); a bottom sheet on a phone); Send all = ONE POST /api/doc/comments.
//   · THE FRAME (design 020, lane doc-editor-ui, 2.369.223 — docs/design-doc-editor-wheel.md § UI): ONE folding bar of glyph
//     groups (the house bar-fold), ONE status strip of keyed chips (absent with nothing to say), the page a 76ch column
//     with a block rhythm; tables get hover grips onto the existing menu, code blocks their language chip.
//   · WIDTH + LEAVING (lane doc-window-width-export, 2.369.239 — src/lib/doc-window-model.js): the column fills the window
//     (`fit`, the default) or keeps the 76ch measure (`comfortable`, a device's choice); a wide table scrolls in its wrapper;
//     the ⋯ at the bar's right end = the folded tools + Download .md / Export HTML / Print / Copy as Markdown / Copy as HTML.
//   · RAW BLOCKS READ AS A DOCUMENT (lane doc-raw-blocks, 2.369.246 — owner "这个会莫名其妙变成源码的问题还没修复"): a block
//     the wheel carries as written is drawn through the house renderer + the one sanitizer (rawReading), read-only; its
//     chip opens its source IN PLACE (rawView below). Reading never shows source.
//   · SAVE: the serializer's output through the atomic /api/file/write of THIS window's path only, then
//     POST /api/doc/edited {summary} — the owning chat's free next-turn note.
import { Editor, Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import M from '../doc-model.js';
import { schema, extensions, loadDoc, saveDoc, sourceLine, docFidelity, safeHref, safeImageSrc } from './doc-markdown.js';
import { WIDTH_KEY, widthChoice, nextWidth, columnRule, TABLE_CSS, downloadHref, exportName, localImagePath, exportDocument, readingHtml, rawReading, colsBand } from './doc-window-model.js';

const POLL_MS = 2000;
const SHEET_BELOW = 640;   // px of window width: below it the comments strip is a bottom sheet
const STORE_PREFIX = 'vs-doc-comments:';
const CSS = `
.doc-window{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--bg-window);color:var(--text);position:relative}
.doc-window [hidden]{display:none!important}
.doc-bar{display:flex;align-items:center;gap:2px;height:36px;box-sizing:border-box;padding:0 8px;border-bottom:1px solid var(--border);flex:none;min-width:0;overflow:hidden}
.doc-bar>*{flex:0 0 auto;white-space:nowrap}
.doc-bar>.bar-folded{display:none!important}
.doc-tb{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:28px;height:28px;box-sizing:border-box;padding:0 6px;background:none;color:var(--text-secondary);border:none;border-radius:var(--radius-sm);cursor:pointer;font:inherit;font-size:12px}
.doc-tb svg{width:16px!important;height:16px!important;flex:none}
.doc-tb-icon{width:28px;padding:0}
.doc-tb:hover{background:var(--bg-hover);color:var(--text)}
.doc-tb[aria-pressed="true"]{background:var(--accent-dim);color:var(--text)}
.doc-style-btn{color:var(--text);padding:0 4px 0 8px}
.doc-style-btn svg{width:12px!important;height:12px!important;color:var(--text-dim)}
.doc-sep{width:11px;height:16px;background:linear-gradient(var(--border),var(--border)) center/1px 100% no-repeat;margin:0} /* the 1 px rule centred in its own 11 px box: the fold measures offsetWidth, which never counted a margin */
.doc-strip-btn{margin-left:auto}
.doc-width-btn{padding:0 8px 0 6px}
.doc-width-btn[data-width="comfortable"]{color:var(--text)}
.doc-menu-ico{display:inline-flex;vertical-align:-3px;margin-right:8px;color:var(--text-dim)}
.doc-menu-ico svg{width:14px!important;height:14px!important}
.doc-strip-n{font-size:11px}
.doc-status{display:flex;align-items:center;gap:6px;height:26px;box-sizing:border-box;padding:0 8px;border-bottom:1px solid var(--border);flex:none;font-size:11px;white-space:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.doc-status>*{flex:0 0 auto}
.doc-pill{display:inline-flex;align-items:center;gap:6px;height:20px;box-sizing:border-box;padding:0 9px;border-radius:var(--radius);border:1px solid var(--border);background:none;color:var(--text-secondary);font:inherit;font-size:11px}
.doc-chip{color:color-mix(in srgb,var(--yellow) 75%,var(--text));border-color:color-mix(in srgb,var(--yellow) 55%,var(--border))}
.doc-conflict{color:var(--red);border-color:color-mix(in srgb,var(--red) 60%,var(--border))}
.doc-conflict button{background:none;border:none;padding:0;cursor:pointer;font:inherit;color:var(--accent)}
.doc-conflict button:hover{text-decoration:underline}
.doc-cmts-chip{cursor:pointer}
.doc-cmts-chip svg{width:12px!important;height:12px!important}
.doc-cmts-chip[aria-pressed="true"]{border-color:var(--accent);color:var(--text)}
.doc-save-btn{margin-left:auto;display:inline-flex;align-items:center;gap:5px;background:none;border:none;padding:0 2px;color:var(--text-dim);font:inherit;font-size:10px;cursor:pointer}
.doc-save-btn::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--text-dim)}
.doc-save-btn[data-state="dirty"]{color:var(--text-secondary)}
.doc-save-btn[data-state="dirty"]::before{background:var(--accent)}
.doc-main{flex:1;display:flex;min-height:0}
.doc-pane{flex:1;overflow:auto;min-width:0}
.doc-raw{flex:1;min-width:0;display:flex;flex-direction:column}
.doc-raw>.editor-container{flex:1;min-height:0}
.doc-page{font-size:15px;max-width:calc(76ch + 64px);box-sizing:border-box;margin:0 auto;padding:28px 32px 96px;position:relative}
.doc-page .ProseMirror{outline:none;white-space:pre-wrap;word-wrap:break-word;line-height:1.6;font-size:15px}
.doc-page .ProseMirror ::selection{background:color-mix(in srgb,var(--accent) 28%,transparent)}
.doc-page .ProseMirror :is(h1,h2,h3,h4,h5,h6){font-weight:600;margin-bottom:0}
.doc-page .ProseMirror h1{font-size:26px;line-height:1.25}
.doc-page .ProseMirror h2{font-size:20px;line-height:1.3}
.doc-page .ProseMirror h3{font-size:16px;line-height:1.4}
.doc-page .ProseMirror :is(h4,h5,h6){font-size:15px;line-height:1.5}
.doc-page .ProseMirror :where(ul,ol){padding-left:1.5em;margin:0}
.doc-page .ProseMirror li+li,.doc-page .ProseMirror li>:is(ul,ol){margin-top:.2em}
.doc-page .ProseMirror li p{margin:0}
.doc-page .ProseMirror code{background:var(--bg-input);padding:1px 4px;border-radius:var(--radius-sm);font-family:var(--font-mono,'SF Mono','Fira Code',monospace);font-size:.87em}
.doc-page .ProseMirror pre{position:relative;font:13px/1.55 var(--font-mono,'SF Mono','Fira Code',monospace);padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input);overflow:auto;white-space:pre}
.doc-page .ProseMirror pre code{background:none;padding:0;font:inherit;border-radius:0}
.doc-page .ProseMirror pre[data-lang]::after{content:attr(data-lang);position:absolute;top:3px;right:8px;font:10px/1.4 var(--font-mono,'SF Mono','Fira Code',monospace);color:var(--text-dim);pointer-events:none}
.doc-page .ProseMirror blockquote{border-left:3px solid var(--accent-dim);margin-left:0;margin-right:0;padding-left:14px;color:var(--text-secondary)}
.doc-page .ProseMirror a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--accent-dim)}
.doc-page .ProseMirror a:hover{border-bottom-color:var(--accent)}
.doc-page .ProseMirror hr{border:none;border-top:1px solid var(--border)}
.doc-page .ProseMirror figure.doc-fig{margin-left:0;margin-right:0}
.doc-page .ProseMirror figure.doc-fig img{display:block;max-width:100%;border-radius:var(--radius-sm)}
.doc-page .ProseMirror figure.doc-fig figcaption{margin-top:4px;font-size:11px;color:var(--text-dim)}
.doc-page .ProseMirror figure.doc-img-broken img{min-width:120px;min-height:48px;box-sizing:border-box;border:1px dashed var(--border)}
${TABLE_CSS}
.doc-window[data-width="fit"] .doc-page{max-width:none}
.doc-page .ProseMirror table{border-collapse:collapse;table-layout:auto;width:max-content;max-width:100%}
.doc-page .ProseMirror th,.doc-page .ProseMirror td{border:1px solid var(--border);padding:6px 10px;vertical-align:top;min-width:3em;position:relative;font-variant-numeric:tabular-nums}
.doc-page .ProseMirror th{background:var(--bg-input);font-weight:600;white-space:nowrap;text-align:left}
.doc-page .ProseMirror td p,.doc-page .ProseMirror th p{margin:0}
.doc-page .ProseMirror .selectedCell{background:color-mix(in srgb,var(--accent) 16%,transparent)}
.doc-page .ProseMirror :is(td,th):first-child.selectedCell{background:color-mix(in srgb,var(--accent) 16%,var(--bg-window))}
.doc-page .ProseMirror ul[data-type="taskList"]{list-style:none;padding-left:.2em}
.doc-page .ProseMirror li[data-type="taskItem"]{display:flex;gap:8px;align-items:flex-start}
.doc-page .ProseMirror li[data-type="taskItem"]>label{flex:none;display:flex;align-items:center;height:1.6em;user-select:none}
.doc-page .ProseMirror li[data-type="taskItem"]>div{flex:1;min-width:0}
.doc-page .ProseMirror li[data-type="taskItem"] input[type="checkbox"]{appearance:none;-webkit-appearance:none;margin:0;width:15px;height:15px;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--text-dim) 60%,var(--border));border-radius:var(--radius-sm);background:var(--bg-input);display:grid;place-content:center;cursor:pointer}
.doc-page .ProseMirror li[data-type="taskItem"] input[type="checkbox"]::before{content:'';width:9px;height:9px;background:var(--accent-fg);clip-path:polygon(14% 44%,0 65%,50% 100%,100% 16%,80% 0%,43% 62%);transform:scale(0)}
.doc-page .ProseMirror li[data-type="taskItem"] input[type="checkbox"]:checked{background:var(--accent);border-color:var(--accent)}
.doc-page .ProseMirror li[data-type="taskItem"] input[type="checkbox"]:checked::before{transform:scale(1)}
.doc-page .ProseMirror li[data-type="taskItem"][data-checked="true"]>div{color:var(--text-secondary);text-decoration:line-through;text-decoration-color:var(--text-dim)}
.doc-page .ProseMirror kbd{font:.84em/1 var(--font-mono,'SF Mono','Fira Code',monospace);padding:1px 5px;border:1px solid var(--border);border-bottom-width:2px;border-radius:var(--radius-sm);background:var(--bg-input);white-space:nowrap}
.doc-page .ProseMirror .doc-rawblock{border:1px dashed var(--border);border-radius:var(--radius);padding:0 14px 12px;white-space:normal;cursor:default}
.doc-page .ProseMirror .doc-rawblock.ProseMirror-selectednode{outline:2px solid var(--accent-dim);outline-offset:1px}
.doc-page .ProseMirror .doc-raw-head{display:block;box-sizing:border-box;width:calc(100% + 28px);margin:0 -14px 10px;padding:3px 10px;background:var(--bg-input);border:none;border-bottom:1px solid var(--border);border-radius:var(--radius) var(--radius) 0 0;font:inherit;font-size:10px;line-height:1.5;text-align:left;color:var(--text-dim);cursor:pointer}
.doc-page .ProseMirror .doc-raw-head:hover,.doc-page .ProseMirror .doc-raw-head:focus-visible{color:var(--text);background:color-mix(in srgb,var(--accent) 12%,var(--bg-input));outline:none}
.doc-page .ProseMirror .doc-raw-read>*{margin-top:0;margin-bottom:0}
.doc-page .ProseMirror .doc-raw-read>*+*{margin-top:.75em}
.doc-page .ProseMirror .doc-raw-src{font:12px/1.55 var(--font-mono,'SF Mono','Fira Code',monospace);color:var(--text-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
.doc-page .ProseMirror .doc-raw-editor{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.doc-page .ProseMirror .doc-raw-edit{display:block;width:100%;box-sizing:border-box;resize:vertical;font:12px/1.55 var(--font-mono,'SF Mono','Fira Code',monospace);white-space:pre;overflow:auto;background:var(--bg-window);color:var(--text);border:1px solid var(--accent-dim);border-radius:var(--radius-sm);padding:8px 10px;outline:none}
.doc-page .ProseMirror .doc-raw-done{background:var(--accent);color:var(--accent-fg);border:none;border-radius:var(--radius-sm);padding:3px 12px;font:inherit;font-size:12px;cursor:pointer}
/* the block rhythm last: it outranks the element rules above at equal specificity */
.doc-page .ProseMirror>*{margin-top:0;margin-bottom:0}
.doc-page .ProseMirror>*+*{margin-top:.75em}
.doc-page .ProseMirror>:is(h2,h3,h4,h5,h6):not(:first-child){margin-top:1.4em}
.doc-page .ProseMirror>:is(h1,h2,h3,h4,h5,h6)+*{margin-top:.5em}
.doc-grip{position:absolute;z-index:2;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0;background:var(--bg-dialog);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-dim);cursor:pointer}
.doc-grip:hover{color:var(--text);border-color:var(--accent)}
.doc-grip svg{width:12px!important;height:12px!important}
.doc-grip-row{width:14px;height:18px}
.doc-grip-col{width:20px;height:14px}
.doc-strip{width:260px;flex:none;border-left:1px solid var(--border);display:flex;flex-direction:column;min-height:0;background:var(--bg-dialog)}
.doc-strip-head{padding:8px 10px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px}
.doc-strip-list{flex:1;overflow:auto;padding:0 8px}
.doc-strip button,.doc-note button{background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);padding:3px 10px;cursor:pointer;font:inherit;font-size:12px}
.doc-cmt{position:relative;background:var(--bg-window);border:1px solid var(--border);border-radius:var(--radius);padding:6px 26px 6px 8px;margin-bottom:6px;font-size:12px}
.doc-cmt-q{color:var(--text-dim);border-left:2px solid var(--accent-dim);padding-left:6px;margin-bottom:4px;overflow-wrap:anywhere}
.doc-cmt-n{white-space:pre-wrap;overflow-wrap:anywhere}
.doc-cmt-x{position:absolute;top:2px;right:2px;border:none!important;background:none!important;padding:2px 6px!important;color:var(--text-dim)!important}
.doc-strip-foot{padding:8px 10px;border-top:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:6px}
.doc-strip-foot .doc-send{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.doc-strip-empty{color:var(--text-dim);font-size:12px;padding:4px 2px}
.doc-cpop{background:var(--bg-dialog);border:1px solid var(--border);border-radius:var(--radius);padding:4px;box-shadow:var(--shadow-window)}
.doc-cpop button{background:var(--accent);color:var(--accent-fg);border:none;border-radius:var(--radius-sm);padding:4px 10px;cursor:pointer;font:inherit;font-size:12px}
.doc-note{background:var(--bg-dialog);border:1px solid var(--border);border-radius:var(--radius);padding:8px;width:280px;box-shadow:var(--shadow-window);display:flex;flex-direction:column;gap:6px;font-size:12px}
.doc-note textarea{width:100%;box-sizing:border-box;min-height:70px;background:var(--bg-window);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);font:inherit;padding:5px}
.doc-note-q{color:var(--text-dim);overflow-wrap:anywhere}
.doc-note-acts{display:flex;justify-content:flex-end;gap:6px}
.doc-window.doc-sheet .doc-strip{position:absolute;left:0;right:0;bottom:0;width:auto;max-height:60%;border-left:none;border-top:1px solid var(--border);border-radius:12px 12px 0 0;box-shadow:var(--shadow-window);z-index:3}
.doc-window.doc-phone .doc-bar{height:44px;gap:4px}
.doc-window.doc-phone .doc-tb{min-width:36px;height:36px}
.doc-window.doc-phone .doc-tb-icon{width:36px}
.doc-window.doc-phone .doc-status{height:42px}
.doc-window.doc-phone .doc-pill,.doc-window.doc-phone .doc-save-btn{height:36px}
.doc-window.doc-phone button:not(.doc-grip){min-height:36px}
.doc-window.doc-phone .doc-page{padding:18px 12px 80px}
.doc-window.doc-phone .doc-page .ProseMirror h1{font-size:23px}
.doc-window.doc-phone .doc-page .ProseMirror h2{font-size:18px}
`;

/** An icons.js glyph (a trusted constant) as nodes — the window still writes no HTML strings. */
const glyph = (svg) => document.importNode(new DOMParser().parseFromString(svg, 'text/html').body.firstElementChild, true); // the HTML parser: an xmlns-less <svg> lands in the SVG namespace (XML parsing would not draw it)
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const q = (host, path) => { const u = new URLSearchParams(); if (host) u.set('host', host); u.set('path', path); return u.toString(); };
const dirOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
/** A reading fragment's tables in their wrapper (they scroll on screen; in print a wide one steps its type down by its columns). */
const wrapTables = (d) => { for (const tb of d.querySelectorAll('table')) { const w = d.createElement('div'); w.className = 'tableWrapper'; const band = colsBand(tb.rows[0] ? tb.rows[0].cells.length : 0); if (band) w.dataset.cols = band; tb.replaceWith(w); w.appendChild(tb); } };
const joinRel = (dir, rel) => { const out = []; for (const seg of (dir + '/' + rel).split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); } return '/' + out.join('/'); };

/** THE SELECTION AFFORDANCE (userW inc-muxrol54-uv2d, lane doc-comment-dismiss — the Add-comment button outlived its
 *  selection: offerComment returned early on an empty selection and the house closer had the pane as its exclusion, so a
 *  click elsewhere in the text never removed it). The popover lives exactly as long as its selection: ONE at a time,
 *  keyed to the (from, to) that made it. `sync(sel)` drops it the moment the selection is empty or changes; `sync(sel,
 *  true)` (the settled offer) opens one for a NEW selection through `open(sel)` (returns the popover, or null); `dismiss()`
 *  (the editor's blur, the pane's scroll, the window's close, the button itself) drops it keeping the key — and so does
 *  the house (an outside press, Esc): a selection whose popover was dismissed is not offered again until it changes. */
export function commentOffer(open) {
  let pop = null, key = '';
  const dismiss = () => { if (pop) { pop._closeCtl?.abort(); pop.remove(); pop = null; } };
  return {
    sync(sel, settled = false) {
      const k = sel ? sel.from + '-' + sel.to : '';
      if (k !== key) { dismiss(); key = ''; }
      if (!settled || !sel || key) return;
      key = k; pop = open(sel) || null;
      // the house closer's exclusion is emptied: createPopover's anchor (the pane) excluded every press in the text, so a
      // click elsewhere in the document was never an outside press — any press but the popover's own is outside now
      if (pop?._closeExclude) pop._closeExclude.length = 0;
    },
    dismiss,
    get pop() { return pop && pop.isConnected ? pop : null; },
  };
}

export function mountDocWindow({ root, winInfo, host, path, name, from, signal, deps }) {
  const { t, showToast, fetchJson, createModalShell, showConfirmDialog, showInputDialog, createPopover, showContextMenu, uiScale, onFileChanged, sameFile, makeRaw, isPhone, createBarFold, icons: I, sanitizeHtml, copyText, Marked } = deps;
  if (!document.getElementById('doc-window-css')) { const st = mk('style'); st.id = 'doc-window-css'; st.textContent = CSS; document.head.appendChild(st); }
  let widthPref = 'fit'; try { widthPref = widthChoice(localStorage.getItem(WIDTH_KEY)); } catch { } // a DEVICE's choice
  const S = { width: widthPref, source: '', base: 0, mode: 'rich', verdict: null, dirty: false, kept: 0, confirmed: 0, busy: false, view: null, ed: null, loaded: null, raw: null, rawBefore: '', owner: null, from, sending: false, at: '', note: '', stripOpen: false };
  const storeKey = STORE_PREFIX + (host || '') + '\u0001' + path;
  const loadComments = () => { try { const v = JSON.parse(localStorage.getItem(storeKey) || '[]'); return Array.isArray(v) ? v.filter((c) => c && typeof c.id === 'string' && typeof c.note === 'string').slice(0, M.LIMITS.items) : []; } catch { return []; } };
  const saveComments = () => { try { if (comments.length) localStorage.setItem(storeKey, JSON.stringify(comments)); else localStorage.removeItem(storeKey); } catch { } };
  let comments = loadComments();

  // ── THE BAR (design 020): ONE row, glyph groups [block style ▾] | B I </> | • 1. ☑ | table link image | raw, folded by
  //    priority into its ⋯ (src/lib/bar-fold.js — the house fold; 0 never folds, higher folds first); comments at the end ──
  const bar = mk('div', 'doc-bar'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', t('Formatting'));
  const BAR = []; // { el, key, priority, label, act } in bar order: the fold's items and the ⋯ menu's rows
  const tool = (key, icon, label, priority, act, cls = '') => {
    const b = mk('button', 'doc-tb doc-tb-icon' + (cls ? ' ' + cls : '')); b.type = 'button'; if (icon) b.appendChild(glyph(icon)); b.title = label; b.setAttribute('aria-label', label);
    b.dataset.key = key; b.dataset.prio = String(priority);
    b.addEventListener('mousedown', (e) => e.preventDefault(), { signal }); // the editor keeps its selection
    b.addEventListener('click', () => act(b), { signal });
    BAR.push({ el: b, key, priority, label, act }); bar.appendChild(b); return b;
  };
  const sep = (priority) => { const s = mk('span', 'doc-sep'); s.dataset.key = 'sep'; s.dataset.prio = String(priority); s.setAttribute('aria-hidden', 'true'); BAR.push({ el: s, key: 'sep' + priority, priority }); bar.appendChild(s); };
  const edit = (f) => () => { if (S.ed && S.mode === 'rich') f(S.ed.chain().focus()).run(); };
  const btnStyle = tool('style', '', t('Block style'), 0, (b) => styleMenu(b), 'doc-style-btn');
  btnStyle.classList.remove('doc-tb-icon'); btnStyle.setAttribute('aria-haspopup', 'menu');
  const styleWords = mk('span', 'doc-style-words', t('Paragraph')); btnStyle.append(styleWords, glyph(I.chevronDown));
  sep(1);
  const btnB = tool('bold', I.bold, t('Bold'), 1, edit((c) => c.toggleBold()));
  const btnI = tool('italic', I.italic, t('Italic'), 1, edit((c) => c.toggleItalic()));
  const btnCode = tool('code', I.code, t('Inline code'), 2, edit((c) => c.toggleCode()));
  sep(3);
  const btnUl = tool('ul', I.listUl, t('Bulleted list'), 3, edit((c) => c.toggleBulletList()));
  const btnOl = tool('ol', I.listOl, t('Numbered list'), 3, edit((c) => c.toggleOrderedList()));
  const btnTask = tool('task', I.task, t('Task list'), 3, edit((c) => c.toggleTaskList()), 'doc-task-btn');
  sep(4);
  tool('table', I.table, t('Table'), 4, edit((c) => c.insertTable({ rows: 3, cols: 2, withHeaderRow: true })), 'doc-table-btn');
  const btnLink = tool('link', I.link, t('Link'), 4, () => editLink());
  tool('image', I.image, t('Image'), 4, () => insertImage());
  sep(5);
  const btnRaw = tool('raw', I.raw, t('Edit the markdown source'), 5, () => toggleRaw(), 'doc-raw-btn'); btnRaw.setAttribute('aria-pressed', 'false');
  const more = mk('button', 'doc-tb doc-tb-icon doc-more bar-folded'); more.type = 'button'; more.appendChild(glyph(I.more)); more.title = t('Download, export, print'); more.setAttribute('aria-label', t('Download, export, print')); more.setAttribute('aria-haspopup', 'menu');
  const btnStrip = mk('button', 'doc-tb doc-strip-btn'); btnStrip.type = 'button'; btnStrip.dataset.key = 'comments'; btnStrip.dataset.prio = '0'; btnStrip.appendChild(glyph(I.chat)); btnStrip.setAttribute('aria-pressed', 'false');
  const stripN = mk('span', 'doc-strip-n'); btnStrip.appendChild(stripN);
  BAR.push({ el: btnStrip, key: 'comments', priority: 0 }); bar.appendChild(btnStrip);
  // the page width (doc-window-model): one glyph + the word of the CURRENT width; a press flips it; absent on a phone (always Fit)
  const widthWord = () => (S.width === 'fit' ? t('Fit width') : t('Comfortable'));
  const btnWidth = tool('width', I.fit, '', 5, () => setWidth(nextWidth(S.width)), 'doc-width-btn'); btnWidth.classList.remove('doc-tb-icon');
  const widthWords = mk('span', 'doc-width-words'); btnWidth.appendChild(widthWords);
  bar.appendChild(more);

  // ── THE STATUS STRIP: keyed chips patched in place — fidelity · conflict (its two acts inline) · comments · the save
  //    dot at the right; ABSENT while it has nothing to say ──
  const status = mk('div', 'doc-status'); status.setAttribute('role', 'status'); status.hidden = true;
  const chip = mk('span', 'doc-pill doc-chip'); chip.dataset.key = 'fidelity'; chip.hidden = true;
  const conflict = mk('span', 'doc-pill doc-conflict'); conflict.dataset.key = 'conflict'; conflict.hidden = true; conflict.setAttribute('role', 'alert');
  conflict.title = t('The agent changed this file while you were editing.');
  const btnReload = mk('button', 'doc-reload', t('Reload from disk')); btnReload.type = 'button'; btnReload.title = t('Reload (your edits go)');
  const btnKeep = mk('button', 'doc-keep', t('Keep editing')); btnKeep.type = 'button';
  conflict.append(mk('span', null, t('Changed on disk')), btnReload, mk('span', null, '·'), btnKeep);
  const cmtsChip = mk('button', 'doc-pill doc-cmts-chip'); cmtsChip.type = 'button'; cmtsChip.dataset.key = 'comments'; cmtsChip.hidden = true; cmtsChip.appendChild(glyph(I.chat));
  const cmtsWords = mk('span'); cmtsChip.appendChild(cmtsWords);
  const saveDot = mk('button', 'doc-save-btn'); saveDot.type = 'button'; saveDot.hidden = true; saveDot.dataset.state = 'clean'; saveDot.title = t('Save') + ' (Ctrl+S)';
  const stamp = mk('span', 'doc-stamp'); saveDot.appendChild(stamp);
  status.append(chip, conflict, cmtsChip, saveDot);
  const main = mk('div', 'doc-main');
  const pane = mk('div', 'doc-pane'); const page = mk('div', 'doc-page'); pane.appendChild(page);
  const rawPane = mk('div', 'doc-raw'); rawPane.hidden = true;
  const strip = mk('aside', 'doc-strip'); strip.setAttribute('aria-label', t('Comments')); strip.hidden = true;
  const stripHead = mk('div', 'doc-strip-head'); const list = mk('div', 'doc-strip-list'); const foot = mk('div', 'doc-strip-foot');
  const ownerLine = mk('div', 'doc-owner'); const btnSend = mk('button', 'doc-send', t('Send all'));
  foot.append(ownerLine, btnSend); strip.append(stripHead, list, foot);
  main.append(pane, rawPane, strip);
  root.append(bar, status, main);
  // the fold after the frame is in the root: its ruler lands there (after the bar), so the phone rules reach the clones
  const fold = createBarFold(bar, { more, moreAlways: () => true, signal, items: () => BAR.map(({ el, key, priority }) => ({ key, el, priority })) });
  more.addEventListener('mousedown', (e) => e.preventDefault(), { signal }); // a folded tool acts on the editor's selection
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    const out = new Set(fold.folded());
    const rows = BAR.filter((x) => x.act && out.has(x.key) && x.el.style.display !== 'none').map((x) => ({ label: x.key === 'width' ? widthLabel() : x.label, action: () => x.act(more) }));
    const own = leaveRows();
    const r = more.getBoundingClientRect(); showContextMenu(r.left, r.bottom + 2, rows.length ? [...rows, { separator: true }, ...own] : own);
  }, { signal });
  // the comments strip is CLOSED until asked (the bar's comments button, the strip's chip, a new comment): on the right of
  // a wide window; a phone or a narrow pane (a split beside the chat) gets it as a bottom sheet
  const sheetMode = () => isPhone() || (root.clientWidth > 0 && root.clientWidth < SHEET_BELOW);
  const layout = () => { root.classList.toggle('doc-phone', isPhone()); root.classList.toggle('doc-sheet', sheetMode()); applyWidth(); };
  function applyWidth() {
    const rule = columnRule({ choice: S.width, phone: isPhone() });
    if (root.dataset.width !== rule.choice) root.dataset.width = rule.choice;
    btnWidth.dataset.width = S.width; if (widthWords.textContent !== widthWord()) widthWords.textContent = widthWord(); // (runs before `patch` exists)
    btnWidth.title = widthLabel(); btnWidth.setAttribute('aria-label', btnWidth.title);
    const off = isPhone() ? 'none' : ''; if (btnWidth.style.display !== off && S.mode === 'rich') { btnWidth.style.display = off; fold.schedule?.(); }
  }
  function widthLabel() { return S.width === 'fit' ? t('Page width: Fit width — press for Comfortable') : t('Page width: Comfortable — press for Fit width'); }
  function setWidth(w) {
    S.width = widthChoice(w);
    try { localStorage.setItem(WIDTH_KEY, S.width); } catch { }
    applyWidth(); placeGrips(gripCell); fold.schedule?.();
  }
  layout();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  if (ro) ro.observe(root);
  const setStrip = (open) => { S.stripOpen = !!open; strip.hidden = !S.stripOpen; renderStatus(); };

  const hhmm = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const patch = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  /** The strip from the state — each chip shown / hidden / re-worded in place, the strip itself absent when all are. */
  function renderStatus() {
    cmtsChip.hidden = !comments.length;
    if (comments.length) patch(cmtsWords, t('{n} comments', { n: comments.length }));
    cmtsChip.setAttribute('aria-pressed', String(S.stripOpen)); btnStrip.setAttribute('aria-pressed', String(S.stripOpen));
    const state = S.dirty ? 'dirty' : S.note ? 'saved' : 'clean';
    saveDot.hidden = state === 'clean'; saveDot.dataset.state = state;
    patch(stamp, state === 'dirty' ? (S.at ? t('Unsaved · last {time}', { time: S.at }) : t('Unsaved')) : state === 'saved' ? S.note : '');
    status.hidden = chip.hidden && conflict.hidden && cmtsChip.hidden && saveDot.hidden;
  }
  const say = (text) => { chip.textContent = text || ''; chip.hidden = !text; renderStatus(); };
  const showConflict = (on) => { conflict.hidden = !on; renderStatus(); };
  const setDirty = (d) => { if (S.dirty !== d) { S.dirty = d; renderStatus(); } };
  winInfo._editorDirty = () => S.dirty || !!(S.raw && S.raw.modified);
  const info = async () => { const r = await fetchJson('/api/file/info?' + q(host, path)); return r && !r.error && r.modified ? new Date(r.modified).getTime() || 0 : 0; };
  const read = async () => {
    const r = await fetchJson('/api/file/content?' + q(host, path));
    if (!r || r.error) throw new Error((r && r.error) || t('the server did not answer'));
    return String(r.content || '');
  };

  // ── the rendered editor ──
  const imgView = (node) => { // a figure: the image (rounded) + its alt as the caption; a failed load keeps a dashed box
    const fig = mk('figure', 'doc-fig'), img = document.createElement('img');
    const src = safeImageSrc(node.attrs.src);
    if (src) img.src = /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : '/api/file/raw?' + q(host, src.startsWith('/') ? src : joinRel(dirOf(path), src));
    img.addEventListener('error', () => fig.classList.add('doc-img-broken'), { signal });
    img.alt = node.attrs.alt || ''; if (node.attrs.title) img.title = node.attrs.title;
    fig.appendChild(img); if (node.attrs.alt) fig.appendChild(mk('figcaption', null, node.attrs.alt));
    return { dom: fig, ignoreMutation: () => true };
  };
  // A RAW BLOCK READS AS A DOCUMENT (lane doc-raw-blocks, 2.369.246 — owner 2026-10-09 "这个会莫名其妙变成源码的问题还没修复":
  // a table the wheel carried as written showed its SOURCE): the block is drawn through the house renderer + THE one
  // sanitizer (rawReading = readingHtml, the Print render; tables wrapped, images beside the file resolved), read-only —
  // an atom: arrows step over it, a click selects it. Its chip is the ONE way into the source: a press opens it IN PLACE
  // (a textarea the block's size); Esc / Finish / leaving writes attrs.source back (a save changes that block's lines only),
  // Ctrl+S saves. A block that reads as nothing (a comment, a lone closing tag) shows its source and the chip says so.
  const rawView = (node, view, getPos) => {
    const dom = mk('div', 'doc-rawblock'), head = mk('button', 'doc-raw-head'), body = mk('div', 'doc-raw-read');
    dom.setAttribute('data-raw-block', ''); dom.contentEditable = 'false'; head.type = 'button'; dom.append(head, body);
    let cur = node, ta = null;
    const draw = () => {
      const r = rawReading(cur.attrs.source || '', { Marked, sanitize: sanitizeHtml });
      const kind = r.kind === 'html' ? 'HTML' : r.kind === 'front' ? t('front matter') : 'Markdown';
      dom.dataset.rendered = r.rendered ? '1' : '0';
      head.textContent = r.rendered ? t('{kind} · kept as written · edit source', { kind }) : t('{kind} · cannot be rendered · edit source', { kind });
      if (!r.rendered) { body.className = 'doc-raw-src'; body.textContent = cur.attrs.source || ''; return; }
      const d = new DOMParser().parseFromString('<!doctype html><body>' + r.html + '</body>', 'text/html'); // an inert document: nothing in it runs
      wrapTables(d);
      for (const img of d.querySelectorAll('img[src]')) { const p = localImagePath(img.getAttribute('src'), path); if (p) img.setAttribute('src', '/api/file/raw?' + q(host, p)); }
      body.className = 'doc-raw-read'; body.replaceChildren(...[...d.body.childNodes].map((n) => document.adoptNode(n)));
    };
    const commit = () => {
      if (!ta) return;
      const v = ta.value.replace(/\s+$/, ''), pos = getPos(); ta = null; dom.classList.remove('doc-raw-editing');
      if (typeof pos !== 'number' || v === (cur.attrs.source || '')) { draw(); return; }
      const tr = view.state.tr;
      if (v.trim()) tr.setNodeMarkup(pos, null, { ...cur.attrs, source: v }); else tr.delete(pos, pos + cur.nodeSize); // emptied ⇒ the block goes
      view.dispatch(tr);
    };
    const open = () => {
      if (ta || !view.editable) return;
      const h = Math.max(60, Math.round(body.getBoundingClientRect().height));
      ta = mk('textarea', 'doc-raw-edit'); ta.value = cur.attrs.source || ''; ta.spellcheck = false; ta.setAttribute('aria-label', t('Source of this block'));
      const done = mk('button', 'doc-raw-done', t('Finish')); done.type = 'button';
      done.addEventListener('mousedown', (e) => e.preventDefault(), { signal }); // the textarea keeps the focus until the click writes it back
      done.addEventListener('click', () => commit(), { signal });
      const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(h, ta.scrollHeight + 2) + 'px'; };
      ta.addEventListener('input', fit, { signal });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit(); view.focus(); }
        else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); commit(); save(); }
      }, { signal });
      ta.addEventListener('blur', () => { setTimeout(() => { if (ta && document.activeElement !== ta) commit(); }, 0); }, { signal });
      body.className = 'doc-raw-editor'; body.replaceChildren(ta, done); dom.classList.add('doc-raw-editing');
      fit(); ta.focus();
    };
    head.addEventListener('mousedown', (e) => e.preventDefault(), { signal }); // a press while the box is open must not blur it first (that commit + this click would reopen it)
    head.addEventListener('click', () => (ta ? commit() : open()), { signal });
    draw();
    return {
      dom,
      update: (n) => { if (n.type !== cur.type) return false; const same = n.attrs.source === cur.attrs.source; cur = n; if (!ta && !same) draw(); return true; },
      selectNode: () => dom.classList.add('ProseMirror-selectednode'),
      deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
      stopEvent: (e) => !!(e.target && e.target.closest && e.target.closest('.doc-raw-head, .doc-raw-editor')), // the chip + the source box are ours, not the editor's
      ignoreMutation: () => true,
      destroy: () => { ta = null; },
    };
  };
  let selTimer = 0;
  // the selection the comment popover is keyed to: null = none (empty, the editor unfocused, Raw). Every update syncs AT
  // ONCE (a collapsed or changed selection drops the popover now); the offer waits for the selection to settle (250 ms)
  const offer = commentOffer((sel) => offerComment(sel));
  const selNow = (view) => { const s = view.state.selection; return s.empty || !view.hasFocus() || S.mode !== 'rich' ? null : { from: s.from, to: s.to, view }; };
  const selPlugin = new Plugin({
    view: () => ({ update: (view) => { offer.sync(selNow(view)); clearTimeout(selTimer); selTimer = setTimeout(() => offer.sync(selNow(view), true), 250); } }),
    props: { handleDOMEvents: { blur: () => { clearTimeout(selTimer); offer.dismiss(); return false; } } },
  });
  // node decorations (UI only — the document is untouched): a code block's fence language → `data-lang` (its chip) — a raw
  // block's head is its node view's chip (rawView); recomputed only when the document changes
  const decorate = (doc) => {
    const out = [];
    doc.descendants((n, pos) => {
      if (n.type.name === 'codeBlock' && n.attrs.language) out.push(Decoration.node(pos, pos + n.nodeSize, { 'data-lang': String(n.attrs.language) }));
      return !n.isTextblock;
    });
    return DecorationSet.create(doc, out);
  };
  const decoPlugin = new Plugin({ state: { init: (_c, st) => decorate(st.doc), apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old) }, props: { decorations(st) { return this.getState(st); } } });
  const DocUi = Extension.create({ name: 'docUi', addKeyboardShortcuts: () => ({ 'Mod-s': () => { save(); return true; } }), addProseMirrorPlugins: () => [selPlugin, decoPlugin] });
  const uiExtensions = extensions.map((e) => (e.name === 'image' ? e.extend({ addNodeView: () => ({ node }) => imgView(node) })
    : e.name === 'rawBlock' ? e.extend({ addNodeView: () => ({ node, view, getPos }) => rawView(node, view, getPos) }) : e)).concat(DocUi);
  const inTable = () => !!(S.ed && S.ed.isActive('table'));
  const PRESSED = [[btnB, 'bold'], [btnI, 'italic'], [btnCode, 'code'], [btnUl, 'bulletList'], [btnOl, 'orderedList'], [btnTask, 'taskList'], [btnLink, 'link']];
  /** The block-style menu (the house context menu: data-popover, Esc closes it): the current one first-checked. */
  const STYLES = () => [
    { label: t('Paragraph'), on: () => !S.ed.isActive('heading') && !S.ed.isActive('blockquote') && !S.ed.isActive('codeBlock'), act: (c) => (S.ed.isActive('blockquote') ? c.setParagraph().lift('blockquote') : c.setParagraph()) },
    { label: t('Heading 1'), on: () => S.ed.isActive('heading', { level: 1 }), act: (c) => c.setHeading({ level: 1 }) },
    { label: t('Heading 2'), on: () => S.ed.isActive('heading', { level: 2 }), act: (c) => c.setHeading({ level: 2 }) },
    { label: t('Heading 3'), on: () => S.ed.isActive('heading', { level: 3 }), act: (c) => c.setHeading({ level: 3 }) },
    { label: t('Quote'), on: () => S.ed.isActive('blockquote') && !S.ed.isActive('heading'), act: (c) => c.toggleBlockquote() },
    { label: t('Code block'), on: () => S.ed.isActive('codeBlock'), act: (c) => c.toggleCodeBlock() },
  ];
  function styleMenu(b) {
    if (!S.ed || S.mode !== 'rich') return;
    const r = b.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 2, STYLES().map((x) => ({ label: (x.on() ? '✓ ' : '') + x.label, action: () => { if (S.ed) x.act(S.ed.chain().focus()).run(); } })));
  }
  const refreshBar = () => {
    if (!S.ed) return;
    for (const [b, name] of PRESSED) { const on = String(S.ed.isActive(name)); if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on); }
    const cur = STYLES().slice(1).find((x) => x.on());
    patch(styleWords, cur ? cur.label : t('Paragraph'));
    placeGrips(hoverCell || selCell());
  };
  /** The current document in the model's schema (the editor's own schema carries the window's node views). */
  const current = () => schema.nodeFromJSON(S.ed.getJSON());
  const ensureView = (json) => {
    if (S.ed) return S.ed;
    S.ed = new Editor({
      element: page, extensions: uiExtensions, content: json,
      editorProps: { handleDOMEvents: {
        click: (_v, e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a && (e.ctrlKey || e.metaKey)) { window.open(a.href, '_blank', 'noopener'); } if (a) e.preventDefault(); return false; },
        contextmenu: (_v, e) => { if (!inTable()) return false; e.preventDefault(); tableMenu(e.clientX, e.clientY); return true; },
      } },
    });
    S.view = S.ed.view;
    S.ed.on('transaction', ({ transaction: tr }) => { if (tr.docChanged && !tr.getMeta('doc-repaint')) setDirty(true); refreshBar(); });
    return S.ed;
  };
  /** Show a source in the rendered view: its blocks loaded (doc-markdown `loadDoc`), a fresh editor on first paint,
   *  else ONE replace (ProseMirror keeps every unchanged DOM node — the keyed in-place repaint) with the scroll kept. */
  const paint = (src) => {
    S.loaded = loadDoc(src);
    const json = S.loaded.doc.toJSON();
    if (!S.ed) { ensureView(json); return; }
    const top = pane.scrollTop;
    const doc = S.ed.schema.nodeFromJSON(json);
    S.view.dispatch(S.view.state.tr.replaceWith(0, S.view.state.doc.content.size, doc.content).setMeta('doc-repaint', true).setMeta('addToHistory', false));
    pane.scrollTop = top;
  };
  // ── tables + task lists: the toolbar, the house context menu (right-click in a table) and the ⋯ beside them ──
  const run = () => S.ed.chain().focus();
  function alignColumn(align) {
    const st = S.view.state, $p = st.selection.$from;
    let d = $p.depth; while (d > 0 && !/^table(Cell|Header)$/.test($p.node(d).type.name)) d--;
    if (!d) return;
    const col = $p.index(d - 1), table = $p.node(d - 2), start = $p.start(d - 2), tr = st.tr;
    let pos = start;
    table.forEach((row) => { let cpos = pos + 1; row.forEach((cell, _o, i) => { if (i === col) tr.setNodeMarkup(cpos, null, { ...cell.attrs, align }); cpos += cell.nodeSize; }); pos += row.nodeSize; });
    S.view.dispatch(tr);
  }
  function tableMenu(x, y) {
    showContextMenu(x, y, [
      { label: t('Insert row above'), action: () => run().addRowBefore().run() },
      { label: t('Insert row below'), action: () => run().addRowAfter().run() },
      { label: t('Insert column left'), action: () => run().addColumnBefore().run() },
      { label: t('Insert column right'), action: () => run().addColumnAfter().run() },
      { separator: true },
      { label: t('Align left'), action: () => alignColumn('left') },
      { label: t('Align center'), action: () => alignColumn('center') },
      { label: t('Align right'), action: () => alignColumn('right') },
      { separator: true },
      { label: t('Delete row'), action: () => run().deleteRow().run() },
      { label: t('Delete column'), action: () => run().deleteColumn().run() },
      { label: t('Delete table'), action: () => run().deleteTable().run() },
    ]);
  }
  // THE GRIPS: the hovered cell's row (a grip on the table's left edge) and column (a ⋯ on its top edge) — or, with no
  // pointer (touch), the selection's cell — each opening the SAME table menu with the selection moved into that cell
  const grip = (cls, icon, label) => { const b = mk('button', 'doc-grip ' + cls); b.type = 'button'; b.appendChild(glyph(icon)); b.title = label; b.setAttribute('aria-label', label); b.hidden = true; b.contentEditable = 'false'; page.appendChild(b); return b; };
  const gripRow = grip('doc-grip-row', I.grip, t('Row actions')), gripCol = grip('doc-grip-col', I.more, t('Column actions'));
  let hoverCell = null, gripCell = null;
  const selCell = () => {
    if (!S.view || !inTable()) return null;
    try { const { node } = S.view.domAtPos(S.view.state.selection.from); const el = node.nodeType === 1 ? node : node.parentElement; return el && el.closest ? el.closest('td, th') : null; } catch { return null; }
  };
  function placeGrips(cell) {
    if (!cell || !cell.isConnected || S.mode !== 'rich') { gripRow.hidden = true; gripCol.hidden = true; gripCell = null; return; }
    gripCell = cell;
    const Z = uiScale() || 1, pr = page.getBoundingClientRect(), cr = cell.getBoundingClientRect(), row = cell.parentElement.getBoundingClientRect();
    const tb = cell.closest('table').getBoundingClientRect(), wr = (cell.closest('.tableWrapper') || cell.closest('table')).getBoundingClientRect();
    const mid = Math.min(Math.max(cr.left + cr.width / 2, wr.left + 12), wr.right - 12);
    gripRow.style.left = ((Math.max(tb.left, wr.left) - pr.left) / Z - 7) + 'px'; gripRow.style.top = ((row.top + row.height / 2 - pr.top) / Z - 9) + 'px';
    gripCol.style.left = ((mid - pr.left) / Z - 10) + 'px'; gripCol.style.top = ((tb.top - pr.top) / Z - 7) + 'px';
    gripRow.hidden = false; gripCol.hidden = false;
  }
  pane.addEventListener('mousemove', (e) => {
    const el = e.target && e.target.closest ? e.target : null;
    if (!el || el.closest('.doc-grip')) return;
    hoverCell = el.closest('.ProseMirror td, .ProseMirror th');
    if ((hoverCell || selCell()) !== gripCell) placeGrips(hoverCell || selCell());
  }, { signal });
  pane.addEventListener('mouseleave', () => { hoverCell = null; placeGrips(selCell()); }, { signal });
  for (const g of [gripRow, gripCol]) {
    g.addEventListener('mousedown', (e) => e.preventDefault(), { signal });
    g.addEventListener('click', () => {
      const cell = gripCell; if (!cell || !S.ed) return;
      try { S.ed.chain().focus().setTextSelection(S.view.posAtDOM(cell.querySelector('p') || cell, 0)).run(); } catch { }
      const r = g.getBoundingClientRect(); tableMenu(r.left, r.bottom + 2);
    }, { signal });
  }
  // ── link + image: the house input dialog; only what the view may carry (safeHref / safeImageSrc) ──
  async function editLink() {
    if (!S.ed || S.mode !== 'rich') return;
    if (S.ed.isActive('link')) { S.ed.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    const href = ((await showInputDialog({ title: t('Link'), label: t('Link address'), placeholder: 'https://' })) || '').trim();
    if (!href || !S.ed) return;
    if (!safeHref(href)) { say(t('Not a link this document can carry: {url}', { url: href })); return; }
    const c = S.ed.chain().focus();
    if (S.ed.state.selection.empty) c.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    else c.extendMarkRange('link').setLink({ href }).run();
  }
  async function insertImage() {
    if (!S.ed || S.mode !== 'rich') return;
    const src = ((await showInputDialog({ title: t('Image'), label: t('An image address, or a path beside this file'), placeholder: 'img/figure.png' })) || '').trim();
    if (!src || !S.ed) return;
    if (!safeImageSrc(src)) { say(t('Not an image this document can carry: {url}', { url: src })); return; }
    S.ed.chain().focus().setImage({ src, alt: '' }).run();
  }

  // ── LEAVING (doc-window-model): the file itself, ONE self-contained HTML (export + print), the clipboard ──
  const escH = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const row = (icon, label, action) => ({ label, labelHtml: '<span class="doc-menu-ico">' + (I[icon] || '') + '</span>' + escH(label), action });
  /** The ⋯ menu's own rows — the HTML ones only while a rendered view exists (no greyed rows: absent otherwise). No .docx: there is a reader, no writer. */
  function leaveRows() {
    const rich = S.mode === 'rich' && !!S.ed;
    return [
      row('download', t('Download .md'), () => { downloadMd(); }),
      ...(rich ? [row('external', t('Export HTML'), () => { exportHtml(); }), row('print', t('Print / Save as PDF'), () => { printDoc(); })] : []),
      { separator: true },
      row('copy', t('Copy as Markdown'), () => { copyText(sourceNow()).then(() => showToast(t('Copied as Markdown'), { type: 'success' })); }),
      ...(rich ? [row('code', t('Copy as HTML'), async () => { copyText(await exportBody()).then(() => showToast(t('Copied as HTML'), { type: 'success' })); })] : []),
    ];
  }
  const dirtyNow = () => S.dirty || !!(S.raw && S.raw.modified);
  /** The markdown as it stands now: Raw's buffer, the rich edits as a save would write them, else the disk's. */
  const sourceNow = () => {
    if (S.mode === 'raw' && S.raw?.editorView) return S.raw.editorView.state.doc.toString();
    if (S.dirty && S.ed) { const p = saveDoc(S.source, S.loaded, current()); if (p.ok) return p.text; }
    return S.source;
  };
  const saveAs = (href, fname) => { const a = mk('a'); a.href = href; a.download = fname; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); };
  /** Download .md = the file on disk (the existing attachment route) — unsaved edits are saved first, or nothing downloads. */
  async function downloadMd() {
    if (dirtyNow()) {
      const ok = await showConfirmDialog({ title: t('Save and download?'), message: t('This document has unsaved edits: they are saved first, then the file downloads.'), confirmText: t('Save and download') });
      if (!ok || signal.aborted) return;
      if (S.mode === 'raw' && S.raw) await S.raw.save(); else await save();
      if (dirtyNow()) return; // the save did not land (its chip says why) — never a stale download
    }
    saveAs(downloadHref(host, path), name);
  }
  /** THE READING FRAGMENT: the markdown as it stands (sourceNow — unsaved edits included) through the house renderer + THE
   *  one sanitizer (readingHtml) — never the editor's DOM, so a raw block there is a heading / a list here; tables wrapped
   *  (they scroll on screen; in print a wide one steps its type down by its columns), images beside the file inlined. */
  async function exportBody() {
    const d = new DOMParser().parseFromString('<!doctype html><body>' + readingHtml(sourceNow(), { Marked, sanitize: sanitizeHtml }) + '</body>', 'text/html'); // an inert document: nothing in it runs
    wrapTables(d);
    for (const img of d.querySelectorAll('img[src]')) {
      const p = localImagePath(img.getAttribute('src'), path); if (!p) continue;
      try {
        const r = await fetch('/api/file/raw?' + q(host, p)); if (!r.ok) continue;
        const bl = await r.blob(); if (!/^image\//.test(bl.type)) continue;
        img.setAttribute('src', await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = no; fr.readAsDataURL(bl); }));
      } catch { /* kept as written */ }
    }
    return d.body.getHTML(); // the serializer of a detached document — the window's own view still gets no HTML string
  }
  async function buildExport(wide) {
    const body = await exportBody();
    const css = CSS.split('\n').filter((l) => l.startsWith('.doc-page .ProseMirror') && !/tableWrapper|:first-child/.test(l)).join('\n');
    const cs = getComputedStyle(root);
    const tokens = [...new Set((css + TABLE_CSS).match(/var\(--[\w-]+/g) || [])].map((v) => [v.slice(4), cs.getPropertyValue(v.slice(4))]);
    return exportDocument({ title: name, body, css, tokens, font: getComputedStyle(page).fontFamily, wide });
  }
  async function exportHtml() {
    const html = S.ed ? await buildExport(S.width === 'fit') : null;
    if (!html) { say(t('This document could not be exported')); return; }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    saveAs(url, exportName(name)); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // PRINT: the same document in a transient hidden frame (design-present's printAll pattern) — the browser's own dialog is
  // the PDF (Save as PDF); no server-side PDF. sandbox WITHOUT allow-scripts: nothing in the document runs, this window prints it
  let printFrame = null, printTimer = 0;
  const dropPrint = () => { clearTimeout(printTimer); if (printFrame) { printFrame.remove(); printFrame = null; } };
  signal.addEventListener('abort', dropPrint, { once: true });
  async function printDoc() {
    const html = S.ed ? await buildExport(true) : null;
    if (!html) { say(t('This document could not be exported')); return; }
    if (signal.aborted) return;
    dropPrint();
    const f = mk('iframe', 'doc-print-frame'); f.setAttribute('sandbox', 'allow-same-origin allow-modals'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
    // print once the frame's fonts and images are decoded (≤ 5 s) — page 2+ is laid out from what is there
    f.addEventListener('load', async () => {
      const d = f.contentDocument;
      try { await Promise.race([Promise.all([d.fonts ? d.fonts.ready : null, ...[...d.images].map((im) => im.decode().catch(() => {}))]), new Promise((r) => { setTimeout(r, 5000); })]); } catch { /* print what is there */ }
      if (signal.aborted || printFrame !== f) return;
      try { f.contentWindow.focus(); f.contentWindow.print(); f.dataset.printed = '1'; } catch (e) { say(t('Could not print: {why}', { why: e.message })); }
    }, { once: true, signal });
    f.srcdoc = html; document.body.appendChild(f); printFrame = f; printTimer = setTimeout(dropPrint, 120000);
  }

  // ── modes ──
  // Raw: the formatting tools step out of the bar (display none = absent for the fold), Raw + comments stay
  const tools = (on) => { for (const x of BAR) if (x.key !== 'raw' && x.key !== 'comments') x.el.style.display = on && !(x.key === 'width' && isPhone()) ? '' : 'none'; };
  const showRich = () => { S.mode = 'rich'; pane.hidden = false; rawPane.hidden = true; btnRaw.setAttribute('aria-pressed', 'false'); tools(true); refreshBar(); };
  const showRaw = () => {
    S.mode = 'raw'; pane.hidden = true; rawPane.hidden = false; btnRaw.setAttribute('aria-pressed', 'true'); tools(false); showConflict(false); placeGrips(null);
    if (!S.raw) {
      S.raw = makeRaw(rawPane); S.rawBefore = S.source;
      const orig = S.raw.save.bind(S.raw);
      S.raw.save = async () => {
        await orig();
        if (S.raw.modified) return;
        const after = S.raw.editorView ? S.raw.editorView.state.doc.toString() : S.rawBefore;
        if (after !== S.rawBefore) { const before = S.rawBefore; S.rawBefore = after; S.source = after; S.base = await info(); noteEdit(before, after); }
      };
    }
  };
  // THE WHY (doc-model RAW_WHY — the same words, each a literal here for the dictionaries)
  const whyWords = () => ({ crlf: t('it uses Windows line endings (CRLF) — a rich save would rewrite every line ending'), too_big: t('it is larger than 1 MB — too large for the rich editor'), unparsed: t('the rich editor could not read it') });
  const fidelityWords = (v) => t('Editing raw — {why}', { why: (v && whyWords()[v.code]) || t('line {n}', { n: (v && v.line) || 0 }) });

  /** Read the disk and show it: lossless ⇒ the rendered view; else raw + the chip. */
  async function load({ first = false } = {}) {
    S.busy = true;
    try {
      const [src, m] = await Promise.all([read(), info()]);
      S.source = src; S.base = m; S.kept = 0; S.confirmed = 0; conflict.hidden = true; S.at = hhmm();
      S.verdict = docFidelity(src);
      if (!S.verdict.ok) { say(fidelityWords(S.verdict)); if (S.mode !== 'raw') showRaw(); else if (!first && S.raw && !S.raw.modified) S.raw.reloadFromDisk?.({ auto: true }); setDirty(false); }
      else { if (S.mode === 'rich' || first) { say(''); showRich(); paint(src); setDirty(false); } }
      renderStatus();
    } catch (e) {
      if (first) { page.textContent = t('Could not read this document: {why}', { why: e.message }); }
      else say(t('Could not read this document: {why}', { why: e.message }));
    } finally { S.busy = false; }
  }

  async function toggleRaw() {
    if (S.mode === 'rich') { if (S.dirty) { say(t('Save first — the raw editor opens the file as it is on disk')); return; } showRaw(); return; }
    if (S.raw && S.raw.modified) { say(t('Save first — the raw editor has unsaved edits')); return; }
    const v = docFidelity(S.raw && S.raw.editorView ? S.raw.editorView.state.doc.toString() : S.source);
    if (!v.ok) { say(fidelityWords(v)); return; }
    showRich(); await load();
  }

  // ── save + the edit note ──
  async function save() {
    if (S.mode !== 'rich' || !S.ed || S.busy) return;
    const patched = saveDoc(S.source, S.loaded, current()); // BLOCK PATCHING: only the blocks you changed are rewritten
    if (!patched.ok) { say(patched.code === 'lossy' ? t('This block would change on save (line {n}) — edit it in Raw', { n: patched.line }) : fidelityWords({ code: patched.code })); return; }
    const text = patched.text;
    S.busy = true;
    try {
      const disk = await info();
      if (M.saveVerdict({ disk, base: S.base, confirmed: S.confirmed }) === 'ask') {
        const ok = await showConfirmDialog({ title: t('Overwrite the agent\'s newer version?'), message: t('The agent changed this file after you opened it. Saving replaces its version with yours.'), confirmText: t('Overwrite'), danger: true });
        if (!ok) return;
        S.confirmed = disk;
      }
      const res = await fetch('/api/file/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content: text, host: host || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      const before = S.source;
      S.source = text; S.loaded = loadDoc(text); S.base = await info(); S.kept = 0; S.confirmed = 0; conflict.hidden = true;
      S.at = hhmm(); S.note = t('Saved {time}', { time: S.at }); S.dirty = false; renderStatus();
      noteEdit(before, text);
    } catch (e) { say(t('Save failed: {why}', { why: e.message })); } finally { S.busy = false; }
  }
  saveDot.addEventListener('click', () => { if (S.dirty) save(); }, { signal });
  async function noteEdit(before, after) {
    if (before === after) return;
    const r = await fetchJson('/api/doc/edited', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, path, from: S.from, summary: M.editSummary(before, after) }) });
    if (r && r.ok) { S.note = t('Saved {time} — the chat sees your edit on its next turn', { time: S.at || hhmm() }); renderStatus(); }
  }

  // ── live: the 2 s watch + the relay + the conflict bar ──
  async function check() {
    if (document.hidden || S.busy || S.mode !== 'rich' || !S.base) return;
    const disk = await info();
    const v = M.conflictVerdict({ disk, base: S.base, dirty: S.dirty, kept: S.kept });
    if (v === 'repaint') await load();
    else if (v === 'bar') showConflict(true);
  }
  btnReload.addEventListener('click', () => { setDirty(false); load(); }, { signal });
  btnKeep.addEventListener('click', async () => { S.kept = await info(); showConflict(false); }, { signal });
  const timer = host ? 0 : setInterval(check, POLL_MS);
  window.addEventListener('focus', check, { signal });
  onFileChanged((d) => { if (sameFile(d, { host: host || null, path })) check(); }, { signal });
  signal.addEventListener('abort', () => { clearInterval(timer); clearTimeout(selTimer); offer.dismiss(); ro?.disconnect(); S.ed?.destroy(); });

  // ── comments ──
  pane.addEventListener('scroll', () => offer.dismiss(), { signal, passive: true }); // a fixed popover never follows the text
  function offerComment({ from, to, view }) {
    const quote = view.state.doc.textBetween(from, to, ' ', ' ').trim();
    if (!quote) return null;
    const c = view.coordsAtPos(to);
    let line = 0; try { line = sourceLine(S.loaded, current(), from); } catch { line = 0; } // the SOURCE line (PM state + the block map)
    const pop = createPopover(pane, 'doc-cpop', { position: 'cursor', x: c.left, y: c.bottom + 4 });
    const b = mk('button', 'doc-comment-btn', t('Add comment')); // its own words (lane artifacts-e2e): the shared 'Comment' is the Design window's 评论, this window says 批注 everywhere else
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { offer.dismiss(); noteBox(quote, c, line); });
    pop.appendChild(b);
    return pop;
  }
  function noteBox(quote, c, line) {
    const box = mk('div', 'doc-note'); box.setAttribute('role', 'dialog');
    const qq = mk('div', 'doc-note-q', '“' + M.commentItem({ quote, note: '-' }).quote + '”');
    const ta = mk('textarea'); ta.placeholder = t('What should change?'); ta.maxLength = M.LIMITS.note;
    const acts = mk('div', 'doc-note-acts'); const cancel = mk('button', null, t('Cancel')); const add = mk('button', 'doc-note-add', t('Add'));
    acts.append(cancel, add); box.append(qq, ta, acts);
    let close;
    if (isPhone()) { const sh = createModalShell({ title: t('Add comment'), escapeToClose: true, dialogClass: 'doc-note-sheet' }); sh.body.appendChild(box); close = () => sh.close(); }
    else { const p = createPopover(pane, 'doc-note-pop', { position: 'cursor', x: c.left, y: c.bottom + 4 }); p.appendChild(box); close = () => p.remove(); }
    cancel.addEventListener('click', () => close());
    add.addEventListener('click', () => {
      const note = ta.value.trim(); if (!note) { ta.focus(); return; }
      if (comments.length >= M.LIMITS.items) { say(t('At most {n} comments — send these first', { n: M.LIMITS.items })); return; }
      comments.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), quote: M.commentItem({ quote, note }).quote, ...(line ? { line } : {}), note });
      saveComments(); renderStrip(); close(); setStrip(true);
    });
    setTimeout(() => ta.focus(), 0);
  }
  function renderStrip() {
    stripHead.textContent = comments.length ? t('Comments ({n})', { n: comments.length }) : t('Comments');
    patch(stripN, comments.length ? String(comments.length) : ''); btnStrip.title = t('Comments ({n})', { n: comments.length }); btnStrip.setAttribute('aria-label', btnStrip.title);
    const keep = new Map([...list.children].map((el) => [el.dataset.key, el]));
    const want = comments.map((c) => {
      let el = keep.get(c.id);
      if (!el) {
        el = mk('div', 'doc-cmt'); el.dataset.key = c.id;
        if (c.quote || c.line) el.appendChild(mk('div', 'doc-cmt-q', (c.line ? 'L' + c.line + ' ' : '') + (c.quote || '')));
        el.appendChild(mk('div', 'doc-cmt-n', c.note));
        const x = mk('button', 'doc-cmt-x', '×'); x.title = t('Remove'); x.setAttribute('aria-label', t('Remove'));
        x.addEventListener('click', () => { comments = comments.filter((y) => y.id !== c.id); saveComments(); renderStrip(); });
        el.appendChild(x);
      }
      return el;
    });
    for (const [k, el] of keep) if (!comments.some((c) => c.id === k)) el.remove();
    want.forEach((el, i) => { if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null); });
    if (!comments.length && !list.querySelector('.doc-strip-empty')) list.appendChild(mk('div', 'doc-strip-empty', t('Select text in the document, then press Add comment.')));
    if (comments.length) list.querySelector('.doc-strip-empty')?.remove();
    btnSend.hidden = !comments.length;
    ownerLine.textContent = S.owner ? '' : t('Open this document from a chat to send comments to it');
    ownerLine.hidden = !!S.owner;
    renderStatus();
  }
  btnStrip.addEventListener('click', () => setStrip(!S.stripOpen), { signal });
  cmtsChip.addEventListener('click', () => setStrip(!S.stripOpen), { signal });
  btnSend.addEventListener('click', async () => {
    if (S.sending || !comments.length) return;
    S.sending = true; btnSend.textContent = t('Sending…');
    const r = await fetchJson('/api/doc/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, path, from: S.from, items: comments.map((c) => ({ quote: c.quote, ...(c.line ? { line: c.line } : {}), note: c.note })) }) });
    S.sending = false; btnSend.textContent = t('Send all');
    if (r && r.ok) {
      comments = []; saveComments(); renderStrip();
      showToast(r.delivered === 'stashed' ? t('Comments wait for the chat\'s next turn') : t('Comments sent to the chat'), { type: 'success' });
    } else if (r && r.code === 'no_owner') { S.owner = null; renderStrip(); }
    else say(t('Could not send the comments: {why}', { why: (r && r.error) || t('the server did not answer') }));
  }, { signal });
  async function resolveOwner() {
    const r = await fetchJson('/api/doc/owner?' + q(host, path) + (S.from ? '&from=' + encodeURIComponent(S.from) : ''));
    S.owner = r && r.owner ? r.owner : null; renderStrip();
  }
  winInfo._docAdopt = (sid) => { S.from = sid; if (winInfo._openSpec) winInfo._openSpec = { ...winInfo._openSpec, from: sid }; resolveOwner(); };
  winInfo._docClose = () => { clearInterval(timer); };

  renderStrip(); resolveOwner(); load({ first: true });
  return { save, load, state: S };
}
