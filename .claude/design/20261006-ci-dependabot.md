# CI 워크플로 + Dependabot 버전 업데이트 도입

> 대상: `.github/workflows/ci.yml`, `.github/dependabot.yml`
> 연관 규칙: `.claude/CLAUDE.md` §검증 명령
> 작성일: 2026-10-06
> 상태: 완료 (2026-10-06) — 전 항목 권장안. 수동 검증 V1·V2 는 사용자 확인 대기

---

## 1. 목적 / 비목표

### 목적

- PR·main push 마다 검증 명령(typecheck·lint·test·build·format:check + Rust fmt·clippy·test)을 자동 실행해 에이전트·Dependabot 이 만든 변경을 기계적으로 검증한다.
- Dependabot 버전 업데이트를 npm·cargo·github-actions 3개 생태계에 켜고, 주 1회 묶음 PR 로 받아 PR 소음을 줄인다.

### 비목표

- `pnpm tauri build`(데스크톱 번들) / 멀티 OS 매트릭스 / 모바일 빌드 — 느리고 스타터 단계에서 과하다.
- 릴리스·서명·배포 파이프라인.
- Dependabot 보안 업데이트의 pnpm 간접 의존성 실패 자체 해결 (Dependabot 측 한계 — 수동 `pnpm update --lockfile-only` 로 대응).

---

## 2. 설계 방향

### 2.1 CI 는 job 2개 (frontend / rust) 병렬

| job        | runner        | 단계                                                                                                                                                                                               |
| :--------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend` | ubuntu-latest | checkout → pnpm(action-setup, `packageManager` 사용) → node(`.nvmrc`, pnpm cache) → `pnpm install --frozen-lockfile` → typecheck → lint → test → build → format:check                              |
| `rust`     | ubuntu-latest | checkout → Tauri Linux 시스템 의존성 apt 설치 → stable toolchain(clippy·rustfmt) → rust-cache → `mkdir -p dist` → `cargo fmt --check` → `cargo clippy --all-targets -- -D warnings` → `cargo test` |

- 트리거: `push`(main), `pull_request`.
- `permissions: contents: read` 로 최소 권한.
- `concurrency` 로 같은 ref 의 이전 실행 취소.

### 2.2 Dependabot 버전 업데이트는 생태계별 1개 그룹

| 생태계           | directory    | 주기   | 그룹               | ignore                                     |
| :--------------- | :----------- | :----- | :----------------- | :----------------------------------------- |
| `npm`            | `/`          | weekly | minor+patch 1개 PR | `typescript` semver-major (TS 6 유지 정책) |
| `cargo`          | `/src-tauri` | weekly | minor+patch 1개 PR | -                                          |
| `github-actions` | `/`          | weekly | 전체 1개 PR        | -                                          |

major 업데이트는 개별 PR 로 받아 검토한다.

### 2.3 `.github/` 는 스타터 팩 저장소 전용

본 저장소는 신규 Tauri 프로젝트의 기반(템플릿)이다. CI·Dependabot 설정은 **스타터 팩 자체의 유지보수용**이며, 신규 프로젝트는 `.github/` 가 없는 상태로 시작한다.

- `README.md` "사용 방법" 에 복사 후 `.github/` 디렉토리 제거 단계를 추가한다.
- `.claude/CLAUDE.md` 에 "`.github/` 는 스타터 팩 유지보수 전용 — 신규 프로젝트에는 포함하지 않으며 뼈대 규칙·검증 명령의 일부가 아니다" 를 명시한다.

---

## 3. 개발 범위

### 3.1 변경 파일

| #   | 파일                       | 변경 유형 | 내용                                  |
| :-- | :------------------------- | :-------- | :------------------------------------ |
| 1   | `.github/workflows/ci.yml` | 생성      | §2.1 의 frontend / rust job           |
| 2   | `.github/dependabot.yml`   | 생성      | §2.2 의 3개 생태계 설정               |
| 3   | `README.md`                | 수정      | §2.3 사용 방법에 `.github/` 제거 단계 |
| 4   | `.claude/CLAUDE.md`        | 수정      | §2.3 `.github/` 범위 명시             |

---

## 4. 검증 계획

### 4.0 성공 기준 / Step → verify

| #   | Step                     | verify (성공 기준)                                                                 |
| :-- | :----------------------- | :--------------------------------------------------------------------------------- |
| 1   | ci.yml 작성              | `pnpm format:check` 통과 (YAML 포맷), 로컬에서 각 단계 명령 동일하게 통과          |
| 2   | dependabot.yml 작성      | push 후 GitHub `Insights → Dependency graph → Dependabot` 에서 설정 파싱 오류 없음 |
| 3   | (사용자 push 후) CI 실행 | Actions 에서 두 job 모두 green                                                     |

### 4.1 자동 검증

`.claude/CLAUDE.md` §검증 명령 + `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` / `cargo test` (src-tauri).

### 4.2 수동 검증 (시나리오)

| #   | 시나리오                     | 기대 결과                                   |
| :-- | :--------------------------- | :------------------------------------------ |
| V1  | push 후 Actions 탭 확인      | `CI` 워크플로 frontend·rust 모두 성공       |
| V2  | 다음 주 Dependabot 실행 확인 | 생태계별 묶음 PR 생성, 해당 PR 에서 CI 실행 |

### 4.3 회귀 관찰 포인트

- 소스 코드 변경 없음. 로컬 동작 영향 없음.

---

## 5. 결정 필요 사항

### Q1. Dependabot 버전 업데이트까지 켤지

| 옵션                              | 설명                                  | 장점                                  | 단점                                    |
| :-------------------------------- | :------------------------------------ | :------------------------------------ | :-------------------------------------- |
| **A. CI + dependabot.yml** (권장) | §2 전체                               | 의존성 노후화 방지, Rust 도 대상 포함 | 주 1회 PR 리뷰 부담                     |
| B. CI 만                          | dependabot.yml 생략, 보안 알림만 유지 | 가장 단순                             | 버전 업데이트 수동, cargo 업데이트 없음 |

**권장**: **A**. 스타터 팩은 복제 시점의 의존성이 최신이어야 가치가 있고, 그룹화로 PR 은 주당 최대 3개 수준이다.

### Q2. 커밋·push

구현 후 커밋·push 는 사용자 요청 시에만 진행한다. CI 실제 실행(V1)은 push 이후 확인 가능하다.

---

## 6. 추정 / 불확실 영역

- **추정**: `tauri::generate_context!` 는 컴파일 시 `frontendDist`(`../dist`) 존재를 요구하므로 rust job 에 `mkdir -p dist` 가 필요하다. 구현 시 확인.
- **추정**: action 메이저 버전(`actions/checkout`, `actions/setup-node`, `pnpm/action-setup` 등)은 작성 시점 최신 메이저를 쓴다. 이후 github-actions 생태계 Dependabot 이 갱신한다.
- **불확실**: Dependabot 버전 업데이트도 pnpm 간접 의존성에서 security update 와 같은 이유로 실패할 수 있다. 직접 의존성 범위 갱신은 정상 동작할 것으로 예상.
