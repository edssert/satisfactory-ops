# satisfactory-ops

**Satisfactory 공장 계산·설계·검증 웹앱** — 게임 데이터 기반 생산 계산, 진행 계획, 실축 수동 배치,
세이브 진단, 시공 도면 출력을 하나의 로컬 우선 작업 흐름으로 제공한다.

배포: **<https://edssert.github.io/satisfactory-ops/>**

> ⚠️ 비공식 팬 프로젝트입니다. Coffee Stain Studios와 무관합니다.

## 제품 범위

제품의 핵심 계약은 생산 목표를 계산한 뒤 동일한 데이터와 설정을 설계판, 공정 검증, 세이브 대조,
도면 출력까지 유지하는 것이다. 계산기는 부가 기능이 아니며 복수 목표, 대체 제작법, 순환·부산물,
추출·물류 제약, 클럭·강화 자원, 전력, BOM을 다루는 핵심 도메인으로 개발한다.

## 화면

| 화면 | 내용 |
|---|---|
| **가이드** `/guide/` | 해금 순서, 시공 조건, 현장 검증, 확장 예약을 게임 데이터와 근거에 따라 제공한다 |
| **설계** `/planner/` | 실제 축척(미터)으로 공장을 짜는 도면판. "여기에 들어가나"까지 답한다 |
| **생산 계획** `/builder/` | 목표 품목과 제약을 입력해 공정, 원자재, 전력, 물류, BOM을 계산한다. RFC-0001에 따라 복수 목표와 순환·부산물 최적화를 확장한다 |
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

AI 에이전트로 이 저장소를 작업한다면 [`AGENTS.md`](AGENTS.md)와
[`문서 관리 규격`](satisfactory-ops-vault/docs/DOCUMENTATION.md)을 먼저 읽는다.

## 원칙

**수치는 출처 없이 쓰지 않는다.** 모든 게임 데이터에 `source`와 `confidence`(`verified`/`consensus`/`disputed`)를 붙인다. 근거는 [`볼트의 research`](satisfactory-ops-vault/docs/research/)에 남긴다.

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
비순환 생산 체인은 BigInt 유리수로 풀어 반올림 오차를 제거한다. 순환·복수 목표·부산물 상쇄를 포함한
확장 범위와 승인 조건은 [`PRODUCT`](satisfactory-ops-vault/docs/PRODUCT.md)와 [`ROADMAP`](satisfactory-ops-vault/docs/ROADMAP.md)에서 관리한다.

## 문서

| 문서 | 내용 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | AI 에이전트 진입 문서 — 명령·규칙·지뢰 |
| [`CLAUDE.md`](CLAUDE.md) | 개발 지침 |
| [`satisfactory-ops-vault/PROJECT-HUB.md`](satisfactory-ops-vault/PROJECT-HUB.md) | 독립 Obsidian 볼트 진입점과 실행 우선순위 |
| [`PRODUCT`](satisfactory-ops-vault/docs/PRODUCT.md) | 제품 범위·기능·품질·완료 조건 |
| [`ENGINEERING`](satisfactory-ops-vault/docs/ENGINEERING.md) | 프레임워크·모듈·데이터·검증 경계 |
| [`DESIGN`](satisfactory-ops-vault/docs/DESIGN.md) | 시각 설계·모션·테마·진화 규격 |
| [`ASSETS`](satisfactory-ops-vault/docs/ASSETS.md) | 게임 자산·탑뷰·토대·운송 자산 규격 |
| [`DECISIONS`](satisfactory-ops-vault/docs/DECISIONS.md) | 현재 유효한 중요 결정 |
| [`ROADMAP`](satisfactory-ops-vault/docs/ROADMAP.md) | 실행 순서·검증 상태·단계 종료 조건 |
| [`Research`](satisfactory-ops-vault/docs/research/README.md) | 다시 검증한 외부 근거와 조사 대기열 |

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

## 교차 검증 도구

다음 도구는 기능 범위와 계산 결과를 독립적으로 대조하는 기준으로 사용한다. 외부 링크가 내부 기능 결손을
대체하지 않는다.

- [SCIM 인터랙티브 맵](https://satisfactory-calculator.com/en/interactive-map) — 노드 단위 자원 지도
- [Satisfactory Tools](https://www.satisfactorytools.com/production) — 정밀 생산 플래너
- [공식 위키](https://satisfactory.wiki.gg) — 전수 데이터베이스

## 데이터 출처

- 게임 수치: 게임 설치본이 배포하는 `CommunityResources/Docs/{en-US,ko}.json` (Coffee Stain Studios)
- 한국어 표시명: 게임 공식 한국어 로케일 ([D-011](satisfactory-ops-vault/docs/decisions/REGISTER.md))
- 자원 노드·수집품 좌표: [rockfactory/satisfactory-logistics](https://github.com/rockfactory/satisfactory-logistics) (MIT)
- 세이브 파서: [@etothepii/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser)
