'use strict';
// Argv the daemon's self-upgrade re-exec must launch with: the NEW bundle path
// followed by EVERY original flag after the script (--dial/--dial-token/
// --host-token/…). Dropping the flags re-exec'd a DIAL device into default
// LISTEN mode — it stopped dialing the instance and held the singleton so
// launchd couldn't relaunch the real --dial daemon (real xingweil↔Mac outage,
// walter-class wedge). Pure + side-effect-free so it's unit-testable without
// starting the daemon. argv defaults to process.argv ([node, script, ...flags]).
function reExecArgv(newScriptPath, argv = process.argv) {
  return [newScriptPath, ...argv.slice(2)];
}

module.exports = { reExecArgv };
