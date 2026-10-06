export type AppError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type IpcResponse<T = unknown> =
  { success: true; data: T } | { success: false; error?: AppError };

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    "retryable" in value
  );
}
