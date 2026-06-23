import { vi } from "vitest";

/**
 * 공통 Tauri IPC mock helper.
 * 테스트 파일 상단에서 다음과 같이 등록한다:
 *
 *   vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
 *
 * 이후 mockInvoke.mockResolvedValueOnce({ success: true, data: ... }) 형태로 응답을 주입한다.
 */
export const mockInvoke = vi.fn();

export function resetTauriMocks() {
  mockInvoke.mockReset();
}
