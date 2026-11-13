// THE CSS RULES, READ (lane ui-phone-and-fit — shared by the fit censuses of every UI lane): every innermost rule of a sheet
// (inside @media / @container / @supports / @layer too), its selector list split at top-level commas, the compound a selector
// styles. Plain ES module, no dependency.
/** public/*.css → [{ file, sel, body, at }] — every innermost rule (inside @media / @container / @supports too). Comments
 *  dropped; `at` = the byte offset (rule order: a later rule of the same weight wins). */
export function cssRules(text, file = '') {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const out = [];
  const walk = (from, to) => {
    let i = from;
    while (i < to) {
      const open = src.indexOf('{', i);
      if (open < 0 || open >= to) return;
      const head = src.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < to && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
      if (head.startsWith('@')) { if (/^@(media|container|supports|layer)\b/.test(head)) walk(open + 1, j - 1); }
      else out.push({ file, sel: head.replace(/\s+/g, ' '), body: src.slice(open + 1, j - 1).replace(/\s+/g, ' ').trim(), at: open });
      i = j;
    }
  };
  walk(0, src.length);
  return out;
}
/** Split a selector list at its top-level commas (`:is(a, b)` stays whole). */
export function selectorList(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) { if (ch === '(') depth++; else if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** The last compound of a complex selector (what the rule styles). */
export const lastCompound = (s) => { let depth = 0, cut = 0; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === '(') depth++; else if (ch === ')') depth--; else if (!depth && /[\s>+~]/.test(ch)) cut = i + 1; } return s.slice(cut).trim(); };
