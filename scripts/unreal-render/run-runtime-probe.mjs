#!/usr/bin/env node
/**
 * 실제 게임이 해석한 component/instance/material/texture/clearance/port 계약을 JSON으로 추출한다.
 * 사용법: node scripts/unreal-render/run-runtime-probe.mjs <machine-id|--all>
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve, sep } from "node:path";

const contract = JSON.parse(readFileSync(resolve("scripts/unreal-render/render-contract.json"), "utf8"));
const requested = process.argv[2];
if (!requested) {
  console.error("machine-id 또는 --all이 필요합니다.");
  process.exit(2);
}
const machines = requested === "--all" ? contract.machines : contract.machines.filter((machine) => machine.id === requested);
if (machines.length === 0) {
  console.error(`계약에 없는 machine-id: ${requested}`);
  process.exit(2);
}

const game = "C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/Engine/Binaries/Win64/FactoryGameSteam-Win64-Shipping.exe";
const mod = "C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/FactoryGame/Mods/SatisfactoryOpsRenderer/SatisfactoryOpsRenderer.uplugin";
if (!existsSync(game) || !existsSync(mod)) {
  console.error("게임 또는 probe 모드가 없습니다. game:assets:probe:unreal:package를 먼저 실행하세요.");
  process.exit(2);
}

const outputRoot = resolve(`.cache/game-asset-index/runtime-probes/CL-${contract.gameBuild}`);
mkdirSync(outputRoot, { recursive: true });

for (const machine of machines) {
  const staging = mkdtempSync(resolve(outputRoot, `.${machine.id}-`));
  const probePath = resolve(staging, "probe.json");
  const finalPath = resolve(outputRoot, `${machine.buildingClass}.json`);
  const fail = (message, code = 4) => {
    console.error(message);
    rmSync(staging, { recursive: true, force: true });
    process.exit(code);
  };

  const args = [
    "FactoryGame",
    "-NoMultiplayer",
    "-NO_EOS_OVERLAY",
    "-RenderOffscreen",
    "-unattended",
    "-nosplash",
    "-nosound",
    "-ExecCmds=open /Game/FactoryGame/Map/GameLevel01/Persistent_Level?skiponboarding?SessionName=SatisfactoryOpsProbe?SessionDefinition=SessionDef_SinglePlayer",
    "-SatisfactoryOpsRender",
    "-SatisfactoryOpsProbeOnly",
    `-SatisfactoryOpsClass=${machine.classPath}`,
    `-SatisfactoryOpsFoundation=${contract.foundationClass}`,
    `-SatisfactoryOpsOutput=${staging}`,
    `-SatisfactoryOpsResolution=${contract.resolution}`,
  ];

  console.log(`PROBE ${machine.id}`);
  try {
    execFileSync(game, args, {
      cwd: dirname(game),
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, SteamAppId: "526870", SteamGameId: "526870" },
    });
  } catch (error) {
    fail(`게임 probe 실행 실패: ${error?.message ?? error}`, error?.status || 3);
  }
  if (!existsSync(probePath)) fail("probe.json이 생성되지 않았습니다.");

  const probe = JSON.parse(readFileSync(probePath, "utf8"));
  if (probe.schemaVersion !== 1 || probe.mode !== "current-game-runtime-probe") fail("probe 스키마가 올바르지 않습니다.");
  if (probe.machineClassPath !== machine.classPath || probe.foundationClassPath !== contract.foundationClass) fail("probe 클래스 경로가 계약과 다릅니다.");
  for (const field of ["foundationInstances", "components", "materials", "textures", "technicalMeshes", "machineClearance"])
    if (!Array.isArray(probe[field]) || probe[field].length === 0) fail(`probe 필드가 비었습니다: ${field}`);
  const machineVisualEvidence = probe.machineInstances.length > 0
    || probe.components.some((component) => component.owner === "machine" && (component.staticMesh || component.skeletalMesh));
  if (!machineVisualEvidence) fail("machine visual instance/proxy 증거가 없습니다.");
  const lowMips = probe.textures.filter((texture) => texture.effectiveMaterialUse
    && Number.isFinite(texture.residentMips)
    && texture.residentMips < texture.maxRuntimeMips);
  if (lowMips.length > 0) fail(`최상위 mip 미적재 텍스처: ${lowMips.map((texture) => `${texture.path} (${texture.residentMips}/${texture.maxRuntimeMips}, bias=${texture.cachedLodBias})`).join(", ")}`);

  const safeRelative = relative(outputRoot, finalPath);
  if (safeRelative.startsWith("..") || safeRelative.includes(sep)) fail(`안전하지 않은 probe 경로: ${finalPath}`);
  rmSync(finalPath, { force: true });
  renameSync(probePath, finalPath);
  rmSync(staging, { recursive: true, force: true });
  const sha256 = createHash("sha256").update(readFileSync(finalPath)).digest("hex");
  console.log(`PASS ${machine.buildingClass} sha256=${sha256}`);
}
