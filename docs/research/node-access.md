# 자원 노드 접근 조건 — 무엇이 막고, 무엇으로 뚫는가

조사일: 2026-08-21 · 대상 게임 버전: `steamBuildId 24656030` (`src/data/app/meta.json`)

**왜 조사했나.** 지도가 "갈 수 있는 노드"와 "아직 못 가는 노드"를 구분하지 못한다.
사용자가 S.A.M. 노드를 찾아갔다가 방사능·물리적 장벽에 막힌 실제 사례가 있었다.
세이브에서 해금 상태를 읽을 수 있으므로, 노드마다 "무엇이 있어야 가나"를 붙이면
"지금 갈 수 있는 노드만 보기"가 된다.

**결론 먼저.**

- 방사능은 **게임 배포 데이터만으로 정확히 계산된다**. 공식·상수·순도별 계수를 모두 확보했다 (§2).
  그리고 계산 결과, **우라늄 노드의 방사능은 다른 자원 노드에 단 하나도 닿지 않는다.**
  즉 "방사능 때문에 못 가는 노드"는 우라늄 노드 5개 그 자신뿐이다.
- 나머지 장애물(유독 가스, 폭파할 바위, 동굴, 절벽, 수중, 적대 생물)은 **월드 액터 좌표가 필요**한데,
  우리가 쓰는 데이터셋에도, 확인한 공개 데이터셋에도 없다 (§8).
- 따라서 S.A.M. 19개처럼 **개수가 적고 중요한 대상은 손으로 큐레이션**하는 것이 유일하게 정직한 방법이다 (§9).

---

## 1. 접근을 막는 것들 — 전체 목록

| 장애물 | 실제로 무엇이 일어나나 | 해결책 | 해금 경로 | confidence |
|---|---|---|---|---|
| 방사능 | 지속 피해 + 화면 노이즈. 지형·벽·물·건물이 전혀 막지 못한다 | **방호복(Hazmat Suit)** + **아이오딘이 주입된 필터**. 또는 **탈것 안에 있기** | 마일스톤 `Schematic_7-3_C` 「방호복」 (티어 7) → `Recipe_HazmatSuit_C`, `Recipe_FilterHazmat_C` | verified |
| 유독 가스 (가스 기둥·포자꽃) | 지속 피해. 시야 흐려짐 | **방독면(Gas Mask)** + **가스 필터**. 또는 **가스원 영구 파괴** | MAM `Research_Mycelia_GasMask_C` → `Recipe_Gasmask_C`, `Recipe_FilterGasMask_C` | verified |
| 노드를 덮은 갈라진 바위 | 노드 위에 채굴기를 **지을 수 없다**. 손채굴·휴대용 채굴기는 가능 | **노벨리스크 기폭 장치** 또는 **폭발형 철근** | MAM `Research_Sulfur_3_1_C` (노벨리스크) / `Research_Sulfur_4_2_C` (폭발형 철근) | verified |
| 덩굴에 막힌 통로 | 통과 불가 | **사슬톱(Chainsaw)** | 마일스톤 `Schematic_2-2_C` 「장애물 제거」 (티어 2) | verified |
| 동굴 안 | 진입로를 찾아야 하고 내부에 가스·스팅어가 흔하다 | 조명 + 방독면 + 무기 | 위와 동일 | consensus |
| 높은 절벽 · 공중 지형 | 올라갈 수 없음 | **블레이드 러너 → 집라인 → 하이퍼튜브 → 제트팩 → 호버팩** 순으로 도달 범위가 넓어진다 | MAM `Research_Caterium_4_3_C` (블레이드 러너), `Research_Caterium_2_1_C` (집라인), 마일스톤 `Schematic_4-4_C` 티어4 (하이퍼튜브), `Schematic_6-2_C` 티어5 (제트팩), `Schematic_8-3_C` 티어7 (호버팩) | verified |
| 높은 곳에서 떨어짐 | 낙하 피해 | **낙하산** / **블레이드 러너**(착지 충격 완화) | MAM `Research_Mycelia_3_C` | verified |
| 물속 · 깊은 물 | §6 참조 — **산소/익사 게이지는 없다**는 것이 커뮤니티 합의이나 공식 문서로 확인 못 함 | — | — | disputed |
| 적대 생물 | 이동하는 방해물. 자리를 지키지 않는다 | 무기(철근 총 등) 또는 지형 이용 | MAM `Research_ACarapace_2_C` (철근 총) | consensus |
| 핵돼지(Nuclear Hog) | **몸 자체가 방사능을 뿜는다.** 가까이 서면 방사능 게이지가 가득 찬다 | 방호복 또는 원거리 처치 | — | verified |

해금 경로 열은 전부 이 저장소의 `src/data/app/tech.json`(게임 배포 데이터 파생)에서 직접 확인했다.

한글 표기는 게임 공식 로케일(`ko.json`) 기준이다 — 커뮤니티가 흔히 쓰는 "가스 마스크"가 아니라 **방독면**,
"노벨리스크 기폭제"가 아니라 **노벨리스크 기폭 장치**가 게임 표기다 (ADR-0017).

출처

- 해금 경로 / 한글 표기: 게임 배포 데이터 `CommunityResources/Docs/en-US.json`, `ko.json`, 본 저장소 `src/data/app/tech.json`
- 가스 기둥·포자꽃 파괴 수단: <https://satisfactory.wiki.gg/wiki/Gas_Pillar>, <https://satisfactory.wiki.gg/wiki/Spore_Flower>
- 바위 폭파: <https://satisfactory.wiki.gg/wiki/Resource_Node>
- 방사능 방어: <https://satisfactory.wiki.gg/wiki/Radiation>, <https://satisfactory.wiki.gg/wiki/Hazmat_Suit>
- 핵돼지: <https://satisfactory.wiki.gg/wiki/Cliff_Hog> (Nuclear Hog 절)

---

## 2. 방사능 — 정확히 계산된다

### 2.1 게임이 쓰는 상수 (verified)

게임의 `DefaultGame.ini` `[/Script/FactoryGame.FGRadiationSettings]` 절 전문:

```ini
mMaxIntensity=45.000000
mMinDamageInterval=0.200000
mMaxDamageInterval=20.000000
mDamagePerInterval=1.000000
mMinDistanceToSource=0.500000
mMinRadiationThreshold=0.200000
mRadiationFalloffByDistance=0.012500
mNodeRadiationPurityAmounts=((RP_Pure, 1200),(RP_Normal, 600),(RP_Inpure, 300))
```

두 곳에서 독립적으로 같은 값을 확인했다.

- `satisfactorymodding/SatisfactoryModLoader` → `Config/DefaultGame.ini`
- `clairenheit/StartWithVehicles` → `Saved/Cooked/Windows/FactoryGame/Metadata/CookedIniVersion.txt`
  — **쿠킹된 빌드에서 나온 값**이므로 실제 출고 게임의 설정값이다

받아 둔 사본: `.tmp-research/access/SML-DefaultGame.ini`, `.tmp-research/access/CookedIniVersion.txt`

각 값의 의미는 게임이 함께 배포하는 헤더(`CommunityResources/Headers.zip` →
`Source/FactoryGame/Public/FGRadiationSettings.h`)의 주석에서 그대로 가져왔다.

- `mRadiationFalloffByDistance` — "How much radiation falls off during distance"
- `mMinRadiationThreshold` — "**Radiation levels lower than this are ignored**"
- `mNodeRadiationPurityAmounts` — "The amount of items of the nodes resource class that each purity level
  will radiate equivalent to (e.g. A value of 100 will make an uranium node radiate roughly equivalent to
  100 uranium ores)"
- `mMinDistanceToSource` — "The closest we can get to any radiation source"

### 2.2 강도 공식 (verified — 두 출처가 교차 검증됨)

공식 위키가 적어 둔 식:

```
Intensity = ItemCount × ItemDecay × e^(−x / 80) / (4π x²)      (x = 거리, 미터)
```

출처: <https://satisfactory.wiki.gg/api.php?action=parse&page=Radiation&format=json&prop=wikitext>

위키의 상수 `80` 은 게임 설정의 `mRadiationFalloffByDistance = 0.0125` 의 역수다 (1 / 0.0125 = 80).
위키가 말하는 "0.2 ~ 45 로 클램프"도 ini 의 `mMinRadiationThreshold = 0.2`, `mMaxIntensity = 45` 와 정확히 일치한다.
위키가 말하는 "강도 45 면 5초 만에 사망"도 `mMaxDamageInterval = 20`(초당 20회) × `mDamagePerInterval = 1`
= 초당 20 피해 → 체력 100 을 5초에 소진, 으로 재현된다.
**서로 다른 두 출처가 세 지점에서 맞물리므로 이 모델은 verified 로 둔다.**

### 2.3 `ItemDecay` 와 `ItemCount`

- `ItemDecay`(우라늄 광석) = **15.0** — 게임 배포 데이터 `Docs.json` 의 `Desc_OreUranium_C.mRadioactiveDecay` (verified)
- 자원 **노드**의 `ItemCount` = 순도별 `mNodeRadiationPurityAmounts` → 불순 300 / 보통 600 / 순수 1200 (verified)
- 따라서 노드의 유효 방사능 세기(`ItemCount × ItemDecay`)는 **불순 4,500 / 보통 9,000 / 순수 18,000**

**이견 하나.** 위키의 표는 "Uranium Resource Node → ItemDecay 10000" 이라고 한 줄로 적는다.
이는 순도를 구분하지 않는 근사값이며, 우리 계산의 **보통 순도 9,000** 에 가깝다.
우리는 게임 설정 파일 + 배포 데이터에서 순도별 값을 직접 확보했으므로 **우리 쪽을 정본으로 쓴다.**
위키 값을 쓰면 순도 구분이 사라지고 불순 노드를 과대평가한다.

### 2.4 계산된 반경

`mMinRadiationThreshold = 0.2` 미만은 게임이 무시하므로, **강도 0.2 가 되는 거리가 곧 "피해가 시작되는 반경"**이다.

| 방사능원 | 유효 세기 | 피해 시작(강도 0.2) | 강도 1 | 강도 5 | 즉사급(강도 45) |
|---|---|---|---|---|---|
| 우라늄 노드 · 불순 | 4,500 | **34.2 m** | 17.0 m | 8.0 m | 2.8 m |
| 우라늄 노드 · 보통 | 9,000 | **45.1 m** | 23.2 m | 11.2 m | 3.9 m |
| 우라늄 노드 · 순수 | 18,000 | **58.7 m** | 31.2 m | 15.4 m | 5.5 m |
| 우라늄 퇴적물(손채굴 바위, 광석 60개 기준) | 900 | 17.0 m | 8.0 m | 3.7 m | 1.3 m |

계산 방법: 위 공식을 이분법으로 역산. 재현 가능하다.

**실제 월드에는 순수 우라늄 노드가 없다.** 우리 데이터의 우라늄 노드 5개는 불순 3 / 보통 2 이고,
이는 공식 위키 `Uranium` 문서의 `impure=3, normal=2, pure=0` 과 정확히 일치한다 (교차 검증됨).
(참고: `resource-nodes.json` 의 우라늄 카운트가 6인 것은 손채굴 **퇴적물** 1개가 섞여 있기 때문이다.)

### 2.5 우리 데이터에 적용한 결과 — 다른 노드는 하나도 영향받지 않는다

`.tmp-research/WorldResourceNodes.json` 의 626개 노드 전부에 대해
우라늄 노드 5개가 만드는 방사능 강도 합을 3D 거리로 계산했다.

> **강도 0.2 이상인 비(非)우라늄 노드: 0개.**
> 우라늄 노드에 가장 가까운 다른 노드는 S.A.M. 노드(`BP_ResourceNode101_UAID_…E7D901_2125168992`)로
> **185 m** 떨어져 있고, 그 지점의 방사능 강도는 **0.0010** — 임계값의 1/200 이다.

즉 **"방사능 때문에 못 가는 자원 노드"는 우라늄 노드 5개 자신뿐이다.**

### 2.6 그렇다면 사용자가 S.A.M. 노드에서 만난 방사능은 무엇이었나

우리 데이터로는 설명되지 않는다. 가능성은 셋이고, 어느 쪽인지 **확인 못 했다.**

1. **핵돼지(Nuclear Hog)** — 몸에서 방사능을 뿜는 이동형 생물. 위키가 "가까이 서면 방사능 게이지가 가득 찬다"고
   명시한다. 크래시 사이트·파워 슬러그·유물 주변과 후반 지역 입구를 순찰한다.
   **좌표가 없고 이동하므로 지도에 못 얹는다.**
   (<https://satisfactory.wiki.gg/wiki/Cliff_Hog> — Nuclear Hog 절, verified)
2. **손채굴용 우라늄 퇴적물** — 우리 노드 데이터에 우라늄 퇴적물은 단 1개만 들어 있다. 위키는 퇴적물이
   맵 곳곳, 특히 붉은 대나무 들판(Red Bamboo Fields)과 일부 크래시 사이트 주변에 흩어져 있다고 한다.
   **우리 데이터셋에 없는 방사능원이 존재한다는 뜻이다.**
3. **우라늄 노드로 가는 길에 스친 것** — 위 S.A.M. 노드는 우라늄 노드에서 185 m 거리이고,
   위키가 말하는 "Uranium Cave"(초원 지대의 긴 동굴)와 같은 구역일 가능성이 있다. 이동 경로가 반경 34 m 안을
   스칠 수 있다. 확인 못 함.

**화면에 쓸 문장(안):** "이 노드 자체는 방사능 범위 밖이다. 다만 근처에 우라늄 노드가 있어 가는 길이 스칠 수 있고,
핵돼지가 순찰할 수 있다 — 방호복 없이 갈 거면 오래 머물지 마라."

---

## 3. 유독 가스

| 항목 | 내용 | 출처 | confidence |
|---|---|---|---|
| 가스원 종류 | **가스 기둥(Gas Pillar)** — 고정, 무리지어 존재 / **포자꽃(Spore Flower)** — 접근하면 피어오름, 전 세계 **736개** | wiki Gas_Pillar, Spore_Flower | verified |
| 피해 | 포자꽃 가스 초당 5 | wiki Spore_Flower | verified |
| 파괴 | **노벨리스크 / 클러스터 노벨리스크 / 핵 노벨리스크 / 폭발형 철근의 폭발**로만. 근접 무기·일반 총기는 안 통한다 | wiki 양쪽 문서 일치 | verified |
| 재생성 | **파괴하면 영구히 다시 생기지 않는다** | wiki 양쪽 문서 일치 | verified |
| 방어 | 방독면 + 가스 필터. **방호복은 유독 가스를 막지 못한다**(반대도 마찬가지) | wiki Hazmat_Suit / Gas_Mask | verified |
| 생물 상호작용 | 돼지·스피터류는 이 가스에 약하지만 **스팅어는 면역** | wiki Spore_Flower | verified |
| 동굴 | 위키 `Cave` 문서가 동굴의 흔한 위험으로 "폭파 가능한 큰 바위, 스팅어, 유독 가스"를 든다 | wiki Cave | verified |

### 위치를 특정할 수 있나 — 못 한다

공식 위키는 가스 기둥·포자꽃의 **바이옴 목록도 좌표도 주지 않는다.**
"소머슬룹·머서 스피어·파워 슬러그·크래시 사이트 같은 수집 요소 주변에 무리지어 있다"는 서술뿐이다.
패치 노트 맥락에서 사막(Dune Desert)과 첨탑 해안(Spire Coast)에 가스 기둥이 있다는 것만 간접 확인된다.

> **"어느 바이옴에 유독 가스가 있다"를 좌표로 특정하는 것은 현재 자료로 불가능하다. 확인 못 함.**

### 가스 필터 지속 시간 — 출처가 갈린다

- 게임 헤더 `Source/FactoryGame/Public/Equipment/FGGasMask.h` → `float mFilterDuration = 240.0f;` (**240초**)
- 공식 위키 Gas Mask 문서 → "가스 구름 안에서 **24초당 1개**(분당 2.5개)" (**24초**)

정확히 10배 차이다. 헤더 값은 C++ 클래스의 기본값이고, 실제 게임이 쓰는 블루프린트가 이를 덮어쓸 수 있다.
위키 값은 관측된 플레이 결과이므로 **게임 플레이 기준으로는 위키 쪽(24초)이 더 믿을 만하다**고 본다.
다만 어느 쪽도 결정적으로 확인하지 못했으므로 **disputed** 로 둔다.
(SML 의 `FGGasMask.cpp` 를 받아 확인했으나 자동 생성된 빈 스텁이라 판단 근거가 되지 못했다.)

참고: 방호복 쪽 필터 소모는 위키가 "최대 강도(45)에서 12초당 1개, 강도에 비례해 느려짐"이라고 적는다 (verified).

---

## 4. 폭파해야 하는 바위

- 공식 위키 `Resource Node` 문서: **석탄(Coal)과 카테리움(Caterium)** 노드 위에 갈라진 바위(cracked boulder)가
  덮여 있는 경우가 있다. **노벨리스크 기폭 장치 또는 폭발형 철근**으로만 부순다. (verified)
- 이 바위는 **건물(채굴기) 설치를 막지만 손채굴과 휴대용 채굴기는 막지 않는다.** (verified)
- 동굴 안에도 통로를 막는 큰 폭파용 바위가 있다. (wiki `Cave`, verified)

> **어느 노드가 바위에 덮여 있는지 목록이 없다. 확인 못 함.**
> 우리 노드 데이터에도 그런 플래그가 없다. 손 큐레이션이 필요한 항목이다.

---

## 5. 적대 생물

위키는 "노드 근처에 접근을 어렵게 하려고 적대 생물이 배치되는 경우가 많다"고만 서술하고,
**어떤 생물이 어느 노드를 지키는지는 명시하지 않는다.** (확인 못 함)

| 생물 | 체력 | 비고 |
|---|---|---|
| 솜꼬리 돼지(Fluffy-tailed Hog) | 20 | 가장 흔함 |
| 알파 돼지(Alpha Hog) | 80 | 돌진 20 / 물기 30. 크래시 사이트·슬러그·유물 주변 순찰 |
| 절벽 돼지(Cliff Hog) | 90 | 근접 + 투석 |
| **`Char_NuclearHog_C`** | 150 | 근접 + 투석 + **상시 방사능**. 이름 주의 — 아래 참조 |
| 스피터(Spitter) 각 변종 | 20~30 | 원거리 화염구. 중간 티어 자원 주변에 무리지어 등장 |
| 알파 스피터 | 60~80 | |
| 스팅어(Stinger) 각 변종 | 10~100 | 동굴·정글. **유독 가스 면역** |
| 나는 게 부화기(Flying Crab Hatcher) | 20~45 | 접근하면 소환 |

출처: <https://satisfactory.wiki.gg/wiki/Creatures>, <https://satisfactory.wiki.gg/wiki/Cliff_Hog> (verified)

**이름이 갈린다.** 위키는 `Char_NuclearHog_C` 를 "Nuclear Hog" 라고 부르지만,
**게임 자신의 문자열 테이블(`Localization/StringTables/World_Data.csv`)이 주는 표시명은
"Radioactive Cliff Hog"** 다 (§8 의 `creatures.json` 에서 확인). 게임 표기를 정본으로 삼는
이 저장소의 규칙(ADR-0017)대로라면 후자를 써야 한다.
**다만 생물은 `Docs.json` 에 없어서 공식 한글 표기를 확보하지 못했다.**
화면에 낼 때는 영문 표시명을 쓰고 한글은 우리 번역임을 밝히거나, 한글 표기를 별도로 조사해야 한다. (미해결)

**생물은 이동하고, 세이브의 리스폰 설정에 따라 달라진다. 지도에 "여기 생물이 있다"를 고정 표시하는 것은
원리적으로 부정확하다.** 스포너 좌표는 확보했지만(§8) 그것은 "생물이 태어나는 자리"이지
"지금 생물이 서 있는 자리"가 아니다. 쓸 수 있는 건 "이 구역은 전투 준비가 필요하다" 수준의 주석이다.

---

## 6. 수중 · 절벽 · 동굴

### 수중

공식 위키 `Resource Node` / `Water` 문서에 **관련 서술이 전혀 없다.**
커뮤니티(합의 수준)로는 이 게임에 **산소·익사 게이지가 없고**, 개척자 슈트가 양성 부력이라
가만히 있으면 떠오른다고 한다. 즉 "물속이라 죽는다"가 아니라 "깊이 못 내려가서 못 닿는다"가 문제일 수 있다.
**공식 출처로 확인하지 못했다 — disputed.**

우리 데이터에서 고도가 가장 낮은 노드 두 개가 모두 S.A.M. 이다
(`BP_ResourceNode99` z = −142 m, `BP_ResourceNode172` z = −134 m; 전체 노드 최저값이 −142 m).
**§8 의 동굴 데이터로 확인한 결과 둘 다 물속이 아니라 깊은 동굴 안이다.**

**수중 판정은 시도했다가 폐기했다.** `worldBounds.json` 의 `water.outerRing`(258점)을
"물 경계"로 보고 626개 노드에 점-다각형 검사를 돌렸더니 **209개(33%)가 안쪽으로 나왔고,
그중에는 고도 +195 m 짜리 노드도 있었다.** 이 링은 물 볼륨 하나하나의 외곽선이 아니라
물 볼륨 **전체를 감싸는 바깥 테두리**(맵의 바다 경계)다. 수중 판정에 쓸 수 없다.
파일 자신도 `bodies: 49, volumes: 270` 이라고 적으면서 개별 볼륨은 내보내지 않는다.

### 절벽 · 공중 지형

위키에 "이 장비 없으면 접근 불가" 식의 명시적 서술은 없다. **확인 못 함.**
실무적으로는 블레이드 러너 → 집라인 → 하이퍼튜브 → 제트팩 → 호버팩 순으로 도달 가능 범위가 넓어진다 (consensus).

### 동굴

위키 `Cave` 문서: 인터랙티브 맵에 **52개 동굴이 매핑**돼 있고, 게임에는 그보다 많다.
문서가 이름 붙여 설명하는 동굴 중 **S.A.M. 노드를 품은 곳이 셋** 있다 (verified, 좌표는 없음).

| 동굴 | 지역 | 내용물 | 위험 |
|---|---|---|---|
| Stone Arch Ravine | Grass Fields | **S.A.M. 노드** | **포자꽃** |
| Blue Slug Cave | Grass Fields | 파란 파워 슬러그, **S.A.M. 노드** | 명시 없음 |
| Desert Cave | Rocky Desert | 석영 3, **S.A.M. 노드** | 명시 없음 |
| Uranium Cave | Grass Fields | 우라늄 노드 1 | 고저차 |

출처: <https://satisfactory.wiki.gg/api.php?action=parse&page=Cave&format=json&prop=wikitext>

---

## 7. S.A.M. 노드 19개 — 좌표와 방사능 판정

총 19개, 순도 불순 10 / 보통 6 / 순수 3.
**공식 위키 `SAM` 문서의 개수·순도 분포와 정확히 일치한다** (교차 검증, verified).
S.A.M. 은 다른 자원과 달리 **무작위 퇴적물로는 나오지 않고 고정 노드에서만 나온다** (verified).

좌표는 `.tmp-research/WorldResourceNodes.json` 원본(cm)을 m 로 환산한 것이다. y 오름차순 정렬.

| # | id | 순도 | x(m) | y(m) | 고도(m) | 격자 | 우라늄 최근접 | 방사능 강도 |
|---|---|---|---|---|---|---|---|---|
| 1 | `BP_ResourceNode241` | 보통 | 1726 | −2855 | 216 | X4Y4 | 966 m | 0.0000 |
| 2 | `BP_ResourceNode241_UAID_…D301_1723440520` | 불순 | 2728 | −2619 | 11 | X5Y4 | 1199 m | 0.0000 |
| 3 | `BP_ResourceNode43_UAID_…D901_1711042113` | 불순 | −466 | −2529 | 49 | X2Y4 | 1158 m | 0.0000 |
| 4 | `BP_ResourceNode43` | 순수 | 826 | −2196 | 89 | X3Y4 | 1033 m | 0.0000 |
| 5 | `BP_ResourceNode135` | 보통 | −1822 | −1424 | −17 | X1Y3 | 826 m | 0.0000 |
| 6 | `BP_ResourceNode43_UAID_…D901_1404601764` | 불순 | 2305 | −336 | 22 | X5Y2 | 1047 m | 0.0000 |
| 7 | `BP_ResourceNode43_UAID_…D401_1733397541` | 불순 | −809 | −324 | 157 | X2Y2 | 843 m | 0.0000 |
| 8 | `BP_ResourceNode43_UAID_…D901_1532454233` | 불순 | 1530 | −241 | 43 | X4Y2 | 767 m | 0.0000 |
| 9 | `BP_ResourceNode47_3066` | 보통 | 155 | −8 | 147 | X3Y2 | 972 m | 0.0000 |
| 10 | `BP_ResourceNode607` | 불순 | −1436 | 207 | 195 | X1Y1 | 744 m | 0.0000 |
| 11 | `BP_ResourceNode101_UAID_…D901_2125168992` | 순수 | 1629 | 654 | 98 | X4Y1 | **185 m** | 0.0010 |
| 12 | `BP_ResourceNode101_UAID_…D901_1551800812` | 불순 | 1191 | 713 | 187 | X4Y1 | 568 m | 0.0000 |
| 13 | `BP_ResourceNode519_UAID_…D901_1586151453` | 보통 | −1818 | 891 | 170 | X1Y1 | 1124 m | 0.0000 |
| 14 | `BP_ResourceNode101_1893` | 불순 | 1619 | 1038 | 56 | X4Y0 | 537 m | 0.0000 |
| 15 | `BP_ResourceNode78_1097` | 보통 | 2283 | 1163 | −16 | X5Y0 | 885 m | 0.0000 |
| 16 | `BP_ResourceNode519` | 순수 | −484 | 1289 | 236 | X2Y0 | 822 m | 0.0000 |
| 17 | `BP_ResourceNode172_UAID_…D901_1471130569` | 불순 | 807 | 2048 | 57 | X3Y0 | 1213 m | 0.0000 |
| 18 | `BP_ResourceNode99` | 불순 | 1330 | 2409 | **−142** | X4Y0 | 1771 m | 0.0000 |
| 19 | `BP_ResourceNode172` | 보통 | −241 | 2699 | **−134** | X2Y0 | 1888 m | 0.0000 |

### 7.1 각 노드를 실제로 막는 것

§8 에서 확보한 데이터셋과 조인한 결과다. 거리는 3D 직선거리이며 **경로 거리가 아니다** —
30 m 라도 절벽 하나 사이면 실제로는 멀 수 있다.

| # | 동굴 안? | 핵돼지 스포너 | 가장 가까운 강한 생물 | 가스 기둥 | 포자꽃 |
|---|---|---|---|---|---|
| 1 | — | 108 m | 73 m Alpha Desert Spitter | 692 m | 448 m |
| 2 | 이름없는 동굴 | 785 m | 109 m Alpha Stinger | 271 m | 205 m |
| 3 | — | 608 m | 33 m Alpha Forest Spitter | 605 m | 687 m |
| 4 | — | 408 m | 84 m Alpha Aquatic Spitter | 855 m | 666 m |
| 5 | **Savanna Cave** | 1701 m | 349 m Alpha Desert Spitter | **88 m** | 457 m |
| 6 | 이름없는 동굴 | 361 m | **30 m** Alpha Stinger | 360 m | 244 m |
| 7 | — | 520 m | 192 m Cliff Hog | 218 m | 284 m |
| 8 | 이름없는 동굴 | 175 m | 164 m Alpha Stinger | 653 m | 216 m |
| 9 | — | 276 m | **20 m** Alpha Stinger | 347 m | 254 m |
| 10 | — | 671 m | 60 m Alpha Forest Spitter | 208 m | **18 m** |
| 11 | — | 254 m | **17 m** Alpha Stinger | 501 m | 65 m |
| 12 | — | **75 m** | **75 m Radioactive Cliff Hog** | 509 m | **49 m** |
| 13 | — | 251 m | 120 m Cliff Hog | **80 m** | 224 m |
| 14 | — | 280 m | 54 m Alpha Stinger | 256 m | 65 m |
| 15 | 이름없는 동굴 | 190 m | **31 m** Alpha Forest Spitter | 198 m | 110 m |
| 16 | — | 176 m | 176 m Radioactive Cliff Hog | 177 m | **51 m** |
| 17 | — | 817 m | 106 m Cliff Hog | **75 m** | 188 m |
| 18 | 이름없는 동굴 | 1312 m | **45 m** Alpha Stinger | 191 m | 150 m |
| 19 | **Grass Fields Cave 3** | 1569 m | **3 m** Alpha Stinger | 208 m | **16 m** |

읽어낼 수 있는 것

- **19개 중 방사능(우라늄 노드) 임계값을 넘는 것은 0개.** 11번이 가장 가깝지만 강도 0.0010 으로 임계값의 1/200.
- **12번 옆 75 m 에 핵돼지(`Char_NuclearHog_C`) 스포너가 있다. 사용자가 겪은 방사능은 이것일 가능성이 가장 높다.**
  16번도 176 m 에 하나 있다. 핵돼지는 이동하므로 실제 조우 거리는 이보다 가까울 수 있다.
- **7개가 동굴 안에 있다** (2·5·6·8·15·18·19번). 그중 18·19번은 전체 626개 노드 중 가장 깊은 곳
  (−142 m, −134 m)이고, **물속이 아니라 동굴 안**이라는 것이 확인됐다.
- **19번이 최악이다.** `Grass Fields Cave 3` 안, 포자꽃 16 m, 알파 스팅어 스포너 **3 m**.
  방독면 없이 갈 수 없고 전투도 각오해야 한다.
  위키가 "Stone Arch Ravine(초원 지대) — S.A.M. 노드 — 포자꽃 있음"이라고 적은 곳과 정황이 일치하지만,
  위키가 좌표를 주지 않아 **같은 곳이라고 단정하지는 못한다.**
- 가스 기둥이 100 m 안에 있는 S.A.M. 노드는 5·13·17번 (88 m / 80 m / 75 m).

---

## 8. 공개 데이터셋 — 무엇이 있고 무엇이 없나

### 8.1 결론 표

| 필요한 것 | 재사용 가능한 공개 데이터 | 상태 |
|---|---|---|
| 방사능 | **필요 없다.** 게임 설정값 + 우리 노드 좌표로 계산된다 | **바로 쓸 수 있음** |
| 동굴 외곽선 | valentinps `caves.json` (84개) | **받아 뒀음.** 근사임을 밝히고 써야 함 |
| 적대 생물 스포너 | valentinps `creatureSpawners.json` (2,826개 / 21종) | **받아 뒀음** |
| 월드 경계 | valentinps `worldBounds.json` | 받아 뒀음 (수중 판정에는 못 씀 — §6) |
| 가스 기둥 · 포자꽃 | **SCIM 에만 있다. 라이선스가 재사용을 금지한다** | **못 씀. 직접 재추출해야 함** |
| 노드를 덮은 바위 | **어디에도 없다** | 없음 |
| 지형 높이(절벽 판정) | **어디에도 없다** | 없음 |

### 8.2 valentinps/satisfactorymap — 쓸 수 있는 쪽

- 저장소: <https://github.com/valentinps/satisfactorymap> (코드 AGPL-3.0)
- 데이터: <https://github.com/valentinps/satisfactorymap/releases/download/game-data-v3/game_data.zip> (134 MB, 인증 불필요)
- 받아 둔 위치: `.tmp-research/access/vps-world/` (11개 JSON)

받은 파일과 스키마 (직접 열어 확인함):

| 파일 | 개수 | 스키마 |
|---|---|---|
| `creatureSpawners.json` | 2,826 (21종) | `{"Char_AlphaHog_C": {"Persistent_Level:PersistentLevel.BP_CreatureSpawner1016": [x, y, z], …}}` |
| `creatures.json` | 21 | `{"Char_AlphaHog_C": {"displayName":"Alpha Hog","icon":"…"}}` |
| `caves.json` | 84 (이름 있는 것 17) | `{"caves":[{"id","name","bbox":[x0,y0,x1,y1],"zRange":[z0,z1],"areaM2","volumes","rings":[[x0,y0,x1,y1,…]]}]}` |
| `worldBounds.json` | — | `{"perimeter":{"polygon","ceilingZ":200000,"floorZ":-24400},"water":{"outerRing":[258점],"bodies":49,"volumes":270}}` |
| `resourcePurity.json` | 608 | `{"…BP_FrackingSatellite10": ["Desc_NitrogenGas_C","PURE",[x,y,z],"…부모코어"]}` |

**출처의 질이 특히 좋다.** 추출 스크립트(`extract_caves.py`, `extract_spawners.py`)의 헤더 주석이
방법론과 한계를 스스로 적어 둔다. 그대로 옮기면:

- 스포너: FModel 로 뽑은 월드 파티션 셀 export 에서 `BP_CreatureSpawner_C` 액터의
  per-instance `mCreatureClass` 와 충돌 캡슐 월드 좌표를 읽는다.
  **세이브로는 안 되는 이유**도 적혀 있다 — 세이브에도 스포너 액터 ~2,277개가 다 있지만
  "어떤 생물을 뿜는지"는 근처에 실제 생물이 스트리밍돼 있을 때만 채워져서 사실상 비어 나온다.
  게 부화기(Crab Hatcher) 549마리는 스포너가 아니라 생물 액터 자체가 배치된 것이라 따로 집계됐다.
- 동굴: **자연 상태로는 "여기 동굴"이라는 액터가 없다.** 네 가지 신호를 합쳐 래스터라이즈하고
  외곽선을 딴다 — ① 동굴 바이옴을 상속한 `FGAtmosphereVolume` (157개 중 108개),
  ② `BP_CaveFloor_C` 스플라인 터널, ③ 동굴 전용 폴리지 컴포넌트의 캐시 바운즈 약 3,400개,
  ④ 동굴 암반 키트 스태틱 메시.
  **스스로 밝힌 한계:** 안개 볼륨은 충돌 메시가 아니라 실제 암반보다 **수십 미터 헐겁게** 그려져 있다.
  "동굴이 어디쯤 있나"의 보조 수단이지 측량이 아니다. 내부 구멍은 버리고 바깥 링만 쓴다.

**독립 교차 검증 (직접 돌림).** `resourcePurity.json` 608개를 우리 `WorldResourceNodes.json` 626개와
좌표 1 m 이내로 매칭했다.

- 완전 일치 **576**
- 순도 불일치 **0**
- 자원 클래스 불일치 31 — **전부 간헐천 표기 차이 하나**(`Desc_GeothermalEnergy_C` ↔ `Desc_Geyser_C`)
- 대응 없음 19 — 프래킹 코어(부모 액터)와 우라늄 퇴적물 1개. 두 데이터셋이 서로 다른 것을 센 것

→ **좌표계가 동일(월드 cm)하고 순도 데이터가 완전히 일치한다.** 서로 다른 두 추출 파이프라인이
같은 답을 냈다는 뜻이므로, 이 데이터셋의 좌표를 신뢰할 근거가 된다.
덤으로 **우리 노드 데이터의 순도가 독립 출처로 검증됐다** — 이건 따로 기록해 둘 가치가 있다.

**동굴 판정 자릿수 검사.** 626개 노드에 점-다각형 검사를 돌리면 **28개(4.5%)**가 동굴 안으로 나온다.
자원별로는 석영 7 · S.A.M. 7 · 카테리움 4 · 구리 3 · 철 3 · 우라늄 2 · 석탄 1 · 석회석 1.
위키 `Cave` 문서가 동굴 내용물로 드는 것이 석영·S.A.M.·카테리움이므로 **정성적으로 맞아떨어진다.**
우라늄 2개는 위키의 "Uranium Cave" 서술과 부합한다.

**라이선스 주의.** 저장소 코드는 **AGPL-3.0** 이다. **추출 스크립트를 우리 저장소(MIT)로 복사하면 안 된다.**
반면 `game_data/generated/` 의 산출물에 대해서는 저장소의 `NOTICES.md` 가 직접 이렇게 적는다:

> "Game-derived data (icons, map image, item/building/world tables): property of Coffee Stain Studios.
> None of it is in this repository … it is the game's data, not this project's."

즉 **우리가 이미 `WorldResourceNodes.json` 을 쓰는 것과 법적으로 같은 성격**이다 (게임 사실 데이터).
새로운 리스크는 아니지만, 게임 자산 취급 원칙(CLAUDE.md 4번)에 따라 출처 표기는 유지해야 한다.
**채택 여부는 ADR 로 정하는 것이 맞다.**

### 8.3 satisfactory-calculator.com (SCIM) — 유일하지만 쓰면 안 되는 쪽

- 데이터 엔드포인트(직접 찾아서 열어 확인함):
  - <https://static.satisfactory-calculator.com/data/json/mapData/en-Stable.json> (1.3 MB)
  - <https://static.satisfactory-calculator.com/data/json/gameData/en-Stable.json> (1.5 MB)
  - 인터랙티브 맵 페이지 인라인 스크립트의 `window.SCIM.mapDataUrl` 에 적혀 있다. 인증 불필요, HTTP 200.
- 받아 둔 위치: `.tmp-research/access/scim-mapData-en-Stable.json`, `scim-gameData-en-Stable.json`

레이어 구조: `options[].options[].{layerId, name, type, markers[]}`,
마커는 `{"pathName","x","y","z"}`. 직접 세어 확인한 레이어:

| layerId | 개수 | 다른 데서 구할 수 있나 |
|---|---|---|
| `pillars` (Gas Pillars) | **831** | **없음** |
| `sporeFlowers` (Spore Flowers) | **651** | **없음** |
| `smallRocks` / `largeRocks` | 41 / 72 | **없음** |
| `caves` | 0 (이 파일엔 비어 있음) | valentinps 로 대체 가능 |
| 자원 노드·웰·간헐천·슬러그·소머슬룹 등 | 우리 값과 일치 | rockfactory 로 이미 있음 |

교차 검증으로 신뢰도가 올라간 부분: SCIM 의 `samImpure 10 / samNormal 6 / samPure 3`,
`uraniumNormal 2 / uraniumPure 0` 이 **우리 데이터·공식 위키와 정확히 일치**한다.

> **라이선스 — 못 쓴다.** `AnthorNet/SC-InteractiveMap` README 원문:
> *"Reuse of the source code and data assets is not permitted in any case,
> source code is only available for educational purpose."*
> 그리고 *"The map is solely intended to be used on the satisfactory-calculator.com domain."*
> **앱에 실어 배포하면 안 된다.** 이 문서의 §7.1 가스 기둥·포자꽃 거리는 **조사용 대조**로만 쓴 것이고,
> 그 수치가 앱 데이터로 들어가서는 안 된다.

**게다가 SCIM 수치는 위키와 어긋난다.** 공식 위키 `Spore Flower` 문서는
*"There are 736 Spore Flowers in the world."* 라고 적는데 SCIM 마커는 **651개**다. 약 12% 차이.
어느 쪽이 맞는지 **확인 못 했다** — `disputed`.
(둘 다 세는 대상이 다를 수 있다. 예: 파괴돼 사라지는 것과 아닌 것, 혹은 SCIM 이 특정 레벨을 빠뜨렸을 수 있다.)

**중요한 반증 하나.** SCIM 의 `smallRocks`/`largeRocks` 113개는
**위키가 말하는 "노드를 덮은 갈라진 바위"가 아니다.** 626개 노드 중 어느 것에서도
가장 가까운 바위가 **45.1 m** 이고, 석탄·카테리움 노드로 좁혀도 같은 값이다.
노드를 덮은 바위라면 0 m 여야 한다. 이 레이어는 **독립적으로 서 있는 폭파용 바위**
(`BP_DestructibleSmallRock_C` / `BP_DestructibleLargeRock_C` / `BP_DestructibleFlatRock_C`)다.
→ **노드를 덮은 바위 데이터는 그 어디에도 없다.**

### 8.4 없다고 확인한 곳 (추측이 아니라 실제로 열어 봄)

| 대상 | 결과 |
|---|---|
| `rockfactory/satisfactory-logistics` (MIT) | 트리 전수 조사. 위험·동굴·스포너 데이터 **없음**. `WorldCollectibles.json` 1,768건은 전부 수집품이다 (직접 확인: 슬러그 1,242 · 머서 스피어 298 · 하드 드라이브 118 · 소머슬룹 106 · 테이프 3 · 커스터마이저 1). 다만 파이프라인은 MIT 라 **우리가 확장할 수 있는 코드**다 |
| `greeny/SatisfactoryTools` | 2,552개 엔트리 전수 조사. **맵 데이터 자체가 없다** — 레시피·아이템 계산기 전용 |
| `moritz-h/satisfactory-3d-map` (GPL-3.0) | C++ 뷰어. 추출 JSON 배포 **없음** |
| `moritz-h/satisfactory-mapdata` (MIT) | 게임 안에서 JSON 을 뽑는 SML 모드. 추출 대상은 자원 노드 순도와 드롭포드뿐 |
| 공식 위키 | 가스 기둥·포자꽃 문서에 **좌표가 없다**. 서술뿐 |

### 8.5 보너스로 확보한 것

`.tmp-research/access/SML-DefaultGame.ini` 는 게임의 `DefaultGame.ini` 전문(583줄)이다.
방사능 말고도 나침반/지도 설정(`mLowestWorldLocation = -52520.95`, `mHighestWorldLocation = 47090.79` — 월드 고도 범위) 등
지도 기능에 쓸 만한 상수가 더 들어 있다. 다른 작업에서 꺼내 쓸 수 있다.

---

## 9. 그래서 무엇을 어떻게 만들 것인가

### 9.1 데이터 구조 제안

`src/data/curated/node-access.json` — 게임 원본에 없는 판단이므로 curated 다.
게임 객체는 클래스명·노드 id 로만 참조하고 `confidence` 와 `sources` 를 붙인다.

```jsonc
{
  "$comment": "노드 접근 조건. 근거는 docs/research/node-access.md",
  "blockers": {
    "radiation": {
      "ko": "방사능",
      "needs": ["Schematic_7-3_C"],          // 방호복 마일스톤
      "needsItems": ["Desc_HazmatFilter_C"],
      "confidence": "verified",
      "computed": true                        // 좌표에서 계산된다. 손으로 안 적는다
    },
    "poisonGas": {
      "ko": "유독 가스",
      "needs": ["Research_Mycelia_GasMask_C"],
      "needsItems": ["Desc_Filter_C"],
      "confidence": "verified"
    },
    "boulder":  { "ko": "덮인 바위", "needs": ["Research_Sulfur_3_1_C", "Research_Sulfur_4_2_C"], "anyOf": true },
    "cave":     { "ko": "동굴 안", "needs": [], "confidence": "consensus" },
    "creature": { "ko": "적대 생물", "needs": ["Research_ACarapace_2_C"], "confidence": "consensus" }
  },
  "nodes": {
    "BP_ResourceNode172": {
      "blockers": ["cave", "poisonGas", "creature"],
      "note": "Grass Fields Cave 3 안. 알파 스팅어 스포너가 3 m 옆에 있다",
      "confidence": "consensus",
      "sources": ["valentinps/satisfactorymap game-data-v3 caves.json + creatureSpawners.json"]
    }
  }
}
```

방사능만은 **파일에 적지 않고 빌드에서 계산한다** (`scripts/build-app-data.mjs` 2단):

```js
// 우라늄 노드 좌표 + 게임 설정 상수 → 강도. 손으로 적은 수치가 아니다
const P = { impure: 300 * 15, normal: 600 * 15, pure: 1200 * 15 };
const intensity = (P[u.purity] * Math.exp(-d / 80)) / (4 * Math.PI * d * d);
```

### 9.2 화면에서 근사임을 밝히는 방식

우리가 붙일 수 있는 판정은 **셋으로 등급이 갈린다.** 화면도 그렇게 나눠야 한다.

| 등급 | 무엇 | 화면 문구 |
|---|---|---|
| **계산됨** | 방사능. 게임 상수에서 나온 값 | 그냥 단정한다. "방호복 필요" |
| **데이터 기반 근사** | 동굴 안 여부, 근처 스포너 | "동굴 안으로 보인다", "근처에 ○○이 태어나는 자리가 있다" |
| **미확인** | 가스, 덮인 바위, 절벽 | 아무 말도 하지 않는다. 빈칸으로 둔다 |

**"근처에 위험이 없다"고 말하지 않는다.** 우리가 가진 것은 위험의 부분집합이라
없음을 증명할 수 없다. 표시할 수 있는 것은 "확인된 장애물"뿐이다.

### 9.3 근사 규칙 (데이터가 없는 항목)

데이터가 없다고 아무 말도 못 하는 것은 아니다. 다만 **근사임을 반드시 밝힌다.**

1. **동굴 판정** — valentinps 폴리곤 안이면 `cave` 로 본다.
   외곽선이 실제 암반보다 수십 미터 헐거우므로 **거짓 양성이 나온다.**
   화면 문구는 "동굴 안" 이 아니라 "동굴 구역"으로.
2. **전투 난이도** — 스포너까지의 거리가 아니라 **등급으로 가중**해야 한다.
   전체 노드의 90%가 아무 스포너 100 m 안에 있어서 거리만으로는 변별력이 없다.
   핵돼지 · 알파/엘리트 등급만 세는 편이 낫다.
3. **깊이** — `z` 가 −100 m 이하면 "깊은 곳". 전체 626개 중 몇 개뿐이라 눈에 띄는 신호다.
4. **절벽** — **하지 마라.** 지형 높이가 없으면 근처 노드와의 고도차밖에 못 쓰는데,
   그것으로는 "올라갈 수 있는 언덕"과 "못 오르는 절벽"이 구분되지 않는다. 틀린 답을 자신 있게 내게 된다.

### 9.4 가스 기둥·포자꽃을 합법적으로 얻는 길

유일한 방법은 **직접 재추출**이다. valentinps 가 정확히 그 방법을 문서화해 놓았다:
FModel 로 `FactoryGame/Content/FactoryGame/Map/GameLevel01/` 의 월드 파티션 셀을 export 하고
액터를 긁는다. 우리가 찾을 클래스는 `BP_GasPillar*_C`, `BP_SporeFlower_C`,
그리고 노드를 덮은 바위(클래스명 **미확인** — 덤프에서 찾아야 한다).

**작업량이 작지 않다** (수 GB 덤프 + 파서). 별도 과제로 잡는 것이 맞다.

---

## 10. 지금 구현 가능한 것 / 데이터가 없어 못 하는 것

### 지금 바로 가능

1. **방사능 구역 표시와 "방호복 필요" 배지** — 게임 상수로 계산된다. 외부 데이터가 필요 없다.
   대상은 우라늄 노드 5개. 순도별 반경 34.2 / 45.1 m.
   세이브에서 `Schematic_7-3_C` 보유 여부를 읽어 "지금 갈 수 있음/없음"을 바로 가른다.
2. **"방사능 때문에 못 가는 노드는 우라늄뿐"이라는 사실 자체를 화면에 쓰기** — 사용자의 오해를 직접 푼다.
3. **동굴 안 노드 28개 표시** (근사 표기와 함께). S.A.M. 7개 포함.
4. **핵돼지 스포너 근접 경고** — 62개 스포너. 사용자가 겪은 문제의 가장 유력한 원인이다.
5. **장비 해금 상태 → 접근 가능 여부 매핑** — 해금 경로 표(§1)는 전부 우리 게임 데이터에서 확인됐다.
   방호복·방독면·노벨리스크·사슬톱·블레이드 러너·제트팩·호버팩 전부 세이브에서 읽을 수 있다.
6. **S.A.M. 19개 개별 주석** — §7.1 표를 그대로 큐레이션 파일로 옮기면 된다.

### 데이터가 없어 못 하는 것

1. **가스 기둥·포자꽃 위치** — 재사용 가능한 출처가 존재하지 않는다. 직접 추출해야 한다 (§9.4).
2. **노드를 덮은 바위** — 어느 데이터셋에도 없다. 클래스명조차 아직 모른다.
3. **수중 판정** — 물 볼륨 개별 폴리곤이 공개돼 있지 않다. 시도했다가 폐기했다 (§6).
4. **절벽·도달 가능성** — 지형 높이가 없다. 하지 않는 편이 낫다 (§9.3-4).
5. **바이옴 이름** — 노드가 어느 바이옴인지 알려주는 데이터가 없다.
   valentinps `caves.json` 의 이름 있는 동굴 17개가 지역명을 담고 있어 **부분적으로만** 얻어진다.
6. **실시간 생물 위치** — 원리적으로 불가능. 스포너 위치가 최선이다.

---

## 11. 미해결 질문 (openQuestions)

1. 가스 필터 지속 시간 — 게임 헤더 240초 vs 위키 24초. 어느 쪽인가 (§3)
2. 포자꽃 총 개수 — 위키 736 vs SCIM 651 (§8.3)
3. 노드를 덮은 갈라진 바위의 액터 클래스명은 무엇인가. 어느 노드에 붙어 있는가 (§4)
4. `Char_NuclearHog_C` 의 공식 한글 표기 (§5). 생물은 `Docs.json` 에 없다
5. 위키가 이름 붙인 `Stone Arch Ravine` / `Blue Slug Cave` / `Desert Cave` 가 우리 S.A.M. 19개 중 어느 것인가
6. 우라늄 퇴적물(손채굴 바위)의 전체 위치. 우리 데이터에는 1개뿐인데 위키는 여러 곳에 흩어져 있다고 한다
7. 자원 노드가 방사능 이미터를 **몇 개** 다는가. `InitRadioactivity()` 가 여러 개를 달면
   §2.4 의 반경이 과소평가일 수 있다. 헤더로는 확인 못 함
8. valentinps 데이터셋을 채택할 것인가 — 라이선스 성격은 기존 rockfactory 사용과 같지만 ADR 이 필요하다

---

## 부록 — 받아 둔 파일

| 경로 | 내용 |
|---|---|
| `.tmp-research/access/SML-DefaultGame.ini` | 게임 `DefaultGame.ini` 전문 (방사능 상수 포함) |
| `.tmp-research/access/CookedIniVersion.txt` | 쿠킹된 빌드의 ini 값 — 위 파일의 독립 대조원 |
| `.tmp-research/access/vps-world/*.json` | valentinps 월드 데이터 11종 (동굴·스포너·월드경계·순도 등) |
| `.tmp-research/access/scim-mapData-en-Stable.json` | SCIM 맵 데이터 — **대조 전용, 앱에 넣지 말 것** |
| `.tmp-research/access/scim-gameData-en-Stable.json` | SCIM 게임 데이터 — 동일 |
| `.tmp-research/access/extract_*.py` | valentinps 추출 스크립트 (AGPL-3.0 — **복사 금지**, 방법론 참고용) |
