// Session lifecycle: create/attach/resume/fork/view/kill + billing switcher + openSpec replay (mixin split from app.js, 2.82.0 audit seam).
import { ChatView } from './chat-view.js';
import { namedModel } from '../model-providers.js'; // THE model door (lane fable-52-cli-321 r6) — the hub refuses what it refuses
import { backendFeatureCaps, terminalOnly, worktreePick, uiRow, billingRow, accountUsageStore, viewIdFor, legacyIdFor, accountBound } from './agent-meta.js';
import { oatDeadFor, oatExpiredBy } from '../login-expiry.js'; // B-8703 follow: ONE verdict + ONE last day (the server's)
import { track, metric } from './telemetry-client.js';
import { t } from './i18n.js';
import { unknownRowOf } from './resume-pacer.js'; // B-f64b cure: a row still being checked is never started unasked
import { stampAt as when, durationMark } from './page-time.js'; // lane ui-language: the ONE formatter of a time / number a person reads
import { settingsDoor } from './need-line.js'; // lane ui-needs-a-button pick 5: the billing menu's setting row
import { registerWindowType, replayOpenSpec as replayOpenSpecViaRegistry, svgIcon16 } from './window-types.js';
import { TerminalSession } from './terminal.js';
import { api, escHtml, estDisplayPair, fetchJson, hostStateChip, showConfirmDialog, showContextMenu, showToast, stripCwdHostLabel } from './utils.js';
import { endNotice } from '../job-model.js'; // B-70f9 ② (PURE): a conversation's jobs that still run, named at its end
import { bucketView, unconfirmedText } from './usage-source.js'; // a landed reset is shown reset, unconfirmed (lane reset-unproven)
import * as quotaModel from '../quota-model.js'; // PURE: the display verdict (windowDisplay)
// THE RESUME LADDER, the client's half (B-6b6d) — the same PURE rule the server
// spawns by (a CJS module pulled into the bundle, like task-color-seq /
// collab-row), so "the instance default is a NEW-session default" is ONE law
// with two callers instead of two `||` chains that drift.
import { resumeSpawnPick } from '../resume-continuity.js';
import { locateVerdict, LOCATE_WORDS } from '../locate-verdict.js'; // lane think-tools-phone: «not visible» only when true, with its door
const LOCATE_WAIT_MS = 3000; // the bounded wait for the row (the list's next frame draws it; a folder's lazy cards are built on the way)
import { lateFocus, openStart, PAGE_START, unattendedOpen } from './late-focus.js'; // B-c87d: THE ONE late-focus door (the keyboard stays where the person last put it; an open dialog keeps the keys first)
// B-c87d (r364 MUST 1): «nobody on this page started it» is a FACT of the page (late-focus.js unattendedOpen), never an id an open reuses
import { forkGroupPlan } from './fork-groups.js'; // a fork lands in its source's Task Groups (2026-09-25)
import { carriedGeometry } from './stage-rules.js'; // the geometry a replaced window carries: a borrowed hero's HOME, never the Stage's slot (verify r1 of inc-munl8jkl-gaih)
import { attachSlab } from './view-visibility.js'; // perf r1: the slab an attach asks for (floor | text)
import { memberState, poolSubmenuModel, submenuNoteWords } from './pool-priority-model.js'; // THE CONVERSATION'S POOL PIN (2026-09-28): the pool row's submenu, as a PURE model
import { deviceLocale } from './i18n.js';
import { SIGN_IN } from '../day-one.js'; // lane door-day-one-landing: a sign-in terminal is not a session row
import { resumeAccountOf, keptAccountOf, i18nParams } from './stopped-why.js'; // lane dead-socket-keeps-chat-meta: a resume nobody gave an account goes to the one its row names
import { resumeAccountVerdict } from '../resume-account.js'; // lane resume-account-door: the pinned account is asked FIRST at the Resume press
import { onVaultFacts, vaultFacts } from './vault-unlock.js'; // B-864f: a conversation whose folder waits for the vault resumes once it is unlocked
import { inTurn } from './resume-pacer.js'; // B-864f: ONE lane with the bulk resume — never two creates in flight
import { openCliMissingDialog, cliMissingWords } from './cli-missing-dialog.js'; // lane cli-shell-truth: a CLI the person's login shell cannot find is refused by name — a dialog

// lane mirror-green-228: a window's focus on the server's answer never takes the keys from an open app dialog (the Rename
// dialog a double-click on its own sidebar row opened while the attach was in flight)
const turnOf = (fn) => inTurn(fn); // B-864f: the conversations whose folder waited for the vault resume in the bulk resume's lane, one create in flight

export function installSessionLifecycle(App, ctx = {}) {
  Object.assign(App.prototype, {
  // management. Optional initialCommand is typed for the user once the shell
  // is up (e.g. the in-product "Log in to Claude" helper).
  openShellTerminal(cwd, { initialCommand, hostId, purpose } = {}) {
    this.createSession({
      backend: 'shell', mode: 'terminal', cwd: cwd || undefined, hostId,
      name: initialCommand ? initialCommand.split(' ')[0] : 'Terminal',
      model: null, permission: null, effort: null, extraArgs: '',
      initialCommand, purpose,
    });
  },
  /** A terminal a SIGN-IN opens (lane door-day-one-landing — the naive-user studies: the login terminal and the claude it ran
   *  showed as two ACTIVE sessions the person never made): the server marks it (`purpose: 'sign-in'`), the sidebar lists no
   *  row for it and the claude it runs is no discovered row. It is still a window the person sees and closes. */
  openSignInTerminal(cwd, opts = {}) { this.openShellTerminal(cwd, { ...opts, purpose: SIGN_IN }); },

  /** "Open terminal in this session" (S9 remainder piece (c), B-eac2): a shell
   *  the OpenCode SERVE owns, in the conversation's own directory, opened as a
   *  normal VibeSpace terminal window. It runs on the machine the serve runs
   *  on — which is why it is offered only where that machine is this one (the
   *  serve's pty websocket is loopback-only; the server says so if asked). */
  openOpencodeTerminal(session) {
    const cwd = stripCwdHostLabel(session?.cwd || '') || undefined;
    this.createSession({
      backend: 'shell', mode: 'terminal', cwd,
      name: session?.name ? `${session.name} — terminal` : 'OpenCode terminal',
      model: null, permission: null, effort: null, extraArgs: '',
      opencodePty: true,
    });
  },

  /** B-c87d r558: THE START OF A PERSON'S OPEN, read now — for a road outside this file that reads it where the person's act starts
   *  the open, before its own awaits, and hands it on as `openAt` (layout.js: a desktop switch's replay, a preset the person loads) */
  _openStartNow() { return openStart(this); },   // B-c87d r673: the ONE fact { at, by } — the person's act now, else unhanded

  createSession({ cwd, name, model, permission, extraArgs, resumeId, mode, syncId, effort, outputStyle, autoResume, worktree, fork, hostId, keeperSid, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, initialMessage, initialCommand, forkAtUuid, forkTitle, taskId, taskIds, tools, extraTaskBinds, accountId, modelLock, lockModel, lockContext, poolPin, ephemeral = false, purpose = null, winBounds, recreateCwd = false, ignoreNoConvo = false, opencodePty = false, onCreateResult, onCreateEnd, browserProfileId, browserProfileOrigin, quiet = false, bulk = false, openAt: pressAt = null }) {
    const openAt = openStart(this, { quiet, given: pressAt });   // B-c87d: the open began at the person's act — the press a road hands on (r558), else NOW; nobody on this page started it: the page's start
    const createArgs = arguments[0] || {}; // B-864f: the create as it was asked — a window that waits for the vault replays it whole
    try { track('event', `session-create:${backend || 'claude'}:${mode || 'default'}`); } catch {}
    // FIRST USE of a harness whose history lives behind an opt-in background
    // service (opencode → the 'opencode-serve' plugin, default OFF since
    // 2026-09-07): offer it ONCE, here at the funnel every create/resume/fork
    // passes through. NOT awaited — a NEW live session never needs the
    // service, so the spawn must not wait on a dialog. The fork path awaits it
    // in _doForkSession instead (a fork is minted THROUGH the service).
    // needsService stays false: a resume rides the agent's own session load,
    // only LISTING and reading stopped conversations need the service.
    // fire-and-forget, but never as an UNHANDLED rejection (the offer is a
    // side quest; it must not surface as a console error on a normal create)
    if (!fork) { try { Promise.resolve(this.maybeOfferHarnessService?.(backend, { needsService: false })).catch(() => {}); } catch {} }
    cwd = stripCwdHostLabel(cwd); // merged-record display cwd ("host: /path") must never reach a spawn
    this._hideWelcome();
    const defaults = this._getBackendSessionDefaults(backend);
    const sessionMode = mode || this.settings.get('session.defaultMode') || 'chat';
    // ── THE INSTANCE DEFAULT IS A **NEW-SESSION** DEFAULT (B-6b6d, owner
    // ruling 2026-09-07) ────────────────────────────────────────────────────
    // A create that carries a resumeId CONTINUES a conversation (resume bar,
    // resume-all, a card with no ⚙ override, restartConversationInPlace, fork,
    // the failed-resume retries below) and the conversation's OWN model/effort
    // must win. Only the SERVER can read that value (the codex rollout's
    // turn_context / the claude transcript's last assistant record), so the
    // client's job here is to send NOTHING unless the user explicitly chose for
    // THIS session — an explicit pick still beats everything, on both paths.
    // Filling `defaults` in here is precisely what suppressed ws-create's
    // continuity ladder and resumed an `ultra` conversation at `xhigh`
    // (2.369.62's known residue): the server's fallback is gated on "the client
    // sent nothing", and the client always sent something.
    // permission/extraArgs deliberately keep the old behaviour: the owner
    // ruling covers model+effort, and neither of those two has a conversation
    // source to prefer over the default (a permission mode IS in the claude
    // transcript's init record, but changing that default is its own product
    // decision ⇒ owner gate).
    // `hasSource: false` is the honest client-side fact: only the SERVER can
    // read a conversation's own last model/effort, so on a continuation this
    // resolves to '' (send nothing) and the server's ladder — same function,
    // with the harness's reader wired in — decides.
    // The WHOLE pick is kept, not just its value (round 3): on a NEW session
    // this is the only place that knows whether the string about to go on the
    // wire is something the USER stated or something the client resolved out
    // of `<prefix>.default*`, and the server cannot tell them apart. It rides
    // along as `spawnOriginHint` below.
    const continuesConversation = !!resumeId;
    const pickHere = (explicit, instanceDefault) =>
      resumeSpawnPick({ explicit, instanceDefault, resume: continuesConversation, hasSource: false });
    const modelPick = pickHere(model, defaults.model);
    const effortPick = pickHere(effort, defaults.effort);
    // THE DOOR, client side (lane fable-52-cli-321 r6): a saved model the hub's door would refuse (an older build saved a refused
    // Custom… pick as the resume model) is not sent — the spawn takes its default instead of the create being refused
    const sessionModel = (modelPick.value && !namedModel(modelPick.value)) ? undefined : modelPick.value;
    if (modelPick.value && !sessionModel) showToast(t('The saved model «{model}» is not a model id — this conversation starts on its default model.', { model: String(modelPick.value).slice(0, 60) }));   // said, in one line (r7)
    const sessionPermission = permission !== undefined ? permission : defaults.permission;
    const sessionEffort = effortPick.value;
    const sessionExtraArgs = extraArgs !== undefined ? extraArgs : defaults.extraArgs;
    const sessionName = name || (resumeId ? t('Resume {id}', { id: resumeId.substring(0,8) }) : t('Session {n}', { n: this.wm.windowCounter+1 }));
    const sessionKey = backendSessionId || resumeId ? `${backend}:${backendSessionId || resumeId}` : '';
    const winType = sessionMode === 'chat' ? 'chat' : 'terminal';
    const titleMeta = this._buildTitleMeta({ backend, agentKind, agentRole, agentNickname, sourceKind, parentThreadId });
    const winInfo = this.wm.createWindow({ title: sessionName, type: winType, syncId, titleMeta, ...(quiet ? { quiet: true } : {}) }); // `quiet`: drawn, never focused (r4 — a resume nobody pressed)
    // THE WINDOW KNOWS ITS CONVERSATION FROM BIRTH (lane layout-stopped-window — the owner's 个人, 2026-10-30 09:18:22): a create
    // that CONTINUES a conversation (a resume; never a fork, which mints its own) names it before 'created' answers — resume
    // placement captures the window into its desktop's record at once (moveWindowToDesktop `replaces`), and before this it
    // went in with no identity, in place of the named entry it replaced. layout.js captureWin reads it.
    if (resumeId && !fork && winInfo) winInfo._conversation = { backend, backendSessionId: backendSessionId || resumeId, cwd: cwd || '', hostId: hostId || null };
    // ONE RESUME IN FLIGHT PER CONVERSATION (lane phone-resume-keeps-layout r3, N2): the window this resume's create waits in, until it
    // is answered — a second resume of the conversation joins it (resumeSession → _pendingResumeWin), never a second create
    // RELEASED AT EVERY END OF ITS CREATE (r4 N2 — the r3 acceptance: only a matched 'error' / 'created' released it; the watchdog, an
    // error frame naming no request and a create a reconnect will not re-send left the entry for the window's life, and every later
    // press «joined» a dead window and sent nothing): the matched answer, the watchdog, a reqId-less error, the reconnect that will
    // not re-send it (below), and the window's close (_pendingResumeWin: the window under the id is no longer this one)
    const resumeKey = resumeId && !fork && winInfo ? `${backend}:${backendSessionId || resumeId}` : null;
    if (resumeKey) { (this._resumeWins ??= new Map()).set(resumeKey, winInfo); this._markResume(winInfo.id); }
    let lostWatch = null;
    // THE CREATE'S END, ONCE (lane resume-all-paced, L1): `onCreateEnd(how, msg)` — 'created' / 'refused' (the hub's answer), 'error'
    // (an error naming no request), 'lost' (a socket that will not re-send it), 'closed' (its window) — never the 15 s watchdog: a
    // create still in the hub's hands has not ended, and a bulk resume (src/lib/resume-pacer.js) waits for it before the next one
    let endSaid = false, endHow = null, winClosed = false, answered = false;   // B-ce65: HOW it ended, whether its window is closed NOW and whether the hub ANSWERED it (the moved watchdog is silent after the hub's answer or a closed window — read as they stand, whatever ended it first)
    // M1 (主开发's look at L1, 19:11Z): the watchdog releases the join-wait ONLY — the lost-socket watch stays armed after it, because for
    // a harness whose resume is not re-sent on reconnect (resumeResend false) that watch is the ONLY thing that can say «lost»
    const settled = (how = null, msg = null) => {
      if (lostWatch && how !== 'watchdog') { this.ws.offStateChange?.(lostWatch); lostWatch = null; } if (resumeKey && this._resumeWins?.get(resumeKey) === winInfo) this._resumeWins.delete(resumeKey);
      if (how === 'closed') winClosed = true;   // its read (3): a window closed AFTER an earlier end (lost, an unnamed error) is still closed
      if (how === 'created' || how === 'refused') answered = true;   // …and a create the hub answered after an unnamed error (another create's) was answered
      if (how && how !== 'watchdog' && !endSaid) { endSaid = true; endHow = how; try { onCreateEnd?.(how, msg); } catch { } }
    };
    this._placeCarried(winInfo, winBounds); // the place the window takes from the one it replaces (box, z, maximize, desktop)
    // Correlation id: concurrent creates (e.g. group resume-all) must each
    // match their OWN 'created' reply — an untagged match binds the ChatView
    // to whichever session the server happens to answer first.
    const reqId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const _createT0 = performance.now();
    // A remote create lawfully spends 5-60s BEFORE 'created' (home-dir probe,
    // cwd preflight, tool tar, writer sweep, daemon provisioning) — the window
    // used to be blank for all of it, so the only signal was a timeout toast
    // blaming the connection.
    const createHostName = this._hostLabel(hostId);
    const pendingWords0 = createHostName   // B-ce65 (its read, 1): the window line's own words, back after a mount wait
      ? t('Starting the session on {host}… (installing tools / checking the conversation)', { host: createHostName })
      : (resumeId ? t('Resuming the conversation…') : t('Starting the session…'));
    const pending = this._windowPending(winInfo, pendingWords0);

    // A NEW session sends model/effort VERBATIM so a STATED "Auto (model
    // default)" (the dialog's first option, value '') survives the wire as a
    // choice instead of arriving as silence and being answered with the
    // instance default (r2 review). A CONTINUATION keeps `|| undefined`: there
    // '' means the same thing as silence and the server's ladder reads the
    // conversation's own value (src/resume-continuity.js says why).
    const wireKnob = (v) => (continuesConversation ? (v || undefined) : v);
    const createMsg = {
      type:'create', backend, hostId: hostId||undefined, keeperSid: keeperSid||undefined, mode: sessionMode, cwd: cwd||undefined, sessionName: name||undefined, model: wireKnob(sessionModel),
      permissionMode: sessionPermission||undefined, effort: wireKnob(sessionEffort), outputStyle: outputStyle||undefined, autoResume, extraArgs: sessionExtraArgs||undefined,
      // per-session git worktree (owner ruling 9): the server refuses with a
      // reason when the cwd is not a repo, and only EMITS the flag on a new
      // session or a fork (a resume re-enters the CLI's own recorded worktree)
      worktree: worktree || undefined,
      // a BULK resume's create (resume-pacer.js — «Resume all», a group's later members): its first attach reads the conversation's
      // history in the hub's bulk line, behind every read a person's own window asks for (lane resume-all-paced L3)
      bulk: (bulk && resumeId) ? true : undefined,
      // tuiRenderer: the INSTANCE default is read server-side from the harness's
      // declared spawn rows (design-harness-settings §5) — the client sends only
      // an explicit per-session pick, and this create path has none.
      agentKind: agentKind || undefined, agentRole: agentRole || undefined, agentNickname: agentNickname || undefined,
      sourceKind: sourceKind || undefined, parentThreadId: parentThreadId || undefined,
      // WHICH FACT each of those two strings is (B-6b6d round 3). The value is
      // sent VERBATIM (above), so a resolved `<prefix>.defaultModel` and a
      // deliberate pick are the same bytes by the time the server sees them —
      // and every create path that shows NO picker (openShellTerminal, the
      // toolbar, setup-flows, manage-agents) went out labelled "your choice
      // for this session". The server may only use this to DOWNGRADE its own
      // 'chosen' verdict (src/resume-continuity.js applyOriginHint); it never
      // changes the value, and an older client that omits it keeps the old
      // answer.
      spawnOriginHint: { model: modelPick.origin, effort: effortPick.origin },
      // agent browser P1 (§3.2.5): an EXPLICIT profile pin for a NEW session only —
      // a continuation keeps the conversation's own pin (the server's ladder)
      browserProfileId: (!continuesConversation && browserProfileId) ? browserProfileId : undefined,
      // initialCommand reaches the SERVER too (2.196.0): the shell adapter
      // arms DISABLE_UPDATE_PROMPT for auto-typed shells — without this field
      // the guard was dead code and oh-my-zsh's [Y/n] ate the first typed
      // char on remote helper terminals ("claude /login" → "laude").
      initialCommand: initialCommand || undefined,
      resume: !!resumeId, resumeId: resumeId||undefined, fork: fork||undefined, cols:120, rows:30, reqId,
      taskId: taskId || (Array.isArray(taskIds) && taskIds[0]) || undefined, // the server's _initialGroupId + session-meta taskId (the task context over the session token from the first turn; no spawn env carries it since the Task refactor P2)
      // lane new-session-form: EVERY group the New Session form picked, in the order picked (the server's _initialGroupIds,
      // meta taskIds); its presence also says "the form judged the browser profile by these groups" (ws-create)
      taskIds: Array.isArray(taskIds) ? taskIds : undefined,
      tools: tools && typeof tools === 'object' ? tools : undefined, // lane new-session-form: the 「可用工具」 pick (each adapter judges it)
      accountId: accountId || undefined, // billing identity: undefined=server default, 'subscription', or acct-… key id
      modelLock: modelLock || undefined, // #6 lock v2: the server re-pins the target model after any fallback
      lockModel: (lockModel && namedModel(lockModel)) || undefined, // explicit lock TARGET (r6: through the same door) (review-caught: inferring from the spawn model re-targeted to claude.defaultModel)
      lockContext: modelLock && lockContext === '1m' ? '1m' : undefined, // B-6c55: the person's context ask beside the target (src/lock-context.js)
      // THE CONVERSATION'S POOL PIN (2026-09-28): a RESUME carries the conversation's own pin (the
      // server honours it only for a member of the pool this spawn bills, and never on a fork)
      poolPin: (!fork && poolPin && typeof poolPin.memberId === 'string') ? { memberId: poolPin.memberId, at: poolPin.at || null, ...(poolPin.poolId ? { poolId: poolPin.poolId } : {}) } : undefined,
      recreateCwd: recreateCwd || undefined, // B-7812: user danger-confirmed rebuilding a missing cwd
      ignoreNoConvo: ignoreNoConvo || undefined, // 2.227.3: user chose to retry past the no-transcript breaker
      // S9 remainder (c): this terminal is a pty the OpenCode SERVE owns, not
      // a local shell. The server bridges its websocket onto the normal
      // terminal path; the serve's port never reaches this browser.
      opencodePty: opencodePty || undefined,
      purpose: purpose === SIGN_IN ? SIGN_IN : undefined, // lane door-day-one-landing: a sign-in terminal — not a session row
    };
    // agent browser P1 (§3.2.5): WHICH fact chose the browser profile rides the same
    // hint (its own statement — test-codex-effort-meta pins the model/effort line verbatim)
    if (browserProfileOrigin) createMsg.spawnOriginHint.browserProfile = browserProfileOrigin;

    // Request/reply via ws.request (2026-07-03 review structural fix):
    // self-cleanup on window close + the reply watchdog (a create swallowed by
    // a zombie ws left a blank window with ZERO trace anywhere) + reconnect
    // re-send. Re-send is gated to RESUMES only (claude + codex): if the
    // create DID reach the old server, its dtach session survives the restart
    // and the re-sent resume trips the resume-already-live guard (2.179.0;
    // codex since the P1 codex double-writer fix — the wrapper's thread/resume
    // REUSES the thread id, it never forked), which the error branch turns
    // into an attach — no double-writer. Fresh creates and forks mint NEW ids
    // with no such guard, so re-sending them risks a silent double-spawn.
    // …a create this socket sent that a reconnect will NOT re-send (a harness whose resume is not idempotent — `resumeResend` false):
    // the frame left on a socket that died before its answer is never answered — the wait ends at the reconnect (r4 N2). One still
    // QUEUED (sent while down) goes out at the open: that one is in flight on the new socket.
    if (resumeKey && !(uiRow(backend).resumeResend && !!resumeId && !fork) && this.ws.onStateChange) {
      let out = this.ws.connected !== false, lost = false;
      lostWatch = (up) => { if (!up) { if (out) lost = true; } else if (lost) settled('lost'); else out = true; };
      this.ws.onStateChange(lostWatch);
    }
    // B-ce65: the hub said it waits (bounded) for this folder's mount to come up (`create-waiting`) — until when, and said once
    let waitsUntil = 0, waitSaid = false, watchToast = null;
    // the moved watchdog's ONE timer, re-scheduled (never stacked): the done frame shortens the deadline, a frame after the watchdog spoke arms it again
    let movedTimer = null, timeoutTracked = false;   // …and the timeout counted ONCE a create (the re-armed watchdog may speak twice)
    const cancelReq = this.ws.request(createMsg, (msg) => {
      if (msg.type === 'create-waiting' && msg.reqId === reqId && msg.done) {
        // its read (1): the hub's wait is over (the mount is back, or its bound) — the line says the window's own words again, and the
        // create gets the ordinary watchdog's 15 s from now (the start itself still runs)
        try { pending.set(pendingWords0); } catch { }
        if (waitsUntil) { waitsUntil = Date.now() + 13000; if (movedTimer) movedWatchdog(); }   // a moved watchdog is re-timed to the new deadline
        return false;
      }
      if (msg.type === 'create-waiting' && msg.reqId === reqId) {
        const spoke = !!watchToast;
        if (watchToast) { try { watchToast.remove(); } catch { } watchToast = null; }   // its read (2): a frame AFTER the watchdog spoke replaces its words
        waitsUntil = Date.now() + (Number(msg.ms) > 0 ? Math.min(Number(msg.ms), 600000) : 45000);   // EVERY frame moves it (a re-sent create waits again); at most 10 min (a timer past 2^31 ms fires at once)
        if (spoke || movedTimer) movedWatchdog();   // …and the watchdog watches the new wait: a hub that dies in it is still said (the 15 s timer fires once)
        const words = t('Waiting for {name} to come up before starting — this can take up to {s} s.', { name: msg.waitsFor || msg.cwd || '', s: Math.max(1, Math.round((waitsUntil - Date.now()) / 1000)) });
        try { pending.set(words); } catch { }   // the window's own line says it for the whole wait (a toast is gone in seconds)
        if (!waitSaid) { waitSaid = true; showToast(words, { type: 'info' }); }
        return false;
      }
      // an error that names NO request (ws-create's «Failed to spawn session» / «Unknown host»): it may be this create's end — the
      // pending resume is released (r4 N2; a press after it creates again), the request stays armed for a late answer
      if (msg.type === 'error' && !msg.reqId && !msg.sessionId) settled('error', msg);
      // Server refused the create (e.g. remote subscription-shipping policy):
      // surface it — without this the window stayed BLANK forever with no
      // feedback and no openSpec (found reproducing the remote-blank report).
      if (msg.type === 'error' && msg.reqId === reqId) {
        // B-864f: a refusal this window resumes BY ITSELF at the unlock (its folder waits for the vault: a local chat resume, not a
        // fork) — said on the answer BEFORE its end is told, so a bulk resume counts it as waiting, never as failed
        if (msg.code === 'vault_locked' && msg.cwd && !hostId && resumeId && !fork && sessionMode === 'chat') msg.resumesAtUnlock = true;
        pending.remove(); settled('refused', msg);
        if (resumeKey) this._markResume(winInfo.id); // the answer's own turn is the resume's too (r4 N5)
        try { onCreateResult?.(false, msg); } catch { }
        // Resume guard (2.179.0): the conversation is ALREADY live — attach
        // that session instead of leaving a dead "create failed" window (a
        // second --resume would double-write the same claude id).
        if (msg.code === 'resume-already-live' && msg.existingId) {
          showToast(t('Already running — opened the live session instead'));
          // …IN THIS WINDOW'S PLACE (lane phone-resume-keeps-layout r2, N2): the window is the row's (a resume re-opened it under its
          // id) — closed as its re-opening and the live session attached as itself; a plain close here was a REAL 'closed' of the row
          const re = this._reopenWin(winInfo.id);
          if (re) { re.place = winBounds ? { ...re.place, ...winBounds } : re.place; this._attachInRow(re, msg.existingId, msg.existingName || sessionName, msg.existingCwd || cwd, {
            mode: msg.existingMode || sessionMode, backend,
            backendSessionId: resumeId || undefined, hostId: hostId || undefined,
            openAt, ...(quiet ? { quiet: true } : {}),   // B-c87d r671: the create's own start and its quiet
          }); }
          return true;
        }
        // B-864f: the hub's vault_locked over a LOCAL folder (src/server/cwd-wait.js) — the folder is on a storage mount or a
        // pulled machine folder that waits for the vault: never «gone», said in the page's words; no door of its own (a resume-all
        // meets many at once, after the person may have just said 「稍后」 — the strip's Unlock and the window's line carry it)
        const folderWaits = (msg.code === 'vault_locked' && !!msg.cwd && !hostId) || msg.code === 'mount_down';
        if (msg.code === 'vault_locked' && !folderWaits) { try { window.dispatchEvent(new CustomEvent('vs-vault-door')); } catch { } }   // lane vault-e2e-password-fix-r2: a machine's session waits for the vault — its door
        const where = { name: msg.waitsFor || msg.cwd };
        const folderWords = !folderWaits ? '' : msg.code === 'mount_down' && msg.held   // r3360: a mounts list held — the folder MAY be on a mount
          ? (resumeId ? t('This conversation’s folder may be on a mount: VibeSpace cannot read its list of mounts right now — nothing was started and nothing was made there; resume it once the list reads again.') : t('The folder may be on a mount: VibeSpace cannot read its list of mounts right now — start again once it reads.'))
          : msg.code === 'mount_down'
          ? (resumeId ? t('This conversation\u2019s folder is on {name}, which is not mounted right now \u2014 nothing was started; resume it once the mount is back.', where) : t('The folder is on {name}, which is not mounted right now \u2014 start again once it is back.', where))
          : msg.resumesAtUnlock ? (createArgs.initialMessage   // the cure's should: a resume carrying the person's waiting message sends it then — said
            ? t('This conversation\u2019s folder is on {name}, which opens after the vault is unlocked \u2014 while this page is open it resumes by itself once you unlock, and then sends the message you wrote; nothing is lost.', where)
            : t('This conversation\u2019s folder is on {name}, which opens after the vault is unlocked \u2014 while this page is open it resumes by itself once you unlock; nothing is lost.', where))
            : t('The folder is on {name}, which opens after the vault is unlocked \u2014 unlock it, then start again.', where);
        const text = (msg.code === 'cli-missing' && cliMissingWords(msg).what) || folderWords || (msg.i18n && msg.i18n.key ? t(msg.i18n.key, i18nParams(msg.i18n)) : '') || (msg.message ? t(msg.message) : '') || t('Session create failed');   // B-a5a4 follow-up: a sentence with a name rides its key + params   // B-a5a4 r1: a server sentence in the reader's words (t() answers an unknown one as it is)
        // Failed RESUME rescue (2.219.0, real window-loss class): resumeSession
        // CLOSES the old read-only window before creating, so a failed create
        // used to leave only a spec-less "Create failed" shell — which
        // EVAPORATES on the next refresh (captureState skips windows without
        // an openSpec-recreatable identity), silently losing the window from
        // the layout (userL lost "Mega Fish 训练" this way). Flip the shell
        // into the view-only pipeline with a REAL viewSession openSpec so the
        // window shows history + Resume and persists/syncs like any other.
        const rescueViewOnly = () => {
          winInfo._openSpec = {
            action: 'viewSession', sessionId: resumeId, backend,
            backendSessionId: resumeId, sessionKey: `${backend}:${resumeId}`,
            hostId: hostId || undefined, cwd: cwd || '', name: sessionName || '',
          };
          this.wm.setTitle(winInfo.id, `${sessionName || resumeId.slice(0, 8)} — ${cwd || ''}`);
          this._viewIntoWindow(winInfo, { backend, backendSessionId: resumeId, cwd, name: sessionName, hostId });
          this.sessions.get(winInfo.id)?._renderers?.appendSystem(text);
          this.layoutManager?.scheduleAutoSave?.();
          try { track('event', 'create-failed-rescued'); } catch { }
        };
        // No-transcript breaker (2.227.3, userN's 46MB "修轮子"): the CLI's
        // "no conversation found" only proves it looked in the WRONG PLACE —
        // the old dead-end told the user to close the card and start over,
        // i.e. discard a live conversation. Rescue into view-only (history +
        // Resume) and offer a retry that BYPASSES the breaker.
        if (msg.code === 'no-convo-breaker' && resumeId) {
          const retry = () => this.createSession({
            cwd, name: sessionName, resumeId, mode: sessionMode, model, permission, effort,
            backend, hostId, keeperSid, accountId, extraArgs, agentKind, agentRole, agentNickname,
            sourceKind, parentThreadId, ignoreNoConvo: true, ...this._reopenedAs(winInfo.id), // the rescued window is the row: re-opened under its id (r2 N1)
          });
          // …by the retry ITSELF — the bar closes nothing (r3 N1); a window re-made since (another instance under the id) is not its (r3 N2)
          const retryHere = () => this._winIs(winInfo) && (this._markResume(winInfo.id), retry()); // its turn is the resume's (r4 N5)
          // Transcript verified to exist ⇒ the retry will usually just work
          // once the underlying cause is fixed — surface it as an UNMISSABLE
          // confirm dialog (2.237.0, real report: the 2.227.3 retry bar sat
          // quietly at the bottom of the rescued window and the user never
          // saw it — "还是resume不了"). Decline falls back to the rescued
          // view + the bar, exactly the old behavior.
          if (msg.transcriptKnown) {
            showConfirmDialog({
              title: t('Conversation found — retry now?'),
              message: t('The last resume failed because the CLI looked in the wrong folder, but this conversation\u2019s transcript EXISTS — nothing is lost. Retry the resume right now (this skips the retry cooldown)?'),
              confirmText: t('Retry resume now'),
            }).then((ok) => {
              if (!this._winIs(winInfo)) return; // the answer came after the window was re-made / closed (r3 N4)
              if (ok) {
                const re = this._reopenWin(winInfo.id); // the row, re-opened (r2 N1)
                this.createSession({
                  cwd, name: sessionName, resumeId, mode: sessionMode, model, permission, effort,
                  backend, hostId, keeperSid, accountId, extraArgs, agentKind, agentRole, agentNickname,
                  sourceKind, parentThreadId, winBounds: winBounds || re?.place, syncId: re?.id, ignoreNoConvo: true,
                });
                return;
              }
              rescueViewOnly();
              const view = this.sessions.get(winInfo.id);
              view?._renderers?.appendSystem(t('A transcript for this conversation exists — it is not lost. The history below is loaded from it.'));
              view?._showRetryResumeBar?.(retryHere);
            });
            return true;
          }
          showToast(text, { type: 'error' });
          rescueViewOnly();
          const view = this.sessions.get(winInfo.id);
          view?._renderers?.appendSystem(t('No transcript turned up for this conversation. Nothing has been deleted; the history below is whatever could be loaded.'));
          view?._showRetryResumeBar?.(retryHere);
          return true;
        }
        // B-864f: A FOLDER THAT WAITS — the window keeps its history and says so (no toast: a resume-all meets many at once),
        // and resumes ITSELF once the vault is unlocked: the waits in turn, each after the previous one's create ENDED (the
        // resume-all-paced law — never every window at the unlock's tick); the hub then waits for the mount to come back
        if (msg.resumesAtUnlock) {
          rescueViewOnly();
          // B-864f cure 2 (主开发's ask): a conversation the person ARCHIVED WHILE IT WAITED was put away — never resumed by the
          // unlock (archiving leaves its read-only window open; the create door reads no archive). «While it waited»: one already
          // archived when its resume was asked (Send my message again, a boot resume-all) is the person's own resume — it goes on
          const convOf = { sessionKey: `${backend}:${createArgs.backendSessionId || resumeId}`, backend, backendSessionId: createArgs.backendSessionId || resumeId, cwd, host: hostId || undefined };
          const archivedAtAsk = !!this.sidebar?.isArchived?.(convOf);
          const again = () => turnOf(() => new Promise((done) => {
            if (!this._winIs(winInfo)) { done(); return; } // closed or re-made while it waited
            if (!archivedAtAsk && this.sidebar?.isArchived?.(convOf)) { const typed = typeof createArgs.initialMessage === 'string' ? createArgs.initialMessage.trim() : ''; this.sessions.get(winInfo.id)?._renderers?.appendSystem(typed ? t('Not resumed \u2014 this conversation was archived while it waited for the vault. The message you wrote was not sent: «{text}»', { text: typed }) : t('Not resumed \u2014 this conversation was archived while it waited for the vault.')); done(); return; }   // the restack read: the window had promised to send it — its text comes back
            const re = this._reopenWin(winInfo.id); // the row, re-opened (r2 N1)
            const { onCreateResult: _r, onCreateEnd: _e, syncId: _s, winBounds: _w, recreateCwd: _c, ...asked } = createArgs;
            this.createSession({ ...asked, winBounds: winBounds || re?.place, syncId: re?.id, onCreateEnd: () => done() });
          }));
          if (vaultFacts()?.state === 'unlocked') { again(); return true; } // unlocked between the refusal and now
          const off = onVaultFacts((f) => { if (!f || f.state !== 'unlocked') return; off(); again(); });
          return true;
        }
        // Missing-cwd DANGER flow (B-7812, user-approved with the explicit
        // constraint that this must be a red option): offer to recreate the
        // dir EMPTY and resume. The confirm spells out that the agent's files
        // are gone; on confirm the server also arms a one-shot agent notice
        // (prompt-context) so the session can never silently continue on the
        // false premise that its files still exist.
        if (msg.code === 'cwd-missing' && resumeId && !recreateCwd && sessionMode === 'chat') {
          const missingCwd = msg.cwd || cwd || '';
          showConfirmDialog({
            title: t('Working directory is gone'),
            message: `${missingCwd}\n\n` + t('This folder no longer exists on {machine}. You can recreate it as an EMPTY folder and resume — but every file the agent worked with there is GONE and is not coming back. The agent will be told the folder was recreated empty.', { machine: msg.hostName || t('this machine') }),
            confirmText: t('Recreate empty folder & resume'),
            danger: true,
          }).then((ok) => {
            if (!this._winIs(winInfo)) return; // the answer came after the window was re-made / closed (r3 N4)
            if (!ok) { rescueViewOnly(); return; }
            const re = this._reopenWin(winInfo.id); // the row, re-opened (r2 N1)
            this.createSession({
              cwd, name: sessionName, resumeId, mode: sessionMode, model, permission, effort,
              backend, hostId, keeperSid, accountId, extraArgs, agentKind, agentRole, agentNickname,
              sourceKind, parentThreadId, winBounds: winBounds || re?.place, syncId: re?.id, recreateCwd: true,
            });
          });
          return true;
        }
        // lane cli-shell-truth: a CLI the person's login shell cannot find is said in a DIALOG (what was asked, where it
        // looked, the two doors) — never a toast alone; the failed-RESUME rescue below stays exactly as it is
        if (msg.code === 'cli-missing') { try { openCliMissingDialog(this, msg); } catch { showToast(text, { type: 'error' }); } }
        // B-ce65 (its read, 4): a refusal names its DOOR — the sidebar opens on its Remote tab at the row of the mount that is down
        else if (msg.code === 'mount_down' && msg.waitsFor && !msg.held) showToast(text, { type: 'error', action: { label: t('Show in Remote'), run: () => this._openMountsAt(msg.waitsFor) } });
        else showToast(text, { type: 'error' });
        if (sessionMode === 'chat' && resumeId && !/^sess-\d/.test(resumeId)) {   // B-a5a4 (5): every chat harness (it was claude's alone — viewSession reads any backend)
          rescueViewOnly();
          // an account the create refused (a resume that never asked — the sidebar card, resume-all; lane
          // resume-account-door): the rescued window's bar says it with its doors, on fresh facts
          if (/^Account error: /.test(String(msg.message || '')) && this.resumeAccountCheck) {   // B-a5a4 follow-up: the server's message, never its translation
            const q = { backend, backendSessionId: resumeId, hostId: hostId || undefined };
            this.resumeAccountCheck(q).then((v) => { if (v && !v.ok && this._winIs(winInfo)) this.sessions.get(winInfo.id)?._showAccountRefusalBar?.(v, q); }).catch(() => {});
          }
          return true;
        }
        const err = document.createElement('div');
        err.className = 'empty-hint';
        err.style.cssText = 'padding:24px;white-space:pre-wrap;user-select:text';
        // Identify WHICH session the failed create/resume was for — the
        // failure fires before the window ever gets an openSpec, so without
        // this the error shell was anonymous (real report: user couldn't
        // tell which conversation a "Create failed" window belonged to).
        err.textContent = text
          + (resumeId ? `\n\n${t('Conversation')}: ${resumeId}` : '')
          + (cwd ? `\n${cwd}` : '');
        winInfo.content.appendChild(err);
        const label = sessionName || (resumeId ? resumeId.slice(0, 8) : '');
        this.wm.setTitle(winInfo.id, label ? `${t('Create failed')} — ${label}` : t('Create failed'));
        return true;
      }
      if (msg.type === 'created' && msg.reqId === reqId) {
        pending.remove(); settled('created', msg);
        if (resumeKey) this._markResume(winInfo.id); // the answer's own turn is the resume's too (r4 N5)
        try { onCreateResult?.(true, msg); } catch { }
        // Non-fatal server warning (2.271.0 T1-2): the pre-resume writer sweep
        // couldn't verify no other process was writing this conversation on a
        // laggy host — the resume proceeded, but the user must know a double-
        // write is possible so they don't mistake duplicated messages for a bug.
        if (msg.warning) { try { showToast(msg.warning, { type: 'error', duration: 9000 }); } catch { } }
        // The pre-resume sweep STOPPED another process that was writing this
        // conversation (2.276.0). That is destructive by design — say it, so a
        // terminal that just died elsewhere is explained rather than mysterious.
        if (msg.swept?.pids?.length) {
          try {
            showToast(t('Stopped {n} other process(es) that were still writing this conversation on {host} — resuming cleanly.',
              { n: msg.swept.pids.length, host: msg.swept.host || t('this machine') }), { duration: 8000 });
          } catch { }
        }
        metric('session-create-roundtrip-ms', performance.now() - _createT0);
        // Set openSpec now that we have the server session ID (for cross-client sync)
        winInfo._openSpec = {
          action: 'attachSession',
          serverId: msg.sessionId,
          backend,
          backendSessionId: backendSessionId || resumeId || null,
          hostId: hostId || null,
          sessionKey,
          agentKind: agentKind || 'primary',
          agentRole: agentRole || '',
          agentNickname: agentNickname || '',
          sourceKind: sourceKind || '',
          parentThreadId: parentThreadId || null,
          name: sessionName,
          cwd: msg.cwd || cwd || '',
          mode: sessionMode,
        };
        if (this.layoutManager.noteOwnRecipe) this.layoutManager.noteOwnRecipe(winInfo.id); else this.layoutManager.scheduleAutoSave(); // re-broadcast with openSpec — owed until a save carries it (r3)
        // Persist a fork's chosen title as a custom name once the fork's NEW
        // backend id is adopted (after its first turn). Keyed by webui id; the
        // parent id is remembered so we don't rename the parent before divergence.
        if (forkTitle && resumeId) {
          (this._pendingForkTitles ??= new Map()).set(msg.sessionId, { name: forkTitle, parentId: backendSessionId || resumeId });
        }
        // Same for a USER-TYPED name on a brand-new session (New Session dialog):
        // the window title carried it, but the sidebar names sessions from the
        // first user message unless a CUSTOM NAME exists — so the typed name
        // silently lost to the first message once the transcript appeared.
        // Persist it as the custom name when the backend id is adopted.
        else if (name && name.trim() && !resumeId && !terminalOnly(backend) && !ephemeral) {
          (this._pendingCreateNames ??= new Map()).set(msg.sessionId, name.trim());
        }
        // Session created "in" a task — bind once the backend session id shows
        // up in active-sessions (unknown at creation for claude; folder
        // auto-include already covers tasks with linked folders, this makes
        // the explicit tag stick for folder-less tasks too).
        // A FORK also carries `extraTaskBinds` (every other group its source is
        // tagged with — forkGroupPlan) and waits PAST its source's id: until
        // the harness announces the fork's own id the live row carries the
        // parent's, and binding then would tag the parent instead.
        const bindIds = [...new Set([taskId, ...(Array.isArray(taskIds) ? taskIds : []), ...(extraTaskBinds || [])].filter(Boolean))];
        if (bindIds.length) this.sidebar?._registerPendingTaskBind?.(msg.sessionId, bindIds, { notId: fork ? (backendSessionId || resumeId || null) : null });
        if (msg.mode === 'chat' || sessionMode === 'chat') {
          const chatView = new ChatView(winInfo, this.ws, msg.sessionId, this);
          this.sessions.set(winInfo.id, chatView); this.wm.syncHiddenViews?.(); // a view born hidden (mobile/tab/minimized) starts suspended (inc-mu6bfv1t-4drq)
          this._mobileNav?.updateTitle?.();   // the top bar's search door follows the conversation now on show (its view is registered after its window became active — a view-only window's magnifier stayed off; lane mask-value-shape)
          // Commanded-at-spawn effort (the CLI never reports effort back, so
          // the commanded value is the display source — same as the server's
          // attach-time merge). On a RESUME the client deliberately commands
          // nothing, so the server's resolved value (the conversation's own
          // last turn) rides the 'created' reply and wins here — the creator
          // never gets an 'attached' payload (2.368.4), and without this the
          // chip on a resumed window stayed empty (B-6b6d).
          const spawnedEffort = (msg.effort !== undefined && msg.effort !== null) ? msg.effort : sessionEffort;
          if (spawnedEffort) chatView.applyStatus({ effort: spawnedEffort });
          // The creator NEVER receives an 'attached' payload, so the live
          // output style / auto-resume state rides the 'created' reply — the
          // HTTP history load below carries no meta, and without this a
          // resumed window said "style: default" while the session verifiably
          // ran the picked style (2.368.4, owner-caught).
          chatView._applyLiveMeta?.(msg);
          winInfo.onClose = () => {
            const shouldKill = (this.settings.get('window.closeBehavior') ?? 'terminate') === 'terminate';
            if (shouldKill) this.endConversation(msg.sessionId, undefined, { endTree: this._personClose() });   // B-70f9 ②: a person's end — its running jobs are named · B-c134: a close IS their Terminate, never a resume's or a record's close
            // pending name/fork-title entries otherwise only clear on identity
            // adoption — a window closed before that leaked them forever
            this._pendingForkTitles?.delete(msg.sessionId);
            this._pendingCreateNames?.delete(msg.sessionId);
            chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
          };
          winInfo._notifyChanged = () => this.updateTaskbar();
          // Load JSONL history for resumed sessions (truncated at the fork
          // point when forking from a specific message, so the displayed history
          // matches the fork's actual --resume-session-at boundary).
          // REMOTE sessions must pass host: the transcript lives on the host and
          // /api/session-messages only pulls it into the local cache when asked
          // (?host=). Without it, an externally-started server session — whose
          // cache nothing ever warmed — resumed into a BLANK conversation
          // (real user report 2026-07-11); VibeSpace-started ones appeared fine
          // only because attach/view paths had already cached their transcript.
          if (resumeId) {
            chatView.noteHistoryInFlight(true); // until this page lands nothing is known about what lies above (inc-mvl02dkn-gop0)
            fetch(`/api/session-messages?backend=${encodeURIComponent(backend)}&backendSessionId=${encodeURIComponent(backendSessionId || resumeId)}&cwd=${encodeURIComponent(cwd||'')}&webuiId=${encodeURIComponent(msg.sessionId || '')}&withStatus=1${hostId ? `&host=${encodeURIComponent(hostId)}` : ''}${forkAtUuid ? `&untilUuid=${encodeURIComponent(forkAtUuid)}` : ''}`)
              .then(r => r.json())
              .then(data => {
                if (data.messages?.length) chatView.loadHistory(data.messages, data.total);
                if (data.notLoaded) chatView._sayHistoryNotLoaded?.(data.notLoaded, { info: { storageHung: !!data.storageHung, readerGone: !!data.readerGone, readerCause: data.readerCause || null, notKnownYet: data.notKnownYet || false, retryAt: data.retryAt || null, retryIn: data.retryIn ?? null } });   // row B-422c: a resumed history the reader refused says so
                else if (data.chatStatus) chatView.applyStatus(data.chatStatus);
              })
              .catch(() => {})
              // Send the fork's first message AFTER history renders, so the
              // echoed user message appends instead of being wiped by loadHistory.
              // This first turn is also what makes the fork diverge (claude mints
              // the fork's new id on first input).
              .finally(() => { chatView.noteHistoryInFlight(false); if (initialMessage) this._sendChatMessage(msg.sessionId, initialMessage); });
            // B-cd4b r1035: a BULK resume's window (a paced «Resume all») — the hub reads the conversation's own bulk mark, so its
            // history waits behind every person's own window. A PERSON'S OWN ACT on it while that history still waits — a press in the
            // window, or the app going to it (ChatView.focus) — tells the hub ONCE (`person=1`): the warm moves into the person's line
            if (bulk) {
              let told = false;
              const tell = () => { if (told || !chatView._historyInFlight) return; told = true; fetch(`/api/session-messages?backend=${encodeURIComponent(backend)}&backendSessionId=${encodeURIComponent(backendSessionId || resumeId)}&cwd=${encodeURIComponent(cwd || '')}&webuiId=${encodeURIComponent(msg.sessionId || '')}&person=1${hostId ? `&host=${encodeURIComponent(hostId)}` : ''}`).catch(() => { }); };
              chatView._personAct = tell;
              winInfo.content?.addEventListener?.('pointerdown', tell, { once: true });
            }
          } else if (initialMessage) {
            this._sendChatMessage(msg.sessionId, initialMessage);
          }
          if (!quiet || this.wm.activeWindowId === winInfo.id) lateFocus(chatView, { win: winInfo, since: openAt }); // a QUIET window (r4 — an unattended resume) never takes the keys; B-c87d: nor one the person left (an act elsewhere since the open began)
        } else {
          const term = new TerminalSession(winInfo, this.ws, msg.sessionId, this.themeManager, (filePath, signalPath) => {
            this._openExternalEditor(filePath, signalPath);
          }, {}, this.settings);
          this.sessions.set(winInfo.id, term);
          // Automation-command terminals (Log in / Update helpers) are
          // throwaway — closing the window should terminate them directly,
          // never leave a detached login shell lingering, regardless of the
          // global close-behavior setting.
          this._wireTerminalWindow(winInfo, term, msg.sessionId, { ephemeral: ephemeral || !!initialCommand, backend });
          // Type a starter command for the user (shell terminals: login helpers
          // etc.) once the shell has had a beat to print its prompt
          if (initialCommand) {
            setTimeout(() => this.ws.send({ type: 'input', sessionId: msg.sessionId, data: initialCommand + '\r' }), 1200);
          }
          if (!quiet || this.wm.activeWindowId === winInfo.id) lateFocus(term, { win: winInfo, since: openAt }); // a QUIET window (r4 — an unattended resume) never takes the keys; B-c87d: nor one the person left
        }
        this.wm.setTitle(winInfo.id, `${sessionName} — ${msg.cwd||cwd||'~'}`);
        return true;
      }
      return false;
    }, {
      isAlive: () => this._winIs(winInfo) || (settled('closed'), false), // the window INSTANCE (r3 N2): one re-made under the same id is another window — its end releases the wait's watches (r5 N1)
      timeoutMs: 15000,
      onTimeout: () => {
        // B-ce65: inside the wait the hub said it makes (create-waiting), the create is not «unusually long» — the watchdog waits that
        // bound (+2 s), once; the hub's own answer (created, or its mount_down at the bound) ends the create first and nothing is said
        if (waitsUntil && Date.now() < waitsUntil + 2000) { movedWatchdog(); return; }
        watchdogSays();
      },
      resend: uiRow(backend).resumeResend && !!resumeId && !fork,
    });
    // the moved watchdog: re-checks the LATEST deadline (a re-sent create's frame moves it again); silent only after the hub's answer
    // or a closed window — a create lost with its socket (or ended by an error naming no request) still gets the watchdog's words
    function movedWatchdog() {
      clearTimeout(movedTimer);
      movedTimer = setTimeout(() => {
        movedTimer = null;
        if (winClosed || answered) return;
        if (Date.now() < waitsUntil + 2000) { movedWatchdog(); return; }
        watchdogSays();
      }, Math.max(50, waitsUntil + 2000 - Date.now()));
    }
    function watchdogSays() {
        settled('watchdog'); // the watchdog ends the WAIT (r4 N2): a press after it creates again — a late answer still binds in this window
        if (!timeoutTracked) { timeoutTracked = true; try { track('event', 'ws-reply-timeout:create', backend + ':' + sessionMode); } catch { } }
        try { pending.set(pendingWords0); } catch { }   // B-ce65 (its read, 1): no «Waiting for …» left on the line beside the watchdog's words
        // A slow REMOTE create is not a broken connection — the old wording
        // invited a reload, which abandons the create (fresh creates are not
        // re-sent on reconnect, so the window comes back spec-less).
        watchToast = showToast(createHostName
          ? t('Still starting the session on {host} — this can take a minute on a slow machine. Leave the window open.', { host: createHostName })
          : t('Creating the session is taking unusually long — it may still be in progress; reloading the tab abandons it'), { type: 'error' }) || null;
    }
    // THE WATCHES DIE WITH THEIR WINDOW (r5 N1 — the r4 acceptance: closed before its answer, the window's lostWatch stayed registered
    // until the next reconnect, holding the closed window, and removed itself there mid-notify — the listener after it was skipped):
    // the window's close releases the wait, the reconnect watch and the request's own handlers at once (a re-made window: isAlive above)
    winInfo?._listenerCtl?.signal?.addEventListener?.('abort', () => { settled('closed'); cancelReq?.(); }, { once: true });
  },

  _wireTerminalWindow(winInfo, term, sessionId, { killOnClose = true, ephemeral = false, backend = 'claude' } = {}) {
    winInfo._ephemeral = ephemeral;
    winInfo.onClose = () => {
      // ephemeral (automation helper) terminals always terminate on close;
      // otherwise honor the global close-behavior (default: detach — user
      // directive, no per-type exceptions; sessions stay re-attachable)
      const shouldKill = ephemeral || (killOnClose && this.settings.get('window.closeBehavior') === 'terminate');
      if (shouldKill) this.endConversation(sessionId, undefined, { endTree: !ephemeral && this._personClose() });   // B-70f9 ② · B-c134: an automation helper's own terminal is no person's Terminate, nor a resume's or a record's close
      term.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
    };
    winInfo._notifyChanged = () => this.updateTaskbar();
    // Exited-overlay Resume (2.206.0): agent terminals resume by conversation
    // id (kept fresh in the openSpec by syncSessionIdentity); plain shells
    // have nothing to resume — no callback, the overlay shows message-only.
    if (!terminalOnly(backend)) {
      term.onSessionExited = () => {
        const spec = winInfo._openSpec || {};
        const backendSessionId = spec.backendSessionId;
        const cwd = spec.cwd || winInfo.cwd || '';
        if (!backendSessionId) { showToast(t('Session id not known — resume it from the sidebar'), { type: 'error' }); return; }
        const name = this.sidebar?.getCustomName?.({ backend, backendSessionId }) || spec.name || winInfo.name || t('Session');
        this.resumeSession(backendSessionId, cwd, name, { // the window pressed in is the row, re-opened (r2 N1)
          mode: 'terminal', backend, backendSessionId,
          hostId: spec.host || spec.hostId || undefined, fromWin: winInfo.id,
        });
      };
    }
  },

  // RELIABLE KILL (2.369.16, userW inc-mtndq0vb "没法 terminate"): a kill
  // written to a socket the server later terminated (its own stall → missed
  // pong) was simply lost — the window stayed blank and Terminate did
  // nothing. Every kill now rides ws.request with resend:true and is
  // re-sent on each reconnect until the server acknowledges ('killed' to
  // the requester — ok:false = already gone — or the attached-only 'exited').
  // Two frames when a conversation id is known (review-caught): the frame
  // carrying backendSessionId lets the server's 2.179.0 stale-id fallback
  // find the live session, but that same fallback would make a RESENT copy
  // kill whatever session later resumed the conversation — so only the plain
  // {kill, sessionId} rides the resend chase, and the fallback frame is a
  // one-shot sent first. The server answers 'killed' with the id the client
  // asked for (requestedId), so a remapped kill still resolves the request.
  // The 3-minute watchdog DISARMS the request (ws.request's timer alone
  // leaves the handler live) — nothing chases a kill for the page's lifetime.
  // B-c134 cure: `endTree` — the end ALSO ends what the conversation left running in the background (the hub reads its process tree
  // before the kill and ends what survived): ONLY a person's Terminate and an archive ask it. A kill a resume follows (a restart in
  // place, an account or permission switch, a pool's cold restart) and a setup flow's own terminal keep what runs, as before
  // B-c134 cure: a window close is a person's Terminate only when a PERSON closed it — never a resume's own close (the fence:
  // _reopenWin / _closeSecondView) nor a record's (a layout apply, a desktop's restore: layoutManager._applying / _restoring)
  _personClose() { return !((this._fenceOpen || 0) > 0 || this.layoutManager?._restoring || this.layoutManager?._applying); },
  // B-70f9 ② A PERSON ENDS A CONVERSATION: the kill, then ONE non-blocking notice when it owns jobs that still run — named, with
  // «Stop these too» (one press stops them all; no press = they keep running, as before). A RESTART (kill → resume) is no end: it
  // calls killSession alone
  // the door's options ({ endTree }, B-c134) ride the kill
  endConversation(webuiId, backendSessionId, opts = {}) {
    if (!webuiId) return;
    // a RESUME's own close (the fence: _reopenWin / _closeSecondView) is no person's end — the kill as before, no notice
    if ((this._fenceOpen || 0) > 0) { this.killSession(webuiId, backendSessionId); return; }
    const all = this.sidebar?._allSessions || [];
    const s = all.find((x) => x.webuiId === webuiId);
    this.killSession(webuiId, backendSessionId, opts);
    this.noticeOwnedJobs([backendSessionId || (s && (s.sessionId || s.backendSessionId))]);
  },
  // A «Clear content…» is news here (the record-clear rule): a clear that lands while the list is on its way names its jobs by
  // id, never by the words it cleared, and one that lands while the notice shows takes the notice down. The toast history keeps
  // the head and the count alone — never the jobs' names; a failed press says how many, by count
  noticeOwnedJobs(cids) {
    const want = (cids || []).filter(Boolean);
    if (!want.length) return;
    // a tab group's ✕ closes each of its tabs at once: the ends of one moment gather into ONE notice and ONE read of the list
    const q = this._ownedNoticeQ || (this._ownedNoticeQ = { cids: new Set(), t: null });
    for (const c of want) q.cids.add(c);
    if (q.t) return;
    q.t = setTimeout(() => { const list = [...q.cids]; this._ownedNoticeQ = null; this._noticeOwnedNow(list).catch(() => { }); }, 250);
  },
  async _noticeOwnedNow(want) {
    const clearedNow = new Set();
    let shown = null, ids = null;
    const off = this.ws?.onGlobal?.((m) => {
      if (!m || m.type !== 'jobs-updated' || !Array.isArray(m.cleared)) return;
      for (const id of m.cleared) clearedNow.add(id);
      if (shown && ids && m.cleared.some((id) => ids.has(id))) { const st = shown.parentNode; shown.remove(); if (st && !st.children.length) st.remove(); }
    });
    const done = () => { try { off?.(); } catch { } };
    let r = null;
    try { r = await fetchJson('/api/jobs'); } catch { r = null; }
    const jobs = r && !r.error && Array.isArray(r.jobs) ? r.jobs.map((j) => (j && clearedNow.has(j.id) && !j.clearedAt ? { ...j, clearedAt: Date.now() } : j)) : null;
    const n = jobs ? endNotice(jobs, want) : null;
    if (!n) { done(); return; }
    const stopAll = async () => {
      done();
      const res = await Promise.all(n.jobs.map((j) => fetchJson(`/api/jobs/${encodeURIComponent(j.id)}/stop`, { method: 'POST' }).then((a) => ({ j, a }), () => ({ j, a: null }))));
      const bad = res.filter((x) => !x.a || x.a.error);
      if (bad.length) showToast(t('Could not stop {n} of these background jobs: {error}', { n: bad.length, error: (bad[0].a && bad[0].a.code === 'hub-is-main' ? t('This job is the running VibeSpace: it is not stopped here') : bad[0].a && bad[0].a.error) || t('no answer') }), { type: 'error' });
      else showToast(res.length === 1 ? t('Stopping 1 background job') : t('Stopping {n} background jobs', { n: res.length }));   // a stop is asked: each ends within its grace
    };
    ids = new Set(n.jobs.map((j) => j.id));
    shown = showToast(t(n.words.key, n.words.params), { duration: 12000, action: { label: t('Stop these too'), run: stopAll }, history: { m: t('Background jobs keep running: {n}', { n: n.jobs.length }) } });
    setTimeout(done, 12500);
  },
  killSession(webuiId, backendSessionId) {
    if (!webuiId) return;
    const tree = arguments[2] && arguments[2].endTree === true ? { endTree: true } : {};   // the door's { endTree } (the signature stays the seam's)
    if (backendSessionId) this.ws.send({ type: 'kill', sessionId: webuiId, backendSessionId, ...tree });
    const msg = { type: 'kill', sessionId: webuiId, ...tree };
    const cancel = this.ws.request(msg, (m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === webuiId,
      { resend: true, timeoutMs: 180000, onTimeout: () => cancel() });
  },

  // ONE-CLICK RESTART (owner UX, 2.369.8: applying a "next resume" pick —
  // output style etc. — used to mean a sidebar hunt + terminate + re-find
  // the moved entry). Terminate, wait for the transcript flush, resume the
  // SAME conversation — per-session config rides the respawn automatically.
  // Same kill→exited→resume machinery the pool cold switch uses.
  restartConversationInPlace(sessLike = {}) {
    const all = this.sidebar?._allSessions || [];
    const live = all.find((x) => (sessLike.webuiId && x.webuiId === sessLike.webuiId)
      || (sessLike.sessionId && x.sessionId === sessLike.sessionId)
      || (sessLike.backendSessionId && x.sessionId === sessLike.backendSessionId)) || sessLike;
    const cid = live.sessionId || live.backendSessionId;
    if (!cid) { showToast(t('Nothing to restart — this session has no conversation id yet'), { type: 'error' }); return; }
    const webuiId = live.webuiId || sessLike.webuiId || null;
    const name = this.sidebar?.getCustomName?.({ backend: live.backend, backendSessionId: cid }) || live.name || '';
    const mode = live.webuiMode || 'chat';
    const at = this._openStartNow();   // B-c87d r671: the restart's start is its press, read before the kill and its exit's wait (up to 15 s)
    const finish = () => this.resumeSession(cid, live.cwd || '', name, { mode, backend: live.backend || 'claude', backendSessionId: cid, hostId: live.host || undefined, excludeWebuiId: webuiId || undefined, openAt: at });
    if (!webuiId || live.status === 'stopped') { finish(); return; }  // already dead — just resume
    showToast(t('Restarting the session…'));
    let done = false;
    const go = () => { if (done) return; done = true; this.ws.offGlobal(onExit); finish(); };
    const onExit = (msg) => { if (msg.type === 'exited' && msg.sessionId === webuiId) setTimeout(go, 400); }; // let the CLI flush its transcript
    this.ws.onGlobal(onExit);
    this.killSession(webuiId, cid);
    setTimeout(go, 15000); // a lost exited must not strand the restart
  },

  // RESPAWN AFTER AN UNEXPECTED EXIT (B-f698): the server judged a dead conversation's exit unexpected
  // (src/exit-facts.js unexpectedExitVerdict) and asked THIS client to resume it once. The conversation is
  // already dead, so it is restartConversationInPlace's "just resume" — the same resumeSession a sidebar
  // Resume runs (its per-conversation settings, its window's place); no message is sent, so no turn is billed.
  _respawnAfterExit(sess = {}) {
    if (!sess.backendSessionId) return;
    try { window.__vsOp?.('unexpected-exit-respawn', { sid: sess.backendSessionId, serverId: sess.serverId, host: sess.host || null }); } catch {}
    const name = this.sidebar?.getCustomName?.({ backend: sess.backend, backendSessionId: sess.backendSessionId }) || sess.name || '';
    this.resumeSession(sess.backendSessionId, sess.cwd || '', name, { mode: sess.mode || 'chat', backend: sess.backend || 'claude', backendSessionId: sess.backendSessionId, hostId: sess.host || undefined, excludeWebuiId: sess.serverId || undefined, unattended: true }); // nobody pressed it (r4 N3): the record's z, the person's window keeps the keys
  },

  // Jump the sidebar to a conversation's entry (owner UX: with dozens of
  // sessions the entry hunt was the pain) — switch to Folders, expand the
  // containing folder if collapsed, scroll to the card and flash it.
  /** «LOCATE IN SIDEBAR» (lane think-tools-phone, 主开发 2026-11-17 — the owner, the row on screen and selected: «这哪里不可见了？»).
   *  It looked for `.session-card` — a class no card wears (a card is `.session-item-card`) — so it never found one; it went
   *  through the rail's re-click (an OPEN sessions list collapsed); it looked 60 ms after an open, before the list drew. The laws:
   *  LOCATE NEVER HIDES WHAT IT IS ASKED TO SHOW (the rail's one show door), IT WAITS FOR THE ROW (a bounded wait on the effect —
   *  the card drawn, its folder opened and its lazy cards built), and «NOT VISIBLE» IS SAID ONLY WHEN IT IS TRUE, with its
   *  reason and its door (the PURE src/locate-verdict.js over the list's own filters). */
  async locateSessionInSidebar(backendSessionId) {
    const sb = this.sidebar;
    if (!sb) return;
    // a press with no id to look for: SAID with the verdict's own words for a row the list does not hold, never a silent press
    if (!backendSessionId) { showToast(t(LOCATE_WORDS.absent.words)); return; }
    try { sb._railShow?.('folders'); } catch { }
    const v = locateVerdict(sb._locateFacts?.(backendSessionId) || { present: false });
    if (!v.show) {
      const w = LOCATE_WORDS[v.why] || LOCATE_WORDS.absent;
      const words = t(w.words, { name: sb._locateName?.(v.why, v.name) ?? (v.name || ''), term: v.term || '' });
      showToast(words, w.door ? { action: { label: t(w.door), run: () => { sb._locateDoor?.(v.why); this.locateSessionInSidebar(backendSessionId); } } } : {});
      return;
    }
    // THE WAIT ENDS WHEN THE PERSON WALKS AWAY (主开发's verdict): the list closed, another tab chosen, or the person's own scroll /
    // key in the list ends it SILENTLY — never a toast about a thing they left, never a scroll against their own
    const switched = sb._locateSwitched = [];   // THIS press's record (a second press starts its own)
    const shown = () => (sb._regularMode ? !sb._listHidden : !!sb.isOpen) && sb._activeTab === 'folders' && document.visibilityState !== 'hidden';
    let walked = false;
    const walk = () => { walked = true; };
    const WALK = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    const search = document.getElementById('session-filter');   // the person searching meanwhile walked away too
    for (const e of WALK) sb.listEl?.addEventListener?.(e, walk, { passive: true });
    search?.addEventListener?.('input', walk);
    const card = await new Promise((resolve) => {
      const t0 = Date.now();
      const look = () => {
        if (walked || !shown()) return resolve('walked');
        try { if (sb._openZoneOf?.(backendSessionId) === 'render') sb._render?.(); sb._openFolderOf?.(backendSessionId); } catch { }   // the zone that holds it (the workbench's Recent / History / the column), then a grouped view's folder
        const c = [...(sb.listEl || document).querySelectorAll('.session-item-card')].find((x) => x._sessionId === backendSessionId);
        if (c || Date.now() - t0 > LOCATE_WAIT_MS) return resolve(c || null);
        requestAnimationFrame(look);
      };
      look();
    });
    for (const e of WALK) sb.listEl?.removeEventListener?.(e, walk);
    search?.removeEventListener?.('input', walk);
    if (sb._locateSwitched === switched) sb._locateSwitched = null;
    // the row not shown (walked away, or not drawn in time): what Locate switched is PUT BACK, silently
    if (card === 'walked' || !card) for (const sw of switched) { try { sb._locateSwitchBack?.(sw); } catch { } }
    if (card === 'walked') return;
    if (!card) { showToast(t('The session list did not draw this conversation in time — press Locate again')); return; }
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.add('locate-flash');
    setTimeout(() => card.classList.remove('locate-flash'), 2400);
    // WHAT LOCATE OPENED IS SAID (主开发's verdict): a Recent / History switcher it moved off another machine names what it showed,
    // with the way back
    for (const sw of switched) {
      showToast(t(sw.zone === 'recent' ? 'Recent now shows Local, to find this conversation (it showed {host})' : 'History now shows Local, to find this conversation (it showed {host})', { host: sw.name }),
        { action: { label: t('Show {host} again', { host: sw.name }), run: () => sb._locateSwitchBack?.(sw) } });
    }
  },

  async killPid(pid, host) {
    // host: an EXTERNAL/tmux session discovered on a REMOTE machine — its pid
    // lives there; the local-only route 400'd silently forever (real report:
    // terminate一直不成功). Failures now surface as a toast either way.
    try {
      const r = await fetch('/api/kill-pid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid, host: host || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) showToast(j.error || t('Terminate failed'), { type: 'error' });
      else {
        showToast(t('Terminated'));
        // The server invalidated the host's discovery cache; the sidebar's
        // remote-zone cache has no TTL — force one fresh load so the card
        // flips to STOPPED without a manual ⟳.
        if (host) this.sidebar?._loadRemoteHost?.(host, { fresh: true });
      }
    } catch { showToast(t('Terminate failed'), { type: 'error' }); }
  },

  // Find existing window for a server session ID and show it. The USER named it (a card, the palette, an inbox
  // link…) ⇒ wm.revealWindow — its own tab even when it hosts a group that shows another (inc-muiq348r-jwb5);
  // a MACHINE path (`replay`: a layout replay / boot restore / remote apply that found the window already open)
  // only raises it, as before — the record's `active` decides the tab.
  _focusExistingSession(serverId, { replay = false, unattended = unattendedOpen(this), at = null } = {}) {
    for (const [winId, term] of this.sessions) {
      if (term.sessionId === serverId) {
        // A REVEAL WAITS ONLY FOR WHAT IS NOT YET STANDING (r5 O): the person named a window that stands — revealed now; a group
        // still forming around it forms with it in front (desktop-manager keepInFront)
        if (!replay) this.desktopManager?.keepInFront?.(winId);
        this.wm.revealWindow(winId, { replay });
        const off = replay && !!this.wm.windows.get(winId)?._hiddenByDesktop && !this.stage?.isActive; // a replay never raises nor types into a window its desktop hides (B-2dbe) — the Stage keeps its own rules, as revealWindow's replay does (its materialize IS the raise)
        if (replay && !off && this.wm.windows.get(winId)?.isMinimized) this.wm.restore(winId);
        // B-c87d: the person's own open of a standing window takes its keys at once (the same task — whatever ids it reuses, r364);
        // one NOBODY ON THIS PAGE STARTED (a boot restore, a record from another device, an unattended open) goes through the door from
        // the page's start — it takes the keys only while the person has not acted on the page since it loaded
        if (!off) lateFocus(term, { win: this.wm.windows.get(winId), since: unattended ? PAGE_START : openStart(this, { given: at }) });   // through THE door either way (an open dialog keeps the keys; this road is reached late too, after an attach's await)
        return true;
      }
    }
    return false;
  },

  /** B-0cc8 (lane pages-chip-groups): the window an attach of `serverId` is still waiting in — this socket sent that
   *  attach < 15 s ago (ws `_attachInFlight`, cleared at its `attached` / `error`) and the window it made is still open ⇒
   *  raise it and send NOTHING. A double-click on a sidebar row used to send two attach frames (two windows, two answers).
   *  A RESTORE NEVER RAISES BEYOND THE WINDOW (r8 — the r7 acceptance's «bysession»: a visit's restore of a conversation still
   *  attaching here came through this door as a person's open — keepInFront, an act nobody made, and revealWindow's switch back to
   *  that window's desktop ~1 s after the person's own switch, a reveal in flight retired, nothing said): a replay / restore
   *  (`replay` — attachSession's `syncId` or `machine`) only raises it, as _focusExistingSession's replay does. */
  _focusPendingAttach(serverId, { replay = false, unattended = unattendedOpen(this), at = null } = {}) {
    const w = this._attachWins && this._attachWins.get(serverId);
    const sent = this.ws && this.ws._attachInFlight && this.ws._attachInFlight.get(serverId);
    if (!w || !sent || Date.now() - sent >= 15000 || !this.wm.windows.has(w.id)) { if (w) this._attachWins.delete(serverId); return false; }
    if (!replay) this.desktopManager?.keepInFront?.(w.id); // a person's open: it stands — revealed now, in front of a group still forming around it (r5 O)
    this.wm.revealWindow(w.id, { replay });
    if (!unattended) w._lateFocusSince = openStart(this, { given: at });   // B-c87d: the person pressed it AGAIN while it attaches — the open starts again at that press (an impatient re-press keeps its keys)
    return true;
  },

  _closeSidebarOnMobile() {
    if (this.isMobile && this.sidebar.isOpen) this.sidebar.toggle(false); // the class's answer (lane duo-build-1); a regular class's column ignores it
  },

  /** B-ce65 (its read, 4): the mount refusal's door — the sidebar OPEN on its Remote tab through the one show door (`_railShow`: the
   *  rail, the classic tab bar, the phone's drawer), then the mount's row (or the machine's, for a pulled machine folder) brought into
   *  view once the panel has drawn it: asked again every 250 ms, at most 20 s (the panel's own bound for its reads) */
  _openMountsAt(name) {
    const sb = this.sidebar;
    if (!sb || typeof sb._railShow !== 'function') return false;
    try { sb._tabTouched = true; sb._railShow('mounts'); } catch { return false; }
    let n = 0;
    const look = () => { let found = false; try { found = !!sb._focusMountRow?.(name); } catch { } if (!found && ++n < 80) setTimeout(look, 250); };
    setTimeout(look, 0);
    return true;
  },

  // Transition-state note for a window whose contents only exist once a ws
  // reply lands. A remote attach/create legitimately runs 15-120s (transcript
  // pull over ssh, keeper probe, tool shipping, cwd preflight) and the window
  // was BLANK for all of it — indistinguishable from a broken one, which is
  // what taught users to reload the tab and abandon the create.
  _windowPending(winInfo, text) {
    const el = document.createElement('div');
    el.className = 'empty-hint';
    el.style.cssText = 'padding:24px;white-space:pre-wrap';
    el.textContent = text;
    winInfo.content.appendChild(el);
    return { set: (s) => { el.textContent = s; }, remove: () => el.remove() };
  },

  attachSession(serverId, name, cwd, { mode, syncId, backend = 'claude', backendSessionId, hostId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, machine = false, quiet = false, openAt: pressAt = null } = {}) {
    const unattended = unattendedOpen(this, quiet);   // B-c87d (r364): a fact of the page, never the syncId or `machine` an open reuses
    const openAt = openStart(this, { quiet, given: pressAt });   // B-c87d: the open began at the person's act (the press a road hands on — r558 — else NOW); nobody on this page started it: the page's start
    cwd = stripCwdHostLabel(cwd); // keep openSpec.cwd a REAL path — it persists into layouts and feeds later resumes
    if (!quiet) this._closeSidebarOnMobile();   // a QUIET attach (a page following a resume nobody pressed) leaves a phone's open sidebar as it is
    // If we already have a window for this session, show it (a replay / restore — `syncId` or `machine` — only raises it)
    if (this._focusExistingSession(serverId, { replay: !!(syncId || machine), unattended, at: openAt })) return null;
    // AN OPEN RESOLVES TO THE WINDOW THIS PAGE HAS FIRST (r7 S — the r6 acceptance: with the conversation's window still attaching
    // here — not yet in this.sessions, filled at 'attached' — the open went to another desktop that listed it, nothing was built
    // there and the page said its window did not appear): the window shown (above), then the window still attaching, only then a
    // held window on another desktop — never a copy of the one this page has (desktop-manager revealHeldSession)
    if ((unattended || pressAt != null) && this._focusPendingAttach(serverId, { replay: !!(syncId || machine), unattended, at: openAt })) return null;   // B-c87d r558/r671: an open nobody pressed (quiet) renews nothing; a start a road handed renews to it
    if (this._focusPendingAttach(serverId, { replay: !!(syncId || machine) })) return null; // B-0cc8: the attach in flight IS the answer — no second frame
    // ONE CONVERSATION, ONE WINDOW (userW inc-mw1ogdno-5jny — the writer of the triple): the shortcut above sees only the windows
    // this page BUILT; a conversation whose window waits in the record of a desktop not visited since the page loaded got a SECOND
    // window here (three desktops listed one conversation). A person's open goes to that desktop instead — its switch builds it.
    if (!(syncId || machine) && this.desktopManager?.revealHeldSession?.(serverId)) return null;

    this._hideWelcome();
    const isChat = mode === 'chat';
    const openSpec = {
      action: 'attachSession',
      serverId,
      name,
      cwd,
      mode,
      backend,
      backendSessionId: backendSessionId || null,
      hostId: hostId || null,
      sessionKey: backendSessionId ? `${backend}:${backendSessionId}` : '',
      agentKind: agentKind || 'primary',
      agentRole: agentRole || '',
      agentNickname: agentNickname || '',
      sourceKind: sourceKind || '',
      parentThreadId: parentThreadId || null,
    };
    const winInfo = this.wm.createWindow({
      title: `${name} — ${cwd}`,
      type: isChat ? 'chat' : 'terminal',
      syncId,
      openSpec,
      titleMeta: this._buildTitleMeta(openSpec),
      ...(quiet ? { quiet: true } : {}),   // the manager design, piece 4: a page following a resume nobody pressed — drawn, never focused (no apostrophe here: the window-types census reads this body)
    });
    (this._attachWins || (this._attachWins = new Map())).set(serverId, winInfo); // B-0cc8: the window this attach waits in
    winInfo._lateFocusSince = openAt;   // B-c87d: the start the answer is judged from (a person's re-press while it attaches renews it)

    const hostName = this._hostLabel(openSpec.hostId);
    const pending = this._windowPending(winInfo, hostName
      ? t('Connecting to {host}…', { host: hostName })
      : t('Opening session…'));
    let acked = false;

    // Request/reply via ws.request: self-cleanup on window close (esp. slow
    // huge-JSONL attaches — a leaked handler could build a ChatView into a
    // dead winInfo and leave a phantom sessions entry), the reply watchdog
    // (a lost attach used to leave the window silently blank forever with
    // zero telemetry), and reconnect re-send: attach is idempotent — the
    // restarted server either re-adopted the dtach session (attached) or
    // answers error → the view-only rescue below; without the re-send a
    // window awaiting its FIRST 'attached' had no session object, so
    // app.js's reconnect loop never covered it (blank-shell class).
    // perf r1: the slab this attach asks for — a window just created is
    // displayed, so only the burst rule applies (a page reload / a cold open of
    // many windows shares a few text windows; the rest take the floor).
    this.ws.request({ type: 'attach', sessionId: serverId, slab: attachSlab({ inFlight: this.ws.attachesInFlight?.() ?? 0 }) }, (msg) => {
      // PROOF OF LIFE (2.234.1's ack, consumed here too): the server answers
      // this synchronously at the top of every attach, so a long wait after it
      // is the transcript pull / history rebuild working — not a dead
      // connection. Name what it is waiting on and disarm the alarmist toast.
      if (msg.type === 'attach-ack' && msg.sessionId === serverId) {
        acked = true;
        pending.set(isChat
          ? (hostName
            ? t('Loading history from {host}… (large conversations can take a while)', { host: hostName })
            : t('Loading history…'))
          : t('Restoring the terminal…'));
        return false; // not the reply — keep waiting
      }
      if ((msg.type === 'error') && msg.sessionId === serverId) {
        pending.remove();
        // Dead session (stale serverId from a saved layout — server restart
        // after an OOM kill / pod recreation loses every dtach session): no
        // ChatView exists yet at this point, so ChatView's own error path
        // can't fire — dropping the handler left a BARE BLANK window shell
        // (real fleet report: 12 at once). Flip the window into the
        // view-only pipeline in place: saved history + Resume bar.
        const bsid = openSpec.backendSessionId;
        if (isChat && bsid && !/^sess-\d/.test(bsid)) {
          this._viewIntoWindow(winInfo, { backend, backendSessionId: bsid, cwd, name, hostId: openSpec.hostId });
          try { track('event', 'chat-attach-rescued'); } catch { }
        } else {
          // Not rescuable (terminal window / synthetic id): removing the
          // placeholder without this leaves the same anonymous blank shell the
          // rescue exists to prevent — state the failure in the window.
          this._windowPending(winInfo, msg.code === 'session-meta-unread'   // r3749: a listed conversation whose record could not be read — its own words, no «resume» advice
            ? t('This conversation keeps running, but its record could not be read when VibeSpace started, so it is not opened here. It opens after the next start once its record reads. Stop ends it.')
            : (msg.message || t('Session not found.')) + '\n\n' + t('Resume it from the sidebar.'));
        }
        return true;
      }
      if (msg.type === 'attached' && msg.sessionId === serverId) {
        pending.remove();
        if (msg.mode === 'chat' || isChat) {
          const chatView = new ChatView(winInfo, this.ws, serverId, this);
          this.sessions.set(winInfo.id, chatView); this.wm.syncHiddenViews?.(); // a view born hidden (mobile/tab/minimized) starts suspended (inc-mu6bfv1t-4drq)
          this._mobileNav?.updateTitle?.();   // the top bar's search door follows the conversation now on show (its view is registered after its window became active — a view-only window's magnifier stayed off; lane mask-value-shape)
          if (msg.messages?.length) {
            // The attach payload IS the meta (2.368.4): this hand-copied key
            // list silently dropped outputStyle/autoResume/streamingKind — the
            // whitelist-drift class, fifth strike.
            chatView.loadHistory(msg.messages, msg.totalCount, msg.isStreaming, msg);
          } else {
            chatView._applyLiveMeta?.(msg); // zero messages still has live state
          }
          if (msg.historyNotLoaded) chatView._sayHistoryNotLoaded?.(msg.historyNotLoaded, { info: msg.historyNotLoadedInfo || null });   // row B-422c: the first attach of a history that waits on the reader
          if (msg.viewOnly) chatView._setReadOnly();
          winInfo.onClose = () => {
            const shouldKill = !msg.viewOnly && (this.settings.get('window.closeBehavior') ?? 'terminate') === 'terminate';
            if (shouldKill) this.endConversation(serverId, undefined, { endTree: this._personClose() });   // B-70f9 ② · B-c134: the person's setting — a close IS their Terminate
            chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
          };
          winInfo._notifyChanged = () => this.updateTaskbar();
          if (!quiet || this.wm.activeWindowId === winInfo.id) lateFocus(chatView, { win: winInfo, since: winInfo._lateFocusSince ?? openAt }); // B-c87d: the person's act elsewhere since the open began keeps the keys there; a QUIET attach never takes the keys (the caret stays where the person types)
        } else {
          // Terminal mode (existing)
          const term = new TerminalSession(winInfo, this.ws, serverId, this.themeManager, (fp, sp) => this._openExternalEditor(fp, sp), {}, this.settings);
          this.sessions.set(winInfo.id, term);
          if (msg.buffer) {
            const buf = msg.buffer;
            term._suppressWaiting = true;
            // _replaying: suppress xterm's auto-answers to query sequences
            // stored in the buffer (they were answered live long ago — the
            // re-answers echo as ^[]11;rgb:… junk; see terminal.js onData).
            term._replaying = true;
            setTimeout(() => { term.terminal.write(buf, () => { term._suppressWaiting = false; term._replaying = false; term.terminal.scrollToBottom(); term.fit(); }); }, 300);
          }
          this._wireTerminalWindow(winInfo, term, serverId, { backend });
          if (!quiet || this.wm.activeWindowId === winInfo.id) lateFocus(term, { win: winInfo, since: winInfo._lateFocusSince ?? openAt }); // a QUIET attach never takes the keys; B-c87d: nor one the person left
        }
        return true;
      }
      return false;
    }, {
      isAlive: () => this._winIs(winInfo), // the window INSTANCE (r3 N2): one re-made under the same id is another window
      timeoutMs: 12000,
      onTimeout: () => {
        try { track('event', 'ws-reply-timeout:attach', serverId); } catch { }
        // ACKED ⇒ the server IS alive and working (the 2.234.1 lesson: "check
        // the connection or reload the tab" on a legitimately slow remote pull
        // is the misdiagnosis that made users reload and lose windows).
        // a QUIET attach (nobody on this page pressed anything) says a slow attach to the log, never as a toast
        if (acked) {
          if (quiet) { console.log(`[attach] "${name || serverId}" is still loading on a quiet follow`); return; }
          showToast(t('"{name}" is still loading — {host} may be slow. Leave the window open.', { name: name || serverId, host: hostName || t('the machine') }));
          return;
        }
        if (quiet) { console.log(`[attach] "${name || serverId}" is taking unusually long on a quiet follow`); return; }
        showToast(t('Attaching "{name}" is taking unusually long — it may still be working; check the connection before reloading', { name: name || serverId }), { type: 'error' });
      },
      resend: true,
    });
    return winInfo;
  },

  attachTmuxSession(tmuxTarget, name, cwd, { replay = false } = {}) {
    const openAt = openStart(this);   // B-c87d (r364): the fact, not the spec replay's flag; r673: the ONE start fact
    this._closeSidebarOnMobile();
    // Check if already viewing this tmux target
    for (const [winId, term] of this.sessions) {
      if (term._tmuxTarget === tmuxTarget) {
        this.wm.revealWindow(winId, { replay }); // the user named it: its own tab, the group restored, raised (a replay only raises)
        term.focus(); return;
      }
    }

    this._hideWelcome();
    // openSpec from creation: without it, another client's layout-sync diff
    // sees an unknown window and closes it (tmux views were killed on the
    // first remote broadcast)
    const winInfo = this.wm.createWindow({ title: `[tmux] ${name}`, type: 'terminal', openSpec: { action: 'attachTmuxSession', tmuxTarget, name, cwd } });
    const reqId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // ws.request: self-cleanup on window close + a reply watchdog (this path
    // had NO watchdog at all — a lost tmux-attach failed with zero feedback).
    // NOT re-sent on reconnect: tmux-attach mints a new server-side view pty
    // per request, so a re-send after a zombie-ws reconnect (where the first
    // request DID land) would leak a clientless duplicate view.
    this.ws.request({ type: 'tmux-attach', tmuxTarget, name, cwd, cols: 120, rows: 30, reqId }, (msg) => {
      if (msg.type === 'created' && msg.isTmuxView && msg.reqId === reqId) {
        const term = new TerminalSession(winInfo, this.ws, msg.sessionId, this.themeManager, null, {}, this.settings);
        term._tmuxTarget = tmuxTarget;
        this.sessions.set(winInfo.id, term);
        // Closing window only detaches the tmux view — does NOT kill the session
        this._wireTerminalWindow(winInfo, term, msg.sessionId, { killOnClose: false });
        lateFocus(term, { win: winInfo, since: openAt });   // B-c87d
        return true;
      }
      return false;
    }, {
      isAlive: () => this._winIs(winInfo), // the window INSTANCE (r3 N2): one re-made under the same id is another window
      timeoutMs: 12000,
      onTimeout: () => {
        try { track('event', 'ws-reply-timeout:tmux-attach', tmuxTarget); } catch { }
        showToast(t('Attaching "{name}" is taking unusually long — check the connection or reload the tab', { name: name || tmuxTarget }), { type: 'error' });
      },
    });
  },

  /** THE CARRIED PLACE (createSession's own — moved here whole, lane phone-resume-keeps-layout r2: a row re-opened as an ATTACH of
   *  the live session lands exactly where its create would have): the box, z, maximize and desktop window `winInfo` takes from the
   *  window it replaces. */
  _placeCarried(winInfo, winBounds) {
    if (!winInfo || !winBounds) return;
    // Geometry carried over from a window this session replaces (billing
    // switch kill+resume, resume of a terminated read-only window) — without
    // it the conversation "moves" into a default-sized centered window.
    if (winBounds && winInfo._onStage) {
      // ON THE STAGE createWindow's trailing focus already materialized the window INTO THE SLOT (stage-manager
      // _borrowHero): the geometry it carries over is its HOME geometry — the hand-back's, never the element's
      // (inc-munl8jkl-gaih (C): a conversation resumed on the Stage landed at its old desktop box, off the slot). The
      // Stage is a VIEW, not an owner: like any borrowed hero the window keeps its HOME desktop (the one the replaced
      // window lived on, when it still exists), so leaving the Stage hands it back there — a move now would be the
      // Stage's refusal (the 2.112.4 rule), and the replaced window's record is gone from that desktop, so the Stage's
      // identity adoption cannot find it later (measured: it stayed parked on the Stage).
      // the box carried is the HOME (PURE carriedGeometry, never the slot); slot-shaped or not it is kept (verify r3: the r1
      // belt refused a legitimately slot-shaped home and the Stage gave it a cascade box)
      if (winBounds.gridBounds) winInfo._stageHomeBounds = { ...winBounds.gridBounds };
      if (winBounds.isMaximized) winInfo._stageHomeMax = true;
      if (winBounds.preSnapBounds) winInfo.preSnapBounds = { ...winBounds.preSnapBounds };
      const home = winBounds.desktopId;
      if (home && home !== '__stage__' && (this.desktopManager?._desktops || []).some((d) => d.id === home)) winInfo._desktopId = home;
      try { window.__vsOp?.('resume-place', { win: winInfo.id, home: winBounds.desktopId || null, stage: true, landed: winInfo._desktopId }); } catch {}
    } else if (winBounds) {
      if (winBounds.gridBounds) { winInfo.gridBounds = { ...winBounds.gridBounds }; this.wm._applyGridBounds(winInfo); }
      if (winBounds.zIndex > 0 && winInfo.element) { winInfo.element.style.zIndex = winBounds.zIndex; if (winBounds.zIndex >= this.wm.zIndex) this.wm.zIndex = winBounds.zIndex + 1; } // the row's z — carried only by a resume nobody pressed (r3 N3: resumeSession)
      if (winBounds.preSnapBounds) winInfo.preSnapBounds = { ...winBounds.preSnapBounds };
      if (winBounds.isMaximized) this.wm.toggleMaximize(winInfo.id);
      // Keep the resumed conversation on its ORIGINAL desktop (see
      // _snapshotWinBounds). createWindow tagged it with the active desktop;
      // move it back when the source lived elsewhere AND that desktop still
      // exists (a since-deleted one just leaves the window active).
      const dm = this.desktopManager;
      const destDesktop = winBounds.desktopId;
      const desktopExists = !!destDesktop && destDesktop !== '__stage__'
        && (dm?._desktops || []).some((d) => d.id === destDesktop);
      if (desktopExists && destDesktop !== winInfo._desktopId && dm?.moveWindowToDesktop) {
        // `replaces`: the resumed conversation takes the place of its OLD window's record entry there (resume-all of
        // a desktop the page never opened: that window was never built, so no close removed it — userW
        // inc-mun7qjmw-iksh; the rest of that desktop's record is left exactly as it is)
        try { dm.moveWindowToDesktop(winInfo.id, destDesktop, { replaces: winBounds.winId && String(winBounds.winId) !== String(winInfo.id) ? winBounds.winId : null }); } catch {} // a row re-opened under its own id replaces nothing (LAW 1)
      }
      try { window.__vsOp?.('resume-place', { win: winInfo.id, home: destDesktop || null, exists: desktopExists, landed: winInfo._desktopId }); } catch {}
    }
  },

  /** THE ONE CLOSE IN A RESUME (lane phone-resume-keeps-layout r2 — the r1 acceptance's N1: the Resume bar resumed under the row's id and
   *  then closed the window it had just opened; the row went as 'closed', a live CLI with no window). Every window a resume, a retry
   *  or an attach of the live session REPLACES closes here and nowhere else: as its row's RE-OPENING (desktop-manager reopenRow — the
   *  record keeps the row, no evidence), the new window takes its id. → { id, desk, place } (place = its carried geometry) | null. */
  _reopenWin(winId) {
    const win = winId != null ? this.wm.windows.get(String(winId)) : null;
    if (!win) return null;
    const out = { id: String(win.id), desk: win._desktopId || this.desktopManager?.activeDesktopId || null, place: this._snapshotWinBounds(win) };
    this.desktopManager?.reopenRow?.(out.id);
    this._fenceOpen = (this._fenceOpen || 0) + 1;
    try { this.wm.closeWindow(out.id); } finally { this._fenceOpen--; }
    this._markResume(out.id); // the row is in a resume now: its new window is closed by nothing else this turn (r4 N5)
    return out;
  },

  /** A SECOND VIEW of a conversation (r3 N1 — THE FENCE: every close in src/lib is a row of an allowlist with its reason): a window
   *  of the conversation beside the one a resume shows — its row re-opened (_reopenWin), or this page's live window of it. A REAL
   *  close (one conversation, one window); a resume closes nothing else. */
  _closeSecondView(winId, conv = null) {
    const id = winId != null ? String(winId) : null, w = id ? this.wm.windows.get(id) : null;
    if (!w) return;
    // …of THAT conversation (r4 — the r3 acceptance: it closed any id it was handed): a window that names another conversation is no second view
    const spec = w._openSpec || w._conversation || w._placeholderOf || null, sid = spec?.backendSessionId || spec?.openSpec?.backendSessionId || this.sessions.get(id)?.backendSessionId || null;
    const other = conv?.cid && (sid ? String(sid) !== String(conv.cid) || (spec?.backend || 'claude') !== (conv.backend || 'claude') : w.type !== 'chat' && w.type !== 'terminal'); // no conversation named: only a session window can be one
    if (other) { this._fenceSays(id, '_closeSecondView', sid ? `it shows another conversation (${sid}), not ${conv.cid}` : `a ${w.type || 'non-session'} window shows no conversation`); return; }
    this._fenceOpen = (this._fenceOpen || 0) + 1;
    try { this.wm.closeWindow(id); } finally { this._fenceOpen--; }
  },

  /** THE FENCE'S DYNAMIC HALF (r4 N5 — the r3 acceptance: the N1 bug planted back through wm.requestClose, an ALLOWED census row, stayed
   *  green — the census pins call sites, never what runs inside a resume): a window a resume works on (the row it re-opens, the window
   *  its create waits in, the one it was pressed in, a retry's) is MARKED for the resume's turn — the task that runs it, to its end (a
   *  door's code after its callback, a caller's trailing close: the same script; cleared by a microtask — never a timer, which another
   *  task, a record another page wrote, could run before). closeWindow / requestClose / _retireWindow of a marked window from any site
   *  but _reopenWin / _closeSecondView is REFUSED and said (window.js asks `_closeFenced` first) — a no-op and a console line, never a
   *  silent close. A person's ✕ is another task: never fenced. (A close after an `await` beside a resume is the census's: one function.) */
  _markResume(winId) {
    if (winId == null) return;
    const id = String(winId), m = (this._resumeMarks ??= new Map());
    m.set(id, (m.get(id) || 0) + 1);
    queueMicrotask(() => { const k = this._resumeKeyOf?.(id) ?? id; const n = (m.get(k) || 1) - 1; if (n > 0) m.set(k, n); else m.delete(k); });
  },
  /** B-1d87's follow (r1377 (3)): a window RE-KEYED while a resume's turn holds its mark (window.js rekeyWindow — a record taken over
   *  the page's own window) keeps the mark under its new id; the mark's own microtask follows it (`_resumeMoved`, for this task) */
  _rekeyResumeMark(from, to) {
    const m = this._resumeMarks, a = String(from), b = String(to);
    if (!m || !m.has(a)) return;
    m.set(b, (m.get(b) || 0) + m.get(a)); m.delete(a);
    (this._resumeMoved ??= new Map()).set(a, b);
    queueMicrotask(() => { if (this._resumeMoved?.get(a) === b) this._resumeMoved.delete(a); });
  },
  _resumeKeyOf(id) { let k = String(id); for (let i = 0; i < 8 && this._resumeMoved?.has(k); i++) k = this._resumeMoved.get(k); return k; },
  _closeFenced(winId, how) {
    if ((this._fenceOpen || 0) > 0 || winId == null || !this._resumeMarks?.has(String(winId))) return false;
    this._fenceSays(String(winId), how, 'the window is in a resume\u2019s turn — only its re-opening (_reopenWin) or a second view\u2019s close (_closeSecondView) closes it');
    return true;
  },
  _fenceSays(id, how, why) {
    console.warn(`[resume-fence] refused ${how}(${id}): ${why} (lane phone-resume-keeps-layout r4 N5)`);
    (this._fenceRefused ??= []).push({ win: id, how, at: Date.now() }); if (this._fenceRefused.length > 32) this._fenceRefused.shift();
    try { window.__vsOp?.('resume-close-refused', { win: id, how }); } catch { }
  },

  /** `winInfo` is still the window under its id — the INSTANCE, never the id alone (r3 N2): a window re-made under the same id
   *  (a re-opened row, a dead view rebuilt live) is another window; a request, a dialog's answer, a retry made for the old one
   *  never acts on it. */
  _winIs(winInfo) { return !!winInfo && this.wm.windows.get(String(winInfo.id)) === winInfo; },

  /** The window a resume of conversation `backend:cid` still waits in (its create not answered yet, the window still that
   *  instance) — or null (r3 N2). */
  _pendingResumeWin(backend, cid) {
    const k = `${backend || 'claude'}:${cid}`, w = cid ? this._resumeWins?.get(k) : null;
    if (!w) return null;
    if (!this._winIs(w)) { this._resumeWins.delete(k); return null; }
    return w;
  },

  /** _reopenWin as a create's fields: the new window takes the row's id and place ({} — no such window). */
  _reopenedAs(winId) { const re = this._reopenWin(winId); return re ? { syncId: re.id, winBounds: re.place } : {}; },

  /** THE ROW LOOP — ONE, shared (the manager design's piece 4: the For-you reply's reopen on the pressing page, and every page that
   *  follows a resume nobody pressed): this page's windows of conversation `c` ({backend, backendSessionId}) that do not show session
   *  `sessionId` — the first is its ROW, re-opened (_reopenWin: same id, place and desktop); any other is a second view, closed through
   *  the fence. `endedOnly`: only a window that shows the conversation ENDED (a read-only view) — a live window, or a view somebody
   *  opened of a RUNNING conversation, is not touched. → the row ({id, desk, place}) or null */
  _reopenRowOf(c, sessionId, { endedOnly = false, carryZ = false } = {}) {
    let row = null;
    for (const [winId, term] of [...this.sessions]) {
      const spec = this.wm?.windows?.get(winId)?._openSpec;
      if (!spec || !c || !c.backendSessionId || (spec.backend || 'claude') !== (c.backend || 'claude') || spec.backendSessionId !== c.backendSessionId || term?.sessionId === sessionId) continue;
      if (endedOnly && !(term && term._readOnly)) continue;
      if (!row) {
        const z = carryZ ? Number(this.wm.windows.get(winId)?.element?.style?.zIndex) || 0 : 0;   // a follow carries the row's stacking, never raises it
        row = this._reopenWin(winId);
        if (row && row.place && z > 0) row.place.zIndex = z;
      } else this._closeSecondView(winId, { backend: c.backend || 'claude', cid: c.backendSessionId }); // its row re-opened; any other is a second view (r3: the fence)
    }
    return row;
  },

  /** THE PAGES FOLLOW (the manager design's piece 4, 主开发 2026-11-17): a conversation the live list newly shows RUNNING — resumed
   *  by something no person pressed on this page (an agent's conversations.resume, later a delivery) — turns its ENDED window live
   *  in ITS ROW on this page: the same window id, box, tab group and desktop, QUIETLY (drawn, never focused, no desktop switch).
   *  No new frame: every page already receives the live list (sidebar `active-sessions`). The first list a page hears is its
   *  baseline (a load's replay attaches what runs, existing); a resume THIS page has in flight is its own (the create's answer
   *  opens it); no ended window here ⇒ no window is made (the hub never picks a desktop). → how many rows turned live */
  _followResumed(sessions) {
    const now = new Map();
    for (const s of sessions || []) { const cid = s && (s.backendSessionId || s.claudeSessionId); if (cid && s.id) now.set(`${s.backend || 'claude'}:${cid}`, s); }
    const before = this._liveConvKeys;
    this._liveConvKeys = new Set(now.keys());
    if (!before) return 0;
    let n = 0;
    for (const [key, s] of now) {
      if (before.has(key)) continue;
      const backend = s.backend || 'claude', cid = key.slice(key.indexOf(':') + 1);
      if (this._pendingResumeWin && this._pendingResumeWin(backend, cid)) continue;   // this page's own resume: its create's answer opens it
      try {
        const shown = this.wm?.activeWindowId ?? null;   // the person's active window: it stays the active one
        const row = this._reopenRowOf({ backend, backendSessionId: cid }, s.id, { endedOnly: true, carryZ: true });
        if (!row) continue;
        // ALWAYS QUIET (no sidebar closed, no toast, no caret taken); when the ended row WAS the active window, ONE separate step gives
        // it the focus back — only the focus — as the person's own resume does (its attach then lets the caret in: the window is active)
        const wasShown = shown != null && String(row.id) === String(shown);
        const win = this._attachInRow(row, s.id, s.name || '', s.cwd || '', { mode: s.mode || 'chat', backend, backendSessionId: cid, hostId: s.host || undefined, quiet: true });
        if (wasShown && win) this.wm.revealWindow(win.id);   // give the focus back — THE door that reveals a window as itself (§62)
        n++;
      } catch (e) { console.warn('[pages-follow] a resumed conversation\'s row did not turn live:', e); }
    }
    return n;
  },

  /** A CONVERSATION LIVE ELSEWHERE IS ATTACHED, NEVER RE-CREATED (r2 N2): row `re` (a _reopenWin result, or a held row's {id, desk,
   *  place}) shows live session `serverId` as itself — same id, its carried place. A page that already shows that session live
   *  raises its own window instead (attachSession's first look) — then the row's window was a second view: its close was real. */
  _attachInRow(re, serverId, name, cwd, opts = {}) {
    this._markResume(re.id); // its turn is the resume's (r4 N5)
    const win = this.attachSession(serverId, name, cwd, { ...opts, syncId: re.id });
    if (!win) { this.desktopManager?.purgeClosedWindow?.(re.id); return null; }
    if (re.place) this._placeCarried(win, re.place);
    this.desktopManager?.reopenedRow?.(re.id, re.desk);
    this.layoutManager?.noteOwnRecipe?.(win.id); // the row names the live session now — owed to the hub until a save carries it (r3)
    return win;
  },

  /** B-f64b cure: the person's press on a row whose liveness is not known yet asks first (a method: a suite answers it) */
  async _askStillChecking(name) {
    return showConfirmDialog({ title: t('Still checking «{name}»', { name: String(name || '').slice(0, 60) }),
      message: t('VibeSpace has not finished checking whether this conversation is running in another terminal. Resuming it now could start a second agent on the same conversation.'),
      confirmText: t('Resume anyway') });
  },
  resumeSession(sessionId, cwd, sessionName, { mode, model, effort, permission, accountId, worktree, syncId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, hostId, keeperSid, winBounds, excludeWebuiId, onCreateResult, onCreateEnd, initialMessage, stay = false, fromWin = null, unattended = false, bulk = false, unknownOk = false, openAt = null } = {}) {
    const shown = this.wm.activeWindowId; // the window the person is in, before anything here moves the focus (r4 N3)
    this._closeSidebarOnMobile();
    const targetBackendId = backendSessionId || sessionId;
    // ONE RESUME IN FLIGHT PER CONVERSATION (r3 N2 — the r2 acceptance: a double click on a stopped card sent a second resume before the
    // first create was answered; the row counted as held, the pending window was closed as its «tile» and a second one made under the
    // same id, and the first create's answer built a phantom view in the closed one): a resume of a conversation whose create is still
    // in flight JOINS it — no second create, no close; a person's press raises the window it waits in
    const pend = this._pendingResumeWin(backend, targetBackendId);
    if (pend) {
      this._markResume(pend.id);
      if (!stay && !unattended) { this.wm.revealWindow?.(pend.id, {}); showToast(t('Still resuming this conversation — its window is waiting for the session to start')); } // the join is SAID (r4 N2)
      return { row: pend.id, desk: pend._desktopId || null, pending: true };
    }
    // B-f64b cure (主开发 11:47Z, as if a must): A ROW WHOSE LIVENESS IS NOT KNOWN YET IS NEVER STARTED UNASKED — a codex the person
    // runs in another terminal may be it (a second CLI on one transcript). Unattended or bulk (`stay`): nothing starts; a person's
    // own press: «still checking» is said first, and only a yes starts it
    // cure 2: a conversation THIS page just ended (excludeWebuiId — a pool's cold move, a billing switch) is ours, never another terminal's
    if (!unknownOk && !excludeWebuiId && unknownRowOf(this.sidebar?._allSessions, backend, targetBackendId)) {
      if (!stay && !unattended && typeof this._askStillChecking === 'function') {
        const again = arguments[3] || {};
        Promise.resolve(this._askStillChecking(sessionName)).then((yes) => {
          if (!yes) return;
          // cure 2: the answer may have come while the question was open — read the row again before the yes acts
          const row = (this.sidebar?._allSessions || []).find((s) => (s.backend || 'claude') === backend && (s.backendSessionId || s.sessionId) === targetBackendId);
          if (row && row.status === 'external') { showToast(t('«{name}» was not resumed: it is running in another terminal', { name: String(sessionName || '').slice(0, 60) }), { type: 'info', duration: 8000 }); return; }
          this.resumeSession(sessionId, cwd, sessionName, { ...again, unknownOk: !!unknownRowOf(this.sidebar?._allSessions, backend, targetBackendId) });
        }).catch(() => {});
      } else if (unattended && !stay) showToast(t('«{name}» was not resumed: still checking whether it runs in another terminal — resume it by itself', { name: String(sessionName || '').slice(0, 60) }), { type: 'info', duration: 8000 }); // cure 2: an unattended restart held is SAID
      return { row: null, desk: null, checking: true };
    }
    // THE WINDOW THE RESUME WAS PRESSED IN (r2 N1 — the Resume bar, the retry bar, the account bar, the terminal's exited overlay, a
    // permission restart, a placeholder tile): `fromWin` is the row it re-opens — closed HERE as its re-opening (_reopenWin), never by
    // the caller; its session is the one this resume replaces (dead, or just killed), never «the live window» it would raise
    const from = fromWin != null && this.wm.windows.has(String(fromWin)) ? String(fromWin) : null;
    if (from) this._markResume(from); // the window pressed in is the resume's this turn: its door closes nothing (r4 N5)
    const gone = excludeWebuiId || (from && this.sessions.get(from)?.sessionId) || null;
    // If this session is already open in a LIVE window, focus it.
    // TWO staleness guards (2.241.0): a read-only view is a DEAD window, not a
    // live one (its ChatView keeps sessionId after 'exited'), and an
    // excludeWebuiId caller (billing switch) just killed that id — either can
    // still match here because _allSessions refreshes on a poll/broadcast that
    // may be seconds stale, and the silent return ate the whole resume.
    for (const [winId, term] of this.sessions) {
      if (winId === from) continue;
      if (term.sessionId && !term._readOnly) {
        const sidebar = this.sidebar;
        const match = (sidebar._allSessions || []).find(s => (s.backendSessionId || s.sessionId) === targetBackendId && (s.backend || 'claude') === backend && s.webuiId);
        if (match && term.sessionId === match.webuiId && match.webuiId !== gone) {
          if (from) this._closeSecondView(from, { backend, cid: targetBackendId }); // the window pressed in shows a conversation this page shows live — a second view
          this._focusExistingSession(match.webuiId, { replay: !!syncId, unattended: unattended || stay || unattendedOpen(this), at: openAt });   // B-c87d r558/r671: the resume's own fact (and the page's) and start
          return;
        }
      }
    }
    // Close any TERMINATED/read-only windows for the same backend session
    // (otherwise we'd end up with two windows pointing at the same conversation)
    // A RESUME RE-OPENS ITS ROW (lane phone-resume-keeps-layout, LAW 1 — userW 2026-11-05: his phone's «Resume all» after a hub restart
    // minted a NEW window per conversation, the desktops' rows were retired for them, and the phone — no desktop geometry — wrote eleven
    // desktops with no box): the window it closes IS the conversation's row (the restore built it under the row's id) — the record keeps
    // the row (desktop-manager reopenRow) and the new window takes its id; a row a held record lists that this page has not built (a
    // desktop not visited — the resume-all's scan) is re-opened the same way, its box / z / group carried. Never a second window.
    const dm = this.desktopManager, given = !!winBounds || stay || !!from; // `stay`: a bulk resume (the resume-all) — every row re-opened where it is, no switch
    let row = null;
    if (from) { const re = this._reopenWin(from); row = { id: re.id, desk: re.desk }; if (!winBounds) winBounds = re.place; }
    for (const [winId, term] of [...this.sessions]) {
      const win = this.wm.windows.get(winId);
      const spec = win?._openSpec;
      if (spec?.backend === backend && spec?.backendSessionId === targetBackendId) {
        // The resumed conversation should stay where the old window was.
        if (!winBounds) winBounds = this._snapshotWinBounds(win);
        if (!row && !syncId) { const re = this._reopenWin(winId); row = { id: re.id, desk: re.desk }; }
        else this._closeSecondView(winId, { backend, cid: targetBackendId }); // a second view of the conversation (its row is the one re-opened)
      }
    }
    const found = !row && !syncId ? dm?.heldRowOf?.({ backend, backendSessionId: targetBackendId, hostId, winId: winBounds?.winId }) : null;
    const live = found && this.sessions.get(found.id);
    const held = found && !(live && live.sessionId && !live._readOnly) ? found : null; // a row whose window shows a LIVE session is no resume's to re-open
    let tile = null;
    if (held) {
      row = { id: held.id, desk: held.desk };
      const r = held.row || {};
      winBounds = { ...(winBounds || {}), gridBounds: r.gridBounds || winBounds?.gridBounds || null, desktopId: held.desk, winId: held.id, ...(r.isMaximized ? { isMaximized: true } : {}), ...(r.preSnapBounds ? { preSnapBounds: r.preSnapBounds } : {}) };
      if (this.wm.windows.has(held.id)) tile = this._reopenWin(held.id); // its placeholder tile (a press resumes): the row's own window, re-opened
    }
    const rec = row ? (held?.row || (dm?._savedStates?.get(row.desk)?.windows || []).find((w) => String(w?.winId || w?.id) === row.id)) : null;
    // ITS Z FOLLOWS THE ACT (r3 N3 — the r2 acceptance: the record's z, the last SAVED capture, put a pressed resume back under the
    // windows raised since — the resumed window held the keyboard focus under another): the BOX is the row's always; its stacking
    // is the record's only for a resume nobody pressed — the resume-all (`stay`), the exit respawn and the pool's cold restart
    // (`unattended`, r4 N3: they jumped above the window the person works in) — and such a window is drawn QUIET: the person's window
    // keeps the focus (the r3 acceptance: a resume-all window focused at its record z sat under the window it took the keys from).
    // The window the person is IN (the row they look at) is theirs: on top, focused. A press lands on top.
    const unpressed = (stay || unattended) && !(row && String(row.id) === String(shown));
    if (rec && unpressed) {
      const z = Number(rec.zIndex != null ? rec.zIndex : rec.z);
      if (z > 0) winBounds = { ...(winBounds || {}), zIndex: z };
    }
    // «LIVE» IS THE HUB'S TRUTH (r2 N2 — the r1 acceptance: the check read only THIS page's windows; a phone re-opened a row another page
    // showed live, sent a create, the hub answered 'resume-already-live' and the row was closed for it — that page's live window with
    // it): the row's own recipe names a session the hub runs now (the session list agrees) ⇒ the resume is that window's — a person's
    // resume goes there, a bulk one leaves it where it is, a window of the row built here shows it as itself. Never a create.
    const runs = (sid) => (sid && sid !== gone && (this.sidebar?._allSessions || []).find((s) => s.webuiId === sid && s.status !== 'stopped')) || null;
    const liveRow = rec ? (runs(rec.openSpec?.serverId) || runs(rec.serverSessionId)) : null;
    if (liveRow) {
      const elsewhere = held && !tile && row.desk && row.desk !== dm?.activeDesktopId; // the row stands on a desktop not on show, unbuilt here
      if (!elsewhere || (!given && this.stage?.isActive)) this._attachInRow({ ...row, place: winBounds }, liveRow.webuiId, sessionName, cwd, { mode: liveRow.webuiMode || rec.openSpec?.mode || mode, backend, backendSessionId: targetBackendId, hostId, openAt });
      else if (!given) dm?.revealHeld?.(row.id, row.desk, sessionName || null);
      return { row: row.id, desk: row.desk, live: liveRow.webuiId };
    }
    // the row's tab group waits for it BEFORE its window exists (r2 — the acceptance's probe g: createSession's move captured the window
    // chainless first, and a card resume of a grouped row on a desktop not visited dissolved the group on the hub)
    if (row) dm?.reopenedRow?.(row.id, row.desk);

    const sessionMode = mode || (this.settings.get('session.defaultMode') ?? 'chat');
    // Apply persisted per-session config (gear popover) for any param the caller
    // didn't specify — covers card click, resume-all, chat resume bar, etc.
    const savedCfg = this.sidebar?.getSessionConfig?.({ backend, sessionId, backendSessionId: targetBackendId }) || {};
    // Context task rides across resumes: the first task this session is
    // explicitly tagged with becomes the server's _initialGroupId again, so
    // the task context covers the pre-bind window on every resume.
    const contextTask = this.sidebar?._getSessionTasks?.({ backend, backendSessionId: targetBackendId })?.[0];
    const created = this.createSession({
      cwd,
      name: sessionName,
      resumeId: sessionId,
      mode: sessionMode,
      model: model !== undefined ? model : savedCfg.model,
      permission: permission !== undefined ? permission : savedCfg.permission,
      effort: effort !== undefined ? effort : savedCfg.effort,
      outputStyle: savedCfg.outputStyle,   // 2.368.0: spawn-only settings key, so a resume is where a change lands
      worktree: worktree !== undefined ? worktree : savedCfg.worktree, // owner ruling 9: the choice rides resume/restart (and a fork, which the CLI strips)
      tools: savedCfg.tools, // lane new-session-form: the conversation's 「可用工具」 pick — the CLI records none of it, so a resume re-passes it
      autoResume: savedCfg.autoResume,     // tri-state: undefined = follow the instance default
      // …and, when neither the caller nor the saved config names one, the account its ROW names (a kept stopped meta's — the
      // session's own; the agy index's account root — the store that holds it): never the harness's default by accident
      accountId: accountId !== undefined ? accountId : resumeAccountOf(savedCfg.account, this.sidebar?._allSessions, backend, targetBackendId, { bound: accountBound(backend) && !hostId }),
      modelLock: savedCfg.modelLock,  // #6 lock v2: a locked conversation stays locked across resume (re-pin re-arms)
      lockModel: savedCfg.lockModel,
      lockContext: savedCfg.lockContext,   // B-6c55: the person's 1M ask beside the lock target — the resume commands both
      poolPin: savedCfg.poolPin, // 2026-09-28: the conversation's pool pin rides a resume (never a fork)
      syncId: syncId || row?.id, // LAW 1: the row's own id — the record keeps the row, its box and its group
      ...(unpressed ? { quiet: true } : {}), // nobody pressed it: drawn, the person's window keeps the focus (r4 N3)
      backend,
      keeperSid,
      openAt, // B-c87d r558: a pressed resume's start is its press, never the create's moment
      backendSessionId: backendSessionId || sessionId,
      hostId, // remote session resumes ON its host
      agentKind,
      agentRole,
      agentNickname,
      sourceKind,
      parentThreadId,
      taskId: contextTask?.id,
      winBounds,
      onCreateResult,
      onCreateEnd, // lane resume-all-paced: the bulk resume waits for this create's END before the next one
      bulk, // lane resume-all-paced L3: a bulk resume's create — its first attach reads its history in the hub's bulk line, behind a person's windows
      initialMessage, // lane door-signin-card: the chat's «Send my message again» re-sends the waiting turn on resume
    });
    if (row) {
      // a resume a person asked for with no place named (a card, a sidebar row) of a row on a desktop not on show goes there — the
      // storm chain's reveal (the window is the row's, on its own desktop); a resume-all names each place and switches nothing
      if (!given && row.desk && row.desk !== dm?.activeDesktopId && !this.stage?.isActive) dm?.revealHeld?.(row.id, row.desk, sessionName || null);
    }
    return row ? { row: row.id, desk: row.desk, created } : created;
  },

  // RESUME ACCOUNT (lane resume-account-door, owner 2026-10-15 「无法 resume 一个对话」): the Resume press asks the PURE
  // verdict FIRST (src/resume-account.js) over facts the page already holds — the conversation's on-resume account, the
  // accounts list (login-expiry's loginState), the usage route's logins (login-state's `since`), the host's verdicts — so
  // a pinned account that cannot serve is said IN THE RESUME BAR with its two doors, not by a create failing into a toast.
  _resumeAccountVerdict({ backend = 'claude', backendSessionId, hostId } = {}) {
    const acc = this._accounts || {};
    // no list yet (a fresh page) or a harness with no roster: no claim — the create stays the judge
    if (!backendFeatureCaps(backend).accounts || !backendSessionId || !(acc.accounts || []).length) return { ok: true };
    const saved = this.sidebar?.getSessionConfig?.({ backend, backendSessionId }) || {};
    const bill = billingRow(backend);
    return resumeAccountVerdict({
      // the account the create WILL use (resumeAccountOf — r2: the row's own account is judged, not the default it never runs on)
      pinned: { account: resumeAccountOf(saved.account, this.sidebar?._allSessions, backend, backendSessionId, { bound: accountBound(backend) && !hostId }) || '', backend, host: hostId || null,
        // B-a5a4 follow-up: a conversation that lives in ONE account's own store is offered that account alone (the server refuses
        // every other; a host's resume is not judged there — ws-create's seam skips it)
        heldBy: accountBound(backend) && !hostId ? keptAccountOf(this.sidebar?._allSessions, backend, backendSessionId) : undefined },
      accounts: acc.accounts,
      loginStates: this._usageLogins || null,
      defaults: {
        defaultAccountId: acc[bill.defaultIdField] || null,
        // the machine's own CLI login is a candidate where the billing row declares one (its status rides /api/accounts)
        machineLogin: !hostId && bill.hostLogin ? acc.subscription || null : null,
        hostVerdicts: hostId ? this._hostVerdicts?.[hostId] || null : null,
      },
    });
  },
  /** The Resume press's question, on FRESH facts: a login the CLI wiped broadcasts nothing, so a page loaded before the
   *  wipe still holds "serves" (the incident's page) — and a re-login may have landed since the last broadcast. One
   *  GET /api/accounts (list() re-reads every credential file), bounded; the cache when the server does not answer. */
  async resumeAccountCheck(ids = {}) {
    await Promise.race([this.refreshAccounts?.(), new Promise((r) => setTimeout(r, 3000))]);
    return this._resumeAccountVerdict(ids);
  },
  /** The refusal's first door: Manage agents, on that account's own re-login (the row's login chip / ⋯ → Re-login on
   *  this machine — the same terminal and the same finalize), or Manage agents alone for a pool / a host that cannot
   *  take the account. The bar re-asks on the accounts-updated the finished login broadcasts. */
  openResumeAccountDoor(door) {
    if (!door || door.kind !== 'relogin') return;
    const a = (this._accounts?.accounts || []).find((x) => x.id === door.accountId) || null;
    this._showAgentsDialog?.();
    if (door.via === 'login' && a) this._reloginSubscription?.(a.id, a, () => { this._agentsRefreshHook?.(); this.refreshAccounts?.(); });
  },
  // PERSIST-AFTER-VERIFY (B-77f3, 2.243.0): a picked account used to be written as the on-resume account BEFORE the
  // spawn — a doomed pick (not logged in, can't ship, host down) poisoned the session's config, and every later manual
  // Resume re-failed with it (userN's 2.240.0 incident chain). The pick rides the create explicitly and is persisted only
  // once the server confirms the session actually spawned with it — the billing switcher and the resume bar's account
  // picker write through this ONE door.
  _persistAccountOnCreate(key, acctVal) {
    return (ok2, createdMsg) => {
      if (!ok2) return; // create errored — config untouched, old account stands
      // Persist the POST-FACTO truth (B-f531): what the server actually
      // resolved the spawn to (created.billing), not the requested intent.
      // billing.accountId null = the CLI/host's own login = the sentinel.
      const resolved = createdMsg?.billing ? (createdMsg.billing.accountId || 'subscription') : acctVal;
      this.sidebar?.setSessionConfig?.(key, { ...(this.sidebar?.getSessionConfig?.(key) || {}), account: resolved });
    };
  },

  _snapshotWinBounds(win) {
    if (!win) return undefined;
    // PURE stage-rules carriedGeometry (verify r1 of inc-munl8jkl-gaih): a window BORROWED by the Stage sits at the
    // Stage's slot — the box it carries into its replacement is the HOME the Stage remembered (`_stageHomeBounds`,
    // un-maximized with `_stageHomeMax`), never the element's. Read off the element, the hero's own Resume / a billing
    // switch / a restart carried the slot as the new window's home: the hand-back landed it at slot size on its
    // desktop and every client's record of that desktop took it (the slot-leaks-into-desktop-records class).
    // The resumed conversation must stay on its HOME desktop — not the one
    // that happens to be active. A single billing switch usually resumes a
    // session on the visible desktop (so this is a no-op there), but the
    // pool cold-restart kills+resumes sessions across EVERY desktop at once
    // while one is active: without this every one of them piled onto the
    // active desktop and flattened the whole layout (a fleet user, inc-mso43urh).
    // THE FRAME'S FACTS (verify r2): a grouped guest is drawn by its host's element and its box mirrors the host's
    // (createTabChain / addToTabChain / _syncChainBounds copy it) — so a guest of a BORROWED frame carries the slot by
    // construction; what it keeps on the desktop is the FRAME's home. The desktop is the window's own.
    const frame = (win._tabChain && Array.isArray(win._tabChain.tabs) && this.wm.windows.get(win._tabChain.tabs[0])) || win;
    return carriedGeometry({ gridBounds: frame.gridBounds, preSnapBounds: frame.preSnapBounds, isMaximized: frame.isMaximized, desktopId: win._desktopId, onStage: frame._onStage, stageHomeBounds: frame._stageHomeBounds, stageHomeMax: frame._stageHomeMax });
  },

  // "Hot-switch" a session's billing account (title-bar badge click). A true
  // in-process swap is impossible — the account rides the spawn env
  // (ANTHROPIC_API_KEY / CLAUDE_SECURESTORAGE_CONFIG_DIR / CODEX_HOME), fixed
  // for the CLI's lifetime — so this is the honest next best thing: persist
  // the choice (sessionConfigs.account), kill the CLI, resume the SAME
  // conversation on the new account. Also works on already-terminated
  // (read-only) windows, where it just resumes on the picked account.
  // Warm the per-host account knowledge the billing switcher depends on
  // (2.239.2, userN's inc-msfwgfpd-tlhn — the panic button's first real
  // catch): hostSubHeld/hostLinked read `_hostSubsKnown`/host-email caches
  // that only a Manage-Agents visit or a usage ⟳ populated, so on a FRESH
  // page every named subscription rendered disabled ("can't ship") even when
  // its login was held ON the host or WAS the host's own login. Fetch the
  // same accounts-status probe Manage Agents uses, once per host per page;
  // when the fetch lands while the billing menu is still open, rebuild it in
  // place so the rows un-grey in front of the user.
  _warmHostAccountCache(hostId) {
    if (!hostId) return;
    this._hostAcctWarmState = this._hostAcctWarmState || {};
    this._hostAcctWarmAt = this._hostAcctWarmAt || {};
    // TTL, not once-per-page (2.240.1, userN's "左右状态不一致": the host's
    // MACHINE LOGIN can change out from under a page-lifetime cache — he
    // /login'd a different account on the host and the switcher kept calling
    // the OLD identity "the host's own login", a wrong-BILLING hazard, while
    // Manage Agents' fresh probe showed the truth. 2min matches the host
    // auto-test cadence.)
    this._hostAcctWarmErrAt = this._hostAcctWarmErrAt || {};
    if (this._hostAcctWarmState[hostId] === 'pending') return;
    if (this._hostAcctWarmState[hostId] === 'done' && Date.now() - (this._hostAcctWarmAt[hostId] || 0) < 120000) return;
    // A FAILED probe retries in 15s, not 2min (2.272.x lag/silent-failure
    // campaign): the old code stamped a failure as `done` + a FRESH warmAt, so
    // for two whole minutes nothing retried and every consumer kept rendering
    // its legacy fallback as DEFINITIVE ("never finished signing in", "can't
    // ship to {host}") off an answer it never received — a usable host-held
    // login read as broken, with a confident WRONG reason.
    if (this._hostAcctWarmState[hostId] === 'error' && Date.now() - (this._hostAcctWarmErrAt[hostId] || 0) < 15000) return;
    this._hostAcctWarmState[hostId] = 'pending';
    // Rebuild whichever host-scoped surface is open — on SUCCESS the rows
    // un-grey, on FAILURE they gain the honest "couldn't reach {host}" state.
    const rebuild = () => {
      const bm = this._billingMenu;
      if (bm && bm.host === hostId && bm.el?.isConnected) {
        bm.el.remove();
        this.showBillingSwitcher(...bm.args);
      }
      // New Session dialog open on this host → rebuild its account row with
      // the fresh verdicts (same rebuild-on-arrival pattern as the menu)
      try { this._updateAcctRow?.(); } catch { }
    };
    api(`/api/hosts/${encodeURIComponent(hostId)}/accounts-status`).then((r) => {
      this._hostAcctWarmState[hostId] = 'done';
      this._hostAcctWarmAt[hostId] = Date.now();
      if (this._hostAcctWarmErr) delete this._hostAcctWarmErr[hostId];
      if (!r) return;
      this._hostSubsKnown = { ...(this._hostSubsKnown || {}), [hostId]: r.hostSubs || [] };
      const email = String(r.subscription?.email || '').trim().toLowerCase();
      this._hostOwnEmailKnown = { ...(this._hostOwnEmailKnown || {}), [hostId]: email };
      // Server-computed per-account VERDICTS (B-f531) — surfaces render these
      // verbatim; the legacy email/subs caches above stay only as fallback
      // for servers that predate the field.
      if (r.verdicts) this._hostVerdicts = { ...(this._hostVerdicts || {}), [hostId]: r.verdicts };
      rebuild();
    }).catch((e) => {
      // warmAt is the freshness of the DATA, never of the attempt — leave the
      // last good stamp alone so a previously-warmed host keeps its verdicts.
      this._hostAcctWarmState[hostId] = 'error';
      this._hostAcctWarmErrAt[hostId] = Date.now();
      this._hostAcctWarmErr = { ...(this._hostAcctWarmErr || {}), [hostId]: e?.message || t('unreachable') };
      rebuild();
    });
  },

  // Display name for a machine id (host-scoped transition states name the
  // machine — "checking…" alone doesn't say WHICH one is slow).
  _hostLabel(hostId) {
    if (!hostId) return '';
    const hs = this.sidebar?._hostsData?.hosts || this._nsHosts || [];
    return hs.find((h) => h.id === hostId)?.name || hostId;
  },

  showBillingSwitcher(winId, anchor) {
    // Two call shapes: (windowId, anchorElement) from the title-bar identity
    // badge, or (sessionObject, {x,y}) from the sidebar card context menu —
    // the card path has no window (and phones have no title-bar badges).
    let win = null, spec = {}, live = null;
    if (winId && typeof winId === 'object') {
      live = winId;
    } else {
      const term = this.sessions.get(winId);
      win = this.wm.windows.get(winId);
      if (!win) return;
      spec = win._openSpec || {};
      const allSess = this.sidebar?._allSessions || [];
      live = term ? allSess.find(s => s.webuiId === term.sessionId) : null;
    }
    const backend = live?.backend || spec.backend || 'claude';
    if (!backendFeatureCaps(backend).accounts) return; // billing switcher = backends with an account roster (META cap, not an id list)
    const backendSessionId = live?.backendSessionId || spec.backendSessionId || live?.sessionId || null;
    const bill = billingRow(backend); // the declared billing row: words, host-login semantics, api keys, usage bucket
    // exact-backend match (P4): the old boolean partition ('is codex' vs
    // 'is not') breaks structurally with a third backend
    const accts = (this._accounts?.accounts || []).filter(a => (a.backend || 'claude') === backend)
      // same TYPE-then-name order as the Manage-Agents roster (2.268.5) —
      // divergent ordering between the two surfaces reads as a shuffle
      .sort((a, b) => (((a.pooled || a.type === 'pooled') ? 0 : a.type === 'subscription' ? 1 : 2)
        - ((b.pooled || b.type === 'pooled') ? 0 : b.type === 'subscription' ? 1 : 2))
        || String(a.name || '').localeCompare(String(b.name || '')));
    // A stopped session has no live accountId — its saved on-resume account
    // config is the honest "current" (that's what the next resume bills to).
    const savedAcct = !live?.webuiId
      ? this.sidebar?.getSessionConfig?.(`${backend}:${backendSessionId}`)?.account : null;
    const currentId = live?.accountId || (savedAcct && savedAcct !== 'subscription' ? savedAcct : null) || null;
    const doSwitch = async (acctVal, label) => {
      if (!backendSessionId) {
        showToast(t('Nothing to resume yet — send a message first, or pick the account in the New Session dialog'), { type: 'error' });
        return;
      }
      const ok = await showConfirmDialog({
        title: t('Switch billing to “{name}”?', { name: label }),
        message: t('The account is fixed when the CLI starts, so the session restarts and the conversation continues via resume.'),
        confirmText: t('Switch & restart'),
      });
      if (!ok) return;
      const key = spec.sessionKey || `${backend}:${backendSessionId}`;
      const persistOnSuccess = this._persistAccountOnCreate(key, acctVal); // PERSIST-AFTER-VERIFY (B-77f3): written once the spawn is confirmed
      const name = this.sidebar?.getCustomName?.({ backend, backendSessionId }) || live?.name || spec.name || win?.title || t('Session');
      const cwd = live?.cwd || spec.cwd || '';
      const mode = live?.webuiMode || (win ? (win.type === 'terminal' ? 'terminal' : 'chat') : (this.settings.get('session.defaultMode') || 'chat'));
      const hostId = live?.host || undefined;
      const winBounds = win && this.wm.windows.get(win.id) === win ? this._snapshotWinBounds(win) : undefined;   // the window held (r2355: its id may have changed while the switcher stood open)
      // excludeWebuiId: we KILLED this webui id ourselves — resumeSession's
      // "already open in a live window" shortcut must not trust a stale
      // _allSessions entry still carrying it (2.241.0, userN's incident ws
      // ring: kill → exited → the auto-resume create was never sent; on his
      // loop-blocked instance the active-sessions refresh lagged 10-30s, the
      // killed session still matched as "live", and the switch silently
      // ended at _focusExistingSession on the dead window).
      const at = this._openStartNow();   // B-c87d r671: the switch's start is its press, read before the kill and its exit's wait (about 9 s remote)
      const finish = () => this.resumeSession(backendSessionId, cwd, name, { mode, backend, backendSessionId, accountId: acctVal, hostId, winBounds, excludeWebuiId: live?.webuiId, onCreateResult: persistOnSuccess, openAt: at });
      if (live?.webuiId) {
        // backendSessionId lets the server resolve the session even when the
        // webui id went stale across a restart (2.179.0 — a no-op'd kill here
        // followed by the resume double-wrote the same claude id)
        this.killSession(live.webuiId, backendSessionId);
        // Wait for the ACTUAL exited event, not a fixed delay (2.240.0,
        // userN's incident timeline: a REMOTE session's teardown took ~9s —
        // the old 900ms fire let resume run while the session still lived,
        // where the duplicate-window guard swallowed it silently; the window
        // just died with no restart, twice, before a third attempt landed).
        let done = false;
        const go = () => { if (done) return; done = true; this.ws.offGlobal(onExit); finish(); };
        const onExit = (msg) => {
          if (msg.type === 'exited' && msg.sessionId === live.webuiId) setTimeout(go, 400); // let the CLI flush its transcript
        };
        this.ws.onGlobal(onExit);
        setTimeout(go, 15000); // fallback: a lost exited must not strand the switch
      } else finish();
    };
    // Remote sessions can't take every account: subscriptions never ship to
    // dial devices, and to ssh hosts only with the opt-in setting. The server
    // enforces this at spawn — but offering the pick here was FAIL-LATE (the
    // user confirmed, the session restarted into an error, and the doomed
    // account was already persisted as the on-resume config; 2.188.0 audit).
    const rHostId = live?.host || spec.host || null;
    const rHostName = live?.hostName || rHostId;
    const rTransport = rHostId ? (this.sidebar?._hostsData?.hosts?.find(h => h.id === rHostId)?.transport || 'ssh') : null;
    const shipSubs = !!this.settings.get('accounts.shipSubscriptionToRemote');
    // Same-account link: a named subscription whose email matches the host's
    // own login identity (⟳-baked orgEmail cache) IS that login — pickable;
    // the server maps the spawn onto the host's own login (2.198.0, zero
    // creds ship). Cache empty → stays blocked with the pick-CLI-login hint.
    const hostOwnEmail = rHostId ? String(this._hostOwnUsage?.[rHostId]?.orgEmail || this._hostOwnEmailKnown?.[rHostId] || '').trim().toLowerCase() : '';
    // Cold caches ⇒ probe the host now; the menu rebuilds in place when the
    // answer lands (~1s). Without this, a fresh page disables every named
    // subscription no matter what the host actually holds.
    if (rHostId) this._warmHostAccountCache(rHostId); // TTL-guarded internally; rebuilds the open menu on fresh data
    // Is what this menu is about to claim actually KNOWN? With no verdicts for
    // the host the rows below are legacy guesses — the menu used to render
    // them as definitive disabled rows with no way to tell "genuinely can't
    // run there" from "the probe hasn't answered yet" (and the user picks a
    // worse account off that). Name the state instead.
    // ⚠ gated on the WARM STATE too: a pre-verdict server answers fine but
    // never sends `verdicts`, and a bare "no verdicts" test would pin those
    // instances on "checking…" forever.
    const acctWarm = rHostId ? this._hostAcctWarmState?.[rHostId] : null;
    const verdictsCold = !!rHostId && !this._hostVerdicts?.[rHostId] && (acctWarm === 'pending' || acctWarm === 'error');
    const probeErr = verdictsCold && acctWarm === 'error' ? (this._hostAcctWarmErr?.[rHostId] || t('unreachable')) : null;
    const acctEmailOf = (a) => String(a.email || (String(a.name || '').includes('@') ? a.name : '')).trim().toLowerCase();
    // SERVER-COMPUTED verdicts (B-f531, 2.244.0): evaluateOnHost's answer per
    // account, fetched live by _warmHostAccountCache — the SAME function the
    // spawn path uses, so what this menu promises is what the spawn does.
    // Legacy cache-derived checks below survive only as fallback while the
    // probe is in flight or against a pre-verdict server.
    const vOf = (a) => (rHostId ? this._hostVerdicts?.[rHostId]?.[a.id] : null) || null;
    const hostLinked = (a) => { const v = vOf(a); if (v) return v.usable && v.how === 'host-login'; return bill.hostLogin && !!hostOwnEmail && acctEmailOf(a) === hostOwnEmail; };
    // Per-account login held ON the host (2.199.0) — cached from the last
    // Manage-Agents visit to that machine; the server re-verifies at spawn.
    const hostSubHeld = (a) => { const v = vOf(a); if (v) return v.usable && v.how === 'host-held'; return bill.hostLogin && rHostId && (this._hostSubsKnown?.[rHostId] || []).includes(a.id); };
    let shipBlocked = false;
    const subBlock = (a) => {
      // a THIRD-PARTY provider runs on this machine only — never offered to a session on another one (the switch would
      // end the session first and the create refuse it — lane lg-providers U5 r1)
      if (a.type === 'provider') return rHostId ? t('A third-party model runs on this machine only for now — start the conversation here') : null;
      const isSub = !bill.apiKeys || (a.type || 'api') === 'subscription';
      if (!isSub) return null; // API keys always ship
      const v = vOf(a);
      if (v) { // verdict is authoritative — render it verbatim
        // Belt vs a stale server: an expired oat must not be pickable (the
        // pick kills the session, then the create refuses — window gone).
        // B-8703 follow: the ONE verdict Session Properties reads too
        if (oatDeadFor(a, v)) return t('“{name}”’s long-lived token has expired — re-mint it', { name: a.name });
        if (v.usable) return null;
        if (v.reason === 'held-identity-mismatch') return t('The login held on {host} for “{name}” actually belongs to {email} — re-run “Log in on host as this account”.', { host: rHostName, name: a.name, email: v.dirEmail || '?' });
        if (v.reason === 'not-on-this-host') {
          // signed in SOMEWHERE — just not on the machine this session runs on
          // (2.244.3, userN: ClaudeLu held on Novita read "never finished
          // signing in" in a CW-H200 session's menu = looked like a broken
          // account)
          const others = (v.otherHosts || []).map((h) => this._hostNamesKnown?.[h] || h).join(', ');
          return t('“{name}” isn’t logged in on {host} — it’s logged in on {others}. Use “Log in on host as this account” for {host} (Manage agents), or run the session on {others}.', { name: a.name, host: rHostName || t('this machine'), others: others || '?' });
        }
        if (v.reason === 'never-signed-in') return t('“{name}” never finished signing in — complete its login in Manage agents first.', { name: a.name });
        if (v.reason === 'dial-no-ship') return t('Subscription logins can’t ship to a paired device — log in on the device, or use an API-key account');
        if (v.reason === 'local-only-mac') return t('This macOS Keychain-backed login stays on this machine. Log in as this account on {host} instead; copying it can invalidate rotating OAuth credentials.', { host: rHostName });
        if (v.reason === 'pool-local-only') return t('Pooled accounts run on this machine only');
        if (v.reason === 'pool-no-target') return t('This pooled account has no target — pick a subscription in Manage agents');
        shipBlocked = true;   // lane ui-needs-a-button pick 5: the menu's last row opens that setting
        return t('This stored login can’t ship to {host}. If you’ve logged this account in ON {host}, pick “CLI login @ {host}” above — that uses the host’s own login. (Or turn on “Ship subscription logins to remote hosts” — the menu’s last row.)', { host: rHostName });
      }
      // ── legacy fallback (probe in flight / old server) ──
      // NEVER-SIGNED-IN sub (2.240.0, userN's inc-msfx2fdt-3rbn): an
      // account added but whose OAuth login was never completed has no
      // usable credentials ANYWHERE — offering it fail-lates at spawn with
      // "subscription not logged in" and poisons the session's on-resume
      // config. Say the real reason instead of the ship explanation.
      if (a.pooled) { // pooled = local-only; loggedIn reads through the symlink
        if (rHostId) return t('Pooled accounts run on this machine only');
        if (a.facts && a.facts.state !== 'read') return null;   // B-360d: its sign-in not read yet — no claim; the spawn reads it fresh
        return a.loggedIn ? null : t('This pooled account has no target — pick a subscription in Manage agents');
      }
      // B-360d: a sign-in not read yet (or that could not be read) refuses NOTHING here — never «never finished signing in»;
      // the spawn's own placement reads it fresh and refuses by name if it must
      if (a.facts && a.facts.state !== 'read') return null;
      // Long-lived token (B-211a): usable anywhere via the secret env channel
      // — locally there ARE no verdicts (vOf needs a host), and remotely this
      // covers the probe-in-flight window. Expired is the one honest refusal.
      if (a.oat) {
        const expired = oatExpiredBy(a);   // B-8703 follow: the server's last day (0 days left still serves)
        // valid oat = usable anywhere; expired blocks ONLY where the oat is
        // the actual spawn channel — a LOCALLY logged-in account keeps its
        // dir login (the server drops the dead secret), so it must fall
        // through to the normal ladder instead of a false hard-block
        if (!expired) return null;
        if (oatDeadFor(a, null)) return t('“{name}”’s long-lived token has expired — re-mint it', { name: a.name });   // B-8703 follow: the ONE verdict (expired and not signed in here)
        // logged-in + expired oat → the ordinary rules below tell the truth
      }
      if (!a.loggedIn && !(rHostId && (hostLinked(a) || hostSubHeld(a)))) {
        return t('“{name}” never finished signing in — complete its login in Manage agents first.', { name: a.name });
      }
      if (!rHostId) return null;
      if (hostLinked(a)) return null; // = the host's own login — usable directly
      if (hostSubHeld(a)) return null; // has its own login held ON the host
      if (a.localOnly) return t('This macOS Keychain-backed login stays on this machine. Log in as this account on {host} instead; copying it can invalidate rotating OAuth credentials.', { host: rHostName });
      if (rTransport === 'dial') return t('Subscription logins can’t ship to a paired device — log in on the device, or use an API-key account');
      if (!shipSubs) return t('This stored login can’t ship to {host}. If you’ve logged this account in ON {host}, pick “CLI login @ {host}” above — that uses the host’s own login. (Or enable Settings → “Ship subscription logins to remote hosts”.)', { host: rHostName });
      return null;
    };
    const items = [];
    // Transition state FIRST — before any row whose reason it qualifies.
    if (verdictsCold) {
      const chip = probeErr
        ? hostStateChip('error', { text: t('couldn’t reach {host} — account availability unknown', { host: rHostName }), title: probeErr })
        : hostStateChip('pending', { text: t('checking accounts on {host}…', { host: rHostName }) });
      items.push({ captionHtml: chip.outerHTML,
        title: probeErr ? t('The reasons below are guesses from cached data until the machine answers. Retrying shortly.') : t('Availability below is unconfirmed until the machine answers.') });
    }
    // 'subscription' = accounts.resolveForSpawn's force-the-CLI's-own-login
    // sentinel (a bare '' would fall through to the default account). For a
    // remote session that login lives on the HOST — say so.
    // Per-row usage PREVIEW (2.245.1; scoped buckets + water-level colors
    // 2.245.2, user request): remaining quota + data age inline in the
    // switcher, same per-row source rule as the Agents overview (host-login →
    // machine quota, host-held → hostAccounts cache, else the local passive
    // cache). Rendered via showContextMenu's OPT-IN labelHtml — every
    // interpolated string below is escHtml'd (labelHtml contract); the
    // percentage spans carry the same >95 red / >80 amber / green scheme as
    // the roster donuts.
    const pctOf = (x) => (x == null ? null : Math.min(100, Math.round(x.usedPercent ?? ((x.utilization || 0) * 100))));
    const wlColor = (p) => (p > 95 ? 'var(--red,#e55)' : p > 80 ? 'var(--yellow,#e5c07b)' : 'var(--green,#3fb950)');
    const pctHtml = (p) => (p == null ? '?' : `<span class="bsw-pct" style="color:${wlColor(p)}">${p}%</span>`);
    // STABLE ROW LAYOUT (2.258.0, real report '布局不稳定/空白很多'): the old
    // flat `name — 5h 11% · 7d …` string wrapped at arbitrary points in an
    // auto-width menu. Rows are now two flex parts — `.bsw-name` (flex:1,
    // ellipsized, suffix dim) + `.bsw-usage` (nowrap fixed cluster, tabular
    // numbers) — and `.context-menu:has(.bsw-usage)` pins the menu width, so
    // every row renders on ONE line with the usage column right-aligned.
    const usageHint = (u, est) => {
      if (!u && !est) return '';
      u = u || {};
      // Dead-reckoned CURRENT view (B-b87b: this menu showed the raw cached
      // reading while every other surface — popup/taskbar/roster — shows the
      // estimate; a stale reading here contradicted them and mis-informed the
      // exact decision this menu exists for). estDisplayPair = the shared
      // roll-aware discriminator; an estimated value renders dash-underlined.
      // …through the display verdict first (lane reset-unproven): a bucket whose reset landed since its reading shows
      // 0 % (dashed, its tooltip «reset <time> · unconfirmed — confirms when a session uses it») — never the stale number
      const eff = (raw0, e0) => {
        const v = bucketView(quotaModel, raw0, e0, Date.now(), { readAt: u.fetchedAt });
        const raw = v.reading, e = v.est;
        const un = v.unconfirmed ? unconfirmedText(v, { t }) : '';
        const pair = estDisplayPair(raw, e);
        if (pair.estPct != null) return { p: pair.estPct, est: true, un };
        const p = pctOf(raw);
        return p == null ? null : { p, est: false, un };
      };
      const f = eff(u.fiveHour, est?.fiveHour), s7 = eff(u.sevenDay, est?.sevenDay);
      // Scoped buckets (e.g. the Fable weekly cap) — same 2-char short label
      // as the roster donuts ('Fa 41%').
      const scoped = (u.scopedWeekly || []).map((sc) => {
        const e = (est?.scopedWeekly || []).find((x) => String(x?.name || '').toLowerCase() === String(sc?.name || '').toLowerCase());
        return [String(sc.name || '?').slice(0, 2), eff(sc, e)];
      }).filter(([, v]) => v != null);
      if (f == null && s7 == null && !scoped.length) return '';
      const age = u.fetchedAt ? Math.round((Date.now() - u.fetchedAt) / 60000) : null;
      // a MARK: m / h in every language (page-time's mark — hotfix 2.369.401, the owner's «不如还是继续用 h/d»)
      const ageTxt = age != null && age > 5 ? escHtml(durationMark(age * 60000, { hoursFrom: 100, daysFrom: Infinity })) : '';
      const seg = (k, v) => (v == null ? '' : `<span class="bsw-seg${v.est ? ' bsw-est' : ''}${v.un ? ' bsw-unconfirmed' : ''}"${v.un ? ` title="${escHtml(v.un)}"` : ''}><span class="bsw-k">${escHtml(k)}</span>${pctHtml(v.p)}</span>`);
      return `<span class="bsw-usage">${seg('5h', f)}${seg('7d', s7)}${scoped.map(([l, v]) => seg(l, v)).join('')}${ageTxt ? `<span class="bsw-age">${ageTxt}</span>` : ''}</span>`;
    };
    const rowHtml = (nameText, subText, usage) =>
      `<span class="bsw-name">${escHtml(nameText)}${subText ? `<span class="bsw-sub">${escHtml(subText)}</span>` : ''}</span>` + (usage || '');
    const usageFor = (a) => {
      const v = vOf(a);
      if (rHostId && v?.usable && v.how === 'host-login') return this._hostOwnUsage?.[rHostId];
      if (rHostId && v?.usable && v.how === 'host-held') return this._hostAccountUsage?.[`${rHostId}:${a.id}`];
      // codex accounts carry their own persisted quota buckets (/api/usage
      // codexAccounts, 2.368.18) — the switcher rows were blind to them
      return accountUsageStore(this, a.backend || 'claude')?.[a.id];
    };
    // Codex sessions bill the machine's ChatGPT login, not the claude CLI's —
    // the old backend-agnostic label ("CLI login") plus the CLAUDE global
    // quota chips below made a codex session's account row read as the claude
    // CLI login (owner report, 2.368.16).
    const globalLoginName = t(bill.cliLogin);
    const cliLabel = rHostId ? globalLoginName + ' @ ' + rHostName : globalLoginName;
    // apiKeyHelper honesty (2.191.0, CW-H200): when the CLI itself reported
    // apiKeySource=apiKeyHelper, "CLI login" IS the helper's API key — the
    // machine's OAuth login is overridden by the CLI's own precedence, and no
    // switcher pick can change that. Say so instead of leaving a menu that
    // looks like it should work but "does nothing".
    const helperActive = live?.auth?.source === 'api-other' && live?.auth?.detail === 'apiKeyHelper';
    items.push({
      // labelHtml contract: every text part escHtml'd inside rowHtml; only the
      // usage spans carry markup (see utils.showContextMenu).
      labelHtml: rowHtml((currentId === null ? '✓ ' : '') + cliLabel, helperActive ? ' · apiKeyHelper (API)' : '',
        // the machine usage caches are the CLAUDE login's quota — attaching
        // them to a codex row dressed the ChatGPT login in claude percentages
        !bill.machineUsage ? (rHostId ? '' : usageHint(accountUsageStore(this, backend)?.[bill.globalUsageKey], this._usageEstimates?.[bill.globalUsageKey])) : usageHint(rHostId ? this._hostOwnUsage?.[rHostId] : this._rateLimit, rHostId ? null : this._usageEstimates?.__global__)),
      action: () => { if (currentId !== null) doSwitch('subscription', cliLabel); },
    });
    if (helperActive) {
      items.push({ caption: t('Why API billing? apiKeyHelper is set on the machine'),
        title: t('The CLI prefers a configured apiKeyHelper over the machine\u2019s own OAuth login. Picking a NAMED subscription account below bypasses the helper for that session (the helper is neutralized at spawn); this CLI-login entry keeps billing via the helper.') });
    }
    for (const a of accts) {
      const cur = currentId === a.id;
      // Pooled pseudo-accounts are neither API keys nor plain subscriptions
      // (user report: the switcher tagged the pool '· API'): the row names
      // the CURRENT TARGET, and remote sessions can't use a pool at all
      // (local symlink mechanics — the server refuses the spawn too).
      if (a.pooled) {
        const sfx = a.currentName ? ` → ${a.currentName}` : ' ' + t('· pool');
        if (rHostId) { items.push({ label: a.name + sfx, off: t('Pooled accounts are local-only (the pool switches a credentials directory on THIS machine)') }); continue; }
        const estP = a.current ? (this._usageEstimates?.[a.current] || (this._usageGlobal?.accountId === a.current ? this._usageEstimates?.__global__ : null)) : null;
        // THE CONVERSATION'S POOL PIN (2026-09-28, owner: "变成池的子菜单，直接选池本身就是自动切换，如果在
        // 子菜单里选"自动"也是自动切换，但如果选择某个具体账号，那在这个账号耗尽之前就pin在这个账号下"): the pool
        // this conversation bills is a SUBMENU — Automatic first, then one row per member (✓ = the
        // member it runs on, "pinned" in words, the state in words, never greyed); clicking the pool
        // row itself = automatic. The row names THIS conversation's member (addendum 3 — the chip's
        // fact), the pool default only in words. A pool it does not bill stays a plain switch row.
        if (cur) {
          const auth = live?.auth && live.auth.source === 'pooled' ? live.auth : null;
          const cfgKey = spec.sessionKey || `${backend}:${backendSessionId}`;
          const isLive = !!live?.webuiId;
          const pinId = isLive ? (live?.poolPin?.memberId || null) : (this.sidebar?.getSessionConfig?.(cfgKey)?.poolPin?.memberId || null);
          const roster = this._accounts?.accounts || [];
          const stateOf = (id) => { const x = roster.find((y) => y.id === id) || {}; return memberState({ serve: x.serve || null, loggedIn: x.loggedIn !== false, loginState: x.loginState || null, usage: accountUsageStore(this, backend)?.[id] || null, nowSec: Date.now() / 1000 }); };
          const model = poolSubmenuModel({ pool: a, auth, pinId, live: isLive, applies: (a.hotSupported !== false && a.hot) ? 'now' : 'restart', stateOf });
          const fmtTime = (ms) => when(ms);
          const memUsage = (id) => (id ? usageHint(accountUsageStore(this, backend)?.[id] || null, bill.estimates ? (this._usageEstimates?.[id] || null) : null) : '');
          const pinTo = async (memberId, name) => {
            const cfg = this.sidebar?.getSessionConfig?.(cfgKey) || {};
            const saveCfg = (pin) => { const next = { ...cfg }; if (pin) next.poolPin = pin; else delete next.poolPin; this.sidebar?.setSessionConfig?.(cfgKey, next); };
            if (!isLive) { // a stopped conversation: the pin rides its next resume
              saveCfg(memberId ? { memberId, at: Date.now(), poolId: a.id } : null);
              showToast(memberId ? t('Pinned to {name} — applies when the conversation resumes', { name }) : t('Automatic again — applies when the conversation resumes'));
              return;
            }
            this.sidebar?.pinFence?.(cfgKey, memberId || null);   // B-2083's carrier follow (r5367): an older list never undoes this press — fenced until a list carries it
            const r = await fetchJson(`/api/accounts/${encodeURIComponent(a.id)}/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: live.webuiId, memberId }) });
            if (!r || r.error) { this.sidebar?.pinFence?.(cfgKey, undefined); showToast(r?.error || t('Pin failed'), { type: 'error' }); return; }
            saveCfg(r.pinned ? { memberId: r.pinned.memberId, at: r.pinned.at || Date.now(), poolId: a.id } : null); // the resume carrier (it names the pool the pin was made on); the server's notice says what happened
          };
          items.push({
            labelHtml: rowHtml('✓ ' + a.name, model.parent.member ? ` → ${model.parent.member}` : ' ' + t('· pool'), memUsage(model.parent.memberId)),
            title: model.parent.title ? t(model.parent.title.key, model.parent.title.params) + ' ' + t('Click for automatic placement; pick a member below to pin this conversation to it.') : undefined,
            action: () => pinTo(null),
            children: model.rows.map((r) => {
              const note = submenuNoteWords(r, t, { fmtTime });
              return {
                labelHtml: rowHtml((r.checked ? '✓ ' : '') + (r.act === 'auto' ? t(r.name) : r.name), note ? ' · ' + note : '', r.act === 'auto' ? '' : memUsage(r.id)),
                title: note || undefined,
                action: () => pinTo(r.act === 'auto' ? null : r.id, r.name),
              };
            }),
          });
          continue;
        }
        items.push({ labelHtml: rowHtml((cur ? '✓ ' : '') + a.name, sfx, usageHint(a.current ? this._accountUsage?.[a.current] : null, estP)), action: () => { if (!cur) doSwitch(a.id, a.name); } });
        continue;
      }
      const linked = rHostId && hostLinked(a) && (!bill.apiKeys || (a.type || 'api') === 'subscription');
      const held = !linked && rHostId && hostSubHeld(a) && (a.type || 'api') === 'subscription';
      const suffix = (bill.apiKeys && (a.type || 'api') !== 'subscription') ? ' · API'
        : linked ? ' ' + t('· is {host}’s machine login (same account)', { host: rHostName })
        : held ? ' ' + t('· own login held on {host}', { host: rHostName }) : '';
      let block = subBlock(a);
      // A reason derived from the LEGACY fallback (no verdict for this host
      // yet) is a guess — say so in the tooltip rather than let a cold cache
      // speak with the server's authority.
      if (block && verdictsCold) block += ' ' + t('(unconfirmed — {host} hasn’t answered the availability check yet)', { host: rHostName });
      // lane ui-controls-and-bugs (the walk: two accounts greyed, no reason): the why ON the row, and the door where sign-in lives
      // B-8703 unit 2 (主开发 r700): an account whose long-lived token EXPIRED — the door on this line is that account's own
      // «Long-lived token (expired)…» dialog (the door wears the Manage Agents row menu's own item for it), never a path to it; every
      // other block keeps «Manage agents…»
      const oatDead = !!block && block.startsWith(t('“{name}”’s long-lived token has expired — re-mint it', { name: a.name }));
      if (block && !cur) { items.push({ label: a.name + suffix, off: block, offDoor: oatDead ? { label: t('Long-lived token (expired)…'), action: () => this._oatDialog?.(a.id, a) } : { label: t('Manage agents…'), action: () => this._showAgentsDialog?.({ opener: 'billing' }) } }); continue; }
      // LINKED pick sends the REAL account id (2.241.0): the server's
      // email-linked rescue (ws-handler create, 2.240.2) maps it onto the
      // host's own login — zero creds ship — while session._accountId keeps
      // the picked identity, so the badge and this menu's ✓ show the account
      // instead of "CLI login @ host" (userN's sixth incident: a successful
      // linked switch READ as failed because the identity degraded to the
      // sentinel). The old client-side sentinel mapping predates the rescue.
      // estimates key on the LOCAL passive-cache identity — host-login /
      // host-held rows read a host-side cache no local estimator covers
      const estA = rHostId ? null
        : (this._usageEstimates?.[a.id] || (this._usageGlobal?.accountId === a.id ? this._usageEstimates?.__global__ : null));
      items.push({ labelHtml: rowHtml((cur ? '✓ ' : '') + a.name, suffix, usageHint(usageFor(a), estA)), action: () => { if (!cur) doSwitch(a.id, a.name); } });
    }
    if (shipBlocked) { const d = settingsDoor(this, 'accounts.shipSubscriptionToRemote', { label: t('Ship subscription logins to remote hosts…') }); if (d) items.push({ label: d.label, action: () => d.run() }); } // door: 'ship-setting'
    let menuEl;
    items.unshift({ caption: t('This session’s billing account') });   // lane ui-controls-and-bugs: the menu says what it is (the walk: a bare list)
    if (anchor && typeof anchor.getBoundingClientRect === 'function') {
      const r = anchor.getBoundingClientRect();
      menuEl = showContextMenu(r.left, r.bottom + 4, items);
    } else {
      menuEl = showContextMenu(anchor?.x || 40, anchor?.y || 40, items);
    }
    this._billingMenu = { el: menuEl, host: rHostId, args: [winId, anchor] };
  },

  // Clicking Fork opens a popup for the first message. The fork only diverges
  // into its own session once that message is sent (the backend mints the
  // fork's new id on first input), so prompting up front gives the user an
  // immediately-distinct session instead of a window indistinguishable from a
  // resume. Terminal-mode forks have no chat input, so they fork directly.
  forkSession(sessionInfo) {
    const mode = sessionInfo.webuiMode || this.settings.get('session.defaultMode') || 'chat';
    if (mode !== 'chat') { this._doForkSession(sessionInfo, ''); return; }
    this._openForkDialog(sessionInfo, null);
  },

  // Fork from a specific assistant message (chat fork button). Passes the
  // message uuid as the truncation point (--resume-session-at) so the branch
  // contains the conversation only up to that message.
  forkFromMessage(sessionInfo, messageUuid) {
    this._openForkDialog(sessionInfo, messageUuid || null);
  },

  _openForkDialog(sessionInfo, forkAtUuid) {
    this._pendingFork = sessionInfo;
    this._pendingForkAt = forkAtUuid;
    if (this.isMobile) this.sidebar.toggle(false);
    this._showDialog('dialog-fork');
    // Swap the hint depending on whole-session vs from-a-point fork
    const genHint = document.getElementById('fork-hint-general');
    const atHint = document.getElementById('fork-hint-at');
    if (genHint) genHint.classList.toggle('hidden', !!forkAtUuid);
    if (atHint) atHint.classList.toggle('hidden', !forkAtUuid);
    const titleInput = document.getElementById('fork-title');
    if (titleInput) titleInput.value = this._defaultForkName(sessionInfo); // editable default
    const ta = document.getElementById('fork-first-message');
    const btn = document.getElementById('btn-fork-send');
    if (ta) { ta.value = ''; }
    if (btn) { btn.disabled = true; }
    if (ta) setTimeout(() => ta.focus(), 0);
  },

  // Programmatically send a chat message to a live chat session (used for the
  // fork first-message popup). The server echoes it back via the normalizer, so
  // the ChatView renders it without any local preview.
  _sendChatMessage(sessionId, text) {
    const t = (text || '').trim();
    if (!t) return;
    this.ws.send({ type: 'chat-input', sessionId, text: t, msgId: Date.now() + '-' + Math.random().toString(36).slice(2, 8) });
  },

  // Default fork title: "<base> (forked)" with a numeric suffix to stay unique.
  _defaultForkName(sessionInfo) {
    const baseName = sessionInfo.webuiName || sessionInfo.name || 'Session';
    const allNames = (this.sidebar._allSessions || []).map(s => s.webuiName || s.name || '');
    let forkName = `${baseName} (forked)`;
    let n = 2;
    while (allNames.includes(forkName)) { forkName = `${baseName} (forked ${n++})`; }
    return forkName;
  },

  async _doForkSession(sessionInfo, initialMessage = '', resumeAt = null, customName = '') {
    const backend = sessionInfo.backend || 'claude';
    const resumeId = sessionInfo.backendSessionId || sessionInfo.sessionId;
    let openAt = this._openStartNow();   // B-c87d r871: the fork's start is its press, read before the harness offer's wait
    // A fork of an OpenCode conversation is MINTED through the background
    // service (POST /session/:id/fork) — unlike a resume it genuinely cannot
    // work without it, so this one waits for the offer and only then spawns.
    try { await this.maybeOfferHarnessService?.(backend, { needsService: true }); } catch {}
    { const again = this._openStartNow(); if (again && again.by === 'act') openAt = again; }   // r945: an offer the person pressed is the fork's start
    const forkName = (customName && customName.trim()) || this._defaultForkName(sessionInfo);

    const mode = sessionInfo.webuiMode || this.settings.get('session.defaultMode') || 'chat';
    // The fork FLAGS are the server's (B-8b7b): `fork: true` + `forkAtUuid`
    // are the whole request — the claude adapter derives --fork-session and
    // --resume-session-at from them, for every caller (an API create too).
    // PER-SESSION GIT WORKTREE (owner ruling 9). A fork is the OTHER spawn that
    // emits `--worktree` (worktreeSpawnArgs: `--fork-session` STRIPS the CLI's
    // recorded `worktreeSession`, so the branch inherits nothing and would run
    // in the user's real working tree unless we ask again). Round-2 verifier,
    // MAJOR: this call carried no `worktree` key at all, so that branch had NO
    // producer in production — the Session Properties hint ("Applies when a new
    // session or a fork starts") promised something the product could not do,
    // and the suite pinned the pure rule with a call no site could make.
    // The answer is the ONE rule the checkbox itself displays: the standing
    // pick if there is one, else what the run being forked turned out to be.
    const forkCfg = this.sidebar?.getSessionConfig?.(sessionInfo) || {};
    const forkWorktree = worktreePick({ saved: forkCfg.worktree, live: sessionInfo.worktree });
    // TASK GROUPS (owner 2026-09-25: "fork的会话不会自动分配到和fork之前的会话
    // 相同的group里"). The fork inherits EVERY group its source is explicitly
    // tagged with — read off the sidebar's store, never the DOM. The first
    // rides the spawn as `taskId` (the server's _initialGroupId: the task
    // context from the first turn); the rest are pending binds written once
    // the fork's own id appears (chat: the stream parser; terminal: the lock
    // capture, src/claude-lock-capture.js). Folder auto-include needs nothing
    // (same cwd). The star is NOT inherited (not asked for).
    const forkGroups = forkGroupPlan(this.sidebar?._getSessionTasks?.(sessionInfo) || []);
    this.createSession({
      cwd: sessionInfo.cwd,
      name: forkName,
      resumeId,
      mode,
      openAt,
      backend,
      backendSessionId: resumeId,
      fork: true,
      worktree: forkWorktree || undefined,
      // remote sessions fork ON their host — omitting this spawned a LOCAL
      // `claude --resume <remote-id> --fork-session` against a transcript
      // that doesn't exist here (audit 2.192.0)
      hostId: sessionInfo.host || sessionInfo.hostId || undefined,
      initialMessage,
      forkAtUuid: resumeAt || undefined,
      forkTitle: forkName,
      taskId: forkGroups.taskId || undefined,
      extraTaskBinds: forkGroups.pendingBinds,
    });
  },

  // Open a stopped session as view-only (load JSONL, no claude --resume)
  viewSession(sessionId, cwd, sessionName, { syncId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, hostId, offerService = true } = {}) {
    cwd = stripCwdHostLabel(cwd);
    this._closeSidebarOnMobile();
    this._hideWelcome();
    const resolvedSessionId = backendSessionId || sessionId;
    const viewId = viewIdFor(backend, resolvedSessionId);
    const openSpec = {
      action: 'viewSession',
      sessionId,
      backend,
      backendSessionId: resolvedSessionId,
      sessionKey: `${backend}:${resolvedSessionId}`,
      agentKind: agentKind || 'primary',
      agentRole: agentRole || '',
      agentNickname: agentNickname || '',
      sourceKind: sourceKind || '',
      parentThreadId: parentThreadId || null,
      hostId: hostId || undefined,
      cwd,
      name: sessionName,
    };
    const winInfo = this.wm.createWindow({
      title: `${sessionName || t('History')} — ${cwd}`,
      type: 'chat',
      syncId,
      openSpec,
      titleMeta: this._buildTitleMeta(openSpec),
    });
    this._viewIntoWindow(winInfo, { backend, backendSessionId: resolvedSessionId, cwd, name: sessionName, hostId,
      // A sub-agent's own conversation (claude Task viewer, codex collab child
      // thread) is read-only by NATURE, not by death — no Resume bar.
      subagentView: (agentKind || 'primary') === 'subagent' || sourceKind === 'subagent' });
    // Reading a STOPPED conversation is exactly what the opt-in background
    // service exists for: offer it (once) while the read-only attach runs, and
    // when it is enabled re-open this window against the now-live store — the
    // pending action continues instead of leaving an error pane behind.
    if (offerService) try {
      Promise.resolve(this.maybeOfferHarnessService?.(backend, {
        needsService: true,
        retry: () => {
          if (!this._winIs(winInfo)) return; // this window, the instance (r3 N2) — one re-made under its id is not this retry's
          // keep the window where it was (geometry AND desktop) — the same
          // rule createSession's winBounds follows, or the reopened history
          // "moves" to whatever desktop happens to be active (2.295.0 class)
          const re = this._reopenWin(winInfo.id), bounds = re?.place; // the row, re-opened under its own id (r2 N1)
          if (re) syncId = re.id;
          const again = this.viewSession(sessionId, cwd, sessionName, { syncId, backend, backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, hostId, offerService: false });
          if (!again) return;
          if (bounds?.gridBounds) { again.gridBounds = { ...bounds.gridBounds }; this.wm._applyGridBounds(again); }
          const dm = this.desktopManager, home = bounds?.desktopId;
          if (home && home !== '__stage__' && home !== again._desktopId && (dm?._desktops || []).some((d) => d.id === home)) {
            try { dm.moveWindowToDesktop(again.id, home); } catch {}
          }
        },
      })).catch(() => {});
    } catch {}
    return winInfo;
  },

  // Drive the view-only pipeline into an EXISTING window: build a read-only
  // ChatView, request the viewOnly attach (server loads the JSONL — local
  // transcript or the host-less remote-jsonl cache scan; stale cache beats no
  // history, so it works with the session's host machine down), render on
  // 'attached'. Shared by viewSession and attachSession's dead-session rescue
  // (the blank-window class: a stale serverId replayed after the server lost
  // its sessions used to leave a bare shell with no ChatView at all).
  _viewIntoWindow(winInfo, { backend = 'claude', backendSessionId, cwd, name, hostId, subagentView = false } = {}) {
    const viewId = viewIdFor(backend, backendSessionId);
    const chatView = new ChatView(winInfo, this.ws, viewId, this, { readOnly: true, subagentView });
    this.sessions.set(winInfo.id, chatView); this.wm.syncHiddenViews?.(); // a view born hidden (mobile/tab/minimized) starts suspended (inc-mu6bfv1t-4drq)
    this._mobileNav?.updateTitle?.();   // the top bar's search door follows the conversation now on show (its view is registered after its window became active — a view-only window's magnifier stayed off; lane mask-value-shape)
    const hostName = this._hostLabel(hostId);
    // For a REMOTE session the server first pulls the transcript over ssh
    // (seconds, up to the 15s ssh budget) — the pane used to be BLANK for all
    // of it, and read-only windows are skipped by the reconnect re-attach
    // ladder, so a lost reply left it blank FOREVER with no error and no
    // retry: indistinguishable from an empty conversation.
    const loadingEl = chatView._renderers.appendSystem(hostName
      ? t('Loading history from {host}…', { host: hostName })
      : t('Loading history…'));

    // ws.request (not a bare send + onGlobal): the view-only attach is
    // idempotent, so it can be RE-SENT after a reconnect — a server restart
    // between request and reply is exactly the documented blank-shell class.
    const viewSpec = {
      type: 'attach',
      sessionId: viewId,
      viewOnly: true,
      slab: attachSlab({ suspended: !!chatView._suspended, inFlight: this.ws.attachesInFlight?.() ?? 0 }), // perf r1 (a boot resume-all opens N at once)
      backend,
      backendSessionId,
      claudeSessionId: legacyIdFor(backend, backendSessionId) ?? undefined,
      host: hostId || undefined, // remote session: server pulls the transcript over ssh first
      cwd,
      name,
    };
    chatView._viewAttachSpec = viewSpec;   // row B-422c (r1243 item 2): the view's own request, re-sent by itself while its history is not loaded
    this.ws.request(viewSpec, (msg) => {
      if (msg.type === 'error' && msg.sessionId === viewId) {
        loadingEl?.remove();
        chatView._renderers.appendSystem(msg.message || t('Session not found.'));
        return true;
      }
      if (msg.type === 'attached' && msg.sessionId === viewId) {
        loadingEl?.remove();
        if (msg.messages?.length) {
          chatView.loadHistory(msg.messages, msg.totalCount, false, { chatStatus: msg.chatStatus });
        } else if (!msg.historyNotLoaded) {
          // Zero messages (empty/aborted transcript, or a brand-new session
          // whose JSONL hasn't flushed yet) — say so instead of a silent blank
          // pane (blank windows read as bugs; real user report).
          chatView._renderers.appendSystem(t("No messages in this session's transcript yet."));
        }
        if (msg.historyNotLoaded) chatView._sayHistoryNotLoaded?.(msg.historyNotLoaded, { info: msg.historyNotLoadedInfo || null });   // row B-422c: never «no messages» for a history the reader refused
        return true;
      }
      return false;
    }, {
      // Window closed before 'attached' — the request self-cleans so a stale
      // fire can't call loadHistory on a disposed ChatView (which throws
      // mid-dispatch and swallows every later handler's message).
      isAlive: () => this._winIs(winInfo), // the window INSTANCE (r3 N2): one re-made under the same id is another window
      timeoutMs: 20000,
      onTimeout: () => {
        try { track('event', 'ws-reply-timeout:view', viewId); } catch { }
        // Rewrite the inner .chat-system node, never the wrapper's textContent
        // (that would flatten appendSystem's structure).
        const inner = loadingEl?.isConnected ? loadingEl.querySelector('.chat-system') : null;
        if (inner) inner.textContent = hostName
          ? t('Still loading — {host} may be slow to hand over the transcript.', { host: hostName })
          : t('Still loading the transcript…');
      },
      resend: true,
    });
    winInfo.onClose = () => { chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome(); };
    winInfo._notifyChanged = () => this.updateTaskbar();
    return chatView;
  },

  // Replay a serialized openSpec to recreate a window (cross-client sync,
  // layout restore, desktop switch, stage). Dispatch lives in the WINDOW-TYPE
  // REGISTRY (window-types.js, Plugin Ph1): every window kind registers its
  // replay in the module that owns it; an unknown action is LOUD there
  // (console.warn + 'openspec-unknown' telemetry) — the switch this replaced
  // had no default, so a spec nobody could replay vanished silently.
  replayOpenSpec(spec, syncId) {
    return replayOpenSpecViaRegistry(this, spec, { syncId });
  },
  });
}

// ── WINDOW-TYPE REGISTRATIONS (Plugin Ph1): the session window kinds ──
// chat/terminal restore by SESSION IDENTITY, not by spec (persist:false —
// layout.js's former TRANSIENT_WINDOW_TYPES): their openSpec arrives async
// after 'created'. The replay bodies are the former replayOpenSpec switch
// cases, verbatim (`this` → `app`).
function replayAttachSession(app, spec, { syncId } = {}) {
  // The saved serverId/name may be STALE — the dtach instance dies and
  // gets resumed under a new server id while the spec persists in the
  // autosave (and the name was captured at window creation, before any
  // rename). Re-resolve against the live session list like restoreState
  // does; a spec replayed verbatim attaches to a nonexistent session and
  // leaves a blank window that re-persists the stale spec forever.
  const backend = spec.backend || 'claude';
  // A bsid equal to the serverId is POLLUTION from pre-2.105.2 specs
  // (the webui id was baked in before the CLI reported a real id —
  // long window on remote spawns): treat it as no bsid, or the
  // re-resolution below misses on it and opens a bogus view-only
  // window (real report: remote-host session blank on other clients).
  const bsid = (spec.backendSessionId && spec.backendSessionId !== spec.serverId)
    ? spec.backendSessionId : null;
  const live = app.sidebar?._webuiSessions || [];
  let serverId = spec.serverId;
  let name = spec.name;
  let cwd = spec.cwd;
  if (bsid && !live.some(s => s.id === serverId)) {
    const alive = live.find(s => (s.backend || 'claude') === backend
      && (s.backendSessionId || s.claudeSessionId) === bsid);
    if (alive) {
      serverId = alive.id;
      name = alive.name || name;
      cwd = alive.cwd || cwd;
    } else if (live.length && !serverId) {
      // Session is dead — open read-only history with a Resume bar
      // instead of a blank window stuck on a failed attach. Only when
      // there is NO serverId to try: a serverId the local list doesn't
      // know yet is usually a RACE (layout-sync beat the active-sessions
      // push for a just-created session) — attach directly and let the
      // server be authoritative; a genuinely dead session's attach
      // errors into the read-only path anyway.
      return app.viewSession(bsid, cwd, app.sidebar?.getCustomName(spec.sessionKey || bsid) || name, {
        syncId, backend, backendSessionId: bsid, hostId: spec.hostId || spec.host || undefined,
        agentKind: spec.agentKind, agentRole: spec.agentRole,
        agentNickname: spec.agentNickname, sourceKind: spec.sourceKind,
        parentThreadId: spec.parentThreadId,
        offerService: false, // a layout REPLAY is not the user reaching for OpenCode history — never pop the first-use dialog on boot
      });
    }
  }
  if (bsid) name = app.sidebar?.getCustomName(spec.sessionKey || bsid) || name;
  return app.attachSession(serverId, name, cwd, {
    mode: spec.mode,
    syncId,
    backend,
    backendSessionId: bsid,
    hostId: spec.hostId || spec.host || undefined,
    agentKind: spec.agentKind,
    agentRole: spec.agentRole,
    agentNickname: spec.agentNickname,
    sourceKind: spec.sourceKind,
    parentThreadId: spec.parentThreadId,
  });
}

function replayViewSession(app, spec, { syncId } = {}) {
  return app.viewSession(spec.sessionId, spec.cwd, spec.name, {
    hostId: spec.hostId || spec.host || undefined,
    syncId,
    backend: spec.backend || 'claude',
    backendSessionId: spec.backendSessionId || spec.sessionId,
    agentKind: spec.agentKind,
    agentRole: spec.agentRole,
    agentNickname: spec.agentNickname,
    sourceKind: spec.sourceKind,
    parentThreadId: spec.parentThreadId,
    offerService: false, // layout restore / cross-client replay — not a user action, so no first-use dialog on boot
  });
}

function replayViewSubagent(app, spec, { syncId } = {}) {
  const title = t('Agent: {desc}', { desc: spec.description || t('Subagent') });
  const winInfo = app.wm.createWindow({
    title,
    type: 'chat',
    syncId,
    openSpec: spec,
    titleMeta: app._buildTitleMeta({
      backend: spec.backend || 'claude',
      agentKind: spec.agentKind || 'subagent',
      agentRole: spec.agentRole,
      agentNickname: spec.agentNickname,
      sourceKind: spec.sourceKind,
      parentThreadId: spec.parentThreadId,
    }),
  });
  const view = new ChatView(winInfo, app.ws, spec.virtualId, app, { readOnly: true });
  app.sessions.set(winInfo.id, view); app.wm.syncHiddenViews?.(); // (inc-mu6bfv1t-4drq)
  app.ws.send({
    type: 'attach',
    sessionId: spec.virtualId,
    parentSessionId: spec.parentSessionId,
    backend: spec.backend || 'claude',
    backendSessionId: spec.backendSessionId || spec.claudeSessionId,
    claudeSessionId: spec.claudeSessionId,
    cwd: spec.cwd,
    hostId: spec.hostId || spec.host || undefined, // remote workflow agent → transcript on the host (2.191.0)
    agentId: spec.agentId || undefined, // lane S1: a live helper view whose buffers are gone reads the transcript instead
  });
  const handler = (msg) => {
    if (!app.wm.windows.has(winInfo.id)) { app.ws.offGlobal(handler); return; }
    if (msg.type === 'error' && msg.sessionId === spec.virtualId) { app.ws.offGlobal(handler); return; }
    if (msg.type === 'attached' && msg.sessionId === spec.virtualId) {
      app.ws.offGlobal(handler);
      if (msg.messages?.length) view.loadHistory(msg.messages, msg.totalCount, msg.isStreaming);
    }
  };
  app.ws.onGlobal(handler);
  winInfo.onClose = () => { app.ws.offGlobal(handler); view.dispose(); app.sessions.delete(winInfo.id); app._checkWelcome(); };
  return winInfo;
}

registerWindowType({
  type: 'terminal', label: 'Terminal', persist: false,
  icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4.5 7l2 2-2 2M8.5 11h3"/>'),
  action: 'attachTmuxSession', replay: (app, spec) => app.attachTmuxSession(spec.tmuxTarget, spec.name, spec.cwd, { replay: true }),
});
registerWindowType({
  type: 'chat', label: 'Chat', persist: false,
  icon: svgIcon16('<path d="M2 3a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6l-4 3V3z"/>'),
  // attachSession opens a chat OR terminal window by spec.mode — registered on its home kind.
  actions: { attachSession: replayAttachSession, viewSession: replayViewSession, viewSubagent: replayViewSubagent },
});
