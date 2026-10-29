// Per-PROCESS scratch paths + free ports for the suites that spawn a throwaway
// server / headless chrome / git worktree (2.369.76). Fixed `/tmp/vs-<name>`
// paths and fixed ports were a MACHINE-wide collision: the heavy tier, a
// verifier agent running the same gate suite in its own worktree, and a
// developer's local run all shared `/tmp/vs-chatpage-smoke`, the chrome
// profile dir and port 3990 — one run's cleanup `git worktree remove --force`
// deleted another run's worktree mid-build (heavy tier RED at 40ad936d on
// test-chat-paging: esbuild lost its input, the retry's `worktree add` hit the
// path the other run had just recreated). 2.369.46 fixed ONE instance
// (test-chat-e2e's port 3995) inline; this is the third strike, so the idiom is
// shared and test-architecture sweeps every scripts/test-*.mjs for the fixed
// shapes. NOT a test-*.mjs on purpose: the tier census would demand a tier.
//
// SINCE 2026-09-09 the prefix and the tmp root are NOT literals here: they come
// from src/fixture-guard.js, the ONE declaration of what a fixture looks like.
// The production usage walk and session discovery skip exactly what this
// function mints, and the standing sweep (scripts/test-fixture-isolation.mjs)
// checks the real ~/.claude/projects for exactly what this function mints — so
// a suite that renames its scratch dir cannot walk out from under the guard.
import net from 'node:net';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stampScratchRun, readRunRecord, runOwnerState, RUN_RECORD } from './scratch-run.mjs';
const require = createRequire(import.meta.url);
const { FIXTURE_CWD_PREFIX, TMP_ROOTS, FIXTURE_SID_PREFIX } = require('../src/fixture-guard.js');
export { stampScratchRun, readRunRecord, runOwnerState, RUN_RECORD };

/** The first-run Welcome wizard is skipped when localStorage 'vs-onboarded' is
 *  set OR when the machine already has sessions (app.js _checkOnboarding). A
 *  chrome suite that does not pre-set the flag is therefore GREEN on a
 *  developer box (whose ~/.claude has sessions) and RED on the Actions runner
 *  (empty ~/.claude): the wizard's modal covers the chrome under test and its
 *  own capture-phase Escape eats the first Esc (2.369.125 r7 — test-gear-menu's
 *  Esc legs, and the three suites red on every mirror run since 2.369.75).
 *  Every suite passes this to Page.addScriptToEvaluateOnNewDocument BEFORE its
 *  first Page.navigate; test-architecture §47 is the census.
 *  Lane vault-e2e-password: the same source snoozes the vault's setup ask (`vs-vault-later`, an epoch ms — src/lib/
 *  vault-unlock.js maybeNagVault): a scratch hub's vault is never set up, and its modal would cover the chrome under test
 *  the way the wizard did. A LOCKED vault's unlock modal is not snoozed by anything. */
/** The keys the preset writes. A suite that censuses what a PAGE stored excludes exactly these (test-slack-relay ④) — never
 *  a literal of its own: the .314 mirror went red when the vault key joined and the relay census still knew only the first. */
export const PRESET_KEYS = Object.freeze({ 'vs-onboarded': '1', 'vs-vault-later': '9999999999999', 'vs-rail-labels': 'done' });   // vs-rail-labels (lane door-day-one-landing): the first week's rail words, done
export const ONBOARDED_SOURCE = `try { ${Object.entries(PRESET_KEYS).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} } catch {}`;

/** `/tmp/vs-<name>-<pid>` — unique per process, cleaned by the owning suite. */
export function scratch(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`scratch(): bad name ${JSON.stringify(name)}`);
  // lane H verify r2: `vs-ab-<n>` is the PRODUCT's socket-dir fallback shape (src/browser-profiles.js socketDirDecision),
  // which the scratch reaper (scripts/ci.mjs PRODUCT_ROOT_RE) never judges — a suite minting it would hide from the sweep
  if (name === 'ab') throw new Error('scratch(): "ab" would mint /tmp/vs-ab-<pid> — the product\'s own socket-dir shape; pick another name');
  const p = path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}${name}-${process.pid}`);
  if (IS_SUITE) endScratchAtExit(p);
  return p;
}

/** B-60d2 (2026-10-07): A SUITE ENDS WHAT IT MADE. /tmp is tmpfs (RAM + swap) and held 30 of 62 GB: 13 986 `vs-*`
 *  directories older than a day — 157 names minted here by 75 suites had no removal on any path, and a suite with one
 *  removes nothing when it throws before its cleanup line. So a SUITE's mint (argv[1] is a scripts/test-*.mjs; a helper,
 *  a dbg probe and ci.mjs mint nothing that is removed for them) is registered, and removed when the process exits —
 *  a red, a throw, process.exit, the end of the event loop. A suite that HANDS its root to a detached process the reaper
 *  owns calls keepScratch(dir), and is an EXEMPT row of test-architecture §84 with its reason. A suite killed by a signal
 *  runs no exit hook: the gate's directory sweep (scripts/scratch-sweep.mjs) reaps that dir once nothing holds it and its
 *  newest write is a day old. */
const IS_SUITE = /^test-[A-Za-z0-9._-]+\.mjs$/.test(path.basename(process.argv[1] || ''));
const ENDS = new Set();
/** The delete helper: `dir` is removed when this process exits (idempotent; a non-scratch path is refused). */
export function endScratchAtExit(dir) {
  if (!String(dir).startsWith(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX))) throw new Error(`endScratchAtExit(): ${JSON.stringify(dir)} is not a ${TMP_ROOTS[0]}/${FIXTURE_CWD_PREFIX}* scratch dir`);
  if (!ENDS.size) process.on('exit', endAll);
  ENDS.add(dir);
  return dir;
}
/** A root handed to a detached process: not removed at exit (the dir sweep judges it by its holders). */
export function keepScratch(dir) { ENDS.delete(dir); return dir; }
function endAll() { for (const d of ENDS) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { } } }

/** lane app-page-csp (design q-043 D6, §5 P0-d): EVERY CHROME SUITE ENDS WITH ZERO CSP REPORTS — the ONE teardown check.
 *  A SUITE's hubs inherit `VIBESPACE_CSP_REPORTS_FILE` (set here at import; server.js hands it to src/server/csp-reports.js):
 *  every report the app page's report-only policy (src/app-csp.js) posts to a scratch hub lands in THIS process's one
 *  file, whatever the suite's tree, data dir or cleanup order. At exit — before the scratch roots are removed — that file
 *  and every `<root>/data/csp-reports.jsonl` / `<root>/<dir>/data/csp-reports.jsonl` under a root still standing (a hub
 *  spawned without the inherited env) are read: a line ⇒ the reports are printed and the suite FAILS (exit 1). That is
 *  how the policy is proven complete before a later lane enforces it. A suite that posts reports ON PURPOSE
 *  (test-csp-report) hands its sink an explicit file of its own. */
export const CSP_REPORTS_ENV = 'VIBESPACE_CSP_REPORTS_FILE';
export const CSP_REPORTS_FILE = IS_SUITE ? path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}csp-reports-${process.pid}`, 'csp-reports.jsonl') : null;
/** THE ONE EXCEPTION LIST (主开发's ruling, 2026-10-20): a report a suite may end with, pinned by suite + directive + what
 *  was blocked + where. Every other report in any suite FAILS it. Never 'unsafe-inline' on the app page instead.
 *  EMPTY since lane design-frame-host (B-8679): its two rows — test-design-window's artboard / print / print-all srcdoc
 *  frames and test-channels-aggregate-ui's mail frame, both inheriting the app page's policy — went when those frames
 *  moved to the hub's frame host (src/server/frame-host.js: their own policy, a real header). A suite's OWN probe frame
 *  (a srcdoc it makes to read or forge a document) takes its reports with `takeCspReports`. */
export const CSP_EXCEPTIONS = Object.freeze([]);
/** The exception row a report line is excused by, or null. `suite` = the suite file's basename. */
export function cspExcused(line, suite = path.basename(process.argv[1] || '')) {
  let r; try { r = typeof line === 'string' ? JSON.parse(line) : line; } catch { return null; }
  return CSP_EXCEPTIONS.find((x) => x.suite === suite && r && (!x.directive || x.directive.test(String(r.directive))) && (x.blocked == null || r.blocked === x.blocked) && (x.source == null || r.source === x.source) && r.document === x.document) || null;
}
/** A NEGATIVE CONTROL THAT PARSES HOSTILE MARKUP RUNS HERE (lane chrome-156-drift): `expression` is evaluated in a FRESH
 *  about:blank tab of the suite's own Chrome — a page with no content-security policy — over that tab's own socket, and the
 *  tab is closed; resolves the value (returnByValue). Since Chrome 156 an inline handler is reported when its attribute is
 *  SET — in an inert document (createHTMLDocument / DOMParser / <template>) too, as the page that ran the code, at the
 *  position of the statement (measured on 156.0.8078.47; 155 reported only a handler that compiled). On the app page such a
 *  control IS a CSP report: the runner's «script-src-attr inline, line 1 column 101, source ""» was three suites' own
 *  control — `d.innerHTML =` at column 101 of the evaluated line. The same browser parses the same markup here; nothing
 *  reports and no handler runs. Bounded: a tab that never answers rejects after `ms`. */
export async function evalInBlankTab(cdpPort, expression, { ms = 15000 } = {}) {
  const t = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  try {
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('the blank tab\'s socket did not open')); });
    const r = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`the blank tab gave no answer in ${ms} ms`)), ms);
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) { clearTimeout(timer); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    if (r.exceptionDetails) throw new Error('the blank tab threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  } finally {
    try { ws.close(); } catch { }
    try { await fetch(`http://127.0.0.1:${cdpPort}/json/close/${t.id}`); } catch { }
  }
}

/** A REAL CLICK AS ONE ACT (int358 — test-channel-jump ② was red 4 runs of 7 on the 2.369.358 train): a suite's real click
 *  MEASURED its element, then pressed where it HAD been; rows that move while an agent's turn lands (the card grows, the
 *  chat's tail pin scrolls it) put a NEIGHBOUR under the pointer, and the product rightly opened the neighbour. This door
 *  measures (scrolled into view), moves the pointer there and asks AT PRESS TIME whether the element under the pointer
 *  (document.elementFromPoint) is the measured one or inside it; a target that moved is re-aimed ONCE and said in the log;
 *  still not under the pointer ⇒ no press (false; `realClick.lastMiss` says why). `realClick.reaimed` = the last re-aim.
 *  `evalJs(expr)` = the suite's Runtime.evaluate (returnByValue); `cdp(method, params)` = its socket; `beforePress` = a
 *  test hook between the measure and the press (a RED control's scripted late shift). */
export function realClicker({ evalJs, cdp, log = (line) => console.log(line) }) {
  const desc = 'const desc = (h) => (h ? h.tagName + \'.\' + String(h.className).slice(0, 60) : null);';
  const MEASURE = (sel) => `(() => { ${desc} const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; window.__vsRealClickEl = e; const hit = document.elementFromPoint(x, y); return { x, y, w: q.width, h: q.height, hit: desc(hit), hits: !!hit && (hit === e || e.contains(hit)) }; })()`;
  const UNDER = (x, y) => `(() => { ${desc} const e = window.__vsRealClickEl, hit = document.elementFromPoint(${x}, ${y}); return { hit: desc(hit), hits: !!e && e.isConnected && !!hit && (hit === e || e.contains(hit)) }; })()`;
  const realClick = async (sel, { beforePress = null } = {}) => {
    realClick.lastMiss = null; realClick.reaimed = null;
    let r = await evalJs(MEASURE(sel));
    if (!r || !r.hits) { realClick.lastMiss = r; return false; }
    if (beforePress) await beforePress(r);
    for (let aim = 0; ; aim++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      const u = await evalJs(UNDER(r.x, r.y));
      if (u && u.hits) break;
      if (aim === 1) { realClick.lastMiss = { ...r, atPress: u, why: 'still not under the pointer after one re-aim' }; log(`  [realClick] ${sel}: still not under the pointer after one re-aim (${u && u.hit}) — no press`); return false; }
      const r2 = await evalJs(MEASURE(sel));
      realClick.reaimed = { from: { x: Math.round(r.x), y: Math.round(r.y) }, under: u && u.hit, to: r2 ? { x: Math.round(r2.x), y: Math.round(r2.y) } : null };
      log(`  [realClick] ${sel}: it moved between the measure and the press — at (${Math.round(r.x)}, ${Math.round(r.y)}) the pointer was over ${u && u.hit}; re-aimed once at ${r2 ? `(${Math.round(r2.x)}, ${Math.round(r2.y)})` : 'nothing (gone)'}`);
      if (!r2 || !r2.hits) { realClick.lastMiss = r2; return false; }
      r = r2;
    }
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return true;
  };
  realClick.lastMiss = null; realClick.reaimed = null;
  return realClick;
}
/** A suite that plants a violation ON PURPOSE (a negative control) TAKES its report: waits ≤ `ms` for `want` lines matching
 *  `match` (a parsed line → bool) in this suite's file, removes them and returns them (the hub never writes the same key
 *  twice). What is left is what the teardown judges. */
export async function takeCspReports(match, { ms = 5000, step = 100, want = 1 } = {}) {
  const t0 = Date.now();
  for (;;) {
    let lines = []; try { lines = fs.readFileSync(CSP_REPORTS_FILE, 'utf8').split('\n').filter(Boolean); } catch { }
    const parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const hit = parsed.filter((r) => r && match(r));
    if (hit.length >= want || Date.now() - t0 > ms) {
      if (hit.length) { const keep = lines.filter((l, i) => !(parsed[i] && match(parsed[i]))); const tmp = CSP_REPORTS_FILE + '.take'; fs.writeFileSync(tmp, keep.length ? keep.join('\n') + '\n' : ''); fs.renameSync(tmp, CSP_REPORTS_FILE); }
      return hit;
    }
    await new Promise((r) => setTimeout(r, step));
  }
}
/** A SUITE'S OWN PROBE IS NEVER COUNTED AS THE APP'S (lane ci-mirror-hygiene, 2.369.362 — the mirror's Chrome 156 ran
 *  test-chat-mermaid-chrome red on 2.369.361, both tries, on its OWN XSS probe). A hostile payload a suite plants ON THE
 *  APP PAGE to prove the product drops it can still be REPORTED: the product's sanitizer parses it in an inert document,
 *  and since Chrome 156 a dropped inline handler is reported when its attribute is SET (evalInBlankTab) — nothing ran.
 *  One browser files that report, another does not, so it is EXPECTED — keyed by the probe's own payload: `key` names all
 *  of PROBE_KEY_FIELDS (`sample` = the payload's handler text, the browser's ≤ 40-character cut; `source` = the code that
 *  set it; `document` = the app page) and a line must match every one exactly; a key that names fewer throws (it would
 *  take somebody else's report). Called once the reports have landed (a report-uri post takes ~0.4 s): the matching
 *  lines are taken out of this suite's file → { taken, ok, kind, noticed } — `ok` = none (a browser that does not report
 *  it, Chrome 154) or EXACTLY one; `kind` / `noticed` = the hub's verdict on the taken line (lane csp-mermaid-sites r2:
 *  the take alone took a NOTICED line as gladly as the sanitizer's — the suite judges them, probeVerdictFault below).
 *  A line that differs in any field is not taken: the suite's legs and the teardown name it, red.
 *  Never a wider policy, never a dropped probe, never a leg skipped by the browser's version. */
export const PROBE_KEY_FIELDS = Object.freeze(['directive', 'blocked', 'sample', 'source', 'document']);
export async function takeProbeCspReport(key, { ms = 0 } = {}) {
  const missing = PROBE_KEY_FIELDS.filter((k) => typeof key?.[k] !== 'string' || !key[k]);
  if (missing.length) throw new Error(`takeProbeCspReport: the key names no ${missing.join(' / ')} — a probe's report is keyed by its own payload`);
  const taken = await takeCspReports((r) => PROBE_KEY_FIELDS.every((k) => r[k] === key[k]), { ms, want: 1 });
  return { taken, ok: taken.length <= 1, kind: taken[0] ? taken[0].kind || null : null, noticed: !!(taken[0] && taken[0].noticed) };
}
/** THE HUB'S VERDICT ON A PROBE THE SANITIZER DROPPED (lane csp-mermaid-sites r2 — merged beside the take, the real-browser
 *  leg passed whether the hub judged the probe's report the sanitizer's or filed the For-you notice). A browser that
 *  reports a dropped inline handler (Chrome ≥ REPORTS_DROPPED_HANDLER) files EXACTLY the probe's one line, and the hub
 *  judged it the sanitizer's parse: kind `sanitizer-parse`, no notice, no page-security notice in For you, and the count
 *  Diagnostics shows (GET /api/csp-reports — lines) +1 for the sanitizer, +0 for the app page; an older one files none and
 *  counts none. `probe` = takeProbeCspReport's answer, `major` = the browser's, `forYou` = the hub's open For-you items
 *  keyed `csp-report`, `count` = { before, after } (the summary before the probe was drawn and once its report landed).
 *  → '' when so, else what is wrong, in words (the leg prints it, red by name). */
export const REPORTS_DROPPED_HANDLER = 156;
export function probeVerdictFault(probe, { major, forYou = [], count = null } = {}) {
  const n = probe && Array.isArray(probe.taken) ? probe.taken.length : 0, p0 = n ? probe.taken[0] : null, out = [];
  const reports = Number(major) >= REPORTS_DROPPED_HANDLER;
  if (reports && n !== 1) out.push(`Chrome ${major} reports a dropped inline handler, and ${n} line(s) of the probe's arrived (want exactly 1)`);
  if (!reports && n !== 0) out.push(`Chrome ${major} reports no dropped inline handler, yet ${n} line(s) of the probe's arrived`);
  if (p0 && probe.kind !== 'sanitizer-parse') {
    let table = null; try { table = require('../src/app-csp.js').PARSE_SCRIPTS; } catch { }
    const script = (() => { try { return new URL(p0.source).pathname; } catch { return p0.source; } })();
    out.push(`the hub judged the probe's report the APP page's (kind ${probe.kind || 'none'}), not the sanitizer's parse — set by ${p0.source} at ${p0.line}:${p0.column}; ${table && table.includes(script) ? `${script} is in app-csp PARSE_SCRIPTS, so its parse site is not where the browser reported it` : `${script} is NOT in app-csp PARSE_SCRIPTS (${JSON.stringify(table)}): the CSP judge does not know this sanitizer`}`);
  }
  if (p0 && probe.noticed) out.push('the hub filed a For-you notice for it');
  const notices = (forYou || []).filter((x) => x && x.status !== 'done' && x.status !== 'dismissed');
  if (notices.length) out.push(`For you holds ${notices.length} page-security notice(s): ${notices.map((x) => `«${x.text}»`).join(' ')}`);
  if (count) {
    const d = (side) => (count.after?.[side]?.lines ?? NaN) - (count.before?.[side]?.lines ?? NaN);
    const want = reports ? 1 : 0;
    if (d('sanitizer') !== want || d('app') !== 0) out.push(`the count Diagnostics shows moved sanitizer +${d('sanitizer')} / app page +${d('app')} (want +${want} / +0)`);
  }
  return out.join('; ');
}
/** WHAT a report line names, in words (lane chrome-156-drift — the runner's line «script-src-attr inline, line 1 column
 *  101, source ""» named no element): the directive, the code's own SAMPLE (src/app-csp.js 'report-sample'; a suite's hub
 *  keeps it), where the code that set it ran — a line with no source is a script with no URL, the SUITE's own
 *  Runtime.evaluate — and, for an inline handler, the Chrome 156 rule that reports one when its attribute is SET. */
export function cspWhat(line) {
  let r; try { r = typeof line === 'string' ? JSON.parse(line) : line; } catch { return 'an unreadable line'; }
  if (!r || !r.directive) return 'an unreadable line';
  const at = `${r.line == null ? '?' : r.line}:${r.column == null ? '?' : r.column}`;
  const where = r.source ? `code in ${r.source} at ${at}` : `code with NO URL at ${at} — a script this SUITE evaluated over CDP (Runtime.evaluate), not the app's bundle`;
  const what = r.sample ? `«${r.sample}»` : (/^script-src/.test(r.directive) ? '(no sample — a hub outside this suite\'s file keeps none)' : `${r.blocked}`);
  if (r.kind === 'sanitizer-parse') return `${r.directive} ${r.blocked} — ${what}, set by ${where}, on ${r.document || 'the page'} · the SANITIZER's parse: DOMPurify's inert DOMParser document set this handler and dropped it, nothing ran (src/app-csp.js THE SANITIZER'S PARSE — counted apart, never a notice, not a gap in the policy)`;
  const attr = r.directive === 'script-src-attr' ? ' · an inline HANDLER: since Chrome 156 one is reported when its attribute is SET — in an inert document (createHTMLDocument / DOMParser / <template>) too — so a negative control built from markup belongs in a blank tab with no policy' : '';
  return `${r.directive} ${r.blocked} — ${what}, set by ${where}, on ${r.document || 'the page'}${attr}`;
}
/** A line the collector named the sanitizer's parse (src/app-csp.js KIND_SANITIZER) — printed at the end, never a failure:
 *  the policy is complete exactly when nothing ELSE was reported (lane chrome-156-followups). */
export const cspSanitizerLine = (l) => { try { return JSON.parse(l).kind === 'sanitizer-parse'; } catch { return false; } };
/** The report lines in these files: [{ file, lines }] (a file that is missing or empty is not listed). */
export function cspReportsIn(files) {
  const out = [];
  for (const f of files) { let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; } const lines = t.split('\n').filter(Boolean); if (lines.length) out.push({ file: f, lines }); }
  return out;
}
function cspReportsAtExit() {
  const files = [CSP_REPORTS_FILE];
  for (const r of ENDS) {
    files.push(path.join(r, 'data', 'csp-reports.jsonl'));
    try { for (const e of fs.readdirSync(r, { withFileTypes: true })) if (e.isDirectory()) files.push(path.join(r, e.name, 'data', 'csp-reports.jsonl')); } catch { }
  }
  const all = cspReportsIn(files);
  try { fs.rmSync(path.dirname(CSP_REPORTS_FILE), { recursive: true, force: true }); } catch { }
  const excused = all.flatMap((f) => f.lines.filter((l) => cspExcused(l)));
  if (excused.length) console.log(`\n  CSP: ${excused.length} report(s) excused by the ONE exception list (scripts/scratch.mjs CSP_EXCEPTIONS — ${[...new Set(excused.map((l) => cspExcused(l).suite))].join(', ')})`);
  const dropped = all.flatMap((f) => f.lines.filter((l) => !cspExcused(l) && cspSanitizerLine(l)));
  if (dropped.length) { console.log(`\n  CSP: ${dropped.length} line(s) of the sanitizer's parse — not a gap in the policy:`); for (const l of dropped.slice(0, 10)) console.log(`      ↳ ${cspWhat(l)}`); }
  const found = all.map((f) => ({ ...f, lines: f.lines.filter((l) => !cspExcused(l) && !cspSanitizerLine(l)) })).filter((f) => f.lines.length);
  if (!found.length) return;
  const n = found.reduce((a, f) => a + f.lines.length, 0);
  console.error(`\n  ✗ CSP: the app page reported ${n} thing(s) its content-security policy would block (src/app-csp.js — the policy must be complete before it is enforced):`);
  for (const f of found) { console.error(`    ${f.file}`); for (const l of f.lines.slice(0, 40)) console.error(`      ${l}\n        ↳ ${cspWhat(l)}`); if (f.lines.length > 40) console.error(`      … ${f.lines.length - 40} more`); }
  console.error('FAILED (CSP reports at the end of the suite)');
  process.exitCode = 1;
}
if (CSP_REPORTS_FILE) { process.env[CSP_REPORTS_ENV] = CSP_REPORTS_FILE; process.on('exit', cspReportsAtExit); }

/** WHAT THE GATE'S DIRECTORY SWEEP MAY JUDGE (B-60d2) — scripts/scratch-sweep.mjs reads these, never a hand list.
 *  `prefixes`: a unit is a directory `<under>/<prefix><name>` — what scratch() mints, and a verify workspace
 *  `/tmp/vs-work/<lane>` (lane-ops: verifiers work there; the workspace itself is never a unit). `production`: never a
 *  unit — the product's agent-browser socket dir (src/browser-profiles.js socketDirDecision: /tmp/vs-ab-<uid>, the shape
 *  scratch('ab') refuses), sock-path's tmp rung (src/sock-path.js: /tmp/vs-dev-<uid>) and the workspace. */
export const WORK_ROOT = path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}work`);
export const SCRATCH_SWEEP = Object.freeze({
  prefixes: Object.freeze([Object.freeze({ under: TMP_ROOTS[0], prefix: FIXTURE_CWD_PREFIX }), Object.freeze({ under: WORK_ROOT, prefix: '' })]),
  production: Object.freeze([/^\/tmp\/vs-ab-(?:\d+|u)$/, /^\/tmp\/vs-dev-(?:\d+|u)$/, new RegExp(`^${WORK_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)]),
});

/** `scratch(name)` CREATED and OWNED (B-1d08, 2026-09-29): the directory plus
 *  its run record `<dir>/.vs-run.json` naming this process (pid + starttime +
 *  boot). The gate's scratch-orphan reaper (scripts/ci.mjs) never touches a
 *  process that names a root whose owner is alive, and convicts the ones under
 *  a root whose owner is gone — so a suite that PLANTS a detached process (a
 *  stray it wants to observe) plants it under a root made here, or another
 *  run's sweep may read it as litter. Returns the path; the caller removes it. */
export function scratchDir(name) {
  const dir = scratch(name);
  fs.mkdirSync(dir, { recursive: true });
  stampScratchRun(dir);
  return dir;
}

/** An ISOLATED $HOME for a suite that boots a server and needs discovery
 *  (2026-09-09). The server can only discover transcripts under the home it
 *  runs with, so the fixture goes HERE and the developer's real ~/.claude is
 *  never touched. `dirs` are pre-created because a spawned CLI/server must not
 *  race the first mkdir. Returns the home path; the caller removes it in its
 *  exit AND signal handlers. Stamped with this process's run record (B-1d08):
 *  the server's detached device daemon lives under this HOME, and it is litter
 *  exactly when this suite is gone. */
export function scratchHome(name, fsArg, dirs = ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) {
  const home = scratch(name);
  for (const d of dirs) (fsArg || fs).mkdirSync(path.join(home, d), { recursive: true });
  (fsArg || fs).mkdirSync(home, { recursive: true });
  stampScratchRun(home);
  return home;
}

/** A suite's synthetic conversation id: `e2e00000-0000-4000-8000-<12 hex>`.
 *  Nothing else may mint one — the walk and discovery both refuse this family
 *  wherever it lands, which is the only guard that still works when the
 *  fixture carries no cwd at all (a hand-written `assistant` record has none). */
export function fixtureSid(suffix) {
  if (!/^[0-9a-f]{1,12}$/.test(suffix)) throw new Error(`fixtureSid(): bad suffix ${JSON.stringify(suffix)}`);
  return FIXTURE_SID_PREFIX + suffix.padStart(12, '0');
}

const listen0 = () => new Promise((res, rej) => {
  const s = net.createServer(); s.unref(); s.once('error', rej);
  s.listen(0, '127.0.0.1', () => res(s));
});

/** N distinct free loopback ports. Every listener is held open until ALL are
 *  chosen (closing each before the next listen(0) may hand the same port back). */
export async function freePorts(n) {
  const servers = [];
  for (let i = 0; i < n; i++) servers.push(await listen0());
  const ports = servers.map((s) => s.address().port);
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

export async function freePort() { return (await freePorts(1))[0]; }

/** A DEAD loopback port: bound on 127.0.0.1:0, read, closed — a port the kernel just released and nothing on this
 *  box holds, so a connect is refused. Dead for the NEXT SECONDS only: use it at once, never write it down. NEVER a
 *  fixed "nobody listens on 19888" literal (2026-10-06, mirror-green-220: test-browser-ephemeral's fake answered
 *  `get cdp-url` with ws://127.0.0.1:19888 — another project's workbench listened there on the dev box and answered
 *  404, the product read "answered", the local heavy stayed green while the runner was red). test-architecture §81
 *  is the census: no suite names a literal loopback endpoint. */
export async function deadPort() { return (await freePorts(1))[0]; }
/** N distinct dead ports (all held until every one is chosen — see freePorts). */
export async function deadPorts(n) { return freePorts(n); }
/** `${scheme}://127.0.0.1:<deadPort>${rest}` — a URL nothing answers. */
export async function deadUrl(scheme = 'http', rest = '') { return `${scheme}://127.0.0.1:${await deadPort()}${rest}`; }

/** THE SINGLETON DESKTOP'S NAMES, PER RUN (2026-09-25 — the heavy RED on
 *  69720f2b). src/vnc.js's singleton Desktop claims the MACHINE-GLOBAL X display
 *  `:7` and RFB port 5901 unless VIBESPACE_VNC_DISPLAY / VIBESPACE_VNC_PORT name
 *  others, and it ADOPTS whatever already listens on its port (by design —
 *  KasmVNC, an app-only restart). This box has Xtigervnc on PATH since
 *  2026-09-21, so every scratch server that opened the Desktop started — or
 *  adopted — ONE Xtigervnc shared by every run on the box and by the owner's
 *  production instance, and `:7` sits in the band `-displayfd` hands out
 *  lowest-first to every desktop-app keeper's Xvfb (measured: picks 6 9 11 …
 *  around a live :7), so a suite's Xvfb could hold the display the singleton
 *  needs. Every suite that spawns server.js spreads this into the server env
 *  (test-architecture §57 is the census). The port comes from freePort(); the
 *  display from `freeDisplay` seeded by that port. */
export async function vncEnv() {
  const port = await freePort();
  return { VIBESPACE_VNC_DISPLAY: `:${freeDisplay(port)}`, VIBESPACE_VNC_PORT: String(port) };
}
/** THE GTK ROW (B-4260, lane ci-aidev-desktop-batch): what THIS box's desktop stack draws the suites' GNOME Calculator
 *  as — measured at provision INSIDE a private xpra (scripts/ci-provision-aidev.sh, its gtk-row step) into
 *  scripts/fixtures/gtk-rows.json, keyed by the GTK 4 major.minor: `calcSize2x` (the window at GDK_SCALE=2), `calcMin2x`
 *  (its minimum once settled — 720×1232 on the hub's 4.22, 694×980 on AIDev's 4.14, which first announces 694×1004),
 *  `calcButtonBound` (the minimum ignores Xft.dpi — 50 does, 46 does not), `pushButtonRole` ("button" from at-spi2-core
 *  2.60, "push button" before). A GTK with no row THROWS, naming the measurement: a pixel leg on a box nobody measured
 *  would judge nothing — never a skip. `version` / `rows` are seams. */
export function gtkRow({ version, rows } = {}) {
  if (version === undefined) { try { version = require('node:child_process').execFileSync('dpkg-query', ['-W', '-f=${Version}', 'libgtk-4-1'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/[+~].*$/, '').trim(); } catch { version = ''; } }
  if (rows === undefined) { try { rows = JSON.parse(fs.readFileSync(new URL('./fixtures/gtk-rows.json', import.meta.url), 'utf-8')).rows; } catch { rows = {}; } }
  const key = String(version || '').split('.').slice(0, 2).join('.');
  const row = rows && key && rows[key];
  if (!row) throw new Error(`no measured GTK row for GTK ${version || '(libgtk-4-1 not installed)'} on this box — run scripts/ci-provision-aidev.sh's gtk-row step here and add its row to scripts/fixtures/gtk-rows.json under "${key || '?'}"`);
  return { key, ...row };
}

/** Far above the lowest-first `-displayfd` band the keepers draw from, below
 *  the X TCP ceiling (6000 + n). */
export const VNC_DISPLAY_RANGE = Object.freeze({ lo: 1000, span: 20000 });
/** The first X display number at or after a seed-derived start whose lock file
 *  AND socket are both absent (a lock alone is left behind by a SIGKILLed
 *  server; a socket alone by a crashed one — either may still be claimed).
 *  `exists` is a parameter so the rule is testable without an X server. */
export function freeDisplay(seed, { exists = (p) => fs.existsSync(p) } = {}) {
  const { lo, span } = VNC_DISPLAY_RANGE;
  const s = Math.abs(Math.trunc(Number(seed) || 0));
  for (let i = 0; i < span; i++) {
    const n = lo + ((s + i) % span);
    if (!exists(`/tmp/.X${n}-lock`) && !exists(`/tmp/.X11-unix/X${n}`)) return n;
  }
  throw new Error(`freeDisplay(): no free X display in :${lo}..:${lo + span - 1}`);
}

/** EVERY PROCESS ROOTED IN A SCRATCH DIR — the teardown of a suite whose worktree
 *  server spawned sessions (2026-09-25, test-browser-resources: 140 live leftovers
 *  from 20 runs). A server's terminal/chat sessions run under dtach — DETACHED by
 *  design (production's must outlive a restart; systemd's KillMode=process is the
 *  same rule) — so killing the server ends none of them, and they run with the
 *  REAL HOME and cwd `/tmp`: the scratch root is only in their arguments
 *  (`dtach -c <root>/…/data/sockets/cw-…`, `node <root>/…/data/bin/pty-wrapper.js`).
 *  A suite that boots a server owns what that server started: this lists every
 *  process whose cwd, HOME, daemon root (DAEMON_ROOT_ENV — B-442c: the server's
 *  device daemon is title-rewritten, so neither its argv nor `pkill -f <root>` names
 *  the root) or any argv token (its start, or after `=`) lies in `root` — never
 *  this process or its ancestors — and signals each (SIGKILL by default;
 *  synchronous, so it runs inside an 'exit' handler). Returns the pids. The gate's
 *  reaper (scripts/ci.mjs argvScratchRoots) is the net for a suite that never got
 *  here; test-architecture §57b names a server-booting suite that never calls this. */
export function endRootedProcesses(root, { signal = 'SIGKILL', procRoot = '/proc', self = process.pid } = {}) {
  const r = path.resolve(String(root || ''));
  if (!r || r === '/' || !r.startsWith('/tmp/')) throw new Error(`endRootedProcesses(): refusing root ${JSON.stringify(root)} (a /tmp scratch dir only)`);
  const under = (x) => { const v = String(x || ''); return v === r || v.startsWith(r + '/'); };
  const skip = new Set();
  for (let q = self; q > 1 && !skip.has(q);) {
    skip.add(q);
    try { const st = fs.readFileSync(`${procRoot}/${q}/stat`, 'latin1'); q = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); } catch { break; }
  }
  const hit = [];
  let pids = []; try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch { return hit; }
  for (const pid of pids) {
    if (skip.has(pid)) continue;
    let rooted = false;
    try { rooted = under(fs.readlinkSync(`${procRoot}/${pid}/cwd`)); } catch { }
    if (!rooted) try { rooted = fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8').split(/[\0\s]+/).some((t) => under(t) || t.split('=').slice(1).some((v) => under(v))); } catch { }
    if (!rooted) try { const env = fs.readFileSync(`${procRoot}/${pid}/environ`, 'utf8').split('\0'); rooted = ['HOME', ...DAEMON_ROOT_ENV].some((k) => under((env.find((kv) => kv.startsWith(k + '=')) || '').slice(k.length + 1))); } catch { }
    if (!rooted) continue;
    try { process.kill(pid, signal); hit.push(pid); } catch { }
  }
  return hit;
}

/** The env names a vibespace-device daemon takes its root from (src/agentd/agentd.js ROOT: VIBESPACE_DEVICE_ROOT, else
 *  VIBESPACE_AGENTD_ROOT, else ~/.vibespace/agentd under HOME) — both kept by agent-env.js daemonEnv across a re-exec. */
export const DAEMON_ROOT_ENV = Object.freeze(['VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT']);
const DAEMON_ARGV = /(?:^|\/)(?:vibespace-)?agentd\.js$/;
/** B-442c (2026-10-02, the 16:23 OOM): END THE DAEMON(S) OF ONE DAEMON ROOT, MID-RUN — and nothing else its server started
 *  (a suite restarting its server over a fresh daemon keeps its dtach sessions). A daemon = a process whose
 *  VIBESPACE_DEVICE_ROOT / VIBESPACE_AGENTD_ROOT lies in `root` AND that is one (comm `vibespace-devic…`, or an argv
 *  naming an agentd bundle: a re-exec child before it renames itself), plus the pid `<root>/state/agentd.pid` names.
 *  The pid file ALONE is what test-restore-liveness trusted: a self-upgrade spawns the NEW daemon before it writes
 *  its pid, so a kill in that window ended the old pid, the suite then deleted the root, and the orphan — its
 *  bundle gone — grew to 45.7 GB. Two passes, `settleMs` apart: a re-exec forked between the scan and the kill is
 *  caught by the second. Synchronous (an 'exit' handler may call it); returns the pids signalled. */
export function endDaemonsOf(root, { signal = 'SIGKILL', procRoot = '/proc', passes = 2, settleMs = 150 } = {}) {
  const r = path.resolve(String(root || ''));
  if (!r || r === '/' || !r.startsWith('/tmp/')) throw new Error(`endDaemonsOf(): refusing root ${JSON.stringify(root)} (a /tmp scratch dir only)`);
  const under = (x) => { const v = String(x || ''); return v === r || v.startsWith(r + '/'); };
  const hit = new Set();
  const end = (pid) => { if (pid > 0 && pid !== process.pid && !hit.has(pid)) try { process.kill(pid, signal); hit.add(pid); } catch { } };
  try { end(Number(fs.readFileSync(path.join(r, 'state', 'agentd.pid'), 'utf8').trim())); } catch { }
  for (let k = 0; k < passes; k++) {
    if (k) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, settleMs);
    let pids = []; try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch { return [...hit]; }
    for (const pid of pids) {
      let env; try { env = fs.readFileSync(`${procRoot}/${pid}/environ`, 'utf8').split('\0'); } catch { continue; }
      if (!DAEMON_ROOT_ENV.some((n) => under((env.find((kv) => kv.startsWith(n + '=')) || '').slice(n.length + 1)))) continue;
      let comm = '', argv = []; try { comm = fs.readFileSync(`${procRoot}/${pid}/comm`, 'utf8').trim(); } catch { }
      try { argv = fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8').split('\0'); } catch { }
      if (comm.startsWith('vibespace-devic') || argv.some((a) => DAEMON_ARGV.test(a))) end(pid);
    }
  }
  return [...hit];
}

/** mirror-green-217 (the 2.369.217 Actions red, ENOTEMPTY rmdir of agentd/state): END a daemon root's daemon(s) AND WAIT
 *  until each is gone — only then may the caller delete the root. The daemon's SIGTERM handler appends "SIGTERM — exiting"
 *  to <root>/state/agentd.log, so an rmSync racing that exit re-creates the file between rimraf's unlink and its rmdir.
 *  Gone = no /proc entry, or a zombie (state Z: every fd closed — a daemon this process spawned stays one while this
 *  synchronous wait holds the loop that would reap it). Bounded: SIGKILL at `timeoutMs`, then the same wait. Synchronous
 *  (an 'exit' handler may call it); returns { pids, gone, killed }. */
export function endDaemonsAndWait(root, { signal = 'SIGTERM', timeoutMs = 5000, pollMs = 10, procRoot = '/proc' } = {}) {
  const goneOne = (pid) => { try { return fs.readFileSync(`${procRoot}/${pid}/stat`, 'utf8').replace(/^.*\) /s, '')[0] === 'Z'; } catch { return true; } };
  const waitGone = (pids) => {
    const until = Date.now() + timeoutMs;
    while (!pids.every(goneOne) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs);
    return pids.every(goneOne);
  };
  const pids = endDaemonsOf(root, { signal, procRoot });
  let killed = false;
  if (!waitGone(pids)) { killed = true; for (const pid of pids) try { process.kill(pid, 'SIGKILL'); } catch { } }
  return { pids, gone: waitGone(pids), killed };
}

/** The ambient vendor credentials a REAL agent CLI would bill against instead
 *  of the login the leg means to use (B-5f0b, the 2.369.69 lesson): a fake
 *  CODEX_HOME / HOME removes the LOGIN, never an env key — a leaked
 *  OPENAI_API_KEY / CODEX_API_KEY lets a real `codex app-server`'s own idle
 *  drain run a billed turn, and ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
 *  outrank the oat/subscription a claude leg seeds. */
export const VENDOR_KEY_ENV = Object.freeze(['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']);

/** A copy of `env` without VENDOR_KEY_ENV — every spawn of a REAL claude /
 *  codex / opencode in a suite goes through this (test-architecture §50). */
export function withoutVendorKeys(env = process.env) {
  const out = { ...env };
  for (const k of VENDOR_KEY_ENV) delete out[k];
  return out;
}

/** STOP A WRAPPER, THEN REMOVE ITS SCRATCH DIR — in that order (2.369.172 r1,
 *  the Actions mirror's red on test-codex-p2-client: `ENOTEMPTY: directory not
 *  empty, rmdir /tmp/vs-cxfork-…`). Since 2.369.172 every wrapper answers
 *  SIGTERM/SIGHUP/SIGINT with a synchronous record — the meta first, then the
 *  buffer, then a log line (`appendFileSync` CREATES chat-wrapper.log /
 *  codex-chat-wrapper.log when it is absent) — so a suite that kills the wrapper
 *  and calls `rmSync(dir)` in the same tick races that append: on the 2-vCPU
 *  runner the log file landed between rmSync's listing and its rmdir. Four fast
 *  suites had exactly that shape (no exit wait at all); this is the ONE idiom.
 *  Waits for the child's exit (SIGKILL after `graceMs`), then removes the dir
 *  with retries. Safe on a child that already exited. */
export async function stopWrapper(child, { dir = null, graceMs = 3000 } = {}) {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    try { child.kill('SIGTERM'); } catch { }
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, graceMs);
    await exited;
    clearTimeout(t);
  }
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
}

/** THE HOSTED RUNNER'S FACE (ci358-reds — the 2.369.358 mirror red on test-chat-scroll and test-artifacts-handover-ui, both
 *  green here; desktop-small's .358 hotfix measured the same): the Actions runner's sans-serif is DejaVu Sans, this box's is
 *  not, and a layout a face can tip (a paragraph's wrap, a chip's width) went red there only. A chrome suite whose legs
 *  measure such a layout runs as FONT LEGS: `dejavu` — its Chrome under a scratch fontconfig naming only the dirs the runner
 *  has (DejaVu, Liberation, Noto CJK, the colour emoji face; the system conf.d still applies) — then `box`, the box's own
 *  face, never run where that IS DejaVu Sans (the runner). `--font dejavu|box` runs one leg; without it the suite runs each
 *  leg as a child (runFontLegs) and fails if one does. A box without the DejaVu dir runs `box` alone and says so. */
export const RUNNER_FONT_DIRS = Object.freeze(['/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/truetype/liberation', '/usr/share/fonts/opentype/noto']);
const EMOJI_FACE = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'; // linked alone: its dir also holds Noto Sans, which would be the sans-serif
/** The face this box's fontconfig answers for sans-serif ('' when fc-match is missing). */
export function boxSans() { try { return execFileSync('fc-match', ['-f', '%{family}', 'sans-serif'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { return ''; } }
/** The legs this box runs: ['dejavu', 'box'] | ['dejavu'] (the box IS DejaVu) | ['box'] (no DejaVu dir). */
export function fontLegs() {
  if (!fs.existsSync(path.join(RUNNER_FONT_DIRS[0], 'DejaVuSans.ttf'))) return ['box'];
  return /^DejaVu Sans(,|$)/.test(boxSans()) ? ['dejavu'] : ['dejavu', 'box'];
}
/** The `dejavu` leg's Chrome env: { FONTCONFIG_FILE } of a fontconfig written under `dir` (the suite removes `dir`). */
export function runnerFontEnv(dir) {
  const emoji = path.join(dir, 'emoji');
  fs.mkdirSync(emoji, { recursive: true });
  if (fs.existsSync(EMOJI_FACE)) { try { fs.symlinkSync(EMOJI_FACE, path.join(emoji, path.basename(EMOJI_FACE))); } catch { } }
  const file = path.join(dir, 'fonts.conf');
  fs.writeFileSync(file, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${[...RUNNER_FONT_DIRS, emoji].map((d) => `  <dir>${d}</dir>\n`).join('')}  <cachedir>${path.join(dir, 'cache')}</cachedir>\n  <include ignore_missing="yes">/etc/fonts/conf.d</include>\n</fontconfig>\n`);
  return { FONTCONFIG_FILE: file };
}
/** Run `script` once per font leg (`--font <leg>` appended), output inherited; the exit code is the first failing leg's. */
export function runFontLegs(script, argv = process.argv.slice(2)) {
  let code = 0;
  for (const leg of fontLegs()) {
    console.log(`── font leg ${leg}${leg === 'dejavu' ? " (the hosted runner's sans-serif, a scratch fontconfig)" : ` (this box's own: ${boxSans() || '?'})`} ──`);
    const r = spawnSync(process.execPath, [script, ...argv, '--font', leg], { stdio: 'inherit', env: process.env });
    if (r.status !== 0 && !code) code = r.status || 1;
  }
  return code;
}
/** The face Chrome drew `selector`'s text in (CSS.getPlatformFontsForNode — the most glyphs), or null; `cdp(method, params)`.
 *  The LAST match first: an element content-visibility skips has drawn nothing (an empty font list). */
export async function drawnFace(cdp, selector) {
  try {
    await cdp('DOM.enable'); await cdp('CSS.enable');
    const { root } = await cdp('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    for (const nodeId of [...(nodeIds || [])].reverse().slice(0, 20)) {
      const { fonts } = await cdp('CSS.getPlatformFontsForNode', { nodeId });
      const top = [...(fonts || [])].sort((a, b) => b.glyphCount - a.glyphCount)[0];
      if (top?.familyName) return top.familyName;
    }
    return null;
  } catch { return null; }
}
