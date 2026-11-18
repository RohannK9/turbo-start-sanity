import type { QuerySearchBlogByIdResult } from "@workspace/sanity/types";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  config: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@workspace/env/server", () => ({
  env: { SANITY_API_READ_TOKEN: "viewer" },
}));
vi.mock("@workspace/sanity/client", () => ({
  client: { withConfig: mocks.config },
}));
vi.mock("@workspace/sanity/query", () => ({
  querySearchBlogById: "published-query",
}));
vi.mock("@/lib/algolia", () => ({
  getAlgolia: () => ({
    indexName: "blog_posts",
    client: { saveObject: mocks.save, deleteObject: mocks.remove },
  }),
}));
const { syncBlogSearch } = await import("./sync-blog-search");
const { toAlgoliaRecord } = await import("./algolia-record");
const post = {
  _id: "post-1",
  _type: "blog",
  title: "Published title",
  description: "Summary",
  slug: "/blog/test",
  category: "sanity",
  image: { id: null, alt: "test", preview: null, crop: null, hotspot: null },
  authors: null,
  publishedAt: "2026-11-18",
  seoNoIndex: false,
  seoHideFromLists: false,
} satisfies NonNullable<QuerySearchBlogByIdResult>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ fetch: mocks.fetch });
  mocks.fetch.mockResolvedValue(post);
  mocks.save.mockResolvedValue({ taskID: 1 });
  mocks.remove.mockResolvedValue({ taskID: 2 });
});
it("replays replace one object and read published content without CDN or stega", async () => {
  const index = new Map();
  mocks.save.mockImplementation(async ({ body }) => {
    index.set(body.objectID, body);
    return { taskID: 1 };
  });
  await syncBlogSearch("post-1");
  mocks.fetch.mockResolvedValue({ ...post, title: "Edited title" });
  await syncBlogSearch("post-1");
  expect(index.size).toBe(1);
  expect(index.get("post-1").title).toBe("Edited title");
  expect(mocks.config).toHaveBeenCalledWith(
    expect.objectContaining({
      perspective: "published",
      useCdn: false,
      stega: false,
    })
  );
});
it.each([
  null,
  { ...post, seoNoIndex: true },
  { ...post, seoHideFromLists: true },
  { ...post, slug: null },
])("removes a missing or excluded published post: %j", async (source) => {
  mocks.fetch.mockResolvedValue(source);
  expect((await syncBlogSearch("post-1")).operation).toBe("delete");
  expect(mocks.remove).toHaveBeenCalledWith({
    indexName: "blog_posts",
    objectID: "post-1",
  });
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not delete on a Sanity outage", async () => {
  mocks.fetch.mockRejectedValue(new Error("unavailable"));
  await expect(syncBlogSearch("post-1")).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["drafts.post-1", "versions.release.post-1"])(
  "rejects draft and release records defensively: %s",
  (id) => {
    expect(toAlgoliaRecord({ ...post, _id: id })).toBeNull();
  }
);
it("does not make an unsafe external link searchable", () => {
  expect(toAlgoliaRecord({ ...post, slug: "//example.com" })).toBeNull();
});
