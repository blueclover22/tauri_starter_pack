# CLAUDE.md

## 구동 순서

### 1단계 — 요구사항 확인 (`.claude/design/init.md`)

1. 구현에 앞서 `.claude/design/init.md` 를 먼저 확인한다.
2. 내용이 비어 있으면 사용자에게 작성을 요청한다 (작성 예시: `.claude/design/example/ex_init.md`).
3. 사용자가 `.claude/reference/` 에 올린 참고 자료(이미지·명세·기존 코드 등)가 있으면 함께 확인한다.
4. 내용이 불명확하면 사용자에게 재질문하여 모호함을 해소한 뒤 진행한다.

### 2단계 — 설계

5. 요구사항이 모두 명확해지면 구현을 위한 설계를 진행한다.
6. 설계서는 `.claude/design/` 하위에 작성하며, 양식은 `.claude/design/example/ex_plan.md` 를 따른다.

### 3단계 — 구현

7. `.claude/design/` 의 설계서와 **`docs/` 하위에 정의된 구조·규칙**을 함께 기반으로 구현한다. 설계서와 `docs/` 가 충돌하면 사용자에게 확인한다.
   - **구조**: `docs/architecture.md` — FSD 레이어·세그먼트·폴더 트리·Feature Template·계층 import 경계.
   - **규칙**: `docs/coding-rules.md` — 명명·import path·에러 처리·테스트. Tauri 메커니즘은 `docs/tauri-guide.md`, command 계약은 `docs/tauri-commands.md`.
   - 새 도메인/파일은 기존 동종 구조(예: `features/app`)를 먼저 참조해 동일 패턴을 따르고, 이탈이 필요하면 사유를 남긴다.
   - 도입형 기능(상태관리·HTTP·인증·DB·업데이터·파일·알림/딥링크·데스크톱 UX 등)은 해당 `docs/optional/*.md` 가이드를 함께 따른다.

### 4단계 — 검토·보고

8. 구현을 마치면 전체를 검토한 뒤 사용자에게 경과를 보고한다.

## 코딩 원칙 (요약)

- **코딩 전에 생각한다** — 확인되지 않은 사실은 "추정" 으로 명시하고, 해석이 여러 갈래면 모두 나열한 뒤 질문한다. 더 단순한 대안이 있으면 먼저 제안한다.
- **단순함을 최우선으로 한다** — 요청하지 않은 기능, 일회용 코드의 추상화, 추측성 유연성, 일어날 수 없는 시나리오의 예외 처리를 더하지 않는다.
- **정밀하게 수정한다** — 한 번의 변경은 하나의 목적만 담는다. 요청 범위 밖의 파일·인접 코드·서식을 임의로 고치지 않으며, 정리는 본인 변경으로 생긴 미사용 코드에 한한다.
- **목표 중심으로 실행한다** — 작업을 검증 가능한 목표로 바꾼 뒤 착수하고, 변경 후 빌드·타입체크·린트·테스트로 검증한다.

상세 코딩·아키텍처 규칙은 `docs/` 하위 문서를 참조한다.

## 참조 문서

뼈대(기본) 단계에서 반드시 따른다.

> `.claude/settings.json` 의 SessionStart 훅이 이 뼈대 문서 참조를 세션 시작 시 자동 리마인드한다(prose 지시의 기계적 보강).

| #   | 문서                                                | 내용                                                |
| :-- | :-------------------------------------------------- | :-------------------------------------------------- |
| 1   | [docs/architecture.md](../docs/architecture.md)     | 폴더 구조·도메인 슬라이스·공용 contract             |
| 2   | [docs/tauri-guide.md](../docs/tauri-guide.md)       | IPC wrapper·command 설계·Ok-Only·capability·logging |
| 3   | [docs/tauri-commands.md](../docs/tauri-commands.md) | command 계약 공통 규칙                              |
| 4   | [docs/coding-rules.md](../docs/coding-rules.md)     | 코드 작성 규칙                                      |

기능 추가 시 필요한 것만 참조한다.

| #   | 문서                                                                                | 도입 시점                                           |
| :-- | :---------------------------------------------------------------------------------- | :-------------------------------------------------- |
| 1   | [docs/optional/server-state.md](../docs/optional/server-state.md)                   | TanStack Query / Zustand / Zod 도입 시              |
| 2   | [docs/optional/backend-http.md](../docs/optional/backend-http.md)                   | reqwest HTTP client 도입 시                         |
| 3   | [docs/optional/auth.md](../docs/optional/auth.md)                                   | 인증·secure store 도입 시                           |
| 4   | [docs/optional/sqlite.md](../docs/optional/sqlite.md)                               | SQLite 로컬 DB 도입 시                              |
| 5   | [docs/optional/events-channels.md](../docs/optional/events-channels.md)             | emit/listen 또는 Channel<T> 도입 시                 |
| 6   | [docs/optional/command-examples.md](../docs/optional/command-examples.md)           | 도메인 command 추가 시                              |
| 7   | [docs/optional/updater.md](../docs/optional/updater.md)                             | 자동 업데이트 도입 시 (데스크톱)                    |
| 8   | [docs/optional/dialog-fs.md](../docs/optional/dialog-fs.md)                         | 파일 다이얼로그·파일 접근 도입 시                   |
| 9   | [docs/optional/notification-deeplink.md](../docs/optional/notification-deeplink.md) | 알림·딥링크 도입 시                                 |
| 10  | [docs/optional/desktop-ux.md](../docs/optional/desktop-ux.md)                       | 트레이·창 상태·단일 인스턴스·opener 도입 시         |
| 11  | [docs/optional/react-compiler.md](../docs/optional/react-compiler.md)               | React Compiler 동작 이해·예외·비활성 시 (기본 활성) |
| 12  | [docs/optional/routing.md](../docs/optional/routing.md)                             | 화면 2개 이상(라우팅·pages layer) 도입 시           |

## 검증 명령

| 단계            | 명령                |
| :-------------- | :------------------ |
| 타입 체크       | `pnpm typecheck`    |
| 린트            | `pnpm lint`         |
| 테스트          | `pnpm test`         |
| 빌드 (frontend) | `pnpm build`        |
| 빌드 (desktop)  | `pnpm tauri build`  |
| 포맷 (검증)     | `pnpm format:check` |
