#!/usr/bin/env node
/**
 * 공개 Satisfactory 블루프린트 코퍼스를 읽어 배치·연결 토폴로지와 설비 포트 좌표를 교차검증한다.
 *
 * 사용: node scripts/analyze-blueprint-corpus.mjs <디렉터리>
 * 입력: 같은 이름의 .sbp / .sbpcfg 쌍. 원본 파일은 수정하지 않는다.
 * 출력: stdout JSON. 액터 인스턴스명과 원문 설명은 내보내지 않는다.
 * 종료: 1 입력 오류, 2 유효한 블루프린트 쌍 없음, 3 포트 관측 편차가 5 cm를 초과함.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Parser } from '@etothepii/satisfactory-file-parser';

const corpusDirectory = process.argv[2];
if (!corpusDirectory) {
  console.error('블루프린트 코퍼스 디렉터리를 주세요.');
  process.exit(1);
}

const tail = (value = '') => value.split('.').at(-1) ?? '';
const componentName = (value = '') => value.split('.').at(-1) ?? value;
const round = (value, places = 4) => Number(value.toFixed(places));
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const buildingRows = JSON.parse(fs.readFileSync(new URL('../src/data/app/buildings.json', import.meta.url), 'utf8'));
const buildingByClass = new Map(buildingRows.map((row) => [row.id, row]));

function arrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function rotate(vector, quaternion) {
  const q = quaternion ?? { x: 0, y: 0, z: 0, w: 1 };
  const tx = 2 * (q.y * vector.z - q.z * vector.y);
  const ty = 2 * (q.z * vector.x - q.x * vector.z);
  const tz = 2 * (q.x * vector.y - q.y * vector.x);
  return {
    x: vector.x + q.w * tx + (q.y * tz - q.z * ty),
    y: vector.y + q.w * ty + (q.z * tx - q.x * tz),
    z: vector.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function worldPoint(actor, local) {
  const rotated = rotate(local, actor.transform?.rotation);
  const translation = actor.transform?.translation ?? { x: 0, y: 0, z: 0 };
  return {
    x: translation.x + rotated.x,
    y: translation.y + rotated.y,
    z: translation.z + rotated.z,
  };
}

function actorLocalPoint(actor, world) {
  const translation = actor.transform?.translation ?? { x: 0, y: 0, z: 0 };
  const rotation = actor.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
  return rotate(
    { x: world.x - translation.x, y: world.y - translation.y, z: world.z - translation.z },
    { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w },
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function largestConsensusCluster(group, toleranceM) {
  let best = [];
  for (const candidate of group) {
    const cluster = group.filter((entry) => distance(entry.positionM, candidate.positionM) <= toleranceM);
    if (cluster.length > best.length) best = cluster;
  }
  return best;
}

function connectedSplinePoint(objectsByName, connectedPath, medium) {
  const component = objectsByName.get(connectedPath);
  const ownerPath = component?.parentEntityName || connectedPath.split('.').slice(0, -1).join('.');
  const transport = objectsByName.get(ownerPath);
  if (!transport) return null;

  const transportClass = tail(transport.typePath);
  const isSupported = medium === 'solid'
    ? /^Build_ConveyorBelt/.test(transportClass)
    : /^Build_Pipeline(?:_|$)/.test(transportClass);
  if (!isSupported) return null;

  const spline = transport.properties?.mSplineData?.values ?? [];
  const endName = componentName(connectedPath);
  const endpointIndex = /(?:Any|Connection)0$/.test(endName) ? 0 : -1;
  const location = spline.at(endpointIndex)?.properties?.Location?.value;
  return location ? worldPoint(transport, location) : null;
}

function connectedPowerPoints(port, objectsByName) {
  const points = [];
  const portPath = port.instanceName ?? '';
  for (const reference of port.properties?.mWires?.values ?? []) {
    const line = objectsByName.get(reference.pathName);
    const sourcePath = line?.specialProperties?.source?.pathName;
    const targetPath = line?.specialProperties?.target?.pathName;
    const wire = line?.properties?.mWireInstances?.values?.[0]?.properties;
    const cachedSource = wire?.CachedRelativeLocations?.[0]?.value;
    const location = targetPath === portPath
      ? line?.transform?.translation
      : sourcePath === portPath && cachedSource && line
        ? worldPoint(line, cachedSource)
        : null;
    if (location) points.push(location);
  }
  return points;
}

function isPlausiblePortPosition(buildingClass, positionM) {
  const footprint = buildingByClass.get(buildingClass)?.footprint;
  if (!footprint) return true;
  const xLimit = Math.abs(footprint.widthM ?? 0) / 2 + 2;
  const yLimit = Math.abs(footprint.lengthM ?? 0) / 2 + 2;
  const zLimit = Math.abs(footprint.heightM ?? footprint.visualHeightM ?? 0) + 2;
  return Math.abs(positionM.x) <= xLimit
    && Math.abs(positionM.y) <= yLimit
    && positionM.z >= -2
    && positionM.z <= zLimit;
}

function observePorts(blueprint, sourceId) {
  const objects = blueprint.objects ?? [];
  const objectsByName = new Map(objects.map((object) => [object.instanceName ?? '', object]));
  const observations = [];
  let rejectedObservationCount = 0;

  for (const machine of objects) {
    const buildingClass = tail(machine.typePath);
    if (!buildingClass.startsWith('Build_')) continue;
    if (/Conveyor|Pipeline|PowerLine|Foundation|Wall|Ramp|Pole|Sign|Catwalk|Walkway|Barrier/.test(buildingClass)) continue;

    const components = (machine.components ?? [])
      .map((reference) => objectsByName.get(reference.pathName))
      .filter(Boolean);

    for (const port of components) {
      const portType = port.typePath ?? '';
      if (/FGPowerConnectionComponent/.test(portType)) {
        for (const world of connectedPowerPoints(port, objectsByName)) {
          const localCm = actorLocalPoint(machine, world);
          const positionM = { x: localCm.x / 100, y: localCm.y / 100, z: localCm.z / 100 };
          if (!isPlausiblePortPosition(buildingClass, positionM)) {
            rejectedObservationCount += 1;
            continue;
          }
          observations.push({
            sourceId,
            buildingClass,
            port: componentName(port.instanceName),
            medium: 'power',
            direction: 'bidirectional',
            positionM,
          });
        }
        continue;
      }
      const medium = /FGFactoryConnectionComponent/.test(portType)
        ? 'solid'
        : /FGPipeConnectionFactory/.test(portType)
          ? 'fluid'
          : null;
      if (!medium) continue;

      const connectedPath = port.properties?.mConnectedComponent?.value?.pathName;
      if (!connectedPath) continue;
      const world = connectedSplinePoint(objectsByName, connectedPath, medium);
      if (!world) continue;

      const localCm = actorLocalPoint(machine, world);
      const id = componentName(port.instanceName);
      const positionM = { x: localCm.x / 100, y: localCm.y / 100, z: localCm.z / 100 };
      if (!isPlausiblePortPosition(buildingClass, positionM)) {
        rejectedObservationCount += 1;
        continue;
      }
      observations.push({
        sourceId,
        buildingClass,
        port: id,
        medium,
        direction: /Input/i.test(id) ? 'input' : /Output/i.test(id) ? 'output' : 'bidirectional',
        positionM,
      });
    }
  }

  return { observations, rejectedObservationCount };
}

function classCounts(objects) {
  const counts = new Map();
  for (const object of objects) {
    if (object.parentEntityName) continue;
    const className = tail(object.typePath);
    counts.set(className, (counts.get(className) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

let entries;
try {
  entries = fs.readdirSync(corpusDirectory, { withFileTypes: true });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const stems = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sbp'))
  .map((entry) => entry.name.slice(0, -4))
  .filter((stem) => fs.existsSync(path.join(corpusDirectory, `${stem}.sbpcfg`)))
  .sort();

if (!stems.length) {
  console.error('유효한 .sbp/.sbpcfg 쌍을 찾지 못했습니다.');
  process.exit(2);
}

const sources = [];
const allObservations = [];
for (const stem of stems) {
  try {
    const blueprintPath = path.join(corpusDirectory, `${stem}.sbp`);
    const configPath = path.join(corpusDirectory, `${stem}.sbpcfg`);
    const blueprintBuffer = fs.readFileSync(blueprintPath);
    const configBuffer = fs.readFileSync(configPath);
    const blueprint = Parser.ParseBlueprintFiles(
      stem,
      arrayBuffer(blueprintBuffer),
      arrayBuffer(configBuffer),
    );
    const { observations, rejectedObservationCount } = observePorts(blueprint, stem);
    allObservations.push(...observations);
    sources.push({
      id: stem,
      blueprintSha256: sha256(blueprintBuffer),
      configSha256: sha256(configBuffer),
      headerVersion: blueprint.header?.headerVersion,
      saveVersion: blueprint.header?.saveVersion,
      buildVersion: blueprint.header?.buildVersion,
      designerDimension: blueprint.header?.designerDimension,
      objectCount: blueprint.objects?.length ?? 0,
      actorClassCounts: classCounts(blueprint.objects ?? []),
      derivedPortObservationCount: observations.length,
      rejectedPortObservationCount: rejectedObservationCount,
    });
  } catch (error) {
    console.error(`${stem}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const groups = new Map();
for (const observation of allObservations) {
  const key = `${observation.buildingClass}:${observation.port}:${observation.medium}`;
  const group = groups.get(key) ?? [];
  group.push(observation);
  groups.set(key, group);
}

let unstable = false;
const ports = [...groups.entries()].map(([key, group]) => {
  const consensus = largestConsensusCluster(group, 0.05);
  const positionM = {
    x: median(consensus.map((entry) => entry.positionM.x)),
    y: median(consensus.map((entry) => entry.positionM.y)),
    z: median(consensus.map((entry) => entry.positionM.z)),
  };
  const maxDeviationM = Math.max(...consensus.map((entry) => Math.hypot(
    entry.positionM.x - positionM.x,
    entry.positionM.y - positionM.y,
    entry.positionM.z - positionM.z,
  )));
  if (maxDeviationM > 0.05) unstable = true;
  const sourceIds = [...new Set(consensus.map((entry) => entry.sourceId))].sort();
  return {
    key,
    buildingClass: group[0].buildingClass,
    port: group[0].port,
    medium: group[0].medium,
    direction: group[0].direction,
    positionM: Object.fromEntries(Object.entries(positionM).map(([axis, value]) => [axis, round(value)])),
    sampleCount: consensus.length,
    outlierCount: group.length - consensus.length,
    sourceIds,
    maxDeviationM: round(maxDeviationM),
    confidence: sourceIds.length >= 2 && maxDeviationM <= 0.05
      ? 'cross-verified'
      : group.length >= 2 && maxDeviationM <= 0.05
        ? 'internally-verified'
        : 'observed',
  };
}).sort((left, right) => left.key.localeCompare(right.key));

console.log(JSON.stringify({
  schemaVersion: 1,
  method: 'connected conveyor/pipeline spline endpoint transformed into machine-local coordinates',
  toleranceM: 0.05,
  sourceCount: sources.length,
  observationCount: allObservations.length,
  sources,
  ports,
}, null, 2));

if (unstable) process.exit(3);
