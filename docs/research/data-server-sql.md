# 서버 SQL — 만약 필요해진다면 (2026-08 조사)

> 조사 목적: **지금 서버 DB를 도입하자는 제안이 아니다.** GitHub Pages 정적 호스팅이라는 현재 아키텍처를 유지하면서, 장래에 "여러 기기 간 계산기 설정 동기화"가 필요해질 경우를 대비해 **문을 열어두는 설계**를 하기 위한 실사 조사다. 결론부터 말하면 **지금 시점에서는 전부 과잉설계(overkill)** 이고, 로컬 저장(localStorage/IndexedDB)으로 충분하다. 근거는 아래 규모 분석과 각 서비스의 실제 제약 조건에 있다.

---

## 0. 전제: 데이터 규모부터 다시 확인

| 데이터 종류 | 규모 | 서버가 필요한 이유가 되는가? |
|---|---|---|
| 게임 정적 데이터 (아이템/레시피/건물/마일스톤/MAM) | 아이템 160종, 레시피 300종, 건물 100종 → JSON 직렬화 시 1~5MB 추정 | **아니오.** 빌드 타임에 정적 JSON으로 번들링하면 끝. 이건 애초에 DB가 필요한 데이터가 아니라 "콘텐츠"다. |
| 좌표 데이터 (자원 노드/자원정/간헐천/슬러그/하드드라이브) | 총 약 1,970개 포인트 | **아니오.** 좌표 배열도 정적 JSON. 공간 쿼리(반경 검색 등)가 필요해져도 브라우저 메모리에서 선형 탐색으로 충분한 규모(수천 건). |
| 사용자 데이터 (마일스톤 체크, 대체 레시피 선택, 계산기 저장) | 체크 ~50건 + 대체 레시피 ~90건 + 계산기 설정 수십 건 = **사용자 1명당 총 200행 미만** | **여기가 유일하게 "서버"라는 단어가 나올 수 있는 지점**이다. 그것도 DB 성능 문제가 아니라 순수히 "기기 간 동기화"라는 기능 요구사항 때문이다. |

즉 이 조사에서 말하는 "서버 SQL"은 **대용량 데이터 처리용이 아니라, 사용자 1명당 수백 행짜리 설정 데이터를 여러 기기에서 동기화하기 위한 것**이다. 이 전제를 벗어나는 순간(예: 다른 유저의 공유 팩토리 갤러리, 소셜 기능) 이 문서의 결론은 재검토가 필요하다.

핵심 연산(재귀적 생산 체인 해결, 순환 레시피 처리)은 **DB가 아니라 클라이언트 메모리 상의 그래프 알고리즘**이다. 이건 SQL로 풀 문제가 아니라 JS/TS 로직의 몫이며, 이 조사 범위 밖이다.

---

## 1. 관리형 DB 무료 티어 비교 (2026-08 기준, 공식 문서 확인)

| 서비스 | 무료 스토리지 | 특이 한도 | 브라우저 직접 접근(CORS) | RLS(행 단위 권한) | 비활성 시 정책 |
|---|---|---|---|---|---|
| **Supabase** | 500MB DB | egress 5GB(+캐시 5GB), API 요청 무제한, MAU 50,000, **활성 프로젝트 2개 제한**(휴면 프로젝트는 무제한) | **가능** — 공식 JS 클라이언트가 REST/GraphQL Data API를 직접 호출 | **있음** — anon key를 브라우저에 노출해도 RLS 정책으로 행 단위 통제 | 1주 미사용 시 프로젝트 자동 일시정지(paused) |
| **Turso (libSQL)** | 5GB | DB 100개, 월 행 읽기 5억, 월 행 쓰기 1,000만, Embedded Sync 3GB | 가능성 있으나 **미확인** — 공식 문서에 브라우저 직접 접근 여부 명시 없음. auth token은 DB 단위이며 **행 단위 권한(RLS 상당 기능) 자체가 없음** | **없음** | 문서에 명시 없음(계정 단위 정책 확인 필요) |
| **Cloudflare D1** | 계정 전체 5GB, DB당 500MB | DB 10개, Worker 호출당 쿼리 50개 | **불가** — "Worker and HTTP API access"만 제공, 즉 **Cloudflare Worker(별도 백엔드 컴포넌트)가 반드시 필요** | 없음(애플리케이션 레벨에서 구현해야 함) | 별도 pause 정책 없음(Workers Free 사용량 한도에 종속) |
| **Neon (Postgres)** | 프로젝트당 0.5GB | 프로젝트당 월 100 CU-hours, 프로젝트 100개, 브랜치 10개 | **사실상 불가** — serverless driver 문서가 다루는 대상은 Vercel Edge/Cloudflare Workers/Node.js 같은 **서버·엣지 런타임**이며, DB 자격증명을 브라우저에 노출하는 걸 전제하지 않음. Postgres 자체는 RLS 지원하지만 Supabase처럼 "anon key + RLS"를 기본 제공하는 완제품이 아니라 직접 구축해야 함 | 있음(Postgres 네이티브, 직접 구현 필요) | 5분 유휴 후 autosuspend(과금 없음, 재개는 콜드스타트) |
| **PlanetScale** | **없음** | 최저 유료 플랜(Postgres, 단일 노드) $5/월, 고가용성 $15/월 | 해당 없음(유료 전용) | — | — |

**결론: 5개 중 "GitHub Pages 정적 사이트에서 별도 백엔드 컴포넌트 없이 브라우저가 직접 안전하게 쓸 수 있는" 서비스는 사실상 Supabase 하나뿐이다.** Turso는 가능해 보이지만 RLS가 없어 "auth token을 브라우저에 그대로 심으면 DB 전체에 그 권한이 뚫린다"는 문제가 있고, D1과 Neon은 구조적으로 프록시(Worker/Function)가 있어야 한다. PlanetScale은 2024년에 무료 티어를 없앤 뒤 재도입하지 않았다.

**출처**
- https://supabase.com/pricing
- https://turso.tech/pricing
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/
- https://neon.com/pricing
- https://neon.com/docs/serverless/serverless-driver
- https://planetscale.com/pricing
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://docs.turso.tech/sdk/ts/quickstart

---

## 2. 정적 사이트(GitHub Pages)에서의 인증/CORS 구조 상세

### 2-1. Supabase — 유일하게 "그대로 되는" 패턴

```
GitHub Pages (정적 HTML/JS)
   └─ @supabase/supabase-js (anon key 하드코딩, 노출되어도 무방)
        └─ HTTPS 요청 → Supabase REST API (PostgREST)
             └─ Postgres, RLS 정책이 요청자(auth.uid())별로 행 필터링
```

anon key는 "공개키"로 설계되어 있어 브라우저 번들에 그대로 넣어도 된다 — **단, RLS를 켜지 않으면 전체 테이블이 그대로 노출된다.** 이 프로젝트라면 사용자별 로그인(GitHub OAuth 등) + `auth.uid() = user_id` 정책으로 충분.

### 2-2. Turso — 될 수도 있으나 권한 모델이 이 앱에 안 맞음

libSQL 프로토콜은 HTTP 기반이라 CORS 자체는 서버가 허용하면 가능할 걸로 보이나(공식 문서에 명시 없음, 미확인), **auth token이 데이터베이스 전체 단위**다. 즉 "이 유저는 자기 마일스톤만 읽고 쓸 수 있다"를 DB가 강제해줄 방법이 없다 — 애플리케이션 서버(=결국 백엔드 컴포넌트)가 토큰을 들고 있으면서 요청을 중개해야 진짜 멀티유저 서비스가 된다. 1인 개발자의 "내 계산기 저장값 동기화" 정도의 단일 사용자 시나리오면 예외적으로 허용 가능하지만, 여러 사용자를 지원하는 순간 탈락.

### 2-3. Cloudflare D1 / Neon — 구조적으로 프록시 필수

D1은 Worker 바인딩을 통해서만 SQL을 실행할 수 있는 설계다(HTTP API도 있지만 이것도 Cloudflare 계정 인증이 필요해 브라우저에 그대로 못 심는다). Neon의 서버리스 드라이버 문서도 명백히 서버/엣지 런타임(Vercel Edge, Cloudflare Workers, Node.js)을 대상으로 한다 — Postgres 연결 문자열을 브라우저에 두는 건 계정 전체를 내주는 것과 같다. 즉 둘 다 **"GitHub Pages + 서버리스 함수 1개(Cloudflare Worker 등)"** 라는 최소 2-컴포넌트 아키텍처가 강제된다.

---

## 3. 로컬 SQLite ↔ 서버 libSQL "임베디드 레플리카" — 실제로 가능한가

Turso 공식 문서(`docs.turso.tech/features/embedded-replicas/introduction`) 기준:

- 읽기는 **로컬 파일**에서 마이크로초 단위로 처리, 쓰기는 원격 primary로 전송 후 로컬에 반영.
- `syncInterval`로 주기적 동기화 설정 가능, 오프라인 모드에서 로컬 쓰기도 지원.
- **단, 이 기능은 "파일시스템이 있는" 런타임(VM, VPS, 모바일 앱, Node.js 서버)을 전제로 한다.** 문서 자체가 "서버리스 환경처럼 파일시스템이 없는 컨텍스트에서는 임베디드 레플리카를 쓸 수 없다"고 명시한다.
- **브라우저(순수 정적 사이트, WASM) 환경에서의 지원 여부는 공식 문서에 명시적 언급이 없다** — 즉 "확인 안 됨"이 정직한 답이다. libSQL 코어가 Rust이고 SQLite 파일을 로컬 디스크에 mmap하는 방식이라, 브라우저 메인 스레드에서 쓰려면 최소 OPFS(Origin Private File System) 기반의 별도 빌드가 필요한데 이건 이 조사 시점에 공식 문서에서 확인되지 않았다.

**실전 결론**: "브라우저에서 로컬 SQLite 파일 하나로 오프라인도 되고 서버와도 자동 동기화된다"는 구성은 **Node.js 백엔드나 Electron/Tauri 같은 네이티브 셸에서는 실제로 동작이 검증된 패턴**이지만, **순수 GitHub Pages 브라우저 앱에는 해당 사항이 없다.** 이 앱은 브라우저 전용이므로, 로컬 저장소는 SQLite가 아니라 **IndexedDB(또는 localStorage)** 를 쓰는 게 자연스럽고, "서버와 동기화"는 임베디드 레플리카가 아니라 **REST API 호출 + 로컬 캐시 갱신**이라는 훨씬 단순한 패턴으로 접근해야 한다.

출처: https://docs.turso.tech/features/embedded-replicas/introduction

---

## 4. "지금은 로컬만, 나중에 동기화 추가" — 데이터 계층 추상화 설계

핵심 아이디어: **저장소를 인터페이스 뒤에 숨기고, 지금은 로컬 구현체 하나만 만든다.** 나중에 Supabase 구현체를 하나 더 만들어 꽂기만 하면 되도록.

```ts
// src/data/UserDataStore.ts
export interface MilestoneCheck {
  milestoneId: string;
  checkedAt: string; // ISO timestamp — 나중에 last-write-wins 충돌 해결용
}

export interface AltRecipeChoice {
  recipeSlotId: string; // 원본 레시피가 대체되는 슬롯
  chosenRecipeId: string;
  updatedAt: string;
}

export interface CalculatorPreset {
  id: string;
  name: string;
  payload: unknown; // 계산기 상태(목표 산출량, 선택 레시피 그래프 등) JSON
  updatedAt: string;
}

/** 저장소 계약. 로컬이든 원격이든 이 인터페이스만 지킨다. */
export interface UserDataStore {
  getMilestones(): Promise<MilestoneCheck[]>;
  setMilestone(check: MilestoneCheck): Promise<void>;

  getAltRecipes(): Promise<AltRecipeChoice[]>;
  setAltRecipe(choice: AltRecipeChoice): Promise<void>;

  getPresets(): Promise<CalculatorPreset[]>;
  savePreset(preset: CalculatorPreset): Promise<void>;
  deletePreset(id: string): Promise<void>;
}
```

```ts
// src/data/LocalUserDataStore.ts — 지금 당장 쓰는 구현체 (IndexedDB, 예: idb-keyval)
import { get, set } from 'idb-keyval';
import type { UserDataStore, MilestoneCheck, AltRecipeChoice, CalculatorPreset } from './UserDataStore';

export class LocalUserDataStore implements UserDataStore {
  async getMilestones() { return (await get<MilestoneCheck[]>('milestones')) ?? []; }
  async setMilestone(check: MilestoneCheck) {
    const list = await this.getMilestones();
    const next = [...list.filter(m => m.milestoneId !== check.milestoneId), check];
    await set('milestones', next);
  }
  async getAltRecipes() { return (await get<AltRecipeChoice[]>('altRecipes')) ?? []; }
  async setAltRecipe(choice: AltRecipeChoice) {
    const list = await this.getAltRecipes();
    const next = [...list.filter(c => c.recipeSlotId !== choice.recipeSlotId), choice];
    await set('altRecipes', next);
  }
  async getPresets() { return (await get<CalculatorPreset[]>('presets')) ?? []; }
  async savePreset(preset: CalculatorPreset) {
    const list = await this.getPresets();
    const next = [...list.filter(p => p.id !== preset.id), preset];
    await set('presets', next);
  }
  async deletePreset(id: string) {
    const list = await this.getPresets();
    await set('presets', list.filter(p => p.id !== id));
  }
}
```

나중에 필요해지면 `SupabaseUserDataStore implements UserDataStore`를 하나 추가하고, 앱 부트스트랩에서 로그인 여부에 따라 `LocalUserDataStore` 또는 `SyncingUserDataStore`(로컬을 캐시로 쓰고 백그라운드로 Supabase와 동기화하는 래퍼)를 주입하면 된다. 즉 **오늘 짜는 화면/상태관리 코드는 `UserDataStore` 인터페이스만 알면 되고, 저장소 교체가 나머지 코드에 전혀 영향을 주지 않는다.** 이게 "문을 열어두는 설계"의 실체다.

---

## 5. 실제로 동작하는 SQL — 서버가 필요해졌을 때를 위한 스키마

가정: Supabase(Postgres)를 쓰기로 했다고 가정하고, 사용자별 RLS까지 포함한 **실제로 실행 가능한 DDL**.

```sql
-- ============================================================
-- Supabase(Postgres) 스키마 — 사용자별 계산기 설정 동기화
-- ============================================================

create table public.milestone_checks (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  milestone_id text        not null,
  checked_at   timestamptz not null default now(),
  primary key (user_id, milestone_id)
);

create table public.alt_recipe_choices (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  recipe_slot_id text        not null,   -- 대체 가능한 원본 레시피의 슬롯 식별자
  chosen_recipe_id text      not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, recipe_slot_id)
);

create table public.calculator_presets (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  payload    jsonb       not null,   -- 목표 산출량 + 선택된 레시피 그래프 스냅샷
  updated_at timestamptz not null default now()
);

create index on public.calculator_presets (user_id);

-- ------------------------------------------------------------
-- RLS: "내 데이터만 내가" — anon key를 브라우저에 노출해도 안전한 이유
-- ------------------------------------------------------------
alter table public.milestone_checks    enable row level security;
alter table public.alt_recipe_choices  enable row level security;
alter table public.calculator_presets  enable row level security;

create policy "own milestones only"
  on public.milestone_checks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own alt recipes only"
  on public.alt_recipe_choices
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own presets only"
  on public.calculator_presets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

```ts
// 브라우저에서 실제로 이렇게 호출한다 (Supabase JS 클라이언트, upsert 패턴)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xxxxx.supabase.co',
  'eyJhbGciOi...'  // anon key — RLS가 있으므로 하드코딩해도 안전
);

// 마일스톤 체크 저장 (충돌 시 최신 것으로 덮어쓰기)
await supabase
  .from('milestone_checks')
  .upsert({ user_id: userId, milestone_id: 'tier3_coal_power', checked_at: new Date().toISOString() });

// 이 유저의 계산기 프리셋 전부 조회
const { data: presets } = await supabase
  .from('calculator_presets')
  .select('*')
  .order('updated_at', { ascending: false });
```

동일 데이터를 **로컬 SQLite/libSQL 쪽 스키마**로도 맞춰두면 나중에 "로컬 캐시 ↔ 서버" 동기화 로직을 짤 때 컬럼 이름이 1:1로 대응해 변환 코드가 단순해진다:

```sql
-- 로컬(SQLite/libSQL) 대응 스키마 — user_id는 단일 사용자 로컬 앱이라 생략 가능
create table milestone_checks (
  milestone_id text primary key,
  checked_at   text not null   -- ISO8601 문자열로 저장 (SQLite는 네이티브 timestamp 타입 없음)
);

create table alt_recipe_choices (
  recipe_slot_id   text primary key,
  chosen_recipe_id text not null,
  updated_at       text not null
);

create table calculator_presets (
  id         text primary key,  -- crypto.randomUUID()
  name       text not null,
  payload    text not null,     -- JSON.stringify 결과
  updated_at text not null
);
```

동기화 전략은 규모(사용자당 200행 미만)를 고려하면 벡터 클록 같은 정교한 CRDT가 아니라 **`updated_at` 기준 last-write-wins**로 충분하다. 위 스키마의 모든 테이블에 `updated_at`을 둔 이유가 그것이다.

---

## 6. 최종 권고

1. **지금은 도입하지 않는다.** 사용자당 데이터가 200행 미만이고 GitHub Pages가 기본 전제인 이상, IndexedDB(`idb-keyval` 등)로 완전히 해결된다. 서버 DB는 "여러 기기 동기화"라는 아직 발생하지 않은 요구사항에 대한 선제 투자다.
2. **문은 `UserDataStore` 인터페이스로 열어둔다.** 4장의 추상화를 지금 적용해두면, 나중에 동기화가 실제로 필요해졌을 때 화면 코드를 건드리지 않고 저장소 구현체만 추가하면 된다. 이게 이 조사의 실질적 산출물이다.
3. **필요해지면 Supabase가 유일한 실질적 선택지다.** Turso/D1/Neon은 전부 "브라우저가 직접, 별도 백엔드 컴포넌트 없이, 사용자별 권한 통제까지 되는" 조건 중 하나 이상을 만족 못 한다(§1, §2). PlanetScale은 무료 티어가 없다. Supabase 무료 티어(500MB, egress 5GB)는 이 데이터 규모 대비 수백 배 여유가 있다 — 유일한 함정은 "활성 프로젝트 2개 제한"과 "1주 미사용 시 자동 일시정지"이므로, 도입 시점에 이 두 가지만 운영 규칙으로 인지하면 된다.
4. **로컬 SQLite ↔ 서버 libSQL 임베디드 레플리카 구성은 이 앱(순수 브라우저 정적 사이트)에는 적용되지 않는다.** 이 패턴은 파일시스템이 있는 런타임 전용이며 공식 문서도 그렇게 명시한다(§3). Turso를 채택하더라도 이 앱에서는 "임베디드 레플리카"가 아니라 그냥 "원격 API 호출"로 접근해야 하고, 그 경우 RLS 부재 문제(§2-2)까지 겹쳐 Supabase 대비 이점이 없다.
