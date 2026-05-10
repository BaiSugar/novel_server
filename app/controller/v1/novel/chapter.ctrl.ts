import { t } from "elysia";
import * as ChapterService from "@/app/service/novel/chapter.service";

export default $g.ctrl((app) =>
  app
    .get(
      "books/:bookId/chapters",
      async ({ params }) =>
        $g.success(await ChapterService.listByBook(Number(params.bookId))),
      {
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
      },
    )
    .get(
      "chapters/:id",
      async ({ params }) =>
        $g.success(await ChapterService.detail(Number(params.id))),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .post(
      "books/:bookId/chapters",
      async ({ params, body }) =>
        $g.success(await ChapterService.create(Number(params.bookId), body), "创建成功"),
      {
        audit: { category: "novel", action: "create_chapter" },
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
        body: t.Object({
          title: t.String({ minLength: 1, maxLength: 500 }),
          content: t.Optional(t.String()),
        }),
      },
    )
    .put(
      "chapters/:id",
      async ({ params, body }) =>
        $g.success(await ChapterService.update(Number(params.id), body), "更新成功"),
      {
        audit: { category: "novel", action: "update_chapter" },
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({
          title: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
          content: t.Optional(t.String()),
        }),
      },
    )
    .delete(
      "chapters/:id",
      async ({ params }) => {
        await ChapterService.remove(Number(params.id));
        return $g.success(null, "删除成功");
      },
      {
        audit: { category: "novel", action: "delete_chapter" },
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .put(
      "books/:bookId/chapters/reorder",
      async ({ params, body }) => {
        await ChapterService.reorder(Number(params.bookId), body.ids);
        return $g.success(null, "排序成功");
      },
      {
        audit: { category: "novel", action: "reorder_chapter" },
        requireAuth: true,
        params: t.Object({ bookId: t.Numeric() }),
        body: t.Object({
          ids: t.Array(t.Number()),
        }),
      },
    ),
);