// lane apple-signing: what `codesign -dv --verbose=4 <file>` prints (its stderr) for the four signatures a pushed Mac
// screen helper can carry — the fixtures of scripts/test-mac-helper-identity.mjs and the fake codesign of
// scripts/test-stream-mac.mjs (mac-fakes.mjs writeFakeCodesign). Shaped after real codesign output on macOS 15/26 (the
// key order, `Signature=adhoc`, `TeamIdentifier=not set`, the three Authority lines of a Developer ID chain); the design's
// §6.8 asks the owner's Mac for verbatim captures to replace these — the parser reads keys, not positions.
//   TEAM / OTHER_TEAM are invented Team IDs; the names are placeholders (no real person).
export const TEAM = 'VSTEAM0001';
export const OTHER_TEAM = 'ZZOTHER002';
export const IDENTIFIER = 'com.problemfactory.vibespace.screen';

const common = (file, cdhash) => `Executable=${file}
Format=Mach-O universal (x86_64 arm64)
Hash type=sha256 size=32
CandidateCDHash sha256=${cdhash}
CandidateCDHashFull sha256=${cdhash}0123456789abcdef0123456789abcdef
Hash choices=sha256
CMSDigest=${cdhash}0123456789abcdef0123456789abcdef
CMSDigestType=2
Executable Segment base=0
Executable Segment limit=65536
Executable Segment flags=0x1
Page size=4096
CDHash=${cdhash}`;

/** Today's helper: `codesign -s -` keeps the linker's per-build identifier. */
export const adhoc = ({ file = '/Users/u/.vibespace/helpers/vibespace-screen', cdhash = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', identifier = 'vibespace-screen-55554944b8e86b2b7f84a53f7fb2e2a2f5e9d6e2' } = {}) => `Executable=${file}
Identifier=${identifier}
${common(file, cdhash).split('\n').slice(1).join('\n')}
CodeDirectory v=20400 size=1842 flags=0x2(adhoc) hashes=52+5 location=embedded
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set
Sealed Resources=none
Internal requirements count=1 size=96
`;

/** A Developer ID Application signature with the hardened runtime and a secure timestamp. */
export const developerId = ({ file = '/Users/u/.vibespace/helpers/vibespace-screen-vs-11f32156ba0a', cdhash = '0fedcba987654321fedcba987654321fedcba987', team = TEAM, name = 'Helper Publisher', identifier = IDENTIFIER, notarized = false, runtime = '26.0.0' } = {}) => `Executable=${file}
Identifier=${identifier}
Format=Mach-O universal (x86_64 arm64)
CodeDirectory v=20500 size=1930 flags=0x10000(runtime) hashes=52+7 location=embedded
VersionPlatform=1
VersionMin=983040
VersionSDK=1769472
Hash type=sha256 size=32
CandidateCDHash sha256=${cdhash}
CandidateCDHashFull sha256=${cdhash}0123456789abcdef0123456789abcdef
Hash choices=sha256
CMSDigest=${cdhash}0123456789abcdef0123456789abcdef
CMSDigestType=2
Executable Segment base=0
Executable Segment limit=65536
Executable Segment flags=0x1
Page size=4096
Launch Constraints:
	None
CDHash=${cdhash}
Signature size=9068
Authority=Developer ID Application: ${name} (${team})
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=26 Oct 2026 at 15:04:11
${notarized ? 'Notarization Ticket=stapled\n' : ''}Info.plist=not bound
TeamIdentifier=${team}
Runtime Version=${runtime}
Sealed Resources=none
Internal requirements count=1 size=216
`;

/** An Apple Development (not Distribution / Developer ID) signature — Xcode's own debug builds. */
export const appleDevelopment = ({ file = '/Users/u/x', cdhash = '1111111111222222222233333333334444444444', team = TEAM, identifier = IDENTIFIER } = {}) => `Executable=${file}
Identifier=${identifier}
Format=Mach-O universal (x86_64 arm64)
CodeDirectory v=20400 size=1842 flags=0x0(none) hashes=52+5 location=embedded
Hash type=sha256 size=32
CDHash=${cdhash}
Signature size=4785
Authority=Apple Development: placeholder@example.invalid (ABCDEF1234)
Authority=Apple Worldwide Developer Relations Certification Authority
Authority=Apple Root CA
Signed Time=26 Oct 2026 at 15:04:11
Info.plist=not bound
TeamIdentifier=${team}
Sealed Resources=none
Internal requirements count=1 size=180
`;

/** No signature at all (`codesign -dv` and `--verify` both say this, exit 1). */
export const unsigned = ({ file = '/Users/u/x' } = {}) => `${file}: code object is not signed at all\n`;
