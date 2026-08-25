# Unreal 재질 → Blender 파이프라인 조사

2026-08-25 기준. 목표는 사용자 스크린샷이나 수동 색 추출 없이 Satisfactory 설치본의 메시·Blueprint·
재질·런타임 입력만으로 모든 설비의 Blender 장면을 재현하는 것이다.

## 확인된 실패 원인

- glTF는 표준 Metallic-Roughness PBR을 전달하지만 Satisfactory의 Custom Primitive Data, 텍스처 배열,
  VAT, Mesh Decal, Baked Stencil, Hologram 분기는 표현하지 못한다.
- CUE4Parse는 cooked 패키지와 텍스처·메시를 읽지만 Unreal 재질 그래프를 Blender 노드로 실행해주지는 않는다.
- 기존 구현은 이 간극을 합성 3×3 아틀라스와 임의 색·거칠기·Emission으로 메웠고, `.blend` 이미지 캐시까지
  재사용해 회색 패널·주황 케이블·잘못된 토대 측면·가짜 흰 박스를 만들었다.
- 포트 조립은 `BP_FactorySettings` CDO의 frame/arrow/material 선택을 그래프에 보존하지 않고 이름이 비슷한
  `Hologram_Input`을 사용했다. 실제 기본 입력 재질은 `Hologram_Simple_Transparent_Input`이다.
- CUE4Parse glTF 객체는 Blender에서 quaternion 회전 모드로 임포트되는데 비활성 `rotation_euler`만 수정했고,
  감사도 같은 비활성 값을 읽어 실제 `matrix_world`가 단위행렬인 오류를 통과시켰다.
- `Input` 메시의 저자 bounds 원점 `(19.121107, 0, 72.38407)cm`를 결함으로 오인해 재중심화했다. 이 피벗은
  포트 frame의 전방·높이 배치 일부이므로 보존해야 한다.
- Blueprint가 소유하지 않은 컨베이어 벨트 스텁을 기기 구성품으로 넣었다. 연결 예시 메시와 제품 본체의
  소유 경계를 분리하지 않은 장면 준비 단계 문제였다.

## 포트 재구성 능력 수확

| 능력 단위 | 근거 | 흡수 형태 | 결정 |
|---|---|---|---|
| 포트 +X 외향축과 component transform | 설치본 `FGFactoryConnectionComponent`, SML 제작 문서 | data·test | 통합 |
| 포트 종류별 frame/arrow/material 선택 | 설치본 `Default__BP_FactorySettings_C` | data·graph | 통합 |
| 저자 피벗·bounds 보존 | 설치본 `Input/Arrows.ExtendedBounds` | data·test | 통합 |
| UE→CUE4Parse→Blender 축 변환 | CUE4Parse `Gltf.cs`, Blender glTF importer | adapt-code·test | 통합 |
| 활성 quaternion/matrix 적용 | glTF 2.0 규격, Blender importer `node.py` | adapt-pattern·test | 통합 |
| 포트 depth-test 비활성 재질 | `Hologram_Simple.bDisableDepthTest=true` | data·adapter | 구현 대기; 미구현 시 제품 차단 |
| Workbench `In Front` | Blender 5.2 공식 문서·headless 겹침 fixture | pilot·reference | 깊이 무시는 성공했으나 shader tree/PBR 미지원이라 제품 기술뷰에는 미통합 |
| Eevee Material Preview + `In Front` | Blender 5.2 headless OpenGL fixture | pilot·reject | background 모드에 OpenGL context가 없어 실행 불가 |
| Three.js WebGL `depthTest=false` | 공식 Material API·Playwright headless fixture | pilot·monitor | 깊이 무시는 성공, Blender 복합 노드→glTF 재질 손실로 제품 미통합 |
| 외부 연결 예시와 본체 소유권 분리 | `factory-scenes` Blueprint mesh references | graph·test | 통합 |
| 재귀 component transform 합성 | CUE4Parse SceneComponent·UModel Tools Next/FModel 방식 | adapt-pattern | 다음 복합 부모 fixture에 파일럿 |

성과가 높은 단위는 모두 설치본 자산과 자동 바이오매스 fixture에서 파일럿한다. 전체 도구 채택 여부와 무관하게
CUE4Parse의 축 변환, Blender 임포터의 quaternion 활성화, UModel/FModel의 `matrix_world` 합성 검사를 각각 흡수한다.

| 후보 단위 | 결과 가치 | 근거 신뢰 | 복잡도 부담 | 흡수 레버리지 | 파일럿/결정 |
|---|---:|---:|---:|---:|---|
| 설치본 CDO + Headers API 그래프 | 100 | 100 | 35 | 100 | 23,057 패키지·API 해시·포트 질의 통합 |
| CUE4Parse + Blender quaternion/matrix 계약 | 98 | 100 | 45 | 98 | 자동 바이오매스와 어셈블러 fixture 통과 |
| UModel/FModel 재귀 component matrix 방식 | 88 | 78 | 60 | 92 | 직접·간접 Blueprint에 흡수, 복합 부모 fixture 대기 |
| Workbench `In Front` 기술뷰 | 58 | 95 | 20 | 65 | 깊이 fixture 성공, PBR 미지원으로 제품 미통합 |
| Cycles 수동 합성·카메라별 메시 이동 | 70 | 90 | 55 | 30 | 사용자 방식 위반과 transform 오염 때문에 미통합 |
| Unreal Editor 원본 렌더 | 100 | 20 | 95 | 90 | 로컬 UnrealEditor 부재, 도구 확보 전 대기 |
| Three.js + Blender GLB | 82 | 90 | 70 | 82 | 포트는 성공했지만 Factory/VAT/Foundation 재질이 손실돼 중단 |

## 포트 파이프라인 계약

`FactorySettings → connection component → authored mesh bounds/pivot → material parent properties → active Blender matrix`
경로가 그래프에서 연속돼야 한다. 사용자 스크린샷은 최종 시각 대조에만 사용하며 위치·높이·색·오프셋의
입력값이 아니다. 경로가 끊기거나 Blender가 `bDisableDepthTest` 같은 기능을 재현하지 못하면 제품별 보정으로
메우지 않고 `unknown/unimplemented`로 차단한다.
공식 헤더는 `SetupFactoryConnectionMesh` 선언만 제공하고 frame/arrow 상대 transform 구현은 제공하지 않는다.
따라서 저자 bounds 접촉식으로 간격을 유도한 기존 파일럿도 폐기하고 placement를 `unknown`으로 유지한다.

2026-08-25 headless Workbench fixture에서 `show_in_front`는 가림 물체 뒤 표식을 전면 렌더했다. 하지만
Workbench는 shader tree를 사용하지 않아 현재 게임 PBR 재질·토대·조명 품질을 보존하지 못한다. Cycles의
PBR과 `bDisableDepthTest`를 동시에 만족하는 단일 장면 어댑터가 확보되기 전 `BuildHologram`은 blocked다.
2026-08-26 실제 `AFGBuildGun::GotoBuildState(Recipe_GeneratorBiomass_Automated_C)` 생명주기와 게임 viewport
캡처를 연결했다. 독립 `ClearanceBox + Clearance_Inst`, visibility 강제, `HMS_OK`만으로는 선이 나오지 않았고,
실제 BuildGun 상태에서만 흰 박스가 나타났다. reference는 4개 세로 사각면으로 된 `ClearanceBox` UV0의
바닥·천장·수직 12경계, additive 코너 중첩, 높이 감쇠를 확인했다. RenderDoc draw `11401`의 PSO는
`29568`, shader hash는 `34f109e3d5357d8297f0d76c2d589217`, 추출한 DXIL SHA-256은
`2fdb0174d5497acc800dcdaf3a6bdce84469eba8b8bf4f6d337ddb1caa2a68ee`다. DXIL에서 edge는
`0.5*(pow(1-sin(pi*U),edgestr)+pow(1-sin(pi*V),edgestr))-edgesubtr`, opacity는
`saturate(pow(GradientVert.r,5))`로 확정됐고 blend는 `ONE+ONE`, depth test off다. 정적 MaterialInstance는
`LineStr=0.1`, `LineColor=(1,0,0)`이지만 실제 draw의 material cb2(root parameter 6, resource 332,
offset 590336)는 `[(30,0.3,0,0),(1,1,1,3),(0,0,0,0)]`이다. 따라서 유효 배치 런타임은
`edgestr=30`, `edgesubtr=0.3`, `Glow=3`, `Color=(1,1,1)`, `LineStr=0`, `LineColor=(0,0,0)`,
`EncroachingAClearance=0`으로 흰 선을 출력한다. 이전의 `Mam_EdgeLine_Alb`·`Mam_ScanLine_Alb` 기반
거리 정규화는 실제 실행 셰이더가 아니므로 제거했다. Blender 어댑터는 같은 UV 절차식, `GradientVert^5`,
실제 `s1`의 anisotropic + UVW `WRAP` sampler, 색 lerp와 음수 clamp, Transparent+Emission Add Shader로
이 additive 계약을 재현한다. clearance view layer는
같은 모델·카메라에서 base에 additive되며 최종 alpha는 base와 clearance의 합집합이라 8×10 제작기 hard box가
8×8 토대 밖에서 잘리지 않는다.
`npm run game:render:capture:clearance`는 포커스를 바꾸지 않는 별도 Win32 desktop에서 실제 BuildGun 프레임을
캡처하고 `zip.xml` 변환과 draw 상태 분석 JSON까지 연속 생성한다. 기존 캡처를 다시 분석할 때는
`npm run game:render:analyze:clearance`를 쓴다.
카메라별 객체 이동과 사용자가 거부한 수동 합성은 대체안으로 채택하지 않는다.

## 현재 게임 Unreal 실행 경로

2026-08-26 공식 Satisfactory Modding stable 문서는 게임 1.2와 같은 Unreal 5.6.1-CSS, Visual Studio
2022 17.14, MSVC v143 14.38, Wwise 2023.1.14.8770, SML Starter Project를 요구한다. 공식 문서가 소개한
SMEH `20aab9e6dd412f6855aedac984c73d4c54880448`은 이 설치 순서, 재개 가능한 단계 메뉴, VS 구성 적용,
엔진 설치, Starter Project, Wwise, 프로젝트 생성·빌드를 제공한다. 다만 엔진 바이너리는 비공개 저장소라
SMEH도 자동 다운로드하지 못하고 수동 계정 연결과 릴리스 파일 확보를 요구하며, 프로세스 창 숨김 계약도
이 앱의 사용자 환경 규칙과 다르다. 따라서 설치 순서·상태 탐지는 흡수하되 제품 파이프라인 실행기는
저장소의 결정적 headless 명령으로 별도 구현한다.

`npm run game:render:env`는 GitHub CLI, EpicGames 조직, SatisfactoryModding 비공개 엔진, VS2022,
UnrealEditor-Cmd, Starter Project, Wwise를 한 번에 점검한다. Unreal fixture는 제품 렌더가 아니라 현재 게임이
해석한 component·material·lightweight instance·clearance·BuildGun 포트 계약을 JSON으로 고정하는 probe다.

Starter Project의 FactoryGame 콘텐츠는 코드 컴파일과 참조를 위한 placeholder이므로 최종 재질 정본으로
사용하지 않는다. 실제 Satisfactory 런타임 probe는 `Persistent_Level` 새 세션에서 자동저장을 끄고 cooked
Blueprint를 `AFGBuildableSubsystem::BeginSpawnBuildable`로 생성한다. 이 과정에서 native 포트 transform·재질,
clearance와 HISM/lightweight 동작을 검증했지만 제품 렌더는 게임 월드 로딩과 공용 HISM 배경 격리 비용이 크다.
따라서 Unreal은 JSON 정본 추출과 Blender 결과 대조에만 사용하고, 제품 이미지는 Blender의 하나의 장면에서
생성한다. 포트 always-on-top 요구는 제거하고 자연 가림을 허용하므로 Blender depth 기능으로 충분하다.
Three.js는 `Material.depthTest=false`를 정확히 제공했지만 Blender의 Factory Array·VAT·Foundation 복합
노드가 glTF PBR로 내보내지지 않아 동일 fixture의 색·금속·토대 재질이 회귀했다. 별도 WebGL material IR
어댑터를 구현하기 전에는 의존성과 파일럿 코드를 제품 저장소에 남기지 않는다.
Eevee viewport `In Front`는 shader tree를 유지할 가능성이 있으나 `bpy.ops.render.opengl`이 background
모드에서 OpenGL context 부재로 실패했다. 데스크톱 창·포커스를 변경하는 GUI 자동화는 사용자 환경 계약상
후보에서 제외한다.

## 흡수할 능력

| 능력 | 근거 | 파이프라인 적용 |
|---|---|---|
| Primitive Data 인덱스와 Blueprint 값 분리 | Epic Custom Primitive Data 문서 | 카탈로그가 재질별 인덱스와 `BP_BuildableSubsystem` 색상 슬롯을 함께 내보낸다 |
| Mesh Decal은 밑면 색을 유지하고 Normal 채널만 변경 | Epic Decal·Mesh Decal 문서 | 데칼을 불투명 PBR로 렌더하지 않고 수신 표면에 tangent normal을 bake한다 |
| VAT는 위치·노멀 텍스처/UV와 시간 입력을 함께 해석 | Epic Vertex Animation Tool 문서 | idle frame을 CPD `TimeOffset/Speed`와 VAT 텍스처에서 결정한다 |
| 커스텀 셰이더 정보는 표준 glTF 밖에 둔다 | Khronos glTF 확장 규격 | GLB 옆의 `material-ir.json` sidecar로 보존한다 |
| CUE4Parse는 원본 패키지·텍스처 추출기로 사용 | CUE4Parse 정본 저장소 | 추출과 Blender 재질 해석을 한 모듈로 섞지 않는다 |
| Satisfactory 공용 재질은 전용 UV sheet와 공용 파츠를 사용 | Satisfactory ModelingTools 제작자 자료 | 구현 아이디어만 참고하고 값은 현재 설치본에서 다시 추출·검증한다 |

## 모듈과 어댑터

외부 seam은 `build-isometric-scene <scene.json> <output-dir>` 하나다. 호출자는 Unreal 재질 세부사항을 알지
않는다. 구현 내부에서 다음 어댑터가 `material-ir.json`을 만든다.

1. `MM_Factory_Array`: Material ID UV, 텍스처 배열 slice, CPD 0~14, 기본 색상 슬롯을 결합한다.
2. `MM_FactoryBaked_VAT`: VAT position/normal, UV, idle time, paint CPD를 결합한다.
3. `Decal_Normal`: Mesh Decal의 Normal/Opacity를 수신 표면 tangent space에 bake한다.
4. `MM_BakedStencil_01`: UV0 표면과 UV1 stencil, mask min/max, Foundation 색상 슬롯을 결합한다.
5. `BuildHologram`: `BP_FactorySettings`가 고른 frame/arrow 메시와 simple input/output 재질, 저자 피벗,
   component transform을 같은 장면에 조립한다. 카메라별 billboard·위치 보정은 하지 않는다.

각 어댑터는 `verified` 영수증이 없으면 제품 렌더를 차단한다. 진단 fallback은 별도 플래그에서만 허용하고
도감 매니페스트에 연결하지 않는다.

## 캐시와 검증

- 캐시 키: 게임 Build CL + 패키지 SHA-256 + 어댑터 버전 + Blender 버전 + 장면 계약 SHA-256.
- `.blend`를 열 때 외부 이미지의 경로와 SHA-256을 다시 확인하며 불일치하면 렌더하지 않는다.
- 실패 PNG/BLEND는 실행 종료 시 삭제하고 JSON 영수증만 남긴다.
- 구조 검사는 토대 상판 옆면 오염 0, 토대/클리어런스 중심 편차 0m, 포트 transform 일치를 요구한다.
- 재질 검사는 다섯 어댑터 전부 `verified`여야 한다. 하나라도 미완료면 public 복사와 도감 연결을 금지한다.

## 조사 근거

- Epic Games, Custom Primitive Data: https://dev.epicgames.com/documentation/en-us/unreal-engine/storing-custom-data-in-unreal-engine-materials-per-primitive
- Epic Games, Decal Materials: https://dev.epicgames.com/documentation/unreal-engine/decal-materials-in-unreal-engine
- Epic Games, Mesh Decals: https://dev.epicgames.com/documentation/unreal-engine/using-mesh-decals-in-unreal-engine
- Epic Games, Vertex Animation Tool: https://dev.epicgames.com/documentation/unreal-engine/vertex-animation-tool-in-unreal-engine
- CUE4Parse: https://github.com/FabianFG/CUE4Parse
- Khronos glTF 2.0: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.pdf
- Satisfactory ModelingTools: https://github.com/DavidHGillen/Satisfactory_ModelingTools
- Epic Games, Coordinate System and Spaces: https://dev.epicgames.com/documentation/en-us/unreal-engine/coordinate-system-and-spaces-in-unreal-engine
- Blender glTF importer 5.2 `node.py`, `blender_gltf.py`: 로컬 설치본 `scripts/addons_core/io_scene_gltf2`
- Satisfactory `BP_FactorySettings`, `Input`, `Arrows`, `Hologram_Simple*`: 현재 게임 설치본 CDO/패키지
- Blender 5.2 Workbench/In Front: https://docs.blender.org/manual/en/latest/render/workbench/index.html
