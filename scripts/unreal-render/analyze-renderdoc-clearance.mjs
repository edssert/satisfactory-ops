#!/usr/bin/env node
/**
 * RenderDoc zip.xml에서 clearance draw의 D3D12 상태를 결정적으로 복구한다.
 *
 * 사용법:
 *   node scripts/unreal-render/analyze-renderdoc-clearance.mjs <capture.xml> [indexCount]
 *
 * 종료 코드: 0 성공, 1 입력/대상 draw 누락.
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const xmlPath = resolve(process.argv[2] ?? '.cache/renderdoc/biomass-clearance/clearance-frame.zip');
const targetIndexCount = Number(process.argv[3] ?? 24);
const outputPath = process.argv[4] ? resolve(process.argv[4]) : null;
if (!existsSync(xmlPath) || !Number.isInteger(targetIndexCount)) {
  process.stderr.write('사용법: analyze-renderdoc-clearance.mjs <capture.xml> [indexCount]\n');
  process.exit(1);
}

const states = new Map();
const descriptors = new Map();
const initialContents = new Map();
const draws = [];

const key = (heap, index) => `${heap}:${index}`;
const tagValue = (xml, tag, name) => {
  const match = xml.match(new RegExp(`<${tag} name="${name}"[^>]*>([^<]+)</${tag}>`));
  return match?.[1];
};
const resourceValue = (xml, name) => tagValue(xml, 'ResourceId', name);
const uintValue = (xml, name) => tagValue(xml, 'uint', name);
const chunkMeta = (xml) => {
  const match = xml.match(/<chunk\s+[^>]*chunkIndex="(\d+)"[^>]*name="([^"]+)"/);
  return match ? { index: Number(match[1]), name: match[2] } : null;
};
const commandList = (xml) => resourceValue(xml, 'pCommandList') ?? resourceValue(xml, 'CommandList');
const cloneState = (state) => JSON.parse(JSON.stringify(state));

function stateFor(id) {
  if (!states.has(id)) states.set(id, { pipelineState: null, rootSignature: null, tables: {}, cbvs: {}, indexBuffer: null, vertexBuffers: null });
  return states.get(id);
}

function parsePortableHandle(block, name) {
  const match = block.match(new RegExp(`<struct name="${name}"[^>]*>([\\s\\S]*?)</struct>`));
  if (!match) return null;
  return { heap: resourceValue(match[1], 'heap'), index: Number(uintValue(match[1], 'index')) };
}

function resolveDescriptor(handle, seen = new Set()) {
  if (!handle) return null;
  const descriptorKey = key(handle.heap, handle.index);
  if (seen.has(descriptorKey)) return { ...handle, error: 'descriptor-cycle' };
  seen.add(descriptorKey);
  const value = descriptors.get(descriptorKey);
  if (!value) return { ...handle, unresolved: true };
  if (value.source) return { ...handle, copiedFrom: value.source, resolved: resolveDescriptor(value.source, seen) };
  return { ...handle, ...value };
}

function processChunk(xml) {
  const meta = chunkMeta(xml);
  if (!meta) return;

  if (meta.name === 'Internal::Initial Contents') {
    const id = resourceValue(xml, 'id');
    const buffer = xml.match(/<buffer name="ResourceContents"[^>]*>(\d+)<\/buffer>/)?.[1];
    const byteLength = Number(xml.match(/<buffer name="ResourceContents"[^>]*byteLength="(\d+)"/)?.[1]);
    if (id && buffer) initialContents.set(id, { blob: buffer.padStart(6, '0'), byteLength });
  }

  if (meta.name.includes('CreateShaderResourceView')) {
    const dst = parsePortableHandle(xml, 'dst');
    const resource = resourceValue(xml, 'Resource');
    if (dst) descriptors.set(key(dst.heap, dst.index), {
      type: 'SRV', resource,
      format: xml.match(/<enum name="Format"[^>]*string="([^"]+)"/)?.[1],
      dimension: xml.match(/<enum name="ViewDimension"[^>]*string="([^"]+)"/)?.[1],
      chunk: meta.index,
    });
  }

  if (meta.name.includes('CopyDescriptors')) {
    const pairs = [...xml.matchAll(/<struct name="dst"[^>]*>([\s\S]*?)<\/struct>[\s\S]*?<struct name="src"[^>]*>([\s\S]*?)<\/struct>/g)];
    for (const pair of pairs) {
      const dst = { heap: resourceValue(pair[1], 'heap'), index: Number(uintValue(pair[1], 'index')) };
      const src = { heap: resourceValue(pair[2], 'heap'), index: Number(uintValue(pair[2], 'index')) };
      descriptors.set(key(dst.heap, dst.index), { source: src, chunk: meta.index });
    }
  }

  const list = commandList(xml);
  if (!list) return;
  if (meta.name.endsWith('::Reset')) {
    states.delete(list);
    return;
  }
  const state = stateFor(list);
  if (meta.name.endsWith('::SetPipelineState')) state.pipelineState = resourceValue(xml, 'pPipelineState');
  if (meta.name.endsWith('::SetGraphicsRootSignature')) state.rootSignature = resourceValue(xml, 'pRootSignature');
  if (meta.name.endsWith('::SetGraphicsRootDescriptorTable')) {
    const root = uintValue(xml, 'RootParameterIndex');
    const base = parsePortableHandle(xml, 'BaseDescriptor');
    state.tables[root] = base;
  }
  if (meta.name.endsWith('::SetGraphicsRootConstantBufferView')) {
    const root = uintValue(xml, 'RootParameterIndex');
    state.cbvs[root] = { buffer: resourceValue(xml, 'Buffer'), offset: Number(uintValue(xml, 'Offset')) };
  }
  if (meta.name.endsWith('::IASetIndexBuffer')) {
    state.indexBuffer = {
      buffer: resourceValue(xml, 'Buffer'), offset: Number(uintValue(xml, 'Offset')),
      size: Number(uintValue(xml, 'SizeInBytes')),
      format: xml.match(/<enum name="Format"[^>]*string="([^"]+)"/)?.[1],
    };
  }
  if (meta.name.endsWith('::IASetVertexBuffers')) state.vertexBuffers = { chunk: meta.index };
  if (meta.name.endsWith('::DrawIndexedInstanced') && Number(uintValue(xml, 'IndexCountPerInstance')) === targetIndexCount) {
    draws.push({ chunk: meta.index, commandList: list, state: cloneState(state) });
  }
}

const input = createInterface({ input: createReadStream(xmlPath), crlfDelay: Infinity });
let chunk = '';
let inChunk = false;
let captureChunk = false;
let activeChunkName = '';
for await (const line of input) {
  if (!inChunk) {
    if (!line.includes('<chunk ')) continue;
    inChunk = true;
    const name = line.match(/name="([^"]+)"/)?.[1] ?? '';
    activeChunkName = name;
    const chunkLength = Number(line.match(/length="(\d+)"/)?.[1] ?? 0);
    captureChunk = (name === 'Internal::Initial Contents' && chunkLength <= 8 * 1024 * 1024) ||
      name.includes('CreateShaderResourceView') || name.includes('CopyDescriptors') ||
      ['Reset', 'SetPipelineState', 'SetGraphicsRootSignature', 'SetGraphicsRootDescriptorTable',
        'SetGraphicsRootConstantBufferView', 'IASetIndexBuffer', 'IASetVertexBuffers',
        'DrawIndexedInstanced'].some((suffix) => name.endsWith(`::${suffix}`));
  }
  if (captureChunk) {
    chunk += `${line}\n`;
    if (chunk.length > 64 * 1024 * 1024) throw new Error(`비정상 대형 chunk: ${activeChunkName}`);
  }
  if (line.includes('</chunk>')) {
    if (captureChunk) processChunk(chunk);
    chunk = '';
    inChunk = false;
    captureChunk = false;
    activeChunkName = '';
  }
}

// 초기 descriptor heap snapshot은 수백 MB짜리 단일 chunk다. 전체를 버퍼링하지 않고
// draw가 실제로 참조한 source handle만 두 번째 스트리밍 패스로 해석한다.
const sourceDescriptorKeys = new Set([...descriptors.values()]
  .filter((value) => value.source)
  .map((value) => key(value.source.heap, value.source.index)));
for (const draw of draws) {
  for (const base of Object.values(draw.state.tables)) {
    for (let slot = 0; slot < 8; slot += 1) sourceDescriptorKeys.add(key(base.heap, base.index + slot));
  }
}
const descriptorInput = createInterface({ input: createReadStream(xmlPath), crlfDelay: Infinity });
let descriptorBlock = '';
let descriptorDepth = 0;
for await (const line of descriptorInput) {
  if (!descriptorBlock) {
    if (!line.includes('<struct typename="D3D12Descriptor"')) continue;
    descriptorBlock = `${line}\n`;
    descriptorDepth = 1;
    continue;
  }
  descriptorBlock += `${line}\n`;
  descriptorDepth += (line.match(/<struct(?:\s|>)/g) ?? []).length;
  descriptorDepth -= (line.match(/<\/struct>/g) ?? []).length;
  if (descriptorDepth > 0) continue;
  const heap = resourceValue(descriptorBlock, 'heap');
  const index = Number(uintValue(descriptorBlock, 'index'));
  const descriptorKey = key(heap, index);
  if (sourceDescriptorKeys.has(descriptorKey)) {
    descriptors.set(descriptorKey, {
      type: descriptorBlock.match(/<enum name="type"[^>]*string="([^"]+)"/)?.[1],
      resource: resourceValue(descriptorBlock, 'Resource'),
      format: descriptorBlock.match(/<enum name="Format"[^>]*string="([^"]+)"/)?.[1],
      dimension: descriptorBlock.match(/<enum name="ViewDimension"[^>]*string="([^"]+)"/)?.[1],
      filter: descriptorBlock.match(/<enum name="Filter"[^>]*string="([^"]+)"/)?.[1],
      addressU: descriptorBlock.match(/<enum name="AddressU"[^>]*string="([^"]+)"/)?.[1],
      addressV: descriptorBlock.match(/<enum name="AddressV"[^>]*string="([^"]+)"/)?.[1],
      addressW: descriptorBlock.match(/<enum name="AddressW"[^>]*string="([^"]+)"/)?.[1],
      mipLodBias: Number(descriptorBlock.match(/<float name="MipLODBias"[^>]*>([^<]+)<\/float>/)?.[1]),
      sourceReceipt: 'initial-descriptor-heap',
    });
  }
  descriptorBlock = '';
  descriptorDepth = 0;
}

if (draws.length === 0) {
  process.stderr.write(`IndexCount=${targetIndexCount} draw를 찾지 못했습니다.\n`);
  process.exit(1);
}
for (const draw of draws) {
  draw.state.tableDescriptors = {};
  for (const [root, base] of Object.entries(draw.state.tables)) {
    draw.state.tableDescriptors[root] = Array.from({ length: 8 }, (_, slot) =>
      resolveDescriptor({ heap: base.heap, index: base.index + slot }));
  }
  for (const cbv of Object.values(draw.state.cbvs)) {
    if (initialContents.has(cbv.buffer)) cbv.initialContents = initialContents.get(cbv.buffer);
  }
}

const sidecarPath = xmlPath.endsWith('.zip') ? xmlPath.slice(0, -4) : null;
if (sidecarPath && existsSync(sidecarPath)) {
  const blobNames = [...new Set(draws.flatMap((draw) => Object.values(draw.state.cbvs)
    .map((cbv) => cbv.initialContents?.blob)
    .filter(Boolean)))];
  const extractRoot = mkdtempSync(join(tmpdir(), 'satisfactory-ops-renderdoc-'));
  try {
    if (blobNames.length) execFileSync('tar', ['-xf', sidecarPath, '-C', extractRoot, ...blobNames]);
    for (const draw of draws) {
      for (const [rootParameter, cbv] of Object.entries(draw.state.cbvs)) {
        const blobPath = cbv.initialContents ? join(extractRoot, cbv.initialContents.blob) : null;
        if (!blobPath || !existsSync(blobPath)) continue;
        const bytes = readFileSync(blobPath);
        if (cbv.offset + 48 > bytes.length) continue;
        cbv.float4 = Array.from({ length: 3 }, (_, register) => Array.from({ length: 4 }, (_, component) =>
          bytes.readFloatLE(cbv.offset + register * 16 + component * 4)));
        const [register0, register1] = cbv.float4;
        if (Math.abs(register0[0] - 30) < 1e-6 && Math.abs(register0[1] - 0.3) < 1e-5 &&
            register1[0] === 1 && register1[1] === 1 && register1[2] === 1 && register1[3] === 3) {
          draw.state.materialCbuffer = {
            rootParameter: Number(rootParameter),
            resource: Number(cbv.buffer),
            offset: cbv.offset,
            registers: cbv.float4,
            sourceBlob: basename(blobPath),
          };
        }
      }
      if (!draw.state.materialCbuffer) throw new Error(`material cb2를 복구하지 못했습니다: draw ${draw.chunk}`);
    }
  } finally {
    rmSync(extractRoot, { recursive: true, force: true });
  }
}
const result = { xmlPath, targetIndexCount, draws };
const resultText = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) writeFileSync(outputPath, resultText);
process.stdout.write(resultText);
