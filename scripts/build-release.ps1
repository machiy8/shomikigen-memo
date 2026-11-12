# 賞味期限メモ：リリース用 .aab を作って署名する（オーナーが自分で実行する）
#
# 使い方（PowerShell で）:
#   cd D:\codex\shomikigen-cap
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-release.ps1
#
# - 署名鍵は TWA 版と同じ D:\codex\shomikigen-twa\android.keystore（別名 android）
# - パスワードはこの画面でだけ入力する。画面に表示しない・ファイルに書かない。
#   このプロセスの環境変数にだけ入れ、終わったら消す
# - できあがり：android\app\build\outputs\bundle\release\app-release.aab

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$keystore = "D:\codex\shomikigen-twa\android.keystore"
$jdk = "C:\Users\machi\.jdks\jdk-21.0.13+9"

if (-not (Test-Path $keystore)) { throw "署名鍵が見つかりません: $keystore" }
if (-not (Test-Path "$jdk\bin\java.exe")) { throw "JDK 21 が見つかりません: $jdk" }

function Read-Secret([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host "1/3 Web を作って Android に写します（npm run build / npx cap sync android）"
Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build に失敗しました" }
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw "npx cap sync android に失敗しました" }
} finally { Pop-Location }

Write-Host "2/3 署名鍵のパスワードを入力してください（表示されません）"
$storePass = Read-Secret "キーストアのパスワード"
$keyPass = Read-Secret "鍵のパスワード（キーストアと同じなら同じものを入力）"

$env:JAVA_HOME = $jdk
$env:SHOMIKIGEN_KEYSTORE_PATH = $keystore
$env:SHOMIKIGEN_KEY_ALIAS = "android"
$env:SHOMIKIGEN_KEYSTORE_PASSWORD = $storePass
$env:SHOMIKIGEN_KEY_PASSWORD = $keyPass

Write-Host "3/3 署名付き .aab を作ります（gradlew bundleRelease）"
Push-Location "$root\android"
try {
  .\gradlew.bat bundleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "bundleRelease に失敗しました（パスワード違いの可能性）" }
} finally {
  Pop-Location
  Remove-Item Env:SHOMIKIGEN_KEYSTORE_PASSWORD, Env:SHOMIKIGEN_KEY_PASSWORD -ErrorAction SilentlyContinue
  $storePass = $null; $keyPass = $null
}

$aab = "$root\android\app\build\outputs\bundle\release\app-release.aab"
Write-Host ""
Write-Host "できあがり: $aab"
Write-Host "署名の確認（証明書の SHA-256 を Play Console の『アップロード鍵の証明書』と見比べる）:"
& "$jdk\bin\keytool.exe" -printcert -jarfile $aab | Select-String "SHA256|所有者|Owner"
