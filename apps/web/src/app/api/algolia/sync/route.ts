import { timingSafeEqual } from "node:crypto";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { z } from "zod/v4";

import { readBoundedBody } from "@/lib/read-bounded-body";
import { syncBlogSearch } from "@/lib/sync-blog-search";

const logger = new Logger("AlgoliaSync");
const eventSchema = z.object({
  _id: z.string().regex(/^[a-zA-Z0-9_.-]{1,128}$/),
  _type: z.string().min(1).max(100),
});
function authorized(request: Request) {
  const expected = env.SANITY_ALGOLIA_WEBHOOK_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || !header?.startsWith("Bearer ") || header.length > 256)
    return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function reply(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  if (!authorized(request)) {
    logger.warn("Rejected unauthorized index sync");
    return reply({ error: "Unauthorized" }, 401);
  }
  let event: z.infer<typeof eventSchema>;
  try {
    const body = await readBoundedBody(request, 4096);
    if (body === null) return reply({ error: "Request body too large" }, 413);
    const parsed = eventSchema.safeParse(
      JSON.parse(new TextDecoder().decode(body))
    );
    if (!parsed.success) return reply({ error: "Invalid event" }, 400);
    event = parsed.data;
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }
  if (
    event._type !== "blog" ||
    event._id.startsWith("drafts.") ||
    event._id.startsWith("versions.")
  ) {
    return reply({ ignored: true }, 200);
  }
  try {
    const result = await syncBlogSearch(event._id);
    logger.info("Index update queued", result);
    return reply({ queued: true, ...result }, 200);
  } catch {
    // 5xx asks Sanity to retry. Never acknowledge a failed read/write as success.
    logger.error("Index sync failed", { documentId: event._id });
    return reply({ error: "Index sync temporarily unavailable" }, 503);
  }
}
