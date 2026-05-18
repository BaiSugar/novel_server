import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import * as ImageService from "@/app/service/aiGeneration/image.service";

const MetadataSchema = t.Optional(
  t.Object({
    novelId: t.Optional(t.Numeric()),
    chapterId: t.Optional(t.Numeric()),
    promptTemplateId: t.Optional(t.Numeric()),
    scene: t.Optional(t.String({ maxLength: 64 })),
  }),
);

export default $g.ctrl((app) =>
  app
    .post(
      "images",
      async ({ currentUser, body, request }) =>
        $g.success(
          await ImageService.createAndRun(
            currentUser!.id,
            body,
            request.signal,
          ),
          "生成完成",
        ),
      {
        audit: { category: "ai", action: "image.generate" },
        requirePermission: PERM.AI_IMAGE_GENERATE,
        requireRateLimit: { windowSeconds: 60, maxRequests: 10 },
        body: t.Object({
          modelId: t.Numeric(),
          prompt: t.Optional(t.String({ minLength: 1, maxLength: 16000 })),
          promptTemplateId: t.Optional(t.Numeric()),
          promptInputs: t.Optional(t.Record(t.String(), t.Unknown())),
          contextItemIds: t.Optional(t.Array(t.Numeric())),
          metadata: MetadataSchema,
          size: t.Optional(t.String({ maxLength: 32 })),
          quality: t.Optional(t.String({ maxLength: 32 })),
          n: t.Optional(t.Numeric()),
          clientRequestId: t.Optional(t.String({ maxLength: 64 })),
        }),
      },
    )
    .get(
      "images/:jobId",
      async ({ currentUser, params }) =>
        $g.success(
          await ImageService.detail(currentUser!.id, Number(params.jobId)),
        ),
      {
        requirePermission: PERM.AI_IMAGE_GENERATE,
        params: t.Object({ jobId: t.Numeric() }),
      },
    ),
);
