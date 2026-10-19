// vibespace-audio-lane.swift — VibeSpace lane stream-audio-probe (probe only; a scratch helper, never the installed
// vibespace-screen). THE SPEAKER LEG of the machine stream on a Mac: what ScreenCaptureKit's audio capture
// (SCStreamConfiguration.capturesAudio) delivers — format, buffer size, how late each buffer arrives, CPU — timed against
// this helper's OWN test tone (1 kHz, -20 dBFS, 200 ms) scheduled at a known host time on the default output device
// (AVAudioEngine's output only: the input node is never touched, the device choice and its volume are never changed);
// and whether the in-box AudioToolbox has an Opus ENCODER (the stream wants Opus) — encode the captured audio, time it.
// Captured audio is never written to disk: only numbers.
//
// Build (on the Mac, Command Line Tools):  swiftc -O -o vibespace-audio-lane vibespace-audio-lane.swift && codesign -s - -f vibespace-audio-lane
// Run under the probe's granted launcher (its Screen Recording grant; never --disclaim):
//   ~/vs-probe/p3m/p3m-tcc $PWD/vibespace-audio-lane facts
//   ~/vs-probe/p3m/p3m-tcc $PWD/vibespace-audio-lane cap --secs 4 [--tone 1.0,2.5] [--opus 1] [--exclude-self 0|1]
import Foundation
import AppKit
import AVFoundation
import AudioToolbox
import CoreAudio
import CoreMedia
import ScreenCaptureKit

setvbuf(stdout, nil, _IOLBF, 0)
func out(_ d: [String: Any]) {
  if let j = try? JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]), let s = String(data: j, encoding: .utf8) { print(s) }
}
func r2(_ x: Double) -> Double { (x * 100).rounded() / 100 }
var tb = mach_timebase_info_data_t(); mach_timebase_info(&tb)
func hostNowSec() -> Double { Double(mach_absolute_time()) * Double(tb.numer) / Double(tb.denom) / 1e9 }
func hostTicks(sec: Double) -> UInt64 { UInt64(sec * 1e9 * Double(tb.denom) / Double(tb.numer)) }
let wallMinusHost = Date().timeIntervalSince1970 - hostNowSec()   // host seconds → Unix seconds
func cpuMs() -> Double { var u = rusage(); getrusage(RUSAGE_SELF, &u); return Double(u.ru_utime.tv_sec + u.ru_stime.tv_sec) * 1000 + Double(u.ru_utime.tv_usec + u.ru_stime.tv_usec) / 1000 }

let args = CommandLine.arguments
func opt(_ k: String, _ d: String) -> String { if let i = args.firstIndex(of: "--" + k), i + 1 < args.count { return args[i + 1] }; return d }

/// Opus in AudioToolbox: the format IDs that have encoders / decoders on this macOS.
func codecList(_ prop: AudioFormatPropertyID) -> [String] {
  var size: UInt32 = 0
  guard AudioFormatGetPropertyInfo(prop, 0, nil, &size) == noErr else { return [] }
  var ids = [AudioFormatID](repeating: 0, count: Int(size) / MemoryLayout<AudioFormatID>.size)
  guard AudioFormatGetProperty(prop, 0, nil, &size, &ids) == noErr else { return [] }
  return ids.map { id in String(bytes: [UInt8((id >> 24) & 255), UInt8((id >> 16) & 255), UInt8((id >> 8) & 255), UInt8(id & 255)], encoding: .ascii) ?? "\(id)" }
}

func defaultOutputFacts() -> [String: Any] {
  var dev = AudioObjectID(0); var size = UInt32(MemoryLayout<AudioObjectID>.size)
  var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultOutputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &dev) == noErr else { return [:] }
  var rate = Float64(0); size = UInt32(MemoryLayout<Float64>.size)
  addr.mSelector = kAudioDevicePropertyNominalSampleRate
  AudioObjectGetPropertyData(dev, &addr, 0, nil, &size, &rate)
  var latency = UInt32(0), safety = UInt32(0), bufFrames = UInt32(0); size = 4
  addr.mScope = kAudioObjectPropertyScopeOutput
  addr.mSelector = kAudioDevicePropertyLatency; AudioObjectGetPropertyData(dev, &addr, 0, nil, &size, &latency)
  addr.mSelector = kAudioDevicePropertySafetyOffset; AudioObjectGetPropertyData(dev, &addr, 0, nil, &size, &safety)
  addr.mSelector = kAudioDevicePropertyBufferFrameSize; addr.mScope = kAudioObjectPropertyScopeGlobal; AudioObjectGetPropertyData(dev, &addr, 0, nil, &size, &bufFrames)
  var transport = UInt32(0); addr.mSelector = kAudioDevicePropertyTransportType; AudioObjectGetPropertyData(dev, &addr, 0, nil, &size, &transport)
  let t = String(bytes: [UInt8((transport >> 24) & 255), UInt8((transport >> 16) & 255), UInt8((transport >> 8) & 255), UInt8(transport & 255)], encoding: .ascii) ?? "?"
  return ["rate": rate, "latencyFrames": latency, "safetyFrames": safety, "bufferFrames": bufFrames, "transport": t]
}

/// The 1 kHz onset rule shared with the Windows helper and the page: 2 ms Goertzel blocks, > 0.02, > 3x the last 100 ms.
final class Det {
  let n: Int, coeff: Double; var k = 0, s1 = 0.0, s2 = 0.0, hist = [Double](repeating: 0, count: 50), hi = 0, last = Int64.min / 2, start: Int64 = 0
  var peak = 0.0
  init(rate: Double) { n = Int((rate * 0.002).rounded()); coeff = 2 * cos(2 * Double.pi * 1000 / rate) }
  func push(_ x: Float, _ frame: Int64) -> Int64? {
    if k == 0 { start = frame }
    let s0 = Double(x) + coeff * s1 - s2; s2 = s1; s1 = s0; k += 1
    if k < n { return nil }
    let amp = 2 * sqrt(max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / Double(n); peak = max(peak, amp)
    let base = hist.max() ?? 0; var hit: Int64? = nil
    if amp > 0.02 && amp > 3 * base && start - last > Int64(n * 150) { hit = start; last = start }
    hist[hi] = amp; hi = (hi + 1) % hist.count; k = 0; s1 = 0; s2 = 0
    return hit
  }
}

/// The test tone: AVAudioEngine → the default output, buffers scheduled at known host times.
final class Tone {
  let engine = AVAudioEngine(), player = AVAudioPlayerNode(); let fmt: AVAudioFormat; var scheduled: [Double] = []
  init() {
    fmt = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
    engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: fmt)
  }
  func start() throws { try engine.start(); player.play() }
  func schedule(atHost sec: Double) {
    let n = AVAudioFrameCount(9600); let b = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: n)!; b.frameLength = n
    for i in 0..<Int(n) { let g = min(1.0, Double(min(i, Int(n) - i)) / 96.0); let v = Float(0.1 * g * sin(2 * Double.pi * 1000 * Double(i) / 48000)); b.floatChannelData![0][i] = v; b.floatChannelData![1][i] = v }
    player.scheduleBuffer(b, at: AVAudioTime(hostTime: hostTicks(sec: sec)), options: [], completionHandler: nil)
    scheduled.append(sec)
  }
  var outputLatencySec: Double { engine.outputNode.presentationLatency }
}

/// Opus via AudioToolbox (if this macOS has the encoder): 20 ms packets from 48 kHz float stereo.
final class OpusEnc {
  let conv: AVAudioConverter; let inFmt: AVAudioFormat; let outFmt: AVAudioFormat
  var fifo: [Float] = []; var fifoR: [Float] = []; var packets = 0, bytes = 0, consumed: Int64 = 0; var sizes: [Int] = []; var encodeMs: [Double] = []
  init?() {
    inFmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 2, interleaved: false)!
    var asbd = AudioStreamBasicDescription(mSampleRate: 48000, mFormatID: kAudioFormatOpus, mFormatFlags: 0, mBytesPerPacket: 0, mFramesPerPacket: 960, mBytesPerFrame: 0, mChannelsPerFrame: 2, mBitsPerChannel: 0, mReserved: 0)
    guard let of = AVAudioFormat(streamDescription: &asbd), let c = AVAudioConverter(from: inFmt, to: of) else { return nil }
    outFmt = of; conv = c; conv.bitRate = 64000
  }
  /// feed planar float frames; returns the packets made now (count) and stamps the encode time of each
  func feed(_ l: [Float], _ r: [Float]) -> Int {
    fifo += l; fifoR += r; var made = 0
    while fifo.count >= 960 {
      let pcm = AVAudioPCMBuffer(pcmFormat: inFmt, frameCapacity: 960)!; pcm.frameLength = 960
      for i in 0..<960 { pcm.floatChannelData![0][i] = fifo[i]; pcm.floatChannelData![1][i] = fifoR[i] }
      fifo.removeFirst(960); fifoR.removeFirst(960); consumed += 960
      let ob = AVAudioCompressedBuffer(format: outFmt, packetCapacity: 4, maximumPacketSize: conv.maximumOutputPacketSize)
      var given = false; var err: NSError?
      let t0 = hostNowSec()
      let st = conv.convert(to: ob, error: &err) { _, status in if given { status.pointee = .noDataNow; return nil }; given = true; status.pointee = .haveData; return pcm }
      encodeMs.append((hostNowSec() - t0) * 1000)
      if st == .error { break }
      for p in 0..<Int(ob.packetCount) { let sz = Int(ob.packetDescriptions![p].mDataByteSize); sizes.append(sz); bytes += sz; packets += 1; made += 1 }
    }
    return made
  }
}

final class Cap: NSObject, SCStreamOutput, SCStreamDelegate {
  var buffers = 0, frames: Int64 = 0, delays: [Double] = [], sizes: [Int] = [], fmtDesc: [String: Any] = [:], firstAt: Double = 0, startedAt = 0.0
  var onsetPts: [Double] = [], onsetSeen: [Double] = [], perSec: [[String: Any]] = [], secPeak = 0.0, secBuf = 0, nextSec = 1.0
  var det: Det? = nil; var enc: OpusEnc? = nil; var encOnsetPacketMs: [Double] = []; var pending: [(Int64, Double)] = []; var stopped: String? = nil
  let q = DispatchQueue(label: "audio")
  func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, sb.isValid else { return }
    let seen = hostNowSec(); if buffers == 0 { firstAt = seen }
    let n = CMSampleBufferGetNumSamples(sb); buffers += 1; secBuf += 1; sizes.append(n)
    let pts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))
    guard let fd = CMSampleBufferGetFormatDescription(sb), let asbdP = CMAudioFormatDescriptionGetStreamBasicDescription(fd) else { return }
    let a = asbdP.pointee; let rate = a.mSampleRate
    if fmtDesc.isEmpty { fmtDesc = ["rate": rate, "channels": a.mChannelsPerFrame, "bits": a.mBitsPerChannel, "float": (a.mFormatFlags & kAudioFormatFlagIsFloat) != 0, "nonInterleaved": (a.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0, "bytesPerFrame": a.mBytesPerFrame] }
    if det == nil { det = Det(rate: rate) }
    delays.append((seen - (pts + Double(n) / rate)) * 1000) // the buffer's LAST frame → our hands
    // the samples: an AudioBufferList (planar float, SCK's default)
    var abl = AudioBufferList(); var block: CMBlockBuffer?
    var sizeNeeded = 0
    CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sb, bufferListSizeNeededOut: &sizeNeeded, bufferListOut: nil, bufferListSize: 0, blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, blockBufferOut: nil)
    let ablP = UnsafeMutableRawPointer.allocate(byteCount: sizeNeeded, alignment: 16); defer { ablP.deallocate() }
    let abP = ablP.bindMemory(to: AudioBufferList.self, capacity: 1)
    guard CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sb, bufferListSizeNeededOut: nil, bufferListOut: abP, bufferListSize: sizeNeeded, blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, blockBufferOut: &block) == noErr else { return }
    _ = abl
    let list = UnsafeMutableAudioBufferListPointer(abP)
    let planar = (a.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0, chs = Int(a.mChannelsPerFrame)
    var L = [Float](repeating: 0, count: n), R = [Float](repeating: 0, count: n)
    if planar, list.count >= 1, let p0 = list[0].mData?.assumingMemoryBound(to: Float.self) {
      let p1 = list.count > 1 ? list[1].mData?.assumingMemoryBound(to: Float.self) : p0
      for i in 0..<n { L[i] = p0[i]; R[i] = p1?[i] ?? p0[i] }
    } else if let p = list[0].mData?.assumingMemoryBound(to: Float.self) {
      for i in 0..<n { L[i] = p[i * chs]; R[i] = p[i * chs + min(1, chs - 1)] }
    }
    for i in 0..<n {
      secPeak = max(secPeak, Double(abs(L[i])))
      if let f = det!.push(L[i], frames + Int64(i)) { onsetPts.append(pts + Double(f - frames) / rate); onsetSeen.append(seen); pending.append((f, seen)) }
    }
    if let e = enc {
      _ = e.feed(L, R)
      // the packet holding an onset exists once the encoder consumed its 20 ms: SCK's delivery of that buffer → the packet
      let now = hostNowSec()
      while let p = pending.first, p.0 < e.consumed { encOnsetPacketMs.append((now - p.1) * 1000); pending.removeFirst() }
    } else { pending.removeAll() }
    frames += Int64(n)
    if seen - startedAt >= nextSec {
      perSec.append(["t": nextSec, "buffers": secBuf, "peakDb": secPeak > 0 ? r2(20 * log10(secPeak)) : -999]); secBuf = 0; secPeak = 0; nextSec += 1
    }
  }
  func stream(_ stream: SCStream, didStopWithError error: Error) { stopped = "\(error)" }
}

func pct(_ xs: [Double]) -> [String: Any] {
  if xs.isEmpty { return [:] }
  let a = xs.sorted(); func q(_ p: Double) -> Double { a[min(a.count - 1, Int(floor(p * Double(a.count))))] }
  return ["n": a.count, "p50": r2(q(0.5)), "p95": r2(q(0.95)), "min": r2(a.first!), "max": r2(a.last!)]
}

/// Opus round trip in AudioToolbox: 1 s of the test tone encoded, then decoded back (the intercom / microphone road's
/// decoder on a Mac) — the decoded peak and the decode cost per packet.
func opusRoundTrip() -> [String: Any] {
  guard let enc = OpusEnc() else { return ["encoder": false] }
  var l = [Float](repeating: 0, count: 48000), r = l
  for i in 0..<48000 { let v = Float(0.1 * sin(2 * Double.pi * 1000 * Double(i) / 48000)); l[i] = v; r[i] = v }
  var packets: [Data] = []
  let inFmt = enc.inFmt
  while l.count >= 960 {
    let pcm = AVAudioPCMBuffer(pcmFormat: inFmt, frameCapacity: 960)!; pcm.frameLength = 960
    for i in 0..<960 { pcm.floatChannelData![0][i] = l[i]; pcm.floatChannelData![1][i] = r[i] }
    l.removeFirst(960); r.removeFirst(960)
    let ob = AVAudioCompressedBuffer(format: enc.outFmt, packetCapacity: 4, maximumPacketSize: enc.conv.maximumOutputPacketSize)
    var given = false; var err: NSError?
    _ = enc.conv.convert(to: ob, error: &err) { _, st in if given { st.pointee = .noDataNow; return nil }; given = true; st.pointee = .haveData; return pcm }
    for p in 0..<Int(ob.packetCount) { let d = ob.packetDescriptions![p]; packets.append(Data(bytes: ob.data.advanced(by: Int(d.mStartOffset)), count: Int(d.mDataByteSize))) }
  }
  let pcmOut = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 2, interleaved: false)!
  guard let dec = AVAudioConverter(from: enc.outFmt, to: pcmOut) else { return ["encoder": true, "decoder": false, "packets": packets.count] }
  var peak: Float = 0, ms: [Double] = [], frames = 0
  for p in packets {
    let cb = AVAudioCompressedBuffer(format: enc.outFmt, packetCapacity: 1, maximumPacketSize: max(p.count, 1))
    p.withUnsafeBytes { cb.data.copyMemory(from: $0.baseAddress!, byteCount: p.count) }
    cb.packetDescriptions![0] = AudioStreamPacketDescription(mStartOffset: 0, mVariableFramesInPacket: 0, mDataByteSize: UInt32(p.count)); cb.packetCount = 1; cb.byteLength = UInt32(p.count)
    let ob = AVAudioPCMBuffer(pcmFormat: pcmOut, frameCapacity: 1920)!
    var given = false; var err: NSError?; let t0 = hostNowSec()
    _ = dec.convert(to: ob, error: &err) { _, st in if given { st.pointee = .noDataNow; return nil }; given = true; st.pointee = .haveData; return cb }
    ms.append((hostNowSec() - t0) * 1000); frames += Int(ob.frameLength)
    for i in 0..<Int(ob.frameLength) { peak = max(peak, abs(ob.floatChannelData![0][i])) }
  }
  return ["encoder": true, "decoder": true, "packets": packets.count, "bytes": packets.reduce(0) { $0 + $1.count }, "decodedFrames": frames, "decodedPeak": r2(Double(peak)), "decodeMsPerPacket": pct(ms)]
}

let mode = args.count > 1 ? args[1] : "facts"
if mode == "facts" {
  out(["ok": true, "os": ProcessInfo.processInfo.operatingSystemVersionString, "screenCapturePreflight": CGPreflightScreenCaptureAccess(),
       "encoders": codecList(kAudioFormatProperty_Encoders), "decoders": codecList(kAudioFormatProperty_Decoders),
       "opusEncoder": OpusEnc() != nil, "opusRoundTrip": opusRoundTrip(), "defaultOutput": defaultOutputFacts()])
  exit(0)
}

let secs = Double(opt("secs", "4")) ?? 4
let tones = opt("tone", "").split(separator: ",").compactMap { Double($0) }
if tones.count > 3 { out(["ok": false, "error": "at most 3 test tones a run"]); exit(2) }
_ = NSApplication.shared // SCK in a CLI wants the app's connection first (lane stream-p3m-probe)
let cap = Cap(); if opt("opus", "0") == "1" { cap.enc = OpusEnc() }
let cpu0 = cpuMs(), wall0 = hostNowSec()
var tone: Tone? = nil
let sem = DispatchSemaphore(value: 0)
var result: [String: Any] = ["ok": true]
Task {
  do {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let display = content.displays.first else { result = ["ok": false, "error": "no display"]; sem.signal(); return }
    let cfg = SCStreamConfiguration()
    cfg.capturesAudio = true; cfg.sampleRate = 48000; cfg.channelCount = 2
    cfg.excludesCurrentProcessAudio = opt("exclude-self", "0") == "1"
    cfg.width = 64; cfg.height = 64; cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1); cfg.queueDepth = 3
    let filter = SCContentFilter(display: display, excludingWindows: [])
    let stream = SCStream(filter: filter, configuration: cfg, delegate: cap)
    try stream.addStreamOutput(cap, type: .audio, sampleHandlerQueue: cap.q)
    let t0 = hostNowSec()
    try await stream.startCapture()
    cap.startedAt = hostNowSec(); result["startCaptureMs"] = r2((cap.startedAt - t0) * 1000)
    if !tones.isEmpty { tone = Tone(); try tone!.start(); for t in tones { tone!.schedule(atHost: cap.startedAt + t) } }
    try await Task.sleep(nanoseconds: UInt64(secs * 1e9))
    try await stream.stopCapture()
  } catch { result = ["ok": false, "error": "\(error)"] }
  sem.signal()
}
sem.wait()
tone?.engine.stop()
let cpu = cpuMs() - cpu0, wall = (hostNowSec() - wall0) * 1000
if result["ok"] as? Bool == true {
  result["format"] = cap.fmtDesc; result["buffers"] = cap.buffers; result["frames"] = cap.frames; result["framesPerBuffer"] = pct(cap.sizes.map(Double.init))
  result["firstBufferAfterMs"] = cap.buffers > 0 ? r2((cap.firstAt - cap.startedAt) * 1000) : NSNull()
  result["deliveryDelayMs"] = pct(cap.delays); result["perSecond"] = cap.perSec; result["tonePeakAmp"] = r2(cap.det?.peak ?? 0)
  if let t = tone {
    result["toneOutputLatencyMs"] = r2(t.outputLatencySec * 1000)
    result["tones"] = t.scheduled.enumerated().map { (i, s) -> [String: Any] in
      var d: [String: Any] = ["scheduledHost": r2(s)]
      if i < cap.onsetPts.count { d["capturedPtsMinusScheduledMs"] = r2((cap.onsetPts[i] - s) * 1000); d["seenMinusScheduledMs"] = r2((cap.onsetSeen[i] - s) * 1000) }
      return d
    }
  }
  if let e = cap.enc { result["opus"] = ["packets": e.packets, "kbps": r2(Double(e.bytes) * 8 / max(0.001, Double(cap.frames) / 48000) / 1000), "sizes": pct(e.sizes.map(Double.init)), "encodeMsPerPacket": pct(e.encodeMs), "onsetPacketAfterSeenMs": cap.encOnsetPacketMs.map(r2)] }
  if let s = cap.stopped { result["stoppedWithError"] = s }
}
result["cpuMs"] = r2(cpu); result["wallMs"] = r2(wall); result["cpuPct"] = r2(100 * cpu / wall); result["wallMinusHost"] = r2(wallMinusHost)
out(result)
exit(0)
