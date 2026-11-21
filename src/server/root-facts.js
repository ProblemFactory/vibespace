'use strict';
// THE BOOT'S READ OF THE HUB'S OWN TREE (B-ba47 shape H, 2026-11-21; moved onto the root, 主开发 r1597): the boot's first act
// (src/server/throwaway-root.js) asks «is this root a linked worktree» before any module reads a home, so the reader lives in
// a module that loads nothing heavy — fs, path, the pure verdict, the mount door. It is SYNCHRONOUS and asked ONCE, for the hub's
// own root, before the hub listens; every later ask reads the boot's cached verdict. Every conversation's root is read by
// src/server/agent-tool-generators.js's own reader (B-1425: asynchronous, one read in flight, off the loop), never by this one.
const fs = require('fs');
const path = require('path');
const DOOR = require('../mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read
const serverRoot = require('../server-root');
const realOr = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
function readRootFacts(root) {
  if (DOOR.blocked(path.resolve(root))) return { root: path.resolve(root), gitDir: null, gitCommonDir: null, error: DOOR.sentenceFor(path.resolve(root)) };   // B-afc4
  const facts = { root: realOr(path.resolve(root)), gitDir: null, gitCommonDir: null };
  const dotGit = path.join(facts.root, '.git');
  const errOf = (e) => (e && e.code) || (e && e.message) || String(e);
  let st = null;
  try { st = fs.statSync(dotGit); } catch (e) { if (e && e.code === 'ENOENT') return facts; facts.error = `${dotGit} cannot be read (${errOf(e)})`; return facts; }
  if (st.isDirectory()) { facts.gitDir = facts.gitCommonDir = realOr(dotGit); return facts; }
  let gd = null;
  try { gd = serverRoot.parseGitFile(fs.readFileSync(dotGit, 'utf-8')); } catch (e) { facts.error = `${dotGit} cannot be read (${errOf(e)})`; return facts; }
  if (!gd) { facts.error = `${dotGit} is a file without a gitdir: line`; return facts; }
  facts.gitDir = realOr(path.resolve(facts.root, gd));
  // the gitdir itself: GONE ⇒ a worktree whose checkout was removed — git's own layout (<common>/worktrees/<name>) still
  // names the checkout, so it stays a worktree (never "no git"); any other failure is the error fact
  try { fs.statSync(facts.gitDir); } catch (e) {
    const m = /^(.+)\/worktrees\/[^/]+$/.exec(facts.gitDir);
    if (e && e.code === 'ENOENT' && m) { facts.gitCommonDir = m[1]; facts.dangling = true; return facts; }
    facts.error = `the gitdir ${facts.gitDir} named by ${dotGit} cannot be read (${errOf(e)})`; return facts;
  }
  let common = facts.gitDir;
  try { common = realOr(path.resolve(facts.gitDir, fs.readFileSync(path.join(facts.gitDir, 'commondir'), 'utf-8').trim())); }
  catch (e) { if (!(e && e.code === 'ENOENT')) { facts.error = `${path.join(facts.gitDir, 'commondir')} cannot be read (${errOf(e)})`; return facts; } } // no commondir = a submodule / --separate-git-dir: the gitdir IS the common dir
  facts.gitCommonDir = common;
  return facts;
}

module.exports = { readRootFacts };
