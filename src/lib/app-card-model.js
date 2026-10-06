// THE WORDS OF AN APP INSTALL'S ONE CARD (design 009 §2 A) — PURE, no DOM: the VIEW the engine builds
// (src/app-card.js — structure, never words) → the lines a person reads, in the device's language (the caller's t()
// and lang). The For-you row, the For-you window and the install dialog's summary all word a card HERE, so the three
// cannot drift. The FACE never carries a package-system word (deb / AppImage / apt / root / sudo / sha); Details may —
// scripts/test-app-card.mjs is the census, in en / zh / ja, with a planted word as its control.
import { shownDigest as digestOfView } from '../app-card.js';
import { fmtBytes } from '../app-manifest.js';
import { ROWS } from '../app-kinds/index.js'; // PURE — an app kind is one row (lane dc-apps-rows)

/** The digest of the view a card drew — what its Install sends (`shown`); the engine compares it with the proposal. */
export const shownDigest = (view) => digestOfView(view);

/** The app's name in the reader's language: its own localized label › its name (the engine never titles a card with an
 *  agent's --name — design 009 step 4). */
export function appName(view, lang = 'en') {
  const a = (view && view.app) || {};
  return String((lang === 'zh' || lang === 'ja') && a.labels && a.labels[lang] ? a.labels[lang] : a.name || '');
}
const isInstall = (k) => ROWS.some((r) => r.entry && r.card === k); // the card word of an entry kind (src/app-kinds/)
/** An installed catalog row's name in the reader's language (design 009: the row carries `labels {zh, ja}` from its own
 *  .desktop — Name[zh_CN] / Name[ja] — and the client picks; apps-joint r1 F2) › its unlocalised label. */
export function rowName(row, lang = 'en') {
  const r = row || {};
  return String((lang === 'zh' || lang === 'ja') && r.labels && typeof r.labels[lang] === 'string' && r.labels[lang] ? r.labels[lang] : r.label || '');
}

/** "Debian:12.15/oldstable" (apt's origin words) → "Debian 12"; anything else as it is. */
export function originWords(origin) {
  const s = String(origin || '');
  const m = /^([A-Za-z][A-Za-z0-9 ._-]*?):(\d+)/.exec(s);
  return m ? `${m[1]} ${m[2]}` : s.split(/[:/]/)[0];
}

/** The card's lines: `{title, by, from, fromNote, gives, firstUse, changed, go, later}` (a line that does not apply is '')
 *  + `details` = [{text, mono?}] for the fold. */
export function cardWords(view, t, lang = 'en') {
  const v = view || {};
  const k = v.kind || 'package';
  const app = appName(v, lang);
  const title = k === 'remove' ? t('Remove {app}?', { app }) : k === 'source' ? t('Add the app source {app}?', { app }) : t('Install {app}?', { app });
  const name = v.by && v.by.name ? v.by.name : '';
  const why = String(v.why || '').trim();
  const by = !name ? ''
    : k === 'remove' ? (why ? t('{name} wants to remove it: {why}', { name, why }) : t('{name} wants to remove it.', { name }))
      : k === 'source' ? (why ? t('{name} wants to add it: {why}', { name, why }) : t('{name} wants to add it.', { name }))
        : (why ? t('{name} wants to install it: {why}', { name, why }) : t('{name} wants to install it.', { name }));
  const f = v.from || null;
  const b = v.bytes || {};
  let from = '', fromNote = '';
  if (f && f.kind === 'download') {
    from = f.recipe ? t('From {host} (the official download address)', { host: f.host || '' }) : t('From {host}', { host: f.host || '' });
    if (!f.recipe && isInstall(k)) fromNote = t('This installer comes from the web — VibeSpace cannot confirm who published it.');
  } else if (f && f.kind === 'file') {
    from = t('From an installer file on this machine');
    if (isInstall(k)) fromNote = t('VibeSpace cannot confirm who published this installer.');
  } else if (f) {
    const o = originWords(f.origin);
    from = o ? t('From this machine’s package sources ({origin})', { origin: o }) : t('From this machine’s package sources');
  }
  if (isInstall(k)) {
    const sizes = [b.download > 0 ? t('{size} to download', { size: fmtBytes(b.download) }) : '', b.installed > 0 ? t('about {size} once installed', { size: fmtBytes(b.installed) }) : ''].filter(Boolean);
    from = [from, ...sizes].filter(Boolean).join(' · ');
  }
  const gives = k === 'remove' ? t('It leaves Apps and does not come back after a rebuild.')
    : k === 'source' ? t('Apps can then be installed from it — adding it installs nothing.')
      : v.keeps === 'system' ? t('It appears in Apps and stays there.')
        : v.keeps === 'home' ? t('It appears in Apps; it is kept in your home folder.')
          : t('It appears in Apps, and comes back by itself if this machine is rebuilt.');
  const firstUse = v.firstUse && isInstall(k) ? t('The first install prepares a place for apps first (about 1 minute).') : '';
  const changed = v.planChanged ? t('The plan changed — take another look.') : '';
  const go = k === 'remove' ? t('Remove') : k === 'source' ? t('Add') : t('Install');
  return { title, by, from, fromNote, gives, firstUse, changed, go, later: t('Not now'), details: detailLines(v, t) };
}

/** Everything else, for the Details fold — here the machine's own words may appear (packages, commands, the checksum). */
export function detailLines(view, t) {
  const v = view || {};
  const d = v.details || {};
  const out = [];
  const pk = Array.isArray(d.packages) ? d.packages : [];
  const n = Math.max(Number(d.count) || 0, pk.length);
  if (pk.length) out.push({ text: (n === 1 ? t('1 package: {list}', { list: pk.join(' ') }) : t('{n} packages: {list}', { n, list: pk.join(' ') })) + (n > pk.length ? ` … (+${n - pk.length})` : '') });
  if (Array.isArray(d.origins) && d.origins.length) out.push({ text: t('From: {origins}', { origins: d.origins.join(', ') }) });
  if (Array.isArray(d.removes) && d.removes.length) out.push({ text: t('Removes: {pkgs}', { pkgs: d.removes.join(' ') }) });
  if (Array.isArray(d.address) && d.address.length) out.push({ text: t('Address: {uri}', { uri: d.address.join(' ') }), mono: true });
  if (Array.isArray(d.fingerprints) && d.fingerprints.length) out.push({ text: t('Key fingerprint: {fpr}', { fpr: d.fingerprints.join(' ') }), mono: true });
  if (d.file) out.push({ text: t('The file: {file}', { file: d.file }), mono: true });
  if (d.sha256) out.push({ text: `sha256 ${d.sha256}`, mono: true });
  if (Array.isArray(d.scripts) && d.scripts.length) out.push({ text: t('It carries install scripts that run with administrator rights: {scripts}', { scripts: d.scripts.join(', ') }) });
  if (Array.isArray(d.commands) && d.commands.length) { out.push({ text: t('What runs (as root):') }); for (const c of d.commands) out.push({ text: c, mono: true }); }
  const r = v.result || null;
  if (v.state === 'failed' && r && r.error) out.push({ text: t('What went wrong: {error}', { error: r.error }) });
  return out;
}

/** The card's PROGRESS, in the card: `{text, kind: 'busy'|'done'|'failed', actions: ['open'|'retry']}` | null (nothing
 *  pressed yet — the two buttons). */
export function progressWords(view, t) {
  const v = view || {};
  const k = v.kind || 'package';
  if (v.state === 'installing') return { text: k === 'remove' ? t('Removing…') : k === 'source' ? t('Adding…') : t('Installing…'), kind: 'busy', actions: [] };
  if (v.state === 'done') {
    const rows = (v.result && Array.isArray(v.result.rows) ? v.result.rows : []).filter((r) => r && r.id);
    return { text: k === 'remove' ? t('Removed') : k === 'source' ? t('Added') : t('Installed'), kind: 'done', actions: isInstall(k) && rows.length ? ['open'] : [] };
  }
  if (v.state === 'failed') {
    const step = v.result && v.result.step;
    const text = step === 'prepare' ? t('Not installed — this machine could not start it.') : step === 'record' ? t('Installed, but it could not be added to Apps.') : t('It stopped while installing.');
    return { text, kind: 'failed', actions: ['retry'] };
  }
  return null;
}

/** The catalog row an Installed card's Open starts (the first window the install added). */
export function openRowOf(view) {
  const rows = view && view.result && Array.isArray(view.result.rows) ? view.result.rows : [];
  const r = rows.find((x) => x && x.id);
  return r ? String(r.id) : null;
}
