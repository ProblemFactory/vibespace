'use strict';
/**
 * THE CDP CENSUS — PURE (imports nothing; CJS so the mediator, the keeper, the CLI AND the bundle share ONE table).
 * docs/design-agent-browser-v2.md §6.2.1 (verify S2 r4, 2026-09-26).
 *
 * Every method the installed Chrome's own protocol lists (scripts/fixtures/cdp-protocol-<version>/ — the pinned
 * GET /json/protocol; 58 domains, 664 methods on 153.0.8010.47) has ONE row here, classed by what it can do to the
 * tab the user is driving through the live view. Three verify rounds (r1 CRITICAL, r2 MAJOR, r3 MEDIUM ×2) each found
 * the takeover fence ONE METHOD SHORT because the fence was a hand-written LIST (Input.* + a navigation family, then
 * + setIgnoreInputEvents, then + DOM.focus): a list names what somebody thought of; a census names what the vendor
 * ships. The rule is now: the table is complete over the vendor's list, the judge reads the CLASS, and a method with
 * NO ROW (a newer Chrome) is refused while the user drives and NAMED in the refusal, so the gap is visible, never a hole.
 *
 * The classes (CLASSES, closed) and what the mediator does with each while the USER drives (`paused`) — since the
 * owner's ruling of 2026-09-27 ("直接打断所有脚本和agent操作", src/browser-interrupt.js) every class but read / session /
 * harmless is refused `browser_interrupted`, and a call of those classes still in flight at the takeover is ABORTED:
 *   input          moves keys / pointer / touch / drag / text / files / focus / autofill INTO the page — refused
 *                  (browser_interrupted); the user's own takeover input passes on a CREDIT bound to its exact call + tab
 *                  (browser-mediation.js, lane S2 r1/r2)
 *   view           changes what the user is LOOKING AT or how the page under their hands behaves: which tab (create /
 *                  close / activate / open a window), the page (navigate / reload / stop / history / document / dialogs),
 *                  the viewport / scale / screen / emulated media / vision / dark mode / scrollbars, a frozen page
 *                  (Debugger pause + breakpoints, virtual time, script execution off, lifecycle state, throttling),
 *                  overlays painted on the page, casting — refused (browser_interrupted)
 *   page-mutation  changes the page's CONTENT, its SCRIPT environment, or the STATE it reads: script evaluation, DOM /
 *                  CSS / animation edits, cookies / storage / cache / permissions / service workers / WebAuthn /
 *                  request interception / headers / UA / geolocation / timezone / sensor overrides — refused
 *                  (browser_interrupted) since 2026-09-27: the owner's ruling superseded D6 ("script evaluation is not
 *                  fenced") and retired the r4 switch `browser.fenceScriptsWhileDriven` — a script the agent is RUNNING
 *                  at the takeover is also asked to stop (Runtime.terminateExecution; one awaiting a timer cannot be)
 *   read           observation only (get* / describe* / query* / screenshot / screencast / layout / AX tree / cookies
 *                  READ / profiles / tracing) — never refused
 *   session        attach / detach / discover / contexts — the existing Target.* SCOPING rules apply (a lease sees and
 *                  reaches only its own targets), never the paused fence
 *   harmless       domain enable / disable, event toggles, acks, releases — never refused
 *   refused        whole-browser or whole-machine acts and the escape hatches out of the mediation (Browser.close /
 *                  crash*, exposeDevToolsProtocol, setRemoteLocations, sendMessageToTarget, Tethering, an unpacked
 *                  extension, desktop mirroring, a renderer crash, the deaf-page arm) — refused on every lease, paused
 *                  or not (method_refused)
 *
 * TAB SCOPING — the rule per class is LEASE-WIDE for every class (decided r4, said here so it is not re-litigated one
 * method at a time): (1) the mediator cannot tell a tab from a frame under the driven tab — an out-of-process iframe's
 * session is another targetId — so "the agent's other tab" is not a fact it can prove without a parent map; (2) the
 * CLI rung (/resolve) already refuses EVERY page verb while the user drives, so a mediator that admitted input on
 * "other tabs" would make the raw-binary rung looser than the sanctioned one; (3) the daemon's own `tab <n>` moves
 * the active tab, so "another tab" is a moving target; (4) a key dispatched on any tab of a shared window can reach a
 * browser accelerator (not measured — fail closed). A row's `fence: 'anchor'` names the ONE method the mediator does
 * NOT refuse although its class says so: Page.bringToFront, measured (r2 + r3) to be refused by the live view's takeover
 * anchor instead (refusing it at the mediator leaves the switched-to tab hidden and the stream dead).
 *
 * A row is `'<cls>'` (since = SINCE, this census), `['<cls>', '<since>']` (an entry older than the census — the P6
 * list of 2026-09-21, the r3 doors), or `{ cls, since, fence?, why? }`. The gate: test-browser-mediation ⑥ (every
 * method of the pinned protocol has a row and every row names a method of it; the class rules; three patched-copy
 * controls) + test-browser-mediation-chrome ⑥ (the live protocol of the launched Chrome — extras are PRINTED and fail
 * until classified; the four classes' representative methods against a real paused lease, effects observed).
 */
const SINCE = '2026-09-26';
/** The Chrome whose protocol this table was censused against (the fixture directory carries the same version). */
const CENSUS_CHROME = '153.0.8010.47';
const CLASSES = Object.freeze(['input', 'view', 'page-mutation', 'read', 'session', 'harmless', 'refused']);
/** What the paused fence does with a class: 'refuse' (input / view / page-mutation — the owner's ruling of 2026-09-27;
 *  the r4 'switch' rule and its setting are retired), 'allow' (read / session / harmless); 'refused' rows never reach the fence. */
const PAUSED_RULE = Object.freeze({ input: 'refuse', view: 'refuse', 'page-mutation': 'refuse', read: 'allow', session: 'allow', harmless: 'allow', refused: 'always' });
const ROWS = Object.freeze({
  Accessibility: {
    disable: 'harmless', enable: 'harmless', getPartialAXTree: 'read', getFullAXTree: 'read', getRootAXNode: 'read', getAXNodeAndAncestors: 'read',
    getChildAXNodes: 'read', queryAXTree: 'read',
  },
  Ads: {
    getAdMetrics: 'read',
  },
  Animation: {
    disable: 'harmless', enable: 'harmless', getCurrentTime: 'read', getPlaybackRate: 'read', releaseAnimations: 'harmless', resolveAnimation: 'read',
    seekAnimations: 'page-mutation', setPaused: 'page-mutation', setPlaybackRate: 'page-mutation', setTiming: 'page-mutation',
  },
  Audits: {
    getEncodedResponse: 'read', disable: 'harmless', enable: 'harmless', checkFormsIssues: 'read',
  },
  Autofill: {
    trigger: 'input', setAddresses: 'page-mutation', disable: 'harmless', enable: 'harmless',
  },
  BackgroundService: {
    startObserving: 'harmless', stopObserving: 'harmless', setRecording: 'harmless', clearEvents: 'harmless',
  },
  BluetoothEmulation: {
    enable: 'page-mutation', setSimulatedCentralState: 'page-mutation', disable: 'harmless', simulatePreconnectedPeripheral: 'page-mutation',
    simulateAdvertisement: 'page-mutation', simulateGATTOperationResponse: 'page-mutation', simulateCharacteristicOperationResponse: 'page-mutation',
    simulateDescriptorOperationResponse: 'page-mutation', addService: 'page-mutation', removeService: 'page-mutation',
    addCharacteristic: 'page-mutation', removeCharacteristic: 'page-mutation', addDescriptor: 'page-mutation', removeDescriptor: 'page-mutation',
    simulateGATTDisconnection: 'page-mutation',
  },
  Browser: {
    setPermission: 'page-mutation', grantPermissions: 'page-mutation', resetPermissions: 'page-mutation', setDownloadBehavior: 'page-mutation',
    cancelDownload: 'page-mutation', close: ['refused', '2026-09-21'], crash: ['refused', '2026-09-21'], crashGpuProcess: ['refused', '2026-09-21'],
    getVersion: 'read', getBrowserCommandLine: 'read', getHistograms: 'read', getHistogram: 'read', getWindowBounds: 'read', getWindowForTarget: 'read',
    setWindowBounds: 'view', setContentsSize: 'view', setDockTile: 'harmless', executeBrowserCommand: 'refused',
    addPrivacySandboxEnrollmentOverride: 'page-mutation',
  },
  CSS: {
    addRule: 'page-mutation', collectClassNames: 'read', createStyleSheet: 'page-mutation', disable: 'harmless', enable: 'harmless',
    forcePseudoState: 'page-mutation', forceStartingStyle: 'page-mutation', getBackgroundColors: 'read', getComputedStyleForNode: 'read',
    resolveValues: 'read', getLonghandProperties: 'read', getInlineStylesForNode: 'read', getAnimatedStylesForNode: 'read',
    getMatchedStylesForNode: 'read', getEnvironmentVariables: 'read', getMediaQueries: 'read', getPlatformFontsForNode: 'read',
    getStyleSheetText: 'read', getLayersForNode: 'read', getLocationForSelector: 'read', trackComputedStyleUpdatesForNode: 'read',
    trackComputedStyleUpdates: 'read', takeComputedStyleUpdates: 'read', setEffectivePropertyValueForNode: 'page-mutation',
    setPropertyRulePropertyName: 'page-mutation', setKeyframeKey: 'page-mutation', setMediaText: 'page-mutation',
    setContainerQueryText: 'page-mutation', setContainerQueryConditionText: 'page-mutation', setSupportsText: 'page-mutation',
    setNavigationText: 'page-mutation', setScopeText: 'page-mutation', setRuleSelector: 'page-mutation', setStyleSheetText: 'page-mutation',
    setStyleTexts: 'page-mutation', startRuleUsageTracking: 'harmless', stopRuleUsageTracking: 'read', takeCoverageDelta: 'read',
    setLocalFontsEnabled: 'page-mutation',
  },
  CacheStorage: {
    deleteCache: 'page-mutation', deleteEntry: 'page-mutation', requestCacheNames: 'read', requestCachedResponse: 'read', requestEntries: 'read',
  },
  Cast: {
    enable: 'harmless', disable: 'harmless', setSinkToUse: 'page-mutation', startDesktopMirroring: 'refused', startTabMirroring: 'view',
    stopCasting: 'view',
  },
  CrashReportContext: {
    getEntries: 'read',
  },
  DOM: {
    collectClassNamesFromSubtree: 'read', copyTo: 'page-mutation', describeNode: 'read', scrollIntoViewIfNeeded: 'view', disable: 'harmless',
    discardSearchResults: 'harmless', enable: 'harmless', focus: 'input', getAttributes: 'read', getBoxModel: 'read', getContentQuads: 'read',
    getDocument: 'read', getFlattenedDocument: 'read', getNodesForSubtreeByStyle: 'read', getNodeForLocation: 'read', getOuterHTML: 'read',
    getRelayoutBoundary: 'read', getSearchResults: 'read', hideHighlight: 'harmless', highlightNode: 'view', highlightRect: 'view',
    markUndoableState: 'harmless', moveTo: 'page-mutation', performSearch: 'read', pushNodeByPathToFrontend: 'read',
    pushNodesByBackendIdsToFrontend: 'read', querySelector: 'read', querySelectorAll: 'read', getTopLayerElements: 'read', getElementByRelation: 'read',
    redo: 'page-mutation', removeAttribute: 'page-mutation', removeNode: 'page-mutation', requestChildNodes: 'read', requestNode: 'read',
    resolveNode: 'read', setAttributeValue: 'page-mutation', setAttributesAsText: 'page-mutation', setFileInputFiles: ['input', '2026-09-21'],
    setNodeStackTracesEnabled: 'harmless', getNodeStackTraces: 'read', getFileInfo: 'read', getDetachedDomNodes: 'read', setInspectedNode: 'harmless',
    setNodeName: 'page-mutation', setNodeValue: 'page-mutation', setOuterHTML: 'page-mutation', undo: 'page-mutation', getFrameOwner: 'read',
    getContainerForNode: 'read', getQueryingDescendantsForContainer: 'read', getAnchorElement: 'read', forceShowPopover: 'page-mutation',
    forceShowInterest: 'page-mutation',
  },
  DOMDebugger: {
    getEventListeners: 'read', removeDOMBreakpoint: 'harmless', removeEventListenerBreakpoint: 'harmless', removeInstrumentationBreakpoint: 'harmless',
    removeXHRBreakpoint: 'harmless', setBreakOnCSPViolation: 'view', setDOMBreakpoint: 'view', setEventListenerBreakpoint: 'view',
    setInstrumentationBreakpoint: 'view', setXHRBreakpoint: 'view',
  },
  DOMSnapshot: {
    disable: 'harmless', enable: 'harmless', getSnapshot: 'read', captureSnapshot: 'read',
  },
  DOMStorage: {
    clear: 'page-mutation', disable: 'harmless', enable: 'harmless', getDOMStorageItems: 'read', removeDOMStorageItem: 'page-mutation',
    setDOMStorageItem: 'page-mutation',
  },
  DeviceAccess: {
    enable: 'harmless', disable: 'harmless', selectPrompt: 'view', cancelPrompt: 'view',
  },
  DeviceOrientation: {
    clearDeviceOrientationOverride: 'page-mutation', setDeviceOrientationOverride: 'page-mutation',
  },
  DigitalCredentials: {
    setVirtualWalletBehavior: 'page-mutation',
  },
  Emulation: {
    canEmulate: 'read', clearDeviceMetricsOverride: 'view', clearGeolocationOverride: 'page-mutation', resetPageScaleFactor: 'view',
    setFocusEmulationEnabled: 'view', setAutoDarkModeOverride: 'view', setCPUThrottlingRate: 'view', setDefaultBackgroundColorOverride: 'view',
    setSafeAreaInsetsOverride: 'view', setVirtualKeyboardGeometryOverride: 'view', setDeviceMetricsOverride: 'view', setDevicePostureOverride: 'view',
    clearDevicePostureOverride: 'view', setDisplayFeaturesOverride: 'view', clearDisplayFeaturesOverride: 'view', setScrollbarsHidden: 'view',
    setDocumentCookieDisabled: 'page-mutation', setEmitTouchEventsForMouse: 'view', setEmulatedMedia: 'view', setEmulatedVisionDeficiency: 'view',
    setEmulatedOSTextScale: 'view', setGeolocationOverride: 'page-mutation', getOverriddenSensorInformation: 'read',
    setSensorOverrideEnabled: 'page-mutation', setSensorOverrideReadings: 'page-mutation', setPressureSourceOverrideEnabled: 'page-mutation',
    setPressureStateOverride: 'page-mutation', setIdleOverride: 'page-mutation', clearIdleOverride: 'page-mutation',
    setNavigatorOverrides: 'page-mutation', setPageScaleFactor: 'view', setScriptExecutionDisabled: 'view', setTouchEmulationEnabled: 'view',
    setVirtualTimePolicy: 'view', setLocaleOverride: 'page-mutation', setTimezoneOverride: 'page-mutation', setVisibleSize: 'view',
    setDisabledImageTypes: 'view', setDataSaverOverride: 'page-mutation', setHardwareConcurrencyOverride: 'page-mutation',
    setCPUPerformanceOverride: 'page-mutation', setUserAgentOverride: 'page-mutation', setAutomationOverride: 'page-mutation',
    setSmallViewportHeightDifferenceOverride: 'view', getScreenInfos: 'read', addScreen: 'view', updateScreen: 'view', removeScreen: 'view',
    setPrimaryScreen: 'view',
  },
  EventBreakpoints: {
    setInstrumentationBreakpoint: 'view', removeInstrumentationBreakpoint: 'harmless', disable: 'harmless',
  },
  Extensions: {
    triggerAction: 'view', loadUnpacked: 'refused', getExtensions: 'read', uninstall: 'refused', getStorageItems: 'read',
    removeStorageItems: 'page-mutation', clearStorageItems: 'page-mutation', setStorageItems: 'page-mutation',
  },
  FedCm: {
    enable: 'page-mutation', disable: 'harmless', selectAccount: 'view', clickDialogButton: 'view', openUrl: 'view', dismissDialog: 'view',
    resetCooldown: 'page-mutation',
  },
  Fetch: {
    disable: 'harmless', enable: 'page-mutation', failRequest: 'page-mutation', fulfillRequest: 'page-mutation', continueRequest: 'page-mutation',
    continueWithAuth: 'page-mutation', continueResponse: 'page-mutation', getResponseBody: 'read', takeResponseBodyAsStream: 'read',
  },
  FileSystem: {
    getDirectory: 'read',
  },
  HeadlessExperimental: {
    beginFrame: 'view', disable: 'harmless', enable: 'harmless',
  },
  IO: {
    close: 'harmless', read: 'read', resolveBlob: 'read',
  },
  IndexedDB: {
    clearObjectStore: 'page-mutation', deleteDatabase: 'page-mutation', deleteObjectStoreEntries: 'page-mutation', disable: 'harmless',
    enable: 'harmless', requestData: 'read', getMetadata: 'read', requestDatabase: 'read', requestDatabaseNames: 'read',
  },
  Input: {
    dispatchDragEvent: ['input', '2026-09-21'], dispatchKeyEvent: ['input', '2026-09-21'], insertText: ['input', '2026-09-21'],
    imeSetComposition: ['input', '2026-09-21'], dispatchMouseEvent: ['input', '2026-09-21'], dispatchTouchEvent: ['input', '2026-09-21'],
    cancelDragging: ['input', '2026-09-21'], emulateTouchFromMouseEvent: ['input', '2026-09-21'],
    setIgnoreInputEvents: { cls: 'refused', since: '2026-09-26', why: "makes the page ignore every input — the user's own takeover included — and is refused on every lease" },
    setInterceptDrags: ['input', '2026-09-21'], synthesizePinchGesture: ['input', '2026-09-21'], synthesizeScrollGesture: ['input', '2026-09-21'],
    synthesizeTapGesture: ['input', '2026-09-21'],
  },
  Inspector: {
    disable: 'harmless', enable: 'harmless',
  },
  LayerTree: {
    compositingReasons: 'read', disable: 'harmless', enable: 'harmless', loadSnapshot: 'read', makeSnapshot: 'read', profileSnapshot: 'read',
    releaseSnapshot: 'harmless', replaySnapshot: 'read', snapshotCommandLog: 'read',
  },
  Log: {
    clear: 'harmless', disable: 'harmless', enable: 'harmless', startViolationsReport: 'harmless', stopViolationsReport: 'harmless',
  },
  Media: {
    enable: 'harmless', disable: 'harmless',
  },
  Memory: {
    getDOMCounters: 'read', getDOMCountersForLeakDetection: 'read', prepareForLeakDetection: 'harmless', forciblyPurgeJavaScriptMemory: 'harmless',
    setPressureNotificationsSuppressed: 'page-mutation', simulatePressureNotification: 'page-mutation', startSampling: 'harmless',
    stopSampling: 'harmless', getAllTimeSamplingProfile: 'read', getBrowserSamplingProfile: 'read', getSamplingProfile: 'read',
  },
  Network: {
    canClearBrowserCache: 'read', canClearBrowserCookies: 'read', canEmulateNetworkConditions: 'read', clearBrowserCache: 'page-mutation',
    clearBrowserCookies: 'page-mutation', deleteCookies: 'page-mutation', disable: 'harmless', emulateNetworkConditions: 'page-mutation',
    emulateNetworkConditionsByRule: 'page-mutation', overrideNetworkState: 'page-mutation', enable: 'harmless', configureDurableMessages: 'harmless',
    getAllCookies: 'read', getCertificate: 'read', getCookies: 'read', getResponseBody: 'read', getRequestPostData: 'read', replayXHR: 'page-mutation',
    searchInResponseBody: 'read', setBlockedURLs: 'page-mutation', setBypassServiceWorker: 'page-mutation', setCacheDisabled: 'page-mutation',
    setCookie: 'page-mutation', setCookies: 'page-mutation', setExtraHTTPHeaders: 'page-mutation', setAttachDebugStack: 'page-mutation',
    setUserAgentOverride: 'page-mutation', streamResourceContent: 'read', getSecurityIsolationStatus: 'read', enableReportingApi: 'harmless',
    enableDeviceBoundSessions: 'harmless', deleteDeviceBoundSession: 'page-mutation', fetchSchemefulSite: 'read', loadNetworkResource: 'page-mutation',
    setCookieControls: 'page-mutation',
  },
  Overlay: {
    disable: 'harmless', enable: 'harmless', getHighlightObjectForTest: 'read', getGridHighlightObjectsForTest: 'read',
    getSourceOrderHighlightObjectForTest: 'read', hideHighlight: 'harmless', highlightFrame: 'view', highlightNode: 'view', highlightQuad: 'view',
    highlightRect: 'view', highlightSourceOrder: 'view', setInspectMode: 'view', setShowAdHighlights: 'view', setPausedInDebuggerMessage: 'view',
    setShowDebugBorders: 'view', setShowFPSCounter: 'view', setShowGridOverlays: 'view', setShowFlexOverlays: 'view', setShowScrollSnapOverlays: 'view',
    setShowContainerQueryOverlays: 'view', setShowInspectedElementAnchor: 'view', setShowPaintRects: 'view', setShowLayoutShiftRegions: 'view',
    setShowScrollBottleneckRects: 'view', setShowHitTestBorders: 'harmless', setShowWebVitals: 'harmless', setShowViewportSizeOnResize: 'view',
    setShowHinge: 'view', setShowDisplayCutout: 'view', setShowIsolatedElements: 'view', setShowWindowControlsOverlay: 'view',
  },
  PWA: {
    getOsAppState: 'read', install: 'page-mutation', uninstall: 'page-mutation', launch: 'view', launchFilesInApp: 'view', openCurrentPageInApp: 'view',
    changeAppUserSettings: 'page-mutation',
  },
  Page: {
    addScriptToEvaluateOnLoad: 'page-mutation', addScriptToEvaluateOnNewDocument: 'page-mutation',
    bringToFront: { cls: 'view', since: '2026-09-26', fence: 'anchor', why: "measured (verify r2 + r3, 0.38.1): refusing it here does not stop the daemon's tab switch (setAutoAttach + a screencast restart carry it) and leaves the switched-to tab hidden — the switch is refused at the live view's anchor (tab_switched)" },
    captureScreenshot: 'read', captureSnapshot: 'read', clearDeviceMetricsOverride: 'view', clearDeviceOrientationOverride: 'page-mutation',
    clearGeolocationOverride: 'page-mutation', createIsolatedWorld: 'harmless', deleteCookie: 'page-mutation', disable: 'harmless', enable: 'harmless',
    getAppManifest: 'read', getInstallabilityErrors: 'read', getManifestIcons: 'read', getAppId: 'read', getAdScriptAncestry: 'read',
    getFrameTree: 'read', getLayoutMetrics: 'read', getNavigationHistory: 'read', resetNavigationHistory: 'page-mutation', getResourceContent: 'read',
    getResourceTree: 'read', handleJavaScriptDialog: ['view', '2026-09-21'], navigate: ['view', '2026-09-21'],
    navigateToHistoryEntry: ['view', '2026-09-21'], printToPDF: 'read', reload: ['view', '2026-09-21'], removeScriptToEvaluateOnLoad: 'page-mutation',
    removeScriptToEvaluateOnNewDocument: 'page-mutation', screencastFrameAck: 'read', searchInResource: 'read', setAdBlockingEnabled: 'page-mutation',
    setBypassCSP: 'page-mutation', getPermissionsPolicyState: 'read', getOriginTrials: 'read', setDeviceMetricsOverride: 'view',
    setDeviceOrientationOverride: 'page-mutation', setFontFamilies: 'page-mutation', setFontSizes: 'page-mutation',
    setDocumentContent: ['view', '2026-09-21'], setDownloadBehavior: 'page-mutation', setGeolocationOverride: 'page-mutation',
    setLifecycleEventsEnabled: 'harmless', setTouchEmulationEnabled: 'view', startScreencast: 'read', startScreenRecording: 'read',
    stopScreenRecording: 'read', stopLoading: ['view', '2026-09-21'], crash: 'refused', close: ['view', '2026-09-21'], setWebLifecycleState: 'view',
    stopScreencast: 'read', produceCompilationCache: 'harmless', addCompilationCache: 'harmless', clearCompilationCache: 'harmless',
    setSPCTransactionMode: 'page-mutation', setRPHRegistrationMode: 'page-mutation', generateTestReport: 'harmless', waitForDebugger: 'view',
    setInterceptFileChooserDialog: 'page-mutation', setPrerenderingAllowed: 'page-mutation', getAnnotatedPageContent: 'read',
  },
  Performance: {
    disable: 'harmless', enable: 'harmless', setTimeDomain: 'harmless', getMetrics: 'read',
  },
  PerformanceTimeline: {
    enable: 'harmless',
  },
  Preload: {
    enable: 'harmless', disable: 'harmless',
  },
  Security: {
    disable: 'harmless', enable: 'harmless', setIgnoreCertificateErrors: 'page-mutation', handleCertificateError: 'page-mutation',
    setOverrideCertificateErrors: 'page-mutation',
  },
  ServiceWorker: {
    deliverPushMessage: 'page-mutation', disable: 'harmless', dispatchSyncEvent: 'page-mutation', dispatchPeriodicSyncEvent: 'page-mutation',
    enable: 'harmless', setForceUpdateOnPageLoad: 'page-mutation', skipWaiting: 'page-mutation', startWorker: 'page-mutation',
    stopAllWorkers: 'page-mutation', stopWorker: 'page-mutation', unregister: 'page-mutation', updateRegistration: 'page-mutation',
  },
  SmartCardEmulation: {
    enable: 'page-mutation', disable: 'harmless', reportEstablishContextResult: 'page-mutation', reportReleaseContextResult: 'page-mutation',
    reportListReadersResult: 'page-mutation', reportGetStatusChangeResult: 'page-mutation', reportBeginTransactionResult: 'page-mutation',
    reportPlainResult: 'page-mutation', reportConnectResult: 'page-mutation', reportDataResult: 'page-mutation', reportStatusResult: 'page-mutation',
    reportError: 'page-mutation',
  },
  Storage: {
    getStorageKeyForFrame: 'read', getStorageKey: 'read', clearDataForOrigin: 'page-mutation', clearDataForStorageKey: 'page-mutation',
    getCookies: 'read', setCookies: 'page-mutation', clearCookies: 'page-mutation', getUsageAndQuota: 'read', overrideQuotaForOrigin: 'page-mutation',
    trackCacheStorageForOrigin: 'harmless', trackCacheStorageForStorageKey: 'harmless', trackIndexedDBForOrigin: 'harmless',
    trackIndexedDBForStorageKey: 'harmless', untrackCacheStorageForOrigin: 'harmless', untrackCacheStorageForStorageKey: 'harmless',
    untrackIndexedDBForOrigin: 'harmless', untrackIndexedDBForStorageKey: 'harmless', getTrustTokens: 'read', clearTrustTokens: 'page-mutation',
    getSharedStorageMetadata: 'read', getSharedStorageEntries: 'read', setSharedStorageEntry: 'page-mutation',
    deleteSharedStorageEntry: 'page-mutation', clearSharedStorageEntries: 'page-mutation', resetSharedStorageBudget: 'page-mutation',
    setSharedStorageTracking: 'harmless', setStorageBucketTracking: 'harmless', deleteStorageBucket: 'page-mutation',
    runBounceTrackingMitigations: 'page-mutation', getRelatedWebsiteSets: 'read',
  },
  SystemInfo: {
    getInfo: 'read', getFeatureState: 'read', getProcessInfo: 'read',
  },
  Target: {
    activateTarget: ['view', '2026-09-21'], attachToTarget: 'session', attachToBrowserTarget: 'session', closeTarget: ['view', '2026-09-21'],
    exposeDevToolsProtocol: ['refused', '2026-09-21'], createBrowserContext: 'session', getBrowserContexts: 'session',
    createTarget: ['view', '2026-09-21'], detachFromTarget: 'session', disposeBrowserContext: 'session', getTargetInfo: 'session',
    getTargets: 'session', sendMessageToTarget: ['refused', '2026-09-21'], setAutoAttach: 'session', autoAttachRelated: 'session',
    setDiscoverTargets: 'session', setRemoteLocations: ['refused', '2026-09-21'], getDevToolsTarget: 'read', openDevTools: 'view',
  },
  Tethering: {
    bind: 'refused', unbind: 'refused',
  },
  Tracing: {
    end: 'harmless', getCategories: 'read', getTrackEventDescriptor: 'read', recordClockSyncMarker: 'harmless', requestMemoryDump: 'harmless',
    start: 'harmless',
  },
  WebAudio: {
    enable: 'harmless', disable: 'harmless', getRealtimeData: 'read',
  },
  WebAuthn: {
    enable: 'page-mutation', disable: 'harmless', addVirtualAuthenticator: 'page-mutation', setResponseOverrideBits: 'page-mutation',
    removeVirtualAuthenticator: 'page-mutation', addCredential: 'page-mutation', getCredential: 'read', getCredentials: 'read',
    removeCredential: 'page-mutation', clearCredentials: 'page-mutation', setUserVerified: 'page-mutation',
    setAutomaticPresenceSimulation: 'page-mutation', setCredentialProperties: 'page-mutation',
  },
  WebMCP: {
    enable: 'harmless', disable: 'harmless', invokeTool: 'page-mutation', cancelInvocation: 'harmless',
  },
  Console: {
    clearMessages: 'harmless', disable: 'harmless', enable: 'harmless',
  },
  Debugger: {
    continueToLocation: 'view', disable: 'harmless', enable: 'harmless', evaluateOnCallFrame: 'page-mutation', getPossibleBreakpoints: 'read',
    getScriptSource: 'read', disassembleWasmModule: 'read', nextWasmDisassemblyChunk: 'read', getWasmBytecode: 'read', getStackTrace: 'read',
    pause: 'view', pauseOnAsyncCall: 'view', removeBreakpoint: 'harmless', restartFrame: 'view', resume: 'harmless', searchInContent: 'read',
    setAsyncCallStackDepth: 'harmless', setBlackboxExecutionContexts: 'harmless', setBlackboxPatterns: 'harmless', setBlackboxedRanges: 'harmless',
    setBreakpoint: 'view', setInstrumentationBreakpoint: 'view', setBreakpointByUrl: 'view', setBreakpointOnFunctionCall: 'view',
    setBreakpointsActive: 'view', setPauseOnExceptions: 'view', setReturnValue: 'page-mutation', setScriptSource: 'page-mutation',
    setSkipAllPauses: 'harmless', setVariableValue: 'page-mutation', stepInto: 'view', stepOut: 'view', stepOver: 'view',
  },
  HeapProfiler: {
    addInspectedHeapObject: 'harmless', collectGarbage: 'harmless', disable: 'harmless', enable: 'harmless', getHeapObjectId: 'read',
    getObjectByHeapObjectId: 'read', getSamplingProfile: 'read', startSampling: 'harmless', startTrackingHeapObjects: 'harmless',
    stopSampling: 'harmless', stopTrackingHeapObjects: 'harmless', takeHeapSnapshot: 'read',
  },
  Profiler: {
    disable: 'harmless', enable: 'harmless', getBestEffortCoverage: 'read', setSamplingInterval: 'harmless', start: 'harmless',
    startPreciseCoverage: 'harmless', stop: 'harmless', stopPreciseCoverage: 'harmless', takePreciseCoverage: 'read',
  },
  Runtime: {
    awaitPromise: 'read', callFunctionOn: 'page-mutation', compileScript: 'page-mutation', disable: 'harmless', discardConsoleEntries: 'harmless',
    enable: 'harmless', evaluate: 'page-mutation', getIsolateId: 'read', getHeapUsage: 'read', getProperties: 'read', globalLexicalScopeNames: 'read',
    queryObjects: 'read', releaseObject: 'harmless', releaseObjectGroup: 'harmless', runIfWaitingForDebugger: 'harmless', runScript: 'page-mutation',
    setAsyncCallStackDepth: 'harmless', setCustomObjectFormatterEnabled: 'harmless', setMaxCallStackSizeToCapture: 'harmless',
    terminateExecution: 'page-mutation', addBinding: 'page-mutation', removeBinding: 'page-mutation', getExceptionDetails: 'read',
  },
  Schema: {
    getDomains: 'read',
  },
});

/** ONE row: `{domain, method, cls, since, fence, why}` — or null for a method the census does not list. */
function rowOf(method) {
  const m = String(method || '');
  const dot = m.indexOf('.');
  if (dot <= 0) return null;
  const dom = ROWS[m.slice(0, dot)];
  if (!dom || !Object.prototype.hasOwnProperty.call(dom, m.slice(dot + 1))) return null;
  const v = dom[m.slice(dot + 1)];
  const o = typeof v === 'string' ? { cls: v } : Array.isArray(v) ? { cls: v[0], since: v[1] } : { ...v };
  return { domain: m.slice(0, dot), method: m.slice(dot + 1), cls: o.cls, since: o.since || SINCE, fence: o.fence || 'mediator', why: o.why || null };
}
/** The class of a method, or null (unclassified — a newer Chrome's method). */
function classOf(method) { const r = rowOf(method); return r ? r.cls : null; }
/** Every row, flat (the census leg and the docs). */
function rows() {
  const out = [];
  for (const dom of Object.keys(ROWS)) for (const m of Object.keys(ROWS[dom])) out.push(rowOf(dom + '.' + m));
  return out;
}
/** The methods of one class (a Set of 'Domain.method'). */
function methodsOf(cls) { return new Set(rows().filter((r) => r.cls === cls).map((r) => r.domain + '.' + r.method)); }
/** Counts per class (the report). */
function census() { const c = {}; for (const r of rows()) c[r.cls] = (c[r.cls] || 0) + 1; return { chrome: CENSUS_CHROME, since: SINCE, total: rows().length, byClass: c }; }
/**
 * Compare the table against a protocol listing (`{domains:[{domain, commands:[{name}]}]}` — /json/protocol's shape,
 * the fixture's or a live one): `{unclassified: ['Domain.method'…], stale: [...], sameSet}`. A method the protocol
 * lists with no row is UNCLASSIFIED (the leg prints it and fails until a row is written); a row naming a method the
 * protocol lacks is STALE (dead data, or a Chrome older than the census).
 */
function compare(protocol) {
  const listed = new Set();
  for (const d of (protocol && Array.isArray(protocol.domains) ? protocol.domains : [])) for (const c of (d.commands || [])) if (d.domain && c && c.name) listed.add(d.domain + '.' + c.name);
  const have = new Set(rows().map((r) => r.domain + '.' + r.method));
  const unclassified = [...listed].filter((m) => !have.has(m)).sort();
  const stale = [...have].filter((m) => !listed.has(m)).sort();
  return { unclassified, stale, sameSet: !unclassified.length && !stale.length, listed: listed.size, rows: have.size };
}
/** Validate the table itself (a closed class vocabulary, dates, the one anchor row) — the suite's first assert. */
function validate() {
  const bad = [];
  for (const r of rows()) {
    if (!CLASSES.includes(r.cls)) bad.push(`${r.domain}.${r.method}: class '${r.cls}' is not one of ${CLASSES.join('/')}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.since)) bad.push(`${r.domain}.${r.method}: since '${r.since}'`);
    if (r.fence !== 'mediator' && r.fence !== 'anchor') bad.push(`${r.domain}.${r.method}: fence '${r.fence}'`);
    if (r.fence === 'anchor' && !(r.cls === 'view' || r.cls === 'input')) bad.push(`${r.domain}.${r.method}: an anchor-fenced row must be a paused class`);
  }
  return bad;
}
module.exports = { SINCE, CENSUS_CHROME, CLASSES, PAUSED_RULE, ROWS, rowOf, classOf, rows, methodsOf, census, compare, validate };
