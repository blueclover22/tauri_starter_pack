import { afterEach, describe, expect, it, vi } from "vitest";
import { mockInvoke, resetTauriMocks } from "@/test/mocks/tauri";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

const { appApi } = await import("./appApi");

afterEach(() => {
  resetTauriMocks();
});

describe("appApi.ping", () => {
  it("올바른 command 이름과 args payload 로 invoke 한다", async () => {
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: { message: "pong", echoedNote: "hi" },
    });

    const result = await appApi.ping("hi");

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("app_ping", { request: { note: "hi" } });
    expect(result).toEqual({ message: "pong", echoedNote: "hi" });
  });

  it("success: false → AppError 로 정규화하여 throw 한다", async () => {
    mockInvoke.mockResolvedValueOnce({
      success: false,
      error: { code: "ERROR_APP_PING_FAILED", message: "실패", retryable: true },
    });

    await expect(appApi.ping()).rejects.toMatchObject({
      code: "ERROR_APP_PING_FAILED",
    });
  });

  it("invoke reject → ERROR_TAURI_INVOKE_FAILED 로 변환한다", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("ipc down"));

    await expect(appApi.ping()).rejects.toMatchObject({
      code: "ERROR_TAURI_INVOKE_FAILED",
      retryable: true,
    });
  });

  it("malformed payload → validation error 로 승격한다", async () => {
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: { wrong: "shape" },
    });

    await expect(appApi.ping()).rejects.toMatchObject({
      code: "ERROR_VALIDATION_PING_SHAPE",
    });
  });
});
