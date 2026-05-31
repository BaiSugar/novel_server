import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import * as MemoService from "@/app/service/memo/memo.service";

const NullableNumeric = t.Union([t.Numeric(), t.Null()]);
const ScopeSchema = t.Union([t.Literal("GLOBAL"), t.Literal("NOVEL")]);

export default $g.ctrl((app) =>
  app
    .get(
      "folders",
      async ({ currentUser, query }) =>
        $g.success(
          await MemoService.folderTree(currentUser!.id, {
            scope: query.scope,
            novelId: query.novelId === undefined ? undefined : Number(query.novelId),
          }),
        ),
      {
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        query: t.Object({
          scope: ScopeSchema,
          novelId: t.Optional(t.Numeric()),
        }),
      },
    )
    .post(
      "folders",
      async ({ currentUser, body }) =>
        $g.success(
          await MemoService.createFolder(currentUser!.id, body),
          "创建成功",
        ),
      {
        audit: { category: "context_library", action: "memo.folder.create" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        body: t.Object({
          scope: ScopeSchema,
          novelId: t.Optional(t.Numeric()),
          parentId: t.Optional(NullableNumeric),
          name: t.String({ minLength: 1, maxLength: 128 }),
          sortOrder: t.Optional(t.Numeric()),
        }),
      },
    )
    .put(
      "folders/:id",
      async ({ currentUser, params, body }) =>
        $g.success(
          await MemoService.updateFolder(currentUser!.id, Number(params.id), body),
          "更新成功",
        ),
      {
        audit: { category: "context_library", action: "memo.folder.update" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
          sortOrder: t.Optional(t.Numeric()),
        }),
      },
    )
    .put(
      "folders/:id/move",
      async ({ currentUser, params, body }) =>
        $g.success(
          await MemoService.moveFolder(currentUser!.id, Number(params.id), body),
          "移动成功",
        ),
      {
        audit: { category: "context_library", action: "memo.folder.move" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({ parentId: t.Optional(NullableNumeric) }),
      },
    )
    .delete(
      "folders/:id",
      async ({ currentUser, params }) => {
        await MemoService.removeFolder(currentUser!.id, Number(params.id));
        return $g.success(null, "删除成功");
      },
      {
        audit: { category: "context_library", action: "memo.folder.delete" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .get(
      "",
      async ({ currentUser, query }) =>
        $g.success(
          await MemoService.list(currentUser!.id, {
            page: query.page === undefined ? undefined : Number(query.page),
            pageSize: query.pageSize === undefined ? undefined : Number(query.pageSize),
            scope: query.scope,
            novelId: query.novelId === undefined ? undefined : Number(query.novelId),
            folderId: query.folderId === undefined ? undefined : Number(query.folderId),
            keyword: query.keyword,
          }),
        ),
      {
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
          scope: t.Optional(ScopeSchema),
          novelId: t.Optional(t.Numeric()),
          folderId: t.Optional(t.Numeric()),
          keyword: t.Optional(t.String({ maxLength: 128 })),
        }),
      },
    )
    .post(
      "",
      async ({ currentUser, body }) =>
        $g.success(await MemoService.create(currentUser!.id, body), "创建成功"),
      {
        audit: { category: "context_library", action: "memo.create" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        body: t.Object({
          scope: ScopeSchema,
          novelId: t.Optional(t.Numeric()),
          folderId: t.Optional(NullableNumeric),
          title: t.String({ minLength: 1, maxLength: 128 }),
          content: t.String({ maxLength: 100000 }),
          sortOrder: t.Optional(t.Numeric()),
        }),
      },
    )
    .get(
      ":id",
      async ({ currentUser, params }) =>
        $g.success(await MemoService.detail(currentUser!.id, Number(params.id))),
      {
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .put(
      ":id",
      async ({ currentUser, params, body }) =>
        $g.success(
          await MemoService.update(currentUser!.id, Number(params.id), body),
          "更新成功",
        ),
      {
        audit: { category: "context_library", action: "memo.update" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({
          folderId: t.Optional(NullableNumeric),
          title: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
          content: t.Optional(t.String({ minLength: 1, maxLength: 20000 })),
          sortOrder: t.Optional(t.Numeric()),
        }),
      },
    )
    .delete(
      ":id",
      async ({ currentUser, params }) => {
        await MemoService.remove(currentUser!.id, Number(params.id));
        return $g.success(null, "删除成功");
      },
      {
        audit: { category: "context_library", action: "memo.delete" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    ),
);