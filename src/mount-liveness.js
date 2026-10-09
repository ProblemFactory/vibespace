// src/mount-liveness.js — THE verdict table of the mount health sweep (lane mount-liveness, 2026-10-09; the owner's
// OneDrive was torn down 37× in 7 days because ONE `ls` of its root took over 6 s while its daemon waited on Microsoft).
// PURE: imports nothing. src/mounts.js `_healthSweep` only GATHERS witnesses (children with timeouts, /proc reads) and
// applies the verdict this file returns — there is no second decision site. Two questions, never one:
//   LIVENESS  — does the mount's own process answer?  `attr` = `ls -d <mp>`, a root GETATTR rclone serves from its VFS
//               root node without a backend call (measured, rclone 1.69.3 over a SIGSTOPped webdav backend: 3–4 ms while
//               `ls` hung; the daemon SIGSTOPped ⇒ hung). Only its silence is the deadlock signature.
//   READINESS — does the storage answer?  `list` = `ls <mp>` (a cold listing is a backend round trip by construction),
//               `backend` = a fresh-process `rclone lsf` run only when the listing hung.
// Verdicts: alive · slow (listing over listMs, the process answers — NEVER a teardown) · wedged (the listing hung
// wedgedStrikes sweeps in a row while the backend answered each time) · unreachable (listing + backend both silent —
// kept mounted, blocked, said; torn down only at unreachableCeilingMs) · dead (attr hung `strikes` sweeps in a row, no
// CPU progress) · died (the daemon is gone). A teardown always names its cause (`reason`) — no silent teardown.
'use strict';

/** The table's defaults for a row that declares no `probe` cell (every cloud row). */
const DEFAULTS = Object.freeze({
  attrMs: 6000,                     // the liveness probe's patience (a GETATTR answers in ms)
  listMs: 20000,                    // a listing slower than this is `slow` (Graph root listings measured 1.4–2.1 s cold)
  strikes: 2,                       // consecutive silent liveness probes before `dead` tears down (≥ 2: one blip never does)
  wedgedStrikes: 2,                 // consecutive hung listings WITH the backend answering before `wedged` tears down
  slowBlockMs: 65000,               // the path stays blocked (fail fast) until the next sweep re-checks
  unreachableCeilingMs: 30 * 60e3,  // the dead-host defense: unreachable this long ⇒ teardown
  progressTicks: 30,                // CPU ticks between two reads that prove a busy daemon is working (the 10-04 guard)
});
const FLOORS = Object.freeze({ strikes: 2, wedgedStrikes: 2 });

/** A row's effective probe cell: the row's `probe` over the table's defaults; strikes never below 2. */
function probeCell(row) {
  const own = (row && row.probe) || {};
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (Number.isFinite(own[k]) && own[k] > 0) out[k] = own[k];
  for (const [k, min] of Object.entries(FLOORS)) out[k] = Math.max(min, Math.floor(out[k]));
  return Object.freeze(out);
}

/** A cell's problems (the row census in test-mount-providers): [] when valid. */
function cellProblems(cell) {
  const bad = [];
  if (!cell || typeof cell !== 'object') return ['not an object'];
  for (const k of Object.keys(cell)) if (!(k in DEFAULTS)) bad.push(`unknown key ${k}`);
  for (const k of Object.keys(DEFAULTS)) if (k in cell && !(Number.isFinite(cell[k]) && cell[k] > 0)) bad.push(`${k} not a positive number`);
  for (const [k, min] of Object.entries(FLOORS)) if (k in cell && cell[k] < min) bad.push(`${k} < ${min}`);
  return bad;
}

const secs = (ms) => Math.round(ms / 1000);
const mins = (ms) => Math.round(ms / 60000);
/** One sentence per verdict, en / zh / ja ({s} {n} {N} {min} filled by wordsFor). */
const WORDS = Object.freeze({
  slow: {
    en: 'storage slow — its listing took over {s} s; kept connected, re-checked every minute',
    zh: '存储响应慢 — 列目录超过 {s} 秒；保持连接，每分钟复查',
    ja: 'ストレージの応答が遅い — 一覧に {s} 秒以上かかりました。接続を維持し、毎分再確認します',
  },
  busy: {
    en: 'storage busy — its process is working and the listing took over {s} s; kept connected, re-checked every minute',
    zh: '存储忙 — 其进程正在工作，列目录超过 {s} 秒；保持连接，每分钟复查',
    ja: 'ストレージが処理中 — プロセスは動作中で、一覧に {s} 秒以上かかりました。接続を維持し、毎分再確認します',
  },
  unreachable: {
    en: 'storage unreachable — its listing and a fresh check both got no answer; kept connected, re-checked every minute (disconnected after {min} min)',
    zh: '存储无法访问 — 列目录和一次全新检查都没有回应；保持连接，每分钟复查（{min} 分钟后断开）',
    ja: 'ストレージに到達できません — 一覧も新しい確認も応答がありません。接続を維持し、毎分再確認します（{min} 分後に切断）',
  },
  silent: {
    en: 'storage not answering — its process did not answer a basic check ({n} of {N}); kept connected, re-checked every minute',
    zh: '存储无响应 — 其进程未回应基本检查（第 {n}/{N} 次）；保持连接，每分钟复查',
    ja: 'ストレージが応答しません — プロセスが基本確認に応答しません（{n}/{N} 回目）。接続を維持し、毎分再確認します',
  },
  dead: {
    en: 'storage stopped answering — its process did not answer {N} checks in a row; disconnected to protect the server; will retry',
    zh: '存储停止响应 — 其进程连续 {N} 次未回应检查；为保护服务器已断开，将自动重试',
    ja: 'ストレージが応答を停止 — プロセスが {N} 回続けて確認に応答しません。サーバー保護のため切断しました。再試行します',
  },
  wedged: {
    en: 'storage stuck — its listing hung {N} times in a row while the provider answered; disconnected to protect the server; will retry',
    zh: '存储卡住 — 服务商有回应，但列目录连续 {N} 次挂起；为保护服务器已断开，将自动重试',
    ja: 'ストレージが停止状態 — プロバイダーは応答するのに一覧が {N} 回続けて止まりました。サーバー保護のため切断しました。再試行します',
  },
  gone: {
    en: 'storage unreachable for {min} min — disconnected to protect the server; will retry',
    zh: '存储已 {min} 分钟无法访问 — 为保护服务器已断开，将自动重试',
    ja: 'ストレージに {min} 分間到達できません — サーバー保護のため切断しました。再試行します',
  },
  died: {
    en: 'mount daemon died — reconnecting…',
    zh: '挂载进程已退出 — 正在重新连接…',
    ja: 'マウントプロセスが終了しました — 再接続しています…',
  },
});
function wordsFor(key, lang, vars) {
  const w = WORDS[key];
  if (!w) return '';
  const s = w[lang] || w.en;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
}

const STATES = Object.freeze(['ok', 'error', 'hung', 'skipped']);
const answered = (b) => b === 'ok' || b === 'error';   // an auth error is an ANSWER: the vendor is reachable
const EMPTY = Object.freeze({ silent: 0, wedged: 0, slow: 0, unreachableSince: 0 });

/**
 * One sweep's verdict for one mount.
 *   state     — the previous step's `state` (or undefined): { silent, wedged, slow, unreachableSince }
 *   w         — witnesses: { daemonAlive, attr: {state, ms}, list: {state, ms}, backend: {state, ms}, cpuTicks (Δ|null), now }
 *   row       — the record's EFFECTIVE provider row (its `probe` cell; a child reads its parent's row)
 * → { verdict, reason, teardown, blockMs, unblock, words: {key, vars}, strikes: {n, N}, state }
 */
function livenessStep(state, w, row) {
  const P = probeCell(row);
  const s = { ...EMPTY, ...(state || {}) };
  const now = Number.isFinite(w && w.now) ? w.now : 0;
  const attr = (w && w.attr && w.attr.state) || 'skipped';
  const list = (w && w.list && w.list.state) || 'skipped';
  const backend = (w && w.backend && w.backend.state) || 'skipped';
  const progress = w && w.cpuTicks != null && w.cpuTicks >= (Number.isFinite(w.progressTicks) ? w.progressTicks : P.progressTicks);
  const out = (verdict, reason, o) => ({ verdict, reason, teardown: false, blockMs: 0, unblock: false, strikes: { n: 0, N: 0 }, ...o });

  if (w && w.daemonAlive === false) {
    return out('died', 'the mount daemon is gone', { teardown: true, words: { key: 'died', vars: {} }, state: { ...EMPTY } });
  }
  if (attr === 'hung') {
    if (progress) {   // the 10-04 guard as a witness: a process burning CPU is working, never dead
      return out('slow', `the root check hung but the daemon made +${w.cpuTicks} CPU ticks`, {
        blockMs: P.slowBlockMs, words: { key: 'busy', vars: { s: secs(P.attrMs) } }, strikes: { n: 0, N: P.strikes },
        state: { ...s, silent: 0, slow: s.slow + 1 } });
    }
    const n = s.silent + 1;
    if (n >= P.strikes) {
      return out('dead', `the mount's own process did not answer a root check ${n} sweeps in a row (no CPU progress)`, {
        teardown: true, blockMs: 90000, words: { key: 'dead', vars: { N: n } }, strikes: { n, N: P.strikes }, state: { ...EMPTY } });
    }
    return out('dead', `the mount's own process did not answer a root check (strike ${n} of ${P.strikes})`, {
      blockMs: P.slowBlockMs, words: { key: 'silent', vars: { n, N: P.strikes } }, strikes: { n, N: P.strikes },
      state: { ...s, silent: n, wedged: 0 } });
  }
  // the process answers its root check (ok, or an error the kernel returned — responsive either way)
  if (list !== 'hung') {
    return out('alive', 'the root check and the listing answered', { unblock: s.silent + s.wedged + s.slow > 0 || s.unreachableSince > 0, state: { ...EMPTY } });
  }
  if (backend === 'hung') {   // the listing AND a fresh process both got no answer: the storage is unreachable
    const since = s.unreachableSince || now;
    if (now - since >= P.unreachableCeilingMs) {
      return out('unreachable', `the storage gave no answer for ${mins(now - since)} min (listing and a fresh check both silent)`, {
        teardown: true, blockMs: 90000, words: { key: 'gone', vars: { min: mins(now - since) } }, state: { ...EMPTY } });
    }
    return out('unreachable', 'the listing and a fresh check both got no answer; the mount\'s own process answers', {
      blockMs: P.slowBlockMs, words: { key: 'unreachable', vars: { min: mins(P.unreachableCeilingMs) } },
      state: { ...s, silent: 0, wedged: 0, slow: s.slow + 1, unreachableSince: since } });
  }
  if (answered(backend)) {   // the vendor answers a fresh process but the daemon's listing hangs
    const n = s.wedged + 1;
    if (n >= P.wedgedStrikes) {
      return out('wedged', `the listing hung ${n} sweeps in a row while the backend answered each time — the daemon is not serving what the vendor serves`, {
        teardown: true, blockMs: 90000, words: { key: 'wedged', vars: { N: n } }, strikes: { n, N: P.wedgedStrikes }, state: { ...EMPTY } });
    }
    return out('slow', `the listing took over ${secs(P.listMs)} s; the backend answered (strike ${n} of ${P.wedgedStrikes})`, {
      blockMs: P.slowBlockMs, words: { key: 'slow', vars: { s: secs(P.listMs) } }, strikes: { n, N: P.wedgedStrikes },
      state: { ...s, silent: 0, wedged: n, slow: s.slow + 1, unreachableSince: 0 } });
  }
  // backend unknown (no fresh-process probe for this row): slow, and the wedged chain breaks
  return out('slow', `the listing took over ${secs(P.listMs)} s; no backend answer to compare`, {
    blockMs: P.slowBlockMs, words: { key: 'slow', vars: { s: secs(P.listMs) } },
    state: { ...s, silent: 0, wedged: 0, slow: s.slow + 1, unreachableSince: 0 } });
}

const fmt = (x) => (!x || x.state === 'skipped') ? 'skipped' : x.state === 'hung' ? (x.held ? 'hung (still)' : 'hung') : `${Math.round(x.ms || 0)}ms${x.state === 'error' ? ' error' : ''}`;
/** THE journal line of a strike / teardown: `[mounts] <name> <verdict>: attr … · list … · backend … · cpu +… · strike n/N`. */
function verdictLine(name, v, w) {
  const b = !w.backend || w.backend.state === 'skipped' ? 'skipped' : w.backend.state === 'hung' ? 'silent' : fmt(w.backend);
  const cpu = w.cpuTicks == null ? '?' : `+${w.cpuTicks}`;
  const tail = v.teardown ? ` — TEARDOWN: ${v.reason}` : '';
  return `[mounts] ${name} ${v.verdict}: attr ${fmt(w.attr)} · list ${fmt(w.list)} · backend ${b} · cpu ${cpu} · strike ${v.strikes.n}/${v.strikes.N}${tail}`;
}

module.exports = { DEFAULTS, probeCell, cellProblems, WORDS, wordsFor, livenessStep, verdictLine, STATES };
