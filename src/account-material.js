'use strict';
/**
 * account-material.js — the DEVICE-TIER credential-MATERIAL operations
 * (design §Account management split: "credential material and login lifecycle
 * belong to the device tier … the server machine's credential directories
 * (data/subs/) are properly understood as DEVICE #0's account store").
 *
 * This module is the formalization: the mechanical acts that touch credential
 * material live HERE, shared by the server (device #0, in-process) and the
 * daemon bundle (the sealed-orders emergency reflex re-points the pool
 * symlink with the SAME implementation). The orchestrator keeps decisions and
 * descriptors; material mechanics are one implementation per machine.
 *
 * repointPoolSymlink: the pool hot-swap primitive (2.251.0 semantics kept
 * byte-for-byte — symlink-to-temp + rename + utimes on the target's creds so
 * the CLI's mtime-gated credential cache invalidates; refuses to clobber a
 * REAL directory, which would be someone's credentials).
 */
const fs = require('fs');
const crypto = require('crypto');

/** Atomically re-point `linkPath` at `targetDir`. `credsPath` gets a utimes
 *  bump — LOAD-BEARING (measured on claude 2.1.281, lane-hot-switch
 *  2026-09-30, scripts/fixtures/claude-cred-read-2.1.281.json): a running CLI
 *  re-reads its credential file only when the mtime it statx()es through the
 *  link DIFFERS from the last one it saw, so a re-point onto a file with an
 *  equal mtime is never followed. Every re-point of a session or pool link
 *  passes the target's creds path. Throws rather than replace a non-symlink. */
function repointPoolSymlink(linkPath, targetDir, credsPath = null) {
  try {
    const st = fs.lstatSync(linkPath);
    if (!st.isSymbolicLink()) throw new Error('pool path is a real directory, refusing to replace: ' + linkPath);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const tmp = linkPath + '.swap-' + crypto.randomBytes(4).toString('hex');
  fs.symlinkSync(targetDir, tmp);
  fs.renameSync(tmp, linkPath);
  if (credsPath) { try { const now = Date.now() / 1000; fs.utimesSync(credsPath, now, now); } catch { } }
}

module.exports = { repointPoolSymlink };
