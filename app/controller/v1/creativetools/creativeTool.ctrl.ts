import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import { CreativeToolIcon } from "@/app/generated/prisma/enums";
import * as CreativeToolService from "@/app/service/creativeTool/creativeTool.service";

const IconSchema = t.Union([
  t.Literal(CreativeToolIcon.SPARKLES),
  t.Literal(CreativeToolIcon.BOOK),
  t.Literal(CreativeToolIcon.BADGE),
  t.Literal(CreativeToolIcon.FILE),
  t.Literal(CreativeToolIcon.LIST),
  t.Literal(CreativeToolIcon.TRIANGLE),
  t.Literal(CreativeToolIcon.GEM),
  t.Literal(CreativeToolIcon.PAPERCLIP),
  t.Literal(CreativeToolIcon.USER),
  t.Literal(CreativeToolIcon.MASK),
  t.Literal(CreativeToolIcon.GLOBE),
  t.Literal(CreativeToolIcon.LINES),
  t.Literal(CreativeToolIcon.IMAGE),
]);

export default $g.ctrl((app) =>
  app
    // ---- 创意工具列表 ----
    .get(
      "",
      async ({ query }) => $g.success(await CreativeToolService.list(query)),
      {
        requireAuth: true,
        query: t.Object({
          categoryId: t.Optional(t.Numeric()),
        }),
      },
    )
    // ---- 创建创意工具 ----
    .post(
      "",
      async ({ body }) =>
        $g.success(await CreativeToolService.create(body), "创建成功"),
      {
        audit: { category: "creative_tool", action: "create" },
        requirePermission: PERM.CREATIVE_TOOL_MANAGE,
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 64 }),
          description: t.String({ minLength: 1, maxLength: 255 }),
          icon: IconSchema,
          categoryId: t.Optional(t.Union([t.Numeric(), t.Null()])),
          isNew: t.Optional(t.Boolean()),
          order: t.Optional(t.Numeric()),
        }),
      },
    )
    // ---- 更新创意工具 ----
    .put(
      ":id",
      async ({ params, body }) =>
        $g.success(
          await CreativeToolService.update(Number(params.id), body),
          "更新成功",
        ),
      {
        audit: { category: "creative_tool", action: "update" },
        requirePermission: PERM.CREATIVE_TOOL_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
          description: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
          icon: t.Optional(IconSchema),
          categoryId: t.Optional(t.Union([t.Numeric(), t.Null()])),
          isNew: t.Optional(t.Boolean()),
          order: t.Optional(t.Numeric()),
        }),
      },
    )
    // ---- 删除创意工具 ----
    .delete(
      ":id",
      async ({ params }) => {
        await CreativeToolService.remove(Number(params.id));
        return $g.success(null, "删除成功");
      },
      {
        audit: { category: "creative_tool", action: "delete" },
        requirePermission: PERM.CREATIVE_TOOL_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    ),
);
