// THE WORDS of the entry label's fact line (主开发 r4483, the owner's word, 2026-11-25) — Settings → Claude → «Entry label of
// chat conversations»: what the STORED value makes the next chat start pass, and a refused typed name by its reason. The rule
// is PURE src/claude-entry-label.js (the Claude adapter reads it, so the device agent's bundle carries the rule — never these
// words); settings-ui draws the line under the row (fact 'entry-label') and draws it again at every change of the row.
import { t } from './i18n.js';
import { entryLabelOf, REFUSALS } from '../claude-entry-label.js';

/** a refusal code's reason, in words (every code of REFUSALS has one — scripts/test-claude-entry-label.mjs counts them) */
const WHY = Object.freeze({
  entry_name_empty: () => t('nothing typed'),
  entry_name_shape: () => t('only a–z, 0–9, _ and -, 1 to 32 characters, starting with a letter'),
  entry_name_cli: () => t('the CLI rewrites cli on a chat start'),
  entry_name_sdk: () => t('a name may not start with sdk'),
  entry_name_vendor: () => t('one of the CLI\'s own names'),
  entry_name_remote: () => t('a name may not start with remote'),
  entry_name_reserved: () => t('a reserved name'),
});
export const ENTRY_REFUSAL_CODES = REFUSALS;

/** the reason a typed name is refused, in words (an unknown code: the generic reason, never a code shown to a person) */
export function entryRefusalWords(code) { return (WHY[code] || WHY.entry_name_shape)(); }

const clip = (s, n = 40) => { const v = String(s == null ? '' : s); return v.length > n ? v.slice(0, n - 1) + '…' : v; };

/** The fact line for the stored value: off (the CLI's own label), the name the next chat start reports, or a refused typed name
 *  with its reason (nothing is passed). */
export function entryFactText(value) {
  const l = entryLabelOf(value);
  if (l.on) return t('Chat conversations report «{name}» from their next start.', { name: l.name });
  if (l.refused) return t('«{name}» is not used ({why}): nothing is passed, the CLI\'s own label stands.', { name: clip(value), why: entryRefusalWords(l.refused) });
  return t('Off: chat conversations report the CLI\'s own label.');
}
