// plain-words.js — lane ui-plain-words (the owner 2026-11-13: «你看看这个界面是不是应该优化下，最好走查一下所有界面找到
//可优化的布局，提示文本等»; the UI walk's pattern «internal names, commands, variables and paths shown to a person» and «a
// wall of explanation before the action»). THE FACE / FOLD DOOR: what a person reads first is one or two plain sentences
// (the FACE); a raw string — a path, a command, an environment variable, a setting key, an internal id, the mechanics
// behind a rule — goes into ONE collapsed fold under it (the FOLD). This is the card grammar's rule 4 (docs/kb-patterns.md
// «The card grammar»: ONE fold for raw strings, `data-fold="tech"`) extended from decision cards to every surface.
//
// ONE door: every «技术细节» / «详情» fold a surface draws is built here (techFold for a DOM surface, techFoldHtml for
// a string renderer). scripts/test-plain-words.mjs pins it — a fold summary or `data-fold="tech"` built anywhere else is
// red (the ones that predate this door sit in its printed, shrink-only baseline). Every line is set as TEXT (textContent /
// escHtml): a path or a peer's string never becomes markup.
import { t } from './i18n.js';
import { escHtml } from './utils.js';

/** The fold's summary words. `details` = the settings form's «详情» (a row's long explanation), else «技术细节». */
const summaryOf = (summary) => (summary === 'details' ? t('Details') : summary || t('Technical details'));
const linesOf = (lines) => (Array.isArray(lines) ? lines : [lines]).map((l) => String(l ?? '')).filter((l) => l.trim());

/** The fold as an element: `<details class="tech-fold" data-fold="tech">` — closed unless `open`. `mono` sets the body
 *  in the monospace face (raw tokens: paths, commands, patterns); prose (a rule's mechanics) stays in the text face.
 *  No lines ⇒ null (a surface never draws an empty fold). */
export function techFold(lines, { summary = null, open = false, mono = false, className = '' } = {}) {
  const body = linesOf(lines);
  if (!body.length) return null;
  const d = document.createElement('details');
  d.className = 'tech-fold' + (mono ? ' tech-fold-mono' : '') + (className ? ' ' + className : '');
  d.dataset.fold = 'tech';
  if (open) d.open = true;
  const s = document.createElement('summary');
  s.textContent = summaryOf(summary);
  d.appendChild(s);
  const b = document.createElement('div');
  b.className = 'tech-fold-body';
  for (const l of body) { const p = document.createElement('div'); p.className = 'tech-fold-line'; p.textContent = l; b.appendChild(p); }
  d.appendChild(b);
  return d;
}

/** The same fold as an HTML string, for a renderer that builds strings (every line escaped). '' when there are no lines. */
export function techFoldHtml(lines, { summary = null, open = false, mono = false, className = '' } = {}) {
  const body = linesOf(lines);
  if (!body.length) return '';
  const cls = 'tech-fold' + (mono ? ' tech-fold-mono' : '') + (className ? ' ' + escHtml(className) : '');
  return `<details class="${cls}" data-fold="tech"${open ? ' open' : ''}><summary>${escHtml(summaryOf(summary))}</summary>`
    + `<div class="tech-fold-body">${body.map((l) => `<div class="tech-fold-line">${escHtml(l)}</div>`).join('')}</div></details>`;
}
