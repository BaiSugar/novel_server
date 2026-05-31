export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  reasoningContent?: string;
  toolCallId?: string;
  toolCalls?: ChatToolCall[];
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatInvokeRequest {
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call"; toolCall: ChatToolCall }
  | {
      type: "completed";
      text: string;
      reasoningContent?: string;
      usage?: TokenUsage;
      toolCalls?: ChatToolCall[];
    }
  | { type: "error"; errorCode: string; message: string };

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  extra?: Record<string, unknown>;
}

export interface ImageInvokeRequest {
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
  signal?: AbortSignal;
}

export interface ImageInvokeResult {
  urls: string[];
  b64Json: string[];
  revisedPrompt?: string;
}

export interface ProviderRuntimeContext {
  modelIdentifier: string;
  platform: string;
  endpoint: string;
  baseUrl: string;
  apiKey: string;
  extraHeaders: unknown | null;
  extraParams: unknown | null;
  modelExtraParams: unknown | null;
  reasoningEffort: string;
}

export interface ProviderAdapter {
  invokeChat(
    ctx: ProviderRuntimeContext,
    request: ChatInvokeRequest,
  ): AsyncIterable<ChatStreamEvent>;
  invokeImage(
    ctx: ProviderRuntimeContext,
    request: ImageInvokeRequest,
  ): Promise<ImageInvokeResult>;
}
