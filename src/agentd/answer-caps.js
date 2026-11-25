'use strict';
// lane lg-remote-hardening (B-7f0b, design q-042 D8 — the coordinator's word r228): THE DEVICE LINK'S BOUNDS, one PURE table.
// A request and its answer each ride ONE control line (src/agentd/mux.js: one JSON line, one frame). The frame's length field
// is bounded (FRAME_MAX: a frame over it ends the link), so no line may be longer than LINE_MAX — the sender refuses an
// over-long line BY NAME before it sends a frame the peer must die on, and the receiver ends the link BY NAME on a line still
// open past it. Each op the agent answers has its CAP: the largest answer its own code can make, with headroom (the
// inventory of 2026-11-20, read from the code's own bounds) — an answer over its op's cap is refused by name at the hub
// (client.js _request), the link kept. THE CENSUS (scripts/test-answer-caps.mjs): every op of the agent has a row here, or
// the suite is red — a new op without a cap is the hole this table closes. An op whose producer has NO bound of its own
// is capped at the line for now (row B-5278: bound each producer). No answer the code can legitimately make is refused.
// Bundled into the device agent (agentd.js requires it; client.js on the hub; mux.js keeps its own copy of the two bounds,
// pinned equal by the suite): a change here rides the next signed agent update.

const MiB = 1024 * 1024;
const FRAME_MAX = 64 * MiB;            // mux.js: a frame's length field over this ends the link (the release's bound)
const LINE_MAX = FRAME_MAX - 5;        // one control line rides one DATA frame: its type byte and channel word take 5
const SMALL = 1 * MiB;                 // the design's line bound: an op whose answer is small by construction

// op → its answer's cap in bytes (the producer's bound it rests on, in the comment)
const CAPS = Object.freeze({
  // the large answers, each from its code's own bound
  'desktop-grab': 48 * MiB,        // a still up to stream-model's stillMaxBytes (32 MiB), base64 ≈ 42.7 MiB
  'design-fs': 40 * MiB,           // read: 24 MiB in total (design-model), base64 ≈ 32 MiB; meta two 2 MiB files
  'fs-op': 12 * MiB,               // list: 5000 entries × a 255-byte name escaped ≈ 8 MB; reads and writes ride a data channel
  'stream-windows': 12 * MiB,      // the helper's 4 MiB stdout, re-escaped
  'run-cmd': 8 * MiB,              // stdout cut to 1 Mi units of a 2 MiB maxBuffer, escaped ≈ 6.4 MiB; stderr 64 Ki units
  'proc-list': 4 * MiB,            // 2000 rows × a 400-unit cmd ≈ 2.7 MB
  'dir-collect': 4 * MiB,          // r1636 / r1651: the folder field's facts — the collector CUTS its reply to COLLECT_CAP_BYTES (src/dir-collect.js cutToCap: the index, the one-match listings, the kids, the probes — each cut said) before it is sent
  'desktop-apps-list': 2 * MiB,    // 500 rows × (a 200-unit name + a 1000-unit launch line, 3 bytes a unit at worst) + fields ≈ 1.75 MiB
                                   // — the tightest margin: the suite computes it from installed-apps' and the run door's bounds
  // the producers with NO bound of their own: the line for now (row B-5278 bounds each producer)
  'discovery-snapshot': LINE_MAX,  // its child is capped at 16 MiB and its rows at their producer (B-5278 unit 2, part 3: discovery-facts)
  'discovery-claims': LINE_MAX,    // rows of the same snapshot
  'quota-refresh': LINE_MAX,       // `passive`: every usage-cache file, no count or size cap
  'pool-orders': LINE_MAX,         // `events`: the whole pool-orders log until the hub acks
  'opencode-serve': LINE_MAX,      // read: the whole conversation; status: no cap
  'probe-creds': LINE_MAX,         // one entry per subs folder (small in practice)
  'desktop-serve': LINE_MAX,       // list / status: one row per app record, no count cap
  // small by construction (an ack, a fact, a short list) — the design's line bound
  'attach-pipe-session': SMALL, 'browser-serve': SMALL, 'desktop-input': SMALL, 'dial-status': SMALL, 'discovery-watch': SMALL,
  'dir-collect-end': SMALL /* r1633: { ended } */, 'display-facts': SMALL, 'hello': SMALL, 'input-events': SMALL, 'kill-pipe-session': SMALL, 'kill-session': SMALL,
  'left-behind': SMALL, 'left-behind-end': SMALL /* B-69a7 (b): names + counts */, 'ok': SMALL, 'open-pipe-session': SMALL, 'open-session': SMALL, 'peer-post': SMALL, 'peer-state': SMALL /* B-95fc: {live, inbox} */, 'ping-info': SMALL,
  'place-secret': SMALL, 'settings-merge': SMALL /* B-e7c0: {ok, path, dropped names} */, 'pool-orders-log-ack': SMALL, 'probe-cli': SMALL, 'remoteapp-facts': SMALL, 'resize-session': SMALL,
  'run-stream': SMALL, 'serve-folder': SMALL, 'serve-socks': SMALL, 'session-events-watch': SMALL, 'settings-open': SMALL,
  'stream-answer': SMALL, 'stream-audio': SMALL, 'stream-facts': SMALL, 'stream-mic': SMALL, 'stream-offer': SMALL,
  'stream-stats': SMALL, 'stream-stop': SMALL, 'sysinfo': SMALL, 'tcp-connect': SMALL, 'tcp-listen': SMALL, 'tcp-unlisten': SMALL,
  'transcript-op': SMALL, 'unserve-folder': SMALL, 'unserve-socks': SMALL, 'upgrade': SMALL, 'usage-events-ack': SMALL,
  'usage-events-watch': SMALL, 'usage-scan': SMALL, 'window-pin': SMALL, 'window-track': SMALL, 'window-untrack': SMALL,
});

// B-5278 unit 2, the last piece (the coordinator's ruling on Q2): THE CAPS LOWERED TO THE COMPUTED BOUNDS — only for an agent that
// says it bounds its producers ('producer-bounds' among its hello's capabilities). An older agent keeps the release's rows (CAPS):
// its producers have no bound of their own. Each row rests on its producer's bound, in the comment; the suite holds every row at
// or under the release's, and every op of this table in CAPS.
const PRODUCER_BOUNDS = 'producer-bounds';
const BOUNDED_CAPS = Object.freeze({
  'discovery-snapshot': 20 * MiB,  // the child's answer ≤ 16 MiB (discovery-facts DISCOVERY_CHILD_MAX_BYTES) + the reply's envelope
  'discovery-claims': 20 * MiB,    // rows of that same bounded snapshot
  'quota-refresh': 8 * MiB,        // passive ≤ PASSIVE_FILES_MAX × PASSIVE_FILE_MAX = 4 MiB + two vendor bodies (< 256 Ki units each), escaped
  'pool-orders': 2 * MiB,          // the log ≤ 2000 events / 1 MiB at its write (sealed-orders POOL_LOG_*), escaped
  'probe-creds': SMALL,            // ≤ 500 folders × (a 255-byte name riding THREE times — hostSubs, its login status, its email — + a 320-unit email + an 80-unit attempt + fields) ≈ 0.6 MB
  'desktop-serve': 8 * MiB,        // list / status cut where they are made to SERVE_REPLY_MAX (6 MiB, desktop-serve.js boundServeReply; r4358), its envelope
  'opencode-serve': 40 * MiB,      // read: the newest records within 32 MiB (opencode-remote READ_MAX) + the session record, escaped; status ≤ 2000 entries
});
// the passive usage readings an agent answers (quota-refresh `passive`): the ssh twin's own bound (hosts.js PASSIVE_PEEK_*) —
// the first PASSIVE_FILES_MAX by name, none over PASSIVE_FILE_MAX; the rest counted (`passiveLeft`)
const PASSIVE_FILES_MAX = 64, PASSIVE_FILE_MAX = 64 * 1024;
/** PURE: which usage-cache files a passive reading reads → { take: [name], left } (the readings and their order: the twin's) */
function passivePick(names) {
  const ok = (Array.isArray(names) ? names : []).filter((f) => typeof f === 'string' && /^[\w.-]{1,120}\.json$/.test(f) && !f.startsWith('__models__')).sort();   // (r1135) the twin's own name rule
  return { take: ok.slice(0, PASSIVE_FILES_MAX), left: Math.max(0, ok.length - PASSIVE_FILES_MAX) };
}
/** the cap of an op's answer in bytes (an op with no row: the line itself — the census keeps that set empty); an agent that says
 *  'producer-bounds' gets the lowered row where there is one */
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const capOf = (op, capabilities) => (Array.isArray(capabilities) && capabilities.includes(PRODUCER_BOUNDS) && hasOwn(BOUNDED_CAPS, op) ? BOUNDED_CAPS[op]
  : hasOwn(CAPS, op) ? CAPS[op] : LINE_MAX);
/** bytes as a person reads them (KiB / MiB, one decimal) */
const sizeOf = (n) => { const b = Number(n) || 0; return b >= MiB ? `${(b / MiB).toFixed(1)} MiB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB` : `${b} B`; };
/** THE AGENT'S REFUSAL of an over-long line (mux.js `overLong`): an answer becomes a refusal of that ONE op by name (its id
 *  kept, the link kept); a push (no id) becomes a `line-refused` naming the push. Never throws; never carries the payload. */
function refusalOf(obj, bytes, cap = LINE_MAX) {
  const op = obj && typeof obj.op === 'string' ? obj.op.slice(0, 64) : 'a line';
  const error = `this machine's answer (${op}) is ${sizeOf(bytes)} — over the ${sizeOf(cap)} a line of the device link may carry: refused (answer-too-large)`;
  if (obj && obj.id != null) return { op, id: obj.id, error, code: 'answer-too-large', bytes, cap };
  return { op: 'line-refused', of: op, error, code: 'answer-too-large', bytes, cap };
}

// THE USAGE PUSH's batch law (agentd.js usage-events-watch; the coordinator's r310 (1): run by the suite, not read):
// a walk's stdout — its NDJSON events, then the cursor manifest as its LAST line — goes out in chunks of ≤ PUSH_LINES
// lines and ≤ PUSH_TEXT bytes of their text (a JSON line escapes its quotes, so a chunk stays far under the line's bound
// and an ordinary walk is never refused; one line longer than that alone is its producer's, row B-5278). The LAST chunk
// carries the seq the hub acks for the cursor to commit (usagePushAcked). `send` answers false (its refusal went in the
// line's place) or throws (refused by name, nothing sent): the batch ends THERE, before the chunk that carries the seq,
// and its pending cursor is dropped — nothing is acked past refused events, and the next walk starts from the cursor
// saved before. A walk with no new events commits its cursor at once. `commit(cursors)` writes the agent's cursor file.
const PUSH_LINES = 500, PUSH_TEXT = 8 * MiB;
// B-5278 (L1; the coordinator's r442): THE WALK's OWN BOUND. The push's walk child stops after a whole line once its events
// pass PUSH_WALK_BYTES or its time PUSH_WALK_MS (src/usage-walker.js, the shipped scanner's law), far inside the child's
// 64 MiB buffer and 120 s; a walk STOPPED ON ITS BOUND says so (its manifest's __more__), and the rest of the backlog is
// walked after THAT batch's ack — never before: nothing is walked, sent or acked past what was sent. A kick meanwhile waits
// for that ack, at most PUSH_ACK_WAIT_MS — the hub leaves a batch unacked on purpose when its rows were not made durable (a
// held month), and the device then walks again from its committed cursor, as it always did. A whole-history walk used to
// pass the child's buffer or deadline and fail every time, re-reading the whole history at each transcript change.
// The walk's dropped events (an id over its bound: src/usage-walker.js) ride the batch's LAST chunk (`oversize`) and the
// hub says them: a dropped usage event is money not counted, never silent.
const PUSH_WALK_BYTES = 24 * MiB, PUSH_WALK_MS = 60 * 1000, PUSH_ACK_WAIT_MS = 60 * 1000;
// (r557 (1)) the push walk's time is counted from its FIRST LINE READ (`--clock-read`), never from before its listing — a
// machine whose listing alone takes a minute walked one line a walk — and its child may run PUSH_WALK_TIMEOUT_MS (a listing
// of up to three minutes, then its minute of reading). The harvest roads keep the clock from the walk's start (the hub's
// deadline is theirs).
const PUSH_WALK_TIMEOUT_MS = 4 * 60 * 1000;
function pushChunksOf(lines, maxLines = PUSH_LINES, maxText = PUSH_TEXT) {
  const chunks = [];
  for (let i = 0, n = 0, start = 0; i <= lines.length; i++) {
    const len = i < lines.length ? Buffer.byteLength(String(lines[i])) : 0;
    if (i === lines.length || (i > start && (i - start >= maxLines || n + len > maxText))) { if (i > start) chunks.push(lines.slice(start, i)); start = i; n = 0; }
    n += len;
  }
  return chunks;
}
function usagePushWalked(st, stdout, send, commit, { maxLines, maxText, now = Date.now } = {}) {
  const lines = String(stdout || '').split('\n').filter(Boolean);
  const last = lines.pop();
  let manifest = null; try { manifest = JSON.parse(last || ''); } catch { }
  if (!manifest || !manifest.__cursors__) return { chunks: 0 };
  const more = manifest.__more__ === true, oversize = Number(manifest.__oversize__) > 0 ? Math.floor(Number(manifest.__oversize__)) : 0;
  if (!lines.length && !oversize) { commit(manifest.__cursors__); return { committed: true, more, chunks: 0 }; }   // no new events: nothing to lose
  const seq = ++st.seq;
  st.pendingCursors.set(seq, manifest.__cursors__);
  if (more) { st.moreSeq = seq; st.moreAt = now(); }   // the rest is walked after THIS batch's ack
  const chunks = lines.length ? pushChunksOf(lines, maxLines, maxText) : [[]];   // only dropped ones: their count still goes
  for (let c = 0; c < chunks.length; c++) {
    const isLast = c === chunks.length - 1;
    let sent = true; try { sent = send({ op: 'usage-events', batch: chunks[c], ...(isLast ? { seq, ...(oversize ? { oversize } : {}) } : {}) }) !== false; } catch { sent = false; }
    if (!sent) { st.pendingCursors.delete(seq); if (st.moreSeq === seq) { delete st.moreSeq; delete st.moreAt; } return { seq, refusedAt: c, chunks: chunks.length, more }; }
  }
  return { seq, sent: true, chunks: chunks.length, more };
}
// may a walk start now? → 0, or the ms until it may: a walk stopped on its bound has its batch's ack awaited (≤ the wait)
function usagePushWaitMs(st, t = Date.now()) {
  if (!st || st.moreSeq == null) return 0;
  if (!st.pendingCursors.has(st.moreSeq)) { delete st.moreSeq; delete st.moreAt; return 0; }
  return Math.max(0, PUSH_ACK_WAIT_MS - (t - st.moreAt));
}
// the hub's ack of batch `seq` (its durable ingest): that batch's cursor commits, and every older pending one is dropped;
// when that batch's walk stopped on its bound, `onMore` walks the rest (B-5278 L1)
function usagePushAcked(st, seq, commit, onMore) {
  const cur = st && st.pendingCursors.get(seq);
  if (!cur) return false;
  const more = st.moreSeq != null && st.moreSeq <= seq;
  for (const k of [...st.pendingCursors.keys()]) if (k <= seq) st.pendingCursors.delete(k);
  if (more) { delete st.moreSeq; delete st.moreAt; }
  commit(cur);
  if (more && typeof onMore === 'function') onMore();
  return true;
}
// B-5278 (L2): the hub-kept cursor map without each claude entry's `sid` — the walker sets it from the path at every walk
// (the oldest agent that says usage-scan-hub-cursor too: test-usage-walk-bounds runs it), so it never needs to ride the
// map the hub hands down on one control line (a fifth of a main transcript's entry)
function cursorsWithoutSid(map) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, 'sid')) { const { sid, ...rest } = v; out[k] = rest; } else out[k] = v;
  }
  return out;
}
// the shipped scanner's own count line of dropped events (`{"__oversize__":N}`, its output's last line) → N, else 0
function oversizeOf(text) {
  const t = String(text || '').trimEnd(), i = t.lastIndexOf('\n'), last = t.slice(i + 1);
  if (last.indexOf('"__oversize__"') < 0) return 0;
  let o = null; try { o = JSON.parse(last); } catch { return 0; }
  const n = o && Number(o.__oversize__);
  return n > 0 ? Math.floor(n) : 0;
}
// THE PUSH's LOOP (B-5278; the coordinator's r557 (5): one body, run by the suite — agentd.js hands it the walk child, the
// line and the cursor writer): one walk at a time (a kick while one runs walks again after it); a kick coalesces for
// kickMs; a walk stopped on its bound has its batch's ack awaited (usagePushWaitMs: at most PUSH_ACK_WAIT_MS) and the
// ack walks the rest (st.acked); one stopped on its bound with nothing to send walks again at once; a dead link (st.dead)
// walks nothing.
function usagePushLoop(st, { walk, send, commit, log = () => { }, now = Date.now, timers = { setTimeout, clearTimeout }, kickMs = 1500, againMs = 200 }) {
  const runWalk = () => {
    if (st.dead) return; // its link died (U1): no walk, no push, no cursor written for a link nobody hears
    if (st.running) { st.again = true; return; }
    const wait = usagePushWaitMs(st, now());
    if (wait > 0) { if (!st.waitTimer) { st.waitTimer = timers.setTimeout(() => { st.waitTimer = null; runWalk(); }, wait); if (st.waitTimer && st.waitTimer.unref) st.waitTimer.unref(); } return; }
    st.running = true;
    walk((err, stdout) => {
      st.running = false;
      let r = null;
      try {
        if (err) log('usage-events walk failed: ' + err.message);
        if (!err && stdout) r = usagePushWalked(st, stdout, send, commit, { now });
      } catch (e) { log('usage-events push failed: ' + e.message); }
      if (r && r.committed && r.more) st.again = true;   // stopped on its bound with nothing to send: the rest now
      if (st.again && !st.dead) { st.again = false; timers.setTimeout(runWalk, againMs); }
    });
  };
  let kickTimer = null;
  st.runWalk = runWalk;
  st.kick = () => { if (kickTimer) return; kickTimer = timers.setTimeout(() => { kickTimer = null; runWalk(); }, kickMs); };
  st.clearKick = () => { if (kickTimer) { timers.clearTimeout(kickTimer); kickTimer = null; } if (st.waitTimer) { timers.clearTimeout(st.waitTimer); st.waitTimer = null; } };
  st.walkNow = () => { if (st.waitTimer) { timers.clearTimeout(st.waitTimer); st.waitTimer = null; } runWalk(); };
  st.acked = (seq) => usagePushAcked(st, seq, commit, () => timers.setTimeout(() => { if (!st.dead) st.walkNow(); }, 0));
  return st;
}
// the hub's journal line for a walk's dropped events (each road says it once: a dropped usage event is money not counted)
function droppedSaid(machine, n, road) {
  return `[usage] ${machine || 'a machine'}: ${n} usage record${n === 1 ? '' : 's'} left out of its ${road || 'walk'} — an id longer than 256 bytes is no vendor id (B-5278); ${n === 1 ? 'its' : 'their'} tokens are not counted`;
}

module.exports = { MiB, FRAME_MAX, LINE_MAX, SMALL, CAPS, BOUNDED_CAPS, PRODUCER_BOUNDS, PASSIVE_FILES_MAX, PASSIVE_FILE_MAX, passivePick, capOf, sizeOf, refusalOf, PUSH_LINES, PUSH_TEXT, PUSH_WALK_BYTES, PUSH_WALK_MS, PUSH_ACK_WAIT_MS, PUSH_WALK_TIMEOUT_MS, pushChunksOf, usagePushWalked, usagePushWaitMs, usagePushAcked, usagePushLoop, droppedSaid, cursorsWithoutSid, oversizeOf };
