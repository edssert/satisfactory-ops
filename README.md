# satisfactory-ops

**Satisfactory 공장 설계 플레이북** — 마일스톤 단위로 "지금 할 일"과 "지금 남겨둬야 할 것"을 알려주는, 내 진행 상황을 아는 안내서.

> ⚠️ 비공식 팬 프로젝트입니다. Coffee Stain Studios와 무관합니다.

## 왜 또 만드나

기존 Satisfactory 도구는 전부 **계산기**다. "보강된 철판(Reinforced Iron Plate) 5/분에 기계 몇 대?"는 답해주지만, **"지금 뭘 해야 하지?"** 와 **"지금 이 배치가 왜 T6에 문제가 되지?"** 는 답하지 않는다.

Satisfactory는 설계 게임이다. 초반 결정이 수십 시간 뒤에 비용으로 돌아오는데, 플레이어가 그걸 아는 시점은 이미 늦었을 때다.

| 실패 | 드러나는 시점 | 진짜 원인 |
|---|---|---|
| 로드 밸런서로 지어 확장 불가 | T4~T5 | T2의 분배 방식 선택 |
| 나사가 전체 생산을 잡아먹음 | T6 | 대체 레시피를 안 모음 |
| 물이 없어 석탄 발전 불가 | T3 | 입지 선정 시 물 미고려 |
| 정유소 부산물 역류로 전면 정지 | T5 | 유체는 양쪽 산출을 다 빼야 함 |

이 앱은 그 정보를 **필요한 시점에** 준다.

## 기능

| 화면 | 상태 | 내용 |
|---|---|---|
| 마일스톤 체크리스트 | 구현됨 | 티어별 마일스톤 42개. 체크하면 현재 티어를 판정하고 다음 할 일 3가지를 제시 |
| 시작 가이드 | 구현됨 | 입지 선정(맵·노드 626개·거리 계산), 허브 업그레이드, 티어 1 자동화 계획 |
| 생산 계산기 | 구현됨 | 목표 개/분 → 기계·전력·원광 역산. 대체 레시피 토글. 순환 레시피는 **거부** |
| 용어집 | 구현됨 | 매니폴드가 왜 로드 밸런서보다 나은지. 필요해지는 티어 순 |
| 레퍼런스 표 | 구현됨 | 벨트·파이프 처리량, 채굴기 순도별 산출, 발전기 출력, 건물 전력 |
| 공장 성장 단계도 | 미구현 | Stage 0~6 배치·배관·배선 |
| 세이브 임포트 | 미구현 | `.sav`를 브라우저에서 파싱 (서버 전송 없음) |

## 개발

```bash
npm ci
npm run data     # 게임 설치본에서 데이터 재생성 (게임이 설치된 기기에서만)
npm run dev      # 개발 서버
npm run verify   # 데이터 검증 + 단위 테스트 + 타입 검사
npm run build    # 정적 빌드 (dist/)
```

`npm run data`는 게임 설치본의 `CommunityResources/Docs`를 찾아 읽는다. 게임이 없는 기기에서는
커밋된 `src/data/`를 그대로 쓰면 된다 — 앱 실행에 게임이 필요하지 않다.

## 원칙

**수치는 출처 없이 쓰지 않는다.** 모든 게임 데이터에 `source`와 `confidence`(`verified`/`consensus`/`disputed`)를 붙인다. 근거는 [`docs/research/`](docs/research/)에 남긴다.

**이견을 숨기지 않는다.** 출처가 갈리면 양쪽을 다 쓰고 어느 쪽이 왜 더 믿을 만한지 밝힌다.

**"왜"를 항상 붙인다.** 규칙만 주지 않는다.

**화면의 수치를 사람이 타이핑하지 않는다.** 아이템 이름·비용·처리량·기계 대수는 전부 게임 배포
데이터에서 빌드타임에 계산된다. 게임이 패치되면 `npm run data` 한 번으로 화면 전체가 따라간다.
데이터 검증 게이트(1단 13건 + 2단 18건)가 하나라도 실패하면 **파일을 쓰지 않고 빌드가 죽는다.**

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | 무엇을 왜 만드는가 |
| [`docs/FRD.md`](docs/FRD.md) | 기능 명세 |
| [`docs/TRD.md`](docs/TRD.md) | 기술 요구·품질 기준 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 구조·모듈 경계·데이터 흐름 |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | 데이터 스키마 |
| [`docs/DESIGN-BRIEF.md`](docs/DESIGN-BRIEF.md) | 시각 설계 지시서 |
| [`docs/adr/`](docs/adr/) | 결정과 근거 |
| [`docs/research/`](docs/research/) | 조사 원본 |
| [`CLAUDE.md`](CLAUDE.md) | 개발 지침 |

## 상태

**동작하는 v0.1.** 5개 화면이 실제로 돕니다 — 마일스톤 · 시작 가이드 · 계산기 · 용어집 · 레퍼런스.
아키텍처 결정은 ADR-0009~0013·0015·0017·0018로 확정했습니다.

기술 스택: Astro 7 정적 출력 + Preact 아일랜드 + TypeScript. 문서 화면은 JavaScript 0KB,
도구 화면만 아일랜드로 하이드레이션합니다. 서버가 없고, 진행 상황은 브라우저에만 저장됩니다.

## 라이선스

코드와 원본 저작물은 [MIT](LICENSE).

`public/assets/` 하위 이미지(월드 맵, 건물 아이콘)는 Coffee Stain Studios의 자산이며 [공식 위키](https://satisfactory.wiki.gg)에서 가져왔습니다. MIT 적용 대상이 아니며 비상업적 참조 용도로 포함되었습니다. 권리자께서 제거를 원하시면 이슈를 열어주세요.

## 관련 도구

이 앱이 하지 않는 것은 이들이 이미 잘합니다.

- [SCIM 인터랙티브 맵](https://satisfactory-calculator.com/en/interactive-map) — 노드 단위 자원 지도
- [Satisfactory Tools](https://www.satisfactorytools.com/production) — 정밀 생산 플래너
- [공식 위키](https://satisfactory.wiki.gg) — 전수 데이터베이스

## 데이터 출처

- 게임 수치: 게임 설치본이 배포하는 `CommunityResources/Docs/{en-US,ko}.json` (Coffee Stain Studios)
- 한국어 표시명: 게임 공식 한국어 로케일 ([ADR-0017](docs/adr/0017-korean-display-names.md))
- 자원 노드 좌표: [rockfactory/satisfactory-logistics](https://github.com/rockfactory/satisfactory-logistics) (MIT)
- 폰트: IBM Plex Mono (SIL OFL 1.1) — 라이선스 원문은 `public/fonts/`에 동봉
