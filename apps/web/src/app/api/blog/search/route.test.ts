import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  limit: vi.fn(),
  getClient: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/algolia", () => ({ getAlgolia: mocks.getClient }));
vi.mock("@/lib/public-rate-limit", () => ({
  enforcePublicRateLimit: mocks.limit,
}));
vi.mock("@workspace/logger", () => ({
  Logger: class {
    error = mocks.error;
  },
}));
const { GET } = await import("./route");
const request = (query: string) =>
  new Request(`https://example.com/api/blog/search?${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClient.mockReturnValue({
    client: { searchSingleIndex: mocks.search },
    indexName: "blog_posts",
  });
  mocks.limit.mockResolvedValue(null);
  mocks.search.mockResolvedValue({
    hits: [{ _id: "post-11" }],
    nbPages: 3,
    nbHits: 21,
  });
});
it("maps page two to Algolia's zero-based page and preserves the category", async () => {
  const incoming = request("q=sanity&page=2&category=sanity");
  const response = await GET(incoming);
  expect(await response.json()).toEqual({
    results: [{ _id: "post-11" }],
    page: 2,
    totalPages: 3,
    totalHits: 21,
  });
  expect(mocks.search).toHaveBeenCalledWith({
    indexName: "blog_posts",
    searchParams: expect.objectContaining({
      query: "sanity",
      page: 1,
      hitsPerPage: 10,
      facetFilters: ["category:sanity"],
    }),
  });
  expect(mocks.limit).toHaveBeenCalledWith(incoming, "search");
  expect(mocks.getClient).toHaveBeenCalledWith("search");
});
it("allows empty queries for browsing all indexed posts", async () => {
  expect((await GET(request("page=2"))).status).toBe(200);
  expect(mocks.search).toHaveBeenCalledWith(
    expect.objectContaining({
      searchParams: expect.objectContaining({ query: "", page: 1 }),
    })
  );
});
it.each([
  "page=0",
  "page=-1",
  "page=1.5",
  "page=101",
  "page=1e2",
  "page=",
  "category=unknown",
  "category=sanity%20OR%201=1",
  "q=a&q=b",
  `q=${"x".repeat(201)}`,
])("rejects invalid or unbounded input: %s", async (query) => {
  expect((await GET(request(query))).status).toBe(400);
  expect(mocks.search).not.toHaveBeenCalled();
});
it.each([429, 503])(
  "does not query Algolia when the limiter returns %s",
  async (status) => {
    mocks.limit.mockResolvedValue(new Response(null, { status }));
    expect((await GET(request("q=test"))).status).toBe(status);
    expect(mocks.search).not.toHaveBeenCalled();
  }
);
it("reports service failure without leaking credentials or returning false empty results", async () => {
  mocks.search.mockRejectedValue(new Error("private-key"));
  const response = await GET(request("q=test"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private-key");
  expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("private-key");
});
