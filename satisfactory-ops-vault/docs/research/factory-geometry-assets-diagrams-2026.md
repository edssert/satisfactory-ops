# 공장 기하·자산·도면 연구

접근일은 2026-08-21이다. 이 문서는 R-03 시설 배치, R-05 운송 기하, R-06 탑뷰 자산, R-08 도면
발행의 근거를 통합한다. 기존 Claude 조사 문서는 사용하지 않는다.

## 1. 검증 질문

1. AndersPottemager 원본에 어떤 기계·토대·벨트·파이프 부품이 실제로 포함되는가.
2. 이미지 크롭, 실제 점유 박스, 회전 원점, 포트 좌표를 어떤 독립 필드로 관리해야 하는가.
3. 벨트·파이프·리프트의 최소 길이·곡률·높이·교차·깊이를 어떤 알고리즘으로 표현해야 하는가.
4. 시설 배치와 공정 도면 원리 중 게임의 수동 설계 검증에 적용할 규칙은 무엇인가.
5. 앱 캔버스와 독립 SVG/PNG가 어떤 장면 그래프를 공유해야 하는가.

## 2. AndersPottemager 원본 아카이브

### 2.1 원본과 무결성

- 배포 논의: [Can we get a new Anders Pottemager asset set?](https://www.reddit.com/r/SatisfactoryGame/comments/12gskwe/can_we_get_a_new_anders_pottemager_asset_set/)
- 직접 배포 파일: [Assets.zip](https://www.dropbox.com/scl/fi/fjso2avbeocyqyvchlecg/Assets.zip?dl=1&rlkey=6ut90yf5j7614acf9on95f42g)
- SHA-256: `400A20946B4049078388D26261C0A3E83B87BD7E04E5D423A2B0756C73452BAC`
- 내부 파일: `Sheet_00.png`, `Sheet_01.png`, `Sheet_02.png`, `Texture 02.png`
- 네 파일 모두 4096×4096 RGBA PNG다.

원본 ZIP은 Figma 문서가 아니라 네 장의 래스터 시트다. Reddit 글은 Figma에서 사용하는 자산과 제작자
튜토리얼을 가리키지만, 현재 확보한 직접 배포본에는 `.fig` 파일이나 컴포넌트 메타데이터가 없다. Figma
원본 링크와 사용 조건은 별도로 확인해야 한다.

공개 게시물 메타데이터 50건을 조회해 Satisfactory 관련 원출처 21건을 식별했다. 재현 가능한 수집 절차는
`scripts/archive-anders-layouts.mjs`, 정규화 증거 색인은 `src/data/curated/anders-reddit-posts.json`이다.
원본 매체 42건 중 37건을 원 해상도로 저장하고 SHA-256을 계산했으며, 2026년에 삭제된 테스트 게시물
매체 5건은 404 상태와 원 URL을 보존했다.

[최초 Tier 1 도면 게시물](https://www.reddit.com/r/SatisfactoryGame/comments/k251gd/)에서 Anders는 설비
모델을 직접 만들었고 약 이틀 저녁이 걸렸으며, Figma에서 그래픽과 기본 컴포넌트를 그렸고 당시 도면은
벡터라고 설명했다. 이후 공개한 v1.1b와 Dropbox 배포본은 4096×4096 래스터 시트다. 따라서 확인된 제작
흐름은 `수작업 벡터 마스터 → 공개 래스터 아틀라스 → Figma 컴포넌트 → 완성 도면`이다. 최초 벡터
마스터나 게임 메시에서 형상을 옮긴 세부 방법은 아직 확보하지 못했으므로 이를 카메라 캡처라고 단정하지
않는다.

[Anders의 10분 Figma 튜토리얼 게시물](https://www.reddit.com/r/SatisfactoryGame/comments/msq6pb)은 원본
텍스처를 Figma에 붙여 넣고, 벨트·파이프·토대 텍스처를 그룹화·래스터화한 뒤 크롭 또는 타일로 사용하는
과정을 설명한다. 해상도를 보존하기 위해 래스터화 전후 크기를 조정하고, MMB 팬, 단계 회전, 그룹,
프레임과 내용 분리 조작을 사용한다. 이는 현재 앱에 필요한 팬·스냅·그룹·텍스처 타일·점유 프레임 분리의
직접 작업 흐름 근거다.

Reddit 임베드에서 원 영상 `v.redd.it/8danuil2dqt61`의 1024×576 HLS 스트림을 확보했다. 연구 사본
SHA-256은 `FF333B8848DD9E3FD0027776613A639EC6160D42B597A4531ADA61D0B9E56A57`이다. 30초 간격
22프레임과 주요 구간을 검토한 제작 순서는 다음과 같다.

1. 기존 탑뷰·운송·토대 텍스처 시트를 Figma 캔버스에 둔다.
2. 설비별 영역을 프레임·그룹으로 분리하고 컴포넌트로 만든다.
3. 기계 변형은 컴포넌트 집합으로 관리한다.
4. 벨트·파이프·토대는 그룹 후 래스터화해 원본 해상도와 crop/tile 동작을 보존한다.
5. 토대 컴포넌트를 반복해 실제 배치용 격자를 만든다.
6. 기계·분배 장치·벨트 부품을 컴포넌트 패널에서 끌어 배치하고 회전·팬·복제로 공정을 구성한다.

이 영상은 **기존 텍스처 시트를 Figma 자산과 도면으로 만드는 방법**을 보여 준다. 최초 구버전 벡터
그래픽 제작 단계는 남아 있지 않지만, 후기 Blender 자산 제작 방식은 별도 게시물에서 확인했다.

### 2.2 Blender 탑뷰 제작 방식

[Blender 3D 장면 게시물](https://www.reddit.com/r/SatisfactoryGame/comments/qom52d/)에서 Anders는 다음을
직접 설명했다.

1. Coffee Stain Studios 게임 자산을 UModel로 추출한다.
2. 메시 폴더를 glTF로 내보내 Blender로 가져온다.
3. 건물 대부분은 정적 메시와 애니메이션 메시 두 부분으로 구성하며 생산 표시등은 별도 자산으로 붙인다.
4. 텍스처는 공용·자산별 폴더에서 모으며 당시에는 DDS로 내보냈다.
5. 장면, 배경과 셰이더만 직접 만들고 게임 메시 자체는 다시 모델링하지 않았다.
6. 핵심 재질은 Glossy BSDF와 Emission을 섞고 Metallic을 혼합 마스크로 사용한다. Albedo에 역 Facing과
   Ambient Occlusion을 곱해 조명 없이 형태와 재질을 읽히게 한다.
7. 결과 장면에는 실제 광원을 사용하지 않았고, 깊이감은 가짜 조명과 필요 시 피사계 심도 모사로 만든다.

[초기 Blender 재질 연구 게시물](https://www.reddit.com/r/SatisfactoryGame/comments/q5619z/)의 Anders 본문·댓글과
원본 2560×1400 작업 화면 두 장은 최종 셰이더의 더 구체적인 단서를 제공한다.

- 작업 파일은 `MaterialStudy.blend`, Blender 2.93.4, EEVEE다. 작업 화면에는 정적·스켈레탈 메시,
  `Ground`, 정사영 카메라와 `Sun` 객체가 있고 EEVEE Ambient Occlusion·Bloom이 활성화돼 있다.
- Anders가 밝힌 공용 재질은 도색 1·2, 빨강, 흰색, 강철, 회색 금속, 어두운 금속, 고무의 8개 기본
  재질과 출력·입력·용융 금속·흰색의 4개 발광, 그리고 Void다. UV는 3×3 계열 아틀라스를 사용하고
  Anders는 이를 합성 텍스처로 만들었다.
- 동일 UV에 서로 다른 색이 매핑돼 보이는 문제에 대해 Anders는 게임의 `TX_Hologram_01`을 보면 재질
  인덱스 구조를 알 수 있다고 직접 안내했다.
- 기계 아래 그림자는 `Ground`의 Transparent BSDF 색에 Ambient Occlusion을 연결하고, 더 강한 그림자가
  필요하면 AO 노드를 여러 개 결합하는 방식이다. Cycles shadow catcher 제안에는 당시 EEVEE 미지원과
  Blender 2.93.4 Cycles 메모리 문제를 이유로 쓰지 않았다고 답했다.

현재 게임 설치본에서 `TX_Hologram_01`, `ColorAtlas_Alb`, `PanelAtlas_Nor`를 추출해 확인했다.
`TX_Hologram_01`은 실제 3×3 단색 셀이고, 제련기 정적 메시의 공용 재질에 연결하면 파츠별 흰색·주황·
금속·고무 UV 분류가 복원된다. 이 텍스처는 최종 색이 아니라 **재질 셀 인덱스 증거**로 사용하며,
Anders의 기본 재질 색과 반사 특성을 셀별로 다시 합성한다.

초기 `MaterialStudy.blend` 화면의 `Sun`과 한 달 뒤 3D 장면에서 Anders가 명시한 “광원·IBL 없음”은 서로
다르다. 이를 한쪽이 틀렸다고 지우지 않는다. 초기 화면은 재질·형상 점검용 EEVEE 장면이고, 후속 장면은
Glossy/Emission·Facing·AO로 실제 조명을 완전히 가짜화한 발전된 구성으로 해석한다. 골든 마스터는 두
구성을 같은 제련기 표본으로 비교해 2023 배포 아틀라스와 더 가까운 쪽을 채택한다.

[2023년 대안 자산팩](https://www.reddit.com/r/SatisfactoryGame/comments/12l586u/)은 제목에서 Blender 렌더임을
명시한다. 게시물의 4096×4096 세 장과 Dropbox의 `Sheet_00`~`02`는 축소 정규화 오차 0으로 동일하며,
파일 해시만 인코딩 차이로 다르다. `Texture 02.png`는 2021년 v1.1b 시트와 같은 방식으로 일치한다.
즉 현재 Dropbox 배포본은 `구버전 Figma용 텍스처 시트 1장 + Blender 대안 렌더 시트 3장`의 결합이다.

현재 Satisfactory 1.2는 과거 UE4.26과 다르므로 구버전 UModel 설정을 복사하지 않는다. UE4·UE5
아카이브를 지원하는 [FModel](https://github.com/4sval/FModel)을 현재 추출 파일럿의 1순위로 두고,
Blender에서 동일 정사영·재질·투명 배경 프리셋을 재현한다. 이 발견으로 누락 기기 렌더의 주 경로는
Three.js 실시간 캡처보다 Blender 배치 렌더가 된다. Three.js는 랜딩 실시간 장면과 브라우저 검수용으로
역할을 좁힌다.

2026-08-21 헤드리스 파일럿은 다음을 재현했다.

- Satisfactory 1.2 설치본은 UE 5.6.1, CL 502094이며 CUE4Parse가 아카이브 2개와 패키지 48,573건을
  인덱싱했다.
- FModel `7c86ee47ec2722152b735b7cb788686f6ea3e91a`에 고정된 CUE4Parse
  `7afcbb323c9fd9445d5452856b18b1d732d2dccd`로 정적 메시, 스켈레탈/VAT 메시, 재질 JSON, 텍스처와
  공용 생산 표시등을 glTF/PNG로 추출했다.
- Blender 5.2.0 LTS 헤드리스 렌더에서 CUE4Parse glTF의 축 변환을 소스와 대조했다. 최종 좌표는
  Unreal `(X,Y,Z)` m에 대해 Blender `(X,-Y,Z)` m다.
- Blueprint CDO에서 생산 표시등 상대 위치·회전을 읽어 별도 메시를 결합했다. 임의의 녹색 점을 그림에
  덧붙이지 않는다.
- Anders가 설명한 `Albedo × Facing × AO → Emission` 무조명 구조를 재현하고, 각 건물 게임 데이터의
  하드 클리어런스 박스에만 흰 점유 코너를 생성했다. 시각 메시의 돌출부는 코너 크기를 바꾸지 않는다.
  `scripts/topview/render-topview.py`가 이 렌더 단계를 재현한다.

첫 파일럿의 단일 청회색 팔레트와 생산 표시등 재질 전체를 녹색으로 만든 방식은 폐기했다. 표시등의 실제
Albedo와 ReflectionMap을 복원해 회색 하우징을 유지하고 ReflectionMap B 채널의 원형 렌즈 링만 녹색
상태 발광으로 사용한다. 색·그림자도 원 제작자 근거를 확인하기 전 임의 후처리로 보정하지 않는다.

[Satisfactory Modeling Tools](https://github.com/DavidHGillen/Satisfactory_ModelingTools)의
`SF_CommonParts.blend`를 Blender 5.2에서 헤드리스로 열어 공용 PBR 노드 계약을 확인했다. Reflection
텍스처는 R=Metallic, G=Roughness, B=Emission Strength이고, Masks G/B는 Albedo와 1·2차 도색 색을
혼합하며 DirectX normal을 연결한다. 저장소 커밋은 `69d8c65666cb4a7b37e0f02705c74659398d42e5`다.

[UModel Tools Next](https://github.com/dotm5/UModel_Tools_Next) 커밋
`86d7cff79f9f0c6bd46fe6567c81c9b715cc3b2e`에 Satisfactory 전용 TOML 규칙을 더해 현재
`MI_SK_Smelter.json`을 파일럿했다. 일반 규칙은 Albedo와 DirectX normal만 5노드·4링크로 복원했지만,
Satisfactory 규칙은 Albedo, AOMasks R, normal, Reflection R/G/B를 10노드·11링크로 복원했다. 따라서
이 후보는 통째로 채택하거나 기각하는 대신 FModel JSON 어댑터, TOML 규칙, normal 변환, packed mask,
노드 테스트를 각각 흡수한다.

교정 표본은 제련기다. 2023 Blender 원본 `Sheet_00.png#16`을 별도 골든으로 승인했다. 이 자산은
원본 `(1932,3560,680×428)` 크롭을 -90° 회전한 428×680 RGBA이며, 흰 코너 프레임은 384×640px라
비율이 0.600이다. 반면 현재 게임 하드 박스와 [공식 위키](https://satisfactory.wiki.gg/wiki/Smelter)는
5×10m, 비율 0.500이다. 골든에서 포트 전면의 수직면과 세 개 발광 슬롯이 보이므로 완전 수직이 아닌
기울어진 정사영이다. 긴 축이 `cos θ`만큼 압축됐다고 보면 `0.500/0.600=0.8333`, 즉 전면 방향 틸트는
약 33.557°다. 2022년 커뮤니티 자료의 6×9m 기록은 당시 치수 인식이 달랐다는 보조 증거지만, 현재
프레임 차이는 정사영 틸트로 직접 설명되므로 이를 1순위 가설로 둔다. 원 `.blend`의 카메라 값은 아직
없어 `consensus`다.

따라서 골든의 원시 픽셀 비율을 현재 평면 치수로 오해하거나 후보를 가로로 늘리지 않는다. 색·금속·파이프·발광·AO·그림자는 기계 시각 본체를
정규화한 **스타일 비교**로 보고, 실제 축척·점유·포트는 현재 게임 하드 박스와 CDO를 사용하는 **기하
비교**로 분리한다. 현재 입력은 Y=-3m, 출력은 Y=+2m이고 Blueprint 표시등은 Unreal 좌표
`(-1.0034,-4.1429,2.8498)`m다.

사용자가 현재 게임에서 직접 제공한 탑·양 측면·양 끝면 5장과 아이소메트릭 4장을 별도 기하 대조군으로
등록했다. 앞의 원본 해상도는 1217×618, 1082×945, 971×817, 573×791, 494×769이고 아이소메트릭은
999×1105, 910×1048, 1029×1116, 895×837이다. SHA-256은
`scripts/topview/golden-cases.json`에 기록했다. 실제 탑뷰는 화구와 캐비닛이 붙어 있고 은색 파이프 4개,
코일형 전력 연결부, 긴 주황 상태등, 앞·뒤 포트 프레임이 모두 존재함을 보여 준다. 미변형 VAT 후보처럼
큰 빈 공간이나 분리된 부품이 생기면 즉시 조립 실패다.

아홉 장은 모두 인게임 원근투영 캡처다. 탑뷰에 가까운 첫 장도 평행투영이 아니므로 토대·기계 픽셀
비율을 미터로 환산하지 않는다. 부품 존재, 부착 면·높이, 상대 위치, 재질·발광, 조립 오류 판정에만
사용한다. 실축·점유·포트는 게임 하드 박스와 CDO가 정본이고 최종 이미지는 Blender 정사영 카메라로
렌더한다.

첫 후보 결과는 다음과 같다. 수치는 이미지 바이트가 아니라 게임 메시와 하드 박스에서 계산한다.

| 클래스 | 하드 점유영역 | 시각 메시 경계 | 판정 |
|---|---:|---:|---|
| `Build_MinerMk1_C` | 6×14 m | 6.6285×14.2832×19.9810 m | 외형이 점유 코너 밖으로 일부 돌출하는 실제 관계를 보존한 후보 |
| `Build_GeneratorBiomass_Automated_C` | 8×8 m | 8.3344×7.5158×7.8476 m | 현재 자동화 연소기 실루엣과 표시등을 결합한 후보 |

두 자산은 구조·출처·해시는 검증했지만 복합 Anders 도면 안에서의 그림자·밀도 비교 전이므로
`candidate`다. FModel/CUE4Parse 현 의존 그래프의 `Microsoft.Bcl.Memory 9.0.0`에는
`GHSA-73j8-2gch-69rq` 고위험 권고가 남아 있다. 로컬 읽기 전용 파일럿 외의 정식 추출 도구에는 패치된
버전 강제 또는 상류 수정이 선행돼야 한다.

### 2.3 전수 이미지 분석

`scripts/analyze-topview-sheets.py`로 알파 마스크를 축소·팽창한 뒤 연결 성분을 추출했다.

| 시트 | 후보 수 | 확인된 범위 |
|---|---:|---|
| `Sheet_00.png` | 19 | 대형 생산·저장·발전·특수 설비와 소형 연결 부품 |
| `Sheet_01.png` | 32 | 대형 설비, 곡선 벨트, 토대, 벨트·파이프 연결 부품, 분배 장치 |
| `Sheet_02.png` | 2 | 입자 가속기 계열 대형 설비와 로고 |
| `Texture 02.png` | 38 | 생산 설비, 저장, 토대, 벨트·파이프·분배기·병합기 부품 |
| 합계 | 91 | 식별·클래스 매핑 진행 중 |

연결 성분은 곧 게임 클래스가 아니다. 흰 설치 범위 코너, 포트, 방향 표시, 한 설비의 분리된 부분이 별도
성분으로 잡힐 수 있으므로 원본 시트의 시각 판독과 실제 게임 클래스 대조가 필요하다.

전수 결과는 `src/data/curated/anders-topview-candidates.json`에 영속화했다. 픽셀 연결 성분 91건을
본체·흰 점유 코너의 의미 소속에 따라 84개 그룹으로 묶었다. 그룹 중 19건은 런타임 자산과 연결됐고,
14건은 게임 클래스를 식별했으며, 20건은 운송 부품 등 역할을 식별했다. 이 집계는 서로 겹칠 수 있고
31건은 미식별이다. 각 미식별 그룹에는 빈 클래스와
`openQuestion`을 두어 다음 검토에서 번호별로 확정한다. `npm run check:assets`가 성분 소속, 그룹 수,
박스, 상태, 신뢰도와 승인 매니페스트 연결을 검사한다.

### 2.4 현재 앱의 사용 실태

`src/data/curated/topview-assets.json`은 21개 자산을 등록한다.

| 원본 | 개수 | 상태 |
|---|---:|---|
| Anders 시트 크롭 | 19 | 17건 `approved`, 컨베이어 리프트 방향 변형 2건 `candidate` |
| 게임 설치본 메시 렌더 | 2 | 채굴기·자동화 바이오매스 연소기 `candidate`; Anders 제작 원리를 재현한 Blender 프로파일 |

게임 메시 후보는 `Build_MinerMk1_C`, `Build_GeneratorBiomass_Automated_C`다. 최초 Three.js 임시 렌더는
Anders와 다른 시각 프로파일이어서 폐기했고, 현재 파일은 Blender 5.2.0 LTS에서 실제 정적·동적 메시,
재질, 생산 표시등과 하드 점유영역을 다시 결합한 후보로 교체했다. 플래너에 실사용할 수 있다는 뜻의
`approved` 승격은 복합 도면 비교 뒤에만 한다. 과거 게임 메시 리프트 자산은 제거하고 Anders 원본 방향
변형으로 교체했다.

사용자 대조와 시트 시각 판독으로 `Texture 02.png`의 21번과 33번이 컨베이어 리프트의 독립 탑뷰
변형임을 확인했다. 21번은 `(2052, 3140, 308×248)`, 33번은 `(2064, 3600, 284×224)` 크롭이다. 두
변형의 정확한 입·출력 및 회전 의미는 실제 게임 배치와 교차 검증한다. 수직 몸체는 탑뷰 면적을 늘리지
않으므로 이미지로 합성하지 않는다. 높이는 Z 값, 화면 라벨과 상하 레이어 가림 순서로 표현한다.

### 2.5 즉시 적용할 자산 규칙

1. Anders 91개 후보의 클래스·역할 전수 매핑을 끝내기 전에는 “원본에 없음”으로 판정하지 않는다.
2. Anders에 존재하는 항목은 원본 크롭을 우선한다.
3. 원본에 없는 기기만 게임 메시로 렌더하며, 카메라·광원·그림자·외곽선·색을 Anders 프로파일과 맞춘다.
4. 다른 `visualProfile`은 복합 공정 비교 승인을 받기 전 정식 카탈로그에 노출하지 않는다.
5. `occupancyFrame`은 투명 여백 추정이 아니라 흰 설치 범위, 게임 하드 박스와 실제 세이브 표본을 교차한다.
6. 컨베이어 리프트 Mk.1~6은 Anders 21·33번 공통 탑뷰를 재사용하고 높이는 기하·라벨·깊이 상태로
   모델링한다.
7. 누락 자산을 새로 렌더할 때는 Anders의 흰 `ㄴ`형 코너를 네 방향에 합성하고 코너 안쪽 사각형과
   게임 하드 박스·`occupancyFrame`의 픽셀 오차를 검사한다.
8. 제련기를 골든 마스터로 완성하기 전에는 다른 게임 메시 자산을 양산하지 않는다. 원 제작자·유사
   구현·게임 공용 재질 근거를 먼저 소진하고, 근거 없는 팔레트·그림자·후처리는 제품 파이프라인에
   채택하지 않는다.

### 2.6 완성 도면 문맥 분석

현재 의미 도면 13건, 직접 연결한 출처 11건, 배포 자산 매체 2건을
`src/data/curated/anders-layout-corpus.json`에 색인했다. 공개 원출처 21건·매체 42건은 별도의
`anders-reddit-posts.json`으로 전수 보존한다. 사용자 제공 중복본은 원본과 별도 도면으로 세지 않고
`observedVariants`로 합쳤다. 자산 식별은 시트 단독 모양이 아니라 다음 문맥을 함께 사용한다.

- 기계 전후의 아이템 아이콘과 분당 처리량
- 벨트·파이프의 흐름 화살표와 분배기·병합기 연결 수
- 컨테이너·기계 포트에 붙는 방향과 회전
- 토대 격자와 인접 기계의 상대 축척
- 층·리프트·교차 구간의 가림 순서
- 같은 부품의 여러 도면 반복 사용

도면 원본은 연구 보관소에만 보존하고 배포물에는 포함하지 않는다. 원 Reddit/Figma URL과 재배포 조건을
확인한 뒤 영속 증거 위치를 결정한다.

원 게시물까지 확인한 첫 정본은 [PokeMaki의 1920 Steel Ingots 도면](https://www.reddit.com/r/SatisfactoryGame/comments/nkq1ms/)이다.
원본은 4338×2048이고 SHA-256은 `da0d6cae692a2e7bd5d7019bb9bfdcea95d5f5ab629d86acd73f413ef3b73da6`이다.
게시물은 Solid Steel Ingot 대체 제작법, Mk.4 벨트, 일반 분배기를 사용하며 실제 게임에서 절반 이상
시공됐다고 기록한다. 댓글은 중앙 리프트 영역, 제련기 오프셋 배열과 맞붙은 분배기 연결을 구체적으로
검토한다. 즉 이 도면은 장식 이미지가 아니라 실제 시공 피드백을 받은 기준 도면이다.

같은 게시물의 PokeMaki 댓글에서 직접 연결된
[1200 Steel Pipes 원본](https://i.ibb.co/tM7sj8T/1200-Steel-Pipes.png)은 5643×2048이고 SHA-256은
`b2245e2d367d14336f96dcc9c4f1692b2a5ba0859720716658039e6dc9d5df32`이다. 사용자가 제공한 1080×509
축소본 SHA-256 `637aba2bc8fda6415a276ebd3d44d5f02c5da6c1c804e09d45cb437a06b218cf`와 연결했다. 이 도면은
기계 배치, 물류 전용층, 결합 완료 상태를 좌→우 세 단계로 분리한다. 가운데 서비스 보이드와 대칭 물류,
토대 경계, 4개 출력 버스를 동시에 보여 주므로 최종 앱의 단계별 시공 도면 기준으로 사용한다.

자동 대조 결과 다음 사용자 제공 파일의 원출처를 확정했다.

| 사용자 제공 제목 | 원 게시물 | 관계 |
|---|---|---|
| The Rotor Tower | [The Rotor Tower Layout](https://www.reddit.com/r/SatisfactoryGame/comments/k7dvjn/) | 1920×1408 원본의 1080×792 축소본 |
| Solid Biofuel Mini Tower | [원 게시물](https://www.reddit.com/r/SatisfactoryGame/comments/mfuj2c/) | 같은 1920×1152 이미지의 재인코딩본 |
| x240 Aluminum Ingot Factory | [원 게시물](https://www.reddit.com/r/SatisfactoryGame/comments/mozrk1/) | 같은 3456×2560 이미지의 재인코딩본 |
| Production Tree / Production Flow Master | [Starter Factory](https://www.reddit.com/r/SatisfactoryGame/comments/ri2c86/) | 동일 4864×3584 원본의 재인코딩본과 1080×795 축소본 |
| Compact Factory | [Tier 1 Iron Works](https://www.reddit.com/r/SatisfactoryGame/comments/k251gd/) Rotor 이미지 | 1024×1024 원본의 640×640 축소본 |

도면 품질 문법은 다음과 같이 정리한다.

- 토대 8m 모듈을 배경이 아니라 실제 치수 격자로 사용한다.
- 기계 배치 단계, 물류 전용 단계, 결합 단계를 분리해 시공 순서를 보여 준다.
- 중앙 서비스 보이드와 외곽 버스로 벨트·리프트 교차를 수용한다.
- 흐름 화살표와 분당량을 벨트 위에 직접 두고 기계 자산을 가리는 큰 `IN/OUT` 원을 쓰지 않는다.
- 기계명은 도면 밖 제목·범례 또는 비회전 UI에 두고 자산 자체는 방향·포트·발광으로 읽힌다.
- 물류 부품은 기계보다 뒤에 숨기지 않고 높이·층별 가림 순서를 명시한다.
- 반복 모듈은 토대 경계, 입력·출력 포트와 증설 방향을 함께 유지한다.

### 2.7 완성 도면 품질 점수

기술 채택 점수와 별도로 최종 SVG/PNG를 다음 100점으로 평가한다. 구현 비용은 점수에 포함하지 않는다.

| 항목 | 배점 | 판정 증거 |
|---|---:|---|
| 자산·시각 프로파일 일치 | 20 | Anders 원본과 시점·재질·흰 점유 코너·그림자 비교 |
| 실제 축척·토대·점유 기하 | 20 | 게임 하드 박스, 토대 격자, 회전·인접 픽셀 검사 |
| 벨트·파이프·리프트 정확성 | 20 | 포트·방향·최소 길이·곡률·높이·깊이와 게임/블루프린트 대조 |
| 흐름·처리량·레시피 판독 | 15 | 입력·출력·아이템·분당량·클럭·분배/병합 의미 |
| 공정 구성·확장성 | 10 | 모듈 반복, 증설 여유, 교차·병목·지원 검증 |
| 시공 순서·범례 | 10 | 단계 분해, BOM, 방향·층·미검증 상태의 설명 |
| 독립 파일 품질 | 5 | SVG 재개방, PNG 배율, 폰트·이미지 포함, 확대 판독 |

PokeMaki 1920 Steel 도면을 시각 기준 지수 100으로 두되, 게임 버전이 오래된 수치·기하를 정답으로
복사하지 않는다. 우리 도면은 동일한 판독성과 밀도에 최신 1.2 데이터, 높이·깊이, 검증 상태와 독립
내보내기를 추가해야 통과한다.

## 3. 시설 배치 연구

### 3.1 적용 가능한 연구 축

[2024년 정적·동적 시설 배치 종합 리뷰](https://doi.org/10.1016/j.arcontrol.2024.100970)는 시설 배치를
기계·작업장·물류 시스템의 조합 최적화로 정의하고, 정적/동적 환경과 다양한 수리·휴리스틱 접근을 비교한다.
Satisfactory Ops는 공간 자동 배치를 제공하지 않으므로 최적 위치를 강제하지 않는다. 대신 논문의 목적
함수를 사용자가 만든 배치의 진단 지표로 변환한다.

[다층 시설 배치 조사](https://doi.org/10.1016/j.cie.2017.03.015)는 단층 모델과 달리 층 배정, 수직 운송,
공간 활용과 미래 변경을 함께 고려해야 함을 정리한다. 앱에는 층별 설비·수직 리프트·층간 처리량·확장
예약 영역 검증으로 적용할 수 있다.

[다층 배치의 이목적 모델](https://doi.org/10.1016/j.cie.2016.12.018)은 물류 비용과 점유 면적, 고정된
내부 구성과 인접 제약을 함께 다룬다. 게임에서는 물류 길이, 굽힘·리프트 수, 점유 토대, 사용자가 지정한
인접·확장 제약으로 변환할 수 있다.

### 3.2 자동 배치와 검증의 경계

- 논문 목적 함수를 자동 위치 결정에 사용하지 않는다.
- 물류 거리·굽힘·수직 이동·점유 면적·교차·확장 여유를 검증 점수로 제공한다.
- 사용자가 선택한 설계 의도와 우선순위를 바꾸지 않는다.
- 한 가지 “최적”을 주장하지 않고 충돌, 용량 초과, 지지 부족처럼 게임 규칙 위반과 개선 가능성을 구분한다.

## 4. 운송 기하와 도면 표준

[Orthogonal Connector Routing](https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf)은 장애물을
피하는 직교 경로에서 길이와 굽힘 수의 단조 비용을 최소화한다. [libavoid](https://www.adaptagrams.org/documentation/libavoid.html)는
대화형 다이어그램 편집기용 객체 회피 직교·폴리라인 라우터다. 이는 고정된 기계 사이의 화면 경로 후보로
유용하지만, 게임 벨트의 최소 길이·곡률·포트 방향·높이를 직접 보장하지 않으므로 물리 제약 레이어가
추가돼야 한다.

[ANSI/ISA-5.1-2024](https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa5-1)은
공정 흐름도에서 측정·제어 수단을 비전문가도 일관되게 읽도록 기호와 식별 체계를 정의한다. 앱은 P&ID를
복제하지 않지만, 범례, 식별 코드, 비색상 방향·매체 구분, 동일 기호의 일관성을 도면 규칙으로 차용한다.

## 5. 기술 후보와 파일럿

| 후보 | 역할 | 현재 근거 | 필수 파일럿 |
|---|---|---|---|
| SVG 장면 그래프 | 실축·텍스트·독립 내보내기 | 현재 구현과 웹 표준 | 1,000대 팬·줌과 독립 SVG 재개방 |
| PixiJS 8 | WebGL/WebGPU 대규모 2D 렌더 | 47.3k 별, v8.18.1, WebGL 생산 권장 | SVG와 1,000대 편집 성능·텍스트·내보내기 비교 |
| libavoid/WASM | 장애물 회피 직교 경로 | 원 논문과 C++ 라이브러리 | 게임 곡률·최소 길이 제약을 결합한 경로 비교 |
| ELK/elkjs | 생산 그래프·직교 레이아웃 | 그래프 레이아웃 전용, Worker 제공 | 계산 그래프에만 적용하고 수동 공간 배치와 분리 |
| resvg 계열 | 고품질 SVG 래스터화 | Rust 렌더러·Node/WASM 후보 | 브라우저 PNG와 현재 Canvas 결과 픽셀 비교 |
| [CUE4Parse](https://github.com/FabianFG/CUE4Parse) | Unreal 4/5 패키지·메시·텍스처 추출 | Apache-2.0, 591별, FModel 코어 | Satisfactory 1.2 클래스별 메시·재질·피벗 재현성 |
| [FModel](https://github.com/4sval/FModel) | Unreal 아카이브 탐색·변환 | 2.8k별, GPL-3.0, 최신 UE4/5 | 수동 탐색을 재현 가능한 클래스 목록·추출 명령으로 변환 |
| [Three.js](https://github.com/mrdoob/three.js) | 웹 3D·현재 메시 후보 렌더 | 113k별, r184, MIT | Blender 기준 렌더와 시점·재질·그림자·알파 품질 비교 |
| Blender headless | 결정적 오프라인 정사영 렌더 | Python 자동화·Cycles/EEVEE | 전체 클래스 일괄 렌더, 동일 카메라·광원·색 관리·재실행 시간 |

### 5.1 3D·재질·검수 생태계 레이더

GitHub API 직접 조회일은 2026-08-21이다. 별 수는 인기 지표일 뿐 능력 폐기 기준이 아니다.

| 원 저장소 | 별 | 최근 push | 라이선스 | 흡수할 능력과 형태 |
|---|---:|---|---|---|
| [MCPBlender/blender-mcp](https://github.com/MCPBlender/blender-mcp) | 26,110 | 2026-08-16 | MIT | MCP 장면·재질 검사 명령과 반복 작업 인터페이스 `adapt-pattern`; GUI/Computer Use 없이 헤드리스 경로만 파일럿 |
| [DLR-RM/BlenderProc](https://github.com/DLR-RM/BlenderProc) | 3,678 | 2026-01-20 | GPL-3.0 | 결정적 카메라·재질·RGB/depth/normal/segmentation 배치 출력 `adapt-pattern`·`test` |
| [EpicGamesExt/BlenderTools](https://github.com/EpicGamesExt/BlenderTools) | 3,264 | 2026-08-09 | MIT | Unreal↔Blender 축척·normal·애니메이션 계약 `reference`·`test` |
| [Visual Regression Tracker](https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker) | 707 | 2026-08-07 | Apache-2.0 | pixelmatch·looks-same·odiff·VLM 기준선 이력 `adapt-pattern`·`monitor` |
| [botero-dev/bl_datasmith](https://github.com/botero-dev/bl_datasmith) | 491 | 2026-02-10 | 개별 확인 | 장면 계층·재질 그래프·조명·카메라 변환 `reference` |
| [reg-viz/reg-cli](https://github.com/reg-viz/reg-cli) | 418 | 2026-08-21 | MIT | 4K WASM/Rayon 이미지 diff와 작은 산출물 `test`·`integrate` 후보 |
| [h4lfheart/UEFormat](https://github.com/h4lfheart/UEFormat) | 323 | 2026-08-14 | 개별 확인 | FModel/CUE4Parse→Blender 메시·애니메이션 중간 포맷 `monitor`·`pilot` |
| [Waffle1434/Blender-UE4-Importer](https://github.com/Waffle1434/Blender-UE4-Importer) | 91 | 2023-11-22 | 개별 확인 | UE 재질 그래프 변환 노드 목록 `reference`; UE5 지원 불확실성은 해당 통합에만 한정 |
| [AnimNyan/UEShaderScript](https://github.com/AnimNyan/UEShaderScript) | 70 | 2022-12-13 | GPL-2.0 | Unreal 셰이더 맵 프리셋·다중 재질 적용 UX `adapt-pattern` |
| [Satisfactory Modeling Tools](https://github.com/DavidHGillen/Satisfactory_ModelingTools) | 18 | 2024-08-13 | 용도 제한 조건 | 공용 Factory 재질·데칼·UV·Substance·실제 `.blend` 노드 `reference`·`adapt-pattern`; 배포 사용은 별도 조건 확인 |
| [BlenderKit/headless-blender-container](https://github.com/BlenderKit/headless-blender-container) | 16 | 2026-06-25 | 개별 확인 | Blender 다버전 헤드리스 CI 재현 `monitor` |
| [dotm5/UModel_Tools_Next](https://github.com/dotm5/UModel_Tools_Next) | 3 | 2026-07-16 | GPL-3.0 | Blender 5.2/FModel JSON/packed mask/normal/노드 테스트 `adapt-code`·`adapt-pattern`·`test` |

### 5.2 다축 점수와 조사 배분

점수는 [[capability-evaluation-method-2026]]의 결과 가치/증거/복잡성/레버리지/조사 배분 순서다.
복잡성은 감점하지 않고 더 많은 파일럿 자원을 배정한다. 동일 제련기 파일럿을 수행하지 않은 후보는 증거
점수의 실제 표본 30점과 동등 비교 20점을 얻지 못한다.

| 능력 묶음 | 가치 | 증거 | 복잡성 | 레버리지 | 조사 배분 | 현재 처리 |
|---|---:|---:|---:|---:|---:|---|
| Blender 5.2 헤드리스+Anders 셰이더 재구성 | 94 | 82 | 72 | 94 | 61 | 골든 마스터 핵심; AO Ground·Bloom·fake lighting 비교 |
| FModel/CUE4Parse 추출 | 88 | 89 | 76 | 92 | 58 | 이미 통합한 메시·CDO·텍스처를 재질 파이프라인과 연결 |
| UModel Tools Next 재질 규칙 | 79 | 83 | 64 | 88 | 54 | 제련기 파일럿 통과; 코드·TOML·normal·테스트 능력 흡수 |
| Satisfactory Modeling Tools 공용 재질 | 72 | 76 | 58 | 80 | 52 | `.blend` 노드와 UV/데칼/Substance 규칙 흡수, 배포 조건 별도 확인 |
| BlenderProc 배치 렌더 패턴 | 71 | 48 | 72 | 87 | 67 | RGB/depth/normal/ID 패스 파일럿 큐 |
| UEFormat 중간 포맷 | 74 | 42 | 66 | 87 | 69 | glTF가 잃는 재질·애니메이션 정보 비교 파일럿 큐 |
| Blender MCP 장면 검사 | 62 | 46 | 59 | 78 | 61 | GUI 조작은 쓰지 않고 MCP 명령 모델·검사 능력만 분석 |
| reg-cli/VRT 시각 회귀 | 68 | 55 | 43 | 79 | 50 | 골든 마스터 4K/투명 알파/복합 도면 비교 능력 흡수 |

주기 레이더는 매주 월요일 09:00에 실행한다. 변화 속도가 높은 AI/MCP·Blender 5.x·FModel/CUE4Parse와
시각 회귀 도구는 주간 확인하고, 안정된 논문·표준은 주요 버전 또는 분기 단위로 다시 본다.

점수는 동일 표본 파일럿 후 [[capability-evaluation-method-2026]] 기준으로 확정한다.

게임 메시 신규 자산의 주 파이프라인은 `CUE4Parse/FModel → 클래스·메시·재질 추출 → Blender 정사영
배치 렌더 → 원본 미터 박스 결합 → 시각 회귀 시트`로 확정한다. 이는 Anders가 공개한 제작 방식과 직접
일치한다. Three.js는 동일 추출 메시를 사용하는 브라우저 3D 랜딩과 대화형 검수 장면에만 사용하며,
정식 2D 탑뷰 산출의 정본으로 혼용하지 않는다.

### 5.3 게임 패키지 전수 그래프와 파이프라인 교정

개별 패키지를 필요할 때마다 수동 추적하는 방식은 Blueprint 계층, 간접 구성품, 재질 부모, VAT 상태를
누락시켰다. 2026-08-21에 CUE4Parse로 관련 범위를 전수 순회해 다음 로컬 그래프를 생성했다.

| 항목 | 수량 | 검증 |
|---|---:|---|
| 패키지 | 6,706 | 실패 0, NDJSON 행 수와 summary 일치 |
| 재질 | 901 | 인스턴스 부모·스칼라·색·텍스처·스위치 보존 |
| 구성품 | 3,809 | 상대 위치·회전·스케일·직접 메시·override material 보존 |
| 객체 참조 | 54,868 | `/Game` ObjectPath 역참조 가능 |
| 자동 건물 장면 계약 | 576 | `Build_*` Blueprint 구성품과 간접 Blueprint 메시 해석 |

제련기 자동 계약은 현재형 VAT 본체, 정적 프레임, 생산 표시등, 사다리 상호작용, 입·출력, 전력 연결을
동시에 보존한다. `BP_LadderComponent`와 `FGPowerConnectionComponent`는 별도 시각 메시가 아니라
상호작용·연결 구성품이고, 보이는 사다리와 전력 하우징은 정적 프레임에 포함된다. 따라서 시각 메시와
비시각 구성품을 같은 규칙으로 누락 판정하지 않는다.

현재 제련기 Idle 재질은 `SM_VAT_Smelter_01`, `TX_Smelter_Idle_Pos/Quat`, `AnimationLength=1.266667`,
`UpscaleANim=200`, `bAllowQuatDeformation=false`를 사용한다. Idle 위치/회전 텍스처는 1×9이며,
VAT 메시에는 일반 UV 외에 부품 피벗·ID용 UV와 vertex color가 보존돼 있다. 구형 SK 프록시나 일반
POS/Quat 세트를 현재 Idle 자세 대신 사용하지 않는다.

공용 `TX2D_FactoryBase_BC`는 512×512×9 `Texture2DArray`다. 기본 ExportSession은 첫 슬라이스만
PNG로 내보내므로 `DecodeTextureArray`를 사용하는 전용 명령으로 9개를 모두 추출한다. 정적 재질은
고유 AO/도장 마스크, 공용 배열, 부모 재질의 주·보조 도장 색을 함께 복원해야 한다.

[SideFX VAT 3.0 공식 문서](https://www.sidefx.com/docs/houdini/nodes/out/labs--vertex_animation_textures-3.0.html)는
Rigid 모드가 4~6개 UV 채널을 요구하며 피벗 정확도와 Position/Rotation texture가 실시간 셰이더의
핵심임을 명시한다. [공식 Unreal 5.6 가져오기 지침](https://github.com/sideeffects/SideFXLabs/blob/Development/unreal/5.6/VAT%20Import%20Settings%20Guide.txt)은
vertex color를 Replace로 가져오고 normal/tangent를 보존하도록 요구한다. 따라서 VAT GLB의 추가 UV와
vertex color를 장식 데이터로 버리지 않는다.

조립 검수와 스타일 승인을 분리한다. 먼저 PBR·중립 스튜디오 조명에서 정적/VAT/표시등 격리 패스를
확인하고, 모든 부품이 보인 뒤 Anders의 무조명 Facing·AO·Bloom 출력 프로파일을 적용한다. 사선
평행투영은 Anders 골든의 외관 연구용이고, 런타임 탑뷰는 수직 정사영으로 고정한다.

## 6. 미해결 항목

- Anders 91개 후보의 게임 클래스·부품 역할 전수 식별
- 원 Figma 벡터 문서와 재배포·파생 사용 조건
- VAT Idle 1×9 위치 텍스처의 부품 ID·피벗 적용이 원시 기본 자세에 주는 미세 차이
- 게임 1.2 기준 벨트·파이프·리프트 최소 길이와 곡률의 원본 근거
- Anders 21·33번의 상·하단 및 입·출력 방향 의미와 실제 메시·점유·깊이 모델
- ISO 10628 등 유료 표준에서 공개적으로 확인 가능한 적용 범위와 필요한 정식 열람 범위
