# Optional — Mobile 빌드 (iOS / Android)

> 도입 시점: 모바일(iOS/Android) 빌드를 도입할 때.

Tauri v2 는 동일 코드베이스에서 데스크톱·모바일을 함께 빌드한다.

---

## 1. `Cargo.toml` 필수 설정

```toml
[lib]
name = "app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

`staticlib` / `cdylib` 가 모바일 (iOS / Android) 빌드의 필수 출력이다. `rlib` 는 데스크톱·내부 의존성용.

---

## 2. `src/lib.rs` 의 mobile entry point

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 빌더 체인
}
```

`src/main.rs` 는 데스크톱 entry 로 `app_lib::run()` 만 호출한다. 모바일 빌드에서는 `lib.rs` 의 `run()` 이 entry 가 된다.

---

## 3. 초기화 / 빌드 명령

| 작업                | 명령                       |
| :------------------ | :------------------------- |
| Android 초기화      | `pnpm tauri android init`  |
| iOS 초기화          | `pnpm tauri ios init`      |
| Android 개발 실행   | `pnpm tauri android dev`   |
| iOS 개발 실행       | `pnpm tauri ios dev`       |
| Android 릴리스 빌드 | `pnpm tauri android build` |
| iOS 릴리스 빌드     | `pnpm tauri ios build`     |

초기화로 생성되는 `src-tauri/gen/android/` , `src-tauri/gen/apple/` 디렉토리는 커밋 대상이다. 공식 서명·딥링크 가이드가 이 디렉토리 안의 파일(`build.gradle.kts`, intent filter 등)을 직접 수정하도록 안내하기 때문이다. 단 keystore 파일(`*.jks`, `*.keystore`, `keystore.properties`)은 `.gitignore` 로 제외한다.

---

## 4. 모바일 사전 요구사항

| 플랫폼  | 요구                                                                                                                                                |
| :------ | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android | Android Studio + SDK + NDK + `JAVA_HOME` / `ANDROID_HOME` / `NDK_HOME` 환경 변수 + rustup Android target (`aarch64-linux-android` 등)               |
| iOS     | Xcode **전체**(Command Line Tools 만으로는 불충분) + CocoaPods + rustup iOS target (`aarch64-apple-ios` 등) + Apple Developer 계정 (실기기 배포 시) |

상세 환경 setup 은 [README "구동 준비"](../../README.md#구동-준비) 의 4(Android)·5(iOS)절과 [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/) 참조.

---

## 5. 모바일 한정 plugin 제약

일부 plugin (예: `tauri-plugin-window-state`) 은 데스크톱 전용이다. plugin 의 `cfg` 분기로 모바일에서는 제외한다.

```rust
#[cfg(desktop)]
builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
```

Cargo 의존성도 데스크톱 타깃으로 한정해 모바일 빌드에서 제외한다.

```toml
# Cargo.toml
[target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]
tauri-plugin-window-state = "2"
```

---

## 6. Anti-patterns

| 패턴                                            | 이유             |
| ----------------------------------------------- | ---------------- |
| `[lib]` crate-type 에 `cdylib`/`staticlib` 누락 | 모바일 빌드 불가 |
