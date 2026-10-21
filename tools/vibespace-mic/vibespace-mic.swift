// vibespace-mic.swift — the VibeSpace agent's MICROPHONE helper on a Mac (lane stream-mic-road; the measured facts: lane
// stream-mic-wheel-probe, scripts/probes/stream-mic/mac/vs-mac-mic.swift). Built ON the Mac by its agent with the Command Line
// Tools' swiftc (src/mic-model.js macMicBuildPlan — both slices, lipo, one ad-hoc signature: the screen helper's way, but a
// SEPARATE binary — the screen helper's version, identity and Screen Recording grant never change). It only PLAYS (an output
// device needs no TCC grant); it never reads a microphone. Its text rides the agent's bundle (src/mic-helper-source.js).
//   facts       every audio device (UID, name, input / output channels) + the default input, output and system output
//   render      the viewer's voice as length-framed Opus packets on stdin (u32 little-endian length, then the packet — Chrome's
//               20 ms stereo Opus) → AudioToolbox's Opus decoder (AudioConverter, at the device's own rate) → ONE device's
//               OUTPUT: VS_MIC_DEVICE = its UID («VibeSpace Microphone» — every app that picks it as its microphone hears the
//               voice), or VS_MIC_SPEAKERS=1 = the default output (the intercom: no virtual microphone yet). Ends when stdin
//               closes. stderr: one JSON line per event (started, stats once a second, end)
//   setdefault  the default INPUT device (VS_MIC_DEVICE = its UID) — the 「设为默认麦克风」 / 「改回」 pair
import Foundation
import CoreAudio
import AudioToolbox

func q(_ s: String) -> String { var o = "\""; for u in s.unicodeScalars { switch u { case "\"": o += "\\\""; case "\\": o += "\\\\"; default: if u.value < 32 || u.value > 126 { o += String(format: "\\u%04x", u.value) } else { o.unicodeScalars.append(u) } } }; return o + "\"" }
func ev(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }
let env = ProcessInfo.processInfo.environment

func prop<T>(_ id: AudioObjectID, _ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope, _ v: T) -> T? {
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
func one(_ d: AudioObjectID) -> String { "{\"uid\":\(q(str(d, kAudioDevicePropertyDeviceUID))),\"name\":\(q(str(d, kAudioObjectPropertyName)))}" }

func facts() -> Int32 {
  let rows = devices().map { d in "{\"uid\":\(q(str(d, kAudioDevicePropertyDeviceUID))),\"name\":\(q(str(d, kAudioObjectPropertyName))),\"inputs\":\(channels(d, kAudioObjectPropertyScopeInput)),\"outputs\":\(channels(d, kAudioObjectPropertyScopeOutput))}" }
  print("{\"ok\":true,\"devices\":[\(rows.joined(separator: ","))],\"defaults\":{\"input\":\(one(defaultDev(kAudioHardwarePropertyDefaultInputDevice))),\"output\":\(one(defaultDev(kAudioHardwarePropertyDefaultOutputDevice))),\"system\":\(one(defaultDev(kAudioHardwarePropertyDefaultSystemOutputDevice)))}}")
  return 0
}

/// The decoder's input: ONE Opus packet at a time (the converter's input proc hands it over once, then says "no more").
final class Feed { var packet = Data(); var desc = AudioStreamPacketDescription(); var given = false }
let inputProc: AudioConverterComplexInputDataProc = { _, ioPackets, ioData, outDesc, user in
  let f = Unmanaged<Feed>.fromOpaque(user!).takeUnretainedValue()
  if f.given || f.packet.isEmpty { ioPackets.pointee = 0; return 1 } // 1 = no more input for this call
  f.given = true
  f.desc = AudioStreamPacketDescription(mStartOffset: 0, mVariableFramesInPacket: 0, mDataByteSize: UInt32(f.packet.count))
  ioPackets.pointee = 1
  f.packet.withUnsafeMutableBytes { p in
    ioData.pointee.mNumberBuffers = 1
    ioData.pointee.mBuffers.mData = p.baseAddress
    ioData.pointee.mBuffers.mDataByteSize = UInt32(p.count)
    ioData.pointee.mBuffers.mNumberChannels = 2
  }
  if let d = outDesc { withUnsafeMutablePointer(to: &f.desc) { d.pointee = $0 } }
  return 0
}

func render() -> Int32 {
  let speakers = env["VS_MIC_SPEAKERS"] == "1"
  let dev: AudioObjectID
  if speakers { dev = defaultDev(kAudioHardwarePropertyDefaultOutputDevice) }
  else { guard let d = byUID(env["VS_MIC_DEVICE"] ?? "") else { ev("{\"ev\":\"error\",\"error\":\"no device with that UID\"}"); return 1 }; dev = d }
  let rate = prop(dev, kAudioDevicePropertyNominalSampleRate, kAudioObjectPropertyScopeGlobal, Float64(0)) ?? 48000
  var inFmt = AudioStreamBasicDescription(mSampleRate: 48000, mFormatID: kAudioFormatOpus, mFormatFlags: 0, mBytesPerPacket: 0, mFramesPerPacket: 960, mBytesPerFrame: 0, mChannelsPerFrame: 2, mBitsPerChannel: 0, mReserved: 0)
  var outFmt = AudioStreamBasicDescription(mSampleRate: rate, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked, mBytesPerPacket: 8, mFramesPerPacket: 1, mBytesPerFrame: 8, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
  var conv: AudioConverterRef? = nil
  let cs = AudioConverterNew(&inFmt, &outFmt, &conv)
  guard cs == 0, let converter = conv else { ev("{\"ev\":\"error\",\"error\":\"AudioConverterNew (Opus) \(cs)\"}"); return 1 }
  // the ring the IOProc pulls from: interleaved stereo floats, at most 400 ms (older audio is dropped, never played late)
  let lock = NSLock(); var ring = [Float](); ring.reserveCapacity(Int(rate) * 2); let maxRing = Int(rate * 0.4) * 2, pre = Int(rate * 0.02) * 2
  var started = false, open = true, frames: Int64 = 0, inPackets = 0, underruns = 0, dropped = 0, decodeErrors = 0
  let outCh = max(1, channels(dev, kAudioObjectPropertyScopeOutput))
  var procID: AudioDeviceIOProcID? = nil
  let st = AudioDeviceCreateIOProcIDWithBlock(&procID, dev, nil) { _, _, _, outOutput, _ in
    let abl = UnsafeMutableAudioBufferListPointer(outOutput)
    guard let b = abl.first, let p = b.mData?.assumingMemoryBound(to: Float.self) else { return }
    let ch = Int(max(1, b.mNumberChannels)), n = Int(b.mDataByteSize) / 4 / ch
    lock.lock(); defer { lock.unlock() }
    if !started && ring.count >= pre { started = true }
    var have = started ? min(n, ring.count / 2) : 0
    for i in 0..<n {
      let l: Float = i < have ? ring[i * 2] : 0, r: Float = i < have ? ring[i * 2 + 1] : 0
      for c in 0..<ch { p[i * ch + c] = ch == 1 ? (l + r) / 2 : c == 0 ? l : c == 1 ? r : 0 }
    }
    if started && have < n { underruns += 1 }
    if have > 0 { ring.removeFirst(have * 2) } else { have = 0 }
    frames += Int64(n)
  }
  guard st == 0, let pid = procID else { ev("{\"ev\":\"error\",\"error\":\"AudioDeviceCreateIOProcID \(st)\"}"); return 1 }
  guard AudioDeviceStart(dev, pid) == 0 else { ev("{\"ev\":\"error\",\"error\":\"AudioDeviceStart\"}"); return 1 }
  ev("{\"ev\":\"started\",\"endpoint\":\(q(str(dev, kAudioObjectPropertyName))),\"speakers\":\(speakers),\"rate\":\(rate),\"channels\":\(outCh)}")
  let feed = Feed(); let user = Unmanaged.passUnretained(feed).toOpaque()
  let maxOut = Int(rate / 48000 * 960 * 6) + 64
  var pcm = [Float](repeating: 0, count: maxOut * 2)
  let input = FileHandle.standardInput; var buf = Data(); var last = Date()
  while open {
    let d = input.availableData
    if d.isEmpty { open = false; break }
    buf.append(d)
    while buf.count >= 4 {
      let len = Int(buf[buf.startIndex]) | Int(buf[buf.startIndex + 1]) << 8 | Int(buf[buf.startIndex + 2]) << 16 | Int(buf[buf.startIndex + 3]) << 24
      if len <= 0 || len > 4000 { ev("{\"ev\":\"error\",\"error\":\"a frame out of bounds\"}"); open = false; break }
      if buf.count < 4 + len { break }
      feed.packet = buf.subdata(in: (buf.startIndex + 4)..<(buf.startIndex + 4 + len)); feed.given = false
      buf.removeSubrange(buf.startIndex..<(buf.startIndex + 4 + len))
      inPackets += 1
      var outPackets = UInt32(maxOut)
      let r = pcm.withUnsafeMutableBytes { (p) -> OSStatus in
        var list = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(mNumberChannels: 2, mDataByteSize: UInt32(p.count), mData: p.baseAddress))
        return AudioConverterFillComplexBuffer(converter, inputProc, user, &outPackets, &list, nil)
      }
      if r != 0 && r != 1 { decodeErrors += 1; continue }
      lock.lock()
      ring.append(contentsOf: pcm[0..<(Int(outPackets) * 2)])
      if ring.count > maxRing { let cut = ring.count - maxRing; ring.removeFirst(cut); dropped += cut / 2 }
      lock.unlock()
    }
    if Date().timeIntervalSince(last) >= 1 { last = Date(); lock.lock(); let s = "{\"ev\":\"stats\",\"frames\":\(frames),\"packets\":\(inPackets),\"underruns\":\(underruns),\"dropped\":\(dropped),\"decodeErrors\":\(decodeErrors)}"; lock.unlock(); ev(s) }
  }
  Thread.sleep(forTimeInterval: 0.05)
  AudioDeviceStop(dev, pid); AudioDeviceDestroyIOProcID(dev, pid); AudioConverterDispose(converter)
  ev("{\"ev\":\"end\",\"why\":\"stdin_closed\",\"packets\":\(inPackets),\"frames\":\(frames)}")
  return 0
}

func setDefault() -> Int32 {
  guard var d = byUID(env["VS_MIC_DEVICE"] ?? "") else { print("{\"ok\":false,\"error\":\"no device with that UID\"}"); return 1 }
  var a = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultInputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  let r = AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, UInt32(MemoryLayout<AudioObjectID>.size), &d)
  if r != 0 { print("{\"ok\":false,\"error\":\"the default input was not set (\(r))\"}"); return 1 }
  print("{\"ok\":true,\"endpoint\":\(q(str(d, kAudioObjectPropertyName))),\"uid\":\(q(str(d, kAudioDevicePropertyDeviceUID)))}"); return 0
}

let mode = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
switch mode {
case "facts": exit(facts())
case "render": exit(render())
case "setdefault": exit(setDefault())
default: print("{\"ok\":false,\"error\":\"usage: vibespace-mic facts | render | setdefault (names ride the env: VS_MIC_DEVICE, VS_MIC_SPEAKERS)\"}"); exit(2)
}
