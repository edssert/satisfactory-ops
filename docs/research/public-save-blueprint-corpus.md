# 공개 세이브·블루프린트 검증 코퍼스

조사일: 2026-08-21  
상태: 코퍼스 7건 파싱 완료, 포트 좌표 큐레이션 반영

## 목적

한 사람의 세이브에 우연히 나타난 배치를 게임 규칙으로 오인하지 않기 위해, 서로 다른 제작자와 게임 빌드에서 실제로 연결된 벨트·파이프·전력선을 읽는다. 파일의 배치 자체를 정답 설계로 복사하지 않고 다음 사실만 추출한다.

- 설비 로컬 좌표계의 고체·유체·전력 포트 위치
- 포트가 연결된 매체와 방향
- 회전된 설비에서 포트와 운송 끝점이 일치하는지
- 실제 블루프린트의 설비·벨트·리프트·파이프·전력선 구성 비율
- 파일 내부 좌표 이상치와 게임 버전 간 드리프트

원본 바이너리는 `.tmp-research/`에만 두며 배포물과 Git에는 넣지 않는다. 큐레이션에는 파일 해시, 게임 빌드, 집계값만 남긴다.

## 코퍼스

| ID | 종류 | 제작자 | 게임 빌드 | 핵심 구성 | SHA-256 |
|---|---|---|---:|---|---|
| local-current-save | 로컬 세이브 | 비공개 | 502094 | 현재 1.2 기준 초기 설비·전력 | `02ca45163dde1c8fe1db6b2b82140e5b558936e26c43b888d323fcc735b55c25` |
| public-save-1897uoc | [공개 세이브](https://www.reddit.com/r/SatisfactoryGame/comments/1897uoc/) | Reddit 배포자 | 264901 | 대규모 생산 설비·전력망, 18,037개 연결 관측 | `5217a24af351e7e7b0711b269c78e17b3e2d7bac0d04915d8123291b74a10258` |
| 1788 | [THX - 24 Vanilla Constructors](https://satisfactory-calculator.com/en/blueprints/index/details/id/1788/name/THX%2B-%2B24%2BVanilla%2BConstructors) | ThreaXus | 211116 | 제작기 24, 리프트 86, 전력선 55 | `1eddfb1bb51539a570ee44649e4e158c64069c71bba764c8195e4f892e656694` |
| 8353 | [8x Refinery](https://satisfactory-calculator.com/en/blueprints/index/details/id/8353/name/8x%2BRefinery%2B%28universal%2Bsetup%29) | Sentinel | 384038 | 정유소 8, 고체·유체 양방향 물류 | `9184f31f20c2c7d49d337abea53bcd35c618ed04a163ef3625af18c8d42e3d98` |
| 8753 | [Aluminum Casing 195/min](https://satisfactory-calculator.com/en/blueprints/index/details/id/8753/name/Aluminum%2BCasing%2B195%2Fmin%2BMK.3) | Katoo | 395236 | 정유소·조립기·파이프·전력 | `f046e804ca24056514af4387f0967ebcebb730e3afaf2ccfda516c547777d4a4` |
| 11980 | [BB Plastics Factory 90 1.2V1](https://satisfactory-calculator.com/en/blueprints/index/details/id/11980/name/BB%2BPlastics%2BFactory%2B90%2B1.2V1) | Frabble | 488068 | 1.2 정유소 6·블렌더·배관·전력 | `a9d116c8b26c9e43af195b332168a38164399341d660600532b65019cdef2cbe` |
| 12230 | [Manufacturer w Platform](https://satisfactory-calculator.com/en/blueprints/index/details/id/12230/name/Manufacturer%2Bw%2BPlatform) | N0TAB0T | 493833 | 1.2 제조기·5개 벨트·전력 | `b5b536483e1ed57b8ef38e4a49e2cfb99772b643d6606ed78882441af50c3757` |
| 12350 | [Motors/Stators/Rotors](https://satisfactory-calculator.com/en/blueprints/index/details/id/12350/name/Motors%2FStators%2FRotors) | _TREVOR_ | 495413 | 1.2 제작기 31·조립기 9·제련기 9·주조기 2 | `ffe782263ea9a3aadc30fc72a9107e026b682b208a58226db2106f7215ed99c7` |

세이브 파일이 `.sav`이며 블루프린트가 세이브와 유사한 직렬화 구조를 쓴다는 형식 근거는 [공식 위키의 Save files](https://satisfactory.wiki.gg/wiki/Save_files)와 사용 중인 [Satisfactory file parser](https://github.com/JWalk9000/sf-file-parser)에서 확인했다.

## 추출 방법

1. 설비의 `FGFactoryConnectionComponent`, `FGPipeConnectionFactory`, `FGPowerConnectionComponent`를 찾는다.
2. 고체·유체는 연결 대상 컨베이어/파이프의 스플라인 첫째 또는 마지막 점을 월드 좌표로 변환한다.
3. 전력은 전력선의 `source`·`target`, 선의 변환, `CachedRelativeLocations`로 양끝 월드 좌표를 복구한다.
4. 설비 쿼터니언의 역회전으로 월드 끝점을 설비 로컬 좌표로 바꾼다.
5. 현재 게임 데이터의 충돌 상자보다 2m 이상 벗어난 관측은 폐기한다.
6. 같은 포트에서 반경 5cm 안에 가장 많은 관측이 모인 군집만 합의값으로 삼는다.
7. 서로 다른 파일 또는 현재 빌드와 일치한 포트만 `verified`로 큐레이션한다.

재현 명령:

```bash
node scripts/extract-save-ports.mjs <save.sav>
node scripts/analyze-blueprint-corpus.mjs <blueprint-directory>
```

두 스크립트 모두 원본 경로와 액터 인스턴스명을 출력하지 않는다.

## 확인된 결과

- 현재 로컬 세이브와 공개 세이브, 1.2 블루프린트에서 제작기·조립기·제련기의 고체 포트가 1mm 안에서 일치했다.
- 제작기 전력 포트는 현재 로컬 세이브와 1.2 공개 블루프린트에서 `(2.1, -4.7, 6.8717)m`로 일치했다.
- 정유소는 1.2 포함 세 제작자 블루프린트에서 고체 입력 `(2, 9, 1)m`, 고체 출력 `(2, -9, 1)m`, 유체 입력 `(-2, 9, 1.75)m`, 유체 출력 `(-2, -9, 1.75)m`가 일치했다.
- 정유소 전력 포트는 세 공개 블루프린트 22관측에서 `(0, -9.6904, 18.7247)m`로 수렴했다.
- 8753 파일의 일부 조립기 변환은 연결 끝점과 충돌 상자가 양립하지 않았다. 30개 포트 후보 중 12개를 자동 폐기했고, 유효 군집에 섞인 2개 유체 이상치도 합의 군집에서 제외했다. 따라서 다운로드 수나 평점이 높아도 파일 전체를 무비판적으로 신뢰하지 않는다.
- 12350의 1.2 설비는 제작기 31대, 분배기 70개, 병합기 55개, 벨트 245개, 전력선 63개였다. 기계만 놓는 도면은 실제 고밀도 공장의 물류·전력 부품량을 크게 과소평가한다.

## 제품 반영

- `src/data/curated/machine-ports.json` 스키마 2에 출처별 해시와 완전 검증된 설비 목록을 추가했다.
- 설비에 일부 포트만 있어도 도면을 발행하던 허점을 막았다. `$completeBuildings`에 있고 모든 포트가 검증된 설비만 발행 가능하다.
- 포트 미검증 설비는 계산에는 쓸 수 있어도 실제 배치 도면에는 쓸 수 없다.
- 다음 단계는 컨베이어 리프트의 `mTopTransform`을 해석해 리프트에 직접 붙은 제조기·블렌더 고체 포트를 현재 1.2 코퍼스에서 추가 검증하는 것이다.

