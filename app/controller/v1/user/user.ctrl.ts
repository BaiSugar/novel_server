import { t } from "elysia";
import * as UserService from "@/app/service/user/user.service";

export default $g.ctrl((app) =>
  app
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
      async ({ params }) => $g.success(await UserService.detail(Number(params.id))),
      {
        requireAuth: true,
        params: t.Object({
          id: t.Numeric(),
        }),
      },
    ),
);