---
name: satisfactory-asset-reconstruction
description: Reconstruct and validate Satisfactory machine assets from current game meshes, materials, and Blueprint composition, then produce orthographic top views with hard-clearance evidence. Use for machine scene recipes, Blender assembly, top-view candidates, or approved asset promotion.
license: MIT
---

# Satisfactory 자산 재구성

제품 탑뷰는 `scripts/topview/run-validated-render.mjs`로 생성한다. 직접 Blender 렌더는 진단용이며 제품 후보 승격 경로가 아니다.

1. 현재 설치본 자산 그래프와 Blueprint CDO로 클래스·부품·transform을 확정한다. 재질은 각 슬롯의
   `MaterialInstance → 부모 체인 → 마스터 재질`, 텍스처 형식·해상도, UV 채널 용도, vertex color와
   Primitive Data 의존성을 함께 기록한다. PNG가 있다는 이유만으로 재질이 복원됐다고 판정하지 않는다.
   사용자가 찍은 스크린샷이나 수동 색 추출값은 장면·재질·클리어런스·포트의 입력으로 사용하지 않는다.
   포트·클리어런스·BuildGun 표식은 구현 전에 [포트 홀로그램 계약](references/port-hologram-contract.md)을
   읽고 설치본 그래프 경로를 영수증에 남긴다. 경로가 끊기면 각도·높이·색·오프셋을 추정하지 않고 후보를 차단한다.
2. `node scripts/topview/audit-isometric-material-fidelity.mjs <scene.json> --require-product`로 공용 텍스처
   배열을 합성 아틀라스로 대체한 슬롯을 제품용 렌더 전에 차단한다. 합성 아틀라스는 형상 진단 후보에만 쓴다.
3. 정면·후면·좌·우 직교뷰와 네 방향 아이소메트릭에서 조립·축·포트·사다리·표시등을 검증한다. 토대는
   이동 뒤 view layer를 갱신하고, 상판 재질을 법선뿐 아니라 world-space 최고 높이로 제한한다.
4. 토대 포함 아이소메트릭은 같은 `.blend`의 메시·카메라·광원·그림자를 사용하고
   토대 중심은 시각 메시 bounds가 아니라 `mClearanceData` 중심에 맞춘다.
   `scripts/topview/audit-isometric-scene.py`가 `sideContamination: 0`, `maxDeviationM: 0`을 반환해야 한다.
5. 승인 장면의 `orthographic-top`, `frontTiltDeg=0`, `game-hard-clearance` 계약을 유지한다.
6. `node scripts/topview/run-validated-render.mjs scripts/topview/scenes/<machine>.json .cache/topview/validated/<machine> --baseline=<approved.png>`로 제품 탑뷰 후보를 격리 출력한다.
7. 구조·재질 검사를 통과한 최종 후보를 실제로 열어 본다. 사용자가 자산 구현을 요청한 가역적 앱 작업이면 새
   SHA-256과 매니페스트를 기록해 바로 앱에 연결한다. 별도 승인은 사용자가 게이트를 요청했거나 외부 자산
   권리, 승인 기준본 교체, 해결되지 않은 시각 이견이 있을 때만 요구한다.

제품별 보정 스크립트나 기기명 분기는 금지한다. 새 실패가 나오면 설치본 카탈로그 → 파생 그래프 → 공용 계약 →
결정적 검사 순서로 원인을 흡수하고, 같은 클래스의 다음 기기에 재사용할 수 있어야 한다.

카메라는 `ORTHO`, 월드 전방은 `(0,0,-1)`이어야 한다. 흰 코너는 게임 하드 클리어런스 투영값과 일치해야 하며 그림자·발광·시각 돌출부가 점유 경계를 바꾸면 안 된다. 기준본 변경은 사용자 시각 승인과 새 SHA-256을 요구한다.
현재 렌더나 사용자 지시가 ROADMAP과 충돌하면 ROADMAP을 먼저 갱신하고 현재 증거를 따른다. 이미 확인한
후보에 근거 없는 투명도·재질 보정을 추가하지 않는다.
