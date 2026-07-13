import { PingPanel } from "@/features/app";

export function App() {
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <h1 className="text-xl font-bold">Tauri Starter Pack</h1>
        <p className="text-sm text-muted">React + TypeScript + Tailwind v4 + Tauri v2</p>
      </header>

      {/*
        화면이 2개 이상이 되면 여기에 라우터를 합성한다 (예: <AppRouter /> 로 교체).
        라우터 선정·pages 슬라이스 구성은 docs/optional/routing.md 참조.
      */}
      <main className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <PingPanel />
      </main>
    </div>
  );
}
