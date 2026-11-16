'use strict';
/**
 * THE MAIN LOOP'S HOUR, IN ONE LINE (lane hub-loop-stalls, unit «loop-day-report», 2026-11-16) — PURE, imports nothing.
 * A measurement release reads what the hub's main loop did per hour and per day WITHOUT opening the page: on a fleet pod
 * the journal is all there is. So once an hour (and once at exit) the ORCH half (src/server/loop-day-report.js) folds what
 * it kept in memory into ONE line of a fixed shape a grep can count:
 *   [loop-hour] hour=<UTC hour>Z span=<s> held=<s> holds=<n> longest=<s> busy=<%> top="<cause> <s>; …" engines="<family> <%>; …"
 *     sampled=<ticks> hub-heap=<MB>/<MB> hub-rss=<MB> cli=<n>/<MB> browser=<n>/<MB> agentd=<n>/<MB> other=<n>/<MB>
 *     conversations=<n> page-sockets=<n> device-links=<n> ws-in=<n> ws-out=<n> parsed=<M chars> creates=<n> resumes=<n>
 *     writes=<n> write-max=<s>
 * ([loop-exit] = the same shape over the part of the hour before the stop; nothing is read at exit — the engines print «?»
 * and the process table is the last one the hour read.) COUNTS AND CODE PATHS ONLY: a hold's cause is a
 * code location of the hub's own (`src/…:line`, `server.js:line`) or ONE of the hold verdict's fixed words — anything else
 * prints «(other)», so no path under a data directory, no account, no conversation name, no content can reach the line.
 * A value never read prints «?» (never 0): an hour whose census did not answer says `engines=? sampled=?`.
 */

const VERDICTS = Object.freeze([   // src/loop-hold.js V — the hold verdict's fixed words (test-loop-day-report pins the copy)
  'not running (stopped, frozen or blocked)', 'waiting for a CPU', 'in the kernel (blocked)', 'in the kernel (on the CPU)',
  'JavaScript', 'garbage collection', 'native code or garbage collection', 'on the CPU in user mode — JavaScript or native code, not sampled',
  'not sampled, and no scheduler facts', 'not in JavaScript when asked (its kernel state unread)',
  'on the CPU — JavaScript or native code, no sample of that part', 'not in JavaScript when asked (running or waiting for a CPU)',
]);
const NO_CAUSE = '(no cause recorded)';
const OTHER = '(other)';
const TOP_N = 3;
const KIDS = Object.freeze(['cli', 'browser', 'agentd', 'other']);
const ENGINES = Object.freeze(['channels', 'pool', 'parse', 'browser', 'jobs', 'page', 'hook', 'rest']);
const HOUR_MS = 3600000;

/** a hold's CAUSE: the hub's own code location in its frame (`src/x.js:12`), else its verdict (one of the fixed words) */
function causeOf({ verdict = null, frame = null } = {}) {
  const m = typeof frame === 'string' ? /(?:^|[\s(])((?:src\/[\w./-]+|server\.js):\d+)(?=[)\s]|$)/.exec(frame) : null;
  if (m && !m[1].includes('..')) return m[1];
  if (typeof verdict === 'string' && verdict) return VERDICTS.includes(verdict) ? verdict : OTHER;
  return NO_CAUSE;
}
/** an empty hour from `fromMs` (wall clock) */
function newHour(fromMs) { return { fromMs, holds: 0, heldMs: 0, longestMs: 0, by: {} }; }
/** a hold (ms, and its verdict / frame) into the hour */
function holdAdd(h, { ms, verdict = null, frame = null } = {}) {
  if (!h || !(Number(ms) >= 0)) return h;
  const c = causeOf({ verdict, frame });
  h.holds++; h.heldMs += ms; if (ms > h.longestMs) h.longestMs = ms;
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

/** THE ENGINES' SHARES from a census take (src/loop-census.js's fold, or null): `shares` = [{family, share}] of the busy ticks */
function enginesWords(engines) {
  if (!engines || !Array.isArray(engines.shares) || !(engines.busyTicks > 0)) return { words: '?', sampled: engines && Number.isFinite(engines.busyTicks) ? engines.busyTicks : null };
  const by = new Map(engines.shares.map((s) => [s.family, s.share]));
  return { words: ENGINES.map((f) => `${f} ${(((by.get(f) || 0)) * 100).toFixed(0)}%`).join('; '), sampled: engines.busyTicks };
}

/**
 * THE LINE. `rep` = { kind: 'hour' | 'exit', hour: newHour()+holdAdd, toMs, busy (0..1 | null), engines (a census fold | null),
 * mem: { heapUsed, heapLimit, rss, kids: { cli: {n, rss}, browser, agentd, other } | null } | null,
 * sizes: { conversations, pageSockets, deviceLinks, wsIn, wsOut, parsedChars, creates, resumes, writes, writeMaxMs } }
 */
function line(rep = {}) {
  const h = rep.hour || newHour(null);
  const top = topOf(h.by).map((t) => `${t.cause} ${s1(t.ms)}`).join('; ') || 'none';
  const e = enginesWords(rep.engines);
  const m = rep.mem || {}, k = m.kids || null, z = rep.sizes || {};
  const kid = (name) => (k && k[name] ? `${int(k[name].n)}/${mb(k[name].rss)}` : '?/?');
  const span = Number.isFinite(rep.toMs) && Number.isFinite(h.fromMs) ? Math.max(0, rep.toMs - h.fromMs) : null;
  return [`[loop-${rep.kind === 'exit' ? 'exit' : 'hour'}]`, `hour=${hourOf(h.fromMs)}`, `span=${span == null ? '?' : `${Math.round(span / 1000)}s`}`,
    `held=${s1(h.heldMs)}`, `holds=${h.holds}`, `longest=${s1(h.longestMs)}`, `busy=${pct(rep.busy)}`, `top="${top}"`,
    `engines="${e.words}"`, `sampled=${int(e.sampled)}`,
    `hub-heap=${mb(m.heapUsed)}/${mb(m.heapLimit)}`, `hub-rss=${mb(m.rss)}`, ...KIDS.map((n) => `${n}=${kid(n)}`),
    `conversations=${int(z.conversations)}`, `page-sockets=${int(z.pageSockets)}`, `device-links=${int(z.deviceLinks)}`,
    `ws-in=${int(z.wsIn)}`, `ws-out=${int(z.wsOut)}`, `parsed=${Number.isFinite(z.parsedChars) ? `${(z.parsedChars / 1e6).toFixed(1)}M` : '?'}`,
    `creates=${int(z.creates)}`, `resumes=${int(z.resumes)}`, `writes=${int(z.writes)}`, `write-max=${s1(z.writeMaxMs)}`].join(' ');
}

/** THE LINE'S OWN CHECK (the suite's and the ORCH's): every field present, in its order; nothing but the fixed words */
const LINE_RE = new RegExp('^\\[loop-(hour|exit)\\] hour=(\\d{4}-\\d\\d-\\d\\dT\\d\\dZ|\\?) span=(\\d+s|\\?) held=(\\d+\\.\\ds|\\?) holds=\\d+ longest=(\\d+\\.\\ds|\\?) busy=(\\d+\\.\\d%|\\?) top="[^"]*" engines="[^"]*" sampled=(\\d+|\\?)'
  + ' hub-heap=(\\d+MB|\\?)\\/(\\d+MB|\\?) hub-rss=(\\d+MB|\\?)' + KIDS.map((n) => ` ${n}=(\\d+|\\?)\\/(\\d+MB|\\?)`).join('')
  + ' conversations=(\\d+|\\?) page-sockets=(\\d+|\\?) device-links=(\\d+|\\?) ws-in=(\\d+|\\?) ws-out=(\\d+|\\?) parsed=(\\d+\\.\\dM|\\?) creates=(\\d+|\\?) resumes=(\\d+|\\?) writes=(\\d+|\\?) write-max=(\\d+\\.\\ds|\\?)$');
/** the causes a line may name: a code location of the hub's own, a verdict's fixed words, the two markers */
function causesOk(text) {
  const m = /top="([^"]*)"/.exec(String(text || ''));
  if (!m) return false;
  if (m[1] === 'none') return true;
  return m[1].split('; ').every((p) => { const c = p.replace(/ \d+\.\ds$/, ''); return /^(?:src\/[\w./-]+|server\.js):\d+$/.test(c) || VERDICTS.includes(c) || c === NO_CAUSE || c === OTHER; });
}

/** THE DAY (Diagnostics): the hours kept, folded — held, holds, the longest, the busy share weighted by span, the causes */
function dayFold(hours = []) {
  const out = { hours: 0, heldMs: 0, holds: 0, longestMs: 0, busy: null, by: {} };
  let busyW = 0, busyS = 0;
  for (const r of hours) {
    const h = r && r.hour; if (!h) continue;
    out.hours++; out.heldMs += h.heldMs; out.holds += h.holds; out.longestMs = Math.max(out.longestMs, h.longestMs);
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

module.exports = { VERDICTS, NO_CAUSE, OTHER, KIDS, ENGINES, HOUR_MS, causeOf, newHour, holdAdd, topOf, line, LINE_RE, causesOk, dayFold, nextHourAt };
