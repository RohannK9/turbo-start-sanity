import type { QuerySearchBlogByIdResult } from "@workspace/sanity/types";
import type { IndexSettings } from "algoliasearch";

export const BLOG_INDEX_SETTINGS = {
  searchableAttributes: ["title", "description", "authors.name"],
  attributesForFaceting: ["filterOnly(category)"],
  customRanking: ["desc(publishedAtTimestamp)"],
  paginationLimitedTo: 1000,
} satisfies IndexSettings;

export function toAlgoliaRecord(post: QuerySearchBlogByIdResult) {
  if (
    !post ||
    post._id.startsWith("drafts.") ||
    post._id.startsWith("versions.") ||
    post.seoNoIndex === true ||
    post.seoHideFromLists === true ||
    !post.title?.trim() ||
    !post.slug?.startsWith("/") ||
    post.slug.startsWith("//")
  )
    return null;
  const { seoNoIndex: _noIndex, seoHideFromLists: _hidden, ...card } = post;
  const timestamp = Date.parse(post.publishedAt ?? "");
  return {
    ...card,
    objectID: post._id,
    publishedAtTimestamp: Number.isFinite(timestamp) ? timestamp : 0,
  };
}
export type BlogSearchRecord = NonNullable<ReturnType<typeof toAlgoliaRecord>>;
