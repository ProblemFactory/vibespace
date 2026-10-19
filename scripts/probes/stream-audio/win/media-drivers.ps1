# media-drivers.ps1 — VibeSpace lane stream-audio-probe (probe only, read-only): which drivers back this machine's audio
# devices (class MEDIA): name, provider, signer, INF, and whether a kernel .sys is behind it — the evidence for "a virtual
# microphone on Windows is a kernel-mode driver".
$ErrorActionPreference = 'SilentlyContinue'
$rows = Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -eq 'MEDIA' } | ForEach-Object {
  $svc = $null
  if ($_.DeviceID) { $svc = (Get-ItemProperty ("HKLM:\SYSTEM\CurrentControlSet\Enum\" + $_.DeviceID) -Name Service).Service }
  $sys = $null
  if ($svc) { $ip = (Get-ItemProperty ("HKLM:\SYSTEM\CurrentControlSet\Services\" + $svc) -Name ImagePath).ImagePath; if ($ip) { $sys = Split-Path $ip -Leaf } }
  [pscustomobject]@{ name = "$($_.DeviceName)"; provider = "$($_.DriverProviderName)"; signer = "$($_.Signer)"; inf = "$($_.InfName)"; service = "$svc"; image = "$sys" }
}
$rows | ConvertTo-Json -Compress
