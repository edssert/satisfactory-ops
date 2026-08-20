# 공정 배치 엔진 조사와 적용 기준 (2026-08-21)

## 결론

공정 계산, 설비 배치, 입·출력 위치, 물류 경로를 차례대로 따로 푸는 방식은 사용하지 않는다.
배치와 경로가 서로의 결과를 바꾸므로 하나의 모델 안에서 함께 검증해야 한다. 도면은 최적화 결과가
아니라 **하드 제약을 모두 통과한 공장 모델의 뷰**다.

## 연구에서 코드로 옮긴 원칙

1. **배치·I/O·통로를 동시에 다룬다.** Friedrich et al.은 설비 위치, 물류 처리점, 통로를
   순차적으로 정하면 실제 이동 거리가 예상보다 커질 수 있음을 보이고 세 문제를 함께 푸는 MIP를
   제안한다. 따라서 설비를 놓은 뒤 포트를 임의로 붙이는 기존 구현을 폐기한다.
2. **목적함수는 유량 가중 경로 길이에서 시작한다.** 기본 비용은
   `Σ(item flow × routed distance)`다. 직선거리 대신 실제 라우팅 경로 길이를 사용한다.
3. **실행 가능성과 최적화를 분리한다.** 충돌, 파운데이션 지지, 포트 매체/방향, 운송 용량,
   유량 보존, 전력 연결은 점수가 아니라 실패 조건이다. 실행 가능한 후보끼리만 거리·면적·증설성으로
   비교한다.
4. **다목적 결과를 보존한다.** 최신 FLP 검토는 현실의 배치가 비용·거리·근접성·유연성 등을 함께
   다루는 NP-hard/NP-complex 문제라고 정리한다. 하나의 가짜 ‘최적안’ 대신 균형형·최소 면적형·증설형
   후보와 각 손실을 보여준다.
5. **증설 구역을 모델에 넣는다.** 동적 FLP와 zone-based 연구에 따라 미래 설비를 위한 예약 영역을
   빈 장식이 아니라 충돌 금지 구역으로 저장한다.
6. **복수 물류 경로는 서로 장애물이다.** 산업 배관 라우팅을 multi-agent pathfinding 문제로 보는
   연구를 따라 벨트·파이프 경로를 순차 독립 A*로 확정하지 않고, 교차·고도·공용 지지대를 함께 평가한다.

## 현재 구현 범위

- `scripts/extract-save-ports.mjs`: 실제 세이브의 컨베이어 스플라인 끝점에서 설비 포트 좌표 역산
- `src/data/curated/machine-ports.json`: 반복 관측이 5cm 이내로 일치한 포트만 `verified`
- `src/domain/factory/`: 미터 좌표계, 회전, 하드 박스 충돌, 포트 접속, 용량, 전력 검증
- 같은 높이의 벨트·파이프가 접속 장치 없이 교차하면 발행을 차단하고, 면적 절약·균형·증설 우선 후보를 서로 다른 실제 통로 폭으로 생성
- 검증된 포트가 없는 설비는 자동 배치 도면 발행 불가

## 출처

- Friedrich, C. et al., “Optimal facility layout and material handling network design,”
  *Computers & Operations Research* 103 (2019), 237–251.
  https://doi.org/10.1016/j.cor.2018.11.002
- Friedrich, C. et al., “Integrated slicing tree approach for solving the facility layout problem with
  input and output locations based on contour distance,” *European Journal of Operational Research*
  270(3) (2018), 837–851. https://doi.org/10.1016/j.ejor.2018.01.001
- Sadeghpour, F. et al., “A comprehensive review of static and dynamic facility layout problems,”
  *Annual Reviews in Control* 58 (2024), 100970. https://doi.org/10.1016/j.arcontrol.2024.100970
- Besbes, M. et al., “Fields of action towards automated facility layout design and optimization in
  factory planning,” *CIRP Journal of Manufacturing Science and Technology* 35 (2021), 605–625.
  https://doi.org/10.1016/j.cirpj.2021.09.013
- Belov, G. et al., “From Multi-Agent Pathfinding to Pipe Routing,” arXiv:1905.08412 (2019).
  https://arxiv.org/abs/1905.08412
- SML Documentation, “Extracting Game Files.” FModel, UE 5.6, glTF/PNG 추출 절차.
  https://docs.ficsit.app/satisfactory-modding/latest/Development/ExtractGameFiles.html
