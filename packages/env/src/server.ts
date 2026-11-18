import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

const env = createEnv({
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },

  server: {
    SANITY_API_READ_TOKEN: z.string().min(1),
    SANITY_API_WRITE_TOKEN: z.string().min(1),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    ALGOLIA_APP_ID: z.string().regex(/^[A-Za-z0-9]+$/).optional(),
    ALGOLIA_INDEX_NAME: z.string().min(1).optional(),
    ALGOLIA_ADMIN_API_KEY: z.string().min(1).optional(),
    ALGOLIA_SEARCH_API_KEY: z.string().min(1).optional(),
    SANITY_ALGOLIA_WEBHOOK_SECRET: z.string().min(32).optional(),
    SANITY_REVALIDATE_SECRET: z.string().min(1).optional(),
    SANITY_CONTEXT_ENDPOINT: z.url().optional(),
    SANITY_CONTEXT_TOKEN: z.string().min(1).optional(),
  },

  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },

  // Treat empty env strings (e.g. `SANITY_REVALIDATE_SECRET=` in .env.example)
  // as unset, so `.optional()` vars don't fail `.min(1)` on a blank value.
  emptyStringAsUndefined: true,

  extends: [vercel()],
});

export { env };
