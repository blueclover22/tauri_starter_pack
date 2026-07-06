# Optional — Auto Updater

> 도입 시점: 데스크톱 앱을 배포하고 자동 업데이트를 제공해야 하는 시점.
> 모바일은 앱스토어를 통해 업데이트하므로 본 플러그인은 **데스크톱 전용**(`#[cfg(desktop)]`)이다.
> 뼈대 단계에서는 사용하지 않는다.

`tauri-plugin-updater`(확인·다운로드·설치) + `tauri-plugin-process`(설치 후 재시작) 조합으로 구성한다.

---

## 1. 아키텍처 위치 · End-to-end 흐름

업데이트는 데스크톱 전용 도메인 feature(예: `features/app-update/`)로 감싼다. `check()` / `downloadAndInstall()` / `relaunch()` 는 모두 IPC 경계이므로 component 가 직접 호출하지 않고 api/hook 을 거친다(아키텍처 규칙).

```text
Component → useUpdate hook → api/updateApi.ts
  → check()                          # endpoint 조회
      · 새 버전 없음 → 종료(null)
      · 새 버전 있음 → update 객체
  → downloadAndInstall(onProgress)   # Started/Progress/Finished 이벤트
      → 진행률을 hook 로컬 state 로 노출
  → relaunch()                       # tauri-plugin-process
```

- 업데이트 서버는 endpoint 에서 **새 버전이 없으면 204**, 있으면 `latest.json`(버전·서명·플랫폼별 다운로드 URL)을 반환한다.
- 서명 검증은 plugin 이 `pubkey` 로 자동 수행한다 — 검증 실패한 패키지는 설치되지 않는다.

---

## 2. 뼈대 통합 접점

| 접점                        | 뼈대 현재 상태          | 도입 시 변경                                                        |
| :-------------------------- | :---------------------- | :------------------------------------------------------------------ |
| `lib.rs` builder            | log plugin + `app_ping` | `#[cfg(desktop)]` 로 `updater` + `process` plugin 등록              |
| `tauri.conf.json`           | 기본                    | `bundle.createUpdaterArtifacts`, `plugins.updater.pubkey/endpoints` |
| `capabilities/default.json` | `core:default`          | `updater:default` + `process:default`                               |
| CI / 서명                   | —                       | `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` 를 env(시크릿)로 주입        |
| feature 폴더                | `app` 샘플              | `features/app-update/` (api + hook)                                 |
| 플랫폼                      | desktop + mobile        | 모바일은 스토어 업데이트 — plugin 을 `#[cfg(desktop)]` 로 제외      |

---

## 3. 서명 키 생성

업데이트 패키지는 서명이 필수다. 키를 한 번 생성한다.

```sh
pnpm tauri signer generate -w ~/.tauri/myapp.key
```

- **공개키**: `tauri.conf.json` 의 `plugins.updater.pubkey` 에 넣는다.
- **비공개키 + 패스워드**: 빌드 시 환경 변수로만 전달한다 (저장소에 커밋 금지).
  - `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

---

## 4. tauri.conf.json

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "PUBLICKEY.PEM 내용",
      "endpoints": [
        "https://releases.myapp.com/{{target}}/{{arch}}/{{current_version}}",
        "https://github.com/user/repo/releases/latest/download/latest.json"
      ]
    }
  }
}
```

`{{target}}` / `{{arch}}` / `{{current_version}}` 는 런타임에 치환된다. 서버는 새 버전이 없으면 204, 있으면 버전·서명·다운로드 URL JSON 을 반환한다.

---

## 5. 등록 (lib.rs)

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_process::init());

    let builder = {
        #[cfg(desktop)]
        let b = builder.plugin(tauri_plugin_updater::Builder::new().build());
        #[cfg(not(desktop))]
        let b = builder;
        b
    };

    builder
        // ...
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

> 본 스타터의 `lib.rs` 는 `build(ctx)?.run(...)` 패턴이므로, 위 plugin 등록을 기존 builder 체인에 합친다.

---

## 6. Frontend 흐름

업데이트 확인·설치는 도메인 feature(예: `features/app-update/`)의 API/hook 으로 감싼다. component 직접 호출 금지(아키텍처 규칙).

```ts
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function runUpdateFlow(onProgress?: (downloaded: number, total: number) => void) {
  const update = await check();
  if (!update) return false;

  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") total = event.data.contentLength ?? 0;
    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.(downloaded, total);
    }
  });

  await relaunch();
  return true;
}
```

`check()` / `downloadAndInstall()` 은 IPC 경계이므로 `features/<feature>/api/` 에 두고, 진행률은 hook 의 로컬 state 로 노출한다.

---

## 7. capability

```jsonc
// capabilities/default.json permissions 에 추가
"updater:default",
"process:default"
```

---

## 8. 안티패턴 · 경계 주의

| 패턴                                            | 이유 / 올바른 방향                                           |
| :---------------------------------------------- | :----------------------------------------------------------- |
| 비공개 서명 키/패스워드를 저장소에 커밋         | 키 유출 시 위조 업데이트 배포 가능 → env(CI 시크릿)로만 주입 |
| component 에서 `check()`/`relaunch()` 직접 호출 | 레이어 위반 → `features/<f>/api` + hook 경유                 |
| updater plugin 을 모바일에도 등록               | 스토어 정책 위반·불필요 → `#[cfg(desktop)]` 분기             |
| `bundle.createUpdaterArtifacts` 누락            | 서명 아티팩트·`latest.json` 미생성 → 업데이트 자체 불가      |
| `pubkey` 누락/키 불일치                         | 서명 검증 실패로 설치 거부                                   |
| `check()` 의 "새 버전 없음(null/204)" 미처리    | 흐름 오류 → `!update` 분기로 조기 종료                       |

---

## 9. 도입 체크리스트

| #   | 항목                                                             | 확인 |
| :-- | :--------------------------------------------------------------- | :--- |
| 1   | `tauri-plugin-updater` + `tauri-plugin-process` 의존성 추가      | □    |
| 2   | `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` 설치 | □    |
| 3   | `pnpm tauri signer generate` 로 키 생성, 공개키를 conf 에 등록   | □    |
| 4   | 비공개키/패스워드를 CI 시크릿(환경 변수)으로만 주입              | □    |
| 5   | `bundle.createUpdaterArtifacts: true` 설정                       | □    |
| 6   | updater plugin 을 `#[cfg(desktop)]` 로 등록                      | □    |
| 7   | capability 에 `updater:default` + `process:default` 추가         | □    |
| 8   | 업데이트 확인/설치를 feature API/hook 으로 감싸 component 분리   | □    |
