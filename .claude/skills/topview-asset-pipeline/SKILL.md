---
name: topview-asset-pipeline
description: Satisfactory 게임 기기의 현재형 메시·재질·Blueprint 조립을 검증하고, 수직 정사영 탑뷰와 게임 하드 점유 코너를 회귀 없이 생성할 때 사용한다.
license: MIT
---

# 탑뷰 자산 파이프라인

제품 탑뷰는 `scripts/topview/run-validated-render.mjs`로만 생성한다. `render-topview.py` 직접 실행은
사선·측면 진단에만 허용되며 수직 제품 탑뷰는 하네스 토큰이 없으면 출력 전에 실패한다. Blender Python은
기본적으로 예외가 나도 프로세스 코드 0을 반환할 수 있으므로 하네스는 `--python-exit-code 3`을 강제한다.

## 작업 순서

1. 게임 설치본 자산 그래프와 Blueprint CDO를 정본으로 삼는다. 파일명이나 오래된 Anders 시트 분류만으로
   기기 클래스를 확정하지 않는다.
2. 정면·후면·좌·우 직교뷰와 네 방향 아이소메트릭에서 조립·축·포트·사다리·표시등을 먼저 검증한다.
3. 승인된 장면 레시피의 `orthographic-top`, `frontTiltDeg=0`, `game-hard-clearance`를 변경하지 않는다.
4. 제품 후보는 다음 명령으로 격리 출력한다.

   ```powershell
   node scripts/topview/run-validated-render.mjs scripts/topview/scenes/<machine>.json .cache/topview/validated/<machine> --baseline=<approved.png>
   ```

5. 영수증 상태가 `validated-baseline-match-not-approved` 또는 `validated-change-candidate-not-approved`인
   이미지는 public 자산으로 복사하거나 완료 이미지로 제시하지 않는다. 구조 검사를 통과한 최종 후보
   한 장만 실제로 열어 시각 검수한다.

## 반복 결함 차단

- 같은 유형 결함이 두 번 발생하면 세 번째 좌표·재질 수정 전에 원천→추출→좌표 변환→조립→카메라→합성
  단계의 감사를 수행한다.
- 반복 결함을 문서에만 적고 수동 주의로 처리하지 않는다. 해당 불변식을 하네스 검사나 장면 레시피
  검증에 추가한 뒤 작업을 재개한다.
- 승인 기준본을 바꿀 때는 사용자의 명시적 시각 승인 근거와 새 SHA-256을 기록한다.
- 중간 렌더와 비교 시트는 채팅에 노출하지 않는다. 실패 산출물은 `.cache/`에만 남긴다.

## 승인 기준

- Blender 카메라가 `ORTHO`이고 월드 전방 벡터가 정확히 `(0,0,-1)`이다.
- 흰 `ㄴ` 코너의 네 절점은 장면 레시피의 게임 하드 클리어런스 투영값과 일치한다.
- 시각 돌출부, 그림자, 발광 번짐은 점유 코너 크기나 위치를 바꾸지 않는다.
- 허용한 재질·형상 변경 이외의 카메라·조립·코너 회귀가 없다.
- 클래스 식별이 현재 게임 Blueprint·아이콘·메시와 교차 검증됐다.
