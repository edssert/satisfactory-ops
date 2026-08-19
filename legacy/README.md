# legacy — 이식 전 단일 HTML 버전

ADR-0009로 프론트엔드를 Astro 정적 출력 + Preact 아일랜드로 재구축하면서, 이 두 파일은 `src/pages/`로 이식되었다.

| 파일 | 이식 대상 | 상태 |
|---|---|---|
| `index.html` | `src/pages/milestones/index.astro` + `src/components/MilestoneChecklist.tsx` | 이식 완료 |
| `start.html` | `src/pages/start/index.astro` + `src/components/{StartPath,SiteMap}.tsx` | **부분 이식** |

## 아직 옮기지 않은 것

`start.html`에는 손으로 그린 SVG 도식 두 개가 남아 있다.

- `#t1auto` — 티어 1 자동화 구성도 (기계를 실제 대수만큼 그린 매니폴드 배치)
- `#auto` — 첫 자동화 배치 계통도 (채굴기 → 분배기 → 제련기 2 → 제작기 2)

이 도식들은 **수치가 SVG 안에 하드코딩되어 있다.** 그대로 옮기면 게임 패치 때 표와 도식이 어긋나는
사고(커밋 `2b5cdad`)가 재발한다. 따라서 F3(공장 성장 단계도)를 만들 때 **데이터에서 생성하는 방식으로
다시 그린다.** 그 전까지 참고용으로 여기 남긴다.

## 이 파일들은 배포되지 않는다

GitHub Pages 배포는 `.github/workflows/deploy.yml`이 만든 `dist/`만 올린다.
