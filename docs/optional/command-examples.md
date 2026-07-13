# Optional — Command Examples

> 본 문서는 도메인별 Tauri command 의 **예시 계약**을 모은다.
> 뼈대 단계에는 등록된 command 가 1개(`app_ping` 샘플)뿐이며, 도메인 command 추가 시 본 문서의 패턴을 차용한다.
> 공통 규칙(반환 형태, 에러 표준)은 `docs/tauri-commands.md` 참조.

각 도메인 예시는 그대로 복사해 쓰는 것이 아니라, 본인 앱의 기능에 맞게 command 이름 / Input / Output 타입을 치환한다.

---

## 1. 새 command 배선 흐름 (계약 우선)

command 하나를 추가할 때는 **타입 계약을 먼저 정의**하고 양끝으로 배선한다. 순서를 지키면 아키텍처 레이어를 건너뛰지 않는다.

```text
1. model      — Rust model.rs 의 Request/Response struct(#[serde(rename_all="camelCase")]) ↔ TS 타입 1:1
2. command    — features/<f>/commands.rs: 얇은 진입점, service 호출 후 IpcResult 포장만
3. service    — 비즈니스 로직 (필요 시 api.rs HTTP / db_pool 접근)
4. error code — features/<f>/config.rs 에 ERROR_<카테고리>_* 상수
5. 등록       — lib.rs 의 generate_handler![] 에 command 추가
6. api        — src/features/<f>/api/<f>Api.ts: command 이름·payload 계약
7. parser     — <f>Parsers.ts: 응답 파싱·AppError 정규화
8. hook/UI    — model/use*.ts → ui/
```

- 이 순서는 `tauri-guide.md §4`(Type Sync)·`§7`(Command Design)의 실행판이다.
- HTTP 가 필요하면 3에서 `docs/optional/backend-http.md`, DB 면 `docs/optional/sqlite.md`, 진행률이면 `docs/optional/events-channels.md` 를 함께 본다.

---

## 2. 뼈대 통합 접점

| 접점                           | 뼈대 현재 상태      | 도입 시 변경                                                |
| :----------------------------- | :------------------ | :---------------------------------------------------------- |
| `lib.rs` (`generate_handler!`) | `app_ping` 만 등록  | 새 command 함수를 handler 목록에 추가                       |
| feature 폴더                   | `app` 샘플          | `features/<f>/{commands,service,(api),(config),(model)}.rs` |
| `config.rs`                    | `ERROR_*`           | `ERROR_<도메인>_*` 상수 (한 도메인=한 카테고리)             |
| 타입 동기                      | `ipc.rs` / `ipc.ts` | `model.rs` ↔ TS 타입 1:1 유지                               |
| 본 문서 / `tauri-commands.md`  | 카탈로그            | 계약이 바뀌면 **먼저** 갱신                                 |

---

## 3. Shared (공통 설정)

| Command       | Input        | Output           | Error codes                                            | Retryable |
| ------------- | ------------ | ---------------- | ------------------------------------------------------ | --------- |
| `config_load` | -            | `UserConfig`     | `ERROR_CONFIG_LOCK_FAILED`                             | false     |
| `config_save` | `UserConfig` | `SuccessPayload` | `ERROR_CONFIG_LOCK_FAILED`, `ERROR_CONFIG_SAVE_FAILED` | true      |

---

## 4. Auth (인증)

> `docs/optional/auth.md` 와 함께 도입.

| Command       | Input          | Output           | Error codes               | Retryable |
| ------------- | -------------- | ---------------- | ------------------------- | --------- |
| `auth_login`  | `LoginRequest` | `LoginInfo`      | `ERROR_AUTH_LOGIN_FAILED` | false     |
| `auth_logout` | -              | `SuccessPayload` | -                         | false     |

---

## 5. Notes (로컬 데이터 CRUD)

> 앱 도메인에 따라 `notes`, `documents`, `bookmarks`, `tasks` 등으로 치환.
> SQLite 사용 시 `docs/optional/sqlite.md` 함께 참조.

| Command        | Input               | Output           | Error codes                 | Retryable |
| -------------- | ------------------- | ---------------- | --------------------------- | --------- |
| `notes_list`   | `NoteListRequest`   | `NoteItem[]`     | `ERROR_NOTES_LIST_FAILED`   | true      |
| `notes_get`    | `{ id: string }`    | `NoteDetail`     | `ERROR_NOTE_NOT_FOUND`      | false     |
| `notes_create` | `CreateNoteRequest` | `NoteItem`       | `ERROR_NOTES_CREATE_FAILED` | true      |
| `notes_update` | `UpdateNoteRequest` | `NoteItem`       | `ERROR_NOTES_UPDATE_FAILED` | true      |
| `notes_delete` | `{ id: string }`    | `SuccessPayload` | `ERROR_NOTE_NOT_FOUND`      | false     |

---

## 6. File System (로컬 파일 접근)

> 파일을 다루지 않는 앱은 채택하지 않는다.

| Command         | Input              | Output           | Error codes             | Retryable |
| --------------- | ------------------ | ---------------- | ----------------------- | --------- |
| `fs_read_file`  | `{ path: string }` | `FileContent`    | `ERROR_FS_READ_FAILED`  | true      |
| `fs_write_file` | `WriteFileRequest` | `SuccessPayload` | `ERROR_FS_WRITE_FAILED` | true      |
| `fs_list_dir`   | `{ path: string }` | `FileEntry[]`    | `ERROR_FS_LIST_FAILED`  | true      |

---

## 7. System (시스템 연동)

| Command          | Input | Output           | Error codes                   | Retryable |
| ---------------- | ----- | ---------------- | ----------------------------- | --------- |
| `window_restore` | -     | `SuccessPayload` | `ERROR_WINDOW_RESTORE_FAILED` | false     |
| `updater_check`  | -     | `UpdateInfo`     | `ERROR_UPDATER_CHECK_FAILED`  | true      |

---

## 8. 공통 에러 케이스 (도입 시 참조)

| 유형             | 조건                                             | 응답                                                                                     |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Config 잠금 실패 | mutex lock 실패                                  | `{ success: false, error: { code: "ERROR_CONFIG_LOCK_FAILED", retryable: false, ... } }` |
| Config 저장 실패 | 파일 write 실패                                  | `{ success: false, error: { code: "ERROR_CONFIG_SAVE_FAILED", retryable: true, ... } }`  |
| 인증 실패        | 로그인 요청 실패 (인증이 있는 앱만)              | `{ success: false, error: { code: "ERROR_AUTH_LOGIN_FAILED", retryable: false, ... } }`  |
| 리소스 없음      | 존재하지 않는 ID 조회 (노트/문서 등)             | `{ success: false, error: { code: "ERROR_NOTE_NOT_FOUND", retryable: false, ... } }`     |
| 파일 I/O 실패    | 파일 읽기/쓰기 실패                              | `{ success: false, error: { code: "ERROR_FS_READ_FAILED", retryable: true, ... } }`      |
| 외부 API 실패    | HTTP 요청 실패 (`docs/optional/backend-http.md`) | `{ success: false, error: { code: "ERROR_NETWORK_*", retryable: ..., ... } }`            |
| IPC invoke 실패  | Tauri IPC 호출 자체 실패                         | invoke wrapper `catch` 경로 — `AppError` 로 정규화                                       |

---

## 9. 안티패턴 · 경계 주의

| 패턴                                    | 이유 / 올바른 방향                                          |
| :-------------------------------------- | :---------------------------------------------------------- |
| 입력 필드를 primitive 파라미터로 나열   | 계약 취약 → Request struct model 우선 (`tauri-guide.md §7`) |
| `generate_handler!` 등록 누락           | 런타임에 command not found → 5단계에서 반드시 등록          |
| 한 도메인이 여러 `ERROR_` 카테고리 혼용 | 분류 붕괴 → 한 도메인 = 한 카테고리                         |
| 예시 표를 이름·타입 치환 없이 복붙      | 앱 도메인 불일치 → 기능에 맞게 command/Input/Output 치환    |
| 계약 변경 후 문서 미갱신                | 문서·구현 drift → 본 문서/`tauri-commands.md` 를 먼저 갱신  |
| 응답 파싱을 컴포넌트/hook 에서 처리     | 레이어 위반 → `<f>Parsers.ts` 에서 파싱·정규화              |
