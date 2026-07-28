#!/usr/bin/env node
/**
 * Interactive Claude subscription login helper.
 *
 * Claude Code stores CLAUDE_SECURESTORAGE_CONFIG_DIR credentials in the macOS
 * Keychain. A VibeSpace server started by launchd may not share the interactive
 * terminal's Keychain authorization, so after the official login succeeds this
 * helper copies only claudeAiOauth into that account's normal fallback file.
 * The Keychain read happens in the same terminal/security session as login.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FALLBACK_ACCOUNT = 'claude-code-user';
const ACCOUNT_RE = /^[a-zA-Z0-9._-]+$/;
export const LOGIN_STATUS_FILE = '.vibespace-login-status.json';

function loginError(code, message) {
  const error = new Error(message);
  error.loginCode = code;
  return error;
}

export function keychainServiceForDir(configDir) {
  const suffix = crypto.createHash('sha256')
    .update(String(configDir).normalize('NFC'))
    .digest('hex')
    .slice(0, 8);
  return `Claude Code-credentials-${suffix}`;
}

// Keep this in lockstep with Claude Code's secure-storage account selection
// (verified against the native 2.1.220 release; failure is surfaced via the
// sanitized status marker instead of silently polling forever).
export function keychainAccount(env = process.env, userInfo = () => os.userInfo()) {
  let account;
  try {
    account = env.USER || userInfo().username;
  } catch {
    account = FALLBACK_ACCOUNT;
  }
  return ACCOUNT_RE.test(account) ? account : FALLBACK_ACCOUNT;
}

export function parseOAuthCredentials(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw loginError('invalid-credentials', 'Claude login completed, but its credential data was not valid JSON.');
  }
  const oauth = parsed?.claudeAiOauth;
  if (!oauth || typeof oauth !== 'object' || typeof oauth.accessToken !== 'string' || !oauth.accessToken) {
    throw loginError('invalid-credentials', 'Claude login completed, but no OAuth credential was found.');
  }
  return { claudeAiOauth: oauth };
}

export function readMacOSKeychain(configDir, {
  env = process.env,
  userInfo = () => os.userInfo(),
  execFile = execFileSync,
} = {}) {
  const account = keychainAccount(env, userInfo);
  const service = keychainServiceForDir(configDir);
  let raw;
  try {
    raw = execFile('/usr/bin/security', [
      'find-generic-password',
      '-a', account,
      '-s', service,
      '-w',
    ], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
  } catch {
    // Never include security(1)'s stderr: depending on the failure it can
    // contain Keychain metadata, and it does not help the user recover.
    throw loginError('keychain-read', 'Claude login completed, but VibeSpace could not read the new macOS Keychain entry in this terminal.');
  }
  return parseOAuthCredentials(String(raw).trim());
}

export function readCredentialsFile(configDir) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(configDir, '.credentials.json'), 'utf8');
  } catch {
    throw loginError('credentials-missing', 'Claude login completed, but it did not write an OAuth credential file.');
  }
  return parseOAuthCredentials(raw);
}

function atomicWritePrivate(configDir, name, text, {
  fsImpl = fs,
  randomBytes = crypto.randomBytes,
} = {}) {
  fsImpl.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fsImpl.chmodSync(configDir, 0o700);
  const target = path.join(configDir, name);
  const tmp = path.join(
    configDir,
    `${name}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  let fd;
  try {
    fd = fsImpl.openSync(tmp, 'wx', 0o600);
    fsImpl.writeFileSync(fd, text, 'utf8');
    // Set and verify permissions while the old target is still intact. Once
    // rename succeeds there are no remaining required operations that can turn
    // a committed replacement into a reported failure.
    fsImpl.fchmodSync(fd, 0o600);
    if ((fsImpl.fstatSync(fd).mode & 0o777) !== 0o600) throw new Error('private mode not applied');
    fsImpl.fsyncSync(fd);
    fsImpl.closeSync(fd);
    fd = undefined;
    fsImpl.renameSync(tmp, target);
  } catch {
    if (fd !== undefined) {
      try { fsImpl.closeSync(fd); } catch {}
    }
    try { fsImpl.unlinkSync(tmp); } catch {}
    throw loginError('credential-write', 'Claude login completed, but VibeSpace could not save its isolated credential file.');
  }
  return target;
}

export function writeCredentialsFile(configDir, credentials, options) {
  const payload = parseOAuthCredentials(credentials);
  return atomicWritePrivate(configDir, '.credentials.json', JSON.stringify(payload), options);
}

export function writeLoginStatus(configDir, status, options) {
  const state = status?.state === 'success'
    ? 'success'
    : status?.state === 'running' ? 'running' : 'error';
  const attempt = /^[a-zA-Z0-9._-]{8,80}$/.test(status?.attempt || '')
    ? status.attempt
    : null;
  const safe = {
    version: 1,
    state,
    ...(state === 'error' ? { code: String(status?.code || 'unknown').slice(0, 40) } : {}),
    ...(attempt ? { attempt } : {}),
    updatedAt: Date.now(),
  };
  return atomicWritePrivate(path.resolve(configDir), LOGIN_STATUS_FILE, JSON.stringify(safe), options);
}

export function runLogin({
  configDir,
  claudeCmd,
  platform = process.platform,
  env = process.env,
  spawn = spawnSync,
  readKeychain = readMacOSKeychain,
  output = (line) => console.log(line),
}) {
  const dir = path.resolve(String(configDir || ''));
  if (!configDir || !claudeCmd) throw new Error('Usage: --config-dir <path> --claude <path>');

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const login = spawn(claudeCmd, ['auth', 'login', '--claudeai'], {
    env: {
      ...env,
      CLAUDE_CONFIG_DIR: dir,
      CLAUDE_SECURESTORAGE_CONFIG_DIR: dir,
    },
    stdio: 'inherit',
  });
  if (login.error) throw loginError('claude-start', 'VibeSpace could not start Claude Code for login.');
  if (login.status !== 0) return Number.isInteger(login.status) ? login.status : 1;

  if (platform === 'darwin') {
    // Capture AFTER every successful login, even when an older fallback file
    // exists. A re-login must replace stale credentials with the fresh Keychain
    // value; any read/validation failure happens before the atomic rename.
    writeCredentialsFile(dir, readKeychain(dir, { env }));
  } else {
    readCredentialsFile(dir);
    fs.chmodSync(path.join(dir, '.credentials.json'), 0o600);
  }
  output('VibeSpace: subscription credentials saved.');
  return 0;
}

function parseArgs(argv) {
  let configDir = null;
  let claudeCmd = null;
  let attempt = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config-dir') configDir = argv[++i] || null;
    else if (argv[i] === '--claude') claudeCmd = argv[++i] || null;
    else if (argv[i] === '--attempt') attempt = argv[++i] || null;
    else throw new Error('Usage: --config-dir <path> --claude <path>');
  }
  return { configDir, claudeCmd, attempt };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.umask(0o077);
  let args = null;
  try {
    args = parseArgs(process.argv.slice(2));
    try { writeLoginStatus(args.configDir, { state: 'running', attempt: args.attempt }); } catch {}
    const code = runLogin(args);
    try {
      writeLoginStatus(args.configDir, code === 0
        ? { state: 'success', attempt: args.attempt }
        : { state: 'error', code: 'claude-login-exit', attempt: args.attempt });
    } catch {}
    process.exitCode = code;
  } catch (e) {
    if (args?.configDir) {
      try { writeLoginStatus(args.configDir, { state: 'error', code: e.loginCode || 'unknown', attempt: args.attempt }); } catch {}
    }
    console.error(`VibeSpace: ${e.message}`);
    process.exitCode = 1;
  }
}
