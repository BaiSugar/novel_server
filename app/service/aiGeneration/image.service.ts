import { createHash } from "node:crypto";
import {
  getAiImageDefaultQuality,
  getAiImageDefaultSize,
} from "@/app/config/ai";
import type { Prisma } from "@/app/generated/prisma/client";
import { AiImageGenerationJobStatus } from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import * as AiModelService from "@/app/service/aiModel/model.service";
import { resolveGenerationContext } from "./contextResolver.service";
import type {
  AiImageGenerationJobItem,
  CreateImageGenerationInput,
} from "./types";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapImageJob(row: {
  id: number;
  userId: number;
  modelId: number;
  status: string;
  clientRequestId: string | null;
  prompt: string;
  promptHash: string;
  metadata: unknown | null;
  options: unknown | null;
  result: unknown | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AiImageGenerationJobItem {
  return {
    id: row.id,
    userId: row.userId,
    modelId: row.modelId,
    status: row.status,
    clientRequestId: row.clientRequestId,
    prompt: "",
    promptRedacted: true,
    promptHash: row.promptHash,
    metadata: row.metadata,
    options: row.options,
    result: row.result,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findIdempotent(
  userId: number,
  clientRequestId: string | undefined,
): Promise<AiImageGenerationJobItem | null> {
  if (!clientRequestId) return null;
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const row = await prisma.aiImageGenerationJob.findFirst({
    where: { userId, clientRequestId, createdAt: { gte: since } },
    orderBy: { id: "desc" },
  });
  return row ? mapImageJob(row) : null;
}

/** 创建并执行图片生成任务。 */
export async function createAndRun(
  userId: number,
  input: CreateImageGenerationInput,
  signal?: AbortSignal,
): Promise<AiImageGenerationJobItem> {
  const existing = await findIdempotent(userId, input.clientRequestId);
  if (existing) return existing;

  const context = await resolveGenerationContext(userId, {
    userMessage: input.prompt,
    promptTemplateIds: input.promptTemplateId ? [input.promptTemplateId] : undefined,
    promptInputs: input.promptInputs,
    contextItemIds: input.contextItemIds,
    categoryContexts: input.categoryContexts,
    metadata: input.metadata,
  });
  const finalPrompt = [context.systemPromptText, context.finalUserPrompt]
    .filter(Boolean)
    .join("\n\n");
  let row = await prisma.aiImageGenerationJob.create({
    data: {
      userId,
      modelId: input.modelId,
      status: AiImageGenerationJobStatus.RUNNING,
      clientRequestId: input.clientRequestId,
      prompt: context.renderedPrompt,
      promptHash: sha256(finalPrompt),
      metadata: (input.metadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      options: {
        size: input.size,
        quality: input.quality,
        n: input.n,
      } as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
  });

  try {
    const result = await AiModelService.invokeImage(input.modelId, {
      prompt: finalPrompt,
      size: input.size ?? getAiImageDefaultSize(),
      quality: input.quality ?? getAiImageDefaultQuality(),
      n: input.n ?? 1,
      signal,
    });
    row = await prisma.aiImageGenerationJob.update({
      where: { id: row.id },
      data: {
        status: AiImageGenerationJobStatus.SUCCEEDED,
        result: result as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    return mapImageJob(row);
  } catch (error) {
    row = await prisma.aiImageGenerationJob.update({
      where: { id: row.id },
      data: {
        status: AiImageGenerationJobStatus.FAILED,
        errorCode: "IMAGE_GENERATION_FAILED",
        errorMessage: (error as Error).message.slice(0, 500),
        finishedAt: new Date(),
      },
    });
    return mapImageJob(row);
  }
}

/** 查询图片生成任务。 */
export async function detail(
  userId: number,
  jobId: number,
): Promise<AiImageGenerationJobItem> {
  const row = await prisma.aiImageGenerationJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!row) throw new HttpError("图片生成任务不存在", 404);
  return mapImageJob(row);
}
