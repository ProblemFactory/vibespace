'use strict';
// GIT'S IDENTITY, DEFAULTED FROM THE SIGN-IN (lane door-day-one-landing — the naive-user study, study 2 C14: on a fresh pod one
// agent authored commits under a guessed identity, another asked and the person invented an address). When this machine's
// git has no user.name / user.email (system or global), they default to the Claude sign-in's account — its email and name
// from ~/.claude.json `oauthAccount` (the CLI writes it at the login; everyone signs in with their own account) — written
// ONCE with `git config --global`, never over a value git already has and never mixing two people (src/day-one.js
// gitIdentityPlan). Async only: short git probes bounded at 3 s each, asked at a local session's spawn (src/ws-create.js),
// at most once a minute until an identity is set or found. The log line names what was set, never the values.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { serviceEnv } = require('../agent-env.js');
const { gitIdentityPlan } = require('../day-one.js');

const PACE_MS = 60e3;
let settled = false;
let lastTry = 0;
let inFlight = null;

/** `git <args>` from `/` (never inside a repo: system + global only) → stdout trimmed, '' for an absent key (exit 1), null when
 *  git could not answer (no git, a timeout). */
function git(args) {
  return new Promise((resolve) => {
    execFile('git', args, { env: serviceEnv(process.env), cwd: '/', timeout: 3000 }, (err, stdout) => {
      if (!err) return resolve(String(stdout || '').trim());
      resolve(err.code === 1 ? '' : null);
    });
  });
}

/** The Claude sign-in's account on this machine → { email, name } | null (no login yet). */
async function signInAccount(home = os.homedir()) {
  try {
    const j = JSON.parse(await fs.promises.readFile(path.join(home, '.claude.json'), 'utf8'));
    const a = j && j.oauthAccount;
    if (!a || !a.emailAddress) return null;
    return { email: String(a.emailAddress), name: String(a.displayName || '') };
  } catch { return null; }
}

/** → { set } | { already: true } | { skipped: why }. Never throws. */
function ensureGitIdentity({ home = os.homedir(), now = Date.now(), log = console } = {}) {
  if (settled) return Promise.resolve({ skipped: 'settled' });
  if (inFlight) return inFlight;
  if (now - lastTry < PACE_MS) return Promise.resolve({ skipped: 'paced' });
  lastTry = now;
  inFlight = (async () => {
    const account = await signInAccount(home);
    if (!account) return { skipped: 'no-sign-in' };
    const name = await git(['config', '--get', 'user.name']);
    const email = await git(['config', '--get', 'user.email']);
    if (name == null || email == null) return { skipped: 'no-git' };
    const plan = gitIdentityPlan({ configured: { name, email }, account });
    if (!plan) { settled = true; return { already: true }; }
    for (const [k, v] of Object.entries(plan)) {
      if ((await git(['config', '--global', `user.${k}`, v])) == null) return { skipped: 'write-failed' };
    }
    settled = true;
    try { log.log?.(`[git-identity] git's ${Object.keys(plan).join(' + ')} defaulted from the sign-in's account`); } catch { }
    return { set: plan };
  })().catch(() => ({ skipped: 'error' })).finally(() => { inFlight = null; });
  return inFlight;
}

/** suites: forget what this process learned */
function _reset() { settled = false; lastTry = 0; inFlight = null; }

module.exports = { ensureGitIdentity, signInAccount, _reset };
