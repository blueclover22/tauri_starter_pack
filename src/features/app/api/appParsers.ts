import type { AppError } from "@/shared/types/ipc";

export type PingInfo = {
  message: string;
  echoedNote?: string;
};

/**
 * app_ping 응답 파싱·정규화.
 * Zod 도입 전 단계이므로 최소 형태 검증만 수행한다.
 * (Zod 도입 시 docs/optional/server-state.md §3 참조)
 */
export function parsePingInfo(raw: unknown): PingInfo {
  if (typeof raw !== "object" || raw === null || !("message" in raw)) {
    throw {
      code: "ERROR_VALIDATION_PING_SHAPE",
      message: "ping 응답 형식이 올바르지 않습니다.",
      retryable: false,
    } satisfies AppError;
  }

  const obj = raw as Record<string, unknown>;
  return {
    message: String(obj.message),
    echoedNote: typeof obj.echoedNote === "string" ? obj.echoedNote : undefined,
  };
}
