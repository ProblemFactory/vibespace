// B-9584 U3 — THE ENVIRONMENT DIALOG's WORDS — PURE (imports nothing; node-imported by scripts/test-browser-environment-dialog.mjs).
// LAW (as the exit check's): every sentence a person reads in «Environment…» is the PAGE's, in the page's language, chosen by the
// refusal's CODE — U1's verdict (src/browser-environment.js) or the keeper's door (setEnvironment). What the verdict said in its own
// words (which site, which field) rides AFTER the page's sentence as DATA. A code with no row here is named by its code.

/** → { text, known } — `known` false when the code has no row here (then named by its code — never a server's sentence). */
export function envWords(code, t, { limit = 20 } = {}) {
  const row = (text) => ({ text, known: true });
  switch (code) {
    case 'env_timezone_invalid': return row(t('The time zone is not one this browser knows — write it as a region and a city, like Europe/Paris.'));
    case 'env_language_invalid': return row(t('The language is not a language tag — write it like fr-FR or ja.'));
    case 'env_place_invalid': return row(t('A place is a latitude from -90 to 90 and a longitude from -180 to 180, written as numbers (an accuracy, if given, in metres above 0).'));
    case 'env_site_invalid':
    case 'env_sites_invalid': return row(t('Each site is one web address with its scheme, like https://maps.example.com — no wildcard, no user name, at most {n} sites.', { n: limit }));
    case 'env_sites_unoffered': return row(t('A list of sites is kept only beside a place — when the location is blocked or this machine\'s, no site is given anything.'));
    case 'browser_place_unsupported': return row(t('A place or a blocked location is held only on a named profile of this machine\'s own browser — on a paired machine, its sites would read that machine\'s real position.'));
    case 'env_sites_engine': return row(t('An engine\'s profile gives its place to every site — a list of sites is kept only on this machine\'s own browser.'));
    case 'env_invalid':
    case 'env_mode_invalid':
    case 'env_mode_unoffered':
    case 'env_setting_unknown': return row(t('A setting could not be read — choose it again.'));
    case 'not-found': return row(t('This profile is not here any more.'));
    case 'agent_forbidden': return row(t('Only you can set a profile\'s environment.'));
    default: return { text: t('The environment could not be saved ({code}).', { code: String(code || 'unknown') }), known: false };
  }
}

/** B-9584, THE OWNER's DECISION ON THE PLACE HOLE (主开发 r2911 / r2916): the ONE plain sentence under the location — a fact said once,
 *  never a greyed control or a refusal. `isolated` (the form model's placeIsolatedOf) = the browser has no source of this machine's
 *  real place; otherwise (stock Chrome, a kernel without the patch, an older plugin) the person's own «Allow» in the browser's settings
 *  reads the real place whenever no hold of VibeSpace's stands. */
export function placeLeakWords(isolated, t) {
  if (isolated === true) return t('This browser cannot find this machine\'s real location, so it cannot leak to a site: a site reads only a place you set here, or none.');
  return t('If you allow a site your location in this browser\'s own settings, that site reads this machine\'s real location whenever VibeSpace is not holding a place for this profile.');
}

/** What «Automatic» means right now, for one setting (the form model's autoSaidOf row). */
export function autoWords(a, t) {
  if (a && a.value) return t('Automatic now: {value} — from the kept exit', { value: String(a.value) });
  return t('Automatic follows the kept exit — none is kept yet, so it acts as this machine\'s');
}
