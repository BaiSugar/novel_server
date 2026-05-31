import { t } from "elysia";
import * as FavoriteService from "@/app/service/prompt/promptFavorite.service";

export default $g.ctrl((app) =>
  app
    .get(
      "favorites",
      async ({ currentUser, query }) =>
        $g.success(
          await FavoriteService.list(
            currentUser!.id,
            query.page,
            query.pageSize,
          ),
        ),
      {
        requireAuth: true,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
        }),
      },
    )
    .put(
      "favorites/:promptTemplateId",
      async ({ currentUser, params }) =>
        $g.success(
          await FavoriteService.add(
            currentUser!.id,
            Number(params.promptTemplateId),
          ),
          "已收藏",
        ),
      {
        requireAuth: true,
        params: t.Object({ promptTemplateId: t.Numeric() }),
      },
    )
    .delete(
      "favorites/:promptTemplateId",
      async ({ currentUser, params }) => {
        await FavoriteService.remove(
          currentUser!.id,
          Number(params.promptTemplateId),
        );
        return $g.success(null, "已取消收藏");
      },
      {
        requireAuth: true,
        params: t.Object({ promptTemplateId: t.Numeric() }),
      },
    ),
);