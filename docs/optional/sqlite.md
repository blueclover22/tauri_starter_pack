# Optional — SQLite Local Database

> 도입 시점: 구조적 로컬 데이터 (관계·인덱스·조인) 가 필요한 시점.
> 비민감 설정만 저장한다면 `tauri-plugin-store` 로 충분하다 (`tauri-guide.md §9`).
> 뼈대 단계에서는 사용하지 않는다.

---

## 1. 아키텍처 위치 · End-to-end 흐름

SQLite 는 **Rust service layer 뒤에 숨는다**. Frontend 는 DB 를 모르고, 언제나 command 를 통해 도메인 데이터만 주고받는다. pool 은 부팅 때 한 번 열어 `AppState` 로 공유하고, 종료 때 닫는다.

```text
Component → hook → api/<f>Api.ts → invoke → commands.rs → service
  → sqlx query(state.db_pool) → rows → 도메인 model 매핑 → IpcResult<T>
  → parser(AppError 정규화) → hook → Component

초기화: BootStage::ConnectDatabase 에서 pool 생성 + migration 실행 (실패 시 중단)
종료:   teardown 에서 db_pool.close()
```

- DB 접근은 블로킹 성격이므로 sqlx 의 async API 를 쓰거나, 동기 API 라면 `spawn_blocking` 으로 격리한다 (`tauri-guide.md §10`).
- 조회 결과는 DB row 를 그대로 반환하지 않고 도메인 model(계약 타입)로 매핑한다.

---

## 2. 뼈대 통합 접점

| 접점                          | 뼈대 현재 상태                               | 도입 시 변경                                                |
| :---------------------------- | :------------------------------------------- | :---------------------------------------------------------- |
| `AppState` (`store/state.rs`) | `teardown` 필드만                            | `db_pool: SqlitePool` 필드 추가                             |
| `BootStage` (`lifecycle.rs`)  | `InitPlugins`/`PrepareState`/`RegisterState` | `ConnectDatabase` 추가 (실패 정책: **중단**)                |
| `TeardownRegistry`            | `fire()` 만 사용                             | `db_pool.close()` 훅 등록                                   |
| `lib.rs` builder              | log plugin + `app_ping`                      | (`tauri-plugin-sql` 택 시) `tauri_plugin_sql::Builder` 등록 |
| `capabilities/default.json`   | `core:default`                               | **추가 없음** — Rust 에서만 접근하면 `sql:default` 불요     |
| `shared/config.rs`            | `ERROR_*` / `EVENT_*`                        | DB 파일명·`ERROR_<도메인>_*` 상수                           |
| 신규 파일                     | —                                            | `shared/db/pool.rs`, `migrations/`                          |

---

## 3. 선택지

| 옵션                          | 장점                                  | 단점                                  |
| :---------------------------- | :------------------------------------ | :------------------------------------ |
| **`tauri-plugin-sql`** (권장) | Tauri 공식 plugin, capability 와 통합 | sqlx 직접 제어 대비 추상화 한 겹 있음 |
| `sqlx` 직접 의존              | macro 기반 컴파일타임 query 검증      | 모바일 빌드 시 추가 setup 필요        |

처음에는 `tauri-plugin-sql` 권장. **두 경로를 섞지 않는다** — 아래 §5 코드는 sqlx 직접 경로 예시이며, plugin 을 택하면 pool·migration 구성 방식이 다르다(§5 주의).

---

## 4. 규칙

- 접근은 **Rust service layer 에서만** 수행한다. Frontend 는 SQLite 에 직접 접근하지 않고 command 를 경유한다 (보안·계약 분리).
- 마이그레이션은 앱 부팅 lifecycle 의 `ConnectDatabase` 단계에서 수행한다.
- 연결 pool 은 `AppState.db_pool` 에 등록하고 teardown 단계에서 close 한다.
- 민감 데이터(토큰·비밀번호 해시 등)는 SQLite 에 저장하지 않는다 (`docs/optional/auth.md` 의 secure store 사용).

---

## 5. 부트 / Teardown

```rust
// lifecycle.rs — BootStage 추가
BootStage::ConnectDatabase // 실패 정책: 중단

// shared/db/pool.rs (sqlx 직접 경로)
pub async fn connect(app: &AppHandle) -> Result<SqlitePool, DbError> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?; // 최초 실행 시 앱 데이터 디렉토리가 없을 수 있음
    let path = dir.join("app.db");
    let pool = SqlitePoolOptions::new()
        .connect(&format!("sqlite://{}", path.display()))
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

// teardown 등록
state.teardown.register(|app| {
    let s = app.state::<AppState>();
    s.db_pool.close();
});
```

> **주의 — plugin-sql 를 택한 경우**: 위 코드는 sqlx 직접 경로다. `tauri-plugin-sql` 을 쓰면 pool·migration 을 plugin builder 로 구성하고(`Builder::default().add_migrations("sqlite:app.db", vec![Migration { ... }])` 를 `lib.rs` 에 등록), migration 은 plugin 이 실행한다. 이때 `sqlx::migrate!` / 수동 pool 생성과 **혼용하지 않는다**.

---

## 6. capability

`tauri-plugin-sql` 을 frontend 에서 직접 호출할 일은 없으므로 `sql:default` permission 추가는 **불요**. plugin 등록만 한다.

---

## 7. 안티패턴 · 경계 주의

| 패턴                                      | 이유 / 올바른 방향                                                |
| :---------------------------------------- | :---------------------------------------------------------------- |
| Frontend 에서 SQLite 직접 접근            | 보안·계약 분리 붕괴 → 모든 접근은 command 경유                    |
| 토큰·비밀번호 해시를 SQLite 저장          | 평문/약한 보호 → secure store (`auth.md`)                         |
| 요청마다 pool 새로 생성                   | 연결 낭비·잠금 경합 → `AppState.db_pool` 공유 인스턴스 1개        |
| migration 을 임의 시점·여러 곳에서 실행   | 스키마 drift → `ConnectDatabase` 단일 지점에서만                  |
| `app_data_dir` 미생성 상태로 connect      | 최초 실행 시 파일 열기 실패 → `create_dir_all` 선행               |
| `tauri-plugin-sql` 와 sqlx 직접 경로 혼용 | pool·migration 이중 관리 → 한 경로만 택함                         |
| `db_pool.close()` 누락                    | 종료 시 커넥션 누수·WAL 미정리 → teardown 훅 등록                 |
| DB row 를 계약 타입처럼 그대로 반환       | 스키마 변경이 Frontend 로 새어나감 → 도메인 model 로 매핑 후 반환 |

---

## 8. 도입 체크리스트

| #   | 항목                                                               | 확인 |
| :-- | :----------------------------------------------------------------- | :--- |
| 1   | `tauri-plugin-sql` 의존성 추가 (`Cargo.toml` + `package.json`)     | □    |
| 2   | `BootStage::ConnectDatabase` 단계 추가, 실패 정책: 중단            | □    |
| 3   | `AppState.db_pool` 등록                                            | □    |
| 4   | `migrations/` 디렉토리 생성 + 최초 SQL 추가                        | □    |
| 5   | teardown 에서 `db_pool.close()` 등록                               | □    |
| 6   | Frontend 에서 SQLite 직접 접근하지 않음 (모든 접근은 command 경유) | □    |
