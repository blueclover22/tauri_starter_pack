# Optional — Dialog & File System

> 도입 시점: 네이티브 파일 열기/저장 다이얼로그, 또는 사용자가 선택한 파일을 읽고 써야 하는 시점.
> 뼈대 단계에서는 사용하지 않는다.

`tauri-plugin-dialog`(네이티브 다이얼로그) + `tauri-plugin-fs`(파일 접근) 조합으로 구성한다.

---

## 1. 아키텍처 위치 · End-to-end 흐름

이 플러그인은 **"사용자가 명시적으로 고른 파일"** 에만 쓴다. 앱 내부 데이터(설정/DB)는 이 경로가 아니라 command(store/SQLite) 로 접근한다(§3). dialog/fs 호출은 IPC 경계이므로 component 가 아니라 feature api/hook 을 거친다.

```text
Component → useFilePicker hook → api/fileApi.ts
  → dialog.open() / dialog.save()      # 사용자 선택 경로(string) 또는 null(취소)
  → fs.readTextFile(path) / fs.writeTextFile(target)
  → 결과를 hook 로컬 state 로
```

- `fs` 접근 가능 경로는 **capability scope** 로 제한된다(§6). 다이얼로그로 고른 임의 경로처럼 런타임에 결정되는 접근을 재실행 후에도 기억하려면 `tauri-plugin-persisted-scope` 를 함께 쓴다.
- 사용자 취소(`open()`/`save()` 가 `null`)를 항상 분기 처리한다.

---

## 2. 뼈대 통합 접점

| 접점                        | 뼈대 현재 상태          | 도입 시 변경                                                              |
| :-------------------------- | :---------------------- | :------------------------------------------------------------------------ |
| `lib.rs` builder            | log plugin + `app_ping` | `dialog` → `fs` → (`persisted-scope`) plugin 등록 (fs 를 scope 보다 먼저) |
| `capabilities/default.json` | `core:default`          | `dialog:default` + 필요한 `fs:*` 만 + `fs:scope`                          |
| feature 폴더                | `app` 샘플              | `features/<f>/api` 가 dialog/fs 호출, hook 경유                           |
| `AppState`/`BootStage`      | —                       | **변경 없음** (frontend plugin JS API)                                    |

---

## 3. 접근 경로 결정 (중요)

| 데이터 성격                          | 권장 경로                                                                  |
| :----------------------------------- | :------------------------------------------------------------------------- |
| 앱이 관리하는 내부 데이터 (설정/DB)  | **Rust command 경유** (`tauri-plugin-store` / SQLite) — fs 직접 접근 안 함 |
| 사용자가 다이얼로그로 고른 임의 파일 | `tauri-plugin-dialog` 로 경로 획득 → `tauri-plugin-fs` 로 read/write       |

즉 본 플러그인은 "사용자가 명시적으로 고른 파일" 에 쓴다. 앱 내부 데이터까지 fs 플러그인으로 노출하지 않는다 (architecture.md §16 anti-pattern 과 정합).

---

## 4. Dialog

```ts
import { open, save, ask } from "@tauri-apps/plugin-dialog";

// 열기
const path = await open({
  multiple: false,
  filters: [{ name: "Image", extensions: ["png", "jpeg"] }],
});

// 저장
const target = await save({
  filters: [{ name: "Image", extensions: ["png"] }],
});

// 확인 다이얼로그
const yes = await ask("정말 삭제할까요?", { title: "확인", kind: "warning" });
```

`open`/`save`/`message`/`ask`/`confirm` 모두 IPC 경계이므로 feature `api/` 에서 호출하고 component 는 hook 을 통해 사용한다.

---

## 5. FS (scoped 접근)

```ts
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const content = await readTextFile(path);
await writeTextFile(target, content);
```

`tauri-plugin-fs` 는 **capability scope 로 접근 가능 경로를 제한**한다. 사용자가 다이얼로그로 고른 경로처럼 런타임에 결정되는 접근을 기억하려면 `tauri-plugin-persisted-scope` 를 함께 쓴다 (fs 를 persisted-scope **보다 먼저** 등록).

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())             // persisted-scope 보다 먼저
    .plugin(tauri_plugin_persisted_scope::init())
```

---

## 6. capability

```jsonc
// capabilities/default.json permissions 에 추가
"dialog:default",
"fs:default",
// 필요한 동작만 (최소 권한) — 예시
"fs:allow-read-text-file",
"fs:allow-write-text-file"
```

`fs:scope` 로 허용 경로 패턴을 좁히고, 전체 디스크 접근 권한(`fs:allow-*` 무제한)은 부여하지 않는다.

---

## 7. 안티패턴 · 경계 주의

| 패턴                                   | 이유 / 올바른 방향                                      |
| :------------------------------------- | :------------------------------------------------------ |
| 앱 내부 데이터(설정/DB)를 fs 로 접근   | 계약·보안 우회 → command(store/SQLite) 경유 (§3)        |
| `fs:allow-*` 를 무제한으로 부여        | 전체 디스크 노출 → `fs:scope` 로 경로 패턴 제한         |
| `persisted-scope` 를 fs 보다 먼저 등록 | scope 확장이 동작하지 않음 → **fs 를 먼저** 등록        |
| component 에서 dialog/fs 직접 호출     | 레이어 위반 → feature `api/` + hook 경유                |
| 사용자 선택 경로를 검증 없이 신뢰      | 경로 조작·확장자 위장 → 정규화·확장자·크기 확인 후 사용 |
| `open()`/`save()` 취소(`null`) 미처리  | 런타임 오류 → `null` 분기 필수                          |

---

## 8. 도입 체크리스트

| #   | 항목                                                                   | 확인 |
| :-- | :--------------------------------------------------------------------- | :--- |
| 1   | `tauri-plugin-dialog` + `tauri-plugin-fs` 의존성 추가                  | □    |
| 2   | `@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs` 설치             | □    |
| 3   | (런타임 scope 유지 필요 시) `tauri-plugin-persisted-scope` 추가, fs 뒤 | □    |
| 4   | capability 에 `dialog:default` + 필요한 `fs:*` 만 (최소 권한)          | □    |
| 5   | `fs:scope` 로 접근 경로 제한, 무제한 디스크 접근 금지                  | □    |
| 6   | dialog/fs 호출을 feature API/hook 으로 감싸 component 분리             | □    |
| 7   | 앱 내부 데이터는 fs 가 아니라 command(store/SQLite) 경유 유지          | □    |
