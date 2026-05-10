import { treaty } from "@elysia/eden";
import type { APP } from "../app/index.ts";

const client = treaty<APP>("localhost:3000");

export async function runClientSmoke() {
  // (await client.id({ id: 1 }).get()).data;
  (await client.test.post({ a: 1 })).data;
  (await client.success.post()).data;
}
