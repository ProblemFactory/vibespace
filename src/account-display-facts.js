'use strict';
/**
 * THE ACCOUNTS LIST READS NO FILE ON THE LOOP (row B-360d, lane chrome-157; 主开发 r1201, 2026-11-21). On the owner's hub the
 * account folders live on a network share: the list's rows opened their sign-in files on the main thread, two round trips an
 * account at EVERY store change (the broadcast builds the whole list) — holds of 1.3–1.6 s a person feels when the accounts
 * dialog opens. This keeper holds, per account FOLDER, the DISPLAY FACTS of its sign-in files, read OFF the loop through the
 * tree's file door (SafeFs: a worker thread, a deadline a call — a dead share ends by name, it never hangs a thread for good),
 * and the list answers from what is kept.
 *
 *   refresh(folder, files, parse) — stats each named file through SafeFs, one read a folder in flight: the same stamps
 *                            (size, time) as kept CONFIRM the kept facts (no text read); a changed one reads every text, and
 *                            `parse(rd)` — the harness's OWN parseAuth over the raw snapshot — runs once, its answer kept
 *                            without a token field
 *   get(folder)            — { state: 'read', at, from, auth, target, rd }   (target: a pool folder's link, its member's folder name) | { state: 'unread' } | { state: 'unreadable', at, from, reason }
 *                            `from` = when the snapshot that read or CONFIRMED them started: a DECIDER counts the facts only
 *                            when that is inside its own short bound (主开发 r1221: the sign-in files' stamp confirmed lately)
 *                            `rd` answers the harness's OWN readers (facts / readText / stat, run-reads' shape) from the kept,
 *                            SCRUBBED snapshot — the login state's reader runs over it at each list (its clock is the list's)
 *   drop(folder)           — forgets (a switch, a removal, a sign-in the hub wrote: the writer drops in the same step)
 *   stale(folder, maxAgeMs)— a kept read older than the stated age (the list then asks a bounded re-read; it never waits)
 *
 * NO SECRET IS KEPT: the parse's answer is kept without its token fields, and a file's text is kept SCRUBBED — every non-empty
 * string under a key that names a token, a secret or a key is replaced by a marker (an EMPTY one stays empty: the «wiped» shape
 * stays wiped), so a reader that asks «is there an access token» still sees one, and none of it stays in memory. A file over
 * maxSize is kept as too large (E2BIG): its reader answers as for a file it cannot use, the folder stays readable.
 * A file that does not exist is a FACT (the readers answer «no credentials»); a read the share did not answer, or answered with
 * another error, makes the folder `unreadable` with its reason — never a blank that looks like «signed out».
 * `onLanded(folder)` runs when a read lands with facts that differ from the ones kept (the store's broadcast).
 */

const KEPT = '[kept]';
const SECRET_KEY = /(token|secret|password|passwd|apikey|api_key|private|key)$/i;
/** a JSON text with every secret-named string value replaced by the marker (a non-JSON text keeps nothing but its length) */
function scrub(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { text: null, length: String(text || '').length, json: false }; }
  const walk = (v, k) => {
    if (typeof v === 'string') return k && SECRET_KEY.test(k) && v !== '' ? KEPT : v;
    if (Array.isArray(v)) return v.map((x) => walk(x, k));
    if (v && typeof v === 'object') { const out = {}; for (const [kk, vv] of Object.entries(v)) out[kk] = walk(vv, kk); return out; }
    return v;
  };
  return { text: JSON.stringify(walk(o, null)), length: text.length, json: true };
}
const errOf = (code, message) => Object.assign(new Error(message || code), { code });

function create({ safeFs = () => null, timeoutMs = 5000, maxSize = 16 << 20, onLanded = () => {}, now = () => Date.now() } = {}) {
  // folder → { state, at, from, files: Map(path → {ok, text, mtimeMs, size, isFile, code}), reason, inflight, startedAt, sig }
  //   at   — when the kept facts were last read or confirmed (the shown age)
  //   from — when the snapshot that read or confirmed them STARTED (a decider's «confirmed since»: the stamp seen at or after it)
  const kept = new Map();
  // THE ORDER OF READS (a person's act must see a read that started AFTER it — create, a write and the ask can share one
  // millisecond): a STRICTLY increasing stamp (ms, a fraction added on a tie) for `from` / `startedAt` and an ask's own `after`
  let lastTick = 0;
  const clock = () => { const t = now(); lastTick = t > lastTick ? t : lastTick + 0.001; return lastTick; };
  const door = () => { let sf = null; try { sf = safeFs(); } catch { } return sf && typeof sf.call === 'function' ? sf : null; };
  async function statOne(sf, p) {
    let st;
    try { st = await sf.call('stat', { path: p }, { timeoutMs }); }
    catch (e) { if (e && e.code === 'ENOENT') return { ok: false, code: 'ENOENT' }; throw e; }
    if (!st || !st.isFile) return { ok: true, isFile: false, mtimeMs: st && st.mtimeMs, size: st && st.size };
    if (maxSize && st.size > maxSize) return { ok: false, code: 'E2BIG', mtimeMs: st.mtimeMs, size: st.size };
    return { ok: true, isFile: true, mtimeMs: st.mtimeMs, size: st.size };
  }
  async function textOne(sf, p, x) {
    if (!x.ok || !x.isFile) return x;
    let text;
    try { text = await sf.call('readText', { path: p, maxSize }, { timeoutMs }); }
    catch (e) { if (e && e.code === 'ENOENT') return { ok: false, code: 'ENOENT' }; if (e && Number.isFinite(e.size)) return { ok: false, code: 'E2BIG', size: e.size }; throw e; }
    const raw = typeof text === 'string' ? text : (text && text.content) || '';
    return { ...x, raw };
  }
  /** a file's STAMP (its kind, size and time, or its error code) — the same stamp ⇒ the kept facts still hold */
  const stampOf = (x) => (x ? (x.ok ? `${x.isFile ? 'f' : 'd'}:${x.size}:${x.mtimeMs}` : `!${x.code}`) : null);
  const NO_TOKEN = (o) => { if (!o || typeof o !== 'object') return o; const out = {}; for (const [k, v] of Object.entries(o)) if (!/token$/i.test(k)) out[k] = v; return out; };
  const slot = (folder) => { let f = kept.get(folder); if (!f) { f = { state: 'unread', at: 0, from: 0, files: null, auth: null, target: null, reason: null, inflight: null, startedAt: 0, sig: null }; kept.set(folder, f); } return f; };
  /** a snapshot lands: the harness's own parse over the RAW texts, once — then only the scrubbed texts and the token-free answer
   *  stay. → whether the kept facts changed */
  function land(f, out, parse, target, from) {
    let auth = null;
    if (typeof parse === 'function') { try { auth = NO_TOKEN(parse(readerOf(out, 'raw'))); } catch { auth = { loggedIn: false }; } }
    for (const x of out.values()) if (x.ok && x.isFile && x.raw != null) { const s = scrub(x.raw); x.text = s.text; x.json = s.json; delete x.raw; }
    const sig = JSON.stringify([[...out], auth, target]);
    const changed = f.state !== 'read' || sig !== f.sig;
    f.files = out; f.auth = auth; f.target = target; f.state = 'read'; f.reason = null; f.at = now(); f.from = from; f.sig = sig;
    return changed;
  }
  /** A WRITER THAT KNOWS THE FACTS SETS THEM IN ITS OWN STEP (主开发 r1217): a person's own sign-in, re-authorisation or switch
   *  has just read or written what the keeper would read — through `rd` (run-reads: this synchronous run's answers, the files
   *  its own act already asked) it sets them now, so the next list shows them at once; an off-loop read then only confirms. */
  function seed(folder, files, parse, rd, { target = null } = {}) {
    const out = new Map(), from = clock();
    for (const p of files || []) {
      try { const x = rd.facts(p); out.set(p, { ok: true, isFile: true, mtimeMs: x.mtimeMs, size: x.size, raw: x.text }); }
      catch (e) { out.set(p, { ok: false, code: (e && e.code) || 'ENOENT' }); }
    }
    return land(slot(folder), out, parse, target, from);
  }
  /** Read the folder's files OFF the loop: each file's stamp first; when every stamp (and a pool's link) is the one kept, the
   *  kept facts are CONFIRMED (no text read, no parse); else every file's text is read and parsed. One read a folder in flight;
   *  `after` = a read that started before it does not count (the caller's act came later: one more read is chained). */
  function refresh(folder, files, parse = null, { link = false, after = 0 } = {}) {
    const f = slot(folder);
    if (f.inflight) return f.startedAt >= after ? f.inflight : f.inflight.then(() => refresh(folder, files, parse, { link, after }));
    const sf = door();
    if (!sf) { f.state = 'unreadable'; f.reason = 'no-reader'; f.at = now(); f.from = clock(); return Promise.resolve(f); }
    const from = clock();
    f.startedAt = from;
    f.inflight = (async () => {
      try {
        // a POOL's folder is a link to its current member's: its target, resolved off the loop (null = no link / none)
        let target = null;
        if (link) { try { const r = await sf.call('realpath', { path: folder }, { timeoutMs }); const s = typeof r === 'string' ? r : r && (r.path || r.realpath); target = s ? String(s).replace(/\/+$/, '').split('/').pop() : null; } catch (e) { if (!(e && e.code === 'ENOENT')) throw e; } }
        const st = new Map();
        for (const p of files || []) st.set(p, await statOne(sf, p));
        const same = f.state === 'read' && f.files && target === f.target && f.files.size === st.size
          && [...st].every(([p, x]) => stampOf(f.files.get(p)) === stampOf(x));
        if (same) { f.at = now(); f.from = from; }   // CONFIRMED: the same stamps — the kept facts hold, nothing re-read
        else {
          const out = new Map();
          for (const [p, x] of st) out.set(p, await textOne(sf, p, x));
          if (land(f, out, parse, target, from)) { try { onLanded(folder); } catch { } }
        }
      } catch (e) {
        const reason = e && (e.safeFsTimeout || e.code === 'ETIMEDOUT' || /not responding|timed? ?out/i.test(String(e.message))) ? 'timeout' : (e && e.code) || 'error';
        const changed = f.state !== 'unreadable' || f.reason !== reason;
        f.state = 'unreadable'; f.reason = reason; f.at = now(); f.from = from; f.files = null; f.auth = null; f.sig = null;
        if (changed) { try { onLanded(folder); } catch { } }
      } finally { f.inflight = null; }
      return f;
    })();
    return f.inflight;
  }
  /** refresh unless a snapshot that started at or after `after` is kept or in flight (a decider's settle: at most one read a
   *  folder; an unreadable answer since then is an answer too — the ask is bounded, never repeated in a loop) */
  function ensure(folder, files, parse = null, opts = {}) {
    const f = slot(folder), after = (opts && opts.after) || 0;
    if (!f.inflight && f.state !== 'unread' && f.from >= after) return Promise.resolve(f);
    return refresh(folder, files, parse, opts);
  }
  /** run-reads' shape over a kept snapshot: an unseen path refuses («EUNREAD»), a missing file answers ENOENT */
  function readerOf(files, which = 'text') {
    const of = (p) => { const x = files.get(p); if (!x) throw errOf('EUNREAD', `not kept: ${p}`); if (!x.ok) throw errOf(x.code || 'ENOENT'); return x; };
    const textOf = (x) => { const v = which === 'raw' ? x.raw : x.text; if (!x.isFile || v == null) throw errOf('EISDIR'); return v; };
    return {
      facts(p) { const x = of(p); return { text: textOf(x), mtimeMs: x.mtimeMs, size: x.size }; },
      readText(p) { return textOf(of(p)); },
      stat(p) { const x = of(p); return { mtimeMs: x.mtimeMs, size: x.size, isFile: () => !!x.isFile, isDirectory: () => !x.isFile }; },
    };
  }
  function get(folder) {
    const f = kept.get(folder);
    if (!f || f.state === 'unread' || (!f.files && f.state !== 'unreadable')) return { state: 'unread' };
    if (f.state === 'unreadable') return { state: 'unreadable', at: f.at, from: f.from, reason: f.reason };
    return { state: 'read', at: f.at, from: f.from, auth: f.auth, target: f.target, rd: readerOf(f.files) };
  }
  const stale = (folder, maxAgeMs) => { const f = kept.get(folder); return !f || (!f.inflight && now() - f.at >= maxAgeMs); };
  /** a read whose snapshot started at or after `t` is in flight or done (a decider's ask then waits for it, or has it) */
  const askedSince = (folder, t) => { const f = kept.get(folder); return !!f && (f.inflight ? f.startedAt >= t : (f.state !== 'unread' && f.from >= t)); };
  const drop = (folder) => { kept.delete(folder); };
  /** every read in flight landed — a read CHAINED after one (an ask that came while an older read was in flight) included */
  const settled = async () => { for (let i = 0; i < 64; i++) { const p = [...kept.values()].map((f) => f.inflight).filter(Boolean); if (!p.length) return; await Promise.all(p); } };
  return { refresh, ensure, seed, get, stale, askedSince, drop, settled, clock, size: () => kept.size };
}

module.exports = { create, scrub, KEPT };
