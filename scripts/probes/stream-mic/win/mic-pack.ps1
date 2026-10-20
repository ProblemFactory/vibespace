# mic-pack.ps1 - VibeSpace lane stream-mic-wheel-probe (probe only; installs NOTHING).
# Downloads the official VB-CABLE driver pack from the vendor's own site into %USERPROFILE%\vs-probe\mic\, then says what
# a product's "install a virtual microphone" row would have to check before it hands the setup to an elevated prompt:
# the zip's sha256, the files inside, the Authenticode signer of the setup programs and of the driver catalogs, and the
# INF's version / provider. Output: one JSON object on stdout.
#   powershell -NoProfile -ExecutionPolicy Bypass -File mic-pack.ps1 [-Url <zip url>]
# Pure ASCII on purpose: Windows PowerShell 5.1 reads a BOM-less script in the ANSI code page.
param([string]$Url = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip')
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:USERPROFILE 'vs-probe\mic'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$name = Split-Path $Url -Leaf
$zip = Join-Path $dir $name
$out = [ordered]@{ ok = $true; url = $Url; zip = $zip }
if (-not (Test-Path $zip)) {
  $t0 = Get-Date
  & curl.exe -sS -L --fail -o $zip $Url
  if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE" }
  $out.downloadMs = [int]((Get-Date) - $t0).TotalMilliseconds
} else { $out.downloadMs = 'cached' }
$out.bytes = (Get-Item $zip).Length
$out.sha256 = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
$x = Join-Path $dir ([IO.Path]::GetFileNameWithoutExtension($name))
if (Test-Path $x) { Remove-Item -Recurse -Force $x }
Expand-Archive -Path $zip -DestinationPath $x
$files = @()
foreach ($f in (Get-ChildItem -Recurse -File $x)) {
  $row = [ordered]@{ path = $f.FullName.Substring($x.Length + 1); bytes = $f.Length; sha256 = (Get-FileHash -Algorithm SHA256 $f.FullName).Hash.ToLower() }
  if ($f.Extension -in '.exe', '.cat', '.sys', '.dll') {
    $s = Get-AuthenticodeSignature $f.FullName
    $row.sig = "$($s.Status)"
    if ($s.SignerCertificate) {
      $row.signer = $s.SignerCertificate.Subject
      $row.issuer = $s.SignerCertificate.Issuer
      $row.notAfter = $s.SignerCertificate.NotAfter.ToString('yyyy-MM-dd')
      $row.thumb = $s.SignerCertificate.Thumbprint
    }
    if ($s.TimeStamperCertificate) { $row.timestamper = $s.TimeStamperCertificate.Subject }
    if ($f.Extension -eq '.exe') { $v = $f.VersionInfo; $row.version = "$($v.FileVersion)"; $row.product = "$($v.ProductName)"; $row.company = "$($v.CompanyName)" }
  }
  if ($f.Extension -eq '.inf') {
    $lines = Get-Content $f.FullName | ForEach-Object { "$_" }
    $row.inf = @($lines | Where-Object { $_ -match '^\s*(DriverVer|Provider|Class|CatalogFile[^=]*|DriverPackageType|PnpLockdown)\s*=' -or $_ -match '^\s*(ProviderName|VBAudio[^=]*|MfgName)\s*=' } | Select-Object -First 16)
  }
  $files += $row
}
$out.files = $files
$out | ConvertTo-Json -Depth 5 -Compress
