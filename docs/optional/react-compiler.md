# Optional — React Compiler (자동 메모이제이션)

> 상태: **뼈대에 기본 활성**. 다른 optional 문서(도입 시 켜는 기능)와 달리 이미 켜져 있으며,
> 이 문서는 **동작 원리·예외 처리·비활성 방법**을 정리한다.
> 컴파일러는 `pnpm build`/`pnpm dev`(Vite)에만 적용되고 `vitest`에는 적용하지 않는다.

---

## 1. 뼈대 배선

React Compiler는 Babel 플러그인인데 `@vitejs/plugin-react@6`은 Babel-free(Oxc)라, 컴파일러 전용 Babel 패스를 `@rolldown/plugin-babel`로 **`react()` 앞에** 둔다.

```ts
// vite.config.ts
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

plugins: [babel({ presets: [reactCompilerPreset()] }), react(), tailwindcss()];
```

- **순서 주의**: `babel()`가 `react()`보다 **뒤**에 오면 컴파일러가 조용히 미동작한다(에러 없이 그냥 안 돎).
- **React 19 런타임 내장** → `react-compiler-runtime` 폴리필 불필요. `reactCompilerPreset()`이 `react/compiler-runtime`을 `optimizeDeps`에 자동 포함한다.

린트는 `eslint-plugin-react-hooks` v6의 `recommended-latest`(Rules of React + 컴파일러 규칙)로 `src/**` 에 적용된다 (`eslint.config.js`).

---

## 2. 동작 원리

컴파일러가 빌드 타임에 컴포넌트·훅을 분석해 **자동 메모이제이션** 코드를 삽입한다. 수동 `useMemo`/`useCallback`/`memo` 없이도 불필요한 리렌더가 줄어든다.

- 성능 이득은 **앱 복잡도·렌더 빈도에 비례**한다. 단순 화면에서는 체감이 거의 없다.
- 의미(semantics) 보존이 보장되므로 동작·테스트 결과는 변하지 않는다.

**적용 확인** — 프로덕션 번들에 컴파일러 지문이 있는지로 검증한다:

```sh
pnpm build
# dist 번들에서 memo_cache_sentinel / useMemoCache 문자열이 검색되면 정상 적용
```

React DevTools에서는 컴파일러가 처리한 컴포넌트에 **"Memo ✨" 배지**가 표시된다.

---

## 3. 예외 처리 — `"use no memo"`

특정 컴포넌트/훅만 컴파일에서 제외하려면 함수 첫 줄에 지시어를 둔다.

```tsx
function Widget() {
  "use no memo";
  // 이 컴포넌트는 컴파일러가 건드리지 않는다
  ...
}
```

Rules of React를 위반하는 코드(렌더 중 ref 읽기, 조건부 훅, 값 변이 등)는 컴파일러가 자동으로 건너뛴다. `eslint-plugin-react-hooks`가 그런 위반을 먼저 잡아주므로, 린트를 통과시키는 것이 컴파일러가 최대한 많은 컴포넌트를 처리하도록 하는 길이다.

---

## 4. 전체 비활성 방법

컴파일러가 맞지 않는다고 판단되면(예: 빌드 시간 부담 회피) 트랜스폼만 끄면 된다. 린트 규칙은 그대로 두어도 무방하다(컴파일러 없이도 Rules of React 강제).

`vite.config.ts` 에서 `babel(...)` 플러그인 항목을 제거한다:

```ts
plugins: [react(), tailwindcss()]; // babel(...) 삭제
```

의존성까지 정리하려면 `@rolldown/plugin-babel`·`babel-plugin-react-compiler` 를 제거한다. (`reactCompilerPreset`은 `@vitejs/plugin-react` 소속이라 남는다.)

린트 규칙 강도를 낮추려면 `eslint.config.js` 의 `reactHooks.configs["recommended-latest"]` 를 필요한 규칙만 선별하는 형태로 바꾼다.

---

## 5. 트레이드오프 메모

- **Babel 재도입 비용**: 모든 jsx/tsx에 Babel 패스가 걸려 Vite 8/Oxc의 Babel-free 속도 이점을 부분 반납한다. 스타터 규모에서는 무시할 수준이나, 대형 앱에서는 dev/build 시간 증가를 관찰한다.
- **vitest 미적용**: 테스트는 컴파일러 없이 실행된다(의미 보존이라 검증에 문제없음, 속도 유지).
- **미래 경로**: Oxc/swc-native react-compiler 통합이 나오면 `@rolldown/plugin-babel` 왕복을 제거하고 재배선할 수 있다.
