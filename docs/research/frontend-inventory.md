# 프론트엔드 재고 조사 — 자체 구현물의 대안과 개선

- 조사일: 2026-08-21
- 목적: 우리가 **직접 만든 것들**(SVG 자원 지도, 실축척 설계판, 공정 흐름도 레이아웃)에 대해
  기성 라이브러리가 더 나은지 판정한다. "좋아 보인다"가 아니라 **번들 크기·라이선스·우리 제약**으로 판정한다.
- 방법:
  - 우리 코드는 **직접 읽었다**. 이 문서의 "지금 우리가 어떻게 하고 있나"는 전부 소스와 빌드 산출물 실측이다.
  - 라이브러리는 **GitHub API·npm 레지스트리·bundlephobia API 를 직접 호출**해 별·라이선스·마지막 푸시·번들
    크기를 확인했다. 설명문을 믿지 않았다. 라이선스가 애매한 것(`NOASSERTION`)은 **LICENSE 원문을 받아** 확인했다.
  - 아이콘 압축률은 **우리 실제 아이콘 24장을 변환해 잰 값**이다. 남의 벤치마크가 아니다.
  - Vite 의 워커 처리는 문서에 명시가 없어 **설치된 `node_modules/vite` 소스를 읽어** 확인했다.
  - 확인 못 한 것은 **확인 못 함**이라고 적었다.
- 인접 문서: `docs/adr/0009-frontend-architecture.md`, `docs/research/layout-design-tools.md`,
  `docs/research/drawing-tools-visual.md`, `docs/research/save-perf.md`, `docs/research/arch-offline.md`

---

## 0. 판정 기준 (이걸 어기면 후보에서 뺀다)

| 기준 | 값 |
|---|---|
| 빌드 | `output: 'static'`. 서버 없음(ADR-0010). GitHub Pages, `base: '/satisfactory-ops/'` |
| 라이선스 | MIT / Apache-2.0 / BSD / ISC. **카피레프트·독점은 탈락** |
| 번들 | 현재 아일랜드가 **gzip 2.0 / 6.6 / 9.0 KB**다. 이게 기준선이다 |
| 프레임워크 | Preact 10, `preact({ compat: false })`. **React 전용은 compat 비용까지 계산한다** |
| 렌더 | 도면은 **SVG 여야 한다** — `scripts/render-plan.mjs` 가 `@resvg/resvg-js` 로 서버에서 PNG 를 굽는다 |

### 지금 번들 실측 (`dist/_astro/`)

| 파일 | raw | gzip | 무엇 |
|---|---:|---:|---|
| `build.DGttY9Yi.js` | 279,454 | **54,181** | `@etothepii/satisfactory-file-parser` (세이브 파서) |
| `FactoryPlanner.js` | 23,569 | **8,988** | 설계판 아일랜드 |
| `ResourceMap.js` | 16,389 | **6,587** | 자원 지도 아일랜드 |
| `preact.module.js` | 10,470 | 4,439 | |
| `signals.module.js` | 7,794 | 2,982 | |
| `FlowBuilder.js` | 4,975 | **2,004** | 공정 전개 아일랜드 |
| `save-import.js` | 1,913 | 1,096 | |

**아일랜드 세 개를 다 합쳐도 gzip 17.6KB다.** 아래 후보 대부분이 이 숫자 앞에서 탈락한다.

---

## 1. 지도 · 팬/줌

### 지금 우리가 어떻게 하고 있나

`src/components/ResourceMap.tsx` (1,047줄), 아일랜드 gzip 6.6KB.

- **SVG `viewBox` 를 상태로 들고 직접 조작한다.** `vb = {x,y,w,h}` 를 `useState` 로 두고 `zoom = SIZE / vb.w`.
  좌표계는 0~1000 정사각형(게임 세계 북서 −3246,−3750 ~ 남동 4253,3750).
- **타일 피라미드**: `public/assets/map/manifest.json` 기준 **레벨 2단뿐이다** — `grid:2`(4장), `grid:5`(25장).
  레이어 2종(지형·생물군계), webp 90장 4.2MB. 파일명은 `{level}-{i}-{j}.webp`.
  **표준 슬리피맵/DeepZoom 쿼드트리가 아니다**(5×5 는 2의 거듭제곱이 아니다). 아래 판정에 직접 영향을 준다.
- **타일은 뷰포트 컬링을 한다** (`visible(grid)` 가 `vb` 와 교차하는 것만 뽑는다). `zoom < 1.4` 이면 타일을 안 받는다.
- **마커는 컬링하지 않는다.** 자원 노드 626개 + 수집품 1,764개 = **2,390개**를 레이어 토글로만 거른다.
  마커 하나가 `<g>` + `<circle>` + 배지 `<text>` + 라벨이므로 DOM 노드는 그 몇 배다.
  묶지(클러스터링) 않는 것은 **의도된 결정**이고 코드에 근거가 적혀 있다 — "묶으면 최소 배율에서 무엇이 어디 있는지가 사라진다".
- 확대해도 선이 두꺼워지지 않게 `vector-effect: non-scaling-stroke`. 마커 크기는 `11 * zoom^0.62` 을 14~52px 로 자른다.
- 부가 기능: 여러 점을 찍는 **거리 재기**(구간 길이 + 합계 + 벨트 자재량 + 전신주 개수), 검색, 순도/종류 필터, 세이브 연동.

**직접 확인한 결함 4가지** (라이브러리를 검토해야 할 진짜 이유다):

1. **핀치 줌이 없다.** `onDown/onMove/onUp` 이 포인터 **하나만** 추적한다(`pan.current` 가 단일 객체).
   터치 기기에서는 팬만 되고 줌은 버튼 두 개로만 된다.
2. **휠 줌이 델타 크기를 무시한다.** `e.deltaY < 0 ? 1.25 : 1/1.25` — 트랙패드의 잘게 쪼개진 이벤트마다
   1.25배씩 뛴다. `deltaMode`(픽셀/라인/페이지)도 안 본다.
3. **키보드로 팬/줌을 못 한다.** `keydown` 은 거리 재기 중일 때만 붙는다. → §7 에서 WCAG 위반으로 다시 다룬다.
4. `wheel` 을 무조건 `preventDefault()` 한다 — 지도 위에서 페이지 스크롤이 막힌다.

### 후보

| 이름 | URL | 라이선스 | 번들 min/**gzip** | 마지막 푸시 | 별 |
|---|---|---|---:|---|---:|
| deck.gl | github.com/visgl/deck.gl | MIT (원문 확인) | 1587 / **451 KB** | 2026-08-20 | 14.5k |
| └ `@deck.gl/core` 단독 | | MIT | 614 / **176 KB** | | |
| MapLibre GL JS | github.com/maplibre/maplibre-gl-js | **BSD-3-Clause** (원문 확인) | 964 / **248 KB** | 2026-08-20 | 11.4k |
| PixiJS | github.com/pixijs/pixijs | MIT | 861 / **245 KB** | 2026-08-20 | 48.0k |
| OpenSeadragon | github.com/openseadragon/openseadragon | BSD-3-Clause | 340 / **85 KB** | 2026-08-20 | 3.5k |
| Leaflet | github.com/Leaflet/Leaflet | BSD-2-Clause | 145 / **41.7 KB** | 2026-08-17 | 45.5k |
| d3-zoom | github.com/d3/d3-zoom | ISC | 45.5 / **15.1 KB** (의존성 5) | 2024-04-30 | 534 |
| svg-pan-zoom | github.com/bumbu/svg-pan-zoom | BSD-2-Clause | 28.2 / **7.8 KB** | 2026-01-16 | 1.97k |
| panzoom (anvaka) | github.com/anvaka/panzoom | MIT | 15.6 / **6.1 KB** | 2026-03-30 | 2.0k |
| @panzoom/panzoom | github.com/timmywil/panzoom | MIT | 9.3 / **3.6 KB**, 의존성 0 | 2026-07-02 | 2.45k |

### 바꿀 가치가 있나 — **없다. 자체 구현을 유지하고 결함 4가지를 손으로 고친다.**

- **deck.gl / MapLibre / PixiJS 는 크기로 탈락.** gzip 451 / 248 / 245 KB — 우리 지도 아일랜드(6.6KB)의
  **37~68배**다. 셋 다 WebGL 이라 `vector-effect` 와 CSS 커스텀 프로퍼티 테마(`docs/DESIGN-BRIEF.md` 정본)를
  버리고 색을 JS 상수로 옮겨야 한다 — CLAUDE.md 의 "색은 커스텀 프로퍼티만" 과 정면 충돌.
- **OpenSeadragon(85KB)은 기능적으로 가장 정확한 도구다** — 딥줌, 관성 줌, 핀치, 키보드가 다 있다.
  그러나 (a) 우리 아일랜드의 13배, (b) 우리 피라미드가 **2단·5×5 라 쿼드트리가 아니라서** 커스텀 `TileSource`
  를 어차피 써야 하고, (c) 2,390개 마커를 오버레이 DOM 으로 얹으면 지금 SVG 로 그리는 것보다 나을 이유가 없다.
  **딥줌이 필요할 만큼 타일이 깊지 않다** — 최대 레벨이 25장인데 딥줌 뷰어를 얹는 것은 과잉이다.
- **Leaflet(41.7KB)은 커뮤니티 표준이다.** SCIM 이 Leaflet 기반이라는 것은 `drawing-tools-visual.md` §1.4 에
  이미 있고, §8 에서 확인했듯 Minecraft·Satisfactory 지도 뷰어가 **예외 없이 Leaflet 으로 수렴**한다.
  그러나 우리 아일랜드의 6.3배이고, 무엇보다 **그 위에 있어야 할 것들(거리 재기, 순도 배지, 세이브 연동
  수집품 추적)을 우리가 이미 다 만들었다.** 옮기면 그 전부를 플러그인으로 다시 짜야 한다.
- **@panzoom/panzoom(3.6KB)은 크기로는 유일하게 통과하지만 방식이 안 맞는다.**
  CSS `transform` 으로 엘리먼트를 변환한다. SVG 를 CSS 로 확대하면 `vector-effect: non-scaling-stroke` 가
  의미를 잃고(테두리·글자 외곽선이 같이 커진다) 타일이 늘어나 뭉개진다 — 코드 주석에 적힌,
  **우리가 이미 겪어서 고친 바로 그 버그**로 되돌아간다. `svg-pan-zoom`(7.8KB)도 래퍼 `<g>` 에 transform 을
  걸므로 같은 문제이고, 추가로 DOM 을 명령형으로 만져 Preact VDOM 과 싸운다.
- **d3-zoom(15.1KB)만이 구조적으로 맞다.** 변환 결과 `{k,x,y}` 를 **숫자로 돌려주므로** 우리가 그걸로
  `viewBox` 를 다시 계산하면 된다. 렌더링은 그대로 우리 것이고, 휠 델타 정규화·핀치·더블클릭 줌이 딸려온다.
  **그런데 gzip 15.1KB — 우리 지도 아일랜드 전체의 2.3배다.** 이걸로 대체되는 우리 코드는
  `onDown/onMove/onUp/zoomAt/toWorld/clamp` 대략 **60줄**이다.
  60줄을 지우려고 아일랜드를 3.3배로 키우는 거래다. **거절.**
  (덧붙여 d3-zoom 은 2024-04-30 이후 푸시가 없다. 안정된 것이지 죽은 것은 아니지만 별 534개로 지원이 얇다.)

**대신 할 일** — 결함 4개는 라이브러리 없이 고친다:

- 핀치: `pan.current` 를 `Map<pointerId, {x,y}>` 로 바꾸고, 포인터가 2개면 두 점의 거리 비로
  `zoomAt(중점, 비율)`. d3-zoom 이 하는 일과 같고 우리 경우 **40줄 안쪽**이다.
- 휠: `f = Math.exp(-e.deltaY * k)` 로 델타에 비례시키고 `deltaMode` 로 보정한다(5줄).
- 키보드: §7 참조 (WCAG 2.1.1 Level A 문제라 선택 사항이 아니다).
- `preventDefault()` 는 실제로 줌을 처리한 경우에만.

---

## 2. 노드 그래프 · 다이어그램 레이아웃

### 지금 우리가 어떻게 하고 있나

**(a) 큐레이션 흐름도 — 빌드타임, JS 0KB.**
`src/components/FlowChart.astro` (491줄) + `src/lib/flow-layout.ts` (86줄) + `src/lib/flows.ts` (665줄).

- `flow-layout.ts` 의 `layout()` 은 **레이아웃 엔진이라고 부르기 어렵다.** 레이어별로 노드를 모아
  각 줄을 **가운데 정렬**해 늘어놓고 높이를 더한다. 교차 최소화 없음, 좌표 최적화 없음.
- **레이어와 열 번호를 사람이 직접 적는다.** `flows.ts` 가 간선을 `{ from: [0,1], to: [2,0] }` 같은
  `[레이어, 줄 안 순번]` 튜플로 명시한다. 코드 주석이 이유를 밝힌다 — 자동 연결을 만들었더니
  "있지도 않은 병합기"를 그렸기 때문에 **간선을 정본으로 삼기로 한 것**이다.
- **부산물은 이미 1급 시민이다.** `MachineBox.byproduct` 필드가 따로 있고(정제소가 플라스틱을 내며
  중유 잔여물을 함께 내는 경우), 간선에도 `byproduct: true` 플래그가 있어 `is-by` 클래스로 다르게 그린다.
  출구 x 좌표도 부산물이면 다른 자리에서 나간다(`FlowChart.astro:257`).
- **피드백 루프도 이미 그린다.** `flows.ts:650` 에 `{ from: [1,0], to: [0,1], byproduct: true }` —
  레이어 1에서 레이어 0으로 **거슬러 올라가는 간선**이 실재하고 `is-loop` 클래스가 붙는다.
- 분배기/병합기 심볼을 규칙에 따라 자동 삽입한다(한 기계 산출이 2곳 이상으로 갈릴 때만 분배기,
  같은 물건이 2줄 이상 들어올 때만 병합기).

**(b) 사용자 전개** — `FlowBuilder.tsx`(306줄, gzip 2.0KB)가 목표 품목/수량에서 공정을 펼치고,
`FlowDiagram.tsx`(128줄)가 같은 `flow-layout.ts` 로 그린다. 서버·클라이언트가 같은 치수를 공유한다.

### 후보

| 이름 | URL | 라이선스 | 번들 min/**gzip** | 마지막 푸시 | 순환 | 포트 |
|---|---|---|---:|---|---|---|
| ELK.js | github.com/kieler/elkjs | **EPL-2.0 OR GPL-3.0-or-later** | 1417 / **423 KB** | 2026-08-13 | 지원 | **지원** |
| Mermaid | github.com/mermaid-js/mermaid | MIT | 708 / **174 KB** | 2026-08-20 | 지원 | 없음 |
| Cytoscape.js | github.com/cytoscape/cytoscape.js | MIT | 425 / **134 KB** | 2026-08-19 | 지원 | 없음 |
| `@xyflow/react` | github.com/xyflow/xyflow | MIT | 183 / **58.4 KB** | 2026-08-20 | 그리기만 | 핸들 |
| d3-dag | github.com/erikbrinkman/d3-dag | MIT | 133 / **40.9 KB** | 2026-08-01 | **불가(DAG 전용)** | 없음 |
| sigma.js | github.com/jacomyal/sigma.js | MIT | 94 / **25.4 KB** | 2026-08-20 | 지원 | 없음 |
| **`@dagrejs/dagre`** | github.com/dagrejs/dagre | MIT | 45.7 / **15.4 KB** | 2026-08-08 | **지원(FAS 되돌리기)** | 없음 |
| graphology | github.com/graphology/graphology | MIT | 64.8 / **12.5 KB** | 2026-07-21 | 자료구조만 | — |

### 요청하신 두 가지(부산물·순환)를 소스로 확인한 결과

- **dagre 는 순환을 제대로 처리한다 — 소스로 확인.** `lib/acyclic.ts` 가 피드백 아크 집합(greedy FAS 또는 DFS)을
  구해 그 간선들을 **뒤집어서** 레이아웃하고 `undo()` 로 원래 방향을 되돌린다(`label.reversed = true`).
  즉 피드백 루프가 역방향 간선으로 제대로 그려진다. 우리 알루미나 되돌림 루프가 바로 이 케이스다.
- **부산물(한 노드에서 두 종류 산출)은 dagre 에서 "라벨이 다른 두 개의 out-edge"일 뿐이다.**
  dagre 는 멀티그래프라 `setEdge(v, w, label, name)` 으로 같은 쌍에 여러 간선을 둘 수 있다. 그리는 데 문제는 없다.
  **그러나 dagre 에는 포트 개념이 없다.** 주 산출과 부산물이 상자의 **어느 변 어느 지점에서 나가는지 지정할 수 없다.**
  우리는 지금 그것을 지정하고 있다.
- **d3-dag 는 이름 그대로 DAG 전용이다.** README 가 "directed **acyclic** graphs" 라고 못 박고, 스스로를
  "elkjs 의 ~500KB 트랜스파일된 Java 의 일부분"이라고 소개한다. 순환 간선은 우리가 미리 뒤집어 줘야 한다.
  크기 없는 노드에서는 예외를 던진다.
- **ELK.js 만이 포트·포트 제약·하이퍼엣지를 지원한다** — 부산물을 "정해진 출구 포트"로 그릴 수 있는 유일한 후보다.
  **그런데 두 가지로 탈락한다**: (1) 라이선스가 **EPL-2.0 OR GPL-3.0-or-later** — LICENSE.md 원문과 npm
  메타데이터 양쪽에서 확인했다. 우리 기준(MIT/Apache/BSD)을 어긴다. (2) gzip **423KB** (GWT 로 트랜스파일된 Java).
  우리 흐름도는 지금 **JS 0KB** 다.
- **`@xyflow/react` 는 React 전용이다.** peerDependencies 가 `react >= 17`, `react-dom >= 17` 이고 `zustand` 에 의존한다.
  우리는 `compat: false` 라서 쓰려면 compat 을 켜야 하고 그러면 **모든** 아일랜드에 react→preact/compat 별칭이 켜진다.
  게다가 xyflow 는 **레이아웃 엔진이 아니다** — 문서 스스로 배치는 dagre/ELK 에 맡기라고 한다.
  즉 크기를 내고도 부산물·순환 문제는 그대로 남는다.

### 바꿀 가치가 있나 — **큐레이션 흐름도는 아니다. `FlowBuilder` 만 조건부.**

- **(a) 큐레이션 흐름도: 바꾸지 않는다.** 크기 문제가 아니라 **성격 문제**다. 우리 흐름도의 가치는 자동 배치가
  아니라 **"있지도 않은 병합기를 그리지 않는다"는 도메인 규칙**에 있고, 그 규칙이 `FlowChart.astro` 491줄이다.
  dagre 를 넣어도 그 491줄은 그대로 남는다. 대체되는 것은 `flow-layout.ts` 의 **가운데 정렬 20줄**뿐이다.
- **(b) 그럼에도 dagre 가 진짜로 벌어다 줄 것 하나**: 지금 `flows.ts` 는 **레이어와 열 번호를 사람이 손으로 적는다.**
  이건 CLAUDE.md 가 금지하는 "수치를 손으로 타이핑"과 성격이 같은 부채다 — 도면을 하나 추가할 때마다 좌표를
  사람이 계산하고, 겹치면 눈으로 잡아야 한다(그래서 `render-plan.mjs` 로 PNG 를 굽는다).
  dagre 를 **빌드 스크립트에서만**(`devDependency`, 클라이언트 번들 0KB) 돌려 레이어·열 번호를 **생성**하면
  손으로 적는 자리가 사라진다. 이것이 도입을 검토할 유일하게 정직한 이유다.
- **(c) `FlowBuilder`(gzip 2.0KB)에 dagre(15.4KB)를 넣는 것은 8.7배 증가다.** 지금 사용자 전개는 트리 모양
  (목표 하나에서 원자재로 내려감)이라 교차가 거의 안 생긴다. **필요해질 때까지 넣지 않는다.**

**부산물·순환을 "제대로" 그리는 라이브러리는 사실상 ELK 하나뿐이고 그건 라이선스로 못 쓴다.**
이것이 우리 자체 구현이 살아남는 가장 강한 근거다 — 우리는 이미 둘 다 그리고 있다.

**단, §8 의 반대 증거를 숨기지 않는다**: 활발히 유지되는 Satisfactory 도구 4곳 중 3곳(SatisfactoryTools=ELK,
satisfactory-logistics=dagre, satisfactory-factories=dagre)이 **레이아웃을 직접 짜지 않고 기존 엔진에 위임한다.**
업계 관행은 우리와 반대다. 우리가 자체 구현을 유지하는 근거는 "우리 방식이 일반적"이어서가 아니라
**JS 0KB 와 도메인 규칙(부산물 포트·병합기 억제) 때문**이다 — 그 트레이드오프를 명시해 둔다.

---

## 3. 캔버스 에디터 (설계판)

### 지금 우리가 어떻게 하고 있나

`src/components/FactoryPlanner.tsx` (1,320줄), 아일랜드 gzip 9.0KB. **SVG 다, Canvas 가 아니다.**

- 좌표 단위가 **미터**다. `TILE` = 8m 파운데이션 격자를 `<pattern>` 두 겹(1칸/8칸)으로 그린다. 실축척이다.
- **스냅**: `snap(v) = Math.round(v / SNAP) * SNAP`, 드래그 중 매 이동마다.
- **회전**: `rot` 이 `0 | 90 | 180 | 270`. 버튼으로 90도씩. 회전하면 `w/h` 를 뒤바꾸고(`swap`)
  입출력 포트가 붙는 면도 같이 돈다(`inFace`/`outFace`).
- **층**: 노드마다 `floor` 정수 + 전역 `floorHeight`(기본 8m). 다른 층은 흐리게, 현재 층을 맨 위에.
  층이 다른 두 노드를 이으면 컨베이어 리프트가 되고 높이가 `(b.floor - a.floor) * floorHeight` 로 계산된다.
- **드래그**: `setPointerCapture` + `drag.current`. 벨트는 직각 라우팅 + 필렛(`roundPath`).
- 로컬 저장에 `version: SAVE_VERSION` 이 있고 v1(픽셀 좌표, 층 없음) → v2 마이그레이션이 실제로 들어 있다.

**없는 것**: **다중 선택이 없다.** 마퀴(rubber band)도, shift-클릭 누적도 없다. 한 번에 하나씩 옮긴다.

### 후보

| 이름 | URL | 라이선스 | 번들 min/**gzip** | 마지막 푸시 | Preact |
|---|---|---|---:|---|---|
| tldraw | github.com/tldraw/tldraw | **독점 (tldraw license)** | 1722 / **512 KB** | 2026-08-20 | React 전용 |
| PixiJS | github.com/pixijs/pixijs | MIT | 861 / **245 KB** | 2026-08-20 | 무관(명령형) |
| Fabric.js | github.com/fabricjs/fabric.js | MIT | 292 / **89.7 KB** | 2026-08-18 | 무관(명령형) |
| Konva | github.com/konvajs/konva | **MIT** (원문 확인) | 179 / **53.4 KB** | 2026-08-20 | 무관(명령형) |
| `@xyflow/react` | github.com/xyflow/xyflow | MIT | 183 / **58.4 KB** | 2026-08-20 | **React 전용** |
| rete.js | github.com/retejs/rete | MIT | 11.2 / **3.0 KB** (코어만) | 2026-07-24 | 렌더 플러그인이 React/Vue/Angular |

### 바꿀 가치가 있나 — **없다. 이번엔 크기보다 센 이유가 있다.**

1. **`tldraw` 는 라이선스로 즉시 탈락.** LICENSE.md 원문 확인 — "This License from tldraw, Inc. governs your
   use", 별도 상용 라이선스 판매, 프로덕션 배포에 조건이 붙는다. npm `license` 필드도 `SEE LICENSE IN LICENSE.md`.
   오픈소스가 아니다. 이 저장소는 public 이고 MIT 다. **검토 종료.**
2. **Canvas 계열(Konva 53.4 / Fabric 89.7 / PixiJS 245 KB)은 크기 이전에 파이프라인이 막는다.**
   `scripts/render-plan.mjs` 가 빌드된 HTML 에서 **SVG 를 꺼내** CSS 커스텀 프로퍼티를 실제 값으로 치환한 뒤
   `@resvg/resvg-js` 로 PNG 를 굽는다. 이건 장식이 아니라 **품질 게이트**다 — 주석에 "도면을 코드로 만들면서
   겹침·잘림을 보지 못한 채 세 번 배포했다"고 적혀 있다. Canvas 로 옮기면 이 게이트가 **통째로 사라진다.**
   되살리려면 헤드리스 브라우저로 캔버스를 굽는 파이프라인을 새로 짜야 하고, CSS 커스텀 프로퍼티 테마도 잃는다.
   Konva 는 `konva/lib/Core` + 개별 shape 만 담는 모듈러 빌드를 제공하지만(jsdelivr 파일 목록 실측:
   전체 `lib/*.js` 434KB raw 중 코어+기본 shape 이 약 242KB raw, **대략 절반**) 그래도 우리 아일랜드의 몇 배다.
   *모듈러 빌드의 정확한 gzip 수치는 확인 못 함 — 실제로 번들해 봐야 안다.*
3. **`rete.js` 는 코어가 3.0KB 로 작지만 용도가 다르다.** 노드 그래프(비주얼 프로그래밍)용이지 **실축척 평면도**용이
   아니다. 8m 격자·회전·층·컨베이어 리프트 개념이 없다. 실제로 쓰려면 `rete-area-plugin` + 연결 플러그인 +
   렌더 플러그인이 필요하고 렌더 플러그인은 React/Vue/Angular 다 — **Preact 용은 없다.**
4. **`@xyflow/react` 는 React 전용 + 레이아웃 없음**(§2). 게다가 노드 그래프이지 축척 도면이 아니다.

**대신 할 일**: 다중 선택은 라이브러리가 필요한 기능이 아니다. `Set<number>` 로 선택 집합을 들고
마퀴 사각형과 교차 판정을 하면 된다(우리는 이미 `visible(grid)` 에서 같은 종류의 교차 판정을 한다).
드래그 시 선택 전체에 같은 델타를 적용. **대략 80줄, 번들 증가 0.**

---

## 4. 대용량 목록 · 표

### 지금 우리가 어떻게 하고 있나

**가상 스크롤을 전혀 쓰지 않는다. 전부 빌드타임에 HTML 로 굳혀 놓는다.** (ADR-0009 §1)

- 레시피 목록 페이지 **417KB HTML** — 레시피 카드 206개가 통째로. `<img>` 0개(아이콘은 별도 경로).
- 지도 페이지 **617KB HTML** — 마커 데이터 2,390건이 아일랜드 props 로 **HTML 에 인라인**돼 있다.
- 지도 서랍 목록은 자원 14종·수집품 6종별 카운트라 필터 UI 이지 수천 행짜리 표가 아니다.
  **수천 행을 그리는 화면은 지금 없다** — 지시서의 전제와 실제 코드가 다르다.

### 후보

| 이름 | URL | 라이선스 | 번들 min/**gzip** | 마지막 푸시 | Preact |
|---|---|---|---:|---|---|
| Tabulator | github.com/olifolkerd/tabulator | MIT | 437 / **99.9 KB** | 2026-08-19 | 무관 |
| `@tanstack/virtual-core` | github.com/TanStack/virtual | MIT | 22.0 / **6.6 KB**, 의존성 0 | 2026-08-18 | **프레임워크 무관 — 가능** |
| virtua | github.com/inokawa/virtua | MIT | 14.2 / **6.0 KB** | 2026-08-20 | **React/Vue/Svelte/Solid/Angular만** |
| react-window | github.com/bvaughn/react-window | MIT | 12.6 / **4.4 KB** | 2026-07-20 | React 전용 |
| Clusterize.js | github.com/NeXTs/Clusterize.js | MIT | 6.2 / **2.4 KB** | 2026-06-15 | 무관(바닐라) |

- `virtua` 의 npm exports 를 확인했다: 루트가 React, 그 밖에 `./vue` `./solid` `./svelte` `./angular`.
  **Preact 어댑터는 없다.** 프레임워크 무관 코어는 `./unstable_core` 로만 노출된다(이름 그대로 unstable).
- `@tanstack/virtual-core` 는 의존성 0 의 순수 계산기다(보이는 인덱스를 계산해 주고 렌더는 우리가 한다).
  **Preact 에서 쓸 수 있는 유일한 성숙한 후보.**

### 바꿀 가치가 있나 — **지금은 아니다. 문제가 다른 데 있다.**

- 가상 스크롤은 **DOM 노드 수** 문제를 푼다. 우리 문제는 DOM 노드 수가 아니라 **HTML 바이트**다.
  417KB HTML 을 가상 스크롤로 바꾸려면 데이터를 JSON 으로 빼고 런타임에 그려야 하는데, 그건
  **ADR-0009 의 핵심 결정(수치를 빌드타임에 굳혀 손으로 옮길 자리를 없앤다)을 되돌리는 것**이다.
  그 결정은 이 저장소가 실제로 겪은 버그 4건(`bd981f4`, `2b5cdad` 등)에서 나왔다. 되돌릴 이유가 없다.
- HTML 은 압축이 매우 잘 되고(반복적인 표 마크업) GitHub Pages 가 압축해 서빙한다.
  그리고 그 HTML 에는 대응하는 하이드레이션 JS 가 **없다** — INP 를 지배하는 것은 메인 스레드 JS 실행인데
  여기엔 그게 없다. Next.js 가 경고하는 128KB 임계는 **클라이언트가 파싱·하이드레이트해야 하는 `__NEXT_DATA__`**
  이야기라 기제가 다르다. (https://nextjs.org/docs/messages/large-page-data)
  *"빌드타임 인라인 HTML 이 몇 KB 부터 손해로 돌아서는가"에 대한 신뢰할 만한 임계값은 찾지 못했다 — 확인 못 함.
  Lighthouse 를 우리 지도·레시피 페이지에 직접 돌려 재는 것이 유일하게 정직한 답이다.*
- **실제로 손볼 곳이 있다면 지도 마커 2,390개의 SVG 노드다**(§1). 여기에 쓸 것은 목록 가상화가 아니라
  **뷰포트 컬링**이고, 타일에 쓰는 `visible()` 과 같은 판정을 마커에도 적용하면 된다 — **번들 증가 0.**
  단, 주석이 밝힌 "축소했을 때 전체 분포를 보여 준다"는 의도를 깨지 않으려면 **줌이 일정 이상일 때만 컬링을
  켜야 한다**(축소 상태에서는 어차피 전부 화면 안이라 컬링해도 결과가 같다).

---

## 5. 웹 워커 (세이브 파싱)

### 지금 우리가 어떻게 하고 있나

`src/lib/save-import.ts` (99줄) + `src/lib/save-factory.ts`.

- `@etothepii/satisfactory-file-parser` **4.1.2, MIT, 의존성 `pako` 하나**.
- **동적 import 한다** — `readSave()` 안에서 `await import(...)`. 주석: "파서는 2.6MB짜리라 **파일을 고른 뒤에야** 내려받는다."
- **메인 스레드에서 돈다. 저장소 전체에 `new Worker` 가 하나도 없다** (`src/`·`scripts/` 전수 grep).
- 파서 청크 실측: `dist/_astro/build.DGttY9Yi.js` **raw 279,454B / gzip 54,181B**.

### 여기서 발견한 진짜 문제 — 지연 로딩이 서비스워커에 의해 무효화되고 있다

`scripts/sw-integration.mjs` 는 `dist/` 를 통째로 걸어 프리캐시 목록을 만들고 install 에서 **원자적으로 전부 받는다.**
제외 목록(`EXCLUDE`)은 `.map`, `LICENSE`, `.txt`, 그리고 지도 확대 타일뿐이다. 실측했다:

```
프리캐시 항목 774개 / 14.5MB
  png 7.5MB · webp 4.2MB · html 2.0MB · js 0.3MB · woff2 0.3MB · css 0.1MB
파서 청크 포함 여부: _astro/build.DGttY9Yi.js  → 포함됨
```

즉 **세이브를 한 번도 안 쓰는 방문자도 첫 방문 SW install 에서 파서 279KB 를 받는다.**
`save-import.ts` 주석이 말하는 지연 로딩은 SW 가 켜진 뒤로는 성립하지 않는다.
그리고 `sw-integration.mjs` 머리말의 "이 앱의 자산 총량이 작아**(1~2MB)** 전량 프리캐시가 성립한다"는 전제가
**낡았다 — 지금 14.5MB 다.** 원자적 install 이라 하나라도 실패하면 전부 실패한다.

### 후보

| 이름 | URL | 라이선스 | 번들 min/**gzip** | 마지막 푸시 |
|---|---|---|---:|---|
| Comlink | github.com/GoogleChromeLabs/comlink | Apache-2.0 | 4.2 / **1.9 KB**, 의존성 0 | 2026-08-11 |
| workerpool | github.com/josdejong/workerpool | Apache-2.0 | 31.3 / 9.0 KB | 2026-08-10 |
| threads.js | github.com/andywer/threads.js | MIT | 32.1 / 9.1 KB | **2024-06-19 (사실상 정지)** |
| fflate | github.com/101arrowz/fflate | MIT | 31.1 / 11.8 KB | 2026-05-16 |
| pako (파서가 쓰는 것) | github.com/nodeca/pako | MIT | 42.1 / 12.8 KB | 2026-08-13 |

### Vite/Astro 에서의 설정 — 소스로 확인했다

정규 패턴은 `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })` 이고,
`new URL()` 이 `new Worker()` **안에 직접** 있어야 Vite 가 정적 분석한다 (https://vite.dev/guide/features#web-workers).

`base: '/satisfactory-ops/'` 같은 서브패스에서 제대로 동작하는지가 관건이었는데 **문서에 명시가 없어서
설치된 Vite 8.2.1 소스를 직접 읽어 확인했다**:

- `node_modules/vite/dist/node/chunks/node.js:27758` — 워커 자산 URL 치환이
  `toOutputFilePathInJS(this.environment, filename, "asset", chunk.fileName, "js", toRelativeRuntime)` 를 탄다.
  **이미지 등 다른 자산과 완전히 같은 경로다.**
- 그 `toRelativeRuntime` 은 `createToImportMetaURLBasedRelativeRuntime(...)` 로 만들어진다 —
  base 를 문자열로 박는 게 아니라 **`import.meta.url` 기준 상대 경로**를 낸다. 서브패스 배포에 오히려 더 강하다.

→ **`base` 문제는 없다고 판정한다.** (첫 도입 시 빌드 산출물에서 워커 청크 URL 을 한 번 눈으로 확인할 것.)

`type: 'module'` 워커 지원: 전역 95.5%. Chrome/Edge 80+, Safari 15+, **Firefox 는 114+ 부터**(2023 중반). 2026 기준 안전.

### Comlink 를 쓸 것인가 — **쓰지 않는다.**

우리 계약은 **호출 하나**다: "이 ArrayBuffer 를 파싱해서 리포트 객체를 돌려줘."
Comlink 의 값어치(여러 메서드를 가진 객체처럼 쓰기, 콜백 프록시)가 이 모양에서는 실현되지 않는다.
게다가 **transferable 은 Comlink 를 써도 공짜가 아니다** — `Comlink.transfer(buf, [buf])` 를 우리가 직접 적어야 한다.
gzip 1.9KB 를 내고 얻는 게 없다. 손으로 짠 `postMessage`/`onmessage` 한 쌍이 더 짧다.
(진행률 콜백이나 취소를 붙이게 되면 그때 다시 본다 — 그때는 Comlink 의 `proxy()` 가 실제로 값을 한다.)

**전송 패턴**: `worker.postMessage(buf, [buf])` — **`ArrayBuffer` 자체**를 전송 목록에 넣는다
(TypedArray 는 transferable 이 아니다. `.buffer` 를 넣어야 한다). 전송 후 원본은 **detached** 되어
`byteLength === 0` 이 되고 접근하면 throw 한다 → **메인 스레드에서 그 버퍼를 다시 쓸 계획이면 먼저 읽어 둬야 한다.**
돌아오는 리포트 객체는 작은 평범한 객체라 구조화 복제로 충분하다.
(https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)

### 바꿀 가치가 있나 — **있다. 단, 라이브러리 없이.**

- 파싱을 워커로 옮기면 메인 스레드가 안 멈춘다. 지금 100ms 는 견딜 만하지만 후반 세이브는 수 초로 예상된다
  (`docs/research/save-perf.md`). 그동안 지도가 얼어붙는다.
- **번들 증가 0** — Comlink 를 안 쓰면 새 의존성이 없다. 파서 청크는 워커 쪽으로 **옮겨가므로** 메인 번들에서 빠진다.
- **같이 고쳐야 할 것**: SW `EXCLUDE` 에 파서 청크를 넣는다. 안 그러면 워커로 옮겨도 install 때 279KB 를
  받는 사실은 그대로다.

---

## 6. 성능 — 이미지가 진짜 병목이다

### 지금 우리가 어떻게 하고 있나

- `astro.config.mjs`: `image: { service: passthroughImageService() }`. 주석은 "자산은 이미 최적화된 webp다.
  sharp(네이티브 의존성)를 도입하지 않는다" 라고 적혀 있다. **그런데 실제 자산은 대부분 PNG 다.**
- 실측 (`public/assets/` 14MB, `dist/` 17MB):

| 디렉터리 | 개수 | 형식 | 크기 |
|---|---:|---|---:|
| `items/` | 240 | **PNG** 96×96 (평균 14.4KB) | 3.9MB |
| `buildings-png/` | 159 | **PNG** | 3.4MB |
| `shop/` | 174 | **PNG** | 1.7MB |
| `buildings/` | 27 | webp | 232KB |
| `map/` | 61 | webp | 3.7MB |
| `art/` | 4 | | 532KB |

- **`buildings/`(webp 27장)와 `buildings-png/`(PNG 159장)의 파일명이 하나도 겹치지 않는다** — 확인했다.
  전자는 `assembler.webp` 같은 사람이 읽는 이름, 후자는 `Build_AssemblerMk1_C.png` 같은 클래스명이다.
  **화면 코드는 전부 `buildings-png` 를 참조한다**(`ItemChip.astro`, `FlowChart.astro`, `FactoryPlanner.tsx`,
  `ModuleSheet.astro`, 코덱스 페이지들). webp 쪽은 사실상 유산이다.
- PNG 를 쓰는 이유는 기록돼 있다 — `scripts/fetch-icons.mjs:124`: **"도면 렌더러(resvg)가 webp 를 읽지 못해"**.
  즉 PNG 는 **빌드타임 resvg 를 위한 것**인데 **브라우저에도 그대로 나간다.**
- 아이콘은 `ItemChip.astro` 에서 `<img src="....png" alt="" loading="lazy">` — 칸 전체를 `role="img"` +
  `aria-label` 로 감싸고 `<img>` 는 `alt=""` 로 두는 구조다(2026-08-21 기준).
  **`width`/`height` 속성이 없고**(CSS `--s` 로만 크기를 준다) `decoding` · `fetchpriority` 도 없다.
- 아일랜드 3개 전부 `client:load` (지도 / 설계판 / 전개).

### 우리 아이콘으로 직접 잰 압축률

남의 벤치마크는 사진 크기에서 잰 것이라 96×96 아이콘에 그대로 옮겨지지 않는다.
**그래서 실제 `public/assets/items/` 에서 24장을 고르게 뽑아 변환해 쟀다** (sharp, 알파 유지):

| 형식 | 24장 합계 | PNG 대비 |
|---|---:|---:|
| PNG (현재) | 326 KB | — |
| WebP 무손실 | 232 KB | **−29%** |
| **WebP q82** (alphaQuality 90) | **86 KB** | **−74%** |
| AVIF q60 | 67 KB | **−80%** |

→ **AVIF 가 WebP 보다 6%p 더 줄일 뿐이다.** 아이콘 크기에서는 컨테이너 헤더 오버헤드가 커서 사진에서 흔히
인용되는 "AVIF 가 WebP 보다 20~50% 작다"가 성립하지 않는다는 통설과 우리 실측이 일치한다.
**WebP q82 가 정답이다** — 지원 범위가 넓고 인코딩이 싸다. AVIF 는 6%p 를 위해 파이프라인 복잡도를 더할 값어치가 없다.

573장 전부에 적용하면 **PNG 7.5MB → 약 1.9MB, 5.6MB 절감.** 이 문서에서 가장 큰 단일 이득이다.

### 이게 왜 그냥 이미지 문제가 아닌가

§5 와 합치면: **서비스워커가 install 때 14.5MB 를 원자적으로 받는다.** 그중 png 가 7.5MB 다.
아이콘을 WebP 로 바꾸면 **첫 방문 SW install 이 14.5MB → 약 9MB 로 줄어든다.**
`loading="lazy"` 는 SW 프리캐시 앞에서 아무 의미가 없다 — SW 는 목록대로 전부 받는다.

**단, resvg 제약을 지켜야 한다.** resvg 는 webp 를 못 읽으므로 PNG 를 지울 수 없다.
`public/` 은 `dist/` 로 통째로 복사되므로, PNG 를 브라우저에 안 내보내려면 **PNG 를 `public/` 밖(빌드 전용
디렉터리)으로 옮기고 화면은 webp 를 참조**하게 해야 한다.
*이 이동이 `render-plan.mjs`·`build-asset-index.mjs`·`fetch-icons.mjs` 를 어디까지 건드리는지는 확인 못 함.*

### 그 밖에 확인한 것

- **`loading="lazy"` 를 LCP 이미지에 걸면 오히려 해가 된다.** web.dev 가 명시적으로 경고한다 —
  "Don't lazy-load images that are likely to be in-viewport when the page loads, especially LCP images."
  브라우저가 레이아웃을 계산해야 지연 로딩 여부를 정하므로 **가져오기 시작이 그만큼 늦는다.**
  우리 `ItemChip` 은 **모든** 아이콘에 무조건 `lazy` 를 건다 → 첫 화면 위쪽 그리드의 첫 아이콘이
  LCP 후보라면 그게 바로 그 안티패턴이다. (https://web.dev/articles/lazy-loading-images)
- **`width`/`height` 속성이 없다.** CLS 방지를 위해 모든 `<img>` 에 권장된다. 우리는 CSS 로 크기를 주므로
  실제 CLS 는 안 날 가능성이 높지만 속성을 붙이는 비용이 0 이다.
- **`fetchpriority="high"`** 는 실측 사례가 있다 — Google Flights LCP 2.6s → 1.9s, Oodle 약 2s 개선.
  Chrome/Edge 102+, Firefox 132+, Safari 17.2+. (https://web.dev/articles/fetch-priority)
- `decoding="async"` 는 MDN 스스로 정적 `<img>` 에서는 효과가 "종종 감지하기 어렵다"고 적는다.
  붙여도 손해는 없지만 **지표를 움직일 지렛대가 아니다.**
- **스프라이트 시트는 권하지 않는다.** 한 페이지가 573장을 다 쓰지 않으므로 통짜 시트는 오히려 손해다.
  카테고리별로 쪼개면 이득이 날 수 있지만, `background-image` 방식은 `<img alt>` 를 잃어
  CLAUDE.md 의 "항상 텍스트 라벨 병기" 를 지키기 위한 추가 마크업이 필요해진다.
  **WebP 전환만으로 −74% 가 나오는데 그 복잡도를 살 이유가 없다.**
- Astro 아일랜드의 INP: 공식 문서는 `client:*` 디렉티브의 INP 함의를 명시하지 않는다(확인 못 함).
  우리는 아일랜드 3개, 전부 그 페이지의 본체라서 `client:load` 가 맞다.
  CLAUDE.md 의 "상태를 소유하는 최소 단위만 아일랜드" 가 이미 구조적 방어책이다.

---

## 7. 접근성 — SVG 지도·다이어그램

### 지금 우리가 어떻게 하고 있나

- `ResourceMap.tsx:737` — `<svg class="rm-svg" viewBox={...} role="img" aria-label="자원 지도">`.
  그 **안에** 클릭 가능한 마커 2,390개가 들어 있다. 내부에 `<title>` 두 개.
- 흐름도·도면(`FlowChart.astro`, `FactoryDrawing.tsx`, `FloorPlanSheet.tsx`, `FlowDiagram.tsx`)도 `role="img"` + `aria-label`.
- 순도는 **색 + 한 글자 배지**로 이중 표기한다 (색각 이상 대응 — CLAUDE.md 규칙을 이미 지키고 있다).
- 줌 버튼·필터는 전부 진짜 `<button>` 이다.
- **마커는 포커스 불가. 키보드 팬/줌 없음.**

### 확인된 문제 — 심각한 순서대로

**(1) 인터랙티브 지도에 `role="img"` 는 스펙 위반이고, 마커 2,390개를 접근성 트리에서 지운다.**

- WAI-ARIA 1.2 의 `img` role: "**Presentational Children: true** — User agents SHOULD NOT expose
  descendants of this element through the platform accessibility API." (https://www.w3.org/TR/wai-aria-1.2/#img)
- SVG-AAM 도 같다: "Children Presentational: True … the child element should not be exposed."
  (https://www.w3.org/TR/svg-aam-1.0/)

→ `<g>` 마커도, 그 안의 `<title>` 도, 클릭 핸들러가 붙은 요소도 **전부 스크린리더에 없는 것으로 취급된다.**
시각적으로는 누를 수 있는데 AT 에는 "그림 한 장"인 모순이다. `role="img"` 는 "이 내용의 의미는 label 하나로
완전히 표현된다"는 선언이라, 개별적으로 다르게 동작하는 자식이 있는 순간 어긋난다.

**중요한 대비**: **정적 흐름도·도면에는 `role="img"` + 요약 `aria-label` 이 올바른 선택이다.**
그건 실제로 한 장의 그림으로 읽히는 게 목적이고 자식이 개별 동작을 하지 않는다.
**우리는 두 경우에 같은 패턴을 썼는데 한쪽만 맞다.**

**(2) 키보드로 지도를 조작할 수 없다 — WCAG 2.1.1 (키보드, Level A).**
`keydown` 은 거리 재기 중일 때만 붙는다. 팬·줌이 마우스/터치 전용이다. 업계 관행은 수렴해 있다:

- Leaflet: 지도를 포커스 가능하게 만들고 **화살표 키 팬(기본 80px) + `+`/`-` 줌**. (https://leafletjs.com/reference.html)
- MapLibre `KeyboardHandler`: 화살표 100px 팬, `Shift+=`/`Shift+-` 줌 ±2단계.
  (https://maplibre.org/maplibre-gl-js/docs/API/classes/KeyboardHandler/)
- OpenSeadragon 의 기본 바인딩은 **확인 못 함.**

→ 컨테이너에 `tabindex="0"`, 화살표=팬, `+`/`-`=줌(기존 `zoomAt` 재사용). 대략 25줄.

**(3) 드래그 전용 조작 — WCAG 2.2 SC 2.5.7 Dragging Movements (AA).**
정규문: "All functionality that uses a dragging movement for operation can be achieved by a single pointer
without dragging, unless dragging is essential or the functionality is determined by the user agent and not
modified by the author." (https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

설계판에서 기계를 옮기는 유일한 방법이 드래그다. 최소 준수안은 **"기계를 눌러 선택 → 놓을 칸을 눌러 이동"**
같은 순차 클릭 경로다. 드래그를 없앨 필요는 없다.
회전이 이미 **버튼**으로 되어 있는 것이 이 요건을 만족하는 좋은 선례다 — 같은 사고를 이동에 적용하면 된다.

**(4) SC 2.5.8 Target Size (Minimum, AA) — 우리 마커는 예외로 통과한다.**
최소 줌에서 마커가 14px 라 24×24 CSS 픽셀에 못 미치지만, Understanding 문서가 **지도를 직접 예로 들어**
Essential 예외를 인정한다: "in digital maps, the position of pins is analogous to the position of places
shown on the map. … It is essential to show the pins at the correct map location, therefore the Essential
exception applies." (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
→ **위반은 아니다.** 다만 보이는 원은 14px 로 두고 **히트 영역만 투명하게 24px 로 키우면** 예외에 기대지 않고 통과한다.

**(5) `<title>` 만 믿지 말 것.** SVG-AAM 상 `<title>` 이 접근 가능한 이름 1순위지만 브라우저 구현이 고르지 않아,
CSS-Tricks 는 `<title id>` + 상위 요소 `aria-labelledby` 우회를 **여전히** 권한다 (https://css-tricks.com/accessible-svgs/).
MDN 은 한 걸음 더 나가 "가시 텍스트가 있으면 `<title>` 보다 `aria-labelledby` 로 그 텍스트를 참조하라"고 한다
(https://developer.mozilla.org/en-US/docs/Web/SVG/Element/title).
*`<g>` 안에 중첩된 `<title>` 의 2026년 VoiceOver/NVDA/JAWS 실제 동작은 확인 못 함.*

**(6) 고대비 모드(`forced-colors`)에서 마커 색이 시스템 색으로 치환된다.**
`fill`/`stroke` 가 강제 대체되므로 "원 색으로 자원 종류 구분"이 사라질 수 있다.
대응은 `forced-color-adjust: none` 또는 `CanvasText`/`ButtonText` 같은 시스템 색 키워드.
(https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)
→ 우리는 이미 한 글자 배지로 이중 표기하므로 **정보 손실은 없다.** 확인만 하면 된다.

### 바꿀 가치가 있나 — **라이브러리는 필요 없다. 패턴을 바꿔야 한다.**

수천 개 마커를 전부 `tabindex` 로 포커스 가능하게 만드는 것은 **안티패턴**이다(탭 트랩).
ARIA APG 의 grid 패턴이 roving tabindex 를 쓰는 것 자체가 "전부 탭 시퀀스에 넣지 말라"는 증거다
(https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
*단, APG 에 "산재한 지도 마커" 전용 패턴은 없다 — grid 는 행/열 구조를 전제한다. 확인 못 함(추론).*

권장 구조:

1. 시각 SVG 는 `aria-hidden="true"` (마커를 포커스 불가로 유지하는 것과 **짝을 이뤄야** 유효하다 —
   포커스 가능한 요소를 `aria-hidden` 서브트리에 넣는 것 자체가 위반이다.
   https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-hidden)
2. 그 옆에 **같은 데이터의 구조화된 대체물**(필터 가능한 `<table>`/`<ul>`: 자원, 순도, 구역명)을 둔다.
   **우리는 이 데이터를 이미 props 로 갖고 있다** — 새 데이터가 필요 없다.
3. 목록 항목을 누르면 지도가 그 위치로 팬 → 시각 사용자와 스크린리더 사용자가 **같은 상세 패널**에 도달한다.
4. 지도 컨테이너에 키보드 팬/줌.

흐름도·도면은 **지금 그대로 두는 것이 맞다.**

---

## 8. 디자인 참고 — 코드를 볼 수 있는 것만

### 팩토리 게임 도구

| 이름 | 라이선스 | 별 | 마지막 푸시 | 스택 · 레이아웃 |
|---|---|---:|---|---|
| greeny/SatisfactoryTools | MIT (**게임 아이콘은 별도 금지 조항**) | 529 | 2026-03-29 | AngularJS 1.x + webpack. `cytoscape` + **`cytoscape-elk`** |
| factoriolab/factoriolab | MIT | 857 | 2026-08-19 | Angular(Signal). **GLPK(LP 솔버)**, `d3-sankey` + 자체 box-line |
| KirkMcDonald/kirkmcdonald.github.io | Apache-2.0 | 744 | 2025-07-02 | **프레임워크 없음**. 자체 심플렉스 + `cycle.js` + vendored d3-sankey |
| Sankeyfactory/sankeyfactory.github.io | **GPL-3.0** | 31 | 2025-03-21 | 프레임워크 없음, esbuild, **의존성이 `panzoom` 하나** |
| rockfactory/satisfactory-logistics | MIT | 57 | 2026-06-09 | Vite+React+Mantine. **leaflet** + `@xyflow/react` + **`@dagrejs/dagre`** |
| satisfactory-factories/application | **AGPL-3.0** | 52 | 2026-08-20 | Vue 3 + Vuetify. `@vue-flow/core` + **`@dagrejs/dagre`** |

배울 점을 하나씩만:

- **KirkMcDonald 이 우리와 가장 직접 비교된다.** 프레임워크 없이 `rational.js`(`big-integer` 기반,
  생성자에서 gcd 약분) + `simplex.js`/`solve.js`/`matrix.js`(진짜 심플렉스법) + `cycle.js`(순환 레시피 탐지)를
  갖고 있다. 우리 `src/lib/rational.ts`·`solver.ts` 와 정면으로 대응된다.
  **가장 훔칠 만한 것**: `sankey.js` 의 `selfPath` / `backwardPath` — **자기순환과 역방향 흐름 전용 베지어
  경로 함수**다. 우리 `flow-layout.ts` 의 `link()` 는 위→아래 직각 경로만 그리고 역방향 간선을 위한
  전용 경로가 없다(§2 의 `is-loop` 는 클래스만 다르게 준다). Apache-2.0 이라 참고 가능하다.
- **factoriolab**: 순환 레시피를 그래프 트릭이 아니라 **선형계획법(GLPK)으로** 푼다. 우리 솔버가
  피드백 루프를 만나면 참고할 접근이다. 다만 번들 예산이 `initial: 950kB 경고 / 1.25MB 에러` —
  우리 아일랜드와 **두 자릿수 다른 체급**이라 프레임워크 전략은 정반대 노선으로 봐야 한다.
- **SatisfactoryTools**: 라이선스 분리 방식이 우리 CLAUDE.md 4항과 **같은 패턴**이다 — 코드는 MIT,
  게임 자산은 별도 고지로 재배포 금지. 우리 `LICENSE` 표기의 선례로 인용할 수 있다.
- **Sankeyfactory 가 우리와 스택이 가장 가깝다** — 프레임워크 없음, esbuild 단일 번들, 외부 의존성이
  `panzoom` 하나. `Tools/SatisfactoryRecipeExporter` 가 게임 `Docs.json` 을 직접 파싱하는 것도
  우리 `scripts/build-data.mjs` 와 같은 패턴이다. **다만 GPL-3.0 이라 코드를 가져오면 전파된다 — 읽기만 할 것.**
  *dist 에 `script.js` 가 커밋돼 있지 않아 번들 크기는 확인 못 함.*
- **rockfactory/satisfactory-logistics 는 우리와 이미 얽혀 있다.** `public/assets/map/manifest.json` 의
  출처 주석이 바로 이 프로젝트다 — 우리 지형 타일이 여기서 왔다(MIT). 그들의
  `scripts/generateMapTiles.ts` 는 **줌 0~6, webp 품질 80, lanczos 리샘플링**으로 타일을 굽는다.
  **우리 타일이 2단뿐인 것과 대조된다** — 확대 품질이 아쉬우면 여기 파라미터를 참고할 근거가 있다.

### 정적 데이터 사이트

- **jackyzha0/quartz** (MIT, 13.0k 별, 2026-08-18) — **철학적으로 가장 가까운 대형 사례**.
  자체 SSG + **Preact + `preact-render-to-string` SSR + esbuild**. 그래프 뷰·검색 같은 인터랙티브 요소를
  아일랜드 단위로 쪼갠 구조가 ADR-0009 와 같은 결론에 도달해 있다. 13k 별 규모에서 검증됐다는 것이 근거다.
- **observablehq/framework** (ISC, 3.6k 별) — 핵심 개념이 **"데이터 로더"**: 빌드타임에 임의 언어로 데이터를
  미리 계산해 정적 스냅샷으로 굳히고 페이지는 그것만 읽는다. **이건 우리 `build-data.mjs`(1단) →
  `build-app-data.mjs`(2단) 파이프라인에 이름이 붙은 것이다.** 빌드타임 계산과 클라이언트 재계산의 경계를
  어디에 둘지에 대한 그쪽 문서가 우리 파이프라인 설계 근거를 보강해 준다.
- **evidence-dev/evidence** (MIT, 6.9k 별) — Markdown 안에 SQL 을 박고 빌드타임에 실행해 결과를 정적
  페이지로 굳힌다. **"본문에 수치를 타이핑하지 않는다"는 우리 규칙을 극단까지 민 사례** — 저자가 손으로
  숫자를 못 쓰게 아예 강제한다. ADR-0019(빌드타임 SQL)와 같은 방향이다.
- **withastro/docs** (MIT, 1.7k 별) — Starlight 기반. zero-JS 기본값 + Pagefind 검색 + i18n 을 프레임워크
  레벨에서 해결한다. 우리 문서 화면 원칙의 대규모 검증 사례.

### 타일 피라미드 + 다수 마커를 정적/저JS 로 하는 곳이 있나 — **없다**

- **JLyne/LiveAtlas** (Apache-2.0, 379별, 2024-01-20 — 유지보수 낮음): Vue 3 + **포크한 Leaflet**.
- **granny/Pl3xMap** `webmap/` (MIT, 170별, 2026-07-29): webpack + **순정 Leaflet**.
- **BlueMap** (2.8k별): Three.js 기반 **3D WebGL** — 우리 문제와 종류가 다르다. 제외.
- rockfactory/satisfactory-logistics: react-leaflet.

**정직한 결론**: 이 생태계는 **예외 없이 Leaflet 으로 수렴한다.**
우리가 gzip 6.6KB 에 SVG viewBox 팬/줌 + 타일 피라미드 + 2,390 마커를 직접 구현한 것은
**조사 범위 안에서 비교 대상이 없는 독자적 해법**이라는 뜻이지 "다들 이렇게 한다"는 근거가 있는 방식이 아니다.
Leaflet 계열이 쓰는 마커 클러스터링이나 Canvas 마커 렌더링은 마커 수가 늘 때의 표준 대응책인데,
우리는 SVG DOM 마커 2,390개를 그대로 쓰고 있다. *다만 이건 예상이고 실제 프레임 성능은 측정하지 않았다 —
확인 필요.* §4 의 뷰포트 컬링이 여기에 대한 번들 0 짜리 대응이다.

---

## 지금 도입할 것 3개

세 건 모두 **새 런타임 의존성이 0이고 번들이 늘지 않는다.** 그래서 고른 것이다.

1. **아이콘 573장을 PNG → WebP q82 로 바꾼다.**
   우리 아이콘으로 직접 재서 **−74%** 가 나왔다. dist 의 png 7.5MB → 약 1.9MB, 서비스워커 원자적 install 이
   14.5MB → 약 9MB 로 줄어든다. resvg 가 webp 를 못 읽으므로 PNG 원본은 `public/` 밖으로 옮겨 빌드 전용으로 남긴다.

2. **세이브 파싱을 웹 워커로 옮기고, 파서 청크를 SW 프리캐시에서 제외한다.**
   Vite 8.2.1 소스로 서브패스 base 문제가 없음을 확인했고, Comlink 는 호출이 하나뿐이라 값을 못 한다(제외).
   지금은 지연 로딩이 SW 프리캐시에 의해 **무효화되어 있다** — 세이브를 안 쓰는 방문자도 279KB 를 받는다.
   워커 이전과 `EXCLUDE` 추가는 한 묶음으로 해야 의미가 있다.

3. **인터랙티브 지도에서 `role="img"` 를 걷어내고 키보드 팬/줌 + 구조화된 목록 대체물을 붙인다.**
   지금은 WAI-ARIA 1.2 `img` role 의 Presentational Children 규칙 때문에 **마커 2,390개가 접근성 트리에서
   통째로 사라진다.** 키보드로 지도를 못 움직이는 것은 WCAG 2.1.1 **Level A** 위반이다. 선택 사항이 아니다.
   목록 대체물에 쓸 데이터는 이미 props 로 넘어와 있다. (정적 흐름도·도면의 `role="img"` 는 **옳으니 그대로 둔다**.)

## 나중에 볼 것

- **지도 핀치 줌 + 휠 델타 정규화** (자체 구현 약 45줄). d3-zoom(15.1KB gzip)은 아일랜드를 3.3배로 만든다 — 거절.
- **마커 뷰포트 컬링**, 단 줌이 일정 이상일 때만. 타일에 쓰는 `visible()` 을 재사용. 번들 0.
  먼저 실제 프레임 성능을 재고 나서 판단한다 — 지금은 느리다는 증거가 없다.
- **`@dagrejs/dagre` 를 devDependency 로만** 써서 `flows.ts` 의 손으로 적은 레이어·열 번호를 생성.
  클라이언트 번들 0KB. "수치를 손으로 타이핑하지 않는다"는 규칙을 도면 좌표까지 확장하는 건이다.
- **설계판 다중 선택**(마퀴 + `Set<number>`, 약 80줄) + **SC 2.5.7 대응 순차 클릭 이동**. 번들 0.
- **`fetchpriority="high"` + LCP 아이콘의 `loading` 해제**. 먼저 Lighthouse 로 각 페이지 LCP 요소를 특정할 것.
- **`@tanstack/virtual-core`**(6.6KB gzip, 의존성 0, Preact 가능) — **수천 행짜리 화면이 실제로 생기면.** 지금은 없다.
- **지도 타일 레벨 추가** — rockfactory 의 `generateMapTiles.ts`(줌 0~6, webp q80, lanczos)를 참고.
- **`buildings/` webp 27장 유산 정리** — 화면 코드가 아무도 안 쓴다.

## 도입하지 말 것

- **ELK.js** — EPL-2.0 OR GPL-3.0(원문 확인, 우리 라이선스 기준 위반) + gzip 423KB. 포트를 지원하는 유일한
  후보였다는 점이 아깝지만 두 가지 다 걸린다.
- **tldraw** — 독점 라이선스(LICENSE.md 원문 확인, npm `SEE LICENSE IN`). 오픈소스가 아니다.
- **deck.gl / MapLibre / PixiJS / OpenSeadragon / Leaflet** — gzip 451 / 248 / 245 / 85 / 41.7 KB.
  우리 지도 아일랜드(6.6KB)의 6~68배. 게다가 우리 타일이 2단·5×5 라 쿼드트리 전제와 안 맞는다.
- **Konva / Fabric / PixiJS(에디터로)** — 크기 이전에 `resvg` 서버 렌더 품질 게이트를 파괴한다. SVG 를 포기할 수 없다.
- **`@xyflow/react`** — React 전용(peer `react>=17` + zustand), `compat: false` 를 깨야 한다.
  게다가 레이아웃 엔진이 아니라서 크기를 내고도 부산물·순환 문제가 그대로 남는다.
- **`@panzoom/panzoom` / `svg-pan-zoom`** — CSS/`<g>` transform 방식이라 `vector-effect: non-scaling-stroke` 가
  무력화된다. 우리가 이미 겪고 고친 버그로 되돌아간다.
- **Comlink** — 호출이 하나뿐인 계약에서 1.9KB 를 내고 얻는 게 없다. transferable 도 어차피 직접 적어야 한다.
- **virtua / react-window** — Preact 어댑터가 없다(virtua 의 프레임워크 무관 코어는 `unstable_core`).
- **AVIF** — 우리 아이콘 실측에서 WebP 대비 **6%p** 차이뿐. 파이프라인 복잡도를 살 값이 아니다.
- **CSS 스프라이트 시트** — 한 페이지가 573장을 다 쓰지 않아 통짜 시트는 손해고, `<img alt>` 를 잃는다.
  WebP 전환만으로 −74% 가 나온다.
- **threads.js** — 2024-06-19 이후 푸시 없음(사실상 정지).
- **가상 스크롤로 인라인 HTML 대체** — ADR-0009 의 핵심 결정을 되돌리는 것이다. 그 결정은 실제 버그 4건에서 나왔다.
