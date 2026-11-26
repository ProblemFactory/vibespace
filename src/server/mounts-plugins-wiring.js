'use strict';
// MOUNTS + PLUGINS + DIAL-SESSION WIRING (decomposition #12): the MountManager
// and PluginManager singletons with their route families, the DialSessionBridge,
// graduateHostToDial (ssh→dial graduation used by both the button and the
// auto path), and createSessionMessages (the transcript-reader factory).
// Extracted VERBATIM. ORCH tier.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sameToken } = require('../pairing-token.js'); // B-8dda
const http = require('http');
const { spawn, execFile, execFileSync } = require('child_process');
const { SessionMessages } = require('../session-store');
const { CodexSessionMessages } = require('../codex-session-store');
const { MountTokens } = require('../webdav');

const { mk } = require('./lazy.js');
// THE SEAM 2.369.411 × .412 (lane bl-windows, 主开发 07:55Z): the membership a GRANT is judged on — while the Task Groups store is
// HELD the release's reader throws by name (TASK_GROUPS_UNREAD: unreadable, never «in no group»); else the train's read WITH the machine
// (hostId), carrying B-55dc's «still being read» flag (memberIds — a reply marked unread is unknown too). Never an empty fallback.
// `reader`: the follow's one log line a hold, per reader (groupIdsForGrant marks the first throw of a hold for each)
const grantMemberIds = (tasks, a, reader) => (typeof tasks.isHeldUnread === 'function' && tasks.isHeldUnread() ? tasks.groupIdsForGrant(a, reader) : tasks.memberIds(a));
const { personOnlyDoor } = require('../routes/account-tails.js');   // B-ee0a: the no-vault credential doors' ONE person check (the mount config door too)

function create({ deliveryWakeDeps = () => ({}), app, server, rootDir, HOST, PORT, BUFFERS_DIR, PERMISSION_MODES,
  auth, wss, WS_OPEN, bcastAll, serverSetting, mountTokens, persistenceRouter, instanceUrl,
  hosts, agentdDials, agentdDialDevices = null, agentdHostToken, agentdMintDialPair, deviceForDial, lockOutDialHolder = () => false,
  ensureAgentdOnHost, getPortForwards, onMountsUpdated, activeSessions, getTelemetry = null, serverNotice = null, broadcastActiveSessions = null,
  otelTokenRow = null,   // B-f276 family unit 2: the OTel sign-in value's own hold, a row of the held list
  // agent browser P1 second half (§3.2.5 / §3.8): the Task-Group default rung, the
  // zero-billed notice queue and the session-meta writer the pin persists through
  getTasks = null, sessionStatusKey = null, getSessionStatus = null, persistSessionMeta = null, rebindSessionMeta = null,
  // lane jobs-browser (B-dbc1): the Background Work engine — a job browses as its owner conversation while its run is alive
  getJobs = null,
  // unit what-it-may-use: the doors built AFTER this wiring (server.js — the channels engine, the exit manager, the window engine), asked at each read
  mayUseDoors = null,
  // lane login-request-card (majordomo piece 3b): the jobs wiring — piece 7's in-process wake-grant door (setWakeGrant) and the
  // proposal door it calls (setProposalDoor ⇐ the proposal store's proposeWakeGrant)
  jobsWiring = null,
  // lane conversation-facts (majordomo piece 2): the hub's own instances the list's sources read (in memory) — {autoResume, stashView, sysinfo, stoppedSessions}
  listSources = () => ({}),
  // B-f7ab: the late browser key reads the record it extends (never a partial one) and asks THE integration switch
  readSessionMetaOf = null, integrationEnabled = null,
  // agent browser P3 (§4.3.1): the ONE delivery ladder the handback announcer forwards to, and the "For you" inbox
  deliver = null, userTodos = null,
  // lane J r2: the adapter registry the browser takeover's stale sweep answers pending approvals through (THE one permission answer)
  adapterRegistry = null,
  // agent browser P4 second half (§7.5): the integration store (src/server/integrations-wiring.js, created BEFORE this
  // wiring in server.js) the key consumer resolves through — never process.env
  integrations = null,
  // lane vault-contents-window: the two stores the Vault window lists that server.js creates elsewhere (read at request time)
  getAccounts = () => null, getChannels = () => null,
  // lane agent-feedback: server.js's SyncStore table — the `feedback` mirror registers here (live to every client)
  syncStores = null }) {
  const portForwards = mk(getPortForwards);
// ── Mounts (rclone S3 mounts + share minting — collaboration P1) ──
// ── Plugins (2.140.0, B-2d44): host-level capabilities with persistent state ──
const { PluginManager } = require('../plugins');
let voicePlugin = { peek: () => ({}), update: () => {}, settings: () => ({}), writeSettings: () => {} }; // Dropline voice input (q-029 P0): the plugin hands its record reader back here
// AGENT FEEDBACK (lane agent-feedback — the owner 2026-10-18: agents report what felt wrong; ⚙ System ▸ Agent feedback… shows
// it): data/feedback.json + the server-owned `feedback` StateSync mirror (src/server/feedback-store.js) and the routes
// (src/routes/feedback.js). The caller's Task Group and the instance are facts the ROUTE fills, never the body.
// lane feedback-forward: every NEW report goes to the maintainer hub when this instance has a telemetry forward target
// (src/server/feedback-forward.js: the outbox data/feedback-outbox.json, the pull of the maintainer's marks at boot + 6 h);
// the hub's two doors are the routes' (the collector's token, as /api/telemetry/ingest)
const feedbackForward = require('./feedback-forward.js').create({
  dataDir: path.join(rootDir, 'data'), log: (...a) => console.warn(...a), applyMarks: (marks) => feedback.applyMarks(marks), backlog: () => (typeof feedback.isHeldUnread === 'function' && feedback.isHeldUnread() ? null : feedback.list().reports),   // r3193: null = the list is HELD (unread, never «no open reports»)
  target: () => { const t = getTelemetry && getTelemetry(); return t && typeof t.forwardTarget === 'function' ? t.forwardTarget() : {}; },
  instance: () => ({ name: process.env.VIBESPACE_INSTANCE_NAME || os.hostname(), version: require('../../package.json').version }),
  // lane feedback-forward-404: a target with no feedback door pauses the outbox; the owner's ONE low For-you notice only
  // when a PERSON set telemetry.forwardUrl here (the setting wins over the cluster's env — an env target logs a line only)
  personSet: () => { try { return !!String(serverSetting('telemetry.forwardUrl') || '').trim(); } catch { return false; } }, userTodos: () => userTodos,
});
{ const tel = getTelemetry && getTelemetry(); if (tel) tel.onForwardAnswer = (url, res) => feedbackForward.noteAnswer(url, res); }   // the target's release off the telemetry forward's own answers
// lane fleet-feedback-marks: a mark that names a release is TOLD to the conversation that filed the report — ONE free
// next-turn notice (session-status `feedback-handled`; PURE feedback-model filerKey: a running session's own key, else
// <harness>:<conversation id>), the same report's older one replaced; never a wake
const feedbackFilerKeyOf = (sid) => { for (const [id, s] of activeSessions) if (s && !s.isTmuxView && (id === sid || require('../claude-lock-capture.js').addressableId(s) === sid)) return sessionStatusKey ? sessionStatusKey(s, id) : null; return null; };
const feedbackTell = (notice, row) => { const st = getSessionStatus ? getSessionStatus() : null; const key = st ? require('../feedback-model.js').filerKey(row, feedbackFilerKeyOf) : null; if (!key) return; st.dropNotices(key, (x) => x && x.kind === 'feedback-handled' && x.id === notice.id); st.pushNotice(key, notice); };
require('./writes-lost.js').install({ dataDir: path.join(rootDir, 'data') }); // lane cli-2-1-319-records r2: a lost write's warning, kept past its process
const feedback = require('./feedback-store.js').create({ dataDir: path.join(rootDir, 'data'), wss, log: (...a) => console.warn(...a), onNew: (row) => feedbackForward.enqueue(row), tell: feedbackTell });
if (syncStores) syncStores.feedback = feedback.sync;
require('../routes/feedback.js').registerFeedbackRoutes(app, {
  store: feedback, activeSessions, getJobs,
  groupOf: (s, id) => {
    const tasks = getTasks && getTasks();
    const gs = tasks && sessionStatusKey ? tasks.groupsForSession({ sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }) : [];
    const g = gs.find((x) => x.id === s._initialGroupId) || gs[0];
    return g ? { id: g.id, name: g.title || null } : null;
  },
  groupRead: (s, id) => { const tasks = getTasks && getTasks(); return tasks && sessionStatusKey && typeof tasks.membershipRead === 'function' ? tasks.membershipRead({ sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }) : null; },
  instance: () => ({ name: process.env.VIBESPACE_INSTANCE_NAME || os.hostname(), version: require('../../package.json').version }),
  collectorToken: () => process.env.VIBESPACE_TELEMETRY_INGEST_TOKEN || '', selfKeyId: () => feedbackForward.keyId(),
  forwardOf: (id) => feedbackForward.forwardOf(id),   // lane feedback-forward-404: `vibespace-feedback list` says a report stayed here
});
feedbackForward.start();
// THE VAULT (lane vault-e2e-password): the ONE holder of the DEK (memory only) and the provider of every store key under data/
// (secret-box `lawfulKey` asks it; a key read before this line answers exactly as the engine would — the files before the
// setup, locked after). LOCKED after every start: only a person's door (src/routes/vault.js) unlocks it.
const vault = require('./vault-engine.js').create({ dataDir: path.join(rootDir, 'data'), signInPassword: (pw) => !!(auth && auth.verifyPassword(pw)), bcast: (m) => bcastAll(m), signals: true });
// lane vault-e2e-password-fix-r2: THE DEVICE LINK TOKENS (src/server/host-tokens.js — the vault's `host:<id>` entries): the ONE
// road to a session is GET /api/agent/vault/link-token (the attach child asks with its session token); every attach config
// an older build wrote loses its copy now, whatever the vault's state
const hostTokens = require('./host-tokens.js').create({ anyHubPin: () => (hosts.held() ? true : hosts.list().filter((h) => !!h.hubPinned).map((h) => h.name || h.id)), dataDir: path.join(rootDir, 'data'), nameOf: (k) => { const h = vaultHostOf(k); return (h && h.name) || null; } });   // nameOf: a LOCKED refusal is noted by the machine's name (lane vault-locked-refusal-notice)
try { hostTokens.stripCopies(); } catch (e) { console.warn('[vault] the attach configs could not be swept:', e.message); }
vault.onUnlock(() => { try { const jm = getJobs && getJobs(); if (jm && typeof jm.relayChanged === 'function') jm.relayChanged('the vault unlocked'); } catch (e) { console.error('[jobs] re-publish after the vault unlocked:', e.message); } }); // lane job-notice-dedupe (fb-666f37fd38): a published service the lock held down re-publishes NOW — not after the Ports heal backoff (above every route: a line in a route's span reads as that route's store)
// lane account-reset-door: A FACT RECORDED WHILE LOCKED ENDS AT THE UNLOCK — the long-lived-token sweep's `vault_locked` facts go, and
// the sweep runs now (it records what is true; it ran every 15 min) — ⟳ and the pool never say «the vault is locked» with it open
vault.onUnlock(() => { try { const acc = getAccounts(); if (acc && typeof acc.forgetVaultLockedFacts === 'function') { acc.forgetVaultLockedFacts(); acc.syncOatFiles?.().catch?.(() => { }); } } catch (e) { console.error('[oat-file] re-sweep after the vault unlocked:', e.message); } });
// THE VAULT'S CONTENTS (lane vault-contents-window): the Vault window's masked inventory and its 5-minute reveal — each store
// lists and opens its own rows (`vaultRows` / `vaultReveal`); the getters are read at request time (the stores below exist by then)
const appSecretsDoor = { vaultRows: () => require('../app-secrets.js').appSecretRows({ dataDir: path.join(rootDir, 'data') }), vaultReveal: (e, f) => require('../app-secrets.js').appSecretReveal({ dataDir: path.join(rootDir, 'data') }, e, f) };
// int317: a machine's NAME on its rows (a link token's `dial-<deviceId>` or host id; a per-machine record's host id) — the id when
// hosts know none; «Hub secrets» = the engine's own entries (r2), names and dates only
const vaultHostOf = (k) => { try { const s = String(k || ''); return s ? (s.startsWith('dial-') ? hosts.findByDeviceId(s.slice(5)) : hosts.get(s)) || null : null; } catch { return null; } };
const vaultMachineName = (k) => { const h = vaultHostOf(k); return String((h && (h.name || h.id)) || k); };
const vaultSources = {
  accounts: () => getAccounts(), integrations: () => (integrations ? { vaultRows: () => integrations.vaultRows({ machineName: vaultMachineName }), vaultReveal: (e, f) => integrations.vaultReveal(e, f) } : null), channels: () => getChannels(), mounts: () => mounts, 'app-secrets': () => appSecretsDoor,
  secrets: () => require('./vault-contents.js').secretSource({ vault, machineName: vaultMachineName, providerName: (id) => { const s = require('./provider-store.js').forDir(path.join(rootDir, 'data')); const p = s && s.get(id); return p ? p.label : id; } }),   // lane lg-providers: a provider key's row names its provider
  passkeys: () => (browserDialogs && typeof browserDialogs.passkeyVaultRows === 'function' ? { vaultRows: () => browserDialogs.passkeyVaultRows(), vaultReveal: (e, f) => browserDialogs.passkeyVaultReveal(e, f) } : null),
  automation: () => automation,   // design q-046: the automation keys (their values, one per reveal — to hand to an outside party)
};
const vaultContents = require('./vault-contents.js').create({ vault, sources: vaultSources, runFacts: (row) => vaultRun.rowFacts(row), jobFacts: (row) => (vaultJob ? vaultJob.rowFacts(row) : null) });   // lane vault-run-door: each row's «Usable by agent runs»   // lane vault-job-approval: + its approved Background jobs (read at the list — vaultJob is wired below)
// lane vault-run-door (design q-043 §8 P0-f): `vibespace-vault run` — the HUB spawns an agent's command with a stored value
// injected (env / a 0600 file / stdin — never argv) and answers its output SCRUBBED; the owner opens each entry for runs and
// answers each new command shape (src/server/vault-run-door.js over PURE src/vault-run.js); a lock stops every run
// lane vault-use-grants (the owner 2026-10-27 「每个密码请求都要我同意太麻烦了！」): WHO may use an entry with NO card, for which hosts,
// until when — the grant door `vault-use` (PURE src/vault-use-grant.js; ONE writer src/server/vault-use-grants.js into the grants
// store); the run door asks it before a card, with the caller's keys and its Task Groups READ NOW (never copied onto the grant)
const vaultUseGrants = require('./vault-use-grants.js').create({ grants: () => require('./grants-store.js').store(), vault, dataDir: path.join(rootDir, 'data'), log: (m) => console.log(m),
  // lane vault-use-grants round 4 (item 4): a vault-use member dropped because its mac no longer verifies (a forged row, a
  // deleted `except`, or an older row replayed after an owner write bumped the generation) is named ONCE in the For-you tray —
  // filed by the run door (a vault producer: `noteGrantStale`), late-bound (vaultRun is constructed just below).
  onStale: (resource) => { try { vaultRun.noteGrantStale(resource); } catch (e) { console.log(`[vault-use] the grant-stale notice could not be filed (${e.message})`); } } });
const vaultUseFacts = (caller) => {
  for (const [id, s] of activeSessions) {
    if (!s || s.isTmuxView || !caller || require('../claude-lock-capture.js').addressableId(s) !== caller.conversationId) continue;   // fork-safe: a pending fork shares its parent's id and is never picked
    let groupIds = [], inheritedGroupIds = [], groupsUnreadable = false;
    const tasks = getTasks && getTasks();
    // lane lg-group-parents U3a: own groups + their ancestors from the ONE reader (tasks.grantGroupsOf)
    if (tasks && sessionStatusKey) { try { const ids = grantMemberIds(tasks, { sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }); const gg = tasks.grantGroupsOf(ids); groupIds = gg.ids; inheritedGroupIds = gg.inherited; if (ids.unread) groupsUnreadable = true; /* B-55dc: still being read */ } catch { groupsUnreadable = true; } }   // a HELD store throws: UNREADABLE, never «in no group» (lane bl-windows)
    const tb = s._turnBy && typeof s._turnBy === 'object' ? s._turnBy : null;   // B-d868: who started the turn now running (claude-stream-json's kept fact)
    return { conversationKeys: require('../grant-model.js').conversationKeysOf(s, s._webuiId || id), groupIds, inheritedGroupIds, groupsUnreadable, turnBy: tb ? require('../message-manager.js').turnByForAsk({ ...tb, by: String(tb.by || 'unrecorded') }, s._turnByBackground) : null };   // B-d868: background work of another turn ⇒ «not recorded»
  }
  return { conversationKeys: caller && caller.conversationId ? [caller.conversationId] : [] };
};
const vaultRun = require('./vault-run-door.js').create({ dataDir: path.join(rootDir, 'data'), vault, sources: vaultSources, userTodos, log: (m) => console.log('[vault-run]', m),
  spawnPriority: () => require('./spawn-priority.js').priorityFor({ serverSetting, local: true, log: console }),   // B-7f18: a run's command starts below the hub, as a conversation does (the setting read per run)
  useGrants: vaultUseGrants, useFacts: vaultUseFacts, groupNameOf: (id) => { const tk = getTasks && getTasks(); return tk ? tk.lineageNameOf(id) : null; },
  notice: (key, text, o) => (typeof serverNotice === 'function' ? serverNotice(key, text, o) : 0),   // lane vault-standing-request r7: a run the 1-hour window let through pops ONE notice on every open client (never filed in For you)
  // lane vault-use-grants (R4, default OFF): the policy judge = the ONE decisions caller (decision-engine judge, use vault-use-policy —
  // its gates: the LLM plugin, the key, the day's money); the owner's policy rides the question, the card's facts the input
  policyOn: () => serverSetting('vault.policyJudge') === true,
  policyJudge: (parts, { policy, memo }) => decisionEngine.judge('vault-use-policy', parts, { questions: [require('../decision-model.js').vaultPolicyQuestion(policy)], memo, perHour: 30 }),   // round 3 (MAJOR item 6): `memo` is ALWAYS null (the door's marked policyApproved is the sole memo, never the engine's unmarked decision-memo.json). round 4 (MAJOR item 5): `perHour: 30` RESTORED as the engine's atomic SECOND fence (it books in the same synchronous step as the budget check) beside the door's own per-conversation counter — two independent, fail-closed bounds (the engine's is a shared billing cap, the door's is this use's own, persisted across a restart)
  agentEnv: () => require('../agent-env.js').agentEnv(process.env, { drop: require('../harness-env.js').agentCredentialEnvNames(require('../harnesses').list()) }),
  instanceKind: () => require('../hub-act-policy.js').instanceKindOf(process.env, { presetsDir: (() => { try { return require('./cluster-presets.js').sharedPresets().dir || null; } catch { return null; } })() }),
  liveOf: (cid) => { for (const s of activeSessions.values()) if (s && cid && (s.backendSessionId || s.claudeSessionId) === cid) return true; return false; } });
try { const n = vaultRun.sweep(); if (n) console.log(`[vault-run] ${n} run folder(s) a previous process left were shredded`); } catch { }
process.once('exit', () => { try { vaultRun.closeAll(); } catch { } });
// lane vault-job-road (design-vault-service-secret L1a): a Background Work job's `--vault` values — the engine asks this door at
// EVERY spawn (locked or unapproved ⇒ the job waits; an unlock or a `vault-job` grant row starts it), the values ride the
// wrapper's fd 3 and the job's fd 4+ (src/server/vault-job-door.js over PURE src/vault-job.js) — never env, argv or a file
let vaultJob = null; try { const jm = getJobs && getJobs(); vaultJob = require('./vault-job-door.js').create({ vault, grants: () => require('./grants-store.js').store(), log: (m) => console.log(m), userTodos, nameOf: (cid) => { for (const s of activeSessions.values()) if (s && cid && (s.claudeSessionId || s.backendSessionId) === cid) return s.name || null; return null; } }); if (jm && typeof jm.setVaultJob === 'function') jm.setVaultJob(vaultJob); } catch (e) { console.error('[vault-job] the job door could not be wired:', e.message); }   // lane vault-job-approval: + its approval cards (For you) and the person's answer route (jobAsks)
setTimeout(() => { try { const n = vaultRun.reconcile(); if (n) console.log(`[vault-run] ${n} run card(s) from before the restart resolved expired`); } catch { } }, 3000).unref?.();
// design q-047 L1 (lane vault-totp): TWO-STEP CODES — the vault's `totp:<name>` entries (src/server/vault-totp.js over PURE
// src/totp.js): a person sees the CODE (no 「验证是你」, audited); a conversation — THIS RUN of it (its token's digest) — or a
// Task Group a person granted gets it; the seed only behind the reveal door, never to an agent
const vaultTotp = require('./vault-totp.js').create({ dataDir: path.join(rootDir, 'data'), vault, log: (m) => console.log('[vault-totp]', m) });
// the RUNNING session that carries `cid` AS ITS OWN (addressableId: a pending fork shares its parent's id and is never picked —
// test-msg-cli-groups §2c); a use by such a fork presents another token, so the parent's run-bound grant never covers it
const totpSessionOf = (cid) => [...activeSessions.values()].find((s) => s && !s.isTmuxView && require('../claude-lock-capture.js').addressableId(s) === cid) || null;
const totpRunOf = (cid) => { const s = totpSessionOf(cid); return s ? require('./vault-totp.js').runOfToken(s.agentToken) : null; };   // THIS run of a running conversation (its token's digest)
// lane browser-login (r22–r25 pivot): WEB LOGINS — the vault's `web-login:<origin>#<user>` entries (PURE
// src/browser-login.js; ONE writer src/server/browser-logins.js): Hub types them over CDP, VibeSpace never hands an agent a value; the
// `browser-login` grant (the ONE grants store) decides who may, and covers the login's paired two-step code (D3); an account
// an agent registers is saved automatically, with its provenance, and ONE For-you notice tells the owner (D5 as reversed)
const browserProxyLogins = require('./browser-proxy-logins.js').create({ vault });   // B-8b87: a browser proxy's login — the ONE writer and reader (its reader: the keeper's forwarder)
const browserLogins = require('./browser-logins.js').create({ vault, grants: () => require('./grants-store.js').store(), totpCode: (name, o) => vaultTotp.codeForLogin(name, o),
  forYou: { add: (profileId, item) => { if (!userTodos) return null; const r = userTodos.add('browser', { origin: 'browser', by: 'agent', sessionName: 'Agent browser', ...item }); return r && (r.id || (typeof r === 'string' ? r : null)); },
    resolve: (id) => { if (userTodos && userTodos.get(id)?.status === 'open') userTodos.setStatus(id, 'done', 'browser'); } },
  log: (m) => console.log(m) });
// lane vault-paste-request (the owner 2026-10-23: 「应该允许你给我弹一个保险库输入框让我直接 paste 进去」): an agent ASKS for a secret, the
// owner PASTES it into its For-you item's masked box (or refuses); the value goes to the one writer of its place (a registry
// field: the integration store; a free entry: the vault's `secret:<id>`); the asker reads a receipt at its next turn (the stash)
const vaultPaste = require('./vault-paste-door.js').create({ vault, integrations, userTodos, deliver, vaultRun, vaultJob, useGrants: vaultUseGrants, logins: browserLogins, totp: vaultTotp, runOf: totpRunOf, setting: (k) => serverSetting(k), log: (m) => console.log('[vault-paste]', m) });   // useGrants + setting: lane vault-use-grants (a request's default grant)
const vaultJobSecrets = require('./job-secrets-door.js').create({ dataDir: path.join(rootDir, 'data'), vault, paste: vaultPaste, userTodos, log: (m) => console.log('[vault-job-secrets]', m) });   // B-ef1b: the retired job-secrets notice's two buttons (move into the vault / delete the file)
// lane chat-attachments-persist (the cut, 主开发 2026-11-13: «the record is the store»): a picture a message showed is READ
// from the record it came in (the route, through the transcript service: this hub's transcript worker, or a paired
// machine's agent); the files a person dropped into a temporary folder live with the conversation — the store, its stray
// temp files swept now. The hub's conversations = its session records, live or kept (an archived one, one on a machine
// that is offline: still theirs)
const CAM = require('./chat-attachments.js');
const chatAttachments = CAM.create({ root: path.join(rootDir, 'data', 'chat-attachments'),
  // what the hub knows (src/server/chat-attachments.js hubKnowledge): its live sessions, its session records in every form,
  // and — through the transcript worker's `locate`, the harness's own — whether a conversation's transcript is still here
  ...CAM.hubKnowledge({ activeSessions, metaDir: path.join(rootDir, 'data', 'session-meta') }),   // the transcript trees and each harness's proof: its defaults (fail closed)
});
chatAttachments.sweepTemps().catch(() => { });
require('../routes/chat-attachments.js').registerChatAttachmentRoutes(app, { store: chatAttachments,
  transcripts: require('../transcript-service').createTranscriptService({ activeSessions, createSessionMessages: null, hosts }),
  hostKnown: (h) => { try { return !!(hosts && hosts.get(h)); } catch { return false; } },
  cwdOf: (tx, b) => { for (const s of activeSessions.values()) if (s && !s.host && (s.backend || 'claude') === b && (s.backendSessionId || s.claudeSessionId) === tx) return s.cwd || ''; return ''; } });
// lane setting-doors pick 2: THE HOLDS of a one-press setting change — the press's ONE act (the hold on disk before the value) and the
// quiet return (src/server/setting-holds.js); the door asks the pick 0 verdict (src/routes/setting-holds.js)
const settingHolds = require('./setting-holds.js').create({ dataDir: path.join(rootDir, 'data'),
  readSettings: () => persistenceRouter.readSettings(), patchSettings: (p) => persistenceRouter.patchSettings(p),
  broadcast: (m) => bcastAll(m), log: (m) => console.log(m),
  userTodos, settingsHeld: () => (typeof persistenceRouter.settingsHeld === 'function' ? persistenceRouter.settingsHeld() : null) });
if (typeof persistenceRouter.onSettingsLift === 'function') persistenceRouter.onSettingsLift(() => settingHolds.atLift());   // B-225b R11: the owed returns land first at the lift
settingHolds.start().catch((e) => console.log('[setting-holds] start failed:', e && e.message));
require('../routes/setting-holds.js').registerSettingHoldRoutes(app, { holds: settingHolds });
app.locals.settingHolds = settingHolds;   // the agent's ask route judges a lasting change against a live hold (law A)
require('../routes/vault.js').registerVaultRoutes(app, { vault, activeSessions, getJobs, contents: vaultContents, who: (req) => require('../auth.js').Auth.signInHandle(req), run: vaultRun, paste: vaultPaste,
  totp: vaultTotp, callerOf: (token) => sessionCallerOf(token), runOf: totpRunOf, grantLive: (g) => !g.subject.startsWith('session:') || totpRunOf(g.subject.slice(8)) === g.run, subjects: () => conversationSubjects(),
  proxyLogins: browserProxyLogins, proxyMove: (id) => { const k = require('./browser-keeper.js').keeper(); return k && typeof k.moveProxyPassword === 'function' ? k.moveProxyPassword(id) : { ok: false, code: 'unavailable', error: 'the browser keeper is not running on this server' }; },   // B-8b87
  logins: browserLogins,   // lane browser-login: the Vault window's web logins (add / delete / 用于… — a person's doors)
  jobSecrets: vaultJobSecrets,   // B-ef1b: the retired job-secrets notice's buttons (a person's door)
  jobAsks: vaultJob,   // lane vault-job-approval: a Background job's approval card's answer and its ✕ (a person's doors)
  linkTokenFor: (hostKey, who) => hostTokens.tokenFor(hostKey, who),
  // lane lg-remote-hardening (D3 half b): the attach child's hub signature — laws 1 + 2 in host-tokens.js signForMachine
  linkSignFor: (hostKey, devPub, nonceD) => { const h = vaultHostOf(hostKey); const r = hostTokens.signForMachine(h, devPub, nonceD); try { if (h && hosts.noteDeviceKey(h.id, 'hub-pinned', {})) bcastAll({ type: 'hosts-updated' }); } catch { } return r; }, // this signature is what pins the hub on that device (law 3: recorded at once)
  hubPubFor: () => hostTokens.identity().publicKey,
  onVaultWait: () => { try { broadcastActiveSessions && broadcastActiveSessions(); } catch { } },
  // int317 (RED-3): the door's audit row → the device audit (the machine card's Activity…) — the session, its host key, the status
  auditLink: ({ sid, hostKey, status }) => { const h = vaultHostOf(hostKey); if (hosts && hosts.deviceAudit) hosts.deviceAudit.append(require('../device-acts.js').linkTokenLine({ at: Date.now(), sid, hostKey, hostId: h ? h.id : null, machine: h ? (h.name || h.id) : null, status })); } });
// design q-046 (lane automation-keys-core): VIBESPACE'S OWN AUTOMATION KEYS — a key's value is the vault entry `apikey:<id>`
// (never in an agent's hands); a conversation / a Task Group is GRANTED a key by a person; a use is judged on the hub
// (src/server/automation-engine.js over PURE src/automation-keys.js), audited, and stops while the vault is locked
// lane key-grant-everyone r2: a read that failed is SAID (`unreadable`) — the caller's groups judge a Task Group «除了», and []
// would admit the conversation the owner left out of All agents (the engine refuses groups_unreadable instead)
const automationGroupsRead = (s, id) => { const tasks = getTasks && getTasks(); if (!tasks || !sessionStatusKey) return { ids: [], unreadable: true }; try { const ids = grantMemberIds(tasks, { sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }); const gg = tasks.grantGroupsOf(ids); return { ids: gg.ids, inherited: gg.inherited, unreadable: !!ids.unread }; } catch { return { ids: [], unreadable: true }; } };   // held ⇒ throws: unreadable; B-55dc ⇒ unreadable (lane bl-windows seam) · lane lg-group-parents U3d: + the lineage over the same ids (the ONE reader)
// the chain's cure (the U3d read's should): a REACH target whose Task Groups could not be read throws — conversation-ops reads it
// UNREADABLE (it was «in no group»: a parent's or its own group's «除了» was not applied to it)
const automationGroupsStrict = (s, id) => { const g = automationGroupsRead(s, id); if (g.unreadable) throw new Error('the Task Groups could not be read'); return g.ids; };
// lane automation-open-limits (the q-048 verify's M2): an open's limits judge the EFFECTIVE open — what it names, else the
// account store's default and the instance's default model (the typed accessor ws-create's ladder reads)
const automationSettings = require('./harness-config-sync.js').accessorsFor({ serverSetting, harnesses: require('../harnesses') });
// the caller = the vsst_'s conversation; the live list IS the running conversations (an ended one's token is unknown ⇒ 401) —
// the automation doors' and the two-step code door's (design q-047 L1) ONE reading of a session token
const sessionCallerOf = (token) => { for (const [id, s] of activeSessions) if (s && sameToken(token, s.agentToken)) { const cid = s.backendSessionId || s.claudeSessionId || null; const g = automationGroupsRead(s, id); return { conversationId: cid, sessionKey: cid ? `${s.backend || 'claude'}:${cid}` : null, name: s.name || s.webuiName || null, live: !s.isTmuxView, groups: g.ids, inherited: g.inherited || [], groupsUnreadable: g.unreadable,
  scope: String(s._webuiId || id), conv: require('../claude-lock-capture.js').addressableId(s) }; } return null; };   // scope / conv: lane vault-agent-own — the conversation's registered and durable ids (an entry it stored itself is its own)
// the grant pickers' subjects: every running conversation and every Task Group (automation keys' 授权给…, two-step codes' 用于…)
const conversationSubjects = () => { const tasks = getTasks && getTasks(); const sessions = []; for (const [id, s] of activeSessions) { const cid = s && (s.backendSessionId || s.claudeSessionId); if (cid && !s.isTmuxView) sessions.push({ subject: `session:${cid}`, name: s.name || s.webuiName || cid, backend: s.backend || 'claude', webuiId: String(s._webuiId || id) /* lane login-request-card: a grant written under its page id names it too */, ...((gr) => ({ groupIds: gr.ids, inheritedGroupIds: Array.isArray(gr.inherited) ? gr.inherited : [], ...(gr.unreadable ? { groupsUnreadable: true } : {}) }))(automationGroupsRead(s, id)) /* lane grants-unify: the «除了» row offers a picked group's members; the follow-owed read: the hold rides it (the login dialog's «by what» judges them); lane lg-group-parents (ruled (A)): + the ancestors «by what» judges with */ }); } let groups = []; try { groups = tasks ? tasks.list().filter((t) => t && !t.archivedAt).map((t) => ({ subject: `group:${t.id}`, name: t.title || t.id, inheritedGroupIds: tasks.grantGroupsOf([t.id]).inherited })) : []; } catch { groups = []; } return { sessions, groups }; };
// lane vault-window-v2 (design q-047 §3.4): the Vault window's 「需要你」 producers — a use door's refusal (使用失败), an agent's put (建议轮换)
const vaultAttention = require('./vault-hooks.js').createVaultAttention({ userTodos });
// THE MANAGER DESIGN'S PIECE 4 — the hub's ONE LINE of resumes nobody pressed (src/server/resume-line.js: at most two starts at a
// time, each next when a start before it ENDED) and its road: inbox-reopen's headless reopen — the page's own resume create, nothing
// sent — bound by server.js once it is built (`resumeRoad.reopen`); the line starts only once server.js says the boot ADOPTED the
// live sessions (`resumeRoad.adopted()`, when the keepers' 8 s re-adoption settled — the cure round's must 5)
let adoptedNow = null;
const resumeRoad = { reopen: null, kept: null, adopted: () => { if (adoptedNow) adoptedNow(); }, adoptedRemote: () => { remoteSettled = true; try { if (deliver && typeof deliver.readoptSettled === 'function') deliver.readoptSettled(); } catch (e) { console.warn('[resume] the waiting wakes could not be told the re-adoption settled:', e && e.message); } } };   // the wakes that waited for it go now, once   // kept: boot-restore's keptRecordOf (server.js binds it)
// THE STORES CHAIN MEETS PIECE 4 (主开发 02:31Z, its ruling): TWO ROADS, each opened once. A LOCAL resume waits for nothing of the
// hosts store (`adopted()`: the line opens). A REMOTE resume (an entry naming a machine) never runs before the boot's re-adoption of
// the machines' left-running conversations has SETTLED (`adoptedRemote()`), on every road — never held, and held then read (the
// re-adoption then runs at the read and takes seconds over ssh): until then it is refused by name, its place in the line freed (a
// resume once ended a still-running remote agent the re-adoption would have adopted — boot-restore says so). ONE seam for both
// roads that reopen: the resume verb's start and a delivery's wake
let remoteSettled = false;
const REMOTE_READOPT_WORDS = 'it runs on a paired machine, and the conversations left running on the paired machines are not re-adopted yet (VibeSpace could not read its record of them until now, or it is re-adopting them) — resuming it now could end an agent still running there; ask again once VibeSpace has re-adopted them';
const reopenRoads = (item, o) => (item && item.hostId && !remoteSettled ? Promise.resolve({ ok: false, code: 'readopt-pending', why: REMOTE_READOPT_WORDS }) : resumeRoad.reopen(item, o));
const RL = require('./resume-line.js'), RL_PURE = require('../resume-line.js');
// THE MANAGER DESIGN'S PIECE 7: a delivery's owed wake rides the SAME line with its own start in the payload (src/server/delivery-wake.js:
// the gate — limit, spend probe — then the claim, this road's reopen and ONE hand-over); every other entry starts through the road
const startResume = RL.startThrough({ get reopen() { return typeof resumeRoad.reopen === 'function' ? reopenRoads : null; } });   // the two roads' one seam
const resumeLine = RL.createResumeLine({ start: (e) => (e.payload && typeof e.payload.run === 'function' ? e.payload.run(e) : startResume(e)), ready: new Promise((r) => { adoptedNow = r; }), log: (m) => console.log(m) });
// an ENDED conversation's facts for the resume verb (src/server/resume-line.js factsReaderOver — the READER of the kept record; an end's
// record is written by piece 3's writer, after the kill): its kept record and, for a boot's record, its wrapper's sidecar in
// BUFFERS_DIR — small files in the own data dir, read async only when a key asks to resume
const readDataJson = async (p) => JSON.parse(await fs.promises.readFile(p, 'utf8'));
const resumeFactsOf = RL.factsReaderOver({ buffersDir: BUFFERS_DIR, road: resumeRoad, readJson: readDataJson });
// an ENDED conversation's key and names from the stores that still name it — the sidebar's names, the Task Groups — else
// claude:<id> (the resume verb's deadOf; piece 7's deliveries read the SAME, never a copy)
function endedKeyOf(target) {
  const t = String(target || '');
  if (!t || /^sess-/.test(t)) return null;   // a dead webui id names nothing durable
  const cid = t.includes(':') ? t.slice(t.indexOf(':') + 1) : t;
  let backend = t.includes(':') ? t.slice(0, t.indexOf(':')) : null, name = null;
  let st = {};   // B-225b: a HELD list names nothing (no name, no backend from it) — the doors after this ask isArchived, which answers UNKNOWN
  try { st = (persistenceRouter && (persistenceRouter.readUserStatePending || persistenceRouter.readUserState) && (persistenceRouter.readUserStatePending || persistenceRouter.readUserState)()) || {}; } catch (e) { if (!(e && e.code === 'store_unread')) throw e; }   // B-0248 (c) r1053 (1): the PENDING list — the backend the wake's turn runs on, the moment it was set
  const keyed = (o) => Object.keys(o || {}).find((k) => k.endsWith(`:${cid}`));
  const known = keyed(st.customNames) || keyed(st.sessionConfigs) || keyed(st.sessionModes) || null;
  if (!backend && known) backend = known.slice(0, known.indexOf(':'));
  const tasks = getTasks && getTasks();
  if (!backend && tasks) { try { for (const g of tasks.list()) { const hit = (g.sessions || []).map((x) => String((x && x.sessionKey) || x)).find((k) => k.endsWith(`:${cid}`)); if (hit) { backend = hit.slice(0, hit.indexOf(':')); break; } } } catch { } }
  const sessionKey = `${backend || 'claude'}:${cid}`;
  if (st.customNames && st.customNames[sessionKey]) name = String(st.customNames[sessionKey]);
  let groups = [];
  try { groups = tasks ? tasks.groupsForSession({ sessionKey }).map((g) => g.id) : []; } catch { groups = []; }
  let inherited = [];   // lane lg-group-parents U3d: a stopped target's lineage too (restack 415: deadOf's body moved here)
  try { inherited = tasks ? tasks.grantGroupsOf(groups).inherited : null; } catch { inherited = null; }   // null = could not be read (the reach refuses by name); restack 416 (r311 (d)): no store ready ⇒ unknown, as the two hooks beside it
  return { conversationId: cid, sessionKey, name, groups, inherited };
}
const isArchivedKey = (key) => { if (!persistenceRouter || typeof persistenceRouter.isArchived !== 'function') return false; const a = persistenceRouter.isArchived(key); return a === null ? null : !!a; };   // null = UNKNOWN (B-225b R3: the list is held — its doors refuse by name)   // persistence's ONE reader (in memory; a bare-id entry answers too)
const resumeRowOf = (backend) => RL_PURE.harnessRowOf(require('../backend-caps.js').capsOf(backend));
// piece 7's seams: what a delivery's start reads of an ended conversation, through piece 4's own readers and road
const deliveryWakeSeams = { keyOf: endedKeyOf, factsOf: (key) => resumeFactsOf(key), unarchiveOwed: (key) => !!(persistenceRouter && typeof persistenceRouter.unarchiveOwed === 'function' && persistenceRouter.unarchiveOwed(key)),   // B-0248 (c) r1092: the refusal says an un-archive not saved yet   // which account the reopen will bill (主开发 12:46Z, the read): the conversation's STATED one (its saved settings — the
  // reopen's own cfg, state key else the bare id); null ⇒ the account it is held on (the kept record's)
  configAccountOf: (key) => { const st = (persistenceRouter && (persistenceRouter.readUserStatePending || persistenceRouter.readUserState) && (persistenceRouter.readUserStatePending || persistenceRouter.readUserState)()) || {};   /* B-0248 (c) r1053 (1): the PENDING list — the account the reopen bills, the moment a person changed it */ const m = st.sessionConfigs || {}; const id = String(key).slice(String(key).indexOf(':') + 1); const c = Object.hasOwn(m, key) ? m[key] : Object.hasOwn(m, id) ? m[id] : null; return c && typeof c.account === 'string' && c.account ? c.account : null; },
  // …and with none stated and none kept: the account whose index lists the conversation — the create's OWN lookup (14:26Z)
  heldAccountOf: (key) => { const k = String(key); try { return require('../routes/sessions').heldAccountOf(k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)); } catch { return null; } },
  // the wake entry's POSTING mark, durable before its hand-over can land (conversation-deliver markEndedPosting — 14:26Z)
  markPosting: (cid) => (deliver && typeof deliver.markEndedPosting === 'function' ? deliver.markEndedPosting(cid) : false),
  // place-8: the hand-over waits for THE RESUMED SESSION's inbox (the reopen answers when only its wrapper is spawned) — the ladder's own reach
  inboxOf: require('./delivery-wake.js').inboxOfOver({ deliver: () => deliver, activeSessions }),
  // place-8 follow-up: a start that answered after the line's bound records its own end (the record says what happened)
  noteLateWake: (cid, entry, answer) => (deliver && typeof deliver.noteLateWake === 'function' ? deliver.noteLateWake(cid, entry, answer) : false),
  // rule 3 (every wake is SEEN): the resumed session carries the line its window shows and the System panel's row repeats
  noteResumed: (sid, line) => { const s = activeSessions && activeSessions.get(sid); if (!s) return; s._resumedBy = line; if (typeof broadcastActiveSessions === 'function') broadcastActiveSessions(); },
  isArchived: isArchivedKey, rowOf: resumeRowOf, reopen: (item, o) => (typeof resumeRoad.reopen === 'function' ? reopenRoads(item, o) : Promise.resolve({ ok: false, why: 'this server cannot resume conversations yet (still booting) — try again in a moment' })) };   // the two roads' one seam
// THE MANAGER DESIGN'S PIECE 7 — DELIVERIES RESUME THEIR ADDRESSEE (the owner, narrowed 2026-11-17: a conversation a RESTART ended;
// one ended on purpose only for the jobs and schedules the person kept at the ending). A wake owed to an ENDED conversation is a rung of the ladder's retry park; the park hands it here, and this puts it on the
// ONE LINE above with its own start: the account's limit, the spend guard as a probe (under the delivery's own reason and the kept
// record's account, through the guard's own identity road), then the claim, the road's reopen and ONE hand-over (./delivery-wake.js).
const deliveryWake = require('./delivery-wake.js').create({ resumeLine, seams: deliveryWakeSeams, ...deliveryWakeDeps(), spendGuard: deliveryWakeDeps().spendGuard,   // the guard NAMED at its site (test-spend-paths §2c: a spread hands nothing it can read)
  isPoolScope: (id) => { try { const a = getAccounts() && getAccounts().get(id); return !!(a && a.type === 'pooled'); } catch { return false; } },
  log: (m) => console.log(m) });
if (deliver && typeof deliver.registerEndedWake === 'function') deliver.registerEndedWake((cid, entry) => deliveryWake.onEndedWake(cid, entry));
// lane conversation-facts (majordomo piece 2): conversations.list's ONE builder — hoisted (lane login-request-card, majordomo piece
// 3b): the proposal card's rows come from the SAME builder as the list
const listFacts = (() => { const CFX = require('./conversation-facts.js'); const src = () => listSources() || {}; return CFX.create({ activeSessions, groupsOf: automationGroupsStrict /* restack 416 (r311 (a)): a membership still being read THROWS — the row says so */, ...CFX.sourcesFrom({
      hosts,   // B-24e2: a paired machine is asked for its own binary's background signal
      getJobs: () => (getJobs ? getJobs() : null), userTodos, persistenceRouter, keeper: () => browserKeeper, browserStream: () => browserStream, activeSessions,
      autoResume: () => src().autoResume || null, stashView: () => src().stashView || null, deliver: () => deliver, sysinfo: { history: (ms) => { const si = src().sysinfo; return si && typeof si.history === 'function' ? si.history(ms) : null; } },
      stoppedSessions: () => { const f = src().stoppedSessions; return typeof f === 'function' ? f() : []; }, treeUsage: require('../browser-facts.js').treeUsage, buffersDir: BUFFERS_DIR }) }); })();
// lane login-request-card (majordomo piece 3b): THE PROPOSAL CARD — an agent proposes a person-only act (an end; piece 7's wake grant); ONE
// card per proposer, refreshed; the person's press through the person's doors (the Terminate; piece 7's setWakeGrant); the answer free
// at the proposer's next turn (src/server/end-proposals.js + the cookie-only door src/routes/end-proposals.js)
// THE ONE DOOR for a wake grant (lane lg-store-writes, 主开发 2026-11-20 08:17Z): a card's rows or an END card's ticks are ONE act — one
// landing; not landed ⇒ nothing changed, said by name (src/jobs.js changeWakeGrants through jobs-wiring setWakeGrants)
const wakeDoor = (changes, by) => (jobsWiring && typeof jobsWiring.setWakeGrants === 'function' ? jobsWiring.setWakeGrants(changes, by) : Promise.resolve({ ok: false, code: 'not_ready', error: 'the jobs engine is not wired', rows: [] }));
const endProposals = require('./end-proposals.js').create({ userTodos, deliver, listFacts, endConversation: (target, by) => require('./conversation-ops.js').endConversation(target, by),
  lineageOf: (ids) => { const tk = getTasks && getTasks(); if (!tk) throw new Error('the Task Group store is not ready'); return tk.grantGroupsOf(ids).inherited; },   // lane lg-group-parents (restack 415): the rows' ancestors — no store ⇒ unknown, never «no parents»
  liveKeys: () => [...activeSessions.values()].map((x) => { const cid = x && (x.backendSessionId || x.claudeSessionId); return cid ? `${x.backend || 'claude'}:${cid}` : null; }).filter(Boolean),
  setWakeGrants: wakeDoor, storeWakeTicks: async (ticks, by) => { const r = await wakeDoor(ticks, by); if (!r || !r.ok) { const bad = (r && r.rows || []).find((x) => !x.ok) || r || {}; throw Object.assign(new Error(bad.error || bad.why || (r && (r.error || r.why)) || 'the ticks were not stored'), { code: bad.code || (r && r.code) || 'failed' }); } },   // NOTHING IS ENDED over ticks that did not land (the END card fails the row)
  // the conversation a job WAKES (its owner — a cron run's schedule's), read from the jobs engine at the drawing AND at the press —
  // THE ONE READER (end-proposals jobOwnerReader: the backend from the live session that ADDRESSES it, the store judging by the id)
  jobOwnerOf: require('./end-proposals.js').jobOwnerReader({ getJobs: () => (jobsWiring && typeof jobsWiring.getJobs === 'function' ? jobsWiring.getJobs() : null), sessions: () => activeSessions.values(), addressableId: require('../claude-lock-capture.js').addressableId }),
  // a held wake proposal's rows read again after its wait (the press may have granted one) — piece 7's own helper
  wakeRowsNow: require('./end-proposals.js').wakeRowsReader({ getJobs: () => (jobsWiring && typeof jobsWiring.getJobs === 'function' ? jobsWiring.getJobs() : null) }),
  // THE FACT a conversation stopped: its kept record (boot-restore stoppedSessions) — a live set still filling is never evidence
  endedKeys: async () => { const f = (listSources() || {}).stoppedSessions; const list = typeof f === 'function' ? await f() : []; return (Array.isArray(list) ? list : []).filter((r) => r && r.backendSessionId && !r.forkPending).map((r) => `${r.backend || 'claude'}:${r.backendSessionId}`); },
  log: (m) => console.log('[end-proposals]', m) });
// the sweep rides THE session list's one notify point through conversation-ops (server.js broadcastActiveSessions calls its
// settleBirthGroups there) — no line of its own in the server file (主开发's cure, must 3: at the cap, code moves OUT of server.js)
require('./conversation-ops.js').provide({ onSessionList: () => { endProposals.sweep().catch(() => { }); } });
if (jobsWiring && typeof jobsWiring.setProposalDoor === 'function') jobsWiring.setProposalDoor((caller, a) => endProposals.proposeWakeGrant(caller, a));   // piece 7's job tool ends here
require('../routes/end-proposals.js').registerEndProposalRoutes(app, { proposals: endProposals });
const automation = require('./automation-engine.js').create({ dataDir: path.join(rootDir, 'data'), vault, userTodos, attention: vaultAttention, groupNameOf: (id) => { const tk = getTasks && getTasks(); return tk ? tk.lineageNameOf(id) : null; }, log: (m) => console.log('[automation]', m),
  // lane feedback-handled-verb: + feedback.handled / feedback.list over THE feedback store (the owner's PATCH's own call)
  // lane conversations-archive-verb: the archive verb's seams on conversation-ops' automationVerbs — the sidebar's own archived-list
  // write, the For-you store's open asks of a conversation (its own: by agent, not a notice) and their dismissal, the turn fact, and
  // an ENDED conversation's facts (its session key from the stores that still name it — the sidebar's names, the Task Groups — else claude:<id>)
  verbs: { ...require('./conversation-ops.js').automationVerbs({ activeSessions, groupsOf: automationGroupsStrict, lineageOf: (ids) => { const tk = getTasks && getTasks(); if (!tk) throw new Error('the Task Group store is not ready'); return tk.grantGroupsOf(ids).inherited; },
    archive: (key) => persistenceRouter.archiveSession(key),
    nameLanded: (key, name) => (persistenceRouter && typeof persistenceRouter.nameLanded === 'function' ? persistenceRouter.nameLanded(key, name) : Promise.resolve(true)),   // B-0248 (c) r1054 (7): the rename verb's «renamed» once the list is on disk
    asksOf: (key) => { if (userTodos.isHeldUnread?.()) throw Object.assign(new Error(userTodos.unreadRefusal('archiving a conversation (its open asks are unread)')), { code: 'todos-unread' }); try { return userTodos.forSession([key]).filter((i) => i && i.by === 'agent' && i.kind !== 'notice' && i.kind !== 'page'); } catch { return []; } },   // B-44f3: held ⇒ refused by name (never «no open asks»)
    resolveAsks: (ids, by) => userTodos.setStatusMany(ids, 'dismissed', by),
    turnOf: require('./turn-facts.js').turnOf,
    resumeLine, resumeFactsOf,
    isArchived: isArchivedKey,
    resumeRowOf,
    // the desktop's NAME is a person's words reaching an agent: ONE call of the belt, as a line (the peer-text census row of vibespace-api)
    rowDesktopOf: (key) => { let lay = null; try { lay = persistenceRouter && typeof persistenceRouter.readLayouts === 'function' ? persistenceRouter.readLayouts() : null; } catch (e) { if (!(e && e.code === 'store_unread')) throw e; }   /* B-225b: the desktops held ⇒ no desktop named */ const d = RL_PURE.rowDesktopOf(lay, key); return d ? { id: d.id, name: d.name == null ? null : require('../peer-text.js').toAgentText(d.name, { kind: 'line', max: 200 }) } : null; },
    deadOf: endedKeyOf,
    // lane conversation-facts (majordomo piece 2): conversations.list's ONE builder over the hub's in-memory facts
    listFacts, proposals: endProposals,
    // lane browsers-stop (majordomo piece 6): the keeper's running rows and its manager stop (the keeper is built later — read at call time)
    browsers: { rows: () => (browserKeeper && typeof browserKeeper.stopRows === 'function' ? browserKeeper.stopRows() : null), stop: (id) => browserKeeper.managerStop(id) } }),
    // the manager design's piece 7: jobs.wakeGrant — a key holding it sets a job's grant to resume an on-purpose-ended conversation
    ...require('./delivery-wake.js').automationVerbs({ jobs: () => (deliveryWakeDeps().jobs || (() => null))(), ownerFactsOf: (cid) => { const k = endedKeyOf(cid); return k ? { groups: Array.isArray(k.groups) ? k.groups : [], inherited: k.inherited, ...(k.inherited === null ? { groupsUnreadable: true } : {}) } : null; }, keyNameOf: (id) => { const L = automation.list(); const arr = Array.isArray(L) ? L : (L && L.keys) || []; const k = arr.find((x) => x && x.id === id); return (k && k.name) || null; } }), ...require('./feedback-store.js').automationVerbs({ store: feedback }) },
  openFacts: { defaults: (backend) => require('./conversation-ops.js').openDefaults(backend, { accounts: getAccounts(), ...automationSettings }),
    // lane automation-open-permission-resolve (q-049 M2): the CLI's own permission mode for the judged folder (its project layer follows it)
    permissionDefault: (cwd, backend) => require('./permission-rules.js').resolveDefaultMode({ backend, cwd }),
    // 2.369.359 (userW): the folder judge's real paths come from the SafeFs worker, bounded — the loop never waits on a storage mount
    realpathAsync: async (p) => { const sf = app.locals && app.locals.safeFs; if (!sf) throw Object.assign(new Error('the SafeFs pool is not up'), { code: 'safefs_down' }); const r = await sf.call('realpath', { path: p }, { timeoutMs: 8000 }); return r && typeof r.path === 'string' ? r.path : null; } } });
require('./conversation-ops.js').provide({ keyNameOf: (id) => automation.keyNameOf(id) }); // lane end-obeys-verdict: the end record names the key that ended it
require('../routes/automation.js').registerAutomationRoutes(app, { engine: automation, who: (req) => require('../auth.js').Auth.signInHandle(req),
  limitChoices: () => require('./conversation-ops.js').limitChoices({ accounts: getAccounts() }),   // lane automation-open-limits: the limit pickers
  permissionNow: (cwd) => require('./permission-rules.js').resolveDefaultMode({ backend: 'claude', cwd: cwd || process.cwd() }),   // q-049 M2: the picker's 「CLI 自己的设置（现在是 X）」 — the key's first folder, else the hub's own
  callerOf: sessionCallerOf, subjects: conversationSubjects,
  // lane vault-key-row-compact: an ended grant's words — the names the sidebar kept (user-state customNames, keyed <backend>:<id>)
  conversationNames: () => { let st = {}; try { st = (persistenceRouter && persistenceRouter.readUserState && persistenceRouter.readUserState()) || {}; } catch (e) { if (!(e && e.code === 'store_unread')) throw e; } const out = {}; for (const [k, v] of Object.entries(st.customNames || {})) if (k.includes(':') && v) out[k.slice(k.indexOf(':') + 1)] = String(v); return out; } });
setTimeout(() => { try { const n = automation.reconcile(); if (n) console.log(`[automation] ${n} first-use card(s) from before the restart resolved expired`); } catch { } }, 3000).unref?.();
// r2 (verify r1): THE GATE the credential doors registered before this line ask (the account key, the mount config, the export)
app.locals.vaultGate = require('../routes/vault.js').vaultGate({ vault, contents: vaultContents, who: (req) => require('../auth.js').Auth.signInHandle(req) });
// THE DECISION ENGINE (lane decision-core): the ONE decisions-API caller — the plugin row attaches its switches, the
// registry row `llm` gives the key, its Test runner is the engine's own one-question judgment
const decisionEngine = require('./decision-engine.js').create({ dataDir: path.join(rootDir, 'data'), integrations, serverNotice, settingsHeld: () => (persistenceRouter && typeof persistenceRouter.settingsHeld === 'function' ? persistenceRouter.settingsHeld() : null) });   // B-225b: the settings held ⇒ the judge refuses NOT NOW
try { if (integrations && typeof integrations.registerTest === 'function') integrations.registerTest(decisionEngine.ROW_ID, decisionEngine.testRunner); } catch (e) { console.warn('[decision] Test runner not registered:', e.message); }
// lane decision-inbox-rank: THE BOARD the For-you judge's facts are read from, once a pass — vibespace-status's record +
// history of a conversation and its newest vibespace-task progress note (the stores' own readers; nothing is kept here)
const inboxBoard = () => {
  const st = getSessionStatus ? getSessionStatus() : null, tasks = getTasks ? getTasks() : null;
  if (st && typeof st.isHeldUnread === 'function' && st.isHeldUnread()) return null;   // r3193: the statuses are UNREAD — the pass runs with no board (unknown), never null / [] as facts
  const progressAt = new Map();
  for (const g of tasks && typeof tasks.list === 'function' ? tasks.list() : []) for (const p of g.progress || []) if (p && p.session && !(progressAt.get(p.session) >= p.at)) progressAt.set(p.session, p.at);
  return (key) => ({ status: st ? st.get(key) : null, history: st ? st.history(key) : [], progressAt: progressAt.get(key) || 0 });
};
if (userTodos) decisionEngine.attachInbox(userTodos, { board: inboxBoard }); // lane inbox-decision-group: use ④ — the For-you tray's sections (a 60 s tick, a pass every 5 min, off every wake path)
const plugins = new PluginManager({
  dataDir: path.join(rootDir, 'data'), integrations: () => integrations,
  // lane plugin-settings-p0: THE settings store — every plugin configuration row is read / written here (one truth)
  settings: { read: () => (persistenceRouter && persistenceRouter.readSettings ? persistenceRouter.readSettings() : {}), patch: (p) => persistenceRouter.patchSettings(p) },
  forYou: () => userTodos,   // lane relay-token-per-instance: frp files ONE For-you item per public name the relay refused (it declares 'reminders')
  voiceBind: (v) => { voicePlugin = v; }, droplineConnected: () => !!(dropline && dropline.connected()), droplineLocked: () => !!(dropline && dropline.locked && dropline.locked()), droplineSignin: () => { try { const a = dropline && dropline.account ? dropline.account() : null; return a && (a.state === 'unread' || a.state === 'damaged') ? a.state : null; } catch { return null; } }, decisionEngine,
  broadcast: (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
userTodos?.setPluginGate?.((id) => !!(plugins.defs()[id] || {}).provides?.includes('reminders')); // lane foryou-plugin-notices: a plugin files For-you reminders only when it DECLARES 'reminders'
// port-forward can publish a forward publicly via the frp plugin (B-0b60)
portForwards.plugins = plugins;
require('./ports-relay-routes.js').register({ app, getPortForwards: () => portForwards });   // B-73c4: «Try again» (a person's press) on a row whose public address is still up; the unmarked relay files
hosts.nameLookup = (name) => plugins.tunnelLookup(name); // lane tailscale-plugin-pod-dns: tailnet names for ssh hosts, never the container's resolver
// lane tailnet-names: browsers reach tailnet hosts BY NAME through the hub's tailnet door (the PAC, the kernel door, the in-page
// browser's agents, LAW 2's words) — the plugin asked through tunnelReach (+ tunnelReachFresh: a stale table's one bounded read)
// only; the container's resolver never touched. r4: follow() — EVERY input of the road reaches the door through ONE
// subscription (plugins.watch: the plugin's every broadcast + its rows written through the settings store)
require('./tailnet-door.js').follow(plugins, { dataDir: path.join(rootDir, 'data'), lang: () => require('./owner-facts.js').tray().lang });
// Dropline voice input (q-029 P0): THE vendor module (src/server/dropline-client.js) + the hub proxy /api/voice/*;
// the `dropline` row's Test = one GET /v1/me through the same module
// P1 (lane voice-p1-oauth-teach): the OAuth tier (a `public` consent flow; the pair in data/dropline-oauth.json, 0600;
// its landing door on /api/channels/oauth/cb/dropline) + the teach engine (proposals / per-project tier / context preview)
const droplineOAuthMod = require('./dropline-oauth.js');
const droplineTokens = require('./sealed-json.js').sealedJson(path.join(rootDir, 'data', 'dropline-oauth.json'), { dataDir: path.join(rootDir, 'data'),
  // r3334 unit 2 (lane bl-chat-b): the voice sign-in under the store-read law — a read that failed HELD (a Connect, a Disconnect and a
  // refresh refused by name, nothing written over), torn bytes kept aside once (0600) and read as absent with the damage said
  hold: { code: 'voice_signin_unread', log: (l) => console.warn(`[voice] ${l}`), words: (h) => `the voice sign-in (dropline-oauth.json in VibeSpace's data folder) could not be read (${(h && h.code) || 'unreadable'}) — nothing was changed and no sign-in is lost; VibeSpace reads it again by itself every few minutes` } });   // lane vault-e2e-password-fix-r2: SEALED through the vault (the hourly refresh writes sealed; LOCKED ⇒ the voice card says 「保险库已锁定」)
let droplineTeach = null;
var dropline = require('./dropline-client.js').create({ integrations: () => integrations, pluginOn: () => !!voicePlugin.peek().enabled, tokens: droplineTokens, teachCap: (k) => !!droplineTeach && droplineTeach.capOk(k) });
try { integrations?.registerTest('dropline', dropline.testRunner); } catch (e) { console.warn('[voice] the dropline Test runner was not registered:', e.message); }
const droplineOAuth = droplineOAuthMod.create({ client: dropline, flows: require('../oauth-loopback.js').createOAuthLoopback({}), integrations: () => integrations, instanceUrl: () => { try { return instanceUrl?.url?.() || ''; } catch { return ''; } }, tokens: droplineTokens,
  // lane dropline-connect-door: WHO can give this instance an https address — the status answer's connectWhy
  instanceSource: () => instanceUrl?.effective?.().source || null, clusterDeploy: () => !!process.env.VIBESPACE_INSTANCE_NAME || !!require('./cluster-presets.js').sharedPresets().dir });
require('./oauth-doors.js').register('dropline', { landing: droplineOAuth.landing, page: droplineOAuth.page });
droplineTeach = require('./voice-teach-engine.js').create({ client: dropline, plugin: { peek: () => voicePlugin.peek(), update: (fn) => voicePlugin.update(fn), settings: () => voicePlugin.settings(), writeSettings: (p) => voicePlugin.writeSettings(p) }, userTodos, ledgerFile: path.join(rootDir, 'data', 'voice-suggestions.json'), tickMs: 10 * 60e3 }); // lane voice-teach-skips: the tick sends an automatic folder's waiting words
app.use(require('../routes/voice.js').create({ client: dropline, prefs: () => ({ ...voicePlugin.peek(), config: voicePlugin.settings() }), oauth: droplineOAuth, teach: droplineTeach }));
setTimeout(() => { try { plugins.bootReplay(); } catch (e) { console.warn('[plugins] boot replay:', e.message); } }, 5000);
// CS data-plane deps for hosts.device(id) (2.146.0) — wired SYNCHRONOUSLY.
// (Was a setTimeout(1000); a device dialing in during that window ran mount
// heal / hosts.device() before deps existed → "agentd deps not wired" and a
// failed heal — real owner log. The referenced functions are hoisted
// declarations and `hosts` already exists here, so no defer is needed.)
try {
  hosts.agentdDeps = {
    ensureAgentdOnHost, agentdHostToken, deviceForDial,
    hubIdentity: () => hostTokens.identity(), // lane lg-remote-hardening (D3 half b): this hub's own key on the ssh road
    bundlePath: path.join(rootDir, 'data', 'bin', 'vibespace-agentd.js'),
    version: require(require('path').join(rootDir, 'package.json')).version,
  };
  hosts.dataPlaneOn = () => true; // GRADUATED (agentd.dataPlane flag removed) — ssh per-op remains the per-path failure fallback
  // lane lg-remote-hardening (B-7f0b — design q-042 D8b): THE AGENT DOOR — every reverse tunnel of a remote conversation ends
  // at this listener (agent routes only), never the whole hub (src/server/agent-listener.js)
  require('./push-mount-door.js').setApp(app); // B-7f0b (r1220 (1)): a push mount's own door hands its /dav requests to this one app
  require('./agent-listener.js').start({ app, stateFile: path.join(rootDir, 'data', 'agent-door.json'), avoid: PORT }); // its port is kept across restarts (a remote session's -R is fixed in its argv)
} catch (e) { console.warn('[device] data-plane deps wiring failed:', e.message); }
// lane lg-remote-hardening (D3 half b), law 3: a NEW hub key is the person's act only (a lost one is never re-minted in silence) —
// every machine that pinned the old key then refuses this hub until it pairs again (the records forget that they pinned it)
// lane lg-remote-hardening (主开发's verdict of 2026-11-18, must B): A PIN ALWAYS HAS A DOOR ON ITS OWN ROAD. An ssh machine that
// pins an older key of this hub is told, by the person, to pin this hub's key again: its state/hub.pub is removed over ssh (the
// ssh key is full trust already), THEN its link is rebuilt — the next hello pins the current key. A dialed device's door is its
// pairing command, run on the device.
// unit 5's cure 2 (one machine, two agents): a machine upgraded to dial-out runs a second agent under its own root (dialRoot)
// that pins the hub too — the door clears the pin under EVERY root of the machine, so it acts on the agent that refused,
// whichever road it answered on. A dialRoot that is not the hub's OWN shape — `$HOME/.vibespace/device@<host>`, the one the
// upgrade has written since dial-out began — is never put into a shell line (an imported `$HOME/.vibespace/..` would name the
// home folder itself), and the answer says it was skipped.
const DIAL_ROOT_RE = /^\$HOME\/\.vibespace\/device@[A-Za-z0-9][A-Za-z0-9.-]*$/;   // = src/hosts.js dialRootOk (B-2ca0's law, met at the move onto 6ce6b8124): the folder the graduation writes
const skippedRootOf = (h) => (h && h.dialRoot && !DIAL_ROOT_RE.test(String(h.dialRoot)) ? String(h.dialRoot).slice(0, 120) : null);
const hubPinRm = (h) => 'rm -f ' + ['$HOME/.vibespace/agentd', ...(h && DIAL_ROOT_RE.test(String(h.dialRoot || '')) ? [String(h.dialRoot)] : [])].map((r) => `"${r}/state/hub.pub"`).join(' ');
// B-f276 family unit B (主开发 r3032, lane bl-phone-ui): THE ONE NOTICE's hub half (src/server/held-lists.js) — every held list of the family
// (the page names each by its plain name), ONE broadcast when the set changes, ONE «Read again now» (the owner's press). The older holds
// join by their own doors: For you (user-todos), the Task Groups (2b: the paired machines are on the helper now — listed by it, and the press reads them)
const heldLists = require('./held-lists.js').create({
  broadcast: (m) => bcastAll(m), log: (m) => console.log(m),
  older: [
    { key: 'user-todos', facts: () => { const u = userTodos && typeof userTodos.unreadState === 'function' ? userTodos.unreadState() : null; return u ? { since: u.at || null } : null; },
      readAgain: () => userTodos.readAgain(), onLift: (fn) => { if (!userTodos || typeof userTodos.whenRead !== 'function') return false; userTodos.whenRead(fn, 'the held lists notice'); return true; } },
    { key: 'task-groups', facts: () => { const tg = typeof getTasks === 'function' ? getTasks() : null; const u = tg && typeof tg.unreadState === 'function' ? tg.unreadState() : null; return u ? { since: u.at || null } : null; },
      readAgain: () => { const tg = typeof getTasks === 'function' ? getTasks() : null; return tg && typeof tg.readAgain === 'function' ? tg.readAgain() : Promise.resolve(false); },
      onLift: (fn) => { const tg = typeof getTasks === 'function' ? getTasks() : null; if (!tg || typeof tg.onLift !== 'function') return false; tg.onLift(fn); return true; } },   // r3212: the manager's own lift signal (armed once it exists)
    decisionEngine.heldRow,   // B-f276 family (r4121): the paid judge's journal — its own hold (the counter and the memo are the helper's)
    ...(otelTokenRow ? [otelTokenRow] : []),   // B-f276 family unit 2: the OTel sign-in value (usage-history/otel-token)
  ],
});
app.delete('/api/hosts/:id/hub-pin', async (req, res) => {
  if (/^Bearer\s+\S/i.test(String((req.headers && req.headers.authorization) || '')) || typeof (req.body && req.body.token) === 'string') return res.status(403).json({ error: 'the user lets a machine pin this hub again — an agent token may not', code: 'human_only' });
  let h = null; try { h = hosts.get(req.params.id); } catch (e) { if (e && e.code === 'hosts-unread') return res.status(503).json({ error: e.message, code: 'hosts-unread' }); h = null; }
  if (!h) return res.status(404).json({ error: 'no such machine', code: 'not_found' });
  if (h.transport === 'dial') return res.status(400).json({ error: 'a dialed device pins this hub again only by its pairing command, run on the device (Remote → the machine → Pairing command…)', code: 'hub-pin-dial' });
  try { await hosts._ssh(h, hubPinRm(h), { timeoutMs: 15000, fresh: true }); }
  catch (e) { return res.status(502).json({ error: `the machine's hub pin could not be removed over ssh — ${String((e && e.message) || e).slice(0, 200)}`, code: (e && e.code) || 'ssh-failed' }); }
  hosts.noteDeviceKey(h.id, 'hub-pin-cleared');
  try { hosts.invalidateDevice(h.id); } catch { }
  try { bcastAll({ type: 'hosts-updated' }); } catch { }
  const skipped = skippedRootOf(h);
  if (skipped) console.warn(`[hosts] ${h.name || h.id}: its dial-out root is not this hub's shape — its hub pin was NOT cleared there`);
  res.json({ success: true, ...(skipped ? { skipped } : {}) }); // a root of another shape is said, never claimed cleared
});
app.post('/api/hosts/hub-identity/renew', (req, res) => {
  if (/^Bearer\s+\S/i.test(String((req.headers && req.headers.authorization) || '')) || typeof (req.body && req.body.token) === 'string') return res.status(403).json({ error: 'the user makes a new hub key — an agent token may not', code: 'human_only' });
  // the meeting with bl-jobs' held store: a new hub key while the machines are UNREAD would clear no pin (the list is empty) and
  // could not be undone — refused by name before anything is made
  if (hosts.held()) return res.status(503).json({ error: `making a new hub key: ${hosts.unreadWords()}`, code: 'hosts-unread' });
  try {
    hostTokens.renewIdentity();
    const sshCleared = [];
    for (const row of hosts.list()) {
      const h = hosts.get(row.id);
      const hubSide = h.deviceKeyRefused && /^hub[-_]/.test(h.deviceKeyRefused.code || '');
      if (h.hubPinned || hubSide) { delete h.hubPinned; if (hubSide) delete h.deviceKeyRefused; try { hosts.onHostKeyPinned?.(h, 'device'); } catch { } }
      // an ssh machine: the person's renew clears its pin over ssh (the ssh key is full trust already) — the next hello pins the new key;
      // a DIALED device pins again only by its pairing command (run on the device: the person's act there)
      if (h.transport !== 'dial') { const again = () => { try { hosts.invalidateDevice(h.id); } catch { } }; try { hosts._ssh(h, hubPinRm(h), { timeoutMs: 15000, fresh: true }).then(again, again); sshCleared.push(h.name || h.id); } catch { again(); } } else { try { hosts.invalidateDevice(h.id); } catch { } }
    }
    hosts._save(); try { bcastAll({ type: 'hosts-updated' }); } catch { }
    res.json({ success: true, sshCleared });
  }
  catch (e) { res.status(e && e.code === 'vault_locked' ? 423 : 500).json({ error: (e && e.message) || 'failed', code: (e && e.code) || null }); }
});
// Transport B pairing: mint a device id + dial token + the one-liner the user
// runs on the NAT'd device (no ssh needed). Cookie-authed (user action).
// The pairing IS the machine registration — the dial host record carries the
// token hash (B-f3e8); re-pairing an existing name rotates its token in place.
// B-6640: graduate an SSH machine to dial-out — install the device daemon as
// a persistent service on the host (over ssh, ONE time) so it dials back over
// ws; from then on every data-plane op prefers the dial link (our own
// handshake/heartbeat/reconnect — none of ssh's banner-hang/ControlMaster/
// per-op-child taxes). transport STAYS ssh = the bootstrap + rescue channel.
// NAT rules (user directive): base = explicit serverUrl > agentd.publicUrl >
// relay (viaRelay); the host-side REACHABILITY PRECHECK runs before anything
// is installed — unreachable ⇒ abort, stay pure-ssh. {remove:true} rolls the
// whole thing back (service + root on the host, dial fields on the record).
/** SSH → WS graduation, install half (2.311.0 extracted so it can run
 *  AUTOMATICALLY, not only from a button — the mechanism shipped in 2.248.0
 *  but every machine stayed on ssh because someone had to click it).
 *  Installs the daemon as a persistent service on the machine and has it DIAL
 *  BACK over ws. Throws with a user-readable reason; ssh always remains as the
 *  bootstrap + rescue channel. */
async function graduateHostToDial(h, { serverUrl, viaRelay, by = 'system:graduate', from = '' } = {}) {
  hosts.notDialOut(h.id); // lane lg-remote-hardening (unit 3's cure): a machine that already dials out is refused by name before anything runs — a re-press would mint over its working pairing
  const sshRun = (script, timeout = 30000) => new Promise((resolve) => {
    const { execFile } = require('child_process');
    execFile('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', script],
      { env: hosts.sshEnv(), timeout, maxBuffer: 4 * 1024 * 1024 }, (err, so, se) => resolve({ ok: !err, out: String(so || ''), err: String(se || err?.message || '') }));
  });
    // ── install ──
    let base = String(serverUrl || '').replace(/\/$/, '') || String(instanceUrl?.url() || '').replace(/\/$/, '') || null; // ONE resolver (2.367.0): frp mapping layered over agentd.publicUrl.() — a free identifier since the split (2.343.2 audit)
    if (!base && viaRelay) {
      // ONE publisher of the 'vibespace-instance' proxy (instance-url.js):
      // two callers writing the same relay proxy name fought over it, and
      // this one published the whole app with nothing recording it.
      base = String(await instanceUrl.ensurePublished()).replace(/\/$/, '');
    }
    if (!base) throw new Error('no reachable base URL: set agentd.publicUrl, pass serverUrl, or use viaRelay (frp plugin)');
    // reachability PRECHECK from the HOST (any HTTP status = reachable; 000 = not)
    const chk = await sshRun(`curl -s -o /dev/null -w '%{http_code}' --max-time 10 ${JSON.stringify(base + '/api/home')} 2>/dev/null || echo 000`, 20000);
    const code = (chk.out.trim().match(/\d{3}$/) || ['000'])[0];
    if (code === '000') throw new Error(`the machine cannot reach ${base} — graduation aborted (staying on ssh). If this instance is behind NAT, use viaRelay.`);
    // mint onto the EXISTING ssh record (deviceId first so setDialToken finds it)
    // dialRoot must mirror the INSTALLER's derivation byte-for-byte (it does
    // sed hostname-only + tr -cd 'A-Za-z0-9.-') or the removal path tears
    // down the wrong directory.
    const root = require('../hosts.js').dialRootOf(base);   // B-2ca0 follow-up (its delta read): the installer's own derivation (an IPv6 base named another folder)
    // lane lg-remote-hardening (unit 3's cure + its verdict): ANY throw between the upgrade and the installer's answer (a refused
    // mint — a locked vault —, a missing installer, the allow list) rolls the upgrade back, so the ssh road's pin comes back. The
    // attempt is this press's own: a machine already dialing out was refused at the start
    const attempt = hosts.beginGraduation(h.id, { dialRoot: root });
    const rollBack = () => { attempt.rollBack(); bcastAll({ type: 'hosts-updated' }); };
    let pair, inst;
    try {
      const gradDevice = hosts.get(h.id).deviceId;
      const dialUrl = `${base.replace(/^http/, 'ws')}/api/device-dial?device=${gradDevice}`;
      pair = agentdMintDialPair(gradDevice, { host: require('../dial-facts.js').hostOf(dialUrl), base, by, from });
      if (typeof hosts.persisted === 'function' && !(await hosts.persisted())) throw Object.assign(new Error('the pairing is minted, but hosts.json is not on disk yet — the hub keeps trying; try the graduation again once it lands'), { code: 'not_durable' });   // B-48a4 cure: its dial token's hash on disk before the installer ships it
      // ship + run the installer over ssh STDIN — the installer AND its arguments (verify-r3 B-grad): the tokens used to
      // ride `ssh … -- 'bash -s -- … --dial-token vsdt_… --host-token vsht_…'`, i.e. the argv of the LOCAL ssh (readable
      // by every user of this machine through /proc/<pid>/cmdline for the whole install, ≤ 300 s) and the remote shell's
      // command line (the same on the machine). Now the remote command is the bare `bash -s` and the arguments are a
      // `set -- …` line bash reads from stdin before the installer's own text — the installer parses "$@" unchanged.
      const installer = fs.readFileSync(path.join(rootDir, 'scripts', 'vibespace-agentd-install.sh'), 'utf-8');
      // lane device-allow-flags: the graduated machine's allow list = this instance kind's default (a cluster's: no socks / lan / input)
      const allowDefault = require('../device-policy.js').defaultAllow({ cluster: !!process.env.VIBESPACE_INSTANCE_NAME });
      const args = `--bundle-url ${JSON.stringify(base + '/vibespace-device.js')} --dial ${JSON.stringify(dialUrl)} --dial-token ${pair.dialToken} --host-token ${pair.hostToken} --allow ${require('../device-policy.js').allowArg(allowDefault)}`;
      const inv = require('../dial-facts.js').sshInstallInvocation({ args, installer });
      inst = await new Promise((resolve) => {
        const { execFile } = require('child_process');
        const child = execFile('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', inv.remote],
          { env: hosts.sshEnv(), timeout: 300000, maxBuffer: 8 * 1024 * 1024 }, (err, so, se) => resolve({ ok: !err, out: String(so || '').slice(-3000), err: String(se || err?.message || '').slice(-1500) }));
        if (child.stdin) { child.stdin.on('error', () => { }); child.stdin.end(inv.stdin); }   // ckpt61 cure 2: no stdin after a start that failed at once (execFile answers it)
      });
    } catch (e) { rollBack(); throw e; }
    if (!inst.ok) { rollBack(); throw new Error('installer failed on the host — rolled back: ' + (inst.err || inst.out).slice(-600)); }
    attempt.finish(); // the attempt ends here: no later rollback of it
    // wait for the dial-in (installer verifies the daemon started; the dial
    // itself can lag a few seconds)
    let dialed = false;
    for (let i = 0; i < 15; i++) { if (hosts.dialOnline?.(pair.deviceId)) { dialed = true; break; } await new Promise(r => setTimeout(r, 2000)); }
    bcastAll({ type: 'hosts-updated' });
  return { success: true, dialedIn: dialed, base, deviceId: pair.deviceId, note: dialed ? 'dial link live — data-plane ops now prefer it (ssh stays as rescue)' : 'installed — daemon not dialed in yet; check again shortly or see the machine row' };
}

app.post('/api/hosts/:id/graduate-dial', async (req, res) => {
  try {
    const h = hosts.get(req.params.id);
    if (h.transport === 'dial') return res.status(400).json({ error: 'already a dial device' });
    const sshRun = (script, timeout = 30000, input = null) => new Promise((resolve) => {
      const { execFile } = require('child_process');
      const child = execFile('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', script],
        { env: hosts.sshEnv(), timeout, maxBuffer: 4 * 1024 * 1024 }, (err, so, se) => resolve({ ok: !err, out: String(so || ''), err: String(se || err?.message || '') }));
      if (input != null && child.stdin) { child.stdin.on('error', () => { }); child.stdin.end(input); }   // B-8475: a script on stdin (`bash -s`); ckpt61 cure 2: none after a start that failed at once (execFile answers it)
      });
    if (req.body?.remove) {
      if (hosts.upgradeRunning(h.id)) return res.status(409).json({ error: 'an upgrade of this machine is running — wait for it, then remove dial-out', code: 'upgrade-running' }); // 主开发 at the restack: never kill the agent or remove its root while its installer writes there
      // best-effort remote teardown, ALWAYS clear the record (dead host must
      // not hold the graduation hostage — the machine-mounts unmount lesson)
      const root = h.dialRoot || '';
      if (root && require('../hosts.js').dialRootOk(root)) {   // B-2ca0 follow-up (its reads): EXACTLY the folder the graduation writes — never `rm -rf "$HOME//"` / `"$HOME/.."`
        const key = require('path').basename(root).replace(/[^A-Za-z0-9.-]/g, '-').replace(/-+$/, '');
        // B-8475: a container's boot-hook block of this key leaves FIRST, in the same one call — the installer's OWN functions
        // (a whole begin…end pair only, written through the hook's real file) on `bash -s` stdin, whatever the login shell is;
        // an installer that cannot be read here costs only the drop (the record is ALWAYS cleared)
        let hookDrop = '';
        try {
          const inst = await fs.promises.readFile(path.join(rootDir, 'scripts', 'vibespace-agentd-install.sh'), 'utf-8'); // off the loop (the checkout may sit on a network mount)
          const h0 = inst.indexOf("# >>> B-8475 THE IMAGE'S USER BOOT HOOK"), h1 = inst.indexOf('# <<< B-8475 <<<');
          if (key && h0 >= 0 && h1 > h0) hookDrop = `${inst.slice(h0, h1)}\ndrop_hook_block ${key} || true\n`;
        } catch { }
        const teardown = (`systemctl --user disable --now "vibespace-device-${key}.service" 2>/dev/null; ` +
          `launchctl bootout "gui/$(id -u)/cc.vibespace.device.${key}" 2>/dev/null; ` +
          `pkill -f "${root}/" 2>/dev/null; sleep 1; rm -rf "${root}"; echo VS_REMOVED`);
        // one call; a host whose non-login PATH has no bash (the run never says VS_REMOVED) gets the teardown alone, as before
        const ran = hookDrop ? await sshRun('bash -s', 30000, hookDrop + teardown + '\n') : null;
        if (!ran || !String(ran.out || '').includes('VS_REMOVED')) await sshRun(teardown, 30000);
      }
      const devId = h.deviceId;
      hosts.ungraduateDial(h.id);
      try { if (devId && agentdDials.has(devId)) { agentdDials.get(devId)?.destroy?.(); agentdDials.delete(devId); } } catch { }
      bcastAll({ type: 'hosts-updated' });
      // 主开发 04:33Z (2a): «removed» only once hosts.json carries it — the record's save is QUEUED (the store writer's, B-48a4): the reply
      // waits for it, as the graduation road does, and says not-on-disk when it did not land (a restart before then brings the pairing back)
      if (typeof hosts.persisted === 'function' && !(await hosts.persisted())) return res.status(503).json({ error: 'the dial pairing is removed here, but hosts.json is not on disk yet — the hub keeps trying; a restart before it lands brings the pairing back: remove it again if it comes back', code: 'not_durable' });
      return res.json({ success: true, removed: true, ...(root && !DIAL_ROOT_RE.test(root) ? { teardown: 'skipped', skipped: root.slice(0, 120) } : {}) }); // a root of another shape: the record is cleared, its agent was NOT torn down — said
    }
    // lane-pairing ①: the chosen address (the pairing dialog's list) — judged by the ONE verdict before anything runs
    let serverUrl = req.body?.base ?? req.body?.serverUrl;
    if (serverUrl && !req.body?.viaRelay) { const v = require('../dial-facts.js').dialBaseVerdict(serverUrl); if (!v.ok) return res.status(400).json({ error: `not an address the machine can dial (${v.code})`, code: 'bad_base', why: v.code }); serverUrl = v.base; }
    const out = await graduateHostToDial(h, { serverUrl, viaRelay: req.body?.viaRelay, by: require('../device-audit.js').byOfReq(req), from: (req.socket && req.socket.remoteAddress) || '' });
    res.json(out);
  } catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // a held machines list keeps its 503 and its name (the page words it); every other refusal 400 with its code as well as its words (lane lg-remote-hardening)
});

// ── PAIRING (lane-pairing ①②③, B-7007; the owner's MacBook 2026-09-27) ──
// ① the address list: every address the SERVER can name for itself — the browser's origin, the relay, this
//    host's Tailscale / LAN / public interface IPs, its hostname, IPv6 (PURE src/dial-facts.js). Read-only.
app.get('/api/device/dial-addresses', (req, res) => {
  try {
    const DF = require('../dial-facts.js');
    const deviceId = DF.deviceIdOf(req.query.device); // THE one name rule
    const origin = req.headers.origin || require('../write-origin.js').ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) }); // the request's own origin: THE one rule (lane owner-write-origin)
    let relay = null, relayPublishable = false;
    try { const st = instanceUrl?.status?.() || {}; relay = st.effectiveUrl || null; relayPublishable = !!(st.frpConfigured && !st.published && !relay); } catch { }
    // verify-r4 F3: the address this server's SOCKET is bound to (not the addresses the machine has) decides which
    // interface rows a device can reach — HOST=127.0.0.1 ("local-only", README) used to list four addresses that all
    // refused the connection, the tailnet one checked
    const bind = (() => { try { const a = server && typeof server.address === 'function' ? server.address() : null; return a && typeof a === 'object' && a.address ? a.address : (HOST || null); } catch { return HOST || null; } })();
    const candidates = DF.dialAddressCandidates({ origin, relay, hostname: os.hostname(), interfaces: os.networkInterfaces(), port: PORT, deviceId: deviceId || 'DEVICE', bind });
    res.json({ candidates, deviceId, relayPublishable, listen: { address: bind, loopbackOnly: DF.bindAdmits(bind).loopbackOnly } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// ② THE ONLY MINTER, called by two buttons ("Create pairing", "Generate a new command") — opening a dialog never
//    mints (test-architecture's mint census). The chosen `base` builds BOTH urls of the command; a custom one is
//    re-judged here (a client is not trusted) BEFORE anything is minted.
app.post(['/api/device/dial-pair', '/api/agentd/dial-pair'], async (req, res) => {
  try {
    const DF = require('../dial-facts.js');
    const deviceId = DF.deviceIdOf(req.body?.deviceId || ('dev-' + require('crypto').randomBytes(4).toString('hex'))); // THE one name rule (the dialog judges a collision with it — verify-r4 F6)
    if (!deviceId) return res.status(400).json({ error: 'the device name has no letters, digits, - or _ left', code: 'bad_name' });
    // verify-r5 A1: THE NAME VERDICT, here, before anything is published, minted or cut — the dialog's note judged its
    // own copy of the list (two windows / a device that came online raced it)
    // the B-f276 remainder's cure (主开发 23:20Z): while hosts.json is HELD the list is empty because it is UNREAD — the verdict would
    // tell the person a paired device «is no longer paired (it was removed)»: refused by name, nothing published, minted or cut
    const heldNow = () => (hosts.held && hosts.held() ? res.status(503).json({ error: `pairing a device: ${hosts.unreadWords()}`, code: 'hosts-unread', deviceId }) : null);
    if (heldNow()) return;
    const nv = DF.pairRequestVerdict({ deviceId, expect: req.body?.expect === 'new' ? 'new' : req.body?.expect === 'existing' ? 'existing' : null, hosts: hosts.list() });
    if (!nv.ok) return res.status(409).json({ error: nv.error, code: nv.code, deviceId, ...(nv.code === 'already_paired' ? { online: !!nv.online } : {}), ...(nv.twin ? { twin: nv.twin } : {}) }); // verify-r5 A3: + name_case_taken {twin}
    // Double-NAT pairing (B-5c1e): when THIS instance is itself behind NAT, viaRelay publishes the instance's OWN
    // http port through the frp relay and hands the device a public subdomain to dial — BEFORE the mint (a failed
    // publish mints nothing).
    let base = null;
    let relayUrl = null;
    if (req.body?.viaRelay) {
      try {
        relayUrl = String(await instanceUrl.ensurePublished()).replace(/\/$/, '');
        base = relayUrl;
      } catch (e) {
        if (e && e.code === 'instance_url_unread') return res.status(503).json({ error: e.message, code: e.code });   // r3174: the publish setting is held — refused by name, nothing minted
        return res.status(400).json({ error: 'could not publish this instance to the relay: ' + e.message + ' — is the frp plugin installed + started (⚙ → Plugins → Public URLs)?', code: 'relay_unpublished' }); }
    } else {
      const v = DF.dialBaseVerdict(req.body?.base ?? req.body?.serverUrl);
      if (!v.ok) return res.status(400).json({ error: `not an address the device can dial (${v.code})`, code: 'bad_base', why: v.code });
      base = v.base;
    }
    const dialUrl = DF.dialUrlOf(base, deviceId);
    // minting for an EXISTING deviceId is a RE-PAIR: setDialToken rotates the hash on the existing record
    // (mounts/forwards/history kept, host token file untouched) — no unpair needed (userW lesson: unpair-first
    // deleted the record and orphaned the still-running device daemon)
    // verify-r5 A1: …and AGAIN here, synchronous with the mint — the relay publish above awaited, and a second window's
    // Create could have minted this name meanwhile
    if (heldNow()) return;   // the same, after the relay's await
    const nv2 = DF.pairRequestVerdict({ deviceId, expect: req.body?.expect === 'new' ? 'new' : req.body?.expect === 'existing' ? 'existing' : null, hosts: hosts.list() });
    if (!nv2.ok) return res.status(409).json({ error: nv2.error, code: nv2.code, deviceId, ...(nv2.code === 'already_paired' ? { online: !!nv2.online } : {}), ...(nv2.twin ? { twin: nv2.twin } : {}) });
    const existed = !!hosts.findByDeviceId(deviceId);
    // RE-PAIR of a device that is dialed-in RIGHT NOW: push the rotated dial config over the live link — the
    // daemon re-reads dial.json per attempt (2.170.0), so nothing needs to run on the device. Best-effort; the
    // command is the universal fallback. ONLY WHEN ASKED (verify-r1 B8, PURE inPlacePushVerdict): a rotation is also
    // how a leaked command is retired, and the push handed the new token to whoever held the old one.
    // verify-r2 B8-r2: the verdict is asked BEFORE the mint because the mint ENDS the holder's link unless the push
    // wants it (`keepLink`) — r1 left the holder connected "until its next dial", i.e. until it chose to drop, and B9
    // then refused the owner's device on the new command as the holder's duplicate. A push that does not land cuts
    // the link as well: the device holds a command that is no longer the pairing.
    const holderConnected = !!agentdDials.get(deviceId);
    // verify-r6 P1: a requested push names the link the sheet SHOWED (`keepLinkSince` = its lastConnectAt); a link that
    // is gone or is another one ⇒ refused by name before anything is minted, cut or published further
    const liveRec = existed ? hosts.findByDeviceId(deviceId) : null;
    const pushV = DF.inPlacePushVerdict({ existed, live: holderConnected, requested: req.body?.updateInPlace === true, shownSince: req.body?.keepLinkSince === undefined ? undefined : req.body.keepLinkSince, liveSince: liveRec && liveRec.dial ? liveRec.dial.lastConnectAt : null });
    if (pushV.refuse) return res.status(409).json({ code: pushV.refuse, deviceId, error: pushV.refuse === 'link_gone' ? `"${deviceId}" is no longer connected — nothing was changed; its new command cannot be sent over its link` : `"${deviceId}" reconnected after the sheet was opened (or another device dialed in under its name) — nothing was changed; reopen the sheet` });
    let pair;
    const actBy = require('../device-audit.js').byOfReq(req); // lane device-act-audit: the owner's sign-in minted it (an URGENT For-you item names it)
    try { pair = agentdMintDialPair(deviceId, { host: DF.hostOf(dialUrl), base, keepLink: pushV.push, by: actBy, from: (req.socket && req.socket.remoteAddress) || '' }); }
    catch (e) { return res.status(e && e.code === 'vault_locked' ? 423 : 400).json({ error: e.message, code: e && e.code === 'vault_locked' ? 'vault_locked' : /collides/.test(e.message) ? 'collision' : 'mint_failed' }); }
    bcastAll({ type: 'hosts-updated' });
    // B-48a4 cure: the pairing command is handed out only once its dial token's hash is on disk (a restart before would leave the device unable to dial)
    if (typeof hosts.persisted === 'function' && !(await hosts.persisted())) return res.status(503).json({ error: 'the pairing is minted, but hosts.json is not on disk yet — the hub keeps trying; mint it again once it lands', code: 'not_durable' });
    let updatedInPlace = false;
    let lockedOut = !!pair.lockedOut;
    if (pushV.push) {
      try {
        const dm = await deviceForDial(deviceId);
        const root = String((await dm.runCmd('sh', ['-c', 'printf %s "${VIBESPACE_DEVICE_ROOT:-$VIBESPACE_AGENTD_ROOT}"'], { timeoutMs: 8000, by: actBy })).stdout || '').trim();
        if (root && path.isAbsolute(root)) {
          // verify-r3 (the dial-token door census): a token written onto a device goes through the device's ONE secret
          // door, `place-secret` — 0600 at open, tmp + rename (the fsWrite-then-chmod pair it replaced left a window at
          // the umask's mode, and a chmod that failed was swallowed). A daemon without the op, or a root outside its
          // $HOME (the op's own fence), keeps the old pair (the device's state dir is 0700 — the window is its owner's).
          const body = Buffer.from(JSON.stringify({ url: dialUrl, token: pair.dialToken }));
          let via = 'place-secret';
          try { await dm.placeSecret(root + '/state/dial.json', body, { by: actBy }); }
          catch {
            via = 'fs-write';
            await dm.fsWrite(root + '/state/dial.json', body, { by: actBy });
            await dm.runCmd('chmod', ['600', root + '/state/dial.json'], { timeoutMs: 5000, by: actBy }).catch(() => {});
          }
          updatedInPlace = true;
          console.log(`[device] '${deviceId}': the rotated dial config pushed in place (${via})`);
        }
      } catch { /* offline mid-flight / old bundle — the command covers it */ }
      if (!updatedInPlace) lockedOut = lockOutDialHolder(deviceId) || lockedOut; // the push did not land: the holder keeps a retired command
    }
    res.json({
      ...pair,
      dialUrl, httpBase: base,
      repair: existed,
      updatedInPlace, holderConnected, lockedOut, inPlace: pushV.why, // a connected holder NOT updated is DISCONNECTED now and refused at its next dial (the row says `refused (token mismatch)`)
      relayUrl, // the public subdomain the device dials (double-NAT mode)
      // lane device-allow-flags (design q-042 D5, owner ③): the allow list the dialog's command says when nobody changes it —
      // a CLUSTER instance (VIBESPACE_INSTANCE_NAME) leaves socks / lan / input off; a local one allows all
      allowDefault: require('../device-policy.js').defaultAllow({ cluster: !!process.env.VIBESPACE_INSTANCE_NAME }), clusterInstance: !!process.env.VIBESPACE_INSTANCE_NAME,
      command: `VIBESPACE_DIAL_TOKEN=${pair.dialToken} node vibespace-device.js --dial ${dialUrl}`, // verify-r3 B-inst: the token in the environment (the daemon reads it once and removes it), never an argv
      note: 'install the device daemon bundle on the device, write the hostToken to <root>/state/token (0600), then run with --dial',
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// ③ the DEVICE's own record of its dials (the `dial-status` agentd op — THREE-TOUCH, capability-gated: an old
//    daemon is never asked). Human-triggered (the Machines card's "Dial history…"), never on render.
app.get('/api/hosts/:id/dial-status', async (req, res) => {
  let h;
  try { h = hosts.get(req.params.id); } catch (e) { return e && e.code === 'hosts-unread' ? res.status(503).json({ error: `the machine's dial history: ${e.message}`, code: e.code }) : res.status(404).json({ error: 'no such machine', code: 'not-found' }); }   // the B-f276 remainder (H19): unknown, never «no such machine»
  if (!h.deviceId) return res.status(404).json({ error: 'this machine does not dial in', code: 'not-found' });
  if (!agentdDials.get(h.deviceId)) return res.status(503).json({ error: `"${h.name || h.id}" is offline — its daemon is not dialed in`, code: 'offline' });
  try {
    const dm = await deviceForDial(h.deviceId);
    res.json({ status: await dm.dialStatus() });
  } catch (e) {
    if (e && e.code === 'host_needs_daemon') return res.status(409).json({ error: e.message, code: 'host_needs_daemon' });
    res.status(503).json({ error: e.message, code: 'offline' });
  }
});
// (the /api/agentd/devices roster/test/unpair routes retired in B-f3e8 —
// machines are listed by /api/hosts, tested by /api/hosts/:id/test, unpaired
// by DELETE /api/hosts/:id)
const { DialSessionBridge } = require('../dial-session-bridge');
const dialBridge = new DialSessionBridge({
  deviceForDial,
  hostTokenFor: (deviceId) => agentdHostToken('dial-' + deviceId),
  log: (m) => console.log('[dial-bridge]', m),
});
// Standalone device install: serve the agentd bundle + installer (public — the
// bundle is not secret; auth is the per-device dial/host token at connect).
// Canonical names since the vibespace-device rename (2.154.x): /agentd.js and
// /agentd-install.* stay as PERMANENT aliases — commands in old docs/pairings
// must keep working.
app.get(['/vibespace-device.js', '/agentd.js'], (req, res) => {
  try { res.type('application/javascript').send(fs.readFileSync(path.join(rootDir, 'data', 'bin', 'vibespace-agentd.js'))); }
  catch { res.status(404).end(); }
});
app.get(['/vibespace-device-install.ps1', '/agentd-install.ps1'], (req, res) => {
  try { res.type('text/plain').send(fs.readFileSync(path.join(rootDir, 'scripts', 'vibespace-agentd-install.ps1'), 'utf-8')); }
  catch { res.status(404).end(); }
});
app.get(['/vibespace-device-install.sh', '/agentd-install.sh'], (req, res) => {
  try { res.type('text/x-shellscript').send(fs.readFileSync(path.join(rootDir, 'scripts', 'vibespace-agentd-install.sh'), 'utf-8')); }
  catch { res.status(404).end(); }
});
// Node runtime MIRROR for the device installer (2.246.0): a machine that can
// reach THIS instance (or its relay) but not nodejs.org — corporate egress
// filters, CN networks — still pairs. The installer only falls back here when
// the direct download fails. NEVER a general proxy: fixed upstream host +
// strict version/filename allowlist, cached on disk. Both the tarball and the
// SHASUMS come through here, so for that device the trust anchor becomes this
// instance — which it already trusts to serve the daemon bundle it runs.
// THE ONE DOWNLOADER of a node release file (lane runtime-floor): src/node-runtime.js fetchFile — the same list of names,
// bounded, a tmp + rename; the instance's own provisioner (scripts/runtime-check.mjs) downloads through it too.
app.get('/vibespace-node/:version/:file', async (req, res) => {
  const NR = require('../node-runtime');
  const v = String(req.params.version || ''), f = String(req.params.file || '');
  if (!NR.VERSION_RE.test(v) || !NR.FILE_RE.test(f)) return res.status(400).end();
  const dir = path.join(rootDir, 'data', 'node-cache', v), dest = path.join(dir, f);
  try {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dir, { recursive: true });
      try { await NR.fetchFile({ mirror: NR.DEFAULT_MIRROR, version: v, file: f, dest, maxBytes: f === 'SHASUMS256.txt' ? NR.MAX_SUMS : NR.MAX_ARCHIVE }); }
      catch (e) { return res.status(502).json({ error: e.code === 'upstream' ? String(e.message).replace(/^.*: /, 'upstream ') : e.message }); }
    }
    res.type(f.endsWith('.txt') ? 'text/plain' : 'application/octet-stream');
    fs.createReadStream(dest).pipe(res);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// lane hub-sync-holds (rank 13): the panel's rows are the KEPT statuses (no synchronous child on this turn); opening it is a person's press,
// so every kept status is asked again (async, bounded) and a change reaches the panel by its broadcast
/** a plugin door's refusal: a HELD plugins.json (B-f276 family unit 1) answers 503 with its code — the page words it by code */
// …and a plugin's OWN held store (r3334: the OpenCode serve's record, 503 serve_record_unread) answers its code the same way
const heldOf = (e) => !!e && (e.code === 'plugins_unread' || (e.status === 503 && typeof e.code === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(e.code)));
const pluginRefusal = (res, e) => res.status(heldOf(e) ? 503 : 400).json({ error: e.message, ...(heldOf(e) ? { code: e.code } : {}) });
app.get('/api/plugins', (req, res) => {
  try { res.json({ plugins: plugins.list(), ...(plugins.unreadWords() ? { unread: plugins.unreadWords() } : {}), ...(plugins.tornCopy() ? { torn: plugins.tornCopy() } : {}) }); plugins.refreshAll(); } catch (e) { res.status(500).json({ error: e.message }); }   // B-f276 family unit 1: why every plugin reads as off
});
app.get('/api/plugins/:id/status', async (req, res) => {
  try { const st = await plugins.refreshStatus(req.params.id); res.json(plugins.unreadWords() && st && typeof st === 'object' ? { ...st, unread: plugins.unreadWords() } : st); } catch (e) { pluginRefusal(res, e); }   // B-f276 family unit 1: a held plugins.json is said (the first-use offer asks nothing then)
});
app.post('/api/plugins/:id/install', async (req, res) => {
  try { res.json(await plugins.install(req.params.id)); } catch (e) { pluginRefusal(res, e); }
});
app.post('/api/plugins/:id/start', async (req, res) => {
  try { res.json(await plugins.start(req.params.id)); } catch (e) { if (e && e.code && e.code !== 'plugins_unread') res.status(400).json({ error: e.message, code: e.code }); else pluginRefusal(res, e); }   // B-1217: a refusal's code (the page words it); a held plugins.json through pluginRefusal
});
app.post('/api/plugins/:id/stop', async (req, res) => {
  try { res.json(await plugins.stop(req.params.id)); } catch (e) { if (e && e.code && e.code !== 'plugins_unread') res.status(400).json({ error: e.message, code: e.code }); else pluginRefusal(res, e); }   // B-1217: a refusal's code (the page words it); a held plugins.json through pluginRefusal
});
app.post('/api/plugins/:id/takeover', async (req, res) => {   // B-1217 its round (主开发 r2175 (1)): the person's own press (the page's door: its cookie) — the one road that ends a relay client this instance did not start
  const why = require('../write-origin.js').ownerPageWhy(req);   // its read (MUST): the person's own PAGE — every bearer, and a request no page of this instance made (a header-less curl with sign-in off)
  if (why) { res.status(403).json({ error: why === 'bearer' ? 'taking the relay over is the person\'s own press — no token may press it' : 'taking the relay over is the person\'s own press on this instance\'s own page', code: why === 'bearer' ? 'agent_forbidden' : why }); return; }
  try { const b = req.body || {}; res.json(await plugins.takeOver(req.params.id, { pid: b.pid, start: b.start, press: true })); } catch (e) { if (e && e.code && e.code !== 'plugins_unread') res.status(400).json({ error: e.message, code: e.code }); else pluginRefusal(res, e); }   // a held plugins.json through pluginRefusal (503), as start / stop
});
app.post('/api/plugins/:id/login', async (req, res) => {
  try { res.json(await plugins.loginStart(req.params.id)); } catch (e) { pluginRefusal(res, e); }
});
app.post('/api/plugins/:id/enabled', (req, res) => {
  try { plugins.setEnabled(req.params.id, !!req.body?.enabled); res.json({ ok: true }); } catch (e) { pluginRefusal(res, e); }
});
app.post('/api/plugins/:id/mode', (req, res) => {
  try { res.json(plugins.setMode(req.params.id, String(req.body?.mode || 'auto'))); } catch (e) { pluginRefusal(res, e); }
});
app.post('/api/plugins/:id/config', (req, res) => {
  // lane setting-doors f4 (主开发 2026-11-15): the judge's daily dollar cap is a SPENDING row — this old door writes it through the
  // plugin's own settings, so it asks the one verdict too: a change of it that is not the owner's page is refused by name, nothing written
  const b = req.body || {}, why = req.params.id === 'llm' ? require('../write-origin.js').ownerPageWhy(req) : null;
  const asked = b.dailyBudgetCents !== undefined ? Number(b.dailyBudgetCents) / 100 : b.dailyBudgetUsd !== undefined ? Number(b.dailyBudgetUsd) : null;
  const cur = (persistenceRouter.readSettings() || {})['plugin.llm.dailyBudgetUsd'];
  if (why && asked !== null && asked !== (cur === undefined ? require('../plugin-settings.js').PLUGIN_SETTINGS.llm.rows.find((r) => r.key === 'dailyBudgetUsd').default : Number(cur))) {
    return res.status(403).json({ error: `plugin.llm.dailyBudgetUsd: the judge's daily dollar cap changes only by the owner's press on the owner's own page (Settings › Spending — vibespace://settings/plugin.llm.dailyBudgetUsd); ${why === 'bearer' ? 'a request carrying a bearer token' : 'a request with no mark of the owner\'s page'} cannot change it; nothing was written. Ask the owner with vibespace-ask and give that link`, code: 'spend_row_owner_only', why, rows: ['plugin.llm.dailyBudgetUsd'], door: 'vibespace://settings/plugin.llm.dailyBudgetUsd' });
  }
  // r5185 (lane hub-loop-stalls): a MACHINE caller (a bearer — the tree's one verdict, src/write-origin.js pressBearer) keeps the
  // release's unsynced settings write; a PERSON's press on a plugin's own page syncs it (src/routes/persistence.js asMachineCall)
  const call = () => plugins.setConfig(req.params.id, b);
  try { res.json(require('../write-origin.js').pressBearer(req.headers) && typeof persistenceRouter.asMachineCall === 'function' ? persistenceRouter.asMachineCall(call) : call()); } catch (e) { res.status(400).json({ error: e.message }); }
});
// "we already offered this plugin" — the first-use dialog is asked ONCE per
// instance (owner: "Not now" is remembered), so the flag is INSTANCE state
// (data/plugins.json) that broadcasts, never per-browser localStorage.
app.post('/api/plugins/:id/prompted', (req, res) => {
  try { res.json(plugins.setPrompted(req.params.id, req.body?.prompted !== false)); } catch (e) { pluginRefusal(res, e); }
});

// PLUGIN LOADER (Ph2, 2.369.24; Ph4 2.369.30): manifest plugins under
// data/plugins — iframe assets, trusted client modules, forked server
// processes under node --permission, agent-tool shims, install sources.
// agentAuth = the vsst_ bearer → live session (the tool route is cookie-exempt
// under /api/agent/). instanceUrl = the ONLY source of "this instance's public
// address" the shims may bake in (instance-url.js); telemetry = install /
// enable / crash events into the local ledger.
let hostVersion = null; try { hostVersion = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')).version; } catch { }
const { agentEnv } = require('../ws-handler'); // the ONE sanitized-env builder every spawn uses (spawn-hygiene law)
// lane engine-distribution (P4): the fleet's engine fact (fleet.json `browserEngine` — D2's pre-trust reads its plugin + sha)
// and THE KERNEL'S DISTRIBUTION (made beside the keeper below; its boot job's outcome is the Plugins panel's fleet line)
const fleetEngineFact = () => { try { const f = require('./cluster-presets.js').sharedPresets().fleet(); return f && f.browserEngine ? f.browserEngine : null; } catch { return null; } };
let engineDistribution = null;
const pluginLoader = require('./plugin-loader.js').create({
  rootDir, app, hostVersion, agentEnv, log: console, instanceUrl,
  integrations: () => integrations, fleetEngine: fleetEngineFact, fleetStatus: () => (engineDistribution ? engineDistribution.fleetView() : null),
  broadcast: (m) => bcastAll(m),
  telemetry: (ev) => { try { getTelemetry?.()?.record(ev); } catch { } },
  agentAuth: (req) => {
    const tok = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!tok.startsWith('vsst_') || !activeSessions) return null;
    for (const [id, s] of activeSessions) if (sameToken(tok, s.agentToken)) return { sessionId: id };
    return null;
  },
});
process.on('exit', () => { try { pluginLoader.shutdown(); } catch { } });
// Plugin tool shims ship to ssh hosts / dial devices with the core agent tools:
// hosts.js agentTools() = the static list + whatever the loader generates now.
require('../hosts').HostManager.extraAgentTools = () => pluginLoader.shimNames();
// The shims bake this instance's public URL as their fallback call-back
// address — regenerate them whenever the mapping changes (publish/unpublish).
try { instanceUrl?.onChange?.(() => { try { pluginLoader.syncShims(); } catch (e) { console.warn('[plugins] shim refresh after instance-url change failed:', e.message); } }); } catch { }

const { MountManager } = require('../mounts');
const mounts = new MountManager({
  dataDir: path.join(rootDir, 'data'),
  getSetting: serverSetting,
  broadcast: (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
    // Mount state changed ⇒ context folders skipped as shadowed may be back.
    if (msg?.type === 'mounts-updated') { try { onMountsUpdated?.(); } catch (e) { console.warn('[mounts] onMountsUpdated failed:', e.message); } }
    if (msg?.type === 'mounts-updated') { try { require('./sync-fs-witness.js').create().refresh(); } catch { } } // lane hub-fuse-sync-guard: the guard's roots follow the registry (a row added / removed / mounted)
  },
});
// The task store regenerated TASK.md at boot BEFORE mounts existed (its shadow
// predicate answered null) — redo it now that isMounted() can answer.
try { onMountsUpdated?.(); } catch (e) { console.warn('[mounts] boot ctx resync failed:', e.message); }
// Rename guard: bridge-share chroots are filesystem paths under the mount.
// MUST be OUTSIDE the broadcast callback — it was mis-nested inside, so every
// broadcast re-ran it, and a broadcast DURING construction (env-import add →
// _notify → broadcast) referenced `mounts` while it was still in its TDZ,
// throwing "Cannot access 'mounts' before initialization" out of add() before
// it returned the id — which is why an env-provisioned My storage (S3 or
// CephFS) came up `desired: unmounted` on its very first boot.
mounts.pathGuard = (p) => { mountTokens.refuseIfHeld('renaming this storage'); return mountTokens.list().some((t) => String(t.root || '').startsWith(p)); };   // B-f276 family unit 1: tokens held ⇒ whether a link points here is unknown — refused by name
{ const fy = require('./mount-for-you.js').create({ getUserTodos: () => userTodos, mountCount: () => mounts._state.mounts.length, log: (l) => console.warn(l), onReopen: () => { mounts.clientSwapCheck().catch(() => { }); } }); Object.assign(mounts, { onPark: (m, info) => fy.park(m, info), onUnpark: (m) => fy.unpark(m), onKilled: (m, info) => fy.killed(m, info), onAnswered: (m) => fy.answered(m), onStranded: (m, info) => fy.stranded(m, info), onRemoved: (m) => fy.removed(m), onClientSwaps: (g, memos) => fy.clientSwaps(g, memos) }); try { require('./cluster-presets.js').sharedPresets().onChange(() => { mounts.clientSwapCheck().catch(() => { }); }); } catch (e) { console.warn(`[mounts] the client-swap notice follows no presets reload: ${e.message}`); } mounts.clientSwapCheck().catch(() => { }); } // B-e40d: a replaced preset client is said (the boot + every reload). B-5ce7: the mounts' For-you items (a parked mount + its Reconnect door; B-f230: a stopped process, stranded files)
setTimeout(() => mounts.restore().catch(e => console.error('[mounts] restore:', e.message)), 2000);
vault.onUnlock(() => mounts.restore().catch((e) => console.error('[mounts] restore after the vault unlocked:', e.message))); // lane vault-e2e-password: a boot over a LOCKED vault could not open a mount's secret — the unlock re-mounts what is desired
vault.onUnlock(() => { try { instanceUrl?.restore?.({ ifFailed: true }); } catch (e) { console.error('[instance-url] restore after the vault unlocked:', e.message); } }); // lane fleet-instance-publish: a desired instance URL whose restore FAILED tries again once the vault opens — one cycle per unlock
// lane vault-e2e-password-fix-r2 — THE OPEN SWEEPS (seal what an older build left in the clear) and THE LOCK SIGNS EVERY LOGIN
// OUT (the owner's decision ④): src/server/vault-hooks.js
require('./vault-hooks.js').wireVaultHooks({ vault, auth, wss, hostTokens, plugins, sealed: [droplineTokens], integrations, userTodos, // lane vault-relock-door: the boot's SET-UP+LOCKED For-you notice (the tray says the vault is waiting)
  // a device that dialed in while LOCKED never got its hello (the hub could not read its token): its link is dropped at the
  // open, so it re-dials and the whole dial-in runs — the hello, the mounts' heal, every session's back-tunnel re-owned
  redial: () => { let n = 0; for (const [deviceId, stream] of agentdDials) { const dm = agentdDialDevices && agentdDialDevices.get(deviceId); if (dm && dm.status && dm.status().connected) continue; try { stream.destroy(); n++; } catch { } } if (n) console.log(`[vault] ${n} device link(s) dialed in while locked — dropped so they re-dial and say hello`); return n; } });
// Hung-mount watchdog: one unreachable backend must never wedge the server
// (libuv threadpool saturation — see mounts.js _healthSweep).
mounts.startHealthWatchdog();
app.locals.mounts = mounts; // files.js circuit breaker asks it about blocked mount roots
require('../mount-door').register(mounts); // B-afc4: every other user-path reader asks the same answer (src/mount-door.js)
require('./cwd-wait.js').register({ vault, mounts }); // B-864f: a session folder on a mount that waits for the vault is PENDING, never gone (src/server/cwd-wait.js)
// Self-mount guard: a bridge token WE minted = the share points back at this
// instance; fuse→HTTP→self deadlocks the threadpool (real incident).
mounts.selfTokenCheck = (raw) => mountTokens.has(raw);

app.get('/api/mounts', async (req, res) => {
  const cfg = mounts.getMyStorageConfig(); // redacted (no secret)
  res.json({
    mounts: mounts.list(),
    ...(mounts.unreadWords() ? { unread: mounts.unreadWords() } : {}),   // B-f276 family unit 1: mounts.json held — why the list is empty
    ...(mounts.tornCopy() ? { torn: mounts.tornCopy() } : {}),   // …and a lift from torn bytes in this run: where the old bytes are
    providers: mounts.providers(),   // the storage providers' client cells (lane dc-mount-client)
    shares: mounts.listShares(),
    env: cfg ? { endpoint: cfg.endpoint, bucket: cfg.bucket, prefix: cfg.prefix, accessKey: cfg.accessKey, configured: cfg.configured, importedFromEnv: cfg.importedFromEnv } : null,
    mountBase: mounts.mountBase,
    ...(await Promise.all([mounts.mcAvailable(), mounts.rcloneAvailable()]).then(([mcAvailable, rcloneAvailable]) => ({ mcAvailable, rcloneAvailable }))),   // B-323e: kept, asked of the starter side by side — never a synchronous fork per read
  });
});
app.post('/api/mounts', (req, res) => {
  try { res.json({ success: true, id: mounts.add(req.body || {}) }); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
app.post('/api/mounts/import', (req, res) => {
  try {
    const link = req.body?.link;
    // vibespace-mount:v1 = another instance's WebDAV bridge (scoped bearer token)
    const dav = MountTokens.parseLink ? MountTokens.parseLink(link) : null;
    if (dav) {
      const id = mounts.add({
        type: 'vibespace', origin: 'imported',
        name: req.body?.name || dav.name || 'vibespace-mount',
        mode: dav.mode === 'rw' ? 'rw' : 'ro',
        url: dav.url, bearerToken: dav.token,
        customPath: req.body?.customPath || null,
      });
      return res.json({ success: true, id });
    }
    // vibespace-cephmount:v1 = a direct CephFS subtree share (path-scoped cephx
    // key minted cluster-side) → a normal kernel cephfs mount, no proxy.
    const cm = MountManager.parseCephMountLink(link);
    if (cm) {
      const id = mounts.add({
        type: 'cephfs', origin: 'imported',
        name: req.body?.name || cm.name || 'ceph-share',
        mode: cm.mode === 'rw' ? 'rw' : 'ro',
        cephMonHosts: cm.mons, cephFsName: cm.fsName || 'cephfs',
        cephPath: cm.path, cephUser: cm.user, cephSecret: cm.secret,
        customPath: req.body?.customPath || null,
      });
      return res.json({ success: true, id });
    }
    const p = MountManager.parseShareLink(link);
    const id = mounts.add({
      ...p, origin: 'imported',
      name: req.body?.name || p.name || 'imported-share',
      mode: p.mode === 'rw' ? 'rw' : 'ro',
      customPath: req.body?.customPath || null,
    });
    res.json({ success: true, id });
  } catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
// Direct CephFS subtree share — mint a path-scoped key (ceph-mint service).
app.post('/api/mounts/:id/ceph-share', async (req, res) => {
  try { res.json(await mounts.mintCephShare(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});

// B-f276 family unit B: THE ONE NOTICE's two routes (its hub half is made above the first route: `heldLists`)
app.get('/api/held-lists', (req, res) => res.json({ lists: heldLists.list(), ...heldLists.mark() }));   // r3284: with its mark (the page drops an answer older than its last broadcast)
app.post('/api/held-lists/read-again', async (req, res) => {
  if (require('../write-origin.js').pressBearer(req.headers)) return res.status(403).json({ error: 'reading the held lists again is the owner\'s press — no token presses it (an agent\'s, a job\'s, an automation\'s)', code: 'agent-forbidden' });   // r3212: the tree's ONE verdict for every bearer
  try { res.json(await heldLists.readAgain()); } catch (e) { res.status(500).json({ error: (e && e.message) || 'failed' }); }
});

// Mount tokens (WebDAV bridge): mint returns the link ONCE; stored hashed
app.get('/api/mount-tokens', (req, res) => res.json({ tokens: mountTokens.list(), ...(mountTokens.unreadWords() ? { unread: mountTokens.unreadWords() } : {}), ...(mountTokens.tornCopy() ? { torn: mountTokens.tornCopy() } : {}) }));   // B-f276 family unit 1: why the list is empty
app.post('/api/mount-tokens', (req, res) => {
  try {
    const { name, root, mode } = req.body || {};
    const { raw, rec } = mountTokens.mint({ name, root, mode });
    const url = require('../write-origin.js').ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) }); // the request's own origin (forwarded proto / host first — behind an https ingress the link is https): THE one rule
    res.json({ success: true, token: raw, davUrl: `${url}/dav`, link: mountTokens.buildLink({ url, raw, rec }), id: rec.id, rec: { id: rec.id, name: rec.name, root: rec.root, mode: rec.mode } });
  } catch (e) { res.status(e.code === 'tokens_unread' ? 503 : 400).json(require('../mount-error-words.js').errorBody(e)); }   // B-f276 family unit 1: held, by name
});
app.delete('/api/mount-tokens/:id', (req, res) => {
  try { mountTokens.revoke(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(e.code === 'tokens_unread' ? 503 : 400).json(require('../mount-error-words.js').errorBody(e)); }
});

// Import an rclone.conf: parse to a preview list, then import selected remotes
app.post('/api/mounts/rclone-conf/parse', (req, res) => {
  try {
    const remotes = MountManager.parseRcloneConf(req.body?.text || '');
    // never echo secret values back — just names/types/param-keys + wraps flag
    res.json({ remotes: remotes.map(r => ({ name: r.name, type: r.type, paramKeys: Object.keys(r.params), wraps: r.wraps })) });
  } catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
app.post('/api/mounts/rclone-conf/import', async (req, res) => {
  try {
    const all = MountManager.parseRcloneConf(req.body?.text || '');
    const want = new Set(req.body?.names || []);
    const mode = req.body?.mode === 'ro' ? 'ro' : 'rw';
    const doMount = req.body?.mount !== false;
    const added = [];
    for (const r of all) {
      if (want.size && !want.has(r.name)) continue;
      if (r.wraps) continue; // can't resolve nested remotes
      try {
        const id = mounts.addFromRcloneRemote(r, { mode });
        added.push({ name: r.name, id });
        if (doMount) { try { await mounts.mount(id); } catch {} }
      } catch (e) { /* skip dupes/invalid, continue */ }
    }
    res.json({ success: true, added });
  } catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});

// rclone availability + one-click install (data/bin, pinned verified version)
app.get('/api/mounts/rclone', async (req, res) => res.json({ available: await mounts.rcloneAvailable(), bin: mounts.rcloneBin() }));
app.post('/api/mounts/rclone/install', async (req, res) => {
  try { res.json({ success: true, ...(await mounts.installRclone()) }); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});

// A STORAGE MOUNT'S OAUTH CLIENT AND ITS CONSENT ARE THE OWNER'S (client-from-mount
// verify r5): a self-identifying agent bearer (vsst_ / jbt_) is refused by name on
// the routes that begin / follow / finish / cancel a Drive or Gmail consent, that
// write a minted token, and on the config read that prefills the client secret in
// the clear — the courtesy src/routes/channels.js gives its consent verbs and its
// mount-clients list (the same secret, lent to a channel account, would otherwise
// have been one GET away on this side). With sign-in on the cookie gate answers
// 401 before this; on a sign-in-off instance this is the named refusal.
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
function refuseAgentBearer(req, res) {
  if (!isAgentBearer(req)) return false;
  res.status(403).json({ error: 'a storage mount\'s OAuth client and its sign-in are the owner\'s — an agent token may not read, start or complete one', code: 'agent-forbidden' });
  return true;
}
// Guided Google Drive OAuth (see mounts.js startDriveAuth for the model).
// With mountId: re-authorize an EXISTING Drive mount/credential using its own
// OAuth client creds (invalid_grant recovery).
app.post('/api/mounts/gdrive-auth/start', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try {
    const { mountId, ...opts } = req.body || {};
    res.json(mountId ? await mounts.startDriveAuthForMount(mountId) : await mounts.startDriveAuth(opts));
  } catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
// Write a minted token back into an existing Drive record + bounce its mounts.
// `client` = the OAuth client it was minted under (D2: a client switch lands
// WITH its token — never a new client beside the old token)
app.post('/api/mounts/:id/drive-token', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try { await mounts.applyDriveToken(req.params.id, req.body?.token, req.body?.client); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
app.get('/api/mounts/gdrive-auth/status', (req, res) => { if (refuseAgentBearer(req, res)) return; res.json(mounts.driveAuthStatus()); });
app.post('/api/mounts/gdrive-auth/callback', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try { res.json(await mounts.forwardDriveCallback(req.body?.url)); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
app.post('/api/mounts/gdrive-auth/cancel', (req, res) => { if (refuseAgentBearer(req, res)) return; mounts.cancelDriveAuth(); res.json({ success: true }); });
// Shared Drive picker (2.131.0): list the Shared Drives a drive credential can
// see — by existing record id, or transiently by pasted token (add dialog).
app.post('/api/mounts/shared-drives', async (req, res) => {
  try { res.json({ drives: await mounts.listSharedDrives(req.body || {}) }); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
// Gmail guided OAuth (2.134.0) — mirrors the gdrive-auth UX: start returns the
// consent URL; same-machine completes hands-free via the local listener;
// remote users paste the 127.0.0.1 redirect back to /callback.
app.post('/api/mounts/gmail-auth/start', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try { res.json(await mounts.gmail.startAuth(req.body || {})); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
app.get('/api/mounts/gmail-auth/status', (req, res) => { if (refuseAgentBearer(req, res)) return; res.json(mounts.gmail.authStatus()); });
app.post('/api/mounts/gmail-auth/callback', async (req, res) => {
  if (refuseAgentBearer(req, res)) return;
  try { res.json(await mounts.gmail.forwardCallback(req.body?.url)); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
app.post('/api/mounts/gmail-auth/cancel', (req, res) => { if (refuseAgentBearer(req, res)) return; mounts.gmail.cancelAuth(); res.json({ success: true }); });
// Labels picker (2.135.0): the account's real labels for the sync filter.
app.post('/api/mounts/gmail-labels', async (req, res) => {
  try { res.json({ labels: await mounts.listGmailLabels(req.body || {}) }); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
// Instance-preset Google clients for the UI picker: keys+labels ONLY, never secrets.
app.get('/api/mounts/drive-defaults', (req, res) => {
  const presets = require('../mounts').MountManager.drivePresets().map((c) => ({ key: c.key, label: c.label }));
  res.json({ presets, hasDefaultClient: presets.length > 0 });
});

app.post('/api/mounts/:id/share', async (req, res) => {
  try {
    const { folder, mode, name, expiryDays } = req.body || {};
    const out = await mounts.mintShareFromMount(req.params.id, { folder, mode, name, expiryDays });
    res.json({ success: true, ...out });
  } catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
app.delete('/api/mounts/shares/:id', async (req, res) => {
  try { await mounts.revokeShare(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
app.post('/api/mounts/:id/mount', async (req, res) => {
  try {
    const ok = await mounts.mount(req.params.id);
    // 'starting' = the daemon lives and rebuilds its cache index — the row says so
    res.json({ success: ok === 'starting' || ok, starting: ok === 'starting', mounts: mounts.list() });
  } catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }   // B-af94: a coded refusal keeps its code
});
// B-5ce7: the parked mount's Reconnect door (the For-you row `mount-reconnect` declares it — {ok, state} as the row's said words read)
app.post('/api/mounts/:id/reconnect', async (req, res) => {
  try { res.json(await mounts.reconnect(req.params.id)); }   // B-5ce7: MountManager.reconnect answers {ok, state} as the row's words read
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }   // B-af94: a coded refusal keeps its code
});
app.post('/api/mounts/:id/unmount', async (req, res) => {
  try {   // B-323e (r1501 (8)): a person's press — said while it runs, joined
    const ok = await mounts.unmount(req.params.id, { press: true }), w = mounts.unmountWhyOf?.(req.params.id);
    if (w) { const MW = require('../mount-error-words.js'); res.status(409).json(MW.errorBody(MW.refusal(w.code, { why: w.why }))); return; }   // its follow (r1890 (1)): its road threw — said by what is known, with its reason, in the page's words
    res.json({ success: ok, ...(mounts.unmountNotOnDisk?.(req.params.id) ? { notOnDisk: true } : {}) });   // B-574d (r4827): detached, its record not yet on disk — the page says it (sayNotOnDisk)
  }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
// Decrypted connection config for the edit dialog (prefill REAL values —
// user directive; cookie-authed, single-user instance model). ONE answer on GET and on POST (B-ee0a's take, 主开发 08:50Z: the page's
// road is the POST — a plain-http page sends no Origin on a GET; the GET stays for pages loaded before this build, which it serves on https
// or localhost only: on plain http such a page's GET is refused until the page reloads — the reload toast says so). With NO vault set
// up, the person verdict first, as its siblings (the key reveal, the export): a conversation's, job's or automation's credential and
// a script with no browser headers of this page are refused by name. A set-up vault: its reveal window, as before.
function mountConfigAnswer(req, res) {
  res.set('Cache-Control', 'no-store');
  // lane vault-contents-window r2 (verify r1): a set-up vault hands the sealed fields only inside THIS page's reveal window
  // (the Vault window's door: paced, audited `vault-reveal` field '*'); else they come back MASKED (the dialog keeps them)
  const gate = app.locals.vaultGate;
  if ((!gate || gate.state() === 'not_set_up') && !personOnlyDoor(req, res)) return;   // NO vault: the person only (B-ee0a)
  let masked = false;
  // lane ui-controls-and-bugs: a record whose answer carries no sealed byte (the write-only law drops every secret) asks no
  // reveal — no `vault-reveal` audited, no pace spent for nothing
  let needs = true; try { needs = mounts.revealNeeded(req.params.id); } catch { /* an unknown id: config() answers it below */ }
  if (needs && gate && gate.state() !== 'not_set_up') { const g = gate.revealRecord(req, 'mounts', req.params.id); masked = !g.ok; if (g.code === 'human_only' || g.code === 'cross_site') return res.status(403).json({ error: gate.refusalOf(g.code), code: g.code }); }
  try { res.json(mounts.config(req.params.id, { masked })); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
}
app.get('/api/mounts/:id/config', (req, res) => {
  if (refuseAgentBearer(req, res)) return;   // verify r5: the plaintext client secret — the owner's dialog only
  mountConfigAnswer(req, res);
});
app.post('/api/mounts/:id/config', (req, res) => {   // the page's road (B-ee0a)
  if (refuseAgentBearer(req, res)) return;
  mountConfigAnswer(req, res);
});
// D2: a bare client switch beside a held token is refused 409 by name
// (`client-change-needs-reauth`) — the client lands WITH its token through
// drive-token {token, client} or a PATCH that carries `token`
app.patch('/api/mounts/:id', async (req, res) => {
  try { await mounts.update(req.params.id, req.body || {}); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(e.code === 'client-change-needs-reauth' ? 409 : 400).json({ ...require('../mount-error-words.js').errorBody(e), ...(e.code ? { code: e.code } : {}), mounts: mounts.list() }); }
});
// Credentials (2.108.0): mount points under a credential + manual convert
app.post('/api/mounts/:id/children', (req, res) => {
  try { const id = mounts.addChild(req.params.id, req.body || {}); res.json({ success: true, id, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ ...require('../mount-error-words.js').errorBody(e), mounts: mounts.list() }); }
});
app.post('/api/mounts/:id/convert', async (req, res) => {
  try { await mounts.convert(req.params.id, req.body?.to === 'credential' ? 'credential' : 'mount'); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ ...require('../mount-error-words.js').errorBody(e), mounts: mounts.list() }); }
});
app.delete('/api/mounts/:id', async (req, res) => {
  try { await mounts.remove(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json(require('../mount-error-words.js').errorBody(e)); }
});
const { readLayouts, writeLayouts, flushLayouts } = persistenceRouter;

// Session discovery functions imported from ./src/session-store.js
// Helper to create SessionMessages with correct context
function createSessionMessages(session, sessionId) {
  // Descriptor-declared readers first (S8: every ACP harness ships
  // store.SessionMessages — the wrapper journal is its whole history);
  // claude/codex keep their historical classes below unchanged.
  const be = session?.backend;
  if (be && be !== 'claude' && be !== 'codex') {
    try {
      const h = require('../harnesses').get(be);
      // S9: a store that builds its own reader (opencode: serve-backed for a
      // STOPPED conversation, the wrapper journal for a LIVE one) gets the
      // liveness FACT — transcript-service's synthetic session shape and a
      // live session object are otherwise indistinguishable to the reader.
      if (typeof h?.store?.createReader === 'function') {
        let live = false;
        for (const s of activeSessions.values()) if (s === session) { live = true; break; }
        return h.store.createReader(session, sessionId, { buffersDir: BUFFERS_DIR, live });
      }
      if (h?.store?.SessionMessages) return new h.store.SessionMessages(session, sessionId, { buffersDir: BUFFERS_DIR });
    } catch (e) { console.error(`[session-messages] ${e.message}`); }
  }
  return session?.backend === 'codex'
    ? new CodexSessionMessages(session, sessionId, { buffersDir: BUFFERS_DIR })
    : new SessionMessages(session, sessionId, { buffersDir: BUFFERS_DIR, permissionModes: PERMISSION_MODES });
}

  // ── OpenCode serve ACCESS + its action routes (S9 remainder, B-eac2) ──
  // Wired next to the plugin that owns the serve's on/off switch. ONE layer
  // per instance: routes and ws cases name a machine with `hostId` and it
  // picks the transport (local facts / the `opencode-serve` agentd op / the
  // shipped ssh script) — hostId is a parameter, never a branch.
  require('./opencode-access').create({ app, hosts, broadcast: (m) => bcastAll(m), serverSetting });

  // ── AGENT BROWSER P1: the profile registry + lease keeper + its routes ──
  // (design-agent-browser-v2 §3.3–§3.5). ONE keeper per instance, installed
  // as the module singleton so ws-create can ask a conversation's pin lazily;
  // LAZY by construction — nothing runs until a profile is attached, and the
  // boot reconciliation (server.js, after restoreSessions) is what may start
  // its tick. The spawn env it hands a browser is the sanitised base env.
  let browserKeeper = null;
  let browserKeys = null; // B-f7ab: the late browser key (src/server/browser-key.js)
  let browserDialogs = null; // lane browser-stuck: the page-dialog watch (src/server/browser-dialogs.js)
  let browserHandback = null;
  let browserProposals = null; // lane browser-propose: the proposal runner (src/server/browser-propose.js)
  let browserAccess = null;
  try {
    const { agentEnv } = require('../ws-handler');
    // P4 (§3.6 / §7.3 / D5 (b)): ONE way to reach a profile browser on any
    // machine — local facts in-process, the `browser-serve` agentd op on a
    // paired device, a CDP port tunnelled over tcpForward. `hostId` is a
    // parameter the layer dispatches on; the keeper never asks "is this remote".
    browserAccess = require('./browser-access').create({ hosts, env: () => agentEnv(), log: console });
    // P4 second half (§7.5): THE key consumer — one module declares this
    // track's registry rows' consumer, registers their six Test runners and
    // resolves their keys (`keyFor`, the ONE resolve the keeper asks through
    // before a spawn); the switcher's SOURCE chip reads its masked `sourceOf`
    const browserBackend = require('./browser-backend').create({ integrations: () => integrations, log: console });
    // lane engine-plugin: THE ENGINE REGISTRY; lane engine-distribution: its kernels' distribution (download · receipt ·
    // measured version · the fleet's boot job — ONE For-you producer, origin plugin)
    const browserEngines = require('./browser-engines.js').create({ loader: pluginLoader, plugins, dataDir: path.join(rootDir, 'data'), log: console, setting: (k) => serverSetting(k) }); // lane engine-spi-egress L1b: the owner's program row, read live
    engineDistribution = require('./engine-distribution.js').create({ dataDir: path.join(rootDir, 'data'), engines: browserEngines, loader: pluginLoader, fleetFacts: () => { try { return require('./cluster-presets.js').sharedPresets().fleet(); } catch { return null; } },
      env: () => process.env, userTodos: () => userTodos, notify: () => { try { bcastAll({ type: 'browser-engines-updated' }); } catch { /* no clients */ } }, log: console,
      integrations: () => integrations }); // lane kernel-asset-credential: the Plugin Git credential for a kernel on the plugin's own repository
    // lane fleet-plugin-catalog: THE CLUSTER'S PIN, LIVE — a presets change that moves fleet.json's browserEngine runs the fleet's
    // job again (install / update at the new sha, its kernel), no restart
    try { engineDistribution.follow(require('./cluster-presets.js').sharedPresets()); } catch (e) { console.warn(`[plugins] the fleet's engine plugin follows no presets change — a new pin waits for a restart (${e && e.message})`); }
    { const ids = browserBackend.registerTests(); if (ids.length) console.log(`[browser] key rows' Test runners registered: ${ids.join(', ')}`); }
    // P6 (§6.2 / §6.5 / D6): the CDP-mediating proxy — LAZY (listens on
    // nothing until the first mediated lease), owned by the keeper (its
    // shutdown ends it); its presence is what makes `sharing:"instance"` a
    // value on this instance. An unbuildable proxy is said once and the
    // instance stays in the pre-P6 world (instance sharing refused by name).
    let cdpMediator = null;
    try { cdpMediator = require('./cdp-mediator').create({ log: console }); } catch (e) { console.warn('[browser] cdp mediator unavailable — instance sharing stays refused: ' + (e && e.message)); }
    // lane browser-propose (a HEAVY-GATE aid, env-gated like VIBESPACE_CHANNELS_FAKE): `VIBESPACE_TEST_EGRESS_MAP="a.test=127.0.0.1,…"`
    // points a wrapped browser's egress proxy upstream for RESERVED `.test` hosts (RFC 2606 — never a real site) at loopback, so a
    // throwaway server's engine browser can open a local fixture page by a name; anything else in the variable is ignored
    const testEgressMap = new Map(String(process.env.VIBESPACE_TEST_EGRESS_MAP || '').split(',').map((kv) => kv.split('=').map((x) => String(x || '').trim().toLowerCase())).filter(([h, ip]) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.test$/.test(h || '') && ip === '127.0.0.1'));
    // lane browser-resume (§3.9, the owner's ruling 1): THE KEPT BROWSERS — a conversation's own browser's logins
    // directory + its tabs outlive the browser (src/server/browser-kept.js); the keeper is its one feeder, its shutdown
    // flushes it; `browser-kept-updated` re-loads the Agent browser panel on every client
    let browserKept = null;
    try { browserKept = require('./browser-kept').create({ dataDir: path.join(rootDir, 'data'), keeper: () => browserKeeper, serverSetting, settingsHeld: () => (typeof persistenceRouter.settingsHeld === 'function' ? persistenceRouter.settingsHeld() : null), broadcast: (m) => bcastAll(m), liveKeys: () => new Set([...activeSessions.values()].map((s) => s && s._browserKey).filter(Boolean)), liveConversations: () => new Set([...activeSessions.values()].map((s) => s && require('./browser-bindings').conversationIdOf({ claudeSessionId: s.claudeSessionId, backendSessionId: s.backendSessionId })).filter(Boolean)), onChange: () => browserKeeper?.factsMoved?.() }); } // lane B: a kept change moves the browser fact (Resume)
    catch (e) { browserKept = null; console.warn('[browser] kept browsers unavailable — a conversation\'s browser loses its logins and tabs when it stops: ' + (e && e.message)); }
    // lane grants-unify: the bindings reader the keeper maps a conversation ⇄ its browser key through (read per ask)
    let grantBindings = null; try { grantBindings = require('./browser-bindings').create({ dataDir: path.join(rootDir, 'data') }); } catch (e) { console.warn('[browser] the conversation ⇄ key reader is unavailable — a stopped conversation is judged by its key alone: ' + (e && e.message)); }
    browserKeeper = require('./browser-keeper').create({
      dataDir: path.join(rootDir, 'data'), env: () => agentEnv(), broadcast: (m) => bcastAll(m),
      ...(testEgressMap.size ? { egressResolve: (h) => testEgressMap.get(String(h || '').toLowerCase()) || h } : {}),
      // lane chrome-builds-download: the same HEAVY-GATE aid for the build download's own fetch — a RESERVED `.test` name only
      // (a real host is never in the map), its url fetched over plain http on loopback at the url's own port
      ...(testEgressMap.size ? { chromeBuildsResolve: (u) => { try { const x = new URL(u); const ip = testEgressMap.get(x.hostname.toLowerCase()); return ip ? `http://${ip}:${x.port || 80}${x.pathname}${x.search}` : u; } catch { return u; } } } : {}),
      kept: browserKept, // lane browser-resume (§3.9)
      proxyLogins: browserProxyLogins, // B-8b87: a profile proxy's login — read by the forwarder alone, a use noted
      // lane engine-plugin: THE ENGINE REGISTRY (a manifest plugin with contributes.browserEngine, enabled + trusted + running;
      // a built-in one providing 'browser-engine') + the fleet facts `browser.defaultEngine` reads (presets fleet.json)
      engines: browserEngines,
      fleetFacts: () => { try { return require('./cluster-presets.js').sharedPresets().fleet(); } catch { return null; } },
      engineDistribution: () => engineDistribution, // lane engine-distribution: the kernel downloaded + its version measured once
      vncDisplay: process.env.VIBESPACE_VNC_DISPLAY || ':7', // B-d635: the desktop singleton's display (src/vnc.js VNC_DISPLAY) — the display probe names it, so no surface says "no desktop session" beside it
      serverSetting, serverNotice, getTelemetry,
      userTodos, // lane H verify r5: the ONE For-you notice (origin browser) when a profile's browser keeps closing (the heal budget)
      access: browserAccess, hostKnown: (h) => browserAccess.hostKnown(h),
      integrations: () => integrations, keys: browserBackend, mediator: cdpMediator,
      liveKeys: () => new Set([...activeSessions.values()].map((s) => s && s._browserKey).filter(Boolean)),
      // lane jobs-browser: a RUNNING job carries its browser handle (its lease outlives its owner conversation until the job ends)
      jobName: (jobId) => { try { const jm = getJobs ? getJobs() : null; const j = jm && jm.jobs && typeof jm.jobs.get === 'function' ? jm.jobs.get(String(jobId)) : null; return j ? require('../job-model.js').labelVia(jm)(j) || null : null; } catch { return null; } }, // accept-fixes-strip F8: the live view names a job's tab
      // r3571: while the jobs engine cannot say (absent, not loaded yet, its start failed) or the ask throws, the answer is UNKNOWN and
      // releases nothing — said ONCE a run by its code; the next look once the engine can say judges each handle by facts
      jobRunning: (() => { const said = new Set(), P = require('../browser-job-principal'); const say = (code) => { if (said.has(code)) return; said.add(code); console.warn(`[browser] job handles are kept, none released, while the jobs engine cannot say whether their jobs run (${code}); each is judged once it can`); };
        return (jobId) => { try { const jm = getJobs ? getJobs() : null; const why = P.jobsUnknownCode(jm); if (why) { say(why); return 'unknown'; } return P.jobRunningIn(jm, jobId); } catch { say('jobs_ask_threw'); return 'unknown'; } }; })(),
      settingsHeld: () => (typeof persistenceRouter.settingsHeld === 'function' ? persistenceRouter.settingsHeld() : null),   // B-f276 family unit 2: the CLI pin never computed from an unread setting
      // identity verify r2 (2026-09-28): the keys carried by live sessions on ANOTHER machine (an ssh host / a paired device —
      // rung H): the keeper refuses their `use` / attach (`remote_session`) and never writes them into "Who can use it"
      remoteKeys: () => new Set([...activeSessions.values()].filter((s) => s && s._browserKey && (s.hostId || s.host || s._browserVariant === 'H')).map((s) => s._browserKey)),
      // §3.2.5 row 3: the Task Group this create lands in (spawned-into first,
      // else the earliest bound group naming a default). Belonging is the
      // store's own LIVE rule (`groupsForSession`), asked with the facts a
      // create has: cwd + the dialog's taskId (+ the session key when known).
      taskGroupDefault: ({ cwd = null, hostId = null, initialGroupId = null, initialGroupIds = null, sessionKey = null } = {}) => {
        const tasks = getTasks ? getTasks() : null;
        if (!tasks) return '';
        // THE STORE HELD UNREAD (lane bl-windows — the principal-builder census's second row): the group's default profile is
        // UNKNOWN, never «no group default» — a throw by name; the keeper says it (taskGroupDefaultFor's one warning) and the
        // ladder takes the other rungs (the dialog's explicit pick, the prior profile, the instance default): a REMAINDER, stated in the kb
        if (typeof tasks.isHeldUnread === 'function' && tasks.isHeldUnread()) throw Object.assign(new Error('the Task Group list cannot be read — its default browser profile is unknown'), { code: 'TASK_GROUPS_UNREAD' });
        const groups = tasks.groupsForSession({ sessionKey, cwd, hostId, initialGroupId, initialGroupIds }) || [];
        // lane new-session-form: the FIRST spawned-into group in selection order that names a default (then any group)
        const picked = [...(Array.isArray(initialGroupIds) ? initialGroupIds : []), initialGroupId].filter(Boolean);
        const first = picked.map((id) => groups.find((g) => g.id === id && g.browserProfileId)).find(Boolean) || groups.find((g) => g.browserProfileId);
        return first ? first.browserProfileId : '';
      },
      // MULTIVIEW B-325a (design-browser-multiview): what the keeper may ask
      // about a CONVERSATION — the turn of the live session carrying its key (the
      // release clock). (The Task Group's cap is NOT read here — lane P verify
      // finding 5: it is stamped when the conversation starts, below.)
      // lane P verify r2 (F1): a turn is answered only where the session's mode
      // PUBLISHES one (chat) — a terminal-mode session's `turnOf` is 'idle' by
      // construction, which released its browser (and its helpers') 3 min after
      // the last verb MID-WORK; null = unknown = never released (the CLI's own
      // idle timeout still ends a browser nobody uses). Pinned: test-architecture §57.
      // + the conversation's NAME (the keeper's journal lines and its own refusals; lane browser-windows retired the
      // `browser_busy` refusal that relayed it to another conversation)
      conversationFacts: (bk) => {
        let s = null;
        for (const x of activeSessions.values()) if (x && x._browserKey === bk) { s = x; break; }
        if (!s) return { turn: null, name: null };
        const TF = require('./turn-facts.js');
        return { turn: TF.turnKnown(s) ? TF.turnOf(s) : null, name: String(s.webuiName || s.name || '') || null };
      },
      // MULTIVIEW D4 (lane P verify, finding 5): the Task Group's default per-conversation cap for a CREATE —
      // B-55dc: the deciding door's first reads for a create's facts — ws-create awaits them before the two reads here
      taskGroupRead: ({ cwd = null, hostId = null, initialGroupId = null, initialGroupIds = null, sessionKey = null } = {}) => {
        const tasks = getTasks ? getTasks() : null;
        return tasks && typeof tasks.membershipRead === 'function' ? tasks.membershipRead({ sessionKey, cwd, hostId, initialGroupId, initialGroupIds }) : null;
      },
      // the same belonging rule and facts as the pin's rung above; ws-create stamps it once per conversation
      taskGroupCap: ({ cwd = null, hostId = null, initialGroupId = null, initialGroupIds = null, sessionKey = null } = {}) => {
        const tasks = getTasks ? getTasks() : null;
        if (!tasks) return null;
        const a = { sessionKey, cwd, hostId, initialGroupId, initialGroupIds };
        const ids = grantMemberIds(tasks, a);   // the follow-owed unit: a HELD store throws by name here — the cap is UNKNOWN (the keeper stamps it at the read), never «none in force»
        if (ids.unread) throw Object.assign(new Error('the Task Group list is still being read'), { code: 'TASK_GROUPS_UNREAD' });   // B-55dc: a reply still being read is unknown too — the keeper waits for its landing
        const groups = tasks.groupsForSession(a) || [];
        const picked = [...(Array.isArray(initialGroupIds) ? initialGroupIds : []), initialGroupId].filter(Boolean);
        const first = picked.map((id) => groups.find((g) => g.id === id && Number.isInteger(g.browserCap))).find(Boolean) || groups.find((g) => Number.isInteger(g.browserCap));
        return first ? first.browserCap : null;
      },
      // "Who can use it" is a LIST (2026-09-27): the Task Groups the conversation carrying a browser key belongs to NOW —
      // the store's own live rule over the live session; a store read that THROWS is `unreadable`, never "no groups" (the
      // re-judge keeps that lease, the PATCH says undecided). A key NO live session carries is `live: false` — a STOPPED
      // conversation's membership cannot be read through the live rule, and it is not "no groups" either (verify
      // 2026-09-28: read as "no groups", a WIDENING detached a stopped member of the listed Task Group — its tab in the
      // shared browser closed for a change that kept it); the keeper judges it at its next command instead
      groupLineageOf: (ids) => { const tasks = getTasks ? getTasks() : null; if (!tasks) throw new Error('the Task Group store is not ready'); return tasks.grantGroupsOf(ids).inherited; },   // lane lg-group-parents U3b: the ONE reader · the restack's cure: no store ⇒ unknown (the keeper's lineOf), never «no parents»   // lane lg-group-parents U3b: the ONE reader
      groupNameOf: (id) => { const tasks = getTasks ? getTasks() : null; return tasks ? tasks.lineageNameOf(id) : null; },   // the chain's cure (B): the name door of the lineage words
      taskIdsForKey: (bk) => {
        const tasks = getTasks ? getTasks() : null;
        if (!tasks) return { ids: [], unreadable: false };
        let hit = null, hitId = null;
        for (const [id, x] of activeSessions) if (x && x._browserKey === bk) { hit = x; hitId = id; break; }
        if (!hit) return { ids: [], unreadable: false, live: false };
        try {
          const key = sessionStatusKey ? sessionStatusKey(hit, hitId) : null;
          const ids = grantMemberIds(tasks, { sessionKey: key, cwd: hit.cwd, hostId: hit.host || null, initialGroupId: hit._initialGroupId, initialGroupIds: hit._initialGroupIds }, 'browser-key');   // a HELD store throws: unreadable (lane bl-windows)
          // B-55dc: an answer still being read is UNREADABLE here — the keeper then KEEPS a lease (undecided) and refuses a new one
          return { ids: [...ids], unreadable: !!ids.unread };
        } catch (e) { if (!(e && e.code === 'TASK_GROUPS_UNREAD') || e.firstOfHold) console.warn(`[browser] the Task Group list could not be read for ${bk} — ${e && e.message}`); return { ids: [], unreadable: true }; }   // a held store: one line a hold (lane bl-windows)
      },
      // lane grants-unify: "Who can use it" names a conversation by its CONVERSATION id in the ONE grants store — a browser
      // key → the keys its conversation answers to (the live session carrying it: its own id, a pending fork's webui key;
      // stopped: the id its binding holds), and a conversation → its browser key (the panel speaks keys)
      conversationKeysForKey: (bk) => {
        for (const [id, x] of activeSessions) if (x && x._browserKey === bk) { const cid = require('../claude-lock-capture.js').addressableId(x); return { keys: cid ? [String(cid), `webui:${id}`] : [`webui:${id}`], live: true }; }
        let cid = ''; try { cid = grantBindings ? grantBindings.conversationOf(bk) || '' : ''; } catch { cid = ''; }
        return { keys: cid ? [cid] : [], live: false };
      },
      browserKeyForConversation: (cid) => {
        for (const [id, x] of activeSessions) { if (!x || !x._browserKey) continue; const own = require('../claude-lock-capture.js').addressableId(x); if ((own && String(own) === cid) || `webui:${id}` === cid) return x._browserKey; }
        try { return grantBindings ? grantBindings.lookup(cid) || null : null; } catch { return null; }
      },
      // one Task Group's facts (null = the store no longer lists it) — the write's unknown_task and the panel's words
      taskInfo: (id) => {
        const tasks = getTasks ? getTasks() : null;
        if (!tasks) return null;
        { const held = typeof tasks.unreadRefusal === 'function' ? tasks.unreadRefusal('a Task Group row') : null; if (held) { const e = new Error(held); e.code = 'TASK_GROUPS_UNREAD'; throw e; } }   // THE STORE HELD UNREAD (lane bl-windows): the hold's words, never «that group no longer exists»
        try { const t = tasks.get(String(id)); return t ? { title: String(t.title || ''), archived: !!t.archived } : null; }
        catch (e) { if (/not found/i.test(String(e && e.message))) return null; throw e; }
      },
    });
    // lane browser-recipes: ONE display probe at boot — the first session's tools intro says "no display" on a pod
    try { browserKeeper.machineDisplayCached(); } catch { /* the intro then says nothing about the display */ }
    const taskIdsFor = (s, id) => {
      const tasks = getTasks ? getTasks() : null;
      if (!tasks || !s) return [];
      const key = sessionStatusKey ? sessionStatusKey(s, id) : null;
      return grantMemberIds(tasks, { sessionKey: key, cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }, 'browser');   // a HELD store throws: its callers say groupsUnreadable; B-55dc's flag rides the ids (lane bl-windows seam)
    };
    let browserEnvMemo;
    // the pin route re-points a RUNNING session's indirection through the
    // same module ws-create resolves it with (file-based, so a second
    // instance reads the same objects); B-f7ab's late key composes through it too
    const browserEnvFn = () => {
      if (browserEnvMemo !== undefined) return browserEnvMemo;
      try { browserEnvMemo = require('./browser-env').create({ dataDir: path.join(rootDir, 'data'), serverSetting, settingsHeld: () => (typeof persistenceRouter.settingsHeld === 'function' ? persistenceRouter.settingsHeld() : null), serverNotice: null, telemetry: null, keptKeys: () => (browserKept ? browserKept.keyVerdict() : undefined), keptNoted: () => (browserKept ? browserKept.notedKeys() : undefined), keptReady: () => (browserKept ? browserKept.reconciled() : Promise.resolve({ done: true, code: null })) }); }   // r3786 (LAW 4): the kept store's own verdict
      catch (e) { console.warn('[browser] pin re-point unavailable — ' + (e && e.message)); browserEnvMemo = null; }
      return browserEnvMemo;
    };
    // B-f7ab: a live session with no browser key YET gets one on its first browser use — the spawn's mint, env and pin
    // ladder (src/server/browser-key.js); the binding rides THE meta choke point (persistSessionMeta → writeSessionMeta)
    browserKeys = require('./browser-key').create({
      browserEnv: browserEnvFn, keeper: () => browserKeeper, activeSessions,
      integrationEnabled: () => (typeof integrationEnabled === 'function' ? integrationEnabled() : true),
      readMeta: (session) => (typeof readSessionMetaOf === 'function' ? readSessionMetaOf(session) : null),
      persistMeta: (session, patch) => { if (persistSessionMeta && session) persistSessionMeta(session, patch); },
      onLiveFactsChanged: () => { try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] live facts not re-published — ' + (e && e.message)); } },
    });
    if (vaultPaste && typeof vaultPaste.setLoginChannel === 'function' && browserKeeper && typeof browserKeeper.loginChannelFor === 'function') {
      vaultPaste.setLoginChannel(({ caller = {}, handle = '' } = {}) => {
        const B = require('../browser-profiles.js');
        const { addressableId } = require('../claude-lock-capture.js');
        let sid = null, s = null;
        if (caller && caller.scope && activeSessions.has(caller.scope)) {
          sid = caller.scope;
          s = activeSessions.get(sid);
        } else if (caller && (caller.scope || caller.conversationId)) {
          for (const [id, x] of activeSessions) {
            if (!x) continue;
            if (caller.scope && String(x._webuiId || id) === String(caller.scope)) { sid = id; s = x; break; }
            if (caller.conversationId && String(addressableId(x) || '') === String(caller.conversationId)) { sid = id; s = x; break; }
          }
        }
        const remoteSession = !!(s && (s.hostId || s.host || s._browserVariant === B.VARIANTS.H));
        let bk = s && B.isBrowserKey(s._browserKey) ? s._browserKey : '';
        if (!bk && s && !remoteSession && browserKeys && typeof browserKeys.ensureBrowserKey === 'function') {
          try {
            const r = browserKeys.ensureBrowserKey(s, { sessionId: sid });
            const k2 = r && typeof r === 'object' ? r.key : r;
            if (B.isBrowserKey(k2)) bk = k2;
          } catch { /* remote or unavailable */ }
        }
        let taskIds = [], groupsUnreadable = false;
        if (s) {
          try { taskIds = taskIdsFor(s, sid); if (taskIds.unread) groupsUnreadable = true; } catch { taskIds = []; groupsUnreadable = true; }
        }
        const cid = s ? addressableId(s) : (caller && caller.conversationId ? caller.conversationId : null);
        const conversationKeys = [...new Set([...(cid ? [String(cid)] : []), ...(sid ? [`webui:${sid}`] : []), ...(bk ? [String(bk)] : [])])];
        const subagent = !!(s && s._subNormalizers && s._subNormalizers.size > 0);
        return browserKeeper.loginChannelFor({
          browserKey: bk,
          handle: String(handle || ''),
          subagent,
          remoteSession,
          action: 'request',
          agentFacts: { browserKey: bk, taskIds, groupsUnreadable, conversationKeys },
        });
      });
    }
    const { router: browserRouter, setup: setupBrowserRoutes } = require('../routes/browser');
    // lane browser-stuck (2026-09-28): THE DIALOG WATCH — one Page-enabled CDP socket per live local browser, armed before
    // a verb runs; a page dialog becomes a fact of the agent's verb, the live view and the browser fact (src/server/browser-dialogs.js)
    try {
      // the .197 integration (browse-yourself × browser-stuck): the USER browsing a profile himself is a holder of its browser
      // too — his row (no session: never told, never woken) makes the browser SHARED, so a conversation whose tab the watch
      // cannot attribute is told of no dialog (a dialog on HIS tab is his), and while he drives an alert is held for him
      const holdersOf = require('./browser-dialogs').holdersOfKeeper(() => browserKeeper); // lane passkey-browse-yourself r4: THE ONE composer of the holder rows (his row once, flagged — r2–r3's inline copy dropped the flag on the keeper's own copy of his row and appended it again: his browsing never got his watch; live ⑪ a2 / g on real Chrome)
      // B-ebb7 (its verdict's should): ONE predicate for the watch's own items (sweep and sweepAs read it — never two copies)
      const browserItemIds = (prefix) => userTodos.idsWhere((i) => i.status === 'open' && i.sessionKey === 'browser' && typeof i.itemKey === 'string' && i.itemKey.startsWith(String(prefix)));
      browserDialogs = require('./browser-dialogs').create({
        keeper: browserKeeper, holdersOf,
        vaultUse: (entry, use, o) => vault.noteUse(entry, use, o), // lane passkey-sink: a kernel's passkey signature / new key is a USE of the passkeys' key (purpose + receipt — the use law's ONE writer)
        logins: browserLogins, conversationOf: (sid) => { const s = activeSessions.get(sid); return s ? { cid: require('../claude-lock-capture.js').addressableId(s) || null, name: String(s.webuiName || s.name || '').slice(0, 80) || null } : null; }, // lane browser-login: the web logins' ONE writer + the conversation a submission is told for
        downloadsDirOf: () => path.join(os.homedir(), 'Downloads'), // lane browser-surfaces: a kernel's file picker is handed files from the browser's downloads directory only (Chrome's own default, the CLI's own write place)
        // lane browser-passkey: ONE For-you item per (profile, rpId) while a page waits for a passkey > 20 s — resolved when it ends
        forYou: {
          add: (profileId, item) => { if (!userTodos) return null; const r = userTodos.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Agent browser', ...item }); return r && (r.id || (typeof r === 'string' ? r : null)); },
          resolve: (id) => { if (userTodos && userTodos.get(id)?.status === 'open') userTodos.setStatus(id, 'done', 'browser'); },
          sweep: (prefix) => { if (!userTodos || typeof userTodos.idsWhere !== 'function') return 0; const ids = browserItemIds(prefix); for (const id of ids) userTodos.setStatus(id, 'done', 'browser'); return ids.length; }, // B-97ae round 2: the watch's items of a past hub life (an item whose tab this hub does not hold is not kept)
          ended: (id, fact) => { if (userTodos && typeof userTodos.noteFact === 'function') userTodos.noteFact(id, fact); }, // lane passkey-browse-yourself r10: a card's «Allow once» taken back by a later answer — the record carries the end
          sweepAs: (prefix, status, by) => { if (!userTodos || typeof userTodos.idsWhere !== 'function') return 0; const ids = browserItemIds(prefix); for (const id of ids) userTodos.setStatus(id, status, by); return ids.length; }, // B-ebb7: the sweep with its close named — a past life's sign-in ask «dismissed · hub-restart», never «done»
          // B-44f3: the store held unread — the watch's boot sweeps wait for its read (the held list is empty: a sweep now closes nothing)
          isHeldUnread: () => !!(userTodos && typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread()),
          whenRead: (fn, label) => { if (userTodos && typeof userTodos.whenRead === 'function') userTodos.whenRead(fn, label); else fn(); }
        },
        // lane passkey-store-core: THE PASSKEY STORE — data/browser-passkeys.json (0600, written only by the watch) + the
        // per-instance key file data/browser-passkeys.key (0600, made once; B-4a59(b)'s keyring replaces this pair)
        passkeys: require('./browser-passkey-file.js').passkeyFileStore({ dataDir: path.join(rootDir, 'data') }),   // r3261: the store's file and key, ONE object production and its legs build
        leaseCountOf: (profileId) => new Set(holdersOf(profileId).map((h) => h.browserKey)).size,
        labelOf: (profileId) => { try { const p = browserKeeper.profile(profileId); return p ? p.label : null; } catch { return null; } },
        // rule 6: a dialog that opened while the conversation ran no browser verb ⇒ ONE free next-turn line (never a wake)
        // verify r1: ONE pending dialog notice per conversation (`replaceKind` — a page answered ten times queued ten and
        // evicted the takeover notice), withdrawn when its dialog closes before the agent's turn
        notice: (sessionId, n) => { const st = getSessionStatus ? getSessionStatus() : null; const s = activeSessions.get(sessionId); if (st && sessionStatusKey && s) st.pushNotice(sessionStatusKey(s, sessionId), n, { replaceKind: true }); },
        withdraw: (sessionId, dialogId) => { const st = getSessionStatus ? getSessionStatus() : null; const s = activeSessions.get(sessionId); if (st && sessionStatusKey && s && typeof st.dropNotices === 'function') st.dropNotices(sessionStatusKey(s, sessionId), (x) => x && x.kind === 'browser-dialog' && x.dialog && x.dialog.id === dialogId); },
      });
      browserKeeper.setStuckSource((bk, pid) => browserDialogs.stuckForKey(bk, pid ? { profileId: pid } : undefined)); // lane browsers-stop: the stop asks about ONE browser
      browserKeeper.setPasskeyDrop?.((pid) => browserDialogs.dropPasskeys(pid)); // lane passkey-store-core: a removed profile's keys go with it
      if (typeof vault.onLock === 'function') vault.onLock(() => { try { browserDialogs.endScrubWorkers('a lock'); } catch { /* the watch's own */ } });   // 主开发 r2445 law 4 (lane lg-vault-file): the frame scrub's workers end at a lock, their copy of the values with them
      browserKeeper.setPasskeyHeld?.(() => (typeof browserDialogs.passkeysHeld === 'function' ? browserDialogs.passkeysHeld() : null)); // r3261: a profile's removal asks whether the passkey store is held
      browserKeeper.setPaintWatch?.(browserDialogs); // lane browser-swiftshader-cpu: idle paint stops on the watch's own socket
      // verify r1 (site-reset): a holder's tabs the KEEPER can attribute (its pinned tab, its mediated lease's tabs, the user's
      // own + adopted ones) — the watch's `tabsOf` from here on; the stream bridge below UNIONS its live view's active target
      // (before, only the bridge answered: a shared browser with no live view open attributed nothing, and a conversation's
      // direct `stop` reached every tab of it)
      browserDialogs.setTabsOf((q) => { try { return browserKeeper.holderTabs(q && q.profileId, q && q.browserKey) || []; } catch { return []; } });
      // the Agent browser panel's row: the digest carries `pageStuck` (kinds only), re-broadcast when a dialog / verdict moves
      // NAMED profiles only: the digest also reaches agents, and another conversation's ephemeral record is never named to them
      browserKeeper.addDigest(() => ({ pageStuck: Object.fromEntries(Object.entries(browserDialogs.pageStuckMap()).filter(([pid]) => { try { return !browserKeeper.isEphemeral(pid); } catch { return false; } })) }));
      // lane passkey-ui: each NAMED profile's passkey COUNT (the panel's "Passkeys (n)…"; counts only — never a row)
      browserKeeper.addDigest(() => { const c = typeof browserDialogs.passkeyCounts === 'function' ? browserDialogs.passkeyCounts() : {}; return c === null ? { passkeyCounts: null, passkeysHeld: true } : { passkeyCounts: Object.fromEntries(Object.entries(c).filter(([pid]) => { try { return !browserKeeper.isEphemeral(pid); } catch { return false; } })) }; });   // r3261: the passkey store HELD ⇒ the count is unknown (the panel says «Passkeys…», never «(0)»)
      let digestTimer = null;
      browserDialogs.onChange((ev) => {
        // lane passkey-store-core: every ceremony = one trace row on its conversation's live view (the stream mirror's shape)
        if (ev && ev.kind === 'passkey-trace' && ev.owner) { const h = holdersOf(ev.profileId).find((x) => x.browserKey === ev.owner && x.sessionId); if (h) browserStream?.tapDialogAct?.({ sessionId: h.sessionId, profileId: ev.profileId, action: 'passkey', passkey: ev.act }); }
        // lane passkey-ui: a passkey card (new / decided) = ONE chat card in its conversation (the SAME card as the tray's) +
        // a broadcast the live banner and the panel's table read; a table change re-reads an open table
        if (ev && ev.kind === 'passkey-proposal' && ev.card) {
          const sid = ev.sessionId || (holdersOf(ev.profileId).find((x) => x.sessionId && String(x.browserKey || '').replace(/\.\d+$/, '') === String(ev.browserKey || '')) || {}).sessionId;
          const s = sid && activeSessions ? activeSessions.get(sid) : null;
          if (s) { try { require('../normalizers').feedProposalCard(s, ev.block); } catch (e) { console.warn('[browser-dialog] the passkey card was not put in the chat — ' + (e && e.message)); } }
          try { bcastAll({ type: 'browser-passkey-card', profileId: ev.profileId, card: ev.card }); } catch { /* the broadcast's own failure */ }
        }
        if (ev && ev.kind === 'passkeys') { try { bcastAll({ type: 'browser-passkeys-updated', profileId: ev.profileId }); } catch { /* the broadcast's own failure */ } }
        if (!ev || !['open', 'closed', 'passkeys', 'stuck', 'held', 'held-cleared', 'down', 'loop', 'loop-cleared', 'passkey', 'prompt'].includes(ev.kind) || digestTimer) return; // lane passkey-ui: + 'passkeys' (the menu's count) // lane site-reset: + a navigation loop begun / ended
        digestTimer = setTimeout(() => { digestTimer = null; try { bcastAll({ type: 'browser-profiles-updated', ...browserKeeper.list() }); } catch (e) { console.warn('[browser-dialog] the digest was not re-published — ' + (e && e.message)); } }, 300);
        if (digestTimer.unref) digestTimer.unref();
      });
    } catch (e) { browserDialogs = null; console.warn('[browser-dialog] the dialog watch is unavailable — ' + (e && e.message)); }
    // lane jobs-browser: a job's facts — the engine, the owner conversation's recorded key (a stopped one), its Task Groups
    let jobBindings = null; try { jobBindings = require('./browser-bindings').create({ dataDir: path.join(rootDir, 'data') }); } catch (e) { console.warn('[browser] the job → conversation key reader is unavailable — a job of a stopped conversation is refused no_browser_key: ' + (e && e.message)); }
    setupBrowserRoutes({
      keeper: browserKeeper, activeSessions,
      logins: browserLogins, // lane browser-login: the owner's save-login card's door
      getJobs: () => (getJobs ? getJobs() : null),
      bindingsLookup: (cid) => (jobBindings ? jobBindings.lookup(cid) : ''),
      tasksForConversation: (cid) => { const tasks = getTasks ? getTasks() : null; return tasks ? tasks.groupIdsForGrant({ sessionKey: cid }) : []; },   // a HELD store throws: the job's caller says groupsUnreadable (lane bl-windows)
      dialogs: browserDialogs,
      // lane browser-propose step 3: the proposal runner (created below, after the handback announcer it tells through) —
      // the routes reach it through this delegate: a claim's card + item, the user's Approve / Reject, a rejection told once
      proposals: {
        filed: (r) => browserProposals?.filed(r),
        approve: (id, o) => (browserProposals ? browserProposals.approve(id, o) : { ok: false, code: 'unavailable', error: 'browser proposals are not available on this server' }),
        reject: (id, o) => (browserProposals ? browserProposals.reject(id, o) : { ok: false, code: 'unavailable', error: 'browser proposals are not available on this server' }),
        rejectionFor: (q) => (browserProposals ? browserProposals.rejectionFor(q) : null),
      },
      // lane site-reset step 3: the agent's `site-reset <host>` on a SHARED profile files ONE proposal (the keeper's record,
      // the same card / For-you item / routes as a switch proposal) — never run by the agent
      siteResets: {
        propose: ({ f, t, host, url = '' }) => (browserProposals ? browserProposals.fileSiteReset({ profileId: t.profileId, host, url, browserKey: f.browserKey, sessionId: f.sessionId }) : null),
      },
      // lane browser-stuck: the agent's `dialog accept|dismiss` is a page act on the trace like any other (the stream mirror's own shape)
      traceDialogAct: (act) => browserStream?.tapDialogAct?.(act),
      // lane launch-picture-size: a conversation's FIXED picture size (the agent's `size`, the user's Pin size… in the live window)
      browserFixed: (q) => (browserStream && typeof browserStream.setFixed === 'function' ? browserStream.setFixed(q) : { ok: false, code: 'unavailable', error: 'the live view is not available on this server' }),
      // lane browser-viewport-answer: a pin rules an agent's raw `set viewport|device` (judged before it runs); the set answers with the page's size + one trace row
      browserViewport: {
        ruling: (q) => (browserStream && typeof browserStream.viewportRuling === 'function' ? browserStream.viewportRuling(q) : null),
        answer: (q) => (browserStream && typeof browserStream.agentViewport === 'function' ? browserStream.agentViewport(q) : null),
      },
      // the agent's `new --adopt <dir>` may register a directory ONLY under these roots (browser-profiles.adoptDirVerdict)
      adoptRoots: { homeDir: os.homedir(), dataDir: path.join(rootDir, 'data') },
      // P4: the providers route's live CDP forwards
      forwards: () => browserAccess.forwards(),
      // P4 second half (§7.4): a switch PROPOSAL (another session holds a lease, or somebody drives the browser) is ONE
      // "For you" item to the owner — zero billed turns, the inbox is the channel
      propose: (sessionId, session, { text, detail, by = 'agent' } = {}) => {
        if (!userTodos || !sessionStatusKey) return null;
        return userTodos.add(sessionStatusKey(session, sessionId), { origin: 'browser', text, detail, urgency: 'normal', by, sessionName: session && (session.name || session.webuiName) || null }); // origin: the BROWSER routes' switch proposal (this file only wires them)
      },
      tasksForSession: (s, id) => taskIdsFor(s, id),
      lineageOf: (ids) => { const tasks = getTasks ? getTasks() : null; if (!tasks) throw new Error('the Task Group store is not ready'); return tasks.grantGroupsOf(ids).inherited; },   // lane lg-group-parents U3b: the routes' direct judgements · the restack's cure: no store ⇒ unknown (the routes' groupsUnreadable), never «no parents»   // lane lg-group-parents U3b: the routes' direct judgements
      groupNameOf: (id) => { const tasks = getTasks ? getTasks() : null; return tasks ? tasks.lineageNameOf(id) : null; },   // the chain's cure (B)
      // §3.8 layer ②: a USER's pin/attach/detach queues one typed notice that
      // rides the user's own next message (zero billed turns); the queue is
      // session-status's, keyed the way the prompt-context route drains it
      notice: (sessionId, session, n) => {
        const st = getSessionStatus ? getSessionStatus() : null;
        if (!st || !sessionStatusKey) return;
        st.pushNotice(sessionStatusKey(session, sessionId), n);
      },
      // the pin outlives a restart: it rides the session's meta like the effort origin does
      persistPin: (session, profileId, origin) => { if (persistSessionMeta && session) persistSessionMeta(session, { browserProfileId: profileId || undefined, browserPinOrigin: origin || undefined }); },
      // P2 (§3.8 ③): the profile the agent LAST USED rides the meta (a restart keeps the chip honest) and re-publishes the live facts (the chip gates on its own digest)
      persistActive: (session, v) => { if (persistSessionMeta && session) persistSessionMeta(session, { browserProfileActive: v === null || v === undefined ? undefined : String(v) }); },
      // lane H: re-run the ONE meta choke point (its binding hook + belts) when an ephemeral browser starts — a missing conversation → key binding is written by the same rule, never a second one
      ensureBinding: (session) => { if (rebindSessionMeta && session) rebindSessionMeta(session); },
      // MULTIVIEW D4: the conversation's explicit browser cap rides the meta (the properties row + a restart); the keeper keeps the conversation-level fact
      persistCap: (session, v) => { if (persistSessionMeta && session) persistSessionMeta(session, { browserCap: Number.isInteger(v) ? v : undefined }); },
      onLiveFactsChanged: () => { try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] live facts not re-published — ' + (e && e.message)); } },
      browserEnv: browserEnvFn,
      // B-f7ab: THE late key — every route that reads a session's browser key asks it for a session that has none
      ensureBrowserKey: (session, o) => browserKeys.ensureBrowserKey(session, o),
      // lane browser-resume B: "Hand back and continue" — the handback announcer's stash + card half (built below: read lazily)
      continueHandBack: (args) => (browserHandback && typeof browserHandback.continueFor === 'function' ? browserHandback.continueFor(args) : Promise.resolve({ ok: false, code: 'unavailable', error: 'the handback announcer is not available on this server' })),
    });
    app.use(browserRouter);
    // lane H (2026-09-25): the session card's + status chip's `browserLive` fact moves when a browser STARTS or
    // STOPS (a managed ephemeral one included) — re-publish the live facts, debounced; never holds a verb (no promise)
    {
      let factsTimer = null;
      const MOVES = new Set(['browser-ready', 'browser-stopped', 'attach', 'detach', 'lease-dropped']);
      browserKeeper.onLease((ev) => {
        if (!ev || !MOVES.has(ev.kind) || factsTimer) return null;
        factsTimer = setTimeout(() => { factsTimer = null; try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] live facts not re-published — ' + (e && e.message)); } }, 300);
        if (factsTimer.unref) factsTimer.unref();
        return null;
      });
    }
    // lane browser-display-holders (the owner 2026-10-25): the PERSON stopped a browser's display window — each conversation
    // holding that profile hears it ONCE at its next message (layer ②, zero billed turns; a second stop before it reads the
    // first replaces it): «the person stopped the browser "<label>"; your next browser command starts it again»
    browserKeeper.onLease((ev) => {
      if (!ev || ev.kind !== 'browser-user-stopped' || !Array.isArray(ev.holders)) return null;
      const st = getSessionStatus ? getSessionStatus() : null;
      if (!st || !sessionStatusKey) return null;
      const n = require('../browser-profiles.js').userStoppedNotice({ label: ev.label, profileId: ev.profileId, at: Date.now() });
      for (const h of ev.holders) {
        const s = h && h.sessionId ? activeSessions.get(h.sessionId) : null;
        if (!s) continue; // a stopped conversation: its next command says browser_stopped itself
        try { const key = sessionStatusKey(s, h.sessionId); st.dropNotices(key, (x) => x && x.kind === 'browser-profile' && x.event === 'user-stopped' && x.profileId === ev.profileId); st.pushNotice(key, n); } catch (e) { console.warn('[browser] the person\'s stop was not told to ' + h.sessionId + ' — ' + (e && e.message)); }
      }
      return null;
    });
    // lane S2 (naive study 2 — three answers to "which browser"): THE browser fact of each live conversation is
    // computed at ONE choke point (keeper.factFor over its registry view) and published as active-sessions'
    // `browserFact`. Any registry change (a start, a failure, a pin, a removal, a label, a lease) may move it — the
    // facts are re-computed (debounced, never on a verb's path) and active-sessions is re-published ONLY when a
    // conversation's fact digest moved (the ONE dirty signal = one computation rule)
    {
      const BFm = require('../browser-fact.js');
      const lastFactDigest = new Map();
      let factTimer = null;
      const republishIfMoved = () => {
        factTimer = null;
        let moved = false;
        for (const [id, s] of activeSessions) {
          if (!s || !s._browserKey) continue;
          let d = '';
          try { d = BFm.factDigest(browserKeeper.factFor(BFm.sessionFactsOf(s))); } catch { d = ''; }
          if (lastFactDigest.get(id) !== d) { lastFactDigest.set(id, d); moved = true; }
        }
        for (const id of [...lastFactDigest.keys()]) if (!activeSessions.has(id)) lastFactDigest.delete(id);
        if (moved) { try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] browser facts not re-published — ' + (e && e.message)); } }
      };
      const kickFacts = () => { if (factTimer) return; factTimer = setTimeout(republishIfMoved, 250); if (factTimer.unref) factTimer.unref(); };
      browserKeeper.onChange(kickFacts);
      browserDialogs?.onChange(kickFacts); // lane browser-stuck: a dialog opening / closing / an unresponsive verdict moves the fact (the chip)
    }
    // P3 (§4.3.1): the handback announcer — hangs on the keeper's input/confirmation
    // seams; an explicit handback is delivered through the gated ladder under
    // 'browser-handback', an idle one files one inbox item and queues the
    // zero-spend notice unless browser.announceIdleHandback says otherwise
    try {
      browserHandback = require('./browser-handback').create({
        keeper: browserKeeper, deliver, serverSetting, userTodos, activeSessions,
        sessionKeyFor: (s, id) => (sessionStatusKey ? sessionStatusKey(s, id) : null),
        notice: (sessionId, session, n) => { const st = getSessionStatus ? getSessionStatus() : null; if (st && sessionStatusKey) st.pushNotice(sessionStatusKey(session, sessionId), n); },
        // the owner's ruling (2026-09-27): the takeover's card is shown in the live session's chat — display only, the auto-resume notice's own path
        emitCard: (session, card) => require('../normalizers').feedPeerCard(session, card),
        onLiveFactsChanged: () => { try { broadcastActiveSessions?.(); } catch (e) { console.warn('[browser] live facts not re-published — ' + (e && e.message)); } },
        // lane J r2: pending approvals for a browser page command go STALE at the takeover / handback (answered browser_paused through THE one permission answer)
        approvals: (() => {
          const N = require('../normalizers');
          // lane S1 verify r3: the sweep's deny is a LOOKUP into the ask's transition table like every other
          // answer (helper-asks.answerFrame → answerVerdict → THE one permission answer); r4: `pendingHelpers`
          // = the helpers' asks too (judged by the browser THEIR commands land on — browser-handback)
          const HA = require('./helper-asks');
          return {
            pending: (session) => N.pendingPermissions(session),
            pendingHelpers: (session) => N.pendingHelperApprovals(session),
            answer: (sessionId, _session, data) => HA.answerFrame({ ...data, sessionId }, { activeSessions, adapterRegistry, feedLive: N.feedLive }, { serverDeny: true }),
            note: (session, requestId, staleBy) => N.notePermissionStale(session, requestId, staleBy),
          };
        })(),
      });
      browserHandback.install();
    } catch (e) { console.warn('[browser] handback announcer unavailable — ' + (e && e.message)); }
    // lane browser-propose step 3 (the owner, 2026-09-30: the agent PROPOSES the switch, the user approves with one click):
    // a tier-2 claim's ONE card (in the chat, patched in place) + ONE For-you item; the user's Approve runs exactly the
    // frozen proposal (a site reset; a backend switch is unavailable in this version) — and the agent is told through the
    // handback's ONE ladder site, for free (never a wake)
    try {
      const N = require('../normalizers');
      browserProposals = require('./browser-propose').create({
        keeper: browserKeeper, activeSessions, userTodos, serverSetting,
        sessionKeyFor: (s, id) => (sessionStatusKey ? sessionStatusKey(s, id) : null),
        feedCard: (session, block) => N.feedProposalCard(session, block),
        patchSettings: (patch) => persistenceRouter.patchSettings(patch),
        tell: ({ sessionId, browserKey, text, pressed }) => (browserHandback ? browserHandback.tellProposal({ sessionId, browserKey, text, pressed }) : { told: 'failed' }),   // lane owner-press-attended r3: + the Approve's press
        pinConversation: ({ sessionId, profileId }) => {
          const RB = require('../routes/browser');
          const f = RB.sessionFacts(sessionId);
          if (!f || !f.browserKey) throw Object.assign(new Error('the conversation is not running any more'), { code: 'session-gone' });
          return RB.pinAnswer(browserKeeper, f, profileId, { by: 'user', quiet: true }); // the user's pin; the approved message is its telling
        },
        broadcast: (m) => bcastAll(m),
        // lane site-reset: the Approve of a site-reset proposal clears through the dialog watch's own socket — the profile's
        // browser started first when it does not run (a profile's cookies live in its running Chrome's store)
        clearSite: require('./browser-propose').siteResetClearer({ dialogs: browserDialogs, keeper: browserKeeper }),
      });
      // the chat's card source: a rebuild / a view-only history places each proposal card by time (the bindings name a
      // stopped conversation's key)
      let pBindings = null; try { pBindings = require('./browser-bindings').create({ dataDir: path.join(rootDir, 'data') }); } catch { pBindings = null; }
      N.setProposalCardSource(require('./browser-propose').cardSource({ proposals: browserProposals, dialogs: browserDialogs, bindings: pBindings }));   // int258: + the passkey cards
    } catch (e) { browserProposals = null; console.warn('[browser] proposal runner unavailable — ' + (e && e.message)); }
  } catch (e) { console.warn('[browser] profile keeper unavailable — ' + (e && e.message)); }
  /** §3.5's boot path — server.js calls it right AFTER restoreSessions() so
   *  the live-key set is final: every persisted lease nobody carries is
   *  dropped, THEN every recorded browser is judged (adopted by pid+starttime
   *  or recorded ended), THEN the tick may start. Async and off the boot
   *  path: a failure is logged, never thrown into the boot. */
  function bootBrowserKeeper(after = null) {
    if (!browserKeeper) return;
    try {
      // lane engine-spi-egress L3 round 3: a boot migration that marks records for THIS boot (the one that moves the removed anti-bot
      // backend's records — STEPPED when its proof's hash streams) is waited for first: the order law — nothing is adopted before it judged
      let gate = null; try { gate = require('./migrations.js').beforeBrowserBoot(); } catch { gate = null; }
      // B-f276 r3 (S7): a restored conversation's owed pin — owed BEFORE the boot (judged first in it, the registry loaded after the gate)
      queueMicrotask(() => { try { for (const [, s] of activeSessions) if (s && s._browserKey && s._browserPinOwed) browserKeeper.owePin?.(s._browserKey, { ...s._browserPinOwed, restored: true }); } catch (e) { console.warn('[browser] restored owed pins —', e && e.message); } });   // after the hook below, before the boot
      let heldBoot = false;
      Promise.resolve(gate).catch(() => null).then(() => browserKeeper.boot())
        .then((r) => { if (r && r.held) { heldBoot = true; console.warn('[browser] boot: the profile registry is held — the steps after the boot run once it reads'); try { browserKeeper.onReadAgain?.(() => afterBoot()); } catch { } return; } if (r && (r.droppedLeases || r.browsers)) console.log(`[browser] boot: ${r.droppedLeases} orphaned lease(s) dropped, ${r.browsers} browser(s) adopted`); })
        .catch((e) => console.warn('[browser] boot reconciliation failed:', e && e.message))
        .then(() => { if (!heldBoot) return afterBoot(); });
      // the B-f276 remainder (bl-jobs): the steps after the keeper's boot — run once it judged its registry; on a HELD registry they
      // wait for its read (each read the held, EMPTY registry as «gone»: a pin cleared, a kept folder removed, a trace session ended)
      // the B-f276 remainder, its read r2 (M3 / N11): a pin a create OWED to the held registry's read is judged in the keeper, keyed by
      // the conversation's browser key — the live session holding that key takes it as its copy (the chip, Session properties) and
      // its record says it (the facts it owed cleared); a conversation restored by a restart before the read owes it again (its record
      // carries the facts — owed before the keeper's boot, above): judged first in the boot when the registry reads, else at its read
      try {
        browserKeeper.onOwedPin?.((key, res) => {
          for (const [, s] of activeSessions) {
            if (!s || s._browserKey !== key) continue;
            const p = res && res.pin;
            s._browserProfileId = p && p.profileId ? p.profileId : null; s._browserPinOrigin = p && p.profileId ? p.origin : null;
            if (res && Object.prototype.hasOwnProperty.call(res, 'cap')) s._browserCap = Number.isInteger(res.cap) ? res.cap : null;
            s._browserPinOwed = null;
            if (persistSessionMeta) persistSessionMeta(s, { browserProfileId: s._browserProfileId || undefined, browserPinOrigin: s._browserPinOrigin || undefined, browserCap: Number.isInteger(s._browserCap) ? s._browserCap : undefined, browserPinOwed: undefined });
          }
        });
      } catch (e) { console.warn('[browser] the owed pins\' session copies are not wired —', e && e.message); }
      const afterBoot = () => Promise.resolve()
        // owner ruling A: a live session pinned BEFORE the ruling still has its indirection naming the profile's directory —
        // put back on its own browser (the pin stays: it is the default attachment now, opened through the keeper)
        .then(() => { try { const n = require('../routes/browser').convertPinnedDirs(); if (n) console.log(`[browser] boot: ${n} session(s) pinned before owner ruling A no longer hand their own browser the profile's directory`); } catch (e) { console.warn('[browser] pin conversion failed:', e && e.message); } })
        .then(() => { try { const n = require('../routes/browser').healDanglingPins(); if (n) console.log(`[browser] boot: ${n} conversation pin(s) named a deleted profile — cleared`); } catch (e) { console.warn('[browser] dangling-pin heal failed:', e && e.message); } }) // lane S2: no conversation keeps a pin on a profile that is gone
        .then(() => { try { after?.(); } catch (e) { console.warn('[browser] post-boot step failed:', e && e.message); } }) // P5: the recorder taps only browsers the keeper has judged
        .then(() => { try { const ks = browserKeeper.keptStore?.(); if (ks) ks.boot(); } catch (e) { console.warn('[browser] kept-browser sweep failed:', e && e.message); } }); // lane browser-resume: the kept browsers' boot sweep (ends, the size bound) after every record is judged
      ;
    } catch (e) { console.warn('[browser] boot reconciliation failed:', e && e.message); }
  }

  /** P2 (§4.2): the live view's cookie-authed ws bridge — ONE upstream stream
   *  connection per (session, target) fanned out to N viewers, the VNC
   *  bridge's backpressure numbers, the keeper's `streamPortFor` for the port.
   *  server.js dispatches `/api/browser/stream` upgrades here. */
  let browserStream = null;
  try {
    browserStream = require('./browser-stream').create({ keeper: browserKeeper, activeSessions, requestAuthed: (req) => auth.requestAuthed(req), getTelemetry, dialogs: browserDialogs });
    // lane browser-stuck: a conversation's dialog is on the tab its live view's relay shows as active (the stream's own `tabs` record)
    if (browserDialogs && browserStream && typeof browserStream.activeTargetsFor === 'function') browserDialogs.setTabsOf((q) => { const out = new Set(); try { for (const t of browserStream.activeTargetsFor(q) || []) if (t) out.add(String(t)); } catch { /* no relay */ } try { for (const t of browserKeeper.holderTabs(q && q.profileId, q && q.browserKey) || []) out.add(t); } catch { /* the keeper's own failure */ } return [...out]; }); // verify r1: ∪ the keeper's attributable tabs
  } catch (e) { console.warn('[browser-live] stream bridge unavailable — ' + (e && e.message)); }

  /** P5 (§4.5 / D7 / D35): the action-trace recorder, the per-profile
   *  screencast and the housekeeping — hangs on the keeper's lease seam
   *  (`onLease`) and the bridge's taps; its routes are thin over it; it BOOTS
   *  inside bootBrowserKeeper AFTER the keeper reconciled its leases (a tap
   *  never starts a browser, so the order matters). Absent keeper ⇒ absent. */
  let browserTrace = null;
  try {
    if (browserKeeper) {
      // 2026-09-27 BROWSER SESSIONS: a marker the recorder writes becomes a VibeSpace card in the live conversation that
      // owns that browser (its own key — a helper's browser has no card in the parent's chat); a rebuild / a view-only
      // history reads the markers again through the normalizers' card source (bindings: a stopped conversation's key)
      const N = require('../normalizers');
      const cardOfMarker = (m) => (m.phase === 'start'
        ? { id: `bs:${m.id}:start`, phase: 'start', at: m.at, session: m.id, browserKey: m.browserKey, profileId: m.profileId || null, label: m.label || null }
        : { id: `bs:${m.id}:end`, phase: 'end', at: m.at, session: m.id, browserKey: m.browserKey, profileId: m.profileId || null, label: m.label || null, durationMs: m.durationMs, count: m.count, reason: m.reason, framesRemoved: false });
      const onSession = (m) => { for (const [, s] of activeSessions) { if (s && s._browserKey === m.browserKey) { try { N.feedBrowserCard(s, cardOfMarker(m)); } catch (e) { console.warn('[browser-trace] session card not shown — ' + (e && e.message)); } } } };
      browserTrace = require('./browser-trace').create({ dataDir: path.join(rootDir, 'data'), keeper: browserKeeper, bridge: browserStream, serverSetting, broadcast: (m) => bcastAll(m), onSession });
      browserTrace.install();
      const { router: traceRouter, setup: setupTraceRoutes } = require('../routes/browser-trace');
      // the bindings READER: a stopped conversation's trace is found through the key its CLI id was bound to (P0 r5/r7's store, read off the file per ask — a human's click)
      let bindings = null; try { bindings = require('./browser-bindings').create({ dataDir: path.join(rootDir, 'data') }); } catch (e) { console.warn('[browser-trace] bindings reader unavailable — ' + (e && e.message)); }
      N.setBrowserCardSource(({ session = null, conversationId = null } = {}) => {
        let key = session && /^bk-[0-9a-f]{8}$/.test(String(session._browserKey || '')) ? session._browserKey : null;
        const cid = conversationId || (session && (session.claudeSessionId || session.backendSessionId)) || null;
        if (!key && cid && bindings && typeof bindings.lookup === 'function') { try { key = bindings.lookup(cid) || null; } catch { key = null; } }
        return key ? browserTrace.chatCardsFor(key) : [];
      });
      // owner ruling A (6): the row's Delete… = release every lease + stop, clear every pin (lane S2's `unpinProfile` —
      // ONE implementation, in routes/browser.js beside the pin route), then set aside. Lane S2 (naive study 2, T7): "Set
      // aside" of a PINNED profile is refused `pinned` unless the user unpins (`pinGuard`)
      setupTraceRoutes({ keeper: browserKeeper, trace: browserTrace, activeSessions, bindings,
        releaseProfile: (id) => require('../routes/browser').releaseProfile(id), unpinProfile: (id) => require('../routes/browser').unpinProfile(id),
        // "Who can use it": a picked live session → its conversation's browser key (routes/browser.js's ONE resolver)
        keyForPickedSession: (webuiId) => require('../routes/browser').keyForPickedSession(webuiId),
        exceptKeyForPicked: (webuiId) => require('../routes/browser').exceptKeyForPicked(webuiId),   // lane grants-unify: «除了» by conversation
        pinGuard: (id, unpin) => require('../routes/browser').pinGuardFor(id, unpin),
        // a narrowing's detached conversation hears it on its next message (§3.8 layer ②, the same queue as the pin's)
        notice: (sessionId, session, n) => { const st = getSessionStatus ? getSessionStatus() : null; if (st && sessionStatusKey) st.pushNotice(sessionStatusKey(session, sessionId), n); } });
      app.use(traceRouter);
    }
  } catch (e) { browserTrace = null; console.warn('[browser-trace] recorder unavailable — ' + (e && e.message)); }
  // B-50e7 follow (主开发 r3941 (2)): WHAT THE SETTINGS' HOLD TURNED OFF COMES BACK AT THE LIFT — no restart, no launch. ONE hook for both:
  // the plugins tell their watchers (the tailnet door follows its road again through its ONE follow: a person on the switch's default has
  // no STORED row the lift's write hook would see moved), and the trace arms the taps of the browsers already running (held at a start,
  // its boot armed none)
  if (typeof persistenceRouter.onSettingsLift === 'function') persistenceRouter.onSettingsLift(() => {
    try { plugins.settingsLifted(); } catch (e) { console.warn('[plugins] the settings\' lift could not be told — ' + (e && e.message)); }
    try { if (browserTrace && typeof browserTrace.settingsLifted === 'function') browserTrace.settingsLifted(); } catch (e) { console.warn('[browser-trace] the taps could not be armed at the settings\' lift — ' + (e && e.message)); }
  });
  const bootBrowserTrace = () => {
    if (!browserTrace) return;
    try {
      browserTrace.boot()
        .then((r) => { if (r && (r.armed || (r.sweep && (r.sweep.removed || r.sweep.recordingsRemoved)))) console.log(`[browser-trace] boot: ${r.armed} trace tap(s) armed${r.sweep ? `, sweep removed ${r.sweep.removed} entr${r.sweep.removed === 1 ? 'y' : 'ies'} + ${r.sweep.recordingsRemoved} recording(s)` : ''}`); })
        .catch((e) => console.warn('[browser-trace] boot failed:', e && e.message));
    } catch (e) { console.warn('[browser-trace] boot failed:', e && e.message); }
  };

  // «WHAT IT MAY USE» (unit what-it-may-use — the owner, 2026-11-17): Session Properties' section reads ONE route; every door
  // answers through its own lister (src/server/may-use.js), the cookie only (THE person verdict)
  try {
    let bindingsMemo = null;
    const later = () => { try { return (typeof mayUseDoors === 'function' ? mayUseDoors() : null) || {}; } catch { return {}; } };
    const mayUse = require('./may-use.js').create({
      activeSessions, sessionKeyOf: (s, id) => (sessionStatusKey ? sessionStatusKey(s, id) : ''), addressableId: (s) => require('../claude-lock-capture.js').addressableId(s),
      // a stopped conversation: the rows the sessions route already KEPT (no new sweep per read — cure r1, SHOULD a); a sweep only
      // when it kept none, never while discovery is paused (then said by name)
      storedRow: (key) => { const S = require('../routes/sessions'); const k = S.keptSessions(); const find = (rows) => (rows || []).find((x) => x && x.sessionKey === key) || null;
        if (k.rows) return find(k.rows); if (k.paused) return { paused: true }; return S.warmSessions().then((r) => find(r && r.sessions)); },
      groupsOf: ({ sessionKey, cwd, hostId = null, initialGroupId, initialGroupIds } = {}) => { const tasks = getTasks ? getTasks() : null; if (!tasks) throw new Error('the Task Group store is not ready'); const a = { sessionKey, cwd, hostId, initialGroupId, initialGroupIds }; const ids = grantMemberIds(tasks, a); if (ids.unread) throw new Error('the Task Group list is still being read'); return tasks.groupsForSession(a); },   // B-df5f: the conversation's machine, as every caller hands it; THE SEAM (5th block): held ⇒ throws by name, a reply still being read ⇒ unknown — the section's own «cannot be read» road, never «in no group»
      lineageOf: (ids) => { const tasks = getTasks ? getTasks() : null; if (!tasks) throw new Error('the Task Group store is not ready'); return tasks.grantGroupsOf(ids).inherited; }, noAgentOf: (b) => !!require('../backend-caps.js').capsOf(b).terminalOnly,   // lane lg-group-parents: + the ONE lineage reader
      browserKeyOf: (cid) => { bindingsMemo = bindingsMemo || require('./browser-bindings.js').create({ dataDir: path.join(rootDir, 'data'), log: console }); return bindingsMemo.lookup(String(cid)) || ''; },
      grants: () => require('./grants-store.js').store(),
      doors: { channels: () => later().channels, browser: () => browserKeeper, logins: browserLogins, vaultUse: vaultUseGrants, automation, exits: () => later().exitProxy, windows: () => later().windows, jobs: () => (getJobs ? getJobs() : null) },
      log: (m) => console.log(m),
    });
    mayUse.mount(app, { personVerdict: require('../routes/vault.js').personVerdict });
  } catch (e) { console.warn('[may-use] the route could not be mounted — ' + (e && e.message)); }
  return { resumeRoad, endProposals, resumeLine, deliveryWakeSeams, settingHolds, decisionEngine, feedback, mounts, plugins, dialBridge, graduateHostToDial, createSessionMessages, pluginLoader, browserKeeper, bootBrowserKeeper: () => { bootBrowserKeeper(bootBrowserTrace); }, browserStream, browserHandback, browserTrace, browserKeys, browserDialogs,
    // lane engine-distribution (P4, §5.4): THE FLEET'S ENGINE PLUGIN at boot — ONE job after the listen, never on the boot path
    bootEngineDistribution: () => { if (!engineDistribution) return; engineDistribution.bootFleet().then((r) => { const line = engineDistribution.bootLine(r); if (line) console.log(line); }, (e) => console.warn(`[plugins] the fleet's engine plugin boot job failed — ${e && e.message}`)); } };
}
module.exports = { create };
