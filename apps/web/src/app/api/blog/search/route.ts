import { Logger } from "@workspace/logger";

import { getAlgolia } from "@/lib/algolia";
import type { BlogSearchRecord } from "@/lib/algolia-record";
import { BLOG_CATEGORIES } from "@/lib/blog-categories";
import type { BlogSearchResponse } from "@/lib/blog-search-response";
import { enforcePublicRateLimit } from "@/lib/public-rate-limit";

const logger = new Logger("BlogSearch");
const PAGE_SIZE = 10;
const MAX_PAGE = 100;
function error(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const pageParam = params.get("page") ?? "1";
  const page = Number(pageParam);
  if (
    ["q", "category", "page"].some((key) => params.getAll(key).length > 1) ||
    query.length > 200 ||
    !/^[1-9][0-9]{0,2}$/.test(pageParam) ||
    page > MAX_PAGE ||
    !BLOG_CATEGORIES.some((option) => option.value === category)
  ) {
    return error("Invalid search parameters", 400);
  }
  const limited = await enforcePublicRateLimit(request, "search");
  if (limited) return limited;
  try {
    const { client, indexName } = getAlgolia("search");
    const result = await client.searchSingleIndex<BlogSearchRecord>({
      indexName,
      searchParams: {
        query: query.trim(),
        page: page - 1,
        hitsPerPage: PAGE_SIZE,
        // Values come from the schema taxonomy, never arbitrary filter syntax.
        facetFilters: category ? [`category:${category}`] : [],
        attributesToHighlight: [],
        attributesToSnippet: [],
      },
    });
    const body: BlogSearchResponse = {
      results: result.hits,
      page,
      totalPages: Math.min(result.nbPages ?? 0, MAX_PAGE),
      totalHits: result.nbHits ?? 0,
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logger.error("Algolia search failed");
    // An outage isn't an empty result set. Fetching the full Sanity dataset as a
    // fallback would recreate the scaling problem this endpoint removes.
    return error(
      "Search is temporarily unavailable. Please try again later.",
      503
    );
  }
}
