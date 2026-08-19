# 다층(3D) 공장 설계 관행 조사

- 조사일: 2026-08-19
- 목적: `docs/research/layout-design-tools.md` §9 미해결 항목 5번("층고 표준의 실측 근거")을 메운다.
  그 문서는 "8m가 자연스럽다"를 **리프트 최소 7m에서 역산한 것**이라고 스스로 밝혔다 — 커뮤니티가
  실제로 8m를 쓰는지는 별도 확인이 필요했다.
- 방법: 공식 위키(satisfactory.wiki.gg) 빌딩 인포박스 직접 대조 + Steam 커뮤니티 토론 스레드 원문 발췌.
  Reddit/r.SatisfactoryGame·questions.satisfactorygame.com은 검색했으나 이 주제에 대한 유의미한
  스레드를 찾지 못했다(아래 "확인 못 함" 참조) — 실제로 인용된 것은 전부 Steam 토론과 공식 위키다.
- 게임 버전: 인용 스레드는 대부분 1.0 출시(2024-09) 이후로 보이나, Steam 토론은 날짜만 있고 게임
  버전 표기가 없는 경우가 많다. 버전이 확인되지 않는 스레드는 항목별로 명시했다.

---

## 0. 결론 먼저

| 질문 | 답 | confidence |
|---|---|---|
| 8m가 "표준"인가 | **아니다.** 커뮤니티에 단일 표준 층고는 없다. 다만 **"7m가 실질적 하한"**이라는 점은 여러 독립 스레드가 일치한다 — 컨베이어 리프트 최소 높이가 7m이기 때문 | consensus (하한 7m) / 8m 자체는 unsourced-as-"표준" |
| 벨트는 어디로 다니는가 | 셋 다 실제로 쓰인다: 머리 위(overhead), 바닥 아래(sub-floor), 별도 "물류 층"(logistics floor). 바닥 아래/물류 층이 미관상 더 선호된다는 진술이 다수지만, 반례(머리 위 배치를 명시적으로 선호)도 있다 | disputed |
| 바닥 아래는 어떻게 짓는가 | 파운데이션에 **층 구멍(Floor Hole)**을 뚫고 그 밑에 벨트 공간을 만드는 것이 기본. "이중 파운데이션 층"이라는 고정된 이름의 공법은 확인 못 함 — 실제로는 리프트/구멍/기둥(Pillar)을 조합하는 여러 변형이 있다 | consensus (구멍+리프트 원리) / 세부 공법은 개인차 큼 |
| 캣워크는 실제로 필요한가 | **기계 작동 자체에는 불필요.** 위키는 "사람이 걷기 위한 것"이라고만 서술하며 정비 접근을 요구 조건으로 언급하지 않는다. 즉 관행이지 강제 사항이 아니다 | consensus |
| 이름 붙은 수직 패턴이 있는가 | "물류 층(logistics floor)"은 커뮤니티 용어로 자리 잡았다. "매니폴드 타워", "버티컬 스파게티" 같은 고정된 밈적 명칭은 검색으로 확인 못 함 — 있다면 개인 조어 수준 | disputed / 확인 못 함 |
| 언제 수직화를 피하나 | 명시적 "이래서 하지 마라" 논쟁은 거의 못 찾았다. 다만 엘리베이터 부재로 초반 수직 이동이 불편하다는 불만은 많다 | 부분 확인 |
| 블루프린트 디자이너 내부 높이 | **32×32×32m 확인됨** (Mk.1). 바닥면적뿐 아니라 **높이도 32m로 동일** — 사용자 가정("바닥은 32×32, 높이는 미확인")은 틀렸다. 실제로는 3축 전부 32m | verified |

---

## 1. 층고(floor-to-floor spacing) 후보값

`layout-design-tools.md`가 이미 게임 데이터로 확정한 것: 파운데이션은 수직 1m 단위로 스냅되고,
컨베이어 리프트는 **최소 7m**가 필요하다(Steam 토론 [층 구멍과 리프트](https://steamcommunity.com/app/526870/discussions/0/2451595019856732897/) 인용, `layout-design-tools.md` §6). 이번 조사는 이 위에 커뮤니티가
실제로 쓰는 값을 덧붙인다.

| 후보 층고 | 근거 | 출처 | confidence |
|---|---|---|---|
| **7m** | "물류 층(logistic floor)은 최소 7m 헤드스페이스로 시작하라. 벨트 3단을 쌓은 높이와 정확히 같다" — 컨베이어 리프트 최소 높이(7m)와도 일치 | Steam 토론 [Need guide for building vertical factories](https://steamcommunity.com/app/526870/discussions/0/4843148592919098595/), 유저 *Clumsy* | consensus (2개 독립 스레드가 "7m가 하한"에 동의) |
| **8m** | 사용자가 사전에 전제한 값(파운데이션 스냅 8m 격자와 정렬, 기계 최대 높이 6m + 여유 2m). 검색 스니펫 중 "8m free space로 벨트 7~8단"이라는 진술이 있었으나 **원문 스레드를 직접 찾지 못해 정확한 인용·URL을 재확인할 수 없었다** | 재현 불가 (검색 엔진 요약에만 존재, 원문 스레드 URL 유실) | **unsourced** — 8m을 "커뮤니티 표준"이라 단정할 근거는 이번 조사에서 확보하지 못함. 다만 기계 충돌 박스(제작기 6m 최대) + 리프트 하한 7m를 모두 만족하는 **가장 작은 8m 배수**라는 점은 수치상 사실 |
| **11m** | "확신이 안 서면 11m를 써라. 벨트 4단을 쌓은 높이" | Steam 토론 [Need guide for building vertical factories](https://steamcommunity.com/app/526870/discussions/0/4843148592919098595/), 유저 *Clumsy* | consensus (같은 유저가 7m와 짝으로 제시 — 벨트 단수 기준의 일관된 체계) |
| **12m (벽 3장)** | "제련소·제작기·조립기·주조소·인더스트리얼 스토리지는 바닥/천장 최소 3벽(=기본 벽 4m×3)" | Steam 토론 [Building Heights](https://steamcommunity.com/app/526870/discussions/0/3062995463254393739/), 유저 *Vormina* | consensus (다른 유저의 정정 없이 스레드 내 받아들여짐). 단, 이는 게임 데이터 충돌 박스(제작기 6m)보다 크다 — **위키 인포박스의 시각 메시 높이 기준일 가능성이 높음** (아래 §1.1 참고) |
| **28m** | "기차역(20~21m)·어썸 싱크(24m)까지 한 층에 넣으려고 28m로 정착했다" | Steam 토론 [Building Heights](https://steamcommunity.com/app/526870/discussions/0/3062995463254393739/), 유저 *Colonel Sanders Lite* | disputed — 이건 "표준 층고"가 아니라 **특정 초대형 건물을 한 층에 우겨넣기 위한 개인 최적화**로 봐야 한다. 소형 기계 생산 라인에는 적용 안 됨 |
| **6m 이하** | 검색·인용 과정에서 "6m 층고를 쓴다"는 명시적 진술을 찾지 못했다. 제작기(6m)만으로도 여유 없이 꽉 차므로 실용성이 낮다는 것은 수치상 자명하나, 커뮤니티가 실제로 6m를 쓴다는 **1차 진술은 확인 못 함** | — | 확인 못 함 |

### 1.1 위키 인포박스 높이 vs 게임 데이터 충돌 박스 — 중요한 불일치

`layout-design-tools.md`가 `Docs.json`의 `mClearanceData`(충돌 박스)에서 뽑은 값과, 공식 위키
인포박스에 적힌 값이 **서로 다르다.** 이번 조사에서 위키를 직접 대조해 이 불일치를 재확인했다.

| 건물 | 게임 데이터 충돌 박스 (mClearanceData 합집합) | 위키 인포박스 높이 |
|---|---|---|
| 제련소 Smelter | 4.5 m | 8.5 m |
| 제작기 Constructor | 6 m | 8 m |
| 조립기 Assembler | 5 m | 11 m |

출처: 충돌 박스는 `layout-design-tools.md` §4 (`Docs.json`, Steam 빌드 24656030). 인포박스는
[satisfactory.wiki.gg/wiki/Smelter](https://satisfactory.wiki.gg/wiki/Smelter),
[.../Constructor](https://satisfactory.wiki.gg/wiki/Constructor),
[.../Assembler](https://satisfactory.wiki.gg/wiki/Assembler) (2026-08-19 확인).

**해석**: `layout-design-tools.md` §4가 이미 지적한 대로, 위키 표는 배출구 파이프·조명·장식
같은 **충돌 없는 시각 메시까지 포함한 전체 모델 높이**로 보이고, `mClearanceData`는 **실제로
다른 물체와 충돌하는 박스**만 잡는다. 배치 계산(다른 건물·바닥이 겹치는지)에는 충돌 박스가
맞지만, "천장까지 안 닿게 하려면 얼마나 비워야 하나"처럼 **미관까지 고려한 층고**를 정할 때는
위키의 더 큰 값(또는 그 이상의 실측치, 위 Vormina/Colonel Sanders Lite 진술)이 실전에 더
가깝다. 즉 **"제작기는 6m"라는 우리 쪽 정본 수치는 배치 충돌 계산에는 맞고, 층고를 정하는
미관 판단에는 부족할 수 있다.** confidence: consensus (두 데이터 소스가 각각 내적으로 일관되고,
그 차이의 원인(시각 메시 vs 충돌 박스)도 커뮤니티 스레드에서 독립적으로 언급됨 — Steam 토론
[Building Heights](https://steamcommunity.com/app/526870/discussions/0/3062995463254393739/)의
*Colonel Sanders Lite*: "Manufacturer의 충돌 모델은 8m지만 조명까지 포함한 실제 높이는 15m다").

---

## 2. 벨트는 어디로 다니는가 — overhead / sub-floor / 별도 물류 층

세 방식 모두 실제로 쓰인다는 것이 이번 조사의 결론이다. "정답"은 없고 트레이드오프가 있다.

| 방식 | 설명 | 장점(커뮤니티가 드는 이유) | 단점 |
|---|---|---|---|
| **바닥 아래(sub-floor)** | 파운데이션에 층 구멍을 뚫어 벨트를 바닥 밑 별도 공간에 숨긴다 | "기계에서 보이는 건 리프트 상단뿐이고, 지저분한 스파게티는 전부 바닥 밑에 정리된다" — *Huren Ogeko*, [Need guide for building vertical factories](https://steamcommunity.com/app/526870/discussions/0/4843148592919098595/). 미관이 깨끗하고, 나중에 로드 밸런싱을 위해 벨트를 다시 배선할 공간도 남는다는 진술도 있음 | 층고를 추가로 소비한다(물류 층 자체가 7~11m 필요) — 순수 생산 층보다 전체 건물이 높아짐 |
| **별도 물류 층(logistics floor)** | 생산 층 사이사이에 "벨트·스플리터·머저 전용 층"을 끼워 넣는다. 예: 조립기 층 → 물류 층 → 제작기 층 → 제련소/채굴기 층 | "2개 층마다 물류 층을 하나씩 끼우면 스파게티를 크게 줄일 수 있다" — 검색 요약 인용, 원 스레드는 [Need guide for building vertical factories](https://steamcommunity.com/app/526870/discussions/0/4843148592919098595/) 계열로 추정되나 정확한 유저명 재확인 못 함. *Dooma*는 "생산 층 위아래에 작은 전용 층을 둔다"고 명시 (같은 스레드) | 층 수가 늘어 전체 건물이 더 높아짐. 설계·시공 단계가 하나 늘어남 |
| **머리 위(overhead)** | 벨트를 기계 위 허공에 그대로 노출해서 배선한다 | 원 게시자 *ThanatosX*는 "기존 설계들의 클리핑이나 별도 층의 번잡함을 피하려고" 이 방식을 택했다고 명시 — 즉 sub-floor/물류층 자체가 "번잡함"으로 느껴지는 유저도 있다는 반증 | 벨트가 그대로 보여 미관이 떨어진다는 게 sub-floor 지지자들의 반박 논거 |

출처: [Need guide for building vertical factories](https://steamcommunity.com/app/526870/discussions/0/4843148592919098595/) (Steam, 유저 ThanatosX/Clumsy/Dooma/Fenix),
[Multi-floor 관련 토론](https://steamcommunity.com/app/526870/discussions/0/4843148768109490850) (Steam, 유저 ThanatosX/Huren Ogeko/Evilsod/Crunchy[Daz]).

**이견을 숨기지 않는다**: overhead vs sub-floor는 실제로 취향이 갈리는 주제다. sub-floor/물류층
지지자가 다수처럼 보이지만(발췌된 진술 수 기준), overhead를 명시적으로 선택한 유저도 "클리핑
회피"라는 구체적 이유를 댔다. 둘 다 유효한 선택지로 서술해야 한다. confidence: disputed.

---

## 3. 바닥 아래 물류(sub-floor logistics) — 구체적 시공법

**결론: "이중 파운데이션 층"이라는 하나의 고정된 이름의 공법은 없다.** 실제로는 파운데이션 +
층 구멍(Floor Hole) + 컨베이어 리프트/기둥(Pillar)을 조합하는 몇 가지 변형이 커뮤니티에서
관찰된다. 아래는 Steam 토론 [Floor hole through multiple foundations?](https://steamcommunity.com/app/526870/discussions/0/4625855423767972483/)에서 확인한 실제 기법들이다.

| 기법 | 방법 | 비고 |
|---|---|---|
| 1. 구멍-갭-구멍 체인 | 층 구멍이 뚫린 파운데이션을 놓고, 그 아래 빈 공간(갭)을 두고, 다시 층 구멍 파운데이션을 놓는 식으로 반복해서 이어간다("daisy-chain") | 내부는 비우고 바깥쪽만 막아서 벨트 공간을 만드는 방식 |
| 2. 갭마다 미니 리프트 | 각 갭 구간마다 짧은 컨베이어 리프트를 하나씩 심어서 파운데이션을 관통시킨다 | 여러 층을 통과할 때 반복 적용 |
| 3. 단일 두꺼운 파운데이션 | 필요한 총 간격이 표준 파운데이션 두께(2m/4m)와 맞아떨어지면, 그 두께의 파운데이션 하나에 층 구멍만 뚫는다 | 갭/리프트 여러 개보다 부품 수가 적어 더 효율적 |
| 4. 긴 리프트로 구멍 여러 개 관통 | 층 구멍이 연속으로 여러 개 있으면, 리프트 하나를 길게 뽑아 마지막 구멍까지 한 번에 연결한다 | 중간 커넥터를 줄임 |
| 미관 마감 | 리프트/파이프가 파운데이션을 관통하는 지점에 **작은 기둥(Small/Metal Pillar)**을 씌워 "떠 있는" 느낌을 없애고 배관처럼 보이게 한다 | 순수 미관 목적, 기능과 무관 |

출처: [Floor hole through multiple foundations?](https://steamcommunity.com/app/526870/discussions/0/4625855423767972483/) (Steam 토론, 여러 유저). confidence: consensus (같은 스레드 내에서 여러 유저가 유사한 방식을 공유·동의).

**층 구멍(Floor Hole) 자체의 시공 순서**(검색 요약에서 확인, 원문 재검증은 못 함): 먼저 천장
또는 바닥 기준으로 층 구멍을 정렬해서 놓고, 그다음 리프트를 그 구멍에 맞춰 놓은 뒤 방향을
설정하고, 마지막으로 나머지 리프트 구간을 이어 붙인다. confidence: 낮음(원문 URL 특정 못 함,
"확인 못 함"에 가까움) — 다만 이 순서 자체는 게임 UI 스냅 로직상 자연스러워 개연성은 높다.

**주의**: `Floor Hole and Ceiling Logistics`라는 이름의 **모드**가 존재한다
([SMR 페이지](https://ficsit.app/mod/Eav53pCM8yGNHD)). 이것은 **모드**이며 위에서
설명한 바닐라 기법과 혼동하면 안 된다 — 바닐라 층 구멍(Floor Hole)은 기본 게임에 이미 있는
빌딩 피스이고, 이 모드는 그 기능을 확장(예: 48m 리프트 한계 우회)하는 별도 애드온이다.
confidence: verified (모드 페이지 자체가 그렇게 서술).

---

## 4. 캣워크(Catwalk) / 워크웨이 치수와 정비 접근

| 항목 | 값 | 출처 | confidence |
|---|---|---|---|
| 캣워크/워크웨이 피스 규격 | 4m × 4m, 두께 2m 안팎(직선·회전·교차·T자·경사·계단 전 종류 공통) | [satisfactory.wiki.gg/wiki/Walkways](https://satisfactory.wiki.gg/wiki/Walkways) | consensus (기존 `layout-design-tools.md`의 "하프 파운데이션 폭, 2m 스냅"과 정합) |
| 정비를 위해 기계에 실제로 접근해야 하는가 | **아니다.** 위키는 캣워크를 "사람이 걷기 위해 만들어진 것"이라고만 서술하고, 기계 조작(레시피 변경, 우선순위 스플리터 설정, 전원 스위치 등)이 캣워크나 물리적 접근을 요구한다는 서술은 없다 | [satisfactory.wiki.gg/wiki/Walkways](https://satisfactory.wiki.gg/wiki/Walkways), 검색 요약 교차확인 | consensus |
| 그럼 왜 캣워크를 쓰는가 | 순전히 플레이어 편의(길찾기, 낙사 방지, 미관) 문제로 보인다 — "기계가 캣워크를 필요로 하는 게 아니라, 캣워크가 있으면 접근하기 더 쉬울 뿐"이라는 검색 요약 진술 | 검색 엔진 종합 요약 (개별 1차 스레드 URL 특정 못 함) | 낮음 — 방향성은 위키 서술과 일치하나 정확한 1차 인용은 확인 못 함 |

**설계 함의**: 이 앱의 도면 생성기가 캣워크를 "필수 통행로"로 강제할 근거는 없다. 캣워크는
사용자가 켜고 끌 수 있는 **선택적 편의 레이어**로 다뤄야 한다 — 게임 자체가 요구하지 않기 때문.

---

## 5. 이름 붙은 수직 패턴

검색 범위 안에서 커뮤니티가 **고정된 이름으로 반복 사용하는** 수직 패턴 용어는 다음 정도로
제한적이었다. "매니폴드 타워(manifold tower)"나 "버티컬 스파게티(vertical spaghetti)"를
관용구로 쓰는 스레드는 검색으로 찾지 못했다 — 있다면 개인 조어 수준이거나 이번 검색 범위
밖(디스코드, 유튜브 코멘트 등)에 있을 가능성이 있다.

| 패턴 | 설명 | 관찰된 근거 |
|---|---|---|
| **물류 층 (logistics floor)** | 생산 층 사이에 스플리터·머저·벨트 전용 층을 끼우는 패턴. 유일하게 여러 독립 유저가 같은 용어로 반복 사용 | [Need guide for building vertical factories](https://steamcommunity.com/app/526870/discussions/0/4843148592919098595/) (Clumsy, Dooma, Fenix 등 복수 유저) — consensus |
| **플랫폼 스태킹(platform stacking)** | 블루프린트 패턴 하나로, "기계를 플랫폼 위에 올리고, 그 아래 물류 층에 스플리터/머저를 두는" 모듈을 만든 뒤 빈 플랫폼을 더 쌓아 위로 늘려간다 | 같은 스레드, 유저 Fenix — 단일 출처, disputed(다른 유저의 확증 없음) |
| **리저 컬럼(riser column) / 수직 축 예약** | "리프트 전용 세로 통로를 미리 정해두고 각 층을 생산 단계별로 나눈다"는 조언 | 검색 요약(satisfactory 레이아웃 팁 사이트), 1차 포럼 스레드 확인 못 함 | 낮음 |
| ~~매니폴드 타워~~ | 검색으로 관용구 확인 못 함 | — | 확인 못 함 |
| ~~버티컬 스파게티~~ | 검색으로 관용구 확인 못 함. "스파게티"라는 단어 자체는 벨트가 얽힌 상태를 가리키는 일반 은어로는 널리 쓰이지만, "버티컬 스파게티"라는 고정 복합어 사용은 확인 못 함 | — | 확인 못 함 |

---

## 6. 언제 수직화를 피하는가

이 질문에 대해 "이래서 수직 확장을 피해라"는 형태의 **명시적 찬반 논쟁 스레드는 찾지 못했다.**
대신 아래와 같은 **불편 사항에 대한 불만**은 확인된다 — 이것이 "피해야 할 이유"로 재구성될 수는
있지만, 커뮤니티가 스스로 그렇게 프레이밍한 것은 아니다.

- **엘리베이터 부재**: "개발자가 엘리베이터 계획이 없다고 했는데 이유는 설명한 적이 없다"는 불만이
  존재하고, 그 대안으로 램프·나선 계단을 쓰는데 이는 "공간을 많이 잡아먹는다"는 지적이 있다.
  출처: 검색 요약 종합(Steam 커뮤니티, 정확한 스레드 URL 특정 못 함). confidence: 낮음
- **초반 수직 이동의 불편함**: "수직으로는 거의 처음부터 지을 수 있지만, 초반 수직 이동 자체가
  번거롭다"는 진술. 같은 낮은 confidence.
- **디버깅이 어려워진다는 주장**: 이번 조사에서 **1차 출처를 찾지 못했다.** 사용자가 제시한
  가설("수직 확장은 디버깅이 어렵다")은 검증도 반증도 못 했다 — 확인 못 함.
- **리프트/엘리베이터 비용·복잡도 증가에 대한 명시적 반대 의견**: 확인 못 함. 오히려
  `layout-design-tools.md` §7이 이미 정리한 커뮤니티 합의("어차피 후반엔 다시 짓는다",
  "수직 확장이 재건축을 줄이는 두 수단 중 하나")는 **수직화에 우호적**이다. 즉 이번 조사에서
  발견한 자료는 사용자의 가설("수직화를 피해야 할 때가 있다")을 강하게 뒷받침하지 못했다 —
  오히려 기존 조사와 결이 다르다는 점을 밝혀둔다.

**결론**: "수직화를 피하라"는 유의미한 커뮤니티 논쟁은 이번 조사 범위에서 확인하지 못했다.
있는 것은 "엘리베이터가 없어서 수직 이동 자체가 불편하다"는 별개의 UX 불만이다. 이 둘을
섞지 않아야 한다.

---

## 7. 블루프린트 디자이너 상호작용 — 높이 확인

| 등급 | 내부 치수(폭×길이×높이) | 실제 외곽 풋프린트 | 확인 |
|---|---|---|---|
| Mk.1 | **32 × 32 × 32 m** | 40×40×34m (외벽 두께 포함) | verified — [satisfactory.wiki.gg/wiki/Blueprint_Designer](https://satisfactory.wiki.gg/wiki/Blueprint_Designer) |
| Mk.2 | 40 × 40 × 40 m | 48×48×42m | verified, 같은 출처 |
| Mk.3 | 48 × 48 × 48 m | 56×56×50m | verified, 같은 출처 |

**결론**: 사용자가 물었던 "바닥은 32×32m로 확인됐는데 높이도 32m인가"에 대한 답은 **그렇다,
높이도 32m로 동일**하다 (`layout-design-tools.md` §5의 "32×32×32m" 표기도 이미 정확했다 —
이번 조사로 재확인만 한 것). 3축이 전부 같은 값이라는 점이 중요한데, 이는 곧 **8m 층고
기준으로 정확히 4개 층을 하나의 Mk.1 블루프린트에 담을 수 있다**는 뜻이다(32 ÷ 8 = 4).
7m 물류 층 + 생산 층을 섞어 쓰면 4개 층에 딱 맞아떨어지지 않으므로, **블루프린트로 여러 층을
담으려면 각 층 높이의 합이 8/16/24/32m 같은 정수 조합이 되도록 역산해서 설계해야 한다** —
이는 이번 조사에서 도출한 설계 함의이지 커뮤니티가 직접 이렇게 조언한 것은 아니다(assumed,
산수적으로 자명함).

**모듈 설계 관행**: "블루프린트는 완전한 생산 라인이 아니라 모듈을 만드는 용도"라는 것이
커뮤니티 조언이며, 예로 "제작기 8대짜리를 2개 층(입출력 벨트·전선 포함)으로 블루프린트 하나에
담을 수 있다"는 사례가 제시된다. 층 구멍을 블루프린트 안에 먼저 배치하고, 그 포트 위로 두 번
클릭해서 배관/벨트를 정렬하라는 실무 팁도 있다.
출처: 검색 요약 종합([xgamingserver 블로그](https://xgamingserver.com/blog/satisfactory-factory-layout-tips/), Steam 토론
[Blueprints and Floor Holes](https://steamcommunity.com/app/526870/discussions/0/601914224408746029/) 계열). confidence: 낮음~consensus 혼재 —
"모듈 단위로 만든다"는 원칙은 여러 출처가 일치하지만, 정확한 수치 예시(8대×2층)는 1차 스레드
재확인을 못 해 낮은 confidence로 남긴다.

---

## 확인 못 함

- 8m가 "커뮤니티 표준 층고"라는 단정할 만한 1차 출처(검색 스니펫에는 있었으나 원문 스레드 URL을 재확인하지 못함)
- 6m 이하 층고를 실제로 쓴다는 1차 진술
- "16m가 물류 층 사이 좋은 중간값"이라는 진술의 정확한 원문·유저·URL
- "매니폴드 타워", "버티컬 스파게티"라는 고정된 관용구의 실제 사용 사례
- 층 구멍(Floor Hole) 정확한 시공 클릭 순서의 1차 출처
- "수직 확장은 디버깅이 어렵다"는 주장에 대한 1차 커뮤니티 근거(찬성·반대 모두)
- 캣워크가 정비 접근에 "쓰인다"는 진술의 정확한 1차 인용(방향성은 위키로 확인되나 구체 사례는 못 찾음)
- 표준 벽(4m)이 아닌 다른 높이(1/2/8m) 벽을 층고 기준으로 쓰는 관행이 있는지
- 이번 조사는 Reddit(r/SatisfactoryGame)에서 유의미한 결과를 얻지 못했다 — WebSearch가 Steam
  커뮤니티로 결과를 크게 편향해서 반환했을 가능성이 있다. Reddit을 직접(구 검색 UI로) 열람하는
  후속 조사가 필요할 수 있다

---

## 출처 목록

- [satisfactory.wiki.gg/wiki/Blueprint_Designer](https://satisfactory.wiki.gg/wiki/Blueprint_Designer)
- [satisfactory.wiki.gg/wiki/Foundations](https://satisfactory.wiki.gg/wiki/Foundations)
- [satisfactory.wiki.gg/wiki/Walkways](https://satisfactory.wiki.gg/wiki/Walkways)
- [satisfactory.wiki.gg/wiki/Walls](https://satisfactory.wiki.gg/wiki/Walls)
- [satisfactory.wiki.gg/wiki/Smelter](https://satisfactory.wiki.gg/wiki/Smelter)
- [satisfactory.wiki.gg/wiki/Constructor](https://satisfactory.wiki.gg/wiki/Constructor)
- [satisfactory.wiki.gg/wiki/Assembler](https://satisfactory.wiki.gg/wiki/Assembler)
- Steam 토론 [Need guide for building vertical factories](https://steamcommunity.com/app/526870/discussions/0/4843148592919098595/)
- Steam 토론 [(멀티플로어 설계)](https://steamcommunity.com/app/526870/discussions/0/4843148768109490850)
- Steam 토론 [Building Heights](https://steamcommunity.com/app/526870/discussions/0/3062995463254393739/)
- Steam 토론 [Floor hole through multiple foundations?](https://steamcommunity.com/app/526870/discussions/0/4625855423767972483/)
- Steam 토론 [(스택 폴 배치 간격)](https://steamcommunity.com/app/526870/discussions/0/4625854988055217116)
- Steam 토론 [Blueprints and Floor Holes](https://steamcommunity.com/app/526870/discussions/0/601914224408746029/)
- [ficsit.app/mod/Eav53pCM8yGNHD](https://ficsit.app/mod/Eav53pCM8yGNHD) (Floor Hole and Ceiling Logistics 모드 — 바닐라 아님, 구분 필요)
- [xgamingserver 블로그 — Satisfactory Factory Layout Tips](https://xgamingserver.com/blog/satisfactory-factory-layout-tips/)
- 내부 문서: `docs/research/layout-design-tools.md` (§4 게임 데이터 충돌 박스, §5 블루프린트 제약, §6 다층 제약, §9 미해결 항목 5)
