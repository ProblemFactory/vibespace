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
  if (backend === 'antigravity') { // agy 1.4.3: --mode accept-edits|auto|plan, bypass = --dangerously-skip-permissions
    switch (v) {
      case '': return t('Default (Antigravity’s own setting)');
      case 'accept-edits': return t('Edit files freely, ask before commands');
      case 'auto': return t('Auto — a safety check decides');
      case 'plan': return t('Plan only — read and propose, change nothing');
      case 'bypassPermissions': return t('Never ask (full access)');
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

/** The SHORT name a chip shows (lane ui-language, the walk's chat-status-bar-2: the status bar's lock chip printed
 *  «default» / «bypassPermissions»). Null for a mode we do not know — the caller shows the raw value. */
export function permissionModeShort(backend, value, t) {
  const v = String(value == null ? '' : value);
  if (backend === 'codex') return { '': t('Default'), 'read-only': t('Read only'), 'safe-yolo': t('Ask on failure'), yolo: t('Full access') }[v] || null;
  if (backend === 'opencode') return { '': t('Default'), build: t('Build'), plan: t('Plan only') }[v] || null;
  if (backend === 'antigravity') return { '': t('Default'), 'accept-edits': t('Edit freely'), auto: t('Auto'), plan: t('Plan only'), bypassPermissions: t('Full access') }[v] || null;
  return { '': t('Default'), default: t('Ask first'), manual: t('Ask first'), acceptEdits: t('Edit freely'), auto: t('Auto'), bypassPermissions: t('Full access'), dontAsk: t('Pre-approved only'), plan: t('Plan only') }[v] || null;
}

/** A mode that lets the agent act with NO confirmation at all — the menu draws it in the warning colour. */
export function permissionModeDanger(backend, value) {
  const v = String(value == null ? '' : value);
  return backend === 'codex' ? v === 'yolo' : v === 'bypassPermissions';
}

/** Options for a select: [{value, label}] in the given order. */
export function permissionModeOptions(backend, values, t) {
  return (values || []).map((value) => ({ value, label: permissionModeLabel(backend, value, t) }));
}
