import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import {
  AiModelFailoverStrategy,
  AiReasoningEffort,
} from "@/app/generated/prisma/enums";
import * as AiModelService from "@/app/service/aiModel/model.service";

const TagsSchema = t.Optional(
  t.Array(
    t.Union([
      t.Literal("hot"),
      t.Literal("free"),
      t.Literal("new"),
      t.Literal("beta"),
    ]),
  ),
);

const CapabilitySchema = t.Optional(
  t.Array(
    t.Union([
      t.Literal("TEXT_CHAT"),
      t.Literal("TOOL_CALLING"),
      t.Literal("STREAMING"),
      t.Literal("IMAGE_GENERATION"),
      t.Literal("MULTI_MODAL_INPUT"),
      t.Literal("JSON_MODE"),
    ]),
  ),
);

const FailoverSchema = t.Optional(
  t.Union([
    t.Literal(AiModelFailoverStrategy.SEQUENTIAL),
    t.Literal(AiModelFailoverStrategy.ROUND_ROBIN),
  ]),
);

const ReasoningSchema = t.Optional(
  t.Union([
    t.Literal(AiReasoningEffort.NONE),
    t.Literal(AiReasoningEffort.LOW),
    t.Literal(AiReasoningEffort.MEDIUM),
    t.Literal(AiReasoningEffort.HIGH),
    t.Literal(AiReasoningEffort.XHIGH),
  ]),
);

const SlotBodySchema = t.Object({
  id: t.Optional(t.Numeric()),
  displayName: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
  description: t.Optional(t.String({ maxLength: 500 })),
  tags: TagsSchema,
  sortOrder: t.Optional(t.Numeric()),
  enabled: t.Optional(t.Boolean()),
  failoverStrategy: FailoverSchema,
  defaultTemperature: t.Optional(
    t.Union([t.Number({ minimum: 0, maximum: 2 }), t.Null()]),
  ),
  boundModelId: t.Optional(t.Union([t.Numeric(), t.Null()])),
});

const ModelBodySchema = t.Object({
  identifier: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  displayName: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  contextWindow: t.Optional(t.Numeric()),
  maxOutputTokens: t.Optional(t.Numeric()),
  defaultTemperature: t.Optional(t.Number({ minimum: 0, maximum: 2 })),
  reasoningEffort: ReasoningSchema,
  extraParams: t.Optional(t.Unknown()),
  capabilities: CapabilitySchema,
  enabled: t.Optional(t.Boolean()),
});

const AccountBodySchema = t.Object({
  platform: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
  label: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
  baseUrl: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  apiKey: t.Optional(t.String({ maxLength: 4096 })),
  extraHeaders: t.Optional(t.Unknown()),
  extraParams: t.Optional(t.Unknown()),
  priority: t.Optional(t.Numeric()),
  weight: t.Optional(t.Numeric()),
  enabled: t.Optional(t.Boolean()),
});

export default $g.ctrl((app) =>
  app
    .get("slots", async () => $g.success(await AiModelService.listSlots()), {
      requirePermission: PERM.AI_MODEL_MANAGE,
    })
    .post(
      "slots",
      async ({ body }) =>
        $g.success(
          await AiModelService.createSlot({
            id: Number(body.id),
            displayName: String(body.displayName),
            description: body.description,
            tags: body.tags,
            sortOrder: body.sortOrder,
            enabled: body.enabled,
            failoverStrategy: body.failoverStrategy,
            defaultTemperature: body.defaultTemperature,
            boundModelId: body.boundModelId,
          }),
          "创建成功",
        ),
      {
        audit: { category: "system", action: "ai.slot.create" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        body: t.Intersect([
          SlotBodySchema,
          t.Object({
            id: t.Numeric(),
            displayName: t.String({ minLength: 1, maxLength: 64 }),
          }),
        ]),
      },
    )
    .put(
      "slots/:id",
      async ({ params, body }) =>
        $g.success(
          await AiModelService.updateSlot(Number(params.id), body),
          "更新成功",
        ),
      {
        audit: { category: "system", action: "ai.slot.update" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: SlotBodySchema,
      },
    )
    .delete(
      "slots/:id",
      async ({ params }) =>
        $g.success(
          await AiModelService.deleteSlot(Number(params.id)),
          "删除成功",
        ),
      {
        audit: { category: "system", action: "ai.slot.delete" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .put(
      "slots/:id/bind",
      async ({ params, body }) =>
        $g.success(
          await AiModelService.bindSlot(
            Number(params.id),
            body.modelId ?? null,
          ),
          "绑定成功",
        ),
      {
        audit: { category: "system", action: "ai.slot.bind" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({ modelId: t.Union([t.Numeric(), t.Null()]) }),
      },
    )
    .get(
      "models",
      async ({ query }) =>
        $g.success(await AiModelService.listModelDefinitions(query)),
      {
        requirePermission: PERM.AI_MODEL_MANAGE,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
          keyword: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "models",
      async ({ body }) =>
        $g.success(
          await AiModelService.createModelDefinition({
            identifier: String(body.identifier),
            displayName: String(body.displayName),
            contextWindow: Number(body.contextWindow),
            maxOutputTokens: Number(body.maxOutputTokens),
            defaultTemperature: Number(body.defaultTemperature),
            reasoningEffort: body.reasoningEffort,
            extraParams: body.extraParams,
            capabilities: body.capabilities,
            enabled: body.enabled,
          }),
          "创建成功",
        ),
      {
        audit: { category: "system", action: "ai.model.create" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        body: t.Intersect([
          ModelBodySchema,
          t.Object({
            identifier: t.String({ minLength: 1, maxLength: 128 }),
            displayName: t.String({ minLength: 1, maxLength: 128 }),
            contextWindow: t.Numeric(),
            maxOutputTokens: t.Numeric(),
            defaultTemperature: t.Number({ minimum: 0, maximum: 2 }),
          }),
        ]),
      },
    )
    .get(
      "models/:modelId",
      async ({ params }) =>
        $g.success(
          await AiModelService.modelDefinitionDetail(Number(params.modelId)),
        ),
      {
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric() }),
      },
    )
    .put(
      "models/:modelId",
      async ({ params, body }) =>
        $g.success(
          await AiModelService.updateModelDefinition(
            Number(params.modelId),
            body,
          ),
          "更新成功",
        ),
      {
        audit: { category: "system", action: "ai.model.update" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric() }),
        body: ModelBodySchema,
      },
    )
    .delete(
      "models/:modelId",
      async ({ params }) =>
        $g.success(
          await AiModelService.deleteModelDefinition(Number(params.modelId)),
          "删除成功",
        ),
      {
        audit: { category: "system", action: "ai.model.delete" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric() }),
      },
    )
    .get(
      "accounts",
      async ({ query }) =>
        $g.success(await AiModelService.listProviderAccounts(query)),
      {
        requirePermission: PERM.AI_MODEL_MANAGE,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
          platform: t.Optional(t.String()),
          enabled: t.Optional(t.BooleanString()),
        }),
      },
    )
    .post(
      "accounts",
      async ({ body }) =>
        $g.success(
          await AiModelService.createProviderAccount({
            platform: String(body.platform),
            label: String(body.label),
            baseUrl: String(body.baseUrl),
            apiKey: String(body.apiKey),
            extraHeaders: body.extraHeaders,
            extraParams: body.extraParams,
            priority: body.priority,
            weight: body.weight,
            enabled: body.enabled,
          }),
          "创建成功",
        ),
      {
        audit: { category: "system", action: "ai.account.create" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        body: t.Intersect([
          AccountBodySchema,
          t.Object({
            platform: t.String({ minLength: 1, maxLength: 32 }),
            label: t.String({ minLength: 1, maxLength: 64 }),
            baseUrl: t.String({ minLength: 1, maxLength: 255 }),
            apiKey: t.String({ minLength: 1, maxLength: 4096 }),
          }),
        ]),
      },
    )
    .get(
      "accounts/:id",
      async ({ params }) =>
        $g.success(
          await AiModelService.providerAccountDetail(Number(params.id)),
        ),
      {
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .put(
      "accounts/:id",
      async ({ params, body }) =>
        $g.success(
          await AiModelService.updateProviderAccount(Number(params.id), body),
          "更新成功",
        ),
      {
        audit: { category: "system", action: "ai.account.update" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: AccountBodySchema,
      },
    )
    .delete(
      "accounts/:id",
      async ({ params }) =>
        $g.success(
          await AiModelService.deleteProviderAccount(Number(params.id)),
          "删除成功",
        ),
      {
        audit: { category: "system", action: "ai.account.delete" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .get(
      "models/:modelId/accounts",
      async ({ params }) =>
        $g.success(
          await AiModelService.listModelAccounts(Number(params.modelId)),
        ),
      {
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric() }),
      },
    )
    .post(
      "models/:modelId/accounts",
      async ({ params, body }) =>
        $g.success(
          await AiModelService.bindModelAccount(Number(params.modelId), body),
          "绑定成功",
        ),
      {
        audit: { category: "system", action: "ai.model_account.create" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric() }),
        body: t.Object({
          accountId: t.Numeric(),
          priority: t.Optional(t.Numeric()),
          enabled: t.Optional(t.Boolean()),
        }),
      },
    )
    .put(
      "models/:modelId/accounts/:accountId",
      async ({ params, body }) =>
        $g.success(
          await AiModelService.updateModelAccount(
            Number(params.modelId),
            Number(params.accountId),
            body,
          ),
          "更新成功",
        ),
      {
        audit: { category: "system", action: "ai.model_account.update" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric(), accountId: t.Numeric() }),
        body: t.Object({
          priority: t.Optional(t.Numeric()),
          enabled: t.Optional(t.Boolean()),
        }),
      },
    )
    .delete(
      "models/:modelId/accounts/:accountId",
      async ({ params }) =>
        $g.success(
          await AiModelService.unbindModelAccount(
            Number(params.modelId),
            Number(params.accountId),
          ),
          "解绑成功",
        ),
      {
        audit: { category: "system", action: "ai.model_account.delete" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric(), accountId: t.Numeric() }),
      },
    )
    .put(
      "models/:modelId/accounts/reorder",
      async ({ params, body }) =>
        $g.success(
          await AiModelService.reorderModelAccounts(
            Number(params.modelId),
            body,
          ),
          "排序成功",
        ),
      {
        audit: { category: "system", action: "ai.model_account.reorder" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric() }),
        body: t.Object({
          orders: t.Array(
            t.Object({ accountId: t.Numeric(), priority: t.Numeric() }),
          ),
        }),
      },
    )
    .get(
      "health",
      async ({ query }) => $g.success(await AiModelService.listHealth(query)),
      {
        requirePermission: PERM.AI_MODEL_MANAGE,
        query: t.Object({
          modelId: t.Optional(t.Numeric()),
          accountId: t.Optional(t.Numeric()),
          platform: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "health/:modelId/:accountId/reset",
      async ({ params }) =>
        $g.success(
          await AiModelService.resetHealth(
            Number(params.modelId),
            Number(params.accountId),
          ),
          "已重置",
        ),
      {
        audit: { category: "system", action: "ai.health.reset" },
        requirePermission: PERM.AI_MODEL_MANAGE,
        params: t.Object({ modelId: t.Numeric(), accountId: t.Numeric() }),
      },
    ),
);
