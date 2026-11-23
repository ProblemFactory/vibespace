// row B-422c (主开发 r3077): THE NOTICE NAMES THE CAUSE IT HAS. The transcript reader's refusal of a history, said in the page's words
// by its KIND. The hub sends the facts it holds: `storageHung` (the storage did not answer), `readerGone` (the reader closed for good),
// `readerCause` ('busy': the reader is alive and busy or at its bound; 'restarting': no live worker, one is being started again). The
// storage's and a gone reader outrank the cause; with none of them known the sentence names NO cause. ONE table for every place that
// says it (the chat's toast, the line where the history would be, the search's status) — PURE but for `t` (the page's language).
import { t } from './i18n.js';

/** the refusal's facts → 'storage' | 'gone' | 'busy' | 'restarting' | null (not known) */
export function readerKindOf(info) {
  if (!info) return null;
  if (info.storageHung) return 'storage';
  if (info.readerGone) return 'gone';
  return info.readerCause === 'busy' || info.readerCause === 'restarting' ? info.readerCause : null;
}

/** a READ THE PERSON ASKED (a scroll, a seek, a search, a listing) was refused: they ask again — `when`: the next try on the page's
 *  clock (null: none promised) */
export function readerAskWords(info, when = null) {
  const k = readerKindOf(info);
  if (k === 'storage') return t("This conversation's file is not answering — trying again at {time}.", { time: when });
  if (k === 'gone') return when ? t('The transcript reader is not running — trying again at {time}.', { time: when }) : t('The transcript reader is not running.');
  if (k === 'busy') return t('The transcript reader is busy — try again in a moment.');
  if (k === 'restarting') return t('The transcript reader is restarting — try again in a moment.');
  return t("This conversation's history could not be read just now — try again in a moment.");
}

/** the HISTORY WAITS (one line where it would be): the page asks again BY ITSELF — `when`: that ask on the page's clock */
export function readerLineWords(info, when) {
  const k = readerKindOf(info);
  if (k === 'storage') return t("This conversation's file is not answering, so its history is not loaded yet (or not all of it). Trying again at {time} — it fills in here by itself.", { time: when });
  if (k === 'gone') return t('The history is not loaded yet, or not all of it — the transcript reader is not running. Trying again at {time}.', { time: when });
  if (k === 'busy') return t('The history is not loaded yet, or not all of it — the transcript reader is busy. It fills in here by itself in a moment.');
  if (k === 'restarting') return t('The history is not loaded yet, or not all of it — the transcript reader is restarting. It fills in here by itself in a moment.');
  return t('The history is not loaded yet, or not all of it — it could not be read just now. It fills in here by itself in a moment.');
}
