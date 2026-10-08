'use strict';
/**
 * MEMORY PRESSURE REACHES THE OWNER (lane browser-resource-care, B-afeb; the owner 2026-10-02 after a 16:23 OOM:
 * "无头 chrome 如果是用 vibespace-browser 启动的，那 vibespace 应该负责进行维护和限制/提示吧"). Before this the sysinfo
 * watch only LOGGED "[sysinfo] memory pressure: 95 %" while 298 headless-Chrome profile dirs (37 GB) sat on the RAM-backed
 * /tmp — nobody was told and nothing named the conversation that started them.
 *
 * PURE (imports nothing): the sysinfo loop (src/sysinfo.js startWatch) drives it, the server hands the process table and
 * who-is-who; this module decides and words.
 *   · pressureStep(state, sample) — THE EPISODE: on at ≥ ON_PCT of the limit on the working-set gauge (memInfo().used =
 *     usage − inactive_file: page cache never counts — the gauge-must-fall lesson), off below OFF_PCT. ONE For-you item
 *     per episode (`open`), resolved by itself when the episode ends (`close`) — never one per sample.
 *   · attribute(procs, ids) — the top process GROUPS by ΣPss with WHO started each: a keeper browser (its
 *     `--vibespace-keeper=<mark>` ⇒ profile + holders), a conversation's process tree (its wrapper pid), a Background Work
 *     job (its pid), a desktop app (its pid), a Chrome with a debugging port but no keeper mark under a conversation (that
 *     conversation's OWN Chrome, outside vibespace-browser), else "a process VibeSpace did not start".
 *   · pressureItem(...) — the words (text ≤ 500, detail ≤ 8000: user-todos' bounds) + their i18n keys.
 *   · ownChromeNotice(...) — the one line a conversation is told about its own Chrome processes.
 * ORIGIN RULE (one): the item is origin `server` ("This machine") — memory is the machine's, whoever holds it.
 */
const ON_PCT = 90;
const OFF_PCT = 80;
const TOP_GROUPS = 5;
const TEXT_MAX = 500;
const DETAIL_MAX = 8000;
const KEEPER_MARK = '--vibespace-keeper=';
const NOTICE_KIND = 'browser-own-chrome';
const i18nKey = (s) => s;

const gb = (b) => (Math.max(0, Number(b) || 0) / 2 ** 30).toFixed(1);
const pctOf = (s) => (s && Number(s.limit) > 0 && Number.isFinite(Number(s.used)) ? (Number(s.used) / Number(s.limit)) * 100 : null);

/** → { state, open, close, pct }. `state` = { on, episode, since, peak }; a sample without a limit changes nothing. */
function pressureStep(state, sample) {
  const s = { on: !!(state && state.on), episode: (state && Number(state.episode)) || 0, since: state && Number.isFinite(state.since) ? state.since : null, peak: (state && Number(state.peak)) || 0 };
  const pct = pctOf(sample);
  if (pct === null) return { state: s, open: false, close: false, pct: null };
  const at = sample && Number.isFinite(sample.at) ? sample.at : null;
  if (!s.on && pct >= ON_PCT) return { state: { on: true, episode: s.episode + 1, since: at, peak: pct }, open: true, close: false, pct };
  if (s.on && pct < OFF_PCT) return { state: { ...s, on: false, since: null, peak: 0 }, open: false, close: true, pct };
  if (s.on) s.peak = Math.max(s.peak, pct);
  return { state: s, open: false, close: false, pct };
}

const argvOf = (p) => (Array.isArray(p && p.argv) ? p.argv.map(String) : String((p && p.args) || '').split(/\s+/).filter(Boolean));
const markOf = (p) => { for (const a of argvOf(p)) if (a.startsWith(KEEPER_MARK)) return a.slice(KEEPER_MARK.length); return null; };
const isChromeComm = (p) => /chrom(e|ium)|headless_shell/i.test(String((p && p.comm) || '')) || /(^|\/)(google-chrome|chrome|chromium(-browser)?|headless_shell)$/.test(argvOf(p)[0] || '');
/** A Chrome BROWSER process (not a renderer / GPU child) with a debugging port and no keeper mark. */
const isOwnChromeRoot = (p) => isChromeComm(p) && !markOf(p) && argvOf(p).some((a) => a.startsWith('--remote-debugging-port') || a === '--remote-debugging-pipe') && !argvOf(p).some((a) => a.startsWith('--type='));
const userDataDirOf = (p) => { for (const a of argvOf(p)) if (a.startsWith('--user-data-dir=')) return a.slice('--user-data-dir='.length); return null; };

/**
 * → groups sorted by ΣPss (desc): { kind: keeper|own-chrome|session|job|app|unknown, key, who, name, pss, n, pids,
 * profile?, holders?, chromes?, dirs? }. `procs` = [{ pid, ppid, pss, comm, args|argv }] (pss in bytes; a process
 * whose PSS was unreadable carries its rss as `pss` with `approx: true`). `ids` = { sessions: [{pid, name}],
 * jobs: [{pid, name}], apps: [{pid, name}], keepers: { [mark]: { label, holders: [names] } } } — every pid list is
 * the ROOT of that owner's tree (a wrapper, a job's child, an app's launcher). `only(p)` (lane fuse-canary-notice) counts
 * just the processes it accepts — the others still carry the ancestry (src/mount-health.js suspectsOf).
 */
function attribute(procs, ids = {}, { only = null } = {}) {
  const byPid = new Map();
  for (const p of Array.isArray(procs) ? procs : []) if (p && Number.isInteger(p.pid)) byPid.set(p.pid, p);
  const rootOf = (list) => { const m = new Map(); for (const x of Array.isArray(list) ? list : []) if (x && Number.isInteger(x.pid)) m.set(x.pid, String(x.name || x.pid)); return m; };
  const sessions = rootOf(ids.sessions), jobs = rootOf(ids.jobs), apps = rootOf(ids.apps);
  const keepers = ids.keepers && typeof ids.keepers === 'object' ? ids.keepers : {};
  const groups = new Map();
  const add = (key, base, p) => {
    let g = groups.get(key);
    if (!g) { g = { ...base, key, pss: 0, n: 0, pids: [], approx: false }; groups.set(key, g); }
    g.pss += Math.max(0, Number(p.pss) || 0); g.n++; if (g.pids.length < 20) g.pids.push(p.pid); if (p.approx) g.approx = true;
    return g;
  };
  for (const p of byPid.values()) {
    if (only && !only(p)) continue; // lane fuse-canary-notice: count only the processes pressing a mount (their parents still attribute)
    let cur = p, chromeRoot = null, owner = null, root = p;
    for (let hops = 0; cur && hops < 64; hops++) {
      const mark = markOf(cur);
      if (mark) { const k = keepers[mark] || {}; owner = { kind: 'keeper', key: 'keeper:' + mark, name: String(k.label || mark), profile: String(k.label || mark), holders: (Array.isArray(k.holders) ? k.holders : []).map(String) }; break; }
      if (!chromeRoot && isOwnChromeRoot(cur)) chromeRoot = cur;
      if (sessions.has(cur.pid)) { const name = sessions.get(cur.pid); owner = chromeRoot ? { kind: 'own-chrome', key: 'own:' + name, name } : { kind: 'session', key: 'session:' + name, name }; break; }
      if (jobs.has(cur.pid)) { owner = { kind: 'job', key: 'job:' + jobs.get(cur.pid), name: jobs.get(cur.pid) }; break; }
      if (apps.has(cur.pid)) { owner = { kind: 'app', key: 'app:' + apps.get(cur.pid), name: apps.get(cur.pid) }; break; }
      root = cur;
      if (!(cur.ppid > 1)) break; // an unknown tree's root is the ancestor just below init — never init itself
      cur = byPid.get(cur.ppid);
    }
    if (!owner) owner = { kind: 'unknown', key: 'unknown:' + root.pid, name: String(root.comm || argvOf(root)[0] || 'process').split('/').pop().slice(0, 60), rootPid: root.pid };
    const g = add(owner.key, owner, p);
    if (owner.kind === 'own-chrome' && chromeRoot) {
      g.chromes = g.chromes || []; g.dirs = g.dirs || [];
      if (!g.chromes.includes(chromeRoot.pid)) { g.chromes.push(chromeRoot.pid); const d = userDataDirOf(chromeRoot); if (d && !g.dirs.includes(d)) g.dirs.push(d); }
    }
  }
  return [...groups.values()].sort((a, b) => b.pss - a.pss || String(a.key).localeCompare(String(b.key)));
}

/** WHO, in the owner's words (English; the i18n row carries the same key + params). */
function whoOf(g) {
  if (!g) return { text: '', key: '', params: {} };
  if (g.kind === 'keeper') {
    const holders = (g.holders || []).slice(0, 3).join(', ');
    return holders
      ? { text: `the agent browser "${g.profile}" (used by ${holders})`, key: i18nKey('the agent browser "{profile}" (used by {holders})'), params: { profile: g.profile, holders } }
      : { text: `the agent browser "${g.profile}"`, key: i18nKey('the agent browser "{profile}"'), params: { profile: g.profile } };
  }
  if (g.kind === 'own-chrome') return { text: `Chrome started by ${g.name} outside vibespace-browser`, key: i18nKey('Chrome started by {name} outside vibespace-browser'), params: { name: g.name } };
  if (g.kind === 'session') return { text: `the conversation ${g.name}`, key: i18nKey('the conversation {name}'), params: { name: g.name } };
  if (g.kind === 'job') return { text: `the Background Work job ${g.name}`, key: i18nKey('the Background Work job {name}'), params: { name: g.name } };
  if (g.kind === 'app') return { text: `the desktop app ${g.name}`, key: i18nKey('the desktop app {name}'), params: { name: g.name } };
  return { text: `a process VibeSpace did not start: ${g.name} (${g.rootPid})`, key: i18nKey('a process VibeSpace did not start: {comm} ({pid})'), params: { comm: g.name, pid: g.rootPid } };
}

/**
 * The For-you item. `tmpfs` = { mount, used, size } | null (the RAM-backed /tmp); `roots` = [{ path, bytes }] (the
 * largest /tmp/vs-* / cdp-prof-* / agent-browser-chrome-* roots). → { text, detail, i18n }.
 */
function pressureItem({ pct, used, limit, groups = [], tmpfs = null, roots = [] } = {}) {
  const top = (Array.isArray(groups) ? groups : []).slice(0, TOP_GROUPS);
  const P = Math.round(Number(pct) || 0);
  const first = top.length ? whoOf(top[0]) : null;
  const head = { text: `Memory is ${P}% full (${gb(used)} of ${gb(limit)} GB)` + (first ? ` — the most is held by ${first.text}` : ''), key: first ? i18nKey('Memory is {pct}% full ({used} of {limit} GB) — the most is held by {who}') : i18nKey('Memory is {pct}% full ({used} of {limit} GB)'), params: { pct: P, used: gb(used), limit: gb(limit), ...(first ? { who: first.text } : {}) } };
  const lines = [], rows = [];
  lines.push('The largest process groups (PSS, each page counted once):'); rows.push({ key: i18nKey('The largest process groups (PSS, each page counted once):') });
  for (const g of top) {
    const w = whoOf(g);
    const size = `${gb(g.pss)} GB${g.approx ? ' (RSS)' : ''}`;
    lines.push(`- ${size} · ${w.text} · ${g.n} process${g.n === 1 ? '' : 'es'}`);
    rows.push({ key: i18nKey('- {size} · {who} · {n} processes'), params: { size, who: w.text, n: g.n } });
  }
  if (tmpfs && Number(tmpfs.size) > 0) {
    lines.push('', `${tmpfs.mount || '/tmp'} is in RAM: ${gb(tmpfs.used)} of ${gb(tmpfs.size)} GB used — files there count as memory.`);
    rows.push({ key: i18nKey('{mount} is in RAM: {used} of {size} GB used — files there count as memory.'), params: { mount: tmpfs.mount || '/tmp', used: gb(tmpfs.used), size: gb(tmpfs.size) } });
    for (const r of (Array.isArray(roots) ? roots : []).slice(0, 5)) { lines.push(`- ${gb(r.bytes)} GB · ${r.path}`); rows.push({ key: '- {size} GB · {path}', params: { size: gb(r.bytes), path: r.path } }); }
  }
  if (top.some((g) => g.kind === 'own-chrome')) {
    lines.push('', 'A conversation that started its own Chrome was told to use vibespace-browser, which keeps profiles off RAM and reports their size.');
    rows.push({ key: i18nKey('A conversation that started its own Chrome was told to use vibespace-browser, which keeps profiles off RAM and reports their size.') });
  }
  lines.push('', 'Nothing was stopped. This item resolves itself when memory falls below 80%.');
  rows.push({ key: i18nKey('Nothing was stopped. This item resolves itself when memory falls below 80%.') });
  return { text: head.text.slice(0, TEXT_MAX), detail: lines.join('\n').slice(0, DETAIL_MAX), i18n: { text: { key: head.key, params: head.params }, detail: rows } };
}

/** The ONE line a conversation is told (free, next turn) about Chrome it started outside vibespace-browser. */
function ownChromeNotice({ count, dirs = [], bytes = null, tmpfsDirs = null } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const onTmp = (Array.isArray(tmpfsDirs) ? tmpfsDirs : dirs).filter(Boolean);
  const where = onTmp.length ? ` (profile dirs on tmpfs: ${onTmp.slice(0, 3).join(', ')}${onTmp.length > 3 ? ` +${onTmp.length - 3}` : ''}${Number.isFinite(bytes) ? `, ${gb(bytes)} GB` : ''})` : '';
  return `You started ${n} Chrome process${n === 1 ? '' : 'es'} outside vibespace-browser${where}. Use vibespace-browser (it keeps profiles off RAM and reports their size); if you must run your own, give it --user-data-dir under your cwd.`;
}

/** session-status's renderer for NOTICE_KIND. */
function renderOwnChromeNotice(n) {
  return '<system-reminder>\n' + String((n && n.text) || ownChromeNotice(n || {})).slice(0, 600) + '\n</system-reminder>';
}

module.exports = { pressureStep, attribute, whoOf, pressureItem, ownChromeNotice, renderOwnChromeNotice, isOwnChromeRoot, markOf, ON_PCT, OFF_PCT, TOP_GROUPS, TEXT_MAX, DETAIL_MAX, NOTICE_KIND };
