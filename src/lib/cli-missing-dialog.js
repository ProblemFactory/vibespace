// THE CLI-MISSING DIALOG + THE CENSUS LINE (lane cli-shell-truth, B-fb02; the owner 2026-11-03: a codex conversation
// that would not resume — the hub's PATH had no codex, the spawn died ~30 s later and the UI said NOTHING).
// The person's login shell is the truth for where an agent CLI is (src/server/cli-cmd.js). A create it cannot find is
// REFUSED before anything spawns (the WS error `cli-missing`): this module draws that refusal as a DIALOG — what was
// asked (your zsh, as a login shell), the sentence, the hint, two doors (Manage agents, where Re-check lives; How to
// install) — and the one census line Manage agents shows under a CLI's version chip («found by your zsh at …»).
// Every string the shell or the hub printed is DATA: it reaches the page through textContent only, never markup.
import { t } from './i18n.js';
import { createModalShell } from './utils.js';

/** The generic install page (no harness descriptor carries an install-doc link of its own). */
export const INSTALL_DOCS_URL = 'https://github.com/ProblemFactory/vibespace/blob/master/docs/getting-started.md#prerequisites';

/** A home directory said as ~ (the census and the dialog quote paths under it). */
export const tildeHome = (p) => String(p || '').replace(/^\/(?:home|Users)\/[^/]+(?=\/|$)/, '~').replace(/^\/root(?=\/|$)/, '~');

/** Why the shell could not be asked, in words. */
export function whyWords(why) {
  const w = String(why || '');
  if (w === 'timeout') return t('timed out after {s} s', { s: 10 });
  if (w === 'no-shell') return t('no login shell was found');
  if (w === 'no-command-builtin') return t('it has no «command» builtin');
  if (w.startsWith('spawn:')) return t('it could not be started ({err})', { err: w.slice(6) });
  return t('it exited ({code})', { code: w.replace(/^exit:/, '') || '?' });
}

/** THE CENSUS LINE (Manage agents › This machine): { tone: 'dim' | 'warn', text } or null (nothing observed). */
export function cliWhereWords(info) {
  if (!info || !info.answer) return null;
  const shell = info.shell || 'sh';
  const p = tildeHome(info.cmdPath || '');
  if (info.answer === 'configured') return info.installed ? { tone: 'dim', text: t('configured path {path}', { path: p }) } : null;
  if (info.answer === 'path' && info.cmdPath) {
    // round 5 (final): the installer's one-word alias IS the program; any other wrapper is NAMED — the program runs without it
    if (info.via === 'alias') return { tone: 'dim', text: t('found by your {shell} through its alias at {path}', { shell, path: p }) };
    if (info.wrapper) return { tone: 'dim', text: info.wrapper.kind === 'function'
      ? t('your {shell} wraps it in a function — VibeSpace runs the program at {path}, without the function; to run what it runs, set {env} to that program', { shell, path: p, env: info.envName || 'CLI_CMD' })
      : t('your {shell} wraps it in an alias — VibeSpace runs the program at {path}, without the alias; to run what the alias runs, set {env} to that program', { shell, path: p, env: info.envName || 'CLI_CMD' }) };
    return { tone: 'dim', text: t('found by your {shell} at {path}', { shell, path: p }) };
  }
  if (info.answer === 'unanswered') {
    return { tone: 'warn', text: info.installed
      ? t('your {shell} could not be asked ({why}) · using the hub’s PATH', { shell, why: whyWords(info.unanswered) })
      : t('your {shell} could not be asked ({why}) · the hub’s PATH has none', { shell, why: whyWords(info.unanswered) }) };
  }
  if (info.answer === 'none' && info.notExecutable) {
    // a target that does not run is said by its CAUSE — missing, or there but not executable
    const np = tildeHome(info.notExecutable), al = info.via === 'alias';
    return { tone: 'warn', text: info.dangling === 'missing'
      ? (al ? t('your {shell}’s alias names {path}, which is missing', { shell, path: np }) : t('your {shell} named {path}, which is missing', { shell, path: np }))
      : (al ? t('your {shell}’s alias names {path}, which is not executable', { shell, path: np }) : t('your {shell} named {path}, which is not executable', { shell, path: np })) };
  }
  if (info.answer === 'none' && info.wrapper) return { tone: 'warn', text: info.wrapper.kind === 'function'
    ? t('your {shell} wraps it in a function and has no program on its PATH · set {env}, or put the program on your PATH', { shell, env: info.envName || 'CLI_CMD' })
    : t('your {shell} wraps it in an alias and has no program on its PATH · set {env}, or put the program on your PATH', { shell, env: info.envName || 'CLI_CMD' }) };
  if (info.answer === 'none') {
    return { tone: 'warn', text: info.hubPath
      ? t('not found by your {shell} · the hub’s PATH has {path}', { shell, path: tildeHome(info.hubPath) })
      : t('not found by your {shell} (login shell)', { shell }) };
  }
  return null;
}

/** The refusal's sentences (the dialog's body, the failed window's text): { asked, what, hint }. */
export function cliMissingWords(msg) {
  const cli = String(msg.cli || msg.backend || 'CLI');
  const shell = msg.shell || 'sh';
  const dirs = (Array.isArray(msg.looked) ? msg.looked : []).map(tildeHome).join(', ');
  const asked = msg.answer === 'configured' ? t('Asked: the configured path') : t('Asked: your {shell}, as a login shell', { shell });
  let what;
  if (msg.answer === 'configured') what = t('Nothing was started. The configured path {path} is not an executable file.', { path: tildeHome(cli) });
  else if (msg.notExecutable) {
    const np = tildeHome(msg.notExecutable), al = msg.via === 'alias';
    what = msg.dangling === 'missing'
      ? (al ? t('Nothing was started. Your {shell}’s alias for {cli} names {path}, which is missing.', { shell, cli, path: np }) : t('Nothing was started. Your {shell} named {path} for {cli}, which is missing.', { shell, cli, path: np }))
      : (al ? t('Nothing was started. Your {shell}’s alias for {cli} names {path}, which is not executable.', { shell, cli, path: np }) : t('Nothing was started. Your {shell} named {path} for {cli}, which is not executable.', { shell, cli, path: np }));
  }
  else if (msg.wrapper) what = msg.wrapper.kind === 'function'
    ? t('Nothing was started. Your {shell} wraps {cli} in a function, which VibeSpace does not run, and has no {cli} program on its PATH. Set {env} to the program the function runs, or put the program on your PATH.', { shell, cli, env: msg.envName || 'CLI_CMD' })
    : t('Nothing was started. Your {shell} wraps {cli} in an alias ({text}), which VibeSpace does not run, and has no {cli} program on its PATH. Set {env} to the program the alias runs, or put the program on your PATH.', { shell, cli, text: String(msg.wrapper.text || '').slice(0, 200), env: msg.envName || 'CLI_CMD' });
  else if (msg.answer === 'unanswered') what = t('Nothing was started. Your {shell} could not be asked where {cli} is ({why}), and the hub’s own PATH has none: {dirs}.', { shell, cli, why: whyWords(msg.why), dirs });
  else if (msg.hubPath) what = t('Nothing was started. Your {shell} has no {cli} program on its PATH.', { shell, cli });
  else what = t('Nothing was started. Your {shell} has no {cli} program on its PATH, and neither has the hub’s own PATH: {dirs}.', { shell, cli, dirs });
  const hint = msg.hubPath ? t('The hub’s PATH has {path} — add that directory to your shell’s PATH, then try again.', { path: tildeHome(msg.hubPath) }) : null;
  return { cli, asked, what, hint };
}

/** THE DIALOG for a refused create (`app` = the App: its Manage agents door). Never a toast alone; no native dialog. */
export function openCliMissingDialog(app, msg) {
  const w = cliMissingWords(msg || {});
  const { dialog, body, close } = createModalShell({ id: 'cli-missing-dialog', title: t('{cli} was not found', { cli: w.cli }), bodyClass: 'cli-missing-body', minWidth: 'min(480px, 92vw)', escapeToClose: true, kind: 'decision' }); // decision: a refused create — the person picks a door (Manage agents / How to install)
  const line = (cls, text) => { const el = document.createElement('div'); el.className = cls; el.textContent = text; body.appendChild(el); return el; };
  line('cli-missing-asked', w.asked);
  line('cli-missing-what', w.what);
  if (w.hint) line('cli-missing-hint', w.hint);
  const footer = document.createElement('div'); footer.className = 'dialog-footer';
  const docs = document.createElement('button'); docs.className = 'btn-cancel cli-missing-docs'; docs.textContent = t('How to install');
  docs.onclick = () => { try { window.open(INSTALL_DOCS_URL, '_blank', 'noopener'); } catch { } };
  const manage = document.createElement('button'); manage.className = 'btn-create cli-missing-manage'; manage.textContent = t('Open Manage agents');
  manage.title = t('Re-check there asks your shell again once {cli} is installed', { cli: w.cli });
  manage.onclick = () => { close(); try { app?._showAgentsDialog?.(); } catch { } };
  footer.append(docs, manage);
  dialog.appendChild(footer);
  return { close, dialog, body };
}
