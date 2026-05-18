import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import * as ContextItemService from "@/app/service/aiGeneration/contextItem.service";

export default $g.ctrl((app) =>
  app.get(
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
      }),
    },
  ),
);
