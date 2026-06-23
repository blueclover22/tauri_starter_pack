import { invokeTauri } from "@/shared/lib/tauri/invoke";
import { parsePingInfo } from "./appParsers";
import type { PingInfo } from "./appParsers";

export type { PingInfo } from "./appParsers";

export type PingRequest = { note?: string };

export const appApi = {
  ping: async (note?: string): Promise<PingInfo> => {
    const raw = await invokeTauri<unknown>("app_ping", {
      request: { note } satisfies PingRequest,
    });
    return parsePingInfo(raw);
  },
};
