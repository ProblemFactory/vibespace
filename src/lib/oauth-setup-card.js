// THE OAUTH SETUP CARD (lane oauth-setup-instructions, the owner 2026-10-23: «web application 的话，在集群外部署你是不是应该提供一下
// redirect uri 有关的 instruction，不然用户会懵逼吧») — the ONE component every surface draws for a person setting up their own
// vendor app: the Connect dialog's fold BEFORE the first attempt (src/lib/channel-account-dialogs.js), ⚙ → Integrations
// (src/lib/integrations-window.js, a card per account type) and the refusal fold's console line. The model is PURE
// src/oauth-setup.js `setupCard` over the kinds digest's `oauthSetup` facts + the registry row's `redirect` block + this
// page's own origin; this file only draws it: which client to create and why, the exact addresses — each with Copy and
// a word on when it is used, the one a sign-in from this page uses NOW marked —, the console path with its link, where
// the client ID and secret go, and the vendor's own refusal words. Every string through textContent (XSS law).
import { t } from './i18n.js';
import { copyText, showToast } from './utils.js';
import { icon } from './channel-chrome.js';
import * as R from '../integration-registry.js';
import * as OS from '../oauth-setup.js';   // PURE: the card's model and its words (deploy/README.md renders the same)

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pageOrigin = () => { try { return location.origin; } catch { return null; } };

/** The sign-in brand of an account type (Gmail → Google) — the registry row's `signinName`, else its label's first half. */
export const providerOfRow = (row) => (row && (row.signinName || String(row.label || '').split(' / ')[0])) || '';

/** The card's model for a kinds-digest entry (`spec`: kind, integration, oauthSetup) — `preset` = the company preset the
 *  dialog names ({key, label} — its `oauthSetup.presets` facts are looked up here), `clientType` = the account's option. */
export function setupModelOf(spec, { preset = null, clientType = '' } = {}) {
  const row = spec && spec.integration ? R.rowById(spec.integration) : null;
  const f = spec && spec.oauthSetup;
  if (!row || !row.redirect || !f) return null;
  const pf = preset ? ((f.presets || []).find((p) => p.key === preset.key) || { key: preset.key, relayPage: null, clientType: null }) : null;
  return OS.setupCard({
    kind: spec.kind, redirect: row.redirect, base: f.base || '', relayPages: f.relayPages || [], origin: pageOrigin(),
    preset: pf ? { key: pf.key, label: preset.label || pf.key, relayPage: pf.relayPage || null } : null,
    clientType: clientType || (pf && pf.clientType) || '',
  });
}

/** One address: the exact text (selectable) + Copy (a toast names what was copied). */
function copyRow(uri) {
  const row = el('div', 'integ-cb-row oauth-setup-uri');
  const code = el('code', 'integ-cb-url', uri);
  const btn = el('button', 'mounts-btn integ-copy');
  btn.type = 'button';
  const label = el('span', null, t('Copy'));
  btn.append(icon('copy', 11), label);
  btn.onclick = async () => {
    await copyText(uri);
    label.textContent = t('Copied'); btn.dataset.copied = '1';
    showToast(t('Copied: {text}', { text: uri }));
    setTimeout(() => { label.textContent = t('Copy'); delete btn.dataset.copied; }, 1500);
  };
  row.append(code, btn);
  return row;
}

/** THE CARD — `model` = setupCard's answer, `provider` = the sign-in brand. */
export function renderSetupCard(model, { provider = '' } = {}) {
  const card = el('div', 'integ-setup oauth-setup');
  card.dataset.kind = model.kind; card.dataset.who = model.who;
  const p = { provider, kind: model.kind, host: model.host || '<host>', path: model.console ? t(model.console.path) : '', error: model.refusal || '' };
  card.appendChild(el('div', 'integ-setup-title', t(model.who === 'self' ? OS.WORDS['title.self'] : OS.WORDS.title, p)));
  // 1. WHICH client to create, and why
  const create = el('div', 'oauth-setup-create');
  create.dataset.create = model.create.key;
  const createText = model.create.key === 'app' ? (model.appWords ? t(model.appWords) : '') : t(OS.WORDS[`create.${model.create.key}`], p);
  create.appendChild(el('div', 'plugin-detail oauth-setup-create-what', createText));
  if (model.create.why) create.appendChild(el('div', 'mounts-field-hint oauth-setup-why', t(OS.WORDS[`why.${model.create.why}`], p)));
  if (model.create.alt) create.appendChild(el('div', 'mounts-field-hint oauth-setup-alt', t(OS.WORDS[`alt.${model.create.alt}`], p)));
  if (model.clientType === 'desktop' && model.create.key === 'web') create.appendChild(el('div', 'mounts-field-hint plugin-cfg-warn oauth-setup-said', t(OS.WORDS['said.desktop'], p)));
  card.appendChild(create);
  // 2. THE ADDRESSES, where they go
  if (model.rows.length) {
    if (model.console) {
      const reg = el('div', 'plugin-detail oauth-setup-register', t(OS.WORDS.register, p));
      for (const l of model.console.links) {
        const a = el('a', 'oauth-setup-console', t(l.label));   // a declared key (a brand alone — Lark, 飞书 — has no entry and stays itself)
        a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.title = t(OS.WORDS.console);
        reg.append(' ', a);
      }
      card.appendChild(reg);
    }
    const list = el('ul', 'oauth-setup-rows');
    for (const x of model.rows) {
      const li = el('li', 'oauth-setup-row');
      li.dataset.row = x.key;
      if (x.now) li.dataset.now = '1';
      const words = el('div', 'mounts-field-hint oauth-setup-row-words', t(OS.rowWords(x), p));
      if (x.now) words.append(' ', el('span', 'integ-chip integ-chip-user oauth-setup-now', t(OS.WORDS.now)));
      li.appendChild(words);
      if (x.uri) li.appendChild(copyRow(x.uri));
      if (x.key === 'public' && !x.active && model.who === 'custom') li.appendChild(el('div', 'mounts-field-hint oauth-setup-inactive', t(OS.WORDS.inactive)));
      list.appendChild(li);
    }
    card.appendChild(list);
  }
  if (model.now && model.now.road === 'loopback' && !model.now.uri) card.appendChild(el('div', 'mounts-field-hint oauth-setup-now-ephemeral', t(OS.WORDS['now.ephemeral'])));
  // 3. where the client ID and secret go; 4. the vendor's own refusal words; the last resort
  card.appendChild(el('div', 'plugin-detail oauth-setup-where', t(OS.WORDS[`where.${model.where}`], p)));
  if (model.refusal) {
    const ref = el('div', 'mounts-field-hint oauth-setup-refusal', t(OS.WORDS.refusal, p));
    card.appendChild(ref);
    if (model.clientTypes) card.appendChild(el('div', 'mounts-field-hint oauth-setup-refusal-desktop', t(OS.WORDS['refusal.desktop'], p)));
  }
  if (model.who !== 'self') card.appendChild(el('div', 'mounts-field-hint oauth-setup-last', t(OS.WORDS.last)));
  return card;
}

/** lane channel-row-notices (the owner 2026-10-23: the Channels row's five-line install paragraph «很丑陋»): THE PUSH LANE'S
 *  STEPS under «Real-time push — optional» — the kinds digest's `pushSetup` (the live lane's own declaration): each step's
 *  words and its exact text with Copy, then the line after them. The account row's ⓘ points here. null without steps. */
export function pushSetupFold(spec) {
  const s = spec && spec.pushSetup;
  if (!s || !Array.isArray(s.steps) || !s.steps.length) return null;
  const fold = el('details', 'oauth-setup-fold push-setup-fold');
  fold.dataset.kind = spec.kind; fold.dataset.who = 'push';
  fold.appendChild(el('summary', 'plugin-detail', t('Real-time push — optional')));
  const list = el('ol', 'oauth-setup-rows push-setup-steps');
  for (const x of s.steps) {
    const li = el('li', 'oauth-setup-row push-setup-step');
    li.appendChild(el('div', 'mounts-field-hint', t(x.words)));
    if (x.code) li.appendChild(copyRow(x.code));
    list.appendChild(li);
  }
  fold.appendChild(list);
  if (s.after) fold.appendChild(el('div', 'mounts-field-hint push-setup-after', t(s.after)));
  return fold;
}

/** The Connect dialog's FOLD — closed, one line naming what is inside; the card on open (drawn once, on the first open). */
export function setupFold(spec, opts = {}) {
  const model = setupModelOf(spec, opts);
  if (!model) return null;
  const row = R.rowById(spec.integration);
  const provider = providerOfRow(row);
  const fold = el('details', 'oauth-setup-fold');
  fold.dataset.kind = spec.kind; fold.dataset.who = model.who;
  const sum = el('summary', 'mounts-field-hint', t(OS.WORDS.fold, { provider }));
  fold.appendChild(sum);
  fold.appendChild(renderSetupCard(model, { provider }));
  return fold;
}

/** The refusal fold's console words (after an attempt): the vendor's own error and WHERE the missing address goes — the
 *  same facts as the card's own lines. `x` = the dialog's spec, `https` = the address the sign-in asked for is https. */
export function refusalNotes(x, { https = false } = {}) {
  const row = x && x.integration ? R.rowById(x.integration) : null;
  const r = row && row.redirect;
  if (!r || r.selfRegisters || !r.console) return [];
  const p = { provider: providerOfRow(row), error: r.refusal, path: t(r.console.path) };
  const out = [t(OS.WORDS.refusal, p), t(OS.WORDS.register, p).replace(/:$/, '.')];
  if (r.clientTypes && https) out.push(t(OS.WORDS['refusal.desktop'], p));
  return out;
}
