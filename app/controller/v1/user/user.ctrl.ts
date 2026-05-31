import { t } from "elysia";
import * as PreferenceService from "@/app/service/user/preference.service";
import * as UserService from "@/app/service/user/user.service";

const ActionIdSchema = t.Union([
  t.Literal("aiContinueInline"),
  t.Literal("aiPlotAdvice"),
  t.Literal("aiExpandSelection"),
]);

const PromptModeSchema = t.Union([t.Literal("default"), t.Literal("custom")]);

const ContextModeSchema = t.Union([
  t.Literal("auto"),
  t.Literal("cursorWindow"),
  t.Literal("fullChapter"),
]);

const NullableNumberSchema = t.Optional(t.Union([t.Numeric(), t.Null()]));
const NullableStringSchema = t.Optional(t.Union([t.String(), t.Null()]));

const QuickActionBindingSchema = t.Object({
  actionId: ActionIdSchema,
  key: t.String({ maxLength: 64 }),
  enabled: t.Boolean(),
});

const QuickActionSettingSchema = t.Object({
  actionId: ActionIdSchema,
  promptMode: PromptModeSchema,
  promptCategoryId: NullableNumberSchema,
  promptCategoryName: NullableStringSchema,
  promptTemplateId: NullableNumberSchema,
  promptTemplateLabel: NullableStringSchema,
  customPrompt: t.String({ maxLength: 1200 }),
  contextMode: ContextModeSchema,
  contextBeforeMaxLength: t.Optional(
    t.Numeric({ minimum: 200, maximum: 20000 }),
  ),
  contextAfterMaxLength: t.Optional(
    t.Numeric({ minimum: 200, maximum: 20000 }),
  ),
  chapterFullTextCount: t.Numeric({ minimum: 0, maximum: 20 }),
});

const EditorAiQuickActionsSchema = t.Object({
  version: t.Numeric(),
  bindings: t.Array(QuickActionBindingSchema),
  actionSettings: t.Array(QuickActionSettingSchema),
});

export default $g.ctrl((app) =>
  app
    .get(
      "preferences/editor-ai-quick-actions",
      async ({ currentUser }) =>
        $g.success(
          await PreferenceService.getEditorAiQuickActions(currentUser!.id),
        ),
      { requireAuth: true },
    )
    .put(
      "preferences/editor-ai-quick-actions",
      async ({ currentUser, body }) =>
        $g.success(
          await PreferenceService.saveEditorAiQuickActions(
            currentUser!.id,
            body,
          ),
          "已保存",
        ),
      {
        audit: { category: "system", action: "user.preference.update" },
        requireAuth: true,
        body: EditorAiQuickActionsSchema,
      },
    )
    .get(
      "list",
      async ({ query }) => $g.success(await UserService.list(query)),
      {
        requireAuth: true,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
        }),
      },
    )
    .get(
      ":id",
      async ({ params }) =>
        $g.success(await UserService.detail(Number(params.id))),
      {
        requireAuth: true,
        params: t.Object({
          id: t.Numeric(),
        }),
      },
    ),
);
