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

const PROXY_NAME = 'vibespace-instance';
const SUB_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function writeJsonAtomic(file, obj) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2));
  fs.renameSync(file + '.tmp', file);
}

function create({ dataDir, plugins, port, serverSetting, authEnabled = () => true, broadcast = () => { }, log = () => { } }) {
  const file = path.join(dataDir, 'instance-url.json');
  let state = { desired: false, auto: false, sub: null, url: null, proto: null, at: null, error: null };
  try { Object.assign(state, JSON.parse(fs.readFileSync(file, 'utf-8')) || {}); } catch { }
  let healTimer = null;

  const save = () => { try { writeJsonAtomic(file, state); } catch (e) { log('[instance-url] persist failed: ' + e.message); } };
  const settingUrl = () => { try { return String(serverSetting('agentd.publicUrl') || '').trim() || null; } catch { return null; } };
  const envUrl = () => String(process.env.VIBESPACE_PUBLIC_URL || '').trim() || null;
  const frp = () => { try { return plugins ? plugins.status('frp') : null; } catch { return null; } };

  /** The effective address + WHERE it came from. An `auto` publish is visible
   *  but never outranks the configured setting (see the header). */
  function effective() {
    if (state.url && state.desired) return { url: state.url.replace(/\/+$/, ''), source: 'frp' };
    const s = settingUrl();
    if (s) return { url: s.replace(/\/+$/, ''), source: 'setting' };
    const e = envUrl();
    if (e) return { url: e.replace(/\/+$/, ''), source: 'env' };
    if (state.url) return { url: state.url.replace(/\/+$/, ''), source: 'frp-auto' };
    return { url: null, source: null };
  }
  const url = () => effective().url;

  function status() {
    const f = frp() || {};
    const eff = effective();
    return {
      frpConfigured: !!f.configured, frpMissing: f.missing || [], subDomainHost: f.subDomainHost || null,
      authEnabled: !!authEnabled(),
      published: !!state.url, desired: !!state.desired, auto: !!state.auto,
      url: state.url || null, sub: state.sub || f.selfDialSub || null, at: state.at || null, error: state.error || null,
      settingUrl: settingUrl(), envUrl: envUrl(),
      effectiveUrl: eff.url, source: eff.source,
    };
  }

  const emit = () => { try { broadcast({ type: 'instance-url', status: status() }); } catch { } };

  /** Publish this VibeSpace's own port through the frp relay. */
  async function doPublish({ sub } = {}) {
    if (!plugins) throw new Error('public URLs are not available on this instance');
    const f = frp() || {};
    if (!f.configured) throw new Error(`the frp relay is not configured on this instance${(f.missing || []).length ? ' (missing: ' + f.missing.join(', ') + ')' : ''}`);
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
    if (!authEnabled()) throw new Error('publishing the whole instance would expose it to the internet with NO login — turn on a password or SSO in Settings first');
    const u = await doPublish({ sub });
    state.desired = true; state.auto = false;
    save(); emit();
    return { url: u, status: status() };
  }

  /** Publish only because something needs a dial-back address (agent install).
   *  Records + shows it, but stays `auto` so it cannot repoint share links. */
  async function ensurePublished() {
    if (state.url) return state.url;
    const u = await doPublish({});
    if (!state.desired) state.auto = true;
    save(); emit();
    return u;
  }

  async function unpublish() {
    try { if (plugins) await plugins.frpUnpublish(PROXY_NAME); } catch (e) { log('[instance-url] unpublish: ' + e.message); }
    // the SUBDOMAIN is kept: republishing should land on the same URL
    state.url = null; state.proto = null; state.desired = false; state.auto = false; state.at = null; state.error = null;
    save(); emit();
    return { status: status() };
  }

  /** Boot: a mapping the user asked for must come back by itself. The relay /
   *  frpc may not be up yet, so failures retry instead of silently vanishing. */
  function restore({ retries = 6, delayMs = 20000 } = {}) {
    if (!state.desired) return;
    // The persisted URL is NOT cleared: frpc is its own long-lived process, so
    // the mapping usually outlives a VibeSpace restart. We re-assert it anyway
    // (writing the proxy config is idempotent) and only a FAILURE is news.
    let left = retries;
    const attempt = async () => {
      try {
        await doPublish({});
        emit();
        log(`[instance-url] republished ${state.url}`);
      } catch (e) {
        state.error = e.message; save(); emit();
        if (--left > 0) healTimer = setTimeout(attempt, delayMs);
        else log('[instance-url] gave up republishing: ' + e.message);
      }
    };
    healTimer = setTimeout(attempt, 3000);
  }
  const stop = () => { if (healTimer) { clearTimeout(healTimer); healTimer = null; } };

  function registerRoutes(app) {
    app.get('/api/instance-url', (req, res) => res.json(status()));
    app.post('/api/instance-url/publish', async (req, res) => {
      try { res.json(await publish({ sub: req.body?.sub })); }
      catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.delete('/api/instance-url/publish', async (req, res) => {
      try { res.json(await unpublish()); }
      catch (e) { res.status(400).json({ error: e.message }); }
    });
  }

  return { url, effective, status, publish, ensurePublished, unpublish, restore, stop, registerRoutes, PROXY_NAME };
}

module.exports = { create, PROXY_NAME };
