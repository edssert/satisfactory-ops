# Satisfactory 1.2/SML용 Wwise SDK와 UE 5.6 통합을 사용자 자격증명으로 설치한다.
# 자격증명은 wwise-cli의 TTY 프롬프트에서만 받고 파일이나 명령행 인수에 기록하지 않는다.

$ErrorActionPreference = 'Stop'
trap {
  Write-Host $_ -ForegroundColor Red
  Read-Host '실패 내용을 확인했습니다. Enter를 누르면 창이 닫힙니다'
  exit 1
}
$cli = 'C:\Dev\satisfactory-modding\tools\wwise-cli-v0.2.4\wwise-cli_windows_amd64.exe'
$project = 'C:\Dev\satisfactory-modding\SatisfactoryModLoader\FactoryGame.uproject'
$cache = 'C:\Dev\satisfactory-modding\cache\wwise-cli'

if (-not (Test-Path -LiteralPath $cli)) { throw "Wwise CLI가 없습니다: $cli" }
if (-not (Test-Path -LiteralPath $project)) { throw "Starter Project가 없습니다: $project" }
New-Item -ItemType Directory -Force -Path $cache | Out-Null

Write-Host '1/2 Wwise 2023.1.14.8770 SDK 다운로드' -ForegroundColor Cyan
& $cli download `
  --sdk-version '2023.1.14.8770' `
  --cache-dir $cache `
  --filter 'Packages=SDK' `
  --filter 'DeploymentPlatforms=Windows_vc160' `
  --filter 'DeploymentPlatforms=Windows_vc170' `
  --filter 'DeploymentPlatforms=Linux' `
  --filter 'DeploymentPlatforms='
if ($LASTEXITCODE -ne 0) { throw "Wwise SDK 다운로드 실패: $LASTEXITCODE" }

Write-Host '2/2 Wwise 2023.1.14.3555 Unreal 통합' -ForegroundColor Cyan
& $cli integrate-ue `
  --integration-version '2023.1.14.3555' `
  --project $project `
  --cache-dir $cache
if ($LASTEXITCODE -ne 0) { throw "Wwise Unreal 통합 실패: $LASTEXITCODE" }

Write-Host 'Wwise 통합 완료. 이 창은 3초 뒤 닫힙니다.' -ForegroundColor Green
Start-Sleep -Seconds 3
