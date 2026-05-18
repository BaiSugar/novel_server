import type {
  AiConversationStatus,
  AiGenerationMode,
} from "@/app/generated/prisma/enums";

export interface AiMetadata {
  novelId?: number;
  chapterId?: number;
  promptTemplateId?: number;
  scene?: string;
}

export interface CreateConversationInput {
  title?: string;
  mode?: AiGenerationMode;
  modelId: number;
  systemPrompt?: string | null;
  metadata?: AiMetadata | null;
}

export interface UpdateConversationInput {
  title?: string;
  mode?: AiGenerationMode;
  modelId?: number;
  systemPrompt?: string | null;
  metadata?: AiMetadata | null;
}

export interface ConversationListQuery {
  page?: number;
  pageSize?: number;
  status?: AiConversationStatus;
  novelId?: number;
  chapterId?: number;
  keyword?: string;
}

export interface AiConversationItem {
  id: number;
  userId: number;
  title: string;
  mode: AiGenerationMode;
  modelId: number;
  systemPrompt: string | null;
  metadata: AiMetadata | null;
  status: AiConversationStatus;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CursorQuery {
  cursor?: number;
  limit?: number;
  includeSuperseded?: boolean;
}

export interface AiMessageItem {
  id: number;
  conversationId: number;
  parentMessageId: number | null;
  role: string;
  status: string;
  content: string;
  contentRedacted?: boolean;
  toolCalls: unknown | null;
  toolCallId: string | null;
  toolName: string | null;
  tokenUsage: unknown | null;
  modelId: number | null;
  jobId: number | null;
  seq: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGenerationInput {
  conversationId?: number;
  userMessage?: string;
  promptTemplateIds?: number[];
  promptInputs?: Record<string, unknown>;
  contextItemIds?: number[];
  metadata?: AiMetadata;
  mode: AiGenerationMode;
  modelId: number;
  temperature?: number;
}

export interface RetryGenerationInput {
  targetMessageId: number;
}

export interface AiGenerationJobItem {
  id: number;
  conversationId: number;
  userId: number;
  mode: AiGenerationMode;
  modelId: number;
  status: string;
  anchorMessageId: number | null;
  retryTargetId: number | null;
  clientRequestId: string | null;
  iterationCount: number;
  maxIterations: number;
  errorCode: string | null;
  errorMessage: string | null;
  tokenUsage: unknown | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateImageGenerationInput {
  modelId: number;
  prompt?: string;
  promptTemplateId?: number;
  promptInputs?: Record<string, unknown>;
  contextItemIds?: number[];
  metadata?: AiMetadata;
  size?: string;
  quality?: string;
  n?: number;
  clientRequestId?: string;
}

export interface AiImageGenerationJobItem {
  id: number;
  userId: number;
  modelId: number;
  status: string;
  clientRequestId: string | null;
  prompt: string;
  promptRedacted?: boolean;
  promptHash: string;
  metadata: unknown | null;
  options: unknown | null;
  result: unknown | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
