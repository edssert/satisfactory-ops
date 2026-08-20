---
name: no-js-fallback
description: Keeps every number and every sentence in the HTML itself, with JavaScript and scroll-driven CSS adding motion only — never producing the value. Provides a checker that reloads the built page with JavaScript disabled and fails when text is missing, when a data attribute disagrees with what is on screen, or when an animation-driven CSS counter supplies a number. Use when adding a counter, ticker, progress bar, reveal, parallax, or any scroll-linked effect, when writing animation-timeline or @property CSS, or when a value renders as 0 or blank. Triggers on 카운터, 숫자 애니메이션, 스크롤 연동, animation-timeline, 점진적 향상, "0 으로 보인다", "값이 안 나온다".
license: MIT
---

# 값은 HTML 에, 움직임만 JS 로

## 이 스킬이 존재하는 이유

랜딩의 집계 숫자를 CSS 카운터 + `animation-timeline: view()` 로 0 에서 목표까지 올렸다.
스크롤 구동 애니메이션의 진행도가 안 잡히면 카운터는 **초기값에서 멈춘다.**
화면에 `0` 이 그대로 남았다. HTML 에는 맞는 값(`626`)이 처음부터 있었는데도.

빌드도 통과했고 콘솔 오류도 없었다. 타입 검사도 통과했다. 아무것도 안 막아 줬다.

교훈은 하나다: **표현을 만드는 일을 애니메이션에 맡기지 마라.**
애니메이션은 "이미 보이는 것을 움직이는" 것만 한다.

---

## 규칙 (셋뿐이다)

### 1. 값은 서버가 렌더한 글자다

```astro
<!-- 나쁨 — 숫자를 CSS 가 만든다. 진행도가 안 잡히면 0 에서 언다 -->
<span class="ticker" style={`--n:${count}`}></span>
<style>.ticker::after { content: counter(n) }</style>

<!-- 좋음 — 값은 글자다. 스크립트가 없어도 626 이 보인다 -->
<span class="tick" data-tick={count}>{count}</span>
```

`data-tick` 은 이 저장소의 관례다. JS 가 붙으면 그 자리에서 0 부터 올리다가 원래 값으로
돌아온다. 안 붙으면 처음부터 원래 값이다. **어느 쪽이든 화면의 수는 맞다.**

### 2. 움직임은 세 겹으로 감싼다

```css
/* 기본값은 정적이고 완전하다 — 이 상태가 정상 상태다 */
.rail::after { transform: scaleY(1); }

@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .rail::after {
      animation: grow linear both;
      animation-timeline: view();
    }
  }
}
```

① `@supports` ② `prefers-reduced-motion` ③ **미지원 상태가 정상 상태**.
셋 중 하나라도 빠지면 어딘가에서 화면이 빈다. (`modern-web-baseline` 스킬 참조 —
스크롤 구동 애니메이션은 2026-08 기준 전역 85%, **점진적 향상으로만** 쓴다.)

### 3. 애니메이션이 건드려도 되는 것

| 써도 됨 | 쓰면 안 됨 |
|---|---|
| `transform` · `opacity` · `filter` · 색 | `content` · `counter-increment` |
| 이미 자리를 잡은 요소의 크기 변형 | 레이아웃(`display`·`width`가 0 에서 시작) |
| 나타남/사라짐의 **속도** | 나타남/사라짐의 **여부** |

기준: **애니메이션이 0% 에서 영원히 멈춰도 화면이 온전한가?** 아니면 고쳐라.

---

## 검사

```bash
npm run build
node .claude/skills/no-js-fallback/scripts/nojs.mjs           # 첫 화면
node .claude/skills/no-js-fallback/scripts/nojs.mjs guide
```

JS 를 **끈** 브라우저로 같은 화면을 열어 네 가지를 본다:

1. **애니메이션이 올리는 CSS 카운터** — `::before/::after` 의 `content` 가 `counter()` 인데
   그 자리에 애니메이션이 걸려 있다. (`li::before{content:counter(a)}` 같은 평범한 번호는
   안 잡는다. 애니메이션이 없기 때문이다)
2. **값과 다른 글자** — `data-tick="626"` 인데 화면 글자가 `0` 이거나 다르다
3. **JS 없이 사라지는 내용** — JS 끈 화면의 글자량이 켠 화면의 90% 미만이다
4. **배포된 CSS 한 파일 안에 카운터와 `animation-timeline` 이 같이 있다**

종료 코드 0 = 통과, 1 = 잡힘, 2 = dist 없음.
`--attr=` 로 속성 이름을, `--keep=0.8` 로 글자량 하한을 바꾼다.

빌드에도 이미 잠금이 하나 있다 — `scripts/check-coverage.mjs` 가 `data-tick` 의 값과
화면 글자가 같은지 대조하고, 다르거나 `0` 이면 `npm run verify` 가 죽는다.
**새로 만드는 숫자에도 `data-tick` 을 붙여라.** 안 붙이면 그 검사가 그 자리를 못 본다.

---

## 아일랜드는 어디까지 하나

ADR-0009: 문서 화면은 아일랜드를 쓰지 않는다. 아일랜드는 **상태를 소유하는 최소 단위**만.

그래서 아일랜드가 붙기 전 화면이 곧 "JS 없는 화면"이다. 아일랜드가 쓸 데이터는 페이지가
서브셋으로 만들어 props 로 넘기므로, **정적 HTML 에 이미 값이 들어 있어야 정상**이다.
`nojs.mjs` 의 3번(글자량) 검사가 그 경계를 지킨다 — 아일랜드가 내용을 만들고 있으면
비율이 떨어진다.

지도·제작기처럼 본질적으로 인터랙티브한 화면은 이 검사에서 글자량이 낮게 나올 수 있다.
그 경우 **그 화면이 JS 없이 무엇을 보여 줄지**를 정하고 `--keep=` 을 낮춰 잠가라.
"인터랙티브하니까 검사 안 함"으로 넘기지 마라 — 그러면 다음에 랜딩이 또 0 을 낸다.

---

## 반려 기준

- [ ] 화면에 나오는 수가 **HTML 안의 글자**인가. CSS 나 JS 가 만들고 있지 않은가
- [ ] 그 수에 `data-tick`(또는 같은 관례)이 붙어 빌드 검사가 볼 수 있는가
- [ ] `animation-timeline` 을 썼다면 `@supports` + `prefers-reduced-motion` 이 있는가
- [ ] 애니메이션이 0% 에서 멈춰도 화면이 온전한가
- [ ] `nojs.mjs` 가 이 화면에서 통과하는가
- [ ] `npm run verify` 를 돌렸는가
- [ ] 사진을 찍어 눈으로 봤는가 (`visual-verify` 스킬)
