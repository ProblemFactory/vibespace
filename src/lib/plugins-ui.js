// Plugins dialog (2.140.0, B-2d44) — ⚙ → Plugins…: install / start / guided
// login / status for host-level plugins (first: Tailscale). Modeled on the
// Manage-Agents visual language; the login flow mirrors guided Drive OAuth
// (server captures the auth URL, user opens it, we poll status until Running).
import { createModalShell, fetchJson, showToast, showConfirmDialog, showContextMenu, escHtml, copyText } from './utils.js';
import { BACKEND_META } from './agent-meta.js';
import { t } from './i18n.js';
import { renderVoiceSheet } from './voice-plugin-card.js'; // the Voice row's 「待处理 N」 sheet: Connect + the proposal cards
import { pluginCategoryOf } from './settings-schema.js';
import { decisionLineOf, paintDecisionLine, liveDecisionLine } from './decision-readout.js'; // lane decision-spend-readout: the judge's money as the row's second line

// lane decision-vendor-hygiene: the LLM plugin row's STOPS (decision-model rowStopOf — no call until the key or the
// model changes): the chip says which, its title says what to do. `s` = the engine's status().stop {why, status, at}.
const DECISION_STOP_WORDS = Object.freeze({
  reconnect: (s) => [t('stopped — key refused'), t('Reconnect: the provider refused this key (HTTP {status}).', { status: s.status })],
  plan: () => [t('stopped — plan refused'), t('The LLM plugin stopped: the provider says the plan does not allow this model (HTTP 402). Change the judging model in Settings › Plugins › LLM or the key in ⚙ → System → Integrations & keys.')],
  shape: () => [t('stopped — model refused'), t('The LLM plugin stopped: the model refused the request shape (HTTP 400). Change the judging model in Settings › Plugins › LLM or the key in ⚙ → System → Integrations & keys.')],
});

// lane plugin-settings-p0 (owner 2026-10-13, the VS Code plugin model — docs/design-plugin-settings.zh.md): the
// Plugins sidebar is a plain LIST — one row per plugin: name · one-line description · status chip · on/off switch ·
// [install / uninstall] · ⚙ (opens All Settings at the plugin's section). Every configuration row lives in All
// Settings (src/plugin-settings.js); keys stay in Services › Integrations. A chip that has something waiting (Voice
// proposals, a Tailscale sign-in, a manifest plugin's windows) opens it — an action door, never settings.
// lane relay-token-per-instance (design q-051, the owner's decision 2026-10-20): THE RELAY IDENTITY — the instance logs in
// to the relay with its OWN token (data/relay-token.json, not the vault), bound to its own public names. The row's readout
// says which identity and what the relay answered; its chip opens the doors (mint / rotate / revoke / the shared token).
// The status never carries the token: the registration line holds its sha256 only.
const RELAY_LOGIN_WORDS = Object.freeze({
  unknown_instance: () => t('waiting for the relay admin to register it'),
  bad_token: () => t('the relay holds another token — send the registration line again'),
  revoked: () => t('the relay revoked it — mint a new token'),
  knock_refused: () => t('the relay refused the shared token'),
  legacy_token_retired: () => t('the relay no longer takes the shared token'),
});
/** the relay row's readout line (null = nothing to say) */
function relayFactWords(r) {
  if (!r) return null;
  if (r.kind === 'cluster') return t('Logs in with the cluster\'s relay token as {user}', { user: r.user || '' });
  if (r.kind === 'cluster-unnamed') return t('The cluster\'s relay token is set but this pod has no name (VIBESPACE_INSTANCE_NAME)');
  if (r.kind === 'revoked') return t('Relay token revoked — mint a new one');
  if (r.kind !== 'instance') return null;
  const parts = [t('Own relay token')];   // its id is the sheet's (the row is narrow)
  if (r.login && r.login.ok) parts.push(t('the relay knows it'));
  else if (r.login && RELAY_LOGIN_WORDS[r.login.code]) parts.push(RELAY_LOGIN_WORDS[r.login.code]());
  if (r.knock === 'locked') parts.push(t('the shared token waits for the vault'));
  return parts.join(' · ');
}
function relayFact(r) {
  const w = relayFactWords(r);
  return w ? Object.assign(document.createElement('div'), { className: 'plugin-row-fact', textContent: w }) : null;
}
/** the relay chip's sheet: the identity, its names, the line(s) for the relay admin, the doors */
function relaySheet(p, api, rerender) {
  const r = p.relay || {};
  const { body, close } = createModalShell({ id: 'relay-identity', title: t('Relay identity'), bodyClass: 'mounts-dialog-body', escapeToClose: true });
  const knockWords = r.retired ? t('no longer sent — it left this instance') : { on: t('sent while the relay\'s grace lasts'), locked: t('waits for the vault (sent once it is unlocked)'), off: t('no longer sent — the relay takes this instance\'s own token alone'), none: t('none') }[r.knock] || '';
  const names = [...(r.prefixes || []).map((x) => x + '…'), ...(r.subdomains || [])].join(' · ');
  const lines = Array.isArray(r.lines) ? r.lines : [];
  body.innerHTML = `<div class="mounts-field-hint">${escHtml(t('This instance logs in to the relay with its own token, bound to its own public names. The token is kept on this instance (not in the vault), so a restart re-publishes without the second password; a stolen token reaches these public names only.'))}</div>
    ${r.kind === 'cluster' || r.kind === 'cluster-unnamed' ? `<div class="mounts-field-hint">${escHtml(relayFactWords(r) || '')}</div>` : `
    <div class="mounts-field-hint">${escHtml(t('Instance'))}: <code>${escHtml(r.instanceId || t('none yet'))}</code>${r.label ? ' · ' + escHtml(r.label) : ''}</div>
    <div class="mounts-field-hint">${escHtml(t('Public names'))}: ${escHtml(names || '—')}</div>
    <div class="mounts-field-hint">${escHtml(t('Shared relay token'))}: ${escHtml(knockWords)}</div>
    ${lines.map((l, i) => `<div class="plugin-auth-url"><code>${escHtml(l)}</code> <button class="mounts-btn" data-copy="${i}">${escHtml(t('Copy'))}</button></div>`).join('')}
    ${lines.length ? `<div class="mounts-field-hint">${escHtml(t('Send this line to the relay admin: it carries a fingerprint (sha256) of the token, never the token.'))}</div>` : ''}
    <div class="plugin-relay-doors"></div>`}`;
  body.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => copyText(lines[Number(b.dataset.copy)]).then(() => showToast(t('Copied'))); });
  const doors = body.querySelector('.plugin-relay-doors');
  if (!doors) return;
  const go = (op, done) => api('config', { body: JSON.stringify({ relay: op }) }).then(() => { showToast(done); close(); rerender(); }).catch((e) => showToast(e.message || t('Failed'), { type: 'error' }));
  const door = (label, fn, danger = false) => { const b = document.createElement('button'); b.className = 'mounts-btn' + (danger ? ' mounts-btn-danger' : ''); b.textContent = label; b.onclick = fn; doors.append(b); };
  if (r.kind === 'none' || r.kind === 'revoked') door(r.kind === 'revoked' ? t('Mint a new token') : t('Mint'), () => go('mint', t('Relay token minted — send its line to the relay admin')));
  if (r.kind === 'instance') {
    door(t('Rotate'), () => go('rotate', t('Relay token rotated — send its line to the relay admin')));
    door(t('Revoke…'), async () => {
      const ok = await showConfirmDialog({ title: t('Revoke the relay token?'), message: t('This instance stops using its relay token at once and its public URLs stop until you mint a new one. Send the revoke line to the relay admin so the relay refuses the old token too.'), confirmText: t('Revoke'), danger: true });
      if (ok) go('revoke', t('Relay token revoked'));
    }, true);
    if (!r.retired && (r.knock === 'on' || r.knock === 'locked')) door(t('The relay no longer asks the shared token'), () => go('upgraded', t('The shared relay token is no longer sent')));
    if (!r.retired && r.knock === 'off') door(t('Send the shared token again'), () => go('knock', t('The shared relay token is sent again')));
  }
}
/** the on/off switch (role=switch over a checkbox): the row's one toggle */
function makeSwitch(on, { disabled = false, label, onChange }) {
  const l = document.createElement('label');
  l.className = 'plugin-sw';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.setAttribute('role', 'switch'); cb.checked = !!on; cb.disabled = !!disabled;
  cb.setAttribute('aria-label', label);
  cb.onchange = () => onChange(cb.checked, cb);
  l.append(cb, Object.assign(document.createElement('span'), { className: 'plugin-sw-track' }));
  l.title = label;
  return l;
}
/** one list row: icon dot · name + description [+ a readout line] · chip · switch · [install] · ⚙ — `fact` is a READOUT
 *  (a drawn element, not a control: the LLM plugin's money today, lane decision-spend-readout), under the description */
function pluginRow({ id, label, description, tone, chip, chipTitle, onChip, sw, install, gear, fact = null }) {
  const row = document.createElement('div');
  row.className = 'plugin-row'; row.dataset.plugin = id;
  const main = document.createElement('div'); main.className = 'plugin-row-main';
  main.append(Object.assign(document.createElement('div'), { className: 'plugin-row-name', textContent: label }), Object.assign(document.createElement('div'), { className: 'plugin-row-desc', textContent: description || '' }));
  if (fact) main.appendChild(fact);
  main.title = description || '';
  const c = document.createElement(onChip ? 'button' : 'span');
  c.className = 'plugin-chip' + (tone ? ' plugin-chip-' + tone : ''); c.textContent = chip; c.title = chipTitle ? `${chip} · ${chipTitle}` : chip; // the narrow rail clips the chip — its whole word on hover
  if (onChip) c.onclick = onChip;
  const dot = Object.assign(document.createElement('span'), { className: 'plugin-dot' + (tone === 'ok' ? ' ok' : tone === 'warn' ? ' warn' : tone === 'err' ? ' err' : '') });
  row.append(dot, main, c, sw);
  if (install) row.appendChild(install);
  row.appendChild(gear);
  return row;
}

// How long we wait for a just-enabled background service to answer before we
// hand the pending user action back anyway (the keeper's own boot budget is
// 20s; a serve that is still coming up reports 'starting', never a spinner
// that never ends).
const SERVICE_START_WAIT_MS = 25000;

/** A built-in plugin row (GET /api/plugins) declares what it provides — 'relay' / 'tunnel' / 'serve' (its
 *  src/plugins/<id>.js `provides`). Every client gate reads that declaration, never a plugin id. */
const provides = (p, cap) => Array.isArray(p?.provides) && p.provides.includes(cap);
/** a running tunnel's DNS line (lane tailscale-plugin-pod-dns): the server's verdict (PURE src/tailscale-dns.js) in words */
const tunnelDnsWords = (d) => d.acceptDns ? t('DNS: Tailscale MagicDNS')
  : d.rewritten ? t('DNS: Tailscale still holds /etc/resolv.conf — turn Tailscale off and on to restore it')
    : d.why === 'cluster' || d.why === 'cluster-resolver' ? t('DNS: the cluster resolver (Tailscale names resolve through the plugin)')
      : t('DNS: this machine\'s resolver (Tailscale names resolve through the plugin)');
/** Is a CONFIGURED plugin providing `cap` on this instance (e.g. 'relay' = public URLs)? The ONE probe the
 *  ports surfaces ask (rv-client F9: it was spelled twice, by id). An unreachable server answers false. */
export async function pluginProvides(cap) {
  return (await pluginState(cap)).ok;
}
/** The same probe with WHY not (lane vault-e2e-password-fix-r2): `{ ok, vaultLocked }` — a provider whose secret the LOCKED
 *  vault keeps closed (frp's sealed relay token) says the vault's sentence, never "not configured". */
export async function pluginState(cap) {
  const ps = (((await fetchJson('/api/plugins')) || {}).plugins || []).filter((p) => provides(p, cap));
  return { ok: ps.some((p) => p.configured), vaultLocked: !ps.some((p) => p.configured) && ps.some((p) => p.vaultLocked) };
}

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
      const list = document.createElement('div'); list.className = 'plugin-list';
      body.appendChild(list);
      for (const p of r.plugins) {
        // the row follows the plugin's DECLARED capability (src/plugins/<id>.js `provides`), never its id
        const running = !!p.running;
        const isRelay = provides(p, 'relay');
        const isServe = provides(p, 'serve'), isTunnel = provides(p, 'tunnel'), isDictation = provides(p, 'dictation'), isDecision = provides(p, 'decision');
        const api = (pathTail, opts) => fetchJson(`/api/plugins/${p.id}/${pathTail}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...opts })
          .then((x) => { if (!x) throw new Error(t('Server unreachable — nothing was changed')); if (x.error) throw new Error(x.error); return x; });
        const act = async (fn) => { try { await fn(); } catch (e) { showToast(e.message || t('Failed'), { type: 'error' }); } render(); };
        let chip, tone = '', chipTitle = '', onChip = null, swOn = !!p.enabled, swDisabled = false, onSwitch, install = null, fact = null;
        if (isDecision) {
          const d = p.decision || {};
          const L = decisionLineOf(p);   // ONE PURE line (decision-model decisionTodayLine): the money is drawn, not hidden in a title
          const stopW = p.enabled && d.stop && DECISION_STOP_WORDS[d.stop.why] ? DECISION_STOP_WORDS[d.stop.why](d.stop) : null;   // [chip, title]
          chip = !p.enabled ? t('turned off') : stopW ? stopW[0] : p.configured ? t('on · {provider}', { provider: d.providerLabel || '' }) : t('on — no provider key yet');
          tone = stopW ? 'warn' : p.enabled && p.configured ? 'ok' : p.enabled ? 'warn' : '';
          chipTitle = L.text + (stopW ? ' · ' + stopW[1] : '');
          onSwitch = (on) => act(() => api('enabled', { body: JSON.stringify({ enabled: on }) }));
          fact = Object.assign(document.createElement('div'), { className: 'plugin-row-fact' }); fact.dataset.decisionToday = '1';
          liveDecisionLine(fact, (x) => paintDecisionLine(fact, x, 'short'), { first: p });   // patched in place every 60 s while drawn
        } else if (isDictation) {
          let waiting = 0;
          if (p.configured) { const v = await fetchJson('/api/voice/teach'); waiting = (v && Array.isArray(v.proposals)) ? v.proposals.length : 0; }
          // lane dropline-connect-door (a fleet user's report 2026-10-18): with no key and no sign-in the chip is THE DOOR — the
          // verb, like Tailscale's 「Log in…」, never a status sentence nobody guesses opens a sign-in; the sheet it opens is the same
          // lane vault-e2e-password-fix-r2: a sign-in the LOCKED vault keeps closed — the vault's door, never "connect"
          chip = p.vaultLocked ? t('The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)') : !p.configured ? t('Connect with Fish Audio') : waiting ? t('{n} waiting', { n: waiting }) : p.enabled ? t('on') : t('turned off');
          tone = p.vaultLocked ? 'warn' : !p.configured ? 'primary' : waiting ? 'warn' : p.running ? 'ok' : '';
          if (!p.configured && !p.vaultLocked) chipTitle = t('or paste a Dropline key in Services › Integrations');
          onChip = p.vaultLocked ? () => window.dispatchEvent(new CustomEvent('vs-vault-door')) : () => this._voiceSheet(p, render);
          swDisabled = !p.configured;
          onSwitch = (on) => act(() => api('enabled', { body: JSON.stringify({ enabled: on }) }));
        } else if (isServe) {
          chip = !p.installed ? t('the opencode CLI is not installed')
            : p.parkedKind === 'runaway' ? t('stopped as a runaway')
              : p.parkedKind === 'blocked' ? t('blocked by a serve we could not identify')
                : p.parked ? t('parked after repeated crashes')
                  : running ? t('running on 127.0.0.1:{port}', { port: p.port || '?' }) : p.starting ? t('starting…') : t('turned off');
          tone = running ? 'ok' : p.parked ? 'err' : p.starting ? 'warn' : '';
          chipTitle = p.envForced === true ? t('Forced ON by the environment (VIBESPACE_OPENCODE_SERVE=1) — the switch below is ignored on this instance.')
            : p.envForced === false ? t('Forced OFF by the environment (VIBESPACE_OPENCODE_SERVE=0) — the switch below is ignored on this instance.') : (p.reason || '');
          swDisabled = (p.envForced !== null && p.envForced !== undefined) || !p.installed;
          // ONE switch: the server keeps enabled and desiredUp together (on = start now AND on every boot)
          onSwitch = (on) => act(() => api('enabled', { body: JSON.stringify({ enabled: on }) }));
        } else {
          // relay (frp) / tunnel (Tailscale): on = start now + at boot; off = stop (said first) + not at boot
          const loginNeeded = isTunnel && running && p.backendState !== 'Running';
          chip = p.mode === 'system' ? t('managed by the system (outside VibeSpace)')
            : isRelay && p.vaultLocked ? t('The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)')   // lane vault-e2e-password-fix-r2: the sealed relay token
            : isRelay && p.configured === false ? t('relay not configured on this instance')
              : loginNeeded ? t('Log in…') : running ? t('connected') : p.installed ? t('stopped') : t('not installed');
          tone = running && !loginNeeded ? 'ok' : loginNeeded ? 'warn' : '';
          if (isRelay && p.vaultLocked) { tone = 'warn'; onChip = () => window.dispatchEvent(new CustomEvent('vs-vault-door')); }
          else if (isRelay && p.configured === false) {
            const miss = (p.missing || []).map((k) => ({ serverAddr: t('relay address'), token: t('relay token') }[k] || k));
            chipTitle = miss.length ? t('Missing: {fields} — set it in the plugin\'s settings (⚙), or set VIBESPACE_FRPS_ADDR/_PORT/_TOKEN.', { fields: miss.join(', ') }) : t('Set VIBESPACE_FRPS_ADDR / _PORT / _TOKEN (the shared relay) to enable public URLs.');
            onChip = () => this._openPluginSettings(p.id);
          } else if (isRelay && p.configured) chipTitle = t('publishes forwarded ports to {host}', { host: p.publicHost || '' });
          if (isRelay && p.relay && !p.vaultLocked && (p.configured || p.relay.kind !== 'none')) { onChip = () => relaySheet(p, api, render); fact = relayFact(p.relay); }   // lane relay-token-per-instance
          if (loginNeeded) onChip = () => this._tailscaleLogin(p, api, render);
          if (p.self?.ips?.length) chipTitle = `${t('Tailnet address')}: ${p.self.ips[0]}`;
          if (isTunnel && running && p.dns) fact = Object.assign(document.createElement('div'), { className: 'plugin-row-fact', textContent: tunnelDnsWords(p.dns) });
          swOn = !!p.enabled || running; swDisabled = p.mode === 'system' || !p.installed || (isRelay && p.configured === false);
          onSwitch = async (on, cb) => {
            if (!on) {
              // verify-r6 D1: an OPTIONS OBJECT (two positional strings rendered a blank "Confirm / OK" dialog)
              const ok = await showConfirmDialog({
                title: t('Stop {name}?', { name: p.label }),
                message: isRelay ? t('Public URLs from this instance will stop working until you start it again.') : t('Tailnet connections from this instance will drop. The login persists — starting again reconnects without re-auth.'),
                confirmText: t('Stop'),
                danger: true,
              });
              if (!ok) { cb.checked = true; return; }
              return act(async () => { await api('enabled', { body: JSON.stringify({ enabled: false }) }); if (running) await api('stop'); });
            }
            return act(async () => { await api('enabled', { body: JSON.stringify({ enabled: true }) }); if (!running) await api('start'); });
          };
          if (!p.installed && p.mode !== 'system' && !(isRelay && p.configured === false)) {
            install = document.createElement('button'); install.className = 'mounts-btn plugin-install'; install.textContent = t('Install');
            install.onclick = () => act(async () => { showToast(t('Downloading {name}…', { name: p.label })); await api('install'); showToast(t('Installed')); });
          }
        }
        list.appendChild(pluginRow({ id: p.id, label: p.label, description: t(p.description), tone, chip, chipTitle, onChip,
          sw: makeSwitch(swOn, { disabled: swDisabled, label: t('Turn {name} on or off', { name: p.label }), onChange: (on, cb) => onSwitch(on, cb) }),
          install, fact, gear: this._pluginGear(p.id, p.label) }));
      }
      await renderManifestPlugins(body);
    };
    // ── MANIFEST PLUGINS (Plugin Ph2 2.369.24; Ph4 2.369.30 consent / install / update / uninstall) ──
    const enablePlugin = async (p, { trusted = false } = {}) => {
      const rr = await fetchJson(`/api/plugins/manifests/${encodeURIComponent(p.id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: true, trusted }) });
      if (rr?.consentRequired && !trusted) { const okc = await this._pluginConsentDialog(p, rr.capabilities); if (okc) return enablePlugin(p, { trusted: true }); return; }
      if (rr?.error) { showToast(rr.error, { type: 'error' }); return; }
      showToast(trusted ? t('Plugin enabled (trusted)') : t('Plugin enabled'));
      this.pluginClient?.refresh?.();
      render();
    };
    const renderManifestPlugins = async (parent) => {
      const r = await fetchJson('/api/plugins/manifests');
      const list = r?.plugins || [];
      const sec = document.createElement('div');
      sec.className = 'plugin-manifests';
      const head = document.createElement('div');
      head.className = 'plugin-head plugin-manifests-head';
      head.innerHTML = `<b>${escHtml(t('Installed plugins'))}</b> <span class="plugin-cfg-hint">${escHtml(t('a folder under data/plugins/<id>/ with vibespace-plugin.json — see docs/plugins.md'))}</span>`;
      const installBtn = document.createElement('button');
      installBtn.className = 'mounts-btn'; installBtn.textContent = t('Install plugin…');
      installBtn.onclick = () => this._pluginInstallDialog(() => { this.pluginClient?.refresh?.(); render(); });
      const reload = document.createElement('button');
      reload.className = 'mounts-btn'; reload.textContent = t('Rescan');
      reload.onclick = async () => { const rr = await fetchJson('/api/plugins/manifests/reload', { method: 'POST' }); if (rr?.error) showToast(rr.error, { type: 'error' }); this.pluginClient?.refresh?.(); render(); };
      head.append(installBtn, reload);
      sec.appendChild(head);
      if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-hint'; empty.textContent = t('No plugins installed. Use Install plugin… (a folder, a git URL, a .vsp file or a GitHub release) — docs/examples/hello-plugin is the smallest complete one.');
        sec.appendChild(empty);
      }
      const rows = document.createElement('div'); rows.className = 'plugin-list';
      sec.appendChild(rows);
      for (const p of list) {
        const clientErr = this.pluginClient?.errors?.get?.(p.id) || null;
        const chip = !p.valid ? t('invalid') : !p.enabled ? t('disabled') : p.server ? ({ running: t('running'), starting: t('starting…'), crashed: t('crashed — restarting'), parked: t('parked after repeated crashes') }[p.state] || p.state || '') : t('enabled');
        const tone = !p.valid ? 'err' : p.enabled ? (p.state === 'running' || !p.server ? 'ok' : 'warn') : '';
        const why = [...(p.errors || []), p.lastError, p.notice, clientErr ? t('Client module error: {error}', { error: clientErr }) : ''].filter(Boolean).join(' · ');
        // the chip opens what the plugin offers (its windows, what it may do, an update) — actions, never settings
        const onChip = (ev) => {
          const rect = ev.currentTarget.getBoundingClientRect();
          showContextMenu(rect.left, rect.bottom + 2, [
            ...(p.contributes?.windows || []).map((w) => ({ label: t('Open {name}', { name: w.title }), disabled: !p.enabled, action: () => { this.pluginClient?.open?.(p.id, w.id); close(); } })),
            { label: t('Show capabilities…'), action: () => this._pluginConsentDialog(p, null, { readOnly: true }) },
            { label: t('Update'), disabled: !p.install || p.install.source === 'zip', action: async () => {
              showToast(t('Updating {id}…', { id: p.id }));
              const rr = await fetchJson(`/api/plugins/manifests/${encodeURIComponent(p.id)}/update`, { method: 'POST' });
              if (rr?.error) { showToast(rr.error, { type: 'error' }); return; }
              showToast(t('Updated {id} to {version}', { id: p.id, version: rr.plugin?.version || '' }));
              this.pluginClient?.refresh?.(); render();
            } },
          ]);
          ev.stopPropagation();
        };
        const sw = makeSwitch(p.enabled, { disabled: !p.valid, label: t('Turn {name} on or off', { name: p.label || p.id }), onChange: async (on, cb) => {
          if (on) {
            if (p.consentRequired) { const okc = await this._pluginConsentDialog(p); if (!okc) { cb.checked = false; return; } return enablePlugin(p, { trusted: true }); }
            return enablePlugin(p);
          }
          const rr = await fetchJson(`/api/plugins/manifests/${encodeURIComponent(p.id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: false }) });
          if (rr?.error) { showToast(rr.error, { type: 'error' }); cb.checked = true; return; }
          showToast(t('Plugin disabled'));
          this.pluginClient?.refresh?.();
          render();
        } });
        const uninstall = document.createElement('button');
        uninstall.className = 'mounts-btn plugin-install plugin-uninstall'; uninstall.textContent = t('Uninstall…');
        uninstall.onclick = async () => {
          const okd = await showConfirmDialog({ title: t('Uninstall plugin'), message: t('Uninstall "{name}"? Its folder and data move to data/plugins-trash (nothing is deleted).', { name: p.label || p.id }), confirmText: t('Uninstall'), danger: true });
          if (!okd) return;
          const rr = await fetchJson(`/api/plugins/manifests/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
          if (rr?.error) { showToast(rr.error, { type: 'error' }); return; }
          showToast(t('Uninstalled {id} (moved to trash)', { id: p.id }));
          this.pluginClient?.refresh?.(); render();
        };
        rows.appendChild(pluginRow({ id: p.id, label: p.label && p.label !== p.id ? `${p.label} (${p.id})` : p.id, description: p.description || '', tone, chip, chipTitle: [p.version, why].filter(Boolean).join(' · '), onChip,
          sw, install: uninstall, gear: this._pluginGear(p.id, p.label || p.id) }));
      }
      parent.appendChild(sec);
    };
    await render();
  },

  /** the row's ⚙: All Settings at the plugin's section (tree node selected; the phone shows that section alone).
   *  A plugin with no configuration says so instead of opening an empty place. */
  _pluginGear(id, label) {
    const b = document.createElement('button');
    b.className = 'mounts-btn plugin-gear'; b.textContent = '⚙';
    const cat = pluginCategoryOf(id);
    b.disabled = !cat;
    b.title = cat ? t('Open settings') : t('{name} has nothing to configure', { name: label });
    b.setAttribute('aria-label', b.title);
    b.onclick = () => this._openPluginSettings(id);
    return b;
  },
  /** lane foryou-plugin-notices: A PLUGIN'S DOOR — a For-you reminder's body click (the item's `open`, the plugin's
   *  declaration): the plugin's own sheet on the declared panel with the prefill chosen, else its settings row. The sheet
   *  follows the plugin's DECLARED capability (a dictation plugin's sheet holds the teach panel), never its id. */
  async openPluginDoor({ plugin, panel = null, prefill = null } = {}) {
    const p = (((await fetchJson('/api/plugins')) || {}).plugins || []).find((x) => x.id === plugin);
    if (!p) { showToast(t('That plugin is not on this instance any more'), { type: 'error' }); return false; }
    if (panel === 'teach' && provides(p, 'dictation')) { this._voiceSheet(p, () => { }, { focus: prefill }); return true; }
    if (pluginCategoryOf(p.id)) this._openPluginSettings(p.id); else this.openPluginsDialog(); // no settings rows ⇒ the Plugins list, never a click that does nothing
    return true;
  },
  _openPluginSettings(id) {
    const category = pluginCategoryOf(id);
    if (category) this._settingsUI?.open({ category });
  },
  /** the Voice row's chip: Connect with Fish Audio + the proposal cards (an action surface, not settings); `pasteKey` (lane
   *  dropline-connect-door) = the other door — the integration card the plugin row NAMES (`p.integration`), focused */
  _voiceSheet(p, rerender, { focus = null } = {}) {
    const { body, close } = createModalShell({ id: 'voice-sheet', title: p.label, bodyClass: 'mounts-dialog-body', escapeToClose: true });
    const pasteKey = p.integration ? () => { close(); this.openIntegration?.(p.integration); } : null;
    // `focus` (lane foryou-plugin-notices: a For-you reminder's door) = the proposal to land on + its words chosen — the first draw only
    renderVoiceSheet(body, () => { close(); rerender(); this._voiceSheet(p, rerender); }, { pasteKey, focus });
  },
  /** the Tailscale row's 「Log in…」 chip: the guided sign-in (the server captures the auth URL; we poll until Running) */
  async _tailscaleLogin(p, api, rerender) {
    const res = await api('login').catch((e) => { showToast(e.message, { type: 'error' }); return null; });
    if (!res) return;
    if (res.done) { showToast(t('Already connected')); rerender(); return; }
    if (res.pending) { showToast(t('Waiting for the sign-in page…')); return; }
    if (!res.authUrl) return;
    const { body, close } = createModalShell({ id: 'tailscale-login', title: t('Log in…'), escapeToClose: true });
    body.innerHTML = `<div class="mounts-field-hint">${escHtml(t('Open this link, approve the device, then come back — the status updates by itself:'))}</div>
      <div class="plugin-auth-url"><a href="${escHtml(res.authUrl)}" target="_blank" rel="noopener">${escHtml(res.authUrl)}</a>
      <button class="mounts-btn plugin-copy">${escHtml(t('Copy'))}</button></div>`;
    body.querySelector('.plugin-copy').onclick = () => copyText(res.authUrl).then(() => showToast(t('Copied')));
    const timer = setInterval(async () => {
      if (!body.isConnected) { clearInterval(timer); return; }
      const st = await fetchJson(`/api/plugins/${p.id}/status`);
      if (st?.backendState === 'Running') { clearInterval(timer); close(); showToast(t('Connected to the tailnet')); rerender(); }
    }, 3000);
  },

  /** Consent dialog (Plugin Ph4): the plugin's declared capabilities in plain
   *  words — the SAME items the server computes (capabilitySummary) — with
   *  "Enable (trusted)". Resolves true when the owner accepts. readOnly = the
   *  "Show capabilities…" view. `summary` may come from a 409 payload; else fetched. */
  async _pluginConsentDialog(p, summary = null, { readOnly = false } = {}) {
    let items = Array.isArray(summary) ? summary : null;
    let trust = null;
    if (!items) {
      const r = await fetchJson(`/api/plugins/manifests/${encodeURIComponent(p.id)}/capabilities`);
      if (r?.error) { showToast(r.error, { type: 'error' }); return false; }
      items = r.summary || []; trust = r.trust || null;
    }
    return new Promise((resolve) => {
      let decided = false;
      const { body, close } = createModalShell({ id: 'plugin-consent-dialog', title: readOnly ? t('Capabilities of {name}', { name: p.label || p.id }) : t('Enable "{name}" (trusted)?', { name: p.label || p.id }), minWidth: '460px', escapeToClose: true, onClose: () => { if (!decided) resolve(false); } });
      const risky = items.some((it) => it.id === 'client-module' || it.id === 'child-process');
      body.innerHTML = `
        <div class="usage-note">${escHtml(readOnly ? t('This plugin declares:') : t('This plugin asks for more than the sandbox gives. Enable it only if you trust its author:'))}</div>
        <ul class="plugin-caps-list">${items.map((it) => `<li class="plugin-cap plugin-cap-${escHtml(it.id)}">${escHtml(t(it.text, it.params || {}))}</li>`).join('')}</ul>
        ${risky && !readOnly ? `<div class="plugin-cfg-warn">${escHtml(t('Trusted code has the same power as VibeSpace itself. There is no undo beyond disabling it.'))}</div>` : ''}
        ${trust?.trusted ? `<div class="plugin-cfg-hint">${escHtml(t('Trusted since {when}', { when: new Date(trust.trustedAt).toLocaleString() }))}</div>` : ''}
        <div class="dialog-actions plugin-consent-actions"></div>`;
      const actions = body.querySelector('.plugin-consent-actions');
      const cancel = document.createElement('button');
      cancel.className = 'mounts-btn'; cancel.textContent = readOnly ? t('Close') : t('Cancel');
      cancel.onclick = () => { decided = true; close(); resolve(false); };
      actions.appendChild(cancel);
      if (!readOnly) {
        const okb = document.createElement('button');
        okb.className = 'mounts-btn plugin-consent-accept'; okb.textContent = t('Enable (trusted)');
        okb.onclick = () => { decided = true; close(); resolve(true); };
        actions.appendChild(okb);
      }
    });
  },

  /** Install dialog (Plugin Ph4): path / git / .vsp upload / GitHub release →
   *  POST /api/plugins/install. Errors reach the user verbatim (inline + toast). */
  _pluginInstallDialog(onDone) {
    const { body, close } = createModalShell({ id: 'plugin-install-dialog', title: t('Install plugin'), minWidth: '460px', escapeToClose: true });
    const SOURCES = [
      { value: 'path', label: t('Local folder path'), placeholder: '/path/to/plugin (holds vibespace-plugin.json)' },
      { value: 'git', label: t('Git repository URL'), placeholder: 'https://github.com/owner/plugin.git#main' },
      { value: 'github-release', label: t('GitHub release (owner/repo[@tag])'), placeholder: 'owner/repo@v1.2.0' },
      { value: 'zip', label: t('Upload .vsp package'), placeholder: '' },
    ];
    body.innerHTML = `
      <label class="plugin-install-row"><span>${escHtml(t('Source'))}</span><select class="plugin-install-source">${SOURCES.map((s) => `<option value="${s.value}">${escHtml(s.label)}</option>`).join('')}</select></label>
      <label class="plugin-install-row plugin-install-value-row"><span>${escHtml(t('Location'))}</span><input type="text" class="plugin-install-value" spellcheck="false"></label>
      <label class="plugin-install-row plugin-install-file-row hidden"><span>${escHtml(t('File'))}</span><input type="file" class="plugin-install-file" accept=".vsp,.zip"></label>
      <div class="plugin-cfg-hint">${escHtml(t('The package is validated before it is placed under data/plugins/<id>/. Plugins that ask for capabilities beyond the sandbox are enabled only after you review them.'))}</div>
      <div class="plugin-detail plugin-cfg-warn plugin-install-error hidden"></div>
      <div class="dialog-actions"><button class="mounts-btn plugin-install-cancel">${escHtml(t('Cancel'))}</button><button class="mounts-btn plugin-install-go">${escHtml(t('Install'))}</button></div>`;
    const srcSel = body.querySelector('.plugin-install-source'), val = body.querySelector('.plugin-install-value'), fileRow = body.querySelector('.plugin-install-file-row'), valRow = body.querySelector('.plugin-install-value-row'), fileIn = body.querySelector('.plugin-install-file'), errEl = body.querySelector('.plugin-install-error'), go = body.querySelector('.plugin-install-go');
    const sync = () => { const s = SOURCES.find((x) => x.value === srcSel.value); val.placeholder = s?.placeholder || ''; fileRow.classList.toggle('hidden', srcSel.value !== 'zip'); valRow.classList.toggle('hidden', srcSel.value === 'zip'); };
    srcSel.onchange = sync; sync();
    body.querySelector('.plugin-install-cancel').onclick = () => close();
    const fail = (msg) => { errEl.textContent = msg; errEl.classList.remove('hidden'); showToast(msg, { type: 'error' }); go.disabled = false; go.textContent = t('Install'); };
    go.onclick = async () => {
      errEl.classList.add('hidden'); go.disabled = true; go.textContent = t('Installing…');
      try {
        let res;
        if (srcSel.value === 'zip') {
          const f = fileIn.files?.[0];
          if (!f) return fail(t('Choose a .vsp file first'));
          const fd = new FormData(); fd.append('source', 'zip'); fd.append('value', f.name); fd.append('file', f, f.name);
          const r = await fetch('/api/plugins/install', { method: 'POST', body: fd });
          res = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        } else {
          const v = val.value.trim();
          if (!v) return fail(t('Enter a location first'));
          res = await fetchJson('/api/plugins/install', { method: 'POST', body: JSON.stringify({ source: srcSel.value, value: v }) });
        }
        if (!res || res.error) return fail(res?.error || t('Install failed'));
        showToast(t('Installed {id} {version}', { id: res.plugin?.id || '', version: res.plugin?.version || '' }) + (res.replaced ? ' · ' + t('previous copy moved to trash') : ''));
        // A replacement that is not the same package drops the old consent —
        // say so, or the plugin silently comes back disabled (2.369.43).
        if (res.disabled) showToast(t('This is a different package under the same id — it was left disabled. Review what it asks for and enable it again.'), { type: 'warn' });
        for (const w of res.warnings || []) showToast(w, { type: 'warn' });
        close(); onDone?.();
      } catch (e) { fail(e.message); }
    };
    setTimeout(() => val.focus(), 0);
  },

  // ── HARNESS BACKGROUND SERVICES (2026-09-07, owner decision) ──────────────
  // A harness whose STORE needs a background daemon (opencode → the built-in
  // 'opencode-serve' plugin) ships it OFF. The first time the user actually
  // USES that harness we offer it ONCE — the "asked" flag is INSTANCE state
  // (data/plugins.json, broadcast), never per-browser, so a second tab and a
  // second device never re-ask.

  /** Fresh state of a harness's control plugin (cheap: no probes on this id).
   *  Falls back to the broadcast-cached copy when the server is unreachable —
   *  a network blip must not pop a dialog claiming the service is off. */
  async _harnessServiceState(backend) {
    const meta = BACKEND_META[backend];
    if (!meta?.servicePlugin) return null;
    const r = await fetchJson(`/api/plugins/${encodeURIComponent(meta.servicePlugin)}/status`);
    if (!r || r.error) return meta.service || null;
    meta.service = { ...(meta.service || {}), ...r, id: meta.servicePlugin };
    return meta.service;
  },

  /** Offer the harness's background service if it is off and we have not
   *  asked yet. Resolves TRUE when the service is (or has just become)
   *  available. `needsService` = the pending action cannot work without it,
   *  so a refusal must SAY so; `retry` runs after a successful enable. */
  async maybeOfferHarnessService(backend, { needsService = false, retry = null } = {}) {
    const meta = BACKEND_META[backend];
    if (!meta?.servicePlugin) return true;
    // ONE offer at a time: a layout restore can open five OpenCode history
    // windows in the same tick, and five stacked dialogs (each writing the
    // "asked" flag) is the same bug as asking twice.
    const inFlight = (this._svcOffers ||= new Map()).get(meta.servicePlugin);
    // a joiner still gets ITS pending action back when the shared offer wins
    if (inFlight) return inFlight.then((okv) => { if (okv) { try { retry?.(); } catch {} } return okv; });
    const p = this._offerHarnessService(backend, { needsService, retry }).finally(() => this._svcOffers.delete(meta.servicePlugin));
    this._svcOffers.set(meta.servicePlugin, p);
    return p;
  },

  async _offerHarnessService(backend, { needsService = false, retry = null } = {}) {
    const meta = BACKEND_META[backend];
    const st = await this._harnessServiceState(backend);
    if (!st) return false;
    if (st.running) return true;
    // Nothing to offer: the harness CLI itself is missing, or ops forced the
    // service off with VIBESPACE_OPENCODE_SERVE=0 — both are honest dead ends,
    // and a failed user action must still hear WHY (no silent failure).
    if (!st.installed || st.envForced === false || st.enabled || st.prompted) {
      if (needsService && !st.enabled) showToast(st.reason || t('The background service for {name} is off — turn it on in ⚙ → Plugins.', { name: meta.label || backend }), { type: 'error' });
      return !!st.enabled;
    }
    const accepted = await this._harnessServiceDialog(meta, st);
    // WE ASKED — record it either way. "Not now" must never be re-asked, and an
    // accepted offer that the user later turns off is exactly the case where
    // the sidebar's "history is hidden" row has to appear (it gates on the
    // same flag). The ⚙ → Plugins panel and that row stay the way back.
    // the content-type is load-bearing: express.json() only parses a JSON body
    // when it is declared, and a body-less POST would fall back to a default
    const r = await fetchJson(`/api/plugins/${encodeURIComponent(meta.servicePlugin)}/prompted`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompted: true }) });
    if (r && !r.error) meta.service = { ...(meta.service || {}), prompted: true };
    if (!accepted) return false;
    return this.enableHarnessService(backend, { retry });
  },

  /** Enable + start the service, then wait (bounded) for it to answer and run
   *  the pending action. Every failure reaches the user. */
  async enableHarnessService(backend, { retry = null } = {}) {
    const meta = BACKEND_META[backend];
    if (!meta?.servicePlugin) return false;
    const post = (tail, body) => fetchJson(`/api/plugins/${encodeURIComponent(meta.servicePlugin)}/${tail}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      .then((x) => { if (!x) throw new Error(t('Server unreachable — nothing was changed')); if (x.error) throw new Error(x.error); return x; });
    try {
      await post('enabled', { enabled: true });
      await post('start');
    } catch (e) { showToast(e.message || t('Failed'), { type: 'error' }); return false; }
    showToast(t('Starting the {name} background service…', { name: meta.label || backend }));
    const until = Date.now() + SERVICE_START_WAIT_MS;
    let st = null;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 700));
      st = await this._harnessServiceState(backend);
      if (st?.running || (st && !st.starting && st.reason)) break;
    }
    try { this.sidebar?._render?.(); } catch {}
    if (st?.running) { showToast(t('{name} background service is running', { name: meta.label || backend })); retry?.(); return true; }
    // Not a spinner forever: say what the state actually is and leave the
    // panel as the place to look.
    showToast(st?.reason || t('The {name} background service has not answered yet — check ⚙ → Plugins.', { name: meta.label || backend }), { type: 'warn' });
    return false;
  },

  /** The ONE first-use dialog (never a native confirm). Resolves true on
   *  "Enable & start", false on "Not now" / Esc / backdrop. */
  _harnessServiceDialog(meta, st) {
    return new Promise((resolve) => {
      let decided = false;
      const { body, close } = createModalShell({
        id: 'harness-service-dialog', minWidth: '460px', escapeToClose: true,
        title: t('Turn on the {name} background service?', { name: meta.label || meta.id }),
        onClose: () => { if (!decided) resolve(false); },
      });
      body.innerHTML = `
        <div class="usage-note">${escHtml(t('{name} keeps its conversations in its own database rather than in files, so VibeSpace cannot read a STOPPED conversation without asking {name} itself.', { name: meta.label || meta.id }))}</div>
        <ul class="plugin-caps-list">
          <li class="plugin-cap">${escHtml(t('Lists, opens, resumes and forks stopped {name} conversations in the sidebar', { name: meta.label || meta.id }))}</li>
          <li class="plugin-cap">${escHtml(t('Runs `opencode serve` on 127.0.0.1 (loopback only) using your own installed CLI — nothing is downloaded and nothing is exposed'))}</li>
          <li class="plugin-cap">${escHtml(t('Stops as soon as you disable it in ⚙ → Plugins, and VibeSpace stops it by itself if it starts burning CPU or memory'))}</li>
        </ul>
        <div class="plugin-cfg-hint">${escHtml(t('Running sessions do not need it. You will only be asked once — ⚙ → Plugins can turn it on later.'))}</div>
        <div class="dialog-actions plugin-consent-actions"></div>`;
      const actions = body.querySelector('.plugin-consent-actions');
      const later = document.createElement('button');
      later.className = 'mounts-btn'; later.textContent = t('Not now');
      later.onclick = () => { decided = true; close(); resolve(false); };
      const go = document.createElement('button');
      go.className = 'mounts-btn plugin-consent-accept'; go.textContent = t('Enable & start');
      go.onclick = () => { decided = true; close(); resolve(true); };
      actions.append(later, go);
      setTimeout(() => go.focus(), 0);
    });
  },
  });
}
