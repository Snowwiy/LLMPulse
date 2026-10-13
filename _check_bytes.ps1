$p = 'G:\AI Local\Projects\LLMPulse\README.md'
$b = [System.IO.File]::ReadAllBytes($p)
Write-Host "BYTES: $($b.Length)"
$high = 0
for ($i = 0; $i -lt $b.Length; $i++) { if ($b[$i] -gt 127) { $high++ } }
Write-Host "HIGH_BYTES: $high"
Write-Host "First bytes: $($b[0..15] -join ',')"
