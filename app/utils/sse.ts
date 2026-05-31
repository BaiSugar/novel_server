import type { SseEvent } from "@/app/service/aiGeneration/stream/events";

export interface SseOptions {
  /** 心跳间隔（毫秒）。未设置或 ≤0 则禁用心跳。 */
  heartbeatMs?: number;
  /** 客户端断开回调。心跳 enqueue 失败或流被取消时触发。 */
  onDisconnect?: () => void;
}

/**
 * 序列化单个 SSE 事件。
 * @param event 事件名。
 * @param data JSON 数据。
 * @returns SSE 帧文本。
 */
export function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * 基于异步事件流创建 SSE 响应。
 * 支持可选心跳保活：在事件流静默期间定期发送 `keepalive` 帧，
 * 防止代理 / 负载均衡器因超时空闲断开连接。
 * 心跳检测到客户端断开时，通过 `onDisconnect` 回调通知上层。
 * @param events 事件流。
 * @param opts 可选配置（心跳间隔、断开回调）。
 * @returns Response 对象。
 */
export function createSseResponse(
  events: AsyncIterable<SseEvent>,
  opts?: SseOptions,
): Response {
  const heartbeatMs = opts?.heartbeatMs ?? 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
      let closed = false;

      const tryEnqueue = (event: string, data: unknown): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      const teardown = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = undefined;
        }
      };

      if (heartbeatMs > 0) {
        heartbeatTimer = setInterval(() => {
          if (!tryEnqueue("keepalive", { ts: Date.now() })) {
            teardown();
            opts?.onDisconnect?.();
          }
        }, heartbeatMs);
      }

      try {
        for await (const item of events) {
          if (closed) break;
          tryEnqueue(item.event, item.data);
        }
      } catch (error) {
        tryEnqueue("job.failed", {
          jobId: 0,
          errorCode: "STREAM_ERROR",
          message: (error as Error).message,
        });
      } finally {
        teardown();
        try {
          controller.close();
        } catch {
          // 流可能已被取消（客户端断开），忽略 close 错误
        }
      }
    },
    cancel() {
      opts?.onDisconnect?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}