#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  keychainAccount,
  keychainServiceForDir,
  LOGIN_STATUS_FILE,
  parseOAuthCredentials,
  readMacOSKeychain,
  runLogin,
  writeCredentialsFile,
  writeLoginStatus,
} from '../data/bin/vibespace-claude-subscription-login.mjs';

const require = createRequire(import.meta.url);
const {
  buildClaudeSubscriptionLoginCommand,
  shellQuote,
} = require('../src/claude-subscription-login');
const { AccountManager } = require('../src/accounts');
const { HostManager } = require('../src/hosts');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibespace-claude-login-'));
const mode = (file) => fs.statSync(file).mode & 0o777;
const oauth = (accessToken, extra = {}) => ({
  claudeAiOauth: { accessToken, refreshToken: 'test-refresh', ...extra },
});

try {
  console.log('— Claude secure-storage naming —');
  assert.equal(
    keychainServiceForDir('/Users/alice/Vibe Space/data/subs/sub-0123456789ab'),
    'Claude Code-credentials-9bce6c0b',
  );
  assert.equal(
    keychainServiceForDir('/tmp/cafe\u0301'),
    keychainServiceForDir('/tmp/café'),
    'service hash must use NFC normalization',
  );
  assert.equal(keychainAccount({ USER: 'alice_1' }, () => { throw new Error('unused'); }), 'alice_1');
  assert.equal(keychainAccount({ USER: '' }, () => ({ username: 'fallback.user' })), 'fallback.user');
  assert.equal(
    keychainAccount({ USER: 'not valid' }, () => ({ username: 'ignored' })),
    'claude-code-user',
    'an invalid USER falls directly back instead of consulting os.userInfo()',
  );
  assert.equal(keychainAccount({ USER: '' }, () => { throw new Error('no user'); }), 'claude-code-user');

  console.log('— scoped Keychain read —');
  let securityCall = null;
  const captured = readMacOSKeychain('/Users/alice/Vibe Space/data/subs/sub-0123456789ab', {
    env: { USER: 'alice_1' },
    execFile: (cmd, args, options) => {
      securityCall = { cmd, args, options };
      return JSON.stringify({ ...oauth('test-access'), mcpOAuth: { token: 'must-not-copy' } });
    },
  });
  assert.deepEqual(captured, oauth('test-access'));
  assert.equal(securityCall.cmd, '/usr/bin/security');
  assert.deepEqual(securityCall.args, [
    'find-generic-password',
    '-a', 'alice_1',
    '-s', 'Claude Code-credentials-9bce6c0b',
    '-w',
  ]);
  assert.deepEqual(securityCall.options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.deepEqual(securityCall.options.env, { USER: 'alice_1' });

  let keychainError = null;
  try {
    readMacOSKeychain('/tmp/account', {
      env: { USER: 'alice' },
      execFile: () => { throw new Error('sensitive-keychain-detail'); },
    });
  } catch (e) {
    keychainError = e;
  }
  assert.ok(keychainError);
  assert.doesNotMatch(keychainError.message, /sensitive-keychain-detail/);

  console.log('— login and atomic fallback persistence —');
  const macDir = path.join(tmp, 'mac account');
  fs.mkdirSync(macDir, { mode: 0o755 });
  const macFile = path.join(macDir, '.credentials.json');
  fs.writeFileSync(macFile, JSON.stringify(oauth('stale-access')), { mode: 0o644 });
  let spawnCall = null;
  let output = '';
  const rc = runLogin({
    configDir: macDir,
    claudeCmd: '/Applications/Claude Code/claude',
    platform: 'darwin',
    env: { USER: 'alice' },
    spawn: (cmd, args, options) => {
      spawnCall = { cmd, args, options };
      return { status: 0 };
    },
    readKeychain: () => ({ ...oauth('fresh-access', { expiresAt: 1234 }), ignored: 'drop-me' }),
    output: (line) => { output += line; },
  });
  assert.equal(rc, 0);
  assert.equal(spawnCall.cmd, '/Applications/Claude Code/claude');
  assert.deepEqual(spawnCall.args, ['auth', 'login', '--claudeai']);
  assert.equal(spawnCall.options.env.CLAUDE_CONFIG_DIR, path.resolve(macDir));
  assert.equal(spawnCall.options.env.CLAUDE_SECURESTORAGE_CONFIG_DIR, path.resolve(macDir));
  assert.equal(spawnCall.options.stdio, 'inherit');
  assert.deepEqual(JSON.parse(fs.readFileSync(macFile, 'utf8')), oauth('fresh-access', { expiresAt: 1234 }));
  assert.equal(mode(macDir), 0o700);
  assert.equal(mode(macFile), 0o600);
  assert.deepEqual(
    fs.readdirSync(macDir).filter((name) => name.endsWith('.tmp')),
    [],
    'atomic-write temp files must be cleaned up',
  );
  assert.match(output, /credentials saved/);

  console.log('— failure preserves the previous credential —');
  const before = fs.readFileSync(macFile, 'utf8');
  assert.throws(() => runLogin({
    configDir: macDir,
    claudeCmd: '/usr/local/bin/claude',
    platform: 'darwin',
    spawn: () => ({ status: 0 }),
    readKeychain: () => ({ claudeAiOauth: {} }),
  }), /no OAuth credential/);
  assert.equal(fs.readFileSync(macFile, 'utf8'), before);

  const faultFs = new Proxy(fs, {
    get(target, prop) {
      if (prop === 'fchmodSync') return () => { throw new Error('injected chmod failure'); };
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  assert.throws(() => writeCredentialsFile(macDir, oauth('must-not-land'), {
    fsImpl: faultFs,
    randomBytes: () => Buffer.alloc(6, 1),
  }), /could not save/);
  assert.equal(fs.readFileSync(macFile, 'utf8'), before, 'a pre-rename permission failure must preserve the old file');
  assert.deepEqual(fs.readdirSync(macDir).filter((name) => name.endsWith('.tmp')), []);

  let readAfterFailedLogin = false;
  const failedDir = path.join(tmp, 'failed');
  assert.equal(runLogin({
    configDir: failedDir,
    claudeCmd: '/usr/local/bin/claude',
    platform: 'darwin',
    spawn: () => ({ status: 7 }),
    readKeychain: () => { readAfterFailedLogin = true; return oauth('must-not-read'); },
  }), 7);
  assert.equal(readAfterFailedLogin, false);
  assert.equal(fs.existsSync(path.join(failedDir, '.credentials.json')), false);
  const cliFailedDir = path.join(tmp, 'cli-failed');
  const helperCli = spawnSync(process.execPath, [
    path.join(process.cwd(), 'data/bin/vibespace-claude-subscription-login.mjs'),
    '--config-dir', cliFailedDir,
    '--claude', '/usr/bin/false',
    '--attempt', 'vslogin-test-1234',
  ], { encoding: 'utf8' });
  assert.equal(helperCli.status, 1);
  assert.deepEqual(
    (({ state, code, attempt }) => ({ state, code, attempt }))(
      JSON.parse(fs.readFileSync(path.join(cliFailedDir, LOGIN_STATUS_FILE), 'utf8')),
    ),
    { state: 'error', code: 'claude-login-exit', attempt: 'vslogin-test-1234' },
  );

  console.log('— non-macOS keeps the CLI-written file —');
  const linuxDir = path.join(tmp, 'linux');
  fs.mkdirSync(linuxDir, { mode: 0o755 });
  const linuxFile = path.join(linuxDir, '.credentials.json');
  fs.writeFileSync(linuxFile, JSON.stringify(oauth('linux-access')), { mode: 0o644 });
  assert.equal(runLogin({
    configDir: linuxDir,
    claudeCmd: '/usr/bin/claude',
    platform: 'linux',
    spawn: () => ({ status: 0 }),
    readKeychain: () => { throw new Error('Keychain must not run on Linux'); },
    output: () => {},
  }), 0);
  assert.equal(mode(linuxDir), 0o700);
  assert.equal(mode(linuxFile), 0o600);

  console.log('— account manager marks macOS shadows non-portable —');
  const macData = path.join(tmp, 'manager-mac');
  const macAccounts = new AccountManager({ dataDir: macData, platform: 'darwin' });
  const macAccount = macAccounts.createSubscription({ name: 'Mac account' });
  writeCredentialsFile(macAccount.dir, oauth('manager-mac-access'));
  const macListed = macAccounts.list().accounts.find((a) => a.id === macAccount.id);
  assert.equal(macListed.localOnly, true);
  assert.equal(macAccounts.resolveForSpawn(macAccount.id).remoteCreds.shippable, false);
  const macFinalized = macAccounts.finalizeSubscription(macAccount.id);
  assert.equal(macFinalized.localOnly, true);
  assert.equal(Object.hasOwn(macFinalized, 'accessToken'), false);
  const macExport = macAccounts.exportBundle().accounts.find((a) => a.id === macAccount.id);
  assert.equal(Object.hasOwn(macExport.files || {}, '.credentials.json'), false);
  assert.equal(Object.hasOwn(macExport.files || {}, '.claude.json'), true);

  const macMergeFrom = macAccounts.createSubscription({ name: 'Fresh duplicate' });
  const macMergeInto = macAccounts.createSubscription({ name: 'Old duplicate' });
  writeCredentialsFile(macMergeFrom.dir, oauth('fresh-keychain-shadow'));
  writeCredentialsFile(macMergeInto.dir, oauth('old-keychain-shadow'));
  assert.throws(
    () => macAccounts.mergeSubscription(macMergeFrom.id, macMergeInto.id, { preferFromCreds: true }),
    /Keychain-backed subscriptions cannot be merged/,
  );
  assert.equal(fs.existsSync(macMergeFrom.dir), true, 'rejected merge must preserve the fresh Keychain-bound dir');
  assert.equal(fs.existsSync(macMergeInto.dir), true, 'rejected merge must preserve the survivor dir');

  const failedAccount = macAccounts.createSubscription({ name: 'Failed login' });
  writeLoginStatus(failedAccount.dir, { state: 'error', code: 'keychain-read' });
  assert.equal(mode(path.join(failedAccount.dir, LOGIN_STATUS_FILE)), 0o600);
  assert.deepEqual(
    (({ loggedIn, loginFailed, loginErrorCode }) => ({ loggedIn, loginFailed, loginErrorCode }))(
      macAccounts.finalizeSubscription(failedAccount.id),
    ),
    { loggedIn: false, loginFailed: true, loginErrorCode: 'keychain-read' },
  );

  const linuxData = path.join(tmp, 'manager-linux');
  const linuxAccounts = new AccountManager({ dataDir: linuxData, platform: 'linux' });
  const linuxAccount = linuxAccounts.createSubscription({ name: 'Linux account' });
  writeCredentialsFile(linuxAccount.dir, oauth('manager-linux-access'));
  assert.equal(linuxAccounts.list().accounts.find((a) => a.id === linuxAccount.id).localOnly, false);
  assert.equal(linuxAccounts.resolveForSpawn(linuxAccount.id).remoteCreds.shippable, true);
  assert.ok(linuxAccounts.exportBundle().accounts.find((a) => a.id === linuxAccount.id).files['.credentials.json']);

  const mergeFrom = linuxAccounts.createSubscription({ name: 'Merge from' });
  const mergeInto = linuxAccounts.createSubscription({ name: 'Merge into' });
  writeCredentialsFile(mergeFrom.dir, oauth('fresh-merge-access'));
  writeCredentialsFile(mergeInto.dir, oauth('stale-merge-access'));
  fs.chmodSync(path.join(mergeInto.dir, '.credentials.json'), 0o644);
  fs.chmodSync(path.join(mergeInto.dir, '.claude.json'), 0o644);
  linuxAccounts.mergeSubscription(mergeFrom.id, mergeInto.id, { preferFromCreds: true });
  assert.equal(mode(path.join(mergeInto.dir, '.credentials.json')), 0o600);
  assert.equal(mode(path.join(mergeInto.dir, '.claude.json')), 0o600);

  console.log('— credential minimization and shell quoting —');
  assert.deepEqual(
    parseOAuthCredentials(JSON.stringify({ ...oauth('kept-access'), mcpOAuth: { token: 'must-not-copy' } })),
    oauth('kept-access'),
  );
  const hostilePath = `/tmp/space ' quote $(printf INJECTED)`;
  const quotedRoundTrip = execFileSync('/bin/sh', [
    '-c',
    `printf %s ${shellQuote(hostilePath)}`,
  ], { encoding: 'utf8' });
  assert.equal(quotedRoundTrip, hostilePath);
  assert.throws(() => shellQuote('/tmp/first\nsecond'), /control character/);
  assert.equal(buildClaudeSubscriptionLoginCommand({
    nodeCmd: '/node path',
    helperPath: "/repo/it's/helper.mjs",
    claudeCmd: '/claude path',
    configDir: hostilePath,
  }), [
    "'/node path'",
    `'/repo/it'"'"'s/helper.mjs'`,
    "'--config-dir'",
    `'/tmp/space '"'"' quote $(printf INJECTED)'`,
    "'--claude'",
    "'/claude path'",
  ].join(' '));
  assert.ok(HostManager.AGENT_TOOLS.includes('vibespace-claude-subscription-login.mjs'));
  const fakeHosts = Object.create(HostManager.prototype);
  fakeHosts.get = () => ({ id: 'host-test' });
  fakeHosts._hostShell = async () => [
    'OS:Darwin', 'SUB:0', 'KEY:', 'HELPER:no', 'EMAIL:', 'CXJWT:', 'CMT:', 'XMT:',
    'HSUBS:',
    'HSSTAT:/Users/alice/.vibespace/subs/sub-a1b2c3/.vibespace-login-status.json:{"version":1,"state":"error","code":"keychain-read","attempt":"vslogin-test-1234","updatedAt":1}',
  ].join('\n');
  const fakeHostStatus = await fakeHosts.accountsStatus('host-test');
  assert.equal(fakeHostStatus.platform, 'darwin');
  assert.deepEqual(fakeHostStatus.hostSubLoginStatus, {
    'sub-a1b2c3': { state: 'error', attempt: 'vslogin-test-1234' },
  });
  const manageAgentsSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/manage-agents.js'), 'utf8');
  assert.equal(
    (manageAgentsSource.match(/remoteClaudeSubscriptionLoginCommand\(/g) || []).length,
    4,
    'all three remote per-account login entry points must use the helper',
  );
  assert.doesNotMatch(manageAgentsSource, /CLAUDE_SECURESTORAGE_CONFIG_DIR=.*claude (?:auth login|\/login)/);
  assert.match(manageAgentsSource, /loginStatus\.attempt !== loginAttempt/);
  assert.match(manageAgentsSource, /loginStatus\.state === 'success'\) complete\(false\)/);
  const wsSource = fs.readFileSync(path.join(process.cwd(), 'src/ws-create.js'), 'utf8');
  assert.match(wsSource, /needsClaudeLoginHelper && !present\.includes\('vibespace-claude-subscription-login\.mjs'\)/);
  // Adapted from the PR's literal pattern: current master keeps the B-211a
  // nuance (held billing rides dialAcctAssign — _hostSubReady exempts it from
  // the fatal-secret rule), so the merged guard is a compound condition.
  assert.equal(
    (wsSource.match(/\(spawnAccount\?\.secret && !spawnAccount\._hostSubReady\) \|\| needsClaudeLoginHelper/g) || []).length,
    2,
    'dial helper placement failures must not degrade to a helper-less terminal',
  );
  const serverSource = fs.readFileSync(path.join(process.cwd(), 'src/server/account-usage-routes.js'), 'utf8');
  assert.match(serverSource, /r\.platform && r\.platform !== 'darwin'/);
  assert.match(serverSource, /!fin\.localOnly/);

  console.log('\nall Claude subscription login tests passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
