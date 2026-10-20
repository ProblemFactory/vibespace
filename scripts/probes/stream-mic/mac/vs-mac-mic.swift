// vs-mac-mic.swift — VibeSpace lane stream-mic-wheel-probe (probe only; nothing in src/ calls it).
//
// THE MAC'S VIRTUAL MICROPHONE, as the machine sees it once a HAL plug-in is installed (ours: "VibeSpace Microphone",
// scripts/probes/stream-audio/mac/vsmic/; or BlackHole 2ch): one virtual device whose OUTPUT the agent plays the viewer's voice
// into and whose INPUT any app picks as its microphone. Plain CoreAudio HAL calls, nothing third-party:
//   facts                          every audio device (name, UID, transport, in/out channels) + the default input / output
//   loop --uid U --secs N --tone T,T [--read 1|0]
//                                  plays our 1 kHz −20 dBFS 200 ms tones into the device's OUTPUT and (with --read 1) reads its
//                                  INPUT in the same IOProc: the in-device latency on the HAL's own clock (host time of the
//                                  sample written → host time of the sample read), the level, the IO buffer. Reading an input
//                                  is a MICROPHONE read for TCC: without a grant the HAL hands this process silence.
//   listen --uid U --secs N        a SEPARATE process reading the device's input (an "app"): when did each tone arrive
//   setdefault --input U | --output U --yes 1
//                                  restore a default device (the probe never runs it unasked)
// Captured audio is never written anywhere; only onset times, levels and counts leave this process. One JSON line on stdout.
//   swiftc -O -o vs-mac-mic vs-mac-mic.swift && codesign -s - -f vs-mac-mic
import Foundation
import CoreAudio

func opt(_ k: String, _ d: String) -> String { let a = CommandLine.arguments; if let i = a.firstIndex(of: "--" + k), i + 1 < a.count { return a[i + 1] }; return d }
func q(_ s: String) -> String { var o = "\""; for u in s.unicodeScalars { switch u { case "\"": o += "\\\""; case "\\": o += "\\\\"; default: if u.value < 32 || u.value > 126 { o += String(format: "\\u%04x", u.value) } else { o.unicodeScalars.append(u) } } }; return o + "\"" }
func r2(_ x: Double) -> String { String(format: "%.2f", x) }
var tb = mach_timebase_info_data_t(); mach_timebase_info(&tb)
func hostMs(_ h: UInt64) -> Double { Double(h) * Double(tb.numer) / Double(tb.denom) / 1e6 }
let wall0 = Date().timeIntervalSince1970 * 1000, host0 = hostMs(mach_absolute_time())
func wallOfHost(_ h: UInt64) -> Double { wall0 + (hostMs(h) - host0) }

func prop<T>(_ id: AudioObjectID, _ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, _ v: T) -> T? {
  var a = AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: kAudioObjectPropertyElementMain)
  var out = v; var size = UInt32(MemoryLayout<T>.size)
  return AudioObjectGetPropertyData(id, &a, 0, nil, &size, &out) == 0 ? out : nil
}
func str(_ id: AudioObjectID, _ sel: AudioObjectPropertySelector) -> String {
  var a = AudioObjectPropertyAddress(mSelector: sel, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var s: Unmanaged<CFString>? = nil; var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, &s) == 0, let v = s else { return "" }
  return v.takeRetainedValue() as String
}
func channels(_ id: AudioObjectID, _ scope: AudioObjectPropertyScope) -> Int {
  var a = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreamConfiguration, mScope: scope, mElement: kAudioObjectPropertyElementMain)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(id, &a, 0, nil, &size) == 0, size > 0 else { return 0 }
  let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: 16); defer { raw.deallocate() }
  guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, raw) == 0 else { return 0 }
  let abl = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
  return abl.reduce(0) { $0 + Int($1.mNumberChannels) }
}
func devices() -> [AudioObjectID] {
  var a = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var size: UInt32 = 0; AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size)
  var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &ids)
  return ids
}
func defaultDev(_ sel: AudioObjectPropertySelector) -> AudioObjectID { prop(AudioObjectID(kAudioObjectSystemObject), sel, kAudioObjectPropertyScopeGlobal, AudioObjectID(0)) ?? 0 }
func byUID(_ uid: String) -> AudioObjectID? { devices().first { str($0, kAudioDevicePropertyDeviceUID) == uid } }

/// 1 kHz onsets over 2 ms blocks (the other legs' rule): > 0.02, > 3x the previous 100 ms, 300 ms apart.
final class Det {
  let n: Int, coeff: Double; var k = 0, s1 = 0.0, s2 = 0.0, hist = [Double](repeating: 0, count: 50), hi = 0, start: Int64 = 0, last: Int64 = -1_000_000_000, frame: Int64 = 0, peak = 0.0
  init(rate: Double) { n = Int((rate * 0.002).rounded()); coeff = 2 * cos(2 * Double.pi * 1000 / rate) }
  /// → the onset's first frame, or nil
  func push(_ x: Float) -> Int64? {
    if k == 0 { start = frame }
    let s0 = Double(x) + coeff * s1 - s2; s2 = s1; s1 = s0; k += 1; frame += 1
    if k < n { return nil }
    let amp = 2 * sqrt(max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / Double(n); if amp > peak { peak = amp }
    let base = hist.max() ?? 0; var hit: Int64? = nil
    if amp > 0.02 && amp > 3 * base && start - last > Int64(n * 150) { last = start; hit = start }
    hist[hi] = amp; hi = (hi + 1) % 50; k = 0; s1 = 0; s2 = 0
    return hit
  }
}

func facts() {
  var rows: [String] = []
  for d in devices() {
    rows.append("{\"name\":\(q(str(d, kAudioObjectPropertyName))),\"uid\":\(q(str(d, kAudioDevicePropertyDeviceUID))),\"maker\":\(q(str(d, kAudioObjectPropertyManufacturer))),\"in\":\(channels(d, kAudioObjectPropertyScopeInput)),\"out\":\(channels(d, kAudioObjectPropertyScopeOutput)),\"rate\":\(prop(d, kAudioDevicePropertyNominalSampleRate, kAudioObjectPropertyScopeGlobal, Float64(0)) ?? 0)}")
  }
  let di = defaultDev(kAudioHardwarePropertyDefaultInputDevice), dout = defaultDev(kAudioHardwarePropertyDefaultOutputDevice), dsys = defaultDev(kAudioHardwarePropertyDefaultSystemOutputDevice)
  print("{\"ok\":true,\"devices\":[\(rows.joined(separator: ","))],\"defaultInput\":{\"name\":\(q(str(di, kAudioObjectPropertyName))),\"uid\":\(q(str(di, kAudioDevicePropertyDeviceUID)))},\"defaultOutput\":{\"name\":\(q(str(dout, kAudioObjectPropertyName))),\"uid\":\(q(str(dout, kAudioDevicePropertyDeviceUID)))},\"defaultSystemOutput\":{\"name\":\(q(str(dsys, kAudioObjectPropertyName))),\"uid\":\(q(str(dsys, kAudioDevicePropertyDeviceUID)))}}")
}

/// loop / listen: ONE IOProc on the device — write our tones into its output (loop), read its input (loop --read 1, listen).
func run(write: Bool, read: Bool) -> Int32 {
  let uid = opt("uid", ""), secs = Double(opt("secs", "4")) ?? 4
  let tones = opt("tone", "").split(separator: ",").compactMap { Double($0) }
  guard let dev = byUID(uid) else { print("{\"ok\":false,\"error\":\(q("no device with UID " + uid))}"); return 1 }
  // GUARD: never play into a device that is a default OUTPUT (the speakers) — only a virtual device nobody hears
  if write && (dev == defaultDev(kAudioHardwarePropertyDefaultOutputDevice) || dev == defaultDev(kAudioHardwarePropertyDefaultSystemOutputDevice)) {
    print("{\"ok\":false,\"error\":\"refused: the device is a default output (audible)\"}"); return 1
  }
  let rate = prop(dev, kAudioDevicePropertyNominalSampleRate, kAudioObjectPropertyScopeGlobal, Float64(0)) ?? 48000
  let bufFrames = prop(dev, kAudioDevicePropertyBufferFrameSize, kAudioObjectPropertyScopeGlobal, UInt32(0)) ?? 0
  let safetyIn = prop(dev, kAudioDevicePropertySafetyOffset, kAudioObjectPropertyScopeInput, UInt32(0)) ?? 0
  let safetyOut = prop(dev, kAudioDevicePropertySafetyOffset, kAudioObjectPropertyScopeOutput, UInt32(0)) ?? 0
  let latIn = prop(dev, kAudioDevicePropertyLatency, kAudioObjectPropertyScopeInput, UInt32(0)) ?? 0
  let latOut = prop(dev, kAudioDevicePropertyLatency, kAudioObjectPropertyScopeOutput, UInt32(0)) ?? 0
  let det = Det(rate: rate), lock = NSLock()
  var written: [String] = [], inOnsets: [String] = [], cycles = 0, inFrames: Int64 = 0, nonZeroIn = 0
  var outFrame: Int64 = 0, toneIdx = 0, toneAt: Int64 = -1
  let toneLen = Int64(rate / 5), amp = 0.1
  var t0Host: UInt64 = 0
  var procID: AudioDeviceIOProcID? = nil
  let st = AudioDeviceCreateIOProcIDWithBlock(&procID, dev, nil) { inNow, inInput, inInputTime, outOutput, inOutputTime in
    lock.lock(); defer { lock.unlock() }
    cycles += 1
    if t0Host == 0 { t0Host = inNow.pointee.mHostTime }
    let elapsed = (hostMs(inNow.pointee.mHostTime) - hostMs(t0Host)) / 1000
    if read {
      let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inInput))
      if let b = abl.first, let p = b.mData?.assumingMemoryBound(to: Float.self) {
        let ch = Int(max(1, b.mNumberChannels)), n = Int(b.mDataByteSize) / 4 / ch
        for i in 0..<n {
          let x = p[i * ch]; if x != 0 { nonZeroIn += 1 }
          if let f = det.push(x) { let host = inInputTime.pointee.mHostTime + UInt64(Double(f - inFrames) / rate * 1e9 * Double(tb.denom) / Double(tb.numer)); inOnsets.append("{\"hostWall\":\(r2(wallOfHost(host))),\"seenWall\":\(r2(wallOfHost(inNow.pointee.mHostTime)))}") }
        }
        inFrames += Int64(n)
      }
    }
    if write {
      let abl = UnsafeMutableAudioBufferListPointer(outOutput)
      guard let b = abl.first, let p = b.mData?.assumingMemoryBound(to: Float.self) else { return }
      let ch = Int(max(1, b.mNumberChannels)), n = Int(b.mDataByteSize) / 4 / ch
      for i in 0..<n {
        let f = outFrame + Int64(i)
        if toneAt < 0 && toneIdx < tones.count && elapsed >= tones[toneIdx] {
          toneAt = f; toneIdx += 1
          let host = inOutputTime.pointee.mHostTime + UInt64(Double(i) / rate * 1e9 * Double(tb.denom) / Double(tb.numer))
          written.append("{\"hostWall\":\(r2(wallOfHost(host))),\"writtenWall\":\(r2(wallOfHost(inNow.pointee.mHostTime)))}")
        }
        var v: Float = 0
        if toneAt >= 0 { let k = f - toneAt; if k < toneLen { let ramp = min(1.0, Double(min(k, toneLen - k)) / (rate * 0.002)); v = Float(amp * ramp * sin(2 * Double.pi * 1000 * Double(k) / rate)) } else { toneAt = -1 } }
        for c in 0..<ch { p[i * ch + c] = v }
      }
      outFrame += Int64(n)
    }
  }
  guard st == 0, let pid = procID else { print("{\"ok\":false,\"error\":\"AudioDeviceCreateIOProcID \(st)\"}"); return 1 }
  let s = AudioDeviceStart(dev, pid)
  if s != 0 { print("{\"ok\":false,\"error\":\"AudioDeviceStart \(s)\"}"); return 1 }
  Thread.sleep(forTimeInterval: secs)
  AudioDeviceStop(dev, pid); AudioDeviceDestroyIOProcID(dev, pid)
  lock.lock(); defer { lock.unlock() }
  print("{\"ok\":true,\"mode\":\"\(write ? "loop" : "listen")\",\"device\":\(q(str(dev, kAudioObjectPropertyName))),\"rate\":\(rate),\"bufferFrames\":\(bufFrames),\"safetyOffset\":{\"in\":\(safetyIn),\"out\":\(safetyOut)},\"latency\":{\"in\":\(latIn),\"out\":\(latOut)},\"cycles\":\(cycles),\"inFrames\":\(inFrames),\"nonZeroInputSamples\":\(nonZeroIn),\"peak\":\(r2(det.peak)),\"written\":[\(written.joined(separator: ","))],\"inputOnsets\":[\(inOnsets.joined(separator: ","))]}")
  return 0
}

func setDefault() -> Int32 {
  guard opt("yes", "0") == "1" else { print("{\"ok\":false,\"error\":\"refused without --yes 1: this changes the default audio device\"}"); return 1 }
  for (k, sel) in [("input", kAudioHardwarePropertyDefaultInputDevice), ("output", kAudioHardwarePropertyDefaultOutputDevice)] {
    let uid = opt(k, ""); if uid.isEmpty { continue }
    guard var d = byUID(uid) else { print("{\"ok\":false,\"error\":\(q("no device " + uid))}"); return 1 }
    var a = AudioObjectPropertyAddress(mSelector: sel, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    let r = AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, UInt32(MemoryLayout<AudioObjectID>.size), &d)
    if r != 0 { print("{\"ok\":false,\"error\":\"set \(k) \(r)\"}"); return 1 }
  }
  print("{\"ok\":true}"); return 0
}

let mode = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
switch mode {
case "facts": facts()
case "loop": exit(run(write: true, read: opt("read", "1") == "1"))
case "listen": exit(run(write: false, read: true))
case "setdefault": exit(setDefault())
default: print("{\"ok\":false,\"error\":\"usage: vs-mac-mic facts | loop --uid U --secs N --tone T,T [--read 1|0] | listen --uid U --secs N | setdefault --input U | --output U --yes 1\"}"); exit(2)
}
