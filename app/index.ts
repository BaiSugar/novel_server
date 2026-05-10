import { Elysia } from "elysia";
import { bootstrapAdmin } from "@/app/bootstrap/admin";
import { applyMigrations } from "@/app/bootstrap/migrate";
import plugins from "@/app/plugins/index.plug";

await applyMigrations();
await bootstrapAdmin();

const app = new Elysia().use(plugins).listen(process.env.PORT!);

export type APP = typeof app;
