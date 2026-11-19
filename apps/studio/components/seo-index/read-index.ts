export type SearchConfig = {
  appId: string;
  indexName: string;
  searchKey: string;
};

export async function readIndexMembership(
  config: SearchConfig,
  objectID: string,
  signal: AbortSignal
) {
  const response = await fetch(
    `https://${config.appId}.algolia.net/1/indexes/*/objects`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": config.appId,
        "X-Algolia-API-Key": config.searchKey,
      },
      body: JSON.stringify({
        requests: [
          {
            indexName: config.indexName,
            objectID,
            attributesToRetrieve: ["objectID"],
          },
        ],
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error("Index check failed");
  const body: unknown = await response.json();
  // A null result means missing. Auth, network, missing-index and malformed
  // responses must not masquerade as evidence that the document isn't indexed.
  if (
    !body ||
    typeof body !== "object" ||
    "message" in body ||
    !("results" in body) ||
    !Array.isArray(body.results) ||
    body.results.length !== 1
  ) {
    throw new Error("Unexpected index response");
  }
  const record: unknown = body.results[0];
  if (record === null) return false;
  if (
    record &&
    typeof record === "object" &&
    "objectID" in record &&
    record.objectID === objectID
  )
    return true;
  throw new Error("Unexpected index record");
}
