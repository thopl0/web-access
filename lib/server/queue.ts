import { Queue } from "bullmq";
import IORedis from "ioredis";
import { RENDER_QUEUE, type RenderJob } from "@web-access/shared";
import { env } from "./env";

// Lazy singletons: ioredis connects eagerly on construction, so building these at module load would
// make `next build` (and any import of the ingest route) try to reach Redis. Defer until first use.
let _connection: IORedis | null = null;
let _queue: Queue<RenderJob> | null = null;

export function getConnection(): IORedis {
  // BullMQ requires maxRetriesPerRequest: null on the shared connection.
  if (!_connection) _connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return _connection;
}

export function getRenderQueue(): Queue<RenderJob> {
  if (!_queue) _queue = new Queue<RenderJob>(RENDER_QUEUE, { connection: getConnection() });
  return _queue;
}
