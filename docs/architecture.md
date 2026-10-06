# Architecture

이 문서는 Tauri v2 기반 데스크톱·모바일 애플리케이션의 아키텍처 기준을 정리한다. 기능 단위로 구조를 분리하고, UI·데이터 접근·IPC·비즈니스 로직의 책임을 나누며, Frontend 와 Backend 의 계약을 공용 타입으로 관리하여 새 도메인 추가 시 기존 코드를 수정하지 않고 확장할 수 있는 구조를 목표로 한다.

세부 코딩 규칙은 [coding-rules.md](./coding-rules.md), Tauri 고유 메커니즘은 [tauri-guide.md](./tauri-guide.md) 를 함께 참조한다. 본 문서는 **뼈대 기준**을 정의하며, 도메인 기능 추가 시 필요한 옵션 가이드는 `docs/optional/` 하위 문서를 참조한다.

---

## 1. Overview

### Frontend (React)

뼈대 기본 스택:

- React + TypeScript
- Node.js: LTS 24 (24.x)
- Package Manager: pnpm
- Build Tool: Vite
- Optimization: React Compiler (자동 메모이제이션, **기본 활성** — 동작·비활성은 `docs/optional/react-compiler.md`)
- Styling: Tailwind CSS v4 (유틸리티 퍼스트, CSS-first 설정)
- Icons: Heroicons (`@heroicons/react`)
- Testing: Vitest + React Testing Library

도입 시 추가 (`docs/optional/server-state.md`): Server State 는 TanStack Query, Client UI State 는 컴포넌트 로컬 state 우선·화면 간 공유 상태는 Zustand, Validation 은 Zod (사용자 입력 및 command payload).

> **뼈대의 의도적 비목표** (필요 시 다운스트림이 도입): 스타터는 단일 화면·최소 구성을 유지하려고 다음을 **일부러 포함하지 않는다**. 각 항목은 도입 지침만 남긴다.
>
> - **라우팅**: 화면이 2개 이상이면 `docs/optional/routing.md` 참조 (라우터 선정 + `app/routes/`·`pages/` 구성).
> - **전역 ErrorBoundary / 로딩·에러·빈 상태 UI primitive**: `shared/ui/` 에 도입. 뼈대는 `PingPanel` 의 인라인 처리로만 예시한다.
> - **i18n·테마(라이트/다크) 전환**: 미포함. 테마 전환 도입 시 `globals.css` 의 `@theme` 직접 토큰(§11)을 재구성해야 한다.
> - **Frontend 로거**: 위치는 `shared/lib/logger` 로 예약. 로깅 접두사 규약은 `tauri-guide.md §13`(Logging, `[ui:domain]`).

### Desktop / Mobile (Tauri / Rust)

뼈대 기본 스택:

- Tauri v2 (desktop: macOS, Windows, Linux / mobile: iOS, Android)
- Language: Rust
- 설정 영속화 (도입 시): `tauri-plugin-store`
- 로깅: `tauri-plugin-log` + Rust `log` crate

도입 시 추가: HTTP 통신은 reqwest 공유 HttpClient (`docs/optional/backend-http.md`), 구조적 로컬 데이터는 SQLite `sqlx` — Rust service 전용 접근 (`docs/optional/sqlite.md`), 인증·secure store (`docs/optional/auth.md`), emit/listen·Channel<T> (`docs/optional/events-channels.md`), 모바일 빌드 (`docs/optional/mobile.md`).

---

## 2. Core Principles

1. **Feature 기반 구조** — 파일은 도메인 슬라이스(Bounded Context) 기준으로 구성한다. Frontend(kebab-case) 와 Backend(snake_case) 는 같은 도메인 이름으로 대응한다.
2. **관심사 분리** — Component=UI+이벤트 / hook=화면 조합 / api=IPC 경계 / parser=응답 파싱·정규화 / Rust command=얇은 진입점 / `service.rs`=비즈니스 로직.
3. **Contracts first** — Rust `model` ↔ TS 타입 1:1. 새 command 는 request/response 타입을 먼저 정의한다.
4. **Small diff** — 큰 구조 변경보다 작은 diff 를 우선하고, 기존 패턴이 있으면 먼저 그 패턴에 맞춘다. 구조 정리와 기능 변경을 한 번에 섞지 않는다.
5. **Cross-feature 경계** — features 간 직접 import 는 금지한다. 여러 feature 를 합성하는 흐름은 Frontend 는 `widgets/`, Backend 는 `workflows/` 로 끌어올린다.
6. **Public API** — 각 slice 는 `index.ts` 로만 외부에 노출한다. deep import 금지.
7. **Layer import (strictly below)** — 상위 layer 만 하위 layer 를 import 한다. 같은 layer 의 다른 slice import 는 금지하며, `entities` 간에만 `index.ts` 경유를 허용한다 (§7.1).
8. **신규 구조는 기존 패턴 답습** — 새 모델·도메인·기능을 만들 때 기존 동종 구조를 먼저 참조해 동일 패턴을 따른다. 이탈이 필요하면 사유를 남긴다.

> `features/` 의 의미: 본 구조의 `features/` 는 FSD 공식의 "재사용 가능한 사용자 액션 단위" 가 아니라 **도메인 슬라이스(Bounded Context)** 를 의미한다.

> Backend `workflows/` ↔ Frontend `widgets/` 의 비대칭: Backend 는 layer 가 `entities / features / shared` 3개라 cross-feature 조율을 담을 layer 가 없어 `workflows/` 를 신설한다.

---

## 3. Process Model

```text
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Chromium / WebView / React)                          │
│  Component → Hook → API → Parser → invoke wrapper               │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Tauri IPC (invoke)
┌─────────────────────────────┴───────────────────────────────────┐
│  Backend (Rust / Tauri)                                         │
│  Rust Command → Rust Service                                    │
│  ├── (옵션) HTTP — docs/optional/backend-http.md                │
│  ├── (옵션) 로컬 데이터 — tauri-plugin-store / SQLite           │
│  └── 로깅 (tauri-plugin-log)                                    │
└─────────────────────────────────────────────────────────────────┘
```

Frontend 는 UI 렌더링·사용자 입력 처리, Rust Command 는 IPC 진입점(입력 수신, `IpcResult<T>` 로 응답 포장), Rust Service 는 비즈니스 로직·(옵션) HTTP/로컬 데이터 접근·상태 갱신을 담당한다.

emit/listen, Channel<T> 등 양방향·스트리밍 IPC 는 `docs/optional/events-channels.md` 에서 다룬다.

---

## 4. Domain Structure

### 4.1 도메인 유형 (예시)

| 유형            | 예시 도메인 | 특징                                          |
| --------------- | ----------- | --------------------------------------------- |
| **BackEnd API** | auth        | reqwest 를 통해 백엔드 서버와 통신            |
| **Local**       | settings    | 백엔드 없이 `tauri-plugin-store` 또는 로컬 DB |

### 4.2 도메인 추가 규칙

- 도메인 단위로 새 모듈이 추가되면 기존 feature 에 끼워넣지 않고 새 feature 디렉토리를 생성한다. Backend `features/<feature>/`, Frontend `src/features/<feature>/` 양쪽 모두 동일 구조를 따른다.
- 1개 도메인 = 1개 `commands.rs` + 비즈니스 로직. 단순 도메인은 `service.rs` 단일 파일로, 외부 시스템 어댑터 등 매트릭스가 큰 복잡 도메인은 layered sub-module 로 분리를 허용한다.

---

## 5. Data Flow

### 5.1 기본 Command 흐름

```text
React Component
  → feature hook
  → feature api/<feature>Api.ts
  → feature api/<feature>Parsers.ts (응답 해석, 에러 정규화)
  → shared invoke wrapper (src/shared/lib/tauri/invoke.ts)
  → Rust command (IpcResult<T> 로 포장)
  → Rust service
  → (옵션) HTTP / SQLite / store / 시스템 API
```

- Frontend parser 가 `IpcResult<T>` 를 해석하고 에러를 `AppError` 로 정규화한다.
- Rust command 는 `Ok(response::ok(data))` 또는 `Ok(IpcResult::err(...))` 로 반환한다.

서버 상태 캐싱 / mutation invalidation 은 TanStack Query 도입 시점에 추가된다 (`docs/optional/server-state.md`).

---

## 6. Shared Contracts

### Rust

```rust
// src-tauri/src/shared/types/ipc.rs
pub struct IpcResult<T: Serialize = serde_json::Value> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<AppError>,
}
pub struct AppError { pub code: String, pub message: String, pub retryable: bool }
```

- 응답 helper: `response::ok(data)` (`src-tauri/src/shared/lib/response.rs`)
- 공유 상태: `AppState` (`src-tauri/src/shared/store/state.rs`)
- error code 상수: feature `config.rs` 또는 `src-tauri/src/shared/config.rs`

### TypeScript

```ts
// src/shared/types/ipc.ts
type IpcResponse<T = unknown> = { success: true; data: T } | { success: false; error?: AppError };
type AppError = { code: string; message: string; retryable: boolean };
```

- 공유 invoke wrapper: `src/shared/lib/tauri/invoke.ts`

> **주의**: Rust 는 `IpcResult<T>`, TypeScript 는 `IpcResponse<T>` 이다. 동일한 직렬화 구조이지만 타입명이 다르고, TypeScript 는 `success` 로 판별되는 유니온이다.

---

## 7. Folder Structure

본 절은 **FSD 6 layer** (`app` / `pages` / `widgets` / `features` / `entities` / `shared`) 를 표준으로 정의한다.

### 7.1 layer 정의

| layer       | 정의                                              | 진입 규칙                                                         |
| :---------- | :------------------------------------------------ | :---------------------------------------------------------------- |
| `app/`      | 부트스트랩 · 전역 provider · 라우터 합성          | 모든 하위 layer import 가능                                       |
| `pages/`    | 라우트 1:1 컨테이너 (가드·로딩·에러 boundary)     | widgets/features/entities/shared 가능. 다른 page import 금지      |
| `widgets/`  | 2개 이상 feature 를 합성하는 컴포넌트             | features/entities/shared 가능. 다른 widget 직접 import 금지       |
| `features/` | 한 도메인의 비즈니스 액션 UI·hook·api             | entities/shared 가능. 다른 features import 금지 (widgets 로 합성) |
| `entities/` | 도메인 명사의 type/schema + UI primitive          | shared 만. 다른 entity 는 `index.ts` 경유                         |
| `shared/`   | 도메인 의미 없는 유틸·UI primitive·invoke wrapper | shared 내부만. 상위 layer import 금지                             |

### 7.2 import rule — strictly below

상위 layer 는 하위 layer 만 import 한다. 같은 layer 의 다른 slice import 는 금지한다 (`entities` 간에만 `index.ts` 경유 허용).

`pages`·`widgets`·`features` 는 같은 layer 의 다른 slice 를 import 하지 않으며 (타입도 예외 없음 — 공유 타입은 `entities/` 로, 합성은 `widgets/` 로), `shared/**` 은 어떤 상위 layer 도 import 하지 않는다 (§7.1 표 참조).

본 규칙 — **layer 역방향, 같은 layer 의 slice 간 cross-import, public API 우회 deep-import** 전부 — 은 ESLint `eslint-plugin-boundaries` 의 `boundaries/dependencies` 규칙으로 **빌드 시점에 완전 강제**한다. slice 는 자기 자신만 deep import 할 수 있고, 접근이 허용된 다른 slice 는 `index.ts`(public API)로만 접근한다(shared/app 은 단일 barrel 이 없어 내부 경로 허용). import 해석을 위해 `eslint-import-resolver-typescript` 가 필요하다(없으면 경계가 무력화). 상세는 `eslint.config.js` 참조.

### 7.3 Segment — 5 segment

각 slice 내부는 다음 5 segment 만 사용한다.

| segment   | 의미                    | 구성 자산                                              |
| :-------- | :---------------------- | :----------------------------------------------------- |
| `ui/`     | 컴포넌트 (presentation) | 도메인 UI 컴포넌트                                     |
| `model/`  | Application logic       | hook (`use*.ts`), (옵션) store / query / mutation 훅   |
| `api/`    | IPC 경계 + 응답 파싱    | invoke client (`<d>Api.ts`) + parser (`<d>Parsers.ts`) |
| `lib/`    | 도메인 내부 순수 함수   | formatter, validator helper                            |
| `config/` | 도메인 상수             | 에러 코드, 도메인 enum                                 |

> **여러 feature 가 공유하는 도메인 명사 타입·엔티티 schema** 는 feature 가 아니라 `entities/<도메인>/model/` 에 둔다 (SSOT). **단일 feature 전용 응답 타입·폼 입력 검증 schema**(예: `LoginFormValues`)는 그 feature 의 `api/`·`model/` 에 둬도 무방하며, 공유가 필요해지는 시점에 `entities/` 로 승격한다. (폼 schema 예시: `docs/optional/server-state.md §3`)

### 7.4 Frontend 트리 (뼈대)

```text
src/
├── app/                  # 부트스트랩, 라우팅, providers
│   ├── App.tsx
│   ├── routes/           # 라우터 도입 시
│   └── providers/        # providers (뼈대 포함)
├── pages/                # 라우트 1:1 컨테이너 (도입 시)
├── widgets/              # cross-feature 합성 (도입 시)
├── features/             # 도메인 슬라이스 (뼈대: 샘플 1개 — app)
│   └── app/              # IPC 확인용 샘플 — {ui/, model/, api/, index.ts}
├── entities/             # 도메인 명사 SSOT (뼈대 단계: 비어 있음)
├── shared/
│   ├── lib/              # tauri/invoke (logger 등은 도입 시)
│   ├── types/            # ipc.ts (IpcResponse, AppError)
│   ├── ui/               # primitive UI (도입 시)
│   └── styles/           # ui.ts (Tailwind 토큰 헬퍼, 도입 시)
├── test/                 # mocks/, setup.ts (뼈대 포함)
├── main.tsx
└── globals.css           # Tailwind v4 @theme 정의
```

### 7.5 Backend 트리 (뼈대)

```text
src-tauri/
├── src/
│   ├── entities/                      # 도메인 명사 SSOT (뼈대 단계: 비어 있음)
│   ├── features/                      # 뼈대: 샘플 1개 (app)
│   │   └── app/                       # {mod, commands, service, model, config}.rs
│   ├── workflows/                     # cross-feature lifecycle (도입 시)
│   ├── shared/
│   │   ├── config.rs                  # 공유 상수 (ERROR_*, EVENT_*)
│   │   ├── lib/response.rs            # response::ok helper
│   │   ├── runtime/lifecycle.rs       # BootStage, run_boot, TeardownRegistry
│   │   ├── store/state.rs             # AppState
│   │   └── types/ipc.rs               # IpcResult<T>, AppError
│   ├── lib.rs                         # command 등록 (generate_handler!)
│   └── main.rs                        # 데스크톱 entry
├── capabilities/default.json          # Tauri v2 권한 선언 (최소 권한)
├── Cargo.toml                         # [lib] crate-type = ["staticlib", "cdylib", "rlib"]
├── build.rs
└── tauri.conf.json
```

모바일 빌드 시 `gen/android/`, `gen/apple/` 이 추가 생성된다 (gitignore).

### 7.6 workflows — cross-feature 오케스트레이션 (옵션)

여러 feature 를 **동시에** 호출하는 업무 흐름(lifecycle)은 어떤 단일 feature 에도 속하지 않으므로 `workflows/` 에서 조율한다. `commands.rs` 는 workflow 진입 함수를 호출하고, workflow 가 각 feature 의 public API 를 호출한다 (단방향 의존).

### 7.7 Feature Template

신규 feature 추가 시 최소 구조. 필수 파일만 생성하고 조건부 파일은 필요 시 추가한다.

#### Backend — `src-tauri/src/features/<feature>/`

| 파일          | 필수/조건부          | 책임                                               |
| :------------ | :------------------- | :------------------------------------------------- |
| `mod.rs`      | **필수**             | `pub mod` 선언만                                   |
| `commands.rs` | **필수**             | `#[tauri::command]` 진입점 + `IpcResult<T>` 포장만 |
| `service.rs`  | 조건부 (도메인 로직) | 비즈니스 로직                                      |
| `api.rs`      | 조건부 (HTTP 호출)   | HTTP 호출 어댑터 (`docs/optional/backend-http.md`) |
| `config.rs`   | 조건부 (상수)        | 정적 상수 (`ERROR_*`, `*_PATH`)                    |
| `model.rs`    | 조건부 (내부 타입)   | feature internal type / DTO                        |

#### Frontend — `src/features/<feature>/`

| segment    | 필수/조건부 | 책임                                      |
| :--------- | :---------- | :---------------------------------------- |
| `ui/`      | **필수**    | 도메인 UI 컴포넌트                        |
| `model/`   | **필수**    | hooks (+ 도입 시 queries/mutations/store) |
| `api/`     | 조건부      | `[feature]Api.ts` + `[feature]Parsers.ts` |
| `lib/`     | 선택        | helper / formatter / validator            |
| `index.ts` | **필수**    | public API barrel — deep import 금지      |

---

## 8. Local Data

| 데이터 유형        | 저장소                                                | 참조                      |
| :----------------- | :---------------------------------------------------- | :------------------------ |
| 비민감 설정        | `tauri-plugin-store`                                  | `tauri-guide.md §9`       |
| 구조적 로컬 데이터 | SQLite                                                | `docs/optional/sqlite.md` |
| 민감 데이터 (토큰) | Rust secure store / `AppState` 메모리 — store/DB 금지 | `docs/optional/auth.md`   |

뼈대 단계에서는 어느 저장소도 도입하지 않는다.

---

## 9. Security Model

| 항목             | 설정                                    | 이유                           |
| ---------------- | --------------------------------------- | ------------------------------ |
| Tauri IPC        | capabilities 기반 권한 선언 (최소 권한) | 최소 권한 원칙                 |
| HTTP 토큰 관리   | Rust 측 내부 보관 (도입 시)             | Renderer 에 토큰 미노출        |
| 인증 세션 영속화 | Rust secure store (도입 시)             | `localStorage` 에 토큰 미저장  |
| 설정 영속화      | `tauri-plugin-store` (도입 시)          | OS 표준 앱 데이터 디렉터리     |
| 민감 데이터      | Rust service layer 에서만 접근          | Frontend 는 결과 데이터만 수신 |

인증·토큰·secure store 구체 정책은 `docs/optional/auth.md` 참조.

---

## 10. State Management

뼈대 단계의 상태는 UI 로컬 상태(로딩, 에러, 입력)뿐이며 컴포넌트 `useState` 로 관리한다.

기능 추가 시 도입 (`docs/optional/server-state.md`):

| 상태 유형                        | 관리 방법                                                    |
| -------------------------------- | ------------------------------------------------------------ |
| 서버 데이터 (목록, 응답)         | TanStack Query                                               |
| 화면 간 공유 상태 (현재 화면 등) | Zustand store (non-persist)                                  |
| 인증 세션 상태                   | Zustand store + Rust session check (`docs/optional/auth.md`) |
| HTTP 인증 토큰                   | Rust `AppState` (Mutex 보호)                                 |
| 재시작 후 세션 복원 재료         | Rust secure store                                            |
| 앱 설정 (파일 영속화)            | `tauri-plugin-store`                                         |

`localStorage` / `sessionStorage` 에 상태를 직접 저장하지 않으며, access token / refresh token / 로그인 응답 원문을 Renderer persist 에 저장하지 않는다.

---

## 11. UI Style

Tailwind v4 (CSS-first, `globals.css` 의 `@theme` 직접 토큰)·아이콘·Fullscreen Shell·스타일 계층 규칙은 `coding-rules.md §12` 를 따른다.

---

## 12. Naming

명명 규칙(Components·Types·Hooks·API wrapper·Service·상수·feature 폴더/모듈·Rust command, `Service` 단어 제한)은 `coding-rules.md §2` 를 따른다.

---

## 13. Public API Strategy

- feature 외부에서 feature 내부 깊은 경로를 직접 참조하지 않는다. `index.ts` 가 public API 경계이며, app · pages · widgets · 다른 features 는 대상 feature 의 `index.ts` 만 사용한다.
- 같은 layer 내 다른 slice import 는 금지한다 (예외: `entities` 간 `index.ts` 경유, §7.1). 본 정책은 ESLint `boundaries/dependencies` 로 강제된다 (§7.2).

---

## 14. Error Strategy

- 구조화된 `AppError` (`{ code, message, retryable }`) 와 `IpcResult<T>` 로 성공/실패를 일관되게 감싼다. 모든 결과는 `Ok(IpcResult<T>)` 로 반환한다 (Ok-Only).
- 화면은 loading / error / empty / success 상태를 모두 처리하고, API/parser layer 에서 raw error 를 그대로 흘리지 않는다.
- error code 는 feature `config.rs` 또는 `shared/config.rs` 상수로 관리한다.
- code 형식·카테고리 분류·`retryable`·Ok-Only 상세는 `tauri-guide.md §8`, Frontend 에러 규칙은 `coding-rules.md §9`.

---

## 15. Verification & Testing

검증은 Lint(ESLint) · Format(Prettier) · Type Check(`tsc --noEmit`) · Runtime Test(Vitest / RTL) 4단계로 나누며, 서로 대체가 아니라 보완 관계로 본다 (`coding-rules.md §14`).

IPC mock 패턴 (`vi.mock("@tauri-apps/api/core")`) 상세는 `docs/optional/server-state.md §4`. 실행 명령과 순서는 [`AGENTS.md` §검증 명령](../AGENTS.md#검증-명령) 을 따른다.

---

## 16. Anti-patterns

구조·계층·보안 관련 금지 패턴. Ok-Only·blocking·capability 는 `tauri-guide.md §15`, 명명·UI·문서 동기화는 `coding-rules.md §17` 을 따른다.

- Component 에서 직접 `invoke()` 또는 `fetch()` 호출.
- Frontend 에서 백엔드 API 직접 HTTP 호출 (→ 토큰 노출, Rust service 에 위임).
- 공용 타입 중복 정의 / `serde_json::Value` 를 계약 타입처럼 남용.
- Rust command 에 비즈니스 로직 과도 작성 (→ `service.rs`).
- 인증 토큰을 Zustand persist / `localStorage` / `tauri-plugin-store` 에 저장.
- SQLite 를 Frontend 에서 직접 접근 (→ command 경유).
- 다른 feature 의 `model/`·`api/` deep import (→ `index.ts` 만).
- `pages/` 간 / `widgets/` 간 직접 import.
