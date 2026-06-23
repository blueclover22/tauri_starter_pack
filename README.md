# TAURI_STARTER_PACK

Tauri v2 + React + TypeScript + Tailwind v4 기반 데스크톱·모바일 앱 스타터.
"기능 없는 뼈대" 까지 미리 구현되어 있으며, 아키텍처·코드 규칙 문서를 따라 도메인 기능을 추가해 나가는 것을 전제로 한다.

---

## 사용 방법 (이 스타터로 새 프로젝트 시작하기)

1. 이 디렉토리를 새 프로젝트 위치로 복사한다.
2. 기존 `.git/` 을 제거하고 `git init` 으로 새 저장소를 초기화한다.
3. 만들려는 내용을 `.claude/design/init.md` 에 자유롭게 작성한다 (작성 예시: `.claude/design/example/ex_init.md`).
4. 구현이 참고할 자료(이미지·API 명세·기존 코드 일부 등)가 있으면 `.claude/reference/` 하위에 둔다.
5. AI 에이전트에게 "구현 시작" 을 지시하면 `.claude/CLAUDE.md` 의 구동 순서에 따라 설계서 작성 → 구현이 진행된다.

> **참고** — 이 스타터의 규칙(`docs/`·`.claude/CLAUDE.md`)은 **초기 구현에 맞춰** 설정되어 있다. 유지보수 단계로 넘어가면 프로젝트 상황에 맞게 규칙을 검토·수정해 사용한다.

---

## 문서 구조

| 경로                                     | 내용                                                       |
| :--------------------------------------- | :--------------------------------------------------------- |
| `docs/architecture.md`                   | 폴더 구조·도메인 슬라이스·공용 contract                    |
| `docs/tauri-guide.md`                    | IPC wrapper·command 설계·Ok-Only·capability·logging·모바일 |
| `docs/tauri-commands.md`                 | command 계약 공통 규칙 + 샘플                              |
| `docs/coding-rules.md`                   | 코드 작성 규칙                                             |
| `docs/optional/server-state.md`          | (도입 시) TanStack Query / Zustand / Zod                   |
| `docs/optional/backend-http.md`          | (도입 시) reqwest HttpClient                               |
| `docs/optional/auth.md`                  | (도입 시) 인증·secure store                                |
| `docs/optional/sqlite.md`                | (도입 시) SQLite 로컬 DB                                   |
| `docs/optional/events-channels.md`       | (도입 시) emit/listen, Channel<T>                          |
| `docs/optional/command-examples.md`      | (도입 시) 도메인 command 예시 모음                         |
| `docs/optional/updater.md`               | (도입 시) 자동 업데이트 (데스크톱)                         |
| `docs/optional/dialog-fs.md`             | (도입 시) 파일 다이얼로그·파일 접근                        |
| `docs/optional/notification-deeplink.md` | (도입 시) 알림·딥링크                                      |
| `docs/optional/desktop-ux.md`            | (도입 시) 트레이·창 상태·단일 인스턴스·opener              |
| `.claude/CLAUDE.md`                      | AI 에이전트 작업 규칙 (구동 순서, 참조 문서)               |
| `AGENTS.md`                              | 외부 AI 에이전트 진입점 (CLAUDE.md 를 SSOT 로 가리킴)      |

---

## 구동 준비

### 0. 공통

- **Node.js 24 (LTS)**: <https://nodejs.org/>
- **pnpm**: `npm install -g pnpm` 또는 <https://pnpm.io/installation>
- **Rust (rustup)**: <https://www.rust-lang.org/tools/install>
- 의존성 설치: `pnpm install`

### 1. Windows (데스크톱)

- **Visual Studio Build Tools** — "Desktop development with C++" 워크로드 필요
  - 다운로드: <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
- **WebView2** — Windows 10/11 에 기본 설치되어 있음. 누락 시 Tauri CLI 가 안내.

### 2. macOS (데스크톱)

- **Xcode Command Line Tools**: `xcode-select --install`

### 3. Linux (데스크톱)

- WebKitGTK 등 시스템 의존성 설치 필요 — 배포판별 명령은 [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) 참조.

### 4. Android

- **Android Studio** 설치 + 다음 SDK Manager 항목:
  - Android SDK (API 33 이상 권장)
  - Android SDK Platform-Tools
  - Android NDK (LTS)
- **JDK 17** (또는 Android Studio 번들 JDK)
- 환경 변수 설정:
  - `ANDROID_HOME` → SDK 경로
  - `NDK_HOME` → NDK 경로 (`$ANDROID_HOME/ndk/<버전>`)
  - `JAVA_HOME` → JDK 경로
- Rust Android target 추가:
  ```sh
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```
- 최초 1회 프로젝트 초기화:
  ```sh
  pnpm tauri android init
  ```

### 5. iOS

- **Xcode** (App Store) + **Command Line Tools**
- **CocoaPods**: `brew install cocoapods` 또는 `sudo gem install cocoapods`
- (실기기 배포 시) **Apple Developer Program** 계정
- Rust iOS target 추가:
  ```sh
  rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
  ```
- 최초 1회 프로젝트 초기화:
  ```sh
  pnpm tauri ios init
  ```

상세는 [Tauri v2 모바일 prerequisites](https://v2.tauri.app/start/prerequisites/) 참조.

---

## 프로젝트 실행 (개발 모드)

### 0. 공통

- 의존성 설치 (최초 1회): `pnpm install`

### 1. Windows / macOS / Linux (데스크톱)

```sh
pnpm tauri dev
```

### 2. Android

```sh
pnpm tauri android dev
```

- 실기기 또는 에뮬레이터가 연결되어 있어야 한다 (`adb devices` 로 확인).

### 3. iOS

```sh
pnpm tauri ios dev
```

- 시뮬레이터에서 실행하려면 Xcode 의 Simulator 가 미리 부팅되어 있어야 한다.

---

## 실행 파일 빌드 (릴리스)

### 1. Windows / macOS / Linux (데스크톱)

```sh
pnpm tauri build
```

- 결과물: `src-tauri/target/release/bundle/` 하위.

### 2. Android

```sh
pnpm tauri android build
```

- 결과물: `src-tauri/gen/android/app/build/outputs/` 하위 `.apk` / `.aab`.

### 3. iOS

```sh
pnpm tauri ios build
```

- 결과물: `src-tauri/gen/apple/` 하위. 배포는 Xcode Organizer 를 통해 진행.

---

## 검증 명령

| 단계            | 명령                |
| :-------------- | :------------------ |
| 타입 체크       | `pnpm typecheck`    |
| 린트            | `pnpm lint`         |
| 테스트          | `pnpm test`         |
| 빌드 (frontend) | `pnpm build`        |
| 빌드 (desktop)  | `pnpm tauri build`  |
| 포맷 검증       | `pnpm format:check` |
