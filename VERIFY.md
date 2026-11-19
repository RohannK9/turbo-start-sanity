# Verification

Production URL: https://roboto-assessment-kappa.vercel.app/

These results were collected on my Mac against my Sanity project (`lw22l8jn`,
`production`) and Algolia index (`988QB05RUC`, `blog_posts`). The earlier search
HTTP requests below were made against localhost; the Studio recording section
also includes a production draft-exclusion search. Production deployment of the
latest Studio changes and real Sanity webhook deliveries are not yet evidenced
in this file.

## Newsletter browser check

I added the Subscribe Newsletter block to `/benchmark/nesting`, submitted
`newsletter-test@example.com`, and submitted the same address again. I checked
Studio and confirmed there was only one subscriber record.

This is a manual observation; I have not attached a browser recording or a
Sanity query result for this check. No email delivery is implemented or claimed.

An initial browser submission hit a Next.js compilation error:

```text
Route segment config "runtime" is not compatible with `nextConfig.cacheComponents`. Please remove it.
```

I removed `export const runtime = "nodejs"` from the newsletter route. Submission
then worked. The full production build shown below subsequently passed. This
caught a framework configuration problem that the unit tests had not caught.

## Algolia backfill and settings

From the repository root, I ran:

```sh
pnpm --filter web search:backfill --dry-run
```

Actual output:

```text
$ node --env-file=.env --import tsx scripts/backfill-algolia.ts --dry-run
{"index":"blog_posts","scanned":21,"eligible":21}
```

I then ran:

```sh
pnpm --filter web search:backfill
```

Actual output:

```text
$ node --env-file=.env --import tsx scripts/backfill-algolia.ts
{"index":"blog_posts","scanned":21,"eligible":21}
{
  "complete": true,
  "indexed": 21,
  "searchableAttributes": [
    "title",
    "description",
    "authors.name"
  ],
  "attributesForFaceting": [
    "filterOnly(category)"
  ]
}
```

I ran the same command a second time:

```sh
pnpm --filter web search:backfill
```

Actual output:

```text
$ node --env-file=.env --import tsx scripts/backfill-algolia.ts
{"index":"blog_posts","scanned":21,"eligible":21}
{
  "complete": true,
  "indexed": 21,
  "searchableAttributes": [
    "title",
    "description",
    "authors.name"
  ],
  "attributesForFaceting": [
    "filterOnly(category)"
  ]
}
```

Both runs completed with 21 records submitted. The settings readback confirms
that title, description and author name are searchable, and category is a
filter-only facet. The subsequent search response reported 21 total hits after
the repeated backfill. This verifies repeated backfilling, not repeated webhook
delivery; webhook replay is a separate check still pending.

## Local search: page two

I started the apps from the repository root:

```sh
npx --yes pnpm@11.24.0 dev
```

From a second terminal:

```sh
curl -sS 'http://localhost:3000/api/blog/search?page=2'
```

The response contained ten records. Selected metadata from the actual response:

```json
{"page":2,"totalPages":3,"totalHits":21}
```

The ten returned titles and categories were:

| Title | Category |
| --- | --- |
| Polarised User-facing Monitoring | sanity |
| Quality-focused Content-based Intranet | sanity |
| Enhanced 24 hour Structure | nextjs |
| Adaptive Mobile Projection | nextjs |
| Secured Systematic Capacity | skills |
| Open-architected Mobile Microservice | seo |
| Phased Secondary Monitoring | nextjs |
| User-centric Fault-tolerant Forecast | aeo |
| Innovative Demand-driven Hardware | seo |
| Optimized Discrete Benchmark | nextjs |

All ten object IDs were distinct, and none had a drafts. or versions. prefix.
This demonstrates a populated second page. It does not establish draft exclusion
for a deliberately created unpublished test post, or prove that page one and
page two never overlap; those require their own checks.

## Local search: matching and excluding a category

Command:

```sh
curl -sS 'http://localhost:3000/api/blog/search?q=Polarised&category=sanity'
```

Selected fields from the actual response (image data, author data and other
record fields are omitted here for readability):

```json
{
  "results": [
    {
      "objectID": "683c64a2-cc65-4517-8dc9-2718064e4931",
      "title": "Polarised User-facing Monitoring",
      "category": "sanity"
    }
  ],
  "page": 1,
  "totalPages": 1,
  "totalHits": 1
}
```

Command:

```sh
curl -sS 'http://localhost:3000/api/blog/search?q=Polarised&category=nextjs'
```

Actual response:

```json
{"results":[],"page":1,"totalPages":0,"totalHits":0}
```

The same query includes the Sanity-category post when filtering for sanity and
excludes it when filtering for nextjs. This proves filtering at the HTTP API;
interactive website filtering and search pagination still need recorded evidence.

My first attempt used `q=sanity&category=sanity` and returned zero hits. That was
not a useful positive filter test: category is filter-only, so the query text
must also match a title, description or author name. I changed the test to a
known title term. A category-only request was also attempted, but the captured
output was cut off, so it is not used as complete evidence here.

## Lint and TypeScript

From the repository root:

```sh
pnpm exec turbo run lint check-types
```

Actual final output excerpt:

```text
 Tasks:    17 successful, 17 total
Cached:    17 cached, 17 total
  Time:    53ms >>> FULL TURBO
```

This invocation reused all 17 cached results. It reported the existing Biome
configuration deprecation notice and the existing smoke test's innerText warning.
Neither was a failing check.

## Automated tests

Command:

```sh
pnpm --filter web test
```

Actual output excerpt:

```text
 ✓ src/lib/seo.test.ts (5 tests) 4ms
 ✓ src/lib/sync-blog-search.test.ts (9 tests) 6ms
 ✓ src/lib/newsletter-rate-limit.test.ts (7 tests) 35ms
 ✓ src/app/api/blog/search/route.test.ts (15 tests) 20ms
 ✓ src/app/api/algolia/sync/route.test.ts (15 tests) 21ms
 ✓ src/app/api/newsletter/route.test.ts (18 tests) 25ms

 Test Files  6 passed (6)
      Tests  69 passed (69)
   Start at  01:36:43
   Duration  273ms (transform 316ms, setup 0ms, import 517ms, tests 111ms, environment 0ms)
```

Sanity, Redis and Algolia service boundaries are mocked in the unit tests.
These tests exercise validation, authentication, duplicate IDs, exclusion and
removal logic, failures, pagination, and category forwarding. They do not replace
live webhook delivery evidence. Vitest also reported a non-failing notice about
__dirname in the existing Vite configuration.

## Full Next.js production build

Command:

```sh
pnpm --filter web build
```

Actual output excerpts:

```text
$ next build
▲ Next.js 16.4.5 (Turbopack)
- Environments: .env
✓ Running next.config.ts took 312ms
- Cache Components enabled
- Partial Prefetching enabled

  Creating an optimized production build ...
✓ Compiled successfully in 9.6s
  Running TypeScript ...
  Finished TypeScript in 4.4s ...
  Collecting page data using 7 workers ...
✓ Collecting page data using 7 workers in 1234ms
✓ Generating static pages using 7 workers (46/46) in 1799ms
  Finalizing page optimization ...
✓ Finalizing page optimization in 22ms
```

The route output included:

```text
├ ƒ /api/algolia/sync
├ ƒ /api/blog/search
├ ƒ /api/newsletter
```

This was a full local production build, including static page generation, not
compile-only mode. Node emitted localStorage experimental warnings during page
data collection, but the build completed and returned to the shell. A successful
local build does not by itself prove the deployed site's behaviour.

## Studio recording — verification items 7 and 8

Recorded on 19 November 2026 after reviewing the Studio view/schema, shared
Sanity queries, search API, and Algolia synchronization code.

Recording: [Captioned Studio demonstration (local MP4)](https://drive.google.com/file/d/1oH82QXvjWNI7GrmAtDSjHM_NcJihkXkW/view?usp=sharing)



Environment: local Sanity Studio at `http://localhost:3333`, connected to project
`lw22l8jn`, dataset `production`, and the real Algolia `blog_posts` index.
Capture: Playwright 1.64.1 page screencast, 1600 × 1000 at 25 fps. The MP4 adds a
120-pixel caption band below the viewport. The extra static ending from encoder
finalization was trimmed; editor actions remain continuous and at normal speed.

The completed take asserted and captured:

- Editor and SEO & Index side by side for the same published post.
- Title updates while typing, including intermediate counts of 5 and 9, then
  `Live SEO preview demo` at 21 characters.
- Clearing the title override restores `Roboto Webhook Verification Updated
  part 2` at 42 characters.
- `A short description.` fails at 20 characters; the supplied 154-character
  description passes. Adding/removing `!` produces 154 → 155 → 154.
- These changes occur without publishing, navigation, or index refresh during
  typing. The recording's first index request occurs at 96.60 seconds.
- The published post shows `Found in Algolia` with Object ID
  `d705b32a-980c-4aa3-8849-4f601727fe27`.
- Studio navigation opens `Roboto Recording Draft` in the same browser page.
  Its distinct Object ID is `3d6c5938-21b0-4751-8256-b2818eb8c2ad`, and the panel
  shows `Not found in Algolia, as expected. This post is not published.`

The recorded lookups returned HTTP 200. The draft response was:

```json
{
  "results": [null],
  "message": "ObjectID 3d6c5938-21b0-4751-8256-b2818eb8c2ad does not exist. "
}
```

Preparation exposed a response-handling bug: the panel rejected every response
with a `message`, including this legitimate missing-object result. The reader
now accepts this exact message only when it matches the requested ID and the
single result is null. Other messages, malformed responses, authentication
failures, and network failures still produce unknown membership. No requests
or UI results were mocked for the recording.

Validation for that fix:

```sh
node --experimental-strip-types --test apps/studio/components/seo-index/seo-index.test.mjs
pnpm --filter studio check-types
pnpm exec biome lint apps/studio/components/seo-index/read-index.ts apps/studio/components/seo-index/seo-index.test.mjs
pnpm exec biome format apps/studio/components/seo-index/read-index.ts apps/studio/components/seo-index/seo-index.test.mjs
```

All six tests passed, TypeScript passed, and the two changed files passed lint
and format checks. Node reported its existing module-type warning, and Biome
reported the existing configuration deprecation notice.

Independent inspection commands and actual outputs:

```sh
pnpm --filter web search:inspect d705b32a-980c-4aa3-8849-4f601727fe27
```

```json
{
  "found": true,
  "objectID": "d705b32a-980c-4aa3-8849-4f601727fe27",
  "title": "Roboto Webhook Verification Updated part 2"
}
```

```sh
pnpm --filter web search:inspect 3d6c5938-21b0-4751-8256-b2818eb8c2ad
```

```json
{
  "found": false,
  "objectID": "3d6c5938-21b0-4751-8256-b2818eb8c2ad"
}
```

Separately, entering `Roboto Recording Draft` in the production website's blog
search triggered this request:

```text
GET https://roboto-assessment-kappa.vercel.app/api/blog/search?q=Roboto+Recording+Draft&category=&page=1
HTTP 200
```

```json
{"results":[],"page":1,"totalPages":0,"totalHits":0}
```

The screenshot, response, per-scene screenshots, timing log, and restoration
readback are retained locally in `apps/web/recordings/evidence/`.

After recording, both SEO overrides were restored to their original unset
state. The temporary draft of the published verification post was removed only
after confirming its content matched the original; its published revision did
not change. `Roboto Recording Draft` remains present only as an unpublished
`drafts.` document. No demonstration changes were published.

## Remaining assessment evidence

These items are pending; they are not claimed as passed:

- Real Sanity webhook configuration and delivery history against the deployed URL.
- Publish a test blog and show it appears in Algolia.
- Publish an edit and show the same object ID has the updated content.
- Unpublish/delete and show the object disappears.
- Replay the same webhook delivery and prove it leaves one entry.
- Send an unauthenticated request to the deployed webhook and capture its rejection.
- Exercise category filtering and pagination through the website itself.
- Verify deployed search, newsletter signup and rate-limit behaviour.
- Deploy and verify the latest Studio SEO & Index view, including the lookup fix.
- Upload the completed local Studio recording and add an accessible sharing link.
- Other out-of-sync discrepancy states were not demonstrated in this recording.

Replace the relevant pending items with actual commands, responses, delivery
records and the recording link as each is completed. The PageSpeed bonus has
not been attempted.
