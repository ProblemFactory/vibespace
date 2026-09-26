// PERMISSION MODES IN PLAIN WORDS (lane L, 2026-09-25 — the naive-user study:
// the New Session dialog listed raw protocol values — "bypassPermissions",
// "dontAsk", "acceptEdits" — to people who had never seen the CLI). PURE:
// imports nothing; `t` is injected (the literal t() calls below, with their English strings, are what
// scripts/i18n-extract.mjs reads). The VALUES stay the protocol strings the
// CLI takes (`--permission-mode <value>`); only the text a person reads
// changes, and it keeps the raw value as a hint after a middle dot, so the
// words a manual or an error message uses can still be matched.

/** The human words for one mode, or null when the mode is not one we know
 *  (a newer CLI's mode is shown by its raw value, never hidden). */
export function permissionModeWords(backend, value, t) {
  const v = String(value == null ? '' : value);
  if (backend === 'codex') {
    switch (v) {
      case '': return t('Default — work in the folder, ask for more');
      case 'read-only': return t('Read only — change nothing');
      case 'safe-yolo': return t('Work freely, ask only when something fails');
      case 'yolo': return t('Never ask (full access)');
      default: return null;
    }
  }
  if (backend === 'opencode') {
    switch (v) {
      case '': return t('Default');
      case 'build': return t('Build — make changes');
      case 'plan': return t('Plan only — read and propose, change nothing');
      default: return null;
    }
  }
  switch (v) { // claude
    case '': return t('Default (Claude Code’s own setting)');
    case 'default': case 'manual': return t('Ask before acting'); // 2.1.281's --help lists `manual`, which the CLI maps to `default`
    case 'acceptEdits': return t('Edit files freely, ask before commands');
    case 'auto': return t('Auto — a safety check decides');
    case 'bypassPermissions': return t('Never ask (full access)');
    case 'dontAsk': return t('Never ask — refuse what is not pre-approved');
    case 'plan': return t('Plan only — read and propose, change nothing');
    default: return null;
  }
}

/** The option text: the words, then the raw value as a hint ("Ask before acting · default");
 *  the empty value has no raw spelling; an unknown value is its raw spelling. */
export function permissionModeLabel(backend, value, t) {
  const v = String(value == null ? '' : value);
  const words = permissionModeWords(backend, v, t);
  if (!words) return v || t('Default');
  return v ? `${words} · ${v}` : words;
}

/** Options for a select: [{value, label}] in the given order. */
export function permissionModeOptions(backend, values, t) {
  return (values || []).map((value) => ({ value, label: permissionModeLabel(backend, value, t) }));
}
