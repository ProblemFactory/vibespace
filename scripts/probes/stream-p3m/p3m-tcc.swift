// lane stream-p3m-probe (P3m-0) — the probe's ONE stable TCC client. A child of the device agent is attributed to the
// agent's node (tccd: responsible_path=/opt/homebrew/Cellar/node/<v>/bin/node); this launcher re-spawns ITSELF with
// responsibility disclaimed, then runs the target as an ordinary child — so every helper under it is attributed to
// p3m-tcc, and the owner grants Screen Recording / Accessibility to this one binary while sck-probe / p3m-aux keep
// being rebuilt (an ad-hoc grant is keyed to the binary's identity: never rebuild THIS file after a grant).
//   swiftc -O -o p3m-tcc p3m-tcc.swift && codesign -s - -f p3m-tcc
//   ~/vs-probe/p3m/p3m-tcc /abs/path/to/helper args…
import Foundation

typealias Disclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
func run(_ argv: [String], disclaim: Bool) -> Int32 {
  var attr: posix_spawnattr_t? = nil
  posix_spawnattr_init(&attr)
  if disclaim {
    guard let s = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim") else { fputs("p3m-tcc: no responsibility_spawnattrs_setdisclaim\n", stderr); return 98 }
    _ = unsafeBitCast(s, to: Disclaim.self)(&attr, 1)
  }
  var pid: pid_t = 0
  let c = argv.map { strdup($0) } + [nil]
  let r = posix_spawn(&pid, argv[0], nil, &attr, c, environ)
  guard r == 0 else { fputs("p3m-tcc: spawn \(argv[0]) failed \(r)\n", stderr); return 127 }
  var st: Int32 = 0
  waitpid(pid, &st, 0)
  return (st & 0x7f) == 0 ? (st >> 8) & 0xff : 128 + (st & 0x7f)
}
let A = CommandLine.arguments
guard A.count > 1 else { fputs("usage: p3m-tcc <abs path> [args…]\n", stderr); exit(2) }
if A[1] == "--inner" { exit(run(Array(A.dropFirst(2)), disclaim: false)) }
exit(run([Bundle.main.executablePath!, "--inner"] + A.dropFirst(), disclaim: true))
