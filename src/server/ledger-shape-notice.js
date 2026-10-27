'use strict';
/**
 * THE GROWTH ALARM, SAID (lane ledger-dedup-law F4, B-7f9e). src/usage-history.js pauses a machine's usage ingest when the
 * monthly shard it writes into is out of shape (over 2 GiB, or over 2× its distinct rows) and starts the shard's streaming
 * dedup; this module is the For-you half: ONE notice per paused machine — what (the file), how big, which machine, what is
 * happening or what HAPPENED, and what to do — resolved by itself when the shard is back in shape. A pause is never silent:
 * the same state rides /api/usage-stats (`ingestPaused`) to the Usage window's ledger note.
 * Round 2 (the acceptance): the notice never promises — while the dedup runs it says what follows if it works; a dedup
 * that failed (ENOSPC …), did not rewrite the file (it was replaced …) or left it still out of shape is SAID, with the time
 * of the next try (usage-history retries at a later pause, with backoff) and what to do. Its text names the machine and
 * the file only, so a new size or a new outcome re-words the SAME item in place; a boot re-judges every open one
 * (`reconcile`: still out of shape ⇒ the host paused again and its one notice kept, else closed).
 * `wire({usageHistory, userTodos})` = server.js's one line (it sets `usageHistory.onShape`, reconciles 3 s after boot).
 */
const INBOX_KEY = 'usage-ledger';
const i18nKey = (k) => k; // the extraction marker scripts/i18n-extract.mjs reads (the keys live in the zh / ja dictionaries)
const TEXT = i18nKey('Usage of {machine} is not being recorded — the usage ledger file {shard} is out of shape');
const D_WHAT = { size: i18nKey('What: data/usage-history/{shard} is {size} — past the 2 GiB a month of usage never needs.'), ratio: i18nKey('What: data/usage-history/{shard} is {size} and holds about {ratio}× its distinct rows — the same events written again and again.'), ids: i18nKey('What: data/usage-history/{shard} is {size} and holds more distinct ids than its index may keep.') };
const D_WHO = i18nKey('Which machine: {machine} — nothing of its usage is lost: its device keeps the new events and sends them again once the file is back in shape.');
const D_NOW = {
  running: i18nKey('What happens now: VibeSpace is removing the repeated rows in the background (the first copy of each is kept — the Usage window\'s totals do not change). If that brings the file back in shape, recording resumes and this notice closes; if not, this notice says what happened.'),
  failed: i18nKey('What happened: removing the repeated rows failed — {error}. Recording stays paused; VibeSpace tries again after {next}.'),
  'not-rewritten': i18nKey('What happened: the file was not rewritten — {error}. Recording stays paused; VibeSpace tries again after {next}.'),
  insufficient: i18nKey('What happened: {removed} repeated row(s) were removed, but the file is still {size} — still out of shape. Recording stays paused; VibeSpace checks it again after {next}.'),
  none: i18nKey('What happens now: recording stays paused while the file is out of shape.'),
};
const D_TODO = {
  wait: i18nKey('What to do: nothing, usually. If this notice is still here in an hour, send feedback from the gear menu — the file needs a look.'),
  space: i18nKey('What to do: free space on the disk that holds VibeSpace\'s data folder — removing the repeated rows writes a new copy of the file beside it.'),
  look: i18nKey('What to do: send feedback from the gear menu — the file needs a look. VibeSpace keeps trying meanwhile.'),
};
const NO_SPACE = new Set(['ENOSPC', 'EDQUOT']);

const gib = (b) => `${(Math.max(0, Number(b) || 0) / 2 ** 30).toFixed(2)} GiB`;
const hhmm = (t) => { const d = new Date(Number(t) || 0); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };
/** The notice's words → {text, detail, i18n} (PURE). `remedy` = usage-history's `_remedyOf` ({state, code, error, removed,
 *  nextAt}); `host` rides the text's params (the boot reconcile reads it back). */
function noticeOf({ hostName, host, shard, size, ratio, why, remedy } = {}) {
  const r = remedy && typeof remedy === 'object' ? remedy : { state: 'running' };
  const state = Object.prototype.hasOwnProperty.call(D_NOW, r.state) ? r.state : 'running';
  const p = { machine: String(hostName || host || 'a machine').slice(0, 80), shard: String(shard || '').slice(0, 60), size: gib(size), ratio: ratio == null ? '' : String(ratio), error: String(r.code ? `${r.code}${r.error && !String(r.error).startsWith(r.code) ? ` (${r.error})` : ''}` : r.error || 'no reason given').slice(0, 200), removed: String(Math.max(0, Number(r.removed) || 0)), next: r.nextAt ? hhmm(r.nextAt) : 'a while' };
  const what = D_WHAT[why] || D_WHAT.size;
  const now = D_NOW[state];
  const todo = state === 'running' ? D_TODO.wait : state === 'failed' && NO_SPACE.has(r.code) ? D_TODO.space : state === 'none' ? D_TODO.wait : D_TODO.look;
  const fill = (k) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));
  return {
    text: fill(TEXT),
    detail: [what, D_WHO, now, todo].map(fill).join('\n'),
    i18n: { text: { key: TEXT, params: { machine: p.machine, shard: p.shard, host: String(host || '').slice(0, 160) } }, detail: [{ key: what, params: { shard: p.shard, size: p.size, ratio: p.ratio } }, { key: D_WHO, params: { machine: p.machine } }, { key: now, params: { error: p.error, next: p.next, removed: p.removed, size: p.size } }, { key: todo }] },
  };
}

function wire({ usageHistory, userTodos, log = (m) => console.log('[usage]', m), reconcileAfterMs = 3000 } = {}) {
  if (!usageHistory) return null;
  const open = new Map(); // host → For-you item id (ONE notice per host)
  const close = (id, by) => { try { const it = userTodos.get?.(id); if (it && it.status === 'open') userTodos.setStatus(id, 'done', by); } catch { } };
  usageHistory.onShape = (ev) => {
    if (!ev || !userTodos) return;
    if (ev.kind === 'paused') {
      const w = noticeOf(ev);
      try {
        const it = userTodos.add(INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Usage', text: w.text, detail: w.detail, i18n: w.i18n });
        const was = open.get(ev.host);
        if (was && it && it.id !== was) close(was, 'shape-moved'); // another month's file: still ONE notice for the machine
        if (it && it.id) open.set(ev.host, it.id);
      } catch (e) { log(`the growth alarm's notice for ${ev.hostName || ev.host} was not filed: ${e.message}`); }
    } else if (ev.kind === 'resumed') {
      const id = open.get(ev.host);
      open.delete(ev.host);
      if (id) close(id, 'shape-ok');
    }
  };
  /** Boot: every open notice re-judged from the paused state — its shard still out of shape ⇒ the host paused again (the
   *  same item re-worded in place), else closed. → how many it closed. */
  function reconcile() {
    if (!userTodos) return 0;
    let n = 0;
    try {
      for (const it of (userTodos.snapshot?.() || {}).open || []) {
        if (!it || it.sessionKey !== INBOX_KEY || it.kind !== 'notice' || it.origin !== 'server') continue;
        const p = (it.i18n && it.i18n.text && it.i18n.text.params) || {};
        if (open.has(p.host) && open.get(p.host) === it.id) continue;
        let rec = null;
        if (p.host && p.shard) { open.set(p.host, it.id); try { rec = usageHistory.restorePause(p.host, p.machine, p.shard); } catch { rec = null; } }
        if (!rec) { if (p.host && open.get(p.host) === it.id) open.delete(p.host); close(it.id, 'shape-ok'); n++; }
      }
    } catch (e) { log(`the growth alarm's notices could not be reconciled: ${e.message}`); }
    return n;
  }
  if (reconcileAfterMs != null) setTimeout(() => { try { const n = reconcile(); if (n) log(`${n} growth-alarm notice(s) from before the restart closed — their files are in shape`); } catch { } }, reconcileAfterMs).unref?.();
  return { open, reconcile };
}

module.exports = { wire, noticeOf, INBOX_KEY, TEXT, D_WHAT, D_WHO, D_NOW, D_TODO };
