// THE FRAME HOST — the client half (lane design-frame-host, backlog B-8679; the hub half and the why:
// src/server/frame-host.js). A frame whose document the PAGE makes (the Design window's artboards, print and print all;
// the channels' mail frame; lane frame-host-preview: the code editor's HTML preview, an .eml's HTML body, a Word
// document's embedded HTML) is never a srcdoc frame on the app page — Chrome gives a srcdoc frame the PARENT's policy —
// and never `allow-same-origin` (test-csp-report ⑧'s census). It NAVIGATES to the hub's host document (the address is
// its builder's: design-canvas-model.js FRAME_HOST, mail-frame.js frameHostSrc, `hostAddress` below for the foreign
// documents the viewers show) and its document is POSTED in:
//   · `writeFrame(f, html, src)` keeps the document on the element (`f.__frameDoc` — what the srcdoc attribute held) and
//     sets `src`: a NEW navigation per document (a fresh window — an artboard's top-level `let` never meets its previous
//     version; two writes before the host loaded land the second, measured);
//   · the HOST's load is taken HERE — a capture listener on the element, so the caller's own `load` listener never sees it
//     — and the document goes to THAT frame's window ('*': the host is an opaque origin); the host writes it, and the
//     WRITTEN document's load is the caller's (measured: Chrome fires the element's load again when it finishes; an
//     iframe inserted before its first write fires its about:blank load during the insertion, never here);
//   · the sandbox is the caller's, on the element BEFORE `writeFrame` (the host's header sandboxes it as well).
// Imports nothing (the canvas core takes it as its `writeFrame` option; the published page's viewer never does).

function hostLoad(e) {
  const f = e.currentTarget;
  if (!f.__frameWait) return; // the written document's own load (or a navigation inside it): the caller's
  f.__frameWait = false;
  e.stopImmediatePropagation();
  try { f.contentWindow.postMessage({ vsFrameDoc: 1, html: f.__frameDoc }, '*'); } catch { /* the frame went away */ }
}

/** The host's address for a FOREIGN document a viewer shows (lane frame-host-preview): `preview` — the code editor's
 *  HTML preview; `base` = the file's LOCAL folder (the hub judges it on this navigation and gives the frame that folder's
 *  files at the folder's own address — never /api/file/serve, whose cookie an opaque frame does not send); `eml` — an
 *  .eml's HTML body, remote pictures only with `pictures` (the mail rule); `docx` — a Word document's embedded HTML. */
export function hostAddress(kind, { base = '', pictures = false } = {}) {
  if (kind === 'preview') return '/frame-host?kind=preview' + (base ? '&base=' + encodeURIComponent(base) : '');
  if (kind === 'eml') return '/frame-host?kind=eml' + (pictures ? '&pictures=1' : '');
  if (kind === 'docx') return '/frame-host?kind=docx';
  throw new Error('no such frame kind: ' + kind);
}

/** Hand `html` to the sandboxed frame `f` through the host at `src` (a builder's address). */
export function writeFrame(f, html, src) {
  if (!f.__frameHosted) { f.__frameHosted = true; f.addEventListener('load', hostLoad, true); }
  f.__frameDoc = String(html == null ? '' : html);
  f.__frameWait = true;
  f.src = src;
}
