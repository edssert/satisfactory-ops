#!/usr/bin/env node
/**
 * Satisfactory 원본 Unreal 렌더 환경의 재개 지점을 한 번에 보여준다.
 * 사용법: node scripts/game-assets/check-render-environment.mjs [--json] [--remote]
 * 종료 코드: 0=렌더 준비 완료, 2=로컬 의존성 미완료, 3=원격 저장소 권한 미완료
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const json = process.argv.includes("--json");
const remote = process.argv.includes("--remote");

const paths = {
  vswhere: "C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe",
  unrealEditors: [
    "C:/Dev/UnrealEngine-CSS/Engine/Binaries/Win64/UnrealEditor-Cmd.exe",
    "C:/Program Files/Unreal Engine - CSS/Engine/Binaries/Win64/UnrealEditor-Cmd.exe",
  ],
  starterProject: "C:/Dev/satisfactory-modding/SatisfactoryModLoader/FactoryGame.uproject",
  wwisePlugin: "C:/Dev/satisfactory-modding/SatisfactoryModLoader/Plugins/Wwise/Wwise.uplugin",
};

function firstExisting(candidates) {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function commandOk(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

const github = commandOk("gh", ["auth", "status", "--hostname", "github.com"]);
const epicAccess = remote && github.ok
  ? commandOk("gh", ["api", "repos/EpicGames/UnrealEngine", "--silent"])
  : { ok: false, skipped: true };
const cssAccess = remote && github.ok
  ? commandOk("gh", ["api", "repos/satisfactorymodding/UnrealEngine", "--silent"])
  : { ok: false, skipped: true };
const visualStudioComponents = [
  "Microsoft.VisualStudio.Component.VC.14.38.17.8.x86.x64",
  "Microsoft.NetCore.Component.Runtime.8.0",
  "Microsoft.Net.Component.4.8.1.SDK",
  "Microsoft.VisualStudio.Workload.NativeGame",
];
const visualStudio = existsSync(paths.vswhere)
  ? commandOk(paths.vswhere, ["-latest", "-products", "*", "-requires", ...visualStudioComponents, "-property", "installationPath"])
  : { ok: false, output: "" };
const unrealEditor = firstExisting(paths.unrealEditors);

const status = {
  github: { ready: github.ok },
  epicOrganization: { ready: epicAccess.ok, checked: remote && github.ok },
  satisfactoryModdingEngine: { ready: cssAccess.ok, checked: remote && github.ok },
  visualStudio2022: {
    ready: visualStudio.ok && Boolean(visualStudio.output),
    path: visualStudio.output || null,
    requiredComponents: visualStudioComponents,
  },
  unrealEditorCss: { ready: Boolean(unrealEditor), path: unrealEditor ?? paths.unrealEditors[0] },
  starterProject: { ready: existsSync(paths.starterProject), path: paths.starterProject },
  wwiseIntegration: { ready: existsSync(paths.wwisePlugin), path: paths.wwisePlugin },
};

const localReady = status.visualStudio2022.ready
  && status.unrealEditorCss.ready
  && status.starterProject.ready
  && status.wwiseIntegration.ready;
const remoteReady = !remote
  || (status.epicOrganization.ready && status.satisfactoryModdingEngine.ready);

if (json) {
  console.log(JSON.stringify({ ready: localReady && remoteReady, ...status }, null, 2));
} else {
  const line = (label, value, detail = "") => {
    console.log(`${value ? "PASS" : "WAIT"} ${label}${detail ? ` — ${detail}` : ""}`);
  };
  line("GitHub CLI 로그인", status.github.ready);
  if (remote) {
    line("EpicGames 조직 접근", status.epicOrganization.ready,
      status.epicOrganization.ready ? "private UnrealEngine 확인" : "Epic↔GitHub 연결 및 이메일 초대 수락 필요");
    line("SatisfactoryModding 엔진 접근", status.satisfactoryModdingEngine.ready,
      status.satisfactoryModdingEngine.ready ? "private UnrealEngine 확인" : "https://linker.ficsit.app/link 승인 필요");
  }
  line("Visual Studio 2022", status.visualStudio2022.ready, status.visualStudio2022.path ?? "설치 진행/필요");
  line("Unreal Engine 5.6.1-CSS", status.unrealEditorCss.ready, status.unrealEditorCss.path);
  line("SML Starter Project", status.starterProject.ready, status.starterProject.path);
  line("Wwise 2023.1.14 통합", status.wwiseIntegration.ready, status.wwiseIntegration.path);
  console.log(remote ? "\n원격 권한과 로컬 의존성을 함께 판정했습니다." : "\n원격 권한까지 확인하려면 --remote를 붙이세요.");
}

if (!remoteReady) process.exit(3);
if (!localReady) process.exit(2);
