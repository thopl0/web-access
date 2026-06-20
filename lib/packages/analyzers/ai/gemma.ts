/**
 * Client for Gemma 4 (`@cf/google/gemma-4-26b-a4b-it`) on **Cloudflare Workers AI**, reached through
 * an **AI Gateway** — the vision-capable Tier-3 judge GLM's coding-plan endpoint can't do (it drops
 * pixels; see `glm.ts`). Unlike `glm.ts` (Anthropic Messages format) this talks the **OpenAI-style
 * chat-completions** shape Cloudflare exposes, so it's a plain `fetch`, not the Anthropic SDK.
 *
 * Why this is safe to leave wired in unconditionally: every entry point no-ops (`gemmaConfigured()`
 * is false) until the four env vars are set, and `gemmaAsk` THROWS on any non-OK / empty response so
 * the caller (an analyzer pass under `Promise.allSettled`) swallows it — an AI outage, a truncated
 * reply, or a bad gateway token can never sink the deterministic findings.
 *
 * Config is read from `process.env` directly (like `glm.ts`): the analyzers package is standalone and
 * must not import server-only modules; the worker runs dotenv before any analyzer.
 *
 * REASONING: Gemma 4 "thinks" by default and Cloudflare's compat endpoint ignores `reasoning_effort`.
 * The only lever on this API is a prompt trick — a `<thought off>` marker in the user turn plus a
 * "do not reason" system line — which empties the `reasoning` field (verified). It's best-effort, so
 * we ALSO send a generous `max_completion_tokens`: on the rare miss the answer still completes instead
 * of being truncated to `null`. Hard cost ceiling is the gateway's spend limit, not this number.
 */
import { parseJsonObject } from "./glm";

export { parseJsonObject };

/** Default Workers AI model id. Override with `GEMMA_MODEL`. */
const DEFAULT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
/** Generous by design — must cover Gemma's reasoning tokens + the JSON answer (see header note). */
const DEFAULT_MAX_TOKENS = 384;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Appended to the caller's system prompt to suppress Gemma's chain-of-thought (best-effort). */
const NO_THINK_SYSTEM = "Do not think or reason. Respond with only the requested output, no explanation.";
/** Prepended to the user turn — the marker Gemma 4 responds to for thinking-off (see header note). */
const NO_THINK_MARKER = "<thought off>";

export interface GemmaConfig {
  accountId: string;
  gateway: string;
  model: string;
  /** Workers AI token → `Authorization: Bearer`. Runs (and bills) the model. */
  workersToken: string;
  /** AI Gateway token → `cf-aig-authorization`. Only needed when the gateway is authenticated. */
  aigToken: string | null;
  maxTokens: number;
  timeoutMs: number;
}

/** Read config from the environment, or `null` when the required vars are absent (judge no-ops). */
export function gemmaConfig(): GemmaConfig | null {
  const accountId = (process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID)?.trim();
  const gateway = process.env.CF_AI_GATEWAY?.trim();
  const workersToken = (process.env.WORKERS_AI_TOKEN || process.env.CLOUDFLARE_API_TOKEN)?.trim();
  if (!accountId || !gateway || !workersToken) return null;
  return {
    accountId,
    gateway,
    model: process.env.GEMMA_MODEL?.trim() || DEFAULT_MODEL,
    workersToken,
    aigToken: process.env.CF_AIG_TOKEN?.trim() || null,
    maxTokens: Number(process.env.GEMMA_MAX_TOKENS ?? DEFAULT_MAX_TOKENS),
    timeoutMs: Number(process.env.GEMMA_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

/** Whether the Gemma vision tier is enabled (all required env present). */
export function gemmaConfigured(): boolean {
  return gemmaConfig() !== null;
}

/** A piece of a user turn: plain text, or a base64 image for the vision model. */
export type GemmaBlock =
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mediaType?: "image/png" | "image/jpeg" | "image/webp" };

export interface GemmaAskOptions {
  /** System prompt. A no-reason instruction is appended unless `think` is true. */
  system?: string;
  model?: string;
  maxTokens?: number;
  /** Allow Gemma to emit reasoning (default false — suppressed to save tokens/latency). */
  think?: boolean;
  signal?: AbortSignal;
}

/** OpenAI content part — isolated here so the image shape is the ONLY thing to change if Cloudflare's
 *  vision format ever differs from the OpenAI standard. */
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function toContentPart(b: GemmaBlock): ContentPart {
  if (b.type === "text") return { type: "text", text: b.text };
  return { type: "image_url", image_url: { url: `data:${b.mediaType ?? "image/png"};base64,${b.base64}` } };
}

/** Build the gateway URL. The `@cf/...` model id contains `/` and `@`; Cloudflare expects it literal
 *  in the path (do NOT url-encode), matching the documented curl. */
function endpoint(cfg: GemmaConfig): string {
  return `https://gateway.ai.cloudflare.com/v1/${cfg.accountId}/${cfg.gateway}/workers-ai/${cfg.model}`;
}

/** Shape Cloudflare returns through the gateway: `{ result: { choices }, success, errors }`. We also
 *  tolerate a bare OpenAI `{ choices }` in case a direct/compat path is ever used. */
interface GemmaResponse {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: { choices?: Array<{ message?: { content?: string | null } }> };
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Send one user turn (text and/or images) and return the assistant's text. THROWS on transport,
 * HTTP, `success:false`, or an empty/truncated reply, so callers can swallow it via
 * `Promise.allSettled`. Retries once on a network error or a 429/5xx (transient), never on a 4xx.
 */
export async function gemmaAsk(blocks: GemmaBlock[], opts: GemmaAskOptions = {}): Promise<string> {
  const cfg = gemmaConfig();
  if (!cfg) throw new Error("Gemma (Cloudflare Workers AI) is not configured");

  const think = opts.think ?? false;
  const system = [opts.system, think ? null : NO_THINK_SYSTEM].filter(Boolean).join(" ").trim();

  // Prepend the thinking-off marker to the first text block (or add one) when reasoning is suppressed.
  const parts = blocks.map(toContentPart);
  if (!think) {
    const firstText = parts.find((p): p is { type: "text"; text: string } => p.type === "text");
    if (firstText) firstText.text = `${NO_THINK_MARKER} ${firstText.text}`;
    else parts.unshift({ type: "text", text: NO_THINK_MARKER });
  }

  const body = JSON.stringify({
    model: opts.model ?? cfg.model,
    max_completion_tokens: opts.maxTokens ?? cfg.maxTokens,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: parts },
    ],
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.workersToken}`,
  };
  if (cfg.aigToken) headers["cf-aig-authorization"] = `Bearer ${cfg.aigToken}`;

  const url = endpoint(cfg);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Per-attempt timeout, linked to any caller abort signal.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
      if (!res.ok) {
        // Retry transient server/rate errors once; surface client errors (4xx) immediately.
        if ((res.status === 429 || res.status >= 500) && attempt === 0) {
          lastErr = new Error(`Gemma HTTP ${res.status}`);
          continue;
        }
        throw new Error(`Gemma HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = (await res.json()) as GemmaResponse;
      if (data.success === false) {
        const msg = data.errors?.map((e) => e.message).filter(Boolean).join("; ") || "unknown error";
        throw new Error(`Gemma error: ${msg}`);
      }
      const content = (data.result?.choices ?? data.choices)?.[0]?.message?.content;
      if (!content || !content.trim()) {
        // Empty content most often means reasoning ate the whole token budget (truncation). Treat as
        // a failure so this item is skipped rather than turned into a junk finding.
        throw new Error("Gemma returned empty content (possible reasoning truncation)");
      }
      return content.trim();
    } catch (e) {
      lastErr = e;
      // A genuine 4xx / parse / empty-content error already threw above with no `continue`, so reaching
      // here on attempt 0 means a network/abort/transient error — let the loop retry once.
      if (attempt === 1) break;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
