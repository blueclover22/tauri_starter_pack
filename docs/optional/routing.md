# Optional — Routing (화면 라우팅 · pages layer)

> 도입 시점: 화면(라우트)이 **2개 이상** 필요해지는 시점.
> 뼈대는 단일 화면(`App` → `PingPanel`)이라 라우터를 포함하지 않는다.
> auth·notification-deeplink 등 일부 optional 문서는 "라우터 이동"을 전제하므로, 그 기능을 도입하면 본 문서가 선행된다.

---

## 1. 라우터 선정

| 옵션                    | 설명                                       | 권장                                    |
| :---------------------- | :----------------------------------------- | :-------------------------------------- |
| **react-router (권장)** | 성숙·표준·데스크톱 SPA 에 무난, 문서 풍부  | **기본 권장** — 특별한 이유 없으면 이것 |
| TanStack Router         | 타입 안전 라우팅·검색 파라미터 스키마 강점 | 타입 안전 라우팅이 핵심 요구일 때       |

Tauri 는 SPA 를 로드하므로 **해시/메모리 히스토리** 또는 `BrowserRouter` 중 선택한다. 데스크톱 단일 윈도우에서는 `createBrowserRouter` 로 충분하다(딥링크는 `docs/optional/notification-deeplink.md` 참조).

```sh
pnpm add react-router
```

---

## 2. 배선 — app layer 에서 합성

라우터는 **app layer** 가 소유한다(§architecture.md 7.1). `App` 이 직접 화면을 렌더하던 자리를 라우터로 교체한다.

```tsx
// src/app/routes/AppRouter.tsx (도입 시 신설)
import { createBrowserRouter, RouterProvider } from "react-router";
import { HomePage } from "@/pages/home";

const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  // { path: "/settings", element: <SettingsPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
```

```tsx
// src/app/App.tsx — main.tsx 의 App.tsx seam 주석 위치에 라우터를 끼운다
import { AppRouter } from "@/app/routes/AppRouter";

export function App() {
  return (
    <div className="...">
      <header>...</header>
      <main>
        <AppRouter />
      </main>
    </div>
  );
}
```

> 전역 provider 는 `app/providers/Providers.tsx` 가, 라우팅은 `app/routes/` 가 담당한다 — 역할을 섞지 않는다.

---

## 3. pages slice — 라우트 1:1 컨테이너

각 화면은 `pages/<page>` slice 한 개다. `pages` 는 **가드·로딩·에러 boundary 배치**와 widgets/features 합성만 담당하고, 도메인 로직은 두지 않는다(§architecture.md 7.1).

```text
src/pages/
└── home/
    ├── ui/
    │   └── HomePage.tsx     # 화면 컨테이너 — features/widgets 합성 + 상태 분기
    └── index.ts             # export { HomePage }
```

```tsx
// src/pages/home/ui/HomePage.tsx
import { PingPanel } from "@/features/app";

export function HomePage() {
  // pages 는 loading/error/empty/success 상태 분기와 boundary 배치를 책임진다.
  return <PingPanel />;
}
```

**경계 규칙** (eslint `boundaries/dependencies` 로 강제): `pages` 는 widgets·features·entities·shared 의 **public API(index)**만 import 한다. 다른 `pages` 를 직접 import 하지 않는다(§architecture.md 7.2).

---

## 4. 가드 · 로딩 · 에러 boundary

- **인증 가드**: 라우트 element 를 감싸는 가드 컴포넌트로 처리하고, 세션 판단은 `docs/optional/auth.md` 의 `isAuthenticated`(표시용) + Rust 세션 확인을 따른다. 토큰을 Renderer 에서 판단 근거로 저장하지 않는다.
- **에러 boundary**: 라우트/페이지 단위로 `shared/ui` 의 ErrorBoundary(도입 시) 를 배치한다. 전역 fallback 은 `app` 에 둔다.
- **로딩**: 데이터 로딩은 `docs/optional/server-state.md` 의 Query `isPending` 으로, 라우트 지연 로딩은 `React.lazy` + `Suspense` 로 처리한다.

---

## 5. 뼈대 통합 접점

| 접점           | 뼈대 현재 상태                | 도입 시 변경                                   |
| :------------- | :---------------------------- | :--------------------------------------------- |
| `app/App.tsx`  | `<PingPanel/>` 직접 렌더      | `<AppRouter/>` 로 교체 (seam 주석 위치)        |
| `app/routes/`  | 없음                          | `AppRouter.tsx` 신설                           |
| `pages/`       | 없음(뼈대: 화면 1개)          | `pages/<page>/{ui,index.ts}` slice 추가        |
| `package.json` | 라우터 미포함                 | `react-router`(권장) 추가                      |
| eslint 경계    | pages 역방향 zone 선provision | pages slice 생성 시 자동 활성 (별도 설정 불요) |
