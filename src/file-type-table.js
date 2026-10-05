'use strict';
// THE EXTENSION TABLE (lane artifacts-model) — the ONE extension → {category, icon key, viewer} registry. PURE data
// (no requires), CJS so the server can read it too: src/lib/file-types.js (the client's icon/viewer lookups) maps the
// icon KEY to its glyph, and src/artifacts.js classifies a deliverable's kind through the same categories.
const FILE_TYPES = Object.freeze({
  // Images
  png:  { category: 'image', icon: 'image', viewer: 'image', bypassBinary: true },
  jpg:  { category: 'image', icon: 'image', viewer: 'image', bypassBinary: true },
  jpeg: { category: 'image', icon: 'image', viewer: 'image', bypassBinary: true },
  gif:  { category: 'image', icon: 'image', viewer: 'image', bypassBinary: true },
  webp: { category: 'image', icon: 'image', viewer: 'image', bypassBinary: true },
  svg:  { category: 'image', icon: 'image', viewer: 'image', bypassBinary: true },
  bmp:  { category: 'image', icon: 'image', viewer: 'image', bypassBinary: true },
  ico:  { category: 'image', icon: 'image', viewer: 'image', bypassBinary: true },
  // Video
  mp4:  { category: 'video', icon: 'video', viewer: 'video', bypassBinary: true },
  webm: { category: 'video', icon: 'video', viewer: 'video', bypassBinary: true },
  mov:  { category: 'video', icon: 'video', viewer: 'video', bypassBinary: true },
  avi:  { category: 'video', icon: 'video', viewer: 'video', bypassBinary: true },
  // Audio
  mp3:  { category: 'audio', icon: 'audio', viewer: 'audio', bypassBinary: true },
  wav:  { category: 'audio', icon: 'audio', viewer: 'audio', bypassBinary: true },
  ogg:  { category: 'audio', icon: 'audio', viewer: 'audio', bypassBinary: true },
  flac: { category: 'audio', icon: 'audio', viewer: 'audio', bypassBinary: true },
  aac:  { category: 'audio', icon: 'audio', viewer: 'audio', bypassBinary: true },
  m4a:  { category: 'audio', icon: 'audio', viewer: 'audio', bypassBinary: true },
  opus: { category: 'audio', icon: 'audio', viewer: 'audio', bypassBinary: true },
  wma:  { category: 'audio', icon: 'audio', viewer: 'audio', bypassBinary: true },
  // PDF
  pdf:  { category: 'document', icon: 'pdf', viewer: 'pdf', bypassBinary: true },
  eml:  { category: 'document', icon: 'mail', viewer: 'eml', bypassBinary: true },
  // Office
  docx: { category: 'office', icon: 'word', viewer: 'docx', bypassBinary: true },
  doc:  { category: 'office', icon: 'word', viewer: 'docx', bypassBinary: true },
  xlsx: { category: 'office', icon: 'sheet', viewer: 'xlsx', bypassBinary: true },
  xls:  { category: 'office', icon: 'sheet', viewer: 'xlsx', bypassBinary: true },
  pptx: { category: 'office', icon: 'slides', viewer: 'pptx', bypassBinary: true },
  ppt:  { category: 'office', icon: 'slides', viewer: 'pptx', bypassBinary: true },
  // Archives — viewer lists contents; entries open through the normal pipeline.
  // (.gz/.bz2/.xz get the viewer too: usually .tar.gz collapsed to its last
  // extension segment; plain compressed single files show a clear error.)
  zip:  { category: 'archive', icon: 'archive', viewer: 'archive', bypassBinary: true },
  tar:  { category: 'archive', icon: 'archive', viewer: 'archive', bypassBinary: true },
  tgz:  { category: 'archive', icon: 'archive', viewer: 'archive', bypassBinary: true },
  gz:   { category: 'archive', icon: 'archive', viewer: 'archive', bypassBinary: true },
  tbz2: { category: 'archive', icon: 'archive', viewer: 'archive', bypassBinary: true },
  bz2:  { category: 'archive', icon: 'archive', viewer: 'archive', bypassBinary: true },
  txz:  { category: 'archive', icon: 'archive', viewer: 'archive', bypassBinary: true },
  xz:   { category: 'archive', icon: 'archive', viewer: 'archive', bypassBinary: true },
  '7z': { category: 'archive', icon: 'archive' },
  rar:  { category: 'archive', icon: 'archive' },
  // Data
  csv:  { category: 'data', icon: 'data', viewer: 'csv' },
  tsv:  { category: 'data', icon: 'data', viewer: 'csv' },
  // Web
  html: { category: 'web', icon: 'web', viewer: 'html-editor' },
  htm:  { category: 'web', icon: 'web', viewer: 'html-editor' },
  // Code
  js:   { category: 'code', icon: 'code' }, jsx: { category: 'code', icon: 'code' },
  ts:   { category: 'code', icon: 'code' }, tsx: { category: 'code', icon: 'code' },
  mjs:  { category: 'code', icon: 'code' }, cjs: { category: 'code', icon: 'code' },
  py:   { category: 'code', icon: 'python' },
  go:   { category: 'code', icon: 'code' },
  rs:   { category: 'code', icon: 'code' },
  css:  { category: 'code', icon: 'style' }, scss: { category: 'code', icon: 'style' }, less: { category: 'code', icon: 'style' },
  json: { category: 'code', icon: 'config' },
  yaml: { category: 'code', icon: 'config' }, yml: { category: 'code', icon: 'config' },
  toml: { category: 'code', icon: 'config' }, xml: { category: 'code', icon: 'config' },
  sh:   { category: 'code', icon: 'shell' }, bash: { category: 'code', icon: 'shell' }, zsh: { category: 'code', icon: 'shell' },
  c:    { category: 'code', icon: 'code' }, cpp: { category: 'code', icon: 'code' },
  h:    { category: 'code', icon: 'code' }, java: { category: 'code', icon: 'code' },
  rb:   { category: 'code', icon: 'code' }, php: { category: 'code', icon: 'code' }, swift: { category: 'code', icon: 'code' },
  // Text
  md:   { category: 'text', icon: 'markdown' },
  markdown: { category: 'text', icon: 'markdown' },
  rst:  { category: 'text', icon: 'text' },
  txt:  { category: 'text', icon: 'text' },
  log:  { category: 'text', icon: 'text' },
});

module.exports = { FILE_TYPES };
