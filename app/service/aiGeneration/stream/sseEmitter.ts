import { createSseResponse, type SseOptions } from "@/app/utils/sse";
import type { SseEvent } from "./events";

/**
 * 输出生成域 SSE 响应。
 * @param events 生成事件流。
 * @param opts 可选配置（心跳间隔、断开回调等）。
 * @returns SSE Response。
 */
export function emitSse(
  events: AsyncIterable<SseEvent>,
  opts?: SseOptions,
): Response {
  return createSseResponse(events, opts);
}