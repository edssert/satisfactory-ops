#!/usr/bin/env node
/**
 * 세이브의 연결된 컨베이어 끝점을 역산해 설비 로컬 포트 좌표를 관측한다.
 *
 * 사용: node scripts/extract-save-ports.mjs <save.sav>
 * 출력: stdout JSON. 세이브 경로·액터 이름은 출력하지 않는다.
 * 종료: 1 입력 없음/읽기 실패, 2 관측 없음, 3 같은 포트의 관측 편차가 허용치를 초과함.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Parser } from '@etothepii/satisfactory-file-parser';

const savePath = process.argv[2];
if (!savePath) {
  console.error('세이브 파일 경로를 주세요.');
  process.exit(1);
}

const tail = (value = '') => value.split('.').pop() ?? '';
const componentName = (value = '') => value.split('.').at(-1) ?? value;
const round = (value, places = 4) => Number(value.toFixed(places));
const buildingRows = JSON.parse(fs.readFileSync(new URL('../src/data/app/buildings.json', import.meta.url), 'utf8'));
const buildingByClass = new Map(buildingRows.map((row) => [row.id, row]));

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

function connectedTransportPoint(connectedPath, medium, byName) {
  const connectedComponent = byName.get(connectedPath);
  const ownerPath = connectedComponent?.parentEntityName
    ?? connectedPath.split('.').slice(0, -1).join('.');
  const transport = byName.get(ownerPath);
  if (!transport) return null;

  const transportClass = tail(transport.typePath);
  const supported = medium === 'solid'
    ? /^Build_ConveyorBelt/.test(transportClass)
    : /^Build_Pipeline(?:_|$)/.test(transportClass);
  if (!supported) return null;

  const spline = transport.properties?.mSplineData?.values ?? [];
  const endName = componentName(connectedPath);
  const endpointIndex = /(?:Any|Connection)0$/.test(endName) ? 0 : -1;
  const location = spline.at(endpointIndex)?.properties?.Location?.value;
  return location ? worldPoint(transport, location) : null;
}

function connectedPowerPoints(port, byName) {
  const points = [];
  const portPath = port.instanceName ?? '';
  for (const reference of port.properties?.mWires?.values ?? []) {
    const line = byName.get(reference.pathName);
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

let save;
let sourceSha256;
try {
  const raw = fs.readFileSync(savePath);
  sourceSha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  save = Parser.ParseSave(savePath, buffer);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const objects = Object.values(save.levels ?? {}).flatMap((level) => level.objects ?? []);
const byName = new Map(objects.map((object) => [object.instanceName ?? '', object]));
const observations = [];
let rejectedObservationCount = 0;

for (const machine of objects) {
  const buildingClass = tail(machine.typePath);
  const isLogisticsAttachment = /^Build_ConveyorAttachment(?:Splitter|Merger)/.test(buildingClass);
  if (!buildingClass.startsWith('Build_') || (!isLogisticsAttachment && /Conveyor|Pipeline|PowerLine/.test(buildingClass))) continue;

  const components = (machine.components ?? [])
    .map((reference) => byName.get(reference.pathName))
    .filter(Boolean);

  for (const port of components) {
    const portType = port.typePath ?? '';
    if (/FGPowerConnectionComponent/.test(portType)) {
      for (const world of connectedPowerPoints(port, byName)) {
        const localCm = actorLocalPoint(machine, world);
        const positionM = { x: localCm.x / 100, y: localCm.y / 100, z: localCm.z / 100 };
        if (!isPlausiblePortPosition(buildingClass, positionM)) {
          rejectedObservationCount += 1;
          continue;
        }
        observations.push({
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
    const world = connectedTransportPoint(connectedPath, medium, byName);
    if (!world) continue;
    const localCm = actorLocalPoint(machine, world);
    const positionM = { x: localCm.x / 100, y: localCm.y / 100, z: localCm.z / 100 };
    if (!isPlausiblePortPosition(buildingClass, positionM)) {
      rejectedObservationCount += 1;
      continue;
    }
    observations.push({
      buildingClass,
      port: componentName(port.instanceName),
      medium,
      direction: /Input/i.test(port.instanceName ?? '') ? 'input' : 'output',
      positionM,
    });
  }
}

if (!observations.length) {
  console.error('연결된 설비 포트를 찾지 못했습니다.');
  process.exit(2);
}

const groups = new Map();
for (const observation of observations) {
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
  return {
    key,
    buildingClass: group[0].buildingClass,
    port: group[0].port,
    medium: group[0].medium,
    direction: group[0].direction,
    positionM: Object.fromEntries(Object.entries(positionM).map(([axis, value]) => [axis, round(value)])),
    sampleCount: consensus.length,
    outlierCount: group.length - consensus.length,
    maxDeviationM: round(maxDeviationM),
    confidence: consensus.length >= 2 && maxDeviationM <= 0.05 ? 'verified' : 'observed',
  };
}).sort((a, b) => a.key.localeCompare(b.key));

console.log(JSON.stringify({
  schemaVersion: 1,
  method: 'connected conveyor/pipeline/wire endpoint transformed into machine-local coordinates',
  sourceSha256,
  saveVersion: save.header?.saveVersion,
  buildVersion: save.header?.buildVersion,
  toleranceM: 0.05,
  observationCount: observations.length,
  rejectedObservationCount,
  ports,
}, null, 2));

if (unstable) process.exit(3);
