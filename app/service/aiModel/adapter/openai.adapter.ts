import type {
  ChatInvokeRequest,
  ChatStreamEvent,
  ImageInvokeRequest,
  ImageInvokeResult,
  ProviderAdapter,
  ProviderRuntimeContext,
  TokenUsage,
} from "./types";

function mergeHeaders(
  extraHeaders: unknown,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
  if (
    extraHeaders &&
    typeof extraHeaders === "object" &&
    !Array.isArray(extraHeaders)
  ) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (typeof value === "string") headers[key] = value;
    }
  }
  return headers;
}

function mergeParams(...items: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    Object.assign(result, item);
  }
  return result;
}

function toOpenAiTools(
  tools: ChatInvokeRequest["tools"],
): unknown[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function toOpenAiToolCalls(
  toolCalls: ChatInvokeRequest["messages"][number]["toolCalls"],
): unknown[] | undefined {
  if (!toolCalls?.length) return undefined;
  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    type: "function",
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.arguments),
    },
  }));
}

function supportsReasoningContentPassback(
  ctx: ProviderRuntimeContext,
): boolean {
  return [ctx.platform, ctx.baseUrl, ctx.modelIdentifier].some((value) =>
    value.trim().toLowerCase().includes("deepseek"),
  );
}

function toOpenAiMessages(
  messages: ChatInvokeRequest["messages"],
  options: { includeReasoningContent?: boolean } = {},
): unknown[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }
    return {
      role: message.role,
      content: message.toolCalls?.length
        ? message.content || null
        : message.content,
      ...(options.includeReasoningContent &&
      message.role === "assistant" &&
      message.reasoningContent
        ? { reasoning_content: message.reasoningContent }
        : {}),
      ...(message.toolCalls
        ? { tool_calls: toOpenAiToolCalls(message.toolCalls) }
        : {}),
    };
  });
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseToolArguments(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parseObject(parsed);
  } catch {
    return { raw: text };
  }
}

async function parseOpenAiJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: { message: text || response.statusText } };
  }
}

function extractUsage(usage: unknown): TokenUsage | null {
  const value = parseObject(usage);
  if (!Object.keys(value).length) return null;
  const prompt = Number(value.prompt_tokens ?? value.input_tokens ?? 0);
  const completion = Number(
    value.completion_tokens ?? value.output_tokens ?? 0,
  );
  const total = Number(value.total_tokens ?? prompt + completion);
  return { prompt, completion, total };
}

function errorCodeFromStatus(status: number): string {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "UPSTREAM_5XX";
  if (status >= 400) return "BAD_REQUEST";
  return "UPSTREAM_ERROR";
}

async function* streamOpenAiChat(
  response: Response,
): AsyncIterable<ChatStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  let completedText = "";
  let reasoningContent = "";
  let usage: TokenUsage | null = null;
  const toolCallsByIndex = new Map<
    number,
    { id?: string; name?: string; argumentsText: string }
  >();

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
      const choices = chunk.choices as
        | Array<Record<string, unknown>>
        | undefined;
      const choice = choices?.[0];
      const delta = choice?.delta as Record<string, unknown> | undefined;
      const content = typeof delta?.content === "string" ? delta.content : "";
      if (content) {
        completedText += content;
        yield { type: "delta", text: content };
      }
      const reasoningChunk =
        typeof delta?.reasoning_content === "string"
          ? delta.reasoning_content
          : "";
      if (reasoningChunk) {
        reasoningContent += reasoningChunk;
        yield { type: "reasoning_delta", text: reasoningChunk };
      }

      const toolDeltas = delta?.tool_calls as
        | Array<Record<string, unknown>>
        | undefined;
      if (toolDeltas) {
        for (const toolDelta of toolDeltas) {
          const index = Number(toolDelta.index ?? 0);
          const current = toolCallsByIndex.get(index) ?? { argumentsText: "" };
          const id =
            typeof toolDelta.id === "string" ? toolDelta.id : undefined;
          if (id) current.id = id;
          const functionDelta = parseObject(toolDelta.function);
          const name =
            typeof functionDelta.name === "string"
              ? functionDelta.name
              : undefined;
          if (name) current.name = name;
          const argumentsChunk =
            typeof functionDelta.arguments === "string"
              ? functionDelta.arguments
              : "";
          if (argumentsChunk) current.argumentsText += argumentsChunk;
          toolCallsByIndex.set(index, current);
        }
      }

      const extractedUsage = extractUsage(chunk.usage);
      if (extractedUsage) usage = extractedUsage;

      const finishReason =
        typeof choice?.finish_reason === "string"
          ? choice.finish_reason
          : undefined;
      if (finishReason === "stop" || finishReason === "tool_calls") {
      }
    }
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, call]) => ({
      id: call.id ?? `tool-${index}`,
      name: call.name ?? `tool-${index}`,
      arguments: parseToolArguments(call.argumentsText),
    }));

  for (const toolCall of toolCalls) {
    yield { type: "tool_call", toolCall };
  }

  yield {
    type: "completed",
    text: completedText,
    ...(reasoningContent ? { reasoningContent } : {}),
    ...(usage ? { usage } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
  };
}

/** OpenAI 兼容适配器。 */
export const openAiAdapter: ProviderAdapter = {
  async *invokeChat(
    ctx: ProviderRuntimeContext,
    request: ChatInvokeRequest,
  ): AsyncIterable<ChatStreamEvent> {
    const url = new URL(
      ctx.endpoint === "responses" ? "responses" : "chat/completions",
      ctx.baseUrl.endsWith("/") ? ctx.baseUrl : `${ctx.baseUrl}/`,
    );
    const body = {
      ...mergeParams(ctx.modelExtraParams, ctx.extraParams),
      model: ctx.modelIdentifier,
      messages: toOpenAiMessages(request.messages, {
        includeReasoningContent: supportsReasoningContentPassback(ctx),
      }),
      stream: true,
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      tools: toOpenAiTools(request.tools),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: mergeHeaders(ctx.extraHeaders, ctx.apiKey),
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const json = await parseOpenAiJson(response);
      const error = json.error as Record<string, unknown> | undefined;
      yield {
        type: "error",
        errorCode: errorCodeFromStatus(response.status),
        message: String(error?.message ?? response.statusText),
      };
      return;
    }

    yield* streamOpenAiChat(response);
  },

  async invokeImage(
    ctx: ProviderRuntimeContext,
    request: ImageInvokeRequest,
  ): Promise<ImageInvokeResult> {
    const url = new URL(
      "images/generations",
      ctx.baseUrl.endsWith("/") ? ctx.baseUrl : `${ctx.baseUrl}/`,
    );
    const response = await fetch(url, {
      method: "POST",
      headers: mergeHeaders(ctx.extraHeaders, ctx.apiKey),
      body: JSON.stringify({
        ...mergeParams(ctx.modelExtraParams, ctx.extraParams),
        model: ctx.modelIdentifier,
        prompt: request.prompt,
        size: request.size,
        quality: request.quality,
        n: request.n ?? 1,
      }),
      signal: request.signal,
    });

    const json = await parseOpenAiJson(response);
    if (!response.ok) {
      const error = json.error as Record<string, unknown> | undefined;
      throw new Error(String(error?.message ?? response.statusText));
    }

    const data =
      (json.data as Array<Record<string, unknown>> | undefined) ?? [];
    return {
      urls: data
        .map((item) => item.url)
        .filter((url): url is string => typeof url === "string"),
      b64Json: data
        .map((item) => item.b64_json)
        .filter((b64): b64 is string => typeof b64 === "string"),
      revisedPrompt: data.find(
        (item) => typeof item.revised_prompt === "string",
      )?.revised_prompt as string | undefined,
    };
  },
};
