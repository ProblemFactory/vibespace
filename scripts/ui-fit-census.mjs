// THE FIT CENSUS (lane ui-phone-and-fit — the owner's «走查一下所有界面», 2026-11-13): what a narrow column, a dialog's check
// row and a phone surface are measured by, ONE copy shared by the fast suite (test-ui-fit: the tree's rules and sites) and
// the browser suite (test-ui-fit-chrome: the same rules drawn). Every list here is DERIVED from the tree — the rail's doors
// from src/lib/sidebar-rail.js, the check rows from every label the client builds around a checkbox or a radio, the CSS from
// public/*.css — so a new door, a new label or a new rule is in the census the moment it lands.
import fs from 'node:fs';
import path from 'node:path';
import { selectorList, lastCompound } from './lib/css-rules.mjs'; // ONE CSS reader (pick 0's scripts/lib)

/** The client's sources (what the bundle draws): src/lib and src/plugins, recursively. */
export function clientSources(repo) {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out[path.relative(repo, p)] = fs.readFileSync(p, 'utf8'); } };
  for (const d of ['src/lib', 'src/plugins']) if (fs.existsSync(path.join(repo, d))) walk(path.join(repo, d));
  return out;
}

/** EVERY LABEL THE CLIENT BUILDS AROUND A CHECKBOX OR A RADIO → [{ file, line, classes, inline, how }]. Two spellings:
 *  markup (`<label …> … type="checkbox" … </label>` in a template) and DOM (`mk('label', 'a b')` / createElement('label')
 *  with a checkbox or a radio made in the next lines and a className set on it there). */
export function checkLabelSites(srcs) {
  const sites = [];
  for (const [file, s] of Object.entries(srcs)) {
    const lineOf = (i) => s.slice(0, i).split('\n').length;
    const reM = /<label\b([^>]*)>((?:(?!<\/?label\b)[\s\S]){0,700}?)<\/label>/g;
    for (let m; (m = reM.exec(s));) {
      if (!/type=\\?["']?(checkbox|radio)\b/.test(m[2])) continue;
      const cls = (/\bclass=\\?"([^"\\]*)/.exec(m[1]) || [])[1] || '';
      const inline = (/\bstyle=\\?"([^"\\]*)/.exec(m[1]) || [])[1] || '';
      sites.push({ file, line: lineOf(m.index), classes: cls.split(/\s+/).filter((c) => /^[\w-]+$/.test(c)), inline, how: 'markup' });
    }
    // DOM: a label variable, and a checkbox / radio variable appended INTO it within the next lines
    const reD = /\b(?:(?:const|let|var)\s+)?(\w+)\s*=\s*(?:(?:mk|el|h)\(\s*'label'\s*(?:,\s*'([^']*)')?|document\.createElement\(\s*'label'\s*\))/g;
    for (let m; (m = reD.exec(s));) {
      const v = m[1];
      const lines = s.slice(Math.max(0, m.index - 1200), m.index + 1600);
      const near = s.slice(m.index, m.index + 1600).split('\n').slice(0, 14).join('\n');
      const boxes = new Set();
      for (const q of lines.matchAll(/\b(\w+)\.type\s*=\s*'(?:checkbox|radio)'|\b(\w+)\s*=\s*[^;\n]*type:\s*'(?:checkbox|radio)'|\b(\w+)\s*=\s*[^;\n]*'input'[^;\n]*\{[^}\n]*type:\s*'(?:checkbox|radio)'/g)) boxes.add(q[1] || q[2] || q[3]);
      const into = [...near.matchAll(new RegExp(`\\b${v}\\.(?:append|appendChild|prepend)\\(([^;\\n]*)\\)`, 'g'))].map((q) => q[1]).join(',');
      if (![...boxes].some((b) => new RegExp(`(^|[^\\w.])${b}\\b`).test(into))) continue;
      let cls = m[2] || (new RegExp(`\\b${v}\\.className\\s*=\\s*'([^']*)'`).exec(near) || [])[1] || '';
      const inline = (new RegExp(`\\b${v}\\.style\\.cssText\\s*=\\s*'([^']*)'`).exec(near) || [])[1] || '';
      sites.push({ file, line: lineOf(m.index), classes: cls.split(/\s+/).filter((c) => /^[\w-]+$/.test(c)), inline, how: 'dom' });
    }
  }
  return sites;
}
/** The rules in public/*.css that would STACK a check row (its box above its words, or centred): a rule whose styled
 *  compound is a label class of `classes` and that sets a column, centres the text, or makes it a block. */
export function stackingRules(rules, cls) {
  const re = new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}(?![\\w-])`);
  return rules.filter((r) => selectorList(r.sel).some((x) => re.test(lastCompound(x)) && !/:hover|:focus|::?(before|after)|\binput\b/.test(lastCompound(x)))
    && /flex-direction:\s*column|text-align:\s*center|(^|;)\s*display:\s*block/.test(r.body));
}

/** THE RAIL'S DOORS → its panels: the PANEL_TABS list + the sidebar's own three lists, read from the source. */
export function railPanels(railSrc) {
  const m = /export const PANEL_TABS = \[([^\]]*)\]/.exec(railSrc);
  return m ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
}
