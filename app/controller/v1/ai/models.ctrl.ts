import { t } from "elysia";
import * as AiModelService from "@/app/service/aiModel/model.service";

export default $g.ctrl((app) =>
  app
    .get(
      "models",
      async ({ currentUser }) =>
        $g.success({
          items: await AiModelService.listPublicModels(),
          lastSelected: await AiModelService.getUserModelState(currentUser!.id),
        }),
      { requireAuth: true },
    )
    .get(
      "models/:id",
      async ({ params }) =>
        $g.success(await AiModelService.publicModelDetail(Number(params.id))),
      {
        requireAuth: true,
        params: t.Object({ id: t.Numeric() }),
      },
    ),
);
