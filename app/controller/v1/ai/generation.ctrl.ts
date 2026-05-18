import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import { AiGenerationMode } from "@/app/generated/prisma/enums";
import * as JobService from "@/app/service/aiGeneration/job.service";
import { emitSse } from "@/app/service/aiGeneration/stream/sseEmitter";

const ModeSchema = t.Union([
  t.Literal(AiGenerationMode.STANDARD),
  t.Literal(AiGenerationMode.AGENT),
]);

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
      "generation/stream",
      async ({ currentUser, body, request }) => {
        const { stream } = await JobService.createAndStart(
          currentUser!.id,
          body,
          request.signal,
        );
        return emitSse(stream);
      },
      {
        audit: { category: "ai", action: "generation.start" },
        requirePermission: PERM.AI_GENERATION_INVOKE,
        requireRateLimit: { windowSeconds: 60, maxRequests: 20 },
        body: t.Object({
          conversationId: t.Optional(t.Numeric()),
          userMessage: t.Optional(t.String({ minLength: 1, maxLength: 16000 })),
          promptTemplateIds: t.Optional(t.Array(t.Numeric())),
          promptInputs: t.Optional(t.Record(t.String(), t.Unknown())),
          contextItemIds: t.Optional(t.Array(t.Numeric())),
          metadata: MetadataSchema,
          mode: ModeSchema,
          modelId: t.Numeric(),
          temperature: t.Optional(
            t.Number({ minimum: 0, maximum: 2 }),
          ),
        }),
      },
    )
    .post(
      "generation/:jobId/retry",
      async ({ currentUser, body, request }) => {
        const { stream } = await JobService.retry(
          currentUser!.id,
          body,
          request.signal,
        );
        return emitSse(stream);
      },
      {
        audit: { category: "ai", action: "generation.retry" },
        requirePermission: PERM.AI_GENERATION_INVOKE,
        requireRateLimit: { windowSeconds: 60, maxRequests: 20 },
        params: t.Object({ jobId: t.Numeric() }),
        body: t.Object({
          targetMessageId: t.Numeric(),
        }),
      },
    )
    .post(
      "generation/:jobId/cancel",
      async ({ currentUser, params }) =>
        $g.success(
          await JobService.cancel(currentUser!.id, Number(params.jobId)),
          "已取消",
        ),
      {
        audit: { category: "ai", action: "generation.cancel" },
        requirePermission: PERM.AI_GENERATION_INVOKE,
        params: t.Object({ jobId: t.Numeric() }),
      },
    )
    .get(
      "generation/:jobId",
      async ({ currentUser, params }) =>
        $g.success(
          await JobService.detail(currentUser!.id, Number(params.jobId)),
        ),
      {
        requirePermission: PERM.AI_GENERATION_INVOKE,
        params: t.Object({ jobId: t.Numeric() }),
      },
    ),
);
