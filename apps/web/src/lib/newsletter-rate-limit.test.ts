import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  env: {
    NODE_ENV: "production",
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "test",
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({ env: mocks.env }));
vi.mock("@workspace/logger", () => ({
  Logger: class {
    error() {}
    warn() {}
  },
}));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn();
    limit = mocks.limit;
  },
}));

let enforce: typeof import("./newsletter-rate-limit").enforceNewsletterRateLimit;
const request = () => new Request("https://example.com/api/newsletter");

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.env.UPSTASH_REDIS_REST_TOKEN = "test";
  mocks.limit.mockResolvedValue({ success: true });
  enforce = (await import("./newsletter-rate-limit"))
    .enforceNewsletterRateLimit;
});

describe("distributed newsletter rate limit", () => {
  it("fails closed when credentials are missing", async () => {
    mocks.env.UPSTASH_REDIS_REST_TOKEN = "";
    expect((await enforce(request()))?.status).toBe(503);
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("fails closed even when the SDK reports success after a timeout", async () => {
    mocks.limit.mockResolvedValue({ success: true, reason: "timeout" });
    expect((await enforce(request()))?.status).toBe(503);
  });

  it("fails closed on Redis errors", async () => {
    mocks.limit.mockRejectedValue(new Error("network failure"));
    expect((await enforce(request()))?.status).toBe(503);
  });

  it("returns 429 with a positive Retry-After", async () => {
    mocks.limit.mockResolvedValue({
      success: false,
      reset: Date.now() + 60_000,
    });
    const response = await enforce(request());
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("allows a request approved by the shared store", async () => {
    expect(await enforce(request())).toBeNull();
  });

  it("does not trust arbitrary forwarded IP headers", async () => {
    const first = request();
    first.headers.set("x-forwarded-for", "192.0.2.1");
    const second = request();
    second.headers.set("x-forwarded-for", "192.0.2.2");
    await enforce(first);
    await enforce(second);
    expect(mocks.limit.mock.calls[0]?.[0]).toBe(mocks.limit.mock.calls[1]?.[0]);
  });

  it("uses the Vercel client IP without storing its plaintext in the rate-limit key", async () => {
    const incoming = request();
    incoming.headers.set("x-vercel-forwarded-for", "192.0.2.1");
    await enforce(incoming);
    expect(mocks.limit).toHaveBeenCalledWith(
      createHash("sha256").update("192.0.2.1").digest("hex")
    );
  });
});
