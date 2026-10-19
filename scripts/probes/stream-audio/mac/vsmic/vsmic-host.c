// vsmic-host.c — VibeSpace lane stream-audio-probe (probe only): load-tests the VibeSpaceMic AudioServerPlugIn WITHOUT
// installing it. It does what coreaudiod does at the API level, inside this ordinary process: CFPlugIn finds the factory
// for the AudioServerPlugIn type in the bundle's Info.plist, the instance answers QueryInterface for the driver interface,
// Initialize gets a host stub; then the property walk the HAL makes to publish a device, and the IO cycle (StartIO,
// GetZeroTimeStamp, WriteMix of a 1 kHz tone on the output stream, ReadInput on the input stream, StopIO) on the HAL's
// clock arithmetic. Nothing touches coreaudiod, /Library or any real device.
//
// Build: clang -O2 -Wall -o vsmic-host vsmic-host.c -framework CoreAudio -framework CoreFoundation
// Run:   ./vsmic-host VibeSpaceMic.driver
#include <CoreAudio/AudioServerPlugIn.h>
#include <CoreFoundation/CoreFoundation.h>
#include <CoreFoundation/CFPlugInCOM.h>
#include <mach/mach_time.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static OSStatus HostPropertiesChanged(AudioServerPlugInHostRef h, AudioObjectID o, UInt32 n, const AudioObjectPropertyAddress *a) { return 0; }
static OSStatus HostCopyFromStorage(AudioServerPlugInHostRef h, CFStringRef k, CFPropertyListRef *out) { if (out) *out = NULL; return 0; }
static OSStatus HostWriteToStorage(AudioServerPlugInHostRef h, CFStringRef k, CFPropertyListRef d) { return 0; }
static OSStatus HostDeleteFromStorage(AudioServerPlugInHostRef h, CFStringRef k) { return 0; }
static OSStatus HostRequestConfigChange(AudioServerPlugInHostRef h, AudioObjectID dev, UInt64 action, void *info) { return 0; }
static const AudioServerPlugInHostInterface gHost = { HostPropertiesChanged, HostCopyFromStorage, HostWriteToStorage, HostDeleteFromStorage, HostRequestConfigChange };

static int fails = 0;
#define CHECK(cond, ...) do { if (cond) { printf("  ok   "); } else { printf("  FAIL "); fails++; } printf(__VA_ARGS__); printf("\n"); } while (0)

static char *str(CFStringRef s) { static char b[256]; b[0] = 0; if (s) CFStringGetCString(s, b, sizeof b, kCFStringEncodingUTF8); return b; }

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: vsmic-host <VibeSpaceMic.driver>\n"); return 2; }
  CFStringRef path = CFStringCreateWithCString(NULL, argv[1], kCFStringEncodingUTF8);
  CFURLRef url = CFURLCreateWithFileSystemPath(NULL, path, kCFURLPOSIXPathStyle, true);
  char plist[1024]; snprintf(plist, sizeof plist, "%s/Contents/Info.plist", argv[1]);
  printf("  path %s · url %s · plist readable %d\n", argv[1], url ? str(CFURLGetString(url)) : "(null)", access(plist, R_OK) == 0);
  CFPlugInRef plugin = CFPlugInCreate(NULL, url);
  if (!plugin) { // diagnose: is it a bundle, is the plist read, does the executable load?
    CFBundleRef b = CFBundleCreate(NULL, url);
    CFDictionaryRef info = b ? CFBundleGetInfoDictionary(b) : NULL;
    CFErrorRef err = NULL; Boolean loaded = b ? CFBundleLoadExecutableAndReturnError(b, &err) : false;
    printf("  diag bundle=%p info=%p factories=%p loaded=%d err=%s\n", (void *)b, (void *)info, info ? CFDictionaryGetValue(info, CFSTR("CFPlugInFactories")) : NULL, loaded, err ? str(CFErrorCopyDescription(err)) : "-");
    plugin = b ? CFBundleGetPlugIn(b) : NULL;
  }
  CHECK(plugin != NULL, "CFPlugInCreate on the bundle");
  if (!plugin) return 1;
  CFArrayRef factories = CFPlugInFindFactoriesForPlugInTypeInPlugIn(kAudioServerPlugInTypeUUID, plugin);
  CHECK(factories && CFArrayGetCount(factories) == 1, "Info.plist names one factory for the AudioServerPlugIn type");
  if (!factories || !CFArrayGetCount(factories)) return 1;
  IUnknownVTbl **unk = (IUnknownVTbl **)CFPlugInInstanceCreate(NULL, (CFUUIDRef)CFArrayGetValueAtIndex(factories, 0), kAudioServerPlugInTypeUUID);
  CHECK(unk != NULL, "the factory made an instance");
  AudioServerPlugInDriverRef drv = NULL;
  HRESULT qr = (*unk)->QueryInterface(unk, CFUUIDGetUUIDBytes(kAudioServerPlugInDriverInterfaceUUID), (LPVOID *)&drv);
  CHECK(qr == S_OK && drv, "QueryInterface → the driver interface");
  (*drv)->Release(drv);
  CHECK((*drv)->Initialize(drv, &gHost) == 0, "Initialize(host)");

  AudioObjectPropertyAddress a = { 0, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain };
  UInt32 size = 0; AudioObjectID ids[8]; CFStringRef s = NULL; UInt32 u = 0; Float64 rate = 0;
  a.mSelector = kAudioPlugInPropertyDeviceList; size = sizeof ids;
  CHECK((*drv)->GetPropertyData(drv, kAudioObjectPlugInObject, 0, &a, 0, NULL, size, &size, ids) == 0 && size == 4 && ids[0] == 2, "plug-in device list = [2]");
  CFStringRef uid = CFSTR("VibeSpaceMic_UID"); AudioObjectID dev = 0; a.mSelector = kAudioPlugInPropertyTranslateUIDToDevice; size = sizeof dev;
  CHECK((*drv)->GetPropertyData(drv, kAudioObjectPlugInObject, 0, &a, sizeof uid, &uid, size, &size, &dev) == 0 && dev == 2, "UID → device 2");
  a.mSelector = kAudioObjectPropertyName; size = sizeof s; (*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, &s);
  CHECK(s && !strcmp(str(s), "VibeSpace Microphone"), "device name \"%s\"", str(s));
  a.mSelector = kAudioDevicePropertyTransportType; size = 4; (*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, &u);
  CHECK(u == kAudioDeviceTransportTypeVirtual, "transport = virtual");
  a.mSelector = kAudioDevicePropertyNominalSampleRate; size = sizeof rate; (*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, &rate);
  CHECK(rate == 48000, "nominal rate %.0f", rate);
  a.mSelector = kAudioDevicePropertyStreams; a.mScope = kAudioObjectPropertyScopeInput; size = sizeof ids;
  CHECK((*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, ids) == 0 && size == 4 && ids[0] == 3, "input streams = [3]");
  a.mScope = kAudioObjectPropertyScopeOutput; size = sizeof ids;
  CHECK((*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, ids) == 0 && size == 4 && ids[0] == 4, "output streams = [4]");
  a.mSelector = kAudioDevicePropertyDeviceCanBeDefaultDevice; a.mScope = kAudioObjectPropertyScopeInput; size = 4; (*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, &u);
  CHECK(u == 1, "the input side can be the default microphone");
  a.mScope = kAudioObjectPropertyScopeOutput; size = 4; (*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, &u);
  CHECK(u == 0, "the output side (the agent's feed) never the default output");
  a.mScope = kAudioObjectPropertyScopeGlobal; a.mSelector = kAudioStreamPropertyTerminalType; size = 4; (*drv)->GetPropertyData(drv, 3, 0, &a, 0, NULL, size, &size, &u);
  CHECK(u == kAudioStreamTerminalTypeMicrophone, "stream 3 terminal = microphone");
  AudioStreamBasicDescription f; a.mSelector = kAudioStreamPropertyVirtualFormat; size = sizeof f; (*drv)->GetPropertyData(drv, 3, 0, &a, 0, NULL, size, &size, &f);
  CHECK(f.mSampleRate == 48000 && f.mChannelsPerFrame == 2 && (f.mFormatFlags & kAudioFormatFlagIsFloat) && f.mBitsPerChannel == 32, "stream format 48 kHz float32 x2");
  // the property walk the HAL makes to publish a device: every one answered
  const AudioObjectPropertySelector devSel[] = { kAudioObjectPropertyBaseClass, kAudioObjectPropertyClass, kAudioObjectPropertyOwner, kAudioObjectPropertyName,
    kAudioObjectPropertyManufacturer, kAudioObjectPropertyOwnedObjects, kAudioDevicePropertyDeviceUID, kAudioDevicePropertyModelUID, kAudioDevicePropertyTransportType,
    kAudioDevicePropertyRelatedDevices, kAudioDevicePropertyClockDomain, kAudioDevicePropertyDeviceIsAlive, kAudioDevicePropertyDeviceIsRunning,
    kAudioDevicePropertyDeviceCanBeDefaultDevice, kAudioDevicePropertyDeviceCanBeDefaultSystemDevice, kAudioDevicePropertyLatency, kAudioDevicePropertyStreams,
    kAudioObjectPropertyControlList, kAudioDevicePropertySafetyOffset, kAudioDevicePropertyNominalSampleRate, kAudioDevicePropertyAvailableNominalSampleRates,
    kAudioDevicePropertyIsHidden, kAudioDevicePropertyZeroTimeStampPeriod, kAudioDevicePropertyPreferredChannelsForStereo };
  int missing = 0; for (size_t i = 0; i < sizeof devSel / sizeof *devSel; i++) { a.mSelector = devSel[i]; if (!(*drv)->HasProperty(drv, 2, 0, &a)) missing++; }
  CHECK(missing == 0, "the device answers all %zu properties of the HAL's walk (%d missing)", sizeof devSel / sizeof *devSel, missing);

  // THE IO CYCLE on the HAL's arithmetic: 512-frame cycles; the output side mixes 2 cycles AHEAD of now, the input side
  // reads 1 cycle BEHIND (a real HAL's safety offsets) — the tone written at output time T must come back at input time T
  const UInt32 N = 512; float buf[512 * 2];
  CHECK((*drv)->StartIO(drv, 2, 1) == 0, "StartIO");
  Float64 z0 = 0, z1 = 0; UInt64 h0 = 0, h1 = 0, seed = 0;
  (*drv)->GetZeroTimeStamp(drv, 2, 1, &z0, &h0, &seed);
  mach_timebase_info_data_t tb; mach_timebase_info(&tb);
  usleep(400000); // > one 16384-frame ring at 48 kHz (341 ms): the zero time stamp must move one period
  (*drv)->GetZeroTimeStamp(drv, 2, 1, &z1, &h1, &seed);
  const double ringMs = (double)(h1 - h0) * tb.numer / tb.denom / 1e6;
  CHECK(z1 - z0 == 16384 && fabs(ringMs - 341.33) < 0.5, "zero time stamp: +%.0f frames over %.2f ms of host time (48 kHz)", z1 - z0, ringMs);
  const UInt32 toneStart = 5000, toneLen = 9600; long firstHeard = -1; double peak = 0; int cycles = 60;
  for (int c = 0; c < cycles; c++) {
    AudioServerPlugInIOCycleInfo ci; memset(&ci, 0, sizeof ci);
    ci.mIOCycleCounter = c; ci.mNominalIOBufferFrameSize = N;
    ci.mOutputTime.mSampleTime = (Float64)((c + 2) * N); ci.mOutputTime.mFlags = kAudioTimeStampSampleTimeValid;
    ci.mInputTime.mSampleTime = (Float64)((c - 1) * N); ci.mInputTime.mFlags = kAudioTimeStampSampleTimeValid;
    Boolean will = 0, inPlace = 0;
    (*drv)->WillDoIOOperation(drv, 2, 1, kAudioServerPlugInIOOperationWriteMix, &will, &inPlace);
    if (c == 0) CHECK(will && inPlace, "WillDoIOOperation(WriteMix) = yes, in place");
    for (UInt32 i = 0; i < N; i++) {
      const long t = (long)ci.mOutputTime.mSampleTime + i - toneStart;
      const float v = (t >= 0 && t < toneLen) ? (float)(0.1 * sin(2 * M_PI * 1000.0 * t / 48000.0)) : 0.f;
      buf[i * 2] = v; buf[i * 2 + 1] = v;
    }
    (*drv)->BeginIOOperation(drv, 2, 1, kAudioServerPlugInIOOperationWriteMix, N, &ci);
    (*drv)->DoIOOperation(drv, 2, 4, 1, kAudioServerPlugInIOOperationWriteMix, N, &ci, buf, NULL);
    (*drv)->EndIOOperation(drv, 2, 1, kAudioServerPlugInIOOperationWriteMix, N, &ci);
    if (ci.mInputTime.mSampleTime < 0) continue;
    memset(buf, 0, sizeof buf);
    (*drv)->DoIOOperation(drv, 2, 3, 1, kAudioServerPlugInIOOperationReadInput, N, &ci, buf, NULL);
    for (UInt32 i = 0; i < N; i++) { const double x = fabs(buf[i * 2]); if (x > peak) peak = x; if (firstHeard < 0 && x > 0.001) firstHeard = (long)ci.mInputTime.mSampleTime + i; }
  }
  CHECK(firstHeard >= (long)toneStart && firstHeard <= (long)toneStart + 2 && fabs(peak - 0.1) < 0.001,
        "loopback: the tone written at output sample %u is read at input sample %ld (peak %.3f) — 0 frames of added delay", toneStart, firstHeard, peak);
  // read again where the tone was: the ring was cleared on read (a feed that stops is silence, not a repeat)
  { AudioServerPlugInIOCycleInfo ci; memset(&ci, 0, sizeof ci); const Float64 X = 40000; double p1 = 0, p2 = 0;
    for (UInt32 i = 0; i < N; i++) { buf[i * 2] = buf[i * 2 + 1] = 0.05f; }
    ci.mOutputTime.mSampleTime = X; (*drv)->DoIOOperation(drv, 2, 4, 1, kAudioServerPlugInIOOperationWriteMix, N, &ci, buf, NULL);
    ci.mInputTime.mSampleTime = X; memset(buf, 0, sizeof buf); (*drv)->DoIOOperation(drv, 2, 3, 1, kAudioServerPlugInIOOperationReadInput, N, &ci, buf, NULL);
    for (UInt32 i = 0; i < N; i++) if (fabs(buf[i * 2]) > p1) p1 = fabs(buf[i * 2]);
    memset(buf, 0, sizeof buf); (*drv)->DoIOOperation(drv, 2, 3, 1, kAudioServerPlugInIOOperationReadInput, N, &ci, buf, NULL);
    for (UInt32 i = 0; i < N; i++) if (fabs(buf[i * 2]) > p2) p2 = fabs(buf[i * 2]);
    CHECK(fabs(p1 - 0.05) < 1e-6 && p2 == 0, "read once = the feed (%.3f), read again = silence (%.3f): cleared on read, a stopped feed never repeats", p1, p2); }
  a.mSelector = kAudioDevicePropertyDeviceIsRunning; a.mScope = kAudioObjectPropertyScopeGlobal; size = 4; (*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, &u);
  CHECK(u == 1, "running while IO is started");
  CHECK((*drv)->StopIO(drv, 2, 1) == 0, "StopIO");
  size = 4; (*drv)->GetPropertyData(drv, 2, 0, &a, 0, NULL, size, &size, &u);
  CHECK(u == 0, "not running after StopIO");
  printf("%s: %d failed\n", fails ? "RED" : "GREEN", fails);
  return fails ? 1 : 0;
}
