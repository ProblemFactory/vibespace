// THE PICTURE SIZE IN WORDS (lane launch-picture-size, owner 2026-10-14 「我启动浏览器或者app的时候能不能选固定画面尺寸？」→
// 「做吧」) — the client words of src/desktop-pin.js's ONE size table (SIZE_CHOICES), shared by the Apps dialog's 画面尺寸
// select (src/lib/desktop-app-launcher.js), a desktop app window's Pin size… (src/lib/desktop-app-window.js) and the agent
// browser's live view (src/lib/browser-live-window.js): the same rows, the same Custom… ask, never a list of its own.
import { t } from './i18n.js';
import { showInputDialog } from './utils.js';
import { parsePin, pinMenuModel } from '../desktop-pin.js';

/** A size in words: "1920×1080". */
export const sizeWords = (p) => `${p.w}×${p.h}`;
/** The label of a SIZE_CHOICES row (the select's option, the menu's row). */
export function sizeChoiceLabel(c) { return c && c.pin ? sizeWords(c.pin) : c && c.id === 'pane' ? t('Follow the pane') : t('Custom…'); }
/** The person's OWN size — a showInputDialog (never a native prompt) taking WxH, refused INLINE in parsePin's own words (the
 *  box keeps the text) → `{w, h}`, or null when cancelled. */
export async function askCustomSize(cur = null) {
  const typed = await showInputDialog({
    title: t('Custom picture size'), label: t('Width × height in pixels (e.g. 1600x900)'), value: cur ? `${cur.w}x${cur.h}` : '', placeholder: '1600x900', confirmText: t('Use this size'),
    validate: (v) => { const r = parsePin(v); return !r.ok ? r.error : r.pin ? '' : t('Type a size such as 1600x900 — following the pane is its own choice'); },
  });
  if (typed === null || typed === undefined) return null;
  const r = parsePin(typed);
  return r.ok ? r.pin : null;
}
/** The Pin size… rows (showContextMenu items): the table's sizes, Custom…, Auto — ✓ on the current one; `pick('WxH' | 'auto')`. */
export function pinSizeItems(cur, pick) {
  return pinMenuModel(cur).map((m) => {
    const mark = m.checked ? '✓ ' : ' ';
    if (m.kind === 'size') return { label: mark + sizeWords(m.pin), action: () => { pick(m.id); } };
    if (m.kind === 'custom') return { label: mark + (m.pin ? t('Custom ({size})…', { size: sizeWords(m.pin) }) : t('Custom…')), action: async () => { const p = await askCustomSize(m.pin); if (p) pick(`${p.w}x${p.h}`); } };
    return { label: mark + t('Auto — fit the window'), action: () => { pick('auto'); } };
  });
}
