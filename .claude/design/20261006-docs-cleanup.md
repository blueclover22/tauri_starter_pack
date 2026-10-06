# 규칙 문서 정합화 (에러 코드 분류 · Ok-Only · SSOT · 설계서 규정)

> 대상: `docs/*.md`, `docs/optional/*.md`, `.claude/CLAUDE.md`, `.claude/settings.json`, `.claude/design/example/ex_plan.md`, `README.md`
> 연관 규칙: `docs/tauri-guide.md` §8, `.claude/CLAUDE.md`
> 작성일: 2026-10-06
> 상태: 완료 (2026-10-06) — 전 항목 권장안

---

## 1. 목적 / 비목표

### 목적

- 에이전트가 복제하는 예시(optional 문서)와 규칙(tauri-guide §8)의 충돌을 없앤다.
- 같은 규칙이 여러 문서에 다르게 적힌 곳을 한 곳(SSOT)으로 모으고 나머지는 링크로 대체한다.
- 설계서 파일명·상태값·승인 기록 방식, `init.md` "비어 있음" 판정을 명문화해 승인 게이트를 기계적으로 판정 가능하게 한다.
- 깨진 참조·낡은 "(도입 시)" 표기·코드와 어긋난 스니펫을 바로잡는다.

### 비목표

- 필수 문서 분량 대폭 축소(모바일 절 분리, Tailwind 규칙·Anti-pattern 표·스니펫 중복 통합) — 문서 구조 변경이라 별도 작업 (Q2).
- 코드 변경 (guardrails 설계서 범위).

---

## 2. 설계 방향

### 2.1 에러 코드 분류 재정의

현 규칙(`tauri-guide.md:230-240`)은 "5개 카테고리 안에서만 확장, 한 도메인 = 한 카테고리" 인데, optional 예시가 `ERROR_NOTES_*`·`ERROR_FS_*`·`ERROR_WINDOW_*`·`ERROR_UPDATER_*` 를 쓰고, auth 도메인은 `ERROR_AUTH_*` 와 `ERROR_NETWORK_*` 를 함께 쓴다. 파일·DB·창 같은 로컬 I/O 실패를 담을 카테고리가 없는 것이 원인이다.

| 옵션                                         | 설명                                                                                                                                                                              | 장점                                      | 단점                    |
| :------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------- | :---------------------- |
| **A. `io` 카테고리 추가 + 규칙 완화** (권장) | `ERROR_IO_*`(로컬 파일·DB·창 I/O, retryable true, 재시도 토스트) 추가. "한 도메인 = 한 카테고리" → "카테고리는 에러의 처리 방식으로 고른다 (한 도메인이 여러 카테고리 사용 가능)" | 예시가 자연스럽게 맞음, FE 분기 기준 유지 | 카테고리 6종으로 증가   |
| B. 5개 유지, 예시를 억지로 매핑              | FS·DB·창 실패 → `ERROR_UNKNOWN_*` 등                                                                                                                                              | 규칙 변경 없음                            | 의미 손실, unknown 남용 |

A 적용 시 예시 매핑:

| 현재                                        | 변경                                                      |
| :------------------------------------------ | :-------------------------------------------------------- |
| `ERROR_NOTES_{LIST,CREATE,UPDATE}_FAILED`   | `ERROR_IO_NOTES_{LIST,CREATE,UPDATE}_FAILED`              |
| `ERROR_NOTE_NOT_FOUND`                      | `ERROR_VALIDATION_NOTE_NOT_FOUND`                         |
| `ERROR_FS_{READ,WRITE,LIST}_FAILED`         | `ERROR_IO_FS_{READ,WRITE,LIST}_FAILED`                    |
| `ERROR_WINDOW_RESTORE_FAILED`               | `ERROR_IO_WINDOW_RESTORE_FAILED`                          |
| `ERROR_UPDATER_CHECK_FAILED`                | `ERROR_NETWORK_UPDATER_CHECK_FAILED`                      |
| `ERROR_CONFIG_SAVE_FAILED` (retryable true) | `ERROR_IO_CONFIG_SAVE_FAILED` (config 는 false 정책 유지) |

관련 문서(tauri-guide §8, architecture §14, tauri-commands, command-examples, auth, backend-http 등)를 함께 갱신한다.

### 2.2 Ok-Only 규정 단일화

SSOT 는 `tauri-guide.md §8`. 표의 "시스템 Panic → `Err(String)`" 행을 다음으로 정정한다.

- command 는 `Err` 를 반환하지 않는다. lock poison 등 인프라 실패도 `Ok(IpcResult::err(...))` 로 반환한다.
- 예상 못한 panic 은 invoke reject 로 전달되고 FE wrapper 가 `ERROR_TAURI_INVOKE_FAILED` 로 정규화한다.

`coding-rules.md`, `tauri-commands.md:21`, `architecture.md:422` 의 중복 서술은 한 줄 요약 + `tauri-guide.md §8` 링크로 바꾼다.

### 2.3 SSOT 정리 (중복 → 링크)

| 내용               | 소유 문서                                        | 링크로 대체                                                                     |
| :----------------- | :----------------------------------------------- | :------------------------------------------------------------------------------ |
| 검증 명령 표       | `.claude/CLAUDE.md`                              | `README.md` 표, `architecture.md:440`·`coding-rules.md:197` "커밋 전 권장 순서" |
| optional 문서 색인 | `.claude/CLAUDE.md`(에이전트), `README.md`(사람) | `tauri-guide.md:31-42`, `coding-rules.md:33-37`                                 |

### 2.4 설계서·요구사항 규정 (`.claude/CLAUDE.md`, `ex_plan.md`)

- 파일명: `.claude/design/<YYYYMMDD>-<slug>.md`. 설계서 경로는 전역 도구 기본값보다 본 규정이 우선.
- 상태값: `설계안` → `승인 (YYYY-MM-DD)` → `구현중` → `완료`. 사용자 승인 시 상태 줄을 갱신해 기록한다.
- `init.md` 는 HTML 주석 외 본문이 없으면 "비어 있음" 으로 판정.
- `ex_plan.md`: "3.1 생성 파일" → "3.1 변경 파일", 4.1 검증 절차 출처를 `.claude/CLAUDE.md` 로 단일화, 상태 줄 예시에 상태값 목록 표기.
- SessionStart 훅 문구에 `init.md` 확인을 포함하고 CLAUDE.md 의 "반드시" 와 강도를 맞춘다.

### 2.5 기계적 수정

| 위치                                                     | 수정                                                                     |
| :------------------------------------------------------- | :----------------------------------------------------------------------- |
| `tauri-guide.md:327`                                     | log 플러그인 "(도입 시)" 삭제 (뼈대 기본 포함)                           |
| `architecture.md:243,254`, `server-state.md:165,169,195` | 이미 있는 파일의 "(도입 시)" → "(뼈대 포함)"                             |
| `architecture.md:266`                                    | 백엔드 샘플 트리에 `config.rs` 추가                                      |
| `notification-deeplink.md:151`                           | `coding-rules.md §13` → `tauri-guide.md §13`                             |
| `routing.md:44` / `:26,65,85`                            | `main.tsx` → `App.tsx` / `§architecture.md 7.1` → `architecture.md §7.1` |
| `tauri-guide.md:305-307`                                 | setup 스니펫을 `lib.rs` 실제 코드와 동기화                               |

---

## 3. 개발 범위

### 3.1 변경 파일

| #   | 파일                                                                                                                                   | 변경 유형 | 내용                               |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :--------------------------------- |
| 1   | `docs/tauri-guide.md`                                                                                                                  | 수정      | §2.1 §2.2 §2.3 §2.5                |
| 2   | `docs/architecture.md`, `docs/coding-rules.md`, `docs/tauri-commands.md`                                                               | 수정      | §2.1 §2.2 §2.3 §2.5                |
| 3   | `docs/optional/{command-examples,auth,backend-http,server-state,notification-deeplink,routing,dialog-fs,desktop-ux,updater,sqlite}.md` | 수정      | §2.1 코드 매핑, §2.5 (해당 파일만) |
| 4   | `.claude/CLAUDE.md`, `.claude/settings.json`, `.claude/design/example/ex_plan.md`                                                      | 수정      | §2.4                               |
| 5   | `README.md`                                                                                                                            | 수정      | §2.3 검증 표 → 링크                |

---

## 4. 검증 계획

### 4.0 성공 기준 / Step → verify

| #   | Step             | verify (성공 기준)                                                       |
| :-- | :--------------- | :----------------------------------------------------------------------- |
| 1   | 에러 코드 재매핑 | `grep -rE "ERROR_(NOTES?                                                 | FS  | WINDOW | UPDATER)_" docs` 결과 0건, 모든 코드가 6개 카테고리 접두사 |
| 2   | Ok-Only 단일화   | `grep -rn "Err(String)" docs` 결과가 §8 금지 서술·Anti-pattern 표만 남음 |
| 3   | 참조·표기 수정   | 감사 보고 지적 위치 재확인, `pnpm format:check` 통과                     |
| 4   | 전체 정합성      | `mak:doc-audit` 재실행 시 High 0건                                       |

### 4.1 자동 검증

`pnpm format:check` (Markdown 포맷). 코드 변경 없으므로 나머지 명령은 영향 없음.

### 4.2 수동 검증 (시나리오)

| #   | 시나리오                                | 기대 결과                   |
| :-- | :-------------------------------------- | :-------------------------- |
| V1  | 새 세션에서 SessionStart 훅 메시지 확인 | init.md 확인 포함 문구 출력 |

### 4.3 회귀 관찰 포인트

- 코드의 `ERROR_VALIDATION_PING_FAILED` 등 기존 코드 상수는 변경 없음 (문서 예시만 변경).

---

## 5. 결정 필요 사항

### Q1. 에러 코드 분류 — §2.1 옵션 A(권장) / B

**권장**: **A**. 로컬 I/O 실패는 데스크톱 앱에서 흔한 유형이라 전용 카테고리가 있어야 예시와 실제 도메인이 규칙 안에 들어온다.

### Q2. 필수 문서 분량 축소를 이번에 포함할지

| 옵션                          | 설명                                         | 장점                     | 단점                         |
| :---------------------------- | :------------------------------------------- | :----------------------- | :--------------------------- |
| **A. 제외, 별도 작업** (권장) | 이번엔 §2 항목만                             | 변경 검토 범위 작음      | 1,211줄 context 비용 유지    |
| B. 포함                       | 모바일 절 optional 분리, 중복 표·스니펫 통합 | 세션당 context 비용 감소 | 문서 구조 변경, 리뷰 부담 큼 |

**권장**: **A**.

---

## 6. 추정 / 불확실 영역

- **추정**: Tauri v2 command 내부 panic 은 invoke reject 로 전달된다 (async command 기준). 구현 시 문서 표현은 "reject 로 전달될 수 있다" 수준으로 둔다.
- **미검토**: optional 문서 중 backend-http·sqlite·updater·desktop-ux·dialog-fs 본문 전체 — 구현 시 에러 코드·참조만 grep 으로 대조.
