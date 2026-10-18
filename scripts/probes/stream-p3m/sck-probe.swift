// lane stream-p3m-probe (P3m-0) — the ScreenCaptureKit + VideoToolbox probe helper. Never a product file: built ON the Mac
// with the Command Line Tools (swiftc -O -o sck-probe sck-probe.swift && codesign -s - -f sck-probe).
//   sck-probe props                    what this macOS exposes on SCStreamConfiguration / SCContentFilter / … + every HDR preset (no TCC)
//   sck-probe list                     SCShareableContent: displays + windows (Screen Recording off ⇒ the refusal, said whole)
//   sck-probe cap display <id> | window <id> | title <substring>   [options]  — an SCStream, counted per frame status
//   sck-probe shot display <id> | window <id> | title <substring>  [options]  — one SCScreenshotManager still (no stream)
//   sck-probe synth <W> <H>            [options]  — the same encoder / pipe on synthetic IOSurface frames (the VT numbers alone)
// options: --secs 5 --fmt BGRA|420v|420f|x420|xf20|l10r --dr sdr|local|canonical --cs default|srgb|p3|709|2100pq|p3pq --res auto|best|nominal
//          --size native|points|<W>x<H> --fps 60 --cursor 0|1 --shadow 0|1 --dump <base> [--at N] (the Nth complete frame → base.raw/.png/.txt)
//          --content ramp|noise (synth) --lowlat 1|0 (low-latency rate control first, else the plain realtime session) --delay N (MaxFrameDelayCount)
//          --profile cb|main|high (H.264) --bps2 <bps> --at2 <secs> (a LIVE AverageBitRate change mid-run)
//          --enc h264|hevc --bps 20000000 --idr <every N frames> --es <file> (Annex-B out, for ffprobe) --pipe (raw frames → stdout)
import Foundation
import ScreenCaptureKit
import CoreMedia
import CoreVideo
import CoreImage
import VideoToolbox
import QuartzCore
import AppKit

func err(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }
var pipeMode = false
func out(_ s: String) { if pipeMode { err(s) } else { print(s); fflush(stdout) } }
let A = Array(CommandLine.arguments.dropFirst())
func opt(_ k: String, _ d: String) -> String { if let i = A.firstIndex(of: "--" + k), i + 1 < A.count { return A[i + 1] }; return d }
func flag(_ k: String) -> Bool { A.contains("--" + k) }
func fourcc(_ s: String) -> OSType { s.utf8.reduce(0) { ($0 << 8) | OSType($1) } }
func fcc(_ v: OSType) -> String { String(bytes: [24, 16, 8, 0].map { UInt8((v >> $0) & 255) }, encoding: .ascii) ?? "\(v)" }
func wait<T>(_ f: (@escaping (T) -> Void) -> Void) -> T { let s = DispatchSemaphore(value: 0); var r: T!; f { r = $0; s.signal() }; s.wait(); return r }
func cpu() -> Double { var u = rusage(); getrusage(RUSAGE_SELF, &u); return Double(u.ru_utime.tv_sec + u.ru_stime.tv_sec) + Double(u.ru_utime.tv_usec + u.ru_stime.tv_usec) / 1e6 }
func kv(_ o: NSObject, _ k: String) -> String { o.perform(NSSelectorFromString(k)).map { "\($0.takeUnretainedValue())" } ?? "nil" } // nil CFString props crash a direct read
func props(_ c: AnyClass) -> String { var n: UInt32 = 0; guard let l = class_copyPropertyList(c, &n) else { return "-" }; defer { free(l) }; return (0..<Int(n)).map { String(cString: property_getName(l[$0])) }.sorted().joined(separator: " ") }

func content() -> SCShareableContent {
  let r: (SCShareableContent?, Error?) = wait { k in SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { k(($0, $1)) } }
  guard let c = r.0 else { let e = r.1 as NSError?; out("SCShareableContent REFUSED: domain=\(e?.domain ?? "?") code=\(e?.code ?? 0) — \(e?.localizedDescription ?? "?") \(e?.userInfo ?? [:])"); exit(4) }
  return c
}
func filterOf(_ kind: String, _ arg: String) -> SCContentFilter {
  let c = content()
  if kind == "display", let d = c.displays.first(where: { $0.displayID == UInt32(arg) }) ?? (arg == "main" ? c.displays.first(where: { CGDisplayIsMain($0.displayID) != 0 }) : nil) { return SCContentFilter(display: d, excludingWindows: []) }
  let w = kind == "window" ? c.windows.first { $0.windowID == UInt32(arg) } : c.windows.filter { ($0.title ?? "").contains(arg) && $0.windowLayer == 0 }.max { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
  guard let w else { out("no \(kind) \(arg)"); exit(5) }
  out("window \(w.windowID) \"\(w.title ?? "")\" app=\(w.owningApplication?.bundleIdentifier ?? "?") pid=\(w.owningApplication?.processID ?? 0) frame(pt)=\(w.frame) onScreen=\(w.isOnScreen) active=\(w.isActive) layer=\(w.windowLayer)")
  return SCContentFilter(desktopIndependentWindow: w)
}
func config(_ f: SCContentFilter) -> SCStreamConfiguration {
  let c = SCStreamConfiguration()
  out("defaults: \(c.width)x\(c.height) fmt=\(fcc(c.pixelFormat)) cs=\(kv(c, "colorSpaceName")) dr=\(c.captureDynamicRange.rawValue) res=\(c.captureResolution.rawValue) interval=\(c.minimumFrameInterval.seconds) queue=\(c.queueDepth) cursor=\(c.showsCursor); filter contentRect(pt)=\(f.contentRect) pointPixelScale=\(f.pointPixelScale) style=\(f.style.rawValue)")
  switch opt("dr", "sdr") { case "local": c.captureDynamicRange = .hdrLocalDisplay; case "canonical": c.captureDynamicRange = .hdrCanonicalDisplay; default: c.captureDynamicRange = .SDR }
  c.pixelFormat = fourcc(opt("fmt", "BGRA"))
  switch opt("cs", "default") { case "srgb": c.colorSpaceName = CGColorSpace.sRGB; case "p3": c.colorSpaceName = CGColorSpace.displayP3; case "709": c.colorSpaceName = CGColorSpace.itur_709; case "2100pq": c.colorSpaceName = CGColorSpace.itur_2100_PQ; case "p3pq": c.colorSpaceName = CGColorSpace.displayP3_PQ; default: break }
  switch opt("res", "auto") { case "best": c.captureResolution = .best; case "nominal": c.captureResolution = .nominal; default: c.captureResolution = .automatic }
  let sz = opt("size", "native"), s = CGFloat(f.pointPixelScale)
  if sz == "native" { c.width = Int(f.contentRect.width * s); c.height = Int(f.contentRect.height * s) } else if sz == "points" { c.width = Int(f.contentRect.width); c.height = Int(f.contentRect.height) } else { let p = sz.split(separator: "x"); c.width = Int(p[0])!; c.height = Int(p[1])! }
  c.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(Int32(opt("fps", "60"))!))
  c.showsCursor = opt("cursor", "0") == "1"; c.ignoreShadowsSingleWindow = opt("shadow", "0") == "0"; c.queueDepth = 6
  out("asked: \(c.width)x\(c.height) fmt=\(fcc(c.pixelFormat)) cs=\(kv(c, "colorSpaceName")) dr=\(c.captureDynamicRange.rawValue) res=\(c.captureResolution.rawValue) cursor=\(c.showsCursor) ignoreShadowsSingleWindow=\(c.ignoreShadowsSingleWindow)")
  return c
}

final class Enc { // VTCompressionSession: realtime, no reordering, low-latency rate control when the codec takes it
  var s: VTCompressionSession?; let lock = NSLock(); var frames = 0, keys = 0, bytes = 0, forced = 0, lat: [Double] = [], es: FileHandle?, born = CACurrentMediaTime(), split = Double(opt("at2", "0"))!, before = 0, changed = false
  let hevc: Bool
  init(_ w: Int, _ h: Int, hevc: Bool, bps: Int, fps: Int, tenBit: Bool) {
    self.hevc = hevc
    for low in (opt("lowlat", "1") == "1" ? [true, false] : [false]) {
      let spec: [CFString: Any] = low ? [kVTVideoEncoderSpecification_EnableLowLatencyRateControl: true, kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: true] : [kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: true]
      let st = VTCompressionSessionCreate(allocator: nil, width: Int32(w), height: Int32(h), codecType: hevc ? kCMVideoCodecType_HEVC : kCMVideoCodecType_H264, encoderSpecification: spec as CFDictionary, imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: nil, refcon: nil, compressionSessionOut: &s)
      out("VTCompressionSessionCreate \(hevc ? "HEVC" : "H.264") \(w)x\(h) lowLatencyRC=\(low) → \(st)"); if st == noErr { break }
    }
    guard let s else { exit(6) }
    let set: [(CFString, Any)] = [(kVTCompressionPropertyKey_RealTime, true), (kVTCompressionPropertyKey_AllowFrameReordering, false), (kVTCompressionPropertyKey_AverageBitRate, bps), (kVTCompressionPropertyKey_ExpectedFrameRate, fps), (kVTCompressionPropertyKey_MaxKeyFrameInterval, 100_000), (kVTCompressionPropertyKey_PrioritizeEncodingSpeedOverQuality, true), (kVTCompressionPropertyKey_ProfileLevel, hevc ? (tenBit ? kVTProfileLevel_HEVC_Main10_AutoLevel : kVTProfileLevel_HEVC_Main_AutoLevel) : ["cb": kVTProfileLevel_H264_ConstrainedBaseline_AutoLevel, "main": kVTProfileLevel_H264_Main_AutoLevel][opt("profile", "high")] ?? kVTProfileLevel_H264_High_AutoLevel), (kVTCompressionPropertyKey_DataRateLimits, [bps / 8 * 2, 1] as CFArray)] + (opt("delay", "") == "" ? [] : [(kVTCompressionPropertyKey_MaxFrameDelayCount, Int(opt("delay", "0"))! as Any)])
    out("props: " + set.map { "\(($0.0 as String).replacingOccurrences(of: "kVTCompressionPropertyKey_", with: ""))=\(VTSessionSetProperty(s, key: $0.0, value: $0.1 as CFTypeRef))" }.joined(separator: " "))
    var hw: CFTypeRef?; VTSessionCopyProperty(s, key: kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder, allocator: nil, valueOut: &hw)
    out("hardware=\(hw.map { "\($0)" } ?? "?")")
    if opt("es", "") != "" { FileManager.default.createFile(atPath: opt("es", ""), contents: nil); es = FileHandle(forWritingAtPath: opt("es", "")) }
  }
  func encode(_ pb: CVPixelBuffer, _ pts: CMTime, key: Bool) {
    let t0 = CACurrentMediaTime()
    if split > 0, !changed, CACurrentMediaTime() - born >= split { lock.lock(); changed = true; before = bytes; lock.unlock(); out("AverageBitRate → \(opt("bps2", "0")): \(VTSessionSetProperty(s!, key: kVTCompressionPropertyKey_AverageBitRate, value: Int(opt("bps2", "0"))! as CFNumber)) DataRateLimits → \(VTSessionSetProperty(s!, key: kVTCompressionPropertyKey_DataRateLimits, value: [Int(opt("bps2", "0"))! / 8 * 2, 1] as CFArray))") }
    let fp = key ? [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary : nil
    if key { forced += 1 }
    VTCompressionSessionEncodeFrame(s!, imageBuffer: pb, presentationTimeStamp: pts, duration: .invalid, frameProperties: fp, infoFlagsOut: nil) { [self] st, _, sb in
      guard st == noErr, let sb, let bb = CMSampleBufferGetDataBuffer(sb) else { out("encode status \(st)"); return }
      let att = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[CFString: Any]])?.first
      let sync = !((att?[kCMSampleAttachmentKey_NotSync] as? Bool) ?? false)
      lock.lock(); defer { lock.unlock() }
      frames += 1; bytes += CMBlockBufferGetDataLength(bb); lat.append((CACurrentMediaTime() - t0) * 1000); if sync { keys += 1 }
      guard let es else { return }
      let sc = Data([0, 0, 0, 1])
      if sync, let fd = CMSampleBufferGetFormatDescription(sb) {
        var n = 0; _ = hevc ? CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(fd, parameterSetIndex: 0, parameterSetPointerOut: nil, parameterSetSizeOut: nil, parameterSetCountOut: &n, nalUnitHeaderLengthOut: nil) : CMVideoFormatDescriptionGetH264ParameterSetAtIndex(fd, parameterSetIndex: 0, parameterSetPointerOut: nil, parameterSetSizeOut: nil, parameterSetCountOut: &n, nalUnitHeaderLengthOut: nil)
        for i in 0..<n { var p: UnsafePointer<UInt8>?; var z = 0; _ = hevc ? CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(fd, parameterSetIndex: i, parameterSetPointerOut: &p, parameterSetSizeOut: &z, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) : CMVideoFormatDescriptionGetH264ParameterSetAtIndex(fd, parameterSetIndex: i, parameterSetPointerOut: &p, parameterSetSizeOut: &z, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil); if let p { es.write(sc + Data(bytes: p, count: z)) } }
      }
      var len = 0; var ptr: UnsafeMutablePointer<CChar>?; CMBlockBufferGetDataPointer(bb, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr)
      var o = 0; let d = Data(bytes: ptr!, count: len)
      while o + 4 <= len { let n = Int(d[o]) << 24 | Int(d[o + 1]) << 16 | Int(d[o + 2]) << 8 | Int(d[o + 3]); es.write(sc + d.subdata(in: (o + 4)..<(o + 4 + n))); o += 4 + n }
    }
  }
  func summary(_ secs: Double) -> String {
    VTCompressionSessionCompleteFrames(s!, untilPresentationTimeStamp: .invalid)
    lock.lock(); defer { lock.unlock() }
    let l = lat.sorted(), p = { (q: Double) in l.isEmpty ? 0 : l[min(l.count - 1, Int(Double(l.count) * q))] }
    let tail = changed ? String(format: "; bitrate %.2f Mbit/s before the change, %.2f after", Double(before) * 8 / split / 1e6, Double(bytes - before) * 8 / (secs - split) / 1e6) : ""
    return tail.isEmpty ? summaryLine(secs, p, l) : summaryLine(secs, p, l) + tail
  }
  func summaryLine(_ secs: Double, _ p: (Double) -> Double, _ l: [Double]) -> String {
    return String(format: "encoded %d frames (%.1f fps) keyframes %d (forced %d) %.2f Mbit/s, encode latency p50 %.1f ms p95 %.1f ms max %.1f ms", frames, Double(frames) / secs, keys, forced, Double(bytes) * 8 / secs / 1e6, p(0.5), p(0.95), l.last ?? 0)
  }
}

func writePlanes(_ pb: CVPixelBuffer, _ h: FileHandle) { // padding stripped: BGRA rows, or the Y then the CbCr plane
  CVPixelBufferLockBaseAddress(pb, .readOnly); defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
  let planes = CVPixelBufferIsPlanar(pb) ? CVPixelBufferGetPlaneCount(pb) : 1
  for p in 0..<planes {
    let base = planes > 1 ? CVPixelBufferGetBaseAddressOfPlane(pb, p)! : CVPixelBufferGetBaseAddress(pb)!
    let bpr = planes > 1 ? CVPixelBufferGetBytesPerRowOfPlane(pb, p) : CVPixelBufferGetBytesPerRow(pb)
    let rows = planes > 1 ? CVPixelBufferGetHeightOfPlane(pb, p) : CVPixelBufferGetHeight(pb)
    let w = planes > 1 ? CVPixelBufferGetWidthOfPlane(pb, p) : CVPixelBufferGetWidth(pb)
    let bpp = fcc(CVPixelBufferGetPixelFormatType(pb)).hasPrefix("x") ? 2 : 1, rowBytes = planes > 1 ? w * bpp * (p == 0 ? 1 : 2) : w * 4
    var buf = Data(capacity: rowBytes * rows)
    for y in 0..<rows { buf.append(base.advanced(by: y * bpr).assumingMemoryBound(to: UInt8.self), count: rowBytes) }
    h.write(buf)
  }
}
func dump(_ pb: CVPixelBuffer, _ base: String, _ info: String) {
  FileManager.default.createFile(atPath: base + ".raw", contents: nil); let h = FileHandle(forWritingAtPath: base + ".raw")!; writePlanes(pb, h); h.closeFile()
  let ci = CIImage(cvPixelBuffer: pb), ctx = CIContext()
  try? ctx.writePNGRepresentation(of: ci, to: URL(fileURLWithPath: base + ".png"), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
  let att = (CVBufferCopyAttachments(pb, .shouldPropagate) as? [String: Any]) ?? [:]
  let t = "\(info)\npixelbuffer \(CVPixelBufferGetWidth(pb))x\(CVPixelBufferGetHeight(pb)) fmt=\(fcc(CVPixelBufferGetPixelFormatType(pb))) bytesPerRow=\(CVPixelBufferGetBytesPerRow(pb)) planes=\(CVPixelBufferGetPlaneCount(pb))\n" + att.keys.sorted().map { "att \($0) = \($0.contains("ICC") ? "<\((att[$0] as? Data)?.count ?? 0) bytes>" : "\(att[$0]!)")" }.joined(separator: "\n")
  try? t.write(toFile: base + ".txt", atomically: true, encoding: .utf8); out(t)
}

final class Cap: NSObject, SCStreamOutput, SCStreamDelegate {
  var capLat: [Double] = []
  var status: [Int: Int] = [:], complete = 0, firstAt = 0.0, lastAt = 0.0, sizes: Set<String> = [], enc: Enc?, idr = 0, pts0: CMTime?
  let dumpAt = Int(opt("at", "20"))!, base = opt("dump", "")
  func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, let att = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first,
          let raw = att[.status] as? Int else { return }
    status[raw, default: 0] += 1
    guard SCFrameStatus(rawValue: raw) == .complete, let pb = CMSampleBufferGetImageBuffer(sb) else { return }
    let now = CACurrentMediaTime(); if complete == 0 { firstAt = now }; lastAt = now; complete += 1
    if let dt = att[.displayTime] as? UInt64 { var tb = mach_timebase_info(); mach_timebase_info(&tb); capLat.append(Double(Int64(bitPattern: mach_absolute_time() &- dt)) * Double(tb.numer) / Double(tb.denom) / 1e6) } // the frame's display time → our callback (a display frame's time can be AHEAD of now: signed)
    sizes.insert("\(CVPixelBufferGetWidth(pb))x\(CVPixelBufferGetHeight(pb))/\(fcc(CVPixelBufferGetPixelFormatType(pb)))")
    if complete == dumpAt || (complete == 1 && dumpAt == 1), !base.isEmpty {
      dump(pb, base, "frame #\(complete) contentRect=\(att[.contentRect] ?? "?") contentScale=\(att[.contentScale] ?? "?") scaleFactor=\(att[.scaleFactor] ?? "?") dirtyRects=\((att[.dirtyRects] as? [Any])?.count ?? -1)")
    }
    if pipeMode { writePlanes(pb, FileHandle.standardOutput) }
    if let enc { let pts = CMSampleBufferGetPresentationTimeStamp(sb); if pts0 == nil { pts0 = pts }; enc.encode(pb, pts, key: idr > 0 && complete % idr == 0) }
  }
  func stream(_ s: SCStream, didStopWithError e: Error) { out("stream STOPPED: \(e as NSError)") }
}
func encFrom(_ w: Int, _ h: Int) -> Enc? { opt("enc", "") == "" ? nil : Enc(w, h, hevc: opt("enc", "") == "hevc", bps: Int(opt("bps", "20000000"))!, fps: Int(opt("fps", "60"))!, tenBit: opt("fmt", "").hasPrefix("x")) }

let mode = A.first ?? ""
pipeMode = flag("pipe")
switch mode {
case "props":
  for c: AnyClass in [SCStreamConfiguration.self, SCContentFilter.self, SCWindow.self, SCDisplay.self, SCRunningApplication.self, SCStream.self] { out("\(c): \(props(c))") }
  out("SCStreamFrameInfo keys: " + [SCStreamFrameInfo.status, .displayTime, .scaleFactor, .contentScale, .contentRect, .dirtyRects, .screenRect, .boundingRect, .presenterOverlayContentRect].map { $0.rawValue }.joined(separator: " "))
  // (the two captureHDRScreenshot* presets SEGFAULT in init(preset:) on 26.5.2 — measured; the stream presets are what P3m uses)
  for (n, p) in [("captureHDRStreamLocalDisplay", SCStreamConfiguration.Preset.captureHDRStreamLocalDisplay), ("captureHDRStreamCanonicalDisplay", .captureHDRStreamCanonicalDisplay)] + (flag("shotpresets") ? [("captureHDRScreenshotLocalDisplay", .captureHDRScreenshotLocalDisplay), ("captureHDRScreenshotCanonicalDisplay", .captureHDRScreenshotCanonicalDisplay)] : []) {
    let c = SCStreamConfiguration(preset: p); out("preset \(n): fmt=\(fcc(c.pixelFormat)) cs=\(kv(c, "colorSpaceName")) dr=\(c.captureDynamicRange.rawValue) matrix=\(kv(c, "colorMatrix"))")
  }
  let d = SCStreamConfiguration(); out("plain config: fmt=\(fcc(d.pixelFormat)) cs=\(kv(d, "colorSpaceName")) dr=\(d.captureDynamicRange.rawValue) matrix=\(kv(d, "colorMatrix")) \(d.width)x\(d.height)")
  out("CGPreflightScreenCaptureAccess \(CGPreflightScreenCaptureAccess())")
case "list":
  let c = content()
  for d in c.displays { out("display \(d.displayID) \(d.width)x\(d.height)(pt) frame=\(d.frame) main=\(CGDisplayIsMain(d.displayID))") }
  for w in c.windows where w.windowLayer == 0 { out("window \(w.windowID) layer=\(w.windowLayer) onScreen=\(w.isOnScreen) active=\(w.isActive) \(w.owningApplication?.bundleIdentifier ?? "?") pid=\(w.owningApplication?.processID ?? 0) \"\(w.title ?? "")\" frame=\(w.frame)") }
case "cap", "shot":
  _ = NSApplication.shared // SCContentFilter(desktopIndependentWindow:) asserts CGS_REQUIRE_INIT in a process with no window-server connection (measured); a display filter does not
  let f = filterOf(A[1], A[2]), c = config(f)
  if mode == "shot" {
    let r: (CGImage?, Error?) = wait { k in SCScreenshotManager.captureImage(contentFilter: f, configuration: c) { k(($0, $1)) } }
    guard let img = r.0 else { out("shot FAILED: \(r.1 as NSError?)"); exit(7) }
    let u = URL(fileURLWithPath: opt("dump", "shot") + ".png"), dst = CGImageDestinationCreateWithURL(u as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(dst, img, nil); CGImageDestinationFinalize(dst)
    out("shot \(img.width)x\(img.height) bpc=\(img.bitsPerComponent) cs=\(img.colorSpace?.name.map { "\($0)" } ?? "?") → \(u.path)"); exit(0)
  }
  let cap = Cap(); cap.enc = encFrom(c.width, c.height); cap.idr = Int(opt("idr", "0"))!
  let s = SCStream(filter: f, configuration: c, delegate: cap)
  do { try s.addStreamOutput(cap, type: .screen, sampleHandlerQueue: DispatchQueue(label: "sck")) } catch { out("addStreamOutput: \(error)"); exit(8) }
  let secs = Double(opt("secs", "5"))!, c0 = cpu(), t0 = CACurrentMediaTime()
  let e: Error? = wait { k in s.startCapture { k($0) } }
  if let e { out("startCapture FAILED: \(e as NSError)"); exit(9) }
  out("startCapture ok in \(String(format: "%.0f", (CACurrentMediaTime() - t0) * 1000)) ms")
  DispatchQueue.main.asyncAfter(deadline: .now() + secs) {
    let _: Error? = wait { k in s.stopCapture { k($0) } }
    let span = cap.lastAt - cap.firstAt, names = [0: "complete", 1: "idle", 2: "blank", 3: "suspended", 4: "started", 5: "stopped"]
    out("frames by status: " + cap.status.keys.sorted().map { "\(names[$0] ?? "\($0)")=\(cap.status[$0]!)" }.joined(separator: " ") + String(format: "; complete fps %.1f over %.2f s; sizes %@; helper CPU %.1f%% of one core", span > 0 ? Double(cap.complete - 1) / span : 0, span, cap.sizes.sorted().joined(separator: ","), (cpu() - c0) / secs * 100))
    let cl = cap.capLat.sorted(); if !cl.isEmpty { out(String(format: "capture latency (displayTime → callback) p50 %.1f ms p95 %.1f ms max %.1f ms", cl[cl.count / 2], cl[min(cl.count - 1, cl.count * 95 / 100)], cl.last!)) }
    if let enc = cap.enc { out(enc.summary(secs)) }
    exit(0)
  }
  dispatchMain()
case "synth":
  let W = Int(A[1])!, H = Int(A[2])!, fmt = fourcc(opt("fmt", "420v")), secs = Double(opt("secs", "5"))!, fps = Double(opt("fps", "60"))!, pace = opt("pace", "1") == "1"
  var pool: CVPixelBufferPool?
  CVPixelBufferPoolCreate(nil, nil, [kCVPixelBufferWidthKey: W, kCVPixelBufferHeightKey: H, kCVPixelBufferPixelFormatTypeKey: fmt, kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pool)
  var noise = [UInt8](); if opt("content", "ramp") == "noise" { noise = [UInt8](repeating: 0, count: 64 << 20); arc4random_buf(&noise, noise.count) } // --content noise: worst case for rate control
  let enc = encFrom(W, H), idr = Int(opt("idr", "0"))!, c0 = cpu(), t0 = CACurrentMediaTime(); var n = 0
  while CACurrentMediaTime() - t0 < secs {
    var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, pool!, &pb); guard let pb else { break }
    CVPixelBufferLockBaseAddress(pb, []) // a moving diagonal ramp: every frame differs, so no encoder skips
    for p in 0..<max(1, CVPixelBufferGetPlaneCount(pb)) {
      let planar = CVPixelBufferIsPlanar(pb), base = planar ? CVPixelBufferGetBaseAddressOfPlane(pb, p)! : CVPixelBufferGetBaseAddress(pb)!
      let bpr = planar ? CVPixelBufferGetBytesPerRowOfPlane(pb, p) : CVPixelBufferGetBytesPerRow(pb), rows = planar ? CVPixelBufferGetHeightOfPlane(pb, p) : H
      for y in 0..<rows { if noise.isEmpty { memset(base.advanced(by: y * bpr), p == 0 ? Int32((y + n * 4) & 255) : 128, bpr) } else { noise.withUnsafeBytes { memcpy(base.advanced(by: y * bpr), $0.baseAddress!.advanced(by: (y * 977 + n * 7919 + p * 31) % (noise.count - bpr)), bpr) } } }
    }
    CVPixelBufferUnlockBaseAddress(pb, [])
    if pipeMode { writePlanes(pb, FileHandle.standardOutput) }
    enc?.encode(pb, CMTime(value: CMTimeValue(n), timescale: CMTimeScale(fps)), key: idr > 0 && n > 0 && n % idr == 0)
    n += 1
    if pace { let due = t0 + Double(n) / fps; let d = due - CACurrentMediaTime(); if d > 0 { usleep(useconds_t(d * 1e6)) } }
  }
  let span = CACurrentMediaTime() - t0
  out(String(format: "synth %dx%d %@ submitted %d frames in %.2f s (%.1f fps) helper CPU %.1f%%", W, H, fcc(fmt), n, span, Double(n) / span, (cpu() - c0) / span * 100))
  if let enc { out(enc.summary(span)) }
default: out("usage: sck-probe props | list | cap|shot display <id>|window <id>|title <s> [opts] | synth <W> <H> [opts]"); exit(2)
}
