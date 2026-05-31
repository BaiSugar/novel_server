import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import * as ContextItemService from "@/app/service/aiGeneration/contextItem.service";

export default $g.ctrl((app) =>
  app
    .get(
      "context-items",
      async ({ currentUser, query }) =>
        $g.success(
          await ContextItemService.listContextItemOptions(currentUser!.id, query),
        ),
      {
        requirePermission: PERM.AI_GENERATION_INVOKE,
        query: t.Object({
          novelId: t.Optional(t.Numeric()),
          keyword: t.Optional(t.String({ maxLength: 128 })),
          sourceKey: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
          folderId: t.Optional(t.Numeric()),
          chapterId: t.Optional(t.Numeric()),
        }),
      },
    )
    .get(
      "context-items/selection-state",
      async ({ currentUser, query }) =>
        $g.success(
          await ContextItemService.contextSelectionState(currentUser!.id, {
            novelId: Number(query.novelId),
            chapterId: query.chapterId === undefined ? undefined : Number(query.chapterId),
          }),
        ),
      {
        requirePermission: PERM.AI_GENERATION_INVOKE,
        query: t.Object({
          novelId: t.Numeric(),
          chapterId: t.Optional(t.Numeric()),
        }),
      },
    )
    .put(
      "context-items/selection-state",
      async ({ currentUser, body }) =>
        $g.success(
          await ContextItemService.saveContextSelectionState(currentUser!.id, {
            novelId: body.novelId,
            chapterId: body.chapterId === undefined ? undefined : Number(body.chapterId),
            sourceKey: body.sourceKey,
            contextItemIds: body.contextItemIds,
          }),
          "保存成功",
        ),
      {
        requirePermission: PERM.AI_GENERATION_INVOKE,
        body: t.Object({
          novelId: t.Numeric(),
          chapterId: t.Optional(t.Numeric()),
          sourceKey: t.String({ minLength: 1, maxLength: 64 }),
          contextItemIds: t.Optional(t.Array(t.Numeric())),
        }),
      },
    ),
);
