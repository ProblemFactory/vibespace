/**
 * File type registry — single source of truth for extension → metadata.
 */
import { FILE_ICONS } from './icons.js';
import { FILE_TYPES } from '../file-type-table.js'; // the ONE extension table (lane artifacts-model: src/artifacts.js reads it too)

const I = FILE_ICONS;
const REGISTRY = Object.fromEntries(Object.entries(FILE_TYPES).map(([ext, e]) => [ext, { ...e, icon: I[e.icon] }]));

const DEFAULT_ENTRY = { category: 'unknown', icon: I.unknown };

/** Get the icon emoji for a filename */
export function getFileIcon(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  return (REGISTRY[ext] || DEFAULT_ENTRY).icon;
}

/** Check if a binary file has a dedicated viewer (should not fall back to hex) */
export function hasDedicatedViewer(ext) {
  return !!(REGISTRY[ext?.toLowerCase()]?.bypassBinary);
}

/** Get the viewer type for an extension */
export function getViewerType(ext) {
  return REGISTRY[ext?.toLowerCase()]?.viewer || null;
}

/** lane outbox-attachment-preview: how a file served BY URL (an attachment — PEER bytes, no path on any disk) is
 *  previewed: 'image' | 'video' | 'audio' | 'pdf' | 'docx' | 'pptx' | 'csv' | 'markdown' | 'text' | 'none'. HTML / SVG /
 *  XML are ACTIVE bytes: read as TEXT, never rendered in the app's origin (by the name OR the stored type). A type the
 *  viewer can only read from a real path (an archive, a sheet, a mail) is 'none' — the row downloads it. */
const URL_ACTIVE_EXT = /^(html?|xhtml|svg|svgz|xml|xsl|xslt|mht|mhtml)$/;
const URL_ACTIVE_MIME = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/xsl)$/;
const URL_RASTER_EXT = /^(png|jpe?g|gif|webp|bmp|ico|avif)$/;
export function urlViewerKind(name, mime = '') {
  const base = String(name || '');
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  if (URL_ACTIVE_EXT.test(ext) || URL_ACTIVE_MIME.test(m)) return 'text';
  const v = getViewerType(ext);
  if (v === 'image') return URL_RASTER_EXT.test(ext) ? 'image' : 'none';
  if (['video', 'audio', 'pdf', 'docx', 'pptx', 'csv'].includes(v)) return v;
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  const cat = (REGISTRY[ext] || {}).category;
  if (cat === 'text' || cat === 'code' || /^text\/|^application\/(json|javascript|x-yaml|yaml|toml)$/.test(m)) return 'text';
  return 'none';
}
/** CSV / TSV text → rows of cells (RFC 4180 quotes; at most `maxRows`) — the URL viewer's table (no server parse). */
export function parseDelimited(text, sep = ',', maxRows = 5000) {
  const s = String(text || ''); const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length && rows.length < maxRows; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if ((cell || row.length) && rows.length < maxRows) { row.push(cell); rows.push(row); }
  return rows;
}

/** Get category for an extension */
export function getCategory(ext) {
  return (REGISTRY[ext?.toLowerCase()] || DEFAULT_ENTRY).category;
}
