import "server-only";
import { env } from "@workspace/env/server";
import { algoliasearch } from "algoliasearch";

// Keep the public search handler on a search-only credential.
export function getAlgolia(access: "search" | "write") {
  const appId = env.ALGOLIA_APP_ID;
  const indexName = env.ALGOLIA_INDEX_NAME;
  const key =
    access === "write" ? env.ALGOLIA_ADMIN_API_KEY : env.ALGOLIA_SEARCH_API_KEY;
  if (!(appId && indexName && key)) throw new Error("Search is not configured");
  return {
    indexName,
    client: algoliasearch(appId, key, {
      timeouts: { connect: 1000, read: 3000, write: 3000 },
    }),
  };
}
