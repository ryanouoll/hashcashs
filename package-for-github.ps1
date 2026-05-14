$ErrorActionPreference = "Stop"

$root = "C:\cfoingio"
$outDir = Join-Path $root "upload-for-github"

if (Test-Path $outDir) {
  Remove-Item -Recurse -Force $outDir
}
New-Item -ItemType Directory -Path $outDir | Out-Null

function Copy-IfExists([string]$path) {
  $src = Join-Path $root $path
  if (Test-Path $src) {
    $dst = Join-Path $outDir $path
    $dstParent = Split-Path $dst -Parent
    if (!(Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }
    Copy-Item -Recurse -Force $src $dst
  }
}

# root files
Copy-IfExists "contracts"
Copy-IfExists "scripts"
Copy-IfExists "hardhat.config.js"
Copy-IfExists "package.json"
Copy-IfExists "package-lock.json"
Copy-IfExists ".gitignore"
Copy-IfExists ".env.example"
Copy-IfExists "README.md"

# frontend (Vite)
Copy-IfExists "email-wallet\src"
Copy-IfExists "email-wallet\public"
Copy-IfExists "email-wallet\index.html"
Copy-IfExists "email-wallet\package.json"
Copy-IfExists "email-wallet\package-lock.json"
Copy-IfExists "email-wallet\vite.config.ts"
Copy-IfExists "email-wallet\tsconfig.json"
Copy-IfExists "email-wallet\tsconfig.app.json"
Copy-IfExists "email-wallet\tsconfig.node.json"
Copy-IfExists "email-wallet\.gitignore"

# defensive cleanup (just in case)
$junk = @(
  "node_modules",
  "email-wallet\node_modules",
  "email-wallet\dist",
  "email-wallet\dist-ssr",
  "artifacts",
  "cache",
  "coverage",
  ".env",
  "email-wallet\.env"
)
foreach ($j in $junk) {
  $p = Join-Path $outDir $j
  if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}

Write-Host "Done. Folder created:"
Write-Host $outDir
Write-Host ""
Write-Host "Next:"
Write-Host "1) Upload this folder to GitHub (web upload), OR"
Write-Host "2) Install Git and run git init/add/commit/push inside it."

