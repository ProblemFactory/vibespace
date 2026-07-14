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

class GmailSync {
  constructor({ presets, onProgress } = {}) {
    this._presets = presets || (() => []);
    this._onProgress = onProgress || (() => { });
    this._workers = new Map(); // mount id → worker
    this._auth = null;         // one guided OAuth flow at a time (like drive)
  }

  // ── OAuth (loopback + paste-back, mirrors the Drive flow UX) ──

  _client({ clientId, clientSecret, clientPreset } = {}) {
    if (clientId && clientSecret) return { clientId, clientSecret };
    const list = this._presets();
    const pick = clientPreset ? list.find((c) => c.key === clientPreset)
      : (list.length === 1 ? list[0] : list.find((c) => c.key === 'default'));
    if (pick) return { clientId: pick.clientId, clientSecret: pick.clientSecret };
    throw new Error('Gmail needs an OAuth client — pick a preset or provide a custom client id/secret (there is no built-in fallback client for Gmail)');
  }

  startAuth(opts = {}) {
    this.cancelAuth();
    const client = this._client(opts);
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
    const r = await fetch(TOKEN_URL, { method: 'POST', body });
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
    this._auth = null;
  }

  // ── Sync workers (one per mounted gmail record) ──

  /** cfg: {id, dir, token (json str), clientId?, clientSecret?, clientPreset?,
   *        syncCount, labelIds (csv), query, pollSeconds} */
  start(cfg) {
    this.stop(cfg.id);
    const w = {
      cfg, state: 'syncing', error: null, count: 0, lastSyncAt: 0,
      tok: JSON.parse(cfg.token), stopped: false, timer: null,
    };
    try { w.count = this._seenIds(w).size; } catch { }
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
    w.progress = total == null ? null : { total, done };
    // throttled broadcast → the storage card's live progress bar
    const now = Date.now();
    if (total == null || now - (this._lastProg || 0) > 400) { this._lastProg = now; try { this._onProgress(); } catch { } }
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
      const delay = (w.state === 'error' ? 120 : (w.cfg.pollSeconds || 300)) * 1000;
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
    const r = await fetch(TOKEN_URL, { method: 'POST', body });
    const d = await r.json();
    if (!r.ok) throw new Error('token refresh failed: ' + (d.error_description || d.error || r.status) + (d.error === 'invalid_grant' ? ' — re-authorize this Gmail mount' : ''));
    w.tok.access_token = d.access_token;
    w.tok.expiry = Date.now() + (d.expires_in || 3600) * 1000;
    return d.access_token;
  }

  async _api(w, pathq) {
    const tok = await this._accessToken(w);
    const r = await fetch(API + pathq, { headers: { Authorization: 'Bearer ' + tok } });
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

  _seenIds(w) {
    // message ids ride in the filename tail: …_<id>.eml — the directory tree
    // IS the dedup index (no separate DB to drift). One subdir level covers
    // the date-grouping layouts (YYYY-MM/ or YYYY-MM-DD/); files already in
    // the flat root keep counting after grouping is turned on (no re-download).
    const seen = new Set();
    const scan = (dir, depth) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory() && depth < 2 && !e.name.startsWith('.')) scan(path.join(dir, e.name), depth + 1);
        else { const m = /_([a-f0-9]{8,20})\.eml$/.exec(e.name); if (m) seen.add(m[1]); }
      }
    };
    scan(w.cfg.dir, 0);
    return seen;
  }

  async _syncOnce(w) {
    fs.mkdirSync(w.cfg.dir, { recursive: true });
    let state = {};
    try { state = JSON.parse(fs.readFileSync(this._statePath(w), 'utf-8')); } catch { }
    const seen = this._seenIds(w);
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
      // Seed/reseed: newest N matching messages; syncCount 0 = EVERYTHING
      // (hard runaway cap 200k — ~11h of quota-paced fetching at worst)
      const n = Number(w.cfg.syncCount);
      const want = n === 0 ? 200000 : Math.max(1, Math.min(200000, n || 200));
      let pageToken = null;
      while (ids.length < want) {
        const p = qs();
        p.set('maxResults', String(Math.min(500, want - ids.length)));
        if (pageToken) p.set('pageToken', pageToken);
        const l = await this._api(w, '/messages?' + p);
        ids.push(...(l.messages || []).map((m) => m.id));
        pageToken = l.nextPageToken;
        if (!pageToken || !(l.messages || []).length) break;
      }
      const prof = await this._api(w, '/profile');
      newHistoryId = prof.historyId;
    }

    const todo = ids.filter((id) => !seen.has(id));
    if (todo.length) this._progress(w, todo.length, 0);
    let done = 0;
    for (const id of todo) {
      if (w.stopped) return;
      const msg = await this._api(w, `/messages/${id}?format=raw`);
      const raw = Buffer.from(String(msg.raw || ''), 'base64url');
      // filename: sortable date + subject slug + id (id = the dedup key)
      const head = raw.subarray(0, 8192).toString('binary').replace(/\r?\n[ \t]/g, ' ');
      const subj = decodeHeaderWord((/^Subject:\s*(.*)$/im.exec(head) || [])[1] || '').trim();
      const slug = subj.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'no-subject';
      const d = new Date(Number(msg.internalDate) || Date.now());
      const stamp = d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      // grouping (user option — one flat dir hits fs limits and explorer
      // pain at 10^5+ mails): none | month | day | label-month | label-day.
      // Label layouts put each mail under ONE folder by Gmail's own
      // precedence (a message carries many labels; "archived" = no INBOX).
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
      fs.writeFileSync(tmp, raw);
      fs.renameSync(tmp, path.join(destDir, `${stamp}_${slug}_${id}.eml`));
      seen.add(id);
      w.count = seen.size;
      this._progress(w, todo.length, ++done);
    }
    this._progress(w, null);

    state.historyId = newHistoryId;
    state.lastSyncAt = Date.now();
    fs.writeFileSync(this._statePath(w), JSON.stringify(state));
  }
}

module.exports = { GmailSync };
