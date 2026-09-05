// Plugins dialog (2.140.0, B-2d44) — ⚙ → Plugins…: install / start / guided
// login / status for host-level plugins (first: Tailscale). Modeled on the
// Manage-Agents visual language; the login flow mirrors guided Drive OAuth
// (server captures the auth URL, user opens it, we poll status until Running).
import { createModalShell, fetchJson, showToast, showConfirmDialog, escHtml, copyText } from './utils.js';
import { t } from './i18n.js';

export function installPluginsUI(App) {
  Object.assign(App.prototype, {
  async openPluginsDialog({ container } = {}) {
    // rail mode: render into the sidebar panel instead of a modal (one source)
    if (!container && !this.isMobile && this.sidebar?._railEl) { this.sidebar.toggle?.(true); this.sidebar._railGo?.('plugins'); return; }
    const shell = container ? { body: container, close: () => {} } : createModalShell({ id: 'plugins-dialog', title: t('Plugins'), bodyClass: 'mounts-dialog-body', escapeToClose: true });
    // rail panel: same body class as the modal so one stylesheet serves both
    if (container) container.classList.add('mounts-dialog-body');
    const { body, close } = shell;
    body.innerHTML = `<div class="empty-hint">${escHtml(t('Loading…'))}</div>`;
    let pollTimer = null;
    const cleanup = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };

    const render = async () => {
      const r = await fetchJson('/api/plugins');
      if (!r?.plugins) {
        // dead end otherwise: the panel stays on this line until the user
        // navigates away and back (fetchJson can't throw, so nothing retries)
        body.innerHTML = `<div class="empty-hint">${escHtml(r?.error || t('Could not load plugins — the server did not answer.'))}</div>`;
        const again = document.createElement('button');
        again.className = 'mounts-btn'; again.textContent = t('Retry');
        again.onclick = () => { body.innerHTML = `<div class="empty-hint">${escHtml(t('Loading…'))}</div>`; render(); };
        body.appendChild(again);
        return;
      }
      body.innerHTML = '';
      for (const p of r.plugins) {
        const card = document.createElement('div');
        card.className = 'plugin-card';
        const running = !!p.running;
        const isFrp = p.id === 'frp';
        const stateTxt = isFrp
          ? (p.configured === false ? t('relay not configured on this instance')
            : running ? t('connected') : p.installed ? t('stopped') : t('not installed'))
          : p.mode === 'system' ? t('managed by the system (outside VibeSpace)')
            : running ? (p.backendState === 'Running' ? t('connected') : (p.backendState || t('starting…')))
              : p.installed ? t('stopped') : t('not installed');
        const dot = `<span class="plugin-dot ${isFrp ? (running ? 'ok' : '') : (running && p.backendState === 'Running' ? 'ok' : running ? 'warn' : '')}"></span>`;
        let detail = '';
        if (isFrp && p.configured) detail += `<div class="plugin-detail">${escHtml(t('Relay'))}: <code>${escHtml(p.server || '')}</code> · ${escHtml(t('publishes forwarded ports to {host}', { host: p.publicHost }))}</div>`;
        if (isFrp && p.configured === false) {
          // Name the MISSING field (2.227.10) — "not configured" alone sent a
          // user in circles while only the token was blank.
          const miss = (p.missing || []).map((k) => ({ serverAddr: t('relay address'), token: t('relay token') }[k] || k));
          const why = miss.length ? t('Missing: {fields} — fill it in below (or set VIBESPACE_FRPS_ADDR/_PORT/_TOKEN).', { fields: miss.join(', ') })
            : t('Set VIBESPACE_FRPS_ADDR / _PORT / _TOKEN (the shared relay) to enable public URLs.');
          detail += `<div class="plugin-detail plugin-cfg-warn">${escHtml(why)}</div>`;
        }
        if (p.self?.ips?.length) detail += `<div class="plugin-detail">${escHtml(t('Tailnet address'))}: <code>${escHtml(p.self.ips[0])}</code>${p.self.dnsName ? ` · ${escHtml(p.self.dnsName.replace(/\.$/, ''))}` : ''}${p.peers ? ` · ${escHtml(t('{n} peers', { n: p.peers }))}` : ''}</div>`;
        if (running && p.mode === 'userspace') detail += `<div class="plugin-detail">${escHtml(t('Userspace mode — reach tailnet hosts through SOCKS5 localhost:{port} (no tun device in this container)', { port: p.socksPort }))}</div>`;
        if (running && p.mode === 'kernel') detail += `<div class="plugin-detail">${escHtml(t('Kernel mode — full tunnel, tailnet hosts reachable directly'))}</div>`;
        card.innerHTML = `
          <div class="plugin-head">
            <div class="plugin-name">${dot}${escHtml(p.label)}</div>
            <div class="plugin-state">${escHtml(stateTxt)}</div>
          </div>
          <div class="plugin-desc">${escHtml(t(p.description))}</div>
          ${detail}
          <div class="plugin-actions"></div>
          <div class="plugin-auth"></div>
          <div class="plugin-config"></div>`;
        const actions = card.querySelector('.plugin-actions');
        const authBox = card.querySelector('.plugin-auth');
        const cfgBox = card.querySelector('.plugin-config');
        const btn = (label, cls, fn, { rerender = true } = {}) => {
          const b = document.createElement('button');
          b.className = 'mounts-btn' + (cls ? ' ' + cls : '');
          b.textContent = label;
          b.onclick = async () => {
            b.disabled = true;
            try { await fn(); } catch (e) { showToast(e.message || t('Failed'), { type: 'error' }); }
            b.disabled = false;
            if (rerender) render(); // login skips this — a re-render wipes the auth-URL box it just filled
          };
          actions.appendChild(b);
          return b;
        };
        // fetchJson resolves NULL on a network failure / non-JSON error page —
        // an `x?.error` check alone passed that through as SUCCESS, so clicking
        // Install against an unreachable server toasted "Installed" with
        // nothing installed (Start/Stop/boot-toggle silently no-op'd the same
        // way, and the re-render just showed the unchanged state).
        const api = (pathTail, opts) => fetchJson(`/api/plugins/${p.id}/${pathTail}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...opts })
          .then((x) => { if (!x) throw new Error(t('Server unreachable — nothing was changed')); if (x.error) throw new Error(x.error); return x; });

        // frp: no login/mode/flags. The relay config fields (below) always
        // show so the user can enter/override the relay; install/start appear
        // only once a relay is configured (env default or user-entered).
        if (p.mode !== 'system') {
          if (isFrp && !p.configured) {
            // no relay yet — show only the config fields (added after actions)
          } else if (!p.installed) {
            btn(t('Install'), 'mounts-btn-primary', async () => {
              showToast(t('Downloading {name}…', { name: p.label }));
              await api('install');
              showToast(t('Installed'));
            });
          } else if (!running) {
            btn(t('Start'), 'mounts-btn-primary', () => api('start'));
          } else {
            if (!isFrp && p.backendState !== 'Running') {
              const loginBtn = btn(t('Log in…'), 'mounts-btn-primary', async () => {
                const res = await api('login');
                if (res.done) { showToast(t('Already connected')); render(); return; }
                if (res.pending) { loginBtn.textContent = t('Waiting for the sign-in page…'); return; }
                if (res.authUrl) {
                  authBox.innerHTML = `<div class="mounts-field-hint">${escHtml(t('Open this link, approve the device, then come back — the status updates by itself:'))}</div>
                    <div class="plugin-auth-url"><a href="${escHtml(res.authUrl)}" target="_blank" rel="noopener">${escHtml(res.authUrl)}</a>
                    <button class="mounts-btn plugin-copy">${escHtml(t('Copy'))}</button></div>`;
                  authBox.querySelector('.plugin-copy').onclick = () => copyText(res.authUrl).then(() => showToast(t('Copied')));
                  if (!pollTimer) pollTimer = setInterval(async () => {
                    if (!body.isConnected) { cleanup(); return; } // dialog closed — stop polling
                    const st = await fetchJson(`/api/plugins/${p.id}/status`);
                    if (st?.backendState === 'Running') { cleanup(); showToast(t('Connected to the tailnet')); render(); }
                  }, 3000);
                }
              }, { rerender: false });
            }
            btn(t('Stop'), '', async () => {
              const ok = await showConfirmDialog(t('Stop {name}?', { name: p.label }), isFrp
                ? t('Public URLs from this instance will stop working until you start it again.')
                : t('Tailnet connections from this instance will drop. The login persists — starting again reconnects without re-auth.'));
              if (ok) await api('stop');
            });
          }
          // enable-at-boot toggle
          const lbl = document.createElement('label');
          lbl.className = 'plugin-boot';
          const cb = document.createElement('input');
          cb.type = 'checkbox'; cb.checked = !!p.enabled;
          // a failed save must not leave the box showing a setting the server
          // never took — put it back where it was and say why
          cb.onchange = () => api('enabled', { body: JSON.stringify({ enabled: cb.checked }) })
            .catch((e) => { cb.checked = !!p.enabled; showToast(e.message, { type: 'error' }); });
          lbl.append(cb, document.createTextNode(' ' + t('Start automatically with the server')));
          actions.appendChild(lbl);

          // ── frp relay config (editable — the cluster injects defaults, the
          //    user can override any of it) ──
          if (isFrp) {
            const cfg = p.config || {};
            const row = (label, key, val, ph, isPw) => {
              const r = document.createElement('div'); r.className = 'plugin-cfg-row';
              const inp = document.createElement('input'); inp.className = 'plugin-cfg-flags'; inp.type = isPw ? 'password' : 'text';
              inp.value = val || ''; inp.placeholder = ph || ''; inp.dataset.key = key;
              r.append(Object.assign(document.createElement('span'), { className: 'plugin-cfg-label', textContent: label }), inp);
              cfgBox.appendChild(r); return inp;
            };
            const iAddr = row(t('Relay address'), 'serverAddr', cfg.serverAddr, t('relay host'));
            const iPort = row(t('Relay port'), 'serverPort', cfg.serverPort, '7000');
            const iTok = row(t('Relay token'), 'token', cfg.hasToken ? '••••••••' : '', t('shared secret'), true);
            const iSub = row(t('Subdomain host (optional)'), 'subDomainHost', cfg.subDomainHost, t('example.com → https://<random>.example.com'));
            const saveRow = document.createElement('div'); saveRow.className = 'plugin-cfg-row';
            const save = document.createElement('button'); save.className = 'mounts-btn'; save.textContent = t('Save config');
            save.onclick = async () => {
              const body = { serverAddr: iAddr.value, serverPort: iPort.value, subDomainHost: iSub.value };
              // untouched mask = keep the stored override; anything else —
              // including an EMPTIED field — is sent verbatim ('' clears the
              // override back to the cluster env default, same as the other
              // fields; the mask-only guard made the token unclearable)
              if (iTok.value !== '••••••••') body.token = iTok.value;
              try { await api('config', { body: JSON.stringify(body) }); showToast(t('Saved')); render(); } catch (e) { showToast(e.message, { type: 'error' }); }
            };
            saveRow.appendChild(save);
            if (p.fromEnv) saveRow.append(Object.assign(document.createElement('span'), { className: 'plugin-cfg-hint', textContent: t('defaults come from the cluster — edit to override') }));
            cfgBox.appendChild(saveRow);
          }

          // ── Networking mode + extra flags (advanced config) — tailscale only ──
          if (!isFrp && p.installed) {
            const modes = [
              ['auto', t('Auto')],
              ['kernel', t('Kernel (full tunnel)')],
              ['userspace', t('Userspace (proxy only)')],
            ];
            const modeRow = document.createElement('div');
            modeRow.className = 'plugin-cfg-row';
            const modeSel = document.createElement('select');
            modeSel.className = 'plugin-cfg-select';
            for (const [v, l] of modes) { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === (p.modePref || 'auto')) o.selected = true; modeSel.appendChild(o); }
            modeSel.onchange = async () => {
              try { await api('mode', { body: JSON.stringify({ mode: modeSel.value }) }); showToast(running ? t('Switching mode — reconnecting…') : t('Mode saved')); setTimeout(render, running ? 2500 : 0); }
              catch (e) { showToast(e.message, { type: 'error' }); }
            };
            modeRow.append(Object.assign(document.createElement('span'), { className: 'plugin-cfg-label', textContent: t('Networking') }), modeSel);
            if (p.modePref === 'kernel' && !p.tunUsable) modeRow.append(Object.assign(document.createElement('span'), { className: 'plugin-cfg-warn', textContent: t('no usable /dev/net/tun — will fail') }));
            else if ((p.modePref || 'auto') === 'auto') modeRow.append(Object.assign(document.createElement('span'), { className: 'plugin-cfg-hint', textContent: p.tunUsable ? t('→ kernel (tun available)') : t('→ userspace (no tun)') }));
            cfgBox.appendChild(modeRow);

            const flagRow = document.createElement('div');
            flagRow.className = 'plugin-cfg-row';
            const flagInput = document.createElement('input');
            flagInput.className = 'plugin-cfg-flags';
            flagInput.placeholder = '--advertise-routes=10.0.0.0/24 --hostname=my-instance --ssh';
            flagInput.value = p.upFlags || '';
            flagInput.title = t('Extra `tailscale up` flags — applied on the next Log in / mode change. Reachability flags we manage (--socket/--tun/--accept-routes/proxy) are ignored.');
            const flagSave = document.createElement('button');
            flagSave.className = 'mounts-btn'; flagSave.textContent = t('Save flags');
            flagSave.onclick = async () => { try { await api('config', { body: JSON.stringify({ upFlags: flagInput.value }) }); showToast(t('Flags saved — re-run Log in to apply')); } catch (e) { showToast(e.message, { type: 'error' }); } };
            flagRow.append(Object.assign(document.createElement('span'), { className: 'plugin-cfg-label', textContent: t('tailscale up flags') }), flagInput, flagSave);
            cfgBox.appendChild(flagRow);
          }
        }
        body.appendChild(card);
      }
      await renderManifestPlugins(body);
    };
    // ── MANIFEST PLUGINS (Plugin Ph2, 2.369.24): data/plugins/<id>/ folders ──
    const renderManifestPlugins = async (parent) => {
      const r = await fetchJson('/api/plugins/manifests');
      const list = r?.plugins || [];
      const sec = document.createElement('div');
      sec.className = 'plugin-manifests';
      const head = document.createElement('div');
      head.className = 'plugin-head plugin-manifests-head';
      head.innerHTML = `<b>${escHtml(t('Installed plugins'))}</b> <span class="plugin-cfg-hint">${escHtml(t('a folder under data/plugins/<id>/ with vibespace-plugin.json — see docs/examples/hello-plugin'))}</span>`;
      const reload = document.createElement('button');
      reload.className = 'mounts-btn'; reload.textContent = t('Rescan');
      reload.onclick = async () => { const rr = await fetchJson('/api/plugins/manifests/reload', { method: 'POST' }); if (rr?.error) showToast(rr.error, { type: 'error' }); render(); };
      head.appendChild(reload);
      sec.appendChild(head);
      if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-hint'; empty.textContent = t('No plugins installed. Copy docs/examples/hello-plugin to data/plugins/example.hello and Rescan.');
        sec.appendChild(empty);
      }
      for (const p of list) {
        const card = document.createElement('div');
        card.className = 'plugin-card plugin-manifest-card';
        const stateTxt = !p.valid ? t('invalid') : !p.enabled ? t('disabled') : p.server ? ({ running: t('running'), starting: t('starting…'), crashed: t('crashed — restarting'), parked: t('parked after repeated crashes'), stopped: t('stopped'), error: t('error') }[p.state] || p.state) : t('enabled');
        const dot = `<span class="plugin-dot ${!p.valid ? 'err' : (p.enabled ? (p.state === 'running' || !p.server ? 'ok' : 'warn') : '')}"></span>`;
        const wins = (p.contributes?.windows || []).map((w) => `<button class="mounts-btn plugin-open-win" data-plugin="${escHtml(p.id)}" data-win="${escHtml(w.id)}"${p.enabled ? '' : ' disabled'}>${escHtml(w.title)}</button>`).join(' ');
        const tools = (p.contributes?.agentTools || []).map((tl) => `<code>vibespace-tool-${escHtml(p.id)}-${escHtml(tl.name)}</code>`).join(' ');
        card.innerHTML = `
          <div class="plugin-head">${dot}<b>${escHtml(p.id)}</b> <span class="plugin-ver">${escHtml(p.version || '')}</span> <span class="plugin-state">${escHtml(stateTxt)}</span></div>
          ${p.description ? `<div class="plugin-detail">${escHtml(p.description)}</div>` : ''}
          ${p.errors?.length ? `<div class="plugin-detail plugin-cfg-warn">${escHtml(p.errors.join(' · '))}</div>` : ''}
          ${p.warnings?.length ? `<div class="plugin-detail plugin-cfg-hint">${escHtml(p.warnings.join(' · '))}</div>` : ''}
          ${p.lastError ? `<div class="plugin-detail plugin-cfg-warn">${escHtml(p.lastError)}</div>` : ''}
          ${tools ? `<div class="plugin-detail">${escHtml(t('Agent tools'))}: ${tools}</div>` : ''}
          <div class="plugin-detail plugin-manifest-actions">${wins}</div>`;
        const actions = card.querySelector('.plugin-manifest-actions');
        const toggle = document.createElement('button');
        toggle.className = 'mounts-btn'; toggle.textContent = p.enabled ? t('Disable') : t('Enable'); toggle.disabled = !p.valid;
        toggle.onclick = async () => {
          const rr = await fetchJson(`/api/plugins/manifests/${encodeURIComponent(p.id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: !p.enabled }) });
          if (rr?.error) { showToast(rr.error, { type: 'error' }); return; }
          showToast(p.enabled ? t('Plugin disabled') : t('Plugin enabled'));
          this.pluginClient?.refresh?.();
          render();
        };
        actions.prepend(toggle);
        for (const b of card.querySelectorAll('.plugin-open-win')) b.onclick = () => { this.pluginClient?.open?.(b.dataset.plugin, b.dataset.win); close(); };
        sec.appendChild(card);
      }
      parent.appendChild(sec);
    };
    await render();
  },
  });
}
