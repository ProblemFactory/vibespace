// PLUGIN CLIENT (Plugin Ph2 minimal, 2.369.24 — docs/design-harness-plugins.md §3).
// Fetches the server's validated manifests and turns every enabled iframe-tier
// plugin's `contributes.windows[]` into a registered WINDOW TYPE (Ph1
// registry): the window is a sandboxed iframe (opaque origin — the same
// posture as published pages; never allow-same-origin) served from
// /plugins/<id>/<entry>, plus a tiny postMessage bridge (api version 1):
//   iframe → host : { vsp:'ready' }                          host → { vsp:'init', pluginId, windowId, api:1, dark }
//   iframe → host : { vsp:'storage', op:'get'|'set'|'del', k, v }   host → { vsp:'storage', k, v|null }   (localStorage, namespaced vsp_<id>_)
//   iframe → host : { vsp:'notify', text }                   host shows a toast (text only — never HTML)
//   iframe → host : { vsp:'close' }                          host closes the window
// Multi-client: `plugins-manifests-updated` re-fetches and registers new kinds.
import { registerWindowType, svgIcon16 } from './window-types.js';
import { fetchJson, showToast } from './utils.js';

export const PLUGIN_ICON = svgIcon16('<path d="M6 2h4v2.5a1.5 1.5 0 0 0 3 0V2h1v4h-2.5a1.5 1.5 0 0 0 0 3H14v5H9v-2.5a1.5 1.5 0 0 0-3 0V14H2V9h2.5a1.5 1.5 0 0 0 0-3H2V2h4z"/>');
const IFRAME_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-downloads';

export class PluginClient {
  constructor(app) {
    this.app = app;
    this.manifests = [];
    this._registered = new Set();
    app.ws?.onGlobal?.((m) => { if (m?.type === 'plugins-manifests-updated') this.apply(m.plugins); });
    this.refresh();
  }

  async refresh() {
    const r = await fetchJson('/api/plugins/manifests');
    if (!r || r.error) return;
    this.apply(r.plugins || []);
  }

  apply(list) {
    this.manifests = Array.isArray(list) ? list : [];
    for (const w of this.contributedWindows()) this._register(w);
  }

  /** Every window an ENABLED iframe-tier plugin contributes. */
  contributedWindows() {
    const out = [];
    for (const m of this.manifests) {
      if (!m?.enabled || !m.valid || m.client !== 'iframe') continue;
      for (const w of m.contributes?.windows || []) out.push({ pluginId: m.id, windowId: w.id, title: w.title, entry: w.entry, icon: m.icon || null, type: `plugin:${m.id}:${w.id}`, action: `openPlugin:${m.id}:${w.id}` });
    }
    return out;
  }

  _register(w) {
    if (this._registered.has(w.type)) return;
    this._registered.add(w.type);
    registerWindowType({
      type: w.type, label: w.title, icon: PLUGIN_ICON, persist: true,
      action: w.action,
      replay: (app, spec, { syncId } = {}) => this.open(spec.pluginId || w.pluginId, spec.windowId || w.windowId, { syncId }),
    });
  }

  open(pluginId, windowId, { syncId } = {}) {
    const w = this.contributedWindows().find((x) => x.pluginId === pluginId && x.windowId === windowId);
    if (!w) { showToast(`Plugin window not available: ${pluginId}/${windowId}`, { type: 'error' }); return null; }
    const app = this.app;
    app._hideWelcome?.();
    const openSpec = { action: w.action, pluginId, windowId };
    const winInfo = app.wm.createWindow({ title: w.title, type: w.type, syncId, openSpec });
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', IFRAME_SANDBOX);
    iframe.setAttribute('title', w.title);
    iframe.style.cssText = 'flex:1;border:none;width:100%;height:100%;background:var(--bg)';
    iframe.src = `/plugins/${encodeURIComponent(pluginId)}/${w.entry}`;
    const prefix = `vsp_${pluginId}_`;
    const onMessage = (e) => {
      if (e.source !== iframe.contentWindow || !e.data || typeof e.data !== 'object') return;
      const d = e.data;
      const reply = (msg) => { try { iframe.contentWindow.postMessage(msg, '*'); } catch { } }; // opaque origin ⇒ '*' is the only addressable target; payloads carry nothing sensitive
      if (d.vsp === 'ready') reply({ vsp: 'init', pluginId, windowId, api: 1, dark: !/light/i.test(document.documentElement.getAttribute('data-theme') || '') });
      else if (d.vsp === 'storage') {
        const k = prefix + String(d.k || '');
        try {
          if (d.op === 'set') localStorage.setItem(k, String(d.v ?? ''));
          else if (d.op === 'del') localStorage.removeItem(k);
          reply({ vsp: 'storage', k: String(d.k || ''), v: localStorage.getItem(k) });
        } catch { reply({ vsp: 'storage', k: String(d.k || ''), v: null }); }
      } else if (d.vsp === 'notify') showToast(String(d.text || '').slice(0, 300), { type: ['error', 'warn', 'success'].includes(d.kind) ? d.kind : 'info' });
      else if (d.vsp === 'close') app.wm?.closeWindow?.(winInfo.id);
    };
    window.addEventListener('message', onMessage, winInfo._listenerCtl?.signal ? { signal: winInfo._listenerCtl.signal } : undefined);
    if (!winInfo._listenerCtl) { const prevClose = winInfo.onClose; winInfo.onClose = () => { window.removeEventListener('message', onMessage); prevClose?.(); }; }
    (winInfo.content || winInfo.body || winInfo.el?.querySelector('.window-content'))?.append(iframe);
    return winInfo;
  }
}

export function installPluginClient(app) {
  app.pluginClient = new PluginClient(app);
  return app.pluginClient;
}
