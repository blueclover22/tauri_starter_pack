# Architecture

이 문서는 Tauri v2 기반 데스크톱·모바일 애플리케이션의 아키텍처 기준을 정리한다. 기능 단위로 구조를 분리하고, UI·데이터 접근·IPC·비즈니스 로직의 책임을 나누며, Frontend 와 Backend 의 계약을 공용 타입으로 관리하여 새 도메인 추가 시 기존 코드를 수정하지 않고 확장할 수 있는 구조를 목표로 한다.

세부 코딩 규칙은 [coding-rules.md](./coding-rules.md), Tauri 고유 메커니즘은 [tauri-guide.md](./tauri-guide.md) 를 함께 참조한다. 본 문서는 **뼈대 기준**을 정의하며, 도메인 기능 추가 시 필요한 옵션 가이드는 `docs/optional/` 하위 문서를 참조한다.

---

## 목차

| #   | 섹션                   | 내용                      |
| :-- | :--------------------- | :------------------------ |
| 1   | Overview               | 기술 스택 (reference)     |
| 2   | Core Principles        | 핵심 메타 원칙            |
| 3   | Process Model          | 프로세스 모델             |
| 4   | Domain Structure       | 도메인 구조               |
| 5   | Data Flow              | 데이터 흐름               |
| 6   | Shared Contracts       | 공용 타입 계약 (envelope) |
| 7   | Folder Structure       | 폴더 구조 (FSD + BE)      |
| 8   | Local Data             | 로컬 데이터 정책 (요약)   |
| 9   | Security Model         | 보안 모델                 |
| 10  | State Management       | 상태 관리 전략            |
| 11  | UI Style               | UI 스타일 기준            |
| 12  | Naming                 | 명명 규칙                 |
| 13  | Public API Strategy    | slice 공개 API 전략       |
| 14  | Error Strategy         | 에러 처리 전략            |
| 15  | Verification & Testing | 검증·테스트               |
| 16  | Anti-patterns          | 금지 패턴                 |

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

도입 시 추가 (`docs/optional/server-state.md`):

- Server State: TanStack Query
- Client UI State: 컴포넌트 로컬 state 우선, 화면 간 공유 상태는 Zustand
- Validation: Zod (사용자 입력 및 command payload)

> **뼈대의 의도적 비목표** (필요 시 다운스트림이 도입): 스타터는 단일 화면·최소 구성을 유지하려고 다음을 **일부러 포함하지 않는다**. 각 항목은 도입 지침만 남긴다.
>
> - **라우팅**: 화면이 2개 이상이면 `docs/optional/routing.md` 참조 (라우터 선정 + `app/routes/`·`pages/` 구성).
> - **전역 ErrorBoundary / 로딩·에러·빈 상태 UI primitive**: `shared/ui/` 에 도입. 뼈대는 `PingPanel` 의 인라인 처리로만 예시한다.
> - **i18n·테마(라이트/다크) 전환**: 미포함. 테마 전환 도입 시 `globals.css` 의 `@theme` 직접 토큰(§12)을 재구성해야 한다.
> - **Frontend 로거**: 위치는 `shared/lib/logger` 로 예약. 로깅 접두사 규약은 §13(coding-rules).

### Desktop / Mobile (Tauri / Rust)

뼈대 기본 스택:

- Tauri v2 (desktop: macOS, Windows, Linux / mobile: iOS, Android)
- Language: Rust
- 설정 영속화 (도입 시): `tauri-plugin-store`
- 로깅: `tauri-plugin-log` + Rust `log` crate

도입 시 추가:

- HTTP 통신 (외부 API 호출 시): reqwest 공유 HttpClient → `docs/optional/backend-http.md`
- 구조적 로컬 데이터: SQLite (`tauri-plugin-sql` 또는 `sqlx`) → `docs/optional/sqlite.md`
- 인증·secure store → `docs/optional/auth.md`
- emit/listen, Channel<T> → `docs/optional/events-channels.md`

---

## 2. Core Principles

1. **Feature 기반 구조** — 파일은 도메인 슬라이스(Bounded Context) 기준으로 구성한다. Frontend(kebab-case) 와 Backend(snake_case) 는 같은 도메인 이름으로 대응한다.
2. **관심사 분리** — Component=UI+이벤트 / hook=화면 조합 / api=IPC 경계 / parser=응답 파싱·정규화 / Rust command=얇은 진입점 / `service.rs`=비즈니스 로직.
3. **Contracts first** — Rust `model` ↔ TS 타입 1:1. 새 command 는 request/response 타입을 먼저 정의한다.
4. **Small diff** — 큰 구조 변경보다 작은 diff 를 우선하고, 기존 패턴이 있으면 먼저 그 패턴에 맞춘다. 구조 정리와 기능 변경을 한 번에 섞지 않는다.
5. **Cross-feature 경계** — features 간 직접 import 는 금지한다. 여러 feature 를 합성하는 흐름은 Frontend 는 `widgets/`, Backend 는 `workflows/` 로 끌어올린다.
6. **Public API** — 각 slice 는 `index.ts` 로만 외부에 노출한다. deep import 금지.
7. **Layer import (strictly below)** — 상위 layer 만 하위 layer 를 import 한다. 같은 layer 의 다른 slice 는 `index.ts` 경유.
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

| 계층             | 역할                                                   |
| ---------------- | ------------------------------------------------------ |
| **Frontend**     | UI 렌더링, 사용자 입력 처리                            |
| **Rust Command** | IPC 진입점, 입력 수신, `IpcResult<T>` 로 응답 포장     |
| **Rust Service** | 비즈니스 로직, (옵션) HTTP/로컬 데이터 접근, 상태 갱신 |

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
interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: AppError;
}
type AppError = { code: string; message: string; retryable: boolean };
```

- 공유 invoke wrapper: `src/shared/lib/tauri/invoke.ts`

> **주의**: Rust 는 `IpcResult<T>`, TypeScript 는 `IpcResponse<T>` 이다. 동일 구조이지만 타입명이 다르다.

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

상위 layer 는 하위 layer 만 import 한다. 같은 layer 의 다른 slice 는 `index.ts` 경유 외 금지.

- `pages/<P>` 가 다른 `pages/<Q>` 를 직접 import 하지 않는다.
- `widgets/<W>` 가 다른 `widgets/<W2>` 를 import 하지 않는다.
- `features/<X>` 가 다른 `features/<other>` 를 import 하지 않는다 (타입도 예외 없음 — 공유 타입은 `entities/` 로, 합성은 `widgets/` 로).
- `shared/**` 은 어떤 상위 layer 도 import 하지 않는다.

본 규칙 — **layer 역방향, 같은 layer 의 slice 간 cross-import, public API 우회 deep-import** 전부 — 은 ESLint `eslint-plugin-boundaries` 의 `boundaries/dependencies` 규칙으로 **빌드 시점에 완전 강제**한다. slice 는 자기 자신만 deep import 할 수 있고, 다른 slice 는 `index.ts`(public API)로만 접근한다(shared/app 은 단일 barrel 이 없어 내부 경로 허용). import 해석을 위해 `eslint-import-resolver-typescript` 가 필요하다(없으면 경계가 무력화). 상세는 `eslint.config.js` 참조.

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
│   └── providers/        # provider 도입 시
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
├── test/                 # mocks/, setup.ts (테스트 도입 시)
├── main.tsx
└── globals.css           # Tailwind v4 @theme 정의
```

### 7.5 Backend 트리 (뼈대)

```text
src-tauri/
├── src/
│   ├── entities/                      # 도메인 명사 SSOT (뼈대 단계: 비어 있음)
│   ├── features/                      # 뼈대: 샘플 1개 (app)
│   │   └── app/                       # {mod, commands, service, model}.rs
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

뼈대 단계의 상태 종류:

| 상태 유형                       | 관리 방법           |
| ------------------------------- | ------------------- |
| UI 로컬 상태 (로딩, 에러, 입력) | 컴포넌트 `useState` |

기능 추가 시 도입 (`docs/optional/server-state.md`):

| 상태 유형                        | 관리 방법                                                    |
| -------------------------------- | ------------------------------------------------------------ |
| 서버 데이터 (목록, 응답)         | TanStack Query                                               |
| 화면 간 공유 상태 (현재 화면 등) | Zustand store (non-persist)                                  |
| 인증 세션 상태                   | Zustand store + Rust session check (`docs/optional/auth.md`) |
| HTTP 인증 토큰                   | Rust `AppState` (Mutex 보호)                                 |
| 재시작 후 세션 복원 재료         | Rust secure store                                            |
| 앱 설정 (파일 영속화)            | `tauri-plugin-store`                                         |

- `localStorage` / `sessionStorage` 에 상태를 직접 저장하지 않는다.
- access token / refresh token / 로그인 응답 원문을 Renderer persist 에 저장하지 않는다.

---

## 11. UI Style

- Tailwind 유틸리티 클래스를 JSX 에 직접 적용한다. 별도 CSS 는 `globals.css` 또는 표현 불가 예외에만.
- Tailwind v4 는 CSS-first 설정을 사용한다. 색상·간격·폰트 등 디자인 토큰은 `globals.css` 의 `@theme` 블록에 정의한다 (`tailwind.config.js` 의 `theme.extend` 는 v4 에서 사용하지 않는다).
- `@theme { --color-X: value }` **직접 정의** 패턴을 우선한다 — Tailwind v4 가 `text-X` / `bg-X` 표준 utility 를 자동 노출한다. `:root` 별칭 + `text-(--color-X)` arbitrary 문법은 토큰 일관성을 저해하므로 금지.
- 임의 값(`[#abc]`, `[32px]`) 은 최소화하고 반복 값은 토큰화한다.
- 아이콘은 `outline`(기본) / `solid`(활성·강조) 를 구분하여 통일 사용하고, 크기는 Tailwind 클래스(`size-5`, `size-6`) 로 지정한다. 장식용 아이콘은 `aria-hidden="true"`.

### Fullscreen Shell

- 기본 화면 셸은 `h-screen + min-h-0 + overflow-hidden` 조합을 기준으로 한다.
- 상단 헤더, 하단 고정 패널은 `shrink-0` 로 둔다.
- 목록·테이블처럼 데이터가 늘어나는 영역만 내부 스크롤(`overflow-y-auto`) 을 허용한다.
- UI 계층은 `globals.css`(전역 토큰) → `shared/styles/ui.ts`(공통 UI) → `features/<f>/ui/styles.ts`(화면 전용) 순으로 관리한다.

---

## 12. Naming

| 대상                    | 규칙                                        | 예시                              |
| ----------------------- | ------------------------------------------- | --------------------------------- |
| Components              | PascalCase                                  | `LoginForm`                       |
| Types / Interfaces      | PascalCase                                  | `LoginRequest`                    |
| Hooks                   | `use` 접두사 camelCase                      | `useAuthQuery`                    |
| Query hooks             | `use[Feature]Query`, `use[Feature]Mutation` | `useAuthMutation`                 |
| API wrappers            | `[feature]Api.ts`                           | `authApi.ts`                      |
| Service files (backend) | `service.rs`                                | `features/auth/service.rs`        |
| Type files              | `entities/<도메인>/model/types.ts`          | `entities/session/model/types.ts` |
| Constants (에러 코드)   | `ERROR_` 접두사 UPPER_SNAKE_CASE            | `ERROR_AUTH_LOGIN_FAILED`         |
| Frontend feature folder | kebab-case                                  | `device-settings/`                |
| Backend feature module  | snake_case                                  | `device_settings/`                |
| Rust command            | `[feature]_[action]`                        | `auth_login`                      |

> `Service` 단어는 **backend `service.rs`** 1개 의미로만 사용한다. frontend `*Service.ts` 명명은 폐기 단어다 — 응답 파싱은 `*Parsers.ts`, invoke 경계는 `*Api.ts` 가 담당한다.

---

## 13. Public API Strategy

- feature 외부에서 feature 내부 깊은 경로를 직접 참조하지 않는다. `index.ts` 가 public API 경계다.
- app · pages · widgets · 다른 features 는 모두 대상 feature 의 `index.ts` 만 사용한다.
- entities · widgets · pages 도 동일하게 같은 layer 내 다른 slice 는 `index.ts` 경유.
- 본 정책(public API·deep-import 금지)은 `eslint-plugin-boundaries` 의 `boundaries/dependencies` 로 빌드 시점에 강제된다(§7.2).

---

## 14. Error Strategy

### Frontend

- 구조화된 `AppError` (`{ code, message, retryable }`) 를 사용한다.
- 화면은 loading / error / empty / success 상태를 모두 처리한다.
- API/parser layer 에서 raw error 를 그대로 흘리지 않는다.

### Backend

- `IpcResult<T>` 로 성공/실패를 일관되게 감싼다.
- 비즈니스 에러를 포함한 모든 결과를 `Ok(IpcResult<T>)` 로 반환한다 (Ok-Only). 시스템 panic 만 `Err(String)`.
- error code 는 feature `config.rs` 또는 `shared/config.rs` 상수로 관리한다.

`AppError` code 는 `ERROR_<카테고리>_<상세>` 형식이며 카테고리로 분류한다 (`ERROR_AUTH_*`, `ERROR_NETWORK_*`, `ERROR_VALIDATION_*`, `ERROR_CONFIG_*`, `ERROR_UNKNOWN` 등). 하나의 도메인은 하나의 카테고리만 쓰고, `retryable` 로 UI 재시도 가능 여부를 전달한다. 상세는 `tauri-guide.md §8`.

---

## 15. Verification & Testing

검증은 4단계로 나눈다. 서로 대체가 아니라 보완 관계로 본다.

| 단계             | 도구 예시                 | 목적                     |
| ---------------- | ------------------------- | ------------------------ |
| **Lint**         | ESLint                    | 규칙 위반·위험 패턴 탐지 |
| **Format**       | Prettier                  | 포맷 일관성              |
| **Type Check**   | TypeScript `tsc --noEmit` | 타입·계약 불일치 탐지    |
| **Runtime Test** | Vitest / RTL              | 실제 동작·회귀 검증      |

IPC mock 패턴 (`vi.mock("@tauri-apps/api/core")`) 상세는 `docs/optional/server-state.md §4`. 커밋 전 권장 순서: `lint` → `tsc --noEmit` → `test`.

---

## 16. Anti-patterns

- Component 에서 직접 `invoke()` 또는 `fetch()` 호출.
- Frontend 에서 백엔드 API 직접 HTTP 호출 (→ 토큰 노출, Rust service 에 위임).
- 공용 타입 중복 정의 / `serde_json::Value` 를 계약 타입처럼 남용.
- Rust command 에 비즈니스 로직 과도 작성 (→ `service.rs`).
- Rust command 에서 비즈니스 에러를 `Err(String)` 으로 반환 (→ Ok-Only).
- 인증 토큰을 Zustand persist / `localStorage` / `tauri-plugin-store` 에 저장.
- SQLite 를 Frontend 에서 직접 접근 (→ command 경유).
- 다른 feature 의 `model/`·`api/` deep import (→ `index.ts` 만).
- `pages/` 간 / `widgets/` 간 직접 import.
- frontend 코드에 `Service` 단어 사용 (`*Service.ts`).
- Tailwind 임의 값 반복 사용 / `:root` 별칭 + arbitrary 문법.
- 문서·타입·구현이 서로 다른 상태로 방치.
