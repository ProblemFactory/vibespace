// lane apple-signing: what codesign prints — the fixtures of scripts/test-mac-helper-identity.mjs and the fake codesign of
// scripts/test-stream-mac.mjs (mac-fakes.mjs writeFakeCodesign). ROUND 2 (2026-10-26): the captures below are VERBATIM from the
// owner's Mac (主开发 ran them over the exit road; the home directory scrubbed to /Users/me — the public-repo law; every hash kept):
//   HELPER_DV / HELPER_DR   the ad-hoc helper at the fixed path — `codesign -dv --verbose=4` (stderr) and `codesign -dr -`
//   CHROME_DV / CHROME_DR   a Developer ID, notarized app (Google Chrome under /Applications) — the `-dv --verbose=4` lines that
//                           name the signer (the capture kept those; Google's Team ID is public on every Mac) and its requirement
//   CHROME_ASSESS           `spctl --assess -vv` of the same app (source=Notarized Developer ID)
//   IDENTITIES_NONE         `security find-identity -v -p codesigning` before enrollment (0 valid identities)
// The generators SUBSTITUTE into those shapes (a file, a cdhash, a team, an identifier) — with no argument they ARE the capture:
//   adhoc() over HELPER_DV · adhocDr() over HELPER_DR · designated() over CHROME_DR (one identifier, no `or` group) ·
//   developerId() = the helper's Mach-O lines + Chrome's signer lines; its `flags=0x10000(runtime)` / `Runtime Version` /
//   `Signature size` / `Internal requirements count=1` lines are the documented hardened-runtime ones (no signed helper exists yet)
//   appleDevelopment() and unsigned() stay documented shapes (nothing on the Mac to capture them from).
// TEAM / OTHER_TEAM are invented Team IDs and the names are placeholders (no real person); CHROME_TEAM is Google's public one.
// The parsers read keys, not positions.
export const TEAM = 'VSTEAM0001';
export const OTHER_TEAM = 'ZZOTHER002';
export const IDENTIFIER = 'com.problemfactory.vibespace.screen';
export const CHROME_TEAM = 'EQHXZ8M8AV';
export const CHROME_IDENTIFIER = 'com.google.Chrome';
export const CHROME_FILE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const HELPER_FILE = '/Users/me/.vibespace/helpers/vibespace-screen';
export const HELPER_ADHOC_IDENTIFIER = 'vibespace-screen-55554944365e84bfc3e035af92455643611f3976'; // the linker's: the name + "UUID" + a hash
export const HELPER_CDHASH = 'd18ecc296a649af2546060b5a4c68fcf04c1fcc4';
export const HELPER_CDHASHES = Object.freeze(['d18ecc296a649af2546060b5a4c68fcf04c1fcc4', 'cddfb0e2117db0e6c05d6b9803c5c3e1318505b4']); // one per slice (x86_64, arm64)

export const HELPER_DV = `Executable=/Users/me/.vibespace/helpers/vibespace-screen
Identifier=vibespace-screen-55554944365e84bfc3e035af92455643611f3976
Format=Mach-O universal (x86_64 arm64)
CodeDirectory v=20400 size=786 flags=0x2(adhoc) hashes=18+2 location=embedded
VersionPlatform=1
VersionMin=983040
VersionSDK=1705216
Hash type=sha256 size=32
CandidateCDHash sha256=d18ecc296a649af2546060b5a4c68fcf04c1fcc4
CandidateCDHashFull sha256=d18ecc296a649af2546060b5a4c68fcf04c1fcc4e0ef17bc564b898dc3dfaec7
Hash choices=sha256
CMSDigest=d18ecc296a649af2546060b5a4c68fcf04c1fcc4e0ef17bc564b898dc3dfaec7
CMSDigestType=2
Executable Segment base=0
Executable Segment limit=147456
Executable Segment flags=0x1
Page size=16384
CDHash=d18ecc296a649af2546060b5a4c68fcf04c1fcc4
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set
Sealed Resources=none
Internal requirements count=0 size=12
Total signatures=1
Chosen signature=1
`;
/** `codesign -dr -`: the Executable line (stderr), then the requirement (stdout) — `# designated =>` = codesign COMPUTED it
 *  (no requirement is embedded: Internal requirements count=0); one cdhash per slice of the universal binary. */
export const HELPER_DR = `Executable=/Users/me/.vibespace/helpers/vibespace-screen
# designated => cdhash H"d18ecc296a649af2546060b5a4c68fcf04c1fcc4" or cdhash H"cddfb0e2117db0e6c05d6b9803c5c3e1318505b4"
`;
export const CHROME_DV = `Identifier=com.google.Chrome
Format=app bundle with Mach-O universal (x86_64 arm64)
Authority=Developer ID Application: Google LLC (EQHXZ8M8AV)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=Oct 19, 2026 at 7:23:41 PM
TeamIdentifier=EQHXZ8M8AV
`;
export const CHROME_DR = `Executable=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
designated => (identifier "com.google.Chrome" or identifier "com.google.Chrome.beta" or identifier "com.google.Chrome.dev" or identifier "com.google.Chrome.canary") and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = EQHXZ8M8AV
`;
export const CHROME_ASSESS = `/Applications/Google Chrome.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: Google LLC (EQHXZ8M8AV)
`;
export const IDENTITIES_NONE = `     0 valid identities found
`;

const sub = (text, pairs) => pairs.reduce((t, [from, to]) => t.split(from).join(to), text);

/** Today's helper (ad-hoc): the capture with the file / identifier / cdhash substituted (the full-length digests follow the cdhash). */
export const adhoc = ({ file = HELPER_FILE, cdhash = HELPER_CDHASH, identifier = HELPER_ADHOC_IDENTIFIER } = {}) =>
  sub(HELPER_DV, [[HELPER_FILE, file], [HELPER_ADHOC_IDENTIFIER, identifier], [HELPER_CDHASH, cdhash]]);
/** Its `codesign -dr -` (one cdhash per slice). */
export const adhocDr = ({ file = HELPER_FILE, cdhashes = HELPER_CDHASHES } = {}) =>
  sub(HELPER_DR, [[HELPER_FILE, file], [HELPER_CDHASHES.map((h) => `cdhash H"${h}"`).join(' or '), cdhashes.map((h) => `cdhash H"${h}"`).join(' or ')]]);

/** A Developer ID Application signature of a bare helper: the helper's Mach-O lines (hardened-runtime flags) + Chrome's signer lines. */
export const developerId = ({ file = '/Users/me/.vibespace/helpers/vibespace-screen-vs-11f32156ba0a', cdhash = '0fedcba987654321fedcba987654321fedcba987', team = TEAM, name = 'Helper Publisher', identifier = IDENTIFIER, runtime = '26.0.0' } = {}) => {
  const macho = sub(HELPER_DV, [[HELPER_FILE, file], [HELPER_ADHOC_IDENTIFIER, identifier], [HELPER_CDHASH, cdhash], ['CodeDirectory v=20400 size=786 flags=0x2(adhoc)', 'CodeDirectory v=20500 size=1930 flags=0x10000(runtime)'], ['Internal requirements count=0 size=12', 'Internal requirements count=1 size=216']]).split('\n');
  const signer = sub(CHROME_DV, [['Google LLC', name], [CHROME_TEAM, team]]).split('\n').filter((l) => /^(Authority|Timestamp)=/.test(l));
  const head = macho.slice(0, macho.findIndex((l) => l.startsWith('CDHash=')) + 1), tail = macho.slice(macho.indexOf('Sealed Resources=none'));
  return [...head, 'Signature size=9068', ...signer, 'Info.plist=not bound', `TeamIdentifier=${team}`, `Runtime Version=${runtime}`, ...tail].join('\n');
};

/** Chrome's designated requirement with ONE identifier (ours — no `or` group) and a team substituted: field for field what
 *  codesign writes for a Developer ID signature, and what src/mac-helper-identity.js designatedRequirement must equal. */
export const designated = ({ identifier = IDENTIFIER, team = TEAM, file = HELPER_FILE } = {}) =>
  sub(CHROME_DR, [[CHROME_FILE, file], ['(identifier "com.google.Chrome" or identifier "com.google.Chrome.beta" or identifier "com.google.Chrome.dev" or identifier "com.google.Chrome.canary")', `identifier "${identifier}"`], [CHROME_TEAM, team]]);

/** `codesign -dr -` writes the Executable line to stderr and the requirement to stdout — the fakes answer the same way. */
export const drSplit = (text) => {
  const ls = String(text).split('\n').filter(Boolean);
  return { stderr: ls.filter((l) => l.startsWith('Executable=')).map((l) => l + '\n').join(''), stdout: ls.filter((l) => !l.startsWith('Executable=')).map((l) => l + '\n').join('') };
};

/** An Apple Development (not Distribution / Developer ID) signature — Xcode's own debug builds (a documented shape, not captured). */
export const appleDevelopment = ({ file = '/Users/me/x', cdhash = '1111111111222222222233333333334444444444', team = TEAM, identifier = IDENTIFIER } = {}) => `Executable=${file}
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

/** No signature at all (`codesign -dv` and `--verify` both say this, exit 1 — the documented message). */
export const unsigned = ({ file = '/Users/me/x' } = {}) => `${file}: code object is not signed at all\n`;
