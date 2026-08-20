---
title: ADR-0026 저장소 자체를 Obsidian 볼트로 사용
aliases:
  - ADR-0026
tags:
  - satisfactory-ops
  - architecture/decision
  - documentation
status: accepted
date: 2026-08-21
---

# ADR-0026: 저장소 자체를 Obsidian 볼트로 사용한다

- 상태: Accepted
- 날짜: 2026-08-21

## 맥락

제품 요구, 설계 결정, 리서치, 구현 상태가 여러 Markdown 문서에 나뉘어 있다. 별도 문서 폴더를 복제해
볼트로 만들면 코드와 문서의 Git 이력이 갈라지고 링크·상태·근거가 다시 어긋난다.

## 결정

`C:\Dev\satisfactory-ops` 저장소 루트 자체를 Obsidian 볼트로 사용한다.

- `.obsidian/`에는 팀이 공유해도 안전한 최소 설정만 커밋한다.
- `PROJECT-HUB.md`를 볼트의 진입점으로 둔다.
- 사용자 요구 추적의 단일 정본은 `docs/PRODUCT-SPEC.md`다.
- 기존 PRD·FRD·TRD·ARCHITECTURE·DATA-MODEL·DESIGN-BRIEF·ADR·research를 복제하지 않는다.
- 문서 링크는 Obsidian 위키링크를 허용하되 GitHub에서도 이해 가능한 제목과 경로를 유지한다.
- 개인 작업공간 배치, 최근 파일, 플러그인 비밀값은 공유 설정에 넣지 않는다.

## 결과

문서 그래프와 백링크를 사용할 수 있고, 코드 변경과 명세 변경이 같은 커밋에서 검토된다. Obsidian이 없어도
모든 문서는 일반 Markdown으로 읽을 수 있다. 볼트 설정 형식이 바뀌더라도 제품 빌드에는 영향을 주지 않는다.
