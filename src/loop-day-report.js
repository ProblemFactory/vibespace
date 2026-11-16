'use strict';
/**
 * THE MAIN LOOP'S HOUR, IN ONE LINE (lane hub-loop-stalls, unit «loop-day-report», 2026-11-16) — PURE, imports nothing.
 * A measurement release reads what the hub's main loop did per hour and per day WITHOUT opening the page: on a fleet pod
 * the journal is all there is. So once an hour (and once at exit) the ORCH half (src/server/loop-day-report.js) folds what
 * it kept in memory into ONE line of a fixed shape a grep can count:
 *   [loop-hour] hour=<UTC hour>Z span=<s> held=<s> holds=<n> longest=<s> boot-held=<s> boot-holds=<n> busy=<%>
 *     top="<cause> <s>; …" engines="channels <%>; pool; parse; browser; jobs; page; hook; rest; native" census-ticks=<n>
 *     busy-ticks=<n> not-sampled=<n> census-asks=<n> census-paid=<s> hub-heap=<MB>/<MB> hub-rss=<MB> cli=<n>/<MB>
 *     browser=<n>/<MB> agentd=<n>/<MB> other=<n>/<MB> procs-by=<service|container|tree> conversations=<n> running=<n>
 *     waiting=<n> idle-under-1h=<n> idle-1-2h=<n> idle-2-4h=<n> idle-over-4h=<n> turn-unknown=<n> browsers-ready=<n>
 *     browsers-idle-1h=<n> page-sockets=<n> device-links=<n> ws-in=<n> ws-out=<n> parsed=<M chars> creates=<n>
 *     resumes=<n> writes=<n> write-max=<s>
 * EACH FIELD COUNTS WHAT ITS NAME SAYS: held / holds / longest / top = the hour's holds of a second or more AFTER the boot
 * (an hour no watchdog watched prints «?» — never a clean hour); boot-held / boot-holds = the boot's own, apart; busy = the
 * loop's utilization between the two cuts; engines = each family's share of the census's BUSY ticks, «native» the ticks
 * with no JavaScript frame — the nine add to 100 %; census-ticks = every tick of the census in the hour, busy-ticks = those
 * booked on a family or native, not-sampled = those it could not ask (another ask out, a capture, paused); census-asks /
 * census-paid = the census's own cost: its asks, and the main thread's time PAID for them — each ask's own run (measured
 * live) + the inspector's dispatch of the ask (DISPATCH_MS a piece, measured: src/loop-census.js); procs-by = how the hub's
 * processes were told apart (src/server/loop-day-report.js howOf); running … turn-unknown = the live conversations by turn and
 * idle age; browsers-ready / browsers-idle-1h = the keeper's live browsers and those with no command for over an hour.
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
const ENGINE_FIELDS = Object.freeze([...ENGINES, 'native']);
const AGES = Object.freeze(['running', 'waiting', 'idle-under-1h', 'idle-1-2h', 'idle-2-4h', 'idle-over-4h', 'turn-unknown']);

/** a hold's CAUSE: the hub's own code location in its frame (`src/x.js:12`), else its verdict (one of the fixed words) */
function causeOf({ verdict = null, frame = null } = {}) {
  const m = typeof frame === 'string' ? /(?:^|[\s(])((?:src\/[\w./-]+|server\.js):\d+)(?=[)\s]|$)/.exec(frame) : null;
  if (m && !m[1].includes('..')) return m[1];
  if (typeof verdict === 'string' && verdict) return VERDICTS.includes(verdict) ? verdict : OTHER;
  return NO_CAUSE;
}
/** an empty hour from `fromMs` (wall clock) */
function newHour(fromMs, { watched = true } = {}) { return { fromMs, watched: !!watched, holds: 0, heldMs: 0, longestMs: 0, by: {}, boot: { holds: 0, heldMs: 0 } }; }
/** a hold (ms, and its verdict / frame) into the hour */
function holdAdd(h, { ms, verdict = null, frame = null, boot = false } = {}) {
  if (!h || !(Number(ms) >= 0)) return h;
  if (boot) { h.boot.holds++; h.boot.heldMs += ms; return h; }   // the boot's own hold: apart, never the hour's
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

/** THE ENGINES' SHARES from a census fold (src/loop-census.js censusFold, or null): each family's share of the BUSY ticks and
 *  native's — nine numbers that add to 100 % (rounding aside); the census's ticks, its asks and what it paid */
function censusWords(c) {
  if (!c || !Array.isArray(c.shares) || !Number.isFinite(c.busyTicks)) return { words: '?', ticks: null, busy: null, notSampled: null, asks: null, paidMs: null };
  const by = new Map(c.shares.map((s) => [s.family, s.share]));
  const native = c.native && Number.isFinite(c.native.share) ? c.native.share : 0;
  const words = c.busyTicks > 0 ? ENGINE_FIELDS.map((f) => `${f} ${((f === 'native' ? native : (by.get(f) || 0)) * 100).toFixed(0)}%`).join('; ') : 'none';
  const ns = c.notSampled && Number.isFinite(c.notSampled.ticks) ? c.notSampled.ticks : null;
  const all = Number.isFinite(c.sampledTicks) && ns != null ? c.sampledTicks + ns : null;
  const cost = c.cost || {};
  return { words, ticks: all, busy: c.busyTicks, notSampled: ns, asks: Number.isFinite(cost.asks) ? cost.asks : null, paidMs: Number.isFinite(cost.paidMs) ? cost.paidMs : null };
}

/**
 * THE LINE. `rep` = { kind: 'hour' | 'exit', hour: newHour()+holdAdd, toMs, busy (0..1 | null), engines (a census fold | null),
 * mem: { heapUsed, heapLimit, rss, kids: { cli: {n, rss}, browser, agentd, other, how } | null } | null,
 * turns: { running, waiting, 'idle-1h', 'idle-2h', 'idle-4h', 'idle-over-4h', 'turn-unknown' } | null,
 * browsers: { ready, idle1h } | null,
 * sizes: { conversations, pageSockets, deviceLinks, wsIn, wsOut, parsedChars, creates, resumes, writes, writeMaxMs } }
 */
function line(rep = {}) {
  const h = rep.hour || newHour(null);
  const w = h.watched !== false;
  const top = w ? (topOf(h.by).map((t) => `${t.cause} ${s1(t.ms)}`).join('; ') || 'none') : '?';
  const e = censusWords(rep.engines);
  const m = rep.mem || {}, k = m.kids || null, z = rep.sizes || {}, tu = rep.turns || null, br = rep.browsers || null;
  const kid = (name) => (k && k[name] ? `${int(k[name].n)}/${mb(k[name].rss)}` : '?/?');
  const span = Number.isFinite(rep.toMs) && Number.isFinite(h.fromMs) ? Math.max(0, rep.toMs - h.fromMs) : null;
  const how = k && ['service', 'container', 'tree'].includes(k.how) ? k.how : '?';
  return [`[loop-${rep.kind === 'exit' ? 'exit' : 'hour'}]`, `hour=${hourOf(h.fromMs)}`, `span=${span == null ? '?' : `${Math.round(span / 1000)}s`}`,
    `held=${w ? s1(h.heldMs) : '?'}`, `holds=${w ? h.holds : '?'}`, `longest=${w ? s1(h.longestMs) : '?'}`,
    `boot-held=${w ? s1(h.boot ? h.boot.heldMs : 0) : '?'}`, `boot-holds=${w ? (h.boot ? h.boot.holds : 0) : '?'}`, `busy=${pct(rep.busy)}`, `top="${top}"`,
    `engines="${e.words}"`, `census-ticks=${int(e.ticks)}`, `busy-ticks=${int(e.busy)}`, `not-sampled=${int(e.notSampled)}`,
    `census-asks=${int(e.asks)}`, `census-paid=${Number.isFinite(e.paidMs) ? `${(e.paidMs / 1000).toFixed(2)}s` : '?'}`,
    `hub-heap=${mb(m.heapUsed)}/${mb(m.heapLimit)}`, `hub-rss=${mb(m.rss)}`, ...KIDS.map((n) => `${n}=${kid(n)}`), `procs-by=${how}`,
    `conversations=${int(z.conversations)}`, ...AGES.map((a) => `${a}=${int(tu ? tu[a] : null)}`),
    `browsers-ready=${int(br ? br.ready : null)}`, `browsers-idle-1h=${int(br ? br.idle1h : null)}`,
    `page-sockets=${int(z.pageSockets)}`, `device-links=${int(z.deviceLinks)}`,
    `ws-in=${int(z.wsIn)}`, `ws-out=${int(z.wsOut)}`, `parsed=${Number.isFinite(z.parsedChars) ? `${(z.parsedChars / 1e6).toFixed(1)}M` : '?'}`,
    `creates=${int(z.creates)}`, `resumes=${int(z.resumes)}`, `writes=${int(z.writes)}`, `write-max=${s1(z.writeMaxMs)}`].join(' ');
}

/** THE LINE'S OWN CHECK (the suite's and the ORCH's): every field present, in its order; nothing but the fixed words */
const N = '(\\d+|\\?)', S = '(\\d+\\.\\ds|\\?)';
const LINE_RE = new RegExp('^\\[loop-(hour|exit)\\] hour=(\\d{4}-\\d\\d-\\d\\dT\\d\\dZ|\\?) span=(\\d+s|\\?)'
  + ` held=${S} holds=${N} longest=${S} boot-held=${S} boot-holds=${N} busy=(\\d+\\.\\d%|\\?) top="[^"]*" engines="[^"]*"`
  + ` census-ticks=${N} busy-ticks=${N} not-sampled=${N} census-asks=${N} census-paid=(\\d+\\.\\d\\ds|\\?)`
  + ' hub-heap=(\\d+MB|\\?)\\/(\\d+MB|\\?) hub-rss=(\\d+MB|\\?)' + KIDS.map((n) => ` ${n}=${N}\\/(\\d+MB|\\?)`).join('') + ' procs-by=(service|container|tree|\\?)'
  + ` conversations=${N}` + AGES.map((a) => ` ${a}=${N}`).join('') + ` browsers-ready=${N} browsers-idle-1h=${N}`
  + ` page-sockets=${N} device-links=${N} ws-in=${N} ws-out=${N} parsed=(\\d+\\.\\dM|\\?) creates=${N} resumes=${N} writes=${N} write-max=${S}$`);
/** the causes a line may name: a code location of the hub's own, a verdict's fixed words, the two markers */
function causesOk(text) {
  const m = /top="([^"]*)"/.exec(String(text || ''));
  if (!m) return false;
  if (m[1] === 'none' || m[1] === '?') return true;
  return m[1].split('; ').every((p) => { const c = p.replace(/ \d+\.\ds$/, ''); return /^(?:src\/[\w./-]+|server\.js):\d+$/.test(c) || VERDICTS.includes(c) || c === NO_CAUSE || c === OTHER; });
}

/** the engines a line may name: the nine fixed fields, each with a whole percent — or «?» / «none» */
function enginesOk(text) {
  const m = /engines="([^"]*)"/.exec(String(text || ''));
  if (!m) return false;
  if (m[1] === '?' || m[1] === 'none') return true;
  const parts = m[1].split('; ');
  return parts.length === ENGINE_FIELDS.length && parts.every((p, i) => new RegExp(`^${ENGINE_FIELDS[i]} \\d+%$`).test(p));
}

/** THE DAY (Diagnostics): the hours kept, folded — held, holds, the longest, the busy share weighted by span, the causes */
function dayFold(hours = []) {
  const out = { hours: 0, unwatched: 0, heldMs: 0, holds: 0, longestMs: 0, busy: null, by: {}, boot: { holds: 0, heldMs: 0 } };
  let busyW = 0, busyS = 0;
  for (const r of hours) {
    const h = r && r.hour; if (!h) continue;
    out.hours++; if (h.watched === false) out.unwatched++;
    out.heldMs += h.heldMs; out.holds += h.holds; out.longestMs = Math.max(out.longestMs, h.longestMs);
    if (h.boot) { out.boot.holds += h.boot.holds; out.boot.heldMs += h.boot.heldMs; }
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

module.exports = { VERDICTS, NO_CAUSE, OTHER, KIDS, ENGINES, ENGINE_FIELDS, AGES, HOUR_MS, causeOf, newHour, holdAdd, topOf, censusWords, line, LINE_RE, causesOk, enginesOk, dayFold, nextHourAt };
