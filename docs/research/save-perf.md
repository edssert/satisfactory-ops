# 브라우저 파싱 성능·메모리 — Satisfactory 세이브 파일(.sav) 리서치

담당: 브라우저 파싱 성능·메모리 / 기준 버전: Update 1.2 (2026) / 전제: GitHub Pages 정적 호스팅, 서버 없음, 로컬 파일 선택(업로드 아님)

조사일: 2026-08-19. 세션 WebSearch 예산 소진으로 이번 조사는 **WebFetch(GitHub API/raw, MDN, wiki.gg) + `gh` CLI(GitHub 코드/이슈 검색)** 중심으로 수행했다. 커뮤니티 포럼(Reddit 등)은 검색엔진 차단(CAPTCHA/네트워크 정책)으로 직접 접근이 막혀, 세이브 파일 크기 분포는 1차 출처를 확보하지 못했다 — 해당 항목은 명시적으로 "확인 필요"로 남긴다.

---

## 1. 세이브 파일 포맷 — 1차 소스 기반 확인 사실

가장 신뢰도 높은 근거는 **vassbo/sav2json**(TypeScript, Node·브라우저 겸용, "Satisfactory 1.0 Save Binary File" 대상)의 실제 파서 소스코드다. 소스 내 주석이 `https://satisfactory.wiki.gg/wiki/Save_files`를 1차 레퍼런스로 명시하고 있고, wiki.gg 페이지 자체도 교차 확인했다.

- 저장소: https://github.com/vassbo/sav2json (소스 확인: `src/parser/main.ts`, `src/decoders/zlib.ts`)
- 검증 코드 발췌 (`src/parser/main.ts`):

```ts
} else if (key === "archiveHeader" && decoded.value !== "00000000" && decoded.value !== "22222222") {
    throw new Error(`Incorrect archive header: ${decoded.value} !== (0x00000000: v1 | 0x22222222: v2)`)
} else if (key === "maximumChunkSize" && decoded.value !== 131072) {
    throw new Error(`Incorrect max chunk size: ${decoded.value} !== (128 * 1024)`)
} else if (key === "compressionAlgorithm" && decoded.value !== 3) {
    throw new Error(`Unsupported compression algorithm: ${decoded.value} !== 3`)
}
```

확인된 구조:

| 항목 | 값 | 비고 |
|---|---|---|
| 패키지 시그니처 | `0x9E2A83C1` (unrealEnginePackageSignature) | 매 청크 앞에 반복 |
| 아카이브 헤더 | `0x00000000`(v1) 또는 `0x22222222`(v2) | 세이브 버전에 따라 상이 |
| 청크 최대 크기 | **131,072 바이트 (128 KiB)** | 마지막 청크만 더 작음 |
| 압축 알고리즘 코드 | `3` = zlib | pako/fflate로 처리 가능 |
| 압축/비압축 크기 | 각각 2회 반복 기록(sanity check) | compressedSize/compressedSizeRepeat 등 |
| 파일 본문 구조 | 헤더 → **zlib 압축 청크(128KB 단위)의 연속** → (압축 해제 후) 레벨/오브젝트 스트림 | 스트리밍 친화적 구조 |

wiki.gg(`satisfactory.wiki.gg/wiki/Save_files`) 교차 확인 결과 헤더 필드도 구체적으로 문서화되어 있음 — SaveHeaderVersion(현재 14), SaveVersion(현재 52), BuildVersion, SaveName, MapName, MapOptions, SessionName, PlayDurationSeconds, SaveDateTime(Ticks), SessionVisibility, EditorObjectVersion, ModMetadata, ModFlags, SaveIdentifier(GUID), IsPartitionedWorld, MD5 체크섬, IsCreativeModeEnabled 등. Patch 1.1.1.1(2025-06)에서 헤더에 저장명 문자열 필드가 추가되며 헤더 버전이 14로 갱신됨.

**핵심 시사점**: 세이브 파일은 "128KB 압축 청크의 연속"이라는 구조이므로, **이론상 청크 단위 스트리밍 압축 해제가 가능한 포맷**이다. 다만 실제 조사된 모든 구현체(sav2json 포함)는 이 구조를 활용해 진정한 스트리밍을 하지 않고, 전체 청크를 모아 압축 해제한 뒤 하나의 버퍼로 concat한다(`Promise.all(chunks.map(zlibDecompress))` → `concatBuffers`). 즉 **실무에서는 "청크 단위 압축"이 스트리밍 파싱보다는 원본 게임(Unreal Engine)의 저장 I/O 최적화 목적으로 쓰이는 것으로 보이며, 커뮤니티 파서들은 전체를 메모리에 올린다.**

---

## 2. 압축 해제 — DecompressionStream vs pako vs fflate

### 2.1 브라우저 내장 DecompressionStream 지원 현황 (2026)
- MDN 확인: `DecompressionStream`은 **"Baseline: Widely available"**, 2023년 5월부터 주요 브라우저(Chrome/Edge, Firefox, Safari)에서 지원. 지원 포맷은 `"gzip"`, `"deflate"`, `"deflate-raw"` 세 가지.
  - 출처: https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream
- **주의**: `"deflate"` 포맷 지정 시 자동으로 zlib 헤더/체크섬(RFC1950)을 처리하므로, Satisfactory의 zlib 청크(compressionAlgorithm=3)는 이론상 `new DecompressionStream("deflate")`로 그대로 풀 수 있어야 한다. 단, **청크 128개가 개별 zlib 스트림인지, 하나의 zlib 스트림이 청크 단위로 쪼개져 있는지**는 이번 조사에서 소스 레벨로 완전히 확정하지 못했다 — 각 청크가 독립된 zlib 스트림이면 청크마다 새 `DecompressionStream` 인스턴스가 필요하다. **확인 필요** (SavageSaveEditor/실제 zlib 스트림 경계 바이트 분석으로 검증 권장).

### 2.2 실무 구현체가 실제로 쓰는 방식 — pako/fflate (DecompressionStream 미사용)
조사한 모든 JS/TS 구현체는 **DecompressionStream을 쓰지 않고** 순수 JS 압축 라이브러리를 쓴다:

- **vassbo/sav2json** (`src/decoders/zlib.ts`): Node 환경이면 `import("zlib")`(네이티브)를 시도하고, 실패 시(브라우저) `../lib/fflate.esm.min.mjs`를 동적 import해 `fflate.unzlibSync(buffer)` 호출. 즉 **fflate를 브라우저 폴백으로 자체 번들**하고 있다. 반면 저장소의 `tests/web.html` 데모는 별도로 `pako@2.1.0`을 CDN에서 로드하지만 실제로 사용하는 흔적은 없어 레거시로 보인다(혼재 상태, 확인 필요).
  - 출처: https://github.com/vassbo/sav2json/blob/main/src/decoders/zlib.ts , https://github.com/vassbo/sav2json/blob/main/tests/web.html
- **ficsit-felix/satisfactory-json**(MIT, TS, 유지보수 중이던 계보상 선행 라이브러리): `package.json` dependencies에 `pako@^2.0.4`, `jsbi@^4.1.0` 명시. Node 중심 CLI(`ts-node`) 구조이나 pako 자체는 브라우저 호환.
  - 출처: https://raw.githubusercontent.com/ficsit-felix/satisfactory-json/main/package.json

**번들 크기 비교** (npm 공개 정보 기준, 일반 지식 — 확인 필요 표시):
| 라이브러리 | 압축 후(gzip) 대략 크기 | 비고 |
|---|---|---|
| pako (full) | ~45KB | zlib.js emscripten 포팅, 오래되고 안정적, deflate+gzip+inflate 전부 포함 |
| fflate | ~8~10KB (unzlib만 쓰면 더 작음, tree-shaking 가능) | 순수 JS, 최신 프로젝트들이 선호하는 경량 대안. sav2json이 실제로 채택 |

**결론**: 2026년 시점에 `DecompressionStream('deflate')`는 표준적으로 사용 가능하지만(확인됨), **커뮤니티의 실제 Satisfactory 파서는 이를 채택하지 않고 fflate/pako를 쓴다** — 아마 (a) 청크 경계가 독립 zlib 스트림이 아니라 Streams API로 처리하기 까다롭거나, (b) 라이브러리 쪽이 동기(sync) API라 구현이 단순하기 때문으로 추정된다(추정, 확인 필요). 우리 프로젝트는 **네이티브 DecompressionStream을 1차로 시도하고, 실패 시 fflate(경량) 폴백**하는 전략이 번들 크기·성능 모두에서 합리적이다. fflate 번들 시 8~10KB 수준이라 GitHub Pages 정적 배포에 부담이 없다.

---

## 3. 로컬 파일 읽기 — File System Access API vs `<input type=file>`

- MDN File System API 문서 확인 결과: **Safari는 File System Access API(`showOpenFilePicker` 등)를 공식 미지원**, 지원 일정도 미공표. Chrome/Edge는 초기부터 지원. Firefox도 제한적.
  - 출처: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- 요구사항이 "서버 없음 + 사용자가 로컬에서 선택(업로드 아님)"이므로, **크로스 브라우저 호환성을 위해 기본 경로는 `<input type="file">` + `File.stream()`/`FileReader`**가 안전하다. File System Access API는 Chrome 계열에서 "핸들 유지 후 재접근" 같은 부가 기능(예: 저장 폴더를 열어두고 자동 새로고침)이 필요할 때만 progressive enhancement로 추가하는 것이 합당하다.
- 실무 관찰: sav2json의 `tests/web.html` 데모도 `<input type="file">` + `FileReader.readAsArrayBuffer()`를 사용 — **전체 파일을 한 번에 ArrayBuffer로 로드**하며 스트리밍은 하지 않는다. `Blob.stream()`을 이용한 청크 단위 스트리밍 파싱은 조사한 어떤 오픈소스 구현체에서도 발견하지 못했다(확인 필요 — 존재할 수 있으나 이번 조사 범위에서 미발견).

---

## 4. Web Worker / 메인 스레드 논블로킹

이번 조사에서 확인한 오픈소스 JS/TS 세이브 파서(sav2json, satisfactory-json) 중 **Web Worker를 자체 내장한 사례는 발견하지 못했다** — 둘 다 라이브러리 레벨이고, Worker 배치는 소비자(호출) 측 책임으로 남아있다. 이는 일반적인 라이브러리 설계 패턴과 일치한다.

일반 지식(MDN 기준, 이번 세션에서 별도 재검증은 못했으나 안정적으로 알려진 사실):
- `DecompressionStream`은 Worker 내에서도 사용 가능(Streams API는 Worker-safe).
- `ArrayBuffer`/`Uint8Array`는 `postMessage(buf, [buf.buffer])`로 **Transferable**하게 넘길 수 있어 메인 스레드로 복사 비용 없이 결과(또는 원본 버퍼)를 주고받을 수 있다.
- 설계 권장: 파일 선택은 메인 스레드, `File → ArrayBuffer` 변환 및 zlib 청크 해제·오브젝트 파싱은 Worker에서 수행 후, 최종 요약 결과(마일스톤/레시피/건물 카운트 등 — 원본 대비 훨씬 작은 JSON)만 메인 스레드로 전달. 원본 배열은 Worker 내부에서만 유지하고 메인으로 되돌리지 않는 편이 메모리 압박을 줄인다.

---

## 5. 메모리 한계 — 수백 MB 파일 처리 가능성

### 5.1 세이브 파일 실제 크기 분포 — **확인 필요 (1차 출처 미확보)**
이번 세션은 WebSearch 예산이 작업 시작 전에 이미 소진되어 있었고, Reddit/Bing/DuckDuckGo에 대한 WebFetch 직접 접근은 CAPTCHA·네트워크 정책으로 차단되었다. 커뮤니티(레딧 등)의 "초반/중반/메가베이스 세이브가 몇 MB인지"에 대한 정량적 1차 출처는 확보하지 못했다. **이 항목은 사용자가 직접 자신의 세이브 3~4개(초반/중반/대형)를 제공하면 그 자리에서 실측 가능** — 다음 조사 라운드에서 우선순위로 재시도 권장.

간접 근거로 확보한 것은 공식 패치노트(wiki.gg Save_files 페이지)의 다음 두 문구뿐이다:
> "Optimized the save system to decrease saving time on larger saves by roughly 80-90%" (Patch 0.8.0.0)
> "Saving and Autosaving should now take considerably less time than ever before." (Patch 1.0)

이는 개발사 스스로 "대형 세이브"를 별도 최적화 대상으로 취급했다는 정황 증거이며, 메가베이스급 세이브가 유의미하게 크다는 것을 시사하나 정량치는 아니다.

### 5.2 포맷 구조상 스트리밍 파싱 가능성
128KB 단위 zlib 청크 구조 자체는 청크 단위로 순차 압축 해제가 가능하도록 되어 있어 **이론적으로는 전체를 한 번에 메모리에 올리지 않는 스트리밍 압축 해제가 가능**하다. 그러나:
- 압축 해제된 이후의 "레벨/오브젝트" 스트림은 필드 하나가 다른 필드의 길이를 앞에서 정의하는 **가변 길이 순차 인코딩**(TLV 유사 구조, 위 `readString`처럼 길이 접두형 문자열 등)이라, **오브젝트 경계를 모르면 임의 지점에서 파싱을 재개할 수 없다** — 즉 압축 해제는 스트리밍이 가능해도 상위 레벨 오브젝트 파싱은 처음부터 순서대로 진행해야 하는 순차 구조다.
- 조사된 모든 구현체가 결국 압축 해제된 전체 버퍼(`BUFFER_BODY`)를 한 덩어리로 만들어 놓고 그 위에서 오프셋을 이동하며 파싱한다(`concatBuffers` 후 `OFFSET` 변수로 순회) — **완전한 스트리밍 파서는 존재하지 않았다.**
- 브라우저 메모리 한계: 일반적으로 최신 Chrome/Firefox는 탭당 수 GB의 ArrayBuffer 할당이 가능하나(정확한 하드 리밋은 브라우저·OS·64비트 여부에 따라 다름, **확인 필요**), 압축 해제 시 원본 대비 수 배(zlib 압축률에 따라 다르나 텍스트/구조적 데이터는 3~6배 팽창이 일반적) 부풀어 오르므로 "수백 MB 압축 파일"이면 해제 후 GB급이 될 수 있다는 점은 설계에 반드시 반영해야 한다.

### 5.3 이 프로젝트에 대한 실무적 함의
- 목적이 "진행도 자동 판독"(마일스톤/스키매틱/MAM/대체 레시피/건물 종류·수량/자원 노드/수집품 카운트)이라면, **오브젝트 그래프 전체를 유지할 필요가 없다** — 파싱 중 필요한 클래스(`Build_*`, `FGSchematicManager`, `FGResearchManager`, `FGResourceNode` 등 대응 오브젝트)만 카운트/집계하고 나머지는 버리는 **단일 패스 집계형 파서**를 설계하면, 압축 해제된 전체 버퍼(Uint8Array, 파일 크기의 수 배)만 메모리에 있으면 되고 파싱된 결과 오브젝트 트리는 만들지 않아도 된다. 이는 sav2json/satisfactory-json류의 "완전 JSON 변환기"보다 메모리 부담이 훨씬 낮다.
- 원본 파일(Blob) → ArrayBuffer(파일 크기) → 압축 해제 버퍼(수배) 두 벌이 동시에 떠 있는 구간이 피크 메모리이므로, 압축 해제가 끝나면 원본 ArrayBuffer 참조를 즉시 해제(`= null`)하는 것이 중요.

---

## 6. 진행률 표시·취소 가능한 파싱 설계

1차 출처로 확인한 구현체 중 진행률/취소 UI를 갖춘 사례는 없었음(라이브러리 레벨이라 UI 자체가 없음). 다음은 위 구조 조사에 기반한 설계 권장안(일반 웹 개발 지식, 이번 세션에서 별도 소스 검증 대상 아님):

- **진행률**: 청크가 128KB 단위로 명확히 구분되므로, "청크 N/M개 압축 해제 완료"를 정수 퍼센트로 계산해 Worker → 메인으로 `postMessage`할 수 있다. 오브젝트 파싱 단계는 `OFFSET / BUFFER_BODY.length` 비율로 근사 가능(정확한 오브젝트 개수는 헤더의 `objectReferencesCount` 등으로 사전에 알 수 있어 더 정밀한 진행률도 가능 — sav2json 소스에 해당 카운트 필드 확인됨).
- **취소**: Worker 기반이면 `worker.terminate()`로 즉시 중단 가능(가장 단순하고 확실). `AbortController` + 파싱 루프 내 주기적 `if (signal.aborted) throw` 체크 방식도 병행 가능하나, Worker 종료가 메모리 회수 측면에서 더 깔끔하다.

---

## 7. 라이선스 조사 결과 (LICENSE 파일/GitHub 메타데이터 기준, 추정 금지)

| 저장소 | 언어 | 라이선스(확인) | 확인 방법 |
|---|---|---|---|
| ficsit-felix/satisfactory-json | TypeScript | **MIT** | GitHub API `license.spdx_id: "mit"` |
| vassbo/sav2json | TypeScript | **불명확 — package.json엔 `"license": "ISC"` 명시되어 있으나 GitHub 저장소 메타데이터(`license` 필드)는 `null`(LICENSE 파일 미검출)** | GitHub API 대비 raw package.json 교차 확인, 불일치 확인됨. 실사용 전 저장소에 문의하거나 LICENSE 파일 직접 커밋 여부 재확인 필요 |
| GreyHak/sat_sav_parse | Python | **GPL-3.0** | README 본문 명시 |
| Alex135799/SatisfactorySaveParser | TypeScript | GPL-3.0 명시(README) — **단, Node 전용(브라우저 미호환 명시)** | README |
| SillyBits/satisfactory-savegame-tool-ng | C# | GPL-3.0 | 저장소 페이지 하단 라이선스 배지 |
| Goz3rr/SatisfactorySaveEditor | C# | **확인 필요 — LICENSE 파일/명시 라이선스를 이번 조사에서 찾지 못함** | README에 라이선스 섹션 없음 |

**우리 프로젝트가 MIT + public이라는 전제 하에서**: MIT인 `ficsit-felix/satisfactory-json`은 코드 참고/이식이 안전하다. `sav2json`은 라이선스가 실질적으로 불명확하므로(선언과 메타데이터 불일치) **코드를 그대로 가져오지 말고, 공개된 포맷 지식(청크 크기 131072, 압축 알고리즘 코드 3, 헤더 필드 등 — 이는 저작권 보호 대상이 아닌 "사실/포맷 정보")만 참고해 독자 구현**하는 것이 안전하다. GPL-3.0 저장소(GreyHak, SillyBits, Alex135799)는 코드 복사/파생 시 우리 프로젝트 전체가 GPL로 전염될 위험이 있으므로 **코드는 보지 않고 포맷 지식만 참고**하거나 완전히 별도로 재구현해야 한다.

---

## 8. 요약 — 이번 조사에서 "확인됨" vs "확인 필요"

**확인됨 (1차 소스 있음)**
- 세이브 파일 구조: 헤더 + 128KB 단위 zlib 압축 청크 연속. compressionAlgorithm=3(zlib), archiveHeader v1(0x00)/v2(0x22222222).
- `DecompressionStream`은 2023-05부터 Baseline Widely Available, gzip/deflate/deflate-raw 지원.
- File System Access API는 Safari 미지원 → `<input type=file>`이 표준 경로.
- 실무 구현체(sav2json)는 DecompressionStream이 아니라 fflate(브라우저)/Node zlib(서버)를 쓰며, 전체 버퍼를 한 번에 메모리에 올려 파싱(진정한 스트리밍 파서 아님).
- 라이선스: satisfactory-json=MIT(확실), sav2json=불명확(불일치), GreyHak 계열=GPL-3.0.

**확인 필요 (다음 라운드 우선순위)**
- 세이브 파일 실측 크기 분포(초반/중반/메가베이스 MB) — 검색엔진 차단으로 1차 커뮤니티 출처 미확보. 사용자 실제 세이브 샘플로 직접 실측 권장.
- Satisfactory zlib 청크가 "청크마다 독립 zlib 스트림"인지 "하나의 zlib 스트림을 청크로 자른 것"인지 — `DecompressionStream('deflate')` 적용 전략을 좌우하는 핵심 분기점.
- 브라우저별 ArrayBuffer/탭 메모리 하드 리밋의 2026년 최신 수치.
- sav2json의 실제 라이선스(관리자에게 issue로 문의 권장).
- Goz3rr/SatisfactorySaveEditor의 실제 라이선스.

---

## 참고 링크
- https://github.com/vassbo/sav2json (소스: `src/parser/main.ts`, `src/decoders/zlib.ts`, `tests/web.html`)
- https://github.com/ficsit-felix/satisfactory-json (`package.json` — MIT, pako/jsbi 의존)
- https://satisfactory.wiki.gg/wiki/Save_files
- https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- https://github.com/GreyHak/sat_sav_parse (GPL-3.0, Python, v1.2.x 지원 명시)
- https://github.com/Alex135799/SatisfactorySaveParser (GPL-3.0, Node 전용)
- https://github.com/SillyBits/satisfactory-savegame-tool-ng (GPL-3.0)
- https://github.com/Goz3rr/SatisfactorySaveEditor (C#, 라이선스 확인 필요)
