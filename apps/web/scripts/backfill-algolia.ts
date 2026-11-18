import { createClient } from "@sanity/client";
import { env as publicEnv } from "@workspace/env/client";
import { env } from "@workspace/env/server";
import { querySearchBlogBatch } from "@workspace/sanity/query";
import { algoliasearch } from "algoliasearch";

import {
  BLOG_INDEX_SETTINGS,
  type BlogSearchRecord,
  toAlgoliaRecord,
} from "../src/lib/algolia-record";

async function main() {
  const { ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, ALGOLIA_INDEX_NAME } = env;
  if (!(ALGOLIA_APP_ID && ALGOLIA_ADMIN_API_KEY && ALGOLIA_INDEX_NAME)) {
    throw new Error("Missing Algolia configuration");
  }
  const source = createClient({
    projectId: publicEnv.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: publicEnv.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: publicEnv.NEXT_PUBLIC_SANITY_API_VERSION ?? "2026-11-18",
    token: env.SANITY_API_READ_TOKEN,
    useCdn: false,
    perspective: "published",
    timeout: 10_000,
    maxRetries: 2,
  });
  const records: BlogSearchRecord[] = [];
  let afterId = "";
  let scanned = 0;
  while (true) {
    const batch = await source.fetch(querySearchBlogBatch, { afterId });
    const last = batch.at(-1);
    if (!last) break;
    scanned += batch.length;
    for (const post of batch) {
      const record = toAlgoliaRecord(post);
      if (record) records.push(record);
    }
    afterId = last._id;
  }
  console.log(
    JSON.stringify({
      index: ALGOLIA_INDEX_NAME,
      scanned,
      eligible: records.length,
    })
  );
  if (process.argv.includes("--dry-run")) return;

  const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
  const indexName = ALGOLIA_INDEX_NAME;
  // Read the complete source before changing Algolia. Failed reads must not erase the index.
  const settings = await client.setSettings({
    indexName,
    indexSettings: BLOG_INDEX_SETTINGS,
  });
  await client.waitForTask({
    indexName,
    taskID: settings.taskID,
    maxRetries: 30,
  });
  // Replacing through a temporary index also removes orphaned records. Run with
  // publishing paused: a concurrent webhook write can be overwritten by the swap.
  await client.replaceAllObjects({
    indexName,
    objects: records,
    batchSize: 100,
    maxRetries: 30,
  });
  const actual = await client.getSettings({ indexName });
  console.log(
    JSON.stringify(
      {
        complete: true,
        indexed: records.length,
        searchableAttributes: actual.searchableAttributes,
        attributesForFaceting: actual.attributesForFaceting,
      },
      null,
      2
    )
  );
}

main().catch(() => {
  // SDK exceptions may contain headers. The failed stage can be inspected locally
  // without printing credentials into terminal recordings or CI logs.
  console.error(
    "Backfill failed. Check configuration, service access and task status before rerunning."
  );
  process.exitCode = 1;
});
