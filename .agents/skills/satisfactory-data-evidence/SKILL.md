---
name: satisfactory-data-evidence
description: Validate Satisfactory game, save, wiki, research, and community data before it becomes product behavior. Use when interpreting a source field, importing external data, assigning confidence, or adding a regression gate for a game-data claim.
license: MIT
---

# Satisfactory 데이터 증거

원본 값과 그 값의 의미를 분리한다. 공식 스키마가 의미·단위를 명시한 단순 전사는 낮은 위험이며, 필드명·목록 존재·경험칙에서 의미를 추론하는 작업은 전체 검증을 요구한다.

## 절차

1. `<원본 필드/목록>의 <값>은 앱에서 <의미>를 뜻한다` 형태로 검증할 주장을 고정한다.
2. Docs.json의 새 필드는 먼저 소유 클래스를 센다.

   ```powershell
   node .agents/skills/satisfactory-data-evidence/scripts/field-scope.mjs <필드명> [--gen]
   ```

   종료 코드 `0`은 소유자 한 종류, `3`은 클래스별 의미를 좁혀야 함, `1`은 입력 부재다.
3. 추론이 있으면 같은 원본의 다른 필드가 아닌 독립 계층과 대조한다. 우선순위는 게임 표시·고정 총량·공식 표·이미 검증된 앱 데이터·사용자 확인이다.
4. 이론상 최대와 자릿수를 확인한다. 상한 초과는 데이터 오차가 아니라 해석 실패로 본다.
5. 통과한 의미를 값 하나가 아닌 불변식으로 잠근다. 게임 원본은 데이터 빌드 새니티, 앱 가공은 `data:check`, 세이브는 실제 세이브 골든/상한, 브라우저 동작은 브라우저 검사에 둔다.

## 승격 기준

- 공식 정의를 전사했거나 독립 대조를 통과하면 `verified`.
- 독립 커뮤니티 출처 둘 이상이 일치하면 `consensus`.
- 출처가 갈리면 `disputed`로 양쪽을 보존한다.
- 대조원이 없으면 `unsourced` 연구 상태로만 남기고 제품 사실로 승격하지 않는다.

근거는 기존 `satisfactory-ops-vault/docs/research/` 책임 문서에 통합한다. 표시 이름·게임 수치는 생성 데이터에서 가져오며 코드나 마크업에 복제하지 않는다.
