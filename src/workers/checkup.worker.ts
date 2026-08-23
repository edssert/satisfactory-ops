/// <reference lib="webworker" />

import { diagnose } from '../lib/diagnose.ts';
import { readFactory, type CheckupCatalog } from '../lib/save-factory.ts';

interface Request {
  id: number;
  buffer: ArrayBuffer;
  catalog: CheckupCatalog;
  fileName: string;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, buffer, catalog, fileName } = event.data;
  try {
    const model = await readFactory(buffer, catalog, fileName);
    self.postMessage({ id, ok: true, model, findings: diagnose(model, catalog) });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: `지원하지 않는 세이브 버전이거나 파일이 손상됐습니다 · ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};
