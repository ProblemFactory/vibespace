'use strict';
// THIS INSTANCE'S OWN PUBLIC ADDRESS — one resolver, one publisher (2.367.0,
// owner request: "端口映射的地方加入一个把整个vibespace映射一个frp url的地方吧,
// 映射之后所有需要'本机url'的地方就默认使用那个url, 但不要覆盖原来的设置").
//
// TWO JOBS, deliberately in one module:
//
// 1. RESOLVE. Several places need "the URL a machine OUTSIDE this box uses to
//    reach this VibeSpace": reverse mounts (machine-mounts), remote agent
//    installs (mounts-plugins-wiring), the agentd auto-graduation gate, and
//    published-page share links. They each read `agentd.publicUrl` inline.
//    `url()` is now the single reader, and it LAYERS the frp mapping over the
//    setting instead of writing to it: publish → everything uses the relay
//    URL; unpublish → everything falls straight back to whatever the setting
//    said, because the setting was never touched (the owner's explicit
//    requirement, and the reason this is an override and not a "save").
//
// 2. PUBLISH. `plugins.frpPublish('vibespace-instance', PORT, …)` already
//    existed — but as an INVISIBLE side effect of installing a remote agent
//    over the relay, with no record and no UI. Two callers publishing the same
//    frp proxy name would fight over one relay proxy, so this module is the
//    ONLY publisher of it; the agent-install path calls ensurePublished().
//
// EXPLICIT vs AUTO is load-bearing. A user pressing "Publish" in the Ports
// panel sets `desired` and THAT url outranks the setting. An agent install
// publishing the instance so a remote box can dial home is `auto`: recorded
// and shown, but it does NOT silently become the instance's public address —
// a side effect must not repoint everyone's share links.
//
// SAFETY: publishing puts the whole app on the public internet, so it is
// REFUSED while auth is disabled — an unauthenticated VibeSpace reachable from
// anywhere is remote code execution as the owner, not a convenience. The
// refusal names the fix (turn on a password / SSO first).
const fs = require('fs');
const path = require('path');
const HOLD = require('../store-read-hold.js');   // r3009 (B-f276 family): instance-url.json under THE STORE-READ LAW
const SR = require('../store-read.js');

const PROXY_NAME = 'vibespace-instance';
const SUB_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

// B-574d «mounts-and-forwards» (主开发 r4751, lane nl-mounts): a SYNCED replace through the tree's one door (src/fd-close.js
// renameSynced) — written on a person's Publish / Unpublish or the publish's own rare event, never at a cadence; a failed sync or close
// is a failed write thrown to save (said there; the temp removed, the old file stands); only a file system with no sync at all lands,
// said once a run
let noSyncSaid = false;
function writeJsonAtomic(file, obj) {
  require('../fd-close.js').renameSynced(file + '.tmp', file, JSON.stringify(obj, null, 2), { where: 'instance-url.json', say: (w) => { if (!noSyncSaid) { noSyncSaid = true; console.warn(`[instance-url] ${w}`); } } });
}

function create({ dataDir, plugins, port, serverSetting, httpsUrl = () => null, authEnabled = () => true, broadcast = () => { }, log = () => { } }) {
  const file = path.join(dataDir, 'instance-url.json');
  let state = { desired: false, auto: false, sub: null, url: null, proto: null, at: null, error: null };
  // r3009 (B-f276 family, lane bl-machines-a): THE STORE-READ LAW (src/store-read-hold.js). The release read ANY failure as «not
  // published», and the next write — a Publish or Unpublish, an agent install's ensurePublished (which MINTS an address), a failed
  // restore — wrote over the file: the person's «Publish this VibeSpace» and its subdomain gone. HELD: the status says why, Publish
  // and Unpublish are refused by name, ensurePublished mints nothing, nothing is written over the file, the boot's restore waits and
  // runs at the lift; nothing removes by its silence (the relay's proxy is unpublished only by a person's Unpublish); it is read again
  // off the loop; torn bytes are kept aside once per content, then it starts as not published
  let restoreAsked = null, tornCopy = null;
  const SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const hold = HOLD.create({
    file, valid: SHAPE, code: 'instance_url_unread', aside: (mark) => file + '.corrupt-' + mark,
    words: (h) => `instance-url.json in VibeSpace's data folder could not be read (${h.code}); VibeSpace reads it again every few minutes. The published address is not lost: nothing is written over it, and Publish and Unpublish wait until it reads.`,
    log: (m) => log('[instance-url] ' + m),
    onLift: (v, f) => { Object.assign(state, v || {}); tornCopy = (f && f.setAside) || null; emit(); if (restoreAsked) { const o = restoreAsked; restoreAsked = null; restore(o); } },   // r3104: torn bytes — the copy's base name kept for the panel
  });
  { let read; try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; } const a = SR.storeAnswer(read, { valid: SHAPE }); if (hold.start(a) === 'data') Object.assign(state, a.value || {}); }
  let healTimer = null, nextTry = null;   // nextTry: the running restore cycle's next attempt (null = no cycle)

  const save = () => { if (!hold.writable('a publish change')) return; try { writeJsonAtomic(file, state); } catch (e) { log('[instance-url] persist failed: ' + e.message); } };   // r3009: held ⇒ nothing written over the file
  const settingUrl = () => { try { return String(serverSetting('agentd.publicUrl') || '').trim() || null; } catch { return null; } };
  const envUrl = () => String(process.env.VIBESPACE_PUBLIC_URL || '').trim() || null;
  // the relay's state through the manager's relay door (whichever plugin DECLARES 'relay' — src/plugins.js relayStatus). A read
  // that FAILED is named, never read as «not configured» (lane fleet-instance-publish: from 2.369.214 every read was
  // status(undefined) — a `providerId` the object server.js hands this module never had — and the catch said «not configured»)
  const frp = () => { if (!plugins) return null; try { return plugins.relayStatus(); } catch (e) { return { readError: String((e && e.message) || e) }; } };

  /** The effective address + WHERE it came from. An `auto` publish is visible
   *  but never outranks the configured setting (see the header). */
  function effective() {
    if (state.url && state.desired) return { url: state.url.replace(/\/+$/, ''), source: 'frp' };
    const s = settingUrl();
    if (s) return { url: s.replace(/\/+$/, ''), source: 'setting' };
    const e = envUrl();
    if (e) return { url: e.replace(/\/+$/, ''), source: 'env' };
    // lane https-tailscale: the hub's own https address (src/server/tls.js) while its certificate is live — after
    // everything the operator declared, before an auto publish; the auto-graduation gate does not count it (server.js)
    const h = (() => { try { return httpsUrl() || null; } catch { return null; } })();
    if (h) return { url: h.replace(/\/+$/, ''), source: 'https' };
    if (state.url) return { url: state.url.replace(/\/+$/, ''), source: 'frp-auto' };
    return { url: null, source: null };
  }
  const url = () => effective().url;
  // THE OPERATOR'S ADDRESS (B-f55a): the effective address only when the operator declared it — an explicit Publish (frp),
  // agentd.publicUrl, VIBESPACE_PUBLIC_URL — else null. The hub's own https address and an automatic relay publish
  // (frp-auto, a side effect: see the header) never are. Auto-graduation dials machines back to THIS (server.js), so a
  // side effect never moves a machine onto the public relay.
  const OPERATOR_SOURCES = new Set(['frp', 'setting', 'env']);
  const operatorUrl = () => { const e = effective(); return OPERATOR_SOURCES.has(e.source) ? e.url : null; };

  function status() {
    const f = frp() || {};
    const eff = effective();
    return {
      frpConfigured: !!f.configured, frpMissing: f.missing || [], frpVaultLocked: !!f.vaultLocked, frpReadError: f.readError || null, subDomainHost: f.subDomainHost || null,
      authEnabled: !!authEnabled(),
      published: !!state.url, desired: !!state.desired, auto: !!state.auto,
      url: state.url || null, sub: state.sub || f.selfDialSub || null, at: state.at || null, error: state.error || null,
      settingUrl: settingUrl(), envUrl: envUrl(),
      effectiveUrl: eff.url, source: eff.source, httpsUrl: (() => { try { return httpsUrl() || null; } catch { return null; } })(),
      held: hold.words(),   // r3009: instance-url.json held (unread, never «not published») — the words a person reads
      torn: tornCopy,   // r3104: torn bytes lifted as «not published» — where they are kept (base name); never «restore it»
    };
  }

  // In-process listeners (2.369.30): the plugin loader regenerates its agent-
  // tool shims when the effective address changes — they bake the URL as the
  // call-back fallback. Fired on every emit (publish/unpublish/restore/error).
  const listeners = new Set();
  const onChange = (fn) => { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => {
    try { broadcast({ type: 'instance-url', status: status() }); } catch { }
    for (const fn of listeners) { try { fn(status()); } catch (e) { log('[instance-url] listener failed: ' + e.message); } }
  };

  /** Publish this VibeSpace's own port through the frp relay. */
  async function doPublish({ sub } = {}) {
    if (!plugins) throw new Error('public URLs are not available on this instance');
    const f = frp() || {};
    if (f.readError) throw new Error(`the relay's state could not be read (${f.readError})`);
    // a LOCKED vault holding the relay's only key goes on to the plugin: its refusal names the lock (and the vault notes it)
    if (!f.configured && !f.vaultLocked) throw new Error(`the frp relay is not configured on this instance${(f.missing || []).length ? ' (missing: ' + f.missing.join(', ') + ')' : ''}`);
    if (sub !== undefined && sub !== null && String(sub).length) {
      if (!SUB_RE.test(String(sub))) throw new Error('subdomain must be lowercase letters/digits/hyphens');
      state.sub = String(sub);
    }
    const preferSub = state.sub || f.selfDialSub || '';
    // our own server speaks plaintext http locally; the relay terminates TLS
    const r = await plugins.frpPublish(PROXY_NAME, Number(port), { preferSub, proto: 'http' });
    if (!r || !r.url) throw new Error('the relay did not return a URL');
    state.url = r.url; state.proto = r.proto || 'http'; state.at = Date.now(); state.error = null;
    if (r.subdomain) { state.sub = r.subdomain; try { plugins.setSelfDialSub?.(r.subdomain); } catch { } }
    save();
    return state.url;
  }

  /** The user pressed Publish: this address now speaks for the instance. */
  async function publish({ sub } = {}) {
    hold.refuse('publishing this VibeSpace');   // r3009: held — refused by name, nothing written
    if (!authEnabled()) throw new Error('publishing the whole instance would expose it to the internet with NO login — turn on a password or SSO in Settings first');
    const u = await doPublish({ sub });
    state.desired = true; state.auto = false;
    save(); emit();
    return { url: u, status: status() };
  }

  /** Publish only because something needs a dial-back address (agent install).
   *  Records + shows it, but stays `auto` so it cannot repoint share links. */
  async function ensurePublished() {
    hold.refuse('publishing this VibeSpace for a machine');   // r3174: held — a NAMED refusal (the release's null became the text «null» at the pairing road: a device minted with a dial address of «null»)
    if (state.url) return state.url;
    const u = await doPublish({});
    if (!state.desired) state.auto = true;
    save(); emit();
    return u;
  }

  async function unpublish() {
    hold.refuse('unpublishing this VibeSpace');   // r3009: held — refused by name, the relay's proxy left as it is
    try { if (plugins) await plugins.frpUnpublish(PROXY_NAME); } catch (e) { log('[instance-url] unpublish: ' + e.message); }
    // the SUBDOMAIN is kept: republishing should land on the same URL
    state.url = null; state.proto = null; state.desired = false; state.auto = false; state.at = null; state.error = null;
    save(); emit();
    return { status: status() };
  }

  /** Boot: a mapping the user asked for must come back by itself. The relay /
   *  frpc may not be up yet, so failures retry instead of silently vanishing.
   *  ONE cycle at a time; `ifFailed` (the vault's unlock — lane fleet-instance-publish) re-tries only a restore that FAILED:
   *  a cycle waiting on its timer has its next try pulled forward, none running ⇒ a new cycle. */
  function restore({ retries = 6, delayMs = 20000, firstMs = 3000, ifFailed = false } = {}) {
    if (hold.held()) { restoreAsked = restoreAsked && !restoreAsked.ifFailed ? restoreAsked : { retries, delayMs, firstMs, ifFailed }; return; }   // r3174: the STRONGER ask kept (a vault unlock's «only if it failed» never replaces the start's)   // r3009: held — unread, not «not desired»: the restore runs at the lift
    if (!state.desired) return;
    if (ifFailed && !state.error) return;
    if (nextTry) { if (healTimer) { clearTimeout(healTimer); healTimer = setTimeout(nextTry, firstMs); } return; }
    // The persisted URL is NOT cleared: frpc is its own long-lived process, so
    // the mapping usually outlives a VibeSpace restart. We re-assert it anyway
    // (writing the proxy config is idempotent) and only a FAILURE is news.
    let left = retries;
    const attempt = nextTry = async () => {
      healTimer = null;
      if (!state.desired) { nextTry = null; return; }   // unmapped while the cycle waited
      try {
        await doPublish({});
        nextTry = null;
        emit();
        log(`[instance-url] republished ${state.url}`);
      } catch (e) {
        state.error = e.message; save(); emit();
        if (--left > 0) healTimer = setTimeout(attempt, delayMs);
        else { nextTry = null; log('[instance-url] gave up republishing: ' + e.message); }
      }
    };
    healTimer = setTimeout(attempt, firstMs);
  }
  const stop = () => { if (healTimer) { clearTimeout(healTimer); healTimer = null; } nextTry = null; };

  function registerRoutes(app) {
    app.get('/api/instance-url', (req, res) => res.json(status()));
    app.post('/api/instance-url/publish', async (req, res) => {
      try { res.json(await publish({ sub: req.body?.sub })); }
      catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // B-1217 its round: the relay's code (the page words it); r3174: the store's own status (503 while instance-url.json is held)
    });
    app.delete('/api/instance-url/publish', async (req, res) => {
      try { res.json(await unpublish()); }
      catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // r3174: the store's own status (503 while instance-url.json is held)
    });
  }

  return { url, effective, operatorUrl, status, publish, ensurePublished, unpublish, restore, stop, registerRoutes, onChange, PROXY_NAME, _hold: hold };
}

module.exports = { create, PROXY_NAME };
