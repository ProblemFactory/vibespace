// THE STRIP'S FACES (lane mask-value-shape, the chat status strip step two — the cure of 644a67ec2's MUST 4; page §4, the
// owner's accepted artboard: «🔒 Fable 1M · 超强推理 ▾», «全部放行 ▾»). PURE: imports nothing; `t` / `tc` are injected (the
// literal calls below are what scripts/i18n-extract.mjs reads). A FACE is chrome — the words a chip shows for a value; the VALUE
// stays the protocol's (stored, sent, the menus' own data), and the raw id stays one hover away (the chip's title) and one press
// away (its door). An id these tables do not know is its raw spelling — never hidden, never guessed.

const FAMILIES = Object.freeze({ fable: 'Fable', opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' });

/** One model token's face: claude-fable-5-1[1m] → «Fable 5.1 1M», fable[1m] → «Fable 1M», claude-opus-5-5 → «Opus 5.5»,
 *  opus → «Opus»; anything else (another harness's model, a newer family) → itself. */
export function modelTokenFace(token) {
  const s = String(token == null ? '' : token);
  let m = /^claude-(fable|opus|sonnet|haiku)-(\d{1,2})(?:-(\d{1,2}))?(\[1m\])?$/i.exec(s);
  if (m) return `${FAMILIES[m[1].toLowerCase()]} ${m[2]}${m[3] ? '.' + m[3] : ''}${m[4] ? ' 1M' : ''}`;
  m = /^(fable|opus|sonnet|haiku)(\[1m\])?$/i.exec(s);
  if (m) return `${FAMILIES[m[1].toLowerCase()]}${m[2] ? ' 1M' : ''}`;
  return s;
}
/** A model chip's label → its face: every known model token in it worded, the rest (⚠, «· refusal (cyber)») kept. */
export function modelFace(label) {
  return String(label == null ? '' : label).replace(/(?<![\w./:-])(?:claude-(?:fable|opus|sonnet|haiku)-\d{1,2}(?:-\d{1,2})?|fable|opus|sonnet|haiku)(?:\[1m\])?(?![\w./:-])/gi, (x) => modelTokenFace(x));
}

/** The thinking level's face (the levels every harness's picker spells), else the raw value. */
export function effortFace(value, tc) {
  switch (String(value == null ? '' : value)) {
    case 'low': return tc('effort', 'Low');
    case 'medium': return tc('effort', 'Medium');
    case 'high': return tc('effort', 'High');
    case 'xhigh': return tc('effort', 'Extra high');
    case 'max': return tc('effort', 'Max');
    case 'ultracode': case 'ultra': return tc('effort', 'Ultra');
    case 'minimal': return tc('effort', 'Minimal');
    case 'none': return tc('effort', 'None');
    default: return String(value == null ? '' : value);
  }
}

/** The permission mode's SHORT faces (the artboard's «全部放行»; the mode's sentence stays permission-mode-labels.js's, in the
 *  title). WHICH face a value wears is the harness's own declared row (agent-meta BACKEND_META[…].permissionModeFaces — a
 *  value means what ITS harness says: codex «default» is not claude's «ask each time»); this table only words the face. */
const PERM_FACES = (tc, t) => ({
  'Ask each time': tc('perm', 'Ask each time'), 'Accept edits': tc('perm', 'Accept edits'), 'Allow all': tc('perm', 'Allow all'),
  'Plan only': tc('perm', 'Plan only'), Auto: tc('perm', 'Auto'), 'Pre-approved only': tc('perm', 'Pre-approved only'),
  'Read only': tc('perm', 'Read only'), 'Ask on failure': tc('perm', 'Ask on failure'), 'Make changes': tc('perm', 'Make changes'), Default: t('Default'),
});
/** `faces` = the harness's declared row; a value it does not declare is its RAW spelling (never a guessed face). */
export function permissionModeFace(faces, value, tc, t) {
  const v = String(value == null ? '' : value);
  const word = faces && Object.prototype.hasOwnProperty.call(faces, v) ? faces[v] : null;
  if (!word) return v || t('Default');
  return PERM_FACES(tc, t)[word] || word;
}
