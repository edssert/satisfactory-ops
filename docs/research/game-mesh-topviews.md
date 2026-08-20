---
title: 게임 원본 메시 기반 탑뷰 생성
aliases:
  - game-mesh-topviews
tags:
  - satisfactory-ops
  - research/assets
  - factory-editor
status: verified
updated: 2026-08-21
related:
  - "[[anders-topview-assets]]"
  - "[[PRODUCT-SPEC]]"
  - "[[DATA-MODEL]]"
---

# 게임 원본 메시 기반 탑뷰 생성

AndersPottemager 공개 시트에 없는 최신 설비를 원근 아이콘이나 생성형 이미지로 대체하지 않기 위해,
로컬 Satisfactory 설치본에서 실제 메시를 읽어 정사영 탑뷰를 만들었다. 이 결과는 표현 레이어이며
설치 가능 영역의 정본은 계속 `src/data/app/buildings.json`의 하드 클리어런스다.

## 검증한 도구 체인

- 설치본: `++FactoryGame+rel-main-anniversary-2026-CL-502094`
- 엔진: Unreal Engine 5.6.1
- 파일 해석: [CUE4Parse](https://github.com/FabianFG/CUE4Parse) `cd413cfc`, Apache-2.0
- 메시 포맷: GLB(glTF 2.0), 단위 변환은 CUE4Parse의 Unreal cm → m 변환을 사용
- 렌더: Three.js 0.180.0 정사영 카메라, 투명 배경, 1024×1024
- 게임 파일 추출 절차: [Satisfactory Modding Documentation](https://docs.ficsit.app/satisfactory-modding/latest/Development/ExtractGameFiles.html)

공식 모딩 문서의 예전 UE 5.3 예제를 그대로 쓰면 1.2 설치본에서 패키지 이름 테이블의 오프셋이 어긋난다.
실제 설치본 버전에 맞춰 `EGame.GAME_UE5_6`을 사용해야 네 대상 메시가 모두 정상 디코딩됐다.

## 생성 자산과 측정값

| 건물 클래스 | 원본 패키지 | 메시 경계 폭×길이×높이 | 하드 클리어런스 |
|---|---|---:|---:|
| `Build_MinerMk1_C` | `MinerMk1_static`, `SK_MinerMk1` | 6.6285×14.2832×19.981 m | 6×14 m 복합 박스 |
| `Build_GeneratorBiomass_Automated_C` | `GeneratorBiomass_static`, `SM_VA_GeneratorBiomass` | 8.3344×7.5158×6.9785 m | 8×8 m |

메시 경계와 하드 박스가 다른 것은 오류가 아니다. 손잡이·난간·장식처럼 보이는 부분은 충돌 상자 밖으로
나갈 수 있다. `src/data/curated/topview-assets.json`의 `occupancyFrame`은 1024px 렌더 안에서 하드 박스가
차지하는 정규화 좌표를 기록한다. 편집기는 이 프레임을 청록 선택 경계에 맞추므로 이미지 여백이 배치
간격을 만들거나, 반대로 시각 돌출부가 충돌 판정을 넓히지 않는다.

## 결과와 시각 검증

- `public/assets/topview/Build_MinerMk1_C.webp`
- `public/assets/topview/Build_GeneratorBiomass_Automated_C.webp`
- 배치 가능한 열 개 설비 모두 `imageKind: topview`로 렌더되어 원근 아이콘 폴백은 0건이다.
- 파운데이션 여덟 장 위에 두 자산을 배치하고 `도면 맞춤`을 실행한 실브라우저 검사에서 콘솔 오류 0건,
  탑뷰 이미지 2/2건 로드를 확인했다.

## 사용 조건

추출기와 렌더러 코드는 각 오픈소스 라이선스를 따르지만, 결과 이미지 자체는 Coffee Stain Studios의
게임 자산에서 파생됐다. 저장소 MIT 라이선스 대상이 아니며 출처 표기를 제거하거나 게임사 공식 제품인
것처럼 배포하면 안 된다. 전체 패키지나 원본 메시를 저장소에 넣지 않고 제품에 필요한 파생 WebP만 둔다.
