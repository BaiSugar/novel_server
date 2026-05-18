import { createSseResponse } from "@/app/utils/sse";
import type { SseEvent } from "./events";

/**
 * 输出生成域 SSE 响应。
 * @param events 生成事件流。
 * @returns SSE Response。
 */
export function emitSse(events: AsyncIterable<SseEvent>): Response {
  return createSseResponse(events);
}
