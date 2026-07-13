import type { ReactNode } from "react";

/**
 * 전역 Provider 조합 지점 (app layer).
 *
 * 뼈대에서는 pass-through 이며, 도입 시 여기서 provider 를 중첩한다:
 * - QueryClientProvider  → docs/optional/server-state.md
 * - AuthBootstrap        → docs/optional/auth.md
 * - 전역 listener 등록    → docs/optional/events-channels.md
 *
 * 중첩 순서: 바깥(전역 인프라) → 안(도메인). main.tsx 에서 <App/> 을 감싼다.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
