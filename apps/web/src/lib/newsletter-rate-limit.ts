import { enforcePublicRateLimit } from "@/lib/public-rate-limit";

export function enforceNewsletterRateLimit(request: Request) {
  return enforcePublicRateLimit(request, "newsletter");
}
