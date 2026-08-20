# satisfactory-ops

**Satisfactory 공장 설계 플레이북** — 마일스톤 단위로 "지금 할 일"과 "지금 남겨둬야 할 것"을 알려주는, 내 진행 상황을 아는 안내서.

배포: **<https://edssert.github.io/satisfactory-ops/>**

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

## 화면

| 화면 | 내용 |
|---|---|
| **가이드** `/guide/` | 이 사이트의 본체. 게임의 해금 순서대로 "지금 무엇을 얼마나 지어야 하는가"를 짚는다. 하위 화면 **시작 지점 고르기**는 네 시작 지역의 자원을 노드 좌표에서 직접 세어 별점의 뜻을 풀어 준다 |
| **설계** `/planner/` | 실제 축척(미터)으로 공장을 짜는 도면판. "여기에 들어가나"까지 답한다 |
| **직접 만들기** `/builder/` | 목표 품목과 분당 수량을 넣으면 공정 전체를 펼친다. 유리수 산술이라 반올림 오차가 없고, 순환 레시피는 사용자가 켜야 나타난다 |
| **지도** `/map/` | 자원 노드 626개 + 수집품(슬러그·소머슬룹·머서 구체·하드 드라이브 화물칸) + 인게임 격자. 표시는 전부 SVG라 확대해도 선명하다 |
| **진단** `/checkup/` | `.sav`를 브라우저에서 읽어 지금 무엇이 병목인지 답한다. 게임이 설비마다 적어 두는 직전 5분 가동률을 쓰고, 벨트를 따라가 "굶는지 막혔는지"를 가른다. **파일은 기기를 벗어나지 않는다** |
| **도감** `/dex/` | 진행도와 무관하게 게임의 모든 해금·수치를 본다 — 티어 마일스톤 42, MAM 노드 120, 어썸 싱크 상점 173, 대체 제작법 110, 그리고 벨트·파이프·발전기 레퍼런스 표와 용어집 17건 |
| **업데이트 기록** `/versions/` | 바깥 공략을 읽을 때 어느 부분만 다시 확인하면 되는지 |

## 개발

```bash
npm ci
npm run dev      # 개발 서버 → http://localhost:4321/satisfactory-ops/
npm run build    # 정적 빌드 (dist/)
npm run verify   # 데이터 검증 + 단위 테스트 + 타입 검사 + 빌드 + 커버리지
npm run data     # 게임 설치본에서 데이터 재생성 (게임이 설치된 기기에서만)
```

Node 22 이상이 필요하다(`.nvmrc`).

`npm run dev`는 서버를 백그라운드로 띄우고 즉시 끝난다. 멈출 때는 `npx astro dev stop`.
`base`가 `/satisfactory-ops`라 루트 `/`는 404다.

`npm run data`는 게임 설치본의 `CommunityResources/Docs`를 찾아 읽는다. 게임이 없는 기기에서는
커밋된 `src/data/`를 그대로 쓰면 된다 — **앱 실행에 게임이 필요하지 않다.**

AI 에이전트로 이 저장소를 작업한다면 [`AGENTS.md`](AGENTS.md)를 먼저 읽는다.

## 원칙

**수치는 출처 없이 쓰지 않는다.** 모든 게임 데이터에 `source`와 `confidence`(`verified`/`consensus`/`disputed`)를 붙인다. 근거는 [`docs/research/`](docs/research/)에 남긴다.

**이견을 숨기지 않는다.** 출처가 갈리면 양쪽을 다 쓰고 어느 쪽이 왜 더 믿을 만한지 밝힌다.

**"왜"를 항상 붙인다.** 규칙만 주지 않는다.

**화면의 수치를 사람이 타이핑하지 않는다.** 아이템 이름·비용·처리량·기계 대수는 전부 게임 배포
데이터에서 빌드타임에 계산된다. 게임이 패치되면 `npm run data` 한 번으로 화면 전체가 따라간다.
데이터 검증 게이트(1단 13건 + 2단 18건)가 하나라도 실패하면 **파일을 쓰지 않고 빌드가 죽는다.**

**사용자 데이터는 기기를 벗어나지 않는다.** 서버가 없다. 진행 상황은 `localStorage`에만 있고,
세이브 파일 파싱은 전부 브라우저 안에서 끝난다.

## 기술

Astro 7 정적 출력 + Preact 아일랜드 + TypeScript. 런타임 의존성은 `preact`와 `@preact/signals` 둘뿐이다.

문서 화면은 JavaScript 0KB이고, 상태를 소유하는 화면만 아일랜드로 하이드레이션한다.
자체 생성 서비스워커가 전량 프리캐시해 오프라인에서도 동작한다.
생산 체인은 BigInt 유리수로 풀어 반올림 오차가 없다.

## 문서

| 문서 | 내용 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | AI 에이전트 진입 문서 — 명령·규칙·지뢰 |
| [`CLAUDE.md`](CLAUDE.md) | 개발 지침 |
| [`docs/PRD.md`](docs/PRD.md) | 무엇을 왜 만드는가 |
| [`docs/FRD.md`](docs/FRD.md) | 기능 명세 |
| [`docs/TRD.md`](docs/TRD.md) | 기술 요구·품질 기준 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 구조·모듈 경계·데이터 흐름 |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | 데이터 스키마 |
| [`docs/DESIGN-BRIEF.md`](docs/DESIGN-BRIEF.md) | 시각 설계 지시서 |
| [`docs/adr/`](docs/adr/) | 결정과 근거 (19건) |
| [`docs/research/`](docs/research/) | 조사 원본 (55건) |

## 기여

이슈와 PR을 환영합니다. 다만 이 저장소에는 지키는 규칙이 몇 개 있습니다.

1. **게임 수치에는 출처를 붙입니다.** 우선순위는 게임 배포 데이터 → 공식 위키 → 커뮤니티 합의 순이고,
   단일 출처 주장은 `disputed`로 표시합니다. 근거는 `docs/research/`에 남깁니다
2. **화면에 게임 수치나 아이템 이름을 타이핑하지 않습니다.** 데이터에서 가져옵니다
3. **`src/data/app/`과 `src/data/*.json`은 생성물입니다.** 손으로 고치지 말고 생성 스크립트를 고칩니다
4. **PR 전에 `npm run verify`가 통과해야 합니다**
5. 화면을 바꿨다면 스크린샷을 첨부해 주세요. 이 저장소는 눈으로 확인하지 않아 생긴 사고가 여러 번 있었습니다
6. 한국어로 써 주세요. 코드 식별자와 파일명만 영어입니다

자세한 절차는 [`AGENTS.md`](AGENTS.md)에 있습니다.

## 라이선스

코드와 원본 저작물은 [MIT](LICENSE).

`public/assets/` 하위 이미지(월드 맵, 건물 아이콘)는 **Coffee Stain Studios의 자산**이며 [공식 위키](https://satisfactory.wiki.gg)에서 가져왔습니다. MIT 적용 대상이 아니며 비상업적 참조 용도로 포함되었습니다. 권리자께서 제거를 원하시면 이슈를 열어주세요.

번들된 서체는 전부 SIL Open Font License 1.1입니다 — Wanted Sans(표시), Pretendard(본문), JetBrains Mono(수치).

## 관련 도구

이 앱이 하지 않는 것은 이들이 이미 잘합니다.

- [SCIM 인터랙티브 맵](https://satisfactory-calculator.com/en/interactive-map) — 노드 단위 자원 지도
- [Satisfactory Tools](https://www.satisfactorytools.com/production) — 정밀 생산 플래너
- [공식 위키](https://satisfactory.wiki.gg) — 전수 데이터베이스

## 데이터 출처

- 게임 수치: 게임 설치본이 배포하는 `CommunityResources/Docs/{en-US,ko}.json` (Coffee Stain Studios)
- 한국어 표시명: 게임 공식 한국어 로케일 ([ADR-0017](docs/adr/0017-korean-display-names.md))
- 자원 노드·수집품 좌표: [rockfactory/satisfactory-logistics](https://github.com/rockfactory/satisfactory-logistics) (MIT)
- 세이브 파서: [@etothepii/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser)
