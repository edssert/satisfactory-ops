# Satisfactory 시각 아이덴티티 리서치

조사일: 2026-08-19 (WebSearch/WebFetch 기반, 기억·추측 배제)

## 0. 결론 요약

- **공식 컬러 스펙 문서는 존재하지 않는다.** Coffee Stain은 브랜드 가이드라인/색상 스와치 PDF를 공개 배포하지 않는다 (`satisfactorygame.com/press/`에 프레스킷 Google Drive 링크만 존재, 접근 시 상세 색상값 확인 불가). 아래 hex 값들은 전부 **팬 커뮤니티가 게임 UI/텍스처를 스포이드(color-pick)해서 역산출한 값**이며, 게임 버전에 따라 소폭 다를 수 있다. "공식"이 아니라 "커뮤니티 합의값"으로 취급할 것.
- FICSIT의 시그니처 오렌지는 산업 안전색(Safety Orange, International Orange) 계열의 변형이지 그 자체는 아니다. 정확한 단일 hex보다는 "채도 높은 주황 + 짙은 회색/차콜"의 **조합**이 아이덴티티의 본질이다.
- 팬 사이트들의 실패 패턴은 거의 예외 없이 하나다: **오렌지를 과다 사용해 채도 피로를 유발**하는 것. 성공한 사이트는 오렌지를 포인트로만 쓰고 배경은 짙은 중성색(차콜/다크그레이)으로 채운다 — 이는 게임 자체의 UI 원칙과도 일치한다.
- 저작권 관점에서는 Coffee Stain의 명시적 "Fan Content Policy" 문서를 찾지 못했다 (Riot/WotC류 공식 정책 페이지 부재). 대신 위키 disclaimer가 "게임사와 비제휴, 상표권 재허가 불가"를 명시하는 정도가 가장 공식에 가까운 문구다. 즉 팬 프로젝트는 **일반 상표법 원칙(혼동 유발 금지, 공식 승인 오인 방지, 로고 직접 도용 금지)**에 기대야 하며, Coffee Stain이 별도로 관대한 라이선스를 명문화한 근거는 없다.

---

## 1. FICSIT Inc. 브랜딩 — 로고·색·톤·유머

### 1.1 로고 / 마스코트
- FICSIT 로고는 **"V" 형태의 심볼**을 기본으로 하며, 상황에 따라 형태가 바뀐다 — 엘리베이터에서는 화살표로, 크리스마스 시즌 이벤트에서는 시즌 그래픽으로 변형된다. (출처: [FICSIT - NamuWiki](https://en.namu.wiki/w/FICSIT))
- 공식 마스코트 이름은 **Checkit**이며, 공식 아트워크에 로고와 함께 등장한다. (출처: 상동)

### 1.2 컬러
- 브랜드 컬러 조합은 **주황(오렌지) + 짙은 회색(다크 그레이/차콜)**. 이 조합이 건물, 우주선(드롭포드), 장비 등 게임 전반의 기본 스킨에 반복적으로 사용되며, 플레이어가 팩토리 커스터마이저로 자유롭게 바꿀 수 있는 "기본값"이라는 점이 핵심이다. (출처: [FICSIT - NamuWiki](https://en.namu.wiki/w/FICSIT))
- 커뮤니티가 텍스처에서 추출한 근사 오렌지: **`#FA9549`** (color-hex.com의 "FICSIT Factory Swatch" 팔레트, 접근 제한으로 직접 재확인은 못했으나 WebSearch 스니펫에서 확인). 참고 산업 표준색:
  - Safety Orange (ANSI): **`#FF7900`** (RGB 255,121,0) — [Wikipedia: Safety orange](https://en.wikipedia.org/wiki/Safety_orange)
  - International Orange: 항공/건축용 표준 주황 (FICSIT 톤과 계열 유사, 정확 일치는 아님) — [Wikipedia: International orange](https://en.wikipedia.org/wiki/International_orange)
  - 결론: FICSIT 오렌지는 이 두 표준색보다 **약간 노란 기가 섞인, 채도는 낮추고 명도는 올린 변형**으로 보인다 (`#FA9549`가 `#FF7900`보다 R값 근접·G값 높음·B값 대폭 상승).

### 1.3 사내 문서/표지판 톤 & 유머 코드
- 모토: **"Construct, Automate, Explore & Exploit."** — "Exploit"의 이중의미(생산적 활용 vs 착취)를 의도적으로 사용해 기업 풍자를 노림. (출처: [FICSIT - NamuWiki](https://en.namu.wiki/w/FICSIT))
- 직원(플레이어)은 공식적으로 **"FICSIT property"**로 지칭되며, 경고문에도 "FICSIT property destruction risk" 같은 표현이 쓰인다. 사망한 착륙선 잔해가 맵 곳곳에 있고 플레이어는 "세 번째로 성공한 착륙 사례"라는 설정 — 노동 착취적 기업 문화를 어둡게 풍자하는 코드. (출처: 상동)
- 개발사 자체 톤도 동일 계열의 데드팬 유머: *"You thought Goat Simulator was realistic, but wait until you see Satisfactory! We only make the most realistic of simulators. Exactly."* (출처: [Coffee Stain Studios - Official Satisfactory Wiki](https://satisfactory.wiki.gg/wiki/Coffee_Stain_Studios))
- **적용 시사점**: FICSIT 톤을 모사하려면 단순히 "밝고 신나는 기업 카피"가 아니라, **관료적·안전제일주의 문구 + 은근한 블랙코미디**(직원을 자산 취급하는 뉘앙스)를 섞어야 진짜 같다.

---

## 2. 게임 UI 디자인 (HUD/메뉴/빌드건)

- 공식 위키(HUD 문서)는 기능 배치만 기술하고 색상·서체·아이콘 스타일에 대한 구체 스펙을 공개하지 않는다: 상단 나침반, 하단 핫바+단축메뉴, 좌측 체력/장비 상태, 우측 마일스톤/할 일 목록. 0.5.0.0 패치에서 "전체 UI 아이콘 갱신"이 있었다는 언급만 존재. (출처: [HUD - Official Satisfactory Wiki](https://satisfactory.wiki.gg/wiki/HUD))
- **UI 서체명은 공개 자료로 확인 불가.** 팬 모드 킷(`sfuikit`, GitHub: deantendo/sfuikit)이 존재해 UI 재현을 시도하지만, 검색 스니펫만으로는 정확한 폰트명을 특정하지 못했다 — 이 부분은 **미확인으로 남긴다** (추측 금지 원칙에 따라 서체명 기재하지 않음). 재확인이 필요하면 게임 파일 내 `.ufont`/`.uasset` 직접 추출이 필요.
- 실무적으로 참고할 수 있는 값: 팬 제작 "FICSIT Standard Industrial Color System(SICS)" 사이트(비공식, [earthserpent89.github.io/SatisfactoryColors](https://earthserpent89.github.io/SatisfactoryColors/))가 UI/조명 디자인 원칙으로 제시하는 **"10% 룰"**: 팩토리의 90%는 중성 그레이(Grey/Structural)로, 고채도색(Red/Lime 등)은 포인트로만 10% 이내 사용. 이는 게임 자체 UI도 따르는 원칙과 유사 — HUD는 대부분 무채색/반투명 패널이고 경고·강조 요소만 원색을 쓴다.

---

## 3. 게임 내 아이템/자원 실제 색상 (커뮤니티 스포이드 값)

출처: [Steam 커뮤니티 토론 - Colour hex codes](https://steamcommunity.com/app/526870/discussions/0/591757083455605464/) (플레이어가 직접 텍스처에서 추출해 공유한 값. 비공식.)

| 항목 | Hex | 비고 |
|---|---|---|
| Iron Ore | `#989FA9` | 밝은 청회색 |
| Iron Ingot | `#989A9D` | |
| Iron Plate | `#BCBEC1` | |
| Iron Rod | `#0D0D0F` | (거의 검정, 가공 후 도장 색) |
| Iron Gray (범용 그레이) | `#69717C` | |
| Caterium Ore | `#A7AAB7` (Gray 계열 명칭) | *주의: 위키 텍스트 설명은 "reddish-brown spots / gold cracks"로 금색·적갈색 표현 — 스와치명(Gray)과 실제 시각 인상이 다를 수 있어 교차검증 필요* |
| Raw Quartz | `#767676` | 회색 |
| Sulfur | `#867F7D` | 회색 계열 (황 특유의 노란빛은 텍스처 디테일에 의존, 베이스 스와치는 무채색) |
| Concrete | `#EEEBEA` | |
| Aluminum Ingot | `#D2D3D4` | |
| Aluminum Casing | `#C7C9CB` | |
| Aluminum Scrap | `#BCC0C9` | |
| Aluminum Sheet | `#9EA0A2` | |
| Alumina Solution | `#DDDEDF` | |
| Silica | `#D8DDE7` | |
| Coal | `#0B0B19` | 짙은 남흑색 |
| Coke | `#030309` | |
| Steel (계열) | `#0A090F` | |
| Steel Beam | `#0C0909` | |
| Steel Pipe | `#222020` | |
| Water | `#1662AD` | |
| Crude Oil | `#161718` | 거의 검정 |
| Heavy Oil Residue | `#9021B8` | 자주색 |
| Fuel | `#F89800` | 오렌지 (FICSIT 브랜드 오렌지와 근접 계열) |
| Turbofuel | `#F40000` | |
| Liquid Biofuel | `#51BD2C` | |
| Sulfuric Acid | `#FFF03A` | 형광 옐로 |
| Nitric Acid | `#F7FAD7` | 옅은 연두-화이트 |
| Plastic | `#3091E6` | 청색 |
| Polymer Resin | `#0D0087` | 짙은 남색 |
| Plutonium Pellet | `#00B9FB` | 시안 |
| Uranium | `#88D288` | 연두색 |
| AI Limiter | `#060606` | |
| Battery | `#1B1C30` | |
| Computer | `#1C1C1C` | |
| Rubber | `#202020` | |

**미확인(공식/비공식 어느 쪽으로도 hex를 찾지 못함)**: 순수 Copper Ore/Ingot, Limestone, Bauxite Ore, Uranium Ore(가공 전), SAM(SAM Ore/SAM Fluctuator). 이 항목들은 위 Steam 토론 스레드에도 없었고, 별도로 시도한 팬 제작 종합 컬러 테이블(`tai-jee.github.io/satisfactory-colour-table`)은 JavaScript 렌더링 사이트라 정적 fetch로는 데이터를 못 읽었다 — **실제로 값이 필요하면 브라우저로 직접 열람하거나 게임 텍스처를 스포이드해야 한다.** 이 문서에서 값을 지어내지 않았다.

---

## 4. 팬 사이트/도구의 아이덴티티 차용 사례

| 사이트 | 성격 | 관찰 |
|---|---|---|
| [FICSIT Planner](https://www.ficsitplanner.com/) | 생산 계산기 | 이름부터 "FICSIT" 직접 차용 (팬 프로젝트 관행상 흔하지만, 상표 오인 유발 소지 있음) |
| [Satisfactory Calculator](https://satisfactory-calculator.com/) | 계산기/위키/DB | 자체 브랜드명 "[SCIM]"을 병기해 공식과 구분 시도 |
| [SatisfactoryTools](https://u4.satisfactorytools.com/production) | 생산 계획 | 서브도메인 구조(`u4.`)로 버전 분리 운영 |
| [Official Satisfactory Wiki (wiki.gg)](https://satisfactory.wiki.gg/) | 공식 협업 위키 | disclaimer 페이지에서 상표권 비제휴를 명문화 — 팬 프로젝트 법적 문구의 모범 사례 |
| [earthserpent89.github.io/SatisfactoryColors](https://earthserpent89.github.io/SatisfactoryColors/) | 비공식 "FICSIT Standard Industrial Color System" | 게임 내 존재하지 않는 자체 색채 체계를 "산업 표준"처럼 포장 — 세계관 몰입형 UX 카피는 좋으나, 이름이 공식처럼 읽혀 정보 신뢰도 오인 유발 가능 (촌스럽다기보다 "위험한 모호함" 사례) |

직접 톤 비교를 위해 각 사이트의 실제 CSS/색상표까지는 접근 제한(403, JS 렌더링)으로 확인하지 못했다. **판단**: 이 바닥에서 성공/실패를 가르는 건 로고 도용 여부가 아니라 "오렌지를 배경색으로 쓰느냐 포인트로 쓰느냐"다. FICSIT 원본은 오렌지를 산업 경고색처럼 좁게 쓰고 나머지는 콘크리트/스틸 톤 중성색인데, 팬 사이트가 헤더 전체·버튼 전체를 오렌지로 도배하면 즉시 "짝퉁 배너 광고" 느낌이 난다.

---

## 5. 저작권/상표 — 팬 프로젝트가 지켜야 할 선

- Coffee Stain Studios/Embracer가 발행한 **명시적 "Fan Content Policy" 문서(Wizards of the Coast류)는 검색 범위 내에서 확인되지 않았다.** 이는 정책 부재를 의미하는 게 아니라, **팬이 기댈 수 있는 공식 안전지대가 명문화되어 있지 않다**는 뜻이므로 더 보수적으로 움직여야 함을 시사한다.
- 가장 근접한 공식-유사 문구는 위키 disclaimer: *"Any of the trademarks... are the property of their respective owners"*, *"neither endorsed nor affiliated... cannot grant any rights to use any otherwise protected materials."* (출처: [Satisfactory Wiki:General disclaimer](https://satisfactory.wiki.gg/wiki/Satisfactory_Wiki:General_disclaimer)) — 위키 자체도 로고·상표 사용권을 대신 부여할 수 없다고 스스로 못박는다.
- 모드 관련해서는 Coffee Stain이 유튜브 영상("Answering common questions about Mods in Satisfactory")으로 입장을 밝힌 바 있고, Steam 토론 요약상 **"모드에 우호적이나 자체 지원은 1.0 이후"**라는 취지였다 — 단, 이 정보의 출처 스레드는 1.0 출시 이전 시점 논의로 추정되며 **현재(2026년, 게임은 이미 2024년 1.0 출시됨) 기준 최신 공식 입장인지는 재검증 필요**. 오래된 정보로 취급할 것.
- 실무 가이드라인 (일반 상표법 원리에 근거한 판단, 공식 출처 아님):
  1. FICSIT 로고 원본 이미지·게임 아이콘 원본 애셋을 그대로 재배포/재판매하지 않는다.
  2. 사이트/제품명에 "FICSIT" 또는 "Satisfactory"를 단독 브랜드처럼 전면에 내세우면 공식 오인 소지 — "Unofficial", "Fan-made" 명시가 안전.
  3. 색상 팔레트(오렌지+차콜 톤)를 모사하는 것 자체는 저작권 침해가 아니다(색상 조합은 일반적으로 보호 대상이 아님) — 다만 로고 심볼("V" 마크) 형태를 그대로 베끼는 것은 다른 문제.
  4. 상업적 판매(굿즈 등)로 갈수록 위험이 커짐 — 계산기/위키 같은 비영리·정보 제공형 팬 사이트는 관례적으로 용인되는 편이나, 이는 업계 관행이지 Coffee Stain의 명문화된 허가는 아니다.

---

## 6. 리서치 한계 (명시)

- 게임 UI의 정확한 서체명 미확인.
- Copper, Limestone, Bauxite, Uranium Ore, SAM 계열 hex 미확인.
- Coffee Stain의 공식 브랜드 가이드라인 PDF(프레스킷 내부)는 Google Drive 링크 진입 제한으로 미열람.
- 다수 색상 값은 "공식 발표"가 아닌 "플레이어 스포이드 값"이라는 정확도 한계가 있음 — 정밀 작업(인쇄물 등)에는 재검증 권장.
