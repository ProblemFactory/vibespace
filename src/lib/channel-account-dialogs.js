// THE CHANNEL ACCOUNT DIALOGS (docs/design-integrations-per-account.zh.md r4
// §2.2 / §2.5 / §3 / §8.1 #2–#5, #11–#12, D1 / D3 / D4 / D5 / D8; lane
// integrations chunk 3). A channel account is added, re-authorized, edited,
// duplicated and removed EXACTLY the way a storage mount is — the owner's
// ruling ("oauth部分的设计你应该参考一下remote … 尽量让我们vibespace里的各种
// feature的UX和逻辑保持一致"), so every dialog here is the storage dialog
// component (src/lib/mounts-dialog.js, D1): `mountsDialog` with `when:` fields
// (Connect an account / Edit / Duplicate), `wireOAuthConnect` for the in-dialog
// consent block, `reauthDialog` (the storage `_showDriveReauthDialog` shape)
// for Re-authorize. THIS FILE HOLDS NO FIELD RENDERER — only field SPECS —
// and scripts/test-oauth-field-parity.mjs keeps it so (§3 of the census: the
// renderer's own spellings are written by the module alone; §4: the shared
// labels / options / buttons carried by both features).
//
// THE OAUTH CLIENT FIELD (§2.2): `OAuth client` = one select, `Preset:
// {label}` per preset the ONE env reader offers (Google: `drivePresets()`,
// Lark: the integration store's cluster reader — reaching us as `{key,label}` on the digest)
// plus `Custom (own client id/secret)`; no Built-in entry (Gmail / Lark have
// no fallback client); presets[0] preselected, `custom` when there are none;
// the registry row's `clientHint` as the hint line; `Custom <field label>`
// inputs inline (the registry's labels, placeholders and help); a custom
// client whose type declares a console setup (Lark: the redirect URL) draws
// it as a read-only copy row + one hint line per prerequisite.
//
// THE CHOICE LIVES ON THE ACCOUNT (§2.3): a preset is sent as `clientPreset:
// '<k>'` (the storage spelling), a custom client as `clientId` +
// `clientSecret` beside `clientPreset:'custom'`; the server seals the secret
// under .channels-key at once. Switching the client IS a re-authorization
// (the mount semantics): Edit's Save opens Re-authorize with the new client,
// never a silent re-point (a token is bound to the client it was minted
// under).
//
// XSS LAW: account names, preset labels, app ids and principal names are user
// or vendor strings synced to every client — they reach the DOM only through
// the component (textContent) or `el()` here; nothing below writes innerHTML.
import { fetchJson, showToast, showConfirmDialog, createModalShell } from './utils.js';
import { t as tr, deviceLocale } from './i18n.js';
import { mountsDialog, wireOAuthConnect, reauthDialog, api as mountsApi } from './mounts-dialog.js';
import { routeErrorText } from './channel-words.js';
import { icon, el, btn } from './channel-chrome.js';
// PURE, bundled: the row's `signinName` (the brand of the sign-in page — Gmail signs in with Google)
import * as R from '../integration-registry.js';

/** The channel side's consent routes — the storage `/api/mounts/gdrive-auth/*`
 *  shape (§2.4): START → `{flowId, url, flow}`, STATUS `?flowId=` → `{token}`
 *  once signed in (the token IS the flow id — the handle Connect submits),
 *  CALLBACK = the paste-back. */
export const CHANNEL_OAUTH_ENDPOINTS = Object.freeze({
  start: '/api/channels/oauth/start',
  status: '/api/channels/oauth/status',
  callback: '/api/channels/oauth/callback',
});
const enc = encodeURIComponent;
const PASTE_PLACEHOLDER = 'http://127.0.0.1:…/?state=…&code=…';

/** A channel route that THROWS (the component's contract: a thrown Error
 *  lands in the dialog's `.cfg-err` / the consent block's status line),
 *  worded by the route's CODE in the device's language (a3 i18n). */
async function capi(url, init = {}) {
  try { return await mountsApi(url, init); }
  catch (e) { const err = new Error(routeErrorText({ code: e.code, error: e.message })); err.code = e.code; throw err; }
}
const post = (url, body) => capi(url, { method: 'POST', body: JSON.stringify(body || {}) });

// ── names ────────────────────────────────────────────────────────────────
/** The PRODUCT's name: the TYPE's label before its ` / ` twin ("Lark /
 *  飞书" → "Lark", "Gmail" → "Gmail") — the storage
 *  `_oauthProviderNames().product` (the Re-authorize button, the health
 *  line's type tag, the toasts). Read off the registry row the digest names
 *  (`integration`) — never an ACCOUNT's own label (a copy named "Gmail
 *  (copy)" is still a Gmail account); a `kinds[]` entry's label otherwise.
 *  Brand names stay untranslated. */
export function providerOf(x) {
  const row = x && x.integration ? R.rowById(x.integration) : null;
  const label = row ? row.label : (x && x.connectable === undefined ? (x.label || x.kind) : x.kind);
  return String(label || '').split(' / ')[0];
}
/** The SIGN-IN page's brand — the storage `signin` name (`Sign in with
 *  {provider}`, `{provider} authorization`, `Connect {provider}`): the
 *  registry row's `signinName` (Gmail → Google), else the product's name.
 *  Read off the row the digest names (`integration`), never a kind branch. */
export function signinOf(x) {
  const row = x && x.integration ? R.rowById(x.integration) : null;
  return (row && row.signinName) || providerOf(x);
}
/** The name an account carries: its label, and the login the token names
 *  (an e-mail, a tenant user) beside it when known — "Gmail · me@example.com";
 *  a label-only account of a kind holding several is numbered in record
 *  order. The built-in row's login is this instance, never a named user. */
export function accountName(a, siblings = 1, n = 1) {
  const label = String(a.label || a.id);
  const user = a.auth && !a.auth.self && a.auth.user ? String(a.auth.user) : '';
  if (user) return user === label ? label : `${label} · ${user}`;
  return siblings > 1 ? tr('{label} account {n}', { label, n }) : label;
}
/** The card's client chip: `Preset: {label}` / `Custom client` (null = none). */
export function clientChipText(a) {
  const key = a && a.credentialKey;
  if (!key) return null;
  if (key === 'custom' || key === 'own') return tr('Custom client');
  const k = String(key).replace(/^cluster:/, '');
  const p = (a.presets || []).find((x) => x.key === k);
  return tr('Preset: {name}', { name: (p && p.label) || a.credentialLabel || k });
}

// ── field specs (rendered by the component, never here) ─────────────────
/** A registry field label as the custom client's input label. */
function customLabel(label) {
  switch (label) {
    case 'App ID': return tr('Custom App ID');
    case 'App Secret': return tr('Custom App Secret');
    case 'OAuth client ID': return tr('Custom OAuth client ID');
    case 'OAuth client secret': return tr('Custom OAuth client secret');
    default: return tr('Custom {field}', { field: tr(label) });
  }
}
/** The account's current select value (`<presetKey>` | `custom`); a legacy
 *  account with no key shows the first preset (what it resolves to). */
export function clientValueOf(a, presets = (a && a.presets) || []) {
  const key = a && a.credentialKey;
  if (key === 'custom' || key === 'own') return 'custom';
  if (key && String(key).startsWith('cluster:')) return String(key).slice('cluster:'.length);
  return (presets[0] && presets[0].key) || 'custom';
}
/** What a spec needs from the digest: an adapter row or a `kinds[]` entry
 *  (the setup block lives on the kind). */
function specOf(x, kinds) {
  const k = (kinds || []).find((y) => y.kind === x.kind) || {};
  return { kind: x.kind, integration: x.integration || k.integration || null, label: x.label || k.label || x.kind, presets: x.presets || k.presets || [], clientHint: x.clientHint || k.clientHint || null, clientFields: x.clientFields || k.clientFields || null, setup: k.setup || x.setup || null, optionsSchema: x.optionsSchema || k.optionsSchema || [] };
}
/** THE `OAuth client` FIELD + its custom inputs (+ the setup copy row). */
function clientFieldSpecs(spec, { sfx = '', when = null, value, custom = null, secretType = 'password', hint, secretHint } = {}) {
  const presets = spec.presets || [];
  const options = presets.map((p) => [p.key, tr('Preset: {name}', { name: p.label })]);
  const v = value === undefined ? ((presets[0] && presets[0].key) || 'custom') : value;
  // a preset the cluster no longer provides stays visible — BY NAME — on the account that holds it
  if (v !== 'custom' && !presets.some((p) => p.key === v)) options.push([v, tr('Preset: {name} (no longer provided)', { name: v })]);
  options.push(['custom', tr('Custom (own client id/secret)')]);
  const on = when || (() => true);
  const isCustom = (vals) => on(vals) && vals[`client${sfx}`] === 'custom';
  const cf = spec.clientFields || {};
  const out = [{ key: `client${sfx}`, label: tr('OAuth client'), type: 'select', options, value: v, when: when || undefined, hint: hint !== undefined ? hint : (spec.clientHint ? tr(spec.clientHint) : undefined) }];
  if (cf.id) out.push({ key: `cid${sfx}`, label: customLabel(cf.id.label), placeholder: cf.id.placeholder || '', value: (custom && custom.appId) || '', when: isCustom, hint: cf.id.help ? tr(cf.id.help) : undefined });
  if (cf.secret) out.push({ key: `csec${sfx}`, label: customLabel(cf.secret.label), type: secretType, value: (custom && custom.appSecret) || '', when: isCustom, hint: secretHint !== undefined ? secretHint : (cf.secret.help ? tr(cf.secret.help) : undefined) });
  if (spec.setup && spec.setup.callbackUrl) {
    out.push({ key: `cb${sfx}`, label: tr('Callback URL (register it on your app first)'), type: 'copy', value: spec.setup.callbackUrl, when: isCustom,
      hint: [spec.setup.callbackNote ? tr(spec.setup.callbackNote) : null, ...(spec.setup.prerequisites || []).map((p) => tr(p))] });
  }
  return out;
}
/** The client choice a set of values names, in the route's spelling. */
function choiceBody(vals, sfx = '') {
  const c = vals[`client${sfx}`];
  if (c === 'custom') return { clientPreset: 'custom', clientId: vals[`cid${sfx}`] || '', clientSecret: vals[`csec${sfx}`] || '' };
  return c ? { clientPreset: c } : {};
}
/** Does the chosen client differ from the account's own? (a same-id custom
 *  client with a new secret is the SAME client — its secret is replaced in place) */
function switchesClient(a, vals, sfx = '', presets) {
  const cur = clientValueOf(a, presets);
  const next = vals[`client${sfx}`];
  if (next !== cur) return true;
  if (next === 'custom') return String(vals[`cid${sfx}`] || '') !== String((a.customClient && a.customClient.appId) || '');
  return false;
}
/** The type's DECLARED options as fields (`only` = the first N: the filter). */
function optionFieldSpecs(schema, { sfx = '', when = null, values = {}, only = null } = {}) {
  return (schema || []).slice(0, only == null ? undefined : only).map((o) => ({
    key: `opt${sfx}:${o.key}`, label: o.label ? tr(o.label) : o.key,
    type: Array.isArray(o.choices) && o.choices.length ? 'select' : 'text',
    options: Array.isArray(o.choices) ? o.choices.map((c) => [c, c]) : undefined,
    placeholder: o.placeholder || String(o.default || ''),
    value: values && values[o.key] !== undefined ? String(values[o.key]) : String(o.default || ''),
    when: when || undefined, hint: o.help ? tr(o.help) : undefined,
  }));
}
function optionValues(vals, schema, sfx = '', only = null) {
  const out = {};
  for (const o of (schema || []).slice(0, only == null ? undefined : only)) { const v = vals[`opt${sfx}:${o.key}`]; if (v !== undefined) out[o.key] = v; }
  return out;
}
function changedOptions(vals, schema, current = {}, only = null) {
  const out = {};
  for (const o of (schema || []).slice(0, only == null ? undefined : only)) {
    const v = vals[`opt:${o.key}`];
    const was = current[o.key] !== undefined ? String(current[o.key]) : String(o.default || '');
    if (v !== undefined && v !== was) out[o.key] = v;
  }
  return out;
}
/** The push exclusivity DECLARATION (the Push… dialog's three words). */
function pushClaimSpec(value) {
  return { key: 'push', label: tr('Exclusivity declaration'), type: 'select', value: value || 'unknown', options: [
    ['unknown', tr('unknown — declare nothing: push only kicks the cursor (default)')],
    ['shared', tr('shared — other clients use this app: push only kicks the cursor')],
    ['exclusive', tr('exclusive — this instance is the only client: push carries messages, the poll reconciles every 15 min')],
  ] };
}
/** A consent flow's refusal as the block's status sentence (a busy fixed port). */
function flowNotice(flow) {
  if (!flow || !flow.refusal) return null;
  return flow.refusal.code === 'port-busy'
    ? tr('Another VibeSpace or tool holds port {port} — finish or cancel it there, or paste the redirect URL back here.', { port: flow.port })
    : (flow.refusal.message || flow.refusal.code || tr('refused'));
}
/** Watch ONE account's row on `channels-updated` for the end of a consent
 *  that began at `base` (the row's `lastAuthAt` when it started): the
 *  engine stamps `lastAuthAt` when a consent LANDS (success or failure), so
 *  a changed stamp is the answer — `{token}` when it connected, `{fail}`
 *  with the refusal otherwise. No fetch: the broadcast IS the computation. */
function authWatcher(app, id, base) {
  let answer = {};
  const on = (msg) => {
    if (!msg || msg.type !== 'channels-updated' || !msg.digest) return;
    const row = (msg.digest.adapters || []).find((x) => x.id === id);
    if (!row || !row.lastAuthAt || row.lastAuthAt === base) return;
    if (row.lastAuthError) answer = { fail: tr('The consent flow ended: {error}', { error: row.lastAuthError }) };
    else if (row.auth && row.auth.state === 'connected') answer = { token: id, running: false };
  };
  const unsub = app.ws.onGlobal(on);
  return { state: () => answer, off: () => { try { if (typeof unsub === 'function') unsub(); else app.ws.offGlobal(on); } catch {} } };
}

// ── CONNECT AN ACCOUNT (§2.5, §8.1 #11: type-first, one dialog for every type) ──
/** The panel's one entry: `Connect an account`. The record is created by
 *  Connect from a finished sign-in — a dialog closed half-way leaves nothing. */
export function showConnectAccountDialog(app, kinds) {
  const list = (kinds || []).filter((k) => k && k.kind);
  if (!list.length) { showToast(tr('No account type can be connected on this instance'), { type: 'error' }); return null; }
  const is = (kind) => (v) => v.type === kind;
  const fields = [
    { key: 'type', label: tr('Type'), type: 'select', options: list.map((k) => [k.kind, k.label || k.kind]) },
    { key: 'name', label: tr('Name'), placeholder: tr('blank = the name the sign-in reports') },
  ];
  for (const k of list) {
    const sfx = `.${k.kind}`;
    fields.push(...clientFieldSpecs(specOf(k, list), { sfx, when: is(k.kind) }));
    fields.push({ key: `flow${sfx}`, label: tr('{provider} authorization', { provider: signinOf(k) }), type: 'hidden', when: is(k.kind) });
    fields.push(...optionFieldSpecs(k.optionsSchema, { sfx, when: is(k.kind), only: 1 }));
  }
  const ctx = mountsDialog(tr('Connect an account'), fields, tr('Connect'), async (v, { close }) => {
    const k = list.find((x) => x.kind === v.type) || list[0];
    const sfx = `.${k.kind}`;
    const flowId = v[`flow${sfx}`];
    if (!flowId) throw new Error(tr('Sign in first — press “Connect {label}” above.', { label: signinOf(k) }));
    const r = await post(`/api/channels/adapters/${enc(k.kind)}/connect`, { flowId, name: v.name || undefined, options: optionValues(v, k.optionsSchema, sfx, 1), ...choiceBody(v, sfx) });
    close();
    showToast(tr('{name} connected', { name: r && r.adapter ? accountName(r.adapter) : (v.name || k.label) }));
  });
  ctx.body.dataset.chanDialog = 'connect';
  for (const k of list) {
    const sfx = `.${k.kind}`;
    let flowId = null;
    wireOAuthConnect(ctx, {
      tokenKey: `flow${sfx}`, backend: k.kind, label: tr('Connect {label}', { label: signinOf(k) }),
      clientIdKey: `cid${sfx}`, clientSecretKey: `csec${sfx}`, provider: signinOf(k), pastePlaceholder: PASTE_PLACEHOLDER,
      extra: () => ({ clientPreset: ctx.inputs[`client${sfx}`].value, options: optionValues(Object.fromEntries(Object.entries(ctx.inputs).map(([key, e]) => [key, e.value])), k.optionsSchema, sfx, 1) }),
      endpoints: {
        start: async (body) => { const r = await post(CHANNEL_OAUTH_ENDPOINTS.start, body); flowId = r.flowId; return { url: r.url, notice: flowNotice(r.flow) }; },
        status: () => capi(`${CHANNEL_OAUTH_ENDPOINTS.status}?flowId=${enc(flowId || '')}`),
        callback: (b) => post(CHANNEL_OAUTH_ENDPOINTS.callback, { url: b.url, flowId }),
      },
    });
  }
  return ctx;
}

// ── RE-AUTHORIZE (§8.1 #3: the storage re-authorize dialog, verbatim + the client select) ──
/** `preselect` = `{client, appId, appSecret}` (Edit's switched client). */
export async function showReauthAccountDialog(app, a, { kinds = null, preselect = null } = {}) {
  const spec = specOf(a, kinds);
  const provider = providerOf(a);
  const signin = signinOf(spec);
  let custom = null;
  if (preselect && preselect.client === 'custom') custom = { appId: preselect.appId || '', appSecret: preselect.appSecret || '' };
  else if (clientValueOf(a, spec.presets) === 'custom') {
    // D3: the account's own client, prefilled (the owner-only config route — never the digest)
    const r = await fetchJson(`/api/channels/adapters/${enc(a.id)}/config`);
    const c = r && r.config && r.config.client;
    if (c) custom = { appId: c.appId || '', appSecret: c.appSecret || '' };
  }
  const expired = (a.auth || {}).state === 'expired';
  let watcher = null;
  const d = reauthDialog({
    id: 'chan-reauth-dialog',
    title: tr('Re-authorize "{name}"', { name: accountName(a) }),
    hint: expired
      ? tr('{provider} reported the saved sign-in as expired or revoked. Sign in again to mint a fresh token — nothing else about the account changes.', { provider: signin })
      : tr('Sign in with {provider} to mint this account’s token — nothing else about the account changes.', { provider: signin }),
    signinLabel: tr('Sign in with {provider}', { provider: signin }),
    provider: signin,
    fields: clientFieldSpecs(spec, { value: preselect ? preselect.client : clientValueOf(a, spec.presets), custom, hint: tr('The account’s own client by default; pick another and the new token is minted under it.') }),
    savingText: tr('Signed in — reconnecting…'),
    pastePlaceholder: PASTE_PLACEHOLDER,
    start: async (vals) => {
      const r = await post(`/api/channels/adapters/${enc(a.id)}/reauthorize`, choiceBody(vals));
      if (watcher) watcher.off();
      watcher = authWatcher(app, a.id, (r.adapter && r.adapter.lastAuthAt) || null);
      return { url: r.flow && r.flow.consentUrl, notice: flowNotice(r.flow) };
    },
    status: async () => (watcher ? watcher.state() : {}),
    callback: async (url) => { await post(`/api/channels/adapters/${enc(a.id)}/auth/finish`, { url }); return { token: a.id }; },
    finish: async (_token, { close }) => {
      if (watcher) watcher.off();
      showToast(tr('{provider} re-authorized', { provider }));
      close();
    },
  });
  d.body.dataset.chanDialog = 'reauth';
  d.body.dataset.adapter = a.id;
  return d;
}

// ── EDIT (§8.1 #4: the storage edit grammar — every parameter prefilled, D3) ──
function authFactText(a) {
  const auth = a.auth || {};
  const bits = [];
  bits.push(auth.state === 'connected' ? tr('Signed in') : auth.state === 'expired' ? tr('The sign-in expired or was revoked') : auth.state === 'needs-credentials' ? tr('No usable OAuth client') : tr('Not signed in'));
  if (auth.user && !auth.self) bits.push(String(auth.user));
  if (auth.expiresAt && Number.isFinite(Number(auth.expiresAt))) bits.push(tr('sign-in valid until {date}', { date: new Date(Number(auth.expiresAt)).toLocaleDateString(deviceLocale()) }));
  if (Array.isArray(auth.scopes) && auth.scopes.length) bits.push(tr('scopes {list}', { list: auth.scopes.join(', ') }));
  return bits.join(' · ');
}
export async function showEditAccountDialog(app, a, { kinds = null } = {}) {
  const r = await fetchJson(`/api/channels/adapters/${enc(a.id)}/config`);
  if (!r || r.error || !r.config) { showToast(routeErrorText(r), { type: 'error' }); return null; }
  const cfg = r.config;
  const spec = specOf(a, kinds);
  const provider = providerOf(a);
  const name = accountName(a);
  const cur = clientValueOf(a, cfg.presets || spec.presets);
  const custom = cfg.client ? { appId: cfg.client.appId || '', appSecret: cfg.client.appSecret || '' } : null;
  const honesty = cfg.senderHonestyLine === true ? 'on' : cfg.senderHonestyLine === false ? 'off' : 'default';
  const fields = [
    { key: 'name', label: tr('Name'), value: cfg.label || a.label || '' },
    ...clientFieldSpecs({ ...spec, presets: cfg.presets || spec.presets }, { value: cur, custom, secretType: 'text',
      hint: tr('This account’s token was minted under this client. Switching the client means signing in again — Save opens Re-authorize.'),
      secretHint: tr('Prefilled with the real current value, the secret included — the storage edit dialog’s rule; only what you change is saved.') }),
    { key: 'authfact', label: tr('Sign-in'), type: 'note', value: authFactText(a) },
    ...optionFieldSpecs(spec.optionsSchema, { values: cfg.options || {} }),
    ...(cfg.push ? [pushClaimSpec(cfg.push.claimedExclusive)] : []),
    ...(a.senderHonestyLine ? [{ key: 'honesty', label: tr('Sender line'), type: 'select', value: honesty, options: [['default', tr('Instance default')], ['on', tr('on')], ['off', tr('off')]],
      hint: tr('When on, a message an AGENT drafted goes out with one trailing line naming the agent. Your own drafts never get one. The approval card says who the recipient will see either way.') }] : []),
  ];
  const ctx = mountsDialog(`${tr('Edit')} "${name}"`, fields, tr('Save'), async (v, { close }) => {
    const patch = {};
    if (v.name && v.name !== (cfg.label || '')) patch.label = v.name;
    const opts = changedOptions(v, spec.optionsSchema, cfg.options || {});
    if (Object.keys(opts).length) patch.options = opts;
    if (cfg.push && v.push !== (cfg.push.claimedExclusive || 'unknown')) patch.push = { claimedExclusive: v.push };
    if (a.senderHonestyLine && v.honesty !== honesty) patch.senderHonestyLine = v.honesty === 'on' ? true : v.honesty === 'off' ? false : null;
    const switching = switchesClient({ ...a, credentialKey: cfg.credentialKey, customClient: custom ? { appId: custom.appId } : null }, v, '', cfg.presets || spec.presets);
    if (!switching && v.client === 'custom' && v.csec !== ((custom && custom.appSecret) || '')) patch.credential = { appId: v.cid, appSecret: v.csec };
    if (Object.keys(patch).length) await capi(`/api/channels/adapters/${enc(a.id)}`, { method: 'PUT', body: JSON.stringify(patch) });
    close();
    // SWITCHING THE CLIENT IS A RE-AUTHORIZATION (the mount semantics, D2's twin): never a silent re-point
    if (switching) showReauthAccountDialog(app, a, { kinds, preselect: { client: v.client, appId: v.cid, appSecret: v.csec } });
    else if (Object.keys(patch).length) showToast(tr('Saved.'));
  });
  ctx.body.dataset.chanDialog = 'edit';
  ctx.body.dataset.adapter = a.id;
  const acts = ctx.body.querySelector('.dialog-actions');
  const note = el('div', 'mounts-note', tr('Applied on save — the account re-reads with the new settings; switching the client opens Re-authorize first.'));
  ctx.body.querySelector('.cfg-err').before(note);
  const reauthB = btn(tr('Re-authorize {provider}…', { provider }), () => { ctx.close(); showReauthAccountDialog(app, a, { kinds }); });
  const dupB = btn(tr('Duplicate…'), () => { ctx.close(); showDuplicateAccountDialog(app, a, { kinds }); });
  const delB = btn(tr('Remove…'), async () => { if (await removeAccount(app, a)) ctx.close(); }, 'mounts-btn-danger');
  delB.title = tr('Remove this account (nothing is deleted on {provider})', { provider });
  reauthB.dataset.act = 'reauth'; dupB.dataset.act = 'duplicate'; delB.dataset.act = 'remove';
  acts.prepend(reauthB, dupB, delB);
  return ctx;
}

// ── DUPLICATE (§8.1 #2, D4: the declared DUPLICATE_FIELDS — its own consent) ──
export async function showDuplicateAccountDialog(app, a, { kinds = null } = {}) {
  const r = await fetchJson(`/api/channels/adapters/${enc(a.id)}/config`);
  if (!r || r.error || !r.config) { showToast(routeErrorText(r), { type: 'error' }); return null; }
  const cfg = r.config;
  const spec = specOf(a, kinds);
  const presets = cfg.presets || spec.presets;
  const signin = signinOf(spec);
  const cur = clientValueOf({ ...a, credentialKey: cfg.credentialKey }, presets);
  const custom = cfg.client ? { appId: cfg.client.appId || '', appSecret: cfg.client.appSecret || '' } : null;
  const copyName = tr('{name} (copy)', { name: a.label || a.id });
  const fields = [
    { key: 'name', label: tr('Name'), value: copyName },
    { key: 'kindLabel', label: tr('Type'), value: spec.label, readonly: true },
    ...clientFieldSpecs({ ...spec, presets }, { value: cur, custom, hint: tr('Copied from the original; you can change it.') }),
    ...optionFieldSpecs(spec.optionsSchema, { values: cfg.options || {}, only: 1 }),
    ...(cfg.push ? [pushClaimSpec(cfg.push.claimedExclusive)] : []),
    { key: 'copied', type: 'note', value: tr('Copied: the type, the OAuth client, the query, the push claim, the sender line. NOT copied: the token (a login is one person’s consent), tracked conversations, assignments, reach grants, the message log — the copy signs in on its own.') },
    { key: 'flow', label: tr('{provider} authorization', { provider: signin }), type: 'hidden', hint: tr('This copy needs its own sign-in — another account, or the same one authorized again.') },
  ];
  // THE COPY EXISTS FROM ITS FIRST SIGN-IN ATTEMPT (the server's duplicate =
  // an unauthorized record whose own consent follows); a dialog dismissed
  // before that consent landed removes it again — nothing half-made stays.
  let dupId = null, watcher = null, committed = false, signedIn = false, createdName = null;
  const readVals = () => Object.fromEntries(Object.entries(ctx.inputs).map(([k, e]) => [k, e.value.trim()]));
  const ensure = async (vals) => {
    if (dupId) return dupId;
    const d = await post(`/api/channels/adapters/${enc(a.id)}/duplicate`, { name: vals.name || copyName });
    dupId = d.adapter.id;
    createdName = vals.name || copyName;
    const patch = {};
    const opts = changedOptions(vals, spec.optionsSchema, cfg.options || {}, 1);
    if (Object.keys(opts).length) patch.options = opts;
    if (cfg.push && vals.push !== (cfg.push.claimedExclusive || 'unknown')) patch.push = { claimedExclusive: vals.push };
    if (Object.keys(patch).length) await capi(`/api/channels/adapters/${enc(dupId)}`, { method: 'PUT', body: JSON.stringify(patch) });
    ctx.body.dataset.adapter = dupId;
    return dupId;
  };
  const ctx = mountsDialog(tr('Duplicate "{name}"', { name: accountName(a) }), fields, tr('Create & connect'), async (v, { close }) => {
    if (!v.flow) {
      // Create & connect = create AND sign in: the consent starts here when it has not yet
      ctx.body.querySelector('.mounts-drive-connect .mounts-btn-primary')?.click();
      throw new Error(tr('Approve access on the sign-in page (or paste the address back below), then press Create & connect again.'));
    }
    if (v.name && createdName && v.name !== createdName) await capi(`/api/channels/adapters/${enc(dupId)}`, { method: 'PUT', body: JSON.stringify({ label: v.name }) });
    committed = true;
    if (watcher) watcher.off();
    close();
    showToast(tr('{name} created and connected', { name: v.name || copyName }));
  }, {
    onClose: () => {
      if (watcher) watcher.off();
      if (committed || signedIn || !dupId) return;
      fetchJson(`/api/channels/adapters/${enc(dupId)}`, { method: 'DELETE' }).catch(() => {});
    },
  });
  ctx.body.dataset.chanDialog = 'duplicate';
  wireOAuthConnect(ctx, {
    tokenKey: 'flow', backend: a.kind, label: tr('Connect {label}', { label: signin }), provider: signin, pastePlaceholder: PASTE_PLACEHOLDER,
    finishText: tr('✓ Connected — finish with the “Create & connect” button below.'),
    endpoints: {
      start: async () => {
        const vals = readVals();
        const id = await ensure(vals);
        const body = switchesClient({ ...a, credentialKey: cfg.credentialKey, customClient: custom ? { appId: custom.appId } : null }, vals, '', presets) || (vals.client === 'custom' && vals.csec !== ((custom && custom.appSecret) || '')) ? choiceBody(vals) : {};
        const rr = await post(`/api/channels/adapters/${enc(id)}/reauthorize`, body);
        if (watcher) watcher.off();
        watcher = authWatcher(app, id, (rr.adapter && rr.adapter.lastAuthAt) || null);
        return { url: rr.flow && rr.flow.consentUrl, notice: flowNotice(rr.flow) };
      },
      status: async () => {
        const st = watcher ? watcher.state() : {};
        if (st.token) signedIn = true;
        return st.fail ? { error: st.fail } : { token: st.token || null, running: true };
      },
      callback: async (b) => { await post(`/api/channels/adapters/${enc(dupId)}/auth/finish`, { url: b.url }); signedIn = true; return { token: dupId }; },
    },
  });
  return ctx;
}

// ── REMOVE (§8.1 #5, D5: refused BY NAME while referenced) ────────────────
/** Remove an account: confirm → DELETE; `409 account-referenced` opens the
 *  refusal naming each reference. Resolves true when the account is gone. */
export async function removeAccount(app, a) {
  const name = accountName(a);
  const provider = providerOf(a);
  const yes = await showConfirmDialog({ title: tr('Remove "{name}"?', { name }), message: tr('The account record and its conversation list go away (the message logs stay on disk). Nothing is deleted on {provider}.', { provider }), confirmText: tr('Remove'), danger: true });
  if (!yes) return false;
  const r = await fetchJson(`/api/channels/adapters/${enc(a.id)}`, { method: 'DELETE' });
  if (r && r.code === 'account-referenced') { showRemoveRefusedDialog(app, a, (r.detail && r.detail.refs) || []); return false; }
  if (!r || r.error) { showToast(routeErrorText(r), { type: 'error' }); return false; }
  showToast(tr('Removed "{name}"', { name }));
  return true;
}
/** One reference, in words (each a user / vendor string → textContent). */
function refText(ref, outboxN) {
  const who = (p) => (p && (p.name || p.id)) || '?';
  if (ref.kind === 'assignment') return tr('assignment: {conv} → {who}', { conv: ref.title || ref.convId || ref.key, who: who(ref.principal) });
  if (ref.kind === 'reach') return tr('reach: {who} may see the whole account', { who: who(ref.principal) });
  if (ref.kind === 'outbox') return tr('outbox: {n} proposal(s) awaiting approval', { n: outboxN });
  return String(ref.kind || '');
}
export function showRemoveRefusedDialog(app, a, refs) {
  const { body, close } = createModalShell({ id: 'chan-remove-refused', title: tr('Cannot remove "{name}"', { name: accountName(a) }), dialogClass: 'chan-dialog', escapeToClose: true });
  body.dataset.chanDialog = 'remove-refused';
  const warn = el('div', 'chan-flow-refusal chan-warn');
  warn.append(icon('alert', 12), el('span', '', tr('This account is still referenced — release these first:')));
  const list = el('div', 'chan-remove-refs');
  const outboxN = refs.filter((r) => r.kind === 'outbox').length;
  let outboxDrawn = false;
  for (const ref of refs) {
    if (ref.kind === 'outbox') { if (outboxDrawn) continue; outboxDrawn = true; }
    const line = el('div', 'dialog-hint', `· ${refText(ref, outboxN)}`);
    line.dataset.refKind = ref.kind;
    list.appendChild(line);
  }
  const p = el('p', 'dialog-hint', tr('Disconnect only drops the token and keeps these; Remove needs them released first — the same rule as a credential with submounts.'));
  const actions = el('div', 'dialog-actions');
  if (outboxN) actions.appendChild(btn(tr('Open Outbox'), () => { close(); app.openChannelOutbox(); }));
  const done = document.createElement('button');
  done.type = 'button'; done.className = 'btn-create'; done.textContent = tr('Close');
  done.onclick = close;
  actions.appendChild(done);
  body.append(warn, list, p, actions);
  return { close, body };
}
