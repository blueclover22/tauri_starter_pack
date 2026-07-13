# Coding Rules

이 문서는 Tauri v2 기반 데스크톱·모바일 애플리케이션의 코드 작성 규칙을 정리한다. 구조와 책임을 일관되게 유지하고, 작은 diff 로 안전하게 변경하며, 타입·문서·구현이 같이 움직이게 하고, IPC 기반 구조에서 경계를 명확히 유지하는 것을 목표로 한다.

구조 전반은 [architecture.md](./architecture.md), Tauri 고유 메커니즘은 [tauri-guide.md](./tauri-guide.md) 를 참조한다. 본 문서는 **뼈대 기준**이며 도입 시 규칙은 `docs/optional/` 참조.

---

## 목차

| #   | 섹션               | 내용             |
| :-- | :----------------- | :--------------- |
| 1   | General            | 일반 원칙        |
| 2   | Naming             | 명명 규칙        |
| 3   | Component          | 컴포넌트 규칙    |
| 4   | Hook               | 훅 규칙          |
| 5   | API (Boundary)     | API 경계 규칙    |
| 6   | Type               | 타입 규칙        |
| 7   | Import             | 임포트 규칙      |
| 8   | Layer              | 레이어 책임 규칙 |
| 9   | Error Handling     | 에러 처리 규칙   |
| 10  | Tauri / Rust Rules | Tauri·Rust 규칙  |
| 11  | Blocking I/O       | 블로킹 I/O 규칙  |
| 12  | UI / Styling       | UI 스타일 규칙   |
| 13  | Import Path        | Import Path 규칙 |
| 14  | Testing            | 테스트 규칙      |
| 15  | Documentation      | 문서화 규칙      |
| 16  | Comment            | 주석 규칙        |
| 17  | Anti-patterns      | 금지 패턴        |

### 추가 도입 가이드

| 주제                           | 문서                            |
| :----------------------------- | :------------------------------ |
| TanStack Query / Zustand / Zod | `docs/optional/server-state.md` |
| 인증 세션 / Secure Store       | `docs/optional/auth.md`         |
| Backend HTTP                   | `docs/optional/backend-http.md` |

---

## 1. General

- 관련 없는 파일은 수정하지 않는다.
- docs, types, implementation 은 가능한 한 함께 갱신한다.
- 기존 구조를 먼저 따르고, 구조를 바꿀 때는 문서도 같이 고친다.
- 새 도메인/구조 추가 시 기존 동종 구조를 먼저 참조하여 동일 패턴을 따른다. 이탈이 필요하면 사유를 명시한다.
- 작은 diff 와 테스트 가능한 구조를 우선한다.

---

## 2. Naming

전체 명명 규칙은 `architecture.md §12` 를 참조한다. 핵심:

- Constants (에러 코드): `ERROR_` 접두사 UPPER_SNAKE_CASE (예: `ERROR_AUTH_LOGIN_FAILED`)
- Frontend feature folder: kebab-case / Backend feature module: snake_case
- Rust command: `[feature]_[action]` (예: `auth_login`)
- `Service` 단어는 backend `service.rs` 전용. frontend `*Service.ts` 명명은 폐기 — 응답 파싱은 `*Parsers.ts`, invoke 경계는 `*Api.ts`.

---

## 3. Component

- Component 는 UI 와 이벤트 연결에 집중한다.
- 데이터 로딩, 응답 가공, 에러 해석은 component 밖으로 뺀다.
- 화면 상태는 로컬 state 를 우선 사용한다.
- `localStorage` / `sessionStorage` 에 직접 접근하지 않는다.
- loading / error / empty 상태를 생략하지 않는다.
- 가능하면 한 파일은 하나의 component 만 둔다.

화면 간 공유 상태·서버 상태 관리 규칙은 `docs/optional/server-state.md` 참조.

---

## 4. Hook

- hook 은 화면 조합 state 를 만들 때 사용한다.
- 여러 화면에서 재사용 가능한 조합 로직은 component 보다 hook 으로 올린다.

---

## 5. API (Boundary)

- 모든 Tauri 호출은 API layer 를 거친다. component 에서 직접 `invoke` 를 호출하지 않는다.
- 공통 invoke wrapper (`src/shared/lib/tauri/invoke.ts`) 를 사용한다.
- API layer 는 `<d>Api.ts` + `<d>Parsers.ts` 2 파일로 분리한다. `<d>Api.ts` 가 command 이름과 payload 계약을, `<d>Parsers.ts` 가 응답 파싱·validation·error normalization 을 담당한다.

---

## 6. Type

- public API type 은 명시적으로 선언한다. `any` 사용은 최소화한다.
- 새 type 을 만들기 전에 기존 type 재사용 가능성을 먼저 본다.
- Rust `model.rs` 와 TypeScript 타입은 1:1 대응을 목표로 유지한다.
- 공용 contract type 은 중복 정의하지 않는다. deprecated 설정은 남기지 않는다.

---

## 7. Import

- 같은 feature 내부에서는 상대 경로를 우선한다.
- feature 외부에서는 feature `index.ts` public API 를 사용한다.
- 순환 import 를 만들지 않는다.
- `features/<X>` 는 다른 `features/<other>` 를 직접 import 하지 않는다 (타입 포함) — 공유 타입은 `entities/` 로, cross-feature 합성은 `widgets/`(Frontend) / `workflows/`(Backend) 로 끌어올린다. (ESLint `boundaries/dependencies` 로 강제.)

---

## 8. Layer

```text
Component → Hook → API (Client + Parser) → invoke wrapper → Rust Command → Rust Service
```

- component 는 UI 조합과 event 연결만 담당한다.
- data mapping 과 error normalization 은 API parser 에서 처리한다.
- 비즈니스 로직은 Rust `service.rs` 에 둔다. Rust command 는 얇게 유지하고 service 에 위임한다.

TanStack Query 도입 시 layer 가 `Component → Hook → Query/Mutation → API → ...` 로 확장된다 (`docs/optional/server-state.md`).

---

## 9. Error Handling

- 구조화된 `AppError` (`{ code, message, retryable }`) 를 일관되게 사용한다.
- 사용자 메시지와 내부 진단 메시지를 혼동하지 않는다.
- error 를 조용히 삼키지 않는다. retry 가능 여부를 `retryable` 로 명시한다.
- API/parser layer 에서 raw error 를 그대로 흘리지 않는다.
- Rust command 는 예외를 throw 하지 않고 항상 `Ok(IpcResult<T>)` 로 반환한다 (Ok-Only).

전체 에러 전략은 `architecture.md §14`, Ok-Only 상세는 `tauri-guide.md §8`.

---

## 10. Tauri / Rust Rules

- component 에서 `invoke` 를 직접 호출하지 않는다.
- command 는 `Result<IpcResult<T>, String>` 를 반환하고, 비즈니스 에러를 포함한 모든 결과를 `Ok(IpcResult<T>)` 로 반환한다.
- command 는 얇게 유지하고 service 가 비즈니스 로직을 담당한다.
- 입력/출력은 typed model struct 로 정의한다. primitive 파라미터 나열보다 request model struct 를 우선한다.
- error code 는 feature `config.rs` 또는 `shared/config.rs` 상수로 두고 `ERROR_` 접두사 + UPPER_SNAKE_CASE 로 명명한다.
- 공통 직렬화는 `response::ok()` helper 로 통일한다.
- Rust 모델 struct 에는 `#[serde(rename_all = "camelCase")]` 를 적용한다.
- 모바일 빌드를 위해 `[lib] crate-type = ["staticlib", "cdylib", "rlib"]` 와 `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 를 유지한다 (`tauri-guide.md §14`).

인증 토큰 / secure store 정책은 `docs/optional/auth.md` 참조.

---

## 11. Blocking I/O (spawn_blocking)

- 파일·저장소 접근처럼 블로킹 성격의 작업은 `tokio::task::spawn_blocking` 으로 격리한다.
- command 나 service 의 async 흐름 안에서 직접 블로킹 API 를 호출하지 않는다.
- timeout, retry, config 값은 `config.rs` 에 둔다.

---

## 12. UI / Styling (Tailwind v4)

- 스타일은 Tailwind 유틸리티 클래스를 JSX 에 직접 적용한다. 별도 CSS 는 `globals.css` 또는 표현 불가 예외에만 허용한다.
- 임의 값(`[#abc]`, `[32px]`) 은 최소화하고 반복 값은 `@theme` 블록에 CSS 변수로 등록한다.
- Tailwind v4 는 CSS-first 설정을 사용한다. 디자인 토큰은 `globals.css` 의 `@theme` 블록에 정의한다 (`tailwind.config.js` 의 `theme.extend` 는 v4 에서 사용하지 않는다).
- `@theme { --color-X: value }` **직접 정의** 패턴을 우선한다 — `text-X` / `bg-X` 표준 utility 가 자동 노출된다. `:root` 별칭 + `text-(--color-X)` arbitrary 문법은 금지.
- 스타일 레이어는 `globals.css` → `shared/styles/ui.ts` → `{feature}/ui/styles.ts` 순으로 관리한다.
- 한 파일에서만 한두 번 쓰는 짧은 클래스 상수는 과분리하지 않는다. 분리 기준은 "재사용"보다 "가독성 개선" 에 둔다.

### data-testid

- 같은 화면에 동시 렌더되는 컴포넌트는 `data-testid` prefix 를 필수로 부여하여 셀렉터 충돌을 회피한다.
- 단일 컴포넌트 또는 동시 렌더가 없는 영역은 prefix 불요.

### Heroicons

- `@heroicons/react/24/outline`(기본) 과 `@heroicons/react/24/solid`(활성/강조) 를 구분하여 named import 한다.
- 아이콘 크기는 Tailwind 클래스(`size-4`, `size-5`, `size-6`) 로 지정한다 (인라인 스타일 금지).
- 장식용 아이콘은 `aria-hidden="true"`, 의미 있는 아이콘은 `aria-label` 또는 인접 텍스트로 접근성을 보장한다.

---

## 13. Import Path

- 외부 디렉토리 참조는 `@` alias 사용 (`@/shared/...`, `@/features/...`).
- 같은 디렉토리 (`./`) 는 그대로.
- 상대 경로 (`../`, `../../`) 사용 금지 — 가독성/리팩토링 친화 위반.
- 설정 정합: `@/*` → `./src` 를 `tsconfig.json`(`paths`, 타입체크·에디터용)과 런타임 alias 가 일치시킨다. 런타임 alias 는 `vite.shared.ts` 한 곳에서 정의해 `vite.config.ts`·`vitest.config.ts` 가 공유한다(복붙 금지).

---

## 14. Testing

- 검증은 lint, format, type check, runtime test 를 분리해서 운영한다. 한 단계가 통과해도 다른 단계를 생략하지 않는다.
- Renderer parser 계층은 IPC 응답 해석, 에러 정규화, fallback 메시지를 테스트한다.
- 브리지 객체는 mock helper 로 대체한다.

IPC mock 패턴 (vi.mock, mock helper 구성, hook 테스트 등) 상세는 `docs/optional/server-state.md §4`.

커밋 전 권장 순서: `pnpm lint` → `pnpm typecheck` → `pnpm test`.

---

## 15. Documentation

- 구조가 바뀌면 `architecture.md`, command 계약이 바뀌면 `tauri-guide.md` 또는 `tauri-commands.md`, 코드 규칙이 바뀌면 본 문서를 갱신한다.
- 도입형 기능은 `docs/optional/` 의 해당 문서를 함께 갱신한다.
- 문서는 구현과 다른 상태로 오래 두지 않는다.

---

## 16. Comment

코드 주석은 **현재 코드가 무엇을 / 왜 하는지** 만 기록한다. 개발 과정의 흔적(설계서 번호, PR 번호, hotfix 라벨, 단계 마커)은 시간이 지나면 의미를 잃는 noise 이므로 소스에 박제하지 않는다.

| 분류 (금지)          | 예                         | 사유                       |
| :------------------- | :------------------------- | :------------------------- |
| 설계 결정 ID         | `Q-7-8-24`, `W-5`, `D14`   | 설계 정합 추적 — 소스 무관 |
| PR 번호              | `PR 7-1`, `PR4-1`          | 머지 후 의미 소실          |
| Phase / Section 마커 | `§7-4`, `§D17`             | 시점성 — 추적 도구 단독    |
| 개발 과정 라벨       | `hotfix`, `진단 로그 추가` | 과정 묘사 — 동작 무관      |

- 신규 주석은 처음부터 위 패턴을 쓰지 않는다 — 설계 ID·PR 번호는 설계서·PR 본문에만 둔다.
- 외부 벤더 가이드 ref, 테스트 ID prefix, 코드 식별자명(상수/시퀀스 약칭) 은 변경 추적이 가능하므로 보존해도 무방하다.

---

## 17. Anti-patterns

| 패턴                                                 | 이유                                          |
| ---------------------------------------------------- | --------------------------------------------- |
| Component 내부에서 직접 `invoke()` 호출              | 레이어 규칙 위반, 테스트/유지보수 어려움      |
| Frontend 에서 직접 백엔드 HTTP 호출                  | 토큰 노출, 보안 모델 붕괴                     |
| 공용 타입 중복 정의                                  | 타입 불일치                                   |
| Rust command 에 과도한 비즈니스 로직                 | command 는 얇은 진입점, 로직은 `service.rs`   |
| `serde_json::Value` 를 계약 타입처럼 남용            | 타입 안전성 손실                              |
| Rust command 에서 `Err(String)` 반환                 | 비즈니스/시스템 에러 구분 불가 (Ok-Only 위반) |
| 인증 토큰을 Zustand persist / `localStorage` 에 저장 | Renderer 노출, 세션 탈취 위험                 |
| `tauri-plugin-store` 에 토큰 저장                    | 비민감 설정과 인증 재료 책임이 섞임           |
| Tailwind 임의 값(`[#abc]`) 반복 / `:root` 별칭 문법  | `@theme` 토큰 + 표준 utility 로 추출          |
| Heroicons outline/solid 혼용 / 아이콘 인라인 크기    | UI 통일성 손실 (`size-*` 클래스 사용)         |
| 동시 렌더 컴포넌트의 `data-testid` 동일 사용         | 셀렉터 충돌 → prefix 필수                     |
| `[lib] crate-type` 에 `cdylib`/`staticlib` 누락      | 모바일 빌드 불가                              |
| 문서·타입·구현이 서로 다른 상태로 방치               | 팀 일관성 손실                                |
