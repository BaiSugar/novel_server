import { t } from "elysia";
import * as AiModelService from "@/app/service/aiModel/model.service";

export default $g.ctrl((app) =>
  app
    .get(
      "prompt-state/latest",
      async ({ currentUser }) =>
        $g.success(
          await AiModelService.getUserPromptState(currentUser!.id),
        ),
      { requireAuth: true },
    )
    .put(
      "prompt-state",
      async ({ currentUser, body }) =>
        $g.success(
          await AiModelService.saveUserPromptState(
            currentUser!.id,
            body,
          ),
          "已保存",
        ),
      {
        requireAuth: true,
        body: t.Object({
          categoryId: t.Numeric(),
          promptTemplateId: t.Optional(
            t.Union([t.Numeric(), t.Null()]),
          ),
        }),
      },
    ),
);