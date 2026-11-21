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
  // B-dc3f: the sign-in file is there but cannot be read — the instance is HELD closed (src/auth.js refuseHeld)
  'signin-held': Object.freeze({ en: 'Sign-in is on hold: the sign-in file is there but cannot be read, so nobody can sign in and nothing is open.', zh: '登录已暂停：登录文件还在，但读不出来，所以谁都登录不了，也没有任何东西对外开放。', ja: 'サインインを停止中です。サインインのファイルはありますが読めないため、誰もサインインできず、何も開いていません。' }),
  'signin-held-fix': Object.freeze({ en: 'If the file looks whole, restart VibeSpace first: a read can fail for a moment. Otherwise restore data/auth.json from a backup and restart, or remove it and restart to start with no sign-in.', zh: '如果这个文件看起来是完整的，请先重启 VibeSpace：读取可能只是一时失败。否则请从备份恢复 data/auth.json 后重启；或者删除它再重启，以不设登录的方式启动。', ja: 'ファイルが壊れていないように見えるなら、まず VibeSpace を再起動してください。読み取りが一時的に失敗しただけかもしれません。そうでなければ data/auth.json をバックアップから戻して再起動するか、削除して再起動し、サインインなしで始めてください。' }),
  // B-dc3f round (主开发 r1148 1): with single sign-on on, the hold closes only what the file guards — SSO still signs people in
  'signin-held-sso': Object.freeze({ en: 'Password sign-in is on hold: the sign-in file is there but cannot be read. Single sign-on still works; its logins last only until VibeSpace restarts.', zh: '密码登录已暂停：登录文件还在，但读不出来。单点登录仍然可用，但登录状态只保留到 VibeSpace 重启为止。', ja: 'パスワードでのサインインを停止中です。サインインのファイルはありますが読めません。シングルサインオンは使えますが、そのサインインは VibeSpace を再起動するまでしか続きません。' }),
  'signin-held-sso-fix': Object.freeze({ en: 'If the file looks whole, restart VibeSpace first: a read can fail for a moment. Otherwise restore data/auth.json from a backup, or remove it (single sign-on still guards; the password and the saved logins are gone), then restart.', zh: '如果这个文件看起来是完整的，请先重启 VibeSpace：读取可能只是一时失败。否则请从备份恢复 data/auth.json，或者删除它（单点登录仍会把关，但密码和已保存的登录会丢失），然后重启。', ja: 'ファイルが壊れていないように見えるなら、まず VibeSpace を再起動してください。読み取りが一時的に失敗しただけかもしれません。そうでなければ data/auth.json をバックアップから戻すか、削除してください（シングルサインオンは引き続き守りますが、パスワードと保存されたサインインは消えます）。そのあと再起動してください。' }),
});
const LANGS = Object.freeze(['en', 'zh', 'ja']);
/** The page's words in one language (an unknown language reads English). */
function loginWords(lang) {
  const l = LANGS.includes(lang) ? lang : 'en';
  return Object.fromEntries(Object.entries(LOGIN_WORDS).map(([k, v]) => [k, v[l] || v.en]));
}
module.exports = { LOGIN_WORDS, LANGS, loginWords };
