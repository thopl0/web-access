import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { eq, inArray } from "drizzle-orm";

import { db, schema } from "./db";
import { env } from "./env";

/**
 * Object storage for the heavy binary artifacts a scan produces — full-page screenshots and cropped
 * element evidence. The bytes live OUT of Postgres (which only keeps a small `objectKey` reference):
 *
 *   - **prod** → Cloudflare R2 (S3-compatible), driven over the S3 API with `aws4fetch` for SigV4
 *     signing. Configured via the `R2_*` env vars.
 *   - **dev**  → the local filesystem under `STORAGE_DIR` (default `.data/storage`), so a developer
 *     needs no cloud bucket to run the worker + dashboard.
 *
 * The driver is auto-selected: explicit `STORAGE_DRIVER` wins; otherwise R2 when its creds are
 * present, else local. Both the Next app (image route handlers) and the standalone worker import
 * this module, so it must stay free of `server-only` and of any Next-specific APIs.
 */

export type StoredObject = { body: Buffer; contentType: string };

export interface Storage {
  /** Write (or overwrite) an object. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Read an object, or null when it doesn't exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Best-effort delete; a missing object is not an error. */
  delete(key: string): Promise<void>;
}

// --- Storage keys (deterministic, so deletion needs no extra bookkeeping) ----------------------
export const shotKey = (scanId: string): string => `shots/${scanId}.jpg`;
export const evidenceKey = (findingId: number): string => `evidence/${findingId}.png`;

/** Content type for a key, from its extension — used when reading from local disk. */
function contentTypeFor(key: string): string {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

// --- Local filesystem driver (dev) -------------------------------------------------------------
class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    // Keys are app-generated (shots/<id>, evidence/<id>) — never user input — but guard against
    // escaping the storage root regardless.
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`storage key escapes root: ${key}`);
    }
    return full;
  }

  // contentType is implied by the key's extension on read, so the local driver doesn't store it.
  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const body = await readFile(this.resolve(key));
      return { body, contentType: contentTypeFor(key) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

// --- Cloudflare R2 driver (prod) ---------------------------------------------------------------
class R2Storage implements Storage {
  private readonly client: AwsClient;
  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    private readonly base: string, // https://<endpoint>/<bucket>
  ) {
    // R2 ignores region but the SigV4 signer requires one; "auto" is the documented value.
    this.client = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  }

  private url(key: string): string {
    return `${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), {
      method: "PUT",
      // Fresh Uint8Array view so the body satisfies BodyInit (Buffer<ArrayBufferLike> does not).
      body: new Uint8Array(body),
      headers: { "Content-Type": contentType, "Content-Length": String(body.byteLength) },
    });
    if (!res.ok) {
      throw new Error(`R2 put ${key} failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const res = await this.client.fetch(this.url(key));
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`R2 get ${key} failed: ${res.status}`);
    }
    const body = Buffer.from(await res.arrayBuffer());
    return { body, contentType: res.headers.get("content-type") ?? contentTypeFor(key) };
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), { method: "DELETE" });
    // 204 = deleted, 404 = already gone; both fine.
    if (!res.ok && res.status !== 404) {
      throw new Error(`R2 delete ${key} failed: ${res.status}`);
    }
  }
}

function makeStorage(): Storage {
  const driver = env.STORAGE_DRIVER ?? (env.R2_BUCKET_NAME ? "r2" : "local");
  if (driver === "r2") {
    const { R2_ACCESS_KEY_ID, R2_ACCESS_KEY, R2_BUCKET_NAME, R2_ACCOUNT_ID, R2_API_ENDPOINT } = env;
    if (!R2_ACCESS_KEY_ID || !R2_ACCESS_KEY || !R2_BUCKET_NAME) {
      throw new Error(
        "STORAGE_DRIVER=r2 but R2_ACCESS_KEY_ID / R2_ACCESS_KEY / R2_BUCKET_NAME are not all set",
      );
    }
    // Base = the bucket's S3 URL. Cloudflare's R2_API_ENDPOINT usually already includes the bucket
    // (`…r2.cloudflarestorage.com/<bucket>`); append it only when it doesn't. Falls back to building
    // the endpoint from the account id + bucket when R2_API_ENDPOINT is unset.
    let base = R2_API_ENDPOINT?.replace(/\/+$/, "");
    if (!base) {
      if (!R2_ACCOUNT_ID) {
        throw new Error("R2 storage needs R2_API_ENDPOINT (or R2_ACCOUNT_ID) to build the endpoint");
      }
      base = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}`;
    } else if (!base.endsWith(`/${R2_BUCKET_NAME}`)) {
      base = `${base}/${R2_BUCKET_NAME}`;
    }
    return new R2Storage(R2_ACCESS_KEY_ID, R2_ACCESS_KEY, base);
  }
  return new LocalStorage(path.resolve(process.cwd(), env.STORAGE_DIR));
}

/** Process-wide storage client (one per driver config). */
export const storage: Storage = makeStorage();

/**
 * Best-effort removal of every screenshot/evidence object belonging to a site, called before its
 * rows are deleted (DB cascades don't reach object storage). Failures are swallowed — an orphaned
 * blob is harmless; a thrown error would block the user's delete.
 */
export async function purgeSiteBlobs(siteId: string): Promise<void> {
  try {
    const scanRows = await db
      .select({ id: schema.scans.id })
      .from(schema.scans)
      .where(eq(schema.scans.siteId, siteId));
    const scanIds = scanRows.map((s) => s.id);

    const findingRows = scanIds.length
      ? await db
          .select({ id: schema.findings.id })
          .from(schema.findings)
          .where(inArray(schema.findings.scanId, scanIds))
      : [];

    const keys = [
      ...scanIds.map(shotKey),
      ...findingRows.map((f) => evidenceKey(f.id)),
    ];
    await Promise.all(keys.map((k) => storage.delete(k).catch(() => {})));
  } catch {
    // Listing failed (e.g. DB hiccup) — leave the blobs; cheap to ignore for a temporary deployment.
  }
}
