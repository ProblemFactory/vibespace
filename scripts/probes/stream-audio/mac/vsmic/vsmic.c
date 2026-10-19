// vsmic.c — VibeSpace lane stream-audio-probe (probe only; NOT installed anywhere).
//
// THE MICROPHONE ROAD on a Mac, judged by building it: a minimal CoreAudio AudioServerPlugIn (a user-space HAL plug-in that
// coreaudiod loads from /Library/Audio/Plug-Ins/HAL) publishing ONE virtual device, "VibeSpace Microphone":
//   * an OUTPUT stream — the agent plays the viewer's decoded voice into it (any CoreAudio client, by the device's UID);
//   * an INPUT stream — every app sees a microphone and reads what was played, sample time for sample time (a loopback
//     ring inside the plug-in: no IPC, no kernel code).
// Same object layout as Apple's NullAudio sample (plug-in 1, device 2, input stream 3, output stream 4); 48 kHz float32
// stereo only; no controls. The probe never installs it: scripts/probes/stream-audio/mac/vsmic-host.c loads the bundle the way
// coreaudiod does (CFPlugIn factory from Info.plist) inside an ordinary process and drives its IO cycle.
//
// Build:  clang -O2 -Wall -bundle -o VibeSpaceMic.driver/Contents/MacOS/VibeSpaceMic vsmic.c -framework CoreAudio -framework CoreFoundation
#include <CoreAudio/AudioServerPlugIn.h>
#include <CoreFoundation/CoreFoundation.h>
#include <mach/mach_time.h>
#include <pthread.h>
#include <string.h>

enum { kPlugIn = kAudioObjectPlugInObject, kDevice = 2, kStreamIn = 3, kStreamOut = 4 };
#define kRate 48000.0
#define kChannels 2
#define kRingFrames 16384u            /* the loopback ring = the zero-time-stamp period */
#define kDeviceUID "VibeSpaceMic_UID"
#define kModelUID "VibeSpaceMic_ModelUID"

static AudioServerPlugInHostRef gHost = NULL;
static UInt32 gRefCount = 0, gIOCount = 0;
static pthread_mutex_t gLock = PTHREAD_MUTEX_INITIALIZER;
static Float64 gTicksPerFrame = 0;
static UInt64 gAnchor = 0, gStamps = 0;
static float gRing[kRingFrames * kChannels];

static HRESULT QueryInterface(void *drv, REFIID iid, LPVOID *out);
static ULONG AddRef(void *drv);
static ULONG Release(void *drv);
static OSStatus Initialize(AudioServerPlugInDriverRef drv, AudioServerPlugInHostRef host);
static OSStatus CreateDevice(AudioServerPlugInDriverRef d, CFDictionaryRef desc, const AudioServerPlugInClientInfo *ci, AudioObjectID *out) { return kAudioHardwareUnsupportedOperationError; }
static OSStatus DestroyDevice(AudioServerPlugInDriverRef d, AudioObjectID dev) { return kAudioHardwareUnsupportedOperationError; }
static OSStatus AddDeviceClient(AudioServerPlugInDriverRef d, AudioObjectID dev, const AudioServerPlugInClientInfo *ci) { return dev == kDevice ? 0 : kAudioHardwareBadObjectError; }
static OSStatus RemoveDeviceClient(AudioServerPlugInDriverRef d, AudioObjectID dev, const AudioServerPlugInClientInfo *ci) { return dev == kDevice ? 0 : kAudioHardwareBadObjectError; }
static OSStatus PerformConfigChange(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt64 action, void *info) { return 0; }
static OSStatus AbortConfigChange(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt64 action, void *info) { return 0; }
static Boolean HasProperty(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a);
static OSStatus IsPropertySettable(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a, Boolean *out);
static OSStatus GetPropertyDataSize(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a, UInt32 qSize, const void *q, UInt32 *outSize);
static OSStatus GetPropertyData(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a, UInt32 qSize, const void *q, UInt32 inSize, UInt32 *outSize, void *out);
static OSStatus SetPropertyData(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a, UInt32 qSize, const void *q, UInt32 inSize, const void *in) { return kAudioHardwareUnsupportedOperationError; }
static OSStatus StartIO(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client);
static OSStatus StopIO(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client);
static OSStatus GetZeroTimeStamp(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client, Float64 *outSample, UInt64 *outHost, UInt64 *outSeed);
static OSStatus WillDoIO(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client, UInt32 op, Boolean *will, Boolean *inPlace);
static OSStatus BeginIO(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client, UInt32 op, UInt32 frames, const AudioServerPlugInIOCycleInfo *ci) { return 0; }
static OSStatus DoIO(AudioServerPlugInDriverRef d, AudioObjectID dev, AudioObjectID stream, UInt32 client, UInt32 op, UInt32 frames, const AudioServerPlugInIOCycleInfo *ci, void *main, void *secondary);
static OSStatus EndIO(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client, UInt32 op, UInt32 frames, const AudioServerPlugInIOCycleInfo *ci) { return 0; }

static AudioServerPlugInDriverInterface gInterface = {
  ._reserved = NULL, .QueryInterface = QueryInterface, .AddRef = AddRef, .Release = Release, .Initialize = Initialize,
  .CreateDevice = CreateDevice, .DestroyDevice = DestroyDevice, .AddDeviceClient = AddDeviceClient, .RemoveDeviceClient = RemoveDeviceClient,
  .PerformDeviceConfigurationChange = PerformConfigChange, .AbortDeviceConfigurationChange = AbortConfigChange,
  .HasProperty = HasProperty, .IsPropertySettable = IsPropertySettable, .GetPropertyDataSize = GetPropertyDataSize,
  .GetPropertyData = GetPropertyData, .SetPropertyData = SetPropertyData, .StartIO = StartIO, .StopIO = StopIO,
  .GetZeroTimeStamp = GetZeroTimeStamp, .WillDoIOOperation = WillDoIO, .BeginIOOperation = BeginIO, .DoIOOperation = DoIO,
  .EndIOOperation = EndIO,
};
static AudioServerPlugInDriverInterface *gInterfacePtr = &gInterface;
static AudioServerPlugInDriverRef gDriver = &gInterfacePtr;

/// The CFPlugIn factory named in Info.plist (CFPlugInFactories).
void *VibeSpaceMic_Create(CFAllocatorRef alloc, CFUUIDRef type) {
  (void)alloc;
  return CFEqual(type, kAudioServerPlugInTypeUUID) ? gDriver : NULL;
}

static HRESULT QueryInterface(void *drv, REFIID iid, LPVOID *out) {
  if (drv != gDriver || !out) return kAudioHardwareBadObjectError;
  CFUUIDRef u = CFUUIDCreateFromUUIDBytes(NULL, iid);
  HRESULT r = E_NOINTERFACE;
  if (CFEqual(u, IUnknownUUID) || CFEqual(u, kAudioServerPlugInDriverInterfaceUUID)) { pthread_mutex_lock(&gLock); gRefCount++; pthread_mutex_unlock(&gLock); *out = gDriver; r = S_OK; }
  CFRelease(u);
  return r;
}
static ULONG AddRef(void *drv) { pthread_mutex_lock(&gLock); ULONG r = ++gRefCount; pthread_mutex_unlock(&gLock); return r; }
static ULONG Release(void *drv) { pthread_mutex_lock(&gLock); ULONG r = gRefCount ? --gRefCount : 0; pthread_mutex_unlock(&gLock); return r; }

static OSStatus Initialize(AudioServerPlugInDriverRef drv, AudioServerPlugInHostRef host) {
  if (drv != gDriver) return kAudioHardwareBadObjectError;
  gHost = host;
  mach_timebase_info_data_t tb; mach_timebase_info(&tb);
  gTicksPerFrame = (1e9 * (Float64)tb.denom / (Float64)tb.numer) / kRate;
  memset(gRing, 0, sizeof gRing);
  return 0;
}

static AudioStreamBasicDescription Format(void) {
  AudioStreamBasicDescription f = { .mSampleRate = kRate, .mFormatID = kAudioFormatLinearPCM,
    .mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagsNativeEndian | kAudioFormatFlagIsPacked,
    .mBytesPerPacket = 4 * kChannels, .mFramesPerPacket = 1, .mBytesPerFrame = 4 * kChannels, .mChannelsPerFrame = kChannels, .mBitsPerChannel = 32 };
  return f;
}

/* ONE dispatcher for size + data: `out == NULL` asks the size only. Unknown ⇒ kAudioHardwareUnknownPropertyError. */
#define PUT(type, value) do { if (outSize) *outSize = sizeof(type); if (out) { if (inSize < sizeof(type)) return kAudioHardwareBadPropertySizeError; *(type *)out = (value); } return 0; } while (0)
#define PUT_IDS(arr, n) do { UInt32 _n = (n); if (out) { UInt32 _k = inSize / sizeof(AudioObjectID); if (_k < _n) _n = _k; memcpy(out, (arr), _n * sizeof(AudioObjectID)); } if (outSize) *outSize = _n * sizeof(AudioObjectID); return 0; } while (0)
static OSStatus Prop(AudioObjectID obj, const AudioObjectPropertyAddress *a, UInt32 qSize, const void *q, UInt32 inSize, UInt32 *outSize, void *out) {
  const AudioObjectID dev[1] = { kDevice }, both[2] = { kStreamIn, kStreamOut }, in1[1] = { kStreamIn }, out1[1] = { kStreamOut };
  const AudioObjectPropertySelector s = a->mSelector; const AudioObjectPropertyScope sc = a->mScope;
  if (obj == kPlugIn) {
    switch (s) {
      case kAudioObjectPropertyBaseClass: PUT(AudioClassID, kAudioObjectClassID);
      case kAudioObjectPropertyClass: PUT(AudioClassID, kAudioPlugInClassID);
      case kAudioObjectPropertyOwner: PUT(AudioObjectID, kAudioObjectUnknown);
      case kAudioObjectPropertyManufacturer: PUT(CFStringRef, CFSTR("VibeSpace"));
      case kAudioObjectPropertyOwnedObjects: case kAudioPlugInPropertyDeviceList: PUT_IDS(dev, 1);
      case kAudioPlugInPropertyTranslateUIDToDevice: {
        AudioObjectID r = kAudioObjectUnknown;
        if (q && qSize == sizeof(CFStringRef) && *(CFStringRef *)q && CFStringCompare(*(CFStringRef *)q, CFSTR(kDeviceUID), 0) == kCFCompareEqualTo) r = kDevice;
        PUT(AudioObjectID, r);
      }
      case kAudioPlugInPropertyResourceBundle: PUT(CFStringRef, CFSTR(""));
    }
    return kAudioHardwareUnknownPropertyError;
  }
  if (obj == kDevice) {
    switch (s) {
      case kAudioObjectPropertyBaseClass: PUT(AudioClassID, kAudioObjectClassID);
      case kAudioObjectPropertyClass: PUT(AudioClassID, kAudioDeviceClassID);
      case kAudioObjectPropertyOwner: PUT(AudioObjectID, kPlugIn);
      case kAudioObjectPropertyName: PUT(CFStringRef, CFSTR("VibeSpace Microphone"));
      case kAudioObjectPropertyManufacturer: PUT(CFStringRef, CFSTR("VibeSpace"));
      case kAudioDevicePropertyDeviceUID: PUT(CFStringRef, CFSTR(kDeviceUID));
      case kAudioDevicePropertyModelUID: PUT(CFStringRef, CFSTR(kModelUID));
      case kAudioDevicePropertyTransportType: PUT(UInt32, kAudioDeviceTransportTypeVirtual);
      case kAudioDevicePropertyRelatedDevices: PUT_IDS(dev, 1);
      case kAudioDevicePropertyClockDomain: PUT(UInt32, 0);
      case kAudioDevicePropertyDeviceIsAlive: PUT(UInt32, 1);
      case kAudioDevicePropertyDeviceIsRunning: { pthread_mutex_lock(&gLock); UInt32 r = gIOCount > 0; pthread_mutex_unlock(&gLock); PUT(UInt32, r); }
      // the INPUT side may become the default microphone; the output side (the agent's feed) never the default output
      case kAudioDevicePropertyDeviceCanBeDefaultDevice: PUT(UInt32, sc == kAudioObjectPropertyScopeInput ? 1 : 0);
      case kAudioDevicePropertyDeviceCanBeDefaultSystemDevice: PUT(UInt32, 0);
      case kAudioDevicePropertyLatency: PUT(UInt32, 0);
      case kAudioDevicePropertySafetyOffset: PUT(UInt32, 0);
      case kAudioObjectPropertyOwnedObjects: case kAudioDevicePropertyStreams:
        if (sc == kAudioObjectPropertyScopeInput) PUT_IDS(in1, 1);
        if (sc == kAudioObjectPropertyScopeOutput) PUT_IDS(out1, 1);
        PUT_IDS(both, 2);
      case kAudioObjectPropertyControlList: PUT_IDS(dev, 0);
      case kAudioDevicePropertyNominalSampleRate: PUT(Float64, kRate);
      case kAudioDevicePropertyAvailableNominalSampleRates: { AudioValueRange r = { kRate, kRate }; PUT(AudioValueRange, r); }
      case kAudioDevicePropertyIsHidden: PUT(UInt32, 0);
      case kAudioDevicePropertyZeroTimeStampPeriod: PUT(UInt32, kRingFrames);
      case kAudioDevicePropertyClockIsStable: PUT(UInt32, 1);
      case kAudioDevicePropertyPreferredChannelsForStereo: {
        if (outSize) *outSize = 2 * sizeof(UInt32);
        if (out) { if (inSize < 2 * sizeof(UInt32)) return kAudioHardwareBadPropertySizeError; ((UInt32 *)out)[0] = 1; ((UInt32 *)out)[1] = 2; }
        return 0;
      }
    }
    return kAudioHardwareUnknownPropertyError;
  }
  if (obj == kStreamIn || obj == kStreamOut) {
    const int isIn = obj == kStreamIn;
    switch (s) {
      case kAudioObjectPropertyBaseClass: PUT(AudioClassID, kAudioObjectClassID);
      case kAudioObjectPropertyClass: PUT(AudioClassID, kAudioStreamClassID);
      case kAudioObjectPropertyOwner: PUT(AudioObjectID, kDevice);
      case kAudioObjectPropertyOwnedObjects: PUT_IDS(dev, 0);
      case kAudioStreamPropertyIsActive: PUT(UInt32, 1);
      case kAudioStreamPropertyDirection: PUT(UInt32, isIn ? 1 : 0);
      case kAudioStreamPropertyTerminalType: PUT(UInt32, isIn ? kAudioStreamTerminalTypeMicrophone : kAudioStreamTerminalTypeSpeaker);
      case kAudioStreamPropertyStartingChannel: PUT(UInt32, 1);
      case kAudioStreamPropertyLatency: PUT(UInt32, 0);
      case kAudioStreamPropertyVirtualFormat: case kAudioStreamPropertyPhysicalFormat: PUT(AudioStreamBasicDescription, Format());
      case kAudioStreamPropertyAvailableVirtualFormats: case kAudioStreamPropertyAvailablePhysicalFormats: {
        AudioStreamRangedDescription r = { .mFormat = Format(), .mSampleRateRange = { kRate, kRate } };
        PUT(AudioStreamRangedDescription, r);
      }
    }
    return kAudioHardwareUnknownPropertyError;
  }
  return kAudioHardwareBadObjectError;
}

static Boolean HasProperty(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a) {
  UInt32 size = 0;
  return d == gDriver && a && Prop(obj, a, 0, NULL, 0, &size, NULL) == 0;
}
static OSStatus IsPropertySettable(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a, Boolean *out) {
  if (d != gDriver || !a || !out) return kAudioHardwareIllegalOperationError;
  UInt32 size = 0; OSStatus e = Prop(obj, a, 0, NULL, 0, &size, NULL);
  if (e) return e;
  *out = false; // one fixed format, no controls
  return 0;
}
static OSStatus GetPropertyDataSize(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a, UInt32 qSize, const void *q, UInt32 *outSize) {
  if (d != gDriver || !a || !outSize) return kAudioHardwareIllegalOperationError;
  return Prop(obj, a, qSize, q, 0, outSize, NULL);
}
static OSStatus GetPropertyData(AudioServerPlugInDriverRef d, AudioObjectID obj, pid_t pid, const AudioObjectPropertyAddress *a, UInt32 qSize, const void *q, UInt32 inSize, UInt32 *outSize, void *out) {
  if (d != gDriver || !a || !outSize || !out) return kAudioHardwareIllegalOperationError;
  return Prop(obj, a, qSize, q, inSize, outSize, out);
}

static OSStatus StartIO(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client) {
  if (d != gDriver || dev != kDevice) return kAudioHardwareBadObjectError;
  pthread_mutex_lock(&gLock);
  if (gIOCount++ == 0) { gStamps = 0; gAnchor = mach_absolute_time(); memset(gRing, 0, sizeof gRing); }
  pthread_mutex_unlock(&gLock);
  return 0;
}
static OSStatus StopIO(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client) {
  if (d != gDriver || dev != kDevice) return kAudioHardwareBadObjectError;
  pthread_mutex_lock(&gLock); if (gIOCount) gIOCount--; pthread_mutex_unlock(&gLock);
  return 0;
}
/* The device clock = the host clock at 48 kHz (NullAudio's scheme): one zero time stamp per ring of frames. */
static OSStatus GetZeroTimeStamp(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client, Float64 *outSample, UInt64 *outHost, UInt64 *outSeed) {
  if (d != gDriver || dev != kDevice) return kAudioHardwareBadObjectError;
  pthread_mutex_lock(&gLock);
  const Float64 ticksPerRing = gTicksPerFrame * (Float64)kRingFrames;
  const UInt64 now = mach_absolute_time();
  if (gAnchor + (UInt64)((Float64)(gStamps + 1) * ticksPerRing) <= now) gStamps++;
  *outSample = (Float64)(gStamps * kRingFrames);
  *outHost = gAnchor + (UInt64)((Float64)gStamps * ticksPerRing);
  *outSeed = 1;
  pthread_mutex_unlock(&gLock);
  return 0;
}
static OSStatus WillDoIO(AudioServerPlugInDriverRef d, AudioObjectID dev, UInt32 client, UInt32 op, Boolean *will, Boolean *inPlace) {
  if (d != gDriver || dev != kDevice) return kAudioHardwareBadObjectError;
  const Boolean w = op == kAudioServerPlugInIOOperationReadInput || op == kAudioServerPlugInIOOperationWriteMix;
  if (will) *will = w;
  if (inPlace) *inPlace = true;
  return 0;
}
/* The loopback: what the output side mixes at sample time T is what the input side reads at T (then cleared, so a feed
   that stops is silence, never a repeating ring). */
static OSStatus DoIO(AudioServerPlugInDriverRef d, AudioObjectID dev, AudioObjectID stream, UInt32 client, UInt32 op, UInt32 frames, const AudioServerPlugInIOCycleInfo *ci, void *main, void *secondary) {
  if (d != gDriver || dev != kDevice || !ci || !main) return kAudioHardwareBadObjectError;
  float *buf = (float *)main;
  if (op == kAudioServerPlugInIOOperationWriteMix && stream == kStreamOut) {
    UInt64 pos = (UInt64)ci->mOutputTime.mSampleTime % kRingFrames;
    for (UInt32 i = 0; i < frames; i++, pos = (pos + 1) % kRingFrames) for (UInt32 c = 0; c < kChannels; c++) gRing[pos * kChannels + c] = buf[i * kChannels + c]; // the HAL already mixed its clients
  } else if (op == kAudioServerPlugInIOOperationReadInput && stream == kStreamIn) {
    UInt64 pos = (UInt64)ci->mInputTime.mSampleTime % kRingFrames;
    for (UInt32 i = 0; i < frames; i++, pos = (pos + 1) % kRingFrames) for (UInt32 c = 0; c < kChannels; c++) { buf[i * kChannels + c] = gRing[pos * kChannels + c]; gRing[pos * kChannels + c] = 0; }
  }
  return 0;
}
