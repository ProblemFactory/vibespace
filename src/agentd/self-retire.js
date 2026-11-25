'use strict';
/**
 * B-4d71: THE DEVICE AGENT RETIRES ITS OWN START when its pairing is gone. A dial-only device has no ssh for the hub to clean it
 * with, so on the hub's unpair (op `retire-start` over the live link) — or, offline, a hub that PROVES it held the pairing (the
 * dial refusal `retired` and its proof) — the agent does what the installer's retire does for a sibling
 * (scripts/vibespace-agentd-install.sh retire_siblings / drop_hook_block):
 *   1. the dial config and the device token FIRST — a restart can no longer dial;
 *   2. its start — the container boot-hook block (only a whole begin…end pair, through the hook's real file, its mode kept,
 *      never another user's file), the launchd item, the systemd user unit, the Windows logon task;
 *   3. the supervisor's own stop LAST (it ends this process).
 * A root that is not a dial device (no state/dial.json: the hub's own agent, a hand-made root) retires nothing.
 * DEVICE; fs and the supervisor's command runner injected (agentd.js hands its hidden execFile; a suite runs it over a scratch
 * HOME with stub supervisors) — this file starts no child itself.
 */
const path = require('path');
const { logonTaskName } = require('./hidden-start.js');
const DFILE = require('./durable-file.js');   // B-93e7: the device's one door — the hook rewritten takes its name only after ONE sync

/** the installer's KEY for a root (install.sh: `basename "$ROOT" | tr -c 'A-Za-z0-9.-' '-' | sed 's/-*$//'`): its folder name,
 *  each unit outside [A-Za-z0-9.-] a '-', trailing '-' trimmed. The unit is the tr's: GNU tr (Linux) works on BYTES (a two-byte
 *  «é» is «--»); macOS tr on characters in its UTF-8 locale (one «-») */
const keyOf = (root, platform = process.platform) => {
  const base = path.basename(String(root || '').replace(/[\\/]+$/, ''));
  const units = platform === 'darwin' ? [...base] : [...Buffer.from(base, 'utf8')].map((b) => String.fromCharCode(b));
  return units.map((c) => (/^[A-Za-z0-9.-]$/.test(c) ? c : '-')).join('').replace(/-+$/, '');
};

/** the hook text without THIS key's block — only a whole begin…end pair leaves; a begin without its end is LEFT (`open`) */
function dropHookBlock(text, key) {
  const b = `# >>> vibespace-device ${key} >>>`, e = `# <<< vibespace-device ${key} <<<`;
  const out = [];
  let skip = false, found = false;
  for (const l of String(text).split('\n')) {
    if (!skip && l.startsWith(b)) { skip = true; found = true; continue; }
    if (skip && l.startsWith(e)) { skip = false; continue; }
    if (!skip) out.push(l);
  }
  if (!found) return { changed: false };
  if (skip) return { changed: false, open: true };
  return { changed: true, text: out.join('\n') };
}

/** THE STEPS for this root on this platform, in order; `last` = the supervisor's own stop (ends this agent) */
function retireSteps({ root, platform, home, uid = null }) {
  const key = keyOf(root, platform), state = path.join(root, 'state');
  const steps = [
    { kind: 'unlink', what: 'the dial config', file: path.join(state, 'dial.json') },
    { kind: 'unlink', what: 'the device token', file: path.join(state, 'token') },
  ];
  if (platform === 'win32') {
    const task = logonTaskName(root);
    if (task) steps.push({ kind: 'exec', what: 'the logon task', cmd: 'schtasks', args: ['/Delete', '/TN', task, '/F'] });
    return steps;
  }
  steps.push({ kind: 'hook', what: 'the container boot-hook block', file: path.join(home, '.vibespace-init.sh'), key });
  if (platform === 'darwin') {
    const label = `cc.vibespace.device.${key}`;
    const plist = path.join(home, 'Library', 'LaunchAgents', `${label}.plist`);
    steps.push({ kind: 'unlink', what: 'the launchd item', file: plist });
    steps.push({ kind: 'exec', what: 'the launchd job (ends this agent)', cmd: 'launchctl', args: ['bootout', `gui/${uid}/${label}`], last: true, onlyIf: plist });
  } else {
    const unit = `vibespace-device-${key}.service`;
    const unitFile = path.join(home, '.config', 'systemd', 'user', unit);   // (no unit file ⇒ no systemd step: nothing of ours is there)
    steps.push({ kind: 'exec', what: 'the systemd unit, disabled', cmd: 'systemctl', args: ['--user', 'disable', unit], onlyIf: unitFile });
    steps.push({ kind: 'unlink', what: 'the systemd unit file', file: unitFile });
    steps.push({ kind: 'exec', what: 'systemd reads its units again', cmd: 'systemctl', args: ['--user', 'daemon-reload'], onlyIf: unitFile });
    steps.push({ kind: 'exec', what: 'the systemd unit, stopped (ends this agent)', cmd: 'systemctl', args: ['--user', 'stop', unit], last: true, onlyIf: unitFile });
  }
  return steps;
}

/** run steps → { done: [what], left: [{what, why}] } — never throws; a step that fails is LEFT with its why, the next still runs */
async function runRetire(steps, { fs, supervisor, uid = null, present = null, log = null }) {
  const done = [], left = [];
  // a step `onlyIf` a file runs only when that file was there BEFORE the steps began (`present`: the caller's earlier reading —
  // the last step runs after the unit file is gone; else read here)
  const had = present || new Map();
  for (const s of steps) if (s.onlyIf && !had.has(s.onlyIf)) { let e = false; try { fs.statSync(s.onlyIf); e = true; } catch { } had.set(s.onlyIf, e); }
  for (const s of steps) {
    if (s.onlyIf && !had.get(s.onlyIf)) continue;
    try {
      if (s.kind === 'unlink') {
        try { fs.unlinkSync(s.file); done.push(s.what); } catch (e) { if (e && e.code === 'ENOENT') continue; left.push({ what: s.what, why: (e && e.code) || 'error' }); }
      } else if (s.kind === 'hook') {
        let real; try { real = fs.realpathSync(s.file); } catch (e) { if (e && e.code === 'ENOENT') continue; throw e; }
        const st = fs.statSync(real);
        if (uid != null && st.uid !== uid) { left.push({ what: s.what, why: 'the hook belongs to another user' }); continue; }
        const r = dropHookBlock(fs.readFileSync(real, 'utf8'), s.key);
        if (r.open) { left.push({ what: s.what, why: 'its begin has no end — left as it is' }); continue; }
        if (!r.changed) continue;
        DFILE.writeDurable({ fs, file: real, tmp: `${real}.vs-tmp.${process.pid}`, data: r.text, mode: 0o600, chmod: st.mode & 0o777, log, what: s.what });   // the hook's own mode (never the umask's); B-93e7: one sync before its name
        done.push(s.what);
      } else if (s.kind === 'exec') {
        const ok = await supervisor(s.cmd, s.args);
        if (ok) done.push(s.what); else left.push({ what: s.what, why: `${s.cmd} did not answer` });
      }
    } catch (e) { left.push({ what: s.what, why: (e && (e.code || e.message)) || 'error' }); }
  }
  return { done, left };
}

/** which `onlyIf` files are there now (read BEFORE any step runs: the caller hands it to every runRetire of the same steps) */
function presentOf(steps, fs) { const m = new Map(); for (const s of steps) if (s.onlyIf && !m.has(s.onlyIf)) { let e = false; try { fs.statSync(s.onlyIf); e = true; } catch { } m.set(s.onlyIf, e); } return m; }

module.exports = { keyOf, dropHookBlock, retireSteps, runRetire, presentOf };
