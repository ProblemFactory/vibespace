import { SETTINGS_SCHEMA, SETTINGS_CATEGORIES, harnessSectionFor, harnessFileRel } from './settings-schema.js';
import { showConfirmDialog, fetchJson } from './utils.js';
import { receiptLine, offLine, applyHead } from './cli-config-chips.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';

/**
 * SettingsUI — VS Code-style settings page.
 * Left: category nav. Right: searchable setting controls. Schema-driven.
 */
class SettingsUI {
  constructor(app) {
    this.app = app;
    this.settings = app.settings;
    this._search = '';
  }

  open({ syncId } = {}) {
    // Non-blocking: Settings is a normal same-level WINDOW (not a modal overlay)
    // so you can tweak a setting and watch the effect on the workspace live.
    // Singleton — focus an already-open settings window instead of stacking.
    const existing = [...this.app.wm.windows.values()].find(w => w.type === 'settings');
    if (existing) {
      if (existing.isMinimized) this.app.wm.restore?.(existing.id);
      this.app.wm.focusWindow(existing.id);
      const inp = existing.content.querySelector('.settings-search');
      inp?.focus();
      return;
    }
    // openSpec (2.106.0, user request): the Settings window participates in
    // layout sync/persistence like any other window — it used to be transient.
    const winInfo = this.app.wm.createWindow({ title: t('Settings'), type: 'settings', width: 720, height: 560, syncId, openSpec: { action: 'openSettings' } });
    const dialog = document.createElement('div');
    dialog.className = 'settings-dialog settings-window';
    winInfo.content.appendChild(dialog);

    // Header — the window titlebar provides the title + close; keep only the
    // in-content Reset All action here.
    const header = document.createElement('div');
    header.className = 'settings-header';
    const title = document.createElement('h3');
    title.textContent = t('Settings');
    const headerRight = document.createElement('div');
    headerRight.className = 'settings-header-actions';
    const resetAllBtn = document.createElement('button');
    resetAllBtn.className = 'settings-header-btn';
    resetAllBtn.textContent = t('Reset All');
    resetAllBtn.title = t('Reset all settings to defaults');
    resetAllBtn.onclick = async () => { if (await showConfirmDialog({ title: t('Reset Settings'), message: t('Reset all settings to defaults?'), confirmText: t('Reset'), danger: true })) { this.settings.resetAll(); this._renderContent(content, nav); } };
    headerRight.append(resetAllBtn);
    header.append(title, headerRight);

    // Search
    const searchWrap = document.createElement('div');
    searchWrap.className = 'settings-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.className = 'settings-search';
    searchInput.placeholder = t('Search settings...');
    this._search = ''; // clear filter on open
    searchInput.oninput = () => { this._search = searchInput.value.toLowerCase(); this._renderContent(content, nav); };
    searchWrap.appendChild(searchInput);

    // Body: nav + content
    const body = document.createElement('div');
    body.className = 'settings-body';
    const nav = document.createElement('nav');
    nav.className = 'settings-nav';
    const content = document.createElement('div');
    content.className = 'settings-content';
    body.append(nav, content);

    dialog.append(header, searchWrap, body);

    this._renderContent(content, nav);
    searchInput.focus();
  }

  _renderContent(content, nav) {
    content.innerHTML = '';
    nav.innerHTML = '';

    const query = this._search;
    // CLI-config receipts are FRESH per render (design-harness-settings D2):
    // one /api/agent-hooks read shared by every cli-config row of this pass.
    this._cliConfigPromise = null;

    // Group settings by category
    const grouped = {};
    for (const cat of SETTINGS_CATEGORIES) grouped[cat] = [];
    for (const [path, schema] of Object.entries(SETTINGS_SCHEMA)) {
      if (query) {
        const haystack = (schema.label + ' ' + schema.description + ' ' + path).toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      const cat = schema.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ path, schema });
    }

    for (const cat of SETTINGS_CATEGORIES) {
      const items = grouped[cat];
      if (!items || !items.length) continue;

      // Nav item
      const navItem = document.createElement('div');
      navItem.className = 'settings-nav-item';
      navItem.textContent = cat;
      navItem.onclick = () => {
        const section = content.querySelector(`[data-category="${cat}"]`);
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      nav.appendChild(navItem);

      // Section
      const section = document.createElement('div');
      section.className = 'settings-section';
      section.dataset.category = cat;
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'settings-section-title';
      sectionTitle.textContent = cat;
      section.appendChild(sectionTitle);
      // A HARNESS section (derived from its descriptor table, design §4.2):
      // one line saying what these values are for and which CLI config file
      // the "written into the CLI config" rows land in.
      const hs = harnessSectionFor(cat);
      if (hs) {
        const note = document.createElement('div');
        note.className = 'settings-section-note';
        note.textContent = hs.files.length
          ? t('These values decide how new sessions start. Rows marked "written into the CLI config" are written into {files}; the machines each one reached are listed under that row.', { files: hs.files.map((f) => f.rel).join(', ') })
          : t('These values decide how new sessions start.');
        section.appendChild(note);
      }

      for (const { path, schema } of items) {
        section.appendChild(this._renderSetting(path, schema));
      }

      content.appendChild(section);
    }

    if (!content.children.length) {
      content.innerHTML = '<div class="settings-empty">' + t('No settings match your search.') + '</div>';
    }

    // Scroll-spy: highlight the category currently in view (user request).
    // Assigned (not addEventListener) so re-renders replace the handler.
    const spy = () => {
      const secs = [...content.querySelectorAll('.settings-section')];
      if (!secs.length) return;
      const cTop = content.getBoundingClientRect().top;
      let cur = secs[0];
      for (const sec of secs) { if (sec.getBoundingClientRect().top - cTop <= 70) cur = sec; else break; }
      // pinned to the bottom → the last section wins even if its top is below the line
      if (content.scrollTop + content.clientHeight >= content.scrollHeight - 4) cur = secs[secs.length - 1];
      const cat = cur.dataset.category;
      nav.querySelectorAll('.settings-nav-item').forEach((n) => n.classList.toggle('active', n.textContent === cat));
    };
    content.onscroll = spy;
    spy();
  }

  _renderSetting(path, schema) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    if (this.settings.isModified(path)) row.classList.add('modified');

    const info = document.createElement('div');
    info.className = 'settings-row-info';
    const label = document.createElement('div');
    label.className = 'settings-row-label';
    label.textContent = schema.label;
    if (!schema.liveApply) {
      const badge = document.createElement('span');
      badge.className = 'settings-reload-badge';
      badge.textContent = t('reload');
      badge.title = t('Requires page reload to take effect');
      label.appendChild(badge);
    }
    const desc = document.createElement('div');
    desc.className = 'settings-row-desc';
    desc.textContent = schema.description;
    const pathEl = document.createElement('div');
    pathEl.className = 'settings-row-path';
    pathEl.textContent = path;
    info.append(label, desc, pathEl);
    if (schema.apply) this._renderApplyChip(info, path, schema);

    const controlWrap = document.createElement('div');
    controlWrap.className = 'settings-row-control';

    const control = this._createControl(path, schema, row);
    controlWrap.appendChild(control);

    // Reset button (only shown when modified)
    if (this.settings.isModified(path)) {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'settings-reset-btn';
      resetBtn.textContent = '↺';
      resetBtn.title = t('Reset to default');
      resetBtn.onclick = () => { this.settings.reset(path); row.classList.remove('modified'); this._refreshControl(row, path, schema); };
      controlWrap.appendChild(resetBtn);
    }

    row.append(info, controlWrap);
    return row;
  }

  /** The apply chip under a DERIVED harness row (design §4.3): what the value
   *  is for (spawn / server), and for a cli-config row the target file+key, the
   *  fresh local receipt, and a human-triggered "Check machines…" that asks
   *  every registered host's helper --status (one ssh each — never on render). */
  _renderApplyChip(info, path, schema) {
    const box = document.createElement('div');
    box.className = 'settings-row-apply';
    const head = document.createElement('div');
    head.className = 'settings-row-apply-head';
    head.textContent = applyHead(schema.apply, { t }) || '';
    box.appendChild(head);
    if (schema.apply.kind === 'cli-config') {
      const key = path.slice(schema.harness.length + 1);
      const rel = harnessFileRel(schema.harness, schema.apply.file) || '';
      const target = document.createElement('div');
      target.className = 'settings-row-apply-target';
      target.textContent = `${rel} → ${schema.apply.path.join('.')}`;
      box.appendChild(target);
      const list = document.createElement('div');
      list.className = 'settings-cli-receipts';
      const addLine = (l) => { const d = document.createElement('div'); d.className = 'settings-cli-receipt ' + (l.tone === 'ok' ? 'ob-ok' : l.tone === 'warn' ? 'ob-warn' : l.tone === 'bad' ? 'ob-bad' : 'settings-cli-dim'); d.textContent = l.text; list.appendChild(d); return d; };
      const pending = addLine({ tone: 'dim', text: t('checking…') });
      box.appendChild(list);
      this._cliConfigPromise ||= fetchJson('/api/agent-hooks');
      this._cliConfigPromise.then((hs) => {
        if (!list.isConnected) return;
        pending.remove();
        const cc = hs && !hs.error ? hs.cliConfig : null;
        if (!cc) { addLine({ tone: 'bad', text: `⚠ ${t('Could not read the hook status — {reason}', { reason: (hs && hs.error) || t('server unreachable') })}` }); return; }
        const r = (cc.receipts || []).find((x) => x.harness === schema.harness && x.key === key);
        const off = (cc.off || []).find((x) => x.harness === schema.harness && x.key === key);
        if (off) addLine(offLine({ t, rel: off.rel, path: off.path }));
        else if (r) {
          const lw = cc.lastWrite && (cc.lastWrite.receipts || []).some((x) => x.harness === schema.harness && x.key === key && (x.state === 'applied' || x.state === 'unchanged')) ? cc.lastWrite.at : null;
          addLine(receiptLine(r, { t, where: t('this machine'), lastWriteAt: lw }));
        } else addLine({ tone: 'dim', text: `? ${t('this machine')}: ${t('not checked — reinstall the agent tools')}` });
        if (cc.safe === false) addLine({ tone: 'dim', text: t('This server runs from a temporary directory and never writes the real CLI config.') });
      });
      const btn = document.createElement('button');
      btn.className = 'settings-link-btn';
      btn.textContent = t('Check machines…');
      btn.title = t('Reads the CLI config on every registered machine (one connection each)');
      btn.onclick = async () => {
        btn.disabled = true;
        const hd = await fetchJson('/api/hosts');
        const hosts = (hd && hd.hosts) || [];
        if (!hosts.length) { addLine({ tone: 'dim', text: t('No other machines registered.') }); return; }
        await Promise.all(hosts.map(async (h) => {
          const rs = await fetchJson(`/api/hosts/${encodeURIComponent(h.id)}/agent-tools`);
          if (!list.isConnected) return;
          if (!rs || rs.error) { addLine({ tone: 'bad', text: `⚠ ${h.name}: ${t('could not be checked')}${rs && rs.error ? ' — ' + rs.error : ''}` }); return; }
          const all = rs.cliConfig || [];
          const r = all.find((x) => x.harness === schema.harness && x.key === key) || all.find((x) => x.state === 'unknown') || { state: 'unknown' };
          addLine(receiptLine(r, { t, where: h.name, remote: true }));
        }));
        btn.remove();
      };
      box.appendChild(btn);
    }
    info.appendChild(box);
  }

  _createControl(path, schema, row) {
    const value = this.settings.get(path);

    if (schema.type === 'boolean') {
      const toggle = document.createElement('label');
      toggle.className = 'settings-toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value;
      input.onchange = async () => {
        // confirmOn settings (e.g. the automation-risk usage poll) demand an
        // explicit acknowledgement before being ENABLED; disabling is free.
        if (schema.confirmOn && input.checked) {
          const ok = await showConfirmDialog({
            title: schema.label || t('Enable this setting?'),
            message: schema.description || t('Are you sure?'),
            confirmText: t('Enable anyway'),
            danger: true,
          });
          if (!ok) { input.checked = false; return; }
        }
        this.settings.set(path, input.checked);
        row.classList.toggle('modified', this.settings.isModified(path));
      };
      const slider = document.createElement('span');
      slider.className = 'settings-toggle-slider';
      toggle.append(input, slider);
      return toggle;
    }

    if (schema.type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'settings-input-number';
      input.value = value;
      if (schema.min !== undefined) input.min = schema.min;
      if (schema.max !== undefined) input.max = schema.max;
      if (schema.step !== undefined) input.step = schema.step;
      input.onchange = () => {
        // Empty/invalid input must not store NaN (it persisted as null and
        // broke numeric consumers like taskbar sizing) — revert to default
        const num = parseFloat(input.value);
        if (Number.isFinite(num)) this.settings.set(path, num);
        else { this.settings.set(path, schema.default); input.value = schema.default; }
        row.classList.toggle('modified', this.settings.isModified(path));
      };
      return input;
    }

    if (schema.type === 'enum') {
      // Combobox mode: dropdown + custom text input for types that allow free-form values
      if (schema.combobox) {
        const wrap = document.createElement('div');
        wrap.className = 'settings-combobox';
        const select = document.createElement('select');
        select.className = 'settings-select';
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__'; customOpt.textContent = t('Custom…');
        for (const opt of schema.options) {
          const o = document.createElement('option');
          o.value = opt.value; o.textContent = opt.label;
          select.appendChild(o);
        }
        select.appendChild(customOpt);
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'settings-input-text';
        input.placeholder = 'e.g. claude-opus-4-6-20250414';
        // Determine initial state
        const knownValues = schema.options.map(o => o.value);
        const isCustom = value && !knownValues.includes(value);
        if (isCustom) {
          select.value = '__custom__';
          input.value = value;
          input.style.display = '';
        } else {
          select.value = value;
          input.style.display = 'none';
        }
        select.onchange = () => {
          if (select.value === '__custom__') {
            input.style.display = ''; input.focus();
            this.settings.set(path, input.value);
          } else {
            input.style.display = 'none';
            this.settings.set(path, select.value);
          }
          row.classList.toggle('modified', this.settings.isModified(path));
        };
        input.onchange = () => { this.settings.set(path, input.value); row.classList.toggle('modified', this.settings.isModified(path)); };
        wrap.append(select, input);
        return wrap;
      }
      const select = document.createElement('select');
      select.className = 'settings-select';
      for (const opt of schema.options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (String(value) === String(opt.value)) o.selected = true;
        select.appendChild(o);
      }
      select.onchange = () => { this.settings.set(path, select.value); row.classList.toggle('modified', this.settings.isModified(path)); };
      return select;
    }

    if (schema.type === 'multiSelect') {
      const wrap = document.createElement('div');
      wrap.className = 'settings-multi-select';
      const current = Array.isArray(value) ? value : [];
      for (const opt of schema.options) {
        const label = document.createElement('label');
        label.className = 'settings-checkbox-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = current.includes(opt.value);
        cb.onchange = () => {
          const updated = [];
          wrap.querySelectorAll('input[type=checkbox]').forEach((c, i) => { if (c.checked) updated.push(schema.options[i].value); });
          this.settings.set(path, updated);
          row.classList.toggle('modified', this.settings.isModified(path));
        };
        const span = document.createElement('span');
        span.textContent = opt.label;
        label.append(cb, span);
        wrap.appendChild(label);
      }
      return wrap;
    }

    if (schema.type === 'json') {
      const textarea = document.createElement('textarea');
      textarea.className = 'settings-json';
      textarea.rows = 4;
      textarea.value = JSON.stringify(value, null, 2);
      textarea.onchange = () => {
        try {
          const parsed = JSON.parse(textarea.value);
          textarea.classList.remove('invalid');
          this.settings.set(path, parsed);
          row.classList.toggle('modified', this.settings.isModified(path));
        } catch {
          textarea.classList.add('invalid');
        }
      };
      return textarea;
    }

    // Fallback: text input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'settings-input-text';
    input.value = String(value);
    // cluster-injected default is the effective value when the field is empty
    if (path === 'agentd.publicUrl' && this.app?._publicUrlDefault) input.placeholder = t('cluster default: {url}', { url: this.app._publicUrlDefault });
    input.onchange = () => { this.settings.set(path, input.value); row.classList.toggle('modified', this.settings.isModified(path)); };
    return input;
  }

  _refreshControl(row, path, schema) {
    const controlWrap = row.querySelector('.settings-row-control');
    controlWrap.innerHTML = '';
    controlWrap.appendChild(this._createControl(path, schema, row));
  }
}

export { SettingsUI };

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── singleton-focus window (see open())
registerWindowType({
  type: 'settings', label: 'Settings', singleton: true,
  icon: svgIcon16('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"/>'),
  action: 'openSettings', replay: (app, spec, { syncId } = {}) => app._settingsUI?.open({ syncId }),
});
