// lane stream-p3m-probe (P3m-0) — the AUX helper beside sck-probe: TCC + session facts, the calibration window, input posting.
// Never a product file: a probe for the owner's Mac, built there with the Command Line Tools:
//   swiftc -O -o p3m-aux p3m-aux.swift && codesign -s - -f p3m-aux
//   p3m-aux facts                         who is responsible for me (TCC's client), the four preflights, session/lock, displays/EDR
//   p3m-aux calib <secs> [x y] [--full] [--anim]   the 11-grey + colour calibration window (sRGB-tagged NSColors) — prints pid + CGWindowID
//   p3m-aux cover <secs> x y w h [--full]  a plain dark window (occlusion); --full = its own full-screen Space (ctl: cover.ctl)
//   p3m-aux pid <pid> <text>              CGEvent keyboard events → CGEventPostToPid(pid) (does not activate the target)
//   p3m-aux pidclick <pid> <x> <y>        a left click (global points) → CGEventPostToPid(pid)
//   p3m-aux hid <expectPid> <text>        CGEventPost(.cghidEventTap) — ONLY when <expectPid> is frontmost and the session is unlocked
//   p3m-aux windows [pid]                 CGWindowListCopyWindowInfo rows (names show only with Screen Recording)
//   p3m-aux axprompt | axtext <pid> | axtitles <pid> | axclose <pid> <title> | axmini <pid> <title> 1|0 | axmove <pid> <title> x y   (Accessibility: the AX read-back + close)
//   p3m-aux spawn <abs path> [args…]      posix_spawn with responsibility disclaimed ⇒ the child is its own TCC client (not node)
import AppKit
import ApplicationServices
import CoreGraphics

func out(_ s: String) { print(s); fflush(stdout) }
let A = CommandLine.arguments

typealias RespFn = @convention(c) (pid_t) -> pid_t
func responsible(_ pid: pid_t) -> pid_t { // private SPI the TCC daemon itself uses to pick the client; dlsym so a rename only says -1
  guard let s = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_get_pid_responsible_for_pid") else { return -1 }
  return unsafeBitCast(s, to: RespFn.self)(pid)
}
func pathOf(_ pid: pid_t) -> String {
  var b = [CChar](repeating: 0, count: 4096)
  return proc_pidpath(pid, &b, 4096) > 0 ? String(cString: b) : "?(gone)"
}
func locked() -> Bool { ((CGSessionCopyCurrentDictionary() as? [String: Any])?["CGSSessionScreenIsLocked"] as? Bool) ?? false }

func facts() {
  let me = getpid(), r = responsible(me)
  out("pid \(me) ppid \(getppid()) (\(pathOf(getppid()))) responsible \(r) (\(r > 0 ? pathOf(r) : "-"))")
  var p = getppid(); var chain: [String] = []
  for _ in 0..<6 { if p <= 1 { break }; chain.append("\(p):\(pathOf(p))→resp \(responsible(p))"); var info = proc_bsdinfo(); proc_pidinfo(p, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size)); p = pid_t(info.pbi_ppid) }
  out("ancestors " + chain.joined(separator: " | "))
  out("CGPreflightScreenCaptureAccess \(CGPreflightScreenCaptureAccess())")
  out("AXIsProcessTrusted \(AXIsProcessTrusted())")
  out("CGPreflightPostEventAccess \(CGPreflightPostEventAccess())")
  out("CGPreflightListenEventAccess \(CGPreflightListenEventAccess())")
  if let d = CGSessionCopyCurrentDictionary() as? [String: Any] { for k in d.keys.sorted() where !k.contains("UserName") || true { out("session \(k) = \(d[k]!)") } }
  var ids = [CGDirectDisplayID](repeating: 0, count: 8); var n: UInt32 = 0
  CGGetOnlineDisplayList(8, &ids, &n)
  for id in ids.prefix(Int(n)) {
    let m = CGDisplayCopyDisplayMode(id)
    out("display \(id) main=\(CGDisplayIsMain(id)) asleep=\(CGDisplayIsAsleep(id)) active=\(CGDisplayIsActive(id)) bounds(pt)=\(CGDisplayBounds(id)) mode=\(m?.width ?? 0)x\(m?.height ?? 0)pt \(m?.pixelWidth ?? 0)x\(m?.pixelHeight ?? 0)px @\(m?.refreshRate ?? 0)Hz builtin=\(CGDisplayIsBuiltin(id))")
  }
  _ = NSApplication.shared
  for s in NSScreen.screens {
    let id = (s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
    out("screen \(id) \(s.localizedName) frame=\(s.frame) scale=\(s.backingScaleFactor) EDR now=\(s.maximumExtendedDynamicRangeColorComponentValue) potential=\(s.maximumPotentialExtendedDynamicRangeColorComponentValue) reference=\(s.maximumReferenceExtendedDynamicRangeColorComponentValue) colorSpace=\(s.colorSpace?.localizedName ?? "?") depth=\(s.depth.rawValue)")
  }
}

let greys = [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 255]
let colours: [(String, [Int])] = [("R", [255, 0, 0]), ("G", [0, 255, 0]), ("B", [0, 0, 255]), ("C", [0, 255, 255]), ("M", [255, 0, 255]), ("Y", [255, 255, 0]), ("grey50", [128, 128, 128]), ("white", [255, 255, 255])]
let border = 24.0, patch = 96.0, gap = 8.0
var plain = false
final class Calib: NSView { // the calib.ps1 layout in POINTS from the content view's top-left (flipped); magenta ground like calib.ps1
  override var isFlipped: Bool { true }
  override func draw(_ r: NSRect) {
    if plain { NSColor(srgbRed: 0.2, green: 0.2, blue: 0.25, alpha: 1).setFill(); bounds.fill(); return }
    NSColor(srgbRed: 1, green: 0, blue: 1, alpha: 1).setFill(); bounds.fill()
    func put(_ col: Int, _ row: Int, _ c: [Int]) { NSColor(srgbRed: CGFloat(c[0]) / 255, green: CGFloat(c[1]) / 255, blue: CGFloat(c[2]) / 255, alpha: 1).setFill(); NSRect(x: border + Double(col) * (patch + gap), y: border + Double(row) * (patch + gap), width: patch, height: patch).fill() }
    for (i, g) in greys.enumerated() { put(i, 0, [g, g, g]) }
    for (i, c) in colours.enumerated() { put(i, 1, c.1) }
    if tick >= 0 { NSColor.white.setFill(); NSRect(x: border + Double(tick % 1100), y: 228, width: 16, height: 16).fill() } // --anim: the moving square (bottom border)
  }
  var tick = -1
}
func calib(_ secs: Double, _ x: Double, _ y: Double, full: Bool, size: (Double, Double)? = nil) {
  let app = NSApplication.shared; app.setActivationPolicy(.accessory)
  let w = size?.0 ?? border * 2 + 11 * patch + 10 * gap, h = size?.1 ?? border * 2 + 2 * patch + gap
  let scr = NSScreen.screens[0].frame
  let win = NSWindow(contentRect: NSRect(x: x, y: scr.maxY - y - h, width: w, height: h), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
  let view = Calib(); win.title = plain ? "vs-p3m-cover" : "vs-p3m-calib"; win.contentView = view; win.isReleasedWhenClosed = false
  if A.contains("--anim") { view.tick = 0; Timer.scheduledTimer(withTimeInterval: 1.0 / 120, repeats: true) { _ in view.tick += 4; view.setNeedsDisplay(NSRect(x: 0, y: 224, width: w, height: 24)) } }
  if full { win.collectionBehavior = [.fullScreenPrimary] }
  win.orderFrontRegardless()
  NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .leftMouseDown]) { e in
    out(e.type == .keyDown ? "RECV key \"\(e.characters ?? "")\" active=\(NSApp.isActive) key=\(win.isKeyWindow) front=\(front())" : "RECV click \(e.locationInWindow) active=\(NSApp.isActive)"); return e }
  out("calib pid \(getpid()) window \(win.windowNumber) content(pt) \(Int(w))x\(Int(h)) scale \(win.backingScaleFactor) colorSpace \(win.colorSpace?.localizedName ?? "?")")
  out("patches " + (greys.enumerated().map { "grey\($0.offset * 10)@\(Int(border + Double($0.offset) * (patch + gap) + patch / 2)),\(Int(border + patch / 2))=\($0.element)" } + colours.enumerated().map { "\($0.element.0)@\(Int(border + Double($0.offset) * (patch + gap) + patch / 2)),\(Int(border + patch + gap + patch / 2))=\($0.element.1.map(String.init).joined(separator: "/"))" }).joined(separator: " "))
  if full { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { win.toggleFullScreen(nil) } }
  // a control file: echo mini|unmini|full|front|close > ./calib.ctl — the probe steers its OWN window only
  Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in
    let ctl = plain ? "cover.ctl" : "calib.ctl"
    guard let c = try? String(contentsOfFile: ctl, encoding: .utf8) else { return }
    try? FileManager.default.removeItem(atPath: ctl)
    switch c.trimmingCharacters(in: .whitespacesAndNewlines) {
    case "mini": win.miniaturize(nil); case "unmini": win.deminiaturize(nil); case "full": win.toggleFullScreen(nil)
    case "front": win.orderFrontRegardless(); case "close": exit(0); default: break }
    out("ctl \(c.trimmingCharacters(in: .whitespacesAndNewlines)) → miniaturized=\(win.isMiniaturized) visible=\(win.isVisible) onActiveSpace=\(win.isOnActiveSpace) fullscreen=\(win.styleMask.contains(.fullScreen))")
  }
  DispatchQueue.main.asyncAfter(deadline: .now() + secs) { exit(0) }
  app.run()
}

func keys(_ text: String, _ post: (CGEvent) -> Void) {
  for ch in text.utf16 {
    for down in [true, false] {
      guard let e = CGEvent(keyboardEventSource: CGEventSource(stateID: .privateState), virtualKey: 0, keyDown: down) else { continue }
      var u = ch; e.keyboardSetUnicodeString(stringLength: 1, unicodeString: &u); post(e); usleep(4000)
    }
  }
}
func front() -> pid_t { NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1 }

typealias DisclaimFn = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
func spawnDisclaimed(_ argv: [String]) -> Never { // what Chrome / VS Code / iTerm do: the child becomes ITS OWN responsible process for TCC
  var attr: posix_spawnattr_t? = nil; posix_spawnattr_init(&attr)
  let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim")
  out("responsibility_spawnattrs_setdisclaim \(sym == nil ? "MISSING" : "→ \(unsafeBitCast(sym, to: DisclaimFn.self)(&attr, 1))")")
  var pid: pid_t = 0; let c = argv.map { strdup($0) } + [nil]
  let r = posix_spawn(&pid, argv[0], nil, &attr, c, environ); var st: Int32 = 0
  if r == 0 { waitpid(pid, &st, 0) }
  out("spawned \(argv[0]) pid \(pid) → \(r) status \(st)"); exit(r == 0 ? (st >> 8) & 255 : 99)
}

switch A.count > 1 ? A[1] : "" {
case "facts": facts()
case "spawn": spawnDisclaimed(Array(A.dropFirst(2)))
case "cover": plain = true; calib(Double(A[2]) ?? 60, Double(A[3])!, Double(A[4])!, full: A.contains("--full"), size: (Double(A[5])!, Double(A[6])!))
case "calib": calib(Double(A[2]) ?? 30, A.count > 4 ? Double(A[3]) ?? 200 : 200, A.count > 4 ? Double(A[4]) ?? 200 : 200, full: A.contains("--full"))
case "pid":
  let pid = pid_t(A[2])!; let f0 = front()
  keys(A[3]) { $0.postToPid(pid) }
  out("posted \(A[3].utf16.count) chars ×2 events to pid \(pid) via CGEventPostToPid; frontmost before \(f0) after \(front()); postAccess \(CGPreflightPostEventAccess())")
case "pidclick":
  let pid = pid_t(A[2])!, p = CGPoint(x: Double(A[3])!, y: Double(A[4])!)
  for t in [CGEventType.leftMouseDown, .leftMouseUp] { CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.postToPid(pid); usleep(30000) }
  out("click at \(p) posted to pid \(pid); frontmost \(front())")
case "hid":
  let want = pid_t(A[2])!
  guard !locked() else { out("REFUSED: the session is locked — HID events would land on the lock screen"); exit(3) }
  guard front() == want else { out("REFUSED: frontmost is \(front()) (\(pathOf(front()))), not \(want) — HID events go to the focused app"); exit(3) }
  let c0 = CGEventSource.counterForEventType(.hidSystemState, eventType: .keyDown)
  keys(A[3]) { $0.post(tap: .cghidEventTap) }
  usleep(200000)
  out("posted \(A[3].utf16.count) chars via CGEventPost(.cghidEventTap); hidSystemState keyDown counter \(c0) → \(CGEventSource.counterForEventType(.hidSystemState, eventType: .keyDown)); postAccess \(CGPreflightPostEventAccess()) AX \(AXIsProcessTrusted())")
case "axprompt": out("AXIsProcessTrustedWithOptions(prompt) → \(AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary))")
case "axtext", "axtitles", "axclose", "axmini", "axmove":
  let app = AXUIElementCreateApplication(pid_t(A[2])!)
  func attr(_ e: AXUIElement, _ k: String) -> AnyObject? { var v: AnyObject?; return AXUIElementCopyAttributeValue(e, k as CFString, &v) == .success ? v : nil }
  var ws: AnyObject?; let r = AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &ws)
  out("AX windows → \(r.rawValue) (\(r == .apiDisabled ? "apiDisabled: not trusted" : r == .success ? "ok" : "error")) trusted=\(AXIsProcessTrusted())")
  for w in (ws as? [AXUIElement]) ?? [] {
    let title = attr(w, kAXTitleAttribute) as? String ?? ""
    out("AX window \"\(title)\" minimized=\(attr(w, kAXMinimizedAttribute) ?? "?" as AnyObject)")
    if A[1] == "axmini", title.contains(A[3]) { out("AXMinimized → \(A[4]): \(AXUIElementSetAttributeValue(w, kAXMinimizedAttribute as CFString, (A[4] == "1") as CFBoolean).rawValue)") }
    if A[1] == "axmove", title.contains(A[3]) { var p = CGPoint(x: Double(A[4])!, y: Double(A[5])!); out("AXPosition → \(p): \(AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &p)!).rawValue)") }
    if A[1] == "axclose", title.contains(A[3]), let b = attr(w, kAXCloseButtonAttribute) { out("AXPress close → \(AXUIElementPerformAction(b as! AXUIElement, kAXPressAction as CFString).rawValue)") }
    if A[1] == "axtext" { var q = [w]; while let e = q.popLast() { if (attr(e, kAXRoleAttribute) as? String) == kAXTextAreaRole { out("AX text area value \"\(attr(e, kAXValueAttribute) as? String ?? "?")\"") }; q += (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] } }
  }
case "windows":
  let only = A.count > 2 ? Int(A[2]) : nil
  for w in (CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]]) ?? [] {
    let pid = w[kCGWindowOwnerPID as String] as? Int ?? 0
    if let o = only, o != pid { continue }
    if only == nil, (w[kCGWindowLayer as String] as? Int ?? 0) != 0 { continue }
    out("win \(w[kCGWindowNumber as String] ?? 0) pid \(pid) \(w[kCGWindowOwnerName as String] ?? "?") name=\(w[kCGWindowName as String].map { "\($0)" } ?? "<hidden>") onscreen=\(w[kCGWindowIsOnscreen as String] ?? 0) layer=\(w[kCGWindowLayer as String] ?? 0) bounds=\((w[kCGWindowBounds as String] as? [String: Any]).map { "\($0["X"]!),\($0["Y"]!) \($0["Width"]!)x\($0["Height"]!)" } ?? "?")")
  }
default: out("usage: p3m-aux facts | calib <secs> [x y] [--full] | pid <pid> <text> | pidclick <pid> <x> <y> | hid <expectPid> <text> | windows [pid] | spawn <path> [args…]"); exit(2)
}
