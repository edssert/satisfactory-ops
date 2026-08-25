#!/usr/bin/env node
/** 실제 BuildGun viewport 프레임을 RenderDoc RDC로 캡처한다. */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const renderdoc = 'C:/Program Files/RenderDoc/renderdoccmd.exe';
const game = 'C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/Engine/Binaries/Win64/FactoryGameSteam-Win64-Shipping.exe';
const output = resolve('.cache/renderdoc/biomass-clearance');
mkdirSync(output, { recursive: true });
for (const name of readdirSync(output)) if (name.endsWith('.rdc')) rmSync(resolve(output, name), { force: true });
rmSync(resolve(output, 'clearance-reference.png'), { force: true });
rmSync(resolve(output, 'clearance-frame.zip'), { force: true });
rmSync(resolve(output, 'clearance-frame'), { force: true });
rmSync(resolve(output, 'clearance-analysis.json'), { force: true });
const gameArgs = [
  'FactoryGame', '-NoMultiplayer', '-NO_EOS_OVERLAY', '-Windowed', '-unattended', '-nosplash', '-nosound',
  '-ResX=1280', '-ResY=720', '-WinX=0', '-WinY=0',
  '-ExecCmds=open /Game/FactoryGame/Map/GameLevel01/Persistent_Level?skiponboarding?SessionName=SatisfactoryOpsRenderDoc?SessionDefinition=SessionDef_SinglePlayer',
  '-SatisfactoryOpsRender', '-SatisfactoryOpsReference', '-SatisfactoryOpsViewportReference', '-SatisfactoryOpsRenderDoc',
  '-SatisfactoryOpsClass=/Game/FactoryGame/Buildable/Factory/GeneratorBiomass/Build_GeneratorBiomass_Automated.Build_GeneratorBiomass_Automated_C',
  '-SatisfactoryOpsFoundation=/Game/FactoryGame/Buildable/Building/Foundation/Build_Foundation_8x1_01.Build_Foundation_8x1_01_C',
  `-SatisfactoryOpsOutput=${output}`,
];
execFileSync('dotnet', ['run', '--project', resolve('scripts/unreal-render/HiddenDesktopLauncher'), '--no-restore', '--', renderdoc,
  'capture', '--wait-for-exit', '--working-dir', dirname(game), '--capture-file', resolve(output, 'launch'), game, ...gameArgs], {
  cwd: process.cwd(), stdio: 'inherit', windowsHide: true,
  env: { ...process.env, SteamAppId: '526870', SteamGameId: '526870' },
});
const captures = readdirSync(output).filter((name) => name.endsWith('.rdc'));
if (captures.length === 0) throw new Error(`RenderDoc RDC 누락: ${output}`);
if (captures.length !== 1) throw new Error(`RenderDoc RDC 개수 불일치: ${captures.length}`);
const capture = resolve(output, captures[0]);
const xml = resolve(output, 'clearance-frame.zip');
execFileSync(renderdoc, ['convert', '--filename', capture, '--output', xml, '--convert-format', 'zip.xml'], {
  cwd: process.cwd(), stdio: 'inherit', windowsHide: true,
});
execFileSync(process.execPath, [
  resolve('scripts/unreal-render/analyze-renderdoc-clearance.mjs'), xml, '24', resolve(output, 'clearance-analysis.json'),
], { cwd: process.cwd(), stdio: 'inherit', windowsHide: true });
process.stdout.write(`PASS RenderDoc clearance draw 분석 · ${capture}\n`);
