'use strict';
/**
 * THE GROWTH ALARM, SAID (lane ledger-dedup-law F4, B-7f9e). src/usage-history.js pauses a machine's usage ingest when the
 * monthly shard it writes into is out of shape (over 2 GiB, or ~2× its distinct rows in a sample) and starts the shard's
 * streaming dedup; this module is the For-you half: ONE notice per paused machine — what (the file), how big, which machine,
 * what happens now and what to do — resolved by itself when the shard is back in shape. A pause is never silent: the same
 * state rides /api/usage-stats (`ingestPaused`) to the Usage window's ledger note.
 * `wire({usageHistory, userTodos})` = server.js's one line (it sets `usageHistory.onShape`).
 */
const INBOX_KEY = 'usage-ledger';
const i18nKey = (k) => k; // the extraction marker scripts/i18n-extract.mjs reads (the keys live in the zh / ja dictionaries)
const TEXT = i18nKey('Usage of {machine} is not being recorded — the usage ledger file {shard} is out of shape ({size})');
const D_WHAT = { size: i18nKey('What: data/usage-history/{shard} is {size} — past the 2 GiB a month of usage never needs.'), ratio: i18nKey('What: data/usage-history/{shard} is {size} and holds about {ratio}× its distinct rows — the same events written again and again.'), ids: i18nKey('What: data/usage-history/{shard} is {size} and holds more distinct ids than its index may keep.') };
const D_WHO = i18nKey('Which machine: {machine} — nothing of its usage is lost: its device keeps the new events and sends them again once the file is back in shape.');
const D_NOW = i18nKey('What happens now: VibeSpace removes the repeated rows in the background (the first copy of each kept — the Usage window\'s totals do not change); recording resumes by itself and this notice closes when the file is back in shape.');
const D_TODO = i18nKey('What to do: nothing, usually. If this notice is still here in an hour, send feedback from the gear menu — the file needs a look.');

const gib = (b) => `${(Math.max(0, Number(b) || 0) / 2 ** 30).toFixed(2)} GiB`;
/** The notice's words → {text, detail, i18n} (PURE). */
function noticeOf({ hostName, host, shard, size, ratio, why } = {}) {
  const p = { machine: String(hostName || host || 'a machine').slice(0, 80), shard: String(shard || '').slice(0, 60), size: gib(size), ratio: ratio == null ? '' : String(ratio) };
  const what = D_WHAT[why] || D_WHAT.size;
  const fill = (k) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));
  return {
    text: fill(TEXT),
    detail: [what, D_WHO, D_NOW, D_TODO].map(fill).join('\n'),
    i18n: { text: { key: TEXT, params: { machine: p.machine, shard: p.shard, size: p.size } }, detail: [{ key: what, params: { shard: p.shard, size: p.size, ratio: p.ratio } }, { key: D_WHO, params: { machine: p.machine } }, { key: D_NOW }, { key: D_TODO }] },
  };
}

function wire({ usageHistory, userTodos, log = (m) => console.log('[usage]', m) } = {}) {
  if (!usageHistory) return null;
  const open = new Map(); // host → For-you item id
  usageHistory.onShape = (ev) => {
    if (!ev || !userTodos) return;
    if (ev.kind === 'paused') {
      const w = noticeOf(ev);
      try { const it = userTodos.add(INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Usage', text: w.text, detail: w.detail, i18n: w.i18n }); if (it && it.id) open.set(ev.host, it.id); }
      catch (e) { log(`the growth alarm's notice for ${ev.hostName || ev.host} was not filed: ${e.message}`); }
    } else if (ev.kind === 'resumed') {
      const id = open.get(ev.host);
      open.delete(ev.host);
      if (id) { try { const it = userTodos.get?.(id); if (it && it.status === 'open') userTodos.setStatus(id, 'done', 'shape-ok'); } catch { } }
    }
  };
  return { open };
}

module.exports = { wire, noticeOf, INBOX_KEY, TEXT, D_WHAT, D_WHO, D_NOW, D_TODO };
