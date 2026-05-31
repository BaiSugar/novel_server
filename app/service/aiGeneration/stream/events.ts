import type {
  ChatStreamEvent,
  TokenUsage,
} from "@/app/service/aiModel/adapter/types";
import type { EditorDiffProposal } from "../types";

export type SseEvent =
  | {
      event: "job.created";
      data: { jobId: number; conversationId?: number; imageJobId?: number };
    }
  | {
      event: "message.delta";
      data: { jobId: number; messageId: number; delta: string };
    }
  | {
      event: "message.reasoning_delta";
      data: { jobId: number; messageId: number; delta: string };
    }
  | {
      event: "edit.proposal";
      data: EditorDiffProposal & { jobId: number; messageId: number };
    }
  | {
      event: "tool.call";
      data: {
        jobId: number;
        toolCallId: string;
        name: string;
        arguments: unknown;
      };
    }
  | {
      event: "tool.result";
      data: {
        jobId: number;
        toolCallId: string;
        name: string;
        result: unknown;
      };
    }
  | {
      event: "message.completed";
      data: {
        jobId: number;
        messageId: number;
        content: string;
        reasoningContent?: string;
        usage?: TokenUsage;
        toolCalls?: Array<{ id: string; name: string; arguments: unknown }>;
      };
    }
  | {
      event: "job.iteration";
      data: { jobId: number; iteration: number; maxIterations: number };
    }
  | { event: "job.succeeded"; data: { jobId: number; result?: unknown } }
  | {
      event: "job.failed";
      data: { jobId: number; errorCode: string; message: string };
    }
  | { event: "job.canceled"; data: { jobId: number } }
  | { event: "keepalive"; data: { ts: number } };

/** 将上游流事件转换为前端 SSE 事件所需的基础信息。 */
export type NormalizedChatEvent = ChatStreamEvent;
