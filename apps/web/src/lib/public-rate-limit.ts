import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";

const logger = new Logger("PublicRateLimit");
type Service = "newsletter" | "search";
const limiters: Partial<Record<Service, Ratelimit>> = {};
const limits = {
  newsletter: { requests: 5, window: "10 m" },
  search: { requests: 60, window: "1 m" },
} as const;

function unavailable() {
  return Response.json(
    { message: "Service is temporarily unavailable. Please try again later." },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    }
  );
}

export async function enforcePublicRateLimit(
  request: Request,
  service: Service
) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!(url && token)) {
    logger.error("Rate limit storage is not configured");
    return unavailable();
  }

  // Vercel supplies this header. Never fall back to a caller-provided IP header.
  // Missing/invalid IPs share one bucket, rather than bypassing the limit.
  const forwarded = request.headers.get("x-vercel-forwarded-for")?.trim();
  const identifier =
    env.NODE_ENV === "development"
      ? "local-development"
      : forwarded && isIP(forwarded)
        ? forwarded
        : "unknown";
  const key = createHash("sha256").update(identifier).digest("hex");

  try {
    limiters[service] ??= new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(
        limits[service].requests,
        limits[service].window
      ),
      prefix: `roboto:${service}:v1`,
      analytics: false,
      ephemeralCache: false,
      timeout: 2000,
    });
    const result = await limiters[service].limit(key);
    // The SDK allows timed-out requests by default; public requests must fail closed.
    if (result.reason === "timeout") {
      logger.warn("Rate limit storage timed out");
      return unavailable();
    }
    if (!result.success) {
      return Response.json(
        { message: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(
              Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
            ),
          },
        }
      );
    }
    return null;
  } catch {
    // Do not log SDK error objects, which can contain request credentials.
    logger.error("Rate limit storage request failed");
    return unavailable();
  }
}
