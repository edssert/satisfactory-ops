---
name: visual-verify
description: Gates any UI change behind an actual screenshot that has been opened and looked at — builds the site, runs a layout-squeeze checker at desktop/tablet/phone widths, shoots the page or a single element, and requires reading the PNG before the change may be called done. Use after editing any .astro, .tsx, or .css file in this repo, before saying a screen is fixed, when a layout looks off, or when reporting UI work as complete. Triggers on 화면 고침, 레이아웃, 스타일, CSS, 깨짐, 눌림, 잘림, 스크린샷, 사진 찍어, "됐다", "고쳤다", "확인했다".
license: MIT
---

# 봤다고 말하기 전에 진짜로 봐라

이 저장소에서 화면 관련 사고는 전부 같은 모양이었다. **코드가 틀린 게 아니라, 고친 뒤에
안 보고 완료라고 말했다.** 값은 HTML 에 있었고, 콘솔 오류도 없었고, 타입 검사도 통과했다.

- 랜딩의 집계 숫자가 화면에 **0** 으로 남았다. HTML 에는 맞는 값이 있었다
- 그리드 칸 하나에 `white-space: nowrap` 을 줬더니 **옆 칸이 한 글자 폭으로 눌렸다**.
  `min-width: 0` 을 몰라서가 아니라, 스크린샷을 보기 전에 "됐다"고 했기 때문이다

그래서 이 저장소의 완료 조건은 하나 더 있다: **PNG 를 Read 로 열어 눈으로 본다.**
찍기만 하고 안 보는 것은 안 찍은 것과 같다.

---

## 절차

```bash
# 0. 빌드 — dist 가 낡았으면 옛 화면을 찍게 된다
npm run build

# 1. 재 본다 — 눌림·넘침·잘림을 좌표로 짚어 준다 (1440 · 768 · 390 세 폭)
node .claude/skills/visual-verify/scripts/squeeze.mjs guide

# 2. 사진 — 화면 전체
node scripts/shoot.mjs guide shot.png --full
node scripts/shoot.mjs guide shot-mobile.png --w=390 --full

# 3. 사진 — 고친 조각만 (전체 사진에서 글자가 안 읽힐 때)
node .claude/skills/visual-verify/scripts/shot-el.mjs guide '.fc-svg' shot.png --nth=0

# 4. 반드시 — 찍은 PNG 를 Read 로 연다
```

경로는 **앞 슬래시 없이** 준다. Git Bash 가 `/guide/` 를 윈도 경로로 바꿔 버린다.
첫 화면은 빈 문자열(`""`)이다.

`scripts/shoot.mjs` 의 나머지 옵션: `--w=` `--h=` `--wait=ms` `--click=선택자`
`--wheel=횟수[,x,y]`(지도를 굴려 확대한 상태로 찍기). 콘솔 오류와 404 를 같이 뱉는다 —
그 줄도 읽어라.

---

## 사진에서 무엇을 보는가

찍은 그림을 열고 이 목록을 **적으면서** 확인한다. 머릿속으로만 훑으면 못 본 것을 봤다고
착각한다.

- [ ] **내가 고친 자리**가 그림 안에 실제로 있는가 (스크롤 밖이면 `--full` 이나 `shot-el`)
- [ ] **숫자가 0 이거나 비어 있지 않은가** — 랜딩 집계, 유량, 개수, 진행률
- [ ] 글자가 상자를 **넘치거나 잘리지** 않았는가
- [ ] 옆 칸이 **한두 글자 폭으로 눌리지** 않았는가
- [ ] 자리표시자·더미 문구(`—`, `TODO`, `0/0`)가 남아 있지 않은가
- [ ] 아이콘 자리가 **빈칸**이 아닌가 (파일이 없으면 조용히 빈다)
- [ ] 390px 사진에서 **가로 스크롤**이 생기지 않았는가
- [ ] 색만으로 구분한 것이 없는가 — 자원·상태에는 글자 라벨을 같이 (CLAUDE.md 규약)

그리고 완료 보고에 **본 것을 한 줄로 적는다**: "390px 사진에서 소머슬룹 칸이 136px 로
펴진 것을 확인했다." 이렇게 적을 수 없으면 안 본 것이다.

---

## squeeze.mjs 읽는 법

```
✗ 가로 스크롤: 문서 556px > 뷰포트 390px      ← 폰에서 화면이 옆으로 밀린다
✗ 눌린 칸  43px (옆 칸 136px)  b.n  「106/106」  ← 옆 칸이 자리를 다 먹었다. min-width: 0
✗ 넘침    536>350  div.layout  「00직접 만드는…」 ← 내용이 상자보다 넓다
✗ 잘림    92>55   span  「카테리움 광석」          ← 잘라 내는 상자 안에서 글자가 잘렸다
```

- **눌린 칸**은 ① 4글자 이상이고 ② 임계치(기본 48px)보다 좁고 ③ 형제가 3배 이상 넓을 때만
  잡는다. 「00」 같은 번호 칸은 원래 좁으므로 걸리지 않는다
- **넘침**은 `overflow-x: visible` 인 것만, 그리고 **넘치는 자손이 없는 것**만 적는다.
  조상까지 다 적으면 껍데기로 가득 차서 원인이 묻힌다
- 장식(글자 없는 배경 격자·흐르는 띠)은 일부러 넘치게 만드는 것이라 뺀다
- `--min=64` 로 임계치를, `--w=390` 으로 폭 하나만 볼 수 있다

**이 검사가 깨끗해도 사진을 대신하지 않는다.** 겹침·대비 부족·못생김은 못 잡는다.

---

## 함정

- **dist 가 낡았다.** 고치고 빌드를 안 하면 옛 화면을 찍는다. 늘 `npm run build` 부터
- **다른 에이전트가 빌드 중이면 404 가 난다.** `dist/index.html` 이 있는지 보고 다시 돌려라
- **아일랜드는 늦게 살아난다.** Preact 아일랜드를 찍을 때는 `--wait=1500` 을 준다
- **첫 화면 경로는 `""`** 다. `/` 를 주면 Git Bash 가 망가뜨린다
- **`--full` 없이 찍으면 접힌 아래는 안 나온다.** 고친 자리가 아래에 있으면 반드시 붙인다
- **모션은 사진에 안 찍힌다.** 스크롤 연동 애니메이션이 값을 만들고 있으면 사진은 초기
  상태만 보여 준다. 애초에 값을 JS/애니메이션에 의존시키지 마라 → `no-js-fallback` 스킬

---

## 반려 기준

- [ ] PNG 를 **Read 로 열었는가.** 안 열었으면 "고쳤다"고 말하지 않는다
- [ ] 고친 자리가 사진 안에 보이는가
- [ ] 390px 폭 사진을 찍었는가 (레이아웃을 건드렸다면 필수)
- [ ] `squeeze.mjs` 가 새로 잡은 것이 없는가. 있으면 고치거나, 왜 괜찮은지 적는다
- [ ] `shoot.mjs` 가 뱉은 **콘솔 오류·404 줄**을 읽었는가
- [ ] 완료 보고에 **무엇을 봤는지** 한 줄이 있는가

## 자동 검사와의 경계

`npm run verify` 는 데이터·타입·산출물 커버리지를 본다. 화면이 **보기에 맞는지**는 안 본다.
`scripts/check-coverage.mjs` 는 렌더된 HTML 을 읽어 "행이 조용히 빠졌는지"를 잡는다.
반복해서 깨지는 자리를 발견했다면 이 스킬로 눈으로 잡는 데서 멈추지 말고,
`check-coverage.mjs` 에 검사 한 줄을 추가해 다음부터는 빌드가 막게 하라.
