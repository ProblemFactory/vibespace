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
 * Round 3: the notice carries THE RULE that opened it (`why`, `exact` in its text's params) and the reconcile judges by that
 * rule only — a pause the index judged (an exact ratio, the ids bound) waits for the index («judging after the ledger
 * loads»), never closed by the sample, which cannot see it. Every state the remedy can be in has its own words (no
 * fallback to «removing the repeated rows»); `proven-over` and `ids` say that removing rows cannot help and that
 * VibeSpace stops trying.
 * Round 4: a pause is a fact about ONE month's file (host × month), never about the machine — its other months are recorded
 * as usual, and this month's events are HELD beside the file (bounded) and recorded in order once it is back in shape. So
 * the notice is ONE per machine × file, and it says how many events are held, the bound, and how many of the oldest were
 * dropped past it (counted, never silently); a boot also reads every hold back (`restoreHolds`).
 * Round 5: the notice's IDENTITY is (host, file) — never its words: new words (the machine renamed, a count moved, a drain
 * that failed) re-word the SAME item in place, a notice the owner marked read is reopened, never filed again, and
 * 'resumed' closes it whatever it says (r4 matched by text: a rename filed a second item and left the first open for
 * ever). A month back in shape whose held events could not be recorded (ENOSPC …) stays held and says so in its own
 * words (`drain-failed`) — it closes only once they are in the ledger.
 * Round 6: the identity holds from the FIRST filing — the item is filed with its key (user-todos `itemKey` = host id ×
 * file; its id derived from it), never matched by its words (r5 filed through add()'s text match: two machines of one
 * display name shared ONE item, and one machine's resume closed it while the other's month was still held). Two open
 * notices of one machine name are told apart by the host id's short form in their words («M (1a2b3c4d)»).
 * `wire({usageHistory, userTodos})` = server.js's one line (it sets `usageHistory.onShape`, reconciles 3 s after boot).
 */
const INBOX_KEY = 'usage-ledger';
const i18nKey = (k) => k; // the extraction marker scripts/i18n-extract.mjs reads (the keys live in the zh / ja dictionaries)
const TEXT = i18nKey('Usage of {machine} for {month} is held — the usage ledger file {shard} is out of shape');
const TEXT_DRAIN = i18nKey('Usage of {machine} for {month} is held — its held events could not be recorded yet'); // r5: back in shape, its drain failed
const D_WHAT = { size: i18nKey('What: data/usage-history/{shard} is {size} — past the 2 GiB a month of usage never needs.'), proven: i18nKey('What: data/usage-history/{shard} is {size} — over the 2 GiB bound, and a dedup pass found no repeated row in it.'), ratio: i18nKey('What: data/usage-history/{shard} is {size} and holds about {ratio}× its distinct rows — the same events written again and again.'), ids: i18nKey('What: data/usage-history/{shard} is {size} and holds more distinct ids than its index may keep.'), drain: i18nKey('What: data/usage-history/{shard} is back in shape — the events of {month} held beside it while it was not are recorded into it first, in order.') };
// r4: what is held, and where — the month only (its other months are recorded as usual), the count, the bound
const D_HELD = {
  held: i18nKey('Which machine: {machine} — only {month} is held; its other months are recorded as usual. {held} events of {month} held until the file is back in shape (beside it, at most {bound}); then they are recorded, in order.'),
  counting: i18nKey('Which machine: {machine} — only {month} is held; its other months are recorded as usual. Its held events of {month} (at most {bound}) are counted once their hold is read; they are recorded, in order, once the file is back in shape.'),
  failed: i18nKey('Which machine: {machine} — only {month} is paused; its other months are recorded as usual. Its events of {month} could not be held beside the file ({error}) — its device keeps them and sends them again.'),
  drain: i18nKey('Which machine: {machine} — only {month} is held; its other months are recorded as usual. Its {held} held events of {month} (at most {bound}) wait beside the file until they are recorded, in order.'),
};
const D_DROPPED = i18nKey('Past the bound: the {dropped} oldest held events of {month} were dropped — counted here, never recorded.');
const D_NOW = {
  running: i18nKey('What happens now: VibeSpace is removing the repeated rows in the background (the first copy of each is kept — the Usage window\'s totals do not change). If that brings the file back in shape, recording resumes and this notice closes; if not, this notice says what happened.'),
  failed: i18nKey('What happened: removing the repeated rows failed — {error}. Recording stays paused; VibeSpace tries again after {next}.'),
  'not-rewritten': i18nKey('What happened: the file was not rewritten — {error}. Recording stays paused; VibeSpace tries again after {next}.'),
  insufficient: i18nKey('What happened: {removed} repeated row(s) were removed, but the file is still {size} — still out of shape. Recording stays paused; VibeSpace checks it again after {next}.'),
  judging: i18nKey('What happens now: the file\'s index judged it out of shape before VibeSpace restarted — it counts every row, which a quick sample cannot. VibeSpace reads the index again after the ledger loads and judges the file by it; recording stays paused until then.'),
  'proven-over': i18nKey('What happened: the file is over 2 GiB and already deduplicated — removing rows cannot bring it under the bound, and VibeSpace does not split a month\'s file or raise the bound by itself, so it has stopped trying. Recording stays paused while the file is over the bound.'),
  ids: i18nKey('What happened: the month holds more distinct records than the index keeps — removing repeated rows cannot help (a dedup removes repeats only), and VibeSpace does not split a month\'s file or raise the bound by itself, so it has stopped trying. Recording stays paused for this file.'),
  none: i18nKey('What happens now: recording stays paused while the file is out of shape.'),
};
// r5: the DRAIN's own state (never a remedy's — D_NOW is a row per REMEDY_STATES, exactly): back in shape, not recorded yet
const D_DRAIN_FAILED = i18nKey('What happened: {held} held events could not be recorded: {error} — retrying at the machine\'s next harvest and at a restart.');
const D_TODO = {
  wait: i18nKey('What to do: nothing, usually. If this notice is still here in an hour, send feedback from the gear menu — the file needs a look.'),
  space: i18nKey('What to do: free space on the disk that holds VibeSpace\'s data folder — removing the repeated rows writes a new copy of the file beside it.'),
  look: i18nKey('What to do: send feedback from the gear menu — the file needs a look. VibeSpace keeps trying meanwhile.'),
  stopped: i18nKey('What to do: send feedback from the gear menu — this month\'s file needs splitting or its bound raising, by hand. VibeSpace does not try again by itself.'),
  drainSpace: i18nKey('What to do: free space on the disk that holds VibeSpace\'s data folder — the held events are written into the month\'s file.'),
};
const NO_SPACE = new Set(['ENOSPC', 'EDQUOT']);

/** r6: a host id's short form in a notice's words («host-1a2b3c4d» → «1a2b3c4d», «host-dial-Laptop» → «dial-Laptop»). */
const shortHost = (id) => String(id || '').replace(/^host-/, '').slice(0, 24);
const fillOf = (k, q) => String(k).replace(/\{(\w+)\}/g, (_, n) => (q[n] == null ? '' : String(q[n])));
const gib = (b) => `${(Math.max(0, Number(b) || 0) / 2 ** 30).toFixed(2)} GiB`;
const hhmm = (t) => { const d = new Date(Number(t) || 0); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };
/** The notice's words → {text, detail, i18n} (PURE). `remedy` = usage-history's `_remedyOf` ({state, code, error, removed,
 *  nextAt}); `host` and THE RULE that opened it (`why`, `exact`) ride the text's params (the boot reconcile reads them
 *  back). A state without words of its own is said as `none` (recording paused — no claim of what is being done). */
function noticeOf({ hostName, host, shard, month, size, ratio, why, exact, remedy, held, dropped, holdMax, holdError, drain, tag = '' } = {}) {
  // r5: a month whose held events could not be recorded says THAT (its file is back in shape — no remedy words)
  const drained = !!(drain && drain.state === 'failed');
  const r = drained ? { state: 'drain-failed', code: drain.code || null, error: drain.code || null } : remedy && typeof remedy === 'object' ? remedy : { state: 'none' };
  const state = drained ? 'drain-failed' : Object.prototype.hasOwnProperty.call(D_NOW, r.state) ? r.state : 'none';
  const sh = String(shard || '').slice(0, 60), mo = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : (/(\d{4}-\d{2})/.exec(sh) || [])[1] || 'this month';
  const name = String(hostName || host || 'a machine').slice(0, 80), t = String(tag || '').slice(0, 24);
  const p = { machine: t ? `${name} (${t})` : name, shard: sh, month: mo, size: gib(size), ratio: ratio == null ? '' : String(ratio), error: String(r.code ? `${r.code}${r.error && !String(r.error).startsWith(r.code) ? ` (${r.error})` : ''}` : r.error || 'no reason given').slice(0, 200), removed: String(Math.max(0, Number(r.removed) || 0)), next: r.nextAt ? hhmm(r.nextAt) : 'a while', held: String(Math.max(0, Number(held) || 0)), dropped: String(Math.max(0, Number(dropped) || 0)), bound: `${Math.round((Number(holdMax) || 64 * 2 ** 20) / 2 ** 20)} MiB`, holdError: String(holdError || '').slice(0, 80) };
  const what = drained ? D_WHAT.drain : state === 'proven-over' ? D_WHAT.proven : (why !== 'drain' && D_WHAT[why]) || D_WHAT.size;
  const who = drained ? D_HELD.drain : holdError ? D_HELD.failed : held == null ? D_HELD.counting : D_HELD.held;
  const now = drained ? D_DRAIN_FAILED : D_NOW[state];
  const todo = drained ? (NO_SPACE.has(r.code) ? D_TODO.drainSpace : D_TODO.look) : state === 'running' || state === 'judging' || state === 'none' ? D_TODO.wait : state === 'failed' && NO_SPACE.has(r.code) ? D_TODO.space : state === 'proven-over' || state === 'ids' ? D_TODO.stopped : D_TODO.look;
  const lines = [{ key: what, params: { shard: p.shard, size: p.size, ratio: p.ratio, month: p.month } }, { key: who, params: { machine: p.machine, month: p.month, held: p.held, bound: p.bound, error: p.holdError } }];
  if (Number(dropped) > 0) lines.push({ key: D_DROPPED, params: { dropped: p.dropped, month: p.month } }); // past the bound: counted, never silently
  lines.push({ key: now, params: { error: p.error, next: p.next, removed: p.removed, size: p.size, ...(drained ? { held: p.held } : {}) } }, { key: todo });
  const fill = (k, q = p) => fillOf(k, q);
  const head = drained ? TEXT_DRAIN : TEXT;
  return {
    text: fill(head),
    detail: lines.map((l) => fill(l.key, { ...p, ...(l.params || {}) })).join('\n'),
    i18n: { text: { key: head, params: { machine: p.machine, name, tag: t, month: p.month, shard: p.shard, host: String(host || '').slice(0, 160), why: Object.prototype.hasOwnProperty.call(D_WHAT, why) ? why : 'size', exact: exact ? '1' : '' } }, detail: lines },
  };
}

function wire({ usageHistory, userTodos, log = (m) => console.log('[usage]', m), reconcileAfterMs = 3000 } = {}) {
  if (!usageHistory) return null;
  const open = new Map(); // host × file → For-you item id (r4: ONE notice per paused month of a machine; r5: its identity)
  const keyOf = (host, shard) => `${host}\n${shard}`;
  const close = (id, by) => { try { const it = userTodos.get?.(id); if (it && it.status === 'open') userTodos.setStatus(id, 'done', by); } catch { } };
  const paramsOf = (it) => (it && it.i18n && it.i18n.text && it.i18n.text.params) || {};
  const ours = (it) => !!(it && it.sessionKey === INBOX_KEY && it.kind === 'notice' && it.origin === 'server' && !it.clearedAt);
  const nameOf = (it) => paramsOf(it).name || paramsOf(it).machine || '';
  /** r5: THE item of (host, file) — the one this process filed, else the newest the store holds for that key (open first,
   *  read or closed after); a second OPEN one (r4 filed one per wording) is closed into it ('merged'). r6: the store's key
   *  first (`itemKey`), its words' params for a notice filed before it. */
  function itemOf(host, shard) {
    const k = keyOf(host, shard), id = open.get(k), had = id && userTodos.get?.(id);
    if (ours(had)) return had;
    const ids = typeof userTodos.idsWhere === 'function' ? userTodos.idsWhere((i) => ours(i) && (i.itemKey === k || (!i.itemKey && paramsOf(i).host === String(host) && paramsOf(i).shard === String(shard)))) : [];
    const all = ids.map((x) => userTodos.get(x)).filter(Boolean).sort((a, b) => (a.status === 'open') - (b.status === 'open') || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    const keep = all[all.length - 1] || null;
    for (const o of all) if (o !== keep && o.status === 'open') close(o.id, 'merged');
    if (keep) open.set(keyOf(host, shard), keep.id);
    return keep;
  }
  /** r6: the OPEN notices of OTHER machines with this display name (two machines of one name: each told by its host id). */
  const twinsOf = (host, name) => (typeof userTodos.idsWhere === 'function' ? userTodos.idsWhere((i) => ours(i) && i.status === 'open' && nameOf(i) === name && paramsOf(i).host && paramsOf(i).host !== String(host)) : []).map((x) => userTodos.get(x)).filter(Boolean);
  /** r6: an item's words re-filled with another machine label (its stored sentences, their params) — in place. */
  function relabel(item, label) {
    userTodos.reshapeItems((it) => {
      if (it.id !== item.id || !it.i18n || !it.i18n.text || it.i18n.text.params.machine === label) return false;
      const i18n = JSON.parse(JSON.stringify(it.i18n));
      i18n.text.params.machine = label; i18n.text.params.tag = shortHost(i18n.text.params.host);
      for (const l of i18n.detail || []) if (l.params && Object.prototype.hasOwnProperty.call(l.params, 'machine')) l.params.machine = label;
      it.i18n = i18n; it.text = fillOf(i18n.text.key, i18n.text.params); it.detail = (i18n.detail || []).map((l) => fillOf(l.key, l.params || {})).join('\n');
      return true;
    });
  }
  usageHistory.onShape = (ev) => {
    if (!ev || !userTodos) return;
    if (ev.kind === 'paused') {
      const prev = itemOf(ev.host, ev.shard);
      // a name the event does not know (a hold read back at boot names its host id only) keeps the one its notice said
      const name = ev.hostName && ev.hostName !== ev.host ? ev.hostName : nameOf(prev) || ev.hostName;
      const twins = twinsOf(ev.host, name);
      const w = noticeOf({ ...ev, hostName: name, tag: twins.length ? shortHost(ev.host) : '' });
      try {
        // r6: each twin told by ITS host id too (its words re-filled in place)
        for (const t of twins) relabel(t, `${name} (${shortHost(paramsOf(t).host)})`);
        if (!prev) {
          // r6: filed by its KEY (host id × file — the item's id derived from it), never matched by its words
          const it = userTodos.add(INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Usage', text: w.text, detail: w.detail, i18n: w.i18n, itemKey: keyOf(ev.host, ev.shard) });
          if (it && it.id) open.set(keyOf(ev.host, ev.shard), it.id);
          return;
        }
        // r5: the SAME item re-worded in place (a rename, a count, a drain that failed); a read one reopened — never a second
        userTodos.reshapeItems((it, now) => {
          if (it.id !== prev.id) return false;
          const same = it.status === 'open' && it.text === w.text && it.detail === w.detail && JSON.stringify(it.i18n || null) === JSON.stringify(w.i18n);
          if (same) return false;
          it.text = w.text; it.detail = w.detail; it.i18n = w.i18n; it.urgency = 'high';
          if (it.status !== 'open') { it.status = 'open'; it.resolvedAt = null; it.resolvedBy = null; it.expiresAt = null; it.createdAt = now; delete it.judged; }
          return true;
        });
      } catch (e) { log(`the growth alarm's notice for ${name || ev.host} was not filed: ${e.message}`); }
    } else if (ev.kind === 'resumed') {
      const it = itemOf(ev.host, ev.shard); // whatever it says (r5)
      open.delete(keyOf(ev.host, ev.shard));
      if (it) close(it.id, 'shape-ok');
    }
  };
  /** Boot: every open notice re-judged BY THE RULE THAT OPENED IT — its shard still out of shape ⇒ that month paused again
   *  (the same item re-worded in place), else closed; a notice the index opened is judged by the index (usage-history
   *  restorePause: «judging» until it is read), never closed by the sample. r4: then every hold on disk is read back
   *  (usage-history restoreHolds — drained in order when its month is in shape, said with its counts when not). → how
   *  many notices it closed. */
  function reconcile() {
    if (!userTodos) return 0;
    let n = 0;
    try {
      for (const it of (userTodos.snapshot?.() || {}).open || []) {
        if (!it || it.sessionKey !== INBOX_KEY || it.kind !== 'notice' || it.origin !== 'server') continue;
        const p = (it.i18n && it.i18n.text && it.i18n.text.params) || {};
        if (open.get(keyOf(p.host, p.shard)) === it.id) continue;
        if (p.host && p.shard) { const keep = itemOf(p.host, p.shard); if (keep && keep.id !== it.id) continue; } // r5: one per (host, file) — a second was merged into it
        let rec = null;
        // the rule: its params (r3); a notice filed before them is read by its first detail line, and judged by the index
        // unless that line says size (the sample may be the rule that cannot see it)
        const d0 = (Array.isArray(it.i18n && it.i18n.detail) && it.i18n.detail[0]) || {};
        const why = p.why || Object.keys(D_WHAT).find((k) => D_WHAT[k] === d0.key) || null;
        const rule = { why: why === 'proven' ? 'size' : why, exact: p.why ? p.exact === '1' : why !== 'size' && why !== 'proven', ratio: d0.params && d0.params.ratio };
        if (p.host && p.shard) { open.set(keyOf(p.host, p.shard), it.id); try { rec = usageHistory.restorePause(p.host, p.name || p.machine, p.shard, rule); } catch { rec = null; } }
        if (!rec) { if (p.host && open.get(keyOf(p.host, p.shard)) === it.id) open.delete(keyOf(p.host, p.shard)); close(it.id, 'shape-ok'); n++; }
      }
    } catch (e) { log(`the growth alarm's notices could not be reconciled: ${e.message}`); }
    try { usageHistory.restoreHolds?.(); } catch (e) { log(`the held usage could not be read back: ${e.message}`); }
    return n;
  }
  if (reconcileAfterMs != null) setTimeout(() => { try { const n = reconcile(); if (n) log(`${n} growth-alarm notice(s) from before the restart closed — their files are in shape`); } catch { } }, reconcileAfterMs).unref?.();
  return { open, reconcile };
}

module.exports = { wire, noticeOf, INBOX_KEY, TEXT, TEXT_DRAIN, D_WHAT, D_HELD, D_DROPPED, D_NOW, D_DRAIN_FAILED, D_TODO };
