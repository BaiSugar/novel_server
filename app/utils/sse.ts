import type { SseEvent } from "@/app/service/aiGeneration/stream/events";

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
 * @param events 事件流。
 * @returns Response 对象。
 */
export function createSseResponse(events: AsyncIterable<SseEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const item of events) {
          controller.enqueue(
            encoder.encode(encodeSseEvent(item.event, item.data)),
          );
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeSseEvent("job.failed", {
              jobId: 0,
              errorCode: "STREAM_ERROR",
              message: (error as Error).message,
            }),
          ),
        );
      } finally {
        controller.close();
      }
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
