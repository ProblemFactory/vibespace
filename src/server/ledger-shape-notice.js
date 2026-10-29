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
 * Round 7 (THE MOVING-LIST LAW — an open item's identity and label never change while it is open): the tag is a fact
 * about the ITEM, given once and STICKY until that item closes — a twin appearing tags the new item and, once, the open
 * ones that have none; a close relabels nobody; a re-word keeps the tag (r6 re-derived it from the open twins at each
 * filing: an open item's words flipped as OTHER machines' notices came and went). A reopened item is a new life: its
 * tag is judged again from the open twins.
 * Round 8 (A DROPPED COUNT IS A FACT OF THE SET FILE AND IS ALWAYS SAID): a count usage-history ends a hold with is put on
 * DISK before the hold may forget it — 'resumed' re-says it and closes the item, 'dropped' (a hold drained with no open
 * notice, one read back with nothing live) files an item when none says it — the store flushed at once and the answer
 * (`said`) returned: the hold writes its `retired` record only after it (r7 retired while the notice sat in the store's
 * 500 ms debounce: a restart said 0 of 33). A re-word whose count is unknown (a hold still being read: `dropped` null)
 * keeps the line it said; a count that may hold rows the ledger has (`unchecked`) says so; a count the end filtered to 0
 * removes the line. The `_held/` listing that FAILED is ONE notice ('hold-list'), closed when a listing works.
 * Round 9 (THE COUNT IS THE GENERATION'S): an item's «Past the bound» line says ONE hold's count — its generation's
 * (`gen` in the text's params), REPLACED by that generation's every count, never summed with it (r8 added an open
 * item's count to the hold's own as `carried` whenever the item had said a «dropped» count — the same generation read
 * back after a crash said «66» for 33); the count of a generation that ENDED is kept as a line of its own («Earlier: …»,
 * `earlier`) when the month's next hold re-words or reopens the item — a re-word never loses a count (r4–r8 dropped a
 * closed item's «36» when the month's next episode reopened it). A hold whose read-back FAILED (its file unreadable —
 * EACCES, EIO) is ONE notice per hold ('hold-read'), naming the file, closed when it is read.
 * Round 12 (A LINE THAT IS NO RECORD NEVER BLOCKS): a held set file's line that is no record VibeSpace writes is SET ASIDE
 * by usage-history (the file as it was, its bytes intact, in data/usage-history/_set-aside — the live one rewritten from
 * its records, an older one moved) and the hold goes on; ONE notice per hold ('set-aside') names the file, the line and
 * what was done (the rest kept, the line set aside), says nothing waits, and is closed by the owner — never «check the
 * file's permissions» (r11 failed the read-back for ever and said that).
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
// r8: a count the hold could not check against the ledger (rows read back after a restart, held while the month's index was
// not in memory) — checked, and corrected, once the file is back in shape
const D_DROPPED_MAYBE = i18nKey('Past the bound: the {dropped} oldest held events of {month} were dropped — counted here; some of them may already be recorded (checked once the file is back in shape).');
const isDropKey = (k) => k === D_DROPPED || k === D_DROPPED_MAYBE;
// r9: the count of a hold of this month that ENDED before this one (said then) — kept, as its own line
const D_DROPPED_EARLIER = i18nKey('Earlier: {dropped} held events of {month} had been dropped past the bound — counted, never recorded.');
// r9: a hold whose file could not be read back — ONE notice per hold, closed when it is read
const READ_KEY = 'hold-read';
const READ_SETTLE_MS = 60e3; // r10: the boot reconcile's bound on a read-back it started (a disk that does not answer: its own 'ok' closes it later)
const TEXT_READ = i18nKey('The held usage of {machine} for {month} cannot be read ({code}) — that month waits');
const D_READ = [
  i18nKey('What: data/usage-history/_held/{file} could not be read ({code}) since {since} — the events of {month} held for {machine} stay on the disk, unread. Until it is read, the new events of {month} from that machine wait (it keeps them and sends them again) unless the month\'s file is in shape; its other months are recorded as usual.'),
  i18nKey('What happens now: VibeSpace reads the file again by itself — after a few seconds, then less often (at most once a minute); this notice closes when it is read.'),
  i18nKey('What to do: check the file\'s permissions and the disk that holds VibeSpace\'s data folder. If this notice is still here in an hour, send feedback from the gear menu.'),
];
// r12: a held set file's line that is no record — SET ASIDE (the file as it was, its bytes intact), the hold going on: ONE
// notice per hold, re-said in place at each setting-aside, closed by the owner (nothing waits)
const ASIDE_KEY = 'set-aside';
const TEXT_ASIDE = i18nKey('A held usage file of {machine} for {month} had a line that is no record — set aside; nothing waits');
const TEXT_ASIDE_UNREAD = i18nKey('An older held usage file of {machine} for {month} could not be read ({code}) — set aside; nothing waits'); // an OLDER generation's set the disk would not read: moved aside unread
const D_ASIDE_WHAT = {
  aside: i18nKey('What: line {line} of data/usage-history/_held/{file} is no record VibeSpace writes. VibeSpace kept every other record of the file and set the line aside: the file as it was, bytes intact, is data/usage-history/_set-aside/{aside}.'),
  over: i18nKey('What: line {line} of data/usage-history/_held/{file} is no record VibeSpace writes. VibeSpace kept every other record of the file and removed the line — data/usage-history/_set-aside already holds {over} files, so no copy of it was kept.'),
  kept: i18nKey('What: line {line} of data/usage-history/_held/{file} is no record VibeSpace writes. VibeSpace read every other record of the file and read past the line; it could not set the file aside ({error}) and tries again the next time it reads it.'),
  unread: i18nKey('What: data/usage-history/_held/{file} — the record of an older hold of {month} — could not be read ({code}). VibeSpace set it aside unread, bytes intact, as data/usage-history/_set-aside/{aside}; its count of dropped events is not known.'),
};
const D_ASIDE_NOW = i18nKey('What happens now: nothing waits — the held events of {month} are recorded as usual. A line VibeSpace cannot read names no held event; at most, a count of dropped events said for {month} misses what it named.');
const D_ASIDE_TODO = i18nKey('What to do: nothing — close this notice once you have read it. If it comes back, send feedback from the gear menu: the set-aside file shows what was written.');
// r8: a count said where no pause carries it (a hold drained at a boot with no open notice, one read back with nothing live)
const TEXT_DROPPED = i18nKey('Usage of {machine} for {month}: {dropped} held events were dropped past the bound — never recorded');
const D_DROPPED_WHAT = i18nKey('What: while data/usage-history/{shard} was out of shape, the events of {month} were held beside it (at most {bound}); the rest of them are in the ledger now.');
const D_TODO_READ = i18nKey('What to do: nothing — this notice says what could not be recorded; close it once you have read it.');
// r8: the `_held/` folder could not be listed — ONE notice for the instance, closed when a listing works
const LIST_KEY = 'hold-list';
const TEXT_LIST = i18nKey('The usage hold folder cannot be read ({code}) — harvests of held months wait');
const D_LIST = [
  i18nKey('What: data/usage-history/_held could not be listed ({code}) since {since} — VibeSpace cannot tell which months of which machine are held, so a month that needs its hold (out of shape, or still being recorded from it) is not recorded yet; its machine keeps those events and sends them again.'),
  i18nKey('What happens now: VibeSpace lists the folder again by itself — after a few seconds, then less often (at most once a minute); every other month is recorded as usual, and this notice closes when a listing works.'),
  i18nKey('What to do: check the disk that holds VibeSpace\'s data folder (a network share that stopped answering, a failing disk). If this notice is still here in an hour, send feedback from the gear menu.'),
];
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
function noticeOf({ hostName, host, shard, month, size, ratio, why, exact, remedy, held, dropped, unchecked = false, holdMax, holdError, drain, tag = '', gen = null, earlier = 0, ended = null } = {}) {
  if (ended) earlier = sumOf(ended);
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
  if (Number(dropped) > 0) lines.push({ key: unchecked ? D_DROPPED_MAYBE : D_DROPPED, params: { dropped: p.dropped, month: p.month } }); // past the bound: counted, never silently
  if (Number(earlier) > 0) lines.push({ key: D_DROPPED_EARLIER, params: { dropped: String(Math.floor(Number(earlier))), month: p.month } }); // r9: an ended hold's count, kept
  lines.push({ key: now, params: { error: p.error, next: p.next, removed: p.removed, size: p.size, ...(drained ? { held: p.held } : {}) } }, { key: todo });
  const fill = (k, q = p) => fillOf(k, q);
  const head = drained ? TEXT_DRAIN : TEXT;
  return {
    text: fill(head),
    detail: lines.map((l) => fill(l.key, { ...p, ...(l.params || {}) })).join('\n'),
    i18n: { text: { key: head, params: { machine: p.machine, name, tag: t, month: p.month, shard: p.shard, host: String(host || '').slice(0, 160), why: Object.prototype.hasOwnProperty.call(D_WHAT, why) ? why : 'size', exact: exact ? '1' : '', ...genParams(gen, earlier, ended) } }, detail: lines },
  };
}
/** r9: the generation an item's count is of, and the count of the ones that ended before it (text params). r10: each
 *  ended generation's own count (`ended`: «gen:count,…», `?` = a count of no known generation) — an older generation's
 *  count read late REPLACES its own entry, never adds to the sum (`earlier` = their sum, the words'). */
const ENDED_MAX = 64;
const endedOf = (q) => {
  const m = new Map();
  for (const part of String((q && q.ended) || '').split(',')) { const x = /^(\d+|\?):(\d+)$/.exec(part); if (x) m.set(x[1], Number(x[2])); }
  const sum = [...m.values()].reduce((a, b) => a + b, 0), legacy = Math.max(0, Math.floor(Number(q && q.earlier) || 0) - sum); // an item of r9's words: its sum, no generation known
  if (legacy) m.set('?', (m.get('?') || 0) + legacy);
  return m;
};
const endedText = (m) => {
  let q = 0; const all = [];
  for (const [g, n] of m || new Map()) { if (!(n > 0)) continue; if (g === '?') q += n; else all.push([g, n]); }
  all.sort((x, y) => Number(x[0]) - Number(y[0]));
  while (all.length > ENDED_MAX - 1) q += all.shift()[1]; // bounded: the oldest folded into «?» (their sum kept)
  return [...(q ? [['?', q]] : []), ...all].map(([g, n]) => `${g}:${n}`).join(',');
};
const sumOf = (m) => [...(m || new Map())].reduce((a, [, n]) => a + n, 0);
const genParams = (gen, earlier, ended = null) => {
  const e = ended ? sumOf(ended) : Math.floor(Number(earlier) || 0), t = ended ? endedText(ended) : '';
  return { ...(gen != null && gen !== '' ? { gen: String(gen) } : {}), ...(e > 0 ? { earlier: String(e) } : {}), ...(t ? { ended: t } : {}) };
};

/** r8: the words of a count said where no pause carries it (PURE) → {text, detail, i18n}. */
function droppedNoticeOf({ hostName, host, shard, month, dropped, holdMax, tag = '', gen = null, earlier = 0, ended = null } = {}) {
  if (ended) earlier = sumOf(ended);
  const sh = String(shard || '').slice(0, 60), mo = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : (/(\d{4}-\d{2})/.exec(sh) || [])[1] || 'this month';
  const name = String(hostName || host || 'a machine').slice(0, 80), t = String(tag || '').slice(0, 24);
  const p = { machine: t ? `${name} (${t})` : name, shard: sh, month: mo, dropped: String(Math.max(0, Number(dropped) || 0)), bound: `${Math.round((Number(holdMax) || 64 * 2 ** 20) / 2 ** 20)} MiB` };
  const lines = [{ key: D_DROPPED_WHAT, params: { shard: p.shard, month: p.month, bound: p.bound } }, { key: D_DROPPED, params: { dropped: p.dropped, month: p.month } }, ...(Number(earlier) > 0 ? [{ key: D_DROPPED_EARLIER, params: { dropped: String(Math.floor(Number(earlier))), month: p.month } }] : []), { key: D_TODO_READ }];
  return {
    text: fillOf(TEXT_DROPPED, p),
    detail: lines.map((l) => fillOf(l.key, { ...p, ...(l.params || {}) })).join('\n'),
    i18n: { text: { key: TEXT_DROPPED, params: { machine: p.machine, name, tag: t, month: p.month, shard: p.shard, dropped: p.dropped, host: String(host || '').slice(0, 160), why: 'drain', exact: '', ...genParams(gen, earlier, ended) } }, detail: lines },
  };
}
/** r9: the words of a hold whose file could not be read back (PURE). */
function readNoticeOf({ hostName, host, shard, month, file, code, since, tag = '' } = {}) {
  const sh = String(shard || '').slice(0, 60), mo = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : (/(\d{4}-\d{2})/.exec(sh) || [])[1] || 'this month';
  const name = String(hostName || host || 'a machine').slice(0, 80), t = String(tag || '').slice(0, 24);
  const p = { machine: t ? `${name} (${t})` : name, month: mo, file: String(file || '').slice(0, 120), code: String(code || 'an error').slice(0, 40), since: since ? hhmm(since) : 'a while' };
  const lines = D_READ.map((key, i) => (i === 0 ? { key, params: { file: p.file, code: p.code, since: p.since, month: p.month, machine: p.machine } } : { key }));
  return { text: fillOf(TEXT_READ, p), detail: lines.map((l) => fillOf(l.key, { ...p, ...(l.params || {}) })).join('\n'), i18n: { text: { key: TEXT_READ, params: { machine: p.machine, name, tag: t, month: p.month, shard: sh, host: String(host || '').slice(0, 160), code: p.code } }, detail: lines } };
}
/** r12: the words of a held set file's line set aside — or an older one the disk would not read, moved aside unread (PURE):
 *  the file, its line(s), what was done, that nothing waits; `aside` = the set-aside copy's name (`over`: the folder past its
 *  bound, no copy; neither: it could not be set aside, `error`). */
function asideNoticeOf({ hostName, host, shard, month, file, lines, aside, over, code, error, tag = '' } = {}) {
  const sh = String(shard || '').slice(0, 60), mo = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : (/(\d{4}-\d{2})/.exec(sh) || [])[1] || 'this month';
  const name = String(hostName || host || 'a machine').slice(0, 80), t = String(tag || '').slice(0, 24);
  const p = { machine: t ? `${name} (${t})` : name, month: mo, file: String(file || '').slice(0, 120), line: String(lines || '').slice(0, 60), aside: String(aside || '').slice(0, 160), over: String(Math.max(0, Number(over) || 0)), code: String(code || '').slice(0, 40), error: String(error || 'an error').slice(0, 40) };
  const unread = !lines && !!code, head = unread ? TEXT_ASIDE_UNREAD : TEXT_ASIDE;
  const what = unread ? D_ASIDE_WHAT.unread : aside ? D_ASIDE_WHAT.aside : over ? D_ASIDE_WHAT.over : D_ASIDE_WHAT.kept;
  const rows = [{ key: what, params: { line: p.line, file: p.file, aside: p.aside, over: p.over, error: p.error, code: p.code, month: p.month } }, { key: D_ASIDE_NOW, params: { month: p.month } }, { key: D_ASIDE_TODO }];
  return { text: fillOf(head, p), detail: rows.map((l) => fillOf(l.key, { ...p, ...(l.params || {}) })).join('\n'), i18n: { text: { key: head, params: { machine: p.machine, name, tag: t, month: p.month, shard: sh, host: String(host || '').slice(0, 160), code: p.code } }, detail: rows } };
}
/** r8: the words of the `_held/` listing that failed (PURE). */
function listNoticeOf({ code, since } = {}) {
  const p = { code: String(code || 'an error').slice(0, 40), since: since ? hhmm(since) : 'a while' };
  const lines = D_LIST.map((key, i) => (i === 0 ? { key, params: { code: p.code, since: p.since } } : { key }));
  return { text: fillOf(TEXT_LIST, p), detail: lines.map((l) => fillOf(l.key, { ...p, ...(l.params || {}) })).join('\n'), i18n: { text: { key: TEXT_LIST, params: { code: p.code } }, detail: lines } };
}

function wire({ usageHistory, userTodos, log = (m) => console.log('[usage]', m), reconcileAfterMs = 3000 } = {}) {
  if (!usageHistory) return null;
  const open = new Map(); // host × file → For-you item id (r4: ONE notice per paused month of a machine; r5: its identity)
  /** r8: THE one filing of this module (a pause, a count said, the listing) — by its key, never by its words (r6). */
  const fileItem = (w, itemKey, urgency = 'high') => userTodos.add(INBOX_KEY, { origin: 'server', kind: 'notice', urgency, by: 'agent', sessionName: 'Usage', text: w.text, detail: w.detail, i18n: w.i18n, itemKey }); // r12: a set-aside line's notice is 'normal' (nothing waits)
  const keyOf = (host, shard) => `${host}\n${shard}`;
  const close = (id, by) => { try { const it = userTodos.get?.(id); if (it && it.status === 'open') userTodos.setStatus(id, 'done', by); } catch { } };
  const paramsOf = (it) => (it && it.i18n && it.i18n.text && it.i18n.text.params) || {};
  const ours = (it) => !!(it && it.sessionKey === INBOX_KEY && it.kind === 'notice' && it.origin === 'server' && !it.clearedAt);
  // r8: an item that carries its tagged label and no `name` (a 4f42eaa3 store) reads as its bare name — one known tag
  // suffix stripped (r7 read «M (1a2b3c4d)» back as the name and doubled it to «M (1a2b3c4d) (1a2b3c4d)» at the next restart)
  const nameOf = (it) => { const q = paramsOf(it); if (q.name) return q.name; const m = String(q.machine || ''), t = String(q.tag || ''); return t && m.endsWith(` (${t})`) ? m.slice(0, -(t.length + 3)) : m; };
  /** r8: the «Past the bound» line an item says (its count) | null. */
  const dropLineOf = (it) => ((it && it.i18n && Array.isArray(it.i18n.detail)) ? it.i18n.detail.find((l) => l && isDropKey(l.key)) : null) || null;
  /** r8: the store on disk NOW — a count the hold forgets once it is said (→ whether it landed; a store that refuses its
   *  write keeps it dirty and retries by itself — then the hold keeps its count too). */
  const flushed = () => { try { userTodos.flush?.(); return true; } catch (e) { try { userTodos._save?.(); } catch { } log(`a notice's count could not be put on disk now: ${(e && e.message) || e} — the held usage keeps it until it can`); return false; } };
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
  /** r6: an open twin's words re-filled with its host id's short form (its stored sentences, their params) — in place, ONCE
   *  (r7: an item that has a tag keeps it); `name` (the bare machine name) kept beside it — an item filed before `name`
   *  was stored would read its own tagged label back as its name. */
  function relabel(item, name) {
    userTodos.reshapeItems((it) => {
      if (it.id !== item.id || !it.i18n || !it.i18n.text) return false;
      const q = it.i18n.text.params, tag = shortHost(q.host), label = `${name} (${tag})`;
      if (q.tag || q.machine === label) { if (q.name || !q.tag) return false; q.name = name; return true; } // r8: a tag kept, its bare name stored beside it
      const i18n = JSON.parse(JSON.stringify(it.i18n));
      i18n.text.params.machine = label; i18n.text.params.tag = tag; i18n.text.params.name = name;
      for (const l of i18n.detail || []) if (l.params && Object.prototype.hasOwnProperty.call(l.params, 'machine')) l.params.machine = label;
      it.i18n = i18n; it.text = fillOf(i18n.text.key, i18n.text.params); it.detail = (i18n.detail || []).map((l) => fillOf(l.key, l.params || {})).join('\n');
      return true;
    });
  }
  /** r9: THE COUNT IS THE GENERATION'S — what an item says (its generation `gen`, its «Past the bound» count, `earlier`: the
   *  ended generations') against an event of generation `ev.gen` → {dropped, unchecked, gen, earlier, ended}: the event's
   *  count REPLACES the item's when both are of one generation (never summed — r8's `carried` said 66 for the 33 of one
   *  generation read back after a crash); the item's count of ANOTHER generation (one that ended) joins `earlier`; a count
   *  the event does not know (null: its hold still being read) keeps the item's. r10: `ended` holds each ended
   *  generation's count by its number — an OLDER generation's count (a set file read at a boot beside a newer one's)
   *  replaces its own entry and leaves the item's line alone (or IS the line when the item has none); a newer one's moves
   *  the item's count into it. Order-free: older-then-newer and newer-then-older say the same. */
  function countsOf(prev, ev) {
    const q = paramsOf(prev), line = dropLineOf(prev), said = line && line.params ? Math.max(0, Number(line.params.dropped) || 0) : 0;
    const was = q.gen != null && q.gen !== '' ? String(q.gen) : null, gen = ev.gen != null && ev.gen !== '' ? String(ev.gen) : null;
    const ended = endedOf(q), unchecked0 = line ? line.key === D_DROPPED_MAYBE : !!ev.unchecked;
    const out = (dropped, unchecked, g) => ({ dropped, unchecked, gen: g, ended, earlier: sumOf(ended) });
    if (ev.dropped == null) return out(said || null, unchecked0, was);
    const n = Math.max(0, Number(ev.dropped) || 0);
    if (gen === null || gen === was) return out(n, !!ev.unchecked, gen !== null ? gen : was);
    if (was !== null && Number(gen) < Number(was)) { // an OLDER generation's count
      if (said > 0) { if (n > 0) ended.set(gen, n); else ended.delete(gen); return out(said, unchecked0, was); }
      ended.delete(gen); return out(n, !!ev.unchecked, gen); // the item says no count: the older one's is its line
    }
    if (said > 0) ended.set(was === null ? '?' : was, (was === null ? ended.get('?') || 0 : 0) + said);
    ended.delete(gen);
    return out(n, !!ev.unchecked, gen);
  }
  /** r7: the «Past the bound» line re-said with the count the hold ENDED with (rows dropped while it drained — a harvest
   *  mid-drain pushed out a segment not drained yet) — in place, before 'resumed' closes the item. r9: `c` = countsOf's
   *  answer — the generation's line (0 removes it: every one of them was recorded), the ended ones' «Earlier» line. */
  function redrop(item, c, month) {
    userTodos.reshapeItems((it) => {
      if (it.id !== item.id || !it.i18n || !Array.isArray(it.i18n.detail)) return false;
      const i18n = JSON.parse(JSON.stringify(it.i18n)), d = i18n.detail, p = i18n.text.params || (i18n.text.params = {});
      const mo = String(month || p.month || ''), n = String(Math.max(0, Number(c.dropped) || 0)), e = String(Math.max(0, Math.floor(Number(c.earlier) || 0)));
      const at = d.findIndex((l) => l && isDropKey(l.key));
      if (n === '0') { if (at >= 0) d.splice(at, 1); } else { const line = { key: c.unchecked ? D_DROPPED_MAYBE : D_DROPPED, params: { dropped: n, month: mo } }; if (at >= 0) d[at] = line; else d.splice(Math.min(2, d.length), 0, line); }
      const ea = d.findIndex((l) => l && l.key === D_DROPPED_EARLIER);
      if (e === '0') { if (ea >= 0) d.splice(ea, 1); } else { const line = { key: D_DROPPED_EARLIER, params: { dropped: e, month: mo } }; if (ea >= 0) d[ea] = line; else { const after = d.findIndex((l) => l && isDropKey(l.key)); d.splice(after >= 0 ? after + 1 : Math.min(2, d.length), 0, line); } }
      delete p.gen; delete p.earlier; delete p.ended; delete p.carried; Object.assign(p, genParams(c.gen, c.earlier, c.ended));
      if (i18n.text.key === TEXT_DROPPED && n !== '0') p.dropped = n;
      if (JSON.stringify(i18n) === JSON.stringify(it.i18n)) return false;
      it.i18n = i18n; it.text = fillOf(i18n.text.key, p); it.detail = d.map((l) => fillOf(l.key, l.params || {})).join('\n');
      return true;
    });
  }
  // r9: every generation an item names is one usage-history has seen (r10: and every ended one it keeps a count of) — a month's next hold is minted past it (a restart with
  // no file of it left minted generation 0 again: the new hold's count read as the ended one's)
  try { if (typeof userTodos.idsWhere === 'function' && typeof usageHistory.holdGenSeen === 'function') for (const id of userTodos.idsWhere((i) => ours(i) && paramsOf(i).gen != null)) { const q = paramsOf(userTodos.get(id)); usageHistory.holdGenSeen(q.host, q.shard, q.gen); for (const g of endedOf(q).keys()) if (g !== '?') usageHistory.holdGenSeen(q.host, q.shard, g); } } catch { }
  usageHistory.onShape = (ev) => {
    if (!ev || !userTodos) return;
    if (ev.kind === 'paused') {
      const prev = itemOf(ev.host, ev.shard);
      // a name the event does not know (a hold read back at boot names its host id only) keeps the one its notice said
      const name = ev.hostName && ev.hostName !== ev.host ? ev.hostName : nameOf(prev) || ev.hostName;
      const twins = twinsOf(ev.host, name);
      // r7: the tag an OPEN item carries is kept (sticky until it closes); a new or reopened item is tagged when a twin is open
      const stuck = prev && prev.status === 'open' ? String(paramsOf(prev).tag || '') : '';
      // r8: a re-word never loses a count — one not known yet (its hold still being read: null) keeps the one the item says;
      // r9: the item's count is its GENERATION's (replaced, never summed); an ended generation's — an open item's or a
      // closed one's the month's next hold reopens — is kept as its «Earlier» line
      const counts = prev ? countsOf(prev, ev) : {};
      const w = noticeOf({ ...ev, ...counts, hostName: name, tag: stuck || (twins.length ? shortHost(ev.host) : '') });
      try {
        // r6: each twin told by ITS host id too (its words re-filled in place) — r7: once (a twin that has a tag keeps it)
        for (const t of twins) relabel(t, name);
        if (!prev) {
          // r6: filed by its KEY (host id × file — the item's id derived from it), never matched by its words
          const it = fileItem(w, keyOf(ev.host, ev.shard));
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
      // r7: the count it ended with; r8: filtered against the ledger (0 removes the line), and ON DISK before the hold forgets it;
      // r9: the generation's count replaces the item's (an ended one's kept as its «Earlier» line)
      const n = Math.max(0, Number(ev.dropped) || 0);
      if (it) { try { redrop(it, countsOf(it, { ...ev, dropped: n }), ev.month); } catch { } }
      if (it) close(it.id, 'shape-ok');
      if (!(n > 0)) return true;
      if (!it) return sayDropped(ev);
      return flushed();
    } else if (ev.kind === 'dropped') {
      return sayDropped(ev);
    } else if (ev.kind === 'hold-read') {
      // r9: a hold whose file could not be read back — ONE item per hold (said once, closed when it is read)
      try {
        const k = `${READ_KEY}\n${ev.host}\n${ev.shard}`, it = keyedItem(k);
        if (ev.state === 'ok') { if (it && it.status === 'open') close(it.id, 'read'); return; }
        const pause = itemOf(ev.host, ev.shard), name = (ev.hostName && ev.hostName !== ev.host ? ev.hostName : nameOf(pause)) || ev.host;
        const w = readNoticeOf({ ...ev, hostName: name });
        if (!it) { fileItem(w, k); return; }
        if (it.status === 'open') return; // said once
        userTodos.reshapeItems((x, now) => { if (x.id !== it.id) return false; x.text = w.text; x.detail = w.detail; x.i18n = w.i18n; x.urgency = 'high'; x.status = 'open'; x.resolvedAt = null; x.resolvedBy = null; x.expiresAt = null; x.createdAt = now; delete x.judged; return true; });
      } catch (e) { log(`the unreadable hold's notice was not filed: ${e.message}`); }
    } else if (ev.kind === 'set-aside') {
      // r12: a held set file's line set aside — ONE item per hold (host × file): filed, re-said in place by the next setting-
      // aside (a closed one reopened, never a second), closed by the owner; the reconcile leaves it (nothing waits)
      try {
        const k = `${ASIDE_KEY}\n${ev.host}\n${ev.shard}`, it = keyedItem(k);
        const pause = itemOf(ev.host, ev.shard), name = (ev.hostName && ev.hostName !== ev.host ? ev.hostName : nameOf(pause)) || ev.host;
        const w = asideNoticeOf({ ...ev, hostName: name });
        if (!it) { fileItem(w, k, 'normal'); return; }
        userTodos.reshapeItems((x, now) => {
          if (x.id !== it.id || (x.status === 'open' && x.text === w.text && x.detail === w.detail)) return false;
          x.text = w.text; x.detail = w.detail; x.i18n = w.i18n;
          if (x.status !== 'open') { x.status = 'open'; x.resolvedAt = null; x.resolvedBy = null; x.expiresAt = null; x.createdAt = now; delete x.judged; }
          return true;
        });
      } catch (e) { log(`the set-aside line's notice was not filed: ${e.message}`); }
    } else if (ev.kind === 'hold-list') {
      try {
        const it = listItem();
        if (ev.state === 'ok') { if (it && it.status === 'open') close(it.id, 'listed'); return; }
        const w = listNoticeOf(ev);
        if (!it) { fileItem(w, LIST_KEY); return; }
        if (it.status === 'open') return; // said once
        userTodos.reshapeItems((x, now) => { if (x.id !== it.id) return false; x.text = w.text; x.detail = w.detail; x.i18n = w.i18n; x.urgency = 'high'; x.status = 'open'; x.resolvedAt = null; x.resolvedBy = null; x.expiresAt = null; x.createdAt = now; delete x.judged; return true; });
      } catch (e) { log(`the hold folder's notice was not filed: ${e.message}`); }
    }
  };
  /** r8: the item filed by `itemKey` (the listing's ONE — r9: a hold read-back's ONE). */
  const keyedItem = (k) => { const ids = typeof userTodos.idsWhere === 'function' ? userTodos.idsWhere((i) => ours(i) && i.itemKey === k) : []; return ids.map((x) => userTodos.get(x)).filter(Boolean).sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)).pop() || null; };
  const listItem = () => keyedItem(LIST_KEY);
  const isRead = (it) => String((it && it.itemKey) || '').startsWith(READ_KEY + '\n');
  const isAside = (it) => String((it && it.itemKey) || '').startsWith(ASIDE_KEY + '\n'); // r12
  /** r8: a count said where no open pause carries it — the item of (host, file) says it already (open or closed: its line
   *  has the count), else it is re-said in place (open) or one is filed (a closed one reopened: never a second) → whether
   *  it is on disk. */
  function sayDropped(ev) {
    const n = String(Math.max(0, Number(ev.dropped) || 0));
    if (n === '0') return true;
    try {
      const it = itemOf(ev.host, ev.shard), line = it && dropLineOf(it), q = it ? paramsOf(it) : {};
      // said already: the item's line says this count — r9: of this generation (an item of no generation: r8's words)
      if (line && line.params && line.params.dropped === n && (q.gen == null || ev.gen == null || String(q.gen) === String(ev.gen))) return flushed();
      const c = it ? countsOf(it, ev) : { dropped: Number(n), gen: ev.gen, earlier: 0, unchecked: !!ev.unchecked };
      if (it && it.status === 'open') { redrop(it, c, ev.month); return flushed(); }
      const name = ev.hostName && ev.hostName !== ev.host ? ev.hostName : nameOf(it) || ev.hostName;
      const w = droppedNoticeOf({ ...ev, dropped: c.dropped, unchecked: c.unchecked, hostName: name, gen: c.gen, earlier: c.earlier, ended: c.ended, tag: twinsOf(ev.host, name).length ? shortHost(ev.host) : '' });
      if (!it) {
        const made = fileItem(w, keyOf(ev.host, ev.shard));
        if (made && made.id) open.set(keyOf(ev.host, ev.shard), made.id);
      } else {
        userTodos.reshapeItems((x, now) => { if (x.id !== it.id) return false; x.text = w.text; x.detail = w.detail; x.i18n = w.i18n; x.urgency = 'high'; x.status = 'open'; x.resolvedAt = null; x.resolvedBy = null; x.expiresAt = null; x.createdAt = now; delete x.judged; return true; });
        open.set(keyOf(ev.host, ev.shard), it.id);
      }
      return flushed();
    } catch (e) { log(`the dropped count of ${ev.hostName || ev.host} was not filed: ${e.message}`); return false; }
  }
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
        if (it.itemKey === LIST_KEY || isRead(it)) continue; // r8: judged after the holds are listed (below) — r9: a hold read-back's too
        if (isAside(it)) continue; // r12: a line set aside — said; the owner closes it (nothing waits)
        if (it.i18n && it.i18n.text && it.i18n.text.key === TEXT_DROPPED) continue; // r8: a count said — the owner closes it
        const p = (it.i18n && it.i18n.text && it.i18n.text.params) || {};
        if (open.get(keyOf(p.host, p.shard)) === it.id) continue;
        if (p.host && p.shard) { const keep = itemOf(p.host, p.shard); if (keep && keep.id !== it.id) continue; } // r5: one per (host, file) — a second was merged into it
        let rec = null;
        // the rule: its params (r3); a notice filed before them is read by its first detail line, and judged by the index
        // unless that line says size (the sample may be the rule that cannot see it)
        const d0 = (Array.isArray(it.i18n && it.i18n.detail) && it.i18n.detail[0]) || {};
        const why = p.why || Object.keys(D_WHAT).find((k) => D_WHAT[k] === d0.key) || null;
        const rule = { why: why === 'proven' ? 'size' : why, exact: p.why ? p.exact === '1' : why !== 'size' && why !== 'proven', ratio: d0.params && d0.params.ratio };
        if (p.host && p.shard) { open.set(keyOf(p.host, p.shard), it.id); try { rec = usageHistory.restorePause(p.host, nameOf(it), p.shard, rule); } catch { rec = null; } }
        if (!rec) { if (p.host && open.get(keyOf(p.host, p.shard)) === it.id) open.delete(keyOf(p.host, p.shard)); close(it.id, 'shape-ok'); n++; }
      }
    } catch (e) { log(`the growth alarm's notices could not be reconciled: ${e.message}`); }
    try { usageHistory.restoreHolds?.(); } catch (e) { log(`the held usage could not be read back: ${e.message}`); }
    // r8: the listing's notice from before the restart — closed when this process listed the folder (a failure re-says it)
    try { const it = listItem(); if (it && it.status === 'open' && !(usageHistory.holdListFailed && usageHistory.holdListFailed())) { close(it.id, 'listed'); n++; } } catch { }
    // r9: a hold read-back's notice from before the restart — closed when its hold is no longer waiting to be read (gone from
    // the disk, or read by now); one whose read is still pending is closed by its read (a failure re-says it). r10: a hold
    // this reconcile's own restoreHolds is reading back is judged AFTER that read settles (bounded) — never at the instant
    // it started it (r9: «pending», skipped, and its success said nothing: the item open for ever); its read's 'ok' closes
    // it too (usage-history `_readBack`, every read-back that works)
    try {
      const pending = (p) => !!(usageHistory.holdReadPending && usageHistory.holdReadPending(p.host, p.shard));
      for (const it of (userTodos.snapshot?.() || {}).open || []) {
        if (!ours(it) || !isRead(it)) continue;
        const p = paramsOf(it);
        if (!pending(p)) { close(it.id, 'read'); n++; continue; }
        if (typeof usageHistory.holdReadSettled !== 'function') continue;
        let t = null;
        const late = new Promise((r) => { t = setTimeout(r, READ_SETTLE_MS); t.unref?.(); });
        Promise.race([usageHistory.holdReadSettled(p.host, p.shard), late]).then(() => { clearTimeout(t); try { if (!pending(p)) close(it.id, 'read'); } catch { } });
      }
    } catch { }
    return n;
  }
  if (reconcileAfterMs != null) setTimeout(() => { try { const n = reconcile(); if (n) log(`${n} growth-alarm notice(s) from before the restart closed — their files are in shape`); } catch { } }, reconcileAfterMs).unref?.();
  return { open, reconcile };
}

module.exports = { wire, noticeOf, droppedNoticeOf, listNoticeOf, readNoticeOf, asideNoticeOf, INBOX_KEY, LIST_KEY, READ_KEY, ASIDE_KEY, TEXT, TEXT_DRAIN, TEXT_DROPPED, TEXT_LIST, TEXT_READ, TEXT_ASIDE, TEXT_ASIDE_UNREAD, D_ASIDE_WHAT, D_ASIDE_NOW, D_ASIDE_TODO, D_WHAT, D_HELD, D_DROPPED, D_DROPPED_MAYBE, D_DROPPED_EARLIER, D_DROPPED_WHAT, D_TODO_READ, D_LIST, D_READ, D_NOW, D_DRAIN_FAILED, D_TODO };
