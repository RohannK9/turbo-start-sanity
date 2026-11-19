export type SeoDocument = {
  title?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoNoIndex?: boolean;
  seoHideFromLists?: boolean;
  slug?: { current?: string };
  image?: { asset?: { _ref?: string } };
  seoImage?: { asset?: { _ref?: string } };
};

function fallback(override?: string, original?: string) {
  return override?.trim() ? override : (original ?? "");
}

export function seoPreview(doc: SeoDocument) {
  const title = fallback(doc.seoTitle, doc.title);
  const description = fallback(doc.seoDescription, doc.description);
  return {
    title,
    description,
    titleSet: title.trim().length > 0,
    // These bounds match the existing blog description schema warnings.
    descriptionValid: description.length >= 140 && description.length <= 160,
    hasImage: Boolean(doc.seoImage?.asset?._ref || doc.image?.asset?._ref),
    noIndex: doc.seoNoIndex === true,
  };
}

export function exclusionReason(doc: SeoDocument | null) {
  if (!doc) return "This post is not published.";
  if (doc.seoNoIndex) return "The published post has Do Not Index enabled.";
  if (doc.seoHideFromLists)
    return "The published post has Hide From Lists enabled.";
  if (!doc.title?.trim()) return "The published post has no title.";
  const slug = doc.slug?.current;
  if (!slug?.startsWith("/") || slug.startsWith("//"))
    return "The published post has no valid local URL.";
  return null;
}

export function indexAssessment(published: SeoDocument | null, found: boolean) {
  const reason = exclusionReason(published);
  if (reason)
    return {
      tone: found ? ("critical" as const) : ("positive" as const),
      message: found
        ? `Out of sync: found in Algolia. ${reason}`
        : `Not found in Algolia, as expected. ${reason}`,
    };
  return {
    tone: found ? ("positive" as const) : ("critical" as const),
    message: found
      ? "Found in Algolia. This published post is eligible for search."
      : "Out of sync: published and eligible, but missing from Algolia. Check webhook deliveries.",
  };
}

export function previewUrl(base: string | undefined, slug: string | undefined) {
  if (!base) return "Set SANITY_STUDIO_PRESENTATION_URL to preview the URL.";
  try {
    const origin = new URL(base).origin;
    return slug?.startsWith("/") && !slug.startsWith("//")
      ? `${origin}${slug}`
      : `${origin}/blog/your-post`;
  } catch {
    return "The presentation URL is invalid.";
  }
}
