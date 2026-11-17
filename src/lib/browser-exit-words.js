// THE EXIT CHECK'S WORDS (主开发 2026-11-17 18:36Z, from the pictures' look) — PURE (imports nothing; node-imported by
// scripts/test-browser-exit.mjs). LAW: every sentence a person reads in «Check the exit…» is the PAGE's, in the page's language, chosen
// by the answer's CODE (or, for an unreadable answer, its KIND). What a server or a proxy said in its own words rides AFTER the page's
// sentence as DATA (a status number, a proxy's own line) — never as the sentence. A code with no row here is named by its code.

/** The kinds src/browser-exit.js readExitAnswer answers for an unreadable answer. */
export const EXIT_KINDS = Object.freeze(['redirect', 'status', 'empty', 'html', 'text', 'json']);

/** An unreadable answer's sentence by its kind (`status` = the number the address answered, shown as data). */
export function exitKindWords(kind, t) {
  switch (kind) {
    case 'redirect': return t('The check address answered with a redirect — a redirect is never followed.');
    case 'status': return t('The check address answered with an error status.');
    case 'empty': return t('The check address answered nothing.');
    case 'html': return t('The check address answered a web page, not JSON.');
    case 'text': return t('The check address answered plain text, not JSON.');
    case 'json': return t('The check address answered JSON without an address, a country or a time zone in it.');
    default: return t('The check address answered something that could not be read.');
  }
}

/** → { text, data, known } — `text` the page's sentence (in the page's language), `data` what the far side said (shown after it,
 *  as data), `known` false when the code has no row here (then named by its code — never the server's sentence). */
export function exitWords(code, t, { kind = '', status = 0, detail = '' } = {}) {
  const row = (text, data = '') => ({ text, data: String(data || ''), known: true });
  switch (code) {
    case 'exit_no_proxy': return row(t('This profile has no proxy of its own — its browser may leave by another road, so a check here could state an exit it does not use. Type the exit by hand if a plugin needs it.'));
    case 'exit_external_browser': return row(t('This profile attaches to a browser VibeSpace does not start — that browser leaves by its own settings, so a check here could state an exit it does not use. Type the exit by hand if a plugin needs it.'));
    case 'exit_url_unset': return row(t('No exit check address is set — give one below (an https address you trust), or type the exit by hand.'));
    case 'exit_url_invalid': return row(t('The exit check address must be a public https address with no user name or password in it.'));
    case 'exit_restart_first': return row(t('This browser runs on another road than its proxy now names (the address or its login changed since it started) — restart it, then check the exit.'));
    case 'proxy_credential_unreadable': return row(t('The proxy\'s login is in the vault, which is locked — a person unlocks it on this instance\'s page (Unlock…), then checks again.'));
    case 'proxy_password_in_profile': return row(t('Its proxy address carries its password, which is never used — press «Move the password to the vault» in ⋯ first.'));
    case 'proxy_scheme_unsupported': return row(t('Its proxy is socks4, which cannot carry a site\'s name — give an http, https or socks5 proxy in Proxy….'));
    case 'proxy_off_machine': return row(t('A browser profile\'s proxy works for browsers on this machine only, for now.'));
    case 'proxy_cloud_browser': return row(t('A cloud browser runs at its vendor, where a proxy on this machine cannot reach it — clear the proxy, or set one in the vendor\'s own settings.'));
    case 'proxy_unusable': return row(t('Its proxy address cannot be read — give it again in Proxy….'));
    case 'bad_proxy_credential': return row(t('That login was saved for another proxy — choose this proxy\'s login, or make a new one.'));
    case 'exit_proxy_timeout': return row(t('The profile\'s proxy did not open the way to the check address in time.'));
    case 'exit_proxy_hung_up': return row(t('The profile\'s proxy closed the connection before the way to the check address was open.'));
    case 'exit_check_refused': return row(t('The profile\'s proxy did not open the way to the check address.'), detail);
    case 'exit_check_timeout': return row(t('The exit check address did not answer in time.'));
    case 'exit_check_too_big': return row(t('The exit check address answered more than this check reads (64 KiB).'));
    case 'exit_check_failed': return row(t('The exit check could not reach the check address through the profile\'s proxy.'), detail);
    case 'exit_answer_unreadable': return row(joinSentences(exitKindWords(kind, t), t('Type the exit by hand, or give another check address in the field above and press Check.')), kind === 'status' && status ? String(status) : '');
    case 'exit_timezone_invalid': return row(t('That is not a time zone — give a zone name like Asia/Shanghai.'));
    case 'exit_ip_invalid': return row(t('The public address is one IP address, like 203.0.113.7 or 2001:db8::1.'));
    case 'exit_country_invalid': return row(t('The country is at most 64 characters.'));
    case 'exit_empty': return row(t('Give at least one of the public address, the country or the time zone.'));
    case 'not-found': return row(t('This profile is gone — close the dialog and reload the list.'));
    case 'agent_forbidden': return row(t('Only a person checks a profile\'s exit — an agent\'s token cannot.'));
    case 'unsupported-host': return row(t('The exit check runs for browsers on this machine only.'));
    case 'bad-request': return row(t('The request was not understood — reload the page and try again.'));
    case 'unavailable': return row(t('The exit check is not available on this server.'));
    case 'error': return row(t('The exit could not be checked — the server failed; try again.'));
    default: return { text: t('The exit could not be checked ({code}).', { code: String(code || '?') }), data: '', known: false };
  }
}

/** Two of the page's sentences, one after the other: a space after a Latin full stop, none after a CJK one («。» «！» «？» — zh, ja). */
export function joinSentences(a, b) { return /[。！？]$/.test(String(a)) ? `${a}${b}` : `${a} ${b}`; }
/** One sentence with its data after it — what the dialog shows. */
export function exitSay(code, t, extra = {}) { const w = exitWords(code, t, extra); return w.data ? `${w.text} (${w.data})` : w.text; }

/** A kept exit's age in the card's own words (the same keys as the panel's agoText): «just now» / «12 min ago» / «5 h ago» / «3 d ago». */
export function exitAgeText(ms, t) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return '';
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  if (s < 60) return t('just now');
  if (s < 5400) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 172800) return t('{n} h ago', { n: Math.round(s / 3600) });
  return t('{n} d ago', { n: Math.round(s / 86400) });
}
