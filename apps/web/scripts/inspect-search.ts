import { env } from "@workspace/env/server";
import { algoliasearch } from "algoliasearch";

async function main() {
  const { ALGOLIA_APP_ID, ALGOLIA_INDEX_NAME, ALGOLIA_SEARCH_API_KEY } = env;
  const objectID = process.argv[2];
  if (
    !(
      ALGOLIA_APP_ID &&
      ALGOLIA_INDEX_NAME &&
      ALGOLIA_SEARCH_API_KEY &&
      objectID
    )
  ) {
    throw new Error("Supply a document ID and configure the search-only key");
  }
  const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY);
  try {
    const record = await client.getObject<{ objectID: string; title: string }>({
      indexName: ALGOLIA_INDEX_NAME,
      objectID,
    });
    console.log(
      JSON.stringify(
        { found: true, objectID: record.objectID, title: record.title },
        null,
        2
      )
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 404
    ) {
      console.log(JSON.stringify({ found: false, objectID }, null, 2));
      return;
    }
    throw error;
  }
}
main().catch(() => {
  console.error(
    "Index check failed. This is not evidence that the post is missing. Check credentials and connectivity."
  );
  process.exitCode = 1;
});
