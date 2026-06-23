import { invoke } from "@tauri-apps/api/core";
import type { AppError, IpcResponse } from "@/shared/types/ipc";

/**
 * 공통 IPC wrapper.
 * ① invoke() 자체 실패 → AppError 로 감싸 throw
 * ② result.success === false → result.error throw
 * ③ 성공 → result.data 반환
 *
 * throw 되는 값은 Error 인스턴스가 아닌 plain AppError 객체다.
 */
export async function invokeTauri<TResponse>(
  command: string,
  args?: Record<string, unknown>,
): Promise<TResponse> {
  let result: IpcResponse<TResponse>;
  try {
    result = await invoke<IpcResponse<TResponse>>(command, args);
  } catch (invokeErr) {
    throw {
      code: "ERROR_TAURI_INVOKE_FAILED",
      message: invokeErr instanceof Error ? invokeErr.message : String(invokeErr),
      retryable: true,
    } satisfies AppError;
  }

  if (!result.success) {
    throw (
      result.error ??
      ({
        code: "ERROR_TAURI_COMMAND_FAILED",
        message: "알 수 없는 오류가 발생했습니다.",
        retryable: true,
      } satisfies AppError)
    );
  }

  return result.data as TResponse;
}
