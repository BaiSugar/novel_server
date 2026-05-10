import { t } from "elysia";
import { PromptPrivacy } from "@/app/generated/prisma/enums";
import { PERM } from "@/app/common/permission";
import * as PromptService from "@/app/service/prompt/prompt.service";

/** 隐私设置约束。 */
const PrivacySchema = t.Optional(
  t.Union([
    t.Literal(PromptPrivacy.PRIVATE),
    t.Literal(PromptPrivacy.SHARED),
    t.Literal(PromptPrivacy.AUTHORIZED),
  ]),
);

/** 预制输入选项约束（JSON 数组）。 */
const PresetOptionsSchema = t.Optional(t.Array(t.Any()));

export default $g.ctrl((app) =>
  app
    // ---- 列表 ----
    .get(
      "prompts",
      async ({ currentUser, query }) =>
        $g.success(await PromptService.list(currentUser!.id, query)),
      {
        requireAuth: true,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
          privacy: PrivacySchema,
          approved: t.Optional(t.BooleanString()),
          keyword: t.Optional(t.String()),
        }),
      },
    )
    // ---- 详情 ----
    .get(
      "prompts/:id",
      async ({ currentUser, params }) =>
        $g.success(await PromptService.detail(Number(params.id), currentUser!.id)),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    // ---- 创建 ----
    .post(
      "prompts",
      async ({ currentUser, body }) =>
        $g.success(await PromptService.create(currentUser!.id, body), "创建成功"),
      {
        audit: { category: "prompt", action: "create" },
        requireAuth: true,
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 255 }),
          content: t.String({ minLength: 1 }),
          presetOptions: PresetOptionsSchema,
          description: t.Optional(t.String()),
          privacy: t.Union([
            t.Literal(PromptPrivacy.PRIVATE),
            t.Literal(PromptPrivacy.SHARED),
            t.Literal(PromptPrivacy.AUTHORIZED),
          ]),
          usageGuide: t.Optional(t.String({ maxLength: 500 })),
        }),
      },
    )
    // ---- 更新 ----
    .put(
      "prompts/:id",
      async ({ currentUser, params, body }) =>
        $g.success(
          await PromptService.update(Number(params.id), currentUser!.id, body),
          "更新成功",
        ),
      {
        audit: { category: "prompt", action: "update" },
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
          content: t.Optional(t.String({ minLength: 1 })),
          presetOptions: t.Optional(t.Union([t.Array(t.Any()), t.Null()])),
          description: t.Optional(t.Union([t.String(), t.Null()])),
          privacy: PrivacySchema,
          usageGuide: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
        }),
      },
    )
    // ---- 删除 ----
    .delete(
      "prompts/:id",
      async ({ currentUser, params }) => {
        await PromptService.remove(Number(params.id), currentUser!.id);
        return $g.success(null, "删除成功");
      },
      {
        audit: { category: "prompt", action: "delete" },
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    // ---- 审核 ----
    .put(
      "prompts/:id/approve",
      async ({ params, body }) =>
        $g.success(await PromptService.approve(Number(params.id), body.approved)),
      {
        audit: { category: "prompt", action: "approve" },
        requirePermission: PERM.PROMPT_APPROVE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({ approved: t.Boolean() }),
      },
    )
    // ---- 版本列表 ----
    .get(
      "prompts/:id/versions",
      async ({ params }) =>
        $g.success(await PromptService.listVersions(Number(params.id))),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    // ---- 版本详情 ----
    .get(
      "prompts/:id/versions/:versionId",
      async ({ params }) =>
        $g.success(await PromptService.versionDetail(Number(params.versionId))),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric(), versionId: t.Numeric() }),
      },
    )
    // ---- 恢复版本 ----
    .post(
      "prompts/:id/versions/:versionId/restore",
      async ({ currentUser, params }) =>
        $g.success(
          await PromptService.restoreVersion(
            Number(params.id),
            Number(params.versionId),
            currentUser!.id,
          ),
          "已恢复",
        ),
      {
        audit: { category: "prompt", action: "restore_version" },
        requireAuth: true,
        params: t.Object({ id: t.Numeric(), versionId: t.Numeric() }),
      },
    ),
);