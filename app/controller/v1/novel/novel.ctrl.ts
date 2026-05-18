import { t } from "elysia";
import { NovelType } from "@/app/generated/prisma/enums";
import * as NovelService from "@/app/service/novel/novel.service";

/** 作品类型约束。 */
const NovelTypeSchema = t.Optional(
  t.Union([t.Literal(NovelType.NOVEL), t.Literal(NovelType.SCRIPT)]),
);

export default $g.ctrl((app) =>
  app
    .get(
      "books",
      async ({ currentUser, query }) =>
        $g.success(await NovelService.list(currentUser!.id, query)),
      {
        requireAuth: true,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
          archived: t.Optional(t.BooleanString()),
          isTrash: t.Optional(t.Numeric()),
          keyword: t.Optional(t.String()),
        }),
      },
    )
    .get(
      "books/:bookId",
      async ({ currentUser, params }) =>
        $g.success(
          await NovelService.detail(Number(params.bookId), currentUser!.id),
        ),
      {
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
      },
    )
    .post(
      "books",
      async ({ currentUser, body }) =>
        $g.success(
          await NovelService.create(currentUser!.id, body),
          "创建成功",
        ),
      {
        audit: { category: "novel", action: "create" },
        requireAuth: true,
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 255 }),
          description: t.Optional(t.String()),
          type: NovelTypeSchema,
        }),
      },
    )
    .put(
      "books/:bookId",
      async ({ currentUser, params, body }) =>
        $g.success(
          await NovelService.update(
            Number(params.bookId),
            currentUser!.id,
            body,
          ),
          "更新成功",
        ),
      {
        audit: { category: "novel", action: "update" },
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
          description: t.Optional(t.String()),
          type: NovelTypeSchema,
        }),
      },
    )
    .put(
      "books/:bookId/archive",
      async ({ currentUser, params, body }) =>
        $g.success(
          await NovelService.toggleArchive(
            Number(params.bookId),
            currentUser!.id,
            body.archived,
          ),
        ),
      {
        audit: { category: "novel", action: "archive" },
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
        body: t.Object({ archived: t.Boolean() }),
      },
    )
    .delete(
      "books/:bookId",
      async ({ currentUser, params }) => {
        await NovelService.remove(Number(params.bookId), currentUser!.id);
        return $g.success(null, "已移入回收站");
      },
      {
        audit: { category: "novel", action: "delete" },
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
      },
    )
    .post(
      "books/:bookId/restore",
      async ({ currentUser, params }) =>
        $g.success(
          await NovelService.restore(Number(params.bookId), currentUser!.id),
          "已恢复",
        ),
      {
        audit: { category: "novel", action: "restore" },
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
      },
    )
    .delete(
      "books/:bookId/permanent",
      async ({ currentUser, params }) => {
        await NovelService.permanentDelete(
          Number(params.bookId),
          currentUser!.id,
        );
        return $g.success(null, "已永久删除");
      },
      {
        audit: { category: "novel", action: "permanent_delete" },
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
      },
    ),
);
