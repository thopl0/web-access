/**
 * Client for GLM (Zhipu AI) — the model behind the Tier-3 "AI judge" (plan §2).
 *
 * GLM **Coding Plan** keys are served through GLM's *Anthropic-compatible* Messages API
 * (`{base}/v1/messages`), not the pay-as-you-go OpenAI-compatible `/paas/v4` endpoint — so we talk
 * to it with the official `@anthropic-ai/sdk` pointed at GLM's base URL, authenticating with a
 * Bearer token (the coding-plan key). The wire format, retries, and error types are the SDK's.
 *
 * Config is read from `process.env` directly rather than `lib/server/env.ts` on purpose: the
 * analyzers package is standalone (consumed by the worker via `@web-access/analyzers`) and must not
 * import server-only modules. The worker imports `lib/server/env` first, which runs dotenv's
 * `config()`, so `process.env.GLM_*` is populated by the time any analyzer runs.
 */
import Anthropic from "@anthropic-ai/sdk";

/** Anthropic-compatible base URL. International ("z.ai") vs mainland ("bigmodel.cn") — override via
 *  env. The SDK appends `/v1/messages`. */
const DEFAULT_BASE_URL = "https://api.z.ai/api/anthropic";
/** Text reasoning model (judgments without pixels). */
const DEFAULT_TEXT_MODEL = "glm-4.6";
/** Vision model (alt-text fidelity / decorative misclassification need the actual pixels). */
const DEFAULT_VISION_MODEL = "glm-4.5v";
/** Messages API requires max_tokens; our judges emit a one-line JSON verdict, so keep it small. */
const DEFAULT_MAX_TOKENS = 1024;

export interface GlmConfig {
  /** Coding-plan key, sent as a Bearer token. */
  apiKey: string;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  maxTokens: number;
  /** Per-request timeout, ms. */
  timeoutMs: number;
}

/** Read config from the environment, or `null` when no key is set (AI checks then no-op). */
export function glmConfig(): GlmConfig | null {
  const apiKey = process.env.GLM_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.GLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
    textModel: process.env.GLM_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL,
    visionModel: process.env.GLM_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL,
    maxTokens: Number(process.env.GLM_MAX_TOKENS ?? DEFAULT_MAX_TOKENS),
    timeoutMs: Number(process.env.GLM_TIMEOUT_MS ?? 30000),
  };
}

/** Whether the AI tier is enabled (a key is present). */
export function aiConfigured(): boolean {
  return glmConfig() !== null;
}

// NOTE: image input is supported by `glmAsk` (GlmBlock `image`) for a future vision-capable
// provider, but GLM's coding-plan Anthropic endpoint silently DROPS images (the model then
// hallucinates — verify with `pnpm tsx scripts/ai-vision-check.ts`). The Tier-3 judge is therefore
// text-only today; don't send image blocks through this endpoint expecting them to be seen.

let cached: Anthropic | null = null;
function getClient(cfg: GlmConfig): Anthropic {
  if (!cached) {
    cached = new Anthropic({
      // Coding-plan keys authenticate via Bearer (Authorization), not x-api-key.
      authToken: cfg.apiKey,
      baseURL: cfg.baseUrl,
      timeout: cfg.timeoutMs,
      maxRetries: 1,
    });
  }
  return cached;
}

/** A piece of a prompt: plain text, or a base64-encoded image for the vision model. */
export type GlmBlock =
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mediaType?: "image/png" | "image/jpeg" | "image/webp" };

export interface GlmAskOptions {
  /** System prompt. */
  system?: string;
  /** Defaults to the configured text model; pass the vision model for image prompts. */
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Send a single user turn (text and/or images) and return the assistant's text. Throws on
 * transport/HTTP errors so the caller (an analyzer pass) can swallow it via `Promise.allSettled` —
 * an AI outage must never sink the deterministic findings.
 */
export async function glmAsk(blocks: GlmBlock[], opts: GlmAskOptions = {}): Promise<string> {
  const cfg = glmConfig();
  if (!cfg) throw new Error("GLM_API_KEY is not set");

  const content: Anthropic.ContentBlockParam[] = blocks.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : {
          type: "image",
          source: { type: "base64", media_type: b.mediaType ?? "image/png", data: b.base64 },
        },
  );

  const res = await getClient(cfg).messages.create(
    {
      model: opts.model ?? cfg.textModel,
      max_tokens: opts.maxTokens ?? cfg.maxTokens,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content }],
    },
    opts.signal ? { signal: opts.signal } : undefined,
  );

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Parse a JSON object out of a model response. Models often wrap JSON in prose or ```json fences,
 * so we extract the first balanced object.
 */
export function parseJsonObject<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object in model response: ${candidate.slice(0, 200)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
