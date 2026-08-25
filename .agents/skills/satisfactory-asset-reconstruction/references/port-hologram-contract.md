# 포트 홀로그램 계약

컨베이어·파이프·전력 포트 표식은 다음 증거가 모두 연결된 뒤에만 제품 후보를 렌더한다.

## 정본 경로

1. 건물 Blueprint의 `FGFactoryConnectionComponent` 위치·회전·종류·방향
2. `BP_FactorySettings` CDO가 지정한 포트 종류별 frame mesh, arrow mesh, input/output material
3. 각 StaticMesh의 저자 `ExtendedBounds.Origin/BoxExtent`와 피벗
4. MaterialInstance 부모 체인과 마스터 재질의 blend/depth 속성
5. CUE4Parse glTF 변환과 Blender 임포터의 실제 활성 transform

`npm run game:graph:query -- trace settings:FactoryGame/Content/FactoryGame/Buildable/Factory/BP_FactorySettings.uasset#Default__BP_FactorySettings_C 2`와
건물 `trace` 결과를 영수증에 기록한다. 그래프에 없는 관계를 스크린샷·기억·바운드 추측으로 채우지 않는다.

## 좌표와 피벗 불변식

- Unreal은 왼손 Z-up이며 연결 컴포넌트의 로컬 `+X`가 기기 바깥쪽이다.
- CUE4Parse glTF writer는 메시 정점을 `(X,Y,Z) → (X,Z,Y)`로 바꾸고 0.01 단위 배율을 적용한다.
- Blender glTF importer는 `(X,Y,Z) → (X,-Z,Y)`로 바꾸므로 최종 위치는 Unreal `(X,-Y,Z)`다.
- glTF 노드 회전은 quaternion이다. 임포트 객체의 `rotation_mode`를 확인하고 활성 quaternion 또는
  `matrix_world`만 수정·검사한다. 비활성 `rotation_euler` 값으로 성공을 판정하지 않는다.
- `Input`·`Arrows` 같은 표식 메시의 저자 피벗과 `ExtendedBounds.Origin`은 런타임 배치의 일부다.
  메시를 원점 재중심화하지 않는다. 별도 오프셋이 필요하면 설치본 속성이나 검증된 공용 기하 계약에서 온다.
- `SetupFactoryConnectionMesh` 헤더 선언만으로 frame/arrow 상대 위치를 추론하지 않는다. 구현 또는 동등한
  런타임 관측 계약이 없으면 bounds 접촉식·수동 간격·스크린샷 좌표를 만들지 않고 placement를 `unknown`으로 차단한다.

## 재질과 가시성

- 컨베이어 frame/arrow 및 input/output 재질은 `BP_FactorySettings` 필드에서 선택한다. 이름이 비슷한
  `Hologram_Input`을 대체 사용하지 않는다.
- `Hologram_Simple`의 `bDisableDepthTest`, translucent blend, opacity와 색을 보존한다. Blender가 같은
  깊이 기능을 직접 제공하지 않으면 이를 `unknown/unimplemented`로 기록하고 제품 후보를 차단한다.
  카메라별 메시 이동, billboard 회전, 수동 알파 합성으로 조용히 대체하지 않는다.
- 사용자가 포트의 자연 가림을 명시적으로 허용한 제품 계약에서는 `bDisableDepthTest`를 재현하지 않고
  일반 3D 깊이를 사용해도 된다. 이 예외는 포트 frame/arrow에만 적용하며 clearance 셰이더에는 전파하지 않는다.
- `ClearanceBox + Clearance_Inst`를 독립 생성하거나 visibility·`HMS_OK`만 설정한 캡처는 실제 흰 박스의
  증거가 아니다. `AFGBuildGun::GotoBuildState(<검증된 건물 Recipe>)`를 거친 게임 viewport reference에서
  효과가 나타나는지 확인한다. 제품 후보는 RenderDoc draw의 PSO·셰이더 해시·상수 버퍼·텍스처 바인딩과
  실행 수식을 영수증으로 남겨야 한다. 현재 정본은 PSO `29568`, RenderDoc shader hash
  `34f109e3d5357d8297f0d76c2d589217`, DXIL SHA-256
  `2fdb0174d5497acc800dcdaf3a6bdce84469eba8b8bf4f6d337ddb1caa2a68ee`, UV edge
  `0.5*(pow(1-sin(pi*U),edgestr)+pow(1-sin(pi*V),edgestr))-edgesubtr`, opacity
  `saturate(pow(GradientVert.r,5))`, `s1` anisotropic/UVW `WRAP`, additive `ONE+ONE`, depth test off다. Blender technical 렌더는 같은
  모델·카메라의 clearance 전용 view layer를 base에 additive해 depth test off를 재현하고 포트는 base layer의
  자연 깊이를 유지한다. 최종 alpha는 base와 clearance의 합집합이어야 하며 토대 밖 hard-clearance를 base
  alpha로 잘라서는 안 된다. 외부 이미지 합성이나 카메라별 transform 변경은 허용하지 않는다. 이를 복구하지 못한 새 재질에는 cylinder·halo·
  불투명도·선 폭을 임의로 만들지 않고 clearance effect를 `unimplemented`로 차단한다.

## 외부 자산과 검사

- 제품 기기 장면에는 해당 Blueprint가 소유하거나 간접 Blueprint로 참조한 메시만 포함한다. 연결 예시용
  벨트·파이프는 별도 증거 레이어이며 제품 본체로 승격하지 않는다.
- 최소 검사는 frame 중심/법선, arrow 중심/흐름축/높이, 저자 피벗 보존, 활성 `matrix_world`,
  FactorySettings 메시·재질 경로, `bDisableDepthTest` 보존을 수치로 확인한다.
- 탑뷰와 4방향 ISO는 같은 `.blend`에서 카메라만 바꾼다. 카메라별 객체 transform 변경은 실패다.
