'use strict';
/**
 * B-e3fe follow-up (主开发's verdict 2026-11-19 04:02Z: THE HOLD IS NOT SILENT) — the unreadable record of waiting messages, said
 * in For you WITH ITS DOOR (ORCH). src/server/queued-wakes.js never writes data/msg-queued.json over while it cannot be read (B-e3fe):
 * the messages waiting now live in this process's memory only until it reads again, and a restart in that state drops their words.
 * The person learns it HERE, as the spend ledger's unreadable notice does: ONE For-you item (origin `server`, «This machine») while
 * the file cannot be read, naming the file — action `queued-file-unread`, whose door is the For-you window's «Set it aside»
 * (POST /api/queued-wakes/set-aside, declared by its src/foryou-actions.js row: the file renamed aside off the loop — nothing is
 * deleted — and the record written again from what waits now; a person's press). The item resolves itself when the file reads
 * again, is removed, or is set aside.
 */
const i18nKey = (s) => s;   // a DECLARED human-visible string (scripts/i18n-extract.mjs): zh + ja in src/lib/i18n-zh.js / i18n-ja.js
const ITEM_KEY = 'queued-wakes';
const TYPE = 'queued-file-unread';
const TEXT = i18nKey('VibeSpace could not read {file}, its record of messages waiting behind running turns: the messages waiting now are kept in memory only until it reads again');
const DETAIL = i18nKey('A restart before then loses their words. Repair the file, or press Set it aside: the file is renamed beside it (nothing is deleted) and the record is written again from what waits now.');

/** The item's words (PURE): {text, detail, i18n}. */
function itemOf(file) {
  const params = { file: String(file || 'data/msg-queued.json') };
  return { text: TEXT.replace('{file}', params.file), detail: DETAIL, i18n: { text: { key: TEXT, params }, detail: [{ key: DETAIL }] } };
}

function create({ getUserTodos, deliver, log = () => { } }) {
  const todos = () => { try { return getUserTodos(); } catch { return null; } };
  const openItems = (t) => (t.forSession([ITEM_KEY]) || []).filter((i) => i && i.status === 'open' && i.action && i.action.type === TYPE);
  /** File the item (ONE: its itemKey) while the file cannot be read. → its id, or null */
  function said() {
    const t = todos(), st = deliver && typeof deliver.queuedFileState === 'function' ? deliver.queuedFileState() : null;
    if (!t || !st || !st.unread) return null;
    const it = itemOf('data/' + st.file);
    const r = t.add(ITEM_KEY, { origin: 'server', kind: 'action', urgency: 'high', by: 'agent', sessionName: 'Agent messages', text: it.text, detail: it.detail, i18n: it.i18n, action: { type: TYPE }, itemKey: TYPE });
    return (r && (r.id || (r.item && r.item.id))) || null;
  }
  /** The file reads again, is gone, or was set aside: the item resolves. → how many */
  function settled(how) {
    const t = todos();
    if (!t) return 0;
    let n = 0;
    for (const i of openItems(t)) { try { t.setStatus(i.id, 'done', 'queued-wakes'); n++; } catch (e) { log(`[queued] the unread-file item ${i.id} was not resolved (${how}): ${e.message}`); } }
    return n;
  }
  if (deliver && typeof deliver.onQueuedFileState === 'function') deliver.onQueuedFileState((ev) => { if (ev && ev.unread === false) settled(ev.how); });
  said();   // at wiring: the boot found it unread (queued-wakes reads its file when the ladder is built, before this wiring)
  return { said, settled };
}

module.exports = { create, itemOf, ITEM_KEY, TYPE, TEXT, DETAIL };
