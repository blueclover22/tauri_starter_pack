# 규칙 기계 강제 보강 (CSP · clippy lints · ESLint · IPC 응답 타입)

> 대상: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `eslint.config.js`, `src/shared/types/ipc.ts`, `src/shared/lib/tauri/invoke.ts`, `src/features/app/api/appParsers.ts`(+test), `src/features/app/ui/PingPanel.tsx`, `.claude/CLAUDE.md`, `docs/tauri-guide.md`
> 연관 규칙: `docs/tauri-guide.md` §CSP·§8·§13, `docs/coding-rules.md`, `docs/architecture.md`
> 작성일: 2026-10-06
> 상태: 완료 (2026-10-06) — 전 항목 권장안. 수동 검증 V1·V2 는 사용자 확인 대기

---

## 1. 목적 / 비목표

### 목적

- 문서에 문장으로만 있는 규칙 중 도구로 강제 가능한 것을 lint·clippy·타입으로 옮겨, 에이전트가 어기면 검증 단계에서 자동으로 실패하게 한다.
- 에이전트가 복제하는 뼈대(CSP·IPC 계약·파서)를 안전한 기본값으로 바꾼다.

### 비목표

- 테스트 파일의 FSD 경계 검사(`boundaries/ignore` 해제) — 테스트 전용 정책 설계가 필요해 별도 작업.
- `no-console`, `../../` import 금지 lint — 각각 FE 로깅 규칙 정리 / boundaries 규칙으로 대부분 커버되어 이번 범위에서 제외.
- `recommendedTypeChecked` 전체 도입, tsconfig 옵션 추가(`exactOptionalPropertyTypes` 등), Rust edition 2024, pnpm 메이저 상향, capability 세분화, `features/app` 이름 변경.

---

## 2. 설계 방향

### 2.1 CSP 활성화

`app.security.csp` 를 `null` 에서 최소 정책으로 바꾼다 (Tauri 공식 예시 기반, 원격 리소스 없음 전제).

```json
"csp": {
  "default-src": "'self' customprotocol: asset:",
  "connect-src": "ipc: http://ipc.localhost",
  "img-src": "'self' asset: http://asset.localhost blob: data:",
  "style-src": "'self' 'unsafe-inline'"
}
```

`docs/tauri-guide.md` §CSP 문단을 "뼈대는 최소 CSP 활성, 외부 origin 추가 시 해당 지시자에만 화이트리스트" 로 갱신한다.

### 2.2 Rust clippy lints + 검증 명령 등록

`Cargo.toml` 에 `[lints.clippy]` 추가 — 문서 규칙과 1:1 대응하는 것만.

| lint           | 수준 | 근거 규칙                               |
| :------------- | :--- | :-------------------------------------- |
| `print_stdout` | deny | tauri-guide §13 `println!` 금지         |
| `print_stderr` | deny | tauri-guide §13 `eprintln!` 금지        |
| `unwrap_used`  | deny | 운영 코드 `unwrap` 지양 (현재 사용 0건) |

`await_holding_lock` 은 clippy 기본(warn) 이므로 `-D warnings` 실행으로 강제된다.

`.claude/CLAUDE.md` §검증 명령 표에 Rust 3행 추가 (`settings.json` allow 패턴과 일치하는 형태):

| 단계             | 명령                                                                             |
| :--------------- | :------------------------------------------------------------------------------- |
| Rust 포맷 (검증) | `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         |
| Rust 린트        | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` |
| Rust 테스트      | `cargo test --manifest-path src-tauri/Cargo.toml`                                |

### 2.3 ESLint 규칙 추가

| 규칙                                                                                            | 대상                                               | 근거                                                |
| :---------------------------------------------------------------------------------------------- | :------------------------------------------------- | :-------------------------------------------------- |
| `no-restricted-imports` — `@tauri-apps/api/core`                                                | `src/**` (예외: `src/shared/lib/tauri/**`, 테스트) | IPC 는 공통 wrapper 경유 (tauri-guide §IPC wrapper) |
| `no-restricted-globals` — `localStorage`, `sessionStorage`                                      | `src/**`                                           | coding-rules:67, architecture:360                   |
| `@typescript-eslint/no-floating-promises`, `no-misused-promises` (type-aware, `projectService`) | `src/**/*.{ts,tsx}`                                | 처리 안 된 Promise 방지                             |

`no-misused-promises` 도입으로 `PingPanel.tsx` 의 `onClick={() => ping(...)}` 가 위반되므로 `onClick={() => void ping(...)}` 로 수정한다.

### 2.4 IPC 응답 타입을 판별 유니온으로

```ts
export type IpcResponse<T = unknown> =
  { success: true; data: T } | { success: false; error?: AppError };
```

- `invoke.ts` 는 `if (!result.success)` 이후 좁혀진 타입으로 `return result.data;` — `as TResponse` cast 제거.
- 실패 시 `error` 누락 fallback(`ERROR_TAURI_COMMAND_FAILED`)은 현행 동작 유지를 위해 `error?` 로 둔다.
- Rust `IpcResult::ok` 는 항상 `data` 를 직렬화하므로(`()` 는 `null`) 계약과 일치.
- `docs/tauri-guide.md` 의 invoke helper 스니펫을 같은 코드로 동기화.

### 2.5 파서 타입 검증 강화

`parsePingInfo` 에서 `typeof obj.message !== "string"` 이면 `ERROR_VALIDATION_PING_SHAPE` throw. `String(obj.message)` 제거. 테스트 1건 추가 (`message: 123` → SHAPE).

---

## 3. 개발 범위

### 3.1 변경 파일

| #   | 파일                                  | 변경 유형 | 내용                                                      |
| :-- | :------------------------------------ | :-------- | :-------------------------------------------------------- |
| 1   | `src-tauri/tauri.conf.json`           | 수정      | §2.1 CSP                                                  |
| 2   | `src-tauri/Cargo.toml`                | 수정      | §2.2 `[lints.clippy]`                                     |
| 3   | `.claude/CLAUDE.md`                   | 수정      | §2.2 검증 명령 Rust 3행                                   |
| 4   | `eslint.config.js`                    | 수정      | §2.3 규칙 3종                                             |
| 5   | `src/features/app/ui/PingPanel.tsx`   | 수정      | `void ping(...)`                                          |
| 6   | `src/shared/types/ipc.ts`             | 수정      | §2.4 판별 유니온                                          |
| 7   | `src/shared/lib/tauri/invoke.ts`      | 수정      | §2.4 cast 제거                                            |
| 8   | `src/features/app/api/appParsers.ts`  | 수정      | §2.5 string 검증                                          |
| 9   | `src/features/app/api/appApi.test.ts` | 수정      | §2.5 테스트 1건                                           |
| 10  | `docs/tauri-guide.md`                 | 수정      | §CSP 문단, invoke 스니펫 동기화                           |
| 11  | `src-tauri/clippy.toml`               | 생성      | (구현 중 추가) 테스트 코드 `unwrap` 허용 — Q2 결정에 따름 |
| 12  | `docs/architecture.md`                | 수정      | (구현 중 추가) `IpcResponse` 스니펫 동기화                |

---

## 4. 검증 계획

### 4.0 성공 기준 / Step → verify

| #   | Step               | verify (성공 기준)                                                                                               |
| :-- | :----------------- | :--------------------------------------------------------------------------------------------------------------- |
| 1   | clippy lints 추가  | `cargo clippy ... -D warnings` 통과. 임시로 `println!` 넣으면 실패하는지 확인 후 원복                            |
| 2   | ESLint 규칙 추가   | `pnpm lint` 통과. 임시로 component 에서 `@tauri-apps/api/core` import / `localStorage` 사용 시 오류 확인 후 원복 |
| 3   | IPC 타입·파서 변경 | `pnpm typecheck`, `pnpm test`(신규 1건 포함 8건) 통과                                                            |
| 4   | CSP 설정           | `pnpm tauri build` 성공                                                                                          |

### 4.1 자동 검증

`.claude/CLAUDE.md` §검증 명령 전체 (Rust 3행 포함).

### 4.2 수동 검증 (시나리오)

| #   | 시나리오                                    | 기대 결과                                |
| :-- | :------------------------------------------ | :--------------------------------------- |
| V1  | `pnpm tauri dev` 로 앱 실행 후 Ping 클릭    | 응답 표시, devtools 콘솔에 CSP 위반 없음 |
| V2  | `pnpm tauri build` 산출물 실행 후 Ping 클릭 | 스타일 정상, 응답 표시, CSP 위반 없음    |

### 4.3 회귀 관찰 포인트

- CSP 적용 후 Tailwind 스타일·Vite dev HMR 동작.
- type-aware lint 도입 후 `pnpm lint` 소요 시간 증가.

---

## 5. 결정 필요 사항

### Q1. type-aware lint 범위

| 옵션                             | 설명                                          | 장점                          | 단점                                                                    |
| :------------------------------- | :-------------------------------------------- | :---------------------------- | :---------------------------------------------------------------------- |
| **A. Promise 규칙 2개만** (권장) | `no-floating-promises`, `no-misused-promises` | 실효성 높은 규칙만, 충돌 없음 | type-aware 다른 규칙 미적용                                             |
| B. `recommendedTypeChecked` 전체 | 권장 세트 전체                                | 커버리지 최대                 | `only-throw-error` 가 plain AppError throw 설계와 충돌 → 예외 설정 필요 |
| C. type-aware 미도입             | 2.3 의 앞 2개 규칙만                          | lint 속도 유지                | Promise 누락 미검출                                                     |

**권장**: **A**.

### Q2. `unwrap_used` 수준

**A. deny (권장)** — 현재 사용 0건, 테스트에서 필요해지면 그때 `clippy.toml` `allow-unwrap-in-tests` 추가. / B. warn — CI `-D warnings` 로 결국 실패하므로 실익 없음.

---

## 6. 추정 / 불확실 영역

- **추정**: Tauri 는 번들 자산의 `<style>`·`<script>` 에 nonce/hash 를 자동 추가한다. `style-src` 에 nonce 가 붙으면 브라우저가 `'unsafe-inline'` 을 무시하므로, 인라인 `style` 속성을 쓰는 코드가 생기면 막힐 수 있다 (현재 `style=` 사용 0건). V2 로 확인.
- **불확실**: `pnpm tauri dev`(devUrl 로딩) 시 CSP 적용 여부와 Vite HMR(ws·인라인 preamble) 영향. V1 에서 문제 시 `devCsp` 를 별도 지정한다.
- **미검토**: V1·V2 는 GUI 실행이 필요해 사용자 확인이 필요하다.
