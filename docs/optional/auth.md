# Optional — Auth & Secure Store

> 도입 시점: 로그인·세션 관리·인증 토큰을 다뤄야 하는 시점.
> 뼈대 단계에서는 사용하지 않는다.

이 문서는 인증 도메인 추가 시의 규칙·계약·저장 전략을 정리한다. `docs/optional/backend-http.md` (토큰을 첨부하는 HTTP client) 와 함께 도입한다.

---

## 1. 책임 분리

| 데이터                          | 위치                                                     | 이유                                |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| access token (단기)             | Rust `AppState` 메모리 (Mutex)                           | 재시작 시 무효해도 무방             |
| refresh token (장기, 복원 필요) | Rust secure store                                        | OS 보안 저장소 (keychain 등) 사용   |
| `isAuthenticated` (UI 표시용)   | Zustand store (`docs/optional/server-state.md`)          | UI 분기 표시. 보안 판정에 사용 금지 |
| 로그인 응답 원문 (DTO)          | 어디에도 persist 안함                                    | 토큰 유출 위험                      |
| 사용자 프로필 (이름, 사진 등)   | Renderer cache (TanStack Query) 또는 Zustand non-persist | 비민감 표시 정보                    |

**금지**: 토큰을 `localStorage` / `sessionStorage` / `tauri-plugin-store` / Zustand persist 에 저장.

---

## 2. Backend 구조 (`src-tauri/src/features/auth/`)

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

---

## 3. Command 계약

| Command                | Input          | Output           | Error codes                                       | Retryable |
| ---------------------- | -------------- | ---------------- | ------------------------------------------------- | --------- |
| `auth_login`           | `LoginRequest` | `LoginInfo`      | `ERROR_AUTH_LOGIN_FAILED`, `ERROR_NETWORK_*`      | true      |
| `auth_logout`          | -              | `SuccessPayload` | -                                                 | false     |
| `auth_session_check`   | -              | `SessionInfo`    | `ERROR_AUTH_EXPIRED`                              | false     |
| `auth_session_restore` | -              | `SessionInfo`    | `ERROR_AUTH_EXPIRED`, `ERROR_AUTH_RESTORE_FAILED` | false     |

응답 DTO 에 raw token 을 포함하지 않는다 (사용자 식별자·표시 이름·만료 시각 등만).

---

## 4. 부트 시 세션 복원

`BootStage::PrepareState` 다음 단계에서 secure store 의 refresh token 으로 session 을 시도 복원한다. 실패 시 비로그인 상태로 진입하고, 사용자가 명시적으로 로그인하도록 한다.

```rust
// lifecycle.rs 추가
BootStage::RestoreAuthSession // 실패 정책: 경고 후 계속
```

---

## 5. Frontend 흐름

- 로그인 화면 → `useLoginMutation` → `authApi.login(credentials)` → `auth_login` invoke.
- 성공 시 `setAuthenticated(true)` + 라우터 이동.
- 앱 시작 시 `app/providers/AuthBootstrap` 에서 `auth_session_check` 또는 `auth_session_restore` 호출 → 결과를 Zustand 에 반영.
- `ERROR_AUTH_EXPIRED` 응답 시 `AuthState::clear()` 결과 emit (`auth-session-cleared`) 를 listen 해서 캐시 무효화.

---

## 6. 보안 체크리스트

| #   | 항목                                                                               | 확인 |
| :-- | :--------------------------------------------------------------------------------- | :--- |
| 1   | 토큰을 Renderer 어떤 store 에도 저장하지 않음 (`grep -r "token" src/` 로 검증)     | □    |
| 2   | 로그인 응답 DTO 의 token 필드를 frontend 에 노출하지 않음 (Rust 에서 분리 후 응답) | □    |
| 3   | 로그 출력에 `{:?}` 로 DTO 전체 덤프 없음 — 식별자만 출력                           | □    |
| 4   | secure store entry 이름이 앱 식별자 prefix 로 격리됨                               | □    |
| 5   | `isAuthenticated` 는 표시용임을 주석 또는 type 으로 명시                           | □    |
| 6   | `auth_logout` 은 emit + `AuthState::clear()` + secure store 삭제 3가지 모두 수행   | □    |

---

## 7. Anti-patterns

| 패턴                                        | 이유                                                |
| ------------------------------------------- | --------------------------------------------------- |
| `localStorage.setItem("token", ...)`        | Renderer XSS 시 즉시 탈취                           |
| Zustand persist 에 access token 저장        | persist middleware 가 `localStorage` 로 직렬화      |
| `tauri-plugin-store` 에 token 저장          | 비민감 설정과 인증 재료 책임이 섞임, 평문 저장 가능 |
| `isAuthenticated === true` 만으로 보안 분기 | Rust session check 결과를 기준으로 판단해야 함      |
| `{:?}` 로 LoginInfo 전체 로그               | token 평문 유출                                     |
