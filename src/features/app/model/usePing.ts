import { useCallback, useState } from "react";
import { appApi } from "../api/appApi";
import type { PingInfo } from "../api/appApi";
import { isAppError } from "@/shared/types/ipc";

type PingState = {
  data: PingInfo | null;
  isLoading: boolean;
  error: string | null;
};

/**
 * IPC 파이프 동작 확인용 샘플 hook.
 * TanStack Query 미도입 단계이므로 useState 로 loading/error/data 를 관리한다.
 */
export function usePing() {
  const [state, setState] = useState<PingState>({
    data: null,
    isLoading: false,
    error: null,
  });

  const ping = useCallback(async (note?: string) => {
    setState({ data: null, isLoading: true, error: null });
    try {
      const data = await appApi.ping(note);
      setState({ data, isLoading: false, error: null });
    } catch (err) {
      const message = isAppError(err) ? err.message : "예상치 못한 오류가 발생했습니다.";
      setState({ data: null, isLoading: false, error: message });
    }
  }, []);

  return { ...state, ping };
}
