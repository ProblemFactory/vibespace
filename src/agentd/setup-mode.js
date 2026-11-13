'use strict';
// ── THE PAIRING'S SETUP (lane machine-needs-at-pairing pick 3 — the owner 2026-11-13: «需要 ffmpeg 之类的事情不能在安装的时候自动
// 解决吗？»): the INSTALLER's questions to THIS bundle, answered from the PURE plans it carries — never a copy in the installer.
// agentd.js hands `--setup-plan` / `--setup` here and RETURNS before the daemon's body: these modes never start the daemon, take
// no lock and open no socket (the daemon is the installer's own next step, or already running).
//   `--setup-plan <install>`  the install row's PURE plan for THIS machine (TightVNC's from the hello, xpra's from the facts —
//                             src/desktop-apps.js): its root script, else its commands; exit 5 = it is there already (the
//                             installer runs TightVNC's in its ONE administrator window, xpra's under sudo)
//   `--setup ffmpeg`          the agent's own lookup; none passes ⇒ the pinned row fetched now (unelevated); then looked at again
//   `--setup mac[,sharing]`   the screen helper read (its Screen Recording row added), the Settings panes opened for the person's
//                             switch (+ Sharing when asked; the Command Line Tools' installer when there is no helper)
// One line per need, met (✓) or not (✗ + where its door is). Exit 0 = all met, 4 = some not — the installer says it and the
// pairing STAYS done (law 3: a «no» never fails the pairing), 2 = a word it does not know, 3 = no plan for this machine.
const fs = require('fs');

/** `--setup-plan <install>`: the row's own plan — the two install rows the pairing runs (src/desktop-apps.js: TightVNC's, xpra's),
 *  found by the row's own id (never a branch on an install's name; never the whole registry, whose other rows the agent must not carry). */
function setupPlan(argv) {
  const what = String(argv[argv.indexOf('--setup-plan') + 1] || '');
  (async () => {
    const M = require('../desktop-apps.js');
    const ROWS = [M.TIGHTVNC_INSTALL, M.XPRA_INSTALL];
    const row = ROWS.find((r) => r && r.id === what) || null;
    if (!row) { fs.writeSync(2, `✗ --setup-plan: one of ${ROWS.map((r) => r.id).join(', ')}\n`); process.exit(2); }
    const facts = row.from === 'facts' ? await require('../desktop-display.js').installFacts({}) : { platform: process.platform };
    const plan = row.plan(facts);
    if (!plan || !plan.ok) { fs.writeSync(2, `✗ ${(plan && plan.error) || what}\n`); process.exit(3); }
    if (plan.already) process.exit(5);
    fs.writeSync(1, (typeof plan.script === 'string' ? plan.script : plan.commands.join('\n')) + '\n');
    process.exit(0);
  })().catch((e) => { fs.writeSync(2, `✗ ${e.message}\n`); process.exit(3); });
}

function setupNeeds(argv) {
  const want = String(argv[argv.indexOf('--setup') + 1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  (async () => {
    const SPs = require('../stream-plan.js'), cpS = require('child_process');
    const lines = []; let unmet = 0;
    // the installer's own marks: a Windows console decodes a child's bytes in its OEM code page, so ASCII there (OK / x / ->)
    const W = process.platform === 'win32', OK = W ? 'OK' : '✓', NO = W ? 'x' : '✗', GO = W ? '->' : '→';
    if (!want.length || want.some((w) => !['ffmpeg', 'mac', 'sharing'].includes(w))) { fs.writeSync(2, '✗ --setup: ffmpeg, mac, sharing\n'); process.exit(2); }
    // this machine's own screen source (its platform = createScreen's default, this process's) — a one-shot, never the daemon's
    const screen = () => require('./stream-screen.js').createScreen({ spawn: cpS.spawn, execFile: cpS.execFile });
    if (want.includes('ffmpeg')) {
      const FFi = require('../ffmpeg-install.js');
      const S = screen();
      let ff = ((await S.facts({ force: true })) || {}).ffmpeg;
      if (ff && SPs.ffmpegPasses(ff)) lines.push(`${OK} ffmpeg: a usable one is already there (${ff.where || ff.path}, ${ff.version}) - nothing fetched`);
      else {
        const plan = FFi.ffmpegInstallPlan({ platform: process.platform });
        if (!plan.ok) { lines.push(`${NO} ffmpeg: ${plan.error}`); unmet++; }
        else {
          const r = cpS.spawnSync(plan.argv[0], plan.argv.slice(1), { stdio: 'inherit', windowsHide: true, timeout: 20 * 60 * 1000 });
          ff = ((await S.facts({ force: true })) || {}).ffmpeg;
          if (ff && SPs.ffmpegPasses(ff)) lines.push(`${OK} ffmpeg: ${FFi.FFMPEG.label} (${FFi.FFMPEG.publisher}) is in ${FFi.FFMPEG_FOLDER} - both SHA-256 fingerprints checked`);
          else { lines.push(`${NO} ffmpeg: not fetched (${r.status == null ? 'the fetch did not finish' : `exit ${r.status}`}) - this machine's desktop window has "Get FFmpeg" on its line`); unmet++; }
        }
      }
    }
    if (want.includes('mac') || want.includes('sharing')) {
      if (process.platform !== 'darwin') { lines.push('✗ the Mac setup is a Mac\'s'); unmet++; }
      else {
        const S = screen();
        let f = null; try { f = await S.facts({ force: true }); } catch (e) { f = { ok: false, code: 'facts_failed', error: e.message }; }
        const open = async (pane, words) => { const r = await S.openSettings(pane); lines.push(r && r.ok ? `→ opened ${words} — ${pane === 'clt' ? 'click Install there' : 'switch vibespace-screen on there'}` : `✗ could not open ${words} (${(r && (r.error || r.code)) || 'no answer'}) — open it by hand`); };
        if (want.includes('mac')) {
          if (f && f.code === 'no_helper') { await open('clt', 'the Command Line Tools installer'); unmet++; }
          else if (f && f.ok) lines.push('✓ the screen helper and its permissions: the picture and the keys can reach this Mac');
          else { await open('screen', 'Screen & System Audio Recording'); await open('accessibility', 'Accessibility'); unmet++; }
        }
        if (want.includes('sharing')) { await open('sharing', 'General › Sharing (turn on Screen Sharing; it listens on the local network)'); unmet++; }
      }
    }
    fs.writeSync(1, lines.join('\n') + '\n');
    process.exit(unmet ? 4 : 0);
  })().catch((e) => { fs.writeSync(2, `✗ the setup stopped: ${e.message} — the pairing is done; each need has its door in the machine's windows\n`); process.exit(4); });
}

/** The installer's question, by its flag → true when it was one of these modes (agentd.js then returns). */
function main(argv = process.argv) {
  if (argv.includes('--setup-plan')) { setupPlan(argv); return true; }
  if (argv.includes('--setup')) { setupNeeds(argv); return true; }
  return false;
}

module.exports = { main };
