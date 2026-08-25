# FactoryEditor를 증분 빌드한 뒤 SatisfactoryOpsRenderer를 Windows Shipping으로 패키징·배치한다.
$ErrorActionPreference = 'Stop'
$project = 'C:\Dev\satisfactory-modding\SatisfactoryModLoader\FactoryGame.uproject'
$projectRoot = Split-Path -Parent $project
$buildBat = 'C:\Dev\UnrealEngine-CSS\Engine\Build\BatchFiles\Build.bat'
$runUat = 'C:\Dev\UnrealEngine-CSS\Engine\Build\BatchFiles\RunUAT.bat'
$gameRoot = 'C:\Program Files (x86)\Steam\steamapps\common\Satisfactory'

$editorArgs = @(
  'FactoryEditor', 'Win64', 'Development',
  "-Project=$project", '-WaitMutex'
)
& $buildBat @editorArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$uatArgs = @(
  "-ScriptsForProject=$project",
  'PackagePlugin',
  "-project=$project",
  '-clientconfig=Shipping',
  '-serverconfig=Shipping',
  '-utf8output',
  '-DLCName=SatisfactoryOpsRenderer',
  '-build',
  '-platform=Win64',
  '-Target=FactoryGameSteam',
  "-CopyToGameDirectory_Windows=$gameRoot",
  '-nocompileeditor',
  '-installed'
)
& $runUat @uatArgs
exit $LASTEXITCODE
