/**
 * GmailSync — Gmail-as-a-folder (2.134.0, backlog B-64db).
 *
 * Model (research-verified, GYB-style): a 'gmail' mount is a local directory
 * of .eml files kept in sync READ-ONLY from the Gmail API — NOT a FUSE mount
 * (no proven fs semantics for mail; sync-to-folder is the battle-tested
 * design). users.messages.list seeds the newest N, then history.list keeps it
 * incremental; messages.get?format=raw returns the full RFC-822 bytes
 * (base64url) which land as files the normal explorer/viewer pipeline opens.
 *
 * OAuth: gmail.readonly via our OWN loopback flow (rclone authorize is
 * drive-only). Same UX as the guided Drive flow: server starts a local
 * listener, returns the consent URL; same-machine browsers complete
 * hands-free, remote ones paste the 127.0.0.1 redirect back. Tokens are the
 * mount's own (encrypted at rest by MountManager like every secret); client
 * id/secret resolve from the instance PRESETS (VIBESPACE_GDRIVE_CLIENTS — the
 * presets carry gmail.readonly scope too) or a custom pair.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Minimal RFC2047 header decode for FILENAMES only (the viewer does the real
// parse): =?charset?B|Q?...?= words, utf-8/gbk/etc via TextDecoder.
function decodeHeaderWord(s) {
  return String(s || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, data) => {
    try {
      let bytes;
      if (enc.toUpperCase() === 'B') bytes = Buffer.from(data, 'base64');
      else bytes = Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'binary');
      return new TextDecoder(cs.toLowerCase()).decode(bytes);
    } catch { return data; }
  }).replace(/\?=\s+=\?/g, '?==?');
}

// B-e40d: a sign-in's minted client OUTLIVES its flow (the flow's 10-minute timer, another sign-in, a Cancel) for a day — a
// person who picks folders or labels for longer before Save still saves a token that names its client (src/mounts.js
// MountManager.mintClientOf reads it; the Drive flow keeps its own map). Keyed by a hash of the refresh token, never the
// token; at most 16 kept, in memory only (a restart forgets: such a token's first good refresh adopts its client).
const SIGNIN_KEEP_MS = 24 * 3600e3;
const rtOf = (tok) => { try { const t = JSON.parse(String(tok)); return t && typeof t.refresh_token === 'string' && t.refresh_token ? t.refresh_token : null; } catch { return null; } };
const rtKey = (rt) => crypto.createHash('sha256').update(String(rt)).digest('hex');
/** Drop every entry past its day (the hub's 60 s mount sweep asks, src/mounts.js _healthSweep — an entry leaves at its day's end,
 *  never only at the next sign-in). → how many left. */
function pruneSignIns(map, now = Date.now()) {
  let n = 0;
  if (map) for (const [k, v] of map) if (!v || now - v.at > SIGNIN_KEEP_MS) { map.delete(k); n++; }
  return n;
}
function keepSignIn(map, st) {
  const rt = rtOf(st && st.token), c = st && st.client;
  if (!map || !rt || !c || !c.clientId || !c.clientSecret) return;
  const now = Date.now();
  pruneSignIns(map, now);
  map.delete(rtKey(rt));
  map.set(rtKey(rt), { client: { clientId: String(c.clientId), clientSecret: String(c.clientSecret) }, at: now });
  while (map.size > 16) map.delete(map.keys().next().value);
}
function signInClient(map, rt) {
  const k = map && rt ? rtKey(rt) : null, v = k ? map.get(k) : null;
  if (v && Date.now() - v.at > SIGNIN_KEEP_MS) { map.delete(k); return null; }   // past its day: gone
  return v ? v.client : null;
}

// B-574d (lane nl-journals, 主开发 r4939): the cursor's KEY — every field but lastSyncAt (nobody reads it from the file: the page shows the
// watcher's own): a pass whose key did not move writes nothing
const cursorKey = (st) => { const { lastSyncAt, ...c } = st || {}; void lastSyncAt; return JSON.stringify(c); };
class GmailSync {
  constructor({ presets, onProgress, onClientProven, storeWriter = null } = {}) {
    this._storeWriter = storeWriter;   // B-574d: the cursor's writer — the process's store writer unless a suite hands one
    this._presets = presets || (() => []);
    this._onProgress = onProgress || (() => { });
    this._onClientProven = onClientProven || (() => { });   // B-e40d: a refresh that worked proves its client (MountManager adopts it)
    this._workers = new Map(); // mount id → worker
    this._auth = null;         // one guided OAuth flow at a time (like drive)
    this._signIns = new Map(); // B-e40d: a sign-in's minted client, kept a day after its flow ends (keepSignIn)
  }

  // ── OAuth (loopback + paste-back, mirrors the Drive flow UX) ──

  _client({ id = null, name = null, clientId, clientSecret, clientPreset, minted = null } = {}) {
    if (clientId && clientSecret) return { clientId, clientSecret };
    // the record's minted client is READ HERE, each refresh (src/mounts.js _mountGmail hands a reader): one adopted while the
    // worker runs is used at once
    if (typeof minted === 'function') { try { minted = minted(); } catch { minted = null; } }
    const list = this._presets();
    const pick = clientPreset ? list.find((c) => c.key === clientPreset)
      : (list.length === 1 ? list[0] : list.find((c) => c.key === 'default'));
    // B-e40d: the record names the client its token was MINTED under (src/mounts.js MountManager.mintedOf) — a refresh
    // keeps that client when the preset under the key now names ANOTHER one, or is gone (the 2026-10-23 outage); while the
    // preset names the same client its values are used, each refresh (a rotated secret reaches the mount at once)
    if (minted && minted.clientId && minted.clientSecret && (!pick || String(pick.clientId) !== String(minted.clientId))) {
      const k = `${id}|${minted.clientId}|${pick ? pick.clientId : '-'}`;
      if (!(this._mintedSaid || (this._mintedSaid = new Set())).has(k)) { this._mintedSaid.add(k); console.log(`[gmail-sync] ${name || id || 'a Gmail mount'}: the ${clientPreset ? `preset «${clientPreset}»` : 'instance\'s default preset'} ${pick ? 'now names another OAuth client' : 'is gone'} — it keeps the client its token was minted under; re-authorize it to move it`); }
      return { clientId: minted.clientId, clientSecret: minted.clientSecret };
    }
    if (pick) return { clientId: pick.clientId, clientSecret: pick.clientSecret };
    throw new Error('Gmail needs an OAuth client — pick a preset or provide a custom client id/secret (there is no built-in fallback client for Gmail)');
  }

  startAuth(opts = {}) {
    this.cancelAuth();
    const client = this._client({ clientId: opts.clientId, clientSecret: opts.clientSecret, clientPreset: opts.clientPreset });   // the request's own fields only
    const state = crypto.randomBytes(12).toString('hex');
    const st = { client, state, url: null, token: null, error: null, server: null, startedAt: Date.now() };
    this._auth = st;
    return new Promise((resolve) => {
      const srv = http.createServer(async (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          if (u.searchParams.get('state') !== state) { res.writeHead(400).end('state mismatch'); return; }
          const code = u.searchParams.get('code');
          res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h3>VibeSpace: Gmail connected — you can close this tab.</h3>');
          if (code) await this._exchange(st, code);
        } catch (e) { st.error = e.message; }
      });
      st.server = srv;
      srv.listen(0, '127.0.0.1', () => {
        st.port = srv.address().port;
        st.url = AUTH_URL + '?' + new URLSearchParams({
          client_id: client.clientId,
          redirect_uri: `http://127.0.0.1:${st.port}`,
          response_type: 'code',
          scope: SCOPE,
          access_type: 'offline',
          prompt: 'consent', // guarantees a refresh_token
          state,
        });
        resolve({ url: st.url });
      });
      st.timer = setTimeout(() => this.cancelAuth(), 10 * 60 * 1000);
      st.timer.unref?.();
    });
  }

  async _exchange(st, code) {
    const body = new URLSearchParams({
      code, client_id: st.client.clientId, client_secret: st.client.clientSecret,
      redirect_uri: `http://127.0.0.1:${st.port}`, grant_type: 'authorization_code',
    });
    const r = await fetch(TOKEN_URL, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
    const d = await r.json();
    if (!r.ok) { st.error = d.error_description || d.error || 'token exchange failed'; return; }
    if (!d.refresh_token) { st.error = 'no refresh_token returned — remove the app from myaccount.google.com/permissions and retry'; return; }
    st.token = JSON.stringify({ refresh_token: d.refresh_token, access_token: d.access_token, expiry: Date.now() + (d.expires_in || 3600) * 1000 });
  }

  /** Remote paste-back: the user pastes the http://127.0.0.1:<port>/?code=…
   *  redirect that failed in THEIR browser; the code inside is all we need. */
  async forwardCallback(url) {
    const st = this._auth;
    if (!st) throw new Error('no authorization in progress');
    const u = new URL(String(url));
    if (u.searchParams.get('state') !== st.state) throw new Error('state mismatch — restart the flow');
    const code = u.searchParams.get('code');
    if (!code) throw new Error('no code in that URL');
    await this._exchange(st, code);
    return { token: st.token, error: st.error };
  }

  authStatus() {
    const st = this._auth;
    if (!st) return { running: false };
    return { running: !st.token && !st.error, url: st.url, token: st.token, error: st.error };
  }

  cancelAuth() {
    const st = this._auth;
    if (!st) return;
    try { st.server?.close(); } catch { }
    clearTimeout(st.timer);
    if (st.token) keepSignIn(this._signIns, st);   // B-e40d: a later Save still names its client
    this._auth = null;
  }

  // ── Sync workers (one per mounted gmail record) ──

  /** cfg: {id, dir, token (json str), clientId?, clientSecret?, clientPreset?,
   *        syncCount, labelIds (csv), query, pollSeconds} */
  start(cfg) {
    this.stop(cfg.id);
    const w = {
      // count: null until a walk of the folder has FINISHED (rank 16 round 2) — an unread folder is never «0 emails»
      cfg, state: 'syncing', error: null, count: null, lastSyncAt: 0,
      tok: JSON.parse(cfg.token), stopped: false, timer: null,
    };
    this._workers.set(cfg.id, w);
    this._loop(w).catch(() => { });
    return w;
  }

  stop(id) {
    const w = this._workers.get(id);
    if (!w) return;
    w.stopped = true;
    clearTimeout(w.timer);
    this._workers.delete(id);
  }

  status(id) {
    const w = this._workers.get(id);
    if (!w) return null;
    return { state: w.state, error: w.error, count: w.count, lastSyncAt: w.lastSyncAt, email: w.email || null, progress: w.progress || null };
  }

  _progress(w, total, done) {
    // total known → determinate {total,done}; total null but a running count →
    // indeterminate WITH a number (seed/download phase shows "N so far"); null
    // total and no count → cleared (idle / pure checking).
    w.progress = total != null ? { total, done }
      : (done != null ? { indeterminate: true, done } : null);
    // Indeterminate broadcasts SLOWLY: every broadcast rebuilds the card and
    // restarts the bar animation; a fast cadence stuttered it (real report).
    const now = Date.now();
    const interval = total == null ? 2500 : 400;
    if (now - (this._lastProg || 0) > interval) { this._lastProg = now; try { this._onProgress(); } catch { } }
  }

  async _loop(w) {
    while (!w.stopped) {
      try {
        w.state = 'syncing';
        await this._syncOnce(w);
        w.state = 'idle';
        w.error = null;
        w.lastSyncAt = Date.now();
      } catch (e) {
        w.state = 'error';
        w.error = String(e.message || e).slice(0, 300);
      }
      if (w.stopped) return;
      // round 3: a pass that ENDS IN ERROR (or a new error) and the pass that HEALS it are pushed at once (mounts-updated) — an
      // open mounts panel says «Sync stopped: …» while passes fail, never the last «Checking for new mail…» it drew
      const end = w.state === 'error' ? 'error:' + w.error : 'ok';
      if (end !== w.lastEnd && (end !== 'ok' || (w.lastEnd || '').startsWith('error:'))) { try { this._onProgress(); } catch { } }
      w.lastEnd = end;
      // a failed pass (a folder that could not be read, the API) is tried again after 120 s — never LATER than a normal pass
      // would come (rank 16 round 2: a walk that did not finish is retried; mounts set no pollSeconds, so 300 s ⇒ 120 s)
      const poll = w.cfg.pollSeconds || 300;
      const delay = (w.state === 'error' ? Math.min(120, poll) : poll) * 1000;
      await new Promise((r) => { w.timer = setTimeout(r, delay); w.timer.unref?.(); });
    }
  }

  async _accessToken(w) {
    if (w.tok.access_token && (w.tok.expiry || 0) > Date.now() + 60000) return w.tok.access_token;
    const client = this._client(w.cfg);
    const body = new URLSearchParams({
      refresh_token: w.tok.refresh_token, client_id: client.clientId,
      client_secret: client.clientSecret, grant_type: 'refresh_token',
    });
    const r = await fetch(TOKEN_URL, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
    const d = await r.json();
    if (!r.ok) throw new Error('token refresh failed: ' + (d.error_description || d.error || r.status) + (d.error === 'invalid_grant' ? ' — re-authorize this Gmail mount' : ''));
    w.tok.access_token = d.access_token;
    w.tok.expiry = Date.now() + (d.expires_in || 3600) * 1000;
    if (w.cfg && w.cfg.id && !w.stopped) { try { this._onClientProven(w.cfg.id, client, w.tok.refresh_token); } catch { } }   // a stopped worker proves nothing
    return d.access_token;
  }

  async _api(w, pathq) {
    const tok = await this._accessToken(w);
    // Bounded: a wedged connection must error (→ the loop's 120s backoff heals
    // it), never hang the worker — undici's 5min defaults left the mount
    // looking frozen for whole passes.
    const r = await fetch(API + pathq, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(60000) });
    if (r.status === 404) { const e = new Error('404'); e.code = 404; throw e; }
    if (!r.ok) throw new Error(`gmail api ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }

  /** List the account's labels (system + user) — the labels picker.
   *  cfg = {token, clientId?, clientSecret?, clientPreset?} (transient) —
   *  callers with an existing record pass its decrypted fields. */
  async listLabels(cfg) {
    const w = { cfg, tok: JSON.parse(String(cfg.token)) };
    const d = await this._api(w, '/labels');
    return (d.labels || [])
      .map((l) => ({ id: l.id, name: l.name, type: l.type }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'system' ? -1 : 1));
  }

  _statePath(w) { return path.join(w.cfg.dir, '.vibespace-gmail-state.json'); }

  /** The mailbox's seen message ids. Message ids ride in the filename tail: …_<id>.eml — THE DIRECTORY TREE IS THE DEDUP
   *  INDEX (no separate DB to drift). One subdir level covers the date-grouping layouts (YYYY-MM/ or YYYY-MM-DD/, and
   *  label/YYYY-MM); files already in the flat root keep counting after grouping is turned on (no re-download).
   *  Lane hub-sync-holds, rank 16 — the owner's hub held its loop 1.5–1.7 s every 300 s per mailbox when each pass re-listed
   *  the tree with readdirSync. The walk is ASYNC now (off the loop), and it is RE-PROVEN AT EVERY PASS (round 2, the
   *  acceptance panel: a set kept across passes was the separate DB — a folder emptied to sync again, a file deleted or added
   *  by another process, read wrong for the worker's life). ONE walk at a time (a second ask while one runs shares it);
   *  a folder that does not exist reads as EMPTY (that walk finished: nothing is there);
   *  within a pass the set grows by what this sync writes (_writeMessage). A WALK THAT DID NOT FINISH IS NEVER AN ANSWER:
   *  it throws, the pass fails before any download, the mount's state says which folder could not be read, and the next
   *  pass walks again — never «0 seen», never a seed read as complete. */
  _seenIds(w) {
    if (!w.walkP) w.walkP = this._walkSeen(w).finally(() => { w.walkP = null; });
    return w.walkP;
  }
  async _walkSeen(w) {
    const seen = new Set();
    const scan = async (dir, depth) => {
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
      catch (err) {
        if (err.code === 'ENOENT') return; // no folder there (the root not made yet, a subfolder removed between its listing and its read): nothing on disk
        throw Object.assign(new Error(`the mail folder could not be read (${err.code || err.message}): ${dir}`), { code: 'mail_walk_failed' });
      }
      for (const ent of entries) {
        if (ent.isDirectory() && depth < 2 && !ent.name.startsWith('.')) await scan(path.join(dir, ent.name), depth + 1);
        else { const m = /_([a-f0-9]{8,20})\.eml$/.exec(ent.name); if (m) seen.add(m[1]); }
      }
    };
    await scan(w.cfg.dir, 0);
    return seen;
  }

  async _syncOnce(w) {
    fs.mkdirSync(w.cfg.dir, { recursive: true });
    let state = {};
    try { state = this._readState(w); } catch { }
    w._savedCursor = cursorKey(state);   // B-574d: what the writer holds now — a pass that moves nothing writes nothing
    const seen = await this._seenIds(w); // the folder, read now (async; a walk that did not finish throws — rank 16)
    w.count = seen.size;

    if (!w.email) {
      const prof = await this._api(w, '/profile');
      w.email = prof.emailAddress;
      state.email = prof.emailAddress;
    }

    const labelFilter = String(w.cfg.labelIds || '').split(',').map((s) => s.trim()).filter(Boolean);
    const qs = () => {
      const p = new URLSearchParams();
      for (const l of labelFilter) p.append('labelIds', l);
      // No label filter = the WHOLE mailbox — including archived (no INBOX
      // label) and, explicitly, spam/trash (the API excludes them by default).
      if (!labelFilter.length) p.set('includeSpamTrash', 'true');
      if (w.cfg.query) p.set('q', w.cfg.query);
      return p;
    };

    let ids = [];
    let newHistoryId = state.historyId || null;
    if (state.historyId) {
      // Incremental: everything since the last sync (additions only — this is
      // a read-only archive; deletions/label moves don't remove files).
      try {
        let pageToken = null;
        do {
          const p = new URLSearchParams({ startHistoryId: state.historyId, historyTypes: 'messageAdded' });
          if (pageToken) p.set('pageToken', pageToken);
          const h = await this._api(w, '/history?' + p);
          for (const rec of h.history || []) {
            for (const ma of rec.messagesAdded || []) if (ma.message?.id) ids.push(ma.message.id);
          }
          if (h.historyId) newHistoryId = h.historyId;
          pageToken = h.nextPageToken || null;
        } while (pageToken);
      } catch (e) {
        if (e.code === 404) { state.historyId = null; } // expired — full reseed below
        else throw e;
      }
    }
    if (!state.historyId) {
      // SEED (first full sync; syncCount 0 = EVERYTHING, hard cap 200k) — now
      // STREAMING + CHECKPOINTED so a restart mid-seed RESUMES from the last
      // page instead of re-listing the whole mailbox (real report: every
      // restart re-scanned). Each page is downloaded then the messages.list
      // pageToken is persisted; a restart continues from state.seedPageToken.
      const n = Number(w.cfg.syncCount);
      // 0 = the WHOLE mailbox, no ceiling (user mailboxes exceed the old 200k cap;
      // the seed is streaming + checkpointed, so size only costs time, not safety)
      const want = n === 0 ? Infinity : Math.max(1, n || 200);
      // Capture the historyId ONCE at seed START (incremental later covers mail
      // arriving DURING the seed) AND a real TOTAL for the progress bar — cheap:
      // profile.messagesTotal for the whole mailbox, labels.get.messagesTotal
      // for a label filter; a free-text query has no cheap total.
      if (!state.seedHistoryId || state.seedTotal == null) {
        const prof = await this._api(w, '/profile');
        if (!state.seedHistoryId) state.seedHistoryId = prof.historyId;
        if (state.seedTotal == null) {
          let tot = null;
          if (!labelFilter.length && !w.cfg.query) tot = prof.messagesTotal;
          else if (labelFilter.length && !w.cfg.query) {
            tot = 0;
            for (const lid of labelFilter) { try { const lab = await this._api(w, `/labels/${encodeURIComponent(lid)}`); tot += lab.messagesTotal || 0; } catch { } }
          }
          state.seedTotal = tot != null ? Math.min(tot, want) : 0; // 0 = unknown
        }
        await this._saveState(w, state);
      }
      // CROSS-RESTART CURSOR = a DATE, not a pageToken. Gmail's messages.list
      // pageToken is only stable within one run — new mail arriving between
      // runs can shift or expire it, silently skipping OLD mail (which the
      // incremental pass never back-fills). So a restart resumes from the
      // OLDEST already-downloaded message's date via `before:<sec>` and pulls
      // strictly-older mail; new mail (newer date) is untouched here and caught
      // by the seed-start historyId incremental. Same-second boundary re-lists
      // a few already-seen ids (dedup skips them). pageToken stays a per-run
      // optimization only.
      const beforeSec = state.seedOldestMs ? Math.floor(state.seedOldestMs / 1000) + 1 : null;
      let pageToken = null;
      let fetched = state.seedFetched || 0;
      let oldestMs = state.seedOldestMs || Infinity;
      do {
        if (w.stopped) return;
        const p = qs();
        if (beforeSec) p.set('q', [(p.get('q') || ''), `before:${beforeSec}`].filter(Boolean).join(' '));
        p.set('maxResults', String(Math.min(500, want - fetched)));
        if (pageToken) p.set('pageToken', pageToken);
        const l = await this._api(w, '/messages?' + p);
        const msgs = l.messages || [];
        for (const m of msgs) {
          if (w.stopped) return;
          if (!seen.has(m.id)) { const md = await this._writeGone404(w, m.id, seen); if (md) oldestMs = Math.min(oldestMs, md); }
          this._progress(w, state.seedTotal || null, w.count); // determinate when total known
        }
        fetched += msgs.length;
        pageToken = l.nextPageToken || null;
        if (oldestMs !== Infinity) state.seedOldestMs = oldestMs; // CHECKPOINT: date cursor
        state.seedFetched = fetched;
        state.lastSyncAt = Date.now();
        await this._saveState(w, state);
        if (!msgs.length) break;
      } while (pageToken && fetched < want);
      // seed complete → switch to incremental from the seed-start historyId
      state.historyId = state.seedHistoryId;
      delete state.seedOldestMs; delete state.seedPageToken; delete state.seedFetched; delete state.seedHistoryId; delete state.seedTotal;
      state.lastSyncAt = Date.now();
      await this._saveState(w, state);
      this._progress(w, null);
      return;
    }

    // Incremental: ids gathered from history.list above → download them.
    const todo = [...new Set(ids)].filter((id) => !seen.has(id)); // round 3: an id history lists twice is fetched ONCE (so on the incremental road too)
    if (todo.length) this._progress(w, todo.length, 0);
    let done = 0;
    for (const id of todo) {
      if (w.stopped) return;
      await this._writeGone404(w, id, seen);
      this._progress(w, todo.length, ++done);
    }
    this._progress(w, null);

    state.historyId = newHistoryId;
    state.lastSyncAt = Date.now();
    await this._saveState(w, state);
  }

  _writer() { return this._storeWriter || require('./store-writer.js').storeWriter(); }
  /** B-574d: the cursor as the store writer knows it — its OWED bytes (a write not landed yet) first, then the file */
  _readState(w) { const fp = this._statePath(w), W = this._writer(), owed = W && typeof W.owed === 'function' ? W.owed(fp) : null; return JSON.parse(owed != null ? owed : fs.readFileSync(fp, 'utf-8')); }
  /** B-574d slice «channels-small-stores» (lane nl-journals, 主开发 r4939): THE POLL'S CURSOR THROUGH THE STORE WRITER — its thread writes,
   *  syncs and renames it off the hub's loop. NOTHING is handed when the cursor did not move (`cursorKey`). The pass WAITS for the landing
   *  (off the loop, the writer's own bound) before it is done — so a person who empties the folder after a pass never gets the old cursor
   *  written back into it, as with the release's write at the call. → a promise of the landing (false: not on disk; kept owed, retried) */
  _saveState(w, state) {
    const key = cursorKey(state);
    if (w._savedCursor === key) return Promise.resolve(true);
    w._savedCursor = key;
    const fp = this._statePath(w), bytes = JSON.stringify(state), W = this._writer();
    W.dirty(fp, { name: 'gmail-state.write', produce: () => bytes });
    return Promise.resolve(W.durable(fp)).catch(() => false);
  }

  // _writeMessage, but a GONE message (404) is skipped instead of failing the
  // whole pass. history.list reports messages ADDED since the cursor — some are
  // already deleted by fetch time (spam auto-purge, discarded drafts; guaranteed
  // on an unfiltered mailbox with includeSpamTrash). The cursor only advances
  // after a COMPLETE pass, so one dead id used to re-list + re-404 every retry —
  // the sync froze at done=0 forever (real report: 增量卡住3小时).
  async _writeGone404(w, id, seen) {
    try { return await this._writeMessage(w, id, seen); }
    catch (e) { if (e.code === 404) { seen.add(id); return null; } throw e; }
  }

  // Download ONE message as a .eml into the (possibly grouped) folder + mark seen.
  async _writeMessage(w, id, seen) {
    const msg = await this._api(w, `/messages/${id}?format=raw`);
    const raw = Buffer.from(String(msg.raw || ''), 'base64url');
    const head = raw.subarray(0, 8192).toString('binary').replace(/\r?\n[ \t]/g, ' ');
    const subj = decodeHeaderWord((/^Subject:\s*(.*)$/im.exec(head) || [])[1] || '').trim();
    const slug = subj.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'no-subject';
    const d = new Date(Number(msg.internalDate) || Date.now());
    const stamp = d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const iso = d.toISOString();
    const ls = msg.labelIds || [];
    const labelDir = ls.includes('SPAM') ? 'Spam' : ls.includes('TRASH') ? 'Trash'
      : ls.includes('DRAFT') ? 'Drafts' : ls.includes('INBOX') ? 'Inbox'
      : ls.includes('SENT') ? 'Sent' : 'Archive';
    const g = w.cfg.groupBy;
    const sub = g === 'month' ? iso.slice(0, 7)
      : g === 'day' ? iso.slice(0, 10)
      : g === 'label-month' ? path.join(labelDir, iso.slice(0, 7))
      : g === 'label-day' ? path.join(labelDir, iso.slice(0, 10))
      : '';
    const destDir = sub ? path.join(w.cfg.dir, sub) : w.cfg.dir;
    fs.mkdirSync(destDir, { recursive: true });
    const tmp = path.join(destDir, `.tmp-${id}`);
    // B-ddf3 (THE LAW of B-9275: a file's new bytes are on disk before its name points at them): the message's file NAME is its
    // «seen» mark, so an empty copy after a power loss would stay empty for good. Written, synced ONCE at its end and renamed on
    // the thread pool (never the hub's loop); a failed write or sync is said by name, nothing renamed, the message not marked seen
    // (the next pass fetches it again).
    let h = null, fault = null;
    try { h = await fs.promises.open(tmp, 'w'); await h.writeFile(raw); await h.sync(); } catch (e) { fault = e; }
    if (h) { try { await h.close(); } catch (e) { fault = fault || e; } }   // a failed close is a failed copy too, said below
    if (fault) {
      await fs.promises.unlink(tmp).catch(() => { });
      throw new Error(`gmail: message ${id} could not be put on disk (${fault.code || fault.message}) — not saved, fetched again on the next pass`);
    }
    await fs.promises.rename(tmp, path.join(destDir, `${stamp}_${slug}_${id}.eml`));
    seen.add(id);
    w.count = seen.size;
    return Number(msg.internalDate) || null;
  }
}

module.exports = { GmailSync, keepSignIn, signInClient, pruneSignIns };
