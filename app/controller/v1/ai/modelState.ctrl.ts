import { t } from "elysia";
import * as AiModelService from "@/app/service/aiModel/model.service";

export default $g.ctrl((app) =>
  app
    .get(
      "model-state/latest",
      async ({ currentUser }) =>
        $g.success(
          await AiModelService.getUserModelState(currentUser!.id),
        ),
      { requireAuth: true },
    )
    .put(
      "model-state",
      async ({ currentUser, body }) =>
        $g.success(
          await AiModelService.saveUserModelState(
            currentUser!.id,
            body,
          ),
          "已保存",
        ),
      {
        requireAuth: true,
        body: t.Object({
          modelId: t.Numeric(),
          temperature: t.Optional(
            t.Union([t.Number({ minimum: 0, maximum: 2 }), t.Null()]),
          ),
        }),
      },
    ),
);