import zh from './i18n-zh.js';
import ja from './i18n-ja.js';

/**
 * Minimal gettext-style i18n. The ENGLISH STRING IS THE KEY — `t('New Session')`,
 * `t('Delete "{name}"?', { name })`. A missing dictionary entry falls back to the
 * English original, so partial coverage never breaks the UI.
 *
 * Language is a PER-DEVICE choice (localStorage `vibespace.lang`: auto|en|zh|ja;
 * auto = navigator.language) — deliberately NOT a synced setting, so a Japanese
 * phone and an English desktop can share one server. Switching reloads the page;
 * there is no live re-render machinery, which lets t() be called anywhere
 * including module top-level (settings-schema).
 */

const DICTS = { zh, ja };
const STORAGE_KEY = 'vibespace.lang';
const hasDom = typeof localStorage !== 'undefined' && typeof navigator !== 'undefined';

export function getLangPref() {
  if (!hasDom) return 'en';
  return localStorage.getItem(STORAGE_KEY) || 'auto';
}

export function resolveLang() {
  const pref = getLangPref();
  if (pref !== 'auto') return pref;
  const nav = ((hasDom && navigator.language) || 'en').toLowerCase();
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

const _dict = DICTS[resolveLang()] || null;

export function t(str, params) {
  let s = (_dict && _dict[str]) || str;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  return s;
}

export function setLang(lang) {
  if (!hasDom) return;
  if (lang === 'auto') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, lang);
  location.reload();
}

/**
 * Translate index.html static text at boot. `data-i18n` on an element whose
 * ENTIRE content is the English text (no child elements); `data-i18n-attr`
 * lists attribute names ("title,placeholder") whose values are English keys.
 * No-op in English, so untagged/dynamic elements are never touched.
 */
export function applyI18nToDom(root = document.body) {
  if (!_dict) return;
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = el.textContent.trim();
    if (_dict[key]) el.textContent = _dict[key];
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const attr of el.getAttribute('data-i18n-attr').split(',')) {
      const a = attr.trim();
      const v = el.getAttribute(a);
      if (v && _dict[v]) el.setAttribute(a, _dict[v]);
    }
  }
}
