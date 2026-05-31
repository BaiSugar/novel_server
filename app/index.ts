import { Elysia } from "elysia";

const { bootstrapAdmin } = await import("@/app/bootstrap/admin");
await bootstrapAdmin();

const { default: plugins } = await import("@/app/plugins/index.plug");
const app = new Elysia().use(plugins).listen(process.env.PORT!);

export type APP = typeof app;
