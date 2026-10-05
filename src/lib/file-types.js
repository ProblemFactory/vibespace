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

/** Get category for an extension */
export function getCategory(ext) {
  return (REGISTRY[ext?.toLowerCase()] || DEFAULT_ENTRY).category;
}
