import { z } from "zod/v4";

// These values ship in Studio's browser bundle. Use ONLY a search-only key.
const schema = z.object({
  appId: z.string().regex(/^[a-zA-Z0-9]+$/),
  indexName: z.string().min(1),
  searchKey: z.string().min(1),
});

export function getStudioSearchConfig() {
  return schema.safeParse({
    appId: process.env.SANITY_STUDIO_ALGOLIA_APP_ID,
    indexName: process.env.SANITY_STUDIO_ALGOLIA_INDEX_NAME,
    searchKey: process.env.SANITY_STUDIO_ALGOLIA_SEARCH_KEY,
  });
}
