// lane device-node-version (the Node.js security releases of 2026-10-21): the Machines card's RUNTIME line — the node a
// machine's device agent runs on (its hello-ack, kept on the record; the /api/hosts row's `runtime` is the hub's verdict
// over the floor table, src/device-runtime.js). Below its line's floor ⇒ 「运行时过旧」 + the recipe: run the pairing
// command again (the installer replaces its OWN node — the agent's self-upgrade never changes node), or, for a node the
// machine already had, its upgrade line first. Words only — the hub judges; `unknown` (the agent never said) has no chip.
import { t } from './i18n.js';

/** The row's `runtime` (+ whether the machine is a dial device) → `{text, old, tip, fix, line}`; `fix` = the recipe
 *  sentence and `line` = a system node's upgrade line ('' when there is nothing to do). */
export function runtimeWords(rt, { dial = false } = {}) {
  if (!rt || !rt.node) return { text: t('Node: unknown'), old: false, tip: '', fix: '', line: '' };
  const text = ['Node ' + rt.node, rt.openssl ? 'OpenSSL ' + rt.openssl : ''].filter(Boolean).join(' · ');
  if (rt.state !== 'old') return { text, old: false, tip: '', fix: '', line: '' };
  const tip = t('Node {node} is older than {floor}, the release that fixes the Node.js security advisory of {date} ({cves}).', { node: rt.node, floor: rt.floor, date: rt.date || '?', cves: (rt.cves || []).join(', ') });
  const fix = rt.fix !== 'system'
    ? t('Its agent runs the Node its installer provisioned: run the pairing command again on the machine — the installer replaces it with the fixed release. The agent’s own updates never change its Node.')
    : dial
      ? t('Its agent runs a Node this machine already had, which the installer never replaces: upgrade it to {floor} or newer on the machine, then run the pairing command again so the agent restarts on it.', { floor: rt.floor })
      : t('Its agent runs this machine’s own Node: upgrade it to {floor} or newer — the agent runs on it from its next connection.', { floor: rt.floor });
  return { text, old: true, tip, fix, line: rt.fix === 'system' && rt.line ? rt.line : '' };
}

/** The summary's runtime line: the words + the 「运行时过旧」 chip (its title = why + the recipe) when below the floor. */
export function runtimeLineEl(rt, { dial = false } = {}) {
  const w = runtimeWords(rt, { dial });
  const el = document.createElement('span');
  el.className = 'agents-machine-sub agents-mach-runtime';
  el.dataset.runtime = (rt && rt.state) || 'unknown';
  el.append(document.createTextNode(w.text));
  if (w.old) {
    const chip = document.createElement('span');
    chip.className = 'agents-mach-chip agents-mach-runtime-old';
    chip.textContent = t('Runtime too old');
    chip.title = [w.tip, w.fix, w.line].filter(Boolean).join(' ');
    el.append(' ', chip);
  }
  return { el, words: w };
}

/** The open card's recipe: the sentence, a system node's upgrade line, and — on a dial device — the 「重新安装…」 door
 *  (the pairing sheet: its command, run again on the machine, is the re-install). null when nothing is old. */
export function runtimeFixEl(words, { onReinstall = null } = {}) {
  if (!words || !words.old) return null;
  const box = document.createElement('div');
  box.className = 'agents-note agents-mach-runtime-fix';
  const p = document.createElement('span');
  p.textContent = words.tip + ' ' + words.fix;
  box.append(p);
  if (words.line) { const c = document.createElement('code'); c.className = 'agents-mach-runtime-line'; c.textContent = words.line; box.append(' ', c); }
  if (typeof onReinstall === 'function') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn-cancel agents-mach-reinstall'; b.textContent = t('Install again…');
    b.onclick = (e) => { e.preventDefault(); onReinstall(); };
    box.append(' ', b);
  }
  return box;
}
