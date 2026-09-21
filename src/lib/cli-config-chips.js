// PURE (DOM-free, `t` injected — the usage-source.js precedent) — THE WORDING
// of a CLI-config receipt (docs/design-harness-settings.zh.md §4.3): what the
// Settings window's apply chip, the Machines card and the remote-host row say
// about ONE managed key on ONE machine. One function so the three surfaces
// cannot drift, and so scripts/test-harness-settings.mjs can drive every
// state without a browser. A receipt is the server's fresh read (D2: never a
// persisted "applied at"); `lastWrite` is the in-memory local write receipt.
//   receiptLine(r, { t, where, lastWriteAt, now }) → { tone: 'ok'|'warn'|'bad'|'dim', text }
//   tone maps to the existing .ob-ok / .ob-warn / .ob-bad classes (theme vars).
const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'string' ? JSON.stringify(v) : String(v));
function ago(ms, t) {
  if (!(ms >= 0)) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return t('just now');
  if (m < 60) return t('{n} min ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return t('{n} h ago', { n: h });
  return t('{n} d ago', { n: Math.round(h / 24) });
}
/** One line for one receipt. `where` = the machine's label ("this machine" or a host name). */
export function receiptLine(r, { t, where, lastWriteAt = null, now = Date.now(), remote = false } = {}) {
  const file = r.rel ? '~/' + r.rel : (r.file || '');
  const target = r.path ? `${file} → ${r.path}` : file;
  switch (r && r.state) {
    case 'applied':
    case 'unchanged': {
      const when = lastWriteAt ? ` · ${t('written {ago}', { ago: ago(now - lastWriteAt, t) })}` : '';
      return { tone: 'ok', text: `✓ ${where}: ${target} = ${fmt(r.want)}${when}` };
    }
    case 'differs':
      return { tone: 'warn', text: `⚠ ${where}: ${target} ${t('is {current} (wanted {want})', { current: fmt(r.current), want: fmt(r.want) })} — ${remote ? t('written at the next tool install or session start on that machine') : t('written again at the next start or setting change')}` };
    case 'missing':
      return { tone: 'warn', text: `? ${where}: ${file} ${t('not found — start the CLI once to create it')}` };
    case 'unreadable':
    case 'refused':
      return { tone: 'bad', text: `⚠ ${where}: ${file} ${t('is not valid after a hand edit — not touched')}${r.reason ? ` (${r.reason})` : ''}` };
    case 'error':
      return { tone: 'bad', text: `⚠ ${where}: ${t('could not be written')}${r.reason ? ` — ${r.reason}` : ''}` };
    case 'unknown':
    default:
      if (r && /no-node/.test(String(r.reason || ''))) return { tone: 'bad', text: `✗ ${where}: ${t('node missing on the host — agent tools cannot run')}` };
      return { tone: 'dim', text: `? ${where}: ${t('not checked — reinstall the agent tools')}` };
  }
}
/** The "leave it alone" line for a cli-config row whose value is its `off` value. */
export function offLine({ t, rel, path }) {
  return { tone: 'dim', text: `${t("Leaving the CLI's own value alone")} (${rel ? '~/' + rel : ''}${path ? ' → ' + path : ''})` };
}
/** The chip head for a row by its apply kind (what the value is FOR). */
export function applyHead(apply, { t } = {}) {
  if (!apply) return null;
  if (apply.kind === 'spawn') return `${t('Applies to new sessions')}${apply.mode === 'terminal' ? ` (${t('terminal mode')})` : ''} · ${apply.how}${apply.live ? ` · ${t('running chat sessions follow from their next turn')}` : ''}`;
  if (apply.kind === 'server') return `${t('Read by VibeSpace')} · ${apply.how}`;
  if (apply.kind === 'cli-config') return t('Written into the CLI config');
  return null;
}
