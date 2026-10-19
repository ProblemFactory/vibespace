// lane device-allow-flags (design q-042 §3 D5, owner decision ③): a paired machine's OWN allow list in words — the Machines
// card's line, the pairing dialog's boxes and the Activity rows say the same words. The flags live in PURE
// src/device-policy.js; the list lives ON the device (only the pairing command, run there, changes it).
import { t } from './i18n.js';
import { FLAGS, IMPLIES, normalize, allowArg } from '../device-policy.js';

export { FLAGS, IMPLIES, normalize };
/** The `--allow` text of a list (`all` / `none` / the flags joined by commas). */
export const allowArgOf = (list) => allowArg(list);

/** The order a person reads them in (the card, the boxes): what a conversation needs first, the reach-out ones last.
 *  The command's `--allow` keeps FLAGS order (normalize). */
export const SHOWN = Object.freeze(['run', 'files', 'sessions', 'upgrade', 'socks', 'lan', 'input']);

/** One flag's word. */
export function allowWord(flag) {
  switch (flag) {
    case 'run': return t('commands');
    case 'files': return t('files');
    case 'input': return t('keyboard & mouse');
    case 'socks': return 'SOCKS';
    case 'lan': return t('LAN');
    case 'sessions': return t('sessions');
    case 'upgrade': return t('updates');
    default: return String(flag || '');
  }
}

/** The card's line: what it allows | what is off (a machine paired before the lists existed says so). */
export function allowLineText(p) {
  if (!p || !Array.isArray(p.allow)) return '';
  if (p.source === 'legacy') return t('Allows everything — paired before allow lists existed');
  if (p.source === 'unreadable') return t('Allows only reads — its allow list could not be read');
  const on = SHOWN.filter((f) => normalize(p.allow).includes(f));
  const off = SHOWN.filter((f) => !on.includes(f));
  if (!off.length) return t('Allows everything');
  const words = (list) => list.map(allowWord).join(' · ');
  if (!on.length) return t('Allows only reads | Off: {off}', { off: words(off) });
  return t('Allows: {on} | Off: {off}', { on: words(on), off: words(off) });
}

/** How the list changes — the person, on the machine. */
export const allowRemedyText = (machine) => t('Only re-running the pairing command on {machine} changes this list (Remote → {machine} → Pairing command → tick what it may do).', { machine: machine || '?' });
