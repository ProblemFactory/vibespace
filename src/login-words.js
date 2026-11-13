'use strict';
// THE SIGN-IN PAGE'S WORDS (lane ui-language pick 5, the UI walk's first-run-3: «Enter the workspace password» / «Sign in»
// in English on a Chinese device). The page is served BEFORE sign-in — the bundle and its dictionaries cannot load there —
// so its words live here, whole sentences in each language (the consent-road LANDING pattern). The server renders the
// language the browser asks for (consent-road landingLang); the page's own script re-applies this device's choice
// (localStorage `vibespace.lang`, the app's per-device rule). The server's refusals travel as CODES (`wrong-password`,
// `too-many`) the page words. PURE. test-ui-language ⑧ holds every row whole in en / zh / ja.
const LOGIN_WORDS = Object.freeze({
  title: Object.freeze({ en: 'VibeSpace — Sign in', zh: 'VibeSpace — 登录', ja: 'VibeSpace — サインイン' }),
  subPassword: Object.freeze({ en: 'Enter the workspace password', zh: '输入工作区密码', ja: 'ワークスペースのパスワードを入力してください' }),
  subSso: Object.freeze({ en: 'Sign in with your organization account', zh: '用你的组织账号登录', ja: '組織のアカウントでサインインしてください' }),
  password: Object.freeze({ en: 'Password', zh: '密码', ja: 'パスワード' }),
  signIn: Object.freeze({ en: 'Sign in', zh: '登录', ja: 'サインイン' }),
  or: Object.freeze({ en: 'or', zh: '或', ja: 'または' }),
  ssoLoading: Object.freeze({ en: 'Loading SSO…', zh: '正在加载单点登录…', ja: 'SSO を読み込み中…' }),
  ssoSignIn: Object.freeze({ en: 'Sign in with SSO', zh: '使用单点登录（SSO）登录', ja: 'SSO でサインイン' }),
  signingIn: Object.freeze({ en: 'Signing in…', zh: '正在登录…', ja: 'サインイン中…' }),
  ssoUnavailable: Object.freeze({ en: 'SSO unavailable', zh: '单点登录不可用', ja: 'SSO を利用できません' }),
  ssoFailed: Object.freeze({ en: 'SSO failed', zh: '单点登录失败', ja: 'SSO に失敗しました' }),
  switchAccount: Object.freeze({ en: 'Switch account', zh: '换个账号', ja: 'アカウントを切り替える' }),
  loginFailed: Object.freeze({ en: 'Sign-in failed', zh: '登录失败', ja: 'サインインに失敗しました' }),
  network: Object.freeze({ en: 'Network error — try again', zh: '网络出错，请再试一次', ja: 'ネットワークエラーです。もう一度お試しください' }),
  'wrong-password': Object.freeze({ en: 'Wrong password — try again', zh: '密码不对，请再试一次', ja: 'パスワードが違います。もう一度お試しください' }),
  'too-many': Object.freeze({ en: 'Too many attempts — wait a minute', zh: '尝试次数太多，请等一分钟', ja: '試行回数が多すぎます。1 分待ってください' }),
});
const LANGS = Object.freeze(['en', 'zh', 'ja']);
/** The page's words in one language (an unknown language reads English). */
function loginWords(lang) {
  const l = LANGS.includes(lang) ? lang : 'en';
  return Object.fromEntries(Object.entries(LOGIN_WORDS).map(([k, v]) => [k, v[l] || v.en]));
}
module.exports = { LOGIN_WORDS, LANGS, loginWords };
