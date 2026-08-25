#!/usr/bin/env node
/**
 * 실제 Satisfactory 런타임을 offscreen으로 실행해 한 기기의 top + beauty 4 + technical 4를 생성한다.
 * 사용법: node scripts/unreal-render/run-runtime-render.mjs <machine-id|--all>
 * 종료 코드: 0=성공, 2=계약/환경 오류, 3=게임 실행 실패, 4=렌더 산출물 누락
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve, sep } from "node:path";

const contract = JSON.parse(readFileSync(resolve("scripts/unreal-render/render-contract.json"), "utf8"));
const requested = process.argv[2];
if (!requested) {
  console.error("machine-id 또는 --all이 필요합니다.");
  process.exit(2);
}

const machines = requested === "--all"
  ? contract.machines
  : contract.machines.filter((machine) => machine.id === requested);
if (machines.length === 0) {
  console.error(`계약에 없는 machine-id: ${requested}`);
  process.exit(2);
}

const game = "C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/Engine/Binaries/Win64/FactoryGameSteam-Win64-Shipping.exe";
const mod = "C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/FactoryGame/Mods/SatisfactoryOpsRenderer/SatisfactoryOpsRenderer.uplugin";
if (!existsSync(game) || !existsSync(mod)) {
  console.error("게임 또는 패키징된 렌더 모드가 없습니다. game:render:unreal:package를 먼저 실행하세요.");
  process.exit(2);
}

const expectedViews = [
  "top.png",
  "beauty-045.png", "beauty-135.png", "beauty-225.png", "beauty-315.png",
  "technical-045.png", "technical-135.png", "technical-225.png", "technical-315.png",
  "receipt.json",
];

for (const machine of machines) {
  const outputRoot = resolve(".cache/unreal-render");
  mkdirSync(outputRoot, { recursive: true });
  const output = mkdtempSync(resolve(outputRoot, `.${machine.id}-`));
  const finalOutput = resolve(outputRoot, machine.id);
  const failRun = (message, code) => {
    console.error(message);
    rmSync(output, { recursive: true, force: true });
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
    "-ExecCmds=open /Game/FactoryGame/Map/GameLevel01/Persistent_Level?skiponboarding?SessionName=SatisfactoryOpsRenderer?SessionDefinition=SessionDef_SinglePlayer",
    "-SatisfactoryOpsRender",
    "-SatisfactoryOpsReference",
    `-SatisfactoryOpsClass=${machine.classPath}`,
    `-SatisfactoryOpsFoundation=${contract.foundationClass}`,
    `-SatisfactoryOpsOutput=${output}`,
    `-SatisfactoryOpsResolution=${contract.resolution}`,
  ];

  console.log(`RENDER ${machine.id} → ${output}`);
  try {
    execFileSync(game, args, {
      cwd: dirname(game),
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, SteamAppId: "526870", SteamGameId: "526870" },
    });
  } catch (error) {
    failRun(`게임 렌더 실행 실패: ${error?.message ?? error}`, error?.status || 3);
  }

  const missing = expectedViews.filter((name) => !existsSync(resolve(output, name)));
  if (missing.length > 0) {
    failRun(`렌더 산출물 누락: ${missing.join(", ")}`, 4);
  }
  const pngCount = readdirSync(output).filter((name) => name.endsWith(".png")).length;
  if (pngCount !== 9) {
    failRun(`PNG 개수가 9가 아닙니다: ${pngCount}`, 4);
  }
  const finalRelative = relative(outputRoot, finalOutput);
  if (finalRelative.startsWith("..") || finalRelative.includes(sep) || finalRelative !== machine.id) {
    failRun(`안전하지 않은 최종 출력 경로: ${finalOutput}`, 4);
  }
  rmSync(finalOutput, { recursive: true, force: true });
  renameSync(output, finalOutput);
  console.log(`PASS ${machine.id}: top 1 + beauty 4 + technical 4 → ${finalOutput}`);
}
