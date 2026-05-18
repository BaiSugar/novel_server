import { t } from "elysia";
import { PERM } from "@/app/common/permission";
import {
  AiConversationStatus,
  AiGenerationMode,
} from "@/app/generated/prisma/enums";
import * as ConversationService from "@/app/service/aiGeneration/conversation.service";
import * as MessageService from "@/app/service/aiGeneration/message.service";

const ModeSchema = t.Optional(
  t.Union([
    t.Literal(AiGenerationMode.STANDARD),
    t.Literal(AiGenerationMode.AGENT),
  ]),
);

const MetadataSchema = t.Optional(
  t.Union([
    t.Object({
      novelId: t.Optional(t.Numeric()),
      chapterId: t.Optional(t.Numeric()),
      promptTemplateId: t.Optional(t.Numeric()),
      scene: t.Optional(t.String({ maxLength: 64 })),
    }),
    t.Null(),
  ]),
);

export default $g.ctrl((app) =>
  app
    .get(
      "conversations",
      async ({ currentUser, query }) =>
        $g.success(await ConversationService.list(currentUser!.id, query)),
      {
        requirePermission: PERM.AI_CONVERSATION_MANAGE,
        query: t.Object({
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
          status: t.Optional(
            t.Union([
              t.Literal(AiConversationStatus.ACTIVE),
              t.Literal(AiConversationStatus.ARCHIVED),
            ]),
          ),
          novelId: t.Optional(t.Numeric()),
          chapterId: t.Optional(t.Numeric()),
          keyword: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "conversations",
      async ({ currentUser, body }) =>
        $g.success(
          await ConversationService.create(currentUser!.id, body),
          "创建成功",
        ),
      {
        audit: { category: "ai", action: "conversation.create" },
        requirePermission: PERM.AI_CONVERSATION_MANAGE,
        body: t.Object({
          title: t.Optional(t.String({ maxLength: 128 })),
          mode: ModeSchema,
          modelId: t.Numeric(),
          systemPrompt: t.Optional(
            t.Union([t.String({ maxLength: 8000 }), t.Null()]),
          ),
          metadata: MetadataSchema,
        }),
      },
    )
    .get(
      "conversations/:id",
      async ({ currentUser, params }) =>
        $g.success(
          await ConversationService.detail(currentUser!.id, Number(params.id)),
        ),
      {
        requirePermission: PERM.AI_CONVERSATION_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .patch(
      "conversations/:id",
      async ({ currentUser, params, body }) =>
        $g.success(
          await ConversationService.update(
            currentUser!.id,
            Number(params.id),
            body,
          ),
          "更新成功",
        ),
      {
        audit: { category: "ai", action: "conversation.update" },
        requirePermission: PERM.AI_CONVERSATION_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({
          title: t.Optional(t.String({ maxLength: 128 })),
          mode: ModeSchema,
          modelId: t.Optional(t.Numeric()),
          systemPrompt: t.Optional(
            t.Union([t.String({ maxLength: 8000 }), t.Null()]),
          ),
          metadata: MetadataSchema,
        }),
      },
    )
    .delete(
      "conversations/:id",
      async ({ currentUser, params }) =>
        $g.success(
          await ConversationService.softDelete(
            currentUser!.id,
            Number(params.id),
          ),
          "删除成功",
        ),
      {
        audit: { category: "ai", action: "conversation.delete" },
        requirePermission: PERM.AI_CONVERSATION_MANAGE,
        params: t.Object({ id: t.Numeric() }),
      },
    )
    .post(
      "conversations/:id/archive",
      async ({ currentUser, params, body }) =>
        $g.success(
          await ConversationService.setArchived(
            currentUser!.id,
            Number(params.id),
            body.archived,
          ),
          "操作成功",
        ),
      {
        audit: { category: "ai", action: "conversation.archive" },
        requirePermission: PERM.AI_CONVERSATION_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        body: t.Object({ archived: t.Boolean() }),
      },
    )
    .get(
      "conversations/:id/messages",
      async ({ currentUser, params, query }) =>
        $g.success(
          await MessageService.list(currentUser!.id, Number(params.id), query),
        ),
      {
        requirePermission: PERM.AI_CONVERSATION_MANAGE,
        params: t.Object({ id: t.Numeric() }),
        query: t.Object({
          cursor: t.Optional(t.Numeric()),
          limit: t.Optional(t.Numeric()),
          includeSuperseded: t.Optional(t.BooleanString()),
        }),
      },
    )
    .delete(
      "conversations/:id/messages/:messageId",
      async ({ currentUser, params }) =>
        $g.success(
          await MessageService.deleteUserMessage(
            currentUser!.id,
            Number(params.id),
            Number(params.messageId),
          ),
          "删除成功",
        ),
      {
        audit: { category: "ai", action: "message.delete" },
        requirePermission: PERM.AI_CONVERSATION_MANAGE,
        params: t.Object({ id: t.Numeric(), messageId: t.Numeric() }),
      },
    ),
);
