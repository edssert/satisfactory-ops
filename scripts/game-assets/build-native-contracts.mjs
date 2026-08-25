#!/usr/bin/env node
/** 설치본 PDB/DLL에서 native 포트 조립 계약을 재생성한다. */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const candidates = [
  process.env.SATISFACTORY_ROOT,
  'C:/Program Files (x86)/Steam/steamapps/common/Satisfactory',
].filter(Boolean).map((path) => resolve(path));
const gameRoot = candidates.find((path) => existsSync(resolve(path, 'FactoryGame/Binaries/Win64/FactoryGameSteam-FactoryGame-Win64-Shipping.pdb')));
if (!gameRoot) {
  process.stderr.write('Satisfactory PDB 설치 루트를 찾지 못했습니다. SATISFACTORY_ROOT를 지정하세요.\n');
  process.exit(1);
}
execFileSync('dotnet', [
  'run', '--project', 'scripts/game-assets/PdbNativeContracts', '--no-restore', '--',
  gameRoot, '.cache/game-asset-index/factory-native-contracts.json',
], { cwd: root, stdio: 'inherit' });
