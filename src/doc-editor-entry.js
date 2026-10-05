// THE DOC WINDOW'S EDITOR — the LAZY second client entry (lane doc-window, 2.369.215): `src/doc-editor-entry.js` →
// `public/doc-editor.js` (ESM, built by `npm run build`, gitignored like public/novnc.js), imported by the door
// (src/lib/doc-window.js) on the first Doc window, so ProseMirror + prosemirror-markdown never ride the main bundle.
export { mountDocWindow } from './lib/doc-window-ui.js';
export { docFidelity, roundTrip } from './lib/doc-markdown.js';
