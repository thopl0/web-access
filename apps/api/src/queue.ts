import { Queue } from "bullmq";
import IORedis from "ioredis";
import { RENDER_QUEUE, type RenderJob } from "@web-access/shared";
import { env } from "./env.js";

// BullMQ requires maxRetriesPerRequest: null on the shared connection.
export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const renderQueue = new Queue<RenderJob>(RENDER_QUEUE, { connection });
