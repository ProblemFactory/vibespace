'use strict';
/**
 * A WEDGED MOUNT REACHES THE OWNER BY NAME (lane fuse-canary-notice, B-b327). 2026-09-25 20:43–20:47Z on this instance:
 * the threadpool canary (src/server/fs-canary.js) struck three times, then the event loop gapped 207 s — and the only
 * trace was the journal. The owner learned nothing until the freeze, and the server kept pressing the FUSE mount with
 * its own discovery sweeps and usage walk the whole time.
 *
 * PURE (imports only memory-pressure — PURE → PURE, the ONE attribution of who started a process): the canary's probes
 * drive it (src/server/mount-health-watch.js does the I/O); this module decides and words.
 *   · canaryStep(state, probe) — THE EPISODE: on at the 2nd strike within WINDOW_MS, off after CLEAN_TO_END clean probes
 *     in a row. ONE For-you item per episode (`open`), resolved by itself when it ends (`close`) — never one per strike.
 *   · suspectsOf(procs, mountpoint, ids) — who is pressing the mount: processes whose cwd / open files / argv are under
 *     it, grouped by WHO started them through memory-pressure's attribute() (the same session / job / browser / app /
 *     unknown rows), heaviest first by the number of hits.
 *   · shouldPause(kind, state, paths) — THE PAUSE VERDICT per kind: the server's OWN scans of the wedged mount stop;
 *     a person's read (`user-read`) never does — it runs and, if it stalls, the canary says so. An undeclared kind is
 *     never paused.
 *   · canaryItem(...) / canaryEndLine(...) — the words (text ≤ 500, detail ≤ 8000: user-todos' bounds) + their i18n keys.
 * ORIGIN RULE (one, lane browser-resource-care's): the item is origin `server` ("This machine").
 */
const MP = require('./memory-pressure.js');

const WINDOW_MS = 2 * 60 * 1000;
const STRIKES_TO_OPEN = 2;
const CLEAN_TO_END = 3;
const TOP_SUSPECTS = 5;
const TEXT_MAX = MP.TEXT_MAX;
const DETAIL_MAX = MP.DETAIL_MAX;
// the server's own scans, each paused at its existing gate; a person's read is declared so the verdict can refuse it by name
const PAUSE_KINDS = Object.freeze(['discovery', 'usage-walk', 'age-sweep', 'mount-scan']);
const NEVER_PAUSED = Object.freeze(['user-read']);
const KIND_WORDS = Object.freeze({ discovery: '- the session discovery sweep', 'usage-walk': '- the usage walk', 'age-sweep': '- the age-based buffer and meta sweeps', 'mount-scan': '- the mount cache scan' });
const i18nKey = (s) => s;

const fresh = () => ({ on: false, episode: 0, strikes: [], clean: 0, since: null, count: 0, worstMs: 0 });

/** → { state, open, close, wedgedMs }. `probe` = { strike: bool, at, ms } (one canary answer; a lost probe is not passed). */
function canaryStep(state, probe) {
  const s0 = state && typeof state === 'object' ? state : fresh();
  const s = { ...fresh(), ...s0, strikes: Array.isArray(s0.strikes) ? s0.strikes.slice() : [] };
  const at = probe && Number.isFinite(probe.at) ? probe.at : null;
  if (!probe || at === null) return { state: s, open: false, close: false, wedgedMs: null };
  if (probe.strike) {
    s.strikes = s.strikes.filter((t) => at - t < WINDOW_MS).concat(at);
    s.clean = 0;
    s.worstMs = Math.max(s.worstMs, Number(probe.ms) || 0);
    if (s.on) { s.count++; return { state: s, open: false, close: false, wedgedMs: null }; }
    if (s.strikes.length >= STRIKES_TO_OPEN) {
      return { state: { ...s, on: true, episode: s.episode + 1, since: s.strikes[0], count: s.strikes.length }, open: true, close: false, wedgedMs: null };
    }
    return { state: s, open: false, close: false, wedgedMs: null };
  }
  if (!s.on) return { state: s, open: false, close: false, wedgedMs: null };
  s.clean++;
  if (s.clean < CLEAN_TO_END) return { state: s, open: false, close: false, wedgedMs: null };
  const wedgedMs = Math.max(0, at - (s.since || at));
  return { state: { ...fresh(), episode: s.episode }, open: false, close: true, wedgedMs };
}

const norm = (p) => { const s = String(p || ''); return s.length > 1 ? s.replace(/\/+$/, '') : s; };
/** Is `p` the mountpoint or under it (string paths, already real). */
function underMount(p, mountpoint) {
  const mp = norm(mountpoint), x = norm(p);
  if (!mp || !x || x[0] !== '/') return false;
  return mp === '/' || x === mp || x.startsWith(mp + '/');
}

/** The mountpoint holding `file` (a REAL path) from /proc/self/mountinfo's text: the longest mount point prefix. */
function mountOf(mountinfo, file) {
  let best = null;
  for (const ln of String(mountinfo || '').split('\n')) {
    const f = ln.split(' ');
    if (f.length < 5) continue;
    const mp = f[4].replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    if (underMount(file, mp) && (!best || mp.length > best.length)) best = mp;
  }
  return best;
}

const argvOf = (p) => (Array.isArray(p && p.argv) ? p.argv.map(String) : String((p && p.args) || '').split(/\s+/).filter(Boolean));

/**
 * → [{ kind, key, name, hits, n, pids, via: ['cwd'|'files'|'argv'], who: {text,key,params}, … }] heaviest first, at most
 * `top`. `procs` = [{ pid, ppid, comm, argv|args, cwd?, fds?: [target], fdHits?: n }] — EVERY process (the parents carry
 * the attribution), only those with a hit are counted. `ids` = memory-pressure attribute()'s owner roots.
 */
function suspectsOf(procs, mountpoint, ids = {}, { top = TOP_SUSPECTS } = {}) {
  const via = new Map();
  const weighed = (Array.isArray(procs) ? procs : []).filter((p) => p && Number.isInteger(p.pid)).map((p) => {
    const why = [];
    let w = 0;
    const fdHits = Array.isArray(p.fds) ? p.fds.filter((t) => underMount(t, mountpoint)).length : Math.max(0, Math.floor(Number(p.fdHits) || 0));
    if (fdHits) { w += fdHits; why.push('files'); }
    if (p.cwd && underMount(p.cwd, mountpoint)) { w += 1; why.push('cwd'); }
    if (argvOf(p).some((a) => underMount(a.replace(/^--?[\w-]+=/, ''), mountpoint))) { w += 1; why.push('argv'); }
    if (w) via.set(p.pid, why);
    return { ...p, pss: w, approx: false };
  });
  const groups = MP.attribute(weighed, ids, { only: (p) => p.pss > 0 });
  return groups.slice(0, Math.max(0, top)).map((g) => {
    const how = new Set();
    for (const pid of g.pids) for (const w of via.get(pid) || []) how.add(w);
    const { pss, ...rest } = g;
    return { ...rest, hits: pss, via: ['files', 'cwd', 'argv'].filter((w) => how.has(w)), who: MP.whoOf(g) };
  });
}

/** THE PAUSE VERDICT. `state` = { on, mountpoint }; `paths` = the scan's own roots (real paths) — none given ⇒ the scan
 *  presses the server's own tree, which the canary probes. */
function shouldPause(kind, state, paths = null) {
  if (NEVER_PAUSED.includes(kind) || !PAUSE_KINDS.includes(kind)) return false;
  if (!state || !state.on || !state.mountpoint) return false;
  const list = (Array.isArray(paths) ? paths : paths ? [paths] : []).filter(Boolean);
  return !list.length || list.some((p) => underMount(p, state.mountpoint));
}

const secs = (ms) => Math.max(0, Math.round((Number(ms) || 0) / 1000));

/** The For-you item. `pausing` = the kinds paused (PAUSE_KINDS order). → { text, detail, i18n }. */
function canaryItem({ mountpoint, strikes, latencyMs, suspects = [], pausing = PAUSE_KINDS } = {}) {
  const mount = String(mountpoint || '?');
  const n = Math.max(1, Math.floor(Number(strikes) || 1));
  const s = secs(latencyMs);
  const top = (Array.isArray(suspects) ? suspects : []).slice(0, TOP_SUSPECTS);
  const first = top.length ? top[0].who || MP.whoOf(top[0]) : null;
  const head = first
    ? { text: `The folder ${mount} stopped answering (${n} checks over ${s} s) — the most is open by ${first.text}`, key: i18nKey('The folder {mount} stopped answering ({n} checks over {s} s) — the most is open by {who}'), params: { mount, n, s, who: first.text } }
    : { text: `The folder ${mount} stopped answering (${n} checks over ${s} s)`, key: i18nKey('The folder {mount} stopped answering ({n} checks over {s} s)'), params: { mount, n, s } };
  const lines = [], rows = [];
  const say = (text, key, params) => { lines.push(text); rows.push(params ? { key, params } : { key }); };
  if (top.length) {
    say('Who is using it (open files, working folders and command lines under it):', i18nKey('Who is using it (open files, working folders and command lines under it):'));
    for (const g of top) {
      const w = g.who || MP.whoOf(g);
      say(`- ${g.hits} · ${w.text} · ${g.n} process${g.n === 1 ? '' : 'es'}`, i18nKey('- {hits} · {who} · {n} processes'), { hits: g.hits, who: w.text, n: g.n });
    }
  } else say('No process has a file open there.', i18nKey('No process has a file open there.'));
  const kinds = PAUSE_KINDS.filter((k) => (Array.isArray(pausing) ? pausing : []).includes(k));
  if (kinds.length) {
    lines.push('');
    say('VibeSpace paused its own scans of it until it answers:', i18nKey('VibeSpace paused its own scans of it until it answers:'));
    for (const k of kinds) say(KIND_WORDS[k], i18nKey(KIND_WORDS[k]));
  }
  lines.push('');
  say('A file you open yourself is never paused. This item resolves itself when the folder answers again.', i18nKey('A file you open yourself is never paused. This item resolves itself when the folder answers again.'));
  return { text: head.text.slice(0, TEXT_MAX), detail: lines.join('\n').slice(0, DETAIL_MAX), i18n: { text: { key: head.key, params: head.params }, detail: rows } };
}

/** The journal's end-of-episode words. */
function canaryEndLine({ mountpoint, wedgedMs } = {}) {
  return `the mount ${String(mountpoint || '?')} answers again — ${secs(wedgedMs)} s wedged`;
}

module.exports = { canaryStep, suspectsOf, shouldPause, canaryItem, canaryEndLine, mountOf, underMount, WINDOW_MS, STRIKES_TO_OPEN, CLEAN_TO_END, TOP_SUSPECTS, PAUSE_KINDS, NEVER_PAUSED, TEXT_MAX, DETAIL_MAX };
