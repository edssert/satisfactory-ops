---
confidence: verified
---

# 프론트엔드 및 랜딩 기술 평가 2026

## 1. 목적

랜딩과 애플리케이션 UI를 현재 GitHub 생태계, 공식 문서, 웹 표준에 맞춰 갱신하기 위한 기술 근거를
정리한다. 저장소 별 수와 활동은 2026-08-21 접근 시점의 값이다.

## 2. 평가 기준

| 기준 | 가중치 | 적용 질문 |
|---|---:|---|
| 제품 관련성 | 25 | 생산 계산·실축 설계·게임 자산을 더 명료하게 보여 주는가 |
| 유지보수 | 20 | 활성 저장소와 공식 문서가 있는가 |
| 접근성 | 15 | 키보드·포커스·축소 모션·네이티브 의미를 보존하는가 |
| 엔지니어링 | 15 | TypeScript·테스트·정리 수명주기·점진 향상 경로가 있는가 |
| Astro 이식성 | 10 | 정적 HTML과 Preact 아일랜드에 역할별 적용 가능한가 |
| 라이선스·출처 | 10 | 재사용 조건과 출처가 확인되는가 |
| 채택 신호 | 5 | 별, 포크, 사례가 성숙도를 뒷받침하는가 |

## 3. 현재 생태계 근거

| 후보 | 2026-08-21 상태 | 관찰 강점 | Satisfactory Ops 적용 |
|---|---|---|---|
| [Astro](https://github.com/withastro/astro) | 61,889 stars, 당일 push | 정적 HTML, 아일랜드, View Transitions | 전달 프레임워크 유지, 브라우저 기반 페이지 연속성 확대 |
| [GSAP](https://github.com/greensock/GSAP) | 27.9k stars, 전체 플러그인 무료, 표준 no-charge 라이선스 | ScrollTrigger, SplitText, Flip, 타임라인, 프레임워크 독립성 | 랜딩의 공장 조립·라우팅·검증 스크롤 서사 |
| [GSAP 공식 스킬](https://github.com/greensock/gsap-skills) | 12.8k stars, MIT | 공식 API·성능·접근성 구현 규칙 | core·timeline·ScrollTrigger·performance 절차를 코드 리뷰 기준으로 적용 |
| [Lenis](https://github.com/darkroomengineering/lenis) | 15.5k stars, MIT, 1.3.26 | 네이티브 스크롤 위 보간, GSAP/WebGL 동기화, 축소 모션 내장 | 랜딩 스크롤 감각과 실제 캔버스·중첩 스크롤 분리 |
| [Motion](https://github.com/motiondivision/motion) | 33.3k stars, MIT | 제스처, 스프링, 레이아웃 전환, JS/React/Vue | Preact 상태 UI의 재정렬·선택·패널 전환 파일럿 |
| [Three.js](https://github.com/mrdoob/three.js) | 114.6k stars, MIT | WebGL/WebGPU, 실제 메시·재질 렌더, 방대한 사례 | 실제 게임 메시가 있는 랜딩 공장 장면과 탑뷰 검수 |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 121,738 stars, MIT, 당일 push | 소유 가능한 오픈 코드, 상태와 접근성 문서화 | React/Tailwind 외형 복제가 아닌 컴포넌트 상태 커버리지 참고 |
| [Google DESIGN.md](https://github.com/google-labs-code/design.md) | 27.4k stars, Apache-2.0, alpha | 토큰·근거·lint·diff를 한 계약에서 관리 | CSS 토큰을 유지하며 문서와 변경 검증 체계를 강화 |

GitHub 별 수는 성숙도 탐색 신호로만 사용한다. 실제 채택은 이 앱의 Astro/Preact 구조, 게임 자산 진위,
사용자 과업과 자동 검증을 기준으로 결정한다.

## 4. 웹 표준 및 공식 동작

- [Astro View Transitions](https://docs.astro.build/en/guides/view-transitions/)는 브라우저 네이티브 교차 문서
  전환, 폴백과 축소 모션을 지원한다. 랜딩에서 선택한 객체를 계산기·설계 화면으로 이어 주는 데 적용한다.
- [W3C Scroll-driven Animations](https://www.w3.org/TR/scroll-animations-1/)는 스크롤·뷰 진행 타임라인을
  정의한다. 저비용 장식과 진행 표시는 CSS를 우선하고 복합 핀·서사는 GSAP으로 구성한다.
- Lenis 공식 문서는 `anchors: true`, `data-lenis-prevent`, 네이티브 스크롤 기반 동작과 축소 모션의
  1:1 입력 폴백을 제공한다. 편집기 캔버스와 중첩 패널에는 prevent 경계를 둔다.
- GSAP 공식 저장소는 ScrollTrigger와 모든 보너스 플러그인을 상업적 사용까지 무료로 제공한다고 명시한다.
  저장소 라이선스는 MIT가 아니라 GreenSock 표준 no-charge 라이선스이며 제품의 의존성 고지에 기록한다.

## 5. 랜딩 구현 결정

1. 일반 공장 사진을 중심으로 한 히어로를 실제 탑뷰·토대·컨베이어·처리량 데이터 장면으로 교체한다.
2. GSAP timeline과 ScrollTrigger로 하나의 공장이 목표→계산→배치→라우팅→검증 상태로 변하는 핀 장면을
   구현한다.
3. Lenis는 랜딩의 스크롤 입력 보간과 ScrollTrigger 동기화에 사용하며 앵커·축소 모션·중첩 스크롤을
   공식 옵션으로 검증한다.
4. Motion은 Preact 아일랜드의 상태 기반 마이크로 인터랙션에 적용해 GSAP 역할과 분리한다.
5. 실제 게임 메시의 브라우저용 파생 자산이 준비되면 Three.js 장면을 파일럿한다. 정적 탑뷰 포스터가
   같은 의미를 먼저 제공하도록 구성한다.
6. Astro View Transitions로 랜딩의 품목·설비 선택을 실제 기능 화면에 연결한다.

## 6. 재검증 조건

- Astro, GSAP, Lenis 또는 Motion의 메이저 버전 변경
- 브라우저 View Transitions·CSS Scroll-driven Animations 지원 범위 변경
- 실제 게임 메시의 브라우저 배포 형식 확정
- 랜딩 LCP, INP, 애니메이션 프레임 안정성 또는 축소 모션 회귀

## 7. 적용 문서

- [[DESIGN]]
- [[ENGINEERING]]
- [[ASSETS]]
- [[PRODUCT]]
