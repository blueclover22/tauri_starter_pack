# Optional — Server State & Validation

> 도입 시점: 서버 데이터 캐싱, 화면 간 공유 상태, 사용자 입력 검증이 필요한 시점.
> 뼈대 단계에서는 사용하지 않는다.

이 문서는 **TanStack Query** (서버 상태), **Zustand** (화면 간 공유 클라이언트 상태), **Zod** (입력 검증) 3종을 도입할 때의 규칙을 정리한다. 한 번에 모두 도입할 필요는 없으며 필요한 것만 단독으로 추가해도 무방하다.

---

## 1. TanStack Query

### 1.1 도입 판단

- IPC 응답을 화면 여러 곳에서 재사용하거나 캐시·재요청·낙관적 갱신이 필요할 때.
- 단발성 호출 1~2회만 있는 단계에서는 `useState` + `await invokeTauri(...)` 로 충분하다.

### 1.2 규칙

- 조회는 `queries/use[Feature]Query.ts`, mutation 은 `mutations/use[Feature]Mutation.ts` 로 분리한다.
- `staleTime`, `gcTime`, retry 정책을 명시적으로 설정한다.
- mutation 이후 관련 query 는 `invalidateQueries` 또는 `setQueryData` 로 동기화한다.
- query key 는 feature 당 `model/queries/queryKeys.ts` 팩토리를 통해 생성한다 — 문자열 배열 직접 작성 금지.
- retry 정책은 `AppError.retryable` 을 기준으로 판단한다.

### 1.3 예시

```ts
// src/features/settings/model/queries/queryKeys.ts
export const settingsKeys = {
  all: ["settings"] as const,
  config: () => [...settingsKeys.all, "config"] as const,
};

// src/features/settings/model/queries/useSettingsQuery.ts
export function useSettingsQuery() {
  return useQuery({
    queryKey: settingsKeys.config(),
    queryFn: () => settingsApi.load(),
    staleTime: 1000 * 10,
    gcTime: 1000 * 60,
  });
}
```

### 1.4 부트스트랩

- `QueryClient` 는 `src/shared/lib/queryClient.ts` 에 단일 인스턴스로 두고 `app/providers/` 에서 `QueryClientProvider` 로 주입한다.

---

## 2. Zustand

### 2.1 도입 판단

- 화면 간(라우트 간) 공유가 필요한 **클라이언트** 상태가 생겼을 때.
- 한 화면 안에서만 쓰는 상태는 `useState` 우선.

### 2.2 규칙

- 비민감 UI 상태(현재 화면, 선택된 탭, `isAuthenticated` 표시 플래그 등)만 저장한다.
- access token / refresh token / 로그인 응답 원문은 **저장 금지** — Rust `AppState` 또는 secure store 사용 (`docs/optional/auth.md` 참조).
- persist middleware 를 쓰더라도 민감 데이터는 절대 persist 대상에 넣지 않는다.
- `localStorage` / `sessionStorage` 에 직접 접근하지 않는다.
- 위치: 도메인 무관 전역 store 는 `src/shared/store/`, 도메인 한정은 `src/features/<feature>/model/store/`.

### 2.3 예시

```ts
// src/shared/store/appStore.ts
import { create } from "zustand";

interface AppStore {
  isAuthenticated: boolean;
  setAuthenticated: (v: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  isAuthenticated: false,
  setAuthenticated: (v) => set({ isAuthenticated: v }),
}));
```

---

## 3. Zod

### 3.1 도입 판단

- 사용자 입력이 있는 폼이 생겼을 때.
- IPC 응답을 타입 단순 캐스팅 대신 schema 로 보장하고 싶을 때.
- listener payload 검증이 필요할 때.

### 3.2 규칙

- 사용자 입력은 명시적인 Zod schema 로 검증한다.
- command payload 로 들어갈 값은 API/parser 레이어에서 최소 한 번 더 검증한다.
- command response 도 필요하면 schema 로 검증한다.
- type assertion 보다 schema validation 을 우선한다.
- validation 규칙은 UI 와 분리해 schema layer 에 둔다.

### 3.3 예시

```ts
// src/features/auth/model/schema.ts
import { z } from "zod";

export const loginSchema = z.object({
  userId: z.string().min(1, "아이디를 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});
export type LoginFormValues = z.infer<typeof loginSchema>;
```

### 3.4 listener payload 검증

```ts
unlisten = await listen("auth-session-cleared", (event) => {
  const parsed = sessionClearedSchema.safeParse(event.payload);
  if (!parsed.success) {
    log.warn("[ui:auth] invalid payload", parsed.error.message);
    return;
  }
  queryClient.setQueryData(authKeys.session(), parsed.data);
});
```

---

## 4. IPC Mock (Vitest)

TanStack Query / Zustand 를 도입하면 hook 테스트가 필요해진다. IPC mock 의 표준 경계와 권장 패턴.

- IPC mock 의 기본 경계는 `@tauri-apps/api/core` 의 `invoke` 또는 이를 감싼 `src/shared/lib/tauri/invoke.ts` 이다.
- Tauri mock 은 `vi.mock("@tauri-apps/api/core", ...)` 패턴으로 등록하고, 공통 mock 함수는 `src/test/mocks/tauri.ts` 에서 재사용한다.
- feature API layer 테스트에서는 command 이름, args payload shape, invoke 호출 횟수를 검증한다.
- `success: true`, `success: false`, invoke reject, malformed response 를 각각 독립된 케이스로 분리한다.
- Component 테스트에서는 `invoke` 를 직접 mock 하기보다 hook/API layer 를 mock 한다.
- IPC mock 으로 실제 Rust command 구현·Tauri runtime·backend API 까지 검증하려 하지 않는다.

권장 케이스: 올바른 command 이름 호출 / args key 가 Rust contract 와 일치 / invoke reject → `ERROR_TAURI_INVOKE_FAILED` 변환 / `success: false` → `AppError` / schema parse 실패 → feature validation error 승격.

---

## 5. 도입 체크리스트

| #   | 항목                                                                                                           | 확인 |
| :-- | :------------------------------------------------------------------------------------------------------------- | :--- |
| 1   | `pnpm add @tanstack/react-query` / `zustand` / `zod` 중 도입 대상만 설치                                       | □    |
| 2   | `src/shared/lib/queryClient.ts` 생성, `app/providers/` 에서 `QueryClientProvider` 주입 (Query 도입 시)         | □    |
| 3   | feature 의 `model/queries/`, `model/mutations/`, `model/store/`, `model/schema.ts` 디렉토리 생성 (필요 부분만) | □    |
| 4   | `src/test/mocks/tauri.ts` 추가, `vitest.setup.ts` 에서 import (Query/Mutation 테스트 필요 시)                  | □    |
| 5   | `architecture.md §10 State Management` 의 매트릭스와 본 문서가 일치하는지 확인                                 | □    |
