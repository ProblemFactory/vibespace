// THE WEBHOOK CHANNEL — THE OWNER'S SURFACE (lane webhook-l2-ui, docs/design-webhook.zh.md §12 L2): the section's
// "New path…" wizard, the caller panel (register = the token shown ONCE, HMAC by default, rotate / revoke, delivery)
// and "Send a message…" (one proposal per picked caller, through the agents' `compose --caller` door). Every owner
// action toasts its outcome; no native dialogs; the words and models are DOM-free in webhook-view.js.
//
// THE TOKEN LAW (§9): a register / rotate answer's token goes to showTokenOnce and NOWHERE else — no list row, no
// module state, no re-render; closing that dialog drops the last reference (test-webhook-ui's census + RED control).
import { fetchJson, showToast, createModalShell, showConfirmDialog, copyText } from './utils.js';
import { t } from './i18n.js';
import { icon, el, btn } from './channel-chrome.js';
import { routeErrorText } from './channel-words.js';
import * as V from './webhook-view.js';

const JSON_HDR = { 'Content-Type': 'application/json' };
const BASE = '/api/channels/webhook/paths';
const enc = encodeURIComponent;
const post = (url, body) => fetchJson(url, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body || {}) });
/** a refusal in the server's own words (the validator's detail), else the code worded */
const why = (r) => (r && r.error) || routeErrorText(r);
const hookUrl = (slug) => `${location.origin}/hook/${slug}`;

function whInput(value = '', placeholder = '', type = 'text') {
  const i = el('input', 'chan-opt-input'); i.type = type; i.value = String(value); i.placeholder = placeholder;
  i.autocapitalize = 'off'; i.spellcheck = false; return i;
}
function field(label, ctl, note = null) { const f = el('div', 'chan-wh-field'); f.append(el('div', 'chan-opt-label', label), ctl); if (note) f.appendChild(note); return f; }
function whSelect(opts, value) {
  const s = el('select', 'chan-opt-input');
  for (const o of opts) { const op = el('option', '', o.label); op.value = o.value; op.selected = o.value === value; s.appendChild(op); }
  return s;
}
function whNote(text, warn = false) { return el('div', 'chan-flow-note' + (warn ? ' chan-warn' : ''), text); }
function footer(m, ...buttons) { const f = el('div', 'dialog-footer'); f.append(...buttons); m.dialog.appendChild(f); return f; }
/** The address with Copy — the wizard's last step and the caller panel's head. */
function urlRow(slug) {
  const r = el('div', 'chan-wh-url');
  const code = el('code', 'chan-wh-url-text', hookUrl(slug));
  code.dataset.whUrl = slug;
  const c = btn(t('Copy'), () => copyText(hookUrl(slug)).then(() => showToast(t('Address copied'))), 'chan-wh-copy');
  c.prepend(icon('copy', 11));
  r.append(code, c);
  return r;
}
const deliveryOpts = () => [{ value: 'none', label: t('No replies') }, { value: 'reply-url', label: t('POST replies to a URL') }, { value: 'poll', label: t('It fetches replies (poll)') }];
/** the delivery choice + its URL field (shown only for reply-url) — `.value()` = the wire shape */
function deliveryPicker(d = { mode: 'none' }) {
  const box = el('div', 'chan-wh-delivery');
  const sel = whSelect(deliveryOpts(), d.mode || 'none');
  const url = whInput(d.replyUrl || '', 'https://example.com/hooks/vibespace', 'url');
  const sync = () => { url.style.display = sel.value === 'reply-url' ? '' : 'none'; };
  sel.onchange = sync; sync();
  box.append(sel, url);
  return { box, sel, url, value: () => (sel.value === 'reply-url' ? { mode: 'reply-url', replyUrl: url.value.trim() } : { mode: sel.value }) };
}

/** THE "New path…" WIZARD — slug (judged live by the server's own rule), name, the reply name, the mapping, declared
 *  facts, rate, allow-list (+ the proxy note), policy, wake budget; on create the address with Copy. */
export function showNewPathDialog(app, { adapterId = 'webhook' } = {}) {
  const m = createModalShell({ id: 'chan-wh-new', title: t('New webhook path'), dialogClass: 'chan-wh-dialog', escapeToClose: true });
  m.dialog.dataset.whWizard = '1';
  const slug = whInput('', 'deploys'); slug.dataset.whSlug = '1';
  const slugNote = whNote('', true); slugNote.dataset.whSlugNote = '1';
  const at = el('div', 'chan-flow-note chan-wh-at');
  const title = whInput('', t('e.g. CI deploys'));
  const replyName = whInput('', 'VibeSpace');
  const textPath = whInput('', 'message'), senderKey = whInput('', 'sender.name'), titleKey = whInput('', 'title');
  const facts = [];
  const factsBox = el('div', 'chan-wh-facts');
  const drawFacts = () => {
    factsBox.textContent = '';
    facts.forEach((f, i) => {
      const r = el('div', 'chan-wh-fact');
      const k = whInput(f.key, t('key, e.g. event')), p = whInput(f.path, t('JSON path, e.g. event.type'));
      k.oninput = () => { f.key = k.value.trim(); }; p.oninput = () => { f.path = p.value.trim(); };
      const x = el('button', 'icon-btn'); x.type = 'button'; x.title = t('Remove'); x.setAttribute('aria-label', t('Remove')); x.appendChild(icon('close', 11));
      x.onclick = () => { facts.splice(i, 1); drawFacts(); };
      r.append(k, p, x); factsBox.appendChild(r);
    });
  };
  const addFact = btn(t('Add a fact'), () => { facts.push({ key: '', path: '' }); drawFacts(); }, 'chan-wh-add');
  addFact.prepend(icon('plus', 11));
  const rate = whInput(V.RATE_DEFAULT, '', 'number'); rate.min = '1'; rate.max = '600';
  const wakes = whInput(V.WAKES_DEFAULT, '', 'number'); wakes.min = '1'; wakes.max = '60';
  const ipAllow = whInput('', '203.0.113.7, 198.51.100.0/24');
  const policy = whSelect([{ value: 'direct', label: t('Direct — replies go out at once') }, { value: 'review', label: t('Review — replies wait for your approval') }], 'direct');
  const slugNow = () => {
    const v = slug.value.trim();
    const w = v ? V.slugText(v) : null;
    slugNote.textContent = w || ''; slugNote.style.display = w ? '' : 'none';
    at.textContent = v && !w ? t('Its address: {url}', { url: hookUrl(v) }) : '';
    return !w && !!v;
  };
  slug.oninput = slugNow; slugNow();
  m.body.append(
    field(t('Path name (its address)'), slug, slugNote), at,
    field(t('Title'), title),
    field(t('Replies are signed from'), replyName, whNote(t('Blank = VibeSpace. A caller never sees which agent wrote a reply.'))),
    el('div', 'chan-q', t('Reading a call')),
    field(t('Message text at'), textPath, whNote(t('A JSON path into the call; blank = the whole body as a code block.'))),
    field(t('Sender at'), senderKey), field(t('Title at'), titleKey),
    field(t('Facts rules can match'), factsBox), addFact,
    el('div', 'chan-q', t('Limits')),
    field(t('Calls per minute, per caller'), rate),
    field(t('Wakes per hour for this path'), wakes, whNote(t('Each wake is a billed agent turn; past this the path waits for the next hour.'))),
    field(t('Only from these addresses'), ipAllow, whNote(t('Blank = any address. Judged on the connecting address; behind a reverse proxy set webhook.trustProxyHops.'))),
    field(t('Sending policy'), policy),
  );
  const create = btn(t('Create path'), null, 'mounts-btn-primary');
  create.dataset.whCreate = '1';
  create.onclick = async () => {
    if (!slugNow()) { slug.focus(); return; }
    const s = slug.value.trim();
    const body = { slug: s, title: title.value.trim() || s, rateLimit: Number(rate.value), wakesPerHour: Number(wakes.value),
      ipAllow: ipAllow.value.split(',').map((x) => x.trim()).filter(Boolean), facts: facts.filter((f) => f.key || f.path) };
    for (const [k, inp] of [['replyName', replyName], ['textPath', textPath], ['senderKey', senderKey], ['titleKey', titleKey]]) if (inp.value.trim()) body[k] = inp.value.trim();
    create.disabled = true;
    const r = await post(BASE, body);
    create.disabled = false;
    if (!r || !r.ok) { showToast(t('Path not created: {why}', { why: why(r) }), { type: 'error' }); return; }
    if (policy.value === 'review') {
      const p = await fetchJson(`/api/channels/${enc(adapterId)}/${enc(s)}/policy`, { method: 'PUT', headers: JSON_HDR, body: JSON.stringify({ mode: 'review' }) });
      if (!p || p.error) showToast(t('Path created, but its policy was not saved: {why}', { why: why(p) }), { type: 'warn' });
    }
    showToast(t('Path {slug} created', { slug: s }));
    // THE LAST STEP: the address with Copy, and the next act (a path takes no call until it has a caller)
    m.body.textContent = '';
    m.body.append(whNote(t('Path {slug} is ready. It takes calls once a caller is registered.', { slug: s })), urlRow(s));
    f.textContent = '';
    const reg = btn(t('Register a caller…'), () => { m.close(); showCallersDialog(app, s, { adapterId, title: body.title, register: true }); }, 'mounts-btn-primary');
    f.append(btn(t('Done'), () => m.close()), reg);
  };
  const f = footer(m, btn(t('Cancel'), () => m.close()), create);
  setTimeout(() => slug.focus(), 0);
}

/** THE TOKEN, SHOWN ONCE (§9) — with Copy and how to use it; the ONLY place a token is ever drawn. Closing drops it. */
export function showTokenOnce({ caller, token, rotated = false }) {
  let secret = String(token || '');
  const name = (caller && caller.name) || '';
  const m = createModalShell({ id: 'chan-wh-token', title: rotated ? t('New token for {name}', { name }) : t('Token for {name}', { name }), dialogClass: 'chan-wh-dialog', closeOnBackdrop: false, escapeToClose: true,
    onClose: () => { secret = ''; } });
  m.dialog.dataset.whTokenOnce = '1';
  m.body.appendChild(whNote(t('Shown once — rotate to get a new one.'), true));
  const code = el('code', 'chan-wh-token', secret);
  code.dataset.whToken = '1';
  const copy = btn(t('Copy'), () => copyText(secret).then(() => showToast(t('Token copied'))), 'chan-wh-copy');
  copy.prepend(icon('copy', 11));
  const r = el('div', 'chan-wh-url'); r.append(code, copy);
  m.body.appendChild(r);
  // verify r1 #3: a Bearer caller's limits are SAID where its holder is handed the token
  if (caller && caller.auth === 'bearer') for (const w of V.bearerLimitsText({ t })) m.body.appendChild(whNote(w, true));
  m.body.appendChild(whNote(caller && caller.auth === 'bearer'
    ? t('Send it on each call as Authorization: Bearer <token>.')
    : t('Sign each call: X-Webhook-Caller {id}, X-Webhook-Timestamp (Unix seconds) and X-Webhook-Signature v1=HMAC-SHA256(token, timestamp + ".POST./hook/<path>." + body).', { id: (caller && caller.id) || '' })));
  footer(m, btn(t('Done'), () => m.close(), 'mounts-btn-primary'));
}

/** THE CALLER PANEL of one path: the list (keyed by caller id, patched in place — another client's register lands
 *  live), Register a caller (HMAC by default), Rotate / Revoke (each confirmed), the delivery editor. */
export function showCallersDialog(app, slug, { adapterId = 'webhook', title = '', register = false } = {}) {
  let off = null;
  const m = createModalShell({ id: 'chan-wh-callers', title: t('Callers of {path}', { path: title || slug }), dialogClass: 'chan-wh-dialog', escapeToClose: true, onClose: () => { if (off) off(); off = null; } });
  m.dialog.dataset.whCallersDialog = slug;
  m.body.appendChild(urlRow(slug));
  const list = el('div', 'chan-wh-list');
  list.dataset.whCallers = slug;
  m.body.appendChild(list);
  const rows = new Map();
  let callers = [];
  async function load() {
    const r = await fetchJson(BASE);
    if (!r || !r.ok) { showToast(t('Could not read the callers: {why}', { why: why(r) }), { type: 'error' }); return; }
    const p = (r.paths || []).find((x) => x.hookUrl === `/hook/${slug}`);
    callers = p ? p.callers || [] : [];
    draw();
  }
  function draw() {
    const seen = new Set();
    if (!callers.length) { if (!list.querySelector('.chan-wh-empty')) list.prepend(whNote(t('No caller yet — register one to give a system its token.'))); list.firstChild.classList.add('chan-wh-empty'); }
    else list.querySelector('.chan-wh-empty')?.remove();
    for (const c of callers) {
      const v = V.callerRow(c);
      seen.add(v.id);
      const sig = JSON.stringify(v);
      let row = rows.get(v.id);
      if (row && row.dataset.sig === sig) { list.appendChild(row); continue; }
      const fresh = callerEl(v);
      fresh.dataset.sig = sig;
      if (row) row.replaceWith(fresh); else list.appendChild(fresh);
      rows.set(v.id, fresh);
    }
    for (const [id, row] of rows) if (!seen.has(id)) { row.remove(); rows.delete(id); }
  }
  function callerEl(v) {
    const r = el('div', 'chan-wh-caller' + (v.revoked ? ' chan-wh-revoked' : ''));
    r.dataset.whCaller = v.id;
    const head = el('div', 'chan-wh-caller-head');
    head.append(icon('robot', 12), el('b', 'chan-wh-caller-name', v.name), el('span', 'chan-wh-chip', v.id), el('span', 'chan-wh-chip', v.auth));
    r.appendChild(head);
    r.appendChild(el('div', 'chan-wh-caller-line', v.delivery));
    r.appendChild(el('div', 'chan-wh-caller-line chan-wh-dim', v.facts.join(' · ')));
    if (v.revoked) return r;
    const acts = el('div', 'chan-wh-acts');
    const rot = btn(t('Rotate…'), async () => {
      if (!(await showConfirmDialog({ title: t('Rotate the token'), message: t('Rotate the token of {name}? Its old token stops working at once.', { name: v.name }), confirmText: t('Rotate'), danger: true }))) return;
      const a = await post(`${BASE}/${enc(slug)}/callers/${enc(v.id)}/rotate`, {});
      if (!a || !a.ok) { showToast(t('Not rotated: {why}', { why: why(a) }), { type: 'error' }); return; }
      showTokenOnce({ caller: a.caller, token: a.token, rotated: true });
      load();
    });
    rot.prepend(icon('refresh', 11)); rot.dataset.whRotate = v.id;
    const rev = btn(t('Revoke…'), async () => {
      if (!(await showConfirmDialog({ title: t('Revoke the caller'), message: t('Revoke {name}? Its calls are refused from now on; its messages stay.', { name: v.name }), confirmText: t('Revoke'), danger: true }))) return;
      const a = await post(`${BASE}/${enc(slug)}/callers/${enc(v.id)}/revoke`, {});
      if (!a || !a.ok) { showToast(t('Not revoked: {why}', { why: why(a) }), { type: 'error' }); return; }
      showToast(t('{name} revoked', { name: v.name }));
      load();
    });
    rev.prepend(icon('block', 11)); rev.dataset.whRevoke = v.id;
    const edit = btn(t('Delivery…'), () => {
      if (r.querySelector('.chan-wh-delivery')) return;
      const dp = deliveryPicker({ mode: v.mode, replyUrl: v.replyUrl });
      const save = btn(t('Save'), async () => {
        const a = await post(`${BASE}/${enc(slug)}/callers/${enc(v.id)}/delivery`, { delivery: dp.value() });
        if (!a || !a.ok) { showToast(t('Delivery not saved: {why}', { why: why(a) }), { type: 'error' }); return; }
        showToast(t('Delivery saved'));
        load();
      }, 'mounts-btn-primary');
      dp.box.appendChild(save);
      r.appendChild(dp.box);
    });
    edit.dataset.whDelivery = v.id;
    acts.append(edit, rot, rev);
    r.appendChild(acts);
    return r;
  }
  // REGISTER — folded under its button; the answer's token goes straight to showTokenOnce
  const form = el('div', 'chan-wh-register');
  form.dataset.whRegister = '1';
  const name = whInput('', t('e.g. CI deploy-bot'));
  const authSel = whSelect([{ value: 'hmac', label: t('HMAC-signed (recommended)') }, { value: 'bearer', label: t('Bearer token') }], V.AUTH_MODES[0]);
  const dp = deliveryPicker();
  const go = btn(t('Register'), async () => {
    if (!name.value.trim()) { name.focus(); return; }
    go.disabled = true;
    const a = await post(`${BASE}/${enc(slug)}/callers`, { name: name.value.trim(), auth: authSel.value, delivery: dp.value() });
    go.disabled = false;
    if (!a || !a.ok) { showToast(t('Caller not registered: {why}', { why: why(a) }), { type: 'error' }); return; }
    name.value = '';
    form.style.display = 'none';
    showTokenOnce({ caller: a.caller, token: a.token });
    load();
  }, 'mounts-btn-primary');
  // verify r1 #3: the Bearer limits beside the picker, shown while Bearer is picked
  const bearerNote = whNote(V.bearerLimitsText({ t }).join(' '), true);
  bearerNote.dataset.whBearerLimits = '1';
  bearerNote.hidden = authSel.value !== 'bearer';
  authSel.addEventListener('change', () => { bearerNote.hidden = authSel.value !== 'bearer'; });
  form.append(field(t('Name'), name), field(t('Signing'), authSel, bearerNote), field(t('Replies'), dp.box), go);
  form.style.display = register ? '' : 'none';
  const open = btn(t('Register a caller'), () => { form.style.display = ''; name.focus(); }, 'chan-wh-add');
  open.prepend(icon('plus', 11));
  m.body.append(open, form);
  footer(m, btn(t('Close'), () => m.close()));
  // MULTI-CLIENT: a broadcast naming this path (a caller registered / rotated / revoked on another client) re-reads it
  const key = `${adapterId}/${slug}`;
  off = app && app.ws && typeof app.ws.onGlobal === 'function'
    ? app.ws.onGlobal((msg) => { if (msg && msg.type === 'channels-updated' && (!msg.partial || (Array.isArray(msg.changedKeys) && msg.changedKeys.includes(key)))) load(); }) : null;
  load();
  if (register) setTimeout(() => name.focus(), 0);
}

/** "SEND A MESSAGE…" — the caller picker (All + one box per live caller; delivery none DISABLED WITH ITS REASON beside
 *  it), the text, and one proposal per picked caller; each outcome toasted. */
export async function showSendToCallersDialog(app, slug, { title = '' } = {}) {
  const r = await fetchJson(BASE);
  if (!r || !r.ok) { showToast(t('Could not read the callers: {why}', { why: why(r) }), { type: 'error' }); return; }
  const p = (r.paths || []).find((x) => x.hookUrl === `/hook/${slug}`);
  const callers = p ? p.callers || [] : [];
  const m = createModalShell({ id: 'chan-wh-send', title: t('Send a message on {path}', { path: title || slug }), dialogClass: 'chan-wh-dialog', escapeToClose: true });
  m.dialog.dataset.whSend = slug;
  const picks = V.pickerRows(callers);
  const boxes = [];
  const allLab = el('label', 'dialog-check-row chan-wh-pick');
  const all = document.createElement('input'); all.type = 'checkbox'; all.dataset.whPickAll = '1';
  allLab.append(all, el('span', '', t('All callers that take replies')));
  m.body.appendChild(el('div', 'chan-q', t('To')));
  m.body.appendChild(allLab);
  for (const pk of picks) {
    const lab = el('label', 'dialog-check-row chan-wh-pick' + (pk.disabled ? ' chan-wh-pick-off' : ''));
    const b = document.createElement('input'); b.type = 'checkbox'; b.disabled = pk.disabled; b.dataset.whPick = pk.id;
    lab.append(b, el('span', '', pk.name));
    if (pk.why) lab.appendChild(el('span', 'chan-wh-why', pk.why));
    m.body.appendChild(lab);
    if (!pk.disabled) boxes.push(b);
  }
  if (!picks.length) m.body.appendChild(whNote(t('This path has no caller yet.'), true));
  all.disabled = !boxes.length;
  all.onchange = () => { for (const b of boxes) b.checked = all.checked; };
  for (const b of boxes) b.onchange = () => { all.checked = boxes.every((x) => x.checked); };
  const ta = el('textarea', 'chan-opt-input chan-wh-text'); ta.rows = 3; ta.placeholder = t('Write a message — sent as you, signed from the path\'s reply name');
  m.body.appendChild(ta);
  const send = btn(t('Send'), null, 'mounts-btn-primary');
  send.dataset.whSendGo = '1';
  send.prepend(icon('send', 11));
  send.onclick = async () => {
    const ids = boxes.filter((b) => b.checked).map((b) => b.dataset.whPick);
    if (!ids.length) { showToast(t('Pick at least one caller'), { type: 'warn' }); return; }
    if (!ta.value.trim()) { ta.focus(); return; }
    send.disabled = true;
    const a = await post(`${BASE}/${enc(slug)}/send`, { text: ta.value.trim(), callers: all.checked ? 'all' : ids });
    send.disabled = false;
    const out = V.sendOutcomes(a, callers);
    for (const o of out) showToast(o.text, { type: o.type });
    if (out.some((o) => o.type !== 'error')) m.close();
  };
  footer(m, btn(t('Cancel'), () => m.close()), send);
}
