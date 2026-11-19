import assert from "node:assert/strict";
import { test } from "node:test";

import { indexAssessment, previewUrl, seoPreview } from "./model.ts";
import { readIndexMembership } from "./read-index.ts";

const published = { title: "Post", slug: { current: "/blog/post" } };

test("SEO overrides take precedence; empty overrides fall back", () => {
  const doc = {
    ...published,
    description: "a".repeat(140),
    image: { asset: { _ref: "image-main" } },
  };
  assert.equal(seoPreview(doc).title, "Post");
  assert.equal(seoPreview(doc).hasImage, true);
  assert.equal(seoPreview({ ...doc, seoTitle: "Custom" }).title, "Custom");
  assert.equal(seoPreview({ ...doc, seoTitle: " " }).title, "Post");
  assert.equal(
    seoPreview({ ...doc, seoDescription: "Override" }).description,
    "Override"
  );
  assert.equal(
    seoPreview({ seoImage: { asset: { _ref: "image-seo" } } }).hasImage,
    true
  );
  assert.equal(seoPreview({}).hasImage, false);
});

test("description checks use inclusive schema bounds", () => {
  for (const [length, valid] of [
    [139, false],
    [140, true],
    [160, true],
    [161, false],
  ]) {
    assert.equal(
      seoPreview({ description: "a".repeat(length) }).descriptionValid,
      valid
    );
  }
  assert.equal(seoPreview({ title: " " }).titleSet, false);
});

test("displayed edits update preview without changing published eligibility", () => {
  const draft = { ...published, seoTitle: "Typing now", seoNoIndex: true };
  assert.equal(seoPreview(draft).title, "Typing now");
  assert.equal(seoPreview(draft).noIndex, true);
  assert.equal(indexAssessment(published, true).tone, "positive");
  assert.equal(indexAssessment(draft, true).tone, "critical");
});

test("membership discrepancies are reported for published and excluded posts", () => {
  assert.equal(indexAssessment(published, false).tone, "critical");
  assert.equal(indexAssessment(null, true).tone, "critical");
  assert.equal(indexAssessment(null, false).tone, "positive");
  for (const doc of [
    { ...published, seoNoIndex: true },
    { ...published, seoHideFromLists: true },
    { ...published, title: "" },
    { ...published, slug: { current: "//outside.test" } },
  ]) {
    assert.equal(indexAssessment(doc, true).tone, "critical");
    assert.equal(indexAssessment(doc, false).tone, "positive");
  }
});

test("preview URL uses configured origin and a local path", () => {
  assert.equal(
    previewUrl("https://site.test", "/blog/post"),
    "https://site.test/blog/post"
  );
  assert.equal(
    previewUrl("https://site.test", "//other.test"),
    "https://site.test/blog/your-post"
  );
});

test("membership reader distinguishes missing records from provider failures", async (t) => {
  const config = {
    appId: "APP",
    indexName: "blog_posts",
    searchKey: "test-search-only",
  };
  const signal = new AbortController().signal;
  const mock = t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).requests, [
      {
        indexName: "blog_posts",
        objectID: "post-id",
        attributesToRetrieve: ["objectID"],
      },
    ]);
    return Response.json({ results: [{ objectID: "post-id" }] });
  });
  assert.equal(await readIndexMembership(config, "post-id", signal), true);
  mock.mock.mockImplementation(async () => Response.json({ results: [null] }));
  assert.equal(await readIndexMembership(config, "post-id", signal), false);
  mock.mock.mockImplementation(async () =>
    Response.json({
      results: [null],
      message: "ObjectID post-id does not exist. ",
    })
  );
  assert.equal(await readIndexMembership(config, "post-id", signal), false);
  for (const body of [
    { message: "Index missing", results: [null] },
    { message: "ObjectID other-id does not exist. ", results: [null] },
    {
      message: "ObjectID post-id does not exist. ",
      results: [{ objectID: "post-id" }],
    },
    { results: [] },
    { results: [{ objectID: "other" }] },
  ]) {
    mock.mock.mockImplementation(async () => Response.json(body));
    await assert.rejects(readIndexMembership(config, "post-id", signal));
  }
  mock.mock.mockImplementation(async () => new Response(null, { status: 403 }));
  await assert.rejects(readIndexMembership(config, "post-id", signal));
  mock.mock.mockImplementation(async () => {
    throw new Error("network");
  });
  await assert.rejects(readIndexMembership(config, "post-id", signal));
});
