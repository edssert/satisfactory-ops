---
name: satisfactory-asset-reconstruction
description: Reconstruct and validate Satisfactory machine assets from current game meshes, materials, and Blueprint composition, then produce orthographic top views with hard-clearance evidence. Use for machine scene recipes, Blender assembly, top-view candidates, or approved asset promotion.
license: MIT
---

# Satisfactory 자산 재구성

제품 탑뷰는 `scripts/topview/run-validated-render.mjs`로 생성한다. 직접 Blender 렌더는 진단용이며 제품 후보 승격 경로가 아니다.

1. 현재 설치본 자산 그래프와 Blueprint CDO로 클래스·부품·transform·재질을 확정한다.
2. 정면·후면·좌·우 직교뷰와 네 방향 아이소메트릭에서 조립·축·포트·사다리·표시등을 검증한다.
3. 승인 장면의 `orthographic-top`, `frontTiltDeg=0`, `game-hard-clearance` 계약을 유지한다.
4. `node scripts/topview/run-validated-render.mjs scripts/topview/scenes/<machine>.json .cache/topview/validated/<machine> --baseline=<approved.png>`로 후보를 격리 출력한다.
5. 구조 검사를 통과한 최종 후보를 실제로 열어 본다. 사용자가 자산 구현을 요청한 가역적 앱 작업이면 새
   SHA-256과 매니페스트를 기록해 바로 앱에 연결한다. 별도 승인은 사용자가 게이트를 요청했거나 외부 자산
   권리, 승인 기준본 교체, 해결되지 않은 시각 이견이 있을 때만 요구한다.

카메라는 `ORTHO`, 월드 전방은 `(0,0,-1)`이어야 한다. 흰 코너는 게임 하드 클리어런스 투영값과 일치해야 하며 그림자·발광·시각 돌출부가 점유 경계를 바꾸면 안 된다. 기준본 변경은 사용자 시각 승인과 새 SHA-256을 요구한다.
현재 렌더나 사용자 지시가 ROADMAP과 충돌하면 ROADMAP을 먼저 갱신하고 현재 증거를 따른다. 이미 확인한
후보에 근거 없는 투명도·재질 보정을 추가하지 않는다.
