# Optional — Notification & Deep Link

> 도입 시점: OS 알림을 띄우거나, 커스텀 URL 스킴/유니버설 링크로 앱을 여는 시점.
> 뼈대 단계에서는 사용하지 않는다.

두 기능은 독립적이지만 모바일 포함 앱에서 함께 자주 쓰여(예: 알림 탭 → 딥링크 진입) 한 문서로 묶는다.

---

## 1. Notification

`tauri-plugin-notification` — 데스크톱·모바일 공통. 권한 요청 흐름이 있다.

```ts
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export async function notify(title: string, body: string) {
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (granted) sendNotification({ title, body });
}
```

```rust
// 등록
.plugin(tauri_plugin_notification::init())
```

capability: `notification:default`.

---

## 2. Deep Link

`tauri-plugin-deep-link` — 커스텀 스킴(`myapp://...`) 또는 OS 연결. OAuth 콜백·"외부에서 앱 열기" 에 쓴다.

### 2.1 tauri.conf.json

```json
{
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["myapp"]
      }
    }
  }
}
```

모바일은 associated domains(iOS) / intent filter(Android) 설정이 추가로 필요하다 — 플러그인 공식 문서의 모바일 절을 따른다.

### 2.2 등록 + single-instance 동반 (데스크톱)

데스크톱에서는 이미 실행 중인 인스턴스로 링크를 전달해야 하므로 `tauri-plugin-single-instance` 를 **가장 먼저** 등록한다.

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, argv, _cwd| {
            // 런타임 스킴 등록 시 여기서 argv 의 딥링크도 처리한다
            log::info!("[deep-link] new instance: {argv:?}");
        }));
    }

    builder = builder.plugin(tauri_plugin_deep_link::init());
    // ... 나머지 체인
}
```

### 2.3 Frontend 수신

```ts
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

const unlisten = await onOpenUrl((urls) => {
  // 예: OAuth 콜백 파싱 → 라우팅
  console.log("opened via deep link:", urls);
});
// cleanup: useEffect return 에서 unlisten()
```

리스너는 raw URL 을 그대로 신뢰하지 말고 파싱·검증 후 사용한다.

> **cold-start 처리**: `onOpenUrl` 은 앱이 **이미 실행 중**일 때 오는 링크를 받는다. 링크로 앱이 처음 켜진 경우(cold-start)의 시작 URL 은 `getCurrent()` 로 별도 조회해야 누락되지 않는다.
>
> ```ts
> import { getCurrent } from "@tauri-apps/plugin-deep-link";
> const startUrls = await getCurrent(); // 앱을 띄운 링크(없으면 null)
> ```

### 2.4 capability

딥링크 이벤트 수신에는 보통 `core:event:default` 가 함께 필요하다. 모바일은 별도 capability 파일(`platforms: ["iOS", "android"]`)로 분리한다.

```jsonc
"core:event:default",
"deep-link:default"
```

---

## 3. 아키텍처 위치 · End-to-end 흐름

두 기능 모두 IPC 경계이므로 component 가 직접 호출·수신하지 않고 feature api/hook 을 거친다. 딥링크는 등록 순서(single-instance 최우선)와 cold-start 처리가 관건이다.

```text
[알림]
Component → useNotify hook → api
  → isPermissionGranted() / requestPermission() → sendNotification()

[딥링크] OS 가 myapp:// 링크 오픈
  → (앱 실행 중)   single-instance 콜백에 argv 전달 → 기존 창 포커스 + 링크 처리
                   onOpenUrl(urls) 리스너 → 파싱·검증 → 라우팅
  → (cold-start)   getCurrent() 로 앱을 띄운 시작 링크 조회
등록: single-instance 를 가장 먼저(§2.2), deep-link 다음.
```

---

## 4. 뼈대 통합 접점

| 접점                        | 뼈대 현재 상태          | 도입 시 변경                                                           |
| :-------------------------- | :---------------------- | :--------------------------------------------------------------------- |
| `lib.rs` builder            | log plugin + `app_ping` | single-instance(첫, `#[cfg(desktop)]`) → deep-link → notification 등록 |
| `tauri.conf.json`           | 기본                    | (딥링크) `plugins.deep-link.desktop.schemes`                           |
| `capabilities/default.json` | `core:default`          | `notification:default` / `deep-link:default` + `core:event:default`    |
| 모바일 설정                 | —                       | associated domains(iOS) / intent filter(Android), 별도 capability 파일 |
| feature 폴더                | `app` 샘플              | 알림·딥링크 호출/수신을 feature `api`/hook 경유                        |

---

## 5. 안티패턴 · 경계 주의

| 패턴                                      | 이유 / 올바른 방향                                         |
| :---------------------------------------- | :--------------------------------------------------------- |
| deep link URL 을 검증 없이 신뢰           | 위조 콜백·주입 → 파싱·검증(스킴·host·state) 후 사용        |
| single-instance 를 누락/나중에 등록       | 2차 실행 링크 유실·중복 창 → **첫 plugin** 으로 등록       |
| cold-start 링크를 `onOpenUrl` 로만 처리   | 시작 링크 누락 → `getCurrent()` 병행 (§2.3)                |
| 권한 확인 없이 `sendNotification` 호출    | 무음 실패 → `isPermissionGranted`/`requestPermission` 흐름 |
| single-instance 콜백에서 `println!` 로깅  | 규약 위반 → `log::info!` (`coding-rules.md §13`)           |
| component 에서 알림/딥링크 직접 호출·수신 | 레이어 위반 → feature `api`/hook 경유                      |

---

## 6. 도입 체크리스트

| #   | 항목                                                                          | 확인 |
| :-- | :---------------------------------------------------------------------------- | :--- |
| 1   | (알림) `tauri-plugin-notification` + `@tauri-apps/plugin-notification`        | □    |
| 2   | (알림) capability `notification:default`, 권한 요청 흐름 구현                 | □    |
| 3   | (딥링크) `tauri-plugin-deep-link` + `@tauri-apps/plugin-deep-link`            | □    |
| 4   | (딥링크) `tauri.conf.json` 에 `desktop.schemes` 등록                          | □    |
| 5   | (딥링크) 데스크톱은 `tauri-plugin-single-instance` 를 **첫 plugin** 으로 등록 | □    |
| 6   | (딥링크) capability `deep-link:default` + `core:event:default`                | □    |
| 7   | (딥링크) 모바일은 associated domains / intent filter 추가 설정                | □    |
| 8   | 알림/딥링크 호출·수신을 feature API/hook 으로 감싸 component 분리             | □    |
