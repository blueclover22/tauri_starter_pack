import { useState } from "react";
import { BoltIcon } from "@heroicons/react/24/outline";
import { usePing } from "../model/usePing";

/**
 * IPC 왕복(Renderer → Rust command → Renderer)이 동작하는지 확인하는 샘플 패널.
 * 실제 기능을 추가하면 이 feature(app)는 제거하거나 교체해도 무방하다.
 */
export function PingPanel() {
  const [note, setNote] = useState("");
  const { data, isLoading, error, ping } = usePing();

  return (
    <section className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-lg">
      <header className="flex items-center gap-2">
        <BoltIcon className="size-6 text-accent" aria-hidden="true" />
        <h2 className="text-lg font-semibold">IPC 연결 확인</h2>
      </header>

      <p className="text-sm text-muted">
        아래 버튼을 누르면 Rust 의 <code className="text-accent">app_ping</code> command 를 호출하고
        결과를 표시합니다.
      </p>

      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="메모 입력 (선택)"
        data-testid="ping-note-input"
        className="rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <button
        type="button"
        onClick={() => ping(note || undefined)}
        disabled={isLoading}
        data-testid="ping-button"
        className="rounded-md bg-accent-strong px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "호출 중…" : "app_ping 호출"}
      </button>

      {error && (
        <p data-testid="ping-error" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {data && (
        <div
          data-testid="ping-result"
          className="rounded-md border border-border bg-bg p-3 text-sm"
        >
          <p>
            <span className="text-muted">message:</span> {data.message}
          </p>
          {data.echoedNote && (
            <p>
              <span className="text-muted">echoedNote:</span> {data.echoedNote}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
