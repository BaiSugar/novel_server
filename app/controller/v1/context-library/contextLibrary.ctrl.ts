import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import * as FolderService from "@/app/service/contextLibrary/contextFolder.service";
import * as ItemService from "@/app/service/contextLibrary/contextItem.service";
import * as SourceService from "@/app/service/contextLibrary/contextSource.service";

const NullableNumeric = t.Union([t.Numeric(), t.Null()]);
const DataSchema = t.Record(t.String(), t.Unknown());

export default $g.ctrl((app) =>
  app
    .get(
      "sources",
      async () => $g.success(await SourceService.listSources()),
      { requireAuth: true },
    )
    .get(
      "folders",
      async ({ currentUser, query }) =>
        $g.success(
          await FolderService.tree(
            currentUser!.id,
            Number(query.novelId),
            query.sourceKey,
          ),
        ),
      {
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        query: t.Object({
          novelId: t.Numeric(),
          sourceKey: t.String({ minLength: 1, maxLength: 64 }),
        }),
      },
    )
    .post(
      "folders",
      async ({ currentUser, body }) =>
        $g.success(
          await FolderService.create(currentUser!.id, body),
          "创建成功",
        ),
      {
        audit: { category: "context_library", action: "folder.create" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        body: t.Object({
          novelId: t.Numeric(),
          sourceKey: t.String({ minLength: 1, maxLength: 64 }),
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
          await FolderService.update(
            currentUser!.id,
            Number(params.id),
            body,
          ),
          "更新成功",
        ),
      {
        audit: { category: "context_library", action: "folder.update" },
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
          await FolderService.move(currentUser!.id, Number(params.id), body),
          "移动成功",
        ),
      {
        audit: { category: "context_library", action: "folder.move" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({ parentId: t.Optional(NullableNumeric) }),
      },
    )
    .delete(
      "folders/:id",
      async ({ currentUser, params }) => {
        await FolderService.remove(currentUser!.id, Number(params.id));
        return $g.success(null, "删除成功");
      },
      {
        audit: { category: "context_library", action: "folder.delete" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .get(
      "items",
      async ({ currentUser, query }) =>
        $g.success(await ItemService.list(currentUser!.id, query)),
      {
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
          novelId: t.Numeric(),
          sourceKey: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
          folderId: t.Optional(t.Numeric()),
          keyword: t.Optional(t.String({ maxLength: 128 })),
        }),
      },
    )
    .post(
      "items",
      async ({ currentUser, body }) =>
        $g.success(
          await ItemService.create(currentUser!.id, body),
          "创建成功",
        ),
      {
        audit: { category: "context_library", action: "item.create" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        body: t.Object({
          novelId: t.Numeric(),
          sourceKey: t.String({ minLength: 1, maxLength: 64 }),
          folderId: t.Optional(NullableNumeric),
          data: DataSchema,
        }),
      },
    )
    .get(
      "items/:id",
      async ({ currentUser, params, query }) =>
        $g.success(
          await ItemService.detail(
            currentUser!.id,
            Number(query.novelId),
            Number(params.id),
          ),
        ),
      {
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        query: t.Object({ novelId: t.Numeric() }),
      },
    )
    .put(
      "items/:id",
      async ({ currentUser, params, query, body }) =>
        $g.success(
          await ItemService.update(
            currentUser!.id,
            Number(query.novelId),
            Number(params.id),
            body,
          ),
          "更新成功",
        ),
      {
        audit: { category: "context_library", action: "item.update" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        query: t.Object({ novelId: t.Numeric() }),
        body: t.Object({
          folderId: t.Optional(NullableNumeric),
          data: t.Optional(DataSchema),
        }),
      },
    )
    .delete(
      "items/:id",
      async ({ currentUser, params, query }) => {
        await ItemService.remove(
          currentUser!.id,
          Number(query.novelId),
          Number(params.id),
        );
        return $g.success(null, "删除成功");
      },
      {
        audit: { category: "context_library", action: "item.delete" },
        requirePermission: PERM.CONTEXT_LIBRARY_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        query: t.Object({ novelId: t.Numeric() }),
      },
    ),
);