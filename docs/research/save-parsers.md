# 세이브 파서(.sav) 전수 조사 — 라이선스 중심

조사일: 2026-08-19 (기준 버전: Satisfactory U1.2, 2026년 시점 최신 패치 라인)

목표: GitHub Pages 정적 호스팅(서버 없음, 파일은 사용자가 로컬에서 File API로 선택)에서 브라우저 내 클라이언트 사이드로 `.sav`를 파싱해 진행도(마일스톤/스키매틱, MAM 연구, 대체 레시피, 건물 종류·수량, 점유 자원 노드, 하드드라이브/슬러그/소머슬룹 수집 수)를 읽어야 함. 우리 저장소는 **public + MIT**이므로 GPL 계열/라이선스 없음/재배포 금지 조항이 있는 코드는 그대로 가져다 쓸 수 없다.

방법: GitHub REST API(`gh api`)로 각 저장소의 `license.spdx_id`, `pushed_at`을 실측하고, **spdx_id가 표준 형식이 아니거나 의심스러운 경우 LICENSE 파일 원문을 직접 읽어 확인**했다(추정 금지 원칙). npm 패키지는 registry.npmjs.org에서 실측.

---

## 1. 결론 — 최우선 후보

**[`@etothepii/satisfactory-file-parser`](https://www.npmjs.com/package/@etothepii/satisfactory-file-parser)** (GitHub: [etothepii4/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser))

| 항목 | 값 |
|---|---|
| 언어 | TypeScript (빌드 산출물 `build/index.js` + `.d.ts`) |
| 라이선스 | **MIT** — `LICENCE.md` 원문 확인 완료 (Copyright (c) 2021-2025 etothepii), package.json `license: "MIT"`와 일치 |
| 최근 커밋(push) | 2026-07-26 — 활발히 유지보수 중 |
| U1.2 지원 | README 표에 `U1.2 ✅ compatible` 명시. U1.0/U1.1/U8도 호환, U5 이하는 비호환 명시 |
| 브라우저 사용 가능 여부 | **가능.** README에 "The examples listed here are Node.js. Should work in browser as well." 명시, `ReadableStreamParser`가 WHATWG 스트림(브라우저 기본 스트림 API) 사용을 전제로 설계됨 |
| npm 패키지명 | `@etothepii/satisfactory-file-parser`, 최신 버전 `4.1.2` |
| 주간 다운로드 | **1,400회** (2026-08-09~08-15, npmjs API 실측) |
| 런타임 의존성 | `pako` (^2.1.0) 단 하나 — 순수 JS zlib 구현으로 브라우저 호환. Node 전용 API(`fs` 등)는 예제 코드에서만 쓰이고 라이브러리 코어에는 없음 |
| 패키지 크기 | unpackedSize ≈ 8.66MB / 1,028 files (build 산출물 + 소스맵 + 문서 포함 추정, `files` 필드 제한 없이 배포됨 — 실제 사용 시 tree-shaking/번들러의 dead-code 제거로 실사용 크기는 이보다 작을 것. 정확한 gzip tarball 크기는 확인 실패, **확인 필요**) |
| 기능 | Save(`.sav`) + Blueprint(`.sbp`/`.sbpcfg`) **읽기·쓰기 양방향**, 전체 오브젝트/액터를 JSON으로 파싱. 마일스톤/스키매틱/연구/레시피/건물/자원 노드 점유 여부는 세이브 내 액터 데이터(`FGSchematicManager`, `FGResearchManager`, `FGBuildableSubsystem`류 오브젝트)에 들어있으므로 **파싱 자체는 이 라이브러리가 해결, 의미 추출(어떤 클래스명이 마일스톤인지 매핑)은 우리가 추가로 구현 필요** |

**판정: 이 라이브러리를 채택하는 것이 명백히 최선.** MIT 라이선스가 LICENSE 원문으로 확인됐고, U1.2를 공식 지원하며, npm에 배포돼 있고, pako 외 의존성이 없어 브라우저 번들링(esbuild/vite/webpack 등 GitHub Pages 정적 빌드 파이프라인)에 그대로 넣을 수 있다. 실사용 전 확인할 점: (1) 실제로 브라우저(Node 없이)에서 빌드해보고 `Buffer`/`fs` polyfill이 필요 없는지 스모크 테스트, (2) 8.66MB unpacked 크기 중 번들에 실제로 들어가는 양(트리쉐이킹 후) 측정.

---

## 2. 전수 조사표

라이선스가 표준 SPDX로 잡히지 않은 항목(`license: null`/`NOASSERTION`)은 LICENSE 파일 원문을 직접 열어 재확인했다(비고에 기재).

| 저장소 | 언어 | 라이선스(실측) | 최근 push | U1.2 지원 | 브라우저 사용 | 비고 |
|---|---|---|---|---|---|---|
| [etothepii4/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser) | TypeScript | **MIT** (원문 확인) | 2026-07-26 | ✅ 명시 | ✅ 가능, npm 배포 | **1순위 채택 후보** |
| [GreyHak/sat_sav_parse](https://github.com/GreyHak/sat_sav_parse) | Python | **GPL-3.0** | 2026-08-15(가장 최신) | ✅ v1.2.0~1.2.2.1 명시 | ❌ 서버/데스크톱 전용, GPL이라 MIT 저장소에 코드 이식 불가 | 가장 활발하고 가장 최신 1.2 대응이지만 **라이선스 문제로 채택 불가**. 포맷 문서 참고용으로만 사용 가능(코드 복사 금지) |
| [R3dByt3/SatisfactorySaveNet](https://github.com/R3dByt3/SatisfactorySaveNet) | C# | **MIT** (원문 확인) | 2026-07-06 | 명시 없음(버전 표 없음), NuGet 배포 중 | ❌ C#(.NET) — Blazor WASM으로 포팅하지 않는 한 정적 JS 페이지에 직접 못 씀 | 코드/포맷 이해용으로만 참고 가치. .NET 8 AOT/Blazor WASM 빌드 고려 시 재검토 여지 있음(확인 필요) |
| [erp-for-factory-games/Satisfactory](https://github.com/erp-for-factory-games/Satisfactory) | C# | GitHub API는 `NOASSERTION`, **LICENSE 원문은 MIT 텍스트**(R3dByt3 하드포크, 저작권 표시 정정) | 2026-08-09 | 미확인 | ❌ 상동 | GitHub 라이선스 감지기가 다중 Copyright 줄 때문에 오탐한 것으로 보임. 실제로는 MIT — 단, C#이라 브라우저 직접 사용 불가는 동일 |
| [Goz3rr/SatisfactorySaveEditor](https://github.com/Goz3rr/SatisfactorySaveEditor) | C# (WPF) | **라이선스 없음**(`license: null`, LICENSE 파일 자체가 저장소에 없음) | 2024-08-17(2년 방치) | ❌ README에 "Update 6/7 is not yet supported!"가 최신 안내로 남아있음 — 1.2는커녕 6/7도 미지원 상태로 방치 | ❌ 데스크톱 WPF 앱, 라이선스도 없음 | 가장 유명(305★)하지만 **라이선스 없음 + 사실상 죽은 프로젝트**라 이중으로 채택 불가. 단 여러 Rust 크레이트가 이 프로젝트의 파싱 로직을 참고했다고 명시(MakotoE/satisfactory-save-file README) |
| [AyrA/SatisfactorySaveEditor](https://github.com/AyrA/SatisfactorySaveEditor) | C# | MIT | 2020-02-23(archived) | ❌ | ❌ | 2020년에 archived, 완전히 오래됨 |
| [ficsit-felix/satisfactory-save-format](https://github.com/ficsit-felix/satisfactory-save-format) | Python | MIT | 2019-07-14(archived) | ❌ | ❌ | 초창기(2019) 포맷 기준, U1.2와 구조가 크게 다를 것 |
| [bananasov/satisfactory-formats](https://github.com/bananasov/satisfactory-formats) | Rust | **라이선스 없음**(`license: null`) | 2024-11-08 | 미확인, README 사실상 비어있음 | Rust→WASM 컴파일 가능성은 있으나 라이선스 없어 채택 불가 | |
| [gentoid/satisfactory-save-file-parser](https://github.com/gentoid/satisfactory-save-file-parser) | Rust | MIT | 2025-01-14 | README 사실상 비어있음, 미확인 | WASM 포팅 가능성 있음(코드 미검토) | 활동 저조, 실사용 전 코드 완성도 재확인 필요 |
| [MakotoE/satisfactory-save-file](https://github.com/MakotoE/satisfactory-save-file) (crates.io: `satisfactory-save-file`) | Rust | MIT | 2021-06-03 | ❌(5년 방치, Goz3rr 로직 기반이라 그보다 오래된 포맷 기준) | WASM 포팅 이론상 가능 | 오래됨, 참고용 |
| [Kotlin: yvalmor/Satisfactory-Save-Parser](https://github.com/yvalmor/Satisfactory-Save-Parser) | Kotlin | 없음 | 2024-12-08 | 미확인 | Kotlin/JS 가능성은 있으나 라이선스 없어 채택 불가 | |
| [vassbo/sav2json](https://github.com/vassbo/sav2json) (npm: `sav2json`) | TypeScript | **ISC**(npm registry 실측, GitHub엔 LICENSE 파일 없음/404) | 2025-01-26 | ❌ README에 "Parses a Satisfactory **1.0** Save Binary File" — 1.0 기준, 1.2 지원 여부 확인 필요 | ✅ README에 브라우저 `FileReader` 예제 있음, 구조상 가능 | ISC는 MIT와 사실상 동등한 permissive 라이선스라 조건은 맞지만, **1.0 기준 이후 업데이트가 끊겨(1년+) 1.2 데이터 구조 대응이 불확실** — etothepii4 파서 대비 우선순위 낮음 |
| [AnthorNet/SC-InteractiveMap](https://github.com/AnthorNet/SC-InteractiveMap) (satisfactory-calculator.com "SCIM" 백엔드) | JavaScript | **명시적 재사용 금지** — README 원문: *"Reuse of the source code and data assets is not permitted in any case, source code is only available for educational purpose. The map is solely intended to be used on the satisfactory-calculator.com domain."* | 2026-07-23(활발) | 사실상 최신 대응 중으로 추정(비공개 확인 불가) | 저장소 자체는 webpack 기반 JS라 기술적으로는 브라우저 프로젝트이나 **라이선스 조항이 이식/포크/재배포를 명시적으로 금지** | **완전 배제.** 클라이언트 사이드인지 여부와 무관하게 코드 재사용이 계약상 불가능. satisfactory-calculator.com의 세이브 에디터 자체가 클라이언트 사이드인지는 이 README만으로는 단정 불가(**확인 필요** — 별도로 실제 페이지의 네트워크 탭을 열어 서버 업로드 여부를 확인해야 함) |
| [AnthorNet/SC-ProductionPlanner](https://github.com/AnthorNet/SC-ProductionPlanner) | JavaScript | 라이선스 없음 | 2024-10-23(정체) | 세이브 파서 아님(생산 계산기) | — | 참고 대상 아님(세이브 파싱 기능 없음) |

---

## 3. 라이선스별 채택 가능 여부 요약

| 라이선스 | 우리(MIT, public) 저장소에 코드 이식 가능? | 해당 후보 |
|---|---|---|
| MIT / ISC | ✅ 가능 (귀속 표시만 유지) | etothepii4/satisfactory-file-parser, R3dByt3/SatisfactorySaveNet, erp-for-factory-games/Satisfactory(실제로는 MIT), gentoid/satisfactory-save-file-parser, MakotoE/satisfactory-save-file, AyrA/SatisfactorySaveEditor, ficsit-felix/satisfactory-save-format, vassbo/sav2json |
| GPL-3.0 / GPL-2.0 | ❌ 코드 이식 불가(카피레프트 전이). **포맷 문서·구조 이해 목적의 참고만 가능**, 코드 복사·파생 금지 | GreyHak/sat_sav_parse |
| 라이선스 없음(all rights reserved 기본값) | ❌ 법적으로 사용 불가(저자에게 별도 허가 요청 필요) | Goz3rr/SatisfactorySaveEditor, bananasov/satisfactory-formats, yvalmor/Satisfactory-Save-Parser, Maurits825/satisfactory-savefile-parser, AnthorNet/SC-ProductionPlanner |
| 명시적 재사용 금지 조항 | ❌ 완전 배제, 라이선스 유무를 떠나 계약상 금지 | AnthorNet/SC-InteractiveMap (satisfactory-calculator.com) |

---

## 4. GreyHak/sat_sav_parse(GPL-3.0)를 "참고"로 쓸 때의 경계

이 프로젝트는 조사 시점 기준 **1.2 계열(v1.2.0.0~v1.2.2.1)을 가장 정확히, 가장 최근에(2026-08-15) 지원**하는 파서다. 매력적이지만 GPL-3.0이므로:
- 코드를 복사하거나 그대로 포팅하면 우리 저장소 전체(혹은 최소한 해당 모듈)가 GPL 전이 대상이 되어 **MIT 공개 요구사항과 충돌**한다.
- 허용되는 것: README/이슈/커밋 로그에 적힌 **포맷 설명(오프셋, 필드 순서, 압축 방식 등 "사실")** 을 우리가 독자적으로 재구현하면서 참고하는 것(사실/아이디어는 저작권 보호 대상이 아님, 클린룸 재구현). 소스 코드 자체를 읽고 옮겨적는 것(구조적 유사 포팅)은 GPL 위반 소지가 있어 지양.
- 결론: **채택 후보에서 제외**, 다만 U1.2 포맷 변경점 확인용 2차 레퍼런스로는 유용.

---

## 5. 남은 확인 필요 항목 (지어내지 않고 열어둠)

1. **satisfactory-calculator.com 세이브 에디터가 실제로 클라이언트 사이드인지** — SC-InteractiveMap README만으로는 서버 업로드 여부 불명. 실제 페이지에서 세이브를 열어보고 네트워크 요청을 관찰해야 확정 가능. (라이선스상 어차피 코드 재사용은 불가하므로 우선순위 낮음)
2. `@etothepii/satisfactory-file-parser` 4.1.2의 **실제 gzip tarball 크기**(bundlephobia API가 429로 응답, 재시도 필요) 및 **트리쉐이킹 후 실사용 번들 크기**
3. `vassbo/sav2json`의 **U1.2 데이터 구조 실제 호환 여부** — README가 "1.0" 명시, CHANGELOG/이슈 미확인
4. `gentoid/satisfactory-save-file-parser`, `bananasov/satisfactory-formats` — README가 사실상 비어 있어 **완성도/실제 파싱 범위 미확인** (라이선스 문제로 어차피 배제되거나 낮은 우선순위이므로 깊게 파지 않음)
5. R3dByt3/SatisfactorySaveNet을 **.NET 8 Blazor WASM으로 빌드해 GitHub Pages에 올리는 대안**의 실현 가능성(성능, 번들 크기) — TypeScript 후보가 이미 충분하므로 낮은 우선순위지만 완전히 배제하지는 않음

---

## 6. 최종 권장

**`@etothepii/satisfactory-file-parser` (npm, MIT, TS, U1.2 공식 지원, 주간 다운로드 1,400)를 채택**한다. 이 라이브러리로 `.sav` → JSON 파싱까지 해결하고, 마일스톤/스키매틱/연구/대체 레시피/건물/자원 노드/수집품을 골라내는 **의미 추출 레이어는 우리가 직접 작성**해야 한다(이 라이브러리는 범용 파서이지 진행도 대시보드가 아님). GPL/무라이선스/재사용 금지 후보들은 코드 이식 없이 배제하고, GreyHak/sat_sav_parse는 U1.2 포맷 변경점을 교차 검증하는 2차 참고 자료로만 (클린룸 재구현 원칙 하에) 활용한다.
