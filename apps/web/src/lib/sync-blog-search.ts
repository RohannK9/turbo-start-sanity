import "server-only";
import { env } from "@workspace/env/server";
import { client as sanity } from "@workspace/sanity/client";
import { querySearchBlogById } from "@workspace/sanity/query";

import { getAlgolia } from "@/lib/algolia";
import { toAlgoliaRecord } from "@/lib/algolia-record";

export async function syncBlogSearch(id: string) {
  // Deliveries are notifications, not snapshots. Replays read today's published
  // document; deleted and unpublished documents now return null.
  const post = await sanity
    .withConfig({
      token: env.SANITY_API_READ_TOKEN,
      perspective: "published",
      useCdn: false,
      stega: false,
      timeout: 5000,
      maxRetries: 0,
    })
    .fetch(querySearchBlogById, { id });
  const record = toAlgoliaRecord(post);
  const { client, indexName } = getAlgolia("write");
  const { taskID } = record
    ? await client.saveObject({ indexName, body: record })
    : await client.deleteObject({ indexName, objectID: id });
  // Accepted durable task, not a claim that the object is already searchable.
  return { operation: record ? "upsert" : "delete", objectID: id, taskID };
}
