Production website: https://roboto-assessment-kappa.vercel.app

Status: newsletter implementation prepared locally. Live newsletter verification,
Algolia search/sync, and the SEO & Index Studio tab are still outstanding.

## 1. What I built and why

The newsletter route accepts multipart browser forms, URL-encoded forms, and
JSON. It trims and lowercases addresses, validates them with Zod, and caps the
actual request body at 4 KiB. Lowercasing the local part is a deliberate
consumer-newsletter convention; technically case-sensitive mailboxes would
be treated as the same address. It does not remove plus tags or dots.

The document ID is `subscriber.` followed by the SHA-256 digest of the normalized
address. Sanity's atomic `createIfNotExists` avoids the race in a separate
lookup-then-insert flow and preserves the first signup timestamp. Both new and
existing signups return the same response. Hashing is not encryption; the dot
in the ID is the access-control distinction. Sanity's default public-dataset
permissions exclude these non-root documents from anonymous reads. Authenticated
project members can still access them. Studio displays the records read-only
and permits deletion, while creation stays behind the validated API.

Rate limiting lives in `apps/web/src/lib/newsletter-rate-limit.ts`: 5 attempts per
IP per 10-minute sliding window, backed by Upstash Redis. Shared state makes it
effective across Vercel instances; an in-memory map alone would reset or split
the allowance. The Vercel-provided `x-vercel-forwarded-for` identifies the client;
other forwarded headers are ignored. Missing/invalid IPs share a restrictive
bucket, and local development uses one shared development bucket. Hashes keep
plaintext IPs out of Redis keys, but are not anonymization. Preview and production
deployments using the same Redis share the quota. IPv6 address rotation, shared
NATs, and distributed bot traffic remain limitations of per-IP throttling.

Missing Redis configuration, errors, and timeouts return 503 without writing a
subscriber. The SDK's default timeout behavior allows requests, so the code
explicitly checks its timeout reason. Over-limit requests return 429 with
Retry-After. Cross-origin browser POSTs are rejected as an additional measure;
the route remains public, and scripts can omit Origin, so this is not authentication.

The existing shared block keeps its layout and receives a form action through
an app-level wrapper. React's action state supplies feedback and activates the
block's existing pending button. The wrapper sends FormData to `/api/newsletter`;
the API tests cover the same multipart format. No write token reaches the browser.
Provider error objects and submitted email addresses are not logged or returned.

## 2. What I noticed

- The supplied setup document specifies Node 22.12+ and pnpm 10.32.1, whereas
  this fork's baseline requires Node 24+ and pnpm 11.24.0. I followed the checked-in
  package manifest and lockfile.
- The default Sanity API version is computed from the current date. That may
  be a starter convenience, but it makes API behavior change without a code
  change. The assessment's environment examples pin `2026-11-18`.
- The assessment says `/benchmark/nesting` already contains a newsletter block.
  A read of this project's published dataset found only `hero`, `cta`,
  `featureCardsIcon`, and `faqAccordion` on that page. The actual content needs
  a Subscribe Newsletter block added and published before browser verification.
- Subscriber emails need protection even though blog content is public. The
  non-root document IDs are intentional; manual subscriber creation is hidden
  in Studio to avoid creating a public root-level document accidentally.
- Vercel runs Studio's postinstall during the workspace install. Supplying only
  the web project ID leaves a Studio CLI warning, even if the web build succeeds.
  The optional Presentation E2E variables are unrelated to production signup.
- The existing lint configuration reports a deprecation notice, and the smoke
  test has an existing `innerText` warning. Those are separate from this feature.

## 3. What I'd do with more time

After finishing the required search and Studio tasks, add email ownership
verification/double opt-in before treating this as a real mailing list. Signup
currently stores addresses only, as requested. Add abuse monitoring and consider
an additional site-wide budget or challenge if distributed spam becomes a problem.
Define retention and unsubscribe behavior before collecting real subscribers.

References: [Sanity IDs and paths](https://www.sanity.io/docs/content-lake/ids),
[Vercel request headers](https://vercel.com/docs/headers/request-headers),
[Upstash timeout behavior](https://upstash.com/docs/redis/sdks/ratelimit-ts/features).
