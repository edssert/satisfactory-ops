# 제품 인터페이스·가이드·품질 연구

접근일은 2026-08-21이다. 이 문서는 R-04 편집기 상호작용, R-09 랜딩·디자인·모션, R-10 지도·도감·
가이드, R-11 상태·오프라인, R-12 검증·품질의 근거를 통합한다.

## 1. 검증 질문

1. 설계판이 문서 페이지가 아니라 전문 전체 화면 도구로 동작하려면 어떤 패널·입력·상태 모델이 필요한가.
2. 가이드는 튜토리얼, 현재 단계의 행동, 게임 데이터 참조와 전략 설명을 어떻게 분리해야 하는가.
3. 지도·도감·계산기·설계판은 검색·선택·상태를 어떻게 이어야 하는가.
4. 대형 공정의 렌더·저장·Undo/Redo·오프라인을 어떤 기술로 검증해야 하는가.
5. 최신 기술과 Codex 스킬을 어떤 실제 산출물에 연결할 것인가.

## 2. 실제 배포 작업공간 비교

1440×900 헤드리스 Chromium에서 동일 날짜에 직접 렌더했다.

| 제품 | 관찰한 구조 | 적용 판단 |
|---|---|---|
| Satisfactory Tools | 전역 헤더와 문서 흐름 안의 생산 설정 패널, 페이지 스크롤 | 기능·제약 설정 기준선. 설계판 화면 밀도 기준은 아님 |
| SCIM | 전역 헤더·광고·페이지 안 지도·우측 레이어 패널 | 지도 기능 기준선. 광고 없는 더 큰 작업 면적과 명확한 레이어가 필요 |
| Masterplanner | 전체 화면 지도, 중앙 캔버스, 상단·하단 도구, 로컬 저장·Export 안내 | 전체 화면 도구와 로컬 우선 상태의 직접 참고 |
| tldraw | 뷰포트 전체 캔버스, 하단 도구, 우측 속성, 좌하단 줌, 페이지 스크롤 없음 | 고정 작업공간·팬·줌·선택·속성 배치 참고 |
| Satisfactory Layouts | 전체 화면 격자, 좌측 도구 레일, 우상단 명령·줌, 층·기계·연결 편집 | 현재 실제 배치 도구의 직접 기능·오류 기준선 |

따라서 설계판은 일반 콘텐츠 셸과 footer를 제거하고, 상단 명령·좌측 카탈로그·중앙 캔버스·우측 속성의
고정 작업공간을 기본으로 한다. 패널 내부만 스크롤하고 캔버스 배경은 팬 입력을 소유해야 한다. 이 결론은
현재 미검증 CSS 변경의 승인 근거가 아니라 파일럿 요구사항이다.

### 2.1 Satisfactory Layouts 직접 기준선

[Satisfactory Layouts](https://www.satisfactory-layouts.com/)와 작성자 u/falqoon의 2026년 공개 기록을
직접 확인했다.

- 기계 다중 선 배치, 벨트·파이프 라우팅, 다층·바닥 구멍, 선택 이동·회전·복제·미러링, 복사/붙여넣기,
  Undo/Redo, 노트, 재중앙 정렬, 블루프린트, Import/Export, 제작법 설정을 제공한다.
- 게임 단축키와 유사한 MMB 샘플, Q 메뉴, H 픽업, B/P 연결, 숫자 핫키를 사용한다.
- 연결 모드에서 해당 매체만 강조하고 다른 매체를 흐리며, 파이프가 벨트 아래 있을 때 검토를 위해
  들어 올리는 표현을 사용한다.
- Reddit 피드백에는 게임에서 가능한 기계 인접 연결이 도구의 최소 벨트 반경 때문에 불가능한 오류가
  기록됐다. 작성자는 straight 모드의 최소 반경과 기계 접속 예외를 원인으로 설명했다.
- 2026-07 사용자 피드백에는 회전 기능을 찾기 어렵다는 의견과 적층 벨트·파이프가 어렵다는 의견이 있다.

기능 존재만 비교하지 않는다. 동일 제련기→분배기→제작기 표본에서 최소 길이, 포트 예외, 회전 발견성,
층·깊이, Undo/Redo와 내보내기를 직접 수행해 점수화한다.

## 3. 무한 캔버스·그래프 기술 후보

| 후보 | 2026-08-21 근거 | 강점 | 필수 검증 |
|---|---|---|---|
| [tldraw](https://github.com/tldraw/tldraw) | 49.4k별, 활발한 SDK | 완성된 무한 캔버스·스냅·도구·이미지 내보내기 | React 중심 SDK와 Preact/도메인 계약, 생산 라이선스, 실축 기하 |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | 129.1k별, MIT | 전체 편집기, JSON·PNG·SVG, 다크·i18n | 손그림 표현 제거, 정밀 미터 좌표·대형 공정 성능 |
| [PixiJS](https://github.com/pixijs/pixijs) | 47.3k별, v8.18.1 | WebGL/WebGPU·터치·텍스트·SVG·대규모 2D | DOM 접근성·텍스트·독립 SVG와의 이중 렌더 비용 |
| [React Flow/Svelte Flow](https://github.com/xyflow/xyflow) | 36.8k별, MIT | 노드 기반 UI, 미니맵·연결·커스텀 노드 | 생산 그래프 전용 적합성, Preact 경계, 실축 배치와 분리 |
| [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) | 11.1k별, v3.33.4 | 그래프 분석과 선택적 렌더, headless 모드 | 계산 그래프 분석·대형 데이터, 편집기 상태 결합 |
| [Fabric.js](https://github.com/fabricjs/fabric.js) | Canvas 객체 편집·SVG/JSON I/O | 이동·회전·그룹·이미지·내보내기 | 실제 축척·레이어·접근성·1,000대 성능 |
| Konva | React 바인딩 6.4k별, Canvas 계층 | 복합 Canvas 이벤트와 계층 | Preact 통합과 SVG 내보내기, 추상화 성능 비용 |

별 수와 완성도 때문에 상위 후보를 제외하지 않는다. 현재 SVG를 포함해 동일 100대·1,000대 공정 파일럿을
수행하고 [[capability-evaluation-method-2026]]으로 점수화한다.

## 4. 가이드와 기술 문서 구조

[Diátaxis](https://github.com/evildmp/diataxis-documentation-framework/blob/main/start-here.rst)는 문서를
튜토리얼, 방법 안내, 참조, 설명의 네 사용자 필요로 분리한다. Satisfactory 가이드에서는 다음처럼 적용한다.

| 사용자 필요 | 앱 표현 |
|---|---|
| 처음 배우기 | 실제 게임 상태를 따라 하는 짧은 튜토리얼 |
| 지금 행동하기 | 현재 진행과 자원 상태에서 수행할 작업·완료 조건 |
| 수치 찾기 | 공식 로케일의 아이템·설비·제작법·해금 참조 |
| 이유 이해하기 | 전략 선택, 상충 의견, 확장·물류 원리와 근거 |

[GOV.UK 단계별 내비게이션](https://design-system.service.gov.uk/patterns/step-by-step-navigation/)은 시작·종료가
있고 순서가 도움이 되는 여정에만 단계를 사용하며, 선택지 모음이나 단순 읽기에는 사용하지 말라고 한다.
따라서 게임 티어를 무조건 선형 단계로 표현하지 않고, 필수 게이트와 병렬 선택을 구분한다.

[Dioptra의 문서 지침](https://pages.nist.gov/dioptra/dev-guide/contributing-documentation-guide.html)은
튜토리얼에 기대 결과와 조기 성공을 제공하고, 방법 안내는 한 결과에 집중하며, 참조는 판단을 섞지 않는
방식을 구체화한다. 기존 가이드의 마케팅 문구와 게임 사실·전략 조언 혼합을 재작성하는 기준으로 사용한다.

문서 프레임워크 후보로 [Starlight](https://github.com/withastro/starlight) 8.6k별과
[Docusaurus](https://github.com/facebook/docusaurus) 65k별을 조사한다. 앱의 가이드는 별도 문서 사이트가
아니므로 프레임워크 자체 채택보다 검색, 목차, 버전, 접근성, 콘텐츠 구성 패턴을 실제 UI에 적용하는
파일럿을 우선한다.

## 5. 지도·상태·내보내기 후보

| 후보 | 근거 | 필수 검증 |
|---|---|---|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 11.2k별, WebGL2 벡터 지도, BSD-3 | 게임 래스터·수백 노드·오프라인 타일·키보드·현재 SVG 지도 비교 |
| [Dexie.js](https://github.com/dexie/Dexie.js/) | 14.3k별, v4.4.3, IndexedDB 버그 완화·bulk API | 스키마 마이그레이션·손상 복구·대형 설계·브라우저 호환 |
| Immer/Mutative 계열 | 패치·역패치 기반 Undo/Redo | 현재 스냅샷 50단계와 메모리·결정성 비교 |
| resvg 계열 | Rust 기반 SVG 렌더·PNG | 브라우저 WASM, 폰트·필터·게임 이미지 포함 독립 파일 |

클라우드 동기화는 제품 범위가 아니다. 로컬 저장과 JSON 왕복, 마이그레이션, 실패 시 원본 보존을 먼저
평가한다.

## 6. 품질 기술과 Codex 스킬

- `playwright`: 실제 배포 제품과 로컬 앱의 반복 가능한 브라우저 과업·스크린샷
- `frontend-visual-qa`: 계층, 상태, 반응형, 접근성, 콘솔·네트워크, 성능 느낌의 승인 판정
- `evidence-led-frontend-design`: 최신 원본 근거와 실제 제품 비교 후 화면 구조 결정
- `frontend-design-system`: 토큰, 테마, 밀도, 이미지, 모션과 컴포넌트 상태 계약
- GSAP 공식 스킬: 랜딩의 타임라인·ScrollTrigger·플러그인·성능과 축소 모션
- `product-catalog-ux`: 도감·제작법·설비 검색, 필터, 비교, 상세 흐름
- `product-data-system`: 게임 데이터·자산·출처·검색 인덱스와 품질 게이트
- `fast-check`: 생산·기하·직렬화 불변식의 속성 기반 테스트 후보

스킬 사용 횟수는 성과가 아니다. 스킬이 만든 근거, 구현, 검증 실패와 수정 결과를 성과로 기록한다.

## 7. 다음 조사

- 각 배포 제품의 실제 과업을 클릭해 입력 수, 오류 복구, 저장, 내보내기, 키보드 경로 기록
- 무한 캔버스 후보의 동일 1,000대 공정 파일럿과 100점 평가
- 가이드의 실제 Satisfactory 진행 표본을 Diátaxis 네 유형으로 재작성해 사용자 과업 비교
- MapLibre·현재 SVG 지도, Dexie·현재 localStorage, 패치 히스토리·스냅샷 히스토리 비교
- Playwright·axe·시각 회귀·프레임 측정의 요구사항별 증거 매트릭스
