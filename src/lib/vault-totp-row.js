// TWO-STEP CODES IN THE VAULT WINDOW (design q-047 L1, lane vault-totp — the hub's half: src/server/vault-totp.js over PURE
// src/totp.js). A two-step entry's row (kind 'totp') gets:
//   · 「看码」 → its CURRENT code, the ring of the seconds left and the seconds (GET /api/vault/totp/:name — a person's door with
//     no 「验证是你」: a code dies in seconds, the seed is the secret; every view is a line in the vault's audit). The code is
//     asked again only at its step's boundary, only while this page is visible, at most 10 times (≈ 5 minutes) — then it
//     hides; 「复制」 copies the code (cleared from the clipboard after 30 s when the page can);
//   · 「用于…」 grants the CODE — never the seed — to running conversations and Task Groups (POST /api/vault/totp/:name/grants);
//     the chips list the grants, ✕ takes one back; a conversation's grant ends with that conversation (「已结束」).
// The seed and its settings are the row's own 「显示」 (the window's reveal door — the second password again): its help says so.
// 添加… ▸ 两步验证… (lane vault-totp-add — design q-047 §3's mock, the L2 the owner found missing 2026-10-26: 「我似乎不能添加两步
// 验证在vault里」): `showTotpAddDialog` — ONE dialog, TWO ways in (粘贴 otpauth 链接 · 输入密钥), the hub's PREVIEW before 保存. The
// door is the kind registry's `add` surface for totp (src/vault-kinds.js); the window registers it (src/lib/vault-window.js).
// One ask is on the wire at a time: a click on 预览 or 保存 while one runs waits for it, its button saying so (never a silent
// nothing), and a person's 预览 starts the ten automatic re-asks again, as 看码 does (acceptance r2).
import { t } from './i18n.js';
import { fetchJson, showToast, copyText, createModalShell } from './utils.js';
import { CLIPBOARD_CLEAR_MS } from '../vault-inventory.js';
import { addPlanOf, ADD_DEFAULTS, ADD_CHOICES } from '../totp.js';   // PURE: the add dialog's model (scripts/test-totp.mjs ⑩)
import { showUnlock } from './vault-unlock.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const failWords = (r) => t('Not done — {reason}', { reason: (r && (r.error || r.code)) || t('server unreachable') });
const post = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const AUTO_MAX = 10;   // automatic re-asks after 看码 (one per step) — then the code hides
const grouped = (c) => { const s = String(c || ''); return s.length === 6 ? `${s.slice(0, 3)} ${s.slice(3)}` : s.length === 8 ? `${s.slice(0, 4)} ${s.slice(4)}` : s; };

/** The window's two-step facts: every entry's grants + the picker's subjects (never a value). */
export async function loadTotp() {
  const r = await fetchJson('/api/vault/totp');
  return r && r.ok ? r : null;
}
function subjectName(subject, data) {
  const all = [...((data && data.subjects && data.subjects.sessions) || []), ...((data && data.subjects && data.subjects.groups) || [])];
  const hit = all.find((s) => s.subject === subject);
  return hit ? hit.name : String(subject).replace(/^session:/, '').replace(/^group:/, t('Task group') + ' ');
}

/** A two-step row's extras: `value` (看码 · the code · 复制) for the value column, `box` (the grant chips) for the main
 *  column, `doors` (用于…), `stop()` (the window rebuilt / closed / locked). `show` = the row's 显示 (its help is set here). */
export function totpExtras(row, data, { refresh, signal, show } = {}) {
  const name = String(row.entry || '').replace(/^totp:/, '');
  const entry = ((data && data.entries) || []).find((e) => e.name === name) || { name, grants: [] };
  if (show) show.title = t('Shows the seed and its settings (an otpauth link) — after the second password');
  const viewB = el('button', 'vw-btn vw-code-view', t('View code'));
  viewB.type = 'button';
  viewB.title = t('The current two-step code — no second password; every view is in the vault\'s audit');
  const code = el('span', 'vw-code');
  const ring = el('span', 'vw-ring');
  const digits = el('span', 'vw-code-digits');
  const left = el('span', 'vw-code-left');
  code.append(ring, digits, left);
  code.hidden = true;
  const copyB = el('button', 'vw-btn vw-code-copy', t('Copy'));
  copyB.type = 'button';
  copyB.hidden = true;
  const st = { on: false, code: '', until: 0, period: 30, tick: null, auto: 0, busy: false };

  function draw() {
    const secs = Math.max(0, Math.ceil((st.until - Date.now()) / 1000));
    if (digits.textContent !== grouped(st.code)) digits.textContent = grouped(st.code);
    left.textContent = t('{s} s', { s: secs });
    ring.style.setProperty('--p', `${Math.round((Math.min(secs, st.period) / st.period) * 100)}%`);
    return secs;
  }
  function stop() {
    st.on = false; st.code = ''; st.auto = 0;
    clearInterval(st.tick); st.tick = null;
    digits.textContent = ''; code.hidden = true; copyB.hidden = true;
    viewB.textContent = t('View code');
  }
  async function ask() {
    if (st.busy) return;
    st.busy = true;
    const r = await fetchJson(`/api/vault/totp/${encodeURIComponent(name)}`).catch(() => null);
    st.busy = false;
    if (!st.on || (signal && signal.aborted)) return;
    if (!r || r.ok === false || typeof r.code !== 'string') {
      stop();
      if (r && r.code === 'vault_locked') { refresh?.(); return; }
      showToast(failWords(r), { type: 'error' });
      return;
    }
    st.code = r.code; st.period = Number(r.period) || 30; st.until = Date.now() + (Number(r.secondsLeft) || 0) * 1000;
    code.hidden = false; copyB.hidden = false;
    draw();
  }
  function start() {
    st.on = true; st.auto = 0;
    viewB.textContent = t('Hide code');
    ask();
    st.tick = setInterval(() => {
      if (!st.on || st.busy || !st.code) return;
      if (draw() > 0) return;
      // the step is over: ask again — only while this page is visible, and not past the cap
      if (document.visibilityState !== 'visible' || st.auto >= AUTO_MAX) { stop(); return; }
      st.auto++;
      ask();
    }, 1000);
  }
  viewB.onclick = () => (st.on ? stop() : start());
  copyB.onclick = async () => {
    const v = st.code;
    if (!v) return;
    await copyText(v);
    showToast(t('Copied — cleared from the clipboard in 30 s if this tab stays open'));
    setTimeout(async () => {
      try { if ((await navigator.clipboard.readText()) !== v) return; } catch { /* cannot read it back: clear anyway */ }
      try { await navigator.clipboard.writeText(''); } catch { /* the page is not focused — nothing more it can do */ }
    }, CLIPBOARD_CLEAR_MS);
  };
  signal?.addEventListener('abort', stop, { once: true });

  // 用于…: the grants (chips, ✕ takes one back) and the picker
  const box = el('div', 'vw-ak vw-totp');
  box.dataset.totp = name;
  const grants = el('div', 'vw-ak-grants');
  if (entry.grants.length) {
    grants.append(el('span', 'vw-ak-to', t('Code granted to:')));
    for (const g of entry.grants) {
      const chip = el('span', 'vw-ak-chip');
      chip.dataset.subject = g.subject;
      chip.append(el('span', null, subjectName(g.subject, data) + (g.live === false ? ` (${t('ended')})` : '')));
      const x = el('button', 'vw-ak-x', '✕');
      x.type = 'button'; x.title = t('Take this grant back'); x.setAttribute('aria-label', x.title);
      x.onclick = async () => { const r = await fetchJson(`/api/vault/totp/grants/${encodeURIComponent(g.id)}`, { method: 'DELETE' }); if (!r || !r.ok) showToast(failWords(r), { type: 'error' }); refresh?.(); };
      chip.append(x);
      grants.append(chip);
    }
    box.append(grants);
  }
  const useB = el('button', 'vw-btn vw-totp-grant', t('Use for…'));
  useB.type = 'button';
  useB.title = t('Grant the current code (never the seed) to a running conversation or a task group');
  useB.onclick = () => showTotpGrantPicker(entry, data, { refresh });
  return { value: [viewB, code, copyB], box, doors: [useB], stop };
}

/** 用于…: every running conversation and Task Group, multi-select; checked = granted (a conversation's grant from an earlier
 *  run counts as not granted); unchecking takes a grant back. */
export function showTotpGrantPicker(entry, data, { refresh } = {}) {
  // lane dialog-unsaved-guard: a tick changed and not saved ⇒ ✕ / Esc / the backdrop asks
  const { body, close, raised } = createModalShell({ id: 'vault-totp-grant', key: entry.id, title: t('Grant the code of "{name}" to', { name: entry.name }), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true,
    unsaved: { isDirty: () => boxes.some((b) => b.checked !== had.has(b.value)), save: () => doSave() }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const subjects = (data && data.subjects) || { sessions: [], groups: [] };
  const had = new Map(entry.grants.filter((g) => g.live !== false).map((g) => [g.subject, g.id]));
  const boxes = [];
  const section = (title, list) => {
    if (!list.length) return;
    body.append(el('div', 'vw-ak-sec', title));
    for (const s of list) {
      const lab = el('label', 'vw-ak-pick');
      const cb = el('input');
      cb.type = 'checkbox'; cb.value = s.subject; cb.checked = had.has(s.subject);
      lab.append(cb, el('span', null, s.name));
      body.append(lab);
      boxes.push(cb);
    }
  };
  section(t('Conversations'), subjects.sessions || []);
  section(t('Task groups'), subjects.groups || []);
  if (!boxes.length) body.append(el('div', 'vw-empty', t('Nothing to pick: no conversation is running and there is no task group')));
  body.append(el('div', 'vw-ak-hint', t('A conversation granted the code gets the current code (vibespace-vault totp) — never the seed. A conversation\'s grant ends when that conversation ends.')));
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-totp-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  const doSave = async () => {
    const add = boxes.filter((b) => b.checked && !had.has(b.value)).map((b) => b.value);
    const drop = boxes.filter((b) => !b.checked && had.has(b.value)).map((b) => had.get(b.value));
    let bad = null;
    if (add.length) { const r = await post(`/api/vault/totp/${encodeURIComponent(entry.name)}/grants`, { subjects: add }); if (!r || !r.ok) bad = r || {}; }
    for (const gid of drop) { const r = await fetchJson(`/api/vault/totp/grants/${encodeURIComponent(gid)}`, { method: 'DELETE' }); if (!r || !r.ok) bad = r || {}; }
    if (bad) showToast(failWords(bad), { type: 'error' }); else showToast(t('Saved'));
    close();
    refresh?.();
    return true;
  };
  save.onclick = () => { doSave(); };
  f.append(cancel, save);
  body.parentNode.append(f);
}

/** The add dialog's refusals in the page's words — the model's codes and the hub's (src/routes/vault.js WORDS). */
const ADD_WORDS = {
  bad_uri: () => t('That is not an otpauth://totp/ link — copy it again from the site'),
  hotp_unsupported: () => t('A counter-based (HOTP) code is not supported — only time-based two-step codes'),
  bad_seed: () => t('That is not a two-step seed — a seed is base32: the letters A–Z and the digits 2–7'),
  seed_too_short: () => t('That seed is too short to be a two-step seed'),
  bad_digits: () => t('A two-step code is 6 to 8 digits'),
  bad_period: () => t('A two-step code changes every 15 to 120 seconds'),
  bad_algorithm: () => t('The algorithm is SHA1, SHA256 or SHA512'),
  bad_text: () => t('The issuer or the account is too long or holds a control character'),
  name_required: () => t('Give the code a name'),
  bad_name: () => t('A name is 1–120 letters, digits, “.”, “_” or “-”'),
  exists: (x) => t('A two-step code named “{name}” is in the vault already — pick another name, or delete that one first', { name: x.name }),
  vault_locked: () => t('The vault is locked — unlock it first, then preview again'),
  vault_not_set_up: () => t('The vault is not set up yet — set the second password first'),
  preview_first: () => t('Preview it first — the code it shows is the one your authenticator should show'),
};
const addWords = (r, x = {}) => (ADD_WORDS[r && r.code] ? ADD_WORDS[r.code](x) : failWords(r));

/** 添加… ▸ 两步验证… (design q-047 §3's mock): ONE dialog, TWO ways in — 「粘贴 otpauth 链接」 (the link's issuer, account and
 *  settings shown as facts, the name taken from them) or 「输入密钥」 (the seed + a name + its settings folded under 「高级」, the
 *  standard's defaults). 「预览」 asks the hub for the code the seed makes NOW (POST /api/vault/totp `preview` — nothing stored),
 *  with its ring and seconds, to compare with the authenticator; 「保存」 is drawn only once a preview worked, and goes again
 *  at any change. Every refusal says its words here (locked ⇒ 「解锁…」 first — nothing greyed). The seed and the link are
 *  masked fields (显示 toggles them), wiped at EVERY close; the page keeps nothing of either after it. */
export function showTotpAddDialog({ refresh = () => {} } = {}) {
  const st = { way: 'link', shown: null, saved: false, tick: null, until: 0, period: 30, auto: 0, inflight: null, nameTouched: false, closed: false };
  const wipe = () => {
    st.closed = true; st.shown = null;
    clearInterval(st.tick); st.tick = null;
    link.value = ''; seed.value = ''; digitsEl.textContent = '';
  };
  const { dialog, body, close } = createModalShell({ id: 'vault-totp-add', title: t('Add a two-step code'), dialogClass: 'vault-dialog-box vault-totp-add-dialog', escapeToClose: true,
    onClose: () => wipe(),
    unsaved: { isDirty: () => !st.saved && !!(link.value || seed.value), save: () => doSave(), discard: () => wipe() } });
  const field = (label, ...controls) => { const l = el('label', 'vault-secret-field'); l.append(el('span', 'vault-secret-label', label), ...controls); return l; };
  const masked = (cls, ph) => {
    const i = el('input', `vault-pw ${cls}`);
    i.type = 'password'; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = ph;
    const b = el('button', 'vw-btn vt-reveal', t('Show'));
    b.type = 'button'; b.title = t('Show what you typed — only in this dialog');
    b.onclick = () => { const on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.textContent = on ? t('Hide') : t('Show'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    b.setAttribute('aria-pressed', 'false');
    const row = el('span', 'vt-masked');
    row.append(i, b);
    return { i, row };
  };
  // the two ways (a segmented pair — both drawn, the other's fields hidden)
  const ways = el('div', 'vt-ways');
  ways.setAttribute('role', 'tablist');
  const wayB = (id, label) => { const b = el('button', 'vw-chip vt-way', label); b.type = 'button'; b.dataset.way = id; b.setAttribute('role', 'tab'); b.onclick = () => pickWay(id); ways.append(b); return b; };
  const linkB = wayB('link', t('Paste an otpauth link')), seedB = wayB('seed', t('Type the seed'));
  // 粘贴 otpauth 链接
  const paneLink = el('div', 'vt-pane vt-pane-link');
  const L = masked('vt-link', 'otpauth://totp/…');
  const link = L.i;
  const facts = el('div', 'vt-facts');
  facts.hidden = true;
  paneLink.append(field(t('The otpauth link (the site shows it under its QR code, or an authenticator exports it)'), L.row), facts);
  // 输入密钥
  const paneSeed = el('div', 'vt-pane vt-pane-seed');
  const S = masked('vt-seed', '');
  const seed = S.i;
  const adv = el('details', 'vt-adv');
  const advGrid = el('div', 'vt-adv-grid');
  adv.append(el('summary', null, t('Advanced')), advGrid);
  const choice = (cls, label, list, def, word) => {
    const sel = el('select', `vt-set ${cls}`);
    for (const v of list) { const o = el('option', null, word(v)); o.value = String(v); o.selected = v === def; sel.append(o); }
    advGrid.append(field(label, sel));
    return sel;
  };
  const digitsSel = choice('vt-digits', t('Digits'), ADD_CHOICES.digits, ADD_DEFAULTS.digits, (v) => t('{n} digits', { n: v }));
  const periodSel = choice('vt-period', t('A new code every'), ADD_CHOICES.period, ADD_DEFAULTS.period, (v) => t('{s} s', { s: v }));
  const algoSel = choice('vt-algo', t('Algorithm'), ADD_CHOICES.algorithm, ADD_DEFAULTS.algorithm, (v) => v);
  paneSeed.append(field(t('Seed — the letters A–Z and the digits 2–7 the site shows (spaces are fine)'), S.row), adv);
  paneSeed.hidden = true;
  // the name (both ways): from the link's issuer and account until a person types one
  const name = el('input', 'vault-pw vt-name');
  name.type = 'text'; name.autocomplete = 'off'; name.spellcheck = false; name.placeholder = t('e.g. github-owner — how the vault lists it');
  // 预览: the code the seed makes NOW (the hub's), its ring and its seconds
  const prev = el('div', 'vt-preview');
  const prevB = el('button', 'vw-btn vt-preview-b', t('Preview'));
  prevB.type = 'button';
  prevB.title = t('The code this seed makes right now — nothing is stored; compare it with your authenticator');
  const code = el('span', 'vw-code vt-code');
  const ring = el('span', 'vw-ring');
  const digitsEl = el('span', 'vw-code-digits');
  const left = el('span', 'vw-code-left');
  code.append(ring, digitsEl, left);
  code.hidden = true;
  const same = el('span', 'vt-same', t('The same code as your authenticator shows? Then save it.'));
  same.hidden = true;
  prev.append(prevB, code, same);
  const err = el('div', 'vault-secret-error vt-err'); err.setAttribute('role', 'status');
  const unlockB = el('button', 'vw-btn vt-unlock', t('Unlock…'));
  unlockB.type = 'button'; unlockB.hidden = true;
  unlockB.onclick = () => showUnlock();
  const errRow = el('div', 'vt-err-row');
  errRow.append(err, unlockB);
  body.append(ways, paneLink, paneSeed, field(t('Name'), name), prev, errRow,
    el('div', 'vw-ak-hint', t('After saving, the window shows its current code; the seed shows only behind Show (the second password again). Clear the link from your clipboard.')));
  const foot = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vt-save', t('Save to vault'));
  cancel.type = save.type = 'button';
  save.hidden = true;   // drawn once a preview worked (never a greyed button)
  foot.append(cancel, save);
  dialog.append(foot);
  cancel.onclick = () => close();

  const planNow = () => addPlanOf({ way: st.way, uri: link.value, seed: seed.value, name: name.value, digits: digitsSel.value, period: periodSel.value, algorithm: algoSel.value }, { now: Date.now() });
  const say = (r, x) => { err.textContent = r ? addWords(r, x) : ''; unlockB.hidden = !(r && r.code === 'vault_locked'); };
  function stopCode() { clearInterval(st.tick); st.tick = null; code.hidden = true; same.hidden = true; digitsEl.textContent = ''; }
  /** Any change: the preview no longer speaks for what the dialog holds — 保存 goes until the next one. */
  function stale() { st.shown = null; st.auto = 0; stopCode(); save.hidden = true; say(null); }
  function drawFacts(p) {
    const f = p && p.facts;
    facts.hidden = !(f && st.way === 'link');
    if (!f) { facts.textContent = ''; return; }
    facts.textContent = '';
    const who = [f.issuer, f.account].filter(Boolean).join(' · ') || t('No issuer or account in the link');
    facts.append(el('b', 'vt-who', who), el('span', 'vt-set-words', t('{digits} digits · every {period} s · {algorithm}', { digits: f.digits, period: f.period, algorithm: f.algorithm })));
  }
  function pickWay(id) {
    st.way = id;
    for (const b of [linkB, seedB]) { const on = b.dataset.way === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
    paneLink.hidden = id !== 'link'; paneSeed.hidden = id !== 'seed';
    stale(); drawFacts(id === 'link' && link.value ? planNow() : null);
    setTimeout(() => (id === 'link' ? link : seed).focus(), 0);
  }
  link.addEventListener('input', () => {
    stale();
    if (!link.value.trim()) { drawFacts(null); return; }
    const p = planNow();
    drawFacts(p);
    if (!st.nameTouched && p.facts && (p.ok || p.field === 'name')) name.value = p.ok ? p.name : '';
    if (!p.ok && p.field === 'uri') say(p);
  });
  name.addEventListener('input', () => { st.nameTouched = name.value.trim() !== ''; stale(); });
  seed.addEventListener('input', stale);
  for (const sel of [digitsSel, periodSel, algoSel]) sel.addEventListener('change', stale);

  function drawCode() {
    const secs = Math.max(0, Math.ceil((st.until - Date.now()) / 1000));
    left.textContent = t('{s} s', { s: secs });
    ring.style.setProperty('--p', `${Math.round((Math.min(secs, st.period) / st.period) * 100)}%`);
    return secs;
  }
  /** ONE ask on the wire at a time (`st.inflight` = { kind, body, done }). A click while one runs WAITS for it, its own button
   *  saying so (预览 «Previewing…», 保存 «Saving…»), and runs when it settles — never a silent nothing (acceptance r2); a click
   *  the ask on the wire already answers JOINS it. The step's own re-ask never waits behind anything. */
  function onWire(kind, body, fn) {
    const done = (async () => { try { return await fn(); } finally { if (st.inflight && st.inflight.done === done) st.inflight = null; } })();
    st.inflight = { kind, body, done };
    return done;
  }
  async function preview({ again = false } = {}) {
    if (st.closed) return;
    if (!again) st.auto = 0;   // a person's 预览 starts the step budget again — as the row's 看码 does (acceptance r2)
    if (st.inflight) {
      if (again) return;
      prevB.textContent = t('Previewing…');   // the click waits for the ask on the wire — said on its button
      while (st.inflight) {
        const w = st.inflight, p0 = planNow();
        if (w.kind === 'preview' && p0.ok && JSON.stringify(p0.body) === w.body) return w.done;   // the ask on the wire IS this preview
        await w.done;
      }
      if (st.closed) return;
    }
    const p = planNow();
    if (!p.ok) { prevB.textContent = t('Preview'); stale(); drawFacts(st.way === 'link' ? p : null); say(p); return; }
    const body = JSON.stringify(p.body);
    if (!again) prevB.textContent = t('Previewing…');   // every vault wait is said (lane vault-slow-load)
    return onWire('preview', body, async () => {
      const r = await post('/api/vault/totp', { ...p.body, preview: true }).catch(() => null);
      prevB.textContent = t('Preview');
      if (st.closed) return;
      if (JSON.stringify(planNow().body || null) !== body) return;   // typed on meanwhile: that answer speaks for nothing
      if (!r || !r.ok || typeof r.code !== 'string') { stale(); say(r || {}); return; }
      if (r.exists) { stale(); say({ code: 'exists' }, { name: r.name }); return; }
      say(null);
      st.shown = body;
      st.period = Number(r.period) || p.facts.period || 30;
      st.until = Date.now() + (Number(r.secondsLeft) || 0) * 1000;
      digitsEl.textContent = grouped(r.code);
      code.hidden = false; same.hidden = false; save.hidden = false;
      drawCode();
      if (!st.tick) {
        st.tick = setInterval(() => {
          if (st.closed || st.inflight || !st.shown) return;
          if (drawCode() > 0) return;
          // the step is over: the next code — while this page is visible, at most 10 times (then 预览 again)
          if (document.visibilityState !== 'visible' || st.auto >= AUTO_MAX) { const keep = st.shown; stopCode(); st.shown = keep; return; }
          st.auto++;
          preview({ again: true });
        }, 1000);
      }
    });
  }
  prevB.onclick = () => preview();
  async function doSave() {
    if (st.closed) return false;
    if (st.inflight) {
      save.textContent = t('Saving…');   // the click waits for the ask on the wire — said on its button — then saves what it showed
      while (st.inflight) { const w = st.inflight; if (w.kind === 'save') return w.done; await w.done; }   // a save on the wire IS this click's
      save.textContent = t('Save to vault');
      if (st.closed) return false;
      if (!st.shown) { if (!err.textContent) say({ code: 'preview_first' }); return false; }   // the preview it waited for refused: its words stand
    }
    const p = planNow();
    if (!p.ok) { stale(); say(p); return false; }
    if (!st.shown || JSON.stringify(p.body) !== st.shown) { stale(); say({ code: 'preview_first' }); return false; }
    save.textContent = t('Saving…');
    return onWire('save', st.shown, async () => {
      const r = await post('/api/vault/totp', p.body).catch(() => null);
      save.textContent = t('Save to vault');
      if (r && r.ok) {
        st.saved = true;
        close();
        showToast(t('Added “{name}” — View code shows its current code', { name: p.name }));   // the name the dialog sent (the hub stored it under exactly that)
        try { refresh(); } catch { /* the window is gone */ }
        return true;
      }
      if (r && r.code === 'exists') { stale(); say(r, { name: p.name }); return false; }
      say(r || {});
      return false;
    });
  }
  save.onclick = () => { doSave(); };
  pickWay('link');
  return { dialog, close };
}
