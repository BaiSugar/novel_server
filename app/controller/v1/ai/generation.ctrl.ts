import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import { AiGenerationMode } from "@/app/generated/prisma/enums";
import * as JobService from "@/app/service/aiGeneration/job.service";
import { abortGenerationJob } from "@/app/service/aiGeneration/abort";
import { emitSse } from "@/app/service/aiGeneration/stream/sseEmitter";

const SSE_HEARTBEAT_MS = (() => {
  const v = process.env.SSE_KEEPALIVE_INTERVAL_MS;
  if (v === undefined || v === "") return 15_000;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) || n < 0 ? 15_000 : n;
})();

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
    quickWriting: t.Optional(
      t.Object({
        chapterFullTextCount: t.Optional(
          t.Numeric({ minimum: 0, maximum: 20 }),
        ),
      }),
    ),
  }),
);

const EditorDiffRangeSchema = t.Object({
  start: t.Numeric({ minimum: 0 }),
  end: t.Numeric({ minimum: 0 }),
});

const EditorMultiDiffSchema = t.Object({
  mode: t.Literal("novel_multi_diff"),
  documentId: t.Optional(t.String({ maxLength: 128 })),
  docVersion: t.Optional(t.String({ maxLength: 128 })),
  baseHash: t.String({ minLength: 64, maxLength: 64 }),
  baseText: t.String({ maxLength: 60000 }),
  caretOffset: t.Optional(t.Numeric({ minimum: 0 })),
  cursorOffset: t.Optional(t.Numeric({ minimum: 0 })),
  selection: t.Optional(EditorDiffRangeSchema),
  intent: t.Optional(t.String({ maxLength: 1000 })),
});

const ChapterAutoDiffSchema = t.Object({
  mode: t.Literal("chapter_auto_diff"),
});

const EditorDiffSchema = t.Union([
  EditorMultiDiffSchema,
  ChapterAutoDiffSchema,
]);

const CategoryContextSchema = t.Object({
  categoryId: t.Numeric(),
  content: t.String({ maxLength: 16000 }),
});

export default $g.ctrl((app) =>
  app
    .post(
      "generation/stream",
      async ({ currentUser, body, request }) => {
        const { job, stream } = await JobService.createAndStart(
          currentUser!.id,
          body,
          request.signal,
        );
        return emitSse(stream, {
          heartbeatMs: SSE_HEARTBEAT_MS,
          onDisconnect: () => abortGenerationJob(job.id),
        });
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
          chapterIds: t.Optional(t.Array(t.Numeric())),
          chapterSummaryIds: t.Optional(t.Array(t.Numeric())),
          categoryContexts: t.Optional(t.Array(CategoryContextSchema)),
          metadata: MetadataSchema,
          editorDiff: t.Optional(EditorDiffSchema),
          mode: ModeSchema,
          modelId: t.Numeric(),
          temperature: t.Optional(t.Number({ minimum: 0, maximum: 2 })),
        }),
      },
    )
    .post(
      "generation/:jobId/retry",
      async ({ currentUser, body, request }) => {
        const { job, stream } = await JobService.retry(
          currentUser!.id,
          body,
          request.signal,
        );
        return emitSse(stream, {
          heartbeatMs: SSE_HEARTBEAT_MS,
          onDisconnect: () => abortGenerationJob(job.id),
        });
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
