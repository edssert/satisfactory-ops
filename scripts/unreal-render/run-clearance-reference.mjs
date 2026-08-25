#!/usr/bin/env node
/** 실제 게임 viewport에서 원본 clearance/port reference 한 장을 저장한다. */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const game = 'C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/Engine/Binaries/Win64/FactoryGameSteam-Win64-Shipping.exe';
const output = resolve('.cache/unreal-reference/biomass-burner');
const target = resolve(output, 'clearance-reference.png');
mkdirSync(output, { recursive: true });
rmSync(target, { force: true });
const args = [
  'FactoryGame', '-NoMultiplayer', '-NO_EOS_OVERLAY', '-RenderOffscreen', '-unattended', '-nosplash', '-nosound',
  '-ResX=2048', '-ResY=2048',
  '-ExecCmds=open /Game/FactoryGame/Map/GameLevel01/Persistent_Level?skiponboarding?SessionName=SatisfactoryOpsReference?SessionDefinition=SessionDef_SinglePlayer',
  '-SatisfactoryOpsRender', '-SatisfactoryOpsReference', '-SatisfactoryOpsViewportReference',
  '-SatisfactoryOpsClass=/Game/FactoryGame/Buildable/Factory/GeneratorBiomass/Build_GeneratorBiomass_Automated.Build_GeneratorBiomass_Automated_C',
  '-SatisfactoryOpsFoundation=/Game/FactoryGame/Buildable/Building/Foundation/Build_Foundation_8x1_01.Build_Foundation_8x1_01_C',
  `-SatisfactoryOpsOutput=${output}`,
];
execFileSync(game, args, {
  cwd: dirname(game), stdio: 'inherit', windowsHide: true,
  env: { ...process.env, SteamAppId: '526870', SteamGameId: '526870' },
});
if (!existsSync(target)) throw new Error(`viewport reference 누락: ${target}`);
process.stdout.write(`PASS viewport reference ${target}\n`);
