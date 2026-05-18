import type {
  ChatInvokeRequest,
  ChatStreamEvent,
  ChatToolCall,
  ImageInvokeRequest,
  ImageInvokeResult,
  ProviderAdapter,
  ProviderRuntimeContext,
  TokenUsage,
} from "./types";

function headers(ctx: ProviderRuntimeContext): Record<string, string> {
  const result: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": ctx.apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (
    ctx.extraHeaders &&
    typeof ctx.extraHeaders === "object" &&
    !Array.isArray(ctx.extraHeaders)
  ) {
    for (const [key, value] of Object.entries(ctx.extraHeaders)) {
      if (typeof value === "string") result[key] = value;
    }
  }
  return result;
}

function mergeParams(...items: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    Object.assign(result, item);
  }
  return result;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseToolArguments(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    return parseObject(JSON.parse(text));
  } catch {
    return { raw: text };
  }
}

function buildAnthropicMessage(
  message: ChatInvokeRequest["messages"][number],
): Record<string, unknown> | null {
  if (message.role === "system") return null;

  if (message.role === "assistant" && message.toolCalls?.length) {
    const content: Array<Record<string, unknown>> = [];
    if (message.content) content.push({ type: "text", text: message.content });
    for (const toolCall of message.toolCalls) {
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.arguments,
      });
    }
    return { role: "assistant", content };
  }

  if (message.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: message.toolCallId ?? "tool",
          content: message.content,
        },
      ],
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function splitSystemMessages(messages: ChatInvokeRequest["messages"]): {
  system: string;
  messages: Array<Record<string, unknown>>;
} {
  const system: string[] = [];
  const payload: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role === "system") {
      system.push(message.content);
      continue;
    }
    const built = buildAnthropicMessage(message);
    if (built) payload.push(built);
  }

  return { system: system.join("\n\n"), messages: payload };
}

function toAnthropicTools(
  tools: ChatInvokeRequest["tools"],
): unknown[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

function errorCodeFromStatus(status: number): string {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "UPSTREAM_5XX";
  if (status >= 400) return "BAD_REQUEST";
  return "UPSTREAM_ERROR";
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: { message: text || response.statusText } };
  }
}

type StreamBlock = {
  type?: string;
  id?: string;
  name?: string;
  text: string;
  inputJson: string;
  emitted: boolean;
};

async function* streamAnthropic(
  response: Response,
): AsyncIterable<ChatStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  let completedText = "";
  let usage: TokenUsage | undefined;
  const blocks = new Map<number, StreamBlock>();
  const toolCalls: ChatToolCall[] = [];

  const ensureBlock = (index: number): StreamBlock => {
    const existing = blocks.get(index);
    if (existing) return existing;
    const created: StreamBlock = { text: "", inputJson: "", emitted: false };
    blocks.set(index, created);
    return created;
  };

  const emitToolCall = (index: number): ChatToolCall | undefined => {
    const block = blocks.get(index);
    if (!block || block.type !== "tool_use" || block.emitted) return undefined;
    const toolCall: ChatToolCall = {
      id: block.id ?? `tool-${index}`,
      name: block.name ?? `tool-${index}`,
      arguments: parseToolArguments(block.inputJson),
    };
    block.emitted = true;
    toolCalls.push(toolCall);
    return toolCall;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const chunk = JSON.parse(data) as Record<string, unknown>;

      if (chunk.type === "content_block_start") {
        const index = Number(chunk.index ?? 0);
        const block = ensureBlock(index);
        const contentBlock = parseObject(chunk.content_block);
        if (typeof contentBlock.type === "string")
          block.type = contentBlock.type;
        if (typeof contentBlock.id === "string") block.id = contentBlock.id;
        if (typeof contentBlock.name === "string")
          block.name = contentBlock.name;
        continue;
      }

      if (chunk.type === "content_block_delta") {
        const index = Number(chunk.index ?? 0);
        const block = ensureBlock(index);
        const delta = parseObject(chunk.delta);
        const deltaType =
          typeof delta.type === "string" ? delta.type : undefined;
        if (deltaType === "text_delta") {
          const text = typeof delta.text === "string" ? delta.text : "";
          if (text) {
            block.type ??= "text";
            block.text += text;
            completedText += text;
            yield { type: "delta", text };
          }
        } else if (deltaType === "input_json_delta") {
          block.type ??= "tool_use";
          const partialJson =
            typeof delta.partial_json === "string" ? delta.partial_json : "";
          if (partialJson) block.inputJson += partialJson;
        }
        continue;
      }

      if (chunk.type === "content_block_stop") {
        const index = Number(chunk.index ?? 0);
        const toolCall = emitToolCall(index);
        if (toolCall) {
          yield { type: "tool_call", toolCall };
        }
        continue;
      }

      if (chunk.type === "message_delta") {
        const delta = parseObject(chunk.delta);
        if (delta.usage) {
          const deltaUsage = parseObject(delta.usage);
          const output = Number(deltaUsage.output_tokens ?? 0);
          usage = {
            prompt: Number(deltaUsage.input_tokens ?? usage?.prompt ?? 0),
            completion: output,
            total: Number(deltaUsage.input_tokens ?? 0) + output,
            extra: deltaUsage,
          };
        }
        if (chunk.usage) {
          const deltaUsage = parseObject(chunk.usage);
          const output = Number(deltaUsage.output_tokens ?? 0);
          usage = {
            prompt: Number(deltaUsage.input_tokens ?? usage?.prompt ?? 0),
            completion: output,
            total: Number(deltaUsage.input_tokens ?? 0) + output,
            extra: deltaUsage,
          };
        }
        continue;
      }

      if (chunk.type === "message_stop") {
        break;
      }
    }
  }

  for (const [index, block] of blocks) {
    if (block.type === "tool_use" && !block.emitted) {
      const toolCall = emitToolCall(index);
      if (toolCall) {
        yield { type: "tool_call", toolCall };
      }
    }
  }

  yield {
    type: "completed",
    text: completedText,
    ...(usage ? { usage } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
  };
}

/** Anthropic Messages 兼容适配器。 */
export const anthropicAdapter: ProviderAdapter = {
  async *invokeChat(
    ctx: ProviderRuntimeContext,
    request: ChatInvokeRequest,
  ): AsyncIterable<ChatStreamEvent> {
    const url = new URL(
      "messages",
      ctx.baseUrl.endsWith("/") ? ctx.baseUrl : `${ctx.baseUrl}/`,
    );
    const { system, messages } = splitSystemMessages(request.messages);
    const response = await fetch(url, {
      method: "POST",
      headers: headers(ctx),
      body: JSON.stringify({
        ...mergeParams(ctx.modelExtraParams, ctx.extraParams),
        model: ctx.modelIdentifier,
        system: system || undefined,
        messages,
        tools: toAnthropicTools(request.tools),
        stream: true,
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      const json = await parseJson(response);
      const error = json.error as Record<string, unknown> | undefined;
      yield {
        type: "error",
        errorCode: errorCodeFromStatus(response.status),
        message: String(error?.message ?? response.statusText),
      };
      return;
    }

    yield* streamAnthropic(response);
  },

  async invokeImage(
    _ctx: ProviderRuntimeContext,
    _request: ImageInvokeRequest,
  ): Promise<ImageInvokeResult> {
    throw new Error("Anthropic adapter does not support image generation");
  },
};
