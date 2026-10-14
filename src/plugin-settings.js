'use strict';
// PLUGIN SETTINGS (lane plugin-settings-p0, docs/design-plugin-settings.zh.md — owner 2026-10-13: the VS Code plugin
// model). ONE PURE table per built-in plugin: every configuration row it has lives in All Settings under
// 「插件 › <名>」 (settings-schema.js derives the "Plugin: <label>" category from it, so the Plugins group of the
// Settings tree shows it, searchable), the values live ONLY in data/settings.json (`plugin.<id>.<key>`, or a legacy
// spelling through `path`), and the server reads them through the plugin host handle (h.setting / h.settings —
// src/plugins.js), never data/plugins.json `config`. A MANIFEST plugin's `contributes.settings[]` goes through the
// SAME validator (checkPluginRows) and the same derivation (settings-schema registerPluginSettings).
// NOT rows: `enabled` (start / stop / boot replay are side effects — the Plugins list's toggle) and keys (secrets:
// the integration row's store in Services › Integrations, or a plugin-held secret — the section only LINKS to them).
// Imports nothing — bundled into the browser (settings-schema) and required by the server (src/plugins.js).
const t = (s) => s; // i18n marker (scripts/i18n-extract.mjs collects t('…') literals); settings-schema translates

const ROW_TYPES = Object.freeze(['boolean', 'number', 'enum', 'string', 'text', 'json']);
const APPLY_KINDS = Object.freeze(['server', 'plugin-config']); // server = read lazily; plugin-config = the plugin re-applies (restart)
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/;
const PATH_RE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
const SECRET_RE = /(^|[^a-z])(token|secret|password|passwd|apikey|api_key|key)$/i; // a secret-shaped row name — keys never become settings
const ROW_FIELDS = new Set(['key', 'type', 'default', 'label', 'description', 'tier', 'apply', 'path', 'options', 'min', 'max', 'step', 'multiline', 'maxLength', 'draft', 'migrate']);
const MAX_ROWS = 24;

const PLUGIN_SETTINGS = {
  'decision-api': {
    label: 'Decision API',
    integration: 'decision-api',
    rows: [
      { key: 'attention', type: 'boolean', default: false, apply: 'server',
        label: t('Channels home: pick out the messages that need me'),
        description: [t('Example: a colleague asks “Can you get back to me today?” — it gets marked “{label}” and moves to the top of Channels home; tap ✓ / ✗ to teach it.'), { label: [t('needs you · {p}'), { p: t('asks you') }] }] },
      { key: 'rules', type: 'boolean', default: false, apply: 'server',
        label: t('Notification rules can use a sentence as the condition'),
        description: [t('Example: the rule “Notify me when someone chases me for a payment” — the model checks whether each message fits. Set it up in {notify} by adding a rule.'), { notify: t('Notify…') }] },
      { key: 'routing', type: 'boolean', default: false, apply: 'server',
        label: t('Hand messages to a task group or agent by what they say'),
        description: t('Example: “expense claims go to the Finance task group, server alerts go to the ops agent”. Set it up in a rule\'s “One of a list” option.') },
      // use ④ (lane inbox-decision-group, picked before this lane): its switch is a row like the three above; the
      // migration moves plugins.json config.inbox the same way (the default source `config.<key>`)
      { key: 'inbox', type: 'boolean', default: false, apply: 'server',
        label: t('For-you tray: put what needs me now first'),
        description: t('E.g. an agent asking you "which expense process?" goes to the top; a "task finished" notice goes further down.') },
      { key: 'dailyBudgetUsd', type: 'number', default: 1, min: 0, max: 1000, step: 0.01, apply: 'server',
        label: t('Spend at most per day (USD)'),
        description: t('Once a day\'s calls have cost this much, nothing more is sent to the model until midnight. The Plugins list shows today\'s count on the Decision API row.'),
        migrate: { from: 'config.dailyBudgetCents', scale: 0.01 } },
      // the two LEGACY keys keep their spelling (zero migration) — only their section moved here from Channels
      { key: 'threshold', path: 'decision.threshold', type: 'number', default: 0.7, min: 0.5, max: 0.9, step: 0.05, tier: 'advanced', apply: 'server',
        label: t('Needs-attention threshold (Decision API)'),
        description: t('How sure the judge must be (0.50–0.90) before a conversation joins the first screen. Higher = fewer, surer rows.') },
      { key: 'attentionBlock', path: 'decision.attentionBlock', type: 'text', multiline: true, maxLength: 1500, draft: 'decision', default: '', apply: 'server',
        label: t('What matters to me (Decision API)'),
        description: t('With the Decision API plugin on, the Channels first screen also lists conversations the judge thinks need you now. Say in your own words what matters to you (at most 1,500 characters) — it goes to the judge as written. "Draft from my recent decisions" (with an OpenRouter key: "Draft from my verdicts") proposes lines from your ✓ / ✗ answers for you to edit; nothing is saved until you save it.') },
      // lane rule-learning (design q-037 P0): the text model that DRAFTS the block above (「从我的判定起草」 — only with an
      // OpenRouter key on the Decision API row); both tiers ride the zero-data-retention routing of OpenRouter, never an Anthropic endpoint
      { key: 'learnModel', type: 'enum', default: 'flash', apply: 'server',
        options: [{ value: 'flash', label: t('Gemini 3.8 Flash (about $0.007 a draft)') }, { value: 'sonnet', label: t('Sonnet 5.5 (better, about $0.02 a draft)') }],
        label: t('Model that drafts “What matters to me”'),
        description: t('With an OpenRouter key, “Draft from my verdicts” asks this model to rewrite your block from your ✓ / ✗ answers. It is sent only the short digests the judge already saw and your block, through OpenRouter\'s zero-data-retention endpoints; nothing is saved until you save it. At most $0.10 a day, inside the daily limit.') },
      // lane decision-attention-facts: IMPLICIT LABELS — a reply ⇒ "needs", a listed row left unopened a day ⇒ "not"
      // (src/server/channels-attention.js `learn`); off by default, nothing written while off
      { key: 'implicitLabels', path: 'decision.implicitLabels', type: 'boolean', default: false, apply: 'server',
        label: t('Learn from what I do'),
        description: t('Besides your ✓ / ✗, it learns from what you do. Example: you reply in a conversation it did not pick out, so similar ones are picked out next time; one it picked out that you leave unopened for a day counts as a “no”. You see it in what Channels home lists. Your own ✓ / ✗ always come first.') },
    ],
  },
  'voice-input': {
    label: 'Voice input · Dropline',
    integration: 'dropline',
    rows: [
      { key: 'language', type: 'enum', default: 'auto', apply: 'server',
        options: [{ value: 'auto', label: t('Any language (auto)') }, { value: 'zh', label: t('Chinese') }, { value: 'en', label: t('English') }],
        label: t('Dictation language'),
        description: t('The language Dropline listens for when you click the microphone in the chat box. “Any language” lets it decide per recording.') },
      { key: 'teach', type: 'boolean', default: false, apply: 'server',
        label: t('Suggest words for my Dropline dictionary (I confirm each batch)'),
        description: t('Example: you keep saying “LarkClient” — it is proposed for your dictionary; the Voice row in the Plugins list shows “{n} waiting” until you add or ignore the batch. Only what you confirm is sent.') },
      { key: 'context', type: 'boolean', default: false, apply: 'server',
        label: t("Send the conversation to Dropline's two-week memory (shows the text the first time)"),
        description: t('Dropline then knows the names and terms of the conversation you dictate into. The first time, the exact text is shown before anything is sent.') },
      { key: 'autoProjects', type: 'json', default: [], tier: 'advanced', apply: 'server',
        label: t('Projects whose file names go without asking'),
        description: t('Folders (absolute paths) whose file names and identifiers are proposed to Dropline without asking — at most 50 an hour, journaled. A proposal card adds its project here with one tick.') },
    ],
  },
  'frp': {
    label: 'Public URLs (frp)',
    secrets: [{ key: 'token', label: t('Relay token'), description: t('The relay\'s shared secret. It stays on this instance (data/plugins.json) and is never shown again; empty = the cluster\'s.') }],
    rows: [
      { key: 'serverAddr', type: 'string', default: '', apply: 'plugin-config', migrate: { from: 'config.serverAddr' },
        label: t('Relay address'), description: t('The frps host public URLs go through. Empty = the cluster\'s (VIBESPACE_FRPS_ADDR). A change restarts the relay if it is running.') },
      { key: 'serverPort', type: 'number', default: 0, min: 0, max: 65535, step: 1, apply: 'plugin-config', migrate: { from: 'config.serverPort' },
        label: t('Relay port'), description: t('0 = the cluster\'s port (VIBESPACE_FRPS_PORT, else 7000).') },
      { key: 'subDomainHost', type: 'string', default: '', apply: 'plugin-config', migrate: { from: 'config.subDomainHost' },
        label: t('Subdomain host (optional)'), description: t('example.com → https://<random>.example.com') },
    ],
  },
  'tailscale': {
    label: 'Tailscale',
    rows: [
      { key: 'mode', type: 'enum', default: 'auto', apply: 'plugin-config', // rec.mode is the RUNNING mode (written at start) — no migration; a missing pref = auto
        options: [{ value: 'auto', label: t('Auto') }, { value: 'kernel', label: t('Kernel (full tunnel)') }, { value: 'userspace', label: t('Userspace (proxy only)') }],
        label: t('Networking'), description: t('Auto uses the kernel tunnel when /dev/net/tun is usable, else userspace (reach tailnet hosts through SOCKS5). A change reconnects a running Tailscale; the login persists.') },
      { key: 'upFlags', type: 'string', default: '', apply: 'server', migrate: { from: 'upFlags' },
        label: t('tailscale up flags'), description: t('Extra `tailscale up` flags — applied on the next Log in / mode change. Reachability flags we manage (--socket/--tun/--accept-routes/proxy) are ignored.') },
    ],
  },
};
// a plugin with nothing to configure has no table and says why on its own descriptor (`noSettings: '<why>'`,
// src/plugins/<id>.js) — scripts/test-plugins-grammar.mjs: every plugin file has a table here or that sentence

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isText = (x) => typeof x === 'string' || (Array.isArray(x) && typeof x[0] === 'string' && (x[1] === undefined || isObj(x[1])));

/** THE ONE VALIDATOR — a built-in table's rows and a manifest's `contributes.settings[]` (normalised by
 *  manifestRows) both pass here. [] = valid; else one sentence per broken row. */
function checkPluginRows(rows, { builtin = false } = {}) {
  const errs = [];
  if (!Array.isArray(rows)) return ['rows must be an array'];
  if (rows.length > MAX_ROWS) errs.push(`too many rows (${rows.length} > ${MAX_ROWS})`);
  const seen = new Set();
  rows.forEach((r, i) => {
    const at = `row[${i}]${r && r.key ? ' ' + r.key : ''}`;
    if (!isObj(r)) { errs.push(`${at}: must be an object`); return; }
    if (typeof r.key !== 'string' || !KEY_RE.test(r.key)) errs.push(`${at}: key must match ${KEY_RE}`);
    else if (seen.has(r.key)) errs.push(`${at}: duplicate key`); else seen.add(r.key);
    if (r.key === 'enabled') errs.push(`${at}: enabled is the plugin's on-switch (start / stop side effects), never a setting`);
    if (r.secret === true || (typeof r.key === 'string' && SECRET_RE.test(r.key))) errs.push(`${at}: a secret-shaped row is refused — keys live in Services › Integrations (or a plugin-held secret), never in settings.json`);
    for (const f of Object.keys(r)) if (!ROW_FIELDS.has(f)) errs.push(`${at}: unknown field ${f}`);
    if (!ROW_TYPES.includes(r.type)) errs.push(`${at}: type must be one of ${ROW_TYPES.join('|')}`);
    if (!isText(r.label) || !(Array.isArray(r.label) ? r.label[0] : r.label)) errs.push(`${at}: label missing`);
    if (r.description !== undefined && !isText(r.description)) errs.push(`${at}: description must be a string`);
    if (r.apply !== undefined && !APPLY_KINDS.includes(r.apply)) errs.push(`${at}: apply must be one of ${APPLY_KINDS.join('|')}`);
    if (r.tier !== undefined && r.tier !== 'advanced') errs.push(`${at}: tier must be 'advanced'`);
    if (r.path !== undefined && (!builtin || typeof r.path !== 'string' || !PATH_RE.test(r.path))) errs.push(`${at}: path (a legacy key spelling) is for built-in tables only, a dotted key`);
    const d = r.default;
    if (r.type === 'boolean' && typeof d !== 'boolean') errs.push(`${at}: a boolean row needs a boolean default`);
    if (r.type === 'number') {
      if (typeof d !== 'number' || !Number.isFinite(d)) errs.push(`${at}: a number row needs a finite default`);
      else if ((r.min !== undefined && d < r.min) || (r.max !== undefined && d > r.max)) errs.push(`${at}: the default is outside min..max`);
    }
    if ((r.type === 'string' || r.type === 'text') && typeof d !== 'string') errs.push(`${at}: a ${r.type} row needs a string default`);
    if (r.type === 'enum') {
      if (!Array.isArray(r.options) || !r.options.length || r.options.some((o) => !isObj(o) || typeof o.value !== 'string')) errs.push(`${at}: an enum row needs options [{value, label}]`);
      else if (!r.options.some((o) => o.value === d)) errs.push(`${at}: the default is not one of the options`);
    }
    if (r.type === 'json' && d === undefined) errs.push(`${at}: a json row needs a default`);
    if (r.migrate !== undefined && (!isObj(r.migrate) || typeof r.migrate.from !== 'string' || (r.migrate.scale !== undefined && typeof r.migrate.scale !== 'number'))) errs.push(`${at}: migrate must be {from, scale?}`);
  });
  return errs;
}
/** a manifest's `contributes.settings[]` in row shape (select → enum, an option string → {value,label}); the
 *  manifest's own spelling stays its contract (docs/plugins.md) */
function manifestRows(items) {
  return (Array.isArray(items) ? items : []).filter(isObj).map((s) => {
    const r = { key: s.key, label: String(s.label || s.key || ''), description: String(s.description || '') };
    if (s.secret === true) r.secret = true;
    if (s.type === 'boolean') Object.assign(r, { type: 'boolean', default: !!s.default });
    else if (s.type === 'number') Object.assign(r, { type: 'number', default: Number.isFinite(Number(s.default)) ? Number(s.default) : 0 }, s.min !== undefined ? { min: s.min } : {}, s.max !== undefined ? { max: s.max } : {}, s.step !== undefined ? { step: s.step } : {});
    else if (s.type === 'select') {
      const options = (Array.isArray(s.options) ? s.options : []).map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: String(o?.value ?? ''), label: String(o?.label ?? o?.value ?? '') }));
      Object.assign(r, { type: 'enum', default: String(s.default ?? (options[0] ? options[0].value : '')), options });
    } else Object.assign(r, { type: 'string', default: String(s.default ?? '') });
    return r;
  });
}
/** the settings.json key of a row */
function rowPath(id, r) { return r.path || `plugin.${id}.${r.key}`; }
/** a plugin's effective values {key: value} from a settings object (defaults for what is absent) */
function valuesOf(id, settings) {
  const tbl = PLUGIN_SETTINGS[id];
  const s = isObj(settings) ? settings : {};
  const out = {};
  for (const r of tbl ? tbl.rows : []) { const v = s[rowPath(id, r)]; out[r.key] = v === undefined ? r.default : v; }
  return out;
}
/** the section's link rows (no value, never in settings.json): the on-switch's place, the key's place, the
 *  plugin-held secrets */
function linksOf(id) {
  const tbl = PLUGIN_SETTINGS[id];
  if (!tbl) return [];
  const out = [{ to: { kind: 'plugins-panel', id }, label: t('On / off and status'), description: t('Turn the plugin on or off in the Plugins list (sidebar). Its status and anything waiting for you are there too.') }];
  if (tbl.integration) out.push({ to: { kind: 'integration', id: tbl.integration }, label: t('Key and provider'), description: t('The key lives in Services › Integrations — this section never holds it.') });
  for (const s of tbl.secrets || []) out.push({ to: { kind: 'plugin-secret', id, key: s.key }, label: s.label, description: s.description });
  return out;
}
/** THE ONE-TIME MOVE (migration 2026-10-plugin-config-to-settings): each table row whose old home (`migrate.from`,
 *  default `config.<key>`) holds a value moves into settings.json unless settings already holds one; the old
 *  field is dropped either way, and decision-api's `config.threshold` (read by nobody) and the feature switches
 *  `config.<attention|rules|routing>` move too. Returns {patch, strip: {id: [field…]}}. PURE. */
function migrationPlan(pluginsState, settings) {
  const plugins = isObj(pluginsState) && isObj(pluginsState.plugins) ? pluginsState.plugins : {};
  const s = isObj(settings) ? settings : {};
  const patch = {}, strip = {};
  for (const [id, tbl] of Object.entries(PLUGIN_SETTINGS)) {
    const rec = plugins[id];
    if (!isObj(rec)) continue;
    const fields = [];
    for (const r of tbl.rows) {
      const from = (r.migrate && r.migrate.from) || (r.path ? null : `config.${r.key}`);
      if (!from) continue;
      const [a, b] = from.split('.');
      const holder = b === undefined ? rec : rec[a];
      const field = b === undefined ? a : b;
      if (!isObj(holder) || holder[field] === undefined) continue;
      fields.push(from);
      const p = rowPath(id, r);
      if (s[p] !== undefined) continue; // settings already holds the user's value — it wins
      let v = holder[field];
      if (r.migrate && typeof r.migrate.scale === 'number') v = Math.round(Number(v) * r.migrate.scale * 100) / 100;
      if (r.type === 'number') { v = Number(v); if (!Number.isFinite(v)) continue; }
      if (r.type === 'boolean') v = v === true;
      if (r.type === 'string') v = String(v);
      if (v === r.default) continue; // sparse store: a default is never written
      patch[p] = v;
    }
    if (id === 'decision-api' && isObj(rec.config) && rec.config.threshold !== undefined) fields.push('config.threshold');
    if (fields.length) strip[id] = fields;
  }
  return { patch, strip };
}

module.exports = { PLUGIN_SETTINGS, ROW_TYPES, APPLY_KINDS, checkPluginRows, manifestRows, rowPath, valuesOf, linksOf, migrationPlan };
