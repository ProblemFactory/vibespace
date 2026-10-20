# mic-install.ps1 - VibeSpace lane stream-mic-wheel-probe (probe). Runs ONLY after the owner said yes: it is the owner's
# install, asked through Windows' own UAC prompt on this machine's screen. The shape is the product's TightVNC one-time setup
# (src/machine-desktop-model.js tightvncInstallPlan): an UNELEVATED starter asks Windows for an administrator PowerShell
# (Start-Process -Verb RunAs -Wait) whose script is passed encoded, so what the owner approves is exactly what runs:
#   1. a fresh directory only Administrators/SYSTEM can write (no other process of the user can swap the download);
#   2. the official VB-CABLE pack downloaded from the vendor's own site, its SHA-256 checked against the pin;
#   3. VBCABLE_Setup_x64.exe checked (SHA-256 + Authenticode signer), then run silently: -i (install) -h (hidden);
#   4. the cable's devices read back, the download removed, NO reboot (the window says one is owed).
# The starter waits for the elevated window and writes install-start.json; the elevated window writes install-result.json.
#   powershell -NoProfile -ExecutionPolicy Bypass -File mic-install.ps1          (detached: Start-Process ... -WindowStyle Hidden)
# Pure ASCII (Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page).
$ErrorActionPreference = 'Stop'
$mic = Join-Path $env:USERPROFILE 'vs-probe\mic'
$url = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip'
$zipSha = 'B950E39F01AF1D04EA623C8F6D8EB9B6EA5C477C637295FABF20631C85116BFB'
$exeSha = '734C35DFA6D98F48782A451633CEB471166EC70D60482FD89A1123D0EE3C4F41'
$resultPath = Join-Path $mic 'install-result.json'
$startPath = Join-Path $mic 'install-start.json'
Remove-Item -LiteralPath $resultPath, $startPath -ErrorAction SilentlyContinue

$elevated = @"
`$ErrorActionPreference = 'Stop'
`$res = [ordered]@{ ok = `$false; startedAt = (Get-Date).ToUniversalTime().ToString('o') }
`$t0 = Get-Date
try {
  `$acl = New-Object Security.AccessControl.DirectorySecurity
  `$acl.SetAccessRuleProtection(`$true, `$false)
  foreach (`$sid in 'S-1-5-18', 'S-1-5-32-544') { `$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier(`$sid)), 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))) }
  `$dir = Join-Path '$mic' ('elev-' + [guid]::NewGuid().ToString('N'))
  `$null = [IO.Directory]::CreateDirectory(`$dir, `$acl)
  `$zip = Join-Path `$dir 'VBCABLE_Driver_Pack45.zip'
  Write-Host 'VibeSpace: installing VB-CABLE (VB-Audio Software, donationware - www.vb-cable.com) so this machine gets a microphone VibeSpace can speak into.'
  Write-Host 'Downloading $url'
  Invoke-WebRequest -UseBasicParsing -Uri '$url' -OutFile `$zip
  if ((Get-FileHash -Algorithm SHA256 `$zip).Hash -ne '$zipSha') { throw 'the download is not VB-CABLE Pack45 (its SHA-256 differs) - nothing was installed' }
  Expand-Archive -LiteralPath `$zip -DestinationPath (Join-Path `$dir 'x')
  `$exe = Join-Path `$dir 'x\VBCABLE_Setup_x64.exe'
  `$sig = Get-AuthenticodeSignature `$exe
  if ((Get-FileHash -Algorithm SHA256 `$exe).Hash -ne '$exeSha' -or `$sig.Status -ne 'Valid' -or `$sig.SignerCertificate.Subject -notmatch 'BUREL VINCENT') { throw 'the setup program is not the checked one - nothing was installed' }
  `$res.verifiedMs = [int]((Get-Date) - `$t0).TotalMilliseconds
  Write-Host 'Installing the driver (a few seconds; the setup may look stuck - that is normal)...'
  `$t1 = Get-Date
  `$r = Start-Process -FilePath `$exe -ArgumentList '-i', '-h' -WorkingDirectory (Join-Path `$dir 'x') -Wait -PassThru
  `$res.setupExit = `$r.ExitCode
  `$res.setupMs = [int]((Get-Date) - `$t1).TotalMilliseconds
  Start-Sleep -Seconds 2
  `$res.pnp = @(Get-PnpDevice -PresentOnly | Where-Object { `$_.FriendlyName -match 'VB-Audio Virtual Cable|CABLE (In|Out)put' } | ForEach-Object { "`$(`$_.FriendlyName) | `$(`$_.Class) | `$(`$_.Status)" })
  `$u = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { `$_.DisplayName -match 'VB-?CABLE|Virtual Cable' } | Select-Object -First 1
  if (`$u) { `$res.uninstall = "`$(`$u.UninstallString)"; `$res.displayName = "`$(`$u.DisplayName)" }
  Remove-Item -LiteralPath `$dir -Recurse -Force -ErrorAction SilentlyContinue
  `$res.ok = (`$r.ExitCode -eq 0)
  Write-Host ('Done (setup exit ' + `$r.ExitCode + '). VB-CABLE asks for a restart to finish - VibeSpace will NOT restart this machine. This window closes in 10 s.')
  Start-Sleep -Seconds 10
} catch {
  `$res.error = `$_.Exception.Message
  Write-Host ('FAILED: ' + `$_.Exception.Message)
  Start-Sleep -Seconds 20
}
`$res.ms = [int]((Get-Date) - `$t0).TotalMilliseconds
`$res | ConvertTo-Json -Compress | Set-Content -LiteralPath '$resultPath' -Encoding ASCII
"@

$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($elevated))
$o = [ordered]@{ startedAt = (Get-Date).ToUniversalTime().ToString('o'); encodedChars = $enc.Length }
$t0 = Get-Date
try {
  $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $enc
  $o.ok = $true; $o.exit = $p.ExitCode
} catch {
  $o.ok = $false; $o.noAdmin = $true; $o.error = $_.Exception.Message
}
$o.ms = [int]((Get-Date) - $t0).TotalMilliseconds
$o | ConvertTo-Json -Compress | Set-Content -LiteralPath $startPath -Encoding ASCII
