import {
  getAiHealthWindowSize,
  getAiLatencyHardLimitMs,
} from "@/app/config/ai";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  AiModelFailoverStrategy,
  AiReasoningEffort,
} from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import { resolveProviderAdapter } from "./adapter";
import type {
  ChatInvokeRequest,
  ChatStreamEvent,
  ImageInvokeRequest,
  ImageInvokeResult,
} from "./adapter/types";
import {
  decryptProviderApiKey,
  encryptProviderApiKey,
  maskProviderApiKey,
} from "./keyCodec.service";
import type {
  AiModelCapability,
  AiModelPublicItem,
  AiModelPublicStatus,
  AiModelSlotAdmin,
  BindAccountInput,
  CreateModelDefinitionInput,
  CreateProviderAccountInput,
  CreateSlotInput,
  ModelAccountBindingAdmin,
  ModelCallContext,
  ModelDefinitionAdmin,
  PagedResult,
  ProviderAccountAdmin,
  ProviderAccountHealthAdmin,
  ReorderAccountInput,
  UpdateModelDefinitionInput,
  UpdateProviderAccountInput,
  UpdateSlotInput,
} from "./types";

const VALID_TAGS = new Set(["hot", "free", "new", "beta"]);
const VALID_CAPABILITIES: ReadonlySet<string> = new Set<AiModelCapability>([
  "TEXT_CHAT",
  "TOOL_CALLING",
  "STREAMING",
  "IMAGE_GENERATION",
  "MULTI_MODAL_INPUT",
  "JSON_MODE",
]);
const rrCursors = new Map<string, number>();

type BindingWithAccount = Awaited<
  ReturnType<typeof listCandidateBindings>
>[number];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeTags(value: string[] | undefined): string[] {
  const tags = value ?? [];
  for (const tag of tags) {
    if (!VALID_TAGS.has(tag))
      throw new HttpError(`不支持的模型标签：${tag}`, 422);
  }
  return tags;
}

function normalizeCapabilities(value: string[] | undefined): string[] {
  const capabilities = value ?? [];
  for (const capability of capabilities) {
    if (!VALID_CAPABILITIES.has(capability)) {
      throw new HttpError(`不支持的模型能力：${capability}`, 422);
    }
  }
  return capabilities;
}

function normalizeReasoningEffort(
  value: string | undefined,
): AiReasoningEffort {
  if (!value) return AiReasoningEffort.NONE;
  if (!Object.values(AiReasoningEffort).includes(value as AiReasoningEffort)) {
    throw new HttpError("推理强度不合法", 422);
  }
  return value as AiReasoningEffort;
}

function normalizeFailoverStrategy(
  value: string | undefined,
): AiModelFailoverStrategy {
  if (!value) return AiModelFailoverStrategy.SEQUENTIAL;
  if (
    !Object.values(AiModelFailoverStrategy).includes(
      value as AiModelFailoverStrategy,
    )
  ) {
    throw new HttpError("故障转移策略不合法", 422);
  }
  return value as AiModelFailoverStrategy;
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapDefinition(row: {
  id: number;
  identifier: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  defaultTemperature: unknown;
  reasoningEffort: string;
  extraParams: unknown | null;
  capabilities: unknown | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ModelDefinitionAdmin {
  return {
    id: row.id,
    identifier: row.identifier,
    displayName: row.displayName,
    contextWindow: row.contextWindow,
    maxOutputTokens: row.maxOutputTokens,
    defaultTemperature: toNumber(row.defaultTemperature),
    reasoningEffort: row.reasoningEffort,
    extraParams: row.extraParams,
    capabilities: toStringArray(row.capabilities),
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapHealth(row: {
  modelId: number;
  accountId: number;
  successCount: number;
  failureCount: number;
  p95LatencyMs: number | null;
  consecutiveFailures: number;
  circuitOpenUntil: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorCode: string | null;
  updatedAt: Date;
}): ProviderAccountHealthAdmin {
  return {
    modelId: row.modelId,
    accountId: row.accountId,
    successCount: row.successCount,
    failureCount: row.failureCount,
    p95LatencyMs: row.p95LatencyMs,
    consecutiveFailures: row.consecutiveFailures,
    circuitOpenUntil: toIso(row.circuitOpenUntil),
    lastSuccessAt: toIso(row.lastSuccessAt),
    lastFailureAt: toIso(row.lastFailureAt),
    lastErrorCode: row.lastErrorCode,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAccount(row: {
  id: number;
  platform: string;
  label: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  extraHeaders: unknown | null;
  extraParams: unknown | null;
  priority: number;
  weight: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ProviderAccountAdmin {
  return {
    id: row.id,
    platform: row.platform,
    label: row.label,
    baseUrl: row.baseUrl,
    apiKeyMasked: maskProviderApiKey(
      decryptProviderApiKey(row.apiKeyEncrypted),
    ),
    extraHeaders: row.extraHeaders,
    extraParams: row.extraParams,
    priority: row.priority,
    weight: row.weight,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isCircuitOpen(
  health: { circuitOpenUntil: Date | null } | null | undefined,
): boolean {
  return Boolean(
    health?.circuitOpenUntil && health.circuitOpenUntil > new Date(),
  );
}

function aggregateStatus(
  slot: { boundModelId: number | null },
  bindings: Array<{
    enabled: boolean;
    account: { enabled: boolean };
    health: {
      successCount: number;
      failureCount: number;
      p95LatencyMs: number | null;
      circuitOpenUntil: Date | null;
    } | null;
  }>,
): AiModelPublicStatus {
  if (!slot.boundModelId) return "OUTAGE";
  const available = bindings.filter(
    (binding) =>
      binding.enabled &&
      binding.account.enabled &&
      !isCircuitOpen(binding.health),
  );
  if (!available.length) return "OUTAGE";

  const hardLimit = getAiLatencyHardLimitMs();
  const smooth = available.some((binding) => {
    const health = binding.health;
    if (!health) return true;
    const total = health.successCount + health.failureCount;
    const successRate = total === 0 ? 1 : health.successCount / total;
    return successRate >= 0.9 && (health.p95LatencyMs ?? 0) <= hardLimit;
  });

  return smooth ? "SMOOTH" : "CONGESTED";
}

async function findSlotWithModel(id: number) {
  return prisma.aiModelSlot.findUnique({
    where: { id },
    include: { boundModel: true },
  });
}

async function listCandidateBindings(modelId: number) {
  return prisma.aiModelAccountBinding.findMany({
    where: { modelId },
    include: { account: true },
    orderBy: [{ priority: "asc" }, { accountId: "asc" }],
  });
}

async function healthByModel(modelId: number) {
  const records = await prisma.aiProviderAccountHealth.findMany({
    where: { modelId },
  });
  return new Map(records.map((record) => [record.accountId, record]));
}

async function assertModelExists(
  modelId: number | null | undefined,
): Promise<void> {
  if (modelId == null) return;
  const model = await prisma.aiModelDefinition.findUnique({
    where: { id: modelId },
    select: { id: true, enabled: true },
  });
  if (!model || !model.enabled)
    throw new HttpError("模型定义不存在或未启用", 404);
}

function assertCapabilities(
  model: { capabilities: unknown },
  required: AiModelCapability[],
): void {
  const capabilities = toStringArray(model.capabilities);
  for (const capability of required) {
    if (!capabilities.includes(capability)) {
      throw new HttpError("模型不支持当前能力", 503, "MODEL_UNAVAILABLE");
    }
  }
}

function pickCandidate(
  slot: { id: number; failoverStrategy: string },
  model: { identifier: string },
  bindings: BindingWithAccount[],
  healthMap: Map<number, { circuitOpenUntil: Date | null }>,
): BindingWithAccount {
  const candidates = bindings.filter(
    (binding) =>
      binding.enabled &&
      binding.account.enabled &&
      !isCircuitOpen(healthMap.get(binding.accountId)),
  );
  if (!candidates.length)
    throw new HttpError("模型当前不可用", 503, "MODEL_UNAVAILABLE");

  if (slot.failoverStrategy === AiModelFailoverStrategy.ROUND_ROBIN) {
    const key = model.identifier;
    const cursor = rrCursors.get(key) ?? 0;
    rrCursors.set(key, cursor + 1);
    return candidates[cursor % candidates.length]!;
  }

  return candidates[0]!;
}

async function buildModelCallContext(
  modelId: number,
  requiredCapabilities: AiModelCapability[],
): Promise<
  ModelCallContext & { modelDefinitionId: number; accountId: number }
> {
  const slot = await findSlotWithModel(modelId);
  if (!slot || !slot.enabled || !slot.boundModel || !slot.boundModel.enabled) {
    throw new HttpError("模型当前不可用", 503, "MODEL_UNAVAILABLE");
  }
  assertCapabilities(slot.boundModel, requiredCapabilities);

  const [bindings, healthMap] = await Promise.all([
    listCandidateBindings(slot.boundModel.id),
    healthByModel(slot.boundModel.id),
  ]);
  const binding = pickCandidate(slot, slot.boundModel, bindings, healthMap);
  const decryptedApiKey = decryptProviderApiKey(
    binding.account.apiKeyEncrypted,
  );

  return {
    slotId: slot.id,
    modelDefinitionId: slot.boundModel.id,
    accountId: binding.accountId,
    model: {
      id: slot.boundModel.id,
      identifier: slot.boundModel.identifier,
      displayName: slot.boundModel.displayName,
      contextWindow: slot.boundModel.contextWindow,
      maxOutputTokens: slot.boundModel.maxOutputTokens,
      defaultTemperature:
        slot.defaultTemperature == null
          ? toNumber(slot.boundModel.defaultTemperature)
          : toNumber(slot.defaultTemperature),
      reasoningEffort: slot.boundModel.reasoningEffort,
      extraParams: slot.boundModel.extraParams,
      capabilities: toStringArray(slot.boundModel.capabilities),
    },
    account: {
      id: binding.account.id,
      platform: binding.account.platform,
      baseUrl: binding.account.baseUrl,
      apiKey: decryptedApiKey,
      extraHeaders: binding.account.extraHeaders,
      extraParams: binding.account.extraParams,
    },
  };
}

async function recordSuccess(
  modelId: number,
  accountId: number,
  latencyMs: number,
): Promise<void> {
  await prisma.aiProviderAccountHealth.upsert({
    where: { modelId_accountId: { modelId, accountId } },
    create: {
      modelId,
      accountId,
      windowSize: getAiHealthWindowSize(),
      successCount: 1,
      failureCount: 0,
      p95LatencyMs: latencyMs,
      consecutiveFailures: 0,
      lastSuccessAt: new Date(),
    },
    update: {
      successCount: { increment: 1 },
      p95LatencyMs: latencyMs,
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      lastSuccessAt: new Date(),
      lastErrorCode: null,
    },
  });
}

async function recordFailure(
  modelId: number,
  accountId: number,
  errorCode: string,
): Promise<void> {
  await prisma.aiProviderAccountHealth.upsert({
    where: { modelId_accountId: { modelId, accountId } },
    create: {
      modelId,
      accountId,
      windowSize: getAiHealthWindowSize(),
      successCount: 0,
      failureCount: 1,
      consecutiveFailures: 1,
      lastFailureAt: new Date(),
      lastErrorCode: errorCode,
    },
    update: {
      failureCount: { increment: 1 },
      consecutiveFailures: { increment: 1 },
      lastFailureAt: new Date(),
      lastErrorCode: errorCode,
    },
  });
}

async function mapSlot(
  row: Awaited<ReturnType<typeof findSlotWithModel>>,
): Promise<AiModelSlotAdmin> {
  if (!row) throw new HttpError("模型槽位不存在", 404);
  const healthMap = row.boundModelId
    ? await healthByModel(row.boundModelId)
    : new Map();
  const bindings = row.boundModelId
    ? (
        await prisma.aiModelAccountBinding.findMany({
          where: { modelId: row.boundModelId },
          include: { account: true },
        })
      ).map((binding) => ({
        ...binding,
        health: healthMap.get(binding.accountId) ?? null,
      }))
    : [];
  return {
    id: row.id,
    displayName: row.displayName,
    description: row.description,
    tags: toStringArray(row.tags),
    sortOrder: row.sortOrder,
    enabled: row.enabled,
    failoverStrategy: row.failoverStrategy,
    defaultTemperature:
      row.defaultTemperature == null ? null : toNumber(row.defaultTemperature),
    boundModelId: row.boundModelId,
    boundModel: row.boundModel ? mapDefinition(row.boundModel) : null,
    status: aggregateStatus(row, bindings),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 获取前端可见模型列表。 */
export async function listPublicModels(): Promise<AiModelPublicItem[]> {
  const rows = await prisma.aiModelSlot.findMany({
    where: { enabled: true },
    include: { boundModel: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const mapped = await Promise.all(rows.map((row) => mapSlot(row)));
  return mapped.map((slot) => ({
    id: slot.id,
    name: slot.displayName,
    description: slot.description,
    temperature:
      slot.defaultTemperature ?? slot.boundModel?.defaultTemperature ?? 0.7,
    tags: slot.tags,
    status: slot.status,
  }));
}

/** 获取前端可见模型详情。 */
export async function publicModelDetail(
  id: number,
): Promise<AiModelPublicItem> {
  const row = await prisma.aiModelSlot.findFirst({
    where: { id, enabled: true },
    include: { boundModel: true },
  });
  const slot = await mapSlot(row);
  return {
    id: slot.id,
    name: slot.displayName,
    description: slot.description,
    temperature:
      slot.defaultTemperature ?? slot.boundModel?.defaultTemperature ?? 0.7,
    tags: slot.tags,
    status: slot.status,
  };
}

/** 获取供生成域调用的模型上下文。 */
export async function getSlotForCall(
  modelId: number,
  requiredCapabilities: AiModelCapability[],
): Promise<ModelCallContext> {
  return buildModelCallContext(modelId, requiredCapabilities);
}

/** 调用文本聊天模型。 */
export async function* invokeChat(
  modelId: number,
  request: ChatInvokeRequest,
): AsyncIterable<ChatStreamEvent> {
  const required: AiModelCapability[] = request.tools?.length
    ? ["TEXT_CHAT", "TOOL_CALLING"]
    : ["TEXT_CHAT"];
  const ctx = await buildModelCallContext(modelId, required);
  const adapter = resolveProviderAdapter(ctx.account.platform);
  const started = Date.now();
  const requestWithDefaults: ChatInvokeRequest = {
    ...request,
    temperature: request.temperature ?? ctx.model.defaultTemperature,
    maxOutputTokens: request.maxOutputTokens ?? ctx.model.maxOutputTokens,
  };

  try {
    if (process.env.DEV_LOG !== "false") {
      console.log(
        `[invokeChat] modelId=${ctx.modelDefinitionId} model=${ctx.model.identifier}`,
        JSON.stringify(requestWithDefaults.messages, null, 2),
      );
    }
    for await (const event of adapter.invokeChat(
      {
        modelIdentifier: ctx.model.identifier,
        platform: ctx.account.platform,
        endpoint: ctx.account.platform,
        baseUrl: ctx.account.baseUrl,
        apiKey: ctx.account.apiKey,
        extraHeaders: ctx.account.extraHeaders,
        extraParams: ctx.account.extraParams,
        modelExtraParams: ctx.model.extraParams,
        reasoningEffort: ctx.model.reasoningEffort,
      },
      requestWithDefaults,
    )) {
      if (event.type === "error") {
        await recordFailure(
          ctx.modelDefinitionId,
          ctx.accountId,
          event.errorCode,
        );
      }
      if (event.type === "completed") {
        await recordSuccess(
          ctx.modelDefinitionId,
          ctx.accountId,
          Date.now() - started,
        );
      }
      yield event;
    }
  } catch (error) {
    if (isAbortError(error) || request.signal?.aborted) {
      throw new HttpError("客户端已断开", 499, "CLIENT_DISCONNECTED");
    }
    await recordFailure(ctx.modelDefinitionId, ctx.accountId, "NETWORK");
    yield {
      type: "error",
      errorCode: "NETWORK",
      message: (error as Error).message,
    };
  }
}

/** 调用图片生成模型。 */
export async function invokeImage(
  modelId: number,
  request: ImageInvokeRequest,
): Promise<ImageInvokeResult> {
  const ctx = await buildModelCallContext(modelId, ["IMAGE_GENERATION"]);
  const adapter = resolveProviderAdapter(ctx.account.platform);
  const started = Date.now();

  try {
    const result = await adapter.invokeImage(
      {
        modelIdentifier: ctx.model.identifier,
        platform: ctx.account.platform,
        endpoint: ctx.account.platform,
        baseUrl: ctx.account.baseUrl,
        apiKey: ctx.account.apiKey,
        extraHeaders: ctx.account.extraHeaders,
        extraParams: ctx.account.extraParams,
        modelExtraParams: ctx.model.extraParams,
        reasoningEffort: ctx.model.reasoningEffort,
      },
      request,
    );
    await recordSuccess(
      ctx.modelDefinitionId,
      ctx.accountId,
      Date.now() - started,
    );
    return result;
  } catch (error) {
    if (isAbortError(error) || request.signal?.aborted) {
      throw new HttpError("客户端已断开", 499, "CLIENT_DISCONNECTED");
    }
    await recordFailure(ctx.modelDefinitionId, ctx.accountId, "UPSTREAM_ERROR");
    throw error;
  }
}

/** 管理端列出模型槽位。 */
export async function listSlots(): Promise<AiModelSlotAdmin[]> {
  const rows = await prisma.aiModelSlot.findMany({
    include: { boundModel: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return Promise.all(rows.map((row) => mapSlot(row)));
}

/** 管理端创建模型槽位。 */
export async function createSlot(
  input: CreateSlotInput,
): Promise<AiModelSlotAdmin> {
  await assertModelExists(input.boundModelId);
  const row = await prisma.aiModelSlot.create({
    data: {
      id: input.id,
      displayName: input.displayName,
      description: input.description ?? "",
      tags: normalizeTags(input.tags),
      sortOrder: input.sortOrder ?? 0,
      enabled: input.enabled ?? true,
      failoverStrategy: normalizeFailoverStrategy(input.failoverStrategy),
      defaultTemperature: input.defaultTemperature ?? undefined,
      boundModelId: input.boundModelId ?? null,
    },
    include: { boundModel: true },
  });
  return mapSlot(row);
}

/** 管理端更新模型槽位。 */
export async function updateSlot(
  id: number,
  input: UpdateSlotInput,
): Promise<AiModelSlotAdmin> {
  await assertModelExists(input.boundModelId);
  const row = await prisma.aiModelSlot.update({
    where: { id },
    data: {
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.failoverStrategy !== undefined
        ? {
            failoverStrategy: normalizeFailoverStrategy(input.failoverStrategy),
          }
        : {}),
      ...(input.defaultTemperature !== undefined
        ? { defaultTemperature: input.defaultTemperature }
        : {}),
      ...(input.boundModelId !== undefined
        ? { boundModelId: input.boundModelId }
        : {}),
    },
    include: { boundModel: true },
  });
  return mapSlot(row);
}

/** 管理端删除模型槽位。 */
export async function deleteSlot(id: number): Promise<boolean> {
  await prisma.aiModelSlot.delete({ where: { id } });
  return true;
}

/** 管理端绑定模型槽位。 */
export async function bindSlot(
  id: number,
  modelId: number | null,
): Promise<AiModelSlotAdmin> {
  await assertModelExists(modelId);
  const row = await prisma.aiModelSlot.update({
    where: { id },
    data: { boundModelId: modelId },
    include: { boundModel: true },
  });
  return mapSlot(row);
}

/** 管理端分页列出模型定义。 */
export async function listModelDefinitions(query: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}): Promise<PagedResult<ModelDefinitionAdmin>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Record<string, unknown> = {};
  if (query.keyword) {
    where.OR = [
      { identifier: { contains: query.keyword } },
      { displayName: { contains: query.keyword } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.aiModelDefinition.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ id: "desc" }],
    }),
    prisma.aiModelDefinition.count({ where }),
  ]);
  return { items: items.map(mapDefinition), total, page, pageSize };
}

/** 管理端获取模型定义详情。 */
export async function modelDefinitionDetail(
  id: number,
): Promise<ModelDefinitionAdmin> {
  const row = await prisma.aiModelDefinition.findUnique({ where: { id } });
  if (!row) throw new HttpError("模型定义不存在", 404);
  return mapDefinition(row);
}

/** 管理端创建模型定义。 */
export async function createModelDefinition(
  input: CreateModelDefinitionInput,
): Promise<ModelDefinitionAdmin> {
  const row = await prisma.aiModelDefinition.create({
    data: {
      identifier: input.identifier,
      displayName: input.displayName,
      contextWindow: input.contextWindow,
      maxOutputTokens: input.maxOutputTokens,
      defaultTemperature: input.defaultTemperature,
      reasoningEffort: normalizeReasoningEffort(input.reasoningEffort),
      extraParams: input.extraParams as Prisma.InputJsonValue | undefined,
      capabilities: normalizeCapabilities(input.capabilities),
      enabled: input.enabled ?? true,
    },
  });
  return mapDefinition(row);
}

/** 管理端更新模型定义。 */
export async function updateModelDefinition(
  id: number,
  input: UpdateModelDefinitionInput,
): Promise<ModelDefinitionAdmin> {
  const row = await prisma.aiModelDefinition.update({
    where: { id },
    data: {
      ...(input.identifier !== undefined
        ? { identifier: input.identifier }
        : {}),
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.contextWindow !== undefined
        ? { contextWindow: input.contextWindow }
        : {}),
      ...(input.maxOutputTokens !== undefined
        ? { maxOutputTokens: input.maxOutputTokens }
        : {}),
      ...(input.defaultTemperature !== undefined
        ? { defaultTemperature: input.defaultTemperature }
        : {}),
      ...(input.reasoningEffort !== undefined
        ? { reasoningEffort: normalizeReasoningEffort(input.reasoningEffort) }
        : {}),
      ...(input.extraParams !== undefined
        ? { extraParams: input.extraParams as Prisma.InputJsonValue }
        : {}),
      ...(input.capabilities !== undefined
        ? { capabilities: normalizeCapabilities(input.capabilities) }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  return mapDefinition(row);
}

/** 管理端删除模型定义。 */
export async function deleteModelDefinition(id: number): Promise<boolean> {
  const [slotCount, bindingCount] = await Promise.all([
    prisma.aiModelSlot.count({ where: { boundModelId: id } }),
    prisma.aiModelAccountBinding.count({ where: { modelId: id } }),
  ]);
  if (slotCount || bindingCount) throw new HttpError("模型定义仍被使用", 409);
  await prisma.aiModelDefinition.delete({ where: { id } });
  return true;
}

/** 管理端分页列出访问账号。 */
export async function listProviderAccounts(query: {
  page?: number;
  pageSize?: number;
  platform?: string;
  enabled?: boolean;
}): Promise<PagedResult<ProviderAccountAdmin>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Record<string, unknown> = {};
  if (query.platform) where.platform = query.platform;
  if (query.enabled !== undefined) where.enabled = query.enabled;
  const [items, total] = await Promise.all([
    prisma.aiProviderAccount.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ id: "desc" }],
    }),
    prisma.aiProviderAccount.count({ where }),
  ]);
  return { items: items.map(mapAccount), total, page, pageSize };
}

/** 管理端获取访问账号详情。 */
export async function providerAccountDetail(
  id: number,
): Promise<ProviderAccountAdmin> {
  const row = await prisma.aiProviderAccount.findUnique({ where: { id } });
  if (!row) throw new HttpError("访问账号不存在", 404);
  return mapAccount(row);
}

/** 管理端创建访问账号。 */
export async function createProviderAccount(
  input: CreateProviderAccountInput,
): Promise<ProviderAccountAdmin> {
  const row = await prisma.aiProviderAccount.create({
    data: {
      platform: input.platform,
      label: input.label,
      baseUrl: input.baseUrl,
      apiKeyEncrypted: encryptProviderApiKey(input.apiKey),
      extraHeaders: input.extraHeaders as Prisma.InputJsonValue | undefined,
      extraParams: input.extraParams as Prisma.InputJsonValue | undefined,
      priority: input.priority ?? 0,
      weight: input.weight ?? 1,
      enabled: input.enabled ?? true,
    },
  });
  return mapAccount(row);
}

/** 管理端更新访问账号。 */
export async function updateProviderAccount(
  id: number,
  input: UpdateProviderAccountInput,
): Promise<ProviderAccountAdmin> {
  const row = await prisma.aiProviderAccount.update({
    where: { id },
    data: {
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
      ...(input.apiKey !== undefined && input.apiKey !== ""
        ? { apiKeyEncrypted: encryptProviderApiKey(input.apiKey) }
        : {}),
      ...(input.extraHeaders !== undefined
        ? { extraHeaders: input.extraHeaders as Prisma.InputJsonValue }
        : {}),
      ...(input.extraParams !== undefined
        ? { extraParams: input.extraParams as Prisma.InputJsonValue }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  return mapAccount(row);
}

/** 管理端删除访问账号。 */
export async function deleteProviderAccount(id: number): Promise<boolean> {
  const count = await prisma.aiModelAccountBinding.count({
    where: { accountId: id },
  });
  if (count) throw new HttpError("访问账号仍被模型绑定", 409);
  await prisma.aiProviderAccount.delete({ where: { id } });
  return true;
}

function bindingToAdmin(
  row: {
    modelId: number;
    accountId: number;
    priority: number;
    enabled: boolean;
    account: Parameters<typeof mapAccount>[0];
  },
  health: ProviderAccountHealthAdmin | null,
): ModelAccountBindingAdmin {
  return {
    modelId: row.modelId,
    accountId: row.accountId,
    priority: row.priority,
    enabled: row.enabled,
    account: mapAccount(row.account),
    health,
  };
}

/** 管理端列出模型候选账号。 */
export async function listModelAccounts(
  modelId: number,
): Promise<ModelAccountBindingAdmin[]> {
  const [rows, healthMap] = await Promise.all([
    prisma.aiModelAccountBinding.findMany({
      where: { modelId },
      include: { account: true },
      orderBy: [{ priority: "asc" }, { accountId: "asc" }],
    }),
    healthByModel(modelId),
  ]);
  return rows.map((row) =>
    bindingToAdmin(
      row,
      healthMap.get(row.accountId)
        ? mapHealth(healthMap.get(row.accountId)!)
        : null,
    ),
  );
}

/** 管理端绑定模型账号。 */
export async function bindModelAccount(
  modelId: number,
  input: BindAccountInput,
): Promise<ModelAccountBindingAdmin> {
  const row = await prisma.aiModelAccountBinding.upsert({
    where: {
      modelId_accountId: { modelId, accountId: input.accountId },
    },
    create: {
      modelId,
      accountId: input.accountId,
      priority: input.priority ?? 0,
      enabled: input.enabled ?? true,
    },
    update: {
      priority: input.priority ?? 0,
      enabled: input.enabled ?? true,
    },
    include: { account: true },
  });
  return bindingToAdmin(row, null);
}

/** 管理端更新模型账号绑定。 */
export async function updateModelAccount(
  modelId: number,
  accountId: number,
  input: { priority?: number; enabled?: boolean },
): Promise<ModelAccountBindingAdmin> {
  const [row, health] = await Promise.all([
    prisma.aiModelAccountBinding.update({
      where: { modelId_accountId: { modelId, accountId } },
      data: {
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
      include: { account: true },
    }),
    prisma.aiProviderAccountHealth.findUnique({
      where: { modelId_accountId: { modelId, accountId } },
    }),
  ]);
  return bindingToAdmin(row, health ? mapHealth(health) : null);
}

/** 管理端解绑模型账号。 */
export async function unbindModelAccount(
  modelId: number,
  accountId: number,
): Promise<boolean> {
  await prisma.aiModelAccountBinding.delete({
    where: { modelId_accountId: { modelId, accountId } },
  });
  return true;
}

/** 管理端批量重排模型账号。 */
export async function reorderModelAccounts(
  modelId: number,
  input: ReorderAccountInput,
): Promise<boolean> {
  await prisma.$transaction(
    input.orders.map((item) =>
      prisma.aiModelAccountBinding.update({
        where: { modelId_accountId: { modelId, accountId: item.accountId } },
        data: { priority: item.priority },
      }),
    ),
  );
  return true;
}

/** 管理端查询健康度。 */
export async function listHealth(query: {
  modelId?: number;
  accountId?: number;
  platform?: string;
}): Promise<ProviderAccountHealthAdmin[]> {
  const accountIds = query.platform
    ? (
        await prisma.aiProviderAccount.findMany({
          where: { platform: query.platform },
          select: { id: true },
        })
      ).map((account) => account.id)
    : undefined;

  const rows = await prisma.aiProviderAccountHealth.findMany({
    where: {
      ...(query.modelId !== undefined ? { modelId: query.modelId } : {}),
      ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
      ...(accountIds !== undefined ? { accountId: { in: accountIds } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(mapHealth);
}

/** 管理端重置健康度。 */
export async function resetHealth(
  modelId: number,
  accountId: number,
): Promise<ProviderAccountHealthAdmin> {
  const row = await prisma.aiProviderAccountHealth.upsert({
    where: { modelId_accountId: { modelId, accountId } },
    create: { modelId, accountId, windowSize: getAiHealthWindowSize() },
    update: {
      successCount: 0,
      failureCount: 0,
      p95LatencyMs: null,
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCode: null,
    },
  });
  return mapHealth(row);
}

// ---------- 用户模型状态 ----------

/** API 返回的用户模型状态。 */
export interface UserModelStateOutput {
  modelId: number | null;
  temperature: number | null;
}

/** 保存用户模型状态入参。 */
export interface SaveUserModelStateInput {
  modelId: number;
  temperature?: number | null;
}

/**
 * 获取用户最新模型状态。
 * @param userId 用户 ID。
 * @returns 模型状态，不存在则返回 null。
 */
export async function getUserModelState(
  userId: number,
): Promise<UserModelStateOutput | null> {
  const row = await prisma.userModelState.findUnique({
    where: { userId },
    select: { modelId: true, temperature: true },
  });
  if (!row) return null;
  return {
    modelId: row.modelId,
    temperature: row.temperature ? Number(row.temperature) : null,
  };
}

/**
 * 保存用户模型状态（upsert）。
 * @param userId 用户 ID。
 * @param input 入参。
 */
export async function saveUserModelState(
  userId: number,
  input: SaveUserModelStateInput,
): Promise<UserModelStateOutput> {
  const row = await prisma.userModelState.upsert({
    where: { userId },
    create: {
      userId,
      modelId: input.modelId,
      temperature: input.temperature ?? undefined,
    },
    update: {
      modelId: input.modelId,
      temperature: input.temperature ?? undefined,
    },
    select: { modelId: true, temperature: true },
  });
  return {
    modelId: row.modelId,
    temperature: row.temperature ? Number(row.temperature) : null,
  };
}

// ---------- 用户提示词状态 ----------

/** API 返回的提示词快照。 */
export interface PromptSnapshot {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
}

/** API 返回的单个分类提示词状态。 */
export interface UserPromptStateOutput {
  categoryId: number;
  promptTemplate: PromptSnapshot | null;
}

/** 保存用户提示词状态入参。 */
export interface SaveUserPromptStateInput {
  categoryId: number;
  promptTemplateId?: number | null;
}

/**
 * 获取用户所有分类的提示词状态。
 * 如果保存的提示词模板已被删除或无权访问，则对应的 promptTemplate 为 null。
 * @param userId 用户 ID。
 * @returns 分类提示词状态数组，未保存过则返回空数组。
 */
export async function getUserPromptState(
  userId: number,
): Promise<UserPromptStateOutput[]> {
  const rows = await prisma.userPromptState.findMany({
    where: { userId },
    select: { categoryId: true, promptTemplateId: true },
    orderBy: { categoryId: "asc" },
  });

  const promptIds = rows
    .map((r) => r.promptTemplateId)
    .filter((id): id is number => id != null);

  const promptMap = new Map<number, PromptSnapshot>();
  if (promptIds.length) {
    const prompts = await prisma.promptTemplate.findMany({
      where: { id: { in: promptIds } },
      select: {
        id: true,
        name: true,
        categoryId: true,
        isDeleted: true,
        privacy: true,
        userId: true,
        category: { select: { name: true } },
      },
    });
    for (const p of prompts) {
      if (
        !p.isDeleted &&
        (p.privacy === "SHARED" || p.userId === userId)
      ) {
        promptMap.set(p.id, {
          id: p.id,
          name: p.name,
          categoryId: p.categoryId,
          categoryName: p.category?.name ?? null,
        });
      }
    }
  }

  return rows.map((row) => ({
    categoryId: row.categoryId,
    promptTemplate: row.promptTemplateId
      ? promptMap.get(row.promptTemplateId) ?? null
      : null,
  }));
}

/**
 * 保存用户某个分类的提示词状态（upsert）。
 * @param userId 用户 ID。
 * @param input 入参。
 */
export async function saveUserPromptState(
  userId: number,
  input: SaveUserPromptStateInput,
): Promise<UserPromptStateOutput> {
  const row = await prisma.userPromptState.upsert({
    where: { userId_categoryId: { userId, categoryId: input.categoryId } },
    create: {
      userId,
      categoryId: input.categoryId,
      promptTemplateId: input.promptTemplateId ?? undefined,
    },
    update: {
      promptTemplateId: input.promptTemplateId ?? undefined,
    },
    select: { categoryId: true, promptTemplateId: true },
  });

  let promptTemplate: PromptSnapshot | null = null;
  if (row.promptTemplateId) {
    const prompt = await prisma.promptTemplate.findUnique({
      where: { id: row.promptTemplateId },
      select: {
        id: true,
        name: true,
        categoryId: true,
        isDeleted: true,
        privacy: true,
        userId: true,
        category: { select: { name: true } },
      },
    });
    if (
      prompt &&
      !prompt.isDeleted &&
      (prompt.privacy === "SHARED" || prompt.userId === userId)
    ) {
      promptTemplate = {
        id: prompt.id,
        name: prompt.name,
        categoryId: prompt.categoryId,
        categoryName: prompt.category?.name ?? null,
      };
    }
  }

  return {
    categoryId: row.categoryId,
    promptTemplate,
  };
}
