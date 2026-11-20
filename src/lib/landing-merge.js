// THE LANDING LAW (B-f212, 主开发 r281): A LANDING NEVER TAKES A PERSON'S UNSAVED PICK. PURE, no import: the «Who may use
// it…» dialog (src/lib/vault-use-row.js) calls it when its own Save lands and when another client's save of the same row
// lands; scripts/test-held-except-doors.mjs ㉗ reads its table and its seeded law.
// A dialog's FIELDS are named values: a SET (an array of keys, order free: who is picked, who is left out) or a VALUE (a
// string, a boolean, null: the hosts typed, a box, the end, the policy's words).
//   base   = the fields as the landing's writer took them: the press that POSTED (the dialog's own Save), or what landed last
//            (another client's save: what this dialog last knew of the row)
//   now    = the fields as the page shows them when the landing arrives
//   landed = the fields that landed; a field this landing does not carry is shown as it is, and its compare stays
//   clean  = what the unsaved guard compared against until now
// A SET: what landed, less what the person took out since `base`, plus what the person put in since `base`.
// A VALUE: the person's own when it changed since `base`, else what landed.
// → { fields: what the dialog shows now, clean: the guard's new compare (what landed, field by field), unsaved: the fields
//     where the two differ (the person's change, still unsaved), moved: the fields the landing changes on the page }

const isSet = (...vs) => vs.some((v) => Array.isArray(v));
const keysOf = (v) => [...new Set((Array.isArray(v) ? v : []).map(String))];
/** Two values of one field are the same: a set by its keys (order free), a value as it is. */
export function sameField(a, b) {
  if (isSet(a, b)) { const x = keysOf(a), y = new Set(keysOf(b)); return x.length === y.size && x.every((k) => y.has(k)); }
  return a === b || (a == null && b == null);
}
/** The fields where `a` and `b` differ (every field either names). */
export function fieldsDiffer(a = {}, b = {}) {
  return [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((f) => !sameField((a || {})[f], (b || {})[f]));
}
export function landingOf({ base = {}, now = {}, landed = {}, clean = {} } = {}) {
  const fields = {}, clean2 = {}, unsaved = [], moved = [];
  const names = [...new Set([...Object.keys(now || {}), ...Object.keys(landed || {}), ...Object.keys(clean || {})])];
  for (const f of names) {
    const n = now[f], has = Object.prototype.hasOwnProperty.call(landed, f) && landed[f] !== undefined;
    let out;
    if (!has) { out = n; clean2[f] = clean[f]; }
    else if (isSet(n, landed[f], base[f])) {
      const b = new Set(keysOf(base[f])), nw = keysOf(n), nwS = new Set(nw);
      const added = nw.filter((k) => !b.has(k)), removed = new Set([...b].filter((k) => !nwS.has(k)));
      out = [...new Set([...keysOf(landed[f]).filter((k) => !removed.has(k)), ...added])];
      clean2[f] = keysOf(landed[f]);
    } else {
      out = sameField(n, base[f]) ? landed[f] : n;
      clean2[f] = landed[f];
    }
    fields[f] = out;
    if (!sameField(out, clean2[f])) unsaved.push(f);
    if (!sameField(out, n)) moved.push(f);
  }
  return { fields, clean: clean2, unsaved, moved };
}
