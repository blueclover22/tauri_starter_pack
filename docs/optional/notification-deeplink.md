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
            println!("new instance: {argv:?}");
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

### 2.4 capability

딥링크 이벤트 수신에는 보통 `core:event:default` 가 함께 필요하다. 모바일은 별도 capability 파일(`platforms: ["iOS", "android"]`)로 분리한다.

```jsonc
"core:event:default",
"deep-link:default"
```

---

## 3. 도입 체크리스트

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
