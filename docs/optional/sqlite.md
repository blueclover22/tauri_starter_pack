# Optional — SQLite Local Database

> 도입 시점: 구조적 로컬 데이터 (관계·인덱스·조인) 가 필요한 시점.
> 비민감 설정만 저장한다면 `tauri-plugin-store` 로 충분하다 (`tauri-guide.md §9`).
> 뼈대 단계에서는 사용하지 않는다.

---

## 1. 선택지

| 옵션                          | 장점                                  | 단점                                  |
| :---------------------------- | :------------------------------------ | :------------------------------------ |
| **`tauri-plugin-sql`** (권장) | Tauri 공식 plugin, capability 와 통합 | sqlx 직접 제어 대비 추상화 한 겹 있음 |
| `sqlx` 직접 의존              | macro 기반 컴파일타임 query 검증      | 모바일 빌드 시 추가 setup 필요        |

처음에는 `tauri-plugin-sql` 권장.

---

## 2. 규칙

- 접근은 **Rust service layer 에서만** 수행한다. Frontend 는 SQLite 에 직접 접근하지 않고 command 를 경유한다 (보안·계약 분리).
- 마이그레이션은 앱 부팅 lifecycle 의 `ConnectDatabase` 단계에서 수행한다.
- 연결 pool 은 `AppState.db_pool` 에 등록하고 teardown 단계에서 close 한다.
- 민감 데이터(토큰·비밀번호 해시 등)는 SQLite 에 저장하지 않는다 (`docs/optional/auth.md` 의 secure store 사용).

---

## 3. 부트 / Teardown

```rust
// lifecycle.rs — BootStage 추가
BootStage::ConnectDatabase // 실패 정책: 중단

// shared/db/pool.rs
pub async fn connect(app: &AppHandle) -> Result<SqlitePool, DbError> {
    let path = app.path().app_data_dir()?.join("app.db");
    let pool = SqlitePoolOptions::new().connect(&format!("sqlite://{}", path.display())).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

// teardown 등록
state.teardown.register(|app| {
    let s = app.state::<AppState>();
    s.db_pool.close();
});
```

---

## 4. capability

`tauri-plugin-sql` 을 frontend 에서 직접 호출할 일은 없으므로 `sql:default` permission 추가는 **불요**. plugin 등록만 한다.

---

## 5. 도입 체크리스트

| #   | 항목                                                               | 확인 |
| :-- | :----------------------------------------------------------------- | :--- |
| 1   | `tauri-plugin-sql` 의존성 추가 (`Cargo.toml` + `package.json`)     | □    |
| 2   | `BootStage::ConnectDatabase` 단계 추가, 실패 정책: 중단            | □    |
| 3   | `AppState.db_pool` 등록                                            | □    |
| 4   | `migrations/` 디렉토리 생성 + 최초 SQL 추가                        | □    |
| 5   | teardown 에서 `db_pool.close()` 등록                               | □    |
| 6   | Frontend 에서 SQLite 직접 접근하지 않음 (모든 접근은 command 경유) | □    |
