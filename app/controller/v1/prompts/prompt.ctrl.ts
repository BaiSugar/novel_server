import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import { CategoryType, PromptPrivacy } from "@/app/generated/prisma/enums";
import * as CategoryService from "@/app/service/category/category.service";
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
      "",
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
          categoryId: t.Optional(t.Numeric()),
        }),
      },
    )
    // ---- 提示词分类列表 ----
    .get(
      "categories",
      async () => $g.success(await CategoryService.list(CategoryType.PROMPT)),
      {
        requireAuth: true,
      },
    )
    // ---- 创建提示词分类 ----
    .post(
      "categories",
      async ({ body }) =>
        $g.success(
          await CategoryService.create(CategoryType.PROMPT, body),
          "创建成功",
        ),
      {
        audit: { category: "prompt_category", action: "create" },
        requirePermission: PERM.PROMPT_CATEGORY_MANAGE,
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 64 }),
          order: t.Optional(t.Numeric()),
        }),
      },
    )
    // ---- 更新提示词分类 ----
    .put(
      "categories/:categoryId",
      async ({ params, body }) =>
        $g.success(
          await CategoryService.update(
            Number(params.categoryId),
            CategoryType.PROMPT,
            body,
          ),
          "更新成功",
        ),
      {
        audit: { category: "prompt_category", action: "update" },
        requirePermission: PERM.PROMPT_CATEGORY_MANAGE,
        params: t.Object({ categoryId: t.Numeric() }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
          order: t.Optional(t.Numeric()),
        }),
      },
    )
    // ---- 删除提示词分类 ----
    .delete(
      "categories/:categoryId",
      async ({ params }) => {
        await CategoryService.remove(
          Number(params.categoryId),
          CategoryType.PROMPT,
        );
        return $g.success(null, "删除成功");
      },
      {
        audit: { category: "prompt_category", action: "delete" },
        requirePermission: PERM.PROMPT_CATEGORY_MANAGE,
        params: t.Object({ categoryId: t.Numeric() }),
      },
    )
    // ---- 详情 ----
    .get(
      ":id",
      async ({ currentUser, params }) =>
        $g.success(
          await PromptService.detail(Number(params.id), currentUser!.id),
        ),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    // ---- 编辑详情（仅作者可查看正文） ----
    .get(
      "edit/:id",
      async ({ currentUser, params }) =>
        $g.success(
          await PromptService.detail(Number(params.id), currentUser!.id, {
            includeContent: true,
          }),
        ),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    // ---- 创建 ----
    .post(
      "",
      async ({ currentUser, body }) =>
        $g.success(
          await PromptService.create(currentUser!.id, body),
          "创建成功",
        ),
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
          categoryId: t.Optional(t.Union([t.Numeric(), t.Null()])),
        }),
      },
    )
    // ---- 更新 ----
    .put(
      ":id",
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
          usageGuide: t.Optional(
            t.Union([t.String({ maxLength: 500 }), t.Null()]),
          ),
          categoryId: t.Optional(t.Union([t.Numeric(), t.Null()])),
        }),
      },
    )
    // ---- 删除 ----
    .delete(
      ":id",
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
      ":id/approve",
      async ({ params, body }) =>
        $g.success(
          await PromptService.approve(Number(params.id), body.approved),
        ),
      {
        audit: { category: "prompt", action: "approve" },
        requirePermission: PERM.PROMPT_APPROVE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({ approved: t.Boolean() }),
      },
    )
    // ---- 版本列表 ----
    .get(
      ":id/versions",
      async ({ currentUser, params }) =>
        $g.success(
          await PromptService.listVersions(Number(params.id), currentUser!.id),
        ),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    // ---- 版本详情 ----
    .get(
      ":id/versions/:versionId",
      async ({ currentUser, params }) =>
        $g.success(
          await PromptService.versionDetail(
            Number(params.id),
            Number(params.versionId),
            currentUser!.id,
          ),
        ),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric(), versionId: t.Numeric() }),
      },
    )
    // ---- 恢复版本 ----
    .post(
      ":id/versions/:versionId/restore",
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
