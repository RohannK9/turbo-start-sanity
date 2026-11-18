import { createHash } from "node:crypto";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { client } from "@workspace/sanity/client";
import { z } from "zod/v4";

import { enforceNewsletterRateLimit } from "@/lib/newsletter-rate-limit";
import { readBoundedBody } from "@/lib/read-bounded-body";

const logger = new Logger("Newsletter");
const MAX_BODY_BYTES = 4096;
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
const supportedTypes = new Set([
  "application/json",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
]);

function reply(message: string, status: number) {
  return Response.json(
    { message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function readEmail(
  body: ArrayBuffer,
  contentType: string,
  mediaType: string
): Promise<unknown> {
  if (mediaType === "application/json") {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return parsed && typeof parsed === "object" && "email" in parsed
      ? parsed.email
      : undefined;
  }
  const form = await new Response(body, {
    headers: { "Content-Type": contentType },
  }).formData();
  const emails = form.getAll("email");
  // Reject repeated fields and uploaded files instead of silently choosing a value.
  return emails.length === 1 ? emails[0] : undefined;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return reply("Cross-origin signup is not allowed.", 403);
  }
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!supportedTypes.has(mediaType)) {
    return reply("Send JSON or form data.", 415);
  }

  const limited = await enforceNewsletterRateLimit(request);
  if (limited) {
    return limited;
  }

  let email: string;
  try {
    // Check actual bytes, not just Content-Length, which a caller can omit or forge.
    const body = await readBoundedBody(request, MAX_BODY_BYTES);
    if (body === null) {
      return reply("Request body is too large.", 413);
    }
    const input = await readEmail(body, contentType, mediaType);
    const validated = emailSchema.safeParse(input);
    if (!validated.success) {
      return reply("Enter a valid email address.", 400);
    }
    email = validated.data;
  } catch {
    return reply("Invalid request body.", 400);
  }

  try {
    // Stable IDs + atomic createIfNotExists prevent duplicates even for concurrent requests.
    // The dot makes this a non-root document, hidden from unauthenticated Sanity reads.
    const id = `subscriber.${createHash("sha256").update(email).digest("hex")}`;
    await client
      .withConfig({
        token: env.SANITY_API_WRITE_TOKEN,
        useCdn: false,
        timeout: 5000,
        maxRetries: 0,
      })
      .createIfNotExists({
        _id: id,
        _type: "subscriber",
        email,
        signedUpAt: new Date().toISOString(),
      });
    // Same response for new and existing addresses; do not disclose membership.
    return reply("You're subscribed. Thank you!", 200);
  } catch {
    logger.error("Subscriber write failed", { operation: "createIfNotExists" });
    return reply(
      "Signup is temporarily unavailable. Please try again later.",
      503
    );
  }
}
