import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  CRAWL_QUEUE,
  MONITOR_QUEUE,
  RENDER_QUEUE,
  type CrawlJob,
  type MonitorJob,
  type RenderJob,
} from "@web-access/shared";
import { env } from "./env";

// Lazy singletons: ioredis connects eagerly on construction, so building these at module load would
// make `next build` (and any import of the ingest route) try to reach Redis. Defer until first use.
let _connection: IORedis | null = null;
let _queue: Queue<RenderJob> | null = null;
let _crawlQueue: Queue<CrawlJob> | null = null;
let _monitorQueue: Queue<MonitorJob> | null = null;

export function getConnection(): IORedis {
  // BullMQ requires maxRetriesPerRequest: null on the shared connection.
  if (!_connection) _connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return _connection;
}

export function getRenderQueue(): Queue<RenderJob> {
  if (!_queue) _queue = new Queue<RenderJob>(RENDER_QUEUE, { connection: getConnection() });
  return _queue;
}

export function getCrawlQueue(): Queue<CrawlJob> {
  if (!_crawlQueue) _crawlQueue = new Queue<CrawlJob>(CRAWL_QUEUE, { connection: getConnection() });
  return _crawlQueue;
}

export function getMonitorQueue(): Queue<MonitorJob> {
  if (!_monitorQueue) {
    _monitorQueue = new Queue<MonitorJob>(MONITOR_QUEUE, { connection: getConnection() });
  }
  return _monitorQueue;
}
