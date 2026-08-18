# 2026 웹 플랫폼 베이스라인 — 프로덕션 안전성 조사

조사일: 2026-08-19. 출처: caniuse.com(직접 조회 수치 기준), MDN Baseline, web.dev/blog. 판정 기준은 3단계:
- **지금 써도 됨** = Baseline Widely Available 이거나, 3대 엔진(Chromium/Firefox/Safari) 전부 안정 채널에서 지원 + 글로벌 사용률 90%+
- **폴백 필요** = Baseline Newly Available, 또는 한 엔진이라도 미지원/플래그 뒤/부분지원 상태 → `@supports`, progressive enhancement, 폴리필로 감싸야 함
- **아직 이르다** = 3대 엔진 중 하나가 아예 미지원(플랜 없음) 또는 실험적 플래그 상태

---

## 1. CSS 레이아웃 · 인터랙션 기능

| 기능 | Baseline 상태 | Chrome/Edge | Firefox | Safari | 글로벌 사용률 | 판정 |
|---|---|---|---|---|---|---|
| **View Transitions — 동일문서** (`view-transition-name`) | Newly available (2025-10) | 111+ | **144+** (2025년 하반기 합류) | 18.0+ | 90.21% ([caniuse](https://caniuse.com/mdn-css_properties_view-transition-name)) | **폴백 필요→거의 됨**. 3대 엔진 모두 안정 채널 지원이나 Firefox가 가장 최근 합류라 구형 Firefox 사용자용 무전환 폴백(`@media (prefers-reduced-motion)`처럼 기능 미지원 시 그냥 스냅 전환) 유지 권장 |
| **View Transitions — 문서간(MPA, `@view-transition`)** | 미도달 (Chromium 전용 사실상) | 126+ | **부분지원**(144~156, `@view-transition` at-rule 무시) | 18.2+ | 86.28% (84.54%+1.74%, [caniuse](https://caniuse.com/cross-document-view-transitions)) | **폴백 필요**. Firefox가 at-rule을 무시해 애니메이션 없이 스냅 전환되므로 progressive enhancement 전제로만 사용 |
| **Scroll-driven Animations (`animation-timeline`)** | **미도달** (Baseline 아님) | 115+ | **156+에서 처음 지원**, 그 이전(155까지)은 플래그 뒤(`layout.css.scroll-driven-animations.enabled`) | 26.0+ | 85.43% ([caniuse](https://caniuse.com/mdn-css_properties_animation-timeline)) | **폴백 필요**. Interop 2026 우선순위 항목이라 조만간 안정화되겠지만, 지금은 "기능 미지원 시 그냥 무시됨" 전제의 progressive enhancement로만 사용(레이아웃을 이 기능에 의존시키면 안 됨) |
| **CSS Anchor Positioning** | **미도달** (Baseline 아님) | 125+ | **147+**(145~146은 플래그 뒤 disabled) | **26.0+** (18.2는 미지원, 최근에야 합류) | 84.12% ([caniuse](https://caniuse.com/css-anchor-positioning)) | **폴백 필요**. `@position-try`/flip 세부 기능은 Safari 18.4+ 필요. 툴팁·팝오버 라이브러리를 전면 대체하기엔 아직 이름 |
| **Container Queries (크기, `@container`)** | **Widely Available** (2023-02~) | 105+ | 110+ | 16+ | 93%+ | **지금 써도 됨** |
| **Container Style Queries (`style()`)** | Newly available (2026-05, Firefox 151 최종 합류) | 148+(name-only는 148) | 151+ | 확인 필요 | — | **폴백 필요**. 커스텀 프로퍼티 기반 style query는 2026년 중반에야 3사 완주 |
| **`:has()`** | Baseline 2023(말), Widely Available 근접 | 105+ | 121+ | 15.4+ | — | **지금 써도 됨** |
| **CSS Subgrid** | **Widely Available** (2026-03-15) | 117+ | 71+(Firefox가 최초 구현) | 16+ | — | **지금 써도 됨** |
| **CSS Nesting** | **Widely Available** (2026-06) | 120+ | 117+ | 17.2+ | 94.1% | **지금 써도 됨** |
| **`@property`** | Baseline(대부분 엔진 지원) | 85+ | **128+** | 16.4+ | 94.21% ([caniuse](https://caniuse.com/mdn-css_at-rules_property)) | **지금 써도 됨**(IE 등 legacy 제외). 다만 Firefox 128 미만 사용자 비중이 있다면 `@supports (top: 1)` 스타일 감싸기 권장 |
| **`color-mix()`** | **Widely Available** (2023-05~) | O | O | O | 93% | **지금 써도 됨** |
| **`oklch()` / OKLCH 색공간** | 사실상 Baseline(주요 4엔진 지원) | 111+ | 113+ | 15.4+ | 93~95% | **지금 써도 됨**. 구형 브라우저용 HEX/RGB 폴백을 CSS cascade나 `@supports` 로 두는 것을 권장(완전 폴백 불필요, 안전망 차원) |
| **`text-wrap: balance`** | Newly available(2024~) | 114+ | 121+ | 17.5+ | 전 주요 엔진 지원(2024-05~) | **지금 써도 됨**(짧은 헤드라인 등 non-critical 텍스트 대상. progressive enhancement 성격이라 미지원 브라우저는 그냥 무시됨) |
| **`text-wrap: pretty`** | 미도달 | 117+ | **미지원**(2026년 초 기준) | 26+ | — | **폴백 필요**(사실상 이르다에 가까움). Firefox 완전 미지원이므로 장식적 개선으로만 사용 |
| **`popover` 속성** | **Baseline 2025** | O | O | O | ~88% | **지금 써도 됨** |
| **`<dialog>` / `showModal()`** | **Widely Available**(2022-03~) | O | O | O | ~96~97% | **지금 써도 됨** |
| **Navigation API** | Newly available(2026-01) | O(오래전부터) | **147+**(2026년 합류) | **26.2+**(2026년 합류) | — | **폴백 필요**. 3사 완주가 2026년 초에야 이뤄져 구형 버전엔 History API 폴백 필수 |
| **Speculation Rules API** | **미도달** | 105+(prerender), 110+(prefetch), 121+(eagerness/where) | **미지원**(prefetch 부분에 대해서만 긍정 포지션, 미구현) | **26.2 플래그 뒤, 기본 비활성** | prerender 관련 77.24%(구식 `rel=prerender` 기준, [caniuse](https://caniuse.com/mdn-html_elements_link_rel_prerender)) | **아직 이르다**(Chromium 전용). Interop 2026 항목이라 지켜볼 것. 쓰더라도 순수 progressive enhancement(무시되어도 무해)로만 |

### 비고
- **`prefers-reduced-motion`과의 결합 필수**: View Transitions, Scroll-driven Animations는 모두 모션 접근성 대응이 필요하다.
- Firefox가 유독 **View Transitions, Anchor Positioning, Scroll-driven Animations, Navigation API**에서 가장 늦게 합류하는 패턴이 뚜렷하다 → 2026년 "최신 CSS 인터랙션" 클러스터는 여전히 Firefox가 병목.

---

## 2. 이미지

| 항목 | 내용 | 판정 |
|---|---|---|
| **WebP** | 글로벌 사용률 96.18%. Chrome 32+, Edge 18+, Safari 16+, Firefox 65+ 전부 지원. IE만 미지원 ([caniuse](https://caniuse.com/webp)) | **지금 써도 됨**, 사실상 무조건 폴백 불필요 |
| **AVIF** | 글로벌 사용률 94.67%. Chrome 85+, Firefox 93+, Safari 16.4+(16.1~16.3은 부분지원), Edge 121+ ([caniuse](https://caniuse.com/avif)) | **거의 됨, 가벼운 폴백 권장**. 사진류에는 AVIF가 WebP보다 20~50% 더 작지만, Safari 구버전·구형 Samsung Internet 커버리지 때문에 `<picture>`로 AVIF→WebP→JPEG 순 폴백 체인 구성이 안전 |
| **실무 패턴** | `<picture><source type="image/avif"><source type="image/webp"><img src="fallback.jpg"></picture>` | 인코딩 속도·CPU 비용 이슈로 WebP가 여전히 "더 안전한 기본값", AVIF는 "더 작은 파일이 필요한 히어로 이미지"에 선택적으로 사용하는 것이 2026년 실무 감각 |
| **`fetchpriority`** | Baseline 2024(2024-10~). `img`/`link`/`script`에 적용 | **지금 써도 됨** |
| **`srcset`/`sizes`** | `<img>` 자체는 Baseline Widely Available(2015-07~), `srcset`/`sizes`도 장기간 안정 지원. `sizes="auto"`(lazy-load 결합)는 최신 기능 | **지금 써도 됨**(기본 `w`/`x` descriptor). `sizes="auto"`만 폴백 값 병기 필요 |

---

## 3. 폰트

| 항목 | 내용 | 판정 |
|---|---|---|
| **가변 폰트(`font-variation-settings`)** | Baseline **Widely Available**, 2018-09부터 전 주요 브라우저 지원 ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings)) | **지금 써도 됨** — 이미 7년 이상 안정 |
| **`font-display`** | 값 5종(auto/block/swap/fallback/optional). 프로덕션 기본값은 **`swap`** 권장(FOIT 회피, CLS는 `size-adjust`/`font-metrics` 매칭으로 별도 관리). 브랜드 핵심 폰트만 `block`, 장식용 폰트는 `optional` | **지금 써도 됨**, 전략 선택의 문제 |
| **한글 웹폰트 서브셋팅** | Pretendard([GitHub](https://github.com/orioncactus/pretendard))가 2026년 기준 대표적 실무 패턴 제시: ① 전체 글리프 포함 기본판 ② **다이나믹 서브셋**(페이지에 실제 쓰인 글자만 선택 다운로드) ③ **가변 다이나믹 서브셋**(가변 weight + 동적 로딩 결합, "기존 다이나믹 서브셋보다 현저히 적은 용량"). CDN은 jsDelivr/cdnjs/UNPKG 지원 | 정확한 KB/MB 수치는 GitHub Releases 페이지의 개별 자산에서 직접 확인해야 함(이번 조사에서 텍스트 추출로는 바이트 단위 수치를 확보하지 못함 — **추측하지 않고 명시**) |
| **로컬 호스팅 시 용량 이슈** | 한글은 완성형 음절만 11,172자라 라틴 폰트 대비 파일이 훨씬 크다는 것이 구조적 특성. 이 때문에 "전체 글리프를 그대로 self-host"하지 않고 동적 서브셋(런타임에 실제 사용 문자만 요청)하는 방식이 2026년 한글 웹폰트의 사실상 표준 실무로 자리잡음 | 정성적 결론(구체 수치는 위와 동일하게 확인 필요로 명시) |

---

## 4. 종합 판단 (요약이 아니라 결론)

2026년 8월 기준, **레이아웃/구조 계열**(Subgrid, CSS Nesting, Container Queries 크기, `:has()`, `@property`, `color-mix()`, `oklch()`, `<dialog>`, `popover`)은 안정적으로 Baseline을 통과했고 폴백 없이 써도 되는 영역이다. 반면 **모션·좌표 계열**(Scroll-driven Animations, Anchor Positioning, MPA View Transitions)은 여전히 Firefox가 최후 진입자이거나 최근에야 안정 채널에 실렸다는 공통 패턴을 보이며, 실무에서는 "기능이 없으면 조용히 무시되는" progressive enhancement 형태로만 배치해야 한다. Speculation Rules는 사실상 Chromium 전용 기능으로 남아 있어 프로덕션 의존은 시기상조다.

---

## 참고 링크

- [caniuse: cross-document-view-transitions](https://caniuse.com/cross-document-view-transitions)
- [caniuse: mdn-css_properties_view-transition-name](https://caniuse.com/mdn-css_properties_view-transition-name)
- [caniuse: mdn-css_properties_animation-timeline](https://caniuse.com/mdn-css_properties_animation-timeline)
- [caniuse: css-anchor-positioning](https://caniuse.com/css-anchor-positioning)
- [caniuse: mdn-css_at-rules_property](https://caniuse.com/mdn-css_at-rules_property)
- [caniuse: webp](https://caniuse.com/webp)
- [caniuse: avif](https://caniuse.com/avif)
- [caniuse: mdn-html_elements_link_rel_prerender](https://caniuse.com/mdn-html_elements_link_rel_prerender)
- [web.dev: 동일문서 View Transitions Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)
- [web.dev: Popover API Baseline](https://web.dev/blog/popover-api)
- [web.dev: Navigation API Baseline](https://web.dev/blog/baseline-navigation-api)
- [MDN: font-variation-settings](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings)
- [Pretendard GitHub](https://github.com/orioncactus/pretendard)
