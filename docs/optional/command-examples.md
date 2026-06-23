# Optional — Command Examples

> 본 문서는 도메인별 Tauri command 의 **예시 계약**을 모은다.
> 뼈대 단계에는 등록된 command 가 1개(`app_ping` 샘플)뿐이며, 도메인 command 추가 시 본 문서의 패턴을 차용한다.
> 공통 규칙(반환 형태, 에러 표준)은 `docs/tauri-commands.md` 참조.

각 도메인 예시는 그대로 복사해 쓰는 것이 아니라, 본인 앱의 기능에 맞게 command 이름 / Input / Output 타입을 치환한다.

---

## 1. Shared (공통 설정)

| Command            | Input        | Output           | Error codes                                            | Retryable |
| ------------------ | ------------ | ---------------- | ------------------------------------------------------ | --------- |
| `get_user_config`  | -            | `UserConfig`     | `ERROR_CONFIG_LOCK_FAILED`                             | false     |
| `save_user_config` | `UserConfig` | `SuccessPayload` | `ERROR_CONFIG_LOCK_FAILED`, `ERROR_CONFIG_SAVE_FAILED` | true      |

---

## 2. Auth (인증)

> `docs/optional/auth.md` 와 함께 도입.

| Command       | Input          | Output           | Error codes               | Retryable |
| ------------- | -------------- | ---------------- | ------------------------- | --------- |
| `auth_login`  | `LoginRequest` | `LoginInfo`      | `ERROR_AUTH_LOGIN_FAILED` | true      |
| `auth_logout` | -              | `SuccessPayload` | -                         | false     |

---

## 3. Notes (로컬 데이터 CRUD)

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

## 4. File System (로컬 파일 접근)

> 파일을 다루지 않는 앱은 채택하지 않는다.

| Command         | Input              | Output           | Error codes             | Retryable |
| --------------- | ------------------ | ---------------- | ----------------------- | --------- |
| `fs_read_file`  | `{ path: string }` | `FileContent`    | `ERROR_FS_READ_FAILED`  | true      |
| `fs_write_file` | `WriteFileRequest` | `SuccessPayload` | `ERROR_FS_WRITE_FAILED` | true      |
| `fs_list_dir`   | `{ path: string }` | `FileEntry[]`    | `ERROR_FS_LIST_FAILED`  | true      |

---

## 5. System (시스템 연동)

| Command          | Input | Output           | Error codes                   | Retryable |
| ---------------- | ----- | ---------------- | ----------------------------- | --------- |
| `window_restore` | -     | `SuccessPayload` | `ERROR_WINDOW_RESTORE_FAILED` | false     |
| `updater_check`  | -     | `UpdateInfo`     | `ERROR_UPDATER_CHECK_FAILED`  | true      |

---

## 6. 공통 에러 케이스 (도입 시 참조)

| 유형             | 조건                                             | 응답                                                                                     |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Config 잠금 실패 | mutex lock 실패                                  | `{ success: false, error: { code: "ERROR_CONFIG_LOCK_FAILED", retryable: false, ... } }` |
| Config 저장 실패 | 파일 write 실패                                  | `{ success: false, error: { code: "ERROR_CONFIG_SAVE_FAILED", retryable: true, ... } }`  |
| 인증 실패        | 로그인 요청 실패 (인증이 있는 앱만)              | `{ success: false, error: { code: "ERROR_AUTH_LOGIN_FAILED", retryable: true, ... } }`   |
| 리소스 없음      | 존재하지 않는 ID 조회 (노트/문서 등)             | `{ success: false, error: { code: "ERROR_NOTE_NOT_FOUND", retryable: false, ... } }`     |
| 파일 I/O 실패    | 파일 읽기/쓰기 실패                              | `{ success: false, error: { code: "ERROR_FS_READ_FAILED", retryable: true, ... } }`      |
| 외부 API 실패    | HTTP 요청 실패 (`docs/optional/backend-http.md`) | `{ success: false, error: { code: "ERROR_NETWORK_*", retryable: ..., ... } }`            |
| IPC invoke 실패  | Tauri IPC 호출 자체 실패                         | invoke wrapper `catch` 경로 — `AppError` 로 정규화                                       |
