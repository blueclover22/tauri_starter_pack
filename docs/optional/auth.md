# Optional — Auth & Secure Store

> 도입 시점: 로그인·세션 관리·인증 토큰을 다뤄야 하는 시점.
> 뼈대 단계에서는 사용하지 않는다.

이 문서는 인증 도메인 추가 시의 규칙·계약·저장 전략을 정리한다. `docs/optional/backend-http.md` (토큰을 첨부하는 HTTP client) 와 함께 도입한다.

---

## 1. 아키텍처 위치 · End-to-end 흐름

인증은 **토큰의 소유권을 Rust 가 갖는다**는 한 가지 원칙 위에 서 있다. Renderer 는 "로그인됨/안됨"과 표시용 프로필만 알고, access/refresh token 은 절대 넘겨받지 않는다. 이 경계가 뼈대 보안 모델(`architecture.md §9`)의 핵심이다.

```text
[로그인]
Component(LoginForm)
  → useLoginMutation (model/mutations)
  → authApi.login(credentials) (api/authApi.ts)
  → invoke("auth_login") → commands.rs → service::login
  → api.rs (HTTP 어댑터, backend-http.md) → 외부 인증 API
  → 성공: access token → AppState(AuthState) 메모리 / refresh token → secure store
  → 응답 DTO(식별자·표시명·만료 시각 등, raw token 제외)만 IpcResult 로 반환
  → setAuthenticated(true) → 라우터 이동

[부팅 세션 복원]
BootStage::RestoreAuthSession
  → secure store 의 refresh token 으로 세션 복원 시도
  → 성공: AuthState 채움 / 실패: 비로그인 진입 (경고 후 계속)

[만료]
service 가 ERROR_AUTH_EXPIRED 감지
  → AuthState::clear() (access token 폐기 + secure store 비우기 + emit auth-session-cleared)
  → frontend listen("auth-session-cleared") → 캐시 무효화 → 로그인 화면
```

- `isAuthenticated`(Zustand)는 **UI 표시 분기용**일 뿐, 보안 판정 근거가 아니다. 보안 분기는 Rust session check 결과로 한다.
- emit/listen 을 쓰므로 `docs/optional/events-channels.md`, 표시 상태는 `docs/optional/server-state.md` 와 함께 도입한다.

---

## 2. 뼈대 통합 접점

| 접점                          | 뼈대 현재 상태                               | 도입 시 변경                                                                                  |
| :---------------------------- | :------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| `AppState` (`store/state.rs`) | `teardown` 필드만                            | `AuthState`(토큰 메모리 보관) 를 필드로 추가 또는 `shared/auth/state.rs` 참조                 |
| `BootStage` (`lifecycle.rs`)  | `InitPlugins`/`PrepareState`/`RegisterState` | `RestoreAuthSession` 추가 (실패 정책: **경고 후 계속**)                                       |
| `lib.rs` builder              | log plugin + `app_ping`                      | secure store 를 plugin 으로 택한 경우만 등록 (`keyring` crate 는 plugin 아님)                 |
| `capabilities/default.json`   | `core:default`                               | `auth-session-cleared` emit/listen 시 `core:event:default` 추가                               |
| `shared/config.rs`            | `ERROR_*` / `EVENT_*`                        | `ERROR_AUTH_*`, endpoint path, `EVENT_AUTH_SESSION_CLEARED`                                   |
| 신규 파일                     | —                                            | `features/auth/{commands,service,api,model,config}.rs`, `shared/auth/{state,secure_store}.rs` |
| 의존 문서                     | —                                            | `backend-http.md`(토큰 주입) · `server-state.md`(표시 상태) · `events-channels.md`(emit)      |

---

## 3. 책임 분리

| 데이터                          | 위치                                                     | 이유                                |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| access token (단기)             | Rust `AppState` 메모리 (Mutex)                           | 재시작 시 무효해도 무방             |
| refresh token (장기, 복원 필요) | Rust secure store                                        | OS 보안 저장소 (keychain 등) 사용   |
| `isAuthenticated` (UI 표시용)   | Zustand store (`docs/optional/server-state.md`)          | UI 분기 표시. 보안 판정에 사용 금지 |
| 로그인 응답 원문 (DTO)          | 어디에도 persist 안함                                    | 토큰 유출 위험                      |
| 사용자 프로필 (이름, 사진 등)   | Renderer cache (TanStack Query) 또는 Zustand non-persist | 비민감 표시 정보                    |

**금지**: 토큰을 `localStorage` / `sessionStorage` / `tauri-plugin-store` / Zustand persist 에 저장.

---

## 4. Backend 구조 (`src-tauri/src/features/auth/`)

| 파일          | 책임                                                        |
| :------------ | :---------------------------------------------------------- |
| `commands.rs` | `auth_login`, `auth_logout`, `auth_session_check` 등 진입점 |
| `service.rs`  | 로그인 흐름, 토큰 저장/삭제, refresh 로직                   |
| `api.rs`      | 백엔드 인증 API HTTP 호출 어댑터                            |
| `model.rs`    | `LoginRequest`, `LoginInfo`, `SessionInfo` 등 DTO           |
| `config.rs`   | `ERROR_AUTH_*` 상수, endpoint path                          |

추가로 `src-tauri/src/shared/auth/` 에 다음을 둔다.

| 파일              | 책임                                                  |
| :---------------- | :---------------------------------------------------- |
| `state.rs`        | `AuthState` — 메모리 토큰 보관 (Mutex), session id    |
| `secure_store.rs` | OS secure store wrapper (keychain / DPAPI / KeyStore) |

`AuthState::clear()` 는 access token 폐기 + secure store 비우기 + emit 발행을 묶는다.

### secure store 구현 선택

Tauri 공식 "secure-store" plugin 은 없다. 아래 중 하나를 택해 `secure_store.rs` 로 감싼다 — 뼈대는 미결정 상태이며 도입 시 확정한다.

| 옵션                      | 성격                                                                                                | 적합                                  |
| :------------------------ | :-------------------------------------------------------------------------------------------------- | :------------------------------------ |
| `keyring` crate (권장)    | OS 자격증명 저장소 직접 사용 (macOS Keychain / Windows Credential Manager(DPAPI) / Linux libsecret) | 토큰 몇 개만 보관하는 일반적 경우     |
| `tauri-plugin-stronghold` | 암호화된 vault 파일 + 패스워드                                                                      | 민감 데이터가 다수·암호화 파일이 필요 |

어느 쪽이든 entry 이름을 앱 식별자 prefix 로 격리한다.

---

## 5. Command 계약

| Command                | Input          | Output           | Error codes                                       | Retryable |
| ---------------------- | -------------- | ---------------- | ------------------------------------------------- | --------- |
| `auth_login`           | `LoginRequest` | `LoginInfo`      | `ERROR_AUTH_LOGIN_FAILED`, `ERROR_NETWORK_*`      | false\*   |
| `auth_logout`          | -              | `SuccessPayload` | -                                                 | false     |
| `auth_session_check`   | -              | `SessionInfo`    | `ERROR_AUTH_EXPIRED`                              | false     |
| `auth_session_restore` | -              | `SessionInfo`    | `ERROR_AUTH_EXPIRED`, `ERROR_AUTH_RESTORE_FAILED` | false     |

응답 DTO 에 raw token 을 포함하지 않는다 (사용자 식별자·표시 이름·만료 시각 등만).

> \* `auth_login` 자체(자격 실패 `ERROR_AUTH_LOGIN_FAILED`)는 재시도 무의미하므로 `retryable=false` 다 (base `tauri-guide.md §8` auth 카테고리 정책). 네트워크 계층 실패(`ERROR_NETWORK_*`)만 해당 error 코드 기준으로 재시도 가능하다.

---

## 6. 부트 시 세션 복원

`BootStage::PrepareState` 다음 단계에서 secure store 의 refresh token 으로 session 을 시도 복원한다. 실패 시 비로그인 상태로 진입하고, 사용자가 명시적으로 로그인하도록 한다.

```rust
// lifecycle.rs 추가
BootStage::RestoreAuthSession // 실패 정책: 경고 후 계속
```

---

## 7. Frontend 흐름

- 로그인 화면 → `useLoginMutation` → `authApi.login(credentials)` → `auth_login` invoke.
- 성공 시 `setAuthenticated(true)` + 라우터 이동.
- 앱 시작 시 `app/providers/AuthBootstrap` 에서 `auth_session_check` 또는 `auth_session_restore` 호출 → 결과를 Zustand 에 반영.
- `ERROR_AUTH_EXPIRED` 응답 시 `AuthState::clear()` 결과 emit (`auth-session-cleared`) 를 listen 해서 캐시 무효화.

---

## 8. 보안 체크리스트

| #   | 항목                                                                               | 확인 |
| :-- | :--------------------------------------------------------------------------------- | :--- |
| 1   | 토큰을 Renderer 어떤 store 에도 저장하지 않음 (`grep -r "token" src/` 로 검증)     | □    |
| 2   | 로그인 응답 DTO 의 token 필드를 frontend 에 노출하지 않음 (Rust 에서 분리 후 응답) | □    |
| 3   | 로그 출력에 `{:?}` 로 DTO 전체 덤프 없음 — 식별자만 출력                           | □    |
| 4   | secure store entry 이름이 앱 식별자 prefix 로 격리됨                               | □    |
| 5   | `isAuthenticated` 는 표시용임을 주석 또는 type 으로 명시                           | □    |
| 6   | `auth_logout` 은 emit + `AuthState::clear()` + secure store 삭제 3가지 모두 수행   | □    |

---

## 9. Anti-patterns

| 패턴                                        | 이유                                                |
| ------------------------------------------- | --------------------------------------------------- |
| `localStorage.setItem("token", ...)`        | Renderer XSS 시 즉시 탈취                           |
| Zustand persist 에 access token 저장        | persist middleware 가 `localStorage` 로 직렬화      |
| `tauri-plugin-store` 에 token 저장          | 비민감 설정과 인증 재료 책임이 섞임, 평문 저장 가능 |
| `isAuthenticated === true` 만으로 보안 분기 | Rust session check 결과를 기준으로 판단해야 함      |
| `{:?}` 로 LoginInfo 전체 로그               | token 평문 유출                                     |
| 로그인 응답 DTO 에 raw token 필드 포함      | Rust 가 분리 후 표시 정보만 반환해야 함             |
