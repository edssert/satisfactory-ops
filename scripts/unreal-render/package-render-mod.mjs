#!/usr/bin/env node
/**
 * SatisfactoryOpsRenderer를 Windows Shipping 모드로 패키징해 실제 게임 설치본에 배치한다.
 * 종료 코드: 0=패키징·배치 성공, 2=환경 미완료, 3=UAT 실패, 4=산출물 검증 실패
 */

import { existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const project = "C:/Dev/satisfactory-modding/SatisfactoryModLoader/FactoryGame.uproject";
const projectRoot = "C:/Dev/satisfactory-modding/SatisfactoryModLoader";
const pluginLink = `${projectRoot}/Mods/SatisfactoryOpsRenderer`;
const pluginSource = resolve("scripts/unreal-render/SatisfactoryOpsRenderer");
const wwise = `${projectRoot}/Plugins/Wwise/Wwise.uplugin`;
const buildBat = "C:/Dev/UnrealEngine-CSS/Engine/Build/BatchFiles/Build.bat";
const runUat = "C:/Dev/UnrealEngine-CSS/Engine/Build/BatchFiles/RunUAT.bat";
const gameRoot = "C:/Program Files (x86)/Steam/steamapps/common/Satisfactory";
const installedPlugin = `${gameRoot}/FactoryGame/Mods/SatisfactoryOpsRenderer`;
const packageScript = resolve("scripts/unreal-render/package-render-mod.ps1");

for (const [label, path] of Object.entries({ project, pluginLink, pluginSource, wwise, buildBat, runUat, gameRoot, packageScript })) {
  if (!existsSync(path)) {
    console.error(`WAIT ${label}: ${path}`);
    process.exit(2);
  }
}

if (realpathSync(pluginLink).toLowerCase() !== realpathSync(pluginSource).toLowerCase()) {
  console.error(`렌더 모드 junction이 다른 경로를 가리킵니다: ${pluginLink}`);
  process.exit(2);
}

const result = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", packageScript,
], {
  cwd: projectRoot,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(3);
}
if (result.status !== 0) process.exit(result.status || 3);

const descriptor = `${installedPlugin}/SatisfactoryOpsRenderer.uplugin`;
const binary = `${installedPlugin}/Binaries/Win64/FactoryGameSteam-SatisfactoryOpsRenderer-Win64-Shipping.dll`;
if (!existsSync(descriptor) || !existsSync(binary)) {
  console.error(`패키징은 끝났지만 게임 배치 산출물이 없습니다: ${installedPlugin}`);
  process.exit(4);
}

console.log(`PASS runtime mod: ${installedPlugin}`);
