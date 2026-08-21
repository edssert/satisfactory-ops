# AndersPottemager 탑뷰 자산 도입 기록

조사일: 2026-08-21

## 출처

- 제작자: [u/AndersPottemager](https://www.reddit.com/user/AndersPottemager/)
- 공개 배포 맥락: [Can we get a new Anders Pottemager asset set?](https://www.reddit.com/r/SatisfactoryGame/comments/12gskwe/can_we_get_a_new_anders_pottemager_asset_set/)
- 관련 원본 공개: [Satisfactory blueprint asset pack v1.1b](https://www.reddit.com/r/SatisfactoryGame/comments/mq91ek/)
- 활용 튜토리얼: [A 10 min tutorial on making Satisfactory blueprints with Figma](https://www.reddit.com/r/SatisfactoryGame/comments/msq6pb/)

제작자가 공개한 `Assets.zip`의 4096×4096 PNG 네 장을 분석했다. 저장소에는 전체 시트를 넣지 않고,
게임 객체와 대조한 토대·생산 설비·저장고·분배기·병합기뿐 아니라 컨베이어/파이프 직선·곡선·방향·접합부를
투명 WebP로 잘라 사용한다. 원본 시트와 자동 검출 미리보기는
`.tmp-research/`에만 둔다.

## 제품에서의 역할

탑뷰 이미지는 설비를 식별하고 실제 게임과 같은 시각 밀도를 주는 표현 레이어다. 다음 값의 정본은 아니다.

- 설비 크기와 충돌: 게임 `Docs.json`에서 추출한 하드 클리어런스 박스
- 포트 위치: 실제 세이브·블루프린트 연결 끝점의 교차검증 좌표
- 배치 가능 여부: `src/domain/factory/validate.ts`의 검증 결과

즉 이미지를 크게 보이게 하려고 설비 점유공간을 바꾸지 않는다. 캔버스는 자산별 `occupancyFrame`을
게임 하드 클리어런스에 맞춰 역산하고, 시각 메시가 물리 박스 밖으로 돌출되는 부분도 그대로 보존한다.

## 재생성

```bash
python scripts/analyze-topview-sheets.py .tmp-research/anders-assets .tmp-research/anders-detected
python scripts/build-topview-assets.py .tmp-research/anders-assets public/assets/topview
```

자산 식별과 크롭 좌표는 `src/data/curated/topview-assets.json`에 있다. 자동 검출 결과만으로 새 객체를
추가하지 않고 실제 게임 모델·포트 수·외곽 비율을 사람이 확인한다.

현재 물류 자산 id는 `ConveyorBeltStraightMk1`, `ConveyorBeltTurn90Mk1`,
`ConveyorDirectionForward`, `ConveyorDirectionReverse`, `PipelineStraightMk1`,
`PipelineTurn90Mk1`, `PipelineJunctionCrossMk1`이다. 리프트는 이 시트에 없어 [[game-mesh-topviews|게임 원본 메시]]로 보완했다.
