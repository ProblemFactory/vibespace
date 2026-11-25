'use strict';
/**
 * THE MAIN LOOP'S HOUR, IN ONE LINE (lane hub-loop-stalls, unit «loop-day-report», 2026-11-16) — PURE, imports nothing.
 * A measurement release reads what the hub's main loop did per hour and per day WITHOUT opening the page: on a fleet pod
 * the journal is all there is. So once an hour (and once at exit) the ORCH half (src/server/loop-day-report.js) folds what
 * it kept in memory into ONE line of a fixed shape a grep can count:
 *   [loop-hour] hour=<UTC hour>Z span=<s> held=<s> holds=<n> longest=<s> boot-held=<s> boot-holds=<n> lost-holds=<n>
 *     no-ours-holds=<n> no-ours-held=<s> busy=<%>
 *     top="<cause> <s>; …" engines="interface <%>; vault; channels; money; workspace; machines; conversation; <split>* <%>; …; native; outside"
 *     census-ticks=<n> busy-ticks=<n> held-ticks=<n> idle-ticks=<n> stopped-ticks=<n> not-sampled=<n> via-helper=<n> deep=<n>
 *     census-asks=<n> census-paid=<s> hub-up=<h> hub-heap=<MB>/<MB> hub-rss=<MB> cli=<n>/<MB> wrapper=<n>/<MB> browser=<n>/<MB>
 *     agentd=<n>/<MB> other=<n>/<MB> procs-by=<service|container|tree> conversations=<n> turn-running=<n> turn-waiting=<n>
 *     idle-under-1h=<n> idle-1-2h=<n> idle-2-4h=<n> idle-over-4h=<n> turn-unknown=<n> ages-read=<n>/<n> browsers-ready=<n> browsers-idle-1h=<n>
 *     page-sockets=<n> device-links=<n> ws-in=<n> ws-out=<n> parsed=<M chars> creates=<n> resumes=<n> writes=<n> write-max=<s> vault-direct-starts=<n>
 *     program-starts=<starter|direct-since-<minute>Z|?>
 * vault-direct-starts = the hour's job starts the jobs engine made ITSELF by design (B-91aa's remainder, 主开发 r4591 (A)): a VAULT job's
 * wrapper (its values ride the hub's own pipe on fd 3), counted by the starter's `directJobs`; every other job starts through the starter
 * EACH FIELD COUNTS WHAT ITS NAME SAYS: held / holds / longest / top = the hour's holds of a second or more AFTER the boot (an hour
 * no watchdog watched prints «?» — never a clean hour); boot-held / boot-holds = the boot's own, apart; lost-holds = holds the
 * watchdog's ring dropped before the hour's book read them; no-ours-holds / no-ours-held = the hour's holds whose
 * row came from a sample with NO FRAME OF OURS (the stack ended in the runtime, or was cut before a frame of the tree — never the
 * measuring wrapper's line: src/loop-hold.js instrumentTrim), counted apart and booked in top under «(no frame of ours)»; busy = the loop's utilization between the two cuts (the runtime's own
 * event-loop measure — a DIFFERENT instrument from the census's busy-ticks below, so the two need not agree). ENGINES = each
 * FUTURE OWNER's share of the census's BUSY ticks (src/loop-census.js: the owner of the nearest frame of an owned file), then each
 * SPLIT file's own share («<short>*»: one file that holds two owners' work today — booked under its own name, never guessed onto
 * one owner; src/loop-census.js SPLIT, in its order), «native»
 * the ticks with no JavaScript frame, «outside» the ticks whose stack holds no owned file — they add to 100 % up to rounding (each
 * share is rounded to a whole percent on its own); THEY LEAVE OUT HELD TIME: a tick inside a hold is a held tick (the census does
 * not ask then) and its seconds are named by the holds (held, top — or boot-held / boot-holds for the boot's own hold). The census's ticks add up: census-ticks = busy + held + idle + stopped + not-sampled; via-helper = busy ticks booked on an
 * owner through a shared helper; deep = busy ticks whose sample's frame list was full (an owner may lie beyond it).
 * census-asks / census-paid = the census's own cost: its asks, and the main thread's time PAID for them — each ask's own run
 * (measured live) + the inspector's dispatch of the ask (DISPATCH_MS a piece, measured: src/loop-census.js). hub-up = the hub's
 * own uptime in hours (an idle age can never be older than the record it is read from — see below). procs-by = how the hub's
 * processes were told apart (src/server/loop-day-report.js howOf); conversations = the hub's live conversation records (a
 * read-only view is one too — a record carries no mark that tells it apart); turn-running … turn-unknown = the live conversations
 * by their turn and, idle, by the age of their OUTPUT FILE (its mtime — it survives a restart of the hub), read by ONE pass ended at
 * its time-out: a pass that did not finish prints the four idle ages «?»; ages-read = how many conversations that pass read of how
 * many (at exit nothing is read: the ages are «?»); browsers-ready /
 * browsers-idle-1h = the keeper's live browsers and those with no command for over an hour.
 * ([loop-exit] = the same shape over the part of the hour before the stop; nothing is read at exit — the engines print «?»
 * and the process table is the last one the hour read; the idle ages print «?».) COUNTS AND CODE PATHS ONLY: a hold's cause is a
 * code location of the hub's own (`src/…:line`, `server.js:line`) or ONE of the hold verdict's fixed words — anything else
 * prints «(other)», so no path under a data directory, no account, no conversation name, no content can reach the line.
 * A value never read prints «?» (never 0): an hour whose census did not answer says `engines=? sampled=?`.
 */

const VERDICTS = Object.freeze([   // src/loop-hold.js V — the hold verdict's fixed words (test-loop-day-report pins the copy)
  'not running (stopped, frozen or blocked)', 'waiting for a CPU', 'in the kernel (blocked)', 'in the kernel (on the CPU)',
  'JavaScript', 'garbage collection', 'native code or garbage collection', 'on the CPU in user mode — JavaScript or native code, not sampled',
  'not sampled, and no scheduler facts', 'not in JavaScript when asked (its kernel state unread)',
  'on the CPU — JavaScript or native code, no sample of that part', 'not in JavaScript when asked (running or waiting for a CPU)',
  'JavaScript and native code (a tie of their samples)',   // r116 (b): a tie's fixed word
]);
const NO_CAUSE = '(no cause recorded)';
const NO_OURS = '(no frame of ours)';   // 主开发 12:20Z: a hold whose row had no frame of the tree — apart, never a verdict's word
const OTHER = '(other)';
const TOP_N = 3;
const KIDS = Object.freeze(['cli', 'wrapper', 'browser', 'agentd', 'other']);
const ENGINES = Object.freeze(['interface', 'vault', 'channels', 'money', 'workspace', 'machines', 'conversation']);   // src/loop-census.js OWNERS, in its order
const HOUR_MS = 3600000;
const ENGINE_FIELDS = Object.freeze([...ENGINES, 'native', 'outside']);
const SHORT_RE = /^[a-z][a-z0-9-]{0,39}$/;   // a split file's short name (src/loop-census.js SPLIT `short`)
const AGES = Object.freeze(['turn-running', 'turn-waiting', 'idle-under-1h', 'idle-1-2h', 'idle-2-4h', 'idle-over-4h', 'turn-unknown']);

const TIE = VERDICTS.find((v) => v.endsWith('(a tie of their samples)'));   // r116 (b) / r147: a tie books under its fixed word, never its JavaScript frame
/** a hold's CAUSE: a tie's fixed word (alone or a part of two); else the hub's own code location in its frame (`src/x.js:12`), else
 *  its verdict (one of the fixed words) */
function causeOf({ verdict = null, frame = null, noOurs = false } = {}) {
  if (noOurs === true) return NO_OURS;
  if (typeof verdict === 'string' && verdict.split(', then ').includes(TIE)) return TIE;   // its JavaScript sample's frame names half the hold at most — the tie is the cause (alone, or a part of two)
  const m = typeof frame === 'string' ? /(?:^|[\s(])((?:src\/[\w./-]+|server\.js):\d+)(?=[)\s]|$)/.exec(frame) : null;
  if (m && !m[1].includes('..')) return m[1];
  if (typeof verdict === 'string' && verdict) return VERDICTS.includes(verdict) ? verdict : OTHER;
  return NO_CAUSE;
}
/** an empty hour from `fromMs` (wall clock) */
function newHour(fromMs, { watched = true } = {}) { return { fromMs, watched: !!watched, holds: 0, heldMs: 0, longestMs: 0, by: {}, boot: { holds: 0, heldMs: 0 }, noOurs: { holds: 0, heldMs: 0 }, lost: null }; }
/** a hold (ms, and its verdict / frame) into the hour */
function holdAdd(h, { ms, verdict = null, frame = null, boot = false, noOurs = false } = {}) {
  if (!h || !(Number(ms) >= 0)) return h;
  if (boot) { h.boot.holds++; h.boot.heldMs += ms; return h; }   // the boot's own hold: apart, never the hour's
  const c = causeOf({ verdict, frame, noOurs });
  h.holds++; h.heldMs += ms; if (ms > h.longestMs) h.longestMs = ms;
  if (noOurs === true) { if (!h.noOurs) h.noOurs = { holds: 0, heldMs: 0 }; h.noOurs.holds++; h.noOurs.heldMs += ms; }
  h.by[c] = (h.by[c] || 0) + ms;
  return h;
}
/** the top causes, the larger first (a tie by name) */
const topOf = (by, n = TOP_N) => Object.entries(by || {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([cause, ms]) => ({ cause, ms }));

const s1 = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : '?');
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '?');
const mb = (b) => (Number.isFinite(b) ? `${Math.round(b / 1048576)}MB` : '?');
const int = (n) => (Number.isFinite(n) ? String(Math.round(n)) : '?');
const hourOf = (ms) => (Number.isFinite(ms) ? `${new Date(ms).toISOString().slice(0, 13)}Z` : '?');

/** THE ENGINES' SHARES from a census fold (src/loop-census.js censusFold, or null): each owner's share of the BUSY ticks, native's
 *  and outside's — they add to 100 % (rounding aside); the census's ticks by kind (they add to census-ticks), its asks and what it
 *  paid. An hour whose census was PAUSED (or never asked) has no engines to say: «?», never «none» */
function censusWords(c) {
  const none = { words: '?', ticks: null, busy: null, held: null, idle: null, stopped: null, notSampled: null, viaHelper: null, deep: null, asks: null, paidMs: null };
  if (!c || !Array.isArray(c.shares) || !Number.isFinite(c.busyTicks)) return none;
  const by = new Map(c.shares.map((s) => [s.family, s.share]));
  const extra = (k) => (c[k] && Number.isFinite(c[k].share) ? c[k].share : (by.get(k) || 0));
  const ticksOf = (k) => (c[k] && Number.isFinite(c[k].ticks) ? c[k].ticks : null);   // never `t` — the i18n extractor reads t('…') as a word
  const ns = c.notSampled && Number.isFinite(c.notSampled.ticks) ? c.notSampled.ticks : null;
  const p0 = (x) => `${((x || 0) * 100).toFixed(0)}%`;
  // cure r3 (T1): a SPLIT file — one file that holds two owners' work — is a bucket of its own, printed by its short name marked «*»
  // after the seven owners, in the census's list order (src/loop-census.js SPLIT); a short name not of the plain shape never prints
  const splits = c.shares.filter((x) => x && typeof x.family === 'string' && x.family.startsWith('split:') && SHORT_RE.test(x.family.slice(6)))
    .map((x, i) => ({ short: x.family.slice(6), share: x.share, at: Number.isFinite(x.order) ? x.order : 1e6 + i })).sort((a, b) => a.at - b.at);
  const words = c.busyTicks > 0 ? [...ENGINES.map((f) => `${f} ${p0(by.get(f))}`), ...splits.map((x) => `${x.short}* ${p0(x.share)}`), `native ${p0(extra('native'))}`, `outside ${p0(extra('outside'))}`].join('; ') : '?';
  const all = Number.isFinite(c.sampledTicks) && ns != null ? c.sampledTicks + ns : null;
  const cost = c.cost || {};
  return { words, ticks: all, busy: c.busyTicks, held: ticksOf('held'), idle: ticksOf('idle'), stopped: ticksOf('stopped'), notSampled: ns, viaHelper: ticksOf('viaHelper'), deep: ticksOf('deep'),
    asks: Number.isFinite(cost.asks) ? cost.asks : null, paidMs: Number.isFinite(cost.paidMs) ? cost.paidMs : null };
}

/**
 * THE LINE. `rep` = { kind: 'hour' | 'exit', hour: newHour()+holdAdd (+ `lost`), toMs, busy (0..1 | null), engines (a census fold |
 * null), upMs, mem: { heapUsed, heapLimit, rss, kids: { cli: {n, rss}, wrapper, browser, agentd, other, how } | null } | null,
 * turns: { 'turn-running', 'turn-waiting', 'idle-under-1h', 'idle-1-2h', 'idle-2-4h', 'idle-over-4h', 'turn-unknown' } | null,
 * agesRead: { read, total } | null (the age pass: how many conversations it read of how many),
 * browsers: { ready, idle1h } | null, sizes: { conversations, pageSockets, deviceLinks, wsIn, wsOut, parsedChars, creates, resumes,
 * writes, writeMaxMs } }
 */
/** B-91aa: the starter's state for the line — `starter` (the timer sites' programs start in the small process), `direct-since-<minute>Z`
 *  (the old road in force: they fork the hub again), `?` (not told) */
const startsOf = (st) => (!st || typeof st !== 'object' ? '?' : st.direct ? `direct-since-${Number.isFinite(st.directSince) && st.directSince > 0 ? new Date(st.directSince).toISOString().slice(0, 16) + 'Z' : '?'}` : 'starter');
function line(rep = {}) {
  const h = rep.hour || newHour(null);
  const w = h.watched !== false;
  const top = w ? (topOf(h.by).map((t) => `${t.cause} ${s1(t.ms)}`).join('; ') || 'none') : '?';
  const e = censusWords(rep.engines);
  const m = rep.mem || {}, k = m.kids || null, z = rep.sizes || {}, tu = rep.turns || null, br = rep.browsers || null, ar = rep.agesRead || null;
  const kid = (name) => (k && k[name] ? `${int(k[name].n)}/${mb(k[name].rss)}` : '?/?');
  const span = Number.isFinite(rep.toMs) && Number.isFinite(h.fromMs) ? Math.max(0, rep.toMs - h.fromMs) : null;
  const how = k && ['service', 'container', 'tree'].includes(k.how) ? k.how : '?';
  return [`[loop-${rep.kind === 'exit' ? 'exit' : 'hour'}]`, `hour=${hourOf(h.fromMs)}`, `span=${span == null ? '?' : `${Math.round(span / 1000)}s`}`,
    `held=${w ? s1(h.heldMs) : '?'}`, `holds=${w ? h.holds : '?'}`, `longest=${w ? s1(h.longestMs) : '?'}`,
    `boot-held=${w ? s1(h.boot ? h.boot.heldMs : 0) : '?'}`, `boot-holds=${w ? (h.boot ? h.boot.holds : 0) : '?'}`, `lost-holds=${int(h.lost)}`,
    `no-ours-holds=${w ? (h.noOurs ? h.noOurs.holds : 0) : '?'}`, `no-ours-held=${w ? s1(h.noOurs ? h.noOurs.heldMs : 0) : '?'}`, `busy=${pct(rep.busy)}`, `top="${top}"`,
    `engines="${e.words}"`, `census-ticks=${int(e.ticks)}`, `busy-ticks=${int(e.busy)}`, `held-ticks=${int(e.held)}`, `idle-ticks=${int(e.idle)}`, `stopped-ticks=${int(e.stopped)}`,
    `not-sampled=${int(e.notSampled)}`, `via-helper=${int(e.viaHelper)}`, `deep=${int(e.deep)}`,
    `census-asks=${int(e.asks)}`, `census-paid=${Number.isFinite(e.paidMs) ? `${(e.paidMs / 1000).toFixed(2)}s` : '?'}`,
    `hub-up=${Number.isFinite(rep.upMs) ? `${(rep.upMs / 3600000).toFixed(1)}h` : '?'}`,
    `hub-heap=${mb(m.heapUsed)}/${mb(m.heapLimit)}`, `hub-rss=${mb(m.rss)}`, ...KIDS.map((n) => `${n}=${kid(n)}`), `procs-by=${how}`,
    `conversations=${int(z.conversations)}`, ...AGES.map((a) => `${a}=${int(tu ? tu[a] : null)}`), `ages-read=${int(ar ? ar.read : null)}/${int(ar ? ar.total : null)}`,
    `browsers-ready=${int(br ? br.ready : null)}`, `browsers-idle-1h=${int(br ? br.idle1h : null)}`,
    `page-sockets=${int(z.pageSockets)}`, `device-links=${int(z.deviceLinks)}`,
    `ws-in=${int(z.wsIn)}`, `ws-out=${int(z.wsOut)}`, `parsed=${Number.isFinite(z.parsedChars) ? `${(z.parsedChars / 1e6).toFixed(1)}M` : '?'}`,
    `creates=${int(z.creates)}`, `resumes=${int(z.resumes)}`, `writes=${int(z.writes)}`, `write-max=${s1(z.writeMaxMs)}`,
    `vault-direct-starts=${int(rep.vaultDirect)}`, `program-starts=${startsOf(rep.starter)}`].join(' ');   // B-91aa: the timer sites' programs — «starter», or the old road in force since when
}

const N = '(\\d+|\\?)', S = '(\\d+\\.\\ds|\\?)';
const LINE_RE = new RegExp('^\\[loop-(hour|exit)\\] hour=(\\d{4}-\\d\\d-\\d\\dT\\d\\dZ|\\?) span=(\\d+s|\\?)'
  + ` held=${S} holds=${N} longest=${S} boot-held=${S} boot-holds=${N} lost-holds=${N} no-ours-holds=${N} no-ours-held=${S} busy=(\\d+\\.\\d%|\\?) top="[^"]*" engines="[^"]*"`
  + ` census-ticks=${N} busy-ticks=${N} held-ticks=${N} idle-ticks=${N} stopped-ticks=${N} not-sampled=${N} via-helper=${N} deep=${N}`
  + ` census-asks=${N} census-paid=(\\d+\\.\\d\\ds|\\?) hub-up=(\\d+\\.\\dh|\\?)`
  + ' hub-heap=(\\d+MB|\\?)\\/(\\d+MB|\\?) hub-rss=(\\d+MB|\\?)' + KIDS.map((n) => ` ${n}=${N}\\/(\\d+MB|\\?)`).join('') + ' procs-by=(service|container|tree|\\?)'
  + ` conversations=${N}` + AGES.map((a) => ` ${a}=${N}`).join('') + ` ages-read=${N}\\/${N} browsers-ready=${N} browsers-idle-1h=${N}`
  + ` page-sockets=${N} device-links=${N} ws-in=${N} ws-out=${N} parsed=(\\d+\\.\\dM|\\?) creates=${N} resumes=${N} writes=${N} write-max=${S}`
  + ` vault-direct-starts=${N}` + ' program-starts=(starter|direct-since-\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\dZ|\\?)$');
/** the causes a line may name: a code location of the hub's own, a verdict's fixed words, the three markers */
function causesOk(text) {
  const m = /top="([^"]*)"/.exec(String(text || ''));
  if (!m) return false;
  if (m[1] === 'none' || m[1] === '?') return true;
  return m[1].split('; ').every((p) => { const c = p.replace(/ \d+\.\ds$/, ''); return /^(?:src\/[\w./-]+|server\.js):\d+$/.test(c) || VERDICTS.includes(c) || c === NO_CAUSE || c === OTHER || c === NO_OURS; });
}

/** the engines a line may name: the seven owners in their order, then any split files' own buckets («<short>* <n>%»), then native
 *  and outside — each with a whole percent — or «?» */
function enginesOk(text) {
  const m = /engines="([^"]*)"/.exec(String(text || ''));
  if (!m) return false;
  if (m[1] === '?') return true;
  const parts = m[1].split('; ');
  const k = parts.length - ENGINE_FIELDS.length;
  if (k < 0) return false;
  const want = [...ENGINES.map((f) => new RegExp(`^${f} \\d+%$`)), ...Array(k).fill(/^[a-z][a-z0-9-]{0,39}\* \d+%$/), /^native \d+%$/, /^outside \d+%$/];
  return parts.every((p, i) => want[i].test(p));
}

/** THE DAY (Diagnostics): the hours kept, folded — held, holds, the longest, the busy share weighted by span, the causes */
function dayFold(hours = []) {
  const out = { hours: 0, unwatched: 0, heldMs: 0, holds: 0, longestMs: 0, busy: null, by: {}, boot: { holds: 0, heldMs: 0 }, noOurs: { holds: 0, heldMs: 0 } };
  let busyW = 0, busyS = 0;
  for (const r of hours) {
    const h = r && r.hour; if (!h) continue;
    out.hours++;
    if (h.watched === false) { out.unwatched++; continue; }   // left OUT of the day's sums — the day says how many hours that was
    out.heldMs += h.heldMs; out.holds += h.holds; out.longestMs = Math.max(out.longestMs, h.longestMs);
    if (h.boot) { out.boot.holds += h.boot.holds; out.boot.heldMs += h.boot.heldMs; }
    if (h.noOurs) { out.noOurs.holds += h.noOurs.holds; out.noOurs.heldMs += h.noOurs.heldMs; }
    for (const [c, ms] of Object.entries(h.by || {})) out.by[c] = (out.by[c] || 0) + ms;
    const span = Number.isFinite(r.toMs) && Number.isFinite(h.fromMs) ? r.toMs - h.fromMs : 0;
    if (Number.isFinite(r.busy) && span > 0) { busyW += span; busyS += r.busy * span; }
  }
  out.busy = busyW > 0 ? busyS / busyW : null;
  out.top = topOf(out.by);
  return out;
}

/** the next hour boundary after `ms` (UTC) */
const nextHourAt = (ms) => Math.floor(ms / HOUR_MS) * HOUR_MS + HOUR_MS;

module.exports = { VERDICTS, NO_CAUSE, OTHER, NO_OURS, KIDS, ENGINES, ENGINE_FIELDS, AGES, HOUR_MS, causeOf, newHour, holdAdd, topOf, censusWords, line, LINE_RE, causesOk, enginesOk, dayFold, nextHourAt };
